// ========================================
// 角色变更器 - CharacterMutator
// ========================================
const CharacterMutator = {

    // AIResponseMutator._applyCharacters 的重复实现（两处 filter 逻辑完全一致）
    // 过滤规则：name 非空字符串 → 排除 undefined/null → 排除主角（含子串互含匹配）
    filterOutPlayer(chars) {
        if (!chars || !Array.isArray(chars)) return [];
        // 主角名取值优先级（与 legacy mergeCharacters 一致）
        var playerName = '';
        if (typeof StateManager !== 'undefined' && StateManager.get) {
            var player = StateManager.get('entities.player');
            if (player && player.name) playerName = player.name;
        } else if (typeof gameState !== 'undefined') {
            playerName = (gameState.playerData && gameState.playerData.name) || gameState.playerName || '';
        }
        return chars.filter(function(c) {
            if (!c || !c.name || typeof c.name !== 'string') return false;
            var name = c.name.trim();
            if (!name || name.toLowerCase() === 'undefined' || name.toLowerCase() === 'null') return false;
            if (playerName && (name === playerName || name.includes(playerName) || playerName.includes(name))) return false;
            return true;
        });
    },

    // 设置角色列表
    setCharacters(characters, options) {

        const arr = Array.isArray(characters) ? characters : (characters ? [characters] : []);
        const normalized = arr.map(this.normalizeCharacter.bind(this)).filter(Boolean);
        // 【数据断层修复】只写新路径，StateManager._syncLegacyMirror 自动同步到 allCharacters
        return StateManager.set('entities.characters', normalized, options);
    },

    // 合并角色：同名更新，新名追加

    // 通过描述重叠识别为同一角色并合并，避免人际关系/聊天/排行榜出现重复条目。
    mergeCharacters(characters, options) {
        var self = this;

        // 1. characters 可能是单个对象或非数组，强制转为数组
        // 2. StateManager.get 返回值可能不是数组（脏数据），用 Array.isArray 兜底
        const inputList = Array.isArray(characters) ? characters : (characters ? [characters] : []);
        const list = (function() {
            const v = StateManager.get('entities.characters');
            return Array.isArray(v) ? v : [];
        })();
        inputList.forEach(function(raw) {
            const normalized = self.normalizeCharacter(raw);
            if (!normalized) return;
            // 1. 精确名称匹配（含括号清理）
            const cleanName = self._cleanName(normalized.name);
            const idx = list.findIndex((c) => c && self._cleanName(c.name) === cleanName);
            if (idx >= 0) {
                // 原版行为：AI 是权威，直接覆盖好感度（允许降低）
                // 新版 Math.max 拒绝降好感度，导致剧情冲突时（如玩家激怒NPC）好感度不降
                var merged = Object.assign({}, list[idx], normalized);
                // 【P1修复】如果 normalized.desc 为空但已有描述非空，保留已有描述
                if (!merged.desc && list[idx].desc) {
                    merged.desc = list[idx].desc;
                }
                // 【P1修复】同样保护 appearance/personality/background 等扩展字段
                if (!merged.appearance && list[idx].appearance) merged.appearance = list[idx].appearance;
                if (!merged.personality && list[idx].personality) merged.personality = list[idx].personality;
                if (!merged.background && list[idx].background) merged.background = list[idx].background;
                // 【通用去重】合并同名角色时，优先保留较短的名字
                var _prevN = String(list[idx].name || '');
                var _newN = String(normalized.name || '');
                if (_prevN && _newN && _prevN.length < _newN.length) {
                    merged.name = _prevN;
                }
                if (typeof normalized.favorability === 'number') {
                    merged.favorability = normalized.favorability;
                    merged.favor = normalized.favorability;
                }
                list[idx] = merged;
                return;
            }
            // 2. 【修复BUG-005】模糊匹配：通过描述重叠识别同一角色的不同名称
            const fuzzyIdx = self._findFuzzyMatch(list, normalized);
            if (fuzzyIdx >= 0) {
                console.log('[CharacterMutator] 模糊匹配命中："' + list[fuzzyIdx].name + '" → "' + normalized.name + '"，合并为同一角色');
                const merged = Object.assign({}, list[fuzzyIdx], normalized);
                // 【P1修复】保护 desc/appearance/personality/background 不被空值覆盖
                if (!merged.desc && list[fuzzyIdx].desc) merged.desc = list[fuzzyIdx].desc;
                if (!merged.appearance && list[fuzzyIdx].appearance) merged.appearance = list[fuzzyIdx].appearance;
                if (!merged.personality && list[fuzzyIdx].personality) merged.personality = list[fuzzyIdx].personality;
                if (!merged.background && list[fuzzyIdx].background) merged.background = list[fuzzyIdx].background;
                // 【通用去重】合并时优先保留较短的名字
                var _prevN2 = String(list[fuzzyIdx].name || '');
                var _newN2 = String(normalized.name || '');
                if (_prevN2 && _newN2 && _prevN2.length < _newN2.length) {
                    merged.name = _prevN2;
                }
                // 原版行为：好感度直接覆盖，允许降低
                if (typeof normalized.favorability === 'number') {
                    merged.favorability = normalized.favorability;
                    merged.favor = normalized.favorability;
                }
                list[fuzzyIdx] = merged;
                return;
            }
            // 3. 新角色追加
            list.push(normalized);
        });
        return this.setCharacters(list, options);
    },

    // 清理角色名（去括号备注、去首尾空格）
    _cleanName(name) {
        if (!name) return '';
        return String(name).replace(/[（(].*?[）)]/g, '').trim();
    },


    // 策略：新角色的 desc 包含现有角色名（或反之），且匹配片段≥3字，视为同一角色
    _findFuzzyMatch(list, newChar) {
        if (!list || list.length === 0 || !newChar) return -1;
        const newName = this._cleanName(newChar.name) || '';
        const newDesc = String(newChar.desc || newChar.description || '').trim();
        if (!newName) return -1;
        for (let i = 0; i < list.length; i++) {
            const existing = list[i];
            if (!existing || !existing.name) continue;
            const existName = this._cleanName(existing.name) || '';
            const existDesc = String(existing.desc || existing.description || '').trim();
            if (!existName || existName === newName) continue;
            // 策略A：新角色 desc 包含现有角色名（如 desc="穿着补丁长袍的女孩" 含 "补丁长袍女孩"）
            if (existName.length >= 3 && newDesc.includes(existName)) {
                return i;
            }
            // 策略B：现有角色 desc 包含新角色名（如旧 desc="自称为莉莉安" 含 "莉莉安"）
            if (newName.length >= 3 && existDesc.includes(newName)) {
                return i;
            }
            // 策略C：名称互为子串（如"莉莉安"含于"莉莉安·月影"）
            if (newName.length >= 2 && existName.length >= 2 &&
                (existName.includes(newName) || newName.includes(existName))) {
                return i;
            }
        }
        return -1;
    },

    // 更新角色关系
    updateRelationship(name, delta, options) {
        return this.updateCharacter(name, function(character) {
            const newFav = (character.favorability || character.favor || 0) + (delta || 0);
            character.favorability = newFav;
            character.favor = newFav;  // 兼容旧字段
            return character;
        }, options);
    },

    // 通用更新
    updateCharacter(name, updater, options) {
        const characters = StateManager.get('entities.characters') || [];
        const updated = characters.map(function(c) {
            if (c.name === name) {
                const clone = StateSchema.deepClone(c);
                return updater(clone) || clone;
            }
            return c;
        });
        return this.setCharacters(updated, options);
    },


    // name: 旧角色名（用于查找），newChar: 完整角色对象（替换后）
    replaceCharacter(name, newChar, options) {
        const normalized = this.normalizeCharacter(newChar);
        if (!normalized) return false;
        const characters = StateManager.get('entities.characters') || [];
        // 若新名与旧名不同，先按旧名删，再追加新名
        let updated;
        if (name && name !== normalized.name) {
            updated = characters.filter(function(c) { return c.name !== name; });
            // 【v3审查修复】旧名数据合并到新角色（保留累积数据）
            // 原实现只保留 favorability，丢失 relation/stats/tags/notes/desc/title/identity/id
            // 等全部累积字段，与同名分支（Object.assign({}, c, normalized)）行为严重不一致
            const old = characters.find(function(c) { return c.name === name; });
            if (old) {
                normalized = Object.assign({}, old, normalized);
                normalized.favorability = normalized.favorability || old.favorability || 0;
                normalized.favor = normalized.favorability;
            }
            updated.push(normalized);
        } else {
            updated = characters.map(function(c) {
                return c.name === normalized.name ? Object.assign({}, c, normalized) : c;
            });
        }
        return this.setCharacters(updated, options);
    },


    removeCharacter(name, options) {
        if (!name) return false;
        const characters = StateManager.get('entities.characters') || [];
        const filtered = characters.filter(function(c) { return c.name !== name; });
        if (filtered.length === characters.length) return false; // 未找到
        return this.setCharacters(filtered, options);
    },


    getCharacter(name) {
        const characters = StateManager.get('entities.characters') || [];
        return characters.find(function(c) { return c.name === name; }) || null;
    },

    // 标准化角色

    // - name 为身份字段
    // - 保留 GameMemory 运行时字段（mood/location/outfit/status/history/gameTime/
    //   accessCount/lastChangedTurn/locked），避免 mutator 回写时丢失这些累积状态
    normalizeCharacter(raw) {
        if (!raw) return null;
        let name = String(raw.name || raw.title || raw.character || '').trim();
        if (!name) return null;
        // 【字段名修复】AI prompt 与 phone-ui.js 全部使用 favorability/title/relation，
        // 但旧代码 normalize 成 favor/identity，导致 UI 读不到好感度/身份/关系。
        // 现统一保留 AI 返回的字段名，同时兼容旧 favor/friendship 输入。
        const favorability = parseInt(
            raw.favorability !== undefined ? raw.favorability :
            (raw.favor !== undefined ? raw.favor :
            (raw.friendship !== undefined ? raw.friendship :
            (raw.relationship !== undefined ? raw.relationship : 0))), 10) || 0;

        // 【阶段3】Mufy 风格角色 schema：兼容对象型 identity（surface/hidden）
        var rawIdentity = raw.identity;
        var identitySurface = '';
        var identityHidden = '';
        if (rawIdentity && typeof rawIdentity === 'object') {
            identitySurface = String(rawIdentity.surface || rawIdentity.public || '').trim();
            identityHidden = String(rawIdentity.hidden || rawIdentity.private || '').trim();
        } else {
            identitySurface = String(rawIdentity || raw.role || raw.title || '').trim();
        }
        var identity = identitySurface || identityHidden || raw.role || raw.title || '';

        return {
            id: raw.id || ('char_' + name + '_' + Date.now()),
            name: name,
            title: raw.title || identitySurface || raw.role || '',
            identity: identity,
            identitySurface: identitySurface,
            identityHidden: identityHidden,
            relation: raw.relation || '',
            favorability: favorability,
            favor: favorability,  // 兼容旧代码读 c.favor
            desc: raw.desc || raw.description || '',
            tags: Array.isArray(raw.tags) ? raw.tags : [],
            stats: this.normalizeStats(raw.stats),
            notes: raw.notes || '',

            // Mufy 风格扩展字段
            appearance: raw.appearance || '',
            personality: raw.personality || '',
            background: raw.background || '',
            speechHabits: raw.speechHabits || '',
            sampleDialogues: Array.isArray(raw.sampleDialogues) ? raw.sampleDialogues : [],
            emotionalTriggers: Array.isArray(raw.emotionalTriggers) ? raw.emotionalTriggers : [],
            attitudeToUser: raw.attitudeToUser || '',

            mood: raw.mood || raw.emotionalState || '',
            location: raw.location || '',
            outfit: raw.outfit || '',
            status: raw.status || '',
            history: Array.isArray(raw.history) ? raw.history : [],
            gameTime: raw.gameTime || '',
            accessCount: raw.accessCount || 0,
            lastChangedTurn: raw.lastChangedTurn || 0,
            locked: !!raw.locked
        };
    },

    // 标准化状态值

    // 与 ai-output-schema.js 的 player.stats 归一化保持一致，下游 UI 统一通过 s.label 读取
    normalizeStats(stats) {
        if (!stats) return [];
        if (Array.isArray(stats)) {
            return stats.map(function(s) {
                if (typeof s === 'string') return { label: s, value: 0 };
                return {
                    label: String(s.label || s.name || s.key || '').trim(),
                    value: safeInt(s.value !== undefined ? s.value : s.val, 0)
                };
            }).filter((s) => s.label);
        }
        if (typeof stats === 'object') {
            const result = [];
            for (let key in stats) {
                if (stats.hasOwnProperty(key)) {
                    result.push({ label: key, value: safeInt(stats[key], 0) });
                }
            }
            return result;
        }
        return [];
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = CharacterMutator;
