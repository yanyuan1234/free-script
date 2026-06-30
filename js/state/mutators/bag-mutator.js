// ========================================
// 物品变更器 - BagMutator
// ========================================
const BagMutator = {
    // 设置整个物品列表（标准化后）
    setItems(items, options) {

        const arr = Array.isArray(items) ? items : (items ? [items] : []);
        const normalized = arr.map(this.normalizeItem.bind(this)).filter(Boolean);
        // 【数据断层修复】只写新路径，StateManager._syncLegacyMirror 自动同步到 currentBag
        return StateManager.set('entities.bag', normalized, options);
    },

    // 合并物品：保留已有，更新/插入新物品（同 renderBag 语义）

    // 现在精确匹配失败时再用归一化名称（去"的"、空格、标点）做模糊匹配，避免命名差异导致重复
    mergeItems(items, options) {

        const inputItems = Array.isArray(items) ? items : (items ? [items] : []);
        const rawBag = StateManager.get('entities.bag');
        const bag = Array.isArray(rawBag) ? rawBag : [];
        const existingMap = {};
        // 归一化名称 → 物品 key 的映射（用于模糊匹配）
        const fuzzyMap = {};
        bag.forEach(function(it, idx) {
            const key = (it && (it.name || it.title || it.id)) || ('__idx_' + idx);
            existingMap[key] = it;
            if (it && (it.name || it.title)) {
                var norm = BagMutator._normalizeItemName(it.name || it.title);
                if (norm) fuzzyMap[norm] = key;
            }
        });
        inputItems.forEach(function(it) {
            if (!it) return;
            const key = it.name || it.title || it.id;
            if (!key) return;
            if (existingMap[key]) {
                // 精确匹配命中
                existingMap[key].count = it.count !== undefined ? it.count : (existingMap[key].count || 1);
                if (it.desc !== undefined) existingMap[key].desc = it.desc;
                if (it.rarity !== undefined) existingMap[key].rarity = it.rarity;
                if (it.rarityClass !== undefined) existingMap[key].rarityClass = it.rarityClass;
                if (it.equipped !== undefined) existingMap[key].equipped = it.equipped;
                if (it.usable !== undefined) existingMap[key].usable = it.usable;
            } else {
                // 精确匹配失败 → 模糊匹配
                var normKey = BagMutator._normalizeItemName(key);
                var fuzzyMatchKey = normKey && fuzzyMap[normKey];
                if (fuzzyMatchKey && existingMap[fuzzyMatchKey]) {
                    // 模糊匹配命中：合并到现有物品
                    existingMap[fuzzyMatchKey].count = it.count !== undefined ? it.count : (existingMap[fuzzyMatchKey].count || 1);
                    if (it.desc !== undefined) existingMap[fuzzyMatchKey].desc = it.desc;
                    if (it.rarity !== undefined) existingMap[fuzzyMatchKey].rarity = it.rarity;
                    if (it.rarityClass !== undefined) existingMap[fuzzyMatchKey].rarityClass = it.rarityClass;
                    if (it.equipped !== undefined) existingMap[fuzzyMatchKey].equipped = it.equipped;
                    if (it.usable !== undefined) existingMap[fuzzyMatchKey].usable = it.usable;
                } else {
                    // 全新物品
                    bag.push(it);
                    existingMap[key] = it;
                    if (normKey) fuzzyMap[normKey] = key;
                }
            }
        });
        return this.setItems(bag, options);
    },


    // 例："磨边的羊毛袜" 与 "磨边羊毛袜" → "磨边羊毛袜"
    _normalizeItemName(name) {
        if (!name) return '';
        return String(name)
            .replace(/的/g, '')           // 去掉"的"修饰词
            .replace(/[\s·,，、。.]+/g, '') // 去空格和常见标点
            .replace(/[（(].*?[)）]/g, '')  // 去括号注释
            .trim()
            .toLowerCase();
    },

    // 添加单个物品
    addItem(item, options) {
        const normalized = this.normalizeItem(item);
        if (!normalized) return false;
        const rawBag = StateManager.get('entities.bag');
        const bag = Array.isArray(rawBag) ? rawBag : [];
        const existing = bag.find((it) => it && it.name === normalized.name);
        if (existing) {
            existing.count = (existing.count || 1) + (normalized.count || 1);
        } else {
            bag.push(normalized);
        }
        return this.setItems(bag, options);
    },

    // 标准化物品格式

    // - count 为身份字段（旧 qty 已在 sync 层映射为 count，此处兼容读取但不输出）
    // - 保留 GameMemory 运行时字段（obtainedTurn/lastChangedTurn/history），避免 mutator 回写时丢失
    normalizeItem(raw) {
        if (!raw) return null;
        let name = '';
        if (typeof raw === 'string') {
            name = raw.trim();
        } else {
            name = String(raw.name || raw.title || raw.item || '').trim();
        }
        // 过滤无效值
        if (!name || name === '无' || name.toLowerCase() === 'undefined' ||
            name.toLowerCase() === 'null' || name === '未知') {
            return null;
        }
        let count = 1;

        const rawCount = raw.count !== undefined ? raw.count : raw.qty;
        if (rawCount !== undefined) {
            const parsed = parseInt(rawCount);
            if (!isNaN(parsed) && parsed > 0) count = parsed;
        }
        const unit = raw.unit || '个';
        return {
            id: raw.id || ('item_' + name + '_' + Date.now()),
            name: name,
            count: count,
            unit: unit,
            rarity: raw.rarity || '普通',
            desc: raw.desc || raw.description || '',
            usable: !!raw.usable,
            effect: raw.effect || '',
            equippable: !!raw.equippable,
            equipped: !!raw.equipped,
            slot: raw.slot || '',

            obtainedTurn: raw.obtainedTurn || 0,
            lastChangedTurn: raw.lastChangedTurn || 0,
            history: Array.isArray(raw.history) ? raw.history : []
        };
    }
};
