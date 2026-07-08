// ========================================
// 任务系统 - Quest System
// ========================================
var QuestSystem = {

    // QuestMutator 在 systems.js 之前加载（见 index.html），故可安全引用；
    // typeof 守卫仅在 QuestMutator 缺失的边缘场景（如 legacy 单元测试）下回退到字面量
    STATUS: (typeof QuestMutator !== 'undefined') ? QuestMutator.STATUS : {
        ACTIVE: '进行中', COMPLETED: '已完成', FAILED: '已失败', ABANDONED: '已放弃'
    },
    TYPE: (typeof QuestMutator !== 'undefined') ? QuestMutator.TYPE : {
        MAIN: '主线', SIDE: '支线', HIDDEN: '隐藏'
    },

    getAllQuests() {

        // 当 StateManager 存在但 entities.quests 未初始化时，get 返回 undefined，
        // 后续 quests.filter 抛 TypeError。fallback || [] 只在 StateManager 为 falsy 时生效。
        // 修正为 `(StateManager.get(...) || fallback)` 让 fallback 在 get 返回 falsy 时也生效。
        var quests = (StateManager ? (StateManager.get('entities.quests') || (gameState.currentQuests || [])) : (gameState.currentQuests || []));
        if (!Array.isArray(quests)) quests = [];
        if (quests.filter(function(q) {
            return q.status === QuestSystem.STATUS.ACTIVE;
            }).length === 0 && (gameState.conversationHistory || []).length > 0) {

            // 再次 push 同一个已完成对象，玩家一直看到"继续探索 - 已完成"。
            // 修复：push 前检查缓存对象 status，已完成则置 null 让下轮重新创建。
            if (QuestSystem._cachedGuidanceQuest && QuestSystem._cachedGuidanceQuest.status !== QuestSystem.STATUS.ACTIVE) {
                QuestSystem._cachedGuidanceQuest = null;
            }
            if (!QuestSystem._cachedGuidanceQuest) {
                QuestSystem._cachedGuidanceQuest = QuestSystem.createGuidanceQuest();
            }
        quests.push(QuestSystem._cachedGuidanceQuest);
    }
    return quests;
    },
    // 动态计算引导任务奖励：基于玩家等级、回合进度和 AI 最近返回的任务奖励
    _computeGuidanceReward: function() {
        var base = 10;

        var player = (typeof StateManager !== 'undefined' && StateManager.get) ? StateManager.get('entities.player') : null;
        var level = (player && player.level) || 1;
        var turns = (typeof StateManager !== 'undefined' && StateManager.get) ? (StateManager.get('progress.turn') || 1) : 1;
        // 参考 AI 最近返回的任务奖励（避免硬编码）
        var reference = 0;
        var quests = (StateManager ? StateManager.get('entities.quests') : (gameState.currentQuests || []));
        var rewardCount = 0;
        quests.forEach(function(q) {
            if (q && q.rewards && q.rewards.length > 0) {
                q.rewards.forEach(function(r) {
                    var amt = parseInt(r && r.amount);
                    if (!isNaN(amt) && amt > 0) {
                        reference += amt;
                        rewardCount++;
                    }
                });
            }
        });
        var avgReward = rewardCount > 0 ? Math.round(reference / rewardCount) : 0;
        var dynamic = base + (level - 1) * 5 + Math.floor(turns / 2) * 3;
        return avgReward > 0 ? Math.max(5, Math.round((avgReward + dynamic) / 2)) : Math.max(5, dynamic);
    },
    createGuidanceQuest() {
        var rewardAmount = this._computeGuidanceReward();
        return {
            id: 'guidance_' + Date.now(),
            title: '继续探索',
            type: QuestSystem.TYPE.MAIN,
            status: QuestSystem.STATUS.ACTIVE,
            desc: '推进剧情发展，探索未知的世界',
            progress: '0/1',
            hint: '选择一个选项或输入自定义行动',
            rewards: [{
                type: 'exp',
                name: '经验值',
                amount: rewardAmount
                }],
            timeLimit: null,
            priority: 999
            };
    },


    // 本方法仅推进 _cachedGuidanceQuest（transient 引导任务"继续探索"）的进度，
    // 不操作 StateManager 中的持久化任务。autoAdvanceByStory 负责 AI 返回任务的关键词匹配。
    // 两者操作不同数据，不会冲突。autoAdvanceByStory 已通过 id 前缀 'guidance_' 跳过引导任务。
    advanceGuidanceQuest() {
        if (!QuestSystem._cachedGuidanceQuest) return;
        var q = QuestSystem._cachedGuidanceQuest;
        if (q.status !== QuestSystem.STATUS.ACTIVE) return;
        var parts = (q.progress || '0/1').split('/');
        var current = safeInt(parts[0], 0);
        var total = safeInt(parts[1], 1);
        if (current < total) {
            current++;
            q.progress = current + '/' + total;
            if (current >= total) {
                q.status = QuestSystem.STATUS.COMPLETED;
                console.log('[任务系统] 引导任务完成:', q.title);
            }
        }
    },

    filterByStatus(quests, status) {
        if (status === 'all') return quests;
        if (status === 'active') return quests.filter(function(q) {
            return q.status === QuestSystem.STATUS.ACTIVE;
            });
        if (status === 'completed') return quests.filter(function(q) {
            return q.status === QuestSystem.STATUS.COMPLETED;
            });
        if (status === 'failed') return quests.filter(function(q) {
            return q.status === QuestSystem.STATUS.FAILED;
            });

        // ABANDONED 状态在 QuestMutator/QuestSystem.STATUS 中有定义，AI 可能返回此状态。
        // 当前 UI（renderQuestPage）未启用"已放弃"筛选按钮，但 filterByStatus/bindFilterEvents
        // 已支持，未来启用只需在 renderQuestPage 补按钮即可。
        if (status === 'abandoned') return quests.filter(function(q) {
            return q.status === QuestSystem.STATUS.ABANDONED;
            });
        return quests.filter(function(q) {
            return q.status === status;
            });
    },
    parseProgress(p) {
        if (!p) return 0;
        var parts = p.split('/');
        if (parts.length === 2) {
            var c = safeInt(parts[0], 0),
            t = safeInt(parts[1], 1);
            return Math.min(100, Math.round((c / t) * 100));
        }
    return 0;
    },

    renderQuestPage(container) {
        var quests = this.getAllQuests();
        var ac = quests.filter(function(q) {
            return q.status === QuestSystem.STATUS.ACTIVE;
            }).length;
        var cc = quests.filter(function(q) {
            return q.status === QuestSystem.STATUS.COMPLETED;
            }).length;
        var fc = quests.filter(function(q) {
            return q.status === QuestSystem.STATUS.FAILED;
            }).length;
        var html = '<div class="quest-page">';
        html +=
        '<div class="quest-stats-card"><div class="quest-stat-item"><div class="quest-stat-num">' +
        ac +
        '</div><div class="quest-stat-label">进行中</div></div><div class="quest-stat-item"><div class="quest-stat-num">' +
        cc +
        '</div><div class="quest-stat-label">已完成</div></div><div class="quest-stat-item"><div class="quest-stat-num">' +
        fc + '</div><div class="quest-stat-label">已失败</div></div></div>';

        var filterBtns = '<button class="quest-filter-btn active" data-quest-filter="all">全部</button>';
        filterBtns += '<button class="quest-filter-btn" data-quest-filter="active">进行中 ' + ac + '</button>';
        filterBtns += '<button class="quest-filter-btn" data-quest-filter="completed">已完成 ' + cc + '</button>';
        filterBtns += '<button class="quest-filter-btn" data-quest-filter="failed">已失败 ' + fc + '</button>';
        html += '<div class="quest-filter-bar">' + filterBtns + '</div>';
        html += '<div class="quest-list-container" id="questListContainer">';
        if (quests.length === 0) {
            html +=
            '<div class="quest-empty-state"><div class="quest-empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div><p>暂无任务</p><p style="font-size:12px;margin-top:4px;">开始游戏后任务会自动生成</p></div>';
            } else {
            html += this.renderQuestList(quests);
        }
    html += '</div></div>';
    container.innerHTML = html;
    this.bindFilterEvents(container);
    },
    renderQuestList(quests) {
        const self = this;

        var typeOrder = { '主线': 0, '支线': 1, '隐藏': 2 };

        // 动态类型注册系统（registerType/registerStatus）已在 systems.js:14 删除，
        // _customTypes/_customStatuses 从未定义，for-in 循环遍历 undefined 无效果且易误导
        var statusOrder = { '进行中': 0, '已完成': 1, '已失败': 2, '已放弃': 3 };
        var sorted = quests.slice().sort(function(a, b) {
            var ta = typeOrder[a.type] !== undefined ? typeOrder[a.type] : 99;
            var tb = typeOrder[b.type] !== undefined ? typeOrder[b.type] : 99;
            if (ta !== tb) return ta - tb;
            var sa = statusOrder[a.status] !== undefined ? statusOrder[a.status] : 99;
            var sb = statusOrder[b.status] !== undefined ? statusOrder[b.status] : 99;
            return sa - sb;
        });
        return sorted.map(function(q) {
            var pp = self.parseProgress(q.progress);
            var tc = q.type === self.TYPE.MAIN ? 'main-quest' : q.type === self.TYPE.SIDE ?
            'side-quest' : 'hidden-quest';
            var sc = q.status === self.STATUS.ACTIVE ? 'status-active' : q.status === self
            .STATUS.COMPLETED ? 'status-completed' : 'status-failed';
            var isC = q.status === self.STATUS.COMPLETED,
            isF = q.status === self.STATUS.FAILED;
            var rh = '';
            if (q.rewards && q.rewards.length > 0) {
                rh = '<div class="quest-rewards">' + q.rewards.map(function(r) {
                    return '<span class="quest-reward-tag">' + escapeHtml(r.name) + (r.amount ?
                    ' x' + escapeHtml(r.amount) : '') + '</span>';
                    }).join('') + '</div>';
            }
        var ph = '';
        if (q.progress && !isC && !isF) {
            ph = '<div class="quest-progress-wrap"><div class="quest-progress-header"><span class="quest-progress-label">进度</span><span class="quest-progress-ratio">' +
            q.progress +
            '</span></div><div class="quest-progress-track"><div class="quest-progress-fill ' +
            (pp < 30 ? 'warning' : '') + '" style="width:' + pp +
            '%;"></div></div></div>';
        }
    var hh = (q.hint && !isC && !isF) ?
    '<div style="font-size:12px;color:var(--text-tertiary);margin-top:8px;padding:8px;background:var(--bg);border-radius:var(--radius-sm);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2v1"/><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/></svg>' +
    escapeHtml(q.hint) + '</div>' : '';

    var dh = '';
    if (q.deadline && !isC && !isF) {

        dh = '<div style="font-size:12px;color:var(--deadline-warn);margin-top:6px;display:flex;align-items:center;gap:4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>截止：' + escapeHtml(q.deadline) + '</div>';
    }
    return '<div class="quest-item-card ' + tc + (isC ? ' completed' : '') + (isF ?
    ' failed' : '') +
    '"><div class="quest-item-header"><span class="quest-item-type ' + (q.type ===
    self.TYPE.MAIN ? 'quest-type-main' : q.type === self.TYPE.SIDE ?
    'quest-type-side' : 'quest-type-hidden') + '">' + escapeHtml(q.type || '') +
    '</span><span class="quest-item-status ' + sc + '">' + escapeHtml(q.status || '') +
    '</span></div><div class="quest-item-title">' + escapeHtml(q.title || '') + '</div>' + (q.desc ?
    '<div class="quest-item-desc">' + escapeHtml(q.desc) + '</div>' : '') + ph + hh + rh + dh +
    '</div>';
    }).join('');
    },
    bindFilterEvents(container) {
        const self = this;
        container.querySelectorAll('[data-quest-filter]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                container.querySelectorAll('[data-quest-filter]').forEach(function(b) {
                    b.classList.remove('active');
                    });
                this.classList.add('active');
                var f = this.dataset.questFilter;
                var quests = self.getAllQuests();
                var filtered = quests;

                if (f === 'active' || f === 'completed' || f === 'failed' || f === 'abandoned') {
                    filtered = self.filterByStatus(quests, f);
                }
            var lc = container.querySelector('#questListContainer');
            if (lc) {
                lc.innerHTML = filtered.length > 0 ? self.renderQuestList(
                filtered) :
                '<div class="quest-empty-state"><div class="quest-empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div><p>该分类下暂无任务</p></div>';
            }
        });
    });
    }

};
// ========================================
// 成就系统 - Achievement System
// ========================================

// fallback 字符串保留，仅在 DOM 未就绪时使用
function _cssVar(name, fallback) {
    try {
        if (typeof document !== 'undefined' && document.documentElement) {
            var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            if (v) return v;
        }
    } catch (e) {}
    return fallback;
}

// 旧代码问题：① ach.rarity.toUpperCase() 对非字符串（数字/null）抛 TypeError 中断成就检测；
//             ② 636/691/693 行 ach.rarity 直接拼 class 属性未 escapeHtml，AI 返回恶意串可 XSS
// 修复：统一用本工具归一化为大写字符串并校验白名单，非字符串或非法值回落 COMMON
var _ACHIEVEMENT_RARITY_WHITELIST = { COMMON: 1, RARE: 1, EPIC: 1, LEGENDARY: 1 };
function _normalizeRarity(r) {
    var s = String(r == null ? 'common' : r).toUpperCase();
    return _ACHIEVEMENT_RARITY_WHITELIST[s] ? s : 'COMMON';
}

function _normalizeCategory(c) {
    return String(c == null ? 'general' : c).toUpperCase();
}
// 成就稀有度 → 背景色（var(--ach-*-bg)）
function _achBgColor(rarity) {
    var map = { common: '--ach-common-bg', rare: '--ach-rare-bg', epic: '--ach-epic-bg', legendary: '--ach-legendary-bg' };
    var fbMap = { common: '#f5f5f5', rare: '#e3f2fd', epic: '#f3e5f5', legendary: '#fff8e1' };
    return _cssVar(map[rarity] || '--ach-common-bg', fbMap[rarity] || '#f5f5f5');
}
// 成就稀有度 → 文字色（var(--ach-*-text)）
function _achTextColor(rarity) {
    var map = { common: '--ach-common-text', rare: '--ach-rare-text', epic: '--ach-epic-text', legendary: '--ach-legendary-text' };
    var fbMap = { common: '#616161', rare: '#1565c0', epic: '#7b1fa2', legendary: '#e65100' };
    return _cssVar(map[rarity] || '--ach-common-text', fbMap[rarity] || '#616161');
}

// 原实现每回合 checkAchievements 对每个成就都 cond.match(regex)，
// 成就条件是静态的（getDefaultAchievements 返回固定定义），重复解析浪费 CPU。
var _ACH_COND_REGEX = /^(\w+)\s*(>=|<=|>|<|==|!=)\s*(\d+)$/;
var _achCondCache = {};
var AchievementSystem = {
    RARITY: {
        COMMON: {
            key: 'common',
            label: '普通',
            color: _cssVar('--rarity-common', '#9e9e9e'),
            points: 10
        },
    RARE: {
        key: 'rare',
        label: '稀有',
        color: _cssVar('--rarity-uncommon', '#2196f3'),
        points: 30
    },
    EPIC: {
        key: 'epic',
        label: '史诗',
        color: _cssVar('--rarity-rare', '#9c27b0'),
        points: 60
    },
    LEGENDARY: {
        key: 'legendary',
        label: '传说',
        color: _cssVar('--rarity-legendary', '#ff9800'),
        points: 100
    }
    },
    CATEGORY: {
        STORY: {
            key: 'story',
            label: '剧情',
            icon: ''
        },
    EXPLORE: {
        key: 'explore',
        label: '探索',
        icon: ''
    },
    SOCIAL: {
        key: 'social',
        label: '社交',
        icon: ''
    },
    COMBAT: {
        key: 'combat',
        label: '战斗',
        icon: ''
    },
    COLLECTION: {
        key: 'collection',
        label: '收集',
        icon: ''
    },
    SPECIAL: {
        key: 'special',
        label: '特殊',
        icon: ''
    }
    },
    getDefaultAchievements() {
        var modules = gameState._worldModules || [];
        var achieveModules = modules.filter(function(m) {
            return m.type === 'achievements' || m.type === 'achievement';
            });
        var aiAchievements = [];
        achieveModules.forEach(function(mod) {
            if (mod.items && Array.isArray(mod.items)) {
                mod.items.forEach(function(item) {
                    aiAchievements.push({
                        id: item.id || 'ach_' + Date.now() + Math.random(),
                        name: item.name || item.title || '未知成就',
                        desc: item.desc || item.description || '完成特定目标解锁',
                        category: item.category || 'general',
                        rarity: item.rarity || 'common',
                        icon: item.icon || '奖',
                        condition: item.condition || 'true',
                        maxProgress: item.maxProgress || item.target || null,
                        points: item.points || 10
                        });
                    });
            }
        });
    return aiAchievements;
    },
    getPlayerAchievements() {
        if (!gameState._achievements) {
            gameState._achievements = {
                unlocked: [],
                progress: {},
                totalPoints: 0,
                lastCheck: 0
                };
        }
    return gameState._achievements;
    },
    calculateStats() {
        var stats = {
            storyCount: (gameState.conversationHistory || []).filter(m => m.role === 'assistant').length,
            npcCount: Object.keys(gameState.allCharacters || {}).length,
            friendlyNpc: 0,
            romanceNpc: 0,
            allyNpc: 0,
            combatCount: 0,
            winStreak: 0,
            bagItems: 0,
            rareItems: 0,
            legendaryItems: 0,
            locations: 0,
            hiddenLocations: 0
            };
        if (gameState.currentBag) {
            stats.bagItems = gameState.currentBag.reduce(function(s, i) {
                return s + (i.count || 1);
                }, 0);
            gameState.currentBag.forEach(function(i) {
                if (i.rarity === '珍稀' || i.rarity === '精良') stats.rareItems += i.count || 1;
                if (i.rarity === '传说') stats.legendaryItems += i.count || 1;
                });
        }
    var rels = (typeof StateManager !== 'undefined' && StateManager.get)
        ? (StateManager.get('entities.relationships') || gameState.relationships || [])
        : (gameState.relationships || []);  // [CP-10] 优先 StateManager 权威源，legacy 兜底
    var pn = gameState.playerName || '主角';
    rels.forEach(function(r) {
        if (r.from === pn || r.to === pn) {
            if (r.type === '友好' || r.type === '盟友' || r.type === '师徒') stats.friendlyNpc++;
            if (r.type === '暧昧' || r.type === '恋人') stats.romanceNpc++;
            if (r.type === '盟友') stats.allyNpc++;
        }
    });
    return stats;
    },
    checkAchievements() {
        var pd = this.getPlayerAchievements();
        var all = this.getDefaultAchievements();
        var newly = [];
        var stats = this.calculateStats();
        all.forEach(function(ach) {
            if (pd.unlocked.some(function(u) {
                return u.id === ach.id;
                })) return;
            var np = 0;
            // 动态解析条件表达式，如 "storyCount >= 1"
            var cond = ach.condition || 'true';
            try {

                // 成就条件是静态的，同一 cond 字符串只需解析一次
                var match = _achCondCache[cond];
                if (match === undefined) {
                    match = _ACH_COND_REGEX.exec(cond);
                    _achCondCache[cond] = match || null;
                }
                if (match) {
                    var field = match[1];
                    var op = match[2];
                    var val = parseInt(match[3]);
                    var statVal = stats[field] || 0;
                    switch (op) {
                        case '>=': np = Math.min(val, statVal); break;
                        case '<=': np = statVal <= val ? 1 : 0; break;
                        case '>': np = statVal > val ? 1 : 0; break;
                        case '<': np = statVal < val ? 1 : 0; break;
                        case '==': np = statVal === val ? 1 : 0; break;
                        case '!=': np = statVal !== val ? 1 : 0; break;
                    }
                } else if (cond === 'nightOwl') {
                    var h = new Date().getHours();
                    np = (h >= 2 && h < 5) ? 1 : 0;
                } else if (cond !== 'true') {
                    // 未知条件格式，尝试作为简单布尔值
                    np = 0;
                }
            } catch(e) {
                np = 0;
            }
    pd.progress[ach.id] = np;
    var mp = ach.maxProgress || 1;
    if (np >= mp) {
        var rar = AchievementSystem.RARITY[_normalizeRarity(ach.rarity)] ||
        AchievementSystem.RARITY.COMMON;
        pd.unlocked.push({
            id: ach.id,
            unlockedAt: Date.now(),
            rarity: _normalizeRarity(ach.rarity)
            });
        pd.totalPoints += rar.points;
        newly.push(Object.assign({}, ach, {
            points: rar.points
            }));
    }
    });
    if (newly.length > 0) {
        if (typeof autoSave === 'function') autoSave();
        newly.forEach(function(a, i) {
            TimerManager.setTimeout('achieveToast_' + i, function() {
                AchievementSystem.showUnlockToast(a);
                }, i * 800);
            });
    }
    return newly;
    },
    showUnlockToast(ach) {
        var t = document.createElement('div');
        t.className = 'achieve-toast';
        t.innerHTML = '<div class="achieve-toast-icon">' + escapeHtml(String(ach.icon || '')) +
        '</div><div class="achieve-toast-info"><div class="achieve-toast-title">成就解锁</div><div class="achieve-toast-name">' +
        escapeHtml(String(ach.name || '')) + '</div></div><div class="achieve-toast-points">+' + ach.points + '</div>';
        document.body.appendChild(t);
        requestAnimationFrame(function() {
            t.classList.add('show');
            });
        // 【缺陷修复】使用唯一 key，避免多个成就 toast 同时显示时定时器互相覆盖导致永不消失
        var keyPrefix = 'achieveToast_' + Date.now() + '_' + Math.random();
        TimerManager.setTimeout(keyPrefix + '_hide', function() {
            t.classList.remove('show');
            TimerManager.setTimeout(keyPrefix + '_remove', function() {
                t.remove();
                }, 500);
            // 【全游戏弹窗策略】3 秒——使用 POPUP_DURATION_MS 常量（core.js 定义）
            }, typeof POPUP_DURATION_MS !== 'undefined' ? POPUP_DURATION_MS : 3000);
    },
    countByRarity(pd, r) {
        return pd.unlocked.filter(function(u) {
            return u.rarity === r;
            }).length;
    },
    renderAchievePage(container) {
        var pd = this.getPlayerAchievements();
        var all = this.getDefaultAchievements();
        var tc = all.length;
        var uc = pd.unlocked.length;
        var cr = tc > 0 ? Math.round((uc / tc) * 100) : 0;
        var tp = pd.totalPoints;
        var cat = {};
        Object.keys(this.CATEGORY).forEach(function(k) {
            cat[k] = [];
            });
        all.forEach(function(a) {
            var c = a.category.toUpperCase();
            if (cat[c]) cat[c].push(a);
            });
        var html = '<div class="achieve-page">';

        if (all.length === 0) {
            html += '<div class="empty-state" style="padding:40px 20px;"><div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div><p>成就系统即将开放</p><p style="font-size:13px;margin-top:8px;color:var(--text-secondary);">随着剧情推进，AI 将自动生成可解锁的成就</p></div></div>';
            container.innerHTML = html;
            return;
        }
        html +=
        '<div class="achieve-overview"><div class="achieve-overview-ring"><svg class="achieve-ring-svg" viewBox="0 0 100 100"><circle class="achieve-ring-bg" cx="50" cy="50" r="42"/><circle class="achieve-ring-progress" cx="50" cy="50" r="42" stroke-dasharray="' +
        (2 * Math.PI * 42) + '" stroke-dashoffset="' + (2 * Math.PI * 42 * (1 - cr / 100)) +
        '"/></svg><div class="achieve-ring-text">' + cr +
        '%</div></div><div class="achieve-overview-title">成就收集进度</div><div class="achieve-overview-sub">' +
        uc + ' / ' + tc + ' 个成就 · ' + tp +
        ' 点数</div><div class="achieve-stats-row"><div class="achieve-stat-box"><div class="achieve-stat-num" style="color:' + this.RARITY.COMMON.color + ';">' +
        this.countByRarity(pd, 'common') +
        '</div><div class="achieve-stat-label">普通</div></div><div class="achieve-stat-box"><div class="achieve-stat-num" style="color:' + this.RARITY.RARE.color + ';">' +
        this.countByRarity(pd, 'rare') +
        '</div><div class="achieve-stat-label">稀有</div></div><div class="achieve-stat-box"><div class="achieve-stat-num" style="color:' + this.RARITY.EPIC.color + ';">' +
        this.countByRarity(pd, 'epic') +
        '</div><div class="achieve-stat-label">史诗</div></div><div class="achieve-stat-box"><div class="achieve-stat-num" style="color:' + this.RARITY.LEGENDARY.color + ';">' +
        this.countByRarity(pd, 'legendary') +
        '</div><div class="achieve-stat-label">传说</div></div></div></div>';
        html +=
        '<div class="achieve-filter-bar"><button class="quest-filter-btn active" data-achieve-filter="all">全部</button><button class="quest-filter-btn" data-achieve-filter="unlocked">已解锁</button><button class="quest-filter-btn" data-achieve-filter="locked">未解锁</button></div>';
        // 分类 tab

        var tabHtml = '<div class="achieve-cat-tabs" style="display:flex;gap:6px;padding:8px 12px;overflow-x:auto;background:var(--bg-secondary);border-bottom:1px solid var(--border);">';
        var totalUc = 0, totalTc = 0;
        Object.keys(this.CATEGORY).forEach(function(ck) {
            var achs = cat[ck];
            if (!achs || achs.length === 0) return;
            var cu = achs.filter(function(a) { return pd.unlocked.some(function(u) { return u.id === a.id; }); }).length;
            totalUc += cu; totalTc += achs.length;
            tabHtml += '<button class="achieve-cat-tab" data-cat-filter="' + ck + '" style="flex-shrink:0;padding:6px 12px;border:1px solid var(--border);border-radius:14px;background:var(--bg);font-size:12px;cursor:pointer;color:var(--text-secondary);">' + this.CATEGORY[ck].label + ' <span style="color:var(--text-tertiary);font-size:11px;">' + cu + '/' + achs.length + '</span></button>';
        }.bind(this));
        tabHtml += '</div>';
        html += tabHtml;
        html += '<div class="achieve-list-container" id="achieveListContainer">';
        const self = this;
        Object.keys(this.CATEGORY).forEach(function(ck) {
            var c = self.CATEGORY[ck];
            var achs = cat[ck];
            if (!achs || achs.length === 0) return;
            var cu = achs.filter(function(a) {
                return pd.unlocked.some(function(u) {
                    return u.id === a.id;
                    });
                }).length;
            html += '<div class="achieve-category-header" data-cat-key="' + ck + '">' + c.label +
            '<span class="achieve-category-count">(' + cu + '/' + achs.length + ')</span>' +
            '<span class="achieve-category-pct" style="margin-left:8px;color:var(--ach-category-active);font-size:11px;">' + Math.round((cu/achs.length)*100) + '%</span>' +
            '</div>';
            html += achs.map(function(a) {
                return self.renderAchieveItem(a, pd);
                }).join('');
            });
        html += '</div></div>';
        container.innerHTML = html;
        this.bindAchieveFilter(container);
        // 绑定分类 tab

        container.querySelectorAll('.achieve-cat-tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                container.querySelectorAll('.achieve-cat-tab').forEach(function(t) {
                    t.style.background = 'var(--card)';
                    t.style.color = 'var(--text-secondary)';
                    t.style.borderColor = 'var(--border)';
                });
                this.style.background = 'var(--ach-category-active)';
                this.style.color = 'var(--on-accent)';  /* 【P2-52·阶段6】彩色背景上的文字统一走 --on-accent */
                this.style.borderColor = 'var(--ach-category-active)';
                var cat = this.dataset.catFilter;
                container.querySelectorAll('.achieve-category-header').forEach(function(h) {
                    h.style.display = (cat === 'all' || h.dataset.catKey === cat) ? '' : 'none';
                });
                container.querySelectorAll('.achieve-item').forEach(function(it) {
                    var itemCat = it.dataset.achieveCategory;
                    it.style.display = (cat === 'all' || itemCat === cat) ? '' : 'none';
                });
            });
        });
        // 默认选中全部 tab 的中间一个（如果有）
        container.querySelectorAll('.achieve-item').forEach(function(item) {
            item.addEventListener('click', function() {
                var id = this.dataset.achieveId;
                AchievementSystem.showAchieveDetail(id);
                });
            });
    },
    renderAchieveItem(ach, pd) {
        var isU = pd.unlocked.some(function(u) {
            return u.id === ach.id;
            });
        var uD = pd.unlocked.find(function(u) {
            return u.id === ach.id;
            });
        var pr = pd.progress[ach.id] || 0;
        var mp = ach.maxProgress || 1;
        var pp = Math.min(100, Math.round((pr / mp) * 100));
        var rar = this.RARITY[_normalizeRarity(ach.rarity)] || this.RARITY.COMMON;
        var ut = '';
        if (isU && uD) {
            var d = new Date(uD.unlockedAt);
            ut = '<div class="achieve-unlock-time">📅 ' + d.toLocaleDateString() + '</div>';
        }
    var ph = '';
    if (!isU && ach.maxProgress) {
        ph = '<div class="achieve-progress-row"><div class="achieve-progress-track"><div class="achieve-progress-fill ' +
        escapeHtml(_normalizeRarity(ach.rarity).toLowerCase()) + '" style="width:' + pp +
        '%;"></div></div><span class="achieve-progress-text">' + pr + '/' + mp +
        '</span></div>';
    }
    var nb = (isU && uD && Date.now() - uD.unlockedAt < 86400000) ?
    '<span class="new-badge">NEW</span>' : '';
    return '<div class="achieve-item ' + (isU ? '' : 'locked') + '" data-achieve-id="' + escapeHtml(ach.id) +
    '" data-achieve-category="' + escapeHtml(_normalizeCategory(ach.category)) + '"><div class="achieve-icon-wrap ' + escapeHtml(_normalizeRarity(ach.rarity).toLowerCase()) + '">' + escapeHtml(ach.icon) +
    '<div class="achieve-rarity-badge ' + escapeHtml(_normalizeRarity(ach.rarity).toLowerCase()) +
    '"></div></div><div class="achieve-info"><div class="achieve-name">' + escapeHtml(ach.name) + nb +
    '</div><div class="achieve-desc">' + escapeHtml(ach.desc) + '</div>' + ph + ut +
    '</div><div class="achieve-points">' + (isU ? '√ ' : '') + rar.points + '</div></div>';
    },
    bindAchieveFilter(container) {
        container.querySelectorAll('[data-achieve-filter]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                container.querySelectorAll('[data-achieve-filter]').forEach(function(
                b) {
                    b.classList.remove('active');
                    });
                this.classList.add('active');
                var f = this.dataset.achieveFilter;
                container.querySelectorAll('.achieve-item').forEach(function(item) {
                    var isL = item.classList.contains('locked');
                    item.style.display = (f === 'all' ? '' : (f === 'unlocked' ?
                    (isL ? 'none' : '') : (isL ? '' : 'none')));
                    });
                container.querySelectorAll('.achieve-category-header').forEach(function(
                cat) {
                    var ne = cat.nextElementSibling;
                    var hv = false;
                    while (ne && ne.classList.contains('achieve-item')) {
                        if (ne.style.display !== 'none') {
                            hv = true;
                            break;
                        }
                    ne = ne.nextElementSibling;
                }
            cat.style.display = hv ? '' : 'none';
            });
        });
    });
    },
    showAchieveDetail(id) {
        var ach = this.getDefaultAchievements().find(function(a) {
            return a.id === id;
            });
        if (!ach) return;
        var pd = this.getPlayerAchievements();
        var isU = pd.unlocked.some(function(u) {
            return u.id === id;
            });
        var rar = this.RARITY[_normalizeRarity(ach.rarity)] || this.RARITY.COMMON;
        var html =
        '<div style="text-align:center;">' +
        '<div class="achieve-icon-wrap ' + escapeHtml(_normalizeRarity(ach.rarity).toLowerCase()) +
        '" style="margin:0 auto 16px;width:80px;height:80px;font-size:40px;">' + escapeHtml(String(ach.icon || '')) +
        '<div class="achieve-rarity-badge ' + escapeHtml(_normalizeRarity(ach.rarity).toLowerCase()) + '"></div></div>' +
        '<div style="font-size:20px;font-weight:700;margin-bottom:8px;">' + escapeHtml(String(ach.name || '')) + '</div>' +

        // 通过 inline style 绑定 var(--ach-*) 即可，暗色模式自动适配
        '<div style="margin-bottom:16px;"><span style="padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;background:' +
        _achBgColor(_normalizeRarity(ach.rarity).toLowerCase()) + ';color:' + _achTextColor(_normalizeRarity(ach.rarity).toLowerCase()) +
        ';">' + rar.label + '</span></div>' +
        '<div style="font-size:14px;color:var(--text-secondary);line-height:1.8;margin-bottom:20px;">' +
        escapeHtml(ach.desc || '') + '</div>' +
        '<div style="background:var(--bg);border-radius:var(--radius-md);padding:16px;margin-bottom:16px;"><div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">成就点数</div><div style="font-size:24px;font-weight:700;color:' +
        rar.color + ';">+' + rar.points + '</div></div>' +
        (isU ? '<div style="color:var(--text-secondary);font-size:13px;">✓ 已获得</div>' :
        '<div style="color:var(--text-tertiary);font-size:13px;">锁 未解锁 · 进度: ' + (pd.progress[
        id] || 0) + '/' + (ach.maxProgress || 1) + '</div>') +
        '<button class="crystal-btn" type="button" style="margin-top:16px;width:100%;" data-action="hideModalByName" data-args=\'["achieveDetailModal"]\'>关闭</button></div>';
        // 使用统一弹窗管理器
        if (typeof UI !== 'undefined' && UI.createModal) {
            UI.createModal({ id: 'achieveDetailModal', html: html });
        }
    }
};

// ========================================
// 任务系统 - 数据合并与渲染（从 game.js 收拢）
// ========================================

function mergeQuests(newQuests) {
    if (!newQuests || !Array.isArray(newQuests)) return;

    // 避免 legacy 路径直接操纵 gameState.currentQuests 绕过 StateManager 导致双写。
    // 与 P1-PU7 阶段4 saveNpcEdit "强制走 Mutator" 架构一致。
    // 原 legacy 分支含 statusMap/typeMap 标准化与 QuestMutator 内部 normalize 重复实现，
    // 且直接 push/splice gameState.currentQuests 绕过 StateManager → _syncLegacyMirror 不触发。
    if (!StateManager || !QuestMutator) {
        throw new Error('[mergeQuests] QuestMutator 不可用，无法合并任务');
    }
    // 使用 QuestMutator 标准化并合并任务
    newQuests.forEach(function(nq) {
        if (!nq || !nq.title) return;
        QuestMutator.addQuest(nq, { silent: true });
    });
}

function toggleQuestList() {
    var list = document.getElementById('questListInner');
    var arrow = document.getElementById('questToggleArrow');
    if (!list) return;
    if (list.style.display === 'none') {
        list.style.display = 'block';
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    } else {
        list.style.display = 'none';
        if (arrow) arrow.style.transform = 'rotate(-90deg)';
    }
}

function renderQuests() {
    var container = document.getElementById('questModule');
    // 如果世界Tab里还没有任务模块容器，创建一个
    if (!container) {
        var worldModules = document.getElementById('worldModules');
        if (!worldModules) return;
        var div = document.createElement('div');
        div.id = 'questModule';
        div.className = 'quest-module';
        worldModules.parentNode.insertBefore(div, worldModules);
        container = div;
    }
    // 【P2-47修复】使用 QuestSystem.getAllQuests() 获取所有任务（包括引导任务）
    // 旧代码直接读 gameState.currentQuests，缺少引导任务
    var quests = (typeof QuestSystem !== 'undefined' && QuestSystem.getAllQuests)
        ? QuestSystem.getAllQuests()
        : (gameState.currentQuests || []);
    if (quests.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';
    // 排序：进行中在前，已完成/失败在后
    var sorted = quests.slice().sort(function(a, b) {
        var order = {};
        order[QuestSystem.STATUS.ACTIVE] = 0;
        order[QuestSystem.STATUS.FAILED] = 1;
        order[QuestSystem.STATUS.COMPLETED] = 2;
        return (order[a.status] || 0) - (order[b.status] || 0);
    });
    var html =
        '<div class="module-header" data-action="toggleQuestList" style="cursor:pointer"><span class="module-header-text">当前任务</span><span id="questToggleArrow" style="font-size:14px;color:var(--task-highlight);transition:transform .2s">▼</span></div>';
    html += '<div class="quest-list" id="questListInner">';
    sorted.forEach(function(q) {
        var isDone = q.status === QuestSystem.STATUS.COMPLETED || q.status === QuestSystem.STATUS.FAILED;
        var itemClass = isDone ? 'quest-item quest-done' : 'quest-item';
        // 类型标签
        var typeClass = 'quest-type ';
        if (q.type === '主线') typeClass += 'quest-type-main';
        else if (q.type === '隐藏') typeClass += 'quest-type-hidden';
        else typeClass += 'quest-type-side';
        // 状态标签
        var statusClass = 'quest-status ';
        if (q.status === QuestSystem.STATUS.COMPLETED) statusClass += 'quest-status-done';
        else if (q.status === QuestSystem.STATUS.FAILED) statusClass += 'quest-status-failed';
        else statusClass += 'quest-status-active';
        html += '<div class="' + itemClass + '">';
        html += '<div class="quest-header">';
        html += '<span class="' + typeClass + '">' + escapeHtml(q.type || '支线') + '</span>';
        html += '<span class="quest-title">' + escapeHtml(q.title || '') + '</span>';
        html += '<span class="' + statusClass + '">' + escapeHtml(q.status || '进行中') + '</span>';
        html += '</div>';
        // 进度条（只有进行中且有progress时显示）
        if (q.progress && !isDone) {
            var parts = q.progress.split('/');
            var percent = 0;
            if (parts.length === 2) {
                var cur = safeInt(parts[0], 0);
                var total = safeInt(parts[1], 1);
                percent = Math.min(100, Math.round(cur / total * 100));
            }
            html += '<div class="quest-progress-row">';
            html +=
                '<div class="quest-progress-bar"><div class="quest-progress-fill" style="width:' +
                percent + '%"></div></div>';
            html += '<span class="quest-progress-text">' + q.progress + '</span>';
            html += '</div>';
        }
        // 提示
        if (q.hint && !isDone) {
            html += '<div class="quest-hint">' + escapeHtml(q.hint) + '</div>';
        }
        html += '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
}

// ========================================
// 关系系统 - 数据合并与渲染（从 game.js 收拢）
// ========================================

function mergeRelationships(newRels) {
    if (!newRels || !Array.isArray(newRels)) return;

    var player = (typeof StateManager !== 'undefined' && StateManager.get) ? StateManager.get('entities.player') : null;
    var playerName = (player && player.name) || (gameState && gameState.playerName) || '主角';
    // 标准化输入：把 {name, delta} 格式转为关系图谱条目
    var normalized = newRels.map(function(nr) {
        if (!nr) return null;
        // 格式2：{name, delta} → 转换为 玩家→NPC 关系（仅图谱条目，好感度已由 mutator 处理）
        if (!nr.from || !nr.to) {
            if (nr.name) {
                var delta = safeInt(nr.delta || nr.change || nr.favor || 0, 0);
                return {
                    from: playerName,
                    to: nr.name,
                    type: nr.type || '相识',
                    desc: nr.desc || (delta > 0 ? '好感+' + delta : (delta < 0 ? '好感' + delta : '关系稳定'))
                };
            }
            return null;
        }
        return nr;
    }).filter(Boolean);

    // StateManager._syncLegacyMirror 自动同步 gameState.relationships 旧字段
    if (typeof RelationshipMutator !== 'undefined' && RelationshipMutator.mergeRelationships) {
        RelationshipMutator.mergeRelationships(normalized);
    } else {

        throw new Error('[mergeRelationships] RelationshipMutator 未加载，无法同步关系');
    }
    // 兼容旧流程：仍触发 _pushRelationshipsToGM 让 gm.tables.relationships 同步
    // （GameMemory 是 EnhancedMemory 持久化层，仍是 gm 内部的存储源）
    if (typeof _pushRelationshipsToGM === 'function') _pushRelationshipsToGM();
}


function _inferRelationshipsFromCharacters() {
    // 委托 AIResponseMutator 的纯函数版本，避免重复实现
    if (typeof AIResponseMutator !== 'undefined' && AIResponseMutator._inferRelationshipsFromCharacters) {
        var inferred = AIResponseMutator._inferRelationshipsFromCharacters();
        if (inferred.length > 0) mergeRelationships(inferred);
        return;
    }
    // fallback：AIResponseMutator 不可用时走内联逻辑
    var player = (typeof StateManager !== 'undefined' && StateManager.get) ? StateManager.get('entities.player') : null;
    var playerName = (player && player.name) || '主角';
    var chars = {};
    var charsRaw = (typeof StateManager !== 'undefined' && StateManager.get) ? StateManager.get('entities.characters') : null;
    if (Array.isArray(charsRaw)) {
        charsRaw.forEach(function(c) { if (c && c.name) chars[c.name] = c; });
    } else if (gameState && gameState.allCharacters) {
        chars = gameState.allCharacters;
    }
    var inferred = [];
    Object.keys(chars).forEach(function(name) {
        var c = chars[name];
        if (!c || name === playerName) return;
        var relType = (c.relation && String(c.relation).trim()) || '相识';
        inferred.push({
            from: playerName,
            to: name,
            type: relType,
            desc: (c.title ? c.title + '。' : '') + (c.desc || '')
        });
    });
    if (inferred.length > 0) {
        mergeRelationships(inferred);
    }
}

function renderRelationships() {
    var container = document.getElementById('relationModule');
    var list = document.getElementById('relationList');
    if (!container || !list) return;
    var rels = gameState.relationships || [];
    if (rels.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';
    var html = '';
    rels.forEach(function(r) {
        var tagClass = getRelationTagClass(r.type || '中立');
        html += '<div class="relation-item">';
        html += '<span class="relation-name">' + escapeHtml(r.from) + '</span>';
        html += '<span class="relation-arrow">&mdash;</span>';
        html += '<span class="relation-tag ' + tagClass + '">' + escapeHtml(r.type || '中立') + '</span>';
        html += '<span class="relation-arrow">&mdash;</span>';
        html += '<span class="relation-name">' + escapeHtml(r.to) + '</span>';
        if (r.desc) {
            html += '<div class="relation-desc">' + escapeHtml(r.desc) + '</div>';
        }
        // 多维关系展示
        if (r.dimensions && typeof r.dimensions === 'object') {
            var dimParts = [];
            Object.keys(r.dimensions).forEach(function(k) {
                var v = r.dimensions[k];
                if (v === undefined || v === '') return;
                dimParts.push(escapeHtml(k) + ':' + escapeHtml(String(v)));
            });
            if (dimParts.length > 0) {
                html += '<div class="relation-dimensions" style="margin-top:6px;font-size:12px;color:var(--text-secondary);">' + dimParts.join(' · ') + '</div>';
            }
        }
        html += '</div>';
    });
    list.innerHTML = html;
}

function getRelationTagClass(type) {
    // 【修改】不再硬编码，根据关键词智能判断
    if (!type) return 'relation-tag-neutral';
    var t = type.toLowerCase();

    // 爱情/暧昧类关键词

    if (/爱|恋|心动|暧昧|暗恋|喜欢|钟情|倾心|爱慕|迷恋|痴迷|\s*sweetheart|crush|beloved/.test(t)) {
        return 'relation-tag-love';
    }
    // 敌对/仇恨类关键词
    if (/敌|仇|恨|厌恶|讨厌|死对头|心魔|势不两立|不共戴天|hostile|enemy|hate/.test(t)) {
        return 'relation-tag-enemy';
    }
    // 友好/朋友类关键词
    if (/友|好|亲密|知己|至交|闺蜜|死党|伙伴|ally|friend|close/.test(t)) {
        return 'relation-tag-friend';
    }
    // 亲人/家族类关键词
    if (/亲|家|兄|弟|姐|妹|父|母|子|女|祖|孙|family|kin|sibling|parent/.test(t)) {
        return 'relation-tag-family';
    }
    // 师徒/上下级类关键词
    if (/师|徒|主|仆|君|臣|上司|下属|领导|master|servant|mentor/.test(t)) {
        return 'relation-tag-master';
    }
    // 竞争/对手类关键词
    if (/对手|竞争|情敌|rival|competitor|opponent/.test(t)) {
        return 'relation-tag-rival';
    }

    return 'relation-tag-neutral';
}
