// ========================================
// QuestMutator 单元测试
// Run: node tests/state/quest-mutator.test.js
// ========================================
var helpers = require('../_helpers.js');
var QuestMutator = require('../../js/state/mutators/quest-mutator.js');

function freshState() {
    helpers.createFakeStateManager();
    return QuestMutator;
}

// ---- normalizeStatus ----
function testNormalizeStatusChinese() {
    var M = freshState();
    helpers.assertEq(M.normalizeStatus('进行中'), '进行中', '中文 进行中');
    helpers.assertEq(M.normalizeStatus('已完成'), '已完成', '中文 已完成');
    helpers.assertEq(M.normalizeStatus('已失败'), '已失败', '中文 已失败');
    helpers.assertEq(M.normalizeStatus('已放弃'), '已放弃', '中文 已放弃');
}

function testNormalizeStatusEnglish() {
    var M = freshState();
    helpers.assertEq(M.normalizeStatus('active'), '进行中', 'active → 进行中');
    helpers.assertEq(M.normalizeStatus('completed'), '已完成', 'completed → 已完成');
    helpers.assertEq(M.normalizeStatus('done'), '已完成', 'done → 已完成');
    helpers.assertEq(M.normalizeStatus('failed'), '已失败', 'failed → 已失败');
    helpers.assertEq(M.normalizeStatus('cancelled'), '已放弃', 'cancelled → 已放弃');
    helpers.assertEq(M.normalizeStatus('PENDING'), '进行中', 'PENDING 应不区分大小写');
}

function testNormalizeStatusEmpty() {
    var M = freshState();
    helpers.assertEq(M.normalizeStatus(''), '进行中', '空串默认 进行中');
    helpers.assertEq(M.normalizeStatus(null), '进行中', 'null 默认 进行中');
}

function testNormalizeStatusUnknownPassthrough() {
    var M = freshState();
    helpers.assertEq(M.normalizeStatus('隐藏状态'), '隐藏状态', '未知状态原样返回');
}

// ---- isCompleted / isFailed ----
function testIsCompleted() {
    var M = freshState();
    helpers.assertEq(M.isCompleted('已完成'), true, '已完成 → true');
    helpers.assertEq(M.isCompleted('done'), true, 'done → true');
    helpers.assertEq(M.isCompleted('进行中'), false, '进行中 → false');
}

function testIsFailed() {
    var M = freshState();
    helpers.assertEq(M.isFailed('已失败'), true, '已失败 → true');
    helpers.assertEq(M.isFailed('failed'), true, 'failed → true');
    helpers.assertEq(M.isFailed('已完成'), false, '已完成 → false');
}

// ---- normalizeType ----
function testNormalizeType() {
    var M = freshState();
    helpers.assertEq(M.normalizeType('main'), '主线', 'main → 主线');
    helpers.assertEq(M.normalizeType('主线'), '主线', '主线 → 主线');
    helpers.assertEq(M.normalizeType('side'), '支线', 'side → 支线');
    helpers.assertEq(M.normalizeType('hidden'), '隐藏', 'hidden → 隐藏');
    helpers.assertEq(M.normalizeType(''), '支线', '空默认 支线');
    helpers.assertEq(M.normalizeType(null), '支线', 'null 默认 支线');
}

// ---- normalizeRewards ----
function testNormalizeRewardsEmpty() {
    var M = freshState();
    helpers.assertEq(M.normalizeRewards(null), [], 'null → 空数组');
    helpers.assertEq(M.normalizeRewards('not array'), [], '非数组 → 空数组');
    helpers.assertEq(M.normalizeRewards([]), [], '空数组 → 空数组');
}

function testNormalizeRewardsMapping() {
    var M = freshState();
    var r = M.normalizeRewards([
        { type: 'item', name: '药水', amount: 2 },
        { title: '剑' },                   // 用 title 兜底
        { type: 'gold', amount: 100 },     // 缺 name
        null
    ]);
    helpers.assertEq(r.length, 3, '应保留 3 条（null 过滤）');
    helpers.assertEq(r[0].type, 'item', 'type');
    helpers.assertEq(r[0].name, '药水', 'name');
    helpers.assertEq(r[0].amount, 2, 'amount');
    helpers.assertEq(r[1].type, 'item', '默认 type=item');
    helpers.assertEq(r[1].name, '剑', 'title 应映射到 name');
    helpers.assertEq(r[1].amount, 1, '默认 amount=1');
    helpers.assertEq(r[2].name, '', '缺 name 时为空串');
}

// ---- normalizeQuest ----
function testNormalizeQuestBasic() {
    var M = freshState();
    var q = M.normalizeQuest({ title: '寻找宝箱', type: '主线', status: '进行中', progress: '0/3' });
    helpers.assertEq(q.title, '寻找宝箱', 'title');
    helpers.assertEq(q.type, '主线', 'type');
    helpers.assertEq(q.status, '进行中', 'status');
    helpers.assertEq(q.progress, '0/3', 'progress');
    helpers.assertEq(q.priority, 50, '默认 priority=50');
    helpers.assertEq(q.rewards, [], '默认 rewards 空数组');
    helpers.assertEq(q.stale, false, '默认 stale=false');
}

function testNormalizeQuestAliases() {
    var M = freshState();
    // name/content 别名
    var q1 = M.normalizeQuest({ name: '任务A' });
    helpers.assertEq(q1.title, '任务A', 'name 应映射到 title');
    var q2 = M.normalizeQuest({ content: '任务B' });
    helpers.assertEq(q2.title, '任务B', 'content 应映射到 title');
    // description 别名
    var q3 = M.normalizeQuest({ title: 'T', description: '描述' });
    helpers.assertEq(q3.desc, '描述', 'description 应映射到 desc');
}

function testNormalizeQuestInvalid() {
    var M = freshState();
    helpers.assertEq(M.normalizeQuest(null), null, 'null 应返回 null');
    helpers.assertEq(M.normalizeQuest({}), null, '缺 title 应返回 null');
    helpers.assertEq(M.normalizeQuest({ title: '' }), null, '空 title 应返回 null');
}

function testNormalizeQuestCompletedAutoProgress() {
    var M = freshState();
    // 已完成但进度未满 → 自动补齐
    var q = M.normalizeQuest({ title: 'T', status: 'completed', progress: '1/3' });
    helpers.assertEq(q.status, '已完成', 'status 应规范化为中文');
    helpers.assertEq(q.progress, '3/3', '已完成应补齐进度');
}

// ---- setQuests ----
function testSetQuestsBasic() {
    var M = freshState();
    helpers.assertOk(M.setQuests([{ title: '任务1', status: '进行中' }]), 'setQuests 应成功');
    var list = global.StateManager.get('entities.quests');
    helpers.assertEq(list.length, 1, '应写入 1 条');
    helpers.assertEq(list[0].title, '任务1', 'title');
}

function testSetQuestsMergesWithExisting() {
    var M = freshState();
    M.setQuests([{ title: '任务1', desc: '旧描述' }]);
    M.setQuests([{ title: '任务2' }]);
    var list = global.StateManager.get('entities.quests');
    helpers.assertEq(list.length, 2, '应合并保留 2 条');
    helpers.assertEq(list[0].title, '任务1', '保留旧任务');
    helpers.assertEq(list[0].desc, '旧描述', '保留旧 desc');
    helpers.assertEq(list[1].title, '任务2', '新增任务');
}

function testSetQuestsEmpty() {
    var M = freshState();
    helpers.assertOk(M.setQuests(null), 'null 输入应成功');
    helpers.assertEq(global.StateManager.get('entities.quests'), [], '应为空数组');
}

// ---- addQuest ----
function testAddQuestNew() {
    var M = freshState();
    helpers.assertOk(M.addQuest({ title: '新任务' }), 'add 新任务应成功');
    helpers.assertEq(global.StateManager.get('entities.quests').length, 1, '应有 1 条');
}

function testAddQuestInvalid() {
    var M = freshState();
    helpers.assertEq(M.addQuest(null), false, 'null 应返回 false');
    helpers.assertEq(M.addQuest({}), false, '缺 title 应返回 false');
    helpers.assertEq(global.StateManager.get('entities.quests').length, 0, '不应写入');
}

// ---- resolveQuest ----
function testResolveQuestCompleted() {
    var M = freshState();
    M.setQuests([{ title: '任务1', progress: '1/3' }]);
    helpers.assertOk(M.resolveQuest('任务1'), 'resolve 应成功');
    var list = global.StateManager.get('entities.quests');
    helpers.assertEq(list[0].status, '已完成', '应为已完成');
    helpers.assertEq(list[0].progress, '3/3', '进度应补齐为 3/3');
}

function testResolveQuestFailed() {
    var M = freshState();
    M.setQuests([{ title: '任务1', progress: '1/3' }]);
    helpers.assertOk(M.resolveQuest('任务1', M.STATUS.FAILED), 'resolve FAILED 应成功');
    var list = global.StateManager.get('entities.quests');
    helpers.assertEq(list[0].status, '已失败', '应为已失败');
    // 失败不应补齐进度
    helpers.assertEq(list[0].progress, '1/3', '失败时进度保持');
}

function testResolveQuestNotFound() {
    var M = freshState();
    M.setQuests([{ title: '任务1' }]);
    helpers.assertEq(M.resolveQuest('不存在的任务'), false, '未找到应返回 false');
    helpers.assertEq(M.resolveQuest(''), false, '空 title 应返回 false');
}

// ---- _smartMerge ----
function testSmartMergePreventRegression() {
    var M = freshState();
    // 先完成一个任务
    M.setQuests([{ title: '任务1', status: '已完成', progress: '3/3' }]);
    // AI 又返回同任务为进行中
    M.setQuests([{ title: '任务1', status: '进行中', progress: '0/3' }]);
    var list = global.StateManager.get('entities.quests');
    helpers.assertEq(list[0].status, '已完成', '应防止 AI 回退已完成状态');
}

function testSmartMergeKeepDescWhenEmpty() {
    var M = freshState();
    M.setQuests([{ title: '任务1', desc: '旧描述', hint: '旧提示' }]);
    // AI 返回同任务但 desc/hint 为空
    M.setQuests([{ title: '任务1', desc: '', hint: '' }]);
    var list = global.StateManager.get('entities.quests');
    helpers.assertEq(list[0].desc, '旧描述', '空 desc 应保留旧值');
    helpers.assertEq(list[0].hint, '旧提示', '空 hint 应保留旧值');
}

function testSmartMergeDoneLimit3() {
    var M = freshState();
    // 5 条已完成任务
    var quests = [];
    for (var i = 0; i < 5; i++) {
        quests.push({ title: '已完成' + i, status: '已完成', progress: '1/1' });
    }
    M.setQuests(quests);
    var list = global.StateManager.get('entities.quests');
    helpers.assertEq(list.length, 3, '已完成最多保留 3 条');
    helpers.assertEq(list[0].title, '已完成2', '应保留最后 3 条');
    helpers.assertEq(list[2].title, '已完成4', '最后一条');
}

function testSmartMergeKeepAllActive() {
    var M = freshState();
    var quests = [];
    for (var i = 0; i < 8; i++) {
        quests.push({ title: '进行中' + i, status: '进行中' });
    }
    M.setQuests(quests);
    helpers.assertEq(global.StateManager.get('entities.quests').length, 8, '活跃任务应全部保留');
}

// ---- _pickHigherProgress ----
function testPickHigherProgress() {
    var M = freshState();
    // 1/3 (33%) vs 2/3 (67%) → 取 2/3
    helpers.assertEq(M._pickHigherProgress('1/3', '2/3'), '2/3', '应取比率高的');
    // 2/4 (50%) vs 1/2 (50%) → 比率相同取分母大的
    helpers.assertEq(M._pickHigherProgress('2/4', '1/2'), '2/4', '比率相同时取分母大的');
}

// ---- _extractKeywords ----
function testExtractKeywords() {
    var M = freshState();
    var kw = M._extractKeywords('寻找 失落 宝箱');
    helpers.assertOk(kw.indexOf('寻找') !== -1, '应包含 "寻找"');
    helpers.assertOk(kw.indexOf('失落') !== -1, '应包含 "失落"');
    helpers.assertOk(kw.indexOf('宝箱') !== -1, '应包含 "宝箱"');
}

function testExtractKeywordsStopWords() {
    var M = freshState();
    var kw = M._extractKeywords('寻找 的 宝箱');
    helpers.assertEq(kw.indexOf('的'), -1, '应过滤停用词 "的"');
}

// ---- autoAdvanceByStory ----
function testAutoAdvanceByStoryMatch() {
    var M = freshState();
    M.setQuests([{ title: '击败魔王', status: '进行中', progress: '0/1' }]);
    var result = M.autoAdvanceByStory('勇者终于击败魔王，王国恢复了和平。');
    helpers.assertEq(result.changed, true, '应触发任务完成');
    var list = global.StateManager.get('entities.quests');
    helpers.assertEq(list[0].status, '已完成', '任务应被标记完成');
    helpers.assertEq(list[0].progress, '1/1', '进度应补齐');
}

function testAutoAdvanceByStoryNoMatch() {
    var M = freshState();
    M.setQuests([{ title: '击败魔王', status: '进行中' }]);
    var result = M.autoAdvanceByStory('勇者在森林里散步。');
    helpers.assertEq(result.changed, false, '不应触发完成');
    helpers.assertEq(global.StateManager.get('entities.quests')[0].status, '进行中', '保持进行中');
}

function testAutoAdvanceByStorySkipCompleted() {
    var M = freshState();
    M.setQuests([{ title: '击败魔王', status: '已完成', progress: '1/1' }]);
    var result = M.autoAdvanceByStory('勇者击败魔王。');
    helpers.assertEq(result.changed, false, '已完成任务不应再次触发');
}

function testAutoAdvanceByStorySkipGuidance() {
    var M = freshState();
    M.setQuests([{ id: 'guidance_1', title: '继续探索', status: '进行中' }]);
    // 引导任务即使关键词出现也不应被剧情触发完成
    var result = M.autoAdvanceByStory('继续探索发现了新地点。');
    helpers.assertEq(result.changed, false, '引导任务应跳过关键词匹配');
}

function testAutoAdvanceByStoryEmpty() {
    var M = freshState();
    M.setQuests([{ title: '击败魔王', status: '进行中' }]);
    helpers.assertEq(M.autoAdvanceByStory('').changed, false, '空文本不应触发');
    helpers.assertEq(M.autoAdvanceByStory(null).changed, false, 'null 不应触发');
}

// 执行所有用例
var cases = [
    testNormalizeStatusChinese, testNormalizeStatusEnglish, testNormalizeStatusEmpty,
    testNormalizeStatusUnknownPassthrough,
    testIsCompleted, testIsFailed,
    testNormalizeType,
    testNormalizeRewardsEmpty, testNormalizeRewardsMapping,
    testNormalizeQuestBasic, testNormalizeQuestAliases, testNormalizeQuestInvalid,
    testNormalizeQuestCompletedAutoProgress,
    testSetQuestsBasic, testSetQuestsMergesWithExisting, testSetQuestsEmpty,
    testAddQuestNew, testAddQuestInvalid,
    testResolveQuestCompleted, testResolveQuestFailed, testResolveQuestNotFound,
    testSmartMergePreventRegression, testSmartMergeKeepDescWhenEmpty,
    testSmartMergeDoneLimit3, testSmartMergeKeepAllActive,
    testPickHigherProgress,
    testExtractKeywords, testExtractKeywordsStopWords,
    testAutoAdvanceByStoryMatch, testAutoAdvanceByStoryNoMatch,
    testAutoAdvanceByStorySkipCompleted, testAutoAdvanceByStorySkipGuidance,
    testAutoAdvanceByStoryEmpty
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
console.log('QuestMutator tests passed (' + cases.length + ' cases)');
