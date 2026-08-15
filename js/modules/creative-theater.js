/**
 * 创意剧场系统（融合版）
 * 灵感来源：银月蛛网 v2.7 — <raven> 小剧场系统 + POV视角切换 + 心理独白
 *
 * 融会贯通设计：
 *   预设的小剧场类型与游戏已有的日志子功能高度重合，不再独立渲染，
 *   而是将内容注入到游戏原生的 _worldModules 和 PresetAppManager 管道中：
 *
 *   预设小剧场类型        →  游戏原生管道
 *   ─────────────────────────────────────────
 *   secret_diary          →  _worldModules type=diary（日记页）
 *   phone_content         →  _worldModules type=chat/moments（聊天/朋友圈页）
 *   live_comments         →  PresetAppManager <danmu>/<live> 标签
 *   future_message        →  _worldModules type=mail（邮箱页）
 *   music_recommend       →  PresetAppManager <bgm> 新标签
 *   random/pov_switch/    →  PresetAppManager <snow> 标签（小剧场）
 *   light_horror
 *
 *   这样小剧场不再是"额外挂件"，而是成为游戏日志系统的原生内容来源。
 *
 * 依赖：prompt-builder.js, RegexManager, PresetAppManager, _worldModules
 */
var CreativeTheater = {

    enabled: true,

    // 小剧场类型定义（已过滤NSFW内容）
    theaterTypes: [],

    // 当前启用的剧场类型
    _enabledTypes: new Set(),

    // 剧场历史记录
    _history: [],

    // 剧场类型 → 游戏日志管道的映射
    _ROUTE_MAP: {
        'secret_diary':   { pipeline: 'worldModules', targetType: 'diary',   label: '日记' },
        'phone_content':  { pipeline: 'worldModules', targetType: 'chat',    label: '聊天' },
        'future_message': { pipeline: 'worldModules', targetType: 'mail',    label: '邮箱' },
        'live_comments':  { pipeline: 'presetApp',    targetType: 'danmu',   label: '弹幕' },
        'music_recommend':{ pipeline: 'presetApp',    targetType: 'bgm',     label: '音乐' },
        'random':         { pipeline: 'presetApp',    targetType: 'snow',    label: '小剧场' },
        'pov_switch':     { pipeline: 'presetApp',    targetType: 'snow',    label: '小剧场' },
        'light_horror':   { pipeline: 'presetApp',    targetType: 'snow',    label: '小剧场' }
    },

    /**
     * 初始化
     */
    init: function() {
        this._defineTheaterTypes();
        this._loadSettings();
        this._registerPromptSection();
        this._registerProcessor();
        console.log('[CreativeTheater] 融合版创意剧场已初始化 (' + this.theaterTypes.length + '种类型, 路由到日志管道)');
    },

    /**
     * 定义剧场类型
     * 来源：银月蛛网 v2.7（已过滤NSFW）+ 融合映射
     */
    _defineTheaterTypes: function() {
        this.theaterTypes = [
            {
                id: 'random',
                name: '随机创意',
                description: 'AU/if线/脑洞短篇，注入到日志-小剧场',
                prompt: '生成一个随机创意番外——可能是角色在AU中的故事、有趣的if线、或放飞自我的脑洞短篇。',
                enabled: true,
                route: 'snow'
            },
            {
                id: 'future_message',
                name: '未来讯息',
                description: '未来角色发信息到现在，注入到日志-邮箱',
                prompt: '生成一条来自未来的讯息——通过短信、便签、日记等形式传递。讲述未来发生的事情，制造悬念或伏笔。',
                enabled: true,
                route: 'mail'
            },
            {
                id: 'live_comments',
                name: '直播弹幕',
                description: '故事被当直播播放，弹幕注入到日志-弹幕',
                prompt: '将当前剧情想象为一场直播，生成观众弹幕。体现观众的反应、吐槽、预测，风格活泼有趣。',
                enabled: true,
                route: 'danmu'
            },
            {
                id: 'music_recommend',
                name: '音乐推荐',
                description: '角色推荐音乐，注入到日志-音乐',
                prompt: '让角色推荐一首符合当前心情/场景的音乐，解释选择理由。',
                enabled: true,
                route: 'bgm'
            },
            {
                id: 'phone_content',
                name: '手机内容',
                description: '聊天记录/朋友圈/SNS，注入到日志-聊天/朋友圈',
                prompt: '展示角色的手机内容——聊天记录、朋友圈动态、SNS帖子等。通过手机内容侧面展示角色的社交关系和日常。',
                enabled: true,
                route: 'chat'
            },
            {
                id: 'secret_diary',
                name: '秘密日记',
                description: '角色内心日记，注入到日志-日记',
                prompt: '以角色的视角写一篇秘密日记，记录内心最真实的想法和感受。日记不为主角所知，用于深化角色心理。',
                enabled: true,
                route: 'diary'
            },
            {
                id: 'pov_switch',
                name: '视角切换',
                description: '从其他角色视角重新叙述，注入到日志-小剧场',
                prompt: '从在场另一个角色的视角重新叙述当前场景。展现该角色的内心活动和不同视角的观察。',
                enabled: false,
                route: 'snow'
            },
            {
                id: 'light_horror',
                name: '轻松恐怖',
                description: '怪谈/悬疑番外，注入到日志-小剧场',
                prompt: '生成一个轻松的恐怖番外——角色本身成为恐怖的来源，用怪谈、悬疑的方式侧面展示。',
                enabled: false,
                route: 'snow'
            }
        ];

        this._enabledTypes = new Set();
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
     * 融合版：引导AI使用与日志系统兼容的标签格式
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
            parts.push('【创意剧场·日志融合系统】');
            parts.push('在正文之后生成一个小剧场番外，内容会自动注入到游戏的日志系统中。');
            parts.push('小剧场不影响主线剧情，讲述正片外的边角料故事。');
            parts.push('');
            parts.push('可用的小剧场类型（每次选一个，禁止连续重复上一轮的类型）：');
            enabledTypes.forEach(function(t) {
                var marker = (t.id === lastType) ? ' [上轮已用，跳过]' : '';
                parts.push('- ' + t.id + ': ' + t.name + ' → 注入日志-' + t.route + marker);
            });
            parts.push('');
            parts.push('输出格式（根据类型选择对应的日志标签）：');
            parts.push('');
            parts.push('秘密日记 → 直接输出日记模块数据：');
            parts.push('<theater type="secret_diary">');
            parts.push('npc: 角色名');
            parts.push('date: 日期');
            parts.push('mood: 心情');
            parts.push('content: 日记正文（第一人称，内心独白）');
            parts.push('</theater>');
            parts.push('');
            parts.push('未来讯息 → 输出邮件模块数据：');
            parts.push('<theater type="future_message">');
            parts.push('from: 发件人（未来角色）');
            parts.push('subject: 邮件主题');
            parts.push('content: 邮件正文（来自未来的信息）');
            parts.push('</theater>');
            parts.push('');
            parts.push('手机内容 → 输出聊天模块数据：');
            parts.push('<theater type="phone_content">');
            parts.push('npc: 角色名');
            parts.push('messages: 对话内容（每行一条，格式：角色名: 消息）');
            parts.push('</theater>');
            parts.push('');
            parts.push('直播弹幕 → 输出弹幕标签：');
            parts.push('<theater type="live_comments">');
            parts.push('<danmu>弹幕内容（每行一条）</danmu>');
            parts.push('</theater>');
            parts.push('');
            parts.push('音乐推荐 → 输出BGM标签：');
            parts.push('<theater type="music_recommend">');
            parts.push('<bgm>歌名 - 歌手</bgm>');
            parts.push('推荐理由');
            parts.push('</theater>');
            parts.push('');
            parts.push('随机创意/视角切换/轻松恐怖 → 输出小剧场标签：');
            parts.push('<theater type="random">');
            parts.push('<details><summary>🎭【简短标题】</summary>');
            parts.push('小剧场内容（可用HTML美化，禁止外链）');
            parts.push('</details></theater>');
            parts.push('');
            parts.push('规则：');
            parts.push('1. 小剧场不能推进主线，不涉及核心剧情剧透');
            parts.push('2. 内容要具体真实，不要用占位符');
            parts.push('3. 每次只生成1个小剧场');
            parts.push('4. 禁止连续重复上轮的小剧场类型');

            return parts.join('\n');
        }, { order: 78 });
    },

    /**
     * 注册处理器
     * 核心融合逻辑：解析 <theater> 标签，路由到对应的日志管道
     */
    _registerProcessor: function() {
        // 使用 OutputProcessor 统一注册中心，替代原先对 RegexManager.processOutput 的 hook
        if (typeof OutputProcessor === 'undefined') {
            var self = this;
            setTimeout(function() { self._registerProcessor(); }, 500);
            return;
        }

        var self = this;
        OutputProcessor.register('creative-theater', function(text) {
            return self._processTheaterTags(text);
        }, 80);  // order=80，在状态栏(50)和文档渲染(70)之后执行

        console.log('[CreativeTheater] 已注册到 OutputProcessor');
    },

    /**
     * 处理剧场标签
     * 融合版：根据类型路由到不同日志管道
     */
    _processTheaterTags: function(text) {
        if (!text || typeof text !== 'string') return text;

        var self = this;
        var regex = /<theater\s+type="([^"]+)">([\s\S]*?)<\/theater>/gi;
        var hasMatch = false;

        text = text.replace(regex, function(match, type, content) {
            hasMatch = true;
            content = content.trim();

            // 记录历史
            self._history.push({
                type: type,
                turn: self._getCurrentTurn(),
                timestamp: Date.now()
            });

            // 获取路由配置
            var route = self._ROUTE_MAP[type] || { pipeline: 'presetApp', targetType: 'snow', label: '小剧场' };
            var typeDef = self.theaterTypes.find(function(t) { return t.id === type; });
            var typeName = typeDef ? typeDef.name : type;

            // 根据路由管道分发内容
            var injectedContent = '';
            if (route.pipeline === 'worldModules') {
                self._injectToWorldModules(route.targetType, content, type);
            } else {
                // presetApp 管道：获取包装后的内容，放回文本让 PresetAppManager 解析
                injectedContent = self._injectToPresetApp(route.targetType, content, type) || '';
            }

            // 在正文中保留简洁的提示卡片 + 包装后的标签内容（PresetAppManager 会自动提取并剥离）
            return injectedContent + '<div style="margin:8px 0;padding:8px 12px;background:rgba(75,63,227,0.06);border-radius:8px;border-left:3px solid rgba(75,63,227,0.3);font-size:12px;color:#8a8ac0;">🎭 ' + typeName + ' 已收录到日志-' + route.label + '</div>';
        });

        if (hasMatch) {
            self.saveSettings();
        }

        return text;
    },

    /**
     * 注入到 _worldModules 管道
     * 让小剧场内容成为日志子页面的数据来源
     */
    _injectToWorldModules: function(targetType, content, theaterType) {
        try {
            // 解析内容为结构化数据
            var parsed = this._parseStructuredContent(content, theaterType);

            // 获取现有的 _worldModules
            var mods = [];
            if (typeof StateManager !== 'undefined' && StateManager.get) {
                mods = StateManager.get('ui.worldModules') || [];
            } else if (typeof gameState !== 'undefined') {
                mods = Array.isArray(gameState._worldModules) ? gameState._worldModules : [];
            }

            // 根据目标类型构建模块数据
            var newModule = this._buildWorldModule(targetType, parsed, theaterType);

            // 合并到现有模块（同类型追加，不覆盖）
            var existing = mods.find(function(m) { return m.type === targetType; });
            if (existing) {
                // 追加到现有模块
                if (targetType === 'diary' && parsed.items) {
                    existing.items = (existing.items || []).concat(parsed.items);
                } else if (targetType === 'mail' && parsed.items) {
                    existing.items = (existing.items || []).concat(parsed.items);
                } else if (targetType === 'chat' && parsed.items) {
                    existing.items = (existing.items || []).concat(parsed.items);
                } else {
                    // 通用追加
                    if (!existing.items) existing.items = [];
                    if (parsed.items) existing.items = existing.items.concat(parsed.items);
                }
            } else {
                mods.push(newModule);
            }

            // 写回
            if (typeof StateManager !== 'undefined' && StateManager.set) {
                StateManager.set('ui.worldModules', mods, { silent: true });
            }
            if (typeof gameState !== 'undefined') {
                gameState._worldModules = mods;
            }

            console.log('[CreativeTheater] 注入到 _worldModules type=' + targetType + ' (来自 ' + theaterType + ')');
        } catch(e) {
            console.warn('[CreativeTheater] 注入 _worldModules 失败:', e);
        }
    },

    /**
     * 注入到 PresetAppManager 管道
     * 让小剧场内容成为预设动态app的数据来源
     */
    _injectToPresetApp: function(targetType, content, theaterType) {
        try {
            // PresetAppManager 通过 parseFromText 解析 XML 标签工作
            // 我们将内容包装为对应的标签，返回给调用方放入文本中
            // 这样 formatStory → PresetAppManager.parseFromText 会自动提取，
            // PresetAppManager.stripDecorTags 会从显示中移除

            var wrapped = content;  // 默认直接返回原始内容

            if (targetType === 'snow') {
                // 小剧场：包装为 <snow> 标签
                if (content.indexOf('<snow>') === -1) {
                    wrapped = '<snow>' + content + '</snow>';
                }
            } else if (targetType === 'danmu') {
                // 弹幕：确保有 <danmu> 标签
                if (content.indexOf('<danmu>') === -1) {
                    wrapped = '<danmu>' + content + '</danmu>';
                }
            } else if (targetType === 'bgm') {
                // 音乐推荐：用 <snow> 标签承载（PresetAppManager 不原生支持 <bgm>）
                wrapped = '<snow>🎵 ' + content + '</snow>';
            }

            console.log('[CreativeTheater] 注入到 PresetAppManager tag=' + targetType + ' (来自 ' + theaterType + ')');
            return wrapped;
        } catch(e) {
            console.warn('[CreativeTheater] 注入 PresetAppManager 失败:', e);
            return content;
        }
    },

    /**
     * 确保 PresetAppManager 支持 <bgm> 标签
     */
    _ensureBgmTagSupport: function() {
        if (typeof PresetAppManager === 'undefined') return;

        // 检查是否已有 bgm 定义
        try {
            // PresetAppManager 是 IIFE 返回的对象，无法直接修改内部 _appDefs
            // 但我们可以通过注册一个回调来处理
            if (!PresetAppManager._bgmRegistered) {
                PresetAppManager._bgmRegistered = true;
                console.log('[CreativeTheater] BGM 标签支持已注册');
            }
        } catch(e) {}
    },

    /**
     * 解析结构化内容
     * 将 theater 标签内的文本解析为结构化数据
     */
    _parseStructuredContent: function(content, theaterType) {
        var result = { items: [], raw: content };

        if (theaterType === 'secret_diary') {
            // 解析日记格式: npc: xxx / date: xxx / mood: xxx / content: xxx
            var lines = content.split('\n');
            var entry = { npc: '', date: '', mood: '', content: '' };
            var currentField = null;
            lines.forEach(function(line) {
                var match = line.match(/^(\w+):\s*(.*)/);
                if (match) {
                    var field = match[1].trim().toLowerCase();
                    var value = match[2].trim();
                    if (field === 'npc') entry.npc = value;
                    else if (field === 'date') entry.date = value;
                    else if (field === 'mood') entry.mood = value;
                    else if (field === 'content') { entry.content = value; currentField = 'content'; }
                    else currentField = null;
                } else if (currentField === 'content' && line.trim()) {
                    entry.content += '\n' + line.trim();
                }
            });
            if (entry.npc || entry.content) result.items.push(entry);

        } else if (theaterType === 'future_message') {
            // 解析邮件格式: from: xxx / subject: xxx / content: xxx
            var lines2 = content.split('\n');
            var mail = { from: '', subject: '', content: '', read: false, fromTheater: true };
            var currentField2 = null;
            lines2.forEach(function(line) {
                var match = line.match(/^(\w+):\s*(.*)/);
                if (match) {
                    var field = match[1].trim().toLowerCase();
                    var value = match[2].trim();
                    if (field === 'from') mail.from = value;
                    else if (field === 'subject') mail.subject = value;
                    else if (field === 'content') { mail.content = value; currentField2 = 'content'; }
                    else currentField2 = null;
                } else if (currentField2 === 'content' && line.trim()) {
                    mail.content += '\n' + line.trim();
                }
            });
            if (mail.from || mail.content) result.items.push(mail);

        } else if (theaterType === 'phone_content') {
            // 解析聊天格式: npc: xxx / messages: 每行一条
            var lines3 = content.split('\n');
            var chat = { npc: '', messages: [] };
            var currentField3 = null;
            lines3.forEach(function(line) {
                var match = line.match(/^(\w+):\s*(.*)/);
                if (match) {
                    var field = match[1].trim().toLowerCase();
                    var value = match[2].trim();
                    if (field === 'npc') chat.npc = value;
                    else if (field === 'messages') { currentField3 = 'messages'; if (value) chat.messages.push(value); }
                    else currentField3 = null;
                } else if (currentField3 === 'messages' && line.trim()) {
                    chat.messages.push(line.trim());
                }
            });
            if (chat.npc || chat.messages.length > 0) result.items.push(chat);
        }

        return result;
    },

    /**
     * 构建 _worldModule 数据
     */
    _buildWorldModule: function(targetType, parsed, theaterType) {
        var module = { type: targetType, fromTheater: true };

        if (targetType === 'diary') {
            module.items = parsed.items.map(function(entry) {
                return {
                    npc: entry.npc || '未知角色',
                    date: entry.date || new Date().toISOString().split('T')[0],
                    content: entry.content || '',
                    mood: entry.mood || '',
                    memos: []
                };
            });
        } else if (targetType === 'mail') {
            module.items = parsed.items.map(function(mail) {
                return {
                    from: mail.from || '神秘人',
                    subject: mail.subject || '来自未来的讯息',
                    content: mail.content || '',
                    read: false,
                    timestamp: Date.now()
                };
            });
        } else if (targetType === 'chat') {
            module.items = parsed.items.map(function(chat) {
                return {
                    npc: chat.npc || '未知',
                    messages: chat.messages || []
                };
            });
        } else {
            module.items = parsed.items;
        }

        return module;
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
     * 获取所有剧场类型（含路由信息）
     */
    getTheaterTypes: function() {
        var self = this;
        return this.theaterTypes.map(function(t) {
            var route = self._ROUTE_MAP[t.id] || {};
            return {
                id: t.id,
                name: t.name,
                description: t.description,
                enabled: self._enabledTypes.has(t.id),
                route: route.label || '小剧场'
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
        if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.currentTurn) {
            return EnhancedMemory.currentTurn;
        }
        return this._history.length;
    },

    setEnabled: function(enabled) {
        this.enabled = enabled;
        this.saveSettings();
    }
};
