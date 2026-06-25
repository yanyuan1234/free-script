// ========================================
var WorldInfo = {
    books: [],
    settings: {
        // scanDepth默认值改为2（与酒馆一致）
        scanDepth: 2,
        // tokenBudget改为百分比模式（与酒馆一致）
        // 酒馆使用百分比（默认25%），这里存储百分比值
        tokenBudget: 25,
        tokenBudgetCap: 0,  // token预算硬上限（0=无限制）
        recursive: true
    },
    // 公共辅助函数：获取编辑面板中所有自定义checkbox元素
    _getEditCheckboxes: function() {
        return {
            constant: document.getElementById('wiEditConstant'),
            selective: document.getElementById('wiEditSelective'),
            enabled: document.getElementById('wiEntryEnabled'),
            disable: document.getElementById('wiEditDisable'),
            excludeRec: document.getElementById('wiEditExcludeRec'),
            preventRec: document.getElementById('wiEditPreventRec'),
            caseSensitive: document.getElementById('wiEditCaseSensitive'),
            wholeWords: document.getElementById('wiEditWholeWords'),
            ignoreBudget: document.getElementById('wiEditIgnoreBudget'),
            addMemo: document.getElementById('wiEditAddMemo'),
            delayUntilRec: document.getElementById('wiEditDelayUntilRec'),
            groupOverride: document.getElementById('wiEditGroupOverride'),
            useGroupScoring: document.getElementById('wiEditUseGroupScoring'),
            useProbability: document.getElementById('wiEditUseProbability')
            };
        },
    // 当前视图状态
    currentView: 'books',  // 'books' 或 'detail'
    currentBookId: null,    // 当前查看/编辑的书ID
    currentFilter: 'all',

    // 获取当前正在操作的书对象
    getCurrentBook: function() {
        if (!this.currentBookId) return null;
        for (var i = 0; i < this.books.length; i++) {
            if (this.books[i].id === this.currentBookId) return this.books[i];
        }
        return null;
    },

    // 获取所有已启用书的全部条目（用于扫描引擎）
    getAllEnabledEntries: function() {
        var allEntries = {};
        for (var i = 0; i < this.books.length; i++) {
            var book = this.books[i];
            if (!book.enabled) continue;
            var keys = Object.keys(book.entries || {});
            for (var j = 0; j < keys.length; j++) {
                allEntries[keys[j]] = book.entries[keys[j]];
            }
        }
    return allEntries;
    },

    // 初始化
    init: function() {
        this.load();
        this.bindEvents();
        // 【世界书↔记忆联动】首次启动时一次性收割已存在条目
        // 避免老玩家世界书里的核心设定没进永久事实区
        this._harvestAllEntriesToMemory();
        },

    // 【世界书↔记忆联动】把当前所有世界书条目收割到永久事实区
    // 仅收割：constant 标记的 + 命中核心关键词的
    _harvestAllEntriesToMemory: function() {
        try {
            if (!window.EnhancedMemory || !EnhancedMemory.syncWorldInfoEntry) return;
            for (var i = 0; i < this.books.length; i++) {
                var book = this.books[i];
                if (!book || !book.entries) continue;
                var uids = Object.keys(book.entries);
                for (var j = 0; j < uids.length; j++) {
                    var uid = uids[j];
                    EnhancedMemory.syncWorldInfoEntry(book.entries[uid], String(uid), book.id);
                }
            }
        } catch (e) { console.warn('[WorldInfo] 收割世界书到记忆失败:', e); }
    },

    // 从localStorage加载
    load: function() {
        var data = {};
        try {
            data = Storage.getJSON(Storage.KEYS.WORLD_INFO, {});
            } catch (e) {
            console.error('[WorldInfoManager] 读取worldInfo失败:', e);
            data = {};
            }
        try {
            if (data.books && Array.isArray(data.books)) {
                // 新格式
                this.books = data.books;
                } else if (data.entries) {
                // 旧格式迁移：把旧的 entries + bookName 包装成一本书
                var oldEntries = data.entries || {};
                var oldName = data.bookName || '导入的世界书';
                this.books = [{
                    id: 'book_' + Date.now(),
                    name: oldName,
                    enabled: true,
                    entries: oldEntries
                    }];
                } else {
                this.books = [];
            }
            if (data.settings) {
                // scanDepth 默认值统一为 2（与酒馆一致）
                this.settings.scanDepth = data.settings.scanDepth || 2;
                // tokenBudget 处理：如果值 > 100，认为是旧格式的绝对值，转换为百分比
                var budget = data.settings.tokenBudget;
                if (budget > 100) {
                    // 旧格式绝对值，假设上下文为 8192，计算百分比
                    this.settings.tokenBudget = Math.round(budget / 8192 * 100);
                    } else if (budget != null) {
                    this.settings.tokenBudget = budget;
                }
            this.settings.recursive = data.settings.recursive !== false;
        }
    } catch(e) {
        this.books = [];
    }
    },

    // 保存到localStorage
    save: function() {
        Storage.setJSON(Storage.KEYS.WORLD_INFO, {
            books: this.books,
            settings: this.settings
        });
        // 【优化】同时重置 _wiCachedTurn——旧代码只重置 _wiCachedResult 不重置 _wiCachedTurn
        // 导致缓存可能命中过期数据（game.js 的缓存逻辑会检查 _wiCachedTurn === currentTurn）
        gameState._wiCachedResult = null;
        if (gameState) gameState._wiCachedTurn = null;
        },

    // 绑定事件
    bindEvents: function() {
        // 防止重复绑定事件
        if (this._eventsBound) return;
        this._eventsBound = true;
        const self = this;
        // 主页按钮
        var menuBtn = document.getElementById('btnMenuWorldInfo');
        if (menuBtn) {
            menuBtn.addEventListener('click', function() { self.showModal(); });
        }
        // 剧情页按钮
        var headerBtn = document.getElementById('btnWorldInfoHeader');
        if (headerBtn) {
            headerBtn.addEventListener('click', function() { self.showModal(); });
        }
    // 导入按钮
    var importBtn = document.getElementById('btnWiImport');
    var fileInput = document.getElementById('wiFileInput');
    if (importBtn && fileInput) {
        importBtn.addEventListener('click', function() { fileInput.click(); });
        fileInput.addEventListener('change', function(e) {
            if (e.target.files[0]) self.importFromFile(e.target.files[0]);
            fileInput.value = '';
            });
    }
    // 清空按钮
    var clearBtn = document.getElementById('btnWiClear');
    if (clearBtn) {
        clearBtn.addEventListener('click', async function() {
            if (self.currentView === 'detail' && self.currentBookId) {
                var ok = await UI.confirm('清空条目', '确定要清空当前书的全部条目吗？');
                if (ok) {
                    var book = self.getCurrentBook();
                    if (book) {
                        book.entries = {};
                        self.save();
                        self.renderCurrentView();
                        UI.toast('当前书已清空');
                    }
            }
        } else {
        var ok = await UI.confirm('删除所有世界书', '确定要删除所有世界书吗？此操作不可恢复。');
        if (ok) {
            self.books = [];
            self.save();
            self.currentView = 'books';
            self.currentBookId = null;
            self.renderCurrentView();
            UI.toast('所有世界书已删除');
        }
    }
    });
    }
    // 筛选标签
    var filterTabs = document.getElementById('wiFilterTabs');
    if (filterTabs) {
        filterTabs.querySelectorAll('.wi-filter-tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                filterTabs.querySelectorAll('.wi-filter-tab').forEach(function(t) { t.classList.remove('active'); });
                tab.classList.add('active');
                self.setFilter(tab.dataset.filter);
                });
            });
    }
    // 导出按钮
    var exportBtn = document.getElementById('btnWiExport');
    if (exportBtn) {
        exportBtn.addEventListener('click', function() { self.exportFile(); });
    }
    // 条目保存
    var saveEntryBtn = document.getElementById('btnWiEntrySave');
    if (saveEntryBtn) {
        saveEntryBtn.addEventListener('click', function() { self.saveEntry(); });
    }
    // 条目删除
    var deleteEntryBtn = document.getElementById('btnWiEntryDelete');
    if (deleteEntryBtn) {
        deleteEntryBtn.addEventListener('click', function() { self.deleteEntry(); });
    }

    // 世界书编辑滑块实时更新
    var wiSliders = [
    { slider: 'wiEntryOrder', display: 'wiEntryOrderVal' },
    { slider: 'wiEntryProbability', display: 'wiEntryProbabilityVal' },
    { slider: 'wiEditDepth', display: 'wiEditDepthVal' },
    { slider: 'wiEditScanDepth', display: 'wiEditScanDepthVal' },
    { slider: 'wiEditGroupWeight', display: 'wiEditGroupWeightVal' }
    ];
    wiSliders.forEach(function(item) {
        var slider = document.getElementById(item.slider);
        var display = document.getElementById(item.display);
        if (slider && display) {
            slider.addEventListener('input', function() {
                display.textContent = this.value;
                });
        }
    });

    // 搜索框
    var searchInput = document.getElementById('wiSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            self.renderCurrentView();
            });
    }
    },

    // 显示模态框
    showModal: function() {
        // 同步设置到UI
        var depthEl = document.getElementById('wiScanDepth');
        var budgetEl = document.getElementById('wiTokenBudget');
        var recursiveEl = document.getElementById('wiRecursive');
        if (depthEl) depthEl.value = this.settings.scanDepth;
        if (budgetEl) budgetEl.value = this.settings.tokenBudget;
        if (recursiveEl) recursiveEl.checked = this.settings.recursive;

        // 重置到书籍列表视图
        this.currentView = 'books';
        this.currentBookId = null;
        this.renderCurrentView();
        UI.showModal('worldInfoModal');
        },

    // 根据当前视图渲染
    renderCurrentView: function() {
        if (this.currentView === 'detail' && this.currentBookId) {
            this.renderBookDetail(this.currentBookId);
            } else {
            this.renderBookList();
        }
    },

    // 返回书籍列表
    goBack: function() {
        this.currentView = 'books';
        this.currentBookId = null;
        this.renderCurrentView();
        },

    // 设置筛选条件
    setFilter: function(filter) {
        this.currentFilter = filter;
        this.renderCurrentView();
        },

    // ===== 书籍列表视图 =====

    // 渲染书籍列表
    renderBookList: function() {
        var container = document.getElementById('wiEntryList');
        var bookStats = document.getElementById('wiBookStats');
        var sectionTitle = document.getElementById('wiSectionTitle');
        var modalTitle = document.getElementById('wiModalTitle');
        var bookInfo = document.getElementById('wiBookInfo');
        if (!container) return;

        // 更新UI元素
        if (modalTitle) modalTitle.textContent = '世界书';
        if (sectionTitle) sectionTitle.textContent = '书籍列表';
        if (bookInfo) bookInfo.style.display = 'none';

        // 工具栏按钮显示/隐藏
        var btnNewBook = document.getElementById('btnWiNewBook');
        var btnNewEntry = document.getElementById('btnWiNewEntry');
        var btnBack = document.getElementById('btnWiBack');
        if (btnNewBook) btnNewBook.style.display = '';
        if (btnNewEntry) btnNewEntry.style.display = 'none';
        if (btnBack) btnBack.style.display = 'none';

        // 搜索框placeholder
        var searchInput = document.getElementById('wiSearchInput');
        if (searchInput) searchInput.placeholder = '搜索书名...';

        var books = this.books;
        if (books.length === 0) {
            if (bookStats) bookStats.textContent = '';
            container.innerHTML = '<div class="empty-state">暂无世界书<br>点击「新建书」创建，或「导入」加载酒馆格式JSON文件</div>';
            return;
        }

        // 搜索过滤
        var searchTerm = '';
        if (searchInput) searchTerm = (searchInput.value || '').trim().toLowerCase();

        // 根据筛选条件过滤
        var filter = this.currentFilter || 'all';
        var filteredBooks = books.filter(function(book) {
            if (filter === 'enabled' && !book.enabled) return false;
            if (filter === 'disabled' && book.enabled) return false;
            if (searchTerm && book.name.toLowerCase().indexOf(searchTerm) === -1) return false;
            return true;
            });

        // 统计
        if (bookStats) {
            var enabledCount = books.filter(function(b) { return b.enabled; }).length;
            var disabledCount = books.length - enabledCount;
            var filterText = filter === 'enabled' ? '（已启用）' : (filter === 'disabled' ? '（已禁用）' : '');
            bookStats.textContent = '共 ' + books.length + ' 本书' + filterText + '，已启用 ' + enabledCount + ' / 已禁用 ' + disabledCount;
        }

    var html = '';
    if (filteredBooks.length === 0) {
        html = '<div class="empty-state" style="padding:20px;">' +
        (searchTerm ? '未找到匹配的书' : (filter === 'enabled' ? '暂无已启用的书' : (filter === 'disabled' ? '暂无已禁用的书' : '暂无书籍'))) +
        '</div>';
        } else {
        const self = this;
        filteredBooks.forEach(function(book) {
            var entryCount = Object.keys(book.entries || {}).length;
            var enabledEntryCount = 0;
            var keys = Object.keys(book.entries || {});
            for (var i = 0; i < keys.length; i++) {
                var e = book.entries[keys[i]];
                if (!e.disable && !e.disabled && e.enabled !== false) enabledEntryCount++;
            }

        html += '<div class="pearl-card" style="padding:12px;cursor:pointer;opacity:' + (book.enabled ? '1' : '0.5') + ';border-left:3px solid ' + (book.enabled ? 'var(--success)' : 'var(--danger)') + ';" data-wi-book-id="' + book.id + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:start;">' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">' + escapeHtml(book.name || '未命名') + '</div>' +
        '<div style="font-size:11px;color:var(--text-tertiary);">' + entryCount + ' 条（已启用 ' + enabledEntryCount + '）</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-shrink:0;margin-left:8px;align-items:center;">' +
        '<span class="wi-book-enable" data-wi-enable-id="' + book.id + '" style="font-size:11px;padding:3px 8px;background:' + (book.enabled ? 'var(--success)' : 'transparent') + ';color:' + (book.enabled ? '#fff' : 'var(--success)') + ';border:1px solid var(--success);border-radius:6px;cursor:pointer;white-space:nowrap;' + (book.enabled ? 'font-weight:500;' : '') + '" title="启用此书">启用</span>' +
        '<span class="wi-book-disable" data-wi-disable-id="' + book.id + '" style="font-size:11px;padding:3px 8px;background:' + (!book.enabled ? 'var(--danger)' : 'transparent') + ';color:' + (!book.enabled ? '#fff' : 'var(--danger)') + ';border:1px solid var(--danger);border-radius:6px;cursor:pointer;white-space:nowrap;' + (!book.enabled ? 'font-weight:500;' : '') + '" title="禁用此书">禁用</span>' +
        '<span class="wi-book-delete" data-wi-delete-id="' + book.id + '" style="font-size:11px;padding:3px 8px;background:var(--bg);color:var(--danger);border:1px solid var(--danger);border-radius:6px;cursor:pointer;white-space:nowrap;" title="删除此书">删除</span>' +
        '</div>' +
        '</div>' +
        '</div>';
        });
    }

    container.innerHTML = html;

    // 使用事件委托，统一处理所有点击
    container.onclick = function(e) {
        // 点击启用按钮
        var enableEl = e.target.closest('[data-wi-enable-id]');
        if (enableEl) {
            e.stopPropagation();
            var book = null;
            for (var i = 0; i < WorldInfo.books.length; i++) {
                if (WorldInfo.books[i].id === enableEl.dataset.wiEnableId) { book = WorldInfo.books[i]; break; }
            }
        if (book && !book.enabled) { book.enabled = true; WorldInfo.save(); WorldInfo.renderCurrentView(); }
        return;
    }
    // 点击禁用按钮
    var disableEl = e.target.closest('[data-wi-disable-id]');
    if (disableEl) {
        e.stopPropagation();
        var book = null;
        for (var i = 0; i < WorldInfo.books.length; i++) {
            if (WorldInfo.books[i].id === disableEl.dataset.wiDisableId) { book = WorldInfo.books[i]; break; }
        }
    if (book && book.enabled) { book.enabled = false; WorldInfo.save(); WorldInfo.renderCurrentView(); }
    return;
    }
    // 点击删除按钮
    var deleteEl = e.target.closest('[data-wi-delete-id]');
    if (deleteEl) {
        e.stopPropagation();
        WorldInfo.deleteBook(deleteEl.dataset.wiDeleteId);
        return;
    }
    // 点击卡片其他区域 → 进入详情
    var cardEl = e.target.closest('[data-wi-book-id]');
    if (cardEl) {
        WorldInfo.openBookDetail(cardEl.dataset.wiBookId);
    }
    };
    },

    // ===== 书籍详情视图 =====

    // 打开书籍详情
    openBookDetail: function(bookId) {
        this.currentView = 'detail';
        this.currentBookId = bookId;
        this.renderCurrentView();
        },

    // 渲染书籍详情（条目列表）
    renderBookDetail: function(bookId) {
        var book = null;
        for (var i = 0; i < this.books.length; i++) {
            if (this.books[i].id === bookId) { book = this.books[i]; break; }
        }
        if (!book) {
            this.currentView = 'books';
            this.currentBookId = null;
            this.renderBookList();
            return;
        }

    var container = document.getElementById('wiEntryList');
    var bookInfo = document.getElementById('wiBookInfo');
    var bookName = document.getElementById('wiBookName');
    var bookStats = document.getElementById('wiBookStats');
    var sectionTitle = document.getElementById('wiSectionTitle');
    var modalTitle = document.getElementById('wiModalTitle');
    if (!container) return;

    // 更新UI元素
    if (modalTitle) modalTitle.textContent = book.name || '未命名';
    if (sectionTitle) sectionTitle.textContent = '条目列表';
    if (bookInfo) {
        bookInfo.style.display = 'block';
        if (bookName) bookName.textContent = book.name || '未命名';
    }

    // 工具栏按钮显示/隐藏
    var btnNewBook = document.getElementById('btnWiNewBook');
    var btnNewEntry = document.getElementById('btnWiNewEntry');
    var btnBack = document.getElementById('btnWiBack');
    if (btnNewBook) btnNewBook.style.display = 'none';
    if (btnNewEntry) btnNewEntry.style.display = '';
    if (btnBack) btnBack.style.display = '';

    // 搜索框placeholder
    var searchInput = document.getElementById('wiSearchInput');
    if (searchInput) searchInput.placeholder = '搜索UID、标题或关键词...';

    var entries = book.entries || {};
    var keys = Object.keys(entries);
    if (keys.length === 0) {
        if (bookStats) bookStats.textContent = '0 条';
        container.innerHTML = '<div class="empty-state">暂无条目<br>点击「新建条目」添加</div>';
        return;
    }

    // 搜索过滤
    var searchTerm = '';
    if (searchInput) searchTerm = (searchInput.value || '').trim().toLowerCase();

    // 根据筛选条件过滤条目
    var filter = this.currentFilter || 'all';
    var filteredKeys = keys.filter(function(uid) {
        var entry = entries[uid];
        var disabled = entry.disable || entry.disabled || false;
        if (filter === 'enabled') return !disabled;
        if (filter === 'disabled') return disabled;
        return true;
        });

    // 搜索过滤
    if (searchTerm) {
        filteredKeys = filteredKeys.filter(function(uid) {
            var entry = entries[uid];
            var text = ((entry.comment || '') + ' ' + (entry.key || []).join(' ') + ' ' + uid).toLowerCase();
            return text.indexOf(searchTerm) !== -1;
            });
    }

    if (bookStats) {
        var enabled = keys.filter(function(k) { return !entries[k].disable && !entries[k].disabled; }).length;
        var disabled = keys.length - enabled;
        var filterText = filter === 'enabled' ? '（已启用）' : (filter === 'disabled' ? '（已禁用）' : '');
        bookStats.textContent = '共 ' + keys.length + ' 条' + filterText + '，已启用 ' + enabled + ' / 已禁用 ' + disabled;
    }

    // 位置名称映射
    var positionNames = {
        0: '角色前', 1: '角色后', 2: 'AN前', 3: 'AN后',
        4: '指定深度', 5: '示例前', 6: '示例后', 7: '出口'
        };

    var html = '';
    if (filteredKeys.length === 0) {
        html = '<div class="empty-state" style="padding:20px;">' +
        (searchTerm ? '未找到匹配的条目' : (filter === 'enabled' ? '暂无已启用的条目' : (filter === 'disabled' ? '暂无已禁用的条目' : '暂无条目'))) +
        '</div>';
        } else {
        filteredKeys.forEach(function(uid) {
            var entry = entries[uid];
            var disabled = entry.disable || entry.disabled || false;
            var keywords = entry.key || entry.keys || [];
            var comment = entry.comment || '';
            var constant = entry.constant || false;
            var content = entry.content || '';
            var contentPreview = content.length > 60 ? truncateByChars(content, 60, '...') : content;

            // 构建标签行
            var tags = [];
            if (constant) tags.push('<span style="background:var(--accent);color:#fff;">常驻</span>');
            if (entry.group) tags.push('<span style="background:#6366f1;color:#fff;">组:' + escapeHtml(entry.group) + '</span>');
            var posName = positionNames[entry.position] || '角色前';
            if (entry.position !== 0) tags.push('<span style="background:#8b5cf6;color:#fff;">' + posName + '</span>');
            if (entry.ignoreBudget) tags.push('<span style="background:#f59e0b;color:#fff;">忽略预算</span>');
            if (entry.sticky != null && entry.sticky > 0) tags.push('<span style="background:#10b981;color:#fff;">粘性' + entry.sticky + '</span>');
            if (entry.cooldown != null && entry.cooldown > 0) tags.push('<span style="background:var(--danger);color:#fff;">冷却' + entry.cooldown + '</span>');
            if (entry.delay != null && entry.delay > 0) tags.push('<span style="background:#64748b;color:#fff;">延迟' + entry.delay + '</span>');
            if (entry.matchWholeWords) tags.push('<span style="background:#0ea5e9;color:#fff;">全词</span>');
            if (entry.caseSensitive) tags.push('<span style="background:#ec4899;color:#fff;">大小写</span>');

            var tagsHtml = tags.length > 0
            ? '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px;">' + tags.map(function(t) { return '<span style="font-size:9px;padding:1px 5px;border-radius:3px;">' + t + '</span>'; }).join('') + '</div>'
            : '';

            html += '<div class="pearl-card" style="padding:10px;cursor:pointer;opacity:' + (disabled ? '0.5' : '1') + ';border-left:3px solid ' + (disabled ? 'var(--danger)' : 'var(--success)') + ';" data-wi-uid="' + uid + '">' +
            '<div style="display:flex;justify-content:space-between;align-items:start;">' +
            '<div style="flex:1;min-width:0;" data-wi-edit="' + uid + '">' +
            '<div style="font-size:13px;font-weight:600;margin-bottom:2px;">' + escapeHtml(comment || keywords[0] || '未命名') + '</div>' +
            '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px;">关键词: ' + escapeHtml(keywords.join(', ')) + '</div>' +
            '<div style="font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(contentPreview) + '</div>' +
            tagsHtml +
            '</div>' +
            '<div style="display:flex;gap:6px;flex-shrink:0;margin-left:8px;align-items:center;">' +
            '<span class="wi-entry-enable" data-wi-entry-enable="' + uid + '" style="font-size:11px;padding:3px 8px;background:' + (!disabled ? 'var(--success)' : 'transparent') + ';color:' + (!disabled ? '#fff' : 'var(--success)') + ';border:1px solid var(--success);border-radius:6px;cursor:pointer;white-space:nowrap;' + (!disabled ? 'font-weight:500;' : '') + '" title="启用此条目">启用</span>' +
            '<span class="wi-entry-disable" data-wi-entry-disable="' + uid + '" style="font-size:11px;padding:3px 8px;background:' + (disabled ? 'var(--danger)' : 'transparent') + ';color:' + (disabled ? '#fff' : 'var(--danger)') + ';border:1px solid var(--danger);border-radius:6px;cursor:pointer;white-space:nowrap;' + (disabled ? 'font-weight:500;' : '') + '" title="禁用此条目">禁用</span>' +
            '<span class="wi-entry-delete" data-wi-entry-delete="' + uid + '" style="font-size:11px;padding:3px 8px;background:var(--bg);color:var(--danger);border:1px solid var(--danger);border-radius:6px;cursor:pointer;white-space:nowrap;" title="删除此条目">删除</span>' +
            '</div>' +
            '</div>' +
            '</div>';
            });
    }

    container.innerHTML = html;

    // 使用事件委托
    container.onclick = function(e) {
        var enableEl = e.target.closest('[data-wi-entry-enable]');
        if (enableEl) {
            e.stopPropagation();
            var book = WorldInfo.getCurrentBook();
            if (book && book.entries[enableEl.dataset.wiEntryEnable]) {
                var entry = book.entries[enableEl.dataset.wiEntryEnable];
                // 兼容旧格式读取，但只写入 enabled
                if (entry.disable || entry.disabled || entry.enabled === false) {
                    entry.enabled = true;
                    WorldInfo.save(); WorldInfo.renderCurrentView();
                }
        }
    return;
    }
    var disableEl = e.target.closest('[data-wi-entry-disable]');
    if (disableEl) {
        e.stopPropagation();
        var book = WorldInfo.getCurrentBook();
        if (book && book.entries[disableEl.dataset.wiEntryDisable]) {
            var entry = book.entries[disableEl.dataset.wiEntryDisable];
            if (!entry.disable && !entry.disabled && entry.enabled !== false) {
                entry.enabled = false;
                WorldInfo.save(); WorldInfo.renderCurrentView();
            }
    }
    return;
    }
    var deleteEl = e.target.closest('[data-wi-entry-delete]');
    if (deleteEl) {
        e.stopPropagation();
        WorldInfo.quickDeleteEntry(deleteEl.dataset.wiEntryDelete);
        return;
    }
    var editEl = e.target.closest('[data-wi-edit]');
    if (editEl) {
        WorldInfo.editEntry(editEl.dataset.wiEdit);
    }
    };
    },

    // ===== 书籍操作 =====

    // 新建一本空书
    addNewBook: async function() {
        var name = await UI.prompt('请输入新书名称：', '新世界书');
        if (!name) return;
        var book = {
            id: 'book_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            name: name.trim(),
            enabled: true,
            entries: {}
            };
        this.books.push(book);
        this.save();
        this.renderBookList();
        UI.toast('已创建新世界书');
    },

    // 切换书的启用/禁用
    toggleBook: function(bookId) {
        for (var i = 0; i < this.books.length; i++) {
            if (this.books[i].id === bookId) {
                this.books[i].enabled = !this.books[i].enabled;
                break;
            }
        }
    this.save();
    this.renderCurrentView();
    },

    // 切换条目启用/禁用
    toggleEntry: function(uid) {
        var book = this.getCurrentBook();
        if (!book || !book.entries[uid]) return;
        var entry = book.entries[uid];
        // 兼容旧格式读取，只写入 enabled
        var wasDisabled = !!(entry.disable || entry.disabled || entry.enabled === false);
        entry.enabled = wasDisabled;
        this.save();
        this.renderCurrentView();
        UI.toast(wasDisabled ? '条目已启用' : '条目已禁用');
        },

    // 快速删除条目（从列表直接删除）
    quickDeleteEntry: async function(uid) {
        var book = this.getCurrentBook();
        if (!book || !book.entries[uid]) return;
        var ok = await UI.confirm('删除条目', '确定删除这条目？');
        if (!ok) return;
        delete book.entries[uid];
        this.save();
        this.renderCurrentView();
        UI.toast('条目已删除');
    },

    // 删除一本书
    deleteBook: async function(bookId) {
        var ok = await UI.confirm('删除世界书', '确定要删除这本书及其所有条目吗？');
        if (!ok) return;
        // 【世界书↔记忆联动】删除前清理该书所有永久事实
        try {
            if (window.EnhancedMemory && EnhancedMemory.removeWorldAnchorsBySource) {
                EnhancedMemory.removeWorldAnchorsBySource('worldInfo:' + bookId + ':');
            }
        } catch (e) { console.warn('[WorldInfo] 删除书清理记忆失败:', e); }
        this.books = this.books.filter(function(b) { return b.id !== bookId; });
        if (this.currentBookId === bookId) {
            this.currentView = 'books';
            this.currentBookId = null;
        }
    this.save();
    this.renderCurrentView();
    UI.toast('书已删除');
    },

    // ===== 导入导出 =====

    // 导入世界书文件
    importFromFile: function(file) {
        const self = this;
        var reader = new FileReader();
        reader.onload = function(e) {
            try {
                var data;
                var fileName = file.name.toLowerCase();
                if (fileName.endsWith('.png') || file.type === 'image/png') {
                    // PNG角色卡格式
                    var charData = extractCharaData(e.target.result);
                    if (!charData) {
                        UI.toast('无法从PNG中提取角色数据');
                        return;
                    }
                // V2格式
                if (charData.spec === 'chara_card_v2' && charData.data) {
                    data = charData.data.character_book || charData.data;
                    } else {
                    data = charData.character_book || charData;
                }
                } else {
                data = JSON.parse(e.target.result);
            }
        var imported = self.parseWorldInfo(data, file.name);
        if (imported > 0) {
            UI.toast('成功导入 ' + imported + ' 条世界书条目到新书');
            self.renderCurrentView();
            } else {
            UI.toast('未找到有效的世界书条目');
        }
        } catch(err) {
        UI.toast('导入失败: ' + translateError(err.message));
    }
    };
    if (file.name.toLowerCase().endsWith('.png') || file.type === 'image/png') {
        reader.readAsArrayBuffer(file);
        } else {
        reader.readAsText(file);
    }
    },

    // 解析世界书数据（兼容v1/v2格式），创建新书并push到books
    parseWorldInfo: function(data, fileName) {
        var entries = {};

        // 情况1: 标准v2格式 { entries: { "0": {...}, "1": {...} } }
        if (data.entries && typeof data.entries === 'object') {
            entries = data.entries;
        }
        // 情况2: v1嵌套格式 { entries: { entries: { ... } } }
        else if (data.entries && data.entries.entries && typeof data.entries.entries === 'object') {
            entries = data.entries.entries;
        }
    // 情况3: 角色卡嵌入格式（entries直接在顶层）
    else if (data.character_book && data.character_book.entries) {
        entries = data.character_book.entries;
    }
    // 情况4: 直接就是entries对象
    else if (typeof data === 'object' && !Array.isArray(data)) {
        // 检查是否像条目对象（有key/keys字段）
        var firstKey = Object.keys(data)[0];
        if (firstKey && data[firstKey] && (data[firstKey].key || data[firstKey].keys || data[firstKey].content)) {
            entries = data;
        }
    }

    // 获取世界书名称
    var bookName = '导入的世界书';
    if (data.name) bookName = data.name;
    else if (data.character_book && data.character_book.name) bookName = data.character_book.name;
    else if (fileName) bookName = fileName.replace(/\.json$/i, '').replace(/\.png$/i, '');

    // 转换条目
    var convertedEntries = {};
    var count = 0;
    const self = this;
    Object.keys(entries).forEach(function(uid) {
        var raw = entries[uid];
        var converted = self.convertEntry(raw, uid);
        if (converted) {
            convertedEntries[uid] = converted;
            count++;
        }
    });

    if (count === 0) return 0;

    // 创建新书并添加到books数组
    var newBook = {
        id: 'book_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        name: bookName,
        enabled: true,
        entries: convertedEntries
        };
    this.books.push(newBook);
    this.save();

    // 【世界书↔记忆联动】批量同步导入的条目到永久事实区
    try {
        if (window.EnhancedMemory && EnhancedMemory.syncWorldInfoEntry) {
            var newUids = Object.keys(convertedEntries);
            for (var i = 0; i < newUids.length; i++) {
                var entryUid = newUids[i];
                EnhancedMemory.syncWorldInfoEntry(convertedEntries[entryUid], String(entryUid), newBook.id);
            }
        }
    } catch (e) { console.warn('[WorldInfo] 导入后批量同步到记忆失败:', e); }

    return count;
    },

    // 转换单个条目（v1/v2 -> 统一格式）
    // 完全兼容 SillyTavern 世界书格式
    convertEntry: function(raw, uid) {
        if (!raw) return null;

        // 提取extensions子对象（酒馆格式兼容）
        // 支持多种字段名：extensions, extension, ext
        var ext = raw.extensions || raw.extension || raw.ext || {};

        // 辅助函数：安全读取字段，null/undefined时返回默认值
        function safeGet(a, b, c, def) {
            if (a !== undefined && a !== null) return a;
            if (b !== undefined && b !== null) return b;
            if (c !== undefined && c !== null) return c;
            return def;
        }

        // 解析position：支持数字和V2字符串格式
        // 与SillyTavern源码完全一致的位置枚举
        // 来源：SillyTavern public/scripts/world-info.js
        // 参考：https://github.com/SillyTavern/SillyTavern/blob/develop/public/scripts/world-info.js
        var positionMap = {
            // V1 数字格式（标准枚举）
            '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
            // V1/V2 标准字符串格式
            'before_char': 0,           // 角色定义前
            'before_char_definitions': 0,
            'before': 0,
            'after_char': 1,            // 角色定义后
            'after_char_definitions': 1,
            'after': 1,
            'before_example_messages': 2, // 示例消息前
            'before_examples': 2,
            'before_example': 2,
            'after_example_messages': 3,  // 示例消息后
            'after_examples': 3,
            'after_example': 3,
            'top_of_author_note': 4,      // 作者注释顶部
            'top_of_an': 4,
            '@AN': 4,
            'bottom_of_author_note': 5,   // 作者注释底部
            'bottom_of_an': 5,
            'at_depth': 6,                // 指定深度注入
            '@D': 6,
            'outlet': 7,                  // 输出口
            // 酒馆社区常用别名（保留兼容性）
            'EMTop': 2,                   // 示例消息顶部 = before_example
            'EMBottom': 3,                // 示例消息底部 = after_example
            'ANBottom': 5,                // 作者注释底部 = bottom_of_author_note
            'atDepth': 6                  // 指定深度注入 = at_depth
            };
        var rawPos = raw.position !== undefined ? raw.position : (ext.position !== undefined ? ext.position : 0);
        var position = (typeof rawPos === 'string' && positionMap[rawPos] !== undefined)
        ? positionMap[rawPos]
        : (typeof rawPos === 'number' ? rawPos : 0);

        // 解析role：支持数字和字符串格式
        // 添加更多角色类型支持
        var roleMap = { 'system': 0, 'user': 1, 'assistant': 2, 'context': 0 };
        var rawRole = raw.role !== undefined ? raw.role : (ext.role !== undefined ? ext.role : 0);
        var role = (typeof rawRole === 'string' && roleMap[rawRole] !== undefined)
        ? roleMap[rawRole]
        : (typeof rawRole === 'number' ? rawRole : 0);

        // 辅助函数：将 key/keys 字段统一转为数组（兼容字符串和数组格式）
        function normalizeKeys(val) {
            if (Array.isArray(val)) return val;
            if (typeof val === 'string' && val.trim()) return val.split(',').map(function(k) { return k.trim(); }).filter(Boolean);
            return [];
        }

    return {
        uid: parseInt(uid) || raw.uid || raw.id || Date.now(),
        key: normalizeKeys(raw.key || raw.keys),
        keysecondary: normalizeKeys(raw.keysecondary || raw.secondary_keys),
        comment: raw.comment || raw.name || '',
        content: raw.content || '',
        constant: !!raw.constant,
        selective: !!raw.selective,
        order: raw.order || raw.insertion_order || 100,
        // 统一使用enabled字段，不再同时维护disable
        // enabled=true表示启用，enabled=false表示禁用
        enabled: raw.enabled !== false && raw.disable !== true,
        position: position,
        group: raw.group || ext.group || '',
        groupOverride: !!raw.groupOverride || !!raw.group_override || !!ext.group_override,
        groupWeight: raw.groupWeight || raw.group_weight || ext.group_weight || 100,
        // probability处理：酒馆V2规范中probability是0-100整数
        // 但部分旧预设可能使用0-1浮点数，需要兼容两种格式
        probability: (function() {
            var prob = raw.probability !== undefined ? raw.probability : ext.probability;
            if (prob === undefined || prob === null) return 100;
            // 兼容0-1浮点数格式（仅当值严格在0-1之间且不为整数时转换）
            if (prob > 0 && prob < 1) return Math.round(prob * 100);
            // 直接使用（已经是0-100整数）
            return Math.round(prob);
            })(),
        useProbability: raw.useProbability !== false && ext.useProbability !== false,
        depth: raw.depth || ext.depth || 4,
        scanDepth: safeGet(raw.scanDepth, raw.scan_depth, ext.scan_depth, null),
        caseSensitive: safeGet(raw.caseSensitive, raw.case_sensitive, ext.case_sensitive, null),
        matchWholeWords: safeGet(raw.matchWholeWords, raw.match_whole_words, ext.match_whole_words, null),
        excludeRecursion: !!raw.excludeRecursion || !!raw.exclude_recursion || !!ext.exclude_recursion,
        preventRecursion: !!raw.preventRecursion || !!raw.prevent_recursion || !!ext.prevent_recursion,
        selectiveLogic: raw.selectiveLogic !== undefined ? raw.selectiveLogic : (ext.selectiveLogic !== undefined ? ext.selectiveLogic : 0),
        role: role,
        sticky: safeGet(raw.sticky, ext.sticky, null, null),
        cooldown: safeGet(raw.cooldown, ext.cooldown, null, null),
        delay: safeGet(raw.delay, ext.delay, null, null),
        delayUntilRecursion: safeGet(raw.delayUntilRecursion, raw.delay_until_recursion, ext.delay_until_recursion, 0),
        ignoreBudget: !!raw.ignoreBudget || !!raw.ignore_budget || !!ext.ignore_budget,
        addMemo: !!raw.addMemo || !!ext.addMemo,
        useGroupScoring: safeGet(raw.useGroupScoring, raw.use_group_scoring, ext.use_group_scoring, null),
        vectorized: !!raw.vectorized || !!ext.vectorized,
        triggers: raw.triggers || ext.triggers || [],
        matchPersonaDescription: !!raw.matchPersonaDescription || !!ext.matchPersonaDescription,
        matchCharacterDescription: !!raw.matchCharacterDescription || !!ext.matchCharacterDescription,
        matchCharacterPersonality: !!raw.matchCharacterPersonality || !!ext.matchCharacterPersonality,
        matchCharacterDepthPrompt: !!raw.matchCharacterDepthPrompt || !!ext.matchCharacterDepthPrompt,
        matchScenario: !!raw.matchScenario || !!ext.matchScenario,
        matchCreatorNotes: !!raw.matchCreatorNotes || !!ext.matchCreatorNotes,
        automationId: raw.automationId || raw.automation_id || ext.automation_id || '',
        outletName: raw.outletName || raw.outlet_name || ext.outlet_name || '',
        displayIndex: raw.displayIndex !== undefined ? raw.displayIndex : (ext.display_index !== undefined ? ext.display_index : (safeInt(uid, 0))),
        characterFilter: raw.characterFilter || ext.characterFilter || null,
        // V2 Spec新增字段 priority（token预算不足时的优先级）
        priority: raw.priority !== undefined ? raw.priority : (ext.priority !== undefined ? ext.priority : 10),
        // decorators支持（@@activate/@@dont_activate）
        decorators: raw.decorators || ext.decorators || []
        };
    },

    // ===== 条目编辑 =====

    // 编辑条目
    editEntry: function(uid) {
        var book = this.getCurrentBook();
        if (!book) return;
        var entry = book.entries[uid];
        if (!entry) return;

        var titleEl = document.getElementById('wiEntryModalTitle');
        if (!titleEl) return;
        titleEl.textContent = '编辑条目';
        var keysEl = document.getElementById('wiEntryKeys'); if (keysEl) keysEl.value = (entry.key || []).join(', ');
        var secKeysEl = document.getElementById('wiEntrySecondaryKeys'); if (secKeysEl) secKeysEl.value = (entry.keysecondary || []).join(', ');
        var contentEl = document.getElementById('wiEntryContent'); if (contentEl) contentEl.value = entry.content || '';
        var commentEl = document.getElementById('wiEntryComment'); if (commentEl) commentEl.value = entry.comment || '';
        var constEl = document.getElementById('wiEntryConstant'); if (constEl) constEl.checked = !!entry.constant;
        var selEl = document.getElementById('wiEntrySelective'); if (selEl) selEl.checked = !!entry.selective;
        var enEl = document.getElementById('wiEntryEnabled'); if (enEl) enEl.checked = entry.enabled !== false;
        var orderEl = document.getElementById('wiEntryOrder'); if (orderEl) orderEl.value = entry.order || 100;
        var probEl = document.getElementById('wiEntryProbability'); if (probEl) probEl.value = entry.probability || 100;

        // 同步下拉框
        var posEl = document.getElementById('wiEditPosition');
        if (posEl) posEl.value = (entry.position != null ? entry.position : 0);
        var roleEl = document.getElementById('wiEditRole');
        if (roleEl) roleEl.value = (entry.role != null ? entry.role : 0);
        var logicEl = document.getElementById('wiEditLogic');
        if (logicEl) logicEl.value = (entry.selectiveLogic != null ? entry.selectiveLogic : 0);

        // 同步滑块
        var depthEl = document.getElementById('wiEditDepth');
        if (depthEl) depthEl.value = entry.depth || 4;
        var depthVal = document.getElementById('wiEditDepthVal');
        if (depthVal) depthVal.textContent = entry.depth || 4;
        var scanDepthEl = document.getElementById('wiEditScanDepth');
        // 如果条目没有设置scanDepth，显示全局设置的值（默认2，与酒馆一致）
        var globalScanDepth = this.settings.scanDepth || 2;
        if (scanDepthEl) scanDepthEl.value = (entry.scanDepth != null ? entry.scanDepth : globalScanDepth);
        var scanDepthVal = document.getElementById('wiEditScanDepthVal');
        if (scanDepthVal) scanDepthVal.textContent = (entry.scanDepth != null ? entry.scanDepth : globalScanDepth);

        // 同步自定义checkbox显示
        var cb = this._getEditCheckboxes();

        if (cb.constant) cb.constant.classList.toggle('checked', !!entry.constant);
        if (cb.selective) cb.selective.classList.toggle('checked', !!entry.selective);
        if (cb.enabled) cb.enabled.classList.toggle('checked', !!(entry.enabled !== false));
        if (cb.disable) cb.disable.classList.toggle('checked', !!(entry.enabled === false));
        if (cb.excludeRec) cb.excludeRec.classList.toggle('checked', !!entry.excludeRecursion);
        if (cb.preventRec) cb.preventRec.classList.toggle('checked', !!entry.preventRecursion);
        if (cb.caseSensitive) cb.caseSensitive.classList.toggle('checked', !!entry.caseSensitive);
        if (cb.wholeWords) cb.wholeWords.classList.toggle('checked', !!entry.matchWholeWords);
        if (cb.ignoreBudget) cb.ignoreBudget.classList.toggle('checked', !!entry.ignoreBudget);
        if (cb.addMemo) cb.addMemo.classList.toggle('checked', !!entry.addMemo);
        if (cb.delayUntilRec) cb.delayUntilRec.classList.toggle('checked', !!entry.delayUntilRecursion);
        if (cb.groupOverride) cb.groupOverride.classList.toggle('checked', !!entry.groupOverride);
        if (cb.useGroupScoring) cb.useGroupScoring.classList.toggle('checked', !!entry.useGroupScoring);
        if (cb.useProbability) cb.useProbability.classList.toggle('checked', entry.useProbability !== false);

        // 同步高级设置
        var groupEl = document.getElementById('wiEditGroup');
        if (groupEl) groupEl.value = entry.group || '';
        var gwEl = document.getElementById('wiEditGroupWeight');
        if (gwEl) gwEl.value = entry.groupWeight || 100;
        var gwVal = document.getElementById('wiEditGroupWeightVal');
        if (gwVal) gwVal.textContent = entry.groupWeight || 100;
        var stickyEl = document.getElementById('wiEditSticky');
        if (stickyEl) stickyEl.value = (entry.sticky != null ? entry.sticky : '');
        var cooldownEl = document.getElementById('wiEditCooldown');
        if (cooldownEl) cooldownEl.value = (entry.cooldown != null ? entry.cooldown : '');
        var delayEl = document.getElementById('wiEditDelay');
        if (delayEl) delayEl.value = (entry.delay != null ? entry.delay : '');

        // 同步triggers触发器
        var triggersEl = document.getElementById('wiEditTriggers');
        if (triggersEl) {
            triggersEl.value = (entry.triggers || []).join('\n');
            // 清空验证提示
            var validationEl = document.getElementById('wiTriggersValidation');
            if (validationEl) validationEl.style.display = 'none';
        }

        // 同步滑块值显示
        var orderVal = document.getElementById('wiEntryOrderVal');
        if (orderVal) orderVal.textContent = entry.order || 100;
        var probVal = document.getElementById('wiEntryProbabilityVal');
        if (probVal) probVal.textContent = entry.probability || 100;

        // 存储当前编辑的UID
        this._editingUid = uid;
        UI.showModal('wiEntryModal');
    },

    // 保存条目
    saveEntry: function() {
        var uid = this._editingUid;
        if (!uid) return;

        var book = this.getCurrentBook();
        if (!book) return;

        // 从自定义checkbox同步到隐藏checkbox
        var cb = this._getEditCheckboxes();

        if (cb.constant) document.getElementById('wiEntryConstant').checked = cb.constant.classList.contains('checked');
        if (cb.selective) document.getElementById('wiEntrySelective').checked = cb.selective.classList.contains('checked');
        if (cb.enabled) document.getElementById('wiEntryEnabled').checked = cb.enabled.classList.contains('checked');
        if (cb.disable) document.getElementById('wiEntryEnabled').checked = !cb.disable.classList.contains('checked');

        var entry = book.entries[uid] || {};
        entry.key = document.getElementById('wiEntryKeys').value.split(',').map(function(k) { return k.trim(); }).filter(Boolean);
        entry.keysecondary = document.getElementById('wiEntrySecondaryKeys').value.split(',').map(function(k) { return k.trim(); }).filter(Boolean);
        entry.content = document.getElementById('wiEntryContent').value;
        entry.comment = document.getElementById('wiEntryComment').value;
        entry.constant = document.getElementById('wiEntryConstant').checked;
        entry.selective = document.getElementById('wiEntrySelective').checked;
        // 只使用enabled字段，不再维护disable/disabled
        entry.enabled = document.getElementById('wiEntryEnabled').checked;
        delete entry.disable;
        delete entry.disabled;
        entry.order = parseInt(document.getElementById('wiEntryOrder').value) || 100;
        entry.probability = parseInt(document.getElementById('wiEntryProbability').value) || 100;

        // 下拉框
        var posEl = document.getElementById('wiEditPosition');
        if (posEl) entry.position = safeInt(posEl.value, 0);
        var roleEl = document.getElementById('wiEditRole');
        if (roleEl) entry.role = safeInt(roleEl.value, 0);
        var logicEl = document.getElementById('wiEditLogic');
        if (logicEl) entry.selectiveLogic = safeInt(logicEl.value, 0);

        // 滑块
        var depthEl = document.getElementById('wiEditDepth');
        if (depthEl) entry.depth = parseInt(depthEl.value) || 4;
        var scanDepthEl = document.getElementById('wiEditScanDepth');
        if (scanDepthEl) {
            var sdv = parseInt(scanDepthEl.value);
            entry.scanDepth = isNaN(sdv) ? null : sdv;
        }

        // checkbox开关
        if (cb.excludeRec) entry.excludeRecursion = cb.excludeRec.classList.contains('checked');
        if (cb.preventRec) entry.preventRecursion = cb.preventRec.classList.contains('checked');
        if (cb.caseSensitive) entry.caseSensitive = cb.caseSensitive.classList.contains('checked');
        if (cb.wholeWords) entry.matchWholeWords = cb.wholeWords.classList.contains('checked');
        if (cb.ignoreBudget) entry.ignoreBudget = cb.ignoreBudget.classList.contains('checked');
        if (cb.addMemo) entry.addMemo = cb.addMemo.classList.contains('checked');
        if (cb.delayUntilRec) entry.delayUntilRecursion = cb.delayUntilRec.classList.contains('checked');
        if (cb.groupOverride) entry.groupOverride = cb.groupOverride.classList.contains('checked');
        if (cb.useGroupScoring) entry.useGroupScoring = cb.useGroupScoring.classList.contains('checked');
        if (cb.useProbability) entry.useProbability = cb.useProbability.classList.contains('checked');

        // 高级设置
        var groupEl = document.getElementById('wiEditGroup');
        if (groupEl) entry.group = groupEl.value.trim();
        var gwEl = document.getElementById('wiEditGroupWeight');
        if (gwEl) entry.groupWeight = parseInt(gwEl.value) || 100;
        var stickyEl = document.getElementById('wiEditSticky');
        if (stickyEl) {
            var sv = stickyEl.value.trim();
            entry.sticky = sv !== '' ? parseInt(sv) : null;
        }
    var cooldownEl = document.getElementById('wiEditCooldown');
    if (cooldownEl) {
        var cv = cooldownEl.value.trim();
        entry.cooldown = cv !== '' ? parseInt(cv) : null;
    }
    var delayEl = document.getElementById('wiEditDelay');
    if (delayEl) {
        var dv = delayEl.value.trim();
        entry.delay = dv !== '' ? parseInt(dv) : null;
    }

    // triggers触发器保存与验证
    var triggersEl = document.getElementById('wiEditTriggers');
    if (triggersEl) {
        var triggersText = triggersEl.value.trim();
        var triggersList = triggersText ? triggersText.split('\n').map(function(t) { return t.trim(); }).filter(Boolean) : [];

        // 验证每个trigger正则表达式
        var validationEl = document.getElementById('wiTriggersValidation');
        var invalidTriggers = [];
        var caseSensitive = entry.caseSensitive || false;

        triggersList.forEach(function(trigger) {
            try {
                var pattern = trigger;
                var flags = caseSensitive ? 'g' : 'gi';

                // 检查是否是 /pattern/flags 格式
                var match = trigger.match(/^\/(.+)\/([gimuy]*)$/);
                if (match) {
                    pattern = match[1];
                    flags = match[2] || '';
                    if (!flags.includes('g')) flags += 'g';
                    if (!caseSensitive && !flags.includes('i')) flags += 'i';
                }

                new RegExp(pattern, flags);
            } catch(e) {
                invalidTriggers.push({ trigger: trigger, error: e.message });
            }
        });

    if (invalidTriggers.length > 0) {
        // 显示验证错误
        if (validationEl) {
            validationEl.style.display = 'block';
            validationEl.style.color = 'var(--danger)';
            validationEl.innerHTML = '正则语法错误：<br>' + invalidTriggers.map(function(t) {
                return '• ' + escapeHtml(t.trigger.substring(0, 30)) + '... : ' + escapeHtml(t.error);
                }).join('<br>');
        }
    UI.toast('Triggers中有' + invalidTriggers.length + '个正则语法错误');
    return; // 阻止保存
    } else {
    // 清空验证提示
    if (validationEl) validationEl.style.display = 'none';
    }

    entry.triggers = triggersList;
    }

    book.entries[uid] = entry;
    this.save();
    UI.hideModal('wiEntryModal');
    this.renderCurrentView();
    UI.toast('条目已保存');

    // 【世界书↔记忆联动】同步到永久事实区（核心设定不丢失）
    try {
        if (window.EnhancedMemory && EnhancedMemory.syncWorldInfoEntry) {
            EnhancedMemory.syncWorldInfoEntry(entry, String(uid), book.id);
        }
    } catch (e) { console.warn('[WorldInfo] 同步到记忆失败:', e); }
    },

    // 删除条目
    deleteEntry: async function() {
        var uid = this._editingUid;
        var book = this.getCurrentBook();
        if (!uid || !book || !book.entries[uid]) return;
        var ok = await UI.confirm('删除条目', '确定删除这条目？');
        if (!ok) return;
        // 【世界书↔记忆联动】删除前清理对应的永久事实
        try {
            if (window.EnhancedMemory && EnhancedMemory.removeWorldAnchorsBySource) {
                EnhancedMemory.removeWorldAnchorsBySource('worldInfo:' + book.id + ':' + uid);
            }
        } catch (e) { console.warn('[WorldInfo] 清理记忆锚点失败:', e); }
        delete book.entries[uid];
        this.save();
        UI.hideModal('wiEntryModal');
        this.renderCurrentView();
        UI.toast('条目已删除');
    },

    // 添加新条目
    addEntry: function() {
        var book = this.getCurrentBook();
        if (!book) {
            UI.toast('请先选择一本书');
            return;
        }
        var uid = Date.now() + Math.floor(Math.random() * 1000);
        book.entries[uid] = {
            uid: uid,
            key: [],
            keysecondary: [],
            content: '',
            comment: '新条目',
            constant: false,
            selective: false,
            enabled: true,
            order: 100,
            probability: 100,
            depth: 4,
            position: 0,
            role: 0,
            group: '',
            groupOverride: false,
            groupWeight: 100,
            scanDepth: null,
            caseSensitive: null,
            matchWholeWords: null,
            excludeRecursion: false,
            preventRecursion: false,
            selectiveLogic: 0,
            sticky: null,
            cooldown: null,
            delay: null,
            delayUntilRecursion: false,
            ignoreBudget: false,
            addMemo: false,
            useGroupScoring: null,
            useProbability: true,
            vectorized: false,
            triggers: [],
            matchPersonaDescription: false,
            matchCharacterDescription: false,
            matchCharacterPersonality: false,
            matchCharacterDepthPrompt: false,
            matchScenario: false,
            matchCreatorNotes: false,
            automationId: '',
            outletName: ''
            };
        this.save();
        this.renderCurrentView();
        this.editEntry(uid);
        UI.toast('已创建新条目');
    },

    // 导出世界书（导出当前书或所有书）
    exportFile: function() {
        var book = this.getCurrentBook();
        var exportEntries = {};
        var exportName = '';

        if (this.currentView === 'detail' && book) {
            // 导出当前书
            exportName = book.name || '我的世界书';
            Object.keys(book.entries).forEach(function(uid) {
                var entry = book.entries[uid];
                exportEntries[uid] = WorldInfo._buildExportEntry(entry, uid);
                });
            } else {
            // 导出所有已启用书的条目
            exportName = '全部世界书';
            var allEntries = this.getAllEnabledEntries();
            Object.keys(allEntries).forEach(function(uid) {
                exportEntries[uid] = WorldInfo._buildExportEntry(allEntries[uid], uid);
                });
        }

        var data = {
            name: exportName,
            entries: exportEntries
            };
        UI.downloadJSON(data, exportName + '.json');
    },

    // 构建导出格式的单个条目
    _buildExportEntry: function(entry, uid) {
        var pos = typeof entry.position === 'number' ? entry.position : 0;
        var role = typeof entry.role === 'number' ? entry.role : 0;
        // position反向映射：优先导出字符串别名（与酒馆友好）
        var positionReverseMap = {
            0: 'before_char_definitions',
            1: 'after_char_definitions',
            2: 'before_example_messages',
            3: 'after_example_messages',
            4: 'top_of_author_note',
            5: 'bottom_of_author_note',
            6: 'at_depth',
            7: 'outlet'
            };
        var exportPosition = positionReverseMap[pos] || pos;
        return {
            id: parseInt(uid) || entry.uid || 0,
            key: entry.key || [],
            keysecondary: entry.keysecondary || [],
            comment: entry.comment || '',
            content: entry.content || '',
            constant: !!entry.constant,
            selective: !!entry.selective,
            insertion_order: entry.order || 100,
            // 只使用enabled字段
            enabled: entry.enabled !== false,
            position: exportPosition,
            extensions: {
                position: pos,
                exclude_recursion: !!entry.excludeRecursion,
                // probability直接使用0-100整数（酒馆V2规范）
                probability: entry.probability != null ? Math.round(entry.probability) : 100,
                useProbability: entry.useProbability !== false,
                depth: entry.depth || 4,
                selectiveLogic: entry.selectiveLogic || 0,
                group: entry.group || '',
                group_override: !!entry.groupOverride,
                group_weight: entry.groupWeight || 100,
                prevent_recursion: !!entry.preventRecursion,
                delay_until_recursion: !!entry.delayUntilRecursion,
                scan_depth: entry.scanDepth != null ? entry.scanDepth : null,
                match_whole_words: entry.matchWholeWords != null ? entry.matchWholeWords : null,
                use_group_scoring: entry.useGroupScoring != null ? entry.useGroupScoring : null,
                case_sensitive: entry.caseSensitive != null ? entry.caseSensitive : null,
                role: role,
                vectorized: !!entry.vectorized,
                display_index: entry.displayIndex || entry.uid || 0,
                // V2 Spec新增字段
                priority: entry.priority !== undefined ? entry.priority : 10,
                match_persona_description: !!entry.matchPersonaDescription,
                match_character_description: !!entry.matchCharacterDescription,
                match_character_personality: !!entry.matchCharacterPersonality,
                match_character_depth_prompt: !!entry.matchCharacterDepthPrompt,
                match_scenario: !!entry.matchScenario,
                match_creator_notes: !!entry.matchCreatorNotes,
                sticky: entry.sticky != null ? entry.sticky : null,
                cooldown: entry.cooldown != null ? entry.cooldown : null,
                delay: entry.delay != null ? entry.delay : null,
                triggers: entry.triggers || [],
                ignore_budget: !!entry.ignoreBudget,
                addMemo: !!entry.addMemo,
                automation_id: entry.automationId || '',
                outlet_name: entry.outletName || '',
                // 导出decorators（@@activate/@@dont_activate等V2装饰器）
                decorators: entry.decorators || []
            }
        };
    },

    // ===== 扫描引擎 =====

    // 轮次追踪器（用于delay/cooldown/sticky）
    _turnTracker: {},
    _currentTurn: 0,

    // 获取当前轮次（每次调用scan时递增）
    _getCurrentTurn: function() {
        return this._currentTurn;
        },

    // 【修复12】获取角色卡字段内容用于 WI 匹配
    _getCharacterCardFields: function() {
        var fields = {
            persona: '',
            description: '',
            personality: '',
            scenario: '',
            creatorNotes: ''
            };

        // 从 worldSnapshot 获取角色卡信息
        if (typeof gameState === 'undefined' || !gameState) {
            return fields;
        }

        if (gameState.worldSnapshot) {
            var snap = gameState.worldSnapshot;

            // persona 描述
            if (snap.player && snap.player.personality) {
                fields.persona = snap.player.personality;
            }

        // character description
        if (snap.characters && snap.characters.length > 0) {
            var char = snap.characters[0];
            if (char.desc) fields.description = char.desc;
            if (char.title) fields.personality += ' ' + char.title;
            if (char.favorability) fields.personality += ' 好感度:' + char.favorability;
            if (char.relation) fields.scenario += ' 关系:' + char.relation;
        }
    }

    // 从 gameState 获取额外信息
    if (gameState.userPrompt) {
        fields.scenario += ' ' + gameState.userPrompt;
    }

    // 从 conversationHistory 获取系统提示词中的角色信息
    if (gameState.conversationHistory && gameState.conversationHistory.length > 0) {
        var systemPrompt = gameState.conversationHistory[0];
        if (systemPrompt && systemPrompt.content) {
            // 尝试从系统提示词中提取角色描述
            fields.description += ' ' + (systemPrompt.content.substring(0, 500) || '');
        }
    }

    return fields;
    },

    // 扫描聊天记录，返回激活的条目
    scan: function(chatMessages, options) {
        const self = this;
        options = options || {};
        var activated = [];
        // 添加 chatMessages 参数验证
        if (!chatMessages || !Array.isArray(chatMessages)) {
            console.warn('[WorldInfo] scan: chatMessages 参数无效');
            return activated;
        }
        var scanDepth = this.settings.scanDepth;

        // 【修复 P1-8】缓存时序修复：先递增轮次，再判断缓存是否对应当前轮次
        // 旧代码：先判断缓存（基于旧 _currentTurn），再 _currentTurn++，导致缓存永远 miss
        // 新代码：先递增，再判断；同一轮次内多次 scan 可命中缓存，避免重复 DOM 查询
        this._currentTurn++;

        // 读取UI设置（缓存DOM查询，避免每次scan都getElementById）
        if (!this._settingsCache || this._settingsCache.turn !== this._currentTurn) {
            var depthEl = document.getElementById('wiScanDepth');
            var budgetEl = document.getElementById('wiTokenBudget');
            var recursiveEl = document.getElementById('wiRecursive');
            if (depthEl) this.settings.scanDepth = parseInt(depthEl.value) || 2;
            if (budgetEl) this.settings.tokenBudget = parseInt(budgetEl.value) || 25;
            if (recursiveEl) this.settings.recursive = recursiveEl.checked;
            this._settingsCache = { turn: this._currentTurn };
        }

        // 【修复4】构建扫描文本（最近N条消息）
        // 添加角色名前缀（使用 \x01 分隔，与酒馆兼容）
        // 这样可以支持用正则匹配特定角色的发言，如 /^User:/ 或 /^Assistant:/
        var recentMessages = chatMessages.slice(-scanDepth);
        var scanText = recentMessages.map(function(m) {
            // 提取角色名和内容
            var role = m.role || 'unknown';
            var content = (typeof m === 'string' ? m : (m.content || m.text || ''));
            // 角色名格式：User/Assistant/System（与酒馆兼容）
            var roleName = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
            // 使用 \x01 作为分隔符（酒馆使用）
            return roleName + '\x01' + content;
            }).join('\n');

        // 同时构建无前缀的纯文本版本（用于简单关键词匹配）
        var plainText = recentMessages.map(function(m) {
            return (typeof m === 'string' ? m : (m.content || m.text || ''));
            }).join('\n');

        // 获取所有已启用书的条目
        var allEntries = this.getAllEnabledEntries();

        // 遍历所有条目
        Object.keys(allEntries).forEach(function(uid) {
            var entry = allEntries[uid];
            // 只检查enabled字段，不再检查disable
            if (!entry || entry.disable === true || entry.disabled === true || entry.enabled === false) return;

            // 常驻条目直接激活
            if (entry.constant) {
                activated.push(entry);
                return;
            }

        // 【修复8】使用条目级别的 scan_depth 覆盖
        // 如果条目指定了 scan_depth，使用条目级别的值
        var entryScanDepth = (entry.scanDepth != null) ? entry.scanDepth : scanDepth;

        // delay检查：如果当前轮次 < delay值，跳过
        if (entry.delay != null && entry.delay > 0) {
            var turn = self._getCurrentTurn();
            if (turn < entry.delay) return;
        }

    // delay_until_recursion 检查
    // 如果条目设置了 delay_until_recursion，则在递归扫描阶段才激活
    if (entry.delayUntilRecursion && !options.inRecursiveScan) {
        // 跳过非递归扫描阶段的条目
        return;
    }

    // cooldown检查：如果上次激活距今 <= cooldown值，跳过（至少间隔cooldown轮）
    if (entry.cooldown != null && entry.cooldown > 0) {
        var tracker = self._turnTracker[uid];
        if (tracker && (self._currentTurn - tracker) <= entry.cooldown) return;
    }

    // 概率检查
    if (entry.useProbability && entry.probability < 100) {
        if (Math.random() * 100 > entry.probability) return;
    }

    // 【修复8】使用条目级别的扫描文本
    // 如果条目指定了 scan_depth，只扫描最近 entryScanDepth 条消息
    var entryScanText, entryPlainText;
    if (entry.scanDepth != null) {
        var entryRecentMessages = chatMessages.slice(-entryScanDepth);
        entryScanText = entryRecentMessages.map(function(m) {
            var role = m.role || 'unknown';
            var content = (typeof m === 'string' ? m : (m.content || m.text || ''));
            var roleName = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
            return roleName + '\x01' + content;
            }).join('\n');
        entryPlainText = entryRecentMessages.map(function(m) {
            return (typeof m === 'string' ? m : (m.content || m.text || ''));
            }).join('\n');
        } else {
        entryScanText = scanText;
        entryPlainText = plainText;
    }

    // 【修复12】将角色卡字段纳入 WI 匹配范围
    // 检查条目是否设置了匹配角色卡字段
    var charCardFields = '';
    if (entry.matchPersonaDescription || entry.matchCharacterDescription ||
    entry.matchCharacterPersonality || entry.matchScenario ||
    entry.matchCreatorNotes) {
        charCardFields = self._getCharacterCardFields();
    }

    // triggers触发器检查（优先级高于关键词匹配）
    // triggers 是一组正则表达式，任一匹配即激活
    var triggerMatch = false;
    if (entry.triggers && entry.triggers.length > 0) {
        triggerMatch = self.matchTriggers(entryScanText, entry.triggers, entry);
    }

    // 关键词匹配
    // 对于包含正则表达式的 key（以 / 开头），使用带前缀的扫描文本
    // 对于简单字符串 key，使用纯文本版本
    // 如果启用了角色卡字段匹配，也将角色卡内容加入扫描文本
    var primaryMatch = false;
    var hasRegexKey = entry.key && entry.key.some(function(k) {
        return typeof k === 'string' && k.startsWith('/');
        });

    if (hasRegexKey) {
        // 有正则 key，使用带前缀的文本
        primaryMatch = self.matchKeys(entryScanText, entry.key, entry);
        } else {
        // 简单字符串 key，使用纯文本
        primaryMatch = self.matchKeys(entryPlainText, entry.key, entry);
    }

    // 【修复12】如果主关键词匹配失败，但启用了角色卡字段匹配
    // 则检查角色卡字段是否匹配
    if (!primaryMatch && charCardFields) {
        if (entry.matchPersonaDescription && self.matchKeys(charCardFields.persona, entry.key, entry)) {
            primaryMatch = true;
        }
    if (!primaryMatch && entry.matchCharacterDescription && self.matchKeys(charCardFields.description, entry.key, entry)) {
        primaryMatch = true;
    }
    if (!primaryMatch && entry.matchCharacterPersonality && self.matchKeys(charCardFields.personality, entry.key, entry)) {
        primaryMatch = true;
    }
    if (!primaryMatch && entry.matchScenario && self.matchKeys(charCardFields.scenario, entry.key, entry)) {
        primaryMatch = true;
    }
    if (!primaryMatch && entry.matchCreatorNotes && self.matchKeys(charCardFields.creatorNotes, entry.key, entry)) {
        primaryMatch = true;
    }
    }

    // triggers触发器匹配成功也算作主匹配成功
    if (triggerMatch) {
        primaryMatch = true;
    }

    if (!primaryMatch) return;

    // 选择性逻辑（完整实现4种模式）
    if (entry.selective && entry.keysecondary && entry.keysecondary.length > 0) {
        var secondaryMatch = self.matchKeys(entryPlainText, entry.keysecondary, entry);
        var logic = entry.selectiveLogic || 0;
        var pass = false;

        switch (logic) {
            case 0: // AND_ANY: 主关键词 + 至少一个次要关键词
            pass = secondaryMatch;
            break;
            case 1: // NOT_ALL: 主关键词 + 非全部次要关键词
            pass = !self.matchKeysAll(entryPlainText, entry.keysecondary, entry);
            break;
            case 2: // NOT_ANY: 主关键词 + 非任一次关键词
            pass = !secondaryMatch;
            break;
            case 3: // AND_ALL: 主关键词 + 全部次要关键词
            pass = self.matchKeysAll(entryPlainText, entry.keysecondary, entry);
            break;
            default:
            pass = secondaryMatch;
        }
    if (!pass) return;
    }

    // 激活成功，更新轮次追踪
    self._turnTracker[uid] = self._currentTurn;
    activated.push(entry);
    });

    // 递归扫描
    if (this.settings.recursive) {
        activated = this.recursiveScan(activated, plainText, scanText, 3);
    }

    // 【修复6】包含组（Inclusion Group）逻辑
    // 同组条目同时触发时只选一个，按 group_weight 随机选择
    activated = this.applyInclusionGroups(activated);

    // 按order排序
    activated.sort(function(a, b) { return (a.order || 100) - (b.order || 100); });

    // Token预算控制（传入实际上下文长度）
    // 【修复 P0-1】用 contextSize（输入上下文窗口）而非 maxTokens（输出上限）
    // maxTokens 通常只有 4096，而 contextSize 可达 128000，用错会导致世界书预算被严重低估
    var contextLen = (typeof gameState !== 'undefined' && gameState.contextSize) ? gameState.contextSize : 8000;
    activated = this.applyBudget(activated, contextLen);

    return activated;
    },

    // 关键词匹配（任一匹配即可）
    matchKeys: function(haystack, keys, entry) {
        if (!keys || keys.length === 0) return false;
        var matchWholeWords = entry.matchWholeWords || false;
        var caseSensitive = entry.caseSensitive || false;

        var text = caseSensitive ? haystack : haystack.toLowerCase();

        if (!matchWholeWords) {
            return keys.some(function(key) {
                if (!key) return false;
                return text.indexOf(caseSensitive ? key : key.toLowerCase()) !== -1;
            });
        }

        var escapedKeys = [];
        for (var i = 0; i < keys.length; i++) {
            if (keys[i]) escapedKeys.push(keys[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        }
        if (escapedKeys.length === 0) return false;
        var combinedRegex = new RegExp('(?:^|\\W)(?:' + escapedKeys.join('|') + ')(?:$|\\W)', caseSensitive ? '' : 'i');
        return combinedRegex.test(haystack);
    },

    // triggers触发器匹配
    // triggers 是一组正则表达式字符串，任一匹配即返回true
    matchTriggers: function(haystack, triggers, entry) {
        if (!triggers || triggers.length === 0) return false;
        var caseSensitive = entry.caseSensitive || false;

        return triggers.some(function(trigger) {
            if (!trigger) return false;
            // 添加 ReDoS 防护：限制正则长度和复杂度
            if (trigger.length > 1000) {
                console.warn('[WorldInfo] trigger 正则过长，跳过:', truncateByChars(trigger, 50, '...'));
                return false;
            }
        try {
            // 支持两种格式：
            // 1. 纯正则字符串
            // 2. /pattern/flags 格式
            var pattern = trigger;
            var flags = caseSensitive ? 'g' : 'gi';

            // 检查是否是 /pattern/flags 格式
            var match = trigger.match(/^\/(.+)\/([gimuy]*)$/);
            if (match) {
                pattern = match[1];
                flags = match[2] || '';
                if (!flags.includes('g')) flags += 'g';
                if (!caseSensitive && !flags.includes('i')) flags += 'i';
            }

            // 检测潜在的 ReDoS 风险模式（嵌套量词）
            var redosRiskPattern = /(\(.+\)[+*?])+|(\[.+\][+*?])+|(\{.+\}[+*?])+/;
            if (redosRiskPattern.test(pattern) && (pattern.match(/[+*?]/g) || []).length > 3) {
                console.warn('[WorldInfo] trigger 正则可能存在 ReDoS 风险，跳过:', trigger);
                return false;
            }

        var regex = new RegExp(pattern, flags);
        return regex.test(haystack);
        } catch(e) {
            console.warn('[WorldInfo] 无效的trigger正则:', trigger, e);
            return false;
        }
    });
    },

    // 关键词匹配（全部匹配）
    matchKeysAll: function(haystack, keys, entry) {
        if (!keys || keys.length === 0) return false;
        var matchWholeWords = entry.matchWholeWords || false;
        var caseSensitive = entry.caseSensitive || false;

        var text = caseSensitive ? haystack : haystack.toLowerCase();

        return keys.every(function(key) {
            if (!key) return true;
            var k = caseSensitive ? key : key.toLowerCase();
            if (matchWholeWords) {
                var regex = new RegExp('(?:^|\\W)(' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?:$|\\W)', caseSensitive ? '' : 'i');
                return regex.test(haystack);
                } else {
                return text.indexOf(k) !== -1;
            }
        });
    },

    // 递归扫描
    recursiveScan: function(activated, plainText, scanText, maxSteps) {
        const self = this;
        var activatedIds = {};
        activated.forEach(function(e) { activatedIds[e.uid] = true; });
        var allActivated = activated.slice();

        var buffer = plainText;  // 纯文本用于关键词匹配
        var bufferWithPrefix = scanText;  // 带前缀的文本用于正则匹配
        for (var step = 0; step < maxSteps; step++) {
            var newContent = activated
            .filter(function(e) { return !e.excludeRecursion && !e.preventRecursion; })
            .map(function(e) { return e.content || ''; })
            .join('\n');
            buffer = buffer + '\n' + newContent;
            // 更新带前缀的版本（为新增内容添加通用前缀）
            bufferWithPrefix = bufferWithPrefix + '\nSystem\x01' + newContent;
            var newActivated = [];

            // 获取所有已启用书的条目（用于递归扫描）
            var allEntries = self.getAllEnabledEntries();

            Object.keys(allEntries).forEach(function(uid) {
                var entry = allEntries[uid];
                // 只检查enabled字段
                if (!entry || entry.disable === true || entry.disabled === true || entry.enabled === false || activatedIds[uid]) return;
                if (entry.constant || entry.excludeRecursion || entry.preventRecursion) return;

                // delay_until_recursion: 只在递归扫描阶段激活
                // 这些条目在主扫描阶段已被跳过，现在在递归阶段应该被检查
                // 所以这里不应该再跳过，而是正常处理
                // 注意：主扫描中已有 if (entry.delayUntilRecursion && !options.inRecursiveScan) return;

                // triggers触发器检查（优先级高于关键词匹配）
                var triggerMatch = false;
                if (entry.triggers && entry.triggers.length > 0) {
                    triggerMatch = self.matchTriggers(bufferWithPrefix, entry.triggers, entry);
                }

            // 关键词匹配：区分正则和简单字符串
            var hasRegexKey = entry.key && entry.key.some(function(k) {
                return typeof k === 'string' && k.startsWith('/');
                });

            var match = false;
            if (hasRegexKey) {
                match = self.matchKeys(bufferWithPrefix, entry.key, entry);
                } else {
                match = self.matchKeys(buffer, entry.key, entry);
            }

        // triggers触发器匹配成功也算作主匹配成功
        if (triggerMatch) {
            match = true;
        }

        if (match) {
            newActivated.push(entry);
            activatedIds[uid] = true;
        }
    });

    if (newActivated.length === 0) break;
    allActivated = allActivated.concat(newActivated);
    }

    return allActivated;
    },

    // 【修复6】包含组（Inclusion Group）逻辑
    // 同组条目同时触发时只选一个，按 group_weight 随机选择
    applyInclusionGroups: function(activated) {
        const self = this;
        var groups = {};  // groupName -> [entries]

        // 按 group 分组
        activated.forEach(function(entry) {
            var group = entry.group || '';
            if (!group) return;  // 没有 group 的条目不受影响

            if (!groups[group]) groups[group] = [];
            groups[group].push(entry);
            });

        // 处理每个组
        Object.keys(groups).forEach(function(group) {
            var groupEntries = groups[group];
            if (groupEntries.length <= 1) return;  // 组内只有1个或0个条目，不需要选择

            // 计算总权重
            var totalWeight = 0;
            groupEntries.forEach(function(e) {
                var weight = e.groupWeight || 100;
                // 如果启用了 use_group_scoring，权重基于匹配数量
                if (e.useGroupScoring && e._matchCount) {
                    weight = weight * e._matchCount;
                }
            totalWeight += weight;
            });

        // 随机选择
        var rand = Math.random() * totalWeight;
        var currentWeight = 0;
        var selectedEntry = groupEntries[0];

        for (var i = 0; i < groupEntries.length; i++) {
            var weight = groupEntries[i].groupWeight || 100;
            if (groupEntries[i].useGroupScoring && groupEntries[i]._matchCount) {
                weight = weight * groupEntries[i]._matchCount;
            }
        currentWeight += weight;
        if (rand <= currentWeight) {
            selectedEntry = groupEntries[i];
            break;
        }
    }

    // 移除组内其他条目，只保留选中的
    activated = activated.filter(function(e) {
        // 保留不在这个组的条目
        if (!e.group || e.group !== group) return true;
        // 保留被选中的条目
        return e.uid === selectedEntry.uid;
        });
    });

    return activated;
    },

    // Token预算控制（与SillyTavern一致）
    // 1. tokenBudget 现在是百分比（默认25%），需要根据上下文长度计算实际token数
    // 2. 支持 tokenBudgetCap 硬上限
    // 3. 支持 priority 字段，低优先级的条目在预算耗尽时先被丢弃
    applyBudget: function(activated, contextLength) {
        // 计算实际token预算
        var budgetPercent = this.settings.tokenBudget || 25;
        var budgetCap = this.settings.tokenBudgetCap || 0;
        // 估算总上下文token数（如果没有提供，默认8000）
        var estimatedContextTokens = contextLength || 8000;
        // 计算实际预算token数
        var budget = Math.floor(estimatedContextTokens * (budgetPercent / 100));
        // 如果有硬上限且大于0，应用硬上限
        if (budgetCap > 0 && budget > budgetCap) {
            budget = budgetCap;
        }
        // 确保最小预算为100token
        if (budget < 100) budget = 100;

        var totalTokens = 0;
        var result = [];
        var deferred = [];  // 优先级较低，等待预算的条目

        // 先按 priority 排序（数值越小优先级越高）
        // priority 默认是 10（与酒馆一致），V2 Spec新增字段
        activated.sort(function(a, b) {
            var priorityA = a.priority !== undefined ? a.priority : 10;
            var priorityB = b.priority !== undefined ? b.priority : 10;
            return priorityA - priorityB;  // 低 priority 值先加入
            });

        for (var i = 0; i < activated.length; i++) {
            var entry = activated[i];
            var content = entry.content || '';
            // 【修复 P1-1】统一 token 估算系数为 1.7 字符/token（旧代码 * 1.5 等价于 /0.67，严重高估）
            var tokens = Math.ceil(content.length / 1.7);

            // ignoreBudget: 跳过预算限制，直接加入结果
            if (entry.ignoreBudget) {
                result.push(entry);
                continue;
            }

        if (totalTokens + tokens > budget) {
            // 超出预算，检查是否有更高优先级的条目可以替换
            // 这里采用简单策略：低优先级的条目等待，高优先级的先加入
            deferred.push(entry);
            } else {
            totalTokens += tokens;
            result.push(entry);
        }
    }

    // 【优化】如果有预算剩余，尝试添加低优先级条目
    // 但需要重新检查优先级顺序
    if (deferred.length > 0) {
        deferred.sort(function(a, b) {
            var priorityA = a.priority !== undefined ? a.priority : 10;
            var priorityB = b.priority !== undefined ? b.priority : 10;
            return priorityA - priorityB;
            });

        for (var j = 0; j < deferred.length; j++) {
            var deferredEntry = deferred[j];
            // 【修复 P1-1】统一 token 估算系数为 1.7
            var deferredTokens = Math.ceil((deferredEntry.content || '').length / 1.7);
            if (totalTokens + deferredTokens <= budget) {
                totalTokens += deferredTokens;
                result.push(deferredEntry);
                } else {
                break;  // 后续条目更大，直接停止
            }
    }
    }

    return result;
    },

    // ===== 注入引擎 =====

    // position枚举（与SillyTavern完全一致）
    // 来源：SillyTavern public/scripts/world-info.js
    POSITION: {
        BEFORE_CHAR: 0,           // 角色定义之前
        AFTER_CHAR: 1,            // 角色定义之后
        EM_TOP: 2,                // 示例消息之前 (before_example_messages)
        EM_BOTTOM: 3,             // 示例消息之后 (after_example_messages)
        AN_TOP: 4,                // 作者备注顶部 (top_of_author_note) - 修正：原来是2
        AN_BOTTOM: 5,             // 作者备注底部 (bottom_of_author_note) - 修正：原来是3
        AT_DEPTH: 6,              // 在指定深度注入 - 修正：原来是4
        OUTLET: 7                 // 出口（自定义位置）
    },

    // role枚举
    ROLE: {
        SYSTEM: 0,
        USER: 1,
        ASSISTANT: 2
    },

    // 生成注入文本，按position分组返回
    // 返回: { beforeChar, afterChar, anTop, anBottom, atDepth, emTop, emBottom, outlet }
    buildInjectionGrouped: function(chatMessages) {
        var activated = this.scan(chatMessages);
        if (activated.length === 0) return null;

        // 【优化·世界书双重注入去重】跳过已被收割到 permanentFacts 的条目
        // 旧代码：同一条世界书条目会同时出现在【世界知识库】和【核心设定】中
        // 新代码：检测条目是否已被 syncWorldInfoEntry 收割，若是则跳过
        var _harvestedContents = {};
        try {
            if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.permanentFacts) {
                var pf = EnhancedMemory.permanentFacts;
                Object.keys(pf).forEach(function(key) {
                    var list = pf[key];
                    if (!Array.isArray(list)) return;
                    list.forEach(function(anchor) {
                        if (anchor && anchor.source && anchor.source.indexOf('worldInfo:') === 0 && anchor.content) {
                            // 存储原始 content 和带 label 的 content
                            _harvestedContents[anchor.content] = true;
                        }
                    });
                });
            }
        } catch(e) {
            console.warn('[WorldInfo] 构建 permanentFacts 去重索引失败:', e);
        }

        var groups = {
            beforeChar: [],
            afterChar: [],
            anTop: [],
            anBottom: [],
            atDepth: [],    // { entry, depth }
            emTop: [],
            emBottom: [],
            outlet: []
            };

        activated.forEach(function(entry) {
            // 【优化·去重】检查条目是否已被收割到 permanentFacts
            var entryContent = (entry.content || '').trim();
            var entryLabel = entry.comment || '';
            var labeledContent = entryLabel ? ('【' + entryLabel + '】 ' + entryContent) : entryContent;
            if (_harvestedContents[entryContent] || _harvestedContents[labeledContent]) {
                // 已被收割到 permanentFacts，跳过世界书注入，避免双重注入
                return;
            }

            var label = entry.comment || (entry.key || []).join(', ');
            var text = entry.addMemo
            ? '[' + label + ']: ' + (entry.content || '')
            : (entry.content || '');

            // position映射与SillyTavern完全一致
            // 0 = BEFORE_CHAR (角色定义之前)
            // 1 = AFTER_CHAR (角色定义之后)
            // 2 = BEFORE_EXAMPLE_MESSAGES (示例消息之前)
            // 3 = AFTER_EXAMPLE_MESSAGES (示例消息之后)
            // 4 = TOP_OF_AUTHOR_NOTE (作者备注顶部)
            // 5 = BOTTOM_OF_AUTHOR_NOTE (作者备注底部)
            // 6 = AT_DEPTH (在指定深度注入)
            // 7 = OUTLET (出口/自定义位置)
            var pos = entry.position || 0;
            switch (pos) {
                case 0: groups.beforeChar.push(text); break;      // BEFORE_CHAR
                case 1: groups.afterChar.push(text); break;       // AFTER_CHAR
                case 2: groups.emTop.push(text); break;           // BEFORE_EXAMPLE_MESSAGES
                case 3: groups.emBottom.push(text); break;        // AFTER_EXAMPLE_MESSAGES
                case 4: groups.anTop.push(text); break;           // TOP_OF_AUTHOR_NOTE
                case 5: groups.anBottom.push(text); break;        // BOTTOM_OF_AUTHOR_NOTE
                case 6: groups.atDepth.push({ text: text, depth: entry.depth || 4 }); break; // AT_DEPTH
                case 7: groups.outlet.push({ text: text, outletName: entry.outletName || '' }); break; // OUTLET
                default: groups.beforeChar.push(text); break;
            }
        });

        return groups;
    },

    // 生成注入文本，添加到system prompt中（兼容旧调用方式）
    // 同时返回结构化数据供高级调用者使用
    buildInjection: function(chatMessages) {
        var groups = this.buildInjectionGrouped(chatMessages);
        if (!groups) return { text: '', groups: null, positionTexts: {} };

        var positionTexts = {
            beforeChar: [],
            afterChar: [],
            emTop: [],
            emBottom: [],
            anTop: [],
            anBottom: []
            };

        // 各position的文本分别收集
        ['beforeChar', 'afterChar', 'emTop', 'emBottom', 'anTop', 'anBottom'].forEach(function(pos) {
            groups[pos].forEach(function(text) {
                positionTexts[pos].push(MacroEngine.process(text));
                });
            });

        // atDepth条目存储到 gameState._depthPrompts
        // 【阶段4统一】写入前先清除上一轮的 worldInfo 条目，避免跨轮累积
        if (groups.atDepth && groups.atDepth.length > 0) {
            // 添加 gameState 未定义检查
            if (typeof gameState !== 'undefined' && gameState) {
                if (!gameState._depthPrompts) gameState._depthPrompts = {};
                // 清除上一轮的 worldInfo 条目
                Object.keys(gameState._depthPrompts).forEach(function(d) {
                    gameState._depthPrompts[d] = (gameState._depthPrompts[d] || []).filter(function(e) {
                        return e._source !== 'worldInfo';
                    });
                    if (gameState._depthPrompts[d].length === 0) delete gameState._depthPrompts[d];
                });
                groups.atDepth.forEach(function(item) {
                    var depth = item.depth || 4;
                    if (!gameState._depthPrompts[depth]) gameState._depthPrompts[depth] = [];
                    // 按 identifier 去重注册
                    var _id = 'worldInfo_depth_' + depth + '_' + (item.comment || item.name || Math.random().toString(36).slice(2,8));
                    var _existing = gameState._depthPrompts[depth].findIndex(function(e) { return e.identifier === _id; });
                    var _entry = {
                        enabled: true,
                        content: MacroEngine.process(item.text),
                        identifier: _id,
                        name: 'WI@Depth' + depth,
                        _order: item.order !== undefined ? item.order : 100,
                        _source: 'worldInfo',
                        injection_position: 0
                    };
                    if (_existing >= 0) {
                        gameState._depthPrompts[depth][_existing] = _entry;
                    } else {
                        gameState._depthPrompts[depth].push(_entry);
                    }
                });
            }
        }

    // outlet条目存储到宏变量
    if (groups.outlet && groups.outlet.length > 0) {
        if (typeof MacroEngine !== 'undefined') {
            groups.outlet.forEach(function(item) {
                var outletName = item.outletName || 'default';
                MacroEngine.setLocalVar('outlet_' + outletName, item.text);
                });
        }
    }

    // 兼容旧调用：生成合并文本
    var allTexts = [];
    ['beforeChar', 'afterChar', 'emTop', 'emBottom', 'anTop', 'anBottom'].forEach(function(pos) {
        positionTexts[pos].forEach(function(text) { allTexts.push(text); });
        });

    var mergedText = '';
    if (allTexts.length > 0) {
        var lines = ['【世界知识库】'];
        allTexts.forEach(function(text) { lines.push(text); });
        mergedText = lines.join('\n');
    }

    return {
        text: mergedText,
        groups: groups,
        positionTexts: positionTexts
        };
    },

    // 获取指定角色的注入文本
    getInjectionByRole: function(chatMessages, role) {
        var activated = this.scan(chatMessages);
        if (activated.length === 0) return '';

        var texts = [];
        activated.forEach(function(entry) {
            if ((entry.role || 0) === role) {
                var label = entry.comment || (entry.key || []).join(', ');
                texts.push(entry.addMemo
                ? '[' + label + ']: ' + (entry.content || '')
                : (entry.content || ''));
            }
        });

        return texts.length > 0 ? texts.join('\n') : '';
    }
};
