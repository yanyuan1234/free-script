
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

        // 触发事件：APP_READY（应用启动完成）
        if (typeof TavernHelperCompat !== 'undefined') {
            TavernHelperCompat.emit('APP_READY', {
                timestamp: Date.now()
            });
        }
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
