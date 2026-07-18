// ========================================
// OutputSanitizer 单元测试
// Run: node tests/ai-contract/output-sanitizer.test.js
// ========================================
var OutputSanitizer = require('../../js/ai-contract/output-sanitizer.js');

function assertEq(a, b, msg) {
    if (a !== b) throw new Error(msg + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
}

assertEq(OutputSanitizer.sanitizeStory('<p>hello</p><br>world▌'), 'hello\n\nworld', 'html/cursor');
assertEq(OutputSanitizer.sanitizeStory('hi <thinking>推理</thinking> there'), 'hi  there', 'thinking');
assertEq(OutputSanitizer.sanitizeJSON('```json\n{"a":1}\n```'), '{"a":1}', 'json code block');
assertEq(OutputSanitizer.stripJSONArtifacts('"story": "hello'), 'hello', 'json artifact');

// BUG：裸推理前缀（无标签）混在剧情前，应被剥离
assertEq(OutputSanitizer.stripBareThinking('我需要考虑下一步。\n\n{"story":"hello"}'), '{"story":"hello"}', 'single bare thinking para then json');
assertEq(OutputSanitizer.stripBareThinking('我需要考虑下一步。\n\n玩家选择了A。\n\n{"story":"hello"}'), '{"story":"hello"}', 'multiple bare thinking paras then json');
// 单段裸推理前缀后紧跟普通剧情文本（非 JSON），保持保守策略不剥离
assertEq(OutputSanitizer.stripBareThinking('我需要考虑下一步。\n\n真正的剧情从这里开始。'), '我需要考虑下一步。\n\n真正的剧情从这里开始。', 'single bare thinking para then plain story stays');

// BUG-A2：模型把设计思路写入 story 字段，sanitizeStory 应清洗为叙事正文或空
var leakedStory = '用户现在需要开始修仙养成的开局，首先得符合被退婚的废材，有系统金手指的设定。\n首先时间设定是第1天，卯时。\n然后NPC的话，首先退婚的那个，比如苏瑶。\n然后开局的场景：林墨在杂役院的破屋里醒来。\n然后choices的话三个选项。\n然后world模块的话，比如有个论道台的传闻。\n然后keyEvents的话，比如【收到苏瑶退婚文书】【金手指系统激活】。\n然后player的stats要完整。\n然后bag的话，初始有个退婚文书。\n然后quests的话，主线任务就是【洗刷废材之名，让退婚者后悔】。\n然后gameTime的话，日期是青岚历307年。\n然后心声的话，比如王伯的心声？\n\n林墨攥着退婚文书，系统在脑海中响起。';
var cleanedStory = OutputSanitizer.sanitizeStory(leakedStory);
if (cleanedStory.indexOf('用户现在需要') !== -1) throw new Error('sanitizeStory leaked user-now-needs');
if (cleanedStory.indexOf('首先得') !== -1) throw new Error('sanitizeStory leaked first-must');
if (cleanedStory.indexOf('然后NPC') !== -1) throw new Error('sanitizeStory leaked then-npc');
if (cleanedStory.indexOf('然后choices') !== -1) throw new Error('sanitizeStory leaked then-choices');
if (cleanedStory.indexOf('林墨攥着退婚文书') === -1) throw new Error('sanitizeStory removed real story: ' + JSON.stringify(cleanedStory));
console.log('sanitizeStory leaked design-thoughts test passed, cleaned length:', cleanedStory.length);

// BUG-A2-1：线上实际泄漏文本（单换行、"用户现在要"、"首先，主角"等）
var leakedStory2 = '用户现在要开始修仙被退婚的废材开局，首先得符合要求，第一回合的title要符合修仙术语。\n首先，主角的名字，先起个符合修仙的，比如叫林墨？对，身份是青云宗外门弟子，被退婚的废材。\n然后开局场景，时间的话，第一回合设定在青云宗外门。\n然后心声音的话，要写NPC的。\n然后choices的话，三个选项，要符合行动。\n\n林墨攥着退婚文书，系统的提示音在脑海中响起。';
var cleanedStory2 = OutputSanitizer.sanitizeStory(leakedStory2);
if (cleanedStory2.indexOf('用户现在要') !== -1) throw new Error('sanitizeStory leaked user-now-wants');
if (cleanedStory2.indexOf('首先，主角的名字') !== -1) throw new Error('sanitizeStory leaked first-name');
if (cleanedStory2.indexOf('然后开局场景') !== -1) throw new Error('sanitizeStory leaked then-scene');
if (cleanedStory2.indexOf('然后choices') !== -1) throw new Error('sanitizeStory leaked then-choices-2');
if (cleanedStory2.indexOf('林墨攥着退婚文书') === -1) throw new Error('sanitizeStory removed real story 2: ' + JSON.stringify(cleanedStory2));
console.log('sanitizeStory online leaked text test passed, cleaned length:', cleanedStory2.length);

// BUG-A3：模型把完整设计/规划/JSON 构造过程写入 story 字段
var leakedStory3 = '用户要求开始游戏，描述开局场景。这是一个修仙养成游戏。\n\n我需要：\n\n1. 设定初始时间\n\n2. 创建主角\n\n3. 描述开局场景\n\n4. 提供3个选项\n\n5. 包含所有必需的JSON字段\n\n世界观设定：修仙世界。\n\n主角设定：\n\n- 身份：被退婚的废材\n\n- 性格：隐忍、坚韧\n\nNPC设定：\n\n场景：应该是退婚现场。\n\n让我构建一个典型的退婚流开场：\n\n时间：第1天，辰时。\n\n地点：家族议事厅。\n\n事件：未婚妻来退婚，主角被羞辱，系统激活。\n\n选项应该：\n\nA. 接受退婚\n\nB. 拒绝退婚\n\nC. 激活系统\n\n我需要确保：\n\n- 使用第二人称\"你\"\n\n- 包含心声系统\n\n让我开始构建JSON。\n\n主角名：林枫\n\n年龄：16\n\n身份：林家旁支子弟\n\n性格：隐忍坚韧\n\n属性：\n\n- 灵根：杂灵根\n\n- 修为：炼气期一层\n\n- 体质：废脉\n\n- 声望：10\n\nNPC：\n\n1. 柳如烟\n\n任务：\n\n世界模块：\n\n时间：第1天，辰时，早晨。\n\n场景描述：\n\n让我写story部分。\n\n第1段：时间地点，氛围。\n\n第2段：柳家车队到来。\n\n选项：\n\nA. 强忍羞辱\n\n真正的剧情：林枫攥着退婚书，系统的提示音在脑海中响起。';
var cleanedStory3 = OutputSanitizer.sanitizeStory(leakedStory3);
if (cleanedStory3.indexOf('用户要求') !== -1) throw new Error('sanitizeStory leaked user-requires');
if (cleanedStory3.indexOf('我需要：') !== -1) throw new Error('sanitizeStory leaked i-need');
if (cleanedStory3.indexOf('1. 设定初始时间') !== -1) throw new Error('sanitizeStory leaked numbered-list');
if (cleanedStory3.indexOf('主角设定：') !== -1) throw new Error('sanitizeStory leaked protagonist-setting');
if (cleanedStory3.indexOf('让我构建') !== -1) throw new Error('sanitizeStory leaked let-me-build');
if (cleanedStory3.indexOf('选项应该：') !== -1) throw new Error('sanitizeStory leaked options-should');
if (cleanedStory3.indexOf('第1段：') !== -1) throw new Error('sanitizeStory leaked paragraph-plan');
if (cleanedStory3.indexOf('真正的剧情') === -1) throw new Error('sanitizeStory removed real story 3: ' + JSON.stringify(cleanedStory3));
console.log('sanitizeStory full design-thoughts test passed, cleaned length:', cleanedStory3.length);

console.log('OutputSanitizer tests passed');
