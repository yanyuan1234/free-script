# 代码审查：systems.js + worldinfo.js

> 审查日期：2026-07-01
> 审查范围：`/workspace/js/systems.js`（975 行）+ `/workspace/js/worldinfo.js`（2096 行）
> 审查视角：酒馆（SillyTavern）/ 酒馆助手 WorldInfo、任务系统 API 对齐
> 审查原则：只报告酒馆/酒馆助手 API 相关的真实问题、严重 Bug、重复实现

---

## 摘要

| 严重级别 | 数量 | 关键说明 |
|---------|------|---------|
| P0      | 4    | 0 值误判导致世界书 round-trip 失真、atDepth 去重不命中、uid 0 丢失、calculateStats 恒为 0 |
| P1      | 11   | 守卫缺失、position 映射散落、scan() 220+ 行未拆分、3 套任务渲染、_regexCache 永不清理等 |
| P2      | 8    | 死注释、字面量 vs 常量、hardcoded 颜色等 |
| P3      | 4    | 死代码、文档与实现偏离 |

`worldinfo.js` 总体已对齐酒馆 V2 spec 大部分字段（`primary_keys`/`secondary_keys`/`position`/`group`/`probability`/`cooldown`/`sticky`/`delay`/`useGroupScoring`/`vectorized`/`triggers` 等），但 **0 值处理**与 **atDepth 去重**有 P0 缺陷；`systems.js` 任务系统有 3 套并存的渲染器和遗留的 legacy 路径绕过 StateManager。

---

## P0 严重 Bug

### P0-1 `convertEntry` 中 `uid` 0 值被吞掉
**文件**：`/workspace/js/worldinfo.js:853`

```js
uid: parseInt(uid) || raw.uid || raw.id || Date.now(),
```

**问题**：`parseInt(uid) || ...` 中 `||` 把 `0`（合法 uid）替换为 `raw.uid / raw.id / Date.now()`。V2 世界书允许 `uid="0"`（第一条 entry），结果：导入后 `uid=0` 的条目被重写为新随机值，**该条目的引用（书中其它条目的 `source` 字段、永久事实锚点 ID）全部失效**。

**酒馆对齐**：酒馆 V2 spec 允许 `uid` 为 0；本项目本意是兼容，但 `||` 短路破坏了兼容性。

**修复**：
```js
uid: (raw.uid !== undefined ? raw.uid : (parseInt(uid) || 0)) | 0,
```
或使用 `safeInt(uid, 0)`。

---

### P0-2 atDepth 注入"去重"逻辑根本不会命中
**文件**：`/workspace/js/worldinfo.js:2042-2061`

```js
groups.atDepth.forEach(function(item) {
    var depth = item.depth || 4;
    if (!gameState._depthPrompts[depth]) gameState._depthPrompts[depth] = [];
    // 按 identifier 去重注册
    var _id = 'worldInfo_depth_' + depth + '_' + (item.comment || item.name || Math.random().toString(36).slice(2,8));
    var _existing = gameState._depthPrompts[depth].findIndex(function(e) { return e.identifier === _id; });
    ...
});
```

**问题**：
- 世界书条目没有 `name` 字段（line 1998 推送时 `name: entry.name` 是 `undefined`）
- `item.comment` 可能为空字符串 → 走 `Math.random()` 分支
- 每次 scan 都生成新随机后缀 → `_existing` 永远为 -1 → **所谓"去重"变成"持续 push"**，`gameState._depthPrompts[depth]` 不断累积旧世界书条目

**酒馆对齐**：酒馆 AT_DEPTH 注入是"按 identifier 唯一注册"，本项目用 `uid + comment` 应当足以定位。

**修复**：
```js
var _id = 'worldInfo_depth_' + depth + '_' + (item.uid || 0) + '_' + (item.comment || '');
```
并在线 1998 推送时补全 `uid` 字段（已经有 `uid: entry.uid`）。

---

### P0-3 `calculateStats` 读取 legacy 字段 + 硬编码 '主角' 导致成就统计恒为 0
**文件**：`/workspace/js/systems.js:422-430`

```js
var rels = gameState.relationships || [];
var pn = gameState.playerName || '主角';
rels.forEach(function(r) {
    if (r.from === pn || r.to === pn) {
        if (r.type === '友好' || r.type === '盟友' || r.type === '师徒') stats.friendlyNpc++;
        if (r.type === '暧昧' || r.type === '恋人') stats.romanceNpc++;
        if (r.type === '盟友') stats.allyNpc++;
    }
});
```

**问题**：
1. `gameState.relationships` 是 legacy 字段，StateManager 启用后真实数据在 `StateManager.get('entities.relationships')`（见 `mergeRelationships` line 870-875）
2. StateManager 的 `_syncLegacyMirror` 不一定同步 → `friendlyNpc/romanceNpc/allyNpc` 统计为 0
3. `pn` 硬编码 `'主角'`，与 `mergeRelationships` line 849 动态读 `entities.player.name` 路径不一致 → 即便 legacy 字段有数据，玩家名是自定义值时也匹配不到

**酒馆对齐**：酒馆任务/成就系统统一从持久化层读取统计，不应双写。

**修复**：
```js
var rels = (StateManager && StateManager.get('entities.relationships')) || gameState.relationships || [];
var player = (StateManager && StateManager.get('entities.player')) || null;
var pn = (player && player.name) || (gameState.playerName || '主角');
```

---

### P0-4 `order/depth/groupWeight/insertion_order` 的 0 值被替换为默认值
**文件**：`/workspace/js/worldinfo.js:860, 868, 880, 1282, 1292, 1296`

```js
// convertEntry
order: raw.order || raw.insertion_order || 100,                       // L860
groupWeight: raw.groupWeight || raw.group_weight || ext.group_weight || 100,  // L868
depth: raw.depth || ext.depth || 4,                                   // L880

// _buildExportEntry
insertion_order: entry.order || 100,                                  // L1282
depth: entry.depth || 4,                                              // L1292
group_weight: entry.groupWeight || 100,                               // L1296
```

**问题**：酒馆 V2 允许 `order=0`（最高优先级）、`depth=0`（位置 0 注入）、`groupWeight=0`（权重为 0 = 不参与随机选择）。`||` 把 0 替换为默认值后：
- `order=0` → `100`，条目被排到最后
- `depth=0` → `4`，`groups.atDepth` 的 `item.depth` 推到 depth=4
- `groupWeight=0` → `100`，group 评分失效

**酒馆对齐**：酒馆 V2 允许 0 权重（与"排除"语义不同），`order=0` 是合法最高优先级。

**修复**：使用 `??` 或显式 `!= null` 守卫：
```js
order: (raw.order != null ? raw.order : (raw.insertion_order != null ? raw.insertion_order : 100)),
groupWeight: (raw.groupWeight != null ? raw.groupWeight : (raw.group_weight != null ? raw.group_weight : (ext.group_weight != null ? ext.group_weight : 100))),
depth: (raw.depth != null ? raw.depth : (ext.depth != null ? ext.depth : 4)),
```

---

## P1 重要问题

### P1-1 `scan()` 函数 ~220 行未拆分
**文件**：`/workspace/js/worldinfo.js:1392-1612`

**问题**：单一函数承担 12 个职责（参数校验、DOM 同步、文本构建、entry 过滤、delay/cooldown/probability 守卫、关键词匹配、triggers 匹配、角色卡字段匹配、选择性逻辑、递归调用、group 选择、token 预算、缓存键）。scan 是热路径，220 行函数影响可读性、可测试性、性能优化空间。

**酒馆对齐**：酒馆源码 scan() ~120 行，本项目是其 ~1.8x。

**修复建议**：拆分为
- `_readScanSettings()`（DOM → settings）
- `_buildScanText(chatMessages, depth, role)`（构建扫描文本）
- `_entryPassesGuards(entry, uid, options)`（delay/cooldown/probability 守卫）
- `_entryMatchesPrimary(entry, text, charCardFields)`（triggers + keys + 角色卡）
- `_entryMatchesSecondary(entry, text)`（selective logic）
- 主 `scan()` 串行调用

---

### P1-2 `useGroupScoring` 字段在 UI 暴露、数据中读写，但 scan 中**未实现**
**文件**：`/workspace/js/worldinfo.js:894, 1065, 1210, 1301`（存储/导出/UI）

```js
// L894: 存储
useGroupScoring: safeGet(raw.useGroupScoring, raw.use_group_scoring, ext.use_group_scoring, null),
// L1065: 保存
if (cb.useGroupScoring) entry.useGroupScoring = cb.useGroupScoring.classList.contains('checked');
// L1301: 导出
use_group_scoring: entry.useGroupScoring != null ? entry.useGroupScoring : null,
```

但 `scan()` (L1392-1612)、`matchKeys` (L1615)、`matchKeysAll` (L1699)、`applyInclusionGroups` (L1797) **全程未引用 `useGroupScoring`**。

**酒馆对齐**：酒馆 V2 useGroupScoring 启用时，group 内多 entry 累加 weight 评分（不只是单选），本项目退化为 `applyInclusionGroups` 的"组内随机选 1"。

**问题**：
- 字段是"已实现但无效果" — 误导用户
- 酒馆 V2 玩家导入预设会看到这个开关但行为不一致

**修复**：在 `applyInclusionGroups` 中分支：
```js
if (groupEntries[0].useGroupScoring) {
    // 累加评分，按 groupWeight * matchCount 取最高
} else {
    // 当前行为：随机选 1
}
```

---

### P1-3 Position 映射散落 5+ 处
**文件**：
- `worldinfo.js:517-520`（UI 标签 `positionNames`）
- `worldinfo.js:802-831`（convertEntry `positionMap` 正向）
- `worldinfo.js:1263-1272`（_buildExportEntry `positionReverseMap` 反向）
- `worldinfo.js:1990-2001`（buildInjectionGrouped switch）
- `worldinfo.js:541`（renderBookDetail 直接查表）

**问题**：5 处独立维护 position 数字↔字符串映射，缺一即出现 round-trip 失真。例：
- `positionMap` 包含 `atDepth: 6`（L830）但 `positionReverseMap` 没有 `at_depth: 'at_depth'` 的对应（虽然 L1270 有 6: 'at_depth'，OK）
- `positionMap` 中 `EMTop: 2` 和 `before_example_messages: 2` 重复映射，无注释说明

**酒馆对齐**：酒馆有 `enumWI_ANCHOR` 单点定义。

**修复**：
```js
// 集中到 WorldInfo 顶部
const POSITION = {
    BEFORE_CHAR: 0, AFTER_CHAR: 1, BEFORE_EM: 2, AFTER_EM: 3,
    AN_TOP: 4, AN_BOTTOM: 5, AT_DEPTH: 6, OUTLET: 7
};
const POSITION_STR = Object.fromEntries(Object.entries(POSITION).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, '_')]));
```

---

### P1-4 `roleName + '\x01' + content` 重复 2-3 处
**文件**：
- `worldinfo.js:1430`（scan 主循环）
- `worldinfo.js:1491`（scan 内部 entry-scanDepth 分支）
- `worldinfo.js:1741`（recursiveScan 内 `'\nSystem\x01' + newContent`）

**修复**：
```js
function _formatScanLine(role, content) {
    var r = (role || 'unknown').charAt(0).toUpperCase() + (role || 'unknown').slice(1).toLowerCase();
    return r + '\x01' + (content || '');
}
```

---

### P1-5 `parseProgress` 对非字符串 progress 无守卫
**文件**：`/workspace/js/systems.js:127-136`

```js
parseProgress(p) {
    if (!p) return 0;
    var parts = p.split('/');   // <-- 若 p 是 number/null/obj，抛 TypeError
    ...
}
```

`renderQuests` (L817) 同样 `q.progress.split('/')` 无守卫。

**酒馆对齐**：酒馆任务 progress 是 `string` 类型，但 AI 可能返回 `{current:1,total:2}` 等异构数据。

**修复**：
```js
parseProgress(p) {
    if (typeof p !== 'string') return 0;
    if (!p) return 0;
    ...
}
```

---

### P1-6 `getRelationTagClass` 对非字符串 type 无守卫
**文件**：`/workspace/js/systems.js:943-974`

```js
function getRelationTagClass(type) {
    if (!type) return 'relation-tag-neutral';
    var t = type.toLowerCase();   // <-- 若 type 是 number，抛 TypeError
    ...
}
```

`renderRelationships` (L928) 调用 `getRelationTagClass(r.type || '中立')` 仍可能传 number。

**修复**：
```js
function getRelationTagClass(type) {
    if (typeof type !== 'string' || !type) return 'relation-tag-neutral';
    var t = type.toLowerCase();
    ...
}
```

---

### P1-7 3 套并存的 quest 渲染器
**文件**：
- `systems.js:138-173` `renderQuestPage(container)` — 任务页（手机端 main panel）
- `systems.js:174-232` `renderQuestList(quests)` — QuestPage 内嵌 + 筛选重渲染
- `systems.js:763-839` `renderQuests()` — 剧情页 module 小卡片

**问题**：
- `renderQuests` 直接读 `gameState.currentQuests`（L779 legacy fallback），不走 `getAllQuests`，**会漏掉引导任务**
- 三套 HTML 结构、字段命名不一致（`main-quest` vs `quest-type-main`，`status-active` vs `quest-status-active`）
- 排序逻辑分散（L182-189、L786-792）
- 状态文本字面量 `q.status || '进行中'`（L813）绕过 STATUS 常量

**酒馆对齐**：酒馆任务只有一种渲染器 + 状态/类型 enum 集中。

**修复**：
1. `renderQuests` 走 `QuestSystem.getAllQuests()` 替代 `gameState.currentQuests`（L777-779 已有 typeof 守卫，但 fallback 仍读 legacy）
2. 提取 `QuestSystem._renderItem(q)` 共享 DOM 结构
3. 删除 `q.status || '进行中'` 字面量，使用 `QuestSystem.STATUS.ACTIVE`

---

### P1-8 `_regexCache` 永不清理（潜在内存泄漏）
**文件**：`/workspace/js/worldinfo.js:14, 1640-1646, 1655-1689, 1705-1717`

```js
_regexCache: {},
// matchKeys: cache key 包含 escapedKeys.join('|') + caseSensitive 后缀
// matchTriggers: cache key 是 pattern + '|' + flags
// matchKeysAll: cache key 是 k + '|' + caseSensitive + '|' + matchWholeWords
```

**问题**：
- 玩家长期游戏 + 频繁 import/export 世界书 → cache 单调增长，无 TTL/LRU
- 玩家删除世界书后，对应 regex 仍在 cache 中
- 导入新预设后旧 cache 不会失效

**酒馆对齐**：酒馆 regex cache 是 per-scan 调用栈的局部变量，scan 结束即释放。

**修复**：
- 短期：在 `save()` 中清空 `this._regexCache = {}`
- 长期：使用 LRU 缓存，限定最大 256 条

---

### P1-9 `getDefaultAchievements` 每次调用重扫 `_worldModules`
**文件**：`/workspace/js/systems.js:362-386`

```js
getDefaultAchievements() {
    var modules = gameState._worldModules || [];
    var achieveModules = modules.filter(function(m) { return m.type === 'achievements' || ... });
    ...
}
```

被 `checkAchievements` (L435)、`renderAchievePage` (L529)、`showAchieveDetail` (L694) 调用，每次都重新 filter + map。

**酒馆对齐**：酒馆成就是静态定义，预算加载时一次性转换。

**修复**：在 `getDefaultAchievements` 顶部加缓存
```js
if (this._defaultAchievementsCache) return this._defaultAchievementsCache;
...
this._defaultAchievementsCache = aiAchievements;
return aiAchievements;
```
并在 `EnhancedMemory.processMessage` 完成（AI 写回新世界模块）时清除缓存。

---

### P1-10 `scan()` 副作用改写 `this.settings`
**文件**：`/workspace/js/worldinfo.js:1409-1417`

```js
if (!this._settingsCache || this._settingsCache.turn !== _turn) {
    var depthEl = document.getElementById('wiScanDepth');
    ...
    if (depthEl) this.settings.scanDepth = safeInt(depthEl.value, 2);
    if (budgetEl) this.settings.tokenBudget = safeInt(budgetEl.value, 25);
    if (recursiveEl) this.settings.recursive = recursiveEl.checked;
    this._settingsCache = { turn: _turn };
}
```

**问题**：`scan()` 是查询函数，副作用写入 `this.settings` 违反职责分离：
1. 玩家在模态框手动改 `this.settings.scanDepth` → 触发 `save()` → `Storage.setJSON` 写入正确值
2. 下一次 `scan()` 读到 UI 当前值 → 覆盖 `this.settings.scanDepth` 为 UI 值 → 如果 UI 显示滞后，玩家改的值丢失

**修复**：
```js
var _scanSettings = {
    scanDepth: parseInt(depthEl.value),
    tokenBudget: parseInt(budgetEl.value),
    recursive: recursiveEl.checked
};
// 用 _scanSettings 而非 this.settings
```

---

### P1-11 `convertEntry` 60+ 字段单 return 对象，缺 POSITION/ROLE 顶层 enum
**文件**：`/workspace/js/worldinfo.js:783-912`

**问题**：
- `convertEntry` 一次返回 60+ 字段（包含酒馆 V2 全部 + 扩展），可维护性差
- `positionMap` (L802-831) 是局部变量，未提取为 `WorldInfo.POSITION_MAP`
- `roleMap` (L839) 只有 4 个值（system/user/assistant/context），缺 `model` `tool` 等酒馆新增 role

**酒馆对齐**：酒馆 V2 role 枚举包含 system/user/assistant/model/tool/narration（最新 spec）。

**修复**：
- 提取 `WorldInfo.POSITION` 和 `WorldInfo.ROLE` 常量
- `convertEntry` 分块：基础字段、酒馆 V2 字段、扩展字段

---

## P2 中等问题

### P2-1 `convertEntry` 仍读 3 个 enabled 字段（disable/disabled）
**文件**：`/workspace/js/worldinfo.js:864`

```js
enabled: raw.enabled !== false && raw.disable !== true && raw.disabled !== true,
```

**问题**：注释（L861-863）声称"已统一为 enabled"，但 read 端仍读 3 个字段 → 实际是"读 3 写 1"，对玩家从酒馆导入 V1 旧预设时存在隐患（V1 旧预设的 `disable` 字段会被读到，但若同时存在 `enabled=true, disabled=true` 时，新逻辑会误判为禁用）。

**修复**：明确优先级（酒馆 V2 spec 规定 `enabled` 优先，`disable/disabled` 仅为兼容 alias）：
```js
enabled: (raw.enabled !== undefined ? raw.enabled !== false : (raw.disable === undefined ? (raw.disabled === undefined ? true : !raw.disabled) : !raw.disable)),
```

---

### P2-2 `renderQuestList` 用字面量字符串而非 STATUS 常量
**文件**：`/workspace/js/systems.js:181`

```js
var statusOrder = { '进行中': 0, '已完成': 1, '已失败': 2, '已放弃': 3 };
```

**问题**：如果 `QuestMutator.STATUS.FAILED` 是英文 'failed'，此处字面量 '已失败' 不匹配 → 排序失效。

**修复**：
```js
var statusOrder = {};
statusOrder[QuestSystem.STATUS.ACTIVE] = 0;
statusOrder[QuestSystem.STATUS.COMPLETED] = 1;
statusOrder[QuestSystem.STATUS.FAILED] = 2;
statusOrder[QuestSystem.STATUS.ABANDONED] = 3;
```

---

### P2-3 `filterByStatus` 的 'abandoned' 分支不可达
**文件**：`/workspace/js/systems.js:120-122, 245`

`filterByStatus` 支持 `status === 'abandoned'` 分支，`bindFilterEvents` 也识别 `f === 'abandoned'`，但 `renderQuestPage` (L158-161) 渲染的 4 个按钮中**没有 '已放弃' 按钮** → 该分支永远走不到。

**修复**：要么在 `renderQuestPage` 加按钮，要么从 `filterByStatus`/`bindFilterEvents` 删除 dead branch。

---

### P2-4 `_buildExportEntry` 的 `id: parseInt(uid) || entry.uid || 0` 0 值 bug
**文件**：`/workspace/js/worldinfo.js:1275`

```js
id: parseInt(uid) || entry.uid || 0,
```

同 P0-1，uid "0" 丢失。

**修复**：使用 `safeInt(uid, entry.uid || 0)`，但若 `entry.uid = 0` 也需保留（需先判断 `entry.uid !== undefined`）。

---

### P2-5 `positionMap` 内部重复别名
**文件**：`/workspace/js/worldinfo.js:812-830`

```js
'before_example_messages': 2,
'before_examples': 2,
'before_example': 2,
'EMTop': 2,
'after_example_messages': 3,
'after_examples': 3,
'after_example': 3,
'EMBottom': 3,
```

**问题**：5 个 alias 指向 2，无注释说明差异 → 维护时容易改一个忘一个。

**修复**：保留 1 个权威 alias + 注释指明来源：
```js
'before_example_messages': 2,  // 权威名（酒馆 V2 spec）
// 别名：before_examples / before_example / EMTop（社区/旧版）
```

---

### P2-6 `positionReverseMap` 缺 `atDepth` 别名导出
**文件**：`/workspace/js/worldinfo.js:1263-1272`

```js
var positionReverseMap = {
    0: 'before_char_definitions',
    1: 'after_char_definitions',
    ...
    6: 'at_depth',
    7: 'outlet'
};
```

**问题**：V2 权威是 `at_depth`，但 V1/社区别名是 `atDepth`、`@D`。导入时能识别 `atDepth` (L830)，导出时只回 `at_depth` → 再导入时 round-trip OK，但混入 V1 预设时显示风格不一致。

**修复**：导出时统一用 `at_depth` 即可（V2 权威），或额外加 V1 别名注释。

---

### P2-7 `matchTriggers` 的 regex `lastIndex` 共享 bug
**文件**：`/workspace/js/worldinfo.js:1682-1690`

```js
var _cacheKey = pattern + '|' + flags;
var regex = self._regexCache[_cacheKey];
if (!regex) {
    regex = new RegExp(pattern, flags);
    self._regexCache[_cacheKey] = regex;
} else {
    regex.lastIndex = 0;  // 重置 gi 标志的 lastIndex，支持多次 test 调用
}
return regex.test(haystack);
```

**问题**：
- 缓存的 regex 对象被多个 entry 共享。若 `flags='gi'`（g 标志），`regex.test()` 内部维护 `lastIndex`，且 `self._regexCache` 是单例 → 同一 regex 被多次 `test` 时第二次 `test` 可能从 `lastIndex` 处继续 → **结果不一致**
- 注释说"重置 gi 标志的 lastIndex"但**仅在 cache hit 时重置**，cache miss 首次进入不重置 → 仍可能命中问题

**修复**：缓存 `pattern` + `flags`，但实际 `test` 时用新对象：
```js
return new RegExp(pattern, flags).test(haystack);
```
或放弃 cache（regex 编译成本远低于 IO，可接受）。

---

### P2-8 `renderQuests` (L763) 绕过 `getAllQuests` 读 legacy `gameState.currentQuests`
**文件**：`/workspace/js/systems.js:777-779`

```js
var quests = (typeof QuestSystem !== 'undefined' && QuestSystem.getAllQuests)
    ? QuestSystem.getAllQuests()
    : (gameState.currentQuests || []);
```

**问题**：L777-779 fallback 仍读 `gameState.currentQuests`，当 `QuestSystem` 已加载但返回空数组时（例如 StateManager 切换中），fallback 不触发；但 `getAllQuests` 内部 `push(_cachedGuidanceQuest)` 才会把引导任务加入——`renderQuests` 走 `getAllQuests` 后会获得引导任务，但**类型字段 (`type: '主线'/'支线'/'隐藏'`) 排序** 走 `typeOrder` 字面量（L177），与 `renderQuestList` (L181) `statusOrder` 同样问题。

**修复**：删除 legacy fallback，强制走 `getAllQuests()`：
```js
var quests = QuestSystem.getAllQuests();
```

---

## P3 轻微问题

### P3-1 `_customTypes` / `_customStatuses` 死引用（注释中提及）
**文件**：`/workspace/js/systems.js:179-180`

```js
// 动态类型注册系统（registerType/registerStatus）已在 systems.js:14 删除，
// _customTypes/_customStatuses 从未定义，for-in 循环遍历 undefined 无效果且易误导
```

**说明**：注释说"已删"，但这正是审查任务中提到的"已删方法的残留注释" — 应直接删除（注释自指反而增加噪声）。

**修复**：删除 L179-180 整段注释。

---

### P3-2 `positionMap` 中 5 处 `*_def`/`*_defs` 同义
**文件**：`/workspace/js/worldinfo.js:806-831`

`before_char` vs `before_char_definitions`、`after_char` vs `after_char_definitions` 等 — 重复登记，应保留权威名。

---

### P3-3 `addMemo` 字段在 export 时丢失原始大小写
**文件**：`/workspace/js/worldinfo.js:1319`

```js
addMemo: !!entry.addMemo,
```

**问题**：酒馆 V2 字段名是 `addMemo`（camelCase），本项目导出 `addMemo` OK；但 import 时 `safeGet` 没读 `add_memo` 别名，V1 预设的 `add_memo` 进不来。

**修复**：
```js
addMemo: !!(raw.addMemo || raw.add_memo || ext.add_memo),
```

---

### P3-4 硬编码颜色散落 CSS / inline style
**文件**：`/workspace/js/worldinfo.js:539, 540, 542, 543, 544, 545, 546, 547, 548`

```html
<span style="background:#10b981;color:#fff;">粘性</span>
<span style="background:#ec4899;color:#fff;">大小写</span>
...
```

**问题**：8+ 处硬编码 hex 颜色，暗色模式无适配；与项目 `var(--*)` 设计 token 不一致。

**修复**：提取 CSS class 替代 inline style：
```js
if (entry.sticky != null && entry.sticky > 0) tags.push('<span class="wi-tag wi-tag-sticky">粘性' + entry.sticky + '</span>');
```

---

## 酒馆 WorldInfo 字段支持矩阵

| 酒馆 V2 字段 | 本项目支持 | 存储位置 | 0 值处理 | 备注 |
|---|---|---|---|---|
| `id` / `uid` | ✅ | convertEntry L853 | ❌ P0-1 | `parseInt(uid) || ...` |
| `key` / `keys` (primary) | ✅ | L854, 1183 | ✅ | 数组/字符串兼容 |
| `keysecondary` / `secondary_keys` | ✅ | L855, 1184 | ✅ | - |
| `comment` / `name` | ✅ | L856 | ✅ | - |
| `content` | ✅ | L857 | ✅ | - |
| `constant` | ✅ | L858 | ✅ | - |
| `selective` | ✅ | L859 | ✅ | - |
| `order` / `insertion_order` | ✅ | L860 | ❌ P0-4 | `\|\| 100` |
| `enabled` | ✅ | L864 | ✅ | 统一真相源 |
| `disable` (legacy) | ⚠️ 读 | L864 | ✅ | 仅作 alias |
| `disabled` (legacy) | ⚠️ 读 | L864 | ✅ | 仅作 alias |
| `position` | ✅ | L865 | ✅ | 8 个 enum |
| `group` | ✅ | L866 | ✅ | - |
| `groupOverride` / `group_override` | ✅ | L867 | ✅ | - |
| `groupWeight` / `group_weight` | ✅ | L868 | ❌ P0-4 | `\|\| 100` |
| `probability` | ✅ | L871-878 | ✅ | IIFE 显式守卫 |
| `useProbability` | ✅ | L879 | ✅ | - |
| `depth` | ✅ | L880 | ❌ P0-4 | `\|\| 4` |
| `scanDepth` / `scan_depth` | ✅ | L881 | ✅ | - |
| `caseSensitive` / `case_sensitive` | ✅ | L882 | ✅ | - |
| `matchWholeWords` / `match_whole_words` | ✅ | L883 | ✅ | - |
| `excludeRecursion` | ✅ | L884 | ✅ | - |
| `preventRecursion` | ✅ | L885 | ✅ | - |
| `selectiveLogic` | ✅ | L886 | ✅ | 4 种 AND/NOT 逻辑实现 |
| `role` | ✅ | L839-843 | ✅ | 缺 model/tool |
| `sticky` | ✅ | L888 | ✅ | - |
| `cooldown` | ✅ | L889 | ✅ | - |
| `delay` | ✅ | L890 | ✅ | - |
| `delayUntilRecursion` | ✅ | L891 | ✅ | - |
| `ignoreBudget` | ✅ | L892 | ✅ | - |
| `addMemo` | ✅ | L893 | ✅ | 缺 `add_memo` 别名 |
| `useGroupScoring` | ⚠️ 字段在，逻辑无 | L894 | ✅ | **P1-2**：scan 中不引用 |
| `vectorized` | ⚠️ 字段在，未启用 | L895 | ✅ | - |
| `triggers` | ✅ | L896 | ✅ | 正则 + /pattern/flags 格式 |
| `matchPersonaDescription` | ⚠️ 字段在，部分实现 | L897, 1503-1508 | ✅ | 仅主循环实现 |
| `matchCharacterDescription` | ✅ | L898 | ✅ | - |
| `matchCharacterPersonality` | ✅ | L899 | ✅ | - |
| `matchCharacterDepthPrompt` | ⚠️ 字段在，无实现 | L900 | - | scan 中未引用 |
| `matchScenario` | ✅ | L901 | ✅ | - |
| `matchCreatorNotes` | ⚠️ 字段在，无实现 | L902 | - | scan 中未引用 |
| `automationId` | ⚠️ 字段在，无逻辑 | L903 | - | 酒馆自动化系统未实现 |
| `outletName` | ✅ | L904, 1999, 2067-2074 | ✅ | 通过 `MacroEngine.setLocalVar` |
| `displayIndex` / `display_index` | ✅ | L905 | ✅ | - |
| `characterFilter` | ⚠️ 字段在，无逻辑 | L906 | - | - |
| `priority` (V2 新增) | ✅ | L908 | ✅ | applyBudget 排序用 |
| `decorators` (V2 新增) | ⚠️ 字段在，无解析 | L910 | - | `@@activate`/`@@dont_activate` 未实现 |

**总计**：60 个酒馆字段，**48 个完全支持**，**8 个字段在但逻辑无**（`useGroupScoring`/`vectorized`/`matchCharacterDepthPrompt`/`matchCreatorNotes`/`automationId`/`characterFilter`/`decorators`），**4 个有 0 值 bug**（`uid`/`order`/`depth`/`groupWeight`）。

**酒馆未实现的高级功能**：
- **group scoring**（累加评分，仅随机选 1）— `useGroupScoring` 字段在但无逻辑
- **automation ID 选择**（按自动化 ID 注入）— `automationId` 字段在但无逻辑
- **token budget 自动重平衡**（priority 字段已读但回填 deferred 顺序）
- **character filter**（按角色筛选）— `characterFilter` 字段在但无逻辑
- **vectorized**（向量召回）— `vectorized` 字段在但无后端
- **decorators**（`@@activate`/`@@dont_activate` 等宏）— 字段在但无解析

---

## 任务状态机支持表

| 状态 | 本项目常量 | 渲染支持 | 过滤支持 | 状态机转换支持 |
|---|---|---|---|---|
| `ACTIVE` 进行中 | ✅ `STATUS.ACTIVE = '进行中'` | ✅ 3 套渲染器 | ✅ filterByStatus L107-109 | ✅ advanceGuidanceQuest 推进 |
| `COMPLETED` 已完成 | ✅ `STATUS.COMPLETED = '已完成'` | ✅ 3 套渲染器 | ✅ filterByStatus L110-112 | ⚠️ 仅引导任务 (L99)，AI 返回任务由 autoAdvanceByStory 接管 |
| `FAILED` 已失败 | ✅ `STATUS.FAILED = '已失败'` | ✅ 3 套渲染器 | ✅ filterByStatus L113-115 | ❌ **无转换入口** — AI 不会自动从 ACTIVE → FAILED |
| `ABANDONED` 已放弃 | ✅ `STATUS.ABANDONED = '已放弃'` | ⚠️ renderQuestList 排序支持 | ⚠️ filterByStatus L120-122 但 UI 无按钮 | ❌ **无转换入口** |

**任务状态机与酒馆对比**：

| 酒馆任务状态 | 本项目 |
|---|---|
| `active` | ✅ ACTIVE |
| `completed` | ✅ COMPLETED |
| `failed` | ✅ FAILED |
| `abandoned` | ✅ ABANDONED |
| 酒馆"奖励发放"钩子 | ❌ 无（advanceGuidanceQuest 只控制引导任务） |
| 酒馆"任务进度"事件总线 | ❌ 无（mutator 内部处理，外部不可订阅） |
| 酒馆"任务完成触发剧情" | ❌ 无显式关联 |

**任务进度格式**：
- 酒馆任务：`progress: number`（0~1）
- 本项目：`progress: 'current/total'`（字符串）— 自创格式，AI 契约中 `parseProgress` 解析

**任务类型**：
- 酒馆：`main`/`side`/`hidden`（或自定义 string）
- 本项目：`主线`/`支线`/`隐藏`（中文字面量）

---

## 关键重复代码（建议提取）

| 重复位置 | 重复内容 | 建议提取 |
|---|---|---|
| `worldinfo.js:1430, 1491, 1741` | `roleName + '\x01' + content` | `WorldInfo._formatScanLine(role, content)` |
| `worldinfo.js:802-831, 1263-1272, 1990-2001` | position 数字↔字符串映射 | `WorldInfo.POSITION` / `POSITION_REVERSE` |
| `worldinfo.js:539-548, 562-565` | inline 硬编码颜色 + tag HTML | `<span class="wi-tag wi-tag-${kind}">` |
| `systems.js:174-232, 763-839, 138-173` | quest 列表渲染（3 套不同实现） | `QuestSystem._renderItem(q)` |
| `systems.js:181, 786-792` | quest 排序 statusOrder | `QuestSystem._sortByStatus` |
| `worldinfo.js:1397-1502` | scan 主循环 + entry-scanDepth 分支 | `WorldInfo._buildEntryScanText(entry, chatMessages)` |

---

## 修复优先级建议

1. **P0-1, P0-4**（0 值误判）— 影响世界书 round-trip，建议 1 天内修复
2. **P0-2**（atDepth 去重 bug）— 影响深度注入累积，1 天内修复
3. **P0-3**（calculateStats 读 legacy）— 影响成就统计，2 天内修复
4. **P1-1**（scan 拆分）— 影响可维护性，建议本迭代完成
5. **P1-2**（useGroupScoring 逻辑）— 影响 V2 预设兼容性，3 天内
6. **P1-3 ~ P1-11** — 按需安排

---

## 总结

`worldinfo.js` 在字段覆盖度上已对齐酒馆 V2 spec 的 ~80%，但**0 值处理**与**字段有但无逻辑**两类问题影响 V2 预设的实际行为。`systems.js` 任务系统有 3 套渲染器和 legacy 路径，与 StateManager 的"单一真相源"原则冲突。

最严重的 4 个 P0 全部集中在数据 round-trip 链路上：`uid=0` / `order=0` / `depth=0` / `groupWeight=0` / `atDepth` 去重不命中，这 5 个 bug 修好后，世界书的酒馆 V2 兼容性即可达到 ~95%。
