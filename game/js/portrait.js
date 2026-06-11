/* ====== 深宫帝王录 - 立绘组装系统 v2 ====== */
/* 部件化随机组装立绘，参照立ち絵さん思路：后发→身体→服装→脸→前发→表情→装饰 */

// ====== 颜色池 ======
const HAIR_COLORS = [
    { id: 'black',   base: '#0d0d12', light: '#1a1a24', highlight: '#2a2a3a' },
    { id: 'brown',   base: '#2a1508', light: '#3d2010', highlight: '#5a3520' },
    { id:'dkbrown',  base: '#1a0e05', light: '#2a1a0d', highlight: '#3d2a18' },
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

// ====== 立绘部件定义 ======
const PORTRAIT_PARTS = {
    // 后发（8种）
    hairBack: [
        { id: 'hb_long',     name: '长发' },
        { id: 'hb_midlong',  name: '中长发' },
        { id: 'hb_short',    name: '短发' },
        { id: 'hb_bun',      name: '高髻' },
        { id: 'hb_double',   name: '双髻' },
        { id: 'hb_lowbun',   name: '低髻' },
        { id: 'hb_flower',   name: '花苞头' },
        { id: 'hb_ponytail', name: '马尾' }
    ],
    // 身体
    body: [
        { id: 'bd_std',    name: '标准', gender: 'both' },
        { id: 'bd_slender', name: '纤细', gender: 'female' },
        { id: 'bd_strong',  name: '健硕', gender: 'male' }
    ],
    // 服装（10种）
    costume: [
        { id: 'cs_dragon',  name: '龙袍',   rank: 'empress',  primary: '#c9a84c', secondary: '#8b2020', trim: '#e8d48b' },
        { id: 'cs_noble',   name: '贵妃宫装', rank: 'consort',  primary: '#8b2020', secondary: '#c9a84c', trim: '#e8d48b' },
        { id: 'cs_palace',  name: '妃位宫装', rank: 'concubine', primary: '#2a5a8a', secondary: '#c9a84c', trim: '#8ab8d8' },
        { id: 'cs_elegant', name: '嫔位常服', rank: 'noble',     primary: '#3a6a5a', secondary: '#8a6a3a', trim: '#a0c8b0' },
        { id: 'cs_simple',  name: '贵人素衣', rank: 'beauty',    primary: '#5a5a7a', secondary: '#8a8a9a', trim: '#a0a0b8' },
        { id: 'cs_plain',   name: '常在布衣', rank: 'commoner',  primary: '#6a6a6a', secondary: '#8a8a8a', trim: '#a0a0a0' },
        { id: 'cs_promise', name: '答应衣',  rank: 'promise',   primary: '#5a5050', secondary: '#7a7070', trim: '#908888' },
        { id: 'cs_prince',  name: '皇子蟒袍', rank: 'prince',    primary: '#2a4a8a', secondary: '#c9a84c', trim: '#6a8ac0' },
        { id: 'cs_princess', name: '公主礼服', rank: 'princess', primary: '#8a3a5a', secondary: '#c9a84c', trim: '#c08aa0' },
        { id: 'cs_servant', name: '侍女服',  rank: 'servant',   primary: '#7a6a5a', secondary: '#5a4a3a', trim: '#9a8a7a' }
    ],
    // 前发（8种）
    hairFront: [
        { id: 'hf_bangs',     name: '齐刘海' },
        { id: 'hf_sidebangs', name: '斜刘海' },
        { id: 'hf_center',    name: '中分' },
        { id: 'hf_sidesweep', name: '偏分' },
        { id: 'hf_wispy',     name: '碎刘海' },
        { id: 'hf_curly',     name: '卷刘海' },
        { id: 'hf_short',     name: '短前发' },
        { id: 'hf_none',      name: '无刘海' }
    ],
    // 眉毛（6种）
    eyebrows: [
        { id: 'eb_willow',  name: '柳叶眉' },
        { id: 'eb_sword',   name: '剑眉' },
        { id: 'eb_arched',  name: '弯眉' },
        { id: 'eb_flat',    name: '平眉' },
        { id: 'eb_thin',    name: '细眉' },
        { id: 'eb_thick',   name: '浓眉' }
    ],
    // 眼睛（8种）
    eyes: [
        { id: 'ey_almond',  name: '杏眼' },
        { id: 'ey_phoenix', name: '丹凤眼' },
        { id: 'ey_peach',   name: '桃花眼' },
        { id: 'ey_round',   name: '圆眼' },
        { id: 'ey_narrow',  name: '细长眼' },
        { id: 'ey_cat',     name: '猫眼' },
        { id: 'ey_droopy',  name: '下垂眼' },
        { id: 'ey_sharp',   name: '锐眼' }
    ],
    // 嘴巴（8种）
    mouth: [
        { id: 'mt_smile',    name: '微笑' },
        { id: 'mt_closed',   name: '抿嘴' },
        { id: 'mt_open',     name: '微张' },
        { id: 'mt_smirk',    name: '冷笑' },
        { id: 'mt_sad',      name: '忧郁' },
        { id: 'mt_surprise', name: '惊讶' },
        { id: 'mt_angry',    name: '怒容' },
        { id: 'mt_small',    name: '小嘴' }
    ],
    // 装饰（8种）
    deco: [
        { id: 'dc_none',      name: '无' },
        { id: 'dc_hairpin',   name: '发簪' },
        { id: 'dc_buyao',     name: '步摇' },
        { id: 'dc_huadian',   name: '花钿' },
        { id: 'dc_earring',   name: '耳坠' },
        { id: 'dc_ribbon',    name: '发带' },
        { id: 'dc_crown',     name: '凤冠' },
        { id: 'dc_jade',      name: '玉佩' }
    ]
};

// ====== 立绘组装器 ======
class PortraitGenerator {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.width = 120;
        this.height = 160;
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
            costume = PORTRAIT_PARTS.costume.find(c => c.rank === rank) ||
                      PORTRAIT_PARTS.costume[Math.floor(Math.random() * PORTRAIT_PARTS.costume.length)];
        } else {
            costume = PORTRAIT_PARTS.costume[Math.floor(Math.random() * PORTRAIT_PARTS.costume.length)];
        }

        const bodyPool = PORTRAIT_PARTS.body.filter(b => b.gender === 'both' || b.gender === gender);
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

        return {
            hairBack: pick(PORTRAIT_PARTS.hairBack),
            body: pick(bodyPool),
            costume: costume,
            hairFront: pick(PORTRAIT_PARTS.hairFront),
            eyebrows: pick(PORTRAIT_PARTS.eyebrows),
            eyes: pick(PORTRAIT_PARTS.eyes),
            mouth: pick(PORTRAIT_PARTS.mouth),
            deco: pick(PORTRAIT_PARTS.deco),
            hairColor: hairColor,
            eyeColor: eyeColor,
            skinTone: skinTone
        };
    }

    // ====== 主绘制方法 ======
    draw(parts) {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        ctx.clearRect(0, 0, w, h);

        // 基准参数
        const cx = w / 2;
        const headCY = h * 0.28;   // 头部中心Y
        const headW = w * 0.28;    // 头部半宽
        const headH = w * 0.32;    // 头部半高
        const bodyTop = headCY + headH * 0.85;

        // 按层绘制
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

        // 后发底色（大范围）
        ctx.fillStyle = hc.base;
        ctx.beginPath();

        if (id === 'hb_long') {
            // 长发：从头顶一直垂到腰部
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
            // 高髻：头顶发髻 + 短后发
            ctx.ellipse(cx, cy - hh * 0.1, hw * 1.1, hh * 1.2, 0, 0, Math.PI * 2);
            // 发髻
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(cx, cy - hh * 1.3, hw * 0.6, hw * 0.55, 0, 0, Math.PI * 2);
        } else if (id === 'hb_double') {
            // 双髻
            ctx.ellipse(cx, cy - hh * 0.1, hw * 1.1, hh * 1.2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(cx - hw * 0.8, cy - hh * 1.0, hw * 0.45, hw * 0.5, -0.2, 0, Math.PI * 2);
            ctx.ellipse(cx + hw * 0.8, cy - hh * 1.0, hw * 0.45, hw * 0.5, 0.2, 0, Math.PI * 2);
        } else if (id === 'hb_lowbun') {
            ctx.ellipse(cx, cy - hh * 0.1, hw * 1.1, hh * 1.2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(cx, cy + hh * 0.8, hw * 0.55, hw * 0.5, 0, 0, Math.PI * 2);
        } else if (id === 'hb_flower') {
            ctx.ellipse(cx, cy - hh * 0.1, hw * 1.1, hh * 1.2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            // 花苞形
            ctx.ellipse(cx - hw * 0.4, cy - hh * 1.1, hw * 0.35, hw * 0.4, -0.3, 0, Math.PI * 2);
            ctx.ellipse(cx + hw * 0.4, cy - hh * 1.1, hw * 0.35, hw * 0.4, 0.3, 0, Math.PI * 2);
            ctx.ellipse(cx, cy - hh * 1.3, hw * 0.3, hw * 0.35, 0, 0, Math.PI * 2);
        } else if (id === 'hb_ponytail') {
            ctx.ellipse(cx, cy - hh * 0.1, hw * 1.1, hh * 1.2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            // 马尾
            ctx.moveTo(cx + hw * 0.3, cy - hh * 0.5);
            ctx.quadraticCurveTo(cx + hw * 1.5, cy + hh * 0.5, cx + hw * 1.2, cy + hh * 3.0);
            ctx.quadraticCurveTo(cx + hw * 0.8, cy + hh * 3.2, cx + hw * 0.6, cy + hh * 2.8);
            ctx.quadraticCurveTo(cx + hw * 1.0, cy + hh * 0.3, cx + hw * 0.2, cy - hh * 0.3);
        }
        ctx.fill();

        // 后发高光
        ctx.fillStyle = hc.highlight;
        ctx.globalAlpha = 0.15;
        ctx.beginPath();
        if (id === 'hb_long' || id === 'hb_midlong') {
            ctx.ellipse(cx - hw * 0.3, cy + hh * 0.5, hw * 0.3, hh * 1.5, -0.1, 0, Math.PI * 2);
        } else {
            ctx.ellipse(cx - hw * 0.2, cy - hh * 0.3, hw * 0.4, hh * 0.5, 0, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }

    // ====== 身体 ======
    _drawBody(ctx, cx, bodyTop, w, h, parts) {
        const skin = parts.skinTone;
        const bd = parts.body.id;
        const shoulderW = bd === 'bd_strong' ? w * 0.38 : bd === 'bd_slender' ? w * 0.3 : w * 0.34;

        // 脖子
        ctx.fillStyle = skin.shadow;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.06, bodyTop);
        ctx.lineTo(cx + w * 0.06, bodyTop);
        ctx.lineTo(cx + w * 0.07, bodyTop + w * 0.08);
        ctx.lineTo(cx - w * 0.07, bodyTop + w * 0.08);
        ctx.closePath();
        ctx.fill();

        // 身体轮廓
        ctx.fillStyle = skin.base;
        ctx.beginPath();
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

        // 服装主体
        ctx.fillStyle = cs.primary;
        ctx.beginPath();
        ctx.moveTo(cx - shoulderW, bodyTop + w * 0.05);
        ctx.quadraticCurveTo(cx - shoulderW * 1.02, bodyTop + w * 0.12, cx - shoulderW * 0.85, h * 0.98);
        ctx.lineTo(cx + shoulderW * 0.85, h * 0.98);
        ctx.quadraticCurveTo(cx + shoulderW * 1.02, bodyTop + w * 0.12, cx + shoulderW, bodyTop + w * 0.05);
        ctx.quadraticCurveTo(cx, bodyTop - w * 0.01, cx - shoulderW, bodyTop + w * 0.05);
        ctx.fill();

        // 交领（V字领口）
        ctx.fillStyle = cs.secondary;
        ctx.beginPath();
        ctx.moveTo(cx - shoulderW * 0.5, bodyTop + w * 0.05);
        ctx.lineTo(cx, bodyTop + w * 0.28);
        ctx.lineTo(cx + shoulderW * 0.5, bodyTop + w * 0.05);
        ctx.lineTo(cx + shoulderW * 0.3, bodyTop + w * 0.02);
        ctx.lineTo(cx, bodyTop + w * 0.2);
        ctx.lineTo(cx - shoulderW * 0.3, bodyTop + w * 0.02);
        ctx.closePath();
        ctx.fill();

        // 领口边线
        ctx.strokeStyle = cs.trim;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - shoulderW * 0.5, bodyTop + w * 0.05);
        ctx.lineTo(cx, bodyTop + w * 0.28);
        ctx.lineTo(cx + shoulderW * 0.5, bodyTop + w * 0.05);
        ctx.stroke();

        // 腰带
        const beltY = bodyTop + w * 0.32;
        ctx.fillStyle = cs.trim;
        ctx.fillRect(cx - shoulderW * 0.8, beltY, shoulderW * 1.6, w * 0.03);

        // 服装纹饰
        ctx.strokeStyle = cs.trim;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 0.5;
        // 胸前纹饰
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(cx, bodyTop + w * 0.18 + i * w * 0.04, shoulderW * (0.15 + i * 0.08), 0, Math.PI);
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
    }

    // ====== 脸部 ======
    _drawFace(ctx, cx, cy, hw, hh, parts) {
        const skin = parts.skinTone;

        // 脸部阴影
        ctx.fillStyle = skin.shadow;
        ctx.beginPath();
        ctx.ellipse(cx, cy + hh * 0.05, hw * 1.02, hh * 1.02, 0, 0, Math.PI * 2);
        ctx.fill();

        // 脸部主体
        ctx.fillStyle = skin.base;
        ctx.beginPath();
        ctx.ellipse(cx, cy, hw, hh, 0, 0, Math.PI * 2);
        ctx.fill();

        // 腮红
        ctx.fillStyle = skin.blush;
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.ellipse(cx - hw * 0.55, cy + hh * 0.25, hw * 0.2, hh * 0.12, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + hw * 0.55, cy + hh * 0.25, hw * 0.2, hh * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // 耳朵
        ctx.fillStyle = skin.base;
        ctx.beginPath();
        ctx.ellipse(cx - hw * 0.95, cy, hw * 0.12, hh * 0.15, -0.2, 0, Math.PI * 2);
        ctx.ellipse(cx + hw * 0.95, cy, hw * 0.12, hh * 0.15, 0.2, 0, Math.PI * 2);
        ctx.fill();
    }

    // ====== 前发 ======
    _drawHairFront(ctx, cx, cy, hw, hh, parts) {
        const hc = parts.hairColor;
        const id = parts.hairFront.id;

        ctx.fillStyle = hc.base;
        ctx.beginPath();

        if (id === 'hf_bangs') {
            // 齐刘海
            ctx.moveTo(cx - hw * 1.05, cy - hh * 0.1);
            ctx.quadraticCurveTo(cx - hw * 0.8, cy - hh * 1.15, cx, cy - hh * 1.1);
            ctx.quadraticCurveTo(cx + hw * 0.8, cy - hh * 1.15, cx + hw * 1.05, cy - hh * 0.1);
            ctx.lineTo(cx + hw * 1.0, cy - hh * 0.35);
            ctx.lineTo(cx + hw * 0.6, cy - hh * 0.3);
            ctx.lineTo(cx + hw * 0.3, cy - hh * 0.32);
            ctx.lineTo(cx, cy - hh * 0.28);
            ctx.lineTo(cx - hw * 0.3, cy - hh * 0.32);
            ctx.lineTo(cx - hw * 0.6, cy - hh * 0.3);
            ctx.lineTo(cx - hw * 1.0, cy - hh * 0.35);
            ctx.closePath();
        } else if (id === 'hf_sidebangs') {
            // 斜刘海
            ctx.moveTo(cx - hw * 1.05, cy - hh * 0.15);
            ctx.quadraticCurveTo(cx - hw * 0.5, cy - hh * 1.15, cx + hw * 0.5, cy - hh * 1.1);
            ctx.quadraticCurveTo(cx + hw * 1.05, cy - hh * 1.0, cx + hw * 1.1, cy - hh * 0.2);
            ctx.lineTo(cx + hw * 0.8, cy - hh * 0.15);
            ctx.lineTo(cx + hw * 0.4, cy - hh * 0.2);
            ctx.lineTo(cx, cy - hh * 0.5);
            ctx.lineTo(cx - hw * 0.5, cy - hh * 0.8);
            ctx.lineTo(cx - hw * 0.9, cy - hh * 0.3);
            ctx.closePath();
        } else if (id === 'hf_center') {
            // 中分
            ctx.moveTo(cx - hw * 1.05, cy - hh * 0.1);
            ctx.quadraticCurveTo(cx - hw * 0.6, cy - hh * 1.15, cx, cy - hh * 1.05);
            ctx.quadraticCurveTo(cx + hw * 0.6, cy - hh * 1.15, cx + hw * 1.05, cy - hh * 0.1);
            ctx.lineTo(cx + hw * 0.5, cy - hh * 0.2);
            ctx.lineTo(cx + hw * 0.15, cy - hh * 0.7);
            ctx.lineTo(cx, cy - hh * 0.15);
            ctx.lineTo(cx - hw * 0.15, cy - hh * 0.7);
            ctx.lineTo(cx - hw * 0.5, cy - hh * 0.2);
            ctx.closePath();
        } else if (id === 'hf_sidesweep') {
            // 偏分
            ctx.moveTo(cx - hw * 1.05, cy + hh * 0.1);
            ctx.quadraticCurveTo(cx - hw * 0.8, cy - hh * 1.1, cx + hw * 0.3, cy - hh * 1.15);
            ctx.quadraticCurveTo(cx + hw * 1.1, cy - hh * 1.0, cx + hw * 1.1, cy - hh * 0.1);
            ctx.lineTo(cx + hw * 0.6, cy - hh * 0.15);
            ctx.lineTo(cx, cy - hh * 0.4);
            ctx.lineTo(cx - hw * 0.5, cy - hh * 0.6);
            ctx.lineTo(cx - hw * 0.8, cy - hh * 0.1);
            ctx.closePath();
        } else if (id === 'hf_wispy') {
            // 碎刘海
            ctx.moveTo(cx - hw * 1.05, cy - hh * 0.1);
            ctx.quadraticCurveTo(cx, cy - hh * 1.15, cx + hw * 1.05, cy - hh * 0.1);
            ctx.lineTo(cx + hw * 0.9, cy - hh * 0.45);
            ctx.lineTo(cx + hw * 0.5, cy - hh * 0.35);
            ctx.lineTo(cx + hw * 0.2, cy - hh * 0.5);
            ctx.lineTo(cx, cy - hh * 0.38);
            ctx.lineTo(cx - hw * 0.3, cy - hh * 0.48);
            ctx.lineTo(cx - hw * 0.6, cy - hh * 0.35);
            ctx.lineTo(cx - hw * 0.9, cy - hh * 0.45);
            ctx.closePath();
        } else if (id === 'hf_curly') {
            // 卷刘海
            ctx.moveTo(cx - hw * 1.05, cy - hh * 0.05);
            ctx.quadraticCurveTo(cx, cy - hh * 1.15, cx + hw * 1.05, cy - hh * 0.05);
            // 卷曲的底边
            for (let i = 0; i < 5; i++) {
                const x = cx - hw * 0.8 + (hw * 1.6 / 5) * (i + 0.5);
                const y = cy - hh * 0.35;
                ctx.quadraticCurveTo(x + hw * 0.12, y - hh * 0.1, x + hw * 0.08, y + hh * 0.05);
                ctx.quadraticCurveTo(x - hw * 0.05, y + hh * 0.08, x - hw * 0.1, y);
            }
            ctx.closePath();
        } else if (id === 'hf_short') {
            // 短前发
            ctx.moveTo(cx - hw * 1.05, cy - hh * 0.2);
            ctx.quadraticCurveTo(cx, cy - hh * 1.15, cx + hw * 1.05, cy - hh * 0.2);
            ctx.lineTo(cx + hw * 0.8, cy - hh * 0.55);
            ctx.lineTo(cx + hw * 0.3, cy - hh * 0.5);
            ctx.lineTo(cx - hw * 0.3, cy - hh * 0.5);
            ctx.lineTo(cx - hw * 0.8, cy - hh * 0.55);
            ctx.closePath();
        } else {
            // 无刘海 - 仅头顶
            ctx.moveTo(cx - hw * 1.05, cy - hh * 0.4);
            ctx.quadraticCurveTo(cx, cy - hh * 1.15, cx + hw * 1.05, cy - hh * 0.4);
            ctx.quadraticCurveTo(cx, cy - hh * 0.6, cx - hw * 1.05, cy - hh * 0.4);
        }
        ctx.fill();

        // 前发高光
        ctx.fillStyle = hc.highlight;
        ctx.globalAlpha = 0.12;
        ctx.beginPath();
        ctx.ellipse(cx - hw * 0.2, cy - hh * 0.6, hw * 0.3, hh * 0.25, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }

    // ====== 眉毛 ======
    _drawEyebrows(ctx, cx, cy, hw, hh, parts) {
        const hc = parts.hairColor;
        ctx.strokeStyle = hc.light;
        const id = parts.eyebrows.id;
        const eyeY = cy - hh * 0.1;
        const browY = eyeY - hh * 0.22;

        ctx.lineWidth = id === 'eb_thick' ? 2 : id === 'eb_thin' ? 0.8 : 1.2;
        ctx.lineCap = 'round';

        if (id === 'eb_willow') {
            // 柳叶眉 - 细长弯曲
            ctx.beginPath();
            ctx.moveTo(cx - hw * 0.6, browY + hh * 0.02);
            ctx.quadraticCurveTo(cx - hw * 0.35, browY - hh * 0.08, cx - hw * 0.1, browY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + hw * 0.1, browY);
            ctx.quadraticCurveTo(cx + hw * 0.35, browY - hh * 0.08, cx + hw * 0.6, browY + hh * 0.02);
            ctx.stroke();
        } else if (id === 'eb_sword') {
            // 剑眉 - 上扬有力
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(cx - hw * 0.65, browY + hh * 0.06);
            ctx.lineTo(cx - hw * 0.1, browY - hh * 0.08);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + hw * 0.1, browY - hh * 0.08);
            ctx.lineTo(cx + hw * 0.65, browY + hh * 0.06);
            ctx.stroke();
        } else if (id === 'eb_arched') {
            // 弯眉 - 拱形
            ctx.beginPath();
            ctx.arc(cx - hw * 0.35, browY + hh * 0.05, hw * 0.28, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx + hw * 0.35, browY + hh * 0.05, hw * 0.28, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
        } else if (id === 'eb_flat') {
            // 平眉 - 一字眉
            ctx.beginPath();
            ctx.moveTo(cx - hw * 0.6, browY);
            ctx.lineTo(cx - hw * 0.1, browY - hh * 0.02);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + hw * 0.1, browY - hh * 0.02);
            ctx.lineTo(cx + hw * 0.6, browY);
            ctx.stroke();
        } else if (id === 'eb_thin') {
            // 细眉
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(cx - hw * 0.55, browY);
            ctx.quadraticCurveTo(cx - hw * 0.35, browY - hh * 0.05, cx - hw * 0.1, browY + hh * 0.01);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + hw * 0.1, browY + hh * 0.01);
            ctx.quadraticCurveTo(cx + hw * 0.35, browY - hh * 0.05, cx + hw * 0.55, browY);
            ctx.stroke();
        } else {
            // 浓眉
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(cx - hw * 0.6, browY + hh * 0.04);
            ctx.quadraticCurveTo(cx - hw * 0.35, browY - hh * 0.06, cx - hw * 0.1, browY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + hw * 0.1, browY);
            ctx.quadraticCurveTo(cx + hw * 0.35, browY - hh * 0.06, cx + hw * 0.6, browY + hh * 0.04);
            ctx.stroke();
        }
    }

    // ====== 眼睛 ======
    _drawEyes(ctx, cx, cy, hw, hh, parts) {
        const ec = parts.eyeColor;
        const id = parts.eyes.id;
        const eyeY = cy - hh * 0.08;
        const lx = cx - hw * 0.35;  // 左眼中心x
        const rx = cx + hw * 0.35;  // 右眼中心x

        // 眼白
        ctx.fillStyle = '#fff';
        ctx.beginPath();

        if (id === 'ey_almond') {
            // 杏眼 - 圆润
            ctx.ellipse(lx, eyeY, hw * 0.17, hh * 0.1, 0, 0, Math.PI * 2);
            ctx.ellipse(rx, eyeY, hw * 0.17, hh * 0.1, 0, 0, Math.PI * 2);
        } else if (id === 'ey_phoenix') {
            // 丹凤眼 - 细长上挑
            ctx.ellipse(lx, eyeY, hw * 0.2, hh * 0.07, -0.1, 0, Math.PI * 2);
            ctx.ellipse(rx, eyeY, hw * 0.2, hh * 0.07, 0.1, 0, Math.PI * 2);
        } else if (id === 'ey_peach') {
            // 桃花眼 - 微弯
            ctx.ellipse(lx, eyeY, hw * 0.18, hh * 0.09, 0, 0, Math.PI * 2);
            ctx.ellipse(rx, eyeY, hw * 0.18, hh * 0.09, 0, 0, Math.PI * 2);
        } else if (id === 'ey_round') {
            // 圆眼
            ctx.ellipse(lx, eyeY, hw * 0.15, hh * 0.12, 0, 0, Math.PI * 2);
            ctx.ellipse(rx, eyeY, hw * 0.15, hh * 0.12, 0, 0, Math.PI * 2);
        } else if (id === 'ey_narrow') {
            // 细长眼
            ctx.ellipse(lx, eyeY, hw * 0.22, hh * 0.055, 0, 0, Math.PI * 2);
            ctx.ellipse(rx, eyeY, hw * 0.22, hh * 0.055, 0, 0, Math.PI * 2);
        } else if (id === 'ey_cat') {
            // 猫眼 - 上挑
            ctx.ellipse(lx, eyeY, hw * 0.18, hh * 0.08, -0.15, 0, Math.PI * 2);
            ctx.ellipse(rx, eyeY, hw * 0.18, hh * 0.08, 0.15, 0, Math.PI * 2);
        } else if (id === 'ey_droopy') {
            // 下垂眼
            ctx.ellipse(lx, eyeY, hw * 0.17, hh * 0.09, 0.1, 0, Math.PI * 2);
            ctx.ellipse(rx, eyeY, hw * 0.17, hh * 0.09, -0.1, 0, Math.PI * 2);
        } else {
            // 锐眼
            ctx.ellipse(lx, eyeY, hw * 0.19, hh * 0.075, -0.05, 0, Math.PI * 2);
            ctx.ellipse(rx, eyeY, hw * 0.19, hh * 0.075, 0.05, 0, Math.PI * 2);
        }
        ctx.fill();

        // 上眼线
        ctx.strokeStyle = '#1a0a0a';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        if (id === 'ey_phoenix' || id === 'ey_cat') {
            // 上挑眼线
            ctx.moveTo(lx - hw * 0.2, eyeY + hh * 0.01);
            ctx.quadraticCurveTo(lx, eyeY - hh * 0.1, lx + hw * 0.22, eyeY - hh * 0.04);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(rx - hw * 0.22, eyeY - hh * 0.04);
            ctx.quadraticCurveTo(rx, eyeY - hh * 0.1, rx + hw * 0.2, eyeY + hh * 0.01);
        } else {
            ctx.moveTo(lx - hw * 0.18, eyeY);
            ctx.quadraticCurveTo(lx, eyeY - hh * 0.12, lx + hw * 0.18, eyeY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(rx - hw * 0.18, eyeY);
            ctx.quadraticCurveTo(rx, eyeY - hh * 0.12, rx + hw * 0.18, eyeY);
        }
        ctx.stroke();

        // 虹膜
        ctx.fillStyle = ec.iris;
        ctx.beginPath();
        ctx.arc(lx, eyeY, hw * 0.09, 0, Math.PI * 2);
        ctx.arc(rx, eyeY, hw * 0.09, 0, Math.PI * 2);
        ctx.fill();

        // 瞳孔
        ctx.fillStyle = ec.pupil;
        ctx.beginPath();
        ctx.arc(lx, eyeY, hw * 0.04, 0, Math.PI * 2);
        ctx.arc(rx, eyeY, hw * 0.04, 0, Math.PI * 2);
        ctx.fill();

        // 高光
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(lx + hw * 0.03, eyeY - hh * 0.02, hw * 0.03, 0, Math.PI * 2);
        ctx.arc(rx + hw * 0.03, eyeY - hh * 0.02, hw * 0.03, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(lx - hw * 0.02, eyeY + hh * 0.02, hw * 0.015, 0, Math.PI * 2);
        ctx.arc(rx - hw * 0.02, eyeY + hh * 0.02, hw * 0.015, 0, Math.PI * 2);
        ctx.fill();

        // 下睫毛（丹凤/猫眼/锐眼）
        if (id === 'ey_phoenix' || id === 'ey_cat' || id === 'ey_sharp') {
            ctx.strokeStyle = '#1a0a0a';
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(lx + hw * 0.18, eyeY + hh * 0.02);
            ctx.lineTo(lx + hw * 0.22, eyeY + hh * 0.05);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(rx - hw * 0.18, eyeY + hh * 0.02);
            ctx.lineTo(rx - hw * 0.22, eyeY + hh * 0.05);
            ctx.stroke();
        }
    }

    // ====== 鼻子 ======
    _drawNose(ctx, cx, cy, hw, hh, parts) {
        const noseY = cy + hh * 0.12;
        ctx.strokeStyle = parts.skinTone.shadow;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(cx, noseY - hh * 0.06);
        ctx.lineTo(cx - hw * 0.05, noseY + hh * 0.02);
        ctx.quadraticCurveTo(cx, noseY + hh * 0.04, cx + hw * 0.05, noseY + hh * 0.02);
        ctx.stroke();
    }

    // ====== 嘴巴 ======
    _drawMouth(ctx, cx, cy, hw, hh, parts) {
        const mouthY = cy + hh * 0.38;
        const id = parts.mouth.id;

        if (id === 'mt_smile') {
            // 微笑
            ctx.strokeStyle = '#a04040';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cx, mouthY - hh * 0.04, hw * 0.12, 0.15, Math.PI - 0.15);
            ctx.stroke();
            // 嘴唇填色
            ctx.fillStyle = '#c06060';
            ctx.beginPath();
            ctx.arc(cx, mouthY - hh * 0.04, hw * 0.12, 0.15, Math.PI - 0.15);
            ctx.lineTo(cx - hw * 0.1, mouthY - hh * 0.02);
            ctx.closePath();
            ctx.fill();
        } else if (id === 'mt_closed') {
            // 抿嘴
            ctx.strokeStyle = '#a04040';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(cx - hw * 0.1, mouthY);
            ctx.quadraticCurveTo(cx, mouthY - hh * 0.02, cx + hw * 0.1, mouthY);
            ctx.stroke();
        } else if (id === 'mt_open') {
            // 微张
            ctx.fillStyle = '#6a2828';
            ctx.beginPath();
            ctx.ellipse(cx, mouthY, hw * 0.08, hh * 0.05, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#a04040';
            ctx.lineWidth = 0.8;
            ctx.stroke();
        } else if (id === 'mt_smirk') {
            // 冷笑
            ctx.strokeStyle = '#a04040';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx - hw * 0.12, mouthY + hh * 0.01);
            ctx.quadraticCurveTo(cx, mouthY - hh * 0.04, cx + hw * 0.12, mouthY - hh * 0.02);
            ctx.stroke();
        } else if (id === 'mt_sad') {
            // 忧郁
            ctx.strokeStyle = '#a04040';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cx, mouthY + hh * 0.06, hw * 0.1, Math.PI + 0.2, -0.2);
            ctx.stroke();
        } else if (id === 'mt_surprise') {
            // 惊讶
            ctx.fillStyle = '#6a2828';
            ctx.beginPath();
            ctx.ellipse(cx, mouthY, hw * 0.06, hh * 0.07, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#a04040';
            ctx.lineWidth = 0.8;
            ctx.stroke();
        } else if (id === 'mt_angry') {
            // 怒容
            ctx.strokeStyle = '#a04040';
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.moveTo(cx - hw * 0.1, mouthY - hh * 0.01);
            ctx.lineTo(cx + hw * 0.1, mouthY - hh * 0.01);
            ctx.stroke();
            // 嘴角下拉
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(cx - hw * 0.1, mouthY - hh * 0.01);
            ctx.lineTo(cx - hw * 0.12, mouthY + hh * 0.03);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + hw * 0.1, mouthY - hh * 0.01);
            ctx.lineTo(cx + hw * 0.12, mouthY + hh * 0.03);
            ctx.stroke();
        } else {
            // 小嘴
            ctx.fillStyle = '#c06060';
            ctx.beginPath();
            ctx.ellipse(cx, mouthY, hw * 0.05, hh * 0.03, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ====== 装饰 ======
    _drawDeco(ctx, cx, cy, hw, hh, parts) {
        const id = parts.deco.id;
        if (id === 'dc_none') return;

        const goldColor = '#c9a84c';
        const goldLight = '#e8d48b';

        if (id === 'dc_hairpin') {
            // 发簪
            ctx.fillStyle = goldColor;
            ctx.beginPath();
            ctx.moveTo(cx + hw * 0.4, cy - hh * 0.9);
            ctx.lineTo(cx + hw * 1.2, cy - hh * 1.2);
            ctx.lineTo(cx + hw * 1.25, cy - hh * 1.1);
            ctx.closePath();
            ctx.fill();
            // 簪头花
            ctx.fillStyle = '#e05050';
            ctx.beginPath();
            ctx.arc(cx + hw * 1.2, cy - hh * 1.15, hw * 0.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = goldLight;
            ctx.beginPath();
            ctx.arc(cx + hw * 1.2, cy - hh * 1.15, hw * 0.04, 0, Math.PI * 2);
            ctx.fill();
        } else if (id === 'dc_buyao') {
            // 步摇
            ctx.fillStyle = goldColor;
            ctx.beginPath();
            ctx.arc(cx + hw * 0.6, cy - hh * 0.85, hw * 0.08, 0, Math.PI * 2);
            ctx.fill();
            // 流苏
            ctx.strokeStyle = goldColor;
            ctx.lineWidth = 0.6;
            for (let i = 0; i < 4; i++) {
                const sx = cx + hw * (0.5 + i * 0.07);
                ctx.beginPath();
                ctx.moveTo(cx + hw * 0.6, cy - hh * 0.78);
                ctx.quadraticCurveTo(sx, cy - hh * 0.3, sx + hw * 0.02, cy - hh * 0.1);
                ctx.stroke();
                // 流苏末端珠子
                ctx.fillStyle = goldLight;
                ctx.beginPath();
                ctx.arc(sx + hw * 0.02, cy - hh * 0.08, hw * 0.025, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (id === 'dc_huadian') {
            // 花钿（眉心红点）
            ctx.fillStyle = '#c44040';
            ctx.beginPath();
            // 菱形花钿
            ctx.moveTo(cx, cy - hh * 0.35);
            ctx.lineTo(cx + hw * 0.05, cy - hh * 0.32);
            ctx.lineTo(cx, cy - hh * 0.28);
            ctx.lineTo(cx - hw * 0.05, cy - hh * 0.32);
            ctx.closePath();
            ctx.fill();
            // 中心点
            ctx.fillStyle = '#e8d48b';
            ctx.beginPath();
            ctx.arc(cx, cy - hh * 0.32, hw * 0.015, 0, Math.PI * 2);
            ctx.fill();
        } else if (id === 'dc_earring') {
            // 耳坠
            ctx.fillStyle = goldColor;
            ctx.beginPath();
            ctx.arc(cx - hw * 0.95, cy + hh * 0.1, hw * 0.04, 0, Math.PI * 2);
            ctx.arc(cx + hw * 0.95, cy + hh * 0.1, hw * 0.04, 0, Math.PI * 2);
            ctx.fill();
            // 坠子
            ctx.fillStyle = '#40a0c0';
            ctx.beginPath();
            ctx.ellipse(cx - hw * 0.95, cy + hh * 0.18, hw * 0.03, hh * 0.04, 0, 0, Math.PI * 2);
            ctx.ellipse(cx + hw * 0.95, cy + hh * 0.18, hw * 0.03, hh * 0.04, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (id === 'dc_ribbon') {
            // 发带
            ctx.fillStyle = '#c44040';
            ctx.beginPath();
            ctx.ellipse(cx, cy - hh * 0.9, hw * 0.6, hh * 0.06, 0, 0, Math.PI * 2);
            ctx.fill();
            // 飘带
            ctx.strokeStyle = '#c44040';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx + hw * 0.5, cy - hh * 0.85);
            ctx.quadraticCurveTo(cx + hw * 0.8, cy - hh * 0.5, cx + hw * 0.6, cy + hh * 0.2);
            ctx.stroke();
        } else if (id === 'dc_crown') {
            // 凤冠（简化）
            ctx.fillStyle = goldColor;
            // 底座
            ctx.beginPath();
            ctx.ellipse(cx, cy - hh * 0.95, hw * 0.5, hh * 0.08, 0, 0, Math.PI * 2);
            ctx.fill();
            // 凤翼
            ctx.beginPath();
            ctx.moveTo(cx - hw * 0.3, cy - hh * 1.0);
            ctx.quadraticCurveTo(cx - hw * 0.5, cy - hh * 1.4, cx - hw * 0.2, cy - hh * 1.35);
            ctx.quadraticCurveTo(cx, cy - hh * 1.5, cx + hw * 0.2, cy - hh * 1.35);
            ctx.quadraticCurveTo(cx + hw * 0.5, cy - hh * 1.4, cx + hw * 0.3, cy - hh * 1.0);
            ctx.closePath();
            ctx.fill();
            // 中心宝珠
            ctx.fillStyle = '#e05050';
            ctx.beginPath();
            ctx.arc(cx, cy - hh * 1.25, hw * 0.08, 0, Math.PI * 2);
            ctx.fill();
        } else if (id === 'dc_jade') {
            // 玉佩（在服装上）
            ctx.fillStyle = '#80c0a0';
            ctx.beginPath();
            ctx.ellipse(cx + hw * 0.5, cy + hh * 1.5, hw * 0.1, hh * 0.08, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = goldColor;
            ctx.lineWidth = 0.6;
            ctx.stroke();
            // 流苏
            ctx.strokeStyle = goldColor;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(cx + hw * 0.5, cy + hh * 1.58);
            ctx.lineTo(cx + hw * 0.5, cy + hh * 1.8);
            ctx.stroke();
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
