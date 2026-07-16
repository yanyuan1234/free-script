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
        const jsonTagMatch = effectiveReply.match(/<json>([\s\S]*?)<\/json>/i);
        if (jsonTagMatch) {
            const data2 = this._tryDirectJSON(jsonTagMatch[1]);
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

        // Level 4: plain text fallback
        const plain = this._tryPlainText(effectiveReply);
        result.success = !!plain.storyText;
        result.data = (typeof AIOutputSchema !== 'undefined' && AIOutputSchema) ? AIOutputSchema.normalize(plain) : plain;
        result.fallbackLevel = 4;
        result.storyText = plain.storyText;
        result.warnings.push('parsed as plain text');
        return result;
    },


    // 背景：AI 会把 <mem> 标签嵌入 JSON story 字段值内（合法的字符串内容）。
    // Level 0/1/2 成功后直接返回，导致 mem 标签原文泄漏到 storyText，且结构化记忆丢失。
    // 本方法在返回前统一后处理：提取 mems，从 storyText 和 data.story 中剥离标签原文。
    _postExtractMems(result) {
        if (!result || !result.storyText || typeof result.storyText !== 'string') return;
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
            s = s.replace(/💭[\s\S]*?💭/g, '');
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
        const m = raw.match(/```(?:json|JSON|js|javascript|object|output)?\s*\n?([\s\S]*?)\n?```/i);
        if (m) return this._tryDirectJSON(m[1]);
        return null;
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
        const story = raw.replace(/<mem\b[^>]*?(?:>([\s\S]*?)<\/mem>|\/>)/gi, function(tag, inner) {

            // prompt 指示 AI 使用 field/value/day/period 等属性，旧代码全部丢弃
            const attrs = {};
            const attrRegex = /(\w+)\s*=\s*"([^"]*)"/g;
            let m;
            while ((m = attrRegex.exec(tag)) !== null) {
                attrs[m[1]] = m[2];
            }
            const content = (inner || '').replace(/<[^>]+>/g, '').trim();
            mems.push({
                type: attrs.type || '',
                action: attrs.action || '',
                name: attrs.name || '',
                qty: attrs.qty || '',
                content: content,
                field: attrs.field || '',
                value: attrs.value || '',
                day: attrs.day || '',
                period: attrs.period || ''
            });
            return '';
        }).trim();
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
