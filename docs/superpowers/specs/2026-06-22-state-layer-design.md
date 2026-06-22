# 阶段 1 设计：统一状态层（State Abstraction Layer）

## 版本

- 日期：2026-06-22
- 状态：待实现
- 负责人：AI 辅助实现
- 关联文档：`docs/00-项目总览.md`、`docs/01-现状诊断.md`

## 目标

让 `gameState` 从一个被全局随意读写的对象，变成**单一事实来源（Single Source of Truth）**。

阶段 1 结束时，应满足：

1. 所有新的状态读写必须通过 `StateManager` API。
2. `gameState` 的字段结构按职责分域（world / progress / entities / time / ui）。
3. 状态变更通过订阅机制通知订阅者，取代 `GameLinker` 的硬编码映射。
4. 同一轮剧情更新中，多次状态变更打包为一次事务提交，避免中间状态触发多次渲染。
5. 现有功能不回归：仍能正常开局、选择、更新物品/任务/角色、存档读档。

## 范围

### 包含

- 新建 `js/state/` 目录及核心模块
- 定义状态数据模型（schema）
- 实现 `StateManager` 的读/写/订阅/事务 API
- 实现与 `GameMemory` 的适配同步
- 实现与 `SaveDB` 的存档读档适配
- 将关键状态读写（bag、quests、characters、time、progress）迁移到 `StateManager`

### 不包含

- AI prompt 重构（阶段 2）
- 选项生成逻辑重构（阶段 2）
- UI 组件拆分（阶段 3）
- 测试框架搭建（阶段 4）
- 世界书、预设系统重构

## 设计原则

1. **单一事实来源**：任何数据只有一处权威存储。
2. **显式优于隐式**：所有状态变更必须显式调用 API，禁止裸的 `gameState.xxx = yyy`。
3. **防御性读取**：读取时返回深拷贝或不可变快照，防止外部意外修改。
4. **最小侵入迁移**：新旧代码可以共存，逐步替换，不追求一次性重写。
5. **先规范再优化**：先让状态可追踪，再优化性能。

## 状态数据模型

### 顶层结构

```javascript
var gameState = {
    // === 元数据 ===
    meta: {
        version: '1.0.0',
        createdAt: 0,
        updatedAt: 0
    },

    // === 世界设定（初始化后只读） ===
    world: {
        userPrompt: '',
        setupText: '',
        theme: '',
        genre: '',
        pureTextMode: false,
        generateChoices: true,
        maxTokens: 4096,
        contextSize: 8000,
        // 兼容原字段
        temperature: 0.7
    },

    // === 游戏进程 ===
    progress: {
        turn: 0,
        sceneTitle: '',
        lastSceneTitle: '',
        rollingSummary: '',
        conversationHistory: [],
        // 用于防御 AI 回退
        preAIState: {
            title: '',
            gameTime: null
        }
    },

    // === 游戏实体 ===
    entities: {
        player: {
            name: '',
            identity: '',
            stats: [],
            // 兼容旧数据
            level: 1,
            exp: 0
        },
        characters: [],    // NPC 数组
        bag: [],           // 物品数组
        quests: [],        // 任务数组
        locations: [],     // 地点数组（修复 BUG-06）
        events: []         // 关键事件数组
    },

    // === 游戏时间 ===
    time: {
        date: '',
        time: '',
        period: ''
    },

    // === UI 状态（与游戏逻辑严格分离） ===
    ui: {
        currentPage: 'menu',
        lastChoices: [],
        logSubPage: '',
        lastHUD: null
    }
};
```

### 字段映射

为兼容旧代码，需要维护旧字段名到新路径的映射：

| 旧字段 | 新路径 |
|--------|--------|
| `userPrompt` | `world.userPrompt` |
| `setupText` | `world.setupText` |
| `theme` | `world.theme` |
| `genre` | `world.genre` |
| `pureTextMode` | `world.pureTextMode` |
| `generateChoices` | `world.generateChoices` |
| `maxTokens` | `world.maxTokens` |
| `contextSize` | `world.contextSize` |
| `temperature` | `world.temperature` |
| `_stats.totalTurns` | `progress.turn` |
| `_lastSceneTitle` | `progress.lastSceneTitle` |
| `rollingSummary` | `progress.rollingSummary` |
| `conversationHistory` | `progress.conversationHistory` |
| `_preAIState` | `progress.preAIState` |
| `playerData` | `entities.player` |
| `allCharacters` | `entities.characters` |
| `currentBag` | `entities.bag` |
| `currentQuests` | `entities.quests` |
| `keyEvents` | `entities.events` |
| `gameTime` | `time` |
| `_lastChoices` | `ui.lastChoices` |
| `_lastHUD` | `ui.lastHUD` |

## 模块设计

### 1. `js/state/schema.js`

职责：定义状态结构、字段类型、默认值、旧字段映射。

```javascript
var StateSchema = {
    getDefaultState: function() { ... },
    getFieldPath: function(legacyName) { ... },
    getLegacyName: function(path) { ... },
    validatePath: function(path) { ... },
    isReadOnly: function(path) { ... }
};
```

### 2. `js/state/state-manager.js`

职责：唯一的状态读写入口。

```javascript
var StateManager = {
    // === 读 ===
    get: function(path) { ... },           // 'entities.bag'
    getIn: function(pathArray) { ... },    // ['entities', 'bag']
    snapshot: function() { ... },          // 返回完整深拷贝

    // === 写 ===
    set: function(path, value, options) { ... },
    merge: function(path, partial) { ... },
    updateIn: function(pathArray, updater) { ... },

    // === 批量/事务 ===
    transaction: function(fn) { ... },
    batch: function(operations) { ... },

    // === 订阅 ===
    subscribe: function(pattern, callback) { ... },
    unsubscribe: function(token) { ... },
    notify: function(changes) { ... },

    // === 兼容 ===
    getLegacy: function(name) { ... },
    setLegacy: function(name, value, options) { ... },

    // === 内部 ===
    _state: null,
    _listeners: [],
    _inTransaction: false,
    _pendingChanges: []
};
```

#### 关键实现要求

1. `get/getIn` 返回深拷贝。
2. `set` 支持 `options.silent`（不触发通知，用于初始化/读档）。
3. `transaction` 执行期间所有变更暂存，提交时一次性通知。
4. 订阅支持通配符：
   - `'entities.bag'` 精确匹配
   - `'entities.*'` 匹配 entities 下任意字段
   - `'**'` 匹配所有变更
5. 保留全局 `gameState` 对象引用，但禁止直接修改。`StateManager` 内部维护这个对象，外部通过 API 访问。

### 3. `js/state/mutators/bag-mutator.js`

职责：物品相关的所有变更操作。

```javascript
var BagMutator = {
    setItems: function(items) { ... },
    addItem: function(item) { ... },
    removeItem: function(name) { ... },
    updateItem: function(name, updater) { ... },
    normalizeItem: function(raw) { ... }   // 把 AI 返回的 item 转为标准格式
};
```

标准化物品格式：

```javascript
{
    id: 'uuid-or-name-hash',
    name: '水果刀',
    count: 1,
    unit: '把',
    rarity: '普通',
    desc: '',
    usable: false,
    effect: '',
    equippable: false,
    equipped: false,
    slot: ''
}
```

### 4. `js/state/mutators/quest-mutator.js`

职责：任务相关的所有变更操作。

```javascript
var QuestMutator = {
    setQuests: function(quests) { ... },
    addQuest: function(quest) { ... },
    updateQuest: function(id, updater) { ... },
    normalizeQuest: function(raw) { ... },
    normalizeStatus: function(status) { ... }   // pending -> 进行中
};
```

标准化任务格式：

```javascript
{
    id: 'uuid',
    title: '',
    type: '主线',     // 主线 / 支线 / 隐藏
    status: '进行中', // 进行中 / 已完成 / 已失败 / 已放弃
    desc: '',
    progress: '0/1',
    hint: '',
    rewards: []
}
```

### 5. `js/state/mutators/character-mutator.js`

职责：角色/关系相关的所有变更操作。

```javascript
var CharacterMutator = {
    setCharacters: function(characters) { ... },
    mergeCharacters: function(characters) { ... },
    updateRelationship: function(name, delta) { ... },
    normalizeCharacter: function(raw) { ... }
};
```

### 6. `js/state/mutators/time-mutator.js`

职责：游戏时间的所有变更操作。

```javascript
var TimeMutator = {
    setTime: function(time) { ... },
    advance: function(options) { ... }
};
```

### 7. `js/state/adapters/game-memory-adapter.js`

职责：维护 `StateManager` 与 `GameMemory`（酒馆记忆系统）之间的同步。

```javascript
var GameMemoryAdapter = {
    // StateManager -> GameMemory
    syncToGameMemory: function() { ... },
    // GameMemory -> StateManager
    syncFromGameMemory: function() { ... },
    // 监听 StateManager 变更，自动同步
    bind: function() { ... }
};
```

原则：阶段 1 先保证双向同步正确，阶段 2/3 再考虑是否逐步让 GameMemory 只读或退场。

### 8. `js/state/adapters/save-adapter.js`

职责：存档和读档时，在 `StateManager` 和 `SaveDB` 之间转换数据格式。

```javascript
var SaveAdapter = {
    toSaveData: function() { ... },
    fromSaveData: function(data) { ... },
    migrateLegacySave: function(data) { ... }   // 兼容旧存档
};
```

## 订阅/通知机制

替代 `GameLinker` 的硬编码映射。

```javascript
StateManager.subscribe('entities.bag', function(bag, change) {
    renderBag(bag);
    // 迁移期间可继续调用 GameLinker 触发页面刷新，阶段 3 再逐步替换为独立渲染
    GameLinker.refresh('playerPage');
});

StateManager.subscribe('entities.quests', function(quests, change) {
    renderQuests(quests);
    GameLinker.refresh('storyPage');
});

StateManager.subscribe('progress.turn', function(turn) {
    updateTurnDisplay(turn);
});

StateManager.subscribe('**', function(snapshot, changes) {
    // 调试、存档自动保存
    console.log('[StateManager] 变更:', changes);
});
```

## 事务机制

每轮 AI 返回后，涉及多个状态变更。使用事务保证：

1. 中间状态不会触发订阅者
2. 只有最终一致状态才会通知 UI
3. 如果解析过程中出错，可以回滚

```javascript
StateManager.transaction(function() {
    StateManager.set('progress.sceneTitle', data.title, { silent: true });
    StateManager.set('progress.turn', nextTurn, { silent: true });
    BagMutator.setItems(data.bag);
    QuestMutator.setQuests(data.quests);
    CharacterMutator.mergeCharacters(data.characters);
    TimeMutator.setTime(data.gameTime);
});
// 事务结束时统一通知
```

## 脚本加载顺序

`index.html` 中 `js/state/` 的加载必须在 `utils.js` 之后、其他系统（`core.js`、`game.js` 等）之前，确保它们可用 `StateManager` API。

`StateManager.init(gameState)` 在 `initApp` 中调用，接管已经存在的全局 `gameState`。

建议顺序（在现有 script 标签中插入）：

```html
<script src="js/utils.js"></script>
<script src="js/state/schema.js"></script>
<script src="js/state/state-manager.js"></script>
<script src="js/state/mutators/bag-mutator.js"></script>
<script src="js/state/mutators/quest-mutator.js"></script>
<script src="js/state/mutators/character-mutator.js"></script>
<script src="js/state/mutators/time-mutator.js"></script>
<script src="js/state/adapters/game-memory-adapter.js"></script>
<script src="js/state/adapters/save-adapter.js"></script>
<!-- 原有系统 -->
<script src="js/core.js"></script>
<script src="js/game.js"></script>
<script src="js/systems.js"></script>
<script src="js/phone-ui.js"></script>
<script src="js/init.js"></script>
```

## 迁移策略

### 第 1 步：新建模块（不破坏旧代码）

创建 `js/state/` 下所有文件，实现 `StateManager` 基础 API。

### 第 2 步：初始化时接管 gameState

在 `initApp` 中，初始化完成后调用：

```javascript
StateManager.init(gameState);
```

`StateManager` 保存 `gameState` 引用，作为内部状态源。外部仍然可以通过 `window.gameState` 读取，但禁止直接赋值。

为降低迁移期风险，不强制冻结 `gameState`，但要求：
- 新代码禁止裸赋值。
- 修改旧代码时，发现裸赋值即替换为 `StateManager.setLegacy(name, value)`。
- 阶段 1 收尾时，全局搜索 `gameState\s*=` 和 `gameState\.\w+\s*=` 两类模式，全部清零。

### 第 3 步：新旧代码共存

- 新代码必须使用 `StateManager.get/set`。
- 旧代码暂时保留，但在修改旧代码时逐步替换。
- 添加运行时警告（仅在开发模式）：检测到直接修改 `gameState` 时打印警告。

### 第 4 步：封装热点路径

优先迁移 bug 高发路径：

1. `game.js` 中 AI 返回后的状态合并逻辑
2. `core.js` 中 `_syncItemsToBag` / `_syncQuestsToGameState`
3. `systems.js` 中 `QuestSystem` 对 `gameState.currentQuests` 的访问
4. `phone-ui.js` 中 render 函数对状态的读取

### 第 5 步：清理旧访问

当大部分路径迁移完成后：

1. 全局搜索裸的 `gameState.xxx = ` 赋值
2. 逐处替换为 `StateManager.set`
3. 最终禁止直接赋值（通过代码审查或 lint）

## 与现有系统的边界

### 与 `GameMemory`

- `GameMemory` 继续作为记忆系统的内部实现。
- `StateManager` 通过 `GameMemoryAdapter` 与之同步。
- 避免在 `game.js` / `core.js` 中直接访问 `GameMemory.tables`。

### 与 `SaveDB`

- 存档时，`SaveAdapter.toSaveData()` 读取 `StateManager.snapshot()`。
- 读档时，`SaveAdapter.fromSaveData()` 写入 `StateManager`（silent 模式）。

### 与 UI

- UI render 函数优先通过 `StateManager.get()` 读取状态。
- UI 事件处理函数通过 `StateManager.set()` / Mutator 修改状态。
- 复杂渲染通过订阅触发。

### 与 AI 交互层

- AI 返回的原始数据先经过标准化（Mutator.normalize*）。
- 标准化后的数据通过 `StateManager.set()` / `transaction()` 写入。
- 不要直接把 `data.bag` 赋值给 `gameState.currentBag`。

## 验收标准

阶段 1 完成时，以下场景必须正常运行：

1. 新建游戏，进入故事页面，标题、时间、选项正常显示。
2. 选择选项后，剧情推进，物品/任务/角色状态更新。
3. 连续进行 5 轮以上游戏，无剧情回退、状态丢失。
4. 物品页面不再出现 undefined/空条目。
5. 任务状态统一显示中文（进行中/已完成/已失败/已放弃）。
6. 地点字段启用，记忆页面地点数从 0 变为正确值。
7. 存档、读档、刷新页面后状态恢复。
8. 控制台无 "核心规则 undefined 条" 等明显错误。

## 风险与应对

| 风险 | 可能性 | 应对 |
|------|--------|------|
| 迁移过程中破坏旧存档 | 中 | SaveAdapter 提供 migrateLegacySave |
| StateManager 性能成为瓶颈 | 低 | get 返回深拷贝，但前期实体数量少；后续可优化为不可变结构共享 |
| 订阅过多导致渲染抖动 | 中 | 事务机制合并通知；UI 订阅细化到字段 |
| 旧代码在迁移期间仍直接改 gameState | 高 | 运行时警告；分系统逐步替换 |
| GameMemory 与 StateManager 循环同步 | 中 | 适配器加同步锁，避免递归 |

## 后续阶段衔接

阶段 1 完成后：

- 阶段 2（AI 契约层）将基于 `StateManager` 提供的稳定状态接口，构建 `PromptBuilder` 和 `ResponseParser`。
- 阶段 3（模块拆分）将基于 `StateManager` 拆出独立的 `StoryEngine`、`UIRenderer` 等模块。
- 阶段 4（测试）将基于 `StateManager` 的可预测 API 编写单元测试。
