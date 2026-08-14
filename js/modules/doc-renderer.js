/**
 * 游戏内文档视觉渲染引擎
 * 灵感来源：双人成行 v12.0 — 多元视觉渲染引擎 V2.0
 * 设计理念：当剧情中出现信件、日记、报纸、终端等文档时，
 *           自动渲染为对应视觉样式，增强沉浸感。
 *           通过标签触发渲染，支持多种文档类型。
 *
 * 依赖：phone-ui.js (渲染容器)
 */
var DocRenderer = {

    enabled: true,

    // 渲染容器ID
    CONTAINER_CLASS: 'doc-render-container',

    // 文档类型定义
    docTypes: {},

    /**
     * 初始化
     */
    init: function() {
        this._defineDocTypes();
        this._registerPromptSection();
        this._registerRegexProcessor();
        console.log('[DocRenderer] 文档渲染引擎已初始化 (' + Object.keys(this.docTypes).length + '种文档类型)');
    },

    /**
     * 定义文档类型
     * 来源：双人成行 v12.0 的触发矩阵
     */
    _defineDocTypes: function() {
        this.docTypes = {
            letter: {
                name: '手写信件',
                triggerTags: ['letter', '信件', '信'],
                bgGradient: 'linear-gradient(135deg, #f5f0e1 0%, #e8d5b7 50%, #f0e6d0 100%)',
                textColor: '#3a2e1f',
                fontFamily: '"Noto Serif SC", "Songti SC", serif',
                padding: '24px 28px',
                borderRadius: '4px',
                boxShadow: '0 2px 12px rgba(139,119,80,0.15), inset 0 0 40px rgba(139,119,80,0.05)',
                extraCSS: '.doc-letter::before{content:"";position:absolute;top:0;right:0;width:80px;height:80px;background:radial-gradient(circle at 70% 30%, rgba(139,119,80,0.08), transparent 70%);}.doc-letter .seal{display:inline-block;width:50px;height:50px;border:2px solid #c0392b;border-radius:50%;color:#c0392b;font-size:10px;line-height:46px;text-align:center;transform:rotate(-8deg);opacity:0.7;float:right;margin:10px 0;}'
            },
            diary: {
                name: '日记本',
                triggerTags: ['diary', '日记'],
                bgGradient: 'linear-gradient(to right, #fdf6e3 0%, #f5ecd0 100%)',
                textColor: '#5d4e37',
                fontFamily: '"Noto Serif SC", serif',
                padding: '20px 24px',
                borderRadius: '2px',
                boxShadow: '0 1px 8px rgba(93,78,55,0.12)',
                extraCSS: '.doc-diary::before{content:"";position:absolute;left:30px;top:0;bottom:0;width:1px;background:rgba(200,80,80,0.3);}'
            },
            newspaper: {
                name: '报纸',
                triggerTags: ['newspaper', '报纸'],
                bgGradient: 'linear-gradient(to bottom, #e9e4d1 0%, #ddd6c0 100%)',
                textColor: '#2c2c2c',
                fontFamily: '"Noto Serif SC", "Songti SC", serif',
                padding: '20px 24px',
                borderRadius: '0px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                extraCSS: '.doc-newspaper .headline{font-size:18px;font-weight:bold;text-align:center;margin-bottom:8px;letter-spacing:2px;}.doc-newspaper .meta{text-align:center;font-size:11px;color:#666;margin-bottom:12px;border-bottom:1px solid #999;padding-bottom:6px;}.doc-newspaper .body{column-count:2;column-gap:20px;font-size:13px;line-height:1.8;}'
            },
            receipt: {
                name: '小票/发票',
                triggerTags: ['receipt', '小票', '发票'],
                bgGradient: 'linear-gradient(to bottom, #f0f0f0 0%, #e8e8e8 100%)',
                textColor: '#333',
                fontFamily: '"Courier New", monospace',
                padding: '16px 20px',
                borderRadius: '0px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                extraCSS: '.doc-receipt{border-top:1px dashed #999;border-bottom:1px dashed #999;}.doc-receipt .store{text-align:center;font-weight:bold;font-size:14px;margin-bottom:6px;}.doc-receipt .item{display:flex;justify-content:space-between;font-size:12px;margin:2px 0;}'
            },
            terminal: {
                name: '终端屏幕',
                triggerTags: ['terminal', '终端', '屏幕'],
                bgGradient: 'linear-gradient(to bottom, #0a0a0a 0%, #111 100%)',
                textColor: '#00ff41',
                fontFamily: '"Courier New", "Source Code Pro", monospace',
                padding: '16px 20px',
                borderRadius: '4px',
                boxShadow: '0 0 20px rgba(0,255,65,0.15), inset 0 0 30px rgba(0,255,65,0.03)',
                extraCSS: '.doc-terminal{text-shadow:0 0 5px rgba(0,255,65,0.4);}.doc-terminal .cursor{display:inline-block;width:8px;height:14px;background:#00ff41;animation:blink 1s step-end infinite;}@keyframes blink{50%{opacity:0;}}'
            },
            phone: {
                name: '手机屏幕',
                triggerTags: ['phone', '手机', 'phone_screen'],
                bgGradient: 'linear-gradient(to bottom, #1a1a2e 0%, #16213e 100%)',
                textColor: '#e0e0e0',
                fontFamily: '"Noto Sans SC", sans-serif',
                padding: '12px 16px',
                borderRadius: '20px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                extraCSS: '.doc-phone{max-width:340px;margin:0 auto;border:2px solid #333;}.doc-phone .statusbar{display:flex;justify-content:space-between;font-size:10px;color:#888;margin-bottom:8px;}.doc-phone .chat-bubble{padding:8px 12px;border-radius:12px;margin:4px 0;max-width:80%;}.doc-phone .chat-left{background:#2a2a4a;align-self:flex-start;}.doc-phone .chat-right{background:#4B3FE3;align-self:flex-end;margin-left:auto;}'
            },
            note: {
                name: '便签/纸条',
                triggerTags: ['note', '便签', '纸条'],
                bgGradient: 'linear-gradient(135deg, #fff9c4 0%, #fff59d 100%)',
                textColor: '#5d4037',
                fontFamily: '"Noto Sans SC", cursive',
                padding: '16px 20px',
                borderRadius: '2px',
                boxShadow: '2px 3px 8px rgba(0,0,0,0.12)',
                extraCSS: '.doc-note{transform:rotate(-1deg);}'
            },
            scroll: {
                name: '卷轴/古文',
                triggerTags: ['scroll', '卷轴', '古籍'],
                bgGradient: 'linear-gradient(to right, #d4c5a0 0%, #c9b890 50%, #d4c5a0 100%)',
                textColor: '#4a3728',
                fontFamily: '"Noto Serif SC", "Songti SC", serif',
                padding: '24px 32px',
                borderRadius: '0px',
                boxShadow: '0 2px 12px rgba(74,55,40,0.2)',
                extraCSS: '.doc-scroll{text-align:center;writing-mode:horizontal-tb;}.doc-scroll .title{font-size:16px;font-weight:bold;margin-bottom:12px;letter-spacing:4px;}'
            }
        };
    },

    /**
     * 注册 PromptBuilder section
     * 引导AI在剧情中使用文档渲染标签
     */
    _registerPromptSection: function() {
        if (typeof PromptBuilder === 'undefined') {
            var self = this;
            setTimeout(function() { self._registerPromptSection(); }, 500);
            return;
        }

        var self = this;
        PromptBuilder.registerSection('docRenderer', function(ctx) {
            if (!self.enabled) return '';

            var parts = [];
            parts.push('【文档视觉渲染引擎】');
            parts.push('当剧情中出现信件、日记、报纸、小票、终端屏幕、手机、便签、卷轴等文档时，');
            parts.push('用以下标签包裹文档内容，系统会自动渲染为对应视觉样式：');
            parts.push('');
            parts.push('手写信件: <doc type="letter">信件内容</doc>');
            parts.push('日记本: <doc type="diary">日记内容</doc>');
            parts.push('报纸: <doc type="newspaper"><div class="headline">标题</div><div class="meta">日期·报号</div><div class="body">正文</div></doc>');
            parts.push('小票/发票: <doc type="receipt"><div class="store">店名</div><div class="item"><span>商品</span><span>价格</span></div></doc>');
            parts.push('终端屏幕: <doc type="terminal">终端输出内容</doc>');
            parts.push('手机屏幕: <doc type="phone"><div class="statusbar"><span>时间</span><span>信号</span></div>聊天内容</doc>');
            parts.push('便签: <doc type="note">便签内容</doc>');
            parts.push('卷轴/古籍: <doc type="scroll"><div class="title">标题</div>古文内容</doc>');
            parts.push('');
            parts.push('规则：');
            parts.push('1. 只在剧情自然出现文档时使用，不要强行插入');
            parts.push('2. 文档内容要具体真实，不要用占位符');
            parts.push('3. 每回合最多使用1个文档渲染标签');
            parts.push('4. 文档内容应服务于剧情推进');

            return parts.join('\n');
        }, { order: 62 });
    },

    /**
     * 注册正则处理器
     * 将 <doc type="xxx">...</doc> 标签渲染为HTML
     */
    _registerRegexProcessor: function() {
        if (typeof OutputProcessor === 'undefined') {
            var self = this;
            setTimeout(function() { self._registerRegexProcessor(); }, 500);
            return;
        }

        var self = this;
        OutputProcessor.register('doc-renderer', function(text) {
            return self._renderDocTags(text);
        }, 70);

        console.log('[DocRenderer] 已注册到 OutputProcessor');
    },

    /**
     * 渲染文档标签为HTML
     */
    _renderDocTags: function(text) {
        if (!text || typeof text !== 'string') return text;

        var self = this;
        var regex = /<doc\s+type="([^"]+)">([\s\S]*?)<\/doc>/gi;
        return text.replace(regex, function(match, type, content) {
            var docType = self.docTypes[type];
            if (!docType) return content; // 未知类型，直接返回内容

            return self._buildDocHTML(type, docType, content.trim());
        });
    },

    /**
     * 构建文档HTML
     */
    _buildDocHTML: function(type, docType, content) {
        var className = 'doc-' + type;
        var style = [
            'background:' + docType.bgGradient,
            'color:' + docType.textColor,
            'font-family:' + docType.fontFamily,
            'padding:' + docType.padding,
            'border-radius:' + docType.borderRadius,
            'box-shadow:' + docType.boxShadow,
            'position:relative',
            'margin:12px 0',
            'overflow:hidden'
        ].join(';');

        var html = '<div class="' + this.CONTAINER_CLASS + ' ' + className + '" style="' + style + '">';
        html += content;
        html += '</div>';

        // 添加类型特定CSS（通过style标签注入一次）
        if (docType.extraCSS && !document.getElementById('doc-render-css-' + type)) {
            var styleEl = document.createElement('style');
            styleEl.id = 'doc-render-css-' + type;
            styleEl.textContent = docType.extraCSS;
            document.head.appendChild(styleEl);
        }

        return html;
    },

    /**
     * 获取所有文档类型
     */
    getDocTypes: function() {
        var result = [];
        var self = this;
        Object.keys(this.docTypes).forEach(function(key) {
            result.push({
                id: key,
                name: self.docTypes[key].name,
                tags: self.docTypes[key].triggerTags
            });
        });
        return result;
    },

    setEnabled: function(enabled) {
        this.enabled = enabled;
    }
};
