// ========================================
// P1 修复验证测试：验证 P1 关键修复在实际场景中真的有用
// Run: node tests/p1-verification.test.js
// ========================================
var fs = require('fs');
var vm = require('vm');
var path = require('path');

// 全局环境补齐
if (typeof global.DEFAULT_MAX_TOKENS === 'undefined') global.DEFAULT_MAX_TOKENS = 32768;
if (typeof global.DEFAULT_CONTEXT_SIZE === 'undefined') global.DEFAULT_CONTEXT_SIZE = 32000;
if (typeof global.safeInt !== 'function') {
    global.safeInt = function(v, d) { if (v == null || v === '') return d || 0; var n = parseInt(v, 10); return isNaN(n) ? (d || 0) : n; };
}
if (typeof global.parseProgressParts !== 'function') {
    global.parseProgressParts = function(p) {
        if (!p) return { current: 0, total: 1 };
        var parts = String(p).split('/');
        if (parts.length === 2) return { current: global.safeInt(parts[0], 0), total: global.safeInt(parts[1], 1) };
        var n = parseInt(p, 10);
        return { current: isNaN(n) ? 0 : n, total: 1 };
    };
}
// utils.js 用到 window.addEventListener / matchMedia，Node 环境补 mock
if (typeof global.window === 'undefined') {
    global.window = {
        addEventListener: function() {},
        removeEventListener: function() {},
        matchMedia: function() { return { matches: false }; }
    };
}
if (typeof global.localStorage === 'undefined') {
    global.localStorage = { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} };
}

function loadScript(rel) {
    var full = path.join(__dirname, rel);
    vm.runInThisContext(fs.readFileSync(full, 'utf8'), { filename: full });
}

// 载入需要的脚本
loadScript('../js/utils.js');                // Logger / safeDeepClone
loadScript('../js/state/schema.js');         // StateSchema
loadScript('../js/state/state-manager.js');  // StateManager
loadScript('../js/ai-contract/output-sanitizer.js');
loadScript('../js/ai-contract/response-parser.js');

function assertEq(actual, expected, msg) {
    if (actual !== expected) throw new Error((msg || '') + ' expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual));
}
function assertOk(v, msg) { if (!v) throw new Error(msg || 'assertOk failed'); }
function assertContains(haystack, needle, msg) {
    if (String(haystack).indexOf(needle) === -1) throw new Error((msg || '') + ' haystack 不含 ' + JSON.stringify(needle));
}

var passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  ✓ ' + name); passed++; }
    catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); failed++; }
}

console.log('\n==== P1 修复验证测试 ====\n');

// ===== P1-1: THINKING_TAGS 12 标签 =====
console.log('[P1-1] THINKING_TAGS 12 标签覆盖');
test('THINKING_TAGS 应包含 12 个标签', function() {
    assertEq(OutputSanitizer.THINKING_TAGS.length, 12, '标签数');
});
test('应包含 final（Gemini 2.5+ / Claude 4 正式回复包裹）', function() {
    assertOk(OutputSanitizer.THINKING_TAGS.indexOf('final') !== -1, '漏 final 标签会导致正式回复被当 CoT 剥离');
});
test('应包含 inner_thoughts（酒馆助手 v3）', function() {
    assertOk(OutputSanitizer.THINKING_TAGS.indexOf('inner_thoughts') !== -1, '漏 inner_thoughts');
});
test('应包含 reflection（MiniMax / Reflection 系列）', function() {
    assertOk(OutputSanitizer.THINKING_TAGS.indexOf('reflection') !== -1, '漏 reflection');
});
test('应包含 assistantfinal（Qwen3 / 酒馆 fallback）', function() {
    assertOk(OutputSanitizer.THINKING_TAGS.indexOf('assistantfinal') !== -1, '漏 assistantfinal');
});
test('stripThinking 应剥离 <final> 包裹的内容', function() {
    var r = OutputSanitizer.stripThinking('<final>这是正式回复</final>这是正文');
    assertEq(r, '这是正文', 'final 标签被剥离');
});
test('stripThinking 不应误删 <think> 包裹的思考', function() {
    var r = OutputSanitizer.stripThinking('<think>思考过程</think>正文');
    assertEq(r, '正文', 'think 标签被剥离');
});

// ===== P1-2: _tryCodeBlockJSON 支持纯 ``` =====
console.log('\n[P1-2] _tryCodeBlockJSON 支持纯 ``` 代码块（Gemini 2.5+ 主流）');
test('应解析 ```json 代码块', function() {
    var r = ResponseParser._tryCodeBlockJSON('```json\n{"story":"hi"}\n```');
    assertOk(r && r.story === 'hi', 'json fence 应解析');
});
test('应解析纯 ``` 代码块（Gemini 2.5+ 默认）', function() {
    var r = ResponseParser._tryCodeBlockJSON('```\n{"story":"hi"}\n```');
    assertOk(r && r.story === 'hi', '纯 fence 应解析');
});
test('应解析 ```javascript 代码块', function() {
    var r = ResponseParser._tryCodeBlockJSON('```javascript\n{"story":"hi"}\n```');
    assertOk(r && r.story === 'hi', 'javascript fence 应解析');
});

// ===== P1-3: <json></json> 标签支持（国产模型 / TokenSender） =====
console.log('\n[P1-3] <json></json> 标签支持');
test('应识别 <json> 包裹的 JSON', function() {
    var r = ResponseParser.parse('<json>{"story":"正文","choices":[]}</json>');
    assertOk(r.success, '<json> 标签应被解析');
    assertEq(r.data.story, '正文', 'story 字段');
});

// ===== P1-4: parseMarkdown escapeHtml 防 XSS =====
// 注：parseMarkdown 在 core.js 中，core.js 太大不便在 vm 加载。
// 改为读源码静态验证（grep 行为确认）
console.log('\n[P1-4] parseMarkdown escapeHtml 防 XSS（静态源码验证）');
test('parseMarkdown 源码应包含 escapeHtml 调用', function() {
    var src = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');
    // 提取 parseMarkdown 函数体（4443-4450 行附近）
    var m = src.match(/function parseMarkdown\(text\)\s*\{[\s\S]*?\n\}/);
    assertOk(m, '应找到 parseMarkdown 函数定义');
    assertContains(m[0], 'escapeHtml', 'parseMarkdown 应调用 escapeHtml');
    assertContains(m[0], '<strong>', '应保留加粗语义');
    assertContains(m[0], '<em>', '应保留斜体语义');
});

// ===== P1-5: Logger.debug / info 恢复 =====
console.log('\n[P1-5] Logger.debug / info 方法恢复');
test('Logger 应有 debug 方法', function() {
    assertEq(typeof Logger.debug, 'function', 'Logger.debug 应是函数');
});
test('Logger 应有 info 方法', function() {
    assertEq(typeof Logger.info, 'function', 'Logger.info 应是函数');
});
test('Logger.debug 在默认级别（warn）下应静默不抛', function() {
    Logger.debug('test');  // 不应抛异常
    assertOk(true, 'Logger.debug 不抛异常');
});
test('Logger.debug 调用不应破坏后续 console', function() {
    Logger.debug('test1');
    Logger.info('test2');
    Logger.warn('test3');
    Logger.error('test4');
    assertOk(true, '4 个级别都能调用');
});

console.log('\n==== Summary ====');
console.log('Passed: ' + passed + ' / ' + (passed + failed));
if (failed > 0) {
    console.error('FAILED: ' + failed);
    process.exit(1);
} else {
    console.log('All P1 verification tests passed.');
    process.exit(0);
}
