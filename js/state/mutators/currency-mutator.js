// ========================================
// 货币变更器 - CurrencyMutator
// ========================================
// 【P1-PU1 阶段2-1】统一货币读写入口，替代 phone-ui.js 的
//   - getPlayerMoney()     4 套 fallback 链 (gameState.currency || money || coins || 0)
//   - subtractPlayerMoney() 直写 gameState.currency -= amount（绕开 StateManager）
//   - getCurrencyName()    直读 gameState.currencyName
// 改用 CurrencyMutator.spend/add/get/set 后，所有读写走 StateManager →
// _syncLegacyMirror 自动同步 gameState 旧字段。
const CurrencyMutator = {
    // 取当前余额（统一入口，0 是合法值）
    get() {
        const v = StateManager.get('entities.currency');
        return (typeof v === 'number' && isFinite(v)) ? v : 0;
    },

    // 取货币名（默认'金币'）
    getName() {
        const v = StateManager.get('entities.currencyName');
        return v || '金币';
    },

    // 设置余额（极少用，主要给 setup 阶段和读档初始化）
    set(amount, options) {
        if (typeof amount !== 'number' || !isFinite(amount)) {
            console.warn('[CurrencyMutator.set] 非数字金额，已忽略:', amount);
            return false;
        }
        StateManager.set('entities.currency', Math.max(0, Math.floor(amount)), options);
        return true;
    },

    // 加钱
    add(amount, options) {
        if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
            console.warn('[CurrencyMutator.add] 金额必须为正数:', amount);
            return false;
        }
        const cur = this.get();
        StateManager.set('entities.currency', cur + amount, options);
        return true;
    },

    // 扣钱（替代 subtractPlayerMoney）
    // 返回 true 表示扣款成功，false 表示余额不足
    spend(amount, options) {
        if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
            console.warn('[CurrencyMutator.spend] 金额必须为正数:', amount);
            return false;
        }
        const cur = this.get();
        if (cur < amount) {
            // 余额不足：返回 false 但不修改状态
            return false;
        }
        StateManager.set('entities.currency', cur - amount, options);
        return true;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = CurrencyMutator;
