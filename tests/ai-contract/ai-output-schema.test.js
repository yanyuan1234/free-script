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

// [Mufy 三层记忆] 测试 memoryUpdates 的 layer/importance 归一化
var memUpdate = AIOutputSchema.normalize({
    story: '剧情',
    memoryUpdates: [
        { op: 'add', category: 'settings', layer: 'shortTerm', importance: 5, content: '主角答应帮忙' },
        { op: 'add', category: 'npcProfiles', layer: 'milestone', importance: 8, content: '关系确立' },
        { op: 'replace', category: 'pcIdentity', layer: 'longTerm', importance: 6, content: '身份更新' },
        { op: 'add', category: 'settings', layer: 'invalidLayer', importance: 15, content: '非法层测试' },
        { op: 'add', category: 'settings', content: '默认层测试' }
    ]
});
assertEq(memUpdate.memoryUpdates.length, 5, 'memoryUpdates count');
assertEq(memUpdate.memoryUpdates[0].layer, 'shortTerm', 'shortTerm layer preserved');
assertEq(memUpdate.memoryUpdates[0].importance, 5, 'importance preserved');
assertEq(memUpdate.memoryUpdates[1].layer, 'milestone', 'milestone layer preserved');
assertEq(memUpdate.memoryUpdates[1].importance, 8, 'milestone importance preserved');
assertEq(memUpdate.memoryUpdates[3].layer, 'longTerm', 'invalid layer fallback to longTerm');
assertEq(memUpdate.memoryUpdates[3].importance, 10, 'importance clamped to 10');
assertEq(memUpdate.memoryUpdates[4].layer, 'longTerm', 'default layer is longTerm');
assertEq(memUpdate.memoryUpdates[4].importance, 5, 'default importance is 5');

console.log('AIOutputSchema tests passed');
