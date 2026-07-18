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
            // [T1-P1-28] 合并白名单扩展到 11 字段（与 normalizeItem 输出一致）
            // 旧 6 字段（count/desc/rarity/rarityClass/equipped/usable）漏 unit/effect/equippable/slot/history
            // AI 返回 effect:"回血 30" 旧实现不更新 → 永久丢失
            const _mergeFields = function(target, source) {
                if (source.count !== undefined) target.count = source.count;
                if (source.desc !== undefined) target.desc = source.desc;
                if (source.rarity !== undefined) target.rarity = source.rarity;
                if (source.rarityClass !== undefined) target.rarityClass = source.rarityClass;
                if (source.equipped !== undefined) target.equipped = source.equipped;
                if (source.usable !== undefined) target.usable = source.usable;
                if (source.unit !== undefined) target.unit = source.unit;
                if (source.effect !== undefined) target.effect = source.effect;
                if (source.equippable !== undefined) target.equippable = source.equippable;
                if (source.slot !== undefined) target.slot = source.slot;
                if (Array.isArray(source.history)) target.history = source.history.slice();
                };
            if (existingMap[key]) {
                // 精确匹配命中
                _mergeFields(existingMap[key], it);
            } else {
                // 精确匹配失败 → 模糊匹配
                var normKey = BagMutator._normalizeItemName(key);
                var fuzzyMatchKey = normKey && fuzzyMap[normKey];
                if (fuzzyMatchKey && existingMap[fuzzyMatchKey]) {
                    // 模糊匹配命中：合并到现有物品
                    _mergeFields(existingMap[fuzzyMatchKey], it);
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
            const parsed = parseInt(rawCount, 10);
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

if (typeof module !== 'undefined' && module.exports) module.exports = BagMutator;
