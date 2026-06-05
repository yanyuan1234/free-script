/**
 * 构建脚本 - 压缩 JS/CSS 并生成 dist/ 目录
 * 用法: node scripts/build.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIST = path.join(__dirname, '..', 'dist');
const ROOT = path.join(__dirname, '..');

// 创建 dist 目录
function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// 复制目录结构
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

// 压缩 JS 文件
function minifyJS(srcPath, destPath) {
    const code = fs.readFileSync(srcPath, 'utf-8');
    try {
        const result = execSync(
            `npx terser --compress --mangle --comments false --`,
            { input: code, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        fs.writeFileSync(destPath, result, 'utf-8');
        return { src: code.length, dest: result.length };
    } catch (e) {
        // 如果 terser 失败，直接复制原文件
        console.warn(`  [WARN] terser 失败，复制原文件: ${path.basename(srcPath)}`);
        fs.copyFileSync(srcPath, destPath);
        return { src: code.length, dest: code.length };
    }
}

// 压缩 CSS 文件
function minifyCSS(srcPath, destPath) {
    const code = fs.readFileSync(srcPath, 'utf-8');
    try {
        const CleanCSS = require('clean-css');
        const result = new CleanCSS({ level: 2 }).minify(code);
        if (result.errors.length > 0) {
            console.warn(`  [WARN] clean-css 错误: ${result.errors.join('; ')}`);
        }
        fs.writeFileSync(destPath, result.styles, 'utf-8');
        return { src: code.length, dest: result.styles.length };
    } catch (e) {
        console.warn(`  [WARN] clean-css 失败，复制原文件: ${path.basename(srcPath)}`);
        fs.copyFileSync(srcPath, destPath);
        return { src: code.length, dest: code.length };
    }
}

// 主流程
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
            name === 'package-lock.json' || name === '.trae') {
            continue;
        }
        
        if (entry.isDirectory()) {
            // 复制整个目录（但 js/ 和 css/ 单独处理）
            if (name === 'js' || name === 'css') {
                ensureDir(destPath);
            } else {
                copyDir(srcPath, destPath);
            }
        } else if (name === 'index.html') {
            // index.html 稍后处理
            continue;
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }

    // 压缩 JS
    console.log('\n[Build] 压缩 JS...');
    const jsDir = path.join(ROOT, 'js');
    const jsDist = path.join(DIST, 'js');
    ensureDir(jsDist);
    
    let totalJSSrc = 0, totalJSDest = 0;
    const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
    for (const file of jsFiles) {
        const result = minifyJS(path.join(jsDir, file), path.join(jsDist, file));
        totalJSSrc += result.src;
        totalJSDest += result.dest;
        const pct = ((1 - result.dest / result.src) * 100).toFixed(1);
        console.log(`  ${file}: ${(result.src/1024).toFixed(1)}KB → ${(result.dest/1024).toFixed(1)}KB (-${pct}%)`);
    }

    // 压缩 CSS
    console.log('\n[Build] 压缩 CSS...');
    const cssDir = path.join(ROOT, 'css');
    const cssDist = path.join(DIST, 'css');
    ensureDir(cssDist);
    
    let totalCSSSrc = 0, totalCSSDest = 0;
    const cssFiles = fs.readdirSync(cssDir).filter(f => f.endsWith('.css'));
    for (const file of cssFiles) {
        const result = minifyCSS(path.join(cssDir, file), path.join(cssDist, file));
        totalCSSSrc += result.src;
        totalCSSDest += result.dest;
        const pct = ((1 - result.dest / result.src) * 100).toFixed(1);
        console.log(`  ${file}: ${(result.src/1024).toFixed(1)}KB → ${(result.dest/1024).toFixed(1)}KB (-${pct}%)`);
    }

    // 处理 index.html - 复制并保持引用不变（文件名没变，只是内容压缩了）
    console.log('\n[Build] 处理 index.html...');
    const htmlContent = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
    fs.writeFileSync(path.join(DIST, 'index.html'), htmlContent, 'utf-8');

    // 复制 .github 到 dist（部署需要）
    console.log('\n[Build] 复制 GitHub Actions 配置...');
    const githubDir = path.join(ROOT, '.github');
    if (fs.existsSync(githubDir)) {
        copyDir(githubDir, path.join(DIST, '.github'));
    }

    // 汇总
    const totalSrc = totalJSSrc + totalCSSSrc;
    const totalDest = totalJSDest + totalCSSDest;
    const totalPct = ((1 - totalDest / totalSrc) * 100).toFixed(1);
    
    console.log('\n' + '='.repeat(50));
    console.log(`[Build] 构建完成!`);
    console.log(`  JS:  ${(totalJSSrc/1024).toFixed(0)}KB → ${(totalJSDest/1024).toFixed(0)}KB`);
    console.log(`  CSS: ${(totalCSSSrc/1024).toFixed(0)}KB → ${(totalCSSDest/1024).toFixed(0)}KB`);
    console.log(`  总计: ${(totalSrc/1024).toFixed(0)}KB → ${(totalDest/1024).toFixed(0)}KB (-${totalPct}%)`);
    console.log('='.repeat(50));
}

main().catch(err => {
    console.error('[Build] 构建失败:', err);
    process.exit(1);
});