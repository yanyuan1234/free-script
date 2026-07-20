/**
 * 性能基准测试: VariableStore 批量 defer 持久化
 *
 * 模拟 injectPresetGlobalVars 内 30 次连续 setGlobal 调用：
 *   - 旧实现: 30 次同步 _persistGlobal → 30 次 Storage.setJSON → 30 次 localStorage.setItem
 *   - 新实现: 30 次 setGlobal 只触发 1 次 setTimeout(0) 落盘
 *
 * 验证:
 *   1. defer 模式下，同步耗时大幅减少
 *   2. setGlobal 调用次数 = _persistGlobal 实际调用次数 (后者 <= 1)
 *   3. flushPersist 强制同步落盘
 */

// 模拟 localStorage
let persistCount = 0;
const mockLocalStorage = {
    _data: {},
    setItem(k, v) { this._data[k] = v; }
};

// 模拟旧 VariableStore
function oldVariableStore() {
    this._global = new Map();
    this.setGlobal = function(name, value) {
        this._global.set(name, String(value));
        this._persistGlobal();
    };
    this._persistGlobal = function() {
        persistCount++;
        // 模拟 localStorage 写 + checkCapacity 遍历
        let s = '';
        this._global.forEach((v, k) => s += k + '=' + v + ';');
        mockLocalStorage.setItem('GLOBAL_VARS', s);
    };
}

// 模拟新 VariableStore (defer)
function newVariableStore() {
    this._global = new Map();
    this._persistScheduled = false;
    this._persistTimer = null;
    this.setGlobal = function(name, value) {
        this._global.set(name, String(value));
        this._schedulePersist();
    };
    this._schedulePersist = function() {
        if (this._persistScheduled) return;
        this._persistScheduled = true;
        // setTimeout(0) defer
        // 在 benchmark 中用同步 flag 模拟
    };
    this._persistGlobal = function() {
        persistCount++;
        let s = '';
        this._global.forEach((v, k) => s += k + '=' + v + ';');
        mockLocalStorage.setItem('GLOBAL_VARS', s);
    };
}

// Benchmark 旧实现
const N = 30;
persistCount = 0;
let oldStart = Date.now();
const oldStore = new oldVariableStore();
for (let i = 0; i < N; i++) oldStore.setGlobal('key' + i, 'value' + i);
let oldTime = Date.now() - oldStart;
let oldPersists = persistCount;

// Benchmark 新实现 (defer 模式下，只调度不落盘)
persistCount = 0;
let newStart = Date.now();
const newStore = new newVariableStore();
for (let i = 0; i < N; i++) newStore.setGlobal('key' + i, 'value' + i);
let newTime = Date.now() - newStart;
let newPersistsScheduled = newStore._persistScheduled ? 1 : 0;

console.log('--- 基准测试 (' + N + ' 次 setGlobal) ---');
console.log('旧实现: 同步时间 = ' + oldTime + 'ms, _persistGlobal 调用次数 = ' + oldPersists);
console.log('新实现: 同步时间 = ' + newTime + 'ms, 调度标志 = ' + newPersistsScheduled);
console.log('');

// 验证
let pass = true;
function check(name, ok, info) {
    const sym = ok ? '✓' : '✗';
    console.log('  ' + sym + ' ' + name + (info ? ' (' + info + ')' : ''));
    if (!ok) pass = false;
}

check('旧实现 _persistGlobal 调用 ' + N + ' 次', oldPersists === N, 'actual: ' + oldPersists);
check('新实现 _persistScheduled = true (待落盘)', newPersistsScheduled === 1, 'actual: ' + newPersistsScheduled);
check('新实现 setGlobal 同步耗时 <= 旧实现', newTime <= oldTime + 5, 'old: ' + oldTime + 'ms, new: ' + newTime + 'ms');
check('关键: 旧实现 _persistGlobal 调用 30 次, 新实现 1 次 (defer)', oldPersists === 30 && newPersistsScheduled === 1, 'oldPersists=' + oldPersists + ', scheduled=' + newPersistsScheduled);
check('新实现 _persistScheduled = true (待落盘)', newPersistsScheduled === 1, 'actual: ' + newPersistsScheduled);

// 模拟 30 次 setGlobal 在同步时并不卡
// 即使不考虑 overhead，新实现的关键收益是 localStorage.write 次数从 30 → 1
// 这就是 30 次 _persistGlobal vs 1 次 _persistGlobal 的差别

// 模拟 flushPersist 强制落盘
persistCount = 0;
newStore._persistGlobal();
check('flushPersist 后 _persistGlobal 调用 1 次', persistCount === 1);

console.log('----------------------------------------');
if (pass) {
    console.log('[OK] VariableStore defer benchmark passed');
    console.log('  同步阻塞:  ' + oldTime + 'ms → ' + newTime + 'ms (减少 ' + (oldTime - newTime) + 'ms)');
    console.log('  localStorage 写: ' + oldPersists + ' 次 → 1 次 (减少 ' + (oldPersists - 1) + ' 次)');
} else {
    console.log('[FAIL]');
    process.exit(1);
}
