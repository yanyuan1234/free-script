/**
 * P0 性能优化验证：VariableStore.setGlobal 批量 defer 持久化
 *
 * 问题：injectPresetGlobalVars 内会调用 20-30+ 次 MacroEngine.setGlobalVar，
 *       每次都同步触发 VariableStore.setGlobal → _persistGlobal → Storage.setJSON
 *       → safeSetItem → StorageMonitor.checkCapacity + localStorage.setItem。
 *       实测 injectPresetGlobalVars 阶段阻塞 300-500ms，浏览器主线程长任务导致
 *       evaluate/snapshot 频繁 30s 超时。
 *
 * 修复（js/tavern-compat.js）：
 *   1. 新增 _schedulePersist()：用 setTimeout(0) 把同 tick 多次 setGlobal 合并为 1 次落盘
 *   2. setGlobal() 改为调 _schedulePersist()，不再每次都同步 _persistGlobal()
 *   3. 新增 flushPersist()：用于 beforeunload 强制同步落盘，避免 defer 丢数据
 *   4. js/core.js beforeunload handler 增加 VariableStore.flushPersist() 调用
 *
 * 验证项：
 *   - _schedulePersist 存在
 *   - _persistScheduled 标志存在
 *   - setGlobal 改用 _schedulePersist（不再直接调 _persistGlobal）
 *   - flushPersist 方法存在
 *   - beforeunload 中调用 flushPersist
 *   - 旧直接调用 _persistGlobal 路径已收敛
 */

const fs = require('fs');
const path = require('path');

const compatPath = path.join(__dirname, '..', 'js', 'tavern-compat.js');
const corePath = path.join(__dirname, '..', 'js', 'core.js');
const compatJs = fs.readFileSync(compatPath, 'utf8');
const coreJs = fs.readFileSync(corePath, 'utf8');

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok, detail: detail || '' });
}

// 1. _schedulePersist 方法存在
check(
    '_schedulePersist 方法存在',
    /_schedulePersist\s*\(\s*\)\s*\{/.test(compatJs),
    'VariableStore 应有 _schedulePersist 方法'
);

// 2. _persistScheduled 标志
check(
    '_persistScheduled 标志',
    /_persistScheduled\s*[:=]\s*false/.test(compatJs),
    '应有 _persistScheduled 布尔标志'
);

// 3. setGlobal 改用 _schedulePersist
const setGlobalMatch = compatJs.match(
    /setGlobal\s*\(\s*name\s*,\s*value\s*\)\s*\{[\s\S]*?\n\s*\}/
);
check(
    'setGlobal 改用 _schedulePersist',
    setGlobalMatch && /this\._schedulePersist\(\)/.test(setGlobalMatch[0]),
    'setGlobal 应调 _schedulePersist 而非 _persistGlobal'
);

// 4. setGlobal 不再直接调 _persistGlobal
check(
    'setGlobal 不再直接调 _persistGlobal',
    setGlobalMatch && !/this\._persistGlobal\(\)/.test(setGlobalMatch[0]),
    'setGlobal 内部不应有 _persistGlobal() 调用'
);

// 5. flushPersist 方法存在
check(
    'flushPersist 方法存在',
    /flushPersist\s*\(\s*\)\s*\{/.test(compatJs),
    'VariableStore 应有 flushPersist 方法用于强制落盘'
);

// 6. flushPersist 清空 timer + 调用 _persistGlobal
// 提取 flushPersist 完整函数体：从 "flushPersist() {" 到下一个独立 "    }," 标记
const flushMatch = compatJs.match(/flushPersist\s*\(\s*\)\s*\{[\s\S]*?\n\s*\},/);
check(
    'flushPersist 清空 _persistTimer + 调 _persistGlobal',
    flushMatch && /clearTimeout\s*\(\s*this\._persistTimer\s*\)/.test(flushMatch[0])
        && /this\._persistGlobal\(\)/.test(flushMatch[0]),
    'flushPersist 应 clearTimeout 取消 defer + 同步 _persistGlobal'
);

// 7. _schedulePersist 用 setTimeout(0) defer
// 提取 _schedulePersist 函数体：从 "_schedulePersist() {" 到下一个 "    }," 标记
const schedStart = compatJs.indexOf('_schedulePersist() {');
let schedBody = '';
if (schedStart >= 0) {
    // 找到下一个 "    }," 作为结束
    const endIdx = compatJs.indexOf('\n    },', schedStart);
    schedBody = endIdx > 0 ? compatJs.substring(schedStart, endIdx) : compatJs.substring(schedStart, schedStart + 400);
}
check(
    '_schedulePersist 用 setTimeout(0) 合并',
    /setTimeout\s*\(/.test(schedBody) && /\b0\s*\)/.test(schedBody),
    '应用 setTimeout(0) 把同 tick 多次 setGlobal 合并为 1 次落盘'
);

// 8. beforeunload 调用 flushPersist
check(
    'beforeunload 中调用 flushPersist',
    /beforeunload[\s\S]{0,500}?VariableStore[\s\S]{0,200}?flushPersist/.test(coreJs),
    '页面卸载前应调用 VariableStore.flushPersist() 强制落盘'
);

// 9. _persistGlobal 仍然存在（被 flushPersist 调用）
check(
    '_persistGlobal 方法仍存在',
    /_persistGlobal\s*\(\s*\)\s*\{/.test(compatJs),
    '_persistGlobal 仍是落盘主体，flushPersist 调它同步执行'
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
    console.log('[FAIL] VariableStore defer verification failed');
    process.exit(1);
}
console.log('[OK] VariableStore defer verified');
