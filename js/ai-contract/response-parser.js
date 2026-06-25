// ========================================
// 响应解析器
// 5 层解析兜底：直接 JSON、代码块、状态机、<mem> 标签、纯文本
// ========================================
const ResponseParser = {
    parse(rawReply, options) {
        options = options || {};
        const result = {
            success: false,
            data: AIOutputSchema ? AIOutputSchema.getDefaultOutput() : {},
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

        // 【P0修复BUG-003】剥离推理模型思考过程（thinking tokens）
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

        // Level 0: direct JSON（先尝试原始字符串，避免 sanitizeJSON 破坏 JSON 字符串字面量）
        let data = this._tryDirectJSON(effectiveReply);
        if (data) {
            result.success = true;
            result.data = AIOutputSchema ? AIOutputSchema.normalize(data) : data;
            result.fallbackLevel = 0;
            result.storyText = result.data.story;
            return result;
        }

        // Level 1: code block JSON
        data = this._tryCodeBlockJSON(effectiveReply);
        if (data) {
            result.success = true;
            result.data = AIOutputSchema ? AIOutputSchema.normalize(data) : data;
            result.fallbackLevel = 1;
            result.storyText = result.data.story;
            result.warnings.push('parsed from code block');
            return result;
        }

        // Level 2: 清理后 JSON + 状态机兜底
        const sanitized = OutputSanitizer ? OutputSanitizer.sanitizeJSON(effectiveReply) : effectiveReply;
        data = this._tryDirectJSON(sanitized);
        if (!data) {
            data = this._tryRobustJSON(sanitized);
        }
        if (data) {
            result.success = true;
            result.data = AIOutputSchema ? AIOutputSchema.normalize(data) : data;
            result.fallbackLevel = 2;
            result.storyText = result.data.story;
            result.warnings.push('parsed via robust JSON extraction');
            return result;
        }

        // Level 3: <mem> tags (pure text mode)
        const memResult = this._tryMemTags(effectiveReply);
        if (memResult && memResult.storyText) {
            result.success = true;
            result.data = AIOutputSchema ? AIOutputSchema.normalize(memResult) : memResult;
            result.fallbackLevel = 3;
            result.storyText = memResult.storyText;
            result.mems = memResult.mems || [];
            result.warnings.push('parsed from <mem> tags');
            return result;
        }

        // Level 4: plain text fallback
        const plain = this._tryPlainText(effectiveReply);
        result.success = !!plain.storyText;
        result.data = AIOutputSchema ? AIOutputSchema.normalize(plain) : plain;
        result.fallbackLevel = 4;
        result.storyText = plain.storyText;
        result.warnings.push('parsed as plain text');
        return result;
    },

    // 【P0修复BUG-003】剥离推理模型思考过程
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
        var tags = ['think', 'thinking', 'reasoning', 'thought', 'analysis'];

        // Step 1: 剥离所有配对思考块（\b[^>]* 支持标签带属性，如 <think type="x">）
        for (var i = 0; i < tags.length; i++) {
            var tag = tags[i];
            var pairRe = new RegExp('<' + tag + '\\b[^>]*>[\\s\\S]*?</' + tag + '\\s*>', 'gi');
            s = s.replace(pairRe, '');
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
        return null;
    },

    _tryCodeBlockJSON(raw) {
        if (!raw || typeof raw !== 'string') return null;
        const m = raw.match(/```json\n?([\s\S]*?)\n?```/);
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

        // 【P2优化】快速路径：尝试 first{ ... last} 的最大切片（覆盖 99% 场景）
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

        // 【截断修复】所有正常路径失败后，最后尝试截断修复
        const repaired = this._repairTruncatedJSON(raw, firstBrace);
        if (repaired) {
            console.log('[ResponseParser] JSON 截断修复成功（兜底路径）');
            return repaired;
        }
        return null;
    },

    // 【新增】修复被截断的 JSON：补全缺失的闭合符号 } ] 和字符串引号
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
        let lastValidPos = start; // 最后一个完整 key-value 后的位置
        let lastKeyEnd = -1;     // 最后一个键名后的冒号位置

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
            if (ch === '}') { depth--; lastValidPos = i; continue; }
            if (ch === '[') { bracketDepth++; continue; }
            if (ch === ']') { bracketDepth--; lastValidPos = i; continue; }
            if (ch === ',') { lastValidPos = i; continue; }
            if (ch === ':') { lastKeyEnd = i; continue; }
        }

        // 如果深度为 0 且 bracketDepth 为 0，说明 JSON 完整，不需要修复
        if (depth === 0 && bracketDepth === 0) return null;

        // 截取到最后一个有效位置（避免截断在 key 中间）
        let candidate = raw.slice(start);
        // 如果在字符串中间被截断，先补全引号
        if (inString) {
            candidate += '"';
        }
        // 补全缺失的 ] 和 }
        for (let i = 0; i < bracketDepth; i++) {
            candidate += ']';
        }
        for (let i = 0; i < depth; i++) {
            candidate += '}';
        }

        // 尝试解析修复后的 JSON
        const result = this._tryDirectJSON(candidate);
        if (result) {
            // 标记为截断修复的数据
            result._truncatedRepaired = true;
            return result;
        }

        // 如果直接补全失败，尝试截断到最后一个逗号/完整值后再补全
        // 找到最后一个逗号或值结束位置
        let trimPos = candidate.lastIndexOf(',');
        if (trimPos > start) {
            candidate = candidate.slice(0, trimPos);
            if (inString) candidate += '"';
            for (let i = 0; i < bracketDepth; i++) candidate += ']';
            for (let i = 0; i < depth; i++) candidate += '}';
            const result2 = this._tryDirectJSON(candidate);
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
            // 【修复 P2】提取全部属性，而非仅 type/action/name/qty/content
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
        const cleaned = OutputSanitizer ? OutputSanitizer.sanitizeStory(raw) : raw;
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
                    story = OutputSanitizer ? OutputSanitizer.sanitizeStory(story) : story;
                }
            }
            data.story = story || '';
            return data;
        }
        return { storyText: cleaned };
    },

    // 【P2修复】字符串感知的括号匹配，避免 JSON 字符串内的大括号干扰
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
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = ResponseParser;
