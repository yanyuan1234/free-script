// ========================================
// 关系变更器 - RelationshipMutator
// ========================================

//   - 旧：gameState.relationships（UI 读）
//   - 旧：gm.tables.relationships（EnhancedMemory 存储）
//   - 新：StateManager.get('entities.relationships')
// 统一走 RelationshipMutator.mergeRelationships，
// StateManager._syncLegacyMirror 自动同步 gameState.relationships 旧字段。
// ========================================
const RelationshipMutator = {
    // 【BUG修复】规范化实体名称：将 "主角" / "玩家" 等通配名统一为实际玩家名
    // 避免同一关系因 from 名称不同（"主角" vs "林远"）而被当作不同条目重复添加
    _normalizeEntityName(name, playerName) {
        if (!name) return '';
        var n = String(name).trim();
        // 通配名统一为玩家实际名称
        var aliases = ['主角', '玩家', '我', '你', 'player', 'Player', '主角（玩家）'];
        if (aliases.indexOf(n) !== -1 && playerName) {
            return playerName;
        }
        return n;
    },

    // 合并关系图谱条目 [{from, to, type, desc}]
    // 重复关系对（A→B 或 B→A）合并/更新，上限 10 条
    mergeRelationships(newRels, options) {
        const inputList = Array.isArray(newRels) ? newRels : (newRels ? [newRels] : []);
        const current = StateManager.get('entities.relationships');
        const list = Array.isArray(current) ? current.slice() : [];

        // 获取玩家实际名称用于规范化
        var playerName = '';
        try {
            var player = StateManager.get('entities.player');
            if (player && player.name) playerName = player.name;
        } catch(e) {}
        if (!playerName && typeof gameState !== 'undefined') {
            playerName = (gameState.playerData && gameState.playerData.name) || gameState.playerName || '';
        }

        inputList.forEach(function(nr) {
            if (!nr || !nr.from || !nr.to) return;
            // 规范化 from/to：将 "主角" 等通配名替换为实际玩家名
            nr.from = RelationshipMutator._normalizeEntityName(nr.from, playerName);
            nr.to = RelationshipMutator._normalizeEntityName(nr.to, playerName);

            // 找已有的相同关系对（A→B 或 B→A 算同一对）
            var existIdx = -1;
            for (var i = 0; i < list.length; i++) {
                var r = list[i];
                // 也对已有条目做规范化（防止旧数据中有 "主角"）
                var rFrom = RelationshipMutator._normalizeEntityName(r.from, playerName);
                var rTo = RelationshipMutator._normalizeEntityName(r.to, playerName);
                if ((rFrom === nr.from && rTo === nr.to) || (rFrom === nr.to && rTo === nr.from)) {
                    existIdx = i;
                    break;
                }
            }
            if (existIdx !== -1) {
                // 多维关系：保留旧维度并覆盖新维度，避免 AI 只返回部分维度时丢失已有数据
                var merged = Object.assign({}, list[existIdx], nr);
                if (nr.dimensions || list[existIdx].dimensions) {
                    merged.dimensions = Object.assign({}, list[existIdx].dimensions || {}, nr.dimensions || {});
                }
                list[existIdx] = merged;
            } else {
                if (nr.dimensions && typeof nr.dimensions === 'object') {
                    nr.dimensions = Object.assign({}, nr.dimensions);
                }
                list.push(nr);
            }
        });

        // 【BUG修复】去除可能因并发/旧数据产生的完全重复条目（from+to+type 完全相同）
        var deduped = [];
        var seen = {};
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            // 双向 key：A→B 和 B→A 视为同一条
            var key1 = item.from + '→' + item.to + ':' + item.type;
            var key2 = item.to + '→' + item.from + ':' + item.type;
            if (seen[key1] || seen[key2]) continue;
            seen[key1] = true;
            seen[key2] = true;
            deduped.push(item);
        }

        // 上限 10 条
        const trimmed = deduped.length > 10 ? deduped.slice(-10) : deduped;
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
