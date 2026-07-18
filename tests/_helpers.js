// ========================================
// 测试辅助：构造一个最小可用的 StateManager 替身
// 仅供 Node 单元测试使用，不参与线上运行
// ========================================

var StateSchema = require('../js/state/schema.js');

// schema.js 引用 utils.js 中的全局常量，Node 环境补齐
if (typeof global.DEFAULT_MAX_TOKENS === 'undefined') global.DEFAULT_MAX_TOKENS = 32768;
if (typeof global.DEFAULT_CONTEXT_SIZE === 'undefined') global.DEFAULT_CONTEXT_SIZE = 32000;

// utils.js 中的工具函数，部分 mutator（如 quest-mutator）会引用全局 parseProgressParts
// 测试环境注入最小实现，与 utils.js 行为一致
if (typeof global.safeInt !== 'function') {
    global.safeInt = function(v, defaultVal) {
        if (v === null || v === undefined || v === '') return defaultVal || 0;
        var n = parseInt(v, 10);
        return isNaN(n) ? (defaultVal || 0) : n;
    };
}
if (typeof global.parseProgressParts !== 'function') {
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

// 创建一个隔离的 StateManager 替身，避免相互污染
function createFakeStateManager(initialState) {
    var state = initialState || StateSchema.getDefaultState();

    var listeners = [];

    function clone(v) {
        if (v === null || typeof v !== 'object') return v;
        return JSON.parse(JSON.stringify(v));
    }

    function getByPath(root, path) {
        if (!path) return clone(root);
        var parts = path.split('.');
        var cur = root;
        for (var i = 0; i < parts.length; i++) {
            if (cur == null) return undefined;
            cur = cur[parts[i]];
        }
        return clone(cur);
    }

    function setByPath(root, path, value) {
        var parts = path.split('.');
        var cur = root;
        for (var i = 0; i < parts.length - 1; i++) {
            if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') {
                cur[parts[i]] = {};
            }
            cur = cur[parts[i]];
        }
        cur[parts[parts.length - 1]] = clone(value);
    }

    // 挂到全局，让被测 mutator 能拿到 StateManager
    var fake = {
        _state: state,
        snapshot: function() { return clone(state); },
        get: function(path) { return getByPath(state, path); },
        peek: function(path) {
            if (!path) return state;
            var parts = path.split('.');
            var cur = state;
            for (var i = 0; i < parts.length; i++) {
                if (cur == null) return undefined;
                cur = cur[parts[i]];
            }
            return cur; // peek 不拷贝
        },
        set: function(path, value, options) {
            setByPath(state, path, value);
            if (!options || !options.silent) {
                listeners.forEach(function(fn) { fn([{ path: path }]); });
            }
            return true;
        },
        setLegacy: function(name, value, options) {
            // 测试环境不做 legacy 映射，直接 noop
            return true;
        },
        getLegacy: function(name) {
            // 测试环境不做 legacy 映射
            return undefined;
        },
        subscribe: function(pattern, cb) {
            listeners.push(cb);
            return listeners.length;
        },
        unsubscribe: function(token) {
            listeners.splice(token - 1, 1);
            return true;
        },
        transaction: function(fn) {
            // 简化版事务：直接执行，不回滚（测试不需要回滚语义）
            return fn();
        }
    };

    // 注入全局，使被测 mutator 文件中引用的全局 StateManager 命中
    global.StateManager = fake;
    return fake;
}

// 简单断言工具
function assertEq(a, b, msg) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        throw new Error((msg || 'assertEq failed') + '\n  expected: ' + JSON.stringify(b) + '\n  actual:   ' + JSON.stringify(a));
    }
}

function assertOk(cond, msg) {
    if (!cond) throw new Error(msg || 'assertOk failed');
}

module.exports = {
    createFakeStateManager: createFakeStateManager,
    assertEq: assertEq,
    assertOk: assertOk
};
