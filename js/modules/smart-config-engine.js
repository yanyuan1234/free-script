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
        // 【P0 根因修复】用 indexOf 线性扫描替代双 [\s\S]*? 正则，避免灾难性回溯
        var autoParseMatch = null;
        var _apIdx = content.indexOf('自动解析');
        if (_apIdx !== -1) {
            var _prefixIdx = content.indexOf('前缀', _apIdx + 4);
            if (_prefixIdx !== -1) {
                // 提取前缀值：[`<\w>]+
                var _prefixValMatch = content.slice(_prefixIdx + 2).match(/^\s*([`<\w>]+)/i);
                if (_prefixValMatch) {
                    var _suffixIdx = content.indexOf('后缀', _prefixIdx + 2);
                    if (_suffixIdx !== -1) {
                        var _suffixValMatch = content.slice(_suffixIdx + 2).match(/^\s*([`<\w>]+)/i);
                        if (_suffixValMatch) {
                            autoParseMatch = [_prefixValMatch[0], _prefixValMatch[1], _suffixValMatch[1]];
                        }
                    }
                }
            }
        }
        // Fallback：原始双 [\s\S]*? 正则（仅在 indexOf 扫描未找到时使用）
        if (!autoParseMatch) {
            try {
                autoParseMatch = content.match(/自动解析[\s\S]*?前缀[\s]*([`<\w>]+)[\s\S]*?后缀[\s]*([`<\w>]+)/i);
            } catch(e) { autoParseMatch = null; }
        }
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
        // 【P0 根因修复】用 indexOf 线性扫描替代双 [\s\S]*? 正则
        var extraParamsMatch = null;
        var _epIdx = content.indexOf('附加参数');
        if (_epIdx !== -1) {
            var _braceStart = content.indexOf('{', _epIdx + 4);
            if (_braceStart !== -1) {
                // 找配对的 }（支持嵌套）
                var _depth = 1;
                var _pos = _braceStart + 1;
                while (_pos < content.length && _depth > 0) {
                    var _ch = content.charAt(_pos);
                    if (_ch === '{') _depth++;
                    else if (_ch === '}') _depth--;
                    _pos++;
                }
                if (_depth === 0) {
                    extraParamsMatch = [content.slice(_braceStart, _pos), content.slice(_braceStart, _pos)];
                }
            }
        }
        // Fallback
        if (!extraParamsMatch) {
            try {
                extraParamsMatch = content.match(/附加参数[\s\S]*?(\{[\s\S]*?\})/);
            } catch(e) { extraParamsMatch = null; }
        }
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
        // 【P0 修复】用 indexOf 替代 [\s\S]*? 正则
        var _mustOpen = (content.indexOf('必开') !== -1 && content.indexOf('正则', content.indexOf('必开')) !== -1);
        if (_mustOpen) {
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
        // 【P0 修复】用 indexOf 替代 [\s\S]*? 正则
        var lowTempMatch = null;
        var _lowIdx = content.indexOf('低温');
        if (_lowIdx !== -1) {
            var _tempIdx = content.indexOf('温度', _lowIdx + 2);
            if (_tempIdx !== -1) {
                var _lowValMatch = content.slice(_tempIdx + 2).match(/^\s*([0-9.]+)/i);
                if (_lowValMatch) lowTempMatch = [_lowValMatch[0], _lowValMatch[1]];
            }
        }
        if (!lowTempMatch) {
            try { lowTempMatch = content.match(/低温[\s\S]*?温度[\s]*([0-9.]+)/i); } catch(e) {}
        }
        if (lowTempMatch) guide.low = parseFloat(lowTempMatch[1]);

        // 高温推荐
        // 【P0 修复】用 indexOf 替代 [\s\S]*? 正则
        var highTempMatch = null;
        var _highIdx = content.indexOf('高温');
        if (_highIdx === -1) _highIdx = content.indexOf('超高温');
        if (_highIdx !== -1) {
            var _tempIdx2 = content.indexOf('温度', _highIdx + 2);
            if (_tempIdx2 !== -1) {
                var _highValMatch = content.slice(_tempIdx2 + 2).match(/^\s*([0-9.]+)/i);
                if (_highValMatch) highTempMatch = [_highValMatch[0], _highValMatch[1]];
            }
        }
        if (!highTempMatch) {
            try { highTempMatch = content.match(/高温|超高温[\s\S]*?温度[\s]*([0-9.]+)/i); } catch(e) {}
        }
        if (highTempMatch) guide.high = parseFloat(highTempMatch[1]);

        // 通用温度
        var generalTempMatch = content.match(/温度[\s]*[:：]?[\s]*([0-9.]+)/i);
        if (generalTempMatch && !guide.low && !guide.high) {
            guide.recommended = parseFloat(generalTempMatch[1]);
        }

        return Object.keys(guide).length > 0 ? guide : null;
    },

    /**
    * 从预设加载并应用配置
    * [优化#4] 改为调用 applyConfig 真正应用，而非仅 logConfig 记录
    */
    loadFromPreset: function(preset) {
        var config = this.extractConfig(preset);
        if (config) {
            this.applyConfig(config, preset.name || '未命名');
        }
        return config;
    },

    // [优化#4] applyConfig：真正应用推荐配置（温度、API URL）
    // 替代旧"仅记录+提示"的空壳行为，让一键应用真正生效
    applyConfig: function(config, presetName) {
        if (!config) return false;
        var applied = [];

        // 1. 应用温度推荐到 PresetManager.currentParams
        if (config.temperatureGuide) {
            var temp = config.temperatureGuide.recommended;
            if (temp == null && config.temperatureGuide.low != null) {
                // 没有推荐值时取区间中点
                temp = (config.temperatureGuide.low + (config.temperatureGuide.high || config.temperatureGuide.low)) / 2;
            }
            if (temp != null && !isNaN(temp) && temp > 0 && temp <= 2) {
                try {
                    if (typeof PresetManager !== 'undefined' && PresetManager.currentParams) {
                        PresetManager.currentParams.temperature = temp;
                        applied.push('温度 ' + temp);
                        // 刷新 UI 显示
                        if (typeof refreshPresetParams === 'function') refreshPresetParams();
                    }
                } catch (e) { console.warn('[SmartConfig] 应用温度失败:', e); }
            }
        }

        // 2. 应用 API URL（如果当前为空，避免覆盖玩家已配置的地址）
        if (config.apiSettings && config.apiSettings.apiUrl) {
            try {
                if (typeof gameState !== 'undefined' && gameState && !gameState.apiUrl) {
                    gameState.apiUrl = config.apiSettings.apiUrl;
                    applied.push('API地址 ' + config.apiSettings.apiUrl);
                }
            } catch (e) { /* gameState 不可用时跳过 */ }
        }

        // 3. 仍记录到 currentConfig 供 UI 展示
        this.currentConfig = config;

        if (applied.length > 0) {
            console.log('[SmartConfig] 已应用推荐配置（' + (presetName || '未命名') + '）: ' + applied.join('，'));
            if (typeof UI !== 'undefined' && UI.toast) {
                UI.toast('已应用推荐配置：' + applied.join('、'));
            }
            return true;
        }
        return false;
    },

    // [T1-P1-18] 占位方法（报告 P1-18 提到 getConfigSummary 不存在），返回当前
    // currentConfig 字段（也用于外部检测是否已加载推荐配置）
    getConfigSummary: function() {
        return this.currentConfig || null;
        }


};
