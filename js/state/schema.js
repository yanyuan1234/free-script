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
                maxTokens: 16384,
                contextSize: DEFAULT_CONTEXT_SIZE,
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
                },
                // 【P2 Swipe 单轮】只存当前回合的多版本，进入下一回合时整体覆盖
                // 结构：{ versions: [swipe...], current: 0, turn: 5 }
                // 避免长期积累导致内存/存档膨胀
                swipes: { versions: [], current: -1, turn: 0 }
            },
            entities: {
                player: {
                    name: '',
                    identity: '',
                    stats: [],
                    level: 1,
                    exp: 0,

                    avatar: ''
                },
                characters: [],
                bag: [],
                quests: [],
                locations: [],
                events: [],
                currency: 0,
                currencyName: '金币',

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

                // 40处UI读取点依赖，原 _syncLegacyMirror 完全未覆盖
                worldModules: [],

                undoHistory: [],
                maxUndoHistory: 50,

                notifSeenSnapshot: null,
                lastRankSnapshot: null,
                lastInputTokens: 0,
                lastContextUsage: 0,
                lastTruncated: false,
                lastValidationWarning: '',
                lastOriginalContent: '',
                lastCotContent: '',
                worldSnapshot: {}
            },

            // 替代原 gameState.fontSize / autoCompress / summaryThreshold / useStream / writingStyle
            // / pinnedModules 直写，纳入 StateManager 统一管理
            settings: {
                fontSize: 16,
                autoCompress: true,
                summaryThreshold: 6,
                useStream: true,
                writingStyle: '',
                pinnedModules: {},

                cotMode: false,                  // 是否启用 CoT(思维链)输出
                chapterMode: false,              // 是否按章节生成
                presetArchetype: 'standard',     // 预设原型(standard / coc / etc.)
                wordCountConfig: { min: 200, max: 800 },  // 每次 AI 输出字数范围
                generateChoices: true,           // 是否在 AI 输出末尾生成选项(覆盖 world.generateChoices)
                narrativeEyes: 'first',          // 叙事视角(first / second / third)

                // 【Author's Note at_depth】参考 SillyTavern/KoboldAI 的 Author's Note 机制
                // authorsNote: 每轮注入的作者备注，让玩家在游戏中随时微调 AI 行为
                // authorsNoteDepth: 注入深度（0=紧贴用户消息前，>0=注入到聊天历史倒数第 N 条前）
                // depth 越大，作者备注离生成点越远；depth=3-5 时模型最重视（SillyTavern 默认 4）
                authorsNote: '',
                authorsNoteDepth: 0,

                apiTestingSlot: -1
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

        'relationships': 'entities.relationships',
        '_worldModules': 'ui.worldModules',
        'gameTime': 'time',
        '_lastChoices': 'ui.lastChoices',
        '_lastHUD': 'ui.lastHUD',
        'currentPage': 'ui.currentPage',

        'fontSize': 'settings.fontSize',
        'autoCompress': 'settings.autoCompress',
        'summaryThreshold': 'settings.summaryThreshold',
        'useStream': 'settings.useStream',
        'writingStyle': 'settings.writingStyle',
        'pinnedModules': 'settings.pinnedModules',

        'cotMode': 'settings.cotMode',
        'chapterMode': 'settings.chapterMode',
        'presetArchetype': 'settings.presetArchetype',
        'wordCountConfig': 'settings.wordCountConfig',
        'authorsNote': 'settings.authorsNote',
        'authorsNoteDepth': 'settings.authorsNoteDepth',
        'narrativeEyes': 'settings.narrativeEyes',
        'apiTestingSlot': 'settings.apiTestingSlot',

        'undoHistory': 'ui.undoHistory',
        '_undoHistory': 'ui.undoHistory',

        '_notifSeenSnapshot': 'ui.notifSeenSnapshot',
        '_lastRankSnapshot': 'ui.lastRankSnapshot',
        '_lastInputTokens': 'ui.lastInputTokens',
        '_lastContextUsage': 'ui.lastContextUsage',
        '_lastTruncated': 'ui.lastTruncated',
        '_lastValidationWarning': 'ui.lastValidationWarning',
        '_lastOriginalContent': 'ui.lastOriginalContent',
        '_lastCotContent': 'ui.lastCotContent',

        '_MAX_UNDO_HISTORY': 'ui.maxUndoHistory',
        'worldSnapshot': 'ui.worldSnapshot'
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
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/.test(path)) return false;
        // 检查每一段都不是危险键（_DANGEROUS_KEYS 定义在文件顶部，对象形式）
        var segments = path.split('.');
        var dk = StateSchema._DANGEROUS_KEYS;
        for (var i = 0; i < segments.length; i++) {
            if (dk[segments[i]]) return false;
        }
        return true;
    },

    // 标准化状态：把旧格式数据迁移到新 schema
    normalizeState(state) {
        if (!state || typeof state !== 'object') {
            return this.getDefaultState();
        }

        // 旧存档可能用 gameState.money 或 gameState.coins 存货币，
        // 启动时一次性迁移到 entities.currency，然后从旧字段删掉避免下次再走 fallback
        if (state.entities && typeof state.entities.currency !== 'number') {
            if (typeof state.money === 'number' && isFinite(state.money)) {
                state.entities.currency = state.money;
                delete state.money;
            } else if (typeof state.coins === 'number' && isFinite(state.coins)) {
                state.entities.currency = state.coins;
                delete state.coins;
            }
        }
        const result = this.getDefaultState();
        // 递归合并，优先保留已有值
        this._deepMerge(result, state);
        // 【P2 Swipe 单轮】兼容老存档格式迁移
        // 老格式：{ "5": {versions, current}, "6": {...} }（按 turn 索引，越积越多）
        // 新格式：{ versions: [...], current: 0, turn: N }（只存当前轮）
        if (result.progress && result.progress.swipes) {
            var oldSw = result.progress.swipes;
            if (typeof oldSw === 'object' && !Array.isArray(oldSw) && oldSw !== null) {
                if (!oldSw.versions) {
                    // 老格式：取当前 turn 对应的条目迁移，其余丢弃
                    // [C1修复] curTurn 需同时检查 _stats.totalTurns（更老的存档用此字段）
                    var curTurn = (result.progress && typeof result.progress.turn === 'number') ? result.progress.turn : 0;
                    if (curTurn === 0 && state._stats && typeof state._stats.totalTurns === 'number') {
                        curTurn = state._stats.totalTurns;
                    }
                    var entry = oldSw[String(curTurn)];
                    if (entry && Array.isArray(entry.versions)) {
                        result.progress.swipes = {
                            versions: entry.versions,
                            current: (typeof entry.current === 'number') ? entry.current : 0,
                            turn: curTurn
                        };
                    } else {
                        // [C1修复] 精确 turn 未命中时，取最大 turn key（最近一轮）作为兜底
                        var maxKey = -1;
                        Object.keys(oldSw).forEach(function(k) {
                            var kn = parseInt(k, 10);
                            if (!isNaN(kn) && kn > maxKey) maxKey = kn;
                        });
                        if (maxKey >= 0 && oldSw[String(maxKey)] && Array.isArray(oldSw[String(maxKey)].versions)) {
                            var fallbackEntry = oldSw[String(maxKey)];
                            result.progress.swipes = {
                                versions: fallbackEntry.versions,
                                current: (typeof fallbackEntry.current === 'number') ? fallbackEntry.current : 0,
                                turn: maxKey
                            };
                        } else {
                            result.progress.swipes = { versions: [], current: -1, turn: curTurn };
                        }
                    }
                }
                // 新格式直接保留（含 versions 字段）
            } else {
                result.progress.swipes = { versions: [], current: -1, turn: 0 };
            }
        }
        // 处理旧字段映射：把旧字段迁移到新路径
        for (const legacyName in this._legacyToPath) {
            if (legacyName.indexOf('.') !== -1) {

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
