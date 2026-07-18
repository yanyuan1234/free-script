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

console.log('OutputSanitizer tests passed');
