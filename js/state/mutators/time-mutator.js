// ========================================
// 时间变更器 - TimeMutator
// ========================================
const TimeMutator = {
    // 设置完整时间
    setTime(time, options) {
        if (!time || typeof time !== 'object') {
            const empty = { date: '', time: '', period: '' };
            StateManager.set('time', empty, { silent: true });
            // 【P1修复】用 setLegacy 写旧路径，经 getPath 翻译为 'time'，确保通知路径匹配
            return StateManager.setLegacy('gameTime', empty, options);
        }
        const normalized = {
            date: String(time.date || '').trim(),
            time: String(time.time || '').trim(),
            period: String(time.period || time.phase || '').trim()
        };
        // 同时写入新路径和旧路径，保持兼容性
        StateManager.set('time', normalized, { silent: true });
        return StateManager.setLegacy('gameTime', normalized, options);
    },

    // 推进时间
    advance(options) {
        options = options || {};
        const current = StateManager.get('time') || {};
        const periodMap = {
            '清晨': '上午',
            '上午': '中午',
            '中午': '下午',
            '下午': '傍晚',
            '傍晚': '晚上',
            '晚上': '深夜',
            '深夜': '清晨'
        };
        const period = current.period || '清晨';
        const nextPeriod = options.nextPeriod || periodMap[period] || '清晨';
        const next = {
            date: current.date || '',
            time: '',
            period: nextPeriod
        };
        // 如果是新的一天
        if (period === '深夜' && nextPeriod === '清晨') {
            next.date = this._nextDate(current.date);
        }
        return this.setTime(next, options);
    },

    // 简单日期推进（仅支持 "第N日" 或常见格式）
    _nextDate(dateStr) {
        if (!dateStr) return '第2日';
        const match = dateStr.match(/第\s*(\d+)\s*日/);
        if (match) {
            return '第' + (parseInt(match[1]) + 1) + '日';
        }
        return dateStr;
    }
};
