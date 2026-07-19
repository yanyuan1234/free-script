/**
* 安全工具函数 - 2026-06-01
* 仅新增工具，不修改任何原有逻辑
*/

// 【冗余审计 P0-4】统一 max_tokens / context 默认值常量，消除 20+ 处硬编码
// 所有 fallback 用此常量，避免 8000/8192 混用导致行为不一致
// 【BUG-003 修复】从 16384 提升到 32768：JSON Schema 有 18 个 required 字段
// 故事正文（500-2000 字）+ 18 字段（角色/物品/任务/关系等）合计可能超过 16K tokens
// 提升到 32K 给足余量，避免 max_tokens 截断导致 JSON 解析失败
const DEFAULT_MAX_TOKENS = 32768;
// P1 修复 BUG-004 残留：原值 8192 与 core.js detectContextSize 兜底 32000 不一致
// 在 getContextSizeSafe() fallback 时会返回过小的 8192 导致上下文预算计算错误
// 统一为 32000，与 detectContextSize 内部兜底值一致
const DEFAULT_CONTEXT_SIZE = 32000;

const DOMCache = {
    _cache: {},
    _permanent: {},
    _maxAge: 30000,
    _maxSize: 100,
    get(id, permanent) {
        if (permanent && this._permanent[id]) return this._permanent[id];
        const c = this._cache[id];
        if (c && (Date.now() - c.t < this._maxAge)) {
            // [P2-4修复] 命中时刷新时间戳，实现 LRU 而非 FIFO，热点元素不被淘汰
            c.t = Date.now();
            return c.el;
        }
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

// [T2-P1-8] TimerManager 签名（setInterval/setTimeout 第一参数是 id）与浏览器原生 API 不同
// （原生是 (fn, delay)），这是项目内部设计：id 化管理避免漏 clear。
// 调用本 TimerManager 时如传错顺序会得到 setInterval(id, fn) 这种错误行为（fn 是 undefined）。
// 项目代码 grep 'TimerManager\\.set' 即可确认所有调用方都使用本封装
const TimerManager = {
    _intervals: {}, _timeouts: {},
    // 【第4轮优化】通用 try-catch 包装：避免回调抛错导致 setInterval 后续 tick 异常 / setTimeout 死记录残留
    setInterval(id, fn, delay) {
        this.clearInterval(id);
        this._intervals[id] = setInterval(function() {
            try { fn(); } catch (e) { console.error('[TimerManager interval ' + id + ']', e); }
        }, delay);
    },
    setTimeout(id, fn, delay) {
        this.clearTimeout(id);
        var self = this;
        this._timeouts[id] = setTimeout(function() {
            try { fn(); } catch (e) { console.error('[TimerManager timeout ' + id + ']', e); }
            delete self._timeouts[id];
        }, delay);
    },
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

// ========================================
// 全局 a11y 事件委托（P1-PU15）
// ========================================
// 1. 所有 role="button" 元素在键盘 Enter/Space 时触发 click
// 2. 所有 data-action="funcName" + data-args="..." 元素被 click 时调用 window[funcName](...args)
// 这样不用挨个替换内联 onclick，只需要在生成 HTML 时加 role/data-action
// 即可同时获得鼠标点击、键盘 Enter/Space、屏幕阅读器可达。
function _globalA11yDelegate(e) {
    var t = e.target;
    if (!t || t.nodeType !== 1) return;
    // 键盘 Enter/Space → 触发 click（仅对 role=button 的元素）
    if (e.type === 'keydown' && (e.key === 'Enter' || e.key === ' ')) {
        var roleEl = t.closest && t.closest('[role="button"]:not([role-bound])');
        if (roleEl && !roleEl.disabled) {
            e.preventDefault();
            roleEl.click();
        }
        return;
    }
    // click → data-action 委托
    if (e.type === 'click') {
        var actEl = t.closest && t.closest('[data-action]');
        if (actEl) {
            var action = actEl.getAttribute('data-action');
            var argsAttr = actEl.getAttribute('data-args');

            // 这样 HTML 可保持 kebab-case 约定，JS 函数名保持 camelCase 约定，无需特殊路由表。
            // 无连字符的 action 名（如 openForumPost）不受影响。
            var fnName = action.replace(/-([a-z])/g, function(m, c) { return c.toUpperCase(); });
            var fn = window[fnName];
            if (typeof fn === 'function') {
                e.preventDefault();
                try {
                    if (argsAttr == null || argsAttr === '') {
                        fn.call(actEl);
                    } else {
                        // 解析 JSON 数组作为参数（支持 string/number/null/object）
                        var parsed = JSON.parse(argsAttr);
                        if (!Array.isArray(parsed)) parsed = [parsed];
                        fn.apply(actEl, parsed);
                    }
                } catch (err) {
                    console.error('[a11y-delegate] ' + action + ' 执行失败:', err);
                }
            } else {
                console.warn('[a11y-delegate] 全局函数不存在: ' + action);
            }
        }
    }
}
if (typeof document !== 'undefined') {
    GlobalCleanup.registerListener(document, 'keydown', _globalA11yDelegate);
    GlobalCleanup.registerListener(document, 'click', _globalA11yDelegate);
}

// escapeHTML / sanitizeHTML 已统一到 core.js 的 escapeHtml，此处不再重复定义


// 保留 getContextScale（被多处使用）

// ========================================
// 动态截断策略：根据模型 contextSize 自动调整截断长度
// ========================================
// 核心思路：context 越大，截断越宽松；context 越小，截断越激进
// 基准值以 8K context 为1.0x，按比例缩放，无上限
// 8K→1x, 32K→4x, 128K→16x, 256K→32x, 512K→64x, 1M→128x


// 原问题：同一语义（模型上下文窗口大小）被 gameState.contextSize 与 StateManager.get('world.contextSize')
// 两个真相源承载，各读取点 fallback 不一致（8000 vs 8192 vs 动态探测）。
// 统一入口：优先 StateManager（权威源），回落 legacy gameState，最后兜底 8000。
function getContextSize() {
    if (typeof StateManager !== 'undefined' && StateManager.get) {
        var v = StateManager.get('world.contextSize');
        if (typeof v === 'number' && v > 0) return v;
    }
    if (typeof gameState !== 'undefined' && gameState && gameState.contextSize) {
        var n = Number(gameState.contextSize);
        if (!isNaN(n) && n > 0) return n;
    }
    // 【冗余审计 P0-4】统一用 DEFAULT_CONTEXT_SIZE 常量（原硬编码 8000）
    return DEFAULT_CONTEXT_SIZE;
}

// 【冗余审计 P1-5】统一 getContextSize 调用入口
// 原本 7+ 处重复 (typeof getContextSize === 'function') ? getContextSize() : ((gameState && gameState.contextSize) || 8000)
// 收敛为单点：utils.js 必然先加载，但保留 typeof 防御；fallback 直接用 DEFAULT_CONTEXT_SIZE
// 调用方可直接信任返回值有效，无需再做 isNaN / <= 0 检查
function getContextSizeSafe() {
    return (typeof getContextSize === 'function') ? getContextSize() : DEFAULT_CONTEXT_SIZE;
}

// 【冗余审计 P1-7】统一 "current/total" 进度解析
// 原本 4 处散落重复 String(progress).split('/') + safeInt + 兜底逻辑
// 收敛为单点：返回 {current, total}，调用方按需取用
// - quest-mutator._parseProgressParts 委托此函数
// - systems.parseProgress 基于此算百分比
// - systems.advanceGuidanceQuest / 渲染进度条 直接调用
function parseProgressParts(progress) {
    if (!progress) return { current: 0, total: 1 };
    var parts = String(progress).split('/');
    if (parts.length === 2) {
        return { current: safeInt(parts[0], 0), total: safeInt(parts[1], 1) };
    }
    // 纯数字视为 current
    var n = parseInt(progress, 10);
    return { current: isNaN(n) ? 0 : n, total: 1 };
}

// 【冗余审计 P1-6】统一 deepClone 调用入口
// 原本 3 处散落重复 (typeof StateSchema !== 'undefined' && StateSchema.deepClone) ? ... : JSON.parse(JSON.stringify(...))
// 收敛为单点：优先 StateSchema.deepClone（过滤危险键，防原型污染）→ structuredClone（支持循环引用）→ JSON.parse 兜底
// utils.js 最先加载，定义时 StateSchema 未定义，但函数运行时调用 StateSchema 已存在
function safeDeepClone(o) {
    if (typeof StateSchema !== 'undefined' && StateSchema.deepClone) {
        try { return StateSchema.deepClone(o); } catch (e) { /* 含循环引用，走 fallback */ }
    }
    if (typeof structuredClone === 'function') {
        try { return structuredClone(o); } catch (e) { /* 循环引用，走 fallback */ }
    }
    try { return JSON.parse(JSON.stringify(o)); } catch (e) {
        throw new Error('[safeDeepClone] 深拷贝失败（含循环引用且无 JSON 兼容）：' + (e && e.message));
    }
}

function getContextScale() {
    // 【冗余审计 P0-4】scale 基准统一用常量（原硬编码 8000）
    return Math.max(0.5, getContextSize() / DEFAULT_CONTEXT_SIZE);
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
// 注意：parseInt 会吞掉起始数字后的非数字字符，如 safeInt("123abc") → 123
// 若需严格校验（拒绝非纯数字输入），请在调用方前置 /^-?\d+$/ 正则检查
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


// 统一的 token 估算函数（P1 精确化）
// [P1 升级] 优先使用 Tokenizer（按模型自适应权重 + 高频 BPE token 优化）
// Tokenizer 不可用时回退到字符估算（兼容性兜底）
// 误差：Tokenizer ±8%，字符估算 ±15%
// 注意：函数名带 _Util 后缀，避免与 game.js 中的 estimateTokens 顶层声明冲突
function estimateTokensUtil(text) {
    if (!text) return 0;
    // 优先用真实 Tokenizer
    if (typeof Tokenizer !== 'undefined' && Tokenizer.count) {
        try {
            return Tokenizer.count(text);
        } catch (e) {
            console.warn('[estimateTokensUtil] Tokenizer 计数失败，回退字符估算:', e);
        }
    }
    // 回退：字符估算（与旧实现一致）
    var s = String(text);
    var len = s.length;
    if (len === 0) return 0;
    var cjk = 0, ascii = 0, punct = 0, space = 0;
    for (var i = 0; i < len; i++) {
        var c = s.charCodeAt(i);
        if (c >= 0x4E00 && c <= 0x9FFF || c >= 0x3400 && c <= 0x4DBF || c >= 0x3000 && c <= 0x30FF || c >= 0xAC00 && c <= 0xD7AF) {
            cjk++;
        } else if (c < 128) {
            if (c === 32 || c === 9 || c === 10 || c === 13) {
                space++;
            } else if (c >= 48 && c <= 57 || c >= 65 && c <= 90 || c >= 97 && c <= 122) {
                ascii++;
            } else {
                punct++;
            }
        } else {
            punct++;
        }
    }
    return Math.ceil(cjk * 1.5 + ascii / 4 + punct + space / 4);
}

// 估算一组消息的 token 数
// [P3] 改进：加上 message overhead（每条消息的 role 标签和结构约 4 token）
// 注意：不缓存 message.content.length。字符串 .length 是 O(1) 属性访问，缓存无收益；
// 且代码中大量地方会原地修改 message.content（宏处理、加前缀、编辑消息等），缓存会导致 token 估算错误。
function estimateTokensForMessagesUtil(messages) {
    if (!messages) return 0;
    var total = 0;
    for (var i = 0; i < messages.length; i++) {
        total += estimateTokensUtil(messages[i].content || '');
        total += 4; // message overhead: role 标签 + 结构分隔
    }
    return total;
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

checkCapacity() {

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

invalidateCache() {
    this._capacityCache = null;
    this._capacityCacheTime = 0;
},

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


// init.js:13-30 已有功能更完整的版本（含 IMG/LINK/SCRIPT 资源错误过滤 + UI.toast + capture 阶段），
// 两处同时注册会导致每次未捕获错误触发 2 条 console.error + 最多 2 个 toast。
// 统一保留 init.js 版本，此处不再重复注册。

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
        // [T2-P1-1] 补回 debug() 和 info() 方法（之前只有 warn/error）
        // 默认级别 LEVELS.warn，debug/info 调用会因 currentLevel 过滤而不输出（线上静默）
        // 用户在控制台执行 localStorage.setItem('free_script_log_level','debug') 即可看全部
        debug() { if (currentLevel() <= LEVELS.debug) { try { console.debug.apply(console, ['[DBG]'].concat([].slice.call(arguments))); } catch(e) {} } },
        info()  { if (currentLevel() <= LEVELS.info)  { try { console.info.apply(console,  ['[INF]'].concat([].slice.call(arguments))); } catch(e) {} } },
        warn()  { if (currentLevel() <= LEVELS.warn)  { try { console.warn.apply(console,  ['[WRN]'].concat([].slice.call(arguments))); } catch(e) {} } },
        error() { try { console.error.apply(console, ['[ERR]'].concat([].slice.call(arguments))); } catch(e) {} }
    };
})();

// ========================================

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

};


// 返回 true 表示应跳过渲染（数据未变化，DOM 仍保留上次的 HTML）
// 返回 false 表示应继续渲染
function shouldSkipPageRender(pageName, dataKey) {
    if (typeof RenderCache === 'undefined') return false;
    if (RenderCache.same(pageName, dataKey)) return true;
    RenderCache.mark(pageName, dataKey);
    return false;
}


// ========================================
// bindFresh：通用一次性事件绑定（替代 cloneNode + replaceChild + addEventListener 三步反模式）
// 阶段1：showApiDetail 等 13 处 cloneNode 模式统一替换
// ========================================
/**
 * 一次性绑定事件：
 * 1. 每次绑定前先 removeEventListener 旧 listener（用节点自定义属性 _handler_<event> 持有引用）
 * 2. 然后 addEventListener 新 listener
 * 3. 内联 onclick 一次性调用
 *
 * @param {HTMLElement|string} elOrId 元素或元素 id
 * @param {string} event 事件名（不含 on）
 * @param {Function} handler 事件 handler
 * @param {string} [refKey] 节点属性 key，默认 '_handler_' + event
 * @returns {HTMLElement|null} 元素
 */
function bindFresh(elOrId, event, handler, refKey) {
    var el = (typeof elOrId === 'string') ? document.getElementById(elOrId) : elOrId;
    if (!el) return null;
    var key = refKey || ('_handler_' + event);
    if (el[key]) {
        el.removeEventListener(event, el[key]);
        // 【第5轮优化】同步从 GlobalCleanup 注销旧 handler，保持收口一致
        if (typeof GlobalCleanup !== 'undefined' && GlobalCleanup._listeners) {
            for (var i = 0; i < GlobalCleanup._listeners.length; i++) {
                var _L = GlobalCleanup._listeners[i];
                if (_L.target === el && _L.type === event && _L.handler === el[key]) {
                    GlobalCleanup._listeners.splice(i, 1);
                    break;
                }
            }
        }
    }
    el[key] = handler;
    // 【第5轮优化】走 GlobalCleanup 统一注册，与 bindEvent 保持一致，避免内存泄漏
    if (typeof GlobalCleanup !== 'undefined' && GlobalCleanup.registerListener) {
        GlobalCleanup.registerListener(el, event, handler);
    } else {
        el.addEventListener(event, handler);
    }
    return el;
}

if (typeof window !== 'undefined') window.bindFresh = bindFresh;
if (typeof module !== 'undefined' && module.exports) module.exports.bindFresh = bindFresh;

// ========================================
// parseTheaterItems：通用小剧场 HTML 解析器
// 阶段1：8 个 parse*Content 函数（core.js:3562-3707）合并为单一函数
// ========================================

// [M-4] 按 schema 对象缓存编译后的正则，避免每次解析小剧场都重新 new RegExp
//（长剧情 30+ 节点时重复编译明显卡顿）。schema 在运行期固定，WeakMap 不会阻止 gc。
var _theaterRegexCache = new WeakMap();
/**
 * 解析小剧场 HTML：提取 <div class="itemClass"> 项，按 fieldSchema 提取子字段
 *
 * 旧实现：8 个函数 (parseForumContent/parseChatContent/parseMailContent/parseShopContent/
 * parseMomentsContent/parseItemsContent/parseDiaryContent/parseCalendarContent)
 * 各自重复"正则抓类名 + map + filter"模式 60+ 行
 *
 * 新实现：声明式 schema 描述：
 *   itemClass: 'post'           // 顶层 div class
 *   fields: { author: 'author', content: 'content', ... }  // 子字段 class → 字段名
 *   defaults: { author: '匿名', content: '' }  // 缺失字段默认值
 *   transformers: { time: 'dateOrNow', likes: 'int', count: 'int' }  // 字段转换器
 *   mapResult: function(parts, rawHtml) { return { ... }; }  // 自定义结果映射
 *
 * @param {string} html 待解析 HTML
 * @param {object} schema 见上
 * @returns {Array} 解析结果数组
 */
function parseTheaterItems(html, schema) {
    if (!html || !schema || !schema.itemClass) return [];
    var itemClass = schema.itemClass;
    var fields = schema.fields || {};
    var defaults = schema.defaults || {};
    var transformers = schema.transformers || {};
    var mapResult = schema.mapResult;
    var fallback = schema.fallback;

    var items = [];

    // [M-4] 优先从缓存取编译后的正则，避免每次调用都重新编译
    var cached = _theaterRegexCache.get(schema);
    if (!cached) {
        cached = {};
        // 抓所有 class=itemClass 的 div
        cached.itemRe = new RegExp('<div[^>]*class=["\']' + itemClass + '["\'][^>]*>([\\s\\S]*?)<\\/div>', 'gi');
        // multiline/body 字段用 [\s\S]*?</div> 抓取；普通字段用 [^<]+ 抓取
        cached.fieldRegexes = {};
        var multilineFields = schema.multilineFields || [];
        Object.keys(fields).forEach(function (fieldName) {
            var className = fields[fieldName];
            var isMultiline = multilineFields.indexOf(fieldName) >= 0;
            cached.fieldRegexes[fieldName] = isMultiline
                ? new RegExp('class=["\']' + className + '["\'][^>]*>([\\s\\S]*?)<\\/div>', 'i')
                : new RegExp('class=["\']' + className + '["\'][^>]*>([^<]+)', 'i');
        });
        _theaterRegexCache.set(schema, cached);
    }
    var re = cached.itemRe;
    var fieldRegexes = cached.fieldRegexes;
    var matches = html.match(re) || [];

    matches.forEach(function (match) {
        var parts = {};
        Object.keys(fields).forEach(function (fieldName) {
            var value = (match.match(fieldRegexes[fieldName]) || [])[1];
            // 字段转换器
            var tf = transformers[fieldName];
            if (tf === 'int') value = parseInt(value, 10) || defaults[fieldName] || 0;
            else if (tf === 'intOrDef') value = parseInt(value, 10) || defaults[fieldName] || 0;
            else if (tf === 'dateOrNow') value = value ? (Date.parse(value) || Date.now()) : Date.now();
            else if (tf === 'stripTags') value = value ? value.replace(/<[^>]+>/g, '') : (defaults[fieldName] || '');
            else if (value === undefined) value = defaults[fieldName] || '';
            parts[fieldName] = value;
        });
        if (mapResult) items.push(mapResult(parts, match));
        else items.push(parts);
    });

    if (items.length === 0 && fallback) {
        items.push(fallback(html));
    }
    return items;
}

if (typeof window !== 'undefined') window.parseTheaterItems = parseTheaterItems;
if (typeof module !== 'undefined' && module.exports) module.exports.parseTheaterItems = parseTheaterItems;

// ========================================
// 正则安全检测 - RegexSafetyChecker
// 统一 ReDoS 防护入口，合并 worldinfo.js 与 regex-manager.js 两处独立实现
// ========================================
const RegexSafetyChecker = {
    // 正则长度上限（超出直接判为不安全）
    MAX_LENGTH: 1000,
    // 量词数量上限（嵌套量词场景下，量词总数超此值判为不安全）
    MAX_QUANTIFIERS: 3,
    // 已知危险模式列表（来自原 regex-manager.js）
    _DANGEROUS_PATTERNS: [
        /\((\([^()]*\)|[^()]*)*\+/,      // 嵌套量词 (a+)+
        /\([^)]*\)\{[^}]*\}\{[^}]*\}/,   // 嵌套量词 (a){n}{m}
        /(\.\*|\.\+)[\*\+\?]\*[\*\+\?]/, // 连续量词 .*+*+
        /\(\.\*\)\+/,                     // (.*)+
        /\(\.\+\)\+/                      // (.+)+
    ],
    // 嵌套量词检测正则（来自原 worldinfo.js）
    _NESTED_QUANTIFIER_RE: /(\(.+\)[+*?])+|(\[.+\][+*?])+|(\{.+\}[+*?])+/,

    // 检测正则是否安全，返回 true 表示安全可用
    isSafe(pattern) {
        if (typeof pattern !== 'string' || pattern.length === 0) return true;
        if (pattern.length > this.MAX_LENGTH) return false;
        // 危险模式命中任一即不安全
        for (var i = 0; i < this._DANGEROUS_PATTERNS.length; i++) {
            if (this._DANGEROUS_PATTERNS[i].test(pattern)) return false;
        }
        // 嵌套量词 + 量词总数超阈值
        if (this._NESTED_QUANTIFIER_RE.test(pattern) &&
            (pattern.match(/[+*?]/g) || []).length > this.MAX_QUANTIFIERS) {
            return false;
        }
        return true;
    }
};
if (typeof window !== 'undefined') window.RegexSafetyChecker = RegexSafetyChecker;

// ========================================
// 【第八轮复审 BUG-001 P0 修复 7.1+7.2】安全正则包装器
// 背景：第八轮复审确认二次生成仍冻结 215s+，根因是内部正则（_reStyleBlock/_reDivBlock/
//   _reCotTags/_reDecorTags/_processScopedConditionals）无超时保护。
// RegexManager 的 2s/5s 超时仅覆盖用户正则脚本，内部正则不受保护。
//
// 双层保护机制：
// 1. 回调超时检测：把字符串替换等价为回调替换，每 256 次匹配后检查时间，超时则抛出异常中断
//    —— 应对"匹配数量极大但非灾难性回溯"场景（可中断）
// 2. 整体耗时日志：包装整个 replace 调用，超过 logThreshold 时打印 [SafeRegex] 耗时日志
//    —— 应对"灾难性回溯"场景（单次 exec 内部 C++ 层回溯，回调无法中断，但日志可定位）
//
// 已知限制：String.replace 的回调在正则引擎 C++ 层运行时无法中断灾难性回溯，
//   此 wrapper 主要价值是：(a) 中断"大量匹配"耗时；(b) 通过日志定位灾难性回溯来源。
//   真正的根因解决需将正则移入 Worker（第七/八轮报告 7.3 建议）。
// ========================================

/**
 * 安全正则替换包装器
 * @param {RegExp} regex 正则对象（建议带 gi 标志）
 * @param {string} text 待处理文本
 * @param {string|Function} [replacement=''] 替换字符串或函数
 * @param {object} [opts] 选项
 *   - {number} timeoutMs=2000 单次调用软超时（超时则返回原文）
 *   - {string} tag='' 日志标签（建议传正则名，如 '_reStyleBlock'）
 *   - {number} logThreshold=100 超过此毫秒数才打印耗时日志
 * @returns {string} 处理后文本；超时或异常时返回原文
 */
function safeRegexApply(regex, text, replacement, opts) {
    if (text == null || typeof text !== 'string' || text.length === 0) return text;
    if (!regex || !(regex instanceof RegExp)) return text;

    opts = opts || {};
    var timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : 2000;
    var tag = opts.tag || (regex.source || '').substring(0, 60);
    var logThreshold = opts.logThreshold != null ? opts.logThreshold : 100;

    if (replacement === undefined) replacement = '';
    if (regex.global) regex.lastIndex = 0;

    var startTime = Date.now();
    var matchCount = 0;
    var timedOut = false;

    // 把字符串替换转换为回调替换，以便在每次匹配后检查时间
    var origReplFn = (typeof replacement === 'function') ? replacement : null;
    var replStr = (typeof replacement === 'string') ? replacement : '';
    var wrappedRepl = function() {
        matchCount++;
        // 每 256 次匹配检查一次时间（避免每次匹配都 Date.now() 的开销）
        if ((matchCount & 255) === 0 && Date.now() - startTime > timeoutMs) {
            timedOut = true;
            throw new Error('SAFE_REGEX_TIMEOUT_CALLBACK');
        }
        return origReplFn ? origReplFn.apply(this, arguments) : replStr;
    };

    try {
        var result = text.replace(regex, wrappedRepl);
        var elapsed = Date.now() - startTime;
        if (elapsed >= logThreshold) {
            console.log('[SafeRegex] 耗时 ' + elapsed + 'ms (tag=' + tag
                + ', inLen=' + text.length + ', matches=' + matchCount + ')');
        }
        return result;
    } catch (e) {
        var elapsedErr = Date.now() - startTime;
        if (timedOut || (e && e.message === 'SAFE_REGEX_TIMEOUT_CALLBACK')) {
            console.warn('[SafeRegex] 超时返回原文, tag=' + tag
                + ', elapsed=' + elapsedErr + 'ms/' + timeoutMs + 'ms'
                + ', matches=' + matchCount + ', inLen=' + text.length);
            return text;
        }
        console.warn('[SafeRegex] 异常 tag=' + tag
            + ', err=' + (e && e.message ? e.message : String(e))
            + ', elapsed=' + elapsedErr + 'ms');
        return text;
    }
}
if (typeof window !== 'undefined') window.safeRegexApply = safeRegexApply;

/**
 * 安全 exec 循环：收集所有匹配（替代 while (regex.exec(text)) 模式）
 * 注意：exec 循环本身是线性 O(matches)，但单次 exec 内部可能灾难性回溯。
 * 此函数提供：(a) 每 256 次匹配的软超时；(b) 整体耗时日志用于定位慢 exec。
 * @param {RegExp} regex 正则对象（必须带 g 标志）
 * @param {string} text 待匹配文本
 * @param {object} [opts] 选项 { timeoutMs=2000, tag='', logThreshold=100 }
 * @returns {Array<Array>} 匹配项数组（每个元素是 exec 的返回值）；超时返回已收集的部分
 */
function safeRegexExecAll(regex, text, opts) {
    if (!text || typeof text !== 'string' || !regex || !regex.global) return [];
    opts = opts || {};
    var timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : 2000;
    var tag = opts.tag || (regex.source || '').substring(0, 60);
    var logThreshold = opts.logThreshold != null ? opts.logThreshold : 100;

    regex.lastIndex = 0;
    var startTime = Date.now();
    var matches = [];
    var m;
    while ((m = regex.exec(text)) !== null) {
        matches.push(m);
        if ((matches.length & 255) === 0 && Date.now() - startTime > timeoutMs) {
            console.warn('[SafeRegex.exec] 超时(' + (Date.now() - startTime) + 'ms/' + timeoutMs
                + 'ms), tag=' + tag + ', matches=' + matches.length);
            break;
        }
        // 防御零宽匹配导致 lastIndex 不前进
        if (m.index === regex.lastIndex) regex.lastIndex++;
    }
    var elapsed = Date.now() - startTime;
    if (elapsed >= logThreshold) {
        console.log('[SafeRegex.exec] 耗时 ' + elapsed + 'ms (tag=' + tag
            + ', inLen=' + text.length + ', matches=' + matches.length + ')');
    }
    return matches;
}
if (typeof window !== 'undefined') window.safeRegexExecAll = safeRegexExecAll;


// ========================================
// 【P0 根因修复】线性时间标签扫描器
// 替代 /<(tag)[\s\S]+?<\/\1>/gi 等灾难性回溯正则
// 复杂度严格 O(n)，使用 indexOf 线性搜索，无回溯，不会冻结主线程
// ========================================

/**
 * 线性扫描配对标签：提取或移除 <tag>...</tag> 内容
 * 替代正则 /<(tag)[\s\S]*?<\/\1>/gi，避免灾难性回溯
 * @param {string} text 待处理文本
 * @param {string[]} tagNames 要匹配的标签名列表（不区分大小写）
 * @param {string} mode 'extract' 返回匹配数组；'strip' 返回移除标签后的文本
 * @returns {Array|string} extract 模式返回 [{content, fullMatch, tagName}]；strip 模式返回 string
 */
function scanPairedTags(text, tagNames, mode) {
    if (!text || typeof text !== 'string' || !tagNames || !tagNames.length) {
        return mode === 'extract' ? [] : (text || '');
    }
    // 构建标签名查找表（小写）
    var tagSet = {};
    var tagLen = {};  // 标签名长度
    for (var i = 0; i < tagNames.length; i++) {
        var tn = String(tagNames[i]).toLowerCase();
        tagSet[tn] = true;
        tagLen[tn] = tn.length;
    }

    var results = (mode === 'extract') ? [] : null;
    var segments = (mode === 'strip') ? [] : null;  // 文本片段
    var pos = 0;
    var len = text.length;

    while (pos < len) {
        // 线性查找下一个 '<'
        var ltIdx = text.indexOf('<', pos);
        if (ltIdx === -1) {
            if (segments) segments.push(text.slice(pos));
            break;
        }

        // 解析标签名：< 后面的字母/数字/下划线
        var afterLt = ltIdx + 1;
        if (afterLt >= len) {
            if (segments) segments.push(text.slice(pos));
            break;
        }
        var c = text.charCodeAt(afterLt);
        // 标签名首字符：a-z A-Z _ 或中文字符
        var isNameStart = (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || (c >= 0x4e00 && c <= 0x9fff);
        if (!isNameStart) {
            // 不是标签开头，跳过这个 '<'
            if (segments) segments.push(text.slice(pos, ltIdx + 1));
            pos = ltIdx + 1;
            continue;
        }

        // 提取标签名
        var nameEnd = afterLt;
        while (nameEnd < len) {
            var cc = text.charCodeAt(nameEnd);
            if ((cc >= 97 && cc <= 122) || (cc >= 65 && cc <= 90) || (cc >= 48 && cc <= 57) || cc === 95 || cc === 45 || (cc >= 0x4e00 && cc <= 0x9fff)) {
                nameEnd++;
            } else {
                break;
            }
        }
        var rawTagName = text.slice(afterLt, nameEnd);
        var tagName = rawTagName.toLowerCase();

        if (!tagSet[tagName]) {
            // 不是目标标签，保留原样
            if (segments) segments.push(text.slice(pos, ltIdx + 1));
            pos = ltIdx + 1;
            continue;
        }

        // 找到开标签，找 '>' 结束开标签
        var tagCloseIdx = text.indexOf('>', nameEnd);
        if (tagCloseIdx === -1) {
            // 没有闭合 '>'，按未闭合处理
            if (segments) segments.push(text.slice(pos, ltIdx));  // 保留 '<' 之前的文本
            pos = ltIdx + 1;  // 跳过 '<'，保留后面内容
            continue;
        }

        // 开标签范围：ltIdx .. tagCloseIdx（含 '>'）
        var contentStart = tagCloseIdx + 1;

        // 线性搜索闭合标签 </tagName>
        var closeTagStr = '</' + rawTagName;
        var closeIdx = text.indexOf(closeTagStr, contentStart);
        if (closeIdx === -1) {
            // 未闭合标签：移除开标签，保留内容（避免内容丢失）
            if (segments) segments.push(text.slice(pos, ltIdx));
            pos = contentStart;  // 跳过开标签，保留内容
            continue;
        }

        // 验证闭合标签后紧跟 '>' 或空白+'>'（避免 </thinkingx> 误匹配）
        var afterCloseTag = closeIdx + closeTagStr.length;
        var closeGtIdx = -1;
        if (afterCloseTag < len && text.charCodeAt(afterCloseTag) === 62) {  // '>'
            closeGtIdx = afterCloseTag;
        } else if (afterCloseTag < len && (text.charCodeAt(afterCloseTag) === 32 || text.charCodeAt(afterCloseTag) === 9 || text.charCodeAt(afterCloseTag) === 10 || text.charCodeAt(afterCloseTag) === 13)) {
            // 空白后找 '>'
            closeGtIdx = text.indexOf('>', afterCloseTag);
            if (closeGtIdx === -1 || closeGtIdx > afterCloseTag + 20) {
                // 太远或没找到，可能是误匹配
                closeGtIdx = -1;
            }
        }
        if (closeGtIdx === -1) {
            // 闭合标签格式不对，按未闭合处理
            if (segments) segments.push(text.slice(pos, ltIdx));
            pos = contentStart;
            continue;
        }

        // 完整匹配：ltIdx .. closeGtIdx（含 '>'）
        var content = text.slice(contentStart, closeIdx);
        var fullMatch = text.slice(ltIdx, closeGtIdx + 1);

        if (results) {
            results.push({ content: content, fullMatch: fullMatch, tagName: tagName });
        }
        if (segments) {
            segments.push(text.slice(pos, ltIdx));  // 标签前的文本
        }
        pos = closeGtIdx + 1;  // 跳过整个标签对
    }

    if (segments) return segments.join('');
    return results;
}
if (typeof window !== 'undefined') window.scanPairedTags = scanPairedTags;

/**
 * 线性扫描标记对：提取或移除 💭...💭 等非 XML 标记内容
 * 替代正则 /💭[\s\S]+?💭/gi，避免灾难性回溯
 * @param {string} text 待处理文本
 * @param {string} marker 标记字符串（如 '💭'）
 * @param {string} mode 'extract' 或 'strip'
 * @returns {Array|string}
 */
function scanMarkerPairs(text, marker, mode) {
    if (!text || typeof text !== 'string' || !marker) {
        return mode === 'extract' ? [] : (text || '');
    }
    var markerLen = marker.length;
    var results = (mode === 'extract') ? [] : null;
    var segments = (mode === 'strip') ? [] : null;
    var pos = 0;
    var len = text.length;

    while (pos < len) {
        var openIdx = text.indexOf(marker, pos);
        if (openIdx === -1) {
            if (segments) segments.push(text.slice(pos));
            break;
        }
        var contentStart = openIdx + markerLen;
        var closeIdx = text.indexOf(marker, contentStart);
        if (closeIdx === -1) {
            // 未闭合标记：保留开标记，继续搜索
            if (segments) segments.push(text.slice(pos, openIdx + markerLen));
            pos = openIdx + markerLen;
            continue;
        }
        var content = text.slice(contentStart, closeIdx);
        var fullMatch = text.slice(openIdx, closeIdx + markerLen);
        if (results) results.push({ content: content, fullMatch: fullMatch });
        if (segments) segments.push(text.slice(pos, openIdx));
        pos = closeIdx + markerLen;
    }
    if (segments) return segments.join('');
    return results;
}
if (typeof window !== 'undefined') window.scanMarkerPairs = scanMarkerPairs;

/**
 * 便捷函数：移除配对标签（替代 safeRegexApply(regex, text, '')）
 * @param {string} text
 * @param {string[]} tagNames
 * @returns {string} 移除标签后的文本
 */
function stripPairedTags(text, tagNames) {
    return scanPairedTags(text, tagNames, 'strip');
}
if (typeof window !== 'undefined') window.stripPairedTags = stripPairedTags;

/**
 * 便捷函数：提取配对标签内容（替代 safeRegexExecAll(regex, text)）
 * 返回格式与 execAll 兼容：每个元素含 [2]=content 字段
 * @param {string} text
 * @param {string[]} tagNames
 * @returns {Array} [{content, fullMatch, tagName}]
 */
function extractPairedTags(text, tagNames) {
    return scanPairedTags(text, tagNames, 'extract');
}
if (typeof window !== 'undefined') window.extractPairedTags = extractPairedTags;
