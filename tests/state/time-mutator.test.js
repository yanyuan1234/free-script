// ========================================
// TimeMutator 单元测试
// Run: node tests/state/time-mutator.test.js
// ========================================
var helpers = require('../_helpers.js');
var TimeMutator = require('../../js/state/mutators/time-mutator.js');

function freshState() {
    helpers.createFakeStateManager();
    return TimeMutator;
}

// ---- setTime 基础 ----
function testSetTimeBasic() {
    var M = freshState();
    helpers.assertOk(M.setTime({ date: '第1日', time: '09:30', period: '上午', weather: '晴', era: '公元2026年' }), 'setTime 应成功');
    var t = global.StateManager.get('time');
    helpers.assertEq(t.date, '第1日', 'date');
    helpers.assertEq(t.time, '09:30', 'time');
    helpers.assertEq(t.period, '上午', 'period');
    helpers.assertEq(t.weather, '晴', 'weather');
    helpers.assertEq(t.era, '公元2026年', 'era');
}

function testSetTimeEmpty() {
    var M = freshState();
    helpers.assertOk(M.setTime(null), 'null 输入应被规范化');
    var t = global.StateManager.get('time');
    helpers.assertEq(t.date, '', 'date 应为空串');
    helpers.assertEq(t.time, '', 'time 应为空串');
    helpers.assertEq(t.period, '', 'period 应为空串');
    helpers.assertEq(t.weather, '', 'weather 应为空串');
    helpers.assertEq(t.era, '', 'era 应为空串');
}

function testSetTimePhaseAlias() {
    var M = freshState();
    // phase 字段应作为 period 的别名
    M.setTime({ date: '第1日', phase: '中午' });
    var t = global.StateManager.get('time');
    helpers.assertEq(t.period, '中午', 'phase 应映射到 period');
}

function testSetTimeTrim() {
    var M = freshState();
    M.setTime({ date: '  第1日  ', time: '  09:30  ', period: '  上午  ' });
    var t = global.StateManager.get('time');
    helpers.assertEq(t.date, '第1日', 'date 应 trim');
    helpers.assertEq(t.time, '09:30', 'time 应 trim');
    helpers.assertEq(t.period, '上午', 'period 应 trim');
}

// ---- 时间单调性校验 ----
function testSetTimeRejectBackward() {
    var M = freshState();
    M.setTime({ date: '第5日', time: '09:30', period: '上午' });
    // 同日更早时间应被拒绝
    var ok = M.setTime({ date: '第5日', time: '08:45', period: '清晨' });
    helpers.assertEq(ok, false, '同日时间回退应被拒绝');
    var t = global.StateManager.get('time');
    helpers.assertEq(t.time, '09:30', '拒绝后应保持原时间');
}

function testSetTimeRejectEarlierDate() {
    var M = freshState();
    M.setTime({ date: '第5日', time: '09:30' });
    var ok = M.setTime({ date: '第3日', time: '12:00' });
    helpers.assertEq(ok, false, '更早日期应被拒绝');
    helpers.assertEq(global.StateManager.get('time').date, '第5日', '保持原日期');
}

function testSetTimeAllowForward() {
    var M = freshState();
    M.setTime({ date: '第5日', time: '09:30', period: '上午' });
    helpers.assertOk(M.setTime({ date: '第5日', time: '12:00', period: '中午' }), '同日更晚时间应允许');
    helpers.assertEq(global.StateManager.get('time').time, '12:00', '时间应更新');
}

function testSetTimeAllowSameTime() {
    var M = freshState();
    M.setTime({ date: '第5日', time: '09:30' });
    helpers.assertOk(M.setTime({ date: '第5日', time: '09:30' }), '相同时间应允许');
}

function testSetTimeAllowBackwardOption() {
    var M = freshState();
    M.setTime({ date: '第5日', time: '09:30' });
    // 显式允许回退（穿越/回忆场景）
    helpers.assertOk(M.setTime({ date: '第3日', time: '08:00' }, { allowBackward: true }), 'allowBackward 应允许回退');
    helpers.assertEq(global.StateManager.get('time').date, '第3日', '日期应更新');
}

function testSetTimeSkipMonotonicCheck() {
    var M = freshState();
    M.setTime({ date: '第5日', time: '09:30' });
    helpers.assertOk(M.setTime({ date: '第1日', time: '08:00' }, { skipMonotonicCheck: true }), 'skipMonotonicCheck 应跳过校验');
    helpers.assertEq(global.StateManager.get('time').date, '第1日', '日期应更新');
}

// ---- _isEarlier ----
function testIsEarlierByDate() {
    var M = freshState();
    helpers.assertOk(M._isEarlier({ date: '第3日' }, { date: '第5日' }), '第3日 < 第5日');
    helpers.assertEq(M._isEarlier({ date: '第5日' }, { date: '第3日' }), false, '第5日 不 < 第3日');
}

function testIsEarlierByTime() {
    var M = freshState();
    helpers.assertOk(M._isEarlier({ date: '第1日', time: '08:00' }, { date: '第1日', time: '09:00' }), '08:00 < 09:00');
    helpers.assertEq(M._isEarlier({ date: '第1日', time: '09:00' }, { date: '第1日', time: '08:00' }), false, '09:00 不 < 08:00');
}

function testIsEarlierByPeriod() {
    var M = freshState();
    helpers.assertOk(M._isEarlier({ period: '清晨' }, { period: '中午' }), '清晨 < 中午');
    helpers.assertEq(M._isEarlier({ period: '深夜' }, { period: '上午' }), false, '深夜 不 < 上午');
}

function testIsEarlierNullReturns() {
    var M = freshState();
    helpers.assertEq(M._isEarlier(null, { date: '第1日' }), false, 'null a 应返回 false');
    helpers.assertEq(M._isEarlier({ date: '第1日' }, null), false, 'null b 应返回 false');
}

// ---- _timeToMinutes ----
function testTimeToMinutes() {
    var M = freshState();
    helpers.assertEq(M._timeToMinutes('09:30'), 570, '09:30 = 570 分钟');
    helpers.assertEq(M._timeToMinutes('00:00'), 0, '00:00 = 0 分钟');
    helpers.assertEq(M._timeToMinutes('23:59'), 1439, '23:59 = 1439 分钟');
    helpers.assertEq(M._timeToMinutes('25:00'), null, '非法小时应返回 null');
    helpers.assertEq(M._timeToMinutes('12:60'), null, '非法分钟应返回 null');
    helpers.assertEq(M._timeToMinutes('invalid'), null, '非时间格式应返回 null');
    helpers.assertEq(M._timeToMinutes(''), null, '空串应返回 null');
    // 支持中文冒号
    helpers.assertEq(M._timeToMinutes('09：30'), 570, '中文冒号也应解析');
}

// ---- _dateValue ----
function testDateValueDayN() {
    var M = freshState();
    helpers.assertEq(M._dateValue('第1日'), 1, '第1日 = 1');
    helpers.assertEq(M._dateValue('第10天'), 10, '第10天 = 10');
    helpers.assertEq(M._dateValue('第 5 日'), 5, '支持空格');
}

function testDateValueYMD() {
    var M = freshState();
    helpers.assertEq(M._dateValue('2026-07-18'), 20260718, 'YYYY-MM-DD');
    helpers.assertEq(M._dateValue('2026年7月18日'), 20260718, 'YYYY年M月D日');
    helpers.assertEq(M._dateValue('2026/7/18'), 20260718, 'YYYY/M/D');
}

function testDateValueInvalid() {
    var M = freshState();
    helpers.assertEq(M._dateValue(''), null, '空串应返回 null');
    helpers.assertEq(M._dateValue(null), null, 'null 应返回 null');
    helpers.assertEq(M._dateValue('未知日期'), null, '不可解析应返回 null');
}

// 执行所有用例
var cases = [
    testSetTimeBasic, testSetTimeEmpty, testSetTimePhaseAlias, testSetTimeTrim,
    testSetTimeRejectBackward, testSetTimeRejectEarlierDate, testSetTimeAllowForward,
    testSetTimeAllowSameTime, testSetTimeAllowBackwardOption, testSetTimeSkipMonotonicCheck,
    testIsEarlierByDate, testIsEarlierByTime, testIsEarlierByPeriod, testIsEarlierNullReturns,
    testTimeToMinutes,
    testDateValueDayN, testDateValueYMD, testDateValueInvalid
];
for (var i = 0; i < cases.length; i++) {
    try {
        cases[i]();
        console.log('  ✓ ' + cases[i].name);
    } catch (e) {
        console.error('  ✗ ' + cases[i].name + '\n    ' + e.message);
        process.exit(1);
    }
}
console.log('TimeMutator tests passed (' + cases.length + ' cases)');
