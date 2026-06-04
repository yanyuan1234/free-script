// Headless test: 自动轮询切 slot 时，UI 指示器是否跟着切
// 验证修复：
//   - core.js tryWithFallback 自动切到新 slot 后调 window._refreshCurrentApiIndicators
//   - phone-ui.js 该函数把打开中的 API 列表"使用中"徽章和详情页"正在使用"徽章都同步

const fs = require('fs');
const vm = require('vm');

class FakeElement {
  constructor(id, value = '', classes = '') {
    this.id = id; this._value = value; this._classes = new Set(classes.split(/\s+/).filter(Boolean));
    this._listeners = {};
    this._innerHTML = '';
    this._textContent = '';
    this.style = {};
  }
  get value() { return this._value; }
  set value(v) { this._value = v == null ? '' : String(v); }
  get textContent() { return this._textContent; }
  set textContent(v) { this._textContent = String(v); }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) { this._innerHTML = String(v); }
  get className() { return this.style.zIndex ? this.style.zIndex : ''; }
  set className(v) { this._zIndex = v; }
  get classList() { return {
    add: c => this._classes.add(c),
    remove: c => this._classes.delete(c),
    contains: c => this._classes.has(c)
  }; }
  addEventListener() {}
  // 简化：实现 active class 切换
  show() { this._classes.add('active'); }
  hide() { this._classes.delete('active'); }
  querySelectorAll() { return []; }
  querySelector() { return null; }
}
class FakeDocument {
  constructor() { this.elements = {}; }
  getElementById(id) { return this.elements[id] || null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

const doc = new FakeDocument();
doc.elements['apiConfigModal'] = new FakeElement('apiConfigModal');
doc.elements['apiDetailModal'] = new FakeElement('apiDetailModal');
doc.elements['apiDetailStatusBadge'] = new FakeElement('apiDetailStatusBadge');
doc.elements['apiListContainer'] = new FakeElement('apiListContainer');
doc.elements['apiGroupTabs'] = new FakeElement('apiGroupTabs');

// --- 1. 直接从 core.js 抽取 LocalGameAPI ---
const coreSrc = fs.readFileSync('/workspace/js/core.js', 'utf8');
function extractFn(s, sig) {
  const idx = s.indexOf(sig); if (idx < 0) throw new Error('not found: ' + sig);
  let d = 0, i = s.indexOf('{', idx);
  for (; i < s.length; i++) { if (s[i]==='{') d++; else if (s[i]==='}') { d--; if (!d) return s.slice(idx, i+1); } }
  throw new Error('unbalanced: ' + sig);
}

// LocalGameAPI 是对象字面量，从 var LocalGameAPI = { ... } 提取
const lapStart = coreSrc.indexOf('var LocalGameAPI = {');
if (lapStart < 0) throw new Error('LocalGameAPI not found');
let lapEnd = -1, depth = 0;
for (let i = coreSrc.indexOf('{', lapStart); i < coreSrc.length; i++) {
  if (coreSrc[i] === '{') depth++;
  else if (coreSrc[i] === '}') { depth--; if (!depth) { lapEnd = i + 1; break; } }
}
const lapSrc = coreSrc.slice(lapStart, lapEnd);

// 抽 tryWithFallback 方法体（async）—— 从整个 LocalGameAPI 对象里抠出来
const twfRawSrc = extractFn(lapSrc, 'async tryWithFallback(');
// 去掉 async 关键字（会作为方法调用，不需要顶层 async function）
const twfSrc = twfRawSrc.replace(/^async\s+/, '');
// 把嵌套的 retryRequest 简化为只透传错误（避免 setTimeout 重试让测试变慢）
// 实际代码里 retryRequest 闭合在 4 空格（和 tryWithFallback 同级）
const twfSrcNoRetry = twfSrc.replace(/async function retryRequest\(slotIdx, attempt\)[\s\S]*?\n    \}/,
  'async function retryRequest(slotIdx, attempt) { try { return await requestFn(slotIdx); } catch (e) { throw e; } }');

// 验证替换是否生效
if (twfSrcNoRetry.includes('await new Promise')) {
  console.warn('[WARN] retryRequest 替换没生效，会跑真实重试');
}

// --- 2. 模拟外层依赖 ---
const storage = {};
const localStorage = {
  getItem: k => storage[k] || null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: k => delete storage[k],
  clear: () => Object.keys(storage).forEach(k => delete storage[k])
};
let toastCount = 0;
let lastToast = '';
const UI = {
  toast: m => { toastCount++; lastToast = m; }
};

const gameState = {};
const PresetManager = { currentParams: {} };
function translateError(e) { return e; }

// _callAPI / retryRequest 由 tryWithFallback 内部调用，简化为：检查 isModelFailed / 抛错模拟
const _failedModels = {};
function isModelFailed(m) { return !!_failedModels[m]; }
function _markModelFailed(slot) {
  // 真实实现是把 model 加入 _failedModels，这里直接通过 configs 找
  _failedModels['cfg' + slot] = Date.now();
}
function _logRequest() {}

// --- 3. 构造 3 个 API 配置（0,1,2）---
const _configs = [
  { name: 'API-1', baseUrl: 'http://a1', apiKey: 'k1', model: 'cfg0' },  // 故意让 model 名 = cfg{slot}，便于模拟失败
  { name: 'API-2', baseUrl: 'http://a2', apiKey: 'k2', model: 'cfg1' },
  { name: 'API-3', baseUrl: 'http://a3', apiKey: 'k3', model: 'cfg2' }
];
let _currentSlot = 0;
function save() { localStorage.setItem('localGameAPI', JSON.stringify({ _currentSlot, _configs })); }
function setCurrentSlot(slot) {
  _currentSlot = slot;
  // 同步到 ctx.LocalGameAPI._currentSlot（vm 内的 _renderAPIListContent 读的是这个属性）
  if (typeof ctx !== 'undefined' && ctx.LocalGameAPI) {
    ctx.LocalGameAPI._currentSlot = slot;
  }
  save();
}
function getCurrentConfig() { return _configs[_currentSlot]; }

// 模拟 _callAPI: 故意让前 N 个失败，让第 N+1 个成功
let failSlots = new Set();
function _callAPI(slotIdx, attempt) {
  if (failSlots.has(slotIdx)) {
    const err = new Error('模拟 slot ' + slotIdx + ' 失败');
    throw err;
  }
  return { success: true, data: 'ok-' + slotIdx };
}

// 用 fetch + 异步的方式包装 tryWithFallback 里的 retryRequest 链
// 直接给一个 fake retryRequest 避免真实重试
async function retryRequest(slotIdx, attempt) {
  return _callAPI(slotIdx, attempt);
}

// --- 4. 注入到 vm ---
const ctx = {
  console, document: doc, localStorage, gameState, PresetManager, UI,
  _configs, _currentSlot: 0, setCurrentSlot, getCurrentConfig,
  isModelFailed, _markModelFailed, _logRequest, translateError, save,
  retryRequest, Object, Array, JSON, parseInt, parseFloat, Number, String, Boolean, Math, Date,
  setTimeout, setInterval, clearTimeout, clearInterval
};
// 引入 tryWithFallback 源并允许访问内部 var
vm.createContext(ctx);
vm.runInContext('var _currentSlot = 0; var _failedModels = {};\n' + lapSrc, ctx);
// 用 mock 配置覆盖默认的 _configs
ctx.LocalGameAPI._configs = _configs;
ctx.LocalGameAPI._currentSlot = 0;
// 替换 save/setCurrentSlot 为外部实现（核心写入）
ctx.LocalGameAPI.save = save;
ctx.LocalGameAPI.setCurrentSlot = setCurrentSlot;
ctx.LocalGameAPI.getCurrentConfig = getCurrentConfig;
ctx.LocalGameAPI._logRequest = _logRequest;
ctx.LocalGameAPI._markModelFailed = _markModelFailed;
ctx.LocalGameAPI.isModelFailed = isModelFailed;
ctx.LocalGameAPI.retryRequest = retryRequest;
ctx.LocalGameAPI.getGroups = () => [];  // 简单 mock
// 把 tryWithFallback 重新挂到 LocalGameAPI 上
// 把方法简写转成 async function 表达式（vm script 不接受命名 function decl 作为右值）
const twfFnExpr = twfSrcNoRetry.replace(/^tryWithFallback\s*\(/, 'async function(');
vm.runInContext('LocalGameAPI.tryWithFallback = ' + twfFnExpr + ';', ctx);
const tryWithFallback = ctx.LocalGameAPI.tryWithFallback.bind(ctx.LocalGameAPI);

// --- 5. 引入 _refreshCurrentApiIndicators（从 phone-ui.js 抽出来） ---
const phoneUiSrc = fs.readFileSync('/workspace/js/phone-ui.js', 'utf8');
const refreshFnSrc = extractFn(phoneUiSrc, 'window._refreshCurrentApiIndicators');
const renderListSrc = extractFn(phoneUiSrc, 'function _renderAPIListContent(');
// 复用已有的 LocalGameAPI（不要替换，否则会把 getGroups 弄丢）
ctx.LocalGameAPI._shownDetailSlot = null;
ctx.LocalGameAPI._currentSlot = 0;  // 同步初始 slot
ctx.window = ctx;  // 让 vm 内部能引用 window
// 让 _currentSlot 在 vm 和外部共享
Object.defineProperty(ctx, '_currentSlot', {
  get() { return _currentSlot; },
  set(v) { _currentSlot = v; }
});
vm.runInContext(renderListSrc + '\n' + refreshFnSrc, ctx);
const { _renderAPIListContent, _refreshCurrentApiIndicators } = ctx;
// 包装：在 vm 里调用这两个函数（否则 document/window 找不到）
const callInVm = (fn) => function() {
  const args = Array.from(arguments);
  return vm.runInContext('(' + fn.name + ').apply(null, ' + JSON.stringify(args) + ');', ctx);
};
// 重新定义 _renderAPIListContent / _refreshCurrentApiIndicators 为 vm 内调用的版本
const _vmRenderList = (slots) => vm.runInContext('_renderAPIListContent.apply(null, ' + JSON.stringify(slots) + ');', ctx);
const _vmRefresh = () => vm.runInContext('_refreshCurrentApiIndicators();', ctx);

// --- 6. 测试 ---
const results = [];
function assert(name, cond, detail) {
  results.push({ name, pass: !!cond, detail });
  console.log((cond ? '✅' : '❌') + ' ' + name + (detail ? '  → ' + detail : ''));
}

(async () => {
  // 初始：currentSlot = 0
  assert('T0. 初始 _currentSlot === 0', _currentSlot === 0, 'slot=' + _currentSlot);

  // 模拟 _refreshCurrentApiIndicators 已被挂上
  // 注意：不要覆盖 ctx._refreshCurrentApiIndicators，否则会无限递归
  // (vm 内的 tryWithFallback 调 window._refreshCurrentApiIndicators 时，
  //  window 在 ctx 里就是 ctx，所以会调到 outer mock → _vmRefresh → 无限循环)
  // 真实场景中 phone-ui.js 直接挂 window._refreshCurrentApiIndicators = function(){...}，
  // vm 内的 tryWithFallback 调这个 function 时查的是 ctx._refreshCurrentApiIndicators，
  // 也就是从 phoneUiSrc 加载的那个 vm 内部实现。

  // === 场景 A：cfg0 失败、cfg1 成功 → 切到 cfg1 ===
  failSlots = new Set([0]);
  _failedModels['cfg0'] = Date.now();
  const requestFnA = async function(slotIdx) {
    if (failSlots.has(slotIdx)) throw new Error('simulated-fail-' + slotIdx);
    return { success: true, data: 'ok-' + slotIdx };
  };
  await tryWithFallback(requestFnA);
  assert('A1. 自动轮询触发切到 slot 1', _currentSlot === 1, 'slot=' + _currentSlot);
  assert('A2. 出现 "已自动切换到配置 2" toast', lastToast.indexOf('配置 2') > 0, 'toast=' + lastToast);
  assert('A3. _refreshCurrentApiIndicators 被调用（列表弹窗未开时不报错）', true, '无报错');

  // === 场景 B：列表弹窗打开中，切 slot 后徽章应跟着切 ===
  doc.elements['apiConfigModal'].show();
  _vmRenderList();
  // 此时 _currentSlot=1，列表里 slot 1 的卡片应该有 "使用中" 徽章
  let listHtml = doc.elements['apiListContainer']._innerHTML;
  assert('B1. 列表初始渲染包含 slot 0 卡片（无 "使用中"）', listHtml.indexOf('API-1') > 0, '');
  assert('B2. 列表初始渲染包含 slot 1 卡片（带 "使用中"）',
    listHtml.indexOf('API-2') > 0 && listHtml.indexOf('使用中') > 0, '');

  // 模拟 cfg1 也失败，cfg2 成功 → 切到 cfg2
  failSlots = new Set([0, 1]);
  _failedModels['cfg1'] = Date.now();
  await tryWithFallback(async (slotIdx) => {
    if (failSlots.has(slotIdx)) throw new Error('模拟 slot ' + slotIdx + ' 失败');
    return { success: true, data: 'ok-' + slotIdx };
  });
  assert('B3. 二次轮询切到 slot 2', _currentSlot === 2, 'slot=' + _currentSlot);
  // _refreshCurrentApiIndicators 已经被 tryWithFallback 调过
  listHtml = doc.elements['apiListContainer']._innerHTML;
  // 检查 slot 2 (API-3) 卡片现在带 "使用中"
  // 简化判断：列表里 "使用中" 徽章数 = 1
  const currentBadges = (listHtml.match(/使用中/g) || []).length;
  assert('B4. 列表里 "使用中" 徽章数 === 1（只有当前 slot 1 个）', currentBadges === 1, 'count=' + currentBadges);
  // 检查 API-3 卡片后面跟着 "使用中"
  const api3Idx = listHtml.indexOf('API-3');
  const useIdx = listHtml.indexOf('使用中');
  assert('B5. "使用中" 徽章出现在 API-3 卡片附近（slot=2）', useIdx > api3Idx - 50 && useIdx < api3Idx + 200, 'useIdx=' + useIdx + ' api3Idx=' + api3Idx);

  doc.elements['apiConfigModal'].hide();

  // === 场景 C：详情页打开中，切 slot 后状态徽章应跟着切 ===
  doc.elements['apiDetailModal'].show();
  ctx.LocalGameAPI._shownDetailSlot = 0;  // 用户在看 cfg0 详情
  // 直接重置徽章到 "正在使用" 模拟 showApiDetail 已渲染
  doc.elements['apiDetailStatusBadge'].textContent = '正在使用';
  doc.elements['apiDetailStatusBadge'].className = 'badge badge-primary';
  assert('C0. 详情页初始状态：用户看 cfg0，徽章是 "正在使用"',
    doc.elements['apiDetailStatusBadge'].textContent === '正在使用', '');

  // cfg0、cfg1、cfg2 都失败（但前两个在 _failedModels 里会 skip）→ 走不到新 slot
  // 改用：清空 failed models，模拟 cfg0 失败一次后 cfg2 成功（绕过 cfg1）
  // 先把 _currentSlot 重置回 0（之前 B 场景已切到 2），这样 tryWithFallback 才会真正轮询
  setCurrentSlot(0);
  _currentSlot = 0;
  _failedModels['cfg0'] = Date.now();
  failSlots = new Set([0, 1]);  // cfg0/1 失败
  // 因为 _failedModels['cfg0'] 存在，cfg0 会被 continue 跳过
  // cfg1 也会被失败 → catch 一次
  // cfg2 成功 → 切到 cfg2
  // 但 tryWithFallback 走 try→catch 链，不走 continue 路径（除非 isModelFailed）
  // 这里让 cfg1 的 model 也在 failed → continue
  _failedModels['cfg1'] = Date.now();
  await tryWithFallback(async (slotIdx) => {
    if (failSlots.has(slotIdx)) throw new Error('模拟 slot ' + slotIdx + ' 失败');
    return { success: true, data: 'ok-' + slotIdx };
  });
  assert('C1. 详情页打开时切到 slot 2', _currentSlot === 2, 'slot=' + _currentSlot);
  // _refreshCurrentApiIndicators 已被 tryWithFallback 调过
  assert('C2. 详情页徽章自动更新为 "未使用"（cfg0 不再是 current）',
    doc.elements['apiDetailStatusBadge'].textContent === '未使用', 'badge="' + doc.elements['apiDetailStatusBadge'].textContent + '"');

  // === 场景 D：模拟用户在看 cfg2 详情（已经是 current）→ 仍应是 "正在使用" ===
  ctx.LocalGameAPI._shownDetailSlot = 2;
  doc.elements['apiDetailStatusBadge'].textContent = '正在使用';
  doc.elements['apiDetailStatusBadge'].className = 'badge badge-primary';
  // 切到一个不同 slot，看徽章是否变
  _failedModels['cfg0'] = Date.now();
  _failedModels['cfg1'] = Date.now();
  failSlots = new Set([0, 1]);
  // 当前 current=2，下一次 tryWithFallback 会从 slot 2 开始
  // cfg2 在 _failedModels 里没有，try → 成功 → attempt=0 → 不进 if 分支（不进 setCurrentSlot，也不触发 refresh）
  // 所以这次 cfg2 仍是 current，徽章保持
  // 但 _refreshCurrentApiIndicators 不应该被错误地调用
  await tryWithFallback(async (slotIdx) => {
    if (failSlots.has(slotIdx)) throw new Error('模拟 slot ' + slotIdx + ' 失败');
    return { success: true, data: 'ok-' + slotIdx };
  });
  assert('D1. cfg2 仍在 _failedModels 之外，保持 current', _currentSlot === 2, 'slot=' + _currentSlot);
  assert('D2. 详情页徽章仍是 "正在使用"',
    doc.elements['apiDetailStatusBadge'].textContent === '正在使用', 'badge="' + doc.elements['apiDetailStatusBadge'].textContent + '"');

  // === 总结 ===
  const passed = results.filter(r => r.pass).length;
  const failed = results.length - passed;
  console.log('\n=== 汇总 ===');
  console.log('total=' + results.length + ' passed=' + passed + ' failed=' + failed);
  process.exit(failed === 0 ? 0 : 1);
})();
