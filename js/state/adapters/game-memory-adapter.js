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
    syncFromGameMemory() {
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
