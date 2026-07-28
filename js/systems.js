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
                    var amt = parseInt(r && r.amount, 10);
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
        // 【冗余审计 P1-7】用全局 parseProgressParts 替代内联 split
        var pp = parseProgressParts(q.progress || '0/1');
        var current = pp.current;
        var total = pp.total;
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
        // 【冗余审计 P1-7】基于全局 parseProgressParts 算百分比（原内联 split）
        if (!p) return 0;
        var parts = parseProgressParts(p);
        if (parts.total > 0) {
            return Math.min(100, Math.round((parts.current / parts.total) * 100));
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
        // 手动添加任务入口
        html += '<div style="padding:12px 16px;">' +
            '<div class="items-tab-btn" role="button" tabindex="0" data-action="createManualQuest" style="display:inline-flex;align-items:center;gap:4px;padding:8px 16px;">+ 添加任务</div>' +
            '</div>';
        html += '<div class="quest-list-container" id="questListContainer">';
        if (quests.length === 0) {
            html +=
            '<div class="quest-empty-state"><div class="quest-empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div><p>暂无任务</p><p style="font-size:12px;margin-top:4px;">推进剧情会自动生成任务，也可以手动添加</p></div>';
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

// 手动添加任务：输入标题与描述，保存到 StateManager entities.quests
function createManualQuest() {
    if (typeof UI === 'undefined' || !UI.prompt) {
        if (typeof UI !== 'undefined' && UI.toast) UI.toast('输入组件未就绪');
        return;
    }
    UI.prompt('请输入任务标题：', '').then(function(title) {
        title = String(title || '').trim();
        if (!title) {
            if (UI.toast) UI.toast('任务标题不能为空');
            return;
        }
        return UI.prompt('请输入任务描述（可选）：', '').then(function(desc) {
            desc = String(desc || '').trim();
            var quest = {
                title: title,
                desc: desc,
                type: QuestSystem.TYPE.SIDE,
                status: QuestSystem.STATUS.ACTIVE,
                progress: '0/1'
            };
            if (typeof QuestMutator !== 'undefined' && QuestMutator.addQuest) {
                if (QuestMutator.addQuest(quest)) {
                    if (UI.toast) UI.toast('任务添加成功');
                    var content = document.getElementById('logSubContent');
                    if (content && typeof QuestSystem !== 'undefined' && QuestSystem.renderQuestPage) {
                        QuestSystem.renderQuestPage(content);
                    }
                } else {
                    if (UI.toast) UI.toast('任务添加失败');
                }
            } else {
                if (UI.toast) UI.toast('任务系统未就绪');
            }
        });
    });
}

// ========================================
// 题材自适应内容生成 - Theme Adaptive Content
// 当 AI 未返回排行榜/成就模块时，根据当前题材动态生成合理内容
// ========================================
var ThemeAdaptiveContent = (function() {
    'use strict';

    // 题材关键词表（具体题材优先于泛题材）
    var THEME_KEYWORDS = {
        xianxia: /修仙|修真|仙侠|灵石|宗门|筑基|金丹|元婴|化神|渡劫|飞升|天骄|功法|法宝|秘境|妖兽|丹药|灵根|道侣|仙门/,
        wuxia: /武侠|江湖|武林|门派|内功|轻功|剑法|侠客|镖局|客栈|内力|招式|兵器谱|峨眉|少林|武当|丐帮|盟主|大侠/,
        magic_academy: /魔法学院|魔法学校|霍格沃茨|巫师|法师学院|咒术|魔导|学徒|学院都市|炼金|魔药|禁咒|魔咒|分院|教授/,
        fantasy: /西幻|奇幻|精灵|兽人|巨龙|勇者|魔王|魔物|魔法|剑与魔法|冒险者|公会|地下城|迷宫|哥布林|矮人|血族/,
        scifi: /科幻|未来|星际|宇宙飞船|太空|外星|机器人|AI|人工智能|飞船|舰队|银河|机甲|基因|克隆|星际联盟/,
        cyberpunk: /赛博|赛博朋克|义体|黑客|信用点|霓虹|公司|企业|义肢|暗网|仿生人|芯片|义眼|巨型企业/,
        space: /星际|太空|星舰|量子|星币|galaxy|space|宇宙|行星|舰队|跃迁|虫洞|空间站|星系|联邦|帝国/,
        game: /无限流|系统|主神|积分|副本|玩家|游戏|任务面板|属性面板|攻略|副本|通关|等级|公会/,
        apocalypse: /末世|末日|废土|丧尸|僵尸|辐射|避难所|生存|感染|崩坏|灾变|异种|资源|拾荒|庇护所/,
        ancient: /古代|古风|江湖|武侠|宫廷|王府|郡主|皇子|丞相|镖局|客栈|银两|王朝|皇宫|圣旨|科举/,
        urban: /现代|都市|校园|公司|职场|明星|富豪|总裁|网红|直播|大学|高中|娱乐圈|商业|金融/,
        school: /校园|大学|高中|学院|学生|社团|考试|校花|校草|学霸|室友|毕业|学生会|社团/,
        mystery: /悬疑|推理|侦探|案件|谋杀|密室|破案|线索|凶手|刑警|法医|探案|嫌疑人|真相/,
        horror: /恐怖|惊悚|灵异|鬼怪|怪谈|诅咒|厉鬼|阴宅|驱魔|道士|邪祟|附身|怨灵|招魂/,
        romance: /言情|恋爱|甜宠|虐恋|总裁|王妃|皇后|后宫|相亲|约会|cp|配对|心动|暗恋|表白/
    };

    // 排行榜模板：题材 -> 榜单标题、分数名称、NPC 条目
    var RANK_TEMPLATES = {
        xianxia: {
            title: '九州天骄榜',
            scoreName: '修为',
            entries: [
                { name: '顾长歌', value: '大乘期·九重', extra: '太虚圣地圣子' },
                { name: '苏妙真', value: '大乘期·七重', extra: '瑶池圣女' },
                { name: '萧尘', value: '合体期·圆满', extra: '散修剑痴' },
                { name: '叶无双', value: '合体期·后期', extra: '万剑阁首席' },
                { name: '林清雪', value: '炼虚期·圆满', extra: '玄冰宫传人' },
                { name: '莫问天', value: '炼虚期·中期', extra: '天魔教圣子' },
                { name: '柳如烟', value: '化神期·圆满', extra: '妙音宗传人' }
            ]
        },
        wuxia: {
            title: '武林风云榜',
            scoreName: '声望',
            entries: [
                { name: '独孤行', value: '9999', extra: '剑道宗师' },
                { name: '东方朔', value: '9800', extra: '日月教主' },
                { name: '张真人', value: '9600', extra: '武当掌门' },
                { name: '扫地僧', value: '9500', extra: '少林寺隐士' },
                { name: '乔大侠', value: '9200', extra: '丐帮前帮主' },
                { name: '李飞刀', value: '8800', extra: '暗器宗师' },
                { name: '柳无痕', value: '8600', extra: '神偷' }
            ]
        },
        magic_academy: {
            title: '学院实力榜',
            scoreName: '魔力评级',
            entries: [
                { name: '艾琳娜·晨星', value: 'S+', extra: '星辉学院首席' },
                { name: '卡尔·雷文', value: 'S', extra: '黑魔法研究社' },
                { name: '米娅·露珠', value: 'S', extra: '魔药大师' },
                { name: '里奥·烈焰', value: 'A+', extra: '元素决斗冠军' },
                { name: '索菲亚·银月', value: 'A+', extra: '召唤系天才' },
                { name: '诺亚·霜痕', value: 'A', extra: '炼金术师' },
                { name: '薇薇安·风语', value: 'A', extra: '预言课助教' }
            ]
        },
        fantasy: {
            title: '冒险者公会榜',
            scoreName: '贡献点',
            entries: [
                { name: '勇者·亚瑟', value: '12500', extra: 'S级冒险者' },
                { name: '精灵游侠·希尔瓦', value: '11800', extra: '银弓手' },
                { name: '矮人王·索林', value: '11200', extra: '锻造大师' },
                { name: '龙之魔女·米拉', value: '10800', extra: '龙语者' },
                { name: '暗影刺客·凯', value: '10200', extra: '夜行者' },
                { name: '圣骑士·罗兰', value: '9800', extra: '圣殿骑士团' },
                { name: '大贤者·艾尔文', value: '9500', extra: '奥术宗师' }
            ]
        },
        scifi: {
            title: '星际战力榜',
            scoreName: '功勋值',
            entries: [
                { name: '林深', value: '28700', extra: '星舰上将' },
                { name: '艾娃', value: '26500', extra: '机械军团指挥官' },
                { name: '马克西姆', value: '25300', extra: '基因战士' },
                { name: '零号', value: '24100', extra: '觉醒AI' },
                { name: '诺瓦', value: '22900', extra: '虫族猎手' },
                { name: '凯恩', value: '21800', extra: '深潜者队长' },
                { name: '薇拉', value: '20700', extra: '量子间谍' }
            ]
        },
        cyberpunk: {
            title: '地下势力榜',
            scoreName: '悬赏额',
            entries: [
                { name: '幽灵', value: '¥5000000', extra: '传奇独狼' },
                { name: '银臂', value: '¥4800000', extra: '反企业战士' },
                { name: '龙崎', value: '¥4500000', extra: '企业太子' },
                { name: '罗莎', value: '¥4200000', extra: '来生女王' },
                { name: '杜姆', value: '¥3900000', extra: '帮派首领' },
                { name: '朱诺', value: '¥3600000', extra: '意识技师' },
                { name: '帕娜', value: '¥3400000', extra: '游牧族长' }
            ]
        },
        space: {
            title: '星舰指挥官榜',
            scoreName: '舰队积分',
            entries: [
                { name: '舰长·柯克', value: '32000', extra: '联邦旗舰舰长' },
                { name: '企业号舰长·让', value: '31500', extra: '星际舰队传奇' },
                { name: '抵抗军领袖·萨拉', value: '29800', extra: '自由战士' },
                { name: '外星孤儿·卡尔', value: '28500', extra: '最后的氪星之子' },
                { name: '反抗军将军·莱拉', value: '27200', extra: '义军领袖' },
                { name: '走私者·韩', value: '26100', extra: '传奇飞行员' },
                { name: '科学官·斯宾克', value: '25800', extra: '瓦肯科学官' }
            ]
        },
        game: {
            title: '玩家等级榜',
            scoreName: '攻略积分',
            entries: [
                { name: '狂剑·无名', value: 'Lv.95', extra: '全服第一' },
                { name: '散人·笑苍生', value: 'Lv.92', extra: '散人高手' },
                { name: '剑圣·冷风', value: 'Lv.90', extra: '剑术宗师' },
                { name: '枪炮师·橙果', value: 'Lv.88', extra: '重火力专家' },
                { name: '流氓·包子', value: 'Lv.85', extra: '街头格斗家' },
                { name: '元素法师·烟雨', value: 'Lv.84', extra: '元素掌控者' },
                { name: '战斗法师·三打', value: 'Lv.82', extra: '连击大师' }
            ]
        },
        apocalypse: {
            title: '末世生存榜',
            scoreName: '生存积分',
            entries: [
                { name: '雷克', value: '8700', extra: '避难所首领' },
                { name: '艾丽丝', value: '8400', extra: '丧尸猎手' },
                { name: '麦克', value: '8100', extra: '拾荒专家' },
                { name: '萨拉', value: '7800', extra: '医疗队队长' },
                { name: '老乔', value: '7500', extra: '改装大师' },
                { name: '琳达', value: '7200', extra: '种植专家' },
                { name: '卡尔', value: '6900', extra: '侦察兵' }
            ]
        },
        ancient: {
            title: '朝堂权臣榜',
            scoreName: '权势值',
            entries: [
                { name: '李斯', value: '9800', extra: '丞相' },
                { name: '萧何', value: '9600', extra: '开国功臣' },
                { name: '诸葛亮', value: '9500', extra: '蜀汉丞相' },
                { name: '魏征', value: '9200', extra: '谏议大夫' },
                { name: '房玄龄', value: '8900', extra: '尚书左仆射' },
                { name: '张居正', value: '8700', extra: '内阁首辅' },
                { name: '于谦', value: '8500', extra: '兵部尚书' }
            ]
        },
        urban: {
            title: '都市富豪榜',
            scoreName: '资产',
            entries: [
                { name: '马先生', value: '¥4500亿', extra: '科技巨头' },
                { name: '李先生', value: '¥4200亿', extra: '地产大亨' },
                { name: '王先生', value: '¥3800亿', extra: '投资教父' },
                { name: '刘先生', value: '¥3500亿', extra: '电商之王' },
                { name: '张先生', value: '¥3200亿', extra: '新能源领袖' },
                { name: '陈女士', value: '¥2900亿', extra: '医药女王' },
                { name: '赵先生', value: '¥2600亿', extra: '金融新贵' }
            ]
        },
        school: {
            title: '校园风云榜',
            scoreName: '人气值',
            entries: [
                { name: '苏梓涵', value: '9999', extra: '校花·学生会主席' },
                { name: '顾北辰', value: '9850', extra: '校草·篮球队长' },
                { name: '林小满', value: '9620', extra: '学霸·竞赛冠军' },
                { name: '江辰', value: '9480', extra: '音乐社社长' },
                { name: '夏以沫', value: '9350', extra: '话剧社台柱' },
                { name: '陆星野', value: '9200', extra: '电竞社王牌' },
                { name: '沈悦', value: '9100', extra: '志愿队队长' }
            ]
        },
        mystery: {
            title: '侦探排行榜',
            scoreName: '破案数',
            entries: [
                { name: '侦探·夏尔', value: '127', extra: '咨询侦探' },
                { name: '波瓦尔', value: '118', extra: '比利时侦探' },
                { name: '江川', value: '105', extra: '高中生侦探' },
                { name: '金一', value: '98', extra: '高校侦探' },
                { name: '玛莎', value: '87', extra: '乡村侦探' },
                { name: '马龙', value: '76', extra: '硬汉侦探' },
                { name: '御风', value: '71', extra: '占星侦探' }
            ]
        },
        horror: {
            title: '灵异事件处理榜',
            scoreName: '驱邪值',
            entries: [
                { name: '林道长', value: '999', extra: '茅山道长' },
                { name: '康纳', value: '980', extra: '驱魔师' },
                { name: '温氏兄弟', value: '960', extra: '猎人组合' },
                { name: '达克', value: '940', extra: '灵媒' },
                { name: '怨灵猎人', value: '920', extra: '怨灵专家' },
                { name: '驱魔神父', value: '890', extra: '梵蒂冈特派' },
                { name: '阴阳先生', value: '870', extra: '民间术士' }
            ]
        },
        romance: {
            title: '心动人气榜',
            scoreName: '心动值',
            entries: [
                { name: '顾先生', value: '9999', extra: '冷面总裁' },
                { name: '苏小姐', value: '9850', extra: '温柔女主' },
                { name: '陆先生', value: '9720', extra: '腹黑王爷' },
                { name: '林小姐', value: '9600', extra: '独立女性' },
                { name: '江先生', value: '9480', extra: '竹马少年' },
                { name: '夏小姐', value: '9350', extra: '甜系女孩' },
                { name: '沈先生', value: '9200', extra: '深情男二' }
            ]
        },
        modern: {
            title: '都市影响力榜',
            scoreName: '影响力',
            entries: [
                { name: '张子轩', value: '8500', extra: '创业新星' },
                { name: '李梦琪', value: '8320', extra: '自媒体大V' },
                { name: '王浩然', value: '8100', extra: '独立开发者' },
                { name: '陈思颖', value: '7950', extra: '设计师' },
                { name: '刘子墨', value: '7800', extra: '投资人' },
                { name: '赵晓晴', value: '7650', extra: '公益组织者' },
                { name: '周宇航', value: '7500', extra: '旅行博主' }
            ]
        }
    };

    // 玩家在不同题材中的默认榜单定位（插入榜单末尾）
    var PLAYER_RANK_ENTRIES = {
        xianxia: { value: '筑基期·初期', extra: '新晋修士' },
        wuxia: { value: '100', extra: '初入江湖' },
        magic_academy: { value: 'C+', extra: '新生学徒' },
        fantasy: { value: '120', extra: '新人冒险者' },
        scifi: { value: '1500', extra: '新兵' },
        cyberpunk: { value: '¥5000', extra: '街头小子' },
        space: { value: '800', extra: '见习船员' },
        game: { value: 'Lv.1', extra: '新手玩家' },
        apocalypse: { value: '300', extra: '幸存者' },
        ancient: { value: '200', extra: '寒门士子' },
        urban: { value: '¥10万', extra: '职场新人' },
        school: { value: '1200', extra: '转学生' },
        mystery: { value: '0', extra: '实习侦探' },
        horror: { value: '10', extra: '灵异爱好者' },
        romance: { value: '50', extra: '单身主角' },
        modern: { value: '100', extra: '普通人' }
    };

    // 成就基础条件表（条件表达式与 AchievementSystem.checkAchievements 兼容）
    var ACHIEVEMENT_BASES = [
        { key: 'first_step', category: 'story', condition: 'storyCount >= 1', rarity: 'common' },
        { key: 'story_walker', category: 'story', condition: 'storyCount >= 10', rarity: 'rare' },
        { key: 'first_npc', category: 'social', condition: 'npcCount >= 1', rarity: 'common' },
        { key: 'social_butterfly', category: 'social', condition: 'npcCount >= 5', rarity: 'rare' },
        { key: 'first_friend', category: 'social', condition: 'friendlyNpc >= 1', rarity: 'common' },
        { key: 'first_battle', category: 'combat', condition: 'combatCount >= 1', rarity: 'common' },
        { key: 'battle_veteran', category: 'combat', condition: 'combatCount >= 10', rarity: 'rare' },
        { key: 'first_item', category: 'collection', condition: 'bagItems >= 1', rarity: 'common' },
        { key: 'collector', category: 'collection', condition: 'bagItems >= 10', rarity: 'rare' },
        { key: 'rare_find', category: 'collection', condition: 'rareItems >= 1', rarity: 'epic' },
        { key: 'first_quest', category: 'special', condition: 'completedQuests >= 1', rarity: 'common' },
        { key: 'first_location', category: 'explore', condition: 'locations >= 1', rarity: 'common' }
    ];

    // 各题材成就文案覆盖表（保留相同 condition，仅替换名称/描述/图标）
    var THEME_ACHIEVEMENT_TEXT = {
        xianxia: {
            first_step: { name: '初入仙途', desc: '完成第一段修行历程', icon: '仙' },
            story_walker: { name: '问道长生', desc: '完成十段修行历程', icon: '道' },
            story_master: { name: '破碎虚空', desc: '完成三十段修行历程', icon: '虚' },
            first_npc: { name: '道友留步', desc: '结识一位修士', icon: '遇' },
            social_butterfly: { name: '广结仙缘', desc: '结识五位修士', icon: '缘' },
            first_friend: { name: '患难之交', desc: '拥有一位道友', icon: '义' },
            first_love: { name: '双修之缘', desc: '开启一段道侣情缘', icon: '情' },
            first_battle: { name: '初试剑锋', desc: '经历第一场斗法', icon: '剑' },
            battle_veteran: { name: '百战不殆', desc: '经历十场斗法', icon: '战' },
            first_item: { name: '第一件法宝', desc: '获得第一件修仙物品', icon: '器' },
            collector: { name: '法宝藏家', desc: '拥有十件修仙物品', icon: '藏' },
            hoarder: { name: '芥子须弥', desc: '拥有三十件修仙物品', icon: '袋' },
            rare_find: { name: '灵宝现世', desc: '获得一件珍稀法宝', icon: '珍' },
            legendary_find: { name: '上古神器', desc: '获得一件传说神器', icon: '神' },
            first_quest: { name: '下山历练', desc: '完成第一次历练', icon: '历' },
            quest_master: { name: '历练达人', desc: '完成五次历练', icon: '达' },
            first_location: { name: '踏足灵山', desc: '探索一处修仙福地', icon: '山' },
            hidden_realm: { name: '秘境探幽', desc: '发现一处隐藏秘境', icon: '秘' }
        },
        wuxia: {
            first_step: { name: '初出茅庐', desc: '经历第一段江湖故事', icon: '江' },
            story_walker: { name: '江湖行客', desc: '经历十段江湖故事', icon: '湖' },
            story_master: { name: '武林传奇', desc: '经历三十段江湖故事', icon: '侠' },
            first_npc: { name: '萍水相逢', desc: '结识一位江湖人士', icon: '逢' },
            social_butterfly: { name: '四海为友', desc: '结识五位江湖人士', icon: '友' },
            first_friend: { name: '肝胆相照', desc: '拥有一位江湖知己', icon: '照' },
            first_love: { name: '儿女情长', desc: '开启一段江湖情缘', icon: '情' },
            first_battle: { name: '初露锋芒', desc: '经历第一场比武', icon: '锋' },
            battle_veteran: { name: '身经百战', desc: '经历十场比武', icon: '战' },
            first_item: { name: '第一件兵器', desc: '获得第一件江湖物品', icon: '兵' },
            collector: { name: '兵器谱收藏家', desc: '拥有十件江湖物品', icon: '谱' },
            hoarder: { name: '百宝囊', desc: '拥有三十件江湖物品', icon: '囊' },
            rare_find: { name: '神兵利器', desc: '获得一件珍稀兵器', icon: '利' },
            legendary_find: { name: '绝世神兵', desc: '获得一件传说兵器', icon: '绝' },
            first_quest: { name: '接受委托', desc: '完成第一个江湖委托', icon: '托' },
            quest_master: { name: '委托大师', desc: '完成五个江湖委托', icon: '师' },
            first_location: { name: '踏足名山', desc: '探索一处江湖胜地', icon: '山' },
            hidden_realm: { name: '洞天福地', desc: '发现一处隐藏秘境', icon: '隐' }
        },
        magic_academy: {
            first_step: { name: '入学第一天', desc: '完成第一段学院故事', icon: '学' },
            story_walker: { name: '优等生', desc: '完成十段学院故事', icon: '优' },
            story_master: { name: '传奇毕业生', desc: '完成三十段学院故事', icon: '毕' },
            first_npc: { name: '新同学', desc: '结识一位学院成员', icon: '同' },
            social_butterfly: { name: '社团明星', desc: '结识五位学院成员', icon: '星' },
            first_friend: { name: '室友', desc: '拥有一位学院好友', icon: '室' },
            first_love: { name: '校园恋情', desc: '开启一段学院恋情', icon: '恋' },
            first_battle: { name: '首次决斗', desc: '经历第一场魔法决斗', icon: '斗' },
            battle_veteran: { name: '决斗冠军', desc: '经历十场魔法决斗', icon: '冠' },
            first_item: { name: '第一件魔具', desc: '获得第一件魔法物品', icon: '具' },
            collector: { name: '魔具收藏', desc: '拥有十件魔法物品', icon: '藏' },
            hoarder: { name: '移动仓库', desc: '拥有三十件魔法物品', icon: '仓' },
            rare_find: { name: '稀有魔具', desc: '获得一件珍稀魔具', icon: '稀' },
            legendary_find: { name: '传说魔导器', desc: '获得一件传说魔导器', icon: '导' },
            first_quest: { name: '课程作业', desc: '完成第一个学院任务', icon: '业' },
            quest_master: { name: '全优学员', desc: '完成五个学院任务', icon: '优' },
            first_location: { name: '参观校园', desc: '探索一处学院地点', icon: '校' },
            hidden_realm: { name: '禁书区', desc: '发现一处隐藏地点', icon: '禁' }
        },
        fantasy: {
            first_step: { name: '冒险开始', desc: '完成第一段冒险故事', icon: '启' },
            story_walker: { name: '资深冒险者', desc: '完成十段冒险故事', icon: '者' },
            story_master: { name: '传说英雄', desc: '完成三十段冒险故事', icon: '雄' },
            first_npc: { name: '酒馆相遇', desc: '结识一位冒险伙伴', icon: '遇' },
            social_butterfly: { name: '冒险小队', desc: '结识五位冒险伙伴', icon: '队' },
            first_friend: { name: '生死之交', desc: '拥有一位冒险挚友', icon: '交' },
            first_love: { name: '浪漫邂逅', desc: '开启一段冒险恋情', icon: '邂' },
            first_battle: { name: '首战告捷', desc: '经历第一场战斗', icon: '战' },
            battle_veteran: { name: '战斗大师', desc: '经历十场战斗', icon: '师' },
            first_item: { name: '第一件战利品', desc: '获得第一件冒险物品', icon: '利' },
            collector: { name: '寻宝猎人', desc: '拥有十件冒险物品', icon: '猎' },
            hoarder: { name: '巨龙宝库', desc: '拥有三十件冒险物品', icon: '库' },
            rare_find: { name: '史诗装备', desc: '获得一件珍稀装备', icon: '史' },
            legendary_find: { name: '传说圣器', desc: '获得一件传说圣器', icon: '圣' },
            first_quest: { name: '公会委托', desc: '完成第一个公会任务', icon: '公' },
            quest_master: { name: '公会传奇', desc: '完成五个公会任务', icon: '传' },
            first_location: { name: '新地图开启', desc: '探索一处新地图', icon: '图' },
            hidden_realm: { name: '隐藏迷宫', desc: '发现一处隐藏迷宫', icon: '迷' }
        },
        scifi: {
            first_step: { name: '启航', desc: '完成第一段科幻故事', icon: '航' },
            story_walker: { name: '星际旅者', desc: '完成十段科幻故事', icon: '旅' },
            story_master: { name: '银河传说', desc: '完成三十段科幻故事', icon: '银' },
            first_npc: { name: '首次接触', desc: '结识一位外星/未来角色', icon: '触' },
            social_butterfly: { name: '星际社交网络', desc: '结识五位角色', icon: '网' },
            first_friend: { name: '船员伙伴', desc: '拥有一位战友', icon: '伴' },
            first_love: { name: '跨星之恋', desc: '开启一段星际恋情', icon: '恋' },
            first_battle: { name: '首役', desc: '经历第一场星际战斗', icon: '役' },
            battle_veteran: { name: '王牌机师', desc: '经历十场星际战斗', icon: '机' },
            first_item: { name: '第一件科技物品', desc: '获得第一件科技物品', icon: '科' },
            collector: { name: '科技收藏家', desc: '拥有十件科技物品', icon: '藏' },
            hoarder: { name: '星际仓库', desc: '拥有三十件科技物品', icon: '舱' },
            rare_find: { name: '原型科技', desc: '获得一件珍稀科技物品', icon: '原' },
            legendary_find: { name: '古代科技', desc: '获得一件传说级科技物品', icon: '古' },
            first_quest: { name: '航行任务', desc: '完成第一个航行任务', icon: '航' },
            quest_master: { name: '舰队指挥官', desc: '完成五个航行任务', icon: '令' },
            first_location: { name: '登陆新星球', desc: '探索一处新星球', icon: '球' },
            hidden_realm: { name: '未知星域', desc: '发现一处未知星域', icon: '域' }
        },
        cyberpunk: {
            first_step: { name: '街头首秀', desc: '完成第一段赛博朋克故事', icon: '街' },
            story_walker: { name: '城市幽灵', desc: '完成十段赛博朋克故事', icon: '灵' },
            story_master: { name: '传奇独狼', desc: '完成三十段赛博朋克故事', icon: '狼' },
            first_npc: { name: '接头人', desc: '结识一位街头角色', icon: '接' },
            social_butterfly: { name: '人脉网络', desc: '结识五位街头角色', icon: '脉' },
            first_friend: { name: '可靠伙伴', desc: '拥有一位可靠伙伴', icon: '靠' },
            first_love: { name: '霓虹之恋', desc: '开启一段霓虹恋情', icon: '霓' },
            first_battle: { name: '首次火并', desc: '经历第一场街头战斗', icon: '火' },
            battle_veteran: { name: '街头传奇', desc: '经历十场街头战斗', icon: '传' },
            first_item: { name: '第一件义体', desc: '获得第一件赛博物品', icon: '体' },
            collector: { name: '装备囤积者', desc: '拥有十件赛博物品', icon: '囤' },
            hoarder: { name: '军火库', desc: '拥有三十件赛博物品', icon: '库' },
            rare_find: { name: '军用级义体', desc: '获得一件珍稀赛博物品', icon: '军' },
            legendary_find: { name: '传说级黑客装备', desc: '获得一件传说级装备', icon: '黑' },
            first_quest: { name: '首次委托', desc: '完成第一个委托', icon: '托' },
            quest_master: { name: '中间人', desc: '完成五个委托', icon: '中' },
            first_location: { name: '新街区', desc: '探索一处新街区', icon: '区' },
            hidden_realm: { name: '暗网深处', desc: '发现一处隐藏据点', icon: '暗' }
        },
        space: {
            first_step: { name: '首次跃迁', desc: '完成第一段星际故事', icon: '迁' },
            story_walker: { name: '星舰老兵', desc: '完成十段星际故事', icon: '舰' },
            story_master: { name: '银河英雄', desc: '完成三十段星际故事', icon: '英' },
            first_npc: { name: '外星接触', desc: '结识一位外星角色', icon: '外' },
            social_butterfly: { name: '星际外交官', desc: '结识五位角色', icon: '使' },
            first_friend: { name: '船员兄弟', desc: '拥有一位船员兄弟', icon: '兄' },
            first_love: { name: '星际之恋', desc: '开启一段星际恋情', icon: '心' },
            first_battle: { name: '首次接敌', desc: '经历第一场星战', icon: '敌' },
            battle_veteran: { name: '王牌舰长', desc: '经历十场星战', icon: '王' },
            first_item: { name: '第一件星舰物资', desc: '获得第一件星际物品', icon: '物' },
            collector: { name: '星际收藏家', desc: '拥有十件星际物品', icon: '藏' },
            hoarder: { name: '货舱管理员', desc: '拥有三十件星际物品', icon: '舱' },
            rare_find: { name: '外星科技', desc: '获得一件珍稀星际物品', icon: '科' },
            legendary_find: { name: '上古星图', desc: '获得一件传说级物品', icon: '图' },
            first_quest: { name: '航行指令', desc: '完成第一个航行指令', icon: '令' },
            quest_master: { name: '舰队统帅', desc: '完成五个航行指令', icon: '帅' },
            first_location: { name: '新星系', desc: '探索一处新星系', icon: '系' },
            hidden_realm: { name: '未知星域', desc: '发现一处未知星域', icon: '域' }
        },
        game: {
            first_step: { name: '新手教程', desc: '完成第一段游戏剧情', icon: '教' },
            story_walker: { name: '攻略达人', desc: '完成十段游戏剧情', icon: '略' },
            story_master: { name: '全服传说', desc: '完成三十段游戏剧情', icon: '说' },
            first_npc: { name: '组队邀请', desc: '结识一位玩家/NPC', icon: '组' },
            social_butterfly: { name: '公会骨干', desc: '结识五位玩家/NPC', icon: '会' },
            first_friend: { name: '固定队友', desc: '拥有一位固定队友', icon: '固' },
            first_love: { name: '游戏情缘', desc: '开启一段游戏恋情', icon: '缘' },
            first_battle: { name: '首次副本', desc: '经历第一场战斗', icon: '副' },
            battle_veteran: { name: '副本通关王', desc: '经历十场战斗', icon: '王' },
            first_item: { name: '第一件掉落', desc: '获得第一件游戏物品', icon: '掉' },
            collector: { name: '装备党', desc: '拥有十件游戏物品', icon: '党' },
            hoarder: { name: '仓库爆仓', desc: '拥有三十件游戏物品', icon: '仓' },
            rare_find: { name: '紫装入手', desc: '获得一件珍稀装备', icon: '紫' },
            legendary_find: { name: '橙装传说', desc: '获得一件传说装备', icon: '橙' },
            first_quest: { name: '任务起步', desc: '完成第一个任务', icon: '起' },
            quest_master: { name: '任务狂魔', desc: '完成五个任务', icon: '魔' },
            first_location: { name: '新地图', desc: '探索一处新地图', icon: '图' },
            hidden_realm: { name: '隐藏副本', desc: '发现一处隐藏副本', icon: '隐' }
        },
        apocalypse: {
            first_step: { name: '末日余生', desc: '完成第一段求生故事', icon: '生' },
            story_walker: { name: '废土行者', desc: '完成十段求生故事', icon: '土' },
            story_master: { name: '废土传奇', desc: '完成三十段求生故事', icon: '奇' },
            first_npc: { name: '幸存同伴', desc: '结识一位幸存者', icon: '伴' },
            social_butterfly: { name: '聚落领袖', desc: '结识五位幸存者', icon: '落' },
            first_friend: { name: '生死与共', desc: '拥有一位战友', icon: '共' },
            first_love: { name: '末日温情', desc: '开启一段末日恋情', icon: '温' },
            first_battle: { name: '首次遭遇', desc: '经历第一场遭遇战', icon: '遭' },
            battle_veteran: { name: '丧尸猎手', desc: '经历十场遭遇战', icon: '猎' },
            first_item: { name: '第一件补给', desc: '获得第一件生存物品', icon: '补' },
            collector: { name: '物资囤积者', desc: '拥有十件生存物品', icon: '囤' },
            hoarder: { name: '移动仓库', desc: '拥有三十件生存物品', icon: '仓' },
            rare_find: { name: '稀有物资', desc: '获得一件珍稀物资', icon: '稀' },
            legendary_find: { name: '传说级装备', desc: '获得一件传说级装备', icon: '神' },
            first_quest: { name: '求生任务', desc: '完成第一个求生任务', icon: '求' },
            quest_master: { name: '废土之王', desc: '完成五个求生任务', icon: '王' },
            first_location: { name: '探索废墟', desc: '探索一处废墟', icon: '墟' },
            hidden_realm: { name: '秘密避难所', desc: '发现一处隐藏避难所', icon: '避' }
        },
        ancient: {
            first_step: { name: '初入尘世', desc: '完成第一段古代故事', icon: '尘' },
            story_walker: { name: '历经沧桑', desc: '完成十段古代故事', icon: '桑' },
            story_master: { name: '名垂青史', desc: '完成三十段古代故事', icon: '史' },
            first_npc: { name: '萍水相逢', desc: '结识一位古人', icon: '逢' },
            social_butterfly: { name: '广结善缘', desc: '结识五位古人', icon: '缘' },
            first_friend: { name: '知己', desc: '拥有一位知己', icon: '己' },
            first_love: { name: '郎情妾意', desc: '开启一段古代恋情', icon: '意' },
            first_battle: { name: '初试武艺', desc: '经历第一场战斗', icon: '武' },
            battle_veteran: { name: '沙场老将', desc: '经历十场战斗', icon: '将' },
            first_item: { name: '第一件古物', desc: '获得第一件古代物品', icon: '古' },
            collector: { name: '古董收藏家', desc: '拥有十件古代物品', icon: '董' },
            hoarder: { name: '宝箱满满', desc: '拥有三十件古代物品', icon: '箱' },
            rare_find: { name: '珍稀古玩', desc: '获得一件珍稀古物', icon: '珍' },
            legendary_find: { name: '传国之宝', desc: '获得一件传说级宝物', icon: '宝' },
            first_quest: { name: '初次差遣', desc: '完成第一个差遣', icon: '遣' },
            quest_master: { name: '朝廷栋梁', desc: '完成五个差遣', icon: '栋' },
            first_location: { name: '游历四方', desc: '探索一处古代地点', icon: '游' },
            hidden_realm: { name: '世外桃源', desc: '发现一处隐藏秘境', icon: '源' }
        },
        urban: {
            first_step: { name: '都市新人', desc: '完成第一段都市故事', icon: '城' },
            story_walker: { name: '都市精英', desc: '完成十段都市故事', icon: '精' },
            story_master: { name: '都市传说', desc: '完成三十段都市故事', icon: '说' },
            first_npc: { name: '初次社交', desc: '结识一位都市角色', icon: '社' },
            social_butterfly: { name: '人脉广泛', desc: '结识五位都市角色', icon: '脉' },
            first_friend: { name: '死党', desc: '拥有一位好友', icon: '党' },
            first_love: { name: '都市恋情', desc: '开启一段都市恋情', icon: '恋' },
            first_battle: { name: '职场交锋', desc: '经历第一场交锋', icon: '锋' },
            battle_veteran: { name: '商界老手', desc: '经历十场交锋', icon: '商' },
            first_item: { name: '第一件物品', desc: '获得第一件都市物品', icon: '物' },
            collector: { name: '品质生活', desc: '拥有十件都市物品', icon: '品' },
            hoarder: { name: '购物狂', desc: '拥有三十件都市物品', icon: '购' },
            rare_find: { name: '奢侈品', desc: '获得一件珍稀物品', icon: '奢' },
            legendary_find: { name: '限量典藏', desc: '获得一件传说级藏品', icon: '典' },
            first_quest: { name: '工作任务', desc: '完成第一个任务', icon: '任' },
            quest_master: { name: '项目总监', desc: '完成五个任务', icon: '监' },
            first_location: { name: '城市新地标', desc: '探索一处新地标', icon: '标' },
            hidden_realm: { name: '秘密会所', desc: '发现一处隐藏地点', icon: '所' }
        },
        school: {
            first_step: { name: '开学第一天', desc: '完成第一段校园故事', icon: '开' },
            story_walker: { name: '校园达人', desc: '完成十段校园故事', icon: '达' },
            story_master: { name: '校园传说', desc: '完成三十段校园故事', icon: '说' },
            first_npc: { name: '新同学', desc: '结识一位同学', icon: '同' },
            social_butterfly: { name: '人气王', desc: '结识五位同学', icon: '气' },
            first_friend: { name: '同桌', desc: '拥有一位好友', icon: '桌' },
            first_love: { name: '初恋', desc: '开启一段校园恋情', icon: '恋' },
            first_battle: { name: '首次竞争', desc: '经历第一场竞争', icon: '竞' },
            battle_veteran: { name: '竞赛冠军', desc: '经历十场竞争', icon: '冠' },
            first_item: { name: '第一件文具', desc: '获得第一件校园物品', icon: '具' },
            collector: { name: '收藏癖', desc: '拥有十件校园物品', icon: '癖' },
            hoarder: { name: '背包超重', desc: '拥有三十件校园物品', icon: '包' },
            rare_find: { name: '限定周边', desc: '获得一件珍稀物品', icon: '限' },
            legendary_find: { name: '传说级手办', desc: '获得一件传说级藏品', icon: '办' },
            first_quest: { name: '社团任务', desc: '完成第一个社团任务', icon: '团' },
            quest_master: { name: '学生会主席', desc: '完成五个任务', icon: '席' },
            first_location: { name: '新社团教室', desc: '探索一处新地点', icon: '教' },
            hidden_realm: { name: '传说之校', desc: '发现一处隐藏地点', icon: '秘' }
        },
        mystery: {
            first_step: { name: '案件初探', desc: '完成第一段侦探故事', icon: '探' },
            story_walker: { name: '资深侦探', desc: '完成十段侦探故事', icon: '侦' },
            story_master: { name: '名侦探', desc: '完成三十段侦探故事', icon: '名' },
            first_npc: { name: '目击者', desc: '结识一位案件相关者', icon: '目' },
            social_butterfly: { name: '情报网', desc: '结识五位案件相关者', icon: '情' },
            first_friend: { name: '线人', desc: '拥有一位线人', icon: '线' },
            first_love: { name: '危险关系', desc: '开启一段危险恋情', icon: '危' },
            first_battle: { name: '首次对峙', desc: '经历第一场对峙', icon: '峙' },
            battle_veteran: { name: '格斗专家', desc: '经历十场对峙', icon: '斗' },
            first_item: { name: '第一件证物', desc: '获得第一件证物', icon: '证' },
            collector: { name: '证物室', desc: '拥有十件证物', icon: '室' },
            hoarder: { name: '档案管理员', desc: '拥有三十件证物', icon: '档' },
            rare_find: { name: '关键证物', desc: '获得一件关键证物', icon: '键' },
            legendary_find: { name: '决定性证据', desc: '获得一件决定性证据', icon: '决' },
            first_quest: { name: '立案调查', desc: '完成第一个案件', icon: '立' },
            quest_master: { name: '破案神探', desc: '完成五个案件', icon: '探' },
            first_location: { name: '案发现场', desc: '探索一处案发现场', icon: '场' },
            hidden_realm: { name: '秘密据点', desc: '发现一处隐藏据点', icon: '点' }
        },
        horror: {
            first_step: { name: '撞鬼初体验', desc: '完成第一段灵异故事', icon: '鬼' },
            story_walker: { name: '灵异调查员', desc: '完成十段灵异故事', icon: '调' },
            story_master: { name: '驱魔大师', desc: '完成三十段灵异故事', icon: '魔' },
            first_npc: { name: '同道中人', desc: '结识一位灵异相关者', icon: '道' },
            social_butterfly: { name: '灵异圈子', desc: '结识五位灵异相关者', icon: '圈' },
            first_friend: { name: '护身伙伴', desc: '拥有一位伙伴', icon: '护' },
            first_love: { name: '人鬼情未了', desc: '开启一段灵异恋情', icon: '情' },
            first_battle: { name: '首次驱邪', desc: '经历第一场驱邪', icon: '邪' },
            battle_veteran: { name: '邪祟克星', desc: '经历十场驱邪', icon: '克' },
            first_item: { name: '第一件法器', desc: '获得第一件法器', icon: '法' },
            collector: { name: '法器收藏', desc: '拥有十件法器', icon: '藏' },
            hoarder: { name: '道观库房', desc: '拥有三十件法器', icon: '库' },
            rare_find: { name: '稀有法器', desc: '获得一件珍稀法器', icon: '稀' },
            legendary_find: { name: '上古神器', desc: '获得一件传说级神器', icon: '神' },
            first_quest: { name: '除灵委托', desc: '完成第一个除灵委托', icon: '除' },
            quest_master: { name: '镇邪真人', desc: '完成五个除灵委托', icon: '镇' },
            first_location: { name: '凶宅探索', desc: '探索一处凶宅', icon: '宅' },
            hidden_realm: { name: '阴阳界', desc: '发现一处阴阳交界', icon: '界' }
        },
        romance: {
            first_step: { name: '心动初遇', desc: '完成第一段恋爱故事', icon: '遇' },
            story_walker: { name: '恋爱高手', desc: '完成十段恋爱故事', icon: '高' },
            story_master: { name: '情圣', desc: '完成三十段恋爱故事', icon: '圣' },
            first_npc: { name: '初次邂逅', desc: '结识一位可攻略角色', icon: '邂' },
            social_butterfly: { name: '众星捧月', desc: '结识五位可攻略角色', icon: '星' },
            first_friend: { name: '知心闺蜜', desc: '拥有一位闺蜜/兄弟', icon: '闺' },
            first_love: { name: '坠入爱河', desc: '开启一段恋情', icon: '河' },
            first_battle: { name: '情敌对决', desc: '经历第一场情敌对决', icon: '敌' },
            battle_veteran: { name: '情场老手', desc: '经历十场情敌对决', icon: '场' },
            first_item: { name: '第一件礼物', desc: '获得第一件礼物', icon: '礼' },
            collector: { name: '礼物收藏家', desc: '拥有十件礼物', icon: '藏' },
            hoarder: { name: '礼物山', desc: '拥有三十件礼物', icon: '山' },
            rare_find: { name: '珍贵礼物', desc: '获得一件珍贵礼物', icon: '贵' },
            legendary_find: { name: '定情信物', desc: '获得一件传说级信物', icon: '信' },
            first_quest: { name: '约会任务', desc: '完成第一个约会任务', icon: '约' },
            quest_master: { name: '约会大师', desc: '完成五个约会任务', icon: '师' },
            first_location: { name: '约会地点', desc: '探索一处约会地点', icon: '点' },
            hidden_realm: { name: '秘密约会地', desc: '发现一处秘密地点', icon: '密' }
        },
        modern: {
            first_step: { name: '新的开始', desc: '完成第一段故事', icon: '始' },
            story_walker: { name: '故事行者', desc: '完成十段故事', icon: '行' },
            story_master: { name: '故事大师', desc: '完成三十段故事', icon: '师' },
            first_npc: { name: '初次相识', desc: '结识一位角色', icon: '识' },
            social_butterfly: { name: '社交达人', desc: '结识五位角色', icon: '社' },
            first_friend: { name: '好友', desc: '拥有一位好友', icon: '友' },
            first_love: { name: '浪漫关系', desc: '开启一段浪漫关系', icon: '爱' },
            first_battle: { name: '首次冲突', desc: '经历第一场冲突', icon: '冲' },
            battle_veteran: { name: '冲突专家', desc: '经历十场冲突', icon: '专' },
            first_item: { name: '第一件物品', desc: '获得第一件物品', icon: '物' },
            collector: { name: '收藏家', desc: '拥有十件物品', icon: '藏' },
            hoarder: { name: '囤积者', desc: '拥有三十件物品', icon: '囤' },
            rare_find: { name: '稀有物品', desc: '获得一件稀有物品', icon: '稀' },
            legendary_find: { name: '传说物品', desc: '获得一件传说物品', icon: '传' },
            first_quest: { name: '首次任务', desc: '完成第一个任务', icon: '任' },
            quest_master: { name: '任务大师', desc: '完成五个任务', icon: '师' },
            first_location: { name: '新地点', desc: '探索一处新地点', icon: '地' },
            hidden_realm: { name: '隐藏地点', desc: '发现一处隐藏地点', icon: '隐' }
        }
    };

    function _collectThemeText() {
        var gs = gameState || {};
        var parts = [];
        parts.push(gs.theme || '');
        parts.push(gs.genre || '');
        parts.push(gs.userPrompt || '');
        parts.push(gs.setupText || '');

        var player = (typeof StateManager !== 'undefined' && StateManager.get)
            ? (StateManager.get('entities.player') || {})
            : (gs.playerData || {});
        parts.push(player.identity || '');
        parts.push(player.name || '');

        var modules = gs._worldModules || [];
        modules.forEach(function(m) {
            if (!m) return;
            if (m.type === 'lore' || m.type === 'setting' || m.type === 'world' || m.type === 'rules') {
                parts.push(m.title || '');
                parts.push(m.content || '');
                parts.push(m.desc || '');
                if (Array.isArray(m.items)) {
                    m.items.forEach(function(it) {
                        if (typeof it === 'string') {
                            parts.push(it);
                        } else if (it && typeof it === 'object') {
                            parts.push((it.title || '') + ' ' + (it.content || '') + ' ' + (it.desc || '') + ' ' + (it.name || ''));
                        }
                    });
                }
            }
        });

        var snap = gs.worldSnapshot || {};
        if (snap.summary) parts.push(snap.summary);
        if (Array.isArray(snap.characters)) {
            snap.characters.forEach(function(c) {
                if (c && typeof c === 'object') {
                    parts.push((c.name || '') + ' ' + (c.desc || '') + ' ' + (c.title || '') + ' ' + (c.identity || ''));
                }
            });
        }

        return parts.join(' ').toLowerCase();
    }

    function detectTheme() {
        var text = _collectThemeText();
        var keys = Object.keys(THEME_KEYWORDS);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (THEME_KEYWORDS[key].test(text)) return key;
        }
        return 'modern';
    }

    function _buildFingerprint() {
        var text = _collectThemeText();
        var hash = 0;
        for (var i = 0; i < text.length; i++) {
            var c = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + c;
            hash = hash & hash;
        }
        return detectTheme() + '_' + Math.abs(hash).toString(36);
    }

    function _getCache(key) {
        var gs = gameState || {};
        var cacheProp = '_theme' + key + 'Cache';
        return gs[cacheProp] || null;
    }

    function _setCache(key, data) {
        var gs = gameState || {};
        var cacheProp = '_theme' + key + 'Cache';
        gs[cacheProp] = {
            fingerprint: _buildFingerprint(),
            data: data,
            generatedAt: Date.now()
        };
    }

    function _withCache(key, generator) {
        var cache = _getCache(key);
        var fp = _buildFingerprint();
        if (cache && cache.fingerprint === fp) {
            return cache.data;
        }
        var data = generator();
        _setCache(key, data);
        return data;
    }

    function _getPlayerName() {
        var gs = gameState || {};
        var player = (typeof StateManager !== 'undefined' && StateManager.get)
            ? (StateManager.get('entities.player') || {})
            : (gs.playerData || {});
        return player.name || gs.playerName || '我';
    }

    function _buildRankingModule() {
        var theme = detectTheme();
        var tpl = RANK_TEMPLATES[theme] || RANK_TEMPLATES.modern;
        var entries = (tpl.entries || []).slice(0, 7).map(function(e) {
            return { name: e.name, value: e.value, extra: e.extra };
        });
        var playerName = _getPlayerName();
        var playerEntry = PLAYER_RANK_ENTRIES[theme] || PLAYER_RANK_ENTRIES.modern;
        var alreadyHasPlayer = entries.some(function(e) {
            return e.name === playerName;
        });
        if (!alreadyHasPlayer && playerName && playerName !== '我') {
            entries.push({
                name: playerName,
                value: playerEntry.value,
                extra: playerEntry.extra
            });
        }
        return {
            type: 'ranking',
            title: tpl.title,
            scoreName: tpl.scoreName,
            items: entries
        };
    }

    function _buildAchievements() {
        var theme = detectTheme();
        var textOverrides = THEME_ACHIEVEMENT_TEXT[theme] || THEME_ACHIEVEMENT_TEXT.modern;
        var list = [];
        ACHIEVEMENT_BASES.forEach(function(base) {
            var over = textOverrides[base.key] || {};
            var name = over.name || base.key;
            var desc = over.desc || '完成目标解锁';
            var icon = over.icon || '奖';
            var rarity = base.rarity || 'common';
            var category = base.category || 'general';
            var cond = base.condition || 'true';
            var maxProgress = null;
            var match = />=\s*(\d+)/.exec(cond);
            if (match) maxProgress = parseInt(match[1], 10);
            list.push({
                id: 'theme_' + theme + '_' + base.key,
                name: name,
                desc: desc,
                category: category,
                rarity: rarity,
                icon: icon,
                condition: cond,
                maxProgress: maxProgress,
                points: 10
            });
        });
        return list;
    }

    return {
        detectTheme: detectTheme,
        getDynamicRankingModules: function() {
            return _withCache('Rank', function() {
                return [_buildRankingModule()];
            });
        },
        getDynamicAchievements: function() {
            return _withCache('Achievements', _buildAchievements);
        },
        clearCache: function() {
            var gs = gameState || {};
            gs._themeRankCache = null;
            gs._themeAchievementsCache = null;
        }
    };
})();

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
        // 【P1-2 修复】空值安全检查：gameState 未初始化时返回空数组
        if (!gameState) return [];
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
        // 【修复】成就属于当前剧本，由AI根据剧情生成。
        // 不再使用系统预设的题材模板填充——如果AI未生成成就，返回空数组，
        // 页面会显示"成就系统即将开放"的空状态提示。
        return aiAchievements;
    },
    getPlayerAchievements() {
        // 【P1-2 修复】空值安全检查：gameState 未初始化时返回默认空状态
        if (!gameState) return { unlocked: [], progress: {}, totalPoints: 0, lastCheck: 0 };
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
        // 【P1-2 修复】空值安全检查：gameState 未初始化时返回默认空统计
        var stats = {
            storyCount: 0, npcCount: 0, friendlyNpc: 0, romanceNpc: 0, allyNpc: 0,
            combatCount: 0, winStreak: 0, bagItems: 0, rareItems: 0,
            legendaryItems: 0, locations: 0, hiddenLocations: 0,
            completedQuests: 0  // 【BUG修复】新增已完成任务统计，用于"任务达人"成就判定
        };
        if (!gameState) return stats;
        stats.storyCount = (gameState.conversationHistory || []).filter(function(m) { return m.role === 'assistant'; }).length;
        stats.npcCount = Object.keys(gameState.allCharacters || {}).length;
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
    // 【BUG修复】统计已完成任务数量，用于"任务达人"成就判定
    var allQuests = (typeof StateManager !== 'undefined' && StateManager.get)
        ? (StateManager.get('entities.quests') || [])
        : (gameState.currentQuests || []);
    if (Array.isArray(allQuests)) {
        stats.completedQuests = allQuests.filter(function(q) {
            return q && (q.status === '已完成' || q.status === 'completed' || q.status === QuestSystem.STATUS.COMPLETED);
        }).length;
    }
    // 统计已探索地点数量，用于探索类成就判定
    var locs = (typeof StateManager !== 'undefined' && StateManager.get)
        ? (StateManager.get('entities.locations') || [])
        : (gameState.locations || []);
    if (Array.isArray(locs)) {
        stats.locations = locs.length;
    }
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
            var _shouldUnlock = false;
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
                    var val = parseInt(match[3], 10);
                    var statVal = stats[field] || 0;
                    switch (op) {
                        // 【BUG修复】>= 条件：进度为 min(val, statVal)，但解锁条件必须是 statVal >= val
                        case '>=': np = Math.min(val, statVal); _shouldUnlock = statVal >= val; break;
                        case '<=': np = statVal <= val ? 1 : 0; _shouldUnlock = statVal <= val; break;
                        case '>': np = statVal > val ? 1 : 0; _shouldUnlock = statVal > val; break;
                        case '<': np = statVal < val ? 1 : 0; _shouldUnlock = statVal < val; break;
                        case '==': np = statVal === val ? 1 : 0; _shouldUnlock = statVal === val; break;
                        case '!=': np = statVal !== val ? 1 : 0; _shouldUnlock = statVal !== val; break;
                    }
                } else if (cond === 'nightOwl') {
                    var h = new Date().getHours();
                    np = (h >= 2 && h < 5) ? 1 : 0;
                    _shouldUnlock = np >= 1;
                } else if (cond !== 'true') {
                    // 未知条件格式，尝试作为简单布尔值
                    np = 0;
                } else {
                    _shouldUnlock = true;
                }
            } catch(e) {
                np = 0;
            }
    pd.progress[ach.id] = np;
    // 【BUG修复】使用 _shouldUnlock 判断是否解锁，而非 np >= mp
    // 旧逻辑：mp = ach.maxProgress || 1，当 maxProgress 未设置时默认为 1，
    // 导致 >= 条件的成就（如 storyCount >= 5）在 storyCount=3 时因 np=3 >= 1 而错误解锁
    if (_shouldUnlock) {
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
        var normalized = _normalizeRarity(r);
        return pd.unlocked.filter(function(u) {
            return u.rarity === normalized;
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
            html += '<div class="empty-state" style="padding:40px 20px;"><div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div><p>成就系统即将开放</p><p style="font-size:13px;margin-top:8px;color:var(--text-secondary);">本剧本的成就将随剧情推进由AI自动生成</p></div></div>';
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
    '" data-achieve-category="' + escapeHtml(_normalizeCategory(ach.category)) + '"><div class="achieve-info"><div class="achieve-name">' + escapeHtml(ach.name) + nb +
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
    // 【P1-2 修复】空值安全检查：gameState 未初始化时直接返回
    if (!gameState) return;
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
            // 【冗余审计 P1-7】用全局 parseProgressParts 替代内联 split
            var pp = parseProgressParts(q.progress);
            var percent = pp.total > 0 ? Math.min(100, Math.round(pp.current / pp.total * 100)) : 0;
            html += '<div class="quest-progress-row">';
            html +=
                '<div class="quest-progress-bar"><div class="quest-progress-fill" style="width:' +
                percent + '%"></div></div>';
            html += '<span class="quest-progress-text">' + escapeHtml(String(q.progress)) + '</span>';
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
    // 【P1-2 修复】空值安全检查：gameState 未初始化时直接返回
    if (!gameState) return;
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
