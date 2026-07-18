# Free-Script Code Wiki

> 本文档为 Free-Script 项目源码级 Wiki，覆盖整体架构、模块职责、关键类与函数、依赖关系与运行方式。
> 所有引用均标注 `文件名:行号`，便于跳转核查。

---

## 目录

- [1. 项目概述](#1-项目概述)
- [2. 整体架构](#2-整体架构)
- [3. 目录结构](#3-目录结构)
- [4. 入口与初始化](#4-入口与初始化)
- [5. 核心层 (core.js)](#5-核心层-corejs)
- [6. 状态管理层 (state/)](#6-状态管理层-state)
- [7. AI 契约层 (ai-contract/)](#7-ai-契约层-ai-contract)
- [8. 记忆系统 (tavern-compat.js)](#8-记忆系统-tavern-compatjs)
- [9. 世界信息系统 (worldinfo.js)](#9-世界信息系统-worldinfojs)
- [10. 系统面板 (systems.js)](#10-系统面板-systemsjs)
- [11. 向量检索 (vector-retriever.js)](#11-向量检索-vector-retrieverjs)
- [12. 模块层 (modules/)](#12-模块层-modules)
- [13. UI 系统](#13-ui-系统)
- [14. 工具与基础设施](#14-工具与基础设施)
- [15. 游戏主循环 (game.js)](#15-游戏主循环-gamejs)
- [16. PWA 与 Service Worker](#16-pwa-与-service-worker)
- [17. 部署流程](#17-部署流程)
- [18. 关键数据流](#18-关键数据流)
- [19. 关键概念对照表](#19-关键概念对照表)

---

## 1. 项目概述

### 1.1 项目定位

**Free-Script（自由剧本）** 是一个**纯前端 AI 文字冒险 / 互动小说游戏**。玩家输入世界观设定后，由 AI 逐回合生成剧情、选项、角色、物品、任务，玩家通过选择或自定义行动推进故事，单局可达上百回合、几十万字。

### 1.2 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | 无框架，纯 HTML + CSS + 原生 JavaScript |
| 部署 | GitHub Pages (`https://yanyuan1234.github.io/free-script/`) |
| 数据存储 | `localStorage` + `IndexedDB`（SaveDB） |
| AI 接入 | OpenAI 兼容 API（支持自定义端点 + 流式 SSE） |
| PWA | `manifest.json` + `sw.js`（离线运行 / 添加到主屏） |
| 向量检索 | `transformers.js` + `Xenova/all-MiniLM-L6-v2`（浏览器内运行） |
| Web Worker | `stream-worker.js` 隔离 SSE 解析 |
| 兼容生态 | SillyTavern / 酒馆助手（Preset / Regex / STScript / 角色卡） |

### 1.3 参考产品

SillyTavern、MiniTavern、NativeTavern、Light Tavern、RisuAI、Mufy

---

## 2. 整体架构

### 2.1 分层架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      index.html (入口)                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  初始化层 (init.js)                                          │
│  - StateManager.init / GameMemoryAdapter.bind               │
│  - PresetManager / RegexManager / MacroEngine               │
│  - SaveDB.init / 崩溃恢复 / APP_READY 事件                   │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────────┐    ┌──────────────┐
│  UI 层        │    │  游戏主循环        │    │  PWA 层       │
│              │    │                  │    │              │
│ phone-ui.js  │◄──►│ game.js          │◄──►│ sw.js        │
│ swipe-mgr    │    │ sendAIRequest    │    │ sw-register  │
│ systems.js   │    │ renderStory      │    │ manifest.json│
└──────┬───────┘    └────────┬─────────┘    └──────────────┘
       │                     │
       │                     ▼
       │            ┌──────────────────┐
       │            │  AI 契约层         │
       │            │ ai-contract/      │
       │            │ - PromptBuilder   │
       │            │ - ResponseParser  │
       │            │ - OutputSanitizer │
       │            │ - AIResponseMutator│
       │            │ - StateTagParser  │
       │            │ - STScriptBridge  │
       │            └────────┬─────────┘
       │                     │
       ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│  状态管理层 (state/)                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐    │
│  │ StateManager│  │ StateSchema │  │ 8 个 Mutators    │    │
│  │ (单例)      │  │ (数据模型)  │  │ bag/quest/char/  │    │
│  │             │  │             │  │ time/currency/   │    │
│  │ read/write  │  │ normalize   │  │ relationship/    │    │
│  │ subscribe   │  │ validate    │  │ location/undo    │    │
│  │ transaction │  │             │  │                  │    │
│  └──────┬──────┘  └─────────────┘  └──────────────────┘    │
│         │                                                   │
│         │  GameMemoryAdapter                                │
│         ▼  (双向 MERGE 同步)                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  记忆系统 (tavern-compat.js - EnhancedMemory / GameMemory)    │
│  - 三层摘要系统 (near/mid/far)                                │
│  - 三层数据架构 (Active/Linked/Dormant)                       │
│  - 永久事实区 (6 分类)                                        │
│  - buildSmartInjection (10 层 priority 注入)                  │
│  - MemoryManagerUI (12 Tab 编辑面板)                          │
│  - SillyTavern 兼容层 + STscriptEngine                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  外部依赖                                                    │
│  - 流式 AI API (OpenAI 兼容) - stream-worker.js              │
│  - 向量模型 (transformers.js CDN) - vector-retriever.js      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 关键架构原则

1. **StateManager 是单一事实来源**：所有状态读写统一经过 `StateManager`，`gameState.*` 旧字段通过 `_syncLegacyMirror` 自动维护镜像。
2. **AI 契约优先**：AI 输出必须满足明确 schema，前端不再做无限制猜测。
3. **防御性解析**：ResponseParser 提供 6 层兜底解析。
4. **best-effort 容错**：AI 响应应用 15 步中仅核心步骤失败才回滚，其他步骤失败只 warn 跳过。
5. **变化驱动注入**：EnhancedMemory 用快照对比检测变化，无变化零 Token 注入（Horae 风格）。
6. **Worker 隔离**：SSE 解析放在 Web Worker 中避免阻塞主线程。

---

## 3. 目录结构

```
/workspace/
├── index.html              # 入口页面（10 个 .page 区块 + 42 个 JS 引用）
├── manifest.json           # PWA 配置
├── sw.js                   # Service Worker（缓存策略）
├── favicon.svg             # 图标
│
├── css/                    # 样式文件（5 个，按职责拆分）
│   ├── base.css            # 基础变量 + reset + 通用组件
│   ├── menu.css            # 主菜单页（手机桌面风）
│   ├── pages.css           # 故事/玩家/NPC/回顾/结局等页面
│   ├── phone-ui.css        # 仿微信/微博手机模拟器 UI
│   └── systems.css         # 任务/成就/世界书/预设/正则/记忆面板
│
├── js/
│   ├── init.js             # 初始化入口
│   ├── core.js             # 核心逻辑（6250+ 行，13 职责域）
│   ├── game.js             # 游戏主循环（~3900 行）
│   ├── phone-ui.js         # 手机 UI 渲染（~7200 行）
│   ├── systems.js          # 任务/成就/关系系统
│   ├── tavern-compat.js    # 记忆系统 + 兼容层 + STscript（~7000 行）
│   ├── worldinfo.js        # 世界书系统
│   ├── vector-retriever.js # 向量语义检索
│   ├── stream-bridge.js    # Worker 桥接层
│   ├── stream-worker.js    # Worker 内 SSE 解析
│   ├── swipe-manager.js    # 多分支重生成管理
│   ├── tokenizer.js        # Token 估算器（模型自适应）
│   ├── utils.js            # 通用工具集（1122 行）
│   ├── character-card-exporter.js  # 角色卡导出
│   ├── version-badge.js    # 版本徽章
│   ├── sw-register.js      # SW 注册
│   │
│   ├── state/              # 状态管理层
│   │   ├── schema.js              # StateSchema（数据模型）
│   │   ├── state-manager.js       # StateManager 单例
│   │   ├── adapters/
│   │   │   └── game-memory-adapter.js  # GameMemory 双向同步
│   │   └── mutators/
│   │       ├── bag-mutator.js
│   │       ├── character-mutator.js
│   │       ├── currency-mutator.js
│   │       ├── location-mutator.js
│   │       ├── quest-mutator.js
│   │       ├── relationship-mutator.js
│   │       ├── time-mutator.js
│   │       └── undo-mutator.js
│   │
│   ├── ai-contract/        # AI 契约层（阶段 2 重构）
│   │   ├── prompt-builder.js
│   │   ├── response-parser.js
│   │   ├── output-sanitizer.js
│   │   ├── state-tag-parser.js
│   │   ├── ai-response-mutator.js
│   │   ├── stscript-bridge.js
│   │   └── schemas/
│   │       ├── ai-output-schema.js
│   │       └── ai-output-json-schema.js
│   │
│   └── modules/            # 模块层
│       ├── built-in-presets.js    # 4 套内置预设
│       ├── preset-manager.js      # 预设管理器（2208 行）
│       ├── regex-manager.js       # 正则脚本管理（含 ReDoS 防护）
│       ├── macro-engine.js        # 宏展开引擎（SillyTavern 兼容）
│       └── smart-config-engine.js # 智能配置提取
│
├── docs/                   # 文档目录（设计 spec、审查报告、路线图）
│   ├── superpowers/        # 阶段性设计与计划
│   └── *.md                # 各类审查与对比报告
│
├── tests/                  # 单元测试
│   └── ai-contract/        # AI 契约层测试
│
├── test_output/            # 集成测试输出
├── backup/                 # 备份
└── .github/workflows/      # CI/CD
    └── deploy.yml
```

---

## 4. 入口与初始化

### 4.1 index.html 结构

**位置**：`/workspace/index.html`

- `<head>` 内 5 个 CSS：`base.css` → `menu.css` → `pages.css` → `phone-ui.css` → `systems.css` (`index.html:40-44`)
- `<body>` 末尾 40+ 个 `<script defer>`，按依赖链加载 (`index.html:2862-2903`)
- CSP 头 (`index.html:34`)：`script-src 'self' 'unsafe-eval' blob:`（`'unsafe-eval'` 仅为预设脚本沙箱所需）

### 4.2 10 个主页面 (.page)

| # | id | 用途 |
|---|----|------|
| 1 | `menuPage` | 主菜单（头像/箴言/预设/开始） |
| 2 | `worldSetupPage` | 创造世界（预设/世界观/玩家信息） |
| 3 | `loadingPage` | AI 创造中 |
| 4 | `storyPage` | 主游戏页（剧情/选项/控制条） |
| 5 | `playerPage` | 玩家面板 |
| 6 | `npcPage` | NPC 列表 |
| 7 | `recapPage` | 剧情回顾 |
| 8 | `logPage` | 冒险日志（12 个手机风子功能：聊天/论坛/排行/物品/任务/商店/朋友圈/成就/日记/邮箱/日程/作话） |
| 9 | `endingPage` | 结局页 |
| 10 | `memoryPage` | 记忆管理（12 Tab：总览/永久事实/近期/约定/时间线/角色/物品/地点/事件/世界/搜索/注入预览） |

### 4.3 init.js 初始化流程

**位置**：`/workspace/js/init.js`

**进入点** (`init.js:265-269`)：根据 `document.readyState` 选择 `DOMContentLoaded` 触发或立即调用 `initApp()`。

**`initApp()` 核心步骤** (`init.js:73-187`)：

| 步骤 | 行号 | 内容 |
|------|------|------|
| 防重入 | 76-77 | `initApp._initialized` 标志 |
| StateManager | 79-81 | `StateManager.init(gameState)` 接管全局状态 |
| GameMemoryAdapter | 83-85 | `GameMemoryAdapter.bind()` 绑定订阅 |
| ThemeManager | 87 | 主题初始化 |
| WorldInfo | 89 | 世界书系统初始化 |
| PresetManager/RegexManager/MacroEngine | 91-95 | 三模块初始化 |
| TavernHelperCompat | 100-102 | 酒馆助手兼容层 |
| SaveDB | 104-105 | `await SaveDB.init()` + `migrate()` |
| 崩溃恢复 | 110-131 | 检查 `AUTO_SAVE_BACKUP`，新于 slot 0 弹窗询问 |
| 渲染/事件 | 140-143 | `renderMenu()` + `bindEvents()` |
| APP_READY | 159-163 | `TavernHelperCompat.emit('APP_READY')` |
| 隐藏 loading | 169-173 | `#appLoading` 400ms 后移除 |
| 可访问性 | 176 | `enhanceAccessibility()`（button type / aria-label / SVG aria-hidden） |

**`ensureGameStatePaths()`** (`init.js:32-71`)：确保 `gameState` 上的核心字段与下划线私有字段存在。

### 4.4 全局错误兜底

`init.js:8-25`：`window.error` / `unhandledrejection` 通过 `GlobalCleanup.registerListener` 注册，错误转 `UI.toast`。

---

## 5. 核心层 (core.js)

**位置**：`/workspace/js/core.js`（6250+ 行，13 个职责域）

| # | 职责 | 行号 | 关键符号 |
|---|------|------|----------|
| 1 | 数据同步 | L42-371 | `_safeGameState` `_safeGM` `_mirrorToState` `_syncTable` `_syncItemsToBag` `_syncQuestsToGameState` `_syncRelationshipsToGameState` `_ensureDataLinkage` |
| 2 | UI 弹窗/导航/模态 | L386-907 | `UI` 对象（toast / confirm / modal） |
| 3 | API Key 混淆 | L912-967 | `_obfuscateKey` `_deobfuscateKey` `_obfuscateConfigs` `_deobfuscateConfigs` |
| 4 | API 配置与重试 | L967-1407 | `LocalGameAPI`（init / 配置 / 重试） |
| 5 | IndexedDB 存档 | L1411-1810 | `SaveDB`（init / migrate / get / put） |
| 6 | 题材库 | L1815-1994 | `THEME_LIBRARY` |
| 7 | 全局状态工厂 | L1999-2265 | `GAME_VERSION='1.2.0'` `createDefaultGameState` `gameState` `RuntimeState` `resetRuntimeState` |
| 8 | 打字机 | L2277-2591 | `TypewriterBuffer` |
| 9 | 时间系统 | L2626-2760 | `GameTimeSystem` |
| 10 | JSON 解析 + 小剧场映射 | L2764-4085 | `parseJSONHelper` `extractStr` `extractArr` `extractObjArr` `_applyMemsToGameState` **`parseAIResponse` (L3120)** `_THEATER_SCHEMAS` `parseForumContent` `parseChatContent` 等 |
| 11 | 错误翻译 / HTML 净化 | L4091-4440 | `translateError` `escapeHtml` `escapeAttr` `SANITIZE_WHITELIST` `_isSafeUrl` |
| 12 | AI 请求 | L4902-5437 | `callAI` `executeAIStream`（Worker 降级路径） |
| 13 | 模型上下文检测 | L5701-5920 | `_KNOWN_MODEL_CONTEXT` |

### 5.1 关键类与对象

#### `LocalGameAPI` (L967-1407)

AI API 调用与配置管理。

- `init()`：初始化 API 配置（加载 `localStorage.API_PRESETS`）
- `getCurrentConfig()`：返回当前激活的 API 配置（URL / Key / Model）
- `buildRequestBody(messages, options)`：构造 OpenAI 兼容请求体（支持 `response_format` strict）
- 重试机制：429 自动切换备用模型 / 指数退避

#### `SaveDB` (L1411-1810)

IndexedDB 封装，多槽位存档。

- `init()` / `migrate()`：建库 + 旧版迁移
- `get(slot)` / `put(slot, data)` / `delete(slot)`：CRUD
- `listSlots()`：列出所有存档槽元信息
- 自动保存：每回合后台写 `AUTO_SAVE_BACKUP`

#### `TypewriterBuffer` (L2277-2591)

打字机渲染缓冲。

- `push(text)`：分片推送
- `flush(callback)`：节流输出（默认 16ms/字符，CJK 32ms）
- `cancel()`：取消并清空

#### `parseAIResponse` (L3120)

**Legacy JSON 解析主入口**，已被 `ResponseParser.parse` 取代但仍保留兜底。

```javascript
function parseAIResponse(reply) {
    // 1. 调用 ResponseParser.parse 获取 {success, data, storyText}
    // 2. 失败时回退到 _applyMemsToGameState（纯文本 <mem> 标签解析）
    // 3. 调用 extractCharaData / _bridgeStatusToCharacters 等 legacy 提取器
    // 4. 返回 {story, title, choices, ...}
}
```

### 5.2 架构升级说明

`core.js:26-44`：流式解析已迁移到 `stream-worker.js` + `stream-bridge.js`，主线程只接收节流后的 CHUNK；core.js → game.js 的调用统一走 `RuntimeBridge`（game.js 末尾注册）。

---

## 6. 状态管理层 (state/)

### 6.1 StateSchema - 数据模型

**位置**：`/workspace/js/state/schema.js`（374 行）

状态版本：`'1.0.0-state-layer'` (`schema.js:6`)

#### 状态根对象 6 大域 (`schema.js:12-119`)

| 域 | 字段 | 行号 | 说明 |
|----|------|------|------|
| **meta** | `version` / `createdAt` / `updatedAt` | 14-18 | 元数据 |
| **world** (只读) | `userPrompt` / `setupText` / `theme` / `genre` / `pureTextMode` / `generateChoices` / `maxTokens` / `contextSize` / `temperature` | 19-29 | 世界设定，`isReadOnly()` 强制只读 |
| **progress** | `turn` / `sceneTitle` / `lastSceneTitle` / `rollingSummary` / `conversationHistory` / `preAIState` / `swipes` | 30-44 | 游戏进程；`swipes={versions,current,turn}` |
| **entities** | `player` / `characters` / `bag` / `quests` / `locations` / `events` / `currency` / `currencyName` / `relationships` | 45-64 | 核心游戏实体 |
| **time** | `date` / `time` / `period` | 65-69 | 游戏时间 |
| **ui** | `currentPage` / `lastChoices` / `lastHUD` / `worldModules` / `undoHistory` / `maxUndoHistory` / `lastInputTokens` 等 | 70-91 | UI 状态含撤销栈 |
| **settings** | `fontSize` / `autoCompress` / `useStream` / `writingStyle` / `pinnedModules` / `cotMode` / `presetArchetype` / `wordCountConfig` 等 | 95-118 | 全局设置 |

#### 关键防御设计

- `_DANGEROUS_KEYS`：`__proto__` / `constructor` / `prototype` 黑名单（防原型污染，`schema.js:9`）
- `_legacyToPath`：48 个旧字段→新路径映射（`schema.js:123-183`），如 `currentBag → entities.bag`
- `normalizeState(state)`：旧存档迁移入口（`schema.js:227-310`），处理 money/coins 迁移、Swipe 格式转换、`_stats.totalTurns → progress.turn` 映射
- `validatePath(path)`：正则校验 + 逐段危险键检查（`schema.js:214-224`）

### 6.2 StateManager - 读写入口

**位置**：`/workspace/js/state/state-manager.js`（315 行，单例对象）

#### 核心 API

| 类别 | 方法 | 行号 | 说明 |
|------|------|------|------|
| 初始化 | `init(state)` | 18-32 | 接管 `gameState`，调 `normalizeState` |
| 初始化 | `attachState(state)` | 41-57 | 重新接管，不 normalize，不清监听器 |
| 读取 | `snapshot()` | 60-62 | 完整状态深拷贝 |
| 读取 | `get(path)` | 65-69 | 点分路径读取，返回深拷贝 |
| 读取 | `peek(path)` | 74-77 | 内部用，**不深拷贝**（性能优化） |
| 读取 | `getLegacy(name)` | 80-83 | 旧字段名读取，经 `getPath()` 翻译 |
| 写入 | `set(path, value, options)` | 86-116 | `validatePath` + `isReadOnly` 拦截 + `_syncLegacyMirror` 同步旧字段 |
| 写入 | `setLegacy(name, value, options)` | 119-122 | 旧字段名写入 |
| 订阅 | `subscribe(pattern, callback) → token` | 126-135 | 支持 `entities.bag` / `entities.*` / `entities.**` / `**` |
| 订阅 | `unsubscribe(token)` | 138-146 | 按 token 移除 |
| 事务 | `transaction(fn) → result` | 150-182 | 批量提交 + 异常回滚 |

#### `_syncLegacyMirror(path, value)` (L196-232)

新旧代码共存的关键桥梁，3 处特殊转换：

- `entities.characters`（数组）↔ `allCharacters`（对象，按 name 键化）
- `progress.turn` ↔ `_stats.totalTurns`
- `entities.events`（对象数组）↔ `keyEvents`（字符串数组）

#### 事务机制 (L150-182)

1. 嵌套事务直接执行（由最外层保证回滚）
2. 保存 `_transactionBackup = snapshot()`
3. 执行 `fn()`，所有 `set` push 到 `_pendingChanges`
4. 成功统一 `_notify(changes)`
5. 异常真正回滚：`this._state = this._transactionBackup`，重建 `window.gameState` 引用

### 6.3 Mutators - 状态变更器

#### BagMutator (`bag-mutator.js`, 144 行)

处理 `entities.bag` 背包变更。

| 方法 | 行号 | 职责 |
|------|------|------|
| `setItems(items, options)` | 6-12 | 标准化后整体写入 |
| `mergeItems(items, options)` | 17-72 | 合并物品（精确匹配 + 模糊匹配），合并白名单 11 字段 |
| `addItem(item, options)` | 87-99 | 单个添加，同名累加 count |
| `normalizeItem(raw)` | 105-143 | 标准化为 14 字段（id/name/count/unit/rarity/desc/usable/effect/equippable/equipped/slot + GameMemory 运行时字段） |

#### CharacterMutator (`character-mutator.js`, 278 行)

处理 `entities.characters` NPC 变更。

| 方法 | 行号 | 职责 |
|------|------|------|
| `filterOutPlayer(chars)` | 8-25 | 过滤主角（防 AI 误加主角） |
| `mergeCharacters(characters, options)` | 39-83 | 三层匹配：精确 → 模糊 → 新增 |
| `updateRelationship(name, delta, options)` | 122-129 | 增量更新好感度 |
| `replaceCharacter(name, newChar, options)` | 146-170 | 重命名场景，保留累积字段 |
| `normalizeCharacter(raw)` | 192-251 | 标准化 22 字段，含 **Mufy 风格扩展**（identity/identitySurface/identityHidden/appearance/personality/background/speechHabits/sampleDialogues/emotionalTriggers/attitudeToUser） |

#### CurrencyMutator (`currency-mutator.js`, 61 行)

处理 `entities.currency` / `entities.currencyName`。

| 方法 | 行号 | 职责 |
|------|------|------|
| `get()` / `getName()` | 12-21 | 读取（默认 `'金币'`） |
| `set(amount, options)` | 24-31 | 强制非负整数 |
| `add(amount, options)` | 34-42 | 加钱，必须为正 |
| `spend(amount, options) → bool` | 46-58 | 扣钱，余额不足返回 false 不修改 |

#### LocationMutator (`location-mutator.js`, 85 行)

处理 `entities.locations`。

- `_STOP_WORDS`：阳光/依靠触觉/空气/风/雨等停用词
- `mergeLocations` / `addLocation` / `removeLocation` / `getLocation`
- `normalizeLocation`：标准化 8 字段

#### QuestMutator (`quest-mutator.js`, 307 行)

**最复杂的 Mutator**，处理 `entities.quests`。

| 方法 | 行号 | 职责 |
|------|------|------|
| `setQuests(quests, options)` | 38-47 | **智能合并**（非直接覆盖） |
| `_smartMerge(existing, incoming)` | 51-87 | 保留已完成/失败状态防 AI 回退；已完成/失败任务最多保留 3 条 |
| `autoAdvanceByStory(storyText, options)` | 152-207 | **基于剧情文本自动完成任务**：标题关键词 + 完成类动词必须在 50 字符窗口内 |
| `resolveQuest(title, status, options)` | 124-141 | 按标题查找并标记状态 |
| `normalizeQuest(raw)` | 229-259 | 标准化 13 字段 |

#### RelationshipMutator (`relationship-mutator.js`, 59 行)

处理 `entities.relationships`。

- `mergeRelationships(newRels, options)`：A→B 与 B→A 算同一对，多维 dimensions 合并保留旧维度，**上限 10 条**

#### TimeMutator (`time-mutator.js`, 104 行)

处理 `time`。

- `setTime(time, options)`：**时间单调性校验**，默认拒绝回退
- 支持 `skipMonotonicCheck`（初始化）和 `allowBackward`（穿越/回忆剧情）
- `_isEarlier(a, b)`：三层比较 date → time → period

#### UndoMutator (`undo-mutator.js`, 122 行)

处理 `ui.undoHistory` 撤销栈。

| 方法 | 行号 | 职责 |
|------|------|------|
| `pushSnapshot(snap)` | 22-44 | 在 AI 回复前调用，捕获 11 字段深拷贝 |
| `popSnapshot()` | 47-53 | 返回最后一条快照 |
| `restoreFromSnapshot(snap)` | 63-120 | **委托各 Mutator 写入**，不直写 gameState |

### 6.4 GameMemoryAdapter - 双向同步

**位置**：`/workspace/js/state/adapters/game-memory-adapter.js`（375 行）

**核心策略**：MERGE 语义而非 REPLACE——按 name 走查 StateManager 数据，已存在条目只更新实体字段，保留 GameMemory 运行时字段（`dormantSince`/`accessCount`/`history`/`locked`/`obtainedTurn`）。

#### 正向同步：StateManager → GameMemory (`syncToGameMemory`, L42-229)

| 实体表 | StateManager 字段 | GameMemory 字段映射 |
|--------|-------------------|---------------------|
| `tables.items` | `entities.bag` | 11 字段映射 |
| `tables.characters` | `entities.characters` | 24 字段映射（含 Mufy 扩展） |
| `tables.locations` | `entities.locations` | 4 字段映射 |
| `quests`（数组） | `entities.quests` | 按 title 去重 |
| `events`（数组） | `entities.events` | 按 content 去重 |

#### 反向同步：GameMemory → StateManager (`syncFromGameMemory(tableName)`, L272-374)

| tableName | 调用 Mutator |
|-----------|--------------|
| `'items'` | `BagMutator.setItems` |
| `'quests'` | `QuestMutator.setQuests` |
| `'relationships'` | `RelationshipMutator.mergeRelationships` |
| `'characters'` | `CharacterMutator.setCharacters` |
| `'locations'` | `LocationMutator.setLocations` |

---

## 7. AI 契约层 (ai-contract/)

**位置**：`/workspace/js/ai-contract/`

阶段 2 重构产物，目标是把 AI 交互改造成**可预测、可维护、可测试的契约层**。

### 7.1 整体数据流

```
PromptBuilder 组装 prompt → AI 返回 → ResponseParser 多层解析
       ↓                                            ↓
STScriptBridge 桥接             OutputSanitizer 清洗
                                              ↓
                                  AIResponseMutator 写入 StateManager
```

### 7.2 PromptBuilder

**位置**：`prompt-builder.js`（249 行）

采用**片段注册 + 按序拼接**模式。

```javascript
const PromptBuilder = {
    _sections: {},          // 已注册片段
    _mode: 'json',          // 模式：json / pureText / preset
    registerSection(name, templateFn, options) { ... },
    setMode(mode) { ... },
    buildSystemPrompt(context) { ... }  // 按 order 升序拼接
};
```

#### 注入片段顺序（按 order 升序，`prompt-builder.js:51-242`）

| order | 片段名 | 职责 |
|-------|--------|------|
| 10 | `identity` | 身份与最高规则（JSON/纯文本模式声明） |
| 20 | `world` | 世界设定（包裹 `<<<USER_DATA_START>>>` 防指令注入） |
| 25 | `terms` | 术语表 |
| 28 | `preference` | 玩家偏好（字数/视角/代词/演绎/节奏/文风） |
| 30 | `protagonist` | 主角设定 + 优先级冲突说明（核心设定 > 世界描述 > 此处） |
| 40 | `state` | 当前状态注入（memoryText + chatContextText，`<<<MEMORY_DATA_START>>>` 分隔） |
| 50 | `narrative` | 叙事增强 |
| 60 | `workflow` | 工作方式（引导玩家输入、token 预算） |
| 70 | `format` | 输出格式（JSON Schema 或纯文本 `<state>` 块） |
| 71 | `formatAnchor` | 格式锚点 |
| 72 | `memoryContract` | 记忆维护契约（`memoryUpdates` 三维度范式） |
| 90 | `gametime` | 当前游戏时间 |

### 7.3 AI 输出 Schema

#### 两套并存的 Schema

| 文件 | 用途 | 调用方 |
|------|------|--------|
| `schemas/ai-output-schema.js` | 代码层 normalize/validate | ResponseParser / AIResponseMutator |
| `schemas/ai-output-json-schema.js` | 标准 JSON Schema draft-07，传 API 做 strict 约束 | 调用 AI 时作为 `response_format` |

#### 字段结构（`getDefaultOutput`, `ai-output-schema.js:17-42`）

```javascript
{
    story: '',           // 叙事正文（必须）
    title: '',           // 章节标题
    choices: [],         // 玩家选项 [{id, text}]
    player: { name, identity, stats },  // 主角
    characters: [],      // NPC 列表
    bag: [],             // 背包
    currency: 0,
    currencyName: '金币',
    quests: [],          // 任务
    gameTime: { date, time, period },
    locations: [],       // 地点
    keyEvents: [],       // 关键事件
    relationships: [],   // 关系网
    world: [],           // 世界模块（text/list/ranking/cards/comments/moments/mail/shop/diary/chat/forum）
    npcMessages: [],     // NPC 即时闲聊
    contextSummary: '',  // 本回合剧情摘要
    hud: {},             // HUD 数据
    memoryUpdates: []    // AI 主动维护记忆
}
```

#### 字段别名（`ai-output-schema.js:7-15`）

```javascript
STORY_ALIASES: ['story', 'storyText', 'content', 'text', 'narrative']
TITLE_ALIASES: ['title', 'scene', 'sceneTitle', 'chapterTitle']
MEMORY_CATEGORIES: ['pcIdentity', 'settings', 'worldRules', 'npcProfiles', 'promises', 'worldPlaces']
MEMORY_OPS: ['add', 'replace', 'delete']
```

#### 模型支持检测（`ai-output-json-schema.js:284-307`）

- `isStrictSupported(model)`：白名单 DeepSeek/GPT-4o/Qwen；Claude/GLM 保守返回 false
- `isJsonObjectSupported(model)`：黑名单老模型

### 7.4 ResponseParser - 6 层兜底解析

**位置**：`response-parser.js`（739 行）

| Level | 名称 | 触发条件 | 方法 |
|-------|------|----------|------|
| 前置 | 思维链剥离 | 任何回复 | `_stripThinkingTokens` (L154-246) |
| -1 | `<json>` 标签 | 酒馆助手 TokenSender / 国产模型 | 正则 `/<json>([\s\S]*?)<\/json>/i` |
| 0 | 直接 JSON | 整段以 `{` 开头 | `_tryDirectJSON` (L248-273) |
| 1 | 代码块 JSON | ` ```json ` / ` ``` ` / ` ```js ` | `_tryCodeBlockJSON` (L275-281) |
| 2 | 清理后 + 状态机 | sanitizeJSON 后重试 + 括号匹配 | `_tryRobustJSON` (L283-346) |
| 3 | `<mem>` 标签 | 纯文本模式 | `_tryMemTags` (L508-537) |
| 3.5 | `<state>` 块 | 纯文本模式主推 | `StateTagParser.parse` |
| 4 | 纯文本兜底 | 全部失败 | `_tryPlainText` (L539-576) |

#### 返回结构 (`response-parser.js:8-16`)

```javascript
{
    success: boolean,
    data: AIOutputSchema,
    storyText: string,
    mems: [],              // <mem> 标签解析结果
    warnings: [],
    truncated: boolean,
    fallbackLevel: number  // -1/0/1/2/3/3.5/4
}
```

#### 关键防御性技术

- **思维链剥离**：调 `OutputSanitizer.stripThinking`，处理"未匹配开标签"
- **截断修复** (`_repairTruncatedJSON`, L409-506)：3 策略递进——补全引号/闭合符 → 转义裸控制字符 → 回退到最后逗号
- **逐字段状态机抢救** (`_extractFieldsFromRaw`, L350-404)：整体 parse 失败时用 `extractStr`/`extractArr`/`extractObjArr` 逐字段提取

### 7.5 StateTagParser - 纯文本模式核心

**位置**：`state-tag-parser.js`（174 行）

方案 C 核心组件：从 AI 输出的故事末尾 `<state>...</state>` 块提取结构化数据，**不依赖 response_format，所有模型都能输出**。

#### 解析的 7 种子标签

| 标签 | 字段格式 | 解析结果 |
|------|----------|----------|
| `<char>` | `角色名\|关系/称谓\|心情\|当前位置` | `characters[]` |
| `<item>` | `物品名\|数量\|单位\|稀有度\|描述` | `bag[]` |
| `<quest>` | `任务名\|状态` | `quests[]` |
| `<time>` | `天数\|时段` | `gameTime` |
| `<choice>` | `选项文本` | `choices[]` |
| `<title>` | `场景标题` | `title` |
| `<rel>` | `角色A\|角色B\|关系类型` | `relationships[]` |

`data._isStateTag = true` 标记数据来源。

### 7.6 OutputSanitizer - 输出清洗

**位置**：`output-sanitizer.js`（145 行）

#### 12 个思维链标签（`THINKING_TAGS`, L8-13）

```javascript
['think', 'thinking', 'reasoning', 'thought', 'analysis', 'ECoT',
 'cot', 'chain_of_thought', 'final', 'inner_thoughts', 'reflection',
 'assistantfinal']
```

#### 主要函数

| 函数 | 行号 | 职责 |
|------|------|------|
| `stripThinking(text)` | 98-110 | 剥离 12 个思维链标签 + `💭...💭` emoji 包围 |
| `stripBareThinking(text)` | 58-85 | 检测 19 个元话语模式，至少 2 段匹配才剥离 |
| `stripHTMLAndCursors(text)` | 112-119 | `<br>` → `\n`，删 HTML 标签 + `▌` `⎸` 光标 |
| `stripJSONArtifacts(text)` | 121-142 | 移除 story 字段误嵌的 JSON 片段 |
| `sanitizeStory(text)` | 42-54 | 完整流程：stripThinking → stripHTMLAndCursors → stripBareThinking → stripJSONArtifacts → 控制字符清理 |
| `sanitizeJSON(raw)` | 87-96 | 剥离代码块包裹，保留第一个 `{` 或 `[` |

### 7.7 AIResponseMutator - 状态应用

**位置**：`ai-response-mutator.js`（822 行）

#### `apply(parsed, options)` (L66-105)

```javascript
apply(parsed, options) {
    // 1. 过滤未知字段（18 个 _KNOWN_FIELDS 白名单）
    // 2. 启动 StateManager.transaction
    // 3. 调用 _applyAll 执行所有步骤
    // 4. 失败时返回 { success: false, error }
}
```

#### 15 个应用步骤（`_applyAll`, L116-176，best-effort 语义）

| 步骤 | 方法 | 委托 Mutator | critical |
|------|------|--------------|----------|
| 1 | `_applyStoryAndTitle` | `StateManager.set('progress.sceneTitle')` | ✓ |
| 2 | `_applyTurn` | `StateManager.setLegacy('_stats.totalTurns')` | |
| 3 | `_applyPlayer` | `StateManager.set('entities.player')` | |
| 4 | `_applyCharacters` | `CharacterMutator.mergeCharacters` | |
| 5 | `_applyBag` | `BagMutator.mergeItems` | |
| 6 | `_applyCurrency` | `CurrencyMutator.set` | |
| 7 | `_applyQuests` | `QuestMutator.setQuests` + `autoAdvanceByStory` | |
| 8 | `_applyLocations` | `LocationMutator.mergeLocations` | |
| 9 | `_applyKeyEvents` | `GameMemory.addImportantEvents` | |
| 10 | `_applyRelationships` | `RelationshipMutator.mergeRelationships` | |
| 11 | `_applyHUD` | `StateManager.set('ui.lastHUD')` | |
| 12 | `_applyContextSummary` | `StateManager.set('progress.rollingSummary')` | |
| 13 | `_applyPermanentFacts` | `EnhancedMemory.upsertPermanentFact` | |
| 14 | `_applyMemoryUpdates` | `EnhancedMemory` API（add/replace/delete） | |
| 15 | `_applyMems` | `_applyMemsToGameState`（纯文本 `<mem>` 标签） | |

#### best-effort 语义 (L107-115)

- 单步 mutator 失败只 `console.warn` + 跳过，**不冒泡触发 transaction 回滚**
- 仅 `storyAndTitle`（critical 步骤）失败时才整体返回 `success:false`
- 原因：原 all-or-nothing 设计在单点失败时会全量回滚已成功写入的数据

#### 数据持久化校验 (`_validatePersistence`, L191-216)

5 项检查（仅警告不强制修复）：

| minTurn | 检查项 |
|---------|--------|
| 1 | 主角 identity 非空 |
| 1 | 主角 stats 非空 |
| 2 | characters 列表非空 |
| 2 | currency 或 bag 至少有一项 |
| 2 | quests 列表非空 |

#### 主角名保护 (`_applyPlayer`, L249-329)

- 已有主角名时禁止 AI 覆盖
- **物品名污染检测**：检测 AI 是否把 bag 物品名误填到 `player.name`（如"写有线索的便条"）

#### 永久事实区收割 (`_applyPermanentFacts`, L459-532)

- 地名 → `permanentFacts.worldPlaces`（合并语义）
- 角色 → `permanentFacts.npcProfiles`（合并语义）
- 主角身份 → `permanentFacts.pcIdentity`（替换语义）

### 7.8 STScriptBridge - 酒馆生态桥接

**位置**：`stscript-bridge.js`（213 行）

**注意**：本文件是 BRIDGE（数据流桥接），不是 slash command 注册器。真正的 slash 命令引擎在 `tavern-compat.js`（39 个内置命令）。

#### 注册的 4 个 Hook

| Hook | 目标函数 | 作用 |
|------|----------|------|
| 1 | `PresetManager.loadPreset` | 同步角色信息和玩家名到上下文 |
| 3 | `injectPresetGlobalVars` | 增强预设全局变量注入，缓存 key 避免重复 |
| 6a | `RegexManager.applyToOutput` | 调用 `gameAdapter.processResponse` 支持"月读/蛾摩拉"正则 |
| 6b | `RegexManager.applyToInput` | 调用 `gameAdapter.processUserInput` |

#### 依赖等待机制 (L23-105)

3 个独立依赖（`PresetManager` / `injectPresetGlobalVars` / `RegexManager`）的串行重试，各 5 次。引入 `CustomEvent 'fsPresetDepsReady'`，外部可主动 dispatch 触发。

---

## 8. 记忆系统 (tavern-compat.js)

**位置**：`/workspace/js/tavern-compat.js`（~7000 行，368KB）

文件总体结构：

| 行号区间 | 模块 |
|---------|------|
| 1–22 | 永久事实区新旧 key 映射常量 |
| 24–937 | `TavernHelperCompat` + `window.SillyTavern` 兼容层 |
| 944–4618 | `var GameMemory = {...}`（核心记忆系统） |
| 4779–5966 | `var MemoryManagerUI = {...}`（编辑面板 UI） |
| 5995–end | `STscriptEngine` 类等 |

**重要别名**：`window.EnhancedMemory = GameMemory`（行 4618）。规则文档中的 `EnhancedMemory` 即 `GameMemory` 对象。

### 8.1 EnhancedMemory 数据结构

#### 永久事实区（6 分类，`permanentFacts`，行 1517）

```javascript
permanentFacts: {
    pcIdentity: [],      // 主角身份（容量 5）
    worldRules: [],      // 世界规则（容量 20）
    settings: [],        // 世界设定（容量 20）
    npcProfiles: [],     // 关键角色档案（容量 30）
    promises: [],        // 玩家承诺（容量 20）
    worldPlaces: []      // 关键地点（容量 20）
}
```

每条事实由 `_normalizeFact(fact, category)`（行 975-990）规范化为：

```javascript
{
    content,            // 文本
    source,             // 'auto' | 'manual' | 'runtime' | 'story' | 'worldInfo:bookId:uid'
    locked,             // 是否锁定（默认 true）
    importance,         // 重要度
    createdTurn,        // 创建回合
    keywords,           // 关键词数组
    emotionalTag,       // 情绪标签
    narrativeWeight     // 叙事权重
}
```

#### 三层记忆（两个维度）

**A. 三层摘要系统** (`_summaryLayers`, 行 1528，Qvink 风格)

- `near`：最近对话（详细）
- `mid`：近期摘要（压缩）
- `far`：更早（关键句）

由 `_buildSummaryLayersSection()`（行 3504-3523）注入。

**B. 三层数据架构** (Active/Linked/Dormant，行 1544-1560)

对 `characters`、`items`、`quests` 三类实体按休眠状态分层：

- **Active 层**：完整信息（近期变化/话题相关/好感极端/高 accessCount）
- **Linked 层**：压缩信息（只保留关键字段）
- **Dormant 层**：仅索引（可用 `<recall>角色名</recall>` 唤醒）

由 `_buildCharactersSection`（行 3088-3197）/ `_buildItemsSection`（行 3225+）/ `_buildQuestsSection`（行 3034-3086）实现。

#### 其他核心字段

```javascript
tables: { characters: {}, items: {}, locations: {}, relationships: {} },  // 实体表
plot: { worldSetting, chapters, currentChapter, pendingMysteries },       // 剧情
events: [],          // 重要事件
timeline: [],        // 时间线
quests: [],          // 任务
workingMemory: { recentMessages, currentTopic, turns, messages },         // 工作记忆
_injectionSnapshots: {},                                                  // 变化驱动快照（Horae 风格）
_setupLayers: { coreRules, worldSummary, fullSetup, compressed, extractTurn, setupKeywords },  // 开局设定分层
_dormantTracking: { characters, items, quests, foreshadowings },          // 休眠追踪
```

### 8.2 buildSmartInjection - 10 层 priority 注入

**方法签名** (行 2794)：

```javascript
buildSmartInjection: function() { return this.buildInjection(); }
```

实际实现 `buildInjection()`（行 2620-2779），通过 `_cachedInjectionTurn` + `_getCacheVersion()` 同回合缓存避免重复构建。

#### 注入顺序（按 priority 从高到低）

| 顺序 | 层名 | priority | 构建方法 | 标题 |
|------|------|----------|----------|------|
| 1 | `permanentFacts` | 10 | `_buildPermanentFactsSection()` (L2901) | 【核心设定（始终生效）】 |
| 2 | `changes` | 9 | `_buildChangeUpdateSection(lastTurn)` (L2963) | 【本轮变化】 |
| 3 | `plot` | 8 | `_buildPlotSection()` (L3010) | 【剧情进展】 |
| 4 | `quests` | 7 | `_buildQuestsSection()` (L3034) | 【进行中的约定】 |
| 5 | `characters` | 6 | `_buildCharactersSection(lastTurn, topic)` (L3088) | 【角色近况】 |
| 6 | `events` | 5 | `_buildEventsSection(lastTurn)` (L3199) | 【重要事件】 |
| 7 | `items` | 4 | `_buildItemsSection(lastTurn, topic)` (L3225) | 【持有物品】 |
| 8 | `sceneState` | 4 | `_buildSceneStateSection(topic)` (L3526) | 【当前场景】 |
| 9 | `summaryLayers` | 3 | `_buildSummaryLayersSection()` (L3504) | 【对话摘要】 |
| 10 | `storytellingReminders` | 2 | `_buildStorytellingReminders()` (L3296) | 【编剧提醒】 |

> **注意**：项目规则中提到的注入顺序"永久事实 → 约定 → 角色 → 事件 → 大纲 → 原文"是简化版描述。实际顺序见上表。"原文"（开局设定）由独立的 `getSetupInjection()`（行 2565-2615）负责。

#### 关键特性

- **预算控制**：`budget.maxChars = 4000`，由 `_adaptBudget()` 动态调整；超限时按 priority 从低到高用 `_smartCompressModule()` 智能压缩
- **变化驱动注入**（Horae 风格）：`_hasModuleChanged('changes', content)` 检测模块内容变化，未变化的模块不进入最终文本，实现"无变化零 Token"
- **设定原文注入** (`getSetupInjection`)：检测 `permanentFacts` 是否已有数据；有数据则只注入叙述层（外貌、性格），避免重复；无数据（开局第一轮）则完整注入 `coreRules` + `fullSetup`

### 8.3 MemoryManagerUI - 12 Tab 编辑面板

**位置**：行 4779-5966

#### Tab 路由 (`tabMap`, 行 4983)

```
overview → renderOverview
anchors / permanentFacts → renderPermanentFacts
recentMemory → renderRecentMemory
characters → renderCharacters
items → renderItems
locations → renderLocations
relationships → renderRelationships
plot → renderPlot
events → renderEvents
quests → renderQuests
timeline → renderTimeline
injection → renderInjectionPreview   // 注入预览
search → renderSearch
summaryLayers → renderSummaryLayers
sceneState → renderSceneState
world → renderLocations
```

#### 通用 UI 工具

- `_btn(action, fnName, arg, borderRadius)` (L4827)：通用按钮，action ∈ edit/delete/cancel/save/add 等
- `_formField(field, value)` (L4863)：通用输入字段（text/number/textarea/select/checkbox）
- `_formFooter(cancelTab, saveFn, saveArgs, saveAction)` (L4894)：表单底部"取消+保存"按钮对

#### 关键 save 方法

| 方法 | 行号 | 写入路径 |
|------|------|----------|
| `saveMemoryEdits()` | 4925 | `StateManager.set('progress.rollingSummary')` |
| `savePermanentFact(type, idx)` | 5252 | `EnhancedMemory` 永久事实区 |
| `deletePermanentFact(type, idx)` | 5275 | `EnhancedMemory`（用 `UI.confirm` 确认） |
| `saveCharacter(oldName)` | 5327 | `CharacterMutator.replaceCharacter` + 运行时字段 |
| `saveItem(oldName)` | 5465 | `BagMutator.setItems` / `mergeItems` |
| `saveNewEvent()` | 5853 | `gm.addImportantEvent()` 去重添加 |
| `resolveQuestByIndex(idx)` | 5900 | `QuestMutator.resolveQuest` |
| `savePlot()` | 5816 | `progress.rollingSummary` |

所有 save 方法通过 `UI.afterMemoryChange(category, key, msg)` 触发 UI 刷新，并失效缓存（`gm._cachedInjection = null`）。

#### 特殊功能

- `renderInjectionPreview(gm)` (L5927)：调用 `gm.buildInjection()` 显示最终注入文本 + 统计
- `doSearch()` (L5946)：跨 events/characters/items/summaries 全文搜索

### 8.4 SillyTavern 兼容层

#### `TavernHelperCompat` 对象 (行 24)

| 方法 | 行号 | 职责 |
|------|------|------|
| `getContext()` | 46-120 | 返回 SillyTavern 兼容 context（chat/characters/characterId 等），带同回合缓存 |
| `registerSlashCommand(name, callback)` | 170 | 注册斜杠命令 |
| `triggerSlash(commandStr)` | 172 | 执行斜杠命令链（支持 `\|` 管道，10s 超时） |
| `on/emit/once/_removeListener` | - | 事件系统 |
| `registerQuickReply(btns)` | 565+ | 注册快捷回复按钮 |
| `executeUserCode(code)` | 689+ | 沙箱执行用户脚本（`new Function` + 危险模式过滤） |
| `_loadPresetConfigs(presets)` | 820 | 从预设加载斜杠命令并同步 `wordCountConfig` |

支持 39 个内置斜杠命令（`/echo` / `/delay` / `/run` / `/emit` / `/while` / `/foreach` 等）。

#### `window.SillyTavern` 对象 (行 870-924)

```javascript
{
    getContext(),
    chat: [], characters: [],
    getCharacters(), checkCharExists(name),
    saveChat() / saveChatConditional(),
    generateRaw(prompt, options),       // 委托 sendAIRequest
    generateRawQuiet(prompt, options),
    getChatMetadata() / setChatMetadata(key, value),
    writeExtensionSetting / readExtensionSetting,
    eventSource: { on, emit, once, removeListener }
}
```

#### `STscriptEngine` 类 (行 6651)

完整兼容 SillyTavern / 酒馆助手 STscript 语法解析引擎 v2.1，支持 `{{char}}` / `{{user}}` / `{{random}}` / `{{roll:dN}}` / `{{if}}` 等宏，含变量存储、正则引擎、模板变量、PromptInjector。

### 8.5 顶层 API 方法

| 方法 | 行号 | 职责 |
|------|------|------|
| `init()` | 1572 | 加载/迁移旧数据，初始化休眠追踪，启动自动保存 |
| `_migrateFromOldFormat()` | 1637-1734 | 旧版数据迁移到新 schema |
| `processMessage(role, content, gameData)` | 1736-1770 | 消息处理主入口 |
| `parseAIEditTags(text)` | 1772+ | 解析 AI 输出的 `<mem type=... action=...>` 标签 |
| `_parseAIPlanTags(text)` | 1926+ | 解析 `<foreshadow>` / `<recall>` / `<trigger>` / `<plan>` 剧情标签 |
| `forgeSetup(blob, options)` | 1118 | SetupForge 智能开局锻造（extraction→critique→refinement） |
| `syncWorldInfoEntry(entry, uid, bookId)` | 3887-3916 | 世界书 ↔ 记忆联动，仅 constant 条目收割到 `permanentFacts.worldRules` |

---

## 9. 世界信息系统 (worldinfo.js)

**位置**：`/workspace/js/worldinfo.js`

### 9.1 顶层结构

```javascript
var WorldInfo = {
    books: [],                    // 多本书（每本 { id, name, enabled, entries }）
    settings: {
        scanDepth: 2,             // 扫描深度
        tokenBudget: 25,          // 百分比模式（默认 25%）
        tokenBudgetCap: 0,        // 硬上限（0=无限制）
        recursive: true,          // 递归扫描
        vectorRetrieval: false    // 向量检索开关
    },
    _regexCache: {},              // 正则缓存
    currentView: 'books',
    currentBookId: null,
    currentFilter: 'all'
}
```

### 9.2 条目结构 (`convertEntry`, L880-940)

完整字段（对齐 SillyTavern V2 spec）：

```javascript
{
    uid,                        // 唯一 ID
    key: [],                    // 主关键词数组（支持正则）
    keysecondary: [],           // 次要关键词数组
    comment,                    // 备注（条目名）
    content,                    // 正文
    constant,                   // 常驻条目（始终激活）
    selective,                  // 启用选择性逻辑
    order,                      // 插入顺序
    enabled,                    // 唯一真相源：true=启用
    position,                   // 0-7 注入位置
    group, groupOverride, groupWeight,
    probability,                // 0-100 概率
    depth,                      // AT_DEPTH 的深度
    scanDepth,                  // 条目级扫描深度
    selectiveLogic,             // 0=AND_ANY, 1=NOT_ALL, 2=NOT_ANY, 3=AND_ALL
    role,                       // 0=system, 1=user, 2=assistant
    sticky, cooldown, delay, delayUntilRecursion,
    ignoreBudget, addMemo,
    vectorized,
    triggers,                   // 正则触发器（优先级高于 key）
    characterFilter,            // 角色名数组
    priority,                   // token 预算不足时优先级
    decorators                  // @@activate/@@dont_activate
}
```

### 9.3 激活条件 (`scan`, L1423-1681)

**主扫描流程**：

1. **扫描深度切片** (L1462-1476)：取最近 `scanDepth` 条消息，构建 `scanText`（带角色名前缀）和 `plainText`（纯文本）
2. **遍历所有已启用书的条目** (L1482-1648)：
   - 跳过 `enabled === false`
   - **constant 条目直接激活**
   - **characterFilter 过滤**
   - **delay / cooldown / probability 检查**
   - **triggers 触发器**（优先级高于 key）
   - **主关键词匹配**：含正则 key 用 `scanText`，简单字符串用 `plainText`
   - **角色卡字段匹配**（persona/description/personality/scenario/creatorNotes）
   - **选择性逻辑**（4 种模式：AND_ANY / NOT_ALL / NOT_ANY / AND_ALL）
3. **递归扫描** (L1651-1654, `recursiveScan` L1893-1968)：已激活条目 content 作为新文本，最多 3 步
4. **同组条目互斥** (`applyInclusionGroups`, L1970-2018)：按 `groupWeight` 随机选一个
5. **向量检索补充** (L1662-1668, `_applyVectorRetrieval` L1685-1744)：Top-K 加入激活列表
6. **按 order 排序** (L1671)
7. **Token 预算控制** (`applyBudget`, L2025-2096)：按 priority 排序，`ignoreBudget` 跳过预算

### 9.4 8 个注入位置 (`buildInjectionGrouped`, L2102-2178)

| position | 常量 | 含义 |
|----------|------|------|
| 0 | BEFORE_CHAR | 角色定义之前 |
| 1 | AFTER_CHAR | 角色定义之后 |
| 2 | BEFORE_EXAMPLE_MESSAGES | 示例消息之前 |
| 3 | AFTER_EXAMPLE_MESSAGES | 示例消息之后 |
| 4 | TOP_OF_AUTHOR_NOTE | 作者备注顶部 |
| 5 | BOTTOM_OF_AUTHOR_NOTE | 作者备注底部 |
| 6 | AT_DEPTH | 指定深度注入 |
| 7 | OUTLET | 出口/自定义位置 |

**关键去重机制** (L2109-2126)：检测条目 content 是否已被 `EnhancedMemory.syncWorldInfoEntry` 收割到 `permanentFacts`，若是则跳过世界书注入，避免双重注入。

### 9.5 世界书 ↔ 记忆联动

`WorldInfo.init()` (L71-85) 启动时调用 `_harvestAllEntriesToMemory()` (L90-103)，遍历所有书的全部条目调用 `EnhancedMemory.syncWorldInfoEntry`。

`syncWorldInfoEntry` (`tavern-compat.js:3887-3916`) 逻辑：

- **仅 `constant` 条目**收割到 `permanentFacts.worldRules`，source 标记为 `'worldInfo:bookId:uid'`
- 非 constant 条目清除旧记录，走世界书关键词触发路径
- 收割时附加 label：`【entry.comment】 content`

---

## 10. 系统面板 (systems.js)

**位置**：`/workspace/js/systems.js`

包含 3 个主要子系统。

### 10.1 QuestSystem - 任务系统 (L4-258)

```javascript
var QuestSystem = {
    STATUS: { ACTIVE: '进行中', COMPLETED: '已完成', FAILED: '已失败', ABANDONED: '已放弃' },
    TYPE:   { MAIN: '主线', SIDE: '支线', HIDDEN: '隐藏' },

    getAllQuests()                    // 从 StateManager.entities.quests 读取
    _computeGuidanceReward()          // 动态计算引导任务奖励
    createGuidanceQuest()             // 创建 transient 引导任务"继续探索"
    advanceGuidanceQuest()            // 推进引导任务进度
    filterByStatus(quests, status)    // 按状态筛选
    parseProgress(p)                  // 算百分比
    renderQuestPage(container)        // 渲染任务页面（统计卡 + 筛选栏 + 列表）
    renderQuestList(quests)           // 渲染任务列表（按类型+状态排序）
    bindFilterEvents(container)
}
```

任务字段：`{ id, title, type, status, desc, progress, hint, rewards, timeLimit, priority, deadline }`

### 10.2 AchievementSystem - 成就系统 (L303-728)

```javascript
var AchievementSystem = {
    RARITY: { COMMON/RARE/EPIC/LEGENDARY },   // 4 个稀有度
    CATEGORY: { STORY/EXPLORE/SOCIAL/COMBAT/COLLECTION/SPECIAL },  // 6 个分类

    getDefaultAchievements()          // 从 gameState._worldModules 读取 AI 生成的成就定义
    getPlayerAchievements()           // 返回 { unlocked, progress, totalPoints, lastCheck }
    calculateStats()                  // 计算 storyCount/npcCount/friendlyNpc/combatCount/bagItems
    checkAchievements()               // 用 _ACH_COND_REGEX 解析条件表达式（"storyCount >= 1"）
    showUnlockToast(ach)              // 弹窗显示解锁
    renderAchievePage(container)      // 渲染（圆环进度+稀有度统计+分类 tab+列表）
    renderAchieveItem(ach, pd)        // 单条成就渲染
    showAchieveDetail(id)
}
```

成就字段：`{ id, name, desc, category, rarity, icon, condition, maxProgress, points }`

### 10.3 关系系统 (L843-984)

不是独立对象，由全局函数实现：

```javascript
function mergeRelationships(newRels)              // L843：合并 AI 返回的关系
function _inferRelationshipsFromCharacters()      // L880：从角色表推断
function renderRelationships()                    // L914：渲染关系模块
function getRelationTagClass(type)                // L953：7 类关系标签 class
```

### 10.4 顶层任务函数 (L735-837)

```javascript
function mergeQuests(newQuests)     // L735：走 QuestMutator.addQuest 合并任务
function toggleQuestList()          // L752：折叠/展开任务列表
function renderQuests()             // L765：渲染世界 Tab 中的任务模块
```

---

## 11. 向量检索 (vector-retriever.js)

**位置**：`/workspace/js/vector-retriever.js`（216 行）

### 11.1 模块结构

```javascript
var VectorRetriever = {
    _pipeline: null,                // transformers.js pipeline 实例
    _status: 'idle',                // idle/loading/ready/error
    _modelName: 'Xenova/all-MiniLM-L6-v2',   // 384 维，浏览器友好
    _vectorCache: {},               // { entryKey: { vector, content, hash, turn } }
    _queryCache: { text, vector, turn },
    _enabled: false,
    _threshold: 0.35,               // 余弦相似度阈值
    _topK: 5,                       // Top-K 检索数量
    _cachedQueryVector: null        // 由 WorldInfo.precomputeVectors 预计算
}
```

### 11.2 实现方式

**模型**：`Xenova/all-MiniLM-L6-v2`（384 维量化版），通过 `transformers.js` 在浏览器内运行，CDN 动态加载 `@xenova/transformers@2.17.2`。

### 11.3 核心方法

| 方法 | 行号 | 职责 |
|------|------|------|
| `_loadPipeline()` | 71 | 懒加载 transformers.js + 模型，含 60s 超时 |
| `_loadScript(src)` | 111 | 动态加载 script 标签 |
| `_embed(text)` | 123 | 计算 embedding，`pooling: 'mean', normalize: true` |
| `_cosine(a, b)` | 132 | 余弦相似度（向量已 normalize，直接点积） |
| `_hashContent(s)` | 59 | 内容哈希（djb2 变体），检测条目内容变化 |
| `ensureEntryVector(entryKey, content)` | 143 | 单条目向量缓存，命中 hash 直接返回 |
| `buildIndex(entries)` | 154 | 批量构建索引 |
| `pruneCache(validKeys)` | 171 | 清理已不存在的条目向量 |
| `retrieve(candidates, queryText, options)` | 184 | 异步语义检索：cosine → 排序 → Top-K → 过滤 threshold |

### 11.4 检索内容

**仅检索世界书条目**，不检索记忆系统的事件/角色/物品。

调用链：

1. `WorldInfo.scan()` 完成后调用 `_applyVectorRetrieval` (`worldinfo.js:1685-1744`)
2. 候选条目筛选：未激活的 + enabled + 非 constant + 有 content + 向量已算好
3. 同步计算余弦相似度，score ≥ 0.35 才入选
4. 排序后取 Top-K（默认 5）
5. **向量激活的条目默认注入到 `AFTER_CHAR`（position=1）**
6. WorldInfo.init 时同步开关到 VectorRetriever 并设置进度回调

---

## 12. 模块层 (modules/)

### 12.1 built-in-presets.js (399 行)

**职责**：内置 4 套官方预设的工厂与注册中心。

#### 4 套预设

| ID | 名称 | 温度 |
|----|------|------|
| `PRESET_LYRICAL` | 抒情 | 0.85 |
| `PRESET_AGGRESSIVE` | 激进 | 0.95 |
| `PRESET_MELLOW` | 平缓 | 0.75 |
| `PRESET_STANDARD` | 标准 | 0.85 |

#### 4 个公共 prompt 段

- `STYLE_ADAPT_SECTION`：题材自适应
- `ANTI_OMNISCIENCE_SECTION`：防全知
- `ANTI_METAPHOR_SECTION`：防修辞病
- `OUTPUT_CONTRACT_SECTION`：JSON 输出契约

#### 4 个公共正则脚本

`REGEX_KILL_METAPHOR`、`REGEX_KILL_SYNESTHESIA`、`REGEX_KILL_POETIC_TAIL`、`REGEX_UNIFY_QUOTES`

#### 对外暴露

```javascript
window.BUILT_IN_PRESETS         // 预设数组
window.getBuiltInPresetById(id) // 按 ID 查找
```

### 12.2 macro-engine.js (1440 行)

**职责**：SillyTavern 兼容的宏展开引擎。

#### 核心方法

```javascript
var MacroEngine = {
    process(text, env)              // L694：宏处理主入口，性能短路 text.indexOf('{{') === -1
    parseTheaterContent(content)    // 小剧场 HTML 解析，识别 20+ 标签
    getTheaterContent()             // 返回当前小剧场内容

    // 变量管理
    setLocalVar / getLocalVar / setGlobalVar / getGlobalVar
    hasVar / deleteVar / addVar / incVar / decVar

    // 上下文读取
    getUser / getChar / getCharDescription / getCharPersonality
    getScenario / getModel / getLastUserMessage / getLastCharMessage
}
```

#### 变量简写 (`_processVariableShorthand`)

- `{{.var}}`：读取局部变量
- `{{$var}}`：读取全局变量
- `{{.var = value}}`：赋值
- `{{.var++}}`：自增
- `{{.var ||= fallback}}`：默认值
- `{{.var += n}}`：累加

#### 小剧场标签

`<snow>` / `<author_note>` / `<gossip>` / `<角色手机>` / `<通用状态>` / `<古风状态>` / `<meow_FM>` / `<branches>` / `<echo>` / `<ccd>` / `<live>` / `<danmu>` 等 20+ 标签。

### 12.3 preset-manager.js (2208 行)

**职责**：预设的解析、加载、保存、参数同步、导入导出。

#### 核心方法

```javascript
var PresetManager = {
    init()                                      // 调用 _injectBuiltInPresets
    _injectBuiltInPresets()                     // L53：注入内置预设
    parsePreset(data, fileName)                 // L629：完整解析酒馆预设
    _applyPromptsToSystemPrompt(preset)         // L1559：按 depth 0-5 分到 positionPrompts
    loadPreset / load / save
    loadCurrentParams / saveCurrentParams       // 参数 ↔ UI 双向同步
    syncParamsToUI / syncParamsFromUI
    showModal / renderPresetList / openPresetDetail
    _renderPromptList / _togglePrompt / _viewPromptContent
    importFromFile / exportPreset               // L2090：导入导出
    cloneAsMyPreset / saveCurrentAsPreset / deletePreset
    showBuiltInPicker                           // 内置预设选择器
}
```

#### `_PARAM_CONTROLS` (L266)

参数驱动表，统一描述每个参数对应的 UI 控件类型与取值范围。

### 12.4 regex-manager.js (1211 行)

**职责**：正则脚本管理 + 输入/输出文本转换，含 ReDoS 防护与超时保护。

#### PLACEMENT 常量表 (L924)

| 常量 | 值 | 含义 |
|------|---|------|
| `MD_DISPLAY` | 1 | AI 输出展示前 |
| `USER_INPUT` | 2 | 用户输入提交前 |
| `SLASH_COMMAND` | 3 | 斜杠命令 |
| `WORLD_INFO` | 4 | 世界书 |
| `MACRO_COMMAND` | 5 | 宏命令 |
| `REASONING` | 6 | 思维链 |

#### 核心方法

```javascript
var RegexManager = {
    apply(text, placement, messageIndex)        // L935：批量应用，5s 总超时 + 2s 单脚本超时
    applySingleScript / applyToInput / applyToOutput
    parseSingleRegex(data, isImport)            // L596
    parseRegexScripts / importFromFile
    editScript / saveScript / testScript / deleteScript
    showModal / showGroupView / showDetailView
    setPresetScripts / clearPresetScripts       // 预设绑定的正则管理
    checkPresetRegexAllowed                     // 预设正则允许列表（仿酒馆 preset_allowed_regex）
    exportScripts
}
```

#### ReDoS 防护

- 执行前用 `RegexSafetyChecker.isSafe(regexBody)` 过滤（在 `utils.js` L1000+）
- `RegexSafetyChecker`：`MAX_LENGTH=1000`、`MAX_QUANTIFIERS=3`、`_DANGEROUS_PATTERNS`（5 个）、`_NESTED_QUANTIFIER_RE`

### 12.5 smart-config-engine.js (365 行)

**职责**：从预设的"指南 prompt"中提取智能配置并应用到运行时。

```javascript
var SmartConfigEngine = {
    extractConfig(preset)                       // 从预设提取配置主入口
    _isGuidePrompt(promptText)                  // 识别指南类 prompt（须知/指南/必做/注意/...）
    _extractAutoParse / _extractAPISettings
    _extractModelRecommendations / _extractRegexRequirements
    _extractPluginRequirements / _extractTemperatureGuide
    applyConfig(config, presetName)             // L312：真正应用配置
    loadFromPreset(preset)                      // L302：被 PresetManager.loadPreset 调用
    logConfig / getConfigSummary
}
```

---

## 13. UI 系统

### 13.1 phone-ui.js (~7200 行)

**职责**：手机模拟器 UI 的核心实现，承载绝大多数游戏页面的渲染与交互。

#### 架构原则

- `StateManager` 是权威数据源
- `_syncLegacyMirror` 单向镜像到 `gameState` 旧字段
- phone-ui.js 大量函数仍直接读写 legacy 字段（40+ 处）

#### 关键常量

```javascript
MAX_FORUM_POSTS = 8              // 论坛最大帖子数
MAIN_NAV_TABS                    // 6 个底部 tab
AVATAR_MAX_DIM = 512             // 头像限制
AVATAR_MAX_SIZE = 2MB
NPC_CHAT_HISTORY_MAX = 100       // NPC 聊天历史滚动保留
UNDO_HISTORY_LIMIT = 50          // 撤销栈上限
MC_FIELD_MAP                     // 7 字段玩家属性映射
```

#### 关键函数分类（156+ 个顶层函数）

**数据访问层**：
- `getPlayerMoney` / `getAllCharactersArray` / `getCurrencyName`
- `subtractPlayerMoney`（委托 `CurrencyMutator`）
- `_getConversationHistory` / `getConversationHistorySnapshot`
- `_updateConversationHistory`（StateManager 优先）
- `favColorOf`（7 档 fav→color）

**页面渲染**：
- `renderChatPage` / `renderWorldPage` / `renderMomentsPage` / `renderForumPage`
- `renderRankPage` / `renderItemsPage` / `renderDiaryPage` / `renderMailPage`
- `renderShopPage` / `renderCalendarPage` / `renderAuthorNotePage`
- `renderPlayerPage` / `renderRecapPage` / `renderNpcPage`

**游戏流程**：
- `startNewGame` / `restoreGame` / `deleteLastTurn` / `saveUndoState`
- `renderAPISettings` / `showApiDetail` / `showCreateApiModal`
- `saveGameSettings` / `loadGameSettings` / `openSettingsModal`

**NPC 聊天**：
- `openNpcChat` / `closeNpcChat` / `sendNpcChat`
- `renderRichMessage` / `addNpcChatBubble`
- `openEditNpcModal` / `saveNpcEdit`

**XSS 防护渲染**：
- `renderLogItemHtml` / `renderErrorItemHtml`

#### 子模块

- `PresetAppManager` (L1146)：预设 App 子模块
- `UNIFIED_PRESETS` (L6681) + `PRESET_ALIASES` (L6724) + `_applyUnifiedPreset` (L6730) + `applyArchetype` (L6770)：统一预设与原型应用

### 13.2 swipe-manager.js (238 行)

**职责**：多分支重生成（Swipe）管理器，单轮覆盖式存储，避免存档膨胀。

#### 核心方法

```javascript
var SwipeManager = {
    _readState / _writeState / _currentTurn / _flushToState
    loadCurrentTurn                // 加载当前回合 swipe 数据
    reset                          // 进入新回合时调用
    hasSwipes / count / currentIndex / isRetrying / setRetrying
    addSwipe(swipe)                // 新增分支
    switchTo(index)                // 切换分支，恢复 UI + 同步 conversationHistory
    prev / next                    // 便捷切换
    _syncLastAssistantContent(content)  // 保留原消息额外字段，仅更新 content
    getCurrentSwipe
    _renderSwitcher / _hideSwitcher     // < 1/3 > 切换器 UI
}
```

#### 数据结构 (`progress.swipes`)

```javascript
{ versions: [swipe...], current: 0, turn: 5 }
// 每个 swipe = { storyText, choices, sceneTitle, response, turn, timestamp }
```

**设计原则**：swipe 只存在于当前回合，进入下一回合时自动覆盖。

### 13.3 stream-bridge.js (231 行)

**职责**：流式响应桥接层，通过 Web Worker 隔离 SSE 解析。

```javascript
var StreamBridge = (function() {
    return {
        executeAIStreamViaWorker(url, body, apiKey, signal, onChunk),
        isAvailable()
    }
})()
```

#### Worker 懒初始化 `_ensureWorker()`

通过 Blob URL 加载 Worker，避免 GitHub Pages 跨路径问题。`_getWorkerSource()` 同步 XHR 获取 `stream-worker.js` 内容（仅一次，结果缓存）。

#### 消息协议

`START` / `CHUNK` / `DONE` / `ERROR` / `FALLBACK` / `ABORT`

#### 降级机制

Worker 不可用时返回 `Promise.reject(new Error('WORKER_UNAVAILABLE'))` 让调用方降级到主线程 fetch。

### 13.4 stream-worker.js (326 行)

**职责**：Worker 内主循环，SSE 解析、节流、超时、429 识别、reasoning 透出。

#### 节流配置

- `_CHUNK_THROTTLE_MS = 60`（约 16fps）
- `_throttledPostChunk`：高频 chunk 合并为一条消息

#### 双层 idle 超时

- `FIRST_TOKEN_TIMEOUT_MS = 240s`：首 token 超时
- `CHUNK_IDLE_TIMEOUT_MS = 240s`：chunk 间空闲超时
- `CONNECT_TIMEOUT_MS = 240s`：连接超时

#### 其他特性

- **rawBody 兜底**：1MB 滚动保留，SSE 解析为空时回传 `FALLBACK`
- **429 识别**：`ResourceExhausted` / `rate_?limit` / `quota` 统一标记 `status=429`
- **reasoning 透出**：识别 `delta.reasoning_content` 或 `delta.reasoning` 字段

### 13.5 version-badge.js (30 行)

点击 `#buildVersionBadge` 时：清空 caches + 硬刷（URL 加 `_=timestamp`）。

### 13.6 CSS 文件组织

| 文件 | 行数 | 职责 |
|------|------|------|
| `base.css` | 2655 | CSS 变量 / reset / 通用组件 / 工具类 / 响应式断点 |
| `menu.css` | 1364 | 主菜单页（手机桌面风） |
| `pages.css` | 3439 | 故事/玩家/NPC/回顾/结局/设置等页面 |
| `phone-ui.css` | - | 仿微信/微博/小红书/iOS 邮件等手机模拟器 UI |
| `systems.css` | 1063 | 任务/成就/世界书/预设/正则/记忆面板 |

#### base.css 关键 CSS 变量

- **颜色**：`--bg` / `--card` / `--border` / `--text` / `--accent` / `--danger` / `--success` / `--warning` / `--wechat-green`
- **圆角**：`--radius-sm:12px` / `--radius-md:16px` / `--radius-lg:20px`
- **z-index 层级**：`--z-base:1` → `--z-sticky:10` → `--z-dropdown:50` → `--z-overlay:100` → `--z-modal:200` → `--z-popover-high:500` → `--z-loading:99999` → `--z-toast:999999`
- **稀有度色板**：`--rarity-common/uncommon/rare/legendary`
- **暗色模式**：`[data-theme="dark"]` 完整覆盖

#### 响应式断点

375px / 414px / 480px / 768px 四档。

---

## 14. 工具与基础设施

### 14.1 utils.js (1122 行)

**职责**：通用工具集，覆盖 Token 估算、DOM 缓存、定时器管理、存储、主题、日志、ReDoS 防护。

#### 常量

```javascript
DEFAULT_MAX_TOKENS = 32768
DEFAULT_CONTEXT_SIZE = 32000
```

#### Token 估算

| 函数 | 行号 | 职责 |
|------|------|------|
| `estimateTokensUtil(text)` | L281 | 优先 `Tokenizer.count`，回退字符估算 `cjk * 1.5 + ascii / 4 + punct + space / 4` |
| `estimateTokensForMessagesUtil(messages)` | L319 | 每条加 4 token overhead |

#### 截断

- `truncateByChars(text, maxChars, suffix)` (L244)：CJK 安全截断，用 `Array.from` 按 code point 切，避免 surrogate pair 被切坏

#### Context 动态配置

- `getContextSize()` (L159)：StateManager 优先 → legacy → `DEFAULT_CONTEXT_SIZE`
- `getContextScale()` (L213)：`Math.max(0.5, getContextSize() / DEFAULT_CONTEXT_SIZE)`
- `getDynamicTruncationConfig()` (L220)：10 个动态截断参数

#### DOM 与事件

- `DOMCache`：LRU 缓存（30s TTL，100 上限）
- `TimerManager`：id 化管理 setInterval/setTimeout，含 try-catch 包装
- `GlobalCleanup`：注册 listener + `cleanup()` 统一移除 + `TimerManager.clearAll()` + `DOMCache.clear()`
- `_globalA11yDelegate`：document 层 keydown/click 委托，`role="button"` 键盘 Enter/Space 触发 + `data-action="funcName"` `data-args="JSON"` 调用 `window[funcName]`
- `bindFresh(elOrId, event, handler, refKey)`：一次性事件绑定

#### 类型与序列化

- `safeInt(v, defaultVal)`、`isObject(v)`、`safeDeepClone(o)`
- `safeSetItem(key, value)`：容量检查 + QuotaExceededError 处理

#### Storage 命名空间

```javascript
var Storage = {
    KEYS: { API_PRESETS, CURRENT_PARAMS, PRESET_ALLOWED_REGEX, REGEX_SCRIPTS,
            GLOBAL_VARS, WORLD_INFO, ... },
    get / getJSON / set / setJSON / remove
}
```

#### 其他工具

- `StorageMonitor`：容量检测 + 30s 缓存 + 二分探测
- `CurrencyReconciler`：`chineseToNumber` / `extractMoneyChanges` / `reconcileFromStory`
- `ThemeManager`：light/dark 切换 + 系统偏好检测
- `Logger`：debug/info/warn/error 级别封装
- `RenderCache`：`same(name, key)` / `mark(name, key)` 避免重复渲染
- `parseTheaterItems(html, schema)`：声明式 schema 解析小剧场 HTML

#### ReDoS 防护

- `RegexSafetyChecker`：`MAX_LENGTH=1000`、`MAX_QUANTIFIERS=3`、`_DANGEROUS_PATTERNS`（5 个）、`_NESTED_QUANTIFIER_RE`、`isSafe(pattern)`
- `safeRegexApply(regex, text, replacement, opts)` (L1033)：单次调用软超时 + 每 256 次匹配检查时间
- `safeRegexExecAll(regex, text, opts)`

### 14.2 tokenizer.js (164 行)

**职责**：纯前端 Token 估算器，无外部依赖，按模型自适应调整 CJK 权重，误差 ±8%。

#### 模型 Profile (`_MODEL_PROFILES`)

| 模型 | CJK 权重 |
|------|----------|
| DeepSeek/Qwen/GLM/Moonshot | 1.0 |
| GPT/OpenAI | 1.5 |
| Claude | 1.3 |
| Gemini | 1.2 |
| default | 1.5 |

#### 核心方法

```javascript
var Tokenizer = {
    count(text, modelName)         // 主入口
    _bpeSplit(word)                // 3 字符内 1 token，6 字符内 2 token，长词后缀拆分
    _getProfile(modelName)
    _getCurrentModel()             // 从 StateManager/gameState 取当前模型
}
```

### 14.3 character-card-exporter.js (303 行)

**职责**：将玩家与 NPC 导出为 SillyTavern 兼容角色卡（v2/v3），支持 PNG 嵌入。

#### 核心方法

```javascript
var CharacterCardExporter = {
    exportPlayerAsV2()                      // spec: 'chara_card_v2'
    exportCharacterAsV2(charName)           // NPC 导出
    exportAsV3(charName)                    // v2 + character_book + 多语言
    embedCardIntoPng(pngArrayBuffer, cardJson)  // PNG tEXt chunk 嵌入
    _buildPngChunk / _crc32 / _bytesToBase64
    _exportWorldInfoAsBook()                // WorldInfo.books → SillyTavern V2 character_book
    downloadBlob / downloadJson
}
```

---

## 15. 游戏主循环 (game.js)

**位置**：`/workspace/js/game.js`（~3900 行）

### 15.1 关键函数（按调用链顺序）

| 函数 | 行号 | 作用 |
|------|------|------|
| `getCurrentWorldTerms` | 37 | 获取当前世界观术语 |
| `buildWorldTermsPrompt` | 50 | 构建世界观术语注入 |
| `getWorldInfoInjection` | 178 | 世界书注入 |
| `buildNarrativeEnhancement` | 214 | 叙事基调注入 |
| `_generateAutoChoices` | 288 | 兜底选项生成 |
| `buildSystemPrompt` | 506 | 系统提示词构建 |
| `_buildFormatAnchor` / `_buildFormatRules` | 613 / 642 | 格式锚点与规则 |
| `buildRecentChatContext` | 690 | 近期对话上下文 |
| `injectPresetGlobalVars` / `applyLengthPreset` | 739 / 974 | 预设变量与长度预设 |
| **`sendAIRequest`** | **995** | **AI 请求主入口（isInit 区分首轮）** |
| `updateTokenCount` | 2747 | Token 计数更新 |
| `exportAsNovel` | 2809 | 导出小说 |
| `_compressConversation` | 2878 | 对话压缩 |
| `_parseStructuredSummary` / `_extractAndStoreImportantInfo` | 2971 / 3020 | 摘要解析与重要信息抽取 |
| `autoCompressContext` / `manualCompress` | 3119 / 3197 | 自动/手动压缩上下文 |
| `extractStoryStreaming` / `onStreamChunk` | 3277 / 3383 | 流式 story 提取与 chunk 处理 |
| `renderStory` | 3490 | 渲染剧情文本 |
| `renderCotPanel` | 3540 | 渲染思维链折叠面板 |
| `formatStory` | 3666 | 文本格式化 |
| `toggleThought` | 3947 | 思维折叠切换 |
| `renderHUD` / `renderChoices` | 4009 / 4015 | HUD 与选项渲染 |
| `mergeCharacters` | 4097 | 角色合并 |
| `buildSaveData` | 4116 | 构建存档数据 |
| `SaveMigrator` | 4188 | 存档迁移器 |
| `safeSaveSlot` / `saveToSlot` / `loadFromSlot` / `deleteFromSlot` | 4349 / 4355 / 4368 / 4520 | 存档槽 CRUD |
| `requestNpcReply` | 4534 | NPC 主动回复请求 |
| `registerGameStartListener` | 5040 | 注册游戏开始监听（init.js 调用） |

### 15.2 核心数据流

```
玩家行动 / 选择
    ↓
game.js: sendAIRequest(userMessage, isInit=false)
    ↓ (经 StreamBridge.executeAIStreamViaWorker → stream-worker.js)
core.js: callAI / executeAIStream (Worker 降级路径)
    ↓ SSE chunk
game.js: onStreamChunk(delta, fullText)
    ↓ _extractStoryIncremental() 增量提取 story 字段
    → TypewriterBuffer.push() → renderStory() 打字机渲染
    ↓ 流结束
core.js: parseAIResponse(reply)  →  ResponseParser.parse
    ↓ AIResponseMutator.apply → 各 Mutator → StateManager.set
    ↓ _syncLegacyMirror 自动回写 gameState.* legacy 字段
    ↓
game.js: renderChoices() + phone-ui.js 渲染物品/任务/NPC
    ↓
core.js: saveToSlot / autoSave
```

---

## 16. PWA 与 Service Worker

### 16.1 manifest.json

```json
{
    "name": "Free-Script AI 文游",
    "short_name": "FreeScript",
    "start_url": "./",       // 相对路径适配 GitHub Pages 子路径
    "scope": "./",
    "display": "standalone",
    "orientation": "portrait",
    "background_color": "#f5f5f0",
    "theme_color": "#f5f5f0",
    "lang": "zh-CN",
    "icons": [{ "src": "favicon.svg", "sizes": "any", "purpose": "any maskable" }],
    "categories": ["games", "entertainment"]
}
```

### 16.2 sw.js 缓存策略

**位置**：`/workspace/sw.js`

- `CACHE_NAME = 'free-script-v1'` (L9)
- `CORE_ASSETS`：44 项预缓存清单 (L10-55)

**策略**（`sw.js:1-8` 注释）：

| 资源类型 | 策略 |
|----------|------|
| 静态资源（js/css/png/svg/json/manifest） | **缓存优先，回退网络** |
| HTML 页面 | **网络优先，失败回退缓存** |
| API 请求（跨域 fetch） | **不拦截，直接放行** |

**关键事件**：

- `install` (L58-73)：`Promise.all` 逐个 `cache.add`（容错） → `self.skipWaiting()`
- `activate` (L76-90)：清理非 `CACHE_NAME` 旧缓存 → `self.clients.claim()`
- `fetch` (L93-138)：
  - 非 GET 放行
  - 跨域放行
  - HTML：网络优先，失败回退 `caches.match(req)` 或 `./index.html`
  - 其他静态资源：缓存优先，未命中时 fetch 并回写，全部失败返回 `504 Offline`
- `message` (L141-145)：收到 `'skipWaiting'` 立即激活

### 16.3 sw-register.js

独立文件以避开 CSP `script-src 'unsafe-inline'` 限制。IIFE 内：若 `navigator.serviceWorker` 存在，在 `window.load` 事件中注册 `'sw.js'`。

---

## 17. 部署流程

### 17.1 项目规则要求

**位置**：`/workspace/.trae/rules/project_rules.md`

- **CI/CD**：`.github/workflows/deploy.yml` 仅在 push 到 `master` 分支时自动部署（trae 分支不触发自动部署）
- **每次修改代码后，必须手动部署**：
  1. `git add` 改动的文件
  2. `git commit` 提交
  3. 合并到 master：`git checkout master && git merge <当前分支> --no-edit`
  4. 推送：`git push origin master`
  5. 等待 GitHub Actions 部署完成（约 1-2 分钟）
- **不要忘记推送！用户在线上看到的版本必须和本地一致。**

### 17.2 GitHub Actions 工作流

**位置**：`/workspace/.github/workflows/deploy.yml`

#### 触发条件 (L3-6)

- `push` 到 `master` 分支
- `workflow_dispatch`（手动触发）

#### 并发控制 (L13-15)

`concurrency.group: pages`，`cancel-in-progress: false`

#### 权限 (L8-11)

`contents: read`、`pages: write`、`id-token: write`

#### Job 步骤 (L17-69)

| 步骤 | 行号 | 内容 |
|------|------|------|
| Checkout | 24-25 | `actions/checkout@v4` |
| Prepare deploy directory | 29-34 | `mkdir -p dist` + `rsync -a` 复制全部文件，排除 `.git / .github / .trae / backup / dist / node_modules / .gitignore` |
| Inject build version & cache-bust | 37-58 | 1) `sed` 替换 `index.html` 中的 `__BUILD_VERSION__` 为 `b<SHA7>-<UTC时间>`；2) `sed -E` 给所有 `js/*.js` / `css/*.css` URL 追加 `?v=<version>` |
| Setup Pages | 60-61 | `actions/configure-pages@v5` |
| Upload artifact | 62-65 | `actions/upload-pages-artifact@v3`，`path: dist` |
| Deploy | 66-69 | `actions/deploy-pages@v4`，输出 `page_url` |

### 17.3 部署确认

```bash
curl -s -H "Authorization: token <TOKEN>" \
  "https://api.github.com/repos/yanyuan1234/free-script/actions/runs?per_page=1" \
  | python3 -c "import json,sys; r=json.load(sys.stdin)['workflow_runs'][0]; print(f'Status: {r[\"status\"]} | Conclusion: {r[\"conclusion\"]}')"
```

### 17.4 代码规范

- JS 文件修改后必须运行 `node --check js/<file>.js` 验证语法
- 不要创建不必要的文件（测试脚本用完即删）
- 中文注释，代码风格与现有代码保持一致

---

## 18. 关键数据流

### 18.1 AI 回合完整数据流

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 玩家行动 / 选择                                          │
│    game.js: sendAIRequest(userMessage, isInit=false)        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Prompt 构建                                              │
│    PromptBuilder.buildSystemPrompt(context)                 │
│    - 注入 10 层片段（identity → world → ... → gametime）    │
│    - worldinfo.buildInjection(chatMessages)                 │
│    - EnhancedMemory.buildSmartInjection() (10 层 priority)  │
│    - MacroEngine.process 展开 {{...}} 宏                    │
│    - RegexManager.applyToInput 处理输入正则                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. AI 调用                                                  │
│    StreamBridge.executeAIStreamViaWorker                    │
│       → stream-worker.js (Worker 内 SSE 解析)               │
│       → 节流 CHUNK (60ms)                                   │
│    失败降级：core.js executeAIStream (主线程 fetch)         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. 流式渲染                                                 │
│    game.js: onStreamChunk(delta, fullText)                  │
│       → _extractStoryIncremental() 增量提取 story           │
│       → TypewriterBuffer.push() → renderStory()             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. 响应解析                                                 │
│    ResponseParser.parse(rawReply, options)                  │
│       - 思维链剥离 → OutputSanitizer.stripThinking          │
│       - 6 层兜底：JSON 标签 / 直接 JSON / 代码块 / 清理 /   │
│         <mem> / <state> 块 / 纯文本                         │
│       - 返回 { success, data, storyText, mems }             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. 状态应用                                                 │
│    AIResponseMutator.apply(parsed, options)                 │
│       → StateManager.transaction 包裹                       │
│       → 15 个 _applyXxx 步骤（best-effort）                 │
│         · _applyStoryAndTitle (critical)                    │
│         · _applyCharacters → CharacterMutator.mergeCharacters│
│         · _applyBag → BagMutator.mergeItems                 │
│         · _applyQuests → QuestMutator.setQuests + auto      │
│         · _applyPermanentFacts → EnhancedMemory 永久事实区  │
│         · _applyMemoryUpdates → AI 显式记忆维护             │
│         · ...                                               │
│       → _syncLegacyMirror 自动回写 gameState.* 旧字段       │
│       → 事务提交 _notify(changes)                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. 数据持久化校验                                           │
│    _validatePersistence (5 项检查)                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. UI 渲染                                                  │
│    game.js: renderChoices()                                 │
│    phone-ui.js: 渲染物品/任务/NPC/世界模块                  │
│    systems.js: 任务/成就/关系面板更新                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. 存档                                                     │
│    core.js: SaveDB.put (IndexedDB)                          │
│    AUTO_SAVE_BACKUP (后台自动)                              │
└─────────────────────────────────────────────────────────────┘
```

### 18.2 GameMemory 双向同步流

```
StateManager.set('entities.bag', [...])
       ↓
_syncLegacyMirror → gameState.currentBag = [...]
       ↓
GameMemoryAdapter 监听 'entities.**' 模式
       ↓
syncToGameMemory()
       ↓
_mergeTable('items', arr, fieldMap, factory)
       ↓
GameMemory.tables.items[name] = { ...实体字段, ...运行时字段 }
       ↓
下一轮 buildSmartInjection 时
       ↓
_buildItemsSection(lastTurn, topic)
       ↓
按休眠状态分三层注入：
- Active 层：完整信息
- Linked 层：压缩信息
- Dormant 层：仅索引
```

### 18.3 撤销流程

```
玩家点击"撤回"
       ↓
game.js: deleteLastTurn()
       ↓
UndoMutator.popSnapshot()
       ↓
UndoMutator.restoreFromSnapshot(snap)
       ↓ 委托各 Mutator
- CharacterMutator.setCharacters
- BagMutator.setItems
- QuestMutator.setQuests
- RelationshipMutator.mergeRelationships
- StateManager.set('progress.conversationHistory')
- StateManager.set('progress.turn'/'sceneTitle'/'swipes')
       ↓
_syncLegacyMirror 自动同步旧字段
       ↓
UI 重新渲染
```

---

## 19. 关键概念对照表

### 19.1 别名对照

| 文档名 | 实际对象 | 位置 |
|--------|----------|------|
| `EnhancedMemory` | `GameMemory` | `tavern-compat.js:4618` `window.EnhancedMemory = GameMemory` |
| `MemoryManagerUI` | `MemoryManagerUI` | `tavern-compat.js:4779` |
| `buildSmartInjection` | `buildInjection` | `tavern-compat.js:2794` |
| `estimateTokensUtil` | `Tokenizer.count` | `utils.js:281` |
| `truncateByChars` | `truncateByChars` | `utils.js:244` |

### 19.2 状态字段新旧映射（部分）

| 旧字段 (gameState.*) | 新路径 (StateManager) |
|---------------------|----------------------|
| `currentBag` | `entities.bag` |
| `allCharacters` | `entities.characters` |
| `currentQuests` | `entities.quests` |
| `gameTime` | `time` |
| `keyEvents` | `entities.events` |
| `relationships` | `entities.relationships` |
| `playerMoney` / `money` / `coins` | `entities.currency` |
| `_stats.totalTurns` | `progress.turn` |
| `_undoHistory` | `ui.undoHistory` |
| `conversationHistory` | `progress.conversationHistory` |
| `rollingSummary` | `progress.rollingSummary` |
| `sceneTitle` | `progress.sceneTitle` |

### 19.3 模型 strict 模式支持

| 模型 | strict 支持 | jsonObject 支持 |
|------|------------|----------------|
| DeepSeek | ✓ | ✓ |
| GPT-4o / 4.1 / 4-turbo / o1 / o3 / o4 | ✓ | ✓ |
| Qwen | ✓ | ✓ |
| Claude | ✗（保守） | ✓ |
| GLM | ✗（保守） | ✓ |
| 老模型（text-davinci 等） | ✗ | ✗ |

### 19.4 关键 z-index 层级

| 变量 | 值 | 用途 |
|------|---|------|
| `--z-base` | 1 | 装饰元素 |
| `--z-sticky` | 10 | sticky 头部 |
| `--z-dropdown` | 50 | 下拉菜单 |
| `--z-overlay` | 100 | 模态遮罩 |
| `--z-modal` | 200 | phone-ui 模态 |
| `--z-popover-high` | 500 | 下拉面板 |
| `--z-loading` | 99999 | 全屏加载层 |
| `--z-toast` | 999999 | Toast 通知（最高） |

### 19.5 关键 timeout 配置

| 配置 | 值 | 位置 |
|------|---|------|
| StreamBridge CHUNK_THROTTLE | 60ms | `stream-worker.js` |
| StreamBridge FIRST_TOKEN_TIMEOUT | 240s | `stream-worker.js` |
| StreamBridge CHUNK_IDLE_TIMEOUT | 240s | `stream-worker.js` |
| StreamBridge CONNECT_TIMEOUT | 240s | `stream-worker.js` |
| RegexManager 总超时 | 5s | `regex-manager.js` |
| RegexManager 单脚本超时 | 2s | `regex-manager.js` |
| STScript 单命令超时 | 10s | `tavern-compat.js` |
| VectorRetriever 模型加载超时 | 60s | `vector-retriever.js` |
| MacroEngine 条件宏总超时 | 5s | `macro-engine.js` |
| MacroEngine 单次 replace 超时 | 2s | `macro-engine.js` |

### 19.6 关键容量限制

| 配置 | 值 | 位置 |
|------|---|------|
| 永久事实区 pcIdentity | 5 条 | `tavern-compat.js:973` |
| 永久事实区 worldRules | 20 条 | `tavern-compat.js:973` |
| 永久事实区 settings | 20 条 | `tavern-compat.js:973` |
| 永久事实区 npcProfiles | 30 条 | `tavern-compat.js:973` |
| 永久事实区 promises | 20 条 | `tavern-compat.js:973` |
| 永久事实区 worldPlaces | 20 条 | `tavern-compat.js:973` |
| 关系上限 | 10 条 | `relationship-mutator.js:44` |
| Undo 栈上限 | 50 | `schema.js:80` |
| 论坛最大帖子数 | 8 | `phone-ui.js` |
| 已完成/失败任务保留 | 最多 3 条 | `quest-mutator.js:83-86` |
| 向量检索 Top-K | 5 | `vector-retriever.js` |
| 向量相似度阈值 | 0.35 | `vector-retriever.js` |
| 递归扫描最大步数 | 3 | `worldinfo.js` |

### 19.7 已知遗留问题

来源：`/workspace/docs/审查-ai-contract-2026-07-01.md`

| ID | 严重度 | 问题 |
|----|--------|------|
| P1-5 | P1 | STScriptBridge 仍未注册任何 slash command（半桥问题） |
| P2-1 | P2 | `ai-output-schema.js` 缺酒馆标准的 `synopsis` / `memories` / `charStatus` / `main` 字段 |
| P2-4 | P2 | `prompt-builder.js` 无酒馆标准 sections（charDescription / charPersonality / scenario / authorNote / chatHistory） |
| P3-2 | P3 | `prompt-builder.js` 缺 `buildUserPrompt` / `listSections` 接口 |

---

> 本文档基于截至 2026-07-18 的代码状态生成。如需了解特定模块的最新细节，请直接查阅源码并参考 `docs/` 目录下的设计与审查文档。
