// ========================================
// 任务变更器 - QuestMutator
// ========================================
var QuestMutator = {
    // 内置状态映射
    STATUS: {
        ACTIVE: '进行中',
        COMPLETED: '已完成',
        FAILED: '已失败',
        ABANDONED: '已放弃'
    },
    TYPE: {
        MAIN: '主线',
        SIDE: '支线',
        HIDDEN: '隐藏'
    },

    // AI/旧状态英文映射到中文
    _statusMap: {
        'pending': '进行中',
        'active': '进行中',
        'in_progress': '进行中',
        'ongoing': '进行中',
        'completed': '已完成',
        'done': '已完成',
        'finished': '已完成',
        'success': '已完成',
        'failed': '已失败',
        'failure': '已失败',
        'fail': '已失败',
        'abandoned': '已放弃',
        'cancelled': '已放弃',
        'canceled': '已放弃'
    },

    // 设置任务列表
    setQuests: function(quests, options) {
        var normalized = (quests || []).map(this.normalizeQuest.bind(this)).filter(Boolean);
        // 同时写入新路径和旧路径，保持兼容性
        StateManager.set('entities.quests', normalized, { silent: true });
        return StateManager.set('currentQuests', normalized, options);
    },

    // 添加任务
    addQuest: function(quest, options) {
        var normalized = this.normalizeQuest(quest);
        if (!normalized) return false;
        var quests = StateManager.get('entities.quests') || [];
        var existing = quests.find(function(q) {
            return q.id === normalized.id || q.title === normalized.title;
        });
        if (existing) {
            // 合并更新
            Object.assign(existing, normalized);
        } else {
            quests.push(normalized);
        }
        return this.setQuests(quests, options);
    },

    // 更新任务
    updateQuest: function(id, updater, options) {
        var quests = StateManager.get('entities.quests') || [];
        var updated = quests.map(function(q) {
            if (q.id === id) {
                var clone = StateSchema.deepClone(q);
                return updater(clone) || clone;
            }
            return q;
        });
        return this.setQuests(updated, options);
    },

    // 标准化任务
    normalizeQuest: function(raw) {
        if (!raw) return null;
        var title = String(raw.title || raw.name || raw.quest || '').trim();
        if (!title) return null;
        var status = this.normalizeStatus(raw.status);
        var type = this.normalizeType(raw.type);
        return {
            id: raw.id || ('quest_' + title + '_' + Date.now()),
            title: title,
            type: type,
            status: status,
            desc: raw.desc || raw.description || '',
            progress: raw.progress || '0/1',
            hint: raw.hint || '',
            rewards: this.normalizeRewards(raw.rewards),
            deadline: raw.deadline || raw.timeLimit || null,
            priority: raw.priority || 50
        };
    },

    // 标准化状态
    normalizeStatus: function(status) {
        if (!status) return this.STATUS.ACTIVE;
        var key = String(status).toLowerCase().trim();
        return this._statusMap[key] || String(status);
    },

    // 标准化类型
    normalizeType: function(type) {
        if (!type) return this.TYPE.SIDE;
        var key = String(type).toLowerCase().trim();
        var map = {
            'main': this.TYPE.MAIN,
            '主线': this.TYPE.MAIN,
            'side': this.TYPE.SIDE,
            '支线': this.TYPE.SIDE,
            'hidden': this.TYPE.HIDDEN,
            '隐藏': this.TYPE.HIDDEN
        };
        return map[key] || String(type);
    },

    // 标准化奖励
    normalizeRewards: function(rewards) {
        if (!Array.isArray(rewards)) return [];
        return rewards.map(function(r) {
            if (!r) return null;
            return {
                type: r.type || 'item',
                name: r.name || r.title || '',
                amount: r.amount !== undefined ? r.amount : 1
            };
        }).filter(Boolean);
    }
};
