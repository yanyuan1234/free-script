/**
 * 内嵌电子书阅读器
 * 灵感来源：恒·序 v1.95 — 完整HTML/CSS/JS ebook reader 实现
 * 设计理念：将游戏历史内容整理为电子书格式，支持翻页、目录跳转、
 *           书签、字号调节。适合长篇游戏的回顾和存档浏览。
 *
 * 依赖：phone-ui.js (UI容器), game.js (历史消息)
 */
var EbookReader = {

    enabled: true,

    // 阅读器是否打开
    _isOpen: false,

    // 当前页码
    _currentPage: 0,

    // 每页字数
    _charsPerPage: 800,

    // 字号级别 (1-5)
    _fontSizeLevel: 2,

    // 书签列表
    _bookmarks: [],

    // 阅读器DOM元素
    _readerEl: null,

    // 分页后的内容
    _pages: [],

    // 字号映射
    _FONT_SIZES: [13, 14, 15, 16, 18],

    /**
     * 初始化
     */
    init: function() {
        this._loadSettings();
        this._createReaderUI();
        console.log('[EbookReader] 电子书阅读器已初始化');
    },

    /**
     * 加载设置
     */
    _loadSettings: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.getJSON) {
                var settings = Storage.getJSON('ebook_reader_settings', null);
                if (settings) {
                    this._fontSizeLevel = settings.fontSizeLevel || 2;
                    this._charsPerPage = settings.charsPerPage || 800;
                    this._bookmarks = settings.bookmarks || [];
                }
            }
        } catch(e) {
            console.warn('[EbookReader] 读取设置失败:', e);
        }
    },

    saveSettings: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.setJSON) {
                Storage.setJSON('ebook_reader_settings', {
                    fontSizeLevel: this._fontSizeLevel,
                    charsPerPage: this._charsPerPage,
                    bookmarks: this._bookmarks
                });
            }
        } catch(e) {}
    },

    /**
     * 创建阅读器UI（隐藏状态）
     */
    _createReaderUI: function() {
        var self = this;
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                self._createReaderUI();
            });
            return;
        }

        var reader = document.createElement('div');
        reader.id = 'ebook-reader-overlay';
        reader.style.cssText = [
            'position:fixed',
            'top:0;left:0;right:0;bottom:0',
            'z-index:9999',
            'background:#1a1a2e',
            'display:none',
            'flex-direction:column',
            'font-family:"Noto Serif SC",serif'
        ].join(';');

        reader.innerHTML = this._getReaderHTML();
        document.body.appendChild(reader);
        this._readerEl = reader;

        // 绑定事件
        this._bindEvents();
    },

    /**
     * 获取阅读器HTML结构
     */
    _getReaderHTML: function() {
        return [
            '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px;background:#16213e;border-bottom:1px solid rgba(255,255,255,0.1);">',
            '  <div style="display:flex;align-items:center;gap:12px;">',
            '    <button id="ebook-close" style="background:none;border:none;color:#e0e0e0;font-size:20px;cursor:pointer;">✕</button>',
            '    <span id="ebook-title" style="color:#e0e0e0;font-size:16px;font-weight:500;">游戏回忆录</span>',
            '  </div>',
            '  <div style="display:flex;align-items:center;gap:8px;">',
            '    <button id="ebook-font-dec" style="background:rgba(255,255,255,0.1);border:none;color:#e0e0e0;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:14px;">A-</button>',
            '    <button id="ebook-font-inc" style="background:rgba(255,255,255,0.1);border:none;color:#e0e0e0;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px;">A+</button>',
            '    <button id="ebook-bookmark" style="background:rgba(255,255,255,0.1);border:none;color:#e0e0e0;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:14px;">🔖</button>',
            '    <button id="ebook-toc" style="background:rgba(255,255,255,0.1);border:none;color:#e0e0e0;padding:4px 12px;border-radius:15px;cursor:pointer;font-size:12px;">目录</button>',
            '  </div>',
            '</div>',
            '<div id="ebook-toc-panel" style="display:none;position:absolute;top:53px;left:0;right:0;max-height:300px;overflow-y:auto;background:#16213e;border-bottom:1px solid rgba(255,255,255,0.1);padding:12px 20px;z-index:10;">',
            '</div>',
            '<div id="ebook-content" style="flex:1;overflow-y:auto;padding:32px 24px;color:#d0d0d0;line-height:2;letter-spacing:0.5px;">',
            '  <p style="text-align:center;color:#888;">点击左右翻页</p>',
            '</div>',
            '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px;background:#16213e;border-top:1px solid rgba(255,255,255,0.1);">',
            '  <button id="ebook-prev" style="background:rgba(75,63,227,0.2);border:1px solid rgba(75,63,227,0.4);color:#a0a0e0;padding:8px 24px;border-radius:20px;cursor:pointer;">◀ 上一页</button>',
            '  <span id="ebook-page-info" style="color:#888;font-size:12px;">0 / 0</span>',
            '  <button id="ebook-next" style="background:rgba(75,63,227,0.2);border:1px solid rgba(75,63,227,0.4);color:#a0a0e0;padding:8px 24px;border-radius:20px;cursor:pointer;">下一页 ▶</button>',
            '</div>'
        ].join('');
    },

    /**
     * 绑定事件
     */
    _bindEvents: function() {
        var self = this;
        if (!this._readerEl) return;

        this._readerEl.querySelector('#ebook-close').addEventListener('click', function() {
            self.close();
        });
        this._readerEl.querySelector('#ebook-prev').addEventListener('click', function() {
            self.prevPage();
        });
        this._readerEl.querySelector('#ebook-next').addEventListener('click', function() {
            self.nextPage();
        });
        this._readerEl.querySelector('#ebook-font-dec').addEventListener('click', function() {
            self._changeFontSize(-1);
        });
        this._readerEl.querySelector('#ebook-font-inc').addEventListener('click', function() {
            self._changeFontSize(1);
        });
        this._readerEl.querySelector('#ebook-bookmark').addEventListener('click', function() {
            self._toggleBookmark();
        });
        this._readerEl.querySelector('#ebook-toc').addEventListener('click', function() {
            self._toggleTOC();
        });

        // 左右键翻页
        document.addEventListener('keydown', function(e) {
            if (!self._isOpen) return;
            if (e.key === 'ArrowLeft') self.prevPage();
            if (e.key === 'ArrowRight') self.nextPage();
            if (e.key === 'Escape') self.close();
        });
    },

    /**
     * 打开阅读器
     */
    open: function() {
        this._collectContent();
        if (this._pages.length === 0) {
            console.warn('[EbookReader] 没有可显示的内容');
            return;
        }

        this._isOpen = true;
        this._currentPage = 0;
        this._readerEl.style.display = 'flex';
        this._renderPage();
        this._buildTOC();
    },

    /**
     * 关闭阅读器
     */
    close: function() {
        this._isOpen = false;
        this._readerEl.style.display = 'none';
    },

    /**
     * 收集游戏内容并分页
     */
    _collectContent: function() {
        // 从聊天记录中收集内容
        var messages = [];
        var chatContainer = document.querySelector('.chat-container') ||
                          document.querySelector('#chat-messages') ||
                          document.querySelector('.phone-screen');

        if (chatContainer) {
            var bubbles = chatContainer.querySelectorAll('.message-bubble, .chat-bubble, .ai-message');
            bubbles.forEach(function(bubble) {
                var text = bubble.textContent.trim();
                if (text && text.length > 20) {
                    messages.push(text);
                }
            });
        }

        // 备用：从EnhancedMemory获取
        if (messages.length === 0 && typeof EnhancedMemory !== 'undefined' && EnhancedMemory._workingMemory) {
            EnhancedMemory._workingMemory.forEach(function(msg) {
                if (msg.content && msg.content.length > 20) {
                    messages.push(msg.content);
                }
            });
        }

        // 分页
        this._pages = [];
        var currentText = '';
        messages.forEach(function(msg, idx) {
            currentText += msg + '\n\n---\n\n';
            if (currentText.length >= this._charsPerPage) {
                this._pages.push({
                    content: currentText.trim(),
                    messageIndex: idx
                });
                currentText = '';
            }
        }, this);

        if (currentText.trim()) {
            this._pages.push({
                content: currentText.trim(),
                messageIndex: messages.length - 1
            });
        }
    },

    /**
     * 渲染当前页
     */
    _renderPage: function() {
        if (!this._readerEl || this._pages.length === 0) return;

        var page = this._pages[this._currentPage];
        var fontSize = this._FONT_SIZES[this._fontSizeLevel - 1];

        var contentEl = this._readerEl.querySelector('#ebook-content');
        contentEl.style.fontSize = fontSize + 'px';
        contentEl.innerHTML = page.content.split('\n').map(function(line) {
            if (line.trim() === '---') return '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:16px 0;">';
            return '<p style="margin:0 0 16px;">' + line + '</p>';
        }).join('');

        // 更新页码
        var pageInfo = this._readerEl.querySelector('#ebook-page-info');
        pageInfo.textContent = (this._currentPage + 1) + ' / ' + this._pages.length;

        // 检查书签
        var bookmarkBtn = this._readerEl.querySelector('#ebook-bookmark');
        var hasBookmark = this._bookmarks.indexOf(this._currentPage) !== -1;
        bookmarkBtn.style.color = hasBookmark ? '#ffc107' : '#e0e0e0';
    },

    /**
     * 下一页
     */
    nextPage: function() {
        if (this._currentPage < this._pages.length - 1) {
            this._currentPage++;
            this._renderPage();
        }
    },

    /**
     * 上一页
     */
    prevPage: function() {
        if (this._currentPage > 0) {
            this._currentPage--;
            this._renderPage();
        }
    },

    /**
     * 改变字号
     */
    _changeFontSize: function(delta) {
        var newLevel = this._fontSizeLevel + delta;
        if (newLevel < 1) newLevel = 1;
        if (newLevel > this._FONT_SIZES.length) newLevel = this._FONT_SIZES.length;
        this._fontSizeLevel = newLevel;
        this.saveSettings();
        this._renderPage();
    },

    /**
     * 切换书签
     */
    _toggleBookmark: function() {
        var idx = this._bookmarks.indexOf(this._currentPage);
        if (idx === -1) {
            this._bookmarks.push(this._currentPage);
        } else {
            this._bookmarks.splice(idx, 1);
        }
        this._bookmarks.sort(function(a, b) { return a - b; });
        this.saveSettings();
        this._renderPage();
    },

    /**
     * 构建目录
     */
    _buildTOC: function() {
        var tocPanel = this._readerEl.querySelector('#ebook-toc-panel');
        if (!tocPanel) return;

        var html = '';
        this._pages.forEach(function(page, idx) {
            var preview = page.content.substring(0, 40).replace(/\n/g, ' ') + '...';
            var isBookmarked = this._bookmarks.indexOf(idx) !== -1;
            html += '<div class="toc-item" data-page="' + idx + '" style="padding:8px 12px;cursor:pointer;border-radius:6px;color:#a0a0a0;font-size:13px;transition:background 0.2s;">' +
                    (isBookmarked ? '🔖 ' : '') +
                    '第' + (idx + 1) + '页 · ' + preview +
                    '</div>';
        }, this);

        tocPanel.innerHTML = html;

        // 绑定目录点击
        var self = this;
        tocPanel.querySelectorAll('.toc-item').forEach(function(item) {
            item.addEventListener('click', function() {
                self._currentPage = parseInt(this.dataset.page);
                self._renderPage();
                tocPanel.style.display = 'none';
            });
            item.addEventListener('mouseenter', function() {
                this.style.background = 'rgba(255,255,255,0.05)';
            });
            item.addEventListener('mouseleave', function() {
                this.style.background = 'none';
            });
        });
    },

    /**
     * 切换目录显示
     */
    _toggleTOC: function() {
        var panel = this._readerEl.querySelector('#ebook-toc-panel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    },

    /**
     * 获取阅读器状态
     */
    getInfo: function() {
        return {
            isOpen: this._isOpen,
            totalPages: this._pages.length,
            currentPage: this._currentPage,
            fontSizeLevel: this._fontSizeLevel,
            bookmarks: this._bookmarks.length
        };
    },

    setEnabled: function(enabled) {
        this.enabled = enabled;
    }
};
