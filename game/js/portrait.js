/* ====== 深宫帝王录 - Q版像素小人立绘系统 v2 ====== */
/* 参照参考图风格：黑色描边、大头小身、横线眼、层次头发、极小身体 */

// ====== 配色表 ======
const HAIR_COLORS = [
    '#1a1a1a', '#2d1b0e', '#4a2e1a', '#6b4423', '#8b5a2b',
    '#a06b35', '#c49a6c', '#d4b896', '#e8d4b8', '#f5e6d3',
    '#696969', '#808080', '#a9a9a9', '#c0c0c0', '#d3d3d3',
    '#8b0000', '#a52a2a', '#b22222', '#cd5c5c', '#dc143c',
    '#4b0082', '#6a0dad', '#8a2be2', '#9370db', '#ba55d3',
    '#191970', '#000080', '#4169e1', '#6495ed', '#87ceeb',
    '#006400', '#228b22', '#32cd32', '#90ee90', '#98fb98',
    '#ff69b4', '#ff1493', '#db7093', '#ffb6c1', '#ffc0cb',
    '#ff8c00', '#ffa500', '#ffd700', '#ffff00', '#f0e68c',
    '#8fbc8f', '#66cdaa', '#20b2aa', '#008b8b', '#5f9ea0'
];

const SKIN_COLORS = [
    '#fff5ee', '#fdf5e6', '#faf0e6', '#f5e6d3', '#f0e0c8',
    '#ebd8bc', '#e8d4b8', '#e0c8a8', '#d8bc9a', '#d4b896',
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

// ====== 伪随机数生成器 ======
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

function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h);
}

// ====== 像素画布 ======
class PixelCanvas {
    constructor(w, h) {
        this.w = w;
        this.h = h;
        this.pixels = [];
        for (let y = 0; y < h; y++) {
            this.pixels[y] = [];
            for (let x = 0; x < w; x++) {
                this.pixels[y][x] = null;
            }
        }
    }

    set(x, y, color) {
        if (x >= 0 && x < this.w && y >= 0 && y < this.h) {
            this.pixels[y][x] = color;
        }
    }

    get(x, y) {
        if (x >= 0 && x < this.w && y >= 0 && y < this.h) {
            return this.pixels[y][x];
        }
        return null;
    }

    // 填充圆形
    fillCircle(cx, cy, r, color) {
        for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
            for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
                const dx = x - cx;
                const dy = y - cy;
                if (dx * dx + dy * dy <= r * r + 0.5) {
                    this.set(x, y, color);
                }
            }
        }
    }

    // 填充椭圆
    fillEllipse(cx, cy, rx, ry, color) {
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
            for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
                const dx = (x - cx) / rx;
                const dy = (y - cy) / ry;
                if (dx * dx + dy * dy <= 1.1) {
                    this.set(x, y, color);
                }
            }
        }
    }

    // 填充矩形
    fillRect(x, y, w, h, color) {
        for (let yy = y; yy < y + h; yy++) {
            for (let xx = x; xx < x + w; xx++) {
                this.set(xx, yy, color);
            }
        }
    }

    // 绘制描边（只在没有颜色的位置绘制）
    outline(color) {
        const newPixels = [];
        for (let y = 0; y < this.h; y++) {
            newPixels[y] = [];
            for (let x = 0; x < this.w; x++) {
                newPixels[y][x] = this.pixels[y][x];
            }
        }

        for (let y = 0; y < this.h; y++) {
            for (let x = 0; x < this.w; x++) {
                if (this.pixels[y][x] !== null) continue;
                // 检查四周是否有像素
                const neighbors = [
                    [x-1,y], [x+1,y], [x,y-1], [x,y+1],
                    [x-1,y-1], [x+1,y-1], [x-1,y+1], [x+1,y+1]
                ];
                for (const [nx, ny] of neighbors) {
                    if (nx >= 0 && nx < this.w && ny >= 0 && ny < this.h) {
                        if (this.pixels[ny][nx] !== null) {
                            newPixels[y][x] = color;
                            break;
                        }
                    }
                }
            }
        }
        this.pixels = newPixels;
    }

    // 绘制到Canvas
    render(ctx, scale) {
        for (let y = 0; y < this.h; y++) {
            for (let x = 0; x < this.w; x++) {
                const c = this.pixels[y][x];
                if (c !== null) {
                    ctx.fillStyle = c;
                    ctx.fillRect(x * scale, y * scale, scale, scale);
                }
            }
        }
    }
}

// ====== 立绘组装器 ======
class PortraitGenerator {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.baseW = 30;
        this.baseH = 36;
        this.scale = 4;
    }

    createCanvas(container, width, height) {
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

    render(container, parts, width, height) {
        this.createCanvas(container, width, height);
        this.draw(parts);
    }

    async renderAsync(container, parts, width, height) {
        this.createCanvas(container, width, height);
        this.draw(parts);
    }

    draw(parts) {
        const rng = new SeededRandom(parts.seed);
        const pc = new PixelCanvas(this.baseW, this.baseH);
        const cx = Math.floor(this.baseW / 2);

        const hairColor = rng.pick(HAIR_COLORS);
        const hairLight = this._lighten(hairColor, 30);
        const skinColor = rng.pick(SKIN_COLORS);
        const costume = COSTUME_COLORS[parts.rank] || COSTUME_COLORS.noble;
        const hairStyle = rng.range(0, 12);
        const expression = rng.range(0, 3);
        const hasAccessory = rng.next() > 0.5;
        const accessoryColor = rng.pick(['#C9A84C', '#DC143C', '#4169E1', '#9370DB', '#FF69B4', '#32CD32']);

        // 绘制顺序（从后到前）
        this._drawBody(pc, cx, costume, parts.gender);
        this._drawHead(pc, cx, skinColor);
        this._drawBackHair(pc, cx, hairColor, hairLight, hairStyle, parts.gender);
        this._drawFace(pc, cx, skinColor, expression);
        this._drawFrontHair(pc, cx, hairColor, hairLight, hairStyle, parts.gender);
        if (hasAccessory) {
            this._drawAccessory(pc, cx, hairStyle, accessoryColor);
        }

        // 黑色描边
        pc.outline('#1a1a1a');

        // 渲染
        this.ctx.clearRect(0, 0, this.baseW * this.scale, this.baseH * this.scale);
        pc.render(this.ctx, this.scale);
    }

    // 颜色提亮
    _lighten(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.min(255, (num >> 16) + percent);
        const g = Math.min(255, ((num >> 8) & 0x00FF) + percent);
        const b = Math.min(255, (num & 0x0000FF) + percent);
        return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    }

    // ====== 身体（极小） ======
    _drawBody(pc, cx, costume, gender) {
        const by = 26;
        // 极小身体，只露出领口和一点点衣服
        if (gender === 'male') {
            pc.fillRect(cx - 3, by, 6, 2, costume.primary);
            pc.fillRect(cx - 4, by + 2, 8, 3, costume.primary);
            pc.fillRect(cx - 1, by, 2, 2, costume.secondary);
            pc.fillRect(cx - 3, by + 5, 6, 2, costume.primary);
            pc.fillRect(cx - 2, by + 7, 4, 2, costume.primary);
        } else {
            pc.fillRect(cx - 3, by, 6, 2, costume.primary);
            pc.fillRect(cx - 4, by + 2, 8, 3, costume.primary);
            pc.fillRect(cx - 1, by, 2, 2, costume.secondary);
            pc.fillRect(cx - 4, by + 5, 8, 2, costume.primary);
            pc.fillRect(cx - 3, by + 7, 6, 2, costume.primary);
        }
        // 小手
        pc.set(cx - 5, by + 3, '#f5e6d3');
        pc.set(cx + 4, by + 3, '#f5e6d3');
    }

    // ====== 头部 ======
    _drawHead(pc, cx, skinColor) {
        // 大圆头 16×14
        pc.fillEllipse(cx, 14, 8, 7, skinColor);
    }

    // ====== 后发 ======
    _drawBackHair(pc, cx, color, light, style, gender) {
        const hy = 10;
        switch (style) {
            case 0: // 齐耳短发
                pc.fillEllipse(cx, hy + 4, 9, 8, color);
                pc.fillRect(cx - 9, hy + 6, 3, 6, color);
                pc.fillRect(cx + 6, hy + 6, 3, 6, color);
                break;
            case 1: // 中长发
                pc.fillEllipse(cx, hy + 4, 9, 8, color);
                pc.fillRect(cx - 9, hy + 6, 3, 10, color);
                pc.fillRect(cx + 6, hy + 6, 3, 10, color);
                // 高光
                pc.set(cx - 6, hy + 3, light);
                pc.set(cx - 5, hy + 2, light);
                break;
            case 2: // 长直发
                pc.fillEllipse(cx, hy + 4, 9, 8, color);
                pc.fillRect(cx - 9, hy + 6, 3, 16, color);
                pc.fillRect(cx + 6, hy + 6, 3, 16, color);
                pc.fillRect(cx - 10, hy + 18, 4, 3, color);
                pc.fillRect(cx + 6, hy + 18, 4, 3, color);
                pc.set(cx - 7, hy + 3, light);
                pc.set(cx - 6, hy + 2, light);
                break;
            case 3: // 双马尾
                pc.fillEllipse(cx, hy + 4, 9, 8, color);
                pc.fillRect(cx - 10, hy + 4, 3, 10, color);
                pc.fillRect(cx - 11, hy + 12, 3, 4, color);
                pc.fillRect(cx + 7, hy + 4, 3, 10, color);
                pc.fillRect(cx + 8, hy + 12, 3, 4, color);
                pc.set(cx - 8, hy + 3, light);
                pc.set(cx + 8, hy + 3, light);
                break;
            case 4: // 丸子头
                pc.fillEllipse(cx, hy + 4, 9, 8, color);
                pc.fillCircle(cx - 7, hy, 3, color);
                pc.fillCircle(cx + 7, hy, 3, color);
                pc.set(cx - 8, hy - 1, light);
                pc.set(cx + 6, hy - 1, light);
                break;
            case 5: // 高马尾
                pc.fillEllipse(cx, hy + 4, 9, 8, color);
                pc.fillRect(cx - 2, hy - 6, 4, 5, color);
                pc.fillRect(cx - 1, hy - 10, 2, 6, color);
                pc.fillRect(cx - 2, hy - 12, 3, 3, color);
                pc.set(cx - 1, hy - 11, light);
                break;
            case 6: // 侧分长发
                pc.fillEllipse(cx, hy + 4, 9, 8, color);
                pc.fillRect(cx - 10, hy + 5, 4, 14, color);
                pc.fillRect(cx + 6, hy + 6, 3, 6, color);
                pc.fillRect(cx - 11, hy + 16, 4, 3, color);
                pc.set(cx - 8, hy + 3, light);
                break;
            case 7: // 蓬松卷发
                pc.fillEllipse(cx, hy + 4, 10, 9, color);
                pc.set(cx - 9, hy + 2, color);
                pc.set(cx + 8, hy + 2, color);
                pc.set(cx - 9, hy + 6, color);
                pc.set(cx + 8, hy + 6, color);
                pc.fillRect(cx - 9, hy + 8, 2, 6, color);
                pc.fillRect(cx + 7, hy + 8, 2, 6, color);
                pc.set(cx - 7, hy + 2, light);
                pc.set(cx + 6, hy + 2, light);
                break;
            case 8: // 蘑菇头
                pc.fillEllipse(cx, hy + 4, 10, 8, color);
                pc.fillRect(cx - 10, hy + 6, 3, 6, color);
                pc.fillRect(cx + 7, hy + 6, 3, 6, color);
                pc.set(cx - 7, hy + 3, light);
                pc.set(cx - 6, hy + 2, light);
                break;
            case 9: // 单马尾（侧）
                pc.fillEllipse(cx, hy + 4, 9, 8, color);
                pc.fillRect(cx + 5, hy + 4, 3, 12, color);
                pc.fillRect(cx + 6, hy + 14, 3, 4, color);
                pc.set(cx + 6, hy + 3, light);
                break;
            case 10: // 猫耳短发
                pc.fillEllipse(cx, hy + 4, 9, 8, color);
                pc.fillRect(cx - 9, hy + 6, 3, 6, color);
                pc.fillRect(cx + 6, hy + 6, 3, 6, color);
                // 猫耳
                pc.set(cx - 6, hy - 2, color);
                pc.set(cx - 7, hy - 3, color);
                pc.set(cx - 5, hy - 3, color);
                pc.set(cx + 5, hy - 2, color);
                pc.set(cx + 6, hy - 3, color);
                pc.set(cx + 4, hy - 3, color);
                break;
            case 11: // 帽子/兜帽
                pc.fillEllipse(cx, hy + 4, 9, 8, color);
                pc.fillRect(cx - 9, hy + 6, 3, 6, color);
                pc.fillRect(cx + 6, hy + 6, 3, 6, color);
                // 帽子顶部
                pc.fillRect(cx - 4, hy - 3, 8, 3, color);
                pc.fillRect(cx - 3, hy - 5, 6, 3, color);
                pc.set(cx - 2, hy - 6, color);
                pc.set(cx + 1, hy - 6, color);
                break;
            case 12: // 发带长发
                pc.fillEllipse(cx, hy + 4, 9, 8, color);
                pc.fillRect(cx - 9, hy + 6, 3, 12, color);
                pc.fillRect(cx + 6, hy + 6, 3, 12, color);
                pc.fillRect(cx - 10, hy + 15, 4, 3, color);
                pc.fillRect(cx + 6, hy + 15, 4, 3, color);
                // 发带
                pc.fillRect(cx - 8, hy + 2, 16, 1, '#DC143C');
                pc.set(cx - 9, hy + 3, '#DC143C');
                pc.set(cx + 8, hy + 3, '#DC143C');
                break;
        }
    }

    // ====== 五官 ======
    _drawFace(pc, cx, skinColor, expression) {
        const ey = 14;
        // 横线眼（参考图风格）
        pc.set(cx - 4, ey, '#1a1a1a');
        pc.set(cx - 3, ey, '#1a1a1a');
        pc.set(cx + 2, ey, '#1a1a1a');
        pc.set(cx + 3, ey, '#1a1a1a');

        // 嘴巴
        const my = 18;
        switch (expression) {
            case 0: // 微笑小弧线
                pc.set(cx - 1, my, '#c04040');
                pc.set(cx, my, '#c04040');
                pc.set(cx + 1, my, '#c04040');
                pc.set(cx - 1, my + 1, '#c04040');
                pc.set(cx + 1, my + 1, '#c04040');
                break;
            case 1: // 小嘴横线
                pc.set(cx - 1, my, '#c04040');
                pc.set(cx, my, '#c04040');
                pc.set(cx + 1, my, '#c04040');
                break;
            case 2: // 开心大笑
                pc.set(cx - 2, my, '#c04040');
                pc.set(cx - 1, my, '#c04040');
                pc.set(cx, my, '#c04040');
                pc.set(cx + 1, my, '#c04040');
                pc.set(cx + 2, my, '#c04040');
                pc.set(cx - 1, my + 1, '#ffffff');
                pc.set(cx, my + 1, '#ffffff');
                pc.set(cx + 1, my + 1, '#ffffff');
                break;
        }

        // 小腮红
        pc.set(cx - 6, ey + 2, '#ffb6c1');
        pc.set(cx - 5, ey + 2, '#ffb6c1');
        pc.set(cx + 4, ey + 2, '#ffb6c1');
        pc.set(cx + 5, ey + 2, '#ffb6c1');
    }

    // ====== 前发/刘海 ======
    _drawFrontHair(pc, cx, color, light, style, gender) {
        const hy = 10;
        switch (style) {
            case 0: // 齐刘海
                pc.fillRect(cx - 6, hy + 3, 12, 2, color);
                pc.set(cx - 7, hy + 4, color);
                pc.set(cx + 6, hy + 4, color);
                pc.set(cx - 5, hy + 2, light);
                pc.set(cx - 4, hy + 2, light);
                break;
            case 1: // 中分
                pc.fillRect(cx - 6, hy + 3, 5, 2, color);
                pc.fillRect(cx + 1, hy + 3, 5, 2, color);
                pc.set(cx, hy + 4, color);
                pc.set(cx - 5, hy + 2, light);
                pc.set(cx + 3, hy + 2, light);
                break;
            case 2: // 长刘海
                pc.fillRect(cx - 6, hy + 3, 12, 2, color);
                pc.fillRect(cx - 7, hy + 4, 2, 4, color);
                pc.fillRect(cx + 5, hy + 4, 2, 4, color);
                pc.set(cx - 5, hy + 2, light);
                break;
            case 3: // 双马尾刘海
                pc.fillRect(cx - 6, hy + 3, 12, 2, color);
                pc.fillRect(cx - 7, hy + 4, 2, 3, color);
                pc.fillRect(cx + 5, hy + 4, 2, 3, color);
                pc.set(cx - 5, hy + 2, light);
                break;
            case 4: // 丸子头刘海
                pc.fillRect(cx - 6, hy + 3, 12, 2, color);
                pc.fillRect(cx - 7, hy + 4, 2, 2, color);
                pc.fillRect(cx + 5, hy + 4, 2, 2, color);
                pc.set(cx - 4, hy + 2, light);
                break;
            case 5: // 高马尾刘海
                pc.fillRect(cx - 6, hy + 3, 12, 2, color);
                pc.fillRect(cx - 7, hy + 4, 2, 3, color);
                pc.fillRect(cx + 5, hy + 4, 2, 3, color);
                pc.set(cx - 5, hy + 2, light);
                break;
            case 6: // 侧分刘海
                pc.fillRect(cx - 6, hy + 3, 12, 2, color);
                pc.fillRect(cx - 7, hy + 4, 2, 5, color);
                pc.fillRect(cx + 5, hy + 4, 2, 2, color);
                pc.set(cx - 5, hy + 2, light);
                break;
            case 7: // 蓬松刘海
                pc.fillRect(cx - 7, hy + 3, 14, 2, color);
                pc.fillRect(cx - 8, hy + 4, 3, 3, color);
                pc.fillRect(cx + 5, hy + 4, 3, 3, color);
                pc.set(cx - 6, hy + 2, light);
                pc.set(cx + 4, hy + 2, light);
                break;
            case 8: // 蘑菇头刘海
                pc.fillRect(cx - 7, hy + 3, 14, 2, color);
                pc.fillRect(cx - 8, hy + 4, 2, 3, color);
                pc.fillRect(cx + 6, hy + 4, 2, 3, color);
                pc.set(cx - 5, hy + 2, light);
                pc.set(cx - 4, hy + 2, light);
                break;
            case 9: // 单马尾刘海
                pc.fillRect(cx - 6, hy + 3, 12, 2, color);
                pc.fillRect(cx - 7, hy + 4, 2, 3, color);
                pc.fillRect(cx + 5, hy + 4, 2, 3, color);
                pc.set(cx - 4, hy + 2, light);
                break;
            case 10: // 猫耳刘海
                pc.fillRect(cx - 6, hy + 3, 12, 2, color);
                pc.fillRect(cx - 7, hy + 4, 2, 3, color);
                pc.fillRect(cx + 5, hy + 4, 2, 3, color);
                pc.set(cx - 4, hy + 2, light);
                break;
            case 11: // 帽子刘海
                pc.fillRect(cx - 5, hy + 3, 10, 2, color);
                pc.set(cx - 6, hy + 4, color);
                pc.set(cx + 5, hy + 4, color);
                break;
            case 12: // 发带刘海
                pc.fillRect(cx - 6, hy + 3, 12, 2, color);
                pc.fillRect(cx - 7, hy + 4, 2, 3, color);
                pc.fillRect(cx + 5, hy + 4, 2, 3, color);
                pc.set(cx - 4, hy + 2, light);
                break;
        }
    }

    // ====== 发饰 ======
    _drawAccessory(pc, cx, style, color) {
        const hy = 10;
        switch (style) {
            case 0: // 小发夹
                pc.set(cx - 5, hy + 1, color);
                pc.set(cx - 4, hy + 2, color);
                break;
            case 1: // 侧边花
                pc.set(cx + 5, hy + 2, color);
                pc.set(cx + 6, hy + 1, color);
                pc.set(cx + 6, hy + 3, color);
                break;
            case 2: // 发带蝴蝶结
                pc.set(cx - 7, hy + 1, color);
                pc.set(cx - 8, hy + 2, color);
                pc.set(cx - 6, hy + 2, color);
                pc.set(cx + 6, hy + 1, color);
                pc.set(cx + 7, hy + 2, color);
                pc.set(cx + 5, hy + 2, color);
                break;
            case 3: // 蝴蝶结
                pc.set(cx - 8, hy + 2, color);
                pc.set(cx - 9, hy + 3, color);
                pc.set(cx - 7, hy + 3, color);
                pc.set(cx + 7, hy + 2, color);
                pc.set(cx + 8, hy + 3, color);
                pc.set(cx + 6, hy + 3, color);
                break;
            case 4: // 珠子
                pc.set(cx - 8, hy - 1, color);
                pc.set(cx + 7, hy - 1, color);
                break;
            case 5: // 发圈
                pc.fillRect(cx - 2, hy - 4, 4, 1, color);
                break;
            case 6: // 发簪
                pc.set(cx + 4, hy - 1, color);
                pc.set(cx + 4, hy - 2, color);
                pc.set(cx + 4, hy - 3, color);
                break;
            case 7: // 小皇冠
                pc.set(cx - 3, hy - 1, color);
                pc.set(cx - 1, hy - 2, color);
                pc.set(cx + 1, hy - 2, color);
                pc.set(cx + 3, hy - 1, color);
                break;
            case 8: // 发卡
                pc.set(cx - 3, hy + 1, color);
                pc.set(cx - 2, hy + 1, color);
                pc.set(cx - 1, hy + 1, color);
                break;
            case 9: // 花
                pc.set(cx + 5, hy + 2, color);
                pc.set(cx + 6, hy + 1, color);
                pc.set(cx + 6, hy + 3, color);
                pc.set(cx + 7, hy + 2, color);
                break;
            case 10: // 铃铛
                pc.set(cx - 5, hy + 1, color);
                break;
            case 11: // 帽子装饰
                pc.set(cx, hy - 4, color);
                break;
            case 12: // 流苏
                pc.set(cx - 8, hy + 4, color);
                pc.set(cx - 8, hy + 5, color);
                pc.set(cx + 7, hy + 4, color);
                pc.set(cx + 7, hy + 5, color);
                break;
        }
    }
}

// 全局立绘生成器实例
const portraitGen = new PortraitGenerator();
