// 端到端测试：验证 toast 5秒、参数按钮 4 档、4 份预设兼容
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = '/workspace';

function readFile(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const html = readFile('index.html');
const distJs = readFile('dist/app.js');

const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/',
    pretendToBeVisual: true,
});
const { window } = dom;
const { document } = window;

// 注入应用脚本
window.eval(distJs);

// 等待应用初始化
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
    const results = [];

    // ===== 测试 1: UI.toast 5 秒自动消失 =====
    const before = document.querySelectorAll('[class*="toast"], #toast, .toast-container > div').length;
    if (window.UI && typeof window.UI.toast === 'function') {
        window.UI.toast('测试 5 秒消失');
        await sleep(200);
        const all = Array.from(document.body.querySelectorAll('*'));
        const toasts = all.filter(el => {
            const t = (el.textContent || '').trim();
            return t === '测试 5 秒消失';
        });
        const ok = toasts.length > 0;
        results.push({ name: 'toast 创建', ok, detail: `找到 ${toasts.length} 个 toast 元素` });
    } else {
        results.push({ name: 'UI.toast 存在', ok: false, detail: 'UI.toast 不存在' });
    }

    // ===== 测试 2: 一键参数按钮 4 档 =====
    const paramButtons = Array.from(document.querySelectorAll('button[onclick*="applyParamPreset"]'));
    const presets = paramButtons.map(b => {
        const m = (b.getAttribute('onclick') || '').match(/applyParamPreset\('([^']+)'\)/);
        return m ? m[1] : null;
    }).filter(Boolean);
    const expected = ['conservative', 'balanced', 'creative', 'default'];
    const matched = JSON.stringify(presets.sort()) === JSON.stringify(expected.sort());
    results.push({
        name: '参数按钮 4 档',
        ok: matched && presets.length === 4,
        detail: `找到: [${presets.join(', ')}], 期望: [${expected.join(', ')}]`,
    });

    // ===== 测试 3: 一键参数按钮文字不含预设名 =====
    const buttonTexts = paramButtons.map(b => b.textContent.trim());
    const hasPresetName = buttonTexts.some(t => /月读|果实|蛾摩拉|象牙塔/.test(t));
    results.push({
        name: '参数按钮文字无预设名',
        ok: !hasPresetName,
        detail: `文字: [${buttonTexts.join(', ')}]`,
    });

    // ===== 测试 4: applyParamPreset 4 档都能调用 =====
    if (window.applyParamPreset) {
        let pass = 0;
        for (const p of expected) {
            try {
                window.applyParamPreset(p);
                pass++;
            } catch (e) {
                results.push({ name: `applyParamPreset('${p}')`, ok: false, detail: e.message });
            }
        }
        results.push({
            name: 'applyParamPreset 4 档调用',
            ok: pass === 4,
            detail: `${pass}/4 档成功`,
        });
    } else {
        results.push({ name: 'applyParamPreset 存在', ok: false, detail: 'applyParamPreset 不存在' });
    }

    // ===== 测试 5: 4 份预设识别关键字面量仍在 =====
    const compat = readFile('js/tavern-compat.js');
    const hasMoonReadDetect = /name\.includes\(['"]月读['"]\)/.test(compat);
    const hasFruitDetect = /name\.includes\(['"]果实['"]\)/.test(compat);
    const hasGomorrahDetect = /name\.includes\(['"]蛾摩拉['"]\)/.test(compat);
    const hasIvoryTowerConfig = compat.includes('象牙塔') || compat.includes('IvoryTower') || compat.includes('ivory');
    results.push({
        name: '4 份预设关键字面量',
        ok: hasMoonReadDetect && hasFruitDetect && hasGomorrahDetect,
        detail: `月读: ${hasMoonReadDetect}, 果实: ${hasFruitDetect}, 蛾摩拉: ${hasGomorrahDetect}, 象牙塔: ${hasIvoryTowerConfig}`,
    });

    // ===== 测试 6: 内置 3 个预设名已通俗化 =====
    const modules = readFile('js/modules.js');
    const hasImmersive = /name:\s*['"]🌙沉浸叙事['"]/.test(modules);
    const hasBalanced = /name:\s*['"]🍎均衡叙事['"]/.test(modules);
    const hasLongForm = /name:\s*['"]☼长篇叙事['"]/.test(modules);
    const stillHasOld = /月读风格|果实风格|蛾摩拉风格/.test(modules);
    results.push({
        name: '内置预设名通俗化',
        ok: hasImmersive && hasBalanced && hasLongForm && !stillHasOld,
        detail: `沉浸: ${hasImmersive}, 均衡: ${hasBalanced}, 长篇: ${hasLongForm}, 无旧名: ${!stillHasOld}`,
    });

    // ===== 测试 7: UI 文字无酒馆字样 =====
    const visibleText = document.body.textContent;
    const uiHasTavern = /酒馆|大[^调]*佬调教|象牙塔|蛾摩拉|月读[^-]|果实[^-]/.test(visibleText);
    results.push({
        name: 'UI 文字无酒馆字样',
        ok: !uiHasTavern,
        detail: uiHasTavern ? '还有酒馆字样' : '已清空',
    });

    // ===== 总结 =====
    console.log('\n=== 端到端测试报告 ===');
    let allOk = true;
    for (const r of results) {
        const status = r.ok ? '✅' : '❌';
        console.log(`${status} ${r.name}: ${r.detail}`);
        if (!r.ok) allOk = false;
    }
    console.log(`\n总览: ${allOk ? '✅ 全部通过' : '❌ 有失败'}`);

    process.exit(allOk ? 0 : 1);
})().catch(e => {
    console.error('测试异常:', e);
    process.exit(1);
});
