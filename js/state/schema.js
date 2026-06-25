// ========================================
// 状态数据模型 - State Schema
// ========================================
const StateSchema = {
    // 当前存档格式版本，用于未来迁移
    VERSION: '1.0.0-state-layer',

    // 危险键名黑名单（防止原型污染）
    _DANGEROUS_KEYS: { '__proto__': 1, 'constructor': 1, 'prototype': 1 },

    // 获取默认状态
    getDefaultState() {
        return {
            meta: {
                version: this.VERSION,
                createdAt: Date.now(),
                updatedAt: Date.now()
            },
            world: {
                userPrompt: '',
                setupText: '',
                theme: '',
                genre: '',
                pureTextMode: false,
                generateChoices: true,
                maxTokens: 4096,
                contextSize: 8192,
                temperature: 0.7
            },
            progress: {
                turn: 0,
                sceneTitle: '',
                lastSceneTitle: '',
                rollingSummary: '',
                conversationHistory: [],
                preAIState: {
                    title: '',
                    gameTime: null
                }
            },
            entities: {
                player: {
                    name: '',
                    identity: '',
                    stats: [],
                    level: 1,
                    exp: 0
                },
                characters: [],
                bag: [],
                quests: [],
                locations: [],
                events: [],
                currency: 0,
                currencyName: '金币',
                // 【阶段5】relationships 纳入 schema 管理（原为 gameState.relationships 旧字段）
                relationships: []
            },
            time: {
                date: '',
                time: '',
                period: ''
            },
            ui: {
                currentPage: 'menu',
                lastChoices: [],
                logSubPage: '',
                lastHUD: null,
                // 【阶段5】worldModules 纳入 schema 管理（原为 gameState._worldModules 旧字段）
                // 40处UI读取点依赖，原 _syncLegacyMirror 完全未覆盖
                worldModules: []
            }
        };
    },

    // 旧字段名 -> 新路径映射
    _legacyToPath: {
        'userPrompt': 'world.userPrompt',
        'setupText': 'world.setupText',
        'theme': 'world.theme',
        'genre': 'world.genre',
        'pureTextMode': 'world.pureTextMode',
        'generateChoices': 'world.generateChoices',
        'maxTokens': 'world.maxTokens',
        'contextSize': 'world.contextSize',
        'temperature': 'world.temperature',
        '_stats.totalTurns': 'progress.turn',
        '_lastSceneTitle': 'progress.lastSceneTitle',
        'rollingSummary': 'progress.rollingSummary',
        'conversationHistory': 'progress.conversationHistory',
        '_preAIState': 'progress.preAIState',
        'playerData': 'entities.player',
        'allCharacters': 'entities.characters',
        'currentBag': 'entities.bag',
        'currentQuests': 'entities.quests',
        'currency': 'entities.currency',
        'currencyName': 'entities.currencyName',
        'keyEvents': 'entities.events',
        // 【阶段5】relationships 和 _worldModules 纳入映射
        'relationships': 'entities.relationships',
        '_worldModules': 'ui.worldModules',
        'gameTime': 'time',
        '_lastChoices': 'ui.lastChoices',
        '_lastHUD': 'ui.lastHUD',
        'currentPage': 'ui.currentPage'
    },

    // 新路径 -> 旧字段名映射
    _pathToLegacy: {},

    // 初始化反向映射
    _buildReverseMap() {
        if (Object.keys(this._pathToLegacy).length > 0) return;
        for (const key in this._legacyToPath) {
            this._pathToLegacy[this._legacyToPath[key]] = key;
        }
    },

    // 旧字段名转新路径
    getPath(legacyName) {
        return this._legacyToPath[legacyName] || legacyName;
    },

    // 新路径转旧字段名
    getLegacyName(path) {
        this._buildReverseMap();
        return this._pathToLegacy[path] || path;
    },

    // 判断路径是否为 world 域（初始化后只读）
    isReadOnly(path) {
        if (!path) return false;
        return path.indexOf('world.') === 0 || path === 'world';
    },

    // 判断路径是否有效（简单实现：允许任意点分路径）
    validatePath(path) {
        if (typeof path !== 'string' || path.length === 0) return false;
        return /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/.test(path);
    },

    // 标准化状态：把旧格式数据迁移到新 schema
    normalizeState(state) {
        if (!state || typeof state !== 'object') {
            return this.getDefaultState();
        }
        const result = this.getDefaultState();
        // 递归合并，优先保留已有值
        this._deepMerge(result, state);
        // 处理旧字段映射：把旧字段迁移到新路径
        for (const legacyName in this._legacyToPath) {
            if (legacyName.indexOf('.') !== -1) {
                // 【P1修复】嵌套旧字段（如 _stats.totalTurns）需特殊处理
                // _deepMerge 会把 _stats 原样保留到 result._stats，但新代码读 progress.turn
                if (legacyName === '_stats.totalTurns') {
                    if (state._stats && state._stats.totalTurns !== undefined) {
                        this._setByPath(result, 'progress.turn', state._stats.totalTurns);
                    }
                }
                continue;
            }
            if (state[legacyName] !== undefined) {
                const newPath = this._legacyToPath[legacyName];
                this._setByPath(result, newPath, state[legacyName]);
            }
        }
        result.meta.version = this.VERSION;
        result.meta.updatedAt = Date.now();
        return result;
    },

    // 深拷贝
    // 【P1修复】防止原型污染：跳过 __proto__/constructor/prototype 键
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) {
            const arr = [];
            for (let i = 0; i < obj.length; i++) {
                arr.push(this.deepClone(obj[i]));
            }
            return arr;
        }
        const cloned = {};
        // 使用 Object.keys 避免遍历原型链
        const keys = Object.keys(obj);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (this._DANGEROUS_KEYS[key]) continue;  // 跳过危险键
            cloned[key] = this.deepClone(obj[key]);
        }
        return cloned;
    },

    // 深合并（source 覆盖 target）
    // 【P1修复】防止原型污染：跳过 __proto__/constructor/prototype 键
    _deepMerge(target, source) {
        if (!source || typeof source !== 'object') return target;
        const keys = Object.keys(source);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (this._DANGEROUS_KEYS[key]) continue;  // 跳过危险键
            const sv = source[key];
            const tv = target[key];
            if (sv !== null && typeof sv === 'object' && !Array.isArray(sv) &&
                tv !== null && typeof tv === 'object' && !Array.isArray(tv)) {
                this._deepMerge(tv, sv);
            } else {
                target[key] = this.deepClone(sv);
            }
        }
        return target;
    },

    // 按点分路径设置值
    // 【P1修复】防止原型污染：跳过危险键
    _setByPath(obj, path, value) {
        if (!path) return;
        const parts = path.split('.');
        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            const p = parts[i];
            if (this._DANGEROUS_KEYS[p]) return;  // 跳过危险键
            if (!current[p] || typeof current[p] !== 'object') {
                current[p] = {};
            }
            current = current[p];
        }
        const lastKey = parts[parts.length - 1];
        if (this._DANGEROUS_KEYS[lastKey]) return;  // 跳过危险键
        current[lastKey] = this.deepClone(value);
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = StateSchema;
