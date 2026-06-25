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
    },

    // GameMemory -> StateManager（用于初始化或手动同步）
    syncFromGameMemory() {
        if (typeof GameMemory === 'undefined') return;
        this._syncLock = true;
        try {
            if (GameMemory.tables) {
                if (GameMemory.tables.items) {
                    // 【v3审查修复】tables.items 是 {name: item} 对象（与 characters 同构），
                    //   BagMutator.setItems 期望数组；原实现直接传对象会被包成 [对象]，
                    //   normalizeItem 取 .name=undefined 返回 null，被 filter 清掉 → 背包清空
                    var _itemArr = Array.isArray(GameMemory.tables.items)
                        ? GameMemory.tables.items
                        : Object.values(GameMemory.tables.items).filter(function(it) { return it && it.name; });
                    if (_itemArr.length > 0) BagMutator.setItems(_itemArr, { silent: true });
                }
                if (GameMemory.tables.characters) {
                    // 【阶段1修复类型bug】gm.tables.characters 是 {name: charObj} 对象，
                    // CharacterMutator.mergeCharacters 期望数组，需 Object.values 转换
                    var _charArr = Array.isArray(GameMemory.tables.characters)
                        ? GameMemory.tables.characters
                        : Object.values(GameMemory.tables.characters).filter(function(c) { return c && c.name; });
                    if (_charArr.length > 0) {
                        CharacterMutator.mergeCharacters(_charArr, { silent: true });
                    }
                }
                if (GameMemory.tables.locations) {
                    // 【v3审查修复】tables.locations 同样是 {name: loc} 对象，转数组后再写入
                    var _locArr = Array.isArray(GameMemory.tables.locations)
                        ? GameMemory.tables.locations
                        : Object.values(GameMemory.tables.locations).filter(function(l) { return l && l.name; });
                    if (_locArr.length > 0) StateManager.set('entities.locations', _locArr, { silent: true });
                }
            }
            if (GameMemory.quests) {
                // 【v3审查修复】QuestMutator.setQuests 对对象输入会包成 [对象] 然后 normalizeQuest
                //   取 .title=undefined 返回 null → 任务清空。统一 Object.values 转换
                var _questArr = Array.isArray(GameMemory.quests)
                    ? GameMemory.quests
                    : Object.values(GameMemory.quests).filter(function(q) { return q && (q.title || q.id); });
                if (_questArr.length > 0) QuestMutator.setQuests(_questArr, { silent: true });
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
