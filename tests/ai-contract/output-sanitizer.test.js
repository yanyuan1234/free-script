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

// BUG：裸推理前缀（无标签）混在剧情前，应被剥离
assertEq(OutputSanitizer.stripBareThinking('我需要考虑下一步。\n\n{"story":"hello"}'), '{"story":"hello"}', 'single bare thinking para then json');
assertEq(OutputSanitizer.stripBareThinking('我需要考虑下一步。\n\n玩家选择了A。\n\n{"story":"hello"}'), '{"story":"hello"}', 'multiple bare thinking paras then json');
// 单段裸推理前缀后紧跟普通剧情文本（非 JSON），保持保守策略不剥离
assertEq(OutputSanitizer.stripBareThinking('我需要考虑下一步。\n\n真正的剧情从这里开始。'), '我需要考虑下一步。\n\n真正的剧情从这里开始。', 'single bare thinking para then plain story stays');

console.log('OutputSanitizer tests passed');
