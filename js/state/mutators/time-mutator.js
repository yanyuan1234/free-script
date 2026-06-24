// ========================================
// 时间变更器 - TimeMutator
// ========================================
const TimeMutator = {
    // 设置完整时间
    setTime(time, options) {
        const normalized = (!time || typeof time !== 'object')
            ? { date: '', time: '', period: '' }
            : {
                date: String(time.date || '').trim(),
                time: String(time.time || '').trim(),
                period: String(time.period || time.phase || '').trim()
            };
        // 【数据断层修复】只写新路径，StateManager._syncLegacyMirror 自动同步到 gameTime
        return StateManager.set('time', normalized, options);
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
