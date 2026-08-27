/**
 * 第三轮修复回归测试（用户报告的 5 个 bug）
 *
 * BUG-001 智能锻造主角性别被 AI 覆写：
 *   - phone-ui.js btnForgeSetup 只传 worldDescription，玩家填的主角表单（性别等）
 *     从未进入锻造 prompt，AI 自行编造主角且 pcIdentity 记忆优先级更高，
 *     玩家设定被永久覆写。
 *   - 修复：_appendMcFormToForgeBlob 拼接表单进 blob；_forceMcFormOverrides
 *     强制回写 entities.player / playerData / pcIdentity（第二道防线）。
 *
 * BUG-002 读档后回合数不同步：loadFromSlot 合并存档后无 progress.turn ↔
 *   _stats.totalTurns 镜像同步，UI 与存档列表各说各话。修复：取最大值双写。
 *
 * BUG-003 API 配置持久化静默丢失：
 *   - LocalGameAPI.save() 忽略 safeSetItem 失败返回值，localStorage 满时
 *     配置静默丢失，下次启动变空白。
 *   - 清空请求/错误日志按钮不调 save()，刷新后日志复活。
 *
 * BUG-004 版本号三处不一致：徽章硬编码 v1.0.7 永不更新（deploy.yml 只替换
 *   __BUILD_VERSION__ 占位符）、core.js GAME_VERSION=1.2.0、设置页 fallback v1.0.5。
 *
 * ISSUE 主菜单 "8/26" 裸数字无语义且 contenteditable 编辑不持久：
 *   - init.js 每次启动用当天日期覆写 menuTopDate，用户自定义（生日/纪念日）丢失。
 *   - 修复：MENU_TOP_DATE/NAME/MOTTO 三个 Storage key + blur 持久化 + title 说明。
 */

const fs = require('fs');
const path = require('path');

const phoneUiPath = path.join(__dirname, '..', 'js', 'phone-ui.js');
const corePath = path.join(__dirname, '..', 'js', 'core.js');
const gamePath = path.join(__dirname, '..', 'js', 'game.js');
const initPath = path.join(__dirname, '..', 'js', 'init.js');
const utilsPath = path.join(__dirname, '..', 'js', 'utils.js');
const badgePath = path.join(__dirname, '..', 'js', 'version-badge.js');
const htmlPath = path.join(__dirname, '..', 'index.html');

const phoneUiJs = fs.readFileSync(phoneUiPath, 'utf8');
const coreJs = fs.readFileSync(corePath, 'utf8');
const gameJs = fs.readFileSync(gamePath, 'utf8');
const initJs = fs.readFileSync(initPath, 'utf8');
const utilsJs = fs.readFileSync(utilsPath, 'utf8');
const badgeJs = fs.readFileSync(badgePath, 'utf8');
const htmlText = fs.readFileSync(htmlPath, 'utf8');

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok: !!ok, detail: detail || '' });
}

// ============================================================
// BUG-001：智能锻造主角性别覆写
// ============================================================

// 1. 锻造入口拼接主角表单
check('BUG-001: btnForgeSetup 调用 _appendMcFormToForgeBlob',
    /btnForgeSetup[^]*?_appendMcFormToForgeBlob\(blob\)/.test(phoneUiJs),
    '锻造 blob 必须带上玩家填写的主角设定表单');

// 2. 拼接函数存在且含最高优先级标记
const appendFn = phoneUiJs.match(/function _appendMcFormToForgeBlob\(blob\)\s*\{[\s\S]*?\n\s{4}\}/);
check('BUG-001: _appendMcFormToForgeBlob 函数存在',
    !!appendFn,
    '拼接函数应存在');
check('BUG-001: 拼接含"最高优先级"标记',
    appendFn && /最高优先级/.test(appendFn[0]),
    '拼接文本应声明玩家设定优先级最高，禁止 AI 更改');
check('BUG-001: 拼接遍历 MC_FIELD_MAP',
    appendFn && /MC_FIELD_MAP/.test(appendFn[0]),
    '应以 MC_FIELD_MAP 为单一字段映射来源');

// 3. 第二道防线：强制覆盖函数
check('BUG-001: _forceMcFormOverrides 函数存在',
    /function _forceMcFormOverrides\(mc\)/.test(phoneUiJs),
    '应有强制回写函数（防御 AI 仍返回不一致主角）');
const forceFn = phoneUiJs.match(/function _forceMcFormOverrides\(mc\)\s*\{[\s\S]*?\n\s{4}\}/);
check('BUG-001: 强制覆盖 entities.player',
    forceFn && /entities\.player/.test(forceFn[0]),
    '用户表单应强制覆盖 StateManager entities.player');
check('BUG-001: 强制覆盖 playerData 镜像',
    forceFn && /playerData/.test(forceFn[0]),
    '用户表单应同步 playerData 镜像');
check('BUG-001: 强制覆盖锻造记忆 pcIdentity（含 locked）',
    forceFn && /setPermanentFact\('pcIdentity'/.test(forceFn[0]) && /locked:\s*true/.test(forceFn[0]),
    '玩家指定的主角身份应写入最高优先级记忆区并锁定，防 AI 后续改写');

// 4. startNewGame 应用锻造结果后调用强制覆盖
check('BUG-001: startNewGame 调用 _forceMcFormOverrides',
    /_forceMcFormOverrides\(gameState\.protagonistSetup\)/.test(phoneUiJs),
    '开始新游戏收集表单后应强制覆盖锻造结果');

// ============================================================
// BUG-002：读档后回合数镜像同步
// ============================================================

check('BUG-002: loadFromSlot 含回合数镜像同步',
    /回合数镜像同步/.test(gameJs) && /totalTurns/.test(gameJs) && /progress\.turn/.test(gameJs),
    '读档后应同步 _stats.totalTurns 与 progress.turn');
const turnSync = gameJs.match(/回合数镜像同步[\s\S]{0,1200}/);
check('BUG-002: 同步取两者最大值',
    turnSync && /Math\.max\(_turnA,\s*_turnB\)/.test(turnSync[0]),
    '应取 max 防止回合数倒退');
check('BUG-002: 同步后刷新 storySceneLabel',
    turnSync && /storySceneLabel/.test(turnSync[0]),
    '读档后应立即刷新"第 N 回合"标签');

// ============================================================
// BUG-003：API 配置持久化
// ============================================================

check('BUG-003: LocalGameAPI.save 检查写入结果',
    /var _result = Storage\.setJSON\(Storage\.KEYS\.API_CONFIG/.test(coreJs),
    'save() 应接收 safeSetItem 结果');
check('BUG-003: 写入失败走降级重试',
    /_result && _result\.success === false/.test(coreJs) && /requestLog: \[\]/.test(coreJs),
    '失败时应丢弃非关键日志重试一次');
check('BUG-003: 重试仍失败时明确提示用户',
    /API 配置保存失败：浏览器存储空间已满/.test(coreJs),
    '重试仍失败时应 toast 告知用户，禁止静默丢失配置');
check('BUG-003: 清空请求记录按钮落盘',
    /btnClearApiRecent[\s\S]{0,600}LocalGameAPI\.save\(\)/.test(phoneUiJs),
    '清空请求记录后应调用 save() 持久化');
check('BUG-003: 清空错误日志按钮落盘',
    /btnClearApiErrors[\s\S]{0,600}LocalGameAPI\.save\(\)/.test(phoneUiJs),
    '清空错误日志后应调用 save() 持久化');

// ============================================================
// BUG-004：版本号统一
// ============================================================

check('BUG-004: 徽章使用 __BUILD_VERSION__ 占位符',
    /__BUILD_VERSION__/.test(htmlText) && !/>v1\.0\.7</.test(htmlText),
    'index.html 徽章应为占位符（deploy.yml 部署时注入），不再硬编码 v1.0.7');
check('BUG-004: version-badge.js 本地回退 GAME_VERSION',
    /fillLocalVersionFallback/.test(badgeJs) && /GAME_VERSION/.test(badgeJs),
    '本地直开时应回填 GAME_VERSION 而非显示占位符');
check('BUG-004: 配置 JSON 导出使用 GAME_VERSION',
    /typeof GAME_VERSION !== 'undefined' \? GAME_VERSION : 'unknown'/.test(phoneUiJs),
    'copyLogConfigJson 应引用真实存在的 GAME_VERSION（原 APP_VERSION 未定义恒为 unknown）');
check('BUG-004: 设置页版本统一函数存在',
    /function _getUnifiedVersionText\(\)/.test(phoneUiJs),
    '设置页应通过统一函数取版本号');
check('BUG-004: 设置页不再有第三个硬编码版本',
    !/'v1\.0\.5'/.test(phoneUiJs),
    '原 fallback v1.0.5 应删除');

// ============================================================
// ISSUE：主菜单 "8/26" 无语义 + 编辑不持久
// ============================================================

check('ISSUE: MENU_TOP_DATE/NAME/MOTTO 存储键已声明',
    /MENU_TOP_NAME:/.test(utilsJs) && /MENU_TOP_MOTTO:/.test(utilsJs) && /MENU_TOP_DATE:/.test(utilsJs),
    'Storage.KEYS 应新增三个主菜单资料键');
check('ISSUE: init.js 优先恢复自定义日期',
    /MENU_TOP_DATE/.test(initJs) && /todayStr/.test(initJs),
    '启动时应优先恢复用户保存的自定义日期，无保存值才用当天');
check('ISSUE: init.js 恢复昵称与签名',
    /MENU_TOP_NAME/.test(initJs) && /MENU_TOP_MOTTO/.test(initJs),
    '昵称/签名 contenteditable 也应持久化恢复');
check('ISSUE: menuTopDate 有 title 语义说明',
    /今日日期（月\/日）/.test(initJs),
    '裸日期应有 title 提示含义（参照 logTopDate 的 ISSUE-011 修复）');
check('ISSUE: 编辑持久化绑定存在',
    /_bindMenuTopProfilePersistence/.test(phoneUiJs),
    'blur 时应自动保存昵称/签名/日期');

// ============================================================
// 汇总输出
// ============================================================

let failed = 0;
console.log('\n==== 第三轮修复回归验证 ====');
results.forEach(r => {
    const icon = r.ok ? '✓' : '✕';
    console.log('  ' + icon + ' ' + r.name + (r.ok ? '' : ' — ' + r.detail));
    if (!r.ok) failed++;
});
console.log('----------------------------------------');
console.log('Passed: ' + (results.length - failed) + ' / ' + results.length);
if (failed > 0) {
    console.log('[FAIL] ' + failed + ' 项未通过');
    process.exit(1);
} else {
    console.log('[OK] fix-round3 all verified');
    process.exit(0);
}
