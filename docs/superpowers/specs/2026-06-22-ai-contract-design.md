# 阶段 2 设计：AI 输出契约层（AI Contract Layer）

## 版本

- 日期：2026-06-22
- 状态：待实现
- 负责人：AI 辅助实现
- 关联文档：`docs/00-项目总览.md`、`docs/01-现状诊断.md`、`docs/superpowers/specs/2026-06-22-state-layer-design.md`

## 目标

在阶段 1 统一状态层的基础上，把与 AI 的交互从“散落在 game.js / core.js 的字符串拼接 + 多段兜底解析”改造成**可预测、可维护、可测试的契约层**。

阶段 2 结束时，应满足：

1. Prompt 由模板系统组装，结构清晰，避免一个函数拼接上千行字符串。
2. AI 回复有统一的解析与校验入口，输出字段标准化。
3. 模型异常、JSON 截断、思维链泄漏、JSON 包字符串等常见错误被自动兜底。
4. 上下文历史、滚动摘要、token 预算由统一模块管理，支持长回合（100+ 轮）。
5. AI 返回的状态变化自动写入 StateManager，不再在 game.js 中裸改 gameState。

## 范围

### 包含

- 新建 `js/ai-contract/` 目录及核心模块
- `PromptBuilder`：模板化 system/user prompt 构建
- `ResponseParser`：JSON / <mem> / 纯文本三模式统一解析
- `OutputSanitizer`：清理思维链、JSON 泄漏、HTML 标签、光标符号
- `FallbackEngine`：模型故障转移、重试、降级策略
- `ContextManager`：conversationHistory、rollingSummary、token 预算、上下文压缩
- `AIResponseMutator`：把解析后的 AI 输出标准化为 StateManager 可接受的数据
- 迁移 `game.js` 中的 `sendAIRequest` / `buildSystemPrompt` 到契约层
- 迁移 `core.js` 中的 `parseAIResponse` / `safeJSONParse` / `extractStr` 到契约层

### 不包含

- UI 组件重构（阶段 3）
- 存档格式重构（已在阶段 1 通过 SaveAdapter 兼容）
- 新增玩法系统（战斗、地图等）
- 模型后训练或 Fine-tune

## 设计原则

1. **契约优先**：AI 输出必须满足一个明确 schema，前端不再做无限制猜测。
2. **防御性解析**：假设 AI 一定会犯错，解析器必须有 3 层以上兜底。
3. **模板化 prompt**：所有 prompt 文本放进模板/片段，便于 A/B 测试和调优。
4. **单一调用入口**：`sendAIRequest` 只负责协调，不再直接拼接字符串或解析 JSON。
5. **状态变更自动化**：解析后的数据通过 Mutator 写入 StateManager，game.js 只做 UI 渲染协调。
6. **可测试**：契约层模块不依赖 DOM，可在 Node 中跑单元测试。

## 现状问题（驱动本阶段设计）

| 问题 | 位置 | 影响 |
|------|------|------|
| `buildSystemPrompt` 单函数超过 200 行，模板与逻辑混写 | `js/game.js` | 难调优、难维护、预设冲突难排查 |
| `parseAIResponse` 使用 `let/const` 与项目 `var` 风格不一致，且多层兜底耦合 | `js/core.js` | 解析逻辑散落，错误处理不一致 |
| JSON 被包成字符串返回时解析失败，JSON 片段泄漏到剧情 | `js/core.js` | 玩家看到 `"story":` 等原始 JSON |
| 思维链/推理内容混入 story | `js/core.js` | 破坏沉浸感 |
| 地点提取质量差（“阳光”“依靠触觉”被识别为地点） | `js/tavern-compat.js` | 地点数据污染 |
| 上下文压缩策略硬编码（SLIM_THRESHOLD=6 等） | `js/game.js` | 长回合 token 预算不可控 |
| 模型故障时无统一降级策略 | `js/core.js` | 玩家看到空回复或报错 |

## 数据模型

### AI 输出标准 schema

```javascript
var AIOutputSchema = {
    // 剧情文本（必须）
    story: '',
    // 章节标题
    title: '',
    // 选项数组
    choices: [{ id: '', text: '' }],
    // 主角信息
    player: { name: '', identity: '', stats: [] },
    // NPC 数组
    characters: [{ name: '', relation: '', favorability: 0, status: '' }],
    // 物品数组
    bag: [{ name: '', count: 1 }],
    // 货币
    currency: 0,
    currencyName: '金币',
    // 任务数组
    quests: [{ title: '', status: '', type: '', desc: '', progress: '' }],
    // 游戏时间
    gameTime: { date: '', time: '', period: '' },
    // 地点
    locations: [],
    // 关键事件
    keyEvents: [],
    // 关系变化
    relationships: [],
    // 世界模块
    world: [],
    // 上下文摘要
    contextSummary: '',
    // HUD 信息
    hud: {}
};
```

### Prompt 模板结构

```javascript
var PromptTemplate = {
    // 身份与最高规则
    identity: '',
    // 世界设定
    world: '',
    // 主角设定
    protagonist: '',
    // 当前状态（记忆注入）
    state: '',
    // 输出格式要求
    format: '',
    // 工作方式/文风
    workflow: '',
    // 本轮用户输入
    userInput: ''
};
```

## 模块设计

### 1. `js/ai-contract/schemas/ai-output-schema.js`

职责：定义 AI 输出 schema、字段类型、必填项、默认值、旧字段别名映射。

```javascript
var AIOutputSchema = {
    REQUIRED_FIELDS: ['story'],
    STORY_ALIASES: ['story', 'storyText', 'content', 'text', 'narrative'],
    TITLE_ALIASES: ['title', 'scene', 'sceneTitle', 'chapterTitle'],
    getDefaultOutput: function() { ... },
    normalize: function(raw) { ... },
    validate: function(data) { ... }
};
```

### 2. `js/ai-contract/prompt-builder.js`

职责：按模板组装 prompt，支持片段注册与覆盖。

```javascript
var PromptBuilder = {
    // 注册 prompt 片段
    registerSection: function(name, templateFn, options) { ... },
    // 构建完整 system prompt
    buildSystemPrompt: function(context) { ... },
    // 构建 user prompt
    buildUserPrompt: function(input, context) { ... },
    // 按模式切换（JSON / 纯文本 / 预设接管）
    setMode: function(mode) { ... }
};
```

模板片段采用函数返回字符串，避免硬编码大段文本。`context` 从 StateManager 读取，不直接访问 gameState。

### 3. `js/ai-contract/response-parser.js`

职责：把 AI 原始回复解析为标准 AIOutputSchema。

```javascript
var ResponseParser = {
    parse: function(rawReply, options) { ... },
    // 内部方法
    _tryDirectJSON: function(raw) { ... },
    _tryCodeBlockJSON: function(raw) { ... },
    _tryRobustJSON: function(raw) { ... },
    _tryMemTags: function(raw) { ... },
    _tryPlainText: function(raw) { ... }
};
```

解析流程（按优先级）：

1. 直接 JSON 解析（含 JSON 包字符串二次解析）。
2. ` ```json ` 代码块解析。
3. 状态机从文本中提取第一个完整 JSON 对象。
4. `<mem>` 标签解析（纯文本模式）。
5. 纯文本兜底：把整段回复当 story，再尝试从末尾提取 JSON 块。

返回结构：

```javascript
{
    success: true,
    data: { /* 标准化后的 AIOutputSchema */ },
    storyText: '',
    mems: [],
    warnings: [],
    truncated: false,
    fallbackLevel: 0   // 0=直接解析, 1=代码块, 2=状态机, 3=mem, 4=纯文本
}
```

### 4. `js/ai-contract/output-sanitizer.js`

职责：清理 AI 输出中的噪声。

```javascript
var OutputSanitizer = {
    // 清理 story 文本
    sanitizeStory: function(text) { ... },
    // 清理 JSON 字符串
    sanitizeJSON: function(raw) { ... },
    // 移除思维链
    stripThinking: function(text) { ... },
    // 移除 HTML/光标符号
    stripHTMLAndCursors: function(text) { ... },
    // 移除 JSON 前缀/后缀
    stripJSONArtifacts: function(text) { ... }
};
```

清理规则：

- `<thinking>...</thinking>`、`<ECoT>...</ECoT>`、`<analysis>...</analysis>`
- `💭...💭`、`"story":`、`title:`、`story:` 等前缀
- `▌`、`|` 等光标符号
- `<br>`、`<p>` 等 HTML 标签（保留换行语义）
- 首尾空白、多余换行

### 5. `js/ai-contract/fallback-engine.js`

职责：管理模型调用异常时的重试与降级。

```javascript
var FallbackEngine = {
    // 配置
    MAX_RETRIES: 2,
    RETRY_DELAY_MS: 1000,
    // 执行调用（含重试）
    execute: function(callFn, options) { ... },
    // 模型故障转移
    nextModel: function(failedModelId) { ... },
    // 降级策略：从 JSON 模式降级为纯文本模式
    degradeMode: function(context) { ... }
};
```

降级策略：

- 网络超时/空回复：重试当前模型。
- JSON 解析连续失败：尝试切换备用模型；若仍失败，降级为纯文本模式并提示玩家。
- 模型返回截断：增大 max_tokens 重试。
- 所有模型均失败：显示友好错误 + 🔄 重新生成按钮。

### 6. `js/ai-contract/context-manager.js`

职责：管理对话上下文、token 预算、滚动摘要。

```javascript
var ContextManager = {
    // 获取发送给 AI 的消息列表
    buildMessages: function(userInput, options) { ... },
    // 添加 AI 回复到历史
    appendAssistant: function(rawReply, parsedData) { ... },
    // 添加用户输入到历史
    appendUser: function(userInput) { ... },
    // 压缩历史（摘要旧对话）
    compress: function() { ... },
    // 估算当前上下文 token
    estimateTokens: function(messages) { ... },
    // 获取/设置滚动摘要
    getRollingSummary: function() { ... },
    setRollingSummary: function(text) { ... }
};
```

上下文构建策略：

1. system prompt（含世界书、预设、记忆注入）。
2. 滚动摘要（当历史超过阈值时）。
3. 最近 N 轮完整历史（可配置）。
4. 用户输入。

压缩策略：

- 保留最近 3-6 轮完整对话。
- 更早的对话由 AI 生成摘要，替换为 `【前情摘要】`。
- 触发压缩的阈值由 token 估算决定，而非固定轮数。

### 7. `js/ai-contract/ai-response-mutator.js`

职责：把解析后的 AI 输出写入 StateManager。

```javascript
var AIResponseMutator = {
    // 把 ResponseParser 结果应用到状态
    apply: function(parsed, options) { ... },
    // 子操作
    _applyStoryAndTitle: function(data) { ... },
    _applyPlayer: function(data) { ... },
    _applyCharacters: function(data) { ... },
    _applyBag: function(data) { ... },
    _applyQuests: function(data) { ... },
    _applyGameTime: function(data) { ... },
    _applyLocations: function(data) { ... },
    _applyKeyEvents: function(data) { ... }
};
```

所有写入通过 StateManager.transaction 打包，避免多次渲染。

## 与现有系统的边界

### 与 `StateManager`

- 契约层读取状态：通过 `StateManager.get()`。
- 契约层写入状态：通过 Mutator 调用 `StateManager.set()` / `StateManager.transaction()`。
- 不再直接修改 `gameState.xxx`。

### 与 `PresetManager`

- `PromptBuilder` 预留预设注入点：`registerSection('preset', ...)`。
- 酒馆预设的 depth/position prompts 由 `ContextManager` 按标准顺序插入。
- 内置预设可完全接管 format 片段。

### 与 `EnhancedMemory`

- `PromptBuilder` 从 `EnhancedMemory.buildSmartInjection()` 获取记忆文本，注入到 state 片段。
- `ContextManager` 在有记忆注入时跳过重复的世界快照和滚动摘要。

### 与 `WorldInfo`

- `PromptBuilder` 通过 `getWorldInfoInjection()` 获取世界书文本。
- `ContextManager` 按酒馆 depth 顺序插入 position prompts。

## 脚本加载顺序

在 `index.html` 中，`js/ai-contract/` 模块应在 `js/state/` 之后、`js/core.js` / `js/game.js` 之前加载：

```html
<script src="js/utils.js" defer></script>
<!-- 阶段 1：状态层 -->
<script src="js/state/schema.js" defer></script>
<script src="js/state/state-manager.js" defer></script>
<script src="js/state/mutators/*.js" defer></script>
<script src="js/state/adapters/*.js" defer></script>
<!-- 阶段 2：AI 契约层 -->
<script src="js/ai-contract/schemas/ai-output-schema.js" defer></script>
<script src="js/ai-contract/output-sanitizer.js" defer></script>
<script src="js/ai-contract/response-parser.js" defer></script>
<script src="js/ai-contract/fallback-engine.js" defer></script>
<script src="js/ai-contract/context-manager.js" defer></script>
<script src="js/ai-contract/ai-response-mutator.js" defer></script>
<script src="js/ai-contract/prompt-builder.js" defer></script>
<!-- 原有系统 -->
<script src="js/core.js" defer></script>
<script src="js/game.js" defer></script>
```

## 迁移策略

### 第 1 步：新建模块

创建 `js/ai-contract/` 下所有文件，实现核心 API，保持旧代码不动。

### 第 2 步：替换解析入口

在 `core.js` 中：

- `safeJSONParse` 委托给 `ResponseParser._tryDirectJSON`。
- `parseAIResponse` 委托给 `ResponseParser.parse`。
- `extractStr/extractArr/extractObj/extractObjArr` 保留为兼容函数，但标记为 deprecated。

### 第 3 步：替换 prompt 构建

在 `game.js` 中：

- `buildSystemPrompt` 委托给 `PromptBuilder.buildSystemPrompt`。
- `_buildFormatRules` 迁移为 `PromptBuilder` 内部 format 片段。
- `buildProtagonistPrompt` / `buildRecentChatContext` 迁移为片段函数。

### 第 4 步：替换请求入口

在 `game.js` 中：

- `sendAIRequest` 改为协调流程：调用 `ContextManager.buildMessages` → `FallbackEngine.execute` → `ResponseParser.parse` → `AIResponseMutator.apply` → UI 渲染。
- 状态写入逻辑从 game.js 移除，交给 `AIResponseMutator`。

### 第 5 步：清理旧代码

- 删除 `game.js` 中已迁移到契约层的辅助函数。
- 删除 `core.js` 中重复的解析/兜底逻辑。
- 全局搜索 `gameState.xxx = ` 在 AI 响应处理路径中的使用，替换为 StateManager API。

## 验收标准

阶段 2 完成时，以下场景必须正常运行：

1. 新建游戏，AI 返回标准 JSON 或 `<mem>` 纯文本，剧情正常渲染。
2. AI 返回 JSON 包字符串（`"{...}"`）时，解析成功，无 JSON 泄漏。
3. AI 输出思维链/推理内容时，不显示给玩家，并记录警告。
4. 模型故障时自动切换备用模型；所有模型失败时显示友好错误。
5. 连续进行 10 轮以上游戏，上下文不溢出，不丢失关键剧情。
6. 地点提取不再出现“阳光”“依靠触觉”等非地点文本。
7. `buildSystemPrompt` 不再超过 150 行，prompt 结构清晰。
8. `sendAIRequest` 不超过 100 行，只负责流程协调。
9. 控制台无 `extractStr is not defined` 等明显错误。
10. 单元测试覆盖 ResponseParser 的 5 种解析路径。

## 风险与应对

| 风险 | 可能性 | 应对 |
|------|--------|------|
| 迁移解析逻辑时破坏旧预设兼容性 | 中 | 保留旧解析函数作为 fallback，逐步替换 |
| PromptBuilder 模板过多导致调试困难 | 中 | 每个片段独立文件 + 命名规范 + debug 开关 |
| 上下文压缩质量下降导致剧情断裂 | 中 | 保留最近 3-6 轮完整历史，摘要生成有校验 |
| 模型对契约层格式要求更敏感 | 中 | A/B 测试 format 片段，保留旧格式作为 fallback |
| FallbackEngine 循环切换模型 | 低 | 记录已失败模型，避免同一请求内重复尝试 |

## 后续阶段衔接

阶段 2 完成后：

- 阶段 3（模块拆分）将基于 `AIResponseMutator` 和 `StateManager` 拆出独立的 `StoryEngine`。
- 阶段 4（测试）将基于 `ResponseParser` / `OutputSanitizer` / `PromptBuilder` 编写单元测试。
- 长期演进：可在此层之上接入模型路由、缓存、日志分析等高级功能。
