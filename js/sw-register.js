// ========================================
// PWA Service Worker 注册脚本
// 在 index.html 中通过 <script src="js/sw-register.js" defer> 引入
// 独立文件避免 CSP script-src 'unsafe-inline' 限制
// ========================================
(function() {
    if (!('serviceWorker' in navigator)) return;
    // GitHub Pages 在子路径下部署，需用相对路径注册
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('sw.js').then(function(reg) {
            console.log('[PWA] Service Worker 注册成功:', reg.scope);
            // 【修复】检测到新 SW 时立即激活，避免旧缓存导致代码不更新
            if (reg.waiting) {
                reg.waiting.postMessage('skipWaiting');
            }
            reg.addEventListener('updatefound', function() {
                var newWorker = reg.installing;
                if (newWorker) {
                    newWorker.addEventListener('statechange', function() {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // 新 SW 已安装，通知它立即激活
                            if (reg.waiting) {
                                reg.waiting.postMessage('skipWaiting');
                            }
                        }
                    });
                }
            });
        }).catch(function(err) {
            console.warn('[PWA] Service Worker 注册失败:', err);
        });
        // 【修复】监听 controller 变化，新 SW 激活后自动刷新页面加载最新代码
        var _reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', function() {
            if (!_reloading) {
                _reloading = true;
                window.location.reload();
            }
        });
    });
})();
