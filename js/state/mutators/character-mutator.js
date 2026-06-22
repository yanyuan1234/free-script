// ========================================
// 角色变更器 - CharacterMutator
// ========================================
var CharacterMutator = {
    // 设置角色列表
    setCharacters: function(characters, options) {
        var normalized = (characters || []).map(this.normalizeCharacter.bind(this)).filter(Boolean);
        // 同时写入新路径和旧路径（旧路径为对象格式）
        StateManager.set('entities.characters', normalized, { silent: true });
        return StateManager.set('allCharacters', this._arrayToObject(normalized), options);
    },

    // 合并角色：同名更新，新名追加
    mergeCharacters: function(characters, options) {
        var self = this;
        var list = StateManager.get('entities.characters') || [];
        (characters || []).forEach(function(raw) {
            var normalized = self.normalizeCharacter(raw);
            if (!normalized) return;
            var idx = list.findIndex(function(c) {
                return c.name === normalized.name;
            });
            if (idx >= 0) {
                list[idx] = Object.assign({}, list[idx], normalized);
            } else {
                list.push(normalized);
            }
        });
        return this.setCharacters(list, options);
    },

    // 数组 -> 对象（兼容旧代码 allCharacters 格式）
    _arrayToObject: function(characters) {
        var obj = {};
        (characters || []).forEach(function(c) {
            if (c && c.name) obj[c.name] = c;
        });
        return obj;
    },

    // 更新角色关系
    updateRelationship: function(name, delta, options) {
        return this.updateCharacter(name, function(character) {
            character.favor = (character.favor || 0) + (delta || 0);
            return character;
        }, options);
    },

    // 通用更新
    updateCharacter: function(name, updater, options) {
        var characters = StateManager.get('entities.characters') || [];
        var updated = characters.map(function(c) {
            if (c.name === name) {
                var clone = StateSchema.deepClone(c);
                return updater(clone) || clone;
            }
            return c;
        });
        return this.setCharacters(updated, options);
    },

    // 标准化角色
    normalizeCharacter: function(raw) {
        if (!raw) return null;
        var name = String(raw.name || raw.title || raw.character || '').trim();
        if (!name) return null;
        return {
            id: raw.id || ('char_' + name + '_' + Date.now()),
            name: name,
            identity: raw.identity || raw.role || '',
            desc: raw.desc || raw.description || '',
            favor: parseInt(raw.favor || raw.friendship || raw.relationship || 0) || 0,
            tags: Array.isArray(raw.tags) ? raw.tags : [],
            stats: this.normalizeStats(raw.stats),
            notes: raw.notes || ''
        };
    },

    // 标准化状态值
    normalizeStats: function(stats) {
        if (!stats) return [];
        if (Array.isArray(stats)) {
            return stats.map(function(s) {
                if (typeof s === 'string') return { name: s, value: 0 };
                return {
                    name: String(s.name || s.key || '').trim(),
                    value: parseInt(s.value !== undefined ? s.value : s.val) || 0
                };
            }).filter(function(s) { return s.name; });
        }
        if (typeof stats === 'object') {
            var result = [];
            for (var key in stats) {
                if (stats.hasOwnProperty(key)) {
                    result.push({ name: key, value: parseInt(stats[key]) || 0 });
                }
            }
            return result;
        }
        return [];
    }
};
