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
        /^用户现在需要/,
        /^玩家现在需要/,
        /^首先得/,
        /^首先[^。]*(?:设定|设计|安排|规划)/,
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
        /^然后心声/,
        /^然后系统/,
        /^然后剧情/,
        /^然后场景/,
        /^主角.*设定/,
        /^属性.*设定/,
        /^NPC.*设定/,
        /^任务.*设定/,
        /^时间.*设定/
    ],
    sanitizeStory(text) {
        if (!text || typeof text !== 'string') return '';
        let s = text;
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

    // 剥离裸思考文本（无标签包裹的思考过程）
    // 仅当文本以多段元话语开头时才剥离，避免误删正常剧情
    stripBareThinking(text) {
        if (!text || typeof text !== 'string') return '';
        // 按换行分段（模型常把设计思路用单换行连接，不能只按双换行）
        const paras = text.split(/\n+/);
        if (paras.length === 0) return text;

        // 强信号模式：只要文本以这些开头，极大概率是模型把设计思路写进了 story
        const STRONG_THINKING_PATTERNS = [
            /^用户现在需要/, /^玩家现在需要/,
            /^首先得/, /^首先[^。]*(?:设定|设计|安排|规划)/,
            /^然后NPC/, /^然后[^。]*的话/, /^然后开局/,
            /^然后choices/, /^然后world/, /^然后keyEvents/,
            /^然后player/, /^然后bag/, /^然后quests/, /^然后gameTime/,
            /^然后心声/, /^然后系统/, /^然后剧情/, /^然后场景/,
            /^主角.*设定/, /^属性.*设定/, /^NPC.*设定/, /^任务.*设定/, /^时间.*设定/
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

        // 标签支持属性（\b[^>]*），如 <think type="x">。
        var s = text;
        for (var i = 0; i < THINKING_TAGS.length; i++) {
            var tag = THINKING_TAGS[i];
            var re = new RegExp('<' + tag + '\\b[^>]*>[\\s\\S]*?</' + tag + '\\s*>', 'gi');
            s = s.replace(re, '');
        }
        // 💭 是 emoji 包围（非标签），单独处理
        return s.replace(/💭[\s\S]*?💭/g, '');
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
        // 匹配 "字段名": 后跟 [ 或 { 的 JSON 结构残片（非剧情对话内容）
        s = s.replace(/\\?"(?:choices|characters|player|bag|currency|currencyName|quests|gameTime|keyEvents|world|locations|relationships|hud|contextSummary|title|npcMessages|memoryUpdates)\\?"\s*:\s*[\[{][\s\S]*?(?:\]|\})\s*,?/gi, '');
        // 移除孤立的 JSON 结尾残片（如 ", "choices":[]}）

        // 改为非贪婪匹配，且仅当后面紧跟 ] 或 } 闭合符号时才删除（确认是 JSON 残片而非剧情对话）
        s = s.replace(/,\s*\\?"[a-zA-Z_]+\\?"\s*:\s*[\[{"][\s\S]*?(?:\]|\})\s*,?\s*$/gi, '');
        // 移除转义的 JSON 引号残片
        s = s.replace(/\\+"/g, '"');
        return s;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = OutputSanitizer;
