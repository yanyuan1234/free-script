// ========================================
// 响应解析器
// 5 层解析兜底：直接 JSON、代码块、状态机、<mem> 标签、纯文本
// ========================================
const ResponseParser = {
    parse(rawReply, options) {
        options = options || {};
        const result = {
            success: false,
            data: (typeof AIOutputSchema !== 'undefined' && AIOutputSchema) ? AIOutputSchema.getDefaultOutput() : {},
            storyText: '',
            mems: [],
            warnings: [],
            truncated: false,
            fallbackLevel: -1
        };
        if (!rawReply || typeof rawReply !== 'string') {
            result.warnings.push('empty reply');
            return result;
        }


        // 推理模型（如 DeepSeek-R1、auto）在正式输出 JSON 前会输出大量思考块，
        // 形如 <think>...</think>、<reasoning>...</reasoning>、<thought>...</thought>、
        // 或 ◀thinking▶...◀/thinking▶ 等标记。若不剥离，思考块内的 { 会被 _tryRobustJSON
        // 误识别为 JSON 起点，导致解析失败；更糟糕的是整段思考过程会被当作 story 字段显示。
        // 必须在任何解析层之前先剥离思考块，再处理剩余的 JSON。
        const stripped = this._stripThinkingTokens(rawReply);
        const effectiveReply = (stripped !== rawReply) ? stripped : rawReply;
        if (stripped !== rawReply) {
            result.warnings.push('thinking tokens stripped');
        }

        // [T1-P1-7] Level -1: <json></json> 标签（酒馆助手 TokenSender 模式 + 文心/豆包等国产模型）
        // [ReDoS 修复] 用 findFirstPairedTag 替代 /<json>([\s\S]*?)<\/json>/i，
        // 避免未闭合 <json> 标签触发灾难性回溯；工具不可用时回退原始正则。
        var jsonTagContent = null;
        if (typeof findFirstPairedTag === 'function') {
            var _jsonTagHit = findFirstPairedTag(effectiveReply, ['json']);
            if (_jsonTagHit) jsonTagContent = _jsonTagHit.content;
        } else {
            var _jsonFallback = effectiveReply.match(/<json>([\s\S]*?)<\/json>/i);
            if (_jsonFallback) jsonTagContent = _jsonFallback[1];
        }
        if (jsonTagContent !== null) {
            const data2 = this._tryDirectJSON(jsonTagContent);
            if (data2) {
                result.success = true;
                result.data = (typeof AIOutputSchema !== 'undefined' && AIOutputSchema) ? AIOutputSchema.normalize(data2) : data2;
                result.fallbackLevel = -1;
                result.storyText = result.data.story;
                result.warnings.push('parsed from <json> tag');
                this._postExtractMems(result);
                return result;
            }
        }

        // Level 0: direct JSON（先尝试原始字符串，避免 sanitizeJSON 破坏 JSON 字符串字面量）
        let data = this._tryDirectJSON(effectiveReply);
        if (data) {
            result.success = true;
            result.data = (typeof AIOutputSchema !== 'undefined' && AIOutputSchema) ? AIOutputSchema.normalize(data) : data;
            result.fallbackLevel = 0;
            result.storyText = result.data.story;
            this._postExtractMems(result);
            return result;
        }

        // Level 1: code block JSON
        data = this._tryCodeBlockJSON(effectiveReply);
        if (data) {
            result.success = true;
            result.data = (typeof AIOutputSchema !== 'undefined' && AIOutputSchema) ? AIOutputSchema.normalize(data) : data;
            result.fallbackLevel = 1;
            result.storyText = result.data.story;
            result.warnings.push('parsed from code block');
            this._postExtractMems(result);
            return result;
        }

        // Level 2: 清理后 JSON + 状态机兜底
        const sanitized = (typeof OutputSanitizer !== 'undefined' && OutputSanitizer) ? OutputSanitizer.sanitizeJSON(effectiveReply) : effectiveReply;
        data = this._tryDirectJSON(sanitized);
        if (!data) {
            data = this._tryRobustJSON(sanitized);
        }
        if (data) {
            result.success = true;
            result.data = (typeof AIOutputSchema !== 'undefined' && AIOutputSchema) ? AIOutputSchema.normalize(data) : data;
            result.fallbackLevel = 2;
            result.storyText = result.data.story;
            result.warnings.push('parsed via robust JSON extraction');
            this._postExtractMems(result);
            return result;
        }

        // Level 3: <mem> tags (pure text mode)
        const memResult = this._tryMemTags(effectiveReply);
        if (memResult && memResult.storyText) {
            result.success = true;
            result.data = (typeof AIOutputSchema !== 'undefined' && AIOutputSchema) ? AIOutputSchema.normalize(memResult) : memResult;
            result.fallbackLevel = 3;
            result.storyText = memResult.storyText;
            result.mems = memResult.mems || [];
            result.warnings.push('parsed from <mem> tags');
            return result;
        }

        // 【方案C】Level 3.5: <state> 块解析（StateTagParser）
        // 纯文本模式下的主要状态提取方式，兼容 auto 路由模型等不支持 JSON Schema 的场景
        // 从故事末尾的 <state>...</state> 块提取角色/物品/任务等结构化数据
        if (typeof StateTagParser !== 'undefined' && StateTagParser.parse) {
            const stateResult = StateTagParser.parse(effectiveReply);
            if (stateResult.success) {
                result.success = true;
                result.data = stateResult.data;
                result.fallbackLevel = 3.5;
                result.storyText = stateResult.storyText;
                result.warnings.push('parsed from <state> block');
                return result;
            }
        }

        // Level 4: plain text fallback
        // 【NEW-008 修复】纯文本兜底不算"解析成功"，success=false 让上层走 legacy 提取路径
        // 否则 AIResponseMutator 会把空骨架当成功数据写入，tables 全空却 currentTurn 递增
        const plain = this._tryPlainText(effectiveReply);
        result.success = false;  // 纯文本不是结构化数据，标记失败
        result.data = (typeof AIOutputSchema !== 'undefined' && AIOutputSchema) ? AIOutputSchema.normalize(plain) : plain;
        result.fallbackLevel = 4;
        result.storyText = plain.storyText;
        result.warnings.push('parsed as plain text (no structured data)');
        return result;
    },


    // 背景：AI 会把 <mem> 标签嵌入 JSON story 字段值内（合法的字符串内容）。
    // Level 0/1/2 成功后直接返回，导致 mem 标签原文泄漏到 storyText，且结构化记忆丢失。
    // 本方法在返回前统一后处理：
    //   1) 清洗 storyText（剥离思维链、裸推理、HTML、JSON 残片等）
    //   2) 提取 mems，从 storyText 和 data.story 中剥离标签原文。
    _postExtractMems(result) {
        if (!result || !result.storyText || typeof result.storyText !== 'string') return;

        // BUG-A2 修复：模型可能把无标签思考过程直接写入 JSON 的 story 字段，
        // 必须在返回前统一清洗，避免泄漏到剧情 UI。
        if (typeof OutputSanitizer !== 'undefined' && OutputSanitizer.sanitizeStory) {
            var cleanedStory = OutputSanitizer.sanitizeStory(result.storyText);
            if (cleanedStory !== result.storyText) {
                result.storyText = cleanedStory;
                if (result.data && typeof result.data === 'object') {
                    result.data.story = cleanedStory;
                }
                result.warnings.push('story sanitized (thinking/artifacts removed)');
            }
        }

        if (result.storyText.indexOf('<mem') === -1) return;  // 快速路径：无 mem 标签
        const memResult = this._tryMemTags(result.storyText);
        if (memResult && memResult.mems && memResult.mems.length > 0) {
            result.mems = (result.mems || []).concat(memResult.mems);
            result.storyText = memResult.storyText;
            if (result.data && typeof result.data === 'object') {
                result.data.story = memResult.storyText;
            }
            result.warnings.push('mems extracted from story field');
        }
    },


    // 支持的思考标记格式（大小写不敏感）：
    //          DeepSeek-R1 系
    //   <reasoning>...</reasoning>  通用
    //   <thought>...</thought>      Anthropic Claude 系
    //   <thinking>...</thinking>    OpenAI o1 系
    //   <analysis>...</analysis>    部分模型
    // 处理策略：先剥离配对的思考块；若只有开标签没有闭标签（如思考过程末尾被截断），
    // 则保留开标签之后的内容（可能是 JSON），删除开标签及之前的全部思考文本。
    extractThinking(raw) {
        if (!raw || typeof raw !== 'string') return '';
        var tags = (typeof OutputSanitizer !== 'undefined' && OutputSanitizer && OutputSanitizer.THINKING_TAGS)
            ? OutputSanitizer.THINKING_TAGS.filter(function(t) { return t !== 'final' && t !== 'assistantfinal'; })
            : ['think', 'thinking', 'reasoning', 'thought', 'analysis', 'ECoT', 'cot', 'chain_of_thought', 'inner_thoughts', 'reflection'];
        var parts = [];
        for (var i = 0; i < tags.length; i++) {
            var tag = tags[i];
            var re = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '\\s*>', 'gi');
            var m;
            while ((m = re.exec(raw)) !== null) {
                parts.push(m[1].trim());
            }
        }
        // emoji 包围（非标签）
        // [ReDoS 修复] 用 scanMarkerPairs 替代 /💭([\s\S]*?)💭/g，避免未闭合标记触发灾难性回溯；
        // 工具不可用时回退原始正则。
        if (typeof scanMarkerPairs === 'function') {
            var _emojiMatches = scanMarkerPairs(raw, '💭', 'extract');
            for (var _ei = 0; _ei < _emojiMatches.length; _ei++) {
                parts.push(_emojiMatches[_ei].content.trim());
            }
        } else {
            var emojiRe = /💭([\s\S]*?)💭/g;
            var em;
            while ((em = emojiRe.exec(raw)) !== null) parts.push(em[1].trim());
        }
        if (parts.length === 0) return '';
        return parts.join('\n\n---\n\n');
    },
    _stripThinkingTokens(raw) {
        if (!raw || typeof raw !== 'string') return raw;
        var s = raw;
        // [T1-P1-9] fallback 改空数组（按报告建议），OutputSanitizer 未加载时不做 CoT 检测更安全
        var tags = (typeof OutputSanitizer !== 'undefined' && OutputSanitizer && OutputSanitizer.THINKING_TAGS) ? OutputSanitizer.THINKING_TAGS : []; // fallback 仅在 OutputSanitizer 未加载时使用
        if (typeof OutputSanitizer !== 'undefined' && OutputSanitizer.stripThinking) {
            s = OutputSanitizer.stripThinking(s);
        } else {
            // fallback：OutputSanitizer 不可用时用 tags 常量循环
            for (var i = 0; i < tags.length; i++) {
                var tag = tags[i];
                var pairRe = new RegExp('<' + tag + '\\b[^>]*>[\\s\\S]*?</' + tag + '\\s*>', 'gi');
                s = s.replace(pairRe, '');
            }
            // 💭 emoji 包围（非标签），fallback 时也需处理
            // [ReDoS 修复] 用 scanMarkerPairs 替代 /💭[\s\S]*?💭/g；工具不可用时回退原始正则。
            if (typeof scanMarkerPairs === 'function') {
                s = scanMarkerPairs(s, '💭', 'strip');
            } else {
                s = s.replace(/💭[\s\S]*?💭/g, '');
            }
        }

        // Step 1.5: 剥离无标签的裸推理前缀（如 "我需要考虑一下...\n\n{\"story\":\"...\"}")
        if (typeof OutputSanitizer !== 'undefined' && OutputSanitizer.stripBareThinking) {
            var strippedBare = OutputSanitizer.stripBareThinking(s);
            if (strippedBare !== s) {
                s = strippedBare;
            }
        }

        // Step 2: 检查是否有未匹配的开标签（思考末尾被 max_tokens 截断，无闭标签）
        var hasLoneOpenTag = false;
        for (var j = 0; j < tags.length; j++) {
            var t = tags[j];
            var openRe = new RegExp('<' + t + '\\b[^>]*>', 'i');
            if (openRe.test(s)) {
                hasLoneOpenTag = true;
                break;
            }
        }

        // Step 3: 若有截断思考块，定位实际 JSON 响应起点并删除之前的思考内容
        // 思考内容中的 JSON 片段（如 {"label":"魔力"}）不含 story/title 等已知字段，
        // 通过已知字段定位真正的 JSON 响应，避免误取思考片段
        if (hasLoneOpenTag) {
            var jsonStartPatterns = [
                /\{\s*"story"/i,
                /\{\s*"title"/i,
                /\{\s*"player"/i,
                /\{\s*"choices"/i,
                /\{\s*"characters"/i,
                /\{\s*"bag"/i,
                /\{\s*"quests"/i,
                /\{\s*"gameTime"/i,
                /\{\s*"narrative"/i,
                /\{\s*"content"/i,
                /\{\s*"storyText"/i,
                /\{\s*"scene"/i
            ];
            var jsonStartIdx = -1;
            for (var k = 0; k < jsonStartPatterns.length; k++) {
                var m = s.match(jsonStartPatterns[k]);
                if (m && m.index !== undefined) {
                    if (jsonStartIdx === -1 || m.index < jsonStartIdx) {
                        jsonStartIdx = m.index;
                    }
                }
            }

            if (jsonStartIdx > 0) {
                // 找到 JSON 起点：删除之前的全部思考内容（含未匹配开标签）
                s = s.slice(jsonStartIdx);
            } else if (jsonStartIdx === -1) {
                // 没找到已知字段：尝试保留从第一个 { 开始的内容
                var firstBrace = s.indexOf('{');
                if (firstBrace > 0) {
                    s = s.slice(firstBrace);
                }
                // 如果连 { 都没有，保留原文让 _tryPlainText 兜底
            }
        }

        // Step 4: 清理 JSON 之前 preamble 中的残留标签
        // 只清理第一个 { 之前的内容，保护 JSON 字符串值中的合法标签文本
        var firstBraceFinal = s.indexOf('{');
        if (firstBraceFinal > 0) {
            var preamble = s.slice(0, firstBraceFinal);
            var jsonPart = s.slice(firstBraceFinal);
            for (var n = 0; n < tags.length; n++) {
                var tn = tags[n];
                preamble = preamble.replace(new RegExp('<' + tn + '\\b[^>]*>', 'gi'), '');
                preamble = preamble.replace(new RegExp('</' + tn + '\\s*>', 'gi'), '');
            }
            s = preamble + jsonPart;
        } else if (firstBraceFinal === -1) {
            // 没有 JSON，清理全部残留标签
            for (var p = 0; p < tags.length; p++) {
                var tp = tags[p];
                s = s.replace(new RegExp('<' + tp + '\\b[^>]*>', 'gi'), '');
                s = s.replace(new RegExp('</' + tp + '\\s*>', 'gi'), '');
            }
        }

        return s;
    },

    _tryDirectJSON(raw) {
        if (!raw || typeof raw !== 'string') return null;
        try {
            const s = raw.trim();
            let r = JSON.parse(s);
            if (typeof r === 'string' && r.trim().startsWith('{')) {
                const r2 = JSON.parse(r);
                if (r2 && typeof r2 === 'object') r = r2;
            }
            if (r && typeof r === 'object') return r;
        } catch (e) {}
        // P0 修复 R3：尾逗号/多逗号修复（原版 safeJSONParse 已有，新版拆分时丢失）
        // AI 输出 {"a":1,} 或 [1,2,,3] 时，JSON.parse 会失败，这里修复后重试
        // 注意：不在此处替换控制字符（会破坏 story 内换行），由 _escapeControlCharsInStrings 专门处理
        try {
            const s = raw.trim();
            let fx = s
                .replace(/,(\s*[}\]])/g, '$1')                // 尾逗号
                .replace(/,(\s*,)+/g, ',')                    // 多逗号压成单逗号
                .replace(/\[\s*,+/g, '[')                     // 数组开头多逗号
                .replace(/,\s*\]/g, ']');                     // 数组结尾多逗号
            const r = JSON.parse(fx);
            if (r && typeof r === 'object') return r;
        } catch (e2) {}
        return null;
    },

    _tryCodeBlockJSON(raw) {
        if (!raw || typeof raw !== 'string') return null;
        // [T1-P1-6] 支持多种 fence 标签：json / JSON / js / javascript / object / output / 纯 ```（Gemini 2.5+ 主流输出格式）
        // [ReDoS 修复] 用 indexOf 线性扫描替代 /```(?:json|...)?\s*\n?([\s\S]*?)\n?```/i 中的 [\s\S]*?，
        // 避免未闭合代码块触发灾难性回溯。原正则等价于：找最早出现的 ```（可选 lang 标签），
        // 跳过开 fence 后的空白，找下一个 ```，提取中间内容（去掉末尾一个可选 \n）。
        // 用小写副本做 indexOf 实现大小写不敏感（原正则带 i 标志），ASCII 位置保持不变。
        var rawLower = raw.toLowerCase();
        // 注意顺序：长 fence 在前，避免 ```js 误匹配 ```json 的前缀（同位置时取首个=更具体的）
        var fences = ['```json', '```javascript', '```object', '```output', '```js', '```'];
        var fenceStart = -1;
        var contentStart = -1;
        for (var fi = 0; fi < fences.length; fi++) {
            var idx = rawLower.indexOf(fences[fi]);
            if (idx !== -1 && (fenceStart === -1 || idx < fenceStart)) {
                fenceStart = idx;
                contentStart = idx + fences[fi].length;
            }
        }
        if (fenceStart === -1) return null;
        // 跳过开 fence 后的所有空白（原正则 \s*\n? 等价于 \s*，因 \s* 已贪婪包含 \n）
        var cs = contentStart;
        while (cs < raw.length) {
            var chc = raw.charCodeAt(cs);
            if (chc === 32 || chc === 9 || chc === 10 || chc === 13) cs++;
            else break;
        }
        // 找闭合 ```（从 cs 开始搜索，cs 已越过开 fence，不会匹配到开 fence 本身）
        var closeIdx = raw.indexOf('```', cs);
        if (closeIdx === -1 || closeIdx < cs) return null;
        var content = raw.slice(cs, closeIdx);
        // 原正则 \n?```：内容后跟可选 \n 然后 ```，等价于去掉内容末尾的一个 \n
        if (content.length > 0 && content.charCodeAt(content.length - 1) === 10) {
            content = content.slice(0, -1);
        }
        return this._tryDirectJSON(content);
    },

    _tryRobustJSON(raw) {
        if (!raw || typeof raw !== 'string') return null;
        const firstBrace = raw.indexOf('{');
        if (firstBrace === -1) return null;
        const lastBrace = raw.lastIndexOf('}');

        // 【截断修复】当 JSON 被截断（没有闭合 }）时，尝试智能补全
        if (lastBrace === -1 || lastBrace < firstBrace) {
            const repaired = this._repairTruncatedJSON(raw, firstBrace);
            if (repaired) {
                console.log('[ResponseParser] JSON 截断修复成功，补全了闭合符号');
                return repaired;
            }
            return null;
        }


        let candidate = raw.slice(firstBrace, lastBrace + 1);
        let r = this._tryDirectJSON(candidate);
        if (r) return r;

        // 回退1：用括号匹配找第一个完整 JSON 对象
        let end = this._findMatching(raw, '{', '}', firstBrace);
        if (end !== -1 && end !== lastBrace) {
            candidate = raw.slice(firstBrace, end + 1);
            r = this._tryDirectJSON(candidate);
            if (r) return r;
        }


        // 必须在回退2之前执行：否则回退2会从 JSON 中间提取完整子对象（如 choices[0]），
        // 其 .text 被误当作 storyText 返回，丢失真正的 story 内容
        const repaired = this._repairTruncatedJSON(raw, firstBrace);
        if (repaired) {
            console.log('[ResponseParser] JSON 截断修复成功（保留顶层字段）');
            return repaired;
        }

        // 回退2：从后续 { 开始尝试，限制最多 5 次以防 O(n²)
        let fb = raw.indexOf('{', firstBrace + 1);
        let attempts = 0;
        while (fb !== -1 && attempts < 5) {
            end = this._findMatching(raw, '{', '}', fb);
            if (end !== -1) {
                candidate = raw.slice(fb, end + 1);
                r = this._tryDirectJSON(candidate);
                if (r) return r;
            }
            fb = raw.indexOf('{', fb + 1);
            attempts++;
        }

        // P0 修复 R2：所有整体 JSON.parse 失败后，用 extract* 逐字段状态机抢救
        // 原版 robustParse 在 JSON 整体失败时调用 extractStr/Arr/Obj/ObjArr 逐字段提取，
        // 新版拆分时此能力丢失（extract* 变成死代码）。这里接回主流程。
        // 场景：choices 数组缺 ]、bag 内对象缺逗号、story 字段被截断但其他字段完整
        const rescued = this._extractFieldsFromRaw(raw);
        if (rescued) {
            console.log('[ResponseParser] robust 逐字段提取成功，挽救了部分结构化数据');
            return rescued;
        }

        return null;
    },

    // 逐字段从原始文本提取结构化数据（原版 robustParse 等价能力恢复）
    // 当整体 JSON.parse 失败时，逐字段用状态机/正则提取 story/choices/player/characters/bag 等
    _extractFieldsFromRaw(raw) {
        if (!raw || typeof raw !== 'string') return null;
        const r = {};
        let hasAny = false;

        // story 字段（字符串，最重要的字段）
        const story = this.extractStr(raw, 'story', '');
        if (story) { r.story = story; hasAny = true; }

        // title 字段
        const title = this.extractStr(raw, 'title', '');
        if (title) { r.title = title; hasAny = true; }

        // contextSummary 字段
        const ctxSum = this.extractStr(raw, 'contextSummary', '');
        if (ctxSum) { r.contextSummary = ctxSum; hasAny = true; }

        // player 对象
        const player = this.extractObj(raw, 'player', null);
        if (player && typeof player === 'object') { r.player = player; hasAny = true; }

        // gameTime 对象
        const gameTime = this.extractObj(raw, 'gameTime', null);
        if (gameTime && typeof gameTime === 'object') { r.gameTime = gameTime; hasAny = true; }

        // hud 对象
        const hud = this.extractObj(raw, 'hud', null);
        if (hud && typeof hud === 'object') { r.hud = hud; hasAny = true; }

        // 字符串数组字段：choices / characters / bag / quests / relationships / locations / world / npcMessages / memoryUpdates / keyEvents
        const arrFields = ['choices', 'characters', 'bag', 'quests', 'relationships',
                           'locations', 'world', 'npcMessages', 'memoryUpdates', 'keyEvents'];
        for (let i = 0; i < arrFields.length; i++) {
            const key = arrFields[i];
            // choices/characters/bag/quests 等是对象数组，用 extractObjArr
            // keyEvents 是字符串数组，用 extractArr
            if (key === 'keyEvents') {
                const arr = this.extractArr(raw, key, []);
                if (arr && arr.length > 0) { r[key] = arr; hasAny = true; }
            } else {
                const arr = this.extractObjArr(raw, key, []);
                if (arr && arr.length > 0) { r[key] = arr; hasAny = true; }
            }
        }

        // currency（数字）单独处理
        const curMatch = raw.match(/"currency"\s*:\s*(-?\d+(?:\.\d+)?)/);
        if (curMatch) { r.currency = Number(curMatch[1]); hasAny = true; }

        // currencyName（字符串）
        const curName = this.extractStr(raw, 'currencyName', '');
        if (curName) { r.currencyName = curName; hasAny = true; }

        return hasAny ? r : null;
    },


    // 当 AI 输出因 max_tokens 不足被截断时，JSON 缺少闭合的 } 和 ]
    // 本方法通过状态机扫描，统计未闭合的层级，在末尾补全
    _repairTruncatedJSON(raw, startIdx) {
        if (!raw || typeof raw !== 'string') return null;
        const start = startIdx != null ? startIdx : raw.indexOf('{');
        if (start === -1) return null;

        let depth = 0;           // {} 层级
        let bracketDepth = 0;    // [] 层级
        let inString = false;
        let escape = false;

        // 用于截断时回退到保留最多顶层字段（story/choices 等）的完整前缀
        const topLevelCommas = [];

        for (let i = start; i < raw.length; i++) {
            const ch = raw[i];
            if (inString) {
                if (escape) { escape = false; }
                else if (ch === '\\') { escape = true; }
                else if (ch === '"') { inString = false; }
                continue;
            }
            if (ch === '"') { inString = true; continue; }
            if (ch === '{') { depth++; continue; }
            if (ch === '}') { depth--; continue; }
            if (ch === '[') { bracketDepth++; continue; }
            if (ch === ']') { bracketDepth--; continue; }
            if (ch === ',' && depth === 1 && bracketDepth === 0) {
                topLevelCommas.push(i);
            }
        }

        // 如果深度为 0 且 bracketDepth 为 0，说明 JSON 完整，不需要修复
        if (depth === 0 && bracketDepth === 0) return null;

        // 策略1：直接补全（保留全部内容，补全引号和闭合符号）
        let candidate = raw.slice(start);
        if (inString) candidate += '"';
        for (let i = 0; i < bracketDepth; i++) candidate += ']';
        for (let i = 0; i < depth; i++) candidate += '}';
        let result = this._tryDirectJSON(candidate);
        if (result) {
            result._truncatedRepaired = true;
            return result;
        }

        // 策略1b：策略1失败时，转义字符串内的原始控制字符
        // AI 常在 story 字段输出裸换行(\n)而非转义(\\n)，导致 JSON.parse 失败
        // 逐字符扫描，仅在字符串内部转义控制字符，保留 JSON 结构字符不变
        // 注意：不依赖 inString 守卫——即使截断发生在字段名位置，已完整输出的 story
        // 字段也可能含裸换行导致策略1失败，需要转义重试
        var sanitized1b = this._escapeControlCharsInStrings(candidate);
        if (sanitized1b !== candidate) {
            result = this._tryDirectJSON(sanitized1b);
            if (result) {
                result._truncatedRepaired = true;
                console.log('[ResponseParser] JSON 截断修复成功（转义字符串内控制字符）');
                return result;
            }
        }

        // 策略2【修复 BUG-B】：从最后一个顶层逗号开始往前逐个回退截断
        // 每个截断点丢弃该逗号后的不完整顶层字段，保留前面已完整的顶层字段
        // （如 story/title/choices），优先保留含 story 的最大前缀
        for (let j = topLevelCommas.length - 1; j >= 0; j--) {
            const cutPos = topLevelCommas[j];
            candidate = raw.slice(start, cutPos) + '}';
            result = this._tryDirectJSON(candidate);
            if (!result) {
                // 转义字符串内裸控制字符后重试
                var sanitized2 = this._escapeControlCharsInStrings(candidate);
                if (sanitized2 !== candidate) result = this._tryDirectJSON(sanitized2);
            }
            if (result) {
                result._truncatedRepaired = true;
                return result;
            }
        }

        // 策略3：截到最后一个逗号/完整值后再补全（处理更深层截断）
        let trimPos = candidate.lastIndexOf(',');
        if (trimPos > start) {
            candidate = candidate.slice(0, trimPos);
            if (inString) candidate += '"';
            for (let i = 0; i < bracketDepth; i++) candidate += ']';
            for (let i = 0; i < depth; i++) candidate += '}';
            let result2 = this._tryDirectJSON(candidate);
            if (!result2) {
                var sanitized3 = this._escapeControlCharsInStrings(candidate);
                if (sanitized3 !== candidate) result2 = this._tryDirectJSON(sanitized3);
            }
            if (result2) {
                result2._truncatedRepaired = true;
                return result2;
            }
        }

        return null;
    },

    _tryMemTags(raw) {
        if (!raw || typeof raw !== 'string') return null;
        const mems = [];

        // 内部工具：从标签字符串解析属性（保留原 attrRegex，不含 [\s\S]*? 无 ReDoS 风险）
        function _parseMemAttrs(tagStr) {
            const attrs = {};
            const attrRegex = /(\w+)\s*=\s*"([^"]*)"/g;
            let m;
            while ((m = attrRegex.exec(tagStr)) !== null) {
                attrs[m[1]] = m[2];
            }
            return attrs;
        }

        // 内部工具：构造 mem 对象（字段顺序与原实现一致）
        function _makeMem(tagStr, inner) {
            const attrs = _parseMemAttrs(tagStr);
            const content = (inner || '').replace(/<[^>]+>/g, '').trim();
            return {
                type: attrs.type || '',
                action: attrs.action || '',
                name: attrs.name || '',
                qty: attrs.qty || '',
                content: content,
                field: attrs.field || '',
                value: attrs.value || '',
                day: attrs.day || '',
                period: attrs.period || ''
            };
        }

        // Fallback: extractPairedTags 不可用时回退原始正则（含 [\s\S]*?）
        if (typeof extractPairedTags !== 'function') {
            var fallbackStory = raw.replace(/<mem\b[^>]*?(?:>([\s\S]*?)<\/mem>|\/>)/gi, function(tag, inner) {
                mems.push(_makeMem(tag, inner));
                return '';
            }).trim();
            if (mems.length === 0) return null;
            if (!fallbackStory) return null;
            return { storyText: fallbackStory, mems: mems };
        }

        // [ReDoS 修复] 主路径：用 extractPairedTags + 自闭合线性扫描替代原始正则。
        // 原正则 /<mem\b[^>]*?(?:>([\s\S]*?)<\/mem>|\/>)/gi 同时处理配对和自闭合两种情况。
        // extractPairedTags 只处理配对标签，且无法正确处理"自闭合 + 后续配对"的混合场景
        // （会把自闭合开标签错误地与后续 </mem> 配对）。
        // 解决方案：先线性扫描自闭合标签并在临时文本中替换为空格（保持位置不变），
        // 再用 extractPairedTags 在临时文本上找配对标签，最后合并移除区间。
        // 大小写不敏感：原正则带 gi 标志，这里用 rawLower 做 indexOf。
        var rawLower = raw.toLowerCase();
        var len = raw.length;

        // Step 1: 线性扫描所有 <mem 标签，识别自闭合 <mem .../>
        var selfClosingRanges = [];  // [{start, end, mem}]
        var tmpArr = raw.split('');  // 用于构造临时文本（自闭合位置替换为空格）
        var pos = 0;

        while (pos < len) {
            var ltIdx = rawLower.indexOf('<mem', pos);
            if (ltIdx === -1) break;

            // \b 边界检查：<mem 后不能跟字母/数字/下划线（等价于 \b）
            var afterMem = ltIdx + 4;
            if (afterMem < len) {
                var cc = raw.charCodeAt(afterMem);
                var isWordChar = (cc >= 97 && cc <= 122) || (cc >= 65 && cc <= 90) || (cc >= 48 && cc <= 57) || cc === 95;
                if (isWordChar) {
                    pos = ltIdx + 4;
                    continue;
                }
            }

            // 找 '>' 结束开标签
            var gtIdx = raw.indexOf('>', ltIdx);
            if (gtIdx === -1) break;

            // 检查 '>' 之前是否有 '/'（允许中间有空白），判断是否自闭合
            var isSelfClosing = false;
            for (var k = gtIdx - 1; k > ltIdx + 3; k--) {
                var c = raw.charCodeAt(k);
                if (c === 32 || c === 9 || c === 10 || c === 13) continue;  // 跳过空白
                if (c === 47) isSelfClosing = true;  // '/'
                break;
            }

            if (isSelfClosing) {
                var tagStr = raw.slice(ltIdx, gtIdx + 1);
                selfClosingRanges.push({
                    start: ltIdx,
                    end: gtIdx + 1,
                    mem: _makeMem(tagStr, '')
                });
                // 在临时文本中用空格替换（保持索引一致，让 extractPairedTags 跳过此处）
                for (var s = ltIdx; s <= gtIdx; s++) tmpArr[s] = ' ';
                pos = gtIdx + 1;
            } else {
                // 配对标签：交给 extractPairedTags 处理，这里仅跳过开标签
                pos = gtIdx + 1;
            }
        }

        var tmpText = tmpArr.join('');

        // Step 2: 在临时文本上用 extractPairedTags 查找配对 <mem>...</mem>
        var pairedMatches = extractPairedTags(tmpText, ['mem']);

        // Step 3: 合并所有要移除的区间
        var removals = [];
        for (var i = 0; i < selfClosingRanges.length; i++) {
            removals.push(selfClosingRanges[i]);
        }
        for (var j = 0; j < pairedMatches.length; j++) {
            var pm = pairedMatches[j];
            removals.push({
                start: pm.index,
                end: pm.index + pm.fullMatch.length,
                mem: _makeMem(pm.fullMatch, pm.content)
            });
        }

        // Step 4: 按起点排序，去重叠，拼接 story
        removals.sort(function(a, b) { return a.start - b.start; });
        var storyParts = [];
        var cur = 0;
        for (var r = 0; r < removals.length; r++) {
            var rm = removals[r];
            if (rm.start < cur) continue;  // 跳过重叠区间
            storyParts.push(raw.slice(cur, rm.start));
            mems.push(rm.mem);
            cur = rm.end;
        }
        storyParts.push(raw.slice(cur));
        var story = storyParts.join('').trim();

        if (mems.length === 0) return null;
        if (!story) return null;
        return { storyText: story, mems: mems };
    },

    _tryPlainText(raw) {
        if (!raw || typeof raw !== 'string') return { storyText: '' };
        const cleaned = (typeof OutputSanitizer !== 'undefined' && OutputSanitizer) ? OutputSanitizer.sanitizeStory(raw) : raw;
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        let data = null;
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed && typeof parsed === 'object') data = parsed;
            } catch (e) {}
        }
        // 【截断修复】如果没有匹配到完整 JSON（无闭合}），尝试截断修复
        if (!data) {
            const firstBrace = cleaned.indexOf('{');
            if (firstBrace !== -1) {
                const repaired = this._repairTruncatedJSON(cleaned, firstBrace);
                if (repaired) {
                    console.log('[ResponseParser] 纯文本模式截断修复成功');
                    data = repaired;
                }
            }
        }
        if (data) {
            let story = data.story || '';
            // 从 cleaned 中移除 JSON 部分，剩余作为 story
            if (!story) {
                const jsonStart = cleaned.indexOf('{');
                const jsonEnd = cleaned.lastIndexOf('}');
                if (jsonStart !== -1) {
                    story = (cleaned.slice(0, jsonStart) + cleaned.slice(jsonEnd + 1)).trim();
                    story = (typeof OutputSanitizer !== 'undefined' && OutputSanitizer) ? OutputSanitizer.sanitizeStory(story) : story;
                }
            }
            data.story = story || '';
            return data;
        }
        return { storyText: cleaned };
    },


    // 转义 JSON 字符串值内的裸控制字符
    // AI 输出的 story 字段常含裸 \n \r \t（实际换行而非转义序列），JSON.parse 拒绝
    // 本方法逐字符扫描，仅在字符串内部将控制字符转为转义序列，不影响 JSON 结构
    _escapeControlCharsInStrings(str) {
        if (!str || typeof str !== 'string') return str;
        var result = '';
        var inStr = false;
        var escape = false;
        for (var i = 0; i < str.length; i++) {
            var ch = str[i];
            if (escape) {
                result += ch;
                escape = false;
                continue;
            }
            if (inStr) {
                if (ch === '\\') { result += ch; escape = true; continue; }
                if (ch === '"') { result += ch; inStr = false; continue; }
                if (ch === '\n') { result += '\\n'; continue; }
                if (ch === '\r') { result += '\\r'; continue; }
                if (ch === '\t') { result += '\\t'; continue; }
                result += ch;
            } else {
                if (ch === '"') { inStr = true; }
                result += ch;
            }
        }
        return result;
    },

    _findMatching(str, open, close, start) {
        let depth = 0;
        let inString = false;
        let escape = false;
        for (let i = start; i < str.length; i++) {
            const ch = str[i];
            if (inString) {
                if (escape) { escape = false; }
                else if (ch === '\\') { escape = true; }
                else if (ch === '"') { inString = false; }
            } else {
                if (ch === '"') { inString = true; }
                else if (ch === open) { depth++; }
                else if (ch === close) { depth--; }
                if (depth === 0) return i;
            }
        }
        return -1;
    },

    // [T2-P1-6] JSON 损坏时逐字段状态机恢复（4 个 extract 工具）
    // 当整体 JSON.parse 失败时（如 choices 数组格式错乱、bag 缺闭合 ]），
    // 仍可用这 4 个工具从损坏字符串中按 key 抽取字段，补全 result.data。
    // 状态机不依赖完整 JSON 解析，对单字段容忍度高（被截断/多/少逗号/字符串值含特殊字符）。
    //
    // extractStr: 提取字符串字段
    //   - 匹配 "key": "..." （转义 \\" 处理）
    //   - 返回字符串值或默认值
    // extractArr: 提取数组字段
    //   - 匹配 "key": [ ... ] （用 _findMatching 找配对 ]）
    //   - 返回数组或默认值
    // extractObj: 提取对象字段
    //   - 匹配 "key": { ... } （用 _findMatching 找配对 }）
    //   - 尝试 JSON.parse 嵌套对象，失败回退到默认值
    // extractObjArr: 提取对象数组
    //   - 匹配 "key": [ {...}, {...} ]
    //   - 用 _findMatching 找顶层 [ ]，然后迭代每个 {...} 配对
    //   - 每个对象尝试 JSON.parse 解析，失败跳过
    extractStr(raw, key, defaultVal) {
        if (!raw || typeof raw !== 'string' || !key) return defaultVal !== undefined ? defaultVal : '';
        const re = new RegExp('"' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s*:\\s*"', 'i');
        const m = raw.match(re);
        if (!m) return defaultVal !== undefined ? defaultVal : '';
        const startIdx = m.index + m[0].length;
        let end = -1;
        let escape = false;
        for (let i = startIdx; i < raw.length; i++) {
            const ch = raw[i];
            if (escape) { escape = false; continue; }
            if (ch === '\\') { escape = true; continue; }
            if (ch === '"') { end = i; break; }
        }
        if (end === -1) return defaultVal !== undefined ? defaultVal : '';
        let val = raw.slice(startIdx, end);
        // 还原常见转义
        val = val.replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
        return val;
    },

    extractArr(raw, key, defaultVal) {
        if (!raw || typeof raw !== 'string' || !key) return defaultVal !== undefined ? defaultVal : [];
        const re = new RegExp('"' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s*:\\s*\\[', 'i');
        const m = raw.match(re);
        if (!m) return defaultVal !== undefined ? defaultVal : [];
        const startIdx = m.index + m[0].length;
        // P0 修复 R2 配套：_findMatching 的 start 参数应指向 open 字符位置
        // 原 startIdx 是 [ 之后位置，导致 _findMatching 立即返回（depth=0）
        // 修正为 startIdx - 1（即 [ 的位置）
        const end = this._findMatching(raw, '[', ']', startIdx - 1);
        if (end === -1) return defaultVal !== undefined ? defaultVal : [];
        const arrStr = raw.slice(startIdx - 1, end + 1);
        try {
            const parsed = JSON.parse(arrStr);
            return Array.isArray(parsed) ? parsed : (defaultVal !== undefined ? defaultVal : []);
        } catch (e) {
            return defaultVal !== undefined ? defaultVal : [];
        }
    },

    extractObj(raw, key, defaultVal) {
        if (!raw || typeof raw !== 'string' || !key) return defaultVal !== undefined ? defaultVal : {};
        const re = new RegExp('"' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s*:\\s*\\{', 'i');
        const m = raw.match(re);
        if (!m) return defaultVal !== undefined ? defaultVal : {};
        const startIdx = m.index + m[0].length;
        // P0 修复 R2 配套：同 extractArr，start 指向 open 字符位置
        const end = this._findMatching(raw, '{', '}', startIdx - 1);
        if (end === -1) return defaultVal !== undefined ? defaultVal : {};
        const objStr = raw.slice(startIdx - 1, end + 1);
        try {
            const parsed = JSON.parse(objStr);
            return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : (defaultVal !== undefined ? defaultVal : {});
        } catch (e) {
            return defaultVal !== undefined ? defaultVal : {};
        }
    },

    extractObjArr(raw, key, defaultVal) {
        if (!raw || typeof raw !== 'string' || !key) return defaultVal !== undefined ? defaultVal : [];
        const re = new RegExp('"' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s*:\\s*\\[', 'i');
        const m = raw.match(re);
        if (!m) return defaultVal !== undefined ? defaultVal : [];
        const startIdx = m.index + m[0].length;
        // P0 修复 R2 配套：同 extractArr，start 指向 open 字符位置
        const end = this._findMatching(raw, '[', ']', startIdx - 1);
        if (end === -1) return defaultVal !== undefined ? defaultVal : [];
        // 在 [ ... ] 区间内扫描每个 { ... } 配对
        const inner = raw.slice(startIdx, end);
        const out = [];
        let searchFrom = 0;
        while (searchFrom < inner.length) {
            const objStart = inner.indexOf('{', searchFrom);
            if (objStart === -1) break;
            const objEnd = this._findMatching(inner, '{', '}', objStart);
            if (objEnd === -1) break;
            const objStr = inner.slice(objStart, objEnd + 1);
            try {
                const parsed = JSON.parse(objStr);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    out.push(parsed);
                }
            } catch (e) {
                // 单个对象解析失败：跳过，继续下一个
            }
            searchFrom = objEnd + 1;
        }
        return out;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = ResponseParser;
