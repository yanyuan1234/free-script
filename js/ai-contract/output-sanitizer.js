// ========================================
// 输出清理器
// 清理 AI 输出中的思维链、HTML、光标符号、JSON 前缀等噪声
// ========================================
// 【P1-13修复】思维链标签集合统一常量：output-sanitizer 与 response-parser 共享
// 旧代码：output-sanitizer 用 7 标签（硬编码在 7 个 replace 里），response-parser 用 5 标签数组
// 现统一为常量，两处引用，消除标签集不一致隐患
const THINKING_TAGS = ['think', 'thinking', 'reasoning', 'thought', 'analysis', 'ECoT'];
const OutputSanitizer = {
    sanitizeStory(text) {
        if (!text || typeof text !== 'string') return '';
        let s = text;
        s = this.stripThinking(s);
        s = this.stripHTMLAndCursors(s);
        s = this.stripJSONArtifacts(s);
        s = s.replace(/[\u0000-\u0008\u000b-\u000c\u000e-\u001f]+/g, ' ');
        s = s.replace(/\n{3,}/g, '\n\n');
        return s.trim();
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
        // 【P1-13修复】用 THINKING_TAGS 常量循环生成正则，避免标签集合与 response-parser 不一致
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
        // 【修复】移除故事中间混入的 JSON 字段残片
        // 场景：AI 把 "choices":[...]、"characters":[...] 等 JSON 片段写进了 story 字符串值
        // 匹配 "字段名": 后跟 [ 或 { 的 JSON 结构残片（非剧情对话内容）
        s = s.replace(/\\?"(?:choices|characters|player|bag|currency|currencyName|quests|gameTime|keyEvents|world|locations|relationships|hud|contextSummary|title|npcMessages)\\?"\s*:\s*[\[{][\s\S]*?(?:\]|\})\s*,?/gi, '');
        // 移除孤立的 JSON 结尾残片（如 ", "choices":[]}）
        // 【修复 P1】原贪婪正则 [\s\S]*$ 会从故事中任意 ,"字段名": 处吞掉整段后续正文
        // 改为非贪婪匹配，且仅当后面紧跟 ] 或 } 闭合符号时才删除（确认是 JSON 残片而非剧情对话）
        s = s.replace(/,\s*\\?"[a-zA-Z_]+\\?"\s*:\s*[\[{"][\s\S]*?(?:\]|\})\s*,?\s*$/gi, '');
        // 移除转义的 JSON 引号残片
        s = s.replace(/\\+"/g, '"');
        return s;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = OutputSanitizer;
