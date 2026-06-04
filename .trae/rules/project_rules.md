# Free-Script 项目规则

## 部署流程（必须遵守）

本项目使用 GitHub Pages 部署，地址：https://yanyuan1234.github.io/free-script/

- **CI/CD**：`.github/workflows/deploy.yml` 会在 push 到 `master` 或 `trae/**` 分支时自动部署
- **每次修改代码后，必须执行以下步骤**：
  1. `git add` 改动的文件
  2. `git commit` 提交
  3. 合并到 master：`git checkout master && git merge <当前分支> --no-edit`
  4. 推送：`git push origin master`
  5. 等待 GitHub Actions 部署完成（约 1-2 分钟）

**不要忘记推送！用户在线上看到的版本必须和本地一致。**

## 代码规范

- JS 文件修改后必须运行 `node --check js/<file>.js` 验证语法
- 不要创建不必要的文件（测试脚本用完即删）
- 中文注释，代码风格与现有代码保持一致

## 记忆系统架构

- `EnhancedMemory` 在 `js/tavern-compat.js` 中，三层记忆 + 永久事实区
- `MemoryManagerUI` 在同一文件，提供编辑面板
- `buildSmartInjection()` 是注入给 AI 的核心方法，注入顺序：永久事实 → 约定 → 角色 → 事件 → 大纲 → 原文
- `estimateTokensUtil` / `truncateByChars` 在 `js/utils.js`
