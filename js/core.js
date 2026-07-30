// ========================================
// 第0层: 全局变量和配置
// ========================================
// 【已清理】移除开发模式日志重定向，减少运行时开销
// ========================================
// 自由剧本 - 完整游戏逻辑
// ========================================
//

// -----------------------------------------------
// 本文件 6250+ 行混合 13 个职责域（拆分规划，按行号定位）：
//   1.  数据同步（_sync*/_push*）                L42-371
//   2.  UI 弹窗/导航/模态（UI 对象）              L386-907
//   3.  API Key 混淆（_obfuscateKey 等）          L912-967
//   4.  API 配置与重试（LocalGameAPI）            L967-1407
//   5.  IndexedDB 存档（SaveDB）                  L1411-1810
//   6.  题材库（THEME_LIBRARY）                   L1815-1994
//   7.  全局状态工厂（createDefaultGameState 等）  L1999-2265
//   8.  打字机（TypewriterBuffer）                L2269-2591
//   9.  时间系统（GameTimeSystem）                L2626-2760
//   10. JSON 解析 + 小剧场映射（extractStr 等）   L2764-4085
//   11. 错误翻译/HTML 净化（translateError 等）   L4091-4440
//   12. AI 请求构建（callAI/executeAIStream）     L4902-5437
//   13. 模型上下文检测（_KNOWN_MODEL_CONTEXT）    L5701-5920
//
// 【架构升级进度 2026-07-17】
// ✅ 流式解析已移至 Web Worker（stream-worker.js + stream-bridge.js）
//    - callAI 优先调用 StreamBridge.executeAIStreamViaWorker
//    - Worker 不可用时自动降级到 executeAIStream（本文件保留）
//    - SSE 解析 + JSON.parse + 文本累加全部在 Worker 线程，主线程只接收节流后的 CHUNK
// ⏳ core.js 拆分：本次仅做行号定位（见上），物理拆分待后续按需进行
//    拆分原则：每个职责域抽到独立文件，core.js 保留 facade 重导出，保持全局名兼容
//    风险控制：translateError 等闭包耦合函数需要先重构才能拆分，避免机械拆分引入回归
//

//   - core.js 不再直接调用 game.js 函数，统一走 RuntimeBridge.xxx()
//   - game.js 在文件末尾将自身函数注册到 RuntimeBridge，供 core.js 使用
//   - core.js → game.js 的原依赖：formatStory / mergeCharacters / renderChoices /
//     renderNpcList / buildSystemPrompt / buildSaveData / sendAIRequest / _isThinkingContent /
//     _cleanUnrecognizedTags / _reDecorTagsTyping
//   - game.js → core.js 的依赖保持不变（core.js 先加载，game.js 后加载直接调用）
//
// 长期：core.js 按职责拆为 core/{data-sync,ui,api,save,theme,state-factory,
//       typewriter,time,parser,error,ai-request}.js，每个模块可独立测试


// 原实现 _refreshers 永远为空对象（register 全代码库零调用），
// 但 25+ 处仍调 refreshByDataChange/refreshAll，每次触发无意义的 rAF + 空对象遍历。
// 数据变更后的 UI 刷新已由各具体调用方主动触发（如 renderNpcList/renderQuests 等），
// GameLinker 这层"广播"是死代码，直接删除。

// ========================================
// 数据联通（方案 A：单一来源）
// ========================================
// 设计：StateManager 为唯一权威源，gm.tables.* / gm.quests / gm.events 是其运行时缓存视图，
//       gameState.allCharacters / currentBag / currentQuests / relationships / keyEvents 为 legacy 视图。
// 任何状态变更应经对应 Mutator → StateManager.set；_syncLegacyMirror 自动回写 legacy 字段，
// 需要时调用 _ensureDataLinkage() 建立视图别名（gameState.allCharacters === gm.tables.characters）。
// ========================================

// ========================================

// 原代码 8 个函数（4 sync + 4 push）各自手写：
//   - null check gameState + window.GameMemory
//   - 取数据源（keyed object 或 array）
//   - 写 gameState[field]
//   - silent:true 写 StateManager
// 抽取 3 个小工具消除重复，统一行为（silent:true 永远不会漏）：
//   _safeGameState() - 取 gameState（含 null check）
//   _safeGM()        - 取 window.GameMemory（含 null check）
//   _mirrorToState(stateKey, smPath, value) - 同步写 gameState + StateManager
// 业务变换（per-type mapper）仍内联在每个 sync/push 函数内，因为：
//   1. 每种数据 schema 不同，强行抽象反而难读
//   2. 调试时 per-type 逻辑就地可见
// ========================================
function _safeGameState() {
    return (typeof gameState !== 'undefined' && gameState) ? gameState : null;
}
function _safeGM() {
    return (typeof window !== 'undefined' && window.GameMemory) ? window.GameMemory : null;
}
/**
 * 同步写 gameState[field] + StateManager.set(smPath)
 * silent:true 避免循环通知（同步函数本身就是各种写入路径的下游）
 * @param {string} stateKey - gameState 字段名
 * @param {string} smPath - StateManager 路径（如 'entities.bag'）
 * @param {*} value - 要写入的值
 */
function _mirrorToState(stateKey, smPath, value) {
    var gs = _safeGameState();
    if (gs) gs[stateKey] = value;
    if (typeof StateManager !== 'undefined' && StateManager.set) {
        StateManager.set(smPath, value, { silent: true });
    }
}

// ========================================

// ========================================
//
// 旧实现：8 个函数各自处理 (keyed object ↔ array) 转换，字段映射表重复 4-5 处
// 新实现：声明式 mapper + 通用 _syncTable / _pushTable 函数
//
// mapper 字段:
//   fromArray: 把 array 元素转为 keyed object 元素（_push* 用）
//   toArr:     把 keyed object 元素转为 array 元素（_sync* 用）
//   keyField:  从 array 元素提取去重键（_push* 用）
//   pickFrom:  从 gs.array[i] 提取字段子集（_push* 用）
//   onAdd:     新增元素时的钩子（_push* 用）
//   onUpdate:  更新元素时的钩子（_push* 用）
//
const _TABLE_MAPPERS = {
    items: {
        fromArray: function (b) { return {
            name: b.name,
            qty: b.count || 1,
            unit: b.unit || '个',
            rarity: b.rarity || '普通',
            desc: b.desc || '',
            usable: b.usable || false,
            effect: b.effect || '',
            equippable: b.equippable || false,
            equipped: b.equipped || false,
            slot: b.slot || ''
        }; },
        toArr: function (it) { return {
            name: it.name,
            count: it.qty || 1,
            unit: it.unit || '个',
            rarity: it.rarity || '普通',
            desc: it.desc || '',
            usable: it.usable || false,
            effect: it.effect || '',
            equippable: it.equippable || false,
            equipped: it.equipped || false,
            slot: it.slot || ''
        }; },
        keyField: 'name',
        pickFrom: function (b) { return ['count', 'unit', 'rarity', 'desc', 'usable', 'effect', 'equippable', 'equipped', 'slot']; }
    },
    quests: {
        fromArray: function (cq) {
            // 状态映射：通过 QuestMutator 统一判断（fallback 为内联兼容）
            var gStatus = 'pending';
            if (typeof QuestMutator !== 'undefined') {
                if (QuestMutator.isCompleted(cq.status)) gStatus = 'resolved';
                else if (QuestMutator.isFailed(cq.status)) gStatus = 'broken';
            } else {
                if (cq.status === '已完成' || cq.status === 'resolved') gStatus = 'resolved';
                else if (cq.status === '已失败' || cq.status === '失败' || cq.status === 'broken') gStatus = 'broken';
            }
            return {
                title: cq.title,
                type: cq.type || 'quest',
                status: gStatus,
                progress: cq.progress || '',
                hint: cq.hint || ''
            };
        },
        toArr: function (q) { return {
            title: q.title,
            type: q.type || 'quest',
            status: q.status || 'pending',
            progress: q.progress || '',
            hint: q.hint || ''
        }; },
        keyField: 'title'
    }
};

/**
 * 通用同步：gm.tables.X (keyed) → gameState.Y (array) + StateManager
 * 替代 4 个 _sync* 函数（items/quests/relationships/keyEvents）
 */
function _syncTable(tableName, stateKey, smPath, mapper) {
    var gm = _safeGM();
    var gs = _safeGameState();
    if (!gm || !gs) return;
    if (tableName === 'quests' || tableName === 'events') {
        // array 结构（gm.quests, gm.events）
        var src = gm[tableName] || (gm.tables && gm.tables[tableName]) || [];
        if (!Array.isArray(src)) return;
        var arr = src.map(mapper.toArr).filter(Boolean);
        _mirrorToState(stateKey, smPath, arr);
    } else if (tableName === 'relationships') {
        // keyed 结构,value 可能是 array 也可能是 object
        var rels = (gm.tables && gm.tables.relationships) || {};
        var out = [];
        Object.keys(rels).forEach(function (k) {
            var v = rels[k];
            if (!v) return;
            if (Array.isArray(v)) v.forEach(function (item) { out.push(item); });
            else out.push(v);
        });
        _mirrorToState(stateKey, smPath, out);
    } else {
        // keyed 结构（gm.tables.items/characters/locations）
        var src2 = (gm.tables && gm.tables[tableName]) || {};
        var out2 = Object.keys(src2).map(function (k) { return mapper.toArr(src2[k]); }).filter(Boolean);
        _mirrorToState(stateKey, smPath, out2);
    }
}

/**
 * 通用反向推送：gameState.X (array) → gm.tables.Y (keyed)
 * 替代 4 个 _push* 函数
 */
function _pushTableToGM(tableName, stateKey, gmField, mapper) {
    var gm = _safeGM();
    var gs = _safeGameState();
    if (!gm || !gs || !Array.isArray(gs[stateKey])) return;
    if (tableName === 'quests' || tableName === 'events') {
        // 推送 array
        if (tableName === 'quests') {
            if (!Array.isArray(gm.quests)) gm.quests = [];
            var titleMap = {};
            gm.quests.forEach(function (q) { if (q && q.title) titleMap[q.title] = q; });
            gs[stateKey].forEach(function (cq) {
                if (!cq || !cq.title) return;
                var gq = titleMap[cq.title];
                if (!gq) {
                    gq = Object.assign(mapper.fromArray(cq), { createdTurn: gm.currentTurn || 0, resolvedTurn: 0 });
                    gm.quests.push(gq);
                    titleMap[cq.title] = gq;
                } else {
                    Object.assign(gq, mapper.fromArray(cq));
                }
            });
        } else {
            // events - 推送到 gm.events (array, source: 'undo_restore')
            if (!Array.isArray(gm.events)) gm.events = [];
            gs[stateKey].forEach(function (evt) {
                if (typeof evt !== 'string' || !evt) return;
                var exists = gm.events.some(function (e) {
                    var content = typeof e === 'string' ? e : (e.content || '');
                    return content === evt;
                });
                if (!exists) gm.events.push({ content: evt, importance: 7, source: 'undo_restore', turn: gm.currentTurn || 0 });
            });
        }
    } else if (tableName === 'relationships') {
        // relationships keyed by from→to
        if (!gm.tables) gm.tables = {};
        if (!gm.tables.relationships) gm.tables.relationships = {};
        gs[stateKey].forEach(function (r) {
            if (!r || !r.from || !r.to) return;
            var key = r.from + '→' + r.to;
            if (gm.tables.relationships[key]) Object.assign(gm.tables.relationships[key], r);
            else gm.tables.relationships[key] = Object.assign({}, r);
        });
    } else {
        // keyed 结构（items）
        if (!gm.tables) gm.tables = {};
        if (!gm.tables[tableName]) gm.tables[tableName] = {};
        gs[stateKey].forEach(function (b) {
            if (!b || !b[mapper.keyField]) return;
            var k = b[mapper.keyField];
            var existing = gm.tables[tableName][k];
            if (existing) {
                var picked = mapper.fromArray(b);
                Object.assign(existing, picked);
                existing.lastChangedTurn = gm.currentTurn;
            } else {
                var newItem = mapper.fromArray(b);
                newItem.obtainedTurn = gm.currentTurn;
                newItem.lastChangedTurn = gm.currentTurn;
                gm.tables[tableName][k] = newItem;
            }
        });
    }
}

// 物品同步：gm.tables.items (keyed) → gameState.currentBag (array) + StateManager

function _syncItemsToBag() {
    _syncTable('items', 'currentBag', 'entities.bag', _TABLE_MAPPERS.items);
}

// 任务同步：gm.quests (array) → gameState.currentQuests (array, 旧格式) + StateManager

function _syncQuestsToGameState() {
    _syncTable('quests', 'currentQuests', 'entities.quests', _TABLE_MAPPERS.quests);
}

// 关系同步：gm.tables.relationships (keyed) → gameState.relationships (array) + StateManager

function _syncRelationshipsToGameState() {
    _syncTable('relationships', 'relationships', 'entities.relationships', null);
}

// 事件同步：gm.events (对象数组) → gameState.keyEvents (字符串数组) + StateManager.entities.events (对象数组)

function _syncEventsToKeyEvents() {
    var gm = _safeGM();
    if (!gm || !Array.isArray(gm.events)) return;
    var keyEvents = gm.events.map(function (e) {
        return typeof e === 'string' ? e : (e && e.content || '');
    }).filter(function (s) { return s && s.length > 0; });
    var gs = _safeGameState();
    if (gs) gs.keyEvents = keyEvents;
    if (typeof StateManager !== 'undefined' && StateManager.set) {
        StateManager.set('entities.events', gm.events, { silent: true });
    }
}

// 总入口：把所有权威源同步到视图
function _ensureDataLinkage() {
    var gm = _safeGM();
    if (!gm || !_safeGameState()) return;
    // 1. 角色：建立引用别名（最快方式）
    if (gm.tables && gm.tables.characters) {
        if (gameState.allCharacters !== gm.tables.characters) {
            // 只有在不同引用时才重新别名（避免循环引用警告）
            gameState.allCharacters = gm.tables.characters;
        }
    }
    // 2-5. 其他视图同步
    _syncItemsToBag();
    _syncQuestsToGameState();
    _syncRelationshipsToGameState();
    _syncEventsToKeyEvents();
}

// 把 gameState.currentBag 反向推送到 gm.tables.items（让权威源更新）

function _pushCurrentBagToGM() {
    _pushTableToGM('items', 'currentBag', 'items', _TABLE_MAPPERS.items);
}

// 把 gameState.currentQuests 反向推送到 gm.quests

function _pushCurrentQuestsToGM() {
    _pushTableToGM('quests', 'currentQuests', 'quests', _TABLE_MAPPERS.quests);
}

// 把 gameState.relationships 反向推送到 gm.tables.relationships

function _pushRelationshipsToGM() {
    _pushTableToGM('relationships', 'relationships', 'relationships', null);
}

// 把 gameState.keyEvents 反向推送到 gm.events

function _pushKeyEventsToGM() {
    _pushTableToGM('events', 'keyEvents', 'events', null);
    // 推送后立即 sync 回去，让 StateManager 与 gameState 同步
    if (typeof _syncEventsToKeyEvents === 'function') {
        _syncEventsToKeyEvents();
    }
}

// 拦截 gm.saveToStorage：保存后自动同步 + 通知 UI

// + 绕开 TimerManager。现在改为：直接在 GameMemory 加载后一次性 wrap
// （模块加载顺序已固定：core.js 必在 tavern-compat.js 之后；GameMemory 在
// tavern-compat.js 末尾 `var GameMemory = {...}` 定义）。
// 兜底用 TimerManager 延迟 0ms 给浏览器一帧时间，确保 GameMemory 已实例化。
// TimerManager 必须存在才挂载（避免极早期启动时报错）。
(function _wrapGMSaveToStorage() {
    if (typeof window === 'undefined') return;
    function _doWrap() {
        var gm = window.GameMemory;
        if (!gm || !gm.saveToStorage || gm._saveToStorageWrapped) return;
        var orig = gm.saveToStorage;
        gm.saveToStorage = function() {
            var result = orig.apply(this, arguments);
            try { _ensureDataLinkage(); } catch (e) { console.warn('[DataLinkage] 同步失败:', e); }
            return result;
        };
        gm._saveToStorageWrapped = true;
    }
    // 立即尝试一次（GameMemory 已在 core.js 之前定义完毕）
    _doWrap();
    // 兜底：1 秒后再试（应对 GameMemory 异常延迟初始化的极端情况）
    if (typeof TimerManager !== 'undefined' && TimerManager.setTimeout) {
        TimerManager.setTimeout('wrapGMSaveRetry', function() { _doWrap(); }, 1000);
    } else {
        // TimerManager 也不可用时退回裸 setTimeout（最终兜底）
        setTimeout(function() { _doWrap(); }, 1000);
    }
})();

// ========================================
// UI工具
// ========================================

/**
 * 【全游戏弹窗策略】所有自动消失的弹窗都必须在 3 秒内消失
 * 理由：用户偏好快速反馈，避免视线被无关通知遮蔽
 * 适用范围：toast / 错误 banner / API 成功失败提示 / 成就解锁 / NPC 消息提醒
 * 不适用：UI.confirm / UI.alert / UI.prompt / 模态框（需用户主动操作）
 *
 * 修改本常量即可全局生效。新增弹窗必须使用本常量，禁用硬编码 3000
 */
var POPUP_DURATION_MS = 3000;
var UI = {
    // 【全游戏弹窗策略】常量对外暴露（约定：3 秒 = 3000ms）
    TOAST_DURATION: POPUP_DURATION_MS,
    // 【导航栈】支持返回上一级
    _navStack: [],
    pushNav: function(type, id) {
        // type: 'page' 或 'modal'
        this._navStack.push({ type: type, id: id });
        history.pushState(null, '', location.href);
    },
    popNav: function() {
        if (this._navStack.length === 0) return false;
        var top = this._navStack.pop();
        if (top.type === 'modal') {
            this.hideModal(top.id);
            return true;
        }
        if (top.type === 'page') {
            // 非剧情页返回剧情页
            if (top.id !== 'storyPage') {
                this.showPage('storyPage');
                if (typeof renderNavBar === 'function') {
                    renderNavBar('gameNav', UI.GAME_NAV_TABS, 0);
                }
            }
            return true;
        }
        return false;
    },
    toast: function(msg, type) {
        var ct = DOMCache.get('toastContainer', true);
        if (!ct) return;
        // 【第4轮优化】堆叠上限：最多保留 3 个 toast，超出移除最旧的
        // 避免快速连续调用时移动端 toast 溢出视口
        while (ct.children && ct.children.length >= 3) {
            if (ct.firstChild) ct.firstChild.remove();
        }
        var t = document.createElement('div');
        // [T2-P1-3] 接受 type 参数，附加 toast-info/success/warning/error class 实现 4 种颜色区分
        t.className = 'toast' + (type ? ' toast-' + type : '');
        t.textContent = msg;

        t.setAttribute('role', 'status');
        t.setAttribute('aria-live', 'polite');
        t.setAttribute('aria-atomic', 'true');
        ct.appendChild(t);
        // 【全游戏弹窗策略】3 秒自动消失——使用 POPUP_DURATION_MS 常量
        // 【缺陷修复】使用唯一 key，避免连续 toast 时旧定时器被清除导致 DOM 永久残留
        var toastKey = 'uiToast_' + Date.now() + '_' + Math.random();
        TimerManager.setTimeout(toastKey, function() {
            if (t.parentNode) t.remove();
        }, POPUP_DURATION_MS);
    },
    showPage: function(id) {
        var el = document.getElementById(id);
        if (el && el.classList.contains('active')) return;
        // 记录离开页，若从日志页离开则关闭其子页面
        var fromPage = document.querySelector('.page.active');
        // 【导航栈】页面切换时入栈（剧情页不入栈，它是根页面）
        if (id !== 'storyPage' && id !== 'menuPage' && id !== 'loadingPage') {
            this.pushNav('page', id);
        }
        var pages = document.querySelectorAll('.page');
        for (let pi = 0; pi < pages.length; pi++) {
            pages[pi].classList.remove('active');
        }
        if (el) el.classList.add('active');

        if (fromPage && fromPage.id === 'logPage' && id !== 'logPage' && typeof closeLogSubPage === 'function') {
            try { closeLogSubPage(); } catch (e) {}
        }

        if (!el) return;
        el.scrollTop = 0;
        var body = el.querySelector('.page-body');
        if (body) body.scrollTop = 0;
        // 【打字机优化】离开剧情页时强制隐藏「跳过」按钮，避免在其他页面残留
        if (id !== 'storyPage' && typeof _hideSkipButton === 'function') {
            try { _hideSkipButton(); } catch (e) {}
        }
    },
    _modalStack: [],
    _lastFocusBeforeModal: null,
    _modalKeydownBound: false,

    _focusableSelector: 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    showModal: function(id) {
        var el = document.getElementById(id);
        if (el) {
            // 【缺陷修复】已激活的 modal 不重复入栈，避免 z-index 虚高和导航栈残留
            if (this._modalStack.indexOf(id) !== -1) {
                return;
            }
            // 记录打开弹窗前的焦点元素，关闭时恢复
            if (this._modalStack.length === 0) {
                this._lastFocusBeforeModal = document.activeElement;
            }
            // 【导航栈】模态框打开时入栈
            this.pushNav('modal', id);
            // 模态框栈管理：每次打开新模态框时提升z-index
            this._modalStack.push(id);
            var zIndex = 100 + this._modalStack.length * 10;
            el.style.zIndex = zIndex;
            el.classList.add('active');
            // 兼容动态创建的弹窗（使用 display 控制）
            if (el.classList.contains('modal-overlay')) {
                el.style.display = 'flex';
            }

            if (!el.getAttribute('role')) el.setAttribute('role', 'dialog');
            el.setAttribute('aria-modal', 'true');
            // 尝试关联标题
            var titleEl = el.querySelector('.modal-title, .modal-header h3, h3, h2, .title');
            if (titleEl) {
                if (!titleEl.id) titleEl.id = id + '_title';
                el.setAttribute('aria-labelledby', titleEl.id);
            }

            this._focusModal(el);

            this._bindModalKeyboard();
            // 点击遮罩区域关闭模态框
            if (!el._maskClickBound) {
                el._maskClickBound = true;
                el.addEventListener('click', function(e) {
                    if (e.target !== el) return;
                    // 【缺陷修复】confirm/prompt 遮罩点击时触发 resolve，避免 Promise 永久悬挂
                    if (el.id === 'confirmModal') {
                        var yb = document.getElementById('confirmYes');
                        var nb = document.getElementById('confirmNo');
                        if (yb && yb._confirmResolve) { yb._confirmResolve(false); yb._confirmResolve = null; }
                        if (nb) nb._confirmResolve = null;
                    } else if (el.id === 'promptModal') {
                        var ob = document.getElementById('promptOk');
                        var cb = document.getElementById('promptCancel');
                        if (ob && ob._promptResolve) { ob._promptResolve(null); ob._promptResolve = null; }
                        if (cb) cb._promptResolve = null;
                    } else if (el.id === 'generatingModal') {
                        // 【缺陷修复】遮罩点击触发 onCancel，避免 AI 请求在后台继续运行
                        if (typeof el._generatingOnCancel === 'function') {
                            var cb2 = el._generatingOnCancel;
                            el._generatingOnCancel = null;
                            try { cb2(); } catch (e2) { console.warn('[Generating] mask onCancel:', e2); }
                        }
                    }
                    UI.hideModal(el.id);
                });
            }
        }
    },

    _focusModal: function(el) {
        var focusable = el.querySelectorAll(this._focusableSelector);
        var target = null;
        // 优先聚焦到输入框或确认按钮
        for (let i = 0; i < focusable.length; i++) {
            var tag = focusable[i].tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') {
                target = focusable[i];
                break;
            }
        }
        if (!target && focusable.length > 0) target = focusable[0];
        if (target) {
            try { target.focus(); } catch(e) {}
        } else {
            el.setAttribute('tabindex', '-1');
            try { el.focus(); } catch(e) {}
        }
    },

    _bindModalKeyboard: function() {
        if (this._modalKeydownBound) return;
        this._modalKeydownBound = true;
        document.addEventListener('keydown', function(e) {
            if (UI._modalStack.length === 0) return;
            var topId = UI._modalStack[UI._modalStack.length - 1];
            var topModal = document.getElementById(topId);
            if (!topModal) return;

            // Escape 关闭最顶层弹窗
            // [P0-1 修复] confirm/prompt 现在允许 ESC 触发「取消」语义
            // （之前 by design 屏蔽 ESC，导致用户卡死「检测到未保存的进度」弹窗）
            // generatingModal 仍保持屏蔽（生成中不可中断 UI）
            if (e.key === 'Escape' || e.code === 'Escape' || e.keyCode === 27) {
                if (topId === 'generatingModal') return;
                if (topId === 'confirmModal') {
                    // 复用 confirmNo 的处理路径，保证状态机一致
                    var noBtn = document.getElementById('confirmNo');
                    if (noBtn && noBtn._confirmHandler) {
                        noBtn._confirmHandler();
                        e.preventDefault();
                        return;
                    }
                }
                if (topId === 'promptModal') {
                    // prompt 的 ESC 走取消路径
                    var cancelBtn = document.querySelector('#promptModal [data-close="promptModal"]');
                    if (cancelBtn) { cancelBtn.click(); e.preventDefault(); return; }
                }
                e.preventDefault();
                UI.hideModal(topId);
                return;
            }

            // Tab 焦点陷阱
            if (e.key === 'Tab' || e.code === 'Tab') {
                var focusable = topModal.querySelectorAll(UI._focusableSelector);
                if (focusable.length === 0) return;
                var first = focusable[0];
                var last = focusable[focusable.length - 1];
                if (e.shiftKey) {
                    if (document.activeElement === first || !topModal.contains(document.activeElement)) {
                        e.preventDefault();
                        last.focus();
                    }
                } else {
                    if (document.activeElement === last || !topModal.contains(document.activeElement)) {
                        e.preventDefault();
                        first.focus();
                    }
                }
            }
        });
    },
    // ========================================
    // 【统一弹窗管理】动态创建模态框，走统一调度
    // 用法：UI.createModal({ id, html, onClose?, persistent? })
    // - id: 唯一标识，用于 showModal/hideModal 管理
    // - html: 弹窗内容 HTML
    // - onClose: 关闭回调（可选）
    // - persistent: true 时不自动移除 DOM，仅隐藏（可选）
    // ========================================
    createModal: function(opts) {
        var id = opts.id || ('dynamicModal_' + Date.now());
        // 如果已存在同 id 的弹窗，先移除
        var existing = document.getElementById(id);
        if (existing) existing.remove();
        // 创建遮罩层
        var overlay = document.createElement('div');
        overlay.id = id;
        overlay.className = 'modal-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100;display:none;align-items:center;justify-content:center;';
        // 创建内容容器
        var content = document.createElement('div');
        content.className = 'modal-content';
        content.setAttribute('role', 'document');
        content.innerHTML = (typeof sanitizeHtml === 'function') ? sanitizeHtml(opts.html || '') : ((typeof escapeHtml === 'function') ? escapeHtml(opts.html || '') : (opts.html || ''));
        content.style.cssText = 'background:var(--card);border-radius:var(--radius-lg);max-width:400px;width:90%;max-height:80vh;overflow-y:auto;padding:20px;';
        overlay.appendChild(content);
        document.body.appendChild(overlay);
        // 注册关闭回调和持久化标记（由 hideModal 统一调度）
        if (opts.onClose) overlay._onClose = opts.onClose;
        overlay._persistent = !!opts.persistent;
        overlay._isDynamic = true; // 标记为动态创建的弹窗

        var newBtns = overlay.querySelectorAll('button:not([type])');
        for (let b = 0; b < newBtns.length; b++) newBtns[b].setAttribute('type', 'button');
        var newSvgs = overlay.querySelectorAll('svg');
        for (let s = 0; s < newSvgs.length; s++) {
            newSvgs[s].setAttribute('aria-hidden', 'true');
            newSvgs[s].setAttribute('focusable', 'false');
        }
        // 自动显示（showModal 会统一绑定遮罩点击关闭事件）
        UI.showModal(id);
        return overlay;
    },
    hideModal: function(id) {
        var el = document.getElementById(id);
        if (el) {
            el.classList.remove('active');
            el.style.display = 'none';
            el.style.zIndex = '';
            // 从栈中移除
            var idx = this._modalStack.indexOf(id);
            if (idx !== -1) this._modalStack.splice(idx, 1);
            // 【导航栈】从导航栈中移除对应条目
            for (let i = this._navStack.length - 1; i >= 0; i--) {
                if (this._navStack[i].type === 'modal' && this._navStack[i].id === id) {
                    this._navStack.splice(i, 1);
                    break;
                }
            }
            // 触发关闭回调
            if (el._onClose) el._onClose();
            // 非持久化的动态弹窗自动清理 DOM
            if (el._isDynamic && !el._persistent) {
                el.remove();
            }

            if (this._modalStack.length === 0 && this._lastFocusBeforeModal) {
                try { this._lastFocusBeforeModal.focus(); } catch(e) {}
                this._lastFocusBeforeModal = null;
            }
        }
    },
    confirm: function(title, message) {
        return new Promise(function(resolve) {
            var titleEl = document.getElementById('confirmTitle');
            var msgEl = document.getElementById('confirmMessage');
            if (!titleEl || !msgEl) {
                resolve(false);
                return;
            }
        titleEl.textContent = title;
        msgEl.textContent = message;
        UI.showModal('confirmModal');
    var yesBtn = document.getElementById('confirmYes');
    if (!yesBtn) {
        resolve(false);
        return;
    }

    if (!yesBtn._confirmHandler) {
        yesBtn._confirmHandler = function() {
            UI.hideModal('confirmModal');
            if (yesBtn._confirmResolve) yesBtn._confirmResolve(true);
            // [P0-1 修复] 清空对方(confirmNo)残留 resolve，避免下次进入 confirm 时旧 promise 干扰
            var noBtn2 = document.getElementById('confirmNo');
            if (noBtn2) noBtn2._confirmResolve = null;
            yesBtn._confirmResolve = null;
        };
        yesBtn.addEventListener('click', yesBtn._confirmHandler);
    }

    if (yesBtn._confirmResolve) {
        yesBtn._confirmResolve(false);
    }
    yesBtn._confirmResolve = resolve;
    // 绑定"否"按钮，防止Promise永远悬挂
    var noBtn = document.getElementById('confirmNo');
    if (noBtn) {
        if (!noBtn._confirmHandler) {
            noBtn._confirmHandler = function() {
                UI.hideModal('confirmModal');
                if (noBtn._confirmResolve) noBtn._confirmResolve(false);
                // [P0-1 修复] 同样清空对方残留
                yesBtn._confirmResolve = null;
                noBtn._confirmResolve = null;
            };
            noBtn.addEventListener('click', noBtn._confirmHandler);
        }
        if (noBtn._confirmResolve) {
            noBtn._confirmResolve(false);
        }
        noBtn._confirmResolve = resolve;
    }

    // 【BUG-002 修复】绑定 X 关闭按钮，确保关闭操作也能正确 resolve Promise
    // 之前 X 按钮仅依赖 data-close 全局委托（在 bindEvents 中注册），
    // 但初始化阶段 bindEvents 尚未执行，且全局委托只 hideModal 不 resolve，
    // 导致 await UI.confirm(...) 永久悬挂，对话框无法关闭
    var closeBtn = document.querySelector('#confirmModal .modal-header [data-close]');
    if (closeBtn) {
        if (!closeBtn._confirmCloseHandler) {
            closeBtn._confirmCloseHandler = function(e) {
                // 阻止全局 data-close 委托重复调用 hideModal（虽然幂等，但减少冗余操作）
                e.stopPropagation();
                UI.hideModal('confirmModal');
                if (yesBtn._confirmResolve) yesBtn._confirmResolve(false);
                yesBtn._confirmResolve = null;
                if (noBtn) noBtn._confirmResolve = null;
            };
            closeBtn.addEventListener('click', closeBtn._confirmCloseHandler);
        }
    }

    // 【BUG-002 修复】遮罩点击也确保 resolve Promise
    var confirmOverlay = document.getElementById('confirmModal');
    if (confirmOverlay && !confirmOverlay._confirmMaskBound) {
        confirmOverlay._confirmMaskBound = true;
        // showModal 中的遮罩点击处理已有 confirmModal 分支会 resolve，
        // 但在初始化阶段 showModal 的遮罩 listener 可能尚未绑定，
        // 这里补充一个独立 listener 作为双保险
        confirmOverlay.addEventListener('click', function(e) {
            if (e.target !== confirmOverlay) return;
            if (yesBtn._confirmResolve) yesBtn._confirmResolve(false);
            yesBtn._confirmResolve = null;
            if (noBtn) noBtn._confirmResolve = null;
            UI.hideModal('confirmModal');
        });
    }
    });
    },
    prompt: function(title, defaultValue) {
        return new Promise(function(resolve) {
            var titleEl = document.getElementById('promptTitle');
            var inputEl = document.getElementById('promptInput');
            if (!titleEl || !inputEl) {
                resolve(null);
                return;
            }
        titleEl.textContent = title;
        inputEl.value = defaultValue || '';
        UI.showModal('promptModal');
        inputEl.focus();
    var okBtn = document.getElementById('promptOk');
    var cancelBtn = document.getElementById('promptCancel');
    if (!okBtn) {
        resolve(null);
        return;
    }

    if (!okBtn._promptHandler) {
        okBtn._promptHandler = function() {
            UI.hideModal('promptModal');
            if (okBtn._promptResolve) okBtn._promptResolve(inputEl.value || null);
        };
        okBtn.addEventListener('click', okBtn._promptHandler);
    }
    okBtn._promptResolve = resolve;
    if (cancelBtn) {
        if (!cancelBtn._promptHandler) {
            cancelBtn._promptHandler = function() {
                UI.hideModal('promptModal');
                if (cancelBtn._promptResolve) cancelBtn._promptResolve(null);
            };
            cancelBtn.addEventListener('click', cancelBtn._promptHandler);
        }
        cancelBtn._promptResolve = resolve;
    }
    // 回车确认
    inputEl.onkeydown = function(e) {
        if (e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            UI.hideModal('promptModal');
            resolve(inputEl.value || null);
        }
    };
    });
    },
    // ========================================
    // 【重构】合并 9 处 "返回剧情 + gameNav" 模式为 goHome
    // ========================================
    GAME_NAV_TABS: [
        { page: 'storyPage',  icon: 'icon-book',      label: '剧情' },
        { page: 'playerPage', icon: 'icon-user',      label: '个人' },
        { page: 'npcPage',    icon: 'icon-users',     label: '人际' },
        { page: 'logPage',    icon: 'icon-grid',      label: '日志' },
        { page: 'memoryPage', icon: 'icon-sparkles',  label: '记忆' },
        { page: 'recapPage',  icon: 'icon-clock',     label: '回顾' }
    ],
    goHome: function() {
        UI.showPage('storyPage');
        if (typeof renderNavBar === 'function') {
            renderNavBar('gameNav', UI.GAME_NAV_TABS, 0);
        }
    },
    // ========================================
    // 【重构】合并 5 处 new FileReader() 模式
    // ========================================
    readJSONFile: function(file) {
        return new Promise(function(resolve, reject) {
            if (!file) { reject(new Error('no file')); return; }
            var r = new FileReader();
            r.onload = function(e) {
                try { resolve(JSON.parse(e.target.result)); }
                catch (err) { reject(err); }
            };
            r.onerror = function() { reject(r.error || new Error('read failed')); };
            r.readAsText(file);
        });
    },
    // ========================================
    // 【重构】合并 4 处 a.download = xxx.json 模式
    // ========================================
    downloadJSON: function(data, filename) {
        try {
            var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            // Safari / 旧浏览器需要 a 在 DOM 里才能触发下载；Chrome 不需要但也无害
            if (document.body && document.body.appendChild) {
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else {
                a.click();
            }
            TimerManager.setTimeout('revokeDownloadURL', function() { URL.revokeObjectURL(url); }, 1000);
            return true;
        } catch (e) {
            console.error('[downloadJSON] 失败:', e);
            UI.toast && UI.toast('下载失败: ' + e.message);
            return false;
        }
    },
    // ========================================
    // 【重构】合并 6 处 "gm.saveToStorage + toast" 二连（原三连，已删除 GameLinker）
    // ========================================
    afterMemoryChange: function(tab, dataKey, toastMsg) {
        try {
            if (window.GameMemory) {

                // _ltmCache 包含 tables.characters/items/locations/relationships 的深拷贝、
                // quests、events、plot、permanentFacts→worldAnchors（见 tavern-compat.js:3710-3754 getter）。
                // 全部 16 处 save*/delete* 调用 afterMemoryChange 时都修改了上述数据之一，
                // 必须置 _ltmDirty=true，否则下次读取 longTermMemory 返回陈旧快照。
                // 原实现仅 permanentFacts 的 save/delete（tavern-compat.js:4268/4290）显式置位，
                // 其余 14 处（saveCharacter/saveItem/saveLocation/saveEvent/saveQuest/savePlot 等）漏置，
                // 导致编辑角色/物品/地点/事件/任务/剧情后，AI 注入的 longTermMemory 仍是旧快照。
                // 单点修复覆盖所有现有及未来 save* 路径，避免逐函数补丁的遗漏风险。
                // 现有 2 处显式 gm._ltmDirty=true 保留作为防御性纵深（无害）。
                GameMemory._ltmDirty = true;
                GameMemory.saveToStorage();
            }
        } catch (e) { console.warn('[afterMemoryChange] saveToStorage:', e); }

        if (toastMsg) UI.toast(toastMsg);
        if (tab && typeof MemoryManagerUI !== 'undefined' && MemoryManagerUI.switchTab) {
            MemoryManagerUI.switchTab(tab);
        }
    },
    // 【日志页面】AI 生成功能弹窗（替代原来转瞬即逝的 toast）
    // 用法：UI.showGenerating('本章剧情总结', { onCancel: function(){...} })
    //      UI.hideGenerating()
    _generatingCancelHandler: null,
    showGenerating: function(featureLabel, opts) {
        var modal = document.getElementById('generatingModal');
        var titleEl = document.getElementById('generatingTitle');
        var msgEl = document.getElementById('generatingMessage');
        var featEl = document.getElementById('generatingFeature');
        var cancelBtn = document.getElementById('generatingCancelBtn');
        if (!modal) {
            // 兜底：弹窗未渲染时降级为 toast
            if (typeof UI.toast === 'function') UI.toast('正在生成「' + (featureLabel || '') + '」...');
            return;
        }
        if (titleEl) titleEl.textContent = '正在生成「' + (featureLabel || '内容') + '」';
        if (msgEl) msgEl.textContent = 'AI 思考中，请稍候';
        if (featEl) featEl.textContent = opts && opts.hint ? opts.hint : '（视网络与上下文长度，可能需要十几秒到几十秒）';
        opts = opts || {};
        // 【缺陷修复】记录 onCancel 到 modal 上，遮罩点击关闭时触发，避免 AI 请求在后台继续运行
        modal._generatingOnCancel = opts.onCancel;
        // 绑定取消
        if (cancelBtn) {
            var self = this;
            if (cancelBtn._generatingHandler) {
                cancelBtn.removeEventListener('click', cancelBtn._generatingHandler);
            }
            if (cancelBtn._generatingKeyHandler) {
                document.removeEventListener('keydown', cancelBtn._generatingKeyHandler);
            }
            cancelBtn.style.display = (opts.hideCancel ? 'none' : '');
            cancelBtn._generatingHandler = function() {
                try { UI.hideGenerating(); } catch (e) {}
                try {
                    if (opts.onCancel) opts.onCancel();
                } catch (e) { console.warn('[Generating] onCancel 失败:', e); }
            };
            cancelBtn.addEventListener('click', cancelBtn._generatingHandler);
            // Esc 也可取消
            cancelBtn._generatingKeyHandler = function(e) {
                if (e.key === 'Escape' || e.keyCode === 27) {
                    if (modal.classList.contains('active')) {
                        cancelBtn._generatingHandler();
                    }
                }
            };
            document.addEventListener('keydown', cancelBtn._generatingKeyHandler);
        }
        this.showModal('generatingModal');
    },
    hideGenerating: function() {
        var modal = document.getElementById('generatingModal');
        if (modal) {
            // 【缺陷修复】清理 keydown 监听，避免残留
            var cancelBtn = document.getElementById('generatingCancelBtn');
            if (cancelBtn && cancelBtn._generatingKeyHandler) {
                document.removeEventListener('keydown', cancelBtn._generatingKeyHandler);
            }
            // 清理 onCancel 引用，防止遮罩点击二次触发
            modal._generatingOnCancel = null;
            this.hideModal('generatingModal');
        }
    }
};
// ==================== API配置管理 ====================
// 来源：game_integrated.html 第 3438-3531 行
// 功能：多API端点管理、分组、自动轮询、连接测试、模型列表获取

// ========================================
// 【安全】API Key 轻量混淆（仅避免明文存 localStorage）
// ========================================
// 注意：这不是真正的加密——任何能跑 JS 的人都能还原。目的只是防止 key 出现在
// 浏览器控制台、localStorage dump、屏幕录制等「无意识泄露」场景。
// 真实的密钥安全请用后端代理或 KMS。
var _API_KEY_OBFUSCATE_PASS = 'free_script_obf_v1'; // 简单 XOR + base64
function _obfuscateKey(plain) {
    if (typeof plain !== 'string' || !plain) return '';
    try {
        var pass = _API_KEY_OBFUSCATE_PASS;
        var xored = '';
        for (let i = 0; i < plain.length; i++) {
            xored += String.fromCharCode(plain.charCodeAt(i) ^ pass.charCodeAt(i % pass.length));
        }
        // 用 btoa 处理 Unicode
        return btoa(unescape(encodeURIComponent(xored)));
    } catch (e) { return plain; }
}
function _deobfuscateKey(encoded) {
    if (typeof encoded !== 'string' || !encoded) return encoded || '';
    // 启发式：base64 字符串只包含 [A-Za-z0-9+/=]，且长度 >= 8
    if (encoded.length < 8 || !/^[A-Za-z0-9+/=]+$/.test(encoded)) {
        return encoded; // 看起来不像混淆后的值，原样返回（兼容旧数据）
    }
    try {
        var xored = decodeURIComponent(escape(atob(encoded)));
        var pass = _API_KEY_OBFUSCATE_PASS;
        var plain = '';
        for (let i = 0; i < xored.length; i++) {
            plain += String.fromCharCode(xored.charCodeAt(i) ^ pass.charCodeAt(i % pass.length));
        }
        return plain;
    } catch (e) { return encoded; }
}
// 批量处理 configs 数组
function _obfuscateConfigs(configs) {
    if (!Array.isArray(configs)) return configs;
    return configs.map(function(c) {
        if (!isObject(c)) return c;
        var copy = Object.assign({}, c);
        if (copy.apiKey) copy.apiKey = _obfuscateKey(copy.apiKey);
        return copy;
    });
}
function _deobfuscateConfigs(configs) {
    if (!Array.isArray(configs)) return configs;
    return configs.map(function(c) {
        if (!isObject(c)) return c;
        var copy = Object.assign({}, c);
        if (copy.apiKey) copy.apiKey = _deobfuscateKey(copy.apiKey);
        return copy;
    });
}

var LocalGameAPI = {
    // 修复：移除写死的中转站 URL 和模型名。
    // 默认 1 个空白 slot，让用户自己在 API 设置页填"中转站 + Key + 模型"组合。
    // 旧用户已保存的 localStorage 配置会在 init() 中恢复，不受影响。
    _configs: [{
        baseUrl: '',
        apiKey: '',
        model: '',
        models: []
    }],
    _currentSlot: 0,
    _autoRotate: true,
    _requestLog: [], // [{slot, model, time, success, error}]
    _failedModels: {}, // {modelName: timestamp}
    _MAX_LOG: 50,
    // [P0优化] 主动限流：追踪每个slot的剩余配额（从响应头读取）
    // _rateLimitInfo[slot] = { remaining: number|null, resetAt: number|null, lastUpdated: number }
    _rateLimitInfo: {},
    init() {
        try {
            const saved = Storage.get(Storage.KEYS.API_CONFIG);
            if (saved) {
                const data = JSON.parse(saved);
                // 正常加载保存的配置——不修改、不动玩家的 model
                if (data.configs && data.configs.length > 0) {
                    // 【安全】还原时自动反混淆 API Key
                    this._configs = _deobfuscateConfigs(data.configs);
                }
                this._currentSlot = data.currentSlot || 0;
                this._autoRotate = data.autoRotate !== undefined ? data.autoRotate : this._autoRotate;
                this._groups = data.groups || [];
                this._currentGroup = data.currentGroup || 'all';
                this._requestLog = data.requestLog || [];
                this._failedModels = data.failedModels || {};
            }
        } catch (e) {
            console.error('加载API配置失败:', e);
        }
    },
    save() {
        try {
            // 【安全】写入时混淆 API Key，避免明文存到 localStorage
            Storage.setJSON(Storage.KEYS.API_CONFIG, {
                configs: _obfuscateConfigs(this._configs),
                currentSlot: this._currentSlot,
                autoRotate: this._autoRotate,
                groups: this._groups || [],
                currentGroup: this._currentGroup || 'all',
                requestLog: this._requestLog.slice(-this._MAX_LOG),
                failedModels: this._failedModels
                });
            } catch (e) {
            console.error('保存API配置失败:', e);
            }
    },
    getGroups() {
        const groups = new Set();
        if (this._groups) this._groups.forEach(g => groups.add(g));
        this._configs.forEach(c => {
            if (c.group) groups.add(c.group);
            });
        return Array.from(groups);
    },
    deleteGroup(groupName) {
        // 从 _groups 数组中删除
        if (this._groups) {
            this._groups = this._groups.filter(g => g !== groupName);
        }
    // 将该分组下的所有API变为未分组
    this._configs.forEach(cfg => {
        if (cfg.group === groupName) {
            cfg.group = '';
        }
    });
    this.save();
    },
    getCurrentConfig() {

        var cfg = this._configs[this._currentSlot] || this._configs[0];
        return cfg ? Object.assign({}, cfg) : null;
    },
    setConfig(slot, config) {
        var _wasEmpty = !this._configs[slot] || (!this._configs[slot].baseUrl && !this._configs[slot].apiKey);
        this._configs[slot] = {
            ...this._configs[slot],
            ...config
            };
        // 如果是新建配置（此前为空）且当前没有可用的配置，自动设为当前
        if (_wasEmpty && config.baseUrl && config.apiKey) {
            var _hasActive = this._configs.some(function(c, i) {
                return i !== slot && c.baseUrl && c.apiKey;
            });
            if (!_hasActive) {
                this._currentSlot = slot;
            }
        }
        this.save();
    },
    setCurrentSlot(slot) {
        this._currentSlot = slot;
        this.save();
        // 【NEW-004 修复】切换 API 配置（可能换模型）时清除 Schema 降级标志
        // 避免上次降级残留 60 秒影响新模型的 strict 尝试
        if (typeof gameState !== 'undefined' && gameState) {
            gameState._jsonSchemaDowngrade = null;
        }
    },
    setAutoRotate(val) {
        this._autoRotate = val;
        this.save();
    },
    // 【BUG-001 修复】整体重试硬上限：跨 _retrySingleRequest 内部递归 + callAI 外层 while 循环
    // 之前 tryWithFallback 内部限流重试 2 次 + 网络重试 3 次，外层 callAI 又有 2 次 429 重试，
    // 极端情况下 9+ 次重试仍不退出，导致 UI 永远卡在 "速率限制，5秒后自动重试 (1/2)" 循环。
    // 新增 _globalRetryCount：每次进入 tryWithFallback 失败 +1，累计超过上限后强制终止并提示用户。
    async tryWithFallback(requestFn) {
        // 网络错误重试配置
        const MAX_RETRIES = 3; // 每个配置最多重试3次
        const RETRY_DELAY_BASE = 1000; // 基础延迟1秒

        // 【BUG-001 修复】全局重试计数器：跨 callAI 多次调用 tryWithFallback 时累计
        // 用 LocalGameAPI 字段持久化在对象上，避免递归闭包污染
        if (typeof this._globalRetryCount !== 'number') this._globalRetryCount = 0;
        if (typeof this._globalRetryResetTimer !== 'undefined') clearTimeout(this._globalRetryResetTimer);
        // 30秒内没有新的失败 → 重置计数（避免长期累积误伤）
        this._globalRetryResetTimer = setTimeout(function() {
            if (LocalGameAPI) LocalGameAPI._globalRetryCount = 0;
        }, 30000);
        // 硬上限：3 次连续全局失败后，强制终止并提示用户切换 API/手动操作
        const GLOBAL_RETRY_LIMIT = 3;

        // 【P1 修复】清理过期的失败记录，避免堆积导致所有配置被跳过
        this._cleanupExpiredFailures();

        // 【BUG-001 修复】在进入重试前先看是否已经触顶：避免上一次失败还没解除，
        // 紧接着的下一次请求又陷入死循环。
        if (this._globalRetryCount >= GLOBAL_RETRY_LIMIT) {
            // 给出明确的可操作提示：用户可以重置计数 或 等冷却 或 换 API
            var _errMsg = 'API 持续调用失败，已自动停止重试（累计 ' + this._globalRetryCount + ' 次）。\n\n'
                + '可能原因：\n'
                + '• API Key 余额/限流已用完\n'
                + '• 当前所有 API 配置均不可用\n\n'
                + '建议操作：\n'
                + '1. 等待 30 秒后手动重试（错误计数会自动重置）\n'
                + '2. 检查并更换其他可用的 API 配置\n'
                + '3. 确认 API Key 余额充足';
            this._globalRetryCount = 0; // 给用户一次手动重试的机会
            var _limitErr = new Error(_errMsg);
            _limitErr.name = 'GlobalRetryLimitError';
            _limitErr.isUserFacing = true;
            // 弹一个常驻 toast (5 秒) 而非 3 秒的普通 toast，确保用户能看见
            if (typeof UI !== 'undefined' && UI.toast) {
                try { UI.toast('API 持续失败已停止自动重试，请检查 API 配置', 5000, 'error'); } catch (e) {}
            }
            throw _limitErr;
        }

        var startTs = Date.now();

        if (!this._autoRotate) {
            try {
                var result = await this._retrySingleRequest(requestFn, this._currentSlot, 0, MAX_RETRIES, RETRY_DELAY_BASE);
                this._logRequest(this._currentSlot, true, '', Date.now() - startTs);
                this._globalRetryCount = 0; // 【BUG-001 修复】成功 → 重置全局计数
                return result;
            } catch (e) {
                var _singleErr = (e && e.message) ? e.message : String(e);
                this._logRequest(this._currentSlot, false, _singleErr, Date.now() - startTs);
                this._markModelFailed(this._currentSlot, _singleErr);
                // 【BUG-001 修复】失败 → 全局计数 +1
                this._globalRetryCount = (this._globalRetryCount || 0) + 1;
                throw e;
            }
        }
        const totalSlots = this._configs.length;
        let attemptedCount = 0;
        // 【BUG-004 修复】预统计真正可用的配置数（有 baseUrl + apiKey），
        // 避免 _configs 数组中存在空占位 slot 时，"尝试下一个"条件误判
        var totalUsable = 0;
        for (let i = 0; i < totalSlots; i++) {
            var _c = this._configs[i];
            if (_c && _c.baseUrl && _c.apiKey) totalUsable++;
        }
        // 轮换顺序：当前 slot 起循环，失败标记仅作 UI 提醒，不影响轮换顺序
        // 【BUG-004 修复】先过滤出"真正可用"的 slot（baseUrl + apiKey 均非空），
        // 空占位 slot 完全不参与轮询，避免日志里出现"配置 1 不完整"的干扰信息，
        // 也避免 slot 编号与"可用配置序号"不一致
        var orderedSlots = [];
        // 【BUG-010 修复】先计算 slot 下标（轮换起点 = _currentSlot），再判断该 slot 是否可用
        // 旧逻辑：orderedSlots.push((this._currentSlot + i) % totalSlots)，
        //   当 i=0, _currentSlot=1, totalSlots=2 时算出 1，OK；
        //   但 i=1 时算出 0，而 _configs[0] 是空占位（被过滤跳过），所以正常场景能跑。
        //   问题是 i=0 本身已经按"轮换偏移"计算，等价于"从 currentSlot 开始"。
        //   当 _configs[_currentSlot] 自己为空时，旧逻辑会跳过该空 slot 但仍可能算出错误的下一个。
        // 新逻辑：先按"从 _currentSlot 开始的轮换顺序"得到真实 slot 下标，再过滤空配置，
        //   保证 orderedSlots 中的下标始终是 _configs 数组的有效索引
        for (let i = 0; i < totalSlots; i++) {
            const _slotIdx = (this._currentSlot + i) % totalSlots;
            var _cfgi = this._configs[_slotIdx];
            if (_cfgi && _cfgi.baseUrl && _cfgi.apiKey) {
                orderedSlots.push(_slotIdx);
            }
        }
        // totalSlots 改为 orderedSlots 长度，外层循环上限也对应调整
        // 【BUG-009 修复】totalSlots 在上面 1148 行已声明为 const，不能再赋值！
        // 改用新的局部变量 _effectiveTotalSlots，避免 Assignment to constant variable 错误
        const _effectiveTotalSlots = orderedSlots.length;

        var failReasons = [];
        // 【BUG-009 修复】for 循环上限也要用 _effectiveTotalSlots，确保只遍历可用配置
        for (let attempt = 0; attempt < _effectiveTotalSlots; attempt++) {
            const slotIdx = orderedSlots[attempt];
            const cfg = this._configs[slotIdx];
            // 【BUG-004 修复】防御性检查：理论上 orderedSlots 已经过滤过空配置，但保险起见再查一次
            if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
                continue; // 静默跳过空占位，不再打印"配置 X 不完整"日志
            }

            if (this.isSlotTimeoutRecent(slotIdx)) {
                console.log('[API轮换] 配置 ' + (slotIdx + 1) + ' 近期超时，跳过');
                continue;
            }
            // [P0优化] 主动限流：配额即将耗尽的slot也跳过
            if (this.isSlotRateLimitLow(slotIdx)) {
                console.log('[API轮换] 配置 ' + (slotIdx + 1) + ' 配额即将耗尽(' + this.getRateLimitSummary(slotIdx) + ')，跳过');
                continue;
            }
            // 注意：不再自动跳过"近期失败"的模型——失败只是 UI 提醒，玩家想用就能用
            // 如果某个模型一直挂，玩家会在 UI 上看到 ⚠️ 提醒，自然会换或调整
            attemptedCount++;
            // 【BUG-004 修复】用可用配置序号（attemptedCount）而非数组下标 (slotIdx+1) 显示，
            // 避免 _configs 中存在空占位 slot 时显示"配置 2 失败"（实际只有1个可用配置）
            // 优先使用配置名称，无名称时回退到"配置 N"
            var cfgLabel = cfg.name || ('配置 ' + attemptedCount);
            try {
                const result = await this._retrySingleRequest(requestFn, slotIdx, 0, MAX_RETRIES, RETRY_DELAY_BASE);
                this._logRequest(slotIdx, true, '', Date.now() - startTs);
                this._globalRetryCount = 0; // 【BUG-001 修复】成功 → 重置全局计数
                // [P0优化] 断路器：成功时重置该slot的失败状态
                this._markModelSuccess(slotIdx);
                if (attempt > 0 && slotIdx !== this._currentSlot) {
                    this.setCurrentSlot(slotIdx);
                    UI.toast('已自动切换到 ' + cfgLabel);
                }
                return result;
            } catch (e) {
                var errMsg = translateError((e && e.message) ? e.message : String(e));
                this._logRequest(slotIdx, false, errMsg, Date.now() - startTs);
                // 失败标记记录原因，超时模型会在短期内被跳过
                this._markModelFailed(slotIdx, errMsg);
                // 【BUG-001 修复】失败 → 全局计数 +1
                this._globalRetryCount = (this._globalRetryCount || 0) + 1;
                console.warn(cfgLabel + ' (' + cfg.model + ') 调用失败:', errMsg);

                failReasons.push(cfgLabel + '(' + (cfg.model || '?') + '): ' + errMsg);
                // 超时错误给出明确提示
                if (/timeout|timed out|超时/i.test(errMsg)) {
                    UI.toast(cfgLabel + ' 请求超时，已临时跳过');
                } else if (attemptedCount < totalUsable && !/model_not_found|invalid_api_key|authentication_error|context_length_exceeded|insufficient_quota/i.test(errMsg)) {
                    UI.toast(cfgLabel + ' 失败，尝试下一个...');
                }
            }
        }
        // 【BUG-001 修复】全部配置都失败 → 检查是否超过全局硬上限
        // 一旦超过，抛 GlobalRetryLimitError 给 callAI 外层，强制停止重试循环
        if (this._globalRetryCount >= GLOBAL_RETRY_LIMIT) {
            var _limitMsg2 = 'API 持续调用失败，已自动停止重试（累计 ' + this._globalRetryCount + ' 次）。\n\n'
                + '可能原因：API Key 余额/限流已用完，或所有 API 配置均不可用。\n\n'
                + '建议：等待 30 秒后手动重试（错误计数会自动重置），或检查并更换其他可用的 API 配置。';
            var _limitErr2 = new Error(_limitMsg2);
            _limitErr2.name = 'GlobalRetryLimitError';
            _limitErr2.isUserFacing = true;
            this._globalRetryCount = 0;
            if (typeof UI !== 'undefined' && UI.toast) {
                try { UI.toast('API 持续失败已停止自动重试，请检查 API 配置', 5000, 'error'); } catch (e) {}
            }
            throw _limitErr2;
        }
        // 更详细的错误信息
        if (attemptedCount === 0) {
            // 【P1 修复】收集所有跳过的原因，给出更具体的错误提示
            var skipReasons = [];
            for (var si = 0; si < totalSlots; si++) {
                var scfg = this._configs[si];
                if (!scfg || !scfg.baseUrl || !scfg.apiKey) continue;
                if (this.isSlotTimeoutRecent(si)) {
                    var srec = this._failedModels[si + '|' + scfg.model];
                    var sreason = this._getFailedReason(srec || {});
                    skipReasons.push(scfg.name || scfg.model || ('配置' + (si + 1)) + ': ' + (sreason || '近期失败'));
                }
            }
            var msg = '没有可用的API配置，请检查API设置（URL和Key是否完整）';
            if (skipReasons.length > 0) {
                msg += '\n\n所有配置当前处于冷却期：\n' + skipReasons.join('\n');
                // [BUG-007 修复] 显示冷却期剩余时间，让用户知道何时可以重试
                // 原代码: msg += '\n\n请等待冷却期结束后重试，或刷新页面清除冷却状态。';
                // 问题: 未告知用户冷却期时长，用户不知道何时可以重试
                // 修复: 计算并显示最近的冷却期剩余时间
                var _now = Date.now();
                var _minRemaining = Infinity;
                for (var si2 = 0; si2 < totalSlots; si2++) {
                    var scfg2 = this._configs[si2];
                    if (!scfg2 || !scfg2.baseUrl || !scfg2.apiKey) continue;
                    var key2 = si2 + '|' + scfg2.model;
                    var rec2 = this._failedModels[key2];
                    if (rec2) {
                        var failedAt2 = this._getFailedTime(rec2);
                        var cooldownMs2 = 5 * 60 * 1000; // 默认5分钟冷却
                        var remaining = cooldownMs2 - (_now - failedAt2);
                        if (remaining > 0 && remaining < _minRemaining) {
                            _minRemaining = remaining;
                        }
                    }
                }
                if (_minRemaining !== Infinity && _minRemaining > 0) {
                    var _remainSec = Math.ceil(_minRemaining / 1000);
                    var _remainMin = Math.floor(_remainSec / 60);
                    var _remainSecRemain = _remainSec % 60;
                    msg += '\n\n⏱ 最近配置冷却剩余: ' + _remainMin + '分' + _remainSecRemain + '秒';
                    msg += '\n冷却期结束后可自动重试，或刷新页面立即清除冷却状态。';
                } else {
                    msg += '\n\n请等待冷却期结束后重试，或刷新页面清除冷却状态。';
                }
            }
            throw new Error(msg);
        }

        // 只保留前 3 条原因避免过长，每条截断到 100 字符
        throw new Error('所有 ' + attemptedCount + ' 个可用配置均调用失败' + (failReasons.length > 0
            ? '\n失败原因：\n' + failReasons.slice(0, 3).map(function(r) {
                return r.length > 100 ? truncateByChars(r, 100, '...') : r;
            }).join('\n')
            : ''));
    },
    // [T1-P1-3] 单次请求 + 指数退避重试，拆出 tryWithFallback 内部闭包减少嵌套层级
    // 【P2 修复】增加限流（429/ResourceExhausted）重试：API 限流通常是瞬时负载，
    // 等待 2-5 秒后重试有较高成功率，避免立即标记失败导致配置被跳过。
    async _retrySingleRequest(requestFn, slotIdx, attempt, maxRetries, retryDelayBase) {
        try {
            return await requestFn(slotIdx);
        } catch (e) {
            // 用户主动取消（AbortError）不重试，直接抛出
            if (e && e.name === 'AbortError') throw e;
            var errMsg = String(e && e.message ? e.message : e);
            var isRateLimit = /ResourceExhausted|rate.?limit|request limit reached|quota exceeded|too many requests|429/i.test(errMsg);
            // translateError 之后文案是中文的，一旦未来改 i18n 这里就漏判
            var isNetworkError =
                (e && e.name === 'TypeError' && /fetch|network/i.test(errMsg)) ||
                (e && (e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' || e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN')) ||
                (e && /network|fetch failed|timeout/i.test(errMsg));

            // 限流重试：最多重试 2 次，使用更长的基础延迟（3秒），指数退避（3s → 6s）
            if (isRateLimit && attempt < 2) {
                var rateLimitDelay = 3000 * Math.pow(2, attempt);
                // [P1优化] 添加全抖动(Jitter)，防止多客户端同步重试导致惊群效应
                rateLimitDelay = rateLimitDelay * (0.75 + Math.random() * 0.5); // ±25% 随机
                rateLimitDelay = Math.round(rateLimitDelay);
                console.log('[限流重试] 配置 ' + (slotIdx + 1) + ' 触发限流，' + rateLimitDelay + 'ms后重试（第' + (attempt + 1) + '次）...');
                await new Promise(function(resolve) { setTimeout(resolve, rateLimitDelay); });
                return this._retrySingleRequest(requestFn, slotIdx, attempt + 1, maxRetries, retryDelayBase);
            }

            // 网络错误重试：指数退避 1s → 2s → 4s
            if (isNetworkError && attempt < maxRetries - 1) {
                var delay = retryDelayBase * Math.pow(2, attempt);
                // [P1优化] 添加全抖动(Jitter)
                delay = delay * (0.75 + Math.random() * 0.5); // ±25% 随机
                delay = Math.round(delay);
                console.log('[重试] 配置 ' + (slotIdx + 1) + ' 第' + (attempt + 1) + '次失败，' + delay + 'ms后重试...');
                await new Promise(function(resolve) { setTimeout(resolve, delay); });
                return this._retrySingleRequest(requestFn, slotIdx, attempt + 1, maxRetries, retryDelayBase);
            }
            throw e;
        }
    },
    _logRequest(slot, success, error, durationMs) {
        var cfg = this._configs[slot];
        if (!cfg) return;
        this._requestLog.push({
            slot: slot,
            model: cfg.model || '?',
            time: Date.now(),
            durationMs: durationMs || 0,
            success: !!success,
            error: error || ''
            });
        if (this._requestLog.length > this._MAX_LOG) {
            this._requestLog = this._requestLog.slice(-this._MAX_LOG);
        }
    // 延迟批量保存，避免每次请求都写localStorage
    if (!this._savePending) {
        this._savePending = true;
        var self = this;
        TimerManager.setTimeout('apiLogSave', function() {
            self._savePending = false;
            self.save();
        }, 5000);
    }
    },
    _markModelFailed(slot, reason) {
        var cfg = this._configs[slot];
        if (!cfg || !cfg.model) return;

        // 之前用 model 名，两个 slot 用同模型时一个挂会误标记另一个
        var key = slot + '|' + cfg.model;

        // [P0优化] 断路器模式：记录连续失败次数，达到阈值后进入 open 态直接跳过
        // 三态：closed(正常) → open(熔断，直接跳过) → half_open(冷却后放行1个探测)
        var existing = this._failedModels[key] || {};
        var prevCount = existing.failureCount || 0;
        // 若距上次失败已超过冷却期，重置计数（给恢复机会）
        var prevTime = this._getFailedTime(existing);
        var cooldownMs = this._getCircuitCooldownMs(existing);
        if (prevTime && (Date.now() - prevTime) > cooldownMs) {
            prevCount = 0; // 冷却期已过，重新计数
        }

        var newCount = prevCount + 1;
        var circuitState = 'closed';
        if (newCount >= 5) circuitState = 'open';      // 连续5次失败 → 熔断
        else if (newCount >= 3) circuitState = 'half_open'; // 3次后进入半开（谨慎探测）

        this._failedModels[key] = {
            time: Date.now(),
            reason: reason || 'unknown',
            failureCount: newCount,
            circuitState: circuitState
        };
        // 复用延迟保存机制，避免重试循环中频繁写 localStorage
        if (!this._savePending) {
            this._savePending = true;
            var self = this;
            TimerManager.setTimeout('apiLogSave', function() {
                self._savePending = false;
                self.save();
            }, 2000);
        }
    },

    // [P0优化] 断路器：根据失败原因返回冷却时间
    _getCircuitCooldownMs(record) {
        var reason = this._getFailedReason(record);
        if (/ResourceExhausted|rate.?limit|request limit reached|quota/i.test(reason)) {
            return 30 * 1000;       // 限流：30秒
        }
        if (/timeout|timed out|超时/i.test(reason)) {
            return 5 * 60 * 1000;   // 超时：5分钟
        }
        return 2 * 60 * 1000;       // 其他：2分钟
    },

    // [P0优化] 断路器：检查slot是否应被跳过
    // 返回 true 表示应跳过（open态且未过冷却期）
    // 返回 false 表示可以尝试（closed / half_open探测 / 冷却期已过）
    _isCircuitOpen(slot) {
        var cfg = this._configs[slot];
        if (!cfg || !cfg.model) return false;
        var key = slot + '|' + cfg.model;
        var record = this._failedModels[key];
        if (!record) return false;

        var state = record.circuitState || 'closed';
        var failedAt = this._getFailedTime(record);
        var cooldownMs = this._getCircuitCooldownMs(record);
        var elapsed = Date.now() - failedAt;

        // 冷却期已过 → 重置为 closed，允许尝试
        if (elapsed >= cooldownMs) {
            record.circuitState = 'closed';
            record.failureCount = 0;
            return false;
        }

        // open 态：直接跳过
        if (state === 'open') return true;

        // half_open 态：允许1次探测（不跳过），但若再失败会升级为 open
        if (state === 'half_open') return false;

        // closed 态：允许尝试
        return false;
    },

    // [P0优化] 断路器：请求成功时重置状态
    _markModelSuccess(slot) {
        var cfg = this._configs[slot];
        if (!cfg || !cfg.model) return;
        var key = slot + '|' + cfg.model;
        if (this._failedModels[key]) {
            delete this._failedModels[key];
            if (!this._savePending) {
                this._savePending = true;
                var self = this;
                TimerManager.setTimeout('apiLogSuccessSave', function() {
                    self._savePending = false;
                    self.save();
                }, 2000);
            }
        }
    },

    // [P0优化] 主动限流：从响应头更新剩余配额信息
    // 支持 x-ratelimit-remaining-requests / x-ratelimit-remaining-tokens / retry-after
    updateRateLimitInfo(slot, headers) {
        if (!headers) return;
        var info = this._rateLimitInfo[slot] || { remaining: null, resetAt: null, lastUpdated: 0 };
        try {
            var remainingReq = headers.get('x-ratelimit-remaining-requests')
                || headers.get('x-ratelimit-remaining');
            var resetAt = headers.get('x-ratelimit-reset-requests')
                || headers.get('x-ratelimit-reset');
            if (remainingReq !== null) {
                info.remaining = parseInt(remainingReq, 10);
                info.lastUpdated = Date.now();
            }
            if (resetAt !== null) {
                // 可能是秒数或 HTTP 日期
                var resetSec = parseInt(resetAt, 10);
                if (!isNaN(resetSec) && String(resetSec) === String(resetAt).trim()) {
                    info.resetAt = Date.now() + resetSec * 1000;
                } else {
                    var resetDate = Date.parse(resetAt);
                    if (!isNaN(resetDate)) info.resetAt = resetDate;
                }
            }
            this._rateLimitInfo[slot] = info;
        } catch (e) {
            // headers 读取失败不影响主流程
        }
    },

    // [P0优化] 主动限流：检查slot是否配额即将耗尽
    // 返回 true 表示应跳过（剩余配额 ≤ 2 且未到重置时间）
    isSlotRateLimitLow(slot) {
        var info = this._rateLimitInfo[slot];
        if (!info || info.remaining === null) return false;
        // 配额已重置（过了resetAt时间）→ 不跳过
        if (info.resetAt && Date.now() > info.resetAt) {
            info.remaining = null;
            return false;
        }
        // 剩余 ≤ 2 → 主动跳过，避免撞429
        return info.remaining <= 2;
    },

    // [P0优化] 主动限流：获取slot的配额状态摘要（UI展示用）
    getRateLimitSummary(slot) {
        var info = this._rateLimitInfo[slot];
        if (!info || info.remaining === null) return '';
        var resetStr = '';
        if (info.resetAt) {
            var remainingSec = Math.max(0, Math.ceil((info.resetAt - Date.now()) / 1000));
            if (remainingSec > 0) resetStr = ' (重置: ' + remainingSec + 's)';
        }
        return '剩余配额: ' + info.remaining + resetStr;
    },

    isModelFailedForSlot(slot) {
        var cfg = this._configs[slot];
        if (!cfg || !cfg.model) return false;
        var key = slot + '|' + cfg.model;
        return this.isModelFailed(key);
    },
    _getFailedTime(record) {
        // 兼容旧格式：之前存的是数字时间戳，新格式是 { time, reason }
        if (!record) return 0;
        if (typeof record === 'number') return record;
        return record.time || 0;
    },
    _getFailedReason(record) {
        if (!record) return '';
        if (typeof record === 'object') return record.reason || '';
        return '';
    },
    isModelFailed(modelName, slot) {
        if (!modelName) return false;
        var record = null;
        var matchedKey = null;

        // [CP-12] 双参数显式消除歧义：当传入 slot 时优先用复合 key "slot|model" 精确匹配，
        // 避免模糊匹配在多 slot 共享同一 model 时错把其他 slot 的失败状态串扰过来。
        // 不传 slot 时维持原行为（向后兼容 UI 提醒等"任何 slot 失败即整模型失败"语义）。
        if (slot) {
            var compositeKey = slot + '|' + modelName;
            if (this._failedModels[compositeKey]) {
                record = this._failedModels[compositeKey];
                matchedKey = compositeKey;
            }
        }

        // 精确匹配：支持复合 key "slot|model"（isModelFailedForSlot 会传这种格式）
        if (!record && this._failedModels[modelName]) {
            record = this._failedModels[modelName];
            matchedKey = modelName;
        } else if (!record) {
            // 模糊匹配：传入裸模型名时，遍历所有 slot 的复合 key 做后缀匹配
            // 只要任一 slot 下该模型失败，就认为是失败状态（UI 提醒用）
            for (let k in this._failedModels) {
                var sepIdx = k.indexOf('|');
                var mName = sepIdx >= 0 ? k.substring(sepIdx + 1) : k;
                if (mName === modelName) { matchedKey = k; record = this._failedModels[k]; break; }
            }
            if (!record) return false;
        }
        // 24小时过期机制，与注释描述一致
        // 之前是永久生效，导致所有模型一旦失败过一次就永远被跳过
        var failedAt = this._getFailedTime(record);
        var now = Date.now();
        var TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
        if (now - failedAt > TWENTY_FOUR_HOURS) {
            // 已过期，清除失败标记
            delete this._failedModels[matchedKey];
            this.save();
            return false;
        }
        return true;
    },

    isSlotTimeoutRecent(slot, withinMs) {
        // [P0优化] 断路器模式：open 态直接返回 true（跳过），half_open/closed 允许尝试
        if (this._isCircuitOpen(slot)) return true;

        var cfg = this._configs[slot];
        if (!cfg || !cfg.model) return false;
        var key = slot + '|' + cfg.model;
        var record = this._failedModels[key];
        if (!record) return false;
        var reason = this._getFailedReason(record);
        var failedAt = this._getFailedTime(record);
        // 【P1 修复】不仅跳过超时，也跳过限流/资源耗尽错误，给 API 恢复时间
        if (!/timeout|timed out|超时|ResourceExhausted|rate.?limit|request limit reached|quota/i.test(reason)) return false;
        var cooldownMs = withinMs || 5 * 60 * 1000;
        // 限流错误用更短的冷却时间（30秒），因为限流通常是瞬时负载
        if (/ResourceExhausted|rate.?limit|request limit reached|quota/i.test(reason)) {
            cooldownMs = withinMs || 30 * 1000;
        }
        return (Date.now() - failedAt) < cooldownMs;
    },
    // 【P1 修复】清理过期的失败记录
    // 超时记录5分钟后过期，限流记录30秒后过期，其他错误2分钟后过期
    _cleanupExpiredFailures() {
        var now = Date.now();
        var changed = false;
        for (var k in this._failedModels) {
            var record = this._failedModels[k];
            var failedAt = this._getFailedTime(record);
            var reason = this._getFailedReason(record);
            var ttl = 5 * 60 * 1000; // 默认5分钟
            if (/ResourceExhausted|rate.?limit|request limit reached|quota/i.test(reason)) {
                ttl = 30 * 1000; // 限流：30秒
            }
            if (now - failedAt > ttl) {
                delete this._failedModels[k];
                changed = true;
            }
        }
        if (changed) this.save();
    },
    getFailedModels() {
        var result = [];
        for (let m in this._failedModels) {

            var modelName = m.indexOf('|') >= 0 ? m.split('|').slice(1).join('|') : m;
            var record = this._failedModels[m];
            result.push({
                model: modelName,
                failedAt: this._getFailedTime(record),
                reason: this._getFailedReason(record)
                });
        }
        return result.sort(function(a, b) {
            return b.failedAt - a.failedAt;
        });
    },
    getRequestStats(slot) {
        var logs = this._requestLog.filter(function(l) {
            return l.slot === slot;
            });
        var total = logs.length;
        var errors = logs.filter(function(l) {
            return !l.success;
            }).length;
        var cfg = this._configs[slot];
        // 模型数优先用获取模型列表时保存的数量，否则从请求日志中统计
        var modelCount = (cfg && cfg.availableModels) ? cfg.availableModels : 0;
        if (modelCount === 0) {
            var models = {};
            logs.forEach(function(l) {
                models[l.model] = true;
                });
            modelCount = Object.keys(models).length;
        }
    return {
        total: total,
        errors: errors,
        modelCount: modelCount,
        recentLogs: logs.slice(-50).reverse()
        };
    },
    normalizeUrl(baseUrl) {
        return baseUrl.replace(/\/$/, '');
    },
    async fetchModels(baseUrl, apiKey) {
        if (!baseUrl) return [];
        try {
            const url = this.normalizeUrl(baseUrl) + '/models';
            console.log('[fetchModels] 请求:', url);
            const res = await fetch(url, {
                headers: {
                    'Authorization': 'Bearer ' + apiKey
                }
            });
            console.log('[fetchModels] 响应状态:', res.status, res.statusText);
            if (res.ok) {
                const data = await res.json();
                const allModels = (data.data || []).map(function(m) {
                    return { id: m.id, type: m.type || m.capabilities || '', owned_by: m.owned_by || '' };
                });
                // 【P1 修复】过滤非文本模型：排除音频、图像、视频、嵌入、审核等非对话模型
                var NON_TEXT_PATTERNS = [
                    /audio/i, /tts/i, /speech/i, /whisper/i, /stt/i, /voice/i, /sound/i,
                    /image/i, /dall-e/i, /vision/i, /img/i, /picture/i, /photo/i,
                    /video/i, /sora/i, /movie/i,
                    /embed/i, /vector/i,
                    /moderat/i, /guard/i, /safety/i,
                    /stepaudio/i, /step-tts/i, /step-asr/i,
                    /gpt-4o-audio/i, /gpt-4o-mini-audio/i,
                    /realtime/i
                ];
                // 检查模型是否为非文本类型
                function _isTextModel(model) {
                    var modelId = model.id || '';
                    var modelType = model.type || '';
                    var ownedBy = model.owned_by || '';
                    // 如果 API 明确返回了类型字段，优先使用
                    if (modelType && /audio|image|video|embed|moderat|tts|speech|asr/i.test(modelType)) {
                        return false;
                    }
                    // 检查模型 ID 是否匹配非文本模式
                    for (var i = 0; i < NON_TEXT_PATTERNS.length; i++) {
                        if (NON_TEXT_PATTERNS[i].test(modelId)) return false;
                    }
                    return true;
                }
                var textModels = [];
                for (var i = 0; i < allModels.length; i++) {
                    if (_isTextModel(allModels[i])) {
                        textModels.push(allModels[i].id);
                    }
                }
                // 如果过滤后没有模型，返回全部模型（避免误杀）
                if (textModels.length === 0) {
                    console.warn('[fetchModels] 过滤后无文本模型，返回全部模型');
                    return allModels.map(function(m) { return m.id; }).sort();
                }
                console.log('[fetchModels] 过滤前: ' + allModels.length + ' 个模型，过滤后: ' + textModels.length + ' 个文本模型');
                return textModels.sort();
            }
            // res.ok 为 false：抛出具体 HTTP 错误
            var _errBody = '';
            try { _errBody = await res.text(); } catch (e2) {}
            console.error('[fetchModels] HTTP 错误:', res.status, _errBody.slice(0, 200));
            throw new Error(translateError('HTTP ' + res.status + ': ' + (res.statusText || '') + (_errBody ? ' - ' + _errBody.slice(0, 100) : '')));
        } catch (e) {
            console.error('[fetchModels] 失败:', e && e.message, e);
            throw e;  // 【BUG-002 修复】透传真实错误，不要用模糊消息替换
        }
    },
    async testConnection(config, signal) {
        if (!config.baseUrl || !config.apiKey) return {
            success: false,
            message: '请填写完整配置'
            };
        try {
            const url = this.normalizeUrl(config.baseUrl) + '/chat/completions';
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + config.apiKey
                },
            body: JSON.stringify({
                model: config.model || '',
                messages: [{
                    role: 'user',
                    content: 'Hi'
                    }],
                max_tokens: 5
                }),
            signal: signal || null
            });
            if (res.ok) return {
                success: true,
                message: '连接成功'
                };
            else {
                const err = await res.json().catch(() => ({}));
                return {
                    success: false,
                    message: translateError((err.error && err.error.message) || '') || 'HTTP ' + res.status
                    };
            }
        } catch (e) {
        return {
            success: false,
            message: translateError(e.message)
            };
    }
    }
};
// ========================================
// IndexedDB 存档层（带 localStorage fallback）
// ========================================
var SaveDB = {
    DB_NAME: 'BunnyGameDB',
    DB_VERSION: 3,
    STORE_NAME: 'saves',
    KV_STORE_NAME: 'kv',
    _db: null,
    _ready: false,
    _useFallback: false,
    _fallbackFailCount: 0,
    MAX_FALLBACK_FAILS: 3,
    _initPromise: null,
    async init() {
        if (this._ready) return;
        // 【P2修复】缓存 init Promise，避免并发调用各自独立打开 IndexedDB 连接
        if (this._initPromise) return this._initPromise;
        this._initPromise = (async () => {
            try {
                this._db = await new Promise((resolve, reject) => {
                    const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
                    // 添加超时保护，防止 IndexedDB 在某些环境中永远不响应
                    var timeoutId = TimerManager.setTimeout('idbOpenTimeout', function() {
                        reject(new Error('IndexedDB open timeout'));
                    }, 3000);
                    req.onupgradeneeded = function(e) {
                        var db = e.target.result;
                        // 存档 store
                        if (!db.objectStoreNames.contains('saves')) {
                            db.createObjectStore('saves');
                        }
                        // 【P0-2】通用 KV store：用于存储 GameMemory、预设、世界书等大块数据
                        // 替代 localStorage，突破 5MB 限制
                        if (!db.objectStoreNames.contains('kv')) {
                            db.createObjectStore('kv');
                        }
                    };
                    req.onsuccess = function(e) {
                        TimerManager.clearTimeout('idbOpenTimeout');
                        resolve(e.target.result);
                    };
                    req.onerror = function(e) {
                        TimerManager.clearTimeout('idbOpenTimeout');
                        reject(e.target.error);
                    };
                });
                this._ready = true;
                console.log('✅ IndexedDB 就绪 (v' + this.DB_VERSION + ', saves+kv)');
            } catch (e) {
                console.warn('⚠️ IndexedDB 不可用，回退 localStorage:', e);
                this._useFallback = true;
                this._ready = true;
            }
        })();
        return this._initPromise;
    },
    // ── 底层原始读写（带一次重试，偶发错误不立即永久 fallback） ──
    async _getRaw(key) {
        // 【P0修复】_db null 检查，避免 IDB 未初始化时崩溃
        if (!SaveDB._db) {
            throw new Error('IDB not initialized (db is null)');
        }
        return await new Promise(function(resolve, reject) {
            var tx = SaveDB._db.transaction('saves', 'readonly');
            var req = tx.objectStore('saves').get(key);
            req.onsuccess = function() { resolve(req.result || null); };
            req.onerror = function() { reject(req.error || new Error('IDB get error')); };
            // 【P0修复】补充事务级错误处理，避免 Promise 永久悬挂
            tx.onerror = function() {
                var err = tx.error;
                if (!(err instanceof Error)) {
                    err = new Error('IDB get transaction error (key=' + key + ')');
                }
                reject(err);
            };
            tx.onabort = function() {
                reject(new Error('IDB get transaction aborted (key=' + key + ')'));
            };
        });
    },
    async _setRaw(key, data) {
        // 【P0修复】_db null 检查，避免 IDB 未初始化时崩溃
        if (!SaveDB._db) {
            throw new Error('IDB not initialized (db is null)');
        }
        return await new Promise(function(resolve, reject) {
            var tx = SaveDB._db.transaction('saves', 'readwrite');
            var store = tx.objectStore('saves');
            if (data === null || data === undefined) store.delete(key);
            else store.put(data, key);
            tx.oncomplete = function() { resolve(); };
            tx.onerror = function() {
                // 【ISSUE-002 修复】tx.error 在事务被 abort 时可能为 null，
                // reject(null) 会导致上游 catch 拿到 null 序列化为 {}，无法定位根因。
                // 确保始终 reject 一个 Error 对象。
                var err = tx.error;
                if (!(err instanceof Error)) {
                    err = new Error('IDB set error (key=' + key + ', tx.error=' + (tx.error ? String(tx.error) : 'null') + ')');
                }
                reject(err);
            };
            // 【ISSUE-002 修复】tx.onabort 也需要处理，事务被中止时 onerror 不一定触发
            tx.onabort = function() {
                var err = tx.error;
                if (!(err instanceof Error)) {
                    err = new Error('IDB set aborted (key=' + key + ')');
                }
                reject(err);
            };
        });
    },
    async get(slot) {
        await this.init();
        if (this._useFallback) return this._lsGetAll()[slot] || null;
        try {
            var result = await this._getRaw('slot_' + slot);
            this._fallbackFailCount = 0;
            return result;
        } catch (e) {
            this._fallbackFailCount++;
            console.warn('IDB get失败（第' + this._fallbackFailCount + '次）:', e);
            if (this._fallbackFailCount >= this.MAX_FALLBACK_FAILS) {
                console.warn('IDB 连续失败，切换到fallback模式');
                this._useFallback = true;
            }
            return this._lsGetAll()[slot] || null;
        }
    },
    async getAll() {
        await this.init();
        if (this._useFallback) return this._lsGetFiltered();
        try {
            var result = await new Promise(function(resolve) {
                var tx = SaveDB._db.transaction('saves', 'readonly');
                var store = tx.objectStore('saves');
                var all = {};
                var req = store.openCursor();
                req.onsuccess = function(e) {
                    var cursor = e.target.result;
                    if (cursor) {
                        var key = cursor.key;
                        if (typeof key === 'string' && key.startsWith('slot_')) {
                            var slotNum = parseInt(key.replace('slot_', ''), 10);
                            if (!isNaN(slotNum) && !SaveDB._isBackupSlot(slotNum)) {
                                all[slotNum] = cursor.value;
                            }
                        }
                        cursor.continue();
                    } else {
                        resolve(all);
                    }
                };
                req.onerror = function() { resolve(SaveDB._lsGetFiltered()); };
            });
            this._fallbackFailCount = 0;
            return result;
        } catch (e) {
            this._fallbackFailCount++;
            console.warn('IDB getAll失败（第' + this._fallbackFailCount + '次）:', e);
            if (this._fallbackFailCount >= this.MAX_FALLBACK_FAILS) this._useFallback = true;
            return this._lsGetFiltered();
        }
    },
    async set(slot, data) {
        await this.init();
        // 多版本备份：写入前先轮转备份链
        // 【ISSUE-002 修复】_rotateBackup 失败不应阻塞主写入，用 try-catch 隔离
        if (data !== null && data !== undefined) {
            try {
                await this._rotateBackup(slot);
            } catch (rotateErr) {
                console.warn('[SaveDB] 备份轮转失败，继续主写入:', rotateErr);
            }
        }
        // 附加校验和，便于读档时检测静默损坏
        var dataToWrite = (data === null || data === undefined) ? data : this._attachChecksum(data);
        if (this._useFallback) {
            this._lsSet(slot, dataToWrite);
            return;
        }
        try {
            await this._setRaw('slot_' + slot, dataToWrite);
            this._fallbackFailCount = 0;
        } catch (e) {
            console.warn('IDB写入失败，重试一次:', e);
            try {
                await this._setRaw('slot_' + slot, dataToWrite);
                this._fallbackFailCount = 0;
            } catch (e2) {
                this._fallbackFailCount++;
                console.warn('IDB写入重试仍失败（第' + this._fallbackFailCount + '次）:', e2);
                if (this._fallbackFailCount >= this.MAX_FALLBACK_FAILS) {
                    console.warn('IDB 连续失败，切换到fallback模式');
                    this._useFallback = true;
                }
                this._lsSet(slot, dataToWrite);
            }
        }
    },
    // [优化#7] 多版本备份轮转：保留 MAX_BACKUPS 份历史快照
    // 轮转策略：v3 丢弃 → v2→v3 → v1→v2 → 当前→v1
    // 兼容旧格式：若旧的单备份槽（-100-slot）存在，迁移为 v1
    MAX_BACKUPS: 3,
    async _rotateBackup(slot) {
        if (slot === 0 || !(typeof slot === 'number' && slot >= 1 && slot <= 99)) return;
        try {
            var current = await this.get(slot);
            if (!current) return;
            // 兼容旧格式：检查旧单备份槽是否存在，存在则迁移为 v1
            var legacyBackupSlot = -100 - slot;
            var legacyKey = 'slot_' + legacyBackupSlot;
            var hasV1 = false;
            try {
                var legacy = this._useFallback ? this._lsGet(legacyBackupSlot) : await this._getRaw(legacyKey);
                if (legacy) {
                    // 旧备份迁移为 v1（如果 v1 还不存在）
                    var v1Key = 'slot_' + (-100 - slot) + '_v1';
                    var existingV1 = this._useFallback ? null : await this._getRaw(v1Key);
                    if (!existingV1) {
                        if (this._useFallback) this._lsSet(-100 - slot + '_v1', legacy);
                        else await this._setRaw(v1Key, legacy);
                    }
                    // 清理旧槽
                    if (this._useFallback) this._lsSet(legacyBackupSlot, null);
                    else await this._setRaw(legacyKey, null);
                    hasV1 = true;
                }
            } catch (e) { /* 旧槽读取失败忽略 */ }

            // 从最旧版本开始轮转：v(MAX)→丢弃，v(MAX-1)→v(MAX)，... v1→v2，当前→v1
            for (var v = this.MAX_BACKUPS; v >= 2; v--) {
                var fromKey = 'slot_' + (-100 - slot) + '_v' + (v - 1);
                var toKey = 'slot_' + (-100 - slot) + '_v' + v;
                try {
                    var data = this._useFallback ? this._lsGet(-100 - slot + '_v' + (v - 1)) : await this._getRaw(fromKey);
                    if (data) {
                        if (this._useFallback) this._lsSet(-100 - slot + '_v' + v, data);
                        else await this._setRaw(toKey, data);
                    }
                } catch (e) { /* 单个版本轮转失败不阻塞 */ }
            }
            // 当前数据 → v1
            var v1Key = 'slot_' + (-100 - slot) + '_v1';
            if (this._useFallback) this._lsSet(-100 - slot + '_v1', current);
            else await this._setRaw(v1Key, current);
        } catch (e) {
            console.warn('[SaveDB] 备份轮转失败，继续写入:', e);
        }
    },
    // [优化#7] 从备份恢复：默认恢复最近的 v1，可指定版本号
    async restore(slot, version) {
        if (slot === 0 || !(typeof slot === 'number' && slot >= 1 && slot <= 99)) return null;
        var v = version || 1; // 默认恢复 v1（最近一次备份）
        var backupSlot = -100 - slot + '_v' + v;
        var backupKey = 'slot_' + (-100 - slot) + '_v' + v;
        var backup = null;
        try {
            backup = this._useFallback ? this._lsGet(backupSlot) : await this._getRaw(backupKey);
        } catch (e) { /* 读取失败 */ }
        // 兼容旧格式：v1 不存在时尝试旧单备份槽
        if (!backup && v === 1) {
            try {
                backup = this._useFallback ? this._lsGet(-100 - slot) : await this._getRaw('slot_' + (-100 - slot));
            } catch (e) {}
        }
        if (!backup) {
            console.warn('[SaveDB] 槽位 ' + slot + ' v' + v + ' 没有备份可恢复');
            return null;
        }
        if (!this._verifyChecksum(backup)) {
            console.error('[SaveDB] 备份数据校验失败（v' + v + '），无法恢复');
            return null;
        }
        await this.set(slot, backup);
        return backup;
    },
    // [优化#7] 列出某存档槽的所有可用备份版本
    async listBackups(slot) {
        if (slot === 0 || !(typeof slot === 'number' && slot >= 1 && slot <= 99)) return [];
        var result = [];
        for (var v = 1; v <= this.MAX_BACKUPS; v++) {
            var key = 'slot_' + (-100 - slot) + '_v' + v;
            try {
                var data = this._useFallback ? this._lsGet(-100 - slot + '_v' + v) : await this._getRaw(key);
                if (data) {
                    result.push({
                        version: v,
                        timestamp: data._checksumTime || 0,
                        turn: (data.state && data.state.progress && data.state.progress.turn) || 0
                    });
                }
            } catch (e) {}
        }
        // 兼容旧格式
        if (result.length === 0) {
            try {
                var legacy = this._useFallback ? this._lsGet(-100 - slot) : await this._getRaw('slot_' + (-100 - slot));
                if (legacy) result.push({ version: 1, timestamp: legacy._checksumTime || 0, turn: 0, legacy: true });
            } catch (e) {}
        }
        return result;
    },
    // 启动时自动迁移：localStorage → IndexedDB
    async migrate() {
        await this.init();
        if (this._useFallback) return;
        if (Storage.get(Storage.KEYS.IDB_MIGRATED)) return;
        var migrated = 0;
        try {
            var raw = Storage.get(Storage.KEYS.LOCAL_SAVES);
            if (raw) {
                var saves = JSON.parse(raw);
                for (let slot in saves) {
                    if (saves.hasOwnProperty(slot) && saves[slot] && !this._isBackupSlot(parseInt(slot, 10))) {
                        await this.set(parseInt(slot, 10), saves[slot]);
                        migrated++;
                    }
                }
            }
        } catch (e) {
            // 【I修复】迁移失败不再静默：记录警告，但仍置位 IDB_MIGRATED 避免每次启动无限重试
            console.warn('[SaveDB.migrate] localStorage→IndexedDB 迁移失败，已跳过', migrated, '个存档:', e.message);
        }
        Storage.set(Storage.KEYS.IDB_MIGRATED, '1');
        // 【P0-5】迁移大块数据从 localStorage 到 IndexedDB KV store
        // 这些数据之前占用大量 localStorage 空间，是"存储空间不足"的主要原因
        var kvKeys = [
            Storage.KEYS.MEMORY,
            Storage.KEYS.API_PRESETS,
            Storage.KEYS.WORLD_INFO,
            Storage.KEYS.GLOBAL_VARS
        ];
        for (var i = 0; i < kvKeys.length; i++) {
            try {
                await this.kvMigrateFromLocalStorage(kvKeys[i]);
            } catch(e) {
                console.warn('[SaveDB.migrate] KV 迁移失败:', kvKeys[i], e);
            }
        }
        // 【P1-2】清理旧的 _perfLog localStorage 数据
        try { localStorage.removeItem('_perfLog'); } catch(e) {}
    },
    // ── 备份与校验工具 ──
    // [优化#7] 保留旧方法兼容外部调用，实际备份已改为多版本
    _getBackupSlot(slot) {
        if (slot === 0) return -1;
        if (typeof slot === 'number' && slot >= 1 && slot <= 99) return -100 - slot;
        return null;
    },
    _isBackupSlot(slot) {
        // 兼容多版本格式：-100-slot-vN（字符串形式）
        if (typeof slot === 'string') return /^-\d+_v\d+$/.test(slot);
        return slot === -1 || (slot <= -101 && slot >= -199);
    },
    _attachChecksum(data) {
        if (!isObject(data)) return data;
        var clone = StateSchema.deepClone(data);
        var stateStr = typeof clone.state === 'string' ? clone.state : JSON.stringify(clone.state || {});
        clone._checksum = this._crc32(stateStr);
        clone._checksumTime = Date.now();
        return clone;
    },
    _verifyChecksum(data) {
        if (!isObject(data)) return true;
        if (typeof data._checksum !== 'number') return true; // 旧存档无校验，放行
        var stateStr = typeof data.state === 'string' ? data.state : JSON.stringify(data.state || {});
        return data._checksum === this._crc32(stateStr);
    },
    _crc32(str) {
        var table = this._crc32Table;
        if (!table) {
            table = [];
            for (let i = 0; i < 256; i++) {
                var c = i;
                for (let j = 0; j < 8; j++) {
                    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                }
                table[i] = c;
            }
            this._crc32Table = table;
        }
        var crc = -1;
        for (let i = 0; i < str.length; i++) {
            crc = table[(crc ^ str.charCodeAt(i)) & 0xFF] ^ (crc >>> 8);
        }
        return (crc ^ -1) >>> 0;
    },
    // ── localStorage fallback 方法 ──
    _lsGetAll() {
        try {
            return Storage.getJSON(Storage.KEYS.LOCAL_SAVES, {});
        } catch (e) {
            console.error('[SaveManager] 读取localSaves失败:', e);
            return {};
        }
    },
    _lsGetFiltered() {
        var all = this._lsGetAll();
        var result = {};
        for (let k in all) {
            if (all.hasOwnProperty(k)) {
                var slotNum = parseInt(k, 10);
                if (!isNaN(slotNum) && !this._isBackupSlot(slotNum)) {
                    result[k] = all[k];
                }
            }
        }
        return result;
    },
    _lsSet(slot, data) {
        try {
            var saves = this._lsGetAll();
            if (data === null) delete saves[slot];
            else saves[slot] = data;
            var jsonStr = JSON.stringify(saves);
            // 检查容量
            if (jsonStr.length > 4.5 * 1024 * 1024) {
                Storage.remove(Storage.KEYS.AUTO_SAVE_BACKUP);
            }
            var _setResult = Storage.set(Storage.KEYS.LOCAL_SAVES, jsonStr);
            if (!_setResult.success) {
                console.error('❌ localStorage 存档写入失败:', _setResult.error, _setResult.message);
                if (typeof UI !== 'undefined' && UI.toast) {
                    UI.toast('存档写入失败：' + (_setResult.message || '存储空间不足') + '，请导出存档');
                }
            }
        } catch (e) {
            // 尝试清理后重试一次
            try {
                Storage.remove(Storage.KEYS.AUTO_SAVE_BACKUP);
                Storage.remove(Storage.KEYS.IDB_MIGRATED);
                var saves = this._lsGetAll();
                if (data === null) delete saves[slot];
                else saves[slot] = data;
                var _retryResult = Storage.set(Storage.KEYS.LOCAL_SAVES, JSON.stringify(saves));
                if (!_retryResult.success) {
                    console.error('❌ 清理后仍无法写入，存档可能丢失:', _retryResult.error);
                    if (typeof UI !== 'undefined' && UI.toast) {
                        UI.toast('存档写入失败：' + (_retryResult.message || '存储空间不足') + '，请导出存档后清理');
                    }
                }
            } catch (e2) {
                console.error('❌ 清理后仍无法写入，存档可能丢失:', e2);
                // 尝试提示用户
                if (typeof UI !== 'undefined' && UI.toast) {
                    UI.toast('存储空间不足，请导出存档后清理');
                }
            }
        }
    },
    // ========================================
    // 【P0-2】通用 KV 存储接口
    // 用于替代 localStorage 存储大块数据（GameMemory、预设、世界书等）
    // 突破 localStorage 5MB 限制，利用 IndexedDB 数百MB-GB级容量
    // ========================================
    async kvGet(key) {
        await this.init();
        if (this._useFallback) {
            // fallback：从 localStorage 读取
            try {
                var raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : null;
            } catch(e) { return null; }
        }
        try {
            var result = await new Promise(function(resolve, reject) {
                var tx = SaveDB._db.transaction('kv', 'readonly');
                var req = tx.objectStore('kv').get(key);
                req.onsuccess = function() { resolve(req.result || null); };
                req.onerror = function() { reject(req.error || new Error('KV get error')); };
                tx.onerror = function() { reject(tx.error || new Error('KV get tx error')); };
                tx.onabort = function() { reject(new Error('KV get tx aborted')); };
            });
            // 【P1-3】自动解压压缩数据
            if (result && typeof decompressData === 'function') {
                return await decompressData(result);
            }
            return result;
        } catch(e) {
            console.warn('[SaveDB.kvGet] 读取失败，尝试 localStorage fallback:', key, e);
            try {
                var raw2 = localStorage.getItem(key);
                return raw2 ? JSON.parse(raw2) : null;
            } catch(e2) { return null; }
        }
    },
    async kvSet(key, value) {
        await this.init();
        // 【P1-3】写入前压缩大块数据（保存原始值用于 localStorage fallback）
        var originalValue = value;
        if (value !== null && value !== undefined && typeof compressData === 'function') {
            try {
                value = await compressData(value);
            } catch(e) { /* 压缩失败用原始数据 */ }
        }
        if (this._useFallback) {
            // fallback：写入 localStorage（用原始未压缩数据）
            try {
                localStorage.setItem(key, JSON.stringify(originalValue));
                return true;
            } catch(e) {
                console.warn('[SaveDB.kvSet] localStorage fallback 写入失败:', key, e);
                return false;
            }
        }
        try {
            await new Promise(function(resolve, reject) {
                var tx = SaveDB._db.transaction('kv', 'readwrite');
                var store = tx.objectStore('kv');
                if (value === null || value === undefined) store.delete(key);
                else store.put(value, key);
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function() {
                    var err = tx.error;
                    if (!(err instanceof Error)) err = new Error('KV set error (key=' + key + ')');
                    reject(err);
                };
                tx.onabort = function() {
                    var err = tx.error;
                    if (!(err instanceof Error)) err = new Error('KV set aborted (key=' + key + ')');
                    reject(err);
                };
            });
            return true;
        } catch(e) {
            console.warn('[SaveDB.kvSet] IndexedDB 写入失败，尝试 localStorage fallback:', key, e);
            try {
                localStorage.setItem(key, JSON.stringify(originalValue));
                return true;
            } catch(e2) {
                console.error('[SaveDB.kvSet] localStorage fallback 也失败:', key, e2);
                return false;
            }
        }
    },
    async kvRemove(key) {
        await this.init();
        if (this._useFallback) {
            try { localStorage.removeItem(key); } catch(e) {}
            return;
        }
        try {
            await new Promise(function(resolve, reject) {
                var tx = SaveDB._db.transaction('kv', 'readwrite');
                tx.objectStore('kv').delete(key);
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function() { reject(tx.error || new Error('KV remove error')); };
                tx.onabort = function() { reject(new Error('KV remove aborted')); };
            });
        } catch(e) {
            try { localStorage.removeItem(key); } catch(e2) {}
        }
    },
    // 从 localStorage 迁移数据到 IndexedDB KV store
    // 启动时自动调用，迁移成功后清除 localStorage 中的数据
    async kvMigrateFromLocalStorage(key) {
        if (this._useFallback) return false;
        try {
            var raw = localStorage.getItem(key);
            if (raw === null) return false;
            var data = JSON.parse(raw);
            // 写入 IndexedDB
            var ok = await this.kvSet(key, data);
            if (ok) {
                // 迁移成功，清除 localStorage 中的大块数据
                localStorage.removeItem(key);
                console.log('[SaveDB] KV 迁移成功:', key, '(' + (raw.length * 2 / 1024).toFixed(1) + 'KB)');
                return true;
            }
        } catch(e) {
            console.warn('[SaveDB] KV 迁移失败:', key, e);
        }
        return false;
    }
};
// ========================================
// 题 材 库 数 据
// 未来加题材只需往数组里push对象即可
// ========================================
const THEME_LIBRARY = [
    // ---- 自由创作（推荐） ----
    {
        category: '自由创作',
        icon: '✦',
        title: '自由创作·无限可能',
        desc: '输入你想要的任何世界，AI 会理解并创造',
        prompt: '',
        tags: ['自由', '无限'],
        hot: true
    },
    // ---- 修仙玄幻 ----
    {
        category: '修仙玄幻',
        icon: '武',
        title: '废材逆袭·退婚流',
        desc: '被退婚的废材，意外获得系统金手指，一路逆袭打脸',
        prompt: '我想玩修仙养成，被退婚的废材，开局有系统金手指',
        tags: ['系统', '逆袭', '爽文'],
        hot: true
    }, {
    category: '修仙玄幻',
    icon: '',
    title: '宗门小弟·卧薪尝胆',
    desc: '宗门外门弟子，天赋平庸但意志坚定，苦修成圣',
    prompt: '我想玩修仙游戏，我是一个天赋平庸的外门弟子，没有金手指，靠毅力和智谋一步步成长',
    tags: ['慢热', '硬核', '成长']
}, {
category: '修仙玄幻',
icon: '',
title: '妖族觉醒·化形之路',
desc: '你是一只修炼千年的妖兽，刚刚化为人形混入人界',
prompt: '我想玩修仙游戏，我是一只刚化形的妖狐，混入人类修仙宗门，要隐藏身份修炼',
tags: ['妖族', '隐藏身份', '剧情']
},
// ---- 宫斗权谋 ----
{
    category: '宫斗权谋',
    icon: '',
    title: '小答应·宫斗求生',
    desc: '刚入宫的小答应，目标活到最后成为皇后',
    prompt: '我想玩宫斗模拟器，刚入宫的小答应，目标成为皇后',
    tags: ['策略', '权谋', '后宫'],
    hot: true
}, {
category: '宫斗权谋',
icon: '',
title: '权臣之路·朝堂风云',
desc: '落魄世家子弟入朝为官，在各派势力中周旋上位',
prompt: '我想玩朝堂权谋游戏，我是落魄世家子弟刚中进士入朝为官，要在各派系斗争中往上爬',
tags: ['权谋', '朝堂', '烧脑']
},
// ---- 末日生存 ----
{
    category: '末日生存',
    icon: '',
    title: '丧尸围城·便利店开局',
    desc: '在便利店醒来，外面全是丧尸，你能活几天？',
    prompt: '我想玩末日生存，在便利店醒来，外面全是丧尸',
    tags: ['生存', '硬核', '恐怖'],
    hot: true
}, {
category: '末日生存',
icon: '',
title: '核冬天·地堡求生',
desc: '核战后的地下掩体，资源有限，外面辐射致命',
prompt: '我想玩末日生存，核战后我在一个地下掩体里醒来，物资只够7天，需要决定是守还是出去探索',
tags: ['资源管理', '抉择', '废土']
},
// ---- 娱乐圈 ----
{
    category: '娱乐圈',
    icon: '💃',
    title: '女团选秀·逆风翻盘',
    desc: '被公司雪藏的练习生，想靠实力在选秀中翻红',
    prompt: '我想玩女团选秀，被公司雪藏的练习生，想靠实力翻红',
    tags: ['选秀', '热血', '成长']
}, {
category: '娱乐圈',
icon: '🎤',
title: '黑红艺人·洗白上位',
desc: '十八线黑红艺人，满身黑料但有实力，想洗白',
prompt: '我想玩娱乐圈，十八线黑红艺人，想洗白上位',
tags: ['策略', '舆论', '翻身'],
hot: true
}, {
category: '娱乐圈',
icon: '',
title: '天才编剧·影视江湖',
desc: '有才华的小编剧，被大导演看中卷入影视圈纷争',
prompt: '我想玩娱乐圈游戏，我是一个有才华的小编剧，写的剧本被大导演看中，卷入影视圈的各种纷争',
tags: ['剧情', '创作', '职场']
},
// ---- 无限流 ----
{
    category: '无限流',
    icon: '',
    title: '恐怖副本·智商求生',
    desc: '被拉进诡异副本，要靠智商和勇气活下来',
    prompt: '我想玩无限流，被拉进恐怖副本，要靠智商活下来',
    tags: ['推理', '恐怖', '烧脑'],
    hot: true
}, {
category: '无限流',
icon: '',
title: '规则怪谈·诡异医院',
desc: '你在一家医院醒来，墙上贴满了奇怪的规则',
prompt: '我想玩规则怪谈游戏，我在一家诡异医院醒来，到处贴着奇怪的规则，违反规则就会死',
tags: ['怪谈', '规则', '解谜']
},
// ---- 校园青春 ----
{
    category: '校园青春',
    icon: '',
    title: '转校生·社团物语',
    desc: '高二转学到新学校，加入了一个快要废部的社团',
    prompt: '我想玩校园青春游戏，高二转学生，加入了一个只剩3人快被废部的社团，要在文化祭前拯救社团',
    tags: ['青春', '日常', '热血']
}, {
category: '校园青春',
icon: '',
title: '高三冲刺·命运分岔',
desc: '高三最后一年，学习、友情、暗恋交织的日常',
prompt: '我想玩校园游戏，高三学生，成绩中等偏上，暗恋同桌，好朋友要出国，在学业和感情中做选择',
tags: ['青春', '恋爱', '日常']
},
// ---- 商战职场 ----
{
    category: '商战职场',
    icon: '',
    title: '创业维艰·车库起步',
    desc: '互联网创业者，从车库开始，挑战行业巨头',
    prompt: '我想玩创业模拟游戏，我是一个刚辞职的程序员，有一个颠覆性的产品idea，从车库开始创业',
    tags: ['商战', '创业', '策略']
}, {
category: '商战职场',
icon: '🏢',
title: '办公室政治·升职之路',
desc: '一个大公司新人，在复杂的办公室关系中生存升职',
prompt: '我想玩职场游戏，我是刚入职大公司的新人，部门里派系复杂，要在各种办公室政治中升职',
tags: ['职场', '策略', '现实']
},
// ---- 历史架空 ----
{
    category: '历史架空',
    icon: '',
    title: '三国谋士·乱世生存',
    desc: '穿越到三国时代，作为无名谋士开始乱世求生',
    prompt: '我想玩三国游戏，我穿越成了一个无名谋士，开局在一个小县城，天下即将大乱',
    tags: ['三国', '策略', '穿越']
},
// ---- 奇幻冒险 ----
{
    category: '奇幻冒险',
    icon: '',
    title: '魔法学院·新生入学',
    desc: '收到魔法学院的录取通知书，开始奇幻校园生活',
    prompt: '我想玩西方奇幻游戏，我是一个刚被魔法学院录取的平民新生，没有显赫家世，要靠自己在学院里站稳脚跟',
    tags: ['魔法', '学院', '冒险']
},
// ---- 悬疑推理 ----
{
    category: '悬疑推理',
    icon: '侦',
    title: '连环案件·新手侦探',
    desc: '小镇发生离奇连环失踪案，你是唯一的侦探',
    prompt: '我想玩悬疑推理游戏，我是一个小镇上的新手私人侦探，镇上发生了连环失踪案，警察毫无头绪',
    tags: ['推理', '悬疑', '剧情'],
    hot: true
},
// ---- 恋爱模拟 ----
{
    category: '恋爱模拟',
    icon: '',
    title: '合租奇缘·都市爱情',
    desc: '因为租房意外和陌生人合租，都市爱情故事开始',
    prompt: '我想玩恋爱模拟游戏，因为租房出了问题不得不和一个陌生人合租，对方性格很难相处但其实外冷内热',
    tags: ['恋爱', '日常', '甜文']
},
];
// ========================================
// 全局状态
// ========================================
// 游戏版本号，用于存档兼容性检查
const GAME_VERSION = '1.2.0';

// gameState工厂函数，确保初始化和重置时字段一致
function createDefaultGameState() {
    return {
        _version: GAME_VERSION,
        userPrompt: '',
        customStyle: '',
        systemPrompt: '',
        conversationHistory: [],
        allCharacters: {},
        temperature: 0.8,
        fontSize: 16,
        pinnedModules: {},
        rollingSummary: '',
        autoCompress: true,
        tokenCount: 0,
        maxTokens: DEFAULT_MAX_TOKENS,
        useStream: true,
        streamFailCount: 0,
        generateChoices: true,
        // 默认使用 JSON 模式，让 AI 返回结构化数据以填充个人/人际/日志等面板
        pureTextMode: false,
        keyEvents: [],
        worldSnapshot: {},
        currentQuests: [],
        relationships: [],
        currentBag: [],
        playerData: null,
        favStories: [],
        generatedNovel: '',
        protagonistSetup: {},
        _jailbreakPrompt: '',
        _assistantPrompt: '',
        gameTime: {
            date: '', time: '', period: '', weather: '', era: ''
        },
    _presetApps: {},
    _stats: {
        startTime: Date.now(),
        totalTurns: 0,
        totalTokens: 0,
        maxTokensInTurn: 0,
        totalCharacters: 0,
        completedQuests: 0,
        totalPlayTime: 0
    },
_undoHistory: [],
_MAX_UNDO_HISTORY: 50,
wordCountConfig: {
    enabled: true,
    min: 1500,
    max: 3000,
    paragraphMin: 15,
    paragraphMax: 17,
    paragraphStyle: 'medium',
    perspective: 'third_person_limited',
    userPronoun: 'second_person',
    takeover: 'closed',
    narrate: 'closed',
    pacing: 'steady',
    lengthPreset: 'medium'
},
_theaterContent: {},
_worldModules: [],
_chatLogs: {},
_chattedNpcs: {},
_lastAIReply: null,
_depthPrompts: {},
_positionPrompts: {},
_afterChatPrompts: [],
_wiCachedResult: null,
_moments: [],
_npcDiaries: {},
_mail: [],
_diary: [],
// 【酒馆预设融合】新增叙事增强字段
writingStyle: '',            // 文风选择：baimiao/liudong/lengjun/nongmo（来自果实预设）
cotMode: '',                 // 思维链模式（来自蛾摩拉预设）
showCotPanel: false,          // 【BUG-030 修复】思维链面板可见性（由 cotMode === 'enabled' 推导）
cotAutoExpand: false,        // 思维链完成后自动展开
summaryThreshold: 6,         // 摘要阈值（来自月读预设）
_squashSystemMessages: true, // 合并system消息（来自果实预设，默认开启）
// === 章节模式（来自果实预设的长篇剧情规范） ===
chapterMode: 'off',          // off / chapter / longform
// === 叙事基调（来自月读预设的10眼系统） ===
// 全部默认开启，固定为游戏叙事基础规范，玩家无需感知
narrativeEyes: {
    realistic: true,         // 现实感：可验证的因果与常识
    ideal: true,             // 温情：温柔联结与情感修复
    ensemble: true,          // 多角色：多角色共驱
    daily: true,             // 日常感：日常切片与关系温度
    heartbeat: true,         // 情绪强：情绪浓度强化
    undercurrent: true,      // 潜台词：潜台词与利益博弈
    fate: true,              // 因果链：选择-后果-再选择
    comedy: true,            // 轻松幽默：轻荒诞世界观
    balanced: true,          // 戏剧平衡：戏剧性与合理性平衡
    mystery: true            // 超自然：现实与超常模糊边界
},
// === 推荐参数档位（一键切换 4 档叙事参数） ===
presetArchetype: 'free'      // conservative / natural / passionate / delicate / free
};
}

var gameState = createDefaultGameState();


// 原问题：core.js 顶层用 var/let/const 声明大量全局（streamBuffer/isWaiting/isCompressing/
// npcEditingName/npcChatState/MAX_HISTORY），由 game.js/phone-ui.js 直接读写，无模块边界，
// 重构时极易遗漏。现统一封装到 RuntimeState 单例，通过 getter/setter 访问。
// 注意：
// - gameState 仍是顶层全局（StateManager 已封装其读写，且跨文件引用极广），暂不纳入
// - RuntimeState.npcChatState 为对象引用，嵌套修改（.npcName/.chatHistory 等）直接操作底层对象

// 跨文件直接赋值重置。该模式依赖全局 var 提升跨脚本可见，strict mode 下会 ReferenceError，
// 且散落 3 处重置点（sendAIRequest/resetRuntimeState/取消按钮）+ 4 处读写点（onStreamChunk），
// 重构易遗漏。现纳入 RuntimeState 与 streamBuffer 同域管理（两者本就协同控制流式解析）。
const RuntimeState = {
    _streamBuffer: '',
    _isWaiting: false,
    _isCompressing: false,
    _npcEditingName: '',
    _npcChatState: {
        npcName: '',
        chatHistory: [],
        isSending: false,
        abortController: null
    },
    _streamMode: null,        // 'json' | 'plaintext' | null
    _streamModeLocked: false, // 模式锁定后不再切换
    MAX_HISTORY: 20,  // 常量，直接暴露
    get streamBuffer() { return this._streamBuffer; },
    set streamBuffer(v) { this._streamBuffer = v; },
    get isWaiting() { return this._isWaiting; },
    set isWaiting(v) { this._isWaiting = v; },
    get isCompressing() { return this._isCompressing; },
    set isCompressing(v) { this._isCompressing = v; },
    get npcEditingName() { return this._npcEditingName; },
    set npcEditingName(v) { this._npcEditingName = v; },
    get npcChatState() { return this._npcChatState; },
    get streamMode() { return this._streamMode; },
    set streamMode(v) { this._streamMode = v; },
    get streamModeLocked() { return this._streamModeLocked; },
    set streamModeLocked(v) { this._streamModeLocked = v; },
    // npcChatState 不提供 setter：嵌套对象通过 RuntimeState.npcChatState.xxx 修改
    // 重置时调 resetNpcChatState()
    resetNpcChatState() {
        this._npcChatState.npcName = '';
        this._npcChatState.chatHistory = [];
        this._npcChatState.abortController = null;
        this._npcChatState.isSending = false;
    }
};


// 极易字段遗漏。现在统一为 ensureGameStateFields() 和 resetRuntimeState(scope) 两个函数。
// ensureGameStateFields：补全缺失字段（用于 loadFromSlot 和 handleImportFile）
function ensureGameStateFields(gs) {
    if (!gs) gs = {};
    var defaults = createDefaultGameState();
    Object.keys(defaults).forEach(function(k) {
        if (gs[k] === undefined || gs[k] === null) {
            gs[k] = defaults[k];
        }
    });
    // 特殊处理：maxTokens 的历史 bug 兼容（80000 是旧版本误写的异常默认值）
    var _mtVal = Number(gs.maxTokens);
    if (!isFinite(_mtVal) || _mtVal <= 0 || _mtVal === 80000) {
        gs.maxTokens = DEFAULT_MAX_TOKENS;
    }
    // 特殊处理：_stats.startTime 读档时应重置
    if (gs._stats) {
        gs._stats.startTime = Date.now();
    }

    // 从 protagonistSetup.mcName 或 playerData.name 同步，确保 playerName 始终有值
    if (!gs.playerName) {
        if (gs.protagonistSetup && gs.protagonistSetup.mcName) {
            gs.playerName = gs.protagonistSetup.mcName;
        } else if (gs.playerData && gs.playerData.name) {
            gs.playerName = gs.playerData.name;
        }
    }
    // 读档后重置临时字段，防止旧数据残留
    gs._depthPrompts = {};
    gs._positionPrompts = {};
    gs._afterChatPrompts = [];
    gs._wiCachedResult = null;
    // 重置世界书轮次追踪器

    if (typeof WorldInfo !== 'undefined') {
        WorldInfo._turnTracker = {};
    }
    return gs;
}

// resetRuntimeState：重置运行时状态（用于 startNewGame 和 loadFromSlot 前清场）
// scope: 'full'（新游戏，全部重置）/ 'load'（读档，保留 gameState 但重置运行时变量）
function resetRuntimeState(scope) {
    RuntimeState.streamBuffer = '';
    RuntimeState.isWaiting = false;
    RuntimeState.isCompressing = false;
    // 压缩冷却实际使用 window.lastCompressTime（见 game.js）
    window.lastCompressTime = 0;

    RuntimeState.streamModeLocked = false;
    RuntimeState.streamMode = null;
    // 清空增强记忆系统（防止旧记忆污染新游戏）
    if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.clear) {
        EnhancedMemory.clear();
    }
    // 清空NPC聊天状态
    RuntimeState.resetNpcChatState();
    // 清空打字机缓冲
    if (typeof TypewriterBuffer !== 'undefined' && TypewriterBuffer.stop) {
        TypewriterBuffer.stop();
    }
    // 清空UI残留
    var storyEl = document.getElementById('storyText');
    if (storyEl) storyEl.innerHTML = '';
    // full 模式：整体替换 gameState
    if (scope === 'full') {
        gameState = createDefaultGameState();

        // 【P0-3 修复】gameState 被重新赋值为新对象后，StateManager._state 仍指向旧对象，
        // 导致引用断裂：StateManager.set 写入旧对象，UI 读 gameState（新对象）拿到空数据。
        // 必须在 _ensureDataLinkage 之前调用 attachState 重建引用，保证后续数据联动基于正确对象。
        if (typeof StateManager !== 'undefined' && StateManager.attachState) {
            StateManager.attachState(gameState);
        }

        // 重新建立 gameState 与 GameMemory tables 之间的引用别名
        if (typeof _ensureDataLinkage === 'function') {
            try { _ensureDataLinkage(); } catch (e) { console.warn('[resetRuntimeState] 数据联动失败:', e); }
        }
    }
}


// npcChatState 改由 RuntimeState 单例承载。此处保留顶层引用以兼容现有调用点
// （game.js / phone-ui.js 仍按旧名读写）；通过 Object.defineProperty 转发到 RuntimeState，
// 确保所有读写都集中在单一真相源。后续 P2/P3 可逐步删除这些兼容别名。
Object.defineProperty(window, 'streamBuffer', {
    get: function() { return RuntimeState.streamBuffer; },
    set: function(v) { RuntimeState.streamBuffer = v; },
    configurable: true
});
Object.defineProperty(window, 'isWaiting', {
    get: function() { return RuntimeState.isWaiting; },
    set: function(v) { RuntimeState.isWaiting = v; },
    configurable: true
});
Object.defineProperty(window, 'isCompressing', {
    get: function() { return RuntimeState.isCompressing; },
    set: function(v) { RuntimeState.isCompressing = v; },
    configurable: true
});
Object.defineProperty(window, 'npcEditingName', {
    get: function() { return RuntimeState.npcEditingName; },
    set: function(v) { RuntimeState.npcEditingName = v; },
    configurable: true
});
Object.defineProperty(window, 'npcChatState', {
    get: function() { return RuntimeState.npcChatState; },
    configurable: true
});
Object.defineProperty(window, 'MAX_HISTORY', {
    get: function() { return RuntimeState.MAX_HISTORY; },
    configurable: true
});
// ======= 打字机缓冲系统 v2（优化版） =======
// 优化：段落级渲染节流、标点智能停顿、统一光标、脏检查
var TypewriterBuffer = {
    queue: '',
    _queueIdx: 0,
    displayed: '',
    isTyping: false,
    timer: null,

    // P1 修复 R5：baseSpeed 改回 25（原版值），新版误改为 50 导致打字速度减半
    baseSpeed: 25,
    onComplete: null,
    // 【BUG-028 修复】流式模式标志：为 true 时 render() 始终用增量 appendChild 路径，
    // 不调用 formatStory 全量格式化（parseFromText + stripDecorTags + sanitizeHtml）。
    // 根因：流式生成时打字机频繁 catch up（queue 耗尽 → pause → isTyping=false），
    // 若此时恰好有新段落完成，render() 会走非打字路径调用 formatStory(fullText) + innerHTML 全量替换。
    // 长时间流式（2-3分钟）中此路径被触发数十次，每次 O(n) 格式化 + DOMParser + innerHTML 重建，
    // 累积导致主线程冻结。修复后流式期间始终用 O(1) appendChild，formatStory 仅在最终渲染时调用一次。
    _streamingMode: false,
    _visibilityHandler: null,
    _completedParagraphs: [],
    _currentParaChars: '',
    _lastRendered: '',
    _rafPending: false,

    _cachedCompletedHtml: '',
    _cachedCompletedKey: '',
    _cachedParaCount: 0,       // 【P0冻结修复】已渲染到DOM的段落数，用于增量追加
    _lastCompletedCount: 0,    // 【P0冻结修复】上次脏检查时的段落数
    _lastCurrentLen: 0,        // 【P0冻结修复】上次脏检查时的当前段落长度
    _lastCurrentPara: '',
    // 【BUG-011 修复】isFinished 方法缺失：phone-ui.js 4493 有一个同名方法，
    // 但 game.js 2630 调用的是 core.js 的 TypewriterBuffer，访问不到 phone-ui 的扩展。
    // 当 isFinished 抛 TypeError，整个 sendAIRequest 后半段（turn++、选项渲染、loading 清理）都跳过。
    // 这里实现"打字机不活跃且队列已空"判定，与 phone-ui 版本语义一致。
    isFinished: function() {
        return !this.isTyping && !this.queue;
    },
    // 标点停顿映射（字符 → 额外等待ms）
    _pauseMap: {
        '\u3002': 120, '\uff01': 120, '\uff1f': 120, '\u2026': 80,
        '\uff1b': 80, '\uff1a': 60,
        '\uff0c': 50, '\u3001': 40,
        '\u300c': 30, '\u300d': 40, '\u300b': 40,
        '\n': 60
    },

    push(newText) {
        if (!newText) return;
        // 确保 queue 和 displayed 已初始化，防止 undefined 错误
        if (typeof this.queue !== 'string') this.queue = '';
        if (typeof this.displayed !== 'string') this.displayed = '';

        // 【NEW-013 修复】长文本自动跳过打字机动画
        // 阈值从 2000 提升到 4000：2000 过低导致正常长度的故事（1500-3000字）也跳过动画
        // 4000 字以上才跳过，兼顾性能与体验。同时参考 SillyTavern 的 document.hasFocus 优化
        var _LONG_TEXT_THRESHOLD = 4000;
        if (typeof newText === 'string' && newText.length > _LONG_TEXT_THRESHOLD &&
            this.displayed.length === 0 && !this.isTyping) {
            // 直接渲染完整文本，跳过逐字动画
            this.displayed = newText;
            this.queue = newText;
            this._queueIdx = newText.length;
            this._currentParaChars = newText;
            this._completedParagraphs = [];
            this.render();
            try { _hideSkipButton(); } catch (e) {}
            if (this.onComplete) {
                var cb = this.onComplete;
                this.onComplete = null;
                cb();
            }
            return;
        }

        // 【NEW-013 修复】标签页不可见时跳过逐字渲染（参考 SillyTavern document.hasFocus）
        // 用户切到其他标签页时，逐字动画是纯 CPU 浪费，直接渲染到末尾
        if (typeof document !== 'undefined' && document.hidden && this.isTyping) {
            this.displayed = newText;
            this.queue = newText;
            this._queueIdx = newText.length;
            this._currentParaChars = newText;
            this.render();
            return;
        }

        var newSuffix = newText.substring(this.displayed.length);

        // 【BUG修复】流式长文本自动加速：队列累积超过5000字时直接flush
        // 避免流式模式下逐字动画耗时过长（原25ms/char，5000字需2分钟）
        if (this.isTyping && newSuffix.length > 5000 && this._queueIdx < this.queue.length) {
            this.displayed = newText;
            this.queue = newText;
            this._queueIdx = newText.length;
            this._currentParaChars = '';
            this._completedParagraphs = [];
            this.pause();
            this.render();
            try { _hideSkipButton(); } catch (e) {}
            if (this.onComplete) {
                var _flushCb = this.onComplete;
                this.onComplete = null;
                _flushCb();
            }
            return;
        }

        var remaining = this._queueIdx >= this.queue.length ? '' : this.queue.substring(this._queueIdx);
        if (newSuffix.indexOf(remaining) === 0) {
            // 原 remaining 是 newSuffix 前缀，只追加差异（最优路径）
            this.queue = remaining + newSuffix.substring(remaining.length);
            this._queueIdx = 0;
        } else if (remaining.indexOf(newSuffix) === 0 && newSuffix.length > 0) {
            // newSuffix 是原 remaining 前缀：流式过程中文本被截短，保持 queue 不变等待恢复
            // 避免覆盖导致闪烁或丢字（_queueIdx 不动，仍指向已消费位置）
        } else {
            // 内容发生变化，用新的完整 suffix 替换 queue
            this.queue = newSuffix;
            this._queueIdx = 0;
        }
    if (!this.isTyping) this.start();
    },
    start() {
        if (this.isTyping) return;
        this.isTyping = true;
        // 只在首次启动（displayed为空）时重置段落缓存，
        // 标点停顿后恢复打字时不能重置，否则已完成的段落会丢失
        if (this.displayed.length === 0) {
            this._completedParagraphs = [];
            this._currentParaChars = '';
            // 【P0冻结修复】同步重置增量渲染计数器
            this._cachedParaCount = 0;
            this._lastCompletedCount = 0;
            this._lastCurrentLen = 0;
            this._mergedParaDirty = false;  // 【段落碎片化治理】重置合并标记
        }
        // 【用户需求】打字机开始时显示「跳过」按钮（无长按快进、无点击屏幕快进）
        try { _showSkipButton(); } catch (e) {}
        const self = this;
    TimerManager.setInterval('typewriter', function() {
        if (self._queueIdx >= self.queue.length) {
            self.pause();
            if (self._currentParaChars) {
                self._pushCompletedPara(self._currentParaChars);
                self._currentParaChars = '';
            }
        self._renderCached();
        // 【安全网】自然完成时若没有 onComplete 也要隐藏跳过按钮
        if (!self.onComplete) {
            try { _hideSkipButton(); } catch (e) {}
        }
        if (self.onComplete) {
            self.onComplete();
            self.onComplete = null;
        }
    return;
    }
    // 【P0 性能修复】自适应打字速度 + 批量字符串操作
    // 原实现：每tick循环中 self.displayed += ch（20次），每次创建新字符串 → O(n²) 累积
    // 新实现：用 substring 一次提取批次，一次性拼接 → O(n)
    var _remaining = self.queue.length - self._queueIdx;
    var _charsPerTick = 1;
    if (_remaining > 2000) _charsPerTick = 20;
    else if (_remaining > 1000) _charsPerTick = 12;
    else if (_remaining > 500) _charsPerTick = 8;
    else if (_remaining > 100) _charsPerTick = 3;

    // 批量提取字符：一次 substring 替代 N 次 += ch
    var _actualEnd = Math.min(self._queueIdx + _charsPerTick, self.queue.length);
    var _batch = self.queue.substring(self._queueIdx, _actualEnd);
    self._queueIdx = _actualEnd;
    self.displayed += _batch;
    var _lastCh = _batch.charAt(_batch.length - 1);

    // 批量处理换行：在批次内查找所有 \n，完成对应段落
    var _nlPos = _batch.indexOf('\n');
    while (_nlPos >= 0) {
        self._currentParaChars += _batch.substring(0, _nlPos);
        if (self._currentParaChars.length > 0) {
            self._pushCompletedPara(self._currentParaChars);
            self._currentParaChars = '';
            self._renderCached();
        }
        _batch = _batch.substring(_nlPos + 1);
        _nlPos = _batch.indexOf('\n');
    }
    self._currentParaChars += _batch;

    // 渲染当前段落（render 内部有脏检查 + textContent 优化）
    self._renderCurrentPara();

    // 标点智能停顿（只检查最后一个字符，避免批量处理时频繁停顿）
    var pause = self._pauseMap[_lastCh];
    // 长文本时缩短标点停顿时间，避免累积延迟
    if (pause && _remaining > 500) pause = Math.min(pause, 30);
    if (pause) {
        self.pause();
        self._pauseTimer = TimerManager.setTimeout('typewriterPause', function() {
            self._pauseTimer = null;
            if (self._queueIdx < self.queue.length || self._currentParaChars.length > 0) {
                self.start();
                } else {
                self.pause();
                if (self._currentParaChars) {
                    self._pushCompletedPara(self._currentParaChars);
                    self._currentParaChars = '';
                }
            self._renderCached();
            if (self.onComplete) {
                self.onComplete();
                self.onComplete = null;
            }
    }
    }, pause);
    }
    }, this.baseSpeed);
    if (!this._visibilityHandler) {
        this._visibilityHandler = function() {
            if (document.hidden && self.isTyping) {
                self.pause();
            } else if (!document.hidden && !self.isTyping && self._queueIdx < self.queue.length) {

                // 旧代码只 pause 不 resume，切回标签页后打字机永久停滞
                self.start();
            }
            };
        GlobalCleanup.registerListener(document, 'visibilitychange', this._visibilityHandler);
    }
    },
    pause() {
        this.isTyping = false;
        TimerManager.clearInterval('typewriter');
    },
    stop() {
        if (this._pauseTimer) { TimerManager.clearTimeout('typewriterPause'); this._pauseTimer = null; }
        this.pause();
        this.queue = '';
        this._queueIdx = 0;
        this.displayed = '';
        this._lastRendered = '';
        this._lastCleanedPara = '';
        this.onComplete = null;
        this._cachedCompletedHtml = '';
        this._cachedCompletedKey = '';
        this._cachedParaCount = 0;       // 【P0冻结修复】重置段落数计数器
        this._lastCompletedCount = 0;    // 【P0冻结修复】重置脏检查缓存
        this._lastCurrentLen = 0;        // 【P0冻结修复】重置脏检查缓存
        this._currentParaEl = null;
        this._currentParaTextEl = null;
        this._cursorEl = null;
        this._lastCurrentPara = '';
        this._mergedParaDirty = false;  // 【段落碎片化治理】重置合并标记
        // 【BUG-028 修复】stop 时关闭流式模式，确保后续非流式渲染（如加载存档）走 formatStory 全量路径
        this._streamingMode = false;

        // stop() 会在 catch 块、renderStory 等多处被调用，统一在此清理覆盖所有路径
        try { this.cleanCursor(); } catch (e) { /* ignore */ }
    },
    // 添加销毁方法，移除事件监听器防止内存泄漏
    destroy() {
        this.stop();
        if (this._visibilityHandler) {
            // 使用 GlobalCleanup 的记录来移除，确保与注册方式一致
            document.removeEventListener('visibilitychange', this._visibilityHandler);
            this._visibilityHandler = null;
        }
    },
    flush() {
        // 确保 queue 和 displayed 已初始化
        if (typeof this.queue !== 'string') this.queue = '';
        if (typeof this.displayed !== 'string') this.displayed = '';

        this.displayed += this._queueIdx >= this.queue.length ? '' : this.queue.substring(this._queueIdx);
        this.queue = '';
        this._queueIdx = 0;
        this.pause();
        this.render();
        if (this.onComplete) {
            this.onComplete();
            this.onComplete = null;
        }
    },
    // 【用户需求】明确的「跳过」方法（与 flush 行为一致，但语义清晰）
    skip() {
        if (!this.isTyping && this._queueIdx >= this.queue.length) return false;
        this.flush();
        return true;
    },
    isFinished() {
        // 确保 queue 已初始化
        if (typeof this.queue !== 'string') this.queue = '';
        return this._queueIdx >= this.queue.length && !this.isTyping;
    },
    render() {
        var storyEl = DOMCache.get('storyText', true);
        if (!storyEl) return;

        // 【P0 冻结修复】用轻量脏检查替代 join('\n') 全量字符串构建
        // 原实现：每 25ms tick 都 join('\n') 所有段落 → O(N) per tick
        //   5000字故事 × 40tick/s = 200,000 ops/s 纯浪费
        // 新实现：用段落数 + 当前段落长度做 O(1) 脏检查
        var _completedCount = this._completedParagraphs.length;
        var _currentLen = this._currentParaChars.length;
        if (_completedCount === this._lastCompletedCount &&
            _currentLen === this._lastCurrentLen) return;
        this._lastCompletedCount = _completedCount;
        this._lastCurrentLen = _currentLen;

        // 【P0 冻结修复】增量追加段落替代全量 innerHTML 重建
        // 原实现：每次新段落完成 → split('\n') + escapeHtml(ALL) + innerHTML = ALL
        //   P 段累计：P × O(N) = O(P×N)，P=50 N=5000 时 = 250,000 ops + 50次 innerHTML
        // 新实现：只 appendChild 新段落的 <p> 元素，O(L) per new paragraph
        if (_completedCount < this._cachedParaCount) {
            // 段落被重置（如 push 长文本路径、stop 后重新开始）：清空容器
            storyEl.innerHTML = '';
            this._cachedParaCount = 0;
            this._currentParaEl = null;
            this._currentParaTextEl = null;
            this._cursorEl = null;
            this._lastCleanedPara = '';
        }
        if (_completedCount > this._cachedParaCount) {
            var _newCount = _completedCount - this._cachedParaCount;
            // 【BUG-028 修复】流式模式（_streamingMode）下始终用增量 appendChild 路径，
            // 即使打字机 catch up（isTyping=false）也不调用 formatStory 全量格式化。
            // 仅在非流式场景（加载存档、直接渲染）才走 formatStory + innerHTML 全量路径。
            if (this.isTyping || this._streamingMode) {
                // 打字流程中 / 流式模式：增量追加新段落
                if (this._cachedParaCount === 0) {
                    // 首次渲染：清空容器
                    storyEl.innerHTML = '';
                }
                // 【BUG-029 修复】段落从"当前打字中"变为"已完成"时，
                // 旧的 story-typing-para 元素仍残留在 DOM 中，与新增的
                // story-completed-para 形成文本重复。此处移除旧元素。
                if (this._currentParaEl && this._currentParaEl.parentNode === storyEl) {
                    this._currentParaEl.remove();
                }
                for (var _ni = 0; _ni < _newCount; _ni++) {
                    var _paraIdx = this._cachedParaCount + _ni;
                    var _paraText = this._completedParagraphs[_paraIdx];
                    if (_paraText) {
                        var _p = document.createElement('p');
                        _p.className = 'story-completed-para';
                        _p.textContent = _paraText;  // textContent 自动转义，比 escapeHtml + innerHTML 快
                        storyEl.appendChild(_p);
                    }
                }
                this._cachedParaCount = _completedCount;
            } else {
                // 非打字流程（如加载存档、直接渲染）：完整格式化
                var _fullKey = this._completedParagraphs.join('\n');
                this._cachedCompletedHtml = (_fullKey && typeof RuntimeBridge !== 'undefined' && RuntimeBridge.formatStory) ? RuntimeBridge.formatStory(_fullKey) : '';
                storyEl.innerHTML = this._cachedCompletedHtml;
                this._cachedParaCount = _completedCount;
            }
            this._currentParaEl = null;  // 强制重建当前段落元素
            this._currentParaTextEl = null;
            this._cursorEl = null;
            // 【打字机重复修复】段落切换时必须清空 _lastCleanedPara 缓存
            this._lastCleanedPara = '';
        }

        // 当前段落：增量更新（极快）
        // 【段落碎片化治理】合并后更新最后一个已完成段落的 DOM 文本
        if (this._mergedParaDirty && _completedCount > 0) {
            var _children = storyEl.children;
            for (var _ci = _children.length - 1; _ci >= 0; _ci--) {
                if (_children[_ci].classList && _children[_ci].classList.contains('story-completed-para')) {
                    _children[_ci].textContent = this._completedParagraphs[_completedCount - 1];
                    break;
                }
            }
            // 清理残留的 story-typing-para 元素（合并时不会走 append 路径，需要手动清理）
            var _typingParas = storyEl.querySelectorAll('.story-typing-para');
            for (var _ti = 0; _ti < _typingParas.length; _ti++) {
                _typingParas[_ti].remove();
            }
            this._currentParaEl = null;
            this._currentParaTextEl = null;
            this._cursorEl = null;
            this._mergedParaDirty = false;
        }
        if (this._currentParaChars) {
            // 【性能修复】打字机 tick 期间对每 tick 增长的文本跑 _cleanUnrecognizedTags 正则链，
            // 2000 字时每 50ms 一次 O(n) 扫描累计成主线程阻塞。
            // 改为节流：仅当段落长度变化超过阈值或遇到潜在标签起点（'<'）时才清理，
            // 其余 tick 直接复用上一次清理结果。
            // 【P0 冻结修复】当总段落数 >50 时，完全跳过流式期间的标签清理（最终渲染时 formatStory 会做）
            var currentText = this._currentParaChars;
            var _totalParas = this._completedParagraphs ? this._completedParagraphs.length : 0;
            if (_totalParas <= 50) {
                var _needsClean = !this._lastCleanedPara ||
                    currentText.length - this._lastCleanedPara.length >= 16 ||
                    (currentText.charAt(currentText.length - 1) === '<');
                if (_needsClean) {
                    if (typeof RuntimeBridge !== 'undefined' && RuntimeBridge._cleanUnrecognizedTags) {
                        currentText = RuntimeBridge._cleanUnrecognizedTags(currentText);
                    } else if (typeof RuntimeBridge !== 'undefined' && RuntimeBridge._reDecorTagsTyping) {
                        RuntimeBridge._reDecorTagsTyping.lastIndex = 0;
                        currentText = currentText.replace(RuntimeBridge._reDecorTagsTyping, '');
                    }
                    this._lastCleanedPara = currentText;
                } else {
                    currentText = this._lastCleanedPara || currentText;
                }
            }
            if (!this._currentParaEl || this._currentParaEl.parentNode !== storyEl) {
                // 创建新段落元素，复用同一节点直到本段结束
                this._currentParaEl = document.createElement('p');
                this._currentParaEl.className = 'story-typing-para';
                storyEl.appendChild(this._currentParaEl);
                // 【P0 性能修复】预创建文本节点和光标元素，后续 tick 只更新 nodeValue
                // 原实现：每 tick 都 escapeHtml(currentText) + innerHTML = → HTML 解析 + 布局重排
                // 新实现：textContent via nodeValue → O(1) 文本节点更新，零布局重排
                this._currentParaTextEl = document.createTextNode('');
                this._currentParaEl.appendChild(this._currentParaTextEl);
                this._cursorEl = null;  // 光标元素延迟创建
            }

            // 【P0 性能修复】用 textContent (nodeValue) 替代 innerHTML + escapeHtml
            // escapeHtml 做 6 次正则替换 O(n)，innerHTML 触发 HTML 解析器 + 布局
            // textContent 只更新文本节点的 nodeValue，浏览器只做最小量文本变更
            if (this._currentParaTextEl.nodeValue !== currentText) {
                this._currentParaTextEl.nodeValue = currentText;
            }

            // 光标管理：独立元素，避免每 tick 重建 HTML
            var _needCursor = (this.isTyping || this._queueIdx < this.queue.length);
            if (_needCursor) {
                if (!this._cursorEl) {
                    this._cursorEl = document.createElement('span');
                    this._cursorEl.className = 'typing-cursor';
                    this._cursorEl.textContent = '▌';
                }
                if (this._cursorEl.parentNode !== this._currentParaEl) {
                    this._currentParaEl.appendChild(this._cursorEl);
                }
            } else if (this._cursorEl && this._cursorEl.parentNode) {
                this._cursorEl.parentNode.removeChild(this._cursorEl);
            }
        } else if (this._currentParaEl) {
            // 当前段落清空：清掉元素引用，下一次会创建新的
            this._currentParaEl = null;
            this._currentParaTextEl = null;
            this._cursorEl = null;
        }

        // 【P0 性能优化】自动滚动到底部（节流到每 200ms 一次，避免每 tick 触发 layout）
        if (this.isTyping || this._queueIdx < this.queue.length) {
            if (!this._scrollRafPending) {
                this._scrollRafPending = true;
                var _self = this;
                TimerManager.setTimeout('twAutoScroll', function() {
                    _self._scrollRafPending = false;
                    var _el = DOMCache.get('storyText', true);
                    if (_el) {
                        // 只在用户已滚动到底部附近时才自动滚动（避免打断用户回看）
                        var _nearBottom = _el.scrollHeight - _el.scrollTop - _el.clientHeight < 120;
                        if (_nearBottom) _el.scrollTop = _el.scrollHeight;
                    }
                }, 200);
            }
        }

        if (!this.isTyping && this._queueIdx >= this.queue.length) {
            this.cleanCursor();
        }
    },
    // 【段落碎片化治理】入队时合并过短段落
    // AI 输出常含大量短行（如"清晨\n的薄雾\n还未散尽"），逐行入队会导致
    // 280 段落仅 2500 字（平均 9 字/段），DOM 节点过多拖慢渲染。
    // 阈值 20 字：短于此值的段落合并到前一段，用空格连接。
    _MIN_PARA_LEN: 20,
    _pushCompletedPara(text) {
        if (!text || text.length === 0) return;
        var _trimmed = text.replace(/^\s+|\s+$/g, '');
        if (_trimmed.length > 0 && _trimmed.length < this._MIN_PARA_LEN && this._completedParagraphs.length > 0) {
            // 合并到前一段：直接拼接（中文文本不需要空格分隔）
            var _prev = this._completedParagraphs[this._completedParagraphs.length - 1];
            this._completedParagraphs[this._completedParagraphs.length - 1] = _prev + text;
            this._mergedParaDirty = true;  // 标记：需要更新最后一个已完成段落的 DOM
        } else {
            this._completedParagraphs.push(text);
        }
    },
    _renderCached() {
        // 渲染已完成的段落
        this.render();
    },
    _renderCurrentPara() {
        // 渲染当前段落
        // P2-1: 添加 _lastCurrentPara 脏检查，避免 _currentParaChars 未变化时仍调用 render()
        if (this._currentParaChars === this._lastCurrentPara) return;
        this._lastCurrentPara = this._currentParaChars;
        // 【P0 性能修复】当已完成段落超过 30 个时，启用 80ms 渲染节流
        // 避免大量 DOM 元素时每 25ms 一次 render() 累积导致主线程冻结
        var _paraCount = this._completedParagraphs ? this._completedParagraphs.length : 0;
        if (_paraCount > 30) {
            if (this._renderThrottleTimer) return;
            var _self = this;
            this._renderThrottleTimer = TimerManager.setTimeout('twRenderThrottle', function() {
                _self._renderThrottleTimer = null;
                _self.render();
            }, 80);
        } else {
            this.render();
        }
    },


    // 还会兜底移除 storyText 末尾残留的 ▌ 字符（防止 cursor 被序列化进文本后无法用 DOM 选择器移除）
    cleanCursor() {
        if (typeof document === 'undefined') return;
        var storyEl = DOMCache.get('storyText', true);
        if (!storyEl) return;
        // 1. 移除所有 .typing-cursor span 元素
        var cursors = storyEl.querySelectorAll('.typing-cursor');
        for (let i = 0; i < cursors.length; i++) {
            cursors[i].remove();
        }
        // 2. 兜底：移除末尾残留的 ▌ 字符（防止被 escapeHtml 序列化后无法用 DOM 选择器移除）
        // 只清理末尾的，不影响正文中的合法 ▌（极少见，但保险起见）
        if (storyEl.textContent && storyEl.textContent.charAt(storyEl.textContent.length - 1) === '▌') {
            // 遍历末尾文本节点清理
            var walker = document.createTreeWalker(storyEl, NodeFilter.SHOW_TEXT, null, false);
            var lastTextNode = null;
            var node;
            while ((node = walker.nextNode())) {
                if (node.nodeValue && node.nodeValue.length > 0) lastTextNode = node;
            }
            if (lastTextNode && lastTextNode.nodeValue.charAt(lastTextNode.nodeValue.length - 1) === '▌') {
                lastTextNode.nodeValue = lastTextNode.nodeValue.slice(0, -1);
            }
        }
    }
};

// 【P0 冻结诊断】性能日志缓冲区，写入 localStorage 以便冻结后恢复查看
window._perfLog = window._perfLog || [];
window._logPerf = function(op, ms, extra) {
    var entry = { t: Date.now(), op: op, ms: Math.round(ms), extra: extra || '' };
    window._perfLog.push(entry);
    // 只保留最近 100 条
    if (window._perfLog.length > 100) window._perfLog.shift();
    // 【P1-2】移除 localStorage 写入：性能日志不应占用 localStorage 空间
    // 慢操作仅记录在内存缓冲区中，可通过 console 查看
    if (ms > 100) {
        console.warn('[perf] 慢操作:', op, ms + 'ms', extra || '');
    }
};

// 原顶层 const/let 声明已删除，全部通过 RuntimeState 单例承载。
// 上方 window 兼容别名（defineProperty）转发到 RuntimeState，旧调用点无需改动。

// ========================================
// 打字机「跳过」按钮管理（用户需求：长按快进、点击屏幕一律不要，只保留按钮）
// 历史：早期在右下角浮动一个 typewriterSkipBtn，现已迁移到 #genControl 状态栏
// 内的 #genSkipBtn（紧挨取消按钮），这里只保留显示/隐藏同步逻辑。
// ========================================
function _showSkipButton() {
    if (typeof document === 'undefined') return;
    // 【状态栏跳过按钮】紧挨 #genCancelBtn，显示在「正在生成」状态栏里
    var _barSkipBtn = document.getElementById('genSkipBtn');
    if (_barSkipBtn) _barSkipBtn.style.display = '';
}
function _hideSkipButton() {
    if (typeof document === 'undefined') return;
    // 同步隐藏 #genControl 里的「跳过」按钮
    var _barSkipBtn = document.getElementById('genSkipBtn');
    if (_barSkipBtn) _barSkipBtn.style.display = 'none';
}

// ========================================
// Token 计数 + 自动压缩
// ========================================
// ========================================
// NPC编辑 & 手动添加
// ========================================
// （P1修复BUG-5.8）npcEditingName 已迁至 RuntimeState.npcEditingName
// 空=新增模式，有值=编辑模式
// --- 打字机光标颜色适配 ---

// ========================================
// 第1层: 工具函数
// ========================================
// ========================================
// 游戏内时间系统（AI动态生成）
// ========================================
var GameTimeSystem = {
    // 共享工具：将"HH:MM"转换为分钟数
    _timeToMinutes(t) {
        if (!t || typeof t !== 'string') return -1;
        var m = t.match(/(\d{1,2})[:：](\d{2})/);
        if (!m) return -1;
        var h = parseInt(m[1], 10);
        var min = parseInt(m[2], 10);
        if (h > 23 || min > 59) return -1;
        return h * 60 + min;
    },

    // 共享工具：从日期字符串中提取天数数字（支持"第N天""第N日"）
    _parseDayNum(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return 0;
        var m = dateStr.match(/第\s*(\d+)\s*[天日]/);
        return m ? parseInt(m[1], 10) : 0;
    },

    // 共享工具：根据小时数推算时段
    _periodFromHour(hour) {
        if (hour >= 5 && hour < 8) return '清晨';
        if (hour >= 8 && hour < 11) return '上午';
        if (hour >= 11 && hour < 13) return '中午';
        if (hour >= 13 && hour < 17) return '下午';
        if (hour >= 17 && hour < 19) return '傍晚';
        if (hour >= 19 && hour < 23) return '晚上';
        return '深夜'; // 23-5
    },

    // 共享工具：将中文数字转换为整数（支持一到九十九）
    _chineseNumToInt(str) {
        if (!str) return 0;
        var digits = { '零':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9 };
        var m = str.match(/([一二两三四五六七八九十]+)/);
        if (!m) return 0;
        var s = m[1];
        if (s === '十') return 10;
        if (s.indexOf('十') !== -1) {
            var parts = s.split('十');
            var tens = parts[0] ? (digits[parts[0]] || 1) : 1;
            var ones = parts[1] ? (digits[parts[1]] || 0) : 0;
            return tens * 10 + ones;
        }
        return digits[s] || 0;
    },

    // 从剧情文本中智能提取时间信息作为兜底
    _extractTimeFromStory(story) {
        if (!story || typeof story !== 'string') return null;
        var result = {};
        // 提取日期：第N天/第N日 / xxxx年xx月xx日 / xx-xx-xx / xx/xx/xx
        var dateMatch1 = story.match(/第\s*(\d+)\s*[天日]/);
        if (dateMatch1) result.date = '第' + dateMatch1[1] + '天';
        if (!result.date) {
            var dateMatch2 = story.match(/(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}日?)/);
            if (dateMatch2) result.date = dateMatch2[1];
        }
        // 提取时间：xx:xx
        var timeMatch = story.match(/(\d{1,2}[:：]\d{2})/);
        if (timeMatch) result.time = timeMatch[1].replace('：', ':');
        // 提取时段
        var periodKeywords = {
            '凌晨': '凌晨', '清晨': '清晨', '黎明': '清晨', '拂晓': '清晨',
            '早晨': '早晨', '早上': '早上',
            '上午': '上午',
            '正午': '中午', '中午': '中午', '午时': '中午',
            '午后': '下午', '下午': '下午',
            '傍晚': '傍晚', '黄昏': '傍晚',
            '夜晚': '晚上', '夜间': '晚上', '入夜': '晚上', '夜幕': '晚上', '晚上': '晚上',
            '深夜': '深夜', '午夜': '深夜', '子夜': '深夜'
        };
        for (let kw in periodKeywords) {
            if (story.indexOf(kw) !== -1) {
                result.period = periodKeywords[kw];
                break;
            }
        }
        return (result.date || result.time || result.period) ? result : null;
    },

    // 从AI回复的JSON中解析时间字段并更新gameTime

    // TimeMutator.setTime（同一份数据写入两次），且直接修改 gameState.gameTime 绕过 _syncLegacyMirror。
    // 现统一由本方法解析时间（data.gameTime → story 兜底 → 默认时间），调用 setTime 仅一次，
    // _syncLegacyMirror 自动将 StateManager.time 镜像到 gameState.gameTime，无需手动赋值。
    parseFromAI(data) {
        if (!gameState) return;
        // 从权威源 StateManager.time 读取当前时间（_syncLegacyMirror 保证与 gameState.gameTime 一致）
        var current = (typeof StateManager !== 'undefined' && StateManager.get)
            ? (StateManager.get('time') || {})
            : (gameState.gameTime || {});
        // 记录初始时间，用于后续检测剧情回退
        if (!gameState._initialGameTime && (current.time || current.period || current.date)) {
            gameState._initialGameTime = StateSchema.deepClone(current);
        }
        // 解析目标时间：以当前时间为基底，叠加 AI 返回的字段
        var resolved = {
            date: current.date || '',
            time: current.time || '',
            period: current.period || '',
            weather: current.weather || '',
            era: current.era || ''
        };
        // AI在JSON中返回 gameTime 字段
        if (data && data.gameTime) {
            if (data.gameTime.date) resolved.date = data.gameTime.date;
            if (data.gameTime.time) resolved.time = data.gameTime.time;
            if (data.gameTime.period) resolved.period = data.gameTime.period;
            if (data.gameTime.weather) resolved.weather = data.gameTime.weather;
            if (data.gameTime.era) resolved.era = data.gameTime.era;
        }
        // 兜底：AI 未返回 gameTime 字段时，从 story 中提取时间信息
        // 【P2-3 修复】原条件 (!resolved.date && !resolved.time && !resolved.period) 永远为 false，
        // 因为 resolved.period 从上一回合 current.period 初始化，永远非空，
        // 导致 story 兜底永远不会触发，时间卡在初始值不更新。
        // 修正为：AI 未显式返回 gameTime 字段时即走 story 兜底，让"第二天清晨"等剧情时间能被提取。
        var _aiReturnedGameTime = !!(data && data.gameTime);
        if (!_aiReturnedGameTime && data && data.story) {
            var extracted = this._extractTimeFromStory(data.story);
            if (extracted) {
                if (extracted.date) resolved.date = extracted.date;
                if (extracted.time) resolved.time = extracted.time;
                if (extracted.period) resolved.period = extracted.period;
            }
        }

        // 最终兜底：游戏开局给一个默认时间，避免UI显示"--"
        if (!resolved.date && !resolved.time && !resolved.period) {
            resolved.date = '游戏开始';
            resolved.period = '初始时刻';
        }

        // 【时间变奏修复】检测AI返回的时间是否合理推进
        // 问题：AI经常只推进几分钟，导致大量剧情压缩在一天内
        // 策略：从story中提取时间跳转关键词，如果检测到大幅时间跳跃但gameTime未反映，则修正
        var _timeCorrected = false;
        if (data && data.story) {
            var _corrected = this._enforceTimeProgression(resolved, current, data.story);
            if (_corrected) {
                resolved = _corrected;
                _timeCorrected = true;
            }
        }

        // 【状态层同步】单一写入点：通过 TimeMutator.setTime 写入 StateManager.time
        // _syncLegacyMirror 自动同步到 gameState.gameTime（无需手动赋值）
        // 如果我们的时间修正已应用（_timeCorrected），跳过TimeMutator的单调性检查，
        // 因为_enforceTimeProgression内部已做了安全检查（包括午夜跨越处理）
        if (typeof TimeMutator !== 'undefined' && TimeMutator.setTime) {
            var _setOpts = { silent: true };
            if (_timeCorrected) _setOpts.skipMonotonicCheck = true;
            TimeMutator.setTime(resolved, _setOpts);
        } else if (typeof StateManager !== 'undefined' && StateManager.set) {
            StateManager.set('time', resolved, { silent: true });
        } else {
            throw new Error('[GameTimeSystem.parseFromAI] TimeMutator/StateManager 未加载，无法写入时间');
        }
    },

    // 【时间变奏修复】从story中检测时间跳转关键词，修正gameTime
    // 当AI在剧情中写了"第二天""三天后""数月后"等，但gameTime未正确反映时，强制修正
    _enforceTimeProgression(resolved, current, story) {
        if (!story || typeof story !== 'string') return null;
        var changed = false;
        var result = {
            date: resolved.date || '',
            time: resolved.time || '',
            period: resolved.period || '',
            weather: resolved.weather || '',
            era: resolved.era || ''
        };

        var _currentDayNum = this._parseDayNum(current.date);
        var _resolvedDayNum = this._parseDayNum(resolved.date);

        // 检测"次日/第二天/翌日"等关键词
        // 【修复】仅在AI未正确推进日期时才修正（避免覆盖AI已正确设置的时间）
        if (/第\s*[二2]\s*[天日]|翌日|次日|第二天/.test(story)) {
            var _expectedNextDay = _currentDayNum + 1;
            // 如果AI返回的日期已经是_nextDay或更后，说明AI已正确推进，不覆盖
            if (_currentDayNum > 0 && _resolvedDayNum < _expectedNextDay) {
                result.date = '第' + _expectedNextDay + '天';
                result.time = '07:00';
                result.period = '清晨';
                changed = true;
            }
        }
        // 检测"N天后/N日后"（支持阿拉伯数字和中文数字：三天后、五日后等）
        var _daysLaterMatch = story.match(/(\d+|[一二两三四五六七八九十]+)\s*[天日]\s*[后之]/);
        if (_daysLaterMatch) {
            var _addDays = /^\d+$/.test(_daysLaterMatch[1])
                ? parseInt(_daysLaterMatch[1], 10)
                : this._chineseNumToInt(_daysLaterMatch[1]);
            var _expectedDay = _currentDayNum + _addDays;
            // 仅在AI未正确推进到_expectedDay时才修正
            if (_addDays >= 2 && _currentDayNum > 0 && _resolvedDayNum < _expectedDay) {
                result.date = '第' + _expectedDay + '天';
                result.time = '08:00';
                result.period = '上午';
                changed = true;
            }
        }
        // 检测"数天后/几天后/数日后"
        if (/数\s*[天日]\s*[后之]|几\s*[天日]\s*[后之]/.test(story)) {
            var _expectedDay3 = _currentDayNum + 3; // 默认3天
            if (_currentDayNum > 0 && _resolvedDayNum < _expectedDay3) {
                var _newDay3 = _currentDayNum + 3; // 默认3天
                result.date = '第' + _newDay3 + '天';
                result.time = '09:00';
                result.period = '上午';
                changed = true;
            }
        }
        // 检测"一周后/数周后/半月后/数月后"
        if (/一\s*周\s*[后之]|数\s*周\s*[后之]/.test(story)) {
            var _expectedWeekDay = _currentDayNum + 7;
            if (_currentDayNum > 0 && _resolvedDayNum < _expectedWeekDay) {
                result.date = '第' + _expectedWeekDay + '天';
                result.time = '08:00';
                result.period = '上午';
                changed = true;
            }
        }
        if (/半\s*月\s*[后之]|数\s*月\s*[后之]|个\s*月\s*[后之]/.test(story)) {
            var _expectedMonthDay = _currentDayNum + 30;
            if (_currentDayNum > 0 && _resolvedDayNum < _expectedMonthDay) {
                result.date = '第' + _expectedMonthDay + '天';
                result.time = '08:00';
                result.period = '上午';
                changed = true;
            }
        }

        // 【改进】时段检测：找到story中最后提到的时段（代表剧情结束时的时段）
        // 原实现只匹配数组中第一个关键词，会误判（如"上午去了图书馆，下午回来"会匹配到"上午"）
        var _periodKeywords = [
            { kw: /清晨|黎明|拂晓/, period: '清晨', time: '06:00', order: 1 },
            { kw: /上午/, period: '上午', time: '10:00', order: 2 },
            { kw: /正午|中午|午时/, period: '中午', time: '12:00', order: 3 },
            { kw: /下午|午后/, period: '下午', time: '14:00', order: 4 },
            { kw: /傍晚|黄昏|夕阳/, period: '傍晚', time: '17:00', order: 5 },
            { kw: /夜晚|入夜|夜幕|晚上/, period: '晚上', time: '20:00', order: 6 },
            { kw: /深夜|午夜|子夜/, period: '深夜', time: '23:00', order: 7 }
        ];
        if (changed) {
            // 时间已被日期跳转修正，不需要再检测时段
        } else {
            // 找到story中最后出现的时段关键词（位置最靠后的匹配）
            var _lastPeriodMatch = null;
            var _lastPeriodPos = -1;
            for (var i = 0; i < _periodKeywords.length; i++) {
                var _pk = _periodKeywords[i];
                var _match = story.match(_pk.kw);
                if (_match) {
                    var _pos = story.lastIndexOf(_match[0]);
                    if (_pos > _lastPeriodPos) {
                        _lastPeriodPos = _pos;
                        _lastPeriodMatch = _pk;
                    }
                }
            }
            if (_lastPeriodMatch && resolved.period && resolved.period !== _lastPeriodMatch.period) {
                // story最后的时段与AI返回的period不一致，以story为准
                var _curPeriodOrder = 0;
                var _newPeriodOrder = _lastPeriodMatch.order;
                for (var j = 0; j < _periodKeywords.length; j++) {
                    if (_periodKeywords[j].period === current.period) _curPeriodOrder = _periodKeywords[j].order;
                }
                result.period = _lastPeriodMatch.period;
                if (!resolved.time || resolved.time === current.time) {
                    result.time = _lastPeriodMatch.time;
                }
                // 【关键修复】如果新时段比当前时段更早（如从"晚上"回到"清晨"），
                // 说明跨越了午夜，需要推进日期
                if (_newPeriodOrder < _curPeriodOrder && _currentDayNum > 0) {
                    var _newDayNum = _currentDayNum + 1;
                    result.date = '第' + _newDayNum + '天';
                    console.log('[TimeProgress] 时段回退检测: ' + current.period + '→' +
                        _lastPeriodMatch.period + '，推进到第' + _newDayNum + '天');
                }
                changed = true;
            }
        }

        // 检测"过夜/睡觉/入睡"等，推进到次日清晨
        if (/入睡|睡觉|过夜|就寝|安歇|回到.*睡|躺在床上.*睡/.test(story)) {
            var _expectedSleepDay = _currentDayNum + 1;
            // 仅在AI未正确推进到次日时才修正
            if (_currentDayNum > 0 && !changed && _resolvedDayNum < _expectedSleepDay) {
                result.date = '第' + _expectedSleepDay + '天';
                result.time = '07:00';
                result.period = '清晨';
                changed = true;
            }
        }

        // 【活动密度检测】如果上面的关键词检测未触发修正，
        // 但故事描述了大量活动而AI只推进了几分钟，则根据活动类型强制推进时间
        if (!changed) {
            var _activityFix = this._enforceActivityBasedTime(result, current, story);
            if (_activityFix) {
                result = _activityFix;
                changed = true;
            }
        }

        // 【最终安全检查】确保修正后的时间不会早于当前时间
        // 防止午夜跨越、时段修正等导致时间在同一天内倒退（TimeMutator会拒绝倒退的时间）
        if (changed) {
            var _finalResDayNum = this._parseDayNum(result.date);
            if (_finalResDayNum === _currentDayNum && _currentDayNum > 0) {
                // 同一天，检查时间是否倒退
                var _curTimeMin = this._timeToMinutes(current.time);
                var _resTimeMin = this._timeToMinutes(result.time);
                if (_curTimeMin >= 0 && _resTimeMin >= 0 && _resTimeMin < _curTimeMin) {
                    // 同一天内时间倒退了 → 跨越了午夜，推进到次日
                    var _safetyDayNum = _currentDayNum + 1;
                    result.date = '第' + _safetyDayNum + '天';
                    console.log('[TimeProgress] 安全检查: 同日时间倒退(' +
                        current.time + '→' + result.time + ')，自动推进到第' + _safetyDayNum + '天');
                }
            }
        }

        if (changed) {
            console.log('[TimeProgress] 时间推进修正: ' + JSON.stringify(current) + ' → ' + JSON.stringify(result));
            return result;
        }
        return null;
    },

    // 【题材无关的活动密度检测】根据故事结构信号推断合理的时间推进
    // 解决问题：AI写了很长的剧情（去了多个地方、做了多件事），但gameTime只推进几分钟
    // 设计理念：不依赖任何题材专属关键词，通过故事长度/场景转换/时间流逝词/动作密度判断
    // 午夜跨越：时间超过24:00时自动推进日期
    _enforceActivityBasedTime(resolved, current, story) {
        if (!story || typeof story !== 'string') return null;
        if (!resolved.time || !current.time) return null;
        if (resolved.date !== current.date) return null;

        var _curMin = this._timeToMinutes(current.time);
        var _resMin = this._timeToMinutes(resolved.time);
        if (_curMin < 0 || _resMin < 0) return null;
        var _diffMin = _resMin - _curMin;
        if (_diffMin < 0) return null; // 时间倒退，不处理

        // ================================================
        // 【题材无关的活动密度检测】
        // 不依赖任何题材专属关键词（如"修炼""锻造""星际航行"等）
        // 而是通过以下结构信号判断故事中是否包含大量耗时活动：
        //   1. 故事长度——越长说明描述了越多活动
        //   2. 场景转换——去了多个地方说明花了时间移动
        //   3. 时间流逝暗示词——语言层面的通用时间表达（非题材专属）
        //   4. 动作密度——句号/段落数量反映活动量
        // ================================================

        var _activityScore = 0;
        var _reason = [];

        // --- 信号1：故事长度 ---
        if (story.length > 2000) { _activityScore += 40; _reason.push('长篇剧情(' + story.length + '字)'); }
        else if (story.length > 1000) { _activityScore += 20; _reason.push('中等剧情(' + story.length + '字)'); }
        else if (story.length > 500) { _activityScore += 10; _reason.push('较短剧情(' + story.length + '字)'); }

        // --- 信号2：场景转换（题材无关——任何故事都有"去了某处"的描写） ---
        // 去掉对话内容后再匹配，避免对话中的场景词干扰
        var _storyNoDialogue = story
            .replace(/\u201C[^\u201D]*\u201D/g, '')   // 中文双引号 "..."
            .replace(/\u2018[^\u2019]*\u2019/g, '')   // 中文单引号 '...'
            .replace(/"[^"]*"/g, '')                   // 英文双引号
            .replace(/'[^']*'/g, '');                  // 英文单引号

        var _sceneChanges = (_storyNoDialogue.match(/来到了|走到了|走进了|回到了|赶到了|推开了|踏入了|前往|赶到|来到|到达|穿过|出发|返回|进入|离开/g) || []).length;
        if (_sceneChanges >= 4) { _activityScore += 50; _reason.push('多场景转换(' + _sceneChanges + '次)'); }
        else if (_sceneChanges >= 3) { _activityScore += 35; _reason.push('频繁场景转换(' + _sceneChanges + '次)'); }
        else if (_sceneChanges >= 2) { _activityScore += 20; _reason.push('场景转换(' + _sceneChanges + '次)'); }

        // --- 信号3：时间流逝暗示词（语言层面通用，非题材专属） ---
        // 这些是中文叙事中表达"过了很长时间"的通用写法，适用于任何题材
        var _timeFlowPatterns = [
            { kw: /不知不觉|不经意间|转眼|片刻后|不久后/, score: 15, label: '时间流逝叙述' },
            { kw: /很久|许久|良久|好一阵|好半天|大半天/, score: 30, label: '长时间叙述' },
            { kw: /数日|数周|数月|数年|半个月|几个月|半年/, score: 60, label: '多日时间叙述' },
            { kw: /一整天|一上午|一下午|一晚上|彻夜|通宵/, score: 45, label: '全天时间叙述' },
            { kw: /直到|等到|待到|终于/, score: 20, label: '等待叙述' }
        ];
        for (var i = 0; i < _timeFlowPatterns.length; i++) {
            if (_timeFlowPatterns[i].kw.test(_storyNoDialogue)) {
                _activityScore += _timeFlowPatterns[i].score;
                _reason.push(_timeFlowPatterns[i].label);
            }
        }

        // --- 信号4：动作密度（句号数量反映活动量，题材无关） ---
        var _sentenceCount = (_storyNoDialogue.match(/[。！？\n]/g) || []).length;
        if (_sentenceCount >= 30) { _activityScore += 30; _reason.push('高密度叙事(' + _sentenceCount + '句)'); }
        else if (_sentenceCount >= 20) { _activityScore += 20; _reason.push('中密度叙事(' + _sentenceCount + '句)'); }
        else if (_sentenceCount >= 10) { _activityScore += 10; _reason.push('一般叙事(' + _sentenceCount + '句)'); }

        // 活动量不大，不干预
        if (_activityScore < 30) return null;

        // 根据活动分数确定最小时间推进阈值
        var _minRequiredMin;
        if (_activityScore >= 80) _minRequiredMin = 120;      // 高活动量至少2小时
        else if (_activityScore >= 60) _minRequiredMin = 90;   // 中高活动量至少1.5小时
        else if (_activityScore >= 40) _minRequiredMin = 60;   // 中等活动量至少1小时
        else _minRequiredMin = 30;

        // 如果AI已经推进了足够的时间，不干预
        if (_diffMin >= _minRequiredMin) return null;

        // 根据活动分数推算合理的时间推进（分钟）
        // 上限8小时（480分钟），避免单次推进过多
        var _suggestedMin = Math.min(_activityScore, 480);
        var _newMin = _curMin + _suggestedMin;

        // 处理午夜跨越：如果时间超过24:00，自动推进日期
        var _dayAdvance = Math.floor(_newMin / 1440);
        var _newHour = Math.floor((_newMin % 1440) / 60);
        var _newMinute = _newMin % 60;
        var _newTime = String(_newHour).padStart(2, '0') + ':' + String(_newMinute).padStart(2, '0');

        // 推算时段
        var _newPeriod = this._periodFromHour(_newHour);

        // 如果跨天，推进日期
        var _newDate = resolved.date;
        if (_dayAdvance > 0) {
            var _curDayNum = this._parseDayNum(resolved.date);
            if (_curDayNum > 0) {
                _newDate = '第' + (_curDayNum + _dayAdvance) + '天';
                _reason.push('跨天+' + _dayAdvance + '日');
            }
        }

        console.log('[TimeProgress] 活动密度检测(题材无关): AI仅推进' + _diffMin + '分钟（阈值' + _minRequiredMin +
            '分钟），但检测到信号[' + _reason.join(', ') + ']，活动分数=' + _activityScore +
            '，建议推进' + _suggestedMin + '分钟' + (_dayAdvance > 0 ? '（跨天' + _dayAdvance + '日）' : ''));

        return {
            date: _newDate,
            time: _newTime,
            period: _newPeriod,
            weather: resolved.weather,
            era: resolved.era
        };
    },

    // 格式化时间显示（用于UI）
    formatTime() {
        var gt = gameState.gameTime;
        if (!gt) return '';
        var parts = [];
        if (gt.date) parts.push(gt.date);
        if (gt.time) parts.push(gt.time);
        else if (gt.period) parts.push(gt.period);
        return parts.join(' ');
    },

    // 格式化短标题（用于标题栏）
    formatShort() {
        var gt = gameState.gameTime;
        if (!gt) return '';
        var parts = [];
        if (gt.date) parts.push(gt.date);
        if (gt.period) parts.push(gt.period);
        return parts.join(' · ');
    },

    // 更新UI显示
    updateUI() {
        var timeEl = document.getElementById('gameTimeText');
        if (timeEl) {
            var formatted = this.formatTime();
            // 【ISSUE-012 修复】原代码无时间数据时显示 '--'，但 parseFromAI 的"游戏开始"
            // 兜底只在 AI 回复后生效。游戏刚启动或 JSON 截断导致 parseFromAI 抛错时，
            // gameState.gameTime 始终为空。改为显示"游戏开始"而非 '--'。
            timeEl.textContent = formatted || '游戏开始';
        }
    // 标题栏显示章节标题，不显示时间（时间已经在顶部显示）
    // var titleTimeEl = document.getElementById('storySceneTitle');
    // if (titleTimeEl) {
        //     var short = this.formatShort();
        //     if (short) {
            //         titleTimeEl.textContent = short;
            //     }
        // }
    }
};

// ========================================
// 超强JSON容错解析系统（状态机）
// ========================================
// 通用括号匹配状态机
function _findMatching(str, startChar, endChar, startIdx) {
    let depth = 0, inS = false, esc = false;
    for (let i = startIdx; i < str.length; i++) {
        const c = str[i];
        if (esc) { esc = false; continue; }
        if (c === '\\') { esc = true; continue; }
        if (c === '"') inS = !inS;
        if (inS) continue;
        if (c === startChar) depth++;
        if (c === endChar) { depth--; if (depth === 0) return i; }
    }
return -1;
}

// 原 safeJSONParse 内部第一行就调 ResponseParser._tryDirectJSON，剩余逻辑又重写代码块剥离+状态机，
// 与 ResponseParser Level 1/2 高度重叠，且在 parseAIResponse 中形成循环调用。
//
// 替代方案：parseJSONHelper —— 用于非 AI 响应的 JSON 解析场景（结局生成、设定提取、论坛回复等）
// 直接委托 ResponseParser.parse（5 层兜底），返回 data 对象或 null
function parseJSONHelper(str) {
    if (!str || typeof str !== 'string') return null;
    if (typeof ResponseParser === 'undefined' || !ResponseParser.parse) {
        // ResponseParser 不可用时最小兜底
        try { return JSON.parse(str); } catch (e) { return null; }
    }
    var result = ResponseParser.parse(str);
    return (result && result.success && result.data) ? result.data : null;
}
// 状态机提取字符串字段
// PNG角色卡解析工具 - 从PNG文件的tEXt chunk中提取chara数据
function extractCharaData(arrayBuffer) {
    try {
        var data = new Uint8Array(arrayBuffer);
        // 检查PNG签名
        var pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
        for (let i = 0; i < 8; i++) {
            if (data[i] !== pngSignature[i]) return null;
        }
    // 遍历PNG chunks
    var offset = 8;
    while (offset + 8 <= data.length) {
        // 读取chunk长度 (4 bytes, big-endian)
        var length = (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
        offset += 4;
        // 边界检查：chunk长度不能为负或超出文件
        if (length < 0 || offset + length > data.length) break;
        // 读取chunk类型 (4 bytes)
        var type = String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
        offset += 4;
        // 检查是否为tEXt chunk
        if (type === 'tEXt') {
            // 读取keyword (null-terminated)
            var keywordEnd = offset;
            while (keywordEnd < offset + length && data[keywordEnd] !== 0) keywordEnd++;
            var keyword = String.fromCharCode.apply(null, data.slice(offset, keywordEnd));
            // 检查是否为chara关键字
            if (keyword === 'chara') {
                // 读取text数据 (keyword之后，null之后)
                var textStart = keywordEnd + 1;
                var textData = data.slice(textStart, offset + length);
                // 解码base64
                var base64 = '';
                for (let j = 0; j < textData.length; j++) {
                    base64 += String.fromCharCode(textData[j]);
                }
            var decoded = atob(base64);

            // 旧代码逐字节 String.fromCharCode 会把 UTF-8 多字节中文拆散为 Latin-1 字符
            var bytes = new Uint8Array(decoded.length);
            for (let k = 0; k < decoded.length; k++) {
                bytes[k] = decoded.charCodeAt(k);
            }
            var jsonStr = new TextDecoder('utf-8').decode(bytes);
        return JSON.parse(jsonStr);
    }
}
// 跳到下一个chunk (length + 4 bytes CRC)
offset += length + 4;
// 如果是IEND chunk，停止
if (type === 'IEND') break;
}
return null;
} catch (e) {
console.warn('解析PNG角色卡失败:', e);
return null;
}
}

function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

var _regexCache = new Map();
function _getCachedRegExp(pattern, flags) {
    var key = pattern + (flags || '');
    var re = _regexCache.get(key);
    if (!re) {
        re = new RegExp(pattern, flags || '');
        _regexCache.set(key, re);
    }
    return re;
}
function extractStr(text, field) {

    const m = text.match(_getCachedRegExp(`"${escapeRegExp(field)}"\\s*:\\s*"`));
    if (!m) return null;
    let r = '',
    esc = false;
    for (let i = m.index + m[0].length; i < text.length; i++) {
        const c = text[i];
        if (esc) {
            switch (c) {
                case 'n':
                r += '\n';
                break;
                case '"':
                r += '"';
                break;
                case '\\':
                r += '\\';
                break;
                default:
                r += c
            }
        esc = false
    } else if (c === '\\') esc = true;
else if (c === '"') return r;
else r += c;
}
return r.length > 0 ? r : null;
}
// 状态机提取数组
function extractArr(text, field) {

    const m = text.match(_getCachedRegExp(`"${escapeRegExp(field)}"\\s*:\\s*\\[`));
        if (!m) return null;
        let i = m.index + m[0].length,
        items = [],
        inS = false,
        esc = false,
        cur = '';
        while (i < text.length) {
            const c = text[i];
            if (esc) {
                switch (c) {
                    case 'n':
                    cur += '\n';
                    break;
                    case '"':
                    cur += '"';
                    break;
                    default:
                    cur += c
                }
            esc = false;
            i++;
            continue
        }
    if (c === '\\' && inS) {
        esc = true;
        i++;
        continue
    }
if (c === '"') {
    if (!inS) {
        inS = true;
        cur = ''
    } else {
    inS = false;
    items.push(cur);
    cur = ''
}
i++;
continue
}
if (!inS && c === ']') break;
if (inS) cur += c;
i++;
}
if (inS && cur.length > 0) items.push(cur);
return items.length > 0 ? items : null;
}
// 状态机提取对象数组
function extractObjArr(text, field) {

    const m = text.match(_getCachedRegExp(`"${escapeRegExp(field)}"\\s*:\\s*\\[`));
        if (!m) return null;
        const result = [];
        let i = m.index + m[0].length;
        while (i < text.length) {
            while (i < text.length && text[i] !== '{' && text[i] !== ']') i++;
            if (i >= text.length || text[i] === ']') break;
        const os = i;
        const oe = _findMatching(text, '{', '}', os);
        if (oe !== -1) {
            try {
                result.push(JSON.parse(text.slice(os, oe + 1)))
            } catch {}
        i = oe + 1
    } else break;
}
return result.length > 0 ? result : null;
}

// 字段级状态机提取已由 ResponseParser Level 2（_tryRobustJSON + _repairTruncatedJSON）覆盖
// extractStr/extractArr/extractObjArr 保留：仍被 game.js 多处用于从纯文本提取字段


// <mem> 标签解析统一由 ResponseParser.parse 的 Level 3 处理

// 将<mem>解析结果应用到gameState，自动维护结构化数据
function _applyMemsToGameState(mems) {
    if (!mems || mems.length === 0 || typeof gameState === 'undefined' || !gameState) return;
    mems.forEach(function(mem) {
        try {
            switch (mem.type) {
                case 'event':
                    if (mem.action === 'add' && mem._content) {


                        // GameMemory 在 tavern-compat.js 顶部初始化（window.GameMemory = new EnhancedMemory(...)），
                        // defer 加载后必然可用。如真不可用应抛错暴露问题而非静默写入数据孤岛。
                        var _gm = (typeof window !== 'undefined') ? window.GameMemory : null;
                        if (_gm && _gm.addImportantEvent) {
                            _gm.addImportantEvent(mem._content);
                        } else {
                            throw new Error('[<mem> event] GameMemory 未加载，无法写入事件');
                        }
                    }
                    break;
                case 'item':
                    // 【C1修复】委托 BagMutator，不再直接操作 gameState.bag（数据孤岛）
                    // 旧代码写 gameState.bag（不在 _legacyToPath 映射中），_syncLegacyMirror 不镜像，
                    // UI 读 gameState.currentBag 看不到 <mem> 添加的物品

                    // mutator 始终加载，缺失即抛错（与 event/character/time 分支一致）
                    if (typeof BagMutator === 'undefined') {
                        throw new Error('[<mem> item] BagMutator 未加载，无法写入物品');
                    }
                    var _itemQty = safeInt(mem.qty, 1);
                    if (mem.action === 'add') {
                        BagMutator.mergeItems([{ name: mem.name, count: _itemQty, desc: mem._content || '' }]);
                    } else if (mem.action === 'remove') {
                        var _rawBag = StateManager.get('entities.bag');
                        var _bag = Array.isArray(_rawBag) ? _rawBag : [];
                        var _rmItem = _bag.find(function(b) { return b && b.name === mem.name; });
                        if (_rmItem) {
                            _rmItem.count = Math.max(0, (_rmItem.count || 0) - _itemQty);
                            if (_rmItem.count === 0) {
                                _bag = _bag.filter(function(b) { return b && b.name !== mem.name; });
                            }
                            BagMutator.setItems(_bag);
                        }
                    }
                    break;
                case 'character':


                    // CharacterMutator 在 js/state/mutators/character-mutator.js 中定义，defer 加载后必然可用。
                    // 旧兜底直接写 gameState.allCharacters 会绕过 _syncLegacyMirror，导致 StateManager.entities.characters
                    // 与 gameState.allCharacters 不一致（数据断层）。现统一委托 CharacterMutator，缺失即抛错。
                    if (typeof CharacterMutator === 'undefined') {
                        throw new Error('[<mem> character] CharacterMutator 未加载，无法写入角色');
                    }
                    var _memName = mem.name;
                    var _existing = CharacterMutator.getCharacter(_memName);
                    if (_existing) {
                        if (mem.field && mem.value !== undefined) {
                            var _numVal = parseFloat(mem.value);
                            var _fieldVal = !isNaN(_numVal) ? _numVal : mem.value;
                            CharacterMutator.updateCharacter(_memName, function(c) {
                                c[mem.field] = _fieldVal;
                                return c;
                            });
                        }
                    } else if (_memName) {
                        // 新角色
                        var _newCh = { name: _memName };
                        if (mem.field && mem.value !== undefined) {
                            var _nv = parseFloat(mem.value);
                            _newCh[mem.field] = !isNaN(_nv) ? _nv : mem.value;
                        }
                        CharacterMutator.mergeCharacters([_newCh]);
                    }
                    break;
                case 'quest':
                    // 【C1修复】委托 QuestMutator，不再直接操作 gameState.quests（数据孤岛）
                    // 旧代码写 gameState.quests（不在 _legacyToPath 映射中），与 currentQuests 平行存在，
                    // 下游 mergeQuests 只读 currentQuests，导致 <mem> 添加的任务丢失

                    // mutator 始终加载，缺失即抛错（与 event/character/time 分支一致）
                    if (typeof QuestMutator === 'undefined') {
                        throw new Error('[<mem> quest] QuestMutator 未加载，无法写入任务');
                    }
                    if (mem.action === 'add') {
                        QuestMutator.addQuest({ title: mem._content || mem.name || '新任务', status: '进行中' });
                    } else if (mem.action === 'resolve') {
                        var _qTitle = mem._content || mem.name;
                        var _rawQuests = StateManager.get('entities.quests') || [];
                        var _q = _rawQuests.find(function(qq) { return qq && qq.title === _qTitle; });
                        if (_q) {
                            _q.status = QuestMutator.STATUS.COMPLETED;
                            QuestMutator.setQuests(_rawQuests);
                        }
                    }
                    break;
                case 'time':


                    // 避免直接改 gameState.gameTime 绕过时间单调性校验（详见 5.7 时间单调性校验被绕过）。

                    // 与 P1-I 时间契约冲突。TimeMutator 是必加载层，不可用时抛错。
                    if (typeof TimeMutator !== 'undefined' && TimeMutator.setTime) {
                        var _timeMem = {};
                        if (mem.day) _timeMem.date = mem.day;
                        if (mem.period) _timeMem.period = mem.period;
                        if (mem.time) _timeMem.time = mem.time;
                        TimeMutator.setTime(_timeMem, { silent: true });
                    } else {
                        throw new Error('[<mem> time] TimeMutator 未加载，无法写入时间');
                    }
                    break;
                case 'location':
                    // 【C1修复】直接写 StateManager.entities.locations，不再操作 gameState.world（数据孤岛）
                    // 旧代码写 gameState.world（schema 与 entities.locations 不同，且无任何读取点，是完全孤立的死字段）

                    // 任何地点变更都应经 LocationMutator，禁止再直写 StateManager.set('entities.locations', ...)
                    if (mem.action === 'add' && mem.name) {
                        if (typeof LocationMutator === 'undefined') {
                            throw new Error('[<mem> location] LocationMutator 未加载，无法写入地点');
                        }
                        LocationMutator.addLocation(mem.name, mem._content || '');
                    }
                    break;
            }
        } catch (e) {
            console.warn('[<mem>应用失败]', mem, e.message);
        }
    });
    // 【C1修复】反向同步清理：item/quest/location/character/time 分支均已委托 mutator / 直接写 StateManager，
    // 不再需要任何反向同步。原代码保留的反向同步逻辑（characters 兜底分支 + time 分支）随 P1 修复
    // 删除 CharacterMutator/time 兜底分支后已无存在必要。
    // - characters: CharacterMutator 不可用时已抛错而非走兜底，无需反向同步
    // - time: 已改走 TimeMutator.setTime，由 mutator 内部写 StateManager.time，无需此处二次同步
}

function parseAIResponse(reply) {
    let data = null;
    let storyText = '';
    let mems = [];
    let parsedByContract = null;

    // 【BUG-001 修复】检测 HTML/WAF 响应（WAF 验证页面、错误页面等）
    // 在所有解析层之前拦截，避免 HTML 源码被当作剧情内容显示给用户
    if (reply && typeof reply === 'string') {
        var _trimmedReply = reply.trim().toLowerCase();
        var _isHtml = false;
        if (_trimmedReply.startsWith('<!doctype') || _trimmedReply.startsWith('<html') || _trimmedReply.startsWith('<head')) {
            _isHtml = true;
        }
        if (!_isHtml) {
            var _tagMatches = _trimmedReply.substring(0, 3000).match(/<\/?(?:html|head|body|script|style|meta|link|title|div|span|form|input|button)\b/gi);
            if (_tagMatches && _tagMatches.length >= 5) _isHtml = true;
        }
        if (_isHtml) {
            console.warn('[parseAIResponse] 检测到HTML/WAF响应，已拦截');
            storyText = '⚠️ **API返回了HTML页面而非AI内容**\n\n💡 可能原因：\n• API端点被WAF（防火墙）拦截\n• API地址错误或服务不可用\n• API密钥无效触发了安全验证\n\n请检查API配置或更换API端点后重试。';
            if (typeof gameState !== 'undefined' && gameState) gameState._lastHtmlBlocked = true;
            return { story: storyText, choices: [], data: null, success: false };
        }
    }


    // （direct JSON → code block → robust + 状态机 → <mem> tags → plain text）
    // 旧实现在此之后又调 safeJSONParse/robustParse/_parseMemTags 三套重复解析器，
    // 形成循环调用（safeJSONParse 内部又调 ResponseParser._tryDirectJSON）。
    // 现统一为单层调用，删除三套重复解析器。
    if (typeof ResponseParser !== 'undefined' && ResponseParser.parse) {
        parsedByContract = ResponseParser.parse(reply);
        if (parsedByContract) {
            data = parsedByContract.data || null;
            storyText = parsedByContract.storyText || '';
            mems = parsedByContract.mems || [];
            if (mems.length > 0) {
                if (typeof window !== 'undefined') window._lastParsedMems = mems;
            }
            if (parsedByContract.warnings && parsedByContract.warnings.length > 0) {
                parsedByContract.warnings.forEach(function(w) { console.warn('[ResponseParser]', w); });
            }
        }
    } else {
        // ResponseParser 不可用时恢复原版4步兜底解析，不依赖外部契约层
        console.error('[parseAIResponse] ResponseParser 不可用，降级到内联解析');
        // 步骤1: 直接JSON解析
        try {
            var _direct = JSON.parse(reply);
            if (_direct && typeof _direct === 'object') {
                data = _direct;
                storyText = data.story || '';
            }
        } catch (e1) {
            // 步骤2: 代码块JSON提取
            // 【P0 ReDoS 修复】用 stripCodeBlocks 替代 [\s\S]*? 正则
            var _blockContent = (typeof stripCodeBlockContent === 'function')
                ? stripCodeBlockContent(reply, 'json')
                : (function() {
                    var _m = reply.match(/```json\n?([\s\S]*?)\n?```/);
                    return _m ? _m[1] : null;
                })();
            if (_blockContent) {
                try {
                    var _blockData = JSON.parse(_blockContent);
                    if (_blockData && typeof _blockData === 'object') {
                        data = _blockData;
                        storyText = data.story || '';
                    }
                } catch (e2) {}
            }
            // 步骤3: 纯文本中提取JSON块
            // 【P0 ReDoS 修复】用 indexOf 配对扫描替代 \{[\s\S]*\} 贪婪正则
            if (!data) {
                var _jsonBlockContent = (typeof extractFirstJSONBlock === 'function')
                    ? extractFirstJSONBlock(reply)
                    : (function() {
                        var _m = reply.match(/\{[\s\S]*\}/);
                        return _m ? _m[0] : null;
                    })();
                if (_jsonBlockContent) {
                    try {
                        var _extracted = JSON.parse(_jsonBlockContent);
                        if (_extracted && typeof _extracted === 'object') {
                            data = _extracted;
                            storyText = (data.story || reply.replace(_jsonBlockContent, '').trim()) || reply;
                        }
                    } catch (e3) {}
                }
            }
        }
        // 步骤4: 兜底用原文
        if (!storyText && reply) {
            // 【P0 ReDoS 修复】用 stripPairedTags / scanMarkerPairs 替代 [\s\S]*? 正则
            var _cleanReplyFallback = reply;
            if (typeof stripPairedTags !== 'undefined') {
                _cleanReplyFallback = stripPairedTags(_cleanReplyFallback, ['thinking', 'ECoT']);
            }
            if (typeof scanMarkerPairs !== 'undefined') {
                _cleanReplyFallback = scanMarkerPairs(_cleanReplyFallback, '💭', 'strip');
            }
            storyText = _cleanReplyFallback.trim() || reply;
        }
    }

    // 兜底：storyText 为空但 reply 有内容（纯文本小说预设）
    if ((!storyText || storyText.trim() === '') && reply && reply.trim()) {
        // 【P0 ReDoS 修复】用 stripPairedTags / scanMarkerPairs 替代 [\s\S]*? 正则
        var cleanedReply = reply;
        if (typeof stripPairedTags !== 'undefined') {
            cleanedReply = stripPairedTags(cleanedReply, ['thinking', 'ECoT']);
        }
        if (typeof scanMarkerPairs !== 'undefined') {
            cleanedReply = scanMarkerPairs(cleanedReply, '💭', 'strip');
        }
        cleanedReply = cleanedReply.trim();
        if (cleanedReply) storyText = cleanedReply;
    }

    // 【P0 修复】检测 storyText 是否为原始 SSE 流数据泄露
    // SSE 数据格式：data: {"id": "chatcmpl-...", "choices": [...], ...}
    if (storyText && /^data:\s*\{/.test(storyText.trim())) {
        console.warn('[parseAIResponse] 检测到原始 SSE 流数据泄露，已拦截');
        storyText = '⚠️ **AI 回复格式异常**（SSE 流数据未正确解析）\n\n💡 建议点击 🔄 重新生成，或尝试关闭流式模式。';
    }

    // 【P0 修复】检测 storyText 是否为原始 JSON 泄露
    // 当解析器失败时，AI 返回的原始 JSON 可能被当作 storyText 显示
    if (storyText && storyText.trim().startsWith('{') && /\}\s*$/.test(storyText.trim())) {
        var _trimmed = storyText.trim();
        // 尝试从原始 JSON 中提取 story 字段
        try {
            var _parsed = JSON.parse(_trimmed);
            if (_parsed && _parsed.story) {
                storyText = _parsed.story;
                console.warn('[parseAIResponse] 从原始 JSON 中提取 story 字段');
            }
        } catch(_jsonErr) {
            // JSON 解析失败，尝试用正则提取 story 字段
            var _storyMatch = _trimmed.match(/"story"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            if (_storyMatch) {
                storyText = _storyMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
                console.warn('[parseAIResponse] 从原始 JSON 中正则提取 story 字段');
            } else {
                // 无法提取，显示友好提示
                storyText = '⚠️ **AI 回复格式异常**（返回了原始 JSON 数据）\n\n💡 建议点击 🔄 重新生成，或检查 API 模型配置。';
                console.warn('[parseAIResponse] 检测到原始 JSON 泄露，已拦截');
            }
        }
    }

    // 复用 game.js 全局 _isThinkingContent 函数（阶段2-B1 统一），避免正则数组重复定义
    // 【P3 修复】若 data 有内容但 story 为空，尝试从其他字段映射
    if (data && (!storyText || storyText.trim() === '') && typeof data === 'object') {
        var _altFields = ['content', 'text', 'narrative', 'storyText', 'description'];
        for (var _afIdx = 0; _afIdx < _altFields.length; _afIdx++) {
            var _af = _altFields[_afIdx];
            if (data[_af] && typeof data[_af] === 'string' && data[_af].trim()) {
                storyText = data[_af].trim();
                data.story = storyText;
                console.warn('[parseAIResponse] story 为空，从 "' + _af + '" 字段映射');
                break;
            }
        }
    }
    if (storyText && typeof RuntimeBridge !== 'undefined' && RuntimeBridge._isThinkingContent && RuntimeBridge._isThinkingContent(storyText)) {
        console.warn('[parseAIResponse] 检测到 AI 思维链泄漏到剧情，已拦截');
        storyText = '⚠️ **AI 回复格式异常**（输出了推理过程而非剧情）\n\n💡 建议点击 🔄 重新生成，或检查预设是否要求 JSON 输出格式。';
        if (typeof gameState !== 'undefined' && gameState) gameState._lastLeakBlocked = true;
    }


// 调用它是纯开销（字符串比较 + try/catch），无任何效果。文风指导应在 prompt 中正面引导。

// 【小剧场融合】提取小剧场内容
var theaterContent = {};
if (typeof MacroEngine !== 'undefined') {
    var theaterVars = MacroEngine.getTheaterContent();
    Object.keys(theaterVars).forEach(function(key) {
        var val = String(theaterVars[key] || '');
        if (val.trim()) {
            var parsed = MacroEngine.parseTheaterContent(val);
            if (parsed && parsed.type !== 'unknown') {
                theaterContent[key] = parsed;
            }
    }
});
}

// 将提取到的小剧场内容存储到 gameState
if (Object.keys(theaterContent).length > 0) {
    if (!gameState._theaterContent) gameState._theaterContent = {};
    Object.assign(gameState._theaterContent, theaterContent);
    console.log('[小剧场融合] 提取到', Object.keys(theaterContent).length, '个小剧场');

    // 根据小剧场类型注入到对应的日志功能
    injectTheaterToLogs(theaterContent);

    // 【深度融合】将预设<branches>选项桥接到游戏原生选项系统
    _bridgeBranchesToChoices(theaterContent);
}

 // 检测JSON是否被截断（不完整）
    var _truncated = false;

    // _repairTruncatedJSON 修复成功后仍打印"检测到JSON被截断：{=44, }=43"误导日志
    if (reply && typeof reply === 'string' && !data) {
        var openBraces = (reply.match(/\{/g) || []).length;
        var closeBraces = (reply.match(/\}/g) || []).length;
        if (openBraces > 0 && openBraces > closeBraces) {
            _truncated = true;
            console.warn('[parseAIResponse] 检测到JSON被截断：{=' + openBraces + ', }=' + closeBraces);
            // 解析完全失败的情况下，过滤掉原始 JSON 残骸，不显示给用户
            var _cleanStory = (storyText || '').trim();
            // 移除原始 JSON 片段（以 { 开头的部分）
            _cleanStory = _cleanStory.replace(/\{[\s\S]*$/, '').trim();
            if (!_cleanStory) {
                storyText = '⚠️ **AI回复被截断**（JSON未输出完整）\n\n💡 建议点击 🔄 重新生成，或增大 API 设置中的 max_tokens';
            } else {
                storyText = _cleanStory;
            }
        }
    }

    // [T1-P1-2] 兜底：data 缺失时构造最小骨架，让 AIResponseMutator 等下游
    // 不因 data==null 而跳过（之前 data=null 时仅 storyText 有值，Mutator.apply 走空路径）
    // 【NEW-008 修复】标记 _isDefaultSkeleton，parseAIResponse 返回时据此判断 success=false
    if (!data && storyText && typeof AIOutputSchema !== 'undefined' && AIOutputSchema.getDefaultOutput) {
        const _skeleton = AIOutputSchema.getDefaultOutput();
        _skeleton.story = storyText;
        _skeleton._isDefaultSkeleton = true;  // 标记为空骨架，不是真正的结构化数据
        data = _skeleton;
    }

    return {
        data,
        storyText,
        mems: mems,
        truncated: _truncated,

        // 【NEW-008 修复】success 语义：仅当结构化数据真正解析成功时才为 true
        // - ResponseParser 返回 success=true（Level 0-3 真 JSON）：尊重该值
        // - ResponseParser 返回 success=false（Level 4 纯文本）：标记 false，让 legacy 提取路径执行
        // - data 是空骨架（getDefaultOutput + 仅 storyText）：标记 false，避免空数据被当成功写入
        // - storyText 存在但 data 为 null：false（纯文本无结构化数据）
        // 原实现 success=!!(data||storyText) 导致纯文本 fallback 也返回 true，
        // AIResponseMutator 把空骨架当成功数据写入，tables 全空却 currentTurn 递增
        success: !!(parsedByContract && parsedByContract.success === true && data && !data._isDefaultSkeleton)
    };
}

// 【P0-1 前端重复退化检测】
// 检测 AI 输出中的重复退化现象：字符级重复（"苏苏苏苏苏"）、短语级循环、段落级重复
// 返回 null 表示正常，返回字符串表示检测到的退化类型描述
function _detectRepetitionDegeneration(text) {
    if (!text || text.length < 10) return null;
    var _len = text.length;

    // 检测1：字符级重复（同一字符连续出现 10+ 次）
    // 这是之前测试中"苏苏苏苏苏"bug 的根因
    var _charRun = 1, _maxCharRun = 1, _repChar = '';
    for (var i = 1; i < _len; i++) {
        if (text[i] === text[i - 1]) {
            _charRun++;
            if (_charRun > _maxCharRun) { _maxCharRun = _charRun; _repChar = text[i]; }
        } else {
            _charRun = 1;
        }
    }
    if (_maxCharRun >= 10) {
        return '字符级重复："' + _repChar + '" 连续 ' + _maxCharRun + ' 次';
    }

    // 检测2：短语级循环（2-10字的短语重复 5+ 次）
    // 检查文本后半部分的短语重复
    var _checkText = text.length > 500 ? text.substring(text.length - 500) : text;
    for (var plen = 2; plen <= 10; plen++) {
        if (_checkText.length < plen * 6) continue;
        var _phrase = _checkText.substring(_checkText.length - plen);
        var _count = 0;
        var _pos = _checkText.length - plen;
        while (_pos >= 0 && _checkText.substring(_pos, _pos + plen) === _phrase) {
            _count++;
            _pos -= plen;
        }
        if (_count >= 5 && _phrase.trim().length > 0) {
            return '短语级循环："' + _phrase + '" 重复 ' + _count + ' 次';
        }
    }

    // 检测3：段落级重复（同一句子/段落出现 3+ 次）
    // 按句号/换行分割，检查重复段落
    var _sentences = text.split(/[。\n！？!?]/).filter(function(s) { return s.trim().length > 15; });
    if (_sentences.length > 3) {
        var _seen = {};
        for (var si = 0; si < _sentences.length; si++) {
            var _s = _sentences[si].trim();
            if (_seen[_s]) {
                _seen[_s]++;
                if (_seen[_s] >= 3) {
                    return '段落级重复："' + _s.substring(0, 30) + (_s.length > 30 ? '...' : '') + '" 出现 ' + _seen[_s] + ' 次';
                }
            } else {
                _seen[_s] = 1;
            }
        }
    }

    // 检测4：文本后半部分重复率过高（退化标志）
    if (_len > 200) {
        var _secondHalf = text.substring(Math.floor(_len / 2));
        var _uniqueChars = {};
        for (var ci = 0; ci < _secondHalf.length; ci++) {
            _uniqueChars[_secondHalf[ci]] = true;
        }
        var _uniqueRatio = Object.keys(_uniqueChars).length / _secondHalf.length;
        if (_uniqueRatio < 0.1 && _secondHalf.length > 50) {
            return '字符多样性极低（' + (_uniqueRatio * 100).toFixed(1) + '%），疑似退化输出';
        }
    }

    return null;
}

// 【P0-3 Context Viewer】记录上下文 token 分配
// 分析 messages 数组中各部分的 token 数，存入 gameState 供 UI 展示
function _recordContextBreakdown(messages, options) {
    if (!messages || !messages.length) return;
    var breakdown = {
        timestamp: Date.now(),
        totalMessages: messages.length,
        sections: [],
        totalTokens: 0,
        maxTokens: 0
    };

    // 获取 max_tokens 预算
    var presetParams = {};
    if (typeof PresetManager !== 'undefined' && PresetManager.getParams) {
        presetParams = PresetManager.getParams();
    }
    breakdown.maxTokens = presetParams.max_context || (typeof DEFAULT_CONTEXT_SIZE !== 'undefined' ? DEFAULT_CONTEXT_SIZE : 128000);

    // 按 role 和内容特征分类
    var categories = {
        system: { label: '系统提示词', tokens: 0, count: 0 },
        worldSetting: { label: '世界设定', tokens: 0, count: 0 },
        characters: { label: '角色信息', tokens: 0, count: 0 },
        worldInfo: { label: '世界书(已激活)', tokens: 0, count: 0 },
        summary: { label: '对话摘要', tokens: 0, count: 0 },
        vectorResults: { label: '向量检索结果', tokens: 0, count: 0 },
        authorNote: { label: '作者备注', tokens: 0, count: 0 },
        conversation: { label: '近期对话', tokens: 0, count: 0 },
        other: { label: '其他', tokens: 0, count: 0 }
    };

    for (var i = 0; i < messages.length; i++) {
        var msg = messages[i];
        if (!msg || !msg.content) continue;
        var content = String(msg.content);
        // 粗略估算 token 数（1 token ≈ 3.5 字符）
        var tokens = Math.ceil(content.length / 3.5);

        // 分类
        var cat = 'other';
        if (msg.role === 'system') {
            if (/世界设定|世界观|worldSetting/i.test(content)) cat = 'worldSetting';
            else if (/角色|人物|character|npc/i.test(content)) cat = 'characters';
            else if (/世界知识库|世界书|lore/i.test(content)) cat = 'worldInfo';
            else if (/摘要|总结|summary/i.test(content)) cat = 'summary';
            else if (/向量|检索|vector/i.test(content)) cat = 'vectorResults';
            else if (/作者备注|Author|AN/i.test(content)) cat = 'authorNote';
            else cat = 'system';
        } else if (msg.role === 'user' || msg.role === 'assistant') {
            cat = 'conversation';
        }

        categories[cat].tokens += tokens;
        categories[cat].count++;
        breakdown.totalTokens += tokens;
    }

    // 转换为数组
    for (var key in categories) {
        if (categories[key].tokens > 0) {
            breakdown.sections.push({
                label: categories[key].label,
                tokens: categories[key].tokens,
                count: categories[key].count,
                percentage: (categories[key].tokens / breakdown.totalTokens * 100).toFixed(1)
            });
        }
    }

    // 按 token 数降序
    breakdown.sections.sort(function(a, b) { return b.tokens - a.tokens; });

    // 存入全局状态
    if (typeof gameState !== 'undefined' && gameState) {
        gameState._lastContextBreakdown = breakdown;
    }
    if (typeof window !== 'undefined') {
        window._lastContextBreakdown = breakdown;
    }
}

// 返回 { valid: Boolean, missing: Array, storyField: String }
function validateAIResponse(data) {
    if (!isObject(data)) {
        return { valid: false, missing: ['data'], storyField: null };
    }
    var missing = [];
    // 剧情字段：任意一个非空即可
    var storyFields = ['story', 'storyText', 'content', 'text', 'narrative'];
    var storyField = null;
    for (let _sfIdx = 0; _sfIdx < storyFields.length; _sfIdx++) {
        var f = storyFields[_sfIdx];
        if (data[f] && typeof data[f] === 'string' && data[f].trim()) {
            storyField = f;
            break;
        }
    }
    if (!storyField) missing.push('story');
    // 场景/标题：建议有，但不是致命
    if (!data.title && !data.scene && !data.sceneTitle) missing.push('title/scene');
    // 可玩选项：不是致命，缺失会自动生成
    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        missing.push('choices（将自动生成）');
    }
    return {
        valid: storyField !== null,
        missing: missing,
        storyField: storyField
    };
}

// 根据 AI 指定的 type 字段创建模块
function _createModuleFromType(type, theater, key) {
    var content = theater.html || theater.content || '';
    var data = theater.data || {};
    var title = theater.title || key;

    // 已知类型的快速映射
    var knownTypes = {
        text: function() { return { type: 'text', title: title, content: content }; },
        list: function() { return { type: 'list', title: title, items: data.items || [] }; },
        ranking: function() { return { type: 'ranking', title: title, items: data.items || [] }; },
        key_value: function() { return { type: 'key_value', title: title, items: data.items || [] }; },
        cards: function() { return { type: 'cards', title: title, items: data.items || parseItemsContent(content) }; },
        comments: function() { return { type: 'comments', title: title, items: data.posts || parseForumContent(content) }; },
        moments: function() { return { type: 'moments', title: title, moments: parseMomentsContent(content) }; },
        mail: function() { return { type: 'mail', title: title, mails: parseMailContent(content) }; },
        shop: function() { return { type: 'shop', title: title, goods: parseShopContent(content) }; },
        diary: function() { return { type: 'diary', title: title, entries: parseDiaryContent(content) }; },
        chat: function() { injectToChatLog('群聊', theater); return { type: 'chat', npc: '群聊', messages: parseChatContent(content) }; },
        status: function() { _bridgeStatusToCharacters(theater); return { type: 'status', title: title, content: content, stats: data.stats || [] }; },
        summary: function() { _bridgeSummaryToMemory(theater); return { type: 'summary', title: title, content: content, summary: data.summary || '' }; },
        branches: function() { if (typeof RuntimeBridge !== 'undefined' && RuntimeBridge.renderChoices && data.options) RuntimeBridge.renderChoices(data.options); return { type: 'branches', title: title, content: content, options: data.options || [] }; },
        phone: function() { return { type: 'phone', title: title, content: content, apps: data.apps || [] }; },
        theater: function() { return { type: 'theater', title: title, content: content, scenes: data.scenes, text: data.text }; },
        author_note: function() { return { type: 'author_note', title: title, content: theater.content || content }; },
        achievements: function() { return { type: 'achievements', title: title, items: data.items || [] }; },
        calendar: function() { return { type: 'calendar', title: title, events: parseCalendarContent(content) }; },
        profile: function() { _bridgeProfileToRelationships(theater); return { type: 'text', title: title, content: content }; }
    };

    if (knownTypes[type]) return knownTypes[type]();

    // 未知类型：作为通用文本模块
    return { type: 'text', title: title, content: content };
}

// 根据标签名映射小剧场到模块类型（兼容旧标签名）
function _mapTheaterByKey(key, theater) {
    var targetModule = null;
    switch (key) {
        // 论坛类 -> 论坛
        case '论坛之愿':
        case '论坛小剧场':
        case '文艺盲盒小剧场':
        case 'gossip':
        case '八卦':
        case '论坛':
        targetModule = { type: 'comments', title: theater.title || '论坛', items: parseForumContent(theater.html || theater.content) };
        // 如果有结构化数据，使用它
        if (theater.data && theater.data.posts) {
            targetModule.items = theater.data.posts;
        }
    break;

    // 群聊类 -> 聊天记录
    case '群聊之愿':
    targetModule = { type: 'chat', npc: '群聊', messages: parseChatContent(theater.html || theater.content) };
    injectToChatLog('群聊', theater);
    break;

    // 日程类 -> 新增日程模块
    case '日程之愿':
    case '日程表':
    targetModule = { type: 'calendar', title: '日程表', events: parseCalendarContent(theater.html || theater.content) };
    break;

    // 通知类 -> 邮件
    case '通知之愿':
    targetModule = { type: 'mail', title: '系统通知', mails: parseMailContent(theater.html || theater.content) };
    break;

    // 购物类 -> 商店
    case '购物之愿':
    targetModule = { type: 'shop', title: '商店', goods: parseShopContent(theater.html || theater.content) };
    break;

    // 朋友圈/日常 -> 朋友圈
    case '每日之愿':
    case '日常剧场':
    case '盲盒之愿':
    targetModule = { type: 'moments', moments: parseMomentsContent(theater.html || theater.content) };
    break;

    // 桌面/盲盒 -> 物品
    case '桌面之愿':
    targetModule = { type: 'cards', title: '物品', items: parseItemsContent(theater.html || theater.content) };
    break;

    // 日记类 -> 日记
    case '后台人生':
    targetModule = { type: 'diary', npc: '后台', entries: parseDiaryContent(theater.html || theater.content) };
    break;

    // 作话 -> 新增作话模块
    case '蛾摩拉':
    targetModule = { type: 'author_note', title: '作者有话说', content: theater.content };
    break;

    // 【深度融合】状态栏 -> 同时更新游戏NPC系统
    case '小夜单人状态':
    case '通用状态':
    case '古风状态':
    case '状态面板':
    case 'status':
    targetModule = { type: 'status', title: '角色状态', content: theater.html || theater.content };
    // 如果有结构化数据，使用它
    if (theater.data && theater.data.stats) {
        targetModule.stats = theater.data.stats;
        targetModule.ancient = theater.data.ancient || false;
    }
// 【深度融合】将状态数据桥接到游戏NPC系统
_bridgeStatusToCharacters(theater);
break;

// 档案/报告 -> 世界信息
case '档案之愿':
case '报告之愿':
targetModule = { type: 'text', title: theater.title || key, content: theater.content };
break;


case '角色手机':
case '手机':
case 'phone':
targetModule = { type: 'phone', title: '手机', content: theater.html || theater.content };
if (theater.data && theater.data.apps) {
    targetModule.apps = theater.data.apps;
}
break;

// 【深度融合】摘要 -> 同时注入游戏记忆系统和日志模块
case 'meow_FM':
case '摘要':
case 'summary':
targetModule = { type: 'summary', title: '摘要', content: theater.html || theater.content };
if (theater.data && theater.data.summary) {
targetModule.summary = theater.data.summary;
}
// 【深度融合】将预设摘要桥接到游戏EnhancedMemory
_bridgeSummaryToMemory(theater);
break;


case 'branches':
case '选项分支':
case '分支':
targetModule = { type: 'branches', title: '选项', content: theater.html || theater.content };
if (theater.data && theater.data.options) {
targetModule.options = theater.data.options;
// 同时更新游戏选项
if (typeof RuntimeBridge !== 'undefined' && RuntimeBridge.renderChoices) {
    RuntimeBridge.renderChoices(theater.data.options);
}
}
break;


case 'echo':
case '物品':
case 'items':
targetModule = { type: 'cards', title: '物品', items: parseItemsContent(theater.html || theater.content) };
if (theater.data && theater.data.items) {
targetModule.items = theater.data.items;
}
break;


case 'ccd':
case '文字剧场':
case '剧场':
targetModule = { type: 'theater', title: '文字剧场', content: theater.html || theater.content };
if (theater.data) {
if (theater.data.scenes) {
    targetModule.scenes = theater.data.scenes;
} else if (theater.data.text) {
targetModule.text = theater.data.text;
}
}
break;


case '恋爱之塔':
case '恋爱小剧场':
case '恋爱之愿':
targetModule = { type: 'theater', title: '恋爱剧场', content: theater.html || theater.content };
break;

case '涩涩之塔':
case '涩涩小剧场':
case '涩涩之愿':
targetModule = { type: 'theater', title: '涩涩剧场', content: theater.html || theater.content };
break;

case '游戏之塔':
case '游戏小剧场':
case '游戏之愿':
targetModule = { type: 'theater', title: '游戏剧场', content: theater.html || theater.content };
break;

case '群聊之塔':
targetModule = { type: 'chat', npc: '群聊', messages: parseChatContent(theater.html || theater.content) };
injectToChatLog('群聊', theater);
break;

case '论坛之塔':
case '八卦之塔':
targetModule = { type: 'comments', title: theater.title || '论坛', items: parseForumContent(theater.html || theater.content) };
if (theater.data && theater.data.posts) {
targetModule.items = theater.data.posts;
}
break;

case '同人之塔':
case '同人之愿':
targetModule = { type: 'theater', title: '同人剧场', content: theater.html || theater.content };
break;

case '回忆之塔':
case '回忆之愿':
targetModule = { type: 'diary', npc: '回忆', entries: parseDiaryContent(theater.html || theater.content) };
break;

case '平行之塔':
case '平行之愿':
targetModule = { type: 'theater', title: '平行世界', content: theater.html || theater.content };
break;

case '美食之塔':
case '美食之愿':
targetModule = { type: 'theater', title: '美食剧场', content: theater.html || theater.content };
break;

case '广告之塔':
case '广告之愿':
targetModule = { type: 'theater', title: '广告', content: theater.html || theater.content };
break;

case '报告之塔':
case '报告之愿':
targetModule = { type: 'text', title: theater.title || '报告', content: theater.content };
break;

case '每日之塔':
case '文学之塔':
case '文学之愿':
targetModule = { type: 'theater', title: theater.title || '文学', content: theater.html || theater.content };
break;

case '哀伤之塔':
case '哀伤之愿':
targetModule = { type: 'theater', title: '哀伤', content: theater.html || theater.content };
break;

case '幸福之塔':
case '幸福之愿':
targetModule = { type: 'moments', moments: parseMomentsContent(theater.html || theater.content) };
break;

case '盲盒之塔':
targetModule = { type: 'cards', title: '盲盒物品', items: parseItemsContent(theater.html || theater.content) };
break;


case 'ice':
targetModule = { type: 'text', title: 'ice', content: theater.html || theater.content };
break;

case 'live':
targetModule = { type: 'theater', title: '直播', content: theater.html || theater.content };
break;

case 'danmu':
targetModule = { type: 'theater', title: '弹幕', content: theater.html || theater.content };
break;

case 'enigma':
targetModule = { type: 'text', title: '谜题', content: theater.html || theater.content };
break;

case 'podcast':
targetModule = { type: 'theater', title: '播客', content: theater.html || theater.content };
break;

case '作者有话说':
case 'author_note':
targetModule = { type: 'author_note', title: '作者有话说', content: theater.content };
break;

case 'giggle':
case '角色心声':
targetModule = { type: 'text', title: '角色心声', content: theater.content };
break;

case 'novel_header':
targetModule = { type: 'text', title: '章节标题', content: theater.html || theater.content };
break;

case 'profile':
case '角色关系':
targetModule = { type: 'text', title: '角色关系', content: theater.html || theater.content };
// 【深度融合】将角色关系数据桥接到游戏关系系统
_bridgeProfileToRelationships(theater);
break;

case 'horae':
case 'horaeevent':
targetModule = { type: 'text', title: '记忆', content: theater.html || theater.content };
break;

// 其他 -> 世界信息
default:
if (theater.type === 'snow') {
targetModule = { type: 'text', title: theater.title || key, content: theater.content };
} else if (theater.type === 'gossip') {
targetModule = { type: 'comments', title: theater.title || '论坛', items: theater.data?.posts || [{ author: '小剧场', content: theater.content, time: Date.now() }] };
} else if (theater.type === 'phone') {
targetModule = { type: 'phone', title: '手机', content: theater.html || theater.content, apps: theater.data?.apps || [] };
} else if (theater.type === 'status') {
targetModule = { type: 'status', title: '角色状态', content: theater.html || theater.content, stats: theater.data?.stats || [] };
} else if (theater.type === 'summary') {
targetModule = { type: 'summary', title: '摘要', content: theater.html || theater.content, summary: theater.data?.summary || '' };
} else if (theater.type === 'branches') {
targetModule = { type: 'branches', title: '选项', content: theater.html || theater.content, options: theater.data?.options || [] };
} else if (theater.type === 'echo') {
targetModule = { type: 'cards', title: '物品', items: theater.data?.items || parseItemsContent(theater.html || theater.content) };
} else if (theater.type === 'ccd') {
targetModule = { type: 'theater', title: '文字剧场', content: theater.html || theater.content, scenes: theater.data?.scenes, text: theater.data?.text };
}
    }
    // [E3修复] 统一净化 content 字段，避免 AI 返回的恶意 HTML 通过 innerHTML 渲染执行 XSS
    // sanitizeHtml 使用白名单标签+属性，移除 <script>/on* 事件/危险 URL
    if (targetModule && targetModule.content && typeof sanitizeHtml === 'function') {
        targetModule.content = sanitizeHtml(targetModule.content);
    }
    return targetModule;
}

// 【小剧场融合】将小剧场内容注入到日志功能
function injectTheaterToLogs(theaterContent) {
    if (!theaterContent || Object.keys(theaterContent).length === 0) return;

    // 【全量修复-P2】方向反转：以 StateManager 为权威源读取，本地累积变更后写回
    // 不再直接操作 gameState._worldModules（由 _syncLegacyMirror 自动回写）
    var mods = (typeof StateManager !== 'undefined' && StateManager.get)
        ? (StateManager.get('ui.worldModules') || [])
        : (Array.isArray(gameState._worldModules) ? gameState._worldModules : []);

    Object.keys(theaterContent).forEach(function(key) {
        var theater = theaterContent[key];
        var targetModule = null;

        // 优先使用 theater 自身的 type 字段（AI 可直接指定模块类型）
        if (theater.type && typeof theater.type === 'string' && theater.type !== 'theater') {
            targetModule = _createModuleFromType(theater.type, theater, key);
        }

        // 如果没有 type 或 type 为 'theater'，走标签名映射
        if (!targetModule) {
            targetModule = _mapTheaterByKey(key, theater);
        }

        if (targetModule) {
            // 查找是否已有同类型模块，有则更新，无则添加
            var existingIdx = mods.findIndex(function(m) {
                return m.type === targetModule.type && m.title === targetModule.title;
            });
            if (existingIdx >= 0) {
                mods[existingIdx] = targetModule;
            } else {
                mods.push(targetModule);
            }
            console.log('[小剧场融合] 已注入', key, '到', targetModule.type);
        }
    });
    // 【全量修复-P2】写入权威源 StateManager，_syncLegacyMirror 自动回写 gameState._worldModules
    if (typeof StateManager !== 'undefined' && StateManager.set) {
        StateManager.set('ui.worldModules', mods, { silent: true });
    } else if (typeof gameState !== 'undefined') {
        gameState._worldModules = mods;
    }
}

// 【深度融合】将预设<branches>选项桥接到游戏原生renderChoices系统
// 这样预设的剧情分支选项会直接出现在游戏选项面板中，而不是只在日志页
function _bridgeBranchesToChoices(theaterContent) {
    if (!theaterContent) return;
    var branchesData = theaterContent['branches'] || theaterContent['选项分支'] || theaterContent['分支'];
    if (!branchesData) return;

    // 从解析后的数据中提取选项
    var options = [];
    if (branchesData.data && branchesData.data.options && branchesData.data.options.length > 0) {
        // 结构化数据（<option>子标签解析结果）
        options = branchesData.data.options.map(function(opt) {
            return {
                id: String.fromCharCode(65 + ((opt.index || 0) % 26)),
                text: opt.text || opt.content || '',
                tag: opt.condition ? '条件' : '分支'
            };
    });
} else if (branchesData.html || branchesData.content) {
// 纯文本格式，按行解析
var rawText = (branchesData.html || branchesData.content).replace(/<[^>]+>/g, '').trim();
var lines = rawText.split(/\n/).filter(function(l) { return l.trim(); });
options = lines.map(function(line, idx) {
    return {
        id: String.fromCharCode(65 + (idx % 26)),
        text: line.trim(),
        tag: '分支'
    };
});
}

if (options.length > 0) {
    // 桥接到游戏原生选项系统
    if (typeof RuntimeBridge !== 'undefined' && RuntimeBridge.renderChoices) {
        RuntimeBridge.renderChoices(options);
        console.log('[深度融合] 已将 ' + options.length + ' 个<branches>选项桥接到游戏选项系统');
    }
}
}

// 【深度融合】将预设<meow_FM>摘要桥接到游戏EnhancedMemory系统

// 新代码写入 _summaryLayers.near，确保摘要能被 buildInjection 第9层注入给 AI
function _bridgeSummaryToMemory(theaterData) {
    if (!theaterData) return;
    var summaryText = '';
    if (theaterData.data && theaterData.data.summary) {
        summaryText = theaterData.data.summary;
    } else if (theaterData.content) {
    summaryText = theaterData.content.replace(/<[^>]+>/g, '').trim();
} else if (theaterData.html) {
summaryText = theaterData.html.replace(/<[^>]+>/g, '').trim();
}
if (!summaryText || summaryText.length < 10) return;


if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory._summaryLayers) {
    var summaryEntry = '[预设摘要] ' + summaryText.substring(0, 500);
    // 避免重复
    if (EnhancedMemory._summaryLayers.near.indexOf(summaryEntry) === -1) {
        EnhancedMemory._summaryLayers.near.push(summaryEntry);
        // 保留最近10条
        if (EnhancedMemory._summaryLayers.near.length > 10) {
            EnhancedMemory._summaryLayers.near = EnhancedMemory._summaryLayers.near.slice(-10);
        }
        try { EnhancedMemory.saveToStorage(); } catch(e) {}
        console.log('[深度融合] 已将<meow_FM>摘要桥接到 _summaryLayers.near (长度:' + summaryText.length + ')');
    }
}

// 同时更新游戏的滚动摘要（如果AI没有返回contextSummary）
var _rs = (typeof StateManager !== 'undefined' && StateManager.get) ? StateManager.get('progress.rollingSummary') : (gameState.rollingSummary || '');
if (!_rs || _rs.length < 50) {
    if (typeof StateManager !== 'undefined' && StateManager.set) {
        StateManager.set('progress.rollingSummary', summaryText.substring(0, 300), { silent: true });
    }
    console.log('[深度融合] 已更新滚动摘要');
}
}

// 【深度融合】将预设状态面板数据桥接到游戏NPC角色系统
function _bridgeStatusToCharacters(theaterData) {
    if (!theaterData) return;
    var stats = (theaterData.data && theaterData.data.stats) || [];
    if (stats.length === 0) return;

    var charUpdate = {};
    var targetCharName = null;

    // 优先处理结构化数据：stats 中带有 field 字段的项直接映射
    stats.forEach(function(stat) {
        if (!stat || !stat.name) return;
        var value = (stat.value || '').replace(/<[^>]+>/g, '').trim();
        if (!value) return;

        // 结构化数据：stat.field 直接指定了目标字段
        if (stat.field) {
            charUpdate[stat.field] = value;
            // 如果 field 是 name，提取角色名
            if (stat.field === 'name' || stat.field === '角色名') {
                targetCharName = value;
            }
            return;
        }

        // 回退：关键词匹配（兼容旧格式）
        var name = stat.name.replace(/[：:]/g, '').trim();
        var lowerName = name.toLowerCase();
        if (lowerName.includes('心情') || lowerName.includes('情绪') || lowerName.includes('状态')) {
            charUpdate.desc = value;
        } else if (lowerName.includes('位置') || lowerName.includes('地点') || lowerName.includes('所在')) {
            charUpdate.location = value;
        } else if (lowerName.includes('穿着') || lowerName.includes('服装') || lowerName.includes('服饰')) {
            charUpdate.outfit = value;
        } else if (lowerName.includes('名字') || lowerName.includes('角色') || lowerName.includes('名称') || lowerName === 'name') {
            targetCharName = value;
        }
    });

    // 更新NPC的状态
    if (Object.keys(charUpdate).length > 0 && typeof RuntimeBridge !== 'undefined' && RuntimeBridge.mergeCharacters) {
        // 尝试从标题获取角色名
        if (!targetCharName && theaterData.data && theaterData.data.title) {
            targetCharName = theaterData.data.title.replace(/[：:]/g, '').trim();
        }
        // 回退：匹配已有角色
        if (!targetCharName && gameState.allCharacters) {
            var charNames = Object.keys(gameState.allCharacters);
            if (charNames.length > 0) targetCharName = charNames[0];
        }
        if (targetCharName) {
            var update = Object.assign({ name: targetCharName }, charUpdate);
            RuntimeBridge.mergeCharacters([update]);
            console.log('[深度融合] 已将状态面板数据桥接到NPC系统:', targetCharName);
        }
    }
}

// 【深度融合】将预设的字数/段落配置同步到游戏设置界面
function _syncPresetWordCountToUI(config) {
    if (!config) return;
    // 确保 gameState.wordCountConfig 已初始化
    if (!gameState.wordCountConfig) {
        gameState.wordCountConfig = { enabled: true, min: 1500, max: 3000, paragraphMin: 15, paragraphMax: 17, paragraphStyle: 'medium', lengthPreset: 'medium', perspective: 'third_person_limited', userPronoun: 'third_person' };
    }
    // 更新 gameState：按判断条件分组循环（保持与原逻辑完全等价）
    // 用 != null 判断的字段（null/undefined 都跳过）
    var _nullableFields = ['min', 'max', 'paragraphMin', 'paragraphMax'];
    for (var i = 0; i < _nullableFields.length; i++) {
        var k = _nullableFields[i];
        if (config[k] != null) gameState.wordCountConfig[k] = config[k];
    }
    // 用 truthy 判断的字段（空字符串等也跳过）
    var _truthyFields = ['paragraphStyle', 'lengthPreset'];
    for (var j = 0; j < _truthyFields.length; j++) {
        var f = _truthyFields[j];
        if (config[f]) gameState.wordCountConfig[f] = config[f];
    }
    // enabled 单独处理（用 !== undefined 判断，允许 false 显式传入）
    if (config.enabled !== undefined) gameState.wordCountConfig.enabled = config.enabled;

    // 同步到 UI 元素（如果设置页面有对应的 DOM）
    var _domSync = [
        { id: 'wcMin', value: config.min || 1500, prop: 'value' },
        { id: 'wcMax', value: config.max || 3000, prop: 'value' },
        { id: 'wcParagraphStyle', value: config.paragraphStyle || 'medium', prop: 'value' },
        { id: 'wcEnabled', value: config.enabled !== false, prop: 'checked' }
    ];
    for (var d = 0; d < _domSync.length; d++) {
        var el = document.getElementById(_domSync[d].id);
        if (el) el[_domSync[d].prop] = _domSync[d].value;
    }

    console.log('[深度融合] 已将预设字数配置同步到设置UI:', config.min + '-' + config.max + '字');
}

// 【深度融合】将预设<profile>角色关系数据桥接到游戏关系系统
function _bridgeProfileToRelationships(theaterData) {
    if (!theaterData) return;
    var content = theaterData.html || theaterData.content || '';
    if (!content || content.length < 20) return;

    // 尝试从mermaid图或文本中提取角色关系
    // 常见格式: "角色A --关系--> 角色B" 或 "角色A - 关系 - 角色B"
    var relations = [];

    // mermaid格式: A-->|关系|B
    var mermaidRegex = /([^\s\-|>]+?)\s*(?:--+>|===+>)\s*\|?\s*([^|>]+?)\s*\|?\s*([^\s\-|]+)/g;
    var match;
    while ((match = mermaidRegex.exec(content)) !== null) {
        relations.push({ from: match[1].trim(), relation: match[2].trim(), to: match[3].trim() });
    }

// 文本格式: "A和B：关系" 或 "A - B：关系"
if (relations.length === 0) {
    var textRegex = /(?:^|\n)\s*([^:\n]+?)\s*[和与\-—]\s*([^:\n]+?)\s*[：:]\s*(.+?)(?:\n|$)/g;
    while ((match = textRegex.exec(content)) !== null) {
        relations.push({ from: match[1].trim(), relation: match[3].trim(), to: match[2].trim() });
    }
}

// 将提取的关系注入到游戏系统

if (relations.length > 0 && gameState.allCharacters) {
        relations.forEach(function(rel) {
            // 更新"from"角色的关系描述
            if (rel.from) {
                if (typeof CharacterMutator !== 'undefined' && CharacterMutator.updateCharacter) {
                    CharacterMutator.updateCharacter(rel.from, function(c) {
                        c.relation = rel.relation;
                        return c;
                    });
                } else if (gameState.allCharacters[rel.from]) {
                    gameState.allCharacters[rel.from].relation = rel.relation;
                }
            }
            // 确保"to"角色也存在（必须有名有姓）
            if (rel.to && typeof rel.to === 'string' && rel.to.trim()) {
                var _toExists = (typeof CharacterMutator !== 'undefined' && CharacterMutator.getCharacter)
                    ? !!CharacterMutator.getCharacter(rel.to)
                    : !!gameState.allCharacters[rel.to];
                if (!_toExists) {
                    if (typeof CharacterMutator !== 'undefined' && CharacterMutator.mergeCharacters) {
                        CharacterMutator.mergeCharacters([{ name: rel.to, relation: '' }]);
                    } else {
                        gameState.allCharacters[rel.to] = { name: rel.to, relation: '' };
                    }
                }
            }
        });
        if (typeof RuntimeBridge !== 'undefined' && RuntimeBridge.renderNpcList) RuntimeBridge.renderNpcList();
        console.log('[深度融合] 已将 ' + relations.length + ' 条角色关系桥接到NPC系统');
    }
}

// 【小剧场融合】小剧场解析 schema 配置表
// 7 个 parse*Content 委托 parseTheaterItems，仅 schema 不同，统一收敛为配置表驱动。
// parseCalendarContent 因独立实现（Event: 格式正则），保持不变。
var _THEATER_SCHEMAS = {
    forum: {
        itemClass: 'post',
        fields: { author: 'author', content: 'content', time: 'time' },
        defaults: { author: '匿名', content: '', time: '' },
        multilineFields: ['content'],
        transformers: { time: 'dateOrNow' },
        mapResult: function (p) {
            return { author: p.author, content: p.content, time: p.time, likes: 0, replies: 0 };
        },
        fallback: function (rawHtml) {
            return { author: '小剧场', content: rawHtml.replace(/<[^>]+>/g, '').substring(0, 200), time: Date.now(), likes: 0, replies: 0 };
        }
    },
    chat: {
        itemClass: 'message',
        fields: { sender: 'sender', text: 'text' },
        defaults: { sender: '未知', text: '' },
        multilineFields: ['text'],
        mapResult: function (p) {
            return { sender: p.sender, text: p.text, time: Date.now() };
        }
    },
    mail: {
        itemClass: 'mail',
        fields: { from: 'from', subject: 'subject', body: 'body' },
        defaults: { from: '系统', subject: '无主题', body: '' },
        multilineFields: ['body'],
        mapResult: function (p) {
            return {
                from: p.from,
                subject: p.subject,
                preview: (p.body || '').substring(0, 50),
                content: p.body,
                read: false,
                time: Date.now()
            };
        },
        fallback: function (rawHtml) {
            return {
                from: '系统通知',
                subject: '小剧场',
                preview: rawHtml.replace(/<[^>]+>/g, '').substring(0, 50),
                content: rawHtml,
                read: false
            };
        }
    },
    shop: {
        itemClass: 'item',
        fields: { name: 'name', price: 'price', description: 'description' },
        defaults: { name: '商品', price: '100', description: '' },
        multilineFields: ['description'],
        transformers: { price: 'intOrDef' },
        mapResult: function (p) {
            return { name: p.name, price: p.price, description: (p.description || '').replace(/<[^>]+>/g, ''), icon: '📦' };
        }
    },
    moments: {
        itemClass: 'moment',
        fields: { author: 'author', content: 'content', likes: 'likes' },
        defaults: { author: '匿名', content: '', likes: '0' },
        multilineFields: ['content'],
        transformers: { likes: 'int' },
        mapResult: function (p) {
            return { author: p.author, content: p.content, time: '刚刚', likes: p.likes, comments: [] };
        },
        fallback: function (rawHtml) {
            return { author: '小剧场', content: rawHtml.replace(/<[^>]+>/g, ''), time: '刚刚', likes: 0, comments: [] };
        }
    },
    items: {
        itemClass: 'item',
        fields: { name: 'name', count: 'count', rarity: 'rarity' },
        defaults: { name: '物品', count: '1', rarity: '普通' },
        transformers: { count: 'intOrDef' },
        mapResult: function (p) {
            return { name: p.name, count: p.count, rarity: p.rarity, icon: '🎁' };
        }
    },
    diary: {
        itemClass: 'entry',
        fields: { date: 'date', content: 'content' },
        defaults: { date: '', content: '' },
        multilineFields: ['content'],
        transformers: { date: 'dateOrNow' },
        mapResult: function (p) {
            return { date: p.date, content: p.content };
        }
    }
};

// 【小剧场融合】解析论坛内容
function parseForumContent(html) { return parseTheaterItems(html, _THEATER_SCHEMAS.forum); }

// 【小剧场融合】解析聊天内容
function parseChatContent(html) { return parseTheaterItems(html, _THEATER_SCHEMAS.chat); }

function injectToChatLog(npcName, theater) {
    if (!gameState._chatLogs || Array.isArray(gameState._chatLogs)) gameState._chatLogs = {};
    if (!gameState._chatLogs[npcName]) gameState._chatLogs[npcName] = [];
    gameState._chatLogs[npcName].push({
        role: 'npc',
        text: (theater.content || '').substring(0, 100) + (theater.content.length > 100 ? '...' : ''),
        time: Date.now(),
        isTheater: true,
        theaterType: theater.type
    });

if (gameState._chatLogs[npcName].length > 50) {
    gameState._chatLogs[npcName] = gameState._chatLogs[npcName].slice(-50);
}
}

// 【小剧场融合】解析日程内容（独立实现，解析 Event: 格式正则，不委托通用函数）
function parseCalendarContent(html) {
    var events = [];
    // 尝试解析Event格式: Event: type|title|description|time|location
    var eventMatches = html.match(/Event:\s*([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^\n]+)/gi) || [];
    eventMatches.forEach(function(match) {
        var parts = match.replace(/Event:\s*/, '').split('|');
        events.push({
            type: parts[0] || '其他',
            title: parts[1] || '无标题',
            description: parts[2] || '',
            time: parts[3] || '',
            location: parts[4] || ''
        });
    });
    if (events.length === 0) {
        // 尝试解析简单列表
        var lines = html.replace(/<[^>]+>/g, '').split('\n').filter(function(l) { return l.trim(); });
        lines.forEach(function(line) {
            events.push({ type: '日程', title: line.trim(), description: '', time: '', location: '' });
        });
    }
    return events;
}

// 【小剧场融合】解析邮件内容
function parseMailContent(html) { return parseTheaterItems(html, _THEATER_SCHEMAS.mail); }

// 【小剧场融合】解析商店内容
function parseShopContent(html) { return parseTheaterItems(html, _THEATER_SCHEMAS.shop); }

// 【小剧场融合】解析朋友圈内容
function parseMomentsContent(html) { return parseTheaterItems(html, _THEATER_SCHEMAS.moments); }

// 【小剧场融合】解析物品内容
function parseItemsContent(html) { return parseTheaterItems(html, _THEATER_SCHEMAS.items); }

// 【小剧场融合】解析日记内容
function parseDiaryContent(html) { return parseTheaterItems(html, _THEATER_SCHEMAS.diary); }


// 原 translateError 内有三套重复映射：
//   - HTTP_STATUS_MAP（行 3732，定义后从未被引用——死常量）
//   - httpMap（行 3895，inline 短版）
//   - apiCodeMap（行 3928，inline 独立表）
// 现合并为 _ERROR_MAPS.HTTP_STATUS（详情版）与 _ERROR_MAPS.API_CODE（精简版）
// 两表共用，translateError 三个匹配路径（HTTP前缀/Error:前缀/裸码兜底）只查本表。
// [T2-P1-5] 验证：_ERROR_MAPS 合并已完成（HTTP_STATUS / API_CODE 单一来源）
// 旧实现三套重复映射：HTTP_STATUS_MAP（死常量）+ httpMap（inline）+ apiCodeMap（inline）。
// 现状：HTTP_STATUS / API_CODE 统一在 _ERROR_MAPS 内，translateError 三个匹配路径
// （HTTP 状态码前缀 / Error: 状态码前缀 / 裸码子串兜底）只查本表，重复定义已消除。
var _ERROR_MAPS = {
    // HTTP 状态码：用于 "HTTP 4xx/5xx" 抓取（httpMap/translateError），文案较详细
    HTTP_STATUS: {
        '400': '请求格式错误(400) → 请检查模型名称和参数是否正确',
        '401': '认证失败(401) → API Key错误或已过期，请到「设置→API配置」检查',
        '403': '没有权限(403) → 该API Key无权访问此模型，请检查Key的权限范围',
        '404': '地址不存在(404) → 请检查API地址是否正确（注意路径是否需要加/v1）',
        '408': '请求超时(408) → API服务器处理太慢，请重试',
        '429': '请求太频繁(429) → 已触发速率限制，请等待几秒后重试',
        '500': '服务器内部错误(500) → API服务商的问题，请稍后重试',
        '502': '网关错误(502) → API中转服务异常，可能正在维护',
        '503': '服务不可用(503) → API服务暂时过载或维护中，请稍后重试',
        '504': '网关超时(504) → API中转服务等待上游响应超时',
        '529': '站点过载(529) → API服务器负载过高，请稍后重试'
    },
    // API 错误码：用于 "Error: 4xx/5xx" 抓取（apiCodeMap），文案精简（无括号码）
    API_CODE: {
        '400': '请求格式错误 → 请检查模型名称和参数是否正确',
        '401': '认证失败 → API Key错误或已过期，请到「设置→API配置」检查',
        '403': '权限不足 → 该API Key无权访问此模型',
        '404': '地址不存在 → 请检查API地址是否正确',
        '429': '请求太频繁 → 已触发速率限制，请等待几秒后重试',
        '500': '服务器内部错误 → API服务商的问题，请稍后重试',
        '502': '网关错误 → API中转服务异常，可能正在维护',
        '503': '服务不可用 → API服务暂时过载或维护中',
        '504': '网关超时 → API中转服务等待上游响应超时'
    }
};

// API错误信息中文翻译
function translateError(msg) {
    if (!msg) return '未知错误，请稍后重试';
    var m = msg;
    // 常见英文错误 -> 中文翻译映射表
    // 【分类】按错误类型分组，翻译包含：原因 + 建议操作
    var map = {
        // ═══ 网络连接错误 ═══
        'Failed to fetch': '网络请求失败（可能原因：网络断开、API地址错误、服务未启动）→ 请检查网络连接和API地址',
        'NetworkError when attempting to fetch resource': '网络错误 → 请检查网络连接是否正常',
        'Network request failed': '网络请求失败 → 请检查网络连接',
        'net::ERR_CONNECTION_REFUSED': '连接被拒绝 → API地址可能不正确，或API服务未启动',
        'net::ERR_CONNECTION_TIMED_OUT': '连接超时 → API服务器响应太慢或地址不正确',
        'net::ERR_NAME_NOT_RESOLVED': '域名解析失败 → 请检查API地址是否拼写正确',
        'net::ERR_SSL_PROTOCOL_ERROR': 'SSL协议错误 → 请检查API地址是否使用了正确的HTTPS配置',
        'net::ERR_CERT_DATE_INVALID': 'SSL证书已过期 → API服务器的证书需要更新',
        'net::ERR_INTERNET_DISCONNECTED': '网络已断开 → 请检查网络连接',
        'net::ERR_CONNECTION_CLOSED': '连接被关闭 → API服务器中断了连接，请重试',
        'net::ERR_EMPTY_RESPONSE': '服务器返回空响应 → API服务可能异常，请稍后重试',
        'net::ERR_SOCKET_NOT_CONNECTED': '套接字未连接 → 网络连接异常，请重试',
        'ECONNREFUSED': '连接被拒绝 → API服务可能未启动或端口不正确',
        'ECONNRESET': '连接被重置 → API服务器可能重启了，请重试',
        'ETIMEDOUT': '连接超时 → API服务器响应太慢，请检查网络或更换API',
        'ENOTFOUND': '域名不存在 → 请检查API地址是否正确',
        'EAI_AGAIN': 'DNS解析临时失败 → 请检查网络连接后重试',
        'EPROTO': '协议错误 → 请检查API地址是否使用了正确的协议（HTTP/HTTPS）',
        'UND_ERR_CONNECT_TIMEOUT': '连接超时 → API服务器未响应，请检查地址和网络',

        // ═══ 请求取消 ═══
        'AbortError': '请求已取消',
        'The user aborted a request': '请求已被取消',
        '请求已取消': '请求已取消',

        // ═══ JSON/数据解析错误 ═══
        'Unexpected end of JSON input': '服务器返回了不完整的数据 → 可能是网络不稳定或API异常，请重试',
        'Unexpected token': '服务器返回了无法解析的数据 → API可能返回了非JSON格式，请检查API配置',
        'JSON parse error': 'JSON解析失败 → API返回了非法格式，请检查API地址是否正确',
        'SyntaxError': '数据格式错误 → API返回了无法识别的内容，请检查API配置',

        // ═══ HTTP 状态码 ═══

        // 统一改用 HTTP_STATUS_MAP，由下方三处匹配路径覆盖（HTTP前缀/Error前缀/裸码兜底）

        // ═══ OpenAI/兼容API 特定错误 ═══
        'insufficient_quota': 'API额度不足 → 请到API服务商官网充值，或切换到其他API Key',
        'rate_limit_exceeded': '请求频率超限 → 请降低发送速度，或升级API套餐',
        'context_length_exceeded': '上下文超出模型限制 → 对话太长了，请尝试：1)减少设定长度 2)开启摘要压缩 3)换用更大上下文的模型',
        'invalid_api_key': 'API Key无效 → 请到「设置→API配置」检查Key是否正确复制（注意前后空格）',
        'model_not_found': '模型不存在 → 请到API配置检查模型名称是否正确（注意大小写和拼写）',
        'Maximum context length': '超出最大上下文长度 → 对话内容太长，请压缩对话或更换更大上下文的模型',
        'This model maximum context length': '超出模型最大上下文长度 → 请减少对话轮数或换用更大上下文的模型',
        'openai_error': 'OpenAI接口错误 → 请检查API地址和密钥是否正确',
        'invalid_request_error': '请求格式错误 → 可能是模型名称、参数格式有误，请检查API配置',
        'authentication_error': '认证失败 → API Key无效或已过期，请到「设置→API配置」重新填写',
        'permission_denied': '权限不足 → 该API Key无权访问此模型，请检查Key的权限范围',
        'not_found': '请求的资源不存在 → 请检查API地址和模型名称',
        'rate_limit_error': '请求频率超限 → 请稍后再试，或升级API套餐',
        'server_error': 'API服务器内部错误 → 服务商的问题，请稍后重试',
        'service_unavailable': 'API服务暂不可用 → 服务商可能正在维护，请稍后重试',
        'server_busy': '服务器繁忙 → 请稍后重试',
        'overloaded': '服务器过载 → 请稍后重试',
        'capacity': '容量不足 → API服务当前负载过高，请稍后重试',

        // ═══ API Key / 账户相关 ═══
        'Incorrect API key provided': 'API Key 不正确 → 请到「设置→API配置」检查并重新粘贴（注意前后空格和换行）',
        'You exceeded your current quota': '账户额度已用完 → 请到API服务商官网充值，或切换到其他API Key',
        'You must provide a model': '未指定模型 → 请到「设置→API配置」填写模型名',
        'The model `': '模型不存在或已下架 → 请到API配置检查模型名是否正确',
        'has been deprecated': '该模型已下架 → 请更换为其他可用模型',
        'deprecat': '该模型已下架 → 请更换为其他可用模型',
        'Billing': '账单问题 → 请到API服务商官网检查账户余额和账单',
        'billing_not_active': '账单未激活 → 请到API服务商官网绑定支付方式',
        'card_declined': '支付卡被拒绝 → 请到API服务商官网更新支付方式',
        'trial_expired': '试用已过期 → 请到API服务商官网升级为付费账户',

        // ═══ 中文错误二次翻译（中转站返回的中文错误）═══
        '余额不足': '账户余额不足 → 请到API服务商官网充值，或更换API Key',
        '额度不足': '账户额度不足 → 请到API服务商官网充值，或更换API Key',
        'API key 余额': 'API Key余额不足 → 请充值或更换Key',
        'key 已过期': 'API Key已过期 → 请到API服务商官网重新生成Key',
        '未配置模型': '未配置模型 → 请到「设置→API配置」填写模型名',
        '无效的': '参数无效 → 请检查API配置中的参数设置',

        // ═══ 模型相关 ═══
        'invalid model': '模型名称无效 → 请到API配置检查模型名（注意大小写和拼写）',
        'model_overloaded': '模型过载 → 当前使用人数太多，请稍后重试或切换模型',
        'model_rate_limit': '模型速率限制 → 该模型请求太频繁，请稍后重试',

        // ═══ 内容安全/过滤 ═══
        'content_filter': '内容被安全过滤 → AI认为生成内容可能违规，请调整输入或设定',
        'safety': '安全过滤触发 → AI拒绝了本次生成，请调整输入内容',
        'flagged': '内容被标记 → AI安全系统拦截了本次请求，请调整输入',

        // ═══ 流式/SSE相关 ═══
        'stream_error': '流式传输错误 → 连接中断，请重试',
        'connection lost': '连接丢失 → 网络不稳定导致流式传输中断，请重试',

        // ═══ JavaScript运行时错误 ═══
        'Cannot read properties of null': '数据加载失败 → 可能是存档数据异常，请刷新页面后重试',
        'Cannot read property': '数据读取失败 → 请刷新页面后重试',
        'null is not an object': '数据未加载完成 → 请稍后重试',
        'undefined is not an object': '数据未定义 → 请刷新页面重试',
        'TypeError': '类型错误 → 请刷新页面后重试',
        'ReferenceError': '引用错误 → 请刷新页面',

        // ═══ 其他常见错误 ═══
        'timeout': '请求超时 → AI思考时间过长，可能是模型太忙或上下文太长',
        'Timeout': '请求超时 → AI思考时间过长，请重试或减少上下文长度',
        'CORS': '跨域请求被阻止 → API地址可能不支持浏览器直接访问，请使用支持CORS的中转站',
        'cors': '跨域请求被阻止 → 请更换支持浏览器访问的API地址',
        'Invalid URL': 'API地址无效 → 请检查设置中的URL格式（需以http://或https://开头）',
        'No API key': '未配置API Key → 请先到「设置→API配置」添加Key',
        'No API configuration': '未配置API → 请先到「设置→API配置」添加API信息',
        'fetch failed': '获取数据失败 → 请检查网络连接和API地址是否正确',
        'no api configuration': '未配置API → 请先到「设置→API配置」添加API信息',
        'api key': 'API密钥相关错误',
        'api_key': 'API密钥相关错误',
        'API key': 'API密钥相关错误',
        'API Key': 'API密钥相关错误',
        'error processing': '处理数据时出错 → 请重试',
        'parse error': '解析数据出错 → API返回了无法识别的内容',
        'invalid response': '无效的响应 → API返回了异常数据，请检查API配置',
        'empty response': '服务器返回空数据 → AI未生成任何内容，可能是max_tokens太小或模型异常',
        '请求超时（5分钟）': 'AI请求超时 → 模型思考时间过长，可能是上下文太大或模型过载，请重试或在设置中调整超时时间',

        // ═══ 模型兼容性错误（X19）═══
        // 针对"连接成功但配置失败"的场景，给出具体可操作建议
        'does not exist': '该模型不存在或已下线 → 请在设置中更换为支持文本对话的模型',
        'model does not exist': '该模型不存在 → 请更换为支持的文本对话模型',
        'model is not found': '该模型未找到 → 可能已下线，请更换模型',
        'not found': '资源未找到 → 该模型可能不支持文本生成，请更换为对话模型',
        '所有': '所有API配置均调用失败 → 请检查：1)模型是否支持文本对话 2)API密钥是否有效 3)网络是否正常',
    };
// 预构建按长度降序排列的key数组，避免每次调用都排序
var _translateErrorSortedKeys = null;
function _getTranslateErrorSortedKeys(map) {
    if (!_translateErrorSortedKeys) {
        _translateErrorSortedKeys = Object.keys(map).sort(function(a, b) { return b.length - a.length; });
    }
    return _translateErrorSortedKeys;
}

// 这样用户既能看到中文解释，也能看到原始英文错误用于排查
// 【v3审查修复】HTTP 状态码优先匹配：原实现先做子串匹配，message="HTTP 429" 会命中
// map 中的裸数字 '429'（3字符），导致 httpMap 块沦为死代码，且两份翻译文案不一致。
// 现把 httpMap 提前到子串匹配之前，确保 "HTTP <status>" 走专用状态码翻译。
var httpMatch = m.match(/HTTP\s*(\d{3})/);
if (httpMatch) {
    var code = httpMatch[1];

    if (_ERROR_MAPS.HTTP_STATUS[code]) return _ERROR_MAPS.HTTP_STATUS[code];
}
var translated = null;
for (let key in map) {
    if (m === key) { translated = map[key]; break; }
}
if (!translated) {
    var keys = _getTranslateErrorSortedKeys(map);
    for (let i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (m.indexOf(key) !== -1) { translated = map[key]; break; }
    }
}
if (translated && translated !== m) {
    return translated + ' (' + m + ')';
}
// API错误码格式："Error: NNN - message" 或 "API错误: NNN"
var apiCodeMatch = m.match(/(?:Error|错误)[:\s]*(\d{3})/);
if (apiCodeMatch) {
    var apiCode = apiCodeMatch[1];

    if (_ERROR_MAPS.API_CODE[apiCode]) return _ERROR_MAPS.API_CODE[apiCode];
}
// 都没匹配到，返回友好提示（截断过长消息）
if (m.length > 100) {
    return '发生错误：' + m.substring(0, 80) + '...（详情见控制台）';
}
return '发生错误：' + m;
}

// safeSetItem 已在 utils.js 中统一定义，此处不再重复声明

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/`/g, '&#96;');
}

// 内联 HTML 属性值转义：用于 onclick="fn('...')" 等场景
// 把字符串安全嵌入 JS 字符串字面量（单引号包裹）中，防止 XSS 突破属性上下文
// 与 escapeHtml 的区别：escapeHtml 转义为 HTML 实体（&amp; &lt;），escapeAttr 转义为 JS 转义序列（\x3c \\'）
// 【J修复】统一 4 处 XSS 风险点的转义策略（phone-ui.js 3处 + game.js 1处）
function escapeAttr(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/</g, '\\x3c')
        .replace(/>/g, '\\x3e')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}

// ========================================

// 基于 DOMParser 解析 + 白名单标签/属性过滤
// 安全保证：不在白名单的标签被移除（保留内容），所有事件属性和危险协议被清除
// ========================================

// 允许的标签白名单及其允许的属性
var SANITIZE_WHITELIST = {
    // 文本格式
    'p': ['class'], 'br': [], 'span': ['class', 'data-target', 'data-action', 'title'],
    'strong': [], 'em': [], 'b': [], 'i': [],
    'div': ['class'], 'hr': [],
    // 标题
    'h1': ['class'], 'h2': ['class'], 'h3': ['class'], 'h4': ['class'], 'h5': ['class'], 'h6': ['class'],
    // 列表
    'ul': ['class'], 'ol': ['class'], 'li': ['class'],
    // 引用
    'blockquote': ['class'],
    // SVG（心声图标用）
    'svg': ['viewbox', 'width', 'height'], 'path': ['d'], 'line': ['x1', 'y1', 'x2', 'y2'],
    'circle': ['cx', 'cy', 'r'], 'rect': ['x', 'y', 'width', 'height'],
    // 图片（仅允许安全协议）
    'img': ['src', 'alt', 'class'],
    // 链接（仅允许安全协议）
    'a': ['href', 'title']
};

// 检查 URL 是否安全（阻止 javascript:/vbscript:/data: 协议）
function _isSafeUrl(url) {
    if (!url) return false;
    var v = String(url).trim().toLowerCase();
    // 允许相对路径、锚点
    if (v.charAt(0) === '/' || v.charAt(0) === '#' || v.charAt(0) === '.') return true;
    // 允许 http/https
    if (v.indexOf('http://') === 0 || v.indexOf('https://') === 0) return true;
    // 阻止危险协议
    if (v.indexOf('javascript:') === 0) return false;
    if (v.indexOf('vbscript:') === 0) return false;
    if (v.indexOf('data:') === 0) return false;
    // 其他协议默认阻止
    return false;
}

// 递归净化 DOM 节点
function _sanitizeDOMNode(node) {
    var children = node.childNodes;
    for (let i = children.length - 1; i >= 0; i--) {
        var child = children[i];
        if (child.nodeType === 1) { // Element 节点
            var tag = child.tagName.toLowerCase();
            if (!SANITIZE_WHITELIST[tag]) {
                // 不在白名单的标签：用子节点替换（保留文本内容），移除标签本身
                var parent = child.parentNode;
                while (child.firstChild) {
                    parent.insertBefore(child.firstChild, child);
                }
                parent.removeChild(child);
                continue;
            }
            // 清理属性：只保留白名单中的属性
            var allowedAttrs = SANITIZE_WHITELIST[tag];
            var attrs = child.attributes;
            for (let j = attrs.length - 1; j >= 0; j--) {
                var attrName = attrs[j].name.toLowerCase();
                var attrValue = attrs[j].value;
                if (allowedAttrs.indexOf(attrName) === -1) {
                    // 移除不在白名单的属性（包括所有 on* 事件属性）
                    child.removeAttribute(attrName);
                } else if ((attrName === 'src' || attrName === 'href') && !_isSafeUrl(attrValue)) {
                    // 移除危险 URL
                    child.removeAttribute(attrName);
                }
            }
            // 递归处理子节点
            _sanitizeDOMNode(child);
        } else if (child.nodeType === 8) {
            // 注释节点：移除
            node.removeChild(child);
        }
        // 文本节点（nodeType 3）安全，保留
    }
}

function sanitizeHtml(html) {
    if (!html) return '';
    var str = String(html);
    // 用 DOMParser 解析为 DOM（不会执行脚本/加载图片）
    var doc;
    try {
        doc = new DOMParser().parseFromString(str, 'text/html');
    } catch (e) {
        // DOMParser 不可用时，退回到全量转义（最安全）
        return escapeHtml(str);
    }
    _sanitizeDOMNode(doc.body);
    return doc.body.innerHTML;
}
// 页面关闭前保存
// 【关键修复】不能用 GlobalCleanup.registerListener 注册，因为 GlobalCleanup.cleanup()
// 在 beforeunload 中先执行，会 removeEventListener 移除本处理器，导致保存逻辑永远不执行。
// 直接用 addEventListener 注册，不被 cleanup 管理，确保退出时一定执行保存。
window.addEventListener('beforeunload', function() {
    try {
        var data = (typeof RuntimeBridge !== 'undefined' && RuntimeBridge.buildSaveData) ? RuntimeBridge.buildSaveData('') : null;
        // 【调试日志】打印退出时保存的关键字段，帮助诊断"加载后内容丢失"问题
        if (data && data.state) {
            try {
                var _dbgParsed = JSON.parse(data.state);
                console.log('[beforeunload] 保存数据: story=' + (_dbgParsed._lastAIReply ? String(_dbgParsed._lastAIReply).substring(0,30)+'...' : '空') +
                    ', choices=' + (_dbgParsed._lastChoices ? _dbgParsed._lastChoices.length + '项' : '空') +
                    ', cot=' + (_dbgParsed._lastCotContent ? String(_dbgParsed._lastCotContent).substring(0,30)+'...' : '空') +
                    ', ui.lastAIReply=' + (_dbgParsed.ui && _dbgParsed.ui.lastAIReply ? '有值' : '空') +
                    ', timestamp=' + (data.timestamp || '无'));
            } catch(_) {}
        }
        // 【P0-4】优先写入 IndexedDB（突破 5MB 限制），beforeunload 中 fire-and-forget
        // 现代浏览器通常允许 IDB 写入在页面卸载期间完成
        if (data && typeof SaveDB !== 'undefined' && SaveDB.kvSet) {
            SaveDB.kvSet(Storage.KEYS.AUTO_SAVE_BACKUP, data).catch(function(){});
        }
        // 【修复】退出时同时写入 slot 0，避免 autoSave 2 秒防抖导致加载到旧回合。
        // 用户在 AI 回复后 2 秒内退出时，slot 0 仍是上一回合，点"加载存档"会丢失当前回合。
        if (data && typeof SaveDB !== 'undefined' && SaveDB.set) {
            SaveDB.set(0, data).catch(function(){});
        }
        // 同时写入 localStorage 作为双保险（仅在数据不太大时）
        if (data) {
            try {
                var dataStr = JSON.stringify(data);
                if (dataStr.length < 2 * 1024 * 1024) { // < 2MB 才写 localStorage
                    Storage.setJSON(Storage.KEYS.AUTO_SAVE_BACKUP, data);
                }
            } catch(lsErr) { /* localStorage 写入失败忽略，IDB 已有数据 */ }
        }
    } catch(e) { console.warn('beforeunload save failed:', e); }
try {
    if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.saveToStorage) {
        EnhancedMemory.saveToStorage();
    }
} catch(memE) {}
// 【P0 性能】强制把 VariableStore defer 队列里的全局变量同步落盘
// 避免 setTimeout(0) 未触发时页面已关闭导致数据丢失
try {
    if (typeof VariableStore !== 'undefined' && VariableStore.flushPersist) {
        VariableStore.flushPersist();
    }
} catch(varE) {}
});

// 【额外保障】页面可见性变化时也保存。
// visibilitychange 在用户切标签/最小化时触发，此时页面仍在运行，localStorage 写入一定成功。
// beforeunload 在关闭/导航时触发，但 IndexedDB 异步写入可能来不及完成。
// 两者结合：visibilitychange → localStorage 同步写入（保证有数据）；beforeunload → IDB + localStorage 双写
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
        try {
            var data = (typeof RuntimeBridge !== 'undefined' && RuntimeBridge.buildSaveData) ? RuntimeBridge.buildSaveData('') : null;
            if (data) {
                // 同步写入 localStorage（visibilitychange 中可以安全使用同步 API）
                try {
                    var dataStr = JSON.stringify(data);
                    if (dataStr.length < 2 * 1024 * 1024) {
                        Storage.setJSON(Storage.KEYS.AUTO_SAVE_BACKUP, data);
                    }
                } catch(lsErr) {}
                // 也尝试写入 IndexedDB（可能来不及完成，但有总比没有好）
                if (typeof SaveDB !== 'undefined' && SaveDB.set) {
                    SaveDB.set(0, data).catch(function(){});
                }
            }
        } catch(e) { console.warn('visibilitychange save failed:', e); }
    }
});
function parseMarkdown(text) {
    if (!text) return '';
    // [T1-P1-5] 先 escapeHtml 转义所有 HTML 特殊字符，防止 AI 返回的 <script>/<img onerror>
    // 等恶意标签原样输出（XSS 修复）。后续 markdown 替换会基于已转义文本安全构造 HTML
    text = (typeof escapeHtml === 'function') ? escapeHtml(String(text)) : String(text);
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}
// --- applyFontSize 适配 ---
function applyFontSize() {
    var storyText = document.getElementById('storyText');
    if (storyText) storyText.style.fontSize = (gameState.fontSize || 16) + 'px';
}


// ========================================
// 第2层: UI基础
// ========================================
// ========================================
// 导航栏渲染
// ========================================
// 导航栏事件委托处理函数（避免重复绑定）
const _navBarClickHandler = function(e) {
    var btn = e.target.closest('.nav-item');
    if (!btn) return;
    var page = btn.dataset.navPage;
    if (!page) return;
    // 更新导航栏按钮高亮状态
    var navContainer = btn.parentElement;
    if (navContainer) {
        navContainer.querySelectorAll('.nav-item').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
    }

    if (typeof closeLogSubPage === 'function') {
        try { closeLogSubPage(); } catch (e) { console.warn('[导航] 关闭日志子页面失败:', e); }
    }
    UI.showPage(page);
    // 延迟渲染，让浏览器先显示页面切换效果
    var renderFn = null;
    if (page === 'playerPage') renderFn = renderPlayerPage;
    else if (page === 'npcPage') renderFn = renderNpcPage;
    else if (page === 'recapPage') renderFn = renderRecapPage;
    else if (page === 'logPage') renderFn = renderLogPage;
    else if (page === 'memoryPage' && typeof MemoryManagerUI !== 'undefined') renderFn = function() { MemoryManagerUI.show(); UI.showPage('memoryPage'); };
    if (renderFn) requestAnimationFrame(function() { renderFn(); });
    // 注：原此处有 5 次 GameLinker.refreshByDataChange() 调用，
    // 但 GameLinker 从未被 register 过（_refreshers 为空），调用本身是空操作，
    // 反而会调度 5×N 个无意义的 rAF 回调，让点击体感卡顿。已移除。
};
function renderNavBar(containerId, tabs, activeIndex) {
    var container = document.getElementById(containerId);
    if (!container) return;
    // 首次渲染时绑定事件委托，避免重复绑定
    if (!container._hasEventDelegate) {
        container.addEventListener('click', _navBarClickHandler);
        container._hasEventDelegate = true;
    }

    var tabsKey = tabs.map(function(t) { return t.page + '|' + t.icon + '|' + t.label; }).join('||');
    if (container._tabsKey === tabsKey) {
        var items = container.querySelectorAll('.nav-item');
        for (let ai = 0; ai < items.length; ai++) {
            if (ai === activeIndex) items[ai].classList.add('active');
            else items[ai].classList.remove('active');
        }
        return;
    }
    container._tabsKey = tabsKey;
    container.innerHTML = tabs.map(function(tab, i) {
        var isActive = i === activeIndex ? ' active' : '';
        return '<button class="nav-item' + isActive + '" data-nav-page="' + tab.page + '">' +
        '<svg class="icon"><use href="#' + tab.icon + '"/></svg>' +
        '<span class="nav-label">' + tab.label + '</span></button>';
    }).join('');
}
// ========================================
// 【导航栈】浏览器返回键拦截
// ========================================
// 页面加载时压入初始历史状态
history.pushState(null, '', location.href);
// 【统一管理】走 GlobalCleanup，页面卸载时统一移除
GlobalCleanup.registerListener(window, 'popstate', function(e) {
    e.preventDefault();
    // 有导航栈条目 → 返回上一级
    if (UI._navStack.length > 0) {
        UI.popNav();
        return;
    }
    // 在剧情页 → 弹确认框是否回主页
    var storyEl = document.getElementById('storyPage');
    if (storyEl && storyEl.classList.contains('active')) {
        history.pushState(null, '', location.href);
        UI.confirm('返回主页', '确定要回到主页吗？当前进度已自动保存。').then(function(yes) {
            if (yes) {
                UI.showPage('menuPage');
                UI._navStack = [];
            }
        });
        return;
    }
    // 其他根页面 → 拦截，不退出页面
    history.pushState(null, '', location.href);
});
function showStoryLoading() {
    // 清理定时器，防止泄漏
    TimerManager.clearInterval('loadingTimer');
    var flavors = ['命运的齿轮转动中...', '世界正在生成...', 'AI正在构思剧情...', '新篇章即将揭晓...'];
    var storyEl = document.getElementById('storyText');
    var optsEl = document.getElementById('optionsContainer');
    if (!storyEl || !optsEl) return;
    // 【P1修复】基于历史生成耗时计算预估等待时间
    var _eta = '';
    try {
        var _times = (typeof window !== 'undefined' && window._genTimeHistory) || [];
        if (_times.length > 0) {
            var _avg = _times.reduce(function(a,b){return a+b;}, 0) / _times.length;
            var _sec = Math.ceil(_avg / 1000);
            _eta = '预计约 ' + _sec + ' 秒';
        }
    } catch(e) {}
    storyEl.innerHTML =
    '<div style="text-align:center;padding:40px 0;display:flex;flex-direction:column;align-items:center;text-indent:0;">' +
    '<div style="display:flex;justify-content:center;gap:10px;margin-bottom:16px;">' +
    '<div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>' +
    '<span style="color:var(--text-secondary);font-size:13px;">' + flavors[Math.floor(Math.random() *
        flavors.length)] + '</span>' +
    '<div style="margin-top:8px;font-size:12px;color:var(--text-tertiary);text-align:center;">已等待 <span id="waitSec">0</span> 秒' + (_eta ? ' · <span style="color:var(--accent);">' + _eta + '</span>' : '') + '</div>' +
    // 【P0 优化】生成进度条（流式接收时显示实际进度）
    '<div id="genProgressContainer" style="display:none;margin-top:14px;width:260px;max-width:80%;">' +
    '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-tertiary);margin-bottom:4px;">' +
    '<span id="genProgressLabel">接收数据中...</span>' +
    '<span id="genProgressPercent">0%</span></div>' +
    '<div style="height:6px;background:var(--bg-secondary);border-radius:3px;overflow:hidden;">' +
    '<div id="genProgressFill" style="height:100%;width:0%;background:linear-gradient(90deg,var(--accent),var(--accent2, #a78bfa));border-radius:3px;transition:width 0.3s ease;"></div></div></div>' +
    // [P2-4] 30s 后显示降级提示；默认 hidden
    '<div id="loadingDegradeHint" style="display:none;margin-top:12px;padding:8px 12px;font-size:12px;color:#8a5a00;background:#fff5d6;border:1px solid #f0d68a;border-radius:6px;text-align:center;line-height:1.5;">ⓘ 网络响应较慢。若长时间无响应，可点击底部「取消」后重试，或检查 API 设置。</div>' +
    '</div>';
    optsEl.innerHTML = '';
    // 重置进度条状态
    window._genProgressStarted = false;
    var sec = 0;
    var degradeShown = false;
    TimerManager.setInterval('loadingTimer', function() {
        sec++;
        var el = document.getElementById('waitSec');
        if (el) el.textContent = sec;
        else {
            TimerManager.clearInterval('loadingTimer');
            return;
        }
        // [P2-4] 30s 后显示降级提示
        if (!degradeShown && sec >= 30) {
            degradeShown = true;
            var hint = document.getElementById('loadingDegradeHint');
            if (hint) hint.style.display = 'block';
        }
}, 1000);
}
function hideStoryLoading() {
    TimerManager.clearInterval('loadingTimer');
    // 【P0 优化】隐藏进度条
    try { updateGenProgress(-1); } catch(e) {}
    var storyEl = document.getElementById('storyText');
    if (storyEl && storyEl.querySelector('.loading-dot')) {
        storyEl.innerHTML = '';
    }
}
function showError(msg, errObj) {
    TimerManager.clearInterval('loadingTimer');
    var el = document.getElementById('storyText');
    if (!el) return;
    // 【调试】如果传入了 Error 对象，把完整堆栈展开
    var stack = '';
    var fileLine = '';
    if (errObj && errObj.stack) {
        stack = errObj.stack;
        // 提取文件名和行号（Firefox 格式: @file:line:col；Chrome 格式: at file:line:col）
        var m = stack.match(/(?:at\s+)?(?:.*?)([^\s()]+):(\d+):(\d+)/);
        if (m) fileLine = m[1] + ':' + m[2];
    }
    // 【智能提示】根据错误关键词给出可点击的快捷操作
    var action = '';
    var low = (msg || '').toLowerCase();
    if (low.indexOf('api key') !== -1 || low.indexOf('认证') !== -1 || low.indexOf('401') !== -1) {
        action = '<button onclick="UI.hideModal(\'settingsModal\');" data-close="settingsModal" style="margin-top:6px;padding:4px 10px;background:#856404;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">前往设置</button>';
    }

    // 仅在没有内容时覆盖；否则在底部追加错误提示条
    var hasContent = el && el.innerHTML && el.innerHTML.trim() && el.innerHTML.indexOf('loading-dot') === -1;
    var errBanner = '<div class="api-error-banner" data-error-ts="' + Date.now() + '" style="background:var(--accent-soft);border:1px solid var(--border);border-radius:6px;padding:12px;margin:12px 0;color:var(--text);font-size:13px;transition:opacity 0.5s;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;"><span style="font-weight:600;">△ 生成失败</span><button onclick="this.closest(\'.api-error-banner\').remove()" style="background:none;border:none;color:var(--text);cursor:pointer;font-size:16px;line-height:1;padding:0 4px;">✕</button></div>' +
        '<div style="margin-bottom:6px;">' + escapeHtml(msg) + '</div>' +
        (fileLine ? '<div style="font-size:11px;color:#d35400;margin-bottom:4px;">◎ 位置: ' + escapeHtml(fileLine) + '</div>' : '') +
        action +
        '<details style="font-size:11px;color:var(--text-secondary);"><summary style="cursor:pointer;color:var(--text-secondary);">查看完整堆栈</summary><pre style="white-space:pre-wrap;word-break:break-all;margin-top:6px;padding:8px;background:var(--bg-secondary);border-radius:4px;">' + escapeHtml(stack || msg) + '</pre></details>' +
        '</div>';
    if (hasContent) {
        el.insertAdjacentHTML('beforeend', errBanner);
    } else {
        // 真正空时才覆盖
        // [BUG-008 修复] 生成失败后添加重试按钮，让用户可以方便地重新生成
        el.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--danger);">' +
            '<div style="font-size:16px;margin-bottom:8px;">△ 生成失败</div>' +
            '<div style="font-size:14px;color:var(--text-secondary);margin-bottom:16px;">' + escapeHtml(msg) + '</div>' +
            (fileLine ? '<div style="font-size:11px;color:#d35400;margin-bottom:8px;">◎ 错误位置: ' + escapeHtml(fileLine) + '</div>' : '') +
            (action ? '<div style="margin-bottom:12px;">' + action + '</div>' : '') +
            // [BUG-008 修复] 添加重试按钮，点击后调用重新生成
            '<div style="margin-bottom:12px;"><button onclick="if(typeof regenerateLastTurn===\'function\'){regenerateLastTurn();}else{location.reload();}" style="padding:8px 20px;background:var(--accent, #6366f1);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">🔄 重新生成</button></div>' +
            '<details style="font-size:11px;color:var(--text-tertiary);text-align:left;"><summary style="cursor:pointer;">查看完整堆栈</summary><pre style="white-space:pre-wrap;word-break:break-all;padding:8px;background:var(--bg-secondary);border-radius:4px;">' + escapeHtml(stack || msg) + '</pre></details>' +
            '<div style="font-size:12px;color:var(--text-tertiary);margin-top:8px;">请检查网络连接和API设置后重试</div>' +
            '</div>';
    }
    // 原版行为：错误信息持久显示，用户可以从容阅读完整错误后手动关闭
    // 新版的3秒自动淡出会让用户错过错误信息，对"生成失败"等需要决策的错误不友好
    // banner 右上角已有 ✕ 按钮可手动关闭，无需自动淡出
    // 同步记录到 localStorage 方便排查
    try {
        var errs = Storage.getJSON(Storage.KEYS.API_ERRORS, []);
        errs.push({ msg: msg, fileLine: fileLine, stack: stack, time: Date.now() });
        if (errs.length > 20) errs = errs.slice(-20);
        Storage.setJSON(Storage.KEYS.API_ERRORS, errs);
    } catch (e) {}
}
// --- 章节标题更新 ---
function updateSceneTitle(title) {
    var titleEl = document.getElementById('storySceneTitle');
    if (titleEl && title) {
        titleEl.textContent = title;
    }

    // 旧实现把回合数塞进 sceneTitle 的 fallback，AI 一旦返回 title 就会覆盖回合数显示
    if (typeof updateTurnLabel === 'function') updateTurnLabel();
}


// 把回合数显示在 storySceneLabel（原"AI实时生成"占位），与 sceneTitle 解耦：
// - storySceneTitle：显示 AI 返回的标题（如"午夜的低语"），无标题时回退到"第 N 回合"
// - storySceneLabel：永远显示"第 N 回合"，无论 AI 是否返回标题
// 这样即使 AI 返回标题，玩家也能持续看到当前回合数，避免 BUG-007 的"标题覆盖回合数"问题
function updateTurnLabel() {
    var labelEl = document.getElementById('storySceneLabel');
    if (!labelEl) return;
    var turn = 0;
    if (typeof StateManager !== 'undefined' && StateManager.get) {
        turn = StateManager.get('progress.turn') || 0;
    } else if (typeof gameState !== 'undefined' && gameState && gameState._stats) {
        turn = gameState._stats.totalTurns || 0;
    }
    labelEl.textContent = '第 ' + turn + ' 回合';
}
var _autoSaveTimer = null;

// 所有写路径（autoSave / saveToSlot / loadFromSlot / import / export / restore）串行化，
// 防止并发写入导致存档损坏；同时增加超时保险，避免一次死锁永久卡死。
var _saveLock = Promise.resolve();
var _saveLockState = {
    holder: null,
    startTime: 0,
    depth: 0
};
var SAVE_LOCK_TIMEOUT = 300000; // 5 分钟强制释放（避免长写入/大模型推理期间误释放）

function withSaveLock(fn, label) {
    label = label || 'unnamed';
    var run = _saveLock.then(function() {
        if (_saveLockState.depth > 0) {
            console.warn('[SaveLock] 检测到重入: ' + label + '，当前持有者: ' + _saveLockState.holder);
        }
        _saveLockState.holder = label;
        _saveLockState.startTime = Date.now();
        _saveLockState.depth++;
        return fn();
    }, function() {
        // 前序操作失败也不阻塞后续操作
        _saveLockState.holder = label;
        _saveLockState.startTime = Date.now();
        _saveLockState.depth++;
        return fn();
    });

    _saveLock = run.then(
        function(result) {
            _saveLockState.depth = Math.max(0, _saveLockState.depth - 1);
            if (_saveLockState.depth === 0) {
                _saveLockState.holder = null;
                _saveLockState.startTime = 0;
            }
            return result;
        },
        function(err) {
            _saveLockState.depth = Math.max(0, _saveLockState.depth - 1);
            if (_saveLockState.depth === 0) {
                _saveLockState.holder = null;
                _saveLockState.startTime = 0;
            }
            throw err;
        }
    );

    // 【P0修复】超时仅告警，不再强制重置状态计数器
    // 强制重置 depth 会导致新旧保存操作并发写入 IndexedDB，可能造成存档损坏
    var timeoutLabel = 'saveLockTimeout_' + label + '_' + Date.now();
    TimerManager.setTimeout(timeoutLabel, function() {
        if (_saveLockState.holder === label && (Date.now() - _saveLockState.startTime) >= SAVE_LOCK_TIMEOUT) {
            console.error('[SaveLock] 锁超时告警（不重置状态，避免并发写入）:', label,
                'depth=' + _saveLockState.depth + ', held=' + (Date.now() - _saveLockState.startTime) + 'ms');
            // 仅重置 holder 和 startTime，保留 depth 防止并发写入
            // 如果 pending 操作自然完成，withSaveLock 的 finally 块会正常释放锁
            _saveLockState.holder = null;
            _saveLockState.startTime = 0;
        }
    }, SAVE_LOCK_TIMEOUT + 100);

    return run;
}

async function autoSave() {
    if (_autoSaveTimer) return; // 防抖：已有待执行的保存，跳过
    // 加载中不自动保存，但设置超时保护防止 _loading 标志永久卡住导致存档丢失
    if (typeof gameState !== 'undefined' && gameState && gameState._loading) {
        if (gameState._loadingSince && (Date.now() - gameState._loadingSince > 10000)) {
            console.warn('[autoSave] _loading 超过10秒，强制清除并继续保存');
            gameState._loading = false;
            gameState._loadingSince = null;
        } else {
            return;
        }
    }
    _autoSaveTimer = TimerManager.setTimeout('autoSave', async function() {
        _autoSaveTimer = null;
        // 【第5轮优化】await 外层加 try-catch，避免 withSaveLock reject 冒泡为 unhandledrejection
        try {
            await withSaveLock(async function() {
        try {
            // 存储空间预警
            if (typeof StorageMonitor !== 'undefined') {
                var cap = StorageMonitor.checkCapacity();
                if (cap.percentage > 80) {
                    UI.toast('存储空间已用 ' + Math.round(cap.percentage) + '%，建议导出旧存档后清理');
                }
            }
            // 【顶栏指示】自动存档开始：显示动画中的小绿点
            var dot = document.getElementById('autoSaveDot');
            if (dot) {
                dot.style.display = '';
                dot.style.animation = 'pulse 0.9s ease-in-out infinite';
            }
            if (typeof SaveDB !== 'undefined') {

                // 【P0修复】保存前同步 UI 直写的 legacy 字段到 StateManager
                if (typeof StateManager !== 'undefined' && StateManager._syncFromLegacy) {
                    try { StateManager._syncFromLegacy(); } catch (e) { console.warn('[autoSave] _syncFromLegacy 失败:', e); }
                }

                // 修复：data 为 null 时跳过本次写入，保留上一次的有效自动存档
                var _autoSaveData = null;
                try {
                    _autoSaveData = (typeof RuntimeBridge !== 'undefined' && RuntimeBridge.buildSaveData) ? RuntimeBridge.buildSaveData('', true) : null;
                } catch (buildErr) {
                    // buildSaveData 内部访问 gameState 字段可能抛错（如 _stats 未初始化）
                    // 包装为 Error 并打印完整信息，避免被序列化为空对象 {}
                    var _wrappedBuild = (buildErr instanceof Error) ? buildErr : new Error('buildSaveData 抛出非 Error: ' + String(buildErr));
                    console.error('[自动保存] buildSaveData 失败:', _wrappedBuild.message, _wrappedBuild.stack || _wrappedBuild);
                    _autoSaveData = null;
                }
                if (_autoSaveData !== null && _autoSaveData !== undefined) {

                    await SaveDB.set(0, _autoSaveData);
                }
            }
            // 【顶栏指示】自动存档完成：显示一秒钟后淡出
            if (dot) {
                TimerManager.setTimeout('autoSaveDotHide', function() {
                    if (!dot) return;
                    dot.style.animation = '';
                    TimerManager.setTimeout('autoSaveDotFade', function() {
                        if (dot) dot.style.display = 'none';
                    }, 1200);
                }, 300);
            }
    } catch (e) {
    // 【ISSUE-002 修复】原 console.error('...:', e) 在 e 为非 Error 对象（如 Promise reject 的普通对象）
    // 时只打印 {}，无法定位根因。改为打印完整信息：message + stack + JSON。
    var _errInfo = (e instanceof Error)
        ? (e.message + '\n' + (e.stack || ''))
        : ('非 Error 对象: ' + (typeof e) + ' -> ' + (function() {
            try { return JSON.stringify(e); } catch(_) { return String(e); }
        })());
    console.error('[自动保存] 保存失败:', _errInfo);
    // 失败时也隐藏指示器
    var dot2 = document.getElementById('autoSaveDot');
    if (dot2) dot2.style.display = 'none';
}
        }, 'autoSave');
        } catch (_outerErr) {
            // 【ISSUE-002 修复】外层异常同样打印完整信息，避免 {} 空对象
            var _outerInfo = (_outerErr instanceof Error)
                ? (_outerErr.message + '\n' + (_outerErr.stack || ''))
                : ('非 Error 对象: ' + (typeof _outerErr) + ' -> ' + (function() {
                    try { return JSON.stringify(_outerErr); } catch(_) { return String(_outerErr); }
                })());
            console.error('[自动保存] 外层异常:', _outerInfo);
            var _dot3 = document.getElementById('autoSaveDot');
            if (_dot3) _dot3.style.display = 'none';
        }
}, 2000);
}
function safeAbort() { if (window._currentAbort) { try { window._currentAbort.abort(); } catch(e){} } }

// 更新状态栏文本（如 429 重试提示），不影响 active 状态
function updateGenStatus(text) {
    if (typeof document === 'undefined') return;
    var el = document.getElementById('genStatusText');
    if (el) el.textContent = text || '';  // [BUG-001 修复] 空文本时清空而非默认显示"正在生成..."
}

// 【P0 优化】更新生成进度条（流式接收时显示实际进度）
// progress: 0-100 的整数百分比，-1 表示隐藏进度条
// label: 进度条左侧标签文本
function updateGenProgress(progress, label) {
    if (typeof document === 'undefined') return;
    var container = document.getElementById('genProgressContainer');
    var fill = document.getElementById('genProgressFill');
    var percent = document.getElementById('genProgressPercent');
    var labelEl = document.getElementById('genProgressLabel');
    if (progress < 0 || !container) {
        if (container) container.style.display = 'none';
        window._genProgressStarted = false;
        return;
    }
    // 首次显示进度条
    if (!window._genProgressStarted) {
        window._genProgressStarted = true;
        container.style.display = 'block';
    }
    var p = Math.min(100, Math.max(0, Math.round(progress)));
    if (fill) fill.style.width = p + '%';
    if (percent) percent.textContent = p + '%';
    if (labelEl && label) labelEl.textContent = label;
}

// 缓存 setWaiting 重复 DOM 查询的元素引用
// [M-6] 修复缓存 stale reference：单页应用切换视图后旧 DOM 节点会被卸载，
// 缓存的引用还在但已脱离 document，下次操作抛错或无效。
// 修复策略：每次调用前验证 element.isConnected，false 时清空 cache 强制重新查询。
// 命中 connected 路径仍走 cache（性能保留），仅在切换视图/卸载时付出一次重查成本。
var _setWaitingCache = {
    input: null,
    sendBtn: null,
    genControl: null,
    progressBar: null,
    initialized: false
};

function _refreshSetWaitingCache() {
    _setWaitingCache.input = document.getElementById('customAction');
    _setWaitingCache.sendBtn = document.getElementById('btnSendAction');
    _setWaitingCache.genControl = document.getElementById('genControl');
    _setWaitingCache.progressBar = document.getElementById('genProgressBar');
    _setWaitingCache.initialized = true;
}

function _getSetWaitingEl(key) {
    if (!_setWaitingCache.initialized) {
        _refreshSetWaitingCache();
    } else {
        // stale 防御：cache 中任一元素若已脱离 document（如视图切换），全量重查
        var sample = _setWaitingCache[key];
        if (sample && typeof sample.isConnected === 'boolean' && !sample.isConnected) {
            _setWaitingCache.initialized = false;
            _refreshSetWaitingCache();
        }
    }
    return _setWaitingCache[key];
}

function setWaiting(w) {
    // 原版每次都完整执行所有 UI 状态恢复，不存在短路导致的 UI 卡死
    // 新版引入的短路返回会导致 finally 块中的 setWaiting(false) 被跳过，
    // 造成 genControl/progressBar/input.disabled 等残留不清理

    // 便于将来挂通知/订阅机制时只需要在 RuntimeState 上加 _notify('isWaiting')
    // 同时与同文件 resetRuntimeState() 内 `RuntimeState.isWaiting = false` 风格一致
    RuntimeState.isWaiting = w;


    // [M-6] 改走 _getSetWaitingEl 防御 stale reference（缓存元素已被视图切换卸载）
    var input = _getSetWaitingEl('input');
    var sendBtn = _getSetWaitingEl('sendBtn');
    if (input) input.disabled = w;
    if (sendBtn) sendBtn.disabled = w;

    // 确保用户不会看到上一轮未清空的输入。提交时的清空（input.value=''）
    // 理论上已生效，此处作为防御性兜底，避免极端时序下文本残留导致误重复提交。
    if (!w && input && input.value) {
        input.value = '';
    }


    // CSS 用 .is-waiting .option-btn { pointer-events: none; opacity: .5; } 接管
    // 这样避免每 tick 扫描整个 DOM
    if (w) document.body.classList.add('is-waiting');
    else document.body.classList.remove('is-waiting');

    // 显示/隐藏生成控制条
    var genControl = _getSetWaitingEl('genControl');
    if (genControl) {
        if (w) genControl.classList.add('active');
        else genControl.classList.remove('active');
    }
    // [BUG-001 修复] 结束等待时清空状态文本，而非设置为"正在生成..."
    // 原代码: if (!w) updateGenStatus('正在生成...');
    // 问题: 生成结束后仍显示"正在生成..."，误导用户
    if (!w) {
        updateGenStatus('');
    } else {
        // 【BUG-006 修复】开始等待时显示加载状态文本，让用户明确知道正在生成
        updateGenStatus('正在生成...');
    }
    // 显示/隐藏流式输出进度条
    var progressBar = _getSetWaitingEl('progressBar');
    if (progressBar) {
        if (w) progressBar.classList.add('active');
        else progressBar.classList.remove('active');
    }
}

// ========================================
// 第3层: AI核心
// ========================================
// ========================================
// AI调用函数（替代 GameAPI.call）
// ========================================


// 同时作为 truthy 判定参考（频率/存在惩罚是 OpenAI 标准参数，按非零决定是否发送）
var SKIP_DEFAULTS = {
    top_k: 0, min_p: 0, top_a: 0,
    repetition_penalty: 1, typical_p: 1, tfs: 1,
    mirostat_mode: 0, repetition_penalty_range: 0, repetition_penalty_slope: 0,
    epsilon_cutoff: 0, eta_cutoff: 0, dry_multiplier: 0, xtc_probability: 0,
    tool_reasoning_mode: 'disabled'
};


var VALID_REASONING_EFFORT = ['low', 'medium', 'high', 'auto'];


// 显式判断字段，避免 translateError 对 undefined 返回 undefined 时链式调用炸掉
function extractErrorMessage(errObj, fallback) {
    if (!errObj) return fallback;
    if (errObj.message) {
        var m = translateError(errObj.message);
        if (m) return m;
    }
    if (errObj.code) {
        var c = translateError(errObj.code);
        if (c) return c;
    }
    if (errObj.type) {
        var t = translateError(errObj.type);
        if (t) return t;
    }
    if (errObj.error) {
        var e = translateError(errObj.error);
        if (e) return e;
    }
    return fallback;
}

// 把 PresetManager 当前预设里的"高级采样参数"合并到 presetParams
// 这些参数是 PresetManager.getParams() 没暴露的，需要手动取

function _mergePresetField(target, source, key, type, defaultVal, check) {
    var sv = source[key];
    if (sv == null) return;
    if (check === 'undefined') {
        if (target[key] !== undefined) return;
    } else if (check === 'ne') {
        if (sv === defaultVal) return;
    } else if (check === 'positive') {
        var _nv = Number(sv);
        if (!_nv || _nv <= 0) return;
    }
    if (type === 'string') target[key] = String(sv);
    else if (type === 'number') target[key] = Number(sv) || defaultVal;
}

function mergeAdvancedPresetParams(presetParams) {
    if (typeof PresetManager === 'undefined') return;
    if (!PresetManager.presets || PresetManager.currentPresetIndex < 0) return;
    var _curPreset = PresetManager.presets[PresetManager.currentPresetIndex];
    if (!_curPreset || !_curPreset.params) return;
    var _pp = _curPreset.params;
    _mergePresetField(presetParams, _pp, 'top_k', 'number', 0, 'undefined');
    _mergePresetField(presetParams, _pp, 'top_a', 'number', 0, 'undefined');
    _mergePresetField(presetParams, _pp, 'min_p', 'number', 0, 'undefined');
    _mergePresetField(presetParams, _pp, 'repetition_penalty', 'number', 1, 'ne');
    _mergePresetField(presetParams, _pp, 'typical_p', 'number', 1, 'ne');
    _mergePresetField(presetParams, _pp, 'tail_free_sampling', 'number', 1, 'ne');
    _mergePresetField(presetParams, _pp, 'mirostat_mode', 'number', 0, 'ne');
    _mergePresetField(presetParams, _pp, 'mirostat_tau', 'number', 5.0, 'ne');
    _mergePresetField(presetParams, _pp, 'mirostat_eta', 'number', 0.1, 'ne');
    _mergePresetField(presetParams, _pp, 'dry_multiplier', 'number', 0, 'ne');
    _mergePresetField(presetParams, _pp, 'xtc_probability', 'number', 0, 'ne');
    _mergePresetField(presetParams, _pp, 'reasoning_effort', 'string');
    _mergePresetField(presetParams, _pp, 'seed', 'number', null);
    _mergePresetField(presetParams, _pp, 'max_tokens', 'number', 0, 'positive');
}


function filterRequestParams(params) {
    var filtered = {};
    for (let key in params) {
        if (!Object.prototype.hasOwnProperty.call(params, key)) continue;
        var val = params[key];
        if (val === null || val === undefined) continue;
        // 表驱动默认值过滤
        if (Object.prototype.hasOwnProperty.call(SKIP_DEFAULTS, key) && val === SKIP_DEFAULTS[key]) continue;
        filtered[key] = val;
    }

    //              不要把预设里的非标值（"default" / "minimal" / "thinking_mode" 等）当非法值删掉
    //              否则中转站收不到这个参数，会回退到默认的"高思考"模式导致生成变慢
    if (filtered.reasoning_effort) {
        var _re = String(filtered.reasoning_effort).toLowerCase().trim();
        // 明显是脏数据：空串、undefined 字面量、纯数字 → 删
        if (!_re || _re === 'undefined' || _re === 'null' || /^\d+$/.test(_re)) {
            console.warn('[API] reasoning_effort 值无效已过滤:', filtered.reasoning_effort);
            delete filtered.reasoning_effort;
        }
    }
    return filtered;
}


// 兼容模式（compatibleMode）只发 OpenAI 标准 4 大参数 + 可选 freq/presence
// 正常模式发完整高级采样参数（中转站自己挑能用哪些）
function buildAIRequestBody(messages, options, config) {
    if (typeof PresetManager === 'undefined') {
        throw new Error('PresetManager 未初始化');
    }
    var presetParams = PresetManager.getParams();
    mergeAdvancedPresetParams(presetParams);

    var isCompatibleMode = config.compatibleMode === true;
    if (isCompatibleMode) {
        console.log('[API] 使用兼容模式，发送基本参数+反重复参数(DRY/min_p)');
    }

    // 基础参数（兼容模式只发这些）
    // 【修复】max_tokens 优先使用 getEffectiveMaxTokens() 的自动计算值（基于 wcMax），
    // 仅当自动计算值无效时才回退到预设值
    var _effectiveMaxTokens = (typeof getEffectiveMaxTokens === 'function') ? getEffectiveMaxTokens() : 0;
    var _apiMaxTokens = _effectiveMaxTokens > 0 ? _effectiveMaxTokens : (presetParams.max_tokens || 4096);
    var params = {
        model: config.model || '',
        messages: messages,
        temperature: presetParams.temperature,
        max_tokens: _apiMaxTokens,
        top_p: presetParams.top_p
    };

    // 【BUG修复】兼容模式也发送关键反重复参数（DRY/min_p/repetition_penalty）
    // 原实现在兼容模式下完全跳过这些参数，导致反重复改进无效
    // 大多数现代API提供商（包括中转站）都支持或忽略未知参数，不会报错
    if (isCompatibleMode) {
        if (presetParams.dry_multiplier && presetParams.dry_multiplier > 0) {
            params.dry_multiplier = presetParams.dry_multiplier;
            params.dry_base = presetParams.dry_base || 1.75;
            params.dry_allowed_length = presetParams.dry_allowed_length || 2;
        }
        if (presetParams.min_p && presetParams.min_p > 0) {
            params.min_p = presetParams.min_p;
        }
        if (presetParams.repetition_penalty && presetParams.repetition_penalty !== 1) {
            params.repetition_penalty = presetParams.repetition_penalty;
        }
    }

    // 【P1 修复】DeepSeek 等推理模型需要额外 headroom 容纳 reasoning tokens
    // reasoning tokens 与 output tokens 共享 max_tokens 预算，需要预留空间
    // 【BUG-026 修正】iamhc.cn 代理的 DeepSeek-V4-Flash 也会返回 reasoning_content，
    // 因此保留对所有 DeepSeek 模型的 max_tokens 预留，避免推理token吃满输出预算
    // 【动态化修复】移除 DEFAULT_MAX_TOKENS 硬编码封顶，改为仅乘 1.5 倍预留 reasoning 空间
    // 【增强】使用 ModelRegistry 识别所有推理模型，不再仅限 DeepSeek
    // 实际上限由 contextSize - inputTokens 动态约束（buildAIRequestBody 中的裁剪逻辑）
    var _modelLower = (config.model || '').toLowerCase();
    var _isReasoningModel = /deepseek/.test(_modelLower);
    // 通过 ModelRegistry 检测更多推理模型（o1, o3, 等）
    if (!_isReasoningModel && typeof ModelRegistry !== 'undefined') {
        _isReasoningModel = ModelRegistry.isReasoningModel(config.model || '');
    }
    if (_isReasoningModel && params.max_tokens > 0) {
        var _origMax = params.max_tokens;
        // reasoning tokens 通常占 20-40% 预算，这里预留 50% headroom
        // 不再用 DEFAULT_MAX_TOKENS 封顶，让上下文窗口动态决定实际可用空间
        params.max_tokens = Math.floor(_origMax * 1.5);
        console.log('[API] 推理模型(' + _modelLower + ')：max_tokens ' + _origMax + ' → ' + params.max_tokens + ' (预留 reasoning 空间)');
    }

    if (!isCompatibleMode) {
        // 正常模式：补完整高级采样参数
        params.top_k = presetParams.top_k || 0;
        params.frequency_penalty = presetParams.frequency_penalty;
        params.presence_penalty = presetParams.presence_penalty;
        params.min_p = presetParams.min_p || 0;
        params.top_a = presetParams.top_a || 0;
        params.repetition_penalty = presetParams.repetition_penalty || 1;
        params.typical_p = presetParams.typical_p || 1;
        params.min_length = presetParams.min_length || 0;
        params.max_time = presetParams.max_time || null;
        params.mirostat_mode = presetParams.mirostat_mode || 0;
        params.mirostat_tau = presetParams.mirostat_tau || 5.0;
        params.mirostat_eta = presetParams.mirostat_eta || 0.1;
        params.repetition_penalty_range = presetParams.repetition_penalty_range || 0;
        params.repetition_penalty_slope = presetParams.repetition_penalty_slope || 0;
        params.tfs = presetParams.tail_free_sampling || 1;
        params.epsilon_cutoff = presetParams.epsilon_cutoff || 0;
        params.eta_cutoff = presetParams.eta_cutoff || 0;
        params.dry_multiplier = presetParams.dry_multiplier || 0;
        params.dry_range = presetParams.dry_range || 0;
        params.dry_allowed_length = presetParams.dry_allowed_length || 2;
        params.xtc_probability = presetParams.xtc_probability || 0;
        params.xtc_threshold = presetParams.xtc_threshold || 0;
        params.seed = presetParams.seed || null;
        // response_format 优先级：预设手动配置 > options.jsonSchema 自动推导 > null
        // 预设里手动配的 response_format 优先级最高，不被覆盖（尊重高级用户配置）
        if (presetParams.response_format) {
            params.response_format = presetParams.response_format;
        } else if (options.jsonSchema) {
            // options.jsonSchema: 'strict' | 'json_object' | 'auto' | null
            // 由调用方（game.js 剧情生成）根据 pureTextMode 决定传什么
            var _schemaMode = options.jsonSchema;
            var _modelName = config.model || '';
            // 【降级机制】若上一轮 strict/json_object 触发 400，读取降级标志位
            // _jsonSchemaDowngrade: 'json_object' 表示已从 strict 降级，null 表示无降级
            var _downgrade = (typeof gameState !== 'undefined' && gameState) ? gameState._jsonSchemaDowngrade : null;
            if (_downgrade === 'off') {
                // 连 json_object 都失败了，本轮完全关闭 schema
                _schemaMode = null;
                console.log('[API] response_format 关闭（此前 json_object 也失败）');
            } else if (_downgrade === 'json_object') {
                // strict 失败过，降级为 json_object
                _schemaMode = 'json_object';
                console.log('[API] response_format 降级为 json_object（此前 strict 失败）');
            } else if (_schemaMode === 'auto') {
                // auto 模式：根据模型名自动选 strict 或 json_object
                if (typeof AIOutputJSONSchema !== 'undefined' &&
                    AIOutputJSONSchema.isStrictSupported(_modelName)) {
                    _schemaMode = 'strict';
                } else if (typeof AIOutputJSONSchema !== 'undefined' &&
                           AIOutputJSONSchema.isJsonObjectSupported(_modelName)) {
                    _schemaMode = 'json_object';
                } else {
                    _schemaMode = null;
                }
            }
            if (_schemaMode && typeof AIOutputJSONSchema !== 'undefined') {
                var _rf = AIOutputJSONSchema.buildResponseFormat(_schemaMode);
                if (_rf) {
                    params.response_format = _rf;
                    console.log('[API] response_format = ' + _schemaMode + ' (model=' + _modelName + ')');
                }
            } else {
                params.response_format = null;
            }
        } else {
            params.response_format = null;
        }
        params.modalities = presetParams.modalities || null;
        params.tool_reasoning_mode = presetParams.tool_reasoning_mode || 'disabled';
        params.reasoning_effort = presetParams.reasoning_effort || null;
    } else {

        // 其他中转站可能拒绝的高级采样参数统统不发
        if (presetParams.frequency_penalty && presetParams.frequency_penalty !== 0) {
            params.frequency_penalty = presetParams.frequency_penalty;
        }
        if (presetParams.presence_penalty && presetParams.presence_penalty !== 0) {
            params.presence_penalty = presetParams.presence_penalty;
        }
    }

    if (presetParams.stop_sequences) {
        params.stop = presetParams.stop_sequences;
    }

    // options 中的采样参数覆盖预设
    if (options.max_tokens != null) params.max_tokens = options.max_tokens;
    if (options.temperature != null) params.temperature = options.temperature;  // [CP-09] 恢复被错误删除的覆盖
    if (options.top_p != null) params.top_p = options.top_p;
    if (options.top_k != null) params.top_k = options.top_k;
    if (options.frequency_penalty != null) params.frequency_penalty = options.frequency_penalty;
    if (options.presence_penalty != null) params.presence_penalty = options.presence_penalty;
    if (options.stop != null) params.stop = options.stop;

    var filtered = filterRequestParams(params);
    if (options.stream) filtered.stream = true;

    // 注意：不硬钳制到 1.0——OpenAI 官方支持 0-2，部分模型（如 Gemini/DeepSeek）支持更高
    // 真正的越界报错由 API 自己返回 400，调用方会通过 tryWithFallback 切换配置重试
    if (filtered.temperature != null) {
        var tp = Number(filtered.temperature);
        if (!isFinite(tp) || tp < 0) {
            console.warn('[API] temperature 异常值已移除，使用模型默认:', filtered.temperature);
            delete filtered.temperature;
        }
    }

    // 硬编码 4096 会让长篇叙事预设（如 30000 token 的 Gemini 预设）全部失效
    // 现在只做"防止明显错误"的兜底：负数、0、非数字修正为模型默认（不传 max_tokens）
    // 上限交给 contextSize 动态约束（在 buildAIRequestBody 调用方处理），不在这里硬编码
    if (filtered.max_tokens != null) {
        var mt = Number(filtered.max_tokens);
        if (!isFinite(mt) || mt <= 0) {
            // 负数/0/NaN/Infinity：删除字段，让 API 用模型默认值
            console.warn('[API] max_tokens 异常值已移除，使用模型默认:', filtered.max_tokens);
            delete filtered.max_tokens;
        }
    }

    // P1 修复 BUG-006：max_tokens 裁剪应基于"剩余可用 token"而非 contextSize 本身
    // 原逻辑：max_tokens = min(max_tokens, contextSize)
    //   错误：当输入已占用 80% context 时，max_tokens 仍可能=ctxSize 导致输出超限
    // 正确：max_tokens = min(max_tokens, contextSize - inputTokens - 100)  // 100 留安全余量
    // 最低保证 500 输出空间，避免 max_tokens 过小导致回复被截断
    if (filtered.max_tokens != null) {
        var ctxSize = getContextSizeSafe();
        if (ctxSize > 0) {
            var mt2 = Number(filtered.max_tokens);
            // 估算输入 tokens：累加 messages 中各 message content 长度
            var inputTokens = 0;
            if (Array.isArray(messages)) {
                for (var mi = 0; mi < messages.length; mi++) {
                    var msg = messages[mi];
                    if (!msg) continue;
                    var content = msg.content || '';
                    if (typeof content === 'string') {
                        inputTokens += (typeof estimateTokensUtil === 'function')
                            ? estimateTokensUtil(content)
                            : Math.ceil(content.length / 4);
                    }
                }
            }
            var effectiveMax = ctxSize - inputTokens - 100; // 留 100 tokens 安全余量
            if (effectiveMax < 500) effectiveMax = 500;     // 最低保证 500 输出空间
            if (mt2 > effectiveMax) {
                console.warn('[API] max_tokens(' + mt2 + ') 超过剩余空间(' + effectiveMax + ' = ctx ' + ctxSize + ' - input ' + inputTokens + ' - 100)，已裁剪');
                filtered.max_tokens = effectiveMax;
                // 【BUG-003 修复】记录截断信息，UI 端可基于此判断是否需要追加"已截断"提示
                try {
                    if (typeof window !== 'undefined') {
                        window._lastMaxTokensTruncated = {
                            requested: mt2,
                            effective: effectiveMax,
                            contextSize: ctxSize,
                            inputTokens: inputTokens,
                            timestamp: Date.now()
                        };
                    }
                } catch (e) {}
                if (typeof UI !== 'undefined' && UI.toast) {
                    UI.toast('输出长度受上下文限制（已自动裁剪 ' + (mt2 - effectiveMax) + ' tokens）', 4000);
                }
            } else if (mt2 > ctxSize) {
                // 兜底：max_tokens 绝对不能超过 contextSize
                console.warn('[API] max_tokens(' + mt2 + ') 超过 contextSize(' + ctxSize + ')，已裁剪');
                filtered.max_tokens = ctxSize;
                try {
                    if (typeof window !== 'undefined') {
                        window._lastMaxTokensTruncated = {
                            requested: mt2,
                            effective: ctxSize,
                            contextSize: ctxSize,
                            inputTokens: inputTokens,
                            timestamp: Date.now()
                        };
                    }
                } catch (e) {}
            }
        }
    }
    // 注：不再强制下限 512——某些模型支持小 max_tokens 做摘要，应由调用方/预设决定

    // [P1优化] Prompt Cache：对系统提示添加 cache_control 标记
    // 如果中转站/模型支持（如Claude/OpenRouter），会缓存系统提示减少重复Token消耗
    // 不支持的服务商会忽略此字段，无副作用
    if (filtered.messages && Array.isArray(filtered.messages)) {
        var _model = (config && config.model) || '';
        var _supportCache = /claude|anthropic|openrouter/i.test(_model);
        if (_supportCache) {
            // 找到第一条 system 消息，添加 cache_control
            for (var _ci = 0; _ci < filtered.messages.length; _ci++) {
                if (filtered.messages[_ci] && filtered.messages[_ci].role === 'system') {
                    var _sysMsg = filtered.messages[_ci];
                    // 如果content是字符串，转为带cache_control的结构
                    if (typeof _sysMsg.content === 'string') {
                        _sysMsg.content = [{
                            type: 'text',
                            text: _sysMsg.content,
                            cache_control: { type: 'ephemeral' }
                        }];
                    } else if (Array.isArray(_sysMsg.content) && _sysMsg.content.length > 0) {
                        // 已是数组结构，给最后一段加 cache_control
                        var _lastBlock = _sysMsg.content[_sysMsg.content.length - 1];
                        if (!_lastBlock.cache_control) {
                            _lastBlock.cache_control = { type: 'ephemeral' };
                        }
                    }
                    break; // 只缓存第一条system消息
                }
            }
        }
    }

    return filtered;
}


// 【P1-2 流式渐进渲染】从累积的流式文本中提取部分 story 字段内容
// 用途：JSON 流式响应未完成时，提前提取 story 字段并渲染到 UI，提升用户感知速度
// 注意：此函数仅用于实时渲染预览，不影响最终解析（最终仍用完整 JSON 解析）
// 正则匹配未闭合的 story 字段值（支持部分内容，无需等待闭合引号）
// 兼容 ES5：使用 var、function 声明，避免 let/const/箭头函数
var _partialStoryRegex = /"story"\s*:\s*"((?:[^"\\]|\\.)*)/;
function _extractPartialStory(accumulatedText) {
    if (!accumulatedText || typeof accumulatedText !== 'string') return '';
    // 快速预筛：仅当文本包含 "story" 字段时才进入正则匹配，避免无谓开销
    if (accumulatedText.indexOf('"story"') === -1) return '';
    var match = _partialStoryRegex.exec(accumulatedText);
    if (!match || !match[1]) return '';
    var raw = match[1];
    // 解析 JSON 字符串转义字符：\n \t \r \b \f \" \\ \/ \uXXXX
    // 仅处理常见转义；未识别的转义保留反斜杠+字符原样
    var result = '';
    var i = 0;
    var len = raw.length;
    while (i < len) {
        var ch = raw.charAt(i);
        if (ch === '\\' && i + 1 < len) {
            var next = raw.charAt(i + 1);
            switch (next) {
                case 'n': result += '\n'; i += 2; break;
                case 't': result += '\t'; i += 2; break;
                case 'r': result += '\r'; i += 2; break;
                case 'b': result += '\b'; i += 2; break;
                case 'f': result += '\f'; i += 2; break;
                case '"': result += '"'; i += 2; break;
                case '\\': result += '\\'; i += 2; break;
                case '/': result += '/'; i += 2; break;
                case 'u':
                    var hex = raw.substring(i + 2, i + 6);
                    if (/^[0-9a-fA-F]{4}$/.test(hex)) {
                        result += String.fromCharCode(parseInt(hex, 16));
                        i += 6;
                    } else {
                        // \u 后不足4位十六进制（流式截断），保留原样
                        result += ch;
                        i++;
                    }
                    break;
                default:
                    // 未识别转义，保留反斜杠+字符
                    result += ch + next;
                    i += 2;
            }
        } else {
            result += ch;
            i++;
        }
    }
    return result;
}

// 【P1-2 流式渐进渲染】将部分 story 推送到 UI
// 通过自定义事件 + 全局回调钩子通知 UI 层更新，不影响最终 JSON 解析
// UI 层可任选一种方式订阅：
//   1. window.addEventListener('stream:partialStory', function(e){ ... e.detail.story ... })
//   2. window._onPartialStoryUpdate = function(story, fullText){ ... }
function _dispatchPartialStory(partialStory, fullText) {
    if (!partialStory) return;
    try {
        if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('stream:partialStory', {
                detail: {
                    story: partialStory,
                    fullText: fullText || '',
                    timestamp: Date.now()
                }
            }));
        }
        // 兼容回调钩子：UI 层可挂载 window._onPartialStoryUpdate
        if (typeof window !== 'undefined' && typeof window._onPartialStoryUpdate === 'function') {
            try { window._onPartialStoryUpdate(partialStory, fullText || ''); }
            catch (cbErr) { console.warn('[_dispatchPartialStory] 回调异常:', cbErr); }
        }
    } catch (e) {
        console.warn('[_dispatchPartialStory] 派发事件异常:', e);
    }
}


// 统一前缀处理：兼容 "data:" 和 "data: " 两种格式

//              剧情正文走 content 字段。两者必须分离——只把 content 给用户看，
//              否则推理阶段 reason chain 会被当成剧情渲染出来。
function parseSSEEventText(eventText, ctx) {
    if (!eventText) return;
    var lines = eventText.split('\n');
    for (let i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!/^data:\s*/.test(line)) continue;
        var dataStr = line.replace(/^data:\s*/, '').trim();
        if (!dataStr || dataStr === '[DONE]') continue;
        var json;
        try { json = JSON.parse(dataStr); } catch (e) { continue; }

        if (json.error && !ctx.streamError) {
            ctx.streamError = extractErrorMessage(json.error, 'API流式错误: ' + JSON.stringify(json.error));
            console.error('[callAI] 流式错误:', ctx.streamError);
            continue;
        }
        if (!json.choices || !json.choices[0]) continue;
        var delta = json.choices[0].delta || {};

        // FIX-C1：正文只取 delta.content，reasoning 只用于折叠面板/调试。
        // 参考原版单 HTML 仅读取 delta.content；将 reasoning_content/reasoning 回退为正文
        // 会导致推理模型（如 stepfun-ai/step-3.7-flash）把完整思考链灌入 story UI。
        var content = (typeof delta.content === 'string') ? delta.content : '';
        var reasoningChunk = (typeof delta.reasoning_content === 'string') ? delta.reasoning_content
                          : (typeof delta.reasoning === 'string') ? delta.reasoning : '';
        if (reasoningChunk) {
            ctx.reasoningText += reasoningChunk;
        }
        ctx.fullText += content;

        // 【P1 修复】主线程流式 onChunk 节流
        // 原实现：每个 SSE token 都同步调用 onChunk，长回复时触发上千次回调
        // 新实现：60ms 节流，用 requestAnimationFrame 批量刷新，与 Worker 路径一致
        // 【酒馆式思维链】reasoning delta 也需要通过 onChunk 传递，实时推送思考过程
        if (reasoningChunk) {
            ctx._pendingReasoningDelta = (ctx._pendingReasoningDelta || '') + reasoningChunk;
        }
        if (ctx.onChunk && (content || reasoningChunk)) {
            ctx._pendingChunkDelta = (ctx._pendingChunkDelta || '') + content;
            if (!ctx._chunkFlushScheduled) {
                ctx._chunkFlushScheduled = true;
                var flushDelta = ctx._pendingChunkDelta;
                var flushFull = ctx.fullText;
                var flushReasoning = ctx._pendingReasoningDelta || '';
                ctx._pendingChunkDelta = '';
                ctx._pendingReasoningDelta = '';
                try { ctx.onChunk(flushDelta, flushFull, flushReasoning); }
                catch (chunkErr) { console.warn('[callAI] onChunk 回调异常:', chunkErr); }
                // 【P1-2 流式渐进渲染】在节流刷新点尝试提取部分 story 并推送 UI
                // 仅当累积文本包含 "story": 字段时提取，不影响最终 JSON 解析
                _tryDispatchPartialStoryForCtx(ctx, flushFull);
                // 下一次刷新至少等待 60ms
                setTimeout(function() {
                    ctx._chunkFlushScheduled = false;
                    if ((ctx._pendingChunkDelta || ctx._pendingReasoningDelta) && ctx.onChunk) {
                        var d2 = ctx._pendingChunkDelta || '';
                        var f2 = ctx.fullText;
                        var r2 = ctx._pendingReasoningDelta || '';
                        ctx._pendingChunkDelta = '';
                        ctx._pendingReasoningDelta = '';
                        try { ctx.onChunk(d2, f2, r2); }
                        catch (e2) { console.warn('[callAI] onChunk 回调异常(延迟):', e2); }
                        // 延迟刷新点同样尝试推送部分 story
                        _tryDispatchPartialStoryForCtx(ctx, f2);
                    }
                }, 60);
            }
        }
    }
}

// 【P1-2 流式渐进渲染】ctx 级别的部分 story 提取与派发
// 通过 ctx._lastPartialStoryLen 记录上次派发的 story 长度，避免重复派发相同内容
// 仅当新提取的 story 长度大于上次时才派发，确保 UI 收到的是增量更新
function _tryDispatchPartialStoryForCtx(ctx, fullText) {
    if (!fullText || typeof _extractPartialStory !== 'function') return;
    // 快速预筛：避免对每个 chunk 都跑正则
    if (fullText.indexOf('"story"') === -1) return;
    var partial = _extractPartialStory(fullText);
    if (!partial) return;
    var lastLen = ctx._lastPartialStoryLen || 0;
    // 仅在 story 内容有新增时派发，避免重复刷新
    if (partial.length > lastLen) {
        ctx._lastPartialStoryLen = partial.length;
        _dispatchPartialStory(partial, fullText);
    }
}


// 1) 尝试整体 JSON 解析（部分 API 不走 SSE，直接返回 JSON）
// 2) 如果整体不是 JSON，从 rawBody 中找首条 data 行提取
// 3) 都失败时**回退到 rawBody 原文**——与原版 [backup/index.html L11882-11903] 一致：
//    原版注释明确说"如果也不是 JSON，直接用原始文本"，避免对未知格式显示空白

function parseAIResponseFallback(rawBody) {
    if (!rawBody) return '';
    // 【BUG-001 修复】检测 HTML/WAF 响应，避免 WAF 页面源码泄露到 UI
    var _trimmed = rawBody.trim().toLowerCase();
    if (_trimmed.startsWith('<!doctype') || _trimmed.startsWith('<html') || _trimmed.startsWith('<head')) {
        console.warn('[parseAIResponseFallback] 检测到HTML/WAF响应，拦截返回空字符串');
        return '';
    }
    var _tagMatches = _trimmed.substring(0, 3000).match(/<\/?(?:html|head|body|script|style|meta|link|title|div|span|form|input|button)\b/gi);
    if (_tagMatches && _tagMatches.length >= 5) {
        console.warn('[parseAIResponseFallback] 检测到大量HTML标签，拦截返回空字符串');
        return '';
    }
    // 1) 整体 JSON
    try {
        var jsonData = JSON.parse(rawBody);
        if (jsonData.error) {
            throw new Error(extractErrorMessage(jsonData.error, 'API错误: ' + JSON.stringify(jsonData.error)));
        }
        var _msg = jsonData.choices && jsonData.choices[0] && jsonData.choices[0].message;
        if (_msg) {
            var _content = (typeof _msg.content === 'string') ? _msg.content : '';
            var _reasoning = (typeof _msg.reasoning_content === 'string') ? _msg.reasoning_content
                           : (typeof _msg.reasoning === 'string') ? _msg.reasoning : '';
            if (_content) return _content;

            // FIX-C1：非流式整体 JSON 同样不把 reasoning 当正文回退。
            if (_reasoning) {
                console.warn('[parseAIResponseFallback] content 为空但存在 reasoning_content，仅记录，不将其作为正文');
            }
            if (jsonData.usage) return '';
            return rawBody;
        }
        if (jsonData.usage) return '';
        // JSON 解析成功但结构不识别，回退到原文
        return rawBody;
    } catch (e) {
        if (e && e.message && e.message.indexOf('API') === 0) throw e;
        // 不是纯 JSON，继续走 SSE 兜底
    }
    // 2) SSE：从 rawBody 中解析所有 data 行并累加 content（兼容长回复被截断后仍保留末尾内容）
    var dataLines = rawBody.match(/data:\s*\{[^\n]+\}/g) || [];
    var sseContent = '';
    for (let _dlIdx = 0; _dlIdx < dataLines.length; _dlIdx++) {
        try {
            var parsed = JSON.parse(dataLines[_dlIdx].replace(/^data:\s*/, '').trim());
            var d = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
            if (d && typeof d.content === 'string') {
                sseContent += d.content;
            }
        } catch (_) { /* 忽略单条解析失败 */ }
    }
    if (sseContent) return sseContent;
    // 3) 终极兜底：原文（与原版一致）
    // 【P0修复】检测 rawBody 是否为原始 SSE 数据（data: {...}），避免泄露到 UI
    if (/^data:\s*\{/.test(rawBody.trim())) {
        console.warn('[parseAIResponseFallback] 检测到原始 SSE 数据泄露，拦截返回空字符串');
        return '';
    }
    return rawBody;
}


var _SSE_SEP = /\r?\n\r?\n/;


async function executeAIStream(url, body, apiKey, signal, onChunk) {
    // P3 修复 BUG-007 真正缺口：fetch 阶段加 240s connect 超时
    // 原版完全无超时，新版 idle 看门狗只在 reader.read() 后才生效，
    // 若 fetch 在 DNS/TCP/TLS 阶段挂起（如 DeepSeek-V4-Pro 实测挂起 226-409 秒），
    // idle 看门狗不触发，需等 10 分钟总超时。这里加 240s fetch 阶段超时
    // 【复审 v2 修复 NEW-001】30s 对中转站过于激进（api.iamhc.cn 复杂 JSON Schema 请求首字节 >30s），
    // 全部延长到 240s，给中转站和推理模型充足反应时间
    // 【用户要求】所有API超时延长到4分钟（240秒），不在乎等待时间，要求完整剧情
    var CONNECT_TIMEOUT_MS = 240 * 1000; // 240s 连接/首字节总超时，给推理模型充足时间
    var _connectTimer = null;
    var _connectAC = null;
    if (typeof AbortController !== 'undefined') {
        _connectAC = new AbortController();
        _connectTimer = TimerManager.setTimeout('aiConnectTimeout', function() {
            try { _connectAC.abort(new Error('API 连接超时（60秒未建立连接）')); }
            catch (e) {}
        }, CONNECT_TIMEOUT_MS);
        // 若外部 signal 已 abort，同步触发 connect AC
        if (signal) {
            if (signal.aborted) _connectAC.abort(signal.reason);
            else signal.addEventListener('abort', function() { _connectAC.abort(signal.reason); }, { once: true });
        }
    }
    var res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            },
            body: JSON.stringify(body),
            signal: _connectAC ? _connectAC.signal : signal
        });
    } finally {
        if (_connectTimer) TimerManager.clearTimeout('aiConnectTimeout');
    }
    if (!res.ok) {

        // 旧实现用 extractErrorMessage 提取 errData.error.message 后会丢弃 "API错误: 429"，
        // 导致 429 在 translateError 中只能命中通用 'rate_limit' 关键字（甚至完全不匹配），
        // 最终显示"请检查API地址和密钥"等无关错误。
        // 新实现始终在错误信息中保留 "HTTP <status>" 后缀，让 httpMap 优先匹配状态码。
        var errMsg = 'HTTP ' + res.status;
        try {
            var errData = await res.json();
            var apiMsg = extractErrorMessage(errData.error || errData, '');
            if (apiMsg) errMsg = errMsg + ': ' + apiMsg;
        } catch (e) { console.warn('[API] 错误响应解析失败:', e); }
        var _err = new Error(errMsg);
        // 【P3-1 修复】给 Error 挂 status 属性，让上层 e429.status === 429 判定可命中
        // （原实现抛裸 Error，e429.status 永远 undefined，只能靠 message 正则）
        _err.status = res.status;
        // 【P3-1 修复】429 速率限制时读取 Retry-After 响应头，供上层动态调整等待时间
        if (res.status === 429) {
            var _retryAfter = res.headers.get('Retry-After');
            if (_retryAfter) _err.retryAfter = _retryAfter;
        }
        // [P0优化] 主动限流：即使是错误响应，也读取限流头更新配额信息
        if (typeof LocalGameAPI !== 'undefined' && typeof options !== 'undefined' && options._currentSlotIdx !== undefined) {
            LocalGameAPI.updateRateLimitInfo(options._currentSlotIdx, res.headers);
        }
        throw _err;
    }

    // [P0优化] 主动限流：成功响应也读取限流头，更新剩余配额
    if (typeof LocalGameAPI !== 'undefined' && typeof options !== 'undefined' && options._currentSlotIdx !== undefined) {
        LocalGameAPI.updateRateLimitInfo(options._currentSlotIdx, res.headers);
    }

    var reader = res.body.getReader();
    var decoder = new TextDecoder();

    var ctx = { fullText: '', reasoningText: '', streamError: null, onChunk: onChunk };
    var sseBuffer = '';

    // 原值 64KB 在推理模型场景下会截断 JSON 末尾（思考过程+JSON 输出可达 50-150KB）
    // 提高到 256KB 可覆盖 99% 推理模型输出，避免 JSON 花括号不匹配
    // 【P1-3 修复】256KB 在长思考链+长剧情场景仍会溢出，提升到 1MB 覆盖极端情况
    // 注：rawBody 仅在 SSE 解析失败（!ctx.fullText）时作兜底，不影响正常流式解析路径
    // 【P0 性能修复】用数组累加替代 string += chunk，避免 O(n²) 字符串拷贝
    var rawBodyArr = [];
    var rawBodyLen = 0;
    var RAW_BODY_MAX = 1024 * 1024;  // 1MB
    var rawBodyTruncated = false;

    // 【第5轮优化】分层 idle 超时（参考业界 SSE 看门狗最佳实践）
    // 单一 60 秒超时的问题：首 token 慢时（推理模型思考 30-50 秒）会被误杀，但服务端真挂起时 60 秒又太久
    // 业界方案：首 token 用较长超时（容忍思考），后续 chunk 间隔用较短超时（真挂起快速判定）
    // [BUG-002 修复] 将首 token 超时从 240 秒降至 90 秒，后续 chunk 间隔从 240 秒降至 60 秒
    // 原值: FIRST_TOKEN_TIMEOUT_MS = 240 * 1000 (4分钟), CHUNK_IDLE_TIMEOUT_MS = 240 * 1000
    // 问题: 推理模型生成时间过长（平均3-5分钟/轮），用户等待时间超出可接受范围
    // 修复: 首 token 90秒（容忍推理模型思考），后续 chunk 间隔 60秒（快速检测服务端挂起）
    var FIRST_TOKEN_TIMEOUT_MS = 90 * 1000;   // 首 token 90 秒（原 240 秒）
    var CHUNK_IDLE_TIMEOUT_MS = 60 * 1000;   // 后续 chunk 间隔 60 秒（原 240 秒）
    var _hasFirstChunk = false;

    // 【P1 修复跟进】流被 idle timeout 取消时，如果已收到内容，不要丢弃
    var _streamAborted = false;
    try {
    while (true) {
        var _idleMs = _hasFirstChunk ? CHUNK_IDLE_TIMEOUT_MS : FIRST_TOKEN_TIMEOUT_MS;
        var _idleTimer = TimerManager.setTimeout('aiStreamIdle', function() {
            try { reader.cancel('idle timeout ' + _idleMs + 'ms'); } catch (e) {}
        }, _idleMs);
        var readResult;
        try {
            readResult = await reader.read();
        } finally {
            TimerManager.clearTimeout('aiStreamIdle');
        }
        if (readResult.done) {
            if (sseBuffer && sseBuffer.trim()) {
                parseSSEEventText(sseBuffer, ctx);
            }
            // 【P1 修复】流结束时刷新剩余的 pending chunk，确保最后一段文本不丢失
            // 【酒馆式思维链】同时刷新剩余的 reasoning delta
            if ((ctx._pendingChunkDelta || ctx._pendingReasoningDelta) && ctx.onChunk) {
                var _finalDelta = ctx._pendingChunkDelta || '';
                var _finalFull = ctx.fullText;
                var _finalReasoning = ctx._pendingReasoningDelta || '';
                ctx._pendingChunkDelta = '';
                ctx._pendingReasoningDelta = '';
                try { ctx.onChunk(_finalDelta, _finalFull, _finalReasoning); }
                catch (_finalErr) { console.warn('[callAI] onChunk 最终刷新异常:', _finalErr); }
            }
            // 【P1-2 流式渐进渲染】流结束前做最后一次部分 story 派发，
            // 确保用户在最终 JSON 解析完成前看到完整的 story 预览
            _tryDispatchPartialStoryForCtx(ctx, ctx.fullText);
            break;
        }
        _hasFirstChunk = true;
        var chunk = decoder.decode(readResult.value, { stream: true });

        rawBodyArr.push(chunk);
        rawBodyLen += chunk.length;
            if (rawBodyLen > RAW_BODY_MAX) {
                // 滚动保留最近 1MB
                var _joined = rawBodyArr.join('');
                rawBodyArr = [_joined.slice(-RAW_BODY_MAX)];
                rawBodyLen = rawBodyArr[0].length;
                if (!rawBodyTruncated) {
                    rawBodyTruncated = true;
                    console.warn('[callAI] rawBody 超过 1MB，改为滚动保留最近 1MB 用于兜底');
                }
            }
        sseBuffer += chunk;
        var events = sseBuffer.split(_SSE_SEP);
        sseBuffer = events.pop() || '';
        for (let i = 0; i < events.length; i++) {
            parseSSEEventText(events[i], ctx);
        }
    }
    } catch (_streamErr) {
        // 【P1 修复跟进】流被 idle timeout / 网络中断取消时，如果已收到内容，不要丢弃
        if (ctx.fullText) {
            _streamAborted = true;
            console.warn('[callAI] 流被中断但已收到 ' + ctx.fullText.length + ' 字符内容，尝试使用已有数据:', _streamErr && _streamErr.message);
            // 刷新剩余的 pending chunk（含 reasoning delta）
            if ((ctx._pendingChunkDelta || ctx._pendingReasoningDelta) && ctx.onChunk) {
                var _abortDelta = ctx._pendingChunkDelta || '';
                var _abortFull = ctx.fullText;
                var _abortReasoning = ctx._pendingReasoningDelta || '';
                ctx._pendingChunkDelta = '';
                ctx._pendingReasoningDelta = '';
                try { ctx.onChunk(_abortDelta, _abortFull, _abortReasoning); }
                catch (e) { console.warn('[callAI] onChunk 中断刷新异常:', e); }
            }
            // 【P1-2 流式渐进渲染】流被中断时也派发已收到的部分 story，
            // 避免中断瞬间 UI 闪回空白
            _tryDispatchPartialStoryForCtx(ctx, ctx.fullText);
        } else {
            throw _streamErr;  // 没有收到任何内容，抛出原始错误
        }
    }

    // 流中检测到错误
    if (ctx.streamError && !ctx.fullText) {
        throw new Error(ctx.streamError);
    } else if (ctx.streamError && ctx.fullText) {
        console.warn('[callAI] 流中有错误但已收到内容，忽略错误继续:', ctx.streamError);

        if (typeof UI !== 'undefined' && UI.toast) {
            UI.toast('响应可能不完整：' + ctx.streamError);
        }
    }


    if (!ctx.fullText && ctx.reasoningText) {
        console.warn('[callAI] 模型仅返回思考链（' + ctx.reasoningText.length + ' 字符）未返回正文；该模型不适合此游戏或当前参数导致 content 为空');
    }

    // 思维链折叠面板接入：把流式累积的 reasoningText 透出到全局，供 sendAIRequest 接入 renderCotPanel
    // 流式模式下 reasoning_content 走 ctx.reasoningText 累积，但 callAI 只返回正文，reasoning 被丢弃。
    // 这里挂到全局变量 window._lastReasoningText，让上层渲染时能取到（与 gameState._lastCotContent 并行）
    if (ctx.reasoningText && ctx.reasoningText.trim()) {
        try {
            if (typeof window !== 'undefined') {
                window._lastReasoningText = ctx.reasoningText;
            }
        } catch (e) {}
    } else {
        try {
            if (typeof window !== 'undefined') {
                window._lastReasoningText = '';
            }
        } catch (e) {}
    }

    // 兜底：SSE 解析为空时再尝试从 rawBody 提取
    var rawBody = rawBodyArr.length > 0 ? rawBodyArr.join('') : '';
    if (!ctx.fullText && rawBody) {
        return parseAIResponseFallback(rawBody);
    }

    // 旧逻辑：流式空回会返回空字符串，上游 parseAIResponse 兜底显示原文，但若 rawBody 也空则报错
    // 新逻辑：明确区分"HTTP 错误"（res.ok=false，已抛错）和"解析为空"（HTTP 200 但内容空）
    // 后者给出更具体的错误信息，避免误判为 openai_error
    if (!ctx.fullText && !ctx.streamError) {
        console.warn('[callAI] HTTP 200 但流式响应内容为空，可能是 API 返回了非 SSE 格式或空响应');
        throw new Error('AI返回内容为空 → 可能是API返回了非流式格式或响应被截断，请尝试关闭流式模式或重试');
    }
    return ctx.fullText;
}


async function executeAINormal(url, body, apiKey, signal) {
    // P3 修复 BUG-007 真正缺口：fetch 阶段加 60s connect 超时（与 executeAIStream 一致）
    // 【用户要求】延长到240s，与 executeAIStream 保持一致，给推理模型充足时间
    var CONNECT_TIMEOUT_MS = 240 * 1000;
    var _connectTimer = null;
    var _connectAC = null;
    if (typeof AbortController !== 'undefined') {
        _connectAC = new AbortController();
        _connectTimer = TimerManager.setTimeout('aiConnectTimeout', function() {
            try { _connectAC.abort(new Error('API 连接超时（60秒未建立连接）')); }
            catch (e) {}
        }, CONNECT_TIMEOUT_MS);
        if (signal) {
            if (signal.aborted) _connectAC.abort(signal.reason);
            else signal.addEventListener('abort', function() { _connectAC.abort(signal.reason); }, { once: true });
        }
    }
    var res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            },
            body: JSON.stringify(body),
            signal: _connectAC ? _connectAC.signal : signal
        });
    } finally {
        if (_connectTimer) TimerManager.clearTimeout('aiConnectTimeout');
    }
    if (!res.ok) {

        var errMsg = 'HTTP ' + res.status;
        try {
            var errData = await res.json().catch(function() { return {}; });
            var apiMsg = extractErrorMessage(errData.error || errData, '');
            if (apiMsg) errMsg = errMsg + ': ' + apiMsg;
        } catch (e) { /* 忽略 */ }
        // 【P3-1 修复】与 executeAIStream 一致：挂 status 属性 + 读取 Retry-After 头
        var _errN = new Error(errMsg);
        _errN.status = res.status;
        if (res.status === 429) {
            var _retryAfterN = res.headers.get('Retry-After');
            if (_retryAfterN) _errN.retryAfter = _retryAfterN;
        }
        throw _errN;
    }
    var data = await res.json();

    // 旧代码（修复 #19）明确拒绝回退，导致部分模型返回 200 但 content 为空时报"配置失败"
    // 流式模式（parseSSEEventText）已实现了回退，非流式应保持一致
    // 安全措施：打 _reasoningAsContent 标记，让 parseAIResponse 的思维链泄漏检测（X8）能拦截真正的推理内容
    var _nmsg = data.choices && data.choices[0] && data.choices[0].message;
    if (_nmsg) {
        var _content = (typeof _nmsg.content === 'string') ? _nmsg.content : '';
        var _reasoning = (typeof _nmsg.reasoning_content === 'string') ? _nmsg.reasoning_content
                       : (typeof _nmsg.reasoning === 'string') ? _nmsg.reasoning : '';
        if (_content) {
            // 正常返回 content；同时若有 reasoning 也透出，供 CoT 面板展示
            if (_reasoning) {
                try { if (typeof window !== 'undefined') window._lastReasoningText = _reasoning; } catch (e) {}
            } else {
                try { if (typeof window !== 'undefined') window._lastReasoningText = ''; } catch (e) {}
            }
            return _content;
        }

        // 【BUG-004 修复】推理模型（如 DeepSeek-V4-Flash, o1）在 Context 检测探测时
        // 可能只返回 reasoning_content 而不返回 content。原代码直接抛错导致 Context 检测失败。
        // 修复：当 content 为空但 reasoning_content 存在时，返回 reasoning_content 作为回退。
        // - Context 检测：能从推理内容中提取数字（如"我的上下文是128000"）
        // - 主游戏请求：parseAIResponse 会尝试 JSON 解析，失败后走兜底逻辑，不影响游戏
        if (_reasoning) {
            console.warn('[executeAINormal] content 为空，使用 reasoning_content（' + _reasoning.length + ' 字符）作为回退');
            try { if (typeof window !== 'undefined') window._lastReasoningText = _reasoning; } catch (e) {}
            return _reasoning;
        }

        // content 和 reasoning_content 均为空，说明模型不兼容
        console.warn('[executeAINormal] 模型返回 200 但 content 和 reasoning_content 均为空，可能是不兼容的模型');
        throw new Error('该模型返回了空内容（content 和 reasoning_content 均为空）→ 可能是不支持文本生成的模型，请更换为支持文本对话的模型');
    }
    // JSON 解析成功但结构不识别，原版兜底行为：返回 res.text() 让用户看到原文
    try { return await res.text(); } catch (e) { return ''; }
}

// AI 调用主入口


async function callAI(messages, options = {}) {

    var initialCfg = LocalGameAPI.getCurrentConfig();
    if (!initialCfg || !initialCfg.baseUrl || !initialCfg.apiKey) {
        throw new Error('请先配置API（设置 → API配置）');
    }

    // 【P0-3 Context Viewer】记录本次请求的 token 分配，供 UI 展示
    try {
        _recordContextBreakdown(messages, options);
    } catch(e) { /* 不影响主流程 */ }


    // 旧代码 5 分钟超时对部分推理模型不够，导致正常请求被误杀
    // 优先级：gameState.aiTimeoutMs（用户自定义）> 默认 10 分钟
    var _timeoutMs = 10 * 60 * 1000;
    if (typeof gameState !== 'undefined' && gameState && gameState.aiTimeoutMs && gameState.aiTimeoutMs > 0) {
        _timeoutMs = gameState.aiTimeoutMs;
    }
    // 清空上一次的 reasoning 透出值，避免上一轮残留进入本轮 CoT 面板
    try { if (typeof window !== 'undefined') window._lastReasoningText = ''; } catch (e) {}
    var localAC = new AbortController();
    // 【P0-1 修复】仅主请求才设置 window._currentAbort，后台请求（_isBackground）使用独立 signal
    // 避免 safeAbort() 误杀后台请求（设定解析、上下文压缩、NPC对话等）
    if (!options._isBackground) {
        window._currentAbort = localAC;
    }
    TimerManager.setTimeout('aiRequestTimeout', function() {
        try { localAC.abort(new Error('AI请求超时（' + Math.round(_timeoutMs / 60000) + '分钟）')); }
        catch (e) { /* 忽略 */ }
    }, _timeoutMs);

    // 串联外部 signal：options.signal 优先
    // 【P0-1 修复】后台请求不读取 window._currentAbort（避免读取到主请求的 controller）
    var externalSignal = options.signal || (!options._isBackground && window._currentAbort && window._currentAbort.signal);
    var externalListener = null;
    if (externalSignal) {
        if (externalSignal.aborted) {
            try { localAC.abort(externalSignal.reason); } catch (e) { /* 忽略 */ }
        } else {
            externalListener = function() {
                try { localAC.abort(externalSignal.reason); } catch (e) { /* 忽略 */ }
            };
            externalSignal.addEventListener('abort', externalListener, { once: true });
        }
    }

    try {
        // 429 速率限制自动重试（指数退避：5s → 10s，最多 2 次）
        // 用户取消（localAC.abort）时立即停止重试，抛 AbortError 给上层
        var _maxRetries429 = 2;
        var _attempt429 = 0;
        while (true) {
            try {
                return await LocalGameAPI.tryWithFallback(async function(slotIdx) {
                    var config = LocalGameAPI._configs[slotIdx];
                    var url = LocalGameAPI.normalizeUrl(config.baseUrl) + '/chat/completions';
                    var body = buildAIRequestBody(messages, options, config);
                    // [P0优化] 主动限流：将当前slotIdx传入options，供executeAIStream读取响应头时更新配额
                    options._currentSlotIdx = slotIdx;
                    if (options.stream) {
                        // 【架构升级】优先通过 Web Worker 执行流式解析，避免主线程被 SSE 解析 + JSON.parse 占满。
                        // 长回答（50-150KB）时主线程保持响应，用户可随时点击取消/其他按钮。
                        // Worker 不可用时自动降级到原 executeAIStream（主线程解析）。
                        // 【P1 修复跟进】不再同步检查 isAvailable()（初始返回 false 会导致 Worker 永不初始化），
                        // 而是直接调用 executeAIStreamViaWorker，由其内部异步初始化 Worker；
                        // 初始化失败时抛 WORKER_UNAVAILABLE，下方 catch 自动降级到主线程。
                        if (typeof StreamBridge !== 'undefined' && typeof StreamBridge.executeAIStreamViaWorker === 'function') {
                            try {
                                return await StreamBridge.executeAIStreamViaWorker(url, body, config.apiKey, localAC.signal, options.onChunk);
                            } catch (wErr) {
                                // WORKER_UNAVAILABLE 或 Worker 运行时错误：降级到主线程
                                if (wErr && wErr.message === 'WORKER_UNAVAILABLE') {
                                    console.warn('[callAI] Worker 不可用，降级到主线程流式解析');
                                } else if (wErr && wErr.name === 'AbortError') {
                                    // 用户取消，不降级，直接抛出
                                    throw wErr;
                                } else {
                                    // 【BG-005 修复】对 429/ResourceExhausted 类错误不降级，
                                    // 直接抛回让外层 callAI 的 429 重试逻辑接管（带指数退避），
                                    // 避免降级后再次冲击 API 导致连锁限流
                                    var _wMsg = (wErr && wErr.message) ? String(wErr.message) : '';
                                    var _wIs429 = (wErr && wErr.status === 429)
                                        || /ResourceExhausted/i.test(_wMsg)
                                        || /rate_?limit/i.test(_wMsg)
                                        || /quota/i.test(_wMsg)
                                        || /request limit reached/i.test(_wMsg);
                                    if (_wIs429) {
                                        // 保留 retryAfter 头，让外层 retry 逻辑使用
                                        if (wErr && wErr.retryAfter) {
                                            wErr._preservedRetryAfter = wErr.retryAfter;
                                        }
                                        console.warn('[callAI] Worker 遭遇限流，抛回主线程重试（不降级）');
                                        throw wErr;
                                    }
                                    console.warn('[callAI] Worker 流式失败，降级到主线程:', wErr && wErr.message);
                                }
                                // 降级到原 executeAIStream（主线程同步解析）
                                // 【P1-2 修复】降级时不传 onChunk，避免 Worker 已派发的 partial chunk 被重复派发
                                // 主线程解析会返回完整文本，上层用完整文本替换 UI 即可
                                return await executeAIStream(url, body, config.apiKey, localAC.signal, null);
                            }
                        } else {
                            return await executeAIStream(url, body, config.apiKey, localAC.signal, options.onChunk);
                        }
                    } else {
                        return await executeAINormal(url, body, config.apiKey, localAC.signal);
                    }
                });
            } catch (e429) {
                // 用户取消时立即停止重试
                if (localAC.signal.aborted) throw e429;
                // 【BUG-001 修复】全局重试上限触发后，立即终止，
                // 不要进入 429 重试循环，也不要被外层 JSON Schema 降级再次递归
                if (e429 && e429.name === 'GlobalRetryLimitError') {
                    // 清空降级状态，避免下次请求继承脏数据
                    if (typeof gameState !== 'undefined' && gameState) gameState._jsonSchemaDowngrade = null;
                    // 恢复"未生成"状态（避免 UI 永远卡在"AI正在构思剧情..."）
                    if (typeof setWaiting === 'function') {
                        try { setWaiting(false); } catch (e) {}
                    }
                    throw e429;
                }
                var _msg429 = (e429 && e429.message) ? String(e429.message) : '';
                // 【NEW-011 修复】扩展限流检测：429 状态码 + ResourceExhausted + rate_limit/quota 关键词
                // Google Gemini 风格的 ResourceExhausted 可能以 503 或其他状态码返回
                var _is429 = /HTTP 429/.test(_msg429) ||
                    (e429 && e429.status === 429) ||
                    /ResourceExhausted/i.test(_msg429) ||
                    /rate_?limit/i.test(_msg429) ||
                    /quota/i.test(_msg429) ||
                    /request limit reached/i.test(_msg429);
                if (!_is429 || _attempt429 >= _maxRetries429) throw e429;
                _attempt429++;
                // 【P3-1 修复】优先使用 Retry-After 响应头动态调整等待时间
                // Retry-After 可以是秒数（"30"）或 HTTP 日期格式
                // 无 Retry-After 时回退到指数退避（5s → 10s）
                var _waitMs = 5000 * Math.pow(2, _attempt429 - 1);
                if (e429 && e429.retryAfter) {
                    var _ra = e429.retryAfter;
                    // 尝试解析为秒数
                    var _raSec = parseInt(_ra, 10);
                    if (!isNaN(_raSec) && String(_raSec) === String(_ra).trim()) {
                        _waitMs = Math.min(Math.max(_raSec * 1000, 1000), 60000);  // 1s-60s
                    } else {
                        // HTTP 日期格式（较少见），用 Date.parse 计算剩余毫秒
                        var _raTime = Date.parse(_ra);
                        if (!isNaN(_raTime)) {
                            _waitMs = Math.min(Math.max(_raTime - Date.now(), 1000), 60000);
                        }
                    }
                }
                // [P1优化] 添加抖动(Jitter)，防止多客户端同步重试
                _waitMs = _waitMs * (0.85 + Math.random() * 0.3); // ±15% 随机（Retry-After场景抖动较小）
                _waitMs = Math.round(_waitMs);
                var _statusMsg = '速率限制，' + (_waitMs / 1000).toFixed(1) + '秒后自动重试 (' + _attempt429 + '/' + _maxRetries429 + ')';
                console.warn('[callAI] ' + _statusMsg + (e429 && e429.retryAfter ? ' [Retry-After: ' + e429.retryAfter + ']' : ''));
                if (typeof UI !== 'undefined' && UI.toast) {
                    UI.toast(_statusMsg);
                }
                // 同步更新状态栏文本，让用户在加载条上看到重试信息
                updateGenStatus(_statusMsg);
                // 等待期间监听 abort 事件，用户取消时提前唤醒
                await new Promise(function(resolve) {
                    var _timer = setTimeout(resolve, _waitMs);
                    localAC.signal.addEventListener('abort', function() {
                        clearTimeout(_timer);
                        resolve();
                    }, { once: true });
                });
                // 等待结束后再次检查：用户取消则抛 AbortError
                if (localAC.signal.aborted) {
                    var _abortErr = new Error('用户取消请求');
                    _abortErr.name = 'AbortError';
                    throw _abortErr;
                }
            }
        }
    } catch (e) {
        // 【BUG-001 修复】GlobalRetryLimitError 是用户可处理的终态错误，
        // 不应该进入 JSON Schema 降级路径（否则会递归 callAI 又触发重试）
        if (e && e.name === 'GlobalRetryLimitError') {
            // 清空降级状态，避免下次请求继承脏数据
            if (typeof gameState !== 'undefined' && gameState) gameState._jsonSchemaDowngrade = null;
            // 恢复"未生成"状态（避免 UI 永远卡在"AI正在构思剧情..."）
            if (typeof setWaiting === 'function') {
                try { setWaiting(false); } catch (e2) {}
            }
            // 显示一个带"我知道了"按钮的错误提示
            if (typeof UI !== 'undefined' && typeof UI.alert === 'function') {
                try {
                    UI.alert('API 持续调用失败\n\n' + (e.message || '') + '\n\n请检查 API 配置或更换其他 API 后重试。');
                } catch (e3) {
                    console.error('[callAI] GlobalRetryLimit:', e.message);
                }
            } else {
                console.error('[callAI] GlobalRetryLimit:', e.message);
            }
            throw e;
        }
        // 【JSON Schema 降级机制】检测 schema 相关的 400 错误，自动降级重试一次
        // 常见错误关键词：response_format / json_schema / schema / strict / invalid
        // 降级路径：strict → json_object → off
        var _errMsg = (e && e.message) ? String(e.message).toLowerCase() : '';
        var _isSchemaErr = /response_format|json_schema|schema|strict|invalid.*format/.test(_errMsg) &&
                          (e && (e.status === 400 || e.status === 422 || /400|422|bad request/.test(_errMsg)));
        if (_isSchemaErr && options.jsonSchema && typeof gameState !== 'undefined' && gameState) {
            var _curDowngrade = gameState._jsonSchemaDowngrade;
            if (!_curDowngrade) {
                // 第一次降级：strict → json_object
                gameState._jsonSchemaDowngrade = 'json_object';
                console.warn('[API] JSON Schema strict 模式被 API 拒绝，降级为 json_object 重试');
                // 递归重试一次（去掉 stream 避免 onChunk 重复绑定问题）
                var _retryOpts = Object.assign({}, options);
                delete _retryOpts.onChunk;
                _retryOpts.stream = false;
                try {
                    return await callAI(messages, _retryOpts);
                } catch (retryErr) {
                    // 【P0-3 修复】递归重试失败时，调度延时重置降级标志
                    // 如果失败是非 schema 错误（429/网络等），标志会卡在 'json_object' 永不重置
                    setTimeout(function() {
                        if (gameState) gameState._jsonSchemaDowngrade = null;
                    }, 60000);
                    throw retryErr;
                }
            } else if (_curDowngrade === 'json_object') {
                // 第二次降级：json_object → off
                gameState._jsonSchemaDowngrade = 'off';
                console.warn('[API] json_object 模式也被拒绝，关闭 response_format 重试');
                var _retryOpts2 = Object.assign({}, options);
                delete _retryOpts2.onChunk;
                _retryOpts2.stream = false;
                try {
                    var _result = await callAI(messages, _retryOpts2);
                    // 成功：60秒后重置降级标志，下次恢复正常尝试
                    setTimeout(function() {
                        if (gameState) gameState._jsonSchemaDowngrade = null;
                    }, 60000);
                    return _result;
                } catch (retryErr2) {
                    // 【P0-3 修复】'off' 模式也失败时，立即重置标志，让下次请求重新尝试 strict
                    // 如果不重置，标志会永远卡在 'off'，所有后续请求都不使用 response_format
                    if (gameState) gameState._jsonSchemaDowngrade = null;
                    throw retryErr2;
                }
            }
        }
        throw e;
    } finally {
        TimerManager.clearTimeout('aiRequestTimeout');
        if (externalListener && externalSignal) {
            try { externalSignal.removeEventListener('abort', externalListener); } catch (e) { /* 忽略 */ }
        }
        // 【P0-1 修复】仅主请求清理 window._currentAbort，后台请求不应碰此全局变量
        if (!options._isBackground && window._currentAbort === localAC) {
            window._currentAbort = null;
        }
    }
}
// ========================================
// Context Size 自动检测（动态，不硬编码模型列表）
// ========================================

// 【静态 fallback 表】此表为 detectContextSize 的最后兜底（在注册表、正则匹配、AI 自报之后才使用）
// 数据同步自 model-registry.js v2026-07-23.5
// 注意：此表仅存储 context_length，不含 max_completion_tokens 和 is_reasoning
var _KNOWN_MODEL_CONTEXT = {
    // DeepSeek 系
    'deepseek-v4-flash': 1000000,
    'deepseek-v4-pro': 1000000,
    'deepseek-v4': 1000000,
    'ds-4-pro': 1000000,
    'ds-4-flash': 1000000,
    'ds-4': 1000000,
    'deepseek-v3.1': 1048576,
    'deepseek-v3': 65536,
    'deepseek-r1': 65536,
    'deepseek-reasoner': 65536,
    'deepseek-chat': 1000000,
    'deepseek': 1000000,
    // OpenAI GPT 系
    'gpt-5.6-sol': 1050000,
    'gpt-5.6-terra': 1050000,
    'gpt-5.6-luna': 1050000,
    'gpt-5.6': 1050000,
    'gpt-5.5': 1050000,
    'gpt-5.4': 1050000,
    'gpt-5.2': 400000,
    'gpt-5.1': 400000,
    'gpt-5': 400000,
    'gpt-4o-mini': 128000,
    'gpt-4o': 128000,
    'gpt-4.1': 1047576,
    'gpt-4-turbo': 128000,
    'gpt-4': 8192,
    'o3-mini': 200000,
    'o3': 200000,
    'o1-mini': 128000,
    'o1': 200000,
    'gpt-3.5-turbo': 16384,
    // Anthropic Claude 系（含 Kiro 版 + 简写别名）
    'k-opus-4-8': 1000000,
    'k-opus-4-7': 1000000,
    'k-opus-4-6': 1000000,
    'k-opus-4-5': 200000,
    'claude-mythos-5': 1000000,
    'claude-mythos-preview': 1000000,
    'claude-fable-5': 1000000,
    'claude-sonnet-5': 1000000,
    'claude-haiku-4-5': 200000,
    // 点号命名法（中转站常用）
    'claude-opus-4.8': 1000000,
    'claude-opus-4.7': 1000000,
    'claude-opus-4.6': 1000000,
    'claude-opus-4.5': 200000,
    'claude-sonnet-4.6': 1000000,
    'claude-sonnet-4.5': 200000,
    'claude-opus-4-8': 1000000,
    'claude-opus-4-7': 1000000,
    'claude-opus-4-6': 1000000,
    'claude-opus-4-5': 200000,
    'claude-sonnet-4-6': 1000000,
    'claude-sonnet-4-5': 200000,
    'claude-sonnet-4': 200000,
    'claude-3-5-sonnet': 200000,
    'claude-3.5-sonnet': 200000,
    'claude-3-5-haiku': 200000,
    'claude-3-opus': 200000,
    'claude-3-sonnet': 200000,
    'claude-3-haiku': 200000,
    'mythos-5': 1000000,
    'mythos-preview': 1000000,
    'fable-5': 1000000,
    'sonnet-5': 1000000,
    'haiku-4-5': 200000,
    'opus-4-8': 1000000,
    'opus-4-7': 1000000,
    'opus-4-6': 1000000,
    'opus-4-5': 200000,
    'sonnet-4-6': 1000000,
    'sonnet-4-5': 200000,
    'claude': 200000,
    // Google Gemini 系
    'gemini-3.6-flash': 1048576,
    'gemini-3.6': 1048576,
    'gemini-3.5-flash': 1048576,
    'gemini-3.5': 1048576,
    'gemini-3.1-pro': 2000000,
    'gemini-3.1-flash-lite': 1048576,
    'gemini-3.1-flash': 1048576,
    'gemini-3-flash': 1048576,
    'gemini-3-pro': 1048576,
    'gemini-3': 1048576,
    'gemini-2.5-pro': 1048576,
    'gemini-2.5-flash': 1048576,
    'gemini-2.0-flash': 1048576,
    'gemini-1.5-pro': 2097152,
    'gemini-1.5-flash': 1048576,
    'gemini': 1048576,
    // GLM 智谱系
    'glm-5.2': 1048576,
    'glm-5.1': 200000,
    'glm-5': 200000,
    'glm-4.7': 200000,
    'glm-4.6': 200000,
    'glm-4.5': 131072,
    'glm-4-plus': 131072,
    'glm-4-flash': 131072,
    'glm-4-air': 131072,
    'glm-4': 131072,
    'glm': 131072,
    // xAI Grok 系
    'grok-5': 1048576,
    'grok-4.5': 500000,
    'grok-4.4': 256000,
    'grok-4.3': 2000000,
    'grok-4.2': 1000000,
    'grok-4.1': 2000000,
    'grok-4-fast': 2000000,
    'grok-4': 256000,
    'grok-3-mini': 131072,
    'grok-3': 131072,
    'grok-2': 131072,
    'grok': 131072,
    // Moonshot/Kimi 系
    'kimi-k3': 1048576,
    'kimi-k2.7': 262144,
    'kimi-k2.6': 262144,
    'kimi-k2.5': 262144,
    'kimi-k2': 131072,
    'kimi': 131072,
    'moonshot-v1-128k': 131072,
    'moonshot-v1-32k': 32768,
    'moonshot-v1-8k': 8192,
    'moonshot': 131072,
    // Qwen 通义千问系
    'qwen3.7-max': 1000000,
    'qwen3.7-plus': 1000000,
    'qwen3.7': 1000000,
    'qwen3.6-flash': 262144,
    'qwen3.6': 262144,
    'qwen3-max': 262144,
    'qwen3-plus': 131072,
    'qwen3-turbo': 1048576,
    'qwen3': 131072,
    'qwen2.5': 131072,
    'qwen-max': 131072,
    'qwen-plus': 131072,
    'qwen-turbo': 131072,
    'qwen': 131072,
    // Meta Llama 系
    'llama-4.5-scout': 10000000,
    'llama-4.5-maverick': 1000000,
    'llama-4.5': 1000000,
    'llama-4-scout': 10000000,
    'llama-4-maverick': 1000000,
    'llama-4': 1000000,
    'llama-3.3': 131072,
    'llama-3.1': 131072,
    'llama-3': 8192,
    'llama': 8192,
    // Mistral 系
    'mistral-large': 131072,
    'mistral-medium': 32768,
    'mistral-small': 32768,
    'mixtral': 32768,
    'mistral': 32768,
    // MiniMax 系
    'minimax-m3': 1048576,
    'minimax-01': 4000000,
    'minimax-m1': 1048576,
    'minimax-m2': 131072,
    'minimax': 131072,
    'abab': 131072,
    // 腾讯混元 Hunyuan 系
    'hunyuan-hy3': 262144,
    'hunyuan-turbo': 131072,
    'hunyuan-pro': 131072,
    'hunyuan': 131072,
    // 字节豆包 Doubao 系
    'doubao-2': 262144,
    'doubao-1': 262144,
    'doubao': 131072,
    // 百度文心 ERNIE 系
    'ernie-4.5': 131072,
    'ernie-4': 131072,
    'ernie': 131072,
    'wenxin': 131072,
    // 阶跃星辰 Step 系
    'step-3': 131072,
    'step-2': 131072,
    'step': 131072,
    // 零一万物 Yi 系
    'yi-lightning': 131072,
    'yi-large': 131072,
    'yi': 131072,
    // 百川 Baichuan 系
    'baichuan-4': 131072,
    'baichuan': 131072,
    // 讯飞星火 Spark 系
    'spark-4': 131072,
    'spark': 32768,
    'generalv': 32768,
    // 通用 "auto" 推理模型
    'auto': 128000
};


async function _fetchWithContextRetry(url, options, maxRetries) {
    var lastErr = null;
    for (var attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            var resp = await fetch(url, options);
            // 【v2审查修复】429 限速和 5xx 服务端错误也需要重试
            // 原实现只对 fetch 抛出的网络错误重试，但 429 是 HTTP 响应（fetch 不抛错）
            // 导致 /models API 遇 429 直接返回，detectContextSize 跳过动态检测
            if ((resp.status === 429 || resp.status >= 500) && attempt < maxRetries) {
                var retryDelay = 500 * Math.pow(2, attempt);
                // [P1优化] 添加抖动(Jitter)
                retryDelay = Math.round(retryDelay * (0.75 + Math.random() * 0.5));
                console.log('[Context检测] HTTP ' + resp.status + '，' + retryDelay + 'ms 后重试 (' + (attempt + 1) + '/' + maxRetries + ')');
                await new Promise(function(r) { setTimeout(r, retryDelay); });
                continue;
            }
            return resp;
        } catch (e) {
            lastErr = e;
            // 认证/参数错误不重试
            var msg = String((e && e.message) || e);
            if (/401|403|abort|AbortError/i.test(msg)) throw e;
            if (attempt < maxRetries) {
                var delay = 500 * Math.pow(2, attempt); // 500ms, 1000ms, 2000ms
                // [P1优化] 添加抖动(Jitter)
                delay = Math.round(delay * (0.75 + Math.random() * 0.5));
                console.log('[Context检测] 网络错误，' + delay + 'ms 后重试 (' + (attempt + 1) + '/' + maxRetries + '):', msg);
                await new Promise(function(r) { setTimeout(r, delay); });
            }
        }
    }
    throw lastErr;
}

async function detectContextSize() {
    // 优先级0：用户手动覆盖（最高优先级，通过 ModelRegistry 管理）
    // 用户在设置中手动指定上下文窗口大小，设为 0 表示使用自动检测
    if (typeof ModelRegistry !== 'undefined' && ModelRegistry._manualOverride && ModelRegistry._manualOverride.context_length > 0) {
        var manualCtx = ModelRegistry._manualOverride.context_length;
        gameState.contextSize = manualCtx;
        if (ModelRegistry._manualOverride.max_completion_tokens > 0) {
            gameState._apiMaxCompletionTokens = ModelRegistry._manualOverride.max_completion_tokens;
        }
        console.log('[Context检测] 来自用户手动覆盖: ' + manualCtx);
        return manualCtx;
    }

    // 优先级1：预设中的 max_context
    if (typeof PresetManager !== 'undefined' && PresetManager.currentParams && PresetManager.currentParams.max_context) {
        var presetCtx = Number(PresetManager.currentParams.max_context);
        if (presetCtx > 0) {
            gameState.contextSize = presetCtx;
            console.log('[Context检测] 来自预设 max_context: ' + presetCtx);
            return presetCtx;
        }
    }

    var model = '';
    var baseUrl = '';
    var apiKey = '';
    if (typeof LocalGameAPI !== 'undefined' && LocalGameAPI.getCurrentConfig()) {
        var cfg = LocalGameAPI.getCurrentConfig();
        model = (cfg.model || '').toLowerCase();
        baseUrl = cfg.baseUrl || '';
        apiKey = cfg.apiKey || '';
    }

    // 优先级2：调 /models API 动态获取（带 2 次重试，覆盖瞬时 429/网络抖动）
    // 【增强】支持 OpenRouter / LiteLLM / Gemini 等多种 API 返回格式
    // 【增强】同时缓存 API 返回数据到 ModelRegistry，供 max_tokens 计算使用
    if (baseUrl && apiKey) {
        try {
            var modelsUrl = LocalGameAPI.normalizeUrl(baseUrl) + '/models';
            var resp = await _fetchWithContextRetry(modelsUrl, {
                method: 'GET',
                headers: { 'Authorization': 'Bearer ' + apiKey },
                signal: AbortSignal.timeout(5000)
            }, 2);
            if (resp.ok) {
                var data = await resp.json();
                // OpenAI 格式：{ data: [{ id: "model-name", ... }] }
                // Gemini 格式：{ models: [{ name: "models/gemini-1.5-pro", inputTokenLimit: ... }] }
                var models = data.data || data.models || data;
                if (Array.isArray(models)) {
                    // 缓存到 ModelRegistry 供后续 max_tokens 计算使用
                    if (typeof ModelRegistry !== 'undefined') {
                        ModelRegistry.setApiCache(models);
                    }

                    // 使用 ModelRegistry 的统一解析器查找模型信息
                    var apiModelInfo = null;
                    if (typeof ModelRegistry !== 'undefined') {
                        apiModelInfo = ModelRegistry.findInApiModels(models, model);
                    } else {
                        // 降级：手动查找
                        var target = models.find(function(m) {
                            var id = (m.id || m.name || '').toLowerCase();
                            return id === model || id.endsWith('/' + model) || id.endsWith(':' + model);
                        });
                        if (target) {
                            apiModelInfo = {
                                context_length: target.context_length || target.max_context_length ||
                                    target.max_input_tokens || target.context_window ||
                                    target.inputTokenLimit || 0,
                                max_completion_tokens: target.max_completion_tokens ||
                                    target.max_output_tokens || target.max_tokens ||
                                    target.outputTokenLimit || 0
                            };
                        }
                    }

                    if (apiModelInfo && apiModelInfo.context_length > 0) {
                        gameState.contextSize = apiModelInfo.context_length;
                        // 同时缓存 max_completion_tokens 供 getEffectiveMaxTokens 使用
                        if (apiModelInfo.max_completion_tokens > 0) {
                            gameState._apiMaxCompletionTokens = apiModelInfo.max_completion_tokens;
                        }
                        console.log('[Context检测] 来自 /models API: ctx=' + apiModelInfo.context_length +
                            (apiModelInfo.max_completion_tokens > 0 ? ', max_output=' + apiModelInfo.max_completion_tokens : ''));
                        return apiModelInfo.context_length;
                    }
                }
            }
        } catch (e) {
            console.log('[Context检测] /models API 不可用（已重试），尝试其他方式:', (e && e.message) || e);
        }
    }

    // 优先级3：静态注册表 → 模型名正则 → 内联表 → AI 自报（最后手段）
    // 【P1 修复 2026-07-23】原顺序 AI自报 > 正则 > 注册表，但 AI 自报不可靠（模型经常幻觉），
    // 且浪费一次 API 往返增加启动延迟。注册表数据已更新为最新（2026-07-23），应优先使用。
    // 新顺序：注册表 > 正则 > 内联表 > AI 自报（仅当所有静态方式均失败时才调用）
    var ctxSize = 0;

    // 3a. 模型注册表查找（首选静态方式，数据已更新至 2026-07-23）
    //     ModelRegistry 覆盖 80+ 模型，支持 context_length + max_completion_tokens + is_reasoning
    //     降级：ModelRegistry 不可用时回退到 _KNOWN_MODEL_CONTEXT 内联表
    if (ctxSize === 0) {
        if (typeof ModelRegistry !== 'undefined') {
            var regResult = ModelRegistry.findInRegistry(model);
            if (regResult && regResult.context_length > 0) {
                ctxSize = regResult.context_length;
                // 同时缓存 max_completion_tokens 和 is_reasoning
                if (regResult.max_completion_tokens > 0) {
                    gameState._registryMaxCompletionTokens = regResult.max_completion_tokens;
                }
                if (regResult.is_reasoning) {
                    gameState._isReasoningModel = true;
                }
                console.log('[Context检测] 来自 ModelRegistry (' + regResult.provider + (regResult.is_fallback ? '/fallback' : '') + '): ' + ctxSize +
                    (regResult.is_reasoning ? ' [reasoning]' : ''));
            }
        }
    }

    // 3b. 模型名中直接标注的 context size（如 "xxx-32k", "xxx-128k"）
    if (ctxSize === 0) {
        var kMatch = model.match(/(\d+)k/);
        if (kMatch) ctxSize = parseInt(kMatch[1], 10) * 1024;
    }

    // 3c. 模型名中标注的数字（如 "xxx-8192", "xxx-128000"）
    if (ctxSize === 0) {
        var numMatch = model.match(/[-_](\d{4,})/);
        if (numMatch) {
            var num = parseInt(numMatch[1], 10);
            if (num >= 2048) ctxSize = num;
        }
    }

    // 3d. 内联硬编码表（ModelRegistry 未加载或未匹配时的兜底）
    if (ctxSize === 0) {
        var _matchedKey = null;
        for (var _k in _KNOWN_MODEL_CONTEXT) {
            if (_KNOWN_MODEL_CONTEXT.hasOwnProperty(_k) && model.indexOf(_k) !== -1) {
                _matchedKey = _k;
                break;
            }
        }
        if (_matchedKey) {
            ctxSize = _KNOWN_MODEL_CONTEXT[_matchedKey];
            console.log('[Context检测] 来自内联硬编码表（includes 匹配 ' + _matchedKey + '）: ' + ctxSize);
        }
    }

    // 3e. AI 自报上下文（最后手段，仅在所有静态方式均失败时使用）
    //     【降级原因】模型经常幻觉（如 DeepSeek 可能回答 64000 或 128000），且浪费一次 API 往返
    //     保留作为最后兜底，避免完全未知模型时只能使用默认值
    if (ctxSize === 0 && baseUrl && apiKey) {
        try {
            var probeMessages = [
                { role: 'system', content: '你是一个乐于助人的助手。回答要简洁。' },
                { role: 'user', content: '请告诉我你的最大上下文窗口是多少token？只回复一个数字，不要任何解释。例如：128000' }
            ];
            var probeResult = null;
            for (var probeAttempt = 0; probeAttempt < 2; probeAttempt++) {
                try {
                    probeResult = await callAI(probeMessages, {
                        stream: false,
                        temperature: 0,
                        max_tokens: 50
                    });
                    break;
                } catch (e) {
                    if (probeAttempt === 0) {
                        console.log('[Context检测] AI自报context 第1次失败，500ms 后重试:', (e && e.message) || e);
                        await new Promise(function(r) { setTimeout(r, 500); });
                    }
                }
            }
            if (probeResult) {
                var probeText = (typeof probeResult === 'string') ? probeResult : (probeResult.content || '');
                var numOnly = probeText.replace(/[^\d]/g, '');
                if (numOnly) {
                    var probeCtx = parseInt(numOnly, 10);
                    if (probeCtx >= 2048 && probeCtx <= 10000000) {
                        ctxSize = probeCtx;
                        console.log('[Context检测] AI自报context（最后手段）: ' + ctxSize + '（注意：此值可能不准确）');
                    }
                }
            }
        } catch (e) {
            console.log('[Context检测] AI自报context失败（已重试），使用兜底默认值');
        }
    }

    // 兜底：使用 DEFAULT_CONTEXT_SIZE（动态化后默认 128000）
    // 多数现代模型支持 128K+，原值 32000 严重低估导致上下文预算被压缩
    if (ctxSize === 0) {
        ctxSize = (typeof DEFAULT_CONTEXT_SIZE !== 'undefined') ? DEFAULT_CONTEXT_SIZE : 128000;
        console.log('[Context检测] 所有探测均失败，使用兜底值 ' + ctxSize + '（此为输入窗口预算，不影响输出max_tokens）');
    }

    gameState.contextSize = ctxSize;
    // 【Token预算修复】同步写入 StateManager，否则 getContextSize() 优先读 StateManager
    // 会返回旧默认值 8192，导致检测到的 200K 上下文无法被利用，输入预算被错误钳制
    if (typeof StateManager !== 'undefined' && StateManager.set) {
        StateManager.set('world.contextSize', ctxSize, { silent: true, allowReadOnly: true });
    }
    console.log('[Context检测] 最终结果(' + model + '): ' + ctxSize);
    return ctxSize;
}

// ========================================
// 开局设定提取：用AI从玩家设定中提取结构化信息，预填充记忆系统
// ========================================
async function extractSetupToMemory(opts) {
    opts = opts || {};
    var setupText = gameState.userPrompt || '';
    if (!setupText || setupText.trim().length < 50) return;

    // 如果记忆系统已有数据（非首次开局），跳过
    if (typeof EnhancedMemory !== 'undefined') {
        var gm = window.GameMemory || (typeof GameMemory !== 'undefined' ? GameMemory : null);
        if (gm) {
            var hasData = Object.keys(gm.tables.characters).length > 0
                || Object.keys(gm.permanentFacts).some(function(k) { return gm.permanentFacts[k] && gm.permanentFacts[k].length > 0; });
            if (hasData) return;
        }
    }

    // 显示提取状态
    var storyEl = document.getElementById('storyText');
    if (storyEl) {
        storyEl.innerHTML = '<div style="text-align:center;padding:40px 0;display:flex;flex-direction:column;align-items:center;text-indent:0;">' +
            '<div style="display:flex;justify-content:center;gap:10px;margin-bottom:16px;">' +
            '<div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>' +
            '<span style="color:var(--text-secondary);font-size:13px;">正在解析设定，建立记忆...</span></div>';
    }

    // 【提示词重设计】从「7条编号规则」改为「场景化引导 + 信任模型」
    // 思路：让 AI 理解「这是在帮一个编剧整理世界观卡片」，自然知道要做什么
    var extractPrompt = '你正在帮一位游戏编剧整理一份设定稿——把散落在设定里的关键信息抽出来，存进结构化表格里，方便后续剧情生成时检索。\n\n' +
        '这份设定里可能藏着：主角是谁、TA周围有哪些角色、这些角色之间是什么关系、有什么关键物品、有什么不能违反的规则。\n' +
        '你凭直觉和文本本身判断哪些值得抽取——规则、限制、铁律、机制、羁绊、承诺，都是后续故事能用的「骨架信息」，看到就抽出来。\n' +
        '没提到的字段就留空数组或默认值，别为了凑数瞎编。\n\n' +
        '关于好感度：陌生人=0，正向=亲近/信任/喜欢，负向=敌对/戒备/冲突。如果设定里没说，按「陌生人0」处理即可。\n\n' +
        '【为什么用JSON】前端会按字段名读取数据，所以字段名要准。直接输出原始JSON文本，别用markdown代码块包起来——解析器只认纯文本。\n\n' +
        '【玩家设定】\n' + setupText;

    try {
        var result = await callAI([
            { role: 'system', content: '你正在帮一位游戏编剧整理设定稿。' },
            { role: 'user', content: extractPrompt }
        ], {
            stream: false,
            temperature: 0.3,
            max_tokens: 4096,
            signal: opts.signal || null,  // 【P0 修复】透传 AbortSignal，支持外部超时取消
            _isBackground: true  // 【P0-1 修复】后台请求，不被 safeAbort() 误杀
        });

        var parsed = parseJSONHelper(result);
        if (!parsed && result) {
            // 【P0 ReDoS 修复】用 extractFirstJSONBlock 线性扫描替代 /\{[\s\S]*\}/ 贪婪正则
            // 原正则对大文本（>10KB）会从首个 { 贪婪匹配到末尾 }，且遇到嵌套结构时回溯开销大
            var _jsonStr = (typeof extractFirstJSONBlock === 'function')
                ? extractFirstJSONBlock(result)
                : (function() { var m = result.match(/\{[\s\S]*\}/); return m ? m[0] : null; })();
            if (_jsonStr) parsed = parseJSONHelper(_jsonStr);
        }
        if (!parsed) {
            console.warn('[设定提取] AI返回无法解析，跳过');
            return;
        }

        var gm = window.GameMemory || (typeof GameMemory !== 'undefined' ? GameMemory : null);
        if (!gm) return;

        // 1. 主角身份 → permanentFacts.pcIdentity
        if (parsed.pcIdentity) {
            gm.addWorldAnchor('pc_identity', parsed.pcIdentity, 'setup_extract', 0);
        }

        // 2. 世界规则 → permanentFacts.worldRules
        if (Array.isArray(parsed.worldRules)) {
            parsed.worldRules.forEach(function(rule) {
                if (rule && typeof rule === 'string' && rule.trim()) {
                    gm.addWorldAnchor('world_rule', rule.trim(), 'setup_extract', 0);
                }
            });
        }

        // 3. 角色 → tables.characters + permanentFacts.npcProfiles
        if (Array.isArray(parsed.characters)) {
            var playerName = gameState.playerName || (gameState.protagonistSetup && gameState.protagonistSetup.mcName) || '';
            parsed.characters.forEach(function(c) {
                if (!c || !c.name) return;
                // 跳过主角（主角不进NPC表）
                if (playerName && (c.name === playerName || c.name.includes(playerName) || playerName.includes(c.name))) return;
                // 写入 permanentFacts.npcProfiles
                var profileDesc = c.name + '：' + (c.title || '') + (c.relation ? '，与主角关系：' + c.relation : '') + (typeof c.favorability === 'number' ? '，好感度' + c.favorability : '') + (c.desc ? '。' + c.desc : '');
                gm.addWorldAnchor('npc_profile', profileDesc, 'setup_extract', 0);

                // 【P2-34修复】统一走 CharacterMutator.mergeCharacters → entities.characters，
                // 不再手动直写 gm.tables.characters。
                // 若 GameMemoryAdapter 已绑定，变更会自动同步；若未绑定，在 extractSetupToMemory 末尾统一同步
                if (typeof CharacterMutator !== 'undefined' && CharacterMutator.mergeCharacters) {
                    CharacterMutator.mergeCharacters([{
                        name: c.name,
                        title: c.title || '',
                        relation: c.relation || '',
                        favorability: typeof c.favorability === 'number' ? c.favorability : 50,
                        desc: c.desc || ''
                    }]);
                } else {
                    throw new Error('[extractSetupToMemory] CharacterMutator 未加载，无法同步角色');
                }
            });
        }

        // 4. 关系 → tables.relationships
        if (Array.isArray(parsed.relationships) && parsed.relationships.length > 0) {
            // [T1-P1-4] 统一走 RelationshipMutator.mergeRelationships → entities.relationships，
            // StateManager._syncLegacyMirror 自动同步 gm.tables.relationships 旧字段
            if (typeof RelationshipMutator !== 'undefined' && RelationshipMutator.mergeRelationships) {
                RelationshipMutator.mergeRelationships(parsed.relationships);
            } else {
                // fallback: Mutator 未加载时仍保留原直写逻辑
                parsed.relationships.forEach(function(r) {
                    if (!r || !r.from || !r.to) return;
                    gm.tables.relationships[r.from + '->' + r.to] = {
                        from: r.from,
                        to: r.to,
                        type: r.type || '',
                        desc: r.desc || '',
                        lastChangedTurn: 0
                    };
                });
                if (typeof _syncRelationshipsToGameState === 'function') {
                    _syncRelationshipsToGameState();
                }
            }
        }

        // 5. 物品 → tables.items
        if (Array.isArray(parsed.items)) {
            parsed.items.forEach(function(item) {
                if (!item || !item.name) return;
                gm.tables.items[item.name] = {
                    name: item.name,
                    qty: item.count || 1,
                    unit: '个',
                    rarity: item.rarity || '普通',
                    desc: item.desc || '',
                    obtainedTurn: 0,
                    lastChangedTurn: 0,
                    gameTime: gm.getGameTimeStr(),
                    accessCount: 0,
                    history: [{ turn: 0, from: 0, to: item.count || 1 }]
                };
            });

            // 统一走 BagMutator.mergeItems → entities.bag，
            // 由 StateManager._syncLegacyMirror 自动同步 currentBag 旧字段
            if (typeof BagMutator !== 'undefined' && BagMutator.mergeItems) {
                BagMutator.mergeItems(parsed.items.map(function(it) {
                    return {
                        name: it.name,
                        count: it.count || 1,
                        desc: it.desc || '',
                        rarity: it.rarity || '普通'
                    };
                }).filter(Boolean));
            } else {

                throw new Error('[extractSetupToMemory] BagMutator 未加载，无法同步物品');
            }
        }

        // 保存记忆数据
        gm.saveToStorage();

        console.log('[设定提取] 完成：' +
            (parsed.characters ? parsed.characters.length : 0) + '个角色, ' +
            (parsed.relationships ? parsed.relationships.length : 0) + '条关系, ' +
            (parsed.items ? parsed.items.length : 0) + '个物品, ' +
            (parsed.worldRules ? parsed.worldRules.length : 0) + '条规则');

        // ========================================
        // 智能压缩：如果设定太长，让AI生成精简总结
        // 规则不丢 → permanentFacts 已存；描述精简 → 节省context
        // ========================================
        var ctxSize = gameState.contextSize || (await detectContextSize());
        var setupTokens = estimateTokensUtil(setupText);
        var setupRatio = setupTokens / ctxSize;

        console.log('[设定压缩] 设定约' + setupTokens + 'tokens, context ' + ctxSize + ', 占比 ' + (setupRatio * 100).toFixed(1) + '%');

        // 如果设定占 context 40%以上，需要压缩
        if (setupRatio > 0.4 && setupText.length > 3000) {
            var targetRatio = 0.25; // 压缩到占context 25%
            var targetChars = Math.floor(ctxSize * targetRatio * 1.7); // 目标字符数

            // 更新加载状态
            if (storyEl) {
                storyEl.innerHTML = '<div style="text-align:center;padding:40px 0;display:flex;flex-direction:column;align-items:center;text-indent:0;">' +
                    '<div style="display:flex;justify-content:center;gap:10px;margin-bottom:16px;">' +
                    '<div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>' +
                    '<span style="color:var(--text-secondary);font-size:13px;">设定较长，正在生成精简总结（规则不丢）...</span></div>';
            }

            try {
                // 【提示词重设计】从「8条编号规则」改为「好精简的样子 + 信任模型」
                // 思路：让 AI 理解「骨架 vs 血肉」的概念，自己判断哪些该留哪些该删
                var compressPrompt = '你正在帮一位游戏编剧精简一份较长的设定稿——目标是「保留骨架、删减血肉」，让后续剧情生成能快速 get 到核心。\n\n' +
                    '你理解什么是骨架：规则、限制、铁律、机制、关键人物设定、关键物品、剧情线索——这些是设定之所以能跑起来的「承重墙」，绝对不能删。\n' +
                    '你理解什么是血肉：环境描写、冗余形容、重复的细节铺陈、文学化的引入段落——这些读起来漂亮，但删掉也不影响后续发挥。\n\n' +
                    '建议用以下标签标注不同类型的内容（方便后续按需取用）：\n' +
                    '- 【规则】标注硬性限制、铁律、机制\n' +
                    '- 【角色】标注关键角色的核心特质\n' +
                    '- 【世界观】标注世界观核心设定\n' +
                    '- 【关键线索】标注关键物品和剧情钩子\n\n' +
                    '目标长度：约' + targetChars + '字（当前原文约' + setupText.length + '字）。\n' +
                    '直接输出精简后的文本即可——别加「好的，这是精简版」之类的开场白，也别加结尾说明。\n\n' +
                    '【原始设定】\n' + setupText;

                var compressedResult = await callAI([
                    { role: 'system', content: '你正在帮一位游戏编剧精简设定稿。' },
                    { role: 'user', content: compressPrompt }
                ], {
                    stream: false,
                    temperature: 0.2,
                    max_tokens: Math.min(targetChars + 500, DEFAULT_MAX_TOKENS)
                });

                if (compressedResult && compressedResult.trim().length > 200) {
                    // 存储精简版到 _setupLayers
                    if (gm._setupLayers) {
                        gm._setupLayers.compressedSetup = compressedResult.trim();
                        gm._setupLayers.compressed = true;
                        gm._setupLayers.originalLength = setupText.length;
                        gm._setupLayers.compressedLength = compressedResult.trim().length;
                    }
                    gm.saveToStorage();
                    console.log('[设定压缩] 完成：' + setupText.length + '字 → ' + compressedResult.trim().length + '字');
                }
            } catch (e) {
                console.warn('[设定压缩] 失败（不影响游戏，将使用完整设定）:', e && e.message);
            }
        } else {
            console.log('[设定压缩] 无需压缩，设定占比合理');
        }
    } catch (e) {
        console.warn('[设定提取] 失败（不影响游戏继续）:', e && e.message);
    }

    // 【P2-34修复】extractSetupToMemory 末尾手动同步：
    // 若 GameMemoryAdapter 尚未绑定（StateManager → gm 同步不可用），手动同步一次
    if (typeof GameMemoryAdapter !== 'undefined' && GameMemoryAdapter.syncToGameMemory) {
        try {
            GameMemoryAdapter.syncToGameMemory();
        } catch (syncErr) {
            console.warn('[extractSetupToMemory] 同步 GameMemory 失败:', syncErr);
        }
    }
}

// ========================================
// System Prompt
// ========================================
async function initializeGame() {
    try {
        // 检测 API 模型的 context size（异步：可能调/models API或询问AI）
        await detectContextSize();

        // 收集主角设定

        // P2 修复 BUG-008 残留：原 mcFields 用旧 id（mcName/mcGender 等），但 HTML 实际 id 是
        // setupPlayerName/setupPlayerGender 等（见 index.html）。读 DOM 永远为空，导致 fallback 失效。
        // 改用 HTML 实际 id 映射到 protagonistSetup 旧 key（保留旧 key 兼容下游读取）。
        if (!gameState.protagonistSetup || Object.keys(gameState.protagonistSetup).length === 0) {
            gameState.protagonistSetup = {};
            // key: protagonistSetup 的 key（兼容下游），value: HTML 元素实际 id
            var mcFields = {
                mcName: 'setupPlayerName',
                mcGender: 'setupPlayerGender',
                mcAge: 'setupPlayerAge',
                mcIdentity: 'setupPlayerIdentity',
                mcPersonality: 'setupPlayerDesc',
                mcAppearance: 'setupPlayerAppearance',
                mcAbility: 'setupPlayerAbility'
            };
            Object.keys(mcFields).forEach(function(k) {
                var el = document.getElementById(mcFields[k]);
                if (el && el.value && el.value.trim()) gameState.protagonistSetup[k] = el.value.trim();
            });
        }

        // 此前新游戏流程从不设置 gameState.playerName，只有读档时（loadGameState）才同步，
        // 导致新游戏个人页始终显示"未命名"
        var _smPlayer = (typeof StateManager !== 'undefined' && StateManager.get) ? (StateManager.get('entities.player') || {}) : (gameState.playerData || {});
        var _smPlayerName = (typeof StateManager !== 'undefined' && StateManager.get) ? (StateManager.get('world.playerName') || '') : (gameState.playerName || '');
        var _mcName = (gameState.protagonistSetup && gameState.protagonistSetup.mcName) || '';
        if (!_smPlayerName && _mcName) _smPlayerName = _mcName;
        if (!_smPlayer.name && _smPlayerName) _smPlayer.name = _smPlayerName;
        // 从主角设定中补全身份等信息
        // 【修复】补全 personality/gender/appearance/ability 字段，之前遗漏导致个人页基本信息为空
        if (gameState.protagonistSetup) {
            if (!_smPlayer.identity && gameState.protagonistSetup.mcIdentity) _smPlayer.identity = gameState.protagonistSetup.mcIdentity;
            if (!_smPlayer.age && gameState.protagonistSetup.mcAge) _smPlayer.age = gameState.protagonistSetup.mcAge;
            if (!_smPlayer.personality && gameState.protagonistSetup.mcPersonality) _smPlayer.personality = gameState.protagonistSetup.mcPersonality;
            if (!_smPlayer.gender && gameState.protagonistSetup.mcGender) _smPlayer.gender = gameState.protagonistSetup.mcGender;
            if (!_smPlayer.appearance && gameState.protagonistSetup.mcAppearance) _smPlayer.appearance = gameState.protagonistSetup.mcAppearance;
            if (!_smPlayer.ability && gameState.protagonistSetup.mcAbility) _smPlayer.ability = gameState.protagonistSetup.mcAbility;
        }
        if (typeof StateManager !== 'undefined' && StateManager.set) {
            // 【ISSUE-009 修复】world.* 域强制只读，需显式 allowReadOnly 才能写入
            // 原代码未带 allowReadOnly，导致写入被拒、控制台告警，且"未命名"修复实际无效
            if (_smPlayerName) StateManager.set('world.playerName', _smPlayerName, { silent: true, allowReadOnly: true });
            if (_smPlayer.name) StateManager.set('entities.player', _smPlayer, { silent: true });
        }
        // 同步到 gameState.playerData，让 renderPlayerPage 能立即显示主角信息
        gameState.playerData = _smPlayer;
        gameState.playerName = _smPlayerName;
        var _systemPrompt = (typeof RuntimeBridge !== 'undefined' && RuntimeBridge.buildSystemPrompt) ? RuntimeBridge.buildSystemPrompt() : '';
        if (typeof StateManager !== 'undefined' && StateManager.set) {
            StateManager.set('progress.conversationHistory', [{ role: 'system', content: _systemPrompt }], { silent: true });
        }

// 旧代码在此注入【写作风格要求】对话，与文风选择（writingStyle）语义重复，可能互相矛盾
// 初始化游戏时间显示
if (typeof GameTimeSystem !== 'undefined') {
    GameTimeSystem.updateUI();
}
// 开局前：用AI提取设定，预填充记忆系统（按次计费，多一次API调用无妨）
// 【P0 修复】给 extractSetupToMemory 加 30 秒超时保护：
// callAI 默认超时 10 分钟，若 API 端点对非流式请求不响应，extractSetupToMemory 会挂起 10 分钟，
// 期间 sendAIRequest 永远不会被调用，游戏卡死在"正在解析设定..."界面。
// 超时后直接跳过设定提取，进入开局。
var _setupAbortAC = new AbortController();
var _setupTimeoutMs = 240000; // 240 秒超时（用户要求4分钟，给推理模型充足时间）
TimerManager.setTimeout('extractSetupTimeout', function() {
    try { _setupAbortAC.abort(new Error('设定提取超时（240s）')); } catch(e) {}
}, _setupTimeoutMs);

var _setupPromise = extractSetupToMemory({ signal: _setupAbortAC.signal });
var _setupTimeoutPromise = new Promise(function(_, reject) {
    TimerManager.setTimeout('extractSetupTimeoutReject', function() {
        reject(new Error('设定提取超时'));
    }, _setupTimeoutMs + 500);
});

Promise.race([_setupPromise, _setupTimeoutPromise]).then(function() {
    console.log('[开局设定提取] 完成');
    if (typeof RuntimeBridge !== 'undefined' && RuntimeBridge.sendAIRequest) {
        RuntimeBridge.sendAIRequest('请开始游戏，描述开局场景。', true);
    }
}).catch(function(e) {
    console.warn('[开局设定提取] 失败/超时，直接开局:', e && e.message);
    // 【BUG-027 修复】设定提取超时不影响主游戏生成
    // 大预设(几千字)的设定提取可能超过240s超时，此时API配置会被标记为"近期超时"
    // 如果不清除，主游戏生成将跳过该配置导致"没有可用API配置"错误
    if (typeof LocalGameAPI !== 'undefined' && LocalGameAPI._configs) {
        for (var i = 0; i < LocalGameAPI._configs.length; i++) {
            if (LocalGameAPI._markModelSuccess) {
                LocalGameAPI._markModelSuccess(i);
            }
        }
        console.log('[开局设定提取] 已清除API配置冷却状态，确保主游戏生成可用');
    }
    if (typeof RuntimeBridge !== 'undefined' && RuntimeBridge.sendAIRequest) {
        RuntimeBridge.sendAIRequest('请开始游戏，描述开局场景。', true);
    }
});
} catch (e) {
console.error('初始化游戏失败:', e);
UI.toast('游戏初始化失败: ' + translateError(e.message));
}
}
// ========================================
// 世界书系统 (World Info / Lorebook)
// 兼容 SillyTavern 世界书格式
// ========================================
