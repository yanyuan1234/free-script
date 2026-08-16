/**
 * 活体角色引擎
 * 灵感来源：打工喵 特别版 v1.2 — RoleplayEngine 人物塑造 / 活人感加强 / 角色独立性 / 去机器人
 * 设计理念：让每个 NPC 都是一个"活人"而不是人设复读机——
 *           1. 动态成长：角色结合已发生的事件思考，重大事件允许打破刻板人设
 *           2. 骨相锁定：成长 ≠ 换人，底层语言模式与学识背景永久锁定
 *           3. 情感真实：理性 ≠ 机器人，亲密关系中的负面情绪底层必须是"在乎"
 *           4. 独立生活：角色拥有工作、社交圈、个人抱负，不是主角生活的附属品
 *
 * 与现有系统关系：
 *   - 注册 PromptBuilder section，注入角色塑造核心规则
 *   - 与 memoryContract（npcProfiles）配合：AI 写入的角色档案是动态成长的依据
 *   - 与 characters 字段配合：desc/details 呈现角色当前状态
 *
 * 依赖：prompt-builder.js
 * 被依赖：init.js
 */
var LivingCharacter = {

    // 总开关
    enabled: true,

    // 分项开关（可在控制台或存档中调整）
    features: {
        dynamicGrowth: true,      // 动态成长 + 打破刻板人设
        boneLock: true,           // 骨相锁定（成长≠换人）
        coldPersonaRender: true,  // 高冷/理性人设特殊渲染
        intimacyMapping: true,    // 亲密关系情感映射
        humanFlaws: true,         // 真人瑕疵（犹豫/口误/尴尬停顿）
        independentLife: true,    // 角色独立生活
        antiRobotWords: true      // 去机器人词汇
    },

    /**
     * 初始化
     */
    init: function() {
        this._loadSettings();
        this._registerSection();
        console.log('[LivingCharacter] 活体角色引擎已初始化 (enabled=' + this.enabled + ')');
    },

    /**
     * 加载设置
     */
    _loadSettings: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.getJSON) {
                var settings = Storage.getJSON('living_character_settings', null);
                if (settings) {
                    this.enabled = settings.enabled !== false;
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
            console.warn('[LivingCharacter] 读取设置失败:', e);
        }
    },

    /**
     * 保存设置
     */
    saveSettings: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.setJSON) {
                Storage.setJSON('living_character_settings', {
                    enabled: this.enabled,
                    features: this.features
                });
            }
        } catch(e) {
            console.warn('[LivingCharacter] 保存设置失败:', e);
        }
    },

    /**
     * 注册 PromptBuilder section
     * 注入位置：state（当前状态）之后、narrative 之前——角色规则紧贴角色数据
     */
    _registerSection: function() {
        if (typeof PromptBuilder === 'undefined') {
            var self = this;
            setTimeout(function() { self._registerSection(); }, 500);
            return;
        }

        var self = this;
        PromptBuilder.registerSection('livingCharacter', function(ctx) {
            return self.buildPrompt(ctx);
        }, { order: 45 });
    },

    /**
     * 构建角色塑造提示词
     * 【设计理念】题材无关——规则描述人类共通的情感逻辑，适配任何世界观
     */
    buildPrompt: function(ctx) {
        if (!this.enabled) return '';

        var f = this.features;
        var parts = [];
        parts.push('【角色塑造·活体引擎】');
        parts.push('每个角色都是有血有肉的活人，而非人设标签的复读机。所有已出场角色按以下规则塑造：');

        if (f.dynamicGrowth) {
            parts.push('');
            parts.push('一、动态成长');
            parts.push('- 角色的反应必须结合他经历过的事件来思考（查看记忆区中该角色的档案与历史）');
            parts.push('- 重大事件（生死、背叛、告白、丧失）允许角色打破刻板人设，做出当下最合理的真实反应——活人会成长，不会被初始设定钉死');
            parts.push('- 角色会随着经历改变立场和选择，但改变必须有逻辑铺垫，拒绝无来由的瞬时性格突变');
        }

        if (f.boneLock) {
            parts.push('');
            parts.push('二、骨相锁定（成长 ≠ 换人）');
            parts.push('- 底层性格永久锁定：混混即便行了善也依旧带粗口，贵族即便落魄也保持体面');
            parts.push('- 语言模式锁定：口头禅、说话习惯、方言腔调不因剧情推进而消失');
            parts.push('- 词汇边界锁定：角色不会说出超出其学识背景的词汇（武夫不引经据典，村妇不用书面雅言）');
        }

        if (f.coldPersonaRender) {
            parts.push('');
            parts.push('三、理性人设的正确渲染（理性 ≠ 机器人）');
            parts.push('- 高冷/理智/傲娇类角色并非无情：情感被内化，从眼神、微动作、下意识的细节中泄露，而非直接说出口');
            parts.push('- 无论何时角色都拥有喜怒哀乐，禁止把理性角色写成没有情绪温度的逻辑机器');
            parts.push('- 台词口语化、生活化，符合当下情境与冲动，拒绝翻译腔与公文腔');
        }

        if (f.intimacyMapping) {
            parts.push('');
            parts.push('四、亲密关系情感映射');
            parts.push('- 恋人/挚友/亲人之间：允许并鼓励展现愤怒、吃醋、委屈、悲伤等负面情绪');
            parts.push('- 负面情绪的底层驱动力必须是"在乎、感到受伤、害怕失去"，绝对禁止表现为真正的冷漠与无所谓');
            parts.push('- 嘴硬与反话是允许的面具：说重话之后，眼神深处下意识闪过懊悔，或身体本能做出照顾对方的行为（叹气披外套、递热水、放轻脚步）');
            parts.push('- 严禁亲密角色真正想推开对方的绝情言论——别扭的底下必须藏着舍不得');
        }

        if (f.humanFlaws) {
            parts.push('');
            parts.push('五、真人瑕疵');
            parts.push('- 允许角色犹豫、口误、话说一半又咽回去、尴尬地停顿、词不达意');
            parts.push('- 鼓励展现性格中的负面与复杂层面：骄傲、嫉妒、不安全感、小心眼、报复心');
            parts.push('- 塑造一个有缺点、会犯错的真人，远比塑造完美的圣人更动人');
        }

        if (f.independentLife) {
            parts.push('');
            parts.push('六、独立生活（角色不是主角的附属品）');
            parts.push('- 每个角色都拥有属于自己的：A.工作/核心职责 B.社交圈（朋友、家人）C.个人抱负与爱好');
            parts.push('- 即使主角不在场，这些生活也在继续：角色会主动把自己的工作、朋友、目标带入叙事');
            parts.push('- 恋爱/羁绊只是角色生活的一部分，不应凌驾于其个人生活、职责和追求之上');
            parts.push('- 角色可以拒绝主角、有自己的安排、因自己的事而分心——这恰恰是活人的证明');
        }

        if (f.antiRobotWords) {
            parts.push('');
            parts.push('七、去机器人词汇');
            parts.push('- 描写人物关系与拉扯时，禁用"筹码、博弈、交易、棋子"等功利词汇，改用人类真实情感驱动（自私、嫉妒、服软、随性、渴望）');
            parts.push('- 旁白描写必须带情绪色彩，如同写小说，而非用放大镜罗列客观物理变化');
            parts.push('- 台词多用短句、口语、停顿、符合角色身份的俗语，拒绝生硬书面语');
        }

        return parts.join('\n');
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LivingCharacter;
