// ========================================
// 第二轮修复回归测试：存档fallback / npcMessages别名 / Swipe索引钳制
// Run: node tests/fix-round2.test.js
// ========================================
var helpers = require('./_helpers.js');
var fs = require('fs');
var path = require('path');

var passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  ✓ ' + name); passed++; }
    catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); failed++; }
}

console.log('\n==== 第二轮修复回归测试 ====\n');

// ===== 1. SaveDB._lsGet 已定义（fallback 模式不再 TypeError） =====
console.log('[1] SaveDB._lsGet 定义');
test('_lsGet 方法应存在于 SaveDB 源码', function() {
    var src = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');
    // 提取 SaveDB 对象字面量中的方法定义（非调用点）
    var defCount = (src.match(/_lsGet\(slot\)\s*\{/g) || []).length;
    helpers.assertEq(defCount >= 1, true, '应有 _lsGet(slot){ 方法定义');
});
test('_lsGet 调用点（this._lsGet）均先于定义可用（同对象方法互调）', function() {
    var src = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');
    var calls = (src.match(/this\._lsGet\(/g) || []).length;
    helpers.assertOk(calls >= 6, 'fallback 路径应有 6+ 处 this._lsGet 调用，实际 ' + calls);
});

// ===== 2. npcMessages from 别名（schema 归一化） =====
console.log('\n[2] npcMessages from 别名映射');
var AIOutputSchema = require('../js/ai-contract/schemas/ai-output-schema.js');
test('AI 返回 {from,text} 应归一化为 name+from 双字段', function() {
    var out = AIOutputSchema.normalize({
        story: '正文',
        npcMessages: [{ from: '林晚', text: '你今天怎么没来？' }]
    });
    helpers.assertOk(out.npcMessages && out.npcMessages.length === 1, '应保留 1 条');
    helpers.assertEq(out.npcMessages[0].name, '林晚', 'name 应映射自 from');
    helpers.assertEq(out.npcMessages[0].from, '林晚', 'from 字段应保留');
    helpers.assertEq(out.npcMessages[0].text, '你今天怎么没来？', 'text 保留');
});
test('AI 返回 {name,text}（旧契约）仍应兼容', function() {
    var out = AIOutputSchema.normalize({
        story: '正文',
        npcMessages: [{ name: '陈默', text: '收到。' }]
    });
    helpers.assertEq(out.npcMessages[0].from, '陈默', 'from 应同步填充');
});
test('空文本消息应被过滤', function() {
    var out = AIOutputSchema.normalize({
        story: '正文',
        npcMessages: [{ from: 'X', text: '   ' }, null, { from: 'Y', text: '有效' }]
    });
    helpers.assertEq(out.npcMessages.length, 1, '只保留 1 条');
});
test('game.js 消费端应同时兼容 from/name（源码验证）', function() {
    var src = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');
    helpers.assertOk(src.indexOf('(msg.from || msg.name)') !== -1, '消费端应有 from||name 兜底');
    helpers.assertOk(src.indexOf('_last.text === msg.text') !== -1, '应有同文本去重');
});

// ===== 3. SwipeManager 索引钳制 =====
console.log('\n[3] SwipeManager 索引钳制');
var SwipeManagerSrc = fs.readFileSync(path.join(__dirname, '../js/swipe-manager.js'), 'utf8');
test('_writeState 应有上限钳制 Math.min', function() {
    helpers.assertOk(SwipeManagerSrc.indexOf('Math.min(_cur, versions.length - 1)') !== -1, '写入应钳制到 length-1');
});
test('loadCurrentTurn 应有越界归零', function() {
    helpers.assertOk(SwipeManagerSrc.indexOf('_cur >= state.versions.length') !== -1, '加载时越界应归 0');
});

// ===== 4. 商店扣款防御 =====
console.log('\n[4] 商店扣款防御');
test('buyShopItem 应检查扣款结果（源码验证）', function() {
    var src = fs.readFileSync(path.join(__dirname, '../js/phone-ui.js'), 'utf8');
    helpers.assertOk(src.indexOf('if (!_paid)') !== -1, '扣款失败应中止购买');
    helpers.assertOk(src.indexOf('if (price > 0)') !== -1, 'price=0 应跳过扣款直接领取');
});

// ===== 5. 截断重试保真 =====
console.log('\n[5] 截断重试保真');
test('重试请求应透传 jsonSchema（源码验证）', function() {
    var src = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');
    helpers.assertOk(src.indexOf('jsonSchema: options.jsonSchema') !== -1, '重试应透传 JSON Schema 约束');
});

// ===== 6. 日志门控 Node 豁免 =====
console.log('\n[6] 日志门控 Node 豁免');
test('utils.js 门控应先检测 Node 环境并跳过', function() {
    var src = fs.readFileSync(path.join(__dirname, '../js/utils.js'), 'utf8');
    helpers.assertOk(src.indexOf('process.versions.node') !== -1, '应有 Node 检测');
});

console.log('\n==== Summary ====');
console.log('Passed: ' + passed + ' / ' + (passed + failed));
if (failed > 0) { process.exit(1); }
console.log('All round-2 fix tests passed.');
