/**
 * 四步思维链推理框架
 * 灵感来源：打工喵 特别版 v1.2
 * 设计理念：引导AI按"场景分析→剧情规划→内容生成→质量自检"四步思考，
 *           提升生成逻辑性和一致性，减少跑题和逻辑漏洞。
 *           通过 PromptBuilder 的 section 系统注入，不修改核心流程。
 *
 * 依赖：prompt-builder.js
 * 被依赖：init.js (初始化调用)
 */
var COTFramework = {

    // 是否启用思维链框架
    enabled: true,

    // 用户可配置的思考深度
    // 'brief': 简要思考（节省token）
    // 'standard': 标准思考（推荐）
    // 'deep': 深度思考（消耗更多token，适合关键剧情）
    depth: 'standard',

    // 思考深度配置
    _DEPTH_CONFIG: {
        brief: {
            analyzeLines: 1,
            planLines: 1,
            checkLines: 1,
            injectToReasoning: true
        },
        standard: {
            analyzeLines: 2,
            planLines: 2,
            checkLines: 2,
            injectToReasoning: true
        },
        deep: {
            analyzeLines: 3,
            planLines: 3,
            checkLines: 3,
            injectToReasoning: true
        }
    },

    /**
     * 初始化：注册 PromptBuilder section
     */
    init: function() {
        this._loadSettings();
        this._registerSection();
        console.log('[COTFramework] 思维链框架已注册 (depth=' + this.depth + ')');
    },

    /**
     * 加载用户设置
     */
    _loadSettings: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.getJSON) {
                var settings = Storage.getJSON('cot_framework_settings', null);
                if (settings) {
                    this.enabled = settings.enabled !== false;
                    this.depth = settings.depth || 'standard';
                }
            }
        } catch(e) {
            console.warn('[COTFramework] 读取设置失败:', e);
        }
    },

    /**
     * 保存用户设置
     */
    saveSettings: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.setJSON) {
                Storage.setJSON('cot_framework_settings', {
                    enabled: this.enabled,
                    depth: this.depth
                });
            }
        } catch(e) {
            console.warn('[COTFramework] 保存设置失败:', e);
        }
    },

    /**
     * 注册到 PromptBuilder
     * 在 workflow 和 format 之间注入思维链引导
     */
    _registerSection: function() {
        if (typeof PromptBuilder === 'undefined') {
            console.warn('[COTFramework] PromptBuilder 未加载，延迟注册');
            var self = this;
            setTimeout(function() { self._registerSection(); }, 500);
            return;
        }

        var self = this;
        PromptBuilder.registerSection('cotFramework', function(ctx) {
            if (!self.enabled) return '';

            var config = self._DEPTH_CONFIG[self.depth] || self._DEPTH_CONFIG.standard;
            var pureText = ctx.pureTextMode || PromptBuilder._mode === 'pureText';

            var parts = [];
            parts.push('【思维链框架·四步推理】');
            parts.push('在输出正文前，请按以下四步进行思考（思考过程通过API原生reasoning_content输出，不要写入正文）：');
            parts.push('');

            // 第一步：场景分析
            parts.push('第一步·场景分析（' + config.analyzeLines + '-' + (config.analyzeLines + 1) + '句）');
            parts.push('- 当前场景的核心冲突是什么？');
            parts.push('- 涉及哪些角色？他们的当前位置、情绪、关系状态？');
            parts.push('- 环境有什么需要注意的细节（时间、天气、氛围）？');
            parts.push('');

            // 第二步：剧情规划
            parts.push('第二步·剧情规划（' + config.planLines + '-' + (config.planLines + 1) + '句）');
            parts.push('- 本回合要推进哪些剧情线？主线/支线/伏笔？');
            parts.push('- 玩家的输入意图是什么？如何回应才既合理又有惊喜？');
            parts.push('- 是否需要埋设新伏笔或回收旧伏笔？（检查已有伏笔列表）');
            parts.push('');

            // 第三步：内容生成
            parts.push('第三步·内容生成');
            parts.push('- 根据规划撰写正文，注意：场景描写、人物动作、对话、心理活动都要具体');
            parts.push('- 保持叙事视角一致，对话用「」包裹');
            parts.push('- 控制篇幅，确保达到字数要求');
            parts.push('');

            // 第四步：质量自检
            parts.push('第四步·质量自检（' + config.checkLines + '-' + (config.checkLines + 1) + '句）');
            parts.push('- 逻辑检查：角色行为是否符合其性格？时间线是否连贯？');
            parts.push('- 伏笔检查：是否提到了未解决的伏笔？是否需要提醒？');
            parts.push('- 文风检查：是否有AI陈词？是否重复了上一回合的描写？');
            parts.push('- 状态检查：' + (pureText ? 'state块是否完整？' : 'JSON各字段是否正确？'));
            parts.push('');

            parts.push('【重要】思考过程是你的创作内功，不要在正文中体现思考步骤。玩家看到的应该是流畅的叙事，而非分析过程。');

            return parts.join('\n');
        }, { order: 55 }); // 在 workflow(60) 之前，format(70) 之前
    },

    /**
     * 设置思考深度
     */
    setDepth: function(depth) {
        if (this._DEPTH_CONFIG[depth]) {
            this.depth = depth;
            this.saveSettings();
            return true;
        }
        return false;
    },

    /**
     * 开启/关闭
     */
    setEnabled: function(enabled) {
        this.enabled = enabled;
        this.saveSettings();
    },

    /**
     * 获取当前配置信息
     */
    getInfo: function() {
        return {
            enabled: this.enabled,
            depth: this.depth,
            depthOptions: Object.keys(this._DEPTH_CONFIG)
        };
    }
};
