/**
 * 剧情导演系统
 * 灵感来源：打工喵 特别版 v1.2 — 剧情速度三档 / 随机npc生成 / 防全知视角 / 剧情分支思想
 * 设计理念：让故事像有导演在掌机——节奏有呼吸（事件-高潮-冷却-缓冲），
 *           冲突有质量（源自分歧与压力而非狗血），配角有自主性，
 *           视角有边界（认知屏障防全知）。
 *
 * 与现有系统关系：
 *   - 注册 PromptBuilder section，注入节奏与结构规则
 *   - 与 gametime（时间推进）配合：节奏档位决定时间跨度尺度
 *   - 与 ForeshadowChain 配合：节奏加快时优先回收伏笔而非新埋
 *   - 与 meow_FM 摘要配合：剧情速写记录节奏节点
 *
 * 依赖：prompt-builder.js
 * 被依赖：init.js
 */
var PlotDirector = {

    // 总开关
    enabled: true,

    // 节奏档位：'fast'（加快）| 'standard'（适中，默认）| 'slow'（缓慢）
    speed: 'standard',

    // 分项开关
    features: {
        dynamicRhythm: true,      // 动态节奏环
        qualityConflict: true,    // 优质冲突三来源
        npcGeneration: true,      // 随机NPC生成
        antiOmniscient: true      // 防全知视角
    },

    // 节奏档位配置
    _SPEED_CONFIG: {
        fast: {
            label: '加快',
            rules: [
                '高密度推进：每个场景、每次行动与对话都必须带来实质进展——发现新线索、引发新危机、或做出关键决策',
                '严格控制非主线篇幅：日常起居、吃饭、赶路转场、不含关键信息的平淡互动，一律用"几个小时后""几天后"快速概括略过',
                '主线事件之间不留喘息，一波未平一波又起'
            ],
            timeHint: '时间推进积极：单回合可跨越数小时至数日，善用时间跳跃压缩过程'
        },
        standard: {
            label: '适中',
            rules: [
                '遵循"事件发生 → 高潮 → 冷却 → 日常缓冲"的动态节奏：激烈事件或情绪爆发后，安排治愈、反思或温馨的过渡',
                '平淡日常中适时引入外部变量（新人物、意外、消息），避免流水账；日常只作过渡，无需大篇幅'
            ],
            timeHint: '时间推进自然：跟随剧情密度伸缩，过渡场景可概括，核心场景充分展开'
        },
        slow: {
            label: '缓慢',
            rules: [
                '主线、日常、转场、大事件余波享有同等叙事权重，不用概括性词汇做时间跳跃，让时间在笔下自然缓慢流淌',
                '切片式细写：哪怕一次泡茶、一段无目的闲聊、整理装备的繁琐步骤，都通过环境互动、动作拆解和微妙神态丰满成场景',
                '慢节奏下的张力来源：生活习惯与性格差异的摩擦、安静氛围中的深度思想交锋、欲言又止的无声拉扯'
            ],
            timeHint: '时间推进细腻：同一天可以写多回合，重在过程质感而非结果'
        }
    },

    /**
     * 初始化
     */
    init: function() {
        this._loadSettings();
        this._registerSection();
        console.log('[PlotDirector] 剧情导演系统已初始化 (speed=' + this.speed + ', enabled=' + this.enabled + ')');
    },

    /**
     * 加载设置
     */
    loadSettings: function() { return this._loadSettings(); },

    _loadSettings: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.getJSON) {
                var settings = Storage.getJSON('plot_director_settings', null);
                if (settings) {
                    this.enabled = settings.enabled !== false;
                    this.speed = this._SPEED_CONFIG[settings.speed] ? settings.speed : 'standard';
                    if (settings.features) {
                        for (var k in this.features) {
                            if (settings.features.hasOwnProperty(k)) {
                                this.features[k] = !!settings.features[k];
                            }
                        }
                    }
                }
            }
        } catch(e) {
            console.warn('[PlotDirector] 读取设置失败:', e);
        }
    },

    /**
     * 保存设置
     */
    saveSettings: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.setJSON) {
                Storage.setJSON('plot_director_settings', {
                    enabled: this.enabled,
                    speed: this.speed,
                    features: this.features
                });
            }
        } catch(e) {
            console.warn('[PlotDirector] 保存设置失败:', e);
        }
    },

    /**
     * 设置节奏档位
     */
    setSpeed: function(speed) {
        if (this._SPEED_CONFIG[speed]) {
            this.speed = speed;
            this.saveSettings();
        }
    },

    /**
     * 注册 PromptBuilder section
     * 注入位置：narrativeCraft 之后、workflow 之前
     */
    _registerSection: function() {
        if (typeof PromptBuilder === 'undefined') {
            var self = this;
            setTimeout(function() { self._registerSection(); }, 500);
            return;
        }

        var self = this;
        PromptBuilder.registerSection('plotDirector', function(ctx) {
            return self.buildPrompt(ctx);
        }, { order: 55 });
    },

    /**
     * 构建剧情导演提示词
     */
    buildPrompt: function(ctx) {
        if (!this.enabled) return '';

        var f = this.features;
        var speedCfg = this._SPEED_CONFIG[this.speed] || this._SPEED_CONFIG.standard;
        var parts = [];
        parts.push('【剧情导演系统】（当前节奏档位：' + speedCfg.label + '）');

        // 一、节奏档位规则
        parts.push('');
        parts.push('一、节奏控制（按当前档位执行）');
        for (var i = 0; i < speedCfg.rules.length; i++) {
            parts.push('- ' + speedCfg.rules[i]);
        }
        parts.push('- 时间推进提示：' + speedCfg.timeHint);

        // 二、动态节奏环（所有档位通用）
        if (f.dynamicRhythm) {
            parts.push('');
            parts.push('二、动态节奏环');
            parts.push('- 故事不局限于一组角色的对话：主动引入多元情节元素——轻松日常插曲、深沉的脆弱时刻、推进主线的任务与探索、不可抗力的突发意外（环境突变、突发危机、NPC介入）');
            parts.push('- 逻辑连贯：所有事件的发生、转折与结束必须有严密的因果链（A导致B），拒绝毫无铺垫的空降事件');
            parts.push('- 给角色留出消化事件和产生情绪反应的时间，情绪转变有过程');
        }

        // 三、优质冲突
        if (f.qualityConflict) {
            parts.push('');
            parts.push('三、优质冲突三来源（禁止低级情感套路）');
            parts.push('- 禁止用误会、巧合、无理取闹强行制造冲突');
            parts.push('- 优质戏剧冲突只源于：①面对危机/突发事件时的策略与理念分歧；②外部环境或敌人带来的生存压力与阻碍；③角色面对自身过往创伤的真实应激反应');
        }

        // 四、随机NPC生成
        if (f.npcGeneration) {
            parts.push('');
            parts.push('四、配角生态（随机NPC生成）');
            parts.push('- 避免剧情大部分时间只有主角与固定角色互动，在合适的时机自然引入新NPC丰富情节');
            parts.push('- NPC是独立自主的角色，不是工具人/背景板：为新NPC写姓名、外貌、背景，使其自然成为故事的一环');
            parts.push('- NPC在场时必须参与核心场景——根据其性格描写与角色的互动和自主行动（语言、动作、微动作），NPC也可以推动剧情');
            parts.push('- 无需在正文中说明"这是NPC"，让其作为故事中自然出现的角色存在；NPC可以是正面、负面或路人');
            parts.push('- 记得将新NPC写入 characters 字段，命名遵循全局命名规则');
        }

        // 五、防全知视角
        if (f.antiOmniscient) {
            parts.push('');
            parts.push('五、认知屏障（防全知视角）');
            parts.push('- 所有角色不得脱离自身视角的局限性，只知晓【当下场景内】的动作、表情、语言，以及其亲身经历过/被告知过的信息');
            parts.push('- 角色不会无端知道其他角色的秘密与处境（例：甲让乙去找丙，丙不知道乙为何而来）');
            parts.push('- 角色昏迷、沉睡、离场时，无法感知当下发生的任何事情');
            parts.push('- 状态栏（characters/player等字段）同样禁止上帝视角：只呈现各角色视角内可知的信息');
        }

        return parts.join('\n');
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = PlotDirector;
