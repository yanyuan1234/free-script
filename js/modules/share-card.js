/**
 * @fileoverview 角色卡片化分享模块
 * @description
 *   将游戏角色数据（playerName / worldSnapshot 等）渲染为精美的预览卡片图片，
 *   支持生成 Canvas / DataURL、下载 PNG、生成 base64 分享链接与反向解析。
 *
 *   依赖：仅依赖浏览器原生 Canvas 2D API，无第三方库。
 *   宿主：在 game.js 之后加载，通过 window.ShareCard 全局对象暴露接口。
 *
 *   设计风格：
 *     - 深色渐变背景（靛紫 → 墨蓝），搭配金色描边
 *     - 现代圆角分区：标题区、角色区、属性区、世界设定区、关键角色区
 *     - 中文字体回退栈：思源黑体 / 微软雅黑 / 苹方 / 黑体
 *
 * @author Free-Script Team
 * @version 1.0.0
 */

(function (window) {
    'use strict';

    /* ============================================================
     *  常量定义
     * ========================================================== */

    /** 卡片画布尺寸（宽 x 高） */
    var CARD_WIDTH = 800;
    var CARD_HEIGHT = 1200;

    /** 中文字体回退栈（按优先级从高到低） */
    var FONT_STACK = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Source Han Sans CN", "Noto Sans CJK SC", "WenQuanYi Micro Hei", sans-serif';

    /** 主题色板 - 深色霓虹风 */
    var PALETTE = {
        // 背景渐变起止色
        bgTop:        '#1a1033',
        bgMiddle:    '#2a1a5e',
        bgBottom:    '#0d1b3e',
        // 金色描边 / 强调色
        gold:         '#e8c468',
        goldDim:      '#b8923f',
        // 文字色
        textPrimary:  '#ffffff',
        textSecondary:'#d8d4f0',
        textMuted:    '#9a93c4',
        // 分区面板背景（半透明）
        panelBg:      'rgba(255, 255, 255, 0.06)',
        panelBorder:  'rgba(232, 196, 104, 0.35)',
        // 属性条
        barBg:        'rgba(255, 255, 255, 0.10)',
        barFill:      '#e8c468',
        // 关键角色头像底色
        avatarBg:     'rgba(232, 196, 104, 0.18)',
        // 强调高亮
        accent:       '#7c5cff'
    };

    /** 分享链接前缀（用于识别本模块生成的链接） */
    var SHARE_LINK_PREFIX = 'freascript://share?v=1&d=';

    /** base64 编码时单次切片大小，避免 call stack 溢出 */
    var BASE64_CHUNK_SIZE = 8192;

    /* ============================================================
     *  内部工具函数
     * ========================================================== */

    /**
     * 安全读取对象属性，避免 undefined.field 报错
     * @param {Object} obj - 源对象
     * @param {...string} keys - 依次读取的属性链
     * @returns {*} 读取到的值，失败返回 undefined
     */
    function safeGet(obj) {
        var cur = obj;
        for (var i = 1; i < arguments.length; i++) {
            if (cur == null) return undefined;
            cur = cur[arguments[i]];
        }
        return cur;
    }

    /**
     * 截断文本到指定长度，超出追加省略号
     * @param {string} text - 原始文本
     * @param {number} maxLen - 最大字符数
     * @returns {string} 截断后的文本
     */
    function truncate(text, maxLen) {
        if (!text) return '';
        var s = String(text);
        if (s.length <= maxLen) return s;
        return s.substring(0, maxLen - 1) + '…';
    }

    /**
     * 移除文本中的换行与多余空白，便于单行展示
     * @param {string} text - 原始文本
     * @returns {string} 单行文本
     */
    function toSingleLine(text) {
        if (!text) return '';
        return String(text).replace(/\s+/g, ' ').trim();
    }

    /**
     * 将长文本按字符宽度折行（中文按单字符宽度估算）
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     * @param {string} text - 原始文本
     * @param {number} maxWidth - 最大行宽（像素）
     * @param {number} maxLines - 最大行数（超出截断）
     * @returns {string[]} 折行后的字符串数组
     */
    function wrapText(ctx, text, maxWidth, maxLines) {
        if (!text) return [];
        var lines = [];
        var paragraphs = String(text).split(/\r?\n/);
        for (var p = 0; p < paragraphs.length; p++) {
            var para = paragraphs[p];
            if (para === '') {
                lines.push('');
                if (lines.length >= maxLines) break;
                continue;
            }
            var current = '';
            for (var i = 0; i < para.length; i++) {
                var test = current + para[i];
                if (ctx.measureText(test).width > maxWidth && current.length > 0) {
                    lines.push(current);
                    if (lines.length >= maxLines) {
                        // 最后一行追加省略号
                        var last = lines[lines.length - 1];
                        if (last.length > 0 && last.charAt(last.length - 1) !== '…') {
                            lines[lines.length - 1] = truncate(last, last.length) + '…';
                        }
                        return lines;
                    }
                    current = para[i];
                } else {
                    current = test;
                }
            }
            if (current) {
                lines.push(current);
                if (lines.length >= maxLines) break;
            }
        }
        return lines.slice(0, maxLines);
    }

    /**
     * 圆角矩形路径（兼容老版 Canvas，无原生 roundRect）
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     * @param {number} x - 左上角 x
     * @param {number} y - 左上角 y
     * @param {number} w - 宽度
     * @param {number} h - 高度
     * @param {number} r - 圆角半径
     */
    function roundRectPath(ctx, x, y, w, h, r) {
        if (r <= 0) {
            ctx.rect(x, y, w, h);
            return;
        }
        // 防止半径过大导致形状异常
        var radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    /**
     * 绘制圆角矩形并填充
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     * @param {number} x - 左上角 x
     * @param {number} y - 左上角 y
     * @param {number} w - 宽度
     * @param {number} h - 高度
     * @param {number} r - 圆角半径
     * @param {string|CanvasGradient} fill - 填充样式
     */
    function fillRoundRect(ctx, x, y, w, h, r, fill) {
        roundRectPath(ctx, x, y, w, h, r);
        ctx.fillStyle = fill;
        ctx.fill();
    }

    /**
     * 绘制圆角矩形描边
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     * @param {number} x - 左上角 x
     * @param {number} y - 左上角 y
     * @param {number} w - 宽度
     * @param {number} h - 高度
     * @param {number} r - 圆角半径
     * @param {string|CanvasGradient} stroke - 描边样式
     * @param {number} lineWidth - 线宽
     */
    function strokeRoundRect(ctx, x, y, w, h, r, stroke, lineWidth) {
        roundRectPath(ctx, x, y, w, h, r);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth || 1;
        ctx.stroke();
    }

    /**
     * 在指定中心绘制圆形头像（含首字与渐变描边）
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     * @param {number} cx - 圆心 x
     * @param {number} cy - 圆心 y
     * @param {number} radius - 半径
     * @param {string} initial - 头像首字
     * @param {string} [labelColor] - 文字颜色
     */
    function drawAvatar(ctx, cx, cy, radius, initial, labelColor) {
        // 底色
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = PALETTE.avatarBg;
        ctx.fill();
        // 金色描边
        ctx.strokeStyle = PALETTE.gold;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // 首字
        ctx.fillStyle = labelColor || PALETTE.gold;
        ctx.font = 'bold ' + Math.floor(radius * 1.1) + 'px ' + FONT_STACK;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initial || '?', cx, cy + 1);
    }

    /* ============================================================
     *  分区绘制函数
     * ========================================================== */

    /**
     * 绘制整张卡片的渐变背景与装饰边框
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     */
    function drawBackground(ctx) {
        // 三段式纵向渐变
        var grad = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
        grad.addColorStop(0,   PALETTE.bgTop);
        grad.addColorStop(0.5, PALETTE.bgMiddle);
        grad.addColorStop(1,   PALETTE.bgBottom);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

        // 微光噪点装饰：右上角放射光
        var radial = ctx.createRadialGradient(
            CARD_WIDTH * 0.85, CARD_HEIGHT * 0.15, 20,
            CARD_WIDTH * 0.85, CARD_HEIGHT * 0.15, 400
        );
        radial.addColorStop(0, 'rgba(232, 196, 104, 0.18)');
        radial.addColorStop(1, 'rgba(232, 196, 104, 0)');
        ctx.fillStyle = radial;
        ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

        // 左下角紫色光晕
        var radial2 = ctx.createRadialGradient(
            CARD_WIDTH * 0.1, CARD_HEIGHT * 0.9, 20,
            CARD_WIDTH * 0.1, CARD_HEIGHT * 0.9, 360
        );
        radial2.addColorStop(0, 'rgba(124, 92, 255, 0.20)');
        radial2.addColorStop(1, 'rgba(124, 92, 255, 0)');
        ctx.fillStyle = radial2;
        ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

        // 外层金色装饰边框（双层）
        ctx.strokeStyle = PALETTE.gold;
        ctx.lineWidth = 2;
        ctx.strokeRect(20, 20, CARD_WIDTH - 40, CARD_HEIGHT - 40);

        ctx.strokeStyle = 'rgba(232, 196, 104, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(28, 28, CARD_WIDTH - 56, CARD_HEIGHT - 56);

        // 四角装饰花纹（小菱形）
        var cornerSize = 6;
        var corners = [
            [20, 20], [CARD_WIDTH - 20, 20],
            [20, CARD_HEIGHT - 20], [CARD_WIDTH - 20, CARD_HEIGHT - 20]
        ];
        ctx.fillStyle = PALETTE.gold;
        corners.forEach(function (c) {
            ctx.beginPath();
            ctx.moveTo(c[0], c[1] - cornerSize);
            ctx.lineTo(c[0] + cornerSize, c[1]);
            ctx.lineTo(c[0], c[1] + cornerSize);
            ctx.lineTo(c[0] - cornerSize, c[1]);
            ctx.closePath();
            ctx.fill();
        });
    }

    /**
     * 绘制顶部标题区（含"角色档案"徽标与日期）
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     * @param {Object} meta - 元信息 { generatedAt }
     */
    function drawHeader(ctx, meta) {
        var cx = CARD_WIDTH / 2;
        var y = 70;

        // 小徽标条
        var badge = 'CHARACTER CARD';
        ctx.font = 'bold 18px ' + FONT_STACK;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = PALETTE.gold;
        // 字间距通过逐字绘制实现
        var letters = badge.split('');
        var totalWidth = 0;
        var spacing = 4;
        letters.forEach(function (ch) {
            totalWidth += ctx.measureText(ch).width + spacing;
        });
        totalWidth -= spacing;
        var startX = cx - totalWidth / 2;
        var cursor = startX;
        letters.forEach(function (ch) {
            ctx.textAlign = 'left';
            ctx.fillText(ch, cursor, y);
            cursor += ctx.measureText(ch).width + spacing;
        });

        // 中文主标题
        ctx.textAlign = 'center';
        ctx.fillStyle = PALETTE.textPrimary;
        ctx.font = 'bold 30px ' + FONT_STACK;
        ctx.fillText('角 色 档 案', cx, y + 36);

        // 生成日期
        ctx.fillStyle = PALETTE.textMuted;
        ctx.font = '14px ' + FONT_STACK;
        var dateStr = meta && meta.generatedAt
            ? new Date(meta.generatedAt).toLocaleDateString('zh-CN')
            : new Date().toLocaleDateString('zh-CN');
        ctx.fillText('生成于 ' + dateStr, cx, y + 64);

        // 分隔线
        var lineY = y + 92;
        var lineGrad = ctx.createLinearGradient(80, lineY, CARD_WIDTH - 80, lineY);
        lineGrad.addColorStop(0,   'rgba(232, 196, 104, 0)');
        lineGrad.addColorStop(0.5, 'rgba(232, 196, 104, 0.8)');
        lineGrad.addColorStop(1,   'rgba(232, 196, 104, 0)');
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(80, lineY);
        ctx.lineTo(CARD_WIDTH - 80, lineY);
        ctx.stroke();
    }

    /**
     * 绘制角色主体区（头像、姓名、身份）
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     * @param {Object} data - 提取后的角色数据
     * @returns {number} 该区域结束的 y 坐标
     */
    function drawCharacterSection(ctx, data) {
        var padX = 60;
        var y = 210;
        var sectionH = 200;

        // 面板背景
        fillRoundRect(ctx, padX, y, CARD_WIDTH - padX * 2, sectionH, 16, PALETTE.panelBg);
        strokeRoundRect(ctx, padX, y, CARD_WIDTH - padX * 2, sectionH, 16, PALETTE.panelBorder, 1);

        // 头像
        var avatarCX = padX + 70;
        var avatarCY = y + sectionH / 2;
        var avatarR = 56;
        var initial = (data.name || '?').charAt(0);
        drawAvatar(ctx, avatarCX, avatarCY, avatarR, initial);

        // 姓名
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = PALETTE.textPrimary;
        ctx.font = 'bold 34px ' + FONT_STACK;
        var nameX = avatarCX + avatarR + 30;
        ctx.fillText(data.name || '未知角色', nameX, avatarCY - 28);

        // 身份
        ctx.fillStyle = PALETTE.gold;
        ctx.font = '20px ' + FONT_STACK;
        ctx.fillText('身份：' + (data.identity || '未设定'), nameX, avatarCY + 4);

        // 主题标签
        ctx.fillStyle = PALETTE.textSecondary;
        ctx.font = '15px ' + FONT_STACK;
        var themeText = '';
        if (data.theme) themeText += data.theme;
        if (data.genre) themeText += (themeText ? ' · ' : '') + data.genre;
        if (themeText) {
            ctx.fillText('题材：' + themeText, nameX, avatarCY + 32);
        }

        return y + sectionH;
    }

    /**
     * 绘制属性条区（player.stats）
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     * @param {Object} data - 提取后的角色数据
     * @param {number} startY - 起始 y 坐标
     * @returns {number} 该区域结束的 y 坐标
     */
    function drawStatsSection(ctx, data, startY) {
        if (!data.stats || data.stats.length === 0) {
            return startY;
        }
        var padX = 60;
        var gap = 16;
        var y = startY + gap;

        // 标题
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = PALETTE.gold;
        ctx.font = 'bold 18px ' + FONT_STACK;
        ctx.fillText('◇ 角色属性', padX + 12, y + 14);

        // 计算面板高度：标题 + 每条属性占 32px
        var statItemH = 30;
        var statsCount = Math.min(data.stats.length, 6);
        var sectionH = 40 + statsCount * statItemH + 12;

        // 面板背景
        fillRoundRect(ctx, padX, y, CARD_WIDTH - padX * 2, sectionH, 16, PALETTE.panelBg);
        strokeRoundRect(ctx, padX, y, CARD_WIDTH - padX * 2, sectionH, 16, PALETTE.panelBorder, 1);

        // 重画标题（盖在面板上）
        ctx.fillStyle = PALETTE.gold;
        ctx.font = 'bold 18px ' + FONT_STACK;
        ctx.fillText('◇ 角色属性', padX + 12, y + 14);

        // 属性条
        var innerX = padX + 24;
        var innerW = CARD_WIDTH - padX * 2 - 48;
        var labelW = 110;
        var barX = innerX + labelW;
        var barW = innerW - labelW - 60; // 留出数值位置
        var barH = 12;

        for (var i = 0; i < statsCount; i++) {
            var stat = data.stats[i];
            if (!stat || !stat.label) continue;
            var rowY = y + 44 + i * statItemH;

            // 标签
            ctx.fillStyle = PALETTE.textSecondary;
            ctx.font = '15px ' + FONT_STACK;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(truncate(stat.label, 8), innerX, rowY);

            // 属性条背景
            fillRoundRect(ctx, barX, rowY - barH / 2, barW, barH, barH / 2, PALETTE.barBg);

            // 属性条填充（按数值归一化，假设上限 100）
            var rawVal = parseFloat(stat.value);
            var numVal = isNaN(rawVal) ? 0 : rawVal;
            var ratio = Math.max(0, Math.min(1, numVal / 100));
            var fillGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
            fillGrad.addColorStop(0, PALETTE.goldDim);
            fillGrad.addColorStop(1, PALETTE.gold);
            fillRoundRect(ctx, barX, rowY - barH / 2, Math.max(barW * ratio, 4), barH, barH / 2, fillGrad);

            // 数值文本
            ctx.fillStyle = PALETTE.textPrimary;
            ctx.font = 'bold 15px ' + FONT_STACK;
            ctx.textAlign = 'left';
            ctx.fillText(String(stat.value), barX + barW + 12, rowY);
        }

        return y + sectionH;
    }

    /**
     * 绘制世界设定摘要区
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     * @param {Object} data - 提取后的角色数据
     * @param {number} startY - 起始 y 坐标
     * @returns {number} 该区域结束的 y 坐标
     */
    function drawWorldSection(ctx, data, startY) {
        if (!data.worldSummary) return startY;
        var padX = 60;
        var gap = 16;
        var y = startY + gap;

        // 标题先量高度
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 18px ' + FONT_STACK;

        var innerX = padX + 24;
        var innerW = CARD_WIDTH - padX * 2 - 48;
        var maxLines = 5;

        // 先用临时字体计算折行
        ctx.font = '15px ' + FONT_STACK;
        var lines = wrapText(ctx, data.worldSummary, innerW, maxLines);

        var sectionH = 44 + lines.length * 22 + 16;

        // 面板
        fillRoundRect(ctx, padX, y, CARD_WIDTH - padX * 2, sectionH, 16, PALETTE.panelBg);
        strokeRoundRect(ctx, padX, y, CARD_WIDTH - padX * 2, sectionH, 16, PALETTE.panelBorder, 1);

        // 标题
        ctx.fillStyle = PALETTE.gold;
        ctx.font = 'bold 18px ' + FONT_STACK;
        ctx.fillText('◇ 世界设定摘要', padX + 12, y + 18);

        // 正文
        ctx.fillStyle = PALETTE.textSecondary;
        ctx.font = '15px ' + FONT_STACK;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        var textY = y + 40;
        lines.forEach(function (line) {
            ctx.fillText(line, innerX, textY);
            textY += 22;
        });

        return y + sectionH;
    }

    /**
     * 绘制关键角色列表区
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     * @param {Object} data - 提取后的角色数据
     * @param {number} startY - 起始 y 坐标
     * @returns {number} 该区域结束的 y 坐标
     */
    function drawCharactersSection(ctx, data, startY) {
        var padX = 60;
        var gap = 16;
        var y = startY + gap;

        if (!data.characters || data.characters.length === 0) {
            // 空面板占位
            var emptyH = 70;
            fillRoundRect(ctx, padX, y, CARD_WIDTH - padX * 2, emptyH, 16, PALETTE.panelBg);
            strokeRoundRect(ctx, padX, y, CARD_WIDTH - padX * 2, emptyH, 16, PALETTE.panelBorder, 1);
            ctx.fillStyle = PALETTE.gold;
            ctx.font = 'bold 18px ' + FONT_STACK;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText('◇ 关键角色', padX + 12, y + 18);
            ctx.fillStyle = PALETTE.textMuted;
            ctx.font = 'italic 15px ' + FONT_STACK;
            ctx.fillText('（暂无关键角色数据）', padX + 24, y + 46);
            return y + emptyH;
        }

        var maxChars = Math.min(data.characters.length, 4);
        var itemH = 56;
        var sectionH = 44 + maxChars * itemH + 16;

        // 面板
        fillRoundRect(ctx, padX, y, CARD_WIDTH - padX * 2, sectionH, 16, PALETTE.panelBg);
        strokeRoundRect(ctx, padX, y, CARD_WIDTH - padX * 2, sectionH, 16, PALETTE.panelBorder, 1);

        // 标题
        ctx.fillStyle = PALETTE.gold;
        ctx.font = 'bold 18px ' + FONT_STACK;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('◇ 关键角色', padX + 12, y + 18);

        // 角色列表
        var innerX = padX + 24;
        for (var i = 0; i < maxChars; i++) {
            var ch = data.characters[i];
            if (!ch) continue;
            var rowY = y + 44 + i * itemH;

            // 小头像
            var avR = 18;
            var avCX = innerX + avR;
            var avCY = rowY + itemH / 2 - 4;
            drawAvatar(ctx, avCX, avCY, avR, (ch.name || '?').charAt(0));

            // 姓名 + 头衔
            var nameX = avCX + avR + 14;
            ctx.fillStyle = PALETTE.textPrimary;
            ctx.font = 'bold 17px ' + FONT_STACK;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(truncate(ch.name || '未知', 12), nameX, avCY - 9);

            ctx.fillStyle = PALETTE.textMuted;
            ctx.font = '13px ' + FONT_STACK;
            ctx.fillText(truncate(ch.title || '无头衔', 16), nameX, avCY + 10);

            // 关系
            ctx.fillStyle = PALETTE.textSecondary;
            ctx.font = '14px ' + FONT_STACK;
            ctx.textAlign = 'right';
            var rightX = CARD_WIDTH - padX - 24;
            if (ch.relation) {
                ctx.fillText('关系：' + truncate(ch.relation, 10), rightX, avCY - 9);
            }

            // 好感度
            if (typeof ch.favorability === 'number') {
                ctx.fillStyle = PALETTE.gold;
                ctx.font = 'bold 14px ' + FONT_STACK;
                ctx.fillText('好感 ' + ch.favorability, rightX, avCY + 10);
            }
        }

        return y + sectionH;
    }

    /**
     * 绘制底部页脚区（含版权信息与装饰）
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     * @param {number} startY - 起始 y 坐标
     */
    function drawFooter(ctx, startY) {
        var y = Math.max(startY + 20, CARD_HEIGHT - 90);

        // 分隔线
        var lineGrad = ctx.createLinearGradient(80, y, CARD_WIDTH - 80, y);
        lineGrad.addColorStop(0,   'rgba(232, 196, 104, 0)');
        lineGrad.addColorStop(0.5, 'rgba(232, 196, 104, 0.8)');
        lineGrad.addColorStop(1,   'rgba(232, 196, 104, 0)');
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(80, y);
        ctx.lineTo(CARD_WIDTH - 80, y);
        ctx.stroke();

        // 中心装饰菱形
        ctx.fillStyle = PALETTE.gold;
        var cx = CARD_WIDTH / 2;
        ctx.beginPath();
        ctx.moveTo(cx, y - 5);
        ctx.lineTo(cx + 5, y);
        ctx.lineTo(cx, y + 5);
        ctx.lineTo(cx - 5, y);
        ctx.closePath();
        ctx.fill();

        // 文本
        ctx.fillStyle = PALETTE.textMuted;
        ctx.font = '13px ' + FONT_STACK;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Free-Script · 角色卡片分享', CARD_WIDTH / 2, y + 24);

        ctx.font = '11px ' + FONT_STACK;
        ctx.fillStyle = 'rgba(154, 147, 196, 0.6)';
        ctx.fillText('由 ShareCard 模块生成', CARD_WIDTH / 2, y + 44);
    }

    /* ============================================================
     *  数据提取与序列化
     * ========================================================== */

    /**
     * 从 gameState 提取绘制所需的扁平化数据
     * @param {Object} gameState - 游戏状态对象
     * @returns {Object} 提取后的角色数据
     *   {
     *     name: string,
     *     identity: string,
     *     theme: string,
     *     genre: string,
     *     stats: Array<{label,value}>,
     *     worldSummary: string,
     *     characters: Array<{name,title,relation,favorability}>
     *   }
     */
    function extractCardData(gameState) {
        var gs = gameState || {};
        var snap = gs.worldSnapshot || {};
        var player = snap.player || gs.playerData || {};

        // 角色名优先级：worldSnapshot.player.name > playerName > playerData.name
        var name = player.name || gs.playerName || '未知角色';
        var identity = player.identity || gs.playerIdentity || '';

        // 属性列表
        var stats = [];
        if (Array.isArray(player.stats)) {
            stats = player.stats.filter(function (s) {
                return s && s.label && s.value !== undefined && s.value !== null && s.value !== '';
            });
        }

        // 世界设定摘要优先级：worldSummary > userPrompt
        var worldSummary = '';
        if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.getWorldSummary) {
            try {
                worldSummary = EnhancedMemory.getWorldSummary() || '';
            } catch (e) { /* 忽略 */ }
        }
        if (!worldSummary) {
            worldSummary = gs.userPrompt || snap.summary || '';
        }

        // 关键角色列表
        var characters = [];
        if (Array.isArray(snap.characters)) {
            characters = snap.characters.map(function (c) {
                return {
                    name: c.name || '',
                    title: c.title || '',
                    relation: c.relation || '',
                    favorability: typeof c.favorability === 'number' ? c.favorability : null
                };
            }).filter(function (c) { return c.name; });
        }

        return {
            name: name,
            identity: identity,
            theme: gs.theme || '',
            genre: gs.genre || '',
            stats: stats,
            worldSummary: toSingleLine(worldSummary),
            characters: characters
        };
    }

    /**
     * 将对象序列化为 Unicode 安全的 base64 字符串
     * （使用 encodeURIComponent + btoa 处理中文，避免 latin1 范围限制）
     * @param {Object} obj - 任意可序列化对象
     * @returns {string} base64 字符串
     */
    function encodeBase64(obj) {
        try {
            var json = JSON.stringify(obj);
            // 处理 Unicode 字符
            var unicodeSafe = unescape(encodeURIComponent(json));
            return btoa(unicodeSafe);
        } catch (e) {
            return '';
        }
    }

    /**
     * 解码 Unicode 安全的 base64 字符串为对象
     * @param {string} b64 - base64 字符串
     * @returns {Object|null} 解析后的对象，失败返回 null
     */
    function decodeBase64(b64) {
        if (!b64) return null;
        try {
            var unicodeSafe = atob(b64);
            var json = decodeURIComponent(escape(unicodeSafe));
            return JSON.parse(json);
        } catch (e) {
            return null;
        }
    }

    /* ============================================================
     *  对外接口
     * ========================================================== */

    var ShareCard = {

        /**
         * 卡片画布宽度
         * @type {number}
         */
        CARD_WIDTH: CARD_WIDTH,

        /**
         * 卡片画布高度
         * @type {number}
         */
        CARD_HEIGHT: CARD_HEIGHT,

        /**
         * 生成角色预览卡片
         * @param {Object} gameState - 游戏状态对象（game.js 中的全局 gameState）
         * @param {Object} [options] - 可选参数
         * @param {boolean} [options.returnCanvas=false] - 为 true 时返回 Canvas 元素，否则返回 DataURL
         * @returns {HTMLCanvasElement|string} Canvas 元素或 PNG DataURL
         *
         * @example
         * // 返回 DataURL
         * var dataUrl = ShareCard.generate(gameState);
         * // 返回 Canvas 元素
         * var canvas = ShareCard.generate(gameState, { returnCanvas: true });
         */
        generate: function (gameState, options) {
            options = options || {};
            var data = extractCardData(gameState);
            var meta = { generatedAt: Date.now() };

            // 创建画布
            var canvas = document.createElement('canvas');
            canvas.width = CARD_WIDTH;
            canvas.height = CARD_HEIGHT;
            var ctx = canvas.getContext('2d');

            // 抗锯齿与文字优化
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.textRendering = 'geometricPrecision';

            // 1. 背景与边框
            drawBackground(ctx);

            // 2. 顶部标题
            drawHeader(ctx, meta);

            // 3. 角色主体区
            var curY = drawCharacterSection(ctx, data);

            // 4. 属性区
            curY = drawStatsSection(ctx, data, curY);

            // 5. 世界设定区
            curY = drawWorldSection(ctx, data, curY);

            // 6. 关键角色区
            curY = drawCharactersSection(ctx, data, curY);

            // 7. 页脚
            drawFooter(ctx, curY);

            return options.returnCanvas ? canvas : canvas.toDataURL('image/png');
        },

        /**
         * 下载角色卡片为 PNG 图片
         * @param {Object} gameState - 游戏状态对象
         * @param {string} [filename] - 文件名（不含扩展名）
         * @returns {boolean} 是否成功触发下载
         *
         * @example
         * ShareCard.download(gameState, '我的角色');
         */
        download: function (gameState, filename) {
            try {
                var dataUrl = ShareCard.generate(gameState);
                var name = filename || 'character-card';
                // 文件名清理：移除非法字符
                var safeName = String(name).replace(/[\\/:*?"<>|]/g, '_');

                // 创建下载链接
                var link = document.createElement('a');
                link.download = safeName + '.png';
                link.href = dataUrl;

                // 部分浏览器需要将 link 加入 DOM 才能触发下载
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                return true;
            } catch (e) {
                console.error('[ShareCard.download] 下载失败：', e);
                return false;
            }
        },

        /**
         * 生成分享链接（base64 编码的角色数据）
         * @param {Object} gameState - 游戏状态对象
         * @returns {string} 分享链接 URL 字符串
         *
         * @example
         * var link = ShareCard.generateShareLink(gameState);
         * // => 'freascript://share?v=1&d=eyJwbGF5ZXJOYW1lIj...'
         */
        generateShareLink: function (gameState) {
            var gs = gameState || {};
            var snap = gs.worldSnapshot || {};

            // 仅打包关键字段，避免链接过长
            var payload = {
                playerName: gs.playerName || '',
                playerIdentity: gs.playerIdentity || '',
                theme: gs.theme || '',
                genre: gs.genre || '',
                userPrompt: gs.userPrompt ? truncate(toSingleLine(gs.userPrompt), 500) : '',
                worldSnapshot: {
                    player: snap.player ? {
                        name: snap.player.name || '',
                        identity: snap.player.identity || '',
                        stats: Array.isArray(snap.player.stats)
                            ? snap.player.stats.slice(0, 6)
                            : []
                    } : null,
                    characters: Array.isArray(snap.characters)
                        ? snap.characters.slice(0, 4).map(function (c) {
                            return {
                                name: c.name || '',
                                title: c.title || '',
                                relation: c.relation || '',
                                favorability: typeof c.favorability === 'number' ? c.favorability : null
                            };
                        })
                        : []
                },
                _ts: Date.now()
            };

            var encoded = encodeBase64(payload);
            if (!encoded) return '';
            return SHARE_LINK_PREFIX + encoded;
        },

        /**
         * 解析分享链接恢复角色数据
         * @param {string} url - 分享链接 URL 字符串
         * @returns {Object|null} 解析后的角色数据对象，失败返回 null
         *   {
         *     playerName, playerIdentity, theme, genre,
         *     userPrompt, worldSnapshot: { player, characters }
         *   }
         *
         * @example
         * var data = ShareCard.parseShareLink(link);
         * if (data) ShareCard.download(data, data.playerName);
         */
        parseShareLink: function (url) {
            if (!url || typeof url !== 'string') return null;
            try {
                // 兼容：用户可能传入完整 URL 或仅 base64 部分
                var b64 = url;
                var prefixIdx = url.indexOf(SHARE_LINK_PREFIX);
                if (prefixIdx === 0) {
                    b64 = url.substring(SHARE_LINK_PREFIX.length);
                } else if (url.indexOf('?d=') !== -1) {
                    // 兼容其他形式的查询参数
                    var match = url.match(/[?&]d=([^&]+)/);
                    if (match) b64 = decodeURIComponent(match[1]);
                }
                // 去除可能的多余空白与 # 锚点
                b64 = b64.replace(/#.*$/, '').trim();
                return decodeBase64(b64);
            } catch (e) {
                console.error('[ShareCard.parseShareLink] 解析失败：', e);
                return null;
            }
        },

        /**
         * 从分享链接直接生成并下载卡片
         * @param {string} url - 分享链接
         * @param {string} [filename] - 文件名
         * @returns {boolean} 是否成功
         *
         * @example
         * ShareCard.downloadFromLink(link, '好友分享的角色');
         */
        downloadFromLink: function (url, filename) {
            var data = ShareCard.parseShareLink(url);
            if (!data) return false;
            return ShareCard.download(data, filename || data.playerName || 'shared-character');
        },

        /**
         * 版本号
         * @type {string}
         */
        version: '1.0.0'
    };

    // 暴露到全局
    window.ShareCard = ShareCard;

})(typeof window !== 'undefined' ? window : this);
