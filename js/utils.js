/**
* 安全工具函数 - 2026-06-01
* 仅新增工具，不修改任何原有逻辑
*/
const DOMCache = {
    _cache: {},
    _permanent: {},
    _maxAge: 30000,
    _maxSize: 100, // 【性能优化】限制缓存条目数，防止内存泄漏
    get(id, permanent) {
        if (permanent && this._permanent[id]) return this._permanent[id];
        const c = this._cache[id];
        if (c && (Date.now() - c.t < this._maxAge)) return c.el;
        const el = document.getElementById(id);
        if (el) {
            if (permanent) this._permanent[id] = el;
            else {
                this._cache[id] = { el: el, t: Date.now() };
                this._evictIfNeeded();
            }
        }
    return el;
},
clear() { this._cache = {}; },
// 【性能优化】超出容量时淘汰最旧的条目
_evictIfNeeded() {
    const keys = Object.keys(this._cache);
    if (keys.length <= this._maxSize) return;
    // 按时间排序，移除最旧的
    const sorted = keys.sort((a, b) => this._cache[a].t - this._cache[b].t);
    const removeCount = keys.length - this._maxSize + 10; // 多移除10个，减少频繁淘汰
    for (let i = 0; i < removeCount && i < sorted.length; i++) {
        delete this._cache[sorted[i]];
    }
}
};

const TimerManager = {
    _intervals: {}, _timeouts: {},
    setInterval(id, fn, delay) { this.clearInterval(id); this._intervals[id] = setInterval(fn, delay); },
    setTimeout(id, fn, delay) { this.clearTimeout(id); var self = this; this._timeouts[id] = setTimeout(function() { fn(); delete self._timeouts[id]; }, delay); },
    clearInterval(id) { if (this._intervals[id]) { clearInterval(this._intervals[id]); delete this._intervals[id]; } },
    clearTimeout(id) { if (this._timeouts[id]) { clearTimeout(this._timeouts[id]); delete this._timeouts[id]; } },
    clearAll() { for (let i in this._intervals) clearInterval(this._intervals[i]); for (let i in this._timeouts) clearTimeout(this._timeouts[i]); this._intervals = {}; this._timeouts = {}; }
};

const GlobalCleanup = {
    _listeners: [],
    registerListener(target, type, handler, options) { target.addEventListener(type, handler, options); this._listeners.push({target:target,type:type,handler:handler,options:options}); },
    cleanup() { for (let i = 0; i < this._listeners.length; i++) { try { this._listeners[i].target.removeEventListener(this._listeners[i].type, this._listeners[i].handler, this._listeners[i].options); } catch(e) {} } this._listeners = []; TimerManager.clearAll(); DOMCache.clear(); }
};

window.addEventListener('beforeunload', function() { GlobalCleanup.cleanup(); });

// escapeHTML / sanitizeHTML 已统一到 core.js 的 escapeHtml，此处不再重复定义

// 【P2清理】删除 debounce / throttle / safeExecute / dynamicTruncateLen（全项目零调用）
// 保留 getContextScale（被多处使用）

// ========================================
// 动态截断策略：根据模型 contextSize 自动调整截断长度
// ========================================
// 核心思路：context 越大，截断越宽松；context 越小，截断越激进
// 基准值以 8K context 为1.0x，按比例缩放，无上限
// 8K→1x, 32K→4x, 128K→16x, 256K→32x, 512K→64x, 1M→128x
function getContextScale() {
    const ctx = (typeof gameState !== 'undefined' && gameState.contextSize) ? gameState.contextSize : 8000;
    return Math.max(0.5, ctx / 8000);
}

// 获取各层的动态截断配置（供记忆系统使用）
// 无上限：256K/512K/1M 的模型会自动获得更大的截断空间
function getDynamicTruncationConfig() {
    const scale = getContextScale();
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
    const s = String(text);
    suffix = suffix || '';
    // Array.from 能正确按 code point 切，emoji 和 CJK 都安全
    const arr = Array.from(s);
    if (arr.length <= maxChars) return s;
    if (maxChars <= 0) return suffix;
    return arr.slice(0, maxChars).join('') + suffix;
}

// ========================================
// 类型安全转换工具
// 消除 parseInt(x)||N 和 typeof x!=='object' 的重复模式（各 40+/50+ 处散落）
// ========================================

// 安全整数转换：无效值（null/undefined/空串/NaN）返回默认值
function safeInt(v, defaultVal) {
    if (v === null || v === undefined || v === '') return defaultVal || 0;
    var n = parseInt(v, 10);
    return isNaN(n) ? (defaultVal || 0) : n;
}

// 对象类型检查：排除 null（typeof null === 'object' 的 JS quirk 使 !x 检查必要）
// 替代散落 50+ 处的 `!x || typeof x !== 'object'` 模式
function isObject(v) {
    return v !== null && typeof v === 'object';
}

// 【P2清理】删除 safeFloat / isPlainObject（全项目零调用，safeInt/isObject 仍在使用）

// 统一的 token 估算函数（与 game.js updateTokenCount 保持一致）
// 经验上中文 1.5 字符/token，英文 4 字符/token。统一取 1.7 字符/token
// 注意：函数名带 _Util 后缀，避免与 game.js 中的 estimateTokens 顶层声明冲突
function estimateTokensUtil(text) {
    return Math.ceil((text || '').length / 1.7);
}

// 估算一组消息的 token 数
// 注意：不缓存 message.content.length。字符串 .length 是 O(1) 属性访问，缓存无收益；
// 且代码中大量地方会原地修改 message.content（宏处理、加前缀、编辑消息等），缓存会导致 token 估算错误。
function estimateTokensForMessagesUtil(messages) {
    if (!messages) return 0;
    let total = 0;
    for (let i = 0; i < messages.length; i++) {
        total += (messages[i].content || '').length;
    }
    return Math.ceil(total / 1.7);
}

// ========================================
// 货币解析与 reconciliation 工具
// ========================================
const CurrencyReconciler = {
    // 中文数字映射
    _cnNums: {
        '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5,
        '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
        '百': 100, '千': 1000, '万': 10000, '亿': 100000000
    },

    // 中文数字串转阿拉伯数字（支持"二十""一百零五""两千"）
    chineseToNumber(str) {
        if (!str) return NaN;
        const s = String(str).trim();
        // 先尝试直接解析阿拉伯数字
        const direct = parseFloat(s);
        if (!isNaN(direct)) return direct;
        let total = 0;
        let section = 0;
        let number = 0;
        let secUnit = 1;
        let lastWasUnit = false;
        for (let i = s.length - 1; i >= 0; i--) {
            const c = s[i];
            const v = this._cnNums[c];
            if (v === undefined) continue;
            if (v >= 10) {
                if (number === 0) {
                    if (lastWasUnit) number = 1;
                    else number = 0;
                }
                section += number * v;
                number = 0;
                secUnit = v;
                lastWasUnit = true;
            } else {
                number = v;
                lastWasUnit = false;
            }
        }
        if (number > 0) section += number;
        total += section;
        return total;
    },

    // 从文本中提取金额与操作方向
    extractMoneyChanges(text) {
        if (!text) return [];
        const result = [];
        const lower = String(text).toLowerCase();
        // 模式：动词 + 数量 + 货币单位
        const patterns = [
            { regex: /(?:获得|得到|领取|收到|拿到|奖励|补贴|赠予|送|加|增加|入账)\s*([\d一二两三四五六七八九十百千万亿]+)\s*(?:枚|个|块|张|颗|把|件)?\s*(?:元|金币|块钱|现金|金钱|money|gold|灵石|银两|积分|信用点|星币)/gi, dir: 1 },
            { regex: /(?:花费|支付|付出|失去|扣除|消耗|花掉|用掉|减去|扣掉)\s*([\d一二两三四五六七八九十百千万亿]+)\s*(?:枚|个|块|张|颗|把|件)?\s*(?:元|金币|块钱|现金|金钱|money|gold|灵石|银两|积分|信用点|星币)/gi, dir: -1 },
            { regex: /([\d一二两三四五六七八九十百千万亿]+)\s*(?:枚|个|块|张|颗|把|件)?\s*(?:元|金币|块钱|现金|金钱|money|gold|灵石|银两|积分|信用点|星币)/gi, dir: 0 }
        ];
        patterns.forEach(function(p) {
            let m;
            while ((m = p.regex.exec(lower)) !== null) {
                const n = CurrencyReconciler.chineseToNumber(m[1]);
                if (!isNaN(n) && n > 0) {
                    result.push({ amount: n, dir: p.dir, raw: m[0] });
                }
            }
        });
        return result;
    },

    // 根据剧情文本与当前余额，推断新的余额
    reconcileFromStory(text, currentBalance) {
        const changes = this.extractMoneyChanges(text);
        if (changes.length === 0) return { balance: currentBalance, changed: false, changes: [] };
        const knownDir = changes.filter((c) => c.dir !== 0);
        if (knownDir.length > 0) {
            const delta = knownDir.reduce((sum, c) => sum + c.amount * c.dir, 0);
            return { balance: Math.max(0, currentBalance + delta), changed: true, changes: knownDir };
        }
        // 无法判断方向时，取最大金额作为兜底（通常剧情提到金钱奖励时金额最大）
        const maxAmount = changes.reduce((max, c) => Math.max(max, c.amount), 0);
        if (maxAmount > currentBalance) {
            return { balance: maxAmount, changed: true, changes: changes };
        }
        return { balance: currentBalance, changed: false, changes: [] };
    }
};

function safeSetItem(key, value) {
    try {
        const dataSize = (key.length + value.length) * 2;
        const capacity = StorageMonitor.checkCapacity();
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
// 【P2清理】删除 safeGetItem（与 Storage.get 实现逐字相同，全项目零调用）

// ========================================
// 【统一管理】Storage 命名空间：集中声明所有 localStorage key 常量
// 所有读写 localStorage 的代码都应通过 Storage.KEYS.XXX 引用 key，
// 避免拼写错误（之前 freeScript_ / free_script_ / fs_ 三种风格混用）
// ========================================
const Storage = {
    KEYS: {
        // —— API 配置与错误 ——
        API_CONFIG: 'free_script_api_config',          // API 端点配置（多槽位）
        API_ERRORS: 'free_script_api_errors',          // API 错误日志
        API_PRESETS: 'freeScript_apiPresets',          // API 预设组
        CURRENT_PARAMS: 'freeScript_currentParams',    // 当前生成参数
        // —— 存档 ——
        LOCAL_SAVES: 'freeScript_localSaves',          // IndexedDB 迁移后的存档索引
        LEGACY_SAVES: 'freeScript_saves',              // 旧版存档（迁移源）
        AUTO_SAVE_BACKUP: '__autoSaveBackup',          // beforeunload 备份
        IDB_MIGRATED: '_idb_migrated',                 // IndexedDB 迁移标记
        // —— 预设与设置 ——
        PRESETS: 'freeScript_presets',                 // 预设列表
        SETTINGS: 'freeScript_settings',               // 游戏设置
        LAST_PROMPT: 'freeScript_lastPrompt',          // 上次输入的 prompt
        THEME: 'freeScript_theme',                     // 主题
        LOG_LEVEL: 'free_script_log_level',            // 日志级别
        // —— 记忆与世界 ——
        MEMORY: 'freeScript_memory',                   // GameMemory 持久化
        ENHANCED_MEMORY: 'freeScript_enhancedMemory',  // 旧版 EnhancedMemory（迁移源）
        GLOBAL_VARS: 'fs_global_vars',                 // 全局变量
        WORLD_INFO: 'worldInfo',                       // 世界书
        // —— 正则与宏 ——
        PRESET_ALLOWED_REGEX: 'freeScript_presetAllowedRegex', // 预设允许的正则
        REGEX_SCRIPTS: 'freeScript_regexScripts'       // 正则脚本
    },
    // 读取（带默认值，吞异常）
    get(key, defaultValue) {
        try {
            const v = localStorage.getItem(key);
            return v !== null ? v : defaultValue;
        } catch (e) { return defaultValue; }
    },
    // 读取并 JSON.parse（带默认值，吞异常）
    getJSON(key, defaultValue) {
        try {
            const v = localStorage.getItem(key);
            return v !== null ? JSON.parse(v) : defaultValue;
        } catch (e) { return defaultValue; }
    },
    // 写入（走 safeSetItem，带容量检查）
    set(key, value) {
        return safeSetItem(key, value);
    },
    // 写入 JSON（自动 stringify）
    setJSON(key, value) {
        return safeSetItem(key, JSON.stringify(value));
    },
    // 删除
    remove(key) {
        try { localStorage.removeItem(key); } catch (e) {}
    }
};

const StorageMonitor = {
    DEFAULT_LIMIT: 5 * 1024 * 1024,
    MAX_LIMIT: 10 * 1024 * 1024,
    // 【性能优化】缓存容量检查结果，避免每次写入都遍历整个localStorage
    _capacityCache: null,
    _capacityCacheTime: 0,
    _CAPACITY_CACHE_TTL: 30000, // 30秒缓存
    getUsedSpace() {
        let used = 0;
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key) {
                    const value = localStorage.getItem(key);
                    used += (key.length + (value ? value.length : 0)) * 2;
                }
        }
} catch(e) {
Logger.error('计算localStorage使用量失败:', e.message);
}
return used;
},
// 【P2清理】删除 getRemainingSpace（全项目零调用，保留 checkCapacity/getUsedSpace/invalidateCache）
checkCapacity() {
    // 【性能优化】使用缓存的容量检查结果
    const now = Date.now();
    if (this._capacityCache && (now - this._capacityCacheTime < this._CAPACITY_CACHE_TTL)) {
        return this._capacityCache;
    }
    const used = this.getUsedSpace();
    const total = this._estimateTotalSpace();
    this._capacityCache = { used: used, total: total, percentage: (used / total) * 100 };
    this._capacityCacheTime = now;
    return this._capacityCache;
},
// 【性能优化】写入后使缓存失效
invalidateCache() {
    this._capacityCache = null;
    this._capacityCacheTime = 0;
},
// 【P2清理】删除 warnIfFull（全项目零调用）
_estimateTotalSpace() {
    const testKey = '__storage_test_' + Date.now();
    const testValue = 'x';
    try {
        let low = this.DEFAULT_LIMIT;
        let high = this.MAX_LIMIT;
        let mid;
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

const ThemeManager = {
    _current: 'light',

    init() {
        const saved = Storage.get(Storage.KEYS.THEME);
        if (saved === 'dark' || saved === 'light') {
            this._current = saved;
        } else {
            this._current = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        this.apply();
        this._updateStar();
        var self = this;
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
            if (!Storage.get(Storage.KEYS.THEME)) {
                self._current = e.matches ? 'dark' : 'light';
                self.apply();
                self._updateStar();
            }
        });
    },

    apply() {
        if (this._current === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
        }
    },

    _updateStar() {
        const star = document.getElementById('menuTopStar');
        if (!star) return;
        if (this._current === 'dark') {
            star.textContent = '☀';
            star.classList.add('dark-mode');
        } else {
            star.textContent = '★';
            star.classList.remove('dark-mode');
        }
    }
    // 【P2清理】删除 ThemeManager.toggle（与 toggleTheme 互相调用形成死循环，无外部入口）
};

(function() {
    const saved = Storage.get(Storage.KEYS.THEME);
    const isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
})();

// ========================================
// 【日志封装】统一日志入口，支持级别开关
// ========================================
// 用法：Logger.info('xxx') / Logger.warn('xxx') / Logger.error('xxx')
// 后续可平滑替换零散的 console.* 调用；不会影响线上默认行为。
// 通过 localStorage('free_script_log_level') 可临时调节：'debug' | 'info' | 'warn' | 'error'
const Logger = (function() {
    const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };
    function currentLevel() {
        try {
            const v = (typeof Storage !== 'undefined') ? Storage.get(Storage.KEYS.LOG_LEVEL) : null;
            if (v && LEVELS[v] !== undefined) return LEVELS[v];
        } catch (e) {}
        // 默认：线上静默 info，只保留 warn / error；用户手动改为 debug 即可看全部
        return LEVELS.warn;
    }
    function fmt() {
        const parts = [];
        for (let i = 0; i < arguments.length; i++) {
            const a = arguments[i];
            if (a instanceof Error) parts.push(a.message);
            else if (typeof a === 'object') {
                try { parts.push(JSON.stringify(a)); } catch (e) { parts.push(String(a)); }
            } else parts.push(String(a));
        }
        return parts.join(' ');
    }
    return {
        LEVELS: LEVELS,
        // 【P2清理】删除 debug/info/log/getLevel/setLevel（全项目零调用），保留 warn/error
        warn()  { if (currentLevel() <= LEVELS.warn)  { try { console.warn.apply(console,  ['[WRN]'].concat([].slice.call(arguments))); } catch(e) {} } },
        error() { try { console.error.apply(console, ['[ERR]'].concat([].slice.call(arguments))); } catch(e) {} }
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
const RenderCache = {
    _keys: {},
    same(name, key) {
        if (this._keys[name] === key) return true;
        return false;
    },
    mark(name, key) {
        this._keys[name] = key;
    }
    // 【P2清理】删除 invalidate（全项目零调用；存档切换/删除消息场景通过 RenderCache.mark 重写实现失效）
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
