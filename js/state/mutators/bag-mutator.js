// ========================================
// 物品变更器 - BagMutator
// ========================================
const BagMutator = {
    // 设置整个物品列表（标准化后）
    setItems(items, options) {
        const normalized = (items || []).map(this.normalizeItem.bind(this)).filter(Boolean);
        // 【P1修复】用 setLegacy 写旧路径，经 getPath 翻译为 'entities.bag'，确保通知路径与订阅路径匹配
        // 新路径 silent 写入保持数据一致，旧路径带通知写入触发 GameMemoryAdapter 同步
        StateManager.set('entities.bag', normalized, { silent: true });
        return StateManager.setLegacy('currentBag', normalized, options);
    },

    // 合并物品：保留已有，更新/插入新物品（同 renderBag 语义）
    mergeItems(items, options) {
        if (!items || !Array.isArray(items)) return false;
        const bag = StateManager.get('entities.bag') || [];
        const existingMap = {};
        bag.forEach(function(it, idx) {
            const key = (it && (it.name || it.title || it.id)) || ('__idx_' + idx);
            existingMap[key] = it;
        });
        items.forEach(function(it) {
            if (!it) return;
            const key = it.name || it.title || it.id;
            if (!key) return;
            if (existingMap[key]) {
                existingMap[key].count = it.count !== undefined ? it.count : (existingMap[key].count || 1);
                if (it.desc !== undefined) existingMap[key].desc = it.desc;
                if (it.rarity !== undefined) existingMap[key].rarity = it.rarity;
                if (it.rarityClass !== undefined) existingMap[key].rarityClass = it.rarityClass;
                if (it.equipped !== undefined) existingMap[key].equipped = it.equipped;
                if (it.usable !== undefined) existingMap[key].usable = it.usable;
            } else {
                bag.push(it);
                existingMap[key] = it;
            }
        });
        return this.setItems(bag, options);
    },

    // 添加单个物品
    addItem(item, options) {
        const normalized = this.normalizeItem(item);
        if (!normalized) return false;
        const bag = StateManager.get('entities.bag') || [];
        const existing = bag.find((it) => it.name === normalized.name);
        if (existing) {
            existing.count = (existing.count || 1) + (normalized.count || 1);
        } else {
            bag.push(normalized);
        }
        return this.setItems(bag, options);
    },

    // 移除物品
    removeItem(name, options) {
        const bag = StateManager.get('entities.bag') || [];
        const filtered = bag.filter((it) => it.name !== name);
        return this.setItems(filtered, options);
    },

    // 更新物品
    updateItem(name, updater, options) {
        const bag = StateManager.get('entities.bag') || [];
        const updated = bag.map(function(it) {
            if (it.name === name) {
                const clone = StateSchema.deepClone(it);
                return updater(clone) || clone;
            }
            return it;
        });
        return this.setItems(updated, options);
    },

    // 标准化物品格式
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
        if (raw.count !== undefined) {
            const parsed = parseInt(raw.count);
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
            slot: raw.slot || ''
        };
    }
};
