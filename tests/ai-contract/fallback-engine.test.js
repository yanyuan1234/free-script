// ========================================
// FallbackEngine 单元测试
// Run: node tests/ai-contract/fallback-engine.test.js
// ========================================
global.StateManager = {
    set: function(path, value, options) {
        this.lastPath = path;
        this.lastValue = value;
        this.lastOptions = options;
    },
    reset: function() {
        this.lastPath = null;
        this.lastValue = null;
        this.lastOptions = null;
    }
};
global.gameState = {};
global.LocalGameAPI = {
    configs: [
        { id: 'model-a' },
        { id: 'model-b' },
        { id: 'model-c' }
    ],
    getModelConfigs: function() { return this.configs; }
};

var FallbackEngine = require('../../js/ai-contract/fallback-engine.js');

function assertEq(a, b, msg) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        throw new Error(msg + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
    }
}

function assertTrue(v, msg) {
    if (!v) throw new Error(msg + ': expected truthy, got ' + JSON.stringify(v));
}

// 测试 1：直接成功不重试
var successCalled = 0;
var direct = FallbackEngine.execute(function(modelId) {
    successCalled++;
    return Promise.resolve({ model: modelId, text: 'ok' });
}, { modelId: 'model-a' });

direct.then(function(r) {
    assertEq(r.text, 'ok', 'direct result');
    assertEq(successCalled, 1, 'direct called once');

    // 测试 2：失败后重试成功
    var failCount = 0;
    return FallbackEngine.execute(function(modelId) {
        failCount++;
        if (failCount < 2) return Promise.reject(new Error('fail'));
        return Promise.resolve({ text: 'retry-ok' });
    }, { modelId: 'model-a' });
}).then(function(r) {
    assertEq(r.text, 'retry-ok', 'retry result');

    // 测试 3：重试耗尽后切换模型
    var usedModels = [];
    return FallbackEngine.execute(function(modelId) {
        usedModels.push(modelId);
        return Promise.reject(new Error('always fail'));
    }, { modelId: 'model-a' });
}).then(function() {
    throw new Error('should reject');
}).catch(function(e) {
    assertTrue(e.message === 'always fail', 'final error preserved');

    // 测试 4：nextModel 选择下一个可用模型
    var next = FallbackEngine.nextModel('model-a', []);
    assertEq(next, 'model-b', 'next model');

    var skip = FallbackEngine.nextModel('model-a', ['model-b']);
    assertEq(skip, 'model-c', 'skip failed');

    var none = FallbackEngine.nextModel('model-a', ['model-b', 'model-c']);
    assertEq(none, null, 'no model left');

    // 测试 5：degradeMode 降级纯文本
    StateManager.reset();
    FallbackEngine.degradeMode();
    assertEq(StateManager.lastPath, 'world.pureTextMode', 'degrade path');
    assertEq(StateManager.lastValue, true, 'degrade value');
    assertEq(gameState.pureTextMode, true, 'degrade gameState');

    console.log('FallbackEngine tests passed');
}).catch(function(e) {
    console.error('FallbackEngine tests failed:', e.message);
    process.exit(1);
});
