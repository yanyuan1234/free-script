/**
 * 内置正则规则库 - 防陈词/格式清洗系统
 * 灵感来源：恒·序 v1.95 by 噤蝉若寒
 * 设计理念：将预设中优秀的正则后处理规则提取为游戏原生功能，
 *           用户可开关、可扩展，不依赖外部预设导入。
 *
 * 依赖：regex-manager.js
 * 被依赖：init.js (初始化调用)
 */
var BuiltinRegexRules = {

    // 内置规则定义
    // 每条规则: { id, name, findPattern, replaceString, applyOutput, applyInput, enabled, description, category }
    rules: [],

    // 用户自定义开关状态（持久化）
    _toggleStates: {},

    // 规则分类
    CATEGORIES: {
        CLICHE: 'cliche',         // 陈词滥调清除
        FORMAT: 'format',         // 格式清洗
        QUALITY: 'quality',       // 文本质量提升
        TAG_CLEANUP: 'tagCleanup' // 残留标签清理
    },

    /**
     * 初始化内置规则
     */
    init: function() {
        this._defineRules();
        this._loadToggleStates();
        this._injectIntoRegexManager();
        console.log('[BuiltinRegexRules] 已加载 ' + this.rules.length + ' 条内置正则规则');
    },

    /**
     * 定义所有内置正则规则
     * 规则来源：恒·序 v1.95 + God of novel v3 + 银月蛛网 v2.7
     */
    _defineRules: function() {
        this.rules = [
            // ===== 陈词滥调清除 =====
            {
                id: 'br_cliche_01',
                name: '清除高频陈词·死死地',
                findPattern: '/死死[的地]?/g',
                replaceString: '紧紧',
                applyOutput: true,
                applyInput: false,
                enabled: true,
                category: this.CATEGORIES.CLICHE,
                description: '将"死死地""死死的"替换为"紧紧"'
            },
            {
                id: 'br_cliche_02',
                name: '清除高频陈词·一抹',
                findPattern: '/一抹(?![擦汗笑意])/g',
                replaceString: '一丝',
                applyOutput: true,
                applyInput: false,
                enabled: true,
                category: this.CATEGORIES.CLICHE,
                description: '将"一抹"替换为"一丝"（保留"一抹汗/擦/笑意"）'
            },
            {
                id: 'br_cliche_03',
                name: '清除高频陈词·极其',
                findPattern: '/极其/g',
                replaceString: '格外',
                applyOutput: true,
                applyInput: false,
                enabled: true,
                category: this.CATEGORIES.CLICHE,
                description: '将"极其"替换为"格外"'
            },
            {
                id: 'br_cliche_04',
                name: '清除冗余连词·由于',
                findPattern: '/由于(?=[^])/g',
                replaceString: '因为',
                applyOutput: true,
                applyInput: false,
                enabled: false,
                category: this.CATEGORIES.CLICHE,
                description: '将"由于"替换为"因为"（更口语化，默认关闭）'
            },
            {
                id: 'br_cliche_05',
                name: '清除病态描写词',
                findPattern: '/病态的?/g',
                replaceString: '苍白的',
                applyOutput: true,
                applyInput: false,
                enabled: true,
                category: this.CATEGORIES.CLICHE,
                description: '将"病态的"替换为"苍白的"'
            },
            {
                id: 'br_cliche_06',
                name: '清除霸道描写词',
                findPattern: '/霸道的?地?/g',
                replaceString: '强势地',
                applyOutput: true,
                applyInput: false,
                enabled: true,
                category: this.CATEGORIES.CLICHE,
                description: '将"霸道的""霸道地"替换为"强势地"'
            },
            {
                id: 'br_cliche_07',
                name: '清除生理性描写词',
                findPattern: '/生理性的?/g',
                replaceString: '',
                applyOutput: true,
                applyInput: false,
                enabled: true,
                category: this.CATEGORIES.CLICHE,
                description: '直接删除"生理性的"'
            },
            {
                id: 'br_cliche_08',
                name: '清除舐字误用',
                findPattern: '/(?<![舔])舐/g',
                replaceString: '舔',
                applyOutput: true,
                applyInput: false,
                enabled: true,
                category: this.CATEGORIES.CLICHE,
                description: '将单独使用的"舐"替换为"舔"'
            },

            // ===== 残留标签清理 =====
            {
                id: 'br_tag_01',
                name: '清除VariableCheck标签',
                findPattern: '/<VariableCheck>[\\s\\S]*?<\\/VariableCheck>/gi',
                replaceString: '',
                applyOutput: true,
                applyInput: false,
                enabled: true,
                category: this.CATEGORIES.TAG_CLEANUP,
                description: '清除AI输出的VariableCheck标签及其内容'
            },
            {
                id: 'br_tag_02',
                name: '清除finish标签',
                findPattern: '/\\s<finish>(?!.+<finish>).*$/gis',
                replaceString: '',
                applyOutput: true,
                applyInput: false,
                enabled: true,
                category: this.CATEGORIES.TAG_CLEANUP,
                description: '清除末尾的finish标签及之后内容'
            },
            {
                id: 'br_tag_03',
                name: '清除think/reasoning标签',
                findPattern: '/<(think|reasoning|thought)>[\\s\\S]*?<\\/\\1>/gi',
                replaceString: '',
                applyOutput: true,
                applyInput: false,
                enabled: true,
                category: this.CATEGORIES.TAG_CLEANUP,
                description: '清除思考过程标签（防泄漏到显示）'
            },

            // ===== 格式清洗 =====
            {
                id: 'br_format_01',
                name: '清除p标签残留连字符',
                findPattern: '/(?<=<p style)-/g',
                replaceString: '',
                applyOutput: true,
                applyInput: false,
                enabled: true,
                category: this.CATEGORIES.FORMAT,
                description: '清除p标签后的残留连字符'
            },
            {
                id: 'br_format_02',
                name: '清除多余空行',
                findPattern: '/\\n{4,}/g',
                replaceString: '\\n\\n\\n',
                applyOutput: true,
                applyInput: false,
                enabled: true,
                category: this.CATEGORIES.FORMAT,
                description: '将4个以上连续换行压缩为3个'
            },
            {
                id: 'br_format_03',
                name: '清除行首多余空格',
                findPattern: '/^[ \\t]+/gm',
                replaceString: '',
                applyOutput: true,
                applyInput: false,
                enabled: false,
                category: this.CATEGORIES.FORMAT,
                description: '清除每行开头的空格和制表符（默认关闭）'
            },

            // ===== 文本质量提升 =====
            {
                id: 'br_quality_01',
                name: '优化重复标点',
                findPattern: '/([！？。…])\\1{2,}/g',
                replaceString: '$1$1',
                applyOutput: true,
                applyInput: false,
                enabled: true,
                category: this.CATEGORIES.QUALITY,
                description: '将3个以上重复标点压缩为2个'
            },
            {
                id: 'br_quality_02',
                name: '优化重复词语',
                findPattern: '/(.)\\1{4,}/g',
                replaceString: '$1$1$1',
                applyOutput: true,
                applyInput: false,
                enabled: true,
                category: this.CATEGORIES.QUALITY,
                description: '将5个以上重复字符压缩为3个（如"啊啊啊啊啊啊"→"啊啊啊"）'
            },
            {
                id: 'br_quality_03',
                name: '清除AI口癖·总而言之',
                findPattern: '/总而言之[，,]?/g',
                replaceString: '',
                applyOutput: true,
                applyInput: false,
                enabled: true,
                category: this.CATEGORIES.QUALITY,
                description: '清除"总而言之"等AI总结性口癖'
            },
            {
                id: 'br_quality_04',
                name: '清除AI口癖·不可否认',
                findPattern: '/不可否认的是[，,]?/g',
                replaceString: '',
                applyOutput: true,
                applyInput: false,
                enabled: true,
                category: this.CATEGORIES.QUALITY,
                description: '清除"不可否认的是"等AI套话'
            },
            {
                id: 'br_quality_05',
                name: '清除AI口癖·值得一提',
                findPattern: '/值得一提的是[，,]?/g',
                replaceString: '',
                applyOutput: true,
                applyInput: false,
                enabled: true,
                category: this.CATEGORIES.QUALITY,
                description: '清除"值得一提的是"等AI套话'
            }
        ];
    },

    /**
     * 加载用户开关状态
     */
    _loadToggleStates: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.getJSON) {
                this._toggleStates = Storage.getJSON('builtin_regex_toggles', {}) || {};
            }
        } catch(e) {
            console.warn('[BuiltinRegexRules] 读取开关状态失败:', e);
            this._toggleStates = {};
        }

        // 应用用户开关到规则
        var self = this;
        this.rules.forEach(function(rule) {
            var savedState = self._toggleStates[rule.id];
            if (savedState !== undefined) {
                rule.enabled = savedState;
            }
        });
    },

    /**
     * 保存用户开关状态
     */
    _saveToggleStates: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.setJSON) {
                Storage.setJSON('builtin_regex_toggles', this._toggleStates);
            }
        } catch(e) {
            console.warn('[BuiltinRegexRules] 保存开关状态失败:', e);
        }
    },

    /**
     * 将内置规则注入 RegexManager
     * 通过扩展 getAllScripts 方法，使内置规则参与正则处理流程
     */
    _injectIntoRegexManager: function() {
        if (typeof RegexManager === 'undefined') {
            console.warn('[BuiltinRegexRules] RegexManager 未加载，延迟注入');
            var self = this;
            setTimeout(function() { self._injectIntoRegexManager(); }, 500);
            return;
        }

        // 保存原始 getAllScripts 方法
        var originalGetAll = RegexManager.getAllScripts;
        var self = this;

        // 重写 getAllScripts，加入内置规则
        RegexManager.getAllScripts = function() {
            var scripts = originalGetAll.call(this);
            var builtinScripts = self._getEnabledScriptsAsRegexFormat();
            // 内置规则优先级最高（放在最前面）
            return builtinScripts.concat(scripts);
        };

        // 添加获取内置规则的方法
        RegexManager.getBuiltinScripts = function() {
            return self.rules.slice();
        };

        // 添加切换内置规则开关的方法
        RegexManager.toggleBuiltinScript = function(ruleId, enabled) {
            return self.toggleRule(ruleId, enabled);
        };

        console.log('[BuiltinRegexRules] 已注入 RegexManager');
    },

    /**
     * 获取已启用的规则（转换为 RegexManager 格式）
     */
    _getEnabledScriptsAsRegexFormat: function() {
        var result = [];
        this.rules.forEach(function(rule) {
            if (!rule.enabled) return;
            result.push({
                id: rule.id,
                name: rule.name,
                findPattern: rule.findPattern,
                replaceString: rule.replaceString || '',
                applyInput: rule.applyInput || false,
                applyOutput: rule.applyOutput || false,
                enabled: true,
                imported: false,
                markdownOnly: false,
                promptOnly: false,
                runOnEdit: false,
                trimStrings: [],
                substituteRegex: 0,
                minDepth: null,
                maxDepth: null,
                _originalPlacement: rule.applyOutput ? [1] : (rule.applyInput ? [2] : []),
                _isBuiltin: true
            });
        });
        return result;
    },

    /**
     * 切换规则开关
     */
    toggleRule: function(ruleId, enabled) {
        var rule = this.rules.find(function(r) { return r.id === ruleId; });
        if (!rule) return false;
        rule.enabled = enabled;
        this._toggleStates[ruleId] = enabled;
        this._saveToggleStates();
        console.log('[BuiltinRegexRules] 规则 "' + rule.name + '" 已' + (enabled ? '启用' : '禁用'));
        return true;
    },

    /**
     * 批量启用/禁用某分类的所有规则
     */
    toggleCategory: function(category, enabled) {
        var count = 0;
        this.rules.forEach(function(rule) {
            if (rule.category === category) {
                rule.enabled = enabled;
                this._toggleStates[rule.id] = enabled;
                count++;
            }
        }, this);
        this._saveToggleStates();
        return count;
    },

    /**
     * 获取按分类分组的规则
     */
    getRulesByCategory: function() {
        var grouped = {};
        var self = this;
        Object.keys(this.CATEGORIES).forEach(function(key) {
            var cat = self.CATEGORIES[key];
            grouped[cat] = self.rules.filter(function(r) { return r.category === cat; });
        });
        return grouped;
    },

    /**
     * 获取分类中文名
     */
    getCategoryName: function(category) {
        var names = {
            cliche: '陈词滥调清除',
            format: '格式清洗',
            quality: '文本质量提升',
            tagCleanup: '残留标签清理'
        };
        return names[category] || category;
    },

    /**
     * 获取已启用规则数量
     */
    getEnabledCount: function() {
        return this.rules.filter(function(r) { return r.enabled; }).length;
    }
};
