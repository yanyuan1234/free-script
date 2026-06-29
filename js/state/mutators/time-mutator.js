// ========================================
// 时间变更器 - TimeMutator
// ========================================
const TimeMutator = {
    // 设置完整时间
    // 【P0修复BUG-006】保留 weather/era 字段：原实现仅保留 date/time/period，
    // 导致 GameTimeSystem.parseFromAI 通过 setTime 写入的 weather/era 被丢弃，
    // gameState.gameTime 镜像后 weather/era 为空，UI 显示缺失天气/纪元信息。
    // 【P1修复BUG-5.7】options.skipMonotonicCheck: 跳过单调性校验，仅用于读档/撤销场景
    // （切换到不同时间线是合理的，不应被拦截）。AI 响应解析路径绝不可传此选项。
    setTime(time, options) {
            options = options || {};
            const normalized = (!time || typeof time !== 'object')
                ? { date: '', time: '', period: '', weather: '', era: '' }
                : {
                    date: String(time.date || '').trim(),
                    time: String(time.time || '').trim(),
                    period: String(time.period || time.phase || '').trim(),
                    weather: String(time.weather || '').trim(),
                    era: String(time.era || '').trim()
                };
            // 【修复BUG-06】时间单调性校验：若新时间早于当前时间，拒绝更新
            // 防止 AI 返回不一致时间导致剧情时间倒流（如 R5 09:30→08:45）
            // 仅当当前状态存在且新时间更早时拦截；同时间或更晚时间正常更新
            // 【P1修复BUG-5.7】读档/撤销路径通过 options.skipMonotonicCheck 跳过校验
            if (!options.skipMonotonicCheck) {
                try {
                    if (typeof StateManager !== 'undefined' && StateManager.get) {
                        var current = StateManager.get('time');
                        if (current && this._isEarlier(normalized, current)) {
                            console.warn('[TimeMutator] 拒绝时间回退：当前 ' + JSON.stringify(current) + ' → 新 ' + JSON.stringify(normalized) + '，保持原时间');
                            return false;
                        }
                    }
                } catch (e) {
                    console.warn('[TimeMutator] 时间单调性校验异常（忽略，继续更新）:', e && e.message);
                }
            }
            return StateManager.set('time', normalized, options);
        },

        // 【修复BUG-06】比较时间先后：a 严格早于 b 返回 true
        // 支持的格式：
        //   date: "第N日" / "YYYY-MM-DD" / "YYYY年M月D日"
        //   time: "HH:MM"
        //   period: 清晨/上午/中午/下午/傍晚/晚上/深夜
        // 任一字段无法比较时跳过该字段，继续比较下一字段；全部不可比则返回 false（不拦截）
        _isEarlier(a, b) {
            if (!a || !b) return false;
            // 1. 比较 date
            if (a.date && b.date && a.date !== b.date) {
                var aV = this._dateValue(a.date);
                var bV = this._dateValue(b.date);
                if (aV !== null && bV !== null && aV !== bV) return aV < bV;
            }
            // 2. 比较 time（HH:MM）
            if (a.time && b.time && a.time !== b.time) {
                var aMin = this._timeToMinutes(a.time);
                var bMin = this._timeToMinutes(b.time);
                if (aMin !== null && bMin !== null) return aMin < bMin;
            }
            // 3. 比较 period
            var periodOrder = { '清晨': 1, '上午': 2, '中午': 3, '下午': 4, '傍晚': 5, '晚上': 6, '深夜': 7, 'morning': 1, 'noon': 3, 'afternoon': 4, 'evening': 5, 'night': 6 };
            var aP = periodOrder[a.period] || 0;
            var bP = periodOrder[b.period] || 0;
            if (aP && bP && aP !== bP) return aP < bP;
            return false;
        },

        // "HH:MM" → 分钟数；无法解析返回 null
        // 【P3-18修复】正则字符类 [::] 冗余（等价于 [:]），改为 [::] 兼容全角冒号
        _timeToMinutes(t) {
            if (!t || typeof t !== 'string') return null;
            var m = t.match(/(\d{1,2})[:：](\d{2})/);
            if (!m) return null;
            var h = parseInt(m[1], 10);
            var min = parseInt(m[2], 10);
            if (h > 23 || min > 59) return null;
            return h * 60 + min;
        },

        // 日期 → 可比较数值；无法解析返回 null
        // 支持 "第N日" / "YYYY-MM-DD" / "YYYY年M月D日"
        _dateValue(d) {
            if (!d || typeof d !== 'string') return null;
            var m1 = d.match(/第\s*(\d+)\s*[日天]/);
            if (m1) return parseInt(m1[1], 10);
            var m2 = d.match(/(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})/);
            if (m2) return parseInt(m2[1], 10) * 10000 + parseInt(m2[2], 10) * 100 + parseInt(m2[3], 10);
            return null;
        }
};
