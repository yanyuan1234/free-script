/* ====== 深宫帝王录 - Q版像素小人立绘系统 ====== */
/* 参照用户提供的参考图风格：大头小身、豆豆眼、腮红、多种发型 */

// ====== 配色表 ======
const HAIR_COLORS = [
    '#1a1a1a', '#2d1b0e', '#4a2e1a', '#6b4423', '#8b5a2b',
    '#a06b35', '#c49a6c', '#d4b896', '#e8d4b8', '#f5e6d3',
    '#5c3a21', '#7a5230', '#9e7b4f', '#b8956a', '#d4b896',
    '#8b4513', '#a0522d', '#cd853f', '#deb887', '#f4a460',
    '#696969', '#808080', '#a9a9a9', '#c0c0c0', '#d3d3d3',
    '#2f4f4f', '#556b2f', '#6b8e23', '#808000', '#bdb76b',
    '#8b0000', '#a52a2a', '#b22222', '#cd5c5c', '#dc143c',
    '#4b0082', '#6a0dad', '#8a2be2', '#9370db', '#ba55d3',
    '#191970', '#000080', '#4169e1', '#6495ed', '#87ceeb',
    '#006400', '#228b22', '#32cd32', '#90ee90', '#98fb98'
];

const EYE_COLORS = [
    '#1a1a1a', '#2d1b0e', '#4a2e1a', '#6b4423', '#8b5a2b',
    '#3d5c5c', '#4a6741', '#5a7a4a', '#6b8e5a', '#7aa06a',
    '#4a5a8a', '#5a6a9a', '#6a7aaa', '#7a8aba', '#8a9aca',
    '#6a4a7a', '#7a5a8a', '#8a6a9a', '#9a7aaa', '#aa8aba',
    '#8a6a4a', '#9a7a5a', '#aa8a6a', '#ba9a7a', '#caaa8a',
    '#5a3a3a', '#6a4a4a', '#7a5a5a', '#8a6a6a', '#9a7a7a'
];

const SKIN_COLORS = [
    '#fdf5e6', '#faf0e6', '#f5e6d3', '#f0e0c8', '#ebd8bc',
    '#e8d4b8', '#e0c8a8', '#d8bc9a', '#d4b896', '#c8a882',
    '#faebd7', '#ffe4c4', '#ffdab9', '#ffdead', '#f5deb3'
];

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

// ====== 伪随机数生成器（保证相同seed生成相同角色） ======
class SeededRandom {
    constructor(seed) {
        this.seed = seed;
    }

    next() {
        this.seed = (this.seed * 16807 + 0) % 2147483647;
        return (this.seed - 1) / 2147483646;
    }

    pick(arr) {
        return arr[Math.floor(this.next() * arr.length)];
    }

    range(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
}

// ====== 像素绘制工具 ======
function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h);
}

// ====== 立绘组装器 ======
class PortraitGenerator {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.baseW = 32;   // 基础像素宽度
        this.baseH = 40;   // 基础像素高度
        this.scale = 4;    // 放大倍数
    }

    createCanvas(container, width, height) {
        // width/height 是显示尺寸，我们根据显示尺寸计算合适的scale
        const targetW = width || 120;
        const targetH = height || 160;
        this.scale = Math.max(2, Math.floor(Math.min(targetW / this.baseW, targetH / this.baseH)));

        const canvas = document.createElement('canvas');
        canvas.width = this.baseW * this.scale;
        canvas.height = this.baseH * this.scale;
        canvas.style.width = targetW + 'px';
        canvas.style.height = targetH + 'px';
        canvas.style.imageRendering = 'pixelated';
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;
        container.innerHTML = '';
        container.appendChild(canvas);
        return canvas;
    }

    // 随机生成一套部件
    randomParts(gender, rank) {
        const seedStr = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        const seedNum = hashString(seedStr);

        return {
            seed: seedNum,
            seedStr: seedStr,
            gender: gender,
            rank: rank || 'noble'
        };
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

    // ====== 主绘制 ======
    draw(parts) {
        const ctx = this.ctx;
        const s = this.scale;
        const bw = this.baseW;
        const bh = this.baseH;

        // 清空
        ctx.clearRect(0, 0, bw * s, bh * s);

        // 生成随机器
        const rng = new SeededRandom(parts.seed);

        // 随机属性
        const hairColor = rng.pick(HAIR_COLORS);
        const eyeColor = rng.pick(EYE_COLORS);
        const skinColor = rng.pick(SKIN_COLORS);
        const costume = COSTUME_COLORS[parts.rank] || COSTUME_COLORS.noble;

        // 发型类型 (0-9)
        const hairStyle = rng.range(0, 9);
        // 表情类型 (0-3)
        const expression = rng.range(0, 3);
        // 是否有发饰
        const hasHairAccessory = rng.next() > 0.6;
        const accessoryColor = rng.pick(['#C9A84C', '#E8D48B', '#DC143C', '#4169E1', '#9370DB', '#FF69B4']);

        // 绘制顺序：身体 → 服装 → 头 → 头发(后) → 脸 → 头发(前/刘海) → 五官 → 腮红 → 发饰

        // 1. 身体（小身体）
        this._drawBody(ctx, s, bw, bh, skinColor, costume, parts.gender);

        // 2. 头部（大头）
        this._drawHead(ctx, s, bw, bh, skinColor);

        // 3. 后发（头发后部）
        this._drawBackHair(ctx, s, bw, bh, hairColor, hairStyle, parts.gender);

        // 4. 五官
        this._drawFace(ctx, s, bw, bh, eyeColor, expression);

        // 5. 前发/刘海
        this._drawFrontHair(ctx, s, bw, bh, hairColor, hairStyle, parts.gender);

        // 6. 发饰
        if (hasHairAccessory) {
            this._drawHairAccessory(ctx, s, bw, bh, hairStyle, accessoryColor);
        }
    }

    // ====== 绘制像素块工具 ======
    _pixel(ctx, s, x, y, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x * s, y * s, s, s);
    }

    _rect(ctx, s, x, y, w, h, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x * s, y * s, w * s, h * s);
    }

    // ====== 身体 ======
    _drawBody(ctx, s, bw, bh, skinColor, costume, gender) {
        const cx = Math.floor(bw / 2);
        const bodyY = 24;

        // 脖子
        this._rect(ctx, s, cx - 1, bodyY - 1, 2, 2, skinColor);

        // 身体主体（小）
        if (gender === 'male') {
            // 男装：直身，宽肩
            this._rect(ctx, s, cx - 4, bodyY + 1, 8, 6, costume.primary);
            // 衣领
            this._rect(ctx, s, cx - 1, bodyY + 1, 2, 2, costume.secondary);
            // 腰带
            this._rect(ctx, s, cx - 4, bodyY + 5, 8, 1, costume.trim);
            // 下摆
            this._rect(ctx, s, cx - 5, bodyY + 7, 10, 3, costume.primary);
            this._rect(ctx, s, cx - 4, bodyY + 10, 8, 2, costume.primary);
            // 袖子
            this._rect(ctx, s, cx - 6, bodyY + 2, 2, 4, costume.primary);
            this._rect(ctx, s, cx + 4, bodyY + 2, 2, 4, costume.primary);
        } else {
            // 女装：略收腰，裙摆
            this._rect(ctx, s, cx - 3, bodyY + 1, 6, 3, costume.primary);
            this._rect(ctx, s, cx - 4, bodyY + 4, 8, 3, costume.primary);
            this._rect(ctx, s, cx - 5, bodyY + 7, 10, 3, costume.primary);
            this._rect(ctx, s, cx - 4, bodyY + 10, 8, 2, costume.primary);
            // 衣领
            this._rect(ctx, s, cx - 1, bodyY + 1, 2, 2, costume.secondary);
            // 腰带
            this._rect(ctx, s, cx - 3, bodyY + 4, 6, 1, costume.trim);
            // 袖子
            this._rect(ctx, s, cx - 5, bodyY + 2, 2, 3, costume.primary);
            this._rect(ctx, s, cx + 3, bodyY + 2, 2, 3, costume.primary);
        }

        // 手（小豆豆手）
        this._pixel(ctx, s, cx - 6, bodyY + 6, skinColor);
        this._pixel(ctx, s, cx + 5, bodyY + 6, skinColor);
    }

    // ====== 头部 ======
    _drawHead(ctx, s, bw, bh, skinColor) {
        const cx = Math.floor(bw / 2);
        const headY = 8;

        // 圆脸主体 14×12
        for (let y = 0; y < 12; y++) {
            for (let x = 0; x < 14; x++) {
                // 圆形裁剪
                const dx = x - 6.5;
                const dy = y - 5.5;
                if (dx * dx + dy * dy < 38) {
                    this._pixel(ctx, s, cx - 6 + x, headY + y, skinColor);
                }
            }
        }
    }

    // ====== 后发 ======
    _drawBackHair(ctx, s, bw, bh, hairColor, hairStyle, gender) {
        const cx = Math.floor(bw / 2);
        const headY = 8;

        switch (hairStyle) {
            case 0: // 短发
                // 头顶和后脑勺
                for (let y = 0; y < 6; y++) {
                    for (let x = 0; x < 14; x++) {
                        const dx = x - 6.5;
                        const dy = y - 4;
                        if (dx * dx + dy * dy < 32) {
                            this._pixel(ctx, s, cx - 6 + x, headY + y - 2, hairColor);
                        }
                    }
                }
                // 两侧短发
                this._rect(ctx, s, cx - 7, headY + 2, 2, 5, hairColor);
                this._rect(ctx, s, cx + 5, headY + 2, 2, 5, hairColor);
                break;

            case 1: // 中长发
                for (let y = 0; y < 8; y++) {
                    for (let x = 0; x < 16; x++) {
                        const dx = x - 7.5;
                        const dy = y - 4;
                        if (dx * dx + dy * dy < 38) {
                            this._pixel(ctx, s, cx - 7 + x, headY + y - 2, hairColor);
                        }
                    }
                }
                // 垂发
                this._rect(ctx, s, cx - 8, headY + 4, 3, 8, hairColor);
                this._rect(ctx, s, cx + 5, headY + 4, 3, 8, hairColor);
                break;

            case 2: // 长发
                for (let y = 0; y < 10; y++) {
                    for (let x = 0; x < 16; x++) {
                        const dx = x - 7.5;
                        const dy = y - 4;
                        if (dx * dx + dy * dy < 42) {
                            this._pixel(ctx, s, cx - 7 + x, headY + y - 2, hairColor);
                        }
                    }
                }
                // 长垂发
                this._rect(ctx, s, cx - 8, headY + 4, 3, 14, hairColor);
                this._rect(ctx, s, cx + 5, headY + 4, 3, 14, hairColor);
                // 发尾略宽
                this._rect(ctx, s, cx - 9, headY + 14, 4, 2, hairColor);
                this._rect(ctx, s, cx + 5, headY + 14, 4, 2, hairColor);
                break;

            case 3: // 双马尾
                for (let y = 0; y < 7; y++) {
                    for (let x = 0; x < 14; x++) {
                        const dx = x - 6.5;
                        const dy = y - 4;
                        if (dx * dx + dy * dy < 34) {
                            this._pixel(ctx, s, cx - 6 + x, headY + y - 2, hairColor);
                        }
                    }
                }
                // 双马尾
                this._rect(ctx, s, cx - 10, headY + 2, 3, 10, hairColor);
                this._rect(ctx, s, cx - 11, headY + 10, 3, 3, hairColor);
                this._rect(ctx, s, cx + 7, headY + 2, 3, 10, hairColor);
                this._rect(ctx, s, cx + 8, headY + 10, 3, 3, hairColor);
                break;

            case 4: // 丸子头
                for (let y = 0; y < 6; y++) {
                    for (let x = 0; x < 14; x++) {
                        const dx = x - 6.5;
                        const dy = y - 4;
                        if (dx * dx + dy * dy < 32) {
                            this._pixel(ctx, s, cx - 6 + x, headY + y - 2, hairColor);
                        }
                    }
                }
                // 两侧丸子
                for (let y = 0; y < 5; y++) {
                    for (let x = 0; x < 5; x++) {
                        const dx = x - 2;
                        const dy = y - 2;
                        if (dx * dx + dy * dy < 6) {
                            this._pixel(ctx, s, cx - 9 + x, headY + y - 3, hairColor);
                            this._pixel(ctx, s, cx + 4 + x, headY + y - 3, hairColor);
                        }
                    }
                }
                break;

            case 5: // 单马尾/高马尾
                for (let y = 0; y < 7; y++) {
                    for (let x = 0; x < 14; x++) {
                        const dx = x - 6.5;
                        const dy = y - 4;
                        if (dx * dx + dy * dy < 34) {
                            this._pixel(ctx, s, cx - 6 + x, headY + y - 2, hairColor);
                        }
                    }
                }
                // 马尾
                this._rect(ctx, s, cx - 2, headY - 4, 4, 4, hairColor);
                this._rect(ctx, s, cx - 1, headY - 8, 2, 6, hairColor);
                this._rect(ctx, s, cx - 2, headY - 10, 3, 3, hairColor);
                break;

            case 6: // 呆毛
                for (let y = 0; y < 6; y++) {
                    for (let x = 0; x < 14; x++) {
                        const dx = x - 6.5;
                        const dy = y - 4;
                        if (dx * dx + dy * dy < 32) {
                            this._pixel(ctx, s, cx - 6 + x, headY + y - 2, hairColor);
                        }
                    }
                }
                // 呆毛
                this._pixel(ctx, s, cx, headY - 4, hairColor);
                this._pixel(ctx, s, cx + 1, headY - 5, hairColor);
                this._pixel(ctx, s, cx + 2, headY - 6, hairColor);
                break;

            case 7: // 侧分长发
                for (let y = 0; y < 9; y++) {
                    for (let x = 0; x < 16; x++) {
                        const dx = x - 7.5;
                        const dy = y - 4;
                        if (dx * dx + dy * dy < 40) {
                            this._pixel(ctx, s, cx - 7 + x, headY + y - 2, hairColor);
                        }
                    }
                }
                // 一侧长发
                this._rect(ctx, s, cx - 9, headY + 3, 3, 12, hairColor);
                this._rect(ctx, s, cx + 5, headY + 3, 2, 6, hairColor);
                break;

            case 8: // 蓬松卷发
                for (let y = 0; y < 8; y++) {
                    for (let x = 0; x < 16; x++) {
                        const dx = x - 7.5;
                        const dy = y - 4;
                        if (dx * dx + dy * dy < 40) {
                            this._pixel(ctx, s, cx - 7 + x, headY + y - 2, hairColor);
                        }
                    }
                }
                // 蓬松感
                this._pixel(ctx, s, cx - 9, headY + 1, hairColor);
                this._pixel(ctx, s, cx - 9, headY + 3, hairColor);
                this._pixel(ctx, s, cx + 8, headY + 1, hairColor);
                this._pixel(ctx, s, cx + 8, headY + 3, hairColor);
                this._rect(ctx, s, cx - 8, headY + 5, 2, 6, hairColor);
                this._rect(ctx, s, cx + 6, headY + 5, 2, 6, hairColor);
                break;

            case 9: // 齐刘海短发
                for (let y = 0; y < 6; y++) {
                    for (let x = 0; x < 14; x++) {
                        const dx = x - 6.5;
                        const dy = y - 4;
                        if (dx * dx + dy * dy < 32) {
                            this._pixel(ctx, s, cx - 6 + x, headY + y - 2, hairColor);
                        }
                    }
                }
                // 蘑菇头感
                this._rect(ctx, s, cx - 7, headY + 2, 2, 6, hairColor);
                this._rect(ctx, s, cx + 5, headY + 2, 2, 6, hairColor);
                this._rect(ctx, s, cx - 8, headY + 4, 1, 3, hairColor);
                this._rect(ctx, s, cx + 7, headY + 4, 1, 3, hairColor);
                break;
        }
    }

    // ====== 五官 ======
    _drawFace(ctx, s, bw, bh, eyeColor, expression) {
        const cx = Math.floor(bw / 2);
        const headY = 8;

        // 豆豆眼（2×2像素）
        const eyeY = headY + 6;
        const eyeOffset = 3;

        // 左眼
        this._rect(ctx, s, cx - eyeOffset - 1, eyeY, 2, 2, '#1a1a1a');
        // 右眼
        this._rect(ctx, s, cx + eyeOffset, eyeY, 2, 2, '#1a1a1a');

        // 眼睛高光（1像素）
        this._pixel(ctx, s, cx - eyeOffset, eyeY, '#ffffff');
        this._pixel(ctx, s, cx + eyeOffset + 1, eyeY, '#ffffff');

        // 嘴巴
        const mouthY = headY + 10;
        switch (expression) {
            case 0: // 微笑（小弧线）
                this._pixel(ctx, s, cx - 1, mouthY, '#c04040');
                this._pixel(ctx, s, cx, mouthY, '#c04040');
                this._pixel(ctx, s, cx + 1, mouthY, '#c04040');
                this._pixel(ctx, s, cx - 1, mouthY + 1, '#c04040');
                this._pixel(ctx, s, cx + 1, mouthY + 1, '#c04040');
                break;
            case 1: // 小嘴
                this._rect(ctx, s, cx - 1, mouthY, 2, 1, '#c04040');
                break;
            case 2: // 惊讶O嘴
                this._rect(ctx, s, cx - 1, mouthY, 2, 2, '#c04040');
                break;
            case 3: // 开心大笑
                this._rect(ctx, s, cx - 2, mouthY, 4, 2, '#c04040');
                this._pixel(ctx, s, cx - 1, mouthY + 1, '#ffffff');
                this._pixel(ctx, s, cx, mouthY + 1, '#ffffff');
                break;
        }

        // 腮红（粉色2×2）
        const blushColor = '#ffb6c1';
        this._rect(ctx, s, cx - 5, headY + 8, 2, 2, blushColor);
        this._rect(ctx, s, cx + 3, headY + 8, 2, 2, blushColor);
    }

    // ====== 前发/刘海 ======
    _drawFrontHair(ctx, s, bw, bh, hairColor, hairStyle, gender) {
        const cx = Math.floor(bw / 2);
        const headY = 8;

        switch (hairStyle) {
            case 0: // 短发刘海
                this._rect(ctx, s, cx - 5, headY + 1, 10, 2, hairColor);
                this._pixel(ctx, s, cx - 6, headY + 2, hairColor);
                this._pixel(ctx, s, cx + 5, headY + 2, hairColor);
                break;
            case 1: // 中分刘海
                this._rect(ctx, s, cx - 5, headY + 1, 4, 2, hairColor);
                this._rect(ctx, s, cx + 1, headY + 1, 4, 2, hairColor);
                this._pixel(ctx, s, cx, headY + 2, hairColor);
                break;
            case 2: // 长刘海
                this._rect(ctx, s, cx - 5, headY + 1, 10, 2, hairColor);
                this._rect(ctx, s, cx - 6, headY + 2, 2, 4, hairColor);
                this._rect(ctx, s, cx + 4, headY + 2, 2, 4, hairColor);
                break;
            case 3: // 双马尾刘海
                this._rect(ctx, s, cx - 5, headY + 1, 10, 2, hairColor);
                this._rect(ctx, s, cx - 6, headY + 2, 2, 3, hairColor);
                this._rect(ctx, s, cx + 4, headY + 2, 2, 3, hairColor);
                break;
            case 4: // 丸子头刘海
                this._rect(ctx, s, cx - 5, headY + 1, 10, 2, hairColor);
                this._rect(ctx, s, cx - 6, headY + 2, 2, 2, hairColor);
                this._rect(ctx, s, cx + 4, headY + 2, 2, 2, hairColor);
                break;
            case 5: // 高马尾刘海
                this._rect(ctx, s, cx - 5, headY + 1, 10, 2, hairColor);
                this._rect(ctx, s, cx - 6, headY + 2, 2, 3, hairColor);
                this._rect(ctx, s, cx + 4, headY + 2, 2, 3, hairColor);
                break;
            case 6: // 呆毛刘海
                this._rect(ctx, s, cx - 5, headY + 1, 10, 2, hairColor);
                this._rect(ctx, s, cx - 6, headY + 2, 2, 2, hairColor);
                this._rect(ctx, s, cx + 4, headY + 2, 2, 2, hairColor);
                break;
            case 7: // 侧分刘海
                this._rect(ctx, s, cx - 5, headY + 1, 10, 2, hairColor);
                this._rect(ctx, s, cx - 6, headY + 2, 2, 5, hairColor);
                this._rect(ctx, s, cx + 4, headY + 2, 2, 2, hairColor);
                break;
            case 8: // 蓬松刘海
                this._rect(ctx, s, cx - 6, headY + 1, 12, 2, hairColor);
                this._rect(ctx, s, cx - 7, headY + 2, 3, 3, hairColor);
                this._rect(ctx, s, cx + 4, headY + 2, 3, 3, hairColor);
                break;
            case 9: // 齐刘海
                this._rect(ctx, s, cx - 6, headY + 1, 12, 2, hairColor);
                this._rect(ctx, s, cx - 7, headY + 2, 2, 3, hairColor);
                this._rect(ctx, s, cx + 5, headY + 2, 2, 3, hairColor);
                break;
        }
    }

    // ====== 发饰 ======
    _drawHairAccessory(ctx, s, bw, bh, hairStyle, color) {
        const cx = Math.floor(bw / 2);
        const headY = 8;

        switch (hairStyle) {
            case 0: // 短发 - 小发夹
                this._pixel(ctx, s, cx - 4, headY, color);
                this._pixel(ctx, s, cx - 3, headY + 1, color);
                break;
            case 1: // 中长发 - 侧边花
                this._rect(ctx, s, cx + 4, headY + 1, 2, 2, color);
                this._pixel(ctx, s, cx + 5, headY, color);
                break;
            case 2: // 长发 - 发带
                this._rect(ctx, s, cx - 5, headY - 1, 10, 1, color);
                this._pixel(ctx, s, cx - 6, headY, color);
                this._pixel(ctx, s, cx + 5, headY, color);
                break;
            case 3: // 双马尾 - 蝴蝶结
                this._pixel(ctx, s, cx - 8, headY + 1, color);
                this._rect(ctx, s, cx - 9, headY + 2, 3, 1, color);
                this._pixel(ctx, s, cx + 7, headY + 1, color);
                this._rect(ctx, s, cx + 6, headY + 2, 3, 1, color);
                break;
            case 4: // 丸子头 - 珠子
                this._pixel(ctx, s, cx - 7, headY - 2, color);
                this._pixel(ctx, s, cx + 6, headY - 2, color);
                break;
            case 5: // 高马尾 - 发圈
                this._rect(ctx, s, cx - 2, headY - 3, 4, 1, color);
                break;
            case 6: // 呆毛 - 小星星
                this._pixel(ctx, s, cx + 3, headY - 4, color);
                break;
            case 7: // 侧分 - 发簪
                this._rect(ctx, s, cx + 3, headY - 2, 1, 4, color);
                this._pixel(ctx, s, cx + 3, headY - 3, color);
                break;
            case 8: // 蓬松 - 小皇冠
                this._rect(ctx, s, cx - 2, headY - 2, 4, 1, color);
                this._pixel(ctx, s, cx - 3, headY - 1, color);
                this._pixel(ctx, s, cx + 2, headY - 1, color);
                break;
            case 9: // 齐刘海 - 发卡
                this._rect(ctx, s, cx - 2, headY - 1, 4, 1, color);
                break;
        }
    }
}

// 全局立绘生成器实例
const portraitGen = new PortraitGenerator();
