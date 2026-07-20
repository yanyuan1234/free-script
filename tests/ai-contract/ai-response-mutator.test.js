// ========================================
// AIResponseMutator 单元测试
// Run: node tests/ai-contract/ai-response-mutator.test.js
// ========================================
var fs = require('fs');
var vm = require('vm');
var path = require('path');

// schema.js 引用 utils.js 中的全局常量，Node 环境补齐
if (typeof DEFAULT_MAX_TOKENS === 'undefined') global.DEFAULT_MAX_TOKENS = 32768;
if (typeof DEFAULT_CONTEXT_SIZE === 'undefined') global.DEFAULT_CONTEXT_SIZE = 32000;
if (typeof safeInt !== 'function') {
    global.safeInt = function(v, defaultVal) {
        if (v === null || v === undefined || v === '') return defaultVal || 0;
        var n = parseInt(v, 10);
        return isNaN(n) ? (defaultVal || 0) : n;
    };
}
if (typeof parseProgressParts !== 'function') {
    global.parseProgressParts = function(progress) {
        if (!progress) return { current: 0, total: 1 };
        var parts = String(progress).split('/');
        if (parts.length === 2) {
            return { current: global.safeInt(parts[0], 0), total: global.safeInt(parts[1], 1) };
        }
        var n = parseInt(progress, 10);
        return { current: isNaN(n) ? 0 : n, total: 1 };
    };
}

function loadScript(relativePath) {
    var fullPath = path.join(__dirname, relativePath);
    var code = fs.readFileSync(fullPath, 'utf8');
    vm.runInThisContext(code, { filename: fullPath });
}

loadScript('../../js/state/schema.js');
loadScript('../../js/state/state-manager.js');
loadScript('../../js/state/mutators/bag-mutator.js');
loadScript('../../js/state/mutators/quest-mutator.js');
loadScript('../../js/state/mutators/character-mutator.js');
loadScript('../../js/state/mutators/time-mutator.js');
loadScript('../../js/state/mutators/location-mutator.js');
loadScript('../../js/state/mutators/relationship-mutator.js');
loadScript('../../js/state/mutators/currency-mutator.js');
loadScript('../../js/ai-contract/output-sanitizer.js');
loadScript('../../js/ai-contract/ai-response-mutator.js');

function assertEq(a, b, msg) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        throw new Error(msg + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
    }
}

function reset() {
    StateManager.init();
}

// 测试 1：成功应用完整数据
reset();
var parsed = {
    success: true,
    data: {
        story: '你走进酒馆。',
        title: '酒馆',
        player: { name: '艾文', identity: '游侠', stats: [{ name: '生命', value: 100 }] },
        characters: [{ name: '老板', favor: 10 }],
        bag: [{ name: '面包', count: 2 }],
        currency: 50,
        quests: [{ title: '寻找失踪的猫', status: '进行中' }],
        gameTime: { date: '第1日', time: '傍晚', period: '傍晚' },
        locations: [{ name: '酒馆', desc: '热闹的集市中心' }],
        keyEvents: [{ title: '进入酒馆' }],
        hud: { hp: 100 }
    }
};
var result = AIResponseMutator.apply(parsed);
assertEq(result.success, true, 'apply success');
// 【阶段2】_applyTurn 不再递增（避免与 game.js legacy 路径双倍递增），仅同步镜像
assertEq(StateManager.get('progress.turn'), 0, 'turn not advanced by mutator (legacy handles)');
assertEq(StateManager.get('progress.sceneTitle'), '酒馆', 'scene title');
assertEq(StateManager.get('entities.player').name, '艾文', 'player name');
assertEq(StateManager.get('entities.bag')[0].name, '面包', 'bag item');
assertEq(StateManager.get('entities.currency'), 50, 'currency');
assertEq(StateManager.get('entities.quests')[0].title, '寻找失踪的猫', 'quest title');
// 【设计变更】AIResponseMutator 不再写 gameTime，统一由 GameTimeSystem.parseFromAI 作为
// 时间写入的唯一入口（避免与 game.js 双写），所以 time.period 不会被这里更新
// assertEq(StateManager.get('time').period, '傍晚', 'time period');
assertEq(StateManager.get('entities.locations')[0].name, '酒馆', 'location');
assertEq(StateManager.get('ui.lastHUD').hp, 100, 'hud');

// 测试 2：解析失败时不写入
reset();
var failResult = AIResponseMutator.apply({ success: false });
assertEq(failResult.success, false, 'fail apply returns false');
assertEq(StateManager.get('progress.turn'), 0, 'no turn advance on fail');

// 测试 3：关系变化
reset();
StateManager.set('entities.characters', [{ name: '老板', favor: 0 }]);
AIResponseMutator.apply({
    success: true,
    data: { relationships: [{ name: '老板', delta: 5 }] }
});
assertEq(StateManager.get('entities.characters')[0].favor, 5, 'relationship delta');

// 测试 4：过滤非地点
reset();
AIResponseMutator.apply({
    success: true,
    data: { locations: ['阳光', '依靠触觉', '森林'] }
});
assertEq(StateManager.get('entities.locations').length, 1, 'filter invalid locations');
assertEq(StateManager.get('entities.locations')[0].name, '森林', 'valid location kept');

// 测试 5：[Mufy 三层记忆] memoryUpdates 按 layer 分流
reset();
// 模拟 EnhancedMemory，避免依赖 tavern-compat.js 的浏览器环境
var capturedShortTerm = [];
var capturedMilestones = [];
var capturedLongTerm = [];
global.EnhancedMemory = {
    _shortTermEntries: [],
    _milestoneEntries: [],
    permanentFacts: { settings: [] },
    addShortTermMemory: function(content, turn) {
        capturedShortTerm.push({ content: content, turn: turn });
        return { archived: false };
    },
    addMilestone: function(content, options) {
        capturedMilestones.push({ content: content, options: options });
        return { content: content };
    },
    upsertPermanentFact: function(category, fact) {
        capturedLongTerm.push({ category: category, content: fact.content });
        return 'added';
    },
    _cachedInjection: null,
    _cachedInjectionTurn: -1,
    _ltmDirty: false
};
AIResponseMutator.apply({
    success: true,
    data: {
        memoryUpdates: [
            // 【BUG-T1 修复】原 fixture 内容"短期事实"/"里程碑事件"/"长期事实"过短（<10 字符），
            // 被 _applyMemoryUpdates 的 MIN_CONTENT_LENGTH=10 校验跳过，导致 capturedShortTerm.length=0。
            // 改为更长的中文 fixture（>10 字符），与生产环境实际写入行为保持一致。
            { op: 'add', category: 'settings', layer: 'shortTerm', importance: 5, content: '玩家在第三章受了重伤' },
            { op: 'add', category: 'promises', layer: 'milestone', importance: 8, content: '完成了主线任务第一章的剧情' },
            { op: 'add', category: 'npcProfiles', layer: 'longTerm', importance: 6, content: '酒馆老板是退役的北方剑士' }
        ]
    }
});
assertEq(capturedShortTerm.length, 1, 'shortTerm captured');
assertEq(capturedShortTerm[0].content, '玩家在第三章受了重伤', 'shortTerm content');
assertEq(capturedMilestones.length, 1, 'milestone captured');
assertEq(capturedMilestones[0].content, '完成了主线任务第一章的剧情', 'milestone content');
assertEq(capturedLongTerm.length, 1, 'longTerm captured');
assertEq(capturedLongTerm[0].content, '酒馆老板是退役的北方剑士', 'longTerm content');
delete global.EnhancedMemory;

console.log('AIResponseMutator tests passed');
