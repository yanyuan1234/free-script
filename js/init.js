
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
        try {
        if (typeof ThemeManager !== 'undefined') ThemeManager.init();
        } catch(e) { console.error('[INIT] 主题管理初始化失败:', e); }
        // 初始化世界书系统
        try {
        WorldInfo.init();
        } catch(e) { console.error('[INIT] 世界书系统初始化失败:', e); }
        // 初始化预设管理系统
        try {
        PresetManager.init();
        } catch(e) { console.error('[INIT] 预设管理系统初始化失败:', e); }
        // 初始化正则脚本系统
        try {
        RegexManager.init();
        } catch(e) { console.error('[INIT] 正则脚本系统初始化失败:', e); }
        // 初始化宏引擎
        try {
        if (typeof MacroEngine !== 'undefined' && MacroEngine.init) MacroEngine.init();
        } catch(e) { console.error('[INIT] 宏引擎初始化失败:', e); }
        // 初始化记忆管理系统（已合并到 MemoryManagerUI，无需单独初始化）
        // 初始化酒馆助手兼容层
        // 添加 typeof 检查，因为 TavernHelperCompat 在后续 script 块中定义
        // 当 initApp 在 script 块末尾直接调用时，后续块可能尚未加载
        try {
        if (typeof TavernHelperCompat !== 'undefined') {
            TavernHelperCompat.init();
        }
        } catch(e) { console.error('[INIT] 酒馆助手兼容层初始化失败:', e); }
        // 初始化SaveDB
        try {
        await SaveDB.init();
        await SaveDB.migrate();
        } catch(e) { console.error('[INIT] SaveDB初始化失败:', e); }
        try {
        loadGameSettings();
        } catch(e) { console.error('[INIT] 加载游戏设置失败:', e); }

        // 初始化世界创建页面的预设显示
        try {
        PresetManager.updateSetupPresetDisplay();
        } catch(e) { console.error('[INIT] 预设显示初始化失败:', e); }

        // 初始化API配置
        try {
        LocalGameAPI.init();
        } catch(e) { console.error('[INIT] API配置初始化失败:', e); }

        // 渲染菜单
        try {
        renderMenu();
        } catch(e) { console.error('[INIT] 渲染菜单失败:', e); }

        // 绑定事件
        try {
        bindEvents();
        } catch(e) { console.error('[INIT] 绑定事件失败:', e); }

        // 触发事件：APP_READY（应用启动完成）
        try {
        if (typeof TavernHelperCompat !== 'undefined') {
            TavernHelperCompat.emit('APP_READY', {
                timestamp: Date.now()
            });
        }
        } catch(e) { console.error('[INIT] APP_READY事件触发失败:', e); }
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

// 根据 DOM 就绪状态选择初始化时机
// 某些浏览器环境中 DOMContentLoaded 可能不触发或已触发
if (document.readyState === 'loading') {
    GlobalCleanup.registerListener(window, 'DOMContentLoaded', function() { initApp(); });
} else {
    initApp();
}
