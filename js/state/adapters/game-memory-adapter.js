// ========================================
// GameMemory 适配器 - GameMemoryAdapter
// 维护 StateManager 与 GameMemory 之间的同步
// ========================================
// 【P1修复P1-K】原实现 syncToGameMemory 每次 entities 变更都做全量 REPLACE
// （tables.items = toMap(bag) 等），把 GameMemory 在这些对象上维护的运行时字段
// （dormantSince / accessCount / history / locked / obtainedTurn 等）全部清空。
// 改为 MERGE：按 name 走查 StateManager 数据，已存在条目只更新实体字段，保留运行时字段；
// 新增条目按 StateManager schema 写入。这样 GameMemory.tables 退化为
// "StateManager 实体字段的运行时累积视图"，不再构成独立的第三数据源。
// （完整派生视图改造见 P2/P3：tables 改为 getter、运行时字段迁到 _runtime 字典）
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

    // StateManager -> GameMemory（MERGE 语义，保留运行时累积字段）
    syncToGameMemory() {
        if (this._syncLock) return;
        if (typeof GameMemory === 'undefined') return;
        this._syncLock = true;
        try {
            const turn = StateManager.get('progress.turn') || 0;

            // === 实体表 MERGE（按 name 走查，已存在只更新实体字段）===
            this._mergeTable('items', StateManager.get('entities.bag') || [], {
                // StateManager bag 字段 → GameMemory tables.items 字段映射
                name: 'name',
                qty: function(b) { return b.count !== undefined ? b.count : 1; },
                unit: 'unit',
                rarity: 'rarity',
                desc: 'desc',
                usable: 'usable',
                effect: 'effect',
                equippable: 'equippable',
                equipped: 'equipped',
                slot: 'slot'
            }, function(name, src) {
                // 新条目默认值（与 _pushCurrentBagToGM 保持一致）
                return {
                    name: name,
                    qty: (src && src.count !== undefined) ? src.count : 1,
                    unit: (src && src.unit) || '个',
                    rarity: (src && src.rarity) || '普通',
                    desc: (src && src.desc) || '',
                    usable: (src && src.usable) || false,
                    effect: (src && src.effect) || '',
                    equippable: (src && src.equippable) || false,
                    equipped: (src && src.equipped) || false,
                    slot: (src && src.slot) || '',
                    obtainedTurn: turn,
                    lastChangedTurn: turn
                };
            });

            this._mergeTable('characters', StateManager.get('entities.characters') || [], {
                name: 'name',
                title: 'title',
                relation: 'relation',
                mood: 'mood',
                location: 'location',
                outfit: 'outfit',
                favorability: 'favorability',
                status: 'status'
            }, function(name) {
                return {
                    name: name,
                    title: '',
                    relation: '',
                    mood: '',
                    location: '',
                    outfit: '',
                    favorability: 0,
                    status: '',
                    history: [],
                    lastChangedTurn: turn,
                    locked: false
                };
            });

            this._mergeTable('locations', StateManager.get('entities.locations') || [], {
                name: 'name',
                desc: 'desc',
                features: 'features',
                charactersPresent: 'charactersPresent'
            }, function(name, src) {
                return {
                    name: name,
                    desc: (src && src.desc) || '',
                    features: '',
                    charactersPresent: '',
                    lastChangedTurn: turn,
                    locked: false
                };
            });

            // === quests / events：数组 MERGE（按 title/content 去重）===
            // 【P1修复P1-M】gm.quests 已统一为 QuestMutator schema（title 为身份字段），
            // 无需 title↔content 别名映射，直接用 title 作为去重键
            const quests = StateManager.get('entities.quests') || [];
            if (Array.isArray(quests) && GameMemory.quests) {
                if (!Array.isArray(GameMemory.quests)) GameMemory.quests = [];
                const titleMap = {};
                GameMemory.quests.forEach(function(q) { if (q && q.title) titleMap[q.title] = q; });
                quests.forEach(function(q) {
                    if (!q || !q.title) return;
                    let gq = titleMap[q.title];
                    if (!gq) {
                        gq = {
                            title: q.title,
                            type: q.type || 'quest',
                            status: 'pending',
                            createdTurn: turn,
                            resolvedTurn: 0
                        };
                        GameMemory.quests.push(gq);
                        titleMap[q.title] = gq;
                    }
                    gq.type = q.type || gq.type;
                    if (q.status === '已完成' || q.status === 'resolved') {
                        gq.status = 'resolved';
                        if (!gq.resolvedTurn) gq.resolvedTurn = turn;
                    } else if (q.status === '已失败' || q.status === '失败' || q.status === 'broken') {
                        gq.status = 'broken';
                        if (!gq.resolvedTurn) gq.resolvedTurn = turn;
                    } else {
                        gq.status = 'pending';
                    }
                });
            }

            const events = StateManager.get('entities.events') || [];
            if (Array.isArray(events) && GameMemory.events) {
                if (!Array.isArray(GameMemory.events)) GameMemory.events = [];
                const seen = {};
                GameMemory.events.forEach(function(e) { if (e && e.content) seen[e.content] = true; });
                events.forEach(function(e) {
                    if (!e || !e.content || seen[e.content]) return;
                    GameMemory.events.push({
                        content: e.content,
                        turn: e.turn || turn,
                        type: e.type || 'event'
                    });
                    seen[e.content] = true;
                });
            }

            // === 上下文字段同步（无累积语义，直接覆盖）===
            if (GameMemory.setContext) {
                GameMemory.setContext('turn', turn);
                GameMemory.setContext('sceneTitle', StateManager.get('progress.sceneTitle'));
                GameMemory.setContext('rollingSummary', StateManager.get('progress.rollingSummary'));
            }
        } catch (e) {
            console.warn('[GameMemoryAdapter] 同步到 GameMemory 失败:', e);
        } finally {
            this._syncLock = false;
        }
    },

    // 通用 MERGE：把 StateManager 数组按 name 索引到 GameMemory.tables[tableName]
    // - 已存在条目：按 fieldMap 更新实体字段，跳过 undefined 字段，保留运行时字段
    // - 新条目：调用 factory(name, src) 创建，包含运行时字段默认值
    _mergeTable(tableName, arr, fieldMap, factory) {
        if (!GameMemory.tables) return;
        if (!GameMemory.tables[tableName]) GameMemory.tables[tableName] = {};
        const table = GameMemory.tables[tableName];
        const turn = StateManager.get('progress.turn') || 0;
        if (!Array.isArray(arr)) return;
        for (let i = 0; i < arr.length; i++) {
            const src = arr[i];
            if (!src || !src.name) continue;
            const name = String(src.name);
            let entry = table[name];
            if (!entry) {
                entry = factory(name, src);
                if (!entry) continue;
                table[name] = entry;
                continue;
            }
            // 已存在：仅更新实体字段（跳过 undefined，保留运行时字段如 history/dormantSince）
            Object.keys(fieldMap).forEach(function(field) {
                const srcField = fieldMap[field];
                let val;
                if (typeof srcField === 'function') {
                    val = srcField(src);
                } else {
                    val = src[srcField];
                }
                if (val !== undefined) entry[field] = val;
            });
            entry.lastChangedTurn = turn;
        }
    }
};
