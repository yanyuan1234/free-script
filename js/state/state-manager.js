// ========================================
// 状态管理器 - StateManager
// 唯一状态读写入口
// ========================================
var StateManager = {
    _state: null,
    _listeners: [],
    _inTransaction: false,
    _pendingChanges: [],
    _legacyMode: true,   // 迁移期间允许 getLegacy/setLegacy
    _nextToken: 1,

    // 初始化：接管全局 gameState
    init: function(state) {
        if (!state) {
            this._state = StateSchema.getDefaultState();
        } else {
            this._state = StateSchema.normalizeState(state);
        }
        // 保持全局引用一致
        if (typeof window !== 'undefined') {
            window.gameState = this._state;
        }
        this._listeners = [];
        this._pendingChanges = [];
        console.log('[StateManager] 初始化完成，版本:', this._state.meta.version);
    },

    // 获取完整深拷贝快照
    snapshot: function() {
        return StateSchema.deepClone(this._state);
    },

    // 按路径读取，返回深拷贝
    get: function(path) {
        if (!path) return this.snapshot();
        var value = this._getRaw(path);
        return StateSchema.deepClone(value);
    },

    // 按路径数组读取
    getIn: function(pathArray) {
        if (!Array.isArray(pathArray) || pathArray.length === 0) {
            return this.snapshot();
        }
        return this.get(pathArray.join('.'));
    },

    // 兼容旧字段名读取
    getLegacy: function(name) {
        var path = StateSchema.getPath(name);
        return this.get(path);
    },

    // 按路径写入
    set: function(path, value, options) {
        options = options || {};
        if (!StateSchema.validatePath(path)) {
            console.warn('[StateManager] 非法路径:', path);
            return false;
        }
        var oldValue = this._getRaw(path);
        this._setRaw(path, value);
        var change = {
            path: path,
            oldValue: StateSchema.deepClone(oldValue),
            newValue: StateSchema.deepClone(value)
        };
        if (this._inTransaction) {
            this._pendingChanges.push(change);
        } else if (!options.silent) {
            this._notify([change]);
        }
        return true;
    },

    // 兼容旧字段名写入
    setLegacy: function(name, value, options) {
        var path = StateSchema.getPath(name);
        return this.set(path, value, options);
    },

    // 合并部分对象到指定路径
    merge: function(path, partial, options) {
        options = options || {};
        var current = this.get(path);
        if (!current || typeof current !== 'object' || Array.isArray(current)) {
            current = {};
        }
        var merged = StateSchema._deepMerge ?
            StateSchema._deepMerge(StateSchema.deepClone(current), partial) :
            Object.assign({}, current, partial);
        return this.set(path, merged, options);
    },

    // 使用 updater 函数更新指定路径
    updateIn: function(pathArray, updater, options) {
        var current = this.getIn(pathArray);
        var updated = updater(StateSchema.deepClone(current));
        return this.set(pathArray.join('.'), updated, options);
    },

    // 订阅变更
    // pattern 支持：'entities.bag' / 'entities.*' / '**'
    subscribe: function(pattern, callback) {
        if (typeof callback !== 'function') return null;
        var token = this._nextToken++;
        this._listeners.push({
            token: token,
            pattern: pattern || '**',
            callback: callback
        });
        return token;
    },

    // 取消订阅
    unsubscribe: function(token) {
        this._listeners = this._listeners.filter(function(l) {
            return l.token !== token;
        });
    },

    // 事务：批量变更，结束时统一通知
    transaction: function(fn) {
        if (this._inTransaction) {
            // 嵌套事务直接执行
            return fn();
        }
        this._inTransaction = true;
        this._pendingChanges = [];
        var result;
        try {
            result = fn();
            this._inTransaction = false;
            var changes = this._pendingChanges;
            this._pendingChanges = [];
            this._notify(changes);
            return result;
        } catch (e) {
            this._inTransaction = false;
            this._pendingChanges = [];
            console.error('[StateManager] 事务执行失败，已回滚:', e);
            throw e;
        }
    },

    // 批量操作
    batch: function(operations) {
        var self = this;
        return this.transaction(function() {
            operations.forEach(function(op) {
                self.set(op.path, op.value, { silent: true });
            });
        });
    },

    // 内部：按路径读取原始值
    _getRaw: function(path) {
        var parts = path.split('.');
        var current = this._state;
        for (var i = 0; i < parts.length; i++) {
            if (current === null || current === undefined) return undefined;
            current = current[parts[i]];
        }
        return current;
    },

    // 内部：按路径写入原始值
    _setRaw: function(path, value) {
        var parts = path.split('.');
        var current = this._state;
        for (var i = 0; i < parts.length - 1; i++) {
            var p = parts[i];
            if (!current[p] || typeof current[p] !== 'object') {
                current[p] = {};
            }
            current = current[p];
        }
        current[parts[parts.length - 1]] = value;
    },

    // 内部：通知订阅者
    _notify: function(changes) {
        if (!changes || changes.length === 0) return;
        var snapshot = this.snapshot();
        var self = this;
        this._listeners.forEach(function(listener) {
            var matched = changes.some(function(change) {
                return self._matchPattern(listener.pattern, change.path);
            });
            if (matched) {
                try {
                    listener.callback(snapshot, changes);
                } catch (e) {
                    console.error('[StateManager] 订阅回调执行失败:', e);
                }
            }
        });
    },

    // 内部：模式匹配
    _matchPattern: function(pattern, path) {
        if (pattern === '**') return true;
        var pParts = pattern.split('.');
        var pathParts = path.split('.');
        for (var i = 0; i < pParts.length; i++) {
            if (pParts[i] === '*') {
                // 通配符匹配任意一层
                if (i >= pathParts.length) return false;
                continue;
            }
            if (pParts[i] === '**') return true;
            if (i >= pathParts.length) return false;
            if (pParts[i] !== pathParts[i]) return false;
        }
        return pParts.length === pathParts.length;
    }
};
