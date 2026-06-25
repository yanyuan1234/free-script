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
    // 【P0修复BUG-006】best-effort 模式：每个 mutator 独立 try-catch 隔离，
    // 单个 mutator 失败只跳过该步骤，不影响其他 mutator 已成功的状态变更。
    // 原实现将 13 个 mutator 串行调用在 StateManager.transaction 内，
    // 任一 mutator 抛错会冒泡到 transaction 的 catch，触发全量快照回滚，
    // 导致已成功写入的角色/物品/任务/时间等数据全部丢失（BUG-006 链式故障）。
    _applyAll(data, result, options) {
        const steps = [
            { name: 'storyAndTitle',    fn: () => this._applyStoryAndTitle(data) },
            { name: 'turn',             fn: () => this._applyTurn(data) },
            { name: 'player',           fn: () => this._applyPlayer(data) },
            { name: 'characters',       fn: () => this._applyCharacters(data) },
            { name: 'bag',              fn: () => this._applyBag(data) },
            { name: 'currency',         fn: () => this._applyCurrency(data) },
            { name: 'quests',           fn: () => this._applyQuests(data) },
            { name: 'gameTime',         fn: () => this._applyGameTime(data) },
            { name: 'locations',        fn: () => this._applyLocations(data) },
            { name: 'keyEvents',        fn: () => this._applyKeyEvents(data) },
            { name: 'relationships',    fn: () => this._applyRelationships(data) },
            { name: 'hud',              fn: () => this._applyHUD(data) },
            { name: 'contextSummary',   fn: () => this._applyContextSummary(data) },
            // 【P1修复BUG-010/011】在所有 mutator 后收割关键信息到 permanentFacts
            // 解决"学院名变化"和"角色描述矛盾"问题：AI 看不到上轮已确定的世界观，重新编造导致不一致
            { name: 'permanentFacts',   fn: () => this._applyPermanentFacts(data) }
        ];
        const failed = [];
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            try {
                step.fn();
            } catch (e) {
                failed.push(step.name);
                // best-effort：仅记录警告，不抛出，避免触发 StateManager.transaction 全量回滚
                console.warn('[AIResponseMutator] 步骤 "' + step.name + '" 失败，已跳过（best-effort）:', e && e.message ? e.message : e);
                if (result && Array.isArray(result.warnings)) {
                    result.warnings.push('mutator ' + step.name + ' failed: ' + (e && e.message ? e.message : String(e)));
                } else if (result) {
                    if (!Array.isArray(result.warnings)) result.warnings = [];
                    result.warnings.push('mutator ' + step.name + ' failed: ' + (e && e.message ? e.message : String(e)));
                }
            }
        }
        if (failed.length > 0) {
            console.warn('[AIResponseMutator] best-effort 完成，失败步骤:', failed.join(', '));
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
        const turn = parseInt(StateManager.get('progress.turn') || 0) || 0;
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
        const hasCurrency = (currency !== undefined && currency !== null && !isNaN(parseInt(currency)) && parseInt(currency) >= 0);
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
        if (story) {
            StateManager.set('progress.sceneTitle', title || StateManager.get('progress.sceneTitle') || '', { silent: true });
            StateManager.set('progress.lastSceneTitle', title || StateManager.get('progress.sceneTitle') || '', { silent: true });
        }
    },

    // 回合数推进
    // 【阶段2修复双倍递增】原 _applyTurn 会 +1，但 game.js:2099 的 legacy 路径也会 +1，
    // 激活 AIResponseMutator 后会导致每轮 +2。现移除 _applyTurn 的递增逻辑，
    // 回合数统一由 game.js legacy 路径（line 2099）唯一推进。
    _applyTurn(data) {
        // 仅同步 progress.turn 与 _stats.totalTurns 的镜像一致性，不递增
        const currentTurn = parseInt(StateManager.get('progress.turn') || 0) || 0;
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
        StateManager.setLegacy('playerData', normalized, { silent: true });
        // 同步到 playerName，确保全项目读取一致
        if (typeof gameState !== 'undefined') {
            gameState.playerName = normalized.name;
        }
    },

    // NPC / 角色
    _applyCharacters(data) {
        const characters = data.characters || data.npcs;
        if (!characters || !Array.isArray(characters) || characters.length === 0) return;
        if (typeof CharacterMutator !== 'undefined' && CharacterMutator.mergeCharacters) {
            CharacterMutator.mergeCharacters(characters, { silent: true });
        } else {
            StateManager.set('entities.characters', characters, { silent: true });
            StateManager.setLegacy('allCharacters', characters, { silent: true });
        }
    },

    // 物品
    _applyBag(data) {
        const bag = data.bag || data.items || data.inventory;
        if (!bag || !Array.isArray(bag) || bag.length === 0) return;
        if (typeof BagMutator !== 'undefined' && BagMutator.mergeItems) {
            BagMutator.mergeItems(bag, { silent: true });
        } else {
            StateManager.set('entities.bag', bag, { silent: true });
            StateManager.setLegacy('currentBag', bag, { silent: true });
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
        // 同步到旧字段，确保 phone-ui 等读取 gameState.currency 的模块一致
        if (typeof gameState !== 'undefined') {
            gameState.currency = num;
            if (data.currencyName) gameState.currencyName = String(data.currencyName);
        }
    },

    // 任务
    _applyQuests(data) {
        const quests = data.quests || data.missions || data.tasks;
        if (quests && Array.isArray(quests) && quests.length > 0) {
            if (typeof QuestMutator !== 'undefined' && QuestMutator.setQuests) {
                QuestMutator.setQuests(quests, { silent: true });
            } else {
                StateManager.set('entities.quests', quests, { silent: true });
                StateManager.setLegacy('currentQuests', quests, { silent: true });
            }
        }
        // 【修复任务进度】根据剧情文本自动推进任务进度
        const story = data.story || '';
        if (story && typeof QuestMutator !== 'undefined' && QuestMutator.autoAdvanceByStory) {
            QuestMutator.autoAdvanceByStory(story, { silent: true });
        }
    },

    // 游戏时间
    _applyGameTime(data) {
        const time = data.gameTime || data.time || {};
        if (!time || typeof time !== 'object') return;
        if (typeof TimeMutator !== 'undefined' && TimeMutator.setTime) {
            TimeMutator.setTime(time, { silent: true });
        } else {
            StateManager.set('time', time, { silent: true });
            StateManager.setLegacy('gameTime', time, { silent: true });
        }
    },

    // 地点
    _applyLocations(data) {
        const locations = data.locations || data.places;
        if (!locations || !Array.isArray(locations) || locations.length === 0) return;
        const normalized = locations.map(function(loc) {
            if (typeof loc === 'string') return { name: loc.trim(), desc: '' };
            return {
                name: String(loc.name || loc.title || '').trim(),
                desc: String(loc.desc || loc.description || '').trim()
            };
        }).filter(loc => loc.name && loc.name.length > 1 && !/^(阳光|依靠触觉|空气|风|雨|雪|味道|声音|感觉|情绪)$/.test(loc.name));
        if (normalized.length === 0) return;
        StateManager.set('entities.locations', normalized, { silent: true });
    },

    // 【P1修复BUG-010/011】收割关键世界观/角色信息到 permanentFacts
    // 解决问题：
    //   - BUG-010 学院名变化（"奥术学院" → "圣罗兰魔法学院"）：地名未持久化，AI 后续回合重新编造
    //   - BUG-011 角色描述矛盾（苏菲身份）：npcProfiles 收割时 alreadyExists 检查会跳过更新，
    //     导致初次描述永久固化，AI 后续给出的新信息无法反映到 prompt
    // 策略：
    //   1. 把 entities.locations 中所有地名收割到 permanentFacts.worldPlaces
    //   2. 把 entities.characters 中所有角色收割到 permanentFacts.npcProfiles
    //      - 新角色：追加（含 title/relation/desc）
    //      - 已存在角色：合并新信息到已有 content（不覆盖，追加 "；" 分隔）
    //   3. 主角身份同步到 permanentFacts.pcIdentity（仅当 player.identity 非空且与现有不同）
    _applyPermanentFacts(data) {
        if (typeof EnhancedMemory === 'undefined' || !EnhancedMemory.permanentFacts) return;
        const pf = EnhancedMemory.permanentFacts;
        const turn = (typeof StateManager !== 'undefined' && StateManager.get)
            ? (parseInt(StateManager.get('progress.turn') || 0) || 0)
            : 0;

        // === 1. 地名 → permanentFacts.worldPlaces ===
        const locations = (typeof StateManager !== 'undefined' && StateManager.get)
            ? StateManager.get('entities.locations')
            : null;
        if (Array.isArray(locations) && locations.length > 0) {
            if (!pf.worldPlaces) pf.worldPlaces = [];
            locations.forEach(function(loc) {
                if (!loc || !loc.name) return;
                const name = String(loc.name).trim();
                const desc = String(loc.desc || loc.description || '').trim();
                if (name.length < 2) return;
                // 跳过明显非地名（情绪/感觉词）
                if (/^(阳光|依靠触觉|空气|风|雨|雪|味道|声音|感觉|情绪)$/.test(name)) return;
                const content = desc ? (name + '：' + desc) : name;
                // 去重：同地名（content 以 name 开头）只保留一条，desc 更新时合并
                const idx = pf.worldPlaces.findIndex(function(a) {
                    return a && a.content && (a.content === name || a.content.indexOf(name + '：') === 0 || a.content === content);
                });
                if (idx === -1) {
                    pf.worldPlaces.push({
                        content: content,
                        locked: false,
                        source: 'runtime',
                        createdTurn: turn
                    });
                } else if (desc && pf.worldPlaces[idx].content.indexOf(name + '：') !== 0) {
                    // 旧条目只有名字，补充描述
                    pf.worldPlaces[idx].content = content;
                }
            });
        }

        // === 2. 角色 → permanentFacts.npcProfiles（含已有角色信息合并）===
        const characters = (typeof StateManager !== 'undefined' && StateManager.get)
            ? StateManager.get('entities.characters')
            : null;
        if (Array.isArray(characters) && characters.length > 0) {
            if (!pf.npcProfiles) pf.npcProfiles = [];
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
                // 查找已存在的同名档案
                const idx = pf.npcProfiles.findIndex(function(a) {
                    return a && a.content && a.content.split('：')[0] === name;
                });
                if (idx === -1) {
                    // 新角色：追加
                    pf.npcProfiles.push({
                        content: content,
                        locked: false,
                        source: 'runtime',
                        createdTurn: turn,
                        keywords: [name]
                    });
                } else {
                    // 已存在：合并新信息（仅追加旧档案中没有的字段，避免无限膨胀）
                    const oldContent = pf.npcProfiles[idx].content;
                    const oldParts = oldContent.split('：');
                    let changed = false;
                    const merged = oldParts.slice();
                    parts.forEach(function(p, i) {
                        if (i === 0) return; // 跳过名字
                        if (p && oldParts.indexOf(p) === -1) {
                            merged.push(p);
                            changed = true;
                        }
                    });
                    if (changed) {
                        pf.npcProfiles[idx].content = merged.join('：');
                    }
                }
            });
        }

        // === 3. 主角身份 → permanentFacts.pcIdentity（仅当 player.identity 非空且变化时）===
        const player = (typeof StateManager !== 'undefined' && StateManager.get)
            ? StateManager.get('entities.player')
            : null;
        if (player && player.identity) {
            const newIdentity = String(player.identity).trim();
            if (newIdentity) {
                if (!Array.isArray(pf.pcIdentity)) pf.pcIdentity = [];
                const existing = pf.pcIdentity[0];
                if (!existing || String(existing.content || '').trim() !== newIdentity) {
                    pf.pcIdentity = [{
                        content: newIdentity,
                        locked: true,
                        source: 'aiResponse',
                        createdTurn: turn
                    }];
                }
            }
        }
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
                if (ev.importance) importance = parseInt(ev.importance) || 5;
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

    // 关系变化（简化合并到角色）
    // 【修复BUG-019】原逻辑仅处理 {name,delta} 好感度增量格式，但 prompt 要求 AI 返回
    // {from,to,type,desc} 关系图谱格式。AI 按 prompt 返回时全部被 if(!r.name) 跳过丢弃。
    // 现同时支持两种：{name,delta}→好感度增量；{from,to,type,desc}→写入双方 relations 元数据。
    _applyRelationships(data) {
        const relationships = data.relationships || data.relations;
        if (!relationships || !Array.isArray(relationships) || relationships.length === 0) return;
        var self = this;
        relationships.forEach(function(r) {
            if (!r) return;
            // 格式1：{from,to,type,desc} 关系图谱
            if (r.from && r.to) {
                self._applyGraphRelation(r);
                return;
            }
            // 格式2：{name,delta} 好感度增量
            if (!r.name) return;
            if (typeof CharacterMutator !== 'undefined' && CharacterMutator.updateRelationship) {
                CharacterMutator.updateRelationship(r.name, parseInt(r.delta || r.change || r.favor || 0) || 0, { silent: true });
            } else {
                const list = StateManager.get('entities.characters') || [];
                const updated = list.map(function(c) {
                    if (c.name !== r.name) return c;
                    const clone = StateSchema.deepClone ? StateSchema.deepClone(c) : Object.assign({}, c);
                    // 【修复 P1】双写 favorability（权威字段）和 favor（兼容镜像），
                    // 与 CharacterMutator.updateRelationship 保持一致，避免 UI 读 favorability 时拿不到更新
                    var delta = parseInt(r.delta || r.change || r.favor || 0) || 0;
                    clone.favorability = (clone.favorability !== undefined ? clone.favorability : (clone.favor || 0)) + delta;
                    clone.favor = clone.favorability;
                    return clone;
                });
                StateManager.set('entities.characters', updated, { silent: true });
            }
        });
    },

    // 写入 {from,to,type,desc} 关系到双方角色的 relations 数组（去重）
    _applyGraphRelation(r) {
        const list = StateManager.get('entities.characters') || [];
        // 【v2审查修复】先规范化 type，保证去重和推入使用相同值
        // 原实现：filter 检查 x.type === type（可能为空），push 用 type || '相识'
        // → 空type时去重查空，推入'相识'，下次空type不再去重，'相识'重复累积
        var rawType = String(r.type || '').trim();
        var type = rawType || '相识';
        var desc = String(r.desc || '').trim();
        if (!rawType && !desc) return;
        const updated = list.map(function(c) {
            if (c.name !== r.from && c.name !== r.to) return c;
            const clone = StateSchema.deepClone ? StateSchema.deepClone(c) : Object.assign({}, c);
            if (!Array.isArray(clone.relations)) clone.relations = [];
            const other = (c.name === r.from) ? r.to : r.from;
            // 去重：同对方同类型只保留一条（用规范化后的 type）
            clone.relations = clone.relations.filter(function(x) { return !(x && x.to === other && x.type === type); });
            clone.relations.push({ to: other, type: type, desc: desc });
            return clone;
        });
        StateManager.set('entities.characters', updated, { silent: true });
    },

    // HUD 信息
    _applyHUD(data) {
        const hud = data.hud || data.status || {};
        if (!hud || typeof hud !== 'object') return;
        StateManager.set('ui.lastHUD', hud, { silent: true });
        StateManager.setLegacy('_lastHUD', hud, { silent: true });
    },

    // 上下文摘要
    _applyContextSummary(data) {
        const summary = data.contextSummary || data.summary || '';
        if (!summary) return;
        StateManager.set('progress.rollingSummary', summary, { silent: true });
        StateManager.setLegacy('rollingSummary', summary, { silent: true });
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
            'ui.lastHUD',
            'progress.rollingSummary'
        ];
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = AIResponseMutator;
