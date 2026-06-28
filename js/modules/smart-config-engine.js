/**
 * 智能配置引擎
 * 从预设的"使用须知"提示词中自动提取 API 设置、模型推荐、正则要求等配置
 * 依赖：全局对象（无）
 * 被依赖：preset-manager.js
 */
var SmartConfigEngine = {
    // 当前预设的智能配置
    currentConfig: null,

    /**
    * 从预设的使用须知中提取配置
    * @param {object} preset - 预设对象
    * @returns {object} - 提取的配置
    */
    extractConfig: function(preset) {
        if (!preset || !preset.prompts) return null;

        var config = {
            autoParse: null,           // 自动解析设置
            apiSettings: {},           // API设置
            modelRecommendations: [],  // 模型推荐
            regexRequirements: [],     // 正则要求
            pluginRequirements: [],    // 插件需求
            temperatureGuide: null,    // 温度推荐
            otherSettings: []          // 其他设置
            };

        // 查找使用须知类提示词
        for (var i = 0; i < preset.prompts.length; i++) {
            var prompt = preset.prompts[i];
            if (!prompt.content) continue;

            var content = prompt.content;
            var name = prompt.name || '';

            // 识别使用须知类提示词（通过名称或内容关键词）
            var isGuidePrompt = this._isGuidePrompt(name, content);
            if (!isGuidePrompt) continue;

            console.log('[SmartConfig] 发现使用须知: ' + name);

            // 提取自动解析设置
            var autoParse = this._extractAutoParse(content);
            if (autoParse) config.autoParse = autoParse;

            // 提取API设置
            var apiSettings = this._extractAPISettings(content);
            if (apiSettings) Object.assign(config.apiSettings, apiSettings);

            // 提取模型推荐
            var models = this._extractModelRecommendations(content);
            if (models.length > 0) config.modelRecommendations = models;

            // 提取正则要求
            var regexReqs = this._extractRegexRequirements(content);
            if (regexReqs.length > 0) config.regexRequirements = regexReqs;

            // 提取插件需求
            var plugins = this._extractPluginRequirements(content);
            if (plugins.length > 0) config.pluginRequirements = plugins;

            // 提取温度推荐
            var tempGuide = this._extractTemperatureGuide(content);
            if (tempGuide) config.temperatureGuide = tempGuide;
        }

        return config;
    },

    /**
    * 判断是否为使用须知类提示词
    */
    _isGuidePrompt: function(name, content) {
        var guideKeywords = ['须知', '指南', '必做', '注意', '设置', '配置', '说明', '教程', 'readme', 'guide', 'setup'];
        var lowerName = name.toLowerCase();
        var lowerContent = content.toLowerCase();

        // 通过名称判断
        for (var i = 0; i < guideKeywords.length; i++) {
            if (lowerName.indexOf(guideKeywords[i]) !== -1) return true;
        }

        // 通过内容判断（包含多个配置关键词）
        var configKeywords = ['自动解析', '前缀', '后缀', 'api设置', '温度', '模型推荐', '必开'];
        var matchCount = 0;
        for (var j = 0; j < configKeywords.length; j++) {
            if (lowerContent.indexOf(configKeywords[j]) !== -1) matchCount++;
        }

    return matchCount >= 2;
    },

    /**
    * 提取自动解析设置
    */
    _extractAutoParse: function(content) {
        // 匹配自动解析设置
        var autoParseMatch = content.match(/自动解析[\s\S]*?前缀[\s]*([`<\w>]+)[\s\S]*?后缀[\s]*([`<\w>]+)/i);
        if (autoParseMatch) {
            return {
                prefix: autoParseMatch[1].replace(/[<>`]/g, ''),
                suffix: autoParseMatch[2].replace(/[<>`]/g, '')
                };
        }

        // 简化的前缀/后缀匹配
        var prefixMatch = content.match(/前缀[\s]*[<`]?([\w]+)[>`]?/i);
        var suffixMatch = content.match(/后缀[\s]*[<`]?([\w]+)[>`]?/i);
        if (prefixMatch && suffixMatch) {
            return {
                prefix: prefixMatch[1],
                suffix: suffixMatch[1]
                };
        }

    return null;
    },

    /**
    * 提取API设置
    */
    _extractAPISettings: function(content) {
        var settings = {};

        // 提示词后处理
        if (content.indexOf('提示词后处理') !== -1 || content.indexOf('严格无工具') !== -1) {
            settings.promptPostProcessing = 'strict_no_tools';
        }

        // 附加参数
        var extraParamsMatch = content.match(/附加参数[\s\S]*?(\{[\s\S]*?\})/);
        if (extraParamsMatch) {
            try {
                settings.extraParams = JSON.parse(extraParamsMatch[1]);
                } catch(e) {
                    settings.extraParamsString = extraParamsMatch[1];
                }
        }

    // API地址
    var apiUrlMatch = content.match(/api[\s]*地址[\s]*[:：]?[\s]*([\w\.\/:-]+)/i);
    if (apiUrlMatch) {
        settings.apiUrl = apiUrlMatch[1];
    }

    // 命中缓存设置
    if (content.indexOf('命中缓存') !== -1 || content.indexOf('缓存') !== -1) {
        settings.cacheEnabled = true;
    }

    return settings;
    },

    /**
    * 提取模型推荐
    */
    _extractModelRecommendations: function(content) {
        var models = [];
        var modelKeywords = {
            'gemini': 'Gemini',
            'claude': 'Claude',
            'deepseek': 'DeepSeek',
            'gpt': 'GPT',
            'openai': 'OpenAI'
            };

        var lowerContent = content.toLowerCase();
        for (var key in modelKeywords) {
            if (lowerContent.indexOf(key) !== -1) {
                models.push(modelKeywords[key]);
            }
        }

    return models;
    },

    /**
    * 提取正则要求
    */
    _extractRegexRequirements: function(content) {
        var requirements = [];

        // 必开正则
        var mustOpenRegex = /必开[\s\S]*?正则/gi;
        if (mustOpenRegex.test(content)) {
            requirements.push('must_open');
        }

        // 正则顺序要求
        if (content.indexOf('正则放最后') !== -1 || content.indexOf('正则顺序') !== -1) {
            requirements.push('order_important');
        }

    return requirements;
    },

    /**
    * 提取插件需求
    */
    _extractPluginRequirements: function(content) {
        var plugins = [];

        // mermaid插件
        if (content.indexOf('mermaid') !== -1) {
            plugins.push({
                name: 'mermaid',
                url: 'https://github.com/SillyTavern/Extension-Mermaid.git'
                });
        }

        return plugins;
    },

    /**
    * 提取温度推荐
    */
    _extractTemperatureGuide: function(content) {
        var guide = {};

        // 低温推荐
        var lowTempMatch = content.match(/低温[\s\S]*?温度[\s]*([0-9.]+)/i);
        if (lowTempMatch) guide.low = parseFloat(lowTempMatch[1]);

        // 高温推荐
        var highTempMatch = content.match(/高温|超高温[\s\S]*?温度[\s]*([0-9.]+)/i);
        if (highTempMatch) guide.high = parseFloat(highTempMatch[1]);

        // 通用温度
        var generalTempMatch = content.match(/温度[\s]*[:：]?[\s]*([0-9.]+)/i);
        if (generalTempMatch && !guide.low && !guide.high) {
            guide.recommended = parseFloat(generalTempMatch[1]);
        }

        return Object.keys(guide).length > 0 ? guide : null;
    },

    /**
    * 应用配置到游戏
    */
    applyConfig: function(config, presetName) {
        if (!config) return;

        var applied = [];

        // 1. 记录自动解析设置
        if (config.autoParse) {
            applied.push('自动解析: ' + config.autoParse.prefix + ' ... ' + config.autoParse.suffix);
        }

        // 2. 记录API设置
        if (config.apiSettings) {
            if (config.apiSettings.promptPostProcessing) {
                applied.push('提示词后处理: ' + config.apiSettings.promptPostProcessing);
            }
            if (config.apiSettings.extraParams) {
                applied.push('附加参数: ' + JSON.stringify(config.apiSettings.extraParams));
            }
            if (config.apiSettings.apiUrl) {
                applied.push('API地址: ' + config.apiSettings.apiUrl);
            }
        }

        // 3. 记录模型推荐
        if (config.modelRecommendations.length > 0) {
            applied.push('推荐模型: ' + config.modelRecommendations.join(', '));
        }

        // 4. 记录插件需求
        if (config.pluginRequirements.length > 0) {
            var pluginNames = config.pluginRequirements.map(function(p) { return p.name; });
            applied.push('需要插件: ' + pluginNames.join(', '));
        }

        // 5. 记录温度推荐
        if (config.temperatureGuide) {
            var tempStr = '';
            if (config.temperatureGuide.recommended) {
                tempStr = config.temperatureGuide.recommended;
            } else if (config.temperatureGuide.low && config.temperatureGuide.high) {
                tempStr = config.temperatureGuide.low + ' - ' + config.temperatureGuide.high;
            }
            applied.push('温度推荐: ' + tempStr);
        }

    // 输出日志
    if (applied.length > 0) {
        console.log('[智能配置] 预设「' + presetName + '」已自动配置:');
        applied.forEach(function(item) {
            console.log('  ✓ ' + item);
            });
        UI.toast('已智能配置 ' + applied.length + ' 项设置');
    }

    this.currentConfig = config;
    },

    /**
    * 从预设加载并应用配置
    */
    loadFromPreset: function(preset) {
        var config = this.extractConfig(preset);
        if (config) {
            this.applyConfig(config, preset.name || '未命名');
        }
        return config;
    },

    // 【P2清理】删除 getConfigSummary（全项目零调用）
};
