// ========================================
// AI 响应变更器
// 将 ResponseParser 解析结果写入 StateManager
// ========================================
const AIResponseMutator = {
    // 应用解析结果到状态
    apply(parsed, options) {
        options = options || {};
        if (!parsed || !parsed.success) {
            console.warn('[AIResponseMutator] 解析未成功，跳过状态写入');
            return { success: false, changes: [] };
        }
        const data = parsed.data || {};
        var self = this;
        const result = { success: true, changes: [] };

        try {
            if (typeof StateManager !== 'undefined' && StateManager.transaction) {
                StateManager.transaction(function() {
                    self._applyAll(data, result, options);
                });
            } else {
                self._applyAll(data, result, options);
            }
        } catch (e) {
            console.error('[AIResponseMutator] 应用状态失败:', e);
            result.success = false;
            result.error = e.message;
        }

        return result;
    },

    // 统一写入所有字段
    _applyAll(data, result, options) {
        this._applyStoryAndTitle(data);
        this._applyTurn(data);
        this._applyPlayer(data);
        this._applyCharacters(data);
        this._applyBag(data);
        this._applyCurrency(data);
        this._applyQuests(data);
        this._applyGameTime(data);
        this._applyLocations(data);
        this._applyKeyEvents(data);
        this._applyRelationships(data);
        this._applyHUD(data);
        this._applyContextSummary(data);
        result.changes = this._collectChanges();
    },

    // 剧情与标题
    _applyStoryAndTitle(data) {
        const story = OutputSanitizer ? OutputSanitizer.sanitizeStory(data.story || '') : (data.story || '');
        const title = String(data.title || data.sceneTitle || data.chapterTitle || '').trim();
        if (story) {
            StateManager.set('progress.sceneTitle', title || StateManager.get('progress.sceneTitle') || '', { silent: true });
            StateManager.set('progress.lastSceneTitle', title || StateManager.get('progress.sceneTitle') || '', { silent: true });
        }
    },

    // 回合数推进
    _applyTurn(data) {
        const currentTurn = parseInt(StateManager.get('progress.turn') || 0) || 0;
        StateManager.set('progress.turn', currentTurn + 1, { silent: true });
        StateManager.setLegacy('_stats.totalTurns', currentTurn + 1, { silent: true });
    },

    // 主角信息
    _applyPlayer(data) {
        const player = data.player || data.protagonist || data.hero;
        // 【修复BUG-003】AI 返回纯文本时，AIOutputSchema.normalize 会填充默认 player
        // { name: '', identity: '', stats: [] }，此处若不拦截会用空 stats 覆盖已有属性，
        // 导致个人页属性消失。判定为"空 player"（无 name 且无 identity 且 stats 为空数组）时直接跳过。
        const _isEmptyPlayer = function(p) {
            if (!p || typeof p !== 'object') return true;
            const hasName = String(p.name || '').trim();
            const hasIdentity = String(p.identity || '').trim();
            const hasStats = Array.isArray(p.stats) ? p.stats.length > 0 : !!p.stats;
            const hasOther = p.title || p.personality || p.level !== undefined || p.exp !== undefined;
            return !hasName && !hasIdentity && !hasStats && !hasOther;
        };
        if (_isEmptyPlayer(player)) return;
        const current = StateManager.get('entities.player') || {};
        // 玩家设定的主角名优先级最高，禁止 AI 覆盖
        let lockedName = current.name || '';
        if (!lockedName && typeof gameState !== 'undefined') {
            lockedName = gameState.playerName || (gameState.playerData && gameState.playerData.name) || '';
        }
        const aiName = String(player.name || '').trim();
        if (aiName && aiName !== lockedName) {
            console.warn('[AIResponseMutator] AI 尝试覆盖主角名 "' + lockedName + '" 为 "' + aiName + '"，已拦截');
        }
        const normalized = {
            name: lockedName || aiName || '主角',
            identity: String(player.identity || current.identity || '').trim(),
            // 【修复BUG-003】仅在 AI 返回了非空 stats 数组时才覆盖，否则保留上一轮属性，
            // 避免 AI 返回空 stats（或默认空数组）清空已生成的属性
            stats: (Array.isArray(player.stats) && player.stats.length > 0) ? player.stats : (current.stats || []),
            // 【修复 P1】保留 current 上的 level/exp/title/personality，避免被 AI 返回的 3 字段覆盖丢失
            level: player.level !== undefined ? player.level : current.level,
            exp: player.exp !== undefined ? player.exp : current.exp,
            title: player.title !== undefined ? player.title : current.title,
            personality: player.personality !== undefined ? player.personality : current.personality
        };
        StateManager.set('entities.player', normalized, { silent: true });
        StateManager.setLegacy('playerData', normalized, { silent: true });
        // 同步到 playerName，确保全项目读取一致
        if (typeof gameState !== 'undefined') {
            gameState.playerName = normalized.name;
        }
    },

    // NPC / 角色
    _applyCharacters(data) {
        const characters = data.characters || data.npcs;
        if (!characters || !Array.isArray(characters) || characters.length === 0) return;
        if (typeof CharacterMutator !== 'undefined' && CharacterMutator.mergeCharacters) {
            CharacterMutator.mergeCharacters(characters, { silent: true });
        } else {
            StateManager.set('entities.characters', characters, { silent: true });
            StateManager.setLegacy('allCharacters', characters, { silent: true });
        }
    },

    // 物品
    _applyBag(data) {
        const bag = data.bag || data.items || data.inventory;
        if (!bag || !Array.isArray(bag) || bag.length === 0) return;
        if (typeof BagMutator !== 'undefined' && BagMutator.mergeItems) {
            BagMutator.mergeItems(bag, { silent: true });
        } else {
            StateManager.set('entities.bag', bag, { silent: true });
            StateManager.setLegacy('currentBag', bag, { silent: true });
        }
    },

    // 货币
    _applyCurrency(data) {
        if (data.currency === undefined && data.money === undefined && data.gold === undefined) return;
        const currency = data.currency !== undefined ? data.currency : (data.money !== undefined ? data.money : data.gold);
        const num = parseInt(currency);
        if (isNaN(num)) return;
        StateManager.set('entities.currency', num, { silent: true });
        if (data.currencyName) {
            StateManager.set('entities.currencyName', String(data.currencyName), { silent: true });
        }
        // 同步到旧字段，确保 phone-ui 等读取 gameState.currency 的模块一致
        if (typeof gameState !== 'undefined') {
            gameState.currency = num;
            if (data.currencyName) gameState.currencyName = String(data.currencyName);
        }
    },

    // 任务
    _applyQuests(data) {
        const quests = data.quests || data.missions || data.tasks;
        if (quests && Array.isArray(quests) && quests.length > 0) {
            if (typeof QuestMutator !== 'undefined' && QuestMutator.setQuests) {
                QuestMutator.setQuests(quests, { silent: true });
            } else {
                StateManager.set('entities.quests', quests, { silent: true });
                StateManager.setLegacy('currentQuests', quests, { silent: true });
            }
        }
        // 【修复任务进度】根据剧情文本自动推进任务进度
        const story = data.story || '';
        if (story && typeof QuestMutator !== 'undefined' && QuestMutator.autoAdvanceByStory) {
            QuestMutator.autoAdvanceByStory(story, { silent: true });
        }
    },

    // 游戏时间
    _applyGameTime(data) {
        const time = data.gameTime || data.time || {};
        if (!time || typeof time !== 'object') return;
        if (typeof TimeMutator !== 'undefined' && TimeMutator.setTime) {
            TimeMutator.setTime(time, { silent: true });
        } else {
            StateManager.set('time', time, { silent: true });
            StateManager.setLegacy('gameTime', time, { silent: true });
        }
    },

    // 地点
    _applyLocations(data) {
        const locations = data.locations || data.places;
        if (!locations || !Array.isArray(locations) || locations.length === 0) return;
        const normalized = locations.map(function(loc) {
            if (typeof loc === 'string') return { name: loc.trim(), desc: '' };
            return {
                name: String(loc.name || loc.title || '').trim(),
                desc: String(loc.desc || loc.description || '').trim()
            };
        }).filter(loc => loc.name && loc.name.length > 1 && !/^(阳光|依靠触觉|空气|风|雨|雪|味道|声音|感觉|情绪)$/.test(loc.name));
        if (normalized.length === 0) return;
        StateManager.set('entities.locations', normalized, { silent: true });
    },

    // 关键事件
    _applyKeyEvents(data) {
        const events = data.keyEvents || data.events || data.plotEvents;
        if (!events || !Array.isArray(events) || events.length === 0) return;
        const normalized = events.map(function(ev) {
            if (typeof ev === 'string') return { title: ev.trim(), desc: '', turn: StateManager.get('progress.turn') || 0 };
            return {
                title: String(ev.title || ev.name || '').trim(),
                desc: String(ev.desc || ev.description || '').trim(),
                turn: ev.turn || StateManager.get('progress.turn') || 0
            };
        }).filter(ev => ev.title);
        if (normalized.length === 0) return;
        StateManager.set('entities.events', normalized, { silent: true });
        StateManager.setLegacy('keyEvents', normalized, { silent: true });
    },

    // 关系变化（简化合并到角色）
    _applyRelationships(data) {
        const relationships = data.relationships || data.relations;
        if (!relationships || !Array.isArray(relationships) || relationships.length === 0) return;
        var self = this;
        relationships.forEach(function(r) {
            if (!r || !r.name) return;
            if (typeof CharacterMutator !== 'undefined' && CharacterMutator.updateRelationship) {
                CharacterMutator.updateRelationship(r.name, parseInt(r.delta || r.change || r.favor || 0) || 0, { silent: true });
            } else {
                const list = StateManager.get('entities.characters') || [];
                const updated = list.map(function(c) {
                    if (c.name !== r.name) return c;
                    const clone = StateSchema.deepClone ? StateSchema.deepClone(c) : Object.assign({}, c);
                    // 【修复 P1】双写 favorability（权威字段）和 favor（兼容镜像），
                    // 与 CharacterMutator.updateRelationship 保持一致，避免 UI 读 favorability 时拿不到更新
                    var delta = parseInt(r.delta || r.change || r.favor || 0) || 0;
                    clone.favorability = (clone.favorability !== undefined ? clone.favorability : (clone.favor || 0)) + delta;
                    clone.favor = clone.favorability;
                    return clone;
                });
                StateManager.set('entities.characters', updated, { silent: true });
            }
        });
    },

    // HUD 信息
    _applyHUD(data) {
        const hud = data.hud || data.status || {};
        if (!hud || typeof hud !== 'object') return;
        StateManager.set('ui.lastHUD', hud, { silent: true });
        StateManager.setLegacy('_lastHUD', hud, { silent: true });
    },

    // 上下文摘要
    _applyContextSummary(data) {
        const summary = data.contextSummary || data.summary || '';
        if (!summary) return;
        StateManager.set('progress.rollingSummary', summary, { silent: true });
        StateManager.setLegacy('rollingSummary', summary, { silent: true });
    },

    // 收集变更路径（用于测试/调试）
    _collectChanges() {
        return [
            'progress.turn',
            'progress.sceneTitle',
            'progress.lastSceneTitle',
            'entities.player',
            'entities.characters',
            'entities.bag',
            'entities.currency',
            'entities.quests',
            'time',
            'entities.locations',
            'entities.events',
            'ui.lastHUD',
            'progress.rollingSummary'
        ];
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = AIResponseMutator;
