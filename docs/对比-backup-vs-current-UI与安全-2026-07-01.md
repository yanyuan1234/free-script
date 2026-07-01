# Free-Script 对比审查报告：backup vs current

> **目标**：以 `backup/index.html`（参考基线）为参照，找出 `js/phone-ui.js + js/utils.js + js/init.js` 中"改坏"或"未保留 backup 优秀实现"的部分。
>
> **报告日期**：2026-07-02
> **范围**：UI 工具函数 / XSS 安全 / 事件系统 / 酒馆模拟子系统

---

## 0. 总体评价

| 子系统 | backup 状态 | current 状态 | 评价 |
|---|---|---|---|
| UI 工具函数（DOMCache/Logger/TimerManager） | 简洁集中 | 较复杂、丢方法 | **部分回归** |
| XSS 防护（escapeHtml/sanitizeHtml） | 简单 regex 过滤 | DOMParser + 白名单 | **current 反而更优** |
| debounce/throttle/safeExecute/safeGetItem | 全部存在 | **全部丢失** | **严重回归** |
| 错误监听 | 简单 console | 增强（UI.toast + capture） | **current 更优** |
| 模态对话框（showConfirm/showPrompt） | cloneNode + replaceChild | 用 `_handler/_resolve` 缓存 | **各有优劣** |
| 模态 `cloneNode` 反模式 | 4 处 | 18+ 处 | **current 残留更多** |
| 事件委托（data-action） | 分散 onclick | utils.js 统一 + a11y | **current 更优** |
| 酒馆 API（SillyTavern） | 完整 | 几乎一致 | **持平** |
| toastr 通知系统 | 4 种 type + 颜色 + 动画 | 全部退化为 `UI.toast` | **严重降级** |
| gameState 初始化 | 顶层 IIFE | init.js IIFE | **持平** |
| `bindFresh` 工具 | 不存在 | utils.js 新增 | **current 优秀添加**（但未全面落地） |
| `parseTheaterItems` 工具 | 不存在 | utils.js 新增 | **current 优秀添加** |
| `a11y` 事件委托 | 不存在 | utils.js 新增 | **current 优秀添加** |

---

## 1. UI 工具函数

### 1.1 DOMCache — 丢失 `query` 方法

**backup**（`backup/index.html:6566-6583`）

```js
const DOMCache = {
    _cache: {}, _maxAge: 5000,
    get(id) { /* document.getElementById */ },
    query(sel) { /* document.querySelector */ },   // ← 关键：CSS 选择器
    clear() { this._cache = {}; }
};
```

**current**（`js/utils.js:5-36`）

```js
const DOMCache = {
    _cache: {}, _permanent: {}, _maxAge: 30000, _maxSize: 100,
    get(id, permanent) { /* document.getElementById */ },  // ← 多了 permanent 标志
    // 缺少 query(sel) 方法！
    clear() { this._cache = {}; },
    _evictIfNeeded() { /* LRU 淘汰 */ }
};
```

**评价**：
- ✅ current 增加了 `permanent` 模式 + LRU 淘汰，是正向改进
- ❌ **丢失了 `query(sel)` 方法**。如果未来代码需要 CSS 选择器缓存，需自行实现
- ⚠️ current 缩进混乱（`return el;` 比 `}` 缩进少 1 级），阅读困难

**建议**：补回 `query(sel)` 方法，并修正缩进。

---

### 1.2 Logger — 丢失 `debug()` / `info()` 方法

**backup**（`backup/index.html:6585-6591`）

```js
const Logger = {
    DEBUG: false, INFO: false, WARN: true, ERROR: true,
    debug: function() { /* console.log */ },
    info:  function() { /* console.info */ },
    warn:  function() { /* console.warn */ },
    error: function() { /* console.error */ }
};
```

**current**（`js/utils.js:521-548`）

```js
const Logger = (function() {
    const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };
    // currentLevel() 读取 Storage.KEYS.LOG_LEVEL
    return {
        LEVELS: LEVELS,
        warn()  { /* ... */ },
        error() { /* ... */ }
        // 缺少 debug()、info()！
    };
})();
```

**评价**：
- ✅ current 改为 IIFE 闭包 + 级别常量，更灵活
- ✅ current 暴露了 `LEVELS` 常量
- ❌ **丢失了 `debug()` 和 `info()` 方法**。注释 `js/utils.js:518` 还写着"用法：Logger.info('xxx')"，但实际上根本没有 `Logger.info`，**自相矛盾**！

**建议**：补回 `Logger.info()` 和 `Logger.debug()` 方法（按级别开关）。

---

### 1.3 TimerManager — 几乎一致

**backup**（`backup/index.html:6593-6600`）vs **current**（`js/utils.js:38-45`）

两者核心实现一致：
- `setInterval(id, fn, delay)` / `setTimeout(id, fn, delay)` 都按 id 命名去重
- `clearAll()` 都会清空 `_intervals` / `_timeouts`

**评价**：✅ 基本持平，无回归。

---

### 1.4 GlobalCleanup — 一致

**backup**（`backup/index.html:6602-6606`）vs **current**（`js/utils.js:47-51`）

实现完全一致。

**评价**：✅ 持平。

---

## 2. XSS 防护

### 2.1 escapeHtml — current 增加了反引号转义

**backup**（`backup/index.html:11389-11392`）

```js
function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;')
                       .replace(/</g, '&lt;')
                       .replace(/>/g, '&gt;')
                       .replace(/"/g, '&quot;')
                       .replace(/'/g, '&#39;');
}
```

**current**（`js/core.js:4033-4036`）

```js
function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;')
                       .replace(/</g, '&lt;')
                       .replace(/>/g, '&gt;')
                       .replace(/"/g, '&quot;')
                       .replace(/'/g, '&#39;')
                       .replace(/`/g, '&#96;');   // ← current 多了一项
}
```

**评价**：
- ✅ **current 更优**。多转义反引号（`&#96;`）可防止 IE 旧版本的 attribute 注入（IE 会把反引号当作引号）
- ✅ `&#39;` vs backup 的 `&#039;` 等价（都是十进制实体），无差别

---

### 2.2 sanitizeHtml — current 升级为 DOMParser + 白名单

**backup**（`backup/index.html:11396-11418`）— 纯 regex 过滤

```js
function sanitizeHtml(html) {
    // 移除 <script>、on* 事件、javascript:、vbscript:、data: 协议、危险标签
    // 优点：轻量
    // 缺点：易被变形 payload 绕过（如大小写、HTML 实体编码、属性内注释等）
}
```

**current**（`js/core.js:4054-4150`）— DOMParser + 白名单

```js
var SANITIZE_WHITELIST = { p: ['class'], br: [], span: ['class', 'data-target', 'data-action', 'title'], ... };
function _isSafeUrl(url) { /* 阻止 javascript:/vbscript:/data: */ }
function _sanitizeDOMNode(node) { /* 递归清理：不在白名单的标签被解包替换 */ }
function sanitizeHtml(html) {
    var doc = new DOMParser().parseFromString(str, 'text/html');
    _sanitizeDOMNode(doc.body);
    return doc.body.innerHTML;
}
```

**评价**：
- ✅✅ **current 远胜**。基于 DOMParser + 标签白名单 + 属性白名单 + URL 协议检查，几乎无法绕过
- ⚠️ current 实现不再依赖 regex 字符串匹配，**正确处理了 HTML 实体编码后的属性**

**建议**：保留 current，**不要再退回 backup 的 regex 版本**。

---

### 2.3 缺失：`sanitizeIframeHtml` / `sanitizeHTML`（backup 的别名）

**backup**（`backup/index.html:6610`）

```js
function sanitizeHTML(str) { /* == escapeHtml 别名 */ }
```

**current** 完全没有 `sanitizeHTML` 这个函数名（仅有 `sanitizeHtml`）。

**评价**：
- ⚠️ 如果有外部脚本调用了 `sanitizeHTML`（驼峰命名），会找不到函数
- 实际影响低，因为 current 统一用 `sanitizeHtml`

---

## 3. 工具函数 — 严重回归

### 3.1 丢失 `debounce` / `throttle` / `safeExecute` / `safeGetItem`

**backup**（`backup/index.html:6612-6617`）全部存在：

```js
function debounce(fn, delay) { /* setTimeout debounce */ }
function throttle(fn, interval) { /* leading + trailing throttle */ }
function safeExecute(fn, fallback) { try { return fn(); } catch(e) { return fallback; } }
function safeSetItem(key, value) { try { localStorage.setItem(...); return true; } catch(e) { return false; } }
function safeGetItem(key, defaultValue) { try { var v = localStorage.getItem(key); return v !== null ? v : defaultValue; } catch(e) { return defaultValue; } }
```

**current** 全部丢失！

- `debounce` — 在 `js/utils.js` 中未找到
- `throttle` — 未找到
- `safeExecute` — 未找到
- `safeGetItem` — 未找到（被 `Storage.get(key, defaultValue)` 替代，但 API 形态不同）

**评价**：
- ❌❌ **严重回归**。虽然当前代码没用这些函数，但：
  1. **API 表面被破坏**：旧代码（备份/快照）依赖的工具链消失
  2. **未来开发成本**：新增防抖/节流需求时，需要重新实现
  3. **safeGetItem 被替代品 ≠ 替代品**：`Storage.get` 没有原 `safeGetItem` 的简洁形态
- ⚠️ backup 还有一个 `window.debounce` / `window.throttle` 的全局暴露（`backup/index.html:33184-33205`）

**建议**：必须从 backup 恢复这 4 个工具函数。

---

### 3.2 safeSetItem 签名变更

**backup**（`backup/index.html:6616` / `11376-11387`）— 返回 `true` / `false`

**current**（`js/utils.js:306-328`）— 返回对象 `{ success, error, message, ... }`

```js
function safeSetItem(key, value) {
    // ... 容量检查 ...
    if (capacity.used + dataSize > capacity.total) {
        return { success: false, error: 'quota_exceeded', message: '存储空间不足', ... };
    }
    localStorage.setItem(key, value);
    if (typeof StorageMonitor !== 'undefined') StorageMonitor.invalidateCache();
    return { success: true, used: dataSize };
}
```

**评价**：
- ✅ current 增加了容量检查、错误分类
- ❌ **返回类型变化破坏 API**：调用方从 `if (safeSetItem(...))` 改为 `if (safeSetItem(...).success)`，所有 backup 调用点都需重写
- ⚠️ 当前没有任何代码直接调用 `safeSetItem`（都被 `Storage.set` 包装），所以未引发线上 bug，但属于静默回归

---

## 4. 错误监听

### 4.1 全局 error / unhandledrejection

**backup**（`backup/index.html:33210-33227`）

```js
window.addEventListener('error', (e) => { /* console.error */ });
window.addEventListener('unhandledrejection', (e) => { /* console.error */ });
// ⚠️ backup 没有过滤资源错误
// ⚠️ backup 没有调 UI.toast
```

**current**（`js/init.js:8-25`）

```js
GlobalCleanup.registerListener(window, 'error', function(e) {
    // 过滤图片/CSS等资源加载错误（不显示给用户）
    if (e.target && (e.target.tagName === 'IMG' || e.target.tagName === 'LINK' || e.target.tagName === 'SCRIPT')) return;
    console.error('[全局错误]', e.message, 'at', e.filename, ':', e.lineno);
    if (typeof UI !== 'undefined' && UI.toast) UI.toast('发生错误: ' + e.message);
}, true);  // ← capture 阶段

GlobalCleanup.registerListener(window, 'unhandledrejection', function(e) {
    console.error('[未处理的Promise]', e.reason);
    if (typeof UI !== 'undefined' && UI.toast) UI.toast('异步操作失败');
    e.preventDefault();
});
```

**评价**：
- ✅✅ **current 远胜**：
  1. **过滤资源加载错误**（IMG/LINK/SCRIPT）
  2. **触发 UI.toast** 给用户感知
  3. **使用 capture 阶段**捕获更多错误
  4. **通过 GlobalCleanup.registerListener** 统一管理
  5. **e.preventDefault()** 阻止默认 Promise 警告

**建议**：保留 current。

---

## 5. 模态对话框

### 5.1 showConfirm / showPrompt 实现对比

**backup**（`backup/index.html:9045-9119`）— cloneNode + replaceChild 模式

```js
confirm: function(title, message) {
    return new Promise(function(resolve) {
        // ... 填充文字 ...
        UI.showModal('confirmModal');
        var yesBtn = document.getElementById('confirmYes');
        var newYes = yesBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newYes, yesBtn);
        newYes.addEventListener('click', function() {
            UI.hideModal('confirmModal');
            resolve(true);
        });
        // 否按钮同样处理
    });
}
```

**current**（`js/core.js:659-755`）— `_handler` + `_resolve` 缓存模式

```js
confirm: function(title, message) {
    return new Promise(function(resolve) {
        // ... 填充文字 ...
        UI.showModal('confirmModal');
        var yesBtn = document.getElementById('confirmYes');
        if (!yesBtn._confirmHandler) {
            yesBtn._confirmHandler = function() {
                UI.hideModal('confirmModal');
                if (yesBtn._confirmResolve) yesBtn._confirmResolve(true);
                yesBtn._confirmResolve = null;
            };
            yesBtn.addEventListener('click', yesBtn._confirmHandler);
        }
        if (yesBtn._confirmResolve) yesBtn._confirmResolve(false);  // ← 处理悬挂 promise
        yesBtn._confirmResolve = resolve;
        // 否按钮同样处理
    });
}
```

**评价**：
- ❌ **backup 的 cloneNode 模式有 bug**：每次 confirm 调用都重建节点，浪费 DOM 操作；如果用户在第一次的 confirm 中点击外部/按 ESC，未 resolve 的 promise 会悬挂
- ✅✅ **current 更优**：
  1. **handler 一次性绑定**（`_confirmHandler`）
  2. **旧 promise 自动 resolve(false)**（避免悬挂）
  3. **遮罩点击 resolve(false)**（`core.js:507-516`）
  4. **焦点陷阱 + ESC 关闭**（`core.js:551-586`）
  5. **导航栈**支持返回

**建议**：保留 current 的实现，不要退回 backup 的 cloneNode。

---

### 5.2 backup 也有 rebindBtn 辅助（11369-11374）

**backup**（`backup/index.html:11369-11374`）

```js
function rebindBtn(btn, eventType, handler) {
    var clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener(eventType, handler);
    return clone;
}
```

**评价**：这是一个反面教材，应该删除。current 的 `_handler` 缓存模式是正解。

---

## 6. innerHTML 模板与 renderEmptyState

### 6.1 current 引入了统一的 `renderEmptyState` / `renderSvgEmptyState`

**current**（`js/phone-ui.js:92-102`）

```js
function renderEmptyState(msg, hint) {
    var html = '<div class="empty-state"><p>' + escapeHtml(msg || '暂无内容') + '</p>';
    if (hint) html += '<p style="font-size:12px;margin-top:4px;">' + escapeHtml(hint) + '</p>';
    return html + '</div>';
}

function renderSvgEmptyState(iconSvg, title, hint) {
    var html = '<div class="empty-state"><div class="empty-state-icon">' + (iconSvg || '') + '</div><p>' + escapeHtml(title || '暂无内容') + '</p>';
    if (hint) html += '<p style="font-size:12px;margin-top:4px;">' + escapeHtml(hint) + '</p>';
    return html + '</div>';
}
```

**评价**：✅ 工具函数是好的抽象。

---

### 6.2 但 current 仍有 5 处内联 empty-state 模板未重构

**current** 中以下位置仍走内联模板，未走 `renderEmptyState` / `renderSvgEmptyState`：

| 行号 | 场景 | 模板 |
|---|---|---|
| `phone-ui.js:1767` | 聊天列表为空 | `<div class="empty-state"><div class="empty-state-icon"></div><p>暂无消息</p>...` |
| `phone-ui.js:1840` | 世界信息为空 | `<div class="empty-state"><div class="empty-state-icon">世</div><p>暂无世界信息</p></div>` |
| `phone-ui.js:2163` | 论坛帖子为空 | `<div class="empty-state"><div class="empty-state-icon"><svg>...</svg></div><p>暂无论坛帖子</p>...` |
| `phone-ui.js:2360` | 排行榜为空 | `<div class="empty-state"><div class="empty-state-icon"><svg>...</svg></div><p>暂无排行数据</p>...` |
| `phone-ui.js:3155` | 通用空状态 | `<div class="empty-state"><div class="empty-state-icon">单</div><p>暂无内容</p>...` |

**评价**：
- ⚠️ current 工具函数已存在，但 5 处内联模板未替换
- 💡 这些位置应直接调用 `renderSvgEmptyState(svg, '暂无消息', '...')`

**建议**：将 5 处内联模板统一替换为 `renderEmptyState` / `renderSvgEmptyState`。

---

## 7. 事件委托 / 按钮事件绑定

### 7.1 backup 大量使用 `cloneNode + replaceChild` 反模式

**backup** 至少 18+ 对 cloneNode 模式（散布在 `backup/index.html` 各处），例如：
- 9056-9079：UI.confirm 4 处
- 11370-11374：rebindBtn 辅助
- 22294-22326：4 个 NPC 详情按钮
- 等

**评价**：❌ backup 的 cloneNode 模式已被证明有问题（第二次打开弹窗时 listener 引用替换导致按钮失效，参见 `phone-ui.js:7375-7378` 的注释）

---

### 7.2 current 引入了 `bindFresh` 工具（utils.js:647-657）

**current**（`js/utils.js:647-660`）

```js
function bindFresh(elOrId, event, handler, refKey) {
    var el = (typeof elOrId === 'string') ? document.getElementById(elOrId) : elOrId;
    if (!el) return null;
    var key = refKey || ('_handler_' + event);
    if (el[key]) {
        el.removeEventListener(event, el[key]);
    }
    el[key] = handler;
    el.addEventListener(event, handler);
    return el;
}
```

**评价**：
- ✅ **current 优秀添加**。`bindFresh` 是 cloneNode 模式的现代替代品
- ❌ **未被全面采用**：`phone-ui.js` 中仍有 18+ 处 `cloneNode + replaceChild` 模式
- 注释 `js/phone-ui.js:7375-7378` 解释为何弃用 cloneNode，但实际仍有 18 处未替换

**建议**：将 phone-ui.js 中所有 18+ 处 cloneNode 模式替换为 `bindFresh` 或 `_handler` 缓存模式。

---

### 7.3 current 引入了统一 a11y 委托（utils.js:62-104）

**current**（`js/utils.js:62-104`）

```js
function _globalA11yDelegate(e) {
    if (e.type === 'keydown' && (e.key === 'Enter' || e.key === ' ')) {
        var roleEl = t.closest && t.closest('[role="button"]:not([role-bound])');
        if (roleEl && !roleEl.disabled) {
            e.preventDefault();
            roleEl.click();
        }
        return;
    }
    if (e.type === 'click') {
        var actEl = t.closest && t.closest('[data-action]');
        if (actEl) {
            var action = actEl.getAttribute('data-action');
            var argsAttr = actEl.getAttribute('data-args');
            // kebab-case → camelCase 转换
            var fnName = action.replace(/-([a-z])/g, function(m, c) { return c.toUpperCase(); });
            var fn = window[fnName];
            if (typeof fn === 'function') {
                e.preventDefault();
                try {
                    if (argsAttr == null || argsAttr === '') {
                        fn.call(actEl);
                    } else {
                        var parsed = JSON.parse(argsAttr);
                        if (!Array.isArray(parsed)) parsed = [parsed];
                        fn.apply(actEl, parsed);
                    }
                } catch (err) { /* ... */ }
            }
        }
    }
}
```

**评价**：
- ✅✅ **current 优秀添加**。统一了 a11y 委托 + data-action 路由
- ✅ 支持 kebab-case → camelCase 自动转换（如 `toggle-thought` → `toggleThought`）
- ✅ 支持 JSON 数组作为参数

**backup** 完全没有这个统一委托，靠大量分散 `onclick="..."` 实现。

**建议**：保留 current。

---

## 8. 全局模拟酒馆 API

### 8.1 window.SillyTavern — 几乎一致

**backup**（`backup/index.html:28961-29002`）vs **current**（`js/tavern-compat.js:840-881`）

两者提供完全相同的 API：
- `getContext()` / `chat: []` / `characters: []`
- `getCharacters()` / `checkCharExists()`
- `saveChat()` / `saveChatConditional()`
- `generateRaw()` / `generateRawQuiet()`
- `getChatMetadata()` / `setChatMetadata()`
- `writeExtensionSetting()` / `readExtensionSetting()`
- `eventSource: { on, emit, once, removeListener }`

**评价**：
- ✅ 持平。SillyTavern 表面未被破坏
- ⚠️ backup 在 28859-28860 注释"暴露 SillyTavern 引用，让脚本中的 window.SillyTavern 可用"，current 也有
- ⚠️ backup 提供 `getContext` / `getCharacters` / `getChatMetadata` / `eventSource.on/emit/once/removeListener` 等核心 API，current 一致

**建议**：保留 current，无需修改。

---

### 8.2 backup 沙箱的 `fetch` 注入 — current 已移除

**backup**（`backup/index.html:28875-28877`）

```js
var preamble = 'var getContext=arguments[0],triggerSlash=arguments[1],toastr=arguments[2],eventSource=arguments[3];\n';
var fn = new Function('getContext','triggerSlash','toastr','eventSource','console','setTimeout','setInterval','clearTimeout','clearInterval','Promise','fetch', preamble+code);
fn(sandbox.getContext, sandbox.triggerSlash, sandbox.toastr, sandbox.eventSource, console, setTimeout, setInterval, clearTimeout, clearInterval, Promise, fetch);
```

**current**（`js/tavern-compat.js:745-748`）

```js
var preamble = "'use strict';\nvar getContext=arguments[0],triggerSlash=arguments[1],toastr=arguments[2],eventSource=arguments[3];\n";
var fn = new Function('getContext','triggerSlash','toastr','eventSource','console','setTimeout','setInterval','clearTimeout','clearInterval','Promise', preamble+code);
fn.call(null, sandbox.getContext, sandbox.triggerSlash, sandbox.toastr, sandbox.eventSource, console, setTimeout, setInterval, clearTimeout, clearInterval, Promise);
```

**评价**：
- ✅ current 增加了 `'use strict'` 防止 this 泄漏
- ✅ current 增加了 dangerous patterns 检测（lines 703-731）
- ❌ current **移除了 `fetch`** — backup 让用户脚本能 fetch 网络，current 直接封禁

**影响**：
- 一些第三方酒馆脚本依赖 `fetch`（如调用外部 API 的脚本）
- 这是**安全收紧**而不是"改坏"，但需告知用户脚本作者

**建议**：保留 current 的安全收紧，但考虑提供 `getContext().fetch` 受控代理。

---

### 8.3 `_removeListener` 方法 — current 保留

**current**（`js/tavern-compat.js:884-892`）

```js
if(!TavernHelperCompat._removeListener){
TavernHelperCompat._removeListener = function(event, cb){
    var l = this._eventListeners[event];
    if(l){
        var idx = l.indexOf(cb);
        if(idx !== -1) l.splice(idx, 1);
    }
};
}
```

**评价**：✅ 与 backup 一致。

---

## 9. toastr 通知系统

### 9.1 backup 的完整 toastr（4 种 type + 颜色 + 动画 + 容器）

**backup**（`backup/index.html:28351-28376`）

```js
_initToastr: function() {
    if (window.toastr) return;
    var container = document.createElement('div');
    container.id = 'tavern-toastr-container';
    container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(container);
    var style = document.createElement('style');
    style.id = 'tavern-toastr-style';
    style.textContent = '@keyframes toastrSlideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}';
    document.head.appendChild(style);
    window.toastr = {
        info:    function(msg) { TavernHelperCompat._showToast(msg, '#2196F3'); },  // 蓝
        success: function(msg) { TavernHelperCompat._showToast(msg, '#4CAF50'); },  // 绿
        warning: function(msg) { TavernHelperCompat._showToast(msg, '#FF9800'); },  // 橙
        error:   function(msg) { TavernHelperCompat._showToast(msg, '#F44336'); }   // 红
    };
},
_showToast: function(msg, color) {
    var toast = document.createElement('div');
    toast.style.cssText = 'background:' + color + ';color:white;padding:12px 20px;...;animation:toastrSlideIn 0.3s ease;';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(function() { toast.style.opacity='0'; ... }, 3000);
}
```

**评价**：
- ✅ 标准酒馆 toastr 接口：4 种 type、颜色区分、3000ms timeout、slideIn 动画
- ✅ 位置固定右上角（z-index 99999）

---

### 9.2 current 的退化版本（全部走 UI.toast）

**current**（`js/tavern-compat.js:154-164`）

```js
_initToastr: function() {
    if (window.toastr) return;
    window.toastr = {
        info: function(msg) { if (typeof UI !== 'undefined' && UI.toast) UI.toast(msg); },
        success: function(msg) { if (typeof UI !== 'undefined' && UI.toast) UI.toast(msg); },
        warning: function(msg) { if (typeof UI !== 'undefined' && UI.toast) UI.toast(msg); },
        error: function(msg) { if (typeof UI !== 'undefined' && UI.toast) UI.toast(msg); }
    };
}
```

**评价**：
- ❌❌ **严重降级**。4 种 type 全部退化为同一种 UI.toast，**丢失颜色区分**
- ❌ 没有动画
- ❌ 没有独立的 toastr 容器
- ⚠️ 注释 `js/tavern-compat.js:154` 说"避免两套 toast 系统并存" — 但实际是功能降级

**影响**：
- 用户脚本调用 `toastr.error('xxx')` 时，不会得到红色错误提示
- `toastr.success('xxx')` 和 `toastr.info('xxx')` 视觉上无差异
- 错失关键错误反馈

**建议**：从 backup 恢复 `_showToast` 方法和 4 种 type 的颜色区分。

---

## 10. window.gameState 初始化

### 10.1 backup 顶层 IIFE（backup/index.html:33259-33305）

**backup**（`backup/index.html:33259-33305`）

```js
if (typeof gameState === 'undefined') {
    window.gameState = {};
}

const ensureExists = (path, defaultValue = {}) => {
    // ... 确保路径存在 ...
};

ensureExists('gameState.allCharacters', {});
ensureExists('gameState.currentBag', []);
ensureExists('gameState.currentQuests', []);
ensureExists('gameState.relationships', []);
ensureExists('gameState.keyEvents', []);
ensureExists('gameState.conversationHistory', []);

if (!gameState._chatLogs || Array.isArray(gameState._chatLogs)) gameState._chatLogs = {};
if (!gameState._theaterContent) gameState._theaterContent = {};
if (!Array.isArray(gameState._worldModules)) gameState._worldModules = [];
if (!gameState._chattedNpcs) gameState._chattedNpcs = {};
if (!gameState._chatRemarks) gameState._chatRemarks = {};
if (!gameState._blockedNpcs) gameState._blockedNpcs = {};
if (!gameState._presetApps) gameState._presetApps = {};
if (!gameState._depthPrompts) gameState._depthPrompts = {};
if (!gameState._positionPrompts) gameState._positionPrompts = {};
if (!Array.isArray(gameState._afterChatPrompts)) gameState._afterChatPrompts = [];
if (!Array.isArray(gameState._undoHistory)) gameState._undoHistory = [];
if (!gameState.pinnedModules) gameState.pinnedModules = {};
```

---

### 10.2 current 的 `ensureGameStatePaths` IIFE（init.js:28-71）

**current**（`js/init.js:28-71`）

```js
if (typeof gameState === 'undefined') {
    window.gameState = {};
}

(function ensureGameStatePaths() {
    var ensureExists = function(path, defaultValue) {
        defaultValue = defaultValue !== undefined ? defaultValue : {};
        var keys = path.split('.');
        var current = window;
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (i === keys.length - 1) {
                if (current[key] === undefined) {
                    current[key] = defaultValue;
                }
            } else {
                if (!current[key] || typeof current[key] !== 'object') {
                    current[key] = {};
                }
                current = current[key];
            }
        }
    };

    ensureExists('gameState.allCharacters', {});
    ensureExists('gameState.currentBag', []);
    ensureExists('gameState.currentQuests', []);
    ensureExists('gameState.relationships', []);
    ensureExists('gameState.keyEvents', []);
    ensureExists('gameState.conversationHistory', []);

    if (!gameState._chatLogs || Array.isArray(gameState._chatLogs)) gameState._chatLogs = {};
    if (!gameState._theaterContent) gameState._theaterContent = {};
    if (!Array.isArray(gameState._worldModules)) gameState._worldModules = [];
    if (!gameState._chattedNpcs) gameState._chattedNpcs = {};
    if (!gameState._chatRemarks) gameState._chatRemarks = {};
    if (!gameState._blockedNpcs) gameState._blockedNpcs = {};
    if (!gameState._presetApps) gameState._presetApps = {};
    if (!gameState._depthPrompts) gameState._depthPrompts = {};
    if (!gameState._positionPrompts) gameState._positionPrompts = {};
    if (!Array.isArray(gameState._afterChatPrompts)) gameState._afterChatPrompts = [];
    if (!Array.isArray(gameState._undoHistory)) gameState._undoHistory = [];
    if (!gameState.pinnedModules) gameState.pinnedModules = {};
})();
```

**评价**：
- ✅ 基本持平，逻辑完全一致
- ⚠️ current 把函数包在 IIFE 里，作用域更干净
- ⚠️ `ensureExists` 是函数声明（current） vs 箭头函数（backup），无功能差异

**遗留问题**：
- ❌ `init.js:32` 文件头注释说"单一权威源：StateManager"，但代码中仍在直接初始化 `gameState.xxx` 旧字段
- ⚠️ `phone-ui.js:107-145` 顶部文档明确指出"应删除 _syncLegacyMirror 与 gameState 旧字段"，但 init.js 仍保留初始化
- 💡 建议：这些 legacy 字段应通过 `StateManager.init` 注入，不再直接 mutate `window.gameState`

**建议**：保留 current 的 IIFE 包装，但加注释说明这些字段是 legacy 镜像，将被 `_syncLegacyMirror` 替代。

---

## 11. 应恢复 backup 优秀实现

按重要性排序：

| # | 项目 | 位置 | 优先级 |
|---|---|---|---|
| 1 | `debounce` 函数 | utils.js（缺失） | **P0** |
| 2 | `throttle` 函数 | utils.js（缺失） | **P0** |
| 3 | `safeExecute` 函数 | utils.js（缺失） | **P0** |
| 4 | `safeGetItem` 函数 | utils.js（缺失） | **P0** |
| 5 | `Logger.info()` 方法 | utils.js:521-548 | **P1** |
| 6 | `Logger.debug()` 方法 | utils.js:521-548 | **P1** |
| 7 | `DOMCache.query(sel)` 方法 | utils.js:5-36 | **P1** |
| 8 | toastr 颜色 + 动画（4 种 type） | tavern-compat.js:154-164 | **P1** |
| 9 | 5 处内联 empty-state 模板替换 | phone-ui.js:1767/1840/2163/2360/3155 | **P2** |
| 10 | 18+ 处 cloneNode + replaceChild 模式替换 | phone-ui.js（多处） | **P2** |

---

## 12. 应删除 current 错误修改

| # | 项目 | 位置 | 说明 |
|---|---|---|---|
| 1 | `safeSetItem` 返回类型从 boolean 改为对象 | utils.js:306-328 | 破坏 API 兼容 |
| 2 | `Logger` 注释自称有 `info` 但实际没有 | utils.js:518 | 自相矛盾 |

---

## 13. 应保留 current 优秀添加

| # | 项目 | 位置 | 说明 |
|---|---|---|---|
| 1 | `sanitizeHtml` 用 DOMParser + 白名单 | core.js:4054-4150 | 远胜 backup 的 regex |
| 2 | `escapeHtml` 增加反引号转义 | core.js:4033-4036 | 更安全 |
| 3 | `escapeAttr` 用于内联 JS 字符串 | core.js:4038-4052 | 解决 4 处 XSS 风险 |
| 4 | 全局 error 监听过滤资源错误 | init.js:8-25 | 远胜 backup |
| 5 | UI.confirm 用 `_handler/_resolve` 缓存 | core.js:659-705 | 解决 Promise 悬挂 |
| 6 | 模态遮罩点击 + ESC 关闭 + 焦点陷阱 | core.js:466-587 | 优秀 a11y |
| 7 | `bindFresh` 工具 | utils.js:647-660 | 替代 cloneNode |
| 8 | `_globalA11yDelegate` 统一委托 | utils.js:62-104 | data-action 路由 + 键盘 a11y |
| 9 | `parseTheaterItems` 通用解析器 | utils.js:684-731 | 替代 8 个 parse*Content |
| 10 | `DOMCache.permanent` 模式 + LRU | utils.js:5-36 | 增强 |
| 11 | `TimerManager.setTimeout` 全面使用 | phone-ui.js:18+ 处 | 替代散落 setTimeout |
| 12 | 沙箱 dangerous patterns 检测 | tavern-compat.js:703-731 | 安全加固 |
| 13 | `registerGameStartListener` 替代方案 | init.js:146 | 钩子化 |
| 14 | `enhanceAccessibility` ARIA 增强 | init.js:190-251 | 完整 a11y |

---

## 14. 关键发现总结

### 严重回归（必须修复）
1. **丢失 4 个工具函数**：`debounce` / `throttle` / `safeExecute` / `safeGetItem`
2. **Logger 自相矛盾**：注释说有 `Logger.info` 但实际没有
3. **toastr 严重降级**：4 种 type 退化为同一 UI.toast，丢失颜色/动画

### 中度问题（应修复）
4. **DOMCache 缺少 `query(sel)` 方法**
5. **18+ 处 cloneNode 反模式未替换**（`bindFresh` 已存在但未全面采用）
6. **5 处内联 empty-state 模板未走 `renderEmptyState`**

### 持平项
- `TimerManager` / `GlobalCleanup` 一致
- `window.SillyTavern` API 一致
- `window.gameState` 初始化一致
- `safeSetItem` 容量检查（增强但破坏 API）

### current 远胜 backup
- `sanitizeHtml` / `escapeHtml` / `escapeAttr`（安全加固）
- 全局 error 监听（过滤资源错误 + UI.toast）
- UI.confirm / UI.showModal（焦点陷阱 + ESC + Promise 防悬挂）
- `bindFresh` / `_globalA11yDelegate` / `parseTheaterItems`（新增工具）

---

**报告生成时间**：2026-07-02
**对比基线**：`/workspace/backup/index.html`（33308 行）
**对比对象**：`/workspace/js/phone-ui.js`（7415 行） + `/workspace/js/utils.js`（772 行） + `/workspace/js/init.js`（307 行）
