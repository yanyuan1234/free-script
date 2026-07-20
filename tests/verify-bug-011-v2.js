/**
 * BUG-011 v2 修复验证
 *
 * 问题：流式打字机（TypewriterBuffer）在流结束时，isFinished() 因 push/pause 状态不稳定
 *       返回错误结果，且 onComplete 回调可能因 stop() 被置 null 而永远不触发，
 *       导致 _doFinalRender() 不执行，turn++/选项渲染/loading 清理等后续逻辑全部卡住。
 *
 * 修复（v2, commit 7aed6fe）：
 *   1. _doFinalRender 内部加 _finalRendered 防重入
 *   2. 同步调用 _doFinalRender，不依赖 TypewriterBuffer 异步 onComplete
 *   3. TypewriterBuffer.onComplete 兜底保留（处理打字机正常完成的情况）
 *   4. 同步后立即清空 onComplete 防止 setInterval 后续 tick 误触
 *
 * 验证项：
 *   - v2 注释存在
 *   - _doFinalRender 函数定义 + 包含 _finalRendered 防重入
 *   - 同步调用 _doFinalRender（_doFinalRender() 出现在 try 块中）
 *   - TypewriterBuffer.onComplete 兜底设置 + 后续清空
 *   - 旧的 v3/v4 直接设置 displayed=finalStory 路径未启用（已回退）
 */

const fs = require('fs');
const path = require('path');

const gameJsPath = path.join(__dirname, '..', 'js', 'game.js');
const gameJs = fs.readFileSync(gameJsPath, 'utf8');

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok, detail: detail || '' });
}

// 1. v2 修复注释存在
check(
    'v2 修复注释存在（"BUG-011 修复 v2"）',
    /BUG-011 修复 v2/.test(gameJs),
    '标记 v2 修复的注释应存在'
);

// 2. _doFinalRender 函数定义
check(
    '_doFinalRender 函数存在',
    /var _doFinalRender\s*=\s*function/.test(gameJs),
    '在 sendAIRequest 末尾应定义 _doFinalRender'
);

// 3. _finalRendered 防重入标志
check(
    '_finalRendered 防重入标志',
    /var _finalRendered\s*=\s*false/.test(gameJs) &&
    /if\s*\(\s*_finalRendered\s*\)\s*return/.test(gameJs),
    '_finalRendered 应初始 false，进入时检查并置 true'
);

// 4. 同步调用 _doFinalRender（不依赖 onComplete 异步触发）
const syncRenderMatch = gameJs.match(
    /if\s*\(\s*!_finalRendered\s*\)\s*\{\s*\n\s*_doFinalRender\(\)/
);
check(
    '同步调用 _doFinalRender（不等 onComplete）',
    !!syncRenderMatch,
    '应在 try 块中直接同步 _doFinalRender()'
);

// 5. onComplete 兜底保留（处理打字机自然完成场景）
check(
    'onComplete 兜底保留',
    /TypewriterBuffer\.onComplete\s*=\s*function\s*\(\)\s*\{\s*\n\s*_doFinalRender\(\)/.test(gameJs),
    'TypewriterBuffer.onComplete 应保留，触发 _doFinalRender'
);

// 6. 同步后清空 onComplete
const cleanupMatch = gameJs.match(
    /同步后立即清空|兜底.*?清空|onComplete\s*=\s*null/
);
check(
    'onComplete 同步后清空',
    /TypewriterBuffer\.onComplete\s*=\s*null/.test(gameJs),
    '同步渲染后应清空 onComplete 防止二次调用'
);

// 7. v3/v4 路径未启用（已回退）
check(
    'v3/v4 finalStory→displayed 路径未启用（已回退）',
    !/BUG-011 v4/.test(gameJs) && !/BUG-011 修复 v3/.test(gameJs),
    'v3/v4 修复已回退，不应出现在源码中'
);

// 8. 修复注释说明根因（OutputSanitizer.sanitizeStory 缩短触发 stop）
check(
    '修复说明包含根因（stop 把 onComplete 置 null）',
    /stop\(\)[\s\S]{0,200}?onComplete\s*置为\s*null/.test(gameJs),
    '修复注释应说明 stop() 内部把 onComplete 置 null 导致流结束分支永远不触发'
);

// 输出
results.forEach(function(r) {
    const sym = r.ok ? '✓' : '✗';
    const line = '  ' + sym + ' ' + r.name;
    console.log(line);
    if (!r.ok && r.detail) console.log('    → ' + r.detail);
});

const passed = results.filter(r => r.ok).length;
const total = results.length;
console.log('----------------------------------------');
console.log('Passed: ' + passed + ' / ' + total);

if (passed < total) {
    console.log('[FAIL] BUG-011 v2 verification failed');
    process.exit(1);
}
console.log('[OK] BUG-011 v2 verified');
