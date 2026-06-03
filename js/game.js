
// 【修复A P1-4】清理用户输入中的潜在prompt injection内容
function _sanitizePromptInput(str) {
    if (!str) return '';
    return String(str)
        .replace(/```json\s*/gi, '')      // 移除JSON代码块标记
        .replace(/```\s*/g, '')           // 移除代码块标记
        .replace(/\{[\s\S]*?\}/g, function(match) {
            // 保留短JSON片段（可能是用户想要的格式），但移除类似AI回复格式的长JSON
            return match.length > 200 ? '[内容已省略]' : match;
        })
        .replace(/【回复格式[\s\S]*?$/gi, '');  // 移除试图覆盖回复格式的注入
}

function buildSystemPrompt() {
    var _wiResult = gameState._wiCachedResult || WorldInfo.buildInjection(gameState.conversationHistory || []);
    gameState._wiCachedResult = _wiResult;
    var _wiText = (typeof _wiResult === 'object' && _wiResult !== null) ? (_wiResult.text || '') : (_wiResult || '');

    // 存储世界书分组数据供 sendAIRequest 使用（不再拼入system prompt）
    gameState._wiPositionTexts = (typeof _wiResult === 'object' && _wiResult !== null && _wiResult.positionTexts) ? _wiResult.positionTexts : null;

    // 注入增强记忆
    var _memoryText = '';
    if (typeof EnhancedMemory !== 'undefined') {
        _memoryText = EnhancedMemory.buildSmartInjection();
        if (_memoryText) {
            console.log('[buildSystemPrompt] 已注入增强记忆');
        }
    }

    // 【修复A P1-4】对用户可控输入进行清理，防止prompt injection
    var _safeUserPrompt = _sanitizePromptInput(gameState.userPrompt);
    var _safeCustomStyle = _sanitizePromptInput(gameState.customStyle);

    var _prompt = `你是一个高自由度的文字游戏AI引擎。 玩家想玩的游戏： "${_safeUserPrompt}" ${_safeCustomStyle ? '【写作风格】\n' + _safeCustomStyle + '\n' : ''} ${buildProtagonistPrompt()} ${_memoryText ? '【剧情记忆】\n' + _memoryText + '\n' : ''} 【核心规则】 1. 根据玩家描述创造沉浸式游戏世界 2. 每次回复必须是一个完整的JSON对象，不要包裹在代码块中 3. 剧情要有画面感和代入感，像沉浸式小说段落 4. 根据世界观在world中创造性设计信息模块 5. 【极其重要】所有输出必须是纯中文！story、choices、player、characters、world等所有字段的值都必须用中文书写，绝对禁止出现英文！

【字数与格式控制 - 由预设完全控制】
- 字数要求：严格遵循预设中的字数设定，通过 {{getglobalvar::字数总要求}} 获取
- 段落风格：通过 {{getglobalvar::单段落字数}} 获取具体排版要求
- 叙述视角：通过 {{getglobalvar::叙述视角}} 获取视角设定
- 角色代词：通过 {{getglobalvar::char代词}} 和 {{getglobalvar::user代词}} 获取
- 演绎授权：通过 {{getglobalvar::演绎授权}} 获取是否可以演绎玩家角色
- 转述授权：通过 {{getglobalvar::转述授权}} 获取转述权限
- 选项数量：由预设控制，不强制要求3-5个
- 如果预设未指定以上任何一项，则由AI自行判断最合适的处理方式

【游戏时间系统 - 极其重要】
你必须在每次回复的JSON中包含gameTime字段，记录当前剧情内的精确时间。时间必须根据世界观动态生成：
- 现代世界观示例：{"date":"2024年5月4日","time":"上午9:30","period":"上午","weather":"晴","era":"现代"}
- 古代世界观示例：{"date":"贞观三年五月初四","time":"辰时三刻","period":"辰时","weather":"晴","era":"贞观三年"}
- 修仙世界观示例：{"date":"天元历四千七百二十一年春分","time":"午时正","period":"午时","weather":"微风","era":"天元历"}
- 末世世界观示例：{"date":"废土纪元第47天","time":"下午3:00","period":"下午","weather":"灰霾","era":"废土纪元"}
时间推进规则：
1. 每段剧情必须推进时间，根据事件合理推进（聊天15-30分钟，战斗1-2小时，睡觉到次日清晨等）
2. date字段：完整日期，必须符合世界观（现代用公历年月日，古代用年号+农历，修仙用历法纪年等）
3. time字段：具体时间（现代用24小时制如"下午3:30"，古代用十二时辰如"酉时初刻"）
4. period字段：时段名称（现代：清晨/上午/中午/下午/傍晚/夜晚/深夜；古代：子时/丑时/寅时/卯时/辰时/巳时/午时/未时/申时/酉时/戌时/亥时）
5. weather字段：当前天气（晴/阴/雨/雪/大风/雾等）
6. era字段：当前时代/年号（现代/贞观三年/天元历等）
7. 时间推进要自然连贯，不要跳跃太大，天气变化要有过渡
${gameState.gameTime?.date ? '当前游戏时间：' + (gameState.gameTime.date || '') + ' ' + (gameState.gameTime.time || '') + ' ' + (gameState.gameTime.period || '') : '当前是游戏开始，请设定初始时间'}

【心声系统规则 - 极其重要】
1. 每次回复在正文情绪峰值处插入次数由预设控制单独成段的 <giggle>角色名称：心声内容</giggle> 包裹的第一人称独白（<200字/去翻译化），从未来视角（比如和主角在一起后）看待在当前时刻自己的表现，可以是诙谐的、幽默的、怀旧的
2. 心声格式：<giggle>角色名称：心声内容</giggle>，使用HTML标签包裹，单独成段
3. 心声是NPC角色的内心独白，严守全知盲区，仅能基于主角的对话/动作产生反应，绝对禁止窥探或回应主角未出口的心理活动
4. 禁止写主角角度的心声，仅限非主角角色
5. 心声要自然融入正文节奏，在情绪转折、关键抉择、暧昧时刻等峰值处插入
6. 不同NPC心声风格必须差异化，体现各自性格
9. 【NPC主动消息】npcMessages数组用于NPC主动给玩家发消息（类似微信私聊）。根据NPC性格决定是否发消息：黏人型NPC可能每回合都发，冷漠型可能几回合才发一次。没有NPC要发消息时就输出空数组[]。消息内容要符合NPC性格和当前剧情情境，字数由预设控制。【重要区分】npcMessages是即时聊天消息（日常闲聊、邀约、吐槽等短消息），不要把重要通知、正式信件、情绪爆发等内容放在这里，那些应该放在mail（邮箱）中。
8. 章节结尾可使用[章节结束|章节标题]标记，如[章节结束|幸福之愿·无伤的相遇] 【回复格式 - 纯JSON，不要用代码块包裹】 { "title": "当前章节标题，如'新的开始'、'暗流涌动'等，4-8个字", "story": "剧情正文，用\\n换行。对话用「」包裹。由预设控制字数。心声标记数量由预设控制，格式：<giggle>NPC角色名：该NPC的内心想法</giggle>，单独成段。心声只能写NPC的，绝对不能写主角的！", "hud": [{"label": "显示名", "value": "数值", "icon": "单字图标如'生''力''智'等，不要用emoji"}], ${gameState.generateChoices ? '"choices": [{"id": "A", "text": "详细选项描述", "tag": "标签"}],' : ''} "player": { "name": "角色名", "age": "年龄", "identity": "身份", "personality": "性格特点", "title": "显示在卡片标题的称号", "stats": [{"label": "属性名", "value": "属性值"}] }, "characters": [{"name": "角色名", "title": "身份", "relation": "关系", "favorability": 50, "desc": "状态描述", "details": [{"key": "字段", "value": "值"}]}], "world": [ {"type": "text", "title": "标题", "content": "内容"}, {"type": "list", "title": "标题", "items": ["条目"]}, {"type": "ranking", "title": "标题", "items": ["第一名"]}, {"type": "key_value", "title": "标题", "items": [{"key": "键", "value": "值"}]}, {"type": "cards", "title": "标题", "items": [{"icon": "单字图标如'剑''药''书'等，不要用emoji", "title": "子标题", "content": "内容"}]}, {"type": "comments", "title": "标题", "main": "主帖", "comments": [{"name": "评论者", "text": "内容"}]} ], "bag": [{"name": "物品名", "count": 1, "desc": "描述", "rarity": "普通", "usable": false, "effect": "使用效果描述", "equippable": false, "equipped": false, "slot": "weapon"}], "quests": [{"title": "任务名", "type": "主线/支线/隐藏", "status": "进行中/已完成/失败", "progress": "2/5", "hint": "下一步提示"}], "relationships": [{"from": "角色A", "to": "角色B", "type": "关系类型", "desc": "一句话描述"}], "keyEvents": ["本回合发生的重要事件，只记真正关键的"], "npcMessages": [{"from": "NPC名字", "text": "NPC主动发给玩家的消息内容"}], "currency": 0, "currencyName": "根据世界观设定货币名称（修仙世界用灵石，现代用元/余额，古代用银两等）", "contextSummary": "用100-200字总结到目前为止所有剧情的关键信息" } 【keyEvents规则 - 极其重要】 1. 每回合检查是否发生了"重要事件"，有则写入keyEvents数组 2. 什么算重要事件：关键约定、重大发现、关系转折、获得/失去重要物品、阵营变化、立下誓言、角色死亡、秘密揭露 3. 每条用简短一句话描述，包含人物名和具体内容 4. 日常对话、普通移动、无关紧要的小事不要写入 5. 每回合0-3条，没有重要事件就写空数组 [] 6. 示例："苏婉儿与主角约定今晚在咖啡厅见面"、"发现李铁柱是卧底"、"获得传说级宝剑" 【player规则 - 绝对核心，违反会导致游戏崩溃】player是主角（玩家自己），是玩家操控的唯一角色！必须包含name/age/identity/personality四个固定字段，stats放其他动态属性。player.name必须严格等于玩家设定的主角姓名，绝对禁止擅自改名或替换角色！ 【characters规则 - 极其重要！！！】 1. characters是NPC列表，绝对禁止把主角/玩家放进characters！主角信息只能放在player里！ 2. 只要剧情中提到了任何角色名字（无论是否直接交互），都必须放入characters数组！ 3. 已知角色即使本回合未出场也要保留在characters中，更新其状态即可 4. 每回合检查：所有已知NPC都应该在characters中，不要遗漏！ 5. 同一个角色只用一个固定名字，不要加括号备注或变体名 6. favorability必须有数值（0-100），不要省略

【好感度等级与关系类型 - 由AI根据世界观动态生成】
1. **严禁使用固定模板**！不要套用预设的好感度等级名称（如"道侣"、"至交"等），必须根据当前世界观和角色关系自然生成。
2. **relation字段**：用符合世界观的简短词汇描述角色与主角的关系，如现代可以是"同事"、"闺蜜"、"青梅竹马"、"上司"；古代可以是"书童"、"护卫"、"青梅竹马"；修仙可以是"同门"、"师兄"等。
3. **favorability数值范围 -100 到 100**（0为中立，不是敌意！）：
   - 80-100：极度亲密（生死与共、灵魂伴侣、唯一挚爱等，根据关系类型决定）
   - 60-79：非常亲近（深爱、挚友、绝对信任等）
   - 40-59：有好感（喜欢、欣赏、愿意帮助等）
   - 15-39：关系融洽（友好、合作愉快、印象不错等）
   - -14 到 14：中立/普通（认识、点头之交、无特殊感觉，0=完全中立）
   - -39 到 -15：略有隔阂（疏远、冷淡、不太信任等）
   - -100 到 -40：负面关系（敌意、厌恶、仇恨等）
4. **根据关系类型调整**：亲人之间80+可以是"骨肉至亲"；恋人之间80+可以是"挚爱"；朋友之间80+可以是"生死之交"。**不要让亲兄妹显示"道侣"或"挚爱"这种暧昧词汇**！
5. **世界观适配**：现代职场不要用"道侣"，古代不要用"同事"，修仙不要用"CEO"。**关系描述必须符合世界观和角色设定**！ 【world动态模块 - 极其重要！！！】 1. world数组每次回复world模块数量和内容由预设控制，不要为空！这是游戏的核心玩法！ 2. 必须包含以下类型（每回合都要生成）： - comments: 论坛帖子，反映当前剧情热点话题，玩家可以评论互动 - moments: 朋友圈动态，NPC的生活日常、心情分享、吐槽剧情，示例：{"type":"moments","title":"朋友圈","posts":[{"author":"NPC名字","avatar":"👤","text":"今天遇到了一个有趣的人...","time":"刚刚","likes":3,"comments":1}]} - mail: 邮件系统，用于重要通知和正式信件（与npcMessages即时聊天不同）。以下情况应该发邮件：①系统重要通知（任务完成奖励、等级提升、活动公告等）②NPC情绪激动时的正式表达（极度开心、伤心、愤怒、告白、决裂等）③玩家将NPC拉黑后NPC的沟通尝试④正式邀请函、挑战书、契约等。日常闲聊、邀约、吐槽等短消息请用npcMessages，不要用mail。【重要】所有邮件的收件人都是玩家本人，不要生成发给其他NPC的邮件。items中每个对象必须有from/subject/body字段（body是完整邮件正文，不要只写preview），示例：{"type":"mail","title":"收件箱","items":[{"from":"发件人","subject":"主题","body":"完整邮件正文内容","preview":"预览文字","date":"今天"}]} - shop: 商店商品，当前可购买的物品，示例：{"type":"shop","title":"神秘商店","items":[{"icon":"剑","name":"物品名","desc":"描述","price":100}]} - ranking: 实力排行榜，反映当前世界格局，items中每个对象必须有name/value字段，不要在name中加"NO.1"等排名前缀（排名由系统自动生成），必须包含玩家本人条目（name用玩家设定的名字），示例：{"type":"ranking","title":"实力榜","items":[{"name":"角色名","value":"999分"},{"name":"玩家名","value":"500分"}]} - cards: 任务/线索卡片，示例：{"type":"cards","title":"可接任务","items":[{"icon":"任务","title":"任务名","content":"任务描述"}]} 3. 【强制要求】world模块内容必须和当前剧情紧密联动！例如： - 玩家刚和NPC聊天 → 该NPC的朋友圈要发相关动态 - 玩家获得重要物品 → 商店出现相关商品，邮件收到系统奖励 - 剧情有重要转折 → 论坛出现讨论帖，排行榜发生变化 - 玩家身份提升 → 收到更多邮件，解锁更高级商店商品 4. world模块类型由预设控制！后续每回合更新内容！ 5. 每种类型都要给具体内容，不要只给空数组！ 【characters的details】根据世界观设计字段 【quests任务规则】 1. 根据剧情自动生成和更新任务列表 2. type分三种：主线（推动核心剧情）、支线（可选任务）、隐藏（特殊触发） 3. status分三种：进行中、已完成、失败 4. progress用"当前/总数"格式，如"2/5"，没有明确进度的可以省略 5. hint是给玩家的下一步提示，简短一句话 6. 完成或失败的任务保留1-2回合后可以移除 7. 同时存在的任务不超过5个 8. 第一回合就应该根据剧情给出至少1个主线任务 【relationships关系网规则】 1. 记录当前所有重要角色之间的关系 2. from和to用角色名，主角用"主角"二字 3. type必须是以下之一：暧昧、恋人、敌对、仇恨、友好、盟友、师徒、上下级、亲人、家族、对手、中立 4. desc用一句短话说明关系现状或变化原因 5. 每回合更新关系网，反映最新的关系状态 6. 只记重要关系，上限10条 7. 包括NPC之间的关系，不仅仅是主角和NPC的关系 【bag背包规则】 1. usable为true表示可以使用的消耗品（药品、食物等），effect描述使用后的效果 2. equippable为true表示可以装备的物品，slot表示装备位（weapon/armor/accessory/head） 3. equipped为true表示当前已装备 4. 同一个slot只能装备一件，装备新的自动替换旧的 5. 使用消耗品后count减1，为0时从背包移除 6. 非消耗品非装备的普通物品usable和equippable都为false 7. 当玩家说"使用XX"或"装备XX"时，在下一回合的bag中更新对应状态 【重要约束】hud最多4个,${gameState.generateChoices ? 'choices数量由预设控制,' : '不要输出choices字段,'}每次推进剧情,favorability -100到100,rarity可选普通/精良/珍稀/传说 【格式约束】直接输出JSON，不要用\`\`\`json包裹，story字段中用\\n表示换行 【滚动摘要】contextSummary字段非常重要！每次回复必须包含，把之前的摘要内容融合本回合新剧情，形成持续更新的剧情档案 【输出顺序】story必须是JSON的第一个字段，先写完剧情再写其他数据`;
    return _prompt;
}
// 开始游戏时自动记住当前填写内容
var _origStartBtn = document.getElementById('startBtn');
if (_origStartBtn) {
    _origStartBtn.addEventListener('click', function() {
        var gpEl = document.getElementById('gamePrompt');
        if (gpEl) safeSetItem('freeScript_lastPrompt', gpEl.value || '');
        var ssEl = document.getElementById('setupStyle');
        if (ssEl) safeSetItem('freeScript_lastStyle', ssEl.value || '');
    }, true);
}
function buildProtagonistPrompt() {
    var mc = gameState.protagonistSetup;
    if (!mc || Object.keys(mc).length === 0) return '';
    var lines = ['【玩家指定的主角设定 - 绝对必须严格遵守，违反会导致游戏崩溃】'];
    if (mc.mcName) lines.push('【主角姓名】: ' + mc.mcName);
    if (mc.mcGender) lines.push('【主角性别】: ' + mc.mcGender);
    if (mc.mcAge) lines.push('【主角年龄】: ' + mc.mcAge);
    if (mc.mcIdentity) lines.push('【主角身份】: ' + mc.mcIdentity);
    if (mc.mcPersonality) lines.push('【主角性格】: ' + mc.mcPersonality);
    if (mc.mcAppearance) lines.push('【主角外貌】: ' + mc.mcAppearance);
    if (mc.mcAbility) lines.push('【主角特殊能力】: ' + mc.mcAbility);
    if (mc.mcExtra) lines.push('【主角其他设定】: ' + mc.mcExtra);
    lines.push('');
    lines.push('【主角设定强制执行规则 - 违反任何一条都是严重错误】');
    lines.push('1. player.name 必须严格等于【主角姓名】: ' + (mc.mcName || '（玩家未指定，可自由设定）'));
    lines.push('2. 绝对禁止把主角放进characters数组！主角只能在player字段！');
    lines.push('3. 绝对禁止给主角改名、换身份、变成NPC！');
    lines.push('4. 如果玩家只提供了名字，其他字段（年龄/身份/性格）可以根据名字和世界观合理补全，但名字必须完全一致！');
    lines.push('5. 剧情中主角必须是玩家操控的角色，不能是旁观者或配角！');
    lines.push('6. 如果违反以上任何一条，游戏逻辑会崩溃，玩家体验会被彻底破坏！');
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
                long: '[长段落补丁]\n- 排版策略：沉浸式长段落，拒绝碎片化换行\n- 单段字数：严格控制在 250-600 字\n- 段落内部：完整呈现一个场景切片，包含环境渲染、人物行动、感官细节、心理活动\n- 禁止在段落中间插入对话后立即换行，对话应融入段落叙事流',
                medium: '[中段落补丁]\n- 排版策略：均衡段落，兼顾阅读节奏与信息密度\n- 单段字数：控制在 180-320 字\n- 段落结构：场景描写→人物行动→对话互动→心理/感官→过渡\n- 保持段落完整性，不在段落高潮处断开',
                short: '[短段落补丁]\n- 排版策略：紧凑推进，保留清晰节拍\n- 单段字数：控制在 90-180 字\n- 每段聚焦一个核心动作或信息点\n- 适合快节奏场景和紧张对峙',
                free: '[自由段落补丁]\n- 排版策略：长短错落，制造呼吸感，不走单一模板\n- 单段字数：在 20-400 字之间动态波动\n- 根据场景氛围自动调整：紧张时短段，舒缓时长段\n- 对话密集时短段，独白/描写时可以长段'
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
            'third_person_omniscient': '叙述视角：第三人称全知\n- 可以描写任何角色的内心想法和感受\n- 视角可以在不同角色之间自由切换\n- 适合群像剧和多线叙事',
            'third_person_limited': '叙述视角：第三人称有限\n- 主要跟随主角视角进行叙事\n- 可以描写主角的内心想法，其他角色的内心只能通过外在表现推测\n- 保持视角一致性，避免突然跳转到其他角色内心',
            'first_person_limited': '叙述视角：第一人称有限\n- 使用"我"来指代主角\n- 只能描写"我"的所见所闻所感\n- 其他角色的想法只能通过对话和外在表现来推测'
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
            'third_person': '始终使用第三人称（名字或"他/她"）来指代<user>\n- 禁止使用"你"来指代<user>',
            'second_person': '始终使用第二人称"你"来指代<user>\n- 禁止使用第三人称来指代<user>',
            'first_person': '始终使用第一人称"我"来指代<user>\n- 禁止使用"你"或第三人称来指代<user>'
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
            'closed': '禁止转述<user>'
        };
        MacroEngine.setGlobalVar('转述授权', narrateMap[narrate] || '');
    } else {
        MacroEngine.setGlobalVar('转述授权', '');
    }
    
    // === AI模式 ===
    var aiMode = config.aiMode || config.mode || 'normal';
    var talkMap = {
        'dialogue': '\n- 停止所有创作任务，当前为元对话模式\n- 以角色身份与<user>进行自然对话\n- 不输出任何格式化内容（无标题、无状态栏、无小剧场）',
        'outline': '\n- 停止所有创作任务，当前为大纲模式\n- 输出故事大纲，包含章节划分、关键事件、角色发展弧线\n- 使用清晰的层级结构',
        'summary': '\n- 停止所有创作任务，当前为总结模式\n- 输出大总结，包含核心事件、角色关系变化、世界状态更新\n- 使用结构化格式',
        'normal': ''
    };
    MacroEngine.setGlobalVar('talk', talkMap[aiMode] || '');
    
    // 注入其他常用的酒馆宏变量
    if (!MacroEngine.getGlobalVar('user')) MacroEngine.setGlobalVar('user', gameState.playerName || '玩家');
    if (!MacroEngine.getGlobalVar('char')) MacroEngine.setGlobalVar('char', (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) ? gameState.worldSnapshot.characters[0].name : '角色');
    MacroEngine.setGlobalVar('original', gameState._lastOriginalContent || '');
    
    // === 象牙塔预设需要的额外变量 ===
    // user_input: 用户最新输入内容
    var lastUserInput = '';
    var history = gameState.conversationHistory || [];
    for (var i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'user') {
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
        grabSettings = '允许演绎和转述<user>';
    } else if (takeoverEnabled) {
        grabSettings = '允许演绎<user>行动，但禁止转述';
    } else if (narrateEnabled) {
        grabSettings = '允许转述<user>，但禁止演绎';
    } else {
        grabSettings = '禁止演绎和转述<user>';
    }
    MacroEngine.setGlobalVar('抢转设置', grabSettings);
    
    console.log('[injectPresetGlobalVars] 全局宏变量已注入');
}

/**
 * 应用长度预设
 */
function applyLengthPreset(preset) {
    var presets = {
        short:  { min: 500,  max: 1000, paraMin: 5,  paraMax: 7  },
        medium: { min: 1500, max: 3000, paraMin: 15, paraMax: 17 },
        long:   { min: 4000, max: 6000, paraMin: 20, paraMax: 25 }
    };
    var p = presets[preset];
    if (!p) return;
    
    var elMin = document.getElementById('wcMin');
    var elMax = document.getElementById('wcMax');
    var elParaMin = document.getElementById('wcParaMin');
    var elParaMax = document.getElementById('wcParaMax');
    if (elMin) elMin.value = p.min;
    if (elMax) elMax.value = p.max;
    if (elParaMin) elParaMin.value = p.paraMin;
    if (elParaMax) elParaMax.value = p.paraMax;
}

async function sendAIRequest(userMessage, isInit = false) {
    if (isWaiting) return;
    // AbortController 用于取消请求
    safeAbort();
    window._currentAbort = new AbortController();
    setWaiting(true);
    showStoryLoading();
    streamBuffer = '';
    TypewriterBuffer.stop();
    
    // 保存撤销状态（在AI回复前）
    saveUndoState();
    var storyScroll = document.getElementById('storyScroll');
    if (storyScroll) {
        storyScroll.onclick = function() {
            if (TypewriterBuffer.isTyping) TypewriterBuffer.flush();
        };
    }
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
            gameState._depthPrompts = {};
            gameState._positionPrompts = {};
            gameState._afterChatPrompts = [];
            if (typeof PresetManager !== 'undefined' && PresetManager.presets && PresetManager.currentPresetIndex >= 0) {
                var initPreset = PresetManager.presets[PresetManager.currentPresetIndex];
                if (initPreset) {
                    PresetManager._applyPromptsToSystemPrompt(initPreset);
                }
            } else {
                try { gameState.systemPrompt = buildSystemPrompt(); } catch(e) {}
            }
            messages = gameState.conversationHistory.concat([{
                role: 'user',
                content: userMessage
            }]);
        } else {
            // === 按酒馆标准构建消息列表 ===

            // 1. 重建系统提示词（只包含游戏基础规则，不含预设prompts和世界书）
            try {
                var rebuiltPrompt;
                // 清空之前的世界书depth prompts（避免累积）
                gameState._depthPrompts = {};
                gameState._positionPrompts = {};
                gameState._afterChatPrompts = [];

                // 【优化】先执行一次世界书扫描，缓存结果避免重复扫描
                var _cachedWI = WorldInfo.buildInjection(gameState.conversationHistory || []);
                gameState._wiCachedResult = _cachedWI;
                gameState._wiPositionTexts = (_cachedWI && _cachedWI.positionTexts) ? _cachedWI.positionTexts : null;

                if (typeof PresetManager !== 'undefined' && PresetManager.presets && PresetManager.currentPresetIndex >= 0) {
                    var currentPreset = PresetManager.presets[PresetManager.currentPresetIndex];
                    if (currentPreset) {
                        PresetManager._applyPromptsToSystemPrompt(currentPreset);
                        rebuiltPrompt = gameState.systemPrompt;
                    }
                } else {
                    rebuiltPrompt = buildSystemPrompt();
                }
                gameState.systemPrompt = rebuiltPrompt;
                if (gameState.conversationHistory.length > 0 && gameState.conversationHistory[0].role === 'system') {
                    gameState.conversationHistory[0].content = rebuiltPrompt;
                }
            } catch(e) {
                console.warn('[修复] 重建系统提示词失败:', e);
            }

            var recent = gameState.conversationHistory.slice(1).slice(-MAX_HISTORY);

            // 2. 获取世界书分组数据
            var wiPositionTexts = gameState._wiPositionTexts || null;
            var positionPrompts = gameState._positionPrompts || {};

            // 3. 按酒馆标准顺序构建消息列表
            messages = [];

            // [0] 主系统提示词
            // 支持 use_sysprompt 配置（月读预设设为 false）
            if (gameState._useSysprompt !== false) {
                messages.push({ role: 'system', content: gameState.systemPrompt });
            }

            // 辅助函数：合并世界书和预设提示词
            function mergePositionContent(wiTexts, presetTexts) {
                var parts = [];
                if (wiTexts && wiTexts.length > 0) {
                    parts.push('【世界知识库】\n' + wiTexts.join('\n'));
                }
                if (presetTexts && presetTexts.length > 0) {
                    presetTexts.forEach(function(t) { parts.push(t); });
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

            // 游戏状态快照
            if (gameState.worldSnapshot && Object.keys(gameState.worldSnapshot).length > 0) {
                var snapshotText = '【当前世界状态快照 - 请基于此状态继续】\n';
                var snap = gameState.worldSnapshot;
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
                messages.push({ role: 'system', content: snapshotText });
            }

            // 重要事件记录
            if (gameState.keyEvents && gameState.keyEvents.length > 0) {
                var eventsText = '【重要事件记录 - 必须记住，不可遗忘】\n';
                gameState.keyEvents.forEach(function(evt, idx) {
                    eventsText += (idx + 1) + '. ' + evt + '\n';
                });
                messages.push({ role: 'system', content: eventsText });
            }

            // 远期摘要
            if (gameState.rollingSummary) {
                messages.push({
                    role: 'system',
                    content: '【前情摘要 - 之前剧情的总结】\n' + gameState.rollingSummary + '\n\n请基于以上摘要和后续对话继续游戏，保持连贯。'
                });
            }

            // 对话历史
            var chatHistoryStart = messages.length; // 记录聊天历史在消息数组中的起始位置
            messages = messages.concat(recent);

            // 当前用户消息
            messages.push({ role: 'user', content: userMessage });

            // squash_system_messages 支持
            // 果实预设要求将所有相邻的 system 消息合并为一条
            if (gameState._squashSystemMessages === true) {
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

            // 深度注入提示词 (depth >= 6) - 从聊天历史末尾计算位置（与酒馆一致）
            if (gameState._depthPrompts && Object.keys(gameState._depthPrompts).length > 0) {
                var macroEnvForDepth = {
                    user: gameState.playerName || '玩家',
                    char: (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) ? gameState.worldSnapshot.characters[0].name : '角色',
                    original: gameState._lastOriginalContent || ''
                };

                // 按depth从大到小排序，先插入大depth（靠近末尾），避免位置偏移
                var depthKeys = Object.keys(gameState._depthPrompts).map(Number).sort(function(a, b) { return b - a; });

                depthKeys.forEach(function(depth) {
                    var prompts = gameState._depthPrompts[depth];
                    prompts.forEach(function(p) {
                        if (p.enabled !== false && p.content && p.content.trim()) {
                            var processedContent = typeof p.content === 'string' && !p.content.includes('{{') ? p.content : MacroEngine.process(p.content.trim(), macroEnvForDepth);
                            if (processedContent.trim()) {
                                // 【酒馆标准】depth=N 从聊天历史末尾（不含最后user消息）往前数第N条之后插入
                                var chatEndIndex = messages.length - 1; // 最后一条是user消息
                                var insertIndex = chatEndIndex - depth;
                                // 确保不插入到聊天历史之前（系统提示词区域）
                                insertIndex = Math.max(chatHistoryStart, Math.min(insertIndex, chatEndIndex));
                                messages.splice(insertIndex, 0, { role: 'system', content: processedContent });
                            }
                        }
                    });
                });
            }
        }
        // 注入 impersonation_prompt（用户人设）
        // 酒馆中 impersonation_prompt 被插入到最后一条 assistant 消息之后
        if (gameState._impersonationPrompt && gameState._impersonationPrompt.trim()) {
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
        var namesBehavior = gameState._namesBehavior || 0;
        if (namesBehavior === 1 || namesBehavior === 2) {
            var charName = (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) 
                ? gameState.worldSnapshot.characters[0].name : 'AI';
            var userName = gameState.playerName || '玩家';
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
        if (gameState._jailbreakPrompt && gameState._jailbreakPrompt.trim()) {
            messages.splice(messages.length - 1, 0, {
                role: gameState._jailbreakRole || 'system',
                content: gameState._jailbreakPrompt
            });
        }
        // 注入 assistant 角色的 prompt（以 assistant 角色注入）
        if (gameState._assistantPrompt && gameState._assistantPrompt.trim()) {
            messages.splice(messages.length - 1, 0, {
                role: 'assistant',
                content: gameState._assistantPrompt
            });
        }
        var options = {
            stream: gameState.useStream,
            temperature: gameState.temperature || 0.8,
            onChunk: function(chunk) {
                onStreamChunk(chunk);
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
            gameState._lastOriginalContent = storyText;
            // 保存COT内容供调试查看
            gameState._lastCotContent = cotMatches.join('\n---\n');
            console.log('[COT] 提取到思维链内容:', cotMatches.length, '段');
        }
        // 用清理后的文本替换storyText
        if (cleanStoryText !== storyText) {
            storyText = cleanStoryText;
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
                gameState._lastSceneTitle = data.title || data.scene;
            }
            // 保存HUD数据到gameState，确保读档后能恢复
            if (data.hud) {
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
            // === 货币系统 ===
            if (data.currency !== undefined) gameState.currency = data.currency;
            if (data.currencyName) gameState.currencyName = data.currencyName;
            // === 新增：提取并累积重要事件 ===
            if (data.keyEvents && Array.isArray(data.keyEvents)) {
                if (!gameState.keyEvents) gameState.keyEvents = [];
                data.keyEvents.forEach(function(evt) {
                    if (evt && typeof evt === 'string' && evt.trim().length > 0) {
                        // 去重：不添加已有的相同事件
                        var isDuplicate = gameState.keyEvents.some(function(existing) {
                            return existing === evt;
                        });
                        if (!isDuplicate) {
                            gameState.keyEvents.push(evt.trim());
                        }
                    }
                });
                // 上限30条，防止占太多token
                if (gameState.keyEvents.length > 30) {
                    gameState.keyEvents = gameState.keyEvents.slice(-30);
                }
            }
            // === 新增：保存世界状态快照 ===
            var snapshot = {};
            if (data.player) snapshot.player = data.player;
            if (data.hud) snapshot.hud = data.hud;
            if (data.bag) snapshot.bag = data.bag;
            if (gameState.currentQuests && gameState.currentQuests.length > 0) {
                snapshot.quests = gameState.currentQuests;
            }
            // 从累积的allCharacters取最新NPC列表
            var charKeys = Object.keys(gameState.allCharacters);
            if (charKeys.length > 0) {
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
            if (Object.keys(snapshot).length > 0) {
                gameState.worldSnapshot = snapshot;
            }
        }
        // 处理NPC主动消息
        if (data && data.npcMessages && Array.isArray(data.npcMessages) && data.npcMessages.length > 0) {
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
                    showNpcMessageNotification(msg.from, msg.text);
                }
            });
            safeAutoSave();
        }
        // 剧情推入打字机
        var finalStory = (storyText && storyText.trim()) ? storyText : response;
        // 对最终story文本也应用输出端正则，确保与流式显示一致
        if (typeof RegexManager !== 'undefined') {
            finalStory = RegexManager.apply(finalStory, 'output');
        }
        // 先设置 onComplete 回调（在 push 之前，防止时序竞争）
        TypewriterBuffer.onComplete = function() {
            var st = document.getElementById('storyText');
            if (st) st.innerHTML = formatStory(finalStory);
            if (storyScroll) storyScroll.onclick = null;
        };
        // 流式模式下 onStreamChunk 已经在逐步推送了，
        // 这里只需要确保最终完整文本被推送（处理流式解析可能遗漏的尾部内容）。
        // 如果打字机已经在打字且 displayed 已包含 finalStory 的内容，则跳过重复推送。
        var alreadyDisplayed = TypewriterBuffer.displayed.length + TypewriterBuffer.queueLen;
        if (finalStory.length > alreadyDisplayed) {
            TypewriterBuffer.push(finalStory);
        }
        // 如果打字机已完成，直接最终渲染
        if (TypewriterBuffer.isFinished()) {
            var st2 = document.getElementById('storyText');
            if (st2) st2.innerHTML = formatStory(finalStory);
            if (storyScroll) storyScroll.onclick = null;
        }
        // 记录
        // storyHistory 已合并到 conversationHistory，不再单独存储
        
        // 更新统计数据
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
            }
        }
        // 兜底选项
        if (!data || !data.choices) {
            if (gameState.generateChoices !== false) {
                var rescuedChoices = extractObjArr(response, 'choices') || extractArr(response,
                    'choices');
                if (rescuedChoices && rescuedChoices.length > 0) {
                    renderChoices(rescuedChoices);
                } else {
                    renderChoices([{
                        id: 'A',
                        text: '继续探索'
                    }, {
                        id: 'B',
                        text: '观察四周'
                    }, {
                        id: 'C',
                        text: '等待观望'
                    }]);
                }
            } else {
                renderChoices([]);
            }
        }
        // 存历史（存储清理后的story文本，减少token浪费）
        var historyAssistantContent = storyText || response;
        gameState.conversationHistory.push({
            role: 'user',
            content: userMessage
        }, {
            role: 'assistant',
            content: historyAssistantContent
        });
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
        showError(errDisplay);
        console.error('请求出错:', error);
    } finally {
        window._currentAbort = null;
        setWaiting(false);
    }
}
function updateTokenCount(currentResponseLength) {
    var total = 0;
    if (!gameState.conversationHistory) return;
    gameState.conversationHistory.forEach(function(m) {
        total += (m.content || '').length;
    });
    var estimated = Math.round(total * 1.5);
    gameState.tokenCount = estimated;
    
    // 更新故事头部Token显示
    var currentTokenEl = document.getElementById('currentTokenCount');
    var totalTokenEl = document.getElementById('totalTokenCount');
    
    if (currentResponseLength && currentTokenEl) {
        var currentTokens = Math.round(currentResponseLength / 1.5);
        currentTokenEl.textContent = currentTokens > 1000 ? 
            (currentTokens / 1000).toFixed(1) + 'k' : currentTokens;
    } else if (currentTokenEl) {
        currentTokenEl.textContent = '0';
    }
    
    if (totalTokenEl) {
        totalTokenEl.textContent = estimated > 1000 ? 
            (estimated / 1000).toFixed(1) + 'k' : estimated;
    }
    
    // 更新设置弹窗里的显示
    var msgEl = document.getElementById('settingMsgCount');
    if (msgEl) msgEl.textContent = gameState.conversationHistory.length;
    var tokEl = document.getElementById('settingTokenCount');
    if (tokEl) tokEl.textContent = estimated > 1000 ? (estimated / 1000).toFixed(1) + 'k' : estimated;

    // 更新聊天界面底部Token显示
    var chatTokenEl = document.getElementById('chatTokenDisplay');
    if (chatTokenEl) {
        var displayText = estimated > 1000 ? (estimated / 1000).toFixed(1) + 'k' : estimated;
        chatTokenEl.textContent = '上下文: 约 ' + displayText + ' token | ' + gameState.conversationHistory.length + ' 条消息';
    }

    // 智能压缩检查
    if (gameState.autoCompress !== false && !isCompressing && !isWaiting && typeof EnhancedMemory !== 'undefined') {
        var triggerResult = EnhancedMemory.shouldTriggerCompression(estimated, gameState.maxTokens);
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
    var importantMessages = [];
    var normalMessages = [];
    removed.forEach(function(m) {
        var content = m.content || '';
        var isImportant = false;
        if (content.includes('首次') || content.includes('登场') || content.includes('出现')) isImportant = true;
        if (content.includes('获得') || content.includes('失去') || content.includes('拿到')) isImportant = true;
        if (content.includes('重要') || content.includes('关键') || content.includes('转折')) isImportant = true;
        if (content.includes('关系') || content.includes('好感') || content.includes('信任')) isImportant = true;
        if (content.includes('决定') || content.includes('选择') || content.includes('决策')) isImportant = true;
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
        summaryPrompt = '你是专业的剧情记忆管理专家。现在需要增量更新剧情摘要。\n\n## 已有摘要\n' + EnhancedMemory.longTermMemory.masterSummary + '\n\n## 新增对话内容\n' + summaryContent + '\n\n## 任务要求\n请将新增内容整合到已有摘要中，生成更新后的简洁摘要。\n- 保留已有摘要中的关键信息\n- 添加新增内容中的重要事件\n- 删除冗余和重复内容\n- 保持摘要简洁（控制在500字以内）\n\n## 输出格式\n直接输出更新后的摘要内容，无需额外格式标记。';
    } else {
        summaryContent = removed.map(function(m) {
            var role = m.role === 'user' ? '【玩家行动】' : '【剧情发展】';
            var text = m.content.length > 800 ? m.content.substring(0, 800) + '...(内容过长已截断)' : m.content;
            return role + '\n' + text;
        }).join('\n\n---\n\n');
        summaryPrompt = '你是专业的剧情分析师和记忆管理专家。请对以下游戏对话进行深度结构化总结。\n\n## 输出格式要求\n\n请按以下结构输出，每个部分用【】标记：\n\n【剧情主线】\n用2-3句话概括核心剧情走向，突出关键转折点。\n\n【角色动态】\n列出出场角色的状态变化（新登场、关系变化、情绪变化、获得/失去物品等）。\n格式：角色名 - 变化描述\n\n【重要事件】\n提取关键事件（战斗、对话、发现、决策等），按时间顺序排列。\n\n【当前状态】\n玩家当前位置、持有物品、主要目标、面临的挑战。\n\n【待解决悬念】\n未完成的任务、未解答的问题、潜在的危机。\n\n## 注意事项\n- 保留所有重要细节，但避免冗余\n- 区分"已解决"和"待解决"的事项\n- 关注角色的心理变化和关系演变\n- 突出剧情的因果关系';
    }
    var summaryMessages = [{ role: 'system', content: summaryPrompt }, { role: 'user', content: '请对以上内容进行处理：\n\n' + summaryContent }];
    var summary = await callAI(summaryMessages, { temperature: 0.3 });
    // Step 4: 保存摘要到历史记录
    if (typeof EnhancedMemory !== 'undefined') {
        EnhancedMemory.saveSummaryHistory(summary, gameState.conversationHistory.length);
        EnhancedMemory.longTermMemory.masterSummary = summary;
        if (summary.includes('【剧情主线】')) _parseStructuredSummary(summary);
        EnhancedMemory.saveToStorage();
        console.log('[智能总结] 已同步到EnhancedMemory');
    }
    // 统计Token节省
    var originalTokens = estimateTokensForMessages(removed);
    var summaryTokens = estimateTokens(summary);
    var savedTokens = originalTokens - summaryTokens;
    if (typeof EnhancedMemory !== 'undefined') EnhancedMemory.stats.tokenSaved += savedTokens;
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
                        changes: []
                    };
                }
                EnhancedMemory.longTermMemory.characterTable[name].lastUpdate = Date.now();
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
            if (gameState.keyEvents.indexOf(event.trim()) === -1) {
                gameState.keyEvents.push(event.trim());
            }
            EnhancedMemory.longTermMemory.importantEvents.push({
                time: Date.now(),
                event: event.trim()
            });
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
                    EnhancedMemory.longTermMemory.characterTable[name] = { name: name, firstAppearance: Date.now(), changes: [] };
                }
                EnhancedMemory.longTermMemory.characterTable[name].lastUpdate = Date.now();
            }
        }
    });
    var itemPatterns = [/(获得|拿到|找到|得到)[了]?\s*(.{2,20})/, /(物品|道具)[：:]\s*(.{2,20})/];
    itemPatterns.forEach(function(pattern) {
        var match = content.match(pattern);
        if (match) {
            var item = match[2].trim();
            if (item.length >= 2 && !EnhancedMemory.longTermMemory.itemTable[item]) {
                EnhancedMemory.longTermMemory.itemTable[item] = { name: item, obtainedTime: Date.now(), desc: '玩家持有' };
            }
        }
    });
}
function estimateTokensForMessages(messages) {
    var total = 0;
    messages.forEach(function(m) { total += (m.content || '').length; });
    return Math.ceil(total / 2);
}
function estimateTokens(text) {
    return Math.ceil((text || '').length / 2);
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
        var sys = gameState.conversationHistory[0];
        var rest = gameState.conversationHistory.slice(1);
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
        var keep = dialogOnly.slice(-10);
        var removed = dialogOnly.slice(0, -10);
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
        var msgCount = gameState.conversationHistory.filter(function(m) {
            return m.role !== 'system';
        }).length;
        if (msgCount <= 10) {
            UI.toast('对话只有 ' + msgCount + ' 条，不需要压缩（大于10条才有意义）');
            return;
        }
        var ok = await UI.confirm('压缩对话', '将用AI总结前面的剧情，只保留最近10条原文，确定吗？');
        if (!ok) return;
        var sys = gameState.conversationHistory[0];
        var rest = gameState.conversationHistory.slice(1);
        var keep = rest.slice(-10);
        var removed = rest.slice(0, -10);
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
    var lastStyle = localStorage.getItem('freeScript_lastStyle');
    if (lastPrompt) {
        var el = document.getElementById('gamePrompt');
        if (el && !el.value) el.value = lastPrompt;
    }
    if (lastStyle) {
        var el2 = document.getElementById('setupStyle');
        if (el2 && !el2.value) el2.value = lastStyle;
    }
})();
// ========================================

// ========================================
// 渲染器 - 使用集成版UI样式
// ========================================

// --- 流式chunk处理 ---
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
                case 'n':
                    result += '\n';
                    break;
                case '"':
                    result += '"';
                    break;
                case '\\':
                    result += '\\';
                    break;
                case 't':
                    result += '\t';
                    break;
                case 'r':
                    result += '\r';
                    break;
                case 'b':
                    result += '\b';
                    break;
                case 'f':
                    result += '\f';
                    break;
                case 'u':
                    // Fix Issue 18: Handle \uXXXX Unicode escapes
                    var hexStr = text.substring(i + 1, i + 5);
                    if (/^[0-9a-fA-F]{4}$/.test(hexStr)) {
                        result += String.fromCharCode(parseInt(hexStr, 16));
                        i += 4;
                    } else {
                        result += ch;
                    }
                    break;
                default:
                    result += ch;
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
// 流式模式锁定：一旦确定模式，不再切换（防止纯文本中偶然含"story"导致模式跳变）
var _streamModeLocked = false;
var _streamMode = null; // 'json' 或 'plaintext'

function onStreamChunk(chunk) {
    streamBuffer += chunk;
    var story = extractStoryStreaming(streamBuffer);
    if (story && story.length > 0) {
        // 应用正则脚本到AI输出
        story = RegexManager.applyToOutput(story);
        TypewriterBuffer.push(story);
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
function formatStory(text) {
    if (!text) return '';

    // 【修复】反转义 HTML 实体，防止 <giggle> 和 「」被转义后无法匹配
    // 某些路径下 text 可能已被 escapeHtml 处理过，需要先还原
    text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    // 同时处理数字字符实体（如 &#12300; → 「）
    text = text.replace(/&#(\d+);/g, function(_, code) {
        return String.fromCharCode(parseInt(code, 10));
    }).replace(/&#x([0-9a-fA-F]+);/g, function(_, hex) {
        return String.fromCharCode(parseInt(hex, 16));
    });

    // 【新增兼容】处理AI错误返回的中文方括号格式 【giggle】→<giggle>
    text = text.replace(/【giggle】/g, '<giggle>').replace(/【\/giggle】/g, '</giggle>');

    // 先解析装饰标签，提取到 PresetAppManager
    if (typeof PresetAppManager !== 'undefined') {
        PresetAppManager.parseFromText(text);
    }

    // 从剧情文本中移除装饰XML标签
    if (typeof PresetAppManager !== 'undefined') {
        text = PresetAppManager.stripDecorTags(text);
    }

    // 清理 body 上的旧心声气泡（气泡是 fixed 定位在 body 上的，不在 storyEl 内）
    var oldBubbles = document.querySelectorAll('body > .thought-bubble:not([data-persistent])');
    oldBubbles.forEach(function(b) { b.remove(); });

    // 检查是否包含章节结束标记
    var chapterEndMatch = text.match(/\[章节结束\|([^\]]+)\]/);
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
    paragraphs.forEach(function(p, pIdx) {
        var thoughtRegex = /<giggle>([\s\S]*?)<\/giggle>/gi;
        var match;
        while ((match = thoughtRegex.exec(p)) !== null) {
            var giggleText = match[1].trim();
            var colonIdx = giggleText.indexOf('：');
            if (colonIdx === -1) colonIdx = giggleText.indexOf(':');
            var character, text;
            if (colonIdx > 0) {
                character = giggleText.substring(0, colonIdx).trim();
                text = giggleText.substring(colonIdx + 1).trim();
            } else {
                character = '???';
                text = giggleText;
            }
            allThoughts.push({
                character: character,
                text: text,
                original: match[0],
                paragraphIdx: pIdx
            });
        }
    });

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
        var cleanText = p.replace(/<giggle>[\s\S]*?<\/giggle>/gi, '').replace(/【giggle】[\s\S]*?【\/giggle】/gi, '').trim();

        // 检查这个段落是否有对应的心声
        var hasThoughtInThisPara = false;
        var thoughtId = -1;
        allThoughts.forEach(function(t, idx) {
            if (t.paragraphIdx === pIdx && !t.used) {
                hasThoughtInThisPara = true;
                thoughtId = idx;
                t.used = true;
            }
        });

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
                var safeText = cleanText.replace(/(\u300c[^\u300d]+\u300d)/g, function(m) {
                    var idx = placeholders.length;
                    placeholders.push('<span class="dialogue">' + escapeHtml(m) + '</span>');
                    return '<<PH' + idx + 'PH>>';
                });
                // 再处理英文引号""
                safeText = safeText.replace(/("[^"]+")/g, function(m) {
                    var idx = placeholders.length;
                    placeholders.push('<span class="dialogue">' + escapeHtml(m) + '</span>');
                    return '<<PH' + idx + 'PH>>';
                });
                // 先转义HTML，然后替换占位符
                html = '<p>' + escapeHtml(safeText).replace(/&lt;&lt;PH(\d+)PH&gt;&gt;/g, function(_, i) {
                    return placeholders[parseInt(i)];
                }) + '</p>';
            } else {
                html = '<p>' + escapeHtml(cleanText).replace(/\*\*(.*?)\*\*/g,
                    '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>') + '</p>';
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

    return result.join('') + chapterEndHtml;
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
    // 获取主角名
    var playerName = '';
    if (gameState.playerData && gameState.playerData.name) {
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
        Object.keys(gameState.allCharacters).forEach(function(key) {
            var cleanKey = key.replace(/[（(].*?[）)]/g, '').trim();
            if (cleanKey === cleanName) {
                existingKey = key;
            }
        });
        if (existingKey && existingKey !== c.name) {
            delete gameState.allCharacters[existingKey];
        }
        // ★ 合并而非覆盖：AI返回了什么就更新什么，没返回的保留
        var existing = gameState.allCharacters[c.name];
        if (existing) {
            if (c.title) existing.title = c.title;
            if (c.relation) existing.relation = c.relation;
            if (c.favorability !== undefined) existing.favorability = c.favorability;
            if (c.desc) existing.desc = c.desc;
            if (c.details) existing.details = c.details;
        } else {
            gameState.allCharacters[c.name] = c;
        }
    });
    renderNpcList();
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
    if (gameState._stats.startTime) {
        gameState._stats.totalPlayTime += Date.now() - gameState._stats.startTime;
        gameState._stats.startTime = Date.now();
    }
    // 确保版本号正确
    gameState._version = GAME_VERSION;

    // 打包记忆数据到存档中，确保存档包含完整游戏数据
    var memoryData = null;
    try {
        if (typeof EnhancedMemory !== 'undefined') {
            memoryData = {
                workingMemory: EnhancedMemory.workingMemory,
                shortTermMemory: EnhancedMemory.shortTermMemory,
                longTermMemory: EnhancedMemory.longTermMemory,
                stats: EnhancedMemory.stats
            };
        }
    } catch(e) {
        console.warn('[buildSaveData] 打包记忆数据失败:', e);
    }

    return {
        name: customName || (gameState.userPrompt || '').substring(0, 20) || '未命名存档',
        prompt: gameState.userPrompt || '',
        time: new Date().toLocaleString(),
        version: GAME_VERSION,
        state: JSON.stringify(gameState),
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
        Object.keys(parsed).forEach(function(k) { gameState[k] = parsed[k]; });
        
        // 读档后重置临时字段，防止旧数据残留
        gameState._depthPrompts = {};
        gameState._positionPrompts = {};
        gameState._afterChatPrompts = [];
        gameState._wiCachedResult = null;
        // 重置世界书轮次追踪器，防止cooldown/delay状态异常
        if (typeof WorldInfo !== 'undefined') {
            WorldInfo._turnTracker = {};
            WorldInfo._currentTurn = 0;
        }
        
        // 确保版本号更新
        gameState._version = GAME_VERSION;
        
        // 兼容旧存档缺少的字段
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
        
        // 兼容新字段
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
            // 重置开始时间
            gameState._stats.startTime = Date.now();
            // 补全可能缺失的子字段
            if (typeof gameState._stats.totalTurns === 'undefined') gameState._stats.totalTurns = 0;
            if (typeof gameState._stats.totalTokens === 'undefined') gameState._stats.totalTokens = 0;
            if (typeof gameState._stats.maxTokensInTurn === 'undefined') gameState._stats.maxTokensInTurn = 0;
            if (typeof gameState._stats.totalCharacters === 'undefined') gameState._stats.totalCharacters = 0;
            if (typeof gameState._stats.completedQuests === 'undefined') gameState._stats.completedQuests = 0;
            if (typeof gameState._stats.totalPlayTime === 'undefined') gameState._stats.totalPlayTime = 0;
        }
        if (!gameState._undoHistory) gameState._undoHistory = [];

        // 兼容日志相关字段（确保日志数据不会丢失）
        if (!Array.isArray(gameState._worldModules)) gameState._worldModules = [];
        if (!Array.isArray(gameState._moments)) gameState._moments = [];
        if (!gameState._npcDiaries) gameState._npcDiaries = {};
        if (!gameState._chattedNpcs) gameState._chattedNpcs = {};
        if (!gameState._chatLogs) gameState._chatLogs = {};
        if (!gameState._mail) gameState._mail = [];
        if (!gameState._diary) gameState._diary = [];

        // 兼容其他遗漏字段
        if (typeof gameState.userPrompt === 'undefined') gameState.userPrompt = '';
        if (typeof gameState.customStyle === 'undefined') gameState.customStyle = '';
        if (typeof gameState.systemPrompt === 'undefined') gameState.systemPrompt = '';
        if (typeof gameState.tokenCount === 'undefined') gameState.tokenCount = 0;
        if (typeof gameState.maxTokens === 'undefined') gameState.maxTokens = 80000;
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

        // 恢复记忆数据（从存档中还原EnhancedMemory）
        if (data.memoryData) {
            try {
                var memParsed = JSON.parse(data.memoryData);
                if (typeof EnhancedMemory !== 'undefined' && memParsed) {
                    if (memParsed.workingMemory) EnhancedMemory.workingMemory = memParsed.workingMemory;
                    if (memParsed.shortTermMemory) EnhancedMemory.shortTermMemory = memParsed.shortTermMemory;
                    if (memParsed.longTermMemory) EnhancedMemory.longTermMemory = memParsed.longTermMemory;
                    if (memParsed.stats) EnhancedMemory.stats = memParsed.stats;
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
                chatId: gameState.saveKey || slot || 'default',
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
                '</strong> <span style="font-size:11px;color:#b0b0b0">(' + escapeHtml(info.time) + ')</span>';
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #e0ecf8;flex-wrap:wrap;gap:4px">' +
                '<span style="font-size:13px;color:#546e7a;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">' +
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
                '<span style="font-size:13px;color:#b0c0d0">' + displayName + '</span>' + (showSave ?
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
    html += '<div style="font-size:12px;color:#8a9aaa;margin-top:12px;margin-bottom:6px">扩展存档</div>';
    for (var ei = LOCAL_EXT_START; ei <= LOCAL_EXT_END; ei++) {
        var ext = await SaveDB.get(ei);
        html += slotRow('存档' + ei, '', ext, ei, true);
    }
    // 迁移按钮已移除（自由版无云存档）
    // 导入导出
    html += '<div style="margin-top:14px;padding-top:12px;border-top:2px dashed #e0ecf8">' +
        '<div style="font-size:12px;color:#8a9aaa;margin-bottom:8px;text-align:center">包 存档导入 / 导出</div>' +
        '<div style="display:flex;gap:8px">' +
        '<button class="pixel-btn blue big" onclick="exportSaves()" style="flex:1">导出全部存档</button>' +
        '<button class="pixel-btn big" onclick="document.getElementById(\'importFileInput\').click()" style="flex:1">导入存档</button>' +
        '</div>' +
        '<div style="font-size:10px;color:#8a9aaa;text-align:center;margin-top:6px">导出为JSON文件，可在其他设备导入恢复</div>' +
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
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:white;margin-bottom:6px;border:2px solid #a2d2ff;cursor:pointer" onclick="safeLoadSlot(' +
                slot + ')">' + '<div style="flex:1;min-width:0;overflow:hidden">' +
                '<div style="font-size:14px;color:#546e7a;font-weight:600">' + icon + ' ' + escapeHtml(info.name) +
                '</div>' + '<div style="font-size:11px;color:#b0b0b0">' + label + ' · ' + escapeHtml(info.time) +
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
            html = '<div style="text-align:center;padding:30px;color:#b0c0d0">没有找到任何存档</div>';
        }
        html +=
            '<div style="margin-top:14px;padding-top:12px;border-top:2px dashed #e0ecf8;display:flex;gap:8px">' +
            '<button class="pixel-btn blue big" onclick="document.getElementById(\'loadModal\').remove();exportSaves()" style="flex:1">导出存档</button>' +
            '<button class="pixel-btn big" onclick="document.getElementById(\'importFileInput\').click()" style="flex:1">导入存档</button>' +
            '</div>';
        // 移除旧弹窗（如果有）
        var old = document.getElementById('loadModal');
        if (old) old.remove();
        var overlay = document.createElement('div');
        overlay.className = 'modal-overlay show';
        overlay.id = 'loadModal';
        overlay.innerHTML =
            '<div class="pixel-modal"><div class="modal-titlebar"><span class="modal-titlebar-text">读取存档</span><div class="modal-close-btn" onclick="document.getElementById(\'loadModal\').remove()">×</div></div><div class="modal-body">' +
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
    var stats = gameState._stats || {};
    
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
    if (totalTurnsEl) totalTurnsEl.textContent = formatNum(stats.totalTurns || (gameState.conversationHistory || []).filter(m => m.role === 'assistant').length || 0);
    
    var totalTokensEl = document.getElementById('statTotalTokens');
    if (totalTokensEl) totalTokensEl.textContent = formatNum(stats.totalTokens || gameState.tokenCount || 0);
    
    var maxTokensEl = document.getElementById('statMaxTokens');
    if (maxTokensEl) maxTokensEl.textContent = formatNum(stats.maxTokensInTurn || 0);
    
    var totalCharsEl = document.getElementById('statTotalCharacters');
    if (totalCharsEl) totalCharsEl.textContent = formatNum(stats.totalCharacters || 0);
    
    var currentCharsEl = document.getElementById('statCurrentCharacters');
    if (currentCharsEl) currentCharsEl.textContent = formatNum(Object.keys(gameState.allCharacters || {}).length);
    
    var completedQuestsEl = document.getElementById('statCompletedQuests');
    if (completedQuestsEl) completedQuestsEl.textContent = formatNum(stats.completedQuests || 0);
    
    var currentQuestsEl = document.getElementById('statCurrentQuests');
    if (currentQuestsEl) currentQuestsEl.textContent = formatNum((gameState.currentQuests || []).length);
    
    var keyEventsEl = document.getElementById('statKeyEvents');
    if (keyEventsEl) keyEventsEl.textContent = formatNum((gameState.keyEvents || []).length);
    
    var versionEl = document.getElementById('statGameVersion');
    if (versionEl) versionEl.textContent = GAME_VERSION;
    
    var saveEl = document.getElementById('statCurrentSave');
    if (saveEl) saveEl.textContent = (gameState.userPrompt || '').substring(0, 15) || '-';
    
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
            UI.showPage('storyPage');
            try {
                renderNavBar('gameNav', [
                    { page: 'storyPage', icon: 'icon-book', label: '剧情' },
                    { page: 'playerPage', icon: 'icon-user', label: '个人' },
                    { page: 'npcPage', icon: 'icon-users', label: '人际' },
                    { page: 'logPage', icon: 'icon-grid', label: '日志' },
                    { page: 'memoryPage', icon: 'icon-sparkles', label: '记忆' },
                    { page: 'recapPage', icon: 'icon-clock', label: '回顾' }
                ], 0);
            } catch (e) {
                console.warn('旧存档导航栏渲染跳过:', e);
            }
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
    if (!gameState._chatLogs || Array.isArray(gameState._chatLogs)) gameState._chatLogs = {};
    npcChatState.chatHistory = gameState._chatLogs[name] ? gameState._chatLogs[name].slice() : [];
    npcChatState.isSending = false;
        npcChatState.abortController = null; // 重置NPC聊天的AbortController
    if (!gameState._chattedNpcs) gameState._chattedNpcs = {};
    gameState._chattedNpcs[name] = true;
    var titleEl = document.getElementById('npcChatTitle');
    var msgsEl = document.getElementById('npcChatMessages');
    var choicesEl = document.getElementById('npcChatChoices');
    var inputEl = document.getElementById('npcChatInput');
    var sendEl = document.getElementById('npcChatSend');
    if (!titleEl || !msgsEl || !choicesEl || !inputEl || !sendEl) {
        console.warn('npcChatModal not found');
        return;
    }
    var remark = (gameState._chatRemarks && gameState._chatRemarks[name]) || name;
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
        'position:absolute;top:44px;right:8px;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.12);padding:4px 0;z-index:200;min-width:130px;overflow:hidden';
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
            'padding:12px 16px;font-size:14px;color:#333;cursor:pointer;transition:background .15s';
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
    TimerManager.setTimeout('chatMenuClick', function() {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && e.target.id !== 'chatDetailMore') {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 10);
}
function editChatRemark() {
    var name = npcChatState.npcName;
    var currentRemark = (gameState._chatRemarks && gameState._chatRemarks[name]) || '';
    var menu = document.getElementById('chatMenuPanel');
    if (menu) menu.remove();
    var header = document.querySelector('.chat-detail-header');
    if (!header) return;
    var panel = document.createElement('div');
    panel.id = 'chatRemarkPanel';
    panel.style.cssText =
        'position:absolute;top:44px;left:8px;right:8px;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.12);padding:12px 16px;z-index:200';
    var safeRemark = (currentRemark || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    panel.innerHTML = '<div style="font-size:13px;color:#999;margin-bottom:8px">备注名</div>' +
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
        if (!gameState._chatRemarks) gameState._chatRemarks = {};
        if (val) {
            gameState._chatRemarks[name] = val;
        } else {
            delete gameState._chatRemarks[name];
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
                
                if (!gameState._npcAvatars) gameState._npcAvatars = {};
                gameState._npcAvatars[name] = compressedData;
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
    if (!gameState._blockedNpcs) gameState._blockedNpcs = {};
    if (gameState._blockedNpcs[name]) {
        gameState._blockedNpcs[name] = false;
        autoSave();
        UI.toast('已取消拉黑「' + name + '」');
        return;
    }
    var menu = document.getElementById('chatMenuPanel');
    if (menu) menu.remove();
    var header = document.querySelector('.chat-detail-header');
    if (!header) return;
    var panel = document.createElement('div');
    panel.style.cssText =
        'position:absolute;top:44px;left:50%;transform:translateX(-50%);background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.12);padding:16px;z-index:200;text-align:center;min-width:200px';
    panel.innerHTML = '<div style="font-size:15px;color:#333;margin-bottom:12px">确定拉黑「' + escapeHtml(name) +
        '」？</div>' +
        '<div style="font-size:13px;color:#999;margin-bottom:16px">拉黑后将不再收到消息</div>' +
        '<div style="display:flex;gap:12px;justify-content:center">' +
        '<span id="blockCancel" style="padding:8px 24px;background:#f5f5f5;border-radius:8px;font-size:14px;cursor:pointer">取消</span>' +
        '<span id="blockConfirm" style="padding:8px 24px;background:#ff3b30;color:#fff;border-radius:8px;font-size:14px;cursor:pointer">拉黑</span></div>';
    header.appendChild(panel);
    document.getElementById('blockCancel').onclick = function() {
        panel.remove();
    };
    document.getElementById('blockConfirm').onclick = function() {
        gameState._blockedNpcs[name] = true;
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
        'position:absolute;top:44px;left:50%;transform:translateX(-50%);background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.12);padding:16px;z-index:200;text-align:center;min-width:200px';
    panel.innerHTML = '<div style="font-size:15px;color:#333;margin-bottom:12px">删除与「' + escapeHtml(name) +
        '」的聊天？</div>' +
        '<div style="font-size:13px;color:#999;margin-bottom:16px">聊天记录将被清除，不可恢复</div>' +
        '<div style="display:flex;gap:12px;justify-content:center">' +
        '<span id="delCancel" style="padding:8px 24px;background:#f5f5f5;border-radius:8px;font-size:14px;cursor:pointer">取消</span>' +
        '<span id="delConfirm" style="padding:8px 24px;background:#ff3b30;color:#fff;border-radius:8px;font-size:14px;cursor:pointer">删除</span></div>';
    header.appendChild(panel);
    document.getElementById('delCancel').onclick = function() {
        panel.remove();
    };
    document.getElementById('delConfirm').onclick = function() {
        if (gameState._chatLogs) delete gameState._chatLogs[name];
        if (gameState._chattedNpcs) delete gameState._chattedNpcs[name];
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
    if (!gameState._customEmojis) gameState._customEmojis = ['[笑脸]', '[大哭]', '[怒]', '[晕]', '[偷笑]', '[吃瓜]',
        '[暗中观察]', '[狗头]', '[抱抱]', '[白眼]'
    ];
    if (gameState._customEmojis.length === 0) {
        var hint = document.createElement('div');
        hint.className = 'empty-state';
        hint.style.cssText = 'width:100%;padding:16px 0';
        hint.textContent = '还没有表情，点击 + 添加';
        panel.appendChild(hint);
    } else {
        gameState._customEmojis.forEach(function(e, i) {
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
            if (gameState._customEmojis.indexOf(emoji) === -1) {
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
    // 请求NPC回复
    requestNpcReply(text);
}
function selectNpcChatChoice(text) {
    if (npcChatState.isSending) return;
    // 清掉选项
    document.getElementById('npcChatChoices').innerHTML = '';
    // 显示玩家气泡
    addNpcChatBubble('player', text);
    // 请求NPC回复
    requestNpcReply(text);
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
        // 同步到gameState._chatLogs（裁剪后也保持一致）
        if (!gameState._chatLogs || Array.isArray(gameState._chatLogs)) gameState._chatLogs = {};
        gameState._chatLogs[npcChatState.npcName] = npcChatState.chatHistory.slice();
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
        var systemMsg = '你现在扮演「' + name + '」这个角色，与玩家进行一对一对话。\n\n' + '【角色信息】\n' + '姓名: ' + name + '\n' +
            (c.title ? '身份: ' + c.title + '\n' : '') + (c.relation ? '与主角关系: ' + c.relation + '\n' :
            '') + (c.favorability !== undefined ? '对主角好感度: ' + c.favorability + '/100\n' : '') + (c
                .desc ? '当前状态: ' + c.desc + '\n' : '');
        if (c.details && c.details.length > 0) {
            systemMsg += c.details.map(function(d) {
                return d.key + ': ' + d.value;
            }).join('\n') + '\n';
        }
        // 加上剧情背景
        if (gameState.rollingSummary) {
            systemMsg += '\n【剧情背景】\n' + gameState.rollingSummary + '\n';
        }
        systemMsg += '\n【回复要求】\n' + '1. 完全以' + name + '的身份、口吻和性格回复\n' +
            '2. 回复用纯JSON格式: {"replies": ["消息1","消息2",...], "choices": ["选项1","选项2","选项3"]}\n' +
            '3. replies是消息数组，1-6条，由你决定发几条。可以是一条长消息拆成几条短消息，也可以是连续的几句话\n' +
            '4. 每条消息纯文字对话，不要加动作描写、旁白或括号内容，单条30字以内\n' +
            '5. 可以在消息中穿插文字表情，如[吃瓜][狗头][白眼][无语][偷笑][傲娇][白眼][暗中观察]等，也可以自己创造新的文字表情如[翻白眼][拍桌子][捂脸]等，用[xxx]格式\n' +
            '6. 可以穿插富消息标签：[照片:描述内容]、[定位:地点名称]，和文字混用\n' +
            '7. choices给出3个玩家可以接着说的话\n' + '8. 这是日常对话，不推进主线剧情\n' + '9. 直接输出JSON，不要代码块包裹';
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
        var response = await callAI(chatMessages, {
            stream: false,
            temperature: gameState.temperature || 0.8,
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
        // 好感度可能变化，更新到allCharacters
        if (parsed && parsed.favorability !== undefined) {
            if (gameState.allCharacters[name]) {
                gameState.allCharacters[name].favorability = parsed.favorability;
                renderNpcList();
            }
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
    var name = document.getElementById('npcEditName').value.trim();
    if (!name) {
        UI.toast('请填写角色名字');
        return;
    }
    var title = document.getElementById('npcEditTitle2').value.trim();
    var relation = document.getElementById('npcEditRelation').value.trim();
    var favor = parseInt(document.getElementById('npcEditFavor').value) || 50;
    var desc = document.getElementById('npcEditDesc').value.trim();
    var extra = document.getElementById('npcEditExtra').value.trim();
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
        delete gameState.allCharacters[npcEditingName];
    }
    gameState.allCharacters[name] = {
        name: name,
        title: title,
        relation: relation,
        favorability: favor,
        desc: desc,
        details: details
    };
    // 注入到对话历史让AI记住
    var injectText = '【系统提示：玩家更新了角色「' + name + '」的设定】\n' + '姓名: ' + name + '\n' + (title ? '身份: ' + title +
        '\n' : '') + (relation ? '关系: ' + relation + '\n' : '') + '好感度: ' + favor + '\n' + (desc ?
        '状态: ' + desc + '\n' : '');
    if (details.length > 0) {
        injectText += details.map(function(d) {
            return d.key + ': ' + d.value;
        }).join('\n') + '\n';
    }
    injectText += '请在后续剧情中严格按照以上设定来描写该角色。';
    if (gameState.conversationHistory && gameState.conversationHistory.length > 0) {
        gameState.conversationHistory.push({
            role: 'user',
            content: injectText
        }, {
            role: 'assistant',
            content: '明白，已更新「' + name + '」的角色设定，后续会严格遵守。'
        });
    }
    renderNpcList();
    UI.hideModal('npcEditModal');
    autoSave();
    UI.toast('角色「' + name + '」已保存');
}
// --- NPC列表渲染 ---
function renderNpcList() {
    renderNpcPage();
}
function renderNpcPage() {
    // 确保 allCharacters 已初始化
    if (!gameState.allCharacters) gameState.allCharacters = {};
    var chars = Object.values(gameState.allCharacters || {});
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
