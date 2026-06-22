// ========================================
// ContextManager 单元测试
// Run: node tests/ai-contract/context-manager.test.js
// ========================================
var ContextManager = require('../../js/ai-contract/context-manager.js');

// mock StateManager / gameState
var _state = {
    progress: { conversationHistory: [], rollingSummary: '' },
    world: { contextSize: 8000, maxTokens: 4096 }
};
global.StateManager = {
    get: function(path) {
        var parts = path.split('.');
        var cur = _state;
        for (var i = 0; i < parts.length; i++) cur = cur[parts[i]];
        return JSON.parse(JSON.stringify(cur));
    },
    set: function(path, value, options) {
        var parts = path.split('.');
        var cur = _state;
        for (var i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
        cur[parts[parts.length - 1]] = JSON.parse(JSON.stringify(value));
    }
};

global.estimateTokensUtil = function(text) { return Math.ceil((text || '').length / 1.7); };
global.estimateTokensForMessagesUtil = function(messages) {
    var total = 0;
    for (var i = 0; i < messages.length; i++) total += (messages[i].content || '').length;
    return Math.ceil(total / 1.7);
};

function assertEq(a, b, msg) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        throw new Error(msg + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
    }
}

function reset() {
    _state.progress.conversationHistory = [];
    _state.progress.rollingSummary = '';
}

// 测试 1：空历史构建消息
reset();
var msgs = ContextManager.buildMessages('前进', { systemPrompt: 'sys' });
assertEq(msgs.length, 2, 'empty history messages count');
assertEq(msgs[0].role, 'system', 'system role');
assertEq(msgs[1].content, '前进', 'user content');

// 测试 2：追加用户和 AI 回复
reset();
ContextManager.appendUser(' left');
ContextManager.appendAssistant('raw', { storyText: '你向左走。' });
assertEq(_state.progress.conversationHistory.length, 2, 'history length after append');
assertEq(_state.progress.conversationHistory[0].role, 'user', 'history user role');
assertEq(_state.progress.conversationHistory[1].content, '你向左走。', 'assistant content stored');

// 测试 3：buildMessages 包含历史
var msgs2 = ContextManager.buildMessages('再前进', { systemPrompt: 'sys' });
assertEq(msgs2.length, 4, 'messages with history count');
assertEq(msgs2[1].content, ' left', 'history user');
assertEq(msgs2[2].content, '你向左走。', 'history assistant');
assertEq(msgs2[3].content, '再前进', 'current user');

// 测试 4：压缩历史保留最近轮次
reset();
for (var i = 0; i < 10; i++) {
    ContextManager.appendUser('act' + i);
    ContextManager.appendAssistant('raw' + i, { storyText: 'result' + i });
}
var rounds = ContextManager._toRounds(_state.progress.conversationHistory);
assertEq(rounds.length <= 6, true, 'history compressed to max rounds');
assertEq(_state.progress.rollingSummary.length > 0, true, 'rolling summary generated');

// 测试 5：estimateTokens
var t = ContextManager.estimateTokens([{ content: 'abcdef' }]);
assertEq(t >= 3, true, 'estimate tokens positive');

console.log('ContextManager tests passed');
