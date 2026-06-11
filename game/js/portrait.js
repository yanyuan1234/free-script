/* ====== 深宫帝王录 - 像素风立绘组装系统 v5 ====== */
/* 100%本地程序化像素角色生成器，无需API，无需素材下载 */

// ====== 调色板 ======
const PALETTES = {
    skin: [
        [0xF5E6D3, 0xE0CDB8, 0xC8A880, 0xF0B8A8], // 白皙
        [0xECDCC8, 0xD8C4AA, 0xB09068, 0xE8A898], // 浅肤
        [0xE0C8A8, 0xC8B090, 0xA08060, 0xD8A088], // 暖肤
        [0xC8A880, 0xB09068, 0x8A6840, 0xC08868], // 小麦
        [0xF0E0E8, 0xDCC8D0, 0xB8A0B0, 0xF0A8B8] // 苍白
    ],
    hair: [
        [0x0D0D12, 0x1A1A24, 0x2A2A3A], // 黑
        [0x2A1508, 0x3D2010, 0x5A3520], // 棕
        [0x1A0E05, 0x2A1A0D, 0x3D2A18], // 深棕
        [0x2A0E0E, 0x3D1818, 0x5A2828], // 赤褐
        [0x08081A, 0x14142A, 0x22223D], // 蓝黑
        [0x3A1A1A, 0x5A2A2A, 0x7A3A3A], // 红棕
        [0xC8C8D0, 0xD8D8E0, 0xEAEAF0], // 白银
        [0x8A3A1A, 0xAA5A2A, 0xCA7A4A], // 橙
    ],
    eyes: [
        [0x0D0D12, 0x000000], // 黑
        [0x3D2010, 0x1A0E05], // 棕
        [0x8A5A20, 0x3D2010], // 琥珀
        [0x1A5A2A, 0x0A2A12], // 绿
        [0x1A3A6A, 0x0A1A3A], // 蓝
        [0x4A2A5A, 0x2A1A3A], // 紫
        [0x6A1A1A, 0x3A0A0A], // 红
        [0x9A7A20, 0x5A4A10], // 金
    ],
    costume: {
        empress:    [0xC9A84C, 0x8B2020, 0xE8D48B, 0x6B1A1A],
        consort:    [0x8B2020, 0xC9A84C, 0xC44040, 0x5A1010],
        concubine:  [0x2A5A8A, 0xC9A84C, 0x4A8AB8, 0x1A3A5A],
        noble:      [0x3A6A5A, 0x8A6A3A, 0x5AAA8A, 0x1A4A3A],
        beauty:     [0x5A5A7A, 0x8A8A9A, 0x7A7AAA, 0x3A3A5A],
        commoner:   [0x6A6A6A, 0x8A8A8A, 0x9A9A9A, 0x4A4A4A],
        promise:    [0x5A5050, 0x7A7070, 0x908888, 0x3A3030],
        cold:       [0x4A4A4A, 0x6A6A6A, 0x808080, 0x2A2A2A],
        prince:     [0x2A4A8A, 0xC9A84C, 0x4A7ABA, 0x1A2A5A],
        princess:   [0x8A3A5A, 0xC9A84C, 0xAA5A7A, 0x5A1A3A],
        official:   [0x2A4A2A, 0x8A6A3A, 0x4A7A4A, 0x1A2A1A],
        servant:    [0x7A6A5A, 0x5A4A3A, 0x9A8A7A, 0x4A3A2A],
        romance:    [0x6A3A5A, 0xC9A84C, 0x8A5A7A, 0x3A1A3A]
    }
};

// ====== 像素绘制工具 ======
function hexToRgb(hex) {
    return [(hex >> 16) & 0xFF, (hex >> 8) & 0xFF, hex & 0xFF];
}

function rgbToHex(r, g, b) {
    return (r << 16) | (g << 8) | b;
}

// ====== 像素角色生成器 ======
class PortraitGenerator {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.width = 120;
        this.height = 160;
        this.pixelSize = 4; // 每个逻辑像素的实际大小
        this.gridW = 30;    // 逻辑像素宽度
        this.gridH = 40;    // 逻辑像素高度
    }

    createCanvas(container, width, height) {
        this.width = width || 120;
        this.height = height || 160;
        this.pixelSize = Math.max(1, Math.floor(Math.min(this.width / 30, this.height / 40)));
        this.gridW = Math.floor(this.width / this.pixelSize);
        this.gridH = Math.floor(this.height / this.pixelSize);

        const canvas = document.createElement('canvas');
        canvas.width = this.width * 2;
        canvas.height = this.height * 2;
        canvas.style.width = this.width + 'px';
        canvas.style.height = this.height + 'px';
        canvas.style.imageRendering = 'pixelated';
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.ctx.scale(2, 2);
        this.ctx.imageSmoothingEnabled = false;
        container.innerHTML = '';
        container.appendChild(canvas);
        return canvas;
    }

    // 绘制单个像素
    px(x, y, color) {
        if (x < 0 || y < 0 || x >= this.gridW || y >= this.gridH) return;
        const [r, g, b] = hexToRgb(color);
        this.ctx.fillStyle = `rgb(${r},${g},${b})`;
        this.ctx.fillRect(x * this.pixelSize, y * this.pixelSize, this.pixelSize, this.pixelSize);
    }

    // 绘制矩形
    pxRect(x, y, w, h, color) {
        const [r, g, b] = hexToRgb(color);
        this.ctx.fillStyle = `rgb(${r},${g},${b})`;
        this.ctx.fillRect(x * this.pixelSize, y * this.pixelSize, w * this.pixelSize, h * this.pixelSize);
    }

    // 随机生成一套部件
    randomParts(gender, rank) {
        const skinIdx = Math.floor(Math.random() * PALETTES.skin.length);
        const hairIdx = Math.floor(Math.random() * PALETTES.hair.length);
        const eyeIdx = Math.floor(Math.random() * PALETTES.eyes.length);
        const hairStyle = Math.floor(Math.random() * 6);  // 0-5
        const eyeStyle = Math.floor(Math.random() * 4);   // 0-3
        const mouthStyle = Math.floor(Math.random() * 4);  // 0-3
        const decoStyle = Math.floor(Math.random() * 5);   // 0-4

        return {
            gender: gender,
            rank: rank || 'noble',
            skinIdx: skinIdx,
            hairIdx: hairIdx,
            eyeIdx: eyeIdx,
            hairStyle: hairStyle,
            eyeStyle: eyeStyle,
            mouthStyle: mouthStyle,
            decoStyle: decoStyle,
            // 保留兼容字段
            hairColor: { base: PALETTES.hair[hairIdx][0], light: PALETTES.hair[hairIdx][1], highlight: PALETTES.hair[hairIdx][2] },
            eyeColor: { iris: PALETTES.eyes[eyeIdx][0], pupil: PALETTES.eyes[eyeIdx][1] },
            skinTone: { base: PALETTES.skin[skinIdx][0], shadow: PALETTES.skin[skinIdx][1] }
        };
    }

    // ====== 主绘制 ======
    draw(parts) {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        const skin = PALETTES.skin[parts.skinIdx];
        const hair = PALETTES.hair[parts.hairIdx];
        const eyes = PALETTES.eyes[parts.eyeIdx];
        const costume = PALETTES.costume[parts.rank] || PALETTES.costume.noble;

        // 背景
        this.pxRect(0, 0, this.gridW, this.gridH, 0x1A0A0A);

        // 绘制顺序：后发 → 身体 → 服装 → 脸 → 前发 → 五官 → 装饰
        this._drawHairBack(hair, parts.hairStyle, parts.gender);
        this._drawBody(skin, costume, parts.gender);
        this._drawCostume(costume, parts.gender);
        this._drawFace(skin);
        this._drawHairFront(hair, parts.hairStyle, parts.gender);
        this._drawEyes(eyes, parts.eyeStyle);
        this._drawEyebrows(hair, parts.eyeStyle);
        this._drawNose(skin);
        this._drawMouth(parts.mouthStyle);
        this._drawDeco(parts.decoStyle, costume);
    }

    // ====== 后发 ======
    _drawHairBack(hair, style, gender) {
        const c1 = hair[0], c2 = hair[1];
        // 后发基础（长发覆盖到身体）
        if (style <= 1) {
            // 长发
            this.pxRect(9, 3, 12, 2, c2);
            this.pxRect(8, 5, 14, 2, c2);
            this.pxRect(7, 7, 16, 25, c1);
            this.pxRect(8, 32, 14, 5, c1);
            this.pxRect(9, 37, 12, 2, c2);
        } else if (style === 2) {
            // 中长发
            this.pxRect(9, 3, 12, 2, c2);
            this.pxRect(8, 5, 14, 2, c2);
            this.pxRect(7, 7, 16, 18, c1);
            this.pxRect(8, 25, 14, 3, c2);
        } else if (style === 3) {
            // 短发
            this.pxRect(9, 3, 12, 2, c2);
            this.pxRect(8, 5, 14, 2, c2);
            this.pxRect(7, 7, 16, 8, c1);
        } else if (style === 4) {
            // 双髻
            this.pxRect(9, 3, 12, 2, c2);
            this.pxRect(8, 5, 14, 2, c2);
            this.pxRect(7, 7, 16, 8, c1);
            // 左髻
            this.pxRect(5, 2, 4, 4, c1);
            this.pxRect(4, 3, 2, 2, c2);
            // 右髻
            this.pxRect(21, 2, 4, 4, c1);
            this.pxRect(24, 3, 2, 2, c2);
        } else {
            // 高髻
            this.pxRect(9, 3, 12, 2, c2);
            this.pxRect(8, 5, 14, 2, c2);
            this.pxRect(7, 7, 16, 8, c1);
            // 髻
            this.pxRect(12, 0, 6, 4, c1);
            this.pxRect(13, 0, 4, 2, c2);
        }
    }

    // ====== 身体 ======
    _drawBody(skin, costume, gender) {
        const s1 = skin[0], s2 = skin[1];
        // 脖子
        this.pxRect(13, 16, 4, 2, s2);
        // 肩膀
        this.pxRect(8, 18, 14, 2, s1);
        // 身体
        this.pxRect(7, 20, 16, 18, s1);
        this.pxRect(6, 38, 18, 2, s1);
    }

    // ====== 服装 ======
    _drawCostume(costume, gender) {
        const c1 = costume[0], c2 = costume[1], c3 = costume[2], c4 = costume[3];
        // 服装主体
        this.pxRect(8, 18, 12, 2, c1);
        this.pxRect(7, 20, 14, 16, c1);
        this.pxRect(6, 36, 16, 4, c1);
        // 交领
        this.pxRect(12, 18, 6, 6, c2);
        this.pxRect(13, 18, 4, 5, c3);
        // 领口V字
        this.px(13, 18, c3); this.px(14, 18, c3);
        this.px(14, 19, c3); this.px(14, 20, c3);
        // 腰带
        this.pxRect(7, 26, 14, 1, c3);
        // 腰带装饰
        this.px(13, 26, c2); this.px(14, 26, c2);
        // 服装纹饰
        this.px(10, 22, c3); this.px(17, 22, c3);
        this.px(10, 24, c3); this.px(17, 24, c3);
        // 下摆纹饰
        this.pxRect(7, 34, 14, 1, c4);
        // 袖口
        this.px(7, 20, c3); this.px(20, 20, c3);
        this.px(7, 21, c3); this.px(20, 21, c3);
    }

    // ====== 脸部 ======
    _drawFace(skin) {
        const s1 = skin[0], s2 = skin[1], s3 = skin[2], blush = skin[3];
        // 脸部轮廓
        this.pxRect(10, 5, 10, 2, s1);   // 额头
        this.pxRect(9, 7, 12, 2, s1);    // 上脸
        this.pxRect(8, 9, 14, 4, s1);    // 中脸
        this.pxRect(9, 13, 12, 2, s1);   // 下脸
        this.pxRect(10, 15, 10, 1, s1);  // 下巴

        // 脸部阴影
        this.px(9, 7, s2); this.px(20, 7, s2);
        this.px(8, 9, s2); this.px(21, 9, s2);
        this.px(8, 12, s2); this.px(21, 12, s2);
        this.px(9, 14, s2); this.px(20, 14, s2);
        this.px(10, 15, s2);

        // 耳朵
        this.px(8, 9, s1); this.px(8, 10, s1);
        this.px(21, 9, s1); this.px(21, 10, s1);

        // 腮红
        this.px(10, 12, blush); this.px(19, 12, blush);
    }

    // ====== 前发 ======
    _drawHairFront(hair, style, gender) {
        const c1 = hair[0], c2 = hair[1], c3 = hair[2];
        // 头顶
        this.pxRect(10, 3, 10, 3, c1);
        this.pxRect(9, 4, 12, 2, c1);

        if (style === 0) {
            // 齐刘海
            this.pxRect(9, 6, 12, 3, c1);
            this.px(9, 7, c2); this.px(12, 7, c2); this.px(15, 7, c2); this.px(18, 7, c2); this.px(20, 7, c2);
            // 刘海底部锯齿
            this.px(10, 8, c2); this.px(13, 8, c2); this.px(16, 8, c2); this.px(19, 8, c2);
        } else if (style === 1) {
            // 斜刘海
            this.pxRect(9, 6, 12, 2, c1);
            this.pxRect(9, 7, 6, 2, c1);
            this.px(9, 8, c2); this.px(11, 8, c2); this.px(13, 8, c2);
            // 侧发
            this.pxRect(8, 8, 2, 8, c1);
            this.px(8, 9, c2); this.px(8, 11, c2);
        } else if (style === 2) {
            // 中分
            this.pxRect(9, 6, 12, 2, c1);
            this.px(14, 6, c2); this.px(15, 6, c2);
            this.px(14, 7, c2); this.px(15, 7, c2);
            // 两侧垂发
            this.pxRect(8, 8, 2, 10, c1);
            this.pxRect(20, 8, 2, 10, c1);
            this.px(8, 10, c2); this.px(20, 10, c2);
        } else if (style === 3) {
            // 短发
            this.pxRect(9, 6, 12, 2, c1);
            this.px(9, 7, c2); this.px(12, 7, c2); this.px(17, 7, c2); this.px(20, 7, c2);
        } else if (style === 4) {
            // 双马尾/双髻
            this.pxRect(9, 6, 12, 2, c1);
            this.px(9, 7, c2); this.px(14, 7, c2); this.px(20, 7, c2);
            // 侧发
            this.pxRect(8, 8, 2, 6, c1);
            this.pxRect(20, 8, 2, 6, c1);
        } else {
            // 偏分
            this.pxRect(9, 6, 12, 2, c1);
            this.pxRect(9, 7, 8, 2, c1);
            this.px(9, 8, c2); this.px(12, 8, c2); this.px(15, 8, c2);
            // 一侧长发
            this.pxRect(8, 8, 2, 12, c1);
            this.px(8, 10, c2); this.px(8, 13, c2);
        }

        // 高光
        this.px(11, 4, c3); this.px(12, 4, c3);
    }

    // ====== 眉毛 ======
    _drawEyebrows(hair, eyeStyle) {
        const c = hair[1];
        this.px(11, 8, c); this.px(12, 8, c);
        this.px(17, 8, c); this.px(18, 8, c);
    }

    // ====== 眼睛 ======
    _drawEyes(eyes, style) {
        const iris = eyes[0], pupil = eyes[1];
        const white = 0xFFFFFF;

        if (style === 0) {
            // 大眼（杏眼）
            this.px(11, 10, white); this.px(12, 10, iris);
            this.px(17, 10, iris); this.px(18, 10, white);
            this.px(12, 10, pupil); this.px(17, 10, pupil);
            // 高光
            this.px(11, 10, white);
            this.px(17, 10, white);
        } else if (style === 1) {
            // 凤眼
            this.px(11, 10, iris); this.px(12, 10, white);
            this.px(17, 10, white); this.px(18, 10, iris);
            this.px(11, 10, pupil);
            this.px(18, 10, pupil);
        } else if (style === 2) {
            // 圆眼
            this.pxRect(11, 9, 2, 2, white);
            this.pxRect(17, 9, 2, 2, white);
            this.px(12, 10, iris); this.px(17, 10, iris);
            this.px(12, 10, pupil); this.px(17, 10, pupil);
            this.px(11, 9, white); this.px(17, 9, white);
        } else {
            // 细眼
            this.px(11, 10, iris); this.px(12, 10, white);
            this.px(17, 10, white); this.px(18, 10, iris);
        }

        // 眼线
        this.px(10, 10, 0x1A0A0A); this.px(13, 10, 0x1A0A0A);
        this.px(16, 10, 0x1A0A0A); this.px(19, 10, 0x1A0A0A);
    }

    // ====== 鼻子 ======
    _drawNose(skin) {
        this.px(14, 11, skin[1]);
    }

    // ====== 嘴巴 ======
    _drawMouth(style) {
        const lip = 0xA04040;
        if (style === 0) {
            // 微笑
            this.px(13, 13, lip); this.px(14, 13, lip); this.px(15, 13, lip); this.px(16, 13, lip);
        } else if (style === 1) {
            // 抿嘴
            this.px(14, 13, lip); this.px(15, 13, lip);
        } else if (style === 2) {
            // 小嘴
            this.px(14, 13, lip);
        } else {
            // 张嘴
            this.px(13, 13, 0x6A2828); this.px(14, 13, 0x6A2828); this.px(15, 13, 0x6A2828);
            this.px(13, 12, lip); this.px(15, 12, lip);
        }
    }

    // ====== 装饰 ======
    _drawDeco(style, costume) {
        const gold = 0xC9A84C, goldL = 0xE8D48B, red = 0xC44040;
        if (style === 0) {
            // 发簪
            this.px(19, 4, gold); this.px(20, 3, gold); this.px(21, 2, gold);
            this.px(21, 1, red); this.px(21, 2, goldL);
        } else if (style === 1) {
            // 花钿
            this.px(14, 8, red);
            this.px(14, 7, goldL);
        } else if (style === 2) {
            // 耳坠
            this.px(8, 11, gold); this.px(21, 11, gold);
            this.px(8, 12, 0x40A0C0); this.px(21, 12, 0x40A0C0);
        } else if (style === 3) {
            // 步摇
            this.px(20, 4, gold);
            this.px(20, 5, goldL); this.px(21, 6, goldL); this.px(21, 7, goldL);
        }
        // style 4 = 无装饰
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
