// ========================================
// 版本徽章：点击 = 清缓存 + 硬刷，避免浏览器加载旧 JS
// 【P0-5修复】从 index.html 内联 <script> 外置，符合项目 CSP（script-src 'self' 'unsafe-eval'，不含 'unsafe-inline'）
// ========================================
(function () {
    function bind() {
        var badge = document.getElementById('buildVersionBadge');
        if (!badge || badge.__bound) return;
        badge.__bound = true;
        badge.addEventListener('click', async function (e) {
            e.preventDefault();
            e.stopPropagation();
            try {
                if (window.caches && caches.keys) {
                    var keys = await caches.keys();
                    await Promise.all(keys.map(function (k) { return caches.delete(k); }));
                }
            } catch (err) { /* ignore */ }
            try {
                if (window.localStorage) {
                    // 不清用户的游戏存档，只清"导航历史/会话"类缓存
                    // 这里不动 localStorage，避免误删游戏数据
                }
            } catch (err) { /* ignore */ }
            // 硬刷（绕过 HTTP 缓存）
            var u = new URL(window.location.href);
            u.searchParams.set('_', Date.now().toString(36));
            window.location.replace(u.toString());
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
})();
