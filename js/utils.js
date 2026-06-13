/**
* 安全工具函数 - 2026-06-01
* 仅新增工具，不修改任何原有逻辑
*/
var DOMCache = {
    _cache: {},
    _permanent: {},
    _maxAge: 30000,
    _maxSize: 100, // 【性能优化】限制缓存条目数，防止内存泄漏
    get(id, permanent) {
        if (permanent && this._permanent[id]) return this._permanent[id];
        var c = this._cache[id];
        if (c && (Date.now() - c.t < this._maxAge)) return c.el;
        var el = document.getElementById(id);
        if (el) {
            if (permanent) this._permanent[id] = el;
            else {
                this._cache[id] = { el: el, t: Date.now() };
                this._evictIfNeeded();
            }
        }
    return el;
},
query(sel, permanent) {
    if (permanent && this._permanent[sel]) return this._permanent[sel];
    var c = this._cache[sel];
    if (c && (Date.now() - c.t < this._maxAge)) return c.el;
    var el = document.querySelector(sel);
    if (el) {
        if (permanent) this._permanent[sel] = el;
        else {
            this._cache[sel] = { el: el, t: Date.now() };
            this._evictIfNeeded();
        }
    }
return el;
},
setPermanent(id, el) { if (el) this._permanent[id] = el; },
clear() { this._cache = {}; },
clearAll() { this._cache = {}; this._permanent = {}; },
// 【性能优化】超出容量时淘汰最旧的条目
_evictIfNeeded() {
    var keys = Object.keys(this._cache);
    if (keys.length <= this._maxSize) return;
    // 按时间排序，移除最旧的
    var sorted = keys.sort(function(a, b) { return this._cache[a].t - this._cache[b].t; }.bind(this));
    var removeCount = keys.length - this._maxSize + 10; // 多移除10个，减少频繁淘汰
    for (var i = 0; i < removeCount && i < sorted.length; i++) {
        delete this._cache[sorted[i]];
    }
}
};

var Logger = {
    DEBUG: false, INFO: false, WARN: true, ERROR: true,
    debug: function() { if (this.DEBUG && console && console.log) console.log.apply(console, ['[DEBUG]'].concat(Array.from(arguments))); },
    info: function() { if (this.INFO && console && console.info) console.info.apply(console, ['[INFO]'].concat(Array.from(arguments))); },
    warn: function() { if (this.WARN && console && console.warn) console.warn.apply(console, ['[WARN]'].concat(Array.from(arguments))); },
    error: function() { if (this.ERROR && console && console.error) console.error.apply(console, ['[ERROR]'].concat(Array.from(arguments))); }
};

var TimerManager = {
    _intervals: {}, _timeouts: {},
    setInterval: function(id, fn, delay) { this.clearInterval(id); this._intervals[id] = setInterval(fn, delay); },
    setTimeout: function(id, fn, delay) { this.clearTimeout(id); var self = this; this._timeouts[id] = setTimeout(function() { fn(); delete self._timeouts[id]; }, delay); },
    clearInterval: function(id) { if (this._intervals[id]) { clearInterval(this._intervals[id]); delete this._intervals[id]; } },
    clearTimeout: function(id) { if (this._timeouts[id]) { clearTimeout(this._timeouts[id]); delete this._timeouts[id]; } },
    clearAll: function() { for (var i in this._intervals) clearInterval(this._intervals[i]); for (var i in this._timeouts) clearTimeout(this._timeouts[i]); this._intervals = {}; this._timeouts = {}; }
};

var GlobalCleanup = {
    _listeners: [],
    registerListener: function(target, type, handler, options) { target.addEventListener(type, handler, options); this._listeners.push({target:target,type:type,handler:handler,options:options}); },
    cleanup: function() { for (var i = 0; i < this._listeners.length; i++) { try { this._listeners[i].target.removeEventListener(this._listeners[i].type, this._listeners[i].handler, this._listeners[i].options); } catch(e) {} } this._listeners = []; TimerManager.clearAll(); DOMCache.clear(); }
};

window.addEventListener('beforeunload', function() { GlobalCleanup.cleanup(); });

// escapeHTML / sanitizeHTML 已统一到 core.js 的 escapeHtml，此处不再重复定义

function debounce(fn, delay) { var t = null; return function() { var a = arguments, c = this; if (t) clearTimeout(t); t = setTimeout(function() { fn.apply(c, a); t = null; }, delay); }; }
function throttle(fn, interval) { var last = 0, t = null; return function() { var a = arguments, c = this, now = Date.now(), r = interval - (now - last); if (r <= 0) { if (t) { clearTimeout(t); t = null; } last = now; fn.apply(c, a); } else if (!t) { t = setTimeout(function() { last = Date.now(); t = null; fn.apply(c, a); }, r); } }; }

function safeExecute(fn, fallback) { try { return fn(); } catch(e) { return fallback; } }

// ========================================
// 动态截断策略：根据模型 contextSize 自动调整截断长度
// ========================================
// 核心思路：context 越大，截断越宽松；context 越小，截断越激进
// 基准值以 8K context 为1.0x，按比例缩放，无上限
// 8K→1x, 32K→4x, 128K→16x, 256K→32x, 512K→64x, 1M→128x
function getContextScale() {
    var ctx = (typeof gameState !== 'undefined' && gameState.contextSize) ? gameState.contextSize : 8000;
    return Math.max(0.5, ctx / 8000);
}

// 动态截断：根据 context 大小自动计算截断长度
// baseLen 是 8K context 下的基准长度，实际长度 = baseLen * scale，无上限
function dynamicTruncateLen(baseLen) {
    var scale = getContextScale();
    return Math.max(baseLen, Math.round(baseLen * scale));
}

// 获取各层的动态截断配置（供记忆系统使用）
// 无上限：256K/512K/1M 的模型会自动获得更大的截断空间
function getDynamicTruncationConfig() {
    var scale = getContextScale();
    return {
        // 对话摘要层
        nearTurnChars: Math.max(150, Math.round(300 * scale)),
        midTurnChars: Math.max(60, Math.round(120 * scale)),
        // 记忆注入层
        eventsLineChars: Math.max(60, Math.round(150 * scale)),
        itemsLineChars: Math.max(40, Math.round(80 * scale)),
        summaryLineChars: Math.max(30, Math.round(80 * scale)),
        sceneLineChars: Math.max(50, Math.round(100 * scale)),
        changesLineChars: Math.max(60, Math.round(150 * scale)),
        factsLineChars: Math.max(100, Math.round(600 * scale)),
        defaultLineChars: Math.max(60, Math.round(120 * scale)),
        // 摘要/设定
        summaryMaxChars: Math.max(500, Math.round(1500 * scale)),
        subFuncSetupChars: Math.max(1500, Math.round(3000 * scale)),
        // 角色描述
        characterSummaryChars: Math.max(200, Math.round(500 * scale))
    };
}

// CJK 安全的按字截断（避免按 code unit 截断时把中文字符切坏）
// maxChars 是"可见字符数"，CJK/全角按 1 算，emoji/组合字符按 1 算
function truncateByChars(text, maxChars, suffix) {
    if (text === null || text === undefined) return '';
    var s = String(text);
    suffix = suffix || '';
    // Array.from 能正确按 code point 切，emoji 和 CJK 都安全
    var arr = Array.from(s);
    if (arr.length <= maxChars) return s;
    if (maxChars <= 0) return suffix;
    return arr.slice(0, maxChars).join('') + suffix;
}

// 统一的 token 估算函数（与 game.js updateTokenCount 保持一致）
// 经验上中文 1.5 字符/token，英文 4 字符/token。统一取 1.7 字符/token
// 注意：函数名带 _Util 后缀，避免与 game.js 中的 estimateTokens 顶层声明冲突
function estimateTokensUtil(text) {
    return Math.ceil((text || '').length / 1.7);
}

// 估算一组消息的 token 数
function estimateTokensForMessagesUtil(messages) {
    var total = 0;
    if (!messages) return 0;
    for (var i = 0; i < messages.length; i++) {
        total += (messages[i].content || '').length;
    }
    return Math.ceil(total / 1.7);
}
function safeSetItem(key, value) {
    try {
        var dataSize = (key.length + value.length) * 2;
        var capacity = StorageMonitor.checkCapacity();
        if (capacity.percentage > 90) {
            Logger.warn('localStorage接近满载:', capacity.percentage.toFixed(1) + '%');
        }
    if (capacity.used + dataSize > capacity.total) {
        return { success: false, error: 'quota_exceeded', message: '存储空间不足', required: dataSize, available: capacity.total - capacity.used };
    }
localStorage.setItem(key, value);
// 【性能优化】写入成功后使容量缓存失效
if (typeof StorageMonitor !== 'undefined') StorageMonitor.invalidateCache();
return { success: true, used: dataSize };
} catch(e) {
if (e.name === 'QuotaExceededError' || e.code === 22) {
    Logger.error('localStorage存储已满:', key);
    return { success: false, error: 'quota_exceeded', message: '存储配额已超', key: key };
}
Logger.error('localStorage写入失败:', e.message);
return { success: false, error: 'write_error', message: e.message, key: key };
}
}
function safeGetItem(key, defaultValue) { try { var v = localStorage.getItem(key); return v !== null ? v : defaultValue; } catch(e) { return defaultValue; } }

var StorageMonitor = {
    DEFAULT_LIMIT: 5 * 1024 * 1024,
    MAX_LIMIT: 10 * 1024 * 1024,
    // 【性能优化】缓存容量检查结果，避免每次写入都遍历整个localStorage
    _capacityCache: null,
    _capacityCacheTime: 0,
    _CAPACITY_CACHE_TTL: 30000, // 30秒缓存
    getUsedSpace: function() {
        var used = 0;
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (key) {
                    var value = localStorage.getItem(key);
                    used += (key.length + (value ? value.length : 0)) * 2;
                }
        }
} catch(e) {
Logger.error('计算localStorage使用量失败:', e.message);
}
return used;
},
getRemainingSpace: function() {
    var used = this.getUsedSpace();
    var total = this._estimateTotalSpace();
    return Math.max(0, total - used);
},
checkCapacity: function() {
    // 【性能优化】使用缓存的容量检查结果
    var now = Date.now();
    if (this._capacityCache && (now - this._capacityCacheTime < this._CAPACITY_CACHE_TTL)) {
        return this._capacityCache;
    }
    var used = this.getUsedSpace();
    var total = this._estimateTotalSpace();
    this._capacityCache = { used: used, total: total, percentage: (used / total) * 100 };
    this._capacityCacheTime = now;
    return this._capacityCache;
},
// 【性能优化】写入后使缓存失效
invalidateCache: function() {
    this._capacityCache = null;
    this._capacityCacheTime = 0;
},
warnIfFull: function(threshold) {
    threshold = threshold !== undefined ? threshold : 80;
    var capacity = this.checkCapacity();
    if (capacity.percentage >= threshold) {
        Logger.warn('localStorage使用率已达 ' + capacity.percentage.toFixed(1) + '%，建议清理旧数据');
        return true;
    }
return false;
},
cleanupOldData: function() {
    var suggestions = [];
    var capacity = this.checkCapacity();
    if (capacity.percentage < 50) {
        return { needed: false, message: '存储空间充足', suggestions: suggestions };
    }
var keys = [];
for (var i = 0; i < localStorage.length; i++) {
    keys.push(localStorage.key(i));
}
var tempData = keys.filter(function(k) {
    return k.indexOf('temp_') === 0 || k.indexOf('cache_') === 0 || k.indexOf('_tmp') === k.length - 4;
});
if (tempData.length > 0) {
    suggestions.push({ type: 'temp_data', keys: tempData, message: '发现临时数据，可考虑清理' });
}
var oldBackups = keys.filter(function(k) {
    return k.indexOf('backup_') === 0 || k.indexOf('_backup') === k.length - 7;
});
if (oldBackups.length > 3) {
    suggestions.push({ type: 'old_backups', keys: oldBackups, message: '发现多个备份数据，可保留最新的' });
}
suggestions.push({ type: 'general', message: '建议清理不再需要的缓存数据或旧版本数据' });
return { needed: true, currentUsage: capacity, suggestions: suggestions };
},
_estimateTotalSpace: function() {
    var testKey = '__storage_test_' + Date.now();
    var testValue = 'x';
    try {
        var low = this.DEFAULT_LIMIT;
        var high = this.MAX_LIMIT;
        var mid;
        while (low < high - 1024) {
            mid = Math.floor((low + high) / 2);
            try {
                localStorage.setItem(testKey, testValue.repeat(mid / 2));
                localStorage.removeItem(testKey);
                low = mid;
            } catch(e) {
            high = mid;
        }
}
return low;
} catch(e) {
return this.DEFAULT_LIMIT;
} finally {
try { localStorage.removeItem(testKey); } catch(e) {}
}
}
};

GlobalCleanup.registerListener(window, 'error', function(event) { if (console && console.error) console.error('[全局错误]', event.message); });
GlobalCleanup.registerListener(window, 'unhandledrejection', function(event) { if (console && console.error) console.error('[Promise错误]', event.reason); });

var ThemeManager = {
    _current: 'light',

    init: function() {
        var saved = localStorage.getItem('freeScript_theme');
        if (saved === 'dark' || saved === 'light') {
            this._current = saved;
        } else {
            this._current = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        this.apply();
        this._updateStar();
        var self = this;
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
            if (!localStorage.getItem('freeScript_theme')) {
                self._current = e.matches ? 'dark' : 'light';
                self.apply();
                self._updateStar();
            }
        });
    },

    apply: function() {
        if (this._current === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
        }
    },

    toggle: function() {
        this._current = this._current === 'dark' ? 'light' : 'dark';
        this.apply();
        this._updateStar();
        localStorage.setItem('freeScript_theme', this._current);
    },

    _updateStar: function() {
        var star = document.getElementById('menuTopStar');
        if (!star) return;
        if (this._current === 'dark') {
            star.textContent = '☀';
            star.classList.add('dark-mode');
        } else {
            star.textContent = '★';
            star.classList.remove('dark-mode');
        }
    }
};

function toggleTheme() {
    ThemeManager.toggle();
}

(function() {
    var saved = localStorage.getItem('freeScript_theme');
    var isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
})();

// ========================================
// DOM批量更新工具 - 减少重排重绘
// ========================================
var DOMBatch = {
    _queue: [],
    _scheduled: false,

    // 批量设置 innerHTML
    setHTML: function(el, html) {
        if (!el) return;
        this._queue.push({ el: el, type: 'html', value: html });
        this._schedule();
    },

    // 批量设置 textContent
    setText: function(el, text) {
        if (!el) return;
        this._queue.push({ el: el, type: 'text', value: text });
        this._schedule();
    },

    // 批量设置样式
    setStyle: function(el, prop, value) {
        if (!el) return;
        this._queue.push({ el: el, type: 'style', prop: prop, value: value });
        this._schedule();
    },

    // 调度批量刷新
    _schedule: function() {
        if (this._scheduled) return;
        this._scheduled = true;
        var self = this;
        requestAnimationFrame(function() {
            self._flush();
        });
    },

    // 执行所有排队的更新
    _flush: function() {
        var queue = this._queue;
        this._queue = [];
        this._scheduled = false;

        // 去重：同一元素同类型操作只保留最后一个
        var seen = {};
        var deduped = [];
        for (var i = queue.length - 1; i >= 0; i--) {
            var item = queue[i];
            var key = item.type === 'style' 
                ? (item.el._domBatchId || (item.el._domBatchId = 'el_' + Math.random().toString(36).slice(2))) + '_' + item.type + '_' + item.prop
                : (item.el._domBatchId || (item.el._domBatchId = 'el_' + Math.random().toString(36).slice(2))) + '_' + item.type;
            if (!seen[key]) {
                seen[key] = true;
                deduped.unshift(item);
            }
        }

        // 批量应用
        for (var j = 0; j < deduped.length; j++) {
            var d = deduped[j];
            try {
                if (d.type === 'html') d.el.innerHTML = d.value;
                else if (d.type === 'text') d.el.textContent = d.value;
                else if (d.type === 'style') d.el.style[d.prop] = d.value;
            } catch (e) { /* 忽略无效元素 */ }
        }

        // 清理临时ID
        for (var k = 0; k < deduped.length; k++) {
            delete deduped[k].el._domBatchId;
        }
    }
};

// ========================================
// 【日志封装】统一日志入口，支持级别开关
// ========================================
// 用法：Logger.info('xxx') / Logger.warn('xxx') / Logger.error('xxx')
// 后续可平滑替换零散的 console.* 调用；不会影响线上默认行为。
// 通过 localStorage('free_script_log_level') 可临时调节：'debug' | 'info' | 'warn' | 'error'
var Logger = (function() {
    var LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };
    function currentLevel() {
        try {
            var v = (typeof localStorage !== 'undefined') ? localStorage.getItem('free_script_log_level') : null;
            if (v && LEVELS[v] !== undefined) return LEVELS[v];
        } catch (e) {}
        // 默认：线上静默 info，只保留 warn / error；用户手动改为 debug 即可看全部
        return LEVELS.warn;
    }
    function fmt() {
        var parts = [];
        for (var i = 0; i < arguments.length; i++) {
            var a = arguments[i];
            if (a instanceof Error) parts.push(a.message);
            else if (typeof a === 'object') {
                try { parts.push(JSON.stringify(a)); } catch (e) { parts.push(String(a)); }
            } else parts.push(String(a));
        }
        return parts.join(' ');
    }
    return {
        LEVELS: LEVELS,
        getLevel: currentLevel,
        setLevel: function(name) {
            if (LEVELS[name] === undefined) return;
            try { localStorage.setItem('free_script_log_level', name); } catch (e) {}
        },
        debug: function() { if (currentLevel() <= LEVELS.debug) { try { console.debug.apply(console, ['[DBG]'].concat([].slice.call(arguments))); } catch(e) {} } },
        info:  function() { if (currentLevel() <= LEVELS.info)  { try { console.info.apply(console,  ['[INF]'].concat([].slice.call(arguments))); } catch(e) {} } },
        warn:  function() { if (currentLevel() <= LEVELS.warn)  { try { console.warn.apply(console,  ['[WRN]'].concat([].slice.call(arguments))); } catch(e) {} } },
        error: function() { try { console.error.apply(console, ['[ERR]'].concat([].slice.call(arguments))); } catch(e) {} },
        // 直接调用 Logger.log('msg', 'info') 走级别路由
        log: function(msg, level) {
            level = level || 'info';
            if (this[level]) this[level](msg);
            else this.info(msg);
        }
    };
})();

// ========================================
// 【性能优化】渲染缓存：避免相同输入触发重复重绘
// ========================================
// 用法（render 函数内）：
//   var key = JSON.stringify({ a: gameState.a, b: gameState.b });
//   if (RenderCache.same('renderFoo', key)) return;
//   // ... 实际渲染逻辑
//   RenderCache.mark('renderFoo', key);
var RenderCache = {
    _keys: {},
    same: function(name, key) {
        if (this._keys[name] === key) return true;
        return false;
    },
    mark: function(name, key) {
        this._keys[name] = key;
    },
    // 某些数据变化后（如存档切换、删除消息），需手动失效
    invalidate: function(name) {
        if (name) delete this._keys[name];
        else this._keys = {};
    }
};

// 【性能】页面渲染缓存快捷助手：
// 返回 true 表示应跳过渲染（数据未变化，DOM 仍保留上次的 HTML）
// 返回 false 表示应继续渲染
function shouldSkipPageRender(pageName, dataKey) {
    if (typeof RenderCache === 'undefined') return false;
    if (RenderCache.same(pageName, dataKey)) return true;
    RenderCache.mark(pageName, dataKey);
    return false;
}
