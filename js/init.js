
// ========================================
// 第16层: 最后的初始化和事件
// ========================================
// TypewriterBuffer.render 已内置优化，无需覆盖
// ========================================
// 初始化
// ========================================
// 初始化
// ========================================
async function initApp() {
    try {
    // 防止重复初始化
    if (initApp._initialized) return;
    initApp._initialized = true;
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

        // 初始化世界创建页面的预设显示
        PresetManager.updateSetupPresetDisplay();

        // 初始化API配置
        LocalGameAPI.init();

        // 渲染菜单
        renderMenu();

        // 绑定事件
        bindEvents();

        // 设置菜单顶部日期为当天
        try {
            var now = new Date();
            var dateStr = (now.getMonth() + 1) + '/' + now.getDate();
            var dateEl = document.getElementById('menuTopDate');
            if (dateEl) dateEl.textContent = dateStr;
        } catch(e) { console.warn('[INIT] 设置菜单日期失败:', e); }

        // 触发事件：APP_READY（应用启动完成）
        if (typeof TavernHelperCompat !== 'undefined') {
            TavernHelperCompat.emit('APP_READY', {
                timestamp: Date.now()
            });
        }

        // 隐藏加载指示器
        var loadingEl = document.getElementById('appLoading');
        if (loadingEl) {
            loadingEl.classList.add('hidden');
            TimerManager.setTimeout('hideLoading', function() {
                if (loadingEl.parentNode) loadingEl.remove();
            }, 400);
        }

        // 【阶段三】运行时基础可访问性增强
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

// 【阶段三】运行时基础可访问性增强：为大量静态 HTML 补丁式补充 ARIA 属性
function enhanceAccessibility() {
    try {
        // 1. 所有无 type 的 button 默认设为 type="button"，避免表单默认提交
        var buttons = document.querySelectorAll('button:not([type])');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].setAttribute('type', 'button');
        }

        // 2. 图标 svg 对屏幕阅读器隐藏
        var icons = document.querySelectorAll('svg.icon, .icon svg');
        for (var j = 0; j < icons.length; j++) {
            if (!icons[j].getAttribute('aria-hidden')) {
                icons[j].setAttribute('aria-hidden', 'true');
                icons[j].setAttribute('focusable', 'false');
            }
        }

        // 3. 图标按钮若无 aria-label，尝试推断
        var iconBtns = document.querySelectorAll('button[class*="icon"], button[class*="circle"], [data-close]');
        for (var k = 0; k < iconBtns.length; k++) {
            var btn = iconBtns[k];
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
        var imgs = document.querySelectorAll('img:not([alt])');
        for (var m = 0; m < imgs.length; m++) {
            imgs[m].setAttribute('alt', '');
        }

        // 5. 为已有 modal-overlay 补充基础 ARIA（showModal 也会动态补充）
        var overlays = document.querySelectorAll('.modal-overlay');
        for (var n = 0; n < overlays.length; n++) {
            var ov = overlays[n];
            if (!ov.getAttribute('role')) ov.setAttribute('role', 'dialog');
            ov.setAttribute('aria-modal', 'true');
            // 若内部有标题且未关联，则关联
            var title = ov.querySelector('.modal-title');
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

// 根据 DOM 就绪状态选择初始化时机
// 某些浏览器环境中 DOMContentLoaded 可能不触发或已触发
if (document.readyState === 'loading') {
    GlobalCleanup.registerListener(window, 'DOMContentLoaded', function() { initApp(); });
} else {
    initApp();
}
