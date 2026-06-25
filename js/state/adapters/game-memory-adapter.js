// ========================================
// GameMemory 适配器 - GameMemoryAdapter
// 维护 StateManager 与 GameMemory 之间的同步
// ========================================
const GameMemoryAdapter = {
    _syncLock: false,

    // 绑定：订阅 StateManager 变更，自动同步到 GameMemory
    bind() {
        var self = this;
        StateManager.subscribe('entities.**', () => {
            self.syncToGameMemory();
        });
        StateManager.subscribe('progress.**', () => {
            self.syncToGameMemory();
        });
        StateManager.subscribe('time', () => {
            self.syncToGameMemory();
        });
    },

    // StateManager -> GameMemory
    syncToGameMemory() {
        if (this._syncLock) return;
        if (typeof GameMemory === 'undefined') return;
        this._syncLock = true;
        try {
            const bag = StateManager.get('entities.bag') || [];
            const quests = StateManager.get('entities.quests') || [];
            const characters = StateManager.get('entities.characters') || [];
            const locations = StateManager.get('entities.locations') || [];
            const events = StateManager.get('entities.events') || [];

            if (GameMemory.tables) {
                // 【v3审查修复】GameMemory.tables.* 是按 name 索引的对象（见 tavern-compat.js
                //   tables.characters[name]=..., tables.items[name]=..., tables.locations[name]=...）
                //   原实现直接把 StateManager 的数组赋给它们，会把对象结构替换成数组，
                //   之后 GameMemory 所有 tables[name] 读取返回 undefined，休眠追踪/NPC档案/召回全部损坏。
                //   现按 name 转换为索引对象，与 GameMemory 内部结构对齐。
                const toMap = function(arr) {
                    const m = {};
                    if (Array.isArray(arr)) {
                        for (let i = 0; i < arr.length; i++) {
                            const x = arr[i];
                            if (x && x.name) m[x.name] = x;
                        }
                    }
                    return m;
                };
                GameMemory.tables.items = toMap(bag);
                GameMemory.tables.characters = toMap(characters);
                GameMemory.tables.locations = toMap(locations);
            }
            if (GameMemory.quests) {
                GameMemory.quests = quests;
            }
            if (GameMemory.events) {
                GameMemory.events = events;
            }
            if (GameMemory.setContext) {
                GameMemory.setContext('turn', StateManager.get('progress.turn'));
                GameMemory.setContext('sceneTitle', StateManager.get('progress.sceneTitle'));
                GameMemory.setContext('rollingSummary', StateManager.get('progress.rollingSummary'));
            }
        } catch (e) {
            console.warn('[GameMemoryAdapter] 同步到 GameMemory 失败:', e);
        } finally {
            this._syncLock = false;
        }
    }
};
