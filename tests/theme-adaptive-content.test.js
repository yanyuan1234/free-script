// ========================================
// 题材自适应内容生成单元测试
// 验证 ThemeAdaptiveContent / AchievementSystem 兜底逻辑
// ========================================
var vm = require('vm');
var fs = require('fs');
var path = require('path');

// 模拟浏览器最小 DOM
if (typeof global.document === 'undefined') {
    global.document = {
        documentElement: {
            style: {}
        }
    };
}
if (typeof global.getComputedStyle === 'undefined') {
    global.getComputedStyle = function() {
        return {
            getPropertyValue: function() { return ''; }
        };
    };
}
if (typeof global.TimerManager === 'undefined') {
    global.TimerManager = {
        setTimeout: function(name, fn, delay) { return -1; },
        clearTimeout: function(name) {}
    };
}

// 加载 schema 与 StateManager 替身
var StateSchema = require(path.join(__dirname, '../js/state/schema.js'));
var helpers = require(path.join(__dirname, '_helpers.js'));

function setupGameState(themeText) {
    var state = StateSchema.getDefaultState();
    state.theme = themeText;
    state.userPrompt = themeText;
    state._worldModules = [];
    global.gameState = state;
    helpers.createFakeStateManager(state);
    return state;
}

// 将 systems.js 执行到当前全局上下文，使 ThemeAdaptiveContent / AchievementSystem 全局可用
var systemsCode = fs.readFileSync(path.join(__dirname, '../js/systems.js'), 'utf8');
vm.runInThisContext(systemsCode, { filename: 'systems.js' });

function assertEq(a, b, msg) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        throw new Error((msg || 'assertEq failed') + '\n  expected: ' + JSON.stringify(b) + '\n  actual:   ' + JSON.stringify(a));
    }
}

function assertOk(cond, msg) {
    if (!cond) throw new Error(msg || 'assertOk failed');
}

console.log('==== ThemeAdaptiveContent tests ====');

// 1. 题材检测：修仙
(function() {
    setupGameState('我想写一个修仙小说，主角拜入宗门，修炼金丹');
    var theme = ThemeAdaptiveContent.detectTheme();
    assertEq(theme, 'xianxia', '应识别修仙题材');
})();

// 2. 题材检测：赛博朋克
(function() {
    setupGameState('赛博朋克世界里，黑客入侵巨型企业，义体改造');
    var theme = ThemeAdaptiveContent.detectTheme();
    assertEq(theme, 'cyberpunk', '应识别赛博朋克题材');
})();

// 3. 默认现代题材
(function() {
    setupGameState('一个普通人的生活');
    var theme = ThemeAdaptiveContent.detectTheme();
    assertEq(theme, 'modern', '无匹配关键词时应回落现代题材');
})();

// 4. 动态排行榜生成
(function() {
    setupGameState('都市职场恋爱故事');
    var mods = ThemeAdaptiveContent.getDynamicRankingModules();
    assertEq(mods.length, 1, '应生成一个排行榜模块');
    assertEq(mods[0].type, 'ranking', '模块类型应为 ranking');
    assertOk(mods[0].items.length >= 5 && mods[0].items.length <= 8, '排行榜条目应在 5-8 条之间');
    assertOk(mods[0].items.every(function(it) { return it.name && it.value; }), '每条目应有 name 和 value');
})();

// 5. 动态成就生成
(function() {
    setupGameState('末世丧尸生存');
    var achs = ThemeAdaptiveContent.getDynamicAchievements();
    assertOk(achs.length >= 8 && achs.length <= 12, '成就数量应在 8-12 个之间，实际: ' + achs.length);
    var categories = {};
    achs.forEach(function(a) {
        categories[a.category] = true;
        assertOk(a.id && a.id.indexOf('theme_') === 0, '成就 ID 应以 theme_ 开头');
        assertOk(a.name, '成就应有名称');
        assertOk(a.condition, '成就应有条件表达式');
        assertOk(['common', 'rare', 'epic', 'legendary'].indexOf(a.rarity) >= 0, '成就稀有度应合法');
    });
    assertOk(Object.keys(categories).length >= 3, '成就应覆盖至少 3 个类别');
})();

// 6. 缓存稳定性：同一题材生成相同 ID
(function() {
    setupGameState('魔法学院新生入学，学习魔咒与魔药');
    var a1 = ThemeAdaptiveContent.getDynamicAchievements();
    var a2 = ThemeAdaptiveContent.getDynamicAchievements();
    assertEq(a1.map(function(a) { return a.id; }), a2.map(function(a) { return a.id; }), '同一题材应生成稳定成就 ID');
})();

// 7. AchievementSystem 在无 AI 成就时使用动态兜底
(function() {
    setupGameState('武侠江湖恩怨');
    gameState._worldModules = [];
    var achs = AchievementSystem.getDefaultAchievements();
    assertOk(achs.length >= 8, 'AchievementSystem 应在无 AI 成就时返回动态成就');
    assertOk(achs[0].id.indexOf('theme_wuxia_') === 0, '动态成就 ID 应包含题材');
})();

// 8. AchievementSystem 在有 AI 成就时优先使用 AI 成就
(function() {
    setupGameState('武侠江湖恩怨');
    gameState._worldModules = [{
        type: 'achievements',
        items: [
            { id: 'ai_ach_1', name: 'AI成就', desc: '测试', category: 'special', rarity: 'legendary', icon: '测试', condition: 'true', points: 100 }
        ]
    }];
    var achs = AchievementSystem.getDefaultAchievements();
    assertEq(achs.length, 1, '有 AI 成就时应优先使用 AI 成就');
    assertEq(achs[0].id, 'ai_ach_1', '应使用 AI 成就 ID');
})();

// 9. 成就条件可被 checkAchievements 正确解析
(function() {
    setupGameState('科幻星际冒险');
    gameState._worldModules = [];
    gameState.conversationHistory = [{ role: 'assistant', content: '第一段故事' }];
    var newly = AchievementSystem.checkAchievements();
    assertOk(newly.some(function(a) { return a.id === 'theme_scifi_first_step'; }), '完成一段故事后应解锁 first_step 成就');
})();

console.log('All ThemeAdaptiveContent tests passed.');
