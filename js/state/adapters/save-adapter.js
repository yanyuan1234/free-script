// ========================================
// 存档适配器 - SaveAdapter
// 在 StateManager 和 SaveDB 之间转换数据格式
// ========================================
var SaveAdapter = {
    // 当前快照 -> 存档数据
    toSaveData: function() {
        var snapshot = StateManager.snapshot();
        return {
            version: snapshot.meta.version,
            savedAt: Date.now(),
            state: snapshot
        };
    },

    // 存档数据 -> StateManager
    fromSaveData: function(data) {
        if (!data) return false;
        var state = data.state || data;
        // 兼容旧存档：旧存档可能直接把 gameState 作为根对象
        if (state && state.meta && state.meta.version) {
            StateManager.init(state);
        } else {
            StateManager.init(StateSchema.normalizeState(state));
        }
        return true;
    },

    // 迁移旧存档
    migrateLegacySave: function(data) {
        if (!data) return null;
        // 旧存档可能是 { state: gameState } 或直接是 gameState
        var rawState = data.state || data;
        return {
            version: StateSchema.VERSION,
            savedAt: Date.now(),
            state: StateSchema.normalizeState(rawState)
        };
    }
};
