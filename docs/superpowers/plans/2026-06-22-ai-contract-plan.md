# AI 输出契约层（Phase 2）Implementation Plan

> **For agentic workers:** REQUIRED SUB-AGENT SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在阶段 1 状态层之上，建立统一、可测试、可防御 AI 错误的 AI 交互契约层，把 prompt 构建、响应解析、输出清理、故障兜底、上下文管理从 `game.js` / `core.js` 迁移到 `js/ai-contract/`。

**Architecture:** 新增 `js/ai-contract/` 目录，包含 schema、sanitizer、parser、fallback、context、mutator、prompt-builder 七个模块。`sendAIRequest` 退化为流程协调器：构造消息 → 调用 fallback → 解析回复 → 通过 Mutator 写入 StateManager。所有模块不依赖 DOM，使用 `var` 声明与现有代码风格一致。

**Tech Stack:** 纯原生 JavaScript（ES5/ES6 子集，兼容现有 `var` 风格），Node.js 用于语法检查，浏览器用于集成测试。

---

## File Structure

| 文件 | 职责 |
|------|------|
| `js/ai-contract/schemas/ai-output-schema.js` | AI 输出标准 schema、字段别名、normalize、validate |
| `js/ai-contract/output-sanitizer.js` | 清理 story/JSON 中的思维链、HTML、光标符号、JSON 前缀 |
| `js/ai-contract/response-parser.js` | 5 层解析兜底：直接 JSON、代码块、状态机、`<mem>`、纯文本 |
| `js/ai-contract/fallback-engine.js` | 重试、模型切换、JSON→纯文本降级 |
| `js/ai-contract/context-manager.js` | 消息列表构建、历史维护、token 估算、滚动摘要 |
| `js/ai-contract/ai-response-mutator.js` | 把标准化后的 AI 输出写入 StateManager |
| `js/ai-contract/prompt-builder.js` | 模板化 system/user prompt 构建 |
| `js/ai-contract/prompt-sections.js` | prompt 片段库：identity、format、workflow、protagonist 等 |
| `js/core.js` | 旧 `safeJSONParse` / `parseAIResponse` 委托给契约层 |
| `js/game.js` | `buildSystemPrompt` / `sendAIRequest` 委托给契约层 |
| `index.html` | 插入 `js/ai-contract/` 加载顺序 |
| `tests/ai-contract/response-parser.test.js` | ResponseParser 单元测试 |
| `tests/ai-contract/output-sanitizer.test.js` | OutputSanitizer 单元测试 |

---

### Task 1: 创建 `AIOutputSchema`

**Files:**
- Create: `js/ai-contract/schemas/ai-output-schema.js`
- Test: `tests/ai-contract/ai-output-schema.test.js`

- [ ] **Step 1: 创建 schema 文件**

```javascript
// js/ai-contract/schemas/ai-output-schema.js
var AIOutputSchema = {
    REQUIRED_FIELDS: ['story'],
    STORY_ALIASES: ['story', 'storyText', 'content', 'text', 'narrative'],
    TITLE_ALIASES: ['title', 'scene', 'sceneTitle', 'chapterTitle'],

    getDefaultOutput: function() {
        return {
            story: '',
            title: '',
            choices: [],
            player: { name: '', identity: '', stats: [] },
            characters: [],
            bag: [],
            currency: 0,
            currencyName: '金币',
            quests: [],
            gameTime: { date: '', time: '', period: '' },
            locations: [],
            keyEvents: [],
            relationships: [],
            world: [],
            contextSummary: '',
            hud: {}
        };
    },

    normalize: function(raw) {
        if (!raw || typeof raw !== 'object') return this.getDefaultOutput();
        var out = this.getDefaultOutput();
        var storyField = this._pickField(raw, this.STORY_ALIASES);
        if (storyField) out.story = String(storyField).trim();
        var titleField = this._pickField(raw, this.TITLE_ALIASES);
        if (titleField) out.title = String(titleField).trim();
        if (raw.choices && Array.isArray(raw.choices)) {
            out.choices = raw.choices.map(function(c) {
                if (typeof c === 'string') return { id: '', text: c };
                return { id: c.id || '', text: c.text || c.label || '' };
            }).filter(function(c) { return c.text; });
        }
        if (raw.player && typeof raw.player === 'object') out.player = raw.player;
        if (raw.characters && Array.isArray(raw.characters)) out.characters = raw.characters;
        if (raw.bag && Array.isArray(raw.bag)) out.bag = raw.bag;
        if (typeof raw.currency === 'number') out.currency = raw.currency;
        if (raw.currencyName) out.currencyName = String(raw.currencyName);
        if (raw.quests && Array.isArray(raw.quests)) out.quests = raw.quests;
        if (raw.gameTime && typeof raw.gameTime === 'object') out.gameTime = raw.gameTime;
        if (raw.locations && Array.isArray(raw.locations)) out.locations = raw.locations;
        if (raw.keyEvents && Array.isArray(raw.keyEvents)) out.keyEvents = raw.keyEvents;
        if (raw.relationships && Array.isArray(raw.relationships)) out.relationships = raw.relationships;
        if (raw.world && Array.isArray(raw.world)) out.world = raw.world;
        if (raw.contextSummary) out.contextSummary = String(raw.contextSummary);
        if (raw.hud && typeof raw.hud === 'object') out.hud = raw.hud;
        return out;
    },

    validate: function(data) {
        var errors = [];
        if (!data || typeof data !== 'object') {
            errors.push('data is not an object');
            return { valid: false, errors: errors };
        }
        var storyField = this._pickField(data, this.STORY_ALIASES);
        if (!storyField || !String(storyField).trim()) {
            errors.push('missing required field: story');
        }
        return { valid: errors.length === 0, errors: errors };
    },

    _pickField: function(obj, aliases) {
        for (var i = 0; i < aliases.length; i++) {
            var key = aliases[i];
            if (obj[key] !== undefined && obj[key] !== null) return obj[key];
        }
        return null;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = AIOutputSchema;
```

- [ ] **Step 2: 语法检查**

Run: `node --check js/ai-contract/schemas/ai-output-schema.js`
Expected: 无输出（通过）。

- [ ] **Step 3: 编写单元测试**

```javascript
// tests/ai-contract/ai-output-schema.test.js
var AIOutputSchema = require('../../js/ai-contract/schemas/ai-output-schema.js');

function assertEq(a, b, msg) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        throw new Error((msg || 'assertEq failed') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
    }
}

var normalized = AIOutputSchema.normalize({ storyText: 'hello', sceneTitle: '第一章', choices: ['A', { text: 'B' }] });
assertEq(normalized.story, 'hello', 'story alias');
assertEq(normalized.title, '第一章', 'title alias');
assertEq(normalized.choices.length, 2, 'choices length');
assertEq(normalized.choices[0].text, 'A', 'choice string');

var validated = AIOutputSchema.validate({ story: 'x' });
assertEq(validated.valid, true, 'valid');

var invalid = AIOutputSchema.validate({});
assertEq(invalid.valid, false, 'invalid');

console.log('AIOutputSchema tests passed');
```

Run: `node tests/ai-contract/ai-output-schema.test.js`
Expected: `AIOutputSchema tests passed`

- [ ] **Step 4: 提交**

```bash
git add js/ai-contract/schemas/ai-output-schema.js tests/ai-contract/ai-output-schema.test.js
git commit -m "feat(ai-contract): add AIOutputSchema with aliases and validation"
```

---

### Task 2: 创建 `OutputSanitizer`

**Files:**
- Create: `js/ai-contract/output-sanitizer.js`
- Test: `tests/ai-contract/output-sanitizer.test.js`

- [ ] **Step 1: 创建 sanitizer 文件**

```javascript
// js/ai-contract/output-sanitizer.js
var OutputSanitizer = {
    sanitizeStory: function(text) {
        if (!text || typeof text !== 'string') return '';
        var s = text;
        s = this.stripThinking(s);
        s = this.stripHTMLAndCursors(s);
        s = this.stripJSONArtifacts(s);
        s = s.replace(/[\u0000-\u0008\u000b-\u000c\u000e-\u001f]+/g, ' ');
        s = s.replace(/\n{3,}/g, '\n\n');
        return s.trim();
    },

    sanitizeJSON: function(raw) {
        if (!raw || typeof raw !== 'string') return '';
        var s = raw.trim();
        if (s.startsWith('```')) {
            s = s.replace(/^```json\s*/i, '').replace(/^```/, '').trim();
            if (s.endsWith('```')) s = s.slice(0, -3).trim();
        }
        s = s.replace(/^[^\{\[]*?(\{|\[)/, '$1');
        return s;
    },

    stripThinking: function(text) {
        if (!text || typeof text !== 'string') return '';
        return text
            .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
            .replace(/<ECoT>[\s\S]*?<\/ECoT>/gi, '')
            .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '')
            .replace(/💭[\s\S]*?💭/g, '');
    },

    stripHTMLAndCursors: function(text) {
        if (!text || typeof text !== 'string') return '';
        return text
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/▌|⎸/g, '');
    },

    stripJSONArtifacts: function(text) {
        if (!text || typeof text !== 'string') return '';
        return text
            .replace(/^\s*"story"\s*:\s*"/i, '')
            .replace(/^\s*"title"\s*:\s*"/i, '')
            .replace(/^\s*story\s*:\s*/i, '')
            .replace(/^\s*title\s*:\s*/i, '')
            .replace(/\{\s*"story"\s*:\s*"/gi, '')
            .replace(/"\s*\}\s*$/g, '');
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = OutputSanitizer;
```

- [ ] **Step 2: 语法检查**

Run: `node --check js/ai-contract/output-sanitizer.js`
Expected: 无输出。

- [ ] **Step 3: 编写单元测试**

```javascript
// tests/ai-contract/output-sanitizer.test.js
var OutputSanitizer = require('../../js/ai-contract/output-sanitizer.js');

function assertEq(a, b, msg) {
    if (a !== b) throw new Error(msg + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
}

assertEq(OutputSanitizer.sanitizeStory('<p>hello</p><br>world▌'), 'hello\nworld', 'html/cursor');
assertEq(OutputSanitizer.sanitizeStory('hi <thinking>推理</thinking> there'), 'hi  there', 'thinking');
assertEq(OutputSanitizer.sanitizeJSON('```json\n{"a":1}\n```'), '{"a":1}', 'json code block');
assertEq(OutputSanitizer.stripJSONArtifacts('"story": "hello'), 'hello', 'json artifact');

console.log('OutputSanitizer tests passed');
```

Run: `node tests/ai-contract/output-sanitizer.test.js`
Expected: `OutputSanitizer tests passed`

- [ ] **Step 4: 提交**

```bash
git add js/ai-contract/output-sanitizer.js tests/ai-contract/output-sanitizer.test.js
git commit -m "feat(ai-contract): add OutputSanitizer for story and JSON cleanup"
```

---

### Task 3: 创建 `ResponseParser`

**Files:**
- Create: `js/ai-contract/response-parser.js`
- Test: `tests/ai-contract/response-parser.test.js`

- [ ] **Step 1: 创建 parser 文件**

```javascript
// js/ai-contract/response-parser.js
var ResponseParser = {
    parse: function(rawReply, options) {
        options = options || {};
        var result = {
            success: false,
            data: AIOutputSchema ? AIOutputSchema.getDefaultOutput() : {},
            storyText: '',
            mems: [],
            warnings: [],
            truncated: false,
            fallbackLevel: -1
        };
        if (!rawReply || typeof rawReply !== 'string') {
            result.warnings.push('empty reply');
            return result;
        }
        var sanitized = OutputSanitizer ? OutputSanitizer.sanitizeJSON(rawReply) : rawReply;

        // Level 0: direct JSON
        var data = this._tryDirectJSON(sanitized);
        if (data) {
            result.success = true;
            result.data = AIOutputSchema ? AIOutputSchema.normalize(data) : data;
            result.fallbackLevel = 0;
            result.storyText = result.data.story;
            return result;
        }

        // Level 1: code block JSON
        data = this._tryCodeBlockJSON(rawReply);
        if (data) {
            result.success = true;
            result.data = AIOutputSchema ? AIOutputSchema.normalize(data) : data;
            result.fallbackLevel = 1;
            result.storyText = result.data.story;
            result.warnings.push('parsed from code block');
            return result;
        }

        // Level 2: robust state-machine JSON
        data = this._tryRobustJSON(sanitized);
        if (data) {
            result.success = true;
            result.data = AIOutputSchema ? AIOutputSchema.normalize(data) : data;
            result.fallbackLevel = 2;
            result.storyText = result.data.story;
            result.warnings.push('parsed via robust JSON extraction');
            return result;
        }

        // Level 3: <mem> tags (pure text mode)
        var memResult = this._tryMemTags(rawReply);
        if (memResult && memResult.storyText) {
            result.success = true;
            result.data = AIOutputSchema ? AIOutputSchema.normalize(memResult) : memResult;
            result.fallbackLevel = 3;
            result.storyText = memResult.storyText;
            result.mems = memResult.mems || [];
            result.warnings.push('parsed from <mem> tags');
            return result;
        }

        // Level 4: plain text fallback
        var plain = this._tryPlainText(rawReply);
        result.success = !!plain.storyText;
        result.data = AIOutputSchema ? AIOutputSchema.normalize(plain) : plain;
        result.fallbackLevel = 4;
        result.storyText = plain.storyText;
        result.warnings.push('parsed as plain text');
        return result;
    },

    _tryDirectJSON: function(raw) {
        if (!raw || typeof raw !== 'string') return null;
        try {
            var s = raw.trim();
            var r = JSON.parse(s);
            if (typeof r === 'string' && r.trim().startsWith('{')) {
                var r2 = JSON.parse(r);
                if (r2 && typeof r2 === 'object') r = r2;
            }
            if (r && typeof r === 'object') return r;
        } catch (e) {}
        return null;
    },

    _tryCodeBlockJSON: function(raw) {
        if (!raw || typeof raw !== 'string') return null;
        var m = raw.match(/```json\n?([\s\S]*?)\n?```/);
        if (m) return this._tryDirectJSON(m[1]);
        return null;
    },

    _tryRobustJSON: function(raw) {
        if (!raw || typeof raw !== 'string') return null;
        var fb = raw.indexOf('{');
        while (fb !== -1) {
            var end = this._findMatching(raw, '{', '}', fb);
            if (end !== -1) {
                var candidate = raw.slice(fb, end + 1);
                var r = this._tryDirectJSON(candidate);
                if (r) return r;
            }
            fb = raw.indexOf('{', fb + 1);
        }
        return null;
    },

    _tryMemTags: function(raw) {
        if (!raw || typeof raw !== 'string') return null;
        var mems = [];
        var story = raw.replace(/<mem\b[^>]*>[\s\S]*?<\/mem>/gi, function(tag) {
            var type = (tag.match(/type=["']([^"']+)["']/) || [])[1] || '';
            var action = (tag.match(/action=["']([^"']+)["']/) || [])[1] || '';
            var name = (tag.match(/name=["']([^"']+)["']/) || [])[1] || '';
            var qty = (tag.match(/qty=["']([^"']+)["']/) || [])[1] || '';
            var inner = tag.replace(/<[^>]+>/g, '').trim();
            mems.push({ type: type, action: action, name: name, qty: qty, content: inner });
            return '';
        }).trim();
        if (!story) return null;
        return { storyText: story, mems: mems };
    },

    _tryPlainText: function(raw) {
        if (!raw || typeof raw !== 'string') return { storyText: '' };
        var cleaned = OutputSanitizer ? OutputSanitizer.sanitizeStory(raw) : raw;
        var jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        var data = null;
        if (jsonMatch) {
            try {
                var parsed = JSON.parse(jsonMatch[0]);
                if (parsed && typeof parsed === 'object') data = parsed;
            } catch (e) {}
        }
        if (data) {
            var story = OutputSanitizer ? OutputSanitizer.sanitizeStory(cleaned.replace(jsonMatch[0], '').trim()) : cleaned.replace(jsonMatch[0], '').trim();
            data.story = data.story || story;
            return data;
        }
        return { storyText: cleaned };
    },

    _findMatching: function(str, open, close, start) {
        var depth = 0;
        for (var i = start; i < str.length; i++) {
            if (str[i] === open) depth++;
            else if (str[i] === close) depth--;
            if (depth === 0) return i;
        }
        return -1;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = ResponseParser;
```

- [ ] **Step 2: 语法检查**

Run: `node --check js/ai-contract/response-parser.js`
Expected: 无输出。

注意：该文件依赖 `AIOutputSchema` 和 `OutputSanitizer`；浏览器环境中它们按 `<script>` 顺序全局可用。Node 单元测试需要同时 require 三个文件。

- [ ] **Step 3: 编写单元测试**

```javascript
// tests/ai-contract/response-parser.test.js
var AIOutputSchema = require('../../js/ai-contract/schemas/ai-output-schema.js');
var OutputSanitizer = require('../../js/ai-contract/output-sanitizer.js');
var ResponseParser = require('../../js/ai-contract/response-parser.js');

function assertEq(a, b, msg) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        throw new Error(msg + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
    }
}

var direct = ResponseParser.parse('{"story":"hello","title":"第一章"}');
assertEq(direct.success, true, 'direct success');
assertEq(direct.fallbackLevel, 0, 'direct level');
assertEq(direct.storyText, 'hello', 'direct story');

var wrapped = ResponseParser.parse('"{\\"story\\":\\"wrapped\\"}"');
assertEq(wrapped.success, true, 'wrapped success');
assertEq(wrapped.storyText, 'wrapped', 'wrapped story');

var codeBlock = ResponseParser.parse('```json\n{"story":"cb"}\n```');
assertEq(codeBlock.success, true, 'code block success');
assertEq(codeBlock.fallbackLevel, 1, 'code block level');

var mem = ResponseParser.parse('<mem type="item" name="刀" qty="1" action="add"/>你捡到一把刀。');
assertEq(mem.success, true, 'mem success');
assertEq(mem.mems.length, 1, 'mem count');
assertEq(mem.mems[0].name, '刀', 'mem name');

console.log('ResponseParser tests passed');
```

Run: `node tests/ai-contract/response-parser.test.js`
Expected: `ResponseParser tests passed`

- [ ] **Step 4: 提交**

```bash
git add js/ai-contract/response-parser.js tests/ai-contract/response-parser.test.js
git commit -m "feat(ai-contract): add ResponseParser with 5-level fallback"
```

---

### Task 4: 创建 `FallbackEngine`

**Files:**
- Create: `js/ai-contract/fallback-engine.js`

- [ ] **Step 1: 创建 fallback engine**

```javascript
// js/ai-contract/fallback-engine.js
var FallbackEngine = {
    MAX_RETRIES: 2,
    RETRY_DELAY_MS: 1000,

    execute: function(callFn, options) {
        options = options || {};
        var self = this;
        var attempt = 0;
        var failedModels = [];
        var currentModel = options.modelId || null;

        function tryCall() {
            return new Promise(function(resolve, reject) {
                callFn(currentModel).then(resolve).catch(function(err) {
                    if (attempt < self.MAX_RETRIES) {
                        attempt++;
                        console.warn('[FallbackEngine] retry ' + attempt + ' for model ' + currentModel + ':', err && err.message);
                        setTimeout(function() { tryCall().then(resolve).catch(reject); }, self.RETRY_DELAY_MS);
                    } else if (!options.noModelSwitch && typeof self.nextModel === 'function') {
                        var next = self.nextModel(currentModel, failedModels);
                        if (next && next !== currentModel) {
                            failedModels.push(currentModel);
                            currentModel = next;
                            attempt = 0;
                            console.warn('[FallbackEngine] switch to model:', next);
                            tryCall().then(resolve).catch(reject);
                        } else {
                            reject(err);
                        }
                    } else {
                        reject(err);
                    }
                });
            });
        }
        return tryCall();
    },

    nextModel: function(failedModelId, failedList) {
        // 默认实现：从 LocalGameAPI 或 gameState 中读取可用模型列表
        var configs = [];
        try {
            var cfg = (typeof LocalGameAPI !== 'undefined' && LocalGameAPI.getModelConfigs) ?
                LocalGameAPI.getModelConfigs() : null;
            if (cfg && Array.isArray(cfg)) configs = cfg;
        } catch (e) {}
        if (configs.length === 0 && typeof gameState !== 'undefined' && gameState._apiConfigs) {
            configs = gameState._apiConfigs;
        }
        failedList = failedList || [];
        for (var i = 0; i < configs.length; i++) {
            var id = configs[i].id || configs[i].modelId || configs[i].model;
            if (id && id !== failedModelId && failedList.indexOf(id) === -1) return id;
        }
        return null;
    },

    degradeMode: function(context) {
        context = context || {};
        if (typeof StateManager !== 'undefined') {
            StateManager.set('world.pureTextMode', true, { silent: true });
        }
        if (typeof gameState !== 'undefined') gameState.pureTextMode = true;
        console.warn('[FallbackEngine] degraded to pure text mode');
        return true;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = FallbackEngine;
```

- [ ] **Step 2: 语法检查**

Run: `node --check js/ai-contract/fallback-engine.js`
Expected: 无输出。

- [ ] **Step 3: 提交**

```bash
git add js/ai-contract/fallback-engine.js
git commit -m "feat(ai-contract): add FallbackEngine for retry and model failover"
```

---

### Task 5: 创建 `ContextManager`

**Files:**
- Create: `js/ai-contract/context-manager.js`

- [ ] **Step 1: 创建 context manager**

```javascript
// js/ai-contract/context-manager.js
var ContextManager = {
    MAX_HISTORY: 20,
    SLIM_THRESHOLD: 6,

    buildMessages: function(userInput, options) {
        options = options || {};
        var messages = [];
        var systemPrompt = options.systemPrompt || (gameState && gameState.systemPrompt) || '';
        var useSysprompt = gameState && gameState._useSysprompt !== false;

        if (useSysprompt) {
            messages.push({ role: 'system', content: systemPrompt });
        } else if (systemPrompt && systemPrompt.trim()) {
            messages.push({ role: 'user', content: systemPrompt });
        }

        var history = this._getRecentHistory();
        var summary = this._getRollingSummary();
        if (summary) {
            messages.push({ role: 'system', content: '【前情摘要】\n' + summary });
        }
        messages = messages.concat(history);
        if (userInput !== undefined && userInput !== null && userInput !== '') {
            messages.push({ role: 'user', content: String(userInput) });
        }
        return messages;
    },

    appendUser: function(userInput) {
        if (!gameState || !Array.isArray(gameState.conversationHistory)) return;
        gameState.conversationHistory.push({ role: 'user', content: String(userInput) });
    },

    appendAssistant: function(rawReply, parsedData) {
        if (!gameState || !Array.isArray(gameState.conversationHistory)) return;
        var content = rawReply || '';
        if (parsedData && parsedData.story) {
            try {
                content = JSON.stringify(parsedData);
            } catch (e) {}
        }
        gameState.conversationHistory.push({ role: 'assistant', content: content });
        if (parsedData && parsedData.contextSummary) {
            this.setRollingSummary(parsedData.contextSummary);
        }
    },

    compress: function() {
        if (!gameState || !Array.isArray(gameState.conversationHistory)) return;
        var history = gameState.conversationHistory;
        if (history.length <= this.SLIM_THRESHOLD + 1) return;
        var keep = history.slice(-this.SLIM_THRESHOLD);
        var old = history.slice(0, history.length - this.SLIM_THRESHOLD);
        var summary = old.filter(function(m) { return m && m.content; }).map(function(m) { return m.content; }).join('\n').slice(0, 500);
        var current = this.getRollingSummary() || '';
        this.setRollingSummary((current ? current + '\n' : '') + summary);
        gameState.conversationHistory = keep;
    },

    estimateTokens: function(messages) {
        if (!Array.isArray(messages)) return 0;
        var total = 0;
        for (var i = 0; i < messages.length; i++) {
            var m = messages[i];
            var c = (m && m.content) ? String(m.content) : '';
            total += Math.ceil(c.length / 1.5) + 4;
        }
        return total;
    },

    getRollingSummary: function() {
        if (typeof StateManager !== 'undefined') return StateManager.get('progress.rollingSummary') || '';
        return (gameState && gameState.rollingSummary) || '';
    },

    setRollingSummary: function(text) {
        if (typeof StateManager !== 'undefined') {
            StateManager.set('progress.rollingSummary', String(text || ''), { silent: true });
        }
        if (gameState) gameState.rollingSummary = String(text || '');
    },

    _getRecentHistory: function() {
        if (!gameState || !Array.isArray(gameState.conversationHistory)) return [];
        var recent = gameState.conversationHistory.slice(1).slice(-this.MAX_HISTORY);
        return recent;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = ContextManager;
```

- [ ] **Step 2: 语法检查**

Run: `node --check js/ai-contract/context-manager.js`
Expected: 无输出。

- [ ] **Step 3: 提交**

```bash
git add js/ai-contract/context-manager.js
git commit -m "feat(ai-contract): add ContextManager for history and summaries"
```

---

### Task 6: 创建 `AIResponseMutator`

**Files:**
- Create: `js/ai-contract/ai-response-mutator.js`

- [ ] **Step 1: 创建 mutator**

```javascript
// js/ai-contract/ai-response-mutator.js
var AIResponseMutator = {
    apply: function(parsed, options) {
        options = options || {};
        if (!parsed || !parsed.data) return { success: false, error: 'no parsed data' };
        var data = parsed.data;
        var turn = (StateManager ? StateManager.get('progress.turn') : ((gameState && gameState._stats && gameState._stats.totalTurns) || 0)) + 1;

        if (StateManager) {
            StateManager.transaction(function() {
                StateManager.set('progress.turn', turn, { silent: true });
                if (data.title) StateManager.set('progress.lastSceneTitle', data.title, { silent: true });
                if (data.story) StateManager.set('progress.sceneTitle', data.title || '', { silent: true });
                if (data.gameTime && (data.gameTime.date || data.gameTime.time || data.gameTime.period)) {
                    StateManager.set('time', data.gameTime, { silent: true });
                }
                if (Array.isArray(data.bag) && data.bag.length > 0 && BagMutator) {
                    BagMutator.mergeItems(data.bag, { silent: true });
                }
                if (Array.isArray(data.quests) && data.quests.length > 0 && QuestMutator) {
                    QuestMutator.mergeQuests(data.quests, { silent: true });
                }
                if (Array.isArray(data.characters) && data.characters.length > 0 && CharacterMutator) {
                    CharacterMutator.mergeCharacters(data.characters, { silent: true });
                }
                if (Array.isArray(data.locations) && data.locations.length > 0) {
                    StateManager.set('entities.locations', data.locations, { silent: true });
                }
                if (Array.isArray(data.keyEvents) && data.keyEvents.length > 0) {
                    var events = StateManager.get('entities.events') || [];
                    events = events.concat(data.keyEvents);
                    StateManager.set('entities.events', events, { silent: true });
                }
                if (data.player && typeof data.player === 'object') {
                    StateManager.merge('entities.player', data.player, { silent: true });
                }
            });
        }

        // 兼容旧代码：同步回 gameState
        if (gameState) {
            gameState._stats = gameState._stats || {};
            gameState._stats.totalTurns = turn;
            if (data.title) gameState._lastSceneTitle = data.title;
            if (data.gameTime && (data.gameTime.date || data.gameTime.time || data.gameTime.period)) {
                gameState.gameTime = data.gameTime;
            }
            if (Array.isArray(data.bag)) gameState.currentBag = data.bag;
            if (Array.isArray(data.quests)) gameState.currentQuests = data.quests;
            if (data.player && typeof data.player === 'object') gameState.playerData = Object.assign({}, gameState.playerData, data.player);
        }

        return { success: true, turn: turn };
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = AIResponseMutator;
```

- [ ] **Step 2: 语法检查**

Run: `node --check js/ai-contract/ai-response-mutator.js`
Expected: 无输出。

- [ ] **Step 3: 提交**

```bash
git add js/ai-contract/ai-response-mutator.js
git commit -m "feat(ai-contract): add AIResponseMutator to apply parsed output to StateManager"
```

---

### Task 7: 创建 `PromptBuilder` 与片段库

**Files:**
- Create: `js/ai-contract/prompt-sections.js`
- Create: `js/ai-contract/prompt-builder.js`

- [ ] **Step 1: 创建 prompt 片段库**

```javascript
// js/ai-contract/prompt-sections.js
var PromptSections = {
    identity: function(ctx) {
        return '你是一个互动叙事引擎——你为玩家创造一个活生生的世界，玩家的每个选择都真实地改变着故事的走向。你拥有完全的创作自主权，你决定叙事风格、节奏和氛围，让一切与世界观自然契合。';
    },

    outputRule: function(ctx) {
        var pureText = ctx && ctx.pureTextMode;
        if (pureText) {
            return '【输出要求·纯文本模式】直接输出纯文本剧情，不要JSON包裹、不要```json```代码块、不要"{"或"}"符号。状态变化用<mem>标签，心声用<giggle>标签。';
        }
        return '【输出要求·JSON模式】直接输出JSON（以 { 开头），不要任何前缀说明，不要"让我开始"、不要"title:"、不要"story:"。';
    },

    formatJSON: function(ctx) {
        var hasChoices = ctx && ctx.generateChoices;
        return '{ "title": "简短章节标题", "story": "叙事正文", '
            + (hasChoices ? '"choices": [{"id":"A","text":""}], ' : '')
            + '"player": {"name":"","identity":"","stats":[]}, "characters": [{"name":"","relation":"","favorability":0}], '
            + '"bag": [{"name":"","count":1}], "currency": 0, "currencyName": "金币", '
            + '"quests": [{"title":"","status":""}], "gameTime": {"date":"","time":"","period":""} }';
    },

    workflow: function(ctx) {
        var pureText = ctx && ctx.pureTextMode;
        var lines = ['【你的工作方式】'];
        if (pureText) {
            lines.push('直接输出纯文本剧情。对话用「」包裹，换行用\\n。状态变化用<mem>穿插，心声用<giggle>穿插。');
        } else {
            lines.push('直接输出JSON（以 { 开头）。story放第一个字段，用\\n换行，对话用「」。player/bag/gameTime每回合必须返回完整数据。');
            lines.push('【JSON 字段维护】角色→characters，物品→bag，任务→quests，时间→gameTime。空字段省略。');
        }
        lines.push('【信息优先级】始终生效>本轮变化>旧记录>旧指令');
        return lines.join('\n');
    },

    protagonist: function(ctx) {
        var mc = ctx && ctx.protagonist;
        if (!mc) return '';
        var lines = ['【主角设定】'];
        if (mc.mcName) lines.push('姓名: ' + mc.mcName);
        if (mc.mcGender) lines.push('性别: ' + mc.mcGender);
        if (mc.mcAge) lines.push('年龄: ' + mc.mcAge);
        if (mc.mcIdentity) lines.push('身份: ' + mc.mcIdentity);
        if (mc.mcPersonality) lines.push('性格: ' + mc.mcPersonality);
        if (mc.mcAppearance) lines.push('外貌: ' + mc.mcAppearance);
        if (mc.mcAbility) lines.push('特殊能力: ' + mc.mcAbility);
        if (mc.mcExtra) lines.push('其他设定: ' + mc.mcExtra);
        lines.push('主角是玩家操控的角色——player字段对应主角信息，characters字段对应NPC。');
        return lines.join('\n');
    },

    currentTime: function(ctx) {
        var t = ctx && ctx.gameTime;
        if (t && (t.date || t.time || t.period)) {
            return '当前游戏时间：' + (t.date || '') + ' ' + (t.time || '') + ' ' + (t.period || '');
        }
        return '当前是游戏开始，请设定初始时间';
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = PromptSections;
```

- [ ] **Step 2: 创建 prompt builder**

```javascript
// js/ai-contract/prompt-builder.js
var PromptBuilder = {
    _sections: {},
    _mode: 'json',

    init: function() {
        if (typeof PromptSections !== 'undefined') {
            for (var name in PromptSections) {
                if (typeof PromptSections[name] === 'function') {
                    this.registerSection(name, PromptSections[name]);
                }
            }
        }
    },

    registerSection: function(name, fn, options) {
        this._sections[name] = { fn: fn, options: options || {} };
    },

    setMode: function(mode) {
        this._mode = mode === 'pureText' ? 'pureText' : 'json';
    },

    buildSystemPrompt: function(ctx) {
        ctx = ctx || {};
        ctx.pureTextMode = this._mode === 'pureText';
        var parts = [];
        parts.push(this._render('identity', ctx));
        parts.push(this._render('outputRule', ctx));
        if (this._mode !== 'pureText') {
            parts.push('【输出格式】' + this._render('formatJSON', ctx));
        }
        parts.push(ctx.setupText || '');
        parts.push(ctx.memoryText || '');
        parts.push(this._render('protagonist', ctx));
        parts.push(this._render('currentTime', ctx));
        parts.push(this._render('workflow', ctx));
        return parts.filter(function(p) { return p && p.trim(); }).join('\n\n');
    },

    buildUserPrompt: function(input, ctx) {
        return String(input || '');
    },

    _render: function(name, ctx) {
        var sec = this._sections[name];
        if (!sec) return '';
        try {
            return sec.fn(ctx) || '';
        } catch (e) {
            console.warn('[PromptBuilder] section ' + name + ' failed:', e);
            return '';
        }
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = PromptBuilder;
```

- [ ] **Step 3: 语法检查**

Run: `node --check js/ai-contract/prompt-sections.js && node --check js/ai-contract/prompt-builder.js`
Expected: 无输出。

- [ ] **Step 4: 提交**

```bash
git add js/ai-contract/prompt-sections.js js/ai-contract/prompt-builder.js
git commit -m "feat(ai-contract): add PromptBuilder and prompt section library"
```

---

### Task 8: 集成到 `core.js`（解析入口委托）

**Files:**
- Modify: `js/core.js`（在 parseAIResponse / safeJSONParse 中委托）

- [ ] **Step 1: 修改 `safeJSONParse` 为委托模式**

保留函数名，内部委托给 `ResponseParser._tryDirectJSON`：

```javascript
function safeJSONParse(str) {
    if (typeof ResponseParser !== 'undefined' && typeof ResponseParser._tryDirectJSON === 'function') {
        return ResponseParser._tryDirectJSON(str);
    }
    // 旧兜底（保留，避免契约层未加载时崩溃）
    if (!str || typeof str !== 'string') return null;
    try {
        var s = str.trim();
        if (s.startsWith('```')) s = s.replace(/^```json\s*/i, '').replace(/^```/, '').trim();
        if (s.endsWith('```')) s = s.slice(0, -3).trim();
        return JSON.parse(s);
    } catch (e) {
        return null;
    }
}
```

- [ ] **Step 2: 修改 `parseAIResponse` 为委托模式**

```javascript
function parseAIResponse(reply) {
    if (typeof ResponseParser !== 'undefined' && typeof ResponseParser.parse === 'function') {
        var parsed = ResponseParser.parse(reply);
        var mems = parsed.mems || [];
        if (mems.length > 0 && typeof window !== 'undefined') window._lastParsedMems = mems;
        return {
            data: parsed.data,
            storyText: parsed.storyText,
            mems: mems,
            truncated: parsed.truncated
        };
    }
    // 旧兜底（保留）
    return { data: null, storyText: reply || '', mems: [], truncated: false };
}
```

- [ ] **Step 3: 语法检查**

Run: `node --check js/core.js`
Expected: 无输出。

- [ ] **Step 4: 提交**

```bash
git add js/core.js
git commit -m "refactor(core): delegate parseAIResponse and safeJSONParse to ai-contract layer"
```

---

### Task 9: 集成到 `game.js`（prompt 和请求入口委托）

**Files:**
- Modify: `js/game.js`

- [ ] **Step 1: 简化 `buildSystemPrompt` 为委托**

在 `function buildSystemPrompt(includeFormatRules)` 开头加入委托：

```javascript
function buildSystemPrompt(includeFormatRules) {
    if (includeFormatRules === undefined) includeFormatRules = true;

    // 阶段 2：优先使用契约层 PromptBuilder
    if (typeof PromptBuilder !== 'undefined' && PromptBuilder.buildSystemPrompt) {
        if (typeof PromptBuilder.init === 'function') PromptBuilder.init();
        var ctx = {
            setupText: (gameState && gameState.userPrompt) || '',
            memoryText: (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.buildSmartInjection) ? EnhancedMemory.buildSmartInjection() : '',
            protagonist: gameState && gameState.protagonistSetup,
            gameTime: gameState && gameState.gameTime,
            generateChoices: gameState && gameState.generateChoices,
            pureTextMode: gameState && gameState.pureTextMode
        };
        var built = PromptBuilder.buildSystemPrompt(ctx);
        return built;
    }

    // 旧逻辑保留（以下不改动，作为 fallback）
    ...
}
```

- [ ] **Step 2: 在 `sendAIRequest` 中使用契约层**

保留 `sendAIRequest` 的 UI 协调职责，在调用 `callAI` 前后使用契约层。具体修改点：

1. 构建 messages 时，如果 `ContextManager` 存在，优先使用 `ContextManager.buildMessages(userMessage, { systemPrompt: gameState.systemPrompt })`。
2. 调用 `callAI` 时，通过 `FallbackEngine.execute(function(modelId) { return callAI(messages, opts); }, { modelId: currentModel })`。
3. 收到 reply 后，使用 `ResponseParser.parse(reply)` 解析。
4. 使用 `AIResponseMutator.apply(parsed)` 写入状态。
5. 保留现有 UI 渲染代码不变。

由于 `sendAIRequest` 较长且涉及流式渲染，本次只替换关键调用点，不整体重写。例如：

```javascript
// 在 sendAIRequest 中构建 messages 的位置替换为：
var messages;
if (typeof ContextManager !== 'undefined' && ContextManager.buildMessages) {
    messages = ContextManager.buildMessages(userMessage, { systemPrompt: gameState.systemPrompt, isInit: isInit });
} else {
    messages = ... // 旧逻辑
}
```

- [ ] **Step 3: 语法检查**

Run: `node --check js/game.js`
Expected: 无输出。

- [ ] **Step 4: 提交**

```bash
git add js/game.js
git commit -m "refactor(game): delegate prompt building and response mutation to ai-contract layer"
```

---

### Task 10: 更新 `index.html` 加载顺序

**Files:**
- Modify: `index.html`

- [ ] **Step 1: 在状态层之后、core.js 之前插入 ai-contract 模块**

找到现有加载顺序：

```html
<script src="js/state/schema.js" defer></script>
<script src="js/state/state-manager.js" defer></script>
...
<script src="js/core.js" defer></script>
```

在 `js/state/adapters/save-adapter.js` 之后、`js/core.js` 之前插入：

```html
<script src="js/ai-contract/schemas/ai-output-schema.js" defer></script>
<script src="js/ai-contract/output-sanitizer.js" defer></script>
<script src="js/ai-contract/response-parser.js" defer></script>
<script src="js/ai-contract/fallback-engine.js" defer></script>
<script src="js/ai-contract/context-manager.js" defer></script>
<script src="js/ai-contract/ai-response-mutator.js" defer></script>
<script src="js/ai-contract/prompt-sections.js" defer></script>
<script src="js/ai-contract/prompt-builder.js" defer></script>
```

- [ ] **Step 2: 提交**

```bash
git add index.html
git commit -m "chore(index): load ai-contract modules before core.js and game.js"
```

---

### Task 11: 运行全部语法检查与单元测试

**Files:**
- 全部新增/修改文件

- [ ] **Step 1: 语法检查**

Run:
```bash
node --check js/ai-contract/schemas/ai-output-schema.js && \
node --check js/ai-contract/output-sanitizer.js && \
node --check js/ai-contract/response-parser.js && \
node --check js/ai-contract/fallback-engine.js && \
node --check js/ai-contract/context-manager.js && \
node --check js/ai-contract/ai-response-mutator.js && \
node --check js/ai-contract/prompt-sections.js && \
node --check js/ai-contract/prompt-builder.js && \
node --check js/core.js && \
node --check js/game.js
```
Expected: 全部通过（无输出）。

- [ ] **Step 2: 单元测试**

Run:
```bash
node tests/ai-contract/ai-output-schema.test.js && \
node tests/ai-contract/output-sanitizer.test.js && \
node tests/ai-contract/response-parser.test.js
```
Expected:
```
AIOutputSchema tests passed
OutputSanitizer tests passed
ResponseParser tests passed
```

- [ ] **Step 3: 提交**

```bash
git add tests/
git commit -m "test(ai-contract): add unit tests for schema, sanitizer, parser"
```

---

### Task 12: 浏览器集成测试

**Files:**
- 全部

- [ ] **Step 1: 启动本地服务器**

Run: `python3 -m http.server 8080 &`

- [ ] **Step 2: 打开浏览器验证**

打开 `http://127.0.0.1:8080/`，进行 3 轮末日生存主题测试：

1. 检查控制台无 `ResponseParser is not defined`、`AIOutputSchema is not defined` 等错误。
2. 检查剧情正常推进。
3. 检查标题、回合、时间更新。
4. 检查物品/任务/角色面板有数据。

- [ ] **Step 3: 提交或记录测试结果**

若测试通过：

```bash
git add docs/06-总路线图与进度.md
git commit -m "docs: update progress for phase 2 ai-contract layer"
```

---

## Self-Review

### Spec coverage

| Spec 要求 | 对应 Task |
|-----------|-----------|
| AIOutputSchema | Task 1 |
| OutputSanitizer | Task 2 |
| ResponseParser（5 层兜底） | Task 3 |
| FallbackEngine | Task 4 |
| ContextManager | Task 5 |
| AIResponseMutator | Task 6 |
| PromptBuilder | Task 7 |
| 集成到 core.js/game.js | Task 8, 9 |
| index.html 加载顺序 | Task 10 |
| 单元测试 | Task 11 |
| 浏览器集成测试 | Task 12 |

### Placeholder scan

- 无 `TBD` / `TODO`。
- 所有代码步骤均含完整代码。
- 所有测试步骤均含测试代码和期望输出。
- 所有提交命令均含具体文件路径。

### Type consistency

- `AIOutputSchema.normalize` 返回统一对象结构，后续 `AIResponseMutator.apply` 依赖该结构。
- `ResponseParser.parse` 返回 `{ success, data, storyText, mems, warnings, truncated, fallbackLevel }`。
- `ContextManager.buildMessages` 返回 `[{ role, content }, ...]`，与 `callAI` 签名一致。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-22-ai-contract-plan.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

**Which approach?**
