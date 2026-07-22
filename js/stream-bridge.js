// ========================================
// AI 流式响应 Web Worker 主线程桥接层
// 暴露与 executeAIStream 完全一致的接口：executeAIStreamViaWorker(url, body, apiKey, signal, onChunk)
// 内部把请求转发到 stream-worker.js，Worker 不可用时自动降级到 executeAIStream（core.js 原实现）
// ========================================

var StreamBridge = (function() {
    var _worker = null;
    var _workerAvailable = false;
    var _workerInitAttempted = false;
    var _workerInitPromise = null;  // 【P1 修复】异步初始化 Promise，避免重复初始化
    var _pendingRequests = {};  // requestId -> { resolve, reject, onChunk, signal, abortListener, timeoutId }
    var _nextRequestId = 1;
    // [BUG-001 修复] 主线程侧请求超时（兜底机制）
    // 若 Worker 崩溃且 error 事件未触发，req.promise 将永久 pending，导致 UI 卡死
    // 【P0-2 修复】将固定 120 秒超时改为 10 分钟（与 callAI 默认超时一致）
    // 120 秒对推理模型（DeepSeek-R1 等 3-5 分钟思考）远远不够，导致正常请求被误杀
    // 同时引入"活动超时"机制：每收到 CHUNK 消息就重置计时器，只有真正无响应才超时
    var REQUEST_TIMEOUT_MS = 10 * 60 * 1000;  // 10分钟总超时（兜底）
    // 【BUG-007 修复】将活动超时从 120s 提升到 300s，支持推理模型长时间思考阶段
    // DeepSeek-R1 / o1 等模型思考阶段可能持续 3-5 分钟，120s 会误杀正常请求
    // 配合 BUG-001 修复（推理阶段也发送 CHUNK），300s 足以覆盖绝大多数推理场景
    var ACTIVITY_TIMEOUT_MS = 300 * 1000;     // 300秒无活动超时（收到chunk/reasoning时重置）

    // 【P1 修复】懒初始化 Worker（异步，首次调用时创建）
    // 原实现使用同步 XHR 获取 Worker 源码，阻塞主线程
    // 新实现：使用 async fetch + Blob URL，不阻塞主线程
    function _ensureWorker() {
        if (_workerInitAttempted) {
            // 已初始化完成（成功或失败），返回已缓存结果
            return _workerAvailable ? Promise.resolve(true) : Promise.resolve(false);
        }
        if (_workerInitPromise) {
            // 初始化正在进行中，复用同一个 Promise
            return _workerInitPromise;
        }
        _workerInitPromise = _initWorkerAsync();
        return _workerInitPromise;
    }

    async function _initWorkerAsync() {
        // 环境检测：Worker / Blob / URL 必须都可用
        if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
            console.warn('[StreamBridge] 当前环境不支持 Web Worker，将使用主线程流式解析');
            _workerInitAttempted = true;
            _workerAvailable = false;
            return false;
        }

        try {
            // 【P1 修复】异步获取 Worker 源码（替代同步 XHR）
            var workerSrc = await _getWorkerSourceAsync();
            if (!workerSrc) {
                console.warn('[StreamBridge] Worker 源码为空，将使用主线程流式解析');
                _workerInitAttempted = true;
                _workerAvailable = false;
                return false;
            }
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
            _workerInitAttempted = true;
            console.log('[StreamBridge] Web Worker 已就绪，SSE 解析将运行在 Worker 线程');
            return true;
        } catch (e) {
            console.warn('[StreamBridge] Worker 初始化失败，将使用主线程流式解析:', e && e.message);
            _workerInitAttempted = true;
            _workerAvailable = false;
            return false;
        }
    }

    // 【P1 修复】Worker 源码：通过 async fetch 获取 stream-worker.js 内容
    // 原实现使用同步 XHR（xhr.open('GET', url, false)），会阻塞主线程
    // 新实现：使用 async fetch，不阻塞主线程
    var _cachedWorkerSrc = null;
    async function _getWorkerSourceAsync() {
        if (_cachedWorkerSrc) return _cachedWorkerSrc;
        var scriptUrl = _resolveWorkerUrl();
        try {
            var resp = await fetch(scriptUrl);
            if (resp.ok) {
                _cachedWorkerSrc = await resp.text();
                return _cachedWorkerSrc;
            } else {
                console.warn('[StreamBridge] 异步获取 Worker 源码失败: HTTP ' + resp.status);
            }
        } catch (e) {
            console.warn('[StreamBridge] 异步获取 Worker 源码失败:', e && e.message);
        }
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
    // 【BUG-002 修复】使用 rAF 批处理 CHUNK 消息，避免高频 chunk 导致主线程冻结
    // Worker 每 60ms 发送一个 CHUNK，每个 CHUNK 触发 onChunk + _extractPartialStory + _dispatchPartialStory
    // 当缓冲区增大时，正则匹配 + 事件派发开销累积，导致主线程被阻塞
    // 修复：用 rAF 合并同一帧内的多个 CHUNK，每帧最多处理一次 onChunk + partialStory
    var _chunkBatchPending = {};  // requestId -> { delta: '', fullText: '', reasoningDelta: '' }
    var _chunkBatchRaf = {};      // requestId -> rAF id

    function _flushChunkBatch(requestId) {
        var batch = _chunkBatchPending[requestId];
        if (!batch) return;
        delete _chunkBatchPending[requestId];
        delete _chunkBatchRaf[requestId];

        var req = _pendingRequests[requestId];
        if (!req) return;

        // 合并后一次性调用 onChunk
        if (req.onChunk && (batch.delta || batch.reasoningDelta)) {
            try { req.onChunk(batch.delta, batch.fullText, batch.reasoningDelta || ''); }
            catch (cbErr) { console.warn('[StreamBridge] onChunk 批处理回调异常:', cbErr); }
        }

        // 部分故事提取（每帧最多一次）
        if (batch.fullText && typeof _extractPartialStory === 'function') {
            if (batch.fullText.indexOf('"story"') !== -1) {
                try {
                    var _partial = _extractPartialStory(batch.fullText);
                    if (_partial) {
                        var _lastLen = req._lastPartialStoryLen || 0;
                        if (_partial.length > _lastLen) {
                            req._lastPartialStoryLen = _partial.length;
                            if (typeof _dispatchPartialStory === 'function') {
                                _dispatchPartialStory(_partial, batch.fullText);
                            }
                        }
                    }
                } catch (_psErr) {
                    console.warn('[StreamBridge] 部分故事提取异常:', _psErr);
                }
            }
        }
    }

    function _onWorkerMessage(e) {
        var msg = e.data || {};
        var req = _pendingRequests[msg.requestId];
        if (!req) return;

        if (msg.type === 'CHUNK') {
            // 【P0-2 修复】收到 CHUNK 时重置活动超时计时器
            _resetActivityTimeout(msg.requestId);

            // 【BUG-002 修复】rAF 批处理：合并同一帧内的多个 CHUNK
            var rid = msg.requestId;
            if (!_chunkBatchPending[rid]) {
                _chunkBatchPending[rid] = {
                    delta: msg.delta || '',
                    fullText: msg.fullText || '',
                    reasoningDelta: msg.reasoningDelta || ''
                };
                // 调度 rAF 刷新（如果 rAF 不可用，降级为 setTimeout 0）
                if (typeof requestAnimationFrame !== 'undefined') {
                    _chunkBatchRaf[rid] = requestAnimationFrame(function() { _flushChunkBatch(rid); });
                } else {
                    _chunkBatchRaf[rid] = setTimeout(function() { _flushChunkBatch(rid); }, 0);
                }
            } else {
                // 合并到已有批次
                var batch = _chunkBatchPending[rid];
                if (msg.delta) batch.delta += msg.delta;
                if (msg.fullText) batch.fullText = msg.fullText;  // fullText 是累积的，直接覆盖
                if (msg.reasoningDelta) batch.reasoningDelta += msg.reasoningDelta;
            }
        } else if (msg.type === 'DONE') {
            // 【BUG-002 修复】DONE 前先刷新批处理中剩余的 CHUNK
            if (_chunkBatchPending[msg.requestId]) {
                if (_chunkBatchRaf[msg.requestId]) {
                    if (typeof cancelAnimationFrame !== 'undefined') {
                        cancelAnimationFrame(_chunkBatchRaf[msg.requestId]);
                    } else {
                        clearTimeout(_chunkBatchRaf[msg.requestId]);
                    }
                }
                _flushChunkBatch(msg.requestId);
            }
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

    // 【P0-2 修复】活动超时重置：每次收到 CHUNK 时重置 120 秒无响应计时器
    // 只有无活动（Worker 崩溃/网络断开）才超时，推理模型长时间思考不受影响
    function _resetActivityTimeout(requestId) {
        var req = _pendingRequests[requestId];
        if (!req) return;
        if (req.timeoutId) {
            clearTimeout(req.timeoutId);
        }
        req.timeoutId = setTimeout(function() {
            var r = _pendingRequests[requestId];
            if (r) {
                console.warn('[StreamBridge] 请求无活动超时(' + ACTIVITY_TIMEOUT_MS + 'ms)，Worker 可能已崩溃或网络断开');
                // 【BUG-003 修复】超时降级前先中止 Worker 中的请求，避免旧请求继续占用 API 配额
                // 导致降级请求触发连锁 ResourceExhausted 限流
                if (_worker) {
                    try { _worker.postMessage({ type: 'ABORT', requestId: requestId }); } catch (e) {}
                }
                _cleanupRequest(requestId);
                r.reject(new Error('STREAM_TIMEOUT: 请求无响应超时(' + (ACTIVITY_TIMEOUT_MS / 1000) + '秒无数据)，请重试'));
            }
        }, ACTIVITY_TIMEOUT_MS);
    }

    // 清理请求状态
    function _cleanupRequest(requestId) {
        var req = _pendingRequests[requestId];
        if (!req) return;
        if (req.abortListener && req.signal) {
            try { req.signal.removeEventListener('abort', req.abortListener); } catch (e) {}
        }
        // [BUG-001 修复] 清理超时定时器，避免内存泄漏
        if (req.timeoutId) {
            clearTimeout(req.timeoutId);
            req.timeoutId = null;
        }
        // 【P0-2 修复】清理总超时定时器
        if (req.totalTimeoutId) {
            clearTimeout(req.totalTimeoutId);
            req.totalTimeoutId = null;
        }
        // 【BUG-002 修复】清理 rAF 批处理状态
        if (_chunkBatchRaf[requestId]) {
            if (typeof cancelAnimationFrame !== 'undefined') {
                cancelAnimationFrame(_chunkBatchRaf[requestId]);
            } else {
                clearTimeout(_chunkBatchRaf[requestId]);
            }
            delete _chunkBatchRaf[requestId];
        }
        delete _chunkBatchPending[requestId];
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
        // 【P1-4 修复】Worker 崩溃后自动重启，恢复后续请求的处理能力
        _restartWorker();
    }

    // 【P1-4 修复】重启 Worker：清理旧 Worker，重置状态，异步重新初始化
    function _restartWorker() {
        if (_worker) {
            try { _worker.terminate(); } catch (e) {}
            _worker = null;
        }
        _workerAvailable = false;
        _workerInitAttempted = false;
        _workerInitPromise = null;
        // 异步重新初始化，不阻塞当前调用
        _ensureWorker().then(function(ok) {
            if (ok) {
                console.log('[StreamBridge] Worker 已自动重启');
            } else {
                console.warn('[StreamBridge] Worker 重启失败，后续请求将降级到主线程');
            }
        }).catch(function(e) {
            console.warn('[StreamBridge] Worker 重启异常:', e && e.message);
        });
    }

    // 主入口：通过 Worker 执行流式请求
    // API 与 executeAIStream 完全一致：async (url, body, apiKey, signal, onChunk) -> string
    async function executeAIStreamViaWorker(url, body, apiKey, signal, onChunk) {
        // 【P1 修复】await 异步 Worker 初始化
        var available = await _ensureWorker();
        if (!available || !_worker) {
            // Worker 不可用，返回特殊标记让调用方降级
            throw new Error('WORKER_UNAVAILABLE');
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
            abortListener: null,
            timeoutId: null  // [BUG-001 修复] 请求超时定时器
        };

        // [BUG-001 修复] 设置主线程侧请求超时
        // 若 Worker 崩溃且未触发 error 事件，超时后自动 reject 防止 UI 永久卡死
        // 【P0-2 修复】使用活动超时机制：120秒无 CHUNK 响应才超时，推理模型长时间思考不会被误杀
        _resetActivityTimeout(requestId);
        // 总超时兜底：10 分钟后无论如何都超时（防止活动超时被无限重置）
        _pendingRequests[requestId].totalTimeoutId = setTimeout(function() {
            var req = _pendingRequests[requestId];
            if (req) {
                console.warn('[StreamBridge] 请求总超时(' + REQUEST_TIMEOUT_MS + 'ms)，Worker 可能已崩溃');
                _cleanupRequest(requestId);
                req.reject(new Error('STREAM_TIMEOUT: 请求总超时(' + (REQUEST_TIMEOUT_MS / 1000) + '秒)，请重试'));
            }
        }, REQUEST_TIMEOUT_MS);

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
        // 【P1 修复】isAvailable 改为同步检查已缓存状态（不触发初始化）
        isAvailable: function() { return _workerAvailable; },
        // 异步检查可用性（触发初始化）
        isAvailableAsync: function() { return _ensureWorker(); }
    };
})();
