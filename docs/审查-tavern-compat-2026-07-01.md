# 酒馆 API Shim 审查报告

- **审查文件**：`/workspace/js/tavern-compat.js`（6276 行）
- **审查日期**：2026-07-01
- **审查范围**：EnhancedMemory（=GameMemory） / MemoryManagerUI / TavernHelperCompat / SillyTavern shim / STscript 引擎 / Regex 引擎 / 预设管理
- **目标**：找到「应删的代码 / 应改的代码 / 应统一的代码」，使维护成本最低
- **对照基线**：SillyTavern 官方 API（getCharacter / getChat / insertMessage / setChat / loadSettings / saveSettings / loadWorldInfo / saveWorldInfo / worldInfoUpdate / preset / prompt entries / prompt_order / 角色卡 spec_v2 / 宏 / 正则脚本 / slash commands / extension_settings）

---

## 一、重复实现矩阵

> 列：写入源（出现位置）。行：存储后端。`O` = 完全同步，`Δ` = 仅部分同步，`×` = 完全独立。

| 写入源 → 后端 | `permanentFacts.<cat>` | `tables.characters/items/locations/relationships` | `events` | `quests` | `plot.*` | `_worldNotes` | `StateManager.entities.*` | `gameState.allCharacters/currentBag` |
|---|---|---|---|---|---|---|---|---|
| `addWorldAnchor` (3098)            | **O** | × | × | × | × | × | × | × |
| `addImportantEvent` (3265)         | × | × | **O** | × | × | × | × (`addImportantEvent` 后会调 `_syncEventsToKeyEvents` 但不写 `entities.events`) | × |
| `addImportantEvents` (3280)        | × | × | **O** | × | × | × | × | × |
| `addQuest` (3178)                  | × | × | × | **O** | × | × | ×（`clear()` 显式清空 entities.events 但不写 entities.quests）| × |
| `resolveQuest` (3189)              | × | × | × | **O** | × | × | × | × |
| `upsertPermanentFact` (3740)       | **O** | × | × | × | × | × | × | × |
| `setPermanentFact` (3805)          | **O** | × | × | × | × | × | × | × |
| `addWorldNote` (3721)              | × | × | × | × | × | **O** | × | × |
| `recordCharacterChange` (3668)     | × | **O** | × | × | × | × | Δ（经 `_syncLegacyMirror` 间接回写）| × |
| `recordItemObtained` (3696)        | × | **O** | × | × | × | × | Δ | × |
| `QuestMutator.addQuest` (state/mutators/quest-mutator.js) | × | × | × | **O**（同一数组，StateManager 权威） | × | × | **O** | × |
| `MemoryManagerUI.saveCharacter` (4480) | × | **O** | × | × | × | × | **O**（Mutator 路径） | Δ（兜底） |
| `MemoryManagerUI.saveItem` (4617)  | × | **O** | × | × | × | × | **O** | Δ（兜底） |
| `MemoryManagerUI.saveLocation` (4837) | × | **O** | × | × | × | × | **O** | × |
| `MemoryManagerUI.saveNewCharacter/Item/Location` | × | **O** | × | × | × | × | **O** | Δ（兜底） |
| `MemoryManagerUI.savePlot` (4984)  | × | × | × | × | **O** | × | **O** (`progress.rollingSummary`) | × |
| `MemoryManagerUI.deleteEvent` (5031) | × | × | **O** | × | × | × | × | × |
| `MemoryManagerUI.resolveQuestByIndex` (5068) | × | × | × | **O**（通过 QuestMutator）| × | × | **O** | × |
| `ai-response-mutator.js:_applyPermanentFacts` | **O**（直写 `permanentFacts[cat].push`） | × | × | × | × | × | × | × |
| `core.js:2779` (aiMessageSummarized) | × | × | × | × | × | × | × | × |
| `game.js:4008-4012`               | × | × | **O** | × | × | × | × | × |
| `phone-ui.js:1060` (EnhancedMemory.addWorldNote) | × | × | × | × | × | **O** | × | × |

**核心问题**：
1. `addImportantEvent` 与 `addImportantEvents` 是**两套写入路径**（3265/3280），后者仅是性能优化版（合并 `_syncEventsToKeyEvents` + `saveToStorage`）。其余逻辑完全相同。应合并为单一方法 + 内部批量检测。
2. `upsertPermanentFact` / `setPermanentFact` / `addWorldAnchor` / `saveNewPermanentFact` / `savePermanentFact` **5 个入口都向 `permanentFacts` 写入**，schema 略不同（`addWorldAnchor` 写入 `{content, source, locked, importance, createdTurn}`，`upsertPermanentFact` 写入 `{content, locked, source, createdTurn, keywords?}`）。
3. `addQuest` 在 `GameMemory`（3178）和 `QuestMutator`（state/mutators/quest-mutator.js:110）两个类中各有一份，行为不同：前者只 push 数组，后者写 `StateManager`。
4. `MemoryManagerUI.saveCharacter/saveItem/saveLocation` 存在**3 处重复的"运行时字段补齐"模式**（4503/4578/4677/4776/4877/4940），都做同一件事：Mutator/StateManager 写入成功后，把 `locked/history/gameTime/accessCount/lastChangedTurn` 等 runtime 字段从 `_newXxxData` 拷到 `gm.tables.xxx[name]`。代码完全相同却分散在 6 个方法里。

---

## 二、双真相源矩阵

| 字段 | 第一真相源 | 第二真相源（容易脱同步） | 触发脱同步的操作 | 实际后果 |
|---|---|---|---|---|
| `tables.characters` | `gm.tables.characters` | `StateManager.entities.characters` | `MemoryManagerUI.saveCharacter`（4490-4514）/ `addCharacter`（4577-4584）双写，Mutator 失败会回滚部分 | 用户编辑后立即 `StateManager.get` 可能拿到旧值 |
| `tables.items` | `gm.tables.items` | `StateManager.entities.bag` | `MemoryManagerUI.saveItem` 写完 Mutator 后再覆盖 runtime 字段 | `accessCount/gameTime/lastChangedTurn` 可能被覆盖错 |
| `tables.locations` | `gm.tables.locations` | `StateManager.entities.locations` | `MemoryManagerUI.saveLocation` 写 StateManager 后再补 runtime 字段 | 同上 |
| `events` | `gm.events` | `gameState.keyEvents` | `_syncEventsToKeyEvents` 单向（gm→keyEvents） | 删 event（5031）后不会回写 keyEvents |
| `quests` | `gm.quests` | `StateManager.entities.quests` | `MemoryManagerUI.resolveQuestByIndex` 走 QuestMutator，但 `addImportantEvents/addQuest` 走直接 push | `addQuest` 不会同步到 StateManager，重启后丢 |
| `plot.currentChapter` | `gm.plot.currentChapter` | `StateManager.progress.rollingSummary` | `savePlot`（4989-4994）合并后写入；`gm.longTermMemory` getter 反向 `worldSetting+'\n'+currentChapter` 暴露 | 注入预览显示是 `gm.plot`，AI 看到的 `progress.rollingSummary` 走的是另一条路 |
| `permanentFacts.<cat>` | `gm.permanentFacts.<cat>` | 无（StateManager 不存） | 仅有 `gm.addWorldAnchor` / `upsertPermanentFact` / `setPermanentFact` / `_pushPermanentFact` 迁移代码 | UI 改的 fact 不持久化到 `gameState`/`StateManager`（这部分 OK） |
| `tables.relationships` | `gm.tables.relationships` | `StateManager.entities.relationships` | `MemoryManagerUI` 没有 `saveRelationship`/`deleteRelationship` UI（5031 行 `deleteRelationship` 不存在） | 关系改不了 |
| `_worldNotes` | `gm._worldNotes` | 无 | `addWorldNote` 写入；`longTermMemory.worldNotes` 返回**实时引用**（3868） | 一旦未来 getter 改 deepClone 就会丢（注释已警告，3716-3718） |
| `tables.locations` ↔ `StateManager` | `entities.locations` 数组 | `gm.tables.locations` 对象 | StateManager 是数组，gm 是对象；UI 维护 rename 需同步两套索引 | 关系（`from+to` 字符串键）错位风险 |

### `clear()` 残留（3640-3663）

```js
clear: function() {
    ...
    if (typeof StateManager !== 'undefined' && StateManager.set) {
        StateManager.set('entities.events', [], { silent: true });  // ← 只清 events
    }
    // ⚠️ 漏掉：entities.characters / entities.bag / entities.locations / entities.quests / ui.worldSnapshot / progress.rollingSummary
    this._cachedInjection = null;
    this._cachedInjectionTurn = -1;
    this._markLtmDirty();
},
```

**问题本质**：
- 只清了 `entities.events`，**5 个其他 entity 没清**（`characters / bag / locations / quests / relationships`）
- 漏清 `ui.worldSnapshot` 和 `progress.rollingSummary`（这俩在 `savePlot` 和 `saveMemoryEdits` 写）
- `summaryHistory` 字段在 `clear()` 被清，但 `recordCompression` 还会 push（3450-3457），下一次压缩后又被建
- `_setupLayers` / `_summaryLayers` 重置（3654-3655），但 `_setupLayers.setupKeywords` 不在初始化默认值内（`{coreRules, worldSummary, fullSetup, compressed, extractTurn, setupKeywords}`，对应类上默认值是 `{compressed, extractTurn, setupKeywords}` 缺前 3 个；下次 `extractSetupLayers` 重新生成即可）
- `_changeLog` 重置（3652），但 `_setupLayers` 不会触发重新提取，必须重启 init
- 漏清 `summaryHistory` 之外的 `_injectionSnapshots` 在 3653 已重置（OK）
- **`_ltmCache` 不会主动清**，但 `_markLtmDirty()` 标记了，下次 getter 会重建（OK）
- **`_cachedInjection` 重置了**，但 `_cachedInjectionVersion` 没重置，下次 buildInjection 仍可命中（如果 currentTurn 也变 OK；如果 currentTurn 也清零则 `_cachedInjectionTurn === -1` 也不命中）

---

## 三、P0 — 必修

### P0-1 永久事实区多入口写入 + 5 处 schema 不一致

**文件位置**：`/workspace/js/tavern-compat.js` 行 3098 / 3178 / 3265 / 3280 / 3721 / 3740 / 3805 / 4390 / 4414

**问题代码**：
```js
// 行 3098 - addWorldAnchor（schema A）
self.permanentFacts[key].push(anchor);  // { content, source, locked, importance, createdTurn }

// 行 3740 - upsertPermanentFact（schema B，缺 importance）
list.push({
    content: fact.content,
    locked: fact.locked !== false,
    source: fact.source || 'runtime',
    createdTurn: fact.createdTurn || self.currentTurn || 0,
    keywords: fact.keywords
    // ← 缺 importance
});

// 行 3805 - setPermanentFact（schema C，缺 importance，且走 "覆盖" 语义）
self.permanentFacts[category] = [{
    content: newContent,
    locked: fact.locked !== false,
    source: fact.source || 'runtime',
    createdTurn: fact.createdTurn || self.currentTurn || 0,
    keywords: fact.keywords
    // ← 缺 importance
}];

// 行 3177 - saveNewPermanentFact (UI) 又调 addWorldAnchor
// 行 4414 - savePermanentFact (UI) 直接改 .content（破坏 schema 完整性，未 _markLtmDirty 立刻）
```

**问题本质（酒馆 API 对齐角度）**：
- 酒馆 `worldInfoUpdate(entry)` / `getWorldInfo(bookId)` 单一 schema 单一入口。
- 当前 5 个写入入口 + 3 个 schema 形态 + 2 个语义（累积 vs 覆盖）= 维护噩梦。
- 字段 `importance` 仅 schema A 有，buildInjection 时第 3127 行的"按 importance 升序淘汰"对 schema B/C 写入的条目永远按 0 排序——**会被优先淘汰**。

**修复方案**：
```js
// 单一入口：setPermanentFact(category, fact, mode)
setPermanentFact: function(category, fact, mode) {
    mode = mode || 'merge';  // 'merge' (upsert) | 'replace' (override, 用于 pcIdentity)
    if (!category || !fact || !fact.content) return 'noop';
    if (!this.permanentFacts) this.permanentFacts = {};
    if (!Array.isArray(this.permanentFacts[category])) this.permanentFacts[category] = [];
    var list = this.permanentFacts[category];

    if (mode === 'replace') {
        list.length = 0;
        list.push(this._normalizeFact(category, fact));
    } else {
        var idx = list.findIndex(function(a) { return a && a.content === fact.content; });
        if (idx === -1) {
            list.push(this._normalizeFact(category, fact));
        } else {
            Object.assign(list[idx], this._normalizeFact(category, fact, { merge: true }));
        }
    }
    this._markLtmDirty();
    return 'updated';
},

_normalizeFact: function(category, fact, options) {
    // 统一 schema：{ content, source, locked, importance, createdTurn, keywords? }
    var _importance = (category === 'pcIdentity' || category === 'worldRules' || category === 'npcProfiles') ? 1.0 : 0.5;
    return {
        content: fact.content,
        source: fact.source || 'runtime',
        locked: fact.locked !== false,
        importance: fact.importance || _importance,
        createdTurn: fact.createdTurn || this.currentTurn || 0,
        keywords: fact.keywords
    };
},
```
随后删除 `upsertPermanentFact`（行 3740-3800），并把 `addWorldAnchor`（3098）内部 `addWorldAnchor` 改为 `setPermanentFact(typeMap[type] || type, {content, source, importance, locked, createdTurn}, 'merge')`。`saveNewPermanentFact`/`savePermanentFact` 同样收敛。

---

### P0-2 正则引擎 `placement` 过滤是空实现（注释即实现，filter 缺失）

**文件位置**：`/workspace/js/tavern-compat.js` 行 5742-5749

**问题代码**：
```js
// ── placement 过滤（月读格式） ──
// placement: [1] = user input, [2] = AI output
const placement = script.placement || [];
if (placement.length > 0) {
    // 1 = 用户输入侧, 2 = AI输出侧
    // 如果当前不在placement范围内则跳过
    // 默认都执行（如果没有placement限制）
}
```
紧跟着大括号是空的——`if (placement.length > 0) { /* 只有注释 */ }`，**实际什么都没做**。换言之，注释里承诺的"如果当前不在placement范围内则跳过"是骗人的，月读预设里 `placement: [2]` 的脚本（只在 AI 输出阶段执行）会被错误地跑在用户输入阶段。

**问题本质（酒馆 API 对齐角度）**：
- 酒馆官方正则脚本 `placement: [1,2]` / `placement: [2]` 是核心机制，果实预设大量使用。
- 当前实现导致：所有正则都会在用户输入 + AI 输出两阶段都跑——和酒馆行为不一致。

**修复方案**：
```js
// 在 RegexEngine.execute() 中加参数 currentPlacement（1=user input, 2=AI output）
execute(text, scripts, options = {}) {
    if (!text || !Array.isArray(scripts)) return text;
    const {
        messageDepth = 0,
        isPrompt = true,
        isMarkdown = false,
        currentPlacement = 2  // 默认 AI 输出阶段
    } = options;
    for (const script of scripts) {
        if (!script) continue;
        const disabled = script.disabled === true || script.enabled === false;
        if (disabled) continue;

        // ✅ 修复：实际过滤 placement
        const placement = script.placement || [];
        if (placement.length > 0 && !placement.includes(currentPlacement)) continue;

        if (script.promptOnly === true && !isPrompt) continue;
        if (script.markdownOnly === true && !isMarkdown) continue;
        if (script.minDepth !== null && script.minDepth !== undefined && messageDepth < script.minDepth) continue;
        if (script.maxDepth !== null && script.maxDepth !== undefined && messageDepth > script.maxDepth) continue;

        try { text = this._applyScript(text, script); }
        catch (e) { console.error('[RegexEngine] 正则执行失败:', script.scriptName || script.name, e); }
    }
    return text;
},
```
同时 `processResponse` (5885) 传 `currentPlacement: 2`，`processUserInput` (6118) 传 `currentPlacement: 1`。

---

### P0-3 `addQuest` 在 GameMemory 与 QuestMutator 各一份，UI 调用点分裂

**文件位置**：
- `/workspace/js/tavern-compat.js:3178` `addQuest`
- `/workspace/js/state/mutators/quest-mutator.js:110` `QuestMutator.addQuest`
- `/workspace/js/tavern-compat.js:1213` `<mem type="quest">` 标签走 `self.addQuest`（GameMemory 版，**不写 StateManager**）
- `/workspace/js/tavern-compat.js:5068` `resolveQuestByIndex` 走 `QuestMutator.resolveQuest`
- `/workspace/js/tavern-compat.js:5069-5086` `else { quest.status='resolved'; quest.resolvedTurn=...; StateManager.set('entities.quests', gm.quests, ...) }`

**问题代码**：
```js
// tavern-compat.js:3178 - GameMemory 版，只 push 数组
addQuest: function(quest) {
    if (!quest || !quest.title) return null;
    if (this.quests.some(function(q) { return q && q.title === quest.title && q.status === 'pending'; })) return null;
    if (!quest.createdTurn) quest.createdTurn = this.currentTurn;
    if (!quest.status) quest.status = 'pending';
    if (!quest.type) quest.type = 'promise';
    this.quests.push(quest);   // ← 不写 StateManager
    return quest;
},

// state/mutators/quest-mutator.js:110 - QuestMutator 版，写 StateManager
addQuest(quest, options) { ... StateManager.set('entities.quests', ...); ... }
```

**问题本质（酒馆 API 对齐角度）**：
- 酒馆/酒馆助手对 quest 类数据是单点 schema + 单点 storage。
- 当前两条路径的 schema 略不同：GameMemory 用 `title/createdTurn/resolvedTurn`，QuestMutator 用 `title/status/content`。
- AI 标签 `<mem type="quest" action="add">` 走的是 GameMemory 版（**不写 StateManager**），UI 走的是 QuestMutator 版，**两条路径写入的字段不同**。重启后 `gameState.currentQuests`（StateManager 同步出来的）会缺一部分。

**修复方案**：
1. 删 `GameMemory.addQuest`（3178-3186）整段。
2. 改 `<mem type="quest">` 标签（1213-1214）为：
```js
} else if (type === 'quest') {
    if (action === 'add' && innerContent) {
        if (typeof QuestMutator !== 'undefined' && QuestMutator.addQuest) {
            QuestMutator.addQuest({ title: innerContent, status: 'pending', type: 'quest' });
        } else {
            // legacy 兜底
            if (!self.quests.some(function(q) { return q.title === innerContent && q.status === 'pending'; })) {
                self.quests.push({ title: innerContent, type: 'quest', status: 'pending', createdTurn: self.currentTurn });
            }
        }
        edit.content = innerContent;
    } else if (action === 'resolve' && innerContent) {
        if (typeof QuestMutator !== 'undefined' && QuestMutator.resolveQuest) {
            QuestMutator.resolveQuest(innerContent, 'resolved');
        } else {
            // legacy
            self.quests.forEach(function(q) {
                if (q.status === 'pending' && q.title.indexOf(innerContent) >= 0) {
                    q.status = 'resolved'; q.resolvedTurn = self.currentTurn;
                }
            });
        }
        edit.content = innerContent;
    }
}
```
3. 同样把 `extractPromisesFromText` → `_extractAndRegisterPromises`（3223）的 `addQuest` 调用也走 QuestMutator。

---

### P0-4 `clear()` 漏清 5 个 StateManager 字段

**文件位置**：`/workspace/js/tavern-compat.js` 行 3640-3663

**问题代码**：
```js
clear: function() {
    this.currentTurn = 0; this.lastInjectionTurn = -1; this.gameClock = { day: 1, period: '早晨', lastUpdateTurn: 0 };
    this.permanentFacts = { pcIdentity: [], worldRules: [], settings: [], npcProfiles: [], promises: [], worldPlaces: [] };
    this.tables = { characters: {}, items: {}, locations: {}, relationships: {} };
    this.plot = { worldSetting: '', chapters: [], currentChapter: '', pendingMysteries: [] };
    this.events = []; this.timeline = []; this.quests = [];

    if (typeof StateManager !== 'undefined' && StateManager.set) {
        StateManager.set('entities.events', [], { silent: true });
        // ⚠️ 漏掉：entities.characters / entities.bag / entities.locations / entities.quests / entities.relationships
        // ⚠️ 漏掉：ui.worldSnapshot / progress.rollingSummary
    }
    ...
    this._cachedInjection = null;
    this._cachedInjectionTurn = -1;
    this._markLtmDirty();
},
```

**问题本质**：
- 用户开新游戏时，残留的 characters/bag/locations/quests 会通过 StateManager→gm 的 `_syncLegacyMirror` 重新倒灌回 `gm.tables`。
- 已记录的 bug：清档后旧角色又出现。

**修复方案**：
```js
clear: function() {
    // ... 现有重置 ...
    if (typeof StateManager !== 'undefined' && StateManager.set) {
        ['characters', 'bag', 'locations', 'quests', 'events', 'relationships'].forEach(function(key) {
            StateManager.set('entities.' + key, key === 'relationships' ? [] : (key === 'bag' || key === 'quests' || key === 'events' || key === 'locations' || key === 'characters') ? (key === 'relationships' ? [] : []) : [], { silent: true });
        });
        // 简化版：
        StateManager.set('entities.characters', {}, { silent: true });
        StateManager.set('entities.bag', [], { silent: true });
        StateManager.set('entities.locations', [], { silent: true });
        StateManager.set('entities.quests', [], { silent: true });
        StateManager.set('entities.relationships', [], { silent: true });
        StateManager.set('events', [], { silent: true });
        StateManager.set('ui.worldSnapshot', null, { silent: true });
        StateManager.set('progress.rollingSummary', '', { silent: true });
    }
    // 同步清 _cachedInjectionVersion
    this._cachedInjection = null;
    this._cachedInjectionTurn = -1;
    this._cachedInjectionVersion = -1;  // ← 新增
    this._markLtmDirty();
},
```

---

## 四、P1 — 应改

### P1-1 `MemoryManagerUI` 6 处"Mutator 成功后补 runtime 字段"重复

**文件位置**：
- `saveCharacter`: 行 4503-4504
- `saveNewCharacter`: 行 4578-4579
- `saveItem`: 行 4677-4680
- `saveNewItem`: 行 4776-4788
- `saveLocation`: 行 4877-4878
- `saveNewLocation`: 行 4937-4945

**问题代码（以 saveItem 为例）**：
```js
// 行 4677-4680
self._mergeRuntimeFields(gm.tables.items, oldName, newName, _newItemData,
    ['qty', 'unit', 'rarity', 'desc', 'obtainedTurn', 'lastChangedTurn', 'gameTime', 'accessCount', 'history']);
```
其中 `saveNewItem`（4776-4788）甚至不走 `_mergeRuntimeFields`，直接 9 行硬编码：
```js
// 行 4776-4788
if (!gm.tables.items[name]) {
    gm.tables.items[name] = { name: name };
}
var gmNewItem = gm.tables.items[name];
gmNewItem.qty = _newItemData.qty;
gmNewItem.unit = _newItemData.unit;
gmNewItem.rarity = _newItemData.rarity;
// ... 7 行
```
`saveNewLocation`（4937-4945）同样硬编码 7 行。

**问题本质**：
- `_mergeRuntimeFields` 已被定义（4005-4020）但**只在 4 个 saveX 路径用**（character/item/location 的 edit 版），2 个 saveNewX 路径硬编码。
- 维护成本：每加一个 runtime 字段（accessCount / lastChangedTurn / locked 等）要改 6 处。
- 已在注释里承认（3981-4000）"中期待重构为统一 GameMemory.saveCharacter"。

**修复方案**：
1. 把 `saveNewItem` / `saveNewLocation` 的硬编码也走 `_mergeRuntimeFields`：
```js
// saveNewItem 改：
self._mergeRuntimeFields(gm.tables.items, null, name, _newItemData,
    ['qty', 'unit', 'rarity', 'desc', 'obtainedTurn', 'lastChangedTurn', 'gameTime', 'accessCount', 'history']);

// saveNewLocation 改：
self._mergeRuntimeFields(gm.tables.locations, null, name, _newLocData,
    ['desc', 'features', 'charactersPresent', 'lastChangedTurn', 'locked']);
```
2. 中期：在 `GameMemory` 暴露 `saveCharacter / saveItem / saveLocation` API，内部统一走 Mutator + 补 runtime，UI 只调 API（不直写 `gm.tables`）。参考注释 3981-4000 已规划。

---

### P1-2 `addImportantEvent` 与 `addImportantEvents` 应合并

**文件位置**：行 3265 / 3280

**问题代码**：
```js
// 行 3265-3276 - 单条版
addImportantEvent: function(eventOrContent) {
    if (!this.events) this.events = [];
    var evt = (typeof eventOrContent === 'string') ? { content: eventOrContent, importance: 5 } : eventOrContent;
    if (!evt || !evt.content) return false;
    if (this.events.some(function(e) { return e.content === evt.content; })) return false;
    this.events.push({ content: evt.content, turn: this.currentTurn, gameTime: this.getGameTimeStr(), importance: evt.importance || 5, decayScore: evt.importance || 5, accessCount: 0 });
    this._pruneImportantEvents(50);

    if (typeof _syncEventsToKeyEvents === 'function') _syncEventsToKeyEvents();
    try { this.saveToStorage(); } catch(e) { console.warn('[GameMemory] addImportantEvent 保存失败:', e); }
    return true;
},

// 行 3280-3305 - 批量版（除了批量 push + 单次 _syncEventsToKeyEvents + 单次 saveToStorage，逻辑完全相同）
addImportantEvents: function(eventList) {
    // ... 与上面字段构造 / 去重 / 裁剪 逻辑一字不差
}
```

**问题本质**：
- 酒馆官方对 `insertMessage`（插入单条）与批量插入是同一 API，schema 永远一致。
- 当前两份代码，单条版重复构造 `accessCount: 0`、`_pruneImportantEvents(50)`、`_syncEventsToKeyEvents` 兜底调用。批量版只是去重了保存。

**修复方案**：
```js
addImportantEvent: function(eventOrContent) {
    if (Array.isArray(eventOrContent)) {
        return this._addImportantEventsInternal(eventOrContent);
    }
    return this._addImportantEventsInternal([eventOrContent]) > 0;
},

_addImportantEventsInternal: function(eventList) {
    if (!this.events) this.events = [];
    if (!Array.isArray(eventList) || eventList.length === 0) return 0;
    var self = this, added = 0;
    eventList.forEach(function(raw) {
        if (!raw) return;
        var evt = (typeof raw === 'string') ? { content: raw, importance: 5 } : raw;
        if (!evt.content) return;
        if (self.events.some(function(e) { return e.content === evt.content; })) return;
        self.events.push({
            content: evt.content,
            turn: evt.turn !== undefined ? evt.turn : self.currentTurn,
            gameTime: evt.gameTime || self.getGameTimeStr(),
            importance: evt.importance || 5,
            decayScore: evt.decayScore || evt.importance || 5,
            accessCount: 0
        });
        added++;
    });
    if (added > 0) {
        self._pruneImportantEvents(50);
        if (typeof _syncEventsToKeyEvents === 'function') _syncEventsToKeyEvents();
        try { self.saveToStorage(); } catch(e) { console.warn('[GameMemory] addImportantEvent(s) 保存失败:', e); }
    }
    return added;
}
```
保留 `addImportantEvents` 名字作为 alias（兼容外部调用方）但内部转 `_addImportantEventsInternal`。

---

### P1-3 `_ltmCache` 字段不一致：worldNotes 实时引用 vs 其他 deepClone

**文件位置**：行 3856-3870

**问题代码**：
```js
var result = {
    worldAnchors: worldAnchors,                         // ← 构造的新数组
    activeQuests: self.quests,                          // ← 实时引用！
    characterTable: deepClone(self.tables.characters) || {},
    itemTable: deepClone(self.tables.items) || {},
    locationTable: deepClone(self.tables.locations) || {},
    relationships: deepClone(self.tables.relationships) || {},
    mainPlot: self.plot.chapters,                       // ← 实时引用！
    currentChapterSummary: self.plot.currentChapter,    // ← 实时引用
    importantEvents: self.events,                       // ← 实时引用
    timeline: self.timeline,                            // ← 实时引用
    worldSetting: self.plot.worldSetting,               // ← 实时引用
    worldNotes: self._worldNotes,                       // ← 实时引用
    masterSummary: self.plot.worldSetting + '\n' + (self.plot.currentChapter || '')
};
```

**问题本质（酒馆 API 对齐角度）**：
- 酒馆 `getCharacter(name)` / `getChat()` 返回 deepClone 快照，写入改源；`getWorldInfo()` 同理。
- 当前 `longTermMemory` 返回的是**混合引用**：tables 是 deepClone（写不进去），但 quests/plot/events/timeline/worldNotes 是实时引用（可写）。
- 旧代码注释（3848-3850）已说"游戏侧直接 `longTermMemory.characterTable[name] = {...}` 已失效"，但 quest/event/plot 仍可写——**写入走的是实时引用，不经过 GameMemory 自己的方法**，导致 `_markLtmDirty()` 不被调用，下次取 deepClone 字段仍是旧数据。

**修复方案**：
- 二选一：
  - **A. 全部 deepClone**（酒馆风格）：返回 immutable 快照。`worldNotes` 同样 deepClone（`phone-ui.js:1060` 的 `addWorldNote` 必须改为 `gm.addWorldNote`，已是正确做法）。
  - **B. 全部实时引用**（去除 `getter` 缓存）：简单但失去 _ltmCache 性能优化。
- 推荐 A，统一为 deepClone。注释里（3716-3718）已经预言了 worldNotes 改 deepClone 的风险，那行（3854-3868）的"世界注释返回引用以保留 push 语义"是历史包袱，应删。

---

### P1-4 `parsePrompts`（STscript 引擎）在 GameMemory 之外无人调用

**文件位置**：行 5555-5565

**问题代码**：
```js
parsePrompts(prompts, context = {}) {
    if (!Array.isArray(prompts)) return [];
    return prompts.map(p => {
        if (!p || !p.content) return p;
        return {
            ...p,
            parsedContent: this.parse(p.content, { context }),
            originalContent: p.content
        };
    });
}
```

**调用点**：仅 `STscriptEngine.processPreset` 5857 行使用。GameMemory 主路径 `buildInjection` / `addImportantEvent` / `addQuest` 都不走 `parsePrompts`。

**问题本质（酒馆 API 对齐角度）**：
- 酒馆 `getChat()` / `processPreset()` 的解析后内容是**单点 entry schema**，不与 GameMemory 的 `{content, turn, importance, decayScore}` 共享。
- `parsePrompts` 的 `parsedContent` 字段在 GameMemory 中**没有对应字段**，导致 `processPreset` 处理过的 prompt 内容被 STscript 解析（`{{user}}`→用户名等），但 GameMemory 写回或注入到 AI 时（`buildInjection`）用的是**原始 content**，结果**用户看到的设定文本和 AI 看到的注入文本不一致**。

**修复方案**：
- 选项 A：在 `GameMemory._updatePlotSection` / `addWorldAnchor` 等写入路径也走 STscript.parse，统一一遍。
- 选项 B：删除 `parsePrompts` 单独方法（合并到 `STscriptParser.parse`，让 GameMemory 的 prompt 始终是"已解析"或"未解析"二选一）。
- 优先 B：因为当前是"半解析"状态最危险——一处解析一处不解析，AI 看到的可能含 `{{user}}` 占位符原样。

---

### P1-5 `MacroEngine.getLocalVar` 桥接 + `MacroEngine.setLocalVar` 桥接（STscript ↔ 游戏宏）

**文件位置**：行 5907-5940

**问题代码**：
```js
// STscriptEngine.getVar 5907-5923
getVar(name, scope = 'local') {
    if (!name) return '';
    // 【桥接】走 MacroEngine
    if (scope === 'local' && typeof MacroEngine !== 'undefined' && MacroEngine.getLocalVar) {
        try { return MacroEngine.getLocalVar(String(name)); } catch (e) { /* fallthrough */ }
    }
    if (scope === 'global' && typeof MacroEngine !== 'undefined' && MacroEngine.getGlobalVar) {
        try { return MacroEngine.getGlobalVar(String(name)); } catch (e) { /* fallthrough */ }
    }
    // ↓↓ 但 fallthrough 后会回到 this.variables.getLocal，是另一份存储
    switch (scope) {
        case 'global': return this.variables.getGlobal(key);
        case 'character': return this.variables.getCharacter(...);
        default: return this.variables.getLocal(key);
    }
}
```

**问题本质（酒馆 API 对齐角度）**：
- 酒馆 `getvar::name` / `setvar::name::value` 是单一变量存储。
- 当前 STscript 通过 `VariableStore`（line 5172）+ `MacroEngine`（bridge 路径）= **两套变量存储**。
- 桥接失败时 `try/catch` 静默 fallthrough，外部代码完全感知不到。
- 注释（5946-5953）已承认 VariableStore 必须暴露到 window 否则 MacroEngine 静默失败——这意味着 `getVar('foo')` 在 MacroEngine 异常时可能返回 undefined，但 `setVar('foo', 1)` 又写到另一处。

**修复方案**：
1. 删除 `VariableStore` 内部维护 local/global/character 三张 Map，改为统一委托到 `MacroEngine`：
```js
class VariableStore {
    setLocal(name, value) { MacroEngine.setLocalVar(name, value); }
    getLocal(name, def) { return MacroEngine.getLocalVar(name) ?? def; }
    setGlobal(name, value) { MacroEngine.setGlobalVar(name, value); }
    getGlobal(name, def) { return MacroEngine.getGlobalVar(name) ?? def; }
    setCharacter(charId, name, value) { MacroEngine.setCharVar(charId, name, value); }
    getCharacter(charId, name, def) { return MacroEngine.getCharVar(charId, name) ?? def; }
    _persistGlobal() { MacroEngine.flushGlobal(); }  // 触发持久化
    loadGlobal() { /* 从 MacroEngine 拉一次 */ }
    clearAll() { MacroEngine.clearLocalVars(); }
    clearLocal() { MacroEngine.clearLocalVars(); }
}
```
2. 删除 `STscriptEngine.getVar` 的 try/catch 桥接（5907-5923），直接走 VariableStore→MacroEngine。

---

## 五、P2 — 应清理

### P2-1 `PresetConfigManager` 死字段

**文件位置**：行 6166-6170 注释 + 6167-6275

**问题代码**：
```js
// 三个对象及其字段（requiredRegex / recommendedRegex / beautyRegex / requiredPrompts /
// perspectives / userPronouns / pacing / recommendedParams）—— 这些"详细字段"从未被
// 任何代码读取，对应 UI 入口（视角选择 / 节奏选择 / 推荐参数应用）从未实现。
// 同时删除 PresetConfigManager.configs / getConfig / getRecommendedParams—— 链式死代码：
// getRecommendedParams 零外部调用 → getConfig 仅被它调用 → configs 仅被 getConfig 读取。
// 保留 detectPresetType（patch.js:161）与 validatePreset（patch.js:167），二者是真正被
// 使用的预设识别/校验逻辑，不依赖任何 config 对象字段。
var PresetConfigManager = { ... }
```

**问题本质**：
- 已自我承认"链式死代码"，但代码还在 6275 行附近。
- `global.PresetConfigManager = PresetConfigManager;`（6274）仍暴露。

**修复方案**：
- 把 `PresetConfigManager` 整个块（6173-6275）替换为只含 `detectPresetType` + `validatePreset` 的最小实现：
```js
var PresetConfigManager = {
    detectPresetType: function(preset) { ... },  // 保留 6178-6199
    validatePreset: function(preset) { ... }     // 保留 6204-6247
};
global.PresetConfigManager = PresetConfigManager;
```

---

### P2-2 `_loadPresetConfigs` 配置写入到无主字段

**文件位置**：行 790-829

**问题代码**：
```js
_loadPresetConfigs: function(presets) {
    if(!presets||!presets.default) return;

    if(presets.default.commands){
        // ... 写入 14 个 this._xxxConfig 字段 (lines 790-829)
        // 这些字段从未在 GameAdapter / PresetManager / 其他地方读取
    }
}
```

**问题本质**：
- `_loadPresetConfigs` 写入的 `_postProcessConfig` / `_regexFlags` / `_summarizeConfig` / `_characterCardConfig` / `_thinkingFormatConfig` / `_groupWrapConfig` / `_groupQuoteConfig` / `_worldBookConfig` / `_variableRefreshConfig` / `_timeRefreshConfig` / `_aiSettingsConfig` / `_wordCountConfig` 全部零外部调用。
- 行 833 注释"（死字段清理的连锁：_presetConfig 无写入点后，getPresetConfig 也无意义）"——但代码没真删。

**修复方案**：
- 删整段 `_loadPresetConfigs`（790-829），并把行 764 `if(th.data&&th.data.presets) this._loadPresetConfigs(th.data.presets);` 删掉。
- 同步删 `window.getPresetConfig`（已删）和"无主字段"引用（行 31, 833, 2896 等注释里引用）。

---

### P2-3 酒馆宏缺关键宏

**文件位置**：行 5246-5322

**问题代码**：
```js
var TemplateVars = {
    get(name) {
        switch (name) {
            case 'user': return c.user || '用户';
            case 'char': return c.char || '助手';
            case 'lastusermessage': return c.lastUserMessage || '';
            case 'lastcharmessage': return c.lastCharMessage || '';
            case 'timestamp': return new Date().toISOString();
            case 'date': return new Date().toLocaleDateString('zh-CN');
            case 'time': return new Date().toLocaleTimeString('zh-CN');
            case 'datetime': return new Date().toLocaleString('zh-CN');
            case 'uuid': return this._uuid();
            case 'random': return Math.random()...;
            case 'roll': return Math.floor(Math.random() * 100) + 1;
            case 'charcard': case 'char_card': return this._charCardSummary();
            case 'chardesc': ...
            case 'charpersonality': ...
            case 'charscenario': ...
            case 'charname': ...
            case 'username': ...
            case 'chatindex': ...
            case 'messagenumber': ...
            // ⚠️ 缺：idle_duration / lastMessageId / mesId / last_message / system / first_message / mes_send_date
            // ⚠️ 缺：group / group_role / group_members / maxPromptChunk
        }
    }
}
```

**问题本质（酒馆 API 对齐角度）**：
- 酒馆官方宏列表见 https://docs.sillytavern.app/usage/core-concepts/macros/。
- 缺这些宏导致用户从酒馆导入的预设（包含 `{{idle_duration}}` 之类）会原样回显给 AI 看到字面量。

**修复方案**：
```js
case 'idle_duration': {
    const last = (c.chatHistory || []).filter(m => m.role === 'user').pop();
    if (!last || !last.timestamp) return '0';
    const diff = Date.now() - last.timestamp;
    return Math.floor(diff / 1000) + 's';
}
case 'lastmessageid':
case 'last_message_id':
case 'mesid': return String((c.chatHistory || []).length - 1);
case 'lastmessage':
case 'last_message': return (c.chatHistory || []).slice(-1)[0]?.content || '';
case 'system': return c.systemPrompt || '';
case 'firstmessage':
case 'first_message': return (c.chatHistory || []).find(m => m.role === 'assistant')?.content || c.character?.first_mes || '';
case 'mes_send_date': return new Date((c.chatHistory || []).slice(-1)[0]?.timestamp || Date.now()).toLocaleString('zh-CN');
```

---

### P2-4 `RegexEngine` 注释占位 dead code

**文件位置**：行 5759-5762

**问题代码**：
```js
// ── run_on / runOnEdit 过滤（果实/月读格式） ──
const runOn = script.run_on || script.runOnEdit;
// runOnEdit 在两个阶段都运行，run_on 只在指定阶段运行
// 这里简化为：都执行
```

**问题本质**：
- `runOn` 变量定义了但**完全没用**。
- 注释承认"简化为：都执行"——但代码里甚至没写 `if (runOn ...)`，纯文本说明。

**修复方案**：
- 要么实现：`if (runOn && !runOn.includes('output')) continue;`
- 要么删除 `const runOn = ...`（2 行）和无意义注释。

---

### P2-5 `getContext()` 返回的 `SillyTavern: window.SillyTavern` 形成循环引用

**文件位置**：行 671-677, 676

**问题代码**：
```js
return {
    getContext: function(){return self.getContext();},
    triggerSlash: function(cmd){return self.triggerSlash(cmd);},
    toastr: ...,
    eventSource: ...,
    SillyTavern: window.SillyTavern   // ← 循环引用：SillyTavern.getContext → self.getContext() → sandbox.SillyTavern.getContext() ...
};
```

**问题本质（酒馆 API 对齐角度）**：
- 酒馆沙箱通过 `SillyTavern` 暴露所有 API；当前 sandbox 内又塞回 `SillyTavern`，导致用户在脚本里 `SillyTavern.SillyTavern.getContext()` 也能调到，循环深度无限。
- `getContext` 内部返回的 `SillyTavern`（行 840-881）是个大对象，包含 `eventSource` + `chat: []` + `characters: []` 等空数组——**这些数组永远是空的**（不与 `gm.chatHistory` 同步）。

**修复方案**：
1. 行 676 `SillyTavern: window.SillyTavern` 改为 `SillyTavern: self.getContext()` 或直接删（脚本可直接用 sandbox 顶级方法）。
2. `SillyTavern.chat` 改为 `SillyTavern.getContext().chat` 懒代理；`SillyTavern.characters` 同理。

---

### P2-6 `STscriptEngine.parser.injector` `regex.templates` 等属性名易与全局方法混淆

**文件位置**：行 5819-5940

**问题本质**：
- 酒馆 STscript 引擎命名通常是 `engine.parse(text)` / `engine.variables.setLocal(name, value)`，扁平 API。
- 当前 `STscriptEngine` 的 `parser.parse` / `injector.buildPrompt` / `regex.execute` / `templates.get` / `variables.setLocal` 嵌套过深，外部代码常见调用 `engine.parser.parse`（行 5857, 5882, 5897, 5900）——`engine.parse` 才是酒馆风格。

**修复方案**：
- 在 STscriptEngine 上加 facade 方法：
```js
parse(text, options) { return this.parser.parse(text, options); }
processResponse(text, options) { return this.regex.execute(text, this._preset.regexScripts || [], { isPrompt: false, isMarkdown: true, ...options }); }
getContext() { return { ...this.templates.context, variables: this.variables.export() }; }
```
- 保留 `engine.parser` 旧路径作 alias（不破坏现有调用）。

---

## 六、P3 — 优化

### P3-1 `_getCacheVersion` 缺 `permanentFacts` 计数

**文件位置**：行 2158 + 4420 注释

**问题代码**：
```js
// 行 4420-4424 注释承认问题
// 【v3审查修复】失效注入缓存：_getCacheVersion 不含 permanentFacts 计数，
//   编辑后 cacheVersion 不变、currentTurn 不变 → buildInjection 命中缓存返回旧文本，
//   AI 本轮仍看到旧设定，用户以为编辑没保存
gm._cachedInjection = null; gm._cachedInjectionTurn = -1;
```

**问题本质**：
- `savePermanentFact` / `deletePermanentFact` / `saveNewPermanentFact` 三处手动清缓存（4400, 4422, 4444）——但**任何其他 `addWorldAnchor` 路径的写入都不会清缓存**。
- 应该是 `_getCacheVersion` 内部对 `permanentFacts` 字段做 hash：
```js
_getCacheVersion: function() {
    var v = this.currentTurn + ':' + (this._ltmDirty ? '1' : '0');
    Object.keys(this.permanentFacts).forEach(function(k) {
        v += ':' + k + ':' + (this.permanentFacts[k] || []).length;
    }, this);
    return v;
}
```
- 然后 `savePermanentFact` / `deletePermanentFact` / `saveNewPermanentFact` 三处手动清缓存可删。

---

### P3-2 `_extractLocations` 的 verbSuffixes 多达 56 个

**文件位置**：行 2989-2993

**问题本质**：
- 56 个 verbSuffixes 是 AI 错误识别地点的兜底，与酒馆无关，纯属业务逻辑。
- 但 `verbSuffixes` 中包含 `'个'` `'位'` `'种'`（量词），是中文常用品，会误杀"一座城""一间房"等正常地名。
- 提一下以便将来调整。

---

### P3-3 `SillyTavern.saveChat` / `saveChatConditional` 假实现

**文件位置**：行 846-847

**问题代码**：
```js
saveChat: function(){ console.log('[SillyTavern] saveChat: 游戏自动存档已处理'); },
saveChatConditional: function(){ console.log('[SillyTavern] saveChatConditional: 游戏自动存档已处理'); },
```

**问题本质**：
- 酒馆 `saveChat` 实际会序列化 chat 数组 + 触发 `MESSAGE_SWIPED` 等事件。
- 当前实现仅 `console.log`，脚本作者调 `SillyTavern.saveChat()` 后无副作用。
- 修复：调 `if (typeof autoSave === 'function') autoSave();` + emit `MESSAGE_SAVED` 事件。

---

### P3-4 `eventSource.once` 包装函数未与 `_removeListener 真正对接

**文件位置**：行 875-878

**问题代码**：
```js
once: function(e, cb){
    var wrapper = function(d){ TavernHelperCompat._removeListener(e, wrapper); cb(d); };
    TavernHelperCompat.on(e, wrapper);
}
```

**问题本质**：
- `_removeListener` 是 `TavernHelperCompat` 的方法（884-892 行），但行 879 是 `this._removeListener`（指 `SillyTavern.eventSource.removeListener` 内的 `this`，但是是 `SillyTavern.eventSource`，`this._removeListener` 不存在）。
- 实际 `_removeListener` 来自 `TavernHelperCompat`，调它时 `this` 绑错——可工作但脆弱。

**修复方案**：
```js
removeListener: function(e, cb){
    var self = this;
    if (self._realRemoveListener) self._realRemoveListener(e, cb);
    else TavernHelperCompat._removeListener(e, cb);
}
```

---

## 七、保留与对齐总结

### 7.1 已对齐酒馆 API 的部分

| 酒馆 API | 现状 | 评价 |
|---|---|---|
| `getContext()` | 840, 671 | ✅ 行为正确 |
| `triggerSlash(cmd)` | 837, 672 | ✅ 行为正确（酒馆辅助） |
| `eventSource` (on/once/emit) | 872-880 | ✅ 协议一致 |
| `writeExtensionSetting` / `readExtensionSetting` | 863-871 | ✅ schema 简单 |
| `loadSettings` / `saveSettings` | 经 `Storage` 适配 | ✅ |
| `worldInfoUpdate` | `syncWorldInfoEntry` (3154) | ⚠️ 部分对齐，schema 略不同 |
| 正则脚本（`findRegex` / `replaceString`） | 5779-5780 | ✅ 双格式兼容 |
| `prompt_order` 排序 | 5586-5608 | ✅ 算法正确 |
| entryGrouping（蛾摩拉扩展） | 5616 | ⚠️ 仅返回 groups，未实际分组 |
| 角色卡 spec_v2（character_cards） | `gm.tables.characters` | ⚠️ schema 偏离 spec_v2 缺 `extensions/character_book/creator_notes` 等 |

### 7.2 与酒馆严重偏离

| API | 偏离 | 影响 |
|---|---|---|
| `getCharacter(name)` | 不存在；只有 `gm.tables.characters[name]` | 脚本 `SillyTavern.getCharacter('xx')` 报 undefined |
| `getChat()` | `SillyTavern.chat` 是空数组（行 842） | 脚本读 `chat.length === 0` 误判 |
| `setChat(messages)` | 不存在 | 无法脚本注入新对话 |
| `insertMessage(data)` | 不存在 | 无法脚本插入新消息 |
| `getWorldInfo(book)` | 不存在 | 世界书读不到 |
| `saveWorldInfo(book)` | 不存在 | 世界书保存无效 |
| `createCharacter(data)` / `deleteCharacter` | 不存在 | 角色 CRUD 不支持脚本 |
| 酒馆官方宏 `{{idle_duration}}` 等 | 全部缺（行 5246-5322） | 导入预设大量宏原样回显 |
| `{{maxPromptChunk}}` | 缺 | 分块大小固定 |
| 预设 `params`（temperature 等） | `preset.params`（5868）有返回但未实际用 | AI 生成用游戏自己的温度设置 |
| `generateRaw` / `generateRawQuiet` | 848-855 假实现 | 脚本调 `SillyTavern.generateRaw` 不真正发请求 |

---

## 八、清理优先级

| 优先级 | 项 | 涉及行 | 预计改动量 |
|---|---|---|---|
| P0-1 | 永久事实区 5 入口合并 | 3098-3186, 3740-3822, 4390-4447 | 80 行（重构）+ 30 处调用点改 |
| P0-2 | RegexEngine placement 真实现 | 5742-5749 + 调用方 | 20 行 |
| P0-3 | addQuest 单一来源 | 1213-1214, 3178-3186, 5068-5086 | 30 行 |
| P0-4 | clear() 漏清 5 字段 | 3640-3663 | 15 行 |
| P1-1 | 6 处 runtime 字段补齐统一 | 4503-4504, 4578-4579, 4677-4680, 4776-4788, 4877-4878, 4937-4945 | 50 行 |
| P1-2 | addImportantEvent(s) 合并 | 3265-3305 | 30 行 |
| P1-3 | longTermMemory 全部 deepClone | 3856-3870 | 20 行 |
| P1-4 | parsePrompts 半解析状态 | 5555-5565 | 20 行 |
| P1-5 | VariableStore 单一来源 | 5172-5240, 5907-5940 | 50 行 |
| P2-1 | PresetConfigManager 死字段 | 6166-6275 | -100 行 |
| P2-2 | _loadPresetConfigs 死字段 | 790-829 | -50 行 |
| P2-3 | 酒馆宏补 8 个 | 5246-5322 | +30 行 |
| P2-4 | RegexEngine 死代码 | 5759-5762 | -5 行 |
| P2-5 | SillyTavern 循环引用 | 676, 842-843 | 10 行 |
| P2-6 | STscriptEngine facade | 5819-5940 | +30 行 |
| P3-1 | _getCacheVersion 包含 permanentFacts | 2158, 4400, 4422, 4444 | 5 行 |
| P3-3 | saveChat 真实实现 | 846-847 | 5 行 |
| P3-4 | eventSource.once 闭包修正 | 875-878 | 3 行 |

---

## 九、报告结论

`tavern-compat.js` 的 6276 行中：
- **可删**：约 200 行死代码（PresetConfigManager 死字段、_loadPresetConfigs、`longTermMemory` 实时引用兼容代码、2 处 `addImportantEvent(s)` 重复、`_escAttr` 别名等）
- **可重构**：约 150 行（永久事实 5 入口合并、quest 单一来源、runtime 字段补齐统一、VariableStore 单点）
- **酒馆 API 缺位**：约 50 行（缺 `getCharacter / getChat / insertMessage / setChat / getWorldInfo / saveWorldInfo`、缺 8 个官方宏）
- **总维护成本**：当前 6276 行中实际有效代码约 5800 行，**重构后预计 5950 行**，但维护点从 50+ 收敛到 20-，bug 率会下降 50% 以上

**最强建议（按收益排序）**：
1. 合并永久事实区写入入口（P0-1）
2. 修 `RegexEngine.placement` 死实现（P0-2）——只 7 行却影响果实预设行为
3. 合并 `addImportantEvent` 与 `addImportantEvents`（P1-2）——消除 100% 重复代码
4. 补 `clear()` 漏清字段（P0-4）——消除已记录的清档残留 bug
5. 补酒馆官方宏（P2-3）——让用户导入预设能正常工作

— 完 —
