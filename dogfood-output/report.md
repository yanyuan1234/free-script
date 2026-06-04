# Free-Script 游戏引擎 - 深度代码审查报告

> 审查日期: 2026-06-04 | 审查方式: 源码静态分析 | 审查范围: 全项目

---

## 总览

| 严重级别 | 数量 |
|----------|------|
| Critical | 3 |
| High | 8 |
| Medium | 10 |
| Low | 5 |
| **总计** | **26** |

---

## Critical 级别问题

### ISSUE-001: LocalGameAPI.init() 逻辑分支导致配置永远无法正常加载

**文件:** [core.js](file:///workspace/js/core.js) L228-L274  
**类别:** functional  
**严重性:** Critical

**问题描述:** `init()` 方法中，当检测到旧模型时（`hasOld` 为 true），执行 `return` 提前退出，导致后续的 `this._configs = data.configs` 等赋值语句永远不会执行。即使用户有合法的非旧模型配置，只要任意一个配置槽位包含旧模型名称，整个配置加载就会被跳过。

```javascript
if (hasOld) {
    // ...保留apiKey和baseUrl...
    this.save();
    return;  // ← 提前退出，L262-270 永远不会执行
}
if (data.configs && data.configs.length > 0) {
    this._configs = data.configs;  // ← 死代码
}
```

**影响:** 当用户配置中混合了旧模型和新模型时，新模型的配置也无法正常加载，用户每次刷新页面都会丢失配置。

**修复建议:** 将 `hasOld` 分支改为仅更新旧模型配置，不提前 return，让后续逻辑继续执行。

---

### ISSUE-002: 好感度范围不一致 — 存储用 -100~100，UI限制用 0~100

**文件:** [game.js](file:///workspace/js/game.js) L3595, L3666-3696  
**类别:** functional  
**严重性:** Critical

**问题描述:** 系统提示词明确要求 AI 使用 -100 到 100 的好感度范围（L240-241），NPC 列表渲染也按 -100~100 计算颜色（L3667），但 `saveNpcEdit()` 中将好感度限制为 0~100：

```javascript
// L3595: 编辑NPC时限制为 0~100
favor = Math.max(0, Math.min(100, favor));

// 但系统提示词要求:
// "favorability 数值范围 -100 到 100（0 为中立，不是敌意！）"
```

同时，好感度进度条 `width: fav%` 在 fav 为负数时会显示异常（负宽度或0宽度），无法正确反映负好感度。

**影响:** 用户手动编辑NPC好感度时无法设置负值，敌对关系无法正确表示；进度条对负好感度的显示有误。

**修复建议:** 统一好感度范围为 -100~100，进度条使用 `(fav + 100) / 2` 映射到 0~100%。

---

### ISSUE-003: formatStory() 先反转义再 sanitize，XSS 防护被绕过

**文件:** [game.js](file:///workspace/js/game.js) L1719-L1714  
**类别:** security  
**严重性:** Critical

**问题描述:** `formatStory()` 先将 HTML 实体反转义（`&lt;` → `<`，`&gt;` → `>`），处理完 `<giggle>` 等自定义标签后，再在 `renderStory()` 中调用 `sanitizeHtml(formatStory(text))`。但 `formatStory()` 内部已经将文本反转义并拼接了 HTML，`sanitizeHtml` 可能无法正确处理已经半解析的混合内容。

```javascript
// L1724: 先反转义
text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>')...;

// L1746-1747: 直接操作DOM（不经过sanitize）
oldBubbles.forEach(function(b) { b.remove(); });

// L1713-1714: 后sanitize
var formatted = sanitizeHtml(formatStory(text));
storyEl.innerHTML = formatted;
```

更严重的是，`formatStory()` 中多处使用字符串拼接构建 HTML（如心声气泡、章节标记），这些拼接内容未经过 `escapeHtml()`，如果 AI 返回的内容包含恶意 HTML，可能绕过 sanitize。

**影响:** 潜在的 XSS 攻击向量，恶意 AI 输出可能注入脚本。

**修复建议:** 在 `formatStory()` 内部对所有动态文本使用 `escapeHtml()`，而不是依赖外层的 `sanitizeHtml()`。

---

## High 级别问题

### ISSUE-004: TypewriterBuffer.destroy() 未使用 GlobalCleanup 注销监听器

**文件:** [core.js](file:///workspace/js/core.js) L1179-L1184  
**类别:** performance / memory  
**严重性:** High

**问题描述:** `start()` 中使用 `GlobalCleanup.registerListener()` 注册了 `visibilitychange` 监听器，但 `destroy()` 中使用 `document.removeEventListener()` 直接移除，绕过了 `GlobalCleanup` 的统一管理。如果 `GlobalCleanup` 在 `destroy()` 之后执行清理，会尝试移除已不存在的监听器。

```javascript
// L1162: 注册到 GlobalCleanup
GlobalCleanup.registerListener(document, 'visibilitychange', this._visibilityHandler);

// L1182: 直接移除，绕过 GlobalCleanup
document.removeEventListener('visibilitychange', this._visibilityHandler);
```

**修复建议:** `destroy()` 应通过 `GlobalCleanup` 统一清理，或至少在移除后通知 `GlobalCleanup`。

---

### ISSUE-005: NPC聊天选项使用 onclick 字符串拼接，存在注入风险

**文件:** [game.js](file:///workspace/js/game.js) L3506-L3511  
**类别:** security  
**严重性:** High

**问题描述:** NPC聊天选项使用 `onclick="selectNpcChatChoice('...')"` 字符串拼接方式绑定事件。虽然对单引号和双引号做了转义，但如果选项文本包含反引号、`$`、或其他 JavaScript 特殊字符，仍可能导致注入。

```javascript
var safe = String(ch).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    .replace(/"/g, '&quot;').replace(/\n/g, ' ');
return '<button class="npc-chat-choice" onclick="selectNpcChatChoice(\'' +
    safe + '\')">' + escapeHtml(ch) + '</button>';
```

**修复建议:** 使用 `addEventListener` 替代 `onclick` 字符串拼接，或使用 `data-*` 属性 + 事件委托。

---

### ISSUE-006: SaveDB._lsSet() 中 delete saves[slot] 键类型不匹配

**文件:** [core.js](file:///workspace/js/core.js) L778  
**类别:** functional  
**严重性:** High

**问题描述:** `_lsSet()` 中删除存档时使用 `delete saves[slot]`，但 `slot` 是 `number` 类型（来自参数），而 `_lsGetAll()` 从 JSON 解析后键是 `string` 类型。`delete saves[0]` 和 `delete saves["0"]` 在 V8 中等价，但这是隐式行为，不可靠。

```javascript
_lsSet(slot, data) {
    var saves = this._lsGetAll();
    if (data === null) delete saves[slot];  // slot 是 number，saves 的键可能是 string
    else saves[slot] = data;
}
```

**修复建议:** 统一使用 `String(slot)` 或 `Number(slot)` 作为键。

---

### ISSUE-007: callAI() 流式解析中 SSE 事件处理重复代码

**文件:** [core.js](file:///workspace/js/core.js) L2914-L2996  
**类别:** performance / maintainability  
**严重性:** High

**问题描述:** 流式 SSE 解析逻辑完全重复了两遍——一遍在流结束的 `done` 分支中处理剩余 buffer（L2921-L2951），一遍在正常的事件循环中（L2965-L2995）。两段代码逻辑完全相同，任何修改都需要同步两处，极易遗漏导致行为不一致。

**修复建议:** 提取为 `processSSELine(line)` 函数，两处调用同一函数。

---

### ISSUE-008: 世界书 scan() 每次调用都读取 DOM 元素

**文件:** [worldinfo.js](file:///workspace/js/worldinfo.js) L1417-L1423  
**类别:** performance  
**严重性:** High

**问题描述:** `scan()` 方法每次被调用时都通过 `document.getElementById()` 读取 UI 设置（scanDepth、tokenBudget、recursive），而 `scan()` 在每次 AI 请求时都会被调用。频繁的 DOM 读取影响性能，且在非浏览器环境（如 Worker）中会报错。

```javascript
var depthEl = document.getElementById('wiScanDepth');
var budgetEl = document.getElementById('wiTokenBudget');
var recursiveEl = document.getElementById('wiRecursive');
if (depthEl) this.settings.scanDepth = parseInt(depthEl.value) || 2;
```

**修复建议:** 只在 UI 变更时更新 settings，scan() 直接使用 `this.settings`。

---

### ISSUE-009: parseAIResponse() 中 JSON 兜底提取可能误匹配

**文件:** [core.js](file:///workspace/js/core.js) L1630-L1637  
**类别:** functional  
**严重性:** High

**问题描述:** 当 `safeJSONParse` 和 `robustParse` 都失败时，兜底逻辑使用 `cleanedReply.match(/\{[\s\S]*\}/)` 提取 JSON。这个正则使用贪婪匹配，如果文本中有多个 JSON 对象（如 AI 回复中嵌套了 JSON 示例），会从第一个 `{` 匹配到最后一个 `}`，导致提取到无效的 JSON。

```javascript
var jsonBlockMatch = cleanedReply.match(/\{[\s\S]*\}/);
if (jsonBlockMatch) {
    var extracted = safeJSONParse(jsonBlockMatch[0]);
    // 如果文本是 "xxx{a:1} yyy{b:2}"，会提取 "{a:1} yyy{b:2}"
}
```

**修复建议:** 使用非贪婪匹配或更精确的 JSON 边界检测，如匹配最后一个完整的 JSON 对象。

---

### ISSUE-010: NPC聊天菜单使用 window[item.action]() 调用函数

**文件:** [game.js](file:///workspace/js/game.js) L2962  
**类别:** security  
**严重性:** High

**问题描述:** `toggleChatMenu()` 中使用 `window[item.action]()` 动态调用函数，`item.action` 来自硬编码的字符串数组。虽然当前数组是安全的，但这种模式容易被原型污染攻击利用。如果 `Object.prototype` 上被注入了同名属性，可能导致意外函数执行。

```javascript
items.forEach(function(item) {
    row.onclick = function() {
        menu.remove();
        window[item.action]();  // 动态函数调用
    };
});
```

**修复建议:** 使用 `switch` 语句或函数映射表替代 `window[action]()`。

---

### ISSUE-011: buildSystemPrompt() 世界书缓存可能导致注入内容过时

**文件:** [game.js](file:///workspace/js/game.js) L109-L110  
**类别:** functional  
**严重性:** High

**问题描述:** `buildSystemPrompt()` 使用 `gameState._wiCachedResult` 缓存世界书扫描结果，但缓存没有失效机制。当用户在世界书中添加/修改/删除条目后，缓存不会更新，直到下一次完整请求。如果用户在对话中途修改世界书，当前轮的提示词仍然使用旧缓存。

```javascript
var _wiResult = gameState._wiCachedResult || WorldInfo.buildInjection(gameState.conversationHistory || []);
gameState._wiCachedResult = _wiResult;
```

**修复建议:** 在世界书条目变更时清除缓存（`gameState._wiCachedResult = null`），或在 `buildSystemPrompt` 中添加缓存过期检查。

---

## Medium 级别问题

### ISSUE-012: extractStoryStreaming() 不处理代理对（surrogate pairs）

**文件:** [game.js](file:///workspace/js/game.js) L1626-L1681  
**类别:** functional  
**严重性:** Medium

**问题描述:** `extractStoryStreaming()` 逐字符处理文本，但 JavaScript 字符串中 emoji 和罕见 CJK 字符由代理对组成（2个 char），逐 char 处理会将代理对拆开，导致 `\uXXXX` 转义处理不正确或字符显示为乱码。

**修复建议:** 使用 `Array.from()` 或码点迭代替代 `text[i]` 逐字符访问。

---

### ISSUE-013: DOMCache 无容量限制，可能无限增长

**文件:** [utils.js](file:///workspace/js/utils.js) L6-L34  
**类别:** performance  
**严重性:** Medium

**问题描述:** `DOMCache` 的 `_cache` 和 `_permanent` 对象没有容量上限。在长时间游戏中，频繁查询不同选择器会导致缓存不断增长，虽然单个条目很小，但永不清理可能造成内存压力。

**修复建议:** 添加 LRU 淘汰策略或定期清理机制。

---

### ISSUE-014: SaveDB.migrate() 迁移后不删除旧 localStorage 数据

**文件:** [core.js](file:///workspace/js/core.js) L729-L750  
**类别:** performance  
**严重性:** Medium

**问题描述:** 迁移完成后只设置了 `_idb_migrated` 标记，但没有删除 `freeScript_localSaves` 中的旧数据。这意味着旧数据仍然占用 localStorage 空间（可能数 MB），且每次启动都会检查迁移标记。

**修复建议:** 迁移成功后删除 `freeScript_localSaves`，释放 localStorage 空间。

---

### ISSUE-015: onStreamChunk() 中正则处理在每次 chunk 时执行

**文件:** [game.js](file:///workspace/js/game.js) L1686-L1694  
**类别:** performance  
**严重性:** Medium

**问题描述:** `onStreamChunk()` 在每个流式 chunk 到达时都调用 `RegexManager.applyToOutput(story)`，而 `story` 是从开头到当前位置的完整文本。随着文本增长，正则处理的开销会越来越大（O(n²) 复杂度）。

```javascript
function onStreamChunk(chunk) {
    streamBuffer += chunk;
    var story = extractStoryStreaming(streamBuffer);
    if (story && story.length > 0) {
        story = RegexManager.applyToOutput(story);  // 每次处理完整文本
        TypewriterBuffer.push(story);
    }
}
```

**修复建议:** 只在流式输出完成后执行正则处理，或增量处理新增部分。

---

### ISSUE-016: renderStory() 中引用了不存在的 RegexEngine

**文件:** [game.js](file:///workspace/js/game.js) L1706-L1710  
**类别:** console  
**严重性:** Medium

**问题描述:** `renderStory()` 中检查 `typeof RegexEngine !== 'undefined'`，但项目中实际的正则引擎是 `RegexManager`，不存在 `RegexEngine` 对象。这段代码永远不会执行，是遗留代码。

```javascript
if (typeof RegexEngine !== 'undefined' && RegexEngine.regexScripts.length > 0) {
    var depth = (gameState.conversationHistory || []).length;
    text = RegexEngine.processAIResponse(text, depth);  // 死代码
}
```

**修复建议:** 删除这段死代码，避免混淆。

---

### ISSUE-017: 世界书 scan() 中 _currentTurn 只增不减

**文件:** [worldinfo.js](file:///workspace/js/worldinfo.js) L1346-L1347  
**类别:** performance  
**严重性:** Medium

**问题描述:** `_currentTurn` 在每次 `scan()` 调用时递增，但加载存档时不会重置。长时间游戏后 `_currentTurn` 可能变得非常大，虽然不影响功能，但 delay/cooldown 的计算可能因数值溢出而出错。

**修复建议:** 在存档加载时重置 `_currentTurn`，或使用相对轮次计算。

---

### ISSUE-018: chatMenuPanel 的关闭事件监听器可能重复注册

**文件:** [game.js](file:///workspace/js/game.js) L2968-L2975  
**类别:** performance / memory  
**严重性:** Medium

**问题描述:** `toggleChatMenu()` 每次打开菜单时都通过 `document.addEventListener('click', closeMenu)` 注册一次性关闭监听器。虽然 `closeMenu` 内部会 `removeEventListener`，但如果菜单通过 `existing.remove()` 关闭（L2925），监听器不会被移除，造成泄漏。

```javascript
if (existing) {
    existing.remove();  // 直接移除，不触发 closeMenu
    return;
}
```

**修复建议:** 在 `existing.remove()` 之前也移除对应的 click 监听器，或使用 `{ once: true }` 选项。

---

### ISSUE-019: formatStory() 中心声气泡直接 append 到 body

**文件:** [game.js](file:///workspace/js/game.js) L1746-L1747  
**类别:** ux  
**严重性:** Medium

**问题描述:** 心声气泡使用 `fixed` 定位直接添加到 `body` 上，清理时通过 `document.querySelectorAll('body > .thought-bubble:not([data-persistent])')` 查找。如果页面有其他组件也在 body 上添加了 `.thought-bubble` 元素，会被误删。且 fixed 定位的气泡可能遮挡其他 UI 元素。

**修复建议:** 将心声气泡放在专门的容器元素内，避免污染 body。

---

### ISSUE-020: patch.js 中对 window.gameAdapter 的访问缺少空值检查

**文件:** [patch.js](file:///workspace/js/patch.js) L30, L72, L107, L123  
**类别:** console  
**严重性:** Medium

**问题描述:** STscript Hook 中多处访问 `window.gameAdapter` 的属性和方法，但没有检查 `window.gameAdapter` 是否存在。如果 `TavernHelperCompat` 初始化失败或延迟，会导致 `Cannot read properties of undefined` 错误。

**修复建议:** 添加 `if (!window.gameAdapter) return;` 守卫。

---

### ISSUE-021: phone-ui.js 中 buildModuleHTML 未检查 mod.items 类型

**文件:** [phone-ui.js](file:///workspace/js/phone-ui.js) L506-L665  
**类别:** functional  
**严重性:** Medium

**问题描述:** `buildModuleHTML()` 函数在处理各种模块类型时，直接访问 `mod.items` 并调用 `.map()`、`.forEach()` 等数组方法，但未检查 `mod.items` 是否为数组。如果 AI 返回的 world 模块中 items 为 null、undefined 或非数组对象，会导致运行时错误。

**修复建议:** 在函数开头添加 `mod.items = Array.isArray(mod.items) ? mod.items : [];`。

---

## Low 级别问题

### ISSUE-022: 系统提示词中硬编码了默认 API baseUrl

**文件:** [core.js](file:///workspace/js/core.js) L192-L221  
**类别:** ux  
**严重性:** Low

**问题描述:** 5个 API 配置槽位默认都指向 `https://api.iamhc.cn/v1`，这是第三方中转站。如果该服务下线或变更，新用户首次使用会看到连接失败。应提供更通用的默认值或引导用户配置自己的 API。

---

### ISSUE-023: console.log 调试信息未移除

**文件:** 多个文件  
**类别:** console  
**严重性:** Low

**问题描述:** 生产代码中保留了大量 `console.log` 调试输出（如 `[API] 参数过滤完成`、`[buildSystemPrompt] 已注入增强记忆`、`[小剧场融合] 提取到 X 个小剧场` 等），这些输出在用户控制台中可见，可能泄露内部逻辑和 API 参数信息。

**修复建议:** 使用 `Logger.debug()` 替代 `console.log`，并在生产环境中关闭 DEBUG 级别日志。

---

### ISSUE-024: CSS 中暗色主题部分元素缺少适配

**文件:** [game.js](file:///workspace/js/game.js) L2931  
**类别:** ux  
**严重性:** Low

**问题描述:** `toggleChatMenu()` 中动态创建的菜单面板硬编码了白色背景 `background:#fff` 和深色文字 `color:#333`，在暗色主题下会显得突兀。类似的问题在 `editChatRemark()` 等动态创建的 UI 元素中也存在。

**修复建议:** 使用 CSS 变量（`var(--bg)`、`var(--text-primary)`）替代硬编码颜色。

---

### ISSUE-025: 缺少全局错误边界处理

**文件:** [init.js](file:///workspace/js/init.js)  
**类别:** ux  
**严重性:** Low

**问题描述:** `initApp()` 没有全局 try-catch 包裹，如果任何初始化步骤抛出异常，后续步骤不会执行，但用户看不到任何错误提示。应用可能处于半初始化状态，部分功能可用部分不可用，难以排查。

**修复建议:** 为每个初始化步骤添加独立的 try-catch，失败时显示用户友好的错误提示。

---

### ISSUE-026: 存档版本迁移逻辑不完整

**文件:** [game.js](file:///workspace/js/game.js) L2091-L2450  
**类别:** functional  
**严重性:** Low

**问题描述:** `createDefaultGameState()` 定义了完整的默认状态结构，但存档加载时只对部分字段做了缺失补充（如 `_chatLogs`、`_chattedNpcs`），其他新增字段（如 `_moments`、`_mail`、`_diary`、`_presetApps` 等）如果旧存档中没有，会保持 undefined 而非使用默认值，可能导致后续访问报错。

**修复建议:** 加载存档后，使用 `Object.assign(createDefaultGameState(), loadedData)` 确保所有字段都有默认值。

---

## 架构级优化建议

### A1: 模块化改造

当前所有代码通过全局变量和函数共享状态，10个JS文件之间通过隐式依赖关系耦合。建议：
- 使用 ES Module 或立即执行函数封装模块作用域
- 明确模块间的接口契约
- 减少全局变量污染

### A2: 事件系统统一

当前事件处理分散在 `onclick` 属性、`addEventListener`、`GlobalCleanup`、`GameLinker` 等多处。建议：
- 统一使用事件委托模式
- 所有动态创建的 UI 元素通过事件委托处理交互
- 集中管理事件监听器的生命周期

### A3: 状态管理优化

`gameState` 对象承担了过多职责（游戏状态、UI状态、缓存、临时变量混在一起）。建议：
- 分离持久化状态和临时状态
- 缓存数据（如 `_wiCachedResult`）单独管理
- 使用不可变数据模式，便于撤销/重做

### A4: 流式处理性能优化

当前流式输出中，每个 chunk 都会触发完整的正则处理和 DOM 更新。建议：
- 增量处理新增文本
- 使用 `requestAnimationFrame` 合并 DOM 更新
- 正则处理延迟到流式输出完成后执行

---

## 修复优先级建议

| 优先级 | Issue 编号 | 说明 |
|--------|-----------|------|
| P0 立即修复 | 001, 002, 003 | 配置加载bug、数据不一致、XSS风险 |
| P1 本周修复 | 005, 006, 009, 010, 011 | 安全注入、数据一致性、缓存失效 |
| P2 下周修复 | 004, 007, 008, 015, 016 | 内存泄漏、性能、死代码 |
| P3 计划修复 | 012-014, 017-026 | 边界情况、UX优化、代码质量 |
