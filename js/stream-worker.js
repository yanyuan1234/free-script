// ========================================
// AI 流式响应 Web Worker
// 把 SSE 解析 + JSON.parse + 文本累加移出主线程，
// 避免长回答（50-150KB）时主线程被占满导致浏览器卡顿。
// 主线程只接收节流后的 CHUNK 消息做 DOM 更新。
// ========================================

// 【P2 修复】主线程保护：如果被当作普通脚本加载（非 Worker 环境），立即退出
// 防止意外在主线程执行时污染全局空间
if (typeof importScripts !== 'function') {
    // 主线程环境，不是 Worker，跳过所有代码
    // 不设置任何全局变量，不注册 onmessage
} else {
// ===== 以下代码仅在 Worker 环境执行 =====

// Worker 内无 window/document，使用 self
var _workerCtx = (typeof self !== 'undefined') ? self : this;

// SSE 事件分隔符（与 core.js _SSE_SEP 一致）
var _SSE_SEP = /\r?\n\r?\n/;

// 活跃请求表：requestId -> { abortController, fullText, reasoningText, ... }
var _activeRequests = {};

// FPS 节流配置（参考 SillyTavern FAQ 建议 10-15 FPS）
// 【BG-005 修复】原 16ms (60fps) 在高并发/限流 API 下会放大 QPS 压力，
// 易触发 ResourceExhausted。提高到 60ms (~16fps) 降低 API 侧请求频率，
// 同时仍保持流式体验的流畅度。
var _CHUNK_THROTTLE_MS = 60;
// 【BUG-006 修复】将节流变量从全局改为每请求独立，避免并发请求时 chunk 发送互相干扰
// 原：_LAST_CHUNK_TIME / _pendingChunkMsg / _chunkTimerScheduled 全局共享
// 新：每请求在 ctx 中维护独立的节流状态

// 错误消息提取（与 core.js extractErrorMessage 等价的简化版，Worker 内不能访问主线程函数）
function _extractErrMsg(errObj, fallback) {
    if (!errObj) return fallback || '';
    if (typeof errObj === 'string') return errObj;
    if (errObj.message) return errObj.message;
    if (errObj.error && errObj.error.message) return errObj.error.message;
    try { return JSON.stringify(errObj); } catch (e) { return fallback || ''; }
}

// SSE 事件文本解析（与 core.js parseSSEEventText 等价）
function _parseSSEEventText(eventText, ctx) {
    if (!eventText) return;
    var lines = eventText.split('\n');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!/^data:\s*/.test(line)) continue;
        var dataStr = line.replace(/^data:\s*/, '').trim();
        if (!dataStr || dataStr === '[DONE]') continue;
        var json;
        try { json = JSON.parse(dataStr); } catch (e) { continue; }

        if (json.error && !ctx.streamError) {
            ctx.streamError = _extractErrMsg(json.error, 'API流式错误: ' + JSON.stringify(json.error));
            continue;
        }
        if (!json.choices || !json.choices[0]) continue;
        var delta = json.choices[0].delta || {};

        var content = (typeof delta.content === 'string') ? delta.content : '';
        var reasoningChunk = (typeof delta.reasoning_content === 'string') ? delta.reasoning_content
                          : (typeof delta.reasoning === 'string') ? delta.reasoning : '';
        // FIX-C1：不再把 reasoning_content/reasoning 回退为正文。对于该 API，reasoning 字段
        // 是模型思考链；若 content 为空则意味着模型未输出正文。回退会导致完整 CoT 泄漏到
        // story UI。参考原版单 HTML 只读取 delta.content，这里保持一致：正文只取 content，
        // reasoning 仅用于折叠面板/调试。
        if (reasoningChunk) {
            // 【P0 性能修复】用数组累加替代 += 拼接，避免 O(n²) 字符串拷贝
            if (!ctx.reasoningTextArr) ctx.reasoningTextArr = [];
            ctx.reasoningTextArr.push(reasoningChunk);
            ctx._reasoningDirty = true;
        }
        // 【P0 性能修复】用数组累加替代 ctx.fullText += content，避免 O(n²) 字符串拷贝
        // 原：每 chunk 都 ctx.fullText += content，1000 chunks × 50KB = 5000万次字符拷贝
        // 新：push O(1)，仅在 postMessage 前 join 一次（16fps 节流后频率远低于 chunk 频率）
        if (!ctx.fullTextArr) ctx.fullTextArr = [];
        ctx.fullTextArr.push(content);
        ctx._fullTextDirty = true;

        if (content) {
            ctx.lastDelta = content;
        }
        // 【酒馆式思维链】追踪 reasoning delta，用于流式实时推送
        if (reasoningChunk) {
            ctx.lastReasoningDelta = (ctx.lastReasoningDelta || '') + reasoningChunk;
        }
    }
}

// 【P0 性能修复】懒 join：仅在需要 fullText 字符串时才 join 数组
function _getFullText(ctx) {
    if (ctx._fullTextDirty) {
        ctx.fullText = ctx.fullTextArr.join('');
        ctx._fullTextDirty = false;
    }
    return ctx.fullText;
}
function _getReasoningText(ctx) {
    if (ctx._reasoningDirty) {
        ctx.reasoningText = ctx.reasoningTextArr.join('');
        ctx._reasoningDirty = false;
    }
    return ctx.reasoningText;
}

// 节流发送 chunk 到主线程
// 高频 chunk 合并为一条消息，避免 postMessage 风暴
function _throttledPostChunk(requestId, ctx) {
    var now = Date.now();
    var elapsed = now - (ctx.lastChunkTime || 0);
    if (elapsed >= _CHUNK_THROTTLE_MS) {
        // 立即发送
        ctx.lastChunkTime = now;
        ctx.pendingChunk = false;
        _workerCtx.postMessage({
            type: 'CHUNK',
            requestId: requestId,
            delta: ctx.lastDelta,
            fullText: _getFullText(ctx),
            reasoningDelta: ctx.lastReasoningDelta || ''
        });
        ctx.lastDelta = '';
        ctx.lastReasoningDelta = '';
    } else {
        // 缓冲，等下一个 timer 发送
        ctx.pendingChunk = true;
        if (!ctx.chunkTimerScheduled) {
            ctx.chunkTimerScheduled = true;
            // 【BUG-006 修复】使用闭包捕获 ctx，避免全局 _pendingChunkMsg 跨请求污染
            setTimeout(function() {
                ctx.chunkTimerScheduled = false;
                if (ctx.pendingChunk) {
                    ctx.pendingChunk = false;
                    ctx.lastChunkTime = Date.now();
                    _workerCtx.postMessage({
                        type: 'CHUNK',
                        requestId: requestId,
                        delta: ctx.lastDelta,
                        fullText: _getFullText(ctx),
                        reasoningDelta: ctx.lastReasoningDelta || ''
                    });
                    ctx.lastDelta = '';
                    ctx.lastReasoningDelta = '';
                }
            }, _CHUNK_THROTTLE_MS - elapsed);
        }
    }
}

// flush 残留的 chunk（流结束前确保最后一段文本已发送）
function _flushFinalChunk(requestId, ctx) {
    if (ctx.lastDelta || ctx.lastReasoningDelta) {
        _workerCtx.postMessage({
            type: 'CHUNK',
            requestId: requestId,
            delta: ctx.lastDelta,
            fullText: _getFullText(ctx),
            reasoningDelta: ctx.lastReasoningDelta || ''
        });
        ctx.lastDelta = '';
        ctx.lastReasoningDelta = '';
    }
    _pendingChunkMsg = null;
}

// 执行流式请求（Worker 内的主循环）
async function _executeStream(requestId, url, body, apiKey) {
    var ctx = {
        fullText: '',
        reasoningText: '',
        streamError: null,
        lastDelta: '',
        lastReasoningDelta: '',
        // 【BUG-006 修复】每请求独立的节流状态
        lastChunkTime: 0,
        pendingChunk: false,
        chunkTimerScheduled: false
    };

    // 连接超时（与 core.js executeAIStream 一致：240s）
    var CONNECT_TIMEOUT_MS = 240 * 1000;
    var connectAC = new AbortController();
    var connectTimer = setTimeout(function() {
        try { connectAC.abort(new Error('API 连接超时（240秒未建立连接）')); } catch (e) {}
    }, CONNECT_TIMEOUT_MS);

    var res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            },
            body: JSON.stringify(body),
            signal: connectAC.signal
        });
    } finally {
        clearTimeout(connectTimer);
    }

    if (!res.ok) {
        var errMsg = 'HTTP ' + res.status;
        try {
            var errData = await res.json();
            var apiMsg = _extractErrMsg(errData.error || errData, '');
            if (apiMsg) errMsg = errMsg + ': ' + apiMsg;
        } catch (e) {}
        var _err = new Error(errMsg);
        _err.status = res.status;
        // 【BG-005 修复】识别 429 / ResourceExhausted / rate_limit / quota，
        // 统一标记为 status=429 让主线程 retry 逻辑接管，避免 Worker 直接降级丢失流式体验
        var _isRateLimited = (res.status === 429)
            || /ResourceExhausted/i.test(errMsg)
            || /rate_?limit/i.test(errMsg)
            || /quota/i.test(errMsg)
            || /request limit reached/i.test(errMsg);
        if (_isRateLimited) {
            _err.status = 429;  // 统一标记，主线程 _is429 检测会命中
            var _retryAfter = res.headers.get('Retry-After');
            if (_retryAfter) _err.retryAfter = _retryAfter;
        }
        throw _err;
    }

    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var sseBuffer = '';

    // rawBody 兜底（与 core.js 一致，1MB 滚动保留）
    // 【P0 性能修复】用数组累加替代 rawBody += chunk，避免 O(n²) 字符串拷贝
    var rawBodyArr = [];
    var rawBodyLen = 0;
    var RAW_BODY_MAX = 1024 * 1024;

    // 分层 idle 超时（与 core.js 一致）
    var FIRST_TOKEN_TIMEOUT_MS = 240 * 1000;
    var CHUNK_IDLE_TIMEOUT_MS = 240 * 1000;
    var hasFirstChunk = false;

    // 检查请求是否已被取消
    var reqState = _activeRequests[requestId];
    if (!reqState || reqState.aborted) {
        try { reader.cancel('request aborted'); } catch (e) {}
        throw new Error('AbortError: user aborted');
    }
    reqState.reader = reader;

    // 【P1 修复跟进】流被 idle timeout 取消时，如果已收到内容，不要丢弃
    var _streamAborted = false;
    try {
    while (true) {
        // 检查取消
        if (reqState.aborted) {
            try { reader.cancel('user aborted'); } catch (e) {}
            throw new Error('AbortError: user aborted');
        }

        var idleMs = hasFirstChunk ? CHUNK_IDLE_TIMEOUT_MS : FIRST_TOKEN_TIMEOUT_MS;
        var idleTimer = setTimeout(function() {
            try { reader.cancel('idle timeout ' + idleMs + 'ms'); } catch (e) {}
        }, idleMs);

        var readResult;
        try {
            readResult = await reader.read();
        } finally {
            clearTimeout(idleTimer);
        }

        if (readResult.done) {
            if (sseBuffer && sseBuffer.trim()) {
                _parseSSEEventText(sseBuffer, ctx);
                _throttledPostChunk(requestId, ctx);
            }
            break;
        }
        hasFirstChunk = true;
        var chunk = decoder.decode(readResult.value, { stream: true });

        // 【P0 性能修复】数组累加替代 rawBody += chunk
        rawBodyArr.push(chunk);
        rawBodyLen += chunk.length;
        if (rawBodyLen > RAW_BODY_MAX) {
            var _joined = rawBodyArr.join('');
            rawBodyArr = [_joined.slice(-RAW_BODY_MAX)];
            rawBodyLen = rawBodyArr[0].length;
        }
        sseBuffer += chunk;
        var events = sseBuffer.split(_SSE_SEP);
        sseBuffer = events.pop() || '';
        for (var i = 0; i < events.length; i++) {
            _parseSSEEventText(events[i], ctx);
        }
        // 节流发送累积的 delta
        // 【BUG-001 修复】推理模型在思考阶段仅输出 reasoning_content，不输出 content。
        // 原代码仅检查 ctx.lastDelta (content)，导致思考阶段无 CHUNK 发送，主线程 120s 超时误判。
        // 修复：同时检查 ctx.lastReasoningDelta，确保推理阶段也发送 CHUNK 保持活动状态。
        if (ctx.lastDelta || ctx.lastReasoningDelta) {
            _throttledPostChunk(requestId, ctx);
        }
    }
    } catch (_streamErr) {
        // 【P1 修复跟进】流被中断时，如果已收到内容，不要丢弃
        var _fullTextSoFar = _getFullText(ctx);
        if (_fullTextSoFar) {
            _streamAborted = true;
            console.warn('[Worker] 流被中断但已收到 ' + _fullTextSoFar.length + ' 字符内容，尝试使用已有数据:', _streamErr && _streamErr.message);
        } else {
            throw _streamErr;  // 没有收到任何内容，抛出原始错误
        }
    }

    // flush 最后一段未发送的 chunk
    _flushFinalChunk(requestId, ctx);

    // 获取最终字符串（懒 join）
    var _finalFullText = _getFullText(ctx);
    var _finalReasoning = _getReasoningText(ctx);
    var rawBody = rawBodyArr.length > 0 ? rawBodyArr.join('') : '';

    // 流中错误处理（与 core.js 一致）
    if (ctx.streamError && !_finalFullText) {
        throw new Error(ctx.streamError);
    }

    // SSE 解析为空时回传 rawBody 让主线程兜底解析
    if (!_finalFullText && rawBody) {
        _workerCtx.postMessage({
            type: 'FALLBACK',
            requestId: requestId,
            rawBody: rawBody,
            reasoningText: _finalReasoning || ''
        });
        return { needFallback: true, rawBody: rawBody, reasoningText: _finalReasoning || '' };
    }

    if (!_finalFullText && !ctx.streamError) {
        throw new Error('AI返回内容为空 → 可能是API返回了非流式格式或响应被截断，请尝试关闭流式模式或重试');
    }

    return { needFallback: false, fullText: _finalFullText, reasoningText: _finalReasoning };
}

// 消息处理
_workerCtx.onmessage = function(e) {
    var msg = e.data || {};
    if (msg.type === 'START') {
        var requestId = msg.requestId;
        _activeRequests[requestId] = { aborted: false, reader: null };

        _executeStream(requestId, msg.url, msg.body, msg.apiKey).then(function(result) {
            if (_activeRequests[requestId] && _activeRequests[requestId].aborted) {
                // 【BUG-005 修复】流被中断但已有部分内容时，仍发送 DONE 保留部分内容
                // 原代码直接 return 丢弃已接收的内容，用户看不到任何已生成的文本
                if (result && result.fullText) {
                    console.warn('[Worker] 流被中断但已保留 ' + result.fullText.length + ' 字符部分内容');
                    _workerCtx.postMessage({
                        type: 'DONE',
                        requestId: requestId,
                        fullText: result.fullText,
                        reasoningText: result.reasoningText || '',
                        interrupted: true
                    });
                }
                delete _activeRequests[requestId];
                return;
            }
            if (result && result.needFallback) {
                // FALLBACK 消息已在 _executeStream 内发送，这里不再发 DONE
                delete _activeRequests[requestId];
                return;
            }
            _workerCtx.postMessage({
                type: 'DONE',
                requestId: requestId,
                fullText: result ? result.fullText : '',
                reasoningText: result ? result.reasoningText : ''
            });
            delete _activeRequests[requestId];
        }).catch(function(err) {
            if (_activeRequests[requestId] && _activeRequests[requestId].aborted) {
                delete _activeRequests[requestId];
                return;
            }
            // 构造错误消息，保留 status/retryAfter/AbortError 信息
            var errPayload = {
                type: 'ERROR',
                requestId: requestId,
                message: (err && err.message) ? err.message : String(err)
            };
            if (err && err.status) errPayload.status = err.status;
            if (err && err.retryAfter) errPayload.retryAfter = err.retryAfter;
            if (err && err.name === 'AbortError') errPayload.isAbort = true;
            // 识别 reader.cancel('user aborted') 抛的 AbortError
            if (err && err.message && /abort/i.test(err.message)) errPayload.isAbort = true;
            _workerCtx.postMessage(errPayload);
            delete _activeRequests[requestId];
        });
    } else if (msg.type === 'ABORT') {
        var requestId = msg.requestId;
        if (_activeRequests[requestId]) {
            _activeRequests[requestId].aborted = true;
            if (_activeRequests[requestId].reader) {
                try { _activeRequests[requestId].reader.cancel('user aborted'); } catch (e) {}
            }
        }
    }
};

} // ===== end of Worker-only code block =====
