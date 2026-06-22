// ========================================
// AIOutputSchema 单元测试
// Run: node tests/ai-contract/ai-output-schema.test.js
// ========================================
var AIOutputSchema = require('../../js/ai-contract/schemas/ai-output-schema.js');

function assertEq(a, b, msg) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        throw new Error((msg || 'assertEq failed') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
    }
}

var normalized = AIOutputSchema.normalize({ storyText: 'hello', sceneTitle: '第一章', choices: ['A', { text: 'B' }] });
assertEq(normalized.story, 'hello', 'story alias');
assertEq(normalized.title, '第一章', 'title alias');
assertEq(normalized.choices.length, 2, 'choices length');
assertEq(normalized.choices[0].text, 'A', 'choice string');

var validated = AIOutputSchema.validate({ story: 'x' });
assertEq(validated.valid, true, 'valid');

var invalid = AIOutputSchema.validate({});
assertEq(invalid.valid, false, 'invalid');

console.log('AIOutputSchema tests passed');
