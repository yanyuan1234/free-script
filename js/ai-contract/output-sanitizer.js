// ========================================
// 输出清理器
// 清理 AI 输出中的思维链、HTML、光标符号、JSON 前缀等噪声
// ========================================

// 旧代码：output-sanitizer 用 7 标签（硬编码在 7 个 replace 里），response-parser 用 5 标签数组
// 现统一为常量，两处引用，消除标签集不一致隐患
// [CP-11] 12 标签：补 final/inner_thoughts/reflection/assistantfinal，
//   final = 酒馆助手 End-Tag 标配 + Gemini 2.5+ / Claude 4 Thinking 模式正式回复包裹（漏此 = 正式回复整段被当 CoT 剥离）
//   inner_thoughts = 酒馆助手 v3 引入
//   reflection = MiniMax / Reflection 系列
//   assistantfinal = Qwen3 / 酒馆 fallback
const THINKING_TAGS = ['think', 'thinking', 'reasoning', 'thought', 'analysis', 'ECoT', 'cot', 'chain_of_thought', 'final', 'inner_thoughts', 'reflection', 'assistantfinal'];
const OutputSanitizer = {
    THINKING_TAGS: THINKING_TAGS,
    // P0 修复 BUG-A：裸思考文本检测模式
    // AI 偶尔不包裹 <think> 标签直接输出思考过程（"我需要..."、"用户选择了..."、"选择A的后果..."等）
    // 这些元话语不属于剧情正文，需要剥离
    // 策略：按段落（\n\n 或 \n）分割，删除匹配元话语模式的段落
    // 注意：只删除整段（避免误删剧情对话中"我需要"等正常语句）
    _BARE_THINKING_PATTERNS: [
        /^用户选择了?\s*选项/,
        /^玩家选择了?\s*选项/,
        /^用户选择了?.*推进/,
        /^玩家选择了?.*推进/,
        /^选择[A-D一二三四五六七八九]\s*[的之后]/,
        /^选择[A-D一二三四五六七八九]\s*果/,
        /^用户选择[了到]?[A-D一二三四五六七八九]/,
        /^玩家选择[了到]?[A-D一二三四五六七八九]/,
        // BUG-A3：模型在 story 中列出 A/B/C 计划选项，如 "A. 接受退婚"
        /^[A-D一二三四五六七八九][\.．、：:]\s*.+/,
        /^当前状态/,
        /^当前情况/,
        /^我需要/,
        /^我必须/,
        /^接下来我/,
        /^我打算/,
        /^分析[:：]/,
        /^考虑[:：]/,
        /^思路[:：]/,
        /^策略[:：]/,
        /^步骤[:：]/,
        /^\d+[\.\、]\s*(描述|推进|设置|生成|引入|安排)/,
        /^- (描述|推进|设置|生成|引入|安排)/,
        // BUG-A2：模型常把设计思路直接写入 story 字段，以下模式覆盖这些元话语
        /^用户现在(?:需要|要|想)/,
        /^玩家现在(?:需要|要|想)/,
        /^用户接下来/,
        /^玩家接下来/,
        /^首先得/,
        /^首先[，,].*/,
        /^首先[^。]*(?:设定|设计|安排|规划|名字|主角|属性|场景|选项|choices|身份|stats|status|状态|stats)/,
        /^比如叫/,
        /^比如[\w\u4e00-\u9fa5]{1,6}[,，]?/,
        /^对，/,
        /^对[,，]/,
        /^然后NPC/,
        /^然后[^。]*的话/,
        /^然后开局/,
        /^然后choices/,
        /^然后world/,
        /^然后keyEvents/,
        /^然后player/,
        /^然后bag/,
        /^然后quests/,
        /^然后gameTime/,
        /^然后心声音?/,
        /^然后系统/,
        /^然后剧情/,
        /^然后场景/,
        /^然后主角/,
        /^然后属性/,
        /^然后时间/,
        /^然后地点/,
        /^然后选项/,
        /^主角.*设定/,
        /^属性.*设定/,
        /^NPC.*设定/,
        /^任务.*设定/,
        /^时间.*设定/,
        /^场景.*设定/,
        /^名字.*设定/,
        // BUG-A3：模型把完整的设计/规划/JSON 构造过程写入 story 字段
        /^用户(?:要求|说|想要|现在|接下来)/,
        /^玩家(?:要求|说|想要|现在|接下来)/,
        /^让我/,
        /^等等[，,]/,
        /^第\d+段[：:]/,
        /^选项(?:应该|：)/,
        /^世界观(?:设定)?[：:]/,
        /^场景描述[：:]/,
        /^场景[：:]/,
        /^时间[：:]/,
        /^地点[：:]/,
        /^事件[：:]/,
        /^关键事件[：:]/,
        /^主角名[：:]/,
        /^年龄[：:]/,
        /^身份[：:]/,
        /^性格[：:]/,
        /^系统(?:功能)?[：:]/,
        /^任务[：:]/,
        /^世界模块[：:]/,
        /^NPC[：:]/,
        /^初始物品/,
        /^标题[：:]/,
        /^故事[：:]/,
        /^开头[：:]/,
        /^推荐术语/,
        /^现在写/,
        /^所以我会在/,
        /^(?:player|characters|world|bag|quests|keyEvents|gameTime|currency|currencyName|contextSummary|memoryUpdates|giggle)\s*[:：]/i,
        /^-\s+(?:修仙世界|被退婚|开局|推荐术语|场景|系统|关键事件|未婚妻|家族长辈|系统|主线|隐藏|JSON格式|字数|name|age|identity|personality|title|stats|world|quests)\s*[:：]?/i,
        /^-\s+\{label:/i,
        /^-\s+[\u4e00-\u9fa5]{2,4}[：:]/,
        /^\{label:/i,
        /^\],?$/,
        /^\d+[\.\、]\s*(?:早晨|苏清歌|父亲|主角|环境|气氛|使用|设定|创建|引入|设置)/,
        /^-\s+(?:身份|性格|属性|灵根|修为|体质|声望|气运|使用|包含|林家|柳家|下品|主线|可以|玩家|主角)/,
        /^\d+[\.\、]\s*(?:设定|创建|描述|提供|包含|创建主角|描述开局|描述场景|描述剧情|设定时间|设定主角)/,
        /^注意[:：]/,
        /^这意味着[:：]/,
        /^我需要确保[:：]/,
        /^player\.name/,
        /^player\.stats/,
        // BUG-A4：模型用英文输出完整 CoT 时的常见元话语
        /^Here's a thinking process:/i,
        /^Here's a step-by-step thinking process:/i,
        /^Thinking process:/i,
        /^Step-by-step thinking:/i,
        /^Analyze User Input:/i,
        /^Draft Construction/i,
        /^Mental Refinement/i,
        /^Narrative Flow:/i,
        /^Paragraph Structure/i,
        /^Opening Event:/i,
        /^Protagonist Name:/i,
        /^System:/i,
        /^\*Stats:\*/i,
        /^Specific Rules:/i,
        /^Output Format:/i,
        /^Player Preferences:/i,
        /^Language\/Terms:/i,
        /^Core Setting:/i,
        /^Word count:/i,
        /^Perspective:/i,
        /^- This is the first turn/i,
        /^- User says:/i,
        /^- \w+ says:/i,
        /^- `\w+` must be/i,
        /^- `\w+`:/i,
        /^\(I will expand/i,
        /^Let's draft/i,
        /^Good\.?$/i
    ],
    sanitizeStory(text) {
        if (!text || typeof text !== 'string') return '';
        let s = text;
        // 【BUG-001 修复】检测 HTML/WAF 响应作为最后防线
        // 如果 storyText 是 HTML 页面源码（WAF 验证页面等），拦截并返回友好提示
        var _lowerS = s.trim().toLowerCase();
        if (_lowerS.startsWith('<!doctype') || _lowerS.startsWith('<html') || _lowerS.startsWith('<head')) {
            return '⚠️ **API返回了HTML页面而非AI内容**\n\n💡 请检查API配置或更换API端点后重试。';
        }
        var _htmlTags = _lowerS.substring(0, 3000).match(/<\/?(?:html|head|body|script|style|meta|link|title|form|input)\b/gi);
        if (_htmlTags && _htmlTags.length >= 5) {
            return '⚠️ **API返回了HTML页面而非AI内容**\n\n💡 请检查API配置或更换API端点后重试。';
        }
        // 【ISSUE-003 修复】清理 AI 内部计划标签（foreshadow/plan/recall/trigger/mem 等）
        // 这些标签是 AI 用于内部结构化输出的，不应出现在用户可见的剧情文本中
        s = this.stripAIPlanTags(s);
        s = this.stripThinking(s);
        s = this.stripHTMLAndCursors(s);
        // stripBareThinking 必须在 stripHTMLAndCursors 之后：
        // HTML 标签（如 <p>）会影响段落分割，先剥 HTML 才能正确按 \n\n 分段
        s = this.stripBareThinking(s);
        s = this.stripJSONArtifacts(s);
        s = s.replace(/[\u0000-\u0008\u000b-\u000c\u000e-\u001f]+/g, ' ');
        s = s.replace(/\n{3,}/g, '\n\n');
        return s.trim();
    },

    // 【ISSUE-003 修复】剥离 AI 内部计划/结构化标签
    // 处理 foreshadow, plan, recall, trigger, mem 等自定义标签
    // 包括完整标签（带属性）、未闭合标签、以及标签内容
    stripAIPlanTags(text) {
        if (!text || typeof text !== 'string') return '';
        var s = text;
        // AI 内部标签列表
        var AI_PLAN_TAGS = ['foreshadow', 'plan', 'recall', 'trigger', 'mem',
                           'memory', 'note', 'comment', 'system_note', 'meta',
                           'hidden', 'internal', 'draft', 'outline'];
        // 1. 移除配对标签及其内容：<foreshadow ...>内容</foreshadow>
        for (var i = 0; i < AI_PLAN_TAGS.length; i++) {
            var tag = AI_PLAN_TAGS[i];
            // 匹配 <tag ...>...</tag>（含属性、跨行）
            var pairRe = new RegExp('<' + tag + '\\b[^>]*>[\\s\\S]*?<\\/' + tag + '>', 'gi');
            s = s.replace(pairRe, '');
            // 匹配自闭合标签：<foreshadow .../>
            var selfCloseRe = new RegExp('<' + tag + '\\b[^>]*/>', 'gi');
            s = s.replace(selfCloseRe, '');
        }
        // 2. 移除未闭合的开口标签：<foreshadow id="first_day" priority="8|
        // 这处理流式中断导致的残缺标签
        for (var j = 0; j < AI_PLAN_TAGS.length; j++) {
            var tag2 = AI_PLAN_TAGS[j];
            // 匹配 <tag ...> 到行尾或文本末尾（未闭合的情况）
            var unclosedRe = new RegExp('<' + tag2 + '\\b[^>]*[>|]', 'gi');
            s = s.replace(unclosedRe, '');
        }
        // 3. 移除孤立的闭合标签：</foreshadow>
        for (var k = 0; k < AI_PLAN_TAGS.length; k++) {
            var tag3 = AI_PLAN_TAGS[k];
            var closeRe = new RegExp('<\\/' + tag3 + '>', 'gi');
            s = s.replace(closeRe, '');
        }
        return s;
    },

    // 剥离裸思考文本（无标签包裹的思考过程）
    // 仅当文本以多段元话语开头时才剥离，避免误删正常剧情
    stripBareThinking(text) {
        if (!text || typeof text !== 'string') return '';
        // 按换行分段（模型常把设计思路用单换行连接，不能只按双换行）
        let paras = text.split(/\n+/);
        if (paras.length === 0) return text;

        // BUG-A4：模型有时用英文输出完整 CoT（"Here's a thinking process:"）。
        // 先对每段做前缀清洗，把 "Paragraph N:" / "*Paragraph N:*" / "(~288 chars)"
        // 等规划标记去掉，保留后面的叙事正文。
        paras = paras.map(function(para) {
            return para
                .replace(/^(?:\*Paragraph\s+\d+:\*|Paragraph\s+\d+[:：])\s*/i, '')
                .replace(/^[（(]~?\d+\s*chars[）)]\s*/i, '');
        });

        // 英文强信号：一旦检测到模型以英文思考框架开头，直接跳到第一个中文叙事段落
        const ENGLISH_THINKING_SIGNALS = [
            /^Here's a thinking process:/i,
            /^Here's a step-by-step thinking process:/i,
            /^Thinking process:/i,
            /^Step-by-step thinking:/i,
            /^Analyze User Input:/i,
            /^Draft Construction/i,
            /^Mental Refinement/i
        ];
        if (ENGLISH_THINKING_SIGNALS.some(function(re) { return re.test(paras[0].trim()); })) {
            var startIdx = -1;
            for (var k = 1; k < paras.length; k++) {
                var p = paras[k].trim();
                if (!p) continue;
                var chineseCount = (p.match(/[\u4e00-\u9fa5]/g) || []).length;
                // 找到第一个以中文为主的段落，视为叙事起点
                if (chineseCount >= 30) { startIdx = k; break; }
            }
            if (startIdx === -1) return '';
            // 从叙事起点继续过滤所有匹配思考模式的段落（去掉夹杂的英文元评论）
            var self = this;
            var filtered = paras.slice(startIdx).filter(function(para) {
                var p2 = para.trim();
                if (!p2) return true;
                var firstLine = p2.split(/\n/)[0].trim();
                return !self._BARE_THINKING_PATTERNS.some(function(re) { return re.test(firstLine); });
            });
            return filtered.join('\n\n').trim();
        }

        // 强信号模式：只要文本以这些开头，极大概率是模型把设计思路写进了 story
        const STRONG_THINKING_PATTERNS = [
            /^用户(?:现在|要求|说|想要|接下来)/, /^玩家(?:现在|要求|说|想要|接下来)/,
            /^首先得/, /^首先[，,].*/, /^首先[^。]*(?:设定|设计|安排|规划|名字|主角|属性|场景|选项|choices|身份|stats|status|状态|stats)/,
            /^然后NPC/, /^然后[^。]*的话/, /^然后开局/,
            /^然后choices/, /^然后world/, /^然后keyEvents/,
            /^然后player/, /^然后bag/, /^然后quests/, /^然后gameTime/,
            /^然后心声音?/, /^然后系统/, /^然后剧情/, /^然后场景/,
            /^然后主角/, /^然后属性/, /^然后时间/, /^然后地点/, /^然后选项/,
            /^主角.*设定/, /^属性.*设定/, /^NPC.*设定/, /^任务.*设定/, /^时间.*设定/, /^场景.*设定/, /^名字.*设定/,
            // BUG-A3 强信号
            /^让我/, /^等等[，,]/, /^第\d+段[：:]/,
            /^选项(?:应该|：)/, /^世界观(?:设定)?[：:]/, /^场景描述[：:]/,
            /^时间[：:]/, /^地点[：:]/, /^事件[：:]/, /^主角名[：:]/, /^年龄[：:]/,
            /^身份[：:]/, /^性格[：:]/, /^系统(?:功能)?[：:]/, /^任务[：:]/,
            /^世界模块[：:]/, /^NPC[：:]/, /^初始物品/,
            /^-\s+(?:身份|性格|属性|灵根|修为|体质|声望|气运|使用|包含|林家|柳家|下品|主线|可以|玩家|主角)/,
            /^\d+[\.\、]\s*(?:设定|创建|描述|提供|包含|创建主角|描述开局|描述场景|描述剧情|设定时间|设定主角)/
        ];

        // 检测开头连续多少段是思考内容
        let thinkEnd = 0;
        let matchCount = 0;
        let hasStrongSignal = false;
        for (let i = 0; i < paras.length; i++) {
            const para = paras[i].trim();
            if (!para) { thinkEnd = i + 1; continue; }
            // 取第一行（段落可能多行，只看开头）
            const firstLine = para.split(/\n/)[0].trim();
            const isThinking = this._BARE_THINKING_PATTERNS.some(function(re) { return re.test(firstLine); });
            if (isThinking) {
                thinkEnd = i + 1;
                matchCount++;
                if (STRONG_THINKING_PATTERNS.some(function(re) { return re.test(firstLine); })) {
                    hasStrongSignal = true;
                }
            } else {
                break;
            }
        }
        // 至少 2 段匹配才剥离（避免误删单段"我需要..."的剧情对话）
        // 强信号模式下放宽到 1 段
        const minMatch = hasStrongSignal ? 1 : 2;
        if (matchCount >= minMatch && thinkEnd < paras.length) {
            // BUG-A3 fix：强信号下模型会把设计规划选项夹杂在思考段落中（如 A/B/C 选项），
            // 且后面继续出现设计段落，因此扫描全文并删除所有匹配思考模式的段落
            if (hasStrongSignal) {
                var self = this;
                var filtered = paras.slice(thinkEnd).filter(function(para) {
                    var p = para.trim();
                    if (!p) return true;
                    var firstLine = p.split(/\n/)[0].trim();
                    return !self._BARE_THINKING_PATTERNS.some(function(re) { return re.test(firstLine); });
                });
                return filtered.join('\n\n').trim();
            }
            return paras.slice(thinkEnd).join('\n\n').trim();
        }
        // BUG FIX：单段裸推理前缀后紧跟 JSON 时，允许 1 段匹配即剥离
        // 场景：模型先输出 "我需要考虑一下..." 再输出 {"story":"..."}，该前缀不属于剧情
        if (matchCount >= 1 && thinkEnd < paras.length) {
            const rest = paras.slice(thinkEnd).join('\n\n').trim();
            if (/^\s*[\{\[]/.test(rest)) {
                return rest;
            }
        }
        return text;
    },

    sanitizeJSON(raw) {
        if (!raw || typeof raw !== 'string') return '';
        let s = raw.trim();
        if (s.startsWith('```')) {
            s = s.replace(/^```json\s*/i, '').replace(/^```/, '').trim();
            if (s.endsWith('```')) s = s.slice(0, -3).trim();
        }
        s = s.replace(/^[^\{\[]*?(\{|\[)/, '$1');
        return s;
    },

    stripThinking(text) {
        if (!text || typeof text !== 'string') return '';

        // 【P0 根因修复】用线性时间扫描器替代正则
        // 原实现：对 13 个标签各跑一次 new RegExp('[\\s\\S]*?') 正则，灾难性回溯
        // 新实现：stripPairedTags 一次性 O(n) 扫描所有标签，无回溯
        if (typeof stripPairedTags !== 'undefined' && THINKING_TAGS && THINKING_TAGS.length > 0) {
            var s = stripPairedTags(text, THINKING_TAGS);
            // 💭 是 emoji 包围（非标签），用线性扫描器处理
            if (typeof scanMarkerPairs !== 'undefined') {
                s = scanMarkerPairs(s, '💭', 'strip');
            }
            return s;
        }
        // 回退：原正则逻辑（仅在扫描器不可用时使用）
        var s2 = text;
        for (var i = 0; i < THINKING_TAGS.length; i++) {
            var tag = THINKING_TAGS[i];
            var re = new RegExp('<' + tag + '\\b[^>]*>[\\s\\S]*?</' + tag + '\\s*>', 'gi');
            s2 = s2.replace(re, '');
        }
        return s2.replace(/💭[\s\S]*?💭/g, '');
    },

    stripHTMLAndCursors(text) {
        if (!text || typeof text !== 'string') return '';
        return text
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/▌|⎸/g, '');
    },

    stripJSONArtifacts(text) {
        if (!text || typeof text !== 'string') return '';
        let s = text;
        // 移除开头的字段名前缀（如 "story": " 或 story: ）
        s = s.replace(/^\s*"story"\s*:\s*"/i, '')
            .replace(/^\s*"title"\s*:\s*"/i, '')
            .replace(/^\s*story\s*:\s*/i, '')
            .replace(/^\s*title\s*:\s*/i, '')
            .replace(/\{\s*"story"\s*:\s*"/gi, '')
            .replace(/"\s*\}\s*$/g, '');

        // 场景：AI 把 "choices":[...]、"characters":[...] 等 JSON 片段写进了 story 字符串值
        // 【P0 ReDoS 修复】用 indexOf 线性扫描替代 [\s\S]*? 正则，避免灾难性回溯
        // 原实现：[\s\S]*?(?:\]|\}) 会在无配对符号时回溯整个文本
        // 新实现：用 indexOf 找配对的 ] 或 }，O(n) 复杂度
        var _jsonFieldNames = ['choices', 'characters', 'player', 'bag', 'currency', 'currencyName',
            'quests', 'gameTime', 'keyEvents', 'world', 'locations', 'relationships',
            'hud', 'contextSummary', 'title', 'npcMessages', 'memoryUpdates'];
        for (var _fi = 0; _fi < _jsonFieldNames.length; _fi++) {
            var _fieldName = _jsonFieldNames[_fi];
            var _searchPos = 0;
            while (_searchPos < s.length) {
                // 查找 "fieldName": 后跟 [ 或 {
                var _quotedField = '"' + _fieldName + '"';
                var _fieldIdx = s.indexOf(_quotedField, _searchPos);
                if (_fieldIdx === -1) {
                    // 也尝试转义引号版本
                    _quotedField = '\\"' + _fieldName + '\\"';
                    _fieldIdx = s.indexOf(_quotedField, _searchPos);
                }
                if (_fieldIdx === -1) break;
                // 跳过字段名和引号
                var _afterField = _fieldIdx + _quotedField.length;
                // 跳过空白和冒号
                while (_afterField < s.length && /[\s:]/.test(s.charAt(_afterField))) _afterField++;
                if (_afterField >= s.length) { _searchPos = _fieldIdx + 1; continue; }
                var _openCh = s.charAt(_afterField);
                var _closeCh = '';
                if (_openCh === '[') _closeCh = ']';
                else if (_openCh === '{') _closeCh = '}';
                else { _searchPos = _fieldIdx + 1; continue; }
                // 用深度计数找配对闭合符号
                var _depth = 1;
                var _pos = _afterField + 1;
                var _inStr = false;
                var _esc = false;
                while (_pos < s.length && _depth > 0) {
                    var _ch = s.charAt(_pos);
                    if (_esc) { _esc = false; }
                    else if (_ch === '\\') { _esc = true; }
                    else if (_ch === '"') { _inStr = !_inStr; }
                    else if (!_inStr) {
                        if (_ch === _openCh) _depth++;
                        else if (_ch === _closeCh) _depth--;
                    }
                    _pos++;
                }
                if (_depth === 0) {
                    // 找到配对，删除整个 JSON 片段（包括后面的逗号和空白）
                    var _endPos = _pos;
                    while (_endPos < s.length && /[\s,]/.test(s.charAt(_endPos))) _endPos++;
                    s = s.slice(0, _fieldIdx) + s.slice(_endPos);
                    _searchPos = _fieldIdx;
                } else {
                    // 未找到配对，跳过这个字段名
                    _searchPos = _fieldIdx + 1;
                }
            }
        }

        // 移除孤立的 JSON 结尾残片（如 ", "choices":[]}）
        // 【P0 ReDoS 修复】原正则 [\s\S]*?(?:\]|\})\s*,?\s*$ 会在无配对符号时回溯整个文本
        // 新实现：从末尾向前扫描，找最后一个 ] 或 }，然后检查前面是否有 JSON 字段模式
        var _lastClose = Math.max(s.lastIndexOf(']'), s.lastIndexOf('}'));
        if (_lastClose !== -1 && _lastClose > 0) {
            // 从 _lastClose 向前找逗号或字段名
            var _checkStart = Math.max(0, _lastClose - 200); // 限制搜索范围
            var _prefix = s.substring(_checkStart, _lastClose);
            // 检查是否是 ", "fieldName":[ 或 ,"fieldName":{ 模式
            if (/,\s*\\?"[a-zA-Z_]+\\?"\s*:\s*[\[{"]/.test(_prefix)) {
                // 找到 JSON 残片，删除从逗号到末尾
                var _commaIdx = _prefix.lastIndexOf(',');
                if (_commaIdx !== -1) {
                    s = s.substring(0, _checkStart + _commaIdx) + s.substring(_lastClose + 1).replace(/^[\s,]*/, '');
                }
            }
        }
        // 移除转义的 JSON 引号残片
        s = s.replace(/\\+"/g, '"');
        return s;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = OutputSanitizer;
