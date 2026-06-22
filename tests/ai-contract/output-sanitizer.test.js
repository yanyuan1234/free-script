// ========================================
// OutputSanitizer 单元测试
// Run: node tests/ai-contract/output-sanitizer.test.js
// ========================================
var OutputSanitizer = require('../../js/ai-contract/output-sanitizer.js');

function assertEq(a, b, msg) {
    if (a !== b) throw new Error(msg + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
}

assertEq(OutputSanitizer.sanitizeStory('<p>hello</p><br>world▌'), 'hello\n\nworld', 'html/cursor');
assertEq(OutputSanitizer.sanitizeStory('hi <thinking>推理</thinking> there'), 'hi  there', 'thinking');
assertEq(OutputSanitizer.sanitizeJSON('```json\n{"a":1}\n```'), '{"a":1}', 'json code block');
assertEq(OutputSanitizer.stripJSONArtifacts('"story": "hello'), 'hello', 'json artifact');

console.log('OutputSanitizer tests passed');
