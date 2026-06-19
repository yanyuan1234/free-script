// ========================================
// 第0层: 全局变量和配置
// ========================================
// 【已清理】移除开发模式日志重定向，减少运行时开销
// ========================================
// 自由剧本 - 完整游戏逻辑
// ========================================

// ========================================
// 统一联动系统：数据变更广播 + 页面联动刷新
// ========================================
var GameLinker = {
    // 注册各页面的刷新函数
    _refreshers: {},
    // 注册刷新函数：pageName -> function
    register: function(pageName, refreshFn) {
        this._refreshers[pageName] = refreshFn;
    },
    // 触发指定页面的刷新（如果该页面当前可见）
    refresh: function(pageName) {
        var fn = this._refreshers[pageName];
        if (fn) {
            try { fn(); } catch (e) { console.warn('[GameLinker] 刷新 ' + pageName + ' 失败:', e); }
        }
    },
    // 触发所有页面的刷新（用于全局数据变更）
    // 合并为单次 rAF，避免页面多时触发多次 requestAnimationFrame
    refreshAll: function() {
        var self = this;
        if (self._rafPending) return;
        self._rafPending = true;
        requestAnimationFrame(function() {
            self._rafPending = false;
            var pages = Object.keys(self._refreshers);
            for (var i = 0; i < pages.length; i++) {
                self.refresh(pages[i]);
            }
        });
    },
    // 触发除当前页面外的所有页面刷新（避免当前页面重复刷新）
    refreshOthers: function(exceptPage) {
        var self = this;
        if (self._rafPending) return;
        self._rafPending = true;
        requestAnimationFrame(function() {
            self._rafPending = false;
            var pages = Object.keys(self._refreshers);
            for (var i = 0; i < pages.length; i++) {
                if (pages[i] !== exceptPage) {
                    self.refresh(pages[i]);
                }
            }
        });
    },
    // 智能刷新：根据变更的数据类型，自动推断需要刷新的页面
    // 【性能优化】合并同一帧内的多次刷新请求，避免重复渲染
    _pendingPages: {},
    refreshByDataChange: function(changeType) {
        var map = {
            playerData: ['playerPage'],
            allCharacters: ['npcPage', 'playerPage', 'memoryPage', 'recapPage'],
            relationships: ['playerPage', 'npcPage', 'memoryPage'],
            currentQuests: ['storyPage', 'logPage', 'memoryPage'],
            currentBag: ['playerPage', 'logPage', 'memoryPage'],
            keyEvents: ['recapPage', 'storyPage', 'memoryPage'],
            rollingSummary: ['storyPage', 'recapPage'],
            worldSnapshot: ['storyPage', 'playerPage', 'npcPage'],
            conversationHistory: ['storyPage', 'recapPage'],
            _chatLogs: ['npcPage', 'storyPage'],
            _worldModules: ['logPage', 'storyPage'],
            _memory: ['memoryPage'],
            gameTime: ['storyPage', 'logPage']
        };
        var pages = map[changeType];
        if (pages) {
            var self = this;
            for (var i = 0; i < pages.length; i++) {
                self._pendingPages[pages[i]] = true;
            }
            // 合并到同一帧执行，避免多次 rAF 触发多次渲染
            if (!self._rafScheduled) {
                self._rafScheduled = true;
                requestAnimationFrame(function() {
                    self._rafScheduled = false;
                    var toRefresh = Object.keys(self._pendingPages);
                    self._pendingPages = {};
                    for (var j = 0; j < toRefresh.length; j++) {
                        self.refresh(toRefresh[j]);
                    }
                });
            }
        }
    }
};

// ========================================
// 数据联通（方案 A：单一来源）
// ========================================
// 设计：gm.tables.* / gm.quests / gm.events 是权威源
//       gameState.allCharacters / currentBag / currentQuests / relationships / keyEvents 是视图
// 任何写入权威源后，调用 _ensureDataLinkage() 自动同步到视图
// 视图别名：gameState.allCharacters === gm.tables.characters（同一引用，最快）
// ========================================

// 物品同步：gm.tables.items (keyed) → gameState.currentBag (array)
function _syncItemsToBag() {
    if (typeof gameState === 'undefined' || !gameState) return;
    if (typeof window === 'undefined' || !window.GameMemory) return;
    var gm = window.GameMemory;
    if (!gm.tables || !gm.tables.items) return;
    var items = gm.tables.items;
    var bag = [];
    Object.keys(items).forEach(function(name) {
        var it = items[name];
        if (!it) return;
        bag.push({
            name: it.name || name,
            count: it.qty || 1,
            unit: it.unit || '个',
            rarity: it.rarity || '普通',
            desc: it.desc || '',
            usable: it.usable || false,
            effect: it.effect || '',
            equippable: it.equippable || false,
            equipped: it.equipped || false,
            slot: it.slot || ''
        });
    });
    gameState.currentBag = bag;
}

// 任务同步：gm.quests (array) → gameState.currentQuests (array, 旧格式)
function _syncQuestsToGameState() {
    if (typeof gameState === 'undefined' || !gameState) return;
    if (typeof window === 'undefined' || !window.GameMemory) return;
    var gm = window.GameMemory;
    if (!Array.isArray(gm.quests)) return;
    gameState.currentQuests = gm.quests.map(function(q) {
        return {
            title: q.content || '',
            type: q.type || 'quest',
            status: q.status || 'pending',
            progress: q.progress || '',
            hint: q.hint || ''
        };
    });
}

// 关系同步：gm.tables.relationships (keyed) → gameState.relationships (array)
function _syncRelationshipsToGameState() {
    if (typeof gameState === 'undefined' || !gameState) return;
    if (typeof window === 'undefined' || !window.GameMemory) return;
    var gm = window.GameMemory;
    if (!gm.tables || !gm.tables.relationships) {
        gameState.relationships = [];
        return;
    }
    var rels = gm.tables.relationships;
    var arr = [];
    Object.keys(rels).forEach(function(key) {
        var r = rels[key];
        if (!r) return;
        if (Array.isArray(r)) {
            r.forEach(function(item) { arr.push(item); });
        } else {
            arr.push(r);
        }
    });
    gameState.relationships = arr;
}

// 事件同步：gm.events (array) → gameState.keyEvents (array of strings)
function _syncEventsToKeyEvents() {
    if (typeof gameState === 'undefined' || !gameState) return;
    if (typeof window === 'undefined' || !window.GameMemory) return;
    var gm = window.GameMemory;
    if (!Array.isArray(gm.events)) return;
    // gm.events 是对象数组 {content, importance, ...}，keyEvents 是字符串数组
    gameState.keyEvents = gm.events.map(function(e) {
        return typeof e === 'string' ? e : (e.content || (e.event ? e.event : ''));
    }).filter(function(s) { return s && s.length > 0; });
}

// 总入口：把所有权威源同步到视图
function _ensureDataLinkage() {
    if (typeof gameState === 'undefined' || !gameState) return;
    if (typeof window === 'undefined' || !window.GameMemory) return;
    var gm = window.GameMemory;
    // 1. 角色：建立引用别名（最快方式）
    if (gm.tables && gm.tables.characters) {
        if (gameState.allCharacters !== gm.tables.characters) {
            // 只有在不同引用时才重新别名（避免循环引用警告）
            gameState.allCharacters = gm.tables.characters;
        }
    }
    // 2-5. 其他视图同步
    _syncItemsToBag();
    _syncQuestsToGameState();
    _syncRelationshipsToGameState();
    _syncEventsToKeyEvents();
}

// 把 gameState.currentBag 反向推送到 gm.tables.items（让权威源更新）
function _pushCurrentBagToGM() {
    if (typeof gameState === 'undefined' || !gameState) return;
    if (typeof window === 'undefined' || !window.GameMemory) return;
    var gm = window.GameMemory;
    if (!gm.tables) gm.tables = {};
    if (!gm.tables.items) gm.tables.items = {};
    if (!Array.isArray(gameState.currentBag)) return;
    gameState.currentBag.forEach(function(b) {
        if (!b || !b.name) return;
        var existing = gm.tables.items[b.name];
        if (existing) {
            if (b.count !== undefined) existing.qty = b.count;
            if (b.unit) existing.unit = b.unit;
            if (b.rarity) existing.rarity = b.rarity;
            if (b.desc !== undefined) existing.desc = b.desc;
            if (b.usable !== undefined) existing.usable = b.usable;
            if (b.effect !== undefined) existing.effect = b.effect;
            if (b.equippable !== undefined) existing.equippable = b.equippable;
            if (b.equipped !== undefined) existing.equipped = b.equipped;
            if (b.slot !== undefined) existing.slot = b.slot;
            existing.lastChangedTurn = gm.currentTurn;
        } else {
            gm.tables.items[b.name] = {
                name: b.name,
                qty: b.count || 1,
                unit: b.unit || '个',
                rarity: b.rarity || '普通',
                desc: b.desc || '',
                usable: b.usable || false,
                effect: b.effect || '',
                equippable: b.equippable || false,
                equipped: b.equipped || false,
                slot: b.slot || '',
                obtainedTurn: gm.currentTurn,
                lastChangedTurn: gm.currentTurn
            };
        }
    });
}

// 把 gameState.currentQuests 反向推送到 gm.quests
function _pushCurrentQuestsToGM() {
    if (typeof gameState === 'undefined' || !gameState) return;
    if (typeof window === 'undefined' || !window.GameMemory) return;
    var gm = window.GameMemory;
    if (!Array.isArray(gm.quests)) gm.quests = [];
    if (!Array.isArray(gameState.currentQuests)) return;
    var titleMap = {};
    gm.quests.forEach(function(q) { if (q && q.content) titleMap[q.content] = q; });
    gameState.currentQuests.forEach(function(cq) {
        if (!cq || !cq.title) return;
        var gq = titleMap[cq.title];
        if (!gq) {
            gq = { content: cq.title, type: cq.type || 'quest', status: 'pending', createdTurn: gm.currentTurn || 0, resolvedTurn: 0 };
            gm.quests.push(gq);
            titleMap[cq.title] = gq;
        }
        gq.type = cq.type || gq.type;
        // 状态映射：中文 → gm 内部状态
        if (cq.status === '已完成' || cq.status === 'resolved') {
            gq.status = 'resolved';
            if (!gq.resolvedTurn) gq.resolvedTurn = gm.currentTurn || 0;
        } else if (cq.status === '失败' || cq.status === 'broken') {
            gq.status = 'broken';
            if (!gq.resolvedTurn) gq.resolvedTurn = gm.currentTurn || 0;
        } else {
            gq.status = 'pending';
        }
    });
}

// 把 gameState.relationships 反向推送到 gm.tables.relationships
function _pushRelationshipsToGM() {
    if (typeof gameState === 'undefined' || !gameState) return;
    if (typeof window === 'undefined' || !window.GameMemory) return;
    var gm = window.GameMemory;
    if (!gm.tables) gm.tables = {};
    if (!gm.tables.relationships) gm.tables.relationships = {};
    if (!Array.isArray(gameState.relationships)) return;
    // 用 from→to 作为 key
    gameState.relationships.forEach(function(r) {
        if (!r || !r.from || !r.to) return;
        var key = r.from + '→' + r.to;
        if (gm.tables.relationships[key]) {
            Object.assign(gm.tables.relationships[key], r);
        } else {
            gm.tables.relationships[key] = Object.assign({}, r);
        }
    });
}

// 把 gameState.keyEvents 反向推送到 gm.events
function _pushKeyEventsToGM() {
    if (typeof gameState === 'undefined' || !gameState) return;
    if (typeof window === 'undefined' || !window.GameMemory) return;
    var gm = window.GameMemory;
    if (!Array.isArray(gm.events)) gm.events = [];
    if (!Array.isArray(gameState.keyEvents)) return;
    gameState.keyEvents.forEach(function(evt) {
        if (typeof evt !== 'string' || !evt) return;
        var exists = gm.events.some(function(e) {
            var content = typeof e === 'string' ? e : (e.content || '');
            return content === evt;
        });
        if (!exists) {
            gm.events.push({ content: evt, importance: 7, source: 'story_parsed', turn: gm.currentTurn || 0 });
        }
    });
}

// 拦截 gm.saveToStorage：保存后自动同步 + 通知 UI
(function _wrapGMSaveToStorage() {
    if (typeof window === 'undefined') return;
    var checkInterval = setInterval(function() {
        if (window.GameMemory && window.GameMemory.saveToStorage && !window.GameMemory._saveToStorageWrapped) {
            var orig = window.GameMemory.saveToStorage;
            window.GameMemory.saveToStorage = function() {
                var result = orig.apply(this, arguments);
                try { _ensureDataLinkage(); } catch (e) { console.warn('[DataLinkage] 同步失败:', e); }
                return result;
            };
            window.GameMemory._saveToStorageWrapped = true;
            clearInterval(checkInterval);
        }
    }, 200);
    // 10秒后停止检查（GameMemory 正常情况下 1-2 秒内就初始化完成）
    setTimeout(function() { clearInterval(checkInterval); }, 10000);
})();

// ========================================
// UI工具
// ========================================

/**
 * 【全游戏弹窗策略】所有自动消失的弹窗都必须在 3 秒内消失
 * 理由：用户偏好快速反馈，避免视线被无关通知遮蔽
 * 适用范围：toast / 错误 banner / API 成功失败提示 / 成就解锁 / NPC 消息提醒
 * 不适用：UI.confirm / UI.alert / UI.prompt / 模态框（需用户主动操作）
 *
 * 修改本常量即可全局生效。新增弹窗必须使用本常量，禁用硬编码 3000
 */
var POPUP_DURATION_MS = 3000;
// 兼容旧代码：UI.TOAST_DURATION 是 POPUP_DURATION_MS 的别名
var TOAST_DURATION_MS = POPUP_DURATION_MS;
var UI = {
    // 【全游戏弹窗策略】常量对外暴露（约定：3 秒 = 3000ms）
    TOAST_DURATION: POPUP_DURATION_MS,
    // 【导航栈】支持返回上一级
    _navStack: [],
    pushNav: function(type, id) {
        // type: 'page' 或 'modal'
        this._navStack.push({ type: type, id: id });
        history.pushState(null, '', location.href);
    },
    popNav: function() {
        if (this._navStack.length === 0) return false;
        var top = this._navStack.pop();
        if (top.type === 'modal') {
            this.hideModal(top.id);
            return true;
        }
        if (top.type === 'page') {
            // 非剧情页返回剧情页
            if (top.id !== 'storyPage') {
                this.showPage('storyPage');
                if (typeof renderNavBar === 'function') {
                    renderNavBar('gameNav', UI.GAME_NAV_TABS, 0);
                }
            }
            return true;
        }
        return false;
    },
    toast: function(msg) {
        var ct = DOMCache.get('toastContainer', true);
        if (!ct) return;
        var t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        // 【阶段三】屏幕阅读器播报
        t.setAttribute('role', 'status');
        t.setAttribute('aria-live', 'polite');
        t.setAttribute('aria-atomic', 'true');
        ct.appendChild(t);
        // 【全游戏弹窗策略】3 秒自动消失——使用 POPUP_DURATION_MS 常量
        // 【缺陷修复】使用唯一 key，避免连续 toast 时旧定时器被清除导致 DOM 永久残留
        var toastKey = 'uiToast_' + Date.now() + '_' + Math.random();
        TimerManager.setTimeout(toastKey, function() {
            if (t.parentNode) t.remove();
        }, POPUP_DURATION_MS);
    },
    showPage: function(id) {
        var el = document.getElementById(id);
        if (el && el.classList.contains('active')) return;
        // 【导航栈】页面切换时入栈（剧情页不入栈，它是根页面）
        if (id !== 'storyPage' && id !== 'menuPage' && id !== 'loadingPage') {
            this.pushNav('page', id);
        }
        var pages = document.querySelectorAll('.page');
        for (var pi = 0; pi < pages.length; pi++) {
            pages[pi].classList.remove('active');
        }
        if (el) el.classList.add('active');
        el.scrollTop = 0;
        var body = el.querySelector('.page-body');
        if (body) body.scrollTop = 0;
        // 【打字机优化】离开剧情页时强制隐藏「跳过」按钮，避免在其他页面残留
        if (id !== 'storyPage' && typeof _hideSkipButton === 'function') {
            try { _hideSkipButton(); } catch (e) {}
        }
    },
    _modalStack: [],
    _lastFocusBeforeModal: null,
    _modalKeydownBound: false,
    // 【阶段三】可聚焦元素选择器（用于焦点陷阱）
    _focusableSelector: 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    showModal: function(id) {
        var el = document.getElementById(id);
        if (el) {
            // 【缺陷修复】已激活的 modal 不重复入栈，避免 z-index 虚高和导航栈残留
            if (this._modalStack.indexOf(id) !== -1) {
                return;
            }
            // 记录打开弹窗前的焦点元素，关闭时恢复
            if (this._modalStack.length === 0) {
                this._lastFocusBeforeModal = document.activeElement;
            }
            // 【导航栈】模态框打开时入栈
            this.pushNav('modal', id);
            // 模态框栈管理：每次打开新模态框时提升z-index
            this._modalStack.push(id);
            var zIndex = 100 + this._modalStack.length * 10;
            el.style.zIndex = zIndex;
            el.classList.add('active');
            // 兼容动态创建的弹窗（使用 display 控制）
            if (el.classList.contains('modal-overlay')) {
                el.style.display = 'flex';
            }
            // 【阶段三】ARIA 属性：标记为模态对话框
            if (!el.getAttribute('role')) el.setAttribute('role', 'dialog');
            el.setAttribute('aria-modal', 'true');
            // 尝试关联标题
            var titleEl = el.querySelector('.modal-title, .modal-header h3, h3, h2, .title');
            if (titleEl) {
                if (!titleEl.id) titleEl.id = id + '_title';
                el.setAttribute('aria-labelledby', titleEl.id);
            }
            // 【阶段三】焦点管理：移到第一个可聚焦元素，或弹窗本身
            this._focusModal(el);
            // 【阶段三】绑定全局键盘事件（仅一次）
            this._bindModalKeyboard();
            // 点击遮罩区域关闭模态框
            if (!el._maskClickBound) {
                el._maskClickBound = true;
                el.addEventListener('click', function(e) {
                    if (e.target !== el) return;
                    // 【缺陷修复】confirm/prompt 遮罩点击时触发 resolve，避免 Promise 永久悬挂
                    if (el.id === 'confirmModal') {
                        var yb = document.getElementById('confirmYes');
                        var nb = document.getElementById('confirmNo');
                        if (yb && yb._confirmResolve) { yb._confirmResolve(false); yb._confirmResolve = null; }
                        if (nb) nb._confirmResolve = null;
                    } else if (el.id === 'promptModal') {
                        var ob = document.getElementById('promptOk');
                        var cb = document.getElementById('promptCancel');
                        if (ob && ob._promptResolve) { ob._promptResolve(null); ob._promptResolve = null; }
                        if (cb) cb._promptResolve = null;
                    } else if (el.id === 'generatingModal') {
                        // 【缺陷修复】遮罩点击触发 onCancel，避免 AI 请求在后台继续运行
                        if (typeof el._generatingOnCancel === 'function') {
                            var cb2 = el._generatingOnCancel;
                            el._generatingOnCancel = null;
                            try { cb2(); } catch (e2) { console.warn('[Generating] mask onCancel:', e2); }
                        }
                    }
                    UI.hideModal(el.id);
                });
            }
        }
    },
    // 【阶段三】将焦点移入弹窗
    _focusModal: function(el) {
        var focusable = el.querySelectorAll(this._focusableSelector);
        var target = null;
        // 优先聚焦到输入框或确认按钮
        for (var i = 0; i < focusable.length; i++) {
            var tag = focusable[i].tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') {
                target = focusable[i];
                break;
            }
        }
        if (!target && focusable.length > 0) target = focusable[0];
        if (target) {
            try { target.focus(); } catch(e) {}
        } else {
            el.setAttribute('tabindex', '-1');
            try { el.focus(); } catch(e) {}
        }
    },
    // 【阶段三】绑定全局弹窗键盘事件（Escape 关闭、Tab 焦点陷阱）
    _bindModalKeyboard: function() {
        if (this._modalKeydownBound) return;
        this._modalKeydownBound = true;
        document.addEventListener('keydown', function(e) {
            if (UI._modalStack.length === 0) return;
            var topId = UI._modalStack[UI._modalStack.length - 1];
            var topModal = document.getElementById(topId);
            if (!topModal) return;

            // Escape 关闭最顶层弹窗（confirm/prompt/generating 需要明确操作，不关闭）
            if (e.key === 'Escape' || e.code === 'Escape' || e.keyCode === 27) {
                if (topId === 'confirmModal' || topId === 'promptModal' || topId === 'generatingModal') return;
                e.preventDefault();
                UI.hideModal(topId);
                return;
            }

            // Tab 焦点陷阱
            if (e.key === 'Tab' || e.code === 'Tab') {
                var focusable = topModal.querySelectorAll(UI._focusableSelector);
                if (focusable.length === 0) return;
                var first = focusable[0];
                var last = focusable[focusable.length - 1];
                if (e.shiftKey) {
                    if (document.activeElement === first || !topModal.contains(document.activeElement)) {
                        e.preventDefault();
                        last.focus();
                    }
                } else {
                    if (document.activeElement === last || !topModal.contains(document.activeElement)) {
                        e.preventDefault();
                        first.focus();
                    }
                }
            }
        });
    },
    // ========================================
    // 【统一弹窗管理】动态创建模态框，走统一调度
    // 用法：UI.createModal({ id, html, onClose?, persistent? })
    // - id: 唯一标识，用于 showModal/hideModal 管理
    // - html: 弹窗内容 HTML
    // - onClose: 关闭回调（可选）
    // - persistent: true 时不自动移除 DOM，仅隐藏（可选）
    // ========================================
    createModal: function(opts) {
        var id = opts.id || ('dynamicModal_' + Date.now());
        // 如果已存在同 id 的弹窗，先移除
        var existing = document.getElementById(id);
        if (existing) existing.remove();
        // 创建遮罩层
        var overlay = document.createElement('div');
        overlay.id = id;
        overlay.className = 'modal-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100;display:none;align-items:center;justify-content:center;';
        // 创建内容容器
        var content = document.createElement('div');
        content.className = 'modal-content';
        content.setAttribute('role', 'document');
        content.innerHTML = opts.html || '';
        content.style.cssText = 'background:var(--card);border-radius:var(--radius-lg);max-width:400px;width:90%;max-height:80vh;overflow-y:auto;padding:20px;';
        overlay.appendChild(content);
        document.body.appendChild(overlay);
        // 注册关闭回调和持久化标记（由 hideModal 统一调度）
        if (opts.onClose) overlay._onClose = opts.onClose;
        overlay._persistent = !!opts.persistent;
        overlay._isDynamic = true; // 标记为动态创建的弹窗
        // 【阶段三】动态弹窗内容基础 ARIA 增强
        var newBtns = overlay.querySelectorAll('button:not([type])');
        for (var b = 0; b < newBtns.length; b++) newBtns[b].setAttribute('type', 'button');
        var newSvgs = overlay.querySelectorAll('svg');
        for (var s = 0; s < newSvgs.length; s++) {
            newSvgs[s].setAttribute('aria-hidden', 'true');
            newSvgs[s].setAttribute('focusable', 'false');
        }
        // 自动显示（showModal 会统一绑定遮罩点击关闭事件）
        UI.showModal(id);
        return overlay;
    },
    hideModal: function(id) {
        var el = document.getElementById(id);
        if (el) {
            el.classList.remove('active');
            el.style.display = 'none';
            el.style.zIndex = '';
            // 从栈中移除
            var idx = this._modalStack.indexOf(id);
            if (idx !== -1) this._modalStack.splice(idx, 1);
            // 【导航栈】从导航栈中移除对应条目
            for (var i = this._navStack.length - 1; i >= 0; i--) {
                if (this._navStack[i].type === 'modal' && this._navStack[i].id === id) {
                    this._navStack.splice(i, 1);
                    break;
                }
            }
            // 触发关闭回调
            if (el._onClose) el._onClose();
            // 非持久化的动态弹窗自动清理 DOM
            if (el._isDynamic && !el._persistent) {
                el.remove();
            }
            // 【阶段三】恢复焦点到打开弹窗前的元素（当所有弹窗都关闭时）
            if (this._modalStack.length === 0 && this._lastFocusBeforeModal) {
                try { this._lastFocusBeforeModal.focus(); } catch(e) {}
                this._lastFocusBeforeModal = null;
            }
        }
    },
    confirm: function(title, message) {
        return new Promise(function(resolve) {
            var titleEl = document.getElementById('confirmTitle');
            var msgEl = document.getElementById('confirmMessage');
            if (!titleEl || !msgEl) {
                resolve(false);
                return;
            }
        titleEl.textContent = title;
        msgEl.textContent = message;
        UI.showModal('confirmModal');
    var yesBtn = document.getElementById('confirmYes');
    if (!yesBtn) {
        resolve(false);
        return;
    }
    // 【性能优化】用 _hasBound 标记代替 cloneNode，避免每次创建新元素
    if (!yesBtn._confirmHandler) {
        yesBtn._confirmHandler = function() {
            UI.hideModal('confirmModal');
            if (yesBtn._confirmResolve) yesBtn._confirmResolve(true);
        };
        yesBtn.addEventListener('click', yesBtn._confirmHandler);
    }
    yesBtn._confirmResolve = resolve;
    // 绑定"否"按钮，防止Promise永远悬挂
    var noBtn = document.getElementById('confirmNo');
    if (noBtn) {
        if (!noBtn._confirmHandler) {
            noBtn._confirmHandler = function() {
                UI.hideModal('confirmModal');
                if (noBtn._confirmResolve) noBtn._confirmResolve(false);
            };
            noBtn.addEventListener('click', noBtn._confirmHandler);
        }
        noBtn._confirmResolve = resolve;
    }
    });
    },
    prompt: function(title, defaultValue) {
        return new Promise(function(resolve) {
            var titleEl = document.getElementById('promptTitle');
            var inputEl = document.getElementById('promptInput');
            if (!titleEl || !inputEl) {
                resolve(null);
                return;
            }
        titleEl.textContent = title;
        inputEl.value = defaultValue || '';
        UI.showModal('promptModal');
        inputEl.focus();
    var okBtn = document.getElementById('promptOk');
    var cancelBtn = document.getElementById('promptCancel');
    if (!okBtn) {
        resolve(null);
        return;
    }
    // 【性能优化】用 _hasBound 标记代替 cloneNode
    if (!okBtn._promptHandler) {
        okBtn._promptHandler = function() {
            UI.hideModal('promptModal');
            if (okBtn._promptResolve) okBtn._promptResolve(inputEl.value || null);
        };
        okBtn.addEventListener('click', okBtn._promptHandler);
    }
    okBtn._promptResolve = resolve;
    if (cancelBtn) {
        if (!cancelBtn._promptHandler) {
            cancelBtn._promptHandler = function() {
                UI.hideModal('promptModal');
                if (cancelBtn._promptResolve) cancelBtn._promptResolve(null);
            };
            cancelBtn.addEventListener('click', cancelBtn._promptHandler);
        }
        cancelBtn._promptResolve = resolve;
    }
    // 回车确认
    inputEl.onkeydown = function(e) {
        if (e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            UI.hideModal('promptModal');
            resolve(inputEl.value || null);
        }
    };
    });
    },
    // ========================================
    // 【重构】合并 9 处 "返回剧情 + gameNav" 模式为 goHome
    // ========================================
    GAME_NAV_TABS: [
        { page: 'storyPage',  icon: 'icon-book',      label: '剧情' },
        { page: 'playerPage', icon: 'icon-user',      label: '个人' },
        { page: 'npcPage',    icon: 'icon-users',     label: '人际' },
        { page: 'logPage',    icon: 'icon-grid',      label: '日志' },
        { page: 'memoryPage', icon: 'icon-sparkles',  label: '记忆' },
        { page: 'recapPage',  icon: 'icon-clock',     label: '回顾' }
    ],
    goHome: function() {
        UI.showPage('storyPage');
        if (typeof renderNavBar === 'function') {
            renderNavBar('gameNav', UI.GAME_NAV_TABS, 0);
        }
    },
    // ========================================
    // 【重构】合并 5 处 new FileReader() 模式
    // ========================================
    readJSONFile: function(file) {
        return new Promise(function(resolve, reject) {
            if (!file) { reject(new Error('no file')); return; }
            var r = new FileReader();
            r.onload = function(e) {
                try { resolve(JSON.parse(e.target.result)); }
                catch (err) { reject(err); }
            };
            r.onerror = function() { reject(r.error || new Error('read failed')); };
            r.readAsText(file);
        });
    },
    // ========================================
    // 【重构】合并 4 处 a.download = xxx.json 模式
    // ========================================
    downloadJSON: function(data, filename) {
        try {
            var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            // Safari / 旧浏览器需要 a 在 DOM 里才能触发下载；Chrome 不需要但也无害
            if (document.body && document.body.appendChild) {
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else {
                a.click();
            }
            setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
            return true;
        } catch (e) {
            console.error('[downloadJSON] 失败:', e);
            UI.toast && UI.toast('下载失败: ' + e.message);
            return false;
        }
    },
    // ========================================
    // 【重构】合并 6 处 "gm.saveToStorage + GameLinker + toast" 三连
    // ========================================
    afterMemoryChange: function(tab, dataKey, toastMsg) {
        try { if (window.GameMemory) GameMemory.saveToStorage(); } catch (e) { console.warn('[afterMemoryChange] saveToStorage:', e); }
        try {
            if (typeof GameLinker !== 'undefined' && dataKey) {
                GameLinker.refreshByDataChange(dataKey);
            }
        } catch (e) { console.warn('[afterMemoryChange] refresh:', e); }
        if (toastMsg) UI.toast(toastMsg);
        if (tab && typeof MemoryManagerUI !== 'undefined' && MemoryManagerUI.switchTab) {
            MemoryManagerUI.switchTab(tab);
        }
    },
    // 【日志页面】AI 生成功能弹窗（替代原来转瞬即逝的 toast）
    // 用法：UI.showGenerating('本章剧情总结', { onCancel: function(){...} })
    //      UI.hideGenerating()
    _generatingCancelHandler: null,
    showGenerating: function(featureLabel, opts) {
        var modal = document.getElementById('generatingModal');
        var titleEl = document.getElementById('generatingTitle');
        var msgEl = document.getElementById('generatingMessage');
        var featEl = document.getElementById('generatingFeature');
        var cancelBtn = document.getElementById('generatingCancelBtn');
        if (!modal) {
            // 兜底：弹窗未渲染时降级为 toast
            if (typeof UI.toast === 'function') UI.toast('正在生成「' + (featureLabel || '') + '」...');
            return;
        }
        if (titleEl) titleEl.textContent = '正在生成「' + (featureLabel || '内容') + '」';
        if (msgEl) msgEl.textContent = 'AI 思考中，请稍候';
        if (featEl) featEl.textContent = opts && opts.hint ? opts.hint : '（视网络与上下文长度，可能需要十几秒到几十秒）';
        opts = opts || {};
        // 【缺陷修复】记录 onCancel 到 modal 上，遮罩点击关闭时触发，避免 AI 请求在后台继续运行
        modal._generatingOnCancel = opts.onCancel;
        // 绑定取消
        if (cancelBtn) {
            var self = this;
            if (cancelBtn._generatingHandler) {
                cancelBtn.removeEventListener('click', cancelBtn._generatingHandler);
            }
            if (cancelBtn._generatingKeyHandler) {
                document.removeEventListener('keydown', cancelBtn._generatingKeyHandler);
            }
            cancelBtn.style.display = (opts.hideCancel ? 'none' : '');
            cancelBtn._generatingHandler = function() {
                try { UI.hideGenerating(); } catch (e) {}
                try {
                    if (opts.onCancel) opts.onCancel();
                } catch (e) { console.warn('[Generating] onCancel 失败:', e); }
            };
            cancelBtn.addEventListener('click', cancelBtn._generatingHandler);
            // Esc 也可取消
            cancelBtn._generatingKeyHandler = function(e) {
                if (e.key === 'Escape' || e.keyCode === 27) {
                    if (modal.classList.contains('active')) {
                        cancelBtn._generatingHandler();
                    }
                }
            };
            document.addEventListener('keydown', cancelBtn._generatingKeyHandler);
        }
        this.showModal('generatingModal');
    },
    hideGenerating: function() {
        var modal = document.getElementById('generatingModal');
        if (modal) {
            // 【缺陷修复】清理 keydown 监听，避免残留
            var cancelBtn = document.getElementById('generatingCancelBtn');
            if (cancelBtn && cancelBtn._generatingKeyHandler) {
                document.removeEventListener('keydown', cancelBtn._generatingKeyHandler);
            }
            // 清理 onCancel 引用，防止遮罩点击二次触发
            modal._generatingOnCancel = null;
            this.hideModal('generatingModal');
        }
    }
};
// ==================== API配置管理 ====================
// 来源：game_integrated.html 第 3438-3531 行
// 功能：多API端点管理、分组、自动轮询、连接测试、模型列表获取

// ========================================
// 【安全】API Key 轻量混淆（仅避免明文存 localStorage）
// ========================================
// 注意：这不是真正的加密——任何能跑 JS 的人都能还原。目的只是防止 key 出现在
// 浏览器控制台、localStorage dump、屏幕录制等「无意识泄露」场景。
// 真实的密钥安全请用后端代理或 KMS。
var _API_KEY_OBFUSCATE_PASS = 'free_script_obf_v1'; // 简单 XOR + base64
function _obfuscateKey(plain) {
    if (typeof plain !== 'string' || !plain) return '';
    try {
        var pass = _API_KEY_OBFUSCATE_PASS;
        var xored = '';
        for (var i = 0; i < plain.length; i++) {
            xored += String.fromCharCode(plain.charCodeAt(i) ^ pass.charCodeAt(i % pass.length));
        }
        // 用 btoa 处理 Unicode
        return btoa(unescape(encodeURIComponent(xored)));
    } catch (e) { return plain; }
}
function _deobfuscateKey(encoded) {
    if (typeof encoded !== 'string' || !encoded) return encoded || '';
    // 启发式：base64 字符串只包含 [A-Za-z0-9+/=]，且长度 >= 8
    if (encoded.length < 8 || !/^[A-Za-z0-9+/=]+$/.test(encoded)) {
        return encoded; // 看起来不像混淆后的值，原样返回（兼容旧数据）
    }
    try {
        var xored = decodeURIComponent(escape(atob(encoded)));
        var pass = _API_KEY_OBFUSCATE_PASS;
        var plain = '';
        for (var i = 0; i < xored.length; i++) {
            plain += String.fromCharCode(xored.charCodeAt(i) ^ pass.charCodeAt(i % pass.length));
        }
        return plain;
    } catch (e) { return encoded; }
}
// 批量处理 configs 数组
function _obfuscateConfigs(configs) {
    if (!Array.isArray(configs)) return configs;
    return configs.map(function(c) {
        if (!c || typeof c !== 'object') return c;
        var copy = Object.assign({}, c);
        if (copy.apiKey) copy.apiKey = _obfuscateKey(copy.apiKey);
        return copy;
    });
}
function _deobfuscateConfigs(configs) {
    if (!Array.isArray(configs)) return configs;
    return configs.map(function(c) {
        if (!c || typeof c !== 'object') return c;
        var copy = Object.assign({}, c);
        if (copy.apiKey) copy.apiKey = _deobfuscateKey(copy.apiKey);
        return copy;
    });
}

var LocalGameAPI = {
    // 修复：移除写死的中转站 URL 和模型名。
    // 默认 1 个空白 slot，让用户自己在 API 设置页填"中转站 + Key + 模型"组合。
    // 旧用户已保存的 localStorage 配置会在 init() 中恢复，不受影响。
    _configs: [{
        baseUrl: '',
        apiKey: '',
        model: '',
        models: []
    }],
    _currentSlot: 0,
    _autoRotate: true,
    _requestLog: [], // [{slot, model, time, success, error}]
    _failedModels: {}, // {modelName: timestamp}
    _MAX_LOG: 50,
    init() {
        try {
            const saved = Storage.get(Storage.KEYS.API_CONFIG);
            if (saved) {
                const data = JSON.parse(saved);
                // 正常加载保存的配置——不修改、不动玩家的 model
                if (data.configs && data.configs.length > 0) {
                    // 【安全】还原时自动反混淆 API Key
                    this._configs = _deobfuscateConfigs(data.configs);
                }
                this._currentSlot = data.currentSlot || 0;
                this._autoRotate = data.autoRotate !== undefined ? data.autoRotate : this._autoRotate;
                this._groups = data.groups || [];
                this._currentGroup = data.currentGroup || 'all';
                this._requestLog = data.requestLog || [];
                this._failedModels = data.failedModels || {};
            }
        } catch (e) {
            console.error('加载API配置失败:', e);
        }
    },
    save() {
        try {
            // 【安全】写入时混淆 API Key，避免明文存到 localStorage
            Storage.setJSON(Storage.KEYS.API_CONFIG, {
                configs: _obfuscateConfigs(this._configs),
                currentSlot: this._currentSlot,
                autoRotate: this._autoRotate,
                groups: this._groups || [],
                currentGroup: this._currentGroup || 'all',
                requestLog: this._requestLog.slice(-this._MAX_LOG),
                failedModels: this._failedModels
                });
            } catch (e) {
            console.error('保存API配置失败:', e);
            }
    },
    getGroups() {
        const groups = new Set();
        if (this._groups) this._groups.forEach(g => groups.add(g));
        this._configs.forEach(c => {
            if (c.group) groups.add(c.group);
            });
        return Array.from(groups);
    },
    deleteGroup(groupName) {
        // 从 _groups 数组中删除
        if (this._groups) {
            this._groups = this._groups.filter(g => g !== groupName);
        }
    // 将该分组下的所有API变为未分组
    this._configs.forEach(cfg => {
        if (cfg.group === groupName) {
            cfg.group = '';
        }
    });
    this.save();
    },
    getCurrentConfig() {
        // 【优化 #10】返回浅拷贝，外部修改不会污染内部状态
        var cfg = this._configs[this._currentSlot] || this._configs[0];
        return cfg ? Object.assign({}, cfg) : null;
    },
    setConfig(slot, config) {
        this._configs[slot] = {
            ...this._configs[slot],
            ...config
            };
        this.save();
    },
    setCurrentSlot(slot) {
        this._currentSlot = slot;
        this.save();
    },
    setAutoRotate(val) {
        this._autoRotate = val;
        this.save();
    },
    async tryWithFallback(requestFn) {
        // 网络错误重试配置
        const MAX_RETRIES = 3; // 每个配置最多重试3次
        const RETRY_DELAY_BASE = 1000; // 基础延迟1秒
        // 【优化 #16】本轮调用的起始时间，用于埋点每个 slot 的耗时
        var startTs = Date.now();

        async function retryRequest(slotIdx, attempt) {
            try {
                const result = await requestFn(slotIdx);
                return result;
                } catch (e) {
                // 【优化 #8】网络错误判定改用原生字段，不再依赖翻译后的字符串匹配
                // translateError 之后文案是中文的，一旦未来改 i18n 这里就漏判
                var isRetryable =
                    (e && e.name === 'AbortError') ||
                    (e && e.name === 'TypeError' && /fetch|network/i.test(String(e.message || ''))) ||
                    (e && (e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' || e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN')) ||
                    (e && /network|fetch failed|timeout|aborted/i.test(String(e.message || '')));

                if (isRetryable && attempt < MAX_RETRIES - 1) {
                    var delay = RETRY_DELAY_BASE * Math.pow(2, attempt); // 指数退避
                    console.log('[重试] 配置 ' + (slotIdx + 1) + ' 第' + (attempt + 1) + '次失败，' + delay + 'ms后重试...');
                    await new Promise(function(resolve) { setTimeout(resolve, delay); });
                    return retryRequest(slotIdx, attempt + 1);
                }
                throw e;
            }
    }

    if (!this._autoRotate) {
        try {
            var result = await retryRequest(this._currentSlot, 0);
            this._logRequest(this._currentSlot, true, '', Date.now() - startTs);
            return result;
            } catch (e) {
            this._logRequest(this._currentSlot, false, e.message, Date.now() - startTs);
            this._markModelFailed(this._currentSlot);
            throw e;
            }
    }
    const totalSlots = this._configs.length;
    let attemptedCount = 0;
    // 轮换顺序：当前 slot 起循环，失败标记仅作 UI 提醒，不影响轮换顺序
    var orderedSlots = [];
    for (let i = 0; i < totalSlots; i++) {
        orderedSlots.push((this._currentSlot + i) % totalSlots);
    }
    var self = this;
    for (let attempt = 0; attempt < totalSlots; attempt++) {
        const slotIdx = orderedSlots[attempt];
        const cfg = this._configs[slotIdx];
        // 跳过配置不完整的API
        if (!cfg.baseUrl || !cfg.apiKey) {
            console.log('[API轮换] 配置 ' + (slotIdx + 1) + ' 不完整，跳过');
            continue;
        }
        // 注意：不再自动跳过"近期失败"的模型——失败只是 UI 提醒，玩家想用就能用
        // 如果某个模型一直挂，玩家会在 UI 上看到 ⚠️ 提醒，自然会换或调整
        attemptedCount++;
    try {
        const result = await retryRequest(slotIdx, 0);
        this._logRequest(slotIdx, true, '', Date.now() - startTs);
        if (attempt > 0 && slotIdx !== this._currentSlot) {
            this.setCurrentSlot(slotIdx);
            UI.toast('已自动切换到配置 ' + (slotIdx + 1));
        }
        return result;
        } catch (e) {
        var errMsg = translateError((e && e.message) ? e.message : String(e));
        this._logRequest(slotIdx, false, errMsg, Date.now() - startTs);
        // 失败标记仅作 UI 提醒分组，不影响轮换和调用逻辑
        this._markModelFailed(slotIdx);
        console.warn('配置 ' + (slotIdx + 1) + ' (' + cfg.model + ') 调用失败:', errMsg);
        // model_not_found 等"配置错误"静默跳过，不弹误导性 toast
        if (attemptedCount < totalSlots && !/model_not_found|invalid_api_key|authentication_error|context_length_exceeded|insufficient_quota/i.test(errMsg)) {
            UI.toast('配置 ' + (slotIdx + 1) + ' 失败，尝试下一个...');
        }
    }
    }
    // 更详细的错误信息
    if (attemptedCount === 0) {
        throw new Error('没有可用的API配置，请检查API设置（URL和Key是否完整）');
    }
    throw new Error('所有 ' + attemptedCount + ' 个可用配置均调用失败，请检查API配置');
    },
    _logRequest(slot, success, error, durationMs) {
        var cfg = this._configs[slot];
        if (!cfg) return;
        this._requestLog.push({
            slot: slot,
            model: cfg.model || '?',
            time: Date.now(),
            durationMs: durationMs || 0,
            success: !!success,
            error: error || ''
            });
        if (this._requestLog.length > this._MAX_LOG) {
            this._requestLog = this._requestLog.slice(-this._MAX_LOG);
        }
    // 延迟批量保存，避免每次请求都写localStorage
    if (!this._savePending) {
        this._savePending = true;
        var self = this;
        TimerManager.setTimeout('apiLogSave', function() {
            self._savePending = false;
            self.save();
        }, 5000);
    }
    },
    _markModelFailed(slot) {
        var cfg = this._configs[slot];
        if (!cfg || !cfg.model) return;
        // 【优化 #14】key 改为 slot+model 组合
        // 之前用 model 名，两个 slot 用同模型时一个挂会误标记另一个
        var key = slot + '|' + cfg.model;
        this._failedModels[key] = Date.now();
        // 复用延迟保存机制，避免重试循环中频繁写 localStorage
        if (!this._savePending) {
            this._savePending = true;
            var self = this;
            TimerManager.setTimeout('apiLogSave', function() {
                self._savePending = false;
                self.save();
            }, 2000);
        }
    },
    // 【优化 #14】按 slot 判断是否被标记为失败（与 _markModelFailed 的 key 对应）
    isModelFailedForSlot(slot) {
        var cfg = this._configs[slot];
        if (!cfg || !cfg.model) return false;
        var key = slot + '|' + cfg.model;
        return this.isModelFailed(key);
    },
    isModelFailed(modelName) {
        if (!modelName || !this._failedModels[modelName]) return false;
        // 24小时过期机制，与注释描述一致
        // 之前是永久生效，导致所有模型一旦失败过一次就永远被跳过
        var failedAt = this._failedModels[modelName];
        var now = Date.now();
        var TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
        if (now - failedAt > TWENTY_FOUR_HOURS) {
            // 已过期，清除失败标记
            delete this._failedModels[modelName];
            this.save();
            return false;
        }
    return true;
    },
    getFailedModels() {
        var result = [];
        for (var m in this._failedModels) {
            // 【优化 #14】key 可能是 "slot|model" 形式，UI 显示时拆出 model
            var modelName = m.indexOf('|') >= 0 ? m.split('|').slice(1).join('|') : m;
            result.push({
                model: modelName,
                failedAt: this._failedModels[m]
                });
        }
    return result.sort(function(a, b) {
        return b.failedAt - a.failedAt;
        });
    },
    // 【分类标签】UI提醒列表——纯分类，无任何功能限制
    // 作用：在UI上给模型打个标签（如"已下架""不推荐"），提醒玩家注意
    // 重要：列表中的模型完全可以正常使用，调用/轮换/重试逻辑均不检查此列表
    // 添加/删除模型到此列表，只影响UI显示，不影响任何功能
    _deprecatedModels: [
        'deepseek-v4-flash',
        'gemini-2.5-flash',
        // 2026-06 排查：iamhc.cn 中转站下架的模型（依然可用，只是官方不再提供）
        'moonshotai/kimi-k2.6',
        'meta/llama-3.3-70b-instruct',
        'qwen/qwen3-coder-480b-a35b-instruct'
    ],
    // 【纯查询】判断模型是否在分类标签中，仅用于UI显示，不影响功能
    isModelDeprecated(modelName) {
        return modelName && this._deprecatedModels.indexOf(modelName) !== -1;
    },
    getRequestStats(slot) {
        var logs = this._requestLog.filter(function(l) {
            return l.slot === slot;
            });
        var total = logs.length;
        var errors = logs.filter(function(l) {
            return !l.success;
            }).length;
        var cfg = this._configs[slot];
        // 模型数优先用获取模型列表时保存的数量，否则从请求日志中统计
        var modelCount = (cfg && cfg.availableModels) ? cfg.availableModels : 0;
        if (modelCount === 0) {
            var models = {};
            logs.forEach(function(l) {
                models[l.model] = true;
                });
            modelCount = Object.keys(models).length;
        }
    return {
        total: total,
        errors: errors,
        modelCount: modelCount,
        recentLogs: logs.slice(-50).reverse()
        };
    },
    normalizeUrl(baseUrl) {
        return baseUrl.replace(/\/$/, '');
    },
    _networkStatus: 'unknown',
    async checkConnectivity(baseUrl) {
        var testUrl = this.normalizeUrl(baseUrl) + '/models';
        // 优先使用传入 baseUrl 对应配置的 apiKey，其次用当前配置
        var matchedCfg = this._configs.find(function(c) { return c.baseUrl && LocalGameAPI.normalizeUrl(c.baseUrl) === LocalGameAPI.normalizeUrl(baseUrl); });
        var apiKey = matchedCfg ? matchedCfg.apiKey : (this.getCurrentConfig() || {}).apiKey;
        var headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
        try {
            var controller = new AbortController();
            var timeoutId = setTimeout(function() { controller.abort(); }, 8000);
            var res = await fetch(testUrl, { method: 'GET', headers: headers, signal: controller.signal });
            clearTimeout(timeoutId);
            this._networkStatus = res.ok ? 'connected' : 'error';
            return { ok: res.ok, status: res.status, message: res.ok ? '连接正常' : 'HTTP ' + res.status };
        } catch (e) {
            this._networkStatus = 'disconnected';
            var msg = '';
            if (e.name === 'AbortError') msg = '连接超时（8秒无响应）';
            else if (e.message && e.message.includes('Failed to fetch')) msg = '网络不可达（DNS解析失败或被阻断）';
            else msg = (e && e.message) || '未知错误';
            return { ok: false, status: 0, message: msg };
        }
    },
    getNetworkStatus() {
        return this._networkStatus;
    },
    async fetchModels(baseUrl, apiKey) {
        if (!baseUrl) return [];
        try {
            const url = this.normalizeUrl(baseUrl) + '/models';
            const res = await fetch(url, {
                headers: {
                    'Authorization': 'Bearer ' + apiKey
                }
            });
            if (res.ok) {
                const data = await res.json();
                return (data.data || []).map(m => m.id).sort();
                } else {
                throw new Error(translateError('HTTP错误: ' + res.status));
            }
        } catch (e) {
        throw new Error('无法获取模型列表。建议：手动输入模型名称');
    }
    },
    async testConnection(config, signal) {
        if (!config.baseUrl || !config.apiKey) return {
            success: false,
            message: '请填写完整配置'
            };
        try {
            const url = this.normalizeUrl(config.baseUrl) + '/chat/completions';
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + config.apiKey
                },
            body: JSON.stringify({
                model: config.model || 'gpt-3.5-turbo',
                messages: [{
                    role: 'user',
                    content: 'Hi'
                    }],
                max_tokens: 5
                }),
            signal: signal || null
            });
            if (res.ok) return {
                success: true,
                message: '连接成功'
                };
            else {
                const err = await res.json().catch(() => ({}));
                return {
                    success: false,
                    message: translateError((err.error && err.error.message) || '') || 'HTTP ' + res.status
                    };
            }
        } catch (e) {
        return {
            success: false,
            message: translateError(e.message)
            };
    }
    }
};
// ========================================
// IndexedDB 存档层（带 localStorage fallback）
// ========================================
var SaveDB = {
    DB_NAME: 'BunnyGameDB',
    DB_VERSION: 2,
    STORE_NAME: 'saves',
    _db: null,
    _ready: false,
    _useFallback: false,
    _fallbackFailCount: 0,
    MAX_FALLBACK_FAILS: 3,
    async init() {
        if (this._ready) return;
        try {
            this._db = await new Promise((resolve, reject) => {
                const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
                // 添加超时保护，防止 IndexedDB 在某些环境中永远不响应
                var timeoutId = TimerManager.setTimeout('idbOpenTimeout', function() {
                    reject(new Error('IndexedDB open timeout'));
                }, 3000);
                req.onupgradeneeded = function(e) {
                    var db = e.target.result;
                    if (!db.objectStoreNames.contains('saves')) {
                        db.createObjectStore('saves');
                    }
                };
                req.onsuccess = function(e) {
                    TimerManager.clearTimeout('idbOpenTimeout');
                    resolve(e.target.result);
                };
                req.onerror = function(e) {
                    TimerManager.clearTimeout('idbOpenTimeout');
                    reject(e.target.error);
                };
            });
            this._ready = true;
            console.log('✅ IndexedDB 就绪');
        } catch (e) {
            console.warn('⚠️ IndexedDB 不可用，回退 localStorage:', e);
            this._useFallback = true;
            this._ready = true;
        }
    },
    // ── 底层原始读写（带一次重试，偶发错误不立即永久 fallback） ──
    async _getRaw(key) {
        return await new Promise(function(resolve, reject) {
            var tx = SaveDB._db.transaction('saves', 'readonly');
            var req = tx.objectStore('saves').get(key);
            req.onsuccess = function() { resolve(req.result || null); };
            req.onerror = function() { reject(req.error || new Error('IDB get error')); };
        });
    },
    async _setRaw(key, data) {
        return await new Promise(function(resolve, reject) {
            var tx = SaveDB._db.transaction('saves', 'readwrite');
            var store = tx.objectStore('saves');
            if (data === null || data === undefined) store.delete(key);
            else store.put(data, key);
            tx.oncomplete = function() { resolve(); };
            tx.onerror = function() { reject(tx.error || new Error('IDB set error')); };
        });
    },
    async get(slot) {
        await this.init();
        if (this._useFallback) return this._lsGetAll()[slot] || null;
        try {
            var result = await this._getRaw('slot_' + slot);
            this._fallbackFailCount = 0;
            return result;
        } catch (e) {
            this._fallbackFailCount++;
            console.warn('IDB get失败（第' + this._fallbackFailCount + '次）:', e);
            if (this._fallbackFailCount >= this.MAX_FALLBACK_FAILS) {
                console.warn('IDB 连续失败，切换到fallback模式');
                this._useFallback = true;
            }
            return this._lsGetAll()[slot] || null;
        }
    },
    async getAll() {
        await this.init();
        if (this._useFallback) return this._lsGetFiltered();
        try {
            var result = await new Promise(function(resolve) {
                var tx = SaveDB._db.transaction('saves', 'readonly');
                var store = tx.objectStore('saves');
                var all = {};
                var req = store.openCursor();
                req.onsuccess = function(e) {
                    var cursor = e.target.result;
                    if (cursor) {
                        var key = cursor.key;
                        if (typeof key === 'string' && key.startsWith('slot_')) {
                            var slotNum = parseInt(key.replace('slot_', ''));
                            if (!isNaN(slotNum) && !SaveDB._isBackupSlot(slotNum)) {
                                all[slotNum] = cursor.value;
                            }
                        }
                        cursor.continue();
                    } else {
                        resolve(all);
                    }
                };
                req.onerror = function() { resolve(SaveDB._lsGetFiltered()); };
            });
            this._fallbackFailCount = 0;
            return result;
        } catch (e) {
            this._fallbackFailCount++;
            console.warn('IDB getAll失败（第' + this._fallbackFailCount + '次）:', e);
            if (this._fallbackFailCount >= this.MAX_FALLBACK_FAILS) this._useFallback = true;
            return this._lsGetFiltered();
        }
    },
    async set(slot, data) {
        await this.init();
        var backupSlot = this._getBackupSlot(slot);
        // 【阶段二】写前备份：保留旧数据到备份槽，防止写入崩溃导致旧档丢失
        if (backupSlot !== null && data !== null && data !== undefined) {
            try {
                var oldData = await this.get(slot);
                if (oldData) {
                    if (this._useFallback) this._lsSet(backupSlot, oldData);
                    else await this._setRaw('slot_' + backupSlot, oldData);
                }
            } catch (backupErr) {
                console.warn('[SaveDB] 写前备份失败，继续写入:', backupErr);
            }
        }
        // 附加校验和，便于读档时检测静默损坏
        var dataToWrite = (data === null || data === undefined) ? data : this._attachChecksum(data);
        if (this._useFallback) {
            this._lsSet(slot, dataToWrite);
            return;
        }
        try {
            await this._setRaw('slot_' + slot, dataToWrite);
            this._fallbackFailCount = 0;
        } catch (e) {
            console.warn('IDB写入失败，重试一次:', e);
            try {
                await this._setRaw('slot_' + slot, dataToWrite);
                this._fallbackFailCount = 0;
            } catch (e2) {
                this._fallbackFailCount++;
                console.warn('IDB写入重试仍失败（第' + this._fallbackFailCount + '次）:', e2);
                if (this._fallbackFailCount >= this.MAX_FALLBACK_FAILS) {
                    console.warn('IDB 连续失败，切换到fallback模式');
                    this._useFallback = true;
                }
                this._lsSet(slot, dataToWrite);
            }
        }
    },
    // 从备份槽恢复
    async restore(slot) {
        var backupSlot = this._getBackupSlot(slot);
        if (backupSlot === null) return null;
        var backup = await this.get(backupSlot);
        if (!backup) {
            console.warn('[SaveDB] 槽位 ' + slot + ' 没有备份可恢复');
            return null;
        }
        if (!this._verifyChecksum(backup)) {
            console.error('[SaveDB] 备份数据校验失败，无法恢复');
            return null;
        }
        await this.set(slot, backup);
        return backup;
    },
    // 启动时自动迁移：localStorage → IndexedDB
    async migrate() {
        await this.init();
        if (this._useFallback) return;
        if (Storage.get(Storage.KEYS.IDB_MIGRATED)) return;
        var migrated = 0;
        try {
            var raw = Storage.get(Storage.KEYS.LOCAL_SAVES);
            if (raw) {
                var saves = JSON.parse(raw);
                for (var slot in saves) {
                    if (saves.hasOwnProperty(slot) && saves[slot] && !this._isBackupSlot(parseInt(slot))) {
                        await this.set(parseInt(slot), saves[slot]);
                        migrated++;
                    }
                }
            }
        } catch (e) {}
        Storage.set(Storage.KEYS.IDB_MIGRATED, '1');
    },
    // ── 备份与校验工具 ──
    _getBackupSlot(slot) {
        if (slot === 0) return -1;
        if (typeof slot === 'number' && slot >= 1 && slot <= 99) return -100 - slot;
        return null;
    },
    _isBackupSlot(slot) {
        return slot === -1 || (slot <= -101 && slot >= -199);
    },
    _attachChecksum(data) {
        if (!data || typeof data !== 'object') return data;
        var clone = JSON.parse(JSON.stringify(data));
        var stateStr = typeof clone.state === 'string' ? clone.state : JSON.stringify(clone.state || {});
        clone._checksum = this._crc32(stateStr);
        clone._checksumTime = Date.now();
        return clone;
    },
    _verifyChecksum(data) {
        if (!data || typeof data !== 'object') return true;
        if (typeof data._checksum !== 'number') return true; // 旧存档无校验，放行
        var stateStr = typeof data.state === 'string' ? data.state : JSON.stringify(data.state || {});
        return data._checksum === this._crc32(stateStr);
    },
    _crc32(str) {
        var table = this._crc32Table;
        if (!table) {
            table = [];
            for (var i = 0; i < 256; i++) {
                var c = i;
                for (var j = 0; j < 8; j++) {
                    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                }
                table[i] = c;
            }
            this._crc32Table = table;
        }
        var crc = -1;
        for (var i = 0; i < str.length; i++) {
            crc = table[(crc ^ str.charCodeAt(i)) & 0xFF] ^ (crc >>> 8);
        }
        return (crc ^ -1) >>> 0;
    },
    // ── localStorage fallback 方法 ──
    _lsGetAll() {
        try {
            return Storage.getJSON(Storage.KEYS.LOCAL_SAVES, {});
        } catch (e) {
            console.error('[SaveManager] 读取localSaves失败:', e);
            return {};
        }
    },
    _lsGetFiltered() {
        var all = this._lsGetAll();
        var result = {};
        for (var k in all) {
            if (all.hasOwnProperty(k)) {
                var slotNum = parseInt(k);
                if (!isNaN(slotNum) && !this._isBackupSlot(slotNum)) {
                    result[k] = all[k];
                }
            }
        }
        return result;
    },
    _lsSet(slot, data) {
        try {
            var saves = this._lsGetAll();
            if (data === null) delete saves[slot];
            else saves[slot] = data;
            var jsonStr = JSON.stringify(saves);
            // 检查容量
            if (jsonStr.length > 4.5 * 1024 * 1024) {
                Storage.remove(Storage.KEYS.AUTO_SAVE_BACKUP);
            }
            Storage.set(Storage.KEYS.LOCAL_SAVES, jsonStr);
        } catch (e) {
            // 尝试清理后重试一次
            try {
                Storage.remove(Storage.KEYS.AUTO_SAVE_BACKUP);
                Storage.remove(Storage.KEYS.IDB_MIGRATED);
                var saves = this._lsGetAll();
                if (data === null) delete saves[slot];
                else saves[slot] = data;
                Storage.set(Storage.KEYS.LOCAL_SAVES, JSON.stringify(saves));
            } catch (e2) {
                console.error('❌ 清理后仍无法写入，存档可能丢失:', e2);
                // 尝试提示用户
                if (typeof UI !== 'undefined' && UI.toast) {
                    UI.toast('存储空间不足，请导出存档后清理');
                }
            }
        }
    }
};
// ========================================
// 题 材 库 数 据
// 未来加题材只需往数组里push对象即可
// ========================================
const THEME_LIBRARY = [
    // ---- 自由创作（推荐） ----
    {
        category: '自由创作',
        icon: '✦',
        title: '自由创作·无限可能',
        desc: '输入你想要的任何世界，AI 会理解并创造',
        prompt: '',
        tags: ['自由', '无限'],
        hot: true
    },
    // ---- 修仙玄幻 ----
    {
        category: '修仙玄幻',
        icon: '武',
        title: '废材逆袭·退婚流',
        desc: '被退婚的废材，意外获得系统金手指，一路逆袭打脸',
        prompt: '我想玩修仙养成，被退婚的废材，开局有系统金手指',
        tags: ['系统', '逆袭', '爽文'],
        hot: true
    }, {
    category: '修仙玄幻',
    icon: '',
    title: '宗门小弟·卧薪尝胆',
    desc: '宗门外门弟子，天赋平庸但意志坚定，苦修成圣',
    prompt: '我想玩修仙游戏，我是一个天赋平庸的外门弟子，没有金手指，靠毅力和智谋一步步成长',
    tags: ['慢热', '硬核', '成长']
}, {
category: '修仙玄幻',
icon: '',
title: '妖族觉醒·化形之路',
desc: '你是一只修炼千年的妖兽，刚刚化为人形混入人界',
prompt: '我想玩修仙游戏，我是一只刚化形的妖狐，混入人类修仙宗门，要隐藏身份修炼',
tags: ['妖族', '隐藏身份', '剧情']
},
// ---- 宫斗权谋 ----
{
    category: '宫斗权谋',
    icon: '',
    title: '小答应·宫斗求生',
    desc: '刚入宫的小答应，目标活到最后成为皇后',
    prompt: '我想玩宫斗模拟器，刚入宫的小答应，目标成为皇后',
    tags: ['策略', '权谋', '后宫'],
    hot: true
}, {
category: '宫斗权谋',
icon: '',
title: '权臣之路·朝堂风云',
desc: '落魄世家子弟入朝为官，在各派势力中周旋上位',
prompt: '我想玩朝堂权谋游戏，我是落魄世家子弟刚中进士入朝为官，要在各派系斗争中往上爬',
tags: ['权谋', '朝堂', '烧脑']
},
// ---- 末日生存 ----
{
    category: '末日生存',
    icon: '',
    title: '丧尸围城·便利店开局',
    desc: '在便利店醒来，外面全是丧尸，你能活几天？',
    prompt: '我想玩末日生存，在便利店醒来，外面全是丧尸',
    tags: ['生存', '硬核', '恐怖'],
    hot: true
}, {
category: '末日生存',
icon: '',
title: '核冬天·地堡求生',
desc: '核战后的地下掩体，资源有限，外面辐射致命',
prompt: '我想玩末日生存，核战后我在一个地下掩体里醒来，物资只够7天，需要决定是守还是出去探索',
tags: ['资源管理', '抉择', '废土']
},
// ---- 娱乐圈 ----
{
    category: '娱乐圈',
    icon: '💃',
    title: '女团选秀·逆风翻盘',
    desc: '被公司雪藏的练习生，想靠实力在选秀中翻红',
    prompt: '我想玩女团选秀，被公司雪藏的练习生，想靠实力翻红',
    tags: ['选秀', '热血', '成长']
}, {
category: '娱乐圈',
icon: '🎤',
title: '黑红艺人·洗白上位',
desc: '十八线黑红艺人，满身黑料但有实力，想洗白',
prompt: '我想玩娱乐圈，十八线黑红艺人，想洗白上位',
tags: ['策略', '舆论', '翻身'],
hot: true
}, {
category: '娱乐圈',
icon: '',
title: '天才编剧·影视江湖',
desc: '有才华的小编剧，被大导演看中卷入影视圈纷争',
prompt: '我想玩娱乐圈游戏，我是一个有才华的小编剧，写的剧本被大导演看中，卷入影视圈的各种纷争',
tags: ['剧情', '创作', '职场']
},
// ---- 无限流 ----
{
    category: '无限流',
    icon: '',
    title: '恐怖副本·智商求生',
    desc: '被拉进诡异副本，要靠智商和勇气活下来',
    prompt: '我想玩无限流，被拉进恐怖副本，要靠智商活下来',
    tags: ['推理', '恐怖', '烧脑'],
    hot: true
}, {
category: '无限流',
icon: '',
title: '规则怪谈·诡异医院',
desc: '你在一家医院醒来，墙上贴满了奇怪的规则',
prompt: '我想玩规则怪谈游戏，我在一家诡异医院醒来，到处贴着奇怪的规则，违反规则就会死',
tags: ['怪谈', '规则', '解谜']
},
// ---- 校园青春 ----
{
    category: '校园青春',
    icon: '',
    title: '转校生·社团物语',
    desc: '高二转学到新学校，加入了一个快要废部的社团',
    prompt: '我想玩校园青春游戏，高二转学生，加入了一个只剩3人快被废部的社团，要在文化祭前拯救社团',
    tags: ['青春', '日常', '热血']
}, {
category: '校园青春',
icon: '',
title: '高三冲刺·命运分岔',
desc: '高三最后一年，学习、友情、暗恋交织的日常',
prompt: '我想玩校园游戏，高三学生，成绩中等偏上，暗恋同桌，好朋友要出国，在学业和感情中做选择',
tags: ['青春', '恋爱', '日常']
},
// ---- 商战职场 ----
{
    category: '商战职场',
    icon: '',
    title: '创业维艰·车库起步',
    desc: '互联网创业者，从车库开始，挑战行业巨头',
    prompt: '我想玩创业模拟游戏，我是一个刚辞职的程序员，有一个颠覆性的产品idea，从车库开始创业',
    tags: ['商战', '创业', '策略']
}, {
category: '商战职场',
icon: '🏢',
title: '办公室政治·升职之路',
desc: '一个大公司新人，在复杂的办公室关系中生存升职',
prompt: '我想玩职场游戏，我是刚入职大公司的新人，部门里派系复杂，要在各种办公室政治中升职',
tags: ['职场', '策略', '现实']
},
// ---- 历史架空 ----
{
    category: '历史架空',
    icon: '',
    title: '三国谋士·乱世生存',
    desc: '穿越到三国时代，作为无名谋士开始乱世求生',
    prompt: '我想玩三国游戏，我穿越成了一个无名谋士，开局在一个小县城，天下即将大乱',
    tags: ['三国', '策略', '穿越']
},
// ---- 奇幻冒险 ----
{
    category: '奇幻冒险',
    icon: '',
    title: '魔法学院·新生入学',
    desc: '收到魔法学院的录取通知书，开始奇幻校园生活',
    prompt: '我想玩西方奇幻游戏，我是一个刚被魔法学院录取的平民新生，没有显赫家世，要靠自己在学院里站稳脚跟',
    tags: ['魔法', '学院', '冒险']
},
// ---- 悬疑推理 ----
{
    category: '悬疑推理',
    icon: '侦',
    title: '连环案件·新手侦探',
    desc: '小镇发生离奇连环失踪案，你是唯一的侦探',
    prompt: '我想玩悬疑推理游戏，我是一个小镇上的新手私人侦探，镇上发生了连环失踪案，警察毫无头绪',
    tags: ['推理', '悬疑', '剧情'],
    hot: true
},
// ---- 恋爱模拟 ----
{
    category: '恋爱模拟',
    icon: '',
    title: '合租奇缘·都市爱情',
    desc: '因为租房意外和陌生人合租，都市爱情故事开始',
    prompt: '我想玩恋爱模拟游戏，因为租房出了问题不得不和一个陌生人合租，对方性格很难相处但其实外冷内热',
    tags: ['恋爱', '日常', '甜文']
},
];
// ========================================
// 全局状态
// ========================================
// 游戏版本号，用于存档兼容性检查
const GAME_VERSION = '1.2.0';

// gameState工厂函数，确保初始化和重置时字段一致
function createDefaultGameState() {
    return {
        _version: GAME_VERSION,
        userPrompt: '',
        customStyle: '',
        systemPrompt: '',
        conversationHistory: [],
        allCharacters: {},
        temperature: 0.8,
        fontSize: 16,
        pinnedModules: {},
        rollingSummary: '',
        autoCompress: true,
        tokenCount: 0,
        maxTokens: 4096,
        useStream: true,
        streamFailCount: 0,
        generateChoices: true,
        // 默认使用 JSON 模式，让 AI 返回结构化数据以填充个人/人际/日志等面板
        pureTextMode: false,
        keyEvents: [],
        worldSnapshot: {},
        currentQuests: [],
        relationships: [],
        currentBag: [],
        playerData: null,
        favStories: [],
        generatedNovel: '',
        protagonistSetup: {},
        _jailbreakPrompt: '',
        _assistantPrompt: '',
        gameTime: {
            date: '', time: '', period: '', weather: '', era: ''
        },
    _presetApps: {},
    _stats: {
        startTime: Date.now(),
        totalTurns: 0,
        totalTokens: 0,
        maxTokensInTurn: 0,
        totalCharacters: 0,
        completedQuests: 0,
        totalPlayTime: 0
    },
_undoHistory: [],
_MAX_UNDO_HISTORY: 50,
wordCountConfig: {
    enabled: true,
    min: 1500,
    max: 3000,
    paragraphMin: 15,
    paragraphMax: 17,
    paragraphStyle: 'medium',
    lengthPreset: 'medium'
},
_theaterContent: {},
_worldModules: [],
_chatLogs: {},
_chattedNpcs: {},
_lastAIReply: null,
_depthPrompts: {},
_positionPrompts: {},
_afterChatPrompts: [],
_wiCachedResult: null,
_moments: [],
_npcDiaries: {},
_mail: [],
_diary: [],
// 【酒馆预设融合】新增叙事增强字段
anti429Mode: false,          // 防429模式（来自果实预设）
writingStyle: '',            // 文风选择：baimiao/liudong/lengjun/nongmo（来自果实预设）
cotMode: '',                 // 思维链模式（来自蛾摩拉预设）
summaryThreshold: 6,         // 摘要阈值（来自月读预设）
_squashSystemMessages: true, // 合并system消息（来自果实预设，默认开启）
// === 章节模式（来自果实预设的长篇剧情规范） ===
chapterMode: 'off',          // off / chapter / longform
// === 叙事基调（来自月读预设的10眼系统） ===
// 全部默认开启，固定为游戏叙事基础规范，玩家无需感知
narrativeEyes: {
    realistic: true,         // 现实感：可验证的因果与常识
    ideal: true,             // 温情：温柔联结与情感修复
    ensemble: true,          // 多角色：多角色共驱
    daily: true,             // 日常感：日常切片与关系温度
    heartbeat: true,         // 情绪强：情绪浓度强化
    undercurrent: true,      // 潜台词：潜台词与利益博弈
    fate: true,              // 因果链：选择-后果-再选择
    comedy: true,            // 轻松幽默：轻荒诞世界观
    balanced: true,          // 戏剧平衡：戏剧性与合理性平衡
    mystery: true            // 超自然：现实与超常模糊边界
},
// === 干练文风（来自蛾摩拉预设的词句肃清） ===
// 10 项基础规范默认开启，1 项 NSFW 专用默认关闭
squelchRules: {
    oilyCliches: true,       // 油腻套路：嘴角勾起弧度/捏下巴 等
    bodyCloseups: true,      // 身体特写：胸膛震动/手部工业糖精特写
    anatomyTerms: false,     // 解剖名词：耻骨/肋骨/肌理（NSFW 场景才建议开）
    cognitiveInability: true,// 难以形容：难以言喻/无法名状
    mandative: true,         // 强制语气：不容置疑
    referenceDep: true,      // 对比句式：不是A而是B
    extremeAdverbs: true,    // 夸张副词：极其/极度
    pronouns: true,          // 重复代词：那个/那种
    metaphors: true,         // 假设比喻：像是在.../仿佛...
    metaphorBlacklist: true, // 老套比喻：石子/羽毛/烙印
    forbidden: true          // 模板描写：嘴角勾起弧度/捏下巴
},
// === NPC 描写准则（默认注入，导入预设时可被覆盖） ===
npcDescriptionRules: true,   // 男帅女美、禁止脸谱化、禁用丑相关形容
// === 推荐参数档位（一键切换 4 档叙事参数） ===
presetArchetype: 'free',     // conservative / natural / passionate / delicate / free
// === 预设助手大总结书签（来自象牙塔预设的summarize功能） ===
summaryBookmarks: []         // [{ id, label, timestamp, hidden }]
};
}

var gameState = createDefaultGameState();

var streamBuffer = '';
var isWaiting = false;
// ======= 打字机缓冲系统 v2（优化版） =======
// 优化：段落级渲染节流、标点智能停顿、统一光标、脏检查
var TypewriterBuffer = {
    queue: '',
    displayed: '',
    isTyping: false,
    timer: null,
    // 【性能优化】baseSpeed 从 25ms 改为 50ms，肉眼几乎无差（20字/秒）但 CPU 减半
    // 进一步通过 textContent 增量更新当前段落避免每 tick 整个 innerHTML 重建
    baseSpeed: 50,
    onComplete: null,
    _visibilityHandler: null,
    _completedParagraphs: [],
    _currentParaChars: '',
    _lastRendered: '',
    _rafPending: false,
    // 【性能优化】缓存已完成段落的格式化HTML，避免每tick重新formatStory
    _cachedCompletedHtml: '',
    _cachedCompletedKey: '',
    // 标点停顿映射（字符 → 额外等待ms）
    _pauseMap: {
        '\u3002': 120, '\uff01': 120, '\uff1f': 120, '\u2026': 80,
        '\uff1b': 80, '\uff1a': 60,
        '\uff0c': 50, '\u3001': 40,
        '\u300c': 30, '\u300d': 40, '\u300b': 40,
        '\n': 60
    },

    push(newText) {
        if (!newText) return;
        // 确保 queue 和 displayed 已初始化，防止 undefined 错误
        if (typeof this.queue !== 'string') this.queue = '';
        if (typeof this.displayed !== 'string') this.displayed = '';
        if (newText.length > this.queue.length + this.displayed.length) {
            var newPart = newText.substring(this.displayed.length + this.queue.length);
            this.queue += newPart;
            } else {
            this.queue = newText.substring(this.displayed.length);
        }
    if (!this.isTyping) this.start();
    },
    start() {
        if (this.isTyping) return;
        this.isTyping = true;
        // 只在首次启动（displayed为空）时重置段落缓存，
        // 标点停顿后恢复打字时不能重置，否则已完成的段落会丢失
        if (this.displayed.length === 0) {
            this._completedParagraphs = [];
            this._currentParaChars = '';
        }
        // 【用户需求】打字机开始时显示「跳过」按钮（无长按快进、无点击屏幕快进）
        try { _showSkipButton(); } catch (e) {}
        const self = this;
    TimerManager.setInterval('typewriter', function() {
        if (self.queue.length === 0) {
            self.pause();
            if (self._currentParaChars) {
                self._completedParagraphs.push(self._currentParaChars);
                self._currentParaChars = '';
            }
        self._renderCached();
        // 【安全网】自然完成时若没有 onComplete 也要隐藏跳过按钮
        if (!self.onComplete) {
            try { _hideSkipButton(); } catch (e) {}
        }
        if (self.onComplete) {
            self.onComplete();
            self.onComplete = null;
        }
    return;
    }
    var ch = self.queue[0];
    self.queue = self.queue.substring(1);
    self.displayed += ch;

    // 段落分割：遇到换行且当前段落有内容时，完成当前段落
    if (ch === '\n' && self._currentParaChars.length > 0) {
        self._completedParagraphs.push(self._currentParaChars);
        self._currentParaChars = '';
        self._renderCached();
        } else {
        self._currentParaChars += ch;
        self._renderCurrentPara();
    }

    // 标点智能停顿
    var pause = self._pauseMap[ch];
    if (pause) {
        self.pause();
        self._pauseTimer = TimerManager.setTimeout('typewriterPause', function() {
            self._pauseTimer = null;
            if (self.queue.length > 0 || self._currentParaChars.length > 0) {
                self.start();
                } else {
                self.pause();
                if (self._currentParaChars) {
                    self._completedParagraphs.push(self._currentParaChars);
                    self._currentParaChars = '';
                }
            self._renderCached();
            if (self.onComplete) {
                self.onComplete();
                self.onComplete = null;
            }
    }
    }, pause);
    }
    }, this.baseSpeed);
    if (!this._visibilityHandler) {
        this._visibilityHandler = function() {
            if (document.hidden && self.isTyping) self.pause();
            };
        GlobalCleanup.registerListener(document, 'visibilitychange', this._visibilityHandler);
    }
    },
    pause() {
        this.isTyping = false;
        TimerManager.clearInterval('typewriter');
    },
    stop() {
        if (this._pauseTimer) { TimerManager.clearTimeout('typewriterPause'); this._pauseTimer = null; }
        this.pause();
        this.queue = '';
        this.displayed = '';
        this._lastRendered = '';
        this.onComplete = null;
        this._cachedCompletedHtml = '';
        this._cachedCompletedKey = '';
        this._currentParaEl = null;
    },
    // 添加销毁方法，移除事件监听器防止内存泄漏
    destroy() {
        this.stop();
        if (this._visibilityHandler) {
            // 使用 GlobalCleanup 的记录来移除，确保与注册方式一致
            document.removeEventListener('visibilitychange', this._visibilityHandler);
            this._visibilityHandler = null;
        }
    },
    flush() {
        // 确保 queue 和 displayed 已初始化
        if (typeof this.queue !== 'string') this.queue = '';
        if (typeof this.displayed !== 'string') this.displayed = '';
        this.displayed += this.queue;
        this.queue = '';
        this.pause();
        this.render();
        if (this.onComplete) {
            this.onComplete();
            this.onComplete = null;
        }
    },
    // 【用户需求】明确的「跳过」方法（与 flush 行为一致，但语义清晰）
    skip() {
        if (!this.isTyping && this.queue.length === 0) return false;
        this.flush();
        return true;
    },
    isFinished() {
        // 确保 queue 已初始化
        if (typeof this.queue !== 'string') this.queue = '';
        return this.queue.length === 0 && !this.isTyping;
    },
    render() {
        var storyEl = DOMCache.get('storyText', true);
        if (!storyEl) return;
        var allText = this._completedParagraphs.join('\n') + (this._completedParagraphs.length > 0 ? '\n' : '') + this._currentParaChars;
        // 脏检查：内容未变化则跳过重绘
        if (allText === this._lastRendered) return;
        this._lastRendered = allText;

        // 【性能优化】当前段落用 textContent 增量更新，避免每 tick 整个 innerHTML 重建
        // 旧逻辑：每 50ms 都执行 storyEl.innerHTML = completedHtml + currentHtml
        //         → 浏览器必须重新解析"已完成段落"那部分 HTML（已经渲染过 N 次）
        // 新逻辑：已完成段落变更时（罕见，段尾换行时）才全量重渲染
        //         当前段落变化时（每 tick）只更新最后一个 <p> 的 textContent
        var completedKey = this._completedParagraphs.join('\n');
        if (completedKey !== this._cachedCompletedKey) {
            // 段落列表变了：全量重渲染（罕见）
            this._cachedCompletedKey = completedKey;
            this._cachedCompletedHtml = completedKey ? formatStory(completedKey) : '';
            this._currentParaEl = null;  // 强制重建当前段落元素
            storyEl.innerHTML = this._cachedCompletedHtml;
        }

        // 当前段落：textContent 增量更新（极快）
        if (this._currentParaChars) {
            // 打字机 tick 期间只做基本装饰标签移除（与原 formatStory 行为一致）
            var currentText = this._currentParaChars;
            if (typeof _reDecorTagsTyping !== 'undefined') {
                _reDecorTagsTyping.lastIndex = 0;
                currentText = currentText.replace(_reDecorTagsTyping, '');
            }
            if (!this._currentParaEl || this._currentParaEl.parentNode !== storyEl) {
                // 创建新段落元素，复用同一节点直到本段结束
                this._currentParaEl = document.createElement('p');
                this._currentParaEl.className = 'story-typing-para';
                storyEl.appendChild(this._currentParaEl);
            }
            // 【性能】textContent 比 innerHTML 快得多——不需要 HTML 解析、不会重建已完成段落
            this._currentParaEl.textContent = currentText;
        } else if (this._currentParaEl) {
            // 当前段落清空：清掉元素引用，下一次会创建新的
            this._currentParaEl = null;
        }
    },
    _renderCached() {
        // 渲染已完成的段落
        this.render();
    },
    _renderCurrentPara() {
        // 渲染当前段落（与原版保持一致：每 tick 直接 render，不做 80ms 节流）
        // 之前用 rAF + 80ms 节流反而让文本以 3 字/80ms 的节奏跳动，用户感觉"卡"
        this.render();
    }
};
const MAX_HISTORY = 20;

// ========================================
// 打字机「跳过」按钮管理（用户需求：长按快进、点击屏幕一律不要，只保留按钮）
// 历史：早期在右下角浮动一个 typewriterSkipBtn，现已迁移到 #genControl 状态栏
// 内的 #genSkipBtn（紧挨取消按钮），这里只保留显示/隐藏同步逻辑。
// ========================================
function _showSkipButton() {
    if (typeof document === 'undefined') return;
    // 【状态栏跳过按钮】紧挨 #genCancelBtn，显示在「正在生成」状态栏里
    var _barSkipBtn = document.getElementById('genSkipBtn');
    if (_barSkipBtn) _barSkipBtn.style.display = '';
}
function _hideSkipButton() {
    if (typeof document === 'undefined') return;
    // 同步隐藏 #genControl 里的「跳过」按钮
    var _barSkipBtn = document.getElementById('genSkipBtn');
    if (_barSkipBtn) _barSkipBtn.style.display = 'none';
}

// ========================================
// Token 计数 + 自动压缩
// ========================================
let isCompressing = false;
let lastCompressTime = 0;
const npcChatState = {
    npcName: '',
    chatHistory: [],
    // [{role:'player'|'npc', text:'...'}]
    isSending: false,
    // 【修复R1】NPC聊天使用独立的AbortController，避免与主游戏共享导致竞态条件
    abortController: null
};
// ========================================
// NPC编辑 & 手动添加
// ========================================
let npcEditingName = '';
// 空=新增模式，有值=编辑模式
// --- 打字机光标颜色适配 ---

// ========================================
// 第1层: 工具函数
// ========================================
// 自动提取所有分类
function isScrollNearBottom(el) {
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}

// ========================================
// 游戏内时间系统（AI动态生成）
// ========================================
var GameTimeSystem = {
    // 从AI回复的JSON中解析时间字段并更新gameTime
    parseFromAI(data) {
        if (!data) return;
        if (!gameState.gameTime) {
            gameState.gameTime = { date: '', time: '', period: '', weather: '', era: '' };
        }
    var gt = gameState.gameTime;
    // AI在JSON中返回 gameTime 字段
    if (data.gameTime) {
        if (data.gameTime.date) gt.date = data.gameTime.date;
        if (data.gameTime.time) gt.time = data.gameTime.time;
        if (data.gameTime.period) gt.period = data.gameTime.period;
        if (data.gameTime.weather) gt.weather = data.gameTime.weather;
        if (data.gameTime.era) gt.era = data.gameTime.era;
    }
    },

    // 格式化时间显示（用于UI）
    formatTime() {
        var gt = gameState.gameTime;
        if (!gt) return '';
        var parts = [];
        if (gt.date) parts.push(gt.date);
        if (gt.time) parts.push(gt.time);
        else if (gt.period) parts.push(gt.period);
        return parts.join(' ');
    },

    // 格式化短标题（用于标题栏）
    formatShort() {
        var gt = gameState.gameTime;
        if (!gt) return '';
        var parts = [];
        if (gt.date) parts.push(gt.date);
        if (gt.period) parts.push(gt.period);
        return parts.join(' · ');
    },

    // 更新UI显示
    updateUI() {
        var timeEl = document.getElementById('gameTimeText');
        if (timeEl) {
            var formatted = this.formatTime();
            // 如果没有时间数据，显示默认文本
            timeEl.textContent = formatted || '--';
        }
    // 标题栏显示章节标题，不显示时间（时间已经在顶部显示）
    // var titleTimeEl = document.getElementById('storySceneTitle');
    // if (titleTimeEl) {
        //     var short = this.formatShort();
        //     if (short) {
            //         titleTimeEl.textContent = short;
            //     }
        // }
    }
};

// ========================================
// 超强JSON容错解析系统（状态机）
// ========================================
// 通用括号匹配状态机
function _findMatching(str, startChar, endChar, startIdx) {
    let depth = 0, inS = false, esc = false;
    for (let i = startIdx; i < str.length; i++) {
        const c = str[i];
        if (esc) { esc = false; continue; }
        if (c === '\\') { esc = true; continue; }
        if (c === '"') inS = !inS;
        if (inS) continue;
        if (c === startChar) depth++;
        if (c === endChar) { depth--; if (depth === 0) return i; }
    }
return -1;
}
function safeJSONParse(str) {
    if (!str || typeof str !== 'string') return null;
    try {
        let s = str.trim();
        if (s.startsWith('```')) s = s.replace(/^```json\s*/i, '').replace(/^```/, '').trim();
        if (s.endsWith('```')) s = s.slice(0, -3).trim();
        const tryP = t => {
            try {
                return JSON.parse(t);
            } catch {
            return null;
        }
};
let r = tryP(s);
if (r) return r;
// 状态机找第一个完整 {}
const fb = s.indexOf('{');
    if (fb !== -1) {
        const end = _findMatching(s, '{', '}', fb);
        if (end !== -1) {
            r = tryP(s.slice(fb, end + 1));
            if (r) return r
        }
}
// 修复常见错误
let fx = s.replace(/[\u0000-\u001F]+/g, ' ').replace(/,(\s*[}\]])/g, '$1').replace(/,+/g, ',');
r = tryP(fx);
if (r) return r;
const js = s.indexOf('{'),
    je = s.lastIndexOf('}');
if (js !== -1 && je > js) {
    r = tryP(s.slice(js, je + 1).replace(/,(\s*[}\]])/g, '$1'));
if (r) return r
}
return null;
} catch {
return null;
}
}
// 状态机提取字符串字段
// PNG角色卡解析工具 - 从PNG文件的tEXt chunk中提取chara数据
function extractCharaData(arrayBuffer) {
    try {
        var data = new Uint8Array(arrayBuffer);
        // 检查PNG签名
        var pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
        for (var i = 0; i < 8; i++) {
            if (data[i] !== pngSignature[i]) return null;
        }
    // 遍历PNG chunks
    var offset = 8;
    while (offset + 8 <= data.length) {
        // 读取chunk长度 (4 bytes, big-endian)
        var length = (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
        offset += 4;
        // 边界检查：chunk长度不能为负或超出文件
        if (length < 0 || offset + length > data.length) break;
        // 读取chunk类型 (4 bytes)
        var type = String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
        offset += 4;
        // 检查是否为tEXt chunk
        if (type === 'tEXt') {
            // 读取keyword (null-terminated)
            var keywordEnd = offset;
            while (keywordEnd < offset + length && data[keywordEnd] !== 0) keywordEnd++;
            var keyword = String.fromCharCode.apply(null, data.slice(offset, keywordEnd));
            // 检查是否为chara关键字
            if (keyword === 'chara') {
                // 读取text数据 (keyword之后，null之后)
                var textStart = keywordEnd + 1;
                var textData = data.slice(textStart, offset + length);
                // 解码base64
                var base64 = '';
                for (var j = 0; j < textData.length; j++) {
                    base64 += String.fromCharCode(textData[j]);
                }
            var decoded = atob(base64);
            // 【修复 P0-3】用 TextDecoder 正确解码 UTF-8，支持中文角色卡
            // 旧代码逐字节 String.fromCharCode 会把 UTF-8 多字节中文拆散为 Latin-1 字符
            var bytes = new Uint8Array(decoded.length);
            for (var k = 0; k < decoded.length; k++) {
                bytes[k] = decoded.charCodeAt(k);
            }
            var jsonStr = new TextDecoder('utf-8').decode(bytes);
        return JSON.parse(jsonStr);
    }
}
// 跳到下一个chunk (length + 4 bytes CRC)
offset += length + 4;
// 如果是IEND chunk，停止
if (type === 'IEND') break;
}
return null;
} catch (e) {
console.warn('解析PNG角色卡失败:', e);
return null;
}
}

function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function extractStr(text, field) {
    const m = text.match(new RegExp(`"${escapeRegExp(field)}"\\s*:\\s*"`));
    if (!m) return null;
    let r = '',
    esc = false;
    for (let i = m.index + m[0].length; i < text.length; i++) {
        const c = text[i];
        if (esc) {
            switch (c) {
                case 'n':
                r += '\n';
                break;
                case '"':
                r += '"';
                break;
                case '\\':
                r += '\\';
                break;
                default:
                r += c
            }
        esc = false
    } else if (c === '\\') esc = true;
else if (c === '"') return r;
else r += c;
}
return r.length > 0 ? r : null;
}
// 状态机提取数组
function extractArr(text, field) {
    const m = text.match(new RegExp(`"${escapeRegExp(field)}"\\s*:\\s*\\[`));
        if (!m) return null;
        let i = m.index + m[0].length,
        items = [],
        inS = false,
        esc = false,
        cur = '';
        while (i < text.length) {
            const c = text[i];
            if (esc) {
                switch (c) {
                    case 'n':
                    cur += '\n';
                    break;
                    case '"':
                    cur += '"';
                    break;
                    default:
                    cur += c
                }
            esc = false;
            i++;
            continue
        }
    if (c === '\\' && inS) {
        esc = true;
        i++;
        continue
    }
if (c === '"') {
    if (!inS) {
        inS = true;
        cur = ''
    } else {
    inS = false;
    items.push(cur);
    cur = ''
}
i++;
continue
}
if (!inS && c === ']') break;
if (inS) cur += c;
i++;
}
if (inS && cur.length > 0) items.push(cur);
return items.length > 0 ? items : null;
}
// 状态机提取对象
function extractObj(text, field) {
    const m = text.match(new RegExp(`"${escapeRegExp(field)}"\\s*:\\s*\\{`));
        if (!m) return null;
        const start = m.index + m[0].length - 1;
        const end = _findMatching(text, '{', '}', start);
        if (end !== -1) {
            try {
                return JSON.parse(text.slice(start, end + 1))
            } catch {}
    }
// 手动提取
const partial = text.slice(start);
const obj = {};
const fp = /"(\w+)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
let fm;
while ((fm = fp.exec(partial)) !== null) obj[fm[1]] = fm[2].replace(/\\n/g, '\n').replace(/\\"/g, '"');
return Object.keys(obj).length > 0 ? obj : null;
}
// 状态机提取对象数组
function extractObjArr(text, field) {
    const m = text.match(new RegExp(`"${escapeRegExp(field)}"\\s*:\\s*\\[`));
        if (!m) return null;
        const result = [];
        let i = m.index + m[0].length;
        while (i < text.length) {
            while (i < text.length && text[i] !== '{' && text[i] !== ']') i++;
            if (i >= text.length || text[i] === ']') break;
        const os = i;
        const oe = _findMatching(text, '{', '}', os);
        if (oe !== -1) {
            try {
                result.push(JSON.parse(text.slice(os, oe + 1)))
            } catch {}
        i = oe + 1
    } else break;
}
return result.length > 0 ? result : null;
}
// 强力状态机兜底
function robustParse(raw) {
    if (!raw) return null;
    const r = {};
    let ok = false;
    const story = extractStr(raw, 'story');
    if (story) {
        r.story = story;
        ok = true;
    }
// 提取各字段
const hud = extractObjArr(raw, 'hud');
if (hud) r.hud = hud;
const choices = extractObjArr(raw, 'choices');
if (choices) r.choices = choices;
const player = extractObj(raw, 'player');
if (player) {
    r.player = player;
    if (!r.player.stats) r.player.stats = extractObjArr(raw, 'stats') || [];
}
const chars = extractObjArr(raw, 'characters');
if (chars) r.characters = chars;
const world = extractObjArr(raw, 'world');
if (world) r.world = world;
const bag = extractObjArr(raw, 'bag');
if (bag) r.bag = bag;
// story从JSON外面提取
if (Object.keys(r).length > 0) ok = true;
return ok ? r : null;
}
// === <mem>标签解析器（方案C核心：状态自动提取）===
// AI只输出纯文本story + <mem>状态变化 + <giggle>心声
// 前端从<mem>标签自动维护：player/characters/bag/quests/world/gameTime等结构化数据
// AI无需输出JSON，节省的tokens全用在story上
function _parseMemTags(reply) {
    if (!reply || typeof reply !== 'string') return { mems: [], cleanedReply: reply || '' };
    var mems = [];
    // 匹配所有 <mem ...>...</mem> 或 <mem .../>
    var memPattern = /<mem\s+([^>]*?)\s*(?:\/>|>([\s\S]*?)<\/mem>)/g;
    var match;
    while ((match = memPattern.exec(reply)) !== null) {
        var attrsStr = match[1];
        var content = match[2] || '';
        var mem = { _raw: match[0] };
        // 解析属性
        var attrPattern = /(\w+)\s*=\s*"([^"]*)"/g;
        var attrMatch;
        while ((attrMatch = attrPattern.exec(attrsStr)) !== null) {
            mem[attrMatch[1]] = attrMatch[2];
        }
        // 如果是 <mem>内容</mem> 形式，type可能放在attrsStr里，也可能content是描述
        if (content && !mem.type) {
            // 尝试从内容推断type
            if (content.match(/^\d+$/)) mem.qty = content; // <mem>1</mem>
        }
        if (!mem.type) mem.type = 'note';
        mem._content = content;
        mems.push(mem);
    }
    // 从reply中移除<mem>标签，得到纯净的story
    var cleanedReply = reply.replace(memPattern, '').trim();
    return { mems: mems, cleanedReply: cleanedReply };
}

// 将<mem>解析结果应用到gameState，自动维护结构化数据
function _applyMemsToGameState(mems) {
    if (!mems || mems.length === 0 || typeof gameState === 'undefined' || !gameState) return;
    mems.forEach(function(mem) {
        try {
            switch (mem.type) {
                case 'event':
                    if (mem.action === 'add' && mem._content) {
                        // 添加到重要事件
                        if (!gameState.keyEvents) gameState.keyEvents = [];
                        if (gameState.keyEvents.indexOf(mem._content) === -1) {
                            gameState.keyEvents.push(mem._content);
                            if (gameState.keyEvents.length > 20) gameState.keyEvents.shift();
                        }
                    }
                    break;
                case 'item':
                    if (!gameState.bag) gameState.bag = [];
                    var qty = parseInt(mem.qty) || 1;
                    if (mem.action === 'add') {
                        var existItem = gameState.bag.find(function(b) { return b.name === mem.name; });
                        if (existItem) {
                            existItem.count = (existItem.count || 0) + qty;
                        } else {
                            gameState.bag.push({ name: mem.name, count: qty, desc: mem._content || '' });
                        }
                    } else if (mem.action === 'remove') {
                        var rmItem = gameState.bag.find(function(b) { return b.name === mem.name; });
                        if (rmItem) {
                            rmItem.count = Math.max(0, (rmItem.count || 0) - qty);
                            if (rmItem.count === 0) {
                                gameState.bag = gameState.bag.filter(function(b) { return b.name !== mem.name; });
                            }
                        }
                    }
                    break;
                case 'character':
                    // 【修复】统一使用 gameState.allCharacters（与 gm.tables.characters 别名一致）
                    if (!gameState.allCharacters) {
                        if (typeof GameMemory !== 'undefined' && GameMemory.tables && GameMemory.tables.characters) {
                            gameState.allCharacters = GameMemory.tables.characters;
                        } else {
                            gameState.allCharacters = {};
                        }
                    }
                    var ch = gameState.allCharacters[mem.name];
                    if (ch) {
                        if (mem.field && mem.value !== undefined) {
                            // 数字字段（好感度等）
                            var numVal = parseFloat(mem.value);
                            if (!isNaN(numVal)) {
                                ch[mem.field] = numVal;
                            } else {
                                ch[mem.field] = mem.value;
                            }
                        }
                    } else if (mem.name) {
                        // 新角色
                        var newCh = { name: mem.name };
                        if (mem.field && mem.value !== undefined) newCh[mem.field] = mem.value;
                        gameState.allCharacters[mem.name] = newCh;
                    }
                    break;
                case 'quest':
                    if (!gameState.quests) gameState.quests = [];
                    if (mem.action === 'add') {
                        var newQuest = { title: mem._content || mem.name || '新任务', status: 'pending' };
                        gameState.quests.push(newQuest);
                    } else if (mem.action === 'resolve') {
                        var q = gameState.quests.find(function(qq) { return qq.title === (mem._content || mem.name); });
                        if (q) q.status = 'completed';
                    }
                    break;
                case 'time':
                    if (gameState.gameTime) {
                        if (mem.day) gameState.gameTime.day = mem.day;
                        if (mem.period) gameState.gameTime.period = mem.period;
                    }
                    break;
                case 'location':
                    if (!gameState.world) gameState.world = [];
                    if (mem.action === 'add' && mem.name) {
                        var loc = gameState.world.find(function(w) { return w.type === 'location' && w.name === mem.name; });
                        if (!loc) {
                            gameState.world.push({ type: 'location', name: mem.name, desc: mem._content || '' });
                        }
                    }
                    break;
            }
        } catch (e) {
            console.warn('[<mem>应用失败]', mem, e.message);
        }
    });
}

function parseAIResponse(reply) {
    let data = null;
    let storyText = '';
    // 【修复 P1-3 + 动态化】移除硬编码的"思考前缀剥离正则"——这是 API 游戏，AI 能理解输出格式
    // 旧代码用 /^(?:让我|好的|首先|现在|继续|接下来|于是).../ 正则剥离前缀，
    // 会误删以这些词开头的正文（如"让我带你看看..."、"好的，她说道"）
    // 现在信任 AI 能正确输出，不再猜测和剥离"思考过程"
    // 如果 AI 输出了思考前缀导致 JSON 解析失败，下方的 robustParse 状态机会处理
    // 【方案C】<mem>标签解析 - 在JSON解析前先提取
    var memParseResult = _parseMemTags(reply);
    if (memParseResult.mems.length > 0) {
        console.log('[方案C] 检测到 ' + memParseResult.mems.length + ' 个 <mem> 标签');
        // 将解析结果暂存到全局，供后续使用
        if (typeof window !== 'undefined') window._lastParsedMems = memParseResult.mems;
    }
    // 1. 先尝试直接解析纯JSON（新格式）
    data = safeJSONParse(reply);
    // 2. 如果失败，兼容旧的```json格式
    if (!data) {
        const jsonMatch = reply.match(/```json\n?([\s\S]*?)\n?```/);
        if (jsonMatch) {
            data = safeJSONParse(jsonMatch[1]);
        }
}
// 3. 状态机兜底
if (!data) {
    data = robustParse(reply);
}
// 4. 提取剧情文本
if (data && data.story) {
    // 新格式：story在JSON里
    storyText = data.story;
} else {
// 先用状态机提取story
storyText = extractStr(reply, 'story') || '';
// 如果还没有，尝试从JSON中提取story字段值
if (!storyText) {
    var storyMatch = reply.match(/"story"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
    if (storyMatch) {
        storyText = storyMatch[1].replace(/\\n/g, '\n');
    }
}
// 最后兜底：去掉JSON代码块，保留纯文本
if (!storyText) {
    storyText = reply.replace(/```json[\s\S]*?```/g, '').replace(/```[\s\S]*?```/g, '').trim();
}
// 如果还是空，检查是否是原始 SSE 数据（包含 data: 行），避免把 JSON 渲染给用户
if (!storyText) {
    if (reply && reply.indexOf('data:') !== -1 && reply.indexOf('"object"') !== -1) {
        // 原始 SSE 流数据，不应直接显示
        storyText = '';
    } else {
        storyText = reply;
    }
}
}
// 【修复】兜底：如果storyText仍然为空，但reply有内容，
// 说明是纯文本小说预设（非JSON格式），直接使用原文
if (!storyText || storyText.trim() === '') {
    if (reply && reply.trim()) {
        var cleanedReply = reply
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
        .replace(/<ECoT>[\s\S]*?<\/ECoT>/gi, '')
        .replace(/💭[\s\S]*?💭/g, '')
        .trim();
        if (cleanedReply) {
            storyText = cleanedReply;
            // 尝试从纯文本中提取可能的JSON数据
            if (!data) {
                try {
                    // 尝试从文本末尾提取JSON块
                    var jsonBlockMatch = cleanedReply.match(/\{[\s\S]*\}/);
                    if (jsonBlockMatch) {
                        var extracted = safeJSONParse(jsonBlockMatch[0]);
                        if (extracted && typeof extracted === 'object') {
                                data = extracted;
                                // 从文本中移除JSON块
                                storyText = cleanedReply.replace(jsonBlockMatch[0], '').trim();
                            }
                        }
                } catch(e) { console.warn('[parseAIResponse] 文本末尾 JSON 块解析失败:', e && e.message); }
}
}
}
}

// === 缄默法则·输出后处理 ===
// 对提取出的 storyText 应用 _squelchPostProcess，删除 AI 漏网的违禁表达
if (typeof _squelchPostProcess === 'function' && storyText) {
    try {
        var squelchedStory = _squelchPostProcess(storyText);
        if (squelchedStory !== storyText) {
            console.log('[缄默法则] 已净化 story 文本');
            storyText = squelchedStory;
            // 如果 data 也有 story 字段，单独更新（不影响其它字段）
            if (data && typeof data === 'object') {
                data.story = squelchedStory;
            }
        }
    } catch (e) {
        console.warn('[缄默法则] 净化失败（不影响主流程）:', e && e.message);
    }
}

// 【小剧场融合】提取小剧场内容
var theaterContent = {};
if (typeof MacroEngine !== 'undefined') {
    var theaterVars = MacroEngine.getTheaterContent();
    Object.keys(theaterVars).forEach(function(key) {
        var val = theaterVars[key];
        if (val && val.trim()) {
            var parsed = MacroEngine.parseTheaterContent(val);
            if (parsed && parsed.type !== 'unknown') {
                theaterContent[key] = parsed;
            }
    }
});
}

// 将提取到的小剧场内容存储到 gameState
if (Object.keys(theaterContent).length > 0) {
    if (!gameState._theaterContent) gameState._theaterContent = {};
    Object.assign(gameState._theaterContent, theaterContent);
    console.log('[小剧场融合] 提取到', Object.keys(theaterContent).length, '个小剧场');

    // 根据小剧场类型注入到对应的日志功能
    injectTheaterToLogs(theaterContent);

    // 【深度融合】将预设<branches>选项桥接到游戏原生选项系统
    _bridgeBranchesToChoices(theaterContent);
}

// 【修复】检测JSON是否被截断（不完整）
// 症状：AI输出到一半被maxTokens截断，JSON的{ }不配对，前端把残余`\n\n`当纯文本渲染
// 检测方法：数 { 和 } 数量是否相等
if (reply && typeof reply === 'string') {
    var openBraces = (reply.match(/\{/g) || []).length;
    var closeBraces = (reply.match(/\}/g) || []).length;
    if (openBraces > 0 && openBraces > closeBraces) {
        console.warn('[parseAIResponse] 检测到JSON被截断：{=' + openBraces + ', }=' + closeBraces);
        if (!data) {
            // 解析完全失败的情况下，把残余内容标识为截断
            storyText = '⚠️ **AI回复被截断**（JSON未输出完整）\n\n' + (storyText || '').trim() + '\n\n💡 建议点击 🔄 重新生成';
        }
    }
}

return {
    data,
    storyText,
    mems: memParseResult.mems
};
}

// 根据 AI 指定的 type 字段创建模块
function _createModuleFromType(type, theater, key) {
    var content = theater.html || theater.content || '';
    var data = theater.data || {};
    var title = theater.title || key;

    // 已知类型的快速映射
    var knownTypes = {
        text: function() { return { type: 'text', title: title, content: content }; },
        list: function() { return { type: 'list', title: title, items: data.items || [] }; },
        ranking: function() { return { type: 'ranking', title: title, items: data.items || [] }; },
        key_value: function() { return { type: 'key_value', title: title, items: data.items || [] }; },
        cards: function() { return { type: 'cards', title: title, items: data.items || parseItemsContent(content) }; },
        comments: function() { return { type: 'comments', title: title, items: data.posts || parseForumContent(content) }; },
        moments: function() { return { type: 'moments', title: title, moments: parseMomentsContent(content) }; },
        mail: function() { return { type: 'mail', title: title, mails: parseMailContent(content) }; },
        shop: function() { return { type: 'shop', title: title, goods: parseShopContent(content) }; },
        diary: function() { return { type: 'diary', title: title, entries: parseDiaryContent(content) }; },
        chat: function() { injectToChatLog('群聊', theater); return { type: 'chat', npc: '群聊', messages: parseChatContent(content) }; },
        status: function() { _bridgeStatusToCharacters(theater); return { type: 'status', title: title, content: content, stats: data.stats || [] }; },
        summary: function() { _bridgeSummaryToMemory(theater); return { type: 'summary', title: title, content: content, summary: data.summary || '' }; },
        branches: function() { if (typeof renderChoices === 'function' && data.options) renderChoices(data.options); return { type: 'branches', title: title, content: content, options: data.options || [] }; },
        phone: function() { return { type: 'phone', title: title, content: content, apps: data.apps || [] }; },
        theater: function() { return { type: 'theater', title: title, content: content, scenes: data.scenes, text: data.text }; },
        author_note: function() { return { type: 'author_note', title: title, content: theater.content || content }; },
        achievements: function() { return { type: 'achievements', title: title, items: data.items || [] }; },
        calendar: function() { return { type: 'calendar', title: title, events: parseCalendarContent(content) }; },
        profile: function() { _bridgeProfileToRelationships(theater); return { type: 'text', title: title, content: content }; }
    };

    if (knownTypes[type]) return knownTypes[type]();

    // 未知类型：作为通用文本模块
    return { type: 'text', title: title, content: content };
}

// 根据标签名映射小剧场到模块类型（兼容旧标签名）
function _mapTheaterByKey(key, theater) {
    var targetModule = null;
    switch (key) {
        // 论坛类 -> 论坛
        case '论坛之愿':
        case '论坛小剧场':
        case '文艺盲盒小剧场':
        case 'gossip':
        case '八卦':
        case '论坛':
        targetModule = { type: 'comments', title: theater.title || '论坛', items: parseForumContent(theater.html || theater.content) };
        // 如果有结构化数据，使用它
        if (theater.data && theater.data.posts) {
            targetModule.items = theater.data.posts;
        }
    break;

    // 群聊类 -> 聊天记录
    case '群聊之愿':
    targetModule = { type: 'chat', npc: '群聊', messages: parseChatContent(theater.html || theater.content) };
    injectToChatLog('群聊', theater);
    break;

    // 日程类 -> 新增日程模块
    case '日程之愿':
    case '日程表':
    targetModule = { type: 'calendar', title: '日程表', events: parseCalendarContent(theater.html || theater.content) };
    break;

    // 通知类 -> 邮件
    case '通知之愿':
    targetModule = { type: 'mail', title: '系统通知', mails: parseMailContent(theater.html || theater.content) };
    break;

    // 购物类 -> 商店
    case '购物之愿':
    targetModule = { type: 'shop', title: '商店', goods: parseShopContent(theater.html || theater.content) };
    break;

    // 朋友圈/日常 -> 朋友圈
    case '每日之愿':
    case '日常剧场':
    case '盲盒之愿':
    targetModule = { type: 'moments', moments: parseMomentsContent(theater.html || theater.content) };
    break;

    // 桌面/盲盒 -> 物品
    case '桌面之愿':
    targetModule = { type: 'cards', title: '物品', items: parseItemsContent(theater.html || theater.content) };
    break;

    // 日记类 -> 日记
    case '后台人生':
    targetModule = { type: 'diary', npc: '后台', entries: parseDiaryContent(theater.html || theater.content) };
    break;

    // 作话 -> 新增作话模块
    case '蛾摩拉':
    targetModule = { type: 'author_note', title: '作者有话说', content: theater.content };
    break;

    // 【深度融合】状态栏 -> 同时更新游戏NPC系统
    case '小夜单人状态':
    case '通用状态':
    case '古风状态':
    case '状态面板':
    case 'status':
    targetModule = { type: 'status', title: '角色状态', content: theater.html || theater.content };
    // 如果有结构化数据，使用它
    if (theater.data && theater.data.stats) {
        targetModule.stats = theater.data.stats;
        targetModule.ancient = theater.data.ancient || false;
    }
// 【深度融合】将状态数据桥接到游戏NPC系统
_bridgeStatusToCharacters(theater);
break;

// 档案/报告 -> 世界信息
case '档案之愿':
case '报告之愿':
targetModule = { type: 'text', title: theater.title || key, content: theater.content };
break;

// 【新增】手机功能 -> 手机模块
case '角色手机':
case '手机':
case 'phone':
targetModule = { type: 'phone', title: '手机', content: theater.html || theater.content };
if (theater.data && theater.data.apps) {
    targetModule.apps = theater.data.apps;
}
break;

// 【深度融合】摘要 -> 同时注入游戏记忆系统和日志模块
case 'meow_FM':
case '摘要':
case 'summary':
targetModule = { type: 'summary', title: '摘要', content: theater.html || theater.content };
if (theater.data && theater.data.summary) {
targetModule.summary = theater.data.summary;
}
// 【深度融合】将预设摘要桥接到游戏EnhancedMemory
_bridgeSummaryToMemory(theater);
break;

// 【新增】选项分支 -> 选项模块
case 'branches':
case '选项分支':
case '分支':
targetModule = { type: 'branches', title: '选项', content: theater.html || theater.content };
if (theater.data && theater.data.options) {
targetModule.options = theater.data.options;
// 同时更新游戏选项
if (typeof renderChoices === 'function') {
    renderChoices(theater.data.options);
}
}
break;

// 【新增】物品 -> 物品模块
case 'echo':
case '物品':
case 'items':
targetModule = { type: 'cards', title: '物品', items: parseItemsContent(theater.html || theater.content) };
if (theater.data && theater.data.items) {
targetModule.items = theater.data.items;
}
break;

// 【新增】文字剧场 -> 剧场模块
case 'ccd':
case '文字剧场':
case '剧场':
targetModule = { type: 'theater', title: '文字剧场', content: theater.html || theater.content };
if (theater.data) {
if (theater.data.scenes) {
    targetModule.scenes = theater.data.scenes;
} else if (theater.data.text) {
targetModule.text = theater.data.text;
}
}
break;

// 【新增】象牙塔预设 - 塔类小剧场映射
case '恋爱之塔':
case '恋爱小剧场':
case '恋爱之愿':
targetModule = { type: 'theater', title: '恋爱剧场', content: theater.html || theater.content };
break;

case '涩涩之塔':
case '涩涩小剧场':
case '涩涩之愿':
targetModule = { type: 'theater', title: '涩涩剧场', content: theater.html || theater.content };
break;

case '游戏之塔':
case '游戏小剧场':
case '游戏之愿':
targetModule = { type: 'theater', title: '游戏剧场', content: theater.html || theater.content };
break;

case '群聊之塔':
targetModule = { type: 'chat', npc: '群聊', messages: parseChatContent(theater.html || theater.content) };
injectToChatLog('群聊', theater);
break;

case '论坛之塔':
case '八卦之塔':
targetModule = { type: 'comments', title: theater.title || '论坛', items: parseForumContent(theater.html || theater.content) };
if (theater.data && theater.data.posts) {
targetModule.items = theater.data.posts;
}
break;

case '同人之塔':
case '同人之愿':
targetModule = { type: 'theater', title: '同人剧场', content: theater.html || theater.content };
break;

case '回忆之塔':
case '回忆之愿':
targetModule = { type: 'diary', npc: '回忆', entries: parseDiaryContent(theater.html || theater.content) };
break;

case '平行之塔':
case '平行之愿':
targetModule = { type: 'theater', title: '平行世界', content: theater.html || theater.content };
break;

case '美食之塔':
case '美食之愿':
targetModule = { type: 'theater', title: '美食剧场', content: theater.html || theater.content };
break;

case '广告之塔':
case '广告之愿':
targetModule = { type: 'theater', title: '广告', content: theater.html || theater.content };
break;

case '报告之塔':
case '报告之愿':
targetModule = { type: 'text', title: theater.title || '报告', content: theater.content };
break;

case '每日之塔':
case '文学之塔':
case '文学之愿':
targetModule = { type: 'theater', title: theater.title || '文学', content: theater.html || theater.content };
break;

case '哀伤之塔':
case '哀伤之愿':
targetModule = { type: 'theater', title: '哀伤', content: theater.html || theater.content };
break;

case '幸福之塔':
case '幸福之愿':
targetModule = { type: 'moments', moments: parseMomentsContent(theater.html || theater.content) };
break;

case '盲盒之塔':
targetModule = { type: 'cards', title: '盲盒物品', items: parseItemsContent(theater.html || theater.content) };
break;

// 【新增】其他标签类型映射
case 'ice':
targetModule = { type: 'text', title: 'ice', content: theater.html || theater.content };
break;

case 'live':
targetModule = { type: 'theater', title: '直播', content: theater.html || theater.content };
break;

case 'danmu':
targetModule = { type: 'theater', title: '弹幕', content: theater.html || theater.content };
break;

case 'enigma':
targetModule = { type: 'text', title: '谜题', content: theater.html || theater.content };
break;

case 'podcast':
targetModule = { type: 'theater', title: '播客', content: theater.html || theater.content };
break;

case '作者有话说':
case 'author_note':
targetModule = { type: 'author_note', title: '作者有话说', content: theater.content };
break;

case 'giggle':
case '角色心声':
targetModule = { type: 'text', title: '角色心声', content: theater.content };
break;

case 'novel_header':
targetModule = { type: 'text', title: '章节标题', content: theater.html || theater.content };
break;

case 'profile':
case '角色关系':
targetModule = { type: 'text', title: '角色关系', content: theater.html || theater.content };
// 【深度融合】将角色关系数据桥接到游戏关系系统
_bridgeProfileToRelationships(theater);
break;

case 'horae':
case 'horaeevent':
targetModule = { type: 'text', title: '记忆', content: theater.html || theater.content };
break;

// 其他 -> 世界信息
default:
if (theater.type === 'snow') {
targetModule = { type: 'text', title: theater.title || key, content: theater.content };
} else if (theater.type === 'gossip') {
targetModule = { type: 'comments', title: theater.title || '论坛', items: theater.data?.posts || [{ author: '小剧场', content: theater.content, time: new Date().toLocaleString() }] };
} else if (theater.type === 'phone') {
targetModule = { type: 'phone', title: '手机', content: theater.html || theater.content, apps: theater.data?.apps || [] };
} else if (theater.type === 'status') {
targetModule = { type: 'status', title: '角色状态', content: theater.html || theater.content, stats: theater.data?.stats || [] };
} else if (theater.type === 'summary') {
targetModule = { type: 'summary', title: '摘要', content: theater.html || theater.content, summary: theater.data?.summary || '' };
} else if (theater.type === 'branches') {
targetModule = { type: 'branches', title: '选项', content: theater.html || theater.content, options: theater.data?.options || [] };
} else if (theater.type === 'echo') {
targetModule = { type: 'cards', title: '物品', items: theater.data?.items || parseItemsContent(theater.html || theater.content) };
} else if (theater.type === 'ccd') {
targetModule = { type: 'theater', title: '文字剧场', content: theater.html || theater.content, scenes: theater.data?.scenes, text: theater.data?.text };
}
    }
    return targetModule;
}

// 【小剧场融合】将小剧场内容注入到日志功能
function injectTheaterToLogs(theaterContent) {
    if (!theaterContent || Object.keys(theaterContent).length === 0) return;

    // 确保 _worldModules 存在
    if (!Array.isArray(gameState._worldModules)) gameState._worldModules = [];

    Object.keys(theaterContent).forEach(function(key) {
        var theater = theaterContent[key];
        var targetModule = null;

        // 优先使用 theater 自身的 type 字段（AI 可直接指定模块类型）
        if (theater.type && typeof theater.type === 'string' && theater.type !== 'theater') {
            targetModule = _createModuleFromType(theater.type, theater, key);
        }

        // 如果没有 type 或 type 为 'theater'，走标签名映射
        if (!targetModule) {
            targetModule = _mapTheaterByKey(key, theater);
        }

        if (targetModule) {
            // 查找是否已有同类型模块，有则更新，无则添加
            var existingIdx = gameState._worldModules.findIndex(function(m) {
                return m.type === targetModule.type && m.title === targetModule.title;
            });
            if (existingIdx >= 0) {
                gameState._worldModules[existingIdx] = targetModule;
            } else {
                gameState._worldModules.push(targetModule);
            }
            console.log('[小剧场融合] 已注入', key, '到', targetModule.type);
        }
    });
}

// 【深度融合】将预设<branches>选项桥接到游戏原生renderChoices系统
// 这样预设的剧情分支选项会直接出现在游戏选项面板中，而不是只在日志页
function _bridgeBranchesToChoices(theaterContent) {
    if (!theaterContent) return;
    var branchesData = theaterContent['branches'] || theaterContent['选项分支'] || theaterContent['分支'];
    if (!branchesData) return;

    // 从解析后的数据中提取选项
    var options = [];
    if (branchesData.data && branchesData.data.options && branchesData.data.options.length > 0) {
        // 结构化数据（<option>子标签解析结果）
        options = branchesData.data.options.map(function(opt) {
            return {
                id: String.fromCharCode(65 + ((opt.index || 0) % 26)),
                text: opt.text || opt.content || '',
                tag: opt.condition ? '条件' : '分支'
            };
    });
} else if (branchesData.html || branchesData.content) {
// 纯文本格式，按行解析
var rawText = (branchesData.html || branchesData.content).replace(/<[^>]+>/g, '').trim();
var lines = rawText.split(/\n/).filter(function(l) { return l.trim(); });
options = lines.map(function(line, idx) {
    return {
        id: String.fromCharCode(65 + (idx % 26)),
        text: line.trim(),
        tag: '分支'
    };
});
}

if (options.length > 0) {
    // 桥接到游戏原生选项系统
    if (typeof renderChoices === 'function') {
        renderChoices(options);
        console.log('[深度融合] 已将 ' + options.length + ' 个<branches>选项桥接到游戏选项系统');
    }
}
}

// 【深度融合】将预设<meow_FM>摘要桥接到游戏EnhancedMemory系统
function _bridgeSummaryToMemory(theaterData) {
    if (!theaterData) return;
    var summaryText = '';
    if (theaterData.data && theaterData.data.summary) {
        summaryText = theaterData.data.summary;
    } else if (theaterData.content) {
    summaryText = theaterData.content.replace(/<[^>]+>/g, '').trim();
} else if (theaterData.html) {
summaryText = theaterData.html.replace(/<[^>]+>/g, '').trim();
}
if (!summaryText || summaryText.length < 10) return;

// 注入到EnhancedMemory的短期记忆
if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.shortTermMemory && EnhancedMemory.shortTermMemory.summaries) {
    var summaryEntry = {
        turn: (gameState._stats && gameState._stats.totalTurns) || 0,
        storySummary: summaryText.substring(0, 500),
        timestamp: Date.now(),
        source: 'preset_meow_FM'
    };
EnhancedMemory.shortTermMemory.summaries.push(summaryEntry);
// 保留最近10条短期记忆
if (EnhancedMemory.shortTermMemory.summaries.length > EnhancedMemory.shortTermMemory.maxRounds) {
    EnhancedMemory.shortTermMemory.summaries = EnhancedMemory.shortTermMemory.summaries.slice(-EnhancedMemory.shortTermMemory.maxRounds);
}
console.log('[深度融合] 已将<meow_FM>摘要桥接到EnhancedMemory (长度:' + summaryText.length + ')');
}

// 同时更新游戏的滚动摘要（如果AI没有返回contextSummary）
if (!gameState.rollingSummary || gameState.rollingSummary.length < 50) {
    gameState.rollingSummary = summaryText.substring(0, 300);
    console.log('[深度融合] 已更新滚动摘要');
}
}

// 【深度融合】将预设状态面板数据桥接到游戏NPC角色系统
function _bridgeStatusToCharacters(theaterData) {
    if (!theaterData) return;
    var stats = (theaterData.data && theaterData.data.stats) || [];
    if (stats.length === 0) return;

    var charUpdate = {};
    var targetCharName = null;

    // 优先处理结构化数据：stats 中带有 field 字段的项直接映射
    stats.forEach(function(stat) {
        if (!stat || !stat.name) return;
        var value = (stat.value || '').replace(/<[^>]+>/g, '').trim();
        if (!value) return;

        // 结构化数据：stat.field 直接指定了目标字段
        if (stat.field) {
            charUpdate[stat.field] = value;
            // 如果 field 是 name，提取角色名
            if (stat.field === 'name' || stat.field === '角色名') {
                targetCharName = value;
            }
            return;
        }

        // 回退：关键词匹配（兼容旧格式）
        var name = stat.name.replace(/[：:]/g, '').trim();
        var lowerName = name.toLowerCase();
        if (lowerName.includes('心情') || lowerName.includes('情绪') || lowerName.includes('状态')) {
            charUpdate.desc = value;
        } else if (lowerName.includes('位置') || lowerName.includes('地点') || lowerName.includes('所在')) {
            charUpdate.location = value;
        } else if (lowerName.includes('穿着') || lowerName.includes('服装') || lowerName.includes('服饰')) {
            charUpdate.outfit = value;
        } else if (lowerName.includes('名字') || lowerName.includes('角色') || lowerName.includes('名称') || lowerName === 'name') {
            targetCharName = value;
        }
    });

    // 更新NPC的状态
    if (Object.keys(charUpdate).length > 0 && typeof mergeCharacters === 'function') {
        // 尝试从标题获取角色名
        if (!targetCharName && theaterData.data && theaterData.data.title) {
            targetCharName = theaterData.data.title.replace(/[：:]/g, '').trim();
        }
        // 回退：匹配已有角色
        if (!targetCharName && gameState.allCharacters) {
            var charNames = Object.keys(gameState.allCharacters);
            if (charNames.length > 0) targetCharName = charNames[0];
        }
        if (targetCharName) {
            var update = Object.assign({ name: targetCharName }, charUpdate);
            mergeCharacters([update]);
            console.log('[深度融合] 已将状态面板数据桥接到NPC系统:', targetCharName);
        }
    }
}

// 【深度融合】将预设的字数/段落配置同步到游戏设置界面
function _syncPresetWordCountToUI(config) {
    if (!config) return;
    // 确保 gameState.wordCountConfig 已初始化
    if (!gameState.wordCountConfig) {
        gameState.wordCountConfig = { enabled: true, min: 1500, max: 3000, paragraphMin: 15, paragraphMax: 17, paragraphStyle: 'medium', lengthPreset: 'medium' };
    }
// 更新gameState
if (config.enabled !== undefined) gameState.wordCountConfig.enabled = config.enabled;
if (config.min != null) gameState.wordCountConfig.min = config.min;
if (config.max != null) gameState.wordCountConfig.max = config.max;
if (config.paragraphMin != null) gameState.wordCountConfig.paragraphMin = config.paragraphMin;
if (config.paragraphMax != null) gameState.wordCountConfig.paragraphMax = config.paragraphMax;
if (config.paragraphStyle) gameState.wordCountConfig.paragraphStyle = config.paragraphStyle;
if (config.lengthPreset) gameState.wordCountConfig.lengthPreset = config.lengthPreset;

// 同步到UI元素（如果设置页面有对应的DOM）
var wcMinEl = document.getElementById('wcMin');
var wcMaxEl = document.getElementById('wcMax');
var wcStyleEl = document.getElementById('wcParagraphStyle');
var wcEnabledEl = document.getElementById('wcEnabled');

if (wcMinEl) wcMinEl.value = config.min || 1500;
if (wcMaxEl) wcMaxEl.value = config.max || 3000;
if (wcStyleEl) wcStyleEl.value = config.paragraphStyle || 'medium';
if (wcEnabledEl) wcEnabledEl.checked = config.enabled !== false;

console.log('[深度融合] 已将预设字数配置同步到设置UI:', config.min + '-' + config.max + '字');
}

// 【深度融合】将预设<profile>角色关系数据桥接到游戏关系系统
function _bridgeProfileToRelationships(theaterData) {
    if (!theaterData) return;
    var content = theaterData.html || theaterData.content || '';
    if (!content || content.length < 20) return;

    // 尝试从mermaid图或文本中提取角色关系
    // 常见格式: "角色A --关系--> 角色B" 或 "角色A - 关系 - 角色B"
    var relations = [];

    // mermaid格式: A-->|关系|B
    var mermaidRegex = /([^\s\-|>]+?)\s*(?:--+>|===+>)\s*\|?\s*([^|>]+?)\s*\|?\s*([^\s\-|]+)/g;
    var match;
    while ((match = mermaidRegex.exec(content)) !== null) {
        relations.push({ from: match[1].trim(), relation: match[2].trim(), to: match[3].trim() });
    }

// 文本格式: "A和B：关系" 或 "A - B：关系"
if (relations.length === 0) {
    var textRegex = /(?:^|\n)\s*([^:\n]+?)\s*[和与\-—]\s*([^:\n]+?)\s*[：:]\s*(.+?)(?:\n|$)/g;
    while ((match = textRegex.exec(content)) !== null) {
        relations.push({ from: match[1].trim(), relation: match[3].trim(), to: match[2].trim() });
    }
}

// 将提取的关系注入到游戏系统
if (relations.length > 0 && gameState.allCharacters) {
    relations.forEach(function(rel) {
        // 更新"from"角色的关系描述
        if (gameState.allCharacters[rel.from]) {
            gameState.allCharacters[rel.from].relation = rel.relation;
        }
    // 确保"to"角色也存在
    if (!gameState.allCharacters[rel.to]) {
        gameState.allCharacters[rel.to] = { name: rel.to, relation: '' };
    }
});
if (typeof renderNpcList === 'function') renderNpcList();
console.log('[深度融合] 已将 ' + relations.length + ' 条角色关系桥接到NPC系统');
}
}

// 【小剧场融合】解析论坛内容
function parseForumContent(html) {
    var items = [];
    // 尝试解析帖子列表
    var postMatches = html.match(/<div[^>]*class=["']post["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    postMatches.forEach(function(match) {
        var author = (match.match(/class=["']author["'][^>]*>([^<]+)/i) || [])[1] || '匿名';
        var content = (match.match(/class=["']content["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || match.replace(/<[^>]+>/g, '');
        var time = (match.match(/class=["']time["'][^>]*>([^<]+)/i) || [])[1] || new Date().toLocaleString();
        items.push({ author: author, content: content, time: time, likes: 0, replies: 0 });
    });
if (items.length === 0) {
    // 如果没有解析到结构化内容，将整个HTML作为一个帖子
    items.push({ author: '小剧场', content: html.replace(/<[^>]+>/g, '').substring(0, 200), time: new Date().toLocaleString() });
}
return items;
}

// 【小剧场融合】解析聊天内容
function parseChatContent(html) {
    var messages = [];
    var msgMatches = html.match(/<div[^>]*class=["']message["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    msgMatches.forEach(function(match) {
        var sender = (match.match(/class=["']sender["'][^>]*>([^<]+)/i) || [])[1] || '未知';
        var text = (match.match(/class=["']text["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || match.replace(/<[^>]+>/g, '');
        messages.push({ sender: sender, text: text, time: new Date().toLocaleTimeString() });
    });
return messages;
}

function injectToChatLog(npcName, theater) {
    if (!gameState._chatLogs || Array.isArray(gameState._chatLogs)) gameState._chatLogs = {};
    if (!gameState._chatLogs[npcName]) gameState._chatLogs[npcName] = [];
    gameState._chatLogs[npcName].push({
        role: 'npc',
        text: (theater.content || '').substring(0, 100) + (theater.content.length > 100 ? '...' : ''),
        time: new Date().toLocaleTimeString(),
        isTheater: true,
        theaterType: theater.type
    });
// 【修复】限制每个NPC聊天记录上限，防止无限增长导致存档膨胀
if (gameState._chatLogs[npcName].length > 50) {
    gameState._chatLogs[npcName] = gameState._chatLogs[npcName].slice(-50);
}
}

// 【小剧场融合】解析日程内容
function parseCalendarContent(html) {
    var events = [];
    // 尝试解析Event格式: Event: type|title|description|time|location
    var eventMatches = html.match(/Event:\s*([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^\n]+)/gi) || [];
    eventMatches.forEach(function(match) {
        var parts = match.replace(/Event:\s*/, '').split('|');
        events.push({
            type: parts[0] || '其他',
            title: parts[1] || '无标题',
            description: parts[2] || '',
            time: parts[3] || '',
            location: parts[4] || ''
        });
});
if (events.length === 0) {
    // 尝试解析简单列表
    var lines = html.replace(/<[^>]+>/g, '').split('\n').filter(function(l) { return l.trim(); });
    lines.forEach(function(line) {
        events.push({ type: '日程', title: line.trim(), description: '', time: '', location: '' });
    });
}
return events;
}

// 【小剧场融合】解析邮件内容
function parseMailContent(html) {
    var mails = [];
    var mailMatches = html.match(/<div[^>]*class=["']mail["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    mailMatches.forEach(function(match) {
        var from = (match.match(/class=["']from["'][^>]*>([^<]+)/i) || [])[1] || '系统';
        var subject = (match.match(/class=["']subject["'][^>]*>([^<]+)/i) || [])[1] || '无主题';
        var content = (match.match(/class=["']body["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || match.replace(/<[^>]+>/g, '');
        mails.push({ from: from, subject: subject, preview: content.substring(0, 50), content: content, read: false, time: new Date().toLocaleString() });
    });
if (mails.length === 0) {
    mails.push({ from: '系统通知', subject: '小剧场', preview: html.replace(/<[^>]+>/g, '').substring(0, 50), content: html, read: false });
}
return mails;
}

// 【小剧场融合】解析商店内容
function parseShopContent(html) {
    var goods = [];
    var itemMatches = html.match(/<div[^>]*class=["']item["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    itemMatches.forEach(function(match) {
        var name = (match.match(/class=["']name["'][^>]*>([^<]+)/i) || [])[1] || '商品';
        var price = parseInt((match.match(/class=["']price["'][^>]*>([\d]+)/i) || [])[1]) || 100;
        var desc = (match.match(/class=["']description["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '';
        goods.push({ name: name, price: price, description: desc.replace(/<[^>]+>/g, ''), icon: '📦' });
    });
return goods;
}

// 【小剧场融合】解析朋友圈内容
function parseMomentsContent(html) {
    var moments = [];
    var momentMatches = html.match(/<div[^>]*class=["']moment["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    momentMatches.forEach(function(match) {
        var author = (match.match(/class=["']author["'][^>]*>([^<]+)/i) || [])[1] || '匿名';
        var content = (match.match(/class=["']content["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || match.replace(/<[^>]+>/g, '');
        var likes = parseInt((match.match(/class=["']likes["'][^>]*>([\d]+)/i) || [])[1]) || 0;
        moments.push({ author: author, content: content, time: '刚刚', likes: likes, comments: [] });
    });
if (moments.length === 0 && html.trim()) {
    moments.push({ author: '小剧场', content: html.replace(/<[^>]+>/g, ''), time: '刚刚', likes: 0, comments: [] });
}
return moments;
}

// 【小剧场融合】解析物品内容
function parseItemsContent(html) {
    var items = [];
    var itemMatches = html.match(/<div[^>]*class=["']item["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    itemMatches.forEach(function(match) {
        var name = (match.match(/class=["']name["'][^>]*>([^<]+)/i) || [])[1] || '物品';
        var count = parseInt((match.match(/class=["']count["'][^>]*>([\d]+)/i) || [])[1]) || 1;
        var rarity = (match.match(/class=["']rarity["'][^>]*>([^<]+)/i) || [])[1] || '普通';
        items.push({ name: name, count: count, rarity: rarity, icon: '🎁' });
    });
return items;
}

// 【小剧场融合】解析日记内容
function parseDiaryContent(html) {
    var entries = [];
    var entryMatches = html.match(/<div[^>]*class=["']entry["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    entryMatches.forEach(function(match) {
        var date = (match.match(/class=["']date["'][^>]*>([^<]+)/i) || [])[1] || new Date().toLocaleDateString();
        var content = (match.match(/class=["']content["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || match.replace(/<[^>]+>/g, '');
        entries.push({ date: date, content: content });
    });
return entries;
}

// API错误信息中文翻译
function translateError(msg) {
    if (!msg) return '未知错误，请稍后重试';
    var m = msg;
    // 常见英文错误 -> 中文翻译映射表
    // 【分类】按错误类型分组，翻译包含：原因 + 建议操作
    var map = {
        // ═══ 网络连接错误 ═══
        'Failed to fetch': '网络请求失败（可能原因：网络断开、API地址错误、服务未启动）→ 请检查网络连接和API地址',
        'NetworkError when attempting to fetch resource': '网络错误 → 请检查网络连接是否正常',
        'Network request failed': '网络请求失败 → 请检查网络连接',
        'net::ERR_CONNECTION_REFUSED': '连接被拒绝 → API地址可能不正确，或API服务未启动',
        'net::ERR_CONNECTION_TIMED_OUT': '连接超时 → API服务器响应太慢或地址不正确',
        'net::ERR_NAME_NOT_RESOLVED': '域名解析失败 → 请检查API地址是否拼写正确',
        'net::ERR_SSL_PROTOCOL_ERROR': 'SSL协议错误 → 请检查API地址是否使用了正确的HTTPS配置',
        'net::ERR_CERT_DATE_INVALID': 'SSL证书已过期 → API服务器的证书需要更新',
        'net::ERR_INTERNET_DISCONNECTED': '网络已断开 → 请检查网络连接',
        'net::ERR_CONNECTION_CLOSED': '连接被关闭 → API服务器中断了连接，请重试',
        'net::ERR_EMPTY_RESPONSE': '服务器返回空响应 → API服务可能异常，请稍后重试',
        'net::ERR_SOCKET_NOT_CONNECTED': '套接字未连接 → 网络连接异常，请重试',
        'ECONNREFUSED': '连接被拒绝 → API服务可能未启动或端口不正确',
        'ECONNRESET': '连接被重置 → API服务器可能重启了，请重试',
        'ETIMEDOUT': '连接超时 → API服务器响应太慢，请检查网络或更换API',
        'ENOTFOUND': '域名不存在 → 请检查API地址是否正确',
        'EAI_AGAIN': 'DNS解析临时失败 → 请检查网络连接后重试',
        'EPROTO': '协议错误 → 请检查API地址是否使用了正确的协议（HTTP/HTTPS）',
        'UND_ERR_CONNECT_TIMEOUT': '连接超时 → API服务器未响应，请检查地址和网络',

        // ═══ 请求取消 ═══
        'AbortError': '请求已取消',
        'The user aborted a request': '请求已被取消',
        '请求已取消': '请求已取消',

        // ═══ JSON/数据解析错误 ═══
        'Unexpected end of JSON input': '服务器返回了不完整的数据 → 可能是网络不稳定或API异常，请重试',
        'Unexpected token': '服务器返回了无法解析的数据 → API可能返回了非JSON格式，请检查API配置',
        'JSON parse error': 'JSON解析失败 → API返回了非法格式，请检查API地址是否正确',
        'SyntaxError': '数据格式错误 → API返回了无法识别的内容，请检查API配置',

        // ═══ HTTP 状态码（完整匹配）═══
        '400 Bad Request': '请求格式错误(400) → 请检查模型名称和参数是否正确',
        '401 Unauthorized': '认证失败(401) → API Key错误或已过期，请到「设置→API配置」检查',
        '403 Forbidden': '没有权限(403) → 该API Key无权访问此模型，请检查Key的权限范围',
        '404 Not Found': '地址不存在(404) → 请检查API地址是否正确（注意路径是否需要加/v1）',
        '408 Request Timeout': '请求超时(408) → API服务器处理太慢，请重试',
        '429 Too Many Requests': '请求太频繁(429) → 已触发速率限制，请等待几秒后重试',
        '500 Internal Server Error': '服务器内部错误(500) → API服务商的问题，请稍后重试',
        '502 Bad Gateway': '网关错误(502) → API中转服务异常，可能正在维护',
        '503 Service Unavailable': '服务不可用(503) → API服务暂时过载或维护中，请稍后重试',
        '504 Gateway Timeout': '网关超时(504) → API中转服务等待上游响应超时',
        '529 Site Overloaded': '站点过载(529) → API服务器负载过高，请稍后重试',

        // ═══ HTTP 状态码（短格式）═══
        '401': '认证失败 → API Key错误或已过期，请到「设置→API配置」检查',
        '403': '没有权限 → 该API Key无权访问此资源，请检查Key的权限',
        '404': '地址不存在 → 请检查API地址是否正确',
        '429': '请求太频繁 → 已触发速率限制，请等待几秒后重试',
        '500': '服务器内部错误 → API服务商的问题，请稍后重试',
        '502': '网关错误 → API中转服务异常，可能正在维护',
        '503': '服务不可用 → API服务暂时过载或维护中，请稍后重试',
        '504': '网关超时 → API中转服务等待上游响应超时',

        // ═══ OpenAI/兼容API 特定错误 ═══
        'insufficient_quota': 'API额度不足 → 请到API服务商官网充值，或切换到其他API Key',
        'rate_limit_exceeded': '请求频率超限 → 请降低发送速度，或升级API套餐',
        'context_length_exceeded': '上下文超出模型限制 → 对话太长了，请尝试：1)减少设定长度 2)开启摘要压缩 3)换用更大上下文的模型',
        'invalid_api_key': 'API Key无效 → 请到「设置→API配置」检查Key是否正确复制（注意前后空格）',
        'model_not_found': '模型不存在 → 请到API配置检查模型名称是否正确（注意大小写和拼写）',
        'Maximum context length': '超出最大上下文长度 → 对话内容太长，请压缩对话或更换更大上下文的模型',
        'This model maximum context length': '超出模型最大上下文长度 → 请减少对话轮数或换用更大上下文的模型',
        'openai_error': 'OpenAI接口错误 → 请检查API地址和密钥是否正确',
        'invalid_request_error': '请求格式错误 → 可能是模型名称、参数格式有误，请检查API配置',
        'authentication_error': '认证失败 → API Key无效或已过期，请到「设置→API配置」重新填写',
        'permission_denied': '权限不足 → 该API Key无权访问此模型，请检查Key的权限范围',
        'not_found': '请求的资源不存在 → 请检查API地址和模型名称',
        'rate_limit_error': '请求频率超限 → 请稍后再试，或升级API套餐',
        'server_error': 'API服务器内部错误 → 服务商的问题，请稍后重试',
        'service_unavailable': 'API服务暂不可用 → 服务商可能正在维护，请稍后重试',
        'server_busy': '服务器繁忙 → 请稍后重试',
        'overloaded': '服务器过载 → 请稍后重试',
        'capacity': '容量不足 → API服务当前负载过高，请稍后重试',

        // ═══ API Key / 账户相关 ═══
        'Incorrect API key provided': 'API Key 不正确 → 请到「设置→API配置」检查并重新粘贴（注意前后空格和换行）',
        'You exceeded your current quota': '账户额度已用完 → 请到API服务商官网充值，或切换到其他API Key',
        'You must provide a model': '未指定模型 → 请到「设置→API配置」填写模型名（如 gpt-4o-mini、deepseek-chat）',
        'The model `': '模型不存在或已下架 → 请到API配置检查模型名是否正确',
        'has been deprecated': '该模型已下架 → 请更换为其他可用模型',
        'deprecat': '该模型已下架 → 请更换为其他可用模型',
        'Billing': '账单问题 → 请到API服务商官网检查账户余额和账单',
        'billing_not_active': '账单未激活 → 请到API服务商官网绑定支付方式',
        'card_declined': '支付卡被拒绝 → 请到API服务商官网更新支付方式',
        'trial_expired': '试用已过期 → 请到API服务商官网升级为付费账户',

        // ═══ 中文错误二次翻译（中转站返回的中文错误）═══
        '余额不足': '账户余额不足 → 请到API服务商官网充值，或更换API Key',
        '额度不足': '账户额度不足 → 请到API服务商官网充值，或更换API Key',
        'API key 余额': 'API Key余额不足 → 请充值或更换Key',
        'key 已过期': 'API Key已过期 → 请到API服务商官网重新生成Key',
        '未配置模型': '未配置模型 → 请到「设置→API配置」填写模型名',
        '无效的': '参数无效 → 请检查API配置中的参数设置',

        // ═══ 模型相关 ═══
        'invalid model': '模型名称无效 → 请到API配置检查模型名（注意大小写，如 deepseek-chat 不是 DeepSeek-Chat）',
        'model_overloaded': '模型过载 → 当前使用人数太多，请稍后重试或切换模型',
        'model_rate_limit': '模型速率限制 → 该模型请求太频繁，请稍后重试',

        // ═══ 内容安全/过滤 ═══
        'content_filter': '内容被安全过滤 → AI认为生成内容可能违规，请调整输入或设定',
        'safety': '安全过滤触发 → AI拒绝了本次生成，请调整输入内容',
        'flagged': '内容被标记 → AI安全系统拦截了本次请求，请调整输入',

        // ═══ 流式/SSE相关 ═══
        'stream_error': '流式传输错误 → 连接中断，请重试',
        'connection lost': '连接丢失 → 网络不稳定导致流式传输中断，请重试',

        // ═══ JavaScript运行时错误 ═══
        'Cannot read properties of null': '数据加载失败 → 可能是存档数据异常，请刷新页面后重试',
        'Cannot read property': '数据读取失败 → 请刷新页面后重试',
        'null is not an object': '数据未加载完成 → 请稍后重试',
        'undefined is not an object': '数据未定义 → 请刷新页面重试',
        'TypeError': '类型错误 → 请刷新页面后重试',
        'ReferenceError': '引用错误 → 请刷新页面',

        // ═══ 其他常见错误 ═══
        'timeout': '请求超时 → AI思考时间过长，可能是模型太忙或上下文太长',
        'Timeout': '请求超时 → AI思考时间过长，请重试或减少上下文长度',
        'CORS': '跨域请求被阻止 → API地址可能不支持浏览器直接访问，请使用支持CORS的中转站',
        'cors': '跨域请求被阻止 → 请更换支持浏览器访问的API地址',
        'Invalid URL': 'API地址无效 → 请检查设置中的URL格式（需以http://或https://开头）',
        'No API key': '未配置API Key → 请先到「设置→API配置」添加Key',
        'No API configuration': '未配置API → 请先到「设置→API配置」添加API信息',
        'fetch failed': '获取数据失败 → 请检查网络连接和API地址是否正确',
        'no api configuration': '未配置API → 请先到「设置→API配置」添加API信息',
        'api key': 'API密钥相关错误',
        'api_key': 'API密钥相关错误',
        'API key': 'API密钥相关错误',
        'API Key': 'API密钥相关错误',
        'error processing': '处理数据时出错 → 请重试',
        'parse error': '解析数据出错 → API返回了无法识别的内容',
        'invalid response': '无效的响应 → API返回了异常数据，请检查API配置',
        'empty response': '服务器返回空数据 → AI未生成任何内容，可能是max_tokens太小或模型异常',
        '请求超时（5分钟）': 'AI请求超时（5分钟）→ 模型思考时间过长，可能是上下文太大或模型过载，请重试',
    };
// 预构建按长度降序排列的key数组，避免每次调用都排序
var _translateErrorSortedKeys = null;
function _getTranslateErrorSortedKeys(map) {
    if (!_translateErrorSortedKeys) {
        _translateErrorSortedKeys = Object.keys(map).sort(function(a, b) { return b.length - a.length; });
    }
    return _translateErrorSortedKeys;
}
// 【修复】如果翻译后的结果与原文不同，在末尾附加原始错误信息
// 这样用户既能看到中文解释，也能看到原始英文错误用于排查
var translated = null;
for (var key in map) {
    if (m === key) { translated = map[key]; break; }
}
if (!translated) {
    var keys = _getTranslateErrorSortedKeys(map);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (m.indexOf(key) !== -1) { translated = map[key]; break; }
    }
}
if (translated && translated !== m) {
    return translated + ' (' + m + ')';
}
// HTTP状态码翻译
var httpMatch = m.match(/HTTP\s*(\d{3})/);
if (httpMatch) {
    var code = httpMatch[1];
    var httpMap = {
        '400': '请求格式错误(400) → 请检查模型名称和参数',
        '401': '认证失败(401) → API Key错误或已过期',
        '403': '没有权限(403) → 该Key无权访问此资源',
        '404': '地址不存在(404) → 请检查API地址',
        '408': '请求超时(408) → 服务器处理太慢',
        '429': '请求太频繁(429) → 请稍后再试',
        '500': '服务器内部错误(500) → 服务商问题，请稍后重试',
        '502': '网关错误(502) → 中转服务异常',
        '503': '服务不可用(503) → 服务过载或维护中',
        '504': '网关超时(504) → 中转服务等待上游超时',
        '529': '站点过载(529) → 服务器负载过高',
    };
if (httpMap[code]) return httpMap[code];
}
// API错误码格式："Error: NNN - message" 或 "API错误: NNN"
var apiCodeMatch = m.match(/(?:Error|错误)[:\s]*(\d{3})/);
if (apiCodeMatch) {
    var apiCode = apiCodeMatch[1];
    var apiCodeMap = {
        '400': '请求格式错误 → 请检查模型名称和参数是否正确',
        '401': '认证失败 → API Key错误或已过期，请到「设置→API配置」检查',
        '403': '权限不足 → 该API Key无权访问此模型',
        '404': '地址不存在 → 请检查API地址是否正确',
        '429': '请求太频繁 → 已触发速率限制，请等待几秒后重试',
        '500': '服务器内部错误 → API服务商的问题，请稍后重试',
        '502': '网关错误 → API中转服务异常，可能正在维护',
        '503': '服务不可用 → API服务暂时过载或维护中',
        '504': '网关超时 → API中转服务等待上游响应超时',
    };
    if (apiCodeMap[apiCode]) return apiCodeMap[apiCode];
}
// 都没匹配到，返回友好提示（截断过长消息）
if (m.length > 100) {
    return '发生错误：' + m.substring(0, 80) + '...（详情见控制台）';
}
return '发生错误：' + m;
}

// rebindBtn 辅助函数：统一处理按钮事件重新绑定
function rebindBtn(btn, eventType, handler) {
    var clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener(eventType, handler);
    return clone;
}

// safeSetItem 已在 utils.js 中统一定义，此处不再重复声明

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 轻量级HTML净化（防止XSS）
// 允许基本格式标签，移除危险属性和事件处理器
// 【性能优化】预编译 sanitizeHtml 中所有正则，避免每次调用都重新编译
var _reSanScript = new RegExp('<script[\\s\\S]*?<\\/script>', 'gi');
var _reSanEventAttr1 = /\/?on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>\/]+)/gi;
var _reSanEventAttr2 = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
var _reSanJsHref = /href\s*=\s*["']?\s*javascript\s*:[^"'>]*/gi;
var _reSanJsSrc = /src\s*=\s*["']?\s*javascript\s*:[^"'>]*/gi;
var _reSanVbsHref = /href\s*=\s*["']?\s*vbscript\s*:[^"'>]*/gi;
var _reSanDataSrc = /src\s*=\s*["']?\s*data\s*:[^"'>]*/gi;
var _reSanDangerTag = /<(iframe|object|embed|form|meta|link|base|svg)[^>]*>/gi;
var _reSanDangerTagClose = new RegExp('<\\/(iframe|object|embed|form|meta|link|base|svg)>', 'gi');
var _reSanExpression = /expression\s*\([^)]*\)/gi;

function sanitizeHtml(html) {
    if (!html) return '';
    var str = String(html);
    // 重置所有正则的 lastIndex
    _reSanScript.lastIndex = 0; _reSanEventAttr1.lastIndex = 0;
    _reSanEventAttr2.lastIndex = 0; _reSanJsHref.lastIndex = 0;
    _reSanJsSrc.lastIndex = 0; _reSanVbsHref.lastIndex = 0;
    _reSanDataSrc.lastIndex = 0; _reSanDangerTag.lastIndex = 0;
    _reSanDangerTagClose.lastIndex = 0; _reSanExpression.lastIndex = 0;
    // 移除script标签及其内容
    str = str.replace(_reSanScript, '');
    // 移除SVG事件（onload, onerror等，包括无空格分隔的情况）
    str = str.replace(_reSanEventAttr1, '');
    // 移除所有事件属性（onclick, onerror, onload 等）
    str = str.replace(_reSanEventAttr2, '');
    // 移除 javascript: 协议（包括大小写变体和编码变体）
    str = str.replace(_reSanJsHref, 'href="#"');
    str = str.replace(_reSanJsSrc, 'src=""');
    // 移除 vbscript: 协议
    str = str.replace(_reSanVbsHref, 'href="#"');
    // 移除 data: 协议（防止base64注入）
    str = str.replace(_reSanDataSrc, 'src=""');
    // 移除危险标签
    str = str.replace(_reSanDangerTag, '');
    str = str.replace(_reSanDangerTagClose, '');
    // 移除 style 标签中的 expression 和 url()
    str = str.replace(_reSanExpression, '');
    return str;
}
// 页面关闭前保存
// 【统一管理】走 GlobalCleanup，页面卸载时统一移除
GlobalCleanup.registerListener(window, 'beforeunload', function() {
    try {
        var data = buildSaveData('');
        Storage.setJSON(Storage.KEYS.AUTO_SAVE_BACKUP, data);
    } catch(e) { console.warn('beforeunload save failed:', e); }
try {
    if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.saveToStorage) {
        EnhancedMemory.saveToStorage();
    }
} catch(memE) {}
});
function parseMarkdown(text) {
    if (!text) return '';
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}
// --- applyFontSize 适配 ---
/**
* 折叠/展开设置组
*/
function toggleSettingGroup(header) {
    var body = header.nextElementSibling;
    var icon = header.querySelector('.toggle-icon');
    if (body) {
        var isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'block' : 'none';
        if (icon) icon.textContent = isHidden ? '▲' : '▼';
    }
}
function applyFontSize() {
    var storyText = document.getElementById('storyText');
    if (storyText) storyText.style.fontSize = (gameState.fontSize || 16) + 'px';
}



// ========================================
// 第2层: UI基础
// ========================================
// ========================================
// 导航栏渲染
// ========================================
// 导航栏事件委托处理函数（避免重复绑定）
const _navBarClickHandler = function(e) {
    var btn = e.target.closest('.nav-item');
    if (!btn) return;
    var page = btn.dataset.navPage;
    if (!page) return;
    // 更新导航栏按钮高亮状态
    var navContainer = btn.parentElement;
    if (navContainer) {
        navContainer.querySelectorAll('.nav-item').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
    }
    UI.showPage(page);
    // 延迟渲染，让浏览器先显示页面切换效果
    var renderFn = null;
    if (page === 'playerPage') renderFn = renderPlayerPage;
    else if (page === 'npcPage') renderFn = renderNpcPage;
    else if (page === 'recapPage') renderFn = renderRecapPage;
    else if (page === 'logPage') renderFn = renderLogPage;
    else if (page === 'memoryPage' && typeof MemoryManagerUI !== 'undefined') renderFn = function() { MemoryManagerUI.show(); UI.showPage('memoryPage'); };
    if (renderFn) requestAnimationFrame(function() { renderFn(); });
    // 注：原此处有 5 次 GameLinker.refreshByDataChange() 调用，
    // 但 GameLinker 从未被 register 过（_refreshers 为空），调用本身是空操作，
    // 反而会调度 5×N 个无意义的 rAF 回调，让点击体感卡顿。已移除。
};
function renderNavBar(containerId, tabs, activeIndex) {
    var container = document.getElementById(containerId);
    if (!container) return;
    // 首次渲染时绑定事件委托，避免重复绑定
    if (!container._hasEventDelegate) {
        container.addEventListener('click', _navBarClickHandler);
        container._hasEventDelegate = true;
    }
    // 【性能优化】tabs 结构未变时，只切 active 类，避免每次重建 6 个按钮
    var tabsKey = tabs.map(function(t) { return t.page + '|' + t.icon + '|' + t.label; }).join('||');
    if (container._tabsKey === tabsKey) {
        var items = container.querySelectorAll('.nav-item');
        for (var ai = 0; ai < items.length; ai++) {
            if (ai === activeIndex) items[ai].classList.add('active');
            else items[ai].classList.remove('active');
        }
        return;
    }
    container._tabsKey = tabsKey;
    container.innerHTML = tabs.map(function(tab, i) {
        var isActive = i === activeIndex ? ' active' : '';
        return '<button class="nav-item' + isActive + '" data-nav-page="' + tab.page + '">' +
        '<svg class="icon"><use href="#' + tab.icon + '"/></svg>' +
        '<span class="nav-label">' + tab.label + '</span></button>';
    }).join('');
}
// ========================================
// 【导航栈】浏览器返回键拦截
// ========================================
// 页面加载时压入初始历史状态
history.pushState(null, '', location.href);
// 【统一管理】走 GlobalCleanup，页面卸载时统一移除
GlobalCleanup.registerListener(window, 'popstate', function(e) {
    e.preventDefault();
    // 有导航栈条目 → 返回上一级
    if (UI._navStack.length > 0) {
        UI.popNav();
        return;
    }
    // 在剧情页 → 弹确认框是否回主页
    var storyEl = document.getElementById('storyPage');
    if (storyEl && storyEl.classList.contains('active')) {
        history.pushState(null, '', location.href);
        UI.confirm('返回主页', '确定要回到主页吗？当前进度已自动保存。').then(function(yes) {
            if (yes) {
                UI.showPage('menuPage');
                UI._navStack = [];
            }
        });
        return;
    }
    // 其他根页面 → 拦截，不退出页面
    history.pushState(null, '', location.href);
});
function showStoryLoading() {
    // 清理定时器，防止泄漏
    TimerManager.clearInterval('loadingTimer');
    var flavors = ['命运的齿轮转动中...', '世界正在生成...', 'AI正在构思剧情...', '新篇章即将揭晓...'];
    var storyEl = document.getElementById('storyText');
    var optsEl = document.getElementById('optionsContainer');
    if (!storyEl || !optsEl) return;
    storyEl.innerHTML =
    '<div style="text-align:center;padding:40px 0;display:flex;flex-direction:column;align-items:center;text-indent:0;">' +
    '<div style="display:flex;justify-content:center;gap:10px;margin-bottom:16px;">' +
    '<div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>' +
    '<span style="color:var(--text-secondary);font-size:13px;">' + flavors[Math.floor(Math.random() *
        flavors.length)] + '</span>' +
    '<div style="margin-top:8px;font-size:12px;color:var(--text-tertiary);text-align:center;">已等待 <span id="waitSec">0</span> 秒</div></div>';
    optsEl.innerHTML = '';
    var sec = 0;
    TimerManager.setInterval('loadingTimer', function() {
        sec++;
        var el = document.getElementById('waitSec');
        if (el) el.textContent = sec;
        else {
            TimerManager.clearInterval('loadingTimer');
        }
}, 1000);
}
function hideStoryLoading() {
    TimerManager.clearInterval('loadingTimer');
    var storyEl = document.getElementById('storyText');
    if (storyEl && storyEl.querySelector('.loading-dot')) {
        storyEl.innerHTML = '';
    }
}
function showError(msg, errObj) {
    TimerManager.clearInterval('loadingTimer');
    var el = document.getElementById('storyText');
    if (!el) return;
    // 【调试】如果传入了 Error 对象，把完整堆栈展开
    var stack = '';
    var fileLine = '';
    if (errObj && errObj.stack) {
        stack = errObj.stack;
        // 提取文件名和行号（Firefox 格式: @file:line:col；Chrome 格式: at file:line:col）
        var m = stack.match(/(?:at\s+)?(?:.*?)([^\s()]+):(\d+):(\d+)/);
        if (m) fileLine = m[1] + ':' + m[2];
    }
    // 【智能提示】根据错误关键词给出可点击的快捷操作
    var action = '';
    var low = (msg || '').toLowerCase();
    if (low.indexOf('api key') !== -1 || low.indexOf('认证') !== -1 || low.indexOf('401') !== -1) {
        action = '<button onclick="UI.hideModal(\'settingsModal\');" data-close="settingsModal" style="margin-top:6px;padding:4px 10px;background:#856404;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">前往设置</button>';
    }
    // 【修复】不要清空剧情区，避免覆盖流式已渲染的内容
    // 仅在没有内容时覆盖；否则在底部追加错误提示条
    var hasContent = el && el.innerHTML && el.innerHTML.trim() && el.innerHTML.indexOf('loading-dot') === -1;
    var errBanner = '<div class="api-error-banner" data-error-ts="' + Date.now() + '" style="background:var(--accent-soft);border:1px solid var(--border);border-radius:6px;padding:12px;margin:12px 0;color:var(--text);font-size:13px;transition:opacity 0.5s;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;"><span style="font-weight:600;">△ 生成失败</span><button onclick="this.closest(\'.api-error-banner\').remove()" style="background:none;border:none;color:var(--text);cursor:pointer;font-size:16px;line-height:1;padding:0 4px;">✕</button></div>' +
        '<div style="margin-bottom:6px;">' + escapeHtml(msg) + '</div>' +
        (fileLine ? '<div style="font-size:11px;color:#d35400;margin-bottom:4px;">◎ 位置: ' + escapeHtml(fileLine) + '</div>' : '') +
        action +
        '<details style="font-size:11px;color:var(--text-secondary);"><summary style="cursor:pointer;color:var(--text-secondary);">查看完整堆栈</summary><pre style="white-space:pre-wrap;word-break:break-all;margin-top:6px;padding:8px;background:var(--bg-secondary);border-radius:4px;">' + escapeHtml(stack || msg) + '</pre></details>' +
        '</div>';
    if (hasContent) {
        el.insertAdjacentHTML('beforeend', errBanner);
    } else {
        // 真正空时才覆盖
        el.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--danger);">' +
            '<div style="font-size:16px;margin-bottom:8px;">△ 生成失败</div>' +
            '<div style="font-size:14px;color:var(--text-secondary);margin-bottom:16px;">' + escapeHtml(msg) + '</div>' +
            (fileLine ? '<div style="font-size:11px;color:#d35400;margin-bottom:8px;">◎ 错误位置: ' + escapeHtml(fileLine) + '</div>' : '') +
            (action ? '<div style="margin-bottom:12px;">' + action + '</div>' : '') +
            '<details style="font-size:11px;color:var(--text-tertiary);text-align:left;"><summary style="cursor:pointer;">查看完整堆栈</summary><pre style="white-space:pre-wrap;word-break:break-all;padding:8px;background:var(--bg-secondary);border-radius:4px;">' + escapeHtml(stack || msg) + '</pre></details>' +
            '<div style="font-size:12px;color:var(--text-tertiary);margin-top:8px;">请检查网络连接和API设置后重试</div>' +
            '</div>';
    }
    // 3秒后自动淡出并移除错误banner（与其它弹窗保持一致）
    // 【缺陷修复】使用唯一 key + 走 TimerManager，避免连续生成失败时旧 banner 永久残留
    var errKey = 'errorBanner_' + Date.now() + '_' + Math.random();
    TimerManager.setTimeout(errKey, function() {
        var banner = document.querySelector('.api-error-banner[data-error-ts]');
        if (banner) {
            banner.style.opacity = '0';
            TimerManager.setTimeout(errKey + '_remove', function() {
                if (banner.parentNode) banner.remove();
            }, 500);
        }
    }, POPUP_DURATION_MS);
    // 同步记录到 localStorage 方便排查
    try {
        var errs = Storage.getJSON(Storage.KEYS.API_ERRORS, []);
        errs.push({ msg: msg, fileLine: fileLine, stack: stack, time: Date.now() });
        if (errs.length > 20) errs = errs.slice(-20);
        Storage.setJSON(Storage.KEYS.API_ERRORS, errs);
    } catch (e) {}
}
// --- 章节标题更新 ---
function updateSceneTitle(title) {
    var titleEl = document.getElementById('storySceneTitle');
    if (titleEl && title) {
        titleEl.textContent = title;
    }
}
var _autoSaveTimer = null;
// 【阶段二】增强版全局存档写入锁
// 所有写路径（autoSave / saveToSlot / loadFromSlot / import / export / restore）串行化，
// 防止并发写入导致存档损坏；同时增加超时保险，避免一次死锁永久卡死。
var _saveLock = Promise.resolve();
var _saveLockState = {
    holder: null,
    startTime: 0,
    depth: 0
};
var SAVE_LOCK_TIMEOUT = 300000; // 5 分钟强制释放（避免长写入/大模型推理期间误释放）

function withSaveLock(fn, label) {
    label = label || 'unnamed';
    var run = _saveLock.then(function() {
        if (_saveLockState.depth > 0) {
            console.warn('[SaveLock] 检测到重入: ' + label + '，当前持有者: ' + _saveLockState.holder);
        }
        _saveLockState.holder = label;
        _saveLockState.startTime = Date.now();
        _saveLockState.depth++;
        return fn();
    }, function() {
        // 前序操作失败也不阻塞后续操作
        _saveLockState.holder = label;
        _saveLockState.startTime = Date.now();
        _saveLockState.depth++;
        return fn();
    });

    _saveLock = run.then(
        function(result) {
            _saveLockState.depth = Math.max(0, _saveLockState.depth - 1);
            if (_saveLockState.depth === 0) {
                _saveLockState.holder = null;
                _saveLockState.startTime = 0;
            }
            return result;
        },
        function(err) {
            _saveLockState.depth = Math.max(0, _saveLockState.depth - 1);
            if (_saveLockState.depth === 0) {
                _saveLockState.holder = null;
                _saveLockState.startTime = 0;
            }
            throw err;
        }
    );

    // 超时保险：如果该锁持有超过 30 秒仍未释放，强制重置
    var timeoutLabel = 'saveLockTimeout_' + label + '_' + Date.now();
    TimerManager.setTimeout(timeoutLabel, function() {
        if (_saveLockState.holder === label && (Date.now() - _saveLockState.startTime) >= SAVE_LOCK_TIMEOUT) {
            console.error('[SaveLock] 锁超时强制释放:', label);
            _saveLockState.holder = null;
            _saveLockState.startTime = 0;
            _saveLockState.depth = 0;
            _saveLock = Promise.resolve();
        }
    }, SAVE_LOCK_TIMEOUT + 100);

    return run;
}

function isSaveLocked() {
    return _saveLockState.holder !== null;
}
function getSaveLockHolder() {
    return _saveLockState.holder;
}
async function autoSave() {
    if (_autoSaveTimer) return; // 防抖：已有待执行的保存，跳过
    // 加载中不自动保存，避免读到半合并状态
    if (typeof gameState !== 'undefined' && gameState && gameState._loading) return;
    _autoSaveTimer = TimerManager.setTimeout('autoSave', async function() {
        _autoSaveTimer = null;
        await withSaveLock(async function() {
        try {
            // 存储空间预警
            if (typeof StorageMonitor !== 'undefined') {
                var cap = StorageMonitor.checkCapacity();
                if (cap.percentage > 80) {
                    UI.toast('存储空间已用 ' + Math.round(cap.percentage) + '%，建议导出旧存档后清理');
                }
            }
            // 【顶栏指示】自动存档开始：显示动画中的小绿点
            var dot = document.getElementById('autoSaveDot');
            if (dot) {
                dot.style.display = '';
                dot.style.animation = 'pulse 0.9s ease-in-out infinite';
            }
            if (typeof SaveDB !== 'undefined') {
                // 【阶段四】autoSave 明确开启序列化缓存，手动保存保持默认不重缓存
                await SaveDB.set(0, buildSaveData('', true));
            }
            // 【顶栏指示】自动存档完成：显示一秒钟后淡出
            if (dot) {
                TimerManager.setTimeout('autoSaveDotHide', function() {
                    if (!dot) return;
                    dot.style.animation = '';
                    TimerManager.setTimeout('autoSaveDotFade', function() {
                        if (dot) dot.style.display = 'none';
                    }, 1200);
                }, 300);
            }
    } catch (e) {
    console.error('[自动保存] 保存失败:', e);
    // 失败时也隐藏指示器
    var dot2 = document.getElementById('autoSaveDot');
    if (dot2) dot2.style.display = 'none';
}
        }, 'autoSave');
}, 2000);
}
function safeAbort() { if (window._currentAbort) { try { window._currentAbort.abort(); } catch(e){} } }
// 缓存 setWaiting 重复 DOM 查询的元素引用
var _setWaitingCache = {
    input: null,
    sendBtn: null,
    genControl: null,
    progressBar: null,
    initialized: false
};

function setWaiting(w) {
    // 状态未变化时直接返回
    if (typeof isWaiting !== 'undefined' && isWaiting === w) return;
    isWaiting = w;

    // 【性能】延迟初始化元素引用：第一次调用时查询并缓存
    if (!_setWaitingCache.initialized) {
        _setWaitingCache.input = document.getElementById('customAction');
        _setWaitingCache.sendBtn = document.getElementById('btnSendAction');
        _setWaitingCache.genControl = document.getElementById('genControl');
        _setWaitingCache.progressBar = document.getElementById('genProgressBar');
        _setWaitingCache.initialized = true;
    }
    var input = _setWaitingCache.input;
    var sendBtn = _setWaitingCache.sendBtn;
    if (input) input.disabled = w;
    if (sendBtn) sendBtn.disabled = w;

    // 【性能】不遍历所有 .option-btn 设内联样式——改为在 body 上加/去 .is-waiting
    // CSS 用 .is-waiting .option-btn { pointer-events: none; opacity: .5; } 接管
    // 这样避免每 tick 扫描整个 DOM
    if (w) document.body.classList.add('is-waiting');
    else document.body.classList.remove('is-waiting');

    // 显示/隐藏生成控制条
    if (_setWaitingCache.genControl) {
        if (w) _setWaitingCache.genControl.classList.add('active');
        else _setWaitingCache.genControl.classList.remove('active');
    }
    // 显示/隐藏流式输出进度条
    if (_setWaitingCache.progressBar) {
        if (w) _setWaitingCache.progressBar.classList.add('active');
        else _setWaitingCache.progressBar.classList.remove('active');
    }
}
// 获取最近 API 错误历史（用于调试面板）
function getRecentApiErrors() {
    return Storage.getJSON(Storage.KEYS.API_ERRORS, []);
}
// 清空 API 错误历史
function clearRecentApiErrors() {
    Storage.remove(Storage.KEYS.API_ERRORS);
}




// ========================================
// 第3层: AI核心
// ========================================
// ========================================
// AI调用函数（替代 GameAPI.call）
// ========================================

// 【优化 #13】参数默认值表——值等于表中默认值的字段会被过滤掉，避免某些 API 后端报错
// 同时作为 truthy 判定参考（频率/存在惩罚是 OpenAI 标准参数，按非零决定是否发送）
var SKIP_DEFAULTS = {
    top_k: 0, min_p: 0, top_a: 0,
    repetition_penalty: 1, typical_p: 1, tfs: 1,
    mirostat_mode: 0, repetition_penalty_range: 0, repetition_penalty_slope: 0,
    epsilon_cutoff: 0, eta_cutoff: 0, dry_multiplier: 0, xtc_probability: 0,
    tool_reasoning_mode: 'disabled'
};

// 【优化 #18】合法的 reasoning_effort 值白名单，避免中转站收到乱写值后报错
var VALID_REASONING_EFFORT = ['low', 'medium', 'high', 'auto'];

// 【优化 #4】从 API 错误对象中提取并本地化错误信息
// 显式判断字段，避免 translateError 对 undefined 返回 undefined 时链式调用炸掉
function extractErrorMessage(errObj, fallback) {
    if (!errObj) return fallback;
    if (errObj.message) {
        var m = translateError(errObj.message);
        if (m) return m;
    }
    if (errObj.code) {
        var c = translateError(errObj.code);
        if (c) return c;
    }
    if (errObj.type) {
        var t = translateError(errObj.type);
        if (t) return t;
    }
    if (errObj.error) {
        var e = translateError(errObj.error);
        if (e) return e;
    }
    return fallback;
}

// 把 PresetManager 当前预设里的"高级采样参数"合并到 presetParams
// 这些参数是 PresetManager.getParams() 没暴露的，需要手动取
function mergeAdvancedPresetParams(presetParams) {
    if (typeof PresetManager === 'undefined') return;
    if (!PresetManager.presets || PresetManager.currentPresetIndex < 0) return;
    var _curPreset = PresetManager.presets[PresetManager.currentPresetIndex];
    if (!_curPreset || !_curPreset.params) return;
    var _pp = _curPreset.params;
    if (_pp.top_k != null && !presetParams.top_k) presetParams.top_k = Number(_pp.top_k) || 0;
    if (_pp.top_a != null && !presetParams.top_a) presetParams.top_a = Number(_pp.top_a) || 0;
    if (_pp.min_p != null && !presetParams.min_p) presetParams.min_p = Number(_pp.min_p) || 0;
    if (_pp.repetition_penalty != null && _pp.repetition_penalty !== 1) presetParams.repetition_penalty = Number(_pp.repetition_penalty) || 1;
    if (_pp.typical_p != null && _pp.typical_p !== 1) presetParams.typical_p = Number(_pp.typical_p) || 1;
    if (_pp.tail_free_sampling != null && _pp.tail_free_sampling !== 1) presetParams.tail_free_sampling = Number(_pp.tail_free_sampling) || 1;
    if (_pp.mirostat_mode != null && _pp.mirostat_mode !== 0) presetParams.mirostat_mode = Number(_pp.mirostat_mode) || 0;
    if (_pp.mirostat_tau != null && _pp.mirostat_tau !== 5.0) presetParams.mirostat_tau = Number(_pp.mirostat_tau) || 5.0;
    if (_pp.mirostat_eta != null && _pp.mirostat_eta !== 0.1) presetParams.mirostat_eta = Number(_pp.mirostat_eta) || 0.1;
    if (_pp.dry_multiplier != null && _pp.dry_multiplier !== 0) presetParams.dry_multiplier = Number(_pp.dry_multiplier) || 0;
    if (_pp.xtc_probability != null && _pp.xtc_probability !== 0) presetParams.xtc_probability = Number(_pp.xtc_probability) || 0;
    if (_pp.reasoning_effort != null) presetParams.reasoning_effort = String(_pp.reasoning_effort);
    if (_pp.seed != null) presetParams.seed = Number(_pp.seed) || null;
    if (_pp.max_tokens && Number(_pp.max_tokens) > 0) presetParams.max_tokens = Number(_pp.max_tokens);
}

// 【优化 #13 + #18】过滤请求参数：去掉 null/undefined/默认值/非法 reasoning_effort
function filterRequestParams(params) {
    var filtered = {};
    for (var key in params) {
        if (!Object.prototype.hasOwnProperty.call(params, key)) continue;
        var val = params[key];
        if (val === null || val === undefined) continue;
        // 表驱动默认值过滤
        if (Object.prototype.hasOwnProperty.call(SKIP_DEFAULTS, key) && val === SKIP_DEFAULTS[key]) continue;
        filtered[key] = val;
    }
    // 【优化 #18】reasoning_effort 白名单——只过滤明显是误填的值（如 "undefined"、空串、纯数字），
    //              不要把预设里的非标值（"default" / "minimal" / "thinking_mode" 等）当非法值删掉
    //              否则中转站收不到这个参数，会回退到默认的"高思考"模式导致生成变慢
    if (filtered.reasoning_effort) {
        var _re = String(filtered.reasoning_effort).toLowerCase().trim();
        // 明显是脏数据：空串、undefined 字面量、纯数字 → 删
        if (!_re || _re === 'undefined' || _re === 'null' || /^\d+$/.test(_re)) {
            console.warn('[API] reasoning_effort 值无效已过滤:', filtered.reasoning_effort);
            delete filtered.reasoning_effort;
        }
    }
    return filtered;
}

// 【优化 #15】构建单次 AI 请求的 body
// 兼容模式（compatibleMode）只发 OpenAI 标准 4 大参数 + 可选 freq/presence
// 正常模式发完整高级采样参数（中转站自己挑能用哪些）
function buildAIRequestBody(messages, options, config) {
    if (typeof PresetManager === 'undefined') {
        throw new Error('PresetManager 未初始化');
    }
    var presetParams = PresetManager.getParams();
    mergeAdvancedPresetParams(presetParams);

    var isCompatibleMode = config.compatibleMode === true;
    if (isCompatibleMode) {
        console.log('[API] 使用兼容模式，只发送基本参数');
    }

    // 基础参数（兼容模式只发这些）
    var params = {
        model: config.model || 'gpt-3.5-turbo',
        messages: messages,
        temperature: presetParams.temperature,
        max_tokens: presetParams.max_tokens,
        top_p: presetParams.top_p
    };

    if (!isCompatibleMode) {
        // 正常模式：补完整高级采样参数
        params.top_k = presetParams.top_k || 0;
        params.frequency_penalty = presetParams.frequency_penalty;
        params.presence_penalty = presetParams.presence_penalty;
        params.min_p = presetParams.min_p || 0;
        params.top_a = presetParams.top_a || 0;
        params.repetition_penalty = presetParams.repetition_penalty || 1;
        params.typical_p = presetParams.typical_p || 1;
        params.min_length = presetParams.min_length || 0;
        params.max_time = presetParams.max_time || null;
        params.mirostat_mode = presetParams.mirostat_mode || 0;
        params.mirostat_tau = presetParams.mirostat_tau || 5.0;
        params.mirostat_eta = presetParams.mirostat_eta || 0.1;
        params.repetition_penalty_range = presetParams.repetition_penalty_range || 0;
        params.repetition_penalty_slope = presetParams.repetition_penalty_slope || 0;
        params.tfs = presetParams.tail_free_sampling || 1;
        params.epsilon_cutoff = presetParams.epsilon_cutoff || 0;
        params.eta_cutoff = presetParams.eta_cutoff || 0;
        params.dry_multiplier = presetParams.dry_multiplier || 0;
        params.dry_range = presetParams.dry_range || 0;
        params.dry_allowed_length = presetParams.dry_allowed_length || 2;
        params.xtc_probability = presetParams.xtc_probability || 0;
        params.xtc_threshold = presetParams.xtc_threshold || 0;
        params.seed = presetParams.seed || null;
        params.response_format = presetParams.response_format || null;
        params.modalities = presetParams.modalities || null;
        params.tool_reasoning_mode = presetParams.tool_reasoning_mode || 'disabled';
        params.reasoning_effort = presetParams.reasoning_effort || null;
    } else {
        // 【优化 #5】兼容模式：frequency/presence 是 OpenAI 标准参数，保留
        // 其他中转站可能拒绝的高级采样参数统统不发
        if (presetParams.frequency_penalty && presetParams.frequency_penalty !== 0) {
            params.frequency_penalty = presetParams.frequency_penalty;
        }
        if (presetParams.presence_penalty && presetParams.presence_penalty !== 0) {
            params.presence_penalty = presetParams.presence_penalty;
        }
    }

    if (presetParams.stop_sequences) {
        params.stop = presetParams.stop_sequences;
    }

    // options 中的采样参数覆盖预设
    if (options.temperature != null) params.temperature = options.temperature;
    if (options.max_tokens != null) params.max_tokens = options.max_tokens;
    if (options.top_p != null) params.top_p = options.top_p;
    if (options.top_k != null) params.top_k = options.top_k;
    if (options.frequency_penalty != null) params.frequency_penalty = options.frequency_penalty;
    if (options.presence_penalty != null) params.presence_penalty = options.presence_penalty;
    if (options.stop != null) params.stop = options.stop;

    var filtered = filterRequestParams(params);
    if (options.stream) filtered.stream = true;
    // 【修复 P0-2 + 动态化】移除 max_tokens 4096 硬上限——这是 API 游戏，AI 能理解输出长度
    // 硬编码 4096 会让长篇叙事预设（如 30000 token 的 Gemini 预设）全部失效
    // 现在只做"防止明显错误"的兜底：负数、0、非数字修正为模型默认（不传 max_tokens）
    // 上限交给 contextSize 动态约束（在 buildAIRequestBody 调用方处理），不在这里硬编码
    if (filtered.max_tokens != null) {
        var mt = Number(filtered.max_tokens);
        if (!isFinite(mt) || mt <= 0) {
            // 负数/0/NaN/Infinity：删除字段，让 API 用模型默认值
            console.warn('[API] max_tokens 异常值已移除，使用模型默认:', filtered.max_tokens);
            delete filtered.max_tokens;
        }
    }
    // 注：不再强制下限 512——某些模型支持小 max_tokens 做摘要，应由调用方/预设决定
    return filtered;
}

// 【优化 #6 + #7】解析一条 SSE 事件文本，把内容累加到 ctx
// 统一前缀处理：兼容 "data:" 和 "data: " 两种格式
// 【修复 #19】推理模型（DeepSeek-R1 / o1 / o3 等）的思考链走 reasoning_content 字段，
//              剧情正文走 content 字段。两者必须分离——只把 content 给用户看，
//              否则推理阶段 reason chain 会被当成剧情渲染出来。
function parseSSEEventText(eventText, ctx) {
    if (!eventText) return;
    var lines = eventText.split('\n');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!/^data:\s*/.test(line)) continue;
        var dataStr = line.replace(/^data:\s*/, '').trim();
        if (!dataStr || dataStr === '[DONE]') continue;
        var json;
        try { json = JSON.parse(dataStr); } catch (e) { continue; }

        if (json.error && !ctx.streamError) {
            ctx.streamError = extractErrorMessage(json.error, 'API流式错误: ' + JSON.stringify(json.error));
            console.error('[callAI] 流式错误:', ctx.streamError);
            continue;
        }
        if (!json.choices || !json.choices[0]) continue;
        var delta = json.choices[0].delta || {};
        // 【修复 #19 + #20】兼容 Cloudflare Workers AI 封装的 Kimi 模型：
        // 该模型把正文放在 reasoning_content 中，content 为 null。
        // 策略：优先取 content；content 为空时回退到 reasoning_content。
        var content = (typeof delta.content === 'string') ? delta.content : '';
        var reasoningChunk = (typeof delta.reasoning_content === 'string') ? delta.reasoning_content
                          : (typeof delta.reasoning === 'string') ? delta.reasoning : '';
        // Cloudflare Workers AI Kimi: content 为空但 reasoning_content 有内容 → 正文在 reasoning_content 中
        if (!content && reasoningChunk) {
            content = reasoningChunk;
        } else if (reasoningChunk) {
            // 真正的思考链（DeepSeek-R1 等），统计但不进入正文
            ctx.reasoningText += reasoningChunk;
        }
        ctx.fullText += content;
        // 【优化】content为空时跳过回调，避免反复推送空字符串到打字机
        if (ctx.onChunk && content) {
            try { ctx.onChunk(content, ctx.fullText); }
            catch (chunkErr) { console.warn('[callAI] onChunk 回调异常:', chunkErr); }
        }
    }
}

// 【优化 #15】SSE 解析为空时的兜底解析（兼容推理模型、异常格式）
// 1) 尝试整体 JSON 解析（部分 API 不走 SSE，直接返回 JSON）
// 2) 如果整体不是 JSON，从 rawBody 中找首条 data 行提取
// 3) 都失败时**回退到 rawBody 原文**——与原版 [backup/index.html L11882-11903] 一致：
//    原版注释明确说"如果也不是 JSON，直接用原始文本"，避免对未知格式显示空白
// 【修复 #19】在流式 / 兜底路径里都不要把 reasoning_content 当 content 用
function parseAIResponseFallback(rawBody) {
    if (!rawBody) return '';
    // 1) 整体 JSON
    try {
        var jsonData = JSON.parse(rawBody);
        if (jsonData.error) {
            throw new Error(extractErrorMessage(jsonData.error, 'API错误: ' + JSON.stringify(jsonData.error)));
        }
        var _msg = jsonData.choices && jsonData.choices[0] && jsonData.choices[0].message;
        if (_msg) {
            var _content = (typeof _msg.content === 'string') ? _msg.content : '';
            var _reasoning = (typeof _msg.reasoning_content === 'string') ? _msg.reasoning_content
                           : (typeof _msg.reasoning === 'string') ? _msg.reasoning : '';
            // 优先用 content；content 为空时回退到 reasoning_content（兼容 Cloudflare Workers AI Kimi）
            if (_content) return _content;
            if (_reasoning) return _reasoning;
            if (jsonData.usage) return '';
            return rawBody;
        }
        if (jsonData.usage) return '';
        // JSON 解析成功但结构不识别，回退到原文
        return rawBody;
    } catch (e) {
        if (e && e.message && e.message.indexOf('API') === 0) throw e;
        // 不是纯 JSON，继续走 SSE 兜底
    }
    // 2) SSE：首条 data 行（整行内除换行符外不截断，应对嵌套 JSON）
    var dataLine = (rawBody.match(/data:\s*\{[^\n]+\}/) || [])[0];
    if (dataLine) {
        try {
            var parsed = JSON.parse(dataLine.replace(/^data:\s*/, '').trim());
            var d = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
            if (d) {
                var _dContent = (typeof d.content === 'string') ? d.content : '';
                if (_dContent) return _dContent;
            }
        } catch (_) { /* 忽略 */ }
    }
    // 3) 终极兜底：原文（与原版一致）
    return rawBody;
}

// 【优化 #15】执行流式 AI 请求
async function executeAIStream(url, body, apiKey, signal, onChunk) {
    var res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify(body),
        signal: signal
    });
    if (!res.ok) {
        var errMsg = 'API错误: ' + res.status;
        try {
            var errData = await res.json();
            errMsg = extractErrorMessage(errData.error || errData, errMsg);
        } catch (e) { console.warn('[API] 错误响应解析失败:', e); }
        throw new Error(errMsg);
    }

    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    // 【修复 #19】reasoningText 用于统计思考链长度，便于排查"只回了思考链没回正文"的情况
    var ctx = { fullText: '', reasoningText: '', streamError: null, onChunk: onChunk };
    var sseBuffer = '';
    // 【优化 #1】rawBody 加 64KB 上限，避免长内容把内存吃光
    var rawBody = '';
    var RAW_BODY_MAX = 64 * 1024;
    var rawBodyTruncated = false;

    while (true) {
        var readResult = await reader.read();
        if (readResult.done) {
            if (sseBuffer && sseBuffer.trim()) {
                parseSSEEventText(sseBuffer, ctx);
            }
            break;
        }
        var chunk = decoder.decode(readResult.value, { stream: true });
        // 【优化 #1】限制 rawBody 累积大小
        if (!rawBodyTruncated) {
            if (rawBody.length + chunk.length <= RAW_BODY_MAX) {
                rawBody += chunk;
            } else {
                rawBody += chunk.substring(0, RAW_BODY_MAX - rawBody.length);
                rawBodyTruncated = true;
                console.warn('[callAI] rawBody 达到 64KB 上限，停止累积');
            }
        }
        sseBuffer += chunk;
        var events = sseBuffer.split(/\r?\n\r?\n/);
        sseBuffer = events.pop() || '';
        for (var i = 0; i < events.length; i++) {
            parseSSEEventText(events[i], ctx);
        }
    }

    // 流中检测到错误
    if (ctx.streamError && !ctx.fullText) {
        throw new Error(ctx.streamError);
    } else if (ctx.streamError && ctx.fullText) {
        console.warn('[callAI] 流中有错误但已收到内容，忽略错误继续:', ctx.streamError);
        // 【优化 #11】UI 软提示
        if (typeof UI !== 'undefined' && UI.toast) {
            UI.toast('响应可能不完整：' + ctx.streamError);
        }
    }

    // 【修复 #19】流结束但剧情正文为空 + 有思考链时打警告，提示排查
    if (!ctx.fullText && ctx.reasoningText) {
        console.warn('[callAI] 推理模型仅返回思考链（' + ctx.reasoningText.length + ' 字符）未返回剧情正文，可能是 max_tokens 过小被思考链吃光');
    }

    // 兜底：SSE 解析为空时再尝试从 rawBody 提取
    if (!ctx.fullText && rawBody) {
        return parseAIResponseFallback(rawBody);
    }
    return ctx.fullText;
}

// 【优化 #15】执行非流式 AI 请求
async function executeAINormal(url, body, apiKey, signal) {
    var res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify(body),
        signal: signal
    });
    if (!res.ok) {
        var errData = await res.json().catch(function() { return {}; });
        var errMsg = extractErrorMessage(errData.error || errData, 'API错误: ' + res.status);
        throw new Error(errMsg);
    }
    var data = await res.json();
    // 【修复 #19】只取 content；reasoning_content/reasoning 是思考链，content 为空时
    //              打警告并返回空串（绝不回退到思考链），让上游能感知到异常
    var _nmsg = data.choices && data.choices[0] && data.choices[0].message;
    if (_nmsg) {
        var _content = (typeof _nmsg.content === 'string') ? _nmsg.content : '';
        var _reasoning = (typeof _nmsg.reasoning_content === 'string') ? _nmsg.reasoning_content
                       : (typeof _nmsg.reasoning === 'string') ? _nmsg.reasoning : '';
        // 优先用 content；content 为空时回退到 reasoning_content（兼容 Cloudflare Workers AI Kimi）
        if (_content) return _content;
        if (_reasoning) return _reasoning;
        return '';
    }
    // JSON 解析成功但结构不识别，原版兜底行为：返回 res.text() 让用户看到原文
    try { return await res.text(); } catch (e) { return ''; }
}

// AI 调用主入口
// 【优化 #2 + #3 + #17】每次调用自带 5 分钟超时（按次，不是按流块）
// 【优化 #3】每次调用创建独立的 AbortController，串联外部 signal，支持 safeAbort 兼容
// 【优化 #17】入口只读一次配置
async function callAI(messages, options = {}) {
    // 【优化 #17】入口只读一次配置
    var initialCfg = LocalGameAPI.getCurrentConfig();
    if (!initialCfg || !initialCfg.baseUrl || !initialCfg.apiKey) {
        throw new Error('请先配置API（设置 → API配置）');
    }

    // 【优化 #2 + #3】每次调用创建独立的 AbortController
    // 5 分钟超时：流式模型生成可能很慢（长上下文/复杂剧情），但不能无限挂死
    var localAC = new AbortController();
    var timeoutId = setTimeout(function() {
        try { localAC.abort(new Error('AI请求超时（5分钟）')); }
        catch (e) { /* 忽略 */ }
    }, 5 * 60 * 1000);

    // 串联外部 signal：options.signal 优先，其次兼容旧的 window._currentAbort（safeAbort）
    var externalSignal = options.signal || (window._currentAbort && window._currentAbort.signal);
    var externalListener = null;
    if (externalSignal) {
        if (externalSignal.aborted) {
            try { localAC.abort(externalSignal.reason); } catch (e) { /* 忽略 */ }
        } else {
            externalListener = function() {
                try { localAC.abort(externalSignal.reason); } catch (e) { /* 忽略 */ }
            };
            externalSignal.addEventListener('abort', externalListener, { once: true });
        }
    }

    try {
        return await LocalGameAPI.tryWithFallback(async function(slotIdx) {
            var config = LocalGameAPI._configs[slotIdx];
            var url = LocalGameAPI.normalizeUrl(config.baseUrl) + '/chat/completions';
            var body = buildAIRequestBody(messages, options, config);
            if (options.stream) {
                return await executeAIStream(url, body, config.apiKey, localAC.signal, options.onChunk);
            } else {
                return await executeAINormal(url, body, config.apiKey, localAC.signal);
            }
        });
    } finally {
        clearTimeout(timeoutId);
        if (externalListener && externalSignal) {
            try { externalSignal.removeEventListener('abort', externalListener); } catch (e) { /* 忽略 */ }
        }
    }
}
// ========================================
// Context Size 自动检测（动态，不硬编码模型列表）
// ========================================
async function detectContextSize() {
    // 优先级1：预设中的 max_context
    if (typeof PresetManager !== 'undefined' && PresetManager.currentParams && PresetManager.currentParams.max_context) {
        var presetCtx = Number(PresetManager.currentParams.max_context);
        if (presetCtx > 0) {
            gameState.contextSize = presetCtx;
            console.log('[Context检测] 来自预设 max_context: ' + presetCtx);
            return presetCtx;
        }
    }

    var model = '';
    var baseUrl = '';
    var apiKey = '';
    if (typeof LocalGameAPI !== 'undefined' && LocalGameAPI.getCurrentConfig()) {
        var cfg = LocalGameAPI.getCurrentConfig();
        model = (cfg.model || '').toLowerCase();
        baseUrl = cfg.baseUrl || '';
        apiKey = cfg.apiKey || '';
    }

    // 优先级2：调 /models API 动态获取
    if (baseUrl && apiKey) {
        try {
            var modelsUrl = LocalGameAPI.normalizeUrl(baseUrl) + '/models';
            var resp = await fetch(modelsUrl, {
                method: 'GET',
                headers: { 'Authorization': 'Bearer ' + apiKey },
                signal: AbortSignal.timeout(5000)
            });
            if (resp.ok) {
                var data = await resp.json();
                // OpenAI 格式：{ data: [{ id: "model-name", ... }] }
                var models = data.data || data;
                if (Array.isArray(models)) {
                    var target = models.find(function(m) {
                        var id = (m.id || m.name || '').toLowerCase();
                        return id === model || id.endsWith('/' + model) || id.endsWith(':' + model);
                    });
                    if (target) {
                        // 部分API返回 context_length / max_context_length
                        var ctx = target.context_length || target.max_context_length || target.context_window || 0;
                        if (ctx > 0) {
                            gameState.contextSize = ctx;
                            console.log('[Context检测] 来自 /models API: ' + ctx);
                            return ctx;
                        }
                    }
                }
            }
        } catch (e) {
            console.log('[Context检测] /models API 不可用，尝试其他方式');
        }
    }

    // 优先级3：从模型名中提取数字推断
    var ctxSize = 0;

    // 3a. 模型名中直接标注的 context size（如 "xxx-32k", "xxx-128k"）
    var kMatch = model.match(/(\d+)k/);
    if (kMatch) ctxSize = parseInt(kMatch[1]) * 1024;

    // 3b. 模型名中标注的数字（如 "xxx-8192", "xxx-128000"）
    if (ctxSize === 0) {
        var numMatch = model.match(/[-_](\d{4,})/);
        if (numMatch) {
            var num = parseInt(numMatch[1]);
            if (num >= 2048) ctxSize = num;
        }
    }

    // 3c. 动态询问AI自身的context size（完全动态，不硬编码任何模型信息）
    if (ctxSize === 0 && baseUrl && apiKey) {
        try {
            var probeMessages = [
                { role: 'system', content: '你是一个乐于助人的助手。回答要简洁。' },
                { role: 'user', content: '请告诉我你的最大上下文窗口是多少token？只回复一个数字，不要任何解释。例如：128000' }
            ];
            var probeResult = await callAI(probeMessages, {
                stream: false,
                temperature: 0,
                max_tokens: 50
            });
            if (probeResult) {
                var probeText = (typeof probeResult === 'string') ? probeResult : (probeResult.content || '');
                var numOnly = probeText.replace(/[^\d]/g, '');
                if (numOnly) {
                    var probeCtx = parseInt(numOnly);
                    if (probeCtx >= 2048 && probeCtx <= 10000000) {
                        ctxSize = probeCtx;
                        console.log('[Context检测] AI自报context: ' + ctxSize);
                    }
                }
            }
        } catch (e) {
            console.log('[Context检测] AI自报context失败，使用兜底值');
        }
    }

    // 兜底：默认 8K
    if (ctxSize === 0) ctxSize = 8192;

    gameState.contextSize = ctxSize;
    console.log('[Context检测] 最终结果(' + model + '): ' + ctxSize);
    return ctxSize;
}

// ========================================
// 开局设定提取：用AI从玩家设定中提取结构化信息，预填充记忆系统
// ========================================
async function extractSetupToMemory() {
    var setupText = gameState.userPrompt || '';
    if (!setupText || setupText.trim().length < 50) return;

    // 如果记忆系统已有数据（非首次开局），跳过
    if (typeof EnhancedMemory !== 'undefined') {
        var gm = window.GameMemory || (typeof GameMemory !== 'undefined' ? GameMemory : null);
        if (gm) {
            var hasData = Object.keys(gm.tables.characters).length > 0
                || Object.keys(gm.permanentFacts).some(function(k) { return gm.permanentFacts[k] && gm.permanentFacts[k].length > 0; });
            if (hasData) return;
        }
    }

    // 显示提取状态
    var storyEl = document.getElementById('storyText');
    if (storyEl) {
        storyEl.innerHTML = '<div style="text-align:center;padding:40px 0;display:flex;flex-direction:column;align-items:center;text-indent:0;">' +
            '<div style="display:flex;justify-content:center;gap:10px;margin-bottom:16px;">' +
            '<div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>' +
            '<span style="color:var(--text-secondary);font-size:13px;">正在解析设定，建立记忆...</span></div>';
    }

    // 【提示词重设计】从「7条编号规则」改为「场景化引导 + 信任模型」
    // 思路：让 AI 理解「这是在帮一个编剧整理世界观卡片」，自然知道要做什么
    var extractPrompt = '你正在帮一位游戏编剧整理一份设定稿——把散落在设定里的关键信息抽出来，存进结构化表格里，方便后续剧情生成时检索。\n\n' +
        '这份设定里可能藏着：主角是谁、TA周围有哪些角色、这些角色之间是什么关系、有什么关键物品、有什么不能违反的规则。\n' +
        '你凭直觉和文本本身判断哪些值得抽取——规则、限制、铁律、机制、羁绊、承诺，都是后续故事能用的「骨架信息」，看到就抽出来。\n' +
        '没提到的字段就留空数组或默认值，别为了凑数瞎编。\n\n' +
        '关于好感度：陌生人=0，正向=亲近/信任/喜欢，负向=敌对/戒备/冲突。如果设定里没说，按「陌生人0」处理即可。\n\n' +
        '【为什么用JSON】前端会按字段名读取数据，所以字段名要准。直接输出原始JSON文本，别用markdown代码块包起来——解析器只认纯文本。\n\n' +
        '【玩家设定】\n' + setupText;

    try {
        var result = await callAI([
            { role: 'system', content: '你正在帮一位游戏编剧整理设定稿。' },
            { role: 'user', content: extractPrompt }
        ], {
            stream: false,
            temperature: 0.3,
            max_tokens: 4096
        });

        var parsed = safeJSONParse(result);
        if (!parsed) {
            // 尝试从文本中提取JSON
            var jsonMatch = result && result.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsed = safeJSONParse(jsonMatch[0]);
        }
        if (!parsed) {
            console.warn('[设定提取] AI返回无法解析，跳过');
            return;
        }

        var gm = window.GameMemory || (typeof GameMemory !== 'undefined' ? GameMemory : null);
        if (!gm) return;

        // 1. 主角身份 → permanentFacts.pcIdentity
        if (parsed.pcIdentity) {
            gm.addWorldAnchor('pc_identity', parsed.pcIdentity, 'setup_extract', 0);
        }

        // 2. 世界规则 → permanentFacts.worldRules
        if (Array.isArray(parsed.worldRules)) {
            parsed.worldRules.forEach(function(rule) {
                if (rule && typeof rule === 'string' && rule.trim()) {
                    gm.addWorldAnchor('world_rule', rule.trim(), 'setup_extract', 0);
                }
            });
        }

        // 3. 角色 → tables.characters + permanentFacts.npcProfiles
        if (Array.isArray(parsed.characters)) {
            var playerName = gameState.playerName || (gameState.protagonistSetup && gameState.protagonistSetup.mcName) || '';
            parsed.characters.forEach(function(c) {
                if (!c || !c.name) return;
                // 跳过主角（主角不进NPC表）
                if (playerName && (c.name === playerName || c.name.includes(playerName) || playerName.includes(c.name))) return;
                // 写入 tables.characters
                gm.tables.characters[c.name] = {
                    name: c.name,
                    title: c.title || '',
                    relation: c.relation || '',
                    mood: '',
                    location: '',
                    outfit: '',
                    favorability: typeof c.favorability === 'number' ? c.favorability : 50,
                    status: '',
                    history: [{ turn: 0, changes: c.desc || '开局设定' }],
                    lastChangedTurn: 0,
                    gameTime: gm.getGameTimeStr(),
                    accessCount: 0,
                    locked: false
                };
                // 写入 permanentFacts.npcProfiles
                var profileDesc = c.name + '：' + (c.title || '') + (c.relation ? '，与主角关系：' + c.relation : '') + (typeof c.favorability === 'number' ? '，好感度' + c.favorability : '') + (c.desc ? '。' + c.desc : '');
                gm.addWorldAnchor('npc_profile', profileDesc, 'setup_extract', 0);
                // 同步到 gameState.allCharacters
                if (typeof gameState !== 'undefined') {
                    if (!gameState.allCharacters) gameState.allCharacters = {};
                    gameState.allCharacters[c.name] = {
                        name: c.name,
                        title: c.title || '',
                        relation: c.relation || '',
                        favorability: typeof c.favorability === 'number' ? c.favorability : 50,
                        desc: c.desc || ''
                    };
                }
            });
        }

        // 4. 关系 → tables.relationships
        if (Array.isArray(parsed.relationships)) {
            parsed.relationships.forEach(function(r) {
                if (!r || !r.from || !r.to) return;
                gm.tables.relationships[r.from + '->' + r.to] = {
                    from: r.from,
                    to: r.to,
                    type: r.type || '',
                    desc: r.desc || '',
                    lastChangedTurn: 0
                };
            });
            // 同步到 gameState.relationships
            if (typeof gameState !== 'undefined') {
                if (!gameState.relationships) gameState.relationships = [];
                parsed.relationships.forEach(function(r) {
                    if (!r || !r.from || !r.to) return;
                    // 去重
                    var exists = gameState.relationships.some(function(existing) {
                        return existing.from === r.from && existing.to === r.to;
                    });
                    if (!exists) gameState.relationships.push(r);
                });
            }
        }

        // 5. 物品 → tables.items
        if (Array.isArray(parsed.items)) {
            parsed.items.forEach(function(item) {
                if (!item || !item.name) return;
                gm.tables.items[item.name] = {
                    name: item.name,
                    qty: item.count || 1,
                    unit: '个',
                    rarity: item.rarity || '普通',
                    desc: item.desc || '',
                    obtainedTurn: 0,
                    lastChangedTurn: 0,
                    gameTime: gm.getGameTimeStr(),
                    accessCount: 0,
                    history: [{ turn: 0, from: 0, to: item.count || 1 }]
                };
            });
            // 同步到 gameState.currentBag
            if (typeof gameState !== 'undefined') {
                if (!gameState.currentBag) gameState.currentBag = [];
                parsed.items.forEach(function(item) {
                    if (!item || !item.name) return;
                    var exists = gameState.currentBag.some(function(b) { return b.name === item.name; });
                    if (!exists) gameState.currentBag.push({ name: item.name, count: item.count || 1, desc: item.desc || '', rarity: item.rarity || '普通' });
                });
            }
        }

        // 保存记忆数据
        gm.saveToStorage();
        // 刷新所有关联页面
        if (typeof GameLinker !== 'undefined') {
            GameLinker.refreshAll();
        }
        console.log('[设定提取] 完成：' +
            (parsed.characters ? parsed.characters.length : 0) + '个角色, ' +
            (parsed.relationships ? parsed.relationships.length : 0) + '条关系, ' +
            (parsed.items ? parsed.items.length : 0) + '个物品, ' +
            (parsed.worldRules ? parsed.worldRules.length : 0) + '条规则');

        // ========================================
        // 智能压缩：如果设定太长，让AI生成精简总结
        // 规则不丢 → permanentFacts 已存；描述精简 → 节省context
        // ========================================
        var ctxSize = gameState.contextSize || (await detectContextSize());
        var setupTokens = Math.ceil(setupText.length / 1.7); // 中文约1.7字/token
        var setupRatio = setupTokens / ctxSize;

        console.log('[设定压缩] 设定约' + setupTokens + 'tokens, context ' + ctxSize + ', 占比 ' + (setupRatio * 100).toFixed(1) + '%');

        // 如果设定占 context 40%以上，需要压缩
        if (setupRatio > 0.4 && setupText.length > 3000) {
            var targetRatio = 0.25; // 压缩到占context 25%
            var targetChars = Math.floor(ctxSize * targetRatio * 1.7); // 目标字符数

            // 更新加载状态
            if (storyEl) {
                storyEl.innerHTML = '<div style="text-align:center;padding:40px 0;display:flex;flex-direction:column;align-items:center;text-indent:0;">' +
                    '<div style="display:flex;justify-content:center;gap:10px;margin-bottom:16px;">' +
                    '<div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>' +
                    '<span style="color:var(--text-secondary);font-size:13px;">设定较长，正在生成精简总结（规则不丢）...</span></div>';
            }

            try {
                // 【提示词重设计】从「8条编号规则」改为「好精简的样子 + 信任模型」
                // 思路：让 AI 理解「骨架 vs 血肉」的概念，自己判断哪些该留哪些该删
                var compressPrompt = '你正在帮一位游戏编剧精简一份较长的设定稿——目标是「保留骨架、删减血肉」，让后续剧情生成能快速 get 到核心。\n\n' +
                    '你理解什么是骨架：规则、限制、铁律、机制、关键人物设定、关键物品、剧情线索——这些是设定之所以能跑起来的「承重墙」，绝对不能删。\n' +
                    '你理解什么是血肉：环境描写、冗余形容、重复的细节铺陈、文学化的引入段落——这些读起来漂亮，但删掉也不影响后续发挥。\n\n' +
                    '建议用以下标签标注不同类型的内容（方便后续按需取用）：\n' +
                    '- 【规则】标注硬性限制、铁律、机制\n' +
                    '- 【角色】标注关键角色的核心特质\n' +
                    '- 【世界观】标注世界观核心设定\n' +
                    '- 【关键线索】标注关键物品和剧情钩子\n\n' +
                    '目标长度：约' + targetChars + '字（当前原文约' + setupText.length + '字）。\n' +
                    '直接输出精简后的文本即可——别加「好的，这是精简版」之类的开场白，也别加结尾说明。\n\n' +
                    '【原始设定】\n' + setupText;

                var compressedResult = await callAI([
                    { role: 'system', content: '你正在帮一位游戏编剧精简设定稿。' },
                    { role: 'user', content: compressPrompt }
                ], {
                    stream: false,
                    temperature: 0.2,
                    max_tokens: Math.min(targetChars + 500, 8192)
                });

                if (compressedResult && compressedResult.trim().length > 200) {
                    // 存储精简版到 _setupLayers
                    if (gm._setupLayers) {
                        gm._setupLayers.compressedSetup = compressedResult.trim();
                        gm._setupLayers.compressed = true;
                        gm._setupLayers.originalLength = setupText.length;
                        gm._setupLayers.compressedLength = compressedResult.trim().length;
                    }
                    gm.saveToStorage();
                    console.log('[设定压缩] 完成：' + setupText.length + '字 → ' + compressedResult.trim().length + '字');
                }
            } catch (e) {
                console.warn('[设定压缩] 失败（不影响游戏，将使用完整设定）:', e && e.message);
            }
        } else {
            console.log('[设定压缩] 无需压缩，设定占比合理');
        }
    } catch (e) {
        console.warn('[设定提取] 失败（不影响游戏继续）:', e && e.message);
    }
}

// ========================================
// System Prompt
// ========================================
async function initializeGame() {
    try {
        // 检测 API 模型的 context size（异步：可能调/models API或询问AI）
        await detectContextSize();

        // 收集主角设定
        gameState.protagonistSetup = {};
        var mcFields = ['mcName', 'mcGender', 'mcAge', 'mcIdentity', 'mcPersonality', 'mcAppearance',
            'mcAbility', 'mcExtra'
        ];
    mcFields.forEach(function(id) {
        var el = document.getElementById(id);
        if (el && el.value.trim()) gameState.protagonistSetup[id] = el.value.trim();
    });
gameState.systemPrompt = buildSystemPrompt();
gameState.conversationHistory = [{
        role: 'system',
        content: gameState.systemPrompt
    }];
if (gameState.customStyle && PresetManager.currentPresetIndex < 0) {
    // 仅在无预设时注入写作风格；有预设时由预设完全控制
    gameState.conversationHistory.push({
        role: 'user',
        content: '【写作风格要求】请在所有输出中遵循：\n' + gameState.customStyle + '\n\n回复"明白"确认。'
    }, {
    role: 'assistant',
    content: '明白，我会遵循上述写作风格。'
});
}
// 初始化游戏时间显示
if (typeof GameTimeSystem !== 'undefined') {
    GameTimeSystem.updateUI();
}
// 开局前：用AI提取设定，预填充记忆系统（按次计费，多一次API调用无妨）
extractSetupToMemory().then(function() {
    sendAIRequest('请开始游戏，描述开局场景。', true);
}).catch(function(e) {
    console.warn('[开局设定提取] 失败，直接开局:', e && e.message);
    sendAIRequest('请开始游戏，描述开局场景。', true);
});
} catch (e) {
console.error('初始化游戏失败:', e);
UI.toast('游戏初始化失败: ' + translateError(e.message));
}
}
// ========================================
// 世界书系统 (World Info / Lorebook)
// 兼容 SillyTavern 世界书格式
// ========================================
