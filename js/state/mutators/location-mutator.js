// ========================================
// 地点变更器 - LocationMutator
// 阶段1：消除 _applyMemsToGameState location 分支直写 StateManager 的反模式
// 任何地点变更必须经由此 Mutator，与 Character/Bag/Quest 等变更有同等架构地位
// ========================================
const LocationMutator = {
    _STOP_WORDS: ['阳光', '依靠触觉', '空气', '风', '雨', '雪', '味道', '声音', '感觉', '情绪'],

    _isStopWord(name) {
        if (!name) return false;
        return LocationMutator._STOP_WORDS.indexOf(name) !== -1;
    },

    // 设置完整地点列表
    setLocations(locations, options) {
        const arr = Array.isArray(locations) ? locations : (locations ? [locations] : []);
        const normalized = arr.map(this.normalizeLocation.bind(this)).filter(Boolean);
        return StateManager.set('entities.locations', normalized, options);
    },

    // 合并地点：同名则更新 desc/notes，新名追加
    mergeLocations(locations, options) {
        const self = this;
        const inputList = Array.isArray(locations) ? locations : (locations ? [locations] : []);
        const list = (function () {
            const v = StateManager.get('entities.locations');
            return Array.isArray(v) ? v : [];
        })();
        inputList.forEach(function (raw) {
            const normalized = self.normalizeLocation(raw);
            if (!normalized) return;
            const idx = list.findIndex(function (l) { return l && l.name === normalized.name; });
            if (idx >= 0) {
                // 累加 lastChangedTurn 与 accessCount，保留已存在的 features / charactersPresent
                list[idx] = Object.assign({}, list[idx], normalized);
            } else {
                list.push(normalized);
            }
        });
        return this.setLocations(list, options);
    },

    // 单个添加（替代 _applyMemsToGameState location 分支内联的 addLocation 逻辑）
    addLocation(name, content, options) {
        if (!name) return false;
        const list = StateManager.get('entities.locations') || [];
        const exists = list.some(function (l) { return l && l.name === name; });
        if (exists) return false;
        return this.mergeLocations([{ name: name, desc: content || '' }], options);
    },

    // 删除地点
    removeLocation(name, options) {
        if (!name) return false;
        const list = StateManager.get('entities.locations') || [];
        const filtered = list.filter(function (l) { return l && l.name !== name; });
        if (filtered.length === list.length) return false;
        return this.setLocations(filtered, options);
    },

    // 获取单个地点
    getLocation(name) {
        const list = StateManager.get('entities.locations') || [];
        return list.find(function (l) { return l && l.name === name; }) || null;
    },

    // 标准化地点 schema
    normalizeLocation(raw) {
        if (!raw) return null;
        // 支持字符串输入（与 BagMutator.normalizeItem 行为一致）
        // AI/旧代码可能传 '森林' 而非 { name: '森林' }，原实现会丢掉这种输入
        if (typeof raw === 'string') {
            const name = raw.trim();
            if (!name) return null;
            return {
                id: 'loc_' + name + '_' + Date.now(),
                name: name,
                desc: '',
                features: '',
                charactersPresent: '',
                notes: '',
                lastChangedTurn: 0,
                locked: false
            };
        }
        const name = String(raw.name || '').trim();
        if (!name) return null;
        return {
            id: raw.id || ('loc_' + name + '_' + Date.now()),
            name: name,
            desc: raw.desc || raw.description || '',
            features: raw.features || '',
            charactersPresent: raw.charactersPresent || '',
            notes: raw.notes || '',
            // GameMemory 运行时字段（避免回写丢失）
            lastChangedTurn: raw.lastChangedTurn || 0,
            locked: !!raw.locked
        };
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LocationMutator;
