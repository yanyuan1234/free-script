// ========================================
// AI 流式响应 Web Worker 主线程桥接层
// 暴露与 executeAIStream 完全一致的接口：executeAIStreamViaWorker(url, body, apiKey, signal, onChunk)
// 内部把请求转发到 stream-worker.js，Worker 不可用时自动降级到 executeAIStream（core.js 原实现）
// ========================================

var StreamBridge = (function() {
    var _worker = null;
    var _workerAvailable = false;
    var _workerInitAttempted = false;
    var _pendingRequests = {};  // requestId -> { resolve, reject, onChunk, signal, abortListener }
    var _nextRequestId = 1;

    // 懒初始化 Worker（首次调用时创建）
    function _ensureWorker() {
        if (_workerInitAttempted) return _workerAvailable;
        _workerInitAttempted = true;

        // 环境检测：Worker / Blob / URL 必须都可用
        if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
            console.warn('[StreamBridge] 当前环境不支持 Web Worker，将使用主线程流式解析');
            return false;
        }

        try {
            // 通过 Blob URL 加载 Worker，避免 GitHub Pages 跨路径问题
            // Worker 源码内联为字符串，确保与主线程同源加载
            var workerSrc = _getWorkerSource();
            var blob = new Blob([workerSrc], { type: 'application/javascript' });
            var blobUrl = URL.createObjectURL(blob);
            _worker = new Worker(blobUrl);
            _worker.onmessage = _onWorkerMessage;
            _worker.onerror = function(e) {
                console.warn('[StreamBridge] Worker 运行时错误，后续将降级到主线程:', e.message || e);
                _workerAvailable = false;
                // 把所有 pending 请求降级到主线程
                _fallbackAllPending('Worker 运行时错误: ' + (e.message || 'unknown'));
            };
            _workerAvailable = true;
            console.log('[StreamBridge] Web Worker 已就绪，SSE 解析将运行在 Worker 线程');
        } catch (e) {
            console.warn('[StreamBridge] Worker 初始化失败，将使用主线程流式解析:', e && e.message);
            _workerAvailable = false;
        }
        return _workerAvailable;
    }

    // Worker 源码：通过 fetch 同步获取 stream-worker.js 内容
    // 注意：不能直接 new Worker('js/stream-worker.js')，因 GitHub Pages 部署路径可能变化
    // 改为内联方式：把 stream-worker.js 内容作为字符串嵌入
    // 为避免重复维护，使用 document.currentScript 或同步 XHR 获取源码
    var _cachedWorkerSrc = null;
    function _getWorkerSource() {
        if (_cachedWorkerSrc) return _cachedWorkerSrc;
        // 同步 XHR 获取 Worker 源码（仅一次，初始化时执行）
        // 同步 XHR 在现代浏览器有 deprecation warning，但用于 Worker 初始化是可接受的做法
        var scriptUrl = _resolveWorkerUrl();
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', scriptUrl, false);  // 同步
            xhr.send();
            if (xhr.status === 200) {
                _cachedWorkerSrc = xhr.responseText;
                return _cachedWorkerSrc;
            }
        } catch (e) {
            console.warn('[StreamBridge] 同步获取 Worker 源码失败:', e && e.message);
        }
        // 兜底：返回空源码，Worker 创建会失败，降级到主线程
        return '';
    }

    // 解析 stream-worker.js 的 URL
    function _resolveWorkerUrl() {
        // 优先使用相对路径（与 index.html 同目录约定）
        var scripts = document.getElementsByTagName('script');
        for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].src || '';
            if (/stream-bridge\.js$/.test(src)) {
                // 同目录下的 stream-worker.js
                return src.replace(/stream-bridge\.js$/, 'stream-worker.js');
            }
        }
        // 兜底：相对路径
        return 'js/stream-worker.js';
    }

    // 处理 Worker 发来的消息
    function _onWorkerMessage(e) {
        var msg = e.data || {};
        var req = _pendingRequests[msg.requestId];
        if (!req) return;

        if (msg.type === 'CHUNK') {
            // 转发 chunk 给上层 onChunk 回调
            if (req.onChunk && msg.delta) {
                try { req.onChunk(msg.delta, msg.fullText); }
                catch (cbErr) { console.warn('[StreamBridge] onChunk 回调异常:', cbErr); }
            }
        } else if (msg.type === 'DONE') {
            // 设置 reasoning 透出（与原 executeAIStream 一致）
            try {
                if (typeof window !== 'undefined') {
                    window._lastReasoningText = msg.reasoningText || '';
                }
            } catch (e) {}
            _cleanupRequest(msg.requestId);
            req.resolve(msg.fullText || '');
        } else if (msg.type === 'ERROR') {
            var err;
            if (msg.isAbort) {
                err = new Error('AbortError');
                err.name = 'AbortError';
                err.aborted = true;
            } else {
                err = new Error(msg.message || 'Worker 流式请求失败');
                if (msg.status) err.status = msg.status;
                if (msg.retryAfter) err.retryAfter = msg.retryAfter;
            }
            _cleanupRequest(msg.requestId);
            req.reject(err);
        } else if (msg.type === 'FALLBACK') {
            // Worker 内 SSE 解析为空，回传 rawBody 让主线程兜底
            // 调用 core.js 的 parseAIResponseFallback 解析
            var fallbackResult = '';
            try {
                if (typeof parseAIResponseFallback === 'function') {
                    fallbackResult = parseAIResponseFallback(msg.rawBody);
                } else {
                    fallbackResult = msg.rawBody;
                }
            } catch (e) {
                console.warn('[StreamBridge] FALLBACK 解析失败:', e);
                fallbackResult = msg.rawBody || '';
            }
            // 透传 reasoning 文本，与 DONE 路径保持一致
            try {
                if (typeof window !== 'undefined') {
                    window._lastReasoningText = msg.reasoningText || '';
                }
            } catch (e) {}
            _cleanupRequest(msg.requestId);
            req.resolve(fallbackResult);
        }
    }

    // 清理请求状态
    function _cleanupRequest(requestId) {
        var req = _pendingRequests[requestId];
        if (!req) return;
        if (req.abortListener && req.signal) {
            try { req.signal.removeEventListener('abort', req.abortListener); } catch (e) {}
        }
        delete _pendingRequests[requestId];
    }

    // 所有 pending 请求降级到主线程（Worker 崩溃时）
    function _fallbackAllPending(reason) {
        var ids = Object.keys(_pendingRequests);
        for (var i = 0; i < ids.length; i++) {
            var req = _pendingRequests[ids[i]];
            // 标记为需要降级，reject 让上层重试
            _cleanupRequest(ids[i]);
            req.reject(new Error('Worker 不可用: ' + reason));
        }
    }

    // 主入口：通过 Worker 执行流式请求
    // API 与 executeAIStream 完全一致：async (url, body, apiKey, signal, onChunk) -> string
    function executeAIStreamViaWorker(url, body, apiKey, signal, onChunk) {
        if (!_ensureWorker() || !_worker) {
            // Worker 不可用，返回特殊标记让调用方降级
            return Promise.reject(new Error('WORKER_UNAVAILABLE'));
        }

        var requestId = 'req_' + (_nextRequestId++);
        var resolver, rejecter;
        var promise = new Promise(function(resolve, reject) {
            resolver = resolve;
            rejecter = reject;
        });

        _pendingRequests[requestId] = {
            resolve: resolver,
            reject: rejecter,
            onChunk: onChunk,
            signal: signal,
            abortListener: null
        };

        // 监听外部 signal 的 abort（用户取消）
        if (signal) {
            var abortListener = function() {
                if (_worker) {
                    try { _worker.postMessage({ type: 'ABORT', requestId: requestId }); }
                    catch (e) {}
                }
                // 不立即 reject，等 Worker 回 ERROR(isAbort=true) 再 reject
                // 这样能保证 fullText 已经累积的部分被正确处理
            };
            _pendingRequests[requestId].abortListener = abortListener;
            if (signal.aborted) {
                abortListener();
            } else {
                signal.addEventListener('abort', abortListener, { once: true });
            }
        }

        // 发送 START 消息（body 需要结构化克隆，不能含函数）
        try {
            _worker.postMessage({
                type: 'START',
                requestId: requestId,
                url: url,
                body: body,
                apiKey: apiKey
            });
        } catch (e) {
            _cleanupRequest(requestId);
            return Promise.reject(new Error('WORKER_POSTMESSAGE_FAILED: ' + (e && e.message)));
        }

        return promise;
    }

    // 对外暴露的 API
    return {
        executeAIStreamViaWorker: executeAIStreamViaWorker,
        isAvailable: function() { return _ensureWorker(); }
    };
})();
