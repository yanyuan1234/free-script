// ========================================
// AI 输出标准 schema
// 定义 AI 回复的字段、别名、normalize、validate
// ========================================
const AIOutputSchema = {
    REQUIRED_FIELDS: ['story'],
    STORY_ALIASES: ['story', 'storyText', 'content', 'text', 'narrative'],
    TITLE_ALIASES: ['title', 'scene', 'sceneTitle', 'chapterTitle'],

    // [P0] AI 主动维护记忆：memoryUpdates 字段
    // 让 AI 每轮可显式声明对永久事实区的增/改/删（参考 mufy 动态记忆区机制）
    // 合法类别白名单（与 EnhancedMemory.permanentFacts 六类一致，见 tavern-compat.js:959）
    MEMORY_CATEGORIES: ['pcIdentity', 'settings', 'worldRules', 'npcProfiles', 'promises', 'worldPlaces'],
    // 合法操作白名单：add=合并累积 / replace=替换覆盖(单值类如pcIdentity) / delete=按内容/名字删除
    MEMORY_OPS: ['add', 'replace', 'delete'],
    // [Mufy 三层记忆] 记忆层级：shortTerm=短期记忆 / longTerm=长期归档 / milestone=关键里程碑
    MEMORY_LAYERS: ['shortTerm', 'longTerm', 'milestone'],
    // 关键里程碑重要性默认阈值
    MILESTONE_IMPORTANCE_THRESHOLD: 7,

    getDefaultOutput() {
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
            // [T2-P1-4] 补 npcMessages：AI 直接返回 NPC 对话列表（避免下游只能从 story 文本里正则提取）
            // schema: [{ name: '苏菲', text: '你还好吗？', emotion: '担心', turn: 1 }, ...]
            npcMessages: [],
            contextSummary: '',
            hud: {},
            // [P0] AI 主动维护记忆：AI 显式声明对永久事实区的变更
            // schema: [{ op:'add/replace/delete', category:'六类之一', content:'事实', keywords?:[], reason?:'说明' }]
            memoryUpdates: []
        };
    },

    normalize(raw) {
        if (!raw || typeof raw !== 'object') return this.getDefaultOutput();
        const out = this.getDefaultOutput();
        const storyField = this._pickField(raw, this.STORY_ALIASES);
        if (storyField) out.story = String(storyField).trim();
        const titleField = this._pickField(raw, this.TITLE_ALIASES);
        if (titleField) out.title = String(titleField).trim();

        if (raw.choices && Array.isArray(raw.choices)) {
            out.choices = raw.choices.map(c => {
                if (!c || typeof c !== 'object') {
                    // 字符串或 null/undefined 转为 {text}
                    if (typeof c === 'string') return { id: '', text: c };
                    return { id: '', text: '' };
                }
                return { id: c.id || '', text: c.text || c.label || '' };
            }).filter(c => c.text);
        }

        if (raw.player && typeof raw.player === 'object' && !Array.isArray(raw.player)) {
            const playerClone = this._shallowClone(raw.player);


            if (Array.isArray(playerClone.stats)) {
                playerClone.stats = playerClone.stats.map(function(s) {
                    if (!s || typeof s !== 'object') return { label: '', value: 0 };
                    var val = (s.value !== undefined ? s.value : s.val);
                    if (val === '' || val === null || val === undefined) val = 0;
                    // 字符串数字转 number
                    var numVal = Number(val);
                    if (!isNaN(numVal)) val = numVal;
                    return { label: s.label || s.name || s.key || '', value: val };
                }).filter(function(s) { return s.label; });
            }
            out.player = playerClone;
        }
        if (raw.characters && Array.isArray(raw.characters)) out.characters = raw.characters.slice();
        if (raw.bag && Array.isArray(raw.bag)) out.bag = raw.bag.slice();

        if (raw.currency !== undefined && raw.currency !== null) out.currency = Number(raw.currency) || 0;
        if (raw.currencyName) out.currencyName = String(raw.currencyName);
        if (raw.quests && Array.isArray(raw.quests)) out.quests = raw.quests.slice();
        if (raw.gameTime && typeof raw.gameTime === 'object' && !Array.isArray(raw.gameTime)) out.gameTime = this._shallowClone(raw.gameTime);
        if (raw.locations && Array.isArray(raw.locations)) out.locations = raw.locations.slice();

        // 直接 slice 会保留对象，下游字符串拼接时显示 [object Object]
        // 统一提取为字符串，与 prompt-builder.js 约定的 ["事件1","事件2"] 格式一致
        if (raw.keyEvents && Array.isArray(raw.keyEvents)) {
            out.keyEvents = raw.keyEvents.map(function(ev) {
                if (typeof ev === 'string') return ev.trim();
                if (ev && typeof ev === 'object') {
                    return String(ev.title || ev.name || ev.content || ev.event || ev.desc || ev.description || '').trim();
                }
                return String(ev || '').trim();
            }).filter(function(s) { return s; });
        }
        if (raw.relationships && Array.isArray(raw.relationships)) out.relationships = raw.relationships.slice();
        if (raw.world && Array.isArray(raw.world)) {
            // 第5轮优化：world.type 防御性别名映射
            // 业界做法（参考 SillyTavern WorldInfo 的 entry 标准化）：解析层做白名单 + 别名收敛，
            // 避免依赖渲染层各自兜底，单点治理 AI 偶发输出的不一致命名
            var _typeAlias = {
                'rank': 'ranking',        // prompt-builder.js 死代码用过 rank
                'setting': 'text',         // prompt-builder.js 死代码用过 setting
                'post': 'comments',        // 单数转复数
                'posts': 'comments',
                'comment': 'comments',
                'moment': 'moments',       // 单数转复数
                'shop_item': 'shop',
                'diary_entry': 'diary',
                'mail_item': 'mail'
            };
            out.world = raw.world.map(function(w) {
                if (!w || typeof w !== 'object') return w;
                var _t = w.type ? String(w.type).trim().toLowerCase() : '';
                if (_t && _typeAlias[_t]) {
                    // 创建副本避免修改原始数据
                    var _copy = Object.assign({}, w);
                    _copy.type = _typeAlias[_t];
                    return _copy;
                }
                return w;
            });
        }

        // [T2-P1-4] npcMessages normalize：保留 name/text/emotion/turn 字段，过滤空文本
        if (raw.npcMessages && Array.isArray(raw.npcMessages)) {
            out.npcMessages = raw.npcMessages.map(function(m) {
                if (!m || typeof m !== 'object') return null;
                var text = String(m.text || m.content || m.message || '').trim();
                if (!text) return null;
                return {
                    name: String(m.name || m.speaker || m.character || '').trim(),
                    text: text,
                    emotion: String(m.emotion || m.mood || '').trim(),
                    turn: typeof m.turn === 'number' ? m.turn : (parseInt(m.turn, 10) || 0)
                };
            }).filter(function(m) { return m && m.text; });
        }

        if (raw.contextSummary) out.contextSummary = String(raw.contextSummary);
        // 【Q3 HUD 兜底】兼容两种 AI 输出形状：
        //   · 对象形 {items:[{label,value,icon}]}（schema 要求）→ 原样克隆
        //   · 裸数组形 [{label,value,icon}]（实测 agnes/gpt 系常见变体）→ 包装为 {items:[...]}
        // 旧代码对数组形状直接丢弃，导致 HUD 数据整体丢失。
        if (raw.hud && typeof raw.hud === 'object') {
            if (Array.isArray(raw.hud)) {
                var _hudItems = raw.hud.filter(function(it) { return it && typeof it === 'object' && (it.label || it.value); });
                if (_hudItems.length > 0) out.hud = { items: _hudItems };
            } else {
                out.hud = this._shallowClone(raw.hud);
            }
        }

        // [P0] memoryUpdates normalize：白名单校验 op/category/layer，过滤非法项
        // AI 可能输出 op='update'（归一为 'replace'）、action 代替 op、type 代替 category 等变体
        if (raw.memoryUpdates && Array.isArray(raw.memoryUpdates)) {
            var validCats = this.MEMORY_CATEGORIES;
            var validOps = this.MEMORY_OPS;
            out.memoryUpdates = raw.memoryUpdates.map(function(u) {
                if (!u || typeof u !== 'object') return null;
                // op 归一：兼容 action 字段，update→replace，remove→delete
                var op = String(u.op || u.action || 'add').trim().toLowerCase();
                if (op === 'update') op = 'replace';
                else if (op === 'remove') op = 'delete';
                if (validOps.indexOf(op) === -1) op = 'add'; // 非法 op 兜底为 add
                // category 归一：兼容 type 字段
                var category = String(u.category || u.type || '').trim();
                if (validCats.indexOf(category) === -1) return null; // 非法类别直接丢弃，避免污染
                // layer 归一：兼容 level/tier 字段，大小写不敏感，返回 canonical 驼峰形式
                var layerInput = String(u.layer || u.level || u.tier || 'longTerm').trim();
                var layerMap = { 'shortterm': 'shortTerm', 'short': 'shortTerm', 'st': 'shortTerm',
                                 'longterm': 'longTerm', 'long': 'longTerm', 'lt': 'longTerm',
                                 'milestone': 'milestone', 'ms': 'milestone' };
                var layer = layerMap[layerInput.toLowerCase()] || 'longTerm';
                // importance 归一：1-10 整数，默认 5
                var importance = parseInt(u.importance || u.imp || u.priority || 5, 10);
                if (isNaN(importance)) importance = 5;
                importance = Math.max(1, Math.min(10, importance));
                // delete 操作 content 可空（仅按 keywords 删除），其他操作必须非空
                var content = String(u.content || u.text || u.value || '').trim();
                var keywords = Array.isArray(u.keywords)
                    ? u.keywords.map(function(k) { return String(k).trim(); }).filter(function(k) { return k; })
                    : [];
                if (op !== 'delete' && !content) return null;
                if (op === 'delete' && !content && keywords.length === 0) return null; // delete 至少要有定位信息
                var reason = String(u.reason || u.note || '').trim();
                return { op: op, category: category, layer: layer, importance: importance, content: content, keywords: keywords, reason: reason };
            }).filter(function(u) { return u; });
        }
        return out;
    },

    // 浅拷贝对象（防止共享引用）
    _shallowClone(obj) {
        const clone = {};
        const keys = Object.keys(obj);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
            clone[key] = obj[key];
        }
        return clone;
    },

    validate(data) {
        const errors = [];
        if (!data || typeof data !== 'object') {
            errors.push('data is not an object');
            return { valid: false, errors: errors };
        }
        const storyField = this._pickField(data, this.STORY_ALIASES);
        if (!storyField || !String(storyField).trim()) {
            errors.push('missing required field: story');
        }
        return { valid: errors.length === 0, errors: errors };
    },

    _pickField(obj, aliases) {
        for (let i = 0; i < aliases.length; i++) {
            const key = aliases[i];
            if (obj[key] !== undefined && obj[key] !== null) return obj[key];
        }
        return null;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = AIOutputSchema;
