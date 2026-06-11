/* ====== 深宫帝王录 - 立绘组装系统 ====== */

// 立绘部件定义（占位符，后续替换为立ち絵さん等素材）
const PORTRAIT_PARTS = {
    // 后发
    hairBack: [
        { id: 'hb1', name: '长发', color: '#1a1a1a' },
        { id: 'hb2', name: '短发', color: '#2a1a0a' },
        { id: 'hb3', name: '盘发', color: '#0a0a1a' },
        { id: 'hb4', name: '双髻', color: '#1a0a0a' }
    ],
    // 身体
    body: [
        { id: 'bd1', name: '标准', gender: 'both' },
        { id: 'bd2', name: '纤细', gender: 'female' },
        { id: 'bd3', name: '壮硕', gender: 'male' }
    ],
    // 服装
    costume: [
        { id: 'cs1', name: '龙袍', color: '#c9a84c', rank: 'empress' },
        { id: 'cs2', name: '宫装', color: '#8b2020', rank: 'consort' },
        { id: 'cs3', name: '常服', color: '#2a5a6a', rank: 'concubine' },
        { id: 'cs4', name: '素衣', color: '#6a6a7a', rank: 'noble' },
        { id: 'cs5', name: '布衣', color: '#5a5a5a', rank: 'commoner' },
        { id: 'cs6', name: '囚衣', color: '#8a8a8a', rank: 'cold' },
        { id: 'cs7', name: '皇子服', color: '#3a5a8a', rank: 'prince' },
        { id: 'cs8', name: '公主服', color: '#8a3a5a', rank: 'princess' },
        { id: 'cs9', name: '官服', color: '#2a4a2a', rank: 'official' },
        { id: 'cs10', name: '侍女服', color: '#7a6a5a', rank: 'servant' }
    ],
    // 前发
    hairFront: [
        { id: 'hf1', name: '刘海', color: '#1a1a1a' },
        { id: 'hf2', name: '中分', color: '#2a1a0a' },
        { id: 'hf3', name: '偏分', color: '#0a0a1a' },
        { id: 'hf4', name: '无刘海', color: '#1a0a0a' }
    ],
    // 眉毛
    eyebrows: [
        { id: 'eb1', name: '平眉', color: '#2a1a0a' },
        { id: 'eb2', name: '柳眉', color: '#2a1a0a' },
        { id: 'eb3', name: '剑眉', color: '#1a1a1a' },
        { id: 'eb4', name: '弯眉', color: '#2a1a0a' }
    ],
    // 眼睛
    eyes: [
        { id: 'ey1', name: '杏眼', color: '#1a0a0a' },
        { id: 'ey2', name: '丹凤眼', color: '#0a0a1a' },
        { id: 'ey3', name: '桃花眼', color: '#1a0a0a' },
        { id: 'ey4', name: '凤眼', color: '#0a1a0a' }
    ],
    // 嘴巴
    mouth: [
        { id: 'mt1', name: '微笑' },
        { id: 'mt2', name: '抿嘴' },
        { id: 'mt3', name: '微张' },
        { id: 'mt4', name: '冷笑' }
    ],
    // 装饰
    deco: [
        { id: 'dc0', name: '无' },
        { id: 'dc1', name: '发簪', color: '#c9a84c' },
        { id: 'dc2', name: '步摇', color: '#c9a84c' },
        { id: 'dc3', name: '花钿', color: '#c44040' }
    ]
};

// 瞳色池
const EYE_COLORS = ['#1a0a0a', '#0a0a2a', '#2a1a0a', '#1a2a1a', '#3a1a2a'];
// 发色池
const HAIR_COLORS = ['#0a0a0a', '#1a0a0a', '#2a1a0a', '#0a0a1a', '#1a1a2a'];

// 立绘组装器
class PortraitGenerator {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.width = 120;
        this.height = 160;
    }

    // 创建画布
    createCanvas(container, width, height) {
        this.width = width || 120;
        this.height = height || 160;
        const canvas = document.createElement('canvas');
        canvas.width = this.width * 2; // 2x 高清
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

    // 随机生成一套立绘部件
    randomParts(gender, rank) {
        const hairColor = HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)];
        const eyeColor = EYE_COLORS[Math.floor(Math.random() * EYE_COLORS.length)];

        // 根据品阶选服装
        let costume;
        if (rank) {
            costume = PORTRAIT_PARTS.costume.find(c => c.rank === rank) ||
                      PORTRAIT_PARTS.costume[Math.floor(Math.random() * PORTRAIT_PARTS.costume.length)];
        } else {
            costume = PORTRAIT_PARTS.costume[Math.floor(Math.random() * PORTRAIT_PARTS.costume.length)];
        }

        // 根据性别选身体
        const bodyPool = PORTRAIT_PARTS.body.filter(b => b.gender === 'both' || b.gender === gender);
        const body = bodyPool[Math.floor(Math.random() * bodyPool.length)];

        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

        return {
            hairBack: { ...pick(PORTRAIT_PARTS.hairBack), color: hairColor },
            body: body,
            costume: costume,
            hairFront: { ...pick(PORTRAIT_PARTS.hairFront), color: hairColor },
            eyebrows: { ...pick(PORTRAIT_PARTS.eyebrows) },
            eyes: { ...pick(PORTRAIT_PARTS.eyes), color: eyeColor },
            mouth: pick(PORTRAIT_PARTS.mouth),
            deco: pick(PORTRAIT_PARTS.deco),
            skinTone: `hsl(30, ${20 + Math.random() * 20}%, ${70 + Math.random() * 15}%)`
        };
    }

    // 绘制立绘（占位符风格 - 简笔画风）
    draw(parts) {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        ctx.clearRect(0, 0, w, h);

        // 背景
        ctx.fillStyle = 'rgba(42, 21, 21, 0.3)';
        ctx.fillRect(0, 0, w, h);

        const cx = w / 2; // 中心x
        const headY = h * 0.22; // 头部中心y
        const headR = w * 0.18; // 头部半径

        // 1. 后发
        ctx.fillStyle = parts.hairBack.color;
        ctx.beginPath();
        if (parts.hairBack.id === 'hb1') {
            // 长发
            ctx.ellipse(cx, headY + headR * 0.5, headR * 1.3, headR * 2.5, 0, 0, Math.PI * 2);
        } else if (parts.hairBack.id === 'hb2') {
            // 短发
            ctx.ellipse(cx, headY + headR * 0.3, headR * 1.2, headR * 1.2, 0, 0, Math.PI * 2);
        } else if (parts.hairBack.id === 'hb3') {
            // 盘发
            ctx.ellipse(cx, headY - headR * 0.5, headR * 1.1, headR * 0.8, 0, 0, Math.PI * 2);
        } else {
            // 双髻
            ctx.ellipse(cx - headR * 0.7, headY - headR * 0.3, headR * 0.6, headR * 0.7, 0, 0, Math.PI * 2);
            ctx.ellipse(cx + headR * 0.7, headY - headR * 0.3, headR * 0.6, headR * 0.7, 0, 0, Math.PI * 2);
        }
        ctx.fill();

        // 2. 身体
        ctx.fillStyle = parts.skinTone;
        // 脖子
        ctx.fillRect(cx - headR * 0.3, headY + headR * 0.8, headR * 0.6, headR * 0.5);
        // 身体
        ctx.beginPath();
        ctx.moveTo(cx - headR * 1.2, headY + headR * 1.3);
        ctx.lineTo(cx + headR * 1.2, headY + headR * 1.3);
        ctx.lineTo(cx + headR * 1.8, h * 0.95);
        ctx.lineTo(cx - headR * 1.8, h * 0.95);
        ctx.closePath();
        ctx.fill();

        // 3. 服装
        ctx.fillStyle = parts.costume.color;
        ctx.beginPath();
        ctx.moveTo(cx - headR * 1.1, headY + headR * 1.2);
        ctx.lineTo(cx + headR * 1.1, headY + headR * 1.2);
        ctx.lineTo(cx + headR * 1.7, h * 0.95);
        ctx.lineTo(cx - headR * 1.7, h * 0.95);
        ctx.closePath();
        ctx.fill();
        // 服装纹饰线
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(cx, headY + headR * 1.2);
        ctx.lineTo(cx, h * 0.9);
        ctx.stroke();

        // 4. 脸部
        ctx.fillStyle = parts.skinTone;
        ctx.beginPath();
        ctx.ellipse(cx, headY, headR, headR * 1.1, 0, 0, Math.PI * 2);
        ctx.fill();

        // 5. 前发
        ctx.fillStyle = parts.hairFront.color;
        ctx.beginPath();
        if (parts.hairFront.id === 'hf1') {
            // 刘海
            ctx.ellipse(cx, headY - headR * 0.4, headR * 1.05, headR * 0.6, 0, 0, Math.PI);
        } else if (parts.hairFront.id === 'hf2') {
            // 中分
            ctx.moveTo(cx, headY - headR * 1.1);
            ctx.lineTo(cx - headR * 0.3, headY - headR * 0.2);
            ctx.lineTo(cx - headR, headY - headR * 0.5);
            ctx.lineTo(cx - headR * 1.05, headY - headR * 0.2);
            ctx.lineTo(cx, headY - headR * 1.05);
            ctx.lineTo(cx + headR * 1.05, headY - headR * 0.2);
            ctx.lineTo(cx + headR, headY - headR * 0.5);
            ctx.lineTo(cx + headR * 0.3, headY - headR * 0.2);
            ctx.closePath();
        } else if (parts.hairFront.id === 'hf3') {
            // 偏分
            ctx.ellipse(cx + headR * 0.2, headY - headR * 0.3, headR * 1.1, headR * 0.7, -0.2, 0, Math.PI);
        } else {
            // 无刘海 - 全部往后
            ctx.ellipse(cx, headY - headR * 0.5, headR * 1.05, headR * 0.5, 0, 0, Math.PI);
        }
        ctx.fill();

        // 6. 眉毛
        ctx.strokeStyle = parts.eyebrows.color;
        ctx.lineWidth = 1.5;
        const eyeY = headY - headR * 0.1;
        if (parts.eyebrows.id === 'eb1') {
            // 平眉
            ctx.beginPath();
            ctx.moveTo(cx - headR * 0.55, eyeY - headR * 0.2);
            ctx.lineTo(cx - headR * 0.15, eyeY - headR * 0.22);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + headR * 0.15, eyeY - headR * 0.22);
            ctx.lineTo(cx + headR * 0.55, eyeY - headR * 0.2);
            ctx.stroke();
        } else if (parts.eyebrows.id === 'eb2') {
            // 柳眉
            ctx.beginPath();
            ctx.moveTo(cx - headR * 0.55, eyeY - headR * 0.15);
            ctx.quadraticCurveTo(cx - headR * 0.35, eyeY - headR * 0.3, cx - headR * 0.15, eyeY - headR * 0.18);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + headR * 0.15, eyeY - headR * 0.18);
            ctx.quadraticCurveTo(cx + headR * 0.35, eyeY - headR * 0.3, cx + headR * 0.55, eyeY - headR * 0.15);
            ctx.stroke();
        } else if (parts.eyebrows.id === 'eb3') {
            // 剑眉
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx - headR * 0.6, eyeY - headR * 0.15);
            ctx.lineTo(cx - headR * 0.15, eyeY - headR * 0.28);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + headR * 0.15, eyeY - headR * 0.28);
            ctx.lineTo(cx + headR * 0.6, eyeY - headR * 0.15);
            ctx.stroke();
        } else {
            // 弯眉
            ctx.beginPath();
            ctx.arc(cx - headR * 0.35, eyeY - headR * 0.1, headR * 0.25, Math.PI * 1.1, Math.PI * 1.9);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx + headR * 0.35, eyeY - headR * 0.1, headR * 0.25, Math.PI * 1.1, Math.PI * 1.9);
            ctx.stroke();
        }

        // 7. 眼睛
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(cx - headR * 0.35, eyeY, headR * 0.18, headR * 0.12, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + headR * 0.35, eyeY, headR * 0.18, headR * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        // 瞳孔
        ctx.fillStyle = parts.eyes.color;
        ctx.beginPath();
        ctx.arc(cx - headR * 0.35, eyeY, headR * 0.08, 0, Math.PI * 2);
        ctx.arc(cx + headR * 0.35, eyeY, headR * 0.08, 0, Math.PI * 2);
        ctx.fill();
        // 高光
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx - headR * 0.32, eyeY - headR * 0.03, headR * 0.03, 0, Math.PI * 2);
        ctx.arc(cx + headR * 0.38, eyeY - headR * 0.03, headR * 0.03, 0, Math.PI * 2);
        ctx.fill();

        // 8. 嘴巴
        const mouthY = headY + headR * 0.4;
        ctx.strokeStyle = '#8b4040';
        ctx.lineWidth = 1;
        if (parts.mouth.id === 'mt1') {
            // 微笑
            ctx.beginPath();
            ctx.arc(cx, mouthY - headR * 0.05, headR * 0.15, 0.1, Math.PI - 0.1);
            ctx.stroke();
        } else if (parts.mouth.id === 'mt2') {
            // 抿嘴
            ctx.beginPath();
            ctx.moveTo(cx - headR * 0.12, mouthY);
            ctx.lineTo(cx + headR * 0.12, mouthY);
            ctx.stroke();
        } else if (parts.mouth.id === 'mt3') {
            // 微张
            ctx.fillStyle = '#6a3030';
            ctx.beginPath();
            ctx.ellipse(cx, mouthY, headR * 0.08, headR * 0.06, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // 冷笑
            ctx.beginPath();
            ctx.moveTo(cx - headR * 0.15, mouthY + headR * 0.02);
            ctx.quadraticCurveTo(cx, mouthY - headR * 0.05, cx + headR * 0.15, mouthY);
            ctx.stroke();
        }

        // 9. 装饰
        if (parts.deco.id !== 'dc0') {
            ctx.fillStyle = parts.deco.color || '#c9a84c';
            if (parts.deco.id === 'dc1') {
                // 发簪
                ctx.beginPath();
                ctx.moveTo(cx + headR * 0.3, headY - headR * 0.8);
                ctx.lineTo(cx + headR * 0.8, headY - headR * 1.0);
                ctx.lineTo(cx + headR * 0.9, headY - headR * 0.9);
                ctx.closePath();
                ctx.fill();
                // 簪头
                ctx.beginPath();
                ctx.arc(cx + headR * 0.85, headY - headR * 0.95, headR * 0.12, 0, Math.PI * 2);
                ctx.fill();
            } else if (parts.deco.id === 'dc2') {
                // 步摇
                ctx.beginPath();
                ctx.arc(cx + headR * 0.5, headY - headR * 0.7, headR * 0.1, 0, Math.PI * 2);
                ctx.fill();
                // 流苏
                ctx.strokeStyle = parts.deco.color || '#c9a84c';
                ctx.lineWidth = 0.5;
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.moveTo(cx + headR * 0.5, headY - headR * 0.6);
                    ctx.lineTo(cx + headR * (0.4 + i * 0.1), headY - headR * 0.2);
                    ctx.stroke();
                }
            } else if (parts.deco.id === 'dc3') {
                // 花钿
                ctx.beginPath();
                ctx.arc(cx, headY - headR * 0.35, headR * 0.06, 0, Math.PI * 2);
                ctx.fill();
            }
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
