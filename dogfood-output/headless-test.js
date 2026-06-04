// Headless dogfood: 模拟用户操作，验证 phone-ui.js 里 saveGameSettings / loadGameSettings
// 的字数控制修复是否真正生效。
//
// 策略：从真实的 phone-ui.js 抽取 saveGameSettings 和 loadGameSettings 函数，
// 注入到一个 fake DOM 中（jQuery-free），逐步模拟用户操作，对比 localStorage 状态。

const fs = require('fs');
const path = require('path');
const vm = require('vm');

class FakeElement {
  constructor(id, tagName = 'input', value = '', type = 'text', checked = false) {
    this.id = id;
    this.tagName = tagName;
    // 兼容 makeInput(id, value, type, checked) 5 参调用
    if (typeof tagName === 'string' && arguments.length >= 3) {
      // tagName 形参实际上可能是 value（5 参调用）
      // 通过参数数量判断
    }
    this.value = value;
    this.type = type;
    this.checked = checked;
    this.classList = {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); }
    };
    this._listeners = {};
  }
  addEventListener(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
  }
  dispatchEvent(event) {
    const handlers = this._listeners[event] || [];
    handlers.forEach(h => h({ target: this }));
  }
  querySelector(sel) { return null; }
}

class FakeDocument {
  constructor() { this.elements = {}; }
  getElementById(id) { return this.elements[id] || null; }
  querySelector(sel) { return null; }
  querySelectorAll(sel) { return []; }
}

const storage = {};
const localStorage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem(k, v) { storage[k] = String(v); console.log('  [setItem]', k, '=', String(v).slice(0,80)); },
  removeItem(k) { delete storage[k]; },
  clear() { Object.keys(storage).forEach(k => delete storage[k]); }
};

const doc = new FakeDocument();
function makeInput(id, value, type = 'text', checked = false) {
  const el = new FakeElement(id, 'input', value, type, checked);
  doc.elements[id] = el;
  return el;
}
function makeSelect(id, value) {
  const el = new FakeElement(id, 'select', value);
  doc.elements[id] = el;
  return el;
}

const gameState = {
  wordCountConfig: null,
  useStream: true,
  temperature: 0.8,
  fontSize: 16,
  autoCompress: true,
  generateChoices: true,
  maxTokens: 2048
};
const PresetManager = { currentParams: { temperature: 0.8, max_tokens: 2048 } };
const UI = { toast: () => {} };
function safeSetItem(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function applyFontSize() {}

const phoneUiSrc = fs.readFileSync('/workspace/js/phone-ui.js', 'utf8');

function extractFn(src, signature) {
  const idx = src.indexOf(signature);
  if (idx < 0) throw new Error('not found: ' + signature);
  let depth = 0;
  let i = src.indexOf('{', idx);
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(idx, i + 1);
    }
  }
  throw new Error('unbalanced braces in ' + signature);
}

const saveFnSrc = extractFn(phoneUiSrc, 'function saveGameSettings()');
const loadFnSrc = extractFn(phoneUiSrc, 'function loadGameSettings()');
console.log('--- 抽取到的 saveGameSettings 头 10 行 ---');
console.log(saveFnSrc.split('\n').slice(0, 10).join('\n'));

const ctx = {
  document: doc, localStorage, gameState, PresetManager, UI,
  safeSetItem, applyFontSize,
  Object, Array, JSON, parseInt, parseFloat, Number, String, Boolean, Math, Date, console
};
vm.createContext(ctx);
vm.runInContext(saveFnSrc + '\n' + loadFnSrc, ctx);
const { saveGameSettings, loadGameSettings } = ctx;

const WC_IDS = ['wcEnabled','wcMin','wcMax','wcParaMin','wcParaMax',
  'wcParagraphStyle','wcPerspective','wcUserPronoun',
  'wcTakeover','wcNarrate','wcLengthPreset','settingStoryLength'];

const results = [];
function assert(name, cond, detail) {
  results.push({ name, pass: !!cond, detail });
  console.log((cond ? '✅' : '❌') + ' ' + name + (detail ? '  → ' + detail : ''));
}

makeInput('wcEnabled', '', 'checkbox', true);
makeInput('wcMin', '1500');
makeInput('wcMax', '3000');
makeInput('wcParaMin', '15');
makeInput('wcParaMax', '17');
makeSelect('wcParagraphStyle', 'medium');
makeSelect('wcPerspective', 'third_person_limited');
makeSelect('wcUserPronoun', 'second_person');
makeSelect('wcTakeover', 'closed');
makeSelect('wcNarrate', 'closed');
makeSelect('wcLengthPreset', 'medium');
makeInput('settingStoryLength', '2048');

// 模拟「bindEvents」里我加的修复：把 change/input 绑到 saveGameSettings
WC_IDS.forEach(id => {
  const el = doc.getElementById(id);
  if (el) {
    el.addEventListener('change', saveGameSettings);
    el.addEventListener('input', saveGameSettings);
  } else {
    console.log('  [bind] no element for', id);
  }
});

localStorage.clear();
loadGameSettings();
assert('A1. 初始加载：wcMin 默认为 1500',
  doc.getElementById('wcMin').value === '1500',
  'actual=' + doc.getElementById('wcMin').value);
assert('A2. 初始加载：settingStoryLength 默认为 2048',
  doc.getElementById('settingStoryLength').value === '2048',
  'actual=' + doc.getElementById('settingStoryLength').value);

const wcMin = doc.getElementById('wcMin');
wcMin.value = '800';
console.log('  [B1] dispatching input, listeners:', wcMin._listeners);
wcMin.dispatchEvent('input');
const saved1 = JSON.parse(localStorage.getItem('freeScript_settings') || '{}');
assert('B1. 改 wcMin 后 localStorage.wordCountConfig.min === 800',
  saved1.wordCountConfig && saved1.wordCountConfig.min === 800,
  'saved=' + JSON.stringify(saved1.wordCountConfig));

const wcEnabled = doc.getElementById('wcEnabled');
wcEnabled.checked = false;
wcEnabled.dispatchEvent('change');
const saved2 = JSON.parse(localStorage.getItem('freeScript_settings') || '{}');
assert('C1. 取消 wcEnabled 后 wordCountConfig.enabled === false',
  saved2.wordCountConfig && saved2.wordCountConfig.enabled === false,
  'saved=' + JSON.stringify(saved2.wordCountConfig));

const wcStyle = doc.getElementById('wcParagraphStyle');
wcStyle.value = 'long';
wcStyle.dispatchEvent('change');
const saved3 = JSON.parse(localStorage.getItem('freeScript_settings') || '{}');
assert('D1. 切换段落风格为 long → paragraphStyle === "long"',
  saved3.wordCountConfig && saved3.wordCountConfig.paragraphStyle === 'long',
  'saved=' + JSON.stringify(saved3.wordCountConfig));

const storyLen = doc.getElementById('settingStoryLength');
storyLen.value = '4096';
storyLen.dispatchEvent('input');
const saved4 = JSON.parse(localStorage.getItem('freeScript_settings') || '{}');
assert('E1. 改 settingStoryLength → maxTokens === 4096',
  saved4.maxTokens === 4096,
  'saved.maxTokens=' + saved4.maxTokens);
assert('E2. 改 settingStoryLength → PresetManager.currentParams.max_tokens === 4096',
  PresetManager.currentParams.max_tokens === 4096,
  'PresetManager.currentParams.max_tokens=' + PresetManager.currentParams.max_tokens);

gameState.wordCountConfig = null;
doc.getElementById('wcMin').value = '1500';
doc.getElementById('wcMax').value = '3000';
doc.getElementById('wcParaMin').value = '15';
doc.getElementById('wcParaMax').value = '17';
doc.getElementById('wcParagraphStyle').value = 'medium';
doc.getElementById('wcPerspective').value = 'third_person_limited';
doc.getElementById('wcUserPronoun').value = 'second_person';
doc.getElementById('wcTakeover').value = 'closed';
doc.getElementById('wcNarrate').value = 'closed';
doc.getElementById('wcEnabled').checked = true;
loadGameSettings();
assert('F1. 重开后 wcMin 恢复为 800（用户保存的值）',
  String(doc.getElementById('wcMin').value) === '800',
  'actual=' + JSON.stringify(doc.getElementById('wcMin').value));
assert('F2. 重开后 wcMax 保持 3000（未改）',
  String(doc.getElementById('wcMax').value) === '3000',
  'actual=' + JSON.stringify(doc.getElementById('wcMax').value));
assert('F3. 重开后 wcParagraphStyle 恢复为 long',
  doc.getElementById('wcParagraphStyle').value === 'long',
  'actual=' + doc.getElementById('wcParagraphStyle').value);
assert('F4. 重开后 settingStoryLength 恢复为 4096',
  doc.getElementById('settingStoryLength').value === '4096',
  'actual=' + doc.getElementById('settingStoryLength').value);

const wcMax = doc.getElementById('wcMax');
wcMax.value = '';
wcMax.dispatchEvent('change');
const saved5 = JSON.parse(localStorage.getItem('freeScript_settings') || '{}');
assert('G1. wcMax 清空时落回默认 3000',
  saved5.wordCountConfig && saved5.wordCountConfig.max === 3000,
  'saved=' + JSON.stringify(saved5.wordCountConfig));

// --- 额外回归测试：剩余字段（wcPerspective / wcUserPronoun / wcTakeover / wcNarrate / wcLengthPreset）---
const wcPerspective = doc.getElementById('wcPerspective');
wcPerspective.value = 'first_person_limited';
wcPerspective.dispatchEvent('change');
const saved6 = JSON.parse(localStorage.getItem('freeScript_settings') || '{}');
assert('H1. 切换叙述视角 → wordCountConfig.perspective === "first_person_limited"',
  saved6.wordCountConfig && saved6.wordCountConfig.perspective === 'first_person_limited',
  'perspective=' + saved6.wordCountConfig.perspective);

const wcTakeover = doc.getElementById('wcTakeover');
wcTakeover.value = 'open';
wcTakeover.dispatchEvent('change');
const saved7 = JSON.parse(localStorage.getItem('freeScript_settings') || '{}');
assert('H2. 切换演绎授权为 open → wordCountConfig.takeover === "open"',
  saved7.wordCountConfig && saved7.wordCountConfig.takeover === 'open',
  'takeover=' + saved7.wordCountConfig.takeover);

const wcLengthPreset = doc.getElementById('wcLengthPreset');
wcLengthPreset.value = 'long';
wcLengthPreset.dispatchEvent('change');
const saved8 = JSON.parse(localStorage.getItem('freeScript_settings') || '{}');
assert('H3. 切换长度预设为 long → wordCountConfig.lengthPreset === "long"',
  saved8.wordCountConfig && saved8.wordCountConfig.lengthPreset === 'long',
  'lengthPreset=' + saved8.wordCountConfig.lengthPreset);

// --- 边界：保存风暴（连按 5 次 input）---
const wcMin2 = doc.getElementById('wcMin');
wcMin2.value = '900';
wcMin2.dispatchEvent('input');
wcMin2.value = '1000';
wcMin2.dispatchEvent('input');
wcMin2.value = '1100';
wcMin2.dispatchEvent('input');
wcMin2.value = '1200';
wcMin2.dispatchEvent('input');
wcMin2.value = '1300';
wcMin2.dispatchEvent('input');
const saved9 = JSON.parse(localStorage.getItem('freeScript_settings') || '{}');
assert('I1. 连续 input 5 次后落盘值为最终值 1300',
  saved9.wordCountConfig && saved9.wordCountConfig.min === 1300,
  'min=' + saved9.wordCountConfig.min);

// --- 边界：wcMin > wcMax（用户输入不合法组合）---
const wcMin3 = doc.getElementById('wcMin');
wcMin3.value = '5000';
wcMin3.dispatchEvent('input');
const wcMax3 = doc.getElementById('wcMax');
wcMax3.value = '2000';
wcMax3.dispatchEvent('input');
const saved10 = JSON.parse(localStorage.getItem('freeScript_settings') || '{}');
assert('J1. wcMin(5000) > wcMax(2000) 时仍照单全收（UI 层未做交叉校验）',
  saved10.wordCountConfig.min === 5000 && saved10.wordCountConfig.max === 2000,
  'min=' + saved10.wordCountConfig.min + ' max=' + saved10.wordCountConfig.max);

// --- 重开后的状态 ---
gameState.wordCountConfig = null;
doc.getElementById('wcMin').value = '1500';
doc.getElementById('wcMax').value = '3000';
doc.getElementById('wcPerspective').value = 'third_person_limited';
doc.getElementById('wcTakeover').value = 'closed';
doc.getElementById('wcLengthPreset').value = 'medium';
loadGameSettings();
assert('K1. 重开后 wcPerspective 恢复为 first_person_limited',
  doc.getElementById('wcPerspective').value === 'first_person_limited',
  'actual=' + doc.getElementById('wcPerspective').value);
assert('K2. 重开后 wcTakeover 恢复为 open',
  doc.getElementById('wcTakeover').value === 'open',
  'actual=' + doc.getElementById('wcTakeover').value);
assert('K3. 重开后 wcLengthPreset 恢复为 long',
  doc.getElementById('wcLengthPreset').value === 'long',
  'actual=' + doc.getElementById('wcLengthPreset').value);

const passed = results.filter(r => r.pass).length;
const failed = results.length - passed;
console.log('\n=== 汇总 ===');
console.log('total=' + results.length + ' passed=' + passed + ' failed=' + failed);
process.exit(failed === 0 ? 0 : 1);
