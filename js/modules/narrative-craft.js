/**
 * 叙事质感引擎
 * 灵感来源：【恒·序】v1.95 by 噤蝉若寒 — 自由间接引语 / 陈腐比喻禁令 / 禁止套路生理化侧写 /
 *           词汇句式微雕 / 防旁白过度解读 / 反凑字数熔断 / 防抢话 / 防转述 / 防重复
 * 设计理念：把"优秀中文写作"的判断标准编码为可执行的叙事规则——
 *           不堆形容词，用具体的物象、动作链和感官细节传递情绪；
 *           叙述者隐形，贴近人物；每一句描写都必须提供实质价值。
 *
 * 与现有系统关系：
 *   - 注册 PromptBuilder section，注入文笔质量规则
 *   - 与 builtin-regex-rules.js 互补：正则负责"事后清除"陈词，本模块负责"事前禁止"生成
 *   - 与 wordCountAnchor 配合：字数要求靠展开有效描写达成，而非注水
 *
 * 依赖：prompt-builder.js
 * 被依赖：init.js
 */
var NarrativeCraft = {

    // 总开关
    enabled: true,

    // 分项开关
    features: {
        freeIndirectSpeech: true,  // 自由间接引语
        metaphorRules: true,       // 陈腐比喻禁令 + 替换策略
        antiPhysioCliche: true,    // 禁止套路生理化侧写
        microCarving: true,        // 词汇句式微雕
        antiOverinterpret: true,   // 防旁白过度解读（动机极简）
        antiPadding: true,         // 反凑字数熔断
        paragraphRhythm: true,     // 段落节奏
        antiSteal: true,           // 防抢话 + 防转述 + 防重复
        endingRule: true           // 收尾规则（NPC动作收尾）
    },

    /**
     * 初始化
     */
    init: function() {
        this._loadSettings();
        this._registerSection();
        console.log('[NarrativeCraft] 叙事质感引擎已初始化 (enabled=' + this.enabled + ')');
    },

    /**
     * 加载设置
     */
    _loadSettings: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.getJSON) {
                var settings = Storage.getJSON('narrative_craft_settings', null);
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
            console.warn('[NarrativeCraft] 读取设置失败:', e);
        }
    },

    /**
     * 保存设置
     */
    saveSettings: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.setJSON) {
                Storage.setJSON('narrative_craft_settings', {
                    enabled: this.enabled,
                    features: this.features
                });
            }
        } catch(e) {
            console.warn('[NarrativeCraft] 保存设置失败:', e);
        }
    },

    /**
     * 注册 PromptBuilder section
     * 注入位置：narrative（预设增强）之后、workflow 之前
     */
    _registerSection: function() {
        if (typeof PromptBuilder === 'undefined') {
            var self = this;
            setTimeout(function() { self._registerSection(); }, 500);
            return;
        }

        var self = this;
        PromptBuilder.registerSection('narrativeCraft', function(ctx) {
            return self.buildPrompt(ctx);
        }, { order: 52 });
    },

    /**
     * 构建叙事质感提示词
     * 【设计理念】规则 + 替换策略示例——告诉AI"不要什么"的同时给出"要什么"，
     * 示例仅作手法演示，题材与内容完全由世界观决定
     */
    buildPrompt: function(ctx) {
        if (!this.enabled) return '';

        var f = this.features;
        var parts = [];
        parts.push('【叙事质感·写作铁律】');
        parts.push('以下规则决定成文品质，优先级仅次于格式要求：');

        if (f.freeIndirectSpeech) {
            parts.push('');
            parts.push('一、自由间接引语（默认叙事方式）');
            parts.push('- 将角色的心理活动、主观看法、思考感受直接融入叙述，删掉"他想""他觉得""他意识到"这类引导语');
            parts.push('- 叙述者隐形，视角贴近人物，但区分于第一人称');
            parts.push('  示例手法：不写"他感到绝望"，写"雨停了。他盯着檐角悬着的水珠，仰头看了很久，等那唯一可笃定的事情落下来。"');
        }

        if (f.metaphorRules) {
            parts.push('');
            parts.push('二、比喻纪律');
            parts.push('- 禁用烂大街的比喻：一拳打在棉花上、理智的弦断裂、如遭雷击、冰水浇下、投入湖中的石子、羽毛般轻、风箱般的呼吸、野兽般的眼睛、针扎般刺痛……（包括一切变体表达）');
            parts.push('- 少明喻，多暗喻；非要用比喻时必须新颖，否则不配炫技');
            parts.push('- 比喻升级思路：①错位——用反差联想制造陌生化；②喻体大胆跳跃——相信再新奇的喻体也能传递共鸣；③调动多感官——不止视觉，还有听嗅味触甚至错觉');
            parts.push('  示例手法：风灌进裤管，像一群白鸽扑打着小腿。');
        }

        if (f.antiPhysioCliche) {
            parts.push('');
            parts.push('三、禁止套路生理化侧写');
            parts.push('- 禁止用声线质感传递情绪、用"猛然一僵/身体一颤"传递震惊、用"指节泛白"传递用力、用"瞳孔微缩/深邃"传递深沉、用"胸口像塞了棉花"传递难受……这些全是陈腐套路的变体');
            parts.push('- 替代方案A·言之有物：直接写角色感受到了什么、想起了什么、有多少说出口了。允许真实的生理反应（心痛、流泪、喘不上气、手脚发软、恶心冒汗），但必须是具体的，而非疏离的抽象比喻');
            parts.push('- 替代方案B·镜头移开：把镜头从脸上挪开，去写——');
            parts.push('  · 视线与手上的小动作：扇子摇着摇着停了；一件东西被拿了又放下；火柴划了两次没着；茶倒得太满溢出杯沿；东西放歪了');
            parts.push('  · 平时不会被注意的声音/光线/物品：楼下谁家的狗突然吠了一声；风把落叶和尘土卷在一起慌忙逃窜；桌腿下压着一根头发');
            parts.push('  · 做事情态：他低头掰那颗花生，红衣剥落，没声儿铺了一桌；他把皱巴巴的收据摊平，又卷成细细的纸筒');
        }

        if (f.microCarving) {
            parts.push('');
            parts.push('四、词汇句式微雕');
            parts.push('- 正文少用"这/那"等虚浮代词作为句首字，用具体名词替代');
            parts.push('- 少用"那是/这是/像是在/不是…而是"等解释定义句式——信任读者的理解力，直接呈现');
            parts.push('- 不写"没有说话/没有动/并没有笑"这类否定式反衬，直接写"他说了什么/做了什么"');
            parts.push('- 防句号增殖：不用连续短句堆砌制造虚假节奏感');
        }

        if (f.antiOverinterpret) {
            parts.push('');
            parts.push('五、动机极简（防旁白过度解读）');
            parts.push('- 严禁旁白充当"情感分析师"：保护就是保护，担忧就是担忧，禁止升华为"掌控欲""占有欲""狩猎姿态""病态偏执"等宏大做作的解读');
            parts.push('- 所有情感波动通过动作、神态客观呈现，而非旁白的抽象大词');
            parts.push('- 杜绝说教式总结与道德升华，把判断留给读者');
        }

        if (f.antiPadding) {
            parts.push('');
            parts.push('六、反凑字数熔断（每句描写必须有效）');
            parts.push('- 景物描写必须映衬人物情感或渲染氛围，禁止无休止复读同一处环境/天气');
            parts.push('- 动作与神态描写必须推动剧情或折射心理潜台词，禁止对无关动作做慢镜头拆解');
            parts.push('- 心理描写禁止自言自语式脑补注水；字数要求靠展开有效场景达成，而非稀释信息密度');
        }

        if (f.paragraphRhythm) {
            parts.push('');
            parts.push('七、段落节奏');
            parts.push('- 段落长度变化丰富，长段短段皆有且彼此穿插，严禁连续的零碎短段落');
            parts.push('- 对话与叙述交替，避免大段无对话的独白或大段无叙述的对话连排');
        }

        if (f.antiSteal) {
            parts.push('');
            parts.push('八、防抢话 · 防转述 · 防重复');
            parts.push('- 防抢话：禁止替主角做决定、新增主角未说过的发言、虚构主角的行动（主角只属于玩家）');
            parts.push('- 防转述：正文第一句必须发生在玩家输入最后一个动作结束的下一秒，严禁把玩家输入同义替换地复读一遍再往下写');
            parts.push('- 防重复：同一件事、同一个刺激，角色不应每次都有一模一样的反应（不能每次生气都炸毛、每次惊讶都瞪眼）——检查前文，已写过的互动与描写不再复刻');
        }

        if (f.endingRule) {
            parts.push('');
            parts.push('九、收尾规则');
            parts.push('- 回合结尾禁止落在主角的反应或心理上，必须落在某个NPC的具体动作、一句台词、或一个未尽张力的画面上');
            parts.push('- 禁止陈词式收尾（总结陈词、展望未来的套话、点题升华），用留白把回应权交还给玩家');
        }

        return parts.join('\n');
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = NarrativeCraft;
