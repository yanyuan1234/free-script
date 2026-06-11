/* ====== 深宫帝王录 - 立绘组装系统 v4 ====== */
/* 使用 DiceBear API 生成随机组装立绘 + 本地Canvas后备 */

// ====== DiceBear API 配置 ======
const DICEBEAR_API = 'https://api.dicebear.com/9.x';

// 角色类型对应的风格
const AVATAR_STYLES = {
    prince:    { style: 'lorelei',   options: { ears: 'variant1' } },
    princess:  { style: 'lorelei',   options: { ears: 'variant1' } },
    consort:   { style: 'lorelei',   options: { ears: 'variant1' } },
    official:  { style: 'adventurer', options: {} },
    servant:   { style: 'avataaars',  options: {} },
    romance:   { style: 'lorelei',   options: { ears: 'variant1' } },
    default:   { style: 'lorelei',   options: { ears: 'variant1' } }
};

// ====== 颜色池（用于本地Canvas后备） ======
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

// ====== 图片缓存 ======
const imageCache = {};

// 预加载图片
function preloadImage(path) {
    return new Promise((resolve) => {
        if (imageCache[path]) { resolve(imageCache[path]); return; }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { imageCache[path] = img; resolve(img); };
        img.onerror = () => { resolve(null); };
        img.src = path;
    });
}

// ====== 立绘组装器 ======
class PortraitGenerator {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.width = 120;
        this.height = 160;
        this.useApi = true; // 默认尝试API
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

        // 根据rank确定角色类型
        let charType = 'default';
        if (rank === 'prince') charType = 'prince';
        else if (rank === 'princess') charType = 'princess';
        else if (['empress','consort','concubine','noble','beauty','commoner','promise','cold'].includes(rank)) charType = 'consort';
        else if (rank === 'official') charType = 'official';
        else if (rank === 'servant') charType = 'servant';
        else if (rank === 'romance') charType = 'romance';

        // 生成唯一seed
        const seed = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);

        return {
            charType: charType,
            seed: seed,
            gender: gender,
            rank: rank,
            hairColor: hairColor,
            eyeColor: eyeColor,
            skinTone: skinTone
        };
    }

    // ====== 主绘制方法 ======
    async draw(parts) {
        if (this.useApi) {
            const success = await this._drawApi(parts);
            if (!success) {
                this.useApi = false;
                this._drawCanvas(parts);
            }
        } else {
            this._drawCanvas(parts);
        }
    }

    // ====== DiceBear API 模式 ======
    async _drawApi(parts) {
        const styleConfig = AVATAR_STYLES[parts.charType] || AVATAR_STYLES.default;
        const style = styleConfig.style;

        // 构建API URL
        let url = `${DICEBEAR_API}/${style}/svg?seed=${parts.seed}`;

        // 根据性别和角色类型添加选项
        if (parts.gender === 'female') {
            // lorelei风格支持的女性选项
            if (style === 'lorelei') {
                url += '&earrings=0&glasses=0';
            }
        }

        try {
            const img = await preloadImage(url);
            if (!img) return false;

            const ctx = this.ctx;
            const w = this.width;
            const h = this.height;
            ctx.clearRect(0, 0, w, h);

            // 绘制背景
            ctx.fillStyle = 'rgba(42, 21, 21, 0.3)';
            ctx.fillRect(0, 0, w, h);

            // 绘制DiceBear头像
            ctx.drawImage(img, w * 0.1, 0, w * 0.8, w * 0.8);

            // 绘制服装色块（下半部分）
            const costumeColor = this._getCostumeColor(parts.rank);
            ctx.fillStyle = costumeColor;
            ctx.beginPath();
            ctx.moveTo(w * 0.15, w * 0.75);
            ctx.quadraticCurveTo(w * 0.1, w * 0.85, w * 0.1, h);
            ctx.lineTo(w * 0.9, h);
            ctx.quadraticCurveTo(w * 0.9, w * 0.85, w * 0.85, w * 0.75);
            ctx.closePath();
            ctx.fill();

            // 服装纹饰
            ctx.strokeStyle = 'rgba(201,168,76,0.3)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(w * 0.5, w * 0.78);
            ctx.lineTo(w * 0.5, h * 0.95);
            ctx.stroke();

            return true;
        } catch (e) {
            return false;
        }
    }

    _getCostumeColor(rank) {
        const colors = {
            empress: '#8b2020', consort: '#8b2020', concubine: '#2a5a8a',
            noble: '#3a6a5a', beauty: '#5a5a7a', commoner: '#6a6a6a',
            promise: '#5a5050', cold: '#4a4a4a', prince: '#2a4a8a',
            princess: '#8a3a5a', official: '#2a4a2a', servant: '#7a6a5a',
            romance: '#6a3a5a'
        };
        return colors[rank] || '#3a5a8a';
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
        ctx.fillStyle = hc.base; ctx.beginPath();
        ctx.moveTo(cx - hw * 1.15, cy - hh * 0.3);
        ctx.quadraticCurveTo(cx - hw * 1.3, cy + hh * 0.5, cx - hw * 1.1, cy + hh * 3.5);
        ctx.lineTo(cx - hw * 0.6, cy + hh * 3.8);
        ctx.quadraticCurveTo(cx, cy + hh * 4.0, cx + hw * 0.6, cy + hh * 3.8);
        ctx.lineTo(cx + hw * 1.1, cy + hh * 3.5);
        ctx.quadraticCurveTo(cx + hw * 1.3, cy + hh * 0.5, cx + hw * 1.15, cy - hh * 0.3);
        ctx.quadraticCurveTo(cx, cy - hh * 1.2, cx - hw * 1.15, cy - hh * 0.3);
        ctx.fill();
        ctx.fillStyle = hc.highlight; ctx.globalAlpha = 0.15; ctx.beginPath();
        ctx.ellipse(cx - hw * 0.3, cy + hh * 0.5, hw * 0.3, hh * 1.5, -0.1, 0, Math.PI * 2);
        ctx.fill(); ctx.globalAlpha = 1.0;
    }

    // ====== 身体 ======
    _drawBody(ctx, cx, bodyTop, w, h, parts) {
        const skin = parts.skinTone;
        const shoulderW = w * 0.34;
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
        const costumeColor = this._getCostumeColor(parts.rank);
        const shoulderW = w * 0.33;
        ctx.fillStyle = costumeColor; ctx.beginPath();
        ctx.moveTo(cx - shoulderW, bodyTop + w * 0.05);
        ctx.quadraticCurveTo(cx - shoulderW * 1.02, bodyTop + w * 0.12, cx - shoulderW * 0.85, h * 0.98);
        ctx.lineTo(cx + shoulderW * 0.85, h * 0.98);
        ctx.quadraticCurveTo(cx + shoulderW * 1.02, bodyTop + w * 0.12, cx + shoulderW, bodyTop + w * 0.05);
        ctx.quadraticCurveTo(cx, bodyTop - w * 0.01, cx - shoulderW, bodyTop + w * 0.05);
        ctx.fill();
        ctx.fillStyle = '#c9a84c'; ctx.beginPath();
        ctx.moveTo(cx - shoulderW * 0.5, bodyTop + w * 0.05);
        ctx.lineTo(cx, bodyTop + w * 0.28);
        ctx.lineTo(cx + shoulderW * 0.5, bodyTop + w * 0.05);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e8d48b';
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
    }

    // ====== 前发 ======
    _drawHairFront(ctx, cx, cy, hw, hh, parts) {
        const hc = parts.hairColor;
        ctx.fillStyle = hc.base; ctx.beginPath();
        ctx.moveTo(cx - hw * 1.05, cy - hh * 0.1);
        ctx.quadraticCurveTo(cx, cy - hh * 1.15, cx + hw * 1.05, cy - hh * 0.1);
        ctx.lineTo(cx + hw * 1.0, cy - hh * 0.35); ctx.lineTo(cx + hw * 0.3, cy - hh * 0.32);
        ctx.lineTo(cx, cy - hh * 0.28); ctx.lineTo(cx - hw * 0.3, cy - hh * 0.32);
        ctx.lineTo(cx - hw * 1.0, cy - hh * 0.35); ctx.closePath(); ctx.fill();
        ctx.fillStyle = hc.highlight; ctx.globalAlpha = 0.12; ctx.beginPath();
        ctx.ellipse(cx - hw * 0.2, cy - hh * 0.6, hw * 0.3, hh * 0.25, -0.2, 0, Math.PI * 2);
        ctx.fill(); ctx.globalAlpha = 1.0;
    }

    // ====== 眉毛 ======
    _drawEyebrows(ctx, cx, cy, hw, hh, parts) {
        const hc = parts.hairColor;
        ctx.strokeStyle = hc.light; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
        const browY = cy - hh * 0.32;
        ctx.beginPath(); ctx.moveTo(cx - hw * 0.6, browY + hh * 0.02);
        ctx.quadraticCurveTo(cx - hw * 0.35, browY - hh * 0.08, cx - hw * 0.1, browY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + hw * 0.1, browY);
        ctx.quadraticCurveTo(cx + hw * 0.35, browY - hh * 0.08, cx + hw * 0.6, browY + hh * 0.02); ctx.stroke();
    }

    // ====== 眼睛 ======
    _drawEyes(ctx, cx, cy, hw, hh, parts) {
        const ec = parts.eyeColor;
        const eyeY = cy - hh * 0.08;
        const lx = cx - hw * 0.35, rx = cx + hw * 0.35;
        ctx.fillStyle = '#fff'; ctx.beginPath();
        ctx.ellipse(lx, eyeY, hw * 0.17, hh * 0.1, 0, 0, Math.PI * 2);
        ctx.ellipse(rx, eyeY, hw * 0.17, hh * 0.1, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#1a0a0a'; ctx.lineWidth = 1.2; ctx.beginPath();
        ctx.moveTo(lx - hw * 0.18, eyeY); ctx.quadraticCurveTo(lx, eyeY - hh * 0.12, lx + hw * 0.18, eyeY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(rx - hw * 0.18, eyeY); ctx.quadraticCurveTo(rx, eyeY - hh * 0.12, rx + hw * 0.18, eyeY); ctx.stroke();
        ctx.fillStyle = ec.iris; ctx.beginPath();
        ctx.arc(lx, eyeY, hw * 0.09, 0, Math.PI * 2); ctx.arc(rx, eyeY, hw * 0.09, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = ec.pupil; ctx.beginPath();
        ctx.arc(lx, eyeY, hw * 0.04, 0, Math.PI * 2); ctx.arc(rx, eyeY, hw * 0.04, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath();
        ctx.arc(lx + hw * 0.03, eyeY - hh * 0.02, hw * 0.03, 0, Math.PI * 2);
        ctx.arc(rx + hw * 0.03, eyeY - hh * 0.02, hw * 0.03, 0, Math.PI * 2); ctx.fill();
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
        const mouthY = cy + hh * 0.38;
        ctx.strokeStyle = '#a04040'; ctx.lineWidth = 1; ctx.beginPath();
        ctx.arc(cx, mouthY - hh * 0.04, hw * 0.12, 0.15, Math.PI - 0.15); ctx.stroke();
        ctx.fillStyle = '#c06060'; ctx.beginPath();
        ctx.arc(cx, mouthY - hh * 0.04, hw * 0.12, 0.15, Math.PI - 0.15);
        ctx.lineTo(cx - hw * 0.1, mouthY - hh * 0.02); ctx.closePath(); ctx.fill();
    }

    // ====== 装饰 ======
    _drawDeco(ctx, cx, cy, hw, hh, parts) {
        const gold = '#c9a84c';
        ctx.fillStyle = gold; ctx.beginPath();
        ctx.arc(cx + hw * 0.6, cy - hh * 0.85, hw * 0.08, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = gold; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(cx + hw * 0.6, cy - hh * 0.78);
        ctx.quadraticCurveTo(cx + hw * 0.55, cy - hh * 0.3, cx + hw * 0.57, cy - hh * 0.1); ctx.stroke();
    }

    // 在指定容器中绘制立绘（同步版本，用于简单场景）
    render(container, parts, width, height) {
        this.createCanvas(container, width, height);
        // 异步绘制
        this.draw(parts);
    }

    // 异步渲染（推荐）
    async renderAsync(container, parts, width, height) {
        this.createCanvas(container, width, height);
        await this.draw(parts);
    }
}

// 全局立绘生成器实例
const portraitGen = new PortraitGenerator();
