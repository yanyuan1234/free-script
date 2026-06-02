# 自由剧本 · FREE SCRIPT — Code Wiki

> 基于 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 预设范式的纯前端 AI 文字冒险游戏引擎。
> 本 Wiki 面向开发者，解释整个项目仓库的代码组织、模块职责、关键 API 与运行方式。

---

## 目录

| 文档 | 内容 |
| --- | --- |
| [01 · 项目总览](./01-overview.md) | 项目定位、技术栈、目录结构、运行入口 |
| [02 · 整体架构](./02-architecture.md) | 分层架构、模块依赖、初始化流程、数据流 |
| [03 · 主要模块](./03-modules.md) | 按脚本文件逐个拆解：职责、关键对象、对外接口 |
| [04 · 关键类与函数](./04-key-apis.md) | 跨模块复用的核心类/函数速查 |
| [05 · 依赖与数据流](./05-dependencies.md) | 模块依赖图、外部资源、存储模型 |
| [06 · 运行与部署](./06-running.md) | 本地启动、GitHub Pages 部署、Cloudflare 代理配置 |

---

## 项目一句话简介

**自由剧本（FREE SCRIPT）** 是一个 **零后端、单 HTML 文件可运行的 AI 文字游戏引擎**：

* 用户填写一个「想玩的游戏」描述 + 主角设定 + 一份 SillyTavern 预设（可选），引擎调用任意 OpenAI 兼容 API；
* AI 在每回合按预设好的 JSON Schema 输出剧情、HUD、选项、角色、背包、世界模块等；
* 引擎解析后渲染成「**极简手机桌面风格**」UI，并维护任务/成就/记忆/存档/正则/世界书/宏等完整游戏机制。

> 整套前端代码 ≈ **42.7k 行**，按职责拆分成 9 个 JS 文件、5 个 CSS 文件、1 个 HTML，所有数据走 `localStorage` + `IndexedDB`。

---

## 关键能力速览

* **多 API 代理**：内置 5 槽位轮询、失败自动切换、Cloudflare Worker 代理
* **SillyTavern 兼容**：世界书（Lorebook）、正则脚本、宏引擎、预设导入
* **三层记忆**：工作/短期/长期记忆 + 自动压缩
* **多子系统**：任务、成就、NPC 私聊、朋友圈、邮件、商店、论坛、日记、背包、回顾
* **预设生态**：兼容「果实·叶子版」「月读·Gemini」「蛾摩拉☼2.4」等主流 ST 预设
* **流式输出**：JSON 边收边解析 + 打字机缓冲
* **响应式 UI**：极简风，支持从 320px 手机到桌面

---

## 阅读顺序建议

1. **新同学** → 先看 [01 · 项目总览](./01-overview.md) → [02 · 整体架构](./02-architecture.md)
2. **要改 UI** → [01 § 目录结构](./01-overview.md#目录结构) → [03 § phone-ui.js](./03-modules.md#phone-ui-js)
3. **要改游戏逻辑** → [03 § core.js / game.js](./03-modules.md#core-js) → [04 · 关键 API](./04-key-apis.md)
4. **要接新预设/扩展** → [03 § modules.js / tavern-compat.js](./03-modules.md#modules-js) → [05 · 依赖](./05-dependencies.md)
5. **要部署/排错** → [06 · 运行与部署](./06-running.md)

---
