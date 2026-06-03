# 「自由剧本」Bug 诊断报告

## TL;DR
你描述的"叉一样的按钮关不掉页面"问题是真实的根本性 bug。我找到了**唯一**的根因：一个未闭合的 `<textarea>` 标签把大约 600 行 HTML 吞掉了，导致 `bindEvents()` 中途崩溃，**全应用 26 个 X 关闭按钮全部失效**。

## 用户原始描述
> "叉一样的按钮，它关不掉页面…菜一样的按钮，点了没反应"

实际就是游戏内**所有模态弹窗右上角的 X 关闭按钮**全部失效。

## 根本原因（Root Cause）

### 1. 缺失 `</textarea>` 闭合标签

文件: [index.html](file:///workspace/index.html#L312-L313)

```html
312→  <textarea class="input-field textarea-field mt-8" id="worldDescription" rows="4"
313→      placeholder="随便写！一句话也行，详细设定也行。还可以指定特殊能力、CP线、世界观...">
314→  </div>
```

`worldDescription` 的 `<textarea>` **缺少 `</textarea>` 闭合标签**。

`<textarea>` 是 HTML 规范的"raw text element"。一旦缺少闭合标签，浏览器会把从该标签开始、直到下一个 `</textarea>` 之间的所有内容都当作 textarea 的文本内容。

### 2. 第一个 `</textarea>` 在 600 行之后

文件中第一个 `</textarea>` 出现在 [第 912 行](file:///workspace/index.html#L912)。也就是从第 312 行到第 912 行之间的 ~600 行 HTML（包含 `loadingPage`、`storyPage`、所有模态弹窗、相关脚本）全部被当成 textarea 的纯文本。

**运行时验证：**
```js
document.getElementById("worldDescription").textContent.length === 39219
```
`worldDescription` 的"文本内容"长达 39,219 字符——远超正常。

### 3. 被吞掉的关键元素

| 元素 | HTML 位置 | DOM 中是否存在 |
|------|----------|---------------|
| `loadingPage` | 第 361 行 | ❌ 缺失 |
| `storyPage` | 第 378 行 | ❌ 缺失 |
| `genCancelBtn` | 第 429 行（storyPage 内部） | ❌ 缺失 |
| `setupPlayerDesc` | 第 324 行 | ❌ 缺失（被吞进上面的 textarea） |

## 症状链（Cascade）

1. **`bindEvents()` 在 [js/phone-ui.js:3186](file:///workspace/js/phone-ui.js#L3186) 崩溃**
   ```js
   document.getElementById('genCancelBtn').addEventListener('click', function() {
   ```
   `genCancelBtn` 是 `null`（在第 1 步中被吞掉了），调用 `.addEventListener` 抛出 `TypeError`。

2. **第 3186 行之后的所有事件绑定全部不执行**
   `bindEvents()` 函数有 ~500 行，从第 3186 行开始全部跳过。包含 26 个 `data-close` 关闭按钮的统一处理器（[第 3622-3627 行](file:///workspace/js/phone-ui.js#L3622-L3627)）。

3. **全应用 26 个 X 关闭按钮全部失灵**
   数据：
   ```js
   document.querySelectorAll("[data-close]").length === 26
   ```
   涵盖：世界书模态、预设管理模态、提示条内容、保存预设、编辑预设、API 中转管理、世界条目编辑、NPC 详情、设置、游戏统计…所有模态右上角的 X。

## 复现步骤（带证据）

| 步骤 | 操作 | 截图 | 期望 | 实际 |
|------|------|------|------|------|
| 1 | 打开 http://localhost:8765/index.html | [01-initial.png](file:///workspace/dogfood-output/screenshots/issue-001-step-1-home.png) | 主页加载 | ✅ 主页正常 |
| 2 | 点击「记录」按钮 | [02-modal-open.png](file:///workspace/dogfood-output/screenshots/issue-001-step-2-modal-open.png) | 弹出「游戏统计」模态 | ✅ 模态打开 |
| 3 | 点击模态右上角 X 关闭按钮 | [03-after-x-click.png](file:///workspace/dogfood-output/screenshots/issue-001-step-3-after-x-click.png) | 模态关闭 | ❌ **模态未关闭** |

**复现视频：** [issue-001-repro.webm](file:///workspace/dogfood-output/videos/issue-001-repro.webm)

**控制台报错（关键证据）：**
```
[error] [INIT] 初始化失败: {stack: "TypeError: Cannot read properties of null
  (reading 'addEventListener')
  at bindEvents (http://localhost:8765/js/phone-ui.js:3186:44)
  at initApp (http://localhost:8765/js/init.js:48:9)"}
```

**JS 验证（手动触发复现）：**
```js
bindEvents._bound = false;
// 重跑 bindEvents() 强制抛错
try { bindEvents(); } catch(e) { e.stack }
// → "TypeError: ... at bindEvents (phone-ui.js:3186:44)"
```

## 影响范围（Severity: Critical）

- **26 个 X 关闭按钮全部失效**——这是用户最先遇到、最频繁的操作
- 用户无法退出任何弹窗，只能刷新页面
- 涉及 [所有使用 `data-close` 属性的模态](file:///workspace/index.html)（世界书、预设、API、NPC、统计、设置等）

## 修复方案

**最小修复（推荐）：** 在 [index.html:313](file:///workspace/index.html#L312-L313) 后补一个 `</textarea>`：

```diff
  <textarea class="input-field textarea-field mt-8" id="worldDescription" rows="4"
-     placeholder="随便写！一句话也行，详细设定也行。还可以指定特殊能力、CP线、世界观...">
+     placeholder="随便写！一句话也行，详细设定也行。还可以指定特殊能力、CP线、世界观..."></textarea>
  </div>
```

**附带修复（建议）：** [index.html:325](file:///workspace/index.html#L324-L325) 的 `setupPlayerDesc` 也缺闭合（虽然被上面的 textarea 吞了看不出，但属于同类问题）：

```diff
  <textarea class="input-field textarea-field mt-8" id="setupPlayerDesc" rows="2"
-     placeholder="性格、外貌、背景...（留空让AI自动分配）">
+     placeholder="性格、外貌、背景...（留空让AI自动分配）"></textarea>
  </div>
```

**防御性修复（强烈建议）：** [js/phone-ui.js:3186](file:///workspace/js/phone-ui.js#L3186) 改为 null check：

```js
- document.getElementById('genCancelBtn').addEventListener('click', function() {
+ var genCancelBtn = document.getElementById('genCancelBtn');
+ if (genCancelBtn) {
+     genCancelBtn.addEventListener('click', function() {
+         ...
+     });
+ }
```

否则未来再有任何一个元素缺失，都会让整个 `bindEvents()` 中断，相同类型的问题会再次发生。
