// ========================================
// PromptBuilder 单元测试
// Run: node tests/ai-contract/prompt-builder.test.js
// ========================================
var PromptBuilder = require('../../js/ai-contract/prompt-builder.js');

function assertTrue(v, msg) {
    if (!v) throw new Error(msg);
}

function assertContains(text, needle, msg) {
    if (text.indexOf(needle) === -1) {
        throw new Error(msg + ': missing ' + needle + ' in ' + text.slice(0, 200));
    }
}

// 测试 1：默认片段存在
var sections = PromptBuilder.listSections();
assertTrue(sections.length >= 5, 'has default sections');

// 测试 2：JSON 模式构建 prompt
PromptBuilder.setMode('json');
var ctx = {
    setupText: '这是一个修仙世界。',
    player: { name: '陈墨', identity: '外门弟子' },
    memoryText: '你拥有一把铁剑。',
    gameTime: { date: '第1日', time: '清晨', period: '清晨' },
    maxTokens: 2048
};
var prompt = PromptBuilder.buildSystemPrompt(ctx);
assertContains(prompt, '互动叙事引擎', 'identity section');
assertContains(prompt, '修仙世界', 'world section');
assertContains(prompt, '陈墨', 'protagonist section');
assertContains(prompt, '铁剑', 'state section');
assertContains(prompt, 'JSON模式', 'format section');
assertContains(prompt, '第1日', 'gametime section');

// 测试 3：纯文本模式
PromptBuilder.setMode('pureText');
var pure = PromptBuilder.buildSystemPrompt({ setupText: 'x' });
assertContains(pure, '纯文本模式', 'pure text mode');
assertContains(pure, '<mem>', 'mem tag hint');

// 测试 4：注册自定义片段
PromptBuilder.setMode('json');
PromptBuilder.registerSection('custom', function(ctx) { return 'CUSTOM:' + ctx.val; }, { order: 5 });
var withCustom = PromptBuilder.buildSystemPrompt({ val: 'hello' });
assertContains(withCustom, 'CUSTOM:hello', 'custom section');

// 测试 5：user prompt
var up = PromptBuilder.buildUserPrompt('前进');
assertTrue(up === '前进', 'user prompt');

// 测试 6：formatRules 覆盖
var override = PromptBuilder.buildSystemPrompt({ formatRules: 'OVERRIDE RULES' });
assertContains(override, 'OVERRIDE RULES', 'format rules override');

console.log('PromptBuilder tests passed');
