// ========================================
// 角色卡导出器 - CharacterCardExporter
// 导出 SillyTavern 兼容的角色卡（JSON v2/v3 + PNG tEXt chunk）
//
// 格式参考：
// - v2: https://github.com/malfoyslastname/character-card-spec-v2
// - v3: https://github.com/malfoyslastname/character-card-spec-v3
// - PNG: 在 tEXt chunk 写入 keyword="chara" value=base64(JSON)
//
// 数据来源：
// - gameState.playerData（主角，作为 player 角色卡）
// - gameState.allCharacters（NPC，作为 character 角色卡）
// - gameState.worldSnapshot（世界设定，作为 scenario 补充）
// ========================================
var CharacterCardExporter = {

    // 导出当前主角为角色卡 JSON（v2 规范）
    // 适合分享给 SillyTavern/RisuAI 用户作为 {{user}} 使用
    exportPlayerAsV2() {
        var pd = (typeof StateManager !== 'undefined' && StateManager.get)
            ? (StateManager.get('entities.player') || {})
            : ((typeof gameState !== 'undefined' && gameState.playerData) || {});
        // 统一安全访问 gameState，避免未定义时 ReferenceError
        var gs = (typeof gameState !== 'undefined') ? gameState : null;
        var name = pd.name || (gs && gs.playerName) || '玩家';
        return {
            spec: 'chara_card_v2',
            spec_version: '2.0',
            data: {
                name: name,
                description: pd.identity || pd.description || '',
                personality: (pd.stats && pd.stats.length)
                    ? pd.stats.map(function(s) { return s.name + ': ' + (s.value || s.level || 0); }).join(', ')
                    : '',
                scenario: this._buildScenario(),
                first_mes: '',
                mes_example: '',
                creator_notes: '由 Free-Script 导出',
                system_prompt: (gs && gs.userPrompt) || '',
                post_history_instructions: (gs && gs.authorsNote) || '',
                tags: ['free-script', 'player'],
                creator: 'Free-Script',
                character_version: '1.0',
                alternate_greetings: [],
                extensions: {
                    depth_prompt: {
                        prompt: (gs && gs.authorsNote) || '',
                        depth: (gs && gs.authorsNoteDepth) || 0,
                        role: 'system'
                    },
                    talkativeness: '0.5'
                }
            }
        };
    },

    // 导出指定 NPC 为角色卡 JSON（v2 规范）
    // charName: NPC 名称（gameState.allCharacters 中的 key）
    exportCharacterAsV2(charName) {
        var chars = (typeof StateManager !== 'undefined' && StateManager.get)
            ? (StateManager.get('entities.characters') || [])
            : ((typeof gameState !== 'undefined' && gameState.allCharacters) ? Object.values(gameState.allCharacters) : []);
        var target = null;
        for (var i = 0; i < chars.length; i++) {
            if (chars[i] && chars[i].name === charName) {
                target = chars[i];
                break;
            }
        }
        if (!target) {
            console.warn('[CharacterCardExporter] 未找到角色:', charName);
            return null;
        }
        return {
            spec: 'chara_card_v2',
            spec_version: '2.0',
            data: {
                name: target.name || '未命名角色',
                description: target.description || target.identity || '',
                personality: this._buildPersonality(target),
                scenario: this._buildScenario(),
                first_mes: target.firstMessage || target.greeting || '',
                mes_example: target.dialogueExample || '',
                creator_notes: target.notes || '由 Free-Script 导出',
                system_prompt: '',
                post_history_instructions: '',
                tags: ['free-script', 'npc', target.role || 'character'].filter(Boolean),
                creator: 'Free-Script',
                character_version: String(target.version || '1.0'),
                alternate_greetings: target.alternateGreetings || [],
                extensions: {
                    talkativeness: String(target.talkativeness || '0.5')
                }
            }
        };
    },

    // 导出 v3 规范（含 character_book 嵌入世界书）
    exportAsV3(charName) {
        var card = charName ? this.exportCharacterAsV2(charName) : this.exportPlayerAsV2();
        if (!card) return null;
        card.spec = 'chara_card_v3';
        card.spec_version = '3.0';
        // v3 新增字段
        card.data.character_book = this._exportWorldInfoAsBook();
        card.data.nickname = '';
        card.data.creator_notes_multilingual = {
            'zh-CN': card.data.creator_notes
        };
        card.data.source = 'free-script';
        card.data.group_only_greetings = [];
        card.data.creation_date = Date.now();
        card.data.modification_date = Date.now();
        return card;
    },

    // 把角色卡 JSON 嵌入 PNG 文件（生成带 chara tEXt chunk 的 PNG Blob）
    // pngArrayBuffer: 原始 PNG 文件的 ArrayBuffer（作为底图）
    // cardJson: 角色卡 JSON 对象
    // 返回: Blob（PNG 格式，可下载）
    async embedCardIntoPng(pngArrayBuffer, cardJson) {
        var bytes = new Uint8Array(pngArrayBuffer);
        // 验证 PNG 签名
        var sig = [137, 80, 78, 71, 13, 10, 26, 10];
        for (var i = 0; i < 8; i++) {
            if (bytes[i] !== sig[i]) throw new Error('无效的 PNG 文件');
        }
        // 构造 chara tEXt chunk
        var jsonStr = JSON.stringify(cardJson);
        // UTF-8 编码后 base64
        var utf8Bytes = new TextEncoder().encode(jsonStr);
        var b64 = this._bytesToBase64(utf8Bytes);
        var keyword = 'chara';
        // chunk data = keyword + \0 + base64
        var chunkData = new Uint8Array(keyword.length + 1 + b64.length);
        for (var j = 0; j < keyword.length; j++) chunkData[j] = keyword.charCodeAt(j);
        chunkData[keyword.length] = 0;  // null terminator
        for (var k = 0; k < b64.length; k++) chunkData[keyword.length + 1 + k] = b64.charCodeAt(k);

        var chunk = this._buildPngChunk('tEXt', chunkData);

        // 重组 PNG：签名 + IHDR 后插入 tEXt + 剩余 chunks
        // 找到 IHDR chunk 结束位置（签名8 + 长度4 + 类型4 + IHDR数据13 + CRC4 = 33）
        var ihdrEnd = 8 + 4 + 4 + 13 + 4;  // = 33
        var result = new Uint8Array(bytes.length + chunk.length);
        result.set(bytes.subarray(0, ihdrEnd), 0);
        result.set(chunk, ihdrEnd);
        result.set(bytes.subarray(ihdrEnd), ihdrEnd + chunk.length);

        return new Blob([result], { type: 'image/png' });
    },

    // 触发文件下载
    downloadBlob(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename || 'character.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    },

    // 导出 JSON 文件并下载
    downloadJson(cardJson, filename) {
        var jsonStr = JSON.stringify(cardJson, null, 2);
        var blob = new Blob([jsonStr], { type: 'application/json' });
        this.downloadBlob(blob, filename || (cardJson.data.name + '.json'));
    },

    // ---- 内部工具方法 ----

    // 构造 PNG chunk（长度 + 类型 + 数据 + CRC32）
    _buildPngChunk(type, data) {
        var typeBytes = new Uint8Array(4);
        for (var i = 0; i < 4; i++) typeBytes[i] = type.charCodeAt(i);
        var length = data.length;
        var lengthBytes = new Uint8Array(4);
        lengthBytes[0] = (length >>> 24) & 0xFF;
        lengthBytes[1] = (length >>> 16) & 0xFF;
        lengthBytes[2] = (length >>> 8) & 0xFF;
        lengthBytes[3] = length & 0xFF;
        // CRC32 计算（覆盖 type + data）
        var crcInput = new Uint8Array(4 + data.length);
        crcInput.set(typeBytes, 0);
        crcInput.set(data, 4);
        var crc = this._crc32(crcInput);
        var crcBytes = new Uint8Array(4);
        crcBytes[0] = (crc >>> 24) & 0xFF;
        crcBytes[1] = (crc >>> 16) & 0xFF;
        crcBytes[2] = (crc >>> 8) & 0xFF;
        crcBytes[3] = crc & 0xFF;
        // 拼接：长度 + 类型 + 数据 + CRC
        var chunk = new Uint8Array(4 + 4 + data.length + 4);
        chunk.set(lengthBytes, 0);
        chunk.set(typeBytes, 4);
        chunk.set(data, 8);
        chunk.set(crcBytes, 8 + data.length);
        return chunk;
    },

    // CRC32 计算（PNG 标准）
    _crc32(bytes) {
        var table = this._CRC32_TABLE;
        if (!table) {
            table = new Uint32Array(256);
            for (var n = 0; n < 256; n++) {
                var c = n;
                for (var k = 0; k < 8; k++) {
                    if (c & 1) c = 0xEDB88320 ^ (c >>> 1);
                    else c = c >>> 1;
                }
                table[n] = c;
            }
            this._CRC32_TABLE = table;
        }
        var crc = 0xFFFFFFFF;
        for (var i = 0; i < bytes.length; i++) {
            crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    },

    // Uint8Array -> base64 字符串（不依赖 atob/btoa 的 Unicode 问题）
    _bytesToBase64(bytes) {
        var binary = '';
        var chunkSize = 0x8000;  // 避免栈溢出
        for (var i = 0; i < bytes.length; i += chunkSize) {
            var slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
            binary += String.fromCharCode.apply(null, slice);
        }
        return btoa(binary);
    },

    // 构造 personality 字段（从角色属性推导）
    _buildPersonality(char) {
        if (!char) return '';
        var parts = [];
        if (char.personality) parts.push(char.personality);
        if (char.role) parts.push('角色: ' + char.role);
        if (char.stats && char.stats.length) {
            parts.push('属性: ' + char.stats.map(function(s) {
                return s.name + '(' + (s.value || s.level || 0) + ')';
            }).join(', '));
        }
        if (char.relationship) parts.push('关系: ' + char.relationship);
        return parts.join('\n');
    },

    // 构造 scenario 字段（从世界设定推导）
    _buildScenario() {
        if (typeof gameState === 'undefined' || !gameState) return '';
        var parts = [];
        if (gameState.theme) parts.push('主题: ' + gameState.theme);
        if (gameState.genre) parts.push('类型: ' + gameState.genre);
        if (gameState.userPrompt) parts.push('世界设定: ' + gameState.userPrompt);
        if (gameState.setupText) parts.push('开场设定: ' + gameState.setupText);
        return parts.join('\n');
    },

    // 导出世界书为 character_book 格式（SillyTavern V2 兼容）
    _exportWorldInfoAsBook() {
        if (typeof WorldInfo === 'undefined' || !WorldInfo.books) return { entries: [] };
        var book = { entries: {} };
        try {
            var books = WorldInfo.books;
            for (var bookName in books) {
                var entries = books[bookName].entries || {};
                for (var entryId in entries) {
                    var e = entries[entryId];
                    book.entries[entryId] = {
                        keys: e.keys || e.keywords || [],
                        content: e.content || '',
                        extensions: {
                            position: e.position || 0,
                            exclude_recursion: e.excludeRecursion || false,
                            deploy_time: e.deployTime || '',
                            probability: e.probability || 100,
                            depth: e.depth || 4,
                            selective: e.selective || false,
                            group: e.group || '',
                            group_weight: e.groupWeight || 0,
                            order: e.order || 100,
                            group_whitelist: [],
                            use_regex: false
                        },
                        comment: e.comment || e.name || '',
                        constant: e.constant || false,
                        vectorized: false,
                        name: e.name || ''
                    };
                }
                break;  // 只导出第一本书
            }
        } catch (e) {
            console.warn('[CharacterCardExporter] 导出世界书失败:', e);
        }
        return book;
    }
};

if (typeof window !== 'undefined') window.CharacterCardExporter = CharacterCardExporter;
if (typeof module !== 'undefined' && module.exports) module.exports = CharacterCardExporter;
