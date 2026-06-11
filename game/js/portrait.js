/* ====== 深宫帝王录 - 立绘组装系统 v6 ====== */
/* 使用 Multiavatar（120亿种组合，免费商用）+ 古风服装叠加 */

// ====== 服装配色 ======
const COSTUME_COLORS = {
    empress:    { primary: '#8B2020', secondary: '#C9A84C', trim: '#E8D48B', name: '龙袍' },
    consort:    { primary: '#8B2020', secondary: '#C9A84C', trim: '#C44040', name: '贵妃宫装' },
    concubine:  { primary: '#2A5A8A', secondary: '#C9A84C', trim: '#4A8AB8', name: '妃位宫装' },
    noble:      { primary: '#3A6A5A', secondary: '#8A6A3A', trim: '#5AAA8A', name: '嫔位常服' },
    beauty:     { primary: '#5A5A7A', secondary: '#8A8A9A', trim: '#7A7AAA', name: '贵人素衣' },
    commoner:   { primary: '#6A6A6A', secondary: '#8A8A8A', trim: '#9A9A9A', name: '常在布衣' },
    promise:    { primary: '#5A5050', secondary: '#7A7070', trim: '#908888', name: '答应衣' },
    cold:       { primary: '#4A4A4A', secondary: '#6A6A6A', trim: '#808080', name: '冷宫衣' },
    prince:     { primary: '#2A4A8A', secondary: '#C9A84C', trim: '#4A7ABA', name: '皇子蟒袍' },
    princess:   { primary: '#8A3A5A', secondary: '#C9A84C', trim: '#AA5A7A', name: '公主礼服' },
    official:   { primary: '#2A4A2A', secondary: '#8A6A3A', trim: '#4A7A4A', name: '官服' },
    servant:    { primary: '#7A6A5A', secondary: '#5A4A3A', trim: '#9A8A7A', name: '侍女服' },
    romance:    { primary: '#6A3A5A', secondary: '#C9A84C', trim: '#8A5A7A', name: '闺秀服' }
};

// ====== 立绘组装器 ======
class PortraitGenerator {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.width = 120;
        this.height = 160;
        this.multiavatarAvailable = typeof multiavatar === 'function';
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
        // 生成唯一ID（Multiavatar用这个字符串生成唯一头像）
        const seed = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);

        return {
            seed: seed,
            gender: gender,
            rank: rank || 'noble',
            // 保留兼容字段
            hairColor: { base: '#2a1508' },
            eyeColor: { iris: '#3d2010' },
            skinTone: { base: '#ecdcc8' }
        };
    }

    // ====== 主绘制 ======
    draw(parts) {
        if (this.multiavatarAvailable) {
            this._drawMultiavatar(parts);
        } else {
            this._drawFallback(parts);
        }
    }

    // ====== Multiavatar 模式 ======
    _drawMultiavatar(parts) {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        ctx.clearRect(0, 0, w, h);

        // 背景
        ctx.fillStyle = 'rgba(42, 21, 21, 0.3)';
        ctx.fillRect(0, 0, w, h);

        // 使用 Multiavatar 生成 SVG
        const genderFilter = parts.gender === 'male' ? 'male' : 'female';
        let svgCode;
        try {
            svgCode = multiavatar(parts.seed, true, undefined, { gender: genderFilter });
        } catch (e) {
            // 如果带参数报错，用简单方式
            try {
                svgCode = multiavatar(parts.seed, true);
            } catch (e2) {
                this._drawFallback(parts);
                return;
            }
        }

        // 将 SVG 渲染到 Canvas
        const svgBlob = new Blob([svgCode], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();
        img.onload = () => {
            // 头像占上半部分
            const avatarSize = w * 0.9;
            const avatarX = (w - avatarSize) / 2;
            ctx.drawImage(img, avatarX, 2, avatarSize, avatarSize);
            URL.revokeObjectURL(url);

            // 绘制古风服装（下半身）
            this._drawCostumeOverlay(parts);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            this._drawFallback(parts);
        };
        img.src = url;
    }

    // ====== 古风服装叠加 ======
    _drawCostumeOverlay(parts) {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const costume = COSTUME_COLORS[parts.rank] || COSTUME_COLORS.noble;

        // 服装主体（下半身）
        const bodyTop = w * 0.72;
        ctx.fillStyle = costume.primary;
        ctx.beginPath();
        ctx.moveTo(w * 0.12, bodyTop);
        ctx.quadraticCurveTo(w * 0.08, bodyTop + h * 0.1, w * 0.08, h * 0.98);
        ctx.lineTo(w * 0.92, h * 0.98);
        ctx.quadraticCurveTo(w * 0.92, bodyTop + h * 0.1, w * 0.88, bodyTop);
        ctx.closePath();
        ctx.fill();

        // 交领
        ctx.fillStyle = costume.secondary;
        ctx.beginPath();
        ctx.moveTo(w * 0.35, bodyTop);
        ctx.lineTo(w * 0.5, bodyTop + h * 0.18);
        ctx.lineTo(w * 0.65, bodyTop);
        ctx.lineTo(w * 0.55, bodyTop - h * 0.01);
        ctx.lineTo(w * 0.5, bodyTop + h * 0.12);
        ctx.lineTo(w * 0.45, bodyTop - h * 0.01);
        ctx.closePath();
        ctx.fill();

        // 领口边线
        ctx.strokeStyle = costume.trim;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(w * 0.35, bodyTop);
        ctx.lineTo(w * 0.5, bodyTop + h * 0.18);
        ctx.lineTo(w * 0.65, bodyTop);
        ctx.stroke();

        // 腰带
        const beltY = bodyTop + h * 0.2;
        ctx.fillStyle = costume.trim;
        ctx.fillRect(w * 0.12, beltY, w * 0.76, h * 0.025);

        // 腰带装饰扣
        ctx.fillStyle = costume.secondary;
        ctx.fillRect(w * 0.44, beltY - h * 0.005, w * 0.12, h * 0.035);

        // 服装纹饰
        ctx.strokeStyle = costume.trim;
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(w * 0.5, bodyTop + h * 0.12);
        ctx.lineTo(w * 0.5, h * 0.95);
        ctx.stroke();
        // 横纹
        for (let i = 0; i < 3; i++) {
            const y = beltY + h * 0.06 + i * h * 0.06;
            ctx.beginPath();
            ctx.moveTo(w * 0.2, y);
            ctx.lineTo(w * 0.8, y);
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
    }

    // ====== 后备模式（纯Canvas简单绘制） ======
    _drawFallback(parts) {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        ctx.clearRect(0, 0, w, h);

        // 背景
        ctx.fillStyle = 'rgba(42, 21, 21, 0.3)';
        ctx.fillRect(0, 0, w, h);

        const cx = w / 2;
        const headCY = h * 0.28;
        const headW = w * 0.28;
        const headH = w * 0.32;
        const bodyTop = headCY + headH * 0.85;
        const costume = COSTUME_COLORS[parts.rank] || COSTUME_COLORS.noble;

        // 身体
        ctx.fillStyle = '#ecdcc8';
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.06, bodyTop);
        ctx.lineTo(cx + w * 0.06, bodyTop);
        ctx.lineTo(cx + w * 0.07, bodyTop + w * 0.08);
        ctx.lineTo(cx - w * 0.07, bodyTop + w * 0.08);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.34, bodyTop + w * 0.06);
        ctx.quadraticCurveTo(cx - w * 0.36, bodyTop + w * 0.15, cx - w * 0.3, h * 0.98);
        ctx.lineTo(cx + w * 0.3, h * 0.98);
        ctx.quadraticCurveTo(cx + w * 0.36, bodyTop + w * 0.15, cx + w * 0.34, bodyTop + w * 0.06);
        ctx.closePath();
        ctx.fill();

        // 服装
        ctx.fillStyle = costume.primary;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.33, bodyTop + w * 0.05);
        ctx.quadraticCurveTo(cx - w * 0.35, bodyTop + w * 0.12, cx - w * 0.28, h * 0.98);
        ctx.lineTo(cx + w * 0.28, h * 0.98);
        ctx.quadraticCurveTo(cx + w * 0.35, bodyTop + w * 0.12, cx + w * 0.33, bodyTop + w * 0.05);
        ctx.closePath();
        ctx.fill();

        // 交领
        ctx.fillStyle = costume.secondary;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.15, bodyTop + w * 0.05);
        ctx.lineTo(cx, bodyTop + w * 0.28);
        ctx.lineTo(cx + w * 0.15, bodyTop + w * 0.05);
        ctx.closePath();
        ctx.fill();

        // 腰带
        ctx.fillStyle = costume.trim;
        ctx.fillRect(cx - w * 0.28, bodyTop + w * 0.32, w * 0.56, w * 0.03);

        // 脸
        ctx.fillStyle = '#ecdcc8';
        ctx.beginPath();
        ctx.ellipse(cx, headCY, headW, headH, 0, 0, Math.PI * 2);
        ctx.fill();

        // 头发
        ctx.fillStyle = '#2a1508';
        ctx.beginPath();
        ctx.ellipse(cx, headCY - headH * 0.3, headW * 1.1, headH * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx - headW * 1.15, headCY - headH * 0.1);
        ctx.quadraticCurveTo(cx - headW * 1.3, headCY + headH * 2, cx - headW * 0.6, headCY + headH * 3.5);
        ctx.lineTo(cx + headW * 0.6, headCY + headH * 3.5);
        ctx.quadraticCurveTo(cx + headW * 1.3, headCY + headH * 2, cx + headW * 1.15, headCY - headH * 0.1);
        ctx.quadraticCurveTo(cx, headCY - headH * 1.1, cx - headW * 1.15, headCY - headH * 0.1);
        ctx.fill();

        // 眼睛
        const eyeY = headCY - headH * 0.05;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(cx - headW * 0.35, eyeY, headW * 0.15, headH * 0.08, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + headW * 0.35, eyeY, headW * 0.15, headH * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3d2010';
        ctx.beginPath();
        ctx.arc(cx - headW * 0.35, eyeY, headW * 0.07, 0, Math.PI * 2);
        ctx.arc(cx + headW * 0.35, eyeY, headW * 0.07, 0, Math.PI * 2);
        ctx.fill();

        // 嘴
        ctx.strokeStyle = '#a04040';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, headCY + headH * 0.32, headW * 0.1, 0.2, Math.PI - 0.2);
        ctx.stroke();
    }

    // 渲染到容器
    render(container, parts, width, height) {
        this.createCanvas(container, width, height);
        this.draw(parts);
    }

    async renderAsync(container, parts, width, height) {
        this.createCanvas(container, width, height);
        this.draw(parts);
    }
}

// 全局立绘生成器实例
const portraitGen = new PortraitGenerator();
