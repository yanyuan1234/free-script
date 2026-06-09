/**
 * 构建脚本 - 合并+压缩 JS/CSS 并生成 dist/ 目录
 * 用法: node scripts/build.js
 *
 * 优化策略：
 * - 10个JS → 1个合并压缩文件 app.js（减少HTTP请求，加速加载）
 * - 5个CSS → 1个合并压缩文件 app.css
 * - index.html 中的 script/link 标签自动替换为合并后的引用
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIST = path.join(__dirname, '..', 'dist');
const ROOT = path.join(__dirname, '..');

// JS 文件加载顺序（必须和 index.html 中的顺序一致）
const JS_ORDER = [
    'utils.js',
    'core.js',
    'worldinfo.js',
    'modules.js',
    'game.js',
    'phone-ui.js',
    'systems.js',
    'tavern-compat.js',
    'init.js',
    'patch.js'
];

// CSS 文件加载顺序（必须和 index.html 中的顺序一致）
const CSS_ORDER = [
    'base.css',
    'menu.css',
    'pages.css',
    'phone-ui.css',
    'systems.css'
];

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
    ensureDir(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// 压缩单个 JS 代码字符串
function minifyJSCode(code, filename) {
    try {
        const result = execSync(
            `npx terser --compress --mangle --comments false --`,
            { input: code, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        return result;
    } catch (e) {
        console.warn(`  [WARN] terser 失败，使用原始代码: ${filename}`);
        return code;
    }
}

// 压缩单个 CSS 代码字符串
function minifyCSSCode(code, filename) {
    try {
        const CleanCSS = require('clean-css');
        const result = new CleanCSS({ level: 2 }).minify(code);
        if (result.errors.length > 0) {
            console.warn(`  [WARN] clean-css 错误 (${filename}): ${result.errors.join('; ')}`);
        }
        return result.styles;
    } catch (e) {
        console.warn(`  [WARN] clean-css 失败，使用原始代码: ${filename}`);
        return code;
    }
}

// 合并并压缩 JS 文件
function bundleJS(jsDir) {
    console.log('\n[Build] 合并+压缩 JS...');
    let totalSrc = 0;
    const parts = [];

    for (const file of JS_ORDER) {
        const srcPath = path.join(jsDir, file);
        if (!fs.existsSync(srcPath)) {
            console.warn(`  [WARN] 文件不存在，跳过: ${file}`);
            continue;
        }
        const code = fs.readFileSync(srcPath, 'utf-8');
        totalSrc += code.length;
        const minified = minifyJSCode(code, file);
        const pct = ((1 - minified.length / code.length) * 100).toFixed(1);
        console.log(`  ${file}: ${(code.length/1024).toFixed(1)}KB → ${(minified.length/1024).toFixed(1)}KB (-${pct}%)`);
        // 每个文件之间加分号和换行，防止合并时语法冲突
        parts.push(minified);
    }

    const bundled = parts.join(';\n');
    console.log(`  合计: ${(totalSrc/1024).toFixed(0)}KB → ${(bundled.length/1024).toFixed(0)}KB (-${((1 - bundled.length / totalSrc) * 100).toFixed(1)}%)`);
    return { code: bundled, srcSize: totalSrc };
}

// 合并并压缩 CSS 文件
function bundleCSS(cssDir) {
    console.log('\n[Build] 合并+压缩 CSS...');
    let totalSrc = 0;
    const parts = [];

    for (const file of CSS_ORDER) {
        const srcPath = path.join(cssDir, file);
        if (!fs.existsSync(srcPath)) {
            console.warn(`  [WARN] 文件不存在，跳过: ${file}`);
            continue;
        }
        const code = fs.readFileSync(srcPath, 'utf-8');
        totalSrc += code.length;
        const minified = minifyCSSCode(code, file);
        const pct = ((1 - minified.length / code.length) * 100).toFixed(1);
        console.log(`  ${file}: ${(code.length/1024).toFixed(1)}KB → ${(minified.length/1024).toFixed(1)}KB (-${pct}%)`);
        parts.push(minified);
    }

    const bundled = parts.join('\n');
    console.log(`  合计: ${(totalSrc/1024).toFixed(0)}KB → ${(bundled.length/1024).toFixed(0)}KB (-${((1 - bundled.length / totalSrc) * 100).toFixed(1)}%)`);
    return { code: bundled, srcSize: totalSrc };
}

// 替换 index.html 中的 script 和 link 标签
function rewriteHTML(htmlContent) {
    // 删除所有 <script src="js/xxx.js" defer></script>
    let result = htmlContent.replace(/<script\s+src="js\/[^"]+\.js"\s+defer><\/script>\s*\n?/g, '');

    // 删除所有 <link rel="stylesheet" href="css/xxx.css">
    result = result.replace(/<link\s+rel="stylesheet"\s+href="css\/[^"]+\.css">\s*\n?/g, '');

    // 在 </head> 前插入合并后的 CSS
    result = result.replace('</head>', '<link rel="stylesheet" href="css/app.css">\n</head>');

    // 在 </body> 前插入合并后的 JS
    result = result.replace('</body>', '<script src="js/app.js" defer></script>\n</body>');

    return result;
}

async function main() {
    console.log('[Build] 开始构建...\n');

    // 清理旧 dist
    if (fs.existsSync(DIST)) {
        fs.rmSync(DIST, { recursive: true });
    }
    ensureDir(DIST);

    // 复制非 JS/CSS 文件
    console.log('[Build] 复制静态资源...');
    const rootEntries = fs.readdirSync(ROOT, { withFileTypes: true });
    for (const entry of rootEntries) {
        const name = entry.name;
        const srcPath = path.join(ROOT, name);
        const destPath = path.join(DIST, name);

        if (name === 'dist' || name === 'node_modules' || name === '.git' ||
            name === '.github' || name === 'scripts' || name === 'package.json' ||
            name === 'package-lock.json' || name === '.trae' || name === 'backup' ||
            name === 'dogfood-output' || name === 'CODE_WIKI.md') {
            continue;
        }

        if (entry.isDirectory()) {
            if (name === 'js' || name === 'css') {
                // JS/CSS 目录不复制，后面单独处理
                continue;
            }
            copyDir(srcPath, destPath);
        } else if (name === 'index.html') {
            // index.html 稍后处理
            continue;
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }

    // 合并+压缩 JS → dist/js/app.js
    const jsResult = bundleJS(path.join(ROOT, 'js'));
    ensureDir(path.join(DIST, 'js'));
    fs.writeFileSync(path.join(DIST, 'js', 'app.js'), jsResult.code, 'utf-8');

    // 合并+压缩 CSS → dist/css/app.css
    const cssResult = bundleCSS(path.join(ROOT, 'css'));
    ensureDir(path.join(DIST, 'css'));
    fs.writeFileSync(path.join(DIST, 'css', 'app.css'), cssResult.code, 'utf-8');

    // 处理 index.html - 替换为合并后的引用
    console.log('\n[Build] 处理 index.html...');
    const htmlContent = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
    const newHtml = rewriteHTML(htmlContent);
    fs.writeFileSync(path.join(DIST, 'index.html'), newHtml, 'utf-8');

    // 汇总
    const totalSrc = jsResult.srcSize + cssResult.srcSize;
    const totalDest = jsResult.code.length + cssResult.code.length;
    const totalPct = ((1 - totalDest / totalSrc) * 100).toFixed(1);

    console.log('\n' + '='.repeat(50));
    console.log(`[Build] 构建完成!`);
    console.log(`  JS:  10个文件 → 1个 app.js (${(jsResult.code.length/1024).toFixed(0)}KB)`);
    console.log(`  CSS:  5个文件 → 1个 app.css (${(cssResult.code.length/1024).toFixed(0)}KB)`);
    console.log(`  总计: ${(totalSrc/1024).toFixed(0)}KB → ${(totalDest/1024).toFixed(0)}KB (-${totalPct}%)`);
    console.log(`  HTTP请求: 15个 → 2个`);
    console.log('='.repeat(50));
}

main().catch(err => {
    console.error('[Build] 构建失败:', err);
    process.exit(1);
});
