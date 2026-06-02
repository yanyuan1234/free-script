# 01 · 项目总览

## 1.1 项目定位

* **名称**：自由剧本 / FREE SCRIPT
* **形态**：纯前端单页 Web 应用（HTML + JS + CSS，零后端）
* **目标用户**：喜欢 AI 角色扮演 / 文字冒险的玩家
* **设计哲学**：
  * 「**把 SillyTavern 预设 + 世界书的整套生态搬到浏览器**」，但自带剧本世界观、记忆、NPC、任务等游戏层
  * 「**打开 HTML 就能玩**」，无构建步骤、无 Node 依赖
  * UI 采用「**极简手机桌面 + 米白色调**」，弱化工具感、强化沉浸感

## 1.2 技术栈

| 层 | 选型 |
| --- | --- |
| 视图 | 原生 HTML5 + CSS3（自定义变量 + Grid/Flex） |
| 脚本 | 原生 ES2017+ JS（`<script>` 顺序加载，无打包） |
| 字体 | Google Fonts `Noto Serif SC` |
| 图标 | 内联 SVG `<symbol>` |
| 持久化 | `localStorage`（5–10 MB 自适应）+ `IndexedDB`（存档，含 `localStorage` 兜底） |
| 网络 | `fetch` 调用 OpenAI 兼容 Chat Completions（支持流式 SSE） |
| 部署 | GitHub Pages（`.github/workflows/deploy.yml`） |

> **没有引入任何 npm 依赖**，所有第三方能力（SillyTavern 兼容、宏引擎、预设解析）都是本仓库自研实现。

## 1.3 目录结构

```
/workspace
├── index.html                       # 单页应用入口（≈ 2545 行，含完整 UI 与 SVG icons）
├── cloudflare-worker-proxy.js       # 可选的 CORS 反代 Worker（独立部署）
├── .github/
│   └── workflows/
│       └── deploy.yml               # GitHub Pages 自动部署
├── css/                             # 样式（按页面/主题拆分）
│   ├── base.css                     # 变量、Reset、原子类、深色主题、响应式断点
│   ├── menu.css                     # 主页 / 顶部卡 / 预设卡 / 底部三大按钮
│   ├── pages.css                    # 剧情页 / 心声系统 / 章节标题 / NPC 卡
│   ├── phone-ui.css                 # 手机壳内页：聊天、朋友圈、邮件、商店、日记…
│   └── systems.css                  # 任务 / 成就 页面样式
├── js/                              # 全部业务逻辑（顺序加载，见下表）
│   ├── utils.js                     # 基础设施：DOM 缓存、日志、定时器、主题、JSON 容错
│   ├── core.js                      # 全局状态、UI 工具、API、存档、世界书模板、JSON 解析
│   ├── worldinfo.js                 # 世界书/Lorebook 系统（CRUD + 注入引擎）
│   ├── modules.js                   # 智能配置、预设管理、正则管理、宏引擎
│   ├── game.js                      # 核心游戏流程：AI 请求、渲染、存档、NPC、UI 渲染
│   ├── phone-ui.js                  # 手机壳：论坛、朋友圈、邮件、商店、日记、回顾、设置、API 配置
│   ├── systems.js                   # 任务系统、成就系统
│   ├── tavern-compat.js             # 酒馆助手兼容层、STscript 适配、增强记忆、记忆 UI
│   ├── init.js                      # 启动入口
│   └── patch.js                     # STscript 集成 Hook + 安全补丁 v3.0
└── wiki/                            # 本文档
```

### 1.3.1 脚本加载顺序

`index.html` 底部按以下顺序加载（依赖关系决定）：

```html
<script src="js/utils.js"></script>   <!-- 基础设施（TimerManager、Logger、StorageMonitor、ThemeManager） -->
<script src="js/core.js"></script>    <!-- UI、LocalGameAPI、SaveDB、gameState、TypewriterBuffer -->
<script src="js/worldinfo.js"></script>
<script src="js/modules.js"></script>  <!-- SmartConfigEngine、PresetManager、RegexManager、MacroEngine -->
<script src="js/game.js"></script>    <!-- 核心：sendAIRequest、renderStory、存档、NPC -->
<script src="js/phone-ui.js"></script>
<script src="js/systems.js"></script>
<script src="js/tavern-compat.js"></script>
<script src="js/init.js"></script>    <!-- initApp() 启动入口 -->
<script src="js/patch.js"></script>   <!-- STscript Hook + 安全补丁 -->
```

`utils.js` 单独在 `<head>` 提前加载，保证 `TimerManager`、`Logger` 在所有模块使用前可用。

## 1.4 入口与启动流程

1. 浏览器加载 `index.html`，`<head>` 同步载入 `utils.js`（提供全局对象）。
2. HTML 主体渲染完 10 个页面（菜单、世界创建、加载、剧情、玩家、NPC、回顾、日志、结局、记忆）。
3. `init.js` 末尾的 `initApp()` 触发：
   ```
   ThemeManager.init()        → 主题（深/浅色）
   WorldInfo.init()           → 加载世界书
   PresetManager.init()       → 加载预设
   RegexManager.init()        → 加载正则
   MacroEngine.init()         → 初始化宏
   SaveDB.init() / migrate()  → 打开 IndexedDB
   loadGameSettings()         → 读取游戏设置
   LocalGameAPI.init()        → 读取 API 槽位
   renderMenu() / bindEvents()
   TavernHelperCompat.emit('APP_READY')
   ```
4. 用户点击「开始创造你的故事」→ 填写题材 + 主角 → `PresetManager.showModal()` 选预设 → 进入「创造世界」→ AI 初始化 → 跳转到 `storyPage`。
5. `sendAIRequest(userMessage, isInit=true)` 触发首轮 AI 请求，流式 chunk 走 `onStreamChunk → extractStoryStreaming → TypewriterBuffer.push`，最终 `parseAIResponse` 解 JSON 并渲染全部子系统（任务/角色/世界模块/…）。

## 1.5 数据存储一览

| Key | 用途 | 引擎 |
| --- | --- | --- |
| `freeScript_theme` | 当前主题 | localStorage |
| `free_script_api_config` | API 槽位、分组、失败记录 | localStorage |
| `freeScript_apiPresets` | 预设列表 | localStorage |
| `freeScript_currentParams` | 当前推理参数（temperature/top_p/…） | localStorage |
| `freeScript_regexScripts` | 全局正则脚本 | localStorage |
| `freeScript_presetAllowedRegex` | 预设正则白名单 | localStorage |
| `worldInfo` | 世界书 | localStorage |
| `freeScript_lastPrompt` / `freeScript_lastStyle` | 上次填写内容 | localStorage |
| `slot_0` … `slot_10` | 存档 | IndexedDB（`BunnyGameDB.saves`） |

存档默认 5 个手动槽（`LOCAL_MANUAL_COUNT`）+ 1 个自动槽（`slot_0`）+ 5 个外部导入槽（6–10），位于 `js/game.js` 常量：

```js
const SAVE_GAME_ID = 'freeScript';
const LOCAL_SAVE_KEY = 'freeScript_localSaves';
const LOCAL_MANUAL_COUNT = 5;
const LOCAL_EXT_START = 6;
const LOCAL_EXT_END = 10;
```

## 1.6 浏览器要求

* 支持 ES2017（async/await、可选链、`??`、`?.()`）
* 支持 `IndexedDB`、`AbortController`、`matchMedia`、`crypto.subtle`（部分可选）
* 支持 `fetch` + `ReadableStream`（流式响应）
* 推荐 Chrome/Edge 100+、Safari 15+、Firefox 100+

## 1.7 项目代号

仓库中数据库名仍保留早期代号：

```js
SaveDB.DB_NAME = 'BunnyGameDB';
```

说明项目曾名为「BunnyGame」，后改名为「自由剧本 / FREE SCRIPT」，但为兼容历史存档保留了 DB 名。
