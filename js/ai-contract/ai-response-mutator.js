// ========================================
// AI 响应变更器
// 将 ResponseParser 解析结果写入 StateManager
// ========================================
const AIResponseMutator = {
    // 应用解析结果到状态
    apply(parsed, options) {
        options = options || {};
        if (!parsed || !parsed.success) {
            console.warn('[AIResponseMutator] 解析未成功，跳过状态写入');
            return { success: false, changes: [] };
        }
        const data = parsed.data || {};
        var self = this;
        const result = { success: true, changes: [] };

        try {
            if (typeof StateManager !== 'undefined' && StateManager.transaction) {
                StateManager.transaction(function() {
                    self._applyAll(data, result, options);
                });
            } else {
                self._applyAll(data, result, options);
            }
        } catch (e) {
            console.error('[AIResponseMutator] 应用状态失败:', e);
            result.success = false;
            result.error = e.message;
        }

        return result;
    },

    // 统一写入所有字段
    // 【P1修复BUG-011-transaction回滚】删除 per-step try-catch (best-effort)，让异常向上抛
    // 触发 apply() 外层 StateManager.transaction 的快照回滚。
    //
    // 设计权衡：
    // - 旧 best-effort（P0 修复 BUG-006 时引入）让单 mutator 失败只跳过该步骤，
    //   避免全量回滚导致所有数据丢失。但副作用是 transaction 回滚机制被永久架空：
    //   apply 内部永不抛异常 → apply() 的 try-catch 永远走 success 分支，
    //   即使 90% 的 mutator 失败也返回 success: true。
    // - 现恢复"全有或全无"语义：任一 mutator 抛错 → transaction 回滚到 apply 前快照 →
    //   apply() 返回 { success: false } → 调用方（game.js:1731-1742）走 deleteLastTurn
    //   兜底路径，本轮 AI 输出整体被拒绝，玩家可重新生成。
    // - 此为更严格的契约：要么全部写入成功，要么全部回滚，避免"半写入"状态污染 StateManager。
    _applyAll(data, result, options) {
        const steps = [
            { name: 'storyAndTitle',    fn: () => this._applyStoryAndTitle(data) },
            { name: 'turn',             fn: () => this._applyTurn(data) },
            { name: 'player',           fn: () => this._applyPlayer(data) },
            { name: 'characters',       fn: () => this._applyCharacters(data) },
            { name: 'bag',              fn: () => this._applyBag(data) },
            { name: 'currency',         fn: () => this._applyCurrency(data) },
            { name: 'quests',           fn: () => this._applyQuests(data) },
            // 【P0修复BUG-006】移除 gameTime 步骤：原 _applyGameTime 调用 TimeMutator.setTime，
            // 而 game.js:1930 的 GameTimeSystem.parseFromAI 也会调用 setTime，导致同一份数据写入两次。
            // 现统一由 GameTimeSystem.parseFromAI 作为时间写入的唯一入口（含 story 兜底提取 + 默认时间），
            // 该方法在 AIResponseMutator.apply 之后执行，覆盖 data.gameTime 与纯文本两种场景。
            { name: 'locations',        fn: () => this._applyLocations(data) },
            { name: 'keyEvents',        fn: () => this._applyKeyEvents(data) },
            { name: 'relationships',    fn: () => this._applyRelationships(data) },
            { name: 'hud',              fn: () => this._applyHUD(data) },
            { name: 'contextSummary',   fn: () => this._applyContextSummary(data) },
            // 【P1修复BUG-010/011】在所有 mutator 后收割关键信息到 permanentFacts
            // 解决"学院名变化"和"角色描述矛盾"问题：AI 看不到上轮已确定的世界观，重新编造导致不一致
            { name: 'permanentFacts',   fn: () => this._applyPermanentFacts(data) }
        ];
        // 串行执行所有 mutator，任一抛错即冒泡到 apply() 的 try-catch（被 StateManager.transaction 包裹）
        // → transaction 回滚 → apply 返回 { success: false, error }
        for (let i = 0; i < steps.length; i++) {
            steps[i].fn();
        }
        // 【P2修复BUG-008】数据持久化校验：每回合结束后验证关键数据完整性
        // 解决问题：BUG-006 全量回滚后所有结构化数据丢失，UI 显示"0角色/0物品/0任务"
        // 策略：检测关键字段为零或缺失时发出控制台警告，便于排查链式故障
        try {
            this._validatePersistence(data, result);
        } catch (e) {
            console.warn('[AIResponseMutator] 数据持久化校验本身失败:', e && e.message ? e.message : e);
        }
        result.changes = this._collectChanges();
    },

    // 【P2修复BUG-008】数据持久化校验
    // 每回合结束后检查关键数据完整性，缺失时发出控制台警告
    // 校验项：主角身份/属性、角色列表、货币/物品、任务列表
    // 仅警告，不强制修复（修复由各 mutator 的 best-effort 处理）
    _validatePersistence(data, result) {
        if (typeof StateManager === 'undefined' || !StateManager.get) return;
        const turn = StateManager.get('progress.turn') || 0;
        // 初始回合（turn 0）数据可能尚未建立，仅在 turn >= 1 时严格校验
        const strictMode = turn >= 1;
        const warnings = [];

        // 1. 主角身份：turn >= 1 时应有 identity
        const player = StateManager.get('entities.player') || {};
        const playerIdentity = String(player.identity || '').trim();
        if (strictMode && !playerIdentity) {
            warnings.push('主角身份为空（identity 缺失），个人页将显示"身份待定"');
        }
        // 2. 主角属性：turn >= 1 时 stats 应非空
        const playerStats = Array.isArray(player.stats) ? player.stats : [];
        if (strictMode && playerStats.length === 0) {
            warnings.push('主角属性为空（stats 缺失），个人页将显示"属性将由AI动态生成"');
        }

        // 3. 角色列表：turn >= 2 时应至少有 1 个 NPC
        const characters = StateManager.get('entities.characters');
        const charCount = Array.isArray(characters) ? characters.length : 0;
        if (turn >= 2 && charCount === 0) {
            warnings.push('角色列表为空（0 NPC），人际页将显示"暂无角色"');
        }

        // 4. 货币与物品：turn >= 2 时应至少有货币或物品
        const currency = StateManager.get('entities.currency');
        const bag = StateManager.get('entities.bag');
        const bagCount = Array.isArray(bag) ? bag.length : 0;
        const hasCurrency = (currency != null && !isNaN(currency) && currency >= 0);
        if (turn >= 2 && !hasCurrency && bagCount === 0) {
            warnings.push('货币与物品均为空，背包页将显示"背包空空如也"');
        }

        // 5. 任务列表：turn >= 2 时应至少有 1 个任务
        const quests = StateManager.get('entities.quests');
        const questCount = Array.isArray(quests) ? quests.length : 0;
        if (turn >= 2 && questCount === 0) {
            warnings.push('任务列表为空（0 quests），任务页仅显示默认任务');
        }

        // 输出汇总警告
        if (warnings.length > 0) {
            const msg = '[数据持久化校验] turn=' + turn + ' 检测到 ' + warnings.length + ' 项数据缺失：\n  - ' + warnings.join('\n  - ');
            console.warn(msg);
            if (result) {
                if (!Array.isArray(result.warnings)) result.warnings = [];
                result.warnings.push.apply(result.warnings, warnings);
            }
        } else if (strictMode) {
            console.log('[数据持久化校验] turn=' + turn + ' 关键数据完整性检查通过');
        }
    },

    // 剧情与标题
    _applyStoryAndTitle(data) {
        const story = OutputSanitizer ? OutputSanitizer.sanitizeStory(data.story || '') : (data.story || '');
        const title = String(data.title || data.sceneTitle || data.chapterTitle || '').trim();
        if (story && title) {
            // 【P0-2.7 阶段3-3】场景标题 3 套归 1：拆分语义
            //   - progress.sceneTitle  = 当前场景（GameMemory context / UI 显示）
            //   - progress.lastSceneTitle = 上一场景（AI 防回退时读的"上次标题"）
            // 新标题来时：把旧的 sceneTitle 移到 lastSceneTitle，再写新的 sceneTitle
            // 这样 lastSceneTitle 才是真正的"上一场景"，避免双写同值
            const oldTitle = StateManager.get('progress.sceneTitle') || '';
            if (oldTitle && oldTitle !== title) {
                StateManager.set('progress.lastSceneTitle', oldTitle, { silent: true });
            } else if (!StateManager.get('progress.lastSceneTitle')) {
                StateManager.set('progress.lastSceneTitle', title, { silent: true });
            }
            StateManager.set('progress.sceneTitle', title, { silent: true });
        }
    },

    // 回合数推进
    // 【阶段2修复双倍递增】原 _applyTurn 会 +1，但 game.js:2099 的 legacy 路径也会 +1，
    // 激活 AIResponseMutator 后会导致每轮 +2。现移除 _applyTurn 的递增逻辑，
    // 回合数统一由 game.js legacy 路径（line 2099）唯一推进。
    _applyTurn(data) {
        // 仅同步 progress.turn 与 _stats.totalTurns 的镜像一致性，不递增
        const currentTurn = StateManager.get('progress.turn') || 0;
        StateManager.setLegacy('_stats.totalTurns', currentTurn, { silent: true });
    },

    // 主角信息
    _applyPlayer(data) {
        const player = data.player || data.protagonist || data.hero;
        // 【修复BUG-003】AI 返回纯文本时，AIOutputSchema.normalize 会填充默认 player
        // { name: '', identity: '', stats: [] }，此处若不拦截会用空 stats 覆盖已有属性，
        // 导致个人页属性消失。判定为"空 player"（无 name 且无 identity 且 stats 为空数组）时直接跳过。
        const _isEmptyPlayer = function(p) {
            if (!p || typeof p !== 'object') return true;
            const hasName = String(p.name || '').trim();
            const hasIdentity = String(p.identity || '').trim();
            const hasStats = Array.isArray(p.stats) ? p.stats.length > 0 : !!p.stats;
            const hasOther = p.title || p.personality || p.level !== undefined || p.exp !== undefined;
            return !hasName && !hasIdentity && !hasStats && !hasOther;
        };
        if (_isEmptyPlayer(player)) return;
        const current = StateManager.get('entities.player') || {};
        // 玩家设定的主角名优先级最高，禁止 AI 覆盖
        let lockedName = current.name || '';
        if (!lockedName && typeof gameState !== 'undefined') {
            lockedName = gameState.playerName || (gameState.playerData && gameState.playerData.name) || '';
        }
        const aiName = String(player.name || '').trim();
        // 【v2审查修复】仅在已有锁定名且 AI 尝试覆盖时才警告
        // 原实现 lockedName 为空时也警告"已拦截"，但实际接受了 AI 名（误导性日志）
        if (aiName && lockedName && aiName !== lockedName) {
            console.warn('[AIResponseMutator] AI 尝试覆盖主角名 "' + lockedName + '" 为 "' + aiName + '"，已拦截');
        }
        const normalized = {
            name: lockedName || aiName || '主角',
            identity: String(player.identity || current.identity || '').trim(),
            // 【修复BUG-003】仅在 AI 返回了非空 stats 数组时才覆盖，否则保留上一轮属性，
            // 避免 AI 返回空 stats（或默认空数组）清空已生成的属性
            stats: (Array.isArray(player.stats) && player.stats.length > 0) ? player.stats : (current.stats || []),
            // 【修复 P1】保留 current 上的 level/exp/title/personality，避免被 AI 返回的 3 字段覆盖丢失
            level: player.level !== undefined ? player.level : current.level,
            exp: player.exp !== undefined ? player.exp : current.exp,
            title: player.title !== undefined ? player.title : current.title,
            personality: player.personality !== undefined ? player.personality : current.personality
        };
        StateManager.set('entities.player', normalized, { silent: true });
        // 【P0修复BUG-011】移除冗余 setLegacy('playerData')：set('entities.player') 已触发
        // _syncLegacyMirror 自动同步到 gameState.playerData，无需二次写入。
        // 同步到 playerName，确保全项目读取一致
        if (typeof gameState !== 'undefined') {
            gameState.playerName = normalized.name;
        }
    },

    // NPC / 角色
    // 【P0-6修复】补齐主角过滤逻辑，使 _applyCharacters 成为 legacy mergeCharacters 的完整替代
    // 原 legacy mergeCharacters (game.js:3361) 会过滤主角（按名匹配，避免 AI 误返回主角时将其作为 NPC 加入），
    // _applyCharacters 缺失此过滤，导致 _aiMutatorApplied=true 跳过 legacy 时主角可能被误加入 entities.characters
    _applyCharacters(data) {
        const characters = data.characters || data.npcs;
        if (!characters || !Array.isArray(characters) || characters.length === 0) return;
        // 主角名（与 legacy mergeCharacters 一致的取值优先级）
        var playerName = '';
        if (typeof StateManager !== 'undefined' && StateManager.get) {
            var player = StateManager.get('entities.player');
            if (player && player.name) playerName = player.name;
        } else if (typeof gameState !== 'undefined') {
            playerName = (gameState.playerData && gameState.playerData.name) || gameState.playerName || '';
        }
        // 过滤主角 + 无效名（与 legacy mergeCharacters 完全一致）
        var filtered = characters.filter(function(c) {
            if (!c || !c.name || typeof c.name !== 'string') return false;
            var name = c.name.trim();
            if (!name || name.toLowerCase() === 'undefined' || name.toLowerCase() === 'null') return false;
            if (playerName && (name === playerName || name.includes(playerName) || playerName.includes(name))) return false;
            return true;
        });
        if (filtered.length === 0) return;
        if (typeof CharacterMutator !== 'undefined' && CharacterMutator.mergeCharacters) {
            CharacterMutator.mergeCharacters(filtered, { silent: true });
        } else {
            // 【P0修复BUG-011】移除冗余 setLegacy('allCharacters')：set('entities.characters')
            // 已触发 _syncLegacyMirror（含数组→对象转换）同步到 gameState.allCharacters
            StateManager.set('entities.characters', filtered, { silent: true });
        }
    },

    // 物品
    _applyBag(data) {
        const bag = data.bag || data.items || data.inventory;
        if (!bag || !Array.isArray(bag) || bag.length === 0) return;
        if (typeof BagMutator !== 'undefined' && BagMutator.mergeItems) {
            BagMutator.mergeItems(bag, { silent: true });
        } else {
            // 【P0修复BUG-011】移除冗余 setLegacy('currentBag')：set('entities.bag') 已触发镜像
            StateManager.set('entities.bag', bag, { silent: true });
        }
    },

    // 货币
    _applyCurrency(data) {
        if (data.currency === undefined && data.money === undefined && data.gold === undefined) return;
        const currency = data.currency !== undefined ? data.currency : (data.money !== undefined ? data.money : data.gold);
        const num = parseInt(currency);
        if (isNaN(num)) return;
        StateManager.set('entities.currency', num, { silent: true });
        if (data.currencyName) {
            StateManager.set('entities.currencyName', String(data.currencyName), { silent: true });
        }
        // 【P0修复BUG-011】移除冗余手动写 gameState.currency/currencyName：
        // set('entities.currency'/'entities.currencyName') 已触发 _syncLegacyMirror 同步
    },

    // 任务
    _applyQuests(data) {
        const quests = data.quests || data.missions || data.tasks;
        if (quests && Array.isArray(quests) && quests.length > 0) {
            if (typeof QuestMutator !== 'undefined' && QuestMutator.setQuests) {
                QuestMutator.setQuests(quests, { silent: true });
            } else {
                // 【P0修复BUG-011】移除冗余 setLegacy('currentQuests')：set('entities.quests') 已触发镜像
                StateManager.set('entities.quests', quests, { silent: true });
            }
        }
        // 【修复任务进度】根据剧情文本自动推进任务进度
        const story = data.story || '';
        if (story && typeof QuestMutator !== 'undefined' && QuestMutator.autoAdvanceByStory) {
            QuestMutator.autoAdvanceByStory(story, { silent: true });
        }
    },

    // 游戏时间
    // 【P0修复BUG-006】_applyGameTime 已删除：与 GameTimeSystem.parseFromAI 重复调用 setTime。
    // 时间写入统一收敛到 GameTimeSystem.parseFromAI（game.js:1930），该方法包含完整的
    // 解析链路：data.gameTime → story 兜底提取 → 默认时间，调用 setTime 仅一次。
    // _syncLegacyMirror 自动将 StateManager.time 镜像到 gameState.gameTime，无需此处重复写入。

    // 地点
    // 【P0-6修复】合并两个来源的地名，使 _applyLocations 成为 legacy 文本提取路径的完整替代
    // 原实现仅处理 data.locations（AI 显式返回），文本提取（_extractLocations）在 game.js legacy
    // 路径（line 1858-1863）单独写入且用 REPLACE 语义覆盖 _applyLocations 的结果，导致：
    //   1. AI 显式返回的地名可能被文本提取的覆盖（数据丢失）
    //   2. 两个写入路径都不在 transaction 内（_applyLocations 在 transaction，legacy 不在）
    // 现统一在 _applyLocations 内合并两个来源（MERGE 语义：按 name 匹配，存在则更新 desc，新名追加），
    // legacy 路径在 _aiMutatorApplied=true 时跳过文本提取，避免双写。
    _applyLocations(data) {
        const aiLocations = data.locations || data.places;
        // 来源 1：AI 显式返回
        const fromAI = (Array.isArray(aiLocations) && aiLocations.length > 0) ? aiLocations : [];
        // 来源 2：从 title + story 文本提取（兜底，AI 可能未在 JSON 中列出但剧情中提到）
        var fromText = [];
        var storyText = String(data.story || '') + ' ' + String(data.title || data.sceneTitle || data.chapterTitle || '');
        if (storyText.trim() && typeof _extractLocations === 'function') {
            try {
                fromText = _extractLocations(storyText) || [];
            } catch (e) {
                console.warn('[AIResponseMutator] _extractLocations 失败:', e && e.message);
            }
        }
        // 合并两个来源并归一化
        var allLocations = fromAI.concat(fromText);
        if (allLocations.length === 0) return;
        const normalized = allLocations.map(function(loc) {
            if (typeof loc === 'string') return { name: loc.trim(), desc: '' };
            return {
                name: String(loc.name || loc.title || '').trim(),
                desc: String(loc.desc || loc.description || '').trim()
            };
        }).filter(loc => loc.name && loc.name.length > 1 && !/^(阳光|依靠触觉|空气|风|雨|雪|味道|声音|感觉|情绪)$/.test(loc.name));
        if (normalized.length === 0) return;
        // 合并到现有列表（MERGE 语义：按 name 匹配，存在则更新 desc，新名追加）
        var existing = (typeof StateManager !== 'undefined' && StateManager.get) ? StateManager.get('entities.locations') : null;
        if (!Array.isArray(existing)) existing = [];
        var nameToIdx = {};
        existing.forEach(function(l, i) { if (l && l.name) nameToIdx[l.name] = i; });
        var changed = false;
        normalized.forEach(function(loc) {
            if (nameToIdx.hasOwnProperty(loc.name)) {
                // 更新现有：新 desc 优先，新 desc 为空则保留旧 desc
                var idx = nameToIdx[loc.name];
                var old = existing[idx];
                var newDesc = loc.desc || old.desc || '';
                if (old.desc !== newDesc || old.name !== loc.name) {
                    existing[idx] = { name: loc.name, desc: newDesc };
                    changed = true;
                }
            } else {
                existing.push(loc);
                nameToIdx[loc.name] = existing.length - 1;
                changed = true;
            }
        });
        if (changed) {
            StateManager.set('entities.locations', existing, { silent: true });
        }
    },

    // 【P1修复BUG-010/011】收割关键世界观/角色信息到 permanentFacts
    // 解决问题：
    //   - BUG-010 学院名变化（"奥术学院" → "圣罗兰魔法学院"）：地名未持久化，AI 后续回合重新编造
    //   - BUG-011 角色描述矛盾（苏菲身份）：npcProfiles 收割时 alreadyExists 检查会跳过更新，
    //     导致初次描述永久固化，AI 后续给出的新信息无法反映到 prompt
    // 策略：
    //   1. 把 entities.locations 中所有地名收割到 permanentFacts.worldPlaces（合并语义：新信息追加）
    //   2. 把 entities.characters 中所有角色收割到 permanentFacts.npcProfiles（合并语义：新信息追加）
    //   3. 主角身份同步到 permanentFacts.pcIdentity（替换语义：最新值覆盖）
    // 【P1修复P1-H】不再直接读写 EnhancedMemory.permanentFacts，统一走公共 API：
    //   - worldPlaces/npcProfiles → EnhancedMemory.upsertPermanentFact(category, fact)
    //   - pcIdentity              → EnhancedMemory.setPermanentFact(category, fact)
    // 公共 API 内部统一处理：去重、合并、字段标准化、_ltmDirty 缓存失效。
    _applyPermanentFacts(data) {
        if (typeof EnhancedMemory === 'undefined' || typeof EnhancedMemory.upsertPermanentFact !== 'function') {
            return;
        }
        const turn = (typeof StateManager !== 'undefined' && StateManager.get)
            ? (StateManager.get('progress.turn') || 0)
            : 0;

        // === 1. 地名 → permanentFacts.worldPlaces（合并语义）===
        const locations = (typeof StateManager !== 'undefined' && StateManager.get)
            ? StateManager.get('entities.locations')
            : null;
        if (Array.isArray(locations) && locations.length > 0) {
            locations.forEach(function(loc) {
                if (!loc || !loc.name) return;
                const name = String(loc.name).trim();
                const desc = String(loc.desc || loc.description || '').trim();
                if (name.length < 2) return;
                // 跳过明显非地名（情绪/感觉词）
                if (/^(阳光|依靠触觉|空气|风|雨|雪|味道|声音|感觉|情绪)$/.test(name)) return;
                const content = desc ? (name + '：' + desc) : name;
                EnhancedMemory.upsertPermanentFact('worldPlaces', {
                    content: content,
                    locked: false,
                    source: 'runtime',
                    createdTurn: turn
                });
            });
        }

        // === 2. 角色 → permanentFacts.npcProfiles（合并语义：追加新字段不覆盖）===
        const characters = (typeof StateManager !== 'undefined' && StateManager.get)
            ? StateManager.get('entities.characters')
            : null;
        if (Array.isArray(characters) && characters.length > 0) {
            characters.forEach(function(c) {
                if (!c || !c.name) return;
                const name = String(c.name).trim();
                // 构造档案行：名字 + 身份/关系 + 描述
                const parts = [name];
                const title = String(c.title || c.identity || c.role || '').trim();
                const relation = String(c.relation || '').trim();
                const desc = String(c.desc || c.description || '').trim();
                if (title) parts.push(title);
                if (relation && relation !== title) parts.push(relation);
                if (desc) parts.push(desc);
                const content = parts.join('：');
                EnhancedMemory.upsertPermanentFact('npcProfiles', {
                    content: content,
                    locked: false,
                    source: 'runtime',
                    createdTurn: turn,
                    keywords: [name]
                });
            });
        }

        // === 3. 主角身份 → permanentFacts.pcIdentity（替换语义：最新值覆盖）===
        const player = (typeof StateManager !== 'undefined' && StateManager.get)
            ? StateManager.get('entities.player')
            : null;
        if (player && player.identity) {
            const newIdentity = String(player.identity).trim();
            if (newIdentity) {
                EnhancedMemory.setPermanentFact('pcIdentity', {
                    content: newIdentity,
                    locked: true,
                    source: 'aiResponse',
                    createdTurn: turn
                });
            }
        }
        // 兜底：永久事实区可能因内部早返回未置 dirty，这里强制失效一次 longTermMemory 缓存
        if (typeof EnhancedMemory !== 'undefined') EnhancedMemory._ltmDirty = true;
    },

    // 关键事件
    // 【阶段1-A2】事件统一入口：通过 gm.addImportantEvents 批量写入
    // gm.events 是单一权威源，addImportantEvents 内部处理：
    //   1. 去重（同 content 不重复添加）
    //   2. 修剪（_pruneImportantEvents 保留 50 条）
    //   3. 同步（_syncEventsToKeyEvents → StateManager.entities.events 对象数组 + gameState.keyEvents 字符串数组）
    //   4. 持久化（saveToStorage）
    // schema: [{content, turn, gameTime, importance, decayScore}]
    _applyKeyEvents(data) {
        const events = data.keyEvents || data.events || data.plotEvents;
        if (!events || !Array.isArray(events) || events.length === 0) return;
        const turn = (StateManager.get && StateManager.get('progress.turn')) || 0;
        // 获取当前游戏时间用于事件归档
        var gameTimeStr = '';
        try {
            var gt = StateManager.get('time');
            if (gt) gameTimeStr = (gt.date || '') + ' ' + (gt.time || '') + (gt.period ? ' ' + gt.period : '');
        } catch (e) { /* ignore */ }

        // 归一化：把字符串/对象统一转为 {content, turn, gameTime, importance, decayScore}
        const normalized = events.map(function(ev) {
            var content = '';
            var importance = 5;
            if (typeof ev === 'string') {
                content = ev.trim();
            } else if (ev && typeof ev === 'object') {
                content = String(ev.title || ev.name || ev.content || ev.event || ev.desc || ev.description || '').trim();
                if (ev.importance) importance = safeInt(ev.importance, 5);
            } else {
                content = String(ev || '').trim();
            }
            if (!content) return null;
            return {
                content: content,
                turn: turn,
                gameTime: gameTimeStr.trim(),
                importance: Math.max(1, Math.min(10, importance)),
                decayScore: importance
            };
        }).filter(function(e) { return e !== null; });

        if (normalized.length === 0) return;

        // 【阶段1-A2】统一通过 gm.addImportantEvents 写入（去重 + 修剪 + 同步 + 持久化）
        var gm = (typeof window !== 'undefined') ? window.GameMemory : null;
        if (gm && typeof gm.addImportantEvents === 'function') {
            gm.addImportantEvents(normalized);
        } else {
            // 兜底：gm 不可用时直接写 StateManager（对象数组）
            var existing = StateManager.get('entities.events') || [];
            if (!Array.isArray(existing)) existing = [];
            var existingContents = {};
            existing.forEach(function(e) {
                if (e && e.content) existingContents[e.content] = true;
            });
            var toAdd = normalized.filter(function(e) { return !existingContents[e.content]; });
            if (toAdd.length === 0) return;
            var merged = existing.concat(toAdd);
            if (merged.length > 50) {
                merged.sort(function(a, b) { return (b.importance || 5) - (a.importance || 5); });
                merged = merged.slice(0, 50);
            }
            StateManager.set('entities.events', merged, { silent: true });
        }
    },

    // 关系变化：统一处理图谱格式 {from,to,type,desc} 与好感度格式 {name,delta}
    // 【P0-6修复】原 _applyRelationships 仅处理 {name,delta}（好感度），
    // {from,to,type,desc}（图谱）由 systems.js mergeRelationships 在 legacy 路径处理。
    // 这导致 legacy 路径必须保留 mergeRelationships 调用，造成：
    //   1. 与 AIResponseMutator 事务边界分离（mergeRelationships 不在 transaction 内，无法回滚）
    //   2. 与 _applyRelationships 双实现（P1-1）
    //   3. _aiMutatorApplied=true 跳过 legacy 时图谱数据丢失（_applyRelationships 跳过，legacy 也不调）
    // 现统一收敛：_applyRelationships 处理两种格式 + 兜底推断，legacy 路径仅做 UI 渲染（renderRelationships）。
    //   - 图谱格式：合并到 StateManager.entities.relationships（max 10）+ 推送 gm.tables.relationships
    //   - 好感度格式：CharacterMutator.updateRelationship + 转为图谱条目供 UI 展示
    //   - data.relationships 为空时：从 entities.characters 自动推断基础关系网（替代 _inferRelationshipsFromCharacters）
    // 调用方负责：在 _aiMutatorApplied=true 时跳过 mergeRelationships + _inferRelationshipsFromCharacters，
    //            仅触发 renderRelationships。
    _applyRelationships(data) {
        var relationships = data.relationships || data.relations;
        // 兜底：AI 没返回 relationships 时，从已有角色推断基础关系网
        // 原 _inferRelationshipsFromCharacters (systems.js:893) 在 legacy 路径调用，
        // 现统一收敛到 mutator 层，保证事务一致性 + 避免 legacy 双写
        if (!relationships || !Array.isArray(relationships) || relationships.length === 0) {
            relationships = this._inferRelationshipsFromCharacters();
        }
        if (!relationships || !Array.isArray(relationships) || relationships.length === 0) return;

        // 玩家名（用于 {name,delta} → 图谱条目转换）
        var playerName = '主角';
        if (typeof StateManager !== 'undefined' && StateManager.get) {
            var player = StateManager.get('entities.player');
            if (player && player.name) playerName = player.name;
        } else if (typeof gameState !== 'undefined') {
            playerName = (gameState.playerData && gameState.playerData.name) || gameState.playerName || '主角';
        }

        // 1. 分类收集：图谱条目 + 好感度更新
        var graphEntries = [];
        var favorabilityUpdates = [];
        relationships.forEach(function(r) {
            if (!r) return;
            if (r.from && r.to) {
                // 图谱格式 {from,to,type,desc}
                graphEntries.push({
                    from: String(r.from).trim(),
                    to: String(r.to).trim(),
                    type: String(r.type || '中立').trim() || '中立',
                    desc: String(r.desc || '').trim()
                });
            } else if (r.name) {
                // 好感度格式 {name,delta}：转为图谱条目 + 收集 delta
                var delta = safeInt(r.delta || r.change || r.favor || 0, 0);
                favorabilityUpdates.push({ name: String(r.name).trim(), delta: delta });
                graphEntries.push({
                    from: playerName,
                    to: String(r.name).trim(),
                    type: String(r.type || '相识').trim() || '相识',
                    desc: String(r.desc || '').trim() || (delta > 0 ? '好感+' + delta : (delta < 0 ? '好感' + delta : '关系稳定'))
                });
            }
        });

        // 2. 应用好感度更新（CharacterMutator，transaction-safe，可回滚）
        // 【P1修复BUG-4.7】好感度更新的唯一入口，避免 mergeRelationships 重复叠加 delta
        favorabilityUpdates.forEach(function(upd) {
            if (typeof CharacterMutator !== 'undefined' && CharacterMutator.updateRelationship) {
                CharacterMutator.updateRelationship(upd.name, upd.delta, { silent: true });
            } else {
                // 兜底：直接操作 entities.characters（与原 _applyRelationships 一致）
                const list = StateManager.get('entities.characters') || [];
                const updated = list.map(function(c) {
                    if (c.name !== upd.name) return c;
                    const clone = StateSchema.deepClone(c);
                    // 双写 favorability（权威字段）和 favor（兼容镜像），
                    // 与 CharacterMutator.updateRelationship 保持一致
                    clone.favorability = (clone.favorability !== undefined ? clone.favorability : (clone.favor || 0)) + upd.delta;
                    clone.favor = clone.favorability;
                    return clone;
                });
                StateManager.set('entities.characters', updated, { silent: true });
            }
        });

        // 3. 合并图谱条目到 StateManager.entities.relationships（max 10）
        // _syncLegacyMirror 自动同步到 gameState.relationships（供 renderRelationships 读取）
        if (graphEntries.length > 0 && typeof StateManager !== 'undefined' && StateManager.get && StateManager.set) {
            var existing = StateManager.get('entities.relationships') || [];
            if (!Array.isArray(existing)) existing = [];
            // 合并：相同 from↔to 对（双向算同一对）更新，新对追加
            graphEntries.forEach(function(nr) {
                var existIdx = -1;
                for (var i = 0; i < existing.length; i++) {
                    var er = existing[i];
                    if ((er.from === nr.from && er.to === nr.to) || (er.from === nr.to && er.to === nr.from)) {
                        existIdx = i;
                        break;
                    }
                }
                if (existIdx !== -1) {
                    existing[existIdx] = nr;
                } else {
                    existing.push(nr);
                }
            });
            // 上限 10 条（保留最近），与 legacy mergeRelationships 一致
            if (existing.length > 10) existing = existing.slice(-10);
            StateManager.set('entities.relationships', existing, { silent: true });

            // 4. 推送到 gm.tables.relationships（供 MemoryManagerUI + 存档读取）
            // _syncLegacyMirror 已将 entities.relationships 同步到 gameState.relationships，
            // _pushRelationshipsToGM 从 gameState.relationships 推送到 gm.tables.relationships
            if (typeof _pushRelationshipsToGM === 'function') {
                try { _pushRelationshipsToGM(); } catch (e) {
                    console.warn('[AIResponseMutator] _pushRelationshipsToGM 失败:', e && e.message);
                }
            } else if (typeof window !== 'undefined' && window.GameMemory && window.GameMemory.tables) {
                // 兜底：直接推送（与 core.js _pushRelationshipsToGM 逻辑一致）
                if (!window.GameMemory.tables.relationships) window.GameMemory.tables.relationships = {};
                existing.forEach(function(r) {
                    if (!r || !r.from || !r.to) return;
                    var key = r.from + '->' + r.to;
                    if (window.GameMemory.tables.relationships[key]) {
                        Object.assign(window.GameMemory.tables.relationships[key], r);
                    } else {
                        window.GameMemory.tables.relationships[key] = Object.assign({}, r);
                    }
                });
            }
        }
    },

    // 【P0-6修复】从已有角色推断基础关系网（替代 systems.js _inferRelationshipsFromCharacters）
    // 当 AI 没返回 relationships 但返回了角色时，自动生成 玩家→NPC 的基础关系条目
    // 原 systems.js:893 在 legacy 路径调用（写状态），现收敛到 mutator 层（事务内）
    _inferRelationshipsFromCharacters() {
        if (typeof StateManager === 'undefined' || !StateManager.get) return [];
        var playerName = '';
        var player = StateManager.get('entities.player');
        if (player && player.name) playerName = player.name;
        else if (typeof gameState !== 'undefined') {
            playerName = (gameState.playerData && gameState.playerData.name) || gameState.playerName || '主角';
        } else {
            playerName = '主角';
        }
        var chars = StateManager.get('entities.characters');
        if (!Array.isArray(chars)) return [];
        var inferred = [];
        chars.forEach(function(c) {
            if (!c || !c.name || c.name === playerName) return;
            var relType = (c.relation && String(c.relation).trim()) || '相识';
            inferred.push({
                from: playerName,
                to: c.name,
                type: relType,
                desc: (c.title ? c.title + '。' : '') + (c.desc || '')
            });
        });
        return inferred;
    },

    // HUD 信息
    _applyHUD(data) {
        const hud = data.hud || data.status || {};
        if (!hud || typeof hud !== 'object') return;
        // 【P0修复BUG-011】移除冗余 setLegacy('_lastHUD')：set('ui.lastHUD') 已触发镜像
        StateManager.set('ui.lastHUD', hud, { silent: true });
    },

    // 上下文摘要
    _applyContextSummary(data) {
        const summary = data.contextSummary || data.summary || '';
        if (!summary) return;
        // 【P0修复BUG-011】移除冗余 setLegacy('rollingSummary')：set('progress.rollingSummary') 已触发镜像
        StateManager.set('progress.rollingSummary', summary, { silent: true });
    },

    // 收集变更路径（用于测试/调试）
    _collectChanges() {
        return [
            'progress.turn',
            'progress.sceneTitle',
            'progress.lastSceneTitle',
            'entities.player',
            'entities.characters',
            'entities.bag',
            'entities.currency',
            'entities.quests',
            'time',
            'entities.locations',
            'entities.events',
            // 【P0-6修复】_applyRelationships 现统一处理图谱 + 好感度格式，写入 entities.relationships
            'entities.relationships',
            'ui.lastHUD',
            'progress.rollingSummary'
        ];
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = AIResponseMutator;
