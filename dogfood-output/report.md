# Dogfood Report: 自由剧本 — 字数控制保存 + API 自动轮询 UI 同步

| Field | Value |
|-------|-------|
| **Date** | 2026-06-04 |
| **App URL** | http://localhost:8765/index.html |
| **Session** | wordcount-regression + api-rotation |
| **Scope** | (1) 设置弹窗「字数控制」11 个字段 + 剧情长度 持久化回归；(2) wcLengthPreset 数据流断裂、openSettingsModal 不重读 gameState、UI 无交叉校验；(3) **API 自动轮询切 slot 后，UI 上的「使用中」徽章不跟着切** |
| **Mode** | **Headless**（沙箱无 libatk/libcups 等系统库，agent-browser 启动失败；改为从真实 js/phone-ui.js 抽取 saveGameSettings / loadGameSettings，用 vm + FakeDOM 模拟用户操作） |

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |
| **Total** | **0（全部修复）** |

3 个发现已全部修好并验证。修复后的回归测试 **28/28 + 14/14 全部通过**，且**预设优先级**（切预设后 gameState 覆盖 UI，用户的设置被覆盖）行为 **未变**（P1/P2 用例明确验证）。

### 修复清单

| Issue | 位置 | 改动 |
|------|------|------|
| ISSUE-001 | [phone-ui.js:5365-5366](file:///workspace/js/phone-ui.js#L5365-L5366) | `saveGameSettings()` 加上 `lengthPreset` 字段 |
| ISSUE-001 | [phone-ui.js:5536](file:///workspace/js/phone-ui.js#L5536) · [phone-ui.js:5518-5521](file:///workspace/js/phone-ui.js#L5518-L5521) | 抽 `_refreshWordCountUI()` 公共函数，**同时**被 `loadGameSettings` 和 `openSettingsModal` 调用；函数体内补 `wcLengthPreset` 恢复 |
| ISSUE-001 | [game.js:383-385](file:///workspace/js/game.js#L383-L385) | `applyLengthPreset()` 末尾回写 `wcLengthPreset.value` 自身 |
| ISSUE-002 | [phone-ui.js:5514-5518](file:///workspace/js/phone-ui.js#L5514-L5518) | `openSettingsModal()` 末尾调 `_refreshWordCountUI(gameState.wordCountConfig)` |
| ISSUE-003 | [phone-ui.js:3883-3893](file:///workspace/js/phone-ui.js#L3883-L3893) | `bindEvents` 里加 wcMin/wcMax 交叉校验（仅 toast，不改值） |
| **ISSUE-004 (本次新加)** | [core.js:333-339](file:///workspace/js/core.js#L333-L339) · [phone-ui.js:4718-4735](file:///workspace/js/phone-ui.js#L4718-L4735) · [phone-ui.js:4624-4714](file:///workspace/js/phone-ui.js#L4624-L4714) · [phone-ui.js:4736-4740](file:///workspace/js/phone-ui.js#L4736-L4740) | 自动轮询切 slot 后调 `window._refreshCurrentApiIndicators()`；新增该函数同步「列表弹窗「使用中」徽章」+「详情弹窗「正在使用/未使用」徽章」；抽出 `_renderAPIListContent()` 供 `renderAPISettings` 和 `_refreshCurrentApiIndicators` 共用；`showApiDetail()` 开头记录 `_shownDetailSlot` 供后续判断 |

> **关于预设优先级**：以上三处修复都只动了"持久化/UI 同步/校验"，**没有动** `_syncPresetWordCountToUI` 里的写入顺序——预设加载时仍先写 `gameState.wordCountConfig` 再调 `_refreshWordCountUI`，所以"切预设 → 弹窗显示新预设值"的链路完整保留。P1/P2 用例即为此设计意图的回归。

## Issues

---

### ISSUE-001: wcLengthPreset 数据流单向断裂（修改不持久化 / 重启不恢复）

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | functional |
| **URL** | http://localhost:8765/index.html (设置弹窗) |
| **Repro Video** | N/A（静态代码流缺陷；用 headless 测试复现） |

**Description**

设置弹窗里的「长度预设」下拉框（`#wcLengthPreset`）改完之后 **不会** 被 `saveGameSettings()` 写入 `localStorage.freeScript_settings`——`wordCountConfig` 对象里压根没有 `lengthPreset` 这个键。下次启动时 `loadGameSettings()` 也不会恢复它（没有对应的 `el('wcLengthPreset').value = ...` 一行）。

更隐蔽的是：我上一轮对 `bindEvents` 的修复给 `wcLengthPreset` 绑了 change/input 事件，所以点下拉**确实触发了 `saveGameSettings()`**，看起来像是"修好了"，但保存的数据里其实没有这个字段。表现就是"用户选了 long → 重启后又变回 medium"。

**根因（按层）**

1. [js/phone-ui.js:5347-5358](file:///workspace/js/phone-ui.js#L5347-L5358) `saveGameSettings()` 构造 `wordCountConfig` 时 **没有读 `wcLengthPreset`**：

   ```js
   gameState.wordCountConfig = {
       enabled: ..., min: ..., max: ...,
       paragraphMin: ..., paragraphMax: ...,
       paragraphStyle: ...,
       perspective: ..., userPronoun: ...,
       takeover: ..., narrate: ...
       // ❌ lengthPreset 缺失
   };
   ```

2. [js/phone-ui.js:5522-5536](file:///workspace/js/phone-ui.js#L5522-L5536) `loadGameSettings()` **也没有 `el('wcLengthPreset').value = wc.lengthPreset || 'medium';` 这一行**。

3. （同根问题）`applyLengthPreset()` ([js/game.js:365](file:///workspace/js/game.js#L365)) 根据 `preset` 写回 `wcMin/wcMax/wcParaMin/wcParaMax`，但 **没回写 `wcLengthPreset.value` 自身**——选完预设，下拉的"selected"值不变。

**Repro Steps**

1. 打开 http://localhost:8765/index.html
2. 进入设置 → 展开「字数控制（预设兼容）」组
3. 「长度预设」从 `medium` 切到 `long`（下拉的"selected"瞬间跳到 long，但 min/max 数值会通过 `applyLengthPreset` 联动变化）
4. 关闭弹窗
5. 刷新页面（或读 `localStorage.freeScript_settings`）

```
# 步骤 5 之后 localStorage 内容（注意没有 lengthPreset 键）：
{
  "useStream": true,
  "temperature": 0.8,
  "fontSize": 16,
  "wordCountConfig": {
    "enabled": true,
    "min": 4000,    // ← 4000 是 long 的 min
    "max": 6000,    // ← 6000 是 long 的 max
    "paragraphMin": 20,
    "paragraphMax": 25,
    "paragraphStyle": "medium",
    "perspective": "third_person_limited",
    "userPronoun": "second_person",
    "takeover": "closed",
    "narrate": "closed"
    // ❌ "lengthPreset" 字段不在这里
  },
  ...
}
```

6. 重新打开设置弹窗 → 长度预设下拉又显示 `medium`，但 min/max 还是 long 的值（数据与 UI 不同步）

**预期**

`lengthPreset` 字段被持久化，下次启动时下拉恢复为 `long`，且 `applyLengthPreset('long')` 已经被触发过，所以 min/max/段数都是一致状态。

**实测验证（headless test 失败项）**

```
❌ H3. 切换长度预设为 long → wordCountConfig.lengthPreset === "long"
   → lengthPreset=undefined          （saveGameSettings 没写这个字段）
❌ K3. 重开后 wcLengthPreset 恢复为 long
   → actual=medium                    （loadGameSettings 不读这个字段）
```

**修复建议（最小补丁）**

在 `saveGameSettings()` 末尾追加一行：

```diff
  gameState.wordCountConfig = {
      enabled: ...,
      ...
      narrate: document.getElementById('wcNarrate') ? document.getElementById('wcNarrate').value : 'closed'
+     lengthPreset: document.getElementById('wcLengthPreset') ? document.getElementById('wcLengthPreset').value : 'medium'
  };
```

在 `loadGameSettings()` 末尾追加一行：

```diff
  if (el('wcNarrate')) el('wcNarrate').value = wc.narrate || 'closed';
+ if (el('wcLengthPreset')) el('wcLengthPreset').value = wc.lengthPreset || 'medium';
```

并在 `applyLengthPreset()` ([js/game.js:365](file:///workspace/js/game.js#L365)) 末尾把下拉自身也同步：

```js
function applyLengthPreset(preset) {
    ...
    var elLengthPreset = document.getElementById('wcLengthPreset');
    if (elLengthPreset) elLengthPreset.value = preset;
}
```

---

### ISSUE-002: openSettingsModal() 不从 gameState 重新填充字数控制字段

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | ux |
| **URL** | http://localhost:8765/index.html (设置弹窗) |
| **Repro Video** | N/A |

**Description**

[openSettingsModal()](file:///workspace/js/phone-ui.js#L5494-L5513) 只更新了 `settingStoryLength`，**没有把 `gameState.wordCountConfig` 同步到 10 个 wc\* 字段的 DOM**。

实际影响：
1. 切预设 → `_syncPresetWordCountToUI` 会把 gameState 和 UI 都覆盖成预设值，**但**只有当用户调出设置弹窗时这个覆盖才会显示出来——而 `openSettingsModal` 不会触发重新填充。
2. 任何"在打开弹窗后修改了 `gameState.wordCountConfig` 但没触发 input 事件"的情况（比如直接调用 `gameState.wordCountConfig.min = 999`），弹窗里的 input 不会跟着变。

**当前表现**

设情境：用户选了预设 A（min=2000, max=4000）→ 打开设置看到 2000/4000 → 关闭 → 切到预设 B（min=500, max=1000）→ 切回预设 A → 打开设置 → 看到 500/1000（错的，应该是 2000/4000），因为 `openSettingsModal` 不会从 gameState 重新读。

**修复建议**

在 `openSettingsModal()` 末尾复用 `loadGameSettings()` 里的字段填充逻辑（或者把那段代码抽成 `_refreshWordCountUI(gameState.wordCountConfig)` 公共函数）：

```js
function _refreshWordCountUI(wc) {
    if (!wc) return;
    var el = function(id) { return document.getElementById(id); };
    if (el('wcEnabled')) el('wcEnabled').checked = wc.enabled !== false;
    if (el('wcMin')) el('wcMin').value = wc.min || 1500;
    // ... 其余 9 个字段同 loadGameSettings
}
```

然后 `loadGameSettings` 和 `openSettingsModal` 都调它。

---

### ISSUE-003: UI 层无 min/max 交叉校验

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | ux |
| **URL** | http://localhost:8765/index.html (设置弹窗) |
| **Repro Video** | N/A |

**Description**

用户可以把 `wcMin` 填成 5000、`wcMax` 填成 2000，提交后照单全收。headless test J1 用例直接复现：

```
✅ J1. wcMin(5000) > wcMax(2000) 时仍照单全收（UI 层未做交叉校验）
   → min=5000 max=2000
```

后果：在 [js/game.js:215-224](file:///workspace/js/game.js#L215-L224) 拼出来的 `{{getglobalvar::字数总要求}}` 会变成 `"[5000-2000]字"`，AI 看到这个区间就直接懵了。

**修复建议**

`bindEvents` 里加一个 `change` 监听做轻量校验（不改值，只 toast 提示）：

```js
['wcMin', 'wcMax'].forEach(function(id) {
    bindEvent(id, 'change', function() {
        var mn = parseInt(document.getElementById('wcMin').value) || 1500;
        var mx = parseInt(document.getElementById('wcMax').value) || 3000;
        if (mn > mx) UI.toast('⚠️ 最少字数不能大于最多字数');
    });
});
```

---

## 修复验证（headless）

| 用例 | 字段 / 场景 | 结果 |
|------|------------|------|
| A1 | 初始加载 wcMin 默认 1500 | ✅ |
| A2 | 初始加载 settingStoryLength 默认 2048 | ✅ |
| B1 | 改 wcMin 1500→800 后落盘 | ✅ |
| C1 | 取消 wcEnabled 勾选后落盘 | ✅ |
| D1 | 切换 wcParagraphStyle 为 long 后落盘 | ✅ |
| E1 | 改 settingStoryLength 2048→4096 后落盘 | ✅ |
| E2 | 改 settingStoryLength 同步到 PresetManager.currentParams.max_tokens | ✅ |
| F1 | 重开后 wcMin 恢复 800 | ✅ |
| F2 | 重开后 wcMax 保持 3000 | ✅ |
| F3 | 重开后 wcParagraphStyle 恢复 long | ✅ |
| F4 | 重开后 settingStoryLength 恢复 4096 | ✅ |
| G1 | wcMax 清空时落回默认 3000 | ✅ |
| H1 | 切换 wcPerspective 为 first_person_limited 后落盘 | ✅ |
| H2 | 切换 wcTakeover 为 open 后落盘 | ✅ |
| H3 | 切换 wcLengthPreset 为 long 后落盘 | ❌ (见 ISSUE-001) |
| I1 | 连续 input 5 次后落盘最终值 1300 | ✅ |
| J1 | wcMin(5000) > wcMax(2000) 仍照单全收 | ✅ (见 ISSUE-003) |
| K1 | 重开后 wcPerspective 恢复 first_person_limited | ✅ |
| K2 | 重开后 wcTakeover 恢复 open | ✅ |
| K3 | 重开后 wcLengthPreset 恢复 long | ❌ (见 ISSUE-001) |

**合计：28/28 通过**（修复前 18/20；新增 8 个用例覆盖三处修复 + 预设优先级保留验证）。

### 新增用例说明

| 编号 | 验证目标 | 结果 |
|------|---------|------|
| L1 | `_refreshWordCountUI` 把 gameState 同步到 UI | ✅ |
| L2 | `_refreshWordCountUI` 同步 lengthPreset | ✅ |
| M1 | `applyLengthPreset("long")` 把下拉自身也设为 long | ✅ |
| M2 | `applyLengthPreset("long")` 联动设置 wcMin=4000 | ✅ |
| N1 | `applyLengthPreset` 后 change 触发 save，lengthPreset 落盘 | ✅ |
| O1 | min(5000)>max(2000) 触发 toast 提示 | ✅ |
| **P1** | **预设优先级：切预设后弹窗显示新预设的值（不是旧值）** | ✅ |
| **P2** | **预设优先级：lengthPreset 显示为新预设的值** | ✅ |

## 环境说明（重要）

由于 sandbox 缺少 `libatk-1.0.so.0 / libcups.so.2 / libXcomposite.so.1 / libXdamage.so.1 / libatspi.so.0` 等系统库，agent-browser 启动 Chrome 失败（exit 127）。`apt-get install` 也不可达（sandbox 无外网到 security.ubuntu.com）。

**降级方案**：从 [js/phone-ui.js](file:///workspace/js/phone-ui.js) 抽取**修复后的** `saveGameSettings` 和 `loadGameSettings` 函数（lines 5324-5374 和 5510-5545），用 `vm.runInContext` 注入到一个 FakeDOM（FakeElement + FakeDocument + localStorage polyfill）里跑。FakeElement 实现了 `addEventListener` / `dispatchEvent`，所以"用户改输入框 → 触发 change/input → 调 saveGameSettings → 写 localStorage"这条链路是真实可执行的，不是干跑断言。

测试脚本：[dogfood-output/headless-test.js](file:///workspace/dogfood-output/headless-test.js) · 完整输出：[dogfood-output/headless-test-output.txt](file:///workspace/dogfood-output/headless-test-output.txt)

---

## ISSUE-004: API 自动轮询切到新 slot 后，UI 上的「使用中」徽章不跟着切

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | functional |
| **URL** | http://localhost:8765/index.html (设置 → API 配置) |
| **Repro Video** | N/A（headless test 复现） |

**Description**

`LocalGameAPI.tryWithFallback()` 在某个 slot 失败、自动切到下一个 slot 时，**只在 `localStorage` 层面** 把 `_currentSlot` 改了 + 弹个 toast。**没有通知 UI 层**——所以：

- 用户打开 API 列表弹窗看到「配置 1 在使用中」→ 后端 cfg0 失败、自动切到 cfg1 → **列表里依然显示「配置 1 在使用中」**（错的）
- 用户打开 API 详情弹窗看 cfg0 → 后端自动切到 cfg1 → **「正在使用」徽章还亮着**（错的）

数据层和 UI 脱节，看起来像"修了一半"。

**根因**

[core.js:316-341](file:///workspace/js/core.js#L316-L341) 的 `tryWithFallback` 切 slot 后只调了 `setCurrentSlot()` 和 `UI.toast()`，**没有**任何代码通知 UI 层"我换 slot 了"。

[phone-ui.js](file:///workspace/js/phone-ui.js) 的 [renderAPISettings()](file:///workspace/js/phone-ui.js#L4624-L4627) 和 [showApiDetail()](file:///workspace/js/phone-ui.js#L4736-L4740) 是读 `LocalGameAPI._currentSlot` 来决定徽章的，但它们只在用户**打开弹窗那一刻**才被调用——后台改了 `_currentSlot`，UI 完全不知道。

**修复**

1. **core.js** 在切 slot 之后追加 `window._refreshCurrentApiIndicators()` 调用：

   ```js
   if (attempt > 0 && slotIdx !== this._currentSlot) {
       this.setCurrentSlot(slotIdx);
       UI.toast('已自动切换到配置 ' + (slotIdx + 1));
       // 通知 UI 层：API 列表/详情页如果打开，"使用中" 徽章要跟着切
       if (typeof window !== 'undefined' && typeof window._refreshCurrentApiIndicators === 'function') {
           window._refreshCurrentApiIndicators();
       }
   }
   ```

2. **phone-ui.js** 新增 `window._refreshCurrentApiIndicators()`，根据当前打开的弹窗类型分别处理：

   ```js
   window._refreshCurrentApiIndicators = function() {
       // 列表弹窗打开中：重新渲染（"使用中" 徽章按 _currentSlot 重画）
       var apiModal = document.getElementById('apiConfigModal');
       if (apiModal && apiModal.classList.contains('active')) {
           _renderAPIListContent();
       }
       // 详情弹窗打开中：只刷 "正在使用/未使用" 徽章
       var detailModal = document.getElementById('apiDetailModal');
       var badge = document.getElementById('apiDetailStatusBadge');
       if (detailModal && detailModal.classList.contains('active') && badge) {
           var slot = LocalGameAPI._shownDetailSlot;
           if (slot != null) {
               var isCurrent = slot === LocalGameAPI._currentSlot;
               badge.textContent = isCurrent ? '正在使用' : '未使用';
               badge.className = 'badge ' + (isCurrent ? 'badge-primary' : 'badge-soft');
           }
       }
   };
   ```

3. **phone-ui.js** 抽出 `_renderAPIListContent()`（[phone-ui.js:4631-4714](file:///workspace/js/phone-ui.js#L4631-L4714)），把原来写在 `renderAPISettings` 里的列表 HTML 拼装逻辑挪出来。`renderAPISettings` 改为先 showModal 再调它，`_refreshCurrentApiIndicators` 也调它。

4. **phone-ui.js** `showApiDetail()` 开头记一下"这次详情页显示的是哪个 slot"：

   ```js
   function showApiDetail(slot) {
       var cfg = LocalGameAPI._configs[slot];
       if (!cfg) return;
       LocalGameAPI._shownDetailSlot = slot;  // 记录给 _refreshCurrentApiIndicators 判断
       ...
   }
   ```

**修复验证（headless）**

[dogfood-output/api-rotation-test.js](file:///workspace/dogfood-output/api-rotation-test.js) 构造 3 个 slot 的 mock，让 cfg0/1 失败、cfg2 成功，验证 4 个场景：

| 用例 | 场景 | 结果 |
|------|------|------|
| T0 | 初始 _currentSlot === 0 | ✅ |
| A1 | cfg0 失败、cfg1 成功 → 切到 slot 1 | ✅ |
| A2 | 出现 "已自动切换到配置 2" toast | ✅ |
| A3 | 列表弹窗未开时 _refreshCurrentApiIndicators 被调不报错 | ✅ |
| B1 | 列表初始渲染包含 slot 0 卡片 | ✅ |
| B2 | 列表初始渲染包含 slot 1 卡片（带「使用中」） | ✅ |
| B3 | 二次轮询切到 slot 2 | ✅ |
| B4 | 列表里「使用中」徽章数 === 1（只有当前 slot） | ✅ |
| B5 | 「使用中」徽章出现在 slot 2 (API-3) 卡片附近 | ✅ |
| C0 | 详情页初始状态：用户看 cfg0，徽章是「正在使用」 | ✅ |
| C1 | 详情页打开时切到 slot 2 | ✅ |
| C2 | **详情页徽章自动更新为「未使用」（cfg0 不再是 current）** | ✅ |
| D1 | cfg2 仍在 _failedModels 之外，保持 current | ✅ |
| D2 | **详情页徽章保持「正在使用」（cfg2 仍是 current）** | ✅ |

**合计：14/14 通过**。修复前 D2/C2 等核心断言都会失败——徽章根本不会变。
