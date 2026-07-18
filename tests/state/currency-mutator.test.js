// ========================================
// CurrencyMutator 单元测试
// Run: node tests/state/currency-mutator.test.js
// ========================================
var helpers = require('../_helpers.js');
var CurrencyMutator = require('../../js/state/mutators/currency-mutator.js');

// 每个用例前重建 fake StateManager，避免相互污染
function freshState() {
    helpers.createFakeStateManager();
    return CurrencyMutator;
}

// 用例
function testGetDefault() {
    var M = freshState();
    helpers.assertEq(M.get(), 0, '默认余额应为 0');
    helpers.assertEq(M.getName(), '金币', '默认货币名应为 金币');
}

function testSet() {
    var M = freshState();
    helpers.assertOk(M.set(100), 'set 100 应成功');
    helpers.assertEq(M.get(), 100, 'set 后余额应为 100');
}

function testSetFloorNonNegative() {
    var M = freshState();
    M.set(99.7);
    helpers.assertEq(M.get(), 99, 'set 应向下取整');
    M.set(-50);
    helpers.assertEq(M.get(), 0, 'set 负数应归 0');
}

function testSetInvalid() {
    var M = freshState();
    helpers.assertEq(M.set('abc'), false, 'set 非数字应返回 false');
    helpers.assertEq(M.set(NaN), false, 'set NaN 应返回 false');
    helpers.assertEq(M.get(), 0, '失败后余额保持 0');
}

function testAdd() {
    var M = freshState();
    M.set(100);
    helpers.assertOk(M.add(50), 'add 50 应成功');
    helpers.assertEq(M.get(), 150, 'add 后余额应为 150');
}

function testAddInvalid() {
    var M = freshState();
    M.set(100);
    helpers.assertEq(M.add(-10), false, 'add 负数应返回 false');
    helpers.assertEq(M.add(0), false, 'add 0 应返回 false');
    helpers.assertEq(M.get(), 100, '失败后余额不变');
}

function testSpendSuccess() {
    var M = freshState();
    M.set(100);
    helpers.assertOk(M.spend(30), 'spend 30 应成功');
    helpers.assertEq(M.get(), 70, 'spend 后余额应为 70');
}

function testSpendInsufficient() {
    var M = freshState();
    M.set(50);
    helpers.assertEq(M.spend(100), false, '余额不足应返回 false');
    helpers.assertEq(M.get(), 50, '余额不足时状态不应改变');
}

function testSpendInvalid() {
    var M = freshState();
    M.set(100);
    helpers.assertEq(M.spend(-5), false, 'spend 负数应返回 false');
    helpers.assertEq(M.spend(0), false, 'spend 0 应返回 false');
    helpers.assertEq(M.get(), 100, '失败后余额不变');
}

function testGetNameCustom() {
    var M = freshState();
    M.set(0);
    global.StateManager.set('entities.currencyName', '银两');
    helpers.assertEq(M.getName(), '银两', '应读取自定义货币名');
}

function testGetWithNaNStored() {
    var M = freshState();
    global.StateManager.set('entities.currency', 'not a number');
    helpers.assertEq(M.get(), 0, '存储了非数字时 get 应返回 0');
}

// 执行所有用例
var cases = [
    testGetDefault, testSet, testSetFloorNonNegative, testSetInvalid,
    testAdd, testAddInvalid, testSpendSuccess, testSpendInsufficient,
    testSpendInvalid, testGetNameCustom, testGetWithNaNStored
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
console.log('CurrencyMutator tests passed (' + cases.length + ' cases)');
