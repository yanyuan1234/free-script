// ========================================
// 预设融合模块单元测试
// 活体角色引擎 (living-character.js)
// 叙事质感引擎 (narrative-craft.js)
// 剧情导演系统 (plot-director.js)
// Run: node tests/modules/preset-fusion.test.js
// ========================================
global.PromptBuilder = require('../../js/ai-contract/prompt-builder.js');
var LivingCharacter = require('../../js/modules/living-character.js');
var NarrativeCraft = require('../../js/modules/narrative-craft.js');
var PlotDirector = require('../../js/modules/plot-director.js');

function assertTrue(v, msg) {
    if (!v) throw new Error('FAIL: ' + msg);
}

function assertContains(text, needle, msg) {
    if (text.indexOf(needle) === -1) {
        throw new Error('FAIL ' + msg + ': missing "' + needle + '"');
    }
}

function assertNotContains(text, needle, msg) {
    if (text.indexOf(needle) !== -1) {
        throw new Error('FAIL ' + msg + ': should not contain "' + needle + '"');
    }
}

// ---- 测试 1：模块结构与默认配置 ----
assertTrue(typeof LivingCharacter === 'object', 'LivingCharacter 模块加载');
assertTrue(typeof NarrativeCraft === 'object', 'NarrativeCraft 模块加载');
assertTrue(typeof PlotDirector === 'object', 'PlotDirector 模块加载');
assertTrue(LivingCharacter.enabled === true, 'LivingCharacter 默认启用');
assertTrue(NarrativeCraft.enabled === true, 'NarrativeCraft 默认启用');
assertTrue(PlotDirector.enabled === true, 'PlotDirector 默认启用');
assertTrue(PlotDirector.speed === 'standard', 'PlotDirector 默认节奏为适中');
assertTrue(typeof LivingCharacter.init === 'function', 'init 方法存在');
assertTrue(typeof LivingCharacter.saveSettings === 'function', 'saveSettings 方法存在');

// ---- 测试 2：init 注册 section ----
LivingCharacter.init();
NarrativeCraft.init();
PlotDirector.init();
assertTrue(!!PromptBuilder._sections.livingCharacter, 'livingCharacter section 已注册');
assertTrue(!!PromptBuilder._sections.narrativeCraft, 'narrativeCraft section 已注册');
assertTrue(!!PromptBuilder._sections.plotDirector, 'plotDirector section 已注册');

// ---- 测试 3：buildPrompt 内容覆盖（活体角色） ----
var lcPrompt = LivingCharacter.buildPrompt({});
assertContains(lcPrompt, '动态成长', '动态成长规则');
assertContains(lcPrompt, '骨相锁定', '骨相锁定规则');
assertContains(lcPrompt, '理性', '理性人设渲染');
assertContains(lcPrompt, '在乎、感到受伤、害怕失去', '亲密情感映射核心');
assertContains(lcPrompt, '独立生活', '角色独立生活');
assertContains(lcPrompt, '筹码', '去机器人词汇');

// ---- 测试 4：buildPrompt 内容覆盖（叙事质感） ----
var ncPrompt = NarrativeCraft.buildPrompt({});
assertContains(ncPrompt, '自由间接引语', '自由间接引语');
assertContains(ncPrompt, '比喻纪律', '比喻纪律');
assertContains(ncPrompt, '套路生理化侧写', '禁止套路生理化');
assertContains(ncPrompt, '镜头移开', '替代方案B');
assertContains(ncPrompt, '词汇句式微雕', '词汇句式微雕');
assertContains(ncPrompt, '动机极简', '防旁白过度解读');
assertContains(ncPrompt, '防抢话', '防抢话');
assertContains(ncPrompt, '防转述', '防转述');
assertContains(ncPrompt, '防重复', '防重复');
assertContains(ncPrompt, '收尾规则', '收尾规则');

// ---- 测试 5：buildPrompt 内容覆盖（剧情导演三档） ----
var pdStandard = PlotDirector.buildPrompt({});
assertContains(pdStandard, '当前节奏档位：适中', '默认适中档');
assertContains(pdStandard, '冷却', '动态节奏环');
assertContains(pdStandard, '优质冲突三来源', '冲突三来源');
assertContains(pdStandard, '配角生态', 'NPC生态');
assertContains(pdStandard, '认知屏障', '防全知视角');

PlotDirector.setSpeed('fast');
var pdFast = PlotDirector.buildPrompt({});
assertContains(pdFast, '当前节奏档位：加快', '加快档标记');
assertContains(pdFast, '高密度推进', '加快档规则');
assertNotContains(pdFast, '切片式细写', '加快档不应含慢档规则');

PlotDirector.setSpeed('slow');
var pdSlow = PlotDirector.buildPrompt({});
assertContains(pdSlow, '当前节奏档位：缓慢', '缓慢档标记');
assertContains(pdSlow, '切片式细写', '缓慢档规则');
assertNotContains(pdSlow, '高密度推进', '缓慢档不应含快档规则');

// 非法档位容错：拒绝非法值，保持原档位不变
PlotDirector.setSpeed('invalid-speed');
assertTrue(PlotDirector.speed === 'slow', '非法档位被拒绝，保持原档位 slow');
PlotDirector.setSpeed('standard');

// ---- 测试 6：分项开关 ----
LivingCharacter.features.intimacyMapping = false;
assertNotContains(LivingCharacter.buildPrompt({}), '亲密关系情感映射', '关闭亲密映射后不注入');
LivingCharacter.features.intimacyMapping = true;
assertContains(LivingCharacter.buildPrompt({}), '亲密关系情感映射', '重新开启后恢复注入');

NarrativeCraft.features.metaphorRules = false;
assertNotContains(NarrativeCraft.buildPrompt({}), '比喻纪律', '关闭比喻规则后不注入');
NarrativeCraft.features.metaphorRules = true;

PlotDirector.features.antiOmniscient = false;
assertNotContains(PlotDirector.buildPrompt({}), '认知屏障', '关闭防全知后不注入');
PlotDirector.features.antiOmniscient = true;

// ---- 测试 7：总开关 ----
LivingCharacter.enabled = false;
NarrativeCraft.enabled = false;
PlotDirector.enabled = false;
assertTrue(LivingCharacter.buildPrompt({}) === '', 'LC 总开关关闭返回空');
assertTrue(NarrativeCraft.buildPrompt({}) === '', 'NC 总开关关闭返回空');
assertTrue(PlotDirector.buildPrompt({}) === '', 'PD 总开关关闭返回空');
LivingCharacter.enabled = true;
NarrativeCraft.enabled = true;
PlotDirector.enabled = true;

// ---- 测试 8：完整 system prompt 中按 order 拼装 ----
var full = PromptBuilder.buildSystemPrompt({ setupText: '测试世界' });
var iLC = full.indexOf('【角色塑造·活体引擎】');
var iNC = full.indexOf('【叙事质感·写作铁律】');
var iPD = full.indexOf('【剧情导演系统】');
assertTrue(iLC > 0 && iNC > iLC && iPD > iNC, '三模块注入且顺序正确（活体→质感→导演）');
// 注入位置应位于状态区之后（state order 40 < 45）
var iState = full.indexOf('【当前状态】');
assertTrue(iState === -1 || iState < iLC, '活体引擎在状态区之后');

console.log('Preset fusion modules tests passed');
