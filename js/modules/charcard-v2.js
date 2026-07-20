// ========================================
// SillyTavern 角色卡 V2 导入/导出模块 - CharCardV2
// ========================================
// 实现 SillyTavern Character Card V2 规范的导入与导出
// - 规范参考: https://github.com/malfoyslastname/character-card-spec-V2
// - PNG 承载: 在 tEXt chunk 中写入 keyword="chara" value=base64(UTF-8 JSON)
// - 字段映射遵循项目内 gameState / worldSnapshot / WorldInfo 约定
//
// 依赖（均为软依赖，缺失时降级）:
//   - gameState          全局游戏状态对象
//   - StateManager       状态读写器（优先使用，回退到直写）
//   - WorldInfo          世界书系统（导入 character_book 时使用）
//   - window.btoa/atob   base64 编解码
//   - TextEncoder/Decoder UTF-8 编解码
//   - Canvas API         生成 PNG 字节流
// ========================================
(function (window) {
    'use strict';

    // V2 角色卡规范标识
    var SPEC = 'chara_card_v2';
    var SPEC_VERSION = '2.0';

    // PNG tEXt chunk 使用的 keyword（SillyTavern 约定）
    var PNG_CHARA_KEYWORD = 'chara';

    // PNG 文件签名（8 字节）
    var PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

    // CRC32 计算表（懒加载）
    var _CRC32_TABLE = null;

    /**
     * CharCardV2 对外接口
     * @namespace CharCardV2
     */
    var CharCardV2 = {};

    // ------------------------------------------------------------
    // 导出（Export）
    // ------------------------------------------------------------

    /**
     * 将游戏状态导出为 SillyTavern V2 角色卡 JSON 对象。
     *
     * 字段映射（V2 spec -> gameState）:
     *   - name           -> gameState.playerName
     *   - description    -> worldSnapshot.worldSetting
     *   - personality    -> 角色性格（worldSnapshot.characters[0].personality 或玩家属性）
     *   - scenario       -> gameState.scenario（缺失时由 theme/genre/setupText 推导）
     *   - first_mes      -> 开场场景（worldSnapshot.openingScene）
     *   - mes_example    -> 对话示例（worldSnapshot.characters[0].mes_example）
     *   - system_prompt  -> 系统提示词（world.userPrompt）
     *   - character_book -> 世界书条目（WorldInfo 系统导出）
     *
     * @memberof CharCardV2
     * @param {object} gameState 游戏状态对象；缺省时回退到全局 gameState
     * @returns {object} V2 角色卡 JSON 对象，结构为 { spec, spec_version, data }
     */
    CharCardV2.export = function (gameState) {
        var gs = gameState || (typeof window.gameState !== 'undefined' ? window.gameState : null) || {};
        var data = CharCardV2._buildCardData(gs);
        return {
            spec: SPEC,
            spec_version: SPEC_VERSION,
            data: data
        };
    };

    /**
     * 导出为 PNG（在 tEXt chunk 中嵌入角色卡 JSON）。
     *
     * 使用 Canvas API 生成底图，然后将 V2 角色卡 JSON 以
     * keyword="chara" value=base64(UTF-8 JSON) 的形式写入 PNG tEXt chunk。
     * 插入位置：紧随 IHDR chunk 之后（符合 SillyTavern 读取约定）。
     *
     * @memberof CharCardV2
     * @param {object} gameState 游戏状态对象
     * @param {HTMLCanvasElement} canvas 已绘制好图像的 Canvas 元素；
     *        若未提供，则内部创建一张纯色占位 Canvas
     * @returns {Promise<Blob>} 带 tEXt chunk 的 PNG Blob
     */
    CharCardV2.exportPNG = function (gameState, canvas) {
        // 1. 构造 V2 角色卡 JSON
        var card = CharCardV2.export(gameState);

        // 2. 通过 Canvas API 取得底图 PNG 字节流
        return CharCardV2._canvasToPngBytes(canvas).then(function (pngBytes) {
            // 3. 在 PNG 中嵌入 tEXt chunk
            var embedded = CharCardV2._embedTextChunk(pngBytes, PNG_CHARA_KEYWORD, JSON.stringify(card));
            return new Blob([embedded], { type: 'image/png' });
        });
    };

    // ------------------------------------------------------------
    // 导入（Import）
    // ------------------------------------------------------------

    /**
     * 从 JSON 或 PNG 数据导入角色卡，并把字段写回 gameState。
     *
     * 支持以下输入类型：
     *   - string（JSON 文本 或 data:image/png;base64,... 的 Data URL）
     *   - object（已解析的 V2 角色卡 JSON）
     *   - ArrayBuffer / Uint8Array（PNG 二进制，从中提取 tEXt chunk）
     *   - Blob（PNG 文件，先读取为 ArrayBuffer 再处理）
     *
     * 导入流程：
     *   1. 解析得到 V2 角色卡 JSON
     *   2. 反向映射字段到 gameState（playerName / worldSnapshot / scenario 等）
     *   3. 若含 character_book，调用 importCharacterBook 写入 WorldInfo 系统
     *   4. 通过 StateManager（可用时）或直写方式落盘
     *
     * @memberof CharCardV2
     * @param {(string|object|ArrayBuffer|Uint8Array|Blob)} jsonOrPNGData 输入数据
     * @param {object} [gameState] 目标游戏状态；缺省时使用全局 gameState
     * @returns {Promise<object>} 导入后的 V2 角色卡 JSON（已规范化）
     */
    CharCardV2.import = function (jsonOrPNGData, gameState) {
        var gs = gameState || (typeof window.gameState !== 'undefined' ? window.gameState : null) || {};
        // 统一先把输入归一化为 V2 卡 JSON（异步，因为可能涉及 Blob 读取）
        return CharCardV2._parseInputToCard(jsonOrPNGData).then(function (card) {
            if (!card || typeof card !== 'object') {
                throw new Error('无法解析角色卡数据');
            }
            // 兼容两种包装：{ spec, data } 或裸 data 对象
            var data = card.data && (card.spec || card.spec_version) ? card.data : card;
            // 规范化 data 为标准 V2 结构
            var normalized = CharCardV2._normalizeCardData(data);

            // 1. 把字段反向写回 gameState
            CharCardV2._applyCardToGameState(normalized, gs);

            // 2. 处理内嵌世界书
            if (normalized.character_book) {
                try {
                    CharCardV2.importCharacterBook(normalized.character_book);
                } catch (e) {
                    console.warn('[CharCardV2] 导入内嵌世界书失败:', e);
                }
            }
            return {
                spec: SPEC,
                spec_version: SPEC_VERSION,
                data: normalized
            };
        });
    };

    /**
     * 导入内嵌世界书（character_book）到 WorldInfo 系统。
     *
     * 兼容两种条目结构：
     *   - V2 规范的 { entries: { 0: {...}, 1: {...} } }（对象，key 为 id）
     *   - 旧版数组结构 { entries: [ {...}, {...} ] }
     *
     * 内部复用 WorldInfo.convertEntry 进行字段归一化，并新建一本书承载
     * 导入条目；若 WorldInfo 不可用则返回 0。
     *
     * @memberof CharCardV2
     * @param {object} bookData 角色卡中的 character_book 字段
     * @param {string} [bookName] 自定义书名；缺省时取 bookData.name 或 "导入的角色卡世界书"
     * @returns {number} 成功导入的条目数
     */
    CharCardV2.importCharacterBook = function (bookData, bookName) {
        if (typeof window.WorldInfo === 'undefined' || !window.WorldInfo || !window.WorldInfo.books) {
            console.warn('[CharCardV2] WorldInfo 系统未就绪，无法导入世界书');
            return 0;
        }
        if (!bookData || typeof bookData !== 'object') return 0;

        // 提取条目集合，兼容对象/数组两种结构
        var rawEntries = bookData.entries || bookData.entry || {};
        var entryList = CharCardV2._entriesToArray(rawEntries);
        if (entryList.length === 0) return 0;

        // 确定书名
        var name = bookName || bookData.name || '导入的角色卡世界书';

        // 构造新书
        var newBook = {
            id: 'book_card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            name: name,
            enabled: true,
            entries: {}
        };

        var count = 0;
        for (var i = 0; i < entryList.length; i++) {
            var raw = entryList[i];
            // 生成稳定 uid（优先沿用原 id，否则按序生成）
            var uid = (raw.uid !== undefined ? raw.uid
                : (raw.id !== undefined ? raw.id
                    : Date.now() + i));
            uid = String(uid);

            // 优先复用 WorldInfo.convertEntry 做字段归一化
            var converted = null;
            if (typeof window.WorldInfo.convertEntry === 'function') {
                converted = window.WorldInfo.convertEntry(raw, uid);
            } else {
                converted = CharCardV2._fallbackConvertEntry(raw, uid);
            }
            if (converted) {
                newBook.entries[uid] = converted;
                count++;
            }
        }

        if (count === 0) return 0;

        // 写入 WorldInfo 并持久化
        window.WorldInfo.books.push(newBook);
        if (typeof window.WorldInfo.save === 'function') {
            try { window.WorldInfo.save(); } catch (e) { console.warn('[CharCardV2] 保存世界书失败:', e); }
        }

        // 世界书↔记忆联动：批量同步到永久事实区
        try {
            if (window.EnhancedMemory && typeof window.EnhancedMemory.syncWorldInfoEntry === 'function') {
                var uids = Object.keys(newBook.entries);
                for (var j = 0; j < uids.length; j++) {
                    window.EnhancedMemory.syncWorldInfoEntry(newBook.entries[uids[j]], uids[j], newBook.id);
                }
            }
        } catch (e) {
            console.warn('[CharCardV2] 同步世界书到记忆系统失败:', e);
        }

        return count;
    };

    // ------------------------------------------------------------
    // 卡片数据构建（导出方向）
    // ------------------------------------------------------------

    /**
     * 根据 gameState 构造 V2 角色卡的 data 部分。
     * @private
     * @param {object} gs 游戏状态
     * @returns {object} V2 data 对象
     */
    CharCardV2._buildCardData = function (gs) {
        var ws = (gs && gs.worldSnapshot) || {};
        var player = (gs && gs.playerData) || (ws && ws.player) || {};
        var leadChar = (Array.isArray(ws.characters) && ws.characters.length > 0) ? ws.characters[0] : {};

        return {
            // name -> gameState.playerName
            name: CharCardV2._safeStr(gs.playerName || player.name, '未命名角色'),
            // description -> worldSnapshot.worldSetting
            description: CharCardV2._safeStr(ws.worldSetting || ws.worldSettingCompressed || player.identity || ''),
            // personality -> 角色性格
            personality: CharCardV2._buildPersonality(gs, leadChar, player),
            // scenario -> gameState.scenario
            scenario: CharCardV2._buildScenario(gs),
            // first_mes -> 开场场景
            first_mes: CharCardV2._safeStr(ws.openingScene || leadChar.first_mes || leadChar.firstMessage || ''),
            // mes_example -> 对话示例
            mes_example: CharCardV2._safeStr(leadChar.mes_example || leadChar.dialogueExample || ''),
            creator_notes: '由 Free-Script CharCardV2 导出',
            // system_prompt -> 系统提示词
            system_prompt: CharCardV2._safeStr(gs.userPrompt || CharCardV2._stateGet('world.userPrompt') || ''),
            post_history_instructions: CharCardV2._safeStr(gs.authorsNote || CharCardV2._stateGet('settings.authorsNote') || ''),
            tags: ['free-script', 'v2-export'],
            creator: 'Free-Script',
            character_version: '1.0',
            alternate_greetings: Array.isArray(leadChar.alternateGreetings) ? leadChar.alternateGreetings : [],
            extensions: CharCardV2._buildExtensions(gs),
            character_book: CharCardV2._exportCharacterBook()
        };
    };

    /**
     * 构造 personality 字段（角色性格）。
     * 优先取首位 NPC 的 personality；其次用玩家属性拼接。
     * @private
     * @param {object} gs 游戏状态
     * @param {object} leadChar 首位 NPC
     * @param {object} player 玩家数据
     * @returns {string}
     */
    CharCardV2._buildPersonality = function (gs, leadChar, player) {
        var parts = [];
        if (leadChar && leadChar.personality) {
            parts.push(leadChar.personality);
        }
        if (leadChar && leadChar.role) {
            parts.push('角色: ' + leadChar.role);
        }
        // 玩家属性作为性格补充
        var stats = player.stats || (gs.playerData && gs.playerData.stats) || [];
        if (Array.isArray(stats) && stats.length > 0) {
            parts.push('属性: ' + stats.map(function (s) {
                return (s.name || '?') + '(' + (s.value !== undefined ? s.value : (s.level || 0)) + ')';
            }).join(', '));
        }
        if (leadChar && leadChar.relationship) {
            parts.push('关系: ' + leadChar.relationship);
        }
        return parts.join('\n');
    };

    /**
     * 构造 scenario 字段。
     * 优先使用 gameState.scenario；缺失时由 theme/genre/userPrompt/setupText 推导。
     * @private
     * @param {object} gs 游戏状态
     * @returns {string}
     */
    CharCardV2._buildScenario = function (gs) {
        // 优先使用显式 scenario 字段
        if (gs.scenario && typeof gs.scenario === 'string') {
            return gs.scenario;
        }
        var parts = [];
        if (gs.theme) parts.push('主题: ' + gs.theme);
        if (gs.genre) parts.push('类型: ' + gs.genre);
        if (gs.userPrompt) parts.push('世界设定: ' + gs.userPrompt);
        if (gs.setupText) parts.push('开场设定: ' + gs.setupText);
        return parts.join('\n');
    };

    /**
     * 构造 extensions 字段（depth_prompt 等扩展信息）。
     * @private
     * @param {object} gs 游戏状态
     * @returns {object}
     */
    CharCardV2._buildExtensions = function (gs) {
        var authorsNote = gs.authorsNote || CharCardV2._stateGet('settings.authorsNote') || '';
        var depth = gs.authorsNoteDepth;
        if (depth === undefined) {
            depth = CharCardV2._stateGet('settings.authorsNoteDepth');
        }
        return {
            depth_prompt: {
                prompt: authorsNote,
                depth: (typeof depth === 'number') ? depth : 0,
                role: 'system'
            },
            talkativeness: '0.5'
        };
    };

    /**
     * 把 WorldInfo 系统中的世界书导出为 V2 character_book 结构。
     * 只导出第一本已启用的书（与 SillyTavern 单卡单书约定一致）。
     * @private
     * @returns {object} { name, entries }
     */
    CharCardV2._exportCharacterBook = function () {
        var empty = { name: '', entries: {} };
        if (typeof window.WorldInfo === 'undefined' || !window.WorldInfo || !Array.isArray(window.WorldInfo.books)) {
            return empty;
        }
        try {
            for (var i = 0; i < window.WorldInfo.books.length; i++) {
                var book = window.WorldInfo.books[i];
                if (!book || book.enabled === false) continue;
                var entries = {};
                var src = book.entries || {};
                var keys = Object.keys(src);
                for (var j = 0; j < keys.length; j++) {
                    var uid = keys[j];
                    var e = src[uid];
                    if (!e) continue;
                    // 将内部条目映射回 V2 character_book.entries 项
                    entries[uid] = {
                        keys: Array.isArray(e.key) ? e.key.slice() : [],
                        content: e.content || '',
                        extensions: {
                            position: e.position || 0,
                            exclude_recursion: !!e.excludeRecursion,
                            probability: e.probability || 100,
                            depth: e.depth || 4,
                            selective: !!e.selective,
                            group: e.group || '',
                            group_weight: e.groupWeight || 0,
                            order: e.order || 100,
                            use_regex: false
                        },
                        comment: e.comment || e.name || '',
                        constant: !!e.constant,
                        vectorized: !!e.vectorized,
                        name: e.comment || e.name || ''
                    };
                }
                return {
                    name: book.name || '导出的世界书',
                    entries: entries
                };
            }
        } catch (e) {
            console.warn('[CharCardV2] 导出世界书失败:', e);
        }
        return empty;
    };

    // ------------------------------------------------------------
    // 卡片数据落盘（导入方向）
    // ------------------------------------------------------------

    /**
     * 把 V2 卡片 data 字段反向写入 gameState。
     * 优先通过 StateManager 写入（触发持久化/迁移），否则直写。
     * @private
     * @param {object} data V2 卡片 data
     * @param {object} gs 目标游戏状态
     */
    CharCardV2._applyCardToGameState = function (data, gs) {
        // name -> gameState.playerName
        if (data.name) {
            gs.playerName = data.name;
            CharCardV2._stateSet('entities.player.name', data.name);
        }

        // 确保 worldSnapshot 存在
        if (!gs.worldSnapshot || typeof gs.worldSnapshot !== 'object') {
            gs.worldSnapshot = {};
        }
        var ws = gs.worldSnapshot;

        // description -> worldSnapshot.worldSetting
        if (data.description !== undefined) {
            ws.worldSetting = data.description;
        }

        // first_mes -> 开场场景
        if (data.first_mes !== undefined) {
            ws.openingScene = data.first_mes;
        }

        // personality -> 角色性格（写入首位 NPC，无则创建）
        if (data.personality) {
            if (!Array.isArray(ws.characters)) ws.characters = [];
            if (ws.characters.length === 0) {
                ws.characters.push({ name: data.name || '角色' });
            }
            ws.characters[0].personality = data.personality;
        }

        // mes_example -> 对话示例（写入首位 NPC）
        if (data.mes_example !== undefined) {
            if (!Array.isArray(ws.characters)) ws.characters = [];
            if (ws.characters.length === 0) {
                ws.characters.push({ name: data.name || '角色' });
            }
            ws.characters[0].mes_example = data.mes_example;
        }

        // scenario -> gameState.scenario
        if (data.scenario !== undefined) {
            gs.scenario = data.scenario;
        }

        // system_prompt -> 系统提示词（world.userPrompt）
        if (data.system_prompt !== undefined) {
            gs.userPrompt = data.system_prompt;
            CharCardV2._stateSet('world.userPrompt', data.system_prompt);
        }

        // post_history_instructions -> 作者备注
        if (data.post_history_instructions !== undefined) {
            gs.authorsNote = data.post_history_instructions;
            CharCardV2._stateSet('settings.authorsNote', data.post_history_instructions);
        }

        // depth_prompt 扩展（authorsNoteDepth）
        if (data.extensions && data.extensions.depth_prompt) {
            var dp = data.extensions.depth_prompt;
            if (dp.depth !== undefined) {
                gs.authorsNoteDepth = dp.depth;
                CharCardV2._stateSet('settings.authorsNoteDepth', dp.depth);
            }
            if (dp.prompt !== undefined) {
                gs.authorsNote = dp.prompt;
                CharCardV2._stateSet('settings.authorsNote', dp.prompt);
            }
        }
    };

    /**
     * 规范化导入的 data 对象，补齐 V2 必需字段。
     * @private
     * @param {object} data 原始 data
     * @returns {object} 规范化后的 data
     */
    CharCardV2._normalizeCardData = function (data) {
        if (!data || typeof data !== 'object') data = {};
        return {
            name: CharCardV2._safeStr(data.name, ''),
            description: CharCardV2._safeStr(data.description, ''),
            personality: CharCardV2._safeStr(data.personality, ''),
            scenario: CharCardV2._safeStr(data.scenario, ''),
            first_mes: CharCardV2._safeStr(data.first_mes, ''),
            mes_example: CharCardV2._safeStr(data.mes_example, ''),
            creator_notes: CharCardV2._safeStr(data.creator_notes, ''),
            system_prompt: CharCardV2._safeStr(data.system_prompt, ''),
            post_history_instructions: CharCardV2._safeStr(data.post_history_instructions, ''),
            tags: Array.isArray(data.tags) ? data.tags : [],
            creator: CharCardV2._safeStr(data.creator, ''),
            character_version: CharCardV2._safeStr(data.character_version, ''),
            alternate_greetings: Array.isArray(data.alternate_greetings) ? data.alternate_greetings : [],
            extensions: (data.extensions && typeof data.extensions === 'object') ? data.extensions : {},
            character_book: (data.character_book && typeof data.character_book === 'object') ? data.character_book : null
        };
    };

    // ------------------------------------------------------------
    // PNG tEXt chunk 处理（Canvas API）
    // ------------------------------------------------------------

    /**
     * 把 Canvas 转换为 PNG 字节数组（Uint8Array）。
     * 使用 Canvas API 的 toBlob 异步取得 PNG 二进制。
     * @private
     * @param {HTMLCanvasElement} [canvas] 调用方提供的 Canvas；缺省时创建占位 Canvas
     * @returns {Promise<Uint8Array>} PNG 字节流
     */
    CharCardV2._canvasToPngBytes = function (canvas) {
        // 未提供 Canvas 时，创建一张纯色占位 Canvas
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 256;
            var ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = '#1a1a2e';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        }
        return new Promise(function (resolve, reject) {
            if (canvas.toBlob) {
                canvas.toBlob(function (blob) {
                    if (!blob) { reject(new Error('Canvas 转 PNG 失败')); return; }
                    CharCardV2._blobToUint8Array(blob).then(resolve, reject);
                }, 'image/png');
            } else if (canvas.toDataURL) {
                // 兼容旧浏览器：走 dataURL 路径
                try {
                    var dataURL = canvas.toDataURL('image/png');
                    var bytes = CharCardV2._dataURLToUint8Array(dataURL);
                    resolve(bytes);
                } catch (e) { reject(e); }
            } else {
                reject(new Error('当前 Canvas 不支持 toBlob/toDataURL'));
            }
        });
    };

    /**
     * 在 PNG 字节流中嵌入一个 tEXt chunk（紧随 IHDR 之后）。
     * @private
     * @param {Uint8Array} pngBytes 原始 PNG 字节
     * @param {string} keyword tEXt 关键字（如 "chara"）
     * @param {string} text 文本内容（会先 UTF-8 编码再 base64）
     * @returns {Uint8Array} 新的 PNG 字节流
     */
    CharCardV2._embedTextChunk = function (pngBytes, keyword, text) {
        var bytes = (pngBytes instanceof Uint8Array) ? pngBytes : new Uint8Array(pngBytes);
        // 校验 PNG 签名
        for (var i = 0; i < 8; i++) {
            if (bytes[i] !== PNG_SIGNATURE[i]) {
                throw new Error('无效的 PNG 文件签名');
            }
        }

        // 文本 -> UTF-8 字节 -> base64 字符串
        var utf8Bytes = new TextEncoder().encode(text);
        var b64 = CharCardV2._bytesToBase64(utf8Bytes);

        // chunk data = keyword + 0x00 + base64
        var keywordBytes = new TextEncoder().encode(keyword);
        var dataLen = keywordBytes.length + 1 + b64.length;
        var chunkData = new Uint8Array(dataLen);
        chunkData.set(keywordBytes, 0);
        chunkData[keywordBytes.length] = 0; // null terminator
        for (var j = 0; j < b64.length; j++) {
            chunkData[keywordBytes.length + 1 + j] = b64.charCodeAt(j);
        }

        var chunk = CharCardV2._buildPngChunk('tEXt', chunkData);

        // 插入位置：签名(8) + IHDR chunk(长度4 + 类型4 + 数据13 + CRC4 = 25) = 33
        var ihdrEnd = 8 + 4 + 4 + 13 + 4;
        var result = new Uint8Array(bytes.length + chunk.length);
        result.set(bytes.subarray(0, ihdrEnd), 0);
        result.set(chunk, ihdrEnd);
        result.set(bytes.subarray(ihdrEnd), ihdrEnd + chunk.length);
        return result;
    };

    /**
     * 从 PNG 字节流中提取指定 keyword 的 tEXt chunk 文本。
     * @private
     * @param {Uint8Array} pngBytes PNG 字节
     * @param {string} keyword 目标关键字（如 "chara"）
     * @returns {string|null} 解码后的文本（已从 base64 解回 UTF-8）；未命中返回 null
     */
    CharCardV2._extractTextChunk = function (pngBytes, keyword) {
        var bytes = (pngBytes instanceof Uint8Array) ? pngBytes : new Uint8Array(pngBytes);
        // 校验签名
        for (var i = 0; i < 8; i++) {
            if (bytes[i] !== PNG_SIGNATURE[i]) return null;
        }
        var offset = 8;
        while (offset + 8 <= bytes.length) {
            // 读取 4 字节长度（big-endian）
            var length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) |
                (bytes[offset + 2] << 8) | bytes[offset + 3];
            var type = String.fromCharCode(
                bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]
            );
            var dataStart = offset + 8;
            var dataEnd = dataStart + length;
            if (dataEnd + 4 > bytes.length) break; // 越界保护

            if (type === 'tEXt') {
                // 解析 keyword\0text
                var chunkData = bytes.subarray(dataStart, dataEnd);
                var nullIdx = -1;
                for (var k = 0; k < chunkData.length; k++) {
                    if (chunkData[k] === 0) { nullIdx = k; break; }
                }
                if (nullIdx > 0) {
                    var kw = new TextDecoder('ascii').decode(chunkData.subarray(0, nullIdx));
                    if (kw === keyword) {
                        var b64 = new TextDecoder('ascii').decode(chunkData.subarray(nullIdx + 1));
                        // base64 -> UTF-8 字节 -> 文本
                        var utf8Bytes = CharCardV2._base64ToBytes(b64);
                        return new TextDecoder('utf-8').decode(utf8Bytes);
                    }
                }
            }
            // 跳过当前 chunk（数据 + 4 字节 CRC）
            offset = dataEnd + 4;
            // IEND chunk 出现即停止
            if (type === 'IEND') break;
        }
        return null;
    };

    /**
     * 构造一个完整的 PNG chunk（长度 + 类型 + 数据 + CRC32）。
     * @private
     * @param {string} type 4 字符类型（如 "tEXt"）
     * @param {Uint8Array} data chunk 数据
     * @returns {Uint8Array}
     */
    CharCardV2._buildPngChunk = function (type, data) {
        var typeBytes = new Uint8Array(4);
        for (var i = 0; i < 4; i++) typeBytes[i] = type.charCodeAt(i);
        var length = data.length;

        // CRC32 覆盖 type + data
        var crcInput = new Uint8Array(4 + data.length);
        crcInput.set(typeBytes, 0);
        crcInput.set(data, 4);
        var crc = CharCardV2._crc32(crcInput);

        var chunk = new Uint8Array(4 + 4 + data.length + 4);
        // 长度（big-endian）
        chunk[0] = (length >>> 24) & 0xFF;
        chunk[1] = (length >>> 16) & 0xFF;
        chunk[2] = (length >>> 8) & 0xFF;
        chunk[3] = length & 0xFF;
        // 类型
        chunk.set(typeBytes, 4);
        // 数据
        chunk.set(data, 8);
        // CRC（big-endian）
        chunk[8 + data.length] = (crc >>> 24) & 0xFF;
        chunk[8 + data.length + 1] = (crc >>> 16) & 0xFF;
        chunk[8 + data.length + 2] = (crc >>> 8) & 0xFF;
        chunk[8 + data.length + 3] = crc & 0xFF;
        return chunk;
    };

    /**
     * 计算 CRC32（PNG 标准，多项式 0xEDB88320）。
     * @private
     * @param {Uint8Array} bytes
     * @returns {number} 无符号 32 位整数
     */
    CharCardV2._crc32 = function (bytes) {
        if (!_CRC32_TABLE) {
            var table = new Uint32Array(256);
            for (var n = 0; n < 256; n++) {
                var c = n;
                for (var k = 0; k < 8; k++) {
                    if (c & 1) c = 0xEDB88320 ^ (c >>> 1);
                    else c = c >>> 1;
                }
                table[n] = c;
            }
            _CRC32_TABLE = table;
        }
        var crc = 0xFFFFFFFF;
        for (var i = 0; i < bytes.length; i++) {
            crc = _CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    };

    // ------------------------------------------------------------
    // 输入解析与类型转换工具
    // ------------------------------------------------------------

    /**
     * 把多种输入类型统一解析为 V2 卡 JSON 对象。
     * @private
     * @param {*} input
     * @returns {Promise<object>}
     */
    CharCardV2._parseInputToCard = function (input) {
        if (input == null) return Promise.reject(new Error('输入为空'));

        // 已是对象：直接返回
        if (typeof input === 'object' && !CharCardV2._isBlob(input) && !(input instanceof ArrayBuffer) && !(input instanceof Uint8Array)) {
            return Promise.resolve(input);
        }

        // Blob：先读为 ArrayBuffer
        if (CharCardV2._isBlob(input)) {
            return CharCardV2._blobToArrayBuffer(input).then(function (buf) {
                return CharCardV2._parseInputToCard(buf);
            });
        }

        // ArrayBuffer / Uint8Array：可能是 PNG，也可能是原始 JSON 字节
        if (input instanceof ArrayBuffer || input instanceof Uint8Array) {
            var bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
            // 检查是否为 PNG
            if (bytes.length >= 8 && CharCardV2._isPngSignature(bytes)) {
                var json = CharCardV2._extractTextChunk(bytes, PNG_CHARA_KEYWORD);
                if (json) return Promise.resolve(JSON.parse(json));
                return Promise.reject(new Error('PNG 中未找到 chara tEXt chunk'));
            }
            // 否则按 UTF-8 JSON 文本处理
            try {
                var text = new TextDecoder('utf-8').decode(bytes);
                return Promise.resolve(JSON.parse(text));
            } catch (e) {
                return Promise.reject(new Error('无法解析二进制数据为 JSON: ' + e.message));
            }
        }

        // 字符串：可能是 JSON 文本，也可能是 Data URL
        if (typeof input === 'string') {
            var trimmed = input.trim();
            // Data URL: data:image/png;base64,xxxx
            if (trimmed.indexOf('data:image/png') === 0 || trimmed.indexOf('data:application/octet-stream;base64') === 0) {
                var bytes2 = CharCardV2._dataURLToUint8Array(trimmed);
                return CharCardV2._parseInputToCard(bytes2);
            }
            // 普通字符串：先尝试 JSON.parse
            try {
                return Promise.resolve(JSON.parse(trimmed));
            } catch (e) {
                // 失败时再尝试当作 base64 编码的 PNG
                try {
                    var pngBytes = CharCardV2._base64ToBytes(trimmed);
                    if (CharCardV2._isPngSignature(pngBytes)) {
                        return CharCardV2._parseInputToCard(pngBytes);
                    }
                } catch (e2) { /* 忽略，抛出原 JSON 错误 */ }
                return Promise.reject(new Error('字符串无法解析为 JSON 或 PNG: ' + e.message));
            }
        }

        return Promise.reject(new Error('不支持的数据类型: ' + typeof input));
    };

    /**
     * 判断字节数组前 8 字节是否为 PNG 签名。
     * @private
     * @param {Uint8Array} bytes
     * @returns {boolean}
     */
    CharCardV2._isPngSignature = function (bytes) {
        if (!bytes || bytes.length < 8) return false;
        for (var i = 0; i < 8; i++) {
            if (bytes[i] !== PNG_SIGNATURE[i]) return false;
        }
        return true;
    };

    /**
     * 判断对象是否为 Blob。
     * @private
     * @param {*} obj
     * @returns {boolean}
     */
    CharCardV2._isBlob = function (obj) {
        return typeof Blob !== 'undefined' && obj instanceof Blob;
    };

    /**
     * Blob -> ArrayBuffer
     * @private
     * @param {Blob} blob
     * @returns {Promise<ArrayBuffer>}
     */
    CharCardV2._blobToArrayBuffer = function (blob) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { reject(reader.error || new Error('读取 Blob 失败')); };
            reader.readAsArrayBuffer(blob);
        });
    };

    /**
     * Blob -> Uint8Array
     * @private
     * @param {Blob} blob
     * @returns {Promise<Uint8Array>}
     */
    CharCardV2._blobToUint8Array = function (blob) {
        return CharCardV2._blobToArrayBuffer(blob).then(function (buf) {
            return new Uint8Array(buf);
        });
    };

    /**
     * Data URL -> Uint8Array
     * @private
     * @param {string} dataURL
     * @returns {Uint8Array}
     */
    CharCardV2._dataURLToUint8Array = function (dataURL) {
        var commaIdx = dataURL.indexOf(',');
        var b64 = commaIdx >= 0 ? dataURL.slice(commaIdx + 1) : dataURL;
        return CharCardV2._base64ToBytes(b64);
    };

    /**
     * Uint8Array -> base64 字符串（分块避免栈溢出）。
     * @private
     * @param {Uint8Array} bytes
     * @returns {string}
     */
    CharCardV2._bytesToBase64 = function (bytes) {
        var binary = '';
        var chunkSize = 0x8000;
        for (var i = 0; i < bytes.length; i += chunkSize) {
            var slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
            binary += String.fromCharCode.apply(null, slice);
        }
        return (typeof btoa === 'function') ? btoa(binary) : CharCardV2._btoaPolyfill(binary);
    };

    /**
     * base64 字符串 -> Uint8Array
     * @private
     * @param {string} b64
     * @returns {Uint8Array}
     */
    CharCardV2._base64ToBytes = function (b64) {
        var binary = (typeof atob === 'function') ? atob(b64) : CharCardV2._atobPolyfill(b64);
        var len = binary.length;
        var bytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i) & 0xFF;
        }
        return bytes;
    };

    /**
     * btoa 兜底实现（环境无 btoa 时使用）。
     * @private
     * @param {string} binary
     * @returns {string}
     */
    CharCardV2._btoaPolyfill = function (binary) {
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        var output = '';
        for (var i = 0; i < binary.length; i += 3) {
            var b1 = binary.charCodeAt(i) & 0xFF;
            var b2 = i + 1 < binary.length ? (binary.charCodeAt(i + 1) & 0xFF) : -1;
            var b3 = i + 2 < binary.length ? (binary.charCodeAt(i + 2) & 0xFF) : -1;
            output += chars[b1 >> 2];
            output += chars[((b1 & 3) << 4) | (b2 >> 4)];
            output += (b2 === -1) ? '=' : chars[((b2 & 15) << 2) | (b3 >> 6)];
            output += (b3 === -1) ? '=' : chars[b3 & 63];
        }
        return output;
    };

    /**
     * atob 兜底实现（环境无 atob 时使用）。
     * @private
     * @param {string} b64
     * @returns {string}
     */
    CharCardV2._atobPolyfill = function (b64) {
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        var lookup = {};
        for (var i = 0; i < chars.length; i++) lookup[chars[i]] = i;
        // 去除非 base64 字符
        b64 = b64.replace(/[^A-Za-z0-9+/=]/g, '');
        var output = '';
        for (var j = 0; j < b64.length; j += 4) {
            var c1 = lookup[b64[j]] || 0;
            var c2 = lookup[b64[j + 1]] || 0;
            var c3 = lookup[b64[j + 2]] || 0;
            var c4 = lookup[b64[j + 3]] || 0;
            output += String.fromCharCode((c1 << 2) | (c2 >> 4));
            if (b64[j + 2] !== '=') output += String.fromCharCode(((c2 & 15) << 4) | (c3 >> 2));
            if (b64[j + 3] !== '=') output += String.fromCharCode(((c3 & 3) << 6) | c4);
        }
        return output;
    };

    // ------------------------------------------------------------
    // 世界书条目转换 / 工具
    // ------------------------------------------------------------

    /**
     * 把 character_book.entries 统一成数组形式（兼容对象/数组）。
     * @private
     * @param {object|Array} entries
     * @returns {Array}
     */
    CharCardV2._entriesToArray = function (entries) {
        if (!entries) return [];
        if (Array.isArray(entries)) return entries.slice();
        if (typeof entries === 'object') {
            return Object.keys(entries).map(function (k) {
                var e = entries[k];
                if (e && typeof e === 'object' && e.uid === undefined) {
                    // 注入 id 作为 uid 候选
                    e.uid = k;
                }
                return e;
            });
        }
        return [];
    };

    /**
     * WorldInfo.convertEntry 不可用时的兜底转换。
     * @private
     * @param {object} raw
     * @param {string} uid
     * @returns {object}
     */
    CharCardV2._fallbackConvertEntry = function (raw, uid) {
        if (!raw) return null;
        var ext = raw.extensions || raw.extension || {};
        function normalizeKeys(val) {
            if (Array.isArray(val)) return val;
            if (typeof val === 'string' && val.trim()) {
                return val.split(',').map(function (k) { return k.trim(); }).filter(Boolean);
            }
            return [];
        }
        return {
            uid: parseInt(uid, 10) || Date.now(),
            key: normalizeKeys(raw.key || raw.keys),
            keysecondary: normalizeKeys(raw.keysecondary || raw.secondary_keys),
            comment: raw.comment || raw.name || '',
            content: raw.content || '',
            constant: !!raw.constant,
            selective: !!raw.selective,
            enabled: raw.enabled !== false && raw.disable !== true && raw.disabled !== true,
            order: raw.order || raw.insertion_order || 100,
            position: typeof raw.position === 'number' ? raw.position : (typeof ext.position === 'number' ? ext.position : 0),
            depth: raw.depth || ext.depth || 4,
            probability: raw.probability !== undefined ? raw.probability : (ext.probability !== undefined ? ext.probability : 100),
            role: typeof raw.role === 'number' ? raw.role : 0,
            group: raw.group || ext.group || '',
            groupWeight: raw.groupWeight || raw.group_weight || ext.group_weight || 100,
            excludeRecursion: !!raw.excludeRecursion || !!raw.exclude_recursion || !!ext.exclude_recursion,
            preventRecursion: !!raw.preventRecursion || !!raw.prevent_recursion || !!ext.prevent_recursion,
            vectorized: !!raw.vectorized || !!ext.vectorized,
            addMemo: !!raw.addMemo,
            useProbability: raw.useProbability !== false,
            triggers: raw.triggers || ext.triggers || []
        };
    };

    // ------------------------------------------------------------
    // StateManager / 通用工具
    // ------------------------------------------------------------

    /**
     * 通过 StateManager 读取状态值（无则返回 undefined）。
     * @private
     * @param {string} path 点分路径
     * @returns {*}
     */
    CharCardV2._stateGet = function (path) {
        try {
            if (typeof window.StateManager !== 'undefined' && window.StateManager && typeof window.StateManager.get === 'function') {
                return window.StateManager.get(path);
            }
        } catch (e) { /* 静默降级 */ }
        return undefined;
    };

    /**
     * 通过 StateManager 写入状态值（无则静默跳过）。
     * @private
     * @param {string} path 点分路径
     * @param {*} value
     */
    CharCardV2._stateSet = function (path, value) {
        try {
            if (typeof window.StateManager !== 'undefined' && window.StateManager && typeof window.StateManager.set === 'function') {
                window.StateManager.set(path, value);
            }
        } catch (e) { /* 静默降级 */ }
    };

    /**
     * 安全字符串化：null/undefined -> 默认值。
     * @private
     * @param {*} v
     * @param {string} def
     * @returns {string}
     */
    CharCardV2._safeStr = function (v, def) {
        if (v === null || v === undefined) return def || '';
        return String(v);
    };

    // ------------------------------------------------------------
    // 暴露接口
    // ------------------------------------------------------------

    // 兼容 CommonJS（Node 环境/打包工具）
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = CharCardV2;
    }

    // 暴露到全局 window
    window.CharCardV2 = CharCardV2;

})(typeof window !== 'undefined' ? window : this);
