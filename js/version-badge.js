// ========================================
// 版本徽章：点击 = 清缓存 + 硬刷，避免浏览器加载旧 JS
// 【BUG-004 修复】本地直开（file:// 或未走 deploy.yml）时 __BUILD_VERSION__
// 占位符不会被替换，此处回填 core.js 的 GAME_VERSION，保证三处版本号一致：
// 徽章（部署注入）= GAME_VERSION（存档）= 设置页显示。

// ========================================
(function () {
    function fillLocalVersionFallback() {
        var badge = document.getElementById('buildVersionBadge');
        if (!badge) return;
        var text = (badge.textContent || '').trim();
        // 占位符未被 deploy.yml 替换（本地预览 / 直接打开 index.html）
        if (text === '__BUILD_VERSION__' || text === '') {
            var v = (typeof GAME_VERSION !== 'undefined') ? GAME_VERSION : 'dev';
            badge.textContent = 'v' + v + ' (local)';
        }
    }

    function bind() {
        fillLocalVersionFallback();
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
