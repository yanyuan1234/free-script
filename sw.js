// ========================================
// Service Worker - Free-Script PWA 离线支持
// 策略：
// - HTML 页面：网络优先，失败回退缓存（保证更新）
// - JS/CSS 文件：stale-while-revalidate（先返回缓存，后台更新网络版本）
//   【修复】之前用 cache-first 导致代码更新后用户永远加载旧 JS
// - 其他静态资源（png/svg/json/manifest）：缓存优先，回退网络
// - API 请求（fetch 到 OpenAI/DeepSeek 等）：不拦截，直接放行
// - install 时预缓存核心资源，activate 时清理旧缓存
// ========================================

// 【修复】缓存名包含时间戳，每次部署新代码时自动失效旧缓存
// 手动更新：修改此时间戳 → activate 时清理旧缓存 → 用户拿到新代码
var CACHE_NAME = 'free-script-v2-2026-08-16-preset-fusion';
var CORE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './favicon.svg',
    './css/base.css',
    './css/menu.css',
    './css/pages.css',
    './css/phone-ui.css',
    './css/systems.css',
    './js/tokenizer.js',
    './js/utils.js',
    './js/character-card-exporter.js',
    './js/state/schema.js',
    './js/state/state-manager.js',
    './js/state/mutators/bag-mutator.js',
    './js/state/mutators/quest-mutator.js',
    './js/state/mutators/character-mutator.js',
    './js/state/mutators/time-mutator.js',
    './js/state/mutators/currency-mutator.js',
    './js/state/mutators/relationship-mutator.js',
    './js/state/mutators/location-mutator.js',
    './js/state/mutators/undo-mutator.js',
    './js/state/adapters/game-memory-adapter.js',
    './js/ai-contract/schemas/ai-output-schema.js',
    './js/ai-contract/schemas/ai-output-json-schema.js',
    './js/ai-contract/output-sanitizer.js',
    './js/ai-contract/response-parser.js',
    './js/ai-contract/ai-response-mutator.js',
    './js/ai-contract/prompt-builder.js',
    './js/core.js',
    './js/stream-bridge.js',
    './js/vector-retriever.js',
    './js/worldinfo.js',
    './js/modules/smart-config-engine.js',
    './js/modules/model-registry.js',
    './js/modules/built-in-presets.js',
    './js/modules/preset-manager.js',
    './js/modules/regex-manager.js',
    './js/modules/macro-engine.js',
    './js/modules/bookmark.js',
    './js/modules/share-card.js',
    './js/swipe-manager.js',
    './js/game.js',
    './js/phone-ui.js',
    './js/systems.js',
    './js/tavern-compat.js',
    './js/init.js',
    './js/ai-contract/stscript-bridge.js',
    './js/version-badge.js',
    './js/sw-register.js'
];

// install：预缓存核心资源
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            console.log('[SW] 预缓存核心资源');
            // 用 addAll 失败一个就全失败，改用逐个 add 容错
            return Promise.all(CORE_ASSETS.map(function(url) {
                return cache.add(url).catch(function(err) {
                    console.warn('[SW] 预缓存失败:', url, err);
                });
            }));
        }).then(function() {
            // 跳过等待，立即激活
            return self.skipWaiting();
        })
    );
});

// activate：清理旧缓存
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(keys.map(function(key) {
                if (key !== CACHE_NAME) {
                    console.log('[SW] 清理旧缓存:', key);
                    return caches.delete(key);
                }
            }));
        }).then(function() {
            // 立即接管所有客户端
            return self.clients.claim();
        })
    );
});

// 判断是否为 JS/CSS 文件（需要 stale-while-revalidate 策略）
function isJSCSS(url) {
    return /\.(js|css)(\?|$)/.test(url);
}

// fetch：按资源类型路由
self.addEventListener('fetch', function(event) {
    var req = event.request;
    // 只处理 GET 请求
    if (req.method !== 'GET') return;

    var url = new URL(req.url);

    // 跨域请求（API 调用）不拦截
    if (url.origin !== self.location.origin) return;

    // HTML 页面：网络优先，失败回退缓存（保证更新）
    if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1) {
        event.respondWith(
            fetch(req).then(function(res) {
                // 成功则更新缓存
                var clone = res.clone();
                caches.open(CACHE_NAME).then(function(cache) { cache.put(req, clone); });
                return res;
            }).catch(function() {
                // 离线时回退缓存
                return caches.match(req).then(function(cached) {
                    return cached || caches.match('./index.html');
                });
            })
        );
        return;
    }

    // 【修复】JS/CSS 文件：网络优先（与 HTML 相同策略）
    // 原 stale-while-revalidate 策略会先返回旧缓存，导致代码更新后用户首次加载仍用旧代码
    // 改为网络优先确保用户始终拿到最新代码，离线时才回退缓存
    if (isJSCSS(url.pathname)) {
        event.respondWith(
            fetch(req).then(function(res) {
                if (res.ok && res.type === 'basic') {
                    var clone = res.clone();
                    caches.open(CACHE_NAME).then(function(cache) { cache.put(req, clone); });
                }
                return res;
            }).catch(function() {
                return caches.match(req).then(function(cached) {
                    return cached || new Response('// Offline', { status: 504, headers: { 'Content-Type': 'application/javascript' } });
                });
            })
        );
        return;
    }

    // 其他静态资源：缓存优先，回退网络
    event.respondWith(
        caches.match(req).then(function(cached) {
            if (cached) return cached;
            return fetch(req).then(function(res) {
                // 缓存成功的响应（仅同源）
                if (res.ok && res.type === 'basic') {
                    var clone = res.clone();
                    caches.open(CACHE_NAME).then(function(cache) { cache.put(req, clone); });
                }
                return res;
            }).catch(function() {
                // 离线且无缓存，返回空响应避免报错
                return new Response('', { status: 504, statusText: 'Offline' });
            });
        })
    );
});

// 接收消息：手动更新缓存
self.addEventListener('message', function(event) {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
