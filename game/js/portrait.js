/* ====== 深宫帝王录 - 立绘组装系统 v3 ====== */
/* 支持加载外部PNG图层（立ち絵さん等PSD导出素材）+ Canvas绘制后备 */

// ====== 素材基础路径 ======
const ASSET_BASE = 'assets/portrait';

// ====== 颜色池 ======
const HAIR_COLORS = [
    { id: 'black',   base: '#0d0d12', light: '#1a1a24', highlight: '#2a2a3a' },
    { id: 'brown',   base: '#2a1508', light: '#3d2010', highlight: '#5a3520' },
    { id: 'dkbrown', base: '#1a0e05', light: '#2a1a0d', highlight: '#3d2a18' },
    { id: 'auburn',  base: '#2a0e0e', light: '#3d1818', highlight: '#5a2828' },
    { id: 'blueblk', base: '#08081a', light: '#14142a', highlight: '#22223d' },
    { id: 'grey',    base: '#2a2a2a', light: '#3d3d3d', highlight: '#555555' },
    { id: 'white',   base: '#c8c8d0', light: '#d8d8e0', highlight: '#eaeaf0' },
    { id: 'red',     base: '#3a0a0a', light: '#5a1a1a', highlight: '#7a2a2a' }
];

const EYE_COLORS = [
    { id: 'black',  iris: '#0d0d12', pupil: '#000000' },
    { id: 'brown',  iris: '#3d2010', pupil: '#1a0e05' },
    { id: 'amber',  iris: '#8a5a20', pupil: '#3d2010' },
    { id: 'green',  iris: '#1a5a2a', pupil: '#0a2a12' },
    { id: 'blue',   iris: '#1a3a6a', pupil: '#0a1a3a' },
    { id: 'violet', iris: '#4a2a5a', pupil: '#2a1a3a' },
    { id: 'red',    iris: '#6a1a1a', pupil: '#3a0a0a' },
    { id: 'gold',   iris: '#9a7a20', pupil: '#5a4a10' }
];

const SKIN_TONES = [
    { id: 'fair',  base: '#f5e6d3', shadow: '#e0cdb8', blush: '#f0b8a8' },
    { id: 'light', base: '#ecdcc8', shadow: '#d8c4aa', blush: '#e8a898' },
    { id: 'warm',  base: '#e0c8a8', shadow: '#c8b090', blush: '#d8a088' },
    { id: 'tan',   base: '#c8a880', shadow: '#b09068', blush: '#c08868' },
    { id: 'pale',  base: '#f0e0e8', shadow: '#dcc8d0', blush: '#f0a8b8' }
];

// ====== PNG图层配置 ======
// 将立ち絵さん的PSD图层导出为PNG后，按此结构放置
// 路径: assets/portrait/{类别}/{文件名}.png
const PNG_PARTS = {
    // 后发
    hairBack: [
        { id: 'hb_long',     name: '长发',   file: 'hair_back/long' },
        { id: 'hb_midlong',  name: '中长发', file: 'hair_back/midlong' },
        { id: 'hb_short',    name: '短发',   file: 'hair_back/short' },
        { id: 'hb_bun',      name: '高髻',   file: 'hair_back/bun' },
        { id: 'hb_double',   name: '双髻',   file: 'hair_back/double' },
        { id: 'hb_lowbun',   name: '低髻',   file: 'hair_back/lowbun' },
        { id: 'hb_flower',   name: '花苞头', file: 'hair_back/flower' },
        { id: 'hb_ponytail', name: '马尾',   file: 'hair_back/ponytail' }
    ],
    // 身体
    body: [
        { id: 'bd_std',     name: '标准', gender: 'both',   file: 'body/standard' },
        { id: 'bd_slender', name: '纤细', gender: 'female', file: 'body/slender' },
        { id: 'bd_strong',  name: '健硕', gender: 'male',   file: 'body/strong' }
    ],
    // 服装
    costume: [
        { id: 'cs_dragon',   name: '龙袍',     rank: 'empress',    file: 'costume/dragon' },
        { id: 'cs_noble',    name: '贵妃宫装', rank: 'consort',    file: 'costume/noble' },
        { id: 'cs_palace',   name: '妃位宫装', rank: 'concubine',  file: 'costume/palace' },
        { id: 'cs_elegant',  name: '嫔位常服', rank: 'noble',      file: 'costume/elegant' },
        { id: 'cs_simple',   name: '贵人素衣', rank: 'beauty',     file: 'costume/simple' },
        { id: 'cs_plain',    name: '常在布衣', rank: 'commoner',   file: 'costume/plain' },
        { id: 'cs_promise',  name: '答应衣',   rank: 'promise',    file: 'costume/promise' },
        { id: 'cs_prince',   name: '皇子蟒袍', rank: 'prince',     file: 'costume/prince' },
        { id: 'cs_princess', name: '公主礼服', rank: 'princess',   file: 'costume/princess' },
        { id: 'cs_servant',  name: '侍女服',   rank: 'servant',    file: 'costume/servant' }
    ],
    // 前发
    hairFront: [
        { id: 'hf_bangs',     name: '齐刘海', file: 'hair_front/bangs' },
        { id: 'hf_sidebangs', name: '斜刘海', file: 'hair_front/sidebangs' },
        { id: 'hf_center',    name: '中分',   file: 'hair_front/center' },
        { id: 'hf_sidesweep', name: '偏分',   file: 'hair_front/sidesweep' },
        { id: 'hf_wispy',     name: '碎刘海', file: 'hair_front/wispy' },
        { id: 'hf_curly',     name: '卷刘海', file: 'hair_front/curly' },
        { id: 'hf_short',     name: '短前发', file: 'hair_front/short' },
        { id: 'hf_none',      name: '无刘海', file: null }
    ],
    // 眉毛
    eyebrows: [
        { id: 'eb_willow', name: '柳叶眉', file: 'eyebrow/willow' },
        { id: 'eb_sword',  name: '剑眉',   file: 'eyebrow/sword' },
        { id: 'eb_arched', name: '弯眉',   file: 'eyebrow/arched' },
        { id: 'eb_flat',   name: '平眉',   file: 'eyebrow/flat' },
        { id: 'eb_thin',   name: '细眉',   file: 'eyebrow/thin' },
        { id: 'eb_thick',  name: '浓眉',   file: 'eyebrow/thick' }
    ],
    // 眼睛
    eyes: [
        { id: 'ey_almond',  name: '杏眼',   file: 'eye/almond' },
        { id: 'ey_phoenix', name: '丹凤眼', file: 'eye/phoenix' },
        { id: 'ey_peach',   name: '桃花眼', file: 'eye/peach' },
        { id: 'ey_round',   name: '圆眼',   file: 'eye/round' },
        { id: 'ey_narrow',  name: '细长眼', file: 'eye/narrow' },
        { id: 'ey_cat',     name: '猫眼',   file: 'eye/cat' },
        { id: 'ey_droopy',  name: '下垂眼', file: 'eye/droopy' },
        { id: 'ey_sharp',   name: '锐眼',   file: 'eye/sharp' }
    ],
    // 嘴巴
    mouth: [
        { id: 'mt_smile',    name: '微笑', file: 'mouth/smile' },
        { id: 'mt_closed',   name: '抿嘴', file: 'mouth/closed' },
        { id: 'mt_open',     name: '微张', file: 'mouth/open' },
        { id: 'mt_smirk',    name: '冷笑', file: 'mouth/smirk' },
        { id: 'mt_sad',      name: '忧郁', file: 'mouth/sad' },
        { id: 'mt_surprise', name: '惊讶', file: 'mouth/surprise' },
        { id: 'mt_angry',    name: '怒容', file: 'mouth/angry' },
        { id: 'mt_small',    name: '小嘴', file: 'mouth/small' }
    ],
    // 装饰
    deco: [
        { id: 'dc_none',    name: '无',   file: null },
        { id: 'dc_hairpin', name: '发簪', file: 'deco/hairpin' },
        { id: 'dc_buyao',   name: '步摇', file: 'deco/buyao' },
        { id: 'dc_huadian', name: '花钿', file: 'deco/huadian' },
        { id: 'dc_earring', name: '耳坠', file: 'deco/earring' },
        { id: 'dc_ribbon',  name: '发带', file: 'deco/ribbon' },
        { id: 'dc_crown',   name: '凤冠', file: 'deco/crown' },
        { id: 'dc_jade',    name: '玉佩', file: 'deco/jade' }
    ]
};

// ====== 图片缓存 ======
const imageCache = {};

// 预加载图片
function preloadImage(path) {
    return new Promise((resolve) => {
        if (imageCache[path]) {
            resolve(imageCache[path]);
            return;
        }
        const img = new Image();
        img.onload = () => {
            imageCache[path] = img;
            resolve(img);
        };
        img.onerror = () => {
            resolve(null); // 加载失败返回null，回退到Canvas绘制
        };
        img.src = path;
    });
}

// 批量预加载所有素材
async function preloadAllAssets() {
    const paths = [];
    for (const category of Object.values(PNG_PARTS)) {
        for (const part of category) {
            if (part.file) {
                paths.push(`${ASSET_BASE}/${part.file}.png`);
            }
        }
    }
    await Promise.all(paths.map(p => preloadImage(p)));
}

// 检查是否有可用的PNG素材
async function hasPngAssets() {
    // 尝试加载一个关键素材来检测
    const testImg = await preloadImage(`${ASSET_BASE}/hair_back/long.png`);
    return testImg !== null;
}

// ====== 立绘组装器 ======
class PortraitGenerator {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.width = 120;
        this.height = 160;
        this.usePng = false; // 是否使用PNG模式
    }

    // 检测并切换模式
    async detectMode() {
        this.usePng = await hasPngAssets();
        if (this.usePng) {
            await preloadAllAssets();
        }
        return this.usePng;
    }

    createCanvas(container, width, height) {
        this.width = width || 120;
        this.height = height || 160;
        const canvas = document.createElement('canvas');
        canvas.width = this.width * 2;
        canvas.height = this.height * 2;
        canvas.style.width = this.width + 'px';
        canvas.style.height = this.height + 'px';
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.ctx.scale(2, 2);
        container.innerHTML = '';
        container.appendChild(canvas);
        return canvas;
    }

    // 随机生成一套部件
    randomParts(gender, rank) {
        const hairColor = HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)];
        const eyeColor = EYE_COLORS[Math.floor(Math.random() * EYE_COLORS.length)];
        const skinTone = SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];

        let costume;
        if (rank) {
            costume = PNG_PARTS.costume.find(c => c.rank === rank) ||
                      PNG_PARTS.costume[Math.floor(Math.random() * PNG_PARTS.costume.length)];
        } else {
            costume = PNG_PARTS.costume[Math.floor(Math.random() * PNG_PARTS.costume.length)];
        }

        const bodyPool = PNG_PARTS.body.filter(b => b.gender === 'both' || b.gender === gender);
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

        return {
            hairBack: pick(PNG_PARTS.hairBack),
            body: pick(bodyPool),
            costume: costume,
            hairFront: pick(PNG_PARTS.hairFront),
            eyebrows: pick(PNG_PARTS.eyebrows),
            eyes: pick(PNG_PARTS.eyes),
            mouth: pick(PNG_PARTS.mouth),
            deco: pick(PNG_PARTS.deco),
            hairColor: hairColor,
            eyeColor: eyeColor,
            skinTone: skinTone
        };
    }

    // ====== 主绘制方法 ======
    draw(parts) {
        if (this.usePng) {
            this._drawPng(parts);
        } else {
            this._drawCanvas(parts);
        }
    }

    // ====== PNG图层模式 ======
    _drawPng(parts) {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        ctx.clearRect(0, 0, w, h);

        // 绘制顺序：后发 → 身体 → 服装 → 脸部 → 前发 → 眉毛 → 眼睛 → 嘴巴 → 装饰
        const layers = [
            parts.hairBack,
            parts.body,
            parts.costume,
            parts.hairFront,
            parts.eyebrows,
            parts.eyes,
            parts.mouth,
            parts.deco
        ];

        for (const part of layers) {
            if (!part || !part.file) continue;
            const img = imageCache[`${ASSET_BASE}/${part.file}.png`];
            if (img) {
                ctx.drawImage(img, 0, 0, w, h);
            }
        }
    }

    // ====== Canvas绘制后备模式 ======
    _drawCanvas(parts) {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        ctx.clearRect(0, 0, w, h);

        const cx = w / 2;
        const headCY = h * 0.28;
        const headW = w * 0.28;
        const headH = w * 0.32;
        const bodyTop = headCY + headH * 0.85;

        this._drawHairBack(ctx, cx, headCY, headW, headH, parts);
        this._drawBody(ctx, cx, bodyTop, w, h, parts);
        this._drawCostume(ctx, cx, bodyTop, w, h, parts);
        this._drawFace(ctx, cx, headCY, headW, headH, parts);
        this._drawHairFront(ctx, cx, headCY, headW, headH, parts);
        this._drawEyebrows(ctx, cx, headCY, headW, headH, parts);
        this._drawEyes(ctx, cx, headCY, headW, headH, parts);
        this._drawNose(ctx, cx, headCY, headW, headH, parts);
        this._drawMouth(ctx, cx, headCY, headW, headH, parts);
        this._drawDeco(ctx, cx, headCY, headW, headH, parts);
    }

    // ====== 后发 ======
    _drawHairBack(ctx, cx, cy, hw, hh, parts) {
        const hc = parts.hairColor;
        const id = parts.hairBack.id;
        ctx.fillStyle = hc.base;
        ctx.beginPath();
        if (id === 'hb_long') {
            ctx.moveTo(cx - hw * 1.15, cy - hh * 0.3);
            ctx.quadraticCurveTo(cx - hw * 1.3, cy + hh * 0.5, cx - hw * 1.1, cy + hh * 3.5);
            ctx.lineTo(cx - hw * 0.6, cy + hh * 3.8);
            ctx.quadraticCurveTo(cx, cy + hh * 4.0, cx + hw * 0.6, cy + hh * 3.8);
            ctx.lineTo(cx + hw * 1.1, cy + hh * 3.5);
            ctx.quadraticCurveTo(cx + hw * 1.3, cy + hh * 0.5, cx + hw * 1.15, cy - hh * 0.3);
            ctx.quadraticCurveTo(cx, cy - hh * 1.2, cx - hw * 1.15, cy - hh * 0.3);
        } else if (id === 'hb_midlong') {
            ctx.moveTo(cx - hw * 1.1, cy - hh * 0.3);
            ctx.quadraticCurveTo(cx - hw * 1.25, cy + hh * 0.5, cx - hw * 1.0, cy + hh * 2.2);
            ctx.lineTo(cx - hw * 0.5, cy + hh * 2.5);
            ctx.quadraticCurveTo(cx, cy + hh * 2.6, cx + hw * 0.5, cy + hh * 2.5);
            ctx.lineTo(cx + hw * 1.0, cy + hh * 2.2);
            ctx.quadraticCurveTo(cx + hw * 1.25, cy + hh * 0.5, cx + hw * 1.1, cy - hh * 0.3);
            ctx.quadraticCurveTo(cx, cy - hh * 1.2, cx - hw * 1.1, cy - hh * 0.3);
        } else if (id === 'hb_short') {
            ctx.ellipse(cx, cy - hh * 0.1, hw * 1.15, hh * 1.3, 0, 0, Math.PI * 2);
        } else if (id === 'hb_bun') {
            ctx.ellipse(cx, cy - hh * 0.1, hw * 1.1, hh * 1.2, 0, 0, Math.PI * 2);
            ctx.fill(); ctx.beginPath();
            ctx.ellipse(cx, cy - hh * 1.3, hw * 0.6, hw * 0.55, 0, 0, Math.PI * 2);
        } else if (id === 'hb_double') {
            ctx.ellipse(cx, cy - hh * 0.1, hw * 1.1, hh * 1.2, 0, 0, Math.PI * 2);
            ctx.fill(); ctx.beginPath();
            ctx.ellipse(cx - hw * 0.8, cy - hh * 1.0, hw * 0.45, hw * 0.5, -0.2, 0, Math.PI * 2);
            ctx.ellipse(cx + hw * 0.8, cy - hh * 1.0, hw * 0.45, hw * 0.5, 0.2, 0, Math.PI * 2);
        } else if (id === 'hb_lowbun') {
            ctx.ellipse(cx, cy - hh * 0.1, hw * 1.1, hh * 1.2, 0, 0, Math.PI * 2);
            ctx.fill(); ctx.beginPath();
            ctx.ellipse(cx, cy + hh * 0.8, hw * 0.55, hw * 0.5, 0, 0, Math.PI * 2);
        } else if (id === 'hb_flower') {
            ctx.ellipse(cx, cy - hh * 0.1, hw * 1.1, hh * 1.2, 0, 0, Math.PI * 2);
            ctx.fill(); ctx.beginPath();
            ctx.ellipse(cx - hw * 0.4, cy - hh * 1.1, hw * 0.35, hw * 0.4, -0.3, 0, Math.PI * 2);
            ctx.ellipse(cx + hw * 0.4, cy - hh * 1.1, hw * 0.35, hw * 0.4, 0.3, 0, Math.PI * 2);
            ctx.ellipse(cx, cy - hh * 1.3, hw * 0.3, hw * 0.35, 0, 0, Math.PI * 2);
        } else if (id === 'hb_ponytail') {
            ctx.ellipse(cx, cy - hh * 0.1, hw * 1.1, hh * 1.2, 0, 0, Math.PI * 2);
            ctx.fill(); ctx.beginPath();
            ctx.moveTo(cx + hw * 0.3, cy - hh * 0.5);
            ctx.quadraticCurveTo(cx + hw * 1.5, cy + hh * 0.5, cx + hw * 1.2, cy + hh * 3.0);
            ctx.quadraticCurveTo(cx + hw * 0.8, cy + hh * 3.2, cx + hw * 0.6, cy + hh * 2.8);
            ctx.quadraticCurveTo(cx + hw * 1.0, cy + hh * 0.3, cx + hw * 0.2, cy - hh * 0.3);
        }
        ctx.fill();
        ctx.fillStyle = hc.highlight; ctx.globalAlpha = 0.15; ctx.beginPath();
        if (id === 'hb_long' || id === 'hb_midlong') {
            ctx.ellipse(cx - hw * 0.3, cy + hh * 0.5, hw * 0.3, hh * 1.5, -0.1, 0, Math.PI * 2);
        } else {
            ctx.ellipse(cx - hw * 0.2, cy - hh * 0.3, hw * 0.4, hh * 0.5, 0, 0, Math.PI * 2);
        }
        ctx.fill(); ctx.globalAlpha = 1.0;
    }

    // ====== 身体 ======
    _drawBody(ctx, cx, bodyTop, w, h, parts) {
        const skin = parts.skinTone;
        const bd = parts.body.id;
        const shoulderW = bd === 'bd_strong' ? w * 0.38 : bd === 'bd_slender' ? w * 0.3 : w * 0.34;
        ctx.fillStyle = skin.shadow; ctx.beginPath();
        ctx.moveTo(cx - w * 0.06, bodyTop); ctx.lineTo(cx + w * 0.06, bodyTop);
        ctx.lineTo(cx + w * 0.07, bodyTop + w * 0.08); ctx.lineTo(cx - w * 0.07, bodyTop + w * 0.08);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = skin.base; ctx.beginPath();
        ctx.moveTo(cx - shoulderW, bodyTop + w * 0.06);
        ctx.quadraticCurveTo(cx - shoulderW * 1.05, bodyTop + w * 0.15, cx - shoulderW * 0.9, h * 0.98);
        ctx.lineTo(cx + shoulderW * 0.9, h * 0.98);
        ctx.quadraticCurveTo(cx + shoulderW * 1.05, bodyTop + w * 0.15, cx + shoulderW, bodyTop + w * 0.06);
        ctx.quadraticCurveTo(cx, bodyTop - w * 0.02, cx - shoulderW, bodyTop + w * 0.06);
        ctx.fill();
    }

    // ====== 服装 ======
    _drawCostume(ctx, cx, bodyTop, w, h, parts) {
        const cs = parts.costume;
        const bd = parts.body.id;
        const shoulderW = bd === 'bd_strong' ? w * 0.37 : bd === 'bd_slender' ? w * 0.29 : w * 0.33;
        ctx.fillStyle = cs.primary || '#3a5a8a'; ctx.beginPath();
        ctx.moveTo(cx - shoulderW, bodyTop + w * 0.05);
        ctx.quadraticCurveTo(cx - shoulderW * 1.02, bodyTop + w * 0.12, cx - shoulderW * 0.85, h * 0.98);
        ctx.lineTo(cx + shoulderW * 0.85, h * 0.98);
        ctx.quadraticCurveTo(cx + shoulderW * 1.02, bodyTop + w * 0.12, cx + shoulderW, bodyTop + w * 0.05);
        ctx.quadraticCurveTo(cx, bodyTop - w * 0.01, cx - shoulderW, bodyTop + w * 0.05);
        ctx.fill();
        ctx.fillStyle = cs.secondary || '#c9a84c'; ctx.beginPath();
        ctx.moveTo(cx - shoulderW * 0.5, bodyTop + w * 0.05);
        ctx.lineTo(cx, bodyTop + w * 0.28);
        ctx.lineTo(cx + shoulderW * 0.5, bodyTop + w * 0.05);
        ctx.lineTo(cx + shoulderW * 0.3, bodyTop + w * 0.02);
        ctx.lineTo(cx, bodyTop + w * 0.2);
        ctx.lineTo(cx - shoulderW * 0.3, bodyTop + w * 0.02);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = cs.trim || '#e8d48b'; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(cx - shoulderW * 0.5, bodyTop + w * 0.05);
        ctx.lineTo(cx, bodyTop + w * 0.28);
        ctx.lineTo(cx + shoulderW * 0.5, bodyTop + w * 0.05);
        ctx.stroke();
        ctx.fillStyle = cs.trim || '#e8d48b';
        ctx.fillRect(cx - shoulderW * 0.8, bodyTop + w * 0.32, shoulderW * 1.6, w * 0.03);
    }

    // ====== 脸部 ======
    _drawFace(ctx, cx, cy, hw, hh, parts) {
        const skin = parts.skinTone;
        ctx.fillStyle = skin.shadow; ctx.beginPath();
        ctx.ellipse(cx, cy + hh * 0.05, hw * 1.02, hh * 1.02, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = skin.base; ctx.beginPath();
        ctx.ellipse(cx, cy, hw, hh, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = skin.blush; ctx.globalAlpha = 0.2; ctx.beginPath();
        ctx.ellipse(cx - hw * 0.55, cy + hh * 0.25, hw * 0.2, hh * 0.12, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + hw * 0.55, cy + hh * 0.25, hw * 0.2, hh * 0.12, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.globalAlpha = 1.0;
        ctx.fillStyle = skin.base; ctx.beginPath();
        ctx.ellipse(cx - hw * 0.95, cy, hw * 0.12, hh * 0.15, -0.2, 0, Math.PI * 2);
        ctx.ellipse(cx + hw * 0.95, cy, hw * 0.12, hh * 0.15, 0.2, 0, Math.PI * 2);
        ctx.fill();
    }

    // ====== 前发 ======
    _drawHairFront(ctx, cx, cy, hw, hh, parts) {
        const hc = parts.hairColor;
        const id = parts.hairFront.id;
        ctx.fillStyle = hc.base; ctx.beginPath();
        if (id === 'hf_bangs') {
            ctx.moveTo(cx - hw * 1.05, cy - hh * 0.1);
            ctx.quadraticCurveTo(cx - hw * 0.8, cy - hh * 1.15, cx, cy - hh * 1.1);
            ctx.quadraticCurveTo(cx + hw * 0.8, cy - hh * 1.15, cx + hw * 1.05, cy - hh * 0.1);
            ctx.lineTo(cx + hw * 1.0, cy - hh * 0.35); ctx.lineTo(cx + hw * 0.6, cy - hh * 0.3);
            ctx.lineTo(cx + hw * 0.3, cy - hh * 0.32); ctx.lineTo(cx, cy - hh * 0.28);
            ctx.lineTo(cx - hw * 0.3, cy - hh * 0.32); ctx.lineTo(cx - hw * 0.6, cy - hh * 0.3);
            ctx.lineTo(cx - hw * 1.0, cy - hh * 0.35); ctx.closePath();
        } else if (id === 'hf_sidebangs') {
            ctx.moveTo(cx - hw * 1.05, cy - hh * 0.15);
            ctx.quadraticCurveTo(cx - hw * 0.5, cy - hh * 1.15, cx + hw * 0.5, cy - hh * 1.1);
            ctx.quadraticCurveTo(cx + hw * 1.05, cy - hh * 1.0, cx + hw * 1.1, cy - hh * 0.2);
            ctx.lineTo(cx + hw * 0.8, cy - hh * 0.15); ctx.lineTo(cx + hw * 0.4, cy - hh * 0.2);
            ctx.lineTo(cx, cy - hh * 0.5); ctx.lineTo(cx - hw * 0.5, cy - hh * 0.8);
            ctx.lineTo(cx - hw * 0.9, cy - hh * 0.3); ctx.closePath();
        } else if (id === 'hf_center') {
            ctx.moveTo(cx - hw * 1.05, cy - hh * 0.1);
            ctx.quadraticCurveTo(cx - hw * 0.6, cy - hh * 1.15, cx, cy - hh * 1.05);
            ctx.quadraticCurveTo(cx + hw * 0.6, cy - hh * 1.15, cx + hw * 1.05, cy - hh * 0.1);
            ctx.lineTo(cx + hw * 0.5, cy - hh * 0.2); ctx.lineTo(cx + hw * 0.15, cy - hh * 0.7);
            ctx.lineTo(cx, cy - hh * 0.15); ctx.lineTo(cx - hw * 0.15, cy - hh * 0.7);
            ctx.lineTo(cx - hw * 0.5, cy - hh * 0.2); ctx.closePath();
        } else if (id === 'hf_sidesweep') {
            ctx.moveTo(cx - hw * 1.05, cy + hh * 0.1);
            ctx.quadraticCurveTo(cx - hw * 0.8, cy - hh * 1.1, cx + hw * 0.3, cy - hh * 1.15);
            ctx.quadraticCurveTo(cx + hw * 1.1, cy - hh * 1.0, cx + hw * 1.1, cy - hh * 0.1);
            ctx.lineTo(cx + hw * 0.6, cy - hh * 0.15); ctx.lineTo(cx, cy - hh * 0.4);
            ctx.lineTo(cx - hw * 0.5, cy - hh * 0.6); ctx.lineTo(cx - hw * 0.8, cy - hh * 0.1);
            ctx.closePath();
        } else if (id === 'hf_wispy') {
            ctx.moveTo(cx - hw * 1.05, cy - hh * 0.1);
            ctx.quadraticCurveTo(cx, cy - hh * 1.15, cx + hw * 1.05, cy - hh * 0.1);
            ctx.lineTo(cx + hw * 0.9, cy - hh * 0.45); ctx.lineTo(cx + hw * 0.5, cy - hh * 0.35);
            ctx.lineTo(cx + hw * 0.2, cy - hh * 0.5); ctx.lineTo(cx, cy - hh * 0.38);
            ctx.lineTo(cx - hw * 0.3, cy - hh * 0.48); ctx.lineTo(cx - hw * 0.6, cy - hh * 0.35);
            ctx.lineTo(cx - hw * 0.9, cy - hh * 0.45); ctx.closePath();
        } else if (id === 'hf_curly') {
            ctx.moveTo(cx - hw * 1.05, cy - hh * 0.05);
            ctx.quadraticCurveTo(cx, cy - hh * 1.15, cx + hw * 1.05, cy - hh * 0.05);
            for (let i = 0; i < 5; i++) {
                const x = cx - hw * 0.8 + (hw * 1.6 / 5) * (i + 0.5);
                const y = cy - hh * 0.35;
                ctx.quadraticCurveTo(x + hw * 0.12, y - hh * 0.1, x + hw * 0.08, y + hh * 0.05);
                ctx.quadraticCurveTo(x - hw * 0.05, y + hh * 0.08, x - hw * 0.1, y);
            }
            ctx.closePath();
        } else if (id === 'hf_short') {
            ctx.moveTo(cx - hw * 1.05, cy - hh * 0.2);
            ctx.quadraticCurveTo(cx, cy - hh * 1.15, cx + hw * 1.05, cy - hh * 0.2);
            ctx.lineTo(cx + hw * 0.8, cy - hh * 0.55); ctx.lineTo(cx + hw * 0.3, cy - hh * 0.5);
            ctx.lineTo(cx - hw * 0.3, cy - hh * 0.5); ctx.lineTo(cx - hw * 0.8, cy - hh * 0.55);
            ctx.closePath();
        } else {
            ctx.moveTo(cx - hw * 1.05, cy - hh * 0.4);
            ctx.quadraticCurveTo(cx, cy - hh * 1.15, cx + hw * 1.05, cy - hh * 0.4);
            ctx.quadraticCurveTo(cx, cy - hh * 0.6, cx - hw * 1.05, cy - hh * 0.4);
        }
        ctx.fill();
        ctx.fillStyle = hc.highlight; ctx.globalAlpha = 0.12; ctx.beginPath();
        ctx.ellipse(cx - hw * 0.2, cy - hh * 0.6, hw * 0.3, hh * 0.25, -0.2, 0, Math.PI * 2);
        ctx.fill(); ctx.globalAlpha = 1.0;
    }

    // ====== 眉毛 ======
    _drawEyebrows(ctx, cx, cy, hw, hh, parts) {
        const hc = parts.hairColor;
        ctx.strokeStyle = hc.light; const id = parts.eyebrows.id;
        const eyeY = cy - hh * 0.1; const browY = eyeY - hh * 0.22;
        ctx.lineWidth = id === 'eb_thick' ? 2 : id === 'eb_thin' ? 0.8 : 1.2;
        ctx.lineCap = 'round';
        if (id === 'eb_willow') {
            ctx.beginPath(); ctx.moveTo(cx - hw * 0.6, browY + hh * 0.02);
            ctx.quadraticCurveTo(cx - hw * 0.35, browY - hh * 0.08, cx - hw * 0.1, browY); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx + hw * 0.1, browY);
            ctx.quadraticCurveTo(cx + hw * 0.35, browY - hh * 0.08, cx + hw * 0.6, browY + hh * 0.02); ctx.stroke();
        } else if (id === 'eb_sword') {
            ctx.lineWidth = 1.8;
            ctx.beginPath(); ctx.moveTo(cx - hw * 0.65, browY + hh * 0.06);
            ctx.lineTo(cx - hw * 0.1, browY - hh * 0.08); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx + hw * 0.1, browY - hh * 0.08);
            ctx.lineTo(cx + hw * 0.65, browY + hh * 0.06); ctx.stroke();
        } else if (id === 'eb_arched') {
            ctx.beginPath(); ctx.arc(cx - hw * 0.35, browY + hh * 0.05, hw * 0.28, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx + hw * 0.35, browY + hh * 0.05, hw * 0.28, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
        } else if (id === 'eb_flat') {
            ctx.beginPath(); ctx.moveTo(cx - hw * 0.6, browY); ctx.lineTo(cx - hw * 0.1, browY - hh * 0.02); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx + hw * 0.1, browY - hh * 0.02); ctx.lineTo(cx + hw * 0.6, browY); ctx.stroke();
        } else if (id === 'eb_thin') {
            ctx.lineWidth = 0.7;
            ctx.beginPath(); ctx.moveTo(cx - hw * 0.55, browY);
            ctx.quadraticCurveTo(cx - hw * 0.35, browY - hh * 0.05, cx - hw * 0.1, browY + hh * 0.01); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx + hw * 0.1, browY + hh * 0.01);
            ctx.quadraticCurveTo(cx + hw * 0.35, browY - hh * 0.05, cx + hw * 0.55, browY); ctx.stroke();
        } else {
            ctx.lineWidth = 2.2;
            ctx.beginPath(); ctx.moveTo(cx - hw * 0.6, browY + hh * 0.04);
            ctx.quadraticCurveTo(cx - hw * 0.35, browY - hh * 0.06, cx - hw * 0.1, browY); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx + hw * 0.1, browY);
            ctx.quadraticCurveTo(cx + hw * 0.35, browY - hh * 0.06, cx + hw * 0.6, browY + hh * 0.04); ctx.stroke();
        }
    }

    // ====== 眼睛 ======
    _drawEyes(ctx, cx, cy, hw, hh, parts) {
        const ec = parts.eyeColor; const id = parts.eyes.id;
        const eyeY = cy - hh * 0.08; const lx = cx - hw * 0.35; const rx = cx + hw * 0.35;
        ctx.fillStyle = '#fff'; ctx.beginPath();
        if (id === 'ey_almond') { ctx.ellipse(lx, eyeY, hw * 0.17, hh * 0.1, 0, 0, Math.PI * 2); ctx.ellipse(rx, eyeY, hw * 0.17, hh * 0.1, 0, 0, Math.PI * 2); }
        else if (id === 'ey_phoenix') { ctx.ellipse(lx, eyeY, hw * 0.2, hh * 0.07, -0.1, 0, Math.PI * 2); ctx.ellipse(rx, eyeY, hw * 0.2, hh * 0.07, 0.1, 0, Math.PI * 2); }
        else if (id === 'ey_peach') { ctx.ellipse(lx, eyeY, hw * 0.18, hh * 0.09, 0, 0, Math.PI * 2); ctx.ellipse(rx, eyeY, hw * 0.18, hh * 0.09, 0, 0, Math.PI * 2); }
        else if (id === 'ey_round') { ctx.ellipse(lx, eyeY, hw * 0.15, hh * 0.12, 0, 0, Math.PI * 2); ctx.ellipse(rx, eyeY, hw * 0.15, hh * 0.12, 0, 0, Math.PI * 2); }
        else if (id === 'ey_narrow') { ctx.ellipse(lx, eyeY, hw * 0.22, hh * 0.055, 0, 0, Math.PI * 2); ctx.ellipse(rx, eyeY, hw * 0.22, hh * 0.055, 0, 0, Math.PI * 2); }
        else if (id === 'ey_cat') { ctx.ellipse(lx, eyeY, hw * 0.18, hh * 0.08, -0.15, 0, Math.PI * 2); ctx.ellipse(rx, eyeY, hw * 0.18, hh * 0.08, 0.15, 0, Math.PI * 2); }
        else if (id === 'ey_droopy') { ctx.ellipse(lx, eyeY, hw * 0.17, hh * 0.09, 0.1, 0, Math.PI * 2); ctx.ellipse(rx, eyeY, hw * 0.17, hh * 0.09, -0.1, 0, Math.PI * 2); }
        else { ctx.ellipse(lx, eyeY, hw * 0.19, hh * 0.075, -0.05, 0, Math.PI * 2); ctx.ellipse(rx, eyeY, hw * 0.19, hh * 0.075, 0.05, 0, Math.PI * 2); }
        ctx.fill();
        ctx.strokeStyle = '#1a0a0a'; ctx.lineWidth = 1.2; ctx.beginPath();
        if (id === 'ey_phoenix' || id === 'ey_cat') {
            ctx.moveTo(lx - hw * 0.2, eyeY + hh * 0.01); ctx.quadraticCurveTo(lx, eyeY - hh * 0.1, lx + hw * 0.22, eyeY - hh * 0.04); ctx.stroke(); ctx.beginPath();
            ctx.moveTo(rx - hw * 0.22, eyeY - hh * 0.04); ctx.quadraticCurveTo(rx, eyeY - hh * 0.1, rx + hw * 0.2, eyeY + hh * 0.01);
        } else {
            ctx.moveTo(lx - hw * 0.18, eyeY); ctx.quadraticCurveTo(lx, eyeY - hh * 0.12, lx + hw * 0.18, eyeY); ctx.stroke(); ctx.beginPath();
            ctx.moveTo(rx - hw * 0.18, eyeY); ctx.quadraticCurveTo(rx, eyeY - hh * 0.12, rx + hw * 0.18, eyeY);
        }
        ctx.stroke();
        ctx.fillStyle = ec.iris; ctx.beginPath();
        ctx.arc(lx, eyeY, hw * 0.09, 0, Math.PI * 2); ctx.arc(rx, eyeY, hw * 0.09, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = ec.pupil; ctx.beginPath();
        ctx.arc(lx, eyeY, hw * 0.04, 0, Math.PI * 2); ctx.arc(rx, eyeY, hw * 0.04, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath();
        ctx.arc(lx + hw * 0.03, eyeY - hh * 0.02, hw * 0.03, 0, Math.PI * 2); ctx.arc(rx + hw * 0.03, eyeY - hh * 0.02, hw * 0.03, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.arc(lx - hw * 0.02, eyeY + hh * 0.02, hw * 0.015, 0, Math.PI * 2); ctx.arc(rx - hw * 0.02, eyeY + hh * 0.02, hw * 0.015, 0, Math.PI * 2); ctx.fill();
        if (id === 'ey_phoenix' || id === 'ey_cat' || id === 'ey_sharp') {
            ctx.strokeStyle = '#1a0a0a'; ctx.lineWidth = 0.6;
            ctx.beginPath(); ctx.moveTo(lx + hw * 0.18, eyeY + hh * 0.02); ctx.lineTo(lx + hw * 0.22, eyeY + hh * 0.05); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(rx - hw * 0.18, eyeY + hh * 0.02); ctx.lineTo(rx - hw * 0.22, eyeY + hh * 0.05); ctx.stroke();
        }
    }

    // ====== 鼻子 ======
    _drawNose(ctx, cx, cy, hw, hh, parts) {
        const noseY = cy + hh * 0.12;
        ctx.strokeStyle = parts.skinTone.shadow; ctx.lineWidth = 0.8; ctx.beginPath();
        ctx.moveTo(cx, noseY - hh * 0.06); ctx.lineTo(cx - hw * 0.05, noseY + hh * 0.02);
        ctx.quadraticCurveTo(cx, noseY + hh * 0.04, cx + hw * 0.05, noseY + hh * 0.02); ctx.stroke();
    }

    // ====== 嘴巴 ======
    _drawMouth(ctx, cx, cy, hw, hh, parts) {
        const mouthY = cy + hh * 0.38; const id = parts.mouth.id;
        if (id === 'mt_smile') {
            ctx.strokeStyle = '#a04040'; ctx.lineWidth = 1; ctx.beginPath();
            ctx.arc(cx, mouthY - hh * 0.04, hw * 0.12, 0.15, Math.PI - 0.15); ctx.stroke();
            ctx.fillStyle = '#c06060'; ctx.beginPath();
            ctx.arc(cx, mouthY - hh * 0.04, hw * 0.12, 0.15, Math.PI - 0.15);
            ctx.lineTo(cx - hw * 0.1, mouthY - hh * 0.02); ctx.closePath(); ctx.fill();
        } else if (id === 'mt_closed') {
            ctx.strokeStyle = '#a04040'; ctx.lineWidth = 1.2; ctx.beginPath();
            ctx.moveTo(cx - hw * 0.1, mouthY); ctx.quadraticCurveTo(cx, mouthY - hh * 0.02, cx + hw * 0.1, mouthY); ctx.stroke();
        } else if (id === 'mt_open') {
            ctx.fillStyle = '#6a2828'; ctx.beginPath(); ctx.ellipse(cx, mouthY, hw * 0.08, hh * 0.05, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#a04040'; ctx.lineWidth = 0.8; ctx.stroke();
        } else if (id === 'mt_smirk') {
            ctx.strokeStyle = '#a04040'; ctx.lineWidth = 1; ctx.beginPath();
            ctx.moveTo(cx - hw * 0.12, mouthY + hh * 0.01);
            ctx.quadraticCurveTo(cx, mouthY - hh * 0.04, cx + hw * 0.12, mouthY - hh * 0.02); ctx.stroke();
        } else if (id === 'mt_sad') {
            ctx.strokeStyle = '#a04040'; ctx.lineWidth = 1; ctx.beginPath();
            ctx.arc(cx, mouthY + hh * 0.06, hw * 0.1, Math.PI + 0.2, -0.2); ctx.stroke();
        } else if (id === 'mt_surprise') {
            ctx.fillStyle = '#6a2828'; ctx.beginPath(); ctx.ellipse(cx, mouthY, hw * 0.06, hh * 0.07, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#a04040'; ctx.lineWidth = 0.8; ctx.stroke();
        } else if (id === 'mt_angry') {
            ctx.strokeStyle = '#a04040'; ctx.lineWidth = 1.3; ctx.beginPath();
            ctx.moveTo(cx - hw * 0.1, mouthY - hh * 0.01); ctx.lineTo(cx + hw * 0.1, mouthY - hh * 0.01); ctx.stroke();
            ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(cx - hw * 0.1, mouthY - hh * 0.01); ctx.lineTo(cx - hw * 0.12, mouthY + hh * 0.03); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx + hw * 0.1, mouthY - hh * 0.01); ctx.lineTo(cx + hw * 0.12, mouthY + hh * 0.03); ctx.stroke();
        } else {
            ctx.fillStyle = '#c06060'; ctx.beginPath(); ctx.ellipse(cx, mouthY, hw * 0.05, hh * 0.03, 0, 0, Math.PI * 2); ctx.fill();
        }
    }

    // ====== 装饰 ======
    _drawDeco(ctx, cx, cy, hw, hh, parts) {
        const id = parts.deco.id;
        if (id === 'dc_none') return;
        const gold = '#c9a84c'; const goldL = '#e8d48b';
        if (id === 'dc_hairpin') {
            ctx.fillStyle = gold; ctx.beginPath();
            ctx.moveTo(cx + hw * 0.4, cy - hh * 0.9); ctx.lineTo(cx + hw * 1.2, cy - hh * 1.2);
            ctx.lineTo(cx + hw * 1.25, cy - hh * 1.1); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#e05050'; ctx.beginPath(); ctx.arc(cx + hw * 1.2, cy - hh * 1.15, hw * 0.1, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = goldL; ctx.beginPath(); ctx.arc(cx + hw * 1.2, cy - hh * 1.15, hw * 0.04, 0, Math.PI * 2); ctx.fill();
        } else if (id === 'dc_buyao') {
            ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(cx + hw * 0.6, cy - hh * 0.85, hw * 0.08, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = gold; ctx.lineWidth = 0.6;
            for (let i = 0; i < 4; i++) {
                const sx = cx + hw * (0.5 + i * 0.07); ctx.beginPath();
                ctx.moveTo(cx + hw * 0.6, cy - hh * 0.78); ctx.quadraticCurveTo(sx, cy - hh * 0.3, sx + hw * 0.02, cy - hh * 0.1); ctx.stroke();
                ctx.fillStyle = goldL; ctx.beginPath(); ctx.arc(sx + hw * 0.02, cy - hh * 0.08, hw * 0.025, 0, Math.PI * 2); ctx.fill();
            }
        } else if (id === 'dc_huadian') {
            ctx.fillStyle = '#c44040'; ctx.beginPath();
            ctx.moveTo(cx, cy - hh * 0.35); ctx.lineTo(cx + hw * 0.05, cy - hh * 0.32);
            ctx.lineTo(cx, cy - hh * 0.28); ctx.lineTo(cx - hw * 0.05, cy - hh * 0.32); ctx.closePath(); ctx.fill();
            ctx.fillStyle = goldL; ctx.beginPath(); ctx.arc(cx, cy - hh * 0.32, hw * 0.015, 0, Math.PI * 2); ctx.fill();
        } else if (id === 'dc_earring') {
            ctx.fillStyle = gold; ctx.beginPath();
            ctx.arc(cx - hw * 0.95, cy + hh * 0.1, hw * 0.04, 0, Math.PI * 2);
            ctx.arc(cx + hw * 0.95, cy + hh * 0.1, hw * 0.04, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#40a0c0'; ctx.beginPath();
            ctx.ellipse(cx - hw * 0.95, cy + hh * 0.18, hw * 0.03, hh * 0.04, 0, 0, Math.PI * 2);
            ctx.ellipse(cx + hw * 0.95, cy + hh * 0.18, hw * 0.03, hh * 0.04, 0, 0, Math.PI * 2); ctx.fill();
        } else if (id === 'dc_ribbon') {
            ctx.fillStyle = '#c44040'; ctx.beginPath(); ctx.ellipse(cx, cy - hh * 0.9, hw * 0.6, hh * 0.06, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#c44040'; ctx.lineWidth = 2; ctx.beginPath();
            ctx.moveTo(cx + hw * 0.5, cy - hh * 0.85); ctx.quadraticCurveTo(cx + hw * 0.8, cy - hh * 0.5, cx + hw * 0.6, cy + hh * 0.2); ctx.stroke();
        } else if (id === 'dc_crown') {
            ctx.fillStyle = gold; ctx.beginPath(); ctx.ellipse(cx, cy - hh * 0.95, hw * 0.5, hh * 0.08, 0, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.moveTo(cx - hw * 0.3, cy - hh * 1.0);
            ctx.quadraticCurveTo(cx - hw * 0.5, cy - hh * 1.4, cx - hw * 0.2, cy - hh * 1.35);
            ctx.quadraticCurveTo(cx, cy - hh * 1.5, cx + hw * 0.2, cy - hh * 1.35);
            ctx.quadraticCurveTo(cx + hw * 0.5, cy - hh * 1.4, cx + hw * 0.3, cy - hh * 1.0);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#e05050'; ctx.beginPath(); ctx.arc(cx, cy - hh * 1.25, hw * 0.08, 0, Math.PI * 2); ctx.fill();
        } else if (id === 'dc_jade') {
            ctx.fillStyle = '#80c0a0'; ctx.beginPath();
            ctx.ellipse(cx + hw * 0.5, cy + hh * 1.5, hw * 0.1, hh * 0.08, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = gold; ctx.lineWidth = 0.6; ctx.stroke();
            ctx.lineWidth = 0.5; ctx.beginPath();
            ctx.moveTo(cx + hw * 0.5, cy + hh * 1.58); ctx.lineTo(cx + hw * 0.5, cy + hh * 1.8); ctx.stroke();
        }
    }

    // 在指定容器中绘制立绘
    render(container, parts, width, height) {
        this.createCanvas(container, width, height);
        this.draw(parts);
    }
}

// 全局立绘生成器实例
const portraitGen = new PortraitGenerator();
