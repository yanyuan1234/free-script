// ========================================
// 关系变更器 - RelationshipMutator
// ========================================
// 【P0-2.9 阶段3-3】关系数据 3 套归 1：
//   - 旧：gameState.relationships（UI 读）
//   - 旧：gm.tables.relationships（EnhancedMemory 存储）
//   - 新：StateManager.get('entities.relationships')
// 统一走 RelationshipMutator.mergeRelationships，
// StateManager._syncLegacyMirror 自动同步 gameState.relationships 旧字段。
//
// 【P1-18修复】持久化收敛：
//   原本 systems.js / ai-response-mutator.js / phone-ui.js 三处各自在调用
//   RelationshipMutator 后再手动调 _pushRelationshipsToGM()，构成跨 3 文件双写链。
//   现将 _pushRelationshipsToGM() 收敛进 mergeRelationships 内部，外部只需调
//   RelationshipMutator.mergeRelationships() 即可同时完成 StateManager 写入 +
//   gm.tables.relationships 持久化（StateManager 无独立持久化层，gm.tables 才是
//   localStorage 的实际存储源）。
// ========================================
const RelationshipMutator = {
    // 合并关系图谱条目 [{from, to, type, desc}]
    // 重复关系对（A→B 或 B→A）合并/更新，上限 10 条
    // 写入 StateManager 后自动推送 gm.tables.relationships 持久化
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
        const result = StateManager.set('entities.relationships', trimmed, options);
        // 【P1-18】统一持久化入口：StateManager 无独立持久化层，gm.tables.relationships
        // 是 localStorage 实际存储源。写入 SM 后自动推送，消除外部 3 处分散调用。
        _persistToGMTables();
        return result;
    },

    // 获取关系列表（深拷贝）
    getRelationships() {
        const v = StateManager.get('entities.relationships');
        return Array.isArray(v) ? v : [];
    },

    // 清空关系（同步清空 gm.tables.relationships 持久化层）
    clearRelationships(options) {
        const result = StateManager.set('entities.relationships', [], options);
        _persistToGMTables();
        return result;
    }
};

// 【P1-18】持久化辅助：把 StateManager.entities.relationships → gameState.relationships
// （由 _syncLegacyMirror 自动完成）→ gm.tables.relationships（localStorage 存储源）
// 定义为模块内函数，避免重复 try/catch 样板。_pushRelationshipsToGM 在 core.js 中定义，
// 运行时（非加载时）调用，故 load order 无忧（relationship-mutator.js 先于 core.js 加载）。
function _persistToGMTables() {
    if (typeof _pushRelationshipsToGM === 'function') {
        try { _pushRelationshipsToGM(); } catch (e) {
            console.warn('[RelationshipMutator] _pushRelationshipsToGM 失败:', e && e.message);
        }
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = RelationshipMutator;
