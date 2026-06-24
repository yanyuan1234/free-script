// ========================================
// 角色变更器 - CharacterMutator
// ========================================
const CharacterMutator = {
    // 设置角色列表
    setCharacters(characters, options) {
        const normalized = (characters || []).map(this.normalizeCharacter.bind(this)).filter(Boolean);
        // 【P1修复】用 setLegacy 写旧路径，经 getPath 翻译为 'entities.characters'，确保通知路径匹配
        StateManager.set('entities.characters', normalized, { silent: true });
        return StateManager.setLegacy('allCharacters', this._arrayToObject(normalized), options);
    },

    // 合并角色：同名更新，新名追加
    mergeCharacters(characters, options) {
        var self = this;
        const list = StateManager.get('entities.characters') || [];
        (characters || []).forEach(function(raw) {
            const normalized = self.normalizeCharacter(raw);
            if (!normalized) return;
            const idx = list.findIndex((c) => c.name === normalized.name);
            if (idx >= 0) {
                list[idx] = Object.assign({}, list[idx], normalized);
            } else {
                list.push(normalized);
            }
        });
        return this.setCharacters(list, options);
    },

    // 数组 -> 对象（兼容旧代码 allCharacters 格式）
    _arrayToObject(characters) {
        const obj = {};
        (characters || []).forEach(function(c) {
            if (c && c.name) obj[c.name] = c;
        });
        return obj;
    },

    // 更新角色关系
    updateRelationship(name, delta, options) {
        return this.updateCharacter(name, function(character) {
            character.favor = (character.favor || 0) + (delta || 0);
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

    // 标准化角色
    normalizeCharacter(raw) {
        if (!raw) return null;
        const name = String(raw.name || raw.title || raw.character || '').trim();
        if (!name) return null;
        return {
            id: raw.id || ('char_' + name + '_' + Date.now()),
            name: name,
            identity: raw.identity || raw.role || '',
            desc: raw.desc || raw.description || '',
            favor: parseInt(raw.favor !== undefined ? raw.favor : (raw.friendship !== undefined ? raw.friendship : (raw.relationship !== undefined ? raw.relationship : 0)), 10) || 0,
            tags: Array.isArray(raw.tags) ? raw.tags : [],
            stats: this.normalizeStats(raw.stats),
            notes: raw.notes || ''
        };
    },

    // 标准化状态值
    normalizeStats(stats) {
        if (!stats) return [];
        if (Array.isArray(stats)) {
            return stats.map(function(s) {
                if (typeof s === 'string') return { name: s, value: 0 };
                return {
                    name: String(s.name || s.key || '').trim(),
                    value: parseInt(s.value !== undefined ? s.value : s.val) || 0
                };
            }).filter((s) => s.name);
        }
        if (typeof stats === 'object') {
            const result = [];
            for (let key in stats) {
                if (stats.hasOwnProperty(key)) {
                    result.push({ name: key, value: parseInt(stats[key]) || 0 });
                }
            }
            return result;
        }
        return [];
    }
};
