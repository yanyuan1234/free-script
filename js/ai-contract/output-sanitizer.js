// ========================================
// 输出清理器
// 清理 AI 输出中的思维链、HTML、光标符号、JSON 前缀等噪声
// ========================================
var OutputSanitizer = {
    sanitizeStory: function(text) {
        if (!text || typeof text !== 'string') return '';
        var s = text;
        s = this.stripThinking(s);
        s = this.stripHTMLAndCursors(s);
        s = this.stripJSONArtifacts(s);
        s = s.replace(/[\u0000-\u0008\u000b-\u000c\u000e-\u001f]+/g, ' ');
        s = s.replace(/\n{3,}/g, '\n\n');
        return s.trim();
    },

    sanitizeJSON: function(raw) {
        if (!raw || typeof raw !== 'string') return '';
        var s = raw.trim();
        if (s.startsWith('```')) {
            s = s.replace(/^```json\s*/i, '').replace(/^```/, '').trim();
            if (s.endsWith('```')) s = s.slice(0, -3).trim();
        }
        s = s.replace(/^[^\{\[]*?(\{|\[)/, '$1');
        return s;
    },

    stripThinking: function(text) {
        if (!text || typeof text !== 'string') return '';
        return text
            .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
            .replace(/<ECoT>[\s\S]*?<\/ECoT>/gi, '')
            .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '')
            .replace(/💭[\s\S]*?💭/g, '');
    },

    stripHTMLAndCursors: function(text) {
        if (!text || typeof text !== 'string') return '';
        return text
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/▌|⎸/g, '');
    },

    stripJSONArtifacts: function(text) {
        if (!text || typeof text !== 'string') return '';
        return text
            .replace(/^\s*"story"\s*:\s*"/i, '')
            .replace(/^\s*"title"\s*:\s*"/i, '')
            .replace(/^\s*story\s*:\s*/i, '')
            .replace(/^\s*title\s*:\s*/i, '')
            .replace(/\{\s*"story"\s*:\s*"/gi, '')
            .replace(/"\s*\}\s*$/g, '');
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = OutputSanitizer;
