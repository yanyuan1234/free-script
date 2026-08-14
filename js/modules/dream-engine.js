/**
 * 梦境世界构建引擎
 * 灵感来源：MoM果实 C0.3 — 梦境逻辑与映射系统
 * 设计理念：当角色进入梦境时，切换到独立的梦境逻辑：
 *           现实事件的象征映射、梦境物理规则、记忆碎片化。
 *           醒来后梦境内容可影响现实剧情走向。
 *
 * 依赖：prompt-builder.js
 */
var DreamEngine = {

    enabled: true,

    // 当前是否处于梦境状态
    _inDream: false,

    // 梦境会话记录
    // 结构: [{ id, startTurn, endTurn, symbols: [], realityImpact: '', content: '' }]
    _dreamSessions: [],

    // 当前梦境ID
    _currentDreamId: null,

    // 梦境规则集
    _dreamRules: {},

    /**
     * 初始化
     */
    init: function() {
        this._defineDreamRules();
        this._loadData();
        this._registerPromptSection();
        this._registerProcessor();
        console.log('[DreamEngine] 梦境引擎已初始化');
    },

    /**
     * 定义梦境规则
     */
    _defineDreamRules: function() {
        this._dreamRules = {
            physics: {
                gravity: '不稳定，可能突然变轻或变重',
                time: '非线性，过去和未来可同时存在',
                space: '扭曲，走廊可能无限延伸，门可能通向任意地方',
                causality: '弱因果链，事件可以无因地发生'
            },
            perception: {
                senses: '感官可能混合（通感），颜色可能有温度，声音有形状',
                memory: '记忆碎片化，现实记忆与梦境记忆混淆',
                identity: '自我意识模糊，可能变成其他人或物',
                logic: '梦境逻辑——一切荒谬都是合理的'
            },
            symbolism: {
                water: '情感与潜意识',
                fire: '愤怒或激情的转化',
                falling: '失控感或焦虑',
                flying: '自由或逃避',
                chase: '未解决的冲突',
                mirror: '自我认知与反思',
                door: '选择与转折点',
                labyrinth: '困惑与寻找方向'
            }
        };
    },

    /**
     * 加载数据
     */
    _loadData: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.getJSON) {
                this._dreamSessions = Storage.getJSON('dream_sessions', []) || {};
                var state = Storage.getJSON('dream_state', null);
                if (state) {
                    this._inDream = state.inDream || false;
                    this._currentDreamId = state.currentDreamId || null;
                }
            }
        } catch(e) {
            console.warn('[DreamEngine] 读取数据失败:', e);
        }
    },

    saveData: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.setJSON) {
                Storage.setJSON('dream_sessions', this._dreamSessions);
                Storage.setJSON('dream_state', { inDream: this._inDream, currentDreamId: this._currentDreamId });
            }
        } catch(e) {}
    },

    /**
     * 注册 PromptBuilder section
     */
    _registerPromptSection: function() {
        if (typeof PromptBuilder === 'undefined') {
            var self = this;
            setTimeout(function() { self._registerPromptSection(); }, 500);
            return;
        }

        var self = this;
        PromptBuilder.registerSection('dreamEngine', function(ctx) {
            if (!self.enabled) return '';

            if (self._inDream) {
                // 梦境中的提示
                var parts = [];
                parts.push('【梦境世界·激活中】');
                parts.push('当前角色处于梦境状态，遵循以下梦境规则：');
                parts.push('');
                parts.push('梦境物理：');
                parts.push('- 重力：' + self._dreamRules.physics.gravity);
                parts.push('- 时间：' + self._dreamRules.physics.time);
                parts.push('- 空间：' + self._dreamRules.physics.space);
                parts.push('- 因果：' + self._dreamRules.physics.causality);
                parts.push('');
                parts.push('感知规则：');
                parts.push('- 感官：' + self._dreamRules.perception.senses);
                parts.push('- 记忆：' + self._dreamRules.perception.memory);
                parts.push('- 身份：' + self._dreamRules.perception.identity);
                parts.push('- 逻辑：' + self._dreamRules.perception.logic);
                parts.push('');
                parts.push('象征映射（现实事件在梦境中的投射）：');
                parts.push('- 水→情感 | 火→愤怒/激情 | 坠落→失控 | 飞行→自由/逃避');
                parts.push('- 追逐→未解冲突 | 镜子→自我认知 | 门→选择 | 迷宫→困惑');
                parts.push('');
                parts.push('输出要求：');
                parts.push('1. 用 <dream> 标签包裹梦境内容');
                parts.push('2. 梦境中穿插象征性意象，映射角色的潜意识');
                parts.push('3. 允许荒诞、非线性叙事，但要有情感真实性');
                parts.push('4. 在梦境结束时用 <dream_end> 标签标记醒来');
                parts.push('5. 用 <dream_symbol meaning="含义">意象</dream_symbol> 标记关键象征');

                return parts.join('\n');
            } else {
                // 非梦境状态的提示
                var parts = [];
                parts.push('【梦境引擎·待机】');
                parts.push('当角色入睡或进入梦境时，使用 <dream> 标签包裹梦境内容。');
                parts.push('梦境中遵循梦境物理（不稳定重力/非线性时间/扭曲空间/弱因果链）。');
                parts.push('用 <dream_symbol meaning="象征含义">意象</dream_symbol> 标记关键象征。');
                parts.push('梦境结束时用 <dream_end> 标签标记。');

                // 如果有最近的梦境，提示其影响
                if (self._dreamSessions.length > 0) {
                    var lastDream = self._dreamSessions[self._dreamSessions.length - 1];
                    if (lastDream.realityImpact) {
                        parts.push('');
                        parts.push('【上一场梦境的现实影响】');
                        parts.push(lastDream.realityImpact);
                    }
                }

                return parts.join('\n');
            }
        }, { order: 63 });
    },

    /**
     * 注册处理器
     */
    _registerProcessor: function() {
        if (typeof OutputProcessor === 'undefined') {
            var self = this;
            setTimeout(function() { self._registerProcessor(); }, 500);
            return;
        }

        var self = this;
        OutputProcessor.register('dream-engine', function(text) {
            return self._processDreamTags(text);
        }, 90);

        console.log('[DreamEngine] 已注册到 OutputProcessor');
    },

    /**
     * 处理梦境标签
     */
    _processDreamTags: function(text) {
        if (!text || typeof text !== 'string') return text;

        // 检测梦境开始
        var dreamStart = text.indexOf('<dream>');
        if (dreamStart !== -1 && !this._inDream) {
            this._inDream = true;
            this._currentDreamId = 'dream_' + Date.now();
            console.log('[DreamEngine] 梦境开始: ' + this._currentDreamId);
        }

        // 检测梦境结束
        var dreamEnd = text.indexOf('<dream_end>');
        if (dreamEnd !== -1 && this._inDream) {
            // 提取梦境中的象征
            var symbols = this._extractSymbols(text);
            var dreamContent = this._extractDreamContent(text);

            this._dreamSessions.push({
                id: this._currentDreamId,
                startTurn: this._getCurrentTurn(),
                endTurn: this._getCurrentTurn(),
                symbols: symbols,
                realityImpact: '',
                content: dreamContent
            });

            this._inDream = false;
            this._currentDreamId = null;
            this.saveData();
            console.log('[DreamEngine] 梦境结束，记录了 ' + symbols.length + ' 个象征');
        }

        // 渲染梦境内容样式
        text = this._renderDreamContent(text);

        // 移除 <dream_end> 标签
        text = text.replace(/<dream_end>/gi, '');

        return text;
    },

    /**
     * 提取梦境中的象征
     */
    _extractSymbols: function(text) {
        var symbols = [];
        var regex = /<dream_symbol\s+meaning="([^"]+)">([^<]+)<\/dream_symbol>/gi;
        var match;
        while ((match = regex.exec(text)) !== null) {
            symbols.push({
                symbol: match[2].trim(),
                meaning: match[1].trim()
            });
        }
        return symbols;
    },

    /**
     * 提取梦境内容
     */
    _extractDreamContent: function(text) {
        var match = text.match(/<dream>([\s\S]*?)(?:<\/dream>|<dream_end>)/i);
        return match ? match[1].trim().substring(0, 500) : '';
    },

    /**
     * 渲染梦境内容样式
     */
    _renderDreamContent: function(text) {
        // 为梦境内容添加特殊样式
        return text.replace(/<dream>([\s\S]*?)<\/dream>/gi, function(match, content) {
            return '<div style="background:linear-gradient(135deg,rgba(75,63,227,0.05),rgba(39,210,191,0.05));border-left:3px solid rgba(75,63,227,0.3);padding:12px 16px;margin:8px 0;border-radius:0 8px 8px 0;font-style:italic;color:#8a8a9a;">' +
                   content.trim() +
                   '</div>';
        }).replace(/<dream_symbol\s+meaning="([^"]+)">([^<]+)<\/dream_symbol>/gi, function(match, meaning, symbol) {
            return '<span style="color:#4B3FE3;border-bottom:1px dashed #4B3FE3;cursor:help;" title="象征：' + meaning + '">' + symbol + '</span>';
        });
    },

    /**
     * 获取梦境会话记录
     */
    getDreamSessions: function() {
        return this._dreamSessions.slice();
    },

    /**
     * 是否在梦境中
     */
    isInDream: function() {
        return this._inDream;
    },

    _getCurrentTurn: function() {
        if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory._messageCount) {
            return EnhancedMemory._messageCount;
        }
        return 0;
    },

    setEnabled: function(enabled) {
        this.enabled = enabled;
    }
};
