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
        }).catch(function(err) {
            console.warn('[PWA] Service Worker 注册失败:', err);
        });
    });
})();
