// ========================================
// RelationshipMutator 单元测试
// Run: node tests/state/relationship-mutator.test.js
// ========================================
var helpers = require('../_helpers.js');
var RelationshipMutator = require('../../js/state/mutators/relationship-mutator.js');

function freshState() {
    helpers.createFakeStateManager();
    return RelationshipMutator;
}

// ---- mergeRelationships ----
function testMergeNewPair() {
    var M = freshState();
    helpers.assertOk(M.mergeRelationships({ from: '勇者', to: '村长', type: '盟友', desc: '相互信任' }), 'merge 新关系应成功');
    var list = M.getRelationships();
    helpers.assertEq(list.length, 1, '应有 1 条关系');
    helpers.assertEq(list[0].from, '勇者', 'from 字段');
    helpers.assertEq(list[0].to, '村长', 'to 字段');
    helpers.assertEq(list[0].type, '盟友', 'type 字段');
}

function testMergeArrayInput() {
    var M = freshState();
    M.mergeRelationships([
        { from: 'A', to: 'B', type: '朋友' },
        { from: 'C', to: 'D', type: '敌人' }
    ]);
    helpers.assertEq(M.getRelationships().length, 2, '应合并 2 条');
}

function testMergeSamePairUpdate() {
    var M = freshState();
    M.mergeRelationships({ from: '勇者', to: '村长', type: '盟友', desc: '旧' });
    M.mergeRelationships({ from: '勇者', to: '村长', type: '挚友', desc: '新' });
    var list = M.getRelationships();
    helpers.assertEq(list.length, 1, 'A→B 同对应合并，不新增');
    helpers.assertEq(list[0].type, '挚友', 'type 应被覆盖');
    helpers.assertEq(list[0].desc, '新', 'desc 应被覆盖');
}

function testMergeReversePairUpdate() {
    var M = freshState();
    M.mergeRelationships({ from: '勇者', to: '村长', type: '盟友' });
    // B→A 算同一对
    M.mergeRelationships({ from: '村长', to: '勇者', type: '挚友' });
    var list = M.getRelationships();
    helpers.assertEq(list.length, 1, 'B→A 反向应合并为同一对');
    helpers.assertEq(list[0].type, '挚友', 'type 应被覆盖');
}

function testMergeDimensions() {
    var M = freshState();
    M.mergeRelationships({
        from: '勇者', to: '村长', type: '盟友',
        dimensions: { trust: 50, affection: 20 }
    });
    M.mergeRelationships({
        from: '勇者', to: '村长', type: '盟友',
        dimensions: { trust: 80, hostility: 10 }
    });
    var list = M.getRelationships();
    helpers.assertEq(list.length, 1, '同对应合并');
    helpers.assertEq(list[0].dimensions.trust, 80, 'trust 应被覆盖为 80');
    helpers.assertEq(list[0].dimensions.affection, 20, 'affection 应保留旧值');
    helpers.assertEq(list[0].dimensions.hostility, 10, 'hostility 应新增');
}

function testMergeSkipsInvalid() {
    var M = freshState();
    M.mergeRelationships([
        null,
        { from: '', to: '村长' },         // 缺 from
        { from: '勇者', to: '' },          // 缺 to
        { from: '勇者', to: '村长', type: '盟友' }
    ]);
    helpers.assertEq(M.getRelationships().length, 1, '无效项应被跳过');
}

function testMergeUpperLimit10() {
    var M = freshState();
    // 插入 12 条不同关系对
    for (var i = 0; i < 12; i++) {
        M.mergeRelationships({ from: 'A' + i, to: 'B' + i, type: '盟友' });
    }
    var list = M.getRelationships();
    helpers.assertEq(list.length, 10, '上限应为 10 条');
    // 应保留最后 10 条（slice(-10)）
    helpers.assertEq(list[0].from, 'A2', '应丢弃最早的 A0/A1');
    helpers.assertEq(list[9].from, 'A11', '最后一条应为 A11');
}

function testMergeNonArrayInput() {
    var M = freshState();
    M.mergeRelationships(null);
    helpers.assertEq(M.getRelationships(), [], 'null 输入应得到空数组');
    // 单对象输入应被包装
    M.mergeRelationships({ from: 'A', to: 'B', type: '朋友' });
    helpers.assertEq(M.getRelationships().length, 1, '单对象应被包装为数组');
}

// ---- getRelationships ----
function testGetEmptyDefault() {
    var M = freshState();
    helpers.assertEq(M.getRelationships(), [], '默认应返回空数组');
}

function testGetReturnsArray() {
    var M = freshState();
    global.StateManager.set('entities.relationships', 'not an array');
    helpers.assertEq(M.getRelationships(), [], '存储非数组时应回退为空数组');
}

// ---- clearRelationships ----
function testClearRelationships() {
    var M = freshState();
    M.mergeRelationships([
        { from: 'A', to: 'B', type: '朋友' },
        { from: 'C', to: 'D', type: '敌人' }
    ]);
    helpers.assertEq(M.getRelationships().length, 2, '应先有 2 条');
    helpers.assertOk(M.clearRelationships(), 'clear 应成功');
    helpers.assertEq(M.getRelationships(), [], '清空后应为空数组');
}

// 执行所有用例
var cases = [
    testMergeNewPair, testMergeArrayInput, testMergeSamePairUpdate,
    testMergeReversePairUpdate, testMergeDimensions, testMergeSkipsInvalid,
    testMergeUpperLimit10, testMergeNonArrayInput,
    testGetEmptyDefault, testGetReturnsArray, testClearRelationships
];
for (var i = 0; i < cases.length; i++) {
    try {
        cases[i]();
        console.log('  ✓ ' + cases[i].name);
    } catch (e) {
        console.error('  ✗ ' + cases[i].name + '\n    ' + e.message);
        process.exit(1);
    }
}
console.log('RelationshipMutator tests passed (' + cases.length + ' cases)');
