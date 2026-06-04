# Free-Script Code Wiki

> AI 驱动的交互式文字冒险游戏引擎
> 版本: 1.2.0 | 线上地址: https://yanyuan1234.github.io/free-script/

---

## 目录

1. [项目概述](#1-项目概述)
2. [项目架构总览](#2-项目架构总览)
3. [文件结构与职责](#3-文件结构与职责)
4. [核心模块详解](#4-核心模块详解)
   - 4.1 [core.js - 全局状态与AI核心](#41-corejs---全局状态与ai核心)
   - 4.2 [game.js - 游戏逻辑与剧情引擎](#42-gamejs---游戏逻辑与剧情引擎)
   - 4.3 [modules.js - 预设/正则/宏引擎](#43-modulesjs---预设正则宏引擎)
   - 4.4 [tavern-compat.js - 酒馆兼容层与记忆系统](#44-tavern-compatjs---酒馆兼容层与记忆系统)
   - 4.5 [worldinfo.js - 世界书系统](#45-worldinfojs---世界书系统)
   - 4.6 [systems.js - 任务与成就系统](#46-systemsjs---任务与成就系统)
   - 4.7 [phone-ui.js - 日志/论坛/手机模块](#47-phone-uijs---日志论坛手机模块)
   - 4.8 [utils.js - 工具函数库](#48-utilsjs---工具函数库)
   - 4.9 [init.js - 应用初始化](#49-initjs---应用初始化)
   - 4.10 [patch.js - 补丁与STscript集成](#410-patchjs---补丁与stscript集成)
5. [数据流与依赖关系](#5-数据流与依赖关系)
6. [关键数据结构](#6-关键数据结构)
7. [API调用流程](#7-api调用流程)
8. [世界书扫描与注入](#8-世界书扫描与注入)
9. [记忆系统架构](#9-记忆系统架构)
10. [部署与运行](#10-部署与运行)
11. [CSS架构](#11-css架构)

---

## 1. 项目概述

Free-Script 是一个纯前端的 AI 交互式文字冒险游戏平台。用户选择题材后，AI 生成剧情、角色、任务等内容，玩家通过选项或自定义行动推进故事。项目兼容 SillyTavern 预设/世界书格式，支持多 API 端点轮换、流式输出、三层记忆系统、小剧场融合等高级功能。

**核心特性：**
- 多 API 端点管理与自动轮换（含失败重试、24h 过期机制）
- 流式输出 + 打字机效果渲染
- 三层记忆系统（短期/长期/永久事实区）
- SillyTavern 世界书完全兼容（v1/v2 格式、扫描引擎、注入引擎）
- 预设管理系统（支持果实/月读/蛾摩拉等主流预设）
- 正则脚本引擎 + 宏引擎 + STscript 兼容
- 小剧场融合系统（论坛/群聊/朋友圈/商店/邮件等 20+ 类型）
- NPC 独立聊天系统
- 任务系统 + 成就系统
- 世界观主题检测 + 动态术语适配
- IndexedDB 存档（带 localStorage fallback）
- 暗色/亮色主题切换
- Cloudflare Worker API 代理

---

## 2. 项目架构总览

```
┌─────────────────────────────────────────────────────────┐
│                     index.html                          │
│              (单页应用入口, SVG图标, 所有DOM结构)          │
├─────────────────────────────────────────────────────────┤
│  CSS 层                                                  │
│  base.css → pages.css → menu.css → systems.css          │
│                       → phone-ui.css                     │
├─────────────────────────────────────────────────────────┤
│  JS 加载顺序 (按 script 标签顺序)                         │
│                                                          │
│  ① utils.js      → 基础工具(DOMCache, TimerManager,     │
│                     ThemeManager, StorageMonitor)         │
│  ② core.js       → 全局状态(gameState), AI核心(callAI),  │
│                     UI工具, API管理, 存档, 解析引擎        │
│  ③ game.js       → 游戏逻辑(系统提示词, 流式渲染,        │
│                     NPC聊天, 存档管理, 角色管理)           │
│  ④ modules.js    → 预设管理(PresetManager),              │
│                     正则引擎(RegexManager),               │
│                     宏引擎(MacroEngine),                  │
│                     智能配置(SmartConfigEngine)            │
│  ⑤ tavern-compat.js → 酒馆兼容层(TavernHelperCompat),    │
│                     三层记忆(EnhancedMemory),             │
│                     记忆UI(MemoryManagerUI),              │
│                     STscript引擎(GameAdapter)             │
│  ⑥ worldinfo.js  → 世界书系统(WorldInfo)                 │
│  ⑦ systems.js    → 任务系统(QuestSystem),                │
│                     成就系统(AchievementSystem)            │
│  ⑧ phone-ui.js   → 日志/论坛/手机/朋友圈/商店等UI模块     │
│  ⑨ init.js       → 应用初始化入口(initApp)               │
│  ⑩ patch.js      → STscript Hook + 安全修复补丁           │
├─────────────────────────────────────────────────────────┤
│  cloudflare-worker-proxy.js → API代理(可选部署)           │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 文件结构与职责

```
free-script/
├── index.html                    # 单页应用入口，包含所有DOM结构和SVG图标
├── css/
│   ├── base.css                  # CSS变量、主题、基础布局、打字机效果
│   ├── pages.css                 # 各页面(剧情/角色/回顾/日志/记忆)样式
│   ├── menu.css                  # 侧边菜单、模态框、设置面板样式
│   ├── systems.css               # 任务系统、成就系统样式
│   └── phone-ui.css              # 手机UI、论坛、朋友圈、商店等样式
├── js/
│   ├── utils.js                  # 基础工具库(第0层加载)
│   ├── core.js                   # 全局状态与AI核心(第1-3层)
│   ├── game.js                   # 游戏逻辑与剧情引擎(第4-6层)
│   ├── modules.js                # 预设/正则/宏引擎(第7-9层)
│   ├── tavern-compat.js          # 酒馆兼容层与记忆系统(第10-12层)
│   ├── worldinfo.js              # 世界书系统(第13层)
│   ├── systems.js                # 任务与成就系统(第14层)
│   ├── phone-ui.js               # 日志/论坛/手机模块(第15层)
│   ├── init.js                   # 应用初始化(第16层)
│   └── patch.js                  # STscript集成Hook + 安全补丁(最后加载)
├── cloudflare-worker-proxy.js    # Cloudflare Worker API代理脚本
├── .github/workflows/deploy.yml  # GitHub Pages 自动部署
└── .trae/rules/project_rules.md  # 项目规则文档
```

---

## 4. 核心模块详解

### 4.1 core.js - 全局状态与AI核心

**文件大小：** ~3000行 | **加载层级：** 第1-3层

这是项目最大的核心文件，包含游戏引擎的基础设施。

#### 关键对象与函数

| 名称 | 类型 | 说明 |
|------|------|------|
| `GameLinker` | 对象 | 统一联动系统，数据变更广播与页面联动刷新 |
| `UI` | 对象 | UI工具集(toast/showPage/showModal/confirm/prompt) |
| `LocalGameAPI` | 对象 | API配置管理，多端点轮换，连接测试，模型列表获取 |
| `SaveDB` | 对象 | IndexedDB存档层，带localStorage fallback和自动迁移 |
| `THEME_LIBRARY` | 常量 | 题材库数据(修仙/宫斗/末日/娱乐圈等18种题材) |
| `gameState` | 全局变量 | 游戏全局状态对象，由`createDefaultGameState()`创建 |
| `TypewriterBuffer` | 对象 | 打字机缓冲系统v2，段落级渲染节流+标点智能停顿 |
| `GameTimeSystem` | 对象 | 游戏内时间系统，从AI回复的JSON中解析时间字段 |
| `callAI()` | 异步函数 | AI调用核心函数，支持流式/非流式，参数过滤，错误处理 |
| `parseAIResponse()` | 函数 | AI回复解析，JSON容错+状态机兜底+小剧场融合 |
| `safeJSONParse()` | 函数 | 超强JSON容错解析(状态机) |
| `translateError()` | 函数 | API错误信息中文翻译(100+映射) |
| `initializeGame()` | 函数 | 游戏初始化入口，构建系统提示词并发送开局请求 |
| `autoSave()` | 异步函数 | 自动保存(2秒防抖) |

#### LocalGameAPI 详解

```
LocalGameAPI
├── _configs[]          # 5个API配置槽位(baseUrl/apiKey/model)
├── _currentSlot        # 当前使用的配置槽位
├── _autoRotate         # 是否自动轮换
├── _requestLog[]       # 请求日志(最近50条)
├── _failedModels{}     # 失败模型记录(24h过期)
├── init()              # 从localStorage加载配置
├── save()              # 保存到localStorage
├── tryWithFallback()   # 带重试的API调用(指数退避+轮换)
├── checkConnectivity() # 连接测试(8秒超时)
├── fetchModels()       # 获取模型列表
├── testConnection()    # 测试单个配置
├── buildApiUrl()       # 构建API URL(支持代理)
└── getProxyUrl()       # 获取代理URL
```

#### TypewriterBuffer 详解

打字机效果渲染系统，支持：
- 段落级渲染节流（换行时完成当前段落）
- 标点智能停顿（句号120ms，逗号50ms等）
- 页面不可见时自动暂停
- 脏检查避免无变化重绘

---

### 4.2 game.js - 游戏逻辑与剧情引擎

**文件大小：** ~4700行 | **加载层级：** 第4-6层

#### 关键函数

| 函数 | 说明 |
|------|------|
| `detectWorldTheme()` | 检测世界观主题(xianxia/ancient/wasteland/fantasy/modern/other) |
| `getWorldTerms()` | 根据主题返回术语映射(如修仙:商店→灵宝阁) |
| `buildSystemPrompt()` | 构建系统提示词(含世界观术语+格式规则+小剧场标签) |
| `buildRecentChatContext()` | 构建最近聊天上下文(用于上下文压缩) |
| `buildProtagonistPrompt()` | 构建主角设定提示词 |
| `injectPresetGlobalVars()` | 注入预设全局变量 |
| `applyLengthPreset()` | 应用字数/段落预设 |
| `updateTokenCount()` | 更新token计数 |
| `estimateTokens()` | Token估算(1.7字符/token) |
| `onStreamChunk()` | 流式输出chunk处理 |
| `renderStory()` | 渲染剧情文本(含思维链折叠) |
| `formatStory()` | 格式化剧情(加粗/斜体/分割线/思维链) |
| `renderHUD()` | 渲染HUD面板 |
| `renderChoices()` | 渲染选项按钮 |
| `mergeCharacters()` | 合并AI返回的角色数据到allCharacters |
| `buildSaveData()` | 构建存档数据 |
| `safeLoadSlot()` | 加载存档 |
| `sendNpcChat()` | 发送NPC聊天消息 |
| `openNpcChat()` | 打开NPC聊天界面 |
| `renderNpcPage()` | 渲染NPC页面 |
| `exportAsNovel()` | 导出为小说文本 |

#### 系统提示词构建流程

```
buildSystemPrompt()
  ├── 世界观术语提示 (buildWorldTermsPrompt)
  ├── 角色卡信息 (charName/charDesc/charPersonality)
  ├── 世界书注入 (WorldInfo.buildInjection)
  ├── 记忆注入 (EnhancedMemory.buildSmartInjection)
  ├── 预设全局变量 (injectPresetGlobalVars)
  ├── 深度提示词 (gameState._depthPrompts)
  ├── 位置提示词 (gameState._positionPrompts)
  ├── 小剧场标签说明
  ├── 格式规则 (JSON结构要求)
  └── 字数/段落要求 (wordCountConfig)
```

---

### 4.3 modules.js - 预设/正则/宏引擎

**文件大小：** ~3400行 | **加载层级：** 第7-9层

#### SmartConfigEngine

从预设的"使用须知"中自动提取配置（API设置、模型推荐、正则要求等）。

#### PresetManager

预设管理核心，支持 SillyTavern 预设格式。

```
PresetManager
├── presets[]            # 预设列表
├── currentPresetIndex   # 当前预设索引
├── init()               # 初始化，加载预设
├── loadPreset()         # 加载预设
├── importPreset()       # 导入预设(JSON)
├── getParams()          # 获取当前预设的采样参数
├── updateSetupPresetDisplay() # 更新创建页面的预设显示
└── getPromptMessages()  # 获取预设的提示词消息列表
```

#### RegexManager

正则脚本引擎，支持全局正则和预设绑定正则。

```
RegexManager
├── globalScripts[]      # 全局正则脚本
├── presetScripts[]      # 预设绑定正则脚本
├── init()               # 初始化
├── applyToOutput()      # 应用正则到AI输出
├── applyToInput()       # 应用正则到用户输入
├── addScript()          # 添加正则脚本
├── removeScript()       # 删除正则脚本
└── importFromPreset()   # 从预设导入正则
```

**安全特性：** ReDoS 防护（嵌套量词检测）、正则长度限制

#### MacroEngine

宏引擎，支持 SillyTavern 宏语法。

```
MacroEngine
├── process(text)        # 处理文本中的宏
├── setVar()             # 设置变量
├── getVar()             # 获取变量
├── setLocalVar()        # 设置局部变量
├── getTheaterContent()  # 获取小剧场内容
└── parseTheaterContent() # 解析小剧场内容
```

---

### 4.4 tavern-compat.js - 酒馆兼容层与记忆系统

**文件大小：** ~6100行 | **加载层级：** 第10-12层

#### TavernHelperCompat

SillyTavern 助手兼容层，提供 `getContext()` 等酒馆 API。

```
TavernHelperCompat
├── getContext()         # 获取与酒馆一致的上下文对象
├── emit()               # 触发事件
├── on()                 # 监听事件
├── send()               # 发送消息
├── slashCommand()       # 执行斜杠命令
└── _quickReplies[]      # 快速回复列表
```

#### EnhancedMemory

三层记忆系统，核心方法 `buildSmartInjection()` 负责构建注入给 AI 的记忆内容。

```
EnhancedMemory
├── shortTermMemory      # 短期记忆(最近N轮摘要)
│   └── summaries[]      # [{turn, storySummary, timestamp}]
├── longTermMemory       # 长期记忆(关键事件/角色关系)
│   ├── keyEvents[]      # 关键事件
│   └── characterNotes{} # 角色笔记
├── permanentFacts[]     # 永久事实区(核心设定/世界规则)
├── maxRounds            # 短期记忆最大轮数
├── buildSmartInjection() # 构建注入文本(永久→约定→角色→事件→大纲→原文)
├── addFact()            # 添加永久事实
├── removeFact()         # 删除永久事实
├── syncWorldInfoEntry() # 同步世界书条目到永久事实区
├── removeWorldAnchorsBySource() # 按来源删除永久事实
├── saveToStorage()      # 保存到localStorage
└── loadFromStorage()    # 从localStorage加载
```

**注入顺序（`buildSmartInjection`）：**
1. 永久事实（permanentFacts）
2. 约定/角色设定
3. 角色笔记
4. 关键事件
5. 大纲/摘要
6. 原文片段

#### MemoryManagerUI

记忆管理编辑面板，提供可视化编辑永久事实、短期记忆、长期记忆的界面。

#### GameAdapter (STscript引擎)

STscript 兼容引擎，支持果实/月读/蛾摩拉等预设格式。

```
GameAdapter
├── init()               # 初始化
├── onPresetLoaded()     # 预设加载回调
├── processResponse()    # 处理AI回复(正则/小剧场)
├── processUserInput()   # 处理用户输入
├── setCharacter()       # 设置角色信息
├── updateContext()      # 更新上下文
└── parse()              # 解析STscript指令
```

#### PresetConfigManager

预设配置管理器，检测预设类型（月读/果实/蛾摩拉）并验证兼容性。

---

### 4.5 worldinfo.js - 世界书系统

**文件大小：** ~2100行 | **加载层级：** 第13层

完全兼容 SillyTavern 世界书格式（v1/v2），包含扫描引擎和注入引擎。

```
WorldInfo
├── books[]              # 世界书列表
│   └── {id, name, enabled, entries{}}
├── settings             # 全局设置
│   ├── scanDepth: 2     # 扫描深度(最近N条消息)
│   ├── tokenBudget: 25  # Token预算(百分比)
│   ├── tokenBudgetCap: 0 # Token预算硬上限
│   └── recursive: true  # 是否递归扫描
├── init()               # 初始化
├── scan()               # 扫描引擎(关键词匹配+triggers+递归)
├── buildInjection()     # 注入引擎(按position分组)
├── buildInjectionGrouped() # 结构化注入(返回分组对象)
├── importFromFile()     # 导入(JSON/PNG角色卡)
├── exportFile()         # 导出
├── convertEntry()       # 条目格式转换(v1/v2→统一格式)
├── matchKeys()          # 关键词匹配(任一匹配)
├── matchKeysAll()       # 关键词匹配(全部匹配)
├── matchTriggers()      # Triggers正则匹配
├── recursiveScan()      # 递归扫描
├── applyInclusionGroups() # 包含组逻辑(同组只选一个)
├── applyBudget()        # Token预算控制(按priority排序)
└── _harvestAllEntriesToMemory() # 收割条目到永久事实区
```

#### 扫描引擎流程

```
scan(chatMessages)
  ├── 1. 构建扫描文本(最近scanDepth条消息,带角色名前缀\x01)
  ├── 2. 遍历所有已启用书的条目
  │   ├── 常驻条目(constant) → 直接激活
  │   ├── delay检查 → 跳过未到轮次的条目
  │   ├── cooldown检查 → 跳过冷却中的条目
  │   ├── 概率检查 → 按probability随机
  │   ├── triggers正则匹配 → 优先级高于关键词
  │   ├── 主关键词匹配(支持正则/全词/大小写)
  │   ├── 角色卡字段匹配(可选)
  │   └── 选择性逻辑(AND_ANY/NOT_ALL/NOT_ANY/AND_ALL)
  ├── 3. 递归扫描(最多3步)
  ├── 4. 包含组逻辑(同组按权重随机选一个)
  ├── 5. 按order排序
  └── 6. Token预算控制(按priority优先级)
```

#### 注入引擎 Position 枚举

| 值 | 名称 | 说明 |
|----|------|------|
| 0 | BEFORE_CHAR | 角色定义之前 |
| 1 | AFTER_CHAR | 角色定义之后 |
| 2 | EM_TOP | 示例消息之前 |
| 3 | EM_BOTTOM | 示例消息之后 |
| 4 | AN_TOP | 作者备注顶部 |
| 5 | AN_BOTTOM | 作者备注底部 |
| 6 | AT_DEPTH | 指定深度注入 |
| 7 | OUTLET | 出口/自定义位置 |

---

### 4.6 systems.js - 任务与成就系统

**文件大小：** ~670行 | **加载层级：** 第14层

#### QuestSystem

```
QuestSystem
├── STATUS               # 状态枚举(进行中/已完成/失败/已放弃)
├── TYPE                 # 类型枚举(主线/支线/隐藏)
├── getAllQuests()        # 获取所有任务(含自动生成的引导任务)
├── filterByType()       # 按类型筛选
├── filterByStatus()     # 按状态筛选
├── renderQuestPage()    # 渲染任务页面
├── renderTracker()      # 渲染任务追踪器(剧情页浮层)
└── toggleTracker()      # 折叠/展开追踪器
```

#### AchievementSystem

```
AchievementSystem
├── RARITY               # 稀有度枚举(普通/稀有/史诗/传说)
├── CATEGORY             # 分类枚举(剧情/探索/社交/战斗/收集/特殊)
├── getDefaultAchievements() # 从AI返回的世界模块中提取成就
├── checkAchievements()  # 检查并解锁成就
├── showUnlockToast()    # 显示解锁提示
├── renderAchievePage()  # 渲染成就页面
└── showAchieveDetail()  # 显示成就详情弹窗
```

---

### 4.7 phone-ui.js - 日志/论坛/手机模块

**文件大小：** ~5700行 | **加载层级：** 第15层

这是UI渲染最密集的模块，包含所有"手机功能"页面的渲染逻辑。

#### 核心渲染函数

| 函数 | 说明 |
|------|------|
| `renderLogPage()` | 渲染日志主页(通知+模块列表) |
| `renderForumPage()` | 渲染论坛页面(热门/话题/我的) |
| `renderMomentsPage()` | 渲染朋友圈页面 |
| `renderMailPage()` | 渲染邮件页面 |
| `renderShopPage()` | 渲染商店页面 |
| `renderItemsPage()` | 渲染物品/背包页面 |
| `renderDiaryPage()` | 渲染日记页面 |
| `renderCalendarPage()` | 渲染日程页面 |
| `renderRankPage()` | 渲染排行榜页面 |
| `renderAuthorNotePage()` | 渲染作者有话说页面 |
| `renderPlayerPage()` | 渲染玩家属性页面 |
| `renderRecapPage()` | 渲染回顾页面 |
| `renderNpcPage()` | 渲染NPC列表页面 |
| `renderWorldPage()` | 渲染世界信息页面 |
| `renderQuestsPage()` | 渲染任务页面 |
| `renderAchievePage()` | 渲染成就页面 |

#### 论坛交互函数

| 函数 | 说明 |
|------|------|
| `showForumHot()` | 显示热门帖子 |
| `openForumPost()` | 打开帖子详情 |
| `sendForumComment()` | 发送评论 |
| `replyToForumComment()` | 回复评论 |
| `requestForumNpcReplies()` | 请求NPC回复(调用AI) |
| `spawnForumPostAboutPlayer()` | 生成关于玩家的帖子 |

#### PresetAppManager

预设应用管理器，管理预设中定义的自定义手机应用。

#### 通知系统

| 函数 | 说明 |
|------|------|
| `computeNotificationCounts()` | 计算各模块通知数 |
| `refreshNotificationBadge()` | 刷新通知角标 |
| `openNotificationCenter()` | 打开通知中心 |

---

### 4.8 utils.js - 工具函数库

**文件大小：** ~270行 | **加载层级：** 第0层(最先加载)

| 名称 | 类型 | 说明 |
|------|------|------|
| `DOMCache` | 对象 | DOM元素缓存(30秒过期+永久缓存) |
| `Logger` | 对象 | 日志管理(DEBUG/INFO/WARN/ERROR级别) |
| `TimerManager` | 对象 | 定时器管理(统一ID管理,防止泄漏) |
| `GlobalCleanup` | 对象 | 全局清理(事件监听器注册+统一清理) |
| `StorageMonitor` | 对象 | 存储监控(容量检查/满载警告/清理建议) |
| `ThemeManager` | 对象 | 主题管理(暗色/亮色切换+系统偏好跟随) |
| `truncateByChars()` | 函数 | CJK安全的按字截断(Array.from按code point切) |
| `estimateTokensUtil()` | 函数 | Token估算(1.7字符/token) |
| `safeSetItem()` | 函数 | 安全localStorage写入(容量检查+QuotaExceeded处理) |
| `safeGetItem()` | 函数 | 安全localStorage读取 |
| `debounce()` | 函数 | 防抖 |
| `throttle()` | 函数 | 节流 |
| `safeExecute()` | 函数 | 安全执行(try-catch包装) |
| `sanitizeHTML()` | 函数 | HTML净化(XSS防护) |

---

### 4.9 init.js - 应用初始化

**文件大小：** ~74行 | **加载层级：** 第16层

#### `initApp()` 初始化流程

```
initApp()
  ├── 防止重复初始化检查
  ├── ThemeManager.init()          # 初始化主题
  ├── WorldInfo.init()             # 初始化世界书
  ├── PresetManager.init()         # 初始化预设管理
  ├── RegexManager.init()          # 初始化正则引擎
  ├── MacroEngine.init()           # 初始化宏引擎
  ├── TavernHelperCompat.init()    # 初始化酒馆兼容层
  ├── SaveDB.init() + migrate()    # 初始化IndexedDB + 迁移
  ├── loadGameSettings()           # 加载游戏设置
  ├── PresetManager.updateSetupPresetDisplay() # 更新预设显示
  ├── LocalGameAPI.init()          # 初始化API配置
  ├── renderMenu()                 # 渲染菜单
  ├── bindEvents()                 # 绑定事件
  └── TavernHelperCompat.emit('APP_READY') # 触发就绪事件
```

---

### 4.10 patch.js - 补丁与STscript集成

**文件大小：** ~420行 | **加载层级：** 最后加载

#### STscript集成Hook

通过猴子补丁(Monkey Patch)方式增强现有功能：

| Hook | 目标 | 说明 |
|------|------|------|
| Hook 1 | `PresetManager.loadPreset` | 预设加载后激活STscript引擎+清除变量缓存 |
| Hook 3 | `injectPresetGlobalVars` | 全局变量注入时处理STscript变量(带缓存) |
| Hook 6 | `RegexManager.applyToOutput` | 增强正则支持月读/蛾摩拉格式 |
| Hook 7 | `PresetManager.importPreset` | 预设导入时自动标准化格式 |

#### 安全修复补丁

- 内存泄漏修复（TimerManager增强）
- 安全状态访问工具（StateUtils）
- 防抖/节流工具
- 全局错误处理增强
- 移动端触摸优化（防双击缩放）
- 关键对象存在性检查

---

## 5. 数据流与依赖关系

### 模块依赖图

```
utils.js (无依赖)
    ↓
core.js (依赖: utils.js)
    ↓
game.js (依赖: utils.js, core.js)
    ↓
modules.js (依赖: utils.js, core.js, game.js)
    ↓
tavern-compat.js (依赖: utils.js, core.js, game.js, modules.js)
    ↓
worldinfo.js (依赖: utils.js, core.js, tavern-compat.js)
    ↓
systems.js (依赖: utils.js, core.js)
    ↓
phone-ui.js (依赖: utils.js, core.js, game.js, modules.js, systems.js)
    ↓
init.js (依赖: 所有上述模块)
    ↓
patch.js (依赖: 所有上述模块)
```

### 用户操作 → 数据流

```
用户输入行动/选择选项
    ↓
sendAIRequest()                    # 构建消息列表
    ├── buildSystemPrompt()        # 构建系统提示词
    │   ├── WorldInfo.buildInjection()  # 世界书注入
    │   ├── EnhancedMemory.buildSmartInjection() # 记忆注入
    │   └── injectPresetGlobalVars()    # 预设变量注入
    ├── RegexManager.applyToInput() # 正则处理用户输入
    ↓
callAI(messages, {stream: true})   # 调用AI API
    ├── LocalGameAPI.tryWithFallback() # 多端点轮换
    ↓
onStreamChunk()                    # 流式输出处理
    ├── TypewriterBuffer.push()    # 打字机缓冲
    ↓
parseAIResponse()                  # 解析AI回复
    ├── safeJSONParse()            # JSON容错解析
    ├── robustParse()              # 状态机兜底
    ├── injectTheaterToLogs()      # 小剧场融合
    ├── _bridgeBranchesToChoices() # 选项桥接
    ├── _bridgeSummaryToMemory()   # 摘要桥接
    ├── _bridgeStatusToCharacters() # 状态桥接
    └── _bridgeProfileToRelationships() # 关系桥接
    ↓
renderStory() + formatStory()      # 渲染剧情
    ├── RegexManager.applyToOutput() # 正则处理输出
    ↓
mergeCharacters()                  # 合并角色数据
mergeQuests()                      # 合并任务
mergeRelationships()               # 合并关系
    ↓
GameLinker.refreshByDataChange()   # 联动刷新
    ↓
autoSave()                         # 自动保存
```

---

## 6. 关键数据结构

### gameState (全局状态)

```javascript
gameState = {
    _version: '1.2.0',              // 版本号
    userPrompt: '',                  // 用户初始提示
    customStyle: '',                 // 自定义写作风格
    systemPrompt: '',                // 系统提示词
    conversationHistory: [],         // 对话历史 [{role, content}]
    allCharacters: {},               // 所有角色 {name: {name, desc, ...}}
    temperature: 0.8,                // 采样温度
    fontSize: 16,                    // 字体大小
    pinnedModules: {},               // 固定模块
    rollingSummary: '',              // 滚动摘要
    autoCompress: true,              // 自动压缩
    tokenCount: 0,                   // 当前token数
    maxTokens: 80000,               // 最大token数
    useStream: true,                 // 使用流式输出
    generateChoices: true,           // 生成选项
    keyEvents: [],                   // 关键事件
    worldSnapshot: {},               // 世界快照
    currentQuests: [],               // 当前任务
    relationships: [],               // 关系列表
    currentBag: [],                  // 背包物品
    playerData: null,                // 玩家数据
    favStories: [],                  // 收藏故事
    gameTime: {date, time, period, weather, era}, // 游戏时间
    _stats: {startTime, totalTurns, totalTokens, ...}, // 统计
    _undoHistory: [],                // 撤销历史
    wordCountConfig: {enabled, min, max, ...}, // 字数配置
    _worldModules: [],               // 世界模块(论坛/商店/邮件等)
    _chatLogs: {},                   // NPC聊天记录
    _chattedNpcs: {},                // 已聊天NPC
    _theaterContent: {},             // 小剧场内容
    _depthPrompts: {},               // 深度提示词
    _positionPrompts: {},            // 位置提示词
    _afterChatPrompts: [],           // 聊天后提示词
    _wiCachedResult: null,           // 世界书缓存
    _moments: [],                    // 朋友圈
    _npcDiaries: {},                 // NPC日记
    _mail: [],                       // 邮件
    _diary: [],                      // 日记
    _presetApps: {},                 // 预设应用
    protagonistSetup: {},            // 主角设定
    _jailbreakPrompt: '',            // 越狱提示词
    _assistantPrompt: '',            // 助手提示词
    _lastAIReply: null,              // 上次AI回复
};
```

### 世界书条目结构

```javascript
entry = {
    uid: Number,                     // 唯一ID
    key: [],                         // 主关键词数组
    keysecondary: [],                // 次要关键词数组
    comment: '',                     // 注释/标题
    content: '',                     // 内容
    constant: Boolean,               // 是否常驻
    selective: Boolean,              // 是否选择性激活
    enabled: Boolean,                // 是否启用
    order: Number,                   // 排序(默认100)
    probability: Number,             // 激活概率(0-100)
    position: Number,                // 注入位置(0-7)
    role: Number,                    // 消息角色(0=system,1=user,2=assistant)
    depth: Number,                   // 深度(默认4)
    scanDepth: Number|null,          // 条目级扫描深度
    group: '',                       // 包含组名
    groupWeight: Number,             // 组权重(默认100)
    sticky: Number|null,             // 粘性轮数
    cooldown: Number|null,           // 冷却轮数
    delay: Number|null,              // 延迟轮数
    triggers: [],                    // 正则触发器数组
    excludeRecursion: Boolean,       // 排除递归
    preventRecursion: Boolean,       // 阻止递归
    selectiveLogic: Number,          // 选择性逻辑(0-3)
    ignoreBudget: Boolean,           // 忽略预算
    addMemo: Boolean,                // 添加注释前缀
    caseSensitive: Boolean|null,     // 大小写敏感
    matchWholeWords: Boolean|null,   // 全词匹配
    priority: Number,                // 优先级(默认10)
    vectorized: Boolean,             // 是否向量化
    // ... 更多V2 Spec字段
};
```

---

## 7. API调用流程

```
用户发送消息
    ↓
sendAIRequest(userText, isInit)
    ├── 1. 构建完整消息列表
    │   ├── system prompt (buildSystemPrompt)
    │   ├── 世界书注入内容
    │   ├── 记忆注入内容
    │   ├── 预设提示词
    │   └── 对话历史
    ├── 2. Token检查与自动压缩
    ├── 3. 保存撤销状态
    ├── 4. 调用 callAI(messages, {stream: true})
    │   ├── LocalGameAPI.tryWithFallback()
    │   │   ├── 非轮换模式: 直接用当前配置
    │   │   └── 轮换模式: 遍历所有配置
    │   │       ├── 跳过不完整配置
    │   │       ├── 跳过24h内失败模型
    │   │       ├── retryRequest() (最多3次,指数退避)
    │   │       ├── 成功 → 更新currentSlot
    │   │       └── 失败 → 标记模型失败,尝试下一个
    │   └── fetch请求
    │       ├── 流式: SSE解析 + onChunk回调
    │       └── 非流式: JSON解析
    ├── 5. 解析AI回复 (parseAIResponse)
    ├── 6. 更新游戏状态
    ├── 7. 渲染UI
    └── 8. 自动保存
```

---

## 8. 世界书扫描与注入

### 扫描触发时机

每次调用 `sendAIRequest()` 时，`buildSystemPrompt()` 会调用 `WorldInfo.buildInjection()`，触发扫描引擎。

### 注入位置处理

```
buildInjectionGrouped(chatMessages)
    ├── scan(chatMessages) → 获取激活条目
    ├── 按position分组
    │   ├── beforeChar[]  → 注入到角色定义之前
    │   ├── afterChar[]   → 注入到角色定义之后
    │   ├── emTop[]       → 注入到示例消息之前
    │   ├── emBottom[]    → 注入到示例消息之后
    │   ├── anTop[]       → 注入到作者备注顶部
    │   ├── anBottom[]    → 注入到作者备注底部
    │   ├── atDepth[]     → 存入gameState._depthPrompts
    │   └── outlet[]      → 存入MacroEngine变量
    └── 宏处理 (MacroEngine.process)
```

---

## 9. 记忆系统架构

```
EnhancedMemory
├── 短期记忆 (shortTermMemory)
│   └── summaries[]     # 最近N轮的摘要
│       └── {turn, storySummary, timestamp, source}
│
├── 长期记忆 (longTermMemory)
│   ├── keyEvents[]     # 关键事件列表
│   └── characterNotes{} # 角色笔记 {name: note}
│
└── 永久事实区 (permanentFacts[])
    └── {content, source, timestamp, priority}
        # source: 'worldInfo:bookId:uid' | 'user' | 'preset_meow_FM'
```

### 记忆与世界书联动

- 世界书条目保存时 → `EnhancedMemory.syncWorldInfoEntry()` 同步到永久事实区
- 世界书条目删除时 → `EnhancedMemory.removeWorldAnchorsBySource()` 清理对应事实
- 世界书初始化时 → `_harvestAllEntriesToMemory()` 一次性收割已有条目
- 预设摘要 → `_bridgeSummaryToMemory()` 桥接到短期记忆

---

## 10. 部署与运行

### 本地运行

项目是纯前端静态站点，无需构建步骤：

```bash
# 方式1: 直接打开
open index.html

# 方式2: 本地HTTP服务器
python3 -m http.server 8000
# 访问 http://localhost:8000
```

### GitHub Pages 部署

通过 `.github/workflows/deploy.yml` 自动部署：

1. **触发条件：** push 到 `master` 分支
2. **构建步骤：**
   - 注入构建版本号和时间戳到 `index.html`
   - 为所有 JS/CSS 资源添加缓存破坏查询参数 `?v=<version>`
3. **部署：** 使用 GitHub Pages Action 部署

### 代码修改后部署流程

```bash
git add <改动的文件>
git commit -m "描述"
git checkout master && git merge <当前分支> --no-edit
git push origin master
# 等待 GitHub Actions 部署完成(约1-2分钟)
```

### Cloudflare Worker 代理（可选）

`cloudflare-worker-proxy.js` 提供跨域API代理：

1. 注册 Cloudflare 账号
2. 创建 Worker，粘贴代码
3. 在游戏 API 设置中填入 Worker URL 作为代理地址

---

## 11. CSS架构

| 文件 | 职责 |
|------|------|
| `base.css` | CSS变量定义(`--primary`, `--bg`, `--text-*`等)、暗色主题(`[data-theme="dark"]`)、基础布局、打字机效果、加载动画、Toast样式 |
| `pages.css` | 各页面样式(剧情页/角色页/回顾页/日志页/记忆页)、选项按钮、NPC聊天、HUD面板 |
| `menu.css` | 侧边菜单、模态框、设置面板、API配置面板、存档管理 |
| `systems.css` | 任务卡片、成就页面、进度条、稀有度颜色 |
| `phone-ui.css` | 手机UI框架、论坛帖子、朋友圈、商店、邮件、日记、排行榜 |

### 主题系统

```css
/* 亮色主题(默认) */
:root { --primary: #1a73e8; --bg: #f5f5f5; ... }

/* 暗色主题 */
[data-theme="dark"] { --primary: #8ab4f8; --bg: #1a1a2e; ... }
```

通过 `ThemeManager.toggle()` 切换，状态保存在 `localStorage.freeScript_theme`。

---

## 附录：小剧场融合系统类型映射

AI 回复中的小剧场标签会自动映射到对应的日志模块：

| 小剧场标签 | 映射模块类型 | 说明 |
|-----------|------------|------|
| 论坛之愿/论坛/八卦 | `comments` | 论坛帖子 |
| 群聊之愿/群聊之塔 | `chat` | 群聊记录 |
| 日程之愿/日程表 | `calendar` | 日程 |
| 通知之愿 | `mail` | 系统邮件 |
| 购物之愿 | `shop` | 商店 |
| 每日之愿/日常剧场 | `moments` | 朋友圈 |
| 桌面之愿 | `cards` | 物品卡片 |
| 后台人生 | `diary` | 日记 |
| 小夜单人状态/状态面板 | `status` | 角色状态(桥接到NPC系统) |
| meow_FM/摘要 | `summary` | 摘要(桥接到记忆系统) |
| branches/选项分支 | `branches` | 选项(桥接到选项系统) |
| echo/物品 | `cards` | 物品 |
| ccd/文字剧场 | `theater` | 文字剧场 |
| 角色手机/手机 | `phone` | 手机模块 |
| 角色/角色关系 | `text` | 角色关系(桥接到关系系统) |
| 蛾摩拉 | `author_note` | 作者有话说 |
| 恋爱/涩涩/游戏/同人/平行/美食/广告/回忆/哀伤/幸福/盲盒 之塔/愿 | `theater`/`moments`/`cards` | 各类塔/愿剧场 |
