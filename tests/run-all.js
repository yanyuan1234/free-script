// ========================================
// 统一测试入口（CI 使用）
// Run: node tests/run-all.js
// 退出码 0 表示全部通过，1 表示有失败
// ========================================
var path = require('path');
var fs = require('fs');
var childProcess = require('child_process');

// 测试文件列表（按目录分组，字母顺序）
var testFiles = [
    // ai-contract 层
    'ai-contract/ai-output-schema.test.js',
    'ai-contract/ai-response-mutator.test.js',
    'ai-contract/output-sanitizer.test.js',
    'ai-contract/prompt-builder.test.js',
    'ai-contract/response-parser.test.js',
    // state 层 mutators
    'state/bag-mutator.test.js',
    'state/currency-mutator.test.js',
    'state/quest-mutator.test.js',
    'state/relationship-mutator.test.js',
    'state/time-mutator.test.js',
    // P1 修复回归
    'p1-verification.test.js',
    // 第二轮修复回归（存档fallback/npcMessages别名/Swipe钳制/商店扣款/重试保真/日志门控）
    'fix-round2.test.js',
    // 第三轮修复回归（锻造性别覆写/回合数同步/API配置持久化/版本号统一/主菜单资料持久化）
    'fix-round3.test.js',
    // 题材自适应排行榜/成就兜底
    'theme-adaptive-content.test.js',
    // BUG-011 v2 修复验证
    'verify-bug-011-v2.js',
    // P0 VariableStore defer 性能优化验证
    'verify-varstore-defer.js'
];

var failures = 0;
var passed = 0;

testFiles.forEach(function(file) {
    var fullPath = path.join(__dirname, file);
    if (!fs.existsSync(fullPath)) {
        console.log('[skip] ' + file + ' (文件不存在)');
        return;
    }
    console.log('\n==== Running ' + file + ' ====');
    try {
        // 用子进程隔离，避免单个测试文件的 process.exit 影响整体
        childProcess.execSync('node "' + fullPath + '"', {
            stdio: 'inherit',
            cwd: path.join(__dirname, '..')
        });
        passed++;
    } catch (e) {
        failures++;
        console.error('[FAIL] ' + file);
    }
});

console.log('\n==== Summary ====');
console.log('Test suites passed: ' + passed + '/' + testFiles.length);
if (failures > 0) {
    console.error('FAILED: ' + failures + ' suite(s)');
    process.exit(1);
} else {
    console.log('All test suites passed.');
    process.exit(0);
}
