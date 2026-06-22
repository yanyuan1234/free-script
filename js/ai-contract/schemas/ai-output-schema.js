// ========================================
// AI 输出标准 schema
// 定义 AI 回复的字段、别名、normalize、validate
// ========================================
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
