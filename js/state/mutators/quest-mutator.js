// ========================================
// 任务变更器 - QuestMutator
// ========================================
const QuestMutator = {
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
        'resolved': '已完成',
        'failed': '已失败',
        'failure': '已失败',
        'fail': '已失败',
        'abandoned': '已放弃',
        'cancelled': '已放弃',
        'canceled': '已放弃'
    },

    // 设置任务列表（智能合并，不直接覆盖）
    setQuests(quests, options) {

        const arr = Array.isArray(quests) ? quests : (quests ? [quests] : []);
        const incoming = arr.map(this.normalizeQuest.bind(this)).filter(Boolean);
        const rawExisting = StateManager.get('entities.quests');
        const existing = Array.isArray(rawExisting) ? rawExisting : [];
        const merged = this._smartMerge(existing, incoming);
        // 【数据断层修复】只写新路径，StateManager._syncLegacyMirror 自动同步到 currentQuests
        return StateManager.set('entities.quests', merged, options);
    },

    // 智能合并：保留已完成的进度、取最新进度、防止 AI 回退进度
    // 已完成/失败任务最多保留3条，避免长期游戏任务列表无限增长
    _smartMerge(existing, incoming) {
        const map = {};
        const result = [];
        existing.forEach(function(q) {
            if (!q || !q.title) return;
            map[q.title] = q;
            result.push(q);
        });
        incoming.forEach(function(q) {
            if (!q || !q.title) return;
            const old = map[q.title];
            if (old) {
                // 保留已完成/失败状态，防止 AI 回退
                if (old.status === QuestMutator.STATUS.COMPLETED || old.status === QuestMutator.STATUS.FAILED) {
                    q.status = old.status;
                }
                // 取更高的进度
                q.progress = QuestMutator._pickHigherProgress(old.progress, q.progress);
                // 合并描述、提示等字段（新值优先，但若为空则保留旧值）
                if (!q.desc && old.desc) q.desc = old.desc;
                if (!q.hint && old.hint) q.hint = old.hint;
                if (!q.rewards || q.rewards.length === 0) q.rewards = old.rewards || [];
                // 保留 id
                if (old.id && !q.id) q.id = old.id;
                const idx = result.indexOf(old);
                if (idx !== -1) result[idx] = q;
            } else {
                result.push(q);
            }
            map[q.title] = q;
        });
        // 原版逻辑：已完成/失败任务最多保留3条，活跃任务全部保留
        var active = result.filter(function(q) { return q.status !== QuestMutator.STATUS.COMPLETED && q.status !== QuestMutator.STATUS.FAILED; });
        var done = result.filter(function(q) { return q.status === QuestMutator.STATUS.COMPLETED || q.status === QuestMutator.STATUS.FAILED; });
        if (done.length > 3) done = done.slice(-3);
        return active.concat(done);
    },

    // 选择更高的进度字符串

    _pickHigherProgress(a, b) {
        const pa = this._parseProgressParts(a);
        const pb = this._parseProgressParts(b);
        const ratioA = pa.total > 0 ? pa.current / pa.total : 0;
        const ratioB = pb.total > 0 ? pb.current / pb.total : 0;
        // 比率高的优先；比率相同时取分母大的（更细粒度）
        if (ratioB > ratioA) return b;
        if (ratioA > ratioB) return a;
        return pb.total >= pa.total ? b : a;
    },

    // 解析进度为 {current, total}
    // 【冗余审计 P1-7】委托给全局 parseProgressParts（utils.js 定义，4 处统一调用）
    _parseProgressParts(progress) {
        return parseProgressParts(progress);
    },

    // 添加任务
    addQuest(quest, options) {
        const normalized = this.normalizeQuest(quest);
        if (!normalized) {
            if (typeof UI !== 'undefined' && UI.toast) UI.toast('任务信息不完整');
            return false;
        }
        // [T1-P1-29] addQuest 改走 setQuests（内部用 _smartMerge 保留 id/desc/hint/rewards），
        // 修复前 Object.assign(existing, normalized) 会用新生成的 id 'quest_title_timestamp' 覆盖 existing.id，
        // 导致 AI 每回合 addQuest 同名任务都换新 id → undo 栈与 UI 锚定失效
        const quests = StateManager.get('entities.quests') || [];
        quests.push(normalized);
        return this.setQuests(quests, options);
    },

    // 完成任务：按 title 查找并标记为指定状态
    //   旧路径（tavern-compat.js:5069-5086, 1214）曾硬编码 self.quests.push/splice
    //   绕过 StateManager，导致 <mem type="quest"> 添加的任务重启后丢失。
    //   该方法统一切换到 StateManager 权威源，由 _syncLegacyMirror 自动同步 gameState.currentQuests。
    resolveQuest(title, status, options) {
        if (!title) {
            if (typeof UI !== 'undefined' && UI.toast) UI.toast('任务标题不能为空');
            return false;
        }
        const targetStatus = status || this.STATUS.COMPLETED;
        const quests = StateManager.get('entities.quests') || [];
        const q = quests.find(function(qq) { return qq && qq.title === title; });
        if (!q) {
            if (typeof UI !== 'undefined' && UI.toast) UI.toast('未找到该任务');
            return false;
        }
        q.status = targetStatus;
        if (targetStatus === this.STATUS.COMPLETED) {
            // 自动补齐进度
            const parts = this._parseProgressParts(q.progress);
            if (parts.total > 0) {
                q.progress = parts.total + '/' + parts.total;
            } else {
                q.progress = '1/1';
            }
        }
        const result = this.setQuests(quests, options);
        if (result && !(options && options.silent) && typeof UI !== 'undefined' && UI.toast) {
            UI.toast(targetStatus === this.STATUS.COMPLETED ? '任务完成：' + title : '任务状态已更新：' + title);
        }
        return result;
    },

    // 【纯 AI 驱动】已移除 autoAdvanceByStory（本地关键词匹配推进任务）。
    // 该机制存在两个问题：
    //   1. 正则无 /g 标志却在 exec 循环中使用，lastIndex 永不前进 → 死循环冻结页面
    //   2. 本地关键词猜测与 AI 的结构化 quests 字段冲突，导致任务被误标完成
    // 任务状态现在完全由 AI 返回的 quests 字段驱动（见 _applyQuests）。
    autoAdvanceByStory(storyText, options) {
        // 兼容占位：直接忽略，永不本地推进任务
        return { changed: false };
    },

    // 标准化任务

    // - title 为身份字段（旧 content 已在 sync 层迁移为 title，此处兼容读取但不输出）
    // - 保留 GameMemory 运行时字段（createdTurn/resolvedTurn/stale），避免 mutator 回写时丢失
    normalizeQuest(raw) {
        if (!raw) return null;
        const title = String(raw.title || raw.name || raw.quest || raw.content || '').trim();
        if (!title) return null;
        const status = this.normalizeStatus(raw.status);
        const type = this.normalizeType(raw.type);
        let progress = raw.progress || '0/1';
        // 若状态为已完成但进度未满，自动补齐
        if (status === this.STATUS.COMPLETED) {
            const parts = this._parseProgressParts(progress);
            if (parts.current < parts.total) {
                progress = parts.total + '/' + parts.total;
            }
        }
        return {
            id: raw.id || ('quest_' + title + '_' + Date.now()),
            title: title,
            type: type,
            status: status,
            desc: raw.desc || raw.description || '',
            progress: progress,
            hint: raw.hint || '',
            rewards: this.normalizeRewards(raw.rewards),
            deadline: raw.deadline || raw.timeLimit || null,
            priority: raw.priority || 50,

            createdTurn: raw.createdTurn || 0,
            resolvedTurn: raw.resolvedTurn || 0,
            stale: !!raw.stale
        };
    },

    // 标准化状态
    normalizeStatus(status) {
        if (!status) return this.STATUS.ACTIVE;
        const key = String(status).toLowerCase().trim();
        return this._statusMap[key] || String(status);
    },

    // 判断是否为已完成状态（中文/英文均支持）
    isCompleted(status) {
        var n = this.normalizeStatus(status);
        return n === this.STATUS.COMPLETED;
    },

    // 判断是否为已失败状态（中文/英文均支持）
    isFailed(status) {
        var n = this.normalizeStatus(status);
        return n === this.STATUS.FAILED;
    },

    // 标准化类型
    normalizeType(type) {
        if (!type) return this.TYPE.SIDE;
        const key = String(type).toLowerCase().trim();
        const map = {
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
    normalizeRewards(rewards) {
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

if (typeof module !== 'undefined' && module.exports) module.exports = QuestMutator;
