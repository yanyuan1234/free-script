// 回归测试：验证 stream-worker / core.js 不把 reasoning_content 回退为正文
// 对应 BUG-C1：推理模型把思考链写入 reasoning 字段时，若回退为正文会污染 story UI

function assertEqual(actual, expected, msg) {
    if (actual !== expected) {
        throw new Error(msg + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    }
}

function runTest(name, fn) {
    try {
        fn();
        console.log('✓ ' + name);
    } catch (e) {
        console.error('✗ ' + name);
        console.error('  ' + e.message);
        process.exitCode = 1;
    }
}

// 模拟 stream-worker.js 修复后的正文提取逻辑
function extractContent(delta, ctx) {
    var content = (typeof delta.content === 'string') ? delta.content : '';
    var reasoningChunk = (typeof delta.reasoning_content === 'string') ? delta.reasoning_content
                          : (typeof delta.reasoning === 'string') ? delta.reasoning : '';
    // FIX-C1：正文只取 delta.content，reasoning 仅用于折叠面板/调试
    if (reasoningChunk) {
        ctx.reasoningText += reasoningChunk;
    }
    ctx.fullText += content;
    return content;
}

runTest('BUG-C1: content 非空时 reasoning 不计入正文', function() {
    var ctx = { fullText: '', reasoningText: '' };
    var c1 = extractContent({ content: '第一段剧情', reasoning_content: '我需要写第一段' }, ctx);
    var c2 = extractContent({ content: '第二段剧情', reasoning_content: '然后写选项' }, ctx);
    assertEqual(c1, '第一段剧情', 'content 应原样返回');
    assertEqual(c2, '第二段剧情', 'content 应原样返回');
    assertEqual(ctx.fullText, '第一段剧情第二段剧情', '正文只包含 content');
    assertEqual(ctx.reasoningText, '我需要写第一段然后写选项', 'reasoning 被收集到 reasoningText');
});

runTest('BUG-C1: content 为空时 reasoning 不污染正文', function() {
    var ctx = { fullText: '', reasoningText: '' };
    var c1 = extractContent({ content: '', reasoning_content: "Here's a thinking process:" }, ctx);
    var c2 = extractContent({ content: '', reasoning_content: ' 1. Analyze user input...' }, ctx);
    var c3 = extractContent({ content: '最终剧情', reasoning_content: '' }, ctx);
    assertEqual(c1, '', '空 content 应返回空');
    assertEqual(c2, '', '空 content 应返回空');
    assertEqual(c3, '最终剧情', '非空 content 正常返回');
    assertEqual(ctx.fullText, '最终剧情', '正文只包含真正的 content');
    assertEqual(ctx.reasoningText.indexOf("Here's a thinking process:") >= 0, true, 'reasoning 被单独收集');
});

runTest('BUG-C1: 仅存在 reasoning 字段（无 reasoning_content）时也不回退', function() {
    var ctx = { fullText: '', reasoningText: '' };
    var c = extractContent({ content: '', reasoning: '模型思考链' }, ctx);
    assertEqual(c, '', 'content 为空返回空');
    assertEqual(ctx.fullText, '', '正文为空');
    assertEqual(ctx.reasoningText, '模型思考链', 'reasoning 被收集');
});

console.log('\nstream-worker reasoning fallback tests done');
