// ========================================
// 状态数据模型 - State Schema
// ========================================
var StateSchema = {
    // 当前存档格式版本，用于未来迁移
    VERSION: '1.0.0-state-layer',

    // 获取默认状态
    getDefaultState: function() {
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
                events: []
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
                lastHUD: null
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
        'keyEvents': 'entities.events',
        'gameTime': 'time',
        '_lastChoices': 'ui.lastChoices',
        '_lastHUD': 'ui.lastHUD',
        'currentPage': 'ui.currentPage'
    },

    // 新路径 -> 旧字段名映射
    _pathToLegacy: {},

    // 初始化反向映射
    _buildReverseMap: function() {
        if (Object.keys(this._pathToLegacy).length > 0) return;
        for (var key in this._legacyToPath) {
            this._pathToLegacy[this._legacyToPath[key]] = key;
        }
    },

    // 旧字段名转新路径
    getPath: function(legacyName) {
        return this._legacyToPath[legacyName] || legacyName;
    },

    // 新路径转旧字段名
    getLegacyName: function(path) {
        this._buildReverseMap();
        return this._pathToLegacy[path] || path;
    },

    // 判断路径是否为 world 域（初始化后只读）
    isReadOnly: function(path) {
        if (!path) return false;
        return path.indexOf('world.') === 0 || path === 'world';
    },

    // 判断路径是否有效（简单实现：允许任意点分路径）
    validatePath: function(path) {
        if (typeof path !== 'string' || path.length === 0) return false;
        return /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/.test(path);
    },

    // 标准化状态：把旧格式数据迁移到新 schema
    normalizeState: function(state) {
        if (!state || typeof state !== 'object') {
            return this.getDefaultState();
        }
        var result = this.getDefaultState();
        // 递归合并，优先保留已有值
        this._deepMerge(result, state);
        // 处理旧字段映射：把旧字段迁移到新路径
        for (var legacyName in this._legacyToPath) {
            if (legacyName.indexOf('.') !== -1) {
                // 暂不处理嵌套旧字段，靠 _deepMerge 保留
                continue;
            }
            if (state[legacyName] !== undefined) {
                var newPath = this._legacyToPath[legacyName];
                this._setByPath(result, newPath, state[legacyName]);
            }
        }
        result.meta.version = this.VERSION;
        result.meta.updatedAt = Date.now();
        return result;
    },

    // 深拷贝
    deepClone: function(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) {
            var arr = [];
            for (var i = 0; i < obj.length; i++) {
                arr.push(this.deepClone(obj[i]));
            }
            return arr;
        }
        var cloned = {};
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = this.deepClone(obj[key]);
            }
        }
        return cloned;
    },

    // 深合并（source 覆盖 target）
    _deepMerge: function(target, source) {
        if (!source || typeof source !== 'object') return target;
        for (var key in source) {
            if (!source.hasOwnProperty(key)) continue;
            var sv = source[key];
            var tv = target[key];
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
    _setByPath: function(obj, path, value) {
        if (!path) return;
        var parts = path.split('.');
        var current = obj;
        for (var i = 0; i < parts.length - 1; i++) {
            var p = parts[i];
            if (!current[p] || typeof current[p] !== 'object') {
                current[p] = {};
            }
            current = current[p];
        }
        current[parts[parts.length - 1]] = this.deepClone(value);
    }
};
