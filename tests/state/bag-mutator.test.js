// ========================================
// BagMutator 单元测试
// Run: node tests/state/bag-mutator.test.js
// ========================================
var helpers = require('../_helpers.js');
var BagMutator = require('../../js/state/mutators/bag-mutator.js');

function freshState() {
    helpers.createFakeStateManager();
    return BagMutator;
}

// ---- normalizeItem ----
function testNormalizeString() {
    var M = freshState();
    var it = M.normalizeItem('长剑');
    helpers.assertEq(it.name, '长剑', '字符串应作为名称');
    helpers.assertEq(it.count, 1, '默认数量 1');
    helpers.assertEq(it.unit, '个', '默认单位 个');
    helpers.assertEq(it.rarity, '普通', '默认稀有度 普通');
    helpers.assertEq(it.usable, false, '默认 usable=false');
    helpers.assertEq(it.equippable, false, '默认 equippable=false');
    helpers.assertEq(it.equipped, false, '默认 equipped=false');
    helpers.assertEq(it.history, [], '默认 history 为空数组');
}

function testNormalizeInvalidNames() {
    var M = freshState();
    helpers.assertEq(M.normalizeItem('无'), null, '"无" 应被过滤');
    helpers.assertEq(M.normalizeItem('未知'), null, '"未知" 应被过滤');
    helpers.assertEq(M.normalizeItem('undefined'), null, '"undefined" 应被过滤');
    helpers.assertEq(M.normalizeItem('null'), null, '"null" 应被过滤');
    helpers.assertEq(M.normalizeItem(''), null, '空串应被过滤');
    helpers.assertEq(M.normalizeItem(null), null, 'null 应返回 null');
}

function testNormalizeCountFromQty() {
    var M = freshState();
    var it = M.normalizeItem({ name: '药水', qty: 5 });
    helpers.assertEq(it.count, 5, '应从 qty 字段读取数量');
    helpers.assertEq(it.unit, '个', '默认单位');
}

function testNormalizeCountInvalid() {
    var M = freshState();
    var it = M.normalizeItem({ name: '药水', count: -3 });
    helpers.assertEq(it.count, 1, '负数 count 应回退为 1');
    var it2 = M.normalizeItem({ name: '药水', count: 'abc' });
    helpers.assertEq(it2.count, 1, '非数字 count 应回退为 1');
}

function testNormalizeCustomFields() {
    var M = freshState();
    var it = M.normalizeItem({
        name: '魔杖', count: 2, unit: '根', rarity: '稀有',
        desc: '一根魔杖', effect: '回蓝 10', equipped: true,
        equippable: true, slot: '主手', usable: true,
        obtainedTurn: 5, lastChangedTurn: 7, history: ['获得']
    });
    helpers.assertEq(it.unit, '根', '自定义单位');
    helpers.assertEq(it.rarity, '稀有', '自定义稀有度');
    helpers.assertEq(it.effect, '回蓝 10', 'effect 字段');
    helpers.assertEq(it.equipped, true, 'equipped=true');
    helpers.assertEq(it.equippable, true, 'equippable=true');
    helpers.assertEq(it.slot, '主手', 'slot 字段');
    helpers.assertEq(it.usable, true, 'usable=true');
    helpers.assertEq(it.obtainedTurn, 5, 'obtainedTurn 保留');
    helpers.assertEq(it.lastChangedTurn, 7, 'lastChangedTurn 保留');
    helpers.assertEq(it.history, ['获得'], 'history 保留');
}

// ---- _normalizeItemName ----
function testNormalizeItemNameBasic() {
    var M = freshState();
    helpers.assertEq(M._normalizeItemName('磨边的羊毛袜'), '磨边羊毛袜', '去掉"的"');
    helpers.assertEq(M._normalizeItemName('魔 法 书'), '魔法书', '去空格');
    helpers.assertEq(M._normalizeItemName('药水（小）'), '药水', '去括号');
    helpers.assertEq(M._normalizeItemName('Apple'), 'apple', '转小写');
    helpers.assertEq(M._normalizeItemName(''), '', '空串返回空');
    helpers.assertEq(M._normalizeItemName(null), '', 'null 返回空');
}

// ---- setItems ----
function testSetItemsFiltersInvalid() {
    var M = freshState();
    helpers.assertOk(M.setItems([{ name: '剑' }, { name: '无' }, { name: '未知' }, '药水']), 'setItems 应成功');
    var bag = global.StateManager.get('entities.bag');
    helpers.assertEq(bag.length, 2, '应过滤掉 "无"/"未知"，保留 剑 + 药水');
    helpers.assertEq(bag[0].name, '剑', '第一项');
    helpers.assertEq(bag[1].name, '药水', '第二项');
}

function testSetItemsEmpty() {
    var M = freshState();
    M.setItems([]);
    helpers.assertEq(global.StateManager.get('entities.bag'), [], '空数组应写入空数组');
    M.setItems(null);
    helpers.assertEq(global.StateManager.get('entities.bag'), [], 'null 应写入空数组');
}

// ---- addItem ----
function testAddItemNew() {
    var M = freshState();
    helpers.assertOk(M.addItem({ name: '长剑', count: 1 }), 'add 新物品应成功');
    var bag = global.StateManager.get('entities.bag');
    helpers.assertEq(bag.length, 1, '应只有 1 个物品');
    helpers.assertEq(bag[0].name, '长剑', '名称');
}

function testAddItemAccumulateCount() {
    var M = freshState();
    M.addItem({ name: '药水', count: 2 });
    M.addItem({ name: '药水', count: 3 });
    var bag = global.StateManager.get('entities.bag');
    helpers.assertEq(bag.length, 1, '同名物品应合并为 1 条');
    helpers.assertEq(bag[0].count, 5, '数量应累加 2+3=5');
}

function testAddItemInvalid() {
    var M = freshState();
    helpers.assertEq(M.addItem('无'), false, '添加 "无" 应返回 false');
    helpers.assertEq(M.addItem(null), false, '添加 null 应返回 false');
    var bag = global.StateManager.get('entities.bag');
    helpers.assertEq(bag.length, 0, '失败不应写入');
}

// ---- mergeItems ----
function testMergeItemsPreciseMatch() {
    var M = freshState();
    M.setItems([{ name: '长剑', count: 1, desc: '旧描述' }]);
    M.mergeItems([{ name: '长剑', count: 2, desc: '新描述' }]);
    var bag = global.StateManager.get('entities.bag');
    helpers.assertEq(bag.length, 1, '精确匹配应合并，不新增');
    helpers.assertEq(bag[0].count, 2, 'count 应被覆盖为 2');
    helpers.assertEq(bag[0].desc, '新描述', 'desc 应被覆盖');
}

function testMergeItemsFuzzyMatch() {
    var M = freshState();
    M.setItems([{ name: '磨边的羊毛袜', count: 1 }]);
    // 模糊匹配：去"的"后归一化为 "磨边羊毛袜"
    M.mergeItems([{ name: '磨边羊毛袜', count: 2 }]);
    var bag = global.StateManager.get('entities.bag');
    helpers.assertEq(bag.length, 1, '模糊匹配应合并，不新增');
    helpers.assertEq(bag[0].count, 2, 'count 应被覆盖');
    helpers.assertEq(bag[0].name, '磨边的羊毛袜', '保留原名称');
}

function testMergeItemsAddNew() {
    var M = freshState();
    M.setItems([{ name: '长剑' }]);
    M.mergeItems([{ name: '盾牌', count: 1 }]);
    var bag = global.StateManager.get('entities.bag');
    helpers.assertEq(bag.length, 2, '新物品应追加');
    helpers.assertEq(bag[1].name, '盾牌', '新物品名称');
}

function testMergeItemsAllFields() {
    var M = freshState();
    M.setItems([{ name: '药水', count: 1, rarity: '普通' }]);
    M.mergeItems([{
        name: '药水', count: 5, desc: '回血', rarity: '稀有',
        rarityClass: 'rare', equipped: false, usable: true,
        unit: '瓶', effect: '回血 30', equippable: false, slot: '', history: ['获得']
    }]);
    var bag = global.StateManager.get('entities.bag');
    helpers.assertEq(bag[0].desc, '回血', 'desc 合并');
    helpers.assertEq(bag[0].rarity, '稀有', 'rarity 合并');
    helpers.assertEq(bag[0].effect, '回血 30', 'effect 合并');
    helpers.assertEq(bag[0].unit, '瓶', 'unit 合并');
    helpers.assertEq(bag[0].history, ['获得'], 'history 合并');
}

function testMergeItemsNullSkipped() {
    var M = freshState();
    M.setItems([{ name: '长剑' }]);
    M.mergeItems([null, { name: '盾牌' }, { name: '' }]);
    var bag = global.StateManager.get('entities.bag');
    helpers.assertEq(bag.length, 2, 'null/空名应被跳过');
}

// 执行所有用例
var cases = [
    testNormalizeString, testNormalizeInvalidNames, testNormalizeCountFromQty,
    testNormalizeCountInvalid, testNormalizeCustomFields,
    testNormalizeItemNameBasic,
    testSetItemsFiltersInvalid, testSetItemsEmpty,
    testAddItemNew, testAddItemAccumulateCount, testAddItemInvalid,
    testMergeItemsPreciseMatch, testMergeItemsFuzzyMatch, testMergeItemsAddNew,
    testMergeItemsAllFields, testMergeItemsNullSkipped
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
console.log('BagMutator tests passed (' + cases.length + ' cases)');
