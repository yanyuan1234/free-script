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
assertEq(plain.success, true, 'plain success');
assertEq(plain.fallbackLevel, 4, 'plain level');

console.log('ResponseParser tests passed');
