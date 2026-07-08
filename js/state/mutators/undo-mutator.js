// ========================================
// 撤销栈变更器 - UndoMutator
// 阶段1：撤销栈从 gameState._undoHistory 杂字段统一到 StateManager
// ========================================
const UndoMutator = {
    // 安全克隆：深拷贝（处理循环引用）
    // 优先用 StateSchema.deepClone（过滤危险键，防原型污染）；
    // 若含循环引用（deepClone 不支持），回退 structuredClone；
    // structuredClone 不可用时回退 JSON
    _safeClone(o) {
        if (typeof StateSchema !== 'undefined' && StateSchema.deepClone) {
            try { return StateSchema.deepClone(o); } catch (e) { /* 含循环引用，走 fallback */ }
        }
        if (typeof structuredClone === 'function') {
            try { return structuredClone(o); } catch (e) { /* 循环引用，走 fallback */ }
        }
        try { return JSON.parse(JSON.stringify(o)); } catch (e) {
            throw new Error('[UndoMutator] 深拷贝失败（含循环引用且无 JSON 兼容）：' + (e && e.message));
        }
    },

    // 获取当前撤销栈（深拷贝）
    getHistory() {
        const list = StateManager.get('ui.undoHistory');
        return Array.isArray(list) ? list : [];
    },

    // 推入一条快照（在 AI 回复前调用）
    // snap 应包含：conversationHistory / allCharacters / worldSnapshot /
    // keyEvents / currentQuests / relationships / currentBag /
    // progressTurn / sceneTitle / lastSceneTitle / swipes
    pushSnapshot(snap) {
        const max = StateManager.get('ui.maxUndoHistory') || 50;
        const list = this.getHistory();
        if (list.length >= max) list.shift();
        // 统一深拷贝所有字段，防止引用污染
        const safe = {
            conversationHistory: this._safeClone(snap.conversationHistory || []),
            allCharacters: this._safeClone(snap.allCharacters || {}),
            worldSnapshot: this._safeClone(snap.worldSnapshot || {}),
            keyEvents: this._safeClone(snap.keyEvents || []),
            currentQuests: this._safeClone(snap.currentQuests || []),
            relationships: this._safeClone(snap.relationships || []),
            currentBag: this._safeClone(snap.currentBag || []),
            progressTurn: snap.progressTurn || 0,
            sceneTitle: snap.sceneTitle || '',
            lastSceneTitle: snap.lastSceneTitle || '',
            // 【P1 Swipe】快照包含 swipes，撤销时恢复（retryStory 会单独绕过此恢复）
            swipes: this._safeClone(snap.swipes || {}),
            timestamp: snap.timestamp || Date.now()
        };
        list.push(safe);
        return StateManager.set('ui.undoHistory', list, { silent: true });
    },

    // 弹出最后一条快照（撤销时调用），返回原引用供 caller 进一步使用
    popSnapshot() {
        const list = this.getHistory();
        if (list.length === 0) return null;
        const snap = list.pop();
        StateManager.set('ui.undoHistory', list, { silent: true });
        return snap;
    },

    // 撤销栈长度
    size() {
        return this.getHistory().length;
    },

    // 恢复快照：内部统一委托各 Mutator，消除 5 字段直写
    // 这是阶段1最关键修复：撤销不再直写 gameState.x = ...，
    // 而是逐个 Mutator 写入，由 _syncLegacyMirror 自动维护 gameState 旧字段
    restoreFromSnapshot(snap) {
        if (!snap) return false;
        // 1. conversationHistory：走 StateManager 静默写入

        // 写入会创建孤立子树，既不触发 _syncLegacyMirror 同步到 gameState.conversationHistory，
        // 也不被订阅者监听 → 撤销后对话历史不恢复。正确路径为 'progress.conversationHistory'。
        if (typeof StateManager !== 'undefined' && StateManager.set) {
            StateManager.set('progress.conversationHistory', snap.conversationHistory || [], { silent: true });
        }
        // 2. 角色：通过 CharacterMutator（统一权威）
        if (typeof CharacterMutator !== 'undefined' && CharacterMutator.setCharacters) {
            const undoChars = snap.allCharacters || {};
            const list = Object.keys(undoChars).map(function (k) { return undoChars[k]; }).filter(Boolean);
            CharacterMutator.setCharacters(list, { silent: true });
        }
        // 3. 物品：通过 BagMutator
        if (typeof BagMutator !== 'undefined' && BagMutator.setItems) {
            BagMutator.setItems(snap.currentBag || [], { silent: true });
        }
        // 4. 任务：通过 QuestMutator
        if (typeof QuestMutator !== 'undefined' && QuestMutator.setQuests) {
            QuestMutator.setQuests(snap.currentQuests || [], { silent: true });
        }
        // 5. 关系：通过 RelationshipMutator
        if (typeof RelationshipMutator !== 'undefined' && RelationshipMutator.mergeRelationships) {
            RelationshipMutator.mergeRelationships(snap.relationships || [], { silent: true });
        }
        // 6. 事件：keyEvents 是字符串数组旧格式，委托 EnhancedMemory（统一走 gm.addImportantEvent）
        const _gm = (typeof window !== 'undefined') ? window.GameMemory : null;
        if (_gm && _gm._syncEventsToKeyEvents) {
            // 利用 _syncEventsToKeyEvents（gm.events → SM.entities.events 自动转字符串数组）
            // 但 snap 存的是字符串数组，反向走 gm 路径需要重建对象
            if (Array.isArray(snap.keyEvents) && snap.keyEvents.length > 0) {
                // 强制 sync：先写 SM 触发 mirror
                StateManager.set('entities.events', snap.keyEvents.map(function (c) {
                    return { content: c, importance: 7, source: 'undo_restore', turn: 0 };
                }), { silent: true });
            }
        }
        // 7. 回合数与场景标题：直接写 StateManager
        if (typeof StateManager !== 'undefined' && StateManager.set) {
            if (snap.progressTurn !== undefined) {
                StateManager.set('progress.turn', snap.progressTurn, { silent: true });
            }
            if (snap.sceneTitle !== undefined) {
                StateManager.set('progress.sceneTitle', snap.sceneTitle || '', { silent: true });
            }
            if (snap.lastSceneTitle !== undefined) {
                StateManager.set('progress.lastSceneTitle', snap.lastSceneTitle || '', { silent: true });
            }
            // 【P1 Swipe】恢复 swipes（用户主动撤销时回到上一轮 swipe 状态）
            // 注意：retryStory 会在 deleteLastTurn 后单独写回 swipes 备份，绕过此恢复
            if (snap.swipes !== undefined) {
                StateManager.set('progress.swipes', snap.swipes || {}, { silent: true });
            }
        }
        return true;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = UndoMutator;
