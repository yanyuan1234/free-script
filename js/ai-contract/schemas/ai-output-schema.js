// ========================================
// AI 输出标准 schema
// 定义 AI 回复的字段、别名、normalize、validate
// ========================================
const AIOutputSchema = {
    REQUIRED_FIELDS: ['story'],
    STORY_ALIASES: ['story', 'storyText', 'content', 'text', 'narrative'],
    TITLE_ALIASES: ['title', 'scene', 'sceneTitle', 'chapterTitle'],

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
            contextSummary: '',
            hud: {}
        };
    },

    normalize(raw) {
        if (!raw || typeof raw !== 'object') return this.getDefaultOutput();
        const out = this.getDefaultOutput();
        const storyField = this._pickField(raw, this.STORY_ALIASES);
        if (storyField) out.story = String(storyField).trim();
        const titleField = this._pickField(raw, this.TITLE_ALIASES);
        if (titleField) out.title = String(titleField).trim();
        // 【P1修复】choices 含 null/非对象元素时加守卫，防止 TypeError
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
        // 【P1修复】深拷贝防止共享引用，调用方修改 raw 不影响 normalized 结果
        if (raw.player && typeof raw.player === 'object' && !Array.isArray(raw.player)) {
            const playerClone = this._shallowClone(raw.player);
            // 【修复 P2】归一化 player.stats 字段名：prompt 要求 {label, value}，但 AI 可能返回 {name, value} 或 {key, value}
            if (Array.isArray(playerClone.stats)) {
                playerClone.stats = playerClone.stats.map(function(s) {
                    if (!s || typeof s !== 'object') return { label: '', value: 0 };
                    return { label: s.label || s.name || s.key || '', value: s.value };
                }).filter(function(s) { return s.label; });
            }
            out.player = playerClone;
        }
        if (raw.characters && Array.isArray(raw.characters)) out.characters = raw.characters.slice();
        if (raw.bag && Array.isArray(raw.bag)) out.bag = raw.bag.slice();
        // 【P1修复】currency 放宽类型：接受字符串数字，防止 AI 输出 "50" 被丢弃
        if (raw.currency !== undefined && raw.currency !== null) out.currency = Number(raw.currency) || 0;
        if (raw.currencyName) out.currencyName = String(raw.currencyName);
        if (raw.quests && Array.isArray(raw.quests)) out.quests = raw.quests.slice();
        if (raw.gameTime && typeof raw.gameTime === 'object' && !Array.isArray(raw.gameTime)) out.gameTime = this._shallowClone(raw.gameTime);
        if (raw.locations && Array.isArray(raw.locations)) out.locations = raw.locations.slice();
        if (raw.keyEvents && Array.isArray(raw.keyEvents)) out.keyEvents = raw.keyEvents.slice();
        if (raw.relationships && Array.isArray(raw.relationships)) out.relationships = raw.relationships.slice();
        if (raw.world && Array.isArray(raw.world)) out.world = raw.world.slice();
        if (raw.contextSummary) out.contextSummary = String(raw.contextSummary);
        if (raw.hud && typeof raw.hud === 'object' && !Array.isArray(raw.hud)) out.hud = this._shallowClone(raw.hud);
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
