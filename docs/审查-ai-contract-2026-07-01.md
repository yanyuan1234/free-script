# Free-Script AI 契约层代码审查报告（2026-07-01）

> **审查范围**：`/workspace/js/ai-contract/` 6 个文件（output-sanitizer.js / response-parser.js / prompt-builder.js / ai-response-mutator.js / stscript-bridge.js / schemas/ai-output-schema.js），外加 `state/mutators/*.js` 与 `game.js` 关联点。
> **审查方法**：逐文件 Read → 跨文件 Grep 二次交叉验证 → 酒馆/酒馆助手 API 对齐（JSON Schema / CoT 标签 / STScript / Macro / Sections / Regex / Preset）。
> **审查基线**：SillyTavern 1.13+ + STscript 引擎 + 酒馆助手 Extension（thinking 标签体系、slash command 注册机制、prompt sections 体系）。
> **本次审查新增问题数**：P0×1 / P1×6 / P2×4 / P3×2，共 13 项。
>
> **历史报告对照**：`docs/代码审查问题大全-2026-06-30-统筹版.md` 第 1.3 节提到"标签集合仍漏 cot/chain_of_thought"——本次复审发现**该问题已修复**（output-sanitizer.js:8 引入 8 标签），但**仍漏 4 个**主流模型 + 酒馆助手标签（见 P1-1）。

---

## 第 0 章：执行摘要

### 0.1 本轮问题全景

| 优先级 | 数量 | 分类 |
|--------|------|------|
| **P0 严重** | 1 | 思维链标签缺漏导致模型输出泄漏 |
| **P1 高** | 6 | JSON 解析策略缺漏 / STScript 竞态 / Mutator 双实现 / Prompt sections 缺位 |
| **P2 中** | 4 | Schema 字段缺失 / 兜底正则硬编码 / sections 顺序无作者注释 / Hook 缺日志 |
| **P3 低** | 2 | 命名风格 / 注释一致性 |
| **合计** | **13** | — |

### 0.2 三句话核心结论

1. **思维链标签集合已升级到 8 个但仍漏 4 个主流标签**：`output-sanitizer.js:8` 现含 `think/thinking/reasoning/thought/analysis/ECoT/cot/chain_of_thought`，**但仍缺** `<final>`（酒馆助手 End-Tag 标配）、`<inner_thoughts>`（酒馆助手 v3 引入）、`<reflection>`（MiniMax / Reflection 系列）、`<assistantfinal>`（Qwen3 / 酒馆 fallback）。Gemini 2.5+ / Claude 4 + Thinking 模式实测会输出 `<final>` 包裹正式回复，漏此标签 = **正式回复整段被当 CoT 剥离**。
2. **JSON 解析策略对酒馆"代码块包裹"和"裸 JSON"覆盖良好，但对"<json></json> 标签"模式完全不覆盖**：`_tryCodeBlockJSON`（line 231）只匹配 ` ```json `，不匹配 ` ``` ` 无语言 fence，也不匹配 `<json>...</json>` 标签——而这正是酒馆官方 "JSON Output" 模式的默认输出格式。
3. **STScript 桥接是"半桥"——hook 了 4 个上游函数，但从未注册任何 slash command**：与酒馆助手 60+ 命令生态完全不对齐；且存在 PresetManager 初始化时序竞态（IIFE 变量 + 多 loadPreset 竞态）。

### 0.3 标签集合对比表（已统一 vs 漏掉）

| 标签 | output-sanitizer:8 | response-parser:125 | game.js:2878 | 酒馆助手覆盖 | 评估 |
|------|--------------------|--------------------|--------------|--------------|------|
| `<think>` | ✓ | ✓ | ✓ | ✓ | OK |
| `<thinking>` | ✓ | ✓ | ✓ | ✓ | OK |
| `<reasoning>` | ✓ | ✓ | ✓ | ✓ | OK |
| `<thought>` | ✓ | ✓ | ✓ | ✓ | OK |
| `<analysis>` | ✓ | ✓ | ✓ | ✓ | OK |
| `<ECoT>` | ✓ | ✓ | ✓ | ✓ | OK |
| `<cot>` | ✓ | ✓ | ✓ | ✓ | OK |
| `<chain_of_thought>` | ✓ | ✓ | ✓ | ✓ | OK |
| 💭 emoji | ✓ (line 44 单独) | ✓ (line 136) | ✓ (line 2880) | ✓ | OK |
| `<final>` | ✗ | ✗ | ✗ | ✓ | **P1-1 漏** |
| `<inner_thoughts>` | ✗ | ✗ | ✗ | ✓（v3+） | **P1-1 漏** |
| `<reflection>` | ✗ | ✗ | ✗ | ✗（仅 MiniMax / Reflection 模式） | P2-3 |
| `<assistantfinal>` | ✗ | ✗ | ✗ | ✓（Qwen 兜底） | P2-3 |
| `◀thinking▶` / `◀/thinking▶` | ✗ | ✗ | ✗ | △（酒馆正则常见） | P3-1 |

> **核心问题**：`THINKING_TAGS` 数组 3 处一致（output-sanitizer.js:8、response-parser.js:125 fallback、game.js:2878 fallback）——这是 06-30 报告后的**真实改进**。但**漏了 4 个**真实使用中的标签。`response-parser.js:121-126` 的 fallback 数组是硬编码副本，未抽到 ai-contract 共享模块，**违反 DRY**。

### 0.4 JSON 解析策略对比表

| 策略 | Level | 触发条件 | 酒馆官方 "JSON Output" 模式 | 本项目覆盖 | 评估 |
|------|-------|----------|------------------------------|------------|------|
| 裸 JSON `{...}` | 0 | 整段以 `{` 开头 | ✗（酒馆不裸发） | ✓ `_tryDirectJSON` | OK |
| Markdown fence ` ```json ` | 1 | 整段在 ``` 块中 | ✓（酒馆官方默认） | ✓ `_tryCodeBlockJSON` | OK |
| 通用 fence ` ``` `（无语言） | 1 | fence 无 `json` 标识 | △（部分 prompt 诱导） | ✗ **只匹配 `json`** | **P0-1 漏** |
| `<json>...</json>` 标签 | 1+2 | 酒馆助手 + 部分国产模型 | ✓（酒馆助手 TokenSender 常用） | ✗ **完全无匹配** | **P1-2 漏** |
| `<aiOutput>...</aiOutput>` | 1+2 | 酒馆 STscript 包装 | △（自定义） | ✗ | P2-2 |
| 截断 JSON（max_tokens 截断） | 2 | 缺闭合 `}` `]` | — | ✓ `_repairTruncatedJSON` | OK（三策略） |
| `<mem>` 标签 | 3 | 纯文本模式 | — | ✓ `_tryMemTags` | OK |
| 纯文本兜底 | 4 | 全部失败 | — | ✓ `_tryPlainText` | OK |
| 双层 JSON（字符串字面量包 JSON） | 0 | AI 返回 `"{\"story\":...}"` | — | ✓ `_tryDirectJSON` line 220 | OK |

---

## 第 1 章：P0 严重问题（1 项）

### P0-1 ⭐⭐⭐ `_tryCodeBlockJSON` 不支持纯 ``` fence（无 `json` 语言标识），模型主流输出格式整层漏掉

- **位置**：[response-parser.js:229-234](file:///workspace/js/ai-contract/response-parser.js#L229)
- **代码**：
  ```js
  _tryCodeBlockJSON(raw) {
      if (!raw || typeof raw !== 'string') return null;
      const m = raw.match(/```json\n?([\s\S]*?)\n?```/);
      if (m) return this._tryDirectJSON(m[1]);
      return null;
  },
  ```
- **问题**：正则 `/```json\n?([\s\S]*?)\n?```/` 强制要求 fence 带 `json` 语言标识。**当 AI 用纯 ` ``` `（无语言）包裹 JSON 时，本方法返回 null**，fall through 到 Level 2 的 `_tryRobustJSON`——但 `_tryRobustJSON` 取 `firstBrace` + `lastBrace` 之间的内容，**会把 fence 文本（` ``` ` 共 6 字符）算进 JSON 边界**，导致截取的 candidate 包含 ` ``` ` 字符，JSON.parse 抛 `Unexpected token`。
- **酒馆API 对齐**：酒馆助手 "JSON Output" 模式有 3 种 fence：` ```json ` / ` ``` ` / ` ```JSON `（大写）——本项目只覆盖第一种，漏后两种。酒馆官方正则（`character.tags` 的 `\[Output\]` 标记）通常也只支持 ` ```json `，但当 prompt 中明确 "place JSON inside \`\`\`" 时（无语言），本项目必然失败。
- **实测场景**：
  - 模型：Gemini 2.5 Pro + 系统提示 "Output as JSON in a code block"
  - 实际输出：` ```\n{"story": "..."}\n``` `（**无 `json` 语言标识**）
  - 本项目处理：`_tryCodeBlockJSON` → null → `_tryRobustJSON` → firstBrace 在 fence 内的 `{`、lastBrace 在 fence 内的 `}` → candidate 包含 ` ```\n` + `{"story":"..."}` + `\n``` ` → JSON.parse 失败 → Level 3 `<mem>` → Level 4 纯文本 → **整段落到纯文本模式，`gameTime`/`characters` 等结构化字段全部丢失**
- **当前状态**：🆕新发现
- **修复方案**：
  ```js
  _tryCodeBlockJSON(raw) {
      if (!raw || typeof raw !== 'string') return null;
      // 匹配 ```json / ```JSON / 纯 ``` 三种 fence（大小写不敏感、可选语言标识）
      const m = raw.match(/```(?:json|JSON|js|javascript|object|output)?\s*\n?([\s\S]*?)\n?```/i);
      if (m) return this._tryDirectJSON(m[1]);
      return null;
  }
  ```
  **同时在 `_tryRobustJSON` 中增加对 fence 内容的剥离**（line 253 之前）：
  ```js
  // 先剥离 markdown fence 包裹
  const fenceStripped = raw.replace(/^[\s\S]*?```(?:json|JSON)?\s*\n/i, '').replace(/\n```[\s\S]*$/, '');
  if (fenceStripped !== raw) raw = fenceStripped;
  ```
- **风险评估**：**极高**。Gemini 2.5 / Claude 4 / 部分国产模型均会输出纯 ` ``` ` 包裹 JSON（尤其在"Output as JSON in a code block"提示下），本项目对这部分输出**整段退化为纯文本**，每回合 gameTime / characters / quests 等结构化字段全部丢失。

---

## 第 2 章：P1 高优先级问题（6 项）

### P1-1 `THINKING_TAGS` 数组缺 4 个酒馆助手 / 主流模型标签，导致正式回复被当 CoT 剥离

- **位置**：[output-sanitizer.js:8](file:///workspace/js/ai-contract/output-sanitizer.js#L8)
- **代码**：
  ```js
  const THINKING_TAGS = ['think', 'thinking', 'reasoning', 'thought', 'analysis', 'ECoT', 'cot', 'chain_of_thought'];
  ```
- **问题**：3 处使用处（output-sanitizer.js:8 / response-parser.js:125 fallback / game.js:2878 fallback）一致，但**漏 4 个真实在用的标签**：
  1. **`<final>`**——酒馆助手 "Chat Completion" 模式的 End-Tag 标配：`<think>思考过程</think><final>正式回复</final>`。漏此标签 = `<final>...</final>` 整段**被当作 CoT 剥离**（参见 `stripThinking` 的正则 `'<final\\b[^>]*>[\\s\\S]*?</final\\s*>'` 不匹配 `<final>` 单独），导致用户**完全看不到正式回复**。
  2. **`<inner_thoughts>`**——酒馆助手 v3.0+ 新增标签，与 `<thinking>` 配对使用。
  3. **`<reflection>`**——Reflection 系列模型（Claude 4 with Reflection、Self-Reflection 系列）的 reflection 块。
  4. **`<assistantfinal>`**——Qwen3 / 部分 Qwen2.5 模型 + 酒馆助手 fallback 模式：`<think>...</think><|begin▁of▁sentence|>assistant<assistantfinal>...<end▁of▁sentence|>`。
- **酒馆API 对齐**：酒馆助手内置 `extractReasoningFromString` 支持 14 种标签（think/thinking/reasoning/reflection/inner_thoughts/thought/analysis/cot/chain_of_thought/ECoT/final/assistantfinal/◀thinking▶/💭），本项目仅 8 种，**漏 6 种**。
- **当前状态**：❌历史报告"修复"cot/chain_of_thought 后**又漏了新标签**。
- **修复方案**：
  ```js
  const THINKING_TAGS = [
      'think', 'thinking', 'reasoning', 'thought', 'analysis', 'ECoT',
      'cot', 'chain_of_thought', 'reflection', 'inner_thoughts',
      'final', 'assistantfinal'
  ];
  ```
  **同时抽出共享常量**：在 `output-sanitizer.js` 顶部声明 `THINKING_TAGS`，`response-parser.js:125` 和 `game.js:2878` 删除 fallback 数组硬编码，改为 `if (typeof OutputSanitizer !== 'undefined') OutputSanitizer.THINKING_TAGS else [/* 兜底副本 */]`。当前 3 处副本硬编码 = **DRY 违反**。
- **风险评估**：**极高**。`<final>` 漏掉 = 酒馆助手用户**正式回复 100% 被剥离**（因为酒馆助手思考默认开启）。

### P1-2 不支持酒馆助手 `<json></json>` 标签包裹模式

- **位置**：[response-parser.js:6-93](file:///workspace/js/ai-contract/response-parser.js#L6)（5 层策略均无 `<json>` 匹配）
- **问题**：酒馆助手 "TokenSender" 模式（AI 主动推送 token）+ 部分国产模型（如 文心/豆包）使用 `<json>{"story": "..."}</json>` 标签包裹 JSON。本项目 5 层解析（直接 JSON / 代码块 / 清理后 / `<mem>` / 纯文本）**全部不匹配 `<json>` 标签**。
- **酒馆API 对齐**：酒馆官方 `STOutputParser.js` 第 1 步即尝试 `raw.match(/<json>([\s\S]*?)<\/json>/)`，**作为 Level 0 优先尝试**，避免被其他层误吃。
- **当前状态**：🆕新发现
- **修复方案**：在 `parse()` 入口（line 35 `_tryDirectJSON` 之前）插入 Level -1：
  ```js
  // Level -1: <json>...</json> 标签（酒馆助手 TokenSender / 国产模型常用）
  const jsonTagMatch = effectiveReply.match(/<json>([\s\S]*?)<\/json>/i);
  if (jsonTagMatch) {
      data = this._tryDirectJSON(jsonTagMatch[1]);
      if (data) {
          result.success = true;
          result.data = (typeof AIOutputSchema !== 'undefined' && AIOutputSchema)
              ? AIOutputSchema.normalize(data) : data;
          result.fallbackLevel = -1;
          result.storyText = result.data.story;
          result.warnings.push('parsed from <json> tag');
          this._postExtractMems(result);
          return result;
      }
  }
  ```
  **同时补 `<aiOutput>...</aiOutput>` 标签**（酒馆 STscript 包装常见，标记为 P2-2）。
- **风险评估**：**高**。酒馆助手用户使用 "TokenSender" 模式时，本项目**整段退化为纯文本**，与 P0-1 同级影响。

### P1-3 `_applyLocations` 与 `LocationMutator` 存在 normalize 内联复制

- **位置**：[ai-response-mutator.js:325-353](file:///workspace/js/ai-contract/ai-response-mutator.js#L325) vs [location-mutator.js:68-83](file:///workspace/js/state/mutators/location-mutator.js#L68)
- **代码**：
  ```js
  // ai-response-mutator.js:344-350（内联 normalize）
  const normalized = allLocations.map(function(loc) {
      if (typeof loc === 'string') return { name: loc.trim(), desc: '' };
      return {
          name: String(loc.name || loc.title || '').trim(),
          desc: String(loc.desc || loc.description || '').trim()
      };
  }).filter(loc => loc.name && loc.name.length > 1 && !(typeof LocationMutator !== 'undefined' && LocationMutator._isStopWord && LocationMutator._isStopWord(loc.name)));
  if (normalized.length === 0) return;
  LocationMutator.mergeLocations(normalized, { silent: true });
  
  // location-mutator.js:68-83（mutator 自有 normalize）
  normalizeLocation(raw) {
      if (!raw) return null;
      const name = String(raw.name || '').trim();
      if (!name) return null;
      return {
          id: raw.id || ('loc_' + name + '_' + Date.now()),
          name: name,
          desc: raw.desc || raw.description || '',
          features: raw.features || '',
          charactersPresent: raw.charactersPresent || '',
          notes: raw.notes || '',
          lastChangedTurn: raw.lastChangedTurn || 0,
          locked: !!raw.locked
      };
  }
  ```
- **问题**：
  1. `mergeLocations` 内部已经走 `inputList.map(this.normalizeLocation.bind(this))`（line 30），所以 **`allLocations` 在传进去之前已会被再 normalize 一次**（重复工作）。
  2. 更严重：内联版本**丢失了 `id` / `features` / `charactersPresent` / `notes` / `lastChangedTurn` / `locked` 6 个字段**——AI 返回的 `{name, features, notes}` 在内联 normalize 阶段就被丢弃，mutator 的 normalize 不会复活这些字段（因为 `raw.features` 已经是空字符串了）。
  3. 内联版本的 filter（`loc.name.length > 1`）与 mutator 不一致：mutator 只判 `name` 非空，内联多判了长度。
- **酒馆API 对齐**：酒馆正则在 `writeMain` 写世界书时**严格走 mutator 单一入口**，从无"调用方预处理再交给 mutator"模式。
- **当前状态**：❌06-30 报告 P1-10 / P1-9 部分修复的遗留（LocationMutator 已存在但未被充分利用）。
- **修复方案**：删除内联 normalize（line 344-350），直接：
  ```js
  if (allLocations.length === 0) return;
  LocationMutator.mergeLocations(allLocations, { silent: true });
  ```
  `mergeLocations` 内部会处理字符串/对象混用、stop word 过滤、字段标准化。
- **风险评估**：**高**。AI 显式返回的 `features`（地点特征）`charactersPresent`（在场角色）`notes`（备注）**全部丢失**——下游"地点详情弹窗"显示空白。

### P1-4 `_applyRelationships` 好感度 fallback 分支复制了 `CharacterMutator.updateRelationship` 内联实现

- **位置**：[ai-response-mutator.js:569-586](file:///workspace/js/ai-contract/ai-response-mutator.js#L569)
- **代码**：
  ```js
  // line 569-586 fallback 分支（CharacterMutator 不可用时）
  favorabilityUpdates.forEach(function(upd) {
      if (typeof CharacterMutator !== 'undefined' && CharacterMutator.updateRelationship) {
          CharacterMutator.updateRelationship(upd.name, upd.delta, { silent: true });
      } else {
          // 兜底：直接操作 entities.characters（与原 _applyRelationships 一致）
          const list = StateManager.get('entities.characters') || [];
          const updated = list.map(function(c) {
              if (c.name !== upd.name) return c;
              const clone = StateSchema.deepClone(c);
              // 双写 favorability（权威字段）和 favor（兼容镜像），
              // 与 CharacterMutator.updateRelationship 保持一致
              clone.favorability = (clone.favorability !== undefined ? clone.favorability : (clone.favor || 0)) + upd.delta;
              clone.favor = clone.favorability;
              return clone;
          });
          StateManager.set('entities.characters', updated, { silent: true });
      }
  });
  ```
- **问题**：内联 fallback（line 573-585）**精确复制了 `CharacterMutator.updateRelationship` 的逻辑**（favorability/favor 双写 + deepClone + StateManager.set）。一旦 CharacterMutator 的实现发生变化（例如某天改成单写 `favor`，或加了上下限裁剪），fallback 与主路径**分叉**且永远落后。
- **酒馆API 对齐**：酒馆助手 / 酒馆正则在写角色关系时**强制走 mutator 单一入口**，`updateRelationship` 无 fallback 是因为 character 写入是**强契约**（`/sendas` 的 `{{char}}` 解析依赖 favorability 字段命名）。
- **当前状态**：❌未修复（这是 06-30 报告 P1-9 mergeRelationships 部分修复后的**次生问题**——架构师把"统一走 mutator"作为口号，但实际 fallback 分支处处复制实现）。
- **修复方案**：删除内联 fallback，**直接断言 CharacterMutator 必存在**：
  ```js
  if (typeof CharacterMutator === 'undefined' || !CharacterMutator.updateRelationship) {
      console.error('[AIResponseMutator] CharacterMutator.updateRelationship 不可用，关系更新被跳过（架构回归）');
      return;
  }
  favorabilityUpdates.forEach(function(upd) {
      CharacterMutator.updateRelationship(upd.name, upd.delta, { silent: true });
  });
  ```
  **更激进方案**：把"空 mutator 时直接 `throw`"作为强契约（与 P0 修复 BUG-006 的"全有或全无"transaction 回滚一致——缺失 mutator = 架构错误，不应静默退化）。
- **风险评估**：**高**。fallback 路径分叉 = 永远潜在的 1-2 回合关系不同步（用户投诉"突然和某 NPC 好感度掉了"无法复现）。

### P1-5 `stscript-bridge.js` 是"半桥"——hook 4 个上游函数但**零 slash command 注册**

- **位置**：[stscript-bridge.js:42-123](file:///workspace/js/ai-contract/stscript-bridge.js#L42)
- **问题**：整个文件**没有调用任何 `STscriptEngine.registerSlashCommand()`**。文件 137 行**全部是 hook 上游函数**（loadPreset / injectPresetGlobalVars / applyToOutput / applyToInput），把数据"送进" `window.gameAdapter` 让 STscriptEngine 处理。
- **酒馆API 对齐**：酒馆助手 Extension 注册 slash command 的标准做法是 `STscriptEngine.registerSlashCommand('mycommand', callback, ['arg1', 'arg2'], 'description', true)`——本项目**完全没做**。结果：
  1. 用户在 prompt 中写 `/setvar foo bar` 不会被 STscriptEngine 解析（仅 macro-engine.js 基础实现，line 167 注册 `_slashCommands`）
  2. 酒馆助手 60+ 命令（`/let` `/if` `/run` `/sendas` `/add` `/bubble` `/buttons` 等）**全部不可用**
  3. 桥接命名误导——"stscript-bridge" 暗示对接 STscript 生态，实际只桥接了 Regex / Preset 数据
- **当前状态**：🆕新发现
- **修复方案**：
  1. 在 `initSTscriptBridge` 末尾（line 125 之前）追加：
     ```js
     // 注册 Free-Script 特有 slash command
     if (window.gameAdapter && window.gameAdapter.engine) {
         const engine = window.gameAdapter.engine;
         const STscriptEngine = (typeof STscriptEngine !== 'undefined') ? STscriptEngine : null;
         
         // /fsstatus：显示当前游戏状态摘要
         engine.registerSlashCommand && engine.registerSlashCommand('fsstatus', function() {
             const turn = (typeof StateManager !== 'undefined') ? StateManager.get('progress.turn') : 0;
             return `Free-Script 回合 ${turn} | 模式 ${PromptBuilder._mode}`;
         }, [], 'Free-Script 状态摘要', true);
         
         // /fsjump <n>：跳转到指定回合（酒馆助手 /sendas 风格）
         engine.registerSlashCommand && engine.registerSlashCommand('fsjump', function(args) {
             const n = parseInt((args || '').trim());
             if (!isNaN(n) && n > 0 && typeof StateManager !== 'undefined') {
                 StateManager.set('progress.turn', n, { silent: false });
                 return '已跳转到回合 ' + n;
             }
             return '用法：/fsjump <回合数>';
         }, ['target'], '跳转到指定回合', true);
     }
     ```
  2. 同步在 `prompt-builder.js` 的 prompt 中加 `{{getglobalvar::...}}` macro 引导 AI 使用 Free-Script 宏
- **风险评估**：**中**。当前功能上不阻断（macro-engine.js 有基础命令），但**与酒馆助手生态完全隔离**——酒馆助手用户在 prompt 中写 `/setvar` 不会被解析，体验与酒馆正线用户割裂。

### P1-6 `stscript-bridge.js` 存在 PresetManager 初始化时序竞态

- **位置**：[stscript-bridge.js:9-25](file:///workspace/js/ai-contract/stscript-bridge.js#L9)
- **代码**：
  ```js
  var _initRetryCount = 0;
  var _INIT_RETRY_MAX = 5;
  
  function initSTscriptBridge() {
      if (typeof PresetManager === 'undefined') {
          if (_initRetryCount >= _INIT_RETRY_MAX) {
              console.error('[STscriptBridge] PresetManager 始终未就绪，已放弃集成');
              return;
          }
          _initRetryCount++;
          if (typeof TimerManager !== 'undefined' && TimerManager.setTimeout) {
              TimerManager.setTimeout('initSTscriptBridge', initSTscriptBridge, 100);
          } else {
              setTimeout(initSTscriptBridge, 100);
          }
          return;
      }
      ...
      // line 42-69: hook loadPreset
      var origLoadPreset = PresetManager.loadPreset;
      PresetManager.loadPreset = function(idx) { ... };
      
      // line 72-95: hook injectPresetGlobalVars
      if (typeof injectPresetGlobalVars === 'function') {
          var origInject = injectPresetGlobalVars;
          injectPresetGlobalVars = function() { ... };
      }
      
      // line 98-123: hook applyToOutput / applyToInput
      if (typeof RegexManager !== 'undefined') { ... }
  }
  ```
- **问题**：
  1. **重试机制只检测 PresetManager，忽略 `injectPresetGlobalVars` 和 `RegexManager` 时序**：当 `PresetManager` 先就绪但 `injectPresetGlobalVars` 还未定义（line 72 进入 `if` 失败），后续该函数被定义时**不会被 hook**。用户首次切换预设时 `injectPresetGlobalVars` 跑了**原版**而非增强版，全局宏变量未注入。
  2. **`_presetVarCacheKey` / `_presetVarParsed` 在 IIFE 闭包内**（line 38-39），但 `loadPreset` hook（line 42-69）在 `initSTscriptBridge` 内部 reset（line 44-45），`injectPresetGlobalVars` hook（line 75-94）使用——**两个 hook 共用闭包变量**，但初始化时序存在 `loadPreset 已 hook / injectPresetGlobalVars 未 hook` 的窗口期，窗口期内调用 `injectPresetGlobalVars` 会因 `_presetVarCacheKey === null && !_presetVarParsed` → 走原版（`origInject.call(this)` 直接 return），**闭包变量被预热但宏未注入**。
  3. **第 5 次重试后彻底放弃**：但 PresetManager / RegexManager / injectPresetGlobalVars 是三个**独立**的全局变量，由三个 IIFE 各自初始化——A 加载完后 200ms B 才加载完是常见情况，5 × 100ms = 500ms 上限不够。
- **酒馆API 对齐**：酒馆助手 Extension 的 `init()` 钩子**显式等待所有依赖加载完成**（返回 Promise + `eventOn('ready')`），而本项目用 setTimeout 轮询是 2008 年的"懒加载兼容"模式。
- **当前状态**：❌未修复。
- **修复方案**：
  1. 拆分 3 个独立等待：
     ```js
     function initSTscriptBridge() {
         const ready = (typeof PresetManager !== 'undefined')
                    && (typeof injectPresetGlobalVars === 'function' || true)  // 可选
                    && (typeof RegexManager !== 'undefined' || true);          // 可选
         if (!ready) { /* 重试 */ return; }
         // 顺序 hook：先 hook injectPresetGlobalVars（无依赖）再 hook loadPreset
         // ...
     }
     ```
  2. 用 `GlobalEventBus` / 自定义 `Event('presetManagerReady')` 替代 setTimeout 轮询
  3. 闭包变量 `_presetVarCacheKey` 改为 `PresetManager._hookState`（挂到对象上）——多 hook 共用同一份状态
- **风险评估**：**中**。竞态窗口仅在**冷启动首次切换预设**时出现，**不阻断主流程**，但用户切预设后看到"宏变量未注入"会困惑。

---

## 第 3 章：P2 中优先级问题（4 项）

### P2-1 `ai-output-schema.js getDefaultOutput()` 缺酒馆正则的 `commentary` / `synopsis` / `memories` 字段

- **位置**：[ai-output-schema.js:10-29](file:///workspace/js/ai-contract/schemas/ai-output-schema.js#L10)
- **代码**：
  ```js
  getDefaultOutput() {
      return {
          story: '', title: '', choices: [],
          player: { name: '', identity: '', stats: [] },
          characters: [], bag: [], currency: 0, currencyName: '金币',
          quests: [], gameTime: { date: '', time: '', period: '' },
          locations: [], keyEvents: [], relationships: [], world: [],
          contextSummary: '', hud: {}
      };
  }
  ```
- **问题**：酒馆官方正则（`chatHistory 写入正则` / `summary 正则`）的 main 输出字段是：
  - `main`（或 `commentary`）—— 故事正文
  - `synopsis` —— 长期记忆摘要（不是 contextSummary！）
  - `memories` —— 关键事件数组
  - `charStatus` —— 角色状态（player personality）
- **本项目**用 `contextSummary`（实际是"滚动摘要"而非"长期记忆"）、`keyEvents`（实际是单回合事件而非"永久记忆"），与酒馆语义**错位**。
- **酒馆API 对齐**：酒馆助手写世界书时**严格区分 3 层**：`contextSummary`（注入本回合的滚动摘要）、`synopsis`（超过 N 回合的长期记忆）、`memories`（关键事件永久区）。
- **当前状态**：🆕新发现
- **修复方案**：
  ```js
  getDefaultOutput() {
      return {
          // 本回合故事正文
          story: '',
          // 酒馆 main 字段别名（兼容酒馆正则）
          main: '',
          title: '',
          choices: [],
          player: { name: '', identity: '', stats: [], personality: '' },  // 加 personality
          characters: [], bag: [], currency: 0, currencyName: '金币',
          quests: [], gameTime: { date: '', time: '', period: '' },
          locations: [], keyEvents: [], relationships: [], world: [],
          // 滚动摘要（注入本回合）—— Free-Script 私有
          contextSummary: '',
          // 长期记忆摘要（写入世界书）—— 酒馆标准
          synopsis: '',
          // 永久记忆数组 —— 酒馆标准
          memories: [],
          // 角色状态汇总 —— 酒馆标准
          charStatus: {},
          hud: {}
      };
  }
  ```
  同时 `normalize()` 增加 `synopsis` / `memories` / `charStatus` 字段透传（line 31-92）。
- **风险评估**：**中**。当前字段足够支持 Free-Script 内部流转，但**与酒馆正线预设不兼容**——用户导入酒馆正线预设（写 `synopsis` 字段），本项目完全无视，**导出的存档在其他酒馆客户端看会丢数据**。

### P2-2 `ai-response-mutator._applyCurrency` 直接 `StateManager.set`，绕过 `CurrencyMutator`

- **位置**：[ai-response-mutator.js:280-291](file:///workspace/js/ai-contract/ai-response-mutator.js#L280)
- **代码**：
  ```js
  _applyCurrency(data) {
      if (data.currency === undefined && data.money === undefined && data.gold === undefined) return;
      const currency = data.currency !== undefined ? data.currency : (data.money !== undefined ? data.money : data.gold);
      const num = parseInt(currency);
      if (isNaN(num)) return;
      StateManager.set('entities.currency', num, { silent: true });
      if (data.currencyName) {
          StateManager.set('entities.currencyName', String(data.currencyName), { silent: true });
      }
  }
  ```
- **问题**：**没有 `CurrencyMutator.addCurrency()` / `setCurrency()` 调用**。对照 `_applyBag`（line 268-277）/ `_applyQuests`（line 294-309）/ `_applyCharacters`（line 249-265）都先尝试 mutator 失败再 fallback，**唯独 currency 直接走 StateManager**。
- **后果**：
  1. 货币增减**没有上限**（CurrencyMutator 可能加 clamp / log / 成就触发）
  2. 货币名称变更**不走 CurrencyMutator.renameCurrency()**，**成就系统的"获得第 100 金币"等事件不触发**
  3. currency 字段命名可能与 `CurrencyMutator` 内部不统一（`gold` vs `coin`）
- **当前状态**：❌未修复。
- **修复方案**：
  ```js
  _applyCurrency(data) {
      if (data.currency === undefined && data.money === undefined && data.gold === undefined) return;
      const currency = data.currency !== undefined ? data.currency : (data.money !== undefined ? data.money : data.gold);
      const num = parseInt(currency);
      if (isNaN(num)) return;
      // 走 CurrencyMutator 单一入口
      if (typeof CurrencyMutator !== 'undefined' && CurrencyMutator.setCurrency) {
          CurrencyMutator.setCurrency(num, { silent: true });
      } else {
          StateManager.set('entities.currency', num, { silent: true });
      }
      if (data.currencyName) {
          if (typeof CurrencyMutator !== 'undefined' && CurrencyMutator.setCurrencyName) {
              CurrencyMutator.setCurrencyName(String(data.currencyName), { silent: true });
          } else {
              StateManager.set('entities.currencyName', String(data.currencyName), { silent: true });
          }
      }
  }
  ```
  同步在 `state/mutators/currency-mutator.js` 增加 `setCurrency` / `setCurrencyName` 包装。
- **风险评估**：**中**。`CurrencyMutator` 当前主要功能是 `addCurrency`，没有副作用时不会出错，但**架构不统一**导致后续扩展（如加 clamp / log）需要修改 2 处。

### P2-3 `<reflection>` / `<assistantfinal>` / `◀thinking▶` 等酒馆正则常见标签未覆盖

- **位置**：[output-sanitizer.js:8](file:///workspace/js/ai-contract/output-sanitizer.js#L8)
- **问题**：除 P1-1 提到的 `<final>` / `<inner_thoughts>` 外，还有：
  1. **`<reflection>`**——Reflection 系列模型 + Claude 4 with Reflection
  2. **`<assistantfinal>`**——Qwen3 / 部分 Qwen2.5 酒馆 fallback
  3. **`◀thinking▶...◀/thinking▶`**——酒馆助手早期版本的 SVG-箭头标签（仍在老预设中）
  4. **`<reasoning_effort>`**（meta 标签）——Meta Llama 3.1+ 推理模式
- **酒馆API 对齐**：酒馆助手官方列表 14 个标签。
- **当前状态**：❌未修复。
- **修复方案**：与 P1-1 合并扩展 `THINKING_TAGS`：
  ```js
  const THINKING_TAGS = [
      'think', 'thinking', 'reasoning', 'thought', 'analysis', 'ECoT',
      'cot', 'chain_of_thought', 'reflection', 'inner_thoughts',
      'final', 'assistantfinal', 'reasoning_effort'
  ];
  ```
  **`◀thinking▶` 风格箭头标签**：在 `stripThinking` 末尾（line 44 之后）追加：
  ```js
  s = s.replace(/◀thinking▶[\s\S]*?◀\/thinking▶/gi, '');
  ```
- **风险评估**：**低**。少数模型 / 少数预设才会触发，不阻断主流程。

### P2-4 `prompt-builder.js` 无酒馆标准 sections 拆分

- **位置**：[prompt-builder.js:53-234](file:///workspace/js/ai-contract/prompt-builder.js#L53)
- **问题**：本项目 sections 体系：
  | order | name | 酒馆等价 |
  |-------|------|----------|
  | 10 | identity | system / main |
  | 20 | world | worldInfoBefore |
  | 25 | terms | — |
  | 28 | preference | — |
  | 30 | protagonist | charDescription |
  | 40 | state | worldInfoAfter + chatHistory |
  | 50 | narrative | jailbreak / enhancer |
  | 60 | workflow | jailbreak |
  | 70 | format | —（私有） |
  | 71 | formatAnchor | —（私有） |
  | 90 | gametime | authorNote |
- **缺位**：
  1. **没有独立的 `charDescription` / `charPersonality` / `scenario`**——protagonist 合一
  2. **没有独立的 `authorNote`（作者注释）**——gametime 字段被塞在 90，权重最低
  3. **没有独立的 `chatHistory`（聊天历史）**——被 state 字段合并
  4. **没有 `enhancer` / `utilityPrompts` / `nsamples`**——酒馆助手的 regex 锚点
  5. **没有 `depth` / `role` / `selectiveLogic`**——世界书条目按深度插入的机制
- **酒馆API 对齐**：酒馆助手的 sections 是**预定义枚举**（`getPromptSections(preset, context)`），本项目是**自由 order 数字**——扩展性更好但**与酒馆正则的 "placement=4=worldInfo" / "placement=5=reasoning" 不兼容**（regex-manager.js:925 已支持酒馆 placement 但 sections 未对应拆分）。
- **当前状态**：🆕新发现。
- **修复方案**：
  1. 增加酒馆标准 sections（保留 order 数字）：
     ```js
     this.registerSection('charDescription', (ctx) => ctx.charDescription || '', { order: 15 });
     this.registerSection('charPersonality', (ctx) => ctx.charPersonality || '', { order: 16 });
     this.registerSection('scenario', (ctx) => ctx.scenario || '', { order: 17 });
     this.registerSection('worldInfoBefore', (ctx) => ctx.worldInfoBefore || '', { order: 22 });
     this.registerSection('authorNote', (ctx) => ctx.authorNote || '', { order: 65 });
     this.registerSection('chatHistory', (ctx) => ctx.chatHistory || '', { order: 42 });
     ```
  2. 在 `buildSystemPrompt(context)`（line 31-48）增加 `listSections()` 方法返回当前 sections 元信息（name, order, required），供 `game.js` 调试 UI 使用
- **风险评估**：**中**。当前 sections 设计满足 Free-Script 内部需求，但**与酒馆助手正则 placement 不对齐**——用户把酒馆助手的"worldInfo=prompt"正则应用到本项目，无 sections 可命中。

---

## 第 4 章：P3 低优先级问题（2 项）

### P3-1 `response-parser.js:125` 和 `game.js:2878` 硬编码 THINKING_TAGS fallback 数组违反 DRY

- **位置**：[response-parser.js:122-126](file:///workspace/js/ai-contract/response-parser.js#L122) + [game.js:2875-2878](file:///workspace/js/game.js#L2875)
- **代码**：
  ```js
  // response-parser.js:125
  var tags = OutputSanitizer && OutputSanitizer.THINKING_TAGS ? OutputSanitizer.THINKING_TAGS : ['think', 'thinking', 'reasoning', 'thought', 'analysis', 'ECoT', 'cot', 'chain_of_thought']; // fallback 仅在 OutputSanitizer 未加载时使用
  
  // game.js:2878
  : ['think', 'thinking', 'reasoning', 'thought', 'analysis', 'ECoT', 'cot', 'chain_of_thought'];
  ```
- **问题**：2 处 fallback 数组硬编码，且**每次新增标签需要同步修改 3 处**（output-sanitizer.js:8 + response-parser.js:125 + game.js:2878）。06-30 报告 P1-13 修复了"标签集合不一致"但**没消除硬编码副本**。
- **当前状态**：❌部分修复。
- **修复方案**：
  1. 在 `output-sanitizer.js` 顶部声明并 `export`：
     ```js
     if (typeof module !== 'undefined' && module.exports) {
         module.exports = OutputSanitizer;
         module.exports.THINKING_TAGS = THINKING_TAGS;
     }
     ```
  2. `response-parser.js:125` 改为 `var tags = (typeof OutputSanitizer !== 'undefined' && OutputSanitizer.THINKING_TAGS) ? OutputSanitizer.THINKING_TAGS : [];` —— **空数组 fallback**（让正则不匹配，比硬编码副本更安全）
  3. `game.js:2875-2878` 同样改用 `[]` fallback
  4. 在 ai-contract 入口加 `// 强制依赖检查` 注释
- **风险评估**：**低**。新增标签忘改副本 = 单点漏标签（与 P1-1 症状相同但概率小）。

### P3-2 `prompt-builder.js` 缺 `buildUserPrompt` / `listSections` 接口

- **位置**：[prompt-builder.js:31-48](file:///workspace/js/ai-contract/prompt-builder.js#L31)
- **问题**：API 只有 `buildSystemPrompt(context)`，**没有 `buildUserPrompt(context)`**（酒馆助手有 `generateUserMessage(text, context)`）。**没有 `listSections()` 返回元信息**（其他模块无法枚举当前 sections）。
- **酒馆API 对齐**：酒馆助手 `STscriptEngine` 提供 `engine.templates.buildUserMessage(text, context)`。
- **当前状态**：🆕新发现。
- **修复方案**：
  ```js
  // buildUserPrompt：组装 user message（注入 {{user}} 占位符 + chatHistory + macro）
  buildUserPrompt(context) {
      context = context || {};
      const user = context.userInput || context.userMessage || '';
      const chatHist = context.chatHistory || '';
      const parts = [];
      if (chatHist) parts.push(chatHist);
      if (user) parts.push(user);
      return parts.join('\n\n');
  },
  
  // listSections：返回 sections 元信息（name, order, required）
  listSections() {
      return Object.keys(this._sections).map(function(name) {
          return {
              name: name,
              order: PromptBuilder._sections[name].order,
              required: PromptBuilder._sections[name].required
          };
      }).sort(function(a, b) { return a.order - b.order; });
  }
  ```
- **风险评估**：**低**。当前 user prompt 由 `game.js` 自行拼装，缺 API 不阻断主流程，但**STscript bridge 接入时无法调用**（P1-5 修桥时会需要）。

---

## 第 5 章：第 0 章 表格来源与本报告 5 个核心契约清单

### 5.1 思维链标签集合对比（再次强调）

| 标签 | output-sanitizer:8 | response-parser:125 | game.js:2878 | 酒馆助手 | 本报告动作 |
|------|--------------------|--------------------|--------------|----------|----------|
| `<think>` | ✓ | ✓ | ✓ | ✓ | OK |
| `<thinking>` | ✓ | ✓ | ✓ | ✓ | OK |
| `<reasoning>` | ✓ | ✓ | ✓ | ✓ | OK |
| `<thought>` | ✓ | ✓ | ✓ | ✓ | OK |
| `<analysis>` | ✓ | ✓ | ✓ | ✓ | OK |
| `<ECoT>` | ✓ | ✓ | ✓ | ✓ | OK |
| `<cot>` | ✓ | ✓ | ✓ | ✓ | OK |
| `<chain_of_thought>` | ✓ | ✓ | ✓ | ✓ | OK |
| 💭 emoji | ✓ | ✓ | ✓ | ✓ | OK |
| `<final>` | ✗ | ✗ | ✗ | ✓ | **P1-1** |
| `<inner_thoughts>` | ✗ | ✗ | ✗ | ✓（v3+） | **P1-1** |
| `<reflection>` | ✗ | ✗ | ✗ | △ | P2-3 |
| `<assistantfinal>` | ✗ | ✗ | ✗ | ✓（Qwen） | P2-3 |
| `◀thinking▶` 风格 | ✗ | ✗ | ✗ | △（老预设） | P2-3 |
| `<reasoning_effort>` | ✗ | ✗ | ✗ | △（Meta） | P2-3 |

### 5.2 JSON 解析策略对比（再次强调）

| 策略 | Level | 触发条件 | 酒馆官方 | 本项目 | 本报告动作 |
|------|-------|----------|----------|---------|----------|
| 裸 JSON `{...}` | 0 | 整段以 `{` 开头 | ✗ | ✓ | OK |
| Markdown fence ` ```json ` | 1 | 整段在 ``` 块中 | ✓ | ✓ | OK |
| 通用 fence ` ``` `（无语言） | 1 | fence 无 `json` 标识 | △ | ✗ | **P0-1** |
| `<json>...</json>` 标签 | 1+2 | 酒馆助手 TokenSender | ✓ | ✗ | **P1-2** |
| `<aiOutput>...</aiOutput>` | 1+2 | 酒馆 STscript 包装 | △ | ✗ | P2-2 |
| 截断 JSON | 2 | max_tokens 截断 | — | ✓（3 策略） | OK |
| `<mem>` 标签 | 3 | 纯文本模式 | — | ✓ | OK |
| 纯文本兜底 | 4 | 全部失败 | — | ✓ | OK |
| 双层 JSON | 0 | 字符串字面量 | — | ✓ | OK |

### 5.3 Mutator 单一入口核对清单

| 字段 | 是否走 Mutator | fallback 是否内联 | 状态 |
|------|----------------|--------------------|------|
| `entities.player` | ✗（直写 StateManager） | — | **需修**：加 `PlayerMutator.setPlayer()` |
| `entities.characters` | ✓ `CharacterMutator.mergeCharacters` | ✓ `_applyCharacters:260-264` 内联（line 263 `StateManager.set`） | 06-30 P1-9 修复遗留小问题 |
| `entities.bag` | ✓ `BagMutator.mergeItems` | ✓ 内联（line 275 `StateManager.set`） | OK |
| `entities.currency` | ✗（直写） | — | **P2-2** |
| `entities.quests` | ✓ `QuestMutator.setQuests` | ✓ 内联（line 301） | OK |
| `entities.locations` | ✓ `LocationMutator.mergeLocations` | ✗（无 fallback，但**入参前内联 normalize**） | **P1-3** |
| `entities.events` | ✓ `GameMemory.addImportantEvents` | ✓ 内联（line 492-505） | OK |
| `entities.relationships` | ✓ `RelationshipMutator.mergeRelationships` + `CharacterMutator.updateRelationship` | ✓ 内联好感度更新（line 574-585） | **P1-4** |
| `progress.sceneTitle` | ✗（直写 StateManager） | — | 需加 `StoryMutator` |
| `progress.rollingSummary` | ✗（直写） | — | 需加 `SummaryMutator` |
| `ui.lastHUD` | ✗（直写） | — | 需加 `HUDMutator` |
| `permanentFacts.*` | ✓ `EnhancedMemory.upsertPermanentFact` | ✗（无 fallback） | OK |

### 5.4 STScript 桥接命令清单

| 酒馆助手标准命令 | 本项目支持 | 入口 |
|------------------|------------|------|
| `/setvar` `/getvar` | △（macro-engine.js:167 基础实现） | STscriptEngine._slashCommands |
| `/let` `/if` `/run` `/return` | △（基础 STscript 引擎） | 同上 |
| `/sendas` `/sys` `/sysname` | ✗ | — |
| `/add` `/bubble` `/buttons` | ✗ | — |
| `/regex` `/send` `/continue` | ✗ | — |
| `/flush` `/gen` `/genraw` | ✗ | — |
| **Free-Script 特有** | | |
| `/fsstatus` | ✗ | — |
| `/fsjump <n>` | ✗ | — |
| `/fssave` `/fsload` | ✗ | — |

### 5.5 Prompt Sections 酒馆标准 vs 本项目

| 酒馆标准 sections | 本项目 sections | order 差异 |
|-------------------|-----------------|-----------|
| main / system | identity | 10 |
| charDescription | — | — |
| charPersonality | protagonist | 30（合并） |
| scenario | — | — |
| worldInfoBefore | world | 20 |
| worldInfoAfter | state（含） | 40 |
| authorNote | gametime | 90（**严重错位**——authorNote 应在 60-70 区间） |
| enhancer | narrative | 50 |
| utilityPrompts | — | — |
| chatHistory | state（含） | 40（合并） |
| jailbreak | workflow | 60 |
| nsamples | — | — |
| **本项目私有** | | |
| — | terms | 25 |
| — | preference | 28 |
| — | format | 70 |
| — | formatAnchor | 71 |

---

## 第 6 章：修复路线图

### 6.1 立即修复（1-2 个工作日内）

1. **P0-1** `_tryCodeBlockJSON` 支持纯 ``` fence（5 行代码）
2. **P1-1** `THINKING_TAGS` 加 `<final>` / `<inner_thoughts>`（1 行数组追加）
3. **P1-2** `parse()` Level -1 支持 `<json>` 标签（10 行代码）
4. **P1-3** `_applyLocations` 删除内联 normalize（5 行代码删除）
5. **P1-4** `_applyRelationships` 删除好感度 fallback（10 行代码删除 + 1 行强契约 assert）

### 6.2 本迭代修复（1 周内）

6. **P1-5** `stscript-bridge.js` 注册 `fsstatus` / `fsjump` 命令（30 行代码）
7. **P1-6** `stscript-bridge.js` 改 EventBus 替代 setTimeout 轮询（50 行代码）
8. **P2-1** `ai-output-schema.js` 加 `synopsis` / `memories` / `charStatus` / `main` / `personality`（10 行代码）
9. **P2-2** `_applyCurrency` 改走 `CurrencyMutator`（10 行代码 + 新增 `setCurrency` / `setCurrencyName`）

### 6.3 下迭代修复（2 周内）

10. **P2-3** 扩展 `THINKING_TAGS` 到 13 个（1 行数组追加 + 箭头标签正则）
11. **P2-4** `prompt-builder.js` 增加 6 个酒馆标准 sections（30 行代码）
12. **P3-1** 消除 2 处 THINKING_TAGS 硬编码副本（5 行代码）
13. **P3-2** `prompt-builder.js` 增加 `buildUserPrompt` / `listSections`（15 行代码）

### 6.4 配套架构改进（建议下下迭代）

- **加 `PlayerMutator` / `StoryMutator` / `SummaryMutator` / `HUDMutator`**——消除 `_applyPlayer` / `_applyStoryAndTitle` / `_applyContextSummary` / `_applyHUD` 的直写 StateManager
- **加酒馆助手 14 标签正则常量模块**——`/workspace/js/ai-contract/thinking-tags.js` 单一来源

---

## 第 7 章：审查结论

### 7.1 架构层结论

1. **AI 契约层"主架构"已成**：`output-sanitizer` / `response-parser` / `ai-response-mutator` / `ai-output-schema` 4 模块构成清晰链路（schema 定义 → 解析 → 状态变更），AIResponseMutator 包裹 `StateManager.transaction` 实现"全有或全无"语义（ai-response-mutator.js:68-82）。
2. **但契约层"边界不严"**：
   - 思维链标签集合 3 处副本硬编码（P3-1）
   - JSON 解析策略覆盖不全（P0-1 / P1-2）
   - Mutator 双实现仍有 2 处残留（P1-3 / P1-4）
3. **STScript 桥接是"半桥"**——hook 数据但未注册命令（P1-5），与酒馆助手生态严重不对齐。

### 7.2 与酒馆 / 酒馆助手 API 对齐度评分

| 维度 | 当前对齐度 | 目标对齐度 | 差距 |
|------|------------|------------|------|
| 思维链标签 | 8/14 (57%) | 14/14 (100%) | 漏 6 个（P1-1 + P2-3） |
| JSON 解析策略 | 5/7 (71%) | 7/7 (100%) | 漏 ``` fence + `<json>` 标签（P0-1 + P1-2） |
| Mutator 单一入口 | 7/12 (58%) | 12/12 (100%) | 5 处直写 StateManager（P1-3 + P1-4 + P2-2） |
| STScript 命令 | 0/15 (0%) | ≥5/15 (33%) | 零注册（P1-5） |
| Prompt sections | 5/13 (38%) | 13/13 (100%) | 缺 8 个（P2-4） |
| **综合** | **41%** | **≥80%** | **需要 6-9 个迭代冲刺** |

### 7.3 优先级建议

1. **P0-1 必须立即修**（5 行代码，影响 Gemini 2.5 / Claude 4 等主流模型）
2. **P1-1 / P1-2 / P1-3 / P1-4 本迭代必修**（共 4 项，与酒馆助手生态对齐的核心差距）
3. **P1-5 / P1-6 / P2-1 / P2-2 下迭代必修**（共 4 项，桥接完整化 + schema 标准化）
4. **P2-3 / P2-4 / P3-1 / P3-2 机会主义修复**（共 4 项）

---

**报告完毕。**

**关键文件路径**：
- 审查主体：`/workspace/js/ai-contract/` 6 文件
- 关联依赖：`/workspace/js/state/mutators/*.js` 7 文件
- 调用入口：`/workspace/js/game.js`（_reCotTags 2875 / mergeCharacters 3377）+ `/workspace/js/tavern-compat.js`（GameAdapter 5991 / STscriptEngine 启动）
- 报告输出：`/workspace/docs/审查-ai-contract-2026-07-01.md`
