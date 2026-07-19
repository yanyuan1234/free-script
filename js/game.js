
// ========================================
// 世界观主题检测 + 动态术语系统
// ========================================

// 注：原 _extractLocations 转发包装已移除，调用方直接使用 EnhancedMemory._extractLocations

/**
 * 获取当前世界观的术语（缓存版，避免重复检测）
 * 根据 theme/genre/userPrompt/setupText 自动推断世界观并返回对应术语
 */
var _cachedWorldTheme = null;
var _cachedWorldTerms = null;

var _WORLD_TERM_TEMPLATES = {
    modern: { message: '消息', mail: '邮件', feed: '朋友圈', shop: '商店', forum: '论坛', currency: '元', bag: '背包', quest: '任务' },
    ancient: { message: '传话', mail: '飞鸽传书', feed: '江湖传闻', shop: '集市', forum: '茶馆', currency: '银两', bag: '行囊', quest: '差事' },
    xianxia: { message: '传音', mail: '传音符', feed: '修士手札', shop: '灵宝阁', forum: '论道台', currency: '灵石', bag: '储物袋', quest: '历练' },
    game: { message: '系统消息', mail: '系统邮件', feed: '玩家动态', shop: '兑换商城', forum: '玩家论坛', currency: '积分', bag: '空间仓库', quest: '副本任务' },
    cyberpunk: { message: '全息通讯', mail: '数据包', feed: '暗网动态', shop: '义体诊所', forum: '黑客频道', currency: '信用点', bag: '存储芯片', quest: '委托' },
    space: { message: '星际通讯', mail: '量子信标', feed: '星网动态', shop: '空间站市集', forum: '星际议会', currency: '星币', bag: '货舱', quest: '远征' }
};

function _detectWorldTheme() {
    var gs = gameState || {};
    var text = (gs.theme || '') + ' ' + (gs.genre || '') + ' ' + (gs.userPrompt || '') + ' ' + (gs.setupText || '');
    text = text.toLowerCase();
    if (/修仙|修真|灵石|宗门|筑基|金丹/.test(text)) return 'xianxia';
    if (/赛博|赛博朋克|义体|黑客|信用点|neon|cyber/.test(text)) return 'cyberpunk';
    if (/星际|太空|星舰|量子|星币|galaxy|space/.test(text)) return 'space';
    if (/无限流|系统|主神|积分|副本|玩家/.test(text)) return 'game';
    if (/古代|古风|江湖|武侠|飞鸽|银两|客栈/.test(text)) return 'ancient';
    if (/现代|都市|校园|公司|元|手机/.test(text)) return 'modern';
    return 'modern';
}

function getCurrentWorldTerms() {
    var theme = _detectWorldTheme();
    if (_cachedWorldTheme !== theme) {
        _cachedWorldTheme = theme;
        _cachedWorldTerms = _WORLD_TERM_TEMPLATES[theme] || _WORLD_TERM_TEMPLATES.modern;
    }
    return _cachedWorldTerms;
}

/**
 * 生成世界观术语提示词片段
 * 所有世界观统一：AI读取设定后自行决定术语，开局确定后全程固定
 */
function buildWorldTermsPrompt(_terms) {
    var t = _terms || getCurrentWorldTerms() || _WORLD_TERM_TEMPLATES.modern;
    var examples = [
        '现代都市：消息→消息、邮件→邮件、朋友圈→朋友圈、商店→商店、论坛→论坛、货币→元、背包→背包、任务→任务',
        '古代：消息→传话、邮件→飞鸽传书、朋友圈→江湖传闻、商店→集市、论坛→茶馆、货币→银两、背包→行囊、任务→差事',
        '修仙：消息→传音、邮件→传音符、朋友圈→修士手札、商店→灵宝阁、论坛→论道台、货币→灵石、背包→储物袋、任务→历练',
        '无限流/游戏系统：消息→系统消息、邮件→系统邮件、朋友圈→玩家动态、商店→兑换商城、论坛→玩家论坛、货币→积分、背包→空间仓库、任务→副本任务',
        '赛博朋克：消息→全息通讯、邮件→数据包、朋友圈→暗网动态、商店→义体诊所、论坛→黑客频道、货币→信用点、背包→存储芯片、任务→委托',
        '太空歌剧：消息→星际通讯、邮件→量子信标、朋友圈→星网动态、商店→空间站市集、论坛→星际议会、货币→星币、背包→货舱、任务→远征'
    ];
    return '【世界观术语】\n' +
        '你理解每个世界都有自己的语言体系——界面上的模块标题、货币名称、通讯方式等都应该融入世界观，而不是用通用词汇破坏沉浸感。例如：\n' +
        examples.map(function(ex) { return '- ' + ex; }).join('\n') + '\n' +
        '当前世界推荐术语：消息→' + t.message + '、邮件→' + t.mail + '、朋友圈→' + t.feed +
        '、商店→' + t.shop + '、论坛→' + t.forum + '、货币→' + t.currency +
        '、背包→' + t.bag + '、任务→' + t.quest + '\n' +
        '请在第一回合的world模块title中体现你选定的术语，之后全程保持一致。';
}

// 【按次计费优化】子功能（论坛/NPC私聊/结局）获取精简版设定
// 不注入4700字全文，而是用记忆摘要+核心规则代替，避免重复挤占context
function getCompactSetupForSubFunction() {
    var parts = [];

    // 优先使用记忆系统的结构化数据
    if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.permanentFacts) {
        var pf = EnhancedMemory.permanentFacts;

        // 主角身份
        if (pf.pcIdentity && pf.pcIdentity.length > 0) {
            parts.push('【主角身份】');
            pf.pcIdentity.forEach(function(a) { parts.push('• ' + a.content); });
        }

        // 世界规则
        if (pf.worldRules && pf.worldRules.length > 0) {
            parts.push('【世界规则】');
            pf.worldRules.forEach(function(a) { parts.push('• ' + a.content); });
        }

        // 关键角色（完整描述，不截断）
        if (pf.npcProfiles && pf.npcProfiles.length > 0) {
            parts.push('【关键角色】');
            pf.npcProfiles.forEach(function(a) { parts.push('• ' + a.content); });
        }

        // 玩家承诺
        if (pf.promises && pf.promises.length > 0) {
            parts.push('【玩家承诺】');
            pf.promises.forEach(function(a) { parts.push('• ' + a.content); });
        }

        // 世界设定
        if (pf.settings && pf.settings.length > 0) {
            parts.push('【世界设定】');
            pf.settings.forEach(function(a) { parts.push('• ' + a.content); });
        }
    }

    // 如果记忆系统有数据，用记忆摘要+核心规则；否则回退到原始设定（但截断到1500字）
    if (parts.length > 0) {
        return parts.join('\n');
    }

    // 兜底：没有记忆数据时，用 AI 提炼的精简设定（如果有），否则用原始设定

    if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory._setupLayers) {
        var layers = EnhancedMemory._setupLayers;
        if (layers.compressed && layers.compressedSetup) {
            return '【设定（精简版）】\n' + layers.compressedSetup;
        }
        if (layers.worldSummary) {
            return '【设定（AI摘要）】\n' + layers.worldSummary;
        }
    }
    var rawSetup = (gameState && gameState.userPrompt) || '';
    return rawSetup;
}

// 【一致性修复】子功能（论坛/结局）注入预设写作风格
// 与主剧情/NPC 私聊的 preset.style 保持一致——切风格后所有功能表现同步
// 返回形如 【写作风格】\n{style}\n 的纯文本，无风格时返回空字符串
function getPresetStyleBlock() {
    try {
        if (typeof PresetManager === 'undefined') return '';
        var p = PresetManager._currentPreset;
        if (!p || !p.style || !p.style.trim()) return '';
        return '【写作风格】\n' + p.style.trim() + '\n';
    } catch (e) {
        return '';
    }
}


// 专用 prompt（NPC 私聊/论坛/结局）原本硬编码 system，兼容不接 system 的中转站
function _applyUseSysprompt(messages) {
    if (!Array.isArray(messages)) return messages;
    if (gameState && gameState._useSysprompt === false) {
        var converted = [];
        for (let i = 0; i < messages.length; i++) {
            var m = messages[i];
            if (m && m.role === 'system' && m.content) {
                converted.push({ role: 'user', content: m.content });
            } else {
                converted.push(m);
            }
        }
        return converted;
    }
    return messages;
}


// 旧实现 line 1010-1014（isInit）和 line 1120-1125（主路径）各内联一遍
// if (_useSysprompt !== false) push system else push user，与 _applyUseSysprompt 三份并存。
// 现统一调 _pushSystemPrompt，语义一致：use_sysprompt=true→system role，false→user role（不丢弃内容）。
function _pushSystemPrompt(messages) {
    if (!messages || !gameState || !gameState.systemPrompt) return;
    if (gameState._useSysprompt !== false) {
        messages.push({ role: 'system', content: gameState.systemPrompt });
    } else if (gameState.systemPrompt.trim()) {
        messages.push({ role: 'user', content: gameState.systemPrompt });
    }
}


// NPC 私聊/论坛/结局/剧情主路径都通过此函数获取世界书注入，避免同一轮内重复扫描
// 缓存失效时机：跨轮（totalTurns 变化）
function getWorldInfoInjection() {
    if (typeof WorldInfo === 'undefined' || !WorldInfo.buildInjection) return null;
    var currentTurn = (gameState._stats && gameState._stats.totalTurns) || 0;
    var cache = gameState._wiCachedResult;
    var cacheTurn = gameState._wiCachedTurn;
    if (cache && cacheTurn === currentTurn) {
        return cache;
    }
    // 缓存失效或首次调用，重新扫描
    try {
        var fresh = WorldInfo.buildInjection(gameState.conversationHistory || []);
        gameState._wiCachedResult = fresh;
        gameState._wiCachedTurn = currentTurn;
        if (gameState._wiPositionTexts == null || cacheTurn !== currentTurn) {
            gameState._wiPositionTexts = (fresh && fresh.positionTexts) ? fresh.positionTexts : null;
        }
        return fresh;
    } catch (e) {
        console.warn('[getWorldInfoInjection] 扫描失败:', e);
        return null;
    }
}


function _sanitizePromptInput(str) {
    if (!str) return '';
    return String(str)
        .replace(/```json\s*/gi, '')      // 移除JSON代码块标记
        .replace(/```\s*/g, '')           // 移除代码块标记
        .replace(/【回复格式[\s\S]*?$/gi, '');  // 移除试图覆盖回复格式的注入
    // 注意：不再移除花括号内容，因为游戏设定中大量使用{}描述规则和属性
}

// === 酒馆预设融合层 ===
// 把酒馆大佬们沉淀的「优秀预设」融进 Free-Script，作为默认设置
// 核心原则：导入的酒馆预设优先级最高，本层仅在无预设/无覆盖时生效
function buildNarrativeEnhancement() {
    var gs = gameState;
    if (!gs) return '';
    var blocks = [];

    // 【关键】如果当前已加载酒馆预设且有 main/nsfw 等内容，跳过本层注入
    // 避免与酒馆预设冲突——酒馆预设自带高质量 prompt，本层退位
    if (typeof PresetManager !== 'undefined' && PresetManager.presets) {
        var idx = PresetManager.currentPresetIndex;
        if (idx >= 0 && PresetManager.presets[idx]) {
            var p = PresetManager.presets[idx];
            var hasMain = (p.prompts || []).some(function(x) {
                return x.identifier === 'main' && x.content && x.content.trim().length > 50;
            });
            // 内置预设不参与此判断（内置预设本身就需要本层增强）
            if (hasMain && !p._isBuiltin) {
                return '';  // 酒馆预设接管，本层静默
            }
        }
    }

    // === 1. 写作节奏（章节模式） ===


    if (gs.chapterMode && gs.chapterMode !== 'off') {
        if (gs.chapterMode === 'chapter') {
            blocks.push('【章节模式·开启】\n本回合 = 一个章节。\n- 引入 → 发展 → （高潮）→ 收尾\n- 章末留未竟：情绪/未竟动作/未答疑问\n- 一章聚焦一个场景/情况');
        } else if (gs.chapterMode === 'longform') {
            blocks.push('【长篇模式·开启】\n- 把对话、动作、环境、心理整合为高密度完整段，拒绝碎片化换行');
        }
    }

    // === 2. 叙事基调（来自数据字段的通俗名） ===
    if (gs.narrativeEyes) {
        var eyes = [];
        var eyeMap = {
            realistic:    '[现实感] 角色受身份、资源、关系与环境约束；冲突有代价，选择有回响，情节靠行动与后果推进',
            ideal:        '[温情] 聚焦人与人之间的温柔联结，以情感修复与双向靠近为主线；叙事偏明亮细腻',
            ensemble:     '[多角色] 多角色共驱世界，每名关键角色都有独立立场、诉求与底线',
            daily:        '[日常感] 重视停顿、闲谈、重复习惯与未说出口的话，通过日常摩擦建立真实羁绊',
            heartbeat:    '[情绪强] 情绪浓度强化，角色对用户的在意必须是可感知的、浓郁的',
            undercurrent: '[潜台词] 对话之外保留潜台词与利益博弈，信任可建立也可动摇',
            fate:         '[因果链] 强调"选择-后果-再选择"的循环结构；旧事件在后文持续回响',
            comedy:       '[轻松幽默] 轻荒诞世界观，夸张设定+反差角色，但情感动机必须真实',
            balanced:     '[戏剧平衡] 维持戏剧性与合理性的动态平衡，高张力桥段后必须补足逻辑落点',
            mystery:      '[超自然] 现实与超常边界长期模糊，线索常以象征、传闻与错觉出现'
        };
        for (let k in eyeMap) {
            if (gs.narrativeEyes[k]) eyes.push(eyeMap[k]);
        }
        if (eyes.length > 0) {
            blocks.push('【叙事基调·当前启用的 ' + eyes.length + ' 个】\n' + eyes.join('\n'));
        }
    }

    // === 3. NPC 好看原则 ===
    // 【动态化】移除硬编码的"NPC 必须好看/禁止丑形容"——这是 API 游戏，AI 能根据世界观自行判断 NPC 外貌
    // 旧代码强制"男帅女美，禁止邋遢脏乱"，禁用大量丑相关词汇，限制了 AI 创作真实多样的人物
    // 如果用户在自定义风格中写了外貌要求，AI 自然会遵循

    // === 4. 干练文风（生成前引导） ===
    // 【动态化】移除硬编码的 11 条"禁止X"规则——这是 API 游戏，AI 能理解文风指导
    // 旧代码强制注入"禁止嘴角勾起弧度/禁止极其/禁止老套比喻"等负面约束，限制了 AI 的表达自由
    // 文风指导应通过正面引导（如自定义风格字段）而非负面禁止


    if (blocks.length === 0) return '';
    return '\n\n【写作指导·让故事更耐读】\n' + blocks.join('\n\n') + '\n';
}

// 【Token优化】瘦身AI回复：旧轮次只保留story字段，删除结构化数据
// AI回复JSON约2000字，story约500字，瘦身后节省约60% token
// 不修改原始conversationHistory，只在发送给API时瘦身
// 【方案C】纯文本模式下，根据story末段自动生成3个默认选项
function _generateAutoChoices(storyText, lastChoices) {
    if (!storyText || storyText.trim().length === 0) return null;
    // 提取story末段（最后200字）
    var lastSegment = storyText.slice(-300);
    // 【ISSUE-005 修复】NPC 名提取改进：
    // 原正则 向([\u4e00-\u9fa5]{2,4}) 会把"走向灰石测试"里的"灰石测试"当人名。
    // 改为：优先用「人名」引号包裹；其次 人名+道/说/问+冒号；最后"向XX+对话/动作动词"。
    // 并排除明显是事件/地点/事物的词（测试/考试/学院/殿堂等）。
    var _NON_PERSON_WORDS = /测试|考试|学院|宗门|门派|殿堂|阁楼|任务|剧情|事件|战斗|修炼|境界|灵力|法力|修为|功法|秘境/;
    var npcNameMatch = lastSegment.match(/「([\u4e00-\u9fa5]{2,4})」/) ||
                       lastSegment.match(/([\u4e00-\u9fa5]{2,4})[道说问][：:]/);
    var npcName = npcNameMatch ? npcNameMatch[1] : null;
    // 兜底：向XX+询问/说话/坦白 等动词，且 XX 不在非人物词表里
    if (!npcName) {
        var _dirMatch = lastSegment.match(/向([\u4e00-\u9fa5]{2,4})(?:询问|说话|坦白|道别|打招呼|点头|微笑|解释|请教)/);
        if (_dirMatch && _dirMatch[1] && !_NON_PERSON_WORDS.test(_dirMatch[1])) {
            npcName = _dirMatch[1];
        }
    }
    // 提取地点关键词
    // 【P2-5 修复】原正则排除集 [^，。\s] 不排除引号和对话标签字，
    // 导致「前往」清洁工说道 中的 」清洁工说道 被匹配为地点（"道"作后缀）。
    // 修复：排除集加入引号字符 「」""''，并后置过滤对话标记型误匹配。
    var locationMatch = lastSegment.match(/([^，。\s「」""'']{2,8}(?:殿|阁|场|院|山|宫|楼|台|谷|门|府|城|林|堂|室|道|路))/);
    var location = locationMatch ? locationMatch[1] : null;
    // 后置过滤：匹配到含对话动词（说/问/答/喊/笑/叫/哭/怒+道）的文本时丢弃，
    // 避免"清洁工说道"这类对话标签被当作地点。
    if (location && /(?:说道|问道|答道|喊道|笑道|叫道|哭道|怒道|冷道|叹道|低声道|轻声道|大声道)/.test(location)) {
        location = null;
    }
    // 【ISSUE-005 修复】战斗场景判定收窄：
    // 原正则 /(攻击|战斗|剑|刀|雷|火|法术|灵力)/ 中"灵力"在魔法学院日常文本
    // （如"灵力测试""灵力运转"）误命中，把社交场景判成战斗。
    // 改为：必须出现战斗动作动词（挥剑/刺来/劈/砍/射击/施法攻击等），
    // 单纯出现"灵力/法术/剑"等名词不算战斗。
    var isBattle = /(挥(剑|刀|棒|拳)|刺(来|向|去)|劈(向|下|来)|砍(向|来)|射击|施法攻击|闪避|格挡|招架|猛击|冲杀|厮杀|交手|对峙|暴起|偷袭)/.test(lastSegment);
    var isDialogue = /「[^」]+」/.test(lastSegment) && npcName;
    var isInvestigation = /(秘密|线索|真相|发现|研究|探索)/.test(lastSegment);

    var choices = [];
    if (isDialogue && npcName) {
        // 对话场景：直接回应/询问/离开
        choices.push({ id: 'A', text: '向' + npcName + '继续询问' });
        choices.push({ id: 'B', text: '向' + npcName + '坦诚相告' });
        choices.push({ id: 'C', text: '沉默片刻，观察' + npcName + '的反应' });
    } else if (isBattle) {
        // 战斗场景：进攻/防御/撤退
        choices.push({ id: 'A', text: '运转灵力，全力进攻' });
        choices.push({ id: 'B', text: '凝神防御，寻找破绽' });
        choices.push({ id: 'C', text: '拉开距离，重新评估' });
    } else if (isInvestigation) {
        // 探索场景：深入/回查/离开
        choices.push({ id: 'A', text: '深入调查，追根究底' });
        choices.push({ id: 'B', text: '回到宗门，请教师门长辈' });
        choices.push({ id: 'C', text: '暂时搁置，先巩固修为' });
    } else {
        // 通用兜底
        choices.push({ id: 'A', text: location ? ('前往' + location) : '继续前进' });
        choices.push({ id: 'B', text: npcName ? ('寻找' + npcName) : '探索周围' });
        choices.push({ id: 'C', text: '原地休整，整理思路' });
    }

    // 避免连续多轮出现"和XX一起"型套路选项
    if (lastChoices && Array.isArray(lastChoices) && lastChoices.length > 0) {
        var _normalizedLast = lastChoices.map(function(c) {
            return (typeof c === 'string' ? c : (c && c.text) || '').replace(/\s+/g, '');
        }).filter(function(s) { return s.length > 0; });
        choices.forEach(function(ch) {
            var _cur = (ch.text || '').replace(/\s+/g, '');
            var _isDup = _normalizedLast.some(function(prev) {
                if (prev === _cur) return true;
                // 简单相似度：检查是否有>=60%的字符重叠
                var minLen = Math.min(prev.length, _cur.length);
                var overlap = 0;
                for (let i = 0; i < minLen; i++) {
                    if (prev.indexOf(_cur[i]) !== -1) overlap++;
                }
                return minLen > 4 && (overlap / minLen) >= 0.6;
            });
            ch.isDuplicate = _isDup;
        });
        // 如果3个选项都被标记为重复，则追加一个"自由行动"选项保底
        if (choices.every(function(c) { return c.isDuplicate; })) {
            choices = [];
            choices.push({ id: 'A', text: '换个思路，另寻他法' });
            choices.push({ id: 'B', text: '深入思考当前局势' });
            choices.push({ id: 'C', text: '回顾之前的线索' });
        } else {
            // 过滤掉重复的，保留非重复的
            choices = choices.filter(function(c) { return !c.isDuplicate; });
            // 如果过滤后不足2个，补一个通用项
            while (choices.length < 2) {
                choices.push({ id: 'X' + choices.length, text: '自由行动：' + (npcName ? ('与' + npcName + '交谈') : '观察周围') });
            }
        }
    }
    return choices;
}


// 触发条件：命中 2 个以上推理特征词，判定为思考泄漏
// 用于拒绝把思考内容写入 conversationHistory，避免污染后续 prompt
function _isThinkingContent(text) {
    if (!text || typeof text !== 'string' || text.length < 10) return false;
    var patterns = [
        /我需要根据[^。]*推进/,
        /我需要[^。]*分析/,
        /我应该[^。]*描述/,
        /让我[^。]*开始/,
        /选择[A-Z]的后果分析/,
        /当前状态[：:]/,
        /- 时间[：:]/,
        /- 主角[：:]/,
        /- 已知NPC[：:]/,
        /- 任务[：:]/,
        /我需要[：:]/,
        /分析[：:]/,
        // 【NEW-BUG-5】扩展：覆盖实际泄漏文本特征
        /用户.{0,5}选择了/,       // "用户现在选择了和莉瑞亚..."
        /玩家.{0,5}选择了/,
        /首先得/,                 // "首先得符合世界观"
        /然后我得/,
        /我来[^。]{0,10}推进/,
        /接下来[^。]{0,10}描述/,
        /根据.{0,10}设定/,
        /根据.{0,10}世界观/,
        /这回合/,
        /本回合.{0,5}应该/,
        // BUG-A2 扩展：模型把设计思路写入 story 字段
        /^用户现在需要/, /^玩家现在需要/,
        /^首先[^。]*(?:设定|设计|安排|规划)/,
        /^然后[^。]*的话/,
        /^然后(?:NPC|开局|choices|world|keyEvents|player|bag|quests|gameTime|心声|系统|剧情|场景)/,
        /^比如叫/,
        /^对，/
    ];
    var strongPatterns = [
        /^用户现在需要/, /^玩家现在需要/,
        /^首先得/, /^首先[^。]*(?:设定|设计|安排|规划)/,
        /^然后[^。]*的话/,
        /^然后(?:NPC|开局|choices|world|keyEvents|player|bag|quests|gameTime|心声|系统|剧情|场景)/
    ];
    var hits = 0;
    var hasStrong = false;
    for (var i = 0; i < patterns.length; i++) {
        if (patterns[i].test(text)) hits++;
    }
    for (var j = 0; j < strongPatterns.length; j++) {
        if (strongPatterns[j].test(text)) { hasStrong = true; break; }
    }
    // 强信号命中 1 次即拦截；普通模式仍需 2 次避免误杀
    return hasStrong ? hits >= 1 : hits >= 2;
}

function _slimAssistantMessage(content) {

    // 旧代码 !content 能挡住 undefined/null/''，但挡不住数组（truthy），数组.length 返回 undefined
    // undefined < 200 是 false，会走到 content.trim() 抛 TypeError

    // 不被瘦身，原样写入历史导致回顾页显示 JSON 字符串。30 字足以覆盖最小 JSON 结构
    if (!content || typeof content !== 'string' || content.length < 30) return content;
    // 尝试提取JSON中的story字段
    try {
        // 快速检测：不是JSON格式就直接返回
        var trimmed = content.trim();
        if (trimmed.charAt(0) !== '{') return content;
        var data = JSON.parse(trimmed);
        if (data && data.story) {
            // 【ISSUE-A1 修复】保留所有18字段名（骨架），但精简值
            // 原问题：只保留{title,story,choices}3字段，AI通过in-context learning
            // 模仿历史格式只输出3字段，导致player/characters/bag等15字段不更新
            // 修复：保留完整字段结构让AI模仿输出18字段，但精简值减少token占用
            var slim = {};
            // 完整保留的字段（核心叙事内容）
            if (data.title) slim.title = data.title;
            slim.story = data.story;
            if (data.choices && data.choices.length > 0) slim.choices = data.choices;
            // 精简保留的字段（保留结构但减少细节）
            if (data.player) {
                slim.player = { name: data.player.name || '', identity: data.player.identity || '' };
            } else { slim.player = { name: '', identity: '' }; }
            // 数组类字段：保留name等关键字段，丢弃desc等长文本
            slim.characters = (Array.isArray(data.characters) ? data.characters : []).slice(0, 5).map(function(c) {
                return { name: c.name || '', relation: c.relation || '' };
            });
            slim.bag = (Array.isArray(data.bag) ? data.bag : []).slice(0, 8).map(function(b) {
                return { name: b.name || '', count: b.count || 1 };
            });
            slim.quests = (Array.isArray(data.quests) ? data.quests : []).slice(0, 5).map(function(q) {
                return { title: q.title || '', status: q.status || '' };
            });
            // 轻量字段：保留值或空占位
            slim.relationships = [];
            slim.locations = (Array.isArray(data.locations) ? data.locations : []).slice(0, 3).map(function(l) {
                return { name: l.name || '' };
            });
            slim.world = [];
            slim.npcMessages = [];
            slim.memoryUpdates = [];
            slim.currency = (typeof data.currency === 'number') ? data.currency : 0;
            slim.currencyName = data.currencyName || '金币';
            slim.contextSummary = data.contextSummary || '';
            slim.gameTime = data.gameTime || {};
            slim.keyEvents = (Array.isArray(data.keyEvents) ? data.keyEvents : []).slice(0, 2);
            slim.hud = data.hud || {};
            var result = JSON.stringify(slim);
            // 【ISSUE-A2 修复】阈值从0.7放宽到0.9，更积极地瘦身
            // 18字段骨架比3字段稍大，但仍远小于完整JSON（省略desc/outfit等长文本）
            if (result.length < content.length * 0.9) {
                return result;
            }
        }
    } catch(e) {
        // JSON解析失败，可能是纯文本回复，直接返回
    }
    return content;
}

// 【ISSUE-001 修复】获取实际生效的输出 token 空间
// 根因：提示词里的"输出空间"用 gameState.maxTokens（默认 8192），
// 但 API 实际下发的 max_tokens 来自预设 presetParams.max_tokens（内置预设 4096）。
// AI 按提示词写 8192 token 长文本，到 4096 被 API 截断 → JSON 不完整。
// 修复：提示词告知 AI 的空间必须取"实际能下发的值"，即两者较小值，避免 AI 写超预算。
function getEffectiveMaxTokens() {
    var gsMax = (gameState && gameState.maxTokens) || DEFAULT_MAX_TOKENS;
    var presetMax = 0;
    if (typeof PresetManager !== 'undefined' && PresetManager.getParams) {
        var pp = PresetManager.getParams();
        presetMax = (pp && pp.max_tokens) || 0;
    }
    // 预设值有效时取较小值；预设值无效（0/缺失）时用 gameState 值
    var effective = (presetMax > 0) ? Math.min(gsMax, presetMax) : gsMax;
    // 下限保护：JSON 模式至少需要 2048 才能容纳 story+choices+player 等结构
    return Math.max(effective, 2048);
}

// [日志功能开关] 全局读取玩家在剧情页设置的日志功能启停状态
var LOG_FEATURE_LABELS = { chat: '聊天', forum: '论坛', rank: '排行榜', items: '物品/背包', quests: '任务', shop: '商店', moments: '朋友圈', achieve: '成就', diary: '日记', world: '世界信息', calendar: '日程表', author_note: '作者的话', memory: '记忆' };
var LOG_FEATURE_DEFAULTS = { chat: true, forum: true, rank: true, items: true, quests: true, shop: true, moments: true, achieve: true, diary: true, world: true, calendar: true, author_note: true, memory: true };
function getLogFeatureFlag(key) {
    var stored = (typeof StateManager !== 'undefined' && StateManager.get) ? StateManager.get('settings.logFeatures') : null;
    if (!stored || typeof stored !== 'object') stored = {};
    return stored[key] !== undefined ? !!stored[key] : !!LOG_FEATURE_DEFAULTS[key];
}
function buildLogFeatureSettingsPrompt() {
    var disabled = [];
    for (var k in LOG_FEATURE_LABELS) {
        if (!getLogFeatureFlag(k)) disabled.push(LOG_FEATURE_LABELS[k]);
    }
    if (disabled.length === 0) return '';
    return '\n【玩家已关闭的功能】以下内容已被玩家关闭，禁止生成相关模块或在剧情中引入：' + disabled.join('、') + '。\n';
}

function buildSystemPrompt(includeFormatRules) {
    if (includeFormatRules === undefined) includeFormatRules = true;

    var _wiResult = getWorldInfoInjection();


    // 存储世界书分组数据供 sendAIRequest 使用（不再拼入system prompt）
    gameState._wiPositionTexts = (isObject(_wiResult) && _wiResult.positionTexts) ? _wiResult.positionTexts : null;

    // 注入增强记忆
    var _memoryText = '';
    if (typeof EnhancedMemory !== 'undefined') {
        _memoryText = EnhancedMemory.buildSmartInjection();
        if (_memoryText) {
            console.log('[buildSystemPrompt] 已注入增强记忆');
        }
    }


    var _safeUserPrompt = _sanitizePromptInput(gameState && gameState.userPrompt);

    // 设定分层注入（Lorebook风格：核心常驻+按需加载）
    var _setupText = _safeUserPrompt;
    if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.getSetupInjection) {
        var _layeredSetup = EnhancedMemory.getSetupInjection();
        if (_layeredSetup !== null) _setupText = _layeredSetup;
    }

    // 收集玩家最近与NPC的私聊记录
    var _chatContextText = buildRecentChatContext();

    // 酒馆预设融合层
    var _narrativeEnhancement = buildNarrativeEnhancement();

    // 检测当前是否有内置预设
    var _hasNativePreset = false;
    if (typeof PresetManager !== 'undefined' && PresetManager.presets && PresetManager.currentPresetIndex >= 0) {
        var _curP = PresetManager.presets[PresetManager.currentPresetIndex];
        if (_curP && _curP._isBuiltin) _hasNativePreset = true;
    }

    // 术语与世界规则
    var _terms = getCurrentWorldTerms();
    var _termsPrompt = buildWorldTermsPrompt(_terms);
    var _t = function(key, fallback) { return (_terms && _terms[key]) ? _terms[key] : fallback; };
    var turn = (gameState._stats && gameState._stats.totalTurns) || 0;

    // 格式规则（内置预设已有格式说明时跳过重复锚点）
    var _formatAnchor = '';
    if (!_hasNativePreset) {
        _formatAnchor = _buildFormatAnchor();
    }
    var _formatRules = includeFormatRules ? _buildFormatRules(gameState, _t, turn) : '';

    // 使用 AI 契约层 PromptBuilder 组装最终 system prompt
    if (typeof PromptBuilder !== 'undefined' && PromptBuilder.buildSystemPrompt) {
        PromptBuilder.setMode((gameState && gameState.pureTextMode) ? 'pureText' : 'json');
        var _macroVars = {};
        if (typeof MacroEngine !== 'undefined' && MacroEngine.getGlobalVar) {
            var _PREF_KEYS = ['字数总要求','单段落字数','叙述视角','char代词','user代词','演绎授权','转述授权','推进节奏','文风指导','起始标签'];
            for (var _pki = 0; _pki < _PREF_KEYS.length; _pki++) {
                _macroVars[_PREF_KEYS[_pki]] = MacroEngine.getGlobalVar(_PREF_KEYS[_pki]);
            }
        }
        var _pcIdentity = '';
        if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.permanentFacts) {
            _pcIdentity = EnhancedMemory.permanentFacts.pcIdentity || '';
        }

        // ctx.skipDefaultFormat 让 format section 返回空字符串，不再手工拼装。
        // 原手工路径丢失 identity/world/terms/protagonist/preference/state/workflow/gametime
        // 等关键上下文，导致预设场景下 AI 缺失游戏状态信息。
        var ctx = {
            setupText: _setupText,
            userPrompt: _safeUserPrompt,
            player: (gameState && gameState.playerData) || {},
            playerName: (gameState && gameState.playerName) || '',
            playerIdentity: (gameState && gameState.playerIdentity) || '',
            protagonistSetup: (gameState && gameState.protagonistSetup) || null,
            pcIdentity: _pcIdentity,
            macroVars: _macroVars,
            memoryText: _memoryText,
            chatContextText: _chatContextText,
            narrativeEnhancement: _narrativeEnhancement,
            termsPrompt: _termsPrompt,
            formatAnchor: _formatAnchor,
            formatRules: _formatRules,
            skipDefaultFormat: !includeFormatRules,
            gameTime: (gameState && gameState.gameTime) || {},
            pureTextMode: !!(gameState && gameState.pureTextMode),
            generateChoices: !(gameState && gameState.generateChoices === false),
            maxTokens: getEffectiveMaxTokens(),
            worldTerms: _terms,
            turn: turn
        };
        return PromptBuilder.buildSystemPrompt(ctx);
    }


    // （index.html:2806 通过 defer 加载，DOMContentLoaded 后保证可用；sendAIRequest
    // 仅在初始化完成后被调用）。此处仅保留极简兜底：万一 PromptBuilder 缺失，
    // 直接抛错而非用另一套拼装逻辑污染双路径（旧兜底使用 _legacyParts 9 段拼装，
    // 与 PromptBuilder 的 section 注册机制并行，难以维护且会产出不同 prompt 形态）。
    throw new Error('[buildSystemPrompt] PromptBuilder 未加载，请检查 js/ai-contract/prompt-builder.js');
}

// 格式锚点（硬性要求，始终存在）
function _buildFormatAnchor() {
    var _maxTokensForAnchor = getEffectiveMaxTokens();
    var _hasChoicesForAnchor = gameState && gameState.generateChoices;
    var _pureTextMode = gameState && gameState.pureTextMode;
    if (_pureTextMode) {
        return '【输出要求·纯文本模式】\n' +
            '**直接输出纯文本剧情**，不要任何JSON包裹，不要```json```代码块，不要"{"或"}"符号。\n' +
            '格式：纯叙事文本，对话用「」包裹，换行用\\n。\n' +
            '当状态变化时，在剧情中穿插<mem>标签：\n' +
            '- 事件：<mem type="event" action="add">陈墨获得雷引玉简</mem>\n' +
            '- 物品：<mem type="item" name="雷令" qty="1" action="add"/>\n' +
            '- 角色：<mem type="character" name="林婉" field="favorability" value="70"/>\n' +
            '- 任务：<mem type="quest" action="add">明日卯时去后山找清虚</mem>\n' +
            '- 时间：<mem type="time" day="3" period="afternoon"/>\n' +
            '心声穿插：<giggle>角色名：心声内容</giggle>（每回合2-5个）\n' +
            '你有充足空间写完剧情（约' + _maxTokensForAnchor + ' tokens），把字数用在story上。';
    }
    return '【输出要求·JSON模式】直接输出JSON（以 { 开头），**不要任何前缀说明**。\n' +
        'gameTime 为必填字段，每回合必须给出具体时间。\n' +
        'quests 若任务已完成，status 填"已完成"、progress 填"1/1"。\n' +
        'currency 必须准确反映剧情中的金钱变化。\n' +
        'hud, relationships, keyEvents, npcMessages, contextSummary 为常用字段，有内容时必须返回；无内容时返回空数组或省略（但 npcMessages 必须保留字段）。\n' +
        '心声系统：用 <giggle>角色名：心声内容</giggle> 格式穿插（每回合2-5个）。\n' +
        '**禁止写主角角度的心声**，只能写NPC的心声。\n' +
        'gameTime 推进规则：根据剧情中发生的事件合理推进时间。现代世界按小时推进，古代世界按时辰推进，修仙世界可按修炼周期推进。\n' +
        'world 模块必须与本回合剧情紧密联动，禁止无关填充；每回合至少呈现 4 个不同模块。\n' +
        '约' + _maxTokensForAnchor + 'tokens输出空间';
}

// 渐进式格式规则（原 _buildFormatRules 改名为公共函数，避免与旧引用冲突）
function _buildFormatRules(gs, _t, turn) {
    var hasChoices = gs.generateChoices;
    // 第4轮优化：从原版 backup/index.html 回填字段级规则，避免 AI 输出字段缺失或语义冲突
    // 关键修正：keyEvents 从"至少1条"改为"0-3条可空"（原版语义，避免强迫AI编造事件污染记忆）
    var _maxTokens = getEffectiveMaxTokens();
    // [优化#10] 基于原版单 HTML 测试反馈，把原本"建议性"字段提升为必填/最低要求，
    // 解决新版输出 world 模块过少、story 过短、npcMessages/relationships 缺失的问题。
    var _storyTarget = Math.min(1800, Math.max(800, Math.floor(_maxTokens * 0.35)));

    // [日志功能开关] 根据玩家在设置里启用的功能动态调整格式要求
    var _logFeatureLabels = { chat: '聊天', forum: '论坛', rank: '排行榜', items: '物品/背包', quests: '任务', shop: '商店', moments: '朋友圈', achieve: '成就', diary: '日记', world: '世界信息', calendar: '日程表', author_note: '作者的话', memory: '记忆' };
    var _logFeatureDefaults = { chat: true, forum: true, rank: true, items: true, quests: true, shop: true, moments: true, achieve: true, diary: true, world: true, calendar: true, author_note: true, memory: true };
    function _getLogFeatureFlag(key) {
        var stored = (typeof StateManager !== 'undefined' && StateManager.get) ? StateManager.get('settings.logFeatures') : null;
        if (!stored || typeof stored !== 'object') stored = {};
        return stored[key] !== undefined ? !!stored[key] : !!_logFeatureDefaults[key];
    }
    var _enabledWorldTypes = ['text', 'list', 'ranking', 'key_value', 'cards'];
    if (_getLogFeatureFlag('forum') || _getLogFeatureFlag('comments')) _enabledWorldTypes.push('comments');
    if (_getLogFeatureFlag('chat')) _enabledWorldTypes.push('chat');
    if (_getLogFeatureFlag('moments')) _enabledWorldTypes.push('moments');
    if (_getLogFeatureFlag('mail')) _enabledWorldTypes.push('mail');
    if (_getLogFeatureFlag('shop')) _enabledWorldTypes.push('shop');
    if (_getLogFeatureFlag('diary')) _enabledWorldTypes.push('diary');
    var _disabledFeatures = [];
    for (var _lfKey in _logFeatureLabels) {
        if (!_getLogFeatureFlag(_lfKey)) _disabledFeatures.push(_logFeatureLabels[_lfKey]);
    }
    var _disabledFeaturesHint = _disabledFeatures.length
        ? '\n【玩家已关闭的功能】以下内容已被玩家关闭，本回合禁止生成相关模块或在剧情中引入：' + _disabledFeatures.join('、') + '。\n'
        : '';

    return '【输出格式】**直接输出JSON**（以 { 开头），**不要任何前缀**（不要"让我开始"、不要"title:"、不要"story:"），空字段省略。\n'
        + '{ "title": "4-8字章节标题", "story": "本回合剧情正文（必须是JSON第一个字段）", '
        + (hasChoices ? '"choices": [{"id":"A","text":"选项文本"}],' : '')
        + '\n**story 字段绝对规则：只能包含纯叙事正文，严禁包含你的思考过程、设计思路、规划步骤、"首先...然后..."、"比如..."、"对，..."、"用户现在需要..."等元话语。你的设计/思考请留在 reasoning_content（如果 API 支持），不要写入 story。**\n'
        + '\n**story 长度强制要求：每回合剧情正文至少 800 中文字符，推荐 1000-1500 中文字符。场景铺垫、NPC反应、环境细节、心理描写都要充分展开，避免几句话草草带过。优先保证 story 完整饱满，再填充其他数据字段；禁止为了塞数据而压缩剧情长度。**\n'
        + ' "player": {"name":"主角名","age":0,"identity":"身份","personality":"性格","title":"称号","stats":[{"label":"属性名","value":0}]}, '
        + (hasChoices ? '\n**choices 必填规则：必须返回恰好3个选项，每个选项 id 为 A/B/C，text 为10-25字的完整行动描述（不要截断、不要对话台词、不要引号包裹）。即使 token 紧张也优先保证 choices 完整，缺 choices 会被系统自动生成低质量选项。**\n' : '')
        + '"characters": [{"name":"NPC名","title":"头衔","relation":"关系","favorability":0,"desc":"简述","details":[{"key":"","value":""}]}], '
        + '"world": [{"type":"' + _enabledWorldTypes.join('/') + '","title":"标题","content":"内容","items":[]}], '
        + '"bag": [{"name":"物品名","count":1,"desc":"描述","rarity":"普通/精良/珍稀/传说","usable":false,"effect":"","equippable":false,"equipped":false,"slot":"weapon/armor/accessory/head"}], '
        + '"currency": 0, "currencyName": "按世界观设定（修仙用灵石，现代用元，古代用银两等）", '
        + '"quests": [{"title":"任务名","type":"主线/支线/隐藏","status":"进行中/已完成/失败","progress":"当前/总数","hint":"下一步提示"}], '
        + '"keyEvents": ["本回合重要事件，每条简短一句含人物名"], '
        + '"gameTime": {"date":"日期","time":"时间","period":"时段","weather":"晴/阴/雨/雪","era":"时代/年号"} }\n'
        + '必填/常用字段: hud(最多4个[{label,value,icon}],icon用单字如"生""力"不用emoji), relationships, npcMessages([{from,text}],即时闲聊), contextSummary(每次必须包含,100-200字,融合本回合新剧情)\n'
        + '**player=主角（玩家唯一操控角色），characters=NPC列表。绝对禁止把主角放进 characters！剧情提到任何角色名都必须放入 characters；已知角色即使本回合未出场也要保留；每回合检查不遗漏；同一角色只用一个固定名字不加括号备注。**\n'
        + '**player.name 必须严格等于主角姓名，违反会导致游戏崩溃。原始JSON不用```json包裹。**\n'
        + '**player.stats 更新规则：每回合根据剧情事件更新属性值。修炼/锻炼/学习提升属性、购买/消耗降低金币、受伤降低体质等变化必须反映在 stats 中。禁止每回合返回相同的 stats 值（除非本回合确实无属性变化）。**\n'
        + 'bag 装备/消耗品规则：usable=true为消耗品,effect描述效果;equippable=true可装备,slot为装备位(weapon/armor/accessory/head);同slot装备新的替换旧的;消耗品使用count减1为0移除;玩家说"使用/装备"时下回合更新。\n'
        + 'quests 任务规则：type三类(主线/支线/隐藏),status三类(进行中/已完成/失败),progress用"当前/总数";同时存在不超过5个;**每回合至少返回1个进行中任务**;第一回合至少1个主线;完成/失败保留1-2回合后移除。**若任务已完成,status填"已完成"、progress填"1/1";若仍在进行,progress必须推进,禁止始终为0/1。**\n'
        + 'relationships 关系网：type必须是 暧昧/恋人/敌对/仇恨/友好/盟友/师徒/上下级/亲人/家族/对手/中立 之一;上限10条;包括NPC之间的关系;主角用"主角"二字。**有NPC互动时每回合必须返回 relationships，空数组仅用于无NPC出场的纯过场。**\n'
        + 'npcMessages NPC主动消息：用 [{"from":"NPC名字","text":"消息内容"}] 格式。粘人/关心型NPC每回合可能发1-2条，冷漠型可0条；消息内容必须与本回合剧情相关，from须是已出场角色。**无消息时返回空数组 []，禁止省略该字段。**\n'
        + 'keyEvents 规则：**有重要事件发生时必须返回 1-3 条，仅无任何重要事件的纯过场回合才输出空数组 []。**重要事件指：关键约定、重大发现、关系转折、获得/失去重要物品、阵营变化、立下誓言、角色死亡、秘密揭露。每条简短一句含人物名。日常对话/普通移动不写入。\n'
        + 'favorability 分级（整数）：80-100极度亲密,60-79非常亲近,40-59有好感,15-39关系融洽,-14~14中立(0=中立非敌意),-39~-15略有隔阂,-100~-40负面。范围 -100 到 100。relation用符合世界观的词,不要套固定模板,不要省略数值。\n'
        + 'currency 必须准确反映剧情中的金钱变化，禁止与剧情矛盾。\n'
        + '世界模块(world)必须和剧情紧密联动，不要生成与剧情无关的静态内容。\n'
        + '【world 模块强制要求】world 数组每回合至少包含 4-6 个模块，必须覆盖以下类型中的至少 4 种（按剧情需要选择）：comments（论坛热帖）、moments（朋友圈动态）、mail（邮件/飞剑传书）、shop（商店商品）、ranking（排行榜）、cards（信息卡片）、key_value（关键数据）、list（列表）。每种模块的 items 内容必须引用本回合剧情中的角色、地点、事件或物品，禁止生成与当前剧情无关的通用填充内容。\n'
        + '【world 模块扩展】各 type 的 items 结构（content 字段为简述，items 数组为详情，按需生成）：\n'
        + '  - chat: items[{npc:"角色名",content:"消息内容",time:"08:30"}] - NPC主动发来消息,每回合0-2条,npc须已出场\n'
        + '  - forum: items[{author:"角色名",content:"帖子内容",replies:[{author,content}]}] - 论坛帖子\n'
        + '  - mail: items[{from:"发件人",subject:"主题",body:"正文",preview:"预览",date:"日期",read:false}] - 邮件,每回合0-1封,from须已出场\n'
        + '  - shop: items[{name:"商品名",price:10,desc:"说明",count:1}] - 商店商品\n'
        + '  - diary: items[{npc:"角色名",date:"日期",content:"正文",mood:"心情",memos:["备忘"]}] - 角色日记\n'
        + '  - moments: items[{author:"角色名",content:"动态内容",time:"08:30",likes:5,comments:[{author,content}]}] - 朋友圈,每回合0-2条,author须已出场\n'
        + '  - ranking: items[{rank:1,name:"角色名",score:100,desc:"说明"}] - 排行榜\n'
        + '  - cards: items[{icon:"单字图标",title:"标题",content:"内容"}] - 卡片\n'
        + '  - comments: {main:"主帖",comments:[{name:"评论者",text:"评论"}]} - 评论模块(无items数组,直接main+comments)\n'
        + '【memoryUpdates 三层记忆规则】memoryUpdates 为必填数组，每回合必须根据剧情变化输出记忆更新，每项 {op, category, layer, importance, content, keywords, reason}。\n'
        + '  - layer 仅允许：shortTerm（短期记忆，每轮一条 20 字以内核心事实）/ longTerm（长期归档，写入永久事实区）/ milestone（关键里程碑，importance≥7 的重大事件）。\n'
        + '  - op 仅允许 add/replace/delete；category 仅允许 pcIdentity/settings/worldRules/npcProfiles/promises/worldPlaces。\n'
        + '  - 示例：{"op":"add","category":"settings","layer":"shortTerm","importance":5,"content":"主角答应帮林晚寻找失踪的妹妹"}；{"op":"add","category":"promises","layer":"milestone","importance":8,"content":"林晚与主角正式确立合作关系"}。\n'
        + '  - 即使剧情没有重大变化，也必须输出至少 1 条 shortTerm 记忆；无长期/里程碑变更则对应层返回空数组或省略。\n'
        + 'gameTime 推进规则：每段剧情必须推进时间。现代世界按小时推进，古代世界按时辰推进，修仙世界可按修炼周期推进。\n'
        + '约' + _maxTokens + 'tokens输出空间'
        + _disabledFeaturesHint;
}

/**
 * 【聊天->剧情 实时互通】收集玩家最近与各 NPC 的私聊消息，
 * 格式化为「最近私聊」文本块，注入到 buildSystemPrompt 中。
 * 这样 AI 在生成下一段剧情时能感知玩家在私聊中做出的约定/承诺/情绪，
 * 让私聊真正影响剧情走向，而不是独立的孤岛。
 */
function buildRecentChatContext() {
    try {
        if (!gameState._chatLogs) return '';
        var logs = gameState._chatLogs;
        var names = Object.keys(logs);
        if (names.length === 0) return '';

        // 限制每个 NPC 最多取最近 4 条消息，避免 prompt 过长
        var MAX_PER_NPC = 4;
        // 限制总 NPC 数量，避免 prompt 爆炸
        var MAX_NPCS = 4;
        var blocks = [];
        var n = 0;
        for (let i = 0; i < names.length && n < MAX_NPCS; i++) {
            var npcName = names[i];
            var msgs = logs[npcName] || [];
            if (msgs.length === 0) continue;
            // 只取最近 MAX_PER_NPC 条
            var tail = msgs.slice(-MAX_PER_NPC);
            // 跳过全是玩家独自自言自语的情况
            var hasContent = tail.some(function(m) { return m && m.text && m.text.trim(); });
            if (!hasContent) continue;
            var lines = tail.map(function(m) {
                var who = (m.from === 'player' || m.from === 'me' || m.from === 'playerName') ? '主角' : npcName;
                return '  ' + who + '：' + (m.text || '');
            });
            blocks.push('【与 ' + npcName + ' 的最近私聊】\n' + lines.join('\n'));
            n++;
        }
        if (blocks.length === 0) return '';
        return '\n【玩家最近私聊记录】\n' +
            '玩家在剧情之外与部分 NPC 通过手机私聊过，以下是最近对话：\n' +
            blocks.join('\n\n') + '\n' +
            '私聊中的约定、情绪和情报会自然影响剧情走向和NPC态度——让这些后果在剧情中自然体现。\n';
    } catch (e) {
        console.warn('[buildRecentChatContext] 失败：', e);
        return '';
    }
}
// ========================================
// AI 请求核心
// ========================================

/**
 * 【关键修复】注入预设所需的全局变量
 * 模拟酒馆助手脚本的行为，在每次请求前设置全局变量
 * 这些变量在预设提示词中以 {{getglobalvar::变量名}} 引用
 * 【重要】此函数必须在处理预设提示词之前调用！
 */
function injectPresetGlobalVars() {
    if (typeof MacroEngine === 'undefined') return;
    
    // 优先从当前加载的预设中获取字数配置
    var presetConfig = null;
    if (typeof PresetManager !== 'undefined' && PresetManager.presets && PresetManager.currentPresetIndex >= 0) {
        var currentPreset = PresetManager.presets[PresetManager.currentPresetIndex];
        if (currentPreset && currentPreset.wordCountConfig) {
            presetConfig = currentPreset.wordCountConfig;
        }
    }
    
    // 合并配置：预设配置优先，其次为用户手动设置，最后为默认值
    var config = presetConfig || gameState.wordCountConfig || {};
    
    // === 字数控制变量 ===
    // 如果预设明确禁用了字数控制，则尊重预设设置
    if (config.enabled !== false) {
        // 使用预设中的值，不再强制默认值
        var wcMin = config.min || config.min_length || 0;
        var wcMax = config.max || config.max_length || 0;
        var pcMin = config.paragraphMin || 0;
        var pcMax = config.paragraphMax || 0;
        
        // 只有当有明确设置时才注入变量
        if (wcMin > 0 || wcMax > 0) {
            var wcText = '';
            if (wcMin > 0 && wcMax > 0) {
                wcText = '[' + wcMin + '-' + wcMax + ']字';
            } else if (wcMin > 0) {
                wcText = '至少' + wcMin + '字';
            } else if (wcMax > 0) {
                wcText = '最多' + wcMax + '字';
            }
            if (pcMin > 0 && pcMax > 0) {
                wcText += '，[' + pcMin + '-' + pcMax + ']段';
            }
            MacroEngine.setGlobalVar('字数总要求', wcText);
        } else {
            // 如果没有设置，使用空字符串让AI自行判断
            MacroEngine.setGlobalVar('字数总要求', '由AI根据场景自行判断合适的长度');
        }
        
        // 段落风格补丁 - 仅在明确指定时注入
        var style = config.paragraphStyle || config.style || '';
        if (style) {
            var patches = {
                long: '[长段落] 沉浸式长段落，单段250-600字，拒绝碎片化换行',
                medium: '[中段落] 均衡段落，单段180-320字',
                short: '[短段落] 紧凑推进，单段90-180字',
                free: '[自由段落] 长短错落，根据场景氛围动态调整'
            };
            MacroEngine.setGlobalVar('单段落字数', patches[style] || '');
        } else {
            MacroEngine.setGlobalVar('单段落字数', '');
        }
    } else {
        // 禁用字数控制时，清空相关变量
        MacroEngine.setGlobalVar('字数总要求', '');
        MacroEngine.setGlobalVar('单段落字数', '');
    }
    
    // === 叙述视角变量 ===
    var perspective = config.perspective || config.narrator || '';
    if (perspective) {
        var perspectiveMap = {
            'third_person_omniscient': '叙述视角：第三人称全知',
            'third_person_limited': '叙述视角：第三人称有限',
            'first_person_limited': '叙述视角：第一人称有限'
        };
        MacroEngine.setGlobalVar('叙述视角', perspectiveMap[perspective] || '');
        
        var charPronouns = {
            'third_person_omniscient': '他/她/char_name',
            'third_person_limited': '他/她/char_name',
            'first_person_limited': '我'
        };
        MacroEngine.setGlobalVar('char代词', charPronouns[perspective] || '');
    } else {
        MacroEngine.setGlobalVar('叙述视角', '');
        MacroEngine.setGlobalVar('char代词', '');
    }
    
    // === user代词 ===
    var userPronoun = config.userPronoun || config.user_pronoun || '';
    if (userPronoun) {
        var userPronounMap = {
            'third_person': '用第三人称（名字或"他/她"）指代<user>',
            'second_person': '用第二人称"你"指代<user>',
            'first_person': '用第一人称"我"指代<user>'
        };
        MacroEngine.setGlobalVar('user代词', userPronounMap[userPronoun] || '');
    } else {
        MacroEngine.setGlobalVar('user代词', '');
    }
    
    // === 演绎授权 ===
    var takeover = config.takeover || config.takeover_permission || '';
    if (takeover) {
        var takeoverMap = {
            'open': '演绎<user>言行',
            'half_open': '演绎<user>行动',
            'assist': '辅助<user>行动',
            'closed': '不演绎<user>言行'
        };
        MacroEngine.setGlobalVar('演绎授权', takeoverMap[takeover] || '');
    } else {
        MacroEngine.setGlobalVar('演绎授权', '');
    }
    
    // === 转述授权 ===
    var narrate = config.narrate || config.narrate_permission || '';
    if (narrate) {
        var narrateMap = {
            'open': '开放转述<user>',
            'balanced': '平衡转述<user>',
            'light': '轻度转述<user>',
            'closed': '不转述<user>'
        };
        MacroEngine.setGlobalVar('转述授权', narrateMap[narrate] || '');
    } else {
        MacroEngine.setGlobalVar('转述授权', '');
    }
    
    // === AI模式 ===
    var aiMode = config.aiMode || config.mode || 'normal';
    var talkMap = {
        'dialogue': '\n- 元对话模式：以角色身份与<user>自然对话，不输出格式化内容',
        'outline': '\n- 大纲模式：输出故事大纲，包含章节划分、关键事件、角色发展弧线',
        'summary': '\n- 总结模式：输出大总结，包含核心事件、角色关系变化、世界状态更新',
        'normal': ''
    };
    MacroEngine.setGlobalVar('talk', talkMap[aiMode] || '');
    
    // === 推进节奏（来自月读预设的智慧） ===
    var pacing = config.pacing || '';
    if (pacing) {
        var pacingMap = {
            'slow': '慢火浸润：极度细腻，每个感官细节都值得停留，场景转换缓慢而沉浸',
            'steady': '稳态推进：均衡节奏，细节与推进并重，适合大多数叙事',
            'balanced': '均衡脉冲：中等节奏，关键场景细腻、过渡场景简练',
            'fast': '高压疾行：快速推进，紧凑有力，适合紧张刺激的场景',
            'free': '自由变奏：根据场景氛围自动调节节奏，平静时细腻、紧张时加速'
        };
        MacroEngine.setGlobalVar('推进节奏', pacingMap[pacing] || '');
    } else {
        MacroEngine.setGlobalVar('推进节奏', '');
    }
    
    // === 文风选择（来自果实预设的梦境风味系统） ===
    var writingStyle = config.writingStyle || (gameState && gameState.writingStyle) || '';
    if (writingStyle) {
        var styleMap = {
            'baimiao': '此乃【白描之梦】\n- 由动词、名称主宰，克制用词，体现文学的美感\n- 温和、克制、谨慎地塑造',
            'liudong': '此乃【流动之梦】\n- 叙事跟随感知流淌，感官印象先于事件浮现——气味、温度、光线、声音是叙事入口\n- 时间感可以扭曲：一瞬间可以延展为漫长凝视，一段时光可以在一行中滑过\n- 内心意识与外部场景互相渗透，边界是模糊的\n- 情绪从不被直接命名，而是在流淌的感知中自然显现',
            'lengjun': '此乃【冷峻之梦】\n- 叙事如镜头，保持克制的距离，不介入，不评判，不渲染\n- 句子短促，信息密度高；对话简短直接，省去一切多余的情绪说明\n- 用行为与细节替代内心独白，读者自行推断情感\n- 冷静直面荒诞与痛苦——既不回避，也不放大',
            'nongmo': '此乃【浓墨之梦】\n- 色彩、光影、气味、温度可以承载情感，景物随人物内心微微变形\n- 允许繁复的意象与精准的形容词，但须服务于情感而非纯粹堆砌\n- 情感以具体的物理感受外化——不直接命名，却处处可感\n- 每个细节都带有主观温度，文字本身就是情绪的投射'
        };
        MacroEngine.setGlobalVar('文风指导', styleMap[writingStyle] || '');
    } else {
        MacroEngine.setGlobalVar('文风指导', '');
    }

    // === 思维链模式（来自蛾摩拉预设的COT控制） ===

    var cotMode = (gameState && gameState.cotMode) || '';
    if (cotMode === 'enabled') {
        var _presetHasCot = false;
        try {
            if (typeof PresetManager !== 'undefined' && PresetManager.presets && PresetManager.currentPresetIndex >= 0) {
                var _cotPreset = PresetManager.presets[PresetManager.currentPresetIndex];
                if (_cotPreset && _cotPreset.prompts) {
                    _presetHasCot = _cotPreset.prompts.some(function(p) {
                        var c = (p && p.content) || '';
                        // [T1-P1-9] fallback 改空数组（按报告建议），OutputSanitizer 未加载时不做 CoT 检测更安全
                        var _cotP = (typeof OutputSanitizer !== 'undefined' && OutputSanitizer.THINKING_TAGS)
                            ? OutputSanitizer.THINKING_TAGS : [];
                        return new RegExp('<(' + _cotP.join('|') + ')>', 'i').test(c);
                    });
                }
            }
        } catch(e) {}
        if (_presetHasCot) {
            // 预设已配置思维链，cotMode 退位
            MacroEngine.setGlobalVar('起始标签', '');
        } else {
            MacroEngine.setGlobalVar('起始标签', '<thinking>');
        }
    } else {
        MacroEngine.setGlobalVar('起始标签', '');
    }

    // 注入其他常用的酒馆宏变量
    if (!MacroEngine.getGlobalVar('user')) MacroEngine.setGlobalVar('user', (gameState && gameState.playerName) || '玩家');
    if (!MacroEngine.getGlobalVar('char')) MacroEngine.setGlobalVar('char', (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) ? gameState.worldSnapshot.characters[0].name : '角色');
    MacroEngine.setGlobalVar('original',
        (typeof StateManager !== 'undefined' && StateManager.get && StateManager.get('ui.lastOriginalContent')) ||
        (gameState && gameState._lastOriginalContent) || '');
    
    // === 象牙塔预设需要的额外变量 ===
    // user_input: 用户最新输入内容
    var lastUserInput = '';
    var history = (gameState && gameState.conversationHistory) || [];
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i] && history[i].role === 'user') {
            lastUserInput = history[i].content || '';
            break;
        }
    }
    MacroEngine.setGlobalVar('user_input', lastUserInput);
    
    // 转述开关: 是否允许转述用户角色
    var narrateEnabled = config.narrate && config.narrate !== 'closed';
    MacroEngine.setGlobalVar('转述开关', narrateEnabled ? '开启' : '关闭');
    
    // 抢转设置: 演绎和转述的综合设置
    var takeoverEnabled = config.takeover && config.takeover !== 'closed';
    var grabSettings = '';
    if (takeoverEnabled && narrateEnabled) {
        grabSettings = '可以演绎和转述<user>';
    } else if (takeoverEnabled) {
        grabSettings = '可以演绎<user>行动，但不转述';
    } else if (narrateEnabled) {
        grabSettings = '可以转述<user>，但不演绎';
    } else {
        grabSettings = '不演绎也不转述<user>';
    }
    MacroEngine.setGlobalVar('抢转设置', grabSettings);
    
    console.log('[injectPresetGlobalVars] 全局宏变量已注入');
}

/**
 * 应用长度预设
 */
function applyLengthPreset(preset) {
    var presets = {
        short:  { min: 500,  max: 1000, paraMin: 5,  paraMax: 7,  style: 'short' },
        medium: { min: 1500, max: 3000, paraMin: 15, paraMax: 17, style: 'medium' },
        long:   { min: 4000, max: 6000, paraMin: 20, paraMax: 25, style: 'long' }
    };
    var p = presets[preset];
    if (!p) return;
    
    var elMin = document.getElementById('wcMin');
    var elMax = document.getElementById('wcMax');
    var elParaMin = document.getElementById('wcParaMin');
    var elParaMax = document.getElementById('wcParaMax');
    var elStyle = document.getElementById('wcParagraphStyle');
    if (elMin) elMin.value = p.min;
    if (elMax) elMax.value = p.max;
    if (elParaMin) elParaMin.value = p.paraMin;
    if (elParaMax) elParaMax.value = p.paraMax;
    if (elStyle && p.style) elStyle.value = p.style;
}

async function sendAIRequest(userMessage, isInit = false) {
    // 【P0 修复】isInit 时强制重置 isWaiting，防止上一轮异常残留导致开局卡死
    // 场景：extractSetupToMemory 超时后调用 sendAIRequest，但 isWaiting 可能被
    // autoCompressContext 或其他路径设为 true 且未清理
    if (isWaiting) {
        if (isInit) {
            console.warn('[sendAIRequest] isInit 时检测到 isWaiting=true（可能是上一轮残留），强制重置');
            setWaiting(false);
        } else {
            return;
        }
    }
    // AbortController 用于取消请求
    safeAbort();
    window._currentAbort = new AbortController();
    setWaiting(true);
    // 【BG-001 修复】请求开始时先清理上一轮可能残留的生成弹窗，
    // 避免重试/降级路径下 showGenerating/hideGenerating 调度乱序导致遮罩叠加
    try { if (typeof UI !== 'undefined' && UI.hideGenerating) UI.hideGenerating(); } catch (e) {}
    showStoryLoading();
    streamBuffer = '';

    RuntimeState.streamModeLocked = false;
    RuntimeState.streamMode = null;
    TypewriterBuffer.stop();
    if (typeof hideCotPanel === 'function') hideCotPanel();
    else { var _cotPanel = document.getElementById('cotPanel'); if (_cotPanel) _cotPanel.style.display = 'none'; }
    // 【NEW-003 修复】新一轮请求开始时清掉等待提示（避免上一轮残留）
    _clearStreamWaitingHint();
    // 【NEW-007 修复】重置流式增量提取状态
    _resetStreamExtractor();

    // 【BUG-002 修复】请求开始时立即更新标题，避免长时间显示"等待开始..."
    // 仅在初始生成（isInit）或当前标题为初始占位符时才更新，避免覆盖已有章节标题
    // 【BUG-002 深度修复】早期标题只更新 DOM，不写 StateManager。
    // 但若上次请求失败导致 StateManager 中残留了 userPrompt 作为 sceneTitle，
    // 需要在此清除，确保本次请求的兜底逻辑（line 2107 / catch 块）能正确触发。
    try {
        var _titleEl = document.getElementById('storySceneTitle');
        var _curTitle = _titleEl ? _titleEl.textContent : '';
        if (isInit || _curTitle === '等待开始...' || !_curTitle) {
            var _earlyTitle = (gameState && gameState.userPrompt)
                ? (gameState.userPrompt.trim().substring(0, 20) + (gameState.userPrompt.length > 20 ? '...' : ''))
                : '生成中...';
            updateSceneTitle(_earlyTitle);
            // 【BUG-002 深度修复】清除 StateManager 中可能残留的 sceneTitle，
            // 让后续兜底逻辑（!StateManager.get('progress.sceneTitle')）能正确触发。
            // 注意：updateSceneTitle 只改 DOM 不改 StateManager，所以这里手动清除。
            if (typeof StateManager !== 'undefined' && StateManager.set) {
                StateManager.set('progress.sceneTitle', '', { silent: true });
            }
        }
    } catch (e) { /* 忽略，标题更新失败不影响核心流程 */ }

    // [P1 Swipe] 非 retry 模式的新对话：重置 swipe 数组
    // retry 模式下 SwipeManager._isRetrying=true，保留旧版本，让 addSwipe 追加
    if (typeof SwipeManager !== 'undefined' && !SwipeManager.isRetrying()) {
        SwipeManager.reset();
    }

    if (!isInit && typeof QuestSystem !== 'undefined' && QuestSystem.advanceGuidanceQuest) {
        QuestSystem.advanceGuidanceQuest();
    }
    
    // 原版从 setWaiting(true) 到 callAI 之间没有异步等待窗口
    // 新版的 requestAnimationFrame 等待帧引入竞态：等待期间取消按钮可误触刚创建的 AbortController
    // 移除等待帧，让 loading 动画由 CSS 动画自动处理（不需要 JS 等待帧）
    
    // 保存撤销状态（在AI回复前）
    saveUndoState();

    if (gameState) {
        var preTitle = StateManager ? (StateManager.get('progress.lastSceneTitle') || '') : '';
        var preGameTime = StateManager ? StateManager.get('time') : (gameState.gameTime || null);
        var preTurn = StateManager ? StateManager.get('progress.turn') : ((gameState._stats && gameState._stats.totalTurns) || 0);
        var preAIState = {
            title: preTitle,
            gameTime: preGameTime ? StateSchema.deepClone(preGameTime) : null,
            turn: preTurn,
            storySnapshot: (gameState.conversationHistory && gameState.conversationHistory.length > 0) ?
                gameState.conversationHistory.filter(function(m) { return m.role === 'assistant'; }).slice(-1)[0] : null
        };
        if (StateManager) {
            StateManager.set('progress.preAIState', preAIState, { silent: true });
        }
        gameState._preAIState = preAIState;
    }
    // 应用正则脚本到用户输入
    if (userMessage && typeof RegexManager !== 'undefined') {
        userMessage = RegexManager.applyToInput(userMessage);
    }
    // 触发事件：USER_MESSAGE_RENDERED（用户消息渲染后）
    if (userMessage && typeof TavernHelperCompat !== 'undefined') {
        TavernHelperCompat.emit('USER_MESSAGE_RENDERED', {
            message: userMessage,
            timestamp: Date.now()
        });
    }
    try {
        // 【关键修复】在构建消息列表之前，确保全局宏变量已注入
        // 这样预设中的 {{getglobalvar::XXX}} 才能被正确替换
        injectPresetGlobalVars();

        // 【BG-004 修复】跟踪 turn 是否已在正常路径递增，
        // catch 块据此决定是否补递增（避免异常路径读到 turn=0 显示"第 1 回合"）
        var _turnIncremented = false;
        
        var messages;
        // isInit: 初始化请求也需要应用预设提示词（写作风格、字数控制等）
        // 但不需要完整的聊天历史和世界书注入
        if (isInit) {

            if (gameState) {
                gameState._depthPrompts = {};
                gameState._positionPrompts = {};
                gameState._afterChatPrompts = [];
            }


            try {
                var _initWI = getWorldInfoInjection();
                if (gameState) {
                    gameState._wiPositionTexts = (isObject(_initWI) && _initWI.positionTexts) ? _initWI.positionTexts : null;
                }
            } catch(e) {
                console.warn('[isInit] 世界书扫描失败:', e);
            }
            if (typeof PresetManager !== 'undefined' && PresetManager.presets && PresetManager.currentPresetIndex >= 0) {
                var initPreset = PresetManager.presets[PresetManager.currentPresetIndex];
                if (initPreset) {
                    PresetManager._applyPromptsToSystemPrompt(initPreset);
                    // 同步更新 conversationHistory 中的系统提示词
                    if (gameState.conversationHistory && gameState.conversationHistory.length > 0 && gameState.conversationHistory[0].role === 'system') {
                        gameState.conversationHistory[0].content = gameState.systemPrompt;
                    }
                }
            } else {
                try { gameState.systemPrompt = buildSystemPrompt(); } catch(e) { console.warn('[buildSystemPrompt]', e); }
            }
            // 构建isInit消息列表（含世界书position注入和世界快照）
            messages = [];
            // 主系统提示词

            _pushSystemPrompt(messages);
            // 世界书position注入（与主路径一致的depth 0-5）
            var _initWIPos = (gameState && gameState._wiPositionTexts) || null;
            var _initPosPrompts = (gameState && gameState._positionPrompts) || {};
            if (_initWIPos && _initWIPos.beforeChar) messages.push({ role: 'system', content: '【世界知识库】\n' + _initWIPos.beforeChar.join('\n') });
            if (_initPosPrompts['0']) messages.push({ role: 'system', content: _initPosPrompts['0'].join('\n\n') });
            if (_initWIPos && _initWIPos.afterChar) messages.push({ role: 'system', content: '【世界知识库】\n' + _initWIPos.afterChar.join('\n') });
            if (_initPosPrompts['1']) messages.push({ role: 'system', content: _initPosPrompts['1'].join('\n\n') });
            // 世界快照（开局时通常为空，但读档重开时可能有数据）
            if (gameState && gameState.worldSnapshot && Object.keys(gameState.worldSnapshot).length > 0) {
                var _initSnapText = '【世界快照】\n';
                var _initSnap = gameState.worldSnapshot;
                if (_initSnap.player) {
                    _initSnapText += '主角: ' + (_initSnap.player.name || '未知');
                    if (_initSnap.player.identity) _initSnapText += ', 身份: ' + _initSnap.player.identity;
                    _initSnapText += '\n';
                }
                if (_initSnapText.length > 10) messages.push({ role: 'system', content: _initSnapText });
            }
            // 聊天历史（跳过旧的system消息，避免重复）
            var _initHistory = (gameState.conversationHistory || []).slice(1);
            messages = messages.concat(_initHistory);
            // 当前用户消息
            messages.push({ role: 'user', content: userMessage });
        } else {
            // === 按酒馆标准构建消息列表 ===

            // 1. 重建系统提示词（只包含游戏基础规则，不含预设prompts和世界书）
            try {
                var rebuiltPrompt;
                // 清空之前的世界书depth prompts（避免累积）
                if (gameState) {
                    gameState._depthPrompts = {};
                    gameState._positionPrompts = {};
                    gameState._afterChatPrompts = [];
                }

                // [P2 向量检索] 预计算查询向量和候选条目向量（异步）
                // 在同步的 getWorldInfoInjection 之前完成，让 _applyVectorRetrieval 能同步使用缓存
                if (typeof WorldInfo !== 'undefined' && typeof WorldInfo.precomputeVectors === 'function') {
                    try {
                        await WorldInfo.precomputeVectors(gameState.conversationHistory || []);
                    } catch (e) {
                        console.warn('[sendAIRequest] 预计算向量失败，跳过向量检索:', e);
                    }
                }

                var _cachedWI = getWorldInfoInjection();
                if (gameState) {
                    gameState._wiPositionTexts = (_cachedWI && _cachedWI.positionTexts) ? _cachedWI.positionTexts : null;
                }

                if (typeof PresetManager !== 'undefined' && PresetManager.presets && PresetManager.currentPresetIndex >= 0) {
                    var currentPreset = PresetManager.presets[PresetManager.currentPresetIndex];
                    if (currentPreset) {
                        PresetManager._applyPromptsToSystemPrompt(currentPreset);
                        if (gameState) rebuiltPrompt = gameState.systemPrompt;
                    }
                } else {
                    rebuiltPrompt = buildSystemPrompt();
                }
                if (gameState) gameState.systemPrompt = rebuiltPrompt;
                if (gameState && gameState.conversationHistory && gameState.conversationHistory.length > 0 && gameState.conversationHistory[0].role === 'system') {
                    gameState.conversationHistory[0].content = rebuiltPrompt;
                }
            } catch(e) {
                // 【ISSUE-008 修复】原 console.warn('...:', e) 在 e 为非 Error 对象时只打印 {}，
                // 无法定位根因。改为打印完整 message + stack。
                var _promptErrInfo = (e instanceof Error)
                    ? (e.message + '\n' + (e.stack || ''))
                    : ('非 Error 对象: ' + (typeof e) + ' -> ' + (function() {
                        try { return JSON.stringify(e); } catch(_) { return String(e); }
                    })());
                console.warn('[修复] 重建系统提示词失败:', _promptErrInfo);
            }

            var recent = (gameState.conversationHistory || []).slice(1).slice(-MAX_HISTORY);

            // 【Token优化】聊天历史智能瘦身：旧AI回复只保留story字段
            // AI回复是JSON格式，每条约2000字(1176 tokens)，其中story约500字(294 tokens)
            // 保留最近3轮完整JSON，更早的只保留story，节省约60%历史token
            // 【ISSUE-C2 修复】SLIM_THRESHOLD 动态适应 summaryThreshold：
            // summaryThreshold > 0 时，瘦身范围与摘要范围一致，避免逻辑冗余
            var summaryThreshold = (gameState && gameState.summaryThreshold) || 0;
            var SLIM_THRESHOLD = summaryThreshold > 0 ? summaryThreshold * 2 : 6;
            if (recent.length > SLIM_THRESHOLD) {
                var slimStart = recent.length - SLIM_THRESHOLD;
                for (let _si = 0; _si < slimStart; _si++) {
                    var _sMsg = recent[_si];
                    if (_sMsg.role === 'assistant' && _sMsg.content) {
                        var _slimResult = _slimAssistantMessage(_sMsg.content);
                        if (_slimResult !== _sMsg.content) {

                            recent[_si] = Object.assign({}, _sMsg, { content: _slimResult });
                        }
                    }
                }
            }

            // 【月读智慧】摘要阈值：超过此轮数的旧对话只发送摘要，节省token
            // 来自月读预设的"6楼外只发摘要"策略
            // 【ISSUE-C2 修复】summaryThreshold 已在上方声明，此处复用
            if (summaryThreshold > 0 && recent.length > summaryThreshold * 2) {
                // 保留最近N轮的完整对话，旧对话用摘要替代
                var keepCount = summaryThreshold * 2; // 每轮=1 user + 1 assistant
                var newMessages = recent.slice(recent.length - keepCount);

                // 无论是否有摘要，都只保留最近N轮（避免上下文溢出）
                // 如果有摘要，旧对话信息已包含在摘要中；如果没有摘要，旧对话也需要裁剪以节省token
                recent = newMessages;
                console.log('[摘要阈值] 保留最近' + newMessages.length + '条对话（阈值=' + summaryThreshold + '轮）');
            }

            // 2. 获取世界书分组数据
            var wiPositionTexts = (gameState && gameState._wiPositionTexts) || null;
            var positionPrompts = (gameState && gameState._positionPrompts) || {};

            // 3. 按酒馆标准顺序构建消息列表
            messages = [];

            // [0] 主系统提示词

            // use_sysprompt=false 时 _pushSystemPrompt 内部自动转为 user role（酒馆标准行为）
            _pushSystemPrompt(messages);

            // 辅助函数：合并世界书和预设提示词
            // 【可配置顺序】默认世界书在前（酒馆常规行为），部分预设期望预设在前
            // 通过 gameState._wiFirst 控制：true(默认)=世界书在前；false=预设在世界书前面
            function mergePositionContent(wiTexts, presetTexts) {
                var wiFirst = gameState && gameState._wiFirst !== false; // 默认为 true
                var wiBlock = (wiTexts && wiTexts.length > 0) ? ('【世界知识库】\n' + wiTexts.join('\n')) : null;
                var presetBlock = null;
                if (presetTexts && presetTexts.length > 0) {
                    presetBlock = presetTexts.slice();
                }
                var parts = [];
                if (wiFirst) {
                    if (wiBlock) parts.push(wiBlock);
                    if (presetBlock) presetBlock.forEach(function(t) { parts.push(t); });
                } else {
                    if (presetBlock) presetBlock.forEach(function(t) { parts.push(t); });
                    if (wiBlock) parts.push(wiBlock);
                }
                return parts.length > 0 ? parts.join('\n\n') : null;
            }

            // depth 0 = BEFORE_CHAR
            var d0 = mergePositionContent(
                wiPositionTexts ? wiPositionTexts.beforeChar : null,
                positionPrompts['0']
            );
            if (d0) messages.push({ role: 'system', content: d0 });

            // depth 1 = AFTER_CHAR
            var d1 = mergePositionContent(
                wiPositionTexts ? wiPositionTexts.afterChar : null,
                positionPrompts['1']
            );
            if (d1) messages.push({ role: 'system', content: d1 });

            // depth 2 = EM_TOP
            var d2 = mergePositionContent(
                wiPositionTexts ? wiPositionTexts.emTop : null,
                positionPrompts['2']
            );
            if (d2) messages.push({ role: 'system', content: d2 });

            // depth 3 = EM_BOTTOM
            var d3 = mergePositionContent(
                wiPositionTexts ? wiPositionTexts.emBottom : null,
                positionPrompts['3']
            );
            if (d3) messages.push({ role: 'system', content: d3 });

            // depth 4 = AN_TOP
            var d4 = mergePositionContent(
                wiPositionTexts ? wiPositionTexts.anTop : null,
                positionPrompts['4']
            );
            if (d4) messages.push({ role: 'system', content: d4 });

            // depth 5 = AN_BOTTOM
            var d5 = mergePositionContent(
                wiPositionTexts ? wiPositionTexts.anBottom : null,
                positionPrompts['5']
            );
            if (d5) messages.push({ role: 'system', content: d5 });

            // 游戏状态快照（【Token优化】记忆系统已激活时跳过，避免与记忆注入重复）
            // 记忆注入的【角色近况】【持有物品】比快照更实时，重复发送浪费token
            var _hasMemoryInjection = (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.buildSmartInjection);
            if (!_hasMemoryInjection && gameState && gameState.worldSnapshot && Object.keys(gameState.worldSnapshot).length > 0) {
                var snap = gameState.worldSnapshot;
                var snapshotText = '【世界快照】\n';
                if (snap.player) {
                    snapshotText += '主角: ' + (snap.player.name || '未知') + ', ' + (snap.player.identity || '') + '\n';
                    if (snap.player.stats && snap.player.stats.length > 0) {
                        snapshotText += '属性: ' + snap.player.stats.map(function(s) { return s.label + ':' + s.value; }).join(', ') + '\n';
                    }
                }
                if (snap.characters && snap.characters.length > 0) {
                    snapshotText += '当前NPC: ' + snap.characters.map(function(c) {
                        return c.name + '(' + (c.relation || '未知') + ',好感' + (c.favorability || '?') + ')';
                    }).join('; ') + '\n';
                }
                if (snap.bag && snap.bag.length > 0) {
                    snapshotText += '背包: ' + snap.bag.map(function(b) { return b.name + 'x' + (b.count || 1); }).join(', ') + '\n';
                }
                if (snapshotText.length > 10) messages.push({ role: 'system', content: snapshotText });
            }

            // 重要事件记录（精简：只保留最近5条，节省token）
            if (!(typeof EnhancedMemory !== 'undefined' && EnhancedMemory.buildSmartInjection) && gameState && gameState.keyEvents && gameState.keyEvents.length > 0) {
                var recentEvents = gameState.keyEvents.slice(-5);
                var eventsText = '【过往事件】\n' + recentEvents.join('\n');
                messages.push({ role: 'system', content: eventsText });
            }

            // 【多角色叙事指导】精简为1行提示，节省token
            var _activeCharCount = 0;
            if (gameState && gameState.worldSnapshot && gameState.worldSnapshot.characters) {
                gameState.worldSnapshot.characters.forEach(function(c) {
                    if (c.relation || typeof c.favorability === 'number') _activeCharCount++;
                });
            }
            if (_activeCharCount > 1) {
                messages.push({ role: 'system', content: '【多角色】多角色在场时，各角色独立行动、轮流对话、性格各异。' });
            }

            // 远期摘要（【Token优化】记忆系统有对话摘要时跳过，避免重复）
            // 记忆注入的【对话摘要】比rollingSummary更精确，重复发送浪费token
            var _hasSummaryInjection = _hasMemoryInjection && EnhancedMemory._summaryLayers &&
                (EnhancedMemory._summaryLayers.near.length > 0 || EnhancedMemory._summaryLayers.mid.length > 0);
            if (!_hasSummaryInjection && gameState && gameState.rollingSummary) {
                messages.push({
                    role: 'system',
                    content: '【前情摘要】\n' + gameState.rollingSummary
                });
            }

            // 对话历史
            var chatHistoryStart = messages.length; // 记录聊天历史在消息数组中的起始位置
            messages = messages.concat(recent);

            // 【酒馆特性】Author's Note（作者备注）
            // 在聊天历史尾部、用户消息之前注入可自定义的提示词
            // 作用：让玩家可以在每轮对话中微调AI的行为，而不需要修改整个系统提示词
            // 例如："请侧重描写殷允的心理活动" 或 "这章要出现一个新角色"
            var authorsNote = (gameState && gameState.authorsNote) || '';
            var authorsNoteDepth = (gameState && gameState.authorsNoteDepth) || 0; // 默认0=紧贴用户消息前
            if (authorsNote) {
                var anMessage = { role: 'system', content: '【作者备注】\n' + authorsNote };
                if (authorsNoteDepth > 0 && authorsNoteDepth < messages.length) {
                    // 注入到聊天历史的指定深度位置
                    var insertIdx = messages.length - authorsNoteDepth;
                    if (insertIdx < chatHistoryStart) insertIdx = chatHistoryStart;
                    messages.splice(insertIdx, 0, anMessage);
                } else {
                    // 默认：紧贴用户消息之前
                    messages.push(anMessage);
                }
            }

            // 当前用户消息
            messages.push({ role: 'user', content: userMessage });

            // 深度注入提示词 (depth >= 6) - 从聊天历史末尾计算位置（与酒馆一致）
            if (gameState && gameState._depthPrompts && Object.keys(gameState._depthPrompts).length > 0) {
                var _origForDepth =
                    (typeof StateManager !== 'undefined' && StateManager.get && StateManager.get('ui.lastOriginalContent')) ||
                    (gameState && gameState._lastOriginalContent) || '';
                var macroEnvForDepth = {
                    user: (gameState && gameState.playerName) || '玩家',
                    char: (gameState && gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) ? gameState.worldSnapshot.characters[0].name : '角色',
                    original: _origForDepth
                };

                // 按depth从大到小排序，先插入大depth（靠近末尾），避免位置偏移
                var depthKeys = Object.keys(gameState._depthPrompts).map(Number).sort(function(a, b) { return b - a; });

                depthKeys.forEach(function(depth) {
                    var prompts = gameState._depthPrompts[depth];
                    prompts.forEach(function(p) {
                        if (p.enabled !== false && p.content && p.content.trim()) {
                            var processedContent = typeof p.content === 'string' && !p.content.includes('{{') ? p.content : MacroEngine.process(p.content.trim(), macroEnvForDepth);
                            if (processedContent.trim()) {
                                // 【酒馆兼容】injection_position:
                                //   0 = RELATIVE（默认，从聊天底部往上数，depth=N → 倒数第N条之后）
                                //   1 = ABSOLUTE（从聊天顶部往下数，depth=N → 正数第N条之后）
                                var isAbsolute = p.injection_position === 1;
                                var chatEndIndex = messages.length - 1; // 最后一条是user消息
                                var insertIndex;
                                if (isAbsolute) {
                                    // ABSOLUTE：从 chatHistoryStart 往后数 depth 条
                                    insertIndex = chatHistoryStart + depth;
                                } else {
                                    // RELATIVE（酒馆默认）：从聊天末尾往回数 depth 条
                                    insertIndex = chatEndIndex - depth;
                                }

                                // 避免被错误地压到 system 区域污染主 system 提示词
                                if (insertIndex < chatHistoryStart) {
                                    return; // skip this prompt
                                }
                                // 越过最后一条 user 消息时夹回 user 之前
                                insertIndex = Math.min(insertIndex, chatEndIndex);
                                messages.splice(insertIndex, 0, { role: 'system', content: processedContent });
                            }
                        }
                    });
                });
            }
        }
        // squash_system_messages 支持（在深度注入之后执行，确保所有system消息都被合并）
        // 果实预设要求将所有相邻的 system 消息合并为一条
        if (gameState && gameState._squashSystemMessages === true) {
            var squashed = [];
            for (let si = 0; si < messages.length; si++) {
                if (messages[si].role === 'system' && squashed.length > 0 && squashed[squashed.length - 1].role === 'system') {
                    squashed[squashed.length - 1].content += '\n\n' + messages[si].content;
                } else {
                    squashed.push({ role: messages[si].role, content: messages[si].content });
                }
            }
            messages = squashed;
            console.log('[消息构建] 已合并相邻system消息 (squash_system_messages)');
        }
        // 注入 impersonation_prompt（用户人设）
        // 酒馆中 impersonation_prompt 被插入到最后一条 assistant 消息之后
        if (gameState && gameState._impersonationPrompt && gameState._impersonationPrompt.trim()) {
            // 找到最后一条 assistant 消息的位置，在其后插入
            var lastAssistantIdx = -1;
            for (let _impIdx = messages.length - 1; _impIdx >= 0; _impIdx--) {
                if (messages[_impIdx].role === 'assistant') {
                    lastAssistantIdx = _impIdx;
                    break;
                }
            }
            if (lastAssistantIdx >= 0) {
                messages.splice(lastAssistantIdx + 1, 0, {
                    role: 'system',
                    content: gameState._impersonationPrompt
                });
            } else {

                // 兜底：注入到聊天历史开始位置（system 区之后、user 之前）
                // 这样无论是不是开局，impersonation 都能被 AI 看到
                if (typeof chatHistoryStart === 'number' && chatHistoryStart >= 0 && chatHistoryStart <= messages.length) {
                    messages.splice(chatHistoryStart, 0, {
                        role: 'system',
                        content: gameState._impersonationPrompt
                    });
                } else {
                    // 极端兜底：插到最末尾
                    messages.push({
                        role: 'system',
                        content: gameState._impersonationPrompt
                    });
                }
            }
        }
        // 对所有消息内容进行宏处理（兼容酒馆预设中的宏）
        // 传入 env 参数，使 {{original}} 等环境宏可用
        var _origForMacro =
            (typeof StateManager !== 'undefined' && StateManager.get && StateManager.get('ui.lastOriginalContent')) ||
            (gameState && gameState._lastOriginalContent) || '';
        var macroEnv = {
            user: gameState.playerName || '玩家',
            char: (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) ? gameState.worldSnapshot.characters[0].name : '角色',
            original: _origForMacro
        };
        messages.forEach(function(msg) {
            if (msg.content && typeof msg.content === 'string') {
                msg.content = MacroEngine.process(msg.content, macroEnv);
                // 清理空变量导致的连续空行（来自酒馆预设的空setvar）
                msg.content = msg.content.replace(/\n{3,}/g, '\n\n').trim();
            }
        });
        // 清理历史消息中的装饰性标签（减少token浪费）
        // 这些标签对AI生成没有帮助，但会占用大量上下文
        // 月读预设通过正则脚本实现此功能，这里作为内置兜底

        _reDecorTags.lastIndex = 0;
        // 【P0 根因修复】用线性时间 stripPairedTags 替代 _reDecorTags 正则
        var _decorTagNames = ['giggle','ice','snow','echo','danmu','branches','prologue','meow_FM','time_format','write_check','emoji','novel_header','profile','ccd','角色状态面板'];
        messages.forEach(function(msg, idx) {
            if (msg.content && typeof msg.content === 'string' && msg.role === 'assistant') {
                // 只清理历史消息（非最后一条assistant消息）
                var isLastAssistant = false;
                for (let _chk = messages.length - 1; _chk >= 0; _chk--) {
                    if (messages[_chk].role === 'assistant') {
                        isLastAssistant = (_chk === idx);
                        break;
                    }
                }
                if (!isLastAssistant) {
                    msg.content = (typeof stripPairedTags !== 'undefined')
                        ? stripPairedTags(msg.content, _decorTagNames)
                        : msg.content;
                }
            }
        });
        // names_behavior: 根据预设设置在消息前添加角色名
        var namesBehavior = (gameState && gameState._namesBehavior) || 0;
        if (namesBehavior === 1 || namesBehavior === 2) {
            var charName = (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) 
                ? gameState.worldSnapshot.characters[0].name : 'AI';
            var userName = (gameState && gameState.playerName) || '玩家';
            messages.forEach(function(msg) {
                if (msg.role === 'assistant' && typeof msg.content === 'string' && !msg.content.startsWith(charName)) {
                    msg.content = charName + ': ' + msg.content;
                } else if (msg.role === 'user' && typeof msg.content === 'string' && namesBehavior === 2 && !msg.content.startsWith(userName)) {
                    msg.content = userName + ': ' + msg.content;
                }
            });
        }
        // 应用正则脚本到所有消息内容（prompt阶段）
        if (typeof RegexManager !== 'undefined') {
            messages.forEach(function(msg, idx) {
                if (msg.content && typeof msg.content === 'string') {
                    msg.content = RegexManager.apply(msg.content, 'prompt', idx);
                }
            });
        }

        // 注入越狱提示词（放在聊天历史之后、用户最新消息之前）
        if (gameState && gameState._jailbreakPrompt && gameState._jailbreakPrompt.trim()) {
            messages.splice(messages.length - 1, 0, {
                role: (gameState && gameState._jailbreakRole) || 'system',
                content: gameState._jailbreakPrompt
            });
        }
        // 注入 afterChat 提示词（放在聊天历史之后、越狱之后）
        // 用于每轮都提醒AI的关键信息（如格式要求、角色状态等）
        if (gameState && Array.isArray(gameState._afterChatPrompts) && gameState._afterChatPrompts.length > 0) {
            gameState._afterChatPrompts.forEach(function(acp) {
                if (acp && acp.content && acp.content.trim()) {
                    messages.splice(messages.length - 1, 0, {
                        role: acp.role || 'system',
                        content: acp.content
                    });
                }
            });
        }

        // 根因：system prompt 中的完整格式要求位于消息列表开头，随着聊天历史增长，
        // AI 的注意力被近期对话吸引，丢失输出格式要求，导致返回纯文本而非结构化JSON。
        // 此注入位于消息列表末尾（紧贴用户消息前），确保 AI 生成前始终看到格式要求。
        // 连带修复 BUG-003/004/007/008/009/014（均由纯文本响应引发）。
        if (gameState && gameState.pureTextMode !== true) {
            var _curPlayerName = gameState.playerName || (gameState.playerData && gameState.playerData.name) || '';
            var _formatReminder = '【输出格式·必读】直接输出JSON（以 { 开头，以 } 结尾），禁止输出纯文本、思考过程或前缀说明。\n' +
                '必填字段：title(章节标题)、story(叙事正文,\\n换行,「」对话)、gameTime({date,time,period})、keyEvents(本回合关键事件数组)。\n' +
                '可选字段：choices([{id,text}])、player({name,identity,stats:[{label,value}]}——须包含完整属性数组)、characters([{name,title,relation,favorability,desc}])、bag、quests、world([聊天/论坛/排行榜/商店/日记/朋友圈/邮箱模块])。\n' +
                '注意：player.stats 必须返回完整属性数组（参考上一轮），不要返回空数组。characters.favorability 须根据剧情动态变化。';
            if (_curPlayerName) {
                _formatReminder += '\n主角姓名固定为「' + _curPlayerName + '」，不得更改。';
            }
            _formatReminder += '\n始终使用第二人称（"你"）叙事。';
            messages.splice(messages.length - 1, 0, {
                role: 'system',
                content: _formatReminder
            });
        }
        // 注入 assistant 角色的 prompt（以 assistant 角色注入）
        if (gameState && gameState._assistantPrompt && gameState._assistantPrompt.trim()) {
            messages.splice(messages.length - 1, 0, {
                role: 'assistant',
                content: gameState._assistantPrompt
            });
        }

        // 【酒馆兼容】assistant_prefill：在消息末尾追加一个assistant消息
        // 某些模型（如Gemini）需要prefill来引导输出格式
        if (gameState && gameState._assistantPrefill && gameState._assistantPrefill.trim()) {
            messages.push({ role: 'assistant', content: gameState._assistantPrefill });
        }

        // 【酒馆兼容】continue_prefill：继续生成时追加assistant消息引导输出
        // 与 assistant_prefill 不同：assistant_prefill 每次请求都生效，continue_prefill 只在"继续生成"时生效
        if (gameState && gameState._continuePrefill && gameState._continuePrefill.trim()) {
            messages.push({ role: 'assistant', content: gameState._continuePrefill });
        }

        // 【酒馆式智能上下文管理】
        // 酒馆核心策略：Prompt Size = Context Size - Max Response Length
        // 系统提示词/世界书/记忆 → 永远保留（permanent tokens）
        // 聊天历史 → 从最旧开始淘汰，直到不超预算
        // 参考：https://sillytavern.wiki/usage/common-settings/

        var contextSize = getContextSizeSafe();
        var maxTokens = (gameState && gameState.maxTokens) || DEFAULT_MAX_TOKENS;
        // 【ISSUE-B1 修复】max_tokens 不能超过 contextSize，否则 API 会拒绝或截断
        // 修复前：maxTokens=32768 但 contextSize=32000，导致预算计算失真
        maxTokens = Math.min(maxTokens, contextSize);
        // 酒馆公式：输入预算 = 上下文大小 - 输出预留
        // 【关键】AI的JSON回复需要3500-4000 tokens空间（story+choices+player+characters+bag+quests+world+gameTime等）
        // 预留不足会导致AI输出到一半被截断，JSON解析失败，残余`\n\n`被当纯文本渲染
        // 策略：宁可输入端紧凑一点，也要保证AI能输出完整JSON
        // 【ISSUE-B1 修复】输出预留上限由 maxTokens 改为 contextSize * 0.45，
        // 避免 maxTokens 远大于 contextSize 时预留过多导致输入预算不足
        var reservedForOutput = Math.min(Math.max(3000, Math.floor(contextSize * 0.45)), Math.floor(contextSize * 0.6));
        var maxInputTokens = contextSize - reservedForOutput;
        var currentTokens = estimateTokensForMessagesUtil(messages);
        if (currentTokens > maxInputTokens) {
            console.log('[智能上下文] 当前 ' + currentTokens + ' tokens，预算 ' + maxInputTokens + '（上下文' + contextSize + '-输出预留' + reservedForOutput + '），开始裁剪');
            
            // 第一阶段：先瘦身旧AI回复（比直接删除更省，保留story内容）
            var lastAssistantIdx = -1;
            for (let _laIdx = messages.length - 1; _laIdx >= 0; _laIdx--) {
                if (messages[_laIdx].role === 'assistant') { lastAssistantIdx = _laIdx; break; }
            }
            var slimmedCount = 0;
            for (let _slIdx = chatHistoryStart; _slIdx < messages.length && currentTokens > maxInputTokens; _slIdx++) {
                if (_slIdx === lastAssistantIdx) continue; // 不瘦身最新AI回复
                var _slMsg = messages[_slIdx];
                if (_slMsg.role === 'assistant' && _slMsg.content && !_slMsg._slimmed) {
                    var beforeLen = _slMsg.content.length;
                    var slimResult = _slimAssistantMessage(_slMsg.content);
                    if (slimResult !== _slMsg.content) {
                        var savedTokens = estimateTokensUtil(beforeLen - slimResult.length > 0 ? 'x'.repeat(beforeLen - slimResult.length) : '');
                        currentTokens -= savedTokens;

                        messages[_slIdx] = Object.assign({}, _slMsg, { content: slimResult, _slimmed: true });
                        slimmedCount++;
                    }
                }
            }
            if (slimmedCount > 0) {
                console.log('[智能上下文] 瘦身了 ' + slimmedCount + ' 条旧AI回复，当前 ' + currentTokens + ' tokens');
            }
            
            // 第二阶段：瘦身还不够，从最旧的聊天历史开始淘汰
            var removedCount = 0;
            var lastUserIdx = -1;
            for (let _rIdx = messages.length - 1; _rIdx >= 0; _rIdx--) {
                if (messages[_rIdx].role === 'user') { lastUserIdx = _rIdx; break; }
            }

            var protectedIdx = {};
            if (lastUserIdx > 0) {
                var prevIdx = lastUserIdx - 1;
                // 前一条如果是 assistant，再前一条如果是 user，都保护
                if (messages[prevIdx] && messages[prevIdx].role === 'assistant') {
                    protectedIdx[prevIdx] = true;
                    if (prevIdx - 1 >= 0 && messages[prevIdx - 1] && messages[prevIdx - 1].role === 'user') {
                        protectedIdx[prevIdx - 1] = true;
                    }
                }
            }
            for (let _rIdx2 = chatHistoryStart; _rIdx2 < messages.length && currentTokens > maxInputTokens; _rIdx2++) {
                if (_rIdx2 === lastUserIdx || protectedIdx[_rIdx2]) continue;
                var msg = messages[_rIdx2];
                if (msg._pinned) continue;
                if (msg.role === 'user' || msg.role === 'assistant') {
                    currentTokens -= estimateTokensUtil(msg.content || '') + 4;
                    messages.splice(_rIdx2, 1);
                    _rIdx2--;
                    removedCount++;
                    if (lastUserIdx > _rIdx2) lastUserIdx--;
                }
            }
            if (removedCount > 0) {
                console.log('[智能上下文] 淘汰了 ' + removedCount + ' 条历史消息，当前 ' + currentTokens + ' tokens');
            }
            // 【ISSUE-C1 修复】裁剪后仍超预算时，统计 system 注入占比并警告
            // depth 0-5 的 system 注入（世界书/预设）是 permanent tokens 不会被裁剪，
            // 长期游戏可能累积过多导致可用上下文不足
            if (currentTokens > maxInputTokens) {
                var _systemTokens = 0;
                for (let _si2 = 0; _si2 < chatHistoryStart; _si2++) {
                    if (messages[_si2] && messages[_si2].content) {
                        _systemTokens += estimateTokensUtil(messages[_si2].content) + 4;
                    }
                }
                console.warn('[智能上下文] 裁剪后仍超预算: ' + currentTokens + '/' + maxInputTokens
                    + '，system 注入约占 ' + _systemTokens + ' tokens（'
                    + Math.round(_systemTokens / maxInputTokens * 100) + '%），建议精简世界书/预设');
            }
        }

        // 流式偶发断流/空回时，自动降级避免用户看到半截JSON
        var _streamFailCount = (gameState && gameState.streamFailCount) || 0;
        var _useStreamNow = gameState && gameState.useStream && _streamFailCount < 2;
        var options = {
            stream: _useStreamNow,

            // 此前 options.temperature 来自 gameState.temperature，会覆盖 PresetManager 的值，导致预设温度不生效
            onChunk: function(delta, fullText) {
                onStreamChunk(delta, fullText);
            }
        };
        // 【JSON Schema strict 模式】仅在 JSON 模式（非 pureTextMode）下启用
        // 'auto' = 根据模型名自动选 strict（DeepSeek/OpenAI/通义）或 json_object（其他兼容 API）
        // 预设里手动配的 response_format 优先级更高（见 buildAIRequestBody），不会被覆盖
        // 纯文本模式不启用 schema，靠 <mem> 标签解析
        if (gameState && gameState.pureTextMode !== true) {
            options.jsonSchema = 'auto';
        }
        if (gameState && !_useStreamNow && _streamFailCount >= 2) {
            console.log('[流式降级] 连续失败' + _streamFailCount + '次, 本轮使用非流式');
        }
        // 触发事件：GENERATION_AFTER_COMMANDS（生成前，命令执行后）
        if (typeof TavernHelperCompat !== 'undefined') {
            TavernHelperCompat.emit('GENERATION_AFTER_COMMANDS', {
                messages: messages,
                options: options,
                timestamp: Date.now()
            });
        }

        // 移除请求超时限制，只要API本身不出错就无限等待
        var response;
        // 记录输入token数（按次计费玩家需要知道每次请求用了多少上下文）
        // 复用上方裁剪后的 currentTokens，不再重复计算
        var inputTokens = currentTokens;
        if (gameState) {
            gameState._lastInputTokens = inputTokens;
            gameState._lastContextUsage = Math.round(inputTokens / contextSize * 100);
        }
        console.log('[Token] 输入: ' + inputTokens + '/' + contextSize + ' (' + (gameState && gameState._lastContextUsage) + '%)');

        try {
            response = await callAI(messages, options);
        } catch (e) {


            if (e && e.name === 'AbortError') {
                if (!e.aborted) e.aborted = true;
                throw e;
            }
            throw e;
        }
        // 流式空回检测
        var parseResult = parseAIResponse(response);
        var data = parseResult.data;
        var storyText = parseResult.storyText;

        // [CoT] 提取并展示思维链（需在 stripThinking 之前从原始响应里拿）
        var cotMode = (StateManager ? StateManager.get('settings.cotMode') : '') || '';
        if (cotMode === 'enabled') {
            var cotText = (typeof ResponseParser !== 'undefined' && ResponseParser.extractThinking) ? ResponseParser.extractThinking(response) : '';
            if (cotText && typeof showCotPanel === 'function') showCotPanel(cotText);
            else if (typeof hideCotPanel === 'function') hideCotPanel();
        } else if (typeof hideCotPanel === 'function') {
            hideCotPanel();
        }

        // 【方案C】JSON Schema 解析失败时，尝试 StateTagParser 解析 <state> 块
        // 兼容 auto 路由模型等不支持 response_format 的场景
        // StateTagParser 从故事末尾的 <state>...</state> 块提取角色/物品/任务等结构化数据
        if (!parseResult.success && typeof StateTagParser !== 'undefined' && StateTagParser.parse) {
            var _stateResult = StateTagParser.parse(response);
            if (_stateResult.success) {
                console.log('[StateTagParser] 成功解析 <state> 块，提取到',
                    (_stateResult.data.characters || []).length, '个角色,',
                    (_stateResult.data.bag || []).length, '个物品,',
                    (_stateResult.data.quests || []).length, '个任务');
                // 用 StateTagParser 的结果覆盖 parseResult
                parseResult = {
                    data: _stateResult.data,
                    storyText: _stateResult.storyText,
                    mems: [],
                    truncated: false,
                    success: true  // 有结构化数据，标记成功让 AIResponseMutator 处理
                };
                data = parseResult.data;
                storyText = parseResult.storyText;
            }
        }


        // （direct JSON → code block → robust + 状态机 → <mem> tags → plain text）
        // 原 robustParse 与 ResponseParser._tryRobustJSON 重复，删除后此处不再需要二次兜底。
        // 保留 extractStr/extractArr 等状态机辅助函数，供 game.js 其他位置从纯文本提取字段。


        if (parseResult.truncated && data && storyText) {
            storyText = '⚠️ **AI回复可能被截断**（JSON不完整，部分字段可能缺失）\n\n' + storyText;
            if (gameState) gameState._lastTruncated = true;
        }


        if (data && typeof validateAIResponse === 'function') {
            var _validation = validateAIResponse(data);
            if (!_validation.valid) {
                console.warn('[sendAIRequest] AI 返回字段不完整，缺失:', _validation.missing.join(', '));
                if (gameState) gameState._lastValidationWarning = 'AI返回缺少字段：' + _validation.missing.join(', ');
            } else {
                if (gameState) gameState._lastValidationWarning = null;
                if (_validation.missing.length > 0) {
                    console.log('[sendAIRequest] AI 返回可选字段缺失:', _validation.missing.join(', '));
                }
            }
        }


        if (gameState && gameState.streamFailCount && storyText && storyText.trim().length > 0) {
            gameState.streamFailCount = 0;
        }


        //   1. CharacterMutator.mergeCharacters / BagMutator.mergeItems / QuestMutator.addQuest 被调用两次，
        //      第二次虽是幂等合并，但仍触发 StateManager.set → 重复订阅通知 + 重复 normalize 计算
        //   2. mergeRelationships 写 gameState.relationships + gm.tables 不在 transaction 内，
        //      AIResponseMutator 失败回滚时 legacy 写入不会回滚（状态不一致）
        //   3. _applyLocations 用 REPLACE 语义，legacy 文本提取也用 REPLACE 语义，
        //      两者互相覆盖（AI 显式返回的地名可能被文本提取的覆盖）
        // 现收敛：
        //   - _aiMutatorApplied=true：legacy 路径仅做 UI 渲染（renderNpcList/renderQuests/renderBag 等），
        //     不再二次写入 StateManager（消除双写）
        //   - _aiMutatorApplied=false：legacy 路径走完整状态写入做兜底（保证 AIResponseMutator 失败时玩家仍能看到数据）
        //   - _applyCharacters/_applyRelationships/_applyLocations 已补齐 legacy 等价逻辑
        //     （主角过滤、图谱格式处理、文本提取合并），跳过 legacy 不会丢失功能
        var _aiMutatorApplied = false;
        if (typeof AIResponseMutator !== 'undefined' && AIResponseMutator.apply && parseResult && parseResult.success) {
            try {
                // 【v3审查修复】apply() 内部 try-catch 失败时返回 { success: false } 而非抛异常
                // 原实现仅凭"未抛异常"就置 _aiMutatorApplied = true，导致后续 deleteLastTurn 误撤销
                var _mutatorResult = AIResponseMutator.apply(parseResult, { silent: true });
                _aiMutatorApplied = !!(_mutatorResult && _mutatorResult.success === true);
                if (_mutatorResult && Array.isArray(_mutatorResult.warnings) && _mutatorResult.warnings.length > 0) {
                    console.warn('[AIResponseMutator] 部分步骤告警:', _mutatorResult.warnings.join('; '));
                }
            } catch (e) {
                console.warn('[sendAIRequest] AIResponseMutator 应用失败:', e && e.message);
            }
        }

        // 【方案C】<mem>标签解析结果已由 AIResponseMutator.apply 在事务内消费（A3修复）
        // 不再在事务外重复应用，避免半写入和重复执行
        // 若 mutator 未消费（旧版兼容），则走兜底
        if (parseResult.mems && parseResult.mems.length > 0 && !(_mutatorResult && _mutatorResult.success)) {
            _applyMemsToGameState(parseResult.mems);
        }

        // 【BUG-001 修复】AIResponseMutator 已批量写入 StateManager 并触发订阅者
        // 让出主线程一次，让订阅者完成 UI 通知 + 浏览器绘制，再进入下面的 COT/UI 渲染链
        // 否则 COT 正则 + 18 字段 UI 渲染会与 StateManager 订阅连批，造成主线程长时间占用
        await new Promise(function(r) { setTimeout(r, 0); });

        // === COT（思维链）处理 ===
        // 从AI回复中提取 <ECoT>...</ECoT>、<thinking>...</thinking>、💭...💭 标签内容
        // 这些内容不显示给用户，但需要保存为 {{original}} 的值
        // 支持部分模型的 💭...💭 格式（自动解析）
        // 【增强】支持更多思维链标签格式
        // <thinking>...</thinking>, <ECoT>...</ECoT>, 💭...💭
        // 💭...💭, <cot>...</cot>, <reasoning>...</reasoning>
        // <chain_of_thought>...</chain_of_thought>
        //
        // 【增强】同时支持推理模型的 reasoning_content 字段（DeepSeek-R1 / Kimi / auto 等）
        // 流式模式由 core.js executeAIStream 累积到 window._lastReasoningText，
        // 非流式由 executeAINormal 透出。这里把"标签式 CoT"+"字段式 reasoning"合并渲染。
        var cotMatches = [];
        var cleanStoryText = storyText;
        // 提取所有COT内容
        // 【P0 根因修复】用线性时间扫描器替代 safeRegexExecAll(_reCotTags, ...)
        // 原正则 [\s\S]+? 配合 gi 标志在未闭合标签上触发灾难性回溯，冻结主线程数分钟
        // 新实现 scanPairedTags 复杂度严格 O(n)，使用 indexOf 线性搜索，无回溯
        var _cotThinkingTags = (typeof OutputSanitizer !== 'undefined' && OutputSanitizer.THINKING_TAGS)
            ? OutputSanitizer.THINKING_TAGS : [];
        var _cotExecMatches = (typeof scanPairedTags !== 'undefined' && _cotThinkingTags.length > 0)
            ? scanPairedTags(storyText, _cotThinkingTags, 'extract')
            : [];
        // 同时提取 💭...💭 格式（线性扫描，无回溯）
        var _cotMarkerMatches = (typeof scanMarkerPairs !== 'undefined')
            ? scanMarkerPairs(storyText, '💭', 'extract')
            : [];
        for (var _ci = 0; _ci < _cotExecMatches.length; _ci++) {
            var cotContent = (_cotExecMatches[_ci].content || '').trim();
            if (cotContent) {
                cotMatches.push(cotContent);
            }
        }
        for (var _mi = 0; _mi < _cotMarkerMatches.length; _mi++) {
            var cotMarkerContent = (_cotMarkerMatches[_mi].content || '').trim();
            if (cotMarkerContent) {
                cotMatches.push(cotMarkerContent);
            }
        }
        // 合并标签式 CoT 和 reasoning_content 字段透出值
        var _reasoningFromField = '';
        try {
            if (typeof window !== 'undefined' && window._lastReasoningText) {
                _reasoningFromField = String(window._lastReasoningText).trim();
            }
        } catch (e) {}
        var _hasAnyCot = cotMatches.length > 0 || _reasoningFromField.length > 0;
        // 从storyText中移除COT标签（不显示给用户）
        if (cotMatches.length > 0) {
            // 【P0 根因修复】用线性时间扫描器替代 safeRegexApply(_reCotTags, ...)
            var _cotAllTags = _cotThinkingTags.slice();
            cleanStoryText = storyText;
            if (typeof stripPairedTags !== 'undefined' && _cotAllTags.length > 0) {
                cleanStoryText = stripPairedTags(cleanStoryText, _cotAllTags);
            }
            if (typeof scanMarkerPairs !== 'undefined') {
                cleanStoryText = scanMarkerPairs(cleanStoryText, '💭', 'strip');
            }
            cleanStoryText = cleanStoryText.trim();
            // 保存原始内容（含COT）供 {{original}} 宏使用
            if (gameState) gameState._lastOriginalContent = storyText;
        }
        // 合并所有思维链内容供调试查看 / 面板展示
        if (_hasAnyCot) {
            var _allCotParts = cotMatches.slice();
            if (_reasoningFromField) _allCotParts.push(_reasoningFromField);
            var _mergedCot = _allCotParts.join('\n---\n');
            if (gameState) gameState._lastCotContent = _mergedCot;
            console.log('[COT] 提取到思维链内容:', cotMatches.length, '段标签 +', _reasoningFromField ? 1 : 0, '段 reasoning_content');
            // 【P2 CoT 面板】渲染到可折叠面板
            // 受设置项 showCotPanel 控制（默认开启，可在设置中关闭）
            if (typeof renderCotPanel === 'function') {
                var _showCot = true;
                try {
                    if (typeof gameState !== 'undefined' && gameState && gameState.showCotPanel === false) {
                        _showCot = false;
                    }
                } catch (e) {}
                if (_showCot) {
                    renderCotPanel(_mergedCot);
                } else {
                    renderCotPanel('');
                }
            }
        } else {
            // 无 CoT 内容时隐藏面板
            if (typeof renderCotPanel === 'function') {
                renderCotPanel('');
            }
        }
        // 【v3审查修复】清理未闭合的思考标签（被 max_tokens 截断，无闭标签）
        // 由 OutputSanitizer.THINKING_TAGS 动态构建正则，新增标签无需改此处
        // [T1-P1-9] fallback 改空数组（按报告建议），OutputSanitizer 未加载时不做 CoT 检测更安全
        var _cotTags = (typeof OutputSanitizer !== 'undefined' && OutputSanitizer.THINKING_TAGS)
            ? OutputSanitizer.THINKING_TAGS : [];
        cleanStoryText = cleanStoryText.replace(new RegExp('<(?:' + _cotTags.join('|') + ')>[\\s\\S]*$', 'gi'), '').trim();
        // 【NEW-014 修复】清理未闭合的角色内心独白标签：<角色名：...> 未找到 > 时转为纯文本
        // AI 尝试生成 <角色名：心理活动> 但被 max_tokens 截断，末尾残留 <xxx：
        // 方案：行尾/文末的 <后跟非标准标签名+：且无 > 闭合的，移除 <
        cleanStoryText = cleanStoryText.replace(/<([^>:\s<>]{1,20}：[^<>]*)$/gm, function(_m, inner) {
            // 保留内心独白内容，只去掉孤立的 <
            return inner;
        }).trim();
        // 用清理后的文本替换storyText
        if (cleanStoryText !== storyText) {
            storyText = cleanStoryText;
        }
        // === AI记忆编辑标签解析 ===
        // AI 可通过 <mem> 标签主动更新记忆，比正则提取更可靠
        if (typeof GameMemory !== 'undefined' && GameMemory.parseAIEditTags) {
            var memResult = GameMemory.parseAIEditTags(storyText);
            if (memResult && memResult.cleanedText !== storyText) {
                storyText = memResult.cleanedText;
            }
        }


        // 这样即使COT清理后变空也能被捕获
        if (!storyText || storyText.trim() === '') {
            console.warn('[AI生成] 剧情文本为空，可能原因：1) max_tokens过小 2) 模型异常 3) 内容被过滤 4) COT占用了全部额度');

            if (gameState && _useStreamNow) {
                gameState.streamFailCount = (_streamFailCount || 0) + 1;
                console.log('[流式降级] 失败计数: ' + gameState.streamFailCount + '/2');
            }
            // 尝试从原始response中提取任何可读文本作为兜底
            if (response && typeof response === 'string' && response.trim().length > 0) {
                // 如果原始响应有内容但storyText为空，说明解析可能有问题
                // 尝试直接显示清理后的原始响应（去掉JSON标记和COT）
                // 【ReDoS 修复】用 stripCodeBlocks 线性扫描替代 /```json[\s\S]*?```/g
                var _cleanedRaw = (typeof stripCodeBlocks === 'function')
                    ? stripCodeBlocks(response, 'json')
                    : response.replace(/```json[\s\S]*?```/g, '');
                _cleanedRaw = (typeof OutputSanitizer !== 'undefined' && OutputSanitizer.stripThinking)
                    ? OutputSanitizer.stripThinking(_cleanedRaw)
                    : ((typeof scanMarkerPairs === 'function')
                        ? scanMarkerPairs(_cleanedRaw, '💭', 'strip')
                        : _cleanedRaw.replace(/💭[\s\S]*?💭/g, ''));
                var cleanedRaw = _cleanedRaw.replace(/"story"\s*:\s*""/g, '').trim();

                var isRawSSE = cleanedRaw.indexOf('data:') !== -1 && cleanedRaw.indexOf('"object"') !== -1;
                if (cleanedRaw && cleanedRaw.length > 10 && !isRawSSE) {
                    storyText = '【AI返回异常，原始响应如下】\n' + cleanedRaw.substring(0, 500);
                    console.log('[AI生成] 已提取原始响应作为兜底');
                }
            }
            if (!storyText || storyText.trim() === '') {
                storyText = '【AI未返回剧情内容】\n\n可能原因：\n1. max_tokens设置过小，思考链占用了全部额度\n2. 模型暂时异常，请重试\n3. 上下文过长导致生成空间不足\n\n建议：检查API设置中的max_tokens（建议≥1024），或尝试切换模型。';
            }
        }
        // 渲染非剧情部分
        // 【方案C】纯文本模式下，AI不输出JSON时，根据story末段自动生成3个选项
        if (data) {
            if (data.hud) renderHUD(data.hud);
            if (data.choices) renderChoices(data.choices);
            if (data.player) renderPlayerStats(data.player);

            // _doLegacyStateWrites：_aiMutatorApplied=true 时跳过 legacy 状态写入（仅 UI），
            //                       false 时走完整 legacy 路径做兜底（保证 mutator 失败时玩家仍能看到数据）
            // 注意：renderWorldModules 本身是 ui.worldModules 的唯一写入点（无对应 mutator），始终运行
            //       rescue chars 数据源不同于 AIResponseMutator，始终运行（非双写）
            var _doLegacyStateWrites = !_aiMutatorApplied;
            if (data.characters) {
                if (_doLegacyStateWrites) mergeCharacters(data.characters);
                else renderNpcList();  // AIResponseMutator 已写 entities.characters，仅刷新 UI
            }
            // 更新章节标题（如果有）
            var _aiTitleReset = false;
            if (data.title || data.scene) {
                var incomingTitle = data.title || data.scene;

                // 说明模型可能 confused 回退了，沿用上一回合标题或回合递增标题
                var userPrompt = StateManager ? StateManager.get('world.userPrompt') : (gameState && gameState.userPrompt);
                if (userPrompt && _looksLikeInitialScene(incomingTitle, userPrompt)) {
                    _aiTitleReset = true;
                    var preTitle = StateManager ? StateManager.get('progress.preAIState.title') : (gameState._preAIState && gameState._preAIState.title);

                    // 旧实现使用旧 turn，导致初始生成显示"第 0 回合"（应为"第 1 回合"）
                    var turnNumC = StateManager ? StateManager.get('progress.turn') : ((gameState._stats && gameState._stats.totalTurns) || 0);
                    turnNumC = (turnNumC || 0) + 1;
                    incomingTitle = preTitle || ('第 ' + turnNumC + ' 回合');
                    console.warn('[标题防御] AI 返回标题疑似初始场景，已沿用旧标题:', incomingTitle);
                }
                updateSceneTitle(incomingTitle);

                // StateManager._syncLegacyMirror 自动同步 _lastSceneTitle 旧字段
                if (typeof StateManager !== 'undefined' && StateManager.set) {
                    StateManager.set('progress.sceneTitle', incomingTitle, { silent: true });
                }
            } else if (gameState && storyText && storyText.trim()) {


                var turnNum = StateManager ? StateManager.get('progress.turn') : ((gameState._stats && gameState._stats.totalTurns) || 0);
                turnNum = (turnNum || 0) + 1;
                var fallbackTurnTitle = '第 ' + turnNum + ' 回合';
                updateSceneTitle(fallbackTurnTitle);
                if (typeof StateManager !== 'undefined' && StateManager.set) {
                    StateManager.set('progress.sceneTitle', fallbackTurnTitle, { silent: true });
                }
            }
            // 保存HUD数据到gameState，确保读档后能恢复

            // AIResponseMutator._applyHUD 已 set('ui.lastHUD')，_syncLegacyMirror 自动同步到 _lastHUD
            // 兜底：就算AI没返回characters，也尝试从原文提取
            // 注意：rescue 始终运行（数据源不同于 AIResponseMutator，不属于双写范畴）
            if (!data.characters) {
                var rescuedChars = extractObjArr(response, 'characters');
                if (rescuedChars && rescuedChars.length > 0) {
                    mergeCharacters(rescuedChars);
                }
            }
            if (data.world) renderWorldModules(data.world);
            if (data.bag) {
                if (_doLegacyStateWrites) renderBag(data.bag);  // 状态写入 + UI
                else renderBag();  // AIResponseMutator 已写 entities.bag，仅刷新 UI（不传 items）
            }
            // === 任务系统 ===
            if (data.quests) {
                if (_doLegacyStateWrites) mergeQuests(data.quests);
                renderQuests();
            }
            // === 关系网 ===
            if (data.relationships) {
                if (_doLegacyStateWrites) mergeRelationships(data.relationships);
                renderRelationships();
            } else if (data.characters && typeof _inferRelationshipsFromCharacters === 'function') {

                // _aiMutatorApplied=true 时由 _applyRelationships 内部推断并写入，跳过 legacy 调用
                if (_doLegacyStateWrites) {
                    _inferRelationshipsFromCharacters();
                } else {
                    // _applyRelationships 已推断并写入 entities.relationships，仅刷新 UI
                    renderRelationships();
                }
            }

            // AIResponseMutator._applyContextSummary 已 set('progress.rollingSummary')，
            // _syncLegacyMirror 自动同步到 gameState.rollingSummary
            // 从 AI 返回的 title/story 中提取地点

            // 跳过 legacy 文本提取（避免 REPLACE 语义覆盖 mutator 的 MERGE 结果）
            if (_doLegacyStateWrites && StateManager && (data.title || storyText)) {
                var extractedLocations = (typeof EnhancedMemory !== 'undefined' && EnhancedMemory._extractLocations)
                    ? EnhancedMemory._extractLocations(String(data.title || '') + ' ' + String(storyText || ''))
                    : [];
                if (extractedLocations.length > 0) {
                    // [CP-03] 改走 LocationMutator.mergeLocations。
                    //   旧实现两个问题：
                    //     1) REPLACE 语义（StateManager.set 全量覆盖）覆盖用户累积的 locations 数据
                    //     2) _extractLocations 返回字符串数组，直接 set 会把 entities.locations 变成
                    //        字符串数组，破坏 schema（LocationMutator 等读 .name 全部失败）
                    //   新实现：转 {name, desc:''} 对象 → MERGE 语义 → 不丢用户编辑
                    if (typeof LocationMutator !== 'undefined' && LocationMutator.mergeLocations) {
                        var normalized = extractedLocations.map(function(loc) {
                            return typeof loc === 'string' ? { name: loc.trim(), desc: '' } : loc;
                        });
                        try {
                            LocationMutator.mergeLocations(normalized, { silent: true });
                        } catch (e) {
                            console.error('[legacy] LocationMutator.mergeLocations 异常:', e);
                        }
                    } else {
                        // legacy 兜底（无 LocationMutator 时退化为对象数组再 set，至少不破坏 schema）
                        var normalizedLegacy = extractedLocations.map(function(loc) {
                            return typeof loc === 'string' ? { name: loc.trim(), desc: '' } : loc;
                        });
                        StateManager.set('entities.locations', normalizedLegacy, { silent: true });
                    }
                }
            }
        }

        // 时间系统：从AI返回的JSON中解析gameTime字段（纯文本模式下 data 为 null 也尝试更新UI）

        // 【BUG-001 深度修复】在 18 字段 UI 渲染（renderBag/renderQuests/renderRelationships/
        // renderWorldModules）与时间系统/标题/选项之间插入让步点。
        // 18 字段 UI 渲染会触发 StateManager 订阅者批量更新 DOM，紧接的时间解析 + 标题更新 +
        // 选项生成（含 _generateAutoChoices 正则）会堆积同步任务。让步一次让浏览器绘制 UI。
        await new Promise(function(r) { setTimeout(r, 0); });
        if (typeof GameTimeSystem !== 'undefined') {
            var _preGameTime = StateManager ? StateManager.get('progress.preAIState.gameTime') : (gameState && gameState._preAIState && gameState._preAIState.gameTime);
            if (_aiTitleReset && _preGameTime) {
                var restoredTime = StateSchema.deepClone(_preGameTime);

                // TimeMutator 单调性校验。StateManager/TimeMutator 是必加载层，不可用时抛错。
                if (StateManager && TimeMutator) {
                    TimeMutator.setTime(restoredTime, { silent: true });
                } else {
                    throw new Error('[时间防御] TimeMutator/StateManager 未加载，无法回退时间');
                }
                console.warn('[时间防御] AI 标题疑似回退，已沿用上一回合时间:', restoredTime);
            } else {
                GameTimeSystem.parseFromAI(data);
            }
            GameTimeSystem.updateUI();
        }

        // AI 没有返回章节标题时，用回合数作为兜底标题
        // 【BUG-002 深度修复】原逻辑用 userPrompt.substring(0,20) 作兜底标题，
        // 但当 JSON 后处理冻结导致 JSON 截断时 data 为 null，标题块（line 1993）被跳过，
        // 此处兜底会把标题设为用户原始输入（"我想玩西方奇幻游戏..."），误导用户以为标题未更新。
        // 改为用"第 N 回合"作兜底，语义清晰且不会被误认为 AI 标题。
        if (gameState && !StateManager.get('progress.sceneTitle')) {
            var _fbTurn = StateManager ? (StateManager.get('progress.turn') || 0) : ((gameState._stats && gameState._stats.totalTurns) || 0);
            var fallbackTitle = '第 ' + (_fbTurn + 1) + ' 回合';
            console.log('[BUG-002] 正常路径标题兜底触发, sceneTitle was empty, 设置为:', fallbackTitle);
            updateSceneTitle(fallbackTitle);
            if (typeof StateManager !== 'undefined' && StateManager.set) {
                StateManager.set('progress.sceneTitle', fallbackTitle, { silent: true });
            }
        }

        // 【方案C】AI没输出choices时，基于story末段自动生成3个选项
        // ResponseParser 失败时 schema 默认返回 choices: []，导致自动生成永远不触发，回合 0 选项
        if (gameState && gameState.generateChoices !== false && (!data || !data.choices || data.choices.length === 0)) {
            // 先尝试从原文正则提取 choices
            var rescuedChoices = extractObjArr(response, 'choices') || extractArr(response, 'choices');
            if (rescuedChoices && rescuedChoices.length > 0) {
                renderChoices(rescuedChoices);
                data = data || {};
                data.choices = rescuedChoices;
            } else {
                // 再尝试基于story末段自动推断
                var autoChoices = _generateAutoChoices(storyText, gameState._lastChoices);
                if (autoChoices && autoChoices.length > 0) {
                    renderChoices(autoChoices);
                    data = data || {};
                    data.choices = autoChoices;
                } else {
                    // 最终兜底：渲染硬编码默认选项（与原版一致）
                    renderChoices([
                        { id: 'A', text: '继续探索' },
                        { id: 'B', text: '观察四周' },
                        { id: 'C', text: '等待观望' }
                    ]);
                }
            }
        }

        if (data && data.choices && gameState) {
        // 【BUG-001 深度修复】在选项渲染后、记忆提取/snapshot/快照前插入让步点。
        // 选项渲染（renderChoices）+ _generateAutoChoices 正则会累积同步任务，
        // 紧接的记忆提取（虽已延迟）+ 货币系统 + keyEvents + snapshot 也会堆积。
        // 让步一次让选项 UI 先绘制。
        await new Promise(function(r) { setTimeout(r, 0); });
            gameState._lastChoices = data.choices.map(function(c) {
                return typeof c === 'string' ? c : (c && c.text) || '';
            });
        }

        // 处理增强记忆
        if (typeof EnhancedMemory !== 'undefined') {

            // 旧代码把 data 当第二个参数传入，导致 gameData 始终为空，地点/事件/角色无法提取

            // 【ISSUE-B2 修复】storyText 为空时（JSON 解析失败），response 是完整 JSON 字符串，
            // 直接传给 processMessage 会从 JSON 字段名/值中误提取地点/事件/角色，污染记忆系统。
            // 修复：storyText 为空时跳过记忆提取，避免误提取
            var assistantContent = storyText && String(storyText).trim() ? String(storyText) : '';
            if (assistantContent) {
                // 【BUG-001 深度修复】将记忆提取延迟到下一 tick 执行。
                // processMessage 内部串行执行 10+ 步骤（parseAIEditTags/_extractImportantInfo/
                // _updateTables/_updateSummaryLayers/_updateDormantStatus...），且每步会遍历全部
                // 角色/物品/事件，内部多次调用 saveToStorage（同步 JSON.stringify 整个 GameMemory）。
                // 这是后处理链中最重的操作，但记忆提取不需要在故事显示前完成，延迟不影响用户体验。
                // 闭包捕获必要变量，避免后续代码修改 data/storyText 影响延迟执行
                var _memContent = assistantContent;
                var _memData = data || {};
                setTimeout(function() {
                    try {
                        EnhancedMemory.processMessage('assistant', _memContent, _memData);
                    } catch (e) {
                        console.warn('[EnhancedMemory] 延迟记忆提取失败:', e && e.message);
                    }
                }, 0);
            } else {
                console.warn('[EnhancedMemory] storyText 为空，跳过记忆提取避免从 JSON 误提取');
            }
        }
        // 成就系统检查
        if (typeof AchievementSystem !== 'undefined' && AchievementSystem.checkAchievements) {
            try { AchievementSystem.checkAchievements(); } catch (e) {}
        }

        if (data) {
            // === 货币系统 ===

            // 原代码三条路径并存：① StateManager 可用走 set；② 不可用走 gameState.currency 直写；
            // ③ 故事文本兜底提取 reconcileFromStory 后又走 set + gameState.currency 双写。
            // 现统一为：所有写入走 StateManager.set，由 _syncLegacyMirror 自动同步到 gameState.currency。
            // StateManager 在 StateManager.init 后始终可用（init.js:25 在 DOMContentLoaded 早期调用），
            // 此处仅作最小防御：StateManager 缺失时抛错而非静默双写。

            // 已写 entities.currency/currencyName，此处跳过避免双写。
            // 同时跳过 reconcileFromStory 兜底：mutator 已应用时 AI 显式值优先（reconcile 会用故事文本
            // 二次加减覆盖 AI 值，可能双计数）。reconcile 仅在 mutator 未应用（fallback 路径）时执行。
            if (gameState && (data.currency !== undefined || data.currencyName)) {
                if (_doLegacyStateWrites) {
                    if (typeof StateManager === 'undefined' || !StateManager.set) {
                        throw new Error('[货币] StateManager 未加载，无法写入');
                    }
                    if (data.currency !== undefined) {
                        StateManager.set('entities.currency', Number(data.currency) || 0, { silent: true });
                    }
                    if (data.currencyName) {
                        StateManager.set('entities.currencyName', data.currencyName, { silent: true });
                    }

                    if (storyText && typeof storyText === 'string') {

                        var currentBalance = (typeof CurrencyMutator !== 'undefined')
                            ? CurrencyMutator.get()
                            : (parseFloat(StateManager.get('entities.currency')) || 0);
                        var recon = CurrencyReconciler.reconcileFromStory(storyText, currentBalance);
                        if (recon.changed) {
                            StateManager.set('entities.currency', recon.balance, { silent: true });
                            console.log('[货币兜底] 从故事文本提取金额:', recon.balance, recon.changes);
                        }
                    }
                }
                // else: AIResponseMutator._applyCurrency 已写 entities.currency/currencyName，跳过
            }
            // === 新增：提取并累积重要事件 ===

            // 已通过 gm.addImportantEvents 写入（含 turn/gameTime/importance/decayScore 完整字段 + 去重），
            // 此处再调 gm.addImportantEvents 虽被去重兜底（同 content 不重复添加），但冗余且 legacy 硬编码
            // importance:7 与 mutator 的 importance:5（默认）不一致，跳过避免语义混淆。
            if (data.keyEvents && Array.isArray(data.keyEvents)) {
                if (_doLegacyStateWrites) {
                    // 【H3修复】统一走 gm.addImportantEvents 批量入口
                    // 旧代码直接 push 到 gameState.keyEvents（字符串数组）+ 手动 slice(-30) + _pushKeyEventsToGM，
                    // 与 gm.events（对象数组）schema 冲突，且不触发 saveToStorage
                    var _gm = (typeof window !== 'undefined') ? window.GameMemory : null;
                    if (_gm && _gm.addImportantEvents) {
                        var _keyEventObjs = data.keyEvents
                            .filter(function(evt) { return evt && typeof evt === 'string' && evt.trim().length > 0; })
                            .map(function(evt) { return { content: evt.trim(), importance: 7 }; });
                        if (_keyEventObjs.length > 0) {
                            // 【BUG-001 深度修复】延迟到下一 tick，避免 O(n·m) 去重 + 同步 saveToStorage 阻塞主线程
                            var _evtsToAdd = _keyEventObjs;
                            setTimeout(function() {
                                try { _gm.addImportantEvents(_evtsToAdd); } catch (e) { console.warn('[keyEvents]', e); }
                            }, 0);
                        }
                    }

                }
                // else: AIResponseMutator._applyKeyEvents 已写入，跳过
            }
            // === 新增：保存世界状态快照 ===

            // 旧实现 `var snapshot = {}` 用 REPLACE 语义整体覆盖，会擦除 _parseStructuredSummary
            // (game.js:2465) 写入的 summary/lastUpdate 字段，导致下一轮 AI 回合这些字段丢失。

            // 不再从 AI 原始 data.player / gameState.allCharacters 直接取。
            // 旧实现 worldSnapshot.player = data.player（AI 原始），但 mutator 可能 normalize
            // （过滤空 stats、补全缺失字段、锁定主角名），导致 worldSnapshot 与 entities 不一致。
            // 30+ 处读取 worldSnapshot 的代码（phone-ui/tavern-compat/macro-engine）现与
            // entities 数据源统一，消除双数据源分裂风险。
            var snapshot = (typeof StateManager !== 'undefined' && StateManager.get) ? (StateManager.get('ui.worldSnapshot') || {}) : {};
            // player 从 entities 派生（mutator normalize 后的权威值）
            if (typeof StateManager !== 'undefined' && StateManager.get) {
                var _entPlayer = StateManager.get('entities.player');
                if (_entPlayer && _entPlayer.name) snapshot.player = _entPlayer;
            }
            if (data.hud) snapshot.hud = data.hud;
            if (data.bag) snapshot.bag = data.bag;
            if (gameState && gameState.currentQuests && gameState.currentQuests.length > 0) {
                snapshot.quests = gameState.currentQuests;
            }
            // characters 从 entities 派生（mutator 处理后的权威值，含主角过滤）
            if (typeof StateManager !== 'undefined' && StateManager.get) {
                var _entChars = StateManager.get('entities.characters');
                if (Array.isArray(_entChars) && _entChars.length > 0) {
                    snapshot.characters = _entChars.map(function(c) {
                        return {
                            name: c.name,
                            title: c.title || '',
                            relation: c.relation || '',
                            favorability: c.favorability || 0
                        };
                    });
                }
            }
            if (Object.keys(snapshot).length > 0 && typeof StateManager !== 'undefined' && StateManager.set) {
                StateManager.set('ui.worldSnapshot', snapshot, { silent: true });
            }
        }
        // 处理NPC主动消息
        if (data && data.npcMessages && Array.isArray(data.npcMessages) && data.npcMessages.length > 0) {
            if (gameState) {
                if (!gameState._chatLogs || Array.isArray(gameState._chatLogs)) gameState._chatLogs = {};
                data.npcMessages.forEach(function(msg) {
                    if (msg.from && msg.text) {
                        if (!gameState._chattedNpcs) gameState._chattedNpcs = {};
                        gameState._chattedNpcs[msg.from] = true;
                        if (!gameState._chatLogs[msg.from]) gameState._chatLogs[msg.from] = [];
                        gameState._chatLogs[msg.from].push({
                            role: 'npc',
                            text: msg.text,
                            time: new Date().toLocaleTimeString()
                        });

                        if (gameState._chatLogs[msg.from].length > 50) {
                            gameState._chatLogs[msg.from] = gameState._chatLogs[msg.from].slice(-50);
                        }
                        showNpcMessageNotification(msg.from, msg.text);
                    }
                });
                autoSave();
            }
        }
        // 刷新通知中心红点
        // 剧情推入打字机
        // 【防御】finalStory 必须始终是字符串
        var finalStory = '';
        try {
            finalStory = (storyText && typeof storyText === 'string' && storyText.trim()) ? storyText : (response || '');
            if (typeof finalStory !== 'string') finalStory = String(finalStory || '');
        } catch (e) {
            finalStory = response || '';
            if (typeof finalStory !== 'string') finalStory = String(finalStory || '');
        }
        // BUG-A2 修复：模型可能把无标签思考过程写入 JSON 的 story 字段，
        // 流式阶段已把脏文本推入打字机。此处对最终文本再次清洗；
        // 若清洗后变短，立即重置打字机，用干净文本重新渲染。
        var _rawFinalStory = finalStory;
        if (typeof OutputSanitizer !== 'undefined' && OutputSanitizer.sanitizeStory) {
            try {
                finalStory = OutputSanitizer.sanitizeStory(finalStory);
            } catch (e) {
                console.warn('[sendAIRequest] sanitizeStory 异常，使用原文:', e && e.message);
            }
        }
        if (finalStory.length < _rawFinalStory.length) {
            // 必须同时清空 displayed，否则 TypewriterBuffer.push 会从脏文本末尾继续，
            // 导致清洗后的文本无法覆盖已显示的推理内容。
            TypewriterBuffer.stop();
            TypewriterBuffer.displayed = '';
            TypewriterBuffer.queue = '';
        }
        // 【BUG-001 修复】让出主线程一次，让前面 AIResponseMutator / UI 渲染的累积工作先绘制到屏幕
        // 否则下面 RegexManager.apply + formatStory 会继续堆积同步任务，触发长时间卡顿
        await new Promise(function(r) { setTimeout(r, 0); });

        // 对最终story文本也应用输出端正则，确保与流式显示一致
        // 【BUG-001 修复】defer 到 requestIdleCallback，长正则链不阻塞打字机启动
        // 失败/无 idle 支持时降级为同步执行，保证功能正确
        if (typeof RegexManager !== 'undefined') {
            try {
                finalStory = RegexManager.apply(finalStory, 'output');
            } catch (e) {
                console.warn('[sendAIRequest] RegexManager.apply 异常，跳过:', e && e.message);
            }
        }
        // 【BUG-001 深度修复】在 RegexManager.apply 与 formatStory 之间插入让步点。
        // 两个重正则操作紧挨执行会堆积 30-60 秒同步任务（RegexManager 全量正则 + formatStory
        // 6+ 正则 + DOM 查询），中间让步一次让浏览器有机会响应交互和绘制。
        await new Promise(function(r) { setTimeout(r, 0); });
        // 【P1-5 修复】保存最新 AI 回复到 _lastAIReply，供未来扩展（如宏引用、调试、续写参考）
        // 原实现仅声明 _lastAIReply: null 但从未写入，导致字段恒为 null
        if (gameState) {
            gameState._lastAIReply = finalStory;
        }
        // 【BUG-006 修复】onComplete 与下方 isFinished() 分支会双重调用 formatStory
        // 长文本路径（>4000字）push 内部直接触发 onComplete，然后 isFinished() 再次调用 formatStory
        // 用 _finalRendered 标志确保只渲染一次
        var _finalRendered = false;
        var _doFinalRender = function() {
            if (_finalRendered) return;
            _finalRendered = true;
            try {
                if (TypewriterBuffer.cleanCursor) TypewriterBuffer.cleanCursor();
                var st = document.getElementById('storyText');
                if (st) st.innerHTML = formatStory(finalStory);
                _hideSkipButton();
            } catch (e) {
                console.warn('[sendAIRequest] 最终渲染异常:', e && e.message);
            }
        };
        // 先设置 onComplete 回调（在 push 之前，防止时序竞争）
        TypewriterBuffer.onComplete = function() {
            _doFinalRender();
        };
        // 流式模式下 onStreamChunk 已经在逐步推送了，
        // 这里只需要确保最终完整文本被推送（处理流式解析可能遗漏的尾部内容）。
        // 如果打字机已经在打字且 displayed 已包含 finalStory 的内容，则跳过重复推送。
        var alreadyDisplayed = TypewriterBuffer.displayed.length + TypewriterBuffer.queue.length;
        if (finalStory.length > alreadyDisplayed) {
            TypewriterBuffer.push(finalStory);
        }
        // 如果打字机已完成，直接最终渲染（仅当 onComplete 未触发时才执行）
        if (TypewriterBuffer.isFinished() && !_finalRendered) {
            _doFinalRender();
        }

        // 旧实现只依赖 TypewriterBuffer.onComplete 清理光标，但若打字机因故卡住
        // （如 pause 后未 resume、异常退出）onComplete 不会触发，光标会永久残留
        // 此安全网在 30 秒后无条件调用 cleanCursor，覆盖所有卡死场景
        // 【v3审查修复】原实现裸 setTimeout 未保存 timer ID，连续多回合会累积多个
        //   定时器，且新回合开始时无法清理旧定时器，导致光标被误清。
        //   现统一用 TimerManager（固定 ID 'cursorSafety'），可被统一清理
        TimerManager.clearTimeout('cursorSafety');
        TimerManager.setTimeout('cursorSafety', function() {
            try {
                if (typeof TypewriterBuffer !== 'undefined' && TypewriterBuffer.cleanCursor) {
                    TypewriterBuffer.cleanCursor();
                }
            } catch (e) { /* 忽略 */ }
        }, 30000);
        // 记录
        // storyHistory 已合并到 conversationHistory，不再单独存储
        
        // 更新统计数据
        if (!gameState) return;

        // StateManager._syncLegacyMirror 会自动同步 _stats.totalTurns 旧字段
        if (StateManager) {
            var currentTurn = StateManager.get('progress.turn') || 0;
            StateManager.set('progress.turn', currentTurn + 1, { silent: true });
            _turnIncremented = true; // 【BG-004 修复】标记正常路径已递增
        } else {
            // 兜底：StateManager 不可用时直接写 gameState._stats
            if (!gameState._stats) gameState._stats = {};
            gameState._stats.totalTurns = (gameState._stats.totalTurns || 0) + 1;
            _turnIncremented = true; // 【BG-004 修复】标记正常路径已递增
        }

        // 旧实现递增后未刷新 UI，storySceneLabel 仍显示旧回合数，玩家感觉"回合数没动"
        if (typeof updateTurnLabel === 'function') updateTurnLabel();


        var outputTokens = response ? estimateTokensUtil(response) : 0;
        gameState._stats.totalTokens = (gameState._stats.totalTokens || 0) + outputTokens;
        if (outputTokens > (gameState._stats.maxTokensInTurn || 0)) {
            gameState._stats.maxTokensInTurn = outputTokens;
        }
        var charCount = Object.keys(gameState.allCharacters || {}).length;
        if (charCount > (gameState._stats.totalCharacters || 0)) {
            gameState._stats.totalCharacters = charCount;
        }
        // 兜底提取摘要
        if (!data || !data.contextSummary) {
            var extractedSummary = extractStr(response, 'contextSummary');
            if (extractedSummary && typeof StateManager !== 'undefined' && StateManager.set) {
                StateManager.set('progress.rollingSummary', extractedSummary, { silent: true });
            }
        }
        // 兜底提取keyEvents
        if (!data || !data.keyEvents) {
            var extractedEvents = extractArr(response, 'keyEvents');
            if (extractedEvents && extractedEvents.length > 0) {
                // 【H3修复】统一走 gm.addImportantEvents 批量入口
                var _gm2 = (typeof window !== 'undefined') ? window.GameMemory : null;
                if (_gm2 && _gm2.addImportantEvents) {
                    var _keyEventObjs2 = extractedEvents
                        .filter(function(evt) { return evt && evt.trim().length > 0; })
                        .map(function(evt) { return { content: evt.trim(), importance: 7 }; });
                    if (_keyEventObjs2.length > 0) {
                        // 【BUG-001 深度修复】延迟到下一 tick，避免 O(n·m) 去重 + 同步 saveToStorage 阻塞主线程
                        var _evtsToAdd2 = _keyEventObjs2;
                        setTimeout(function() {
                            try { _gm2.addImportantEvents(_evtsToAdd2); } catch (e) { console.warn('[pushKeyEvents] 兜底同步失败:', e); }
                        }, 0);
                    }
                }
            }
        }

        // 用户明确关闭选项生成时，渲染空选项
        if ((!data || !data.choices) && gameState && gameState.generateChoices === false) {
            renderChoices([]);
        }
        // 存历史（存储清理后的story文本，减少token浪费）

        // AI 通过 in-context learning 模仿历史格式输出纯文本，削弱 BUG-001 修复效果
        // （format reminder 要求JSON，但历史里全是纯文本反例，弱模型会跟随反例）。
        // 改为：JSON模式存精简JSON（{title,story,choices}），让历史始终是JSON形态；
        // 纯文本模式仍存 storyText（已清理<mem>等标签）。
        var historyAssistantContent;
        if (gameState && gameState.pureTextMode) {
            historyAssistantContent = storyText || response;
        } else {
            // 【ISSUE-D1 修复】检测 response 是否是完整 JSON（以 { 开头且以 } 结尾）
            // 截断的半截 JSON 存入历史会污染下一轮（AI 模仿截断格式输出不完整 JSON）
            var _responseTrimmed = response ? response.trim() : '';
            var _isCompleteJSON = _responseTrimmed.charAt(0) === '{' && _responseTrimmed.endsWith('}');
            if (_isCompleteJSON) {
                historyAssistantContent = _slimAssistantMessage(response) || storyText || response;
            } else if (_responseTrimmed.charAt(0) === '{') {
                // 以 { 开头但未以 } 结尾 = 截断的 JSON
                // 用 storyText（已提取的部分）替代，避免半截 JSON 污染历史
                console.warn('[sendAIRequest] 检测到截断 JSON，用 storyText 替代存入历史');
                historyAssistantContent = (storyText && storyText.trim())
                    ? storyText
                    : '【本轮生成中断，已跳过存储。请重新生成。】';
            } else {
                historyAssistantContent = _slimAssistantMessage(response) || storyText || response;
            }
        }

        // ResponseParser 失败时，response/storyText 可能是 AI 的推理过程（"用户现在选择了..."）
        // 直接入库会污染后续 prompt，导致 AI 混淆现实与推理、破第四面墙
        if (_isThinkingContent(historyAssistantContent)) {
            console.warn('[sendAIRequest] 检测到 AI 思考内容，拒绝写入历史，使用占位文本');
            historyAssistantContent = '【本回合 AI 回复异常，已跳过存储。请重新生成或检查模型输出格式。】';
            if (gameState) gameState._lastThinkingBlocked = true;
        }
        // 【BG-009 修复】跟踪对话历史是否已在正常路径写入，
        // catch 块据此决定是否补写入（避免异常路径丢失回合记录导致回顾页只显示一轮）
        var _convHistoryUpdated = false;
        if (typeof StateManager !== 'undefined' && StateManager.get && StateManager.set) {
            var _ch = StateManager.get('progress.conversationHistory') || [];
            _ch.push({ role: 'user', content: userMessage }, { role: 'assistant', content: historyAssistantContent });
            StateManager.set('progress.conversationHistory', _ch, { silent: true });
            _convHistoryUpdated = true;
        }
        // 对话历史上限200条，防止内存和token膨胀
        var _convHist = (typeof StateManager !== 'undefined' && StateManager.get) ? StateManager.get('progress.conversationHistory') : (gameState ? gameState.conversationHistory : []);
        if (_convHist && _convHist.length > 200) {
            // 保留第一条system消息 + 最近198条
            var systemMsg = _convHist[0] && _convHist[0].role === 'system'
                ? [_convHist[0]] : [];
            var trimmedHist = systemMsg.concat(_convHist.slice(-(200 - systemMsg.length)));
            if (typeof StateManager !== 'undefined' && StateManager.set) {
                StateManager.set('progress.conversationHistory', trimmedHist, { silent: true });
            }
        }

        // [P1 Swipe] 记录本轮 AI 回复为一个 swipe 版本
        // 正常对话：重置 swipe 数组，记录唯一版本
        // retry 生成：追加新版本，UI 切到新版本（保留旧版本可切换）
        if (typeof SwipeManager !== 'undefined') {
            var _swipeSceneTitle = '';
            try {
                _swipeSceneTitle = (typeof StateManager !== 'undefined' && StateManager.get)
                    ? (StateManager.get('progress.sceneTitle') || '')
                    : (gameState && gameState.sceneTitle || '');
            } catch (e) {}
            SwipeManager.addSwipe({
                storyText: storyText || finalStory || '',
                choices: (data && Array.isArray(data.choices)) ? data.choices : [],
                sceneTitle: _swipeSceneTitle,
                response: historyAssistantContent || response || '',
                turn: (typeof StateManager !== 'undefined' && StateManager.get) ? (StateManager.get('progress.turn') || 0) : 0,
                timestamp: Date.now()
            });
        }
        // 触发事件：CHARACTER_MESSAGE_RENDERED（AI消息渲染后）
        if (typeof TavernHelperCompat !== 'undefined') {
            TavernHelperCompat.emit('CHARACTER_MESSAGE_RENDERED', {
                message: response,
                timestamp: Date.now()
            });
        }

        // AI 未生成 theater 模块时，从角色/物品/任务/事件/剧情文本生成兜底内容

        // 避免 accumulate 类型首次生成后 !hasType() 永久阻止后续兜底（与BUG-010同根）。
        try { ensureLogFallbacks(finalStory, data && data.world); } catch(e) { console.warn('[ensureLogFallbacks] 失败:', e); }
        // 【BG-006 修复】每次成功生成后，把当前剧情地点/角色同步到「剧情动态」世界书（MERGE）
        // 延迟到下一 tick，避免阻塞主线程；失败不影响主流程
        setTimeout(function() {
            try {
                if (typeof TavernHelperCompat !== 'undefined' && TavernHelperCompat.syncWorldInfoFromStory) {
                    TavernHelperCompat.syncWorldInfoFromStory(finalStory || storyText || '');
                }
            } catch (e) { console.warn('[BG-006] syncWorldInfoFromStory 失败:', e); }
        }, 0);
        autoSave();
        // 【BUG-001 深度修复】延迟 token 计数到下一 tick。
        // updateTokenCount 内部调用 estimateTokensForMessagesUtil 迭代整个 conversationHistory
        // （最多 200 条消息），是后处理链末尾的重操作。token 计数仅用于 UI 显示，不影响故事渲染，
        // 延迟执行可避免与前面的 autoSave 叠加阻塞主线程。
        var _tokenResp = response;
        setTimeout(function() {
            try { updateTokenCount(_tokenResp); } catch (e) { console.warn('[updateTokenCount] 延迟执行失败:', e); }
        }, 0);
    } catch (error) {
        TypewriterBuffer.stop();
        // 清理 AbortController
        window._currentAbort = null;
        // 确保异常路径也调用 hideStoryLoading
        hideStoryLoading();

        // 【BUG-002 深度修复】异常路径也更新标题。
        // 后处理链中任何异常（JSON.parse 失败、正则回溯等）会导致 try 块中断，
        // line 2107 的正常兜底不会执行。此处补一个异常路径兜底，确保标题不停留在
        // line 1012 设置的 userPrompt（"我想玩西方奇幻游戏..."）。
        // 条件与正常路径一致：gameState 存在且 sceneTitle 未被设置过有效值
        try {
            if (gameState && typeof StateManager !== 'undefined' && StateManager.get) {
                // 【BG-004 修复】若正常路径未递增 turn（异常发生在 line 2442 之前），
                // 此处补递增。玩家已发出消息并收到 AI 响应，turn 应前进。
                // 注意：_aiMutatorApplied=true 时下方 deleteLastTurn 会回滚，那时 turn 会随之回退；
                //       但若 mutator 未执行（_aiMutatorApplied=false），不递增会导致回合数永久卡在 0。
                if (!_turnIncremented && !_aiMutatorApplied) {
                    var _curT = StateManager.get('progress.turn') || 0;
                    StateManager.set('progress.turn', _curT + 1, { silent: true });
                    _turnIncremented = true;
                    if (typeof updateTurnLabel === 'function') updateTurnLabel();
                    console.warn('[BG-004] 异常路径补递增 turn:', _curT, '->', _curT + 1);
                }
                var _curSceneTitle = StateManager.get('progress.sceneTitle');
                if (!_curSceneTitle) {
                    var _errTurn = StateManager.get('progress.turn') || 0;
                    var _errFallbackTitle = '第 ' + (_errTurn + 1) + ' 回合';
                    console.log('[BUG-002] 异常路径标题兜底触发, sceneTitle was empty, 设置为:', _errFallbackTitle);
                    updateSceneTitle(_errFallbackTitle);
                    if (StateManager.set) {
                        StateManager.set('progress.sceneTitle', _errFallbackTitle, { silent: true });
                    }
                } else {
                    console.log('[BUG-002] 异常路径标题兜底未触发, sceneTitle 已有值:', _curSceneTitle);
                }
            }
        } catch (titleErr) { /* 忽略标题兜底失败 */ }

        // 若 AIResponseMutator 已执行（写入了 StateManager 并推进回合），但后续流程抛异常，
        // 需要从 _undoHistory 恢复到请求前的状态，避免状态不一致（回合已推进但剧情未追加）
        if (_aiMutatorApplied && gameState._undoHistory && gameState._undoHistory.length > 0) {
            try {
                console.warn('[sendAIRequest] AI 失败但 Mutator 已执行，回滚到请求前状态');
                if (typeof deleteLastTurn === 'function') {
                    deleteLastTurn();
                }
            } catch (rollbackErr) {
                console.error('[sendAIRequest] 状态回滚失败:', rollbackErr);
            }
        }

        // 【BG-009 修复】异常路径补写入对话历史：
        // 若 AI 已返回响应但后处理异常导致 line 2534 未执行，回顾页会丢失本轮记录。
        // 此处在 catch 块补写入（仅当 response 存在且未回滚时），避免回顾页只显示一轮
        if (!_convHistoryUpdated && response && !_aiMutatorApplied && userMessage) {
            try {
                if (typeof StateManager !== 'undefined' && StateManager.get && StateManager.set) {
                    var _catchHist = StateManager.get('progress.conversationHistory') || [];
                    // 避免重复：检查最后一条是否已是本轮 user 消息
                    var _lastIsSameUser = _catchHist.length > 0
                        && _catchHist[_catchHist.length - 1].role === 'user'
                        && _catchHist[_catchHist.length - 1].content === userMessage;
                    if (!_lastIsSameUser) {
                        var _catchAssistantContent = (typeof _slimAssistantMessage === 'function')
                            ? (_slimAssistantMessage(response) || storyText || response)
                            : (storyText || response);
                        _catchHist.push(
                            { role: 'user', content: userMessage },
                            { role: 'assistant', content: _catchAssistantContent }
                        );
                        StateManager.set('progress.conversationHistory', _catchHist, { silent: true });
                        console.warn('[BG-009] 异常路径补写入对话历史，当前条数:', _catchHist.length);
                    }
                }
            } catch (histErr) { console.warn('[BG-009] 补写入对话历史失败:', histErr); }
        }
        // 【ISSUE-006 修复】API 失败后恢复用户自定义输入
        // 原 btnSendAction/customAction keypress 在调用 sendAIRequest 前就清空了 input.value，
        // 失败后用户输入彻底丢失。这里在失败时把用户输入恢复到输入框，方便重试。
        // 排除：isInit（初始化）和 continueStory 的固定 prompt（[Continue...] 或预设 nudge）
        if (userMessage && !isInit) {
            var _isContinuePrompt = (userMessage === '[Continue your last message...]');
            // continueStory 会设置 gameState._continuePrefill，标记当前是"继续剧情"
            var _isContinueMode = !!(gameState && gameState._continuePrefill);
            if (!_isContinuePrompt && !_isContinueMode) {
                try {
                    var _inputEl = document.getElementById('customAction');
                    if (_inputEl && typeof UI !== 'undefined' && UI.toast) {
                        _inputEl.value = userMessage;
                        _inputEl.disabled = false;
                        UI.toast('请求失败，输入已保留，可重试');
                    }
                } catch (restoreErr) {
                    console.warn('[sendAIRequest] 恢复用户输入失败:', restoreErr);
                }
            }
        }
        // 【BUG-005 修复】用户主动取消（AbortError）时，保留已显示的故事文本，
        // 不调用 showError（其内部在 storyText 无内容时会覆盖 innerHTML，导致已显示文本被清除），
        // 取消按钮已显示 toast，此处仅记录日志
        // 【BUG-009 修复】扩展取消识别：
        //   1. 标准 AbortError (error.name === 'AbortError')
        //   2. fetch 流中断抛出的 "BodyStreamBuffer was aborted"（非标准 AbortError 实例）
        //   3. signal.aborted 标志（用户已 abort，但错误对象未标识 AbortError）
        // 这三种情况都视为用户主动取消，不显示错误提示
        var _isUserAbort = (error && error.name === 'AbortError')
            || (error && error.aborted === true)
            || (error && error.message && /BodyStreamBuffer was aborted|aborted/i.test(error.message))
            || (window._currentAbort && window._currentAbort.signal && window._currentAbort.signal.aborted);
        if (_isUserAbort) {
            console.log('[sendAIRequest] 用户取消生成（AbortError/BodyStreamBuffer）');
        } else {
            var errDisplay = translateError((error && error.message) ? error.message : '未知错误');
            // 【调试】把原始 Error 对象传入，showError 会显示完整堆栈和文件:行号
            showError(errDisplay, error);

            // 旧代码 console.error('请求出错:', error) 在控制台能正常显示，但被序列化捕获时丢失信息
            // 改为显式输出 message 和 stack，便于远程调试和日志收集
            console.error('请求出错:', (error && error.message) ? error.message : String(error),
                error && error.stack ? '\n' + error.stack : '');
        }
    } finally {
        window._currentAbort = null;
        setWaiting(false);
        // 【日志页面】AI 请求结束（成功/失败/取消），自动关闭生成弹窗
        try { if (typeof UI !== 'undefined' && UI.hideGenerating) UI.hideGenerating(); } catch (e) {}
        // 【BG-001 修复】延迟兜底：finally 执行后若弹窗状态因异步竞态仍残留，
        // 200ms 后再次强制清理（覆盖 setWaiting 缓存失效、hideGenerating 动画未完成等场景）
        setTimeout(function() {
            try {
                if (typeof UI !== 'undefined' && UI.hideGenerating) UI.hideGenerating();
                if (typeof hideStoryLoading === 'function') hideStoryLoading();
                // 防御性：若 body 仍带 is-waiting，强制移除（input.disabled 由 setWaiting 已处理）
                if (document.body.classList.contains('is-waiting')) {
                    document.body.classList.remove('is-waiting');
                    var _input = document.getElementById('customAction');
                    var _sendBtn = document.getElementById('btnSendAction');
                    if (_input) _input.disabled = false;
                    if (_sendBtn) _sendBtn.disabled = false;
                }
            } catch (e) {}
        }, 200);
    }
}
function updateTokenCount(currentResponse) {
    if (!gameState.conversationHistory) return;
    // 统一用 utils 里的 token 估算（优先 Tokenizer 精确计数，回退字符估算）
    var estimated = estimateTokensForMessagesUtil(gameState.conversationHistory);
    gameState.tokenCount = estimated;

    // 更新故事头部Token显示
    var currentTokenEl = document.getElementById('currentTokenCount');
    var totalTokenEl = document.getElementById('totalTokenCount');

    if (currentResponse && currentTokenEl) {

        var outputTokens = estimateTokensUtil(currentResponse);
        currentTokenEl.textContent = outputTokens > 1000 ?
            (outputTokens / 1000).toFixed(1) + 'k' : outputTokens;
    } else if (currentTokenEl) {
        currentTokenEl.textContent = '0';
    }
    if (totalTokenEl) {
        totalTokenEl.textContent = estimated > 1000 ? 
            (estimated / 1000).toFixed(1) + 'k' : estimated;
    }
    
    // 更新设置弹窗里的显示（已合并到 contextInfo）
    var ctxEl = document.getElementById('contextInfo');
    if (ctxEl) {
        ctxEl.textContent = '上下文: ' + gameState.conversationHistory.length + ' 条 | 约 ' +
            (estimated > 1000 ? (estimated / 1000).toFixed(1) + 'k' : estimated) + ' token';
    }

    // 更新聊天界面底部Token显示
    var chatTokenEl = document.getElementById('chatTokenDisplay');
    if (chatTokenEl) {
        var displayText = estimated > 1000 ? (estimated / 1000).toFixed(1) + 'k' : estimated;
        var inputInfo = '';
        if (gameState._lastInputTokens) {
            var inputDisplay = gameState._lastInputTokens > 1000 ? (gameState._lastInputTokens / 1000).toFixed(1) + 'k' : gameState._lastInputTokens;

            var _ctxForDisplay = getContextSizeSafe();
            var ctxDisplay = _ctxForDisplay > 1000 ? (_ctxForDisplay / 1000).toFixed(0) + 'k' : _ctxForDisplay;
            inputInfo = ' | 请求: ' + inputDisplay + '/' + ctxDisplay + ' (' + (gameState._lastContextUsage || 0) + '%)';
        }
        chatTokenEl.textContent = '上下文: 约 ' + displayText + ' token' + inputInfo + ' | ' + gameState.conversationHistory.length + ' 条消息';
    }

    // 智能压缩检查

    if (gameState && gameState.autoCompress !== false && !isCompressing && !isWaiting && typeof EnhancedMemory !== 'undefined') {
        // 【长轮次优化】压缩阈值应基于上下文窗口（contextSize），而非输出预算（maxTokens）。
        // 原逻辑用 maxTokens（32k）导致 64k 上下文模型在第 5-6 轮就过早触发压缩；
        // 改为 contextSize 后，压缩触发点从 ~30k 提升到 ~58k，减少不必要的压缩 API 调用。
        var ctxSize = (gameState && gameState.contextSize) || getContextSizeSafe();
        var triggerResult = EnhancedMemory.shouldTriggerCompression(estimated, ctxSize);
        if (triggerResult.shouldCompress) {
            var cooldownMs = (EnhancedMemory.compressionConfig.cooldownMinutes || 15) * 60 * 1000;
            if (Date.now() - (window.lastCompressTime || 0) > cooldownMs) {
                console.log('⚠️ 触发压缩:', triggerResult.reason);

                // 成功后才设完整冷却；失败时设 1 分钟短冷却，避免 15 分钟内无法重试，
                // 同时防止 API 持续失败时被瞬间反复触发。
                autoCompressContext();
            }
        }
    }
}
// 导出为小说
function exportAsNovel() {
    var history = gameState.conversationHistory || [];
    if (history.length < 2) {
        UI.toast('对话内容不足，无法导出');
        return;
    }

    var title = '自由剧本';
    // 尝试从系统提示词中提取标题
    if (history[0] && history[0].role === 'system' && history[0].content) {
        var titleMatch = history[0].content.match(/剧情梗概[：:]\s*(.{2,30})/);
        if (titleMatch) title = titleMatch[1].replace(/[《》\n]/g, '').trim();
    }

    var lines = [];
    lines.push('# ' + title);
    lines.push('');
    lines.push('## 第一章');
    lines.push('');

    var chapterCount = 1;
    var messageCount = 0;

    for (let i = 0; i < history.length; i++) {
        var msg = history[i];
        if (msg.role === 'system') continue;

        messageCount++;
        // 每20条消息分一章
        if (messageCount > 1 && messageCount % 20 === 1) {
            chapterCount++;
            lines.push('');
            lines.push('## 第' + chapterCount + '章');
            lines.push('');
        }

        var content = (msg.content || '').trim();
        if (!content) continue;

        // 清理内容中的Markdown标记和特殊格式
        // 【ReDoS 修复】用 stripCodeBlockFences 线性扫描替代 /```[\s\S]*?```/g
        // 原正则在嵌套或大量代码块上可能触发灾难性回溯
        content = (typeof stripCodeBlockFences === 'function')
            ? stripCodeBlockFences(content)
            : content.replace(/```[\s\S]*?```/g, function(block) {
                return block.replace(/```/g, '');
            });
        content = content.replace(/\*\*(.*?)\*\*/g, '$1');
        content = content.replace(/\*(.*?)\*/g, '$1');
        content = content.replace(/^#{1,6}\s/gm, '');

        if (msg.role === 'user') {
            lines.push('[玩家] ' + content);
        } else if (msg.role === 'assistant') {
            lines.push(content);
        }

        lines.push('');
    }

    var text = lines.join('\n');
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = title + '_小说.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    TimerManager.setTimeout('revokeNovelURL', function() { URL.revokeObjectURL(url); }, 1000);

    UI.toast('小说已导出');
}
async function _compressConversation(removed, sys) {
    var config = (typeof EnhancedMemory !== 'undefined') ? EnhancedMemory.compressionConfig : { incrementalUpdate: true };
    // Step 1: 识别重要消息
    // 旧实现用关键词命中（"首次""登场""获得"...），AI 剧情里几乎每条都包含，导致 100% 命中，"分步压缩"失效。
    // 改用：1) AI 返回的 keyEvents 全文匹配（最准）；2) 玩家消息（玩家行为始终是剧情关键）。
    var importantMessages = [];
    var normalMessages = [];
    // 收集 gameState 里累计的 keyEvents 文本，做大小写不敏感的子串匹配
    var keyEventStrs = (gameState && Array.isArray(gameState.keyEvents)) ? gameState.keyEvents : [];
    var hasKeyEvents = keyEventStrs.length > 0;
    removed.forEach(function(m) {
        var content = m.content || '';
        var isImportant = false;
        if (m.role === 'user') {
            // 玩家行为/选择/发言是剧情关键
            isImportant = true;
        } else if (hasKeyEvents && content) {
            // 命中任意一条 keyEvent 子串（取 8 字以上避免误命中"我"等单字）
            for (let i = 0; i < keyEventStrs.length; i++) {
                var ev = String(keyEventStrs[i] || '').trim();
                if (ev.length >= 6 && content.indexOf(ev) !== -1) {
                    isImportant = true;
                    break;
                }
                // 子串过长导致命中不到时，回退用前 12 字做模糊匹配
                if (ev.length >= 12) {
                    var prefix = ev.substring(0, 12);
                    if (content.indexOf(prefix) !== -1) {
                        isImportant = true;
                        break;
                    }
                }
            }
        }
        if (isImportant) importantMessages.push(m);
        else normalMessages.push(m);
    });
    console.log('[分步压缩] 重要消息:', importantMessages.length, '条，普通消息:', normalMessages.length, '条');
    // Step 2: 处理重要消息 - 提取关键信息存入表格
    if (importantMessages.length > 0 && typeof EnhancedMemory !== 'undefined') {
        importantMessages.forEach(function(m) { _extractAndStoreImportantInfo(m); });
    }
    // Step 3: 增量更新摘要
    var summaryPrompt, summaryContent;
    if (config.incrementalUpdate && typeof EnhancedMemory !== 'undefined' && EnhancedMemory.longTermMemory.masterSummary) {
        summaryContent = normalMessages.map(function(m) {
            var role = m.role === 'user' ? '【玩家行动】' : '【剧情发展】';
            // 【动态化】移除 500 字截断——重要消息内容应完整传给 AI 做摘要
            // 旧代码截断到 500 字会丢失剧情细节，影响摘要质量
            return role + '\n' + m.content;
        }).join('\n\n---\n\n');
        // 【提示词重设计】从「命令式」改为「编剧视角 + 信任模型」

        summaryPrompt = '你正在帮一位游戏编剧维护剧情摘要——下面是已有摘要和这次新增的对话内容，请把新内容无缝整合到摘要里，让旧摘要与新内容融为一体，而不是简单的拼接。\n\n' +
            '你懂什么是好的剧情摘要：保留关键因果（谁做了什么→导致什么）、角色变化（态度/关系/状态的转折）、未解决的悬念；删掉重复的描写、流水账、对话中无意义的客套。\n' +
            '目标是让一个没读过原文的人读摘要也能 30 秒内 get 到「现在剧情走到哪了」。\n\n' +
            '【硬性要求】人名、地名、势力名、物品名、技能名、特殊术语等专有名词必须与原文保持一字不差——不要同义改写、不要用代词替换、不要简化合成词。这些名字会作为后续剧情检索的锚点，改了就搜不到了。\n\n' +
            '已有摘要控制在 ' + ((typeof getDynamicTruncationConfig === 'function') ? getDynamicTruncationConfig().summaryMaxChars : 1500) + ' 字以内。\n\n' +
            '## 已有摘要\n' + EnhancedMemory.longTermMemory.masterSummary + '\n\n' +
            '## 新增对话内容\n' + summaryContent;
    } else {
        summaryContent = removed.map(function(m) {
            var role = m.role === 'user' ? '【玩家行动】' : '【剧情发展】';
            // 【动态化】移除 800 字截断——首次摘要应保留完整内容
            // 旧代码截断到 800 字会丢失剧情细节
            return role + '\n' + m.content;
        }).join('\n\n---\n\n');
        // 【提示词重设计】从「命令式」改为「编剧视角 + 信任模型」
        summaryPrompt = '你正在帮一位游戏编剧做剧情摘要——把一段游戏对话浓缩成能快速回顾的文本。\n\n' +
            '你懂什么是好的剧情摘要：保留关键因果（谁做了什么→导致什么）、角色变化（态度/关系/状态的转折）、未解决的悬念；删掉重复的描写、流水账、对话中无意义的客套。\n' +
            '目标是让一个没读过原文的人读摘要也能 30 秒内 get 到「这段剧情发生了什么」。';
    }
    var summaryMessages = [{ role: 'system', content: summaryPrompt }, { role: 'user', content: '请对以上内容进行处理：\n\n' + summaryContent }];
    var summary = await callAI(summaryMessages, { temperature: 0.3 });
    // Step 4: 保存摘要到历史记录
    if (typeof EnhancedMemory !== 'undefined') {
        EnhancedMemory.longTermMemory.masterSummary = summary;
        if (summary.includes('【剧情主线】')) _parseStructuredSummary(summary);
        // 同步逐层摘要
        if (EnhancedMemory._updateSummaryLayers) EnhancedMemory._updateSummaryLayers();
        EnhancedMemory.saveToStorage();
        console.log('[智能总结] 已同步到EnhancedMemory');
    }
    // 统计Token节省（用统一估算口径，避免与触发阈值算法不一致）
    var originalTokens = estimateTokensForMessagesUtil(removed);
    var summaryTokens = estimateTokensUtil(summary);
    var savedTokens = originalTokens - summaryTokens;
    if (typeof EnhancedMemory !== 'undefined') EnhancedMemory.stats.tokenSaved += Math.max(0, savedTokens);
    console.log('[压缩统计] 原始:', originalTokens, 'token → 摘要:', summaryTokens, 'token → 节省:', savedTokens, 'token');
    return summary;
}

// 解析结构化摘要，更新EnhancedMemory表格
function _parseStructuredSummary(summary) {
    if (typeof EnhancedMemory === 'undefined') return;
    
    // 解析角色动态
    var characterMatch = summary.match(/【角色动态】\n([\s\S]*?)(?=【|$)/);
    if (characterMatch) {
        var lines = characterMatch[1].split('\n').filter(function(l) { return l.trim(); });
        lines.forEach(function(line) {
            var parts = line.split(' - ');
            if (parts.length >= 2) {
                var name = parts[0].trim();
                var change = parts[1].trim();

                // 原 longTermMemory.characterTable[name] 直接写入已失效（getter 返回深拷贝快照）
                if (typeof EnhancedMemory.recordCharacterChange === 'function') {
                    EnhancedMemory.recordCharacterChange(name, change);
                }
            }
        });
    }
    
    // 解析重要事件
    var eventMatch = summary.match(/【重要事件】\n([\s\S]*?)(?=【|$)/);
    if (eventMatch) {
        var events = eventMatch[1].split('\n').filter(function(l) { return l.trim(); });
        // 【C2修复】统一走 gm.addImportantEvents 批量入口
        // 旧代码直接 push 到 EnhancedMemory.longTermMemory.importantEvents，schema 为 {time, event}，
        // 与 gm.addImportantEvent 的 {content, turn, gameTime, importance, decayScore} schema 不一致，
        // 导致 _syncEventsToKeyEvents 过滤掉这些事件（e.content 为 undefined），事件在 keyEvents 中消失
        if (events.length > 0 && typeof EnhancedMemory !== 'undefined' && EnhancedMemory.addImportantEvents) {
            var _eventObjs = events.map(function(e) { return { content: e.trim(), importance: 5 }; });
            try { EnhancedMemory.addImportantEvents(_eventObjs); } catch (err) { console.warn('[摘要事件写入失败]', err); }
        }
    }
    
    // 解析当前状态
    var stateMatch = summary.match(/【当前状态】\n([\s\S]*?)(?=【|$)/);
    if (stateMatch) {

        // {player, hud, bag, quests, characters} 完整结构。改为局部更新保留其他字段。
        if (typeof StateManager !== 'undefined' && StateManager.get && StateManager.set) {
            var _ws = StateManager.get('ui.worldSnapshot') || {};
            _ws.lastUpdate = Date.now();
            _ws.summary = stateMatch[1].trim();
            StateManager.set('ui.worldSnapshot', _ws, { silent: true });
        }
    }
}
// 提取重要信息存入表格
function _extractAndStoreImportantInfo(message) {
    if (typeof EnhancedMemory === 'undefined') return;
    var content = message.content || '';
    var characterPatterns = [/(.{2,10})(首次|登场|出现|走进|来到)/, /(新角色|新人物)[：:]\s*(.{2,10})/];
    characterPatterns.forEach(function(pattern) {
        var match = content.match(pattern);
        if (match) {
            var name = (match[1] || match[2]).replace(/[首次登场出现走进来到新角色新人物：:]/g, '').trim();
            if (name.length >= 2 && name.length <= 10) {

                // 旧代码直接 longTermMemory.characterTable[name] = {...} 已失效（getter 返回深拷贝快照）
                if (typeof EnhancedMemory.recordCharacterChange === 'function') {
                    EnhancedMemory.recordCharacterChange(name, null);
                }
            }
        }
    });
    var itemPatterns = [/(获得|拿到|找到|得到)[了]?\s*(.{2,20})/, /(物品|道具)[：:]\s*(.{2,20})/];
    itemPatterns.forEach(function(pattern) {
        var match = content.match(pattern);
        if (match) {
            var item = match[2].trim();
            if (item.length >= 2) {

                if (typeof EnhancedMemory.recordItemObtained === 'function') {
                    EnhancedMemory.recordItemObtained(item, '玩家持有');
                }
            }
        }
    });
}
// ========================================

// autoCompressContext / manualCompress 之前有 ~40 行重复代码：
// dialogOnly 循环、keep/removed slice、pinned 消息分流、rebuild、recordCompression。
// 抽取为 _prepareCompressionData() + _applyCompressionResult() 两个内部函数。
// ========================================
// 30 条原文保留的硬编码（之前两处都写死 30）
const COMPRESS_KEEP_LIMIT = 30;
// system 消息内嵌的元数据前缀（用于过滤掉不被压缩的"系统侧"消息）
const _SYS_BLOCK_PREFIXES = ['当前世界状态快照', '重要事件记录', '前情摘要'];

/**
 * 从 conversationHistory 提取可压缩数据
 * @param {Array} conv - 完整对话历史
 * @returns {{sys: object|null, keep: Array, removed: Array, dialogOnly: Array, pinnedCount: number}}
 */
function _prepareCompressionData(conv) {
    conv = conv || [];
    var sys = conv.length > 0 ? conv[0] : null;

    var dialogOnly = [];
    for (let i = 1; i < conv.length; i++) {
        var m = conv[i];
        if (m.role === 'system') {
            var c = (m.content || '');
            var isMeta = false;
            for (let k = 0; k < _SYS_BLOCK_PREFIXES.length; k++) {
                if (c.indexOf(_SYS_BLOCK_PREFIXES[k]) !== -1) { isMeta = true; break; }
            }
            if (isMeta) continue;
        }
        dialogOnly.push(m);
    }
    var keep = dialogOnly.slice(-COMPRESS_KEEP_LIMIT);
    var removed = dialogOnly.slice(0, -COMPRESS_KEEP_LIMIT);
    // 【酒馆特性】消息 Pinning：固定消息从 removed 移到 keep 头部
    var pinnedMessages = [];
    var nonPinnedRemoved = [];
    for (let j = 0; j < removed.length; j++) {
        if (removed[j]._pinned === true) pinnedMessages.push(removed[j]);
        else nonPinnedRemoved.push(removed[j]);
    }
    var pinnedCount = pinnedMessages.length;
    if (pinnedCount > 0) {
        removed = nonPinnedRemoved;
        keep = pinnedMessages.concat(keep);
    }
    return { sys: sys, keep: keep, removed: removed, dialogOnly: dialogOnly, pinnedCount: pinnedCount };
}

/**
 * 应用压缩结果：重建 conversationHistory + rollingSummary + 触发保存
 * @param {object} sys - 原始 system prompt 消息
 * @param {Array} keep - 保留的近期消息
 * @param {string} summary - AI 生成的摘要
 */
function _applyCompressionResult(sys, keep, summary) {
    // 重建：system prompt + 近期对话
    if (typeof StateManager !== 'undefined' && StateManager.set) {
        StateManager.set('progress.conversationHistory', sys ? [sys].concat(keep) : keep.slice(), { silent: true });
        StateManager.set('progress.rollingSummary', summary, { silent: true });
    }
    autoSave();
    if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.recordCompression) {
        EnhancedMemory.recordCompression(true);
    }
}

async function autoCompressContext() {
    if (isCompressing) return;
    isCompressing = true;
    var _wasWaiting = isWaiting;
    isWaiting = true;
    // Fix Issue 17: Use independent AbortController for compression
    var _compressAbort = new AbortController();
    var _origCurrentAbort = window._currentAbort;
    window._currentAbort = _compressAbort;

    var _restoreAbort = function() {
        if (window._currentAbort === _compressAbort) {
            window._currentAbort = _origCurrentAbort;
        }
    };
    try {

        // 旧逻辑：记忆系统激活后 rollingSummary 永不注入，但 autoCompressContext 仍消耗 API 调用生成它
        // 新逻辑：检测到 _summaryLayers 有数据时，直接跳过压缩（摘要由记忆系统维护）
        var _hasMemorySummary = (typeof EnhancedMemory !== 'undefined') && EnhancedMemory._summaryLayers &&
            (EnhancedMemory._summaryLayers.near.length > 0 || EnhancedMemory._summaryLayers.mid.length > 0);
        if (_hasMemorySummary) {
            console.log('[压缩跳过] 记忆系统已有摘要数据，rollingSummary 不会注入，跳过 API 调用');
            isCompressing = false;
            if (!_wasWaiting) isWaiting = false;
            _restoreAbort();
            return;
        }


        var prep = _prepareCompressionData(gameState.conversationHistory);

        if (prep.removed.length === 0) {

            isCompressing = false;
            if (!_wasWaiting) isWaiting = false;
            _restoreAbort();
            return;
        }

        // 早期游戏上下文短，原文注入即可，摘要反而割裂连贯性
        var _historyTurns = Math.floor(prep.dialogOnly.length / 2);
        if (_historyTurns < 10) {
            console.log('[摘要跳过] 历史仅' + _historyTurns + '轮 (<10), 不生成摘要');
            isCompressing = false;
            if (!_wasWaiting) isWaiting = false;
            _restoreAbort();
            return;
        }
        var summary = await _compressConversation(prep.removed, prep.sys);

        _applyCompressionResult(prep.sys, prep.keep, summary);
        if (prep.pinnedCount > 0) {
            console.log('[压缩] 保留了 ' + prep.pinnedCount + ' 条固定消息');
        }
        console.log('自动压缩完成，保留', gameState.conversationHistory.length, '条，keyEvents', (gameState
            .keyEvents || []).length, '条不受影响');

        window.lastCompressTime = Date.now();
    } catch (e) {
        console.error('自动压缩失败:', e);

        // 同时避免在 API 持续异常时被瞬间反复触发
        var _fullCooldownMs = ((EnhancedMemory && EnhancedMemory.compressionConfig && EnhancedMemory.compressionConfig.cooldownMinutes) || 15) * 60 * 1000;
        window.lastCompressTime = Date.now() - _fullCooldownMs + (60 * 1000);

        if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.recordCompression) {
            EnhancedMemory.recordCompression(false);
        }
    } finally {
        isCompressing = false;
        if (!_wasWaiting) isWaiting = false;
        _restoreAbort();
    }
}
// ========================================
// 上下文压缩
// ========================================
async function manualCompress(btn) {
    // 添加try-catch包裹整个异步操作
    // Fix Issue 17: Use independent AbortController for compression
    var _compressAbort = new AbortController();
    var _origCurrentAbort = window._currentAbort;
    window._currentAbort = _compressAbort;

    var _restoreAbort = function() {
        if (window._currentAbort === _compressAbort) {
            window._currentAbort = _origCurrentAbort;
        }
    };
    try {
        var msgCount = (gameState && gameState.conversationHistory) ? gameState.conversationHistory.filter(function(m) {
            return m.role !== 'system';
        }).length : 0;
        if (msgCount <= COMPRESS_KEEP_LIMIT) {
            UI.toast('对话只有 ' + msgCount + ' 条，不需要压缩（大于' + COMPRESS_KEEP_LIMIT + '条才有意义）');
            _restoreAbort();
            return;
        }
        var ok = await UI.confirm('压缩对话', '将用AI总结前面的剧情，只保留最近' + COMPRESS_KEEP_LIMIT + '条原文，确定吗？');
        if (!ok) { _restoreAbort(); return; }


        var prep = _prepareCompressionData(gameState.conversationHistory);
        if (prep.removed.length === 0) {
            UI.toast('没有需要压缩的内容');
            _restoreAbort();
            return;
        }
        var summary = await _compressConversation(prep.removed, prep.sys);

        _applyCompressionResult(prep.sys, prep.keep, summary);
        if (prep.pinnedCount > 0) {
            console.log('[手动压缩] 保留了 ' + prep.pinnedCount + ' 条固定消息');
        }
        console.log('手动压缩完成，保留', gameState.conversationHistory.length, '条');
        UI.toast('压缩完成！已总结 ' + prep.removed.length + ' 条对话');
    } catch (e) {
        console.error('手动压缩失败:', e);
        UI.toast('压缩失败: ' + translateError(e.message || '未知错误'));
    } finally {
        _restoreAbort();
    }
}
(function() {
    var lastPrompt = Storage.get(Storage.KEYS.LAST_PROMPT);
    if (lastPrompt) {
        var el = document.getElementById('worldDescription');
        if (el && !el.value) el.value = lastPrompt;
    }
})();

// 回填作者备注（从 StateManager 读取，存档加载后恢复玩家上次填的值）
// 延迟到 DOMContentLoaded 后执行，确保 StateManager 已 init
function _restoreAuthorsNoteFields() {
    try {
        if (typeof StateManager === 'undefined' || !StateManager.get) return;
        var _an = StateManager.get('settings.authorsNote');
        var _anD = StateManager.get('settings.authorsNoteDepth');
        var _anEl = document.getElementById('authorsNote');
        var _anDEl = document.getElementById('authorsNoteDepth');
        if (_anEl && typeof _an === 'string') _anEl.value = _an;
        if (_anDEl && typeof _anD === 'number') _anDEl.value = _anD;
    } catch (e) { /* 忽略 */ }
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _restoreAuthorsNoteFields);
} else {
    _restoreAuthorsNoteFields();
}

// ========================================
// 渲染器 - 使用集成版UI样式
// ========================================


// 【NEW-007 修复】流式增量提取状态（O(1) per chunk，不再 O(n) 全缓冲区扫描）
// 每轮请求开始时由 _resetStreamExtractor 重置
var _streamStoryStartIdx = -1;     // "story":" 之后的位置，-1 表示尚未找到
var _streamScanPos = 0;            // 增量扫描位置（JSON 转义状态机）
var _streamInEscape = false;      // 是否处于转义状态
var _streamStoryClosed = false;    // story 字段是否已闭合（遇到未转义 "）
var _streamExtractedStory = '';    // 已提取的 story 内容（未做 RegexManager.apply）
var _streamLastPushedLen = 0;      // 上次推送给打字机的 story 长度（避免重复 push）
var _streamPlaintextMode = false;  // 纯文本模式（非 JSON 响应）

function _resetStreamExtractor() {
    _streamStoryStartIdx = -1;
    _streamScanPos = 0;
    _streamInEscape = false;
    _streamStoryClosed = false;
    _streamExtractedStory = '';
    _streamStoryArr = [];      // 【P0 性能修复】重置数组累加器
    _streamStoryArrLen = 0;
    _streamLastPushedLen = 0;
    _streamPlaintextMode = false;
}

// 【NEW-007 修复】增量提取 story 字段值（O(delta) per chunk）
// 【P0 性能修复】用数组累加替代 string += char，避免 O(n²) 字符串拷贝
// 原实现 _streamExtractedStory += ch 在循环中对每个字符做一次 O(n) 的字符串拷贝，
// 当故事文本增长到 50KB+ 时，总开销达 50 亿+ 操作，导致浏览器冻结 50+ 秒。
// 新实现用 _streamStoryArr 数组 push 字符（O(1)），读取时 join('')（O(n) 一次性）
var _streamStoryArr = [];
var _streamStoryArrLen = 0;

function _getStreamExtractedStory() {
    if (_streamStoryArr.length === 0) return '';
    if (_streamStoryArr.length !== _streamStoryArrLen) {
        _streamExtractedStory = _streamStoryArr.join('');
        _streamStoryArrLen = _streamStoryArr.length;
    }
    return _streamExtractedStory;
}

function _appendStreamStory(str) {
    if (!str) return;
    _streamStoryArr.push(str);
    _streamExtractedStory = null; // 标记需要重新 join
    _streamStoryArrLen = -1;
}

function _extractStoryIncremental() {
    if (_streamStoryClosed) return _getStreamExtractedStory();  // 已闭合，不再变化
    while (_streamScanPos < streamBuffer.length) {
        var ch = streamBuffer[_streamScanPos];
        if (_streamInEscape) {
            switch (ch) {
                case 'n': _appendStreamStory('\n'); break;
                case '"': _appendStreamStory('"'); break;
                case '\\': _appendStreamStory('\\'); break;
                case 't': _appendStreamStory('\t'); break;
                case 'r': _appendStreamStory('\r'); break;
                case 'b': _appendStreamStory('\b'); break;
                case 'f': _appendStreamStory('\f'); break;
                case 'u':
                    var hexStr = streamBuffer.substring(_streamScanPos + 1, _streamScanPos + 5);
                    if (/^[0-9a-fA-F]{4}$/.test(hexStr)) {
                        _appendStreamStory(String.fromCharCode(parseInt(hexStr, 16)));
                        _streamScanPos += 4;
                    } else {
                        _appendStreamStory('\\' + ch);
                    }
                    break;
                default: _appendStreamStory(ch);
            }
            _streamInEscape = false;
        } else if (ch === '\\') {
            _streamInEscape = true;
        } else if (ch === '"') {
            _streamStoryClosed = true;
            _streamScanPos++;
            break;  // story 字段闭合
        } else {
            // 【P0 性能修复】批量提取连续普通字符，避免逐字符 += 拷贝
            var _batchStart = _streamScanPos;
            var _batchEnd = _streamScanPos;
            while (_batchEnd < streamBuffer.length) {
                var _bch = streamBuffer[_batchEnd];
                if (_bch === '\\' || _bch === '"') break;
                _batchEnd++;
            }
            if (_batchEnd > _batchStart) {
                _appendStreamStory(streamBuffer.substring(_batchStart, _batchEnd));
            }
            _streamScanPos = _batchEnd;
            continue;  // 跳过下面的 _streamScanPos++，因为已经在上面更新了
        }
        _streamScanPos++;
    }
    return _getStreamExtractedStory();
}

// 流式模式锁定语义：一旦确定模式（json/plaintext），不再切换，避免每帧正则扫描。

function onStreamChunk(delta, fullText) {

    if ((!delta && fullText === '') || (fullText !== undefined && !fullText && !delta)) return;
    if (fullText !== undefined && fullText !== '') {
        streamBuffer = fullText;
    } else if (fullText === '') {
        // fullText为空字符串但delta有内容时，用delta累加
        if (delta) streamBuffer += delta;
    } else {
        streamBuffer += (delta || '');
    }
    // streamBuffer为空时跳过后续处理
    if (!streamBuffer) return;

    // 【NEW-007 修复】增量提取，O(delta) per chunk，不再全缓冲区扫描
    // RegexManager.apply 移到流结束后（parseAIResponse），避免 O(n) 正则替换 × N chunks = O(n²)

    // 纯文本模式：直接增量推送（只推新增部分，打字机自己处理增量）
    if (_streamPlaintextMode) {
        // 【方案C】隐藏 <state> 块（不显示给用户，仅用于状态提取）
        // state 块在故事末尾，流式期间检测到 <state> 就截断显示
        var _stateStart = streamBuffer.indexOf('<state>');
        var _displayText = _stateStart >= 0 ? streamBuffer.substring(0, _stateStart).trimEnd() : streamBuffer;
        if (_displayText.length !== _streamLastPushedLen) {
            TypewriterBuffer.push(_displayText);
            _streamLastPushedLen = _displayText.length;
        }
        return;
    }

    // JSON 模式：增量提取 story 字段
    if (_streamStoryStartIdx === -1) {
        // 【P0 性能修复】用 indexOf 增量扫描替代 streamBuffer.match() 全量正则匹配
        // 原实现：每个 chunk 都对整个 streamBuffer 跑 .match(/"story"\s*:\s*"/)，
        // 缓冲区越大越慢（O(n) × N chunks = O(n²)），大响应时直接冻结浏览器。
        // 新实现：只扫描上次未扫描的部分（_streamJsonScanPos），O(delta) per chunk。
        if (typeof _streamJsonScanPos === 'undefined') _streamJsonScanPos = 0;
        var _storyFound = false;
        // 只在新增部分搜索 "story" 字段
        var _searchFrom = Math.max(0, _streamJsonScanPos - 10); // 回退10字符防跨chunk断裂
        var _storyIdx = streamBuffer.indexOf('"story"', _searchFrom);
        if (_storyIdx !== -1) {
            // 验证后面是否跟 : " 格式
            var _afterKey = streamBuffer.substring(_storyIdx + 7);
            var _colonMatch = _afterKey.match(/^\s*:\s*"/);
            if (_colonMatch) {
                _streamStoryStartIdx = _storyIdx + 7 + _colonMatch[0].length;
                _streamScanPos = _streamStoryStartIdx;
                _storyFound = true;
                _clearStreamWaitingHint();
            }
        }
        _streamJsonScanPos = streamBuffer.length;

        if (!_storyFound) {
            // story 尚未出现，判断是否 JSON
            if (streamBuffer.length > 50) {
                // 缓存 isLikelyJSON 判断结果，避免每 chunk 重复 test
                if (typeof _streamIsLikelyJSON === 'undefined') {
                    _streamIsLikelyJSON = /^\s*\{/.test(streamBuffer);
                }
                if (_streamIsLikelyJSON) {
                    // JSON 模式但 story 字段未到，显示等待提示
                    if (streamBuffer.length > 200 && streamBuffer.length % 1000 < 50) {
                        console.warn('[onStreamChunk] JSON模式 story 字段延迟出现，缓冲区:', streamBuffer.length);
                    }
                    // 【安全网】缓冲区超过 50KB 仍未找到 story 字段，切换纯文本模式避免无限等待
                    if (streamBuffer.length > 50000) {
                        console.warn('[onStreamChunk] 缓冲区超过50KB未找到story字段，切换纯文本模式');
                        _streamPlaintextMode = true;
                        if (typeof RuntimeState !== 'undefined') {
                            RuntimeState.streamMode = 'plaintext';
                            RuntimeState.streamModeLocked = true;
                        }
                        _clearStreamWaitingHint();
                        TypewriterBuffer.push(streamBuffer);
                        _streamLastPushedLen = streamBuffer.length;
                    } else {
                        _showStreamWaitingHint();
                    }
                    return;
                }

                // BUG FIX：模型可能先输出裸推理前缀，再输出 JSON 正文。
                // 【P0 性能修复】用 indexOf 替代 12 个正则 match，避免 O(n²) 全量扫描
                var _jsonStartKeys = ['{"story"', '{"title"', '{"player"', '{"choices"',
                    '{"characters"', '{"bag"', '{"quests"', '{"gameTime"',
                    '{"narrative"', '{"content"', '{"storyText"', '{"scene"'];
                var _jsonStartIdx = -1;
                for (var pi = 0; pi < _jsonStartKeys.length; pi++) {
                    // 只在新增部分搜索
                    var _idx = streamBuffer.indexOf(_jsonStartKeys[pi], _searchFrom);
                    // 也检查缓冲区开头（推理前缀场景，JSON 可能在任意位置）
                    if (_idx === -1 && _searchFrom > 0) {
                        _idx = streamBuffer.indexOf(_jsonStartKeys[pi]);
                    }
                    if (_idx !== -1) {
                        // 容错：key 后可能跟空格，如 { "story"
                        var _afterBracket = streamBuffer.substring(_idx + 1);
                        if (/^\s*"/.test(_afterBracket) || _jsonStartKeys[pi].charAt(1) === '"') {
                            if (_jsonStartIdx === -1 || _idx < _jsonStartIdx) {
                                _jsonStartIdx = _idx;
                            }
                        }
                    }
                }
                if (_jsonStartIdx > 0) {
                    // 找到 JSON 起点：丢弃前缀，继续 JSON 模式等待 story 字段
                    if (streamBuffer.length - _jsonStartIdx > 200 && streamBuffer.length % 1000 < 50) {
                        console.warn('[onStreamChunk] JSON模式 story 字段延迟出现（含推理前缀），缓冲区:', streamBuffer.length);
                    }
                    _showStreamWaitingHint();
                    return;
                }

                // 非 JSON 响应，切换纯文本模式
                _streamPlaintextMode = true;
                if (typeof RuntimeState !== 'undefined') {
                    RuntimeState.streamMode = 'plaintext';
                    RuntimeState.streamModeLocked = true;
                }
                _clearStreamWaitingHint();
                TypewriterBuffer.push(streamBuffer);
                _streamLastPushedLen = streamBuffer.length;
            }
            return;
        }
    }

    // 已定位 story 起始，增量提取
    var story = _extractStoryIncremental();
    if (story && story.length > 0 && story.length !== _streamLastPushedLen) {
        // 只在有新增时 push（TypewriterBuffer 内部自动取增量）
        TypewriterBuffer.push(story);
        _streamLastPushedLen = story.length;
    }
}

// 【NEW-003 修复】流式等待 story 字段时的剧情区提示
// 不污染 TypewriterBuffer（避免与 story 内容冲突），直接操作 DOM
var _streamWaitingHintShown = false;
function _showStreamWaitingHint() {
    if (_streamWaitingHintShown) return;
    _streamWaitingHintShown = true;
    try {
        var storyEl = document.getElementById('storyText');
        if (!storyEl) return;
        // 已有内容则不覆盖（流式中途切回等待的情况）
        if (storyEl.textContent && storyEl.textContent.trim().length > 0) return;
        var hint = document.createElement('div');
        hint.id = 'streamWaitingHint';
        hint.className = 'stream-waiting-hint';
        // 【ISSUE-F1 修复】优化提示文案，让用户了解 AI 正在生成结构化数据
        // 当 AI 不按字段顺序输出（story 不在首位）时，用户知道正在生成状态数据
        hint.innerHTML = '<span class="hint-dot"></span><span class="hint-text">AI 正在生成剧情与状态数据...</span>';
        storyEl.appendChild(hint);
    } catch (e) {}
}
function _clearStreamWaitingHint() {
    if (!_streamWaitingHintShown) return;
    _streamWaitingHintShown = false;
    try {
        var hint = document.getElementById('streamWaitingHint');
        if (hint) hint.remove();
    } catch (e) {}
}

// ========================================
// 第4层: 剧情渲染
// ========================================
// --- 剧情渲染 ---
// 剧情渲染缓存上限：超过该长度的文本不缓存，避免长剧情长期占用内存
var _MAX_CACHED_STORY_LEN = 50000;

function renderStory(text) {
    TypewriterBuffer.stop();
    var storyEl = document.getElementById('storyText');
    var contentEl = document.getElementById('gameContent');

    var regexCount = (typeof RegexEngine !== 'undefined' && RegexEngine.regexScripts) ? RegexEngine.regexScripts.length : 0;
    var canCache = typeof text === 'string' && text.length <= _MAX_CACHED_STORY_LEN;


    // 超过长度上限的文本不缓存，避免长剧情长期占用内存
    if (canCache && text === renderStory._lastText && renderStory._lastHtml !== undefined && renderStory._lastRegexCount === regexCount) {
        if (storyEl && storyEl.innerHTML !== renderStory._lastHtml) {
            storyEl.innerHTML = renderStory._lastHtml;
        }
        if (contentEl) contentEl.scrollTop = 0;
        return;
    }


    // 调用 RegexEngine.execute，isPrompt=false / isMarkdown=true 表示 AI 输出侧的 markdown 渲染阶段
    // [CP-04] 补充 currentPlacement=1（AI 输出 = MD_DISPLAY），配合 RegexEngine 的 placement 过滤
    //         让 placement=[2]（用户输入专用）的正则正确跳过此阶段
    if (typeof RegexEngine !== 'undefined' && RegexEngine.regexScripts && RegexEngine.regexScripts.length > 0) {
        var depth = (gameState.conversationHistory || []).length;
        text = RegexEngine.execute(text, RegexEngine.regexScripts, {
            messageDepth: depth,
            isPrompt: false,
            isMarkdown: true,
            currentPlacement: 1
        });
    }


    var formatted = sanitizeHtml(formatStory(text));
    if (canCache) {
        renderStory._lastText = text;
        renderStory._lastHtml = formatted;
        renderStory._lastRegexCount = regexCount;
    } else {
        renderStory._lastText = undefined;
        renderStory._lastHtml = undefined;
        renderStory._lastRegexCount = undefined;
    }
    if (storyEl) storyEl.innerHTML = formatted;
    if (contentEl) contentEl.scrollTop = 0;
}

// 【P2 CoT 面板】渲染思维链折叠面板
// content: CoT 文本（空串则隐藏面板）
// 面板默认折叠，点击标题展开/收起
function renderCotPanel(content) {
    var panel = document.getElementById('cotPanel');
    var contentEl = document.getElementById('cotContent');
    var toggleBtn = document.getElementById('cotToggle');
    if (!panel || !contentEl) return;

    if (!content || !String(content).trim()) {
        panel.style.display = 'none';
        contentEl.style.display = 'none';
        contentEl.innerHTML = '';
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
        return;
    }

    panel.style.display = 'block';
    // 转义 HTML 防注入，保留换行
    var escaped = String(content)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    contentEl.innerHTML = escaped;

    // 绑定折叠事件（只绑一次）
    if (toggleBtn && !toggleBtn._cotBound) {
        toggleBtn._cotBound = true;
        toggleBtn.addEventListener('click', function() {
            var expanded = this.getAttribute('aria-expanded') === 'true';
            this.setAttribute('aria-expanded', expanded ? 'false' : 'true');
            contentEl.style.display = expanded ? 'none' : 'block';
        });
    }
}
// 全局心声计数器
var globalThoughtId = 0;


// cotRegex：思维链标签提取，由 OutputSanitizer.THINKING_TAGS 动态构建
// [T1-P1-9] fallback 改空数组（按报告建议），OutputSanitizer 未加载时不做 CoT 检测更安全
var _reCotTags = (function() {
    var tags = (typeof OutputSanitizer !== 'undefined' && OutputSanitizer.THINKING_TAGS)
        ? OutputSanitizer.THINKING_TAGS
        : [];
    var alt = tags.join('|');
    // 【根因修复 4】原正则起止标签名不强制匹配（<thinking>...</reasoning> 也匹配），
    // AI 流式输出常产生未闭合 <thinking>，导致 [\s\S]+? 扫到文末，O(k×n) 回溯。
    // 改用反向引用 \1 强制起止同名，未闭合标签不再触发跨段扫描。
    return new RegExp('(?:<(' + alt + ')\\b[^>]*>)([\\s\\S]+?)</\\1\\s*>|💭([\\s\\S]+?)💭', 'gi');
})();
// decorTags：装饰性标签清理（giggle/ice/snow/echo/danmu/branches/prologue 等）
// 【根因修复 5】原正则起止标签名不强制匹配，未闭合标签触发 O(k×n) 回溯。
// 改用捕获组 + 反向引用 \1 强制起止同名。
var _reDecorTags = /<(giggle|ice|snow|echo|danmu|branches|prologue|meow_FM|time_format|write_check|emoji|novel_header|profile|ccd|角色状态面板)[\s\S]*?<\/\1>/gi;
// _reInitialSceneMarkers：初始场景标识（第一章/苏醒/开始/序幕等）
var _reInitialSceneMarkers = /第\s*1\s*[章回]|第一章|第1回|初始|开始|苏醒|醒来|开局|起点|序幕|序章/;
// _reCnTwoChars：连续 2 个中文字符（_looksLikeInitialScene 内联正则）
var _reCnTwoChars = /[\u4e00-\u9fa5]{2}/;
var _reHtmlLt = /&lt;/g;
var _reHtmlGt = /&gt;/g;
var _reHtmlQuot = /&quot;/g;
var _reHtmlAmp = /&amp;/g;
var _reDecEntity = /&#(\d+);/g;
var _reHexEntity = /&#x([0-9a-fA-F]+);/g;
var _reGiggleCN = /【giggle】/g;
var _reGiggleCNClose = /【\/giggle】/g;
var _reGiggleOpen = /<giggle>([\s\S]*?)<\/giggle>/gi;
var _reGiggleStrip = /<giggle>[\s\S]*?<\/giggle>/gi;
var _reGiggleCNStrip = /【giggle】[\s\S]*?【\/giggle】/gi;

// 旧正则要求闭合标签，导致未闭合标签残留并被 escapeHtml 转成 &lt;giggle&gt; 显示给玩家
// 新增两个正则：匹配未闭合的开标签（到行尾/段尾/全文末尾）
// 【ReDoS 修复 - fallback only】这些正则仅作为工具函数不可用时的兜底，
// 主路径改用 extractPairedTags / stripPairedTags / indexOf 线性扫描
var _reGiggleUnclosed = /<giggle>([\s\S]*?)$/gi;
var _reGiggleUnclosedStrip = /<giggle>[\s\S]*$/gi;
var _reGiggleCNUnclosedStrip = /【giggle】[\s\S]*$/gi;
var _reDecorTagsTyping = /<(ice|snow|echo|danmu|branches|prologue|meow_FM|time_format|write_check|emoji|novel_header|profile|ccd|角色状态面板)[\s\S]*?<\/\1>/gi;

// ========================================
// 【P0 根因修复】线性时间代码块扫描器
// 替代 /```[\s\S]*?```/g 和 /```json[\s\S]*?```/g 等正则
// 复杂度严格 O(n)，使用 indexOf 线性搜索，无回溯，不会冻结主线程
// ========================================

/**
 * 线性扫描移除代码块（包括内容）
 * 替代正则 /```[\s\S]*?```/g 和 /```json[\s\S]*?```/g，避免灾难性回溯
 * @param {string} text 待处理文本
 * @param {string} [langPrefix] 可选的语言前缀（如 'json'），仅移除以 ```langPrefix 开头的代码块；
 *                              不传则移除所有 ``` 代码块
 * @returns {string} 移除代码块后的文本
 */
function stripCodeBlocks(text, langPrefix) {
    if (!text || typeof text !== 'string') return text || '';
    var opener = langPrefix ? ('```' + langPrefix) : '```';
    var fence = '```';
    var openerLen = opener.length;
    var fenceLen = fence.length;
    var result = [];
    var pos = 0;
    var len = text.length;
    while (pos < len) {
        var startIdx = text.indexOf(opener, pos);
        if (startIdx === -1) {
            result.push(text.slice(pos));
            break;
        }
        // 保留代码块之前的内容
        result.push(text.slice(pos, startIdx));
        // 找下一个 ```（在 opener 之后）
        var contentStart = startIdx + openerLen;
        var endIdx = text.indexOf(fence, contentStart);
        if (endIdx === -1) {
            // 未闭合代码块：保留剩余内容（包括开标签 ```），与正则 [\s\S]*? 不匹配未闭合一致
            result.push(text.slice(startIdx));
            break;
        }
        // 跳过整个代码块（包括闭合 ```）
        pos = endIdx + fenceLen;
    }
    return result.join('');
}
if (typeof window !== 'undefined') window.stripCodeBlocks = stripCodeBlocks;

/**
 * 线性扫描处理代码块：保留代码块内容，仅移除 ``` 标记
 * 替代 content.replace(/```[\s\S]*?```/g, function(block) { return block.replace(/```/g, ''); });
 * @param {string} text 待处理文本
 * @returns {string} 移除 ``` 标记但保留内容的文本
 */
function stripCodeBlockFences(text) {
    if (!text || typeof text !== 'string') return text || '';
    var fence = '```';
    var fenceLen = fence.length;
    var result = [];
    var pos = 0;
    var len = text.length;
    while (pos < len) {
        var startIdx = text.indexOf(fence, pos);
        if (startIdx === -1) {
            result.push(text.slice(pos));
            break;
        }
        // 找配对的闭合 ```
        var endIdx = text.indexOf(fence, startIdx + fenceLen);
        if (endIdx === -1) {
            // 未配对：保留剩余内容（包括 ``` 本身，与正则 [\s\S]*? 不匹配未配对一致）
            result.push(text.slice(pos));
            break;
        }
        // 保留 ``` 之前的内容
        result.push(text.slice(pos, startIdx));
        // 保留代码块内容（去掉两端的 ```）
        result.push(text.slice(startIdx + fenceLen, endIdx));
        pos = endIdx + fenceLen;
    }
    return result.join('');
}
if (typeof window !== 'undefined') window.stripCodeBlockFences = stripCodeBlockFences;

/**
 * 线性扫描移除 【giggle】...【/giggle】 配对标签（包括内容）
 * 替代正则 /【giggle】[\s\S]*?【\/giggle】/gi，避免灾难性回溯
 * @param {string} text 待处理文本
 * @returns {string} 移除配对标签后的文本
 */
function stripCNGigglePairs(text) {
    if (!text || typeof text !== 'string') return text || '';
    var open = '【giggle】';
    var close = '【/giggle】';
    var openLen = open.length;
    var closeLen = close.length;
    var result = [];
    var pos = 0;
    var len = text.length;
    while (pos < len) {
        var startIdx = text.indexOf(open, pos);
        if (startIdx === -1) {
            result.push(text.slice(pos));
            break;
        }
        // 保留开标签之前的内容
        result.push(text.slice(pos, startIdx));
        // 找闭合标签
        var contentStart = startIdx + openLen;
        var endIdx = text.indexOf(close, contentStart);
        if (endIdx === -1) {
            // 未闭合：保留剩余（包括开标签），与正则 [\s\S]*? 不匹配未闭合一致
            result.push(text.slice(startIdx));
            break;
        }
        // 跳过整个配对
        pos = endIdx + closeLen;
    }
    return result.join('');
}
if (typeof window !== 'undefined') window.stripCNGigglePairs = stripCNGigglePairs;

// 检测标题是否疑似初始场景（用于防御 AI  confused 回退）
function _looksLikeInitialScene(title, userPrompt) {
    if (!title || !userPrompt) return false;
    var t = title.toLowerCase();
    var p = userPrompt.toLowerCase();
    // 标题中出现用户 prompt 前30个字符中的任意2字关键词，且包含"第1"、"第一章"、"苏醒"、"开始"等
    var promptHead = p.substring(0, 30);
    var hasPromptKeyword = false;
    // 提取 prompt 前30字符中所有连续的2字子串（中文语义下2字词覆盖度更高）

    for (let i = 0; i + 2 <= promptHead.length; i++) {
        var seg = promptHead.substring(i, i + 2);
        if (_reCnTwoChars.test(seg) && t.indexOf(seg) !== -1) {
            hasPromptKeyword = true;
            break;
        }
    }

    return hasPromptKeyword && _reInitialSceneMarkers.test(t);
}


function _cleanUnrecognizedTags(text) {
    if (!text || typeof text !== 'string') return text;
    // 允许的 HTML/Markdown 标签白名单（保留基础格式）
    var allowedTags = /^(<\/?(b|i|u|em|strong|span|div|p|br|hr|h[1-6]|blockquote|code|pre|a|img|ul|ol|li|table|tr|td|th|thead|tbody|sup|sub|small|big|font|strike|s)\b)/i;
    // 【性能修复】原正则 /<([a-zA-Z_][a-zA-Z0-9_]*)\b[^>]*>[\s\S]*?$/gm 配合 gm 标志，
    // 对每个行尾做 [\s\S]*? 回溯，文本越长 O(n²) 越严重，2000 字时每 tick（50ms）阻塞主线程。
    // 改为两步线性扫描：先用简单正则移除孤立开标签，再单独处理行尾未闭合标签。
    return text
        // 孤立控制指令（如 /ic、/sys）
        .replace(/\/(ic|sys|imp|story|nar|raw|nocb|dpo|cfg)\b/gi, '')
        // 未闭合的 <gi、<giggle 等残留片段（仅匹配到行尾，避免跨段回溯）
        .replace(/<gi\b[^>]*>[^\n]*/gi, '')
        .replace(/<\/gi>/gi, '')
        // 行尾未闭合的开标签：仅匹配到该行行尾，不跨行（[\s\S]*?$ 改 [^\n]*）
        .replace(/<([a-zA-Z_][a-zA-Z0-9_]*)\b[^>]*>[^\n]*/g, '')
        // 通用未知标签：保留白名单内的，其他移除
        .replace(/<\/?[a-zA-Z_][a-zA-Z0-9_]*\b[^>]*>/g, function(tag) {
            return allowedTags.test(tag) ? tag : '';
        });
}
var _reChapterEnd = /\[章节结束\|([^\]]+)\]/;
var _reDialogueCN = /(\u300c[^\u300d]+\u300d)/g;
var _reDialogueEN = /("[^"]+")/g;
var _rePlaceholder = /&lt;&lt;PH(\d+)PH&gt;&gt;/g;
var _reBold = /\*\*(.*?)\*\*/g;
var _reItalic = /\*(.*?)\*/g;
// 心声气泡清理：简单的同步清理（与原版一致），不要用 requestIdleCallback
// 原版用 querySelectorAll 同步清理（气泡数量少，开销可忽略）
function formatStory(text) {
    if (!text) return '';

    // 【性能监控】记录 formatStory 执行时间，文本超过 2000 字符时输出
    var _fmtStartTime = (text.length > 2000) ? Date.now() : 0;
    var _fmtTextLen = text.length;

    // 某些路径下 text 可能已被 escapeHtml 处理过，需要先还原

    if (text.indexOf('&') !== -1) {
        _reHtmlLt.lastIndex = 0; _reHtmlGt.lastIndex = 0;
        _reHtmlQuot.lastIndex = 0; _reHtmlAmp.lastIndex = 0;
        text = text.replace(_reHtmlLt, '<').replace(_reHtmlGt, '>').replace(_reHtmlQuot, '"').replace(_reHtmlAmp, '&');
        // 同时处理数字字符实体（如 &#12300; → 「）
        _reDecEntity.lastIndex = 0; _reHexEntity.lastIndex = 0;
        text = text.replace(_reDecEntity, function(_, code) {
            return String.fromCharCode(parseInt(code, 10));
        }).replace(_reHexEntity, function(_, hex) {
            return String.fromCharCode(parseInt(hex, 16));
        });
    }


    if (text.indexOf('【giggle】') !== -1 || text.indexOf('【/giggle】') !== -1) {
        _reGiggleCN.lastIndex = 0; _reGiggleCNClose.lastIndex = 0;
        text = text.replace(_reGiggleCN, '<giggle>').replace(_reGiggleCNClose, '</giggle>');
    }


    // 【ReDoS 修复】用 extractPairedTags 线性扫描替代 /<giggle>([\s\S]*?)<\/giggle>/gi
    // 原正则在未闭合 <giggle> 标签上可能触发灾难性回溯
    if (typeof extractPairedTags !== 'undefined') {
        var _giggleMatches = extractPairedTags(text, ['giggle']);
        if (_giggleMatches && _giggleMatches.length > 0) {
            // 逆序替换避免索引偏移
            for (var _gi = _giggleMatches.length - 1; _gi >= 0; _gi--) {
                var _gm = _giggleMatches[_gi];
                var _newInner = _gm.content.replace(/\n/g, ' ').replace(/\r/g, '');
                text = text.slice(0, _gm.index)
                    + '<giggle>' + _newInner + '</giggle>'
                    + text.slice(_gm.index + _gm.fullMatch.length);
            }
        }
    } else {
        text = text.replace(/<giggle>([\s\S]*?)<\/giggle>/gi, function(match, inner) {
            return '<giggle>' + inner.replace(/\n/g, ' ').replace(/\r/g, '') + '</giggle>';
        });
    }


    // parseFromText 遍历所有装饰标签做正则匹配，stripDecorTags 做大量正则替换
    // 在打字机每25ms tick期间执行这些操作是巨大的浪费，因为文本还在变化
    // 只在最终渲染（非tick）时才执行完整解析
    if (!TypewriterBuffer.isTyping) {
        // 先解析装饰标签，提取到 PresetAppManager
        if (typeof PresetAppManager !== 'undefined') {
            PresetAppManager.parseFromText(text);
        }

        // 从剧情文本中移除装饰XML标签
        if (typeof PresetAppManager !== 'undefined') {
            text = PresetAppManager.stripDecorTags(text);
        }

        text = _cleanUnrecognizedTags(text);
    } else {
        // 打字机tick期间：移除装饰标签和 giggle 标签
        // 【P0 根因修复】用线性时间扫描器替代所有 _reDecorTagsTyping / _reGiggle* 正则
        // 原正则 [\s\S]*? 在未闭合标签上触发灾难性回溯，每 25ms tick 累积导致冻结
        // 新实现：stripPairedTags O(n) 移除已闭合标签 + indexOf O(n) 处理未闭合标签

        if (typeof stripPairedTags !== 'undefined') {
            // 1. 移除已闭合的装饰标签（不含 giggle，giggle 单独处理）
            text = stripPairedTags(text, ['ice','snow','echo','danmu','branches','prologue','meow_FM','time_format','write_check','emoji','novel_header','profile','ccd','角色状态面板']);
            // 2. 移除已闭合的 giggle 标签
            text = stripPairedTags(text, ['giggle']);
            // 3. 处理未闭合的 giggle 标签：截断到开标签处（隐藏正在流式的 giggle 内容）
            var _gOpenIdx = text.indexOf('<giggle');
            if (_gOpenIdx !== -1) {
                var _gCloseIdx = text.indexOf('</giggle', _gOpenIdx);
                if (_gCloseIdx === -1) {
                    // 未闭合：截断
                    text = text.slice(0, _gOpenIdx);
                }
            }
        }

        text = _cleanUnrecognizedTags(text);
    }

    // 清理 body 上的旧心声气泡（气泡是 fixed 定位在 body 上的，不在 storyEl 内）

    // 打字机每25ms调用formatStory，如果每次都querySelectorAll+remove+createElement+appendChild，
    // 会造成大量无意义的DOM操作（气泡刚创建就被下一个tick删掉）
    if (!TypewriterBuffer.isTyping) {
        var oldBubbles = document.querySelectorAll('body > .thought-bubble:not([data-persistent])');
        oldBubbles.forEach(function(b) { b.remove(); });
    }

    // 检查是否包含章节结束标记
    var chapterEndMatch = _reChapterEnd.exec(text);
    var chapterEndHtml = '';
    if (chapterEndMatch) {
        chapterEndHtml = '<div class="chapter-end-title"><span class="flower">*</span>' + escapeHtml(
            chapterEndMatch[1]) + '<span class="flower">*</span></div>';
        text = text.replace(chapterEndMatch[0], '');
    }

    // 按段落分割并处理
    var paragraphs = text.split('\n').filter(function(p) {
        return p.trim();
    });
    var result = [];

    // 收集所有心声（整章限制2-5个）


    var allThoughts = [];
    if (text.indexOf('<giggle>') !== -1 || text.indexOf('【giggle】') !== -1) {
        for (let pI = 0; pI < paragraphs.length; pI++) {
            var pp = paragraphs[pI];
            // 【ReDoS 修复】用 extractPairedTags 线性扫描替代 _reGiggleOpen 正则
            // 原正则 /<giggle>([\s\S]*?)<\/giggle>/gi 在未闭合标签上触发灾难性回溯
            var tmatch;
            var _closedMatches = (typeof extractPairedTags !== 'undefined')
                ? extractPairedTags(pp, ['giggle'])
                : (function() {
                    // fallback：工具不可用时回退正则
                    var arr = [];
                    _reGiggleOpen.lastIndex = 0;
                    var m;
                    while ((m = _reGiggleOpen.exec(pp)) !== null) {
                        arr.push({ content: m[1], fullMatch: m[0], index: m.index });
                    }
                    return arr;
                })();
            // 先匹配闭合标签 <giggle>...</giggle>
            for (var _ci = 0; _ci < _closedMatches.length; _ci++) {
                tmatch = _closedMatches[_ci];
                var giggleText = tmatch.content.trim();
                var colonIdx = giggleText.indexOf('：');
                if (colonIdx === -1) colonIdx = giggleText.indexOf(':');
                var character, ttext;
                if (colonIdx > 0) {
                    character = giggleText.substring(0, colonIdx).trim();
                    ttext = giggleText.substring(colonIdx + 1).trim();
                } else {
                    character = '???';
                    ttext = giggleText;
                }
                allThoughts.push({
                    character: character,
                    text: ttext,
                    original: tmatch.fullMatch,
                    paragraphIdx: pI
                });
            }

            // 避免重复：先剔除已匹配闭合标签的部分
            // 【ReDoS 修复】用 extractPairedTags + 手动切片替代 _reGiggleStrip 正则
            // 注意：不能用 stripPairedTags（它会移除未闭合标签的开标签，破坏后续 indexOf 查找），
            // 需用 extractPairedTags 找到配对标签后逆序切片，保留未闭合标签以供后续 indexOf 检测
            var ppWithoutClosed;
            if (typeof extractPairedTags !== 'undefined') {
                ppWithoutClosed = pp;
                var _pairedInPp = extractPairedTags(pp, ['giggle']);
                if (_pairedInPp && _pairedInPp.length > 0) {
                    // 逆序切片避免索引偏移
                    for (var _pk = _pairedInPp.length - 1; _pk >= 0; _pk--) {
                        var _pm2 = _pairedInPp[_pk];
                        ppWithoutClosed = ppWithoutClosed.slice(0, _pm2.index)
                            + ppWithoutClosed.slice(_pm2.index + _pm2.fullMatch.length);
                    }
                }
            } else {
                _reGiggleStrip.lastIndex = 0;
                ppWithoutClosed = pp.replace(_reGiggleStrip, '');
            }
            // 用 indexOf 找未闭合的 <giggle> 标签（替代 _reGiggleUnclosed 正则）
            // _reGiggleUnclosed = /<giggle>([\s\S]*?)$/gi —— $ 锚定字符串末尾，仅匹配一次
            var _uOpenIdx = ppWithoutClosed.indexOf('<giggle>');
            if (_uOpenIdx !== -1) {
                var uText = ppWithoutClosed.slice(_uOpenIdx + '<giggle>'.length).trim();
                if (uText) {
                    var uColon = uText.indexOf('：');
                    if (uColon === -1) uColon = uText.indexOf(':');
                    var uChar, uBody;
                    if (uColon > 0) {
                        uChar = uText.substring(0, uColon).trim();
                        uBody = uText.substring(uColon + 1).trim();
                    } else {
                        uChar = '???';
                        uBody = uText;
                    }
                    allThoughts.push({
                        character: uChar,
                        text: uBody,
                        original: ppWithoutClosed.slice(_uOpenIdx),
                        paragraphIdx: pI
                    });
                    // 未闭合标签 $ 匹配到段尾，只可能匹配一次
                }
            }
        }
    }

    // 心声完全由AI通过<giggle>标签动态生成，不使用固定文本后备
    // 如果AI没有生成<giggle>标签，则不显示心声触发器

    // 【动态化】移除心声数量 5 个硬上限——AI 能自行判断合适的心声数量
    // 旧代码强制最多 5 个心声，多余的会被丢弃，限制了 AI 的表达
    // 新策略：信任 AI 输出的心声数量，不做截断

    // 标记已使用的心声
    allThoughts.forEach(function(t) {
        t.used = false;
    });

    paragraphs.forEach(function(p, pIdx) {
        // 移除所有心声标记（兼容中文方括号格式 + 未闭合标签）
        // 【ReDoS 修复】用线性扫描替代 4 个含 [\s\S]*? 的 giggle strip 正则
        // _reGiggleStrip / _reGiggleUnclosedStrip / _reGiggleCNUnclosedStrip 改用 extractPairedTags + indexOf
        // _reGiggleCNStrip 改用 stripCNGigglePairs 线性扫描
        // 注意：不能用 stripPairedTags（它会移除未闭合标签的开标签，破坏后续 indexOf 查找），
        // 需用 extractPairedTags 找到配对标签后逆序切片，保留未闭合标签以供步骤 3/4 检测
        var cleanText = p;
        // 1. 移除已闭合的 <giggle>...</giggle> 标签（保留未闭合标签以供步骤 3 处理）
        if (typeof extractPairedTags !== 'undefined') {
            var _pairedG = extractPairedTags(cleanText, ['giggle']);
            if (_pairedG && _pairedG.length > 0) {
                // 逆序切片避免索引偏移
                for (var _pg = _pairedG.length - 1; _pg >= 0; _pg--) {
                    cleanText = cleanText.slice(0, _pairedG[_pg].index)
                        + cleanText.slice(_pairedG[_pg].index + _pairedG[_pg].fullMatch.length);
                }
            }
        } else {
            _reGiggleStrip.lastIndex = 0;
            cleanText = cleanText.replace(_reGiggleStrip, '');
        }
        // 2. 移除已闭合的 【giggle】...【/giggle】 标签
        if (typeof stripCNGigglePairs !== 'undefined') {
            cleanText = stripCNGigglePairs(cleanText);
        } else {
            _reGiggleCNStrip.lastIndex = 0;
            cleanText = cleanText.replace(_reGiggleCNStrip, '');
        }
        // 3. 移除未闭合的 <giggle> 标签（到段尾）—— _reGiggleUnclosedStrip = /<giggle>[\s\S]*$/gi
        var _gOpenIdx = cleanText.indexOf('<giggle>');
        if (_gOpenIdx !== -1) {
            cleanText = cleanText.slice(0, _gOpenIdx);
        }
        // 4. 移除未闭合的 【giggle】 标签（到段尾）—— _reGiggleCNUnclosedStrip = /【giggle】[\s\S]*$/gi
        var _gCnOpenIdx = cleanText.indexOf('【giggle】');
        if (_gCnOpenIdx !== -1) {
            cleanText = cleanText.slice(0, _gCnOpenIdx);
        }
        cleanText = cleanText.trim();

        // 检查这个段落是否有对应的心声
        var hasThoughtInThisPara = false;
        var thoughtId = -1;
        for (let tI = 0; tI < allThoughts.length; tI++) {
            if (allThoughts[tI].paragraphIdx === pIdx && !allThoughts[tI].used) {
                hasThoughtInThisPara = true;
                thoughtId = tI;
                allThoughts[tI].used = true;
                break;
            }
        }

        // 跳过空段落（无文本也无心声）
        if (!cleanText && !hasThoughtInThisPara) return;

        var html = '';

        // 如果有文本内容，生成段落
        if (cleanText) {
            // 处理对话样式 - 检测中文引号或英文引号
            var hasDialogue = cleanText.includes('\u300c') || cleanText.includes('"') || cleanText.includes('"');
            if (hasDialogue) {
                var placeholders = [];
                // 先处理中文引号「」
                _reDialogueCN.lastIndex = 0;
                var safeText = cleanText.replace(_reDialogueCN, function(m) {
                    var idx = placeholders.length;
                    placeholders.push('<span class="dialogue">' + escapeHtml(m) + '</span>');
                    return '<<PH' + idx + 'PH>>';
                });
                // 再处理英文引号""
                _reDialogueEN.lastIndex = 0;
                safeText = safeText.replace(_reDialogueEN, function(m) {
                    var idx = placeholders.length;
                    placeholders.push('<span class="dialogue">' + escapeHtml(m) + '</span>');
                    return '<<PH' + idx + 'PH>>';
                });
                // 先转义HTML，然后替换占位符
                _rePlaceholder.lastIndex = 0;
                html = '<p>' + escapeHtml(safeText).replace(_rePlaceholder, function(_, i) {
                    return placeholders[parseInt(i)];
                }) + '</p>';
            } else {

                var escaped = escapeHtml(cleanText);
                if (cleanText.indexOf('*') !== -1) {
                    _reBold.lastIndex = 0; _reItalic.lastIndex = 0;
                    html = '<p>' + escaped.replace(_reBold,
                        '<strong>$1</strong>').replace(_reItalic, '<em>$1</em>') + '</p>';
                } else {
                    html = '<p>' + escaped + '</p>';
                }
            }
        }

        // 如果有心声，在段落末尾添加心声图标（紧跟，不换行）
        if (hasThoughtInThisPara && thoughtId >= 0) {
            var trigger = createThoughtTriggerHTML(thoughtId, [allThoughts[thoughtId]]);
            if (html) {
                html = html.replace('</p>', '<span class="thought-inline">' + trigger +
                    '</span></p>');
            } else {
                // 心声单独占一行时，附加到前一个段落的末尾（不生成空段落）
                if (result.length > 0) {
                    result[result.length - 1] = result[result.length - 1].replace('</p>',
                        '<span class="thought-inline">' + trigger + '</span></p>');
                } else {
                    html = '<span class="thought-inline">' + trigger + '</span>';
                }
            }
        }

        result.push(html);
    });

    var finalOutput = result.join('') + chapterEndHtml;

    // 【性能监控】formatStory 执行时间
    if (_fmtStartTime > 0) {
        var _fmtElapsed = Date.now() - _fmtStartTime;
        if (_fmtElapsed > 50) {
            console.warn('[性能] formatStory 耗时 ' + _fmtElapsed + 'ms (文本长度: ' + _fmtTextLen + ')');
        }
    }

    return sanitizeHtml(finalOutput);
}
function createThoughtTriggerHTML(id, thoughts) {
    var count = thoughts.length;
    var countBadge = count > 1 ? '<span class="thought-count">' + count + '</span>' : '';
    // 气泡内容单独创建，不嵌套在trigger内（避免transform影响fixed定位）
    // content已经是HTML，不需要再escapeHtml
    var content = thoughts.map(function(t) {
        return '<div class="thought-item"><span class="thought-char">' + escapeHtml(t.character) +
            ':</span> ' + escapeHtml(t.text) + '</div>';
    }).join('');

    // 打字机每25ms调用formatStory，如果每次都createElement+appendChild到body，
    // 下一个tick又querySelectorAll删掉，造成大量无意义DOM操作
    if (!TypewriterBuffer.isTyping) {
        // 气泡直接append到body
        var bubble = document.createElement('div');
        bubble.className = 'thought-bubble';
        bubble.id = 'thought-' + id;
        // content已经是安全的HTML字符串，直接使用innerHTML
        bubble.innerHTML = '<div class="thought-content">' + content + '</div>';
        // 清理已存在的同名气泡
        var oldBubble = document.getElementById('thought-' + id);
        if (oldBubble) oldBubble.remove();
        document.body.appendChild(bubble);
    }

    return '<span class="thought-trigger" data-target="thought-' + id +
        '" data-action="toggle-thought" title="查看心声">' +
        '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>' +
        countBadge + '</span>';
}
function toggleThought(trigger) {

    // 原仅接受 trigger 参数；现 trigger 为 undefined 时回退到 this，两种调用方式都可用。
    trigger = trigger || this;
    var targetId = trigger.getAttribute('data-target');
    var bubble = document.getElementById(targetId);
    if (!bubble) {
        console.warn('心声气泡未找到:', targetId);
        return;
    }
    var isOpen = bubble.classList.contains('open');
    document.querySelectorAll('.thought-bubble.open').forEach(function(b) {
        b.classList.remove('open');
    });
    document.querySelectorAll('.thought-trigger.active').forEach(function(t) {
        t.classList.remove('active');
    });
    if (!isOpen) {
        bubble.style.visibility = 'hidden';
        bubble.style.opacity = '0';
        bubble.style.display = 'block';
        var rect = trigger.getBoundingClientRect();
        var bubbleW = 260,
            bubbleH = bubble.offsetHeight || 80,
            gap = 10;
        var left = rect.left + rect.width / 2 - bubbleW / 2;
        if (left < 8) left = 8;
        if (left + bubbleW > window.innerWidth - 8) left = window.innerWidth - bubbleW - 8;
        var top;
        if (rect.top - bubbleH - gap > 10) {
            top = rect.top - bubbleH - gap;
        } else {
            top = rect.bottom + gap;
        }
        bubble.style.left = left + 'px';
        bubble.style.top = top + 'px';
        bubble.style.width = bubbleW + 'px';
        bubble.style.visibility = '';
        bubble.style.opacity = '';
        bubble.style.display = '';
        bubble.classList.add('open');
        trigger.classList.add('active');
    }
}
// 防止重复注册全局点击事件
if (!window._thoughtBubbleClickHandler) {
    window._thoughtBubbleClickHandler = function(e) {
        if (!e.target.closest('.thought-trigger') && !e.target.closest('.thought-bubble')) {
            document.querySelectorAll('.thought-bubble.open').forEach(function(b) {
                b.classList.remove('open');
            });
            document.querySelectorAll('.thought-trigger.active').forEach(function(t) {
                t.classList.remove('active');
            });
        }
    };
    GlobalCleanup.registerListener(document, 'click', window._thoughtBubbleClickHandler);
}
// --- HUD渲染 ---

// 保留参数：3 处调用方（game.js:1753、phone-ui.js:4895/4969）以 data.hud 存在性作为
// "本轮有 HUD 数据"的信号，删除参数会丢失这层语义。hudData 未来若恢复显示需重新接入。
function renderHUD(hudData) {
    // hudData 当前未使用：原显示魅力/运气/心情，已改为仅显示游戏时间
    void hudData; // 显式标记参数有意忽略，避免 lint 误报
    GameTimeSystem.updateUI();
}
// --- 选项渲染 ---
function renderChoices(choices) {
    var container = document.getElementById('optionsContainer');
    if (!container) return;
    if (!choices || choices.length === 0) {
        container.innerHTML = '';
        return;
    }
    var toggleHtml =
        '<div class="choices-toggle" data-action="toggleChoicesPanel" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer;font-size:13px;color:var(--text-secondary);user-select:none;">' +
        '<span>选项 (' + choices.length + '个)</span>' +
        '<span id="choicesToggleIcon" style="transition:transform 0.2s;transform:rotate(-90deg);">▼</span></div>' +
        '<div id="choicesPanel" style="overflow:hidden;transition:max-height 0.3s ease;max-height:0px;">';

    var btnsHtml = choices.map(function(c, i) {
        var id = c.id || String.fromCharCode(65 + i);
        // 兼容多种AI输出格式：text/label/content/description/action
        var text = c.text || c.label || c.content || c.description || c.action || '';
        if (typeof text !== 'string') text = String(text);

        // 改用 data-* 属性 + addEventListener，彻底避免内联 JS 注入和引号转义问题
        var safeText = escapeHtml(text);
        var tagHtml = c.tag ?
            '<span class="badge badge-soft" style="margin-left:8px;font-size:10px;">' + escapeHtml(c.tag) +
            '</span>' : '';
        return '<button class="option-btn" data-choice-text="' + safeText + '">' +
            '<span class="option-index">' + id + '</span><span>' + escapeHtml(text) + '</span>' + tagHtml +
            '</button>';
    }).join('');
    container.innerHTML = toggleHtml + btnsHtml + '</div>';


    // 选项点击即发送（提升交互流畅度，无需双击或手动按发送）
    var btns = container.querySelectorAll('.option-btn[data-choice-text]');
    btns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var text = this.getAttribute('data-choice-text');
            var input = document.getElementById('customAction');
            if (!input) return;
            input.value = text;
            input.disabled = false;
            if (typeof sendAIRequest === 'function' && !isWaiting) {
                sendAIRequest(text);
            } else if (typeof UI !== 'undefined' && UI.toast) {
                UI.toast('AI 正在生成中，请稍候');
                input.focus();
            }
        });
    });

    // 旧代码面板初始 max-height:0px，许多玩家不知道要点击 "选项 (N个) ▶" 标题
    var panel = document.getElementById('choicesPanel');
    if (panel) {

        panel.style.transition = 'none';
        panel.style.maxHeight = '2000px';
        // 强制回流后立即恢复过渡，保证后续手动折叠/展开仍有动画
        void panel.offsetHeight;
        panel.style.transition = '';
    }
    var icon = document.getElementById('choicesToggleIcon');
    if (icon) icon.style.transform = 'rotate(0deg)';
}
function toggleChoicesPanel() {
    var panel = document.getElementById('choicesPanel');
    var icon = document.getElementById('choicesToggleIcon');
    if (!panel) return;
    if (panel.style.maxHeight === '0px') {
        panel.style.maxHeight = '2000px';
        if (icon) icon.style.transform = 'rotate(0deg)';
    } else {
        panel.style.maxHeight = '0px';
        if (icon) icon.style.transform = 'rotate(-90deg)';
    }
}

// ========================================
// 第5层: 数据管理 - NPC人物（累积 + 弹窗详情）
// ========================================

// 原 game.js 独立实现的 mergeCharacters（对象操作+自有模糊匹配）已废弃，
// CharacterMutator.mergeCharacters（数组操作+同款模糊匹配策略）为唯一入口。
// StateManager._syncLegacyMirror 自动维护 gameState.allCharacters 镜像供 UI 读取。
function mergeCharacters(chars) {
    if (!chars || chars.length === 0) return;

    // AIResponseMutator._applyCharacters 的重复实现（原 filter 逻辑完全一致）
    var filtered = (typeof CharacterMutator !== 'undefined' && CharacterMutator.filterOutPlayer)
        ? CharacterMutator.filterOutPlayer(chars)
        : chars;
    if (filtered.length === 0) return;
    if (typeof CharacterMutator !== 'undefined' && CharacterMutator.mergeCharacters) {
        CharacterMutator.mergeCharacters(filtered);
    }
    renderNpcList();

}
// ========================================
// 存档系统 - 数据层
// ========================================

// ── 保存到指定槽位 ──
function buildSaveData(customName, useCache) {
    // 更新游戏时长统计
    // 添加 gameState._stats 空值检查
    if (!gameState._stats) {
        gameState._stats = {
            startTime: Date.now(),
            totalTurns: 0,
            totalTokens: 0,
            maxTokensInTurn: 0,
            totalCharacters: 0,
            completedQuests: 0,
            totalPlayTime: 0
        };
    }
    if (gameState && gameState._stats && gameState._stats.startTime) {
        gameState._stats.totalPlayTime += Date.now() - gameState._stats.startTime;
        gameState._stats.startTime = Date.now();
    }
    // 确保版本号正确
    if (gameState) {
        gameState._version = GAME_VERSION;
        gameState._schemaVersion = (typeof SaveMigrator !== 'undefined') ? SaveMigrator.CURRENT_SCHEMA_VERSION : 1;
    }


    // 原版行为：每次都重新 JSON.stringify，永远保存最新状态
    // 新版的 useCache 缓存在同回合内用户修改后保存会得到旧数据，且缓存命中时跳过
    // totalPlayTime 累加和 _version 更新，导致游戏时长统计错误
    // 因此禁用缓存，始终走完整序列化路径

    // 打包记忆数据到存档中，确保存档包含完整游戏数据
    var memoryData = null;
    try {
        if (typeof EnhancedMemory !== 'undefined') {
            memoryData = {
                workingMemory: EnhancedMemory.workingMemory,
                shortTermMemory: EnhancedMemory.shortTermMemory,
                longTermMemory: EnhancedMemory.longTermMemory,
                stats: EnhancedMemory.stats,
                _injectionSnapshots: EnhancedMemory._injectionSnapshots || {},
                _summaryLayers: EnhancedMemory._summaryLayers || { near: [], mid: [], far: [] },
                _setupLayers: EnhancedMemory._setupLayers || { coreRules: '', worldSummary: '', fullSetup: '', compressed: false, extractTurn: -1, setupKeywords: [] }
            };
        }
    } catch(e) {
        console.warn('[buildSaveData] 打包记忆数据失败:', e);
    }

    var saveData = {
        name: customName || ((gameState && gameState.userPrompt) || '').substring(0, 20) || '未命名存档',
        prompt: (gameState && gameState.userPrompt) || '',
        time: new Date().toLocaleString(), // 原版用可读的本地化时间
        version: GAME_VERSION,
        state: gameState ? JSON.stringify(gameState) : '{}',
        memoryData: memoryData ? JSON.stringify(memoryData) : null
    };

    // 缓存序列化结果（读档时会清除这些缓存字段）
    if (gameState) {
        // 【P0修复】currentTurns 未定义导致 buildSaveData 抛 ReferenceError，存档完全不可用
        // 正确变量名是 gameState.currentTurn
        gameState._lastSaveTurn = gameState.currentTurn || 0;
        gameState._lastSaveState = saveData.state;
        gameState._lastSaveMemoryData = saveData.memoryData;
    }

    return saveData;
}


// 每次 schema 变更时递增 CURRENT_SCHEMA_VERSION，并注册对应迁移函数。
// loadFromSlot 会按顺序应用从旧 schemaVersion 到当前版本的所有迁移。
var SaveMigrator = {
    CURRENT_SCHEMA_VERSION: 2,
    _migrations: [],
    register: function(version, fn, desc) {
        this._migrations[version] = { fn: fn, desc: desc || '' };
    },
    migrate: function(parsed, fromVersion) {
        if (!parsed) parsed = {};
        var start = (fromVersion || 0) + 1;
        for (let v = start; v <= this.CURRENT_SCHEMA_VERSION; v++) {
            var m = this._migrations[v];
            if (m) {
                console.log('[SaveMigrator] 应用迁移 v' + v + ': ' + m.desc);
                parsed = m.fn(parsed) || parsed;
            }
        }
        parsed._schemaVersion = this.CURRENT_SCHEMA_VERSION;
        return parsed;
    }
};

// 注册历史迁移：v1 处理旧版字段兼容
SaveMigrator.register(1, function(parsed) {
    // 旧版 worldInfo 字段改名保留
    if (parsed.worldInfo) {
        parsed._worldInfoLegacy = parsed.worldInfo;
        delete parsed.worldInfo;
    }
    // 以下字段在旧存档中可能缺失，统一补默认值
    if (!parsed.pinnedModules) parsed.pinnedModules = {};
    if (!parsed.rollingSummary) parsed.rollingSummary = '';
    if (!parsed.allCharacters) parsed.allCharacters = {};
    if (!parsed.keyEvents) parsed.keyEvents = [];
    if (!parsed.worldSnapshot) parsed.worldSnapshot = {};
    if (!parsed.currentQuests) parsed.currentQuests = [];
    if (!parsed.relationships) parsed.relationships = [];
    if (!parsed.currentBag) parsed.currentBag = [];
    if (parsed.playerData === undefined) parsed.playerData = null;
    if (!parsed.favStories) parsed.favStories = [];
    if (!parsed.generatedNovel) parsed.generatedNovel = '';
    if (!parsed.conversationHistory) parsed.conversationHistory = [];
    if (typeof parsed.autoCompress === 'undefined') parsed.autoCompress = true;
    if (typeof parsed.useStream === 'undefined') parsed.useStream = true;
    if (typeof parsed.temperature === 'undefined') parsed.temperature = 0.8;
    if (typeof parsed.fontSize === 'undefined') parsed.fontSize = 16;
    if (typeof parsed.generateChoices === 'undefined') parsed.generateChoices = true;
    if (!parsed.protagonistSetup) parsed.protagonistSetup = {};
    if (!parsed._presetApps) parsed._presetApps = {};
    if (!parsed._undoHistory) parsed._undoHistory = [];
    if (!Array.isArray(parsed._worldModules)) parsed._worldModules = [];
    if (!Array.isArray(parsed._moments)) parsed._moments = [];
    if (!parsed._npcDiaries) parsed._npcDiaries = {};
    if (!parsed._chattedNpcs) parsed._chattedNpcs = {};
    if (!parsed._chatLogs) parsed._chatLogs = {};
    if (!parsed._mail) parsed._mail = [];
    if (!parsed._diary) parsed._diary = [];
    if (typeof parsed.userPrompt === 'undefined') parsed.userPrompt = '';
    if (typeof parsed.customStyle === 'undefined') parsed.customStyle = '';
    if (typeof parsed.systemPrompt === 'undefined') parsed.systemPrompt = '';
    if (typeof parsed.tokenCount === 'undefined') parsed.tokenCount = 0;
    if (typeof parsed.maxTokens === 'undefined') parsed.maxTokens = DEFAULT_MAX_TOKENS;
    if (typeof parsed.streamFailCount === 'undefined') parsed.streamFailCount = 0;
    if (!parsed.gameTime) parsed.gameTime = { date: '', time: '', period: '', weather: '', era: '' };
    if (typeof parsed._jailbreakPrompt === 'undefined') parsed._jailbreakPrompt = '';
    if (typeof parsed._assistantPrompt === 'undefined') parsed._assistantPrompt = '';
    if (typeof parsed._MAX_UNDO_HISTORY === 'undefined') parsed._MAX_UNDO_HISTORY = 50;
    if (!parsed.wordCountConfig) {
        parsed.wordCountConfig = {
            enabled: true, min: 1500, max: 3000,
            paragraphMin: 15, paragraphMax: 17,
            paragraphStyle: 'medium', lengthPreset: 'medium'
        };
    }
    if (!parsed._theaterContent) parsed._theaterContent = {};
    if (parsed._lastAIReply === undefined) parsed._lastAIReply = null;
    return parsed;
}, '旧版字段迁移（worldInfo 及缺失字段默认值）');


// 老存档中 time/date/unlockedAt 等字段是 toLocaleString 结果（本地时区字符串），
// 跨时区读档会显示错误。统一转为 Date.now() 时间戳，显示时再格式化。
SaveMigrator.register(2, function(parsed) {
    function _ts(v) {
        if (v == null) return v;
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
            var t = Date.parse(v);
            return isNaN(t) ? v : t;
        }
        return v;
    }
    function _migrateArr(arr, field) {
        if (!Array.isArray(arr)) return;
        for (var i = 0; i < arr.length; i++) {
            var it = arr[i];
            if (!it || typeof it !== 'object') continue;
            if (it[field] !== undefined) it[field] = _ts(it[field]);
        }
    }
    function _migrateObjDict(dict, field) {
        if (!dict || typeof dict !== 'object') return;
        Object.keys(dict).forEach(function(k) {
            var v = dict[k];
            if (Array.isArray(v)) _migrateArr(v, field);
            else if (v && typeof v === 'object' && v[field] !== undefined) v[field] = _ts(v[field]);
        });
    }
    // _chatLogs: { npcName: [{ time }] }
    if (parsed._chatLogs) _migrateObjDict(parsed._chatLogs, 'time');
    // _mail: [{ time }]
    if (parsed._mail) _migrateArr(parsed._mail, 'time');
    // _diary: [{ date }]
    if (parsed._diary) _migrateArr(parsed._diary, 'date');
    // _moments: [{ posts: [{ time }] }] 或直接是 posts 数组
    if (Array.isArray(parsed._moments)) {
        for (var mi = 0; mi < parsed._moments.length; mi++) {
            var m = parsed._moments[mi];
            if (m && Array.isArray(m.posts)) _migrateArr(m.posts, 'time');
        }
    }
    // _worldModules: 数组，各模块类型不同
    // 遍历所有模块，对常见的 items/posts/comments/messages 数组做 time/date 迁移
    if (Array.isArray(parsed._worldModules)) {
        parsed._worldModules.forEach(function(mod) {
            if (!mod || typeof mod !== 'object') return;
            ['items', 'posts', 'comments', 'messages', 'entries'].forEach(function(arrKey) {
                if (Array.isArray(mod[arrKey])) {
                    _migrateArr(mod[arrKey], 'time');
                    _migrateArr(mod[arrKey], 'date');
                }
            });
            // 模块级 time/date（如 mail 模块单条）
            if (mod.time !== undefined) mod.time = _ts(mod.time);
            if (mod.date !== undefined) mod.date = _ts(mod.date);
        });
    }
    // _theaterContent: { key: { content, time } }
    if (parsed._theaterContent && typeof parsed._theaterContent === 'object') {
        Object.keys(parsed._theaterContent).forEach(function(k) {
            var t = parsed._theaterContent[k];
            if (t && t.time !== undefined) t.time = _ts(t.time);
        });
    }
    // _stats.recentLogs: [{ time }]
    if (parsed._stats && parsed._stats.recentLogs) _migrateArr(parsed._stats.recentLogs, 'time');
    // pinnedModules 中的模块
    if (parsed.pinnedModules && typeof parsed.pinnedModules === 'object') {
        Object.keys(parsed.pinnedModules).forEach(function(k) {
            var mod = parsed.pinnedModules[k];
            if (!mod || typeof mod !== 'object') return;
            ['items', 'posts', 'comments', 'messages'].forEach(function(arrKey) {
                if (Array.isArray(mod[arrKey])) {
                    _migrateArr(mod[arrKey], 'time');
                    _migrateArr(mod[arrKey], 'date');
                }
            });
        });
    }
    return parsed;
}, '时间字段从字符串迁移为数字时间戳（跨时区兼容）');

function safeSaveSlot(slot) {
    saveToSlot(slot).catch(function(e) {
        console.error('保存失败:', e);
        UI.toast('保存失败');
    });
}
async function saveToSlot(slot) {

    return withSaveLock(async function() {
        try {
            await SaveDB.set(slot, buildSaveData(''));
            UI.toast('保存成功');
            openSaveLoadModal();
        } catch (e) {
            console.error('saveToSlot出错:', e);
            UI.toast('保存失败: ' + translateError(e.message || e));
        }
    }, 'saveToSlot:' + slot);
}
async function loadFromSlot(slot) {

    return withSaveLock(async function() {
    if (typeof gameState !== 'undefined' && gameState) {
        gameState._loading = true;
        gameState._loadingSince = Date.now();
    }
    try {
        var data = null;

        if (slot === '__autoSaveBackup__') {
            try {
                var _backupRaw = Storage.get(Storage.KEYS.AUTO_SAVE_BACKUP);
                if (_backupRaw) data = JSON.parse(_backupRaw);
            } catch (e) {
                console.warn('[loadFromSlot] 读取崩溃备份失败:', e);
            }
        } else {
            try {
                data = await SaveDB.get(slot);
            } catch (e) {
                console.warn('IndexedDB读取失败，尝试localStorage:', e);
            }
        }
        if (!data) {
            UI.toast('该存档位为空');
            return;
        }

        if (!SaveDB._verifyChecksum(data)) {
            console.error('[loadFromSlot] 存档校验和失败，尝试从备份恢复');
            var backup = await SaveDB.restore(slot);
            if (backup) {
                data = backup;
            } else {
                UI.toast('存档校验失败且备份不可用');
                return;
            }
        }

        // 解析状态
        var parsed = null;
        try {
            parsed = JSON.parse(data.state);
        } catch (e) {
            UI.toast('存档数据损坏，无法读取');
            console.error('存档解析失败:', e);
            return;
        }

        // 版本兼容性检查
        var saveVersion = parsed._version || data.version || '1.0.0';
        var schemaVersion = parsed._schemaVersion || 0;
        console.log('[存档] 版本:', saveVersion, '当前:', GAME_VERSION, 'schema:', schemaVersion);


        delete parsed._lastSaveTurn;
        delete parsed._lastSaveState;
        delete parsed._lastSaveMemoryData;


        if (typeof SaveMigrator !== 'undefined') {
            parsed = SaveMigrator.migrate(parsed, schemaVersion);
        } else {
            // 兼容旧逻辑
            if (saveVersion !== GAME_VERSION && parsed.worldInfo) {
                parsed._worldInfoLegacy = parsed.worldInfo;
                delete parsed.worldInfo;
            }
        }
        
        // Fix Issue 43: Merge instead of replace to preserve runtime references
        if (!gameState) { gameState = {}; }
        Object.keys(parsed).forEach(function(k) { gameState[k] = parsed[k]; });


        // 此前 loadFromSlot 用 70+ 行 if(!gameState.xxx) 逐字段补全，与 createDefaultGameState 高度重复
        // 现在统一调用 ensureGameStateFields，遍历 createDefaultGameState 的 key 补全缺失字段
        // 同时处理 maxTokens 历史 bug（80000）和 _stats.startTime 重置
        ensureGameStateFields(gameState);
        if (gameState) gameState._version = GAME_VERSION;


        if (typeof QuestSystem !== 'undefined' && QuestSystem._cachedGuidanceQuest) {
            QuestSystem._cachedGuidanceQuest = null;
        }

        // 恢复记忆数据（从存档中还原EnhancedMemory）
        if (data.memoryData) {
            try {
                var memParsed = JSON.parse(data.memoryData);
                if (typeof EnhancedMemory !== 'undefined' && memParsed) {
                    if (memParsed.workingMemory) EnhancedMemory.workingMemory = memParsed.workingMemory;
                    if (memParsed.shortTermMemory) EnhancedMemory.shortTermMemory = memParsed.shortTermMemory;
                    if (memParsed.longTermMemory) EnhancedMemory.longTermMemory = memParsed.longTermMemory;
                    if (memParsed.stats) EnhancedMemory.stats = memParsed.stats;
                    if (memParsed._injectionSnapshots) EnhancedMemory._injectionSnapshots = memParsed._injectionSnapshots;
                    if (memParsed._summaryLayers) EnhancedMemory._summaryLayers = memParsed._summaryLayers;
                    if (memParsed._setupLayers) EnhancedMemory._setupLayers = memParsed._setupLayers;
                    EnhancedMemory.saveToStorage();
                }
            } catch(memErr) {
                console.warn('[loadFromSlot] 恢复记忆数据失败:', memErr);
            }
        }

        // 关闭所有弹窗
        UI.hideModal('saveLoadModal');
        restoreGame();
        // 【C3修复】读档后直接在 withSaveLock 内保存迁移后的状态
        // 旧代码调用 autoSave()，会 setTimeout 2 秒后触发二次 withSaveLock，
        // 期间 restoreGame 渲染可能修改 StateManager.entities，导致 buildSaveData 捕获中间态脏数据
        try {
            if (typeof SaveDB !== 'undefined') {
                await SaveDB.set(0, buildSaveData('', true));
            }
        } catch (e) {
            console.warn('[loadFromSlot] 读档后保存失败:', e);
        }

        // 触发事件：CHAT_CHANGED（切换聊天）
        if (typeof TavernHelperCompat !== 'undefined') {
            TavernHelperCompat.emit('CHAT_CHANGED', {
                chatId: (gameState && gameState.saveKey) || slot || 'default',
                timestamp: Date.now()
            });
        }
    } catch (e) {
        console.error('loadFromSlot出错:', e);
        UI.toast('读档失败: ' + translateError(e.message || e));
    } finally {

        if (typeof gameState !== 'undefined' && gameState) {
            gameState._loading = false;
            gameState._loadingSince = null;
        }
        // 读档后回填作者备注到 UI（存档里的值覆盖 UI 当前显示）
        if (typeof _restoreAuthorsNoteFields === 'function') {
            _restoreAuthorsNoteFields();
        }
    }
    }, 'loadFromSlot:' + slot); // end withSaveLock
}
// 提取存档行数据格式化的公共辅助函数
function _formatSaveSlotData(data) {
    if (!data) return null;
    return {
        name: data.name || data.prompt || '未命名',
        time: data.time || ''
    };
}

async function deleteFromSlot(slot) {
    try {
        var ok = await UI.confirm('删除存档', '确定删除这个存档？');
        if (!ok) return;
        await withSaveLock(async function() {
            await SaveDB.set(slot, null);
        }, 'deleteFromSlot:' + slot);
        renderSaveUI();
    } catch (e) {
        console.error('deleteFromSlot出错:', e);
        UI.toast('删除失败');
    }
}

async function requestNpcReply(playerText) {
    // 先清理旧的 AbortController，避免竞态条件
    if (npcChatState.abortController) {
        try { npcChatState.abortController.abort(); } catch(e) {}
    }
    npcChatState.isSending = true;

    npcChatState.abortController = new AbortController();
    var sendEl = document.getElementById('npcChatSend');
    if (sendEl) sendEl.disabled = true;
    // 显示loading
    var messages = document.getElementById('npcChatMessages');
    if (!messages) {
        npcChatState.isSending = false;
        if (sendEl) sendEl.disabled = false;
        return;
    }
    var loading = document.createElement('div');
    loading.className = 'npc-chat-loading';
    loading.id = 'npcChatLoading';

    // 原 CSS ::before { content: '对方正在输入中' } 硬编码，无法国际化/动态化
    loading.setAttribute('data-loading-text', '对方正在输入中');
    document.querySelector('.chat-detail-page').appendChild(loading);
    try {
        var name = npcChatState.npcName;
        var c = gameState.allCharacters[name] || {};
        // 构建对话上下文
        var systemMsg = '你是「' + name + '」，正在和玩家一对一聊天。你不是在扮演谁——你就是这个角色，用你自己的性格、语气和态度来回应。\n\n' + '【角色信息】\n' + '姓名: ' + name + '\n' +
            (c.title ? '身份: ' + c.title + '\n' : '') + (c.relation ? '与主角关系: ' + c.relation + '\n' :
            '') + (c.favorability !== undefined ? '对主角好感度: ' + c.favorability + '（范围-100到100，0为中立）\n' : '') + (c
                .desc ? '当前状态: ' + c.desc + '\n' : '');
        if (c.details && c.details.length > 0) {
            systemMsg += c.details.map(function(d) {
                return d.key + ': ' + d.value;
            }).join('\n') + '\n';
        }
        // 注入主角完整信息，让 NPC 能正确理解和称呼玩家
        var playerName = gameState.playerName || (gameState.worldSnapshot && gameState.worldSnapshot.player && gameState.worldSnapshot.player.name) || '主角';
        systemMsg += '【玩家信息】\n名字: ' + playerName + '\n';
        // 注入玩家设定（用精简版避免重复挤占context，记忆系统已有结构化数据）
        var _compactSetup = getCompactSetupForSubFunction();
        if (_compactSetup && _compactSetup.trim()) {
            systemMsg += '【玩家设定】\n' + _compactSetup.trim() + '\n';
        }
        // 注入主角状态快照
        if (gameState.worldSnapshot && gameState.worldSnapshot.player) {
            var _pSnap = gameState.worldSnapshot.player;
            if (_pSnap.identity) systemMsg += '身份: ' + _pSnap.identity + '\n';
            if (_pSnap.personality) systemMsg += '性格: ' + _pSnap.personality + '\n';
            if (_pSnap.stats && _pSnap.stats.length > 0) {
                systemMsg += '属性: ' + _pSnap.stats.map(function(s) { return s.label + ':' + s.value; }).join(', ') + '\n';
            }
        }
        // 注入增强记忆（让NPC了解剧情进展和角色关系变化）
        if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.buildSmartInjection) {
            var _npcMemText = EnhancedMemory.buildSmartInjection();
            if (_npcMemText) {
                systemMsg += '\n【剧情记忆】\n' + _npcMemText + '\n';
            }
        }
        // 注入世界书（让NPC知道世界设定细节）

        // getWorldInfoInjection() 已是统一入口（game.js:204-223），内部自带缓存 + 异常保护，
        // 走旧 WorldInfo.buildInjection 直调会绕过本轮缓存，产生重复扫描。
        if (typeof getWorldInfoInjection === 'function') {
            var _npcWI = getWorldInfoInjection();
            var _npcWIText = (isObject(_npcWI)) ? (_npcWI.text || '') : (_npcWI || '');
            if (_npcWIText) {
                systemMsg += '\n【世界知识】\n' + _npcWIText + '\n';
            }
        }
        // 加上剧情背景
        if (gameState && gameState.rollingSummary) {
            systemMsg += '\n【剧情背景】\n' + gameState.rollingSummary + '\n';
        }
        // 【提示词重设计】从「9条硬性规则」改为「角色感+引导」
        // 作为 AI，我更愿意看到"我是谁 + 玩家期待什么样的体验"，而不是"必须X不要Y"
        systemMsg += '\n【你正在做的事】\n' +
            '你用手机和「' + name + '」一对一私聊——这是真实的角色扮演，不是演给你看。\n' +
            '你让玩家感觉是在和「' + name + '」本人说话，所以回复要带这个角色自己的语气、节奏和态度。\n\n' +
            '【好回复的质感】\n' +
            '- 短消息为主（30字左右一条），把一段对话拆成1-6条——拆条比长段更自然，像真人在打字\n' +
            '- 文字表情可以自然穿插：[吃瓜][狗头][白眼][傲娇]等已有格式，也可以自己创造\n' +
            '- 富消息可以偶尔用：[照片:海边日落][定位:图书馆] 等，混在文字里\n' +
            '- 给出3个玩家可以接着说的话，让玩家感到有选择空间\n' +
            '- 这是日常私聊，专注于角色之间的关系和反应\n\n' +
            '【程序需要的输出】\n' +
            '你的输出会喂给聊天界面渲染——保持 JSON 结构，replies 是 NPC 发的消息列表，choices 是给玩家点的选项。\n' +
            '原始 JSON 文本最稳；markdown 代码块包裹会让聊天界面渲染失败，玩家就看不到消息了。\n' +
            '{"replies": ["消息1","消息2",...], "choices": ["玩家回复1","回复2","回复3"]}';
        // 注入预设写作风格（让NPC私聊与主剧情风格一致）
        systemMsg += (typeof getPresetStyleBlock === 'function' ? getPresetStyleBlock() : '');
        // 构建消息列表
        var chatMessages = [{
            role: 'system',
            content: systemMsg
        }];
        // 加入对话历史（最近10条）
        var recentChat = npcChatState.chatHistory.slice(-10);
        if (recentChat.length > 0) {
            recentChat.forEach(function(msg) {
                chatMessages.push({
                    role: msg.role === 'player' ? 'user' : 'assistant',
                    content: msg.text
                });
            });
        }
        // 只有不在历史里的消息才单独加（比如开局打招呼）
        var lastInHistory = npcChatState.chatHistory.length > 0 ? npcChatState.chatHistory[npcChatState
            .chatHistory.length - 1] : null;
        var alreadyInHistory = lastInHistory && lastInHistory.role === 'player' && lastInHistory
            .text === playerText;
        if (!alreadyInHistory) {
            chatMessages.push({
                role: 'user',
                content: playerText
            });
        }

        chatMessages = _applyUseSysprompt(chatMessages);
        var response = await callAI(chatMessages, {
            stream: false,

            max_tokens: 1024,
            antiRepeat: true,

            signal: npcChatState.abortController ? npcChatState.abortController.signal : undefined
        });
        // 移除loading
        var loadingEl = document.getElementById('npcChatLoading');
        if (loadingEl) loadingEl.remove();
        // 解析回复
        var replies = [];
        var choices = [];
        var parsed = parseJSONHelper(response);
        if (parsed) {
            if (parsed.replies && Array.isArray(parsed.replies)) {
                replies = parsed.replies;
            } else if (parsed.reply) {
                replies = [parsed.reply];
            }
            choices = parsed.choices || [];
        } else {
            var extractedReply = extractStr(response, 'reply');
            if (extractedReply) {
                replies = [extractedReply];
                choices = extractArr(response, 'choices') || [];
            } else {
                // 【ReDoS 修复】用 stripCodeBlocks 线性扫描替代 /```[\s\S]*?```/g
                // JSON 正则 /\{[\s\S]*\}/g 是贪婪匹配，非 lazy，ReDoS 风险较低，保留
                var _codeStripped = (typeof stripCodeBlocks === 'function')
                    ? stripCodeBlocks(response)
                    : response.replace(/```[\s\S]*?```/g, '');
                var plainText = _codeStripped.replace(/\{[\s\S]*\}/g, '')
                    .trim();
                if (plainText) replies = [plainText];
            }
        }
        if (replies.length === 0) replies = ['...'];
        // 分批显示NPC消息（一次API调用，分多条气泡显示）
        var delay = 0;
        replies.forEach(function(msg, i) {
            TimerManager.setTimeout('npcReply_' + i, function() {
                addNpcChatBubble('npc', msg);
                // 最后一条消息显示完后，渲染选项
                if (i === replies.length - 1) {
                    if (choices.length > 0) {

                        // 改为 data-action 委托；参数用 escapeAttr(JSON.stringify(...)) 整体转义后嵌入单引号属性
                        // 【与 phone-ui.js 统一】单引号属性 + escapeAttr（转义 \ ' " < > \n \r）
                        var choicesHtml = choices.map(function(ch) {
                            return '<button class="npc-chat-choice" type="button" data-action="selectNpcChatChoice" data-args=\'' + escapeAttr(JSON.stringify([ch])) + '\'>' + escapeHtml(ch) + '</button>';
                        }).join('');
                        document.getElementById('npcChatChoices').innerHTML =
                            choicesHtml;
                    } else {
                        document.getElementById('npcChatChoices').innerHTML = '';
                    }
                }
            }, delay);
            delay += 300 + Math.random() * 400;
        });
        // 好感度可能变化，更新到权威源 CharacterMutator（→ StateManager → allCharacters 镜像）
        // 【全量修复-P0】原代码直接改 gameState.allCharacters[name].favorability，
        // 绕过 CharacterMutator 导致 StateManager.get('entities.characters') 返回陈旧好感度

        // index.html 静态加载，运行时必然存在；保留兜底反而让陈旧数据流入视图别名
        if (parsed && parsed.favorability !== undefined) {
            if (typeof CharacterMutator !== 'undefined' && CharacterMutator.updateCharacter) {
                CharacterMutator.updateCharacter(name, function(c) {
                    c.favorability = parsed.favorability;
                    c.favor = parsed.favorability;  // 兼容旧字段
                    return c;
                });
            }
            // 【数据联通】触发记忆页/回顾页等所有依赖页面刷新

            renderNpcList();
        }
        // 联动1：把这次私聊摘要加入剧情记忆（避免剧情AI忘记NPC私聊内容）
        if (replies.length > 0) {
            // 【动态化】移除 slice(0, 3) 硬上限——私聊摘要应保留完整内容
            // 旧代码只保留前 3 条回复，后续回复丢失，AI 看不到完整私聊上下文
            var chatSummary = name + '与玩家私聊：' + replies.join(' / ');
            if (window.EnhancedMemory && EnhancedMemory.addImportantEvent) {
                try {
                    EnhancedMemory.addImportantEvent({
                        content: chatSummary,
                        importance: 4,
                        source: 'npc_chat',
                        type: 'private_chat'
                    });
                } catch (e) { /* 静默失败，不影响聊天 */ }
            }
        }
        // 联动2：广播聊天日志更新

    } catch (e) {
        if (e.name === 'AbortError') return;
        var loadingEl2 = document.getElementById('npcChatLoading');
        if (loadingEl2) loadingEl2.remove();
        addNpcChatBubble('npc', '（对话出错了: ' + e.message + '）');
        console.error('NPC对话失败:', e);
    } finally {
        npcChatState.isSending = false;

        npcChatState.abortController = null;
        var sendBtn = document.getElementById('npcChatSend');
        if (sendBtn) sendBtn.disabled = false;
        var inputEl = document.getElementById('npcChatInput');
        if (inputEl) inputEl.focus();
    }
}


// ========================================
// 日志子系统兜底生成器
// 当 AI 未返回对应 world 模块时，从现有游戏状态生成基础内容，避免空白占位。
// ========================================
function ensureLogFallbacks(storyText, aiWorldModules) {
    if (!gameState) return;
    if (!Array.isArray(gameState._worldModules)) gameState._worldModules = [];
    var modules = gameState._worldModules;
    var hasType = function(t) { return modules.some(function(m) { return m && m.type === t; }); };
    var playerName = gameState.playerName || (gameState.playerData && gameState.playerData.name) || '主角';
    var chars = gameState.allCharacters || {};
    var charList = Object.keys(chars).map(function(k) { return chars[k]; }).filter(Boolean);
    var bag = gameState.currentBag || gameState.bag || [];
    var quests = gameState.currentQuests || [];
    var events = gameState.keyEvents || [];
    var turn = (gameState._stats && gameState._stats.totalTurns) || 0;

    // accumulate 类型（moments/diary/forum）首次生成后 hasType() 永远为 true，
    // 但 AI 后续轮次可能不再返回，需按"本轮是否返回"决定是否生成兜底，而非"历史是否曾有"。
    var _aiTypesThisTurn = {};
    if (Array.isArray(aiWorldModules)) {
        aiWorldModules.forEach(function(m) {
            if (m && m.type) _aiTypesThisTurn[m.type] = true;
        });
    }
    var _aiReturned = function(t) { return !!_aiTypesThisTurn[t]; };

    // 排行榜：按好感度排序的角色榜
    if (getLogFeatureFlag('rank') && !hasType('ranking') && charList.length > 0) {
        var ranked = charList.slice().sort(function(a, b) { return (b.favorability || 0) - (a.favorability || 0); }).slice(0, 5);
        modules.push({
            type: 'ranking',
            title: '角色好感度榜',
            items: ranked.map(function(c) { return { name: c.name || '未知', value: (c.favorability || 0) + ' 好感' }; })
        });
    }

    // 商店：从背包物品 + 默认商品生成
    if (getLogFeatureFlag('shop') && !hasType('shop')) {
        var goods = [];
        if (bag.length > 0) {
            bag.slice(0, 5).forEach(function(it) {
                goods.push({ name: it.name || it.title || '物品', price: Math.max(1, Math.round((it.value || it.price || 5) * 0.8)), count: it.count || 1 });
            });
        }
        if (goods.length === 0) {
            goods = [
                { name: '面包', price: 2, count: 10 },
                { name: '药水', price: 5, count: 5 },
                { name: '地图', price: 3, count: 3 }
            ];
        }

        modules.push({ type: 'shop', title: '杂货铺', items: goods });
    }

    // 朋友圈：从最近事件/角色生成

    // 改为：主角用剧情摘要、NPC用 desc/最近事件拼接，并准备多套模板按角色名hash分散。

    // 改为按本轮是否返回判断，让朋友圈随轮次持续增长。
    if (getLogFeatureFlag('moments') && !_aiReturned('moments') && (events.length > 0 || charList.length > 0 || storyText)) {
        var _moodTemplates = [
            '又是充实的一天。',
            '今天的天气不错，心情也跟着好起来。',
            '最近的江湖，风起云涌啊。',
            '闲下来反而不知道该做什么了。',
            '有些事，想得多了反而头疼。',
            '听到一些有趣的消息，记上一笔。'
        ];
        var posts = [];
        if (storyText) {
            var sentences = storyText.split(/[。！？\n]/).filter(function(s) { return s.trim().length > 10; }).slice(0, 2);
            sentences.forEach(function(s) {
                posts.push({ author: playerName, text: s.trim().slice(0, 60), time: Date.now() });
            });
        }
        charList.slice(0, 3).forEach(function(c, idx) {
            var cName = c.name || '匿名';
            // 用角色名 hash 选模板，避免所有人同一句
            var _seed = 0;
            for (var _i = 0; _i < cName.length; _i++) _seed = ((_seed << 5) - _seed + cName.charCodeAt(_i)) | 0;
            var _tpl = _moodTemplates[Math.abs(_seed) % _moodTemplates.length];
            var _npcText = c.mood || c.desc || _tpl;
            // 若 desc 过长或与模板无关，叠加最近事件让内容更有信息量
            if (events.length > 0 && (idx === 0 || _seed % 2 === 0)) {
                var _ev = events[idx % events.length];
                var _evText = typeof _ev === 'string' ? _ev : (_ev.content || _ev.title || '');
                if (_evText) _npcText = _tpl + ' 听说' + _evText.slice(0, 24);
            }
            posts.push({ author: cName, text: _npcText.slice(0, 60), time: Date.now() });
        });
        if (posts.length > 0) {
            modules.push({ type: 'moments', title: '朋友圈', posts: posts });
        }
    }

    // 邮件：每轮生成系统轮次记录邮件 + 任务通知

    // 第1轮的邮件使 hasType('mail') 永远为 true，后续轮次不再生成系统邮件。
    // 改为：每轮都追加"第N轮冒险记录"系统邮件（去重），任务邮件仅在无邮件时生成。
    if (getLogFeatureFlag('mail') && turn > 0) {
        var _existingMailMods = modules.filter(function(m) { return m && m.type === 'mail'; });
        var _allMails = [];
        _existingMailMods.forEach(function(m) {
            if (Array.isArray(m.items)) _allMails = _allMails.concat(m.items);
        });
        // 检查本轮系统邮件是否已存在（避免重复）
        var _turnMailSubject = '第 ' + turn + ' 轮冒险记录';
        var _hasTurnMail = _allMails.some(function(ml) { return ml && ml.subject === _turnMailSubject; });
        if (!_hasTurnMail) {
            var newMail = { from: '系统', subject: _turnMailSubject, content: '你的旅程已进入第 ' + turn + ' 轮，世界正因你的选择而改变。', read: false, time: Date.now() };
            // 追加到已有 mail 模块，或新建
            if (_existingMailMods.length > 0) {
                if (!_existingMailMods[0].items) _existingMailMods[0].items = [];
                _existingMailMods[0].items.push(newMail);
            } else {
                modules.push({ type: 'mail', title: '收件箱', items: [newMail] });
            }
        }
        // 任务邮件：仅在完全没有邮件时生成（避免每轮重复推送相同任务邮件）
        if (_allMails.length === 0 && quests.length > 0) {
            var questMails = quests.slice(0, 2).map(function(q) {
                if (q && q.title) return { from: '任务委员会', subject: q.title, content: q.desc || '请查看任务详情并尽快完成。', read: false, time: Date.now() };
                return null;
            }).filter(Boolean);
            if (questMails.length > 0) {
                if (_existingMailMods.length > 0) {
                    _existingMailMods[0].items = _existingMailMods[0].items.concat(questMails);
                } else {
                    modules.push({ type: 'mail', title: '收件箱', items: questMails });
                }
            }
        }
    }

    // 日记：从剧情文本生成摘要 + 为每个 NPC 生成日记条目

    // 兜底须用 items 而非 entries，否则多条日记会被当成一条空记录丢失。

    // 改为按本轮是否返回判断，让日记随轮次持续增长。
    if (getLogFeatureFlag('diary') && !_aiReturned('diary') && storyText) {
        var summary = storyText.slice(0, 80) + (storyText.length > 80 ? '...' : '');
        var diaryEntries = [{ npc: playerName, date: Date.now(), content: summary, mood: '平静', memos: [] }];
        // 为每个 NPC 也生成日记条目（用 desc/mood 作为内容）
        charList.forEach(function(c) {
            if (!c.name) return;
            var npcContent = c.desc || c.mood || ('今天遇到了' + playerName + '。');
            diaryEntries.push({
                npc: c.name,
                date: Date.now(),
                content: npcContent.slice(0, 80),
                mood: c.mood || '平静',
                memos: []
            });
        });
        modules.push({ type: 'diary', title: '冒险日记', items: diaryEntries });
    }

    // 论坛：从事件生成帖子


    // 原兜底把多个帖子塞进一个模块的 posts 数组，导致只有一条空帖子。
    // 改为：每个事件展开为独立的 comments 模块。

    if (getLogFeatureFlag('forum') && !_aiReturned('comments') && !_aiReturned('forum') && events.length > 0) {
        events.slice(0, 2).forEach(function(ev) {
            var content = typeof ev === 'string' ? ev : (ev.content || ev.title || '发生了什么');
            modules.push({
                type: 'comments',
                title: content.slice(0, 20),
                author: '路人',
                main: content,
                content: content,
                comments: []
            });
        });
    }

    // 成就：注入默认成就，确保成就页有内容
    if (getLogFeatureFlag('achieve') && typeof AchievementSystem !== 'undefined' && !hasType('achievements') && !hasType('achievement')) {
        var defaultAchievements = [
            { id: 'ach_first_step', name: '踏上旅程', desc: '完成第一轮剧情', category: 'STORY', rarity: 'common', condition: 'storyCount >= 1', icon: '👣' },
            { id: 'ach_meet_npc', name: '初次相识', desc: '结识第一位 NPC', category: 'SOCIAL', rarity: 'common', condition: 'npcCount >= 1', icon: '🤝' },
            { id: 'ach_complete_quest', name: '任务达人', desc: '完成一个任务', category: 'STORY', rarity: 'rare', condition: 'storyCount >= 3', icon: '📜' },
            { id: 'ach_explore', name: '初探世界', desc: '推进 5 轮剧情', category: 'EXPLORE', rarity: 'rare', condition: 'storyCount >= 5', icon: '🗺️' }
        ];
        modules.push({ type: 'achievements', title: '成就', items: defaultAchievements });
    }

    // 聊天：为所有角色自动生成初始聊天消息（AI 未主动发消息时兜底）
    if (getLogFeatureFlag('chat')) {

    // 聊天列表永远只有1条消息。增加每轮兜底：从剧情/事件中提取话题，让1-2个NPC主动发消息。
    if (!gameState._chattedNpcs) gameState._chattedNpcs = {};
    if (!gameState._chatLogs) gameState._chatLogs = {};
    charList.forEach(function(c) {
        var name = c.name;
        if (!name) return;
        // 将角色标记为可聊天对象
        gameState._chattedNpcs[name] = true;
        if (!gameState._chatLogs[name]) gameState._chatLogs[name] = [];
        // 若该角色没有任何聊天记录，用 desc 作为初始消息
        if (gameState._chatLogs[name].length === 0) {
            var greetText = c.desc || ('你好，我是' + name + '。');
            gameState._chatLogs[name].push({
                role: 'npc',
                from: name,
                text: greetText.slice(0, 60),
                time: Date.now()
            });
        }
    });


    // 使聊天列表随轮次增长。用轮次+NPC名去重，避免同轮重复。
    if (turn > 1 && storyText && charList.length > 0) {
        // 统计本轮已生成的兜底消息数（通过 _turn 标记）
        var _turnTag = '_fallback_turn_' + turn;
        var _alreadyThisTurn = 0;
        charList.forEach(function(c) {
            var logs = gameState._chatLogs[c.name] || [];
            if (logs.length > 0 && logs[logs.length - 1] && logs[logs.length - 1]._turnTag === _turnTag) {
                _alreadyThisTurn++;
            }
        });
        if (_alreadyThisTurn === 0) {
            // 选取1-2个NPC发消息（按轮次轮换，避免每次都是同一个）
            var _npcCount = Math.min(2, charList.length);
            var _startIdx = (turn - 1) % charList.length;
            var _chatTopics = [
                '刚才的事你听说了吗？',
                '最近的动静可真不小。',
                '有空聊聊吗？',
                '我这边有些消息，不知当讲不当讲。',
                '今天的情况有点复杂。'
            ];
            for (var _n = 0; _n < _npcCount; _n++) {
                var _npc = charList[(_startIdx + _n) % charList.length];
                if (!_npc || !_npc.name) continue;
                var _logs = gameState._chatLogs[_npc.name];
                if (!_logs) { _logs = []; gameState._chatLogs[_npc.name] = _logs; }
                // 从剧情中提取一句话作为话题
                var _storySnip = storyText.split(/[。！？\n]/).filter(function(s) { return s.trim().length > 8; });
                var _topic = _storySnip.length > 0 ? _storySnip[0].trim().slice(0, 30) : _chatTopics[_n % _chatTopics.length];
                _logs.push({
                    role: 'npc',
                    from: _npc.name,
                    text: _topic,
                    time: Date.now(),
                    _turnTag: _turnTag
                });
            }
        }
    }


    }

    // AI 连续多轮不返回 world 模块时会导致 accumulate 类型无限增长。
    // 此处对每种类型保留最近 20 条，与 renderWorldModules 的上限一致。
    var _typeCounts = {};
    var _trimmed = [];
    for (var _i = modules.length - 1; _i >= 0; _i--) {
        var _m = modules[_i];
        if (!_m || !_m.type) continue;
        _typeCounts[_m.type] = (_typeCounts[_m.type] || 0) + 1;
        if (_typeCounts[_m.type] <= 20) _trimmed.unshift(_m);
    }
    // 【全量修复-P2】方向反转：写入权威源 StateManager，_syncLegacyMirror 自动回写 gameState._worldModules
    if (typeof StateManager !== 'undefined' && StateManager.set) {
        StateManager.set('ui.worldModules', _trimmed, { silent: true });
    } else if (typeof gameState !== 'undefined') {
        gameState._worldModules = _trimmed;
    }
}


function registerGameStartListener() {
    var _origStartBtn = document.getElementById('btnCreateWorld');
    if (_origStartBtn) {
        _origStartBtn.addEventListener('click', function() {
            var gpEl = document.getElementById('worldDescription');
            if (gpEl) Storage.set(Storage.KEYS.LAST_PROMPT, gpEl.value || '');
        }, true);
    }
}


if (typeof window.RuntimeBridge === 'undefined') window.RuntimeBridge = {};
window.RuntimeBridge.formatStory = formatStory;
window.RuntimeBridge.mergeCharacters = mergeCharacters;
window.RuntimeBridge.renderChoices = renderChoices;
// renderNpcList 定义在 phone-ui.js 中，由 phone-ui.js 负责注册到 RuntimeBridge
window.RuntimeBridge.buildSystemPrompt = buildSystemPrompt;
window.RuntimeBridge.buildSaveData = buildSaveData;
window.RuntimeBridge.sendAIRequest = sendAIRequest;
window.RuntimeBridge._isThinkingContent = _isThinkingContent;
window.RuntimeBridge._cleanUnrecognizedTags = _cleanUnrecognizedTags;
window.RuntimeBridge._reDecorTagsTyping = _reDecorTagsTyping;
