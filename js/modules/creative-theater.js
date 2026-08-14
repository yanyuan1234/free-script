/**
 * 创意剧场系统
 * 灵感来源：银月蛛网 v2.7 — <raven> 小剧场系统 + POV视角切换 + 心理独白
 * 设计理念：在正文之后生成创意番外内容，不影响主线剧情。
 *           支持多视角叙事、角色独白、时间线穿梭等特殊场景。
 *           NSFW相关类型已完全跳过，只保留通用创意类型。
 *
 * 依赖：prompt-builder.js, RegexManager
 */
var CreativeTheater = {

    enabled: true,

    // 小剧场类型定义（已过滤NSFW内容）
    theaterTypes: [],

    // 当前启用的剧场类型
    _enabledTypes: new Set(),

    // 剧场历史记录
    _history: [],

    /**
     * 初始化
     */
    init: function() {
        this._defineTheaterTypes();
        this._loadSettings();
        this._registerPromptSection();
        this._registerProcessor();
        console.log('[CreativeTheater] 创意剧场已初始化 (' + this.theaterTypes.length + '种类型)');
    },

    /**
     * 定义剧场类型
     * 来源：银月蛛网 v2.7 的小剧场类型（已过滤NSFW）
     */
    _defineTheaterTypes: function() {
        this.theaterTypes = [
            {
                id: 'random',
                name: '随机创意',
                description: '打开脑洞、无限制玩梗二创的番外内容',
                prompt: '生成一个随机创意番外——可能是角色在AU（平行宇宙）中的故事、有趣的if线、或完全放飞自我的脑洞短篇。',
                enabled: true
            },
            {
                id: 'future_message',
                name: '未来讯息',
                description: '未来的角色发送信息到现在，时间线穿梭',
                prompt: '生成一条来自未来的讯息——未来的角色通过短信、便签、日记等形式，向现在的角色传递信息。讲述未来发生的事情，制造悬念或伏笔。',
                enabled: true
            },
            {
                id: 'live_comments',
                name: '直播弹幕',
                description: '故事被当直播播放，生成弹幕页面',
                prompt: '将当前剧情想象为一场直播，生成观众弹幕页面。弹幕要体现观众的反应、吐槽、预测，风格活泼有趣。',
                enabled: true
            },
            {
                id: 'music_recommend',
                name: '音乐推荐',
                description: '角色推荐音乐并给出理由',
                prompt: '让角色推荐一首符合当前心情/场景的音乐，并解释为什么选这首歌。用 <bgm> 歌名 - 歌手 </bgm> 格式输出。',
                enabled: true
            },
            {
                id: 'phone_content',
                name: '手机内容',
                description: '聊天记录/朋友圈/SNS/短视频等手机内容',
                prompt: '展示角色的手机内容——可能是聊天记录、朋友圈动态、SNS帖子、短视频评论等。通过手机内容侧面展示角色的社交关系和日常。',
                enabled: true
            },
            {
                id: 'secret_diary',
                name: '秘密日记',
                description: '角色内心最真实想法的日记',
                prompt: '以角色的视角写一篇秘密日记，记录内心最真实的想法和感受。日记内容不为主角所知，用于深化角色心理。',
                enabled: true
            },
            {
                id: 'pov_switch',
                name: '视角切换',
                description: '从其他角色的视角重新叙述当前场景',
                prompt: '从在场另一个角色的视角重新叙述当前场景。展现该角色的内心活动和不同视角的观察。',
                enabled: false
            },
            {
                id: 'light_horror',
                name: '轻松恐怖',
                description: '角色即恐怖本身，用怪谈/悬疑衬托氛围',
                prompt: '生成一个轻松的恐怖番外——角色本身成为恐怖的来源，但用怪谈、悬疑的方式侧面展示，营造既紧张又有趣的氛围。',
                enabled: false
            }
        ];

        // 初始化启用集合
        this.theaterTypes.forEach(function(t) {
            if (t.enabled) this._enabledTypes.add(t.id);
        }, this);
    },

    /**
     * 加载设置
     */
    _loadSettings: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.getJSON) {
                var settings = Storage.getJSON('creative_theater_settings', null);
                if (settings) {
                    this.enabled = settings.enabled !== false;
                    if (settings.enabledTypes) {
                        this._enabledTypes = new Set(settings.enabledTypes);
                    }
                    this._history = settings.history || [];
                }
            }
        } catch(e) {
            console.warn('[CreativeTheater] 读取设置失败:', e);
        }
    },

    saveSettings: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.setJSON) {
                Storage.setJSON('creative_theater_settings', {
                    enabled: this.enabled,
                    enabledTypes: Array.from(this._enabledTypes),
                    history: this._history.slice(-20)
                });
            }
        } catch(e) {}
    },

    /**
     * 注册 PromptBuilder section
     * 来源：银月蛛网 v2.7 的 <raven> 小剧场系统
     */
    _registerPromptSection: function() {
        if (typeof PromptBuilder === 'undefined') {
            var self = this;
            setTimeout(function() { self._registerPromptSection(); }, 500);
            return;
        }

        var self = this;
        PromptBuilder.registerSection('creativeTheater', function(ctx) {
            if (!self.enabled || self._enabledTypes.size === 0) return '';

            var enabledTypes = self.theaterTypes.filter(function(t) {
                return self._enabledTypes.has(t.id);
            });

            var lastType = self._history.length > 0 ? self._history[self._history.length - 1].type : null;

            var parts = [];
            parts.push('【创意剧场·小剧场系统】');
            parts.push('在正文之后生成一个小剧场番外。小剧场不影响主线剧情，讲述正片外的边角料故事。');
            parts.push('');
            parts.push('可用的小剧场类型（每次选一个，禁止连续重复上一轮的类型）：');
            enabledTypes.forEach(function(t) {
                var marker = (t.id === lastType) ? ' [上轮已用，跳过]' : '';
                parts.push('- ' + t.name + ': ' + t.description + marker);
            });
            parts.push('');
            parts.push('输出格式：');
            parts.push('<theater type="类型ID">');
            parts.push('<details>');
            parts.push('<summary>🎭【简短标题】</summary>');
            parts.push('小剧场内容（可用HTML美化，但禁止外链图片和字体）');
            parts.push('</details>');
            parts.push('</theater>');
            parts.push('');
            parts.push('规则：');
            parts.push('1. 小剧场不能推进主线，不涉及核心剧情剧透');
            parts.push('2. 可以使用HTML/CSS美化，但禁止外部链接');
            parts.push('3. 每次只生成1个小剧场');
            parts.push('4. 字数不限，但要有趣');
            parts.push('5. 禁止连续重复上轮的小剧场类型');

            return parts.join('\n');
        }, { order: 78 });
    },

    /**
     * 注册处理器
     */
    _registerProcessor: function() {
        if (typeof RegexManager === 'undefined') {
            var self = this;
            setTimeout(function() { self._registerProcessor(); }, 1000);
            return;
        }

        var self = this;
        var originalProcess = RegexManager.processOutput;

        if (originalProcess) {
            RegexManager.processOutput = function(text) {
                text = originalProcess.call(this, text);
                return self._processTheaterTags(text);
            };
        }
    },

    /**
     * 处理剧场标签
     */
    _processTheaterTags: function(text) {
        if (!text || typeof text !== 'string') return text;

        var self = this;
        var regex = /<theater\s+type="([^"]+)">([\s\S]*?)<\/theater>/gi;
        var hasMatch = false;

        text = text.replace(regex, function(match, type, content) {
            hasMatch = true;

            // 记录历史
            self._history.push({
                type: type,
                turn: self._getCurrentTurn(),
                timestamp: Date.now()
            });

            // 查找类型名称
            var typeDef = self.theaterTypes.find(function(t) { return t.id === type; });
            var typeName = typeDef ? typeDef.name : type;

            // 渲染为折叠面板
            return '<div style="margin:12px 0;border:1px solid rgba(75,63,227,0.2);border-radius:12px;overflow:hidden;">' +
                   '<div style="padding:6px 12px;background:rgba(75,63,227,0.08);font-size:11px;color:#8a8ac0;">🎭 创意剧场 · ' + typeName + '</div>' +
                   content.trim() +
                   '</div>';
        });

        if (hasMatch) {
            self.saveSettings();
        }

        return text;
    },

    /**
     * 切换剧场类型开关
     */
    toggleType: function(typeId, enabled) {
        if (enabled) {
            this._enabledTypes.add(typeId);
        } else {
            this._enabledTypes.delete(typeId);
        }
        this.saveSettings();
    },

    /**
     * 获取所有剧场类型
     */
    getTheaterTypes: function() {
        var self = this;
        return this.theaterTypes.map(function(t) {
            return {
                id: t.id,
                name: t.name,
                description: t.description,
                enabled: self._enabledTypes.has(t.id)
            };
        });
    },

    /**
     * 获取历史记录
     */
    getHistory: function() {
        return this._history.slice();
    },

    _getCurrentTurn: function() {
        if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory._messageCount) {
            return EnhancedMemory._messageCount;
        }
        return this._history.length;
    },

    setEnabled: function(enabled) {
        this.enabled = enabled;
        this.saveSettings();
    }
};
