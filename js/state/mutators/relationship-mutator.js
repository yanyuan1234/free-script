// ========================================
// 关系变更器 - RelationshipMutator
// ========================================
// 【P0-2.9 阶段3-3】关系数据 3 套归 1：
//   - 旧：gameState.relationships（UI 读）
//   - 旧：gm.tables.relationships（EnhancedMemory 存储）
//   - 新：StateManager.get('entities.relationships')
// 统一走 RelationshipMutator.mergeRelationships，
// StateManager._syncLegacyMirror 自动同步 gameState.relationships 旧字段。
// ========================================
const RelationshipMutator = {
    // 合并关系图谱条目 [{from, to, type, desc}]
    // 重复关系对（A→B 或 B→A）合并/更新，上限 10 条
    mergeRelationships(newRels, options) {
        const inputList = Array.isArray(newRels) ? newRels : (newRels ? [newRels] : []);
        const current = StateManager.get('entities.relationships');
        const list = Array.isArray(current) ? current.slice() : [];
        inputList.forEach(function(nr) {
            if (!nr || !nr.from || !nr.to) return;
            // 找已有的相同关系对（A→B 或 B→A 算同一对）
            var existIdx = -1;
            for (var i = 0; i < list.length; i++) {
                var r = list[i];
                if ((r.from === nr.from && r.to === nr.to) || (r.from === nr.to && r.to === nr.from)) {
                    existIdx = i;
                    break;
                }
            }
            if (existIdx !== -1) {
                list[existIdx] = nr;
            } else {
                list.push(nr);
            }
        });
        // 上限 10 条
        const trimmed = list.length > 10 ? list.slice(-10) : list;
        return StateManager.set('entities.relationships', trimmed, options);
    },

    // 获取关系列表（深拷贝）
    getRelationships() {
        const v = StateManager.get('entities.relationships');
        return Array.isArray(v) ? v : [];
    },

    // 清空关系
    clearRelationships(options) {
        return StateManager.set('entities.relationships', [], options);
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = RelationshipMutator;
