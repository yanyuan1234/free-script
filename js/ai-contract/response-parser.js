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

        // Level 0: direct JSON（先尝试原始字符串，避免 sanitizeJSON 破坏 JSON 字符串字面量）
        let data = this._tryDirectJSON(rawReply);
        if (data) {
            result.success = true;
            result.data = AIOutputSchema ? AIOutputSchema.normalize(data) : data;
            result.fallbackLevel = 0;
            result.storyText = result.data.story;
            return result;
        }

        // Level 1: code block JSON
        data = this._tryCodeBlockJSON(rawReply);
        if (data) {
            result.success = true;
            result.data = AIOutputSchema ? AIOutputSchema.normalize(data) : data;
            result.fallbackLevel = 1;
            result.storyText = result.data.story;
            result.warnings.push('parsed from code block');
            return result;
        }

        // Level 2: 清理后 JSON + 状态机兜底
        const sanitized = OutputSanitizer ? OutputSanitizer.sanitizeJSON(rawReply) : rawReply;
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
        const memResult = this._tryMemTags(rawReply);
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
        const plain = this._tryPlainText(rawReply);
        result.success = !!plain.storyText;
        result.data = AIOutputSchema ? AIOutputSchema.normalize(plain) : plain;
        result.fallbackLevel = 4;
        result.storyText = plain.storyText;
        result.warnings.push('parsed as plain text');
        return result;
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
        if (lastBrace === -1 || lastBrace < firstBrace) return null;

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
        return null;
    },

    _tryMemTags(raw) {
        if (!raw || typeof raw !== 'string') return null;
        const mems = [];
        const story = raw.replace(/<mem\b[^>]*?(?:>([\s\S]*?)<\/mem>|\/>)/gi, function(tag, inner) {
            const type = (tag.match(/type=["']([^"']+)["']/) || [])[1] || '';
            const action = (tag.match(/action=["']([^"']+)["']/) || [])[1] || '';
            const name = (tag.match(/name=["']([^"']+)["']/) || [])[1] || '';
            const qty = (tag.match(/qty=["']([^"']+)["']/) || [])[1] || '';
            const content = (inner || '').replace(/<[^>]+>/g, '').trim();
            mems.push({ type: type, action: action, name: name, qty: qty, content: content });
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
        if (data) {
            const story = OutputSanitizer ? OutputSanitizer.sanitizeStory(cleaned.replace(jsonMatch[0], '').trim()) : cleaned.replace(jsonMatch[0], '').trim();
            data.story = data.story || story;
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
