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

        // 1. 应用自动解析设置
        if (config.autoParse) {
            gameState._cotPrefix = config.autoParse.prefix;
            gameState._cotSuffix = config.autoParse.suffix;
            applied.push('自动解析: ' + config.autoParse.prefix + ' ... ' + config.autoParse.suffix);
        }

        // 2. 应用API设置
        if (config.apiSettings) {
            if (config.apiSettings.promptPostProcessing) {
                gameState._promptPostProcessing = config.apiSettings.promptPostProcessing;
                applied.push('提示词后处理: ' + config.apiSettings.promptPostProcessing);
            }
        if (config.apiSettings.extraParams) {
            gameState._apiExtraParams = config.apiSettings.extraParams;
            applied.push('附加参数: ' + JSON.stringify(config.apiSettings.extraParams));
        }
    if (config.apiSettings.apiUrl) {
        gameState._apiUrl = config.apiSettings.apiUrl;
        applied.push('API地址: ' + config.apiSettings.apiUrl);
    }
    }

    // 3. 记录模型推荐
    if (config.modelRecommendations.length > 0) {
        gameState._recommendedModels = config.modelRecommendations;
        applied.push('推荐模型: ' + config.modelRecommendations.join(', '));
    }

    // 4. 记录插件需求
    if (config.pluginRequirements.length > 0) {
        gameState._requiredPlugins = config.pluginRequirements;
        var pluginNames = config.pluginRequirements.map(function(p) { return p.name; });
        applied.push('需要插件: ' + pluginNames.join(', '));
    }

    // 5. 记录温度推荐
    if (config.temperatureGuide) {
        gameState._temperatureGuide = config.temperatureGuide;
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
            console.log('  ✅ ' + item);
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

    /**
    * 获取配置摘要（用于显示）
    */
    getConfigSummary: function() {
        if (!this.currentConfig) return '无配置';

        var summary = [];
        var config = this.currentConfig;

        if (config.autoParse) {
            summary.push('自动解析: ' + config.autoParse.prefix + '/' + config.autoParse.suffix);
        }
        if (config.modelRecommendations.length > 0) {
            summary.push('推荐模型: ' + config.modelRecommendations.join('/'));
        }
    if (config.apiSettings.promptPostProcessing) {
        summary.push('后处理: ' + config.apiSettings.promptPostProcessing);
    }

    return summary.join(' | ') || '基础配置';
    }
};

var PresetManager = {
    presets: [],
    currentPresetIndex: -1,
    // 当前应用的参数
    currentParams: {
        temperature: 0.8,
        top_p: 0.9,
        top_k: 0,
        frequency_penalty: 0,
        presence_penalty: 0,
        max_tokens: 4096,
        tool_reasoning_mode: 'disabled'
    },

    // 初始化
    init: function() {
        this.load();
        this.loadCurrentParams();
        this.bindEvents();
        },

    // 从localStorage加载预设列表
    load: function() {
        try {
            var data = JSON.parse(localStorage.getItem('freeScript_apiPresets') || '[]');
            this.presets = Array.isArray(data) ? data : [];
            } catch(e) {
                console.error('[APIPresetManager] 读取apiPresets失败:', e);
                this.presets = [];
            }
        },

    // 保存预设列表
    save: function() {
        safeSetItem('freeScript_apiPresets', JSON.stringify(this.presets));
        },

    // 加载当前参数
    loadCurrentParams: function() {
        var params = {};
        try {
            params = JSON.parse(localStorage.getItem('freeScript_currentParams') || '{}');
            } catch(e) {
                console.error('[APIPresetManager] 读取currentParams失败:', e);
                params = {};
            }
        if (params.temperature !== undefined) this.currentParams.temperature = params.temperature;
        if (params.top_p !== undefined) this.currentParams.top_p = params.top_p;
        if (params.top_k !== undefined) this.currentParams.top_k = params.top_k;
        if (params.frequency_penalty !== undefined) this.currentParams.frequency_penalty = params.frequency_penalty;
        if (params.presence_penalty !== undefined) this.currentParams.presence_penalty = params.presence_penalty;
        if (params.max_tokens !== undefined) this.currentParams.max_tokens = params.max_tokens;
        if (params.tool_reasoning_mode !== undefined) this.currentParams.tool_reasoning_mode = params.tool_reasoning_mode;
        this.syncParamsToUI();
        },

    // 保存当前参数
    saveCurrentParams: function() {
        safeSetItem('freeScript_currentParams', JSON.stringify(this.currentParams));
        },

    // 同步参数到UI
    syncParamsToUI: function() {
        var tempEl = document.getElementById('presetTemp');
        var topPEl = document.getElementById('presetTopP');
        var freqEl = document.getElementById('presetFreqPen');
        var presEl = document.getElementById('presetPresPen');
        var maxTokensEl = document.getElementById('presetMaxTokens');
        var topKEl = document.getElementById('presetTopK');

        if (tempEl) {
            tempEl.value = this.currentParams.temperature;
            var tempValueEl = document.getElementById('presetTempValue');
            if (tempValueEl) tempValueEl.textContent = this.currentParams.temperature;
        }
        if (topPEl) {
            topPEl.value = this.currentParams.top_p;
            var topPValueEl = document.getElementById('presetTopPValue');
            if (topPValueEl) topPValueEl.textContent = this.currentParams.top_p;
        }
    if (freqEl) {
        freqEl.value = this.currentParams.frequency_penalty;
        var freqPenValueEl = document.getElementById('presetFreqPenValue');
        if (freqPenValueEl) freqPenValueEl.textContent = this.currentParams.frequency_penalty;
    }
    if (presEl) {
        presEl.value = this.currentParams.presence_penalty;
        var presPenValueEl = document.getElementById('presetPresPenValue');
        if (presPenValueEl) presPenValueEl.textContent = this.currentParams.presence_penalty;
    }
    if (maxTokensEl) maxTokensEl.value = this.currentParams.max_tokens;
    if (topKEl) topKEl.value = this.currentParams.top_k;
    // Sync presetMinP
    var minPEl = document.getElementById('presetMinP');
    if (minPEl) {
        minPEl.value = this.currentParams.min_p || 0;
        var minPValueEl = document.getElementById('presetMinPValue');
        if (minPValueEl) minPValueEl.textContent = this.currentParams.min_p || 0;
    }
    // Sync presetStreamToggle display state
    var streamToggle = document.getElementById('presetStreamToggle');
    if (streamToggle) {
        if (this.currentParams.stream !== false) {
            streamToggle.classList.add('checked');
            } else {
            streamToggle.classList.remove('checked');
        }
    }
    // 同步游戏设置的流式开关
    gameState.useStream = this.currentParams.stream !== false;
    var streamOn = document.getElementById('streamOn');
    var streamOff = document.getElementById('streamOff');
    if (streamOn && streamOff) {
        if (gameState.useStream) {
            streamOn.classList.add('active');
            streamOff.classList.remove('active');
            } else {
            streamOff.classList.add('active');
            streamOn.classList.remove('active');
        }
    }
    },

    // 从UI同步参数
    syncParamsFromUI: function() {
        var tempEl = document.getElementById('presetTemp');
        var topPEl = document.getElementById('presetTopP');
        var freqEl = document.getElementById('presetFreqPen');
        var presEl = document.getElementById('presetPresPen');
        var maxTokensEl = document.getElementById('presetMaxTokens');
        var topKEl = document.getElementById('presetTopK');

        if (tempEl) this.currentParams.temperature = parseFloat(tempEl.value) || 0.8;
        if (topPEl) this.currentParams.top_p = parseFloat(topPEl.value) || 0.9;
        if (freqEl) this.currentParams.frequency_penalty = parseFloat(freqEl.value) || 0;
        if (presEl) this.currentParams.presence_penalty = parseFloat(presEl.value) || 0;
        if (maxTokensEl) this.currentParams.max_tokens = parseInt(maxTokensEl.value) || 4096;
        if (topKEl) this.currentParams.top_k = parseInt(topKEl.value) || 0;
        // Read presetMinP
        var minPEl = document.getElementById('presetMinP');
        if (minPEl) this.currentParams.min_p = parseFloat(minPEl.value) || 0;
        // Read presetStreamToggle state
        var streamToggle = document.getElementById('presetStreamToggle');
        if (streamToggle) {
            this.currentParams.stream = streamToggle.classList.contains('checked');
        }
        // 同步游戏设置的流式开关
        gameState.useStream = this.currentParams.stream !== false;
        var streamOn = document.getElementById('streamOn');
        var streamOff = document.getElementById('streamOff');
        if (streamOn && streamOff) {
            if (gameState.useStream) {
                streamOn.classList.add('active');
                streamOff.classList.remove('active');
                } else {
                streamOff.classList.add('active');
                streamOn.classList.remove('active');
            }
    }

    this.saveCurrentParams();

    // 【同步】预设max_tokens修改后，同步到设置页面的"剧情长度"和gameState
    var storyLengthEl = document.getElementById('settingStoryLength');
    if (storyLengthEl) {
        storyLengthEl.value = this.currentParams.max_tokens || 4096;
    }
    if (typeof gameState !== 'undefined') {
        gameState.maxTokens = this.currentParams.max_tokens || 4096;
    }
    },

    // 绑定事件
    bindEvents: function() {
        const self = this;

        // 主页面按钮
        var menuBtn = document.getElementById('btnMenuPresets');
        if (menuBtn) {
            menuBtn.addEventListener('click', function() { self.showModal(); });
        }

        // 剧情页按钮
        var headerBtn = document.getElementById('btnPresetsHeader');
        if (headerBtn) {
            headerBtn.addEventListener('click', function() { self.showModal(); });
        }

    // 导入按钮
    var importBtn = document.getElementById('btnPresetImport');
    var fileInput = document.getElementById('presetFileInput');
    if (importBtn && fileInput) {
        importBtn.addEventListener('click', function() { fileInput.click(); });
        fileInput.addEventListener('change', function(e) {
            if (e.target.files[0]) self.importFromFile(e.target.files[0]);
            fileInput.value = '';
            });
    }

    // 导出按钮
    var exportBtn = document.getElementById('btnPresetExport');
    if (exportBtn) {
        exportBtn.addEventListener('click', function() {
            var idx = PresetManager.currentPresetIndex || 0;
            PresetManager.exportPreset(idx);
            });
    }

    // 保存当前为预设
    var saveBtn = document.getElementById('btnPresetSaveCurrent');
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            UI.showModal('presetSaveNameModal');
            document.getElementById('presetSaveNameInput').value = '';
            document.getElementById('presetSaveNameInput').focus();
            });
    }

    // 清空全部预设
    var clearAllBtn = document.getElementById('btnPresetClearAll');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', function() {
            self.clearAllPresets();
            });
    }

    // 确认保存
    var saveConfirmBtn = document.getElementById('btnPresetSaveConfirm');
    if (saveConfirmBtn) {
        saveConfirmBtn.addEventListener('click', function() {
            var name = document.getElementById('presetSaveNameInput').value.trim();
            if (!name) {
                UI.toast('请输入预设名称');
                return;
            }
        self.saveCurrentAsPreset(name);
        UI.hideModal('presetSaveNameModal');
        });
    }

    // 应用参数按钮
    var applyBtn = document.getElementById('btnPresetApplyParams');
    if (applyBtn) {
        applyBtn.addEventListener('click', function() {
            self.syncParamsFromUI();
            UI.toast('参数已应用');
            });
    }

    // 参数调节区域折叠/展开
    var paramsToggle = document.getElementById('presetParamsToggle');
    var paramsContent = document.getElementById('presetParamsContent');
    var paramsToggleIcon = document.getElementById('presetParamsToggleIcon');
    if (paramsToggle && paramsContent && paramsToggleIcon) {
        paramsToggle.addEventListener('click', function() {
            var isHidden = paramsContent.style.display === 'none';
            paramsContent.style.display = isHidden ? '' : 'none';
            paramsToggleIcon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
            paramsToggleIcon.textContent = isHidden ? '▲' : '▼';
            });
    }

    // 滑块实时更新显示值
    ['presetTemp', 'presetTopP', 'presetFreqPen', 'presetPresPen', 'presetTopK', 'presetMinP'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', function() {
                var valueEl = document.getElementById(id + 'Value');
                if (valueEl) valueEl.textContent = el.value;
                });
        }
    });

    // 预设详情返回按钮
    var backBtn = document.getElementById('btnBackToPresetList');
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            UI.hideModal('presetDetailModal');
            });
    }

    // 全部开启/关闭按钮
    var toggleAllBtn = document.getElementById('presetToggleAll');
    if (toggleAllBtn) {
        toggleAllBtn.addEventListener('click', function() {
            self._toggleAllPrompts();
            });
    }
    },

    // 显示模态框
    showModal: function() {
        this.syncParamsToUI();
        this.renderPresetList();
        UI.showModal('presetManagerModal');
        },

    // 渲染预设列表
    renderPresetList: function() {
        var container = document.getElementById('presetManagerList');
        var currentInfo = document.getElementById('currentPresetInfo');
        var currentName = document.getElementById('currentPresetName');
        var currentParams = document.getElementById('currentPresetParams');

        if (!container) return;

        if (this.presets.length === 0) {
            if (currentInfo) currentInfo.style.display = 'none';
            container.innerHTML = '<div class="empty-state">暂无预设<br>点击「导入酒馆预设」或「保存当前为预设」</div>';
            return;
        }

        // 显示当前参数
        if (currentInfo) {
            currentInfo.style.display = 'block';
            if (currentName) currentName.textContent = this.currentPresetIndex >= 0 ? this.presets[this.currentPresetIndex].name : '自定义参数';
            if (currentParams) {
                var cp = this.currentParams;
                var paramParts = [];
                paramParts.push('Temp:' + cp.temperature);
                paramParts.push('TopP:' + cp.top_p);
                if (cp.top_k && cp.top_k > 0) paramParts.push('TopK:' + cp.top_k);
                if (cp.frequency_penalty !== 0) paramParts.push('FreqPen:' + cp.frequency_penalty);
                if (cp.presence_penalty !== 0) paramParts.push('PresPen:' + cp.presence_penalty);
                paramParts.push('Max:' + cp.max_tokens);
                currentParams.textContent = paramParts.join(' | ');
            }
    }

    var html = '';
    const self = this;
    this.presets.forEach(function(preset, idx) {
        var isActive = idx === self.currentPresetIndex;
        var params = preset.params || {};
        var promptCount = (preset.prompts && preset.prompts.length) || 0;
        var enabledPromptCount = 0;
        if (preset.prompts) {
            preset.prompts.forEach(function(p) { if (p.enabled !== false) enabledPromptCount++; });
        }

    // 构建参数标签
    var tags = [];
    if (params.temperature != null) tags.push('<span style="background:#8b5cf6;color:#fff;">Temp:' + params.temperature + '</span>');
    if (params.top_p != null) tags.push('<span style="background:#6366f1;color:#fff;">TopP:' + params.top_p + '</span>');
    if (params.top_k && params.top_k > 0) tags.push('<span style="background:#f59e0b;color:#fff;">TopK:' + params.top_k + '</span>');
    if (params.min_p && params.min_p > 0) tags.push('<span style="background:#10b981;color:#fff;">MinP:' + params.min_p + '</span>');
    if (params.frequency_penalty != null && params.frequency_penalty !== 0) tags.push('<span style="background:var(--danger);color:#fff;">FreqPen:' + params.frequency_penalty + '</span>');
    if (params.presence_penalty != null && params.presence_penalty !== 0) tags.push('<span style="background:#0ea5e9;color:#fff;">PresPen:' + params.presence_penalty + '</span>');
    if (params.max_tokens) tags.push('<span style="background:#64748b;color:#fff;">Max:' + params.max_tokens + '</span>');
    if (promptCount > 0) tags.push('<span style="background:var(--accent);color:#fff;">提示词:' + enabledPromptCount + '/' + promptCount + '</span>');

    var tagsHtml = tags.length > 0
    ? '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px;">' + tags.map(function(t) { return '<span style="font-size:9px;padding:1px 5px;border-radius:3px;">' + t + '</span>'; }).join('') + '</div>'
    : '';

    html += '<div class="pearl-card" style="padding:10px;margin-bottom:10px;cursor:pointer;border:' + (isActive ? '2px solid var(--accent)' : 'none') + ';" data-preset-idx="' + idx + '">' +
    '<div style="display:flex;justify-content:space-between;align-items:start;">' +
    '<div style="flex:1;min-width:0;" data-preset-load="' + idx + '">' +
    '<div style="font-size:13px;font-weight:600;">' + escapeHtml(preset.name) + (isActive ? ' ✓' : '') + '</div>' +
    tagsHtml +
    '</div>' +
    '<div style="display:flex;gap:6px;flex-shrink:0;margin-left:8px;align-items:center;">' +
    (promptCount > 0 ? '<span class="preset-detail-btn" data-idx="' + idx + '" style="font-size:11px;padding:3px 8px;background:transparent;color:var(--accent);border:1px solid var(--accent);border-radius:6px;cursor:pointer;white-space:nowrap;" title="查看提示词条目">详情</span>' : '') +
    '<span class="preset-load-btn" data-preset-load="' + idx + '" style="font-size:11px;padding:3px 8px;background:' + (isActive ? 'var(--accent)' : 'transparent') + ';color:' + (isActive ? '#fff' : 'var(--accent)') + ';border:1px solid var(--accent);border-radius:6px;cursor:pointer;white-space:nowrap;' + (isActive ? 'font-weight:500;' : '') + '" title="加载此预设">加载</span>' +
    '<span class="preset-delete-btn" data-idx="' + idx + '" style="font-size:11px;padding:3px 8px;background:#fff;color:var(--danger);border:1px solid var(--danger);border-radius:6px;cursor:pointer;white-space:nowrap;" title="删除此预设">删除</span>' +
    '</div>' +
    '</div>' +
    '</div>';
    });

    container.innerHTML = html;

    // 绑定加载和删除事件
    // 使用事件委托
    container.onclick = function(e) {
        var detailEl = e.target.closest('.preset-detail-btn');
        if (detailEl) {
            e.stopPropagation();
            self.openPresetDetail(parseInt(detailEl.dataset.idx));
            return;
        }
    var loadEl = e.target.closest('[data-preset-load]');
    if (loadEl) {
        e.stopPropagation();
        self.loadPreset(parseInt(loadEl.dataset.presetLoad));
        return;
    }
    var deleteEl = e.target.closest('.preset-delete-btn');
    if (deleteEl) {
        e.stopPropagation();
        self.deletePreset(parseInt(deleteEl.dataset.idx));
        return;
    }
    // 点击卡片其他区域也加载
    var cardEl = e.target.closest('[data-preset-idx]');
    if (cardEl) {
        self.loadPreset(parseInt(cardEl.dataset.presetIdx));
    }
    };
    },

    // 导入酒馆预设
    importFromFile: function(file) {
        const self = this;
        var reader = new FileReader();
        reader.onload = function(e) {
            try {
                var data = JSON.parse(e.target.result);
                var imported = self.parsePreset(data, file.name);
                if (imported) {
                    self.presets.push(imported);
                    if (self.presets.length > 30) self.presets = self.presets.slice(0, 30);
                    self.save();
                    self.renderPresetList();

                    // 自动加载导入的预设（应用参数和提示词）
                    var newIdx = self.presets.length - 1;
                    try {
                        self.loadPreset(newIdx);
                        } catch(loadErr) {
                        console.error('[PresetManager] loadPreset 失败:', loadErr);
                        }

                    // 提示导入的提示词数量
                    if (imported.prompts && imported.prompts.length > 0) {
                        UI.toast('已导入 ' + imported.prompts.length + ' 个提示词条目');
                    }

                // 预设正则脚本保持在预设内部，不添加到全局列表
                // 加载预设时会自动通过 RegexManager.setPresetScripts() 切换
                if (imported.regexScripts && imported.regexScripts.length > 0) {
                    try {
                        // 解析正则脚本格式，但保持在预设内部
                        imported._parsedRegexScripts = RegexManager.parseRegexScripts(imported.regexScripts);
                        UI.toast('已导入 ' + imported.regexScripts.length + ' 个正则脚本（预设绑定）');
                        } catch(regexErr) {
                        console.error('[PresetManager] 正则脚本解析失败:', regexErr);
                        }
                }

                UI.toast('成功导入预设: ' + imported.name);
                } else {
                UI.toast('无法识别的预设格式');
            }
        } catch(err) {
        console.error('[PresetManager] 导入失败，完整错误堆栈:', err);
        UI.toast('导入失败: ' + translateError(err.message));
        }
    };
    reader.readAsText(file);
    },

    // 解析酒馆预设格式
    parsePreset: function(data, fileName) {
        // 辅助函数：安全取值，避免 0 被 falsy 吞掉
        function safeNum(a, b, c, def) {
            if (a != null) return a;
            if (b != null) return b;
            if (c != null) return c;
            return def;
        }
        // 提取参数（支持多种字段名，兼容 Chat Completion 和 Text Completion 两种格式）
        // 包含所有酒馆支持的采样参数
        var params = {
            temperature: safeNum(data.temp, data.temperature, 0.8),
            top_p: safeNum(data.top_p, null, 0.9),
            top_k: safeNum(data.top_k, null, 0),
            frequency_penalty: safeNum(data.freq_pen, data.frequency_penalty, 0),
            presence_penalty: safeNum(data.pres_pen, data.presence_pen, data.presence_penalty, 0),
            max_tokens: safeNum(data.openai_max_tokens, data.max_tokens, 4096),
            max_context: safeNum(data.openai_max_context, data.max_context, 8192),
            min_p: safeNum(data.min_p, null, 0),
            top_a: safeNum(data.top_a, null, 0),
            repetition_penalty: safeNum(data.repetition_penalty, data.rep_pen, 1),
            // 新增：酒馆支持的额外采样参数
            typical_p: safeNum(data.typical_p, null, 1),
            min_length: safeNum(data.min_length, null, 0),
            max_time: safeNum(data.max_time, null, null),
            // 【改进1】stop_sequences直接使用字符串值，不用safeNum
            stop_sequences: data.stop_seq || data.stop_sequence || data.stop || data.stop_newlines || null,
            // 新增：Mirostat采样参数
            mirostat_mode: safeNum(data.mirostat_mode, null, 0),
            mirostat_tau: safeNum(data.mirostat_tau, null, 5.0),
            mirostat_eta: safeNum(data.mirostat_eta, null, 0.1),
            // 新增：重复惩罚范围
            repetition_penalty_range: safeNum(data.repetition_penalty_range, data.rep_pen_range, null, 0),
            repetition_penalty_slope: safeNum(data.repetition_penalty_slope, data.rep_pen_slope, null, 0),
            // 新增：其他高级参数
            tail_free_sampling: safeNum(data.tail_free_sampling, data.tfs, null, 1),
            epsilon_cutoff: safeNum(data.epsilon_cutoff, null, 0),
            eta_cutoff: safeNum(data.eta_cutoff, null, 0),
            dry_multiplier: safeNum(data.dry_multiplier, null, 0),
            dry_range: safeNum(data.dry_range, null, 0),
            dry_allowed_length: safeNum(data.dry_allowed_length, null, 2),
            xtc_probability: safeNum(data.xtc_probability, null, 0),
            xtc_threshold: safeNum(data.xtc_threshold, null, 0),
            // 新增：额外选项
            seed: safeNum(data.seed, null, null),
            response_format: safeNum(data.response_format, null, null),
            modalities: safeNum(data.modalities, null, null),
            tool_reasoning_mode: data.tool_reasoning_mode || 'disabled',
            // DeepSeek V4 等模型的推理参数
            reasoning_effort: data.reasoning_effort || null,
            // 酒馆预设行为控制参数
            show_thoughts: data.show_thoughts !== undefined ? data.show_thoughts : null,
            use_sysprompt: data.use_sysprompt !== undefined ? data.use_sysprompt : true,
            squash_system_messages: data.squash_system_messages || false,
            continue_prefill: data.continue_prefill || false,
            continue_postfix: data.continue_postfix || ' ',
            assistant_prefill: data.assistant_prefill || '',
            assistant_impersonation: data.assistant_impersonation || '',
            function_calling: data.function_calling || false,
            verbosity: data.verbosity || 'auto'
            };

        // 预设名称
        var name = data.name || data.preset || (fileName ? fileName.replace(/\.json$/i, '') : ('导入预设 ' + new Date().toLocaleDateString()));

        // 提取 prompts 数组（酒馆预设的核心内容）
        var importedPrompts = [];
        if (data.prompts && Array.isArray(data.prompts)) {
            // 获取 prompt_order 中的启用状态和排列顺序
            // prompt_order 中可能使用 identifier（UUID）或 name 来引用 prompt
            // 需要同时支持两种匹配方式
            var promptEnabledMap = {};
            var promptNameMap = {};
            // 【修复排序】记录 prompt_order 中的位置索引，用于保留用户的拖拽排列顺序
            var promptOrderIndex = {};  // identifier/name -> 在 orderArr 中的位置
            if (data.prompt_order && Array.isArray(data.prompt_order) && data.prompt_order.length > 0) {
                // 【改进3】优先查找单人聊天(character_id=100000)的prompt_order
                var orderGroup = data.prompt_order.find(function(g) { return g && g.character_id === 100000; })
                || data.prompt_order.find(function(g) { return g != null; });
                var orderArr = orderGroup && orderGroup.order;
                if (orderArr && Array.isArray(orderArr)) {
                    orderArr.forEach(function(item, idx) {
                        // 同时按 identifier 和 name 建立映射
                        if (item.identifier) {
                            promptEnabledMap[item.identifier] = item.enabled;
                            promptOrderIndex[item.identifier] = idx;
                        }
                    if (item.name) {
                        promptNameMap[item.name] = item.enabled;
                        if (!(item.name in promptOrderIndex)) {
                            promptOrderIndex[item.name] = idx;
                        }
                }
            });
    }
    }
    // 解析所有 prompt（包括禁用的），但标记其启用状态
    // 用户可以选择性地开启禁用的条目
    data.prompts.forEach(function(p) {
        if (!p) return;
        // marker=true 的提示词保留（用于世界书注入位置标记）
        // 不再跳过，让 _applyPromptsToSystemPrompt 处理
        // 获取启用状态：优先用 identifier 匹配，其次用 name，最后用自身的 enabled 字段
        var isEnabled = false;
        if (p.identifier && (p.identifier in promptEnabledMap)) {
            isEnabled = promptEnabledMap[p.identifier];
            } else if (p.name && (p.name in promptNameMap)) {
            isEnabled = promptNameMap[p.name];
            } else {
            isEnabled = (p.enabled !== false);
        }
    // 跳过没有实际内容的（即使是启用的）
    if (!p.content || typeof p.content !== 'string' || p.content.trim() === '') return;
    // 跳过纯注释内容（被 {{// ... }} 包裹的）
    var trimmedContent = p.content.trim();
    if (trimmedContent.startsWith('{{//') && trimmedContent.endsWith('}}')) return;
    // 跳过酒馆内置标记位
    // 注意：enhanceDefinitions 是一个有效的提示词，保留其内容
    // 来源：SillyTavern PromptManager.js - enhanceDefinitions 会增强角色定义
    // 【修复】不再跳过内置标记位，保留它们用于注入
    // 这些标记位（personaDescription, charDescription等）在预设中标记了注入位置
    // 保留它们可以让 _applyPromptsToSystemPrompt 正确处理
    var builtinMarkers = ['chatHistory', 'worldInfoBefore', 'worldInfoAfter'];
    // 注意：personaDescription, charDescription, charPersonality, scenario, dialogueExamples 不再跳过
    if (builtinMarkers.indexOf(p.identifier) !== -1 && (!p.content || p.content.trim() === '')) return;

    // enhanceDefinitions 是一个有效的提示词，需要保留
    // 它的内容会增强角色定义（如添加角色扮演指导等）
    if (p.identifier === 'enhanceDefinitions' && (!p.content || p.content.trim() === '')) {
        // 如果 enhanceDefinitions 没有内容，才跳过
        return;
    }

    // 特殊处理 system_prompt 标记的 prompt
    // jailbreak: 越狱提示词（放在聊天历史之后）
    // main: 主系统提示词（标记为系统提示词）
    // nsfw: NSFW提示词（标记为越狱提示词）
    if (p.identifier === 'jailbreak' || p.identifier === 'nsfw') {
        importedPrompts.push({
            identifier: p.identifier || '',
            name: p.name || '',
            role: p.role || 'system',
            content: p.content,
            injection_position: p.injection_position || 0,
            injection_depth: p.injection_depth || 4,
            // 【修复排序】优先使用 prompt_order 中的位置作为 injection_order
            // 如果 prompt 自身设置了 injection_order 且不是默认值100，则保留原值
            // 否则使用 prompt_order 中的位置索引，确保排列顺序与酒馆一致
            injection_order: (p.injection_order != null && p.injection_order !== 100)
            ? p.injection_order
            : (promptOrderIndex[p.identifier] != null ? promptOrderIndex[p.identifier] : (promptOrderIndex[p.name] != null ? promptOrderIndex[p.name] : 100)),
            system_prompt: !!p.system_prompt,
            isJailbreak: true,  // 标记为越狱提示词，放在聊天历史之后
            enabled: isEnabled,  // 保留原有的启用状态
            // 酒馆V2新增字段
            forbid_overrides: !!p.forbid_overrides,
            injection_trigger: p.injection_trigger || []
            });
        return;
    }

    importedPrompts.push({
        identifier: p.identifier || '',
        name: p.name || '',
        role: p.role || 'system',
        content: p.content,
        injection_position: p.injection_position || 0,
        injection_depth: p.injection_depth || 4,
        // 【修复排序】同上，保留用户的拖拽排列顺序
        injection_order: (p.injection_order != null && p.injection_order !== 100)
        ? p.injection_order
        : (promptOrderIndex[p.identifier] != null ? promptOrderIndex[p.identifier] : (promptOrderIndex[p.name] != null ? promptOrderIndex[p.name] : 100)),
        system_prompt: !!p.system_prompt,
        enabled: isEnabled,  // 保留原有的启用状态
        // 酒馆V2新增字段
        forbid_overrides: !!p.forbid_overrides,
        injection_trigger: p.injection_trigger || []
        });
    });

    // 【修复排序】按 prompt_order 的顺序重排 importedPrompts
    // 酒馆中 data.prompts 的数组顺序不等于用户拖拽的排列顺序
    // 真正的排序由 prompt_order 决定，必须以此为准
    if (data.prompt_order && Array.isArray(data.prompt_order) && data.prompt_order.length > 0) {
        var orderGroup = data.prompt_order.find(function(g) { return g && g.character_id === 100000; })
        || data.prompt_order.find(function(g) { return g != null; });
        var orderArr = orderGroup && orderGroup.order;
        if (orderArr && Array.isArray(orderArr) && orderArr.length > 0) {
            // 建立 identifier/name -> 排序索引 的映射
            var sortOrderMap = {};
            orderArr.forEach(function(item, idx) {
                if (item.identifier) sortOrderMap[item.identifier] = idx;
                if (item.name && !(item.name in sortOrderMap)) sortOrderMap[item.name] = idx;
                });
            // 稳定排序：按 prompt_order 中的位置排列，不在 order 中的保持原相对顺序
            importedPrompts.sort(function(a, b) {
                var orderA = sortOrderMap[a.identifier] != null ? sortOrderMap[a.identifier] : (sortOrderMap[a.name] != null ? sortOrderMap[a.name] : 99999);
                var orderB = sortOrderMap[b.identifier] != null ? sortOrderMap[b.identifier] : (sortOrderMap[b.name] != null ? sortOrderMap[b.name] : 99999);
                return orderA - orderB;
                });
        }
    }
    }

    // 提取 extensions.regex_scripts 和 SPreset.RegexBinding.regexes
    // 去重：同一条正则可能同时存在于两个位置
    //
    // 【注释说明 - 正则脚本的两种来源】
    // 来源1: extensions.regex_scripts — 酒馆标准正则脚本存储位置
    //   这是 SillyTavern 核心代码识别的路径，正则扩展（Regex Extension）从这里读写预设正则
    //   参考：SillyTavern engine.js 中 getScriptsByType(SCRIPT_TYPES.PRESET) 的读取逻辑
    //   读取路径：preset.extensions.regex_scripts
    //
    // 来源2: extensions.SPreset.RegexBinding.regexes — 酒馆助手（TavernHelper）扩展的正则绑定
    //   这是第三方扩展 TavernHelper 的自定义字段，不是酒馆核心代码识别的路径
    //   TavernHelper 用它来管理预设绑定的正则脚本（合并/覆盖标准正则）
    //   大佬的预设如果使用了酒馆助手，正则可能同时存在于两个位置
    //   保留此路径是为了兼容使用酒馆助手的预设
    var importedRegex = [];
    var regexNameSet = {};
    function addRegexUnique(list) {
        if (!list || !Array.isArray(list)) return;
        list.forEach(function(r) {
            var rName = r.scriptName || r.name || '';
            if (!rName || !regexNameSet[rName]) {
                regexNameSet[rName] = true;
                importedRegex.push(r);
            }
        });
    }
    if (data.extensions && data.extensions.regex_scripts && Array.isArray(data.extensions.regex_scripts)) {
        addRegexUnique(data.extensions.regex_scripts);
    }
    // 来源2: 酒馆助手（TavernHelper）扩展的正则绑定路径
    // 注意：这不是酒馆核心路径，是 TavernHelper 第三方扩展使用的字段
    if (data.extensions && data.extensions.SPreset && data.extensions.SPreset.RegexBinding
    && data.extensions.SPreset.RegexBinding.regexes && Array.isArray(data.extensions.SPreset.RegexBinding.regexes)) {
        addRegexUnique(data.extensions.SPreset.RegexBinding.regexes);
    }

    // 保存 tavern_helper 脚本信息（酒馆助手扩展的JS脚本）
    var tavernHelperScripts = [];
    var tavernHelperPresetConfig = null; // 【修复P0-1】提取酒馆助手预设配置
    if (data.extensions && data.extensions.tavern_helper && data.extensions.tavern_helper.scripts) {
        tavernHelperScripts = data.extensions.tavern_helper.scripts;
    }
    // 【修复P0-1】从 tavern_helper.data.presets.default 提取核心配置（字数、段落、视角等）
    if (data.extensions && data.extensions.tavern_helper && data.extensions.tavern_helper.data
    && data.extensions.tavern_helper.data.presets && data.extensions.tavern_helper.data.presets.default) {
        tavernHelperPresetConfig = data.extensions.tavern_helper.data.presets.default;
    }

    // 【修复】提取 entryGrouping（条目分组信息）
    var entryGrouping = null;
    if (data.extensions && data.extensions.entryGrouping && Array.isArray(data.extensions.entryGrouping) && data.extensions.entryGrouping.length > 0) {
        entryGrouping = data.extensions.entryGrouping;
    }

    // 【修复】提取 entryStates（条目状态，月读/象牙塔预设使用）
    var entryStates = null;
    if (data.extensions && data.extensions.entryStates) {
        entryStates = data.extensions.entryStates;
    }

    // 【修复】提取 regexBindings（象牙塔预设使用的正则绑定）
    var regexBindings = null;
    if (data.extensions && data.extensions.regexBindings) {
        regexBindings = data.extensions.regexBindings;
        // 将 regexBindings 转换为标准 regex_scripts 格式
        if (Array.isArray(regexBindings)) {
            regexBindings.forEach(function(rb) {
                if (!rb) return;
                if (rb.findRegex || rb.find) {
                    addRegexUnique([{
                        id: rb.id || ('regex_' + Math.random().toString(36).substr(2, 9)),
                        scriptName: rb.name || 'Regex Binding',
                        findRegex: rb.findRegex || rb.find,
                        replaceString: rb.replaceString || rb.replace || '',
                        placement: rb.placement || [1, 2],
                        disabled: rb.disabled || false,
                        runOnEdit: rb.runOnEdit !== false
                        }]);
                }
            });
    }
    }

    // 保存 SPreset 配置（预设绑定的扩展配置）
    var spresetConfig = data.extensions && data.extensions.SPreset ? data.extensions.SPreset : null;

    // 【修复】从 SPreset.button 提取快捷回复（果实预设使用）
    var spresetButtons = null;
    if (data.extensions && data.extensions.SPreset && data.extensions.SPreset.button && data.extensions.SPreset.button.buttons) {
        spresetButtons = data.extensions.SPreset.button.buttons;
    }

    // 【新增】提取更多预设功能
    // 提取小剧场配置（月读预设等）
    var theaterConfig = null;
    if (data.extensions && data.extensions.theater) {
        theaterConfig = data.extensions.theater;
    }

    // 提取世界书配置
    var worldInfoConfig = null;
    if (data.extensions && data.extensions.world_info) {
        worldInfoConfig = data.extensions.world_info;
    }

    // 提取角色卡配置
    var characterConfig = null;
    if (data.extensions && data.extensions.character) {
        characterConfig = data.extensions.character;
    }

    // 提取UI主题配置
    var themeConfig = null;
    if (data.extensions && data.extensions.theme) {
        themeConfig = data.extensions.theme;
    }

    // 提取自定义变量
    var customVariables = null;
    if (data.extensions && data.extensions.variables) {
        customVariables = data.extensions.variables;
    }

    // 提取触发器配置
    var triggers = null;
    if (data.extensions && data.extensions.triggers) {
        triggers = data.extensions.triggers;
    }

    // 提取扩展API配置
    var apiExtensions = null;
    if (data.extensions && data.extensions.api) {
        apiExtensions = data.extensions.api;
    }

    // 【修复P0-1】从酒馆助手预设配置中构建 wordCountConfig
    var wordCountConfig = null;
    if (tavernHelperPresetConfig) {
        wordCountConfig = {
            min: tavernHelperPresetConfig.wordCount ? tavernHelperPresetConfig.wordCount.min : undefined,
            max: tavernHelperPresetConfig.wordCount ? tavernHelperPresetConfig.wordCount.max : undefined,
            paragraphMin: tavernHelperPresetConfig.paragraphCount ? tavernHelperPresetConfig.paragraphCount.min : undefined,
            paragraphMax: tavernHelperPresetConfig.paragraphCount ? tavernHelperPresetConfig.paragraphCount.max : undefined,
            paragraphStyle: tavernHelperPresetConfig.paragraphStyle || undefined,
            perspective: tavernHelperPresetConfig.perspective || undefined,
            userPronoun: tavernHelperPresetConfig.userPronoun || undefined,
            takeover: tavernHelperPresetConfig.takeover || undefined,
            narrate: tavernHelperPresetConfig.narrate || undefined,
            aiMode: tavernHelperPresetConfig.aiMode || undefined,
            enabled: true
            };
        // 移除 undefined 字段
        Object.keys(wordCountConfig).forEach(function(k) { if (wordCountConfig[k] === undefined) delete wordCountConfig[k]; });
        // 如果没有任何有效字段，设为 null
        if (Object.keys(wordCountConfig).length <= 1) wordCountConfig = null;
    }

    return {
        name: name,
        params: params,
        prompts: importedPrompts,
        regexScripts: importedRegex,
        tavernHelperScripts: tavernHelperScripts,
        spresetConfig: spresetConfig,
        spresetButtons: spresetButtons,
        entryGrouping: entryGrouping,
        entryStates: entryStates,
        regexBindings: regexBindings,
        // 【新增】更多预设功能
        theaterConfig: theaterConfig,
        worldInfoConfig: worldInfoConfig,
        characterConfig: characterConfig,
        themeConfig: themeConfig,
        customVariables: customVariables,
        triggers: triggers,
        apiExtensions: apiExtensions,
        // 【修复P0-1】字数控制配置（从酒馆助手预设中提取）
        wordCountConfig: wordCountConfig,
        // 酒馆兼容：用户人设提示词
        impersonation_prompt: data.impersonation_prompt || '',
        continue_nudge_prompt: data.continue_nudge_prompt || '[Continue your last message...]',
        names_behavior: data.names_behavior != null ? data.names_behavior : 0,
        // 酒馆兼容：工具推理模式
        tool_reasoning_mode: data.tool_reasoning_mode || 'disabled',
        imported: true,
        time: new Date().toLocaleString()
        };
    },

    // 保存当前参数为预设
    saveCurrentAsPreset: function(name) {
        this.syncParamsFromUI();
        var preset = {
            name: name,
            params: Object.assign({}, this.currentParams),
            imported: false,
            time: new Date().toLocaleString()
            };

        // 检查是否已存在同名预设
        var existingIdx = -1;
        for (var i = 0; i < this.presets.length; i++) {
            if (this.presets[i].name === name) {
                existingIdx = i;
                break;
            }
        }

    if (existingIdx >= 0) {
        this.presets[existingIdx] = preset;
        } else {
        this.presets.unshift(preset);
    }

    if (this.presets.length > 30) this.presets = this.presets.slice(0, 30);
    this.currentPresetIndex = existingIdx >= 0 ? existingIdx : 0;
    this.save();
    this.renderPresetList();
    UI.toast('世界已保存: ' + name);
    },

    // ===== 预设详情（提示词条目管理） =====

    // 当前查看详情的预设索引
    _detailPresetIdx: -1,

    // 打开预设详情
    openPresetDetail: function(idx) {
        var preset = this.presets[idx];
        if (!preset) return;
        this._detailPresetIdx = idx;

        // 设置标题
        document.getElementById('presetDetailTitle').textContent = preset.name || '预设详情';

        // 渲染参数概览
        var paramsEl = document.getElementById('presetDetailParams');
        var params = preset.params || {};
        var paramParts = [];
        if (params.temperature != null) paramParts.push('Temperature: ' + params.temperature);
        if (params.top_p != null) paramParts.push('Top P: ' + params.top_p);
        if (params.top_k && params.top_k > 0) paramParts.push('Top K: ' + params.top_k);
        if (params.min_p && params.min_p > 0) paramParts.push('Min P: ' + params.min_p);
        if (params.frequency_penalty != null && params.frequency_penalty !== 0) paramParts.push('Freq Pen: ' + params.frequency_penalty);
        if (params.presence_penalty != null && params.presence_penalty !== 0) paramParts.push('Pres Pen: ' + params.presence_penalty);
        if (params.max_tokens) paramParts.push('Max Tokens: ' + params.max_tokens);
        if (params.max_context) paramParts.push('Max Context: ' + params.max_context);
        paramsEl.innerHTML = '<div style="font-size:11px;color:var(--text-secondary);line-height:1.6;">' + paramParts.join(' &nbsp;|&nbsp; ') + '</div>';

        // 渲染提示词条目列表
        this._renderPromptList();

        // 渲染预设附带的正则脚本列表
        this._renderPresetRegexList();

        UI.showModal('presetDetailModal');
        },

    // 渲染提示词条目列表（支持 entryGrouping 分组显示）
    _renderPromptList: function() {
        var preset = this.presets[this._detailPresetIdx];
        if (!preset) return;

        var container = document.getElementById('presetPromptList');
        var statsEl = document.getElementById('presetPromptStats');
        var toggleAllEl = document.getElementById('presetToggleAll');
        var prompts = preset.prompts || [];

        if (prompts.length === 0) {
            container.innerHTML = '<div class="empty-state">此预设没有提示词条目<br>仅包含API参数调节</div>';
            statsEl.textContent = '';
            toggleAllEl.style.display = 'none';
            return;
        }

        // 统计启用数量
        var enabledCount = 0;
        prompts.forEach(function(p) { if (p.enabled !== false) enabledCount++; });
        statsEl.textContent = enabledCount + '/' + prompts.length + ' 已启用';

        // 全部开启/全部关闭
        var allEnabled = enabledCount === prompts.length;
        toggleAllEl.textContent = allEnabled ? '全部关闭' : '全部开启';
        toggleAllEl.style.display = '';

        // 角色标签颜色
        var roleColors = { 'system': '#8b5cf6', 'user': '#10b981', 'assistant': '#f59e0b' };
        // 位置标签（使用酒馆标准 injection_depth 映射）
        var posLabels = { 0: '角色前', 1: '角色后', 2: '示例前', 3: '示例后', 4: 'AN顶部', 5: 'AN底部' };
        // injection_position 标签
        var ipLabels = { 0: '聊天前', 1: '聊天后' };

        // 【修复】构建 entryGrouping 分组映射
        var groupMap = {}; // identifier -> group name
        var groupOrder = []; // 保持分组顺序
        if (preset.entryGrouping && Array.isArray(preset.entryGrouping)) {
            preset.entryGrouping.forEach(function(group) {
                if (group.name && group.memberIdentifiers) {
                    groupOrder.push(group.name);
                    group.memberIdentifiers.forEach(function(id) {
                        groupMap[id] = group.name;
                        });
                }
            });
    }

    // 渲染单个 prompt 条目的HTML
    function renderPromptItem(p, i) {
        var isEnabled = p.enabled !== false;
        var roleName = (p.role || 'system');
        var roleColor = roleColors[roleName] || '#64748b';
        var posLabel = posLabels[p.injection_depth] || ('深度' + (p.injection_depth != null ? p.injection_depth : 4));
        if (p.injection_position === 1) posLabel = '聊天后';
        var name = p.name || p.identifier || ('提示条 #' + (i + 1));

        return '<div class="pearl-card" style="padding:8px 10px;margin-bottom:6px;cursor:pointer;opacity:' + (isEnabled ? '1' : '0.5') + ';border-left:3px solid ' + (isEnabled ? 'var(--success)' : 'var(--danger)') + ';" data-prompt-idx="' + i + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<div style="flex:1;min-width:0;" data-prompt-view="' + i + '">' +
        '<div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(name) + '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px;">' +
        '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:' + roleColor + ';color:#fff;">' + roleName + '</span>' +
        '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:var(--bg);color:var(--text-tertiary);border:1px solid var(--border);">' + posLabel + '</span>' +
        (p.marker ? '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;">标记</span>' : '') +
        '</div>' +
        '</div>' +
        '<div style="display:flex;gap:5px;flex-shrink:0;margin-left:8px;align-items:center;">' +
        '<span class="preset-prompt-toggle" data-idx="' + i + '" style="font-size:10px;padding:2px 7px;background:' + (isEnabled ? 'var(--success)' : 'transparent') + ';color:' + (isEnabled ? '#fff' : 'var(--success)') + ';border:1px solid var(--success);border-radius:6px;cursor:pointer;white-space:nowrap;">' + (isEnabled ? '已启用' : '已关闭') + '</span>' +
        '</div>' +
        '</div>' +
        '</div>';
    }

    var html = '';

    if (groupOrder.length > 0) {
        // 【修复】有分组信息时，按分组渲染（可折叠）
        // 先收集未分组的 prompt
        var grouped = {}; // group name -> [indices]
        var ungrouped = [];
        groupOrder.forEach(function(gn) { grouped[gn] = []; });

        prompts.forEach(function(p, i) {
            var gName = groupMap[p.identifier] || groupMap[p.name];
            if (gName && grouped[gName]) {
                grouped[gName].push(i);
                } else {
                ungrouped.push(i);
            }
        });

    // 渲染每个分组
    var groupColors = ['#8b5cf6','#10b981','#f59e0b','var(--danger)','#3b82f6','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16','#06b6d4','#a855f7'];
    var gIdx = 0;
    groupOrder.forEach(function(gn) {
        var members = grouped[gn];
        if (!members || members.length === 0) return;
        var gColor = groupColors[gIdx % groupColors.length];
        var gEnabled = members.filter(function(mi){ return prompts[mi].enabled !== false; }).length;
        var isCollapsed = false; // 默认展开

        html += '<div class="pearl-card" style="margin-bottom:8px;overflow:hidden;">' +
        '<div class="preset-group-header" data-group="' + escapeHtml(gn) + '" style="padding:10px 12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,' + gColor + '11,' + gColor + '08);border-bottom:1px solid var(--border);">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span style="font-size:13px;font-weight:600;color:' + gColor + ';">' + escapeHtml(gn) + '</span>' +
        '<span style="font-size:10px;color:var(--text-tertiary);">' + gEnabled + '/' + members.length + '</span>' +
        '</div>' +
        '<span style="font-size:10px;color:var(--text-tertiary);transition:transform 0.2s;" class="group-arrow">▼</span>' +
        '</div>' +
        '<div class="preset-group-body" style="padding:6px 8px;' + (isCollapsed ? 'display:none;' : '') + '">';

        members.forEach(function(mi) {
            html += renderPromptItem(prompts[mi], mi);
            });

        html += '</div></div>';
        gIdx++;
        });

    // 渲染未分组的 prompt
    if (ungrouped.length > 0) {
        html += '<div style="font-size:11px;color:var(--text-tertiary);padding:6px 0 4px;border-top:1px solid var(--border);margin-top:4px;">其他提示条 (' + ungrouped.length + ')</div>';
        ungrouped.forEach(function(i) {
            html += renderPromptItem(prompts[i], i);
            });
    }
    } else {
    // 无分组信息，平铺显示（保持原有行为）
    prompts.forEach(function(p, i) {
        html += renderPromptItem(p, i);
        });
    }

    container.innerHTML = html;

    // 【修复】分组折叠事件
    container.querySelectorAll('.preset-group-header').forEach(function(header) {
        header.addEventListener('click', function(e) {
            if (e.target.closest('[data-prompt-view]') || e.target.closest('.preset-prompt-toggle')) return;
            var body = header.nextElementSibling;
            var arrow = header.querySelector('.group-arrow');
            if (body.style.display === 'none') {
                body.style.display = '';
                arrow.style.transform = '';
                } else {
                body.style.display = 'none';
                arrow.style.transform = 'rotate(-90deg)';
            }
        });
    });

    // 事件委托
    const self = this;
    container.onclick = function(e) {
        // 点击内容区域查看详情
        var viewEl = e.target.closest('[data-prompt-view]');
        if (viewEl) {
            self._viewPromptContent(parseInt(viewEl.dataset.promptView));
            return;
        }
    // 点击开关按钮
    var toggleEl = e.target.closest('.preset-prompt-toggle');
    if (toggleEl) {
        self._togglePrompt(parseInt(toggleEl.dataset.idx));
        return;
    }
    };
    },

    // 切换单个提示条的启用状态
    _togglePrompt: function(promptIdx) {
        var preset = this.presets[this._detailPresetIdx];
        if (!preset || !preset.prompts || !preset.prompts[promptIdx]) return;

        var p = preset.prompts[promptIdx];
        p.enabled = p.enabled === false ? true : false;

        this.save();
        this._renderPromptList();
        this.renderPresetList();

        // 如果是当前加载的预设，重新应用提示词
        if (this._detailPresetIdx === this.currentPresetIndex) {
            this._applyPromptsToSystemPrompt(preset);
        }

        UI.toast(p.enabled !== false ? '已启用: ' + (p.name || p.identifier || '提示条') : '已关闭: ' + (p.name || p.identifier || '提示条'));
    },

    // 查看提示条完整内容
    _viewPromptContent: function(promptIdx) {
        var preset = this.presets[this._detailPresetIdx];
        if (!preset || !preset.prompts || !preset.prompts[promptIdx]) return;

        var p = preset.prompts[promptIdx];
        var posLabels = { 0: '角色前', 1: '角色后', 2: '示例前', 3: '示例后', 4: '深度注入', 5: '示例顶部', 6: '示例底部' };

        document.getElementById('promptContentTitle').textContent = p.name || p.identifier || ('提示条 #' + (promptIdx + 1));
        document.getElementById('promptContentMeta').innerHTML =
        '角色: ' + escapeHtml(p.role || 'system') +
        ' &nbsp;|&nbsp; 位置: ' + escapeHtml(posLabels[p.injection_position] || String(p.injection_position)) +
        ' &nbsp;|&nbsp; 深度: ' + (p.injection_depth != null ? p.injection_depth : 4) +
        ' &nbsp;|&nbsp; 排序: ' + (p.injection_order != null ? p.injection_order : 100) +
        ' &nbsp;|&nbsp; 状态: ' + (p.enabled !== false ? '已启用' : '已关闭');
        document.getElementById('promptContentText').textContent = p.content || '(空内容)';

        UI.showModal('promptContentModal');
        },

    // 渲染预设附带的正则脚本列表
    _renderPresetRegexList: function() {
        var container = document.getElementById('presetRegexList');
        var statsEl = document.getElementById('presetRegexStats');
        var preset = this.presets[this._detailPresetIdx];
        if (!container) return;

        if (!preset || !preset.regexScripts || preset.regexScripts.length === 0) {
            container.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:10px;">预设没有附带正则脚本</div>';
            if (statsEl) statsEl.textContent = '';
            return;
        }

        var regexes = preset.regexScripts;
        var enabledCount = 0;
        regexes.forEach(function(r) {
            if (r.disabled !== true && r.enabled !== false) enabledCount++;
            });

        if (statsEl) statsEl.textContent = enabledCount + '/' + regexes.length + ' 已启用';

        var html = '<div style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto;">';
        const self = this;
        regexes.forEach(function(r, idx) {
            var isEnabled = r.disabled !== true && r.enabled !== false;
            var placementLabels = self._getPlacementLabel(r.placement);
            var displayName = (r.scriptName || r.name || ('正则 #' + (idx + 1)));
            var desc = (r.findRegex || '').substring(0, 40);
            if (desc.length === 40) desc += '...';

            html += '<div style="display:flex;align-items:center;padding:6px 8px;background:var(--bg-tertiary);border-radius:6px;font-size:12px;' + (isEnabled ? '' : 'opacity:0.6;') + '">';
            html += '<div style="flex:1;min-width:0;">';
            html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">';
            html += '<span style="' + (isEnabled ? 'color:var(--accent);' : 'color:var(--text-tertiary);') + 'font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(displayName) + '</span>';
            if (isEnabled) {
                html += '<span style="background:var(--accent);color:#fff;font-size:10px;padding:1px 4px;border-radius:3px;">启用</span>';
                } else {
                html += '<span style="background:var(--bg-secondary);color:var(--text-tertiary);font-size:10px;padding:1px 4px;border-radius:3px;">禁用</span>';
            }
        html += '</div>';
        if (desc) {
            html += '<div style="color:var(--text-tertiary);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">/' + escapeHtml(desc) + '/</div>';
        }
    if (placementLabels) {
        html += '<div style="color:var(--text-tertiary);font-size:10px;margin-top:1px;">' + escapeHtml(placementLabels) + '</div>';
    }
    html += '</div></div>';
    });
    html += '</div>';
    container.innerHTML = html;
    },

    // 获取正则的 placement 标签
    _getPlacementLabel: function(placement) {
        if (!placement) return '';
        var labels = [];
        var p = Array.isArray(placement) ? placement : [placement];
        p.forEach(function(v) {
            if (v === 1 || v === 'MD_DISPLAY') labels.push('AI输出');
            if (v === 2 || v === 'USER_INPUT') labels.push('用户输入');
            if (v === 4 || v === 'WORLD_INFO') labels.push('世界信息');
            if (v === 5 || v === 'MACRO_COMMAND') labels.push('宏/命令');
            if (v === 6 || v === 'REASONING') labels.push('推理/COT');
            if (v === 3 || v === 'SLASH_COMMAND') labels.push('斜杠命令');
            });
        return labels.join(', ');
        },

    /**
    * 自动应用预设中的"使用指南"配置
    * 【重要】只处理需要手动配置的项目（不在预设JSON中的配置）
    * 预设JSON中已配置好的参数（如temperature、reasoning_effort等）不要动
    *
    * 需要手动配置的项目：
    * 1. 自动解析标签（前缀/后缀）- 酒馆设置界面配置
    * 2. 命中缓存设置 - API设置界面配置
    * 3. 提示词后处理 - API设置界面配置
    * 4. 附加参数 - API设置界面配置
    */
    _autoApplyPresetConfig: function(preset) {
        if (!preset || !preset.params) return;

        var params = preset.params;
        var manualConfigs = []; // 需要手动配置的项目
        var presetConfigs = []; // 预设已配置的项目（仅记录，不动）

        // === 1. 自动解析标签配置 ===
        // 【关键】这是需要用户在酒馆里手动配置的，不在预设JSON中
        // 检测预设中是否有思维链相关内容，如果有则提醒用户需要配置自动解析
        var hasThinkingContent = false;
        var thinkingTagType = null;

        if (preset.prompts && preset.prompts.length > 0) {
            for (var i = 0; i < preset.prompts.length; i++) {
                var content = preset.prompts[i].content || '';
                if (content.indexOf('<thinking>') !== -1 || content.indexOf('</thinking>') !== -1) {
                    hasThinkingContent = true;
                    thinkingTagType = '<thinking>';
                    break;
                }
            if (content.indexOf('ECoT') !== -1) {
                hasThinkingContent = true;
                thinkingTagType = 'ECoT';
                break;
            }
        if (content.indexOf('💭') !== -1) {
            hasThinkingContent = true;
            thinkingTagType = '💭';
            break;
        }
    }
    }

    if (hasThinkingContent) {
        // 【自动配置】自动解析标签 - 这是需要手动配置的
        if (thinkingTagType === '<thinking>') {
            gameState._cotPrefix = '<thinking>';
            gameState._cotSuffix = '</thinking>';
            manualConfigs.push('自动解析: 前缀<thinking> 后缀</thinking>（请在API设置中确认）');
            } else if (thinkingTagType === 'ECoT') {
            gameState._cotPrefix = '<ECoT>';
            gameState._cotSuffix = '</ECoT>';
            manualConfigs.push('自动解析: 前缀<ECoT> 后缀</ECoT>（请在API设置中确认）');
            } else if (thinkingTagType === '💭') {
            gameState._cotPrefix = '💭';
            gameState._cotSuffix = '💭';
            manualConfigs.push('自动解析: 前缀💭 后缀💭（请在API设置中确认）');
        }
    }

    // === 2. 记录预设已配置的参数（不动它们）===
    // 这些参数在预设JSON中已经配置好了，直接使用即可
    if (params.temperature !== undefined) {
        presetConfigs.push('temperature: ' + params.temperature);
    }
    if (params.reasoning_effort) {
        presetConfigs.push('reasoning_effort: ' + params.reasoning_effort);
    }
    if (params.show_thoughts !== undefined) {
        presetConfigs.push('show_thoughts: ' + params.show_thoughts);
    }
    if (params.use_sysprompt !== undefined) {
        presetConfigs.push('use_sysprompt: ' + params.use_sysprompt);
    }
    if (params.squash_system_messages !== undefined) {
        presetConfigs.push('squash_system_messages: ' + params.squash_system_messages);
    }
    if (params.tool_reasoning_mode) {
        presetConfigs.push('tool_reasoning_mode: ' + params.tool_reasoning_mode);
    }

    // === 3. 应用需要在消息构建中使用的参数 ===
    // 这些参数影响消息构建逻辑，需要在代码中使用
    if (params.use_sysprompt === false) {
        gameState._useSysprompt = false;
        } else {
        gameState._useSysprompt = true;
    }

    if (params.squash_system_messages === true) {
        gameState._squashSystemMessages = true;
        } else {
        gameState._squashSystemMessages = false;
    }

    // === 4. 输出配置日志 ===
    console.log('[预设导入] 「' + (preset.name || '未命名') + '」配置分析:');

    if (presetConfigs.length > 0) {
        console.log('  📋 预设已配置（直接使用）:');
        presetConfigs.forEach(function(c) {
            console.log('     • ' + c);
            });
    }

    if (manualConfigs.length > 0) {
        console.log('  ⚙️ 已自动配置（需手动确认）:');
        manualConfigs.forEach(function(c) {
            console.log('     • ' + c);
            });
        UI.toast('请检查 ' + manualConfigs.length + ' 项手动配置');
        } else {
        UI.toast('预设已配置完成，无需额外设置');
    }
    },

    // 【新增】加载 entryStates 预设版本快照（象牙塔/月读预设使用）
    _loadEntryStates: function(preset) {
        if (!preset || !preset.entryStates) return;
        var states = preset.entryStates;
        // entryStates 可能是数组（多版本）或对象（单版本）
        var versions = [];
        if (Array.isArray(states)) {
            states.forEach(function(s) {
                if (s && s.name) versions.push(s);
                });
            } else if (states && typeof states === 'object') {
            Object.keys(states).forEach(function(key) {
                if (states[key] && states[key].name) versions.push(states[key]);
                });
        }
        if (versions.length === 0) return;
        // 存储到预设对象中供 UI 使用
        preset._entryStateVersions = versions;
        preset._activeEntryState = versions[0].name;
        // 【修复P1-2】自动应用第一个版本的 enabled 状态到 prompts
        var firstVersion = versions[0];
        if (firstVersion.entries && Array.isArray(firstVersion.entries)) {
            firstVersion.entries.forEach(function(entry) {
                var prompt = (preset.prompts || []).find(function(p) {
                    return p.identifier === entry.identifier || p.name === entry.name;
                    });
                if (prompt) {
                    prompt.enabled = entry.enabled;
                }
            });
        console.log('[预设] 已应用默认版本快照「' + firstVersion.name + '」的启用状态');
    }
    console.log('[预设] 已加载 ' + versions.length + ' 个预设版本快照:', versions.map(function(v) { return v.name; }).join(', '));
    },

    // 【新增】切换 entryStates 预设版本
    switchEntryState: function(stateName) {
        var preset = this.presets[this.currentPresetIndex];
        if (!preset || !preset._entryStateVersions) return;
        var target = preset._entryStateVersions.find(function(v) { return v.name === stateName; });
        if (!target) return;
        preset._activeEntryState = stateName;
        // 应用该版本快照中的启用/禁用状态到 prompts
        if (target.entries && Array.isArray(target.entries)) {
            target.entries.forEach(function(entry) {
                var prompt = (preset.prompts || []).find(function(p) {
                    return p.identifier === entry.identifier || p.name === entry.name;
                    });
                if (prompt) {
                    prompt.enabled = entry.enabled;
                }
            });
        }
    // 重新应用提示词
    this._applyPromptsToSystemPrompt(preset);
    UI.toast('已切换预设版本: ' + stateName);
    },

    _applyPromptsToSystemPrompt: function(preset) {
        var basePrompt = '';
        try { basePrompt = buildSystemPrompt(); } catch(e) { basePrompt = (gameState && gameState.systemPrompt) || ''; }

        gameState.systemPrompt = basePrompt; // system prompt 只包含游戏基础规则

        if (!preset || !preset.prompts || preset.prompts.length === 0) {
            gameState._jailbreakPrompt = '';
            gameState._assistantPrompt = '';
            gameState._impersonationPrompt = '';
            gameState._namesBehavior = 0;
            gameState._depthPrompts = {};
            gameState._positionPrompts = {};
            gameState._afterChatPrompts = [];
            return;
        }

        // 【关键修复】在处理预设提示词之前，先注入全局宏变量
        injectPresetGlobalVars();

        var positionPrompts = {}; // depth -> [prompts]  (depth 0~5, 固定位置)
        var jailbreakPrompts = [];
        var assistantPrompts = [];
        var depthPrompts = {};    // depth -> [prompts]  (depth >= 6, 动态深度)
        var systemPromptParts = []; // system_prompt=true 的提示词，合并到主系统提示词

        var macroEnv = {
            user: gameState.playerName || '玩家',
            char: (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters[0] && gameState.worldSnapshot.characters[0].name) ? gameState.worldSnapshot.characters[0].name : '角色',
            original: gameState._lastOriginalContent || ''
            };

        // 【酒馆标准提示词分流】
        // 酒馆 injection_depth 含义:
        //   0 = 角色定义前 (BEFORE_CHAR)
        //   1 = 角色定义后 (AFTER_CHAR)
        //   2 = 示例消息前 (EM_TOP)
        //   3 = 示例消息后 (EM_BOTTOM)
        //   4 = 作者注释顶部 (AN_TOP)
        //   5 = 作者注释底部 (AN_BOTTOM)
        //   >= 6 = 聊天历史深度（从末尾往回数）
        // 酒馆 injection_position 含义:
        //   0 = RELATIVE (从聊天底部往上数)
        //   1 = ABSOLUTE (从聊天顶部往下数)
        preset.prompts.forEach(function(p) {
            if (p.enabled === false) return;

            // 【酒馆兼容】marker=true 的提示词是位置标记，不产生内容
            if (p.marker === true) return;

            if (!p.content || !p.content.trim()) return;

            var injectionPosition = p.injection_position !== undefined ? p.injection_position : 0;
            var injectionDepth = p.injection_depth !== undefined ? p.injection_depth : 4;
            var role = p.role || 'system';

            // 越狱提示词
            if (p.identifier === 'jailbreak' || p.identifier === 'nsfw' || p.isJailbreak) {
                jailbreakPrompts.push(p);
                return;
            }
        // assistant 角色提示词
        if (role === 'assistant') {
            assistantPrompts.push(p);
            return;
        }

    // 【关键】system_prompt=true 的提示词合并到主系统提示词
    // 酒馆中 main prompt 等标记为 system_prompt=true 的提示词
    // 会被拼接到系统提示词中，具有最高权重
    if (p.system_prompt === true) {
        systemPromptParts.push(p);
        return;
    }

    // 按 injection_depth 分流到 positionPrompts 或 depthPrompts
    if (injectionDepth >= 0 && injectionDepth <= 5) {
        // depth 0-5: 固定位置（角色前/后、示例前/后、AN顶/底）
        if (!positionPrompts[injectionDepth]) positionPrompts[injectionDepth] = [];
        positionPrompts[injectionDepth].push(p);
        } else {
        // depth >= 6: 动态深度注入（从聊天历史末尾往回数）
        if (!depthPrompts[injectionDepth]) depthPrompts[injectionDepth] = [];
        depthPrompts[injectionDepth].push(p);
    }
    });

    // 【关键】将 system_prompt=true 的提示词合并到主系统提示词末尾
    if (systemPromptParts.length > 0) {
        systemPromptParts.sort(function(a, b) { return (a.injection_order || 100) - (b.injection_order || 100); });
        var spAppend = [];
        systemPromptParts.forEach(function(p) {
            var c = MacroEngine.process(p.content.trim(), macroEnv);
            if (c.trim()) spAppend.push(c);
            });
        if (spAppend.length > 0) {
            gameState.systemPrompt = gameState.systemPrompt + '\n\n' + spAppend.join('\n\n');
        }
    }

    // 排序
    Object.keys(positionPrompts).forEach(function(d) {
        positionPrompts[d].sort(function(a, b) { return (a.injection_order || 100) - (b.injection_order || 100); });
        });
    jailbreakPrompts.sort(function(a, b) { return (a.injection_order || 100) - (b.injection_order || 100); });
    Object.keys(depthPrompts).forEach(function(d) {
        depthPrompts[d].sort(function(a, b) { return (a.injection_order || 100) - (b.injection_order || 100); });
        });

    // 处理宏并存储
    var jbParts = [];
    jailbreakPrompts.forEach(function(p) {
        var c = MacroEngine.process(p.content.trim(), macroEnv);
        if (c.trim()) jbParts.push(c);
        });
    gameState._jailbreakPrompt = jbParts.join('\n\n');

    var asstParts = [];
    assistantPrompts.forEach(function(p) {
        var c = MacroEngine.process(p.content.trim(), macroEnv);
        if (c.trim()) asstParts.push(c);
        });
    gameState._assistantPrompt = asstParts.join('\n\n');

    // 合并世界书depth prompts和预设depth prompts
    Object.keys(depthPrompts).forEach(function(d) {
        if (!gameState._depthPrompts) gameState._depthPrompts = {};
        if (!gameState._depthPrompts[d]) gameState._depthPrompts[d] = [];
        depthPrompts[d].forEach(function(p) {
            var c = MacroEngine.process(p.content.trim(), macroEnv);
            if (c.trim()) {
                // 【酒馆兼容】injection_position: 0=RELATIVE(默认，从聊天底部往上数)
                //                                1=ABSOLUTE(从聊天顶部往下数)
                // game.js 的深度注入逻辑会按这个标志决定从哪一端开始数
                gameState._depthPrompts[d].push({
                    enabled: true,
                    content: c,
                    injection_position: (p.injection_position === 1) ? 1 : 0
                });
            }
        });
    });

    // 存储position prompts供sendAIRequest使用
    gameState._positionPrompts = {};
    Object.keys(positionPrompts).forEach(function(d) {
        gameState._positionPrompts[d] = [];
        positionPrompts[d].forEach(function(p) {
            var c = MacroEngine.process(p.content.trim(), macroEnv);
            if (c.trim()) {
                gameState._positionPrompts[d].push(c);
            }
        });
    });

    // 设置 impersonation_prompt
    if (preset.impersonation_prompt) {
        gameState._impersonationPrompt = MacroEngine.process(preset.impersonation_prompt, macroEnv);
        } else {
        gameState._impersonationPrompt = '';
    }

    // 设置 names_behavior
    gameState._namesBehavior = preset.names_behavior || 0;
    },
    _toggleAllPrompts: function() {
        var preset = this.presets[this._detailPresetIdx];
        if (!preset || !preset.prompts) return;

        // 判断当前是否全部启用
        var allEnabled = true;
        preset.prompts.forEach(function(p) { if (p.enabled === false) allEnabled = false; });

        // 切换到相反状态
        var newState = !allEnabled;
        preset.prompts.forEach(function(p) { p.enabled = newState; });

        this.save();
        this._renderPromptList();
        this.renderPresetList();

        // 如果是当前加载的预设，重新应用提示词
        if (this._detailPresetIdx === this.currentPresetIndex) {
            this._applyPromptsToSystemPrompt(preset);
        }

        UI.toast(newState ? '已全部开启' : '已全部关闭');
    },

    // 加载预设
    loadPreset: function(idx) {
        var preset = this.presets[idx];
        if (!preset) return;

        // 清理旧预设的扩展配置残留，防止切换后旧配置影响新预设
        gameState._theaterConfig = null;
        gameState._triggers = null;
        gameState._worldInfoConfig = null;
        gameState._characterConfig = null;
        gameState._themeConfig = null;
        gameState._customVariables = null;

        this.currentPresetIndex = idx;
        if (preset.params) {
            this.currentParams = Object.assign({}, preset.params);
            this.saveCurrentParams();
            this.syncParamsToUI();

            // 同步参数到 gameState（解决滑块更新但 gameState 未变的 bug）
            // syncParamsToUI() 只更新了 DOM，但没有自动更新 gameState
            if (typeof gameState !== 'undefined') {
                gameState.temperature = this.currentParams.temperature || 0.8;
                gameState.maxTokens = this.currentParams.max_tokens || 4096;
            }

        // 更新所有 slider 的显示值（触发 input 事件更新 Value 显示）
        // 注意：滑块的 input 事件只更新显示文字，不更新 currentParams
        // 所以这里直接设置显示文字，而不是依赖事件
        var sliderIdMap = {
            'presetTemp': this.currentParams.temperature,
            'presetTopP': this.currentParams.top_p,
            'presetTopK': this.currentParams.top_k,
            'presetFreqPen': this.currentParams.frequency_penalty,
            'presetPresPen': this.currentParams.presence_penalty
            };
        Object.keys(sliderIdMap).forEach(function(id) {
            var el = document.getElementById(id);
            var valEl = document.getElementById(id + 'Value');
            var val = sliderIdMap[id];
            if (el && val !== undefined) {
                el.value = val;
                if (valEl) valEl.textContent = val;
            }
        });

        // 同步 max_tokens
        var maxTokensEl = document.getElementById('presetMaxTokens');
        if (maxTokensEl) {
            maxTokensEl.value = this.currentParams.max_tokens || 4096;
        }

    // 同步 context length（如果有的话）
    var ctxLenEl = document.getElementById('presetContextLength');
    if (ctxLenEl && this.currentParams.max_context) {
        ctxLenEl.value = this.currentParams.max_context;
    }
    }

    // 应用提示词到 systemPrompt
    this._applyPromptsToSystemPrompt(preset);
    // 【增强】加载预设后，自动应用预设的行为控制参数
    if (preset.params) {
        gameState._useSysprompt = preset.params.use_sysprompt !== undefined ? preset.params.use_sysprompt : true;
        gameState._squashSystemMessages = preset.params.squash_system_messages || false;
        gameState._namesBehavior = preset.params.names_behavior || 0;
        // 【酒馆兼容】世界书/预设提示词合并顺序：true=世界书在前（默认），false=预设在世界书前
        // 酒馆标准参数名 world_info_position_first（部分预设可能用 prompt_world_info_first）
        var wiFirstVal = preset.params.world_info_position_first;
        if (wiFirstVal === undefined) wiFirstVal = preset.params.prompt_world_info_first;
        gameState._wiFirst = (wiFirstVal === false) ? false : true;
        console.log('[预设加载] 行为参数: use_sysprompt=' + gameState._useSysprompt + ', squash=' + gameState._squashSystemMessages + ', names=' + gameState._namesBehavior + ', wiFirst=' + gameState._wiFirst);
    }

    // 正则脚本已由 RegexManager.setPresetScripts() 处理（见下方）

    // 智能配置：自动读取使用须知并配置
    // 切换预设时自动跟着切换配置
    if (typeof SmartConfigEngine !== 'undefined') {
        SmartConfigEngine.loadFromPreset(preset);
    }

    // 自动应用预设中的基础配置
    // 预设JSON中已配置的参数（如use_sysprompt、squash_system_messages等）
    this._autoApplyPresetConfig(preset);

    // 切换预设时，自动切换预设绑定的正则脚本
    // 预设正则与全局正则分开存储，切换预设时自动切换
    // 优先使用已解析的 _parsedRegexScripts
    // 【修改】增加安全确认机制，仿酒馆 preset_allowed_regex
    // 首次加载含正则的预设时弹窗询问用户，确认后才应用正则
    var presetScripts = preset._parsedRegexScripts || preset.regexScripts;
    if (presetScripts && presetScripts.length > 0) {
        var presetNameForRegex = preset.name || '未命名预设';
        RegexManager.checkPresetRegexAllowed(presetNameForRegex, presetScripts.length).then(function(allowed) {
            if (allowed) {
                RegexManager.setPresetScripts(presetScripts, presetNameForRegex);
                console.log('[Preset] 已切换预设正则脚本:', presetScripts.length, '条');
                } else {
                // 用户拒绝，清空预设正则
                RegexManager.clearPresetScripts();
                UI.toast('已跳过预设「' + presetNameForRegex + '」的正则脚本');
                console.log('[Preset] 用户拒绝了预设正则脚本');
            }
        }).catch(function(err) {
        console.error('[Preset] 正则确认失败:', err);
        RegexManager.clearPresetScripts();
        });
    } else {
    RegexManager.clearPresetScripts();
    }

    // 加载酒馆助手脚本（兼容层）
    if (preset.tavernHelperScripts && preset.tavernHelperScripts.length > 0) {
        console.log('[Preset] 检测到酒馆助手脚本:', preset.tavernHelperScripts.length, '个');
        if (typeof TavernHelperCompat !== 'undefined') {
            TavernHelperCompat.loadScripts({ scripts: preset.tavernHelperScripts });
        }
    }

    // 加载SPreset配置（Quick Reply按钮等）
    if (preset.spresetConfig) {
        console.log('[Preset] 检测到 SPreset 配置');
        if (typeof TavernHelperCompat !== 'undefined') {
            TavernHelperCompat.parseQuickReplies(preset.spresetConfig);
            // 渲染Quick Reply按钮
            TavernHelperCompat.renderQuickReplyBar();
        }
    }

    // 【修复】从 spresetButtons 加载快捷回复（果实预设）
    if (preset.spresetButtons && preset.spresetButtons.length > 0) {
        console.log('[Preset] 检测到 SPreset 快捷回复按钮:', preset.spresetButtons.length, '个');
        if (typeof TavernHelperCompat !== 'undefined') {
            TavernHelperCompat.parseQuickReplies({ button: { buttons: preset.spresetButtons } });
            TavernHelperCompat.renderQuickReplyBar();
        }
    }

    // 如果没有SPreset配置，也检查是否有Quick Reply需要渲染
    if (!preset.spresetConfig && !preset.spresetButtons && typeof TavernHelperCompat !== 'undefined') {
        TavernHelperCompat.renderQuickReplyBar();
    }

    // 【深度融合】将预设的字数/段落配置同步到游戏设置UI
    if (preset.wordCountConfig) {
        _syncPresetWordCountToUI(preset.wordCountConfig);
    }

    // 【新增】应用更多预设功能
    // 应用小剧场配置
    if (preset.theaterConfig) {
        console.log('[Preset] 检测到小剧场配置');
        if (!gameState._theaterConfig) gameState._theaterConfig = {};
        Object.assign(gameState._theaterConfig, preset.theaterConfig);
    }

    // 应用自定义变量
    if (preset.customVariables) {
        console.log('[Preset] 检测到自定义变量:', Object.keys(preset.customVariables).length, '个');
        if (typeof MacroEngine !== 'undefined') {
            Object.keys(preset.customVariables).forEach(function(varName) {
                MacroEngine.setLocalVar(varName, preset.customVariables[varName]);
                });
        }
    }

    // 应用触发器配置
    if (preset.triggers && Array.isArray(preset.triggers)) {
        console.log('[Preset] 检测到触发器配置:', preset.triggers.length, '个');
        gameState._triggers = preset.triggers;
    }

    // 应用UI主题配置
    if (preset.themeConfig) {
        console.log('[Preset] 检测到主题配置');
        // 可以在这里应用主题样式
        if (preset.themeConfig.primaryColor) {
            document.documentElement.style.setProperty('--accent', preset.themeConfig.primaryColor);
        }
    if (preset.themeConfig.backgroundColor) {
        document.documentElement.style.setProperty('--bg', preset.themeConfig.backgroundColor);
    }
    }

    // 应用世界书配置
    if (preset.worldInfoConfig) {
        console.log('[Preset] 检测到世界书配置');
        gameState._worldInfoConfig = preset.worldInfoConfig;
    }

    // 应用角色卡配置
    if (preset.characterConfig) {
        console.log('[Preset] 检测到角色卡配置');
        gameState._characterConfig = preset.characterConfig;
    }

    this.renderPresetList();
    UI.toast('已加载预设: ' + preset.name);

    // 更新世界创建页面的预设显示
    this.updateSetupPresetDisplay();
    // 【新增】加载 entryStates 预设版本快照
    this._loadEntryStates(preset);

    // 加载后自动关闭弹窗，让用户看到更新后的预设名称
    UI.hideModal('presetManagerModal');
    },

    // 更新世界创建页面的预设显示
    updateSetupPresetDisplay: function() {
        var nameEl = document.getElementById('setupPresetName');
        var descEl = document.getElementById('setupPresetDesc');
        if (!nameEl || !descEl) return;

        if (this.currentPresetIndex >= 0 && this.presets[this.currentPresetIndex]) {
            var preset = this.presets[this.currentPresetIndex];
            nameEl.textContent = preset.name;
            var params = preset.params || {};
            var desc = [];
            if (params.temperature !== undefined) desc.push('Temp:' + params.temperature);
            if (params.top_p !== undefined) desc.push('TopP:' + params.top_p);
            if (preset.prompts && preset.prompts.length > 0) {
                var enabledCount = preset.prompts.filter(function(p) { return p.enabled !== false; }).length;
                desc.push('提示词:' + enabledCount);
            }
        descEl.textContent = desc.length > 0 ? desc.join(' | ') : '已加载';
        } else {
        nameEl.textContent = '默认预设';
        descEl.textContent = '点击选择或导入酒馆预设';
        }
    },

    // 删除预设
    deletePreset: async function(idx) {
        var ok = await UI.confirm('删除预设', '确定删除这个预设？');
        if (!ok) return;
        var deletedPreset = this.presets[idx];
        this.presets.splice(idx, 1);
        if (this.currentPresetIndex === idx) {
            this.currentPresetIndex = -1;
            // 删除当前预设时，清空预设正则
            RegexManager.clearPresetScripts();
            } else if (this.currentPresetIndex > idx) {
            this.currentPresetIndex--;
        }
    // 无论删哪个预设，如果它绑定了正则脚本，从全局正则中也删除
    if (deletedPreset && deletedPreset.regexScripts && deletedPreset.regexScripts.length > 0) {
        const self = this;
        deletedPreset.regexScripts.forEach(function(script) {
            RegexManager.removePresetScript(script.scriptName || script.name);
            });
        console.log('[Preset] 已删除预设绑定的正则脚本:', deletedPreset.regexScripts.length, '条');
    }
    this.save();
    this.renderPresetList();
    UI.toast('预设已删除');
    },

    // 清空全部预设
    clearAllPresets: async function() {
        var count = this.presets.length;
        if (count === 0) {
            UI.toast('没有可清空的预设');
            return;
        }
    var ok = await UI.confirm('清空全部预设', '确定清空所有 ' + count + ' 个预设？\n\n此操作不可恢复。');
    if (!ok) return;

    this.presets = [];
    this.currentPresetIndex = -1;
    // 清空预设正则
    RegexManager.clearPresetScripts();
    this.save();
    this.renderPresetList();
    UI.toast('已清空 ' + count + ' 个预设');
    },

    // 获取当前参数（用于API调用）
    getParams: function() {
        return Object.assign({}, this.currentParams);
        },

    // 导出预设为JSON文件（包含完整内容）
    exportPreset: function(index) {
        var preset = this.presets[index];
        if (!preset) return;

        // 构建完整的导出数据
        var exportData = {
            name: preset.name,
            // 采样参数
            temperature: preset.params.temperature,
            top_p: preset.params.top_p,
            top_k: preset.params.top_k,
            frequency_penalty: preset.params.frequency_penalty,
            presence_penalty: preset.params.presence_penalty,
            openai_max_tokens: preset.params.max_tokens,
            openai_max_context: preset.params.max_context,
            min_p: preset.params.min_p || 0,
            top_a: preset.params.top_a || 0,
            repetition_penalty: preset.params.repetition_penalty || 1,
            // 包含prompts数组
            prompts: preset.prompts || [],
            // 包含prompt_order（用于恢复启用状态）
            prompt_order: [{
                character_id: 100000,  // dummyId for global
                order: (preset.prompts || []).map(function(p) {
                    return {
                        identifier: p.identifier || '',
                        name: p.name || '',
                        enabled: p.enabled !== false
                        };
                    })
                }],
            // 包含extensions（正则脚本等）
            extensions: {}
            };

        // 包含正则脚本
        if (preset.regexScripts && preset.regexScripts.length > 0) {
            exportData.extensions.regex_scripts = preset.regexScripts.map(function(r) {
                return {
                    id: r.id || Date.now() + Math.random(),
                    scriptName: r.scriptName || r.name || '未命名正则',
                    findRegex: r.findRegex || r.findPattern || '',
                    replaceString: r.replaceString || '',
                    trimStrings: r.trimStrings || [],
                    placement: r._originalPlacement || (r.applyInput ? [1] : []).concat(r.applyOutput ? [2] : []),
                    disabled: r.disabled === true || r.enabled === false,
                    markdownOnly: !!r.markdownOnly,
                    promptOnly: !!r.promptOnly,
                    runOnEdit: !!r.runOnEdit,
                    // substituteRegex兼容布尔值和字符串格式
                    substituteRegex: (function() {
                        var sub = r.substituteRegex;
                        if (sub === true || sub === 'Raw') return 1;
                        if (sub === 'Escaped') return 2;
                        if (typeof sub === 'number' && sub > 0) return sub;
                        return 0;
                        })(),
                    minDepth: r.minDepth != null ? r.minDepth : null,
                    maxDepth: r.maxDepth != null ? r.maxDepth : null
                    };
                });
        }

        // 包含酒馆助手脚本
        if (preset.tavernHelperScripts && preset.tavernHelperScripts.length > 0) {
            exportData.extensions.tavern_helper = {
                scripts: preset.tavernHelperScripts
                };
        }

    // 包含SPreset配置
    if (preset.spresetConfig) {
        exportData.extensions.SPreset = preset.spresetConfig;
    }

    // 补充导出缺失字段
    exportData.wordCountConfig = preset.wordCountConfig || null;
    exportData.impersonation_prompt = preset.impersonation_prompt || '';
    exportData.continue_nudge_prompt = preset.continue_nudge_prompt || '';
    exportData.names_behavior = preset.names_behavior || 0;
    exportData.customVariables = preset.customVariables || null;
    exportData.triggers = preset.triggers || null;
    exportData.theaterConfig = preset.theaterConfig || null;
    exportData.worldInfoConfig = preset.worldInfoConfig || null;
    exportData.characterConfig = preset.characterConfig || null;
    exportData.themeConfig = preset.themeConfig || null;
    exportData.entryStates = preset.entryStates || null;

    var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (preset.name || 'preset') + '.json';
    a.click();
    TimerManager.setTimeout('revokePresetURL', function() { URL.revokeObjectURL(url); }, 1000);
    },

    // ========================================
    // 从 PresetEngine 合并的方法
    // ========================================

    // 构建基础游戏规则（原 PresetEngine._buildBaseGameRules）
    buildBaseGameRules: function() {
        var _wiResult = WorldInfo.buildInjection(gameState.conversationHistory || []);
        var _wiText = (typeof _wiResult === 'object' && _wiResult !== null) ? (_wiResult.text || '') : (_wiResult || '');

        gameState._wiPositionTexts = (typeof _wiResult === 'object' && _wiResult !== null && _wiResult.positionTexts) ? _wiResult.positionTexts : null;

        var _memoryText = '';
        if (typeof EnhancedMemory !== 'undefined') {
            _memoryText = EnhancedMemory.buildSmartInjection();
        }

        var _safeUserPrompt = typeof _sanitizePromptInput === 'function' ? _sanitizePromptInput(gameState.userPrompt) : (gameState.userPrompt || '');
        var _safeCustomStyle = typeof _sanitizePromptInput === 'function' ? _sanitizePromptInput(gameState.customStyle) : (gameState.customStyle || '');

        return '你是一个高自由度的文字游戏AI引擎。\n玩家想玩的游戏： "' + _safeUserPrompt + '"\n' +
        (_safeCustomStyle ? '【写作风格】\n' + _safeCustomStyle + '\n' : '') +
        buildProtagonistPrompt() +
        (_memoryText ? '【剧情记忆】\n' + _memoryText + '\n' : '') +
        '【核心规则】\n1. 根据玩家描述创造沉浸式游戏世界\n2. 每次回复必须是一个完整的JSON对象，不要包裹在代码块中\n3. 剧情要有画面感和代入感，像沉浸式小说段落，由预设控制字数（通过{{getglobalvar::字数总要求}}获取）\n4. 选项数量由预设控制，不强制要求固定数量\n5. 根据世界观在world中创造性设计信息模块\n6. 【极其重要】所有输出必须是纯中文！story、choices、player、characters、world等所有字段的值都必须用中文书写，绝对禁止出现英文！\n7. 【选项视角规则 - 极其重要】choices数组中每个选项必须是【主角(玩家)接下来可以做的事情】，绝对不能写成NPC接下来会做什么！必须从玩家操控的主角视角出发，描述主角下一步可以采取的行动、对话、决定、反应。例如：✓「我走向她问道…」「我拿起桌上的剑…」「我转身离开」 ✗「她走向我…」「他拿起剑…」\n\n【心声系统规则 - 极其重要】\n1. 每次回复在正文情绪峰值处插入次数由预设控制单独成段的 <giggle>角色名称：心声内容</giggle> 包裹的第一人称独白（<200字/去翻译化），从未来视角（比如和主角在一起后）看待在当前时刻自己的表现，可以是诙谐的、幽默的、怀旧的\n2. 心声格式：<giggle>角色名称：心声内容</giggle>，使用HTML标签包裹，单独成段\n3. 心声是NPC角色的内心独白，严守全知盲区，仅能基于主角的对话/动作产生反应，绝对禁止窥探或回应主角未出口的心理活动\n4. 禁止写主角角度的心声，仅限非主角角色\n5. 心声要自然融入正文节奏，在情绪转折、关键抉择、暧昧时刻等峰值处插入\n6. 不同NPC心声风格必须差异化，体现各自性格\n9. 【NPC主动消息】npcMessages数组用于NPC主动给玩家发消息（类似微信私聊）。根据NPC性格决定是否发消息：黏人型NPC可能每回合都发，冷漠型可能几回合才发一次。没有NPC要发消息时就输出空数组[]。消息内容要符合NPC性格和当前剧情情境，字数由预设控制。【重要区分】npcMessages是即时聊天消息（日常闲聊、邀约、吐槽等短消息），不要把重要通知、正式信件、情绪爆发等内容放在这里，那些应该放在mail（邮箱）中。\n8. 章节结尾可使用[章节结束|章节标题]标记，如[章节结束|幸福之愿·无伤的相遇]\n\n【回复格式 - 纯JSON，不要用代码块包裹】\n{\n    "title": "当前章节标题，如\'新的开始\'、\'暗流涌动\'等，4-8个字",\n    "story": "剧情正文，用\\n换行。对话用「」包裹。由预设控制字数。心声标记数量由预设控制，格式：<giggle>NPC角色名：该NPC的内心想法</giggle>，单独成段。心声只能写NPC的，绝对不能写主角的！",\n    "hud": [{"label": "显示名", "value": "数值", "icon": "单字图标如\'生\'\'力\'\'智\'等，不要用emoji"}],\n    "choices": [{"id": "A", "text": "详细选项描述", "tag": "标签"}],\n    "player": { "name": "角色名", "age": "年龄", "identity": "身份", "personality": "性格特点", "title": "显示在卡片标题的称号", "stats": [{"label": "属性名", "value": "属性值"}] },\n    "characters": [{"name": "角色名", "title": "身份", "relation": "关系", "favorability": 50, "desc": "状态描述", "details": [{"key": "字段", "value": "值"}]}],\n    "world": [\n        {"type": "text", "title": "标题", "content": "内容"},\n        {"type": "list", "title": "标题", "items": ["条目"]},\n        {"type": "ranking", "title": "标题", "items": ["第一名"]},\n        {"type": "key_value", "title": "标题", "items": [{"key": "键", "value": "值"}]},\n        {"type": "cards", "title": "标题", "items": [{"icon": "单字图标如\'剑\'\'药\'\'书\'等，不要用emoji", "title": "子标题", "content": "内容"}]},\n        {"type": "comments", "title": "标题", "main": "主帖", "comments": [{"name": "评论者", "text": "内容"}]}\n    ],\n    "bag": [{"name": "物品名", "count": 1, "desc": "描述", "rarity": "普通", "usable": false, "effect": "使用效果描述", "equippable": false, "equipped": false, "slot": "weapon"}],\n    "quests": [{"title": "任务名", "type": "主线/支线/隐藏", "status": "进行中/已完成/失败", "progress": "2/5", "hint": "下一步提示"}],\n    "relationships": [{"from": "角色A", "to": "角色B", "type": "关系类型", "desc": "一句话描述"}],\n    "keyEvents": ["本回合发生的重要事件，只记真正关键的"],\n    "npcMessages": [{"from": "NPC名字", "text": "NPC主动发给玩家的消息内容"}],\n    "currency": 0,\n    "currencyName": "根据世界观设定货币名称（修仙世界用灵石，现代用元/余额，古代用银两等）",\n    "contextSummary": "用100-200字总结到目前为止所有剧情的关键信息"\n}\n\n【keyEvents规则 - 极其重要】\n1. 每回合检查是否发生了"重要事件"，有则写入keyEvents数组\n2. 什么算重要事件：关键约定、重大发现、关系转折、获得/失去重要物品、阵营变化、立下誓言、角色死亡、秘密揭露\n3. 每条用简短一句话描述，包含人物名和具体内容\n4. 日常对话、普通移动、无关紧要的小事不要写入\n5. 每回合0-3条，没有重要事件就写空数组 []\n6. 示例："苏婉儿与主角约定今晚在咖啡厅见面"、"发现李铁柱是卧底"、"获得传说级宝剑"\n\n【player规则 - 绝对核心，违反会导致游戏崩溃】\n1. player.name 必须严格等于主角名字，绝对禁止改名！\n2. player对象只能在根级别的player字段，绝对禁止把主角放进characters数组！\n3. 主角身份、性格等必须与玩家设定一致，禁止擅自修改！\n4. 如果玩家只提供了名字，其他字段可以根据世界观合理补全，但名字必须完全一致！\n\n【characters规则】\n1. 除了主角之外的NPC才放进characters数组\n2. 每个NPC必须有name、title、relation、favorability字段\n3. favorability是-100到100的整数，表示对主角的好感度\n4. relation用简短词描述，如"朋友"、"敌人"、"恋人"、"陌生人"等';
    },

};


var RegexManager = {
    scripts: [],  // 全局正则脚本（用户自己添加的）
    _editingId: null,
    _presetScripts: [],  // 当前预设的正则脚本（随预设切换）
    _currentView: 'groups',  // 'groups' 或 'detail'
    _detailGroupType: null,  // 'global' 或 'preset'
    _detailGroupIdx: null,  // 预设索引（仅 preset 类型时使用）
    // 预设正则允许列表（仿酒馆 preset_allowed_regex 安全机制）
    // 参考：SillyTavern extension_settings.preset_allowed_regex
    // 存储格式：{ "预设名": true } — 记录用户已允许使用正则的预设
    // 首次加载含正则的预设时弹窗确认，确认后记录在此，后续不再弹窗
    _presetAllowedRegex: {},

    // 初始化
    init: function() {
        this.load();
        this._loadAllowedList();
        this.bindEvents();
        },

    // 加载预设正则允许列表
    _loadAllowedList: function() {
        try {
            var data = JSON.parse(localStorage.getItem('freeScript_presetAllowedRegex') || '{}');
            this._presetAllowedRegex = data;
            } catch(e) {
                console.error('[RegexManager] 读取presetAllowedRegex失败:', e);
                this._presetAllowedRegex = {};
            }
        },

    // 保存预设正则允许列表
    _saveAllowedList: function() {
        try {
            safeSetItem('freeScript_presetAllowedRegex', JSON.stringify(this._presetAllowedRegex));
            } catch(e) {
                console.warn('[RegexManager] 保存允许列表失败:', e);
            }
        },

    // 检查预设正则是否已被允许
    // 返回 Promise<boolean>，如果未被允许则弹窗询问用户
    checkPresetRegexAllowed: function(presetName, regexCount) {
        const self = this;
        // 如果已经允许过，直接通过
        if (self._presetAllowedRegex[presetName]) {
            return Promise.resolve(true);
        }
        // 首次加载，弹窗确认
        return UI.confirm(
        '预设正则脚本',
        '预设「' + presetName + '」包含 ' + regexCount + ' 个正则脚本。\n\n' +
        '这些正则会自动处理你的输入和AI的输出（如格式化、过滤等）。\n' +
        '是否允许使用这些正则脚本？\n\n' +
        '（确认后将记住你的选择，下次不再询问）'
        ).then(function(ok) {
            if (ok) {
                self._presetAllowedRegex[presetName] = true;
                self._saveAllowedList();
            }
        return ok;
        });
    },

    // 设置当前预设的正则脚本（切换预设时调用）
    // 【修改】增加 allowed 检查，仿酒馆的安全机制
    setPresetScripts: function(scripts, presetName) {
        this._presetScripts = scripts || [];
        console.log('[RegexManager] 已切换预设正则脚本:', this._presetScripts.length, '条');
        },

    // 清空预设正则脚本（不使用预设时调用）
    clearPresetScripts: function() {
        this._presetScripts = [];
        },

    // 从预设正则中移除指定脚本（删除预设时调用）
    removePresetScript: function(scriptName) {
        if (!scriptName) return;
        this._presetScripts = this._presetScripts.filter(function(s) {
            return (s.scriptName || s.name) !== scriptName;
            });
        },

    // 获取所有生效的正则脚本（全局 + 当前预设）
    getAllScripts: function() {
        // 合并全局正则和预设正则，预设正则在后（优先级更高）
        return this.scripts.concat(this._presetScripts);
        },

    // 从localStorage加载
    load: function() {
        try {
            var data = JSON.parse(localStorage.getItem('freeScript_regexScripts') || '[]');
            this.scripts = Array.isArray(data) ? data : [];
            } catch(e) {
                console.error('[RegexManager] 读取regexScripts失败:', e);
                this.scripts = [];
            }
        },

    // 保存到localStorage
    save: function() {
        safeSetItem('freeScript_regexScripts', JSON.stringify(this.scripts));
        },

    // 绑定事件
    bindEvents: function() {
        if (this._eventsBound) return;
        this._eventsBound = true;
        const self = this;

        // 返回按钮（从详情返回分组列表）
        var backBtn = document.getElementById('btnRegexBack');
        if (backBtn) {
            backBtn.addEventListener('click', function() {
                self.showGroupView();
                });
        }

        // 返回预设管理按钮
        var returnToPresetBtn = document.getElementById('btnRegexReturnToPreset');
        if (returnToPresetBtn) {
            returnToPresetBtn.addEventListener('click', function() {
                UI.hideModal('regexManagerModal');
                TimerManager.setTimeout('showPresetModal', function() { UI.showModal('presetManagerModal'); }, 100);
                });
        }

    // 从预设管理进入正则管理
    var openBtn = document.getElementById('btnOpenRegexManager');
    if (openBtn) {
        openBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            UI.hideModal('presetManagerModal');
            TimerManager.setTimeout('showRegexModal', function() { self.showModal(); }, 100);
            });
    }

    // 导入按钮
    var importBtn = document.getElementById('btnRegexImport');
    var fileInput = document.getElementById('regexFileInput');
    if (importBtn && fileInput) {
        importBtn.addEventListener('click', function() { fileInput.click(); });
        fileInput.addEventListener('change', function(e) {
            if (e.target.files[0]) self.importFromFile(e.target.files[0]);
            fileInput.value = '';
            });
    }

    // 新建按钮
    var addBtn = document.getElementById('btnRegexAdd');
    if (addBtn) {
        addBtn.addEventListener('click', function() {
            self._editingId = null;
            document.getElementById('regexEditTitle').textContent = '新建正则';
            document.getElementById('regexScriptName').value = '';
            document.getElementById('regexFindPattern').value = '';
            document.getElementById('regexReplaceString').value = '';
            document.getElementById('regexApplyInput').checked = true;
            document.getElementById('regexApplyOutput').checked = true;
            document.getElementById('regexEnabled').checked = true;
            UI.showModal('regexEditModal');
            });
    }

    // 导出按钮
    var regexExportBtn = document.getElementById('btnRegexExport');
    if (regexExportBtn) {
        regexExportBtn.addEventListener('click', function() {
            RegexManager.exportScripts();
            });
    }

    // 清空按钮
    var clearBtn = document.getElementById('btnRegexClear');
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            self.clearAllScripts();
            });
    }

    // 保存按钮
    var saveBtn = document.getElementById('btnRegexSave');
    if (saveBtn) {
        saveBtn.addEventListener('click', function() { self.saveScript(); });
    }

    // 删除按钮
    var deleteBtn = document.getElementById('btnRegexDelete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function() { self.deleteScript(); });
    }
    },

    // 显示模态框
    showModal: function() {
        this.showGroupView();
        UI.showModal('regexManagerModal');
        },

    // 渲染脚本列表
    // ===== 视图切换 =====

    // 显示分组列表视图（第一级）
    showGroupView: function() {
        this._currentView = 'groups';
        this._detailGroupType = null;
        this._detailGroupIdx = null;

        document.getElementById('regexGroupView').style.display = '';
        document.getElementById('regexDetailView').style.display = 'none';
        document.getElementById('btnRegexBack').style.display = 'none';
        document.getElementById('regexModalTitle').textContent = '正则脚本';
        // 恢复工具栏按钮显示
        document.getElementById('btnRegexImport').style.display = '';
        document.getElementById('btnRegexAdd').style.display = '';
        document.getElementById('btnRegexExport').style.display = '';
        document.getElementById('btnRegexClear').style.display = '';

        this.renderGroupList();
        },

    // 显示分组详情视图（第二级）
    showDetailView: function(groupType, groupIdx) {
        this._currentView = 'detail';
        this._detailGroupType = groupType;
        this._detailGroupIdx = groupIdx;

        document.getElementById('regexGroupView').style.display = 'none';
        document.getElementById('regexDetailView').style.display = '';
        document.getElementById('btnRegexBack').style.display = '';
        // 隐藏导入/新建按钮（在详情视图中不需要）
        document.getElementById('btnRegexImport').style.display = 'none';
        document.getElementById('btnRegexAdd').style.display = 'none';
        document.getElementById('btnRegexExport').style.display = 'none';
        document.getElementById('btnRegexClear').style.display = '';

        // 设置标题
        var title = groupType === 'global' ? '全局正则' : '预设正则';
        if (groupType === 'preset' && groupIdx != null) {
            var preset = PresetManager.presets[groupIdx];
            if (preset) title = preset.name + ' - 正则';
        }
        document.getElementById('regexModalTitle').textContent = title;
        document.getElementById('regexDetailTitle').textContent = title;

        // 绑定"全部开启/关闭"按钮
        var toggleAll = document.getElementById('regexToggleAll');
        if (toggleAll) {
            toggleAll.textContent = '全部开启';
            toggleAll.onclick = function() {
                if (toggleAll.textContent === '全部开启') {
                    self._setAllInGroup(true);
                    toggleAll.textContent = '全部关闭';
                    } else {
                    self._setAllInGroup(false);
                    toggleAll.textContent = '全部开启';
                }
};
}
const self = this;
this.renderDetailList();
},

// 设置当前分组内所有正则的启用状态
_setAllInGroup: function(enabled) {
    var scripts = this._getCurrentGroupScripts();
    scripts.forEach(function(s) { s.enabled = enabled; });
    if (this._detailGroupType === 'global') {
        this.save();
    }
this.renderDetailList();
this.renderGroupList();
},

// 获取当前分组的正则脚本数组
_getCurrentGroupScripts: function() {
    if (this._detailGroupType === 'global') {
        return this.scripts;
    } else if (this._detailGroupType === 'preset' && this._detailGroupIdx != null) {
    var preset = PresetManager.presets[this._detailGroupIdx];
    return (preset && preset.regexScripts) ? preset.regexScripts : [];
}
return [];
},

// ===== 渲染分组列表（第一级） =====
renderGroupList: function() {
    var container = document.getElementById('regexGroupList');
    if (!container) return;

    const self = this;
    var groups = [];

    // 全局正则分组
    var globalEnabled = 0;
    this.scripts.forEach(function(s) { if (s.enabled !== false) globalEnabled++; });
    groups.push({
        type: 'global',
        name: '全局正则',
        count: this.scripts.length,
        enabledCount: globalEnabled,
        desc: '用户手动添加的正则脚本'
    });

// 各预设的正则分组
if (PresetManager && PresetManager.presets) {
    PresetManager.presets.forEach(function(preset, idx) {
        if (preset.regexScripts && preset.regexScripts.length > 0) {
            var enabled = 0;
            preset.regexScripts.forEach(function(s) { if (s.disabled !== true && s.enabled !== false) enabled++; });
            var isActive = idx === PresetManager.currentPresetIndex;
            groups.push({
                type: 'preset',
                idx: idx,
                name: preset.name + ' - 正则',
                count: preset.regexScripts.length,
                enabledCount: enabled,
                desc: '预设附带的正则脚本' + (isActive ? '（当前使用中）' : '')
            });
    }
});
}

if (groups.length === 0 || (groups.length === 1 && groups[0].count === 0)) {
    container.innerHTML = '<div class="wi-empty"><div>暂无正则脚本</div><div style="font-size:11px;margin-top:4px;">点击「导入」或「新建」来管理正则脚本</div></div>';
    return;
}

var html = '';
groups.forEach(function(g) {
    if (g.count === 0) return;
    var isActive = g.type === 'preset' && g.idx === PresetManager.currentPresetIndex;
    var tags = [];
    tags.push('<span style="background:var(--accent);color:#fff;">' + g.enabledCount + '/' + g.count + ' 启用</span>');
    if (isActive) tags.push('<span style="background:var(--success);color:#fff;">使用中</span>');

    var tagsHtml = tags.length > 0
    ? '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px;">' + tags.map(function(t) { return '<span style="font-size:9px;padding:1px 5px;border-radius:3px;">' + t + '</span>'; }).join('') + '</div>'
    : '';

    html += '<div class="pearl-card" style="padding:10px;margin-bottom:10px;cursor:pointer;border:' + (isActive ? '2px solid var(--success)' : 'none') + ';" data-regex-group="' + g.type + '" data-regex-group-idx="' + (g.idx != null ? g.idx : '') + '">' +
    '<div style="display:flex;justify-content:space-between;align-items:start;">' +
    '<div style="flex:1;min-width:0;" data-regex-group-open="' + g.type + '" data-regex-group-open-idx="' + (g.idx != null ? g.idx : '') + '">' +
    '<div style="font-size:13px;font-weight:600;">' + escapeHtml(g.name) + (isActive ? ' ✓' : '') + '</div>' +
    '<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">' + escapeHtml(g.desc) + '</div>' +
    tagsHtml +
    '</div>' +
    '<div style="display:flex;gap:6px;flex-shrink:0;margin-left:8px;align-items:center;">' +
    '<span class="regex-group-open-btn" data-type="' + g.type + '" data-idx="' + (g.idx != null ? g.idx : '') + '" style="font-size:11px;padding:3px 8px;background:transparent;color:var(--accent);border:1px solid var(--accent);border-radius:6px;cursor:pointer;white-space:nowrap;" title="查看条目">详情</span>' +
    '</div>' +
    '</div>' +
    '</div>';
});

container.innerHTML = html;

// 事件委托
container.onclick = function(e) {
    var openBtn = e.target.closest('[data-regex-group-open]');
    if (openBtn) {
        e.stopPropagation();
        var type = openBtn.dataset.regexGroupOpen;
        var idx = openBtn.dataset.regexGroupOpenIdx;
        self.showDetailView(type, idx !== '' ? parseInt(idx) : null);
        return;
    }
var card = e.target.closest('[data-regex-group]');
if (card) {
    var type = card.dataset.regexGroup;
    var idx = card.dataset.regexGroupIdx;
    self.showDetailView(type, idx !== '' ? parseInt(idx) : null);
}
};
},

// ===== 渲染分组内条目列表（第二级） =====
renderDetailList: function() {
    var container = document.getElementById('regexDetailList');
    var statsEl = document.getElementById('regexDetailStats');
    if (!container) return;

    var scripts = this._getCurrentGroupScripts();
    if (scripts.length === 0) {
        container.innerHTML = '<div class="wi-empty">该分组没有正则脚本</div>';
        if (statsEl) statsEl.textContent = '';
        return;
    }

var enabledCount = 0;
scripts.forEach(function(s) {
    if (s.enabled !== false && s.disabled !== true) enabledCount++;
});
if (statsEl) statsEl.textContent = enabledCount + '/' + scripts.length + ' 已启用';

var html = '';
const self = this;
scripts.forEach(function(script, idx) {
    var isEnabled = script.enabled !== false && script.disabled !== true;
    var placementText = [];
    if (script.applyInput) placementText.push('输入');
    if (script.applyOutput) placementText.push('输出');
    var placementStr = placementText.join('+') || '未应用';

    var tags = [];
    tags.push('<span style="background:var(--bg);color:var(--text-tertiary);border:1px solid var(--border);">' + placementStr + '</span>');
    if (script.markdownOnly) tags.push('<span style="background:#8b5cf6;color:#fff;">仅MD</span>');
    if (script.promptOnly) tags.push('<span style="background:#6366f1;color:#fff;">仅Prompt</span>');
    if (script.runOnEdit) tags.push('<span style="background:#f59e0b;color:#fff;">编辑时</span>');

    var tagsHtml = '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px;">' + tags.map(function(t) { return '<span style="font-size:9px;padding:1px 5px;border-radius:3px;">' + t + '</span>'; }).join('') + '</div>';

    var displayName = script.name || script.scriptName || '未命名';

    html += '<div class="pearl-card" style="padding:8px 10px;opacity:' + (isEnabled ? '1' : '0.5') + ';border-left:3px solid ' + (isEnabled ? 'var(--success)' : 'var(--danger)') + ';">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
    '<div style="flex:1;min-width:0;cursor:pointer;" data-regex-edit="' + idx + '">' +
    '<div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(displayName) + '</div>' +
    tagsHtml +
    '</div>' +
    '<div style="display:flex;gap:5px;flex-shrink:0;margin-left:8px;align-items:center;">' +
    '<span class="regex-enable-btn" data-regex-enable="' + idx + '" style="font-size:10px;padding:2px 7px;background:' + (isEnabled ? 'var(--success)' : 'transparent') + ';color:' + (isEnabled ? '#fff' : 'var(--success)') + ';border:1px solid var(--success);border-radius:6px;cursor:pointer;white-space:nowrap;' + (isEnabled ? 'font-weight:500;' : '') + '">启用</span>' +
    '<span class="regex-disable-btn" data-regex-disable="' + idx + '" style="font-size:10px;padding:2px 7px;background:' + (!isEnabled ? 'var(--danger)' : 'transparent') + ';color:' + (!isEnabled ? '#fff' : 'var(--danger)') + ';border:1px solid var(--danger);border-radius:6px;cursor:pointer;white-space:nowrap;' + (!isEnabled ? 'font-weight:500;' : '') + '">禁用</span>' +
    '<span class="regex-delete-btn" data-regex-delete="' + idx + '" style="font-size:10px;padding:2px 7px;background:#fff;color:var(--danger);border:1px solid var(--danger);border-radius:6px;cursor:pointer;white-space:nowrap;">删除</span>' +
    '</div>' +
    '</div>' +
    '</div>';
});

container.innerHTML = html;

// 事件委托
container.onclick = function(e) {
    var enableEl = e.target.closest('[data-regex-enable]');
    if (enableEl) {
        e.stopPropagation();
        var i = parseInt(enableEl.dataset.regexEnable);
        self._toggleScriptInGroup(i, true);
        return;
    }
var disableEl = e.target.closest('[data-regex-disable]');
if (disableEl) {
    e.stopPropagation();
    var i = parseInt(disableEl.dataset.regexDisable);
    self._toggleScriptInGroup(i, false);
    return;
}
var deleteEl = e.target.closest('[data-regex-delete]');
if (deleteEl) {
    e.stopPropagation();
    self._deleteScriptInGroup(parseInt(deleteEl.dataset.regexDelete));
    return;
}
var editEl = e.target.closest('[data-regex-edit]');
if (editEl) {
    self.editScript(parseInt(editEl.dataset.regexEdit));
}
};
},

// 切换分组内某条正则的启用状态
_toggleScriptInGroup: function(idx, enabled) {
    var scripts = this._getCurrentGroupScripts();
    if (idx < 0 || idx >= scripts.length) return;
    if (this._detailGroupType === 'global') {
        scripts[idx].enabled = enabled;
        this.save();
    } else if (this._detailGroupType === 'preset') {
    // 预设正则：disabled=true 表示禁用
    scripts[idx].disabled = !enabled;
    scripts[idx].enabled = enabled;
    // 保存预设，确保持久化
    PresetManager.save();
}
this.renderDetailList();
this.renderGroupList();
},

// 删除分组内某条正则
_deleteScriptInGroup: function(idx) {
    const self = this;
    UI.confirm('删除正则', '确定删除这条正则脚本？').then(function(ok) {
        if (!ok) return;
        if (self._detailGroupType === 'global') {
            self.scripts.splice(idx, 1);
        } else if (self._detailGroupType === 'preset' && self._detailGroupIdx >= 0) {
        var preset = PresetManager.presets[self._detailGroupIdx];
        if (preset && preset.regexScripts) {
            preset.regexScripts.splice(idx, 1);
            PresetManager.save();
        }
}
self.save();
self.renderDetailList();
UI.toast('已删除');
}).catch(function(err) {
console.error('[RegexManager] 删除正则失败:', err);
});
},

// 旧方法兼容（保持向后兼容）
renderScriptList: function() {
    if (this._currentView === 'groups') {
        this.renderGroupList();
    } else {
    this.renderDetailList();
}
},

// 导入酒馆正则脚本
importFromFile: function(file) {
    const self = this;
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = JSON.parse(e.target.result);
            // 检测导入的是否是预设文件（包含预设特有字段）
            if (data.name && (data.description || data.character_book || data.world_info)) {
                UI.toast('这是预设文件，请前往「预设管理」页面导入');
                return;
            }
        var imported = self.parseRegexScripts(data);
        if (imported.length > 0) {
            self.scripts = self.scripts.concat(imported);
            if (self.scripts.length > 50) self.scripts = self.scripts.slice(0, 50);
            self.save();
            self.renderScriptList();
            UI.toast('成功导入 ' + imported.length + ' 个正则脚本');
        } else {
        UI.toast('未找到有效的正则脚本');
    }
} catch(err) {
UI.toast('导入失败: ' + translateError(err.message));
}
};
reader.readAsText(file);
},

// 解析酒馆正则格式
parseRegexScripts: function(data) {
    var scripts = [];
    const self = this;

    // 情况1: 直接是数组
    if (Array.isArray(data)) {
        data.forEach(function(item) {
            // 传入 isImport=true，导入的正则 placement 未定义时不自动应用
            var parsed = self.parseSingleRegex(item, true);
            if (parsed) scripts.push(parsed);
        });
}
// 情况2: 包含 regex_scripts 字段
else if (data.regex_scripts && Array.isArray(data.regex_scripts)) {
    data.regex_scripts.forEach(function(item) {
        // 传入 isImport=true
        var parsed = self.parseSingleRegex(item, true);
        if (parsed) scripts.push(parsed);
    });
}
// 情况3: 单个脚本对象
else if (data.findRegex || data.scriptName) {
    // 传入 isImport=true
    var parsed = self.parseSingleRegex(data, true);
    if (parsed) scripts.push(parsed);
}

return scripts;
},

// 解析单个正则脚本
parseSingleRegex: function(data, isImport) {
    if (!data) return null;

    // placement 默认行为：
    // 酒馆中 placement 为空数组 [] 表示不应用于任何位置
    // 如果 placement 未定义，需要区分是导入的还是新建的：
    // - 导入的正则：placement 未定义表示不自动应用（除非明确包含 1 或 2）
    // - 新建的正则（isImport=false）：默认应用输入和输出
    var applyInput = false;
    var applyOutput = false;
    var extraPlacements = []; // 保留不识别的 placement 值，导出时不丢失

    // 更明确的 placement 检查逻辑
    var hasExplicitPlacement = data.placement !== undefined && data.placement !== null;
    var isEmptyPlacement = Array.isArray(data.placement) && data.placement.length === 0;

    if (hasExplicitPlacement && !isEmptyPlacement) {
        // placement是数组
        if (Array.isArray(data.placement)) {
            applyInput = data.placement.includes(2);  // 2 = USER_INPUT (酒馆标准)
            applyOutput = data.placement.includes(1); // 1 = MD_DISPLAY (AI输出, 酒馆标准)
            // 保留额外 placement 值（3, 5, 6 等）
            data.placement.forEach(function(p) {
                if (p !== 1 && p !== 2) extraPlacements.push(p);
            });
    }
// placement是数字
else if (typeof data.placement === 'number') {
    applyInput = data.placement === 2;  // 2 = USER_INPUT
    applyOutput = data.placement === 1; // 1 = MD_DISPLAY (AI输出)
    if (data.placement !== 1 && data.placement !== 2) extraPlacements.push(data.placement);
}
}

// 【修复关键逻辑】
// 只有在没有明确 placement 且不是导入的情况下，才默认应用（兼容旧格式/新建正则）
// 从酒馆导入的正则，如果没有 placement 设置，应该不自动应用
else if (!hasExplicitPlacement && !isImport) {
    // 旧格式或新建的正则，默认应用
    applyInput = true;
    applyOutput = true;
}
// 如果是导入的但 placement 未定义，或 placement 为空数组，保持不应用（酒馆行为）

// trimStrings 格式转换：支持字符串（逗号分隔）或数组
function normalizeTrimStrings(val) {
    if (Array.isArray(val)) return val.filter(function(s) { return s && s.trim(); });
    if (typeof val === 'string' && val.trim()) {
        return val.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    }
return [];
}

return {
    id: data.id || Date.now() + Math.random(),
    name: data.scriptName || data.name || '导入的正则',
    findPattern: data.findRegex || data.find || '',
    replaceString: data.replaceString || data.replace || '',
    applyInput: applyInput,
    applyOutput: applyOutput,
    enabled: !data.disabled && data.enabled !== false,
    imported: true,
    trimStrings: normalizeTrimStrings(data.trimStrings),
    markdownOnly: !!data.markdownOnly,
    promptOnly: !!data.promptOnly,
    runOnEdit: !!data.runOnEdit,
    // substituteRegex兼容布尔值和字符串格式
    substituteRegex: (function() {
        var sub = data.substituteRegex;
        if (sub === true || sub === 'Raw') return 1;       // RAW
        if (sub === 'Escaped') return 2;                     // ESCAPED
        if (typeof sub === 'number' && sub > 0) return sub;  // 数字值直接使用
        return 0;                                           // NONE
    })(),
minDepth: data.minDepth != null ? data.minDepth : null,
maxDepth: data.maxDepth != null ? data.maxDepth : null,
_originalPlacement: Array.isArray(data.placement) ? data.placement.slice() : (typeof data.placement === 'number' ? [data.placement] : null) // 保留原始 placement 用于导出
};
},

// 编辑脚本
editScript: function(idx) {
    var script = this.scripts[idx];
    if (!script) return;

    this._editingId = script.id;
    document.getElementById('regexEditTitle').textContent = '编辑正则';
    document.getElementById('regexScriptName').value = script.name || '';
    document.getElementById('regexFindPattern').value = script.findPattern || '';
    document.getElementById('regexReplaceString').value = script.replaceString || '';
    document.getElementById('regexApplyInput').checked = !!script.applyInput;
    document.getElementById('regexApplyOutput').checked = !!script.applyOutput;
    document.getElementById('regexEnabled').checked = !!script.enabled;

    // 同步自定义checkbox
    var inputWrap = document.getElementById('regexApplyInputWrap');
    var outputWrap = document.getElementById('regexApplyOutputWrap');
    if (inputWrap) inputWrap.classList.toggle('checked', !!script.applyInput);
    if (outputWrap) outputWrap.classList.toggle('checked', !!script.applyOutput);

    // 同步高级设置
    var mdOnlyWrap = document.getElementById('regexMarkdownOnlyWrap');
    if (mdOnlyWrap) mdOnlyWrap.classList.toggle('checked', !!script.markdownOnly);
    var promptOnlyWrap = document.getElementById('regexPromptOnlyWrap');
    if (promptOnlyWrap) promptOnlyWrap.classList.toggle('checked', !!script.promptOnly);
    var runOnEditWrap = document.getElementById('regexRunOnEditWrap');
    if (runOnEditWrap) runOnEditWrap.classList.toggle('checked', !!script.runOnEdit);

    var minDepthEl = document.getElementById('regexMinDepth');
    if (minDepthEl) minDepthEl.value = (script.minDepth != null ? script.minDepth : '');
    var maxDepthEl = document.getElementById('regexMaxDepth');
    if (maxDepthEl) maxDepthEl.value = (script.maxDepth != null ? script.maxDepth : '');

    var subRegexEl = document.getElementById('regexSubstituteRegex');
    if (subRegexEl) subRegexEl.value = (script.substituteRegex != null ? script.substituteRegex : 0);

    var trimEl = document.getElementById('regexTrimStrings');
    if (trimEl) trimEl.value = (script.trimStrings && script.trimStrings.length > 0) ? script.trimStrings.join(', ') : '';

    UI.showModal('regexEditModal');
},

// 保存脚本
saveScript: function() {
    // 从自定义checkbox同步到隐藏checkbox
    var inputWrap = document.getElementById('regexApplyInputWrap');
    var outputWrap = document.getElementById('regexApplyOutputWrap');
    if (inputWrap) document.getElementById('regexApplyInput').checked = inputWrap.classList.contains('checked');
    if (outputWrap) document.getElementById('regexApplyOutput').checked = outputWrap.classList.contains('checked');

    var name = document.getElementById('regexScriptName').value.trim();
    var findPattern = document.getElementById('regexFindPattern').value.trim();
    var replaceString = document.getElementById('regexReplaceString').value;
    var applyInput = document.getElementById('regexApplyInput').checked;
    var applyOutput = document.getElementById('regexApplyOutput').checked;
    var enabled = document.getElementById('regexEnabled').checked;

    if (!name) {
        UI.toast('请输入脚本名称');
        return;
    }
if (!findPattern) {
    UI.toast('请输入查找正则');
    return;
}

// 读取高级设置
var mdOnlyWrap = document.getElementById('regexMarkdownOnlyWrap');
var promptOnlyWrap = document.getElementById('regexPromptOnlyWrap');
var runOnEditWrap = document.getElementById('regexRunOnEditWrap');
var minDepthEl = document.getElementById('regexMinDepth');
var maxDepthEl = document.getElementById('regexMaxDepth');
var subRegexEl = document.getElementById('regexSubstituteRegex');
var trimEl = document.getElementById('regexTrimStrings');

var minDepthVal = minDepthEl ? minDepthEl.value.trim() : '';
var maxDepthVal = maxDepthEl ? maxDepthEl.value.trim() : '';
var trimVal = trimEl ? trimEl.value.trim() : '';

var script = {
    id: this._editingId || Date.now(),
    name: name,
    findPattern: findPattern,
    replaceString: replaceString,
    applyInput: applyInput,
    applyOutput: applyOutput,
    enabled: enabled,
    imported: false,
    markdownOnly: mdOnlyWrap ? mdOnlyWrap.classList.contains('checked') : false,
    promptOnly: promptOnlyWrap ? promptOnlyWrap.classList.contains('checked') : false,
    runOnEdit: runOnEditWrap ? runOnEditWrap.classList.contains('checked') : false,
    minDepth: minDepthVal !== '' ? parseInt(minDepthVal) : null,
    maxDepth: maxDepthVal !== '' ? parseInt(maxDepthVal) : null,
    substituteRegex: subRegexEl ? parseInt(subRegexEl.value) : 0,
    trimStrings: trimVal !== '' ? trimVal.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [],
    // 保存时保留原始 _originalPlacement 中的额外 placement 值
    // 只更新 applyInput/applyOutput 对应的 1/2，保留其他值（如 5=WORLD_INFO）
    _originalPlacement: (function() {
        var existing = (this._editingId && this.scripts)
        ? (this.scripts.find(function(s) { return s.id === this._editingId; }) || {})._originalPlacement
        : null;
        var base = Array.isArray(existing) ? existing.filter(function(p) { return p !== 1 && p !== 2; }) : [];
        if (applyInput && base.indexOf(1) === -1) base.push(1);
        if (applyOutput && base.indexOf(2) === -1) base.push(2);
        return base;
    }).call(this)
};

if (this._editingId) {
    // 更新现有脚本
    for (var i = 0; i < this.scripts.length; i++) {
        if (this.scripts[i].id === this._editingId) {
            this.scripts[i] = script;
            break;
        }
}
} else {
// 新建脚本
this.scripts.push(script);
}

if (this.scripts.length > 50) this.scripts = this.scripts.slice(0, 50);
this.save();
UI.hideModal('regexEditModal');
this.renderScriptList();
UI.toast('正则脚本已保存');
},

// 切换正则启用/禁用
toggleScript: function(idx) {
    if (idx < 0 || idx >= this.scripts.length) return;
    this.scripts[idx].enabled = this.scripts[idx].enabled === false ? true : false;
    this.save();
    this.renderScriptList();
    UI.toast(this.scripts[idx].enabled ? '正则已启用' : '正则已禁用');
},

// 快速删除正则（从列表直接删除）
quickDeleteScript: async function(idx) {
    if (idx < 0 || idx >= this.scripts.length) return;
    var ok = await UI.confirm('删除正则', '确定删除「' + (this.scripts[idx].name || '未命名') + '」？');
    if (!ok) return;
    this.scripts.splice(idx, 1);
    this.save();
    this.renderScriptList();
    UI.toast('正则已删除');
},

// 删除脚本（编辑弹窗内）
deleteScript: async function() {
    if (!this._editingId) {
        UI.hideModal('regexEditModal');
        return;
    }
var ok = await UI.confirm('删除正则', '确定删除这个正则脚本？');
if (!ok) return;

this.scripts = this.scripts.filter(function(s) { return s.id !== RegexManager._editingId; });
this.save();
UI.hideModal('regexEditModal');
this.renderScriptList();
UI.toast('正则脚本已删除');
},

// 清空所有全局正则脚本（预设正则不受影响）
clearAllScripts: async function() {
    var count = this.scripts.length;
    if (count === 0) {
        UI.toast('没有可清空的全局正则脚本');
        return;
    }
var ok = await UI.confirm('清空全部正则', '确定清空所有 ' + count + ' 条全局正则脚本？\n\n注意：预设绑定的正则不受影响，切换预设时会自动恢复。');
if (!ok) return;

this.scripts = [];
this.save();
this.renderScriptList();
UI.toast('已清空 ' + count + ' 条全局正则脚本');
},

// ===== 执行引擎 =====

// placement常量定义（与SillyTavern一致）
// 酒馆标准: 1=MD显示(AI输出), 2=用户输入, 3=斜杠命令, 4=世界信息, 5=宏/命令, 6=推理
PLACEMENT: {
    MD_DISPLAY: 1,     // MD显示 - AI输出渲染后
    USER_INPUT: 2,     // 用户输入
    SLASH_COMMAND: 3,  // 斜杠命令
    WORLD_INFO: 4,     // 世界信息
    MACRO_COMMAND: 5,  // 宏/命令处理
    REASONING: 6       // 推理/COT
},

// 应用于文本
// placement: 'input'(用户输入), 'output'(AI输出), 'display'(仅显示), 'prompt'(仅prompt), 'worldInfo'(世界信息), 'reasoning'(推理)
apply: function(text, placement, messageIndex) {
    const self = this;
    var result = text;

    // 使用 getAllScripts() 获取全局正则 + 当前预设正则
    var allScripts = this.getAllScripts();
    allScripts.forEach(function(script) {
        if (!script.enabled) return;

        // 检查是否应该应用于当前位置
        // 构建 placement 集合（去重）
        var placements = [];
        if (script._originalPlacement) {
            script._originalPlacement.forEach(function(p) {
                if (placements.indexOf(p) === -1) placements.push(p);
            });
    }
if (script.applyInput && placements.indexOf(1) === -1) placements.push(1);  // USER_INPUT
if (script.applyOutput && placements.indexOf(2) === -1) placements.push(2); // AI_OUTPUT

var shouldApply = false;

// 根据 placement 参数检查是否应该应用
switch(placement) {
    case 'input':
    case 'user_input':
    shouldApply = placements.includes(1) || placements.includes('USER_INPUT');
    break;
    case 'output':
    case 'ai_output':
    shouldApply = placements.includes(2) || placements.includes('AI_OUTPUT');
    break;
    case 'worldInfo':
    case 'world_info':
    // 酒馆标准: 4 = WORLD_INFO
    shouldApply = placements.includes(4) || placements.includes('WORLD_INFO');
    break;
    case 'reasoning':
    // placement 5 = REASONING
    shouldApply = placements.includes(5) || placements.includes('REASONING');
    break;
    case 'display':
    // display模式：应用所有启用的脚本（除非明确排除）
    shouldApply = true;
    break;
    case 'prompt':
    // prompt模式：应用所有非display-only的脚本
    shouldApply = !script.markdownOnly;
    break;
    default:
    shouldApply = true;
}

if (!shouldApply) return;

// runOnEdit: 仅在编辑模式下应用，正常生成流程中跳过
if (script.runOnEdit && placement !== 'edit') return;

// markdownOnly: 仅在display模式下应用
if (script.markdownOnly && placement !== 'display') return;

// promptOnly: 在 input/output/prompt/worldInfo/reasoning 模式下应用
// 不在 display 模式下应用（除非 markdownOnly 也为 true）
if (script.promptOnly && placement === 'display' && !script.markdownOnly) return;

// 深度限制检查
if (messageIndex != null) {
    if (script.minDepth != null && script.minDepth > 0 && messageIndex < script.minDepth) return;
    if (script.maxDepth != null && script.maxDepth > 0 && messageIndex > script.maxDepth) return;
}

try {
    result = self.applySingleScript(result, script);
} catch(e) {
console.warn('Regex error in "' + (script.name || 'unnamed') + '":', e.message);
}
});

return result;
},

// 应用单个脚本
applySingleScript: function(text, script) {
    var pattern = script.findPattern;
    var replacement = script.replaceString || '';

    // 【修复9】处理 substituteRegex 字段
    // substituteRegex: 0=NONE, 1=RAW, 2=ESCAPED
    // 在应用正则之前，先处理 findPattern 和 replaceString 中的宏变量
    if (script.substituteRegex && script.substituteRegex > 0) {
        var subRegex = script.substituteRegex;
        // 获取宏环境变量
        var macroEnv = {
            user: gameState.playerName || '玩家',
            char: (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) ? gameState.worldSnapshot.characters[0].name : '角色',
            original: gameState._lastOriginalContent || ''
        };

    // 处理 findPattern 中的宏
    if (subRegex === 1) {
        // RAW: 直接替换
        pattern = MacroEngine.process(pattern, macroEnv);
    } else if (subRegex === 2) {
    // ESCAPED: 转义后再替换
    var escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern = MacroEngine.process(escaped, macroEnv);
}

// 处理 replaceString 中的宏
if (subRegex === 1) {
    replacement = MacroEngine.process(replacement, macroEnv);
} else if (subRegex === 2) {
var escapedReplacement = replacement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
replacement = MacroEngine.process(escapedReplacement, macroEnv);
}
}

// 解析正则标志（如 /pattern/gi）
var flags = 'g';
var regexBody = pattern;

// 检查是否是 /pattern/flags 格式
var match = pattern.match(/^\/(.+)\/([gimuy]*)$/);
if (match) {
    regexBody = match[1];
    flags = match[2] || 'g';
    if (!flags.includes('g')) flags += 'g';
}

// 创建正则对象
// ReDoS防护：检测危险的正则模式
var redosPatterns = [
    /\((\([^()]*\)|[^()]*)*\+/,  // 嵌套量词 (a+)+
    /\([^)]*\)\{[^}]*\}\{[^}]*\}/,  // 嵌套量词 (a){n}{m}
/(\.\*|\.\+)[\*\+\?]\*[\*\+\?]/,  // 连续量词 .*+*+
/\(\.\*\)\+/,  // (.*)+
/\(\.\+\)\+/,  // (.+)+
];
var isDangerous = false;
for (var ri = 0; ri < redosPatterns.length; ri++) {
    if (redosPatterns[ri].test(regexBody)) {
        isDangerous = true;
        break;
    }
}
if (isDangerous) {
    console.warn('[RegexManager] 检测到潜在ReDoS风险的正则，已跳过执行: ' + regexBody.substring(0, 50));
    return text;
}

var regex = new RegExp(regexBody, flags);

// 处理替换字符串中的特殊变量
// $1, $2... 捕获组（原生支持）
// {{match}} 替换为 $&（整个匹配）
replacement = replacement.replace(/{{match}}/g, '$&');

var result = text.replace(regex, replacement);

// trimStrings: 从匹配结果中裁剪指定字符串
if (script.trimStrings && script.trimStrings.length > 0) {
    script.trimStrings.forEach(function(trimStr) {
        if (trimStr) {
            result = result.split(trimStr).join('');
        }
});
}

return result;
},

// 快捷方法：应用于用户输入
applyToInput: function(text) {
    return this.apply(text, 'input');
},

// 快捷方法：应用于AI输出
applyToOutput: function(text) {
    return this.apply(text, 'output');
},

// 导出所有正则脚本为JSON文件
exportScripts: function() {
    var exportData = this.scripts.map(function(s) {
        var placement = [];
        if (s.applyOutput) placement.push(1);  // 1 = MD_DISPLAY (AI输出)
        if (s.applyInput) placement.push(2);   // 2 = USER_INPUT
        if (s._originalPlacement) {
            s._originalPlacement.forEach(function(p) {
                if (placement.indexOf(p) === -1) placement.push(p);
            });
    }
return {
    scriptName: s.name,
    findRegex: s.findPattern,
    replaceString: s.replaceString,
    trimStrings: s.trimStrings || [],
    placement: placement,
    disabled: !s.enabled,
    markdownOnly: s.markdownOnly || false,
    promptOnly: s.promptOnly || false,
    runOnEdit: s.runOnEdit || false,
    substituteRegex: s.substituteRegex || 0,
    minDepth: s.minDepth != null ? s.minDepth : 0,
    maxDepth: s.maxDepth != null ? s.maxDepth : 0
};
});
var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
var url = URL.createObjectURL(blob);
var a = document.createElement('a');
a.href = url;
a.download = 'regex_scripts.json';
a.click();
TimerManager.setTimeout('revokeRegexURL', function() { URL.revokeObjectURL(url); }, 1000);
}
};


var MacroEngine = {
    // 局部变量存储（当前游戏会话级别）
    _localVars: {},
    // 全局变量存储（跨会话持久化）
    _globalVars: {},

    init: function() {
        // 【优化】变量系统已迁移到 VariableStore
        // 保留此方法用于向后兼容
        if (typeof VariableStore !== 'undefined') {
            VariableStore.loadGlobal();
        }
    },

    saveLocalVars: function() {
        // 【优化】VariableStore 自动处理持久化
        },

    saveGlobalVars: function() {
        // 【优化】VariableStore 自动处理持久化
        if (typeof VariableStore !== 'undefined') VariableStore._persistGlobal();
        },

    // 重置局部变量（新游戏时调用）
    resetLocalVars: function() {
        if (typeof VariableStore !== 'undefined') VariableStore.clearLocal();
        },

    // 设置局部变量
    setLocalVar: function(name, value) {
        if (!name || typeof VariableStore === 'undefined') return '';
        VariableStore.setLocal(name.trim(), value);
        return '';
        },

    // 获取局部变量
    getLocalVar: function(name) {
        if (!name || typeof VariableStore === 'undefined') return '';
        var val = VariableStore.getLocal(name.trim(), '');
        // 自动类型转换：纯数字字符串转为数字
        if (typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val))) {
            return Number(val);
        }
        return val;
    },

    // 设置全局变量
    setGlobalVar: function(name, value) {
        if (!name || typeof VariableStore === 'undefined') return '';
        VariableStore.setGlobal(name.trim(), value);
        return '';
        },

    // 获取全局变量
    getGlobalVar: function(name) {
        if (!name || typeof VariableStore === 'undefined') return '';
        var val = VariableStore.getGlobal(name.trim(), '');
        if (typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val))) {
            return Number(val);
        }
        return val;
    },

    // 检查变量是否存在
    hasVar: function(name) {
        if (!name || typeof VariableStore === 'undefined') return 'false';
        return VariableStore.local.has(name.trim()) ? 'true' : 'false';
        },

    hasGlobalVar: function(name) {
        if (!name || typeof VariableStore === 'undefined') return 'false';
        return VariableStore.global.has(name.trim()) ? 'true' : 'false';
        },

    // 删除变量
    deleteVar: function(name) {
        if (!name || typeof VariableStore === 'undefined') return '';
        VariableStore.local.delete(name.trim());
        return '';
        },

    deleteGlobalVar: function(name) {
        if (!name || typeof VariableStore === 'undefined') return '';
        VariableStore.global.delete(name.trim());
        VariableStore._persistGlobal();
        return '';
        },

    // 增加变量值（数字相加或字符串拼接）
    addVar: function(name, value) {
        if (!name || typeof VariableStore === 'undefined') return '';
        name = name.trim();
        var current = VariableStore.getLocal(name, '');
        if (!current) {
            VariableStore.setLocal(name, String(value));
            } else {
            var numCurrent = Number(current);
            var numValue = Number(value);
            if (!isNaN(numCurrent) && !isNaN(numValue)) {
                VariableStore.setLocal(name, String(numCurrent + numValue));
                } else {
                VariableStore.setLocal(name, String(current) + String(value));
            }
        }
    return '';
    },

    // 变量递增
    incVar: function(name) {
        if (!name || typeof VariableStore === 'undefined') return '';
        name = name.trim();
        var current = Number(VariableStore.getLocal(name, '0')) || 0;
        VariableStore.setLocal(name, String(current + 1));
        return '';
        },

    // 变量递减
    decVar: function(name) {
        if (!name || typeof VariableStore === 'undefined') return '';
        name = name.trim();
        var current = Number(VariableStore.getLocal(name, '0')) || 0;
        VariableStore.setLocal(name, String(current - 1));
        return '';
        },

    // 生成 UUID
    uuid: function() {
        if (crypto && crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
            });
        },

    // 【小剧场融合】检测小剧场开关和内容
    getTheaterContent: function(theaterType) {
        // 检测各种小剧场变量
        var theaterVars = {
            // 月读预设 - 之愿系列
            '盲盒之愿': this.getLocalVar('盲盒之愿') || this.getLocalVar('blind_box'),
            '每日之愿': this.getLocalVar('每日之愿') || this.getLocalVar('daily'),
            '涩涩之愿': this.getLocalVar('涩涩之愿') || this.getLocalVar('nsfw_wish'),
            '游戏之愿': this.getLocalVar('游戏之愿') || this.getLocalVar('game_wish'),
            '群聊之愿': this.getLocalVar('群聊之愿') || this.getLocalVar('chat_wish'),
            '论坛之愿': this.getLocalVar('论坛之愿') || this.getLocalVar('forum_wish'),
            '幸福之愿': this.getLocalVar('幸福之愿') || this.getLocalVar('happy_wish'),
            '哀伤之愿': this.getLocalVar('哀伤之愿') || this.getLocalVar('sad_wish'),
            '档案之愿': this.getLocalVar('档案之愿') || this.getLocalVar('archive_wish'),
            '快递之愿': this.getLocalVar('快递之愿') || this.getLocalVar('delivery_wish'),
            '播客之愿': this.getLocalVar('播客之愿') || this.getLocalVar('podcast_wish'),
            '购物之愿': this.getLocalVar('购物之愿') || this.getLocalVar('shopping_wish'),
            '桌面之愿': this.getLocalVar('桌面之愿') || this.getLocalVar('desktop_wish'),
            '日程之愿': this.getLocalVar('日程之愿') || this.getLocalVar('schedule_wish'),
            '通知之愿': this.getLocalVar('通知之愿') || this.getLocalVar('notification_wish'),
            '报告之愿': this.getLocalVar('报告之愿') || this.getLocalVar('report_wish'),
            '问卷之愿': this.getLocalVar('问卷之愿') || this.getLocalVar('survey_wish'),

            // 果实预设
            '小剧场规范': this.getLocalVar('小剧场规范'),
            'snow': this.getLocalVar('snow'),
            'emoji_snow': this.getLocalVar('emoji_snow'),
            '论坛小剧场': this.getLocalVar('论坛小剧场'),
            '日常剧场': this.getLocalVar('日常剧场'),
            '后台人生': this.getLocalVar('后台人生'),

            // 蛾摩拉预设
            '小剧场': this.getLocalVar('小剧场'),
            '蛾摩拉': this.getLocalVar('蛾摩拉'), // 作者有话说
            '日程表': this.getLocalVar('日程表'),
            '小夜单人状态': this.getLocalVar('小夜单人状态'),

            // 通用
            '剧场COT': this.getLocalVar('剧场COT'),

            // 【新增】酒馆预设标签识别
            // <gossip> → 论坛
            'gossip': this.getLocalVar('gossip'),
            '八卦': this.getLocalVar('八卦'),
            '论坛': this.getLocalVar('论坛'),

            // <角色手机> → 手机功能
            '角色手机': this.getLocalVar('角色手机'),
            '手机': this.getLocalVar('手机'),
            'phone': this.getLocalVar('phone'),

            // <通用状态> / <古风状态> → 状态面板
            '通用状态': this.getLocalVar('通用状态'),
            '古风状态': this.getLocalVar('古风状态'),
            '状态面板': this.getLocalVar('状态面板'),
            'status': this.getLocalVar('status'),

            // <meow_FM> → 摘要
            'meow_FM': this.getLocalVar('meow_FM'),
            '摘要': this.getLocalVar('摘要'),
            'summary': this.getLocalVar('summary'),

            // <branches> → 选项分支
            'branches': this.getLocalVar('branches'),
            '选项分支': this.getLocalVar('选项分支'),
            '分支': this.getLocalVar('分支'),

            // <echo> → 物品
            'echo': this.getLocalVar('echo'),
            '物品': this.getLocalVar('物品'),
            'items': this.getLocalVar('items'),

            // <ccd> → 文字剧场
            'ccd': this.getLocalVar('ccd'),
            '文字剧场': this.getLocalVar('文字剧场'),
            '剧场': this.getLocalVar('剧场'),

            // 【新增】象牙塔预设 - 更多小剧场类型
            '恋爱之愿': this.getLocalVar('恋爱之愿'),
            '同人之愿': this.getLocalVar('同人之愿'),
            '回忆之愿': this.getLocalVar('回忆之愿'),
            '平行之愿': this.getLocalVar('平行之愿'),
            '美食之愿': this.getLocalVar('美食之愿'),
            '广告之愿': this.getLocalVar('广告之愿'),
            '文学之愿': this.getLocalVar('文学之愿'),
            '恋爱小剧场': this.getLocalVar('恋爱小剧场'),
            '涩涩小剧场': this.getLocalVar('涩涩小剧场'),
            '游戏小剧场': this.getLocalVar('游戏小剧场'),
            '恋爱之塔': this.getLocalVar('恋爱之塔'),
            '涩涩之塔': this.getLocalVar('涩涩之塔'),
            '游戏之塔': this.getLocalVar('游戏之塔'),
            '群聊之塔': this.getLocalVar('群聊之塔'),
            '论坛之塔': this.getLocalVar('论坛之塔'),
            '同人之塔': this.getLocalVar('同人之塔'),
            '八卦之塔': this.getLocalVar('八卦之塔'),
            '回忆之塔': this.getLocalVar('回忆之塔'),
            '平行之塔': this.getLocalVar('平行之塔'),
            '美食之塔': this.getLocalVar('美食之塔'),
            '广告之塔': this.getLocalVar('广告之塔'),
            '报告之塔': this.getLocalVar('报告之塔'),
            '每日之塔': this.getLocalVar('每日之塔'),
            '文学之塔': this.getLocalVar('文学之塔'),
            '哀伤之塔': this.getLocalVar('哀伤之塔'),
            '幸福之塔': this.getLocalVar('幸福之塔'),
            '盲盒之塔': this.getLocalVar('盲盒之塔'),
            'ice': this.getLocalVar('ice'),
            'live': this.getLocalVar('live'),
            'danmu': this.getLocalVar('danmu'),
            'enigma': this.getLocalVar('enigma'),
            'podcast': this.getLocalVar('podcast'),
            'table_Edit': this.getLocalVar('table_Edit'),
            'horae': this.getLocalVar('horae'),
            'horaeevent': this.getLocalVar('horaeevent'),
            '作者有话说': this.getLocalVar('作者有话说'),
            'author_note': this.getLocalVar('author_note'),
            'giggle': this.getLocalVar('giggle'),
            '角色心声': this.getLocalVar('角色心声'),
            'snow_rules': this.getLocalVar('snow_rules'),
            'gossip_rules': this.getLocalVar('gossip_rules'),
            'novel_header': this.getLocalVar('novel_header'),
            'profile': this.getLocalVar('profile'),
            '角色关系': this.getLocalVar('角色关系'),
            'seeds': this.getLocalVar('seeds')
    };

            if (theaterType) {
                return theaterVars[theaterType] || '';
            }
        return theaterVars;
        },

    // 【小剧场融合】解析小剧场内容标签
    parseTheaterContent: function(content) {
        if (!content) return null;

        var result = {
            type: 'unknown',
            title: '',
            content: content,
            html: '',
            data: null // 新增：存储结构化数据
    };

            // 检测 <snow> 标签
            var snowMatch = content.match(/<snow>([\s\S]*?)<\/snow>/i);
            if (snowMatch) {
                result.type = 'snow';
                result.html = snowMatch[1];
                // 提取标题
                var summaryMatch = result.html.match(/<summary>([\s\S]*?)<\/summary>/i);
                if (summaryMatch) {
                    result.title = summaryMatch[1].replace(/<[^>]+>/g, '').trim();
                }
            return result;
        }

        // 检测 <author_note> 标签（蛾摩拉作话）
        var authorMatch = content.match(/<author_note>([\s\S]*?)<\/author_note>/i);
        if (authorMatch) {
            result.type = 'author_note';
            result.html = authorMatch[1];
            var mutteringMatch = result.html.match(/<muttering>([\s\S]*?)<\/muttering>/i);
            if (mutteringMatch) {
                result.content = mutteringMatch[1].trim();
            }
        return result;
    }

    // 检测 <calendar_widget> 标签（日程表）
    var calendarMatch = content.match(/<calendar_widget>([\s\S]*?)<\/calendar_widget>/i);
    if (calendarMatch) {
        result.type = 'calendar';
        result.html = calendarMatch[1];
        return result;
    }

    // 检测 <status_panel> 标签（状态栏）
    var statusMatch = content.match(/<status_panel>([\s\S]*?)<\/status_panel>/i);
    if (statusMatch) {
        result.type = 'status';
        result.html = statusMatch[1];
        return result;
    }

    // 【新增】检测 <gossip> 标签（论坛/八卦）
    var gossipMatch = content.match(/<gossip>([\s\S]*?)<\/gossip>/i);
    if (gossipMatch) {
        result.type = 'gossip';
        result.html = gossipMatch[1];
        result.title = '论坛';
        // 提取帖子列表
        var posts = [];
        var postMatches = result.html.match(/<post[^>]*>([\s\S]*?)<\/post>/gi) || [];
        postMatches.forEach(function(post) {
            var author = (post.match(/author=["']([^"']+)["']/i) || [])[1] || '匿名';
            var title = (post.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
            var body = (post.match(/<body>([\s\S]*?)<\/body>/i) || [])[1] || post.replace(/<[^>]+>/g, '');
            posts.push({ author: author, title: title, content: body, time: new Date().toLocaleString() });
            });
        if (posts.length === 0) {
            posts.push({ author: '小剧场', content: result.html.replace(/<[^>]+>/g, '').substring(0, 200), time: new Date().toLocaleString() });
        }
    result.data = { posts: posts };
    return result;
    }

    // 【新增】检测 <角色手机> 标签（手机功能）
    var phoneMatch = content.match(/<角色手机>([\s\S]*?)<\/角色手机>/i);
    if (phoneMatch) {
        result.type = 'phone';
        result.html = phoneMatch[1];
        result.title = '手机';
        // 提取手机应用/消息
        var apps = [];
        var appMatches = result.html.match(/<app[^>]*>([\s\S]*?)<\/app>/gi) || [];
        appMatches.forEach(function(app) {
            var name = (app.match(/name=["']([^"']+)["']/i) || [])[1] || '应用';
            var icon = (app.match(/icon=["']([^"']+)["']/i) || [])[1] || '📱';
            var notification = (app.match(/<notification>([\s\S]*?)<\/notification>/i) || [])[1] || '';
            apps.push({ name: name, icon: icon, notification: notification });
            });
        result.data = { apps: apps };
        return result;
    }

    // 【新增】检测 <通用状态> 标签（状态面板）
    var generalStatusMatch = content.match(/<通用状态>([\s\S]*?)<\/通用状态>/i);
    if (generalStatusMatch) {
        result.type = 'status';
        result.html = generalStatusMatch[1];
        result.title = '角色状态';
        // 提取状态项
        var stats = [];
        var statMatches = result.html.match(/<stat[^>]*>[\s\S]*?<\/stat>/gi) || [];
        statMatches.forEach(function(stat) {
            var name = (stat.match(/name=["']([^"']+)["']/i) || [])[1] || '状态';
            var value = (stat.match(/<value>([\s\S]*?)<\/value>/i) || [])[1] || '';
            var icon = (stat.match(/icon=["']([^"']+)["']/i) || [])[1] || '📊';
            stats.push({ name: name, value: value, icon: icon });
            });
        result.data = { stats: stats };
        return result;
    }

    // 【新增】检测 <古风状态> 标签（古风状态面板）
    var ancientStatusMatch = content.match(/<古风状态>([\s\S]*?)<\/古风状态>/i);
    if (ancientStatusMatch) {
        result.type = 'status';
        result.html = ancientStatusMatch[1];
        result.title = '角色状态';
        // 提取状态项
        var stats = [];
        var statMatches = result.html.match(/<stat[^>]*>[\s\S]*?<\/stat>/gi) || [];
        statMatches.forEach(function(stat) {
            var name = (stat.match(/name=["']([^"']+)["']/i) || [])[1] || '状态';
            var value = (stat.match(/<value>([\s\S]*?)<\/value>/i) || [])[1] || '';
            var icon = (stat.match(/icon=["']([^"']+)["']/i) || [])[1] || '📜';
            stats.push({ name: name, value: value, icon: icon });
            });
        result.data = { stats: stats, ancient: true };
        return result;
    }

    // 【新增】检测 <meow_FM> 标签（摘要）
    var meowFMMatch = content.match(/<meow_FM>([\s\S]*?)<\/meow_FM>/i);
    if (meowFMMatch) {
        result.type = 'summary';
        result.html = meowFMMatch[1];
        result.title = '摘要';
        // 提取摘要内容
        var summaryContent = (result.html.match(/<content>([\s\S]*?)<\/content>/i) || [])[1] || result.html;
        result.data = { summary: summaryContent.replace(/<[^>]+>/g, '').trim() };
        return result;
    }

    // 【新增】检测 <branches> 标签（选项分支）
    var branchesMatch = content.match(/<branches>([\s\S]*?)<\/branches>/i);
    if (branchesMatch) {
        result.type = 'branches';
        result.html = branchesMatch[1];
        result.title = '选项';
        // 提取分支选项
        var options = [];
        var optionMatches = result.html.match(/<option[^>]*>[\s\S]*?<\/option>/gi) || [];
        optionMatches.forEach(function(opt, idx) {
            var text = (opt.match(/<text>([\s\S]*?)<\/text>/i) || [])[1] || opt.replace(/<[^>]+>/g, '');
            var condition = (opt.match(/condition=["']([^"']+)["']/i) || [])[1] || '';
            options.push({ text: text.trim(), condition: condition, index: idx + 1 });
            });
        if (options.length === 0) {
            // 尝试简单解析
            var lines = result.html.split(/\n/).filter(function(l) { return l.trim(); });
            lines.forEach(function(line, idx) {
                options.push({ text: line.replace(/<[^>]+>/g, '').trim(), condition: '', index: idx + 1 });
                });
        }
    result.data = { options: options };
    return result;
    }

    // 【新增】检测 <echo> 标签（物品）
    var echoMatch = content.match(/<echo>([\s\S]*?)<\/echo>/i);
    if (echoMatch) {
        result.type = 'echo';
        result.html = echoMatch[1];
        result.title = '物品';
        // 提取物品列表
        var items = [];
        var itemMatches = result.html.match(/<item[^>]*>[\s\S]*?<\/item>/gi) || [];
        itemMatches.forEach(function(item) {
            var name = (item.match(/name=["']([^"']+)["']/i) || [])[1] || '物品';
            var desc = (item.match(/<desc>([\s\S]*?)<\/desc>/i) || [])[1] || '';
            var icon = (item.match(/icon=["']([^"']+)["']/i) || [])[1] || '🎁';
            var count = parseInt((item.match(/count=["'](\d+)["']/i) || [])[1]) || 1;
            items.push({ name: name, description: desc, icon: icon, count: count });
            });
        if (items.length === 0) {
            items.push({ name: '神秘物品', description: result.html.replace(/<[^>]+>/g, '').substring(0, 100), icon: '🎁', count: 1 });
        }
    result.data = { items: items };
    return result;
    }

    // 【新增】检测 <ccd> 标签（文字剧场）
    var ccdMatch = content.match(/<ccd>([\s\S]*?)<\/ccd>/i);
    if (ccdMatch) {
        result.type = 'ccd';
        result.html = ccdMatch[1];
        result.title = '文字剧场';
        // 提取剧场内容
        var scenes = [];
        var sceneMatches = result.html.match(/<scene[^>]*>[\s\S]*?<\/scene>/gi) || [];
        sceneMatches.forEach(function(scene) {
            var title = (scene.match(/title=["']([^"']+)["']/i) || [])[1] || '';
            var text = (scene.match(/<text>([\s\S]*?)<\/text>/i) || [])[1] || scene.replace(/<[^>]+>/g, '');
            scenes.push({ title: title, text: text.trim() });
            });
        if (scenes.length === 0) {
            result.data = { text: result.html.replace(/<[^>]+>/g, '').trim() };
            } else {
            result.data = { scenes: scenes };
        }
    return result;
    }

    // 【新增】检测 <live> 标签（直播内容）
    var liveMatch = content.match(/<live>\s*([\s\S]*?)\s*<\/live>/i);
    if (liveMatch) {
        result.type = 'live';
        result.html = liveMatch[1];
        result.title = '直播';
        return result;
    }

    // 【新增】检测 <danmu> 标签（弹幕）
    var danmuMatch = content.match(/<danmu>([\s\S]*?)<\/danmu>/i);
    if (danmuMatch) {
        result.type = 'danmu';
        result.html = danmuMatch[1];
        result.title = '弹幕';
        return result;
    }

    // 【新增】检测 <ice> 标签
    var iceMatch = content.match(/<ice>([\s\S]*?)<\/ice>/i);
    if (iceMatch) {
        result.type = 'ice';
        result.html = iceMatch[1];
        return result;
    }

    // 【新增】检测 <enigma> 标签
    var enigmaMatch = content.match(/<enigma>([\s\S]*?)<\/enigma>/i);
    if (enigmaMatch) {
        result.type = 'enigma';
        result.html = enigmaMatch[1];
        result.title = '谜题';
        return result;
    }

    // 【新增】检测 <podcast> 标签（文字标题）
    var podcastMatch = content.match(/<podcast>([\s\S]*?)<\/podcast>/i);
    if (podcastMatch) {
        result.type = 'podcast';
        result.html = podcastMatch[1];
        result.title = '播客';
        return result;
    }

    // 【新增】检测 <novel_header> 标签（小说标题头）
    var novelHeaderMatch = content.match(/<novel_header>([\s\S]*?)<\/novel_header>/i);
    if (novelHeaderMatch) {
        result.type = 'novel_header';
        result.html = novelHeaderMatch[1];
        result.title = '章节标题';
        return result;
    }

    // 【新增】检测 <profile> 标签（角色关系表格）
    var profileMatch = content.match(/<profile>([\s\S]*?)<\/profile>/i);
    if (profileMatch) {
        result.type = 'profile';
        result.html = profileMatch[1];
        result.title = '角色关系';
        return result;
    }

    // 【新增】检测 <giggle> 标签（角色心声）
    var giggleMatch = content.match(/<giggle>([\s\S]*?)<\/giggle>/i);
    if (giggleMatch) {
        result.type = 'giggle';
        result.html = giggleMatch[1];
        result.title = '角色心声';
        result.content = giggleMatch[1].replace(/<[^>]+>/g, '').trim();
        return result;
    }

    // 【新增】检测 <horae> / <horaeevent> 标签（记忆插件）
    var horaeMatch = content.match(/<horaeevent>([\s\S]*?)<\/horaeevent>/i) || content.match(/<horae>([\s\S]*?)<\/horae>/i);
    if (horaeMatch) {
        result.type = 'horae';
        result.html = horaeMatch[1];
        result.title = '记忆';
        return result;
    }

    // 【新增】检测 <tableEdit> / <table_Edit> 标签
    var tableEditMatch = content.match(/<tableEdit>([\s\S]*?)<\/tableEdit>/i) || content.match(/<table_Edit>([\s\S]*?)<\/table_Edit>/i);
    if (tableEditMatch) {
        result.type = 'table';
        result.html = tableEditMatch[1];
        result.title = '表格';
        return result;
    }

    return result;
    },

    // 格式化时间戳
    timestamp: function(format) {
        var d = new Date();
        if (!format) format = 'YYYYMMDDHHmmss';
        var map = {
            'YYYY': d.getFullYear(),
            'MM': String(d.getMonth() + 1).padStart(2, '0'),
            'DD': String(d.getDate()).padStart(2, '0'),
            'HH': String(d.getHours()).padStart(2, '0'),
            'mm': String(d.getMinutes()).padStart(2, '0'),
            'ss': String(d.getSeconds()).padStart(2, '0'),
            'M': d.getMonth() + 1,
            'D': d.getDate(),
            'H': d.getHours(),
            'm': d.getMinutes(),
            's': d.getSeconds()
    };
            var result = format;
            // 先替换长的再替换短的，避免冲突
            var keys = Object.keys(map).sort(function(a, b) { return b.length - a.length; });
            keys.forEach(function(k) {
                result = result.replace(new RegExp(k, 'g'), map[k]);
                });
            return result;
        },

        // 获取当前时间
    time: function() {
            var d = new Date();
            return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        },

        // 获取当前日期
    date: function() {
            var d = new Date();
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        },

        // 获取星期几
    weekday: function() {
            var days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
            return days[new Date().getDay()];
        },

        // 随机选择
    random: function(listString) {
            if (!listString) return '';
            var list;
            if (listString.indexOf('::') !== -1) {
                list = listString.split('::');
                } else {
                list = listString.split(',').map(function(s) { return s.trim(); });
            }
        if (list.length === 0) return '';
        return list[Math.floor(Math.random() * list.length)];
        },

    // 骰子
    roll: function(formula) {
        if (!formula) return '';
        formula = formula.trim();
        // 简单的 XdY 格式支持
        var match = formula.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
        if (match) {
            var count = parseInt(match[1]) || 1;
            var sides = parseInt(match[2]) || 6;
            var modifier = parseInt(match[3]) || 0;
            var total = 0;
            for (var i = 0; i < count; i++) {
                total += Math.floor(Math.random() * sides) + 1;
            }
        return String(total + modifier);
        }
    // 纯数字视为 1dX
    if (/^\d+$/.test(formula)) {
        return String(Math.floor(Math.random() * parseInt(formula)) + 1);
    }
    return '';
    },

    // 反转字符串
    reverse: function(text) {
        return text ? text.split('').reverse().join('') : '';
        },

    // 获取用户名
    getUser: function() {
        return gameState.playerName || '玩家';
        },

    // 获取角色名（取当前场景中的第一个NPC名或玩家指定名）
    getChar: function() {
        // 尝试从当前NPC列表获取
        if (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) {
            return gameState.worldSnapshot.characters[0].name || '角色';
        }
        return '角色';
    },

    // 新增：获取角色描述
    getCharDescription: function() {
        if (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) {
            return gameState.worldSnapshot.characters[0].desc || '';
        }
        return '';
    },

    // 新增：获取角色性格
    getCharPersonality: function() {
        if (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) {
            return gameState.worldSnapshot.characters[0].personality || '';
        }
        return '';
    },

    // 新增：获取场景描述
    getScenario: function() {
        if (gameState.worldSnapshot && gameState.worldSnapshot.scenario) {
            return gameState.worldSnapshot.scenario;
        }
        return gameState.userPrompt || '';
    },

    // 获取最后一条用户消息
    getLastUserMessage: function() {
        var history = gameState.conversationHistory || [];
        for (var i = history.length - 1; i >= 0; i--) {
            if (history[i].role === 'user') return history[i].content || '';
        }
        return '';
    },

    // 获取最后一条AI消息
    getLastCharMessage: function() {
        var history = gameState.conversationHistory || [];
        for (var i = history.length - 1; i >= 0; i--) {
            if (history[i].role === 'assistant') return history[i].content || '';
        }
        return '';
    },

    // 获取最后一条消息
    getLastMessage: function() {
        var history = gameState.conversationHistory || [];
        if (history.length > 0) return history[history.length - 1].content || '';
        return '';
        },

    /**
    * 核心方法：处理文本中的所有宏
    * 按照酒馆的执行顺序分三组处理
    * @param {string} text - 要处理的文本
    * @param {object} env - 可选的环境变量覆盖
    * @param {string} env.original - {{original}} 宏的替换值（未经宏处理的原始内容）
    * @param {string} env.user - {{user}} 宏的替换值
    * @param {string} env.char - {{char}} 宏的替换值
    */
    process: function(text, env) {
        if (!text || typeof text !== 'string') return text || '';
        const self = this;
        env = env || {};

        // ===== 第一组：preEnvMacros（环境变量之前执行） =====

        // 1. 旧式标记 <USER> <BOT> <CHAR> <GROUP>
        text = text.replace(/<USER>/gi, function() { return env.user || self.getUser(); });
        text = text.replace(/<(?:BOT|CHAR)>/gi, function() { return env.char || self.getChar(); });
        text = text.replace(/<GROUP>/gi, function() { return env.char || self.getChar(); });

        // 2. 变量宏（最先执行，因为其他宏可能依赖变量值）
        // setvar::name::value
        text = text.replace(/\{\{setvar\s*::\s*([^:]+?)\s*::\s*([\s\S]*?)\}\}/gi, function(_, name, value) {
            return self.setLocalVar(name, value);
            });
        // setglobalvar::name::value
        text = text.replace(/\{\{setglobalvar\s*::\s*([^:]+?)\s*::\s*([\s\S]*?)\}\}/gi, function(_, name, value) {
            return self.setGlobalVar(name, value);
            });
        // addvar::name::value（支持多行值）
        text = text.replace(/\{\{addvar\s*::\s*([^:]+?)\s*::\s*([\s\S]*?)\}\}/gi, function(_, name, value) {
            return self.addVar(name, value);
            });
        // incvar::name
        text = text.replace(/\{\{incvar\s*::\s*([^}]+?)\}\}/gi, function(_, name) {
        return self.incVar(name);
        });
        // decvar::name
        text = text.replace(/\{\{decvar\s*::\s*([^}]+?)\}\}/gi, function(_, name) {
        return self.decVar(name);
        });
    // deletevar::name
    text = text.replace(/\{\{deletevar\s*::\s*([^}]+?)\}\}/gi, function(_, name) {
    return self.deleteVar(name);
    });
    // deleteglobalvar::name
    text = text.replace(/\{\{deleteglobalvar\s*::\s*([^}]+?)\}\}/gi, function(_, name) {
    return self.deleteGlobalVar(name);
    });

    // 3. 基础工具宏
    text = text.replace(/\{\{newline\}\}/gi, '\n');
    text = text.replace(/(?:\r?\n)*\{\{trim\}\}(?:\r?\n)*/gi, '');
    text = text.replace(/\{\{noop\}\}/gi, '');

    // ===== 新增：变量简写支持（必须在 setvar 之后，getvar 之前）=====
    // {{.varname}} - 获取局部变量简写
    // {{.varname = value}} - 设置局部变量简写
    // {{$varname}} - 获取全局变量简写
    // {{$varname = value}} - 设置全局变量简写
    // {{.varname++}} / {{.varname--}} - 递增/递减
    // {{.varname || fallback}} - 如果变量为空则使用fallback
    text = this._processVariableShorthand(text);

    // ===== 第二组：envMacros（环境变量） =====
    // 添加缺少的关键宏
    text = text.replace(/\{\{user\}\}/gi, function() { return env.user || self.getUser(); });
    text = text.replace(/\{\{char\}\}/gi, function() { return env.char || self.getChar(); });
    // {{original}} - 原始内容（未经宏处理的内容，用于包含COT标签发送给AI）
    text = text.replace(/\{\{original\}\}/gi, function() { return env.original || ''; });
    // {{raw:text}} - 原始文本（跳过宏处理）
    text = text.replace(/\{\{raw\s*::\s*([\s\S]*?)\}\}/gi, function(_, rawText) { return rawText; });

    // 新增关键宏（与SillyTavern一致）
    // {{input}} - 用户最后输入的内容
    text = text.replace(/\{\{input\}\}/gi, function() { return env.input || self.getLastUserMessage(); });
    // {{lastMessage}} - 最后一条消息的内容
    text = text.replace(/\{\{lastMessage\}\}/gi, function() { return env.lastMessage || self.getLastMessage(); });
    // {{lastUserMessage}} - 最后一条用户消息
    text = text.replace(/\{\{lastUserMessage\}\}/gi, function() { return env.lastUserMessage || self.getLastUserMessage(); });
    // {{lastCharMessage}} - 最后一条AI消息
    text = text.replace(/\{\{lastCharMessage\}\}/gi, function() { return env.lastCharMessage || self.getLastCharMessage(); });
    // {{description}} - 角色描述
    text = text.replace(/\{\{description\}\}/gi, function() { return env.description || self.getCharDescription(); });
    // {{personality}} - 角色性格
    text = text.replace(/\{\{personality\}\}/gi, function() { return env.personality || self.getCharPersonality(); });
    // {{scenario}} - 场景描述
    text = text.replace(/\{\{scenario\}\}/gi, function() { return env.scenario || self.getScenario(); });

    // ===== 第三组：postEnvMacros（环境变量之后执行） =====

    // getvar::name（在 setvar 之后执行）
    text = text.replace(/\{\{getvar\s*::\s*([^}]+?)\}\}/gi, function(_, name) {
    return self.getLocalVar(name);
    });
    // getglobalvar::name
    text = text.replace(/\{\{getglobalvar\s*::\s*([^}]+?)\}\}/gi, function(_, name) {
    return self.getGlobalVar(name);
    });
    // hasvar::name
    text = text.replace(/\{\{hasvar\s*::\s*([^}]+?)\}\}/gi, function(_, name) {
    return self.hasVar(name);
    });
    // hasglobalvar::name
    text = text.replace(/\{\{hasglobalvar\s*::\s*([^}]+?)\}\}/gi, function(_, name) {
    return self.hasGlobalVar(name);
    });

    // 时间日期宏
    text = text.replace(/\{\{time\}\}/gi, function() { return self.time(); });
    text = text.replace(/\{\{date\}\}/gi, function() { return self.date(); });
    text = text.replace(/\{\{weekday\}\}/gi, function() { return self.weekday(); });
    text = text.replace(/\{\{isotime\}\}/gi, function() { return self.time(); });
    text = text.replace(/\{\{isodate\}\}/gi, function() { return self.date(); });
    // {{timestamp:FORMAT}}
    text = text.replace(/\{\{timestamp\s*:\s*([^}]+?)\}\}/gi, function(_, fmt) {
    return self.timestamp(fmt);
    });
    // {{datetimeformat FORMAT}}
    text = text.replace(/\{\{datetimeformat\s+([^}]+?)\}\}/gi, function(_, fmt) {
    return self.timestamp(fmt);
    });
    // {{time_UTC+X}}
    text = text.replace(/\{\{time_UTC([-+]\d+)\}\}/gi, function(_, offset) {
        var d = new Date();
        var utc = d.getTime() + d.getTimezoneOffset() * 60000;
        var target = new Date(utc + parseInt(offset) * 3600000);
        return String(target.getHours()).padStart(2, '0') + ':' + String(target.getMinutes()).padStart(2, '0');
        });

    // UUID
    text = text.replace(/\{\{uuid\}\}/gi, function() { return self.uuid(); });

    // {{pick::a::b::c}} 稳定随机（基于内容哈希）
    text = text.replace(/\{\{pick\s*::\s*([\s\S]*?)\}\}/gi, function(_, listStr) {
        return self.random(listStr); // 简化实现，使用随机
        });

    // 骰子
    text = text.replace(/\{\{roll\s*:\s*([^}]+?)\}\}/gi, function(_, formula) {
    return self.roll(formula);
    });
    text = text.replace(/\{\{roll\s+([^}]+?)\}\}/gi, function(_, formula) {
    return self.roll(formula);
    });

    // 反转字符串
    text = text.replace(/\{\{reverse\s*::\s*([^}]+?)\}\}/gi, function(_, str) {
    return self.reverse(str);
    });

    // 注释宏（最后执行）
    text = text.replace(/\{\{\/\/([\s\S]*?)\}\}/gm, '');

    // ===== 补全酒馆常用宏 =====

    // 字符串操作宏
    text = text.replace(/\{\{uppercase\s*::\s*([^}]+?)\}\}/gi, function(_, t) { return (t||'').toUpperCase(); });
    text = text.replace(/\{\{lowercase\s*::\s*([^}]+?)\}\}/gi, function(_, t) { return (t||'').toLowerCase(); });
    text = text.replace(/\{\{strlen\s*::\s*([^}]+?)\}\}/gi, function(_, t) { return String((t||'').length); });
    text = text.replace(/\{\{substring\s*::\s*([^:]+?)\s*::\s*(\d+)\s*::\s*(\d+)\s*\}\}/gi, function(_, t, s, e) { return (t||'').substring(parseInt(s), parseInt(e)); });
    text = text.replace(/\{\{replace\s*::\s*([^:]+?)\s*::\s*([^:]+?)\s*::\s*([^}]*?)\}\}/gi, function(_, t, f, r) { return (t||'').split(f).join(r); });

    // 数学运算宏
    text = text.replace(/\{\{min\s*::\s*([^:]+?)\s*::\s*([^}]+?)\}\}/g, function(_, a, b) { return String(Math.min(parseFloat(a)||0, parseFloat(b)||0)); });
    text = text.replace(/\{\{max\s*::\s*([^:]+?)\s*::\s*([^}]+?)\}\}/g, function(_, a, b) { return String(Math.max(parseFloat(a)||0, parseFloat(b)||0)); });
    text = text.replace(/\{\{abs\s*::\s*([^}]+?)\}\}/g, function(_, n) { return String(Math.abs(parseFloat(n)||0)); });
    text = text.replace(/\{\{round\s*::\s*([^}]+?)\}\}/g, function(_, n) { return String(Math.round(parseFloat(n)||0)); });
    text = text.replace(/\{\{floor\s*::\s*([^}]+?)\}\}/g, function(_, n) { return String(Math.floor(parseFloat(n)||0)); });
    text = text.replace(/\{\{ceil\s*::\s*([^}]+?)\}\}/g, function(_, n) { return String(Math.ceil(parseFloat(n)||0)); });

    // 角色信息宏
    text = text.replace(/\{\{persona\}\}/gi, function() { return (typeof gameState !== 'undefined' && gameState.playerPersona) || ''; });
    text = text.replace(/\{\{user_persona\}\}/gi, function() { return (typeof gameState !== 'undefined' && gameState.playerPersona) || ''; });
    text = text.replace(/\{\{char_persona\}\}/gi, function() {
        var chars = (typeof gameState !== 'undefined' && gameState.worldSnapshot && gameState.worldSnapshot.characters) || [];
        return chars.length > 0 ? (chars[0].personality || '') : '';
        });
    text = text.replace(/\{\{model\}\}/gi, function() { return (typeof gameState !== 'undefined' && gameState._currentModel) || ''; });
    text = text.replace(/\{\{chatSize\}\}/gi, function() { return String((typeof gameState !== 'undefined' && gameState.conversationHistory) ? gameState.conversationHistory.length : 0); });
    text = text.replace(/\{\{chatIndex\}\}/gi, function() { return String((typeof gameState !== 'undefined' && gameState.conversationHistory) ? gameState.conversationHistory.length : 0); });
    text = text.replace(/\{\{output\}\}/gi, function() { return (typeof gameState !== 'undefined' && gameState._lastAIOutput) || ''; });
    text = text.replace(/\{\{slot\}\}/gi, function() { return String((typeof gameState !== 'undefined' && gameState.currentSlot != null) ? gameState.currentSlot : 0); });
    text = text.replace(/\{\{charCard\}\}/gi, function() {
        var chars = (typeof gameState !== 'undefined' && gameState.worldSnapshot && gameState.worldSnapshot.characters) || [];
        if (chars.length > 0) { var c = chars[0]; return [c.desc||'', c.personality||'', c.scenario||''].filter(Boolean).join('\n'); }
        return '';
        });
    text = text.replace(/\{\{example_message\}\}/gi, function() {
        var chars = (typeof gameState !== 'undefined' && gameState.worldSnapshot && gameState.worldSnapshot.characters) || [];
        return chars.length > 0 ? (chars[0].mes_example || '') : '';
        });

    // 比较宏
    text = text.replace(/\{\{eq\s*::\s*([^:]+?)\s*::\s*([^}]+?)\}\}/gi, function(_, a, b) { return a === b ? 'true' : 'false'; });

    // 角色变量宏
    text = text.replace(/\{\{setcharvar\s*::\s*([^:]+?)\s*::\s*([^}]*?)\}\}/gi, function(_, name, val) {
    if(typeof gameState !== 'undefined') { if(!gameState._charVars) gameState._charVars = {}; gameState._charVars[name] = val; }
    return '';
    });
    text = text.replace(/\{\{getcharvar\s*::\s*([^}]+?)\}\}/gi, function(_, name) {
    return (typeof gameState !== 'undefined' && gameState._charVars && gameState._charVars[name]) || '';
    });

    // 聊天元数据宏
    text = text.replace(/\{\{chatMetadata\s*::\s*([^}]+?)\}\}/gi, function(_, key) {
    var meta = (typeof gameState !== 'undefined' && gameState.chatMetadata) || {};
    return meta[key] !== undefined ? String(meta[key]) : '';
    });

    // 权重随机宏 {{random::w:N:选项A::w:M:选项B::选项C}}
    text = text.replace(/\{\{random\s*::\s*([\s\S]*?)\}\}/gi, function(_, argsStr) {
        var parts = argsStr.split('::').filter(function(s){return s.trim();});
        if (parts.length <= 1) return parts[0] || '';
        var pool = [];
        parts.forEach(function(p) {
            var wMatch = p.match(/^w\s*:\s*(\d+)\s*:\s*(.*)$/);
            if (wMatch) { var w = parseInt(wMatch[1]) || 1; for (var wi = 0; wi < w; wi++) pool.push(wMatch[2]); }
            else { pool.push(p); }
            });
        return pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : '';
        });

    // ===== 管道宏机制 {{value|pipe1|pipe2|...}} =====
    // 酒馆标准：将前一步的输出作为下一步的输入，支持链式操作
    // 例如 {{getvar::name|uppercase|trim}} 或 {{char|lowercase}}
    text = this._applyPipeMacros(text);

    // ===== 第四组：条件宏 {{if}}...{{/if}} 和 {{else}} =====
    // 处理 scoped if（多行格式）
    text = this._processScopedConditionals(text);

    // 清理残留的未识别宏（可选：保留原样或清空）
    // 这里选择保留原样，避免误删内容

    return text;
    },

    /**
    * 处理条件宏 {{if condition}}...{{/if}} 和 {{if condition}}...{{else}}...{{/if}}
    * 支持多行 scoped 格式
    */
    _processScopedConditionals: function(text) {
        const self = this;
        var maxIterations = 50;
        var iterations = 0;

        while (iterations < maxIterations) {
            var newText = text;

            // 使用非贪婪匹配先处理最内层的 {{if}}...{{/if}}
            // 然后通过while循环逐步处理外层
            newText = text.replace(
            /\{\{\s*if\s+([\s\S]*?)\s*\}\}([\s\S]*?)\{\{\s*\/?\s*if\s*\}\}/gi,
            function(match, condition, body) {
                // 在body中查找同级的{{else}}（跳过嵌套的{{if}}）
                var elseIdx = -1;
                var depth = 0;
                var pos = 0;
                var lowerBody = body.toLowerCase();
                while (pos < lowerBody.length) {
                    var ifPos = lowerBody.indexOf('{{if', pos);
                        var endIfPos = lowerBody.indexOf('{{/if', pos);
                            var elsePos = lowerBody.indexOf('{{else', pos);
                                if (endIfPos === -1) break;
                                var nearest = endIfPos;
                                if (ifPos !== -1 && ifPos < nearest) nearest = ifPos;
                                if (elsePos !== -1 && elsePos < nearest) nearest = elsePos;
                                if (nearest === ifPos) { depth++; pos = ifPos + 5; }
                                else if (nearest === endIfPos) {
                                    if (depth > 0) { depth--; pos = endIfPos + 5; }
                                    else break;
                                    } else if (nearest === elsePos && depth === 0) {
                                    elseIdx = elsePos; pos = elsePos + 7;
                                    } else { pos = nearest + 5; }
                                }

                            var trueContent, falseContent;
                            if (elseIdx >= 0) {
                                trueContent = body.substring(0, elseIdx);
                                falseContent = body.substring(elseIdx + 7); // 跳过 '{{else'
                                    var elseEnd = falseContent.indexOf('}}');
                                if (elseEnd >= 0) falseContent = falseContent.substring(elseEnd + 2);
                                } else {
                                trueContent = body;
                                falseContent = '';
                            }

                            condition = condition.trim();
                            var isTrue = self._evaluateCondition(condition);
                            return isTrue ? trueContent : falseContent;
                        }
                        );

                        if (newText === text) break;
                        text = newText;
                        iterations++;
                    }

                return text;
            },

        /**
        * 评估条件表达式
        * @param {string} condition - 条件表达式
        * @returns {boolean} - 条件是否为真
        */
    _evaluateCondition: function(condition) {
            condition = condition.trim();
            if (!condition) return false;

            // 检查否定 !
            var isNegated = false;
            if (condition.startsWith('!')) {
                isNegated = true;
                condition = condition.slice(1).trim();
            }

        var result = false;

        // 检查比较运算符（支持 ==, !=, >, <, >=, <=）
        var compMatch = condition.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
        if (compMatch) {
            var left = this._resolveConditionValue(compMatch[1].trim());
            var op = compMatch[2];
            var right = this._resolveConditionValue(compMatch[3].trim());
            // 尝试数值比较
            var numLeft = Number(left), numRight = Number(right);
            var useNumeric = !isNaN(numLeft) && !isNaN(numRight) && left !== '' && right !== '';
            if (useNumeric) { left = numLeft; right = numRight; }
            switch (op) {
                case '==': result = left == right; break;
                case '!=': result = left != right; break;
                case '>':  result = useNumeric ? left > right : String(left) > String(right); break;
                case '<':  result = useNumeric ? left < right : String(left) < String(right); break;
                case '>=': result = useNumeric ? left >= right : String(left) >= String(right); break;
                case '<=': result = useNumeric ? left <= right : String(left) <= String(right); break;
            }
        }
        // 检查局部变量引用 {{if .varname}}
        else if (/^\.(\w+)$/.test(condition)) {
            var localMatch = condition.match(/^\.(\w+)$/);
            var val = this.getLocalVar(localMatch[1]);
            result = this._isTruthy(val);
        }
    // 检查全局变量引用 {{if $varname}}
    else if (/^\$\w+$/.test(condition)) {
        var val = this.getGlobalVar(condition.slice(1));
        result = this._isTruthy(val);
    }
    // 检查 hasvar
    else if (condition.startsWith('hasvar')) {
        var nameMatch = condition.match(/hasvar\s*::\s*([^}]+)/i);
    if (nameMatch) {
        result = this.hasVar(nameMatch[1]) === 'true';
    }
    }
    // 检查 hasglobalvar
    else if (condition.startsWith('hasglobalvar')) {
        var nameMatch = condition.match(/hasglobalvar\s*::\s*([^}]+)/i);
    if (nameMatch) {
        result = this.hasGlobalVar(nameMatch[1]) === 'true';
    }
    }
    // 检查 getvar
    else if (condition.startsWith('getvar')) {
        var nameMatch = condition.match(/getvar\s*::\s*([^}]+)/i);
    if (nameMatch) {
        var val = this.getLocalVar(nameMatch[1]);
        result = this._isTruthy(val);
    }
    }
    // 检查 getglobalvar
    else if (condition.startsWith('getglobalvar')) {
        var nameMatch = condition.match(/getglobalvar\s*::\s*([^}]+)/i);
    if (nameMatch) {
        var val = this.getGlobalVar(nameMatch[1]);
        result = this._isTruthy(val);
    }
    }
    // 检查内建变量
    else if (condition === 'user') {
        result = this._isTruthy(this.getUser());
    }
    else if (condition === 'char') {
        result = this._isTruthy(this.getChar());
    }
    // 直接值判断
    else {
        result = this._isTruthy(condition);
    }

    // 应用否定
    if (isNegated) result = !result;

    return result;
    },

    // 解析条件表达式中的值（支持变量引用和字面量）
    _resolveConditionValue: function(val) {
        val = val.trim();
        // 去除引号包裹
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            return val.slice(1, -1);
        }
        // 局部变量引用
        if (val.startsWith('.')) {
            var resolved = this.getLocalVar(val.slice(1));
            return resolved !== '' ? resolved : val;
        }
    // 全局变量引用
    if (val.startsWith('$')) {
        var resolved = this.getGlobalVar(val.slice(1));
        return resolved !== '' ? resolved : val;
    }
    // getvar::name
    var gvMatch = val.match(/^getvar\s*::\s*(.+)$/i);
    if (gvMatch) return this.getLocalVar(gvMatch[1]);
    // getglobalvar::name
    var ggvMatch = val.match(/^getglobalvar\s*::\s*(.+)$/i);
    if (ggvMatch) return this.getGlobalVar(ggvMatch[1]);
    return val;
    },

    /**
    * 管道宏处理器 {{value|pipe1|pipe2|...}}
    * 酒馆标准：将前一步的输出作为下一步的输入
    */
    _applyPipeMacros: function(text) {
        const self = this;
        // 匹配 {{...|pipe1|pipe2|...}} 格式（管道符在宏内部）
        // 需要处理嵌套的 :: 分隔符，所以用非贪婪匹配找到最外层的 }}
    text = text.replace(/\{\{([^}]+?\|[^}]+)\}\}/g, function(match, inner) {
    var parts = inner.split('|').map(function(s) { return s.trim(); });
    if (parts.length < 2) return match; // 没有管道符，不处理

    // 第一部分是值（可能包含 :: 分隔的宏参数）
    var value = parts[0];

    // 如果值部分包含未处理的宏引用，先解析
    // 例如 getvar::name 中的 :: 不应被 split('|') 影响
    value = self._resolveMacroValue(value);

    // 依次应用管道操作
    for (var i = 1; i < parts.length; i++) {
        value = self._applySinglePipe(value, parts[i]);
    }
    return value;
    });
    return text;
    },

    // 解析宏值（处理 getvar::name、setglobalvar::name::val 等格式）
    _resolveMacroValue: function(value) {
        const self = this;
        // getvar::name
        value = value.replace(/^getvar\s*::\s*(.+)$/i, function(_, name) {
            return String(self.getLocalVar(name));
            });
        // getglobalvar::name
        value = value.replace(/^getglobalvar\s*::\s*(.+)$/i, function(_, name) {
            return String(self.getGlobalVar(name));
            });
        return value;
        },

    // 应用单个管道操作
    _applySinglePipe: function(value, pipe) {
        var p = pipe.trim().toLowerCase();
        var arg = '';
        // 提取管道参数（如 trim::xxx 中的 xxx）
        var argMatch = pipe.trim().match(/^(\w+)\s*::\s*(.+)$/);
        if (argMatch) {
            p = argMatch[1].toLowerCase();
            arg = argMatch[2].trim();
        }
        switch (p) {
            case 'uppercase': return (value || '').toUpperCase();
            case 'lowercase': return (value || '').toLowerCase();
            case 'trim': return (value || '').trim();
            case 'strlen': return String((value || '').length);
            case 'reverse': return (value || '').split('').reverse().join('');
            case 'abs': return String(Math.abs(parseFloat(value) || 0));
            case 'round': return String(Math.round(parseFloat(value) || 0));
            case 'floor': return String(Math.floor(parseFloat(value) || 0));
            case 'ceil': return String(Math.ceil(parseFloat(value) || 0));
            case 'replace':
            // replace::from::to
            var rParts = arg.split('::');
            if (rParts.length >= 2) return (value || '').split(rParts[0]).join(rParts[1]);
            return value;
            case 'substring':
            // substring::start::end
            var sParts = arg.split('::');
            if (sParts.length >= 2) return (value || '').substring(parseInt(sParts[0]) || 0, parseInt(sParts[1]) || 0);
            return value;
            case 'min':
            return String(Math.min(parseFloat(value) || 0, parseFloat(arg) || 0));
            case 'max':
            return String(Math.max(parseFloat(value) || 0, parseFloat(arg) || 0));
            case 'contains':
            return (value || '').includes(arg) ? 'true' : 'false';
            case 'startswith':
            return (value || '').startsWith(arg) ? 'true' : 'false';
            case 'endswith':
            return (value || '').endsWith(arg) ? 'true' : 'false';
            case 'eq':
            return value === arg ? 'true' : 'false';
            case 'chomp':
            return (value || '').replace(/\n+$/, '');
            default: return value; // 未知管道，原样返回
        }
    },

    /**
    * 判断值是否为真
    */
    _isTruthy: function(value) {
        if (value === undefined || value === null) return false;
        if (typeof value === 'boolean') return value;

        var strValue = String(value).trim().toLowerCase();

        // 假值
        if (strValue === '') return false;
        if (strValue === 'false') return false;
        if (strValue === '0') return false;
        if (strValue === 'off') return false;
        if (strValue === 'no') return false;
        if (strValue === 'null') return false;
        if (strValue === 'undefined') return false;

        return true;
        },

    /**
    * 去除缩进 (dedent)
    * 用于处理多行内容的缩进
    */
    _dedent: function(text) {
        var lines = text.split('\n');
        var minIndent = Infinity;

        // 找出最小缩进（跳过空行）
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.trim() === '') continue;

            var match = line.match(/^(\s*)/);
            if (match) {
                var indent = match[1].length;
                minIndent = Math.min(minIndent, indent);
            }
        }

    if (minIndent === Infinity) minIndent = 0;

    // 去除每行的最小缩进
    for (var j = 0; j < lines.length; j++) {
        if (lines[j].length >= minIndent) {
            lines[j] = lines[j].substring(minIndent);
        }
    }

    return lines.join('\n');
    },

    /**
    * 处理变量简写
    * 支持：
    * - {{.varname}} - 获取局部变量
    * - {{$varname}} - 获取全局变量
    * - {{.varname = value}} - 设置局部变量
    * - {{$varname = value}} - 设置全局变量
    * - {{.varname++}} / {{.varname--}} - 递增/递减
    * - {{.varname || fallback}} - 如果变量为空则使用fallback
    */
    _processVariableShorthand: function(text) {
        const self = this;

        // 处理赋值操作符 =（必须先处理，避免与其他操作符冲突）
        // {{.varname = value}}
        text = text.replace(/\{\{\s*\.(\w+)\s*=\s*([\s\S]*?)\}\}/gi, function(_, name, value) {
            self.setLocalVar(name, value);
            return '';
            });
        // {{$varname = value}}
        text = text.replace(/\{\{\s*\$(\w+)\s*=\s*([\s\S]*?)\}\}/gi, function(_, name, value) {
            self.setGlobalVar(name, value);
            return '';
            });

        // 处理 ||= 操作符 (逻辑或赋值)
        // {{.varname ||= fallback}}
        text = text.replace(/\{\{\s*\.(\w+)\s*\|\|=\s*([\s\S]*?)\}\}/gi, function(_, name, fallback) {
            var current = self.getLocalVar(name);
            if (!self._isTruthy(current)) {
                self.setLocalVar(name, fallback);
                return fallback;
            }
        return current;
        });
        // {{$varname ||= fallback}}
        text = text.replace(/\{\{\s*\$(\w+)\s*\|\|=\s*([\s\S]*?)\}\}/gi, function(_, name, fallback) {
            var current = self.getGlobalVar(name);
            if (!self._isTruthy(current)) {
                self.setGlobalVar(name, fallback);
                return fallback;
            }
        return current;
        });

    // 处理 || 操作符 (逻辑或) - 必须在递增递减之前
    // {{.varname || fallback}}
    text = text.replace(/\{\{\s*\.(\w+)\s*\|\|\s*([\s\S]*?)\}\}/gi, function(_, name, fallback) {
        var current = self.getLocalVar(name);
        if (!self._isTruthy(current)) {
            return fallback;
        }
    return current;
    });
    // {{$varname || fallback}}
    text = text.replace(/\{\{\s*\$(\w+)\s*\|\|\s*([\s\S]*?)\}\}/gi, function(_, name, fallback) {
        var current = self.getGlobalVar(name);
        if (!self._isTruthy(current)) {
            return fallback;
        }
    return current;
    });

    // 处理 ++ 操作符
    // {{.varname++}}
    text = text.replace(/\{\{\s*\.(\w+)\+\+\s*\}\}/gi, function(_, name) {
        return self.incVar(name);
        });
    // {{$varname++}}
    text = text.replace(/\{\{\s*\$(\w+)\+\+\s*\}\}/gi, function(_, name) {
        var current = self.getGlobalVar(name) || '0';
        var num = Number(current) || 0;
        var newVal = String(num + 1);
        self.setGlobalVar(name, newVal);
        return newVal;
        });

    // 处理 -- 操作符
    // {{.varname--}}
    text = text.replace(/\{\{\s*\.(\w+)--\s*\}\}/gi, function(_, name) {
        return self.decVar(name);
        });
    // {{$varname--}}
    text = text.replace(/\{\{\s*\$(\w+)--\s*\}\}/gi, function(_, name) {
        var current = self.getGlobalVar(name) || '0';
        var num = Number(current) || 0;
        var newVal = String(num - 1);
        self.setGlobalVar(name, newVal);
        return newVal;
        });

    // 处理 += 操作符
    // {{.varname += n}}
    text = text.replace(/\{\{\s*\.(\w+)\s*\+=\s*([\s\S]*?)\}\}/gi, function(_, name, increment) {
        self.addVar(name, increment);
        return '';
        });
    // {{$varname += n}}
    text = text.replace(/\{\{\s*\$(\w+)\s*\+=\s*([\s\S]*?)\}\}/gi, function(_, name, increment) {
        var current = self.getGlobalVar(name) || '0';
        var numCurrent = Number(current);
        var numIncrement = Number(increment);
        if (!isNaN(numCurrent) && !isNaN(numIncrement)) {
            self.setGlobalVar(name, String(numCurrent + numIncrement));
        }
    return '';
    });

    // 处理 -= 操作符
    // {{.varname -= n}}
    text = text.replace(/\{\{\s*\.(\w+)\s*-=\s*([\s\S]*?)\}\}/gi, function(_, name, decrement) {
        var current = self.getLocalVar(name) || '0';
        var numCurrent = Number(current);
        var numDecrement = Number(decrement);
        if (!isNaN(numCurrent) && !isNaN(numDecrement)) {
            self.setLocalVar(name, String(numCurrent - numDecrement));
        }
    return '';
    });
    // {{$varname -= n}}
    text = text.replace(/\{\{\s*\$(\w+)\s*-=\s*([\s\S]*?)\}\}/gi, function(_, name, decrement) {
        var current = self.getGlobalVar(name) || '0';
        var numCurrent = Number(current);
        var numDecrement = Number(decrement);
        if (!isNaN(numCurrent) && !isNaN(numDecrement)) {
            self.setGlobalVar(name, String(numCurrent - numDecrement));
        }
    return '';
    });

    // 处理简单的获取（最后处理）
    // {{.varname}}
    text = text.replace(/\{\{\s*\.(\w+)\s*\}\}/gi, function(_, name) {
        return self.getLocalVar(name);
        });
    // {{$varname}}
    text = text.replace(/\{\{\s*\$(\w+)\s*\}\}/gi, function(_, name) {
        return self.getGlobalVar(name);
        });

    return text;
    }
};
