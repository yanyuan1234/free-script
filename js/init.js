
// ========================================
// 第16层: 最后的初始化和事件
// ========================================
// TypewriterBuffer.render 已内置优化，无需覆盖


GlobalCleanup.registerListener(window, 'error', function(e) {
    // 过滤图片/CSS等资源加载错误（不显示给用户）
    if (e.target && (e.target.tagName === 'IMG' || e.target.tagName === 'LINK' || e.target.tagName === 'SCRIPT')) {
        return;
    }
    console.error('[全局错误]', e.message, 'at', e.filename, ':', e.lineno);
    if (typeof UI !== 'undefined' && UI.toast) {
        UI.toast('发生错误: ' + e.message);
    }
}, true);

GlobalCleanup.registerListener(window, 'unhandledrejection', function(e) {
    console.error('[未处理的Promise]', e.reason);
    if (typeof UI !== 'undefined' && UI.toast) {
        UI.toast('异步操作失败');
    }
    e.preventDefault();
});


if (typeof gameState === 'undefined') {
    window.gameState = {};
}

(function ensureGameStatePaths() {
    var ensureExists = function(path, defaultValue) {
        defaultValue = defaultValue !== undefined ? defaultValue : {};
        var keys = path.split('.');
        var current = window;
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (i === keys.length - 1) {
                if (current[key] === undefined) {
                    current[key] = defaultValue;
                }
            } else {
                if (!current[key] || typeof current[key] !== 'object') {
                    current[key] = {};
                }
                current = current[key];
            }
        }
    };

    ensureExists('gameState.allCharacters', {});
    ensureExists('gameState.currentBag', []);
    ensureExists('gameState.currentQuests', []);
    ensureExists('gameState.relationships', []);
    ensureExists('gameState.keyEvents', []);
    ensureExists('gameState.conversationHistory', []);

    if (!gameState._chatLogs || Array.isArray(gameState._chatLogs)) gameState._chatLogs = {};
    if (!gameState._theaterContent) gameState._theaterContent = {};
    if (!Array.isArray(gameState._worldModules)) gameState._worldModules = [];
    if (!gameState._chattedNpcs) gameState._chattedNpcs = {};
    if (!gameState._chatRemarks) gameState._chatRemarks = {};
    if (!gameState._blockedNpcs) gameState._blockedNpcs = {};
    if (!gameState._presetApps) gameState._presetApps = {};
    if (!gameState._depthPrompts) gameState._depthPrompts = {};
    if (!gameState._positionPrompts) gameState._positionPrompts = {};
    if (!Array.isArray(gameState._afterChatPrompts)) gameState._afterChatPrompts = [];
    if (!Array.isArray(gameState._undoHistory)) gameState._undoHistory = [];
    if (!gameState.pinnedModules) gameState.pinnedModules = {};
})();

async function initApp() {
    try {
    // 防止重复初始化
    if (initApp._initialized) return;
    initApp._initialized = true;
        // 初始化统一状态层（接管全局 gameState）
        if (typeof StateManager !== 'undefined') {
            StateManager.init(typeof gameState !== 'undefined' ? gameState : null);
        }
        // 绑定 GameMemory 适配器
        if (typeof GameMemoryAdapter !== 'undefined') {
            GameMemoryAdapter.bind();
        }
        // 初始化主题管理
        if (typeof ThemeManager !== 'undefined') ThemeManager.init();
        // 初始化世界书系统
        WorldInfo.init();
        // 初始化预设管理系统
        PresetManager.init();
        // 初始化正则脚本系统
        RegexManager.init();
        // 初始化宏引擎
        if (typeof MacroEngine !== 'undefined' && MacroEngine.init) MacroEngine.init();
        // 初始化记忆管理系统（已合并到 MemoryManagerUI，无需单独初始化）
        // 初始化酒馆助手兼容层
        // 添加 typeof 检查，因为 TavernHelperCompat 在后续 script 块中定义
        // 当 initApp 在 script 块末尾直接调用时，后续块可能尚未加载
        if (typeof TavernHelperCompat !== 'undefined') {
            TavernHelperCompat.init();
        }
        // 初始化SaveDB
        await SaveDB.init();
        await SaveDB.migrate();
        loadGameSettings();


        // 导致崩溃后备份就在 localStorage 里却无法恢复。这里检查备份是否比自动存档更新
        try {
            var _backupRaw = Storage.get(Storage.KEYS.AUTO_SAVE_BACKUP);
            if (_backupRaw) {
                var _backupData = JSON.parse(_backupRaw);
                // 读取自动存档（slot 0）的时间戳做比较
                var _autoSlot = await SaveDB.get(0);
                var _autoTime = (_autoSlot && _autoSlot.time) ? _autoSlot.time : 0;
                var _backupTime = _backupData.time || 0;
                if (_backupTime > _autoTime && _backupData.state) {
                    // 备份比自动存档新，说明崩溃发生在最后一次自动存档之后
                    var _ok = await UI.confirm('检测到未保存的进度', '上次退出时游戏可能未正常关闭，检测到比自动存档更新的进度。是否恢复？');
                    if (_ok) {
                        await loadFromSlot('__autoSaveBackup__');
                    }
                    // 无论是否恢复，都清除备份避免重复提示
                    Storage.remove(Storage.KEYS.AUTO_SAVE_BACKUP);
                }
            }
        } catch (e) {
            console.warn('[INIT] 崩溃恢复检查失败:', e);
            try { Storage.remove(Storage.KEYS.AUTO_SAVE_BACKUP); } catch(_) {}
        }

        // 初始化世界创建页面的预设显示
        PresetManager.updateSetupPresetDisplay();

        // 初始化API配置
        LocalGameAPI.init();

        // 渲染菜单
        renderMenu();

        // 绑定事件
        bindEvents();


        if (typeof registerGameStartListener === 'function') registerGameStartListener();


        // utils.js:62-104 的 _globalA11yDelegate 已是统一的 data-action 委托（支持 kebab→camelCase 自动转换），
        // init.js 此处的委托是重复注册，且仅处理 toggle-thought 一个 action。
        // toggleThought 现已兼容 utils.js 委托的 fn.call(actEl) 调用约定（trigger = trigger || this）。
        // _setupGlobalEventDelegation();

        // 设置菜单顶部日期为当天
        try {
            const now = new Date();
            const dateStr = (now.getMonth() + 1) + '/' + now.getDate();
            const dateEl = document.getElementById('menuTopDate');
            if (dateEl) dateEl.textContent = dateStr;
        } catch(e) { console.warn('[INIT] 设置菜单日期失败:', e); }

        // 触发事件：APP_READY（应用启动完成）
        if (typeof TavernHelperCompat !== 'undefined') {
            TavernHelperCompat.emit('APP_READY', {
                timestamp: Date.now()
            });
        }

        // 隐藏加载指示器

        // 原 .hidden 类被 base.css .hidden{display:none!important} 覆盖，
        // 导致淡出动画失效、元素立即消失。400ms 后从 DOM 移除（略长于 300ms 过渡）。
        const loadingEl = document.getElementById('appLoading');
        if (loadingEl) {
            loadingEl.classList.add('is-hidden');
            TimerManager.setTimeout('hideLoading', () => { if (loadingEl.parentNode) loadingEl.remove(); }, 400);
        }


        enhanceAccessibility();
    } catch(initErr) {
        console.error('[INIT] 初始化失败:', initErr);
        // 即使初始化失败，也尝试渲染基本UI
        try {
            renderMenu();
            bindEvents();
        } catch(e) {
            console.error('[INIT] 渲染基本UI也失败:', e);
        }
    }
}


function enhanceAccessibility() {
    try {
        // 1. 所有无 type 的 button 默认设为 type="button"，避免表单默认提交
        const buttons = document.querySelectorAll('button:not([type])');
        for (let i = 0; i < buttons.length; i++) {
            buttons[i].setAttribute('type', 'button');
        }

        // 2. 图标 svg 对屏幕阅读器隐藏
        const icons = document.querySelectorAll('svg.icon, .icon svg');
        for (let j = 0; j < icons.length; j++) {
            if (!icons[j].getAttribute('aria-hidden')) {
                icons[j].setAttribute('aria-hidden', 'true');
                icons[j].setAttribute('focusable', 'false');
            }
        }

        // 3. 图标按钮若无 aria-label，尝试推断
        const iconBtns = document.querySelectorAll('button[class*="icon"], button[class*="circle"], [data-close]');
        for (let k = 0; k < iconBtns.length; k++) {
            const btn = iconBtns[k];
            if (btn.getAttribute('aria-label')) continue;
            if (btn.getAttribute('aria-labelledby')) continue;
            if (btn.textContent && btn.textContent.trim().length > 0) continue;
            if (btn.dataset.close) {
                btn.setAttribute('aria-label', '关闭');
            } else if (btn.className.indexOf('trash') !== -1 || btn.id.indexOf('delete') !== -1) {
                btn.setAttribute('aria-label', '删除');
            } else if (btn.className.indexOf('edit') !== -1 || btn.id.indexOf('edit') !== -1) {
                btn.setAttribute('aria-label', '编辑');
            } else if (btn.className.indexOf('save') !== -1 || btn.id.indexOf('save') !== -1) {
                btn.setAttribute('aria-label', '保存');
            } else if (btn.className.indexOf('plus') !== -1 || btn.className.indexOf('add') !== -1) {
                btn.setAttribute('aria-label', '添加');
            }
        }

        // 4. 图片若无 alt 则补空 alt（装饰性图片）
        const imgs = document.querySelectorAll('img:not([alt])');
        for (let m = 0; m < imgs.length; m++) {
            imgs[m].setAttribute('alt', '');
        }

        // 5. 为已有 modal-overlay 补充基础 ARIA（showModal 也会动态补充）
        const overlays = document.querySelectorAll('.modal-overlay');
        for (let n = 0; n < overlays.length; n++) {
            const ov = overlays[n];
            if (!ov.getAttribute('role')) ov.setAttribute('role', 'dialog');
            ov.setAttribute('aria-modal', 'true');
            // 若内部有标题且未关联，则关联
            const title = ov.querySelector('.modal-title');
            if (title && !ov.getAttribute('aria-labelledby')) {
                if (!title.id) title.id = ov.id + '_title';
                ov.setAttribute('aria-labelledby', title.id);
            }
        }

        console.log('[A11y] 基础可访问性增强完成');
    } catch (e) {
        console.warn('[A11y] 可访问性增强失败:', e);
    }
}

// 移动端滚动性能优化（从 patch.js 迁移）
if (typeof TimerManager !== 'undefined' && TimerManager.setTimeout) {
    TimerManager.setTimeout('scrollOptimize', function() {
        var scrollables = document.querySelectorAll('.scrollable, .page, .modal-body, #gameContent');
        scrollables.forEach(function(el) {
            if (el) el.style.webkitOverflowScrolling = 'touch';
        });
    }, 100);
}

// 根据 DOM 就绪状态选择初始化时机
// 某些浏览器环境中 DOMContentLoaded 可能不触发或已触发
if (document.readyState === 'loading') {
    GlobalCleanup.registerListener(window, 'DOMContentLoaded', function() { initApp(); });
} else {
    initApp();
}


(function() {
    document.querySelectorAll('.narrative-eye-toggle').forEach(function(cb) {
        cb.addEventListener('change', function() {
            if (!gameState.narrativeEyes) gameState.narrativeEyes = {};
            gameState.narrativeEyes[this.dataset.eye] = this.checked;
            // 限制最多 5 项开启，避免矛盾基调同时注入
            var checked = document.querySelectorAll('.narrative-eye-toggle:checked');
            if (checked.length > 5) {
                this.checked = false;
                gameState.narrativeEyes[this.dataset.eye] = false;
                if (typeof UI !== 'undefined' && UI.toast) UI.toast('最多保留 5 项叙事基调，避免矛盾');
            }
            if (typeof autoSave === 'function') autoSave();
        });
    });
})();


// 便于热重载 / 嵌入场景下主动释放监听器与定时器
window.FreeScript = window.FreeScript || {};
window.FreeScript.unmount = function() {
    try {
        if (typeof GlobalCleanup !== 'undefined' && GlobalCleanup.cleanup) {
            GlobalCleanup.cleanup();
        }
    } catch (e) {
        console.warn('[FreeScript.unmount] cleanup 失败:', e);
    }
    // 重置初始化标志以便重新挂载
    if (typeof initApp === 'function') initApp._initialized = false;
};


// 原因：与 utils.js:62-104 的 _globalA11yDelegate 重复注册 document click 事件委托。
// utils.js 版本已支持 kebab→camelCase 自动转换（toggle-thought → toggleThought），
// 且 toggleThought 已兼容 fn.call(actEl) 调用约定，无需此处的 actionHandlers 路由表。
