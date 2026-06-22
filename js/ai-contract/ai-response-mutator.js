// ========================================
// AI 响应变更器
// 将 ResponseParser 解析结果写入 StateManager
// ========================================
var AIResponseMutator = {
    // 应用解析结果到状态
    apply: function(parsed, options) {
        options = options || {};
        if (!parsed || !parsed.success) {
            console.warn('[AIResponseMutator] 解析未成功，跳过状态写入');
            return { success: false, changes: [] };
        }
        var data = parsed.data || {};
        var self = this;
        var result = { success: true, changes: [] };

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
    _applyAll: function(data, result, options) {
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
    _applyStoryAndTitle: function(data) {
        var story = OutputSanitizer ? OutputSanitizer.sanitizeStory(data.story || '') : (data.story || '');
        var title = String(data.title || data.sceneTitle || data.chapterTitle || '').trim();
        if (story) {
            StateManager.set('progress.sceneTitle', title || StateManager.get('progress.sceneTitle') || '', { silent: true });
            StateManager.set('progress.lastSceneTitle', title || StateManager.get('progress.sceneTitle') || '', { silent: true });
        }
    },

    // 回合数推进
    _applyTurn: function(data) {
        var currentTurn = parseInt(StateManager.get('progress.turn') || 0) || 0;
        StateManager.set('progress.turn', currentTurn + 1, { silent: true });
        StateManager.setLegacy('_stats.totalTurns', currentTurn + 1, { silent: true });
    },

    // 主角信息
    _applyPlayer: function(data) {
        var player = data.player || data.protagonist || data.hero;
        if (!player || typeof player !== 'object') return;
        var current = StateManager.get('entities.player') || {};
        var normalized = {
            name: String(player.name || current.name || '').trim(),
            identity: String(player.identity || current.identity || '').trim(),
            stats: Array.isArray(player.stats) ? player.stats : (current.stats || [])
        };
        StateManager.set('entities.player', normalized, { silent: true });
        StateManager.setLegacy('playerData', normalized, { silent: true });
    },

    // NPC / 角色
    _applyCharacters: function(data) {
        var characters = data.characters || data.npcs;
        if (!characters || !Array.isArray(characters) || characters.length === 0) return;
        if (typeof CharacterMutator !== 'undefined' && CharacterMutator.mergeCharacters) {
            CharacterMutator.mergeCharacters(characters, { silent: true });
        } else {
            StateManager.set('entities.characters', characters, { silent: true });
            StateManager.setLegacy('allCharacters', characters, { silent: true });
        }
    },

    // 物品
    _applyBag: function(data) {
        var bag = data.bag || data.items || data.inventory;
        if (!bag || !Array.isArray(bag) || bag.length === 0) return;
        if (typeof BagMutator !== 'undefined' && BagMutator.mergeItems) {
            BagMutator.mergeItems(bag, { silent: true });
        } else {
            StateManager.set('entities.bag', bag, { silent: true });
            StateManager.setLegacy('currentBag', bag, { silent: true });
        }
    },

    // 货币
    _applyCurrency: function(data) {
        if (data.currency === undefined && data.money === undefined && data.gold === undefined) return;
        var currency = data.currency !== undefined ? data.currency : (data.money !== undefined ? data.money : data.gold);
        var num = parseInt(currency);
        if (isNaN(num)) return;
        StateManager.set('entities.currency', num, { silent: true });
        if (data.currencyName) {
            StateManager.set('entities.currencyName', String(data.currencyName), { silent: true });
        }
    },

    // 任务
    _applyQuests: function(data) {
        var quests = data.quests || data.missions || data.tasks;
        if (!quests || !Array.isArray(quests) || quests.length === 0) return;
        if (typeof QuestMutator !== 'undefined' && QuestMutator.setQuests) {
            QuestMutator.setQuests(quests, { silent: true });
        } else {
            StateManager.set('entities.quests', quests, { silent: true });
            StateManager.setLegacy('currentQuests', quests, { silent: true });
        }
    },

    // 游戏时间
    _applyGameTime: function(data) {
        var time = data.gameTime || data.time || {};
        if (!time || typeof time !== 'object') return;
        if (typeof TimeMutator !== 'undefined' && TimeMutator.setTime) {
            TimeMutator.setTime(time, { silent: true });
        } else {
            StateManager.set('time', time, { silent: true });
            StateManager.setLegacy('gameTime', time, { silent: true });
        }
    },

    // 地点
    _applyLocations: function(data) {
        var locations = data.locations || data.places;
        if (!locations || !Array.isArray(locations) || locations.length === 0) return;
        var normalized = locations.map(function(loc) {
            if (typeof loc === 'string') return { name: loc.trim(), desc: '' };
            return {
                name: String(loc.name || loc.title || '').trim(),
                desc: String(loc.desc || loc.description || '').trim()
            };
        }).filter(function(loc) { return loc.name && loc.name.length > 1 && !/^(阳光|依靠触觉|空气|风|雨|雪|味道|声音|感觉|情绪)$/.test(loc.name); });
        if (normalized.length === 0) return;
        StateManager.set('entities.locations', normalized, { silent: true });
    },

    // 关键事件
    _applyKeyEvents: function(data) {
        var events = data.keyEvents || data.events || data.plotEvents;
        if (!events || !Array.isArray(events) || events.length === 0) return;
        var normalized = events.map(function(ev) {
            if (typeof ev === 'string') return { title: ev.trim(), desc: '', turn: StateManager.get('progress.turn') || 0 };
            return {
                title: String(ev.title || ev.name || '').trim(),
                desc: String(ev.desc || ev.description || '').trim(),
                turn: ev.turn || StateManager.get('progress.turn') || 0
            };
        }).filter(function(ev) { return ev.title; });
        if (normalized.length === 0) return;
        StateManager.set('entities.events', normalized, { silent: true });
        StateManager.setLegacy('keyEvents', normalized, { silent: true });
    },

    // 关系变化（简化合并到角色）
    _applyRelationships: function(data) {
        var relationships = data.relationships || data.relations;
        if (!relationships || !Array.isArray(relationships) || relationships.length === 0) return;
        var self = this;
        relationships.forEach(function(r) {
            if (!r || !r.name) return;
            if (typeof CharacterMutator !== 'undefined' && CharacterMutator.updateRelationship) {
                CharacterMutator.updateRelationship(r.name, parseInt(r.delta || r.change || r.favor || 0) || 0, { silent: true });
            } else {
                var list = StateManager.get('entities.characters') || [];
                var updated = list.map(function(c) {
                    if (c.name !== r.name) return c;
                    var clone = StateSchema.deepClone ? StateSchema.deepClone(c) : Object.assign({}, c);
                    clone.favor = (clone.favor || 0) + (parseInt(r.delta || r.change || r.favor || 0) || 0);
                    return clone;
                });
                StateManager.set('entities.characters', updated, { silent: true });
            }
        });
    },

    // HUD 信息
    _applyHUD: function(data) {
        var hud = data.hud || data.status || {};
        if (!hud || typeof hud !== 'object') return;
        StateManager.set('ui.lastHUD', hud, { silent: true });
        StateManager.setLegacy('_lastHUD', hud, { silent: true });
    },

    // 上下文摘要
    _applyContextSummary: function(data) {
        var summary = data.contextSummary || data.summary || '';
        if (!summary) return;
        StateManager.set('progress.rollingSummary', summary, { silent: true });
        StateManager.setLegacy('rollingSummary', summary, { silent: true });
    },

    // 收集变更路径（用于测试/调试）
    _collectChanges: function() {
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
