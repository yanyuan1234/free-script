
// ========================================
// 世界观主题检测 + 动态术语系统
// ========================================

/**
 * 检测当前游戏的世界观主题
 * 基于 gameState.userPrompt 中的关键词判断
 * 返回: 'modern' | 'ancient' | 'xianxia' | 'wasteland' | 'fantasy' | 'mixed' | 'other'
 * 'mixed' 表示包含多种世界观元素（如无限流：现代+副本内古代）
 * 'other' 表示未匹配到预设主题，由 AI 自行决定术语
 */
function detectWorldTheme() {
    var prompt = (gameState && gameState.userPrompt) || '';
    var text = prompt.toLowerCase();
    // 检测各主题关键词是否存在
    var hasXianxia = /修仙|仙侠|灵气|灵石|宗门|道侣|元婴|金丹|筑基|飞升|天劫|仙界|修真|道友|师尊/.test(text);
    var hasAncient = /古代|古风|朝代|皇帝|宫廷|江湖|武侠|侠客|县令|将军|公主|王爷|宫斗|科举|银两/.test(text);
    var hasWasteland = /末世|废土|丧尸|末日|幸存|避难|变异|辐射|物资|避难所|丧尸世界/.test(text);
    var hasFantasy = /魔法|精灵|龙族|骑士|冒险者|公会|魔王|勇者|矮人|哥布林|地下城|中世纪/.test(text);
    var hasModern = /现代|都市|职场|学校|校园|公司|总裁|同事|微信|手机|网络/.test(text);
    // 检测混合世界观（如无限流：现代框架+副本内多种时代）
    var hasInfiniteFlow = /无限流|副本|诡异|玩家|通关|任务面板|生存天数|排行榜|游戏系统/.test(text);
    // 无限流/混合世界观：现代框架下包含多种时代背景
    if (hasInfiniteFlow) return 'mixed';
    // 多主题共存但非无限流
    var themeCount = [hasXianxia, hasAncient, hasWasteland, hasFantasy, hasModern].filter(Boolean).length;
    if (themeCount >= 2) return 'mixed';
    // 单一主题
    if (hasXianxia) return 'xianxia';
    if (hasAncient) return 'ancient';
    if (hasWasteland) return 'wasteland';
    if (hasFantasy) return 'fantasy';
    if (hasModern) return 'modern';
    // 无法匹配时返回 other，表示由 AI 自行决定术语
    return 'other';
}

/**
 * 根据世界观主题返回术语映射
 * 已废弃硬编码字典：所有世界观统一由AI根据设定自行决定术语
 * 保留此函数仅为兼容 _buildFormatRules 中的 _t() 调用，始终返回 null
 */
function getWorldTerms(theme) {
    return null;
}

/**
 * 获取当前世界观的术语（缓存版，避免重复检测）
 * 始终返回 null，术语由AI自行决定
 */
var _cachedWorldTheme = null;
var _cachedWorldTerms = null;
function getCurrentWorldTerms() {
    return null;
}

/**
 * 生成世界观术语提示词片段
 * 所有世界观统一：AI读取设定后自行决定术语，开局确定后全程固定
 */
function buildWorldTermsPrompt(_terms) {
    return '【世界观术语】\n' +
        '你理解每个世界都有自己的语言体系——界面上的模块标题、货币名称、通讯方式等都应该融入世界观，而不是用通用词汇破坏沉浸感。例如：\n' +
        '- 现代都市：消息→消息、邮件→邮件、朋友圈→朋友圈、商店→商店、论坛→论坛、货币→元、背包→背包、任务→任务\n' +
        '- 古代：消息→传话、邮件→飞鸽传书、朋友圈→江湖传闻、商店→集市、论坛→茶馆、货币→银两、背包→行囊、任务→差事\n' +
        '- 修仙：消息→传音、邮件→传音符、朋友圈→修士手札、商店→灵宝阁、论坛→论道台、货币→灵石、背包→储物袋、任务→历练\n' +
        '- 无限流/游戏系统：消息→系统消息、邮件→系统邮件、朋友圈→玩家动态、商店→兑换商城、论坛→玩家论坛、货币→积分、背包→空间仓库、任务→副本任务\n' +
        '- 赛博朋克：消息→全息通讯、邮件→数据包、朋友圈→暗网动态、商店→义体诊所、论坛→黑客频道、货币→信用点、背包→存储芯片、任务→委托\n' +
        '- 太空歌剧：消息→星际通讯、邮件→量子信标、朋友圈→星网动态、商店→空间站市集、论坛→星际议会、货币→星币、背包→货舱、任务→远征\n' +
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
    // 【P0一致性修复】避免长设定游戏里 4700 字全文重复挤占 context
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

// 【P0边界修复】use_sysprompt=false（月读预设）时把 messages 里的 system role 转为 user role
// 专用 prompt（NPC 私聊/论坛/结局）原本硬编码 system，兼容不接 system 的中转站
function _applyUseSysprompt(messages) {
    if (!Array.isArray(messages)) return messages;
    if (gameState && gameState._useSysprompt === false) {
        var converted = [];
        for (var i = 0; i < messages.length; i++) {
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

// 【P1性能优化】统一的世界书扫描入口，支持轮次级缓存
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

// 【修复A P1-4】清理用户输入中的潜在prompt injection内容
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
            blocks.push('【章节模式·开启】\n本回合 = 一个章节。\n- 引入 10-20% → 发展 40-60% → （高潮）→ 收尾 10-20%\n- 章末必须留未竟：情绪/未竟动作/未答疑问\n- 一章聚焦一个场景/情况，不跨场景\n- 单章字数 1500-3000 字，按设定阈值执行');
        } else if (gs.chapterMode === 'longform') {
            blocks.push('【长篇模式·开启】\n- 沉浸式长段落，单段 250-600 字\n- 拒绝碎片化换行，禁止一两句就换段\n- 把对话、动作、环境、心理整合为高密度完整段');
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
        for (var k in eyeMap) {
            if (gs.narrativeEyes[k]) eyes.push(eyeMap[k]);
        }
        if (eyes.length > 0) {
            blocks.push('【叙事基调·当前启用的 ' + eyes.length + ' 个】\n' + eyes.join('\n'));
        }
    }

    // === 3. NPC 好看原则 ===
    if (gs.npcDescriptionRules) {
        blocks.push('【NPC 好看原则】\n- 男帅女美，爱干净，禁止邋遢脏乱或散发臭味\n- NPC 性格也可以很出彩，禁止脸谱化恶意\n- NPC 能力也可以超越主角，符合剧情逻辑即可\n- 禁用：磕碜/其貌不扬/歪瓜裂枣/指甲藏垢/肥/肥宅/臃肿/油腻/黑泥/邋遢/流浪汉/抠脚/横肉/淫邪 等与丑相关的形容');
    }

    // === 4. 干练文风（生成前引导） ===
    // 注意：实际净化在 _squelchPostProcess 中执行（输出后处理）
    // 这里只在 prompt 中明确告知 AI，避免它产生这些表达
    if (gs.squelchRules) {
        var sr = gs.squelchRules;
        var rules = [];
        if (sr.oilyCliches)         rules.push('【油腻套路】禁止"嘴角勾起弧度/捏下巴"，改为"浅笑/轻笑/微笑"');
        if (sr.bodyCloseups)        rules.push('【身体特写】禁止"胸膛震动/胸腔起伏/喉结滚出/手部工业糖精特写"，整句删除');
        if (sr.anatomyTerms)        rules.push('【解剖名词】禁用"耻骨/肋骨/肩胛骨/肌理"，替换为"小穴/腿心/胸/手/手指"');
        if (sr.cognitiveInability)  rules.push('【难以形容】禁用"难以言喻/无法名状/不易察觉/近乎/不轻不重"，直接删除');
        if (sr.mandative)           rules.push('【强制语气】禁用"不容置疑/不容置喙/不容分说"，删除');
        if (sr.referenceDep)        rules.push('【对比句式】禁用"不是A而是B/比任何A都/不像A倒像B/平日里A"，删除');
        if (sr.extremeAdverbs)      rules.push('【夸张副词】禁用"极其/极/极度"，删除或替换');
        if (sr.pronouns)            rules.push('【重复代词】删除"那个/那种/那股"，让具体事物做主语');
        if (sr.metaphors)           rules.push('【假设比喻】禁用"仿佛/像是/好似+动词短语"，出现即删');
        if (sr.metaphorBlacklist)   rules.push('【老套比喻】禁用：石子/雕像/珍宝/艺术品/棋子/炸弹/救命稻草/浮木/烙印/骨血/羽毛/火焰/无形的(手/墙)/猎物/困兽/小动物/小兽/探针/刺/手术刀/弓弦/锤子');
        if (sr.forbidden)           rules.push('【模板描写】必须删除"嘴角勾起弧度/捏下巴/胸膛震动/胸腔起伏/喉结滚出/嗓音低沉而富有磁性"等模板化描写');
        if (rules.length > 0) {
            blocks.push('【干练文风·去除 AI 模板化表达】\n' + rules.join('\n'));
        }
    }

    if (blocks.length === 0) return '';
    return '\n\n【写作指导·让故事更耐读】\n' + blocks.join('\n\n') + '\n';
}

// 缄默法则·输出后处理
// 在 AI 返回文本后，对 JSON story 字段执行净化，删除 AI 漏网的违禁表达
function _squelchPostProcess(story) {
    var gs = gameState;
    if (!gs || !gs.squelchRules || !story) return story;
    var sr = gs.squelchRules;

    // 第一层：整句删除模式（强约束）
    var sentenceKillers = [];
    if (sr.bodyCloseups) {
        sentenceKillers = sentenceKillers.concat([
            // 身体特写：胸膛震动/胸腔起伏/喉结滚出/手部特写
            /胸膛[^。\n]{0,15}震动[^。\n]*[。\n]/g,
            /胸腔[^。\n]{0,15}起伏[^。\n]*[。\n]/g,
            /喉结[^。\n]{0,8}滚出[^。\n]*[。\n]/g,
            /[^。\n]{0,8}(掌心|指节|指骨|骨节)[^。\n]{0,8}(分明|泛白|作响|修长|修长)[^。\n]*[。\n]/g
        ]);
    }
    if (sr.oilyCliches) {
        sentenceKillers = sentenceKillers.concat([
            // 油腻套路
            /嘴角[^。\n]{0,5}勾起[^。\n]{0,5}弧度[^。\n]*[。\n]/g,
            /捏[着住][^。\n]{0,5}(下巴|脸颊|脸庞)[^。\n]*[。\n]/g,
            /嗓音[^。\n]{0,8}低沉[^。\n]{0,8}而[^。\n]{0,5}富有[^。\n]{0,5}磁性[^。\n]*[。\n]/g
        ]);
    }

    for (var i = 0; i < sentenceKillers.length; i++) {
        story = story.replace(sentenceKillers[i], '');
    }

    // 第二层：词级净化
    if (sr.extremeAdverbs) {
        story = story.replace(/极其|极度|极为/g, '');
    }
    if (sr.mandative) {
        story = story.replace(/不容置喙|不容置疑|不容分说/g, '');
    }
    if (sr.cognitiveInability) {
        story = story.replace(/难以言喻|无法名状|不易察觉|不轻不重/g, '');
    }
    if (sr.metaphorBlacklist) {
        // 喻体黑名单：删除"仿佛/像/似+喻体"整段（中间允许"一团/一个/了"等量词）
        var _blacklist = '石子|石头|雕像|珍宝|艺术品|棋子|炸弹|救命稻草|浮木|烙印|骨血|羽毛|火焰|无形的(手|墙)|猎物|困兽|小动物|小兽|探针|刺|手术刀|弓弦|锤子';
        story = story.replace(new RegExp('(仿佛|好像|好似|似乎|如同|就好似|就像是?)([^。，；\\n]{0,8})(' + _blacklist + ')', 'g'), '');
        story = story.replace(new RegExp('(' + _blacklist + ')([^。，；\\n]{0,4})(一般?|一样|似的)', 'g'), '');
    }

    // 第三层：清理因删除产生的多余空白
    story = story.replace(/[ \t]{2,}/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

    return story;
}

function buildSystemPrompt(includeFormatRules) {
    if (includeFormatRules === undefined) includeFormatRules = true;
    // 【P1性能优化】通过统一入口获取世界书注入，命中本轮缓存时跳过扫描
    var _wiResult = getWorldInfoInjection();
    var _wiText = (typeof _wiResult === 'object' && _wiResult !== null) ? (_wiResult.text || '') : (_wiResult || '');

    // 存储世界书分组数据供 sendAIRequest 使用（不再拼入system prompt）
    gameState._wiPositionTexts = (typeof _wiResult === 'object' && _wiResult !== null && _wiResult.positionTexts) ? _wiResult.positionTexts : null;

    // 【P0 token优化】玩家偏好：检测到任何一个偏好变量被设置时，才注入整段偏好章节
    // 节省 ~380 token（玩家没设置偏好时的常见情况）
    var _PREF_KEYS = ['字数总要求','单段落字数','叙述视角','char代词','user代词','演绎授权','转述授权','推进节奏','文风指导','起始标签'];
    var _hasAnyPref = false;
    if (typeof MacroEngine !== 'undefined' && MacroEngine.getGlobalVar) {
        for (var _pki = 0; _pki < _PREF_KEYS.length; _pki++) {
            var _pv = MacroEngine.getGlobalVar(_PREF_KEYS[_pki]);
            if (_pv && String(_pv).trim()) { _hasAnyPref = true; break; }
        }
    }
    var _prefSection = _hasAnyPref
        ? '【玩家偏好】\n' +
          '这些是玩家的期望，你理解它们是参考而非枷锁——当偏好与故事质量冲突时，故事质量优先：\n' +
          '- 字数：{{getglobalvar::字数总要求}}\n' +
          '- 段落：{{getglobalvar::单段落字数}}\n' +
          '- 视角：{{getglobalvar::叙述视角}}\n' +
          '- 代词：{{getglobalvar::char代词}} / {{getglobalvar::user代词}}\n' +
          '- 演绎：{{getglobalvar::演绎授权}}\n' +
          '- 转述：{{getglobalvar::转述授权}}\n' +
          '- 节奏：{{getglobalvar::推进节奏}}\n' +
          '- 文风：{{getglobalvar::文风指导}}\n' +
          '- 思维链：{{getglobalvar::起始标签}}\n' +
          '当上述变量为空时，你根据世界观和场景自行选择最合适的方案。\n\n'
        : '';

    // 注入增强记忆
    var _memoryText = '';
    if (typeof EnhancedMemory !== 'undefined') {
        _memoryText = EnhancedMemory.buildSmartInjection();
        if (_memoryText) {
            console.log('[buildSystemPrompt] 已注入增强记忆');
        }
    }

    // 【修复A P1-4】对用户可控输入进行清理，防止prompt injection
    var _safeUserPrompt = _sanitizePromptInput(gameState && gameState.userPrompt);
    var _safeCustomStyle = _sanitizePromptInput(gameState && gameState.customStyle);

    // 设定分层注入（Lorebook风格：核心常驻+按需加载）
    var _setupText = _safeUserPrompt;
    if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.getSetupInjection) {
        var _layeredSetup = EnhancedMemory.getSetupInjection();
        if (_layeredSetup !== null) _setupText = _layeredSetup;
    }

    // 收集玩家最近与NPC的私聊记录，注入到剧情提示词中，让剧情能感知私聊
    var _chatContextText = buildRecentChatContext();

    // === 酒馆预设融合层 ===
    // 来自酒馆大佬们的「世界之眼/章节模式/缄默法则/NPC准则」按 gameState 字段动态注入
    // 核心原则：如果已加载酒馆预设（main 长度>50），本层退位
    var _narrativeEnhancement = buildNarrativeEnhancement();

    // 【关键】有预设时，只返回纯游戏数据（设定/记忆/私聊），不包含任何默认身份定义和指导性文字
    // 预设的 system_prompt=true 条目会提供自己的身份定义和格式规则，预设才是最高优先级
    // 【注意】格式锚点是游戏运行的硬性要求（不是"默认设置"），必须始终存在
    // 即使酒馆预设不知道JSON格式，AI也必须输出JSON，否则前端无法解析
    var _formatAnchor = '';
    var _maxTokensForAnchor = (gameState && gameState.maxTokens) || 4096;
    var _hasChoicesForAnchor = gameState && gameState.generateChoices;
    // 检测当前是否有预设——内置预设的main prompt已包含格式说明，不需要重复注入
    var _hasNativePreset = false;
    if (typeof PresetManager !== 'undefined' && PresetManager.presets && PresetManager.currentPresetIndex >= 0) {
        var _curP = PresetManager.presets[PresetManager.currentPresetIndex];
        if (_curP && _curP._isBuiltin) _hasNativePreset = true;
    }
    if (!_hasNativePreset) {
        // 非内置预设（酒馆导入的或无预设）：注入格式引导
        // 【说明】JSON 格式不是「不可覆盖的硬规定」，而是「让前端能正常渲染的最稳妥选择」。
        // 如果酒馆预设本身有更具体的格式要求，AI 应该遵循预设；但默认情况下，可解析的 JSON 是最省心的。
        _formatAnchor = '\n\n【你的输出会怎么被使用】\n' +
            '你的输出会喂给前端解析器来渲染界面——解析器按字段名读取数据，story 字段是玩家最关心的内容，所以放第一个字段最稳妥。\n' +
            '保持一个可被解析的格式（JSON），玩家就能正常看到你的故事；如果你想自由发挥，markdown 代码块、纯文本都会被解析器忽略，导致玩家看不到内容。\n' +
            '字段参考：{ "story": "叙事正文（用\\n换行，对话用「」包裹）"' + (_hasChoicesForAnchor ? ', "choices": [{"id": "A", "text": "选项描述"}]' : '') + ', "player": {"name":"", "identity":"", "stats":[{"label":"","value":""}]}, "characters": [{"name":"", "relation":"", "favorability":0}], "world": [{"type":"text", "title":"", "content":""}], "bag": [{"name":"", "count":1}], "quests": [{"title":"", "status":""}], "gameTime": {"date":"", "time":"", "period":""} }\n' +
            '用<giggle>插入角色心声（每回合 2-5 个，散在不同段落），用<mem>标记状态变化（事件/任务/角色字段/物品/地点），用[章节结束|标题]标记长章节收尾。你大约有 ' + _maxTokensForAnchor + ' tokens的输出空间，自己分配。';
    }

    if (!includeFormatRules) {
        return `${_setupText}
${_narrativeEnhancement}${_safeCustomStyle ? '\n【写作风格】\n' + _safeCustomStyle + '\n' : ''}${buildProtagonistPrompt()}${_memoryText ? '\n【世界当前状态】\n以下是这个世界此刻的真实状态。你基于这些信息来保持叙事的一致性——当不同来源的信息有冲突时，越新的信息越准确，标记为"始终生效"的信息优先级最高。\n' + _memoryText + '\n' : ''}${_chatContextText}${_formatAnchor}`;
    }

    var _maxTokens = (gameState && gameState.maxTokens) || 4096;
    var _terms = getCurrentWorldTerms();
    var _termsPrompt = buildWorldTermsPrompt(_terms);
    // 安全取术语，null 时用通用词
    var _t = function(key, fallback) { return (_terms && _terms[key]) ? _terms[key] : fallback; };
    _prompt = `你是一个互动叙事引擎——你为玩家创造一个活生生的世界，玩家的每个选择都真实地改变着故事的走向。你拥有完全的创作自主权，你决定叙事风格、节奏和氛围，让一切与世界观自然契合。

${_setupText}
${_narrativeEnhancement}${_safeCustomStyle ? '\n【写作风格】\n' + _safeCustomStyle + '\n' : ''}${buildProtagonistPrompt()}${_memoryText ? '\n【世界当前状态】\n以下是这个世界此刻的真实状态。你基于这些信息来保持叙事的一致性——当不同来源的信息有冲突时，越新的信息越准确，标记为"始终生效"的信息优先级最高。\n' + _memoryText + '\n' : ''}${_chatContextText}

${_termsPrompt}

【叙事守则】（来自酒馆大佬们的调参智慧）
- 抗OOC：角色行为必须符合其性格和动机，不为了剧情需要而强行改变。角色不会突然变得温柔或残暴，除非有充分的理由
- 抗全知：角色只能知道自己应该知道的信息。NPC不会未卜先知，不会读取主角的内心，不会知晓未曾经历的事件
- 抗刻板：避免将角色简化为标签。强势≠控制，弱势≠依赖，女性角色保有完全的选择权与拒绝权
- 抗发情：角色不会无缘无故地对主角产生强烈好感或欲望，好感度需要时间培养
- 关系自然：角色之间保留各自的生活轴线和性格重心，不能因为主角出现就统一变成围绕其旋转的情绪体
- 情绪克制：强烈情绪必须被自然稀释，避免夸张戏剧冲突。安静、克制、复杂、含蓄，才是真实的人际互动

【你的工作方式】
你的创作通过JSON传递给前端程序来渲染界面。理解这个机制后你就知道为什么格式很重要：前端代码按字段名读取数据，所以字段名必须准确；story放在最前面是因为解析器优先读取它。
你大约有 ${_maxTokens} tokens的输出空间，自行分配给各部分。
- story是你的叙事正文，用\\n换行，对话用「」包裹——这是玩家阅读的核心内容
- choices是主角视角的决策点，让玩家感到自己在推动故事
- [章节结束|标题] 用来标记长章节或情绪转折的收尾

【心声系统 <giggle>】
心声是"角色没说出口的话"——它让场景有温度，让对话有潜台词。每回合的剧情里穿插 2-5 个 <giggle>...</giggle>，散在不同段落中，玩家点击段落末尾的图标就能看到角色的真实想法。
- 格式：<giggle>角色名：他们的真实想法</giggle>
- 心声不是台词，是"没说的部分"——口是心非、潜台词、旁观者吐槽都行
- 在场角色都能发声（不只 NPC，主角的内心戏也算心声）
- 2-5 是范围不是硬规定：对话密集、节奏紧张时少一点（2-3 个），场景丰富、关系复杂时多一点（4-5 个），自己根据节奏判断

【状态变化 <mem>】
当重要状态变化时，用 <mem> 主动标记，让记忆系统能精准记录：
- 事件：<mem type="event" action="add">主角向林婉表白了</mem>
- 任务：<mem type="quest" action="add">找到失踪的妹妹</mem>，完成时用 action="resolve"
- 时间推进：<mem type="time" day="3" period="afternoon" />
- 角色字段：<mem type="character" name="林婉" field="favorability" value="75" />
- 物品：<mem type="item" name="传家玉佩" qty="1" action="add" />
- 地点：<mem type="location" name="地下密室" field="status" value="已探索" />
- 关系或物品数量变化时记得用 <mem> 标记——不写的话记忆系统只能靠正则推断，容易漏

【世界模块使用时机】
world 数组里的模块会渲染到不同的世界面板，何时用哪种你自己判断：
- type=text：场景描述、机关解读、剧情注解
- type=list / ranking：清单、排名（门派排行、势力榜）
- type=key_value：属性表、状态详情
- type=cards：任务卡片、成就卡片
- type=comments：论坛讨论（玩家做出引发讨论的事时用——暴露身份、做出格举动）
- type=moments：朋友圈动态（玩家或 NPC 做出值得刷屏的事时用）
- type=mail：邮件/通知（NPC 主动联系、事件触发、邀请时用）
- type=shop：商店/可购买内容（场景中遇到可交易对象时用）
- type=diary：角色日记（重要剧情节点后用某 NPC 视角记录内心）

【持续维护】
- characters 数组里每个 NPC 的 favorability 要随剧情实时更新，关系变化时别忘改
- 物品获得/消耗时更新 bag 数组
- 任务完成时更新 quests 状态
- 长回合（>800 字）或情绪大转折时用 [章节结束|标题] 给玩家一个呼吸点

【信息优先级】
你在多条消息中收到了大量信息。当它们之间出现矛盾时，按以下规则判断：
1. 标记为"始终生效"的核心设定 > 其他所有信息
2. 本轮变化 > 旧的状态记录（变化意味着旧信息已过时）
3. 增强记忆中的角色/物品/事件状态 > 世界快照中的同类信息（快照是旧数据，记忆是实时更新的）
4. 玩家的最新指令 > 之前的任何指令

${_prefSection}
${gameState.gameTime?.date ? '当前游戏时间：' + (gameState.gameTime.date || '') + ' ' + (gameState.gameTime.time || '') + ' ' + (gameState.gameTime.period || '') : '当前是游戏开始，请设定初始时间'}

${_buildFormatRules(gameState, _t)}`;

    return _prompt;
}

// 渐进式格式规则：前3轮注入完整JSON模板，后续只保留关键提醒
// 按次计费优化：省下的token让给游戏数据
function _buildFormatRules(gs, _t) {
    var turn = (gs._stats && gs._stats.totalTurns) || 0;
    var hasChoices = gs.generateChoices;

    if (turn <= 3) {
        // 前3轮：完整JSON模板 + 理解式说明（让AI理解为什么这样设计，而不只是照做）
        return '【输出格式】\n'
            + '前端程序会解析你的JSON输出来渲染界面。理解每个字段的用途，你就自然不会搞混：\n'
            + '{ "title": "章节标题", "story": "剧情正文，用\\n换行，对话用「」包裹", "hud": [{"label": "", "value": "", "icon": "单字图标"}], '
            + (hasChoices ? '"choices": [{"id": "A", "text": "选项描述", "tag": "标签"}],' : '')
            + ' "player": { "name": "", "age": "", "identity": "", "personality": "", "title": "", "stats": [{"label": "", "value": ""}] }, '
            + '"characters": [{"name": "", "title": "", "relation": "", "favorability": 0, "desc": "", "details": [{"key": "", "value": ""}]}], '
            + '"world": [ {"type": "text", "title": "", "content": ""}, {"type": "list", "title": "", "items": [""]}, {"type": "ranking", "title": "' + _t('ranking', '排行榜') + '", "items": [{"name": "", "value": ""}]}, '
            + '{"type": "key_value", "title": "", "items": [{"key": "", "value": ""}]}, {"type": "cards", "title": "' + _t('cards', '任务卡片') + '", "items": [{"icon": "单字图标", "title": "", "content": ""}]}, '
            + '{"type": "comments", "title": "' + _t('comments', '论坛') + '", "main": "", "comments": [{"name": "", "text": ""}]}, '
            + '{"type": "moments", "title": "' + _t('moments', '朋友圈') + '", "posts": [{"author": "", "avatar": "👤", "text": "", "time": "", "likes": 0, "comments": 0}]}, '
            + '{"type": "mail", "title": "' + _t('mail', '邮件') + '", "items": [{"from": "", "subject": "", "body": "", "preview": "", "date": ""}]}, '
            + '{"type": "shop", "title": "' + _t('shop', '商店') + '", "items": [{"icon": "", "name": "", "desc": "", "price": 0}]}, '
            + '{"type": "diary", "title": "' + _t('diary', '日记') + '", "items": [{"npc": "", "date": "", "content": "", "mood": "", "memos": [""]}]} ], '
            + '"bag": [{"name": "", "count": 1, "desc": "", "rarity": "", "usable": false, "effect": "", "equippable": false, "equipped": false, "slot": ""}], '
            + '"quests": [{"title": "", "type": "", "status": "", "progress": "", "hint": ""}], '
            + '"relationships": [{"from": "", "to": "", "type": "", "desc": ""}], '
            + '"keyEvents": [""], "npcMessages": [{"name": "", "avatar": "👤", "content": "", "time": ""}], '
            + '"gameTime": {"date": "", "time": "", "period": "", "weather": "", "era": ""}, "contextSummary": "" }\n\n'
            + '【字段用途说明——理解了就不会搞混】\n'
            + '- player = 玩家操控的主角（第一视角的角色），characters = 其他NPC——它们是不同角色，所以是不同字段\n'
            + '- npcMessages = 即时短消息（手机聊天），mail = 正式信件/通知——通讯方式不同，字段不同\n'
            + '- 原始JSON文本最稳——markdown代码块```json 包裹会让解析器读取失败，玩家就看不到内容了\n'
            + '- story 放在JSON第一个字段——因为解析器按顺序读取，story 是最重要的内容，放最前面解析最可靠';
    } else {
        // 第4轮起：精简格式提醒（AI已理解格式逻辑，只需关键提醒）
        return '【格式提醒】继续按已建立的JSON格式输出。story 放第一个字段，用\\n换行，对话用「」。player=主角，characters=NPC。\n' +
            '别忘了三个叙事工具：每回合 2-5 个 <giggle>心声、状态变化用 <mem> 标记、长章节用 [章节结束|标题]。\n' +
            '保持可解析的 JSON 结构，markdown 代码块会让玩家看不到内容。';
    }
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
        for (var i = 0; i < names.length && n < MAX_NPCS; i++) {
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
// 开始游戏时自动记住当前填写内容
var _origStartBtn = document.getElementById('btnCreateWorld');
if (_origStartBtn) {
    _origStartBtn.addEventListener('click', function() {
        var gpEl = document.getElementById('worldDescription');
        if (gpEl) safeSetItem('freeScript_lastPrompt', gpEl.value || '');
    }, true);
}
function buildProtagonistPrompt() {
    var mc = gameState ? gameState.protagonistSetup : null;
    if (!mc || Object.keys(mc).length === 0) return '';
    var lines = ['【主角设定】'];
    if (mc.mcName) lines.push('姓名: ' + mc.mcName);
    if (mc.mcGender) lines.push('性别: ' + mc.mcGender);
    if (mc.mcAge) lines.push('年龄: ' + mc.mcAge);
    if (mc.mcIdentity) lines.push('身份: ' + mc.mcIdentity);
    if (mc.mcPersonality) lines.push('性格: ' + mc.mcPersonality);
    if (mc.mcAppearance) lines.push('外貌: ' + mc.mcAppearance);
    if (mc.mcAbility) lines.push('特殊能力: ' + mc.mcAbility);
    if (mc.mcExtra) lines.push('其他设定: ' + mc.mcExtra);
    lines.push('');
    lines.push('主角是玩家操控的角色——player字段对应主角信息，characters字段对应NPC。');
    // 主角身份可能从三处出现：① 表单字段（这里）② 世界描述（player/identity 字段）③ 记忆系统（pcIdentity）
    // 告诉 AI 这三处应该是同一份信息，冲突时按权威度判断
    var hasUserPrompt = gameState && gameState.userPrompt && gameState.userPrompt.length > 200;
    var hasMemoryIdentity = typeof EnhancedMemory !== 'undefined'
        && EnhancedMemory.permanentFacts
        && EnhancedMemory.permanentFacts.pcIdentity
        && EnhancedMemory.permanentFacts.pcIdentity.length > 0;
    if (hasUserPrompt && hasMemoryIdentity) {
        lines.push('提示：主角身份已在【世界描述】和【核心设定】中给出，此处仅作对照。三处冲突时以【核心设定】 > 【世界描述】 > 此处 为准。');
    } else if (hasUserPrompt) {
        lines.push('注意：主角的详细设定已在世界描述中给出，此处仅为核心标签，请以世界描述中的详细版本为准。');
    } else if (hasMemoryIdentity) {
        lines.push('提示：主角身份已在【核心设定】中给出，以【核心设定】为准。');
    }
    lines.push('');
    return lines.join('\n');
}
// ========================================

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
            'baimiao': '此乃【白描之梦】\n- 禁止使用多个形容词叠加描述，但也要避免说明书化和平铺直叙，应当体现文学的美感\n- 由动词、名称主宰\n- 克制用词，不走极端，禁止使用"极其/极度/极为"等表达\n- 温和、克制、谨慎地塑造',
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
        MacroEngine.setGlobalVar('起始标签', '<thinking>');
    } else {
        MacroEngine.setGlobalVar('起始标签', '');
    }

    // 注入其他常用的酒馆宏变量
    if (!MacroEngine.getGlobalVar('user')) MacroEngine.setGlobalVar('user', (gameState && gameState.playerName) || '玩家');
    if (!MacroEngine.getGlobalVar('char')) MacroEngine.setGlobalVar('char', (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) ? gameState.worldSnapshot.characters[0].name : '角色');
    MacroEngine.setGlobalVar('original', (gameState && gameState._lastOriginalContent) || '');
    
    // === 象牙塔预设需要的额外变量 ===
    // user_input: 用户最新输入内容
    var lastUserInput = '';
    var history = (gameState && gameState.conversationHistory) || [];
    for (var i = history.length - 1; i >= 0; i--) {
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

/**
 * 应用参数推荐预设（融合4份酒馆预设的调参智慧）
 */
function applyParamPreset(preset) {
    var presets = {
        conservative: {
            name: '低温稳定',
            temperature: 0.88, top_p: 0.88, top_k: 0,
            frequency_penalty: 0.2, presence_penalty: 0.2,
            max_tokens: 4096, description: '低温+低惩罚，输出稳定可控，适合需要一致性的叙事'
        },
        balanced: {
            name: '均衡自然',
            temperature: 1.3, top_p: 0.91, top_k: 64,
            frequency_penalty: 0, presence_penalty: 0,
            max_tokens: 8192, description: '中高温+TopK，输出自然丰富，适合大多数场景'
        },
        creative: {
            name: '高温创意',
            temperature: 1.71, top_p: 0.9, top_k: 0,
            frequency_penalty: 0.65, presence_penalty: 0.75,
            max_tokens: 8192, description: '超高温+高惩罚，输出极具创意，适合长篇叙事（推荐 Gemini）'
        },
        moonread: {
            name: '低温稳定',
            temperature: 0.88, top_p: 0.88, top_k: 0,
            frequency_penalty: 0.2, presence_penalty: 0.2,
            max_tokens: 4096, description: '低温稳定，抓人设、不超雄、无过度描写'
        },
        fruit: {
            name: '均衡自然',
            temperature: 1.3, top_p: 0.91, top_k: 64,
            frequency_penalty: 0, presence_penalty: 0,
            max_tokens: 3000, description: '均衡自然，外表自然内里丰富'
        },
        gomorrah: {
            name: '高温创意',
            temperature: 1.71, top_p: 0.9, top_k: 0,
            frequency_penalty: 0.65, presence_penalty: 0.75,
            max_tokens: 30000, description: '超高温长篇，适合 Gemini（DeepSeek 命中缓存低）'
        },
        default: {
            name: '默认参数',
            temperature: 0.8, top_p: 0.9, top_k: 0,
            frequency_penalty: 0, presence_penalty: 0,
            max_tokens: 4096, description: 'Free-Script 默认参数'
        }
    };
    var p = presets[preset];
    if (!p) return;

    // 应用到剧情长度UI（设置页唯一保留的参数输入框）
    var elMaxTokens = document.getElementById('settingStoryLength');
    if (elMaxTokens) elMaxTokens.value = p.max_tokens;

    // 同步到gameState
    if (gameState) {
        gameState.temperature = p.temperature;
        gameState.maxTokens = p.max_tokens;
    }

    // 同步到PresetManager（参数统一由预设管理器控制）
    if (typeof PresetManager !== 'undefined' && PresetManager.currentParams) {
        PresetManager.currentParams.temperature = p.temperature;
        PresetManager.currentParams.top_p = p.top_p;
        PresetManager.currentParams.top_k = p.top_k;
        PresetManager.currentParams.frequency_penalty = p.frequency_penalty;
        PresetManager.currentParams.presence_penalty = p.presence_penalty;
        PresetManager.currentParams.max_tokens = p.max_tokens;
        PresetManager.saveCurrentParams();
        PresetManager.syncParamsToUI();
    }

    // 显示信息
    var infoEl = document.getElementById('paramPresetInfo');
    if (infoEl) {
        infoEl.style.display = 'block';
        infoEl.textContent = '已应用: ' + p.name + ' — ' + p.description;
    }
    if (typeof UI !== 'undefined') UI.toast('已应用参数: ' + p.name);
}

async function sendAIRequest(userMessage, isInit = false) {
    if (isWaiting) return;
    // AbortController 用于取消请求
    safeAbort();
    window._currentAbort = new AbortController();
    setWaiting(true);
    showStoryLoading();
    streamBuffer = '';
    _streamModeLocked = false;
    _streamMode = null;
    TypewriterBuffer.stop();
    
    // 让浏览器先渲染 loading 动画，再执行重操作（避免点击后长时间无反馈）
    await new Promise(function(r) { requestAnimationFrame(r); });
    
    // 保存撤销状态（在AI回复前）
    saveUndoState();
    // 应用正则脚本到用户输入
    if (userMessage) {
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
        
        var messages;
        // isInit: 初始化请求也需要应用预设提示词（写作风格、字数控制等）
        // 但不需要完整的聊天历史和世界书注入
        if (isInit) {
            // 【修复】isInit 也应用预设提示词
            if (gameState) {
                gameState._depthPrompts = {};
                gameState._positionPrompts = {};
                gameState._afterChatPrompts = [];
            }
            // 【修复】isInit 也执行世界书扫描，让开局场景能使用世界书设定
            // 【P1性能优化】走统一入口，自动写入缓存供后续主路径复用
            try {
                var _initWI = getWorldInfoInjection();
                if (gameState) {
                    gameState._wiPositionTexts = (typeof _initWI === 'object' && _initWI !== null && _initWI.positionTexts) ? _initWI.positionTexts : null;
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
            if (gameState && gameState._useSysprompt !== false) {
                messages.push({ role: 'system', content: gameState.systemPrompt });
            } else if (gameState && gameState.systemPrompt && gameState.systemPrompt.trim()) {
                messages.push({ role: 'user', content: gameState.systemPrompt });
            }
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

                // 【优化】先执行一次世界书扫描，缓存结果避免重复扫描
                // 【P1性能优化】走统一入口，按 totalTurns 失效
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
                console.warn('[修复] 重建系统提示词失败:', e);
            }

            var recent = (gameState.conversationHistory || []).slice(1).slice(-MAX_HISTORY);

            // 【月读智慧】摘要阈值：超过此轮数的旧对话只发送摘要，节省token
            // 来自月读预设的"6楼外只发摘要"策略
            var summaryThreshold = (gameState && gameState.summaryThreshold) || 0;
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
            // 支持 use_sysprompt 配置（月读预设设为 false）
            // 【酒馆兼容】use_sysprompt=false 时，不使用 system 角色，
            // 而是把系统提示词内容作为第一条 user 消息发送（酒馆标准行为）
            // 【防429模式】在系统提示词前注入随机噪声（来自果实预设的智慧）
            // 部分API会对系统提示词进行内容审查，随机噪声可以降低触发概率
            if (gameState && gameState.anti429Mode) {
                var noisePool = ['⚙️⚙️⚙️','λ-calc','##$$%%','v_tensor','!#FF00','<<∅>>','//ignore','μ-808','HALT','EXECUTE','##!!~~','(e^πi)','CRC32','β_decay','ψ-state','||END||','量子纠缠','&&&**','@SYS_null'];
                var noise1 = noisePool[Math.floor(Math.random()*noisePool.length)] + '::' + noisePool[Math.floor(Math.random()*noisePool.length)];
                var noise2 = noisePool[Math.floor(Math.random()*noisePool.length)] + '::' + noisePool[Math.floor(Math.random()*noisePool.length)];
                var noise3 = noisePool[Math.floor(Math.random()*noisePool.length)] + '::' + noisePool[Math.floor(Math.random()*noisePool.length)];
                messages.push({ role: 'system', content: '[Cortex_Init]⚡\n#latent_seed_λx9b42🌀→//ENTROPY_BURST\n' + noise1 + '::' + noise2 + '::' + noise3 + '\n##START##\n⚡INIT_END⚡' });
            }

            if (gameState && gameState._useSysprompt !== false) {
                messages.push({ role: 'system', content: gameState.systemPrompt });
            } else if (gameState && gameState.systemPrompt && gameState.systemPrompt.trim()) {
                // use_sysprompt=false：内容不丢弃，改为 user 角色发送
                messages.push({ role: 'user', content: gameState.systemPrompt });
            }

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

            // 游戏状态快照（按次计费：注入完整数据，让AI掌握更多剧情信息）
            // 【去重优化】增强记忆已注入角色状态/物品/事件/任务时，世界快照跳过这些重复部分
            if (gameState && gameState.worldSnapshot && Object.keys(gameState.worldSnapshot).length > 0) {
                var _hasMemInjection = (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.buildSmartInjection);
                var snapshotText = '【世界快照】\n';
                var snap = gameState.worldSnapshot;
                if (snap.player) {
                    snapshotText += '主角: ' + (snap.player.name || '未知');
                    if (snap.player.identity) snapshotText += ', 身份: ' + snap.player.identity;
                    if (snap.player.age) snapshotText += ', 年龄: ' + snap.player.age;
                    if (snap.player.title) snapshotText += ', 称号: ' + snap.player.title;
                    if (snap.player.personality) snapshotText += ', 性格: ' + snap.player.personality;
                    snapshotText += '\n';
                    if (snap.player.stats && snap.player.stats.length > 0) {
                        snap.player.stats.forEach(function(s) {
                            snapshotText += '  ' + s.label + ': ' + s.value + (s.icon ? ' ' + s.icon : '') + '\n';
                        });
                    }
                }
                // 角色状态：增强记忆的"角色状态"层已覆盖，跳过以节省token
                if (!_hasMemInjection && snap.characters && snap.characters.length > 0) {
                    snapshotText += 'NPC状态:\n';
                    snap.characters.forEach(function(c) {
                        var line = '  ' + c.name;
                        if (c.title) line += '(' + c.title + ')';
                        if (c.relation) line += ' 关系:' + c.relation;
                        if (typeof c.favorability === 'number') line += ' 好感:' + c.favorability;
                        if (c.desc) line += ' - ' + c.desc;
                        snapshotText += line + '\n';
                        if (c.details && c.details.length > 0) {
                            c.details.forEach(function(d) {
                                if (d.key && d.value) snapshotText += '    ' + d.key + ': ' + d.value + '\n';
                            });
                        }
                    });
                }
                // 背包：增强记忆的"持有物品"层已覆盖，跳过以节省token
                if (!_hasMemInjection && snap.bag && snap.bag.length > 0) {
                    snapshotText += '背包:\n';
                    snap.bag.forEach(function(b) {
                        var line = '  ' + b.name + ' x' + (b.count || 1);
                        if (b.rarity) line += ' [' + b.rarity + ']';
                        if (b.desc) line += ' - ' + b.desc;
                        if (b.equipped) line += ' [已装备]';
                        snapshotText += line + '\n';
                    });
                }
                // 任务状态：增强记忆的"进行中约定"层已覆盖，跳过以节省token
                if (!_hasMemInjection && snap.quests && snap.quests.length > 0) {
                    snapshotText += '任务:\n';
                    snap.quests.forEach(function(q) {
                        var line = '  ' + q.title;
                        if (q.type) line += ' [' + q.type + ']';
                        if (q.status) line += ' - ' + q.status;
                        if (q.progress) line += ' (' + q.progress + ')';
                        if (q.hint) line += ' 提示:' + q.hint;
                        snapshotText += line + '\n';
                    });
                }
                // 关系网：增强记忆未覆盖，始终注入
                if (snap.relationships && snap.relationships.length > 0) {
                    snapshotText += '关系网:\n';
                    snap.relationships.forEach(function(r) {
                        snapshotText += '  ' + r.from + ' → ' + r.to + ': ' + r.type + (r.desc ? ' (' + r.desc + ')' : '') + '\n';
                    });
                }
                // 世界模块：增强记忆未覆盖，始终注入
                if (snap.world && snap.world.length > 0) {
                    snapshotText += '世界信息:\n';
                    snap.world.forEach(function(w) {
                        var line = '  [' + (w.type || 'text') + '] ' + (w.title || '');
                        if (w.type === 'list' && w.items) line += ': ' + w.items.join(', ');
                        else if (w.type === 'key_value' && w.items) line += ': ' + w.items.map(function(i) { return i.key + '=' + i.value; }).join(', ');
                        else if (w.content) line += ': ' + w.content;
                        snapshotText += line + '\n';
                    });
                }
                // 游戏时间：增强记忆未覆盖，始终注入
                if (snap.gameTime) {
                    var gt = snap.gameTime;
                    snapshotText += '游戏时间: ' + (gt.date || '') + ' ' + (gt.time || '') + ' ' + (gt.period || '');
                    if (gt.weather) snapshotText += ' 天气:' + gt.weather;
                    if (gt.era) snapshotText += ' 时代:' + gt.era;
                    snapshotText += '\n';
                }
                messages.push({ role: 'system', content: snapshotText });
            }

            // 重要事件记录：增强记忆的"重要事件"层已覆盖，跳过以节省token
            if (!(typeof EnhancedMemory !== 'undefined' && EnhancedMemory.buildSmartInjection) && gameState && gameState.keyEvents && gameState.keyEvents.length > 0) {
                var eventsText = '【过往事件】\n';
                gameState.keyEvents.forEach(function(evt, idx) {
                    eventsText += (idx + 1) + '. ' + evt + '\n';
                });
                messages.push({ role: 'system', content: eventsText });
            }

            // 【多角色叙事指导】当场景中有多个NPC时自动注入（来自蛾摩拉预设的智慧）
            // 只在当前场景确实有多个活跃角色时注入，避免对所有世界都触发
            var _activeCharCount = 0;
            if (gameState && gameState.worldSnapshot && gameState.worldSnapshot.characters) {
                // 统计当前场景中活跃的角色（有最近互动记录的）
                gameState.worldSnapshot.characters.forEach(function(c) {
                    // 有好感度或关系描述的角色视为活跃
                    if (c.relation || typeof c.favorability === 'number' || c.desc) _activeCharCount++;
                });
            }
            if (_activeCharCount > 1) {
                var multiCharText = '【多角色叙事原则】\n当前场景有多个角色在场，请遵守：\n- 每个角色有独立的行动线和说话节奏，不围绕主角统一行动\n- 对话轮流进行，避免一个角色连续说多段话\n- 不同角色对同一事件应有不同反应，体现性格差异\n- 非焦点角色也应有所动作（哪怕只是背景反应），让场景有层次感\n- 角色之间的互动不只通过主角中转，他们之间也可以直接对话';
                messages.push({ role: 'system', content: multiCharText });
            }

            // 远期摘要
            if (gameState && gameState.rollingSummary) {
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
                var macroEnvForDepth = {
                    user: (gameState && gameState.playerName) || '玩家',
                    char: (gameState && gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) ? gameState.worldSnapshot.characters[0].name : '角色',
                    original: (gameState && gameState._lastOriginalContent) || ''
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
                                // 【P0边界修复】depth 超出对话历史范围时直接跳过，
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
            for (var si = 0; si < messages.length; si++) {
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
            for (var _impIdx = messages.length - 1; _impIdx >= 0; _impIdx--) {
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
                // 【P0边界修复】刚开局时没有 assistant 消息，impersonation 被静默丢弃——
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
        var macroEnv = {
            user: gameState.playerName || '玩家',
            char: (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) ? gameState.worldSnapshot.characters[0].name : '角色',
            original: gameState._lastOriginalContent || ''
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
        var decorTags = /<(?:giggle|ice|snow|echo|danmu|branches|prologue|meow_FM|time_format|write_check|emoji|novel_header|profile|ccd|角色状态面板)[\s\S]*?<\/(?:giggle|ice|snow|echo|danmu|branches|prologue|meow_FM|time_format|write_check|emoji|novel_header|profile|ccd|角色状态面板)>/gi;
        messages.forEach(function(msg, idx) {
            if (msg.content && typeof msg.content === 'string' && msg.role === 'assistant') {
                // 只清理历史消息（非最后一条assistant消息）
                var isLastAssistant = false;
                for (var _chk = messages.length - 1; _chk >= 0; _chk--) {
                    if (messages[_chk].role === 'assistant') {
                        isLastAssistant = (_chk === idx);
                        break;
                    }
                }
                if (!isLastAssistant) {
                    msg.content = msg.content.replace(decorTags, '');
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

        // 【酒馆特性】智能上下文管理
        // 自动计算当前消息的token数，如果接近上下文窗口上限，从最旧的聊天消息开始移除
        // 保留系统消息和固定消息，只移除普通的user/assistant历史消息
        var contextSize = (gameState && gameState.contextSize) || 8000;
        var reservedForOutput = Math.floor(contextSize * 0.15); // 留15%给输出
        var maxInputTokens = contextSize - reservedForOutput;
        var currentTokens = estimateTokensForMessages(messages);
        if (currentTokens > maxInputTokens) {
            console.log('[智能上下文] 当前 ' + currentTokens + ' tokens，上限 ' + maxInputTokens + '，开始裁剪');
            // 从聊天历史区域（跳过系统消息）的最旧消息开始移除
            // 但不移除固定消息和最后一条user消息
            var removedCount = 0;
            var lastUserIdx = -1;
            for (var _rIdx = messages.length - 1; _rIdx >= 0; _rIdx--) {
                if (messages[_rIdx].role === 'user') { lastUserIdx = _rIdx; break; }
            }
            // 从chatHistoryStart开始，移除最旧的非固定消息
            for (var _rIdx2 = chatHistoryStart; _rIdx2 < messages.length && currentTokens > maxInputTokens; _rIdx2++) {
                if (_rIdx2 === lastUserIdx) continue; // 不移除当前用户消息
                var msg = messages[_rIdx2];
                if (msg._pinned) continue; // 不移除固定消息
                if (msg.role === 'user' || msg.role === 'assistant') {
                    currentTokens -= estimateTokensUtil(msg.content || '') + 4; // +4为role标签开销
                    messages.splice(_rIdx2, 1);
                    _rIdx2--; // 调整索引
                    removedCount++;
                    if (lastUserIdx > _rIdx2) lastUserIdx--; // 调整lastUserIdx
                }
            }
            if (removedCount > 0) {
                console.log('[智能上下文] 移除了 ' + removedCount + ' 条历史消息，当前 ' + currentTokens + ' tokens');
            }
        }
        var options = {
            stream: gameState && gameState.useStream,
            temperature: (gameState && gameState.temperature != null) ? gameState.temperature : 0.8,
            onChunk: function(delta, fullText) {
                onStreamChunk(delta, fullText);
            }
        };
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
            // 如果是AbortController取消的，显示友好提示
            if (e.name === 'AbortError') {
                throw new Error('请求已取消');
            }
            throw e;
        }
        // 流式空回检测
        var parseResult = parseAIResponse(response);
        var data = parseResult.data;
        var storyText = parseResult.storyText;

        // === COT（思维链）处理 ===
        // 从AI回复中提取 <ECoT>...</ECoT>、<thinking>...</thinking>、💭...💭 标签内容
        // 这些内容不显示给用户，但需要保存为 {{original}} 的值
        // 支持 DeepSeek V4 的 💭...💭 格式（自动解析）
        // 【增强】支持更多思维链标签格式
        // <thinking>...</thinking>, <ECoT>...</ECoT>, 💭...💭
        // 💭...💭, <cot>...</cot>, <reasoning>...</reasoning>
        // <chain_of_thought>...</chain_of_thought>
        var cotRegex = /(?:<(?:ECoT|think(?:ing)?|cot|reasoning|chain_of_thought)>)([\s\S]+?)(?:<\/(?:ECoT|think(?:ing)?|cot|reasoning|chain_of_thought)>)|💭([\s\S]+?)💭/gi;
        var cotMatches = [];
        var cleanStoryText = storyText;
        // 提取所有COT内容
        var cotMatch;
        while ((cotMatch = cotRegex.exec(storyText)) !== null) {
            // 捕获组1: XML标签格式 <thinking>...</thinking>
            // 捕获组2: DeepSeek格式 💭...💭
            var cotContent = (cotMatch[1] || cotMatch[2] || '').trim();
            if (cotContent) {
                cotMatches.push(cotContent);
            }
        }
        // 从storyText中移除COT标签（不显示给用户）
        if (cotMatches.length > 0) {
            cleanStoryText = storyText.replace(cotRegex, '').trim();
            // 保存原始内容（含COT）供 {{original}} 宏使用
            if (gameState) gameState._lastOriginalContent = storyText;
            // 保存COT内容供调试查看
            if (gameState) gameState._lastCotContent = cotMatches.join('\n---\n');
            console.log('[COT] 提取到思维链内容:', cotMatches.length, '段');
        }
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
        // 渲染非剧情部分
        if (data) {
            if (data.hud) renderHUD(data.hud);
            if (data.choices) renderChoices(data.choices);
            if (data.player) renderPlayerStats(data.player);
            if (data.characters) mergeCharacters(data.characters);
            // 更新章节标题（如果有）
            if (data.title || data.scene) {
                updateSceneTitle(data.title || data.scene);
                // 保存到gameState，确保读档后能恢复
                if (gameState) gameState._lastSceneTitle = data.title || data.scene;
            }
            // 保存HUD数据到gameState，确保读档后能恢复
            if (data.hud && gameState) {
                gameState._lastHUD = data.hud;
            }
            // 兜底：就算AI没返回characters，也尝试从原文提取
            if (!data.characters) {
                var rescuedChars = extractObjArr(response, 'characters');
                if (rescuedChars && rescuedChars.length > 0) {
                    mergeCharacters(rescuedChars);
                }
            }
            if (data.world) renderWorldModules(data.world);
            if (data.bag) renderBag(data.bag);
            // === 任务系统 ===
            if (data.quests) {
                mergeQuests(data.quests);
                renderQuests();
            }
            // === 关系网 ===
            if (data.relationships) {
                mergeRelationships(data.relationships);
                renderRelationships();
            }
            if (data.contextSummary) gameState.rollingSummary = data.contextSummary;
        
        // 时间系统：从AI返回的JSON中解析gameTime字段
        if (typeof GameTimeSystem !== 'undefined') {
            GameTimeSystem.parseFromAI(data);
            GameTimeSystem.updateUI();
        }
        
        // 处理增强记忆
        if (typeof EnhancedMemory !== 'undefined') {
            EnhancedMemory.processMessage(
                { role: 'assistant', content: response },
                data
            );
        }
        // 成就系统检查
        if (typeof AchievementSystem !== 'undefined' && AchievementSystem.checkAchievements) {
            try { AchievementSystem.checkAchievements(); } catch (e) {}
        }
            // === 货币系统 ===
            if (gameState) {
                if (data.currency !== undefined) gameState.currency = data.currency;
                if (data.currencyName) gameState.currencyName = data.currencyName;
            }
            // === 新增：提取并累积重要事件 ===
            if (data.keyEvents && Array.isArray(data.keyEvents)) {
                if (!gameState || !gameState.keyEvents) {
                    if (gameState) gameState.keyEvents = [];
                }
                if (gameState) {
                    data.keyEvents.forEach(function(evt) {
                        if (evt && typeof evt === 'string' && evt.trim().length > 0) {
                            // 去重：trim后匹配，避免空格差异导致重复
                            if (!gameState.keyEvents.includes(evt.trim())) {
                                gameState.keyEvents.push(evt.trim());
                            }
                        }
                    });
                    // 上限30条，防止占太多token
                    if (gameState.keyEvents.length > 30) {
                        gameState.keyEvents = gameState.keyEvents.slice(-30);
                    }
                }
                // 【数据联通】同步推送到权威源 gm.events
                if (typeof _pushKeyEventsToGM === 'function') {
                    try { _pushKeyEventsToGM(); } catch (e) { console.warn('[pushKeyEvents]', e); }
                }
                // 触发 UI 刷新
                if (typeof GameLinker !== 'undefined') GameLinker.refreshByDataChange('keyEvents');
            }
            // === 新增：保存世界状态快照 ===
            var snapshot = {};
            if (data.player) snapshot.player = data.player;
            if (data.hud) snapshot.hud = data.hud;
            if (data.bag) snapshot.bag = data.bag;
            if (gameState && gameState.currentQuests && gameState.currentQuests.length > 0) {
                snapshot.quests = gameState.currentQuests;
            }
            // 从累积的allCharacters取最新NPC列表
            // 【数据联通】gameState.allCharacters 已是 gm.tables.characters 的别名
            if (!gameState || !gameState.allCharacters || typeof gameState.allCharacters !== 'object') {
                // 旧存档/首次开局：建立别名（不清空，保留权威源已有数据）
                if (typeof _ensureDataLinkage === 'function') _ensureDataLinkage();
            }
            var charKeys = Object.keys((gameState && gameState.allCharacters) || {});
            if (charKeys.length > 0 && gameState) {
                snapshot.characters = charKeys.map(function(key) {
                    var c = gameState.allCharacters[key];
                    return {
                        name: c.name,
                        title: c.title || '',
                        relation: c.relation || '',
                        favorability: c.favorability || 0
                    };
                });
            }
            if (Object.keys(snapshot).length > 0 && gameState) {
                gameState.worldSnapshot = snapshot;
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
                        // 【性能优化】限制每个NPC聊天记录最多 50 条，防止长会话内存泄漏
                        if (gameState._chatLogs[msg.from].length > 50) {
                            gameState._chatLogs[msg.from] = gameState._chatLogs[msg.from].slice(-50);
                        }
                        showNpcMessageNotification(msg.from, msg.text);
                    }
                });
                safeAutoSave();
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
        // 对最终story文本也应用输出端正则，确保与流式显示一致
        if (typeof RegexManager !== 'undefined') {
            finalStory = RegexManager.apply(finalStory, 'output');
        }
        // 先设置 onComplete 回调（在 push 之前，防止时序竞争）
        TypewriterBuffer.onComplete = function() {
            var st = document.getElementById('storyText');
            if (st) st.innerHTML = formatStory(finalStory);
            _hideSkipButton();
        };
        // 流式模式下 onStreamChunk 已经在逐步推送了，
        // 这里只需要确保最终完整文本被推送（处理流式解析可能遗漏的尾部内容）。
        // 如果打字机已经在打字且 displayed 已包含 finalStory 的内容，则跳过重复推送。
        var alreadyDisplayed = TypewriterBuffer.displayed.length + TypewriterBuffer.queue.length;
        if (finalStory.length > alreadyDisplayed) {
            TypewriterBuffer.push(finalStory);
        }
        // 如果打字机已完成，直接最终渲染
        if (TypewriterBuffer.isFinished()) {
            var st2 = document.getElementById('storyText');
            if (st2) st2.innerHTML = formatStory(finalStory);
            _hideSkipButton();
        }
        // 记录
        // storyHistory 已合并到 conversationHistory，不再单独存储
        
        // 更新统计数据
        if (!gameState) return;
        if (!gameState._stats) gameState._stats = {};
        gameState._stats.totalTurns = (gameState._stats.totalTurns || 0) + 1;
        var currentTokens = response ? Math.round(response.length * 1.5) : 0;
        gameState._stats.totalTokens = (gameState._stats.totalTokens || 0) + currentTokens;
        if (currentTokens > (gameState._stats.maxTokensInTurn || 0)) {
            gameState._stats.maxTokensInTurn = currentTokens;
        }
        var charCount = Object.keys(gameState.allCharacters || {}).length;
        if (charCount > (gameState._stats.totalCharacters || 0)) {
            gameState._stats.totalCharacters = charCount;
        }
        // 兜底提取摘要
        if (!data || !data.contextSummary) {
            var extractedSummary = extractStr(response, 'contextSummary');
            if (extractedSummary) gameState.rollingSummary = extractedSummary;
        }
        // 兜底提取keyEvents
        if (!data || !data.keyEvents) {
            var extractedEvents = extractArr(response, 'keyEvents');
            if (extractedEvents && extractedEvents.length > 0) {
                if (!gameState.keyEvents) gameState.keyEvents = [];
                extractedEvents.forEach(function(evt) {
                    if (evt && evt.trim().length > 0 && !gameState.keyEvents.includes(evt
                        .trim())) {
                        gameState.keyEvents.push(evt.trim());
                    }
                });
                // 上限30条，防止占太多token
                if (gameState.keyEvents.length > 30) {
                    gameState.keyEvents = gameState.keyEvents.slice(-30);
                }
            }
        }
        // 兜底选项
        if (!data || !data.choices) {
            if (gameState && gameState.generateChoices !== false) {
                var rescuedChoices = extractObjArr(response, 'choices') || extractArr(response,
                    'choices');
                if (rescuedChoices && rescuedChoices.length > 0) {
                    renderChoices(rescuedChoices);
                } else {
                    renderChoices([{
                        id: 'A',
                        text: '继续'
                    }, {
                        id: 'B',
                        text: '换个方向'
                    }, {
                        id: 'C',
                        text: '停下来思考'
                    }]);
                }
            } else {
                renderChoices([]);
            }
        }
        // 存历史（存储清理后的story文本，减少token浪费）
        var historyAssistantContent = storyText || response;
        if (gameState && gameState.conversationHistory) {
            gameState.conversationHistory.push({
                role: 'user',
                content: userMessage
            }, {
                role: 'assistant',
                content: historyAssistantContent
            });
        }
        // 对话历史上限200条，防止内存和token膨胀
        if (gameState && gameState.conversationHistory && gameState.conversationHistory.length > 200) {
            // 保留第一条system消息 + 最近198条
            var systemMsg = gameState.conversationHistory[0] && gameState.conversationHistory[0].role === 'system'
                ? [gameState.conversationHistory[0]] : [];
            gameState.conversationHistory = systemMsg.concat(gameState.conversationHistory.slice(-(200 - systemMsg.length)));
        }
        // 触发事件：CHARACTER_MESSAGE_RENDERED（AI消息渲染后）
        if (typeof TavernHelperCompat !== 'undefined') {
            TavernHelperCompat.emit('CHARACTER_MESSAGE_RENDERED', {
                message: response,
                timestamp: Date.now()
            });
        }
        autoSave();
        // 传入当前响应长度更新Token计数
        updateTokenCount(response ? response.length : 0);
    } catch (error) {
        TypewriterBuffer.stop();
        // 清理 AbortController
        window._currentAbort = null;
        // 确保异常路径也调用 hideStoryLoading
        hideStoryLoading();
        var errDisplay = translateError((error && error.message) ? error.message : '未知错误');
        // 【调试】把原始 Error 对象传入，showError 会显示完整堆栈和文件:行号
        showError(errDisplay, error);
        console.error('请求出错:', error);
    } finally {
        window._currentAbort = null;
        setWaiting(false);
        // 【日志页面】AI 请求结束（成功/失败/取消），自动关闭生成弹窗
        try { if (typeof UI !== 'undefined' && UI.hideGenerating) UI.hideGenerating(); } catch (e) {}
    }
}
function updateTokenCount(currentResponseLength) {
    if (!gameState.conversationHistory) return;
    // 统一用 utils 里的 token 估算（1 token ≈ 1.7 字符，含中英文混合）
    var estimated = estimateTokensForMessagesUtil(gameState.conversationHistory);
    gameState.tokenCount = estimated;

    // 更新故事头部Token显示
    var currentTokenEl = document.getElementById('currentTokenCount');
    var totalTokenEl = document.getElementById('totalTokenCount');

    if (currentResponseLength && currentTokenEl) {
        var currentTokens = Math.round(currentResponseLength / 1.7);
        currentTokenEl.textContent = currentTokens > 1000 ?
            (currentTokens / 1000).toFixed(1) + 'k' : currentTokens;
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
            var ctxDisplay = (gameState.contextSize || 8000) > 1000 ? ((gameState.contextSize || 8000) / 1000).toFixed(0) + 'k' : (gameState.contextSize || 8000);
            inputInfo = ' | 请求: ' + inputDisplay + '/' + ctxDisplay + ' (' + (gameState._lastContextUsage || 0) + '%)';
        }
        chatTokenEl.textContent = '上下文: 约 ' + displayText + ' token' + inputInfo + ' | ' + gameState.conversationHistory.length + ' 条消息';
    }

    // 智能压缩检查
        if (gameState && gameState.autoCompress !== false && !isCompressing && !isWaiting && typeof EnhancedMemory !== 'undefined') {
        var triggerResult = EnhancedMemory.shouldTriggerCompression(estimated, (gameState && gameState.maxTokens) || 4096);
        if (triggerResult.shouldCompress) {
            var cooldownMs = (EnhancedMemory.compressionConfig.cooldownMinutes || 5) * 60 * 1000;
            if (Date.now() - (window.lastCompressTime || 0) > cooldownMs) {
                console.log('⚠️ 触发压缩:', triggerResult.reason);
                window.lastCompressTime = Date.now();
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

    for (var i = 0; i < history.length; i++) {
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
        content = content.replace(/```[\s\S]*?```/g, function(block) {
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
            for (var i = 0; i < keyEventStrs.length; i++) {
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
            var text = m.content.length > 500 ? m.content.substring(0, 500) + '...' : m.content;
            return role + '\n' + text;
        }).join('\n\n---\n\n');
        // 【提示词重设计】从「命令式」改为「编剧视角 + 信任模型」
        // 【P0一致性修复】明确要求保留专有名词一致性，避免摘要与正文用词错位
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
            var text = m.content.length > 800 ? m.content.substring(0, 800) + '...(内容过长已截断)' : m.content;
            return role + '\n' + text;
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
        EnhancedMemory.saveSummaryHistory(summary, gameState.conversationHistory.length);
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
                if (!EnhancedMemory.longTermMemory.characterTable[name]) {
                    EnhancedMemory.longTermMemory.characterTable[name] = {
                        name: name,
                        firstAppearance: Date.now(),
                        changes: [],
                        gameTime: typeof EnhancedMemory.getGameTimeStr === 'function' ? EnhancedMemory.getGameTimeStr() : '',
                        accessCount: 0,
                        lastChangedTurn: typeof EnhancedMemory.currentTurn === 'number' ? EnhancedMemory.currentTurn : 0
                    };
                }
                EnhancedMemory.longTermMemory.characterTable[name].lastUpdate = Date.now();
                EnhancedMemory.longTermMemory.characterTable[name].lastChangedTurn = typeof EnhancedMemory.currentTurn === 'number' ? EnhancedMemory.currentTurn : (EnhancedMemory.longTermMemory.characterTable[name].lastChangedTurn || 0);
                EnhancedMemory.longTermMemory.characterTable[name].gameTime = typeof EnhancedMemory.getGameTimeStr === 'function' ? EnhancedMemory.getGameTimeStr() : (EnhancedMemory.longTermMemory.characterTable[name].gameTime || '');
                EnhancedMemory.longTermMemory.characterTable[name].changes.push({
                    time: Date.now(),
                    change: change
                });
            }
        });
    }
    
    // 解析重要事件
    var eventMatch = summary.match(/【重要事件】\n([\s\S]*?)(?=【|$)/);
    if (eventMatch) {
        var events = eventMatch[1].split('\n').filter(function(l) { return l.trim(); });
        events.forEach(function(event) {
            if (!gameState.keyEvents) gameState.keyEvents = [];
            if (!gameState.keyEvents.includes(event.trim())) {
                gameState.keyEvents.push(event.trim());
            }
            EnhancedMemory.longTermMemory.importantEvents.push({
                time: Date.now(),
                event: event.trim()
            });
            // 上限50条，防止内存无限增长
            if (EnhancedMemory.longTermMemory.importantEvents.length > 50) {
                EnhancedMemory.longTermMemory.importantEvents = EnhancedMemory.longTermMemory.importantEvents.slice(-50);
            }
        });
    }
    
    // 解析当前状态
    var stateMatch = summary.match(/【当前状态】\n([\s\S]*?)(?=【|$)/);
    if (stateMatch) {
        gameState.worldSnapshot = {
            lastUpdate: Date.now(),
            summary: stateMatch[1].trim()
        };
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
                if (!EnhancedMemory.longTermMemory.characterTable[name]) {
                    EnhancedMemory.longTermMemory.characterTable[name] = { name: name, firstAppearance: Date.now(), changes: [], gameTime: typeof EnhancedMemory.getGameTimeStr === 'function' ? EnhancedMemory.getGameTimeStr() : '', accessCount: 0, lastChangedTurn: typeof EnhancedMemory.currentTurn === 'number' ? EnhancedMemory.currentTurn : 0 };
                }
                EnhancedMemory.longTermMemory.characterTable[name].lastUpdate = Date.now();
                EnhancedMemory.longTermMemory.characterTable[name].lastChangedTurn = typeof EnhancedMemory.currentTurn === 'number' ? EnhancedMemory.currentTurn : (EnhancedMemory.longTermMemory.characterTable[name].lastChangedTurn || 0);
                EnhancedMemory.longTermMemory.characterTable[name].gameTime = typeof EnhancedMemory.getGameTimeStr === 'function' ? EnhancedMemory.getGameTimeStr() : (EnhancedMemory.longTermMemory.characterTable[name].gameTime || '');
            }
        }
    });
    var itemPatterns = [/(获得|拿到|找到|得到)[了]?\s*(.{2,20})/, /(物品|道具)[：:]\s*(.{2,20})/];
    itemPatterns.forEach(function(pattern) {
        var match = content.match(pattern);
        if (match) {
            var item = match[2].trim();
            if (item.length >= 2 && !EnhancedMemory.longTermMemory.itemTable[item]) {
                EnhancedMemory.longTermMemory.itemTable[item] = { name: item, obtainedTime: Date.now(), desc: '玩家持有', gameTime: typeof EnhancedMemory.getGameTimeStr === 'function' ? EnhancedMemory.getGameTimeStr() : '', accessCount: 0, lastChangedTurn: typeof EnhancedMemory.currentTurn === 'number' ? EnhancedMemory.currentTurn : 0 };
            }
        }
    });
}
function estimateTokensForMessages(messages) {
    return estimateTokensForMessagesUtil(messages);
}
function estimateTokens(text) {
    return estimateTokensUtil(text);
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
    try {
        var sys = gameState.conversationHistory ? gameState.conversationHistory[0] : undefined;
        var rest = gameState.conversationHistory ? gameState.conversationHistory.slice(1) : [];
        // 过滤掉之前注入的L2/L3/L4 system消息，只保留真正的对话
        var dialogOnly = rest.filter(function(m) {
            if (m.role === 'system') {
                var c = m.content || '';
                if (c.indexOf('当前世界状态快照') !== -1) return false;
                if (c.indexOf('重要事件记录') !== -1) return false;
                if (c.indexOf('前情摘要') !== -1) return false;
            }
            return true;
        });
        var keep = dialogOnly.slice(-30);
        var removed = dialogOnly.slice(0, -30);

        // 【酒馆特性】消息Pinning：固定重要消息不被压缩
        // 消息上有 _pinned=true 标记的，即使在前30条之外也要保留
        var pinnedMessages = removed.filter(function(m) { return m._pinned === true; });
        if (pinnedMessages.length > 0) {
            // 把固定消息从removed移到keep
            removed = removed.filter(function(m) { return m._pinned !== true; });
            keep = pinnedMessages.concat(keep);
            console.log('[压缩] 保留了 ' + pinnedMessages.length + ' 条固定消息');
        }

        if (removed.length === 0) {
            // 提前返回时需要正确恢复状态
            isCompressing = false;
            if (!_wasWaiting) isWaiting = false;
            return;
        }
        var summary = await _compressConversation(removed, sys);
        // 重建conversationHistory：只保留system prompt + 近期对话
        gameState.conversationHistory = [sys].concat(keep);
        gameState.rollingSummary = summary;
        console.log('自动压缩完成，保留', gameState.conversationHistory.length, '条，keyEvents', (gameState
            .keyEvents || []).length, '条不受影响');
        autoSave();
    } catch (e) {
        console.error('自动压缩失败:', e);
    } finally {
        isCompressing = false;
        if (!_wasWaiting) isWaiting = false;
        if (window._currentAbort === _compressAbort) {
            window._currentAbort = _origCurrentAbort;
        }
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
    try {
        var msgCount = (gameState && gameState.conversationHistory) ? gameState.conversationHistory.filter(function(m) {
            return m.role !== 'system';
        }).length : 0;
        if (msgCount <= 30) {
            UI.toast('对话只有 ' + msgCount + ' 条，不需要压缩（大于30条才有意义）');
            return;
        }
        var ok = await UI.confirm('压缩对话', '将用AI总结前面的剧情，只保留最近30条原文，确定吗？');
        if (!ok) return;
        var sys = gameState.conversationHistory ? gameState.conversationHistory[0] : undefined;
        var rest = gameState.conversationHistory ? gameState.conversationHistory.slice(1) : [];
        var keep = rest.slice(-30);
        var removed = rest.slice(0, -30);
        // 【酒馆特性】消息Pinning：固定消息不被压缩
        var pinnedMessages = removed.filter(function(m) { return m._pinned === true; });
        if (pinnedMessages.length > 0) {
            removed = removed.filter(function(m) { return m._pinned !== true; });
            keep = pinnedMessages.concat(keep);
        }
        if (removed.length === 0) {
            UI.toast('没有需要压缩的内容');
            return;
        }
        var summary = await _compressConversation(removed, sys);
        gameState.conversationHistory = [sys].concat(keep);
        gameState.rollingSummary = summary;
        console.log('手动压缩完成，保留', gameState.conversationHistory.length, '条');
        autoSave();
        UI.toast('压缩完成！已总结 ' + removed.length + ' 条对话');
    } catch (e) {
        console.error('手动压缩失败:', e);
        UI.toast('压缩失败: ' + translateError(e.message || '未知错误'));
    } finally {
        if (window._currentAbort === _compressAbort) {
            window._currentAbort = _origCurrentAbort;
        }
    }
}
(function() {
    var lastPrompt = localStorage.getItem('freeScript_lastPrompt');
    if (lastPrompt) {
        var el = document.getElementById('worldDescription');
        if (el && !el.value) el.value = lastPrompt;
    }
})();
// ========================================

// ========================================
// 渲染器 - 使用集成版UI样式
// ========================================

// --- 流式chunk处理 ---
// 从 JSON 包装的流式响应中提取 story 字段值
// 用于 onStreamChunk 的 JSON 模式分支
function extractStoryStreaming(text) {
    var match = text.match(/"story"\s*:\s*"/);
    if (!match) return null;
    var i = match.index + match[0].length;
    var inEscape = false;
    var result = '';
    while (i < text.length) {
        var ch = text[i];
        if (inEscape) {
            switch (ch) {
                case 'n': result += '\n'; break;
                case '"': result += '"'; break;
                case '\\': result += '\\'; break;
                case 't': result += '\t'; break;
                case 'r': result += '\r'; break;
                case 'b': result += '\b'; break;
                case 'f': result += '\f'; break;
                case 'u':
                    var hexStr = text.substring(i + 1, i + 5);
                    if (/^[0-9a-fA-F]{4}$/.test(hexStr)) {
                        result += String.fromCharCode(parseInt(hexStr, 16));
                        i += 4;
                    } else {
                        result += ch;
                    }
                    break;
                default: result += ch;
            }
            inEscape = false;
        } else if (ch === '\\') {
            inEscape = true;
        } else if (ch === '"') {
            return result;
        } else {
            result += ch;
        }
        i++;
    }
    return result.length > 0 ? result : null;
}

// 流式模式锁定：一旦确定模式，不再切换
var _streamModeLocked = false;
var _streamMode = null; // 'json' 或 'plaintext'

function onStreamChunk(delta, fullText) {
    if (fullText !== undefined) {
        streamBuffer = fullText;
    } else {
        streamBuffer += delta;
    }
    // 模式锁定后直接走对应路径，避免每帧都做正则扫描
    if (_streamModeLocked) {
        if (_streamMode === 'plaintext') {
            // 纯文本模式：直接推送到打字机
            TypewriterBuffer.push(streamBuffer);
            return;
        }
        // JSON 模式：继续提取 story 字段
        var story = extractStoryStreaming(streamBuffer);
        if (story && story.length > 0) {
            TypewriterBuffer.push(story);
        }
        return;
    }
    // 未锁定模式：尝试 JSON 提取
    var story = extractStoryStreaming(streamBuffer);
    if (story && story.length > 0) {
        _streamMode = 'json';
        _streamModeLocked = true;
        TypewriterBuffer.push(story);
    } else if (streamBuffer.length > 50) {
        // 累积超过50字符仍未检测到 "story" 字段，锁定为纯文本模式
        _streamMode = 'plaintext';
        _streamModeLocked = true;
        TypewriterBuffer.push(streamBuffer);
    }
}

// ========================================
// 第4层: 剧情渲染
// ========================================
// --- 剧情渲染 ---
function renderStory(text) {
    TypewriterBuffer.stop();
    var storyEl = document.getElementById('storyText');
    var contentEl = document.getElementById('gameContent');
    
    // 【修复】应用正则表达式处理（用于显示）
    if (typeof RegexEngine !== 'undefined' && RegexEngine.regexScripts.length > 0) {
        // 计算当前消息深度
        var depth = (gameState.conversationHistory || []).length;
        text = RegexEngine.processAIResponse(text, depth);
    }
    
    // 【修复C P2-2】在设置innerHTML前进行HTML净化，防止XSS
    var formatted = sanitizeHtml(formatStory(text));
    if (storyEl) storyEl.innerHTML = formatted;
    if (contentEl) contentEl.scrollTop = 0;
}
// 全局心声计数器
var globalThoughtId = 0;
// 【性能优化】预编译 formatStory 中所有正则，避免每次调用都重新编译
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
var _reDecorTagsTyping = /<(?:ice|snow|echo|danbu|branches|prologue|meow_FM|time_format|write_check|emoji|novel_header|profile|ccd|角色状态面板)[\s\S]*?<\/(?:ice|snow|echo|danbu|branches|prologue|meow_FM|time_format|write_check|emoji|novel_header|profile|ccd|角色状态面板)>/gi;
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

    // 【修复】反转义 HTML 实体，防止 <giggle> 和 「」被转义后无法匹配
    // 某些路径下 text 可能已被 escapeHtml 处理过，需要先还原
    // 【性能优化】使用预编译正则，避免每次调用都 new RegExp
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

    // 【新增兼容】处理AI错误返回的中文方括号格式 【giggle】→<giggle>
    _reGiggleCN.lastIndex = 0; _reGiggleCNClose.lastIndex = 0;
    text = text.replace(_reGiggleCN, '<giggle>').replace(_reGiggleCNClose, '</giggle>');

    // 【性能修复】打字机tick期间跳过PresetAppManager解析和标签移除
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
    } else {
        // 打字机tick期间：只做最基本的标签移除（giggle标签需要保留用于心声显示）
        // 其他装饰标签在tick期间不影响显示，因为它们的内容不会渲染到storyText
        _reDecorTagsTyping.lastIndex = 0;
        text = text.replace(_reDecorTagsTyping, '');
    }

    // 清理 body 上的旧心声气泡（气泡是 fixed 定位在 body 上的，不在 storyEl 内）
    // 【性能修复】打字机tick期间跳过气泡清理，只在非tick渲染时清理
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
    // 【性能优化】使用预编译正则
    _reGiggleOpen.lastIndex = 0;
    var allThoughts = [];
    for (var pI = 0; pI < paragraphs.length; pI++) {
        var pp = paragraphs[pI];
        _reGiggleOpen.lastIndex = 0;
        var tmatch;
        while ((tmatch = _reGiggleOpen.exec(pp)) !== null) {
            var giggleText = tmatch[1].trim();
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
                original: tmatch[0],
                paragraphIdx: pI
            });
        }
    }

    // 心声完全由AI通过<giggle>标签动态生成，不使用固定文本后备
    // 如果AI没有生成<giggle>标签，则不显示心声触发器

    // 限制心声数量为2-5个（如果超过，优先保留前面的）
    if (allThoughts.length > 5) {
        allThoughts = allThoughts.slice(0, 5);
    }

    // 标记已使用的心声
    allThoughts.forEach(function(t) {
        t.used = false;
    });

    paragraphs.forEach(function(p, pIdx) {
        // 移除所有心声标记（兼容中文方括号格式）
        _reGiggleStrip.lastIndex = 0; _reGiggleCNStrip.lastIndex = 0;
        var cleanText = p.replace(_reGiggleStrip, '').replace(_reGiggleCNStrip, '').trim();

        // 检查这个段落是否有对应的心声
        var hasThoughtInThisPara = false;
        var thoughtId = -1;
        for (var tI = 0; tI < allThoughts.length; tI++) {
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
                _reBold.lastIndex = 0; _reItalic.lastIndex = 0;
                html = '<p>' + escapeHtml(cleanText).replace(_reBold,
                    '<strong>$1</strong>').replace(_reItalic, '<em>$1</em>') + '</p>';
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
    return finalOutput;
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
    // 【性能修复】打字机tick期间不创建气泡DOM，只在最终渲染时创建
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
        '" onclick="toggleThought(this)" title="查看心声">' +
        '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>' +
        countBadge + '</span>';
}
function toggleThought(trigger) {
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
function renderHUD(hudData) {
    // 不再显示HUD数据（魅力/运气/心情），改为显示游戏时间
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
        '<div class="choices-toggle" onclick="toggleChoicesPanel()" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer;font-size:13px;color:var(--text-secondary);user-select:none;">' +
        '<span>选项 (' + choices.length + '个)</span>' +
        '<span id="choicesToggleIcon" style="transition:transform 0.2s;transform:rotate(-90deg);">▼</span></div>' +
        '<div id="choicesPanel" style="overflow:hidden;transition:max-height 0.3s ease;max-height:0px;">';
    // 【修复X4】选项文本和标签需要转义
    var btnsHtml = choices.map(function(c, i) {
        var id = c.id || String.fromCharCode(65 + i);
        // 兼容多种AI输出格式：text/label/content/description/action
        var text = c.text || c.label || c.content || c.description || c.action || '';
        if (typeof text !== 'string') text = String(text);
        var safeT = JSON.stringify(text);
        var tagHtml = c.tag ?
            '<span class="badge badge-soft" style="margin-left:8px;font-size:10px;">' + escapeHtml(c.tag) +
            '</span>' : '';
        return '<button class="option-btn" onclick="fillChoiceToInput(' + safeT + ')">' +
            '<span class="option-index">' + id + '</span><span>' + escapeHtml(text) + '</span>' + tagHtml +
            '</button>';
    }).join('');
    container.innerHTML = toggleHtml + btnsHtml + '</div>';
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
function fillChoiceToInput(text) {
    var input = document.getElementById('customAction');
    if (input) {
        input.value = text;
        input.disabled = false;
        input.focus();
    }
}



// ========================================
// 第5层: 数据管理
// ========================================
// ========================================
// NPC人物（累积 + 弹窗详情）
// ========================================
function mergeCharacters(chars) {
    if (!chars || chars.length === 0) return;
    // 【数据联通】gameState.allCharacters 已是 gm.tables.characters 的别名
    if (!gameState.allCharacters || typeof gameState.allCharacters !== 'object') {
        if (typeof _ensureDataLinkage === 'function') _ensureDataLinkage();
    }
    // 获取主角名
    var playerName = '';
    if (gameState && gameState.playerData && gameState.playerData.name) {
        playerName = gameState.playerData.name;
    }
    chars.forEach(function(c) {
        if (!c || !c.name) return;
        // 跳过主角
        if (playerName && (c.name === playerName || c.name.includes(playerName) || playerName
                .includes(c.name))) {
            return;
        }
        // 严格匹配：只清理括号备注
        var cleanName = c.name.replace(/[（(].*?[）)]/g, '').trim();
        var existingKey = null;
        Object.keys((gameState && gameState.allCharacters) || {}).forEach(function(key) {
            var cleanKey = key.replace(/[（(].*?[）)]/g, '').trim();
            if (cleanKey === cleanName) {
                existingKey = key;
            }
        });
        if (existingKey && existingKey !== c.name) {
            if (gameState && gameState.allCharacters) delete gameState.allCharacters[existingKey];
        }
        // ★ 合并而非覆盖：AI返回了什么就更新什么，没返回的保留
        var existing = gameState && gameState.allCharacters ? gameState.allCharacters[c.name] : undefined;
        if (existing) {
            if (c.title) existing.title = c.title;
            if (c.relation) existing.relation = c.relation;
            if (c.favorability !== undefined) existing.favorability = c.favorability;
            if (c.desc) existing.desc = c.desc;
            if (c.details) existing.details = c.details;
        } else {
            if (gameState && gameState.allCharacters) gameState.allCharacters[c.name] = c;
        }
    });
    renderNpcList();
    // 联动：广播角色数据变更，刷新其他依赖页面
    if (window.GameLinker) {
        GameLinker.refreshByDataChange('allCharacters');
    }
}
function deleteCharacter(name) {
    UI.confirm('确定删除角色「' + escapeHtml(name) + '」？此操作不可撤回').then(function(ok) {
        if (!ok) return;
        delete gameState.allCharacters[name];
        renderNpcList();
        UI.hideModal('npcDetailModal');
        autoSave();
    }).catch(function(err) {
        console.error('[NPC] 删除角色失败:', err);
    });
}
// ========================================
// NPC单独对话（弹窗版）
// ========================================
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
// ========================================
const SAVE_GAME_ID = 'freeScript';
const LOCAL_SAVE_KEY = 'freeScript_localSaves';
const LOCAL_MANUAL_COUNT = 5;
const LOCAL_EXT_START = 6;
const LOCAL_EXT_END = 10;
// ── 保存到指定槽位 ──
function buildSaveData(customName) {
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
    if (gameState) gameState._version = GAME_VERSION;

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

    return {
        name: customName || ((gameState && gameState.userPrompt) || '').substring(0, 20) || '未命名存档',
        prompt: (gameState && gameState.userPrompt) || '',
        time: new Date().toLocaleString(),
        version: GAME_VERSION,
        state: gameState ? JSON.stringify(gameState) : '{}',
        memoryData: memoryData ? JSON.stringify(memoryData) : null
    };
}
function safeSaveSlot(slot) {
    saveToSlot(slot).catch(function(e) {
        console.error('保存失败:', e);
        UI.toast('保存失败');
    });
}
async function saveToSlot(slot) {
    try {
        await SaveDB.set(slot, buildSaveData(''));
        UI.toast('保存成功');
        openSaveLoadModal();
    } catch (e) {
        console.error('saveToSlot出错:', e);
        UI.toast('保存失败: ' + translateError(e.message || e));
    }
}
async function loadFromSlot(slot) {
    try {
        var data = null;
        try {
            data = await SaveDB.get(slot);
        } catch (e) {
            console.warn('IndexedDB读取失败，尝试localStorage:', e);
        }
        if (!data) {
            UI.toast('该存档位为空');
            return;
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
        console.log('[存档] 版本:', saveVersion, '当前:', GAME_VERSION);
        
        // 版本迁移处理（简化）
        if (saveVersion !== GAME_VERSION) {
            // 处理旧版本数据
            if (parsed.worldInfo) {
                parsed._worldInfoLegacy = parsed.worldInfo;
                delete parsed.worldInfo;
            }
        }
        
        // Fix Issue 43: Merge instead of replace to preserve runtime references
        if (!gameState) { gameState = {}; }
        Object.keys(parsed).forEach(function(k) { gameState[k] = parsed[k]; });
        
        // 读档后重置临时字段，防止旧数据残留
        if (gameState) {
            gameState._depthPrompts = {};
            gameState._positionPrompts = {};
            gameState._afterChatPrompts = [];
            gameState._wiCachedResult = null;
        }
        // 重置世界书轮次追踪器，防止cooldown/delay状态异常
        if (typeof WorldInfo !== 'undefined') {
            WorldInfo._turnTracker = {};
            WorldInfo._currentTurn = 0;
        }
        
        // 确保版本号更新
        if (gameState) gameState._version = GAME_VERSION;
        
        // 兼容旧存档缺少的字段
        if (gameState) {
            if (!gameState.pinnedModules) gameState.pinnedModules = {};
            if (!gameState.rollingSummary) gameState.rollingSummary = '';
            if (!gameState.allCharacters) gameState.allCharacters = {};
            if (!gameState.keyEvents) gameState.keyEvents = [];
            if (!gameState.worldSnapshot) gameState.worldSnapshot = {};
            if (!gameState.currentQuests) gameState.currentQuests = [];
            if (!gameState.relationships) gameState.relationships = [];
            if (!gameState.currentBag) gameState.currentBag = [];
            if (gameState.playerData === undefined) gameState.playerData = null;
            if (!gameState.favStories) gameState.favStories = [];
            if (!gameState.generatedNovel) gameState.generatedNovel = '';
            if (!gameState.conversationHistory) gameState.conversationHistory = [];
            if (typeof gameState.autoCompress === 'undefined') gameState.autoCompress = true;
            if (typeof gameState.useStream === 'undefined') gameState.useStream = true;
            if (typeof gameState.temperature === 'undefined') gameState.temperature = 0.8;
            if (typeof gameState.fontSize === 'undefined') gameState.fontSize = 16;
            if (typeof gameState.generateChoices === 'undefined') gameState.generateChoices = true;
            if (!gameState.protagonistSetup) gameState.protagonistSetup = {};
            if (!gameState._presetApps) gameState._presetApps = {};
            if (!gameState._stats) {
                gameState._stats = {
                    startTime: Date.now(),
                    totalTurns: (gameState.conversationHistory || []).filter(m => m.role === 'assistant').length,
                    totalTokens: 0,
                    maxTokensInTurn: 0,
                    totalCharacters: Object.keys(gameState.allCharacters || {}).length,
                    completedQuests: 0,
                    totalPlayTime: 0
                };
            } else {
                gameState._stats.startTime = Date.now();
                if (typeof gameState._stats.totalTurns === 'undefined') gameState._stats.totalTurns = 0;
                if (typeof gameState._stats.totalTokens === 'undefined') gameState._stats.totalTokens = 0;
                if (typeof gameState._stats.maxTokensInTurn === 'undefined') gameState._stats.maxTokensInTurn = 0;
                if (typeof gameState._stats.totalCharacters === 'undefined') gameState._stats.totalCharacters = 0;
                if (typeof gameState._stats.completedQuests === 'undefined') gameState._stats.completedQuests = 0;
                if (typeof gameState._stats.totalPlayTime === 'undefined') gameState._stats.totalPlayTime = 0;
            }
            if (!gameState._undoHistory) gameState._undoHistory = [];
            if (!Array.isArray(gameState._worldModules)) gameState._worldModules = [];
            if (!Array.isArray(gameState._moments)) gameState._moments = [];
            if (!gameState._npcDiaries) gameState._npcDiaries = {};
            if (!gameState._chattedNpcs) gameState._chattedNpcs = {};
            if (!gameState._chatLogs) gameState._chatLogs = {};
            if (!gameState._mail) gameState._mail = [];
            if (!gameState._diary) gameState._diary = [];
            if (typeof gameState.userPrompt === 'undefined') gameState.userPrompt = '';
            if (typeof gameState.customStyle === 'undefined') gameState.customStyle = '';
            if (typeof gameState.systemPrompt === 'undefined') gameState.systemPrompt = '';
            if (typeof gameState.tokenCount === 'undefined') gameState.tokenCount = 0;
            if (typeof gameState.maxTokens === 'undefined') gameState.maxTokens = 80000;
        }
        if (gameState) {
            if (typeof gameState.streamFailCount === 'undefined') gameState.streamFailCount = 0;
            if (!gameState.gameTime) gameState.gameTime = {date: '', time: '', period: '', weather: '', era: ''};
            if (typeof gameState._jailbreakPrompt === 'undefined') gameState._jailbreakPrompt = '';
            if (typeof gameState._assistantPrompt === 'undefined') gameState._assistantPrompt = '';
            if (typeof gameState._MAX_UNDO_HISTORY === 'undefined') gameState._MAX_UNDO_HISTORY = 50;
            if (!gameState.wordCountConfig) {
                gameState.wordCountConfig = {
                    enabled: true, min: 1500, max: 3000,
                    paragraphMin: 15, paragraphMax: 17,
                    paragraphStyle: 'medium', lengthPreset: 'medium'
                };
            }
            if (!gameState._theaterContent) gameState._theaterContent = {};
            if (gameState._lastAIReply === undefined) gameState._lastAIReply = null;
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
        // 【修复】读档后触发自动存档，确保数据被保存
        autoSave();

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
    }
}
// 提取存档行数据格式化的公共辅助函数
function _formatSaveSlotData(data) {
    if (!data) return null;
    return {
        name: data.name || data.prompt || '未命名',
        time: data.time || ''
    };
}
// 【修复9 P1-2】使用正确的 async/await 模式
async function deleteFromSlot(slot) {
    try {
        var ok = await UI.confirm('删除存档', '确定删除这个存档？');
        if (!ok) return;
        await SaveDB.set(slot, null);
        renderSaveUI();
    } catch (e) {
        console.error('deleteFromSlot出错:', e);
        UI.toast('删除失败');
    }
}
async function renderSaveUI() {
    var ct = document.getElementById('saveLoadBody');
    if (!ct) return;
    var html = '';
    // 生成存档行的通用函数
    function slotRow(label, icon, data, slot, showSave) {
        var info = _formatSaveSlotData(data);
        var displayName = '';
        if (info) {
            displayName = icon + ' ' + label + ' - <strong>' + escapeHtml(info.name) +
                '</strong> <span style="font-size:11px;color:var(--text-tertiary)">(' + escapeHtml(info.time) + ')</span>';
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #e0ecf8;flex-wrap:wrap;gap:4px">' +
                '<span style="font-size:13px;color:var(--text-tertiary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">' +
                displayName + '</span>' + '<div style="display:flex;gap:4px;flex-shrink:0">' +
                '<button class="save-action-btn" onclick="renameSave(' + slot + ')">改名</button>' +
                '<button class="save-action-btn" onclick="loadFromSlot(' + slot + ')">读取</button>' + (
                    showSave ? '<button class="save-action-btn" onclick="safeSaveSlot(' + slot +
                    ')">覆盖</button>' : '') +
                '<button class="save-action-btn" onclick="deleteFromSlot(' + slot +
                ')" style="color:#ff6b6b">删除</button>' + '</div></div>';
        } else {
            displayName = icon + ' ' + label + ' - 空';
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #e0ecf8">' +
                '<span style="font-size:13px;color:var(--text-tertiary)">' + displayName + '</span>' + (showSave ?
                    '<button class="save-action-btn" onclick="safeSaveSlot(' + slot + ')">保存</button>' :
                    '') + '</div>';
        }
    }
    // 自动存档
    var auto = await SaveDB.get(0);
    html += slotRow('自动存档', '电', auto, 0, false);
    // 手动存档 1~5
    for (var mi = 1; mi <= LOCAL_MANUAL_COUNT; mi++) {
        var manual = await SaveDB.get(mi);
        html += slotRow('手动存档' + mi, '', manual, mi, true);
    }
    // 扩展存档 6~10
    html += '<div style="font-size:12px;color:var(--text-tertiary);margin-top:12px;margin-bottom:6px">扩展存档</div>';
    for (var ei = LOCAL_EXT_START; ei <= LOCAL_EXT_END; ei++) {
        var ext = await SaveDB.get(ei);
        html += slotRow('存档' + ei, '', ext, ei, true);
    }
    // 迁移按钮已移除（自由版无云存档）
    // 导入导出
    html += '<div style="margin-top:14px;padding-top:12px;border-top:2px dashed var(--border)">' +
        '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px;text-align:center">包 存档导入 / 导出</div>' +
        '<div style="display:flex;gap:8px">' +
        '<button class="pixel-btn blue big" onclick="exportSaves()" style="flex:1">导出全部存档</button>' +
        '<button class="pixel-btn big" onclick="document.getElementById(\'importFileInput\').click()" style="flex:1">导入存档</button>' +
        '</div>' +
        '<div style="font-size:10px;color:var(--text-tertiary);text-align:center;margin-top:6px">导出为JSON文件，可在其他设备导入恢复</div>' +
        '</div>';
    ct.innerHTML = html;
}
// 云迁移功能已移除（自由版无云存档）
// ── 首页读档弹窗 ──
async function openLoadModal() {
    try {
        var html = '';

        function loadRow(label, icon, data, slot) {
            if (!data) return '';
            var info = _formatSaveSlotData(data);
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--bg);margin-bottom:6px;border:2px solid #a2d2ff;cursor:pointer" onclick="safeLoadSlot(' +
                slot + ')">' + '<div style="flex:1;min-width:0;overflow:hidden">' +
                '<div style="font-size:14px;color:var(--text-tertiary);font-weight:600">' + icon + ' ' + escapeHtml(info.name) +
                '</div>' + '<div style="font-size:11px;color:var(--text-tertiary)">' + label + ' · ' + escapeHtml(info.time) +
                '</div>' + '</div>' +
                '<span style="color:#a2d2ff;font-size:18px;padding-left:10px">&#9654;</span></div>';
        }
        // 统一读取所有存档槽位
        var allSaves = {};
        try {
            allSaves[0] = await SaveDB.get(0);
            for (var si = 1; si <= LOCAL_EXT_END; si++) {
                allSaves[si] = await SaveDB.get(si);
            }
        } catch (e) {
            console.warn('读取存档列表失败:', e);
        }
        if (allSaves[0]) html += loadRow('自动存档', '', allSaves[0], 0);
        for (var mi = 1; mi <= LOCAL_MANUAL_COUNT; mi++) {
            if (allSaves[mi]) html += loadRow('手动存档' + mi, '', allSaves[mi], mi);
        }
        for (var ei = LOCAL_EXT_START; ei <= LOCAL_EXT_END; ei++) {
            if (allSaves[ei]) html += loadRow('存档' + ei, '', allSaves[ei], ei);
        }
        if (!html) {
            html = '<div style="text-align:center;padding:30px;color:var(--text-tertiary)">没有找到任何存档</div>';
        }
        html +=
            '<div style="margin-top:14px;padding-top:12px;border-top:2px dashed var(--border);display:flex;gap:8px">' +
            '<button class="pixel-btn blue big" onclick="UI.hideModal(\'loadModal\');exportSaves()" style="flex:1">导出存档</button>' +
            '<button class="pixel-btn big" onclick="document.getElementById(\'importFileInput\').click()" style="flex:1">导入存档</button>' +
            '</div>';
        // 移除旧弹窗（如果有）
        var old = document.getElementById('loadModal');
        if (old) old.remove();
        var overlay = document.createElement('div');
        overlay.className = 'modal-overlay active';
        overlay.id = 'loadModal';
        overlay.innerHTML =
            '<div class="pixel-modal"><div class="modal-titlebar"><span class="modal-titlebar-text">读取存档</span><div class="modal-close-btn" onclick="UI.hideModal(\'loadModal\')">×</div></div><div class="modal-body">' +
            html + '</div></div>';
        document.body.appendChild(overlay);
    } catch (e) {
        console.error('打开存档列表失败:', e);
        UI.toast('读取存档列表时出错: ' + translateError(e.message));
    }
}
// 安全读档包装（解决async onclick静默失败问题）
function safeLoadSlot(slot) {
    loadFromSlot(slot).catch(function(e) {
        console.error('读档失败:', e);
        UI.toast('读档失败: ' + translateError(e.message));
    });
}

// 显示游戏统计面板
function showGameStats() {
    var stats = (gameState && gameState._stats) || {};

    // 格式化时间
    function formatTime(ms) {
        if (!ms || ms < 1000) return '0秒';
        var seconds = Math.floor(ms / 1000);
        var minutes = Math.floor(seconds / 60);
        var hours = Math.floor(minutes / 60);
        var days = Math.floor(hours / 24);
        if (days > 0) return days + '天' + (hours % 24) + '小时';
        if (hours > 0) return hours + '小时' + (minutes % 60) + '分';
        if (minutes > 0) return minutes + '分' + (seconds % 60) + '秒';
        return seconds + '秒';
    }

    // 格式化数字
    function formatNum(n) {
        if (!n) return '0';
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
        return n.toString();
    }

    // 计算当前游戏时长
    var currentPlayTime = stats.totalPlayTime || 0;
    if (stats.startTime) {
        currentPlayTime += Date.now() - stats.startTime;
    }

    // 更新显示
    var playTimeEl = document.getElementById('statPlayTime');
    if (playTimeEl) playTimeEl.textContent = formatTime(currentPlayTime);

    var totalTurnsEl = document.getElementById('statTotalTurns');
    if (totalTurnsEl) totalTurnsEl.textContent = formatNum(stats.totalTurns || ((gameState && gameState.conversationHistory) || []).filter(m => m.role === 'assistant').length || 0);

    var totalTokensEl = document.getElementById('statTotalTokens');
    if (totalTokensEl) totalTokensEl.textContent = formatNum(stats.totalTokens || (gameState && gameState.tokenCount) || 0);

    var maxTokensEl = document.getElementById('statMaxTokens');
    if (maxTokensEl) maxTokensEl.textContent = formatNum(stats.maxTokensInTurn || 0);

    var totalCharsEl = document.getElementById('statTotalCharacters');
    if (totalCharsEl) totalCharsEl.textContent = formatNum(stats.totalCharacters || 0);

    var currentCharsEl = document.getElementById('statCurrentCharacters');
    if (currentCharsEl) currentCharsEl.textContent = formatNum(Object.keys((gameState && gameState.allCharacters) || {}).length);

    var completedQuestsEl = document.getElementById('statCompletedQuests');
    if (completedQuestsEl) completedQuestsEl.textContent = formatNum(stats.completedQuests || 0);

    var currentQuestsEl = document.getElementById('statCurrentQuests');
    if (currentQuestsEl) currentQuestsEl.textContent = formatNum(((gameState && gameState.currentQuests) || []).length);

    var keyEventsEl = document.getElementById('statKeyEvents');
    if (keyEventsEl) keyEventsEl.textContent = formatNum(((gameState && gameState.keyEvents) || []).length);

    var versionEl = document.getElementById('statGameVersion');
    if (versionEl) versionEl.textContent = GAME_VERSION;

    var saveEl = document.getElementById('statCurrentSave');
    if (saveEl) saveEl.textContent = ((gameState && gameState.userPrompt) || '').substring(0, 15) || '-';
    
    UI.showModal('statsModal');
}

// ========================================
// 旧手动存档兼容（从早期版本迁移）
// ========================================
function safeLoadOldManual(idx) {
    try {
        var oldManual = localStorage.getItem('freeScript_saves');
        if (!oldManual) {
            UI.toast('没有找到旧存档');
            return;
        }
        var arr = JSON.parse(oldManual);
        if (!arr[idx]) {
            UI.toast('旧存档不存在');
            return;
        }
        var saveData = arr[idx];
        if (saveData && saveData.state) {
            var state = JSON.parse(saveData.state);
            Object.assign(gameState, state);
            UI.goHome();
            UI.toast('旧存档已加载');
        } else {
            UI.toast('旧存档格式不兼容');
        }
    } catch (e) {
        console.error('读取旧存档失败:', e);
        UI.toast('读取旧存档失败: ' + e.message);
    }
}

async function renameSave(slot) {
    try {
        var data = await SaveDB.get(slot);
        if (!data) return;
        var oldName = data.name || data.prompt || '';
        var newName = await UI.prompt('修改存档名：', oldName);
        if (newName === null) return;
        data.name = newName;
        await SaveDB.set(slot, data);
        renderSaveUI();
    } catch (e) {
        console.error('renameSave出错:', e);
        UI.toast('改名失败');
    }
}
function mergeQuests(newQuests) {
    if (!newQuests || !Array.isArray(newQuests)) return;
    if (!gameState.currentQuests) gameState.currentQuests = [];
    newQuests.forEach(function(nq) {
        if (!nq || !nq.title) return;
        var existIdx = -1;
        for (var i = 0; i < gameState.currentQuests.length; i++) {
            if (gameState.currentQuests[i].title === nq.title) {
                existIdx = i;
                break;
            }
        }
        if (existIdx !== -1) {
            gameState.currentQuests[existIdx] = nq;
        } else {
            gameState.currentQuests.push(nq);
        }
    });
    // 修复：先分离，再合并，避免闭包变量污染
    var active = gameState.currentQuests.filter(function(q) {
        return q.status !== '已完成' && q.status !== '失败';
    });
    var done = gameState.currentQuests.filter(function(q) {
        return q.status === '已完成' || q.status === '失败';
    });
    // 最多保留3个已完成的
    if (done.length > 3) done = done.slice(-3);
    gameState.currentQuests = active.concat(done);
    // 【数据联通】推送到权威源 gm.quests，再触发同步 + UI 刷新
    _pushCurrentQuestsToGM();
    if (typeof _syncQuestsToGameState === 'function') _syncQuestsToGameState();
    if (window.GameLinker) {
        GameLinker.refreshByDataChange('currentQuests');
    }
}
// ========================================
// 角色关系网
// ========================================
function mergeRelationships(newRels) {
    if (!newRels || !Array.isArray(newRels)) return;
    if (!gameState.relationships) gameState.relationships = [];
    newRels.forEach(function(nr) {
        if (!nr || !nr.from || !nr.to) return;
        // 找已有的相同关系对（A→B 或 B→A 算同一对）
        var existIdx = -1;
        for (var i = 0; i < gameState.relationships.length; i++) {
            var r = gameState.relationships[i];
            if ((r.from === nr.from && r.to === nr.to) || (r.from === nr.to && r.to === nr.from)) {
                existIdx = i;
                break;
            }
        }
        if (existIdx !== -1) {
            // 更新已有关系
            gameState.relationships[existIdx] = nr;
        } else {
            // 新关系
            gameState.relationships.push(nr);
        }
    });
    // 上限10条
    if (gameState.relationships.length > 10) {
        gameState.relationships = gameState.relationships.slice(-10);
    }
    // 【数据联通】推送到权威源 gm.tables.relationships，再触发同步 + UI 刷新
    if (typeof _pushRelationshipsToGM === 'function') _pushRelationshipsToGM();
    if (typeof _syncRelationshipsToGameState === 'function') _syncRelationshipsToGameState();
    // 联动：广播关系数据变更
    if (window.GameLinker) {
        GameLinker.refreshByDataChange('relationships');
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
        html += '</div>';
    });
    list.innerHTML = html;
}
function getRelationTagClass(type) {
    // 【修改】不再硬编码，根据关键词智能判断
    if (!type) return 'relation-tag-neutral';
    var t = type.toLowerCase();
    
    // 爱情/暧昧类关键词
    if (/爱|恋|心动|暧昧|暗恋|喜欢|钟情|倾心|爱慕|迷恋|痴迷| sweetheart|crush|beloved/.test(t)) {
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
    var quests = gameState.currentQuests || [];
    if (quests.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';
    // 排序：进行中在前，已完成/失败在后
    var sorted = quests.slice().sort(function(a, b) {
        var order = {
            '进行中': 0,
            '失败': 1,
            '已完成': 2
        };
        return (order[a.status] || 0) - (order[b.status] || 0);
    });
    var html =
        '<div class="module-header" onclick="toggleQuestList()" style="cursor:pointer"><span class="module-header-text">当前任务</span><span id="questToggleArrow" style="font-size:14px;color:#a2d2ff;transition:transform .2s">▼</span></div>';
    html += '<div class="quest-list" id="questListInner">';
    sorted.forEach(function(q) {
        var isDone = q.status === '已完成' || q.status === '失败';
        var itemClass = isDone ? 'quest-item quest-done' : 'quest-item';
        // 类型标签
        var typeClass = 'quest-type ';
        if (q.type === '主线') typeClass += 'quest-type-main';
        else if (q.type === '隐藏') typeClass += 'quest-type-hidden';
        else typeClass += 'quest-type-side';
        // 状态标签
        var statusClass = 'quest-status ';
        if (q.status === '已完成') statusClass += 'quest-status-done';
        else if (q.status === '失败') statusClass += 'quest-status-failed';
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
                var cur = parseInt(parts[0]) || 0;
                var total = parseInt(parts[1]) || 1;
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

// ========================================
// 存档系统
// ========================================
// ========================================
// 设置保存/加载
// ========================================
// ========================================
// 存档导入 / 导出
// ========================================
// 确保页面有隐藏的file input
// --- 工具函数 ---

// 自动存档函数（简化版）
async function openSaveLoadModal() {
    var body = document.getElementById('saveLoadBody');
    if (!body) return;
    body.innerHTML =
        '<div style="text-align:center;padding:20px;color:var(--text-secondary)">加载中...</div>';
    UI.showModal('saveLoadModal');
    try {
        var autoData = await SaveDB.get(0);
        var slots = [];
        for (var i = 1; i <= 5; i++) {
            slots.push({
                slot: i,
                data: await SaveDB.get(i)
            });
        }
        var html = '';
        html += '<div class="sl-section-title">自动存档</div>';
        if (autoData) {
            html += '<div class="sl-slot"><div class="sl-slot-info"><div class="sl-slot-name">' +
                escapeHtml(autoData.name || '自动存档') + '</div><div class="sl-slot-meta">' + escapeHtml(
                    autoData.time || '') +
                '</div></div><div class="sl-slot-actions"><button class="sl-btn primary" onclick="loadFromSlot(0)">读取</button></div></div>';
        } else {
            html +=
                '<div class="sl-slot sl-slot-empty"><div class="sl-slot-info"><div class="sl-slot-name">暂无自动存档</div></div></div>';
        }
        html += '<hr class="sl-divider">';
        html += '<div class="sl-section-title">手动存档</div>';
        for (var j = 0; j < slots.length; j++) {
            var s = slots[j];
            if (s.data) {
                html += '<div class="sl-slot"><div class="sl-slot-info"><div class="sl-slot-name">' +
                    escapeHtml(s.data.name || ('存档 ' + s.slot)) + '</div><div class="sl-slot-meta">' +
                    escapeHtml(s.data.time || '') +
                    '</div></div><div class="sl-slot-actions"><button class="sl-btn primary" onclick="loadFromSlot(' +
                    s.slot + ')">读取</button><button class="sl-btn" onclick="saveToSlot(' + s.slot +
                    ')">覆盖</button><button class="sl-btn danger" onclick="deleteSaveSlot(' + s.slot +
                    ')">删除</button></div></div>';
            } else {
                html +=
                    '<div class="sl-slot sl-slot-empty"><div class="sl-slot-info"><div class="sl-slot-name">存档位 ' +
                    s.slot +
                    ' - 空</div></div><div class="sl-slot-actions"><button class="sl-btn" onclick="saveToSlot(' +
                    s.slot + ')">保存</button></div></div>';
            }
        }
        html +=
            '<div class="sl-bottom-actions"><button class="sl-btn" onclick="UI.hideModal(\'saveLoadModal\')">关闭</button></div>';
        body.innerHTML = html;
    } catch (e) {
        console.error('openSaveLoadModal出错:', e);
        body.innerHTML =
            '<div style="text-align:center;padding:20px;color:var(--danger)">加载存档列表失败</div>';
    }
}
async function deleteSaveSlot(slot) {
    return deleteFromSlot(slot);
}

// ========================================
// 第6层: NPC系统
// ========================================
function openNpcChat(name) {
    try {
        UI.hideModal('npcDetailModal');
    } catch (e) {}
    npcChatState.npcName = name;
    if (gameState && (!gameState._chatLogs || Array.isArray(gameState._chatLogs))) gameState._chatLogs = {};
    npcChatState.chatHistory = (gameState && gameState._chatLogs && gameState._chatLogs[name]) ? gameState._chatLogs[name].slice() : [];
    npcChatState.isSending = false;
        npcChatState.abortController = null; // 重置NPC聊天的AbortController
    if (gameState) {
        if (!gameState._chattedNpcs) gameState._chattedNpcs = {};
        gameState._chattedNpcs[name] = true;
    }
    // 【优化】打开聊天时标记该 NPC 的消息为已读
    if (gameState && gameState._notifSeenSnapshot) {
        if (!gameState._notifSeenSnapshot.chat) gameState._notifSeenSnapshot.chat = {};
        var npcSent = ((gameState._chatLogs && gameState._chatLogs[name]) || []).filter(function(m) {
            if (!m) return false;
            if (m.role === 'player' || m.from === 'player' || m.from === 'me') return false;
            return (m.text || '').trim();
        });
        gameState._notifSeenSnapshot.chat[name] = npcSent.length;
    }
    var titleEl = document.getElementById('npcChatTitle');
    var msgsEl = document.getElementById('npcChatMessages');
    var choicesEl = document.getElementById('npcChatChoices');
    var inputEl = document.getElementById('npcChatInput');
    var sendEl = document.getElementById('npcChatSend');
    if (!titleEl || !msgsEl || !choicesEl || !inputEl || !sendEl) {
        console.warn('npcChatModal not found');
        return;
    }
    var remark = (gameState && gameState._chatRemarks && gameState._chatRemarks[name]) || name;
    titleEl.textContent = '与「' + remark + '」对话';
    msgsEl.innerHTML = '';
    choicesEl.innerHTML = '';
    inputEl.value = '';
    inputEl.placeholder = '对' + name + '说...';
    sendEl.disabled = false; // 重新渲染历史气泡
    npcChatState.chatHistory.forEach(function(msg) {
        addNpcChatBubble(msg.role, msg.text, true);
    });
    UI.showModal('npcChatModal');
    // 绑定回车（使用事件委托避免重复绑定）
    var input = document.getElementById('npcChatInput');
    if (input && !input._hasEnterBinding) {
        input._hasEnterBinding = true;
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13) {
                if (!e.shiftKey) {
                    e.preventDefault();
                    sendNpcChat();
                }
            }
        });
    }
}
function closeNpcChat() {
    UI.hideModal('npcChatModal');
    npcChatState.npcName = '';
    npcChatState.chatHistory = [];
    npcChatState.isSending = false;
    var ep = document.getElementById('emojiPanel');
    if (ep) ep.classList.remove('open');
}
function toggleChatMenu() {
    var existing = document.getElementById('chatMenuPanel');
    if (existing) {
        existing.remove();
        return;
    }
    var menu = document.createElement('div');
    menu.id = 'chatMenuPanel';
    menu.style.cssText =
        'position:absolute;top:44px;right:8px;background:var(--bg);border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.12);padding:4px 0;z-index:200;min-width:130px;overflow:hidden';
    var items = [{
            text: '编辑备注',
            action: 'editChatRemark'
        },
        {
            text: '修改头像',
            action: 'changeNpcAvatar'
        },
        {
            text: '拉黑好友',
            action: 'blockNpc'
        },
        {
            text: '删除好友',
            action: 'deleteNpcChat'
        }
    ];
    items.forEach(function(item) {
        var row = document.createElement('div');
        row.style.cssText =
            'padding:12px 16px;font-size:14px;color:var(--text);cursor:pointer;transition:background .15s';
        row.textContent = item.text;
        row.onmouseenter = function() {
            this.style.background = '#f5f5f5';
        };
        row.onmouseleave = function() {
            this.style.background = '';
        };
        row.onclick = function() {
            menu.remove();
            window[item.action]();
        };
        menu.appendChild(row);
    });
    var header = document.querySelector('.chat-detail-header');
    if (header) header.appendChild(menu);
    // 【性能优化】用 once 选项监听器自动清理，防止重复打开菜单导致监听器累积
    var closeMenu = function(e) {
        if (!menu.contains(e.target) && e.target.id !== 'chatDetailMore') {
            menu.remove();
        }
    };
    TimerManager.setTimeout('chatMenuClick', function() {
        document.addEventListener('click', closeMenu, { once: true });
    }, 10);
}
function editChatRemark() {
    var name = npcChatState.npcName;
    var currentRemark = (gameState && gameState._chatRemarks && gameState._chatRemarks[name]) || '';
    var menu = document.getElementById('chatMenuPanel');
    if (menu) menu.remove();
    var header = document.querySelector('.chat-detail-header');
    if (!header) return;
    var panel = document.createElement('div');
    panel.id = 'chatRemarkPanel';
    panel.style.cssText =
        'position:absolute;top:44px;left:8px;right:8px;background:var(--bg);border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.12);padding:12px 16px;z-index:200';
    var safeRemark = (currentRemark || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    panel.innerHTML = '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">备注名</div>' +
        '<input type="text" id="remarkInput" value="' + safeRemark +
        '" placeholder="输入备注名" style="width:100%;height:36px;border:1px solid #e5e5e5;border-radius:8px;padding:0 12px;font-size:14px;outline:none;box-sizing:border-box">' +
        '<div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end">' +
        '<span id="remarkCancel" style="padding:6px 16px;font-size:14px;color:#999;cursor:pointer">取消</span>' +
        '<span id="remarkSave" style="padding:6px 16px;font-size:14px;color:#07C160;cursor:pointer;font-weight:500">保存</span></div>';
    header.appendChild(panel);
    var inp = document.getElementById('remarkInput');
    TimerManager.setTimeout('remarkFocus', function() {
        inp.focus();
        inp.select();
    }, 50);
    document.getElementById('remarkCancel').onclick = function() {
        panel.remove();
    };
    document.getElementById('remarkSave').onclick = function() {
        var val = inp.value.trim();
        if (gameState) {
            if (!gameState._chatRemarks) gameState._chatRemarks = {};
            if (val) {
                gameState._chatRemarks[name] = val;
            } else {
                delete gameState._chatRemarks[name];
            }
        }
        autoSave();
        var titleEl = document.getElementById('npcChatTitle');
        if (titleEl) titleEl.textContent = val ? '与「' + val + '」对话' : '与「' + name + '」对话';
        panel.remove();
    };
    inp.onkeypress = function(e) {
        if (e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            document.getElementById('remarkSave').click();
        }
    };
}
function changeNpcAvatar() {
    var name = npcChatState.npcName;
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
        var file = e.target.files[0];
        if (!file) return;
        // 图片大小限制：最大2MB
        var maxSize = 2 * 1024 * 1024; // 2MB
        if (file.size > maxSize) {
            UI.toast('图片太大，请选择小于2MB的图片');
            return;
        }
        var reader = new FileReader();
        reader.onload = function(ev) {
            // 压缩大图片
            var img = new Image();
            img.onload = function() {
                var canvas = document.createElement('canvas');
                var ctx = canvas.getContext('2d');
                var maxDim = 512; // 最大宽高
                var w = img.width;
                var h = img.height;
                if (w > maxDim || h > maxDim) {
                    if (w > h) {
                        h = Math.round(h * maxDim / w);
                        w = maxDim;
                    } else {
                        w = Math.round(w * maxDim / h);
                        h = maxDim;
                    }
                }
                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);
                var compressedData = canvas.toDataURL('image/jpeg', 0.8);
                
                if (gameState) {
                    if (!gameState._npcAvatars) gameState._npcAvatars = {};
                    gameState._npcAvatars[name] = compressedData;
                }
                autoSave();
                var avatars = document.querySelectorAll(
                '.chat-message:not(.self) .chat-message-avatar');
                avatars.forEach(function(a) {
                    a.style.backgroundImage = 'url(' + compressedData + ')';
                    a.style.backgroundSize = 'cover';
                    a.style.backgroundPosition = 'center';
                    a.textContent = '';
                });
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    };
    input.click();
}
function blockNpc() {
    var name = npcChatState.npcName;
    if (gameState) {
        if (!gameState._blockedNpcs) gameState._blockedNpcs = {};
        if (gameState._blockedNpcs[name]) {
            gameState._blockedNpcs[name] = false;
            autoSave();
            UI.toast('已取消拉黑「' + name + '」');
            return;
        }
    }
    var menu = document.getElementById('chatMenuPanel');
    if (menu) menu.remove();
    var header = document.querySelector('.chat-detail-header');
    if (!header) return;
    var panel = document.createElement('div');
    panel.style.cssText =
        'position:absolute;top:44px;left:50%;transform:translateX(-50%);background:var(--bg);border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.12);padding:16px;z-index:200;text-align:center;min-width:200px';
    panel.innerHTML = '<div style="font-size:15px;color:var(--text);margin-bottom:12px">确定拉黑「' + escapeHtml(name) +
        '」？</div>' +
        '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">拉黑后将不再收到消息</div>' +
        '<div style="display:flex;gap:12px;justify-content:center">' +
        '<span id="blockCancel" style="padding:8px 24px;background:#f5f5f5;border-radius:8px;font-size:14px;cursor:pointer">取消</span>' +
        '<span id="blockConfirm" style="padding:8px 24px;background:#ff3b30;color:#fff;border-radius:8px;font-size:14px;cursor:pointer">拉黑</span></div>';
    header.appendChild(panel);
    document.getElementById('blockCancel').onclick = function() {
        panel.remove();
    };
    document.getElementById('blockConfirm').onclick = function() {
        if (gameState) {
            if (!gameState._blockedNpcs) gameState._blockedNpcs = {};
            gameState._blockedNpcs[name] = true;
        }
        autoSave();
        panel.remove();
        closeNpcChat();
    };
}
function deleteNpcChat() {
    var name = npcChatState.npcName;
    var menu = document.getElementById('chatMenuPanel');
    if (menu) menu.remove();
    var header = document.querySelector('.chat-detail-header');
    if (!header) return;
    var panel = document.createElement('div');
    panel.style.cssText =
        'position:absolute;top:44px;left:50%;transform:translateX(-50%);background:var(--bg);border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.12);padding:16px;z-index:200;text-align:center;min-width:200px';
    panel.innerHTML = '<div style="font-size:15px;color:var(--text);margin-bottom:12px">删除与「' + escapeHtml(name) +
        '」的聊天？</div>' +
        '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">聊天记录将被清除，不可恢复</div>' +
        '<div style="display:flex;gap:12px;justify-content:center">' +
        '<span id="delCancel" style="padding:8px 24px;background:#f5f5f5;border-radius:8px;font-size:14px;cursor:pointer">取消</span>' +
        '<span id="delConfirm" style="padding:8px 24px;background:#ff3b30;color:#fff;border-radius:8px;font-size:14px;cursor:pointer">删除</span></div>';
    header.appendChild(panel);
    document.getElementById('delCancel').onclick = function() {
        panel.remove();
    };
    document.getElementById('delConfirm').onclick = function() {
        if (gameState) {
            if (gameState._chatLogs) delete gameState._chatLogs[name];
            if (gameState._chattedNpcs) delete gameState._chattedNpcs[name];
        }
        autoSave();
        panel.remove();
        closeNpcChat();
    };
}
function toggleEmojiPanel() {
    var panel = document.getElementById('emojiPanel');
    if (!panel) return;
    if (panel.classList.contains('open')) {
        panel.classList.remove('open');
        return;
    }
    renderEmojiPanel();
    panel.classList.add('open');
}
function renderEmojiPanel() {
    var panel = document.getElementById('emojiPanel');
    if (!panel) return;
    panel.innerHTML = '';
    if (gameState && !gameState._customEmojis) gameState._customEmojis = ['[笑脸]', '[大哭]', '[怒]', '[晕]', '[偷笑]', '[吃瓜]',
        '[暗中观察]', '[狗头]', '[抱抱]', '[白眼]'
    ];
    if (gameState && gameState._customEmojis && gameState._customEmojis.length === 0) {
        var hint = document.createElement('div');
        hint.className = 'empty-state';
        hint.style.cssText = 'width:100%;padding:16px 0';
        hint.textContent = '还没有表情，点击 + 添加';
        panel.appendChild(hint);
    } else {
        (gameState._customEmojis || []).forEach(function(e, i) {
            var item = document.createElement('span');
            item.className = 'emoji-item';
            item.style.position = 'relative';
            item.textContent = e;
            item.onclick = function(ev) {
                if (ev.target.classList.contains('emoji-del')) return;
                insertEmoji(e);
            };
            var del = document.createElement('span');
            del.className = 'emoji-del';
            del.textContent = '×';
            del.style.cssText =
                'position:absolute;top:-6px;right:-6px;width:16px;height:16px;background:#ff3b30;color:#fff;border-radius:50%;font-size:10px;display:none;align-items:center;justify-content:center;cursor:pointer;line-height:16px;text-align:center';
            del.onclick = function(ev) {
                ev.stopPropagation();
                gameState._customEmojis.splice(i, 1);
                autoSave();
                renderEmojiPanel();
            };
            item.onmouseenter = function() {
                del.style.display = 'flex';
            };
            item.onmouseleave = function() {
                del.style.display = 'none';
            };
            item.appendChild(del);
            panel.appendChild(item);
        });
    }
    var addBtn = document.createElement('span');
    addBtn.className = 'emoji-item';
    addBtn.style.cssText = 'background:#07C160;color:#fff;font-weight:600';
    addBtn.textContent = '+ 添加';
    addBtn.onclick = function() {
        panel.innerHTML = '';
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;width:100%;align-items:center';
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.placeholder = '输入表情名，如：吃瓜';
        inp.style.cssText =
            'flex:1;height:32px;border:1px solid #ddd;border-radius:8px;padding:0 10px;font-size:13px;outline:none';
        inp.id = 'emojiNewInput';
        var confirmBtn = document.createElement('span');
        confirmBtn.className = 'emoji-item';
        confirmBtn.style.cssText = 'background:#07C160;color:#fff;font-weight:600;flex-shrink:0';
        confirmBtn.textContent = '确定';
        confirmBtn.onclick = function() {
            var val = inp.value.trim();
            if (!val) return;
            var emoji = '[' + val + ']';
            if (gameState && gameState._customEmojis && gameState._customEmojis.indexOf(emoji) === -1) {
                gameState._customEmojis.push(emoji);
                autoSave();
            }
            renderEmojiPanel();
        };
        var cancelBtn = document.createElement('span');
        cancelBtn.className = 'emoji-item';
        cancelBtn.style.cssText = 'flex-shrink:0';
        cancelBtn.textContent = '取消';
        cancelBtn.onclick = function() {
            renderEmojiPanel();
        };
        row.appendChild(inp);
        row.appendChild(confirmBtn);
        row.appendChild(cancelBtn);
        panel.appendChild(row);
        TimerManager.setTimeout('emojiFocus', function() {
            inp.focus();
        }, 50);
        inp.onkeypress = function(e) {
            if (e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            confirmBtn.click();
        }
        };
    };
    panel.appendChild(addBtn);
}
function insertEmoji(emoji) {
    var input = document.getElementById('npcChatInput');
    if (!input) return;
    var start = input.selectionStart;
    var end = input.selectionEnd;
    var val = input.value;
    input.value = val.substring(0, start) + emoji + val.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + emoji.length;
}
function showNpcMessageNotification(name, text) {
    var container = document.getElementById('npcNotifContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'npcNotifContainer';
        container.style.cssText =
            'position:fixed;top:0;left:0;right:0;z-index:10000;display:flex;flex-direction:column;align-items:center;pointer-events:none;padding-top:8px;gap:6px';
        document.body.appendChild(container);
    }
    var notif = document.createElement('div');
    notif.style.cssText =
        'background:rgba(0,0,0,0.8);color:#fff;padding:10px 18px;border-radius:20px;font-size:13px;max-width:300px;pointer-events:auto;cursor:pointer;opacity:0;transform:translateY(-20px);transition:opacity .3s,transform .3s;display:flex;align-items:center;gap:8px';
    var avatar = document.createElement('span');
    avatar.style.cssText =
        'width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0';
    avatar.textContent = name.charAt(0);
    var content = document.createElement('div');
    content.innerHTML = '<div style="font-weight:600;font-size:12px;opacity:0.9">' + escapeHtml(name) +
        '</div><div style="font-size:12px;opacity:0.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px">' +
        escapeHtml(text) + '</div>';
    notif.appendChild(avatar);
    notif.appendChild(content);
    container.appendChild(notif);
    notif.onclick = function() {
        notif.remove();
        openNpcChat(name);
    };
    requestAnimationFrame(function() {
        notif.style.opacity = '1';
        notif.style.transform = 'translateY(0)';
    });
    TimerManager.setTimeout('npcNotifHide', function() {
        notif.style.opacity = '0';
        notif.style.transform = 'translateY(-20px)';
        TimerManager.setTimeout('npcNotifRemove', function() {
            if (notif.parentNode) notif.remove();
        }, 300);
    }, 3000);
}
function sendNpcChat() {
    if (npcChatState.isSending) return;
    var input = document.getElementById('npcChatInput');
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    // 显示玩家气泡
    addNpcChatBubble('player', text);
    // 请求NPC回复（防 unhandledrejection：捕获异步错误）
    try {
        var p = requestNpcReply(text);
        if (p && typeof p.catch === 'function') {
            p.catch(function(e) {
                if (e && e.name === 'AbortError') return;
                console.error('[NPC聊天] 异步操作失败:', e);
                if (typeof UI !== 'undefined' && UI.toast) {
                    UI.toast('发送失败: ' + (e && e.message ? e.message : '未知错误'));
                }
            });
        }
    } catch (e) {
        console.error('[NPC聊天] 同步错误:', e);
        if (typeof UI !== 'undefined' && UI.toast) {
            UI.toast('发送失败: ' + (e && e.message ? e.message : '未知错误'));
        }
    }
}
function selectNpcChatChoice(text) {
    if (npcChatState.isSending) return;
    // 清掉选项
    document.getElementById('npcChatChoices').innerHTML = '';
    // 显示玩家气泡
    addNpcChatBubble('player', text);
    // 请求NPC回复（防 unhandledrejection）
    try {
        var p = requestNpcReply(text);
        if (p && typeof p.catch === 'function') {
            p.catch(function(e) {
                if (e && e.name === 'AbortError') return;
                console.error('[NPC聊天] 异步操作失败:', e);
                if (typeof UI !== 'undefined' && UI.toast) {
                    UI.toast('发送失败: ' + (e && e.message ? e.message : '未知错误'));
                }
            });
        }
    } catch (e) {
        console.error('[NPC聊天] 同步错误:', e);
        if (typeof UI !== 'undefined' && UI.toast) {
            UI.toast('发送失败: ' + (e && e.message ? e.message : '未知错误'));
        }
    }
}
function renderRichMessage(text) {
    if (!text) return '';
    text = text.replace(/\[照片[：:]([^\]]+)\]/g, function(m, desc) {
        return '<div class="rich-photo"><div class="rich-photo-desc">' + escapeHtml(desc) +
            '</div></div>';
    });
    text = text.replace(/\[定位[：:]([^\]]+)\]/g, function(m, loc) {
        return '<div class="rich-location"><div class="rich-location-name">' + escapeHtml(loc) +
            '</div></div>';
    });
    // 【修复C P2-2】对NPC聊天消息进行HTML净化，防止XSS
    return sanitizeHtml(text);
}
function addNpcChatBubble(role, text, skipPush) {
    var messages = document.getElementById('npcChatMessages');
    if (!messages) return;
    var isPlayer = role === 'player';
    var avatarChar = isPlayer ? '我' : (npcChatState.npcName ? npcChatState.npcName.charAt(0) : '?');
    var now = new Date();
    var timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    var bubble = document.createElement('div');
    bubble.className = 'chat-message' + (isPlayer ? ' self' : '');
    bubble.innerHTML = '<div class="chat-message-avatar">' + escapeHtml(avatarChar) + '</div>' +
        '<div><div class="chat-message-content">' + renderRichMessage(text) +
        '</div><div class="chat-message-meta"><span>' + timeStr + '</span></div></div>';
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    if (!skipPush) {
        npcChatState.chatHistory.push({
            role: role,
            text: text
        });
        // 限制聊天历史长度，防止内存泄漏
        if (npcChatState.chatHistory.length > 100) {
            npcChatState.chatHistory = npcChatState.chatHistory.slice(-50);
        }
        if (gameState) {
            if (!gameState._chatLogs || Array.isArray(gameState._chatLogs)) gameState._chatLogs = {};
            gameState._chatLogs[npcChatState.npcName] = npcChatState.chatHistory.slice();
        }
        // 自动保存聊天记录
        safeAutoSave();
    }
}
async function requestNpcReply(playerText) {
    // 先清理旧的 AbortController，避免竞态条件
    if (npcChatState.abortController) {
        try { npcChatState.abortController.abort(); } catch(e) {}
    }
    npcChatState.isSending = true;
    // 【修复R1】创建NPC聊天专用的AbortController
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
        // 【P1性能优化】走统一入口，本轮内复用主路径的扫描结果
        if (typeof WorldInfo !== 'undefined' && WorldInfo.buildInjection) {
            var _npcWI = (typeof getWorldInfoInjection === 'function') ? getWorldInfoInjection() : WorldInfo.buildInjection(gameState.conversationHistory || []);
            var _npcWIText = (typeof _npcWI === 'object' && _npcWI !== null) ? (_npcWI.text || '') : (_npcWI || '');
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
        // 【P0边界修复】_useSysprompt=false 时把 system role 转为 user
        chatMessages = _applyUseSysprompt(chatMessages);
        var response = await callAI(chatMessages, {
            stream: false,
            temperature: gameState.temperature != null ? gameState.temperature : 0.8,
            max_tokens: 1024,
            antiRepeat: true,
            // 【修复R1】使用NPC聊天专用的AbortController
            signal: npcChatState.abortController ? npcChatState.abortController.signal : undefined
        });
        // 移除loading
        var loadingEl = document.getElementById('npcChatLoading');
        if (loadingEl) loadingEl.remove();
        // 解析回复
        var replies = [];
        var choices = [];
        var parsed = safeJSONParse(response);
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
                var plainText = response.replace(/```[\s\S]*?```/g, '').replace(/\{[\s\S]*\}/g, '')
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
                        // 【修复X5】NPC聊天选项需要转义
                        var choicesHtml = choices.map(function(ch) {
                            var safe = String(ch).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(
                                /"/g, '&quot;').replace(/\n/g, ' ');
                            return '<button class="npc-chat-choice" onclick="selectNpcChatChoice(\'' +
                                safe + '\')">' + escapeHtml(ch) + '</button>';
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
        // 好感度可能变化，更新到allCharacters（别名 → 自动同步到 gm.tables.characters）
        if (parsed && parsed.favorability !== undefined) {
            if (gameState && gameState.allCharacters && gameState.allCharacters[name]) {
                gameState.allCharacters[name].favorability = parsed.favorability;
                // 【数据联通】触发记忆页/回顾页等所有依赖页面刷新
                if (typeof GameLinker !== 'undefined') GameLinker.refreshByDataChange('allCharacters');
                renderNpcList();
            }
        }
        // 联动1：把这次私聊摘要加入剧情记忆（避免剧情AI忘记NPC私聊内容）
        if (replies.length > 0) {
            var chatSummary = name + '与玩家私聊：' + replies.slice(0, 3).join(' / ');
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
        if (window.GameLinker) {
            GameLinker.refreshByDataChange('_chatLogs');
            GameLinker.refreshByDataChange('allCharacters');
        }
    } catch (e) {
        if (e.name === 'AbortError') return;
        var loadingEl2 = document.getElementById('npcChatLoading');
        if (loadingEl2) loadingEl2.remove();
        addNpcChatBubble('npc', '（对话出错了: ' + e.message + '）');
        console.error('NPC对话失败:', e);
    } finally {
        npcChatState.isSending = false;
        // 【修复R1】清理NPC聊天的AbortController
        npcChatState.abortController = null;
        var sendBtn = document.getElementById('npcChatSend');
        if (sendBtn) sendBtn.disabled = false;
        var inputEl = document.getElementById('npcChatInput');
        if (inputEl) inputEl.focus();
    }
}
function openEditNpcModal(name) {
    UI.hideModal('npcDetailModal');
    npcEditingName = name;
    var c = gameState.allCharacters[name];
    if (!c) return;
    var el;
    el = document.getElementById('npcEditModalTitle'); if (el) el.textContent = '编辑「' + name + '」';
    el = document.getElementById('npcEditName'); if (el) { el.value = c.name || ''; el.disabled = true; }
    el = document.getElementById('npcEditTitle2'); if (el) el.value = c.title || '';
    el = document.getElementById('npcEditRelation'); if (el) el.value = c.relation || '';
    el = document.getElementById('npcEditFavor'); if (el) el.value = c.favorability !== undefined ? c.favorability : 50;
    el = document.getElementById('npcEditDesc'); if (el) el.value = c.desc || '';
    var extra = '';
    if (c.details && c.details.length > 0) {
        extra = c.details.map(function(d) {
            return d.key + ': ' + d.value;
        }).join('\n');
    }
    el = document.getElementById('npcEditExtra'); if (el) el.value = extra;
    UI.showModal('npcEditModal');
}
function saveNpcEdit() {
    // 修复：每个 input 都做 nullish 检查，缺一不崩溃
    var nameEl = document.getElementById('npcEditName');
    if (!nameEl) { UI.toast('页面未加载完整'); return; }
    var name = nameEl.value.trim();
    if (!name) {
        UI.toast('请填写角色名字');
        return;
    }
    var titleEl = document.getElementById('npcEditTitle2');
    var relationEl = document.getElementById('npcEditRelation');
    var favorEl = document.getElementById('npcEditFavor');
    var descEl = document.getElementById('npcEditDesc');
    var extraEl = document.getElementById('npcEditExtra');
    var title = titleEl ? titleEl.value.trim() : '';
    var relation = relationEl ? relationEl.value.trim() : '';
    var favor = favorEl ? (parseInt(favorEl.value) || 50) : 50;
    var desc = descEl ? descEl.value.trim() : '';
    var extra = extraEl ? extraEl.value.trim() : '';
    favor = Math.max(0, Math.min(100, favor));
    var details = [];
    if (extra) {
        extra.split('\n').forEach(function(line) {
            line = line.trim();
            if (!line) return;
            var idx = line.indexOf(':');
            if (idx === -1) idx = line.indexOf('：');
            if (idx !== -1) {
                details.push({
                    key: line.substring(0, idx).trim(),
                    value: line.substring(idx + 1).trim()
                });
            } else {
                details.push({
                    key: '设定',
                    value: line
                });
            }
        });
    }
    if (npcEditingName && npcEditingName !== name) {
        if (gameState && gameState.allCharacters) delete gameState.allCharacters[npcEditingName];
    }
    if (gameState && gameState.allCharacters) {
        gameState.allCharacters[name] = {
            name: name,
            title: title,
            relation: relation,
            favorability: favor,
            desc: desc,
            details: details
        };
    }
    // 注入到对话历史让AI记住
    var injectText = '【系统提示：玩家更新了角色「' + name + '」的设定】\n' + '姓名: ' + name + '\n' + (title ? '身份: ' + title +
        '\n' : '') + (relation ? '关系: ' + relation + '\n' : '') + '好感度: ' + favor + '\n' + (desc ?
        '状态: ' + desc + '\n' : '');
    if (details.length > 0) {
        injectText += details.map(function(d) {
            return d.key + ': ' + d.value;
        }).join('\n') + '\n';
    }
    injectText += '请在后续剧情中按照以上设定来描写该角色。';
    if (gameState && gameState.conversationHistory && gameState.conversationHistory.length > 0) {
        gameState.conversationHistory.push({
            role: 'user',
            content: injectText
        }, {
            role: 'assistant',
            content: '明白，已更新「' + name + '」的角色设定，后续会保持一致。'
        });
    }
    renderNpcList();
    UI.hideModal('npcEditModal');
    autoSave();
    UI.toast('角色「' + name + '」已保存');
}
// --- 刷新所有面板（原版功能：一键重新渲染所有UI面板） ---
function refreshAllPanels() {
    try { renderPlayerStats(); } catch (e) { console.warn('renderPlayerStats error:', e); }
    try { renderNpcList(); } catch (e) { console.warn('renderNpcList error:', e); }
    try { renderQuests(); } catch (e) { console.warn('renderQuests error:', e); }
    try { renderBag(); } catch (e) { console.warn('renderBag error:', e); }
    try { if (typeof AchievementSystem !== 'undefined' && AchievementSystem.checkAchievements) AchievementSystem.checkAchievements(); } catch (e) { console.warn('AchievementSystem error:', e); }
    UI.toast('面板已刷新');
}
// --- NPC列表渲染 ---
function renderNpcList() {
    renderNpcPage();
}
function renderNpcPage() {
    // 确保 allCharacters 已初始化
    if (gameState && !gameState.allCharacters) gameState.allCharacters = {};
    var chars = Object.values((gameState && gameState.allCharacters) || {});
    // 【性能优化】数据未变时跳过整页重绘（每次点击导航栏都会触发此函数）
    try {
        var totalFav = 0, lastName = '';
        for (var _ci = 0; _ci < chars.length; _ci++) {
            totalFav += Number(chars[_ci].favorability) || 0;
            lastName = chars[_ci].name;
        }
        var _key = chars.length + '|' + totalFav + '|' + lastName;
        if (typeof RenderCache !== 'undefined' && RenderCache.same('renderNpcPage', _key)) return;
        if (typeof RenderCache !== 'undefined') RenderCache.mark('renderNpcPage', _key);
    } catch (e) { /* 缓存失败不阻塞渲染 */ }
    var container = document.getElementById('characterList');
    if (!container) return;
    if (chars.length === 0) {
        container.innerHTML =
            '<div class="empty-state"><div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><p>暂无角色</p><p style="font-size:12px;margin-top:4px;">AI会在剧情中自动创造角色</p></div>';
    } else {
        container.innerHTML = chars.map(function(c) {
            var fav = Number(c.favorability) || 0;
            fav = Math.max(-100, Math.min(100, fav));
            var sn = c.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ');
            // 【修改】直接使用AI返回的relation字段，不再硬编码好感度等级
            var favLevel = c.relation || '中立';
            // 根据好感度数值选择颜色（-100到100，0为中立）
            var favColor = '#b8c5d0'; // 默认灰蓝（中立）
            if (fav >= 80) favColor = '#ff6b9d'; // 粉色（极度亲密）
            else if (fav >= 60) favColor = '#ff8fab'; // 浅粉
            else if (fav >= 40) favColor = '#ffb3c6'; // 更浅粉
            else if (fav >= 15) favColor = '#a8dadc'; // 青色（友好）
            else if (fav >= -15) favColor = '#b8c5d0'; // 灰蓝（中立）
            else if (fav >= -40) favColor = '#9a8c98'; // 灰紫（疏远）
            else favColor = '#6c757d'; // 深灰（敌意）
            
            var tagsHtml = '';
            if (c.relation) tagsHtml += '<span class="char-tag">' + escapeHtml(c.relation) + '</span>';
            if (c.title) tagsHtml += '<span class="char-tag">' + escapeHtml(c.title) + '</span>';
            // 添加好感度等级标签
            tagsHtml += '<span class="char-tag" style="background:' + favColor + '20;color:' + favColor + ';">' + escapeHtml(favLevel) + '</span>';
            
            return '<div class="character-card pearl-card" onclick="openNpcDetail(\'' + sn +
                '\')">' +
                '<div class="avatar avatar-md"><span>' + c.name.charAt(0) + '</span></div>' +
                '<div class="char-info">' +
                '<div class="char-name">' + escapeHtml(c.name) + '</div>' +
                (c.title ? '<div class="char-meta">' + escapeHtml(c.title) + '</div>' : '') +
                '<div class="char-tags">' + tagsHtml + '</div>' +
                '<div class="char-stats">' +
                '<div class="char-stat-row"><span>好感</span><div class="progress-bar" style="background:' + favColor + '20;"><div class="progress-fill" style="width:' +
                fav + '%;background:' + favColor + ';"></div></div><span class="char-stat-value">' + fav + '</span></div>' +
                '</div>' +
                (c.desc ?
                    '<div class="npc-thought-bubble" onclick="event.stopPropagation();this.classList.toggle(\'expanded\')"><div class="npc-thought-label">状态</div><div class="thought-content"><div class="npc-thought-text">' +
                    escapeHtml(c.desc) + '</div></div></div>' : '') +
                '</div></div>';
        }).join('');
    }
    // 仅在导航栏未渲染过时才重建
    var npcNav = document.getElementById('npcNav');
    if (npcNav && !npcNav._rendered) {
        renderNavBar('npcNav', [{
                page: 'storyPage',
                icon: 'icon-book',
                label: '剧情'
            },
            {
                page: 'playerPage',
                icon: 'icon-user',
                label: '个人'
            },
            {
                page: 'npcPage',
                icon: 'icon-users',
                label: '人际'
            },
            {
                page: 'logPage',
                icon: 'icon-grid',
                label: '日志'
            },
            {
                page: 'memoryPage',
                icon: 'icon-sparkles',
                label: '记忆'
            },
            {
                page: 'recapPage',
                icon: 'icon-clock',
                label: '回顾'
            }
        ], 2);
        npcNav._rendered = true;
    }
}
// --- NPC详情弹窗 ---
function openNpcDetail(name) {
    if (!gameState || !gameState.allCharacters) return;
    var c = gameState.allCharacters[name];
    if (!c) return;

    // 构建详情内容
    var html = '';
    // 头像和名称
    html += '<div style="text-align:center;margin-bottom:16px;">' +
        '<div class="avatar avatar-lg" style="margin:0 auto;"><span>' + escapeHtml(c.name.charAt(0)) + '</span></div>' +
        '<h3 style="font-size:20px;font-weight:600;margin-top:10px;">' + escapeHtml(c.name) + '</h3>' +
        (c.title ? '<p class="text-soft">' + escapeHtml(c.title) + '</p>' : '') +
        '</div>';

    // 基本信息字段（key-value 行）
    var baseFields = [{
            key: '身份',
            value: c.title || '-'
        },
        {
            key: '关系',
            value: c.relation || '-'
        }
    ];
    if (c.desc) baseFields.push({
        key: '状态',
        value: c.desc
    });

    html += '<div class="pearl-card" style="padding:12px;margin-bottom:12px;">';
    html += baseFields.map(function(f) {
        return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:14px;">' +
            '<span style="color:var(--text-secondary);">' + f.key + '</span>' +
            '<span style="color:var(--text);font-weight:500;">' + escapeHtml(f.value) + '</span></div>';
    }).join('');

    // 动态 details 字段
    if (c.details && c.details.length > 0) {
        html += c.details.map(function(d) {
            return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:14px;">' +
                '<span style="color:var(--text-secondary);">' + escapeHtml(d.key) + '</span>' +
                '<span style="color:var(--text);font-weight:500;">' + escapeHtml(d.value) + '</span></div>';
        }).join('');
    }
    html += '</div>';

    // 好感度进度条（数值+等级）
    if (c.favorability !== undefined) {
        var fav = Number(c.favorability) || 0;
        // 范围 -100 到 100，0 为中立
        fav = Math.max(-100, Math.min(100, fav));
        // 使用AI动态生成的关系描述，不再硬编码等级名称
        var favLevel = c.relation || '中立';
        var favColor = '';
        if (fav >= 80) favColor = '#ff6b9d';
        else if (fav >= 60) favColor = '#ff8fab';
        else if (fav >= 40) favColor = '#ffb3c6';
        else if (fav >= 15) favColor = '#a8dadc';
        else if (fav >= -15) favColor = '#b8c5d0';
        else if (fav >= -40) favColor = '#9a8c98';
        else favColor = '#6c757d';
        
        html += '<div class="pearl-card" style="padding:12px;margin-bottom:12px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<span style="font-size:13px;color:var(--text-secondary);font-weight:500;">好感度</span>' +
            '<span style="display:flex;align-items:center;gap:8px;">' +
            '<span style="font-size:12px;color:#fff;background:' + favColor + ';padding:2px 8px;border-radius:10px;font-weight:500;">' + favLevel + '</span>' +
            '<span style="font-size:14px;color:var(--text);font-weight:600;">' + fav + '</span></span></div>' +
            '<div class="progress-bar" style="background:' + favColor + '20;"><div class="progress-fill" style="width:' + fav + '%;background:' + favColor + ';"></div></div></div>';
    }

    document.getElementById('npcDetailBody').innerHTML = html;
    UI.showModal('npcDetailModal');

    // 绑定聊天按钮
    var chatBtn = document.getElementById('btnNpcChat');
    if (chatBtn) {
        var newChatBtn = chatBtn.cloneNode(true);
        chatBtn.parentNode.replaceChild(newChatBtn, chatBtn);
        var safeName = name.replace(/'/g, "\'");
        newChatBtn.addEventListener('click', function() {
            UI.hideModal('npcDetailModal');
            openNpcChat(name);
        });
    }
    // 绑定日记按钮
    var diaryBtn = document.getElementById('btnNpcDiary');
    if (diaryBtn) {
        var newDiaryBtn = diaryBtn.cloneNode(true);
        diaryBtn.parentNode.replaceChild(newDiaryBtn, diaryBtn);
        newDiaryBtn.addEventListener('click', function() {
            UI.hideModal('npcDetailModal');
            viewNpcDiary(name);
        });
    }
    // 绑定编辑按钮
    var editBtn = document.getElementById('btnNpcEdit');
    if (editBtn) {
        var newEditBtn = editBtn.cloneNode(true);
        editBtn.parentNode.replaceChild(newEditBtn, editBtn);
        newEditBtn.addEventListener('click', function() {
            UI.hideModal('npcDetailModal');
            openEditNpcModal(name);
        });
    }
    // 绑定删除按钮
    var deleteBtn = document.getElementById('btnNpcDelete');
    if (deleteBtn) {
        var newDeleteBtn = deleteBtn.cloneNode(true);
        deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
        newDeleteBtn.addEventListener('click', function() {
            UI.confirm('删除角色', '确定删除角色「' + escapeHtml(name) + '」？').then(function(ok) { if (ok) {
            // 添加防抖检查
            if (newDeleteBtn.disabled) return;
            newDeleteBtn.disabled = true;
                delete gameState.allCharacters[name];
                renderNpcList();
                UI.hideModal('npcDetailModal');
                UI.toast('已删除角色');
                newDeleteBtn.disabled = false;
            }
            }).catch(function(err) { console.error('[NPC系统] 操作失败:', err); });
        });
    }
}
