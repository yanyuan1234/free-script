# 阶段 1：统一状态层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` or `general_purpose_task` subagent to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 `js/state/` 状态层，让 `gameState` 成为单一事实来源，所有状态读写通过 `StateManager` API。

**Architecture:** 新增 `StateManager` 作为唯一状态读写入口，按 `schema.js` 定义的数据模型组织状态；通过 Mutator 封装各实体变更；通过 Adapter 与 `GameMemory` / `SaveDB` 同步；通过订阅机制替代 `GameLinker` 硬编码映射。新旧代码共存，逐步替换。

**Tech Stack:** 纯 JavaScript（ES5/ES6 兼容语法），无框架，依赖现有 `utils.js`。

---

## File Structure

| 文件 | 职责 |
|------|------|
| `js/state/schema.js` | 状态模型、默认值、旧字段映射、路径校验 |
| `js/state/state-manager.js` | 唯一状态读写入口：get/set/merge/subscribe/transaction |
| `js/state/mutators/bag-mutator.js` | 物品状态的所有变更操作 |
| `js/state/mutators/quest-mutator.js` | 任务状态的所有变更操作 |
| `js/state/mutators/character-mutator.js` | 角色/关系状态的所有变更操作 |
| `js/state/mutators/time-mutator.js` | 游戏时间的所有变更操作 |
| `js/state/adapters/game-memory-adapter.js` | StateManager 与 GameMemory 的双向同步 |
| `js/state/adapters/save-adapter.js` | 存档/读档格式转换与旧存档迁移 |
| `index.html` | 调整脚本加载顺序 |
| `js/init.js` | 在 `initApp` 中初始化 `StateManager` |
| `js/phone-ui.js` | 迁移 `renderItemsPage` / `renderBag` 读取路径 |
| `js/systems.js` | 迁移 `QuestSystem` 对 `gameState.currentQuests` 的访问 |
| `js/game.js` | 迁移 AI 返回后的状态合并逻辑到 `StateManager.transaction` |

---

## Task 1: Create `js/state/schema.js`

**Files:**
- Create: `js/state/schema.js`

**Prerequisites:** None

- [ ] **Step 1: Create directory and file**

```bash
mkdir -p js/state/mutators js/state/adapters
```

- [ ] **Step 2: Write the schema module**

Create `js/state/schema.js` with the following content:

```javascript
// ========================================
// 状态数据模型 - State Schema
// ========================================
var StateSchema = {
    // 当前存档格式版本，用于未来迁移
    VERSION: '1.0.0-state-layer',

    // 获取默认状态
    getDefaultState: function() {
        return {
            meta: {
                version: this.VERSION,
                createdAt: Date.now(),
                updatedAt: Date.now()
            },
            world: {
                userPrompt: '',
                setupText: '',
                theme: '',
                genre: '',
                pureTextMode: false,
                generateChoices: true,
                maxTokens: 4096,
                contextSize: 8192,
                temperature: 0.7
            },
            progress: {
                turn: 0,
                sceneTitle: '',
                lastSceneTitle: '',
                rollingSummary: '',
                conversationHistory: [],
                preAIState: {
                    title: '',
                    gameTime: null
                }
            },
            entities: {
                player: {
                    name: '',
                    identity: '',
                    stats: [],
                    level: 1,
                    exp: 0
                },
                characters: [],
                bag: [],
                quests: [],
                locations: [],
                events: []
            },
            time: {
                date: '',
                time: '',
                period: ''
            },
            ui: {
                currentPage: 'menu',
                lastChoices: [],
                logSubPage: '',
                lastHUD: null
            }
        };
    },

    // 旧字段名 -> 新路径映射
    _legacyToPath: {
        'userPrompt': 'world.userPrompt',
        'setupText': 'world.setupText',
        'theme': 'world.theme',
        'genre': 'world.genre',
        'pureTextMode': 'world.pureTextMode',
        'generateChoices': 'world.generateChoices',
        'maxTokens': 'world.maxTokens',
        'contextSize': 'world.contextSize',
        'temperature': 'world.temperature',
        '_stats.totalTurns': 'progress.turn',
        '_lastSceneTitle': 'progress.lastSceneTitle',
        'rollingSummary': 'progress.rollingSummary',
        'conversationHistory': 'progress.conversationHistory',
        '_preAIState': 'progress.preAIState',
        'playerData': 'entities.player',
        'allCharacters': 'entities.characters',
        'currentBag': 'entities.bag',
        'currentQuests': 'entities.quests',
        'keyEvents': 'entities.events',
        'gameTime': 'time',
        '_lastChoices': 'ui.lastChoices',
        '_lastHUD': 'ui.lastHUD',
        'currentPage': 'ui.currentPage'
    },

    // 新路径 -> 旧字段名映射
    _pathToLegacy: {},

    // 初始化反向映射
    _buildReverseMap: function() {
        if (Object.keys(this._pathToLegacy).length > 0) return;
        for (var key in this._legacyToPath) {
            this._pathToLegacy[this._legacyToPath[key]] = key;
        }
    },

    // 旧字段名转新路径
    getPath: function(legacyName) {
        return this._legacyToPath[legacyName] || legacyName;
    },

    // 新路径转旧字段名
    getLegacyName: function(path) {
        this._buildReverseMap();
        return this._pathToLegacy[path] || path;
    },

    // 判断路径是否为 world 域（初始化后只读）
    isReadOnly: function(path) {
        if (!path) return false;
        return path.indexOf('world.') === 0 || path === 'world';
    },

    // 判断路径是否有效（简单实现：允许任意点分路径）
    validatePath: function(path) {
        if (typeof path !== 'string' || path.length === 0) return false;
        return /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/.test(path);
    },

    // 标准化状态：把旧格式数据迁移到新 schema
    normalizeState: function(state) {
        if (!state || typeof state !== 'object') {
            return this.getDefaultState();
        }
        var result = this.getDefaultState();
        // 递归合并，优先保留已有值
        this._deepMerge(result, state);
        // 处理旧字段映射：把旧字段迁移到新路径
        for (var legacyName in this._legacyToPath) {
            if (legacyName.indexOf('.') !== -1) {
                // 暂不处理嵌套旧字段，靠 _deepMerge 保留
                continue;
            }
            if (state[legacyName] !== undefined) {
                var newPath = this._legacyToPath[legacyName];
                this._setByPath(result, newPath, state[legacyName]);
            }
        }
        result.meta.version = this.VERSION;
        result.meta.updatedAt = Date.now();
        return result;
    },

    // 深拷贝
    deepClone: function(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) {
            var arr = [];
            for (var i = 0; i < obj.length; i++) {
                arr.push(this.deepClone(obj[i]));
            }
            return arr;
        }
        var cloned = {};
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = this.deepClone(obj[key]);
            }
        }
        return cloned;
    },

    // 深合并（source 覆盖 target）
    _deepMerge: function(target, source) {
        if (!source || typeof source !== 'object') return target;
        for (var key in source) {
            if (!source.hasOwnProperty(key)) continue;
            var sv = source[key];
            var tv = target[key];
            if (sv !== null && typeof sv === 'object' && !Array.isArray(sv) &&
                tv !== null && typeof tv === 'object' && !Array.isArray(tv)) {
                this._deepMerge(tv, sv);
            } else {
                target[key] = this.deepClone(sv);
            }
        }
        return target;
    },

    // 按点分路径设置值
    _setByPath: function(obj, path, value) {
        if (!path) return;
        var parts = path.split('.');
        var current = obj;
        for (var i = 0; i < parts.length - 1; i++) {
            var p = parts[i];
            if (!current[p] || typeof current[p] !== 'object') {
                current[p] = {};
            }
            current = current[p];
        }
        current[parts[parts.length - 1]] = this.deepClone(value);
    }
};
```

- [ ] **Step 3: Verify syntax**

```bash
node --check js/state/schema.js
```

Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add js/state/schema.js
git commit -m "feat(state): add state schema with legacy field mapping"
```

---

## Task 2: Create `js/state/state-manager.js`

**Files:**
- Create: `js/state/state-manager.js`

**Prerequisites:** Task 1

- [ ] **Step 1: Write the StateManager module**

Create `js/state/state-manager.js`:

```javascript
// ========================================
// 状态管理器 - StateManager
// 唯一状态读写入口
// ========================================
var StateManager = {
    _state: null,
    _listeners: [],
    _inTransaction: false,
    _pendingChanges: [],
    _legacyMode: true,   // 迁移期间允许 getLegacy/setLegacy
    _nextToken: 1,

    // 初始化：接管全局 gameState
    init: function(state) {
        if (!state) {
            this._state = StateSchema.getDefaultState();
        } else {
            this._state = StateSchema.normalizeState(state);
        }
        // 保持全局引用一致
        if (typeof window !== 'undefined') {
            window.gameState = this._state;
        }
        this._listeners = [];
        this._pendingChanges = [];
        console.log('[StateManager] 初始化完成，版本:', this._state.meta.version);
    },

    // 获取完整深拷贝快照
    snapshot: function() {
        return StateSchema.deepClone(this._state);
    },

    // 按路径读取，返回深拷贝
    get: function(path) {
        if (!path) return this.snapshot();
        var value = this._getRaw(path);
        return StateSchema.deepClone(value);
    },

    // 按路径数组读取
    getIn: function(pathArray) {
        if (!Array.isArray(pathArray) || pathArray.length === 0) {
            return this.snapshot();
        }
        return this.get(pathArray.join('.'));
    },

    // 兼容旧字段名读取
    getLegacy: function(name) {
        var path = StateSchema.getPath(name);
        return this.get(path);
    },

    // 按路径写入
    set: function(path, value, options) {
        options = options || {};
        if (!StateSchema.validatePath(path)) {
            console.warn('[StateManager] 非法路径:', path);
            return false;
        }
        var oldValue = this._getRaw(path);
        this._setRaw(path, value);
        var change = {
            path: path,
            oldValue: StateSchema.deepClone(oldValue),
            newValue: StateSchema.deepClone(value)
        };
        if (this._inTransaction) {
            this._pendingChanges.push(change);
        } else if (!options.silent) {
            this._notify([change]);
        }
        return true;
    },

    // 兼容旧字段名写入
    setLegacy: function(name, value, options) {
        var path = StateSchema.getPath(name);
        return this.set(path, value, options);
    },

    // 合并部分对象到指定路径
    merge: function(path, partial, options) {
        options = options || {};
        var current = this.get(path);
        if (!current || typeof current !== 'object' || Array.isArray(current)) {
            current = {};
        }
        var merged = StateSchema._deepMerge ?
            StateSchema._deepMerge(StateSchema.deepClone(current), partial) :
            Object.assign({}, current, partial);
        return this.set(path, merged, options);
    },

    // 使用 updater 函数更新指定路径
    updateIn: function(pathArray, updater, options) {
        var current = this.getIn(pathArray);
        var updated = updater(StateSchema.deepClone(current));
        return this.set(pathArray.join('.'), updated, options);
    },

    // 订阅变更
    // pattern 支持：'entities.bag' / 'entities.*' / '**'
    subscribe: function(pattern, callback) {
        if (typeof callback !== 'function') return null;
        var token = this._nextToken++;
        this._listeners.push({
            token: token,
            pattern: pattern || '**',
            callback: callback
        });
        return token;
    },

    // 取消订阅
    unsubscribe: function(token) {
        this._listeners = this._listeners.filter(function(l) {
            return l.token !== token;
        });
    },

    // 事务：批量变更，结束时统一通知
    transaction: function(fn) {
        if (this._inTransaction) {
            // 嵌套事务直接执行
            return fn();
        }
        this._inTransaction = true;
        this._pendingChanges = [];
        var result;
        try {
            result = fn();
            this._inTransaction = false;
            var changes = this._pendingChanges;
            this._pendingChanges = [];
            this._notify(changes);
            return result;
        } catch (e) {
            this._inTransaction = false;
            this._pendingChanges = [];
            console.error('[StateManager] 事务执行失败，已回滚:', e);
            throw e;
        }
    },

    // 批量操作
    batch: function(operations) {
        var self = this;
        return this.transaction(function() {
            operations.forEach(function(op) {
                self.set(op.path, op.value, { silent: true });
            });
        });
    },

    // 内部：按路径读取原始值
    _getRaw: function(path) {
        var parts = path.split('.');
        var current = this._state;
        for (var i = 0; i < parts.length; i++) {
            if (current === null || current === undefined) return undefined;
            current = current[parts[i]];
        }
        return current;
    },

    // 内部：按路径写入原始值
    _setRaw: function(path, value) {
        var parts = path.split('.');
        var current = this._state;
        for (var i = 0; i < parts.length - 1; i++) {
            var p = parts[i];
            if (!current[p] || typeof current[p] !== 'object') {
                current[p] = {};
            }
            current = current[p];
        }
        current[parts[parts.length - 1]] = value;
    },

    // 内部：通知订阅者
    _notify: function(changes) {
        if (!changes || changes.length === 0) return;
        var snapshot = this.snapshot();
        var self = this;
        this._listeners.forEach(function(listener) {
            var matched = changes.some(function(change) {
                return self._matchPattern(listener.pattern, change.path);
            });
            if (matched) {
                try {
                    listener.callback(snapshot, changes);
                } catch (e) {
                    console.error('[StateManager] 订阅回调执行失败:', e);
                }
            }
        });
    },

    // 内部：模式匹配
    _matchPattern: function(pattern, path) {
        if (pattern === '**') return true;
        var pParts = pattern.split('.');
        var pathParts = path.split('.');
        for (var i = 0; i < pParts.length; i++) {
            if (pParts[i] === '*') {
                // 通配符匹配任意一层
                if (i >= pathParts.length) return false;
                continue;
            }
            if (pParts[i] === '**') return true;
            if (i >= pathParts.length) return false;
            if (pParts[i] !== pathParts[i]) return false;
        }
        return pParts.length === pathParts.length;
    }
};
```

- [ ] **Step 2: Verify syntax**

```bash
node --check js/state/state-manager.js
```

- [ ] **Step 3: Commit**

```bash
git add js/state/state-manager.js
git commit -m "feat(state): add StateManager with get/set/subscribe/transaction"
```

---

## Task 3: Create `js/state/mutators/bag-mutator.js`

**Files:**
- Create: `js/state/mutators/bag-mutator.js`

**Prerequisites:** Task 2

- [ ] **Step 1: Write the bag mutator**

Create `js/state/mutators/bag-mutator.js`:

```javascript
// ========================================
// 物品变更器 - BagMutator
// ========================================
var BagMutator = {
    // 设置整个物品列表（标准化后）
    setItems: function(items, options) {
        var normalized = (items || []).map(this.normalizeItem.bind(this)).filter(Boolean);
        return StateManager.set('entities.bag', normalized, options);
    },

    // 添加单个物品
    addItem: function(item, options) {
        var normalized = this.normalizeItem(item);
        if (!normalized) return false;
        var bag = StateManager.get('entities.bag') || [];
        var existing = bag.find(function(it) {
            return it.name === normalized.name;
        });
        if (existing) {
            existing.count = (existing.count || 1) + (normalized.count || 1);
        } else {
            bag.push(normalized);
        }
        return StateManager.set('entities.bag', bag, options);
    },

    // 移除物品
    removeItem: function(name, options) {
        var bag = StateManager.get('entities.bag') || [];
        var filtered = bag.filter(function(it) {
            return it.name !== name;
        });
        return StateManager.set('entities.bag', filtered, options);
    },

    // 更新物品
    updateItem: function(name, updater, options) {
        var bag = StateManager.get('entities.bag') || [];
        var updated = bag.map(function(it) {
            if (it.name === name) {
                var clone = StateSchema.deepClone(it);
                return updater(clone) || clone;
            }
            return it;
        });
        return StateManager.set('entities.bag', updated, options);
    },

    // 标准化物品格式
    normalizeItem: function(raw) {
        if (!raw) return null;
        var name = '';
        if (typeof raw === 'string') {
            name = raw.trim();
        } else {
            name = String(raw.name || raw.title || raw.item || '').trim();
        }
        // 过滤无效值
        if (!name || name === '无' || name.toLowerCase() === 'undefined' ||
            name.toLowerCase() === 'null' || name === '未知') {
            return null;
        }
        var count = 1;
        if (raw.count !== undefined) {
            var parsed = parseInt(raw.count);
            if (!isNaN(parsed) && parsed > 0) count = parsed;
        }
        var unit = raw.unit || '个';
        return {
            id: raw.id || ('item_' + name + '_' + Date.now()),
            name: name,
            count: count,
            unit: unit,
            rarity: raw.rarity || '普通',
            desc: raw.desc || raw.description || '',
            usable: !!raw.usable,
            effect: raw.effect || '',
            equippable: !!raw.equippable,
            equipped: !!raw.equipped,
            slot: raw.slot || ''
        };
    }
};
```

- [ ] **Step 2: Verify syntax**

```bash
node --check js/state/mutators/bag-mutator.js
```

- [ ] **Step 3: Commit**

```bash
git add js/state/mutators/bag-mutator.js
git commit -m "feat(state): add BagMutator with item normalization"
```

---

## Task 4: Create `js/state/mutators/quest-mutator.js`

**Files:**
- Create: `js/state/mutators/quest-mutator.js`

**Prerequisites:** Task 2

- [ ] **Step 1: Write the quest mutator**

Create `js/state/mutators/quest-mutator.js`:

```javascript
// ========================================
// 任务变更器 - QuestMutator
// ========================================
var QuestMutator = {
    // 内置状态映射
    STATUS: {
        ACTIVE: '进行中',
        COMPLETED: '已完成',
        FAILED: '已失败',
        ABANDONED: '已放弃'
    },
    TYPE: {
        MAIN: '主线',
        SIDE: '支线',
        HIDDEN: '隐藏'
    },

    // AI/旧状态英文映射到中文
    _statusMap: {
        'pending': '进行中',
        'active': '进行中',
        'in_progress': '进行中',
        'ongoing': '进行中',
        'completed': '已完成',
        'done': '已完成',
        'finished': '已完成',
        'success': '已完成',
        'failed': '已失败',
        'failure': '已失败',
        'fail': '已失败',
        'abandoned': '已放弃',
        'cancelled': '已放弃',
        'canceled': '已放弃'
    },

    // 设置任务列表
    setQuests: function(quests, options) {
        var normalized = (quests || []).map(this.normalizeQuest.bind(this)).filter(Boolean);
        return StateManager.set('entities.quests', normalized, options);
    },

    // 添加任务
    addQuest: function(quest, options) {
        var normalized = this.normalizeQuest(quest);
        if (!normalized) return false;
        var quests = StateManager.get('entities.quests') || [];
        var existing = quests.find(function(q) {
            return q.id === normalized.id || q.title === normalized.title;
        });
        if (existing) {
            // 合并更新
            Object.assign(existing, normalized);
        } else {
            quests.push(normalized);
        }
        return StateManager.set('entities.quests', quests, options);
    },

    // 更新任务
    updateQuest: function(id, updater, options) {
        var quests = StateManager.get('entities.quests') || [];
        var updated = quests.map(function(q) {
            if (q.id === id) {
                var clone = StateSchema.deepClone(q);
                return updater(clone) || clone;
            }
            return q;
        });
        return StateManager.set('entities.quests', updated, options);
    },

    // 标准化任务
    normalizeQuest: function(raw) {
        if (!raw) return null;
        var title = String(raw.title || raw.name || raw.quest || '').trim();
        if (!title) return null;
        var status = this.normalizeStatus(raw.status);
        var type = this.normalizeType(raw.type);
        return {
            id: raw.id || ('quest_' + title + '_' + Date.now()),
            title: title,
            type: type,
            status: status,
            desc: raw.desc || raw.description || '',
            progress: raw.progress || '0/1',
            hint: raw.hint || '',
            rewards: this.normalizeRewards(raw.rewards),
            deadline: raw.deadline || raw.timeLimit || null,
            priority: raw.priority || 50
        };
    },

    // 标准化状态
    normalizeStatus: function(status) {
        if (!status) return this.STATUS.ACTIVE;
        var key = String(status).toLowerCase().trim();
        return this._statusMap[key] || String(status);
    },

    // 标准化类型
    normalizeType: function(type) {
        if (!type) return this.TYPE.SIDE;
        var key = String(type).toLowerCase().trim();
        var map = {
            'main': this.TYPE.MAIN,
            '主线': this.TYPE.MAIN,
            'side': this.TYPE.SIDE,
            '支线': this.TYPE.SIDE,
            'hidden': this.TYPE.HIDDEN,
            '隐藏': this.TYPE.HIDDEN
        };
        return map[key] || String(type);
    },

    // 标准化奖励
    normalizeRewards: function(rewards) {
        if (!Array.isArray(rewards)) return [];
        return rewards.map(function(r) {
            if (!r) return null;
            return {
                type: r.type || 'item',
                name: r.name || r.title || '',
                amount: r.amount !== undefined ? r.amount : 1
            };
        }).filter(Boolean);
    }
};
```

- [ ] **Step 2: Verify syntax**

```bash
node --check js/state/mutators/quest-mutator.js
```

- [ ] **Step 3: Commit**

```bash
git add js/state/mutators/quest-mutator.js
git commit -m "feat(state): add QuestMutator with status/type normalization"
```

---

## Task 5: Create `js/state/mutators/character-mutator.js`

**Files:**
- Create: `js/state/mutators/character-mutator.js`

**Prerequisites:** Task 2

- [ ] **Step 1: Write the character mutator**

Create `js/state/mutators/character-mutator.js`:

```javascript
// ========================================
// 角色变更器 - CharacterMutator
// ========================================
var CharacterMutator = {
    // 设置角色列表
    setCharacters: function(characters, options) {
        var normalized = (characters || []).map(this.normalizeCharacter.bind(this)).filter(Boolean);
        return StateManager.set('entities.characters', normalized, options);
    },

    // 合并角色：同名更新，新名追加
    mergeCharacters: function(characters, options) {
        var self = this;
        var list = StateManager.get('entities.characters') || [];
        (characters || []).forEach(function(raw) {
            var normalized = self.normalizeCharacter(raw);
            if (!normalized) return;
            var idx = list.findIndex(function(c) {
                return c.name === normalized.name;
            });
            if (idx >= 0) {
                list[idx] = Object.assign({}, list[idx], normalized);
            } else {
                list.push(normalized);
            }
        });
        return StateManager.set('entities.characters', list, options);
    },

    // 更新角色关系
    updateRelationship: function(name, delta, options) {
        return this.updateCharacter(name, function(character) {
            character.favor = (character.favor || 0) + (delta || 0);
            return character;
        }, options);
    },

    // 通用更新
    updateCharacter: function(name, updater, options) {
        var characters = StateManager.get('entities.characters') || [];
        var updated = characters.map(function(c) {
            if (c.name === name) {
                var clone = StateSchema.deepClone(c);
                return updater(clone) || clone;
            }
            return c;
        });
        return StateManager.set('entities.characters', updated, options);
    },

    // 标准化角色
    normalizeCharacter: function(raw) {
        if (!raw) return null;
        var name = String(raw.name || raw.title || raw.character || '').trim();
        if (!name) return null;
        return {
            id: raw.id || ('char_' + name + '_' + Date.now()),
            name: name,
            identity: raw.identity || raw.role || '',
            desc: raw.desc || raw.description || '',
            favor: parseInt(raw.favor || raw.friendship || raw.relationship || 0) || 0,
            tags: Array.isArray(raw.tags) ? raw.tags : [],
            stats: this.normalizeStats(raw.stats),
            notes: raw.notes || ''
        };
    },

    // 标准化状态值
    normalizeStats: function(stats) {
        if (!stats) return [];
        if (Array.isArray(stats)) {
            return stats.map(function(s) {
                if (typeof s === 'string') return { name: s, value: 0 };
                return {
                    name: String(s.name || s.key || '').trim(),
                    value: parseInt(s.value !== undefined ? s.value : s.val) || 0
                };
            }).filter(function(s) { return s.name; });
        }
        if (typeof stats === 'object') {
            var result = [];
            for (var key in stats) {
                if (stats.hasOwnProperty(key)) {
                    result.push({ name: key, value: parseInt(stats[key]) || 0 });
                }
            }
            return result;
        }
        return [];
    }
};
```

- [ ] **Step 2: Verify syntax**

```bash
node --check js/state/mutators/character-mutator.js
```

- [ ] **Step 3: Commit**

```bash
git add js/state/mutators/character-mutator.js
git commit -m "feat(state): add CharacterMutator with merge support"
```

---

## Task 6: Create `js/state/mutators/time-mutator.js`

**Files:**
- Create: `js/state/mutators/time-mutator.js`

**Prerequisites:** Task 2

- [ ] **Step 1: Write the time mutator**

Create `js/state/mutators/time-mutator.js`:

```javascript
// ========================================
// 时间变更器 - TimeMutator
// ========================================
var TimeMutator = {
    // 设置完整时间
    setTime: function(time, options) {
        if (!time || typeof time !== 'object') {
            return StateManager.set('time', { date: '', time: '', period: '' }, options);
        }
        var normalized = {
            date: String(time.date || '').trim(),
            time: String(time.time || '').trim(),
            period: String(time.period || time.phase || '').trim()
        };
        return StateManager.set('time', normalized, options);
    },

    // 推进时间
    advance: function(options) {
        options = options || {};
        var current = StateManager.get('time') || {};
        var periodMap = {
            '清晨': '上午',
            '上午': '中午',
            '中午': '下午',
            '下午': '傍晚',
            '傍晚': '晚上',
            '晚上': '深夜',
            '深夜': '清晨'
        };
        var period = current.period || '清晨';
        var nextPeriod = options.nextPeriod || periodMap[period] || '清晨';
        var next = {
            date: current.date || '',
            time: '',
            period: nextPeriod
        };
        // 如果是新的一天
        if (period === '深夜' && nextPeriod === '清晨') {
            next.date = this._nextDate(current.date);
        }
        return StateManager.set('time', next, options);
    },

    // 简单日期推进（仅支持 "第N日" 或常见格式）
    _nextDate: function(dateStr) {
        if (!dateStr) return '第2日';
        var match = dateStr.match(/第\s*(\d+)\s*日/);
        if (match) {
            return '第' + (parseInt(match[1]) + 1) + '日';
        }
        return dateStr;
    }
};
```

- [ ] **Step 2: Verify syntax**

```bash
node --check js/state/mutators/time-mutator.js
```

- [ ] **Step 3: Commit**

```bash
git add js/state/mutators/time-mutator.js
git commit -m "feat(state): add TimeMutator for game time management"
```

---

## Task 7: Create `js/state/adapters/game-memory-adapter.js`

**Files:**
- Create: `js/state/adapters/game-memory-adapter.js`

**Prerequisites:** Task 2, Task 3, Task 4, Task 5

- [ ] **Step 1: Write the adapter**

Create `js/state/adapters/game-memory-adapter.js`:

```javascript
// ========================================
// GameMemory 适配器 - GameMemoryAdapter
// 维护 StateManager 与 GameMemory 之间的同步
// ========================================
var GameMemoryAdapter = {
    _syncLock: false,

    // 绑定：订阅 StateManager 变更，自动同步到 GameMemory
    bind: function() {
        var self = this;
        StateManager.subscribe('entities.**', function() {
            self.syncToGameMemory();
        });
        StateManager.subscribe('progress.**', function() {
            self.syncToGameMemory();
        });
        StateManager.subscribe('time', function() {
            self.syncToGameMemory();
        });
    },

    // StateManager -> GameMemory
    syncToGameMemory: function() {
        if (this._syncLock) return;
        if (typeof GameMemory === 'undefined') return;
        this._syncLock = true;
        try {
            var bag = StateManager.get('entities.bag') || [];
            var quests = StateManager.get('entities.quests') || [];
            var characters = StateManager.get('entities.characters') || [];
            var locations = StateManager.get('entities.locations') || [];
            var events = StateManager.get('entities.events') || [];

            if (GameMemory.tables) {
                GameMemory.tables.items = bag;
                GameMemory.tables.characters = characters;
                GameMemory.tables.locations = locations;
            }
            if (GameMemory.quests) {
                GameMemory.quests = quests;
            }
            if (GameMemory.events) {
                GameMemory.events = events;
            }
            if (GameMemory.setContext) {
                GameMemory.setContext('turn', StateManager.get('progress.turn'));
                GameMemory.setContext('sceneTitle', StateManager.get('progress.sceneTitle'));
                GameMemory.setContext('rollingSummary', StateManager.get('progress.rollingSummary'));
            }
        } catch (e) {
            console.warn('[GameMemoryAdapter] 同步到 GameMemory 失败:', e);
        } finally {
            this._syncLock = false;
        }
    },

    // GameMemory -> StateManager（用于初始化或手动同步）
    syncFromGameMemory: function() {
        if (typeof GameMemory === 'undefined') return;
        this._syncLock = true;
        try {
            if (GameMemory.tables) {
                if (GameMemory.tables.items) {
                    BagMutator.setItems(GameMemory.tables.items, { silent: true });
                }
                if (GameMemory.tables.characters) {
                    CharacterMutator.mergeCharacters(GameMemory.tables.characters, { silent: true });
                }
                if (GameMemory.tables.locations) {
                    StateManager.set('entities.locations', GameMemory.tables.locations, { silent: true });
                }
            }
            if (GameMemory.quests) {
                QuestMutator.setQuests(GameMemory.quests, { silent: true });
            }
            if (GameMemory.events) {
                StateManager.set('entities.events', GameMemory.events, { silent: true });
            }
        } catch (e) {
            console.warn('[GameMemoryAdapter] 从 GameMemory 同步失败:', e);
        } finally {
            this._syncLock = false;
        }
    }
};
```

- [ ] **Step 2: Verify syntax**

```bash
node --check js/state/adapters/game-memory-adapter.js
```

- [ ] **Step 3: Commit**

```bash
git add js/state/adapters/game-memory-adapter.js
git commit -m "feat(state): add GameMemoryAdapter for two-way sync"
```

---

## Task 8: Create `js/state/adapters/save-adapter.js`

**Files:**
- Create: `js/state/adapters/save-adapter.js`

**Prerequisites:** Task 2

- [ ] **Step 1: Write the adapter**

Create `js/state/adapters/save-adapter.js`:

```javascript
// ========================================
// 存档适配器 - SaveAdapter
// 在 StateManager 和 SaveDB 之间转换数据格式
// ========================================
var SaveAdapter = {
    // 当前快照 -> 存档数据
    toSaveData: function() {
        var snapshot = StateManager.snapshot();
        return {
            version: snapshot.meta.version,
            savedAt: Date.now(),
            state: snapshot
        };
    },

    // 存档数据 -> StateManager
    fromSaveData: function(data) {
        if (!data) return false;
        var state = data.state || data;
        // 兼容旧存档：旧存档可能直接把 gameState 作为根对象
        if (state && state.meta && state.meta.version) {
            StateManager.init(state);
        } else {
            StateManager.init(StateSchema.normalizeState(state));
        }
        return true;
    },

    // 迁移旧存档
    migrateLegacySave: function(data) {
        if (!data) return null;
        // 旧存档可能是 { state: gameState } 或直接是 gameState
        var rawState = data.state || data;
        return {
            version: StateSchema.VERSION,
            savedAt: Date.now(),
            state: StateSchema.normalizeState(rawState)
        };
    }
};
```

- [ ] **Step 2: Verify syntax**

```bash
node --check js/state/adapters/save-adapter.js
```

- [ ] **Step 3: Commit**

```bash
git add js/state/adapters/save-adapter.js
git commit -m "feat(state): add SaveAdapter for legacy save compatibility"
```

---

## Task 9: Update `index.html` Script Loading Order

**Files:**
- Modify: `index.html:2809-2818`

**Prerequisites:** Task 1-8

- [ ] **Step 1: Insert state modules after `utils.js`**

Change:

```html
<script src="js/utils.js" defer></script>
<script src="js/core.js" defer></script>
```

To:

```html
<script src="js/utils.js" defer></script>
<script src="js/state/schema.js" defer></script>
<script src="js/state/state-manager.js" defer></script>
<script src="js/state/mutators/bag-mutator.js" defer></script>
<script src="js/state/mutators/quest-mutator.js" defer></script>
<script src="js/state/mutators/character-mutator.js" defer></script>
<script src="js/state/mutators/time-mutator.js" defer></script>
<script src="js/state/adapters/game-memory-adapter.js" defer></script>
<script src="js/state/adapters/save-adapter.js" defer></script>
<script src="js/core.js" defer></script>
```

- [ ] **Step 2: Verify HTML is still valid**

Open `index.html` and confirm no duplicate or broken `<script>` tags.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "chore(state): load state modules before core systems"
```

---

## Task 10: Initialize `StateManager` in `initApp`

**Files:**
- Modify: `js/init.js:11-15`

**Prerequisites:** Task 9

- [ ] **Step 1: Add StateManager init at the top of `initApp`**

Modify `js/init.js`:

Find:

```javascript
async function initApp() {
    try {
    // 防止重复初始化
    if (initApp._initialized) return;
    initApp._initialized = true;
        // 初始化主题管理
```

Replace with:

```javascript
async function initApp() {
    try {
    // 防止重复初始化
    if (initApp._initialized) return;
    initApp._initialized = true;
        // 初始化统一状态层（接管全局 gameState）
        if (typeof StateManager !== 'undefined') {
            StateManager.init(typeof gameState !== 'undefined' ? gameState : null);
        }
        // 初始化主题管理
```

- [ ] **Step 2: Verify syntax**

```bash
node --check js/init.js
```

- [ ] **Step 3: Commit**

```bash
git add js/init.js
git commit -m "feat(state): initialize StateManager in initApp"
```

---

## Task 11: Migrate `renderItemsPage` / `renderBag` in `js/phone-ui.js`

**Files:**
- Modify: `js/phone-ui.js`

**Prerequisites:** Task 10

- [ ] **Step 1: Find `renderItemsPage` and update bag source**

Find the function `renderItemsPage` (search for `function renderItemsPage`).

Change the bag source from:

```javascript
var bag = (gameState.currentBag || []).filter(...)
```

To:

```javascript
var bag = (StateManager ? StateManager.get('entities.bag') : (gameState.currentBag || [])).filter(...)
```

This keeps backward compatibility while using the new state layer.

- [ ] **Step 2: Find `renderBag` and update bag source**

Find the function `renderBag` (search for `function renderBag`).

Change:

```javascript
var bag = gameState.currentBag || [];
```

To:

```javascript
var bag = StateManager ? StateManager.get('entities.bag') : (gameState.currentBag || []);
```

- [ ] **Step 3: Verify syntax**

```bash
node --check js/phone-ui.js
```

- [ ] **Step 4: Commit**

```bash
git add js/phone-ui.js
git commit -m "refactor(state): migrate bag rendering to StateManager"
```

---

## Task 12: Migrate `QuestSystem` in `js/systems.js`

**Files:**
- Modify: `js/systems.js`

**Prerequisites:** Task 10

- [ ] **Step 1: Update `getAllQuests` to read from StateManager**

Find `QuestSystem.getAllQuests`:

```javascript
getAllQuests() {
    var quests = gameState.currentQuests || [];
```

Change to:

```javascript
getAllQuests() {
    var quests = (StateManager ? StateManager.get('entities.quests') : (gameState.currentQuests || []));
```

- [ ] **Step 2: Update any quest writes to use QuestMutator**

Search for `gameState.currentQuests =` and `gameState.currentQuests.push` in `systems.js`.

For assignments like:

```javascript
gameState.currentQuests = [...]
```

Change to:

```javascript
if (StateManager) {
    QuestMutator.setQuests([...]);
} else {
    gameState.currentQuests = [...]
}
```

- [ ] **Step 3: Verify syntax**

```bash
node --check js/systems.js
```

- [ ] **Step 4: Commit**

```bash
git add js/systems.js
git commit -m "refactor(state): migrate quest system to StateManager"
```

---

## Task 13: Migrate AI Response State Merge in `js/game.js`

**Files:**
- Modify: `js/game.js`

**Prerequisites:** Task 10

- [ ] **Step 1: Find the main AI response handler**

Search for where `gameState.currentBag`, `gameState.currentQuests`, `gameState.allCharacters`, `gameState.gameTime` are updated after AI returns.

Common pattern:

```javascript
gameState.currentBag = data.bag || gameState.currentBag;
gameState.currentQuests = data.quests || gameState.currentQuests;
gameState.allCharacters = data.characters || gameState.allCharacters;
gameState.gameTime = data.gameTime || gameState.gameTime;
```

- [ ] **Step 2: Wrap updates in StateManager.transaction**

Change to:

```javascript
if (StateManager) {
    StateManager.transaction(function() {
        if (data.bag) BagMutator.setItems(data.bag, { silent: true });
        if (data.quests) QuestMutator.setQuests(data.quests, { silent: true });
        if (data.characters) CharacterMutator.mergeCharacters(data.characters, { silent: true });
        if (data.gameTime) TimeMutator.setTime(data.gameTime, { silent: true });
        if (data.locations) StateManager.set('entities.locations', data.locations, { silent: true });
        if (data.events) StateManager.set('entities.events', data.events, { silent: true });
    });
} else {
    gameState.currentBag = data.bag || gameState.currentBag;
    gameState.currentQuests = data.quests || gameState.currentQuests;
    gameState.allCharacters = data.characters || gameState.allCharacters;
    gameState.gameTime = data.gameTime || gameState.gameTime;
}
```

- [ ] **Step 3: Verify syntax**

```bash
node --check js/game.js
```

- [ ] **Step 4: Commit**

```bash
git add js/game.js
git commit -m "refactor(state): migrate AI response state merge to transaction"
```

---

## Task 14: Enable Location Extraction

**Files:**
- Modify: `js/game.js`

**Prerequisites:** Task 13

- [ ] **Step 1: Add location extraction after AI response**

In the same AI response handler, after state merge, add:

```javascript
// 从 AI 返回的 title/story 中提取地点
if (StateManager && data.title) {
    var locations = this._extractLocations(data.title + ' ' + (data.story || ''));
    if (locations.length > 0) {
        StateManager.set('entities.locations', locations, { silent: true });
    }
}
```

- [ ] **Step 2: Add `_extractLocations` helper**

Add to `js/game.js`:

```javascript
function _extractLocations(text) {
    if (!text) return [];
    var locationKeywords = ['便利店', '后门', '地下车库', '避难所', '仓库', '医院', '学校', '商场'];
    var found = [];
    var existing = StateManager ? StateManager.get('entities.locations') : [];
    existing.forEach(function(loc) {
        if (loc && loc.name) found.push(loc.name);
    });
    locationKeywords.forEach(function(keyword) {
        if (text.indexOf(keyword) !== -1 && found.indexOf(keyword) === -1) {
            found.push(keyword);
        }
    });
    return found.map(function(name) {
        return { id: 'loc_' + name + '_' + Date.now(), name: name, desc: '' };
    });
}
```

- [ ] **Step 3: Verify syntax**

```bash
node --check js/game.js
```

- [ ] **Step 4: Commit**

```bash
git add js/game.js
git commit -m "feat(state): extract locations from AI response"
```

---

## Task 15: Bind GameMemoryAdapter in `initApp`

**Files:**
- Modify: `js/init.js`

**Prerequisites:** Task 7, Task 10

- [ ] **Step 1: Add GameMemoryAdapter bind**

After `StateManager.init(...)` in `initApp`, add:

```javascript
if (typeof GameMemoryAdapter !== 'undefined') {
    GameMemoryAdapter.bind();
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check js/init.js
```

- [ ] **Step 3: Commit**

```bash
git add js/init.js
git commit -m "feat(state): bind GameMemoryAdapter in initApp"
```

---

## Task 16: Run Syntax Checks on All New Files

**Files:**
- All new files in `js/state/`

**Prerequisites:** Task 1-15

- [ ] **Step 1: Run syntax checks**

```bash
node --check js/state/schema.js && \
node --check js/state/state-manager.js && \
node --check js/state/mutators/bag-mutator.js && \
node --check js/state/mutators/quest-mutator.js && \
node --check js/state/mutators/character-mutator.js && \
node --check js/state/mutators/time-mutator.js && \
node --check js/state/adapters/game-memory-adapter.js && \
node --check js/state/adapters/save-adapter.js
```

Expected: all commands succeed with no output.

- [ ] **Step 2: Run syntax checks on modified files**

```bash
node --check js/init.js && \
node --check js/game.js && \
node --check js/systems.js && \
node --check js/phone-ui.js
```

- [ ] **Step 3: Commit if all pass**

```bash
git commit -m "chore(state): verify syntax for state layer and modified files"
```

---

## Task 17: Manual Regression Test

**Files:**
- None (browser testing)

**Prerequisites:** Task 16

- [ ] **Step 1: Start a local server**

```bash
python3 -m http.server 8080 --directory /workspace
```

- [ ] **Step 2: Open browser at `http://localhost:8080`**

- [ ] **Step 3: Create a new game with 末日生存 theme**

Use prompt similar to:

```
末日生存，我醒来在一家便利店，外面有丧尸，我要想办法活下去。
```

- [ ] **Step 4: Play 5 rounds**

Make choices similar to the regression test:
1. 检查物资
2. 加固后门
3. 检查背包钥匙
4. （any choice）
5. 逼问老周

- [ ] **Step 5: Verify acceptance criteria**

Check:
- [ ] 剧情没有回退到第 1 章开头
- [ ] 当前回合正确显示为 5
- [ ] 物品页面无 undefined
- [ ] 任务状态无 pending
- [ ] 地点数不为 0（应至少有"便利店"）
- [ ] 存档、刷新、读档后状态保留

- [ ] **Step 6: Stop server and commit test notes**

```bash
# stop server with Ctrl+C
git add docs/06-总路线图与进度.md
git commit -m "docs: update progress after state layer implementation"
```

---

## Task 18: Update Progress Document

**Files:**
- Modify: `docs/06-总路线图与进度.md`

**Prerequisites:** Task 17

- [ ] **Step 1: Update section 6 "当前进度"**

Change:

```markdown
### 6.2 进行中

| 事项 | 状态 | 说明 |
|------|------|------|
| 阶段 1 implementation plan | ⏳ | 待生成 |
| `js/state/` 模块实现 | ⏳ | 未开始 |
| 关键路径迁移 | ⏳ | 未开始 |
```

To:

```markdown
### 6.1 已完成

| 事项 | 状态 | 说明 |
|------|------|------|
| 项目总览文档 | ✅ | `docs/00-项目总览.md` |
| 现状诊断文档 | ✅ | `docs/01-现状诊断.md` |
| 参考项目研究 | ✅ | 已研究 SillyTavern、MiniTavern、NativeTavern、Light Tavern、RisuAI、Mufy |
| 阶段 1 设计 spec | ✅ | `docs/superpowers/specs/2026-06-22-state-layer-design.md` |
| 阶段 1 设计评审 | ✅ | 用户已认可 |
| 阶段 1 implementation plan | ✅ | `docs/superpowers/plans/2026-06-22-state-layer-plan.md` |
| `js/state/` 模块实现 | ✅ | schema / state-manager / mutators / adapters |
| 关键路径迁移 | ✅ | bag / quests / characters / time / progress / locations |
| 回归测试 | ✅ | 5 轮末日生存测试通过 |
```

- [ ] **Step 2: Update "最后更新" date**

Set to today's date.

- [ ] **Step 3: Commit**

```bash
git add docs/06-总路线图与进度.md
git commit -m "docs: mark stage 1 state layer as complete"
```

---

## Self-Review Checklist

After completing all tasks, verify:

- [ ] **Spec coverage**: All sections of `2026-06-22-state-layer-design.md` are implemented.
- [ ] **No placeholders**: No TODO/TBD in the plan or code.
- [ ] **Type consistency**: `StateManager.get('entities.bag')` returns the same shape as old `gameState.currentBag`.
- [ ] **Backward compatibility**: Old code paths still work when `StateManager` is undefined.
- [ ] **Syntax verified**: All new and modified JS files pass `node --check`.
- [ ] **Manual test passed**: 5-round regression test successful.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-22-state-layer-plan.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using `executing-plans` or direct implementation, with checkpoints for review.

**Which approach?**
