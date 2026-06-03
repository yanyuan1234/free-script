# 根本性 Bug 审计报告

## 检查范围
对照上一个 bug（未闭合 `<textarea>`）的系统性检查，找出同类问题。

## 发现的问题汇总

| # | 严重度 | 类别 | 状态 | 问题 |
|---|--------|------|------|------|
| ISSUE-002 | 🟡 Low | 重复属性 | **未修复** | 重复 class 属性导致样式丢失 |
| ISSUE-003 | 🟢 Info | UX 一致性 | **设计如此** | 2 个模态用返回键代替 X 键 |
| ISSUE-004 | 🔴 High（防御） | 防御性编程 | **未修复** | 45 处 `getElementById().addEventListener()` 无 null check，相同 bug 会再发生 |

---

## ISSUE-002：重复 `class` 属性导致样式丢失

**文件：** [index.html:278-279](file:///workspace/index.html#L278-L279)

```html
<button class="crystal-btn primary" id="btnCreatePresetFromSetup"
    class="p-8-16 text-13">
```

**问题：** 一个元素上有**两个** `class` 属性，HTML 规范规定重复属性时**只保留第一个**，第二个被浏览器静默丢弃。

**实测验证：**
- 期望 class：`crystal-btn primary p-8-16 text-13`
- 实际 class（DOM）：`crystal-btn primary` ← `p-8-16 text-13` 被丢了
- 影响：按钮的 padding 和 font-size 不是预期值
- 严重度：**低**（只是样式问题，不影响功能）

**修复（一行）：**
```diff
- <button class="crystal-btn primary" id="btnCreatePresetFromSetup"
-     class="p-8-16 text-13">
+ <button class="crystal-btn primary p-8-16 text-13" id="btnCreatePresetFromSetup">
```

---

## ISSUE-003：2 个模态没有 X 关闭按钮

**测试结果：**

| 模态 | X 关闭按钮 | 替代关闭方式 | 影响 |
|------|----------|------------|------|
| `apiConfigModal` | ✅ 有 | - | 正常 |
| `apiDetailModal` | ❌ 没有 | 左上角 `←` 返回键（[apiDetailBack](file:///workspace/index.html#L1715)） | 用户找关闭按钮会困惑 |
| `statsModal` | ✅ 有 | - | 正常 |
| `settingsModal` | ✅ 有 | - | 正常 |
| `npcChatModal` | ❌ 没有 | 左上角 `←` + `closeNpcChat()` ([index.html:2019](file:///workspace/index.html#L2018-L2020)） | 用户找关闭按钮会困惑 |
| 其余 21 个 | ✅ 有 | - | 正常 |

**严重度：** 🟢 Info（设计上采用返回键代替 X，**与手机 app 风格一致**，但与其他模态不一致）

**建议（非必须）：** 统一加 X 关闭按钮，提升一致性。

---

## ISSUE-004（关键防御）：45 处裸 `.addEventListener()`，同类 bug 会再发生

**文件：** [js/phone-ui.js:3176-4070](file:///workspace/js/phone-ui.js#L3176-L4070) (`bindEvents()` 函数)

**问题：** 整个 `bindEvents()` 函数有 **45 处** 形如下面的代码：

```js
document.getElementById('someId').addEventListener('click', function() { ... });
```

**为什么危险：**
- 上一个 bug 的根因就是这个模式：第 3186 行的 `genCancelBtn` 缺失，导致整个 `bindEvents()` 中断
- 之后所有 400+ 行事件绑定全部失败（[电话-UI 关闭按钮](file:///workspace/dogfood-output/screenshots/audit-02-worldinfo.png)、时间线、菜单项…等等都可能因为任何一个元素缺失而炸掉）

**当前状态（修复后）：**
我用了脚本验证，运行时所有 171 个 `getElementById` 引用**都返回非空**，所以**目前是安全的**。但这是一个**随时会爆的雷**。

**典型案例（节选 5 处）：**
```js
// L3186（已修复）
document.getElementById('genCancelBtn').addEventListener('click', function() { ... });

// L3200
document.getElementById('btnMenuWorldInfo').addEventListener('click', function() { ... });

// L3235
document.getElementById('btnMenuApiSettings').addEventListener('click', function() { ... });

// L3644
document.getElementById('btnAddCustomAction').addEventListener('click', function() { ... });

// L3858
document.getElementById('btnClearStory').addEventListener('click', function() { ... });
```

**防御性修复（推荐）：**
1. 把这个模式包成 helper：
   ```js
   function bindEvent(id, event, handler) {
       var el = document.getElementById(id);
       if (el) el.addEventListener(event, handler);
       else console.warn('[bindEvents] 元素不存在:', id);
   }
   ```
2. 替换 `bindEvents()` 里的 45 处裸调用为 `bindEvent('xxx', 'click', function() { ... })`
3. 任何元素被删除/重命名时，控制台会**显式警告**而不是静默炸掉整个 init

**为什么这个 bug 之前没人发现：**
- 上次 `genCancelBtn` 缺失的修复就是添加闭合 textarea 标签
- 那次修复**只是巧合**——根因（缺失 null check）没有解决
- 任何后续 PR 删除/重命名一个元素 ID，相同 bug 就会重新出现，且不会被 lint 工具发现

---

## 其他检查（已排除）

| 检查 | 结果 |
|------|------|
| 未闭合 `<textarea>` / `<script>` / `<style>` / `<title>` | ✅ 现在已平衡（修复后 16 开 16 闭） |
| div 标签开闭平衡 | ✅ 数量差值在注释/字符串内，已被浏览器正确解析 |
| 所有 171 个 `getElementById()` 引用 | ✅ 全部指向已存在的元素 |
| 23 个模态的 X 关闭按钮功能 | ✅ 全部正常工作（除 2 个用返回键代替的） |
| 主流程（菜单→创建世界→故事页） | ✅ 跑通 |

---

## 建议优先级

1. **现在修：** ISSUE-002（1 行代码，零风险）
2. **强烈建议修：** ISSUE-004 防御性 helper（防止同类 bug 再次发生）
3. **可选：** ISSUE-003 统一 X 关闭按钮（UX 一致性）

完整测试截图保存在 [dogfood-output/](file:///workspace/dogfood-output/)。
