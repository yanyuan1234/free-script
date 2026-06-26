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
        'failed': '已失败',
        'failure': '已失败',
        'fail': '已失败',
        'abandoned': '已放弃',
        'cancelled': '已放弃',
        'canceled': '已放弃'
    },

    // 设置任务列表（智能合并，不直接覆盖）
    setQuests(quests, options) {
        // 【P0修复BUG-005】类型安全：quests 可能是单个对象，强制转为数组
        const arr = Array.isArray(quests) ? quests : (quests ? [quests] : []);
        const incoming = arr.map(this.normalizeQuest.bind(this)).filter(Boolean);
        const rawExisting = StateManager.get('entities.quests');
        const existing = Array.isArray(rawExisting) ? rawExisting : [];
        const merged = this._smartMerge(existing, incoming);
        // 【数据断层修复】只写新路径，StateManager._syncLegacyMirror 自动同步到 currentQuests
        return StateManager.set('entities.quests', merged, options);
    },

    // 智能合并：保留已完成的进度、取最新进度、防止 AI 回退进度
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
        return result;
    },

    // 选择更高的进度字符串
    // 【P1修复】比较比率（current/total）而非仅比较分子，防止进度倒退
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
    _parseProgressParts(progress) {
        if (!progress) return { current: 0, total: 1 };
        const parts = String(progress).split('/');
        if (parts.length === 2) {
            return { current: safeInt(parts[0], 0), total: safeInt(parts[1], 1) };
        }
        // 纯数字视为 current
        const n = parseInt(progress);
        return { current: isNaN(n) ? 0 : n, total: 1 };
    },

    // 添加任务
    addQuest(quest, options) {
        const normalized = this.normalizeQuest(quest);
        if (!normalized) return false;
        const quests = StateManager.get('entities.quests') || [];
        const existing = quests.find((q) => q.id === normalized.id || q.title === normalized.title);
        if (existing) {
            // 合并更新（同 setQuests 的智能逻辑）
            normalized.progress = this._pickHigherProgress(existing.progress, normalized.progress);
            if (existing.status === this.STATUS.COMPLETED || existing.status === this.STATUS.FAILED) {
                normalized.status = existing.status;
            }
            Object.assign(existing, normalized);
        } else {
            quests.push(normalized);
        }
        return this.setQuests(quests, options);
    },

    // 根据剧情文本自动推进任务进度
    // 【P1修复BUG-4.8】与 QuestSystem.advanceGuidanceQuest 职责分离说明：
    // - autoAdvanceByStory：基于剧情文本关键词 + 完成类动词，标记 AI 返回的持久化任务完成
    //   操作对象：StateManager.get('entities.quests')（AI 返回的任务）
    // - advanceGuidanceQuest：基于玩家行动计数，推进临时引导任务（"继续探索"）进度
    //   操作对象：QuestSystem._cachedGuidanceQuest（transient，不在 StateManager 持久化）
    // 两者操作不同数据，不会同一回合重复标记同一任务完成。
    // 引导任务通过 id 前缀 'guidance_' 跳过关键词匹配（"继续探索"的关键词过于泛化，
    // 会误匹配大量剧情文本；引导任务只应通过行动计数推进）。
    autoAdvanceByStory(storyText, options) {
        if (!storyText) return { changed: false };
        const quests = StateManager.get('entities.quests') || [];
        let changed = false;
        var self = this;
        const lowerStory = String(storyText).toLowerCase();
        const completionKeywords = /完成|办完|搞定|结束|达成|通过|领取|收到|获得|入学|报到|注册|签到|了解|查明|探明|解决|击败|战胜|说服|答应|同意|邀请/;
        quests.forEach(function(q) {
            if (!q || q.status === self.STATUS.COMPLETED || q.status === self.STATUS.FAILED) return;
            const title = String(q.title || '');
            if (!title) return;
            // 【P1修复BUG-4.8】跳过引导任务（id 前缀 'guidance_'）：引导任务仅通过
            // advanceGuidanceQuest 的行动计数推进，不参与关键词匹配，避免"继续探索"
            // 等泛化关键词误触发完成
            if (q.id && String(q.id).indexOf('guidance_') === 0) return;
            // 任务标题关键词在剧情中出现，且伴随完成类动词，则标记完成
            const titleKeywords = self._extractKeywords(title);
            const matched = titleKeywords.some((kw) => lowerStory.indexOf(kw) !== -1);
            if (matched && completionKeywords.test(lowerStory)) {
                q.status = self.STATUS.COMPLETED;
                const parts = self._parseProgressParts(q.progress);
                if (parts.total > 0) {
                    q.progress = parts.total + '/' + parts.total;
                } else {
                    q.progress = '1/1';
                }
                changed = true;
                console.log('[任务系统] 剧情触发任务完成:', q.title);
            }
        });
        if (changed) {
            this.setQuests(quests, options);
        }
        return { changed: changed };
    },

    // 从任务标题提取关键词（中文按词/字，英文按词）
    // 【P1修复】stopWords 改为整词匹配，避免子串误过滤（如"前进"含"前"被误删）
    _extractKeywords(title) {
        const t = String(title).toLowerCase().trim();
        if (!t) return [];
        // 停用词列表（整词匹配，非子串）
        const stopWords = ['的', '了', '和', '与', '或', '在', '到', '去', '个', '件', '项', '等', '之', '后', '前', '中', '上', '下'];
        let parts = t.split(/[\s·，,、；;:!?！？()（）\[\]【】]+/).filter(function(s) {
            if (s.length < 2) return false;
            // 整词匹配停用词
            return stopWords.indexOf(s) === -1;
        });
        if (parts.length === 0 && t.length >= 2) parts = [t];
        return parts;
    },

    // 标准化任务
    // 【P1修复BUG-4.13】统一 quest schema：QuestMutator 为权威 schema。
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
            // 【P1修复BUG-4.13】GameMemory 运行时字段（避免回写丢失）
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
