// ========================================
// GameMemory 适配器 - GameMemoryAdapter
// 维护 StateManager 与 GameMemory 之间的同步
// ========================================
var GameMemoryAdapter = {
    _syncLock: false,

    // 绑定：订阅 StateManager 变更，自动同步到 GameMemory
    bind: function() {
        var self = this;
        StateManager.subscribe('entities.**', function() {
            self.syncToGameMemory();
        });
        StateManager.subscribe('progress.**', function() {
            self.syncToGameMemory();
        });
        StateManager.subscribe('time', function() {
            self.syncToGameMemory();
        });
    },

    // StateManager -> GameMemory
    syncToGameMemory: function() {
        if (this._syncLock) return;
        if (typeof GameMemory === 'undefined') return;
        this._syncLock = true;
        try {
            var bag = StateManager.get('entities.bag') || [];
            var quests = StateManager.get('entities.quests') || [];
            var characters = StateManager.get('entities.characters') || [];
            var locations = StateManager.get('entities.locations') || [];
            var events = StateManager.get('entities.events') || [];

            if (GameMemory.tables) {
                GameMemory.tables.items = bag;
                GameMemory.tables.characters = characters;
                GameMemory.tables.locations = locations;
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
    },

    // GameMemory -> StateManager（用于初始化或手动同步）
    syncFromGameMemory: function() {
        if (typeof GameMemory === 'undefined') return;
        this._syncLock = true;
        try {
            if (GameMemory.tables) {
                if (GameMemory.tables.items) {
                    BagMutator.setItems(GameMemory.tables.items, { silent: true });
                }
                if (GameMemory.tables.characters) {
                    CharacterMutator.mergeCharacters(GameMemory.tables.characters, { silent: true });
                }
                if (GameMemory.tables.locations) {
                    StateManager.set('entities.locations', GameMemory.tables.locations, { silent: true });
                }
            }
            if (GameMemory.quests) {
                QuestMutator.setQuests(GameMemory.quests, { silent: true });
            }
            if (GameMemory.events) {
                StateManager.set('entities.events', GameMemory.events, { silent: true });
            }
        } catch (e) {
            console.warn('[GameMemoryAdapter] 从 GameMemory 同步失败:', e);
        } finally {
            this._syncLock = false;
        }
    }
};
