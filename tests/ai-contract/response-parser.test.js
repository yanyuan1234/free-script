// ========================================
// ResponseParser 单元测试
// Run: node tests/ai-contract/response-parser.test.js
// ========================================
global.AIOutputSchema = require('../../js/ai-contract/schemas/ai-output-schema.js');
global.OutputSanitizer = require('../../js/ai-contract/output-sanitizer.js');
var ResponseParser = require('../../js/ai-contract/response-parser.js');

function assertEq(a, b, msg) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        throw new Error(msg + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
    }
}

var direct = ResponseParser.parse('{"story":"hello","title":"第一章"}');
assertEq(direct.success, true, 'direct success');
assertEq(direct.fallbackLevel, 0, 'direct level');
assertEq(direct.storyText, 'hello', 'direct story');

var wrapped = ResponseParser.parse('"{\\"story\\":\\"wrapped\\"}"');
assertEq(wrapped.success, true, 'wrapped success');
assertEq(wrapped.storyText, 'wrapped', 'wrapped story');

var codeBlock = ResponseParser.parse('```json\n{"story":"cb"}\n```');
assertEq(codeBlock.success, true, 'code block success');
assertEq(codeBlock.fallbackLevel, 1, 'code block level');

var mem = ResponseParser.parse('<mem type="item" name="刀" qty="1" action="add"/>你捡到一把刀。');
assertEq(mem.success, true, 'mem success');
assertEq(mem.mems.length, 1, 'mem count');
assertEq(mem.mems[0].name, '刀', 'mem name');

var plain = ResponseParser.parse('hello world');
// 【NEW-008 修复后】纯文本兜底不算"解析成功"，success=false 让上层走 legacy 提取路径
assertEq(plain.success, false, 'plain success=false (intentional, NEW-008 fix)');
assertEq(plain.fallbackLevel, 4, 'plain level');

// BUG：裸推理前缀（无标签）+ JSON，应正确解析 JSON 并丢弃前缀
var bareThinking = ResponseParser.parse('我需要考虑下一步。\n\n{"story":"hello","title":"第一章"}');
assertEq(bareThinking.success, true, 'bare thinking then json success');
assertEq(bareThinking.storyText, 'hello', 'bare thinking then json story');
assertEq(bareThinking.data.title, '第一章', 'bare thinking then json title');

// BUG-A2：模型把设计思路写入 JSON 的 story 字段，解析后应清洗为叙事正文
var leakedJson = '{"story":"用户现在需要开始修仙养成的开局，首先得符合被退婚的废材。\\n\\n然后开局的场景：林墨在杂役院的破屋里醒来，手里攥着退婚文书。\\n\\n林墨深吸一口气，系统的提示音在脑海中响起。","title":"第一章","choices":[{"id":"A","text":"查看系统面板"}]}';
var leakedParse = ResponseParser.parse(leakedJson);
assertEq(leakedParse.success, true, 'leaked design thinking json success');
if (leakedParse.storyText.indexOf('用户现在需要') !== -1) throw new Error('ResponseParser leaked user-now-needs: ' + JSON.stringify(leakedParse.storyText));
if (leakedParse.storyText.indexOf('首先得') !== -1) throw new Error('ResponseParser leaked first-must');
if (leakedParse.storyText.indexOf('林墨深吸一口气') === -1) throw new Error('ResponseParser removed real story: ' + JSON.stringify(leakedParse.storyText));
console.log('ResponseParser leaked design-thoughts test passed, cleaned length:', leakedParse.storyText.length);

console.log('ResponseParser tests passed');
