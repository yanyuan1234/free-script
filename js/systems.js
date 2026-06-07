// ========================================
// 任务系统 - Quest System
// ========================================
var QuestSystem = {
    STATUS: {
        ACTIVE: '进行中',
        COMPLETED: '已完成',
        FAILED: '失败',
        ABANDONED: '已放弃'
    },
    TYPE: {
        MAIN: '主线',
        SIDE: '支线',
        HIDDEN: '隐藏'
    },
    // 动态类型注册：AI 可以创造新的任务类型
    _customTypes: {},
    _customStatuses: {},
    registerType: function(key, label, sortOrder) {
        this._customTypes[key] = { label: label, sortOrder: sortOrder || 50 };
    },
    registerStatus: function(key, label, sortOrder) {
        this._customStatuses[key] = { label: label, sortOrder: sortOrder || 50 };
    },
    // 获取所有已知类型（内置+自定义）
    getAllTypes: function() {
        var types = Object.assign({}, this.TYPE);
        for (var k in this._customTypes) { types[k] = this._customTypes[k].label; }
        return types;
    },
    getAllStatuses: function() {
        var statuses = Object.assign({}, this.STATUS);
        for (var k in this._customStatuses) { statuses[k] = this._customStatuses[k].label; }
        return statuses;
    },
    getAllQuests() {
        var quests = gameState.currentQuests || [];
        if (quests.filter(function(q) {
            return q.status === QuestSystem.STATUS.ACTIVE;
            }).length === 0 && (gameState.conversationHistory || []).length > 0) {
            if (!QuestSystem._cachedGuidanceQuest) {
                QuestSystem._cachedGuidanceQuest = QuestSystem.createGuidanceQuest();
            }
        quests.push(QuestSystem._cachedGuidanceQuest);
    }
    return quests;
    },
    createGuidanceQuest() {
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
                amount: '??'
                }],
            timeLimit: null,
            priority: 999
            };
    },
    filterByType(quests, type) {
        return type === 'all' ? quests : quests.filter(function(q) {
            return q.type === type;
            });
    },
    filterByStatus(quests, status) {
        if (status === 'all') return quests;
        if (status === 'active') return quests.filter(function(q) {
            return q.status === QuestSystem.STATUS.ACTIVE;
            });
        if (status === 'completed') return quests.filter(function(q) {
            return q.status === QuestSystem.STATUS.COMPLETED || q.status === QuestSystem
            .STATUS.FAILED;
            });
        return quests.filter(function(q) {
            return q.status === status;
            });
    },
    parseProgress(p) {
        if (!p) return 0;
        var parts = p.split('/');
        if (parts.length === 2) {
            var c = parseInt(parts[0]) || 0,
            t = parseInt(parts[1]) || 1;
            return Math.min(100, Math.round((c / t) * 100));
        }
    return 0;
    },
    getTypeIcon(type) {
        return '';
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
        filterBtns += '<button class="quest-filter-btn" data-quest-filter="main">主线</button>';
        filterBtns += '<button class="quest-filter-btn" data-quest-filter="side">支线</button>';
        filterBtns += '<button class="quest-filter-btn" data-quest-filter="hidden">隐藏</button>';
        // 动态添加自定义类型按钮
        for (var k in QuestSystem._customTypes) {
            filterBtns += '<button class="quest-filter-btn" data-quest-filter="' + k + '">' + QuestSystem._customTypes[k].label + '</button>';
        }
        filterBtns += '<button class="quest-filter-btn" data-quest-filter="active">进行中</button>';
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
        // 【优化】主线 → 支线 → 隐藏，进行中 → 已完成 → 已失败
        var typeOrder = { '主线': 0, '支线': 1, '隐藏': 2 };
        // 合入自定义类型的排序
        for (var k in QuestSystem._customTypes) { typeOrder[QuestSystem._customTypes[k].label] = QuestSystem._customTypes[k].sortOrder; }
        var statusOrder = { '进行中': 0, '已完成': 1, '已失败': 2, '已放弃': 3 };
        for (var k in QuestSystem._customStatuses) { statusOrder[QuestSystem._customStatuses[k].label] = QuestSystem._customStatuses[k].sortOrder; }
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
                    return '<span class="quest-reward-tag">' + r.name + (r.amount ?
                    ' x' + r.amount : '') + '</span>';
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
    // 【优化】截止时间显示
    var dh = '';
    if (q.deadline && !isC && !isF) {
        dh = '<div style="font-size:12px;color:#f44336;margin-top:6px;display:flex;align-items:center;gap:4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>截止：' + escapeHtml(q.deadline) + '</div>';
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
                if (f === 'main' || f === 'side' || f === 'hidden' || QuestSystem._customTypes[f]) {
                    var tm = {
                        main: self.TYPE.MAIN,
                        side: self.TYPE.SIDE,
                        hidden: self.TYPE.HIDDEN
                        };
                    // 合入自定义类型
                    for (var k in QuestSystem._customTypes) { tm[k] = QuestSystem._customTypes[k].label; }
                    filtered = self.filterByType(quests, tm[f]);
                    } else if (f === 'active') {
                    filtered = self.filterByStatus(quests, 'active');
                }
            var lc = container.querySelector('#questListContainer');
            if (lc) {
                lc.innerHTML = filtered.length > 0 ? self.renderQuestList(
                filtered) :
                '<div class="quest-empty-state"><div class="quest-empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div><p>该分类下暂无任务</p></div>';
            }
        });
    });
    },
    renderTracker() {
        var tracker = document.getElementById('questTracker');
        if (!tracker) {
            tracker = document.createElement('div');
            tracker.id = 'questTracker';
            tracker.className = 'quest-tracker';
            var sp = document.getElementById('storyPage');
            if (sp) sp.appendChild(tracker);
        }
    var aq = this.getAllQuests().filter(function(q) {
        return q.status === QuestSystem.STATUS.ACTIVE;
        }).slice(0, 3);
    if (aq.length === 0) {
        tracker.style.display = 'none';
        return;
    }
    tracker.style.display = 'block';
    var html =
    '<div class="quest-tracker-toggle" onclick="QuestSystem.toggleTracker()">◀</div><div class="quest-tracker-title"><span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>任务追踪</span><span style="font-size:11px;color:var(--text-tertiary);">' +
    aq.length + '</span></div>';
    aq.forEach(function(q) {
        var p = QuestSystem.parseProgress(q.progress);
        html += '<div class="quest-tracker-item"><div class="quest-tracker-item-name">' + q
        .title +
        '</div><div class="quest-tracker-item-progress"><div class="quest-tracker-item-fill" style="width:' +
        p + '%;"></div></div></div>';
        });
    tracker.innerHTML = html;
    },
    toggleTracker() {
        var t = document.getElementById('questTracker');
        if (t) t.classList.toggle('collapsed');
    }
};
// ========================================
// 成就系统 - Achievement System
// ========================================
var AchievementSystem = {
    RARITY: {
        COMMON: {
            key: 'common',
            label: '普通',
            color: '#9e9e9e',
            points: 10
        },
    RARE: {
        key: 'rare',
        label: '稀有',
        color: '#2196f3',
        points: 30
    },
    EPIC: {
        key: 'epic',
        label: '史诗',
        color: '#9c27b0',
        points: 60
    },
    LEGENDARY: {
        key: 'legendary',
        label: '传说',
        color: '#ff9800',
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
    var rels = gameState.relationships || [];
    rels.forEach(function(r) {
        if (r.from === '主角' || r.to === '主角') {
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
                // 安全的条件求值：只支持简单的比较表达式
                var match = cond.match(/^(\w+)\s*(>=|<=|>|<|==|!=)\s*(\d+)$/);
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
        var rar = AchievementSystem.RARITY[ach.rarity.toUpperCase()] ||
        AchievementSystem.RARITY.COMMON;
        pd.unlocked.push({
            id: ach.id,
            unlockedAt: Date.now(),
            rarity: ach.rarity
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
        TimerManager.setTimeout('achieveToastHide', function() {
            t.classList.remove('show');
            TimerManager.setTimeout('achieveToastRemove', function() {
                t.remove();
                }, 500);
            }, 3000);
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
        html +=
        '<div class="achieve-overview"><div class="achieve-overview-ring"><svg class="achieve-ring-svg" viewBox="0 0 100 100"><circle class="achieve-ring-bg" cx="50" cy="50" r="42"/><circle class="achieve-ring-progress" cx="50" cy="50" r="42" stroke-dasharray="' +
        (2 * Math.PI * 42) + '" stroke-dashoffset="' + (2 * Math.PI * 42 * (1 - cr / 100)) +
        '"/></svg><div class="achieve-ring-text">' + cr +
        '%</div></div><div class="achieve-overview-title">成就收集进度</div><div class="achieve-overview-sub">' +
        uc + ' / ' + tc + ' 个成就 · ' + tp +
        ' 点数</div><div class="achieve-stats-row"><div class="achieve-stat-box"><div class="achieve-stat-num" style="color:#9e9e9e;">' +
        this.countByRarity(pd, 'common') +
        '</div><div class="achieve-stat-label">普通</div></div><div class="achieve-stat-box"><div class="achieve-stat-num" style="color:#2196f3;">' +
        this.countByRarity(pd, 'rare') +
        '</div><div class="achieve-stat-label">稀有</div></div><div class="achieve-stat-box"><div class="achieve-stat-num" style="color:#9c27b0;">' +
        this.countByRarity(pd, 'epic') +
        '</div><div class="achieve-stat-label">史诗</div></div><div class="achieve-stat-box"><div class="achieve-stat-num" style="color:#ff9800;">' +
        this.countByRarity(pd, 'legendary') +
        '</div><div class="achieve-stat-label">传说</div></div></div></div>';
        html +=
        '<div class="achieve-filter-bar"><button class="quest-filter-btn active" data-achieve-filter="all">全部</button><button class="quest-filter-btn" data-achieve-filter="unlocked">已解锁</button><button class="quest-filter-btn" data-achieve-filter="locked">未解锁</button></div>';
        // 分类 tab
        var tabHtml = '<div class="achieve-cat-tabs" style="display:flex;gap:6px;padding:8px 12px;overflow-x:auto;background:#fafafa;border-bottom:1px solid #eee;">';
        var totalUc = 0, totalTc = 0;
        Object.keys(this.CATEGORY).forEach(function(ck) {
            var achs = cat[ck];
            if (!achs || achs.length === 0) return;
            var cu = achs.filter(function(a) { return pd.unlocked.some(function(u) { return u.id === a.id; }); }).length;
            totalUc += cu; totalTc += achs.length;
            tabHtml += '<button class="achieve-cat-tab" data-cat-filter="' + ck + '" style="flex-shrink:0;padding:6px 12px;border:1px solid #ddd;border-radius:14px;background:#fff;font-size:12px;cursor:pointer;color:#555;">' + this.CATEGORY[ck].label + ' <span style="color:#999;font-size:11px;">' + cu + '/' + achs.length + '</span></button>';
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
            '<span class="achieve-category-pct" style="margin-left:8px;color:#1a73e8;font-size:11px;">' + Math.round((cu/achs.length)*100) + '%</span>' +
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
                    t.style.background = '#fff';
                    t.style.color = '#555';
                    t.style.borderColor = '#ddd';
                });
                this.style.background = '#1a73e8';
                this.style.color = '#fff';
                this.style.borderColor = '#1a73e8';
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
        var rar = this.RARITY[ach.rarity.toUpperCase()] || this.RARITY.COMMON;
        var ut = '';
        if (isU && uD) {
            var d = new Date(uD.unlockedAt);
            ut = '<div class="achieve-unlock-time">📅 ' + d.toLocaleDateString() + '</div>';
        }
    var ph = '';
    if (!isU && ach.maxProgress) {
        ph = '<div class="achieve-progress-row"><div class="achieve-progress-track"><div class="achieve-progress-fill ' +
        ach.rarity + '" style="width:' + pp +
        '%;"></div></div><span class="achieve-progress-text">' + pr + '/' + mp +
        '</span></div>';
    }
    var nb = (isU && uD && Date.now() - uD.unlockedAt < 86400000) ?
    '<span class="new-badge">NEW</span>' : '';
    return '<div class="achieve-item ' + (isU ? '' : 'locked') + '" data-achieve-id="' + escapeHtml(ach.id) +
    '" data-achieve-category="' + escapeHtml(ach.category.toUpperCase()) + '"><div class="achieve-icon-wrap ' + escapeHtml(ach.rarity) + '">' + escapeHtml(ach.icon) +
    '<div class="achieve-rarity-badge ' + escapeHtml(ach.rarity) +
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
        var rar = this.RARITY[ach.rarity.toUpperCase()] || this.RARITY.COMMON;
        var m = document.createElement('div');
        m.className = 'modal-overlay';
        m.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:200;display:flex;align-items:center;justify-content:center;';
        m.innerHTML =
        '<div style="background:var(--card);border-radius:var(--radius-lg);max-width:320px;width:90%;max-height:80vh;overflow-y:auto;padding:24px;text-align:center;">' +
        '<div class="achieve-icon-wrap ' + ach.rarity +
        '" style="margin:0 auto 16px;width:80px;height:80px;font-size:40px;">' + escapeHtml(String(ach.icon || '')) +
        '<div class="achieve-rarity-badge ' + ach.rarity + '"></div></div>' +
        '<div style="font-size:20px;font-weight:700;margin-bottom:8px;">' + escapeHtml(String(ach.name || '')) + '</div>' +
        '<div style="margin-bottom:16px;"><span style="padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;background:' +
        (ach.rarity === 'common' ? '#f5f5f5' : ach.rarity === 'rare' ? '#e3f2fd' : ach.rarity ===
        'epic' ? '#f3e5f5' : '#fff8e1') + ';color:' + (ach.rarity === 'common' ? '#616161' : ach
        .rarity === 'rare' ? '#1565c0' : ach.rarity === 'epic' ? '#7b1fa2' : '#e65100') +
        ';">' + rar.label + '</span></div>' +
        '<div style="font-size:14px;color:var(--text-secondary);line-height:1.8;margin-bottom:20px;">' +
        ach.desc + '</div>' +
        '<div style="background:var(--bg);border-radius:var(--radius-md);padding:16px;margin-bottom:16px;"><div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">成就点数</div><div style="font-size:24px;font-weight:700;color:' +
        rar.color + ';">+' + rar.points + '</div></div>' +
        (isU ? '<div style="color:var(--text-secondary);font-size:13px;">✅ 已获得</div>' :
        '<div style="color:var(--text-tertiary);font-size:13px;">锁 未解锁 · 进度: ' + (pd.progress[
        id] || 0) + '/' + (ach.maxProgress || 1) + '</div>') +
        '<button class="crystal-btn" style="margin-top:16px;width:100%;" onclick="this.closest(\'.modal-overlay\').remove()">关闭</button></div>';
        document.body.appendChild(m);
        m.addEventListener('click', function(e) {
            if (e.target === m) m.remove();
            });
    }
};
