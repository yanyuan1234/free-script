/**
 * meow_FM 结构化记忆摘要系统（增强版）
 * 灵感来源：双人成行 v12.0——长夏未央
 * 设计理念：将预设中优秀的结构化摘要格式提取为游戏原生功能，
 *           用结构化标签（时间/场景/角色/剧情/伏笔/编号）替代自由摘要，
 *           大幅提升上下文连贯性和记忆精度。
 *
 * 与现有系统关系：
 *   - 增强 core.js 中已有的 _bridgeSummaryToMemory 功能
 *   - 解析 meow_FM 结构化标签并分发到 EnhancedMemory 各存储层
 *   - 注册 PromptBuilder section 引导 AI 输出结构化格式
 *
 * 依赖：prompt-builder.js, EnhancedMemory (tavern-compat.js)
 * 被依赖：init.js
 */
var MeowFMEnhanced = {

    // 是否启用结构化摘要
    enabled: true,

    // 最近一次解析的 meow_FM 数据
    _lastParsed: null,

    // 序号计数器
    _serial: 0,

    // 解析的历史记录（用于趋势分析）
    _history: [],

    /**
     * meow_FM 格式模板（注入给AI）
     */
    FORMAT_TEMPLATE:
        '<meow_FM>\n' +
        'time: YYYY年MM月DD日·EEE(环境氛围)☆HH:mm-HH:mm(时间流逝理由)\n' +
        'scene: 地点层级A·层级B·具体位置\n' +
        'chars:\n' +
        '  角色A: 状态/微表情/动作 (特殊) [地点]\n' +
        '  角色B: 状态/微表情/动作 (特殊) [地点]\n' +
        'plot: 简练客观地总结正文发生的事实\n' +
        'quest: 眼下这条主线走到了哪一步\n' +
        'seeds: [短期 n/5] 事件描述 / [长期] 事件描述\n' +
        'serial: {编号}\n' +
        '</meow_FM>',

    /**
     * 初始化
     */
    init: function() {
        this._loadSettings();
        this._registerPromptSection();
        this._enhanceBridgeFunction();
        this._registerProcessor();
        console.log('[MeowFMEnhanced] 结构化摘要系统已初始化');
    },

    /**
     * 加载设置
     */
    _loadSettings: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.getJSON) {
                var settings = Storage.getJSON('meow_fm_settings', null);
                if (settings) {
                    this.enabled = settings.enabled !== false;
                    this._serial = settings.serial || 0;
                }
            }
        } catch(e) {
            console.warn('[MeowFMEnhanced] 读取设置失败:', e);
        }
    },

    /**
     * 保存设置
     */
    saveSettings: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.setJSON) {
                Storage.setJSON('meow_fm_settings', {
                    enabled: this.enabled,
                    serial: this._serial
                });
            }
        } catch(e) {
            console.warn('[MeowFMEnhanced] 保存设置失败:', e);
        }
    },

    /**
     * 注册 PromptBuilder section
     * 在 memoryContract 之后注入 meow_FM 格式引导
     */
    _registerPromptSection: function() {
        if (typeof PromptBuilder === 'undefined') {
            var self = this;
            setTimeout(function() { self._registerPromptSection(); }, 500);
            return;
        }

        var self = this;
        PromptBuilder.registerSection('meowFMContract', function(ctx) {
            if (!self.enabled) return '';

            var parts = [];
            parts.push('【结构化记忆摘要·meow_FM】');
            parts.push('每回合在正文之后输出结构化摘要，用于游戏记忆系统精准追踪剧情状态。');
            parts.push('格式如下（{编号}为递增序号，从001开始）：');
            parts.push(self.FORMAT_TEMPLATE.replace('{编号}', String(self._serial + 1).padStart(3, '0')));
            parts.push('');
            parts.push('字段说明：');
            parts.push('- time: 游戏内时间·星期(氛围)☆起止时间(流逝理由)');
            parts.push('- scene: 场景层级，从大到小（如：城区·街道·咖啡馆二楼）');
            parts.push('- chars: 每个在场角色的状态/微表情/动作，(特殊)标注异常状态，[地点]标注具体位置');
            parts.push('- plot: 客观总结本回合发生的事实，不要主观评价');
            parts.push('- quest: 当前主线推进到哪一步');
            parts.push('- seeds: 伏笔追踪。[短期 n/5] 表示短期伏笔（5个配额），[长期] 表示长期伏笔');
            parts.push('- serial: 递增编号，每回合+1');
            parts.push('');
            parts.push('要求：');
            parts.push('1. meow_FM不会被玩家看到，仅供系统使用');
            parts.push('2. 必须客观、简练，每个字段都要填写');
            parts.push('3. seeds中的伏笔要跟踪到触发或放弃，不要遗漏');

            return parts.join('\n');
        }, { order: 76 }); // 在 memoryContract(75) 之后，formatAnchor(71) 之后
    },

    /**
     * 解析 meow_FM 结构化标签
     * @param {string} text - AI输出的完整文本
     * @returns {object|null} 解析结果
     */
    parse: function(text) {
        if (!text || typeof text !== 'string') return null;

        // 提取 <meow_FM>...</meow_FM> 块
        var fmContent = null;
        if (typeof extractPairedTags === 'function') {
            var matches = extractPairedTags(text, ['meow_FM', 'meow_fm']);
            if (matches && matches.length > 0) {
                fmContent = matches[0].content;
            }
        }
        if (!fmContent) {
            var match = text.match(/<meow_FM>([\s\S]*?)<\/meow_FM>/i);
            if (match) fmContent = match[1];
        }

        if (!fmContent) return null;

        var result = {
            time: this._extractField(fmContent, 'time'),
            scene: this._extractField(fmContent, 'scene'),
            chars: this._extractChars(fmContent),
            plot: this._extractField(fmContent, 'plot'),
            quest: this._extractField(fmContent, 'quest'),
            seeds: this._extractSeeds(fmContent),
            serial: this._extractField(fmContent, 'serial'),
            raw: fmContent.trim()
        };

        this._lastParsed = result;
        this._serial = parseInt(result.serial) || this._serial + 1;
        this._addToHistory(result);
        this.saveSettings();

        return result;
    },

    /**
     * 提取简单字段
     */
    _extractField: function(text, fieldName) {
        var regex = new RegExp(fieldName + '\\s*:\\s*(.+?)(?=\\n[a-z_]+\\s*:|$)', 'im');
        var match = text.match(regex);
        return match ? match[1].trim() : '';
    },

    /**
     * 提取角色信息
     */
    _extractChars: function(text) {
        var charsSection = text.match(/chars\s*:\s*([\s\S]*?)(?=\n[a-z_]+\s*:|$)/im);
        if (!charsSection) return [];

        var lines = charsSection[1].trim().split('\n');
        var chars = [];
        lines.forEach(function(line) {
            line = line.trim();
            if (!line) return;
            // 格式: 角色名: 状态/微表情/动作 (特殊) [地点]
            var match = line.match(/^([^:]+):\s*(.+)/);
            if (match) {
                var name = match[1].trim();
                var details = match[2].trim();
                var special = '';
                var location = '';

                var specialMatch = details.match(/\(([^)]+)\)/);
                if (specialMatch) special = specialMatch[1];

                var locMatch = details.match(/\[([^\]]+)\]/);
                if (locMatch) location = locMatch[1];

                // 清理详情中的特殊标记和位置标记
                var status = details.replace(/\([^)]+\)/, '').replace(/\[[^\]]+\]/, '').trim();

                chars.push({
                    name: name,
                    status: status,
                    special: special,
                    location: location
                });
            }
        });
        return chars;
    },

    /**
     * 提取伏笔种子
     */
    _extractSeeds: function(text) {
        var seedsSection = text.match(/seeds\s*:\s*(.+?)(?=\n[a-z_]+\s*:|$)/im);
        if (!seedsSection) return { short: [], long: [] };

        var rawSeeds = seedsSection[1].trim();
        var short = [];
        var long = [];

        // 匹配 [短期 n/5] 和 [长期]（使用 exec 循环替代 matchAll，兼容更多浏览器）
        var shortRegex = /\[短期\s*\d+\/5\]\s*([^/[\]]+)/g;
        var m;
        while ((m = shortRegex.exec(rawSeeds)) !== null) {
            if (m[1] && m[1].trim()) short.push(m[1].trim());
        }

        var longRegex = /\[长期\]\s*([^/[\]]+)/g;
        while ((m = longRegex.exec(rawSeeds)) !== null) {
            if (m[1] && m[1].trim()) long.push(m[1].trim());
        }

        return { short: short, long: long };
    },

    /**
     * 添加到历史记录
     */
    _addToHistory: function(parsed) {
        this._history.push({
            serial: parsed.serial,
            plot: parsed.plot,
            quest: parsed.quest,
            timestamp: Date.now()
        });
        // 保留最近50条
        if (this._history.length > 50) {
            this._history = this._history.slice(-50);
        }
    },

    /**
     * 增强已有的 _bridgeSummaryToMemory 函数
     * 在摘要桥接时，同时解析结构化数据并分发到 EnhancedMemory
     */
    _enhanceBridgeFunction: function() {
        var self = this;

        // 监听 AI 响应完成事件
        if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory._summaryLayers) {
            // 增强原始桥接：在 _bridgeSummaryToMemory 调用时同时解析结构化数据
            var originalBridge = (typeof _bridgeSummaryToMemory === 'function') ? _bridgeSummaryToMemory : null;

            if (originalBridge) {
                window._bridgeSummaryToMemory = function(theaterData) {
                    // 先调用原始桥接
                    originalBridge(theaterData);

                    // 再尝试解析结构化数据
                    if (!self.enabled) return;
                    var text = '';
                    if (theaterData && theaterData.data && theaterData.data.summary) {
                        text = theaterData.data.summary;
                    } else if (theaterData && theaterData.content) {
                        text = theaterData.content;
                    }

                    if (text && (text.indexOf('meow_FM') !== -1 || text.indexOf('meow_fm') !== -1)) {
                        var parsed = self.parse(text);
                        if (parsed) {
                            self._distributeToMemory(parsed);
                        }
                    }
                };
            }
        }
    },

    /**
     * 注册输出处理器
     * 从AI输出中解析 <meow_FM> 标签并分发到记忆系统，然后从显示中移除
     */
    _registerProcessor: function() {
        if (typeof OutputProcessor === 'undefined') {
            var self = this;
            setTimeout(function() { self._registerProcessor(); }, 500);
            return;
        }

        var self = this;
        OutputProcessor.register('meow-fm', function(text) {
            if (!text || typeof text !== 'string') return text;
            if (text.indexOf('meow_FM') === -1 && text.indexOf('meow_fm') === -1) return text;

            // 解析结构化摘要并分发到记忆系统
            if (self.enabled) {
                var parsed = self.parse(text);
                if (parsed) {
                    self._distributeToMemory(parsed);
                }
            }

            // 从显示文本中移除 meow_FM 标签（不显示给玩家）
            return text.replace(/<meow_FM>[\s\S]*?<\/meow_FM>/gi, '').replace(/\n{3,}/g, '\n\n').trim();
        }, 85);

        console.log('[MeowFMEnhanced] 已注册到 OutputProcessor');
    },

    /**
     * 将解析的 meow_FM 数据分发到 EnhancedMemory 各层
     */
    _distributeToMemory: function(parsed) {
        if (typeof EnhancedMemory === 'undefined') return;
        var self = this;

        // 1. 角色状态更新
        if (parsed.chars && parsed.chars.length > 0) {
            parsed.chars.forEach(function(char) {
                if (!char.name) return;
                // 更新角色位置
                if (char.location && typeof EnhancedMemory.upsertPermanentFact === 'function') {
                    // 不覆盖角色档案，只更新位置到短期记忆
                    if (typeof EnhancedMemory.addShortTermMemory === 'function') {
                        EnhancedMemory.addShortTermMemory(
                            char.name + '在' + char.location + '，状态：' + (char.status || '未知'),
                            self._serial
                        );
                    }
                }
            });
        }

        // 2. 伏笔种子更新
        if (parsed.seeds) {
            // 短期伏笔
            if (parsed.seeds.short && parsed.seeds.short.length > 0) {
                parsed.seeds.short.forEach(function(seed) {
                    if (typeof EnhancedMemory.addShortTermMemory === 'function') {
                        EnhancedMemory.addShortTermMemory('[伏笔] ' + seed, self._serial);
                    }
                });
            }
            // 长期伏笔
            if (parsed.seeds.long && parsed.seeds.long.length > 0) {
                parsed.seeds.long.forEach(function(seed) {
                    if (typeof EnhancedMemory.upsertPermanentFact === 'function') {
                        EnhancedMemory.upsertPermanentFact('promises', {
                            content: '[长期伏笔] ' + seed,
                            importance: 7,
                            turn: self._serial
                        });
                    }
                });
            }
        }

        // 3. 剧情摘要更新到滚动摘要
        if (parsed.plot && parsed.plot.length > 10) {
            if (typeof StateManager !== 'undefined' && StateManager.set) {
                StateManager.set('progress.rollingSummary', parsed.plot.substring(0, 300), { silent: true });
            }
        }

        // 4. 任务进度更新
        if (parsed.quest && parsed.quest.length > 5) {
            if (typeof EnhancedMemory.addShortTermMemory === 'function') {
                EnhancedMemory.addShortTermMemory('[主线] ' + parsed.quest, self._serial);
            }
        }

        console.log('[MeowFMEnhanced] 已分发结构化摘要 #serial=' + parsed.serial +
            ' (chars:' + (parsed.chars ? parsed.chars.length : 0) +
            ', seeds:' + (((parsed.seeds && parsed.seeds.short) || []).length + ((parsed.seeds && parsed.seeds.long) || []).length) + ')');
    },

    /**
     * 获取最近一次解析结果
     */
    getLastParsed: function() {
        return this._lastParsed;
    },

    /**
     * 获取历史记录
     */
    getHistory: function() {
        return this._history.slice();
    },

    /**
     * 生成用于注入给AI的历史摘要
     * 将最近几条meow_FM摘要拼接为简洁的上下文
     */
    getInjectionText: function(count) {
        count = count || 3;
        if (this._history.length === 0) return '';

        var recent = this._history.slice(-count);
        var parts = [];
        recent.forEach(function(h) {
            parts.push('#' + h.serial + ' ' + h.plot + ' [主线:' + h.quest + ']');
        });
        return parts.join('\n');
    },

    setEnabled: function(enabled) {
        this.enabled = enabled;
        this.saveSettings();
    }
};
