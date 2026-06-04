/**
* 安全工具函数 - 2026-06-01
* 仅新增工具，不修改任何原有逻辑
*/
var DOMCache = {
    _cache: {},
    _permanent: {},
    _maxAge: 30000,
    get(id, permanent) {
        if (permanent && this._permanent[id]) return this._permanent[id];
        var c = this._cache[id];
        if (c && (Date.now() - c.t < this._maxAge)) return c.el;
        var el = document.getElementById(id);
        if (el) {
            if (permanent) this._permanent[id] = el;
            else this._cache[id] = { el: el, t: Date.now() };
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
        else this._cache[sel] = { el: el, t: Date.now() };
    }
return el;
},
setPermanent(id, el) { if (el) this._permanent[id] = el; },
clear() { this._cache = {}; },
clearAll() { this._cache = {}; this._permanent = {}; }
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

function sanitizeHTML(str) { if (!str) return ''; if (typeof str !== 'string') str = String(str); return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

function debounce(fn, delay) { var t = null; return function() { var a = arguments, c = this; if (t) clearTimeout(t); t = setTimeout(function() { fn.apply(c, a); t = null; }, delay); }; }
function throttle(fn, interval) { var last = 0, t = null; return function() { var a = arguments, c = this, now = Date.now(), r = interval - (now - last); if (r <= 0) { if (t) { clearTimeout(t); t = null; } last = now; fn.apply(c, a); } else if (!t) { t = setTimeout(function() { last = Date.now(); t = null; fn.apply(c, a); }, r); } }; }

function safeExecute(fn, fallback) { try { return fn(); } catch(e) { return fallback; } }

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
    var used = this.getUsedSpace();
    var total = this._estimateTotalSpace();
    return { used: used, total: total, percentage: (used / total) * 100 };
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
