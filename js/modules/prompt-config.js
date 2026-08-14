/**
 * 模块化提示词配置系统
 * 灵感来源：【日月西】Gemini & Claude v0.23 @电波系
 * 设计理念：将提示词拆分为独立维度（防429、世界引擎、基础架构、气氛点缀等），
 *           用户可按需开关各维度，实现不同风格/场景的快速切换。
 *           通过 setvar 机制管理变量，无需修改核心代码。
 *
 * 依赖：prompt-builder.js
 * 被依赖：init.js
 */
var PromptConfig = {

    // 配置维度定义
    // 每个维度包含: id, name, description, defaultEnabled, order, content
    dimensions: [],

    // 用户开关状态
    _toggleStates: {},

    // 用户自定义参数
    _customParams: {},

    /**
     * 维度ID常量
     */
    DIM: {
        ANTI_429: 'anti429',
        WORLD_ENGINE: 'worldEngine',
        NARRATIVE_BASE: 'narrativeBase',
        ATMOSPHERE: 'atmosphere',
        CHARACTER_DEPTH: 'characterDepth',
        PLOT_CONTROL: 'plotControl',
        STYLE_GUIDE: 'styleGuide'
    },

    /**
     * 初始化
     */
    init: function() {
        this._defineDimensions();
        this._loadSettings();
        this._registerSections();
        console.log('[PromptConfig] 模块化提示词配置已初始化 (' +
            this._getEnabledCount() + '/' + this.dimensions.length + ' 维度启用)');
    },

    /**
     * 定义所有配置维度
     * 来源：日月西 v0.23 的7维度配置 + 游戏自身需求适配
     */
    _defineDimensions: function() {
        this.dimensions = [
            {
                id: this.DIM.ANTI_429,
                name: '防429优化',
                description: '优化请求频率和重试策略，减少API 429错误',
                defaultEnabled: true,
                order: 5,
                content: function(ctx) {
                    return '【防429策略】\n' +
                        '如果感到响应被限流，请适当精简输出，保持核心剧情完整即可。\n' +
                        '优先保证story字段的完整性，其他字段可适当精简。';
                }
            },
            {
                id: this.DIM.WORLD_ENGINE,
                name: '世界引擎',
                description: '动态世界构建：环境变化、NPC自主行为、时间流逝',
                defaultEnabled: true,
                order: 15,
                content: function(ctx) {
                    return '【世界引擎·动态世界】\n' +
                        '世界不是静止的背景板——NPC有自己的日程和目标，环境会随时间变化。\n' +
                        '1. NPC自主性：即使玩家不主动互动，NPC也会根据自身性格和目标行动\n' +
                        '2. 环境动态：天气、光线、人群、声音等环境要素随时间自然变化\n' +
                        '3. 因果链：玩家的行为会产生涟漪效应，影响后续NPC态度和世界状态\n' +
                        '4. 时间感：不同时段有不同的氛围（清晨的喧嚣、午后的慵懒、深夜的寂静）';
                }
            },
            {
                id: this.DIM.NARRATIVE_BASE,
                name: '叙事基础架构',
                description: '核心叙事规则：视角控制、节奏把控、信息释放',
                defaultEnabled: true,
                order: 35,
                content: function(ctx) {
                    return '【叙事基础架构】\n' +
                        '1. 视角统一：保持一致的叙事视角，不随意切换\n' +
                        '2. 节奏控制：紧张场景用短句快节奏，舒缓场景用长句慢节奏\n' +
                        '3. 信息释放：不要一次性给出所有信息，通过探索逐步揭示\n' +
                        '4. 悬念管理：每回合至少保持一个未解之谜驱动玩家继续\n' +
                        '5. 情感弧线：注意情感起伏，避免连续高强度的情绪输出';
                }
            },
            {
                id: this.DIM.ATMOSPHERE,
                name: '气氛点缀',
                description: '五感描写、环境氛围、情绪渲染',
                defaultEnabled: true,
                order: 45,
                content: function(ctx) {
                    return '【气氛点缀·五感沉浸】\n' +
                        '在叙事中自然融入五感描写，让玩家身临其境：\n' +
                        '- 视觉：光影变化、色彩、动态画面\n' +
                        '- 听觉：环境音、对话语气、肢体声响\n' +
                        '- 触觉：温度、质感、力度\n' +
                        '- 嗅觉：气味描写（不必每回合都有，但关键时刻要用）\n' +
                        '- 味觉：饮食场景中自然融入\n' +
                        '注意：五感描写要服务于剧情，不要为描写而描写。每回合选择1-2个最契合场景的感官维度深入描写即可。';
                }
            },
            {
                id: this.DIM.CHARACTER_DEPTH,
                name: '角色深度',
                description: 'NPC心理描写、微表情、行为逻辑',
                defaultEnabled: true,
                order: 48,
                content: function(ctx) {
                    return '【角色深度·立体人格】\n' +
                        '每个NPC都是立体的个体：\n' +
                        '1. 心理活动：通过微表情、小动作、语气变化暗示内心活动，不要直接说"他感到XX"\n' +
                        '2. 行为逻辑：NPC的行为必须符合其性格、经历和当前处境\n' +
                        '3. 关系动态：NPC之间的关系会因事件而变化，不要保持静态\n' +
                        '4. 独特性：每个NPC有自己的说话方式、习惯动作、偏好\n' +
                        '5. 成长性：NPC会因经历而改变，不是一成不变的';
                }
            },
            {
                id: this.DIM.PLOT_CONTROL,
                name: '剧情控制',
                description: '主线推进、支线管理、伏笔追踪',
                defaultEnabled: true,
                order: 52,
                content: function(ctx) {
                    return '【剧情控制·多线管理】\n' +
                        '1. 主线推进：每回合至少推进主线一点点，不要原地踏步\n' +
                        '2. 支线穿插：在主线推进中自然穿插支线内容，丰富世界观\n' +
                        '3. 伏笔管理：\n' +
                        '   - 已埋伏笔要适时回收（不超过15回合）\n' +
                        '   - 新伏笔要自然融入，不要生硬\n' +
                        '   - 长期伏笔（重要剧情线索）可以跨数十回合\n' +
                        '4. 节奏把控：不要让玩家感到无聊或迷茫，每回合都有新的信息或变化\n' +
                        '5. 选择意义：玩家的选择必须产生实质影响，不要假装选择';
                }
            },
            {
                id: this.DIM.STYLE_GUIDE,
                name: '文风指导',
                description: '文学风格、用词偏好、修辞控制',
                defaultEnabled: false,
                order: 58,
                content: function(ctx) {
                    var stylePref = (ctx.macroVars && ctx.macroVars['文风指导']) || '';
                    if (stylePref) {
                        return '【文风指导·用户指定】\n' + stylePref;
                    }
                    return '【文风指导·默认】\n' +
                        '1. 用词精准：避免空洞的形容词堆砌，用具体细节代替抽象描述\n' +
                        '2. 句式多变：长短句交替，避免单调的句式结构\n' +
                        '3. 展示而非告知：用行为和对话展示角色特征，而非直接描述\n' +
                        '4. 避免AI口癖：不使用"总而言之""不可否认""值得一提"等套话\n' +
                        '5. 控制修辞：比喻和拟人要有新意，避免陈词滥调';
                }
            }
        ];
    },

    /**
     * 加载用户设置
     */
    _loadSettings: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.getJSON) {
                this._toggleStates = Storage.getJSON('prompt_config_toggles', {}) || {};
                this._customParams = Storage.getJSON('prompt_config_params', {}) || {};
            }
        } catch(e) {
            console.warn('[PromptConfig] 读取设置失败:', e);
        }

        // 应用保存的开关状态
        var self = this;
        this.dimensions.forEach(function(dim) {
            var saved = self._toggleStates[dim.id];
            if (saved !== undefined) {
                dim.enabled = saved;
            } else {
                dim.enabled = dim.defaultEnabled;
            }
        });
    },

    /**
     * 保存设置
     */
    saveSettings: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.setJSON) {
                Storage.setJSON('prompt_config_toggles', this._toggleStates);
                Storage.setJSON('prompt_config_params', this._customParams);
            }
        } catch(e) {
            console.warn('[PromptConfig] 保存设置失败:', e);
        }
    },

    /**
     * 注册所有维度到 PromptBuilder
     */
    _registerSections: function() {
        if (typeof PromptBuilder === 'undefined') {
            var self = this;
            setTimeout(function() { self._registerSections(); }, 500);
            return;
        }

        var self = this;
        this.dimensions.forEach(function(dim) {
            PromptBuilder.registerSection('promptConfig_' + dim.id, function(ctx) {
                if (!dim.enabled) return '';
                return dim.content(ctx);
            }, { order: dim.order });
        });
    },

    /**
     * 切换维度开关
     */
    toggleDimension: function(dimId, enabled) {
        var dim = this.dimensions.find(function(d) { return d.id === dimId; });
        if (!dim) return false;
        dim.enabled = enabled;
        this._toggleStates[dimId] = enabled;
        this.saveSettings();
        console.log('[PromptConfig] 维度 "' + dim.name + '" 已' + (enabled ? '启用' : '禁用'));
        return true;
    },

    /**
     * 获取所有维度状态
     */
    getDimensions: function() {
        return this.dimensions.map(function(d) {
            return {
                id: d.id,
                name: d.name,
                description: d.description,
                enabled: d.enabled,
                order: d.order
            };
        });
    },

    /**
     * 获取已启用维度数量
     */
    _getEnabledCount: function() {
        return this.dimensions.filter(function(d) { return d.enabled; }).length;
    },

    /**
     * 设置自定义参数
     */
    setParam: function(key, value) {
        this._customParams[key] = value;
        this.saveSettings();
    },

    /**
     * 获取自定义参数
     */
    getParam: function(key, defaultValue) {
        return this._customParams[key] !== undefined ? this._customParams[key] : defaultValue;
    },

    /**
     * 重置为默认配置
     */
    resetToDefault: function() {
        var self = this;
        this.dimensions.forEach(function(dim) {
            dim.enabled = dim.defaultEnabled;
            self._toggleStates[dim.id] = dim.defaultEnabled;
        });
        this._customParams = {};
        this.saveSettings();
        console.log('[PromptConfig] 已重置为默认配置');
    }
};
