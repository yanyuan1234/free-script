# 对比 backup vs current：世界书/任务/成就/状态管理/记忆子系统

> **对比基线**：`/workspace/backup/index.html`（单文件 33,308 行，原始/参考版）
> **当前实现**：`/workspace/js/worldinfo.js`（2096 行）+ `js/systems.js`（975 行）+ `js/state/`（1300 行）+ `js/tavern-compat.js:EnhancedMemory`（6276 行）
> **对比方法**：以 backup 为参考基线，定位 current 中**改错 / 改坏 / 错失**的部分；保留 current 中**确实更优**的添加
> **完成日期**：2026-07-02

---

## 一、核心结论速览

| 维度 | backup 现状 | current 现状 | 评价 |
|---|---|---|---|
| 世界书 0 值误判 | 有（line 12832） | 仍存（line 880） | 双方同 bug，需统一修复 |
| 世界书 atDepth 去重 | **无**（重复 push） | **有**（clear + dedup） | **current 修复了泄漏** |
| 世界书 `enabled` 字段 | 仅 2 条件 | 3 条件（含 `disabled`） | **current 兼容更全** |
| 世界书缩进 | 整齐 | scan()/buildInjection() 缩进错位 | **current 退步** |
| 任务 addQuest | 1 套（`mergeQuests`） | **3 套并存**（QuestMutator/GameMemory/mergeQuests） | **current 引入了双写** |
| 任务 STATUS 常量 | 无（直接用字符串） | 2 套（QuestSystem/QuestMutator） | **current 统一了，但重复** |
| 任务 STATUS 失败值 | `'失败'` | `'已失败'` | current 改了语义但有 fallback 兼容 |
| 成就玩家名 | **硬编码 `'主角'`** | **动态 `gameState.playerName \|\| '主角'`** | **current 修复了硬编码** |
| 状态管理 | 27+ 处直写 `gameState.xxx =` | 引入 StateManager + 8 Mutator | **current 引入结构，但 game.js 仍有 50+ 直写** |
| EnhancedMemory | 3 层记忆（无 permanentFacts） | GameMemory 6 字段永久事实（pcIdentity/worldRules/settings/npcProfiles/promises/worldPlaces） | **current 重大功能增强** |
| MemoryManagerUI | 简单 row 编辑 | `_mergeRuntimeFields` 拆分实体/运行时 | **current 改进** |
| 角色卡字段映射 | `characterTable: name/title/relation/favorability/desc/history/...` | 适配器仅 MERGE 8 字段，**漏 `identity/desc/tags/stats/notes`** | **current 引入 P0 bug** |
| 酒馆 VariableStore | 已实现但无持久化 | `+_persistGlobal`/`loadGlobal` + `Storage.KEYS.GLOBAL_VARS` | **current 增强** |
| STscript | 已实现 | 已实现，**新增 `_notifyChange` 钩子** | **current 增强** |
| clear() 清扫完整性 | 清 3 字段（含 `localStorage.removeItem`） | 清 18 字段但 **漏 budget/compressionConfig/_worldNotes** | **current 引入新漏** |

---

## 二、应保留 current 优秀添加（current 更优，**不要回退**）

### 1. 成就系统 `calculateStats` 玩家名动态化

| 项 | backup | current |
|---|---|---|
| 文件 | `backup/index.html:27853-27860` | `js/systems.js:422-430` |
| 代码 | `if (r.from === '主角' \|\| r.to === '主角') { ... }` | `var pn = gameState.playerName \|\| '主角'; rels.forEach(function(r) { if (r.from === pn \|\| r.to === pn) { ... } });` |
| 评价 | **硬编码 '主角'**。若玩家自定义主角名，所有关系过滤失效，romanceNpc/friendlyNpc/allyNpc 全部归零 | 动态读取 `gameState.playerName`，与 backup 的 CharacterMutator.filterOutPlayer 行为一致 |

```js
// backup: 错误硬编码
if (r.from === '主角' || r.to === '主角') {
    if (r.type === '友好' || r.type === '盟友' || r.type === '师徒') stats.friendlyNpc++;
    ...
}

// current: 修复后（js/systems.js:422-430）
var rels = gameState.relationships || [];
var pn = gameState.playerName || '主角';
rels.forEach(function(r) {
    if (r.from === pn || r.to === pn) {  // 动态读取
        if (r.type === '友好' || r.type === '盟友' || r.type === '师徒') stats.friendlyNpc++;
        ...
    }
});
```

**结论**：✅ **保留 current 实现**。用户原题"current 硬编码 '主角'"是**误判**，实际是 current 修复了 backup 的硬编码 bug。

---

### 2. 世界书 `atDepth` 去重 + 清理上一轮 worldInfo 条目

| 项 | backup | current |
|---|---|---|
| 文件 | `backup/index.html:13931-13939` | `js/worldinfo.js:2029-2062` |
| 代码 | `gameState._depthPrompts[depth].push({...})`（无 dedup，无清理） | 先 `filter(e => e._source !== 'worldInfo')` 清掉旧条目，再按 `_id = 'worldInfo_depth_' + depth + '_' + (item.comment \|\| item.name \|\| Math.random()...)` 去重 push |
| 评价 | **每轮每条都 push** → 长游戏（200 回合）后 `_depthPrompts[4]` 包含 200+ 个重复 worldInfo 条目，token 持续增长 | clear + dedup 保证每轮 atDepth 注入条目数 = 激活条目数，无重复累积 |

```js
// backup: 漏清 + 无去重
gameState._depthPrompts[depth].push({
    enabled: true,
    content: MacroEngine.process(item.text),
    ...
});

// current: 修复后
Object.keys(gameState._depthPrompts).forEach(function(d) {
    gameState._depthPrompts[d] = (gameState._depthPrompts[d] || []).filter(function(e) {
        return e._source !== 'worldInfo';
    });
    if (gameState._depthPrompts[d].length === 0) delete gameState._depthPrompts[d];
});
groups.atDepth.forEach(function(item) {
    var depth = item.depth || 4;
    var _id = 'worldInfo_depth_' + depth + '_' + (item.comment || item.name || Math.random()...);
    var _existing = gameState._depthPrompts[depth].findIndex(function(e) { return e.identifier === _id; });
    if (_existing >= 0) gameState._depthPrompts[depth][_existing] = _entry;
    else gameState._depthPrompts[depth].push(_entry);
});
```

**结论**：✅ **保留 current 实现**。这是 current 修复 backup 内存/性能泄漏的关键改动。

---

### 3. 世界书 `enabled` 字段三条件兼容

| 项 | backup | current |
|---|---|---|
| 文件 | `backup/index.html:12816` | `js/worldinfo.js:864` |
| 代码 | `enabled: raw.enabled !== false && raw.disable !== true,` | `enabled: raw.enabled !== false && raw.disable !== true && raw.disabled !== true,` |
| 评价 | 漏 `disabled: true` 兼容（部分酒馆预设用 `disabled` 字段） | 三条件全兼容，行为与酒馆 spec 一致 |

**结论**：✅ **保留 current 实现**。

---

### 4. EnhancedMemory → GameMemory 升级（6 字段永久事实 + 限时回收 + 重要事件压缩）

| 项 | backup | current |
|---|---|---|
| 文件 | `backup/index.html:29040+`（`EnhancedMemory` 类） | `js/tavern-compat.js:3089-3174`（`addWorldAnchor` + `removeWorldAnchorsBySource` + `syncWorldInfoEntry`） |
| schema | 仅 `longTermMemory.characterTable/itemTable/locationTable/...` | `permanentFacts: { pcIdentity, worldRules, settings, npcProfiles, promises, worldPlaces }` |
| 评价 | 没有世界书→记忆的回收链路，世界书内容无法被"长期事实"持久化 | `syncWorldInfoEntry` 把 worldInfo 条目按 `entry.constant \|\| 规则关键词匹配` 收割到对应 anchor，AI 上下文能稳定看到世界书 |
| 额外 | 无 token 预算控制 | `if (total > 30)` 触发 `evictable.sort((a,b) => a.importance - b.importance)` 淘汰低权重事实 |

**结论**：✅ **保留 current 实现**。这是 current 的重要功能添加，backup 完全缺失。

---

### 5. StateManager 统一状态入口（部分）

| 项 | backup | current |
|---|---|---|
| 状态写入 | 27+ 处直接 `gameState.xxx = yyy`（line 19609, 19617, 20753, 21139, 21175, 24595, 25040, 26548 等） | 新增 `StateManager.set('entities.quests', ...)` + 8 个 Mutator（quest/bag/character/location/currency/relationship/time/undo） |
| 事务回滚 | 无（直接赋值，失败无法回滚） | `transaction(fn)` + `_transactionBackup` 快照，异常时 `this._state = this._transactionBackup` 真回滚 |
| 订阅 | 无（`gameState.conversationHistory.push(...)` 后无通知） | `StateManager.subscribe('entities.**', cb)` 通配符订阅 |
| 评价 | 无集中管理，任何代码都能改 gameState | Mutator 是改进方向，但**game.js 仍有 50+ 处直写未迁移**，半成品状态 |

**结论**：✅ **保留 current 架构方向**，但需补迁移 `js/game.js` 全部 `gameState.xxx = yyy` 到 Mutator。详见第六节"应删除 current 错误修改"。

---

### 6. VariableStore 全局变量持久化

| 项 | backup | current |
|---|---|---|
| 文件 | `backup/index.html:31450+` | `js/tavern-compat.js:5206-5224` |
| 代码 | 仅 `setGlobal(name, value) { this.global.set(...) }`（无持久化） | 额外 `_persistGlobal() → Storage.setJSON(Storage.KEYS.GLOBAL_VARS, d)` + `loadGlobal()` |
| 评价 | 刷新页面后全局变量丢失 | 跨刷新保留全局变量，与酒馆原版行为一致 |

**结论**：✅ **保留 current 实现**。

---

### 7. STscript 变量变更通知

| 项 | backup | current |
|---|---|---|
| 代码 | `setGlobal` 直接 `this.global.set`，无通知 | `this._notifyChange('global', name, value, charId)` → `window.STscriptUI.onVariableChange(...)` |
| 评价 | STscript 脚本无法响应变量变化 | 脚本能监听变化，触发后续动作 |

**结论**：✅ **保留 current 实现**。

---

## 三、应恢复 backup 优秀实现（current 退步）

### 1. **任务 addQuest 三套并存** — P0 架构问题

| 项 | backup | current |
|---|---|---|
| 任务添加入口 | 1 个：`mergeQuests(newQuests)`（line 21130-21151） | **3 个并存**（写不同 store） |
| 实现位置 | backup 全文 | ① `QuestMutator.addQuest`（`js/state/mutators/quest-mutator.js:110-126`）→ 写 `StateManager.entities.quests` → `_syncLegacyMirror` → `gameState.currentQuests`<br>② `GameMemory.addQuest`（`js/tavern-compat.js:3178-3186`）→ 写 `GameMemory.quests`（独立 store）<br>③ `mergeQuests`（`js/systems.js:733-748`）→ 包装 ① |
| 评价 | 单 store，AI 响应 → `mergeQuests` → `currentQuests.push`，逻辑清晰 | ① 与 ② 各写一份数据，AI 上下文 / buildSmartInjection / 玩家 UI 三者数据可能不同步 |

```js
// backup: 单一 mergeQuests（line 21130-21151）
function mergeQuests(newQuests) {
    if (!newQuests || !Array.isArray(newQuests)) return;
    if (!gameState.currentQuests) gameState.currentQuests = [];
    newQuests.forEach(function(nq) {
        if (!nq || !nq.title) return;
        // statusMap/typeMap 标准化
        var normalized = { ... };
        // 去重合并
        var existing = gameState.currentQuests.find(function(q) { return q.title === normalized.title; });
        if (existing) {
            if (existing.status === '已完成' || existing.status === '已失败') {
                normalized.status = existing.status;  // 保护已完成状态
            }
            Object.assign(existing, normalized);
        } else {
            gameState.currentQuests.push(normalized);
        }
    });
    gameState.currentQuests = active.concat(done);  // 排序
}

// current: 3 套并存
// ① QuestMutator.addQuest（js/state/mutators/quest-mutator.js:110-126）
addQuest(quest, options) {
    const normalized = this.normalizeQuest(quest);
    const quests = StateManager.get('entities.quests') || [];
    const existing = quests.find((q) => q.id === normalized.id || q.title === normalized.title);
    if (existing) {
        normalized.progress = this._pickHigherProgress(existing.progress, normalized.progress);
        if (existing.status === this.STATUS.COMPLETED || existing.status === this.STATUS.FAILED) {
            normalized.status = existing.status;
        }
        Object.assign(existing, normalized);  // 状态保护 + 进度取大
    } else {
        quests.push(normalized);
    }
    return this.setQuests(quests, options);  // setQuests 又会 _smartMerge
},
// ↑ 与 setQuests._smartMerge（line 50-82）逻辑高度重复

// ② GameMemory.addQuest（js/tavern-compat.js:3178-3186）
addQuest: function(quest) {
    if (!quest || !quest.title) return null;
    if (this.quests.some(function(q) { return q && q.title === quest.title && q.status === 'pending'; })) return null;
    if (!quest.createdTurn) quest.createdTurn = this.currentTurn;
    if (!quest.status) quest.status = 'pending';
    if (!quest.type) quest.type = 'promise';
    this.quests.push(quest);
    return quest;
},
// ↑ 注意：status 字符串与 QuestMutator.STATUS('进行中'/'已完成'/'已失败') **不一致**
//   当前用 'pending'/'resolved'/'broken'，与 QuestMutator 不互通

// ③ mergeQuests（js/systems.js:733-748）— 包装 ①
function mergeQuests(newQuests) {
    if (!StateManager || !QuestMutator) {
        throw new Error('[mergeQuests] QuestMutator 不可用');
    }
    newQuests.forEach(function(nq) {
        if (!nq || !nq.title) return;
        QuestMutator.addQuest(nq, { silent: true });
    });
},
```

**结论**：❌ **应恢复 backup 的单 mergeQuests 设计**，删除 GameMemory.addQuest（写酒馆自己的 quest store 是过度设计），让 QuestMutator.addQuest 为唯一入口。

**用户原题校验**：用户说"current 中 `addQuest` 合并语义不一致"——确实，QuestMutator.addQuest 和 setQuests._smartMerge 都有"保护已完成/失败"逻辑但实现位置不统一（前者 `Object.assign(existing, normalized)`，后者 `q.status = old.status`），是 DRY 违反。

---

### 2. **任务 STATUS 失败值不一致** — P1 兼容性

| 项 | backup | current |
|---|---|---|
| 文件 | `backup/index.html` 全文用 `'失败'` | `js/state/mutators/quest-mutator.js:9` `STATUS.FAILED = '已失败'` |
| fallback 兼容 | — | `js/state/adapters/game-memory-adapter.js:134` 有 `q.status === '已失败' \|\| '失败' \|\| 'broken'` 三态兼容 |
| 评价 | `'失败'` 是单字短词 | `'已失败'` 增加了"已"字，与 `已完成`/`已放弃` 对称但破坏旧 AI 响应字符串 |

**结论**：❌ **建议改回 `'失败'`**（保留 `'已失败'` 作为 alias），避免老存档/老 prompt 触发兼容分支。

---

### 3. **任务 STATUS 常量重复定义**

| 项 | backup | current |
|---|---|---|
| 文件 | — | ① `QuestSystem.STATUS`（`js/systems.js:8-10`）<br>② `QuestMutator.STATUS`（`js/state/mutators/quest-mutator.js:6-11`） |
| 代码 | backup 用裸字符串 `'进行中'/'已完成'/'失败'` | `QuestSystem.STATUS = (typeof QuestMutator !== 'undefined') ? QuestMutator.STATUS : {...}`（line 8-10）— 写明"通过 typeof 守卫 fallback 到字面量" |
| 评价 | 简洁但易错 | 重复定义 + 跨文件 typeof 守卫，启动顺序敏感的脆弱引用 |

**结论**：❌ **应删除 QuestSystem.STATUS**，统一从 `QuestMutator.STATUS` 导入（ES module 化或 global 引用），避免双源。

---

### 4. **世界书 scan() 缩进错位** — 代码质量

| 项 | backup | current |
|---|---|---|
| 文件 | `backup/index.html:13138-13260`（scan 主体） | `js/worldinfo.js:1441-1580` |
| 评价 | 缩进一致（4 空格 → 8 空格 → 12 空格逐步加深） | 1453 行开始少一层缩进，1463-1499 行再少两层，混用 tab/space 不一致 |
| 影响 | 阅读顺畅 | 容易误读 if/return 分支边界 |

```js
// current 错位示例（js/worldinfo.js:1441-1580 缩进不一致）
Object.keys(allEntries).forEach(function(uid) {
    var entry = allEntries[uid];
    if (!entry || WorldInfo.isEntryDisabled(entry)) return;
    if (entry.constant) {
        activated.push(entry);
        return;
    }

// ↓ 以下部分少了 4 空格缩进，但仍在 forEach 回调内
        var entryScanDepth = (entry.scanDepth != null) ? entry.scanDepth : scanDepth;
        if (entry.delay != null && entry.delay > 0) { ... }

// ↓ 再往下又少了 4 空格
    // delay_until_recursion 检查
    if (entry.delayUntilRecursion && !options.inRecursiveScan) {
```

**结论**：❌ **应恢复 backup 一致的缩进风格**。这是 refactor 时未注意格式化导致。

---

### 5. **世界书 buildInjection() 缩进 + 旧版扫描时序注释**

| 项 | backup | current |
|---|---|---|
| 文件 | `backup/index.html:13907-13970` | `js/worldinfo.js:2007-2093` |
| 评价 | 缩进正确 | 2029 行起 `atDepth` 注入逻辑缩进比 backup 少 4 空格（line 2031-2062），且 atDepth 处理与 outlet 处理错位 |

**结论**：❌ **缩进回退到 backup 风格**。

---

### 6. **世界书 `scan()` 函数有 pre-existing `depth=0` 0 值误判**（双方都有，但需修）

| 项 | backup | current |
|---|---|---|
| 文件 | `backup/index.html:12832` | `js/worldinfo.js:880` |
| 代码 | `depth: raw.depth \|\| ext.depth \|\| 4,` | `depth: raw.depth \|\| ext.depth \|\| 4,` |
| 评价 | **0 值误判**：当 `raw.depth === 0` 时，`raw.depth \|\| ...` 取 `ext.depth \|\| 4`，`depth:0` 变成 `depth:4` | **同 bug**（继承自 backup） |
| 酒馆原版行为 | 酒馆 spec 允许 `depth: 0`（表示"在第 0 条消息前"） | 误判会导致 at_depth=0 的世界书条目被推到 depth=4 |
| 修复方案 | 改为 `depth: raw.depth !== undefined ? raw.depth : (ext.depth !== undefined ? ext.depth : 4)`（参考 `priority` 字段 line 908 的写法） |

**结论**：❌ **双方都需修**，不是 current 引入的 bug，但**应统一修复**。

**用户原题校验**：用户问"backup 中世界书是否有 0 值误判 bug"——答：✅ **有，且 current 没修**。建议作为 P1 修复项处理。

---

## 四、应删除 current 错误修改（P0/P1 bug）

### 1. **角色卡字段映射漏 5 字段** — P0

| 项 | backup | current |
|---|---|---|
| 文件 | `backup/index.html:29260-29280`（`EnhancedMemory.recordCharacter`） | `js/state/adapters/game-memory-adapter.js:68-91` |
| 字段集 | `name, title, relation, favorability, desc, lastSeen, firstSeen, appearanceCount, history` | `name, title, relation, mood, location, outfit, favorability, status`（仅 8 字段） |
| 漏映射 | — | `identity, desc, tags, stats, notes, history, lastChangedTurn, locked, gameTime, accessCount`（5+ 字段被 StateManager.normalizeCharacter 创建但**未通过适配器 MERGE 到 GameMemory.tables.characters**） |

```js
// current 适配器（js/state/adapters/game-memory-adapter.js:68-91）
this._mergeTable('characters', StateManager.get('entities.characters') || [], {
    name: 'name',
    title: 'title',
    relation: 'relation',
    mood: 'mood',
    location: 'location',
    outfit: 'outfit',
    favorability: 'favorability',
    status: 'status'
    // ↑ 漏 identity / desc / tags / stats / notes
}, function(name) {
    return {
        name: name, title: '', relation: '', mood: '', location: '', outfit: '',
        favorability: 0, status: '', history: [], lastChangedTurn: turn, locked: false
        // ↑ 漏 identity / desc / tags / stats / notes 默认值
    };
});
```

**影响链路**：
- AI 响应中返回 `characters: [{ name: '萧炎', desc: '天才少年', identity: '主角兄弟', tags: ['天才','斗气'], stats: [{label:'境界', value:'斗者'}] }]`
- `CharacterMutator.mergeCharacters` → `normalizeCharacter` → 写全 17 字段到 `StateManager.entities.characters`（`js/state/mutators/character-mutator.js:193-228`）
- `GameMemoryAdapter.syncToGameMemory` → 只 MERGE 8 字段到 `GameMemory.tables.characters` → **desc/identity/tags/stats/notes 在 GameMemory 中丢失**
- `GameMemory._buildEntityChangeLines` 注入 AI 上下文时 → 角色只显示 `name/title/relation/mood/location/outfit/favorability/status`，**AI 看不到角色的 `desc` 描述！**

**结论**：❌ **P0 bug，必须修复**。在适配器 fieldMap 增补 `identity, desc, tags, stats, notes` 共 5 字段。

---

### 2. **clear() 漏清 3 字段** — P1

| 项 | backup | current |
|---|---|---|
| 文件 | `backup/index.html:29889-29907` | `js/tavern-compat.js:3640-3662` |
| clear 字段 | `workingMemory, shortTermMemory, longTermMemory, stats, summaryHistory, currentSummaryIndex` + `localStorage.removeItem` | `currentTurn, lastInjectionTurn, gameClock, permanentFacts, tables, plot, events, timeline, quests, workingMemory, stats, _changeLog, summaryHistory, _injectionSnapshots, _summaryLayers, _setupLayers, _dormantTracking, _storytellingConfig, _cachedInjection, _cachedInjectionTurn` |
| 漏清 | 无 | **`budget`, `compressionConfig`, `_worldNotes`**（saveToStorage 写入的 18 个字段里这 3 个未在 clear() 中重置） |

```js
// saveToStorage 写入（js/tavern-compat.js:3502）
var data = { version: ..., currentTurn, lastInjectionTurn, gameClock, permanentFacts, tables, plot, events, timeline, quests, workingMemory, budget, compressionConfig, stats, _changeLog, _injectionSnapshots, _summaryLayers, _setupLayers, _dormantTracking, _storytellingConfig, _worldNotes || [], savedAt };
//                                                              ^^^^^^  ^^^^^^^^^^^^^^^^                                                                ^^^^^^^^^^^^^
//                                                              这 3 个 clear() 没清

// clear()（js/tavern-compat.js:3640-3662）
clear: function() {
    this.currentTurn = 0; this.lastInjectionTurn = -1; this.gameClock = { day: 1, period: '早晨', lastUpdateTurn: 0 };
    this.permanentFacts = { pcIdentity: [], worldRules: [], settings: [], npcProfiles: [], promises: [], worldPlaces: [] };
    this.tables = { characters: {}, items: {}, locations: {}, relationships: {} };
    this.plot = { worldSetting: '', chapters: [], currentChapter: '', pendingMysteries: [] };
    this.events = []; this.timeline = []; this.quests = [];
    if (typeof StateManager !== 'undefined' && StateManager.set) {
        StateManager.set('entities.events', [], { silent: true });
    }
    this.workingMemory = { recentMessages: [], currentTopic: null, turns: [], messages: [] };
    this.stats = { totalMessages: 0, totalSummaries: 0, lastUpdateTime: null, tokenSaved: 0 };
    this._changeLog = []; this.summaryHistory = [];
    this._injectionSnapshots = {};
    this._summaryLayers = { near: [], mid: [], far: [] };
    this._setupLayers = { coreRules: '', worldSummary: '', fullSetup: '', compressed: false, extractTurn: -1, setupKeywords: [] };
    this._dormantTracking = { characters: {}, items: {}, quests: {}, foreshadowings: {} };
    this._storytellingConfig = { dormantWarningThreshold: 20, dormantUrgentThreshold: 30, foreshadowWarningThreshold: 15, maxForeshadowings: 20, aiGuidanceEnabled: true };
    Storage.remove(Storage.KEYS.MEMORY); Storage.remove(Storage.KEYS.ENHANCED_MEMORY);
    this._cachedInjection = null;
    this._cachedInjectionTurn = -1;
    this._markLtmDirty();
    // ↑ 缺 this.budget = {...}, this.compressionConfig = {...}, this._worldNotes = []
}
```

**结论**：❌ **P1 bug**。"新开一局"或"读档失败回退默认"时旧 budget/compressionConfig/worldNotes 会污染新局。

**用户原题校验**：用户说"clear() 漏清 5 字段"——实际数 3 字段（用户可能多算了 `currentSummaryIndex` 等 backup 字段，但 current 实体类不需要那些）。

---

### 3. **永久事实 5 入口 + 3 schema 漂移** — P1

| 项 | backup | current |
|---|---|---|
| 文件 | — | `js/tavern-compat.js:3089-3142`（`addWorldAnchor`） |
| 入口 | backup 没有"永久事实"概念，仅 `longTermMemory.characterTable` 等结构 | `addWorldAnchor(type, content, source, createdTurn)` 是唯一入口（看起来统一），但实际有 **5 路径**间接调用 |
| 间接调用 | — | ① `addWorldAnchor('pc_identity', snap.summary, 'worldSnapshot', ...)`（`_harvestWorldAnchors:3233`）<br>② `addWorldAnchor('npc_profile', desc, 'worldSnapshot', ...)`（`_harvestWorldAnchors:3234`）<br>③ `addWorldAnchor('setting', para, 'userPrompt:' + idx, ...)`（`_harvestWorldAnchors:3242/3246`）<br>④ `addWorldAnchor('promise', p.content, message.role === 'user' ? 'player' : 'ai', ...)`（`_extractAndRegisterPromises:3221`）<br>⑤ `syncWorldInfoEntry → addWorldAnchor(anchorType, syncContent, sourceTag, ...)`（`syncWorldInfoEntry:3171`） |
| schema 漂移 | — | ① 字段名 `pcIdentity/worldRules/settings/npcProfiles/promises/worldPlaces`（6 个，line 3642）<br>② 但 `addWorldAnchor` type 形参接受 `pc_identity/world_rule/npc_profile/setting/promise`（5 个，**用下划线**）<br>③ 通过 `_FACT_OLDTYPE_TO_NEWKEY` 映射（line 3091）<br>④ 真实存储 key 又是 camelCase，复用率低、容易写错 |

**结论**：❌ **P1 设计问题**。建议把 5 间接入口统一改为走 `addWorldAnchor`，并在 `addWorldAnchor` 顶部做 type alias 检查（运行时校验）。

---

### 4. **`scan()` 中 atDepth 在 `constant` 之后的所有 if 没有正确缩进，潜在可读性 bug**

| 项 | backup | current |
|---|---|---|
| 文件 | `backup/index.html:13140-13200` | `js/worldinfo.js:1441-1580` |
| 现象 | 缩进 4→8→12 递进 | 1453 行突然从 12 空格变 8 空格，1463 行再变 4 空格 |
| 风险 | — | if/else 分支边界不明，code review 时易误判条件 |

**结论**：❌ **应恢复 backup 的缩进风格**。

---

### 5. **任务合并逻辑 DRY 违反** — P1

| 项 | backup | current |
|---|---|---|
| 文件 | `backup/index.html:21130-21151`（单 `mergeQuests`） | `js/state/mutators/quest-mutator.js:50-82`（`_smartMerge`）+ `110-126`（`addQuest`） |
| 评价 | 单一实现，"保护已完成/失败" + "进度取大" 逻辑写一次 | 同一逻辑写两遍：<br>① `addQuest` 手动 `Object.assign(existing, normalized)` + 检查 `existing.status === COMPLETED/FAILED`<br>② `setQuests` 调用 `_smartMerge`，里面又做 `q.status = old.status`<br>且 `addQuest` 内部还会调 `setQuests`，**嵌套两次合并** |
| 风险 | — | 后续修改"已完成保护"逻辑需要改两处，容易漏改其中一处 |

**结论**：❌ **应合并为单点**。建议 `addQuest` 直接调 `setQuests`（去掉内部 `_smartMerge`），让 `_smartMerge` 为唯一合并入口。

---

## 五、酒馆 API 对齐度差异总结

| 酒馆概念 | backup | current | 对齐度 |
|---|---|---|---|
| `setvar/getvar` 全局变量 | `VariableStore.global`（无持久化） | `VariableStore.global` + `_persistGlobal` + `loadGlobal` + `Storage.KEYS.GLOBAL_VARS` | ⬆ **current 增强**（持久化） |
| `setlocalvar/getlocalvar` 局部变量 | `VariableStore.local` | `VariableStore.local` | ✅ 一致 |
| `setcharvar/getcharvar` 角色变量 | `VariableStore.character` | `VariableStore.character` | ✅ 一致 |
| STscript 引擎 | `STscriptEngine` | `STscriptEngine` + `_notifyChange` | ⬆ **current 增强** |
| 酒馆角色卡 spec_v2 字段 (`desc/identity/personality/scenario/first_mes/example_dialogue`) | `EnhancedMemory.longTermMemory.characterTable` 部分支持（`desc/history`） | `GameMemory.tables.characters` 通过适配器仅支持 8 字段 | ⬇ **current 退化**（漏 5+ 字段） |
| 世界书 V2 spec 60+ 字段 | 60+ 字段全支持（line 12760+） | 60+ 字段全支持（line 802+） | ✅ 一致 |
| 世界书 position 枚举 (0-7) | `positionMap` 字符串↔数字映射 | `positionMap` 字符串↔数字映射 | ✅ 一致 |
| 永久事实 (酒馆无此概念，current 原创) | 无 | 6 字段永久事实 | 🆕 **current 原创** |
| `getWorldInfoBudget` / token 预算 | 无显式 API | `applyBudget(tokens, activated)`（`js/worldinfo.js:1816-1830`） | 🆕 **current 增强** |
| `setRegexFromString` | 内部 RegexFromString 工具 | 内部 RegexFromString 工具 | ✅ 一致 |
| 酒馆世界书 activation 顺序 (constant > depth=0 > depth=1...) | 递归扫描 + 0-4 depth 权重 | 递归扫描 + 0-4 depth 权重 | ✅ 一致 |

---

## 六、行动建议（按优先级）

### 🔴 P0 必修

1. **修复角色卡字段映射漏 5 字段**
   - 文件：`js/state/adapters/game-memory-adapter.js:68-91`
   - 操作：在 `fieldMap` 中增补 `identity, desc, tags, stats, notes` 5 字段；在 factory 中增补默认值
   - 验证：AI 响应包含 `desc` 的角色，下次注入时 `GameMemory.tables.characters[name].desc` 应当被更新

2. **删除 GameMemory.addQuest，保留 QuestMutator.addQuest 单源**
   - 文件：`js/tavern-compat.js:3178-3186`
   - 同步删除 `_extractAndRegisterPromises`（line 3217）中的 `self.addQuest({...})` 调用，改走 `QuestMutator.addQuest`
   - 同步删除 `parseInstruction`（line 1213）中的 `self.addQuest({...})`，改走 `QuestMutator.addQuest`

### 🟠 P1 应修

3. **修复 clear() 漏清 3 字段**
   - 文件：`js/tavern-compat.js:3640-3662`
   - 操作：增补 `this.budget = {...}`、`this.compressionConfig = {...}`、`this._worldNotes = []`

4. **修复世界书 `depth: 0` 误判**
   - 文件：`js/worldinfo.js:880`（同时修 backup 备份）
   - 操作：改为 `depth: raw.depth !== undefined ? raw.depth : (ext.depth !== undefined ? ext.depth : 4)`

5. **统一任务 STATUS 常量**
   - 文件：`js/systems.js:8-10` 删 `QuestSystem.STATUS` 重复定义
   - 改为 `QuestSystem.STATUS = QuestMutator.STATUS`（运行时同步引用）

6. **合并 addQuest 和 _smartMerge 的"保护已完成"逻辑**
   - 文件：`js/state/mutators/quest-mutator.js:110-126`
   - 改 `addQuest` 只调 `setQuests`，去掉内部 `Object.assign` 块

7. **恢复世界书 scan() / buildInjection() 缩进风格**
   - 文件：`js/worldinfo.js:1441-1580` 和 `2007-2093`
   - 操作：与 backup 一致的 4 空格递进缩进

### 🟡 P2 优化

8. **统一 permanentFacts 5 入口为单点 addWorldAnchor 调用**
   - 文件：`js/tavern-compat.js:3229-3251`（`_harvestWorldAnchors`）
   - 操作：保持 4 路径（pc_identity/npc_profile/setting/promise）调用，但删 `worldSnapshot` 字符串 source，改 sourceTag 规范化

9. **任务 STATUS.FAILED 兼容 `'失败'` 别名**
   - 文件：`js/state/mutators/quest-mutator.js:6-11`
   - 操作：保留 `'已失败'` 但加 `_statusMap['失败'] = '已失败'` 兼容 backup 旧 AI 响应

10. **StateManager 迁移 game.js 的 50+ 直写到 Mutator**
    - 文件：`js/game.js:147, 189-192, 524, 938, 962-964, 971, 986, 1024-1026, 1032, 1044, 1288, 1560-1561, 1589, 1597, 1599, 1608, 1671, 1673, 1700, 1868, 1989-1992, 2074-2085, 3400, 3412, 3416-3417, 3423, 3464-3466, 3658, 3732, 3784, 4047, 4234-4235, 4311`
    - 操作：每个 `gameState.xxx = yyy` 替换为 `StateManager.set('path.to.xxx', yyy)` 或对应 Mutator 调用

---

## 七、附录：关键发现速查

- ✅ **current 修复了 backup 的 bug**：
  - 成就玩家名硬编码 → 动态（`js/systems.js:422-430`）
  - atDepth 无去重 → clear + dedup（`js/worldinfo.js:2031-2062`）
  - 世界书 enabled 漏 disabled 兼容 → 3 条件全兼容（`js/worldinfo.js:864`）
  - 酒馆全局变量无持久化 → `_persistGlobal/loadGlobal`（`js/tavern-compat.js:5206-5224`）
  - STscript 无变化通知 → `_notifyChange` 钩子（`js/tavern-compat.js:5227-5229`）
  - 无永久事实 → 6 字段 permanentFacts + 限时回收（`js/tavern-compat.js:3089-3142`）
  - 无状态事务 → `transaction` + 快照回滚（`js/state/state-manager.js:104-136`）

- ❌ **current 引入了 backup 没有的 bug/退步**：
  - 角色卡字段映射漏 5 字段（`js/state/adapters/game-memory-adapter.js:68-91`）— P0
  - clear() 漏清 budget/compressionConfig/_worldNotes（`js/tavern-compat.js:3640-3662`）— P1
  - 任务 addQuest 三套并存（QuestMutator/GameMemory/mergeQuests）— P0
  - 任务 STATUS 失败值 '已失败' vs backup '失败'（`js/state/mutators/quest-mutator.js:9`）— P1
  - 任务 STATUS 常量双源（QuestSystem/QuestMutator）— P1
  - 任务合并逻辑 DRY 违反（addQuest + _smartMerge 两处实现）— P1
  - 世界书 scan()/buildInjection() 缩进错位（`js/worldinfo.js:1441-1580, 2007-2093`）— P2
  - 世界书 depth=0 误判（与 backup 同 bug）— P1

- 🆕 **current 的重大原创添加**：
  - GameMemory 取代 EnhancedMemory（6 字段永久事实 + 重要事件压缩 + 30 条淘汰）
  - StateManager + 8 Mutator 架构
  - WorldInfo 适配器 (GameMemoryAdapter) MERGE 语义
  - `_mergeRuntimeFields` 拆分实体字段/运行时字段
  - `autoAdvanceByStory` 剧情触发任务完成（`js/state/mutators/quest-mutator.js:137-192`）

---

**报告完成日期**：2026-07-02
**报告作者**：Claude (code-review sub-agent)
**复核方法**：grep + Read + line-by-line 逐项对比 backup 与 current 实现
