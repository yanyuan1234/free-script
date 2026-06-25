// ========================================
// 状态管理器 - StateManager
// 唯一状态读写入口
// ========================================
const StateManager = {
    _state: null,
    _listeners: [],
    _inTransaction: false,
    _pendingChanges: [],
    _transactionBackup: null,   // 事务快照，用于真正回滚
    _legacyMode: true,          // 迁移期间允许 getLegacy/setLegacy
    _nextToken: 1,

    // 初始化：接管全局 gameState
    init(state) {
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
        this._transactionBackup = null;
        console.log('[StateManager] 初始化完成，版本:', this._state.meta.version);
    },

    // 获取完整深拷贝快照
    snapshot() {
        return StateSchema.deepClone(this._state);
    },

    // 按路径读取，返回深拷贝
    get(path) {
        if (!path) return this.snapshot();
        const value = this._getRaw(path);
        return StateSchema.deepClone(value);
    },

    // 兼容旧字段名读取
    getLegacy(name) {
        const path = StateSchema.getPath(name);
        return this.get(path);
    },

    // 按路径写入（写入时深拷贝，保证契约对称）
    set(path, value, options) {
        options = options || {};
        if (!StateSchema.validatePath(path)) {
            console.warn('[StateManager] 非法路径:', path);
            return false;
        }
        // 强制只读约束：world.* 域初始化后不可写（除非显式 allowReadOnly）
        if (StateSchema.isReadOnly(path) && !options.allowReadOnly) {
            console.warn('[StateManager] 只读路径拒绝写入:', path);
            return false;
        }
        const oldValue = this._getRaw(path);
        // 写入时深拷贝，防止调用方保留引用导致状态被静默篡改
        const clonedValue = StateSchema.deepClone(value);
        this._setRaw(path, clonedValue);
        // 【数据断层修复】同步镜像到旧字段名，保证 UI 直接读 gameState.xxx 时不为空
        this._syncLegacyMirror(path, clonedValue);
        const change = {
            path: path,
            oldValue: StateSchema.deepClone(oldValue),
            newValue: StateSchema.deepClone(clonedValue)
        };
        if (this._inTransaction) {
            this._pendingChanges.push(change);
        } else if (!options.silent) {
            this._notify([change]);
        }
        return true;
    },

    // 兼容旧字段名写入（经 getPath 翻译，确保通知路径与订阅路径一致）
    setLegacy(name, value, options) {
        const path = StateSchema.getPath(name);
        return this.set(path, value, options);
    },

    // 订阅变更
    // pattern 支持：'entities.bag' / 'entities.*' / 'entities.**' / '**'
    subscribe(pattern, callback) {
        if (typeof callback !== 'function') return null;
        const token = this._nextToken++;
        this._listeners.push({
            token: token,
            pattern: pattern || '**',
            callback: callback
        });
        return token;
    },

    // 事务：批量变更，结束时统一通知
    // 【P0修复】真正回滚：进入事务前保存快照，异常时恢复
    transaction(fn) {
        if (this._inTransaction) {
            // 嵌套事务直接执行（由最外层事务统一保证回滚）
            return fn();
        }
        this._inTransaction = true;
        this._pendingChanges = [];
        // 保存事务前快照，用于异常时真正回滚
        this._transactionBackup = this.snapshot();
        let result;
        try {
            result = fn();
            this._inTransaction = false;
            const changes = this._pendingChanges;
            this._pendingChanges = [];
            this._transactionBackup = null;
            this._notify(changes);
            return result;
        } catch (e) {
            this._inTransaction = false;
            this._pendingChanges = [];
            // 真正回滚：恢复事务前的状态快照
            if (this._transactionBackup) {
                this._state = this._transactionBackup;
                if (typeof window !== 'undefined') {
                    window.gameState = this._state;
                }
                this._transactionBackup = null;
            }
            console.error('[StateManager] 事务执行失败，已回滚到事务前快照:', e);
            throw e;
        }
    },

    // 内部：同步镜像到旧字段名（数据断层修复）
    // 新路径写入后，同时写入对应的旧顶层字段，保证 UI 直接读 gameState.xxx 不为空
    _syncLegacyMirror(path, value) {
        const legacyName = StateSchema.getLegacyName(path);
        if (legacyName === path) return; // 无对应旧字段
        // 特殊转换：entities.characters（数组）→ allCharacters（对象）
        if (path === 'entities.characters' && Array.isArray(value)) {
            const obj = {};
            for (let i = 0; i < value.length; i++) {
                const c = value[i];
                if (c && c.name) obj[c.name] = c;
            }
            this._state[legacyName] = obj;
            return;
        }
        // 【阶段5修复bug】progress.turn → _stats.totalTurns 的镜像因 key 含 '.' 未生效
        // _legacyToPath 中 '_stats.totalTurns' 是嵌套路径，getLegacyName 返回 '_stats.totalTurns'，
        // 但 this._state['_stats.totalTurns'] 是字面量属性，不会写入 _state._stats.totalTurns
        if (path === 'progress.turn') {
            if (!this._state._stats) this._state._stats = {};
            this._state._stats.totalTurns = value;
            return;
        }
        // 【阶段1-A2】entities.events（对象数组）→ keyEvents（字符串数组）
        // StateManager.entities.events 是对象数组 [{content, turn, importance, ...}]
        // gameState.keyEvents 是旧格式字符串数组，供 indexOf 等使用
        // 转换确保两种 schema 各自一致，避免对象/字符串混用
        if (path === 'entities.events' && Array.isArray(value)) {
            this._state.keyEvents = value.map(function(e) {
                if (typeof e === 'string') return e;
                return (e && e.content) ? String(e.content) : '';
            }).filter(function(s) { return s && s.length > 0; });
            return;
        }
        // time → gameTime：新结构 {date,time,period} 直接兼容旧 gameTime
        // 其他路径直接镜像
        this._state[legacyName] = StateSchema.deepClone(value);
    },

    // 内部：按路径读取原始值（不拷贝，仅内部使用）
    _getRaw(path) {
        const parts = path.split('.');
        let current = this._state;
        for (let i = 0; i < parts.length; i++) {
            if (current === null || current === undefined) return undefined;
            current = current[parts[i]];
        }
        return current;
    },

    // 内部：按路径写入原始值
    _setRaw(path, value) {
        const parts = path.split('.');
        let current = this._state;
        // 【v3审查修复】拦截危险键 __proto__/constructor/prototype，防止原型污染
        // schema.js 的 _setByPath/_deepMerge/deepClone 都过滤了 _DANGEROUS_KEYS，
        // 唯独此处未检查；validatePath 正则反而允许这些段名作为合法路径
        const dangerous = (StateSchema && StateSchema._DANGEROUS_KEYS) || { __proto__: 1, constructor: 1, prototype: 1 };
        for (let i = 0; i < parts.length - 1; i++) {
            const p = parts[i];
            if (dangerous[p]) return;
            if (!current[p] || typeof current[p] !== 'object') {
                current[p] = {};
            }
            current = current[p];
        }
        const lastKey = parts[parts.length - 1];
        if (dangerous[lastKey]) return;
        current[lastKey] = value;
    },

    // 内部：通知订阅者
    // 【性能优化】按监听器 pattern 只拷贝相关子树，避免每次全量深拷贝
    _notify(changes) {
        if (!changes || changes.length === 0) return;
        const self = this;
        this._listeners.forEach(listener => {
            const matched = changes.some(change => self._matchPattern(listener.pattern, change.path));
            if (matched) {
                try {
                    // 传 changes（含 oldValue/newValue），监听器按需 get 取子树
                    listener.callback(null, changes);
                } catch (e) {
                    console.error('[StateManager] 订阅回调执行失败:', e);
                }
            }
        });
    },

    // 内部：模式匹配
    // 支持：'**'（全匹配）、'entities.*'（单层通配）、'entities.**'（多层通配）
    _matchPattern(pattern, path) {
        if (pattern === '**') return true;
        const pParts = pattern.split('.');
        const pathParts = path.split('.');
        for (let i = 0; i < pParts.length; i++) {
            if (pParts[i] === '**') return true;
            if (pParts[i] === '*') {
                if (i >= pathParts.length) return false;
                continue;
            }
            if (i >= pathParts.length) return false;
            if (pParts[i] !== pathParts[i]) return false;
        }
        return pParts.length === pathParts.length;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = StateManager;
