// ========================================
// GameMemory 适配器 - GameMemoryAdapter
// 维护 StateManager 与 GameMemory 之间的同步
// ========================================

// （tables.items = toMap(bag) 等），把 GameMemory 在这些对象上维护的运行时字段
// （dormantSince / accessCount / history / locked / obtainedTurn 等）全部清空。
// 改为 MERGE：按 name 走查 StateManager 数据，已存在条目只更新实体字段，保留运行时字段；
// 新增条目按 StateManager schema 写入。这样 GameMemory.tables 退化为
// "StateManager 实体字段的运行时累积视图"，不再构成独立的第三数据源。
// （完整派生视图改造见 P2/P3：tables 改为 getter、运行时字段迁到 _runtime 字典）
const GameMemoryAdapter = {
    _syncLock: false,
    _subTokens: [],

    // 绑定：订阅 StateManager 变更，自动同步到 GameMemory
    bind() {
        var self = this;
        // [P3修复] 保存 subscribe 返回的 token，配合 StateManager.unsubscribe 可在解绑时移除监听器
        this._subTokens = [
            StateManager.subscribe('entities.**', () => {
                self.syncToGameMemory();
            }),
            StateManager.subscribe('progress.**', () => {
                self.syncToGameMemory();
            }),
            StateManager.subscribe('time', () => {
                self.syncToGameMemory();
            })
        ].filter(function(t) { return t !== null; });
    },

    // 解绑：移除所有监听器
    unbind() {
        if (this._subTokens && StateManager.unsubscribe) {
            this._subTokens.forEach(function(t) { StateManager.unsubscribe(t); });
        }
        this._subTokens = [];
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
                // [CP-02] 补全 5 个遗漏字段：identity / desc / tags / stats / notes
                //   原 fieldMap 只映射 7 个字段，导致 CharacterMutator.normalizeCharacter 写入的
                //   identity/desc/tags/stats/notes 无法同步到 gm.tables.characters，
                //   _ensureDataLinkage 引用别名 gameState.allCharacters = gm.tables.characters 后
                //   gameState.allCharacters 也缺这些字段，下游 _buildCharactersSection / 注入层
                //   读到的是残缺数据（AI 失忆）。
                //   增加 favor 是为了与 CharacterMutator.normalizeCharacter 输出对齐（favor=favorability），
                //   兼容读 c.favor 的旧代码。
                //   增加 id 是为了追踪角色跨重命名/合并的唯一标识（CharacterMutator 用 Date.now() 生成）。
                name: 'name',
                title: 'title',
                identity: 'identity',
                identitySurface: 'identitySurface',
                identityHidden: 'identityHidden',
                relation: 'relation',
                mood: 'mood',
                location: 'location',
                outfit: 'outfit',
                favorability: 'favorability',
                favor: 'favor',
                status: 'status',
                desc: 'desc',
                tags: 'tags',
                stats: 'stats',
                notes: 'notes',
                id: 'id',
                // Mufy 风格扩展字段
                appearance: 'appearance',
                personality: 'personality',
                background: 'background',
                speechHabits: 'speechHabits',
                sampleDialogues: 'sampleDialogues',
                emotionalTriggers: 'emotionalTriggers',
                attitudeToUser: 'attitudeToUser'
            }, function(name, src) {
                return {
                    name: name,
                    title: (src && src.title) || '',
                    identity: (src && src.identity) || '',
                    identitySurface: (src && src.identitySurface) || '',
                    identityHidden: (src && src.identityHidden) || '',
                    relation: (src && src.relation) || '',
                    mood: '',
                    location: '',
                    outfit: '',
                    favorability: (src && typeof src.favorability === 'number') ? src.favorability : 0,
                    favor: (src && typeof src.favor === 'number') ? src.favor : ((src && typeof src.favorability === 'number') ? src.favorability : 0),
                    status: '',
                    desc: (src && src.desc) || '',
                    tags: Array.isArray(src && src.tags) ? src.tags : [],
                    stats: Array.isArray(src && src.stats) ? src.stats : [],
                    notes: (src && src.notes) || '',
                    id: (src && src.id) || '',
                    // Mufy 风格扩展字段默认值
                    appearance: (src && src.appearance) || '',
                    personality: (src && src.personality) || '',
                    background: (src && src.background) || '',
                    speechHabits: (src && src.speechHabits) || '',
                    sampleDialogues: Array.isArray(src && src.sampleDialogues) ? src.sampleDialogues : [],
                    emotionalTriggers: Array.isArray(src && src.emotionalTriggers) ? src.emotionalTriggers : [],
                    attitudeToUser: (src && src.attitudeToUser) || '',
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
                    // 通过 QuestMutator 统一判断（fallback 为内联兼容）
                    var _isComp = (typeof QuestMutator !== 'undefined') ? QuestMutator.isCompleted(q.status) : (q.status === '已完成' || q.status === 'resolved');
                    var _isFail = (typeof QuestMutator !== 'undefined') ? QuestMutator.isFailed(q.status) : (q.status === '已失败' || q.status === '失败' || q.status === 'broken');
                    if (_isComp) {
                        gq.status = 'resolved';
                        if (!gq.resolvedTurn) gq.resolvedTurn = turn;
                    } else if (_isFail) {
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
    },

    // [T1-P1-27] GameMemory -> StateManager 反向同步统一入口
    // 旧实现 core.js:265-279 三个 _syncXxx 函数用 StateManager.set 直接写，
    // 绕过 Mutator 的 normalize / 限额 / 事务。
    // 现统一收敛到适配器层，内部用 BagMutator.setItems / QuestMutator.setQuests /
    // RelationshipMutator.mergeRelationships 走 Mutator 主路径。
    // Mutator 不可用时降级到 StateManager.set（与旧实现行为一致），保证向后兼容。
    syncFromGameMemory(tableName) {
        if (typeof GameMemory === 'undefined') return;
        if (!StateManager || !StateManager.set) return;
        const gm = GameMemory;
        const turn = StateManager.get('progress.turn') || 0;

        // === items: gm.tables.items (keyed) → entities.bag (array) ===
        if (tableName === 'items' || tableName === 'all') {
            if (gm.tables && gm.tables.items) {
                const arr = Object.keys(gm.tables.items).map(function(name) {
                    const it = gm.tables.items[name] || {};
                    return {
                        name: name,
                        count: it.qty !== undefined ? it.qty : 1,
                        unit: it.unit || '个',
                        rarity: it.rarity || '普通',
                        rarityClass: it.rarityClass || '',
                        desc: it.desc || '',
                        usable: !!it.usable,
                        effect: it.effect || '',
                        equippable: !!it.equippable,
                        equipped: !!it.equipped,
                        slot: it.slot || ''
                    };
                }).filter(function(b) { return b.name; });
                if (typeof BagMutator !== 'undefined' && BagMutator.setItems) {
                    BagMutator.setItems(arr, { silent: true });
                } else {
                    StateManager.set('entities.bag', arr, { silent: true });
                }
            }
        }

        // === quests: gm.quests (array) → entities.quests (array) ===
        if (tableName === 'quests' || tableName === 'all') {
            if (Array.isArray(gm.quests)) {
                const arr = gm.quests.map(function(q) {
                    return {
                        title: q.title,
                        type: q.type || 'quest',
                        status: q.status || 'pending',
                        progress: q.progress || '',
                        hint: q.hint || '',
                        desc: q.desc || '',
                        rewards: q.rewards || '',
                        id: q.id || ''
                    };
                }).filter(function(q) { return q.title; });
                if (typeof QuestMutator !== 'undefined' && QuestMutator.setQuests) {
                    QuestMutator.setQuests(arr, { silent: true });
                } else {
                    StateManager.set('entities.quests', arr, { silent: true });
                }
            }
        }

        // === relationships: gm.tables.relationships (keyed) → entities.relationships (array) ===
        if (tableName === 'relationships' || tableName === 'all') {
            if (gm.tables && gm.tables.relationships) {
                const out = [];
                Object.keys(gm.tables.relationships).forEach(function(k) {
                    const v = gm.tables.relationships[k];
                    if (!v) return;
                    if (Array.isArray(v)) v.forEach(function(item) { if (item) out.push(item); });
                    else out.push(v);
                });
                if (typeof RelationshipMutator !== 'undefined' && RelationshipMutator.mergeRelationships) {
                    RelationshipMutator.mergeRelationships(out, { silent: true });
                } else {
                    StateManager.set('entities.relationships', out, { silent: true });
                }
            }
        }

        // === characters / locations: 同样模式（keyed → array）===
        if (tableName === 'characters' || tableName === 'all') {
            if (gm.tables && gm.tables.characters) {
                const arr = Object.keys(gm.tables.characters).map(function(name) {
                    return gm.tables.characters[name];
                }).filter(function(c) { return c && c.name; });
                if (arr.length > 0 && typeof CharacterMutator !== 'undefined' && CharacterMutator.setCharacters) {
                    CharacterMutator.setCharacters(arr, { silent: true });
                } else {
                    StateManager.set('entities.characters', arr, { silent: true });
                }
            }
        }

        if (tableName === 'locations' || tableName === 'all') {
            if (gm.tables && gm.tables.locations) {
                const arr = Object.keys(gm.tables.locations).map(function(name) {
                    return gm.tables.locations[name];
                }).filter(function(l) { return l && l.name; });
                if (arr.length > 0 && typeof LocationMutator !== 'undefined' && LocationMutator.setLocations) {
                    LocationMutator.setLocations(arr, { silent: true });
                } else {
                    StateManager.set('entities.locations', arr, { silent: true });
                }
            }
        }

        return true;
    }
};
