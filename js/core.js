// ========================================
// 第0层: 全局变量和配置
// ========================================
// 【已清理】移除开发模式日志重定向，减少运行时开销
// ========================================
// 自由剧本 - 完整游戏逻辑
// ========================================
//
// 【P1修复BUG-5.9 / P1-7.1】core.js 上帝文件与循环依赖
// -----------------------------------------------
// 本文件 5500+ 行混合 13 个职责域：
//   1.  数据同步（_sync*/_push*）
//   2.  UI 弹窗/导航/模态（UI 对象）
//   3.  API Key 混淆（_obfuscateKey 等）
//   4.  API 配置与重试（LocalGameAPI）
//   5.  IndexedDB 存档（SaveDB）
//   6.  题材库（THEME_LIBRARY）
//   7.  全局状态工厂（createDefaultGameState/ensureGameStateFields/resetRuntimeState/RuntimeState）
//   8.  打字机（TypewriterBuffer）
//   9.  时间系统（GameTimeSystem）
//   10. JSON 解析 + 小剧场映射（extractStr/parseXxxContent/_mapTheaterByKey）
//   11. 错误翻译/HTML 净化（translateError/_cleanUnrecognizedTags）
//   12. AI 请求构建（callAI/sendAIRequest）
//
// 与 game.js 形成双向循环依赖：
//   - core.js → game.js：formatStory / mergeCharacters / renderChoices / renderNpcList /
//                  buildSystemPrompt / buildSaveData / sendAIRequest / _isThinkingContent /
//                  _cleanUnrecognizedTags / _reDecorTagsTyping
//   - game.js → core.js：TypewriterBuffer / callAI / parseAIResponse / translateError /
//                  showError / LocalGameAPI / SaveDB / UI / autoSave / RuntimeState
//
// 由于所有调用点都是「延迟调用」（运行时已加载完成，未在顶层立即使用），
// 循环依赖在运行时不报错；但使 core.js 无法被独立加载或单元测试。
//
// 修复路线（与 P1-7.1 共同推进，分阶段执行）：
//   - 短期（本注释）：明确边界 + 标注职责域，便于后续拆分定位
//   - 中期：将 game.js 内的 core.js 调用入口（formatStory/renderChoices 等）抽到
//            `js/core/runtime-bridge.js` 中转模块，core.js 改调中转模块，
//            打破对 game.js 的直接依赖
//   - 长期：core.js 按职责拆为 core/{data-sync,ui,api,save,theme,state-factory,
//            typewriter,time,parser,error,ai-request}.js，每个模块可独立测试
//
// 注：当前会话内仅完成短期文档化，物理拆分延后到独立重构任务（涉及 80+ 调用点迁移）。

// 【P1修复BUG-2.2】删除 GameLinker 整套联动系统：
// 原实现 _refreshers 永远为空对象（register 全代码库零调用），
// 但 25+ 处仍调 refreshByDataChange/refreshAll，每次触发无意义的 rAF + 空对象遍历。
// 数据变更后的 UI 刷新已由各具体调用方主动触发（如 renderNpcList/renderQuests 等），
// GameLinker 这层"广播"是死代码，直接删除。

// ========================================
// 数据联通（方案 A：单一来源）
// ========================================
// 设计：gm.tables.* / gm.quests / gm.events 是权威源
//       gameState.allCharacters / currentBag / currentQuests / relationships / keyEvents 是视图
// 任何写入权威源后，调用 _ensureDataLinkage() 自动同步到视图
// 视图别名：gameState.allCharacters === gm.tables.characters（同一引用，最快）
// ========================================

// 物品同步：gm.tables.items (keyed) → gameState.currentBag (array) + StateManager
// 【全量修复】此函数是 bag 写入的同步点之一：
// 由它统一更新 gameState.currentBag 旧字段 + StateManager.set('entities.bag') 新状态层
function _syncItemsToBag() {
    if (typeof gameState === 'undefined' || !gameState) return;
    if (typeof window === 'undefined' || !window.GameMemory) return;
    var gm = window.GameMemory;
    if (!gm.tables || !gm.tables.items) return;
    var items = gm.tables.items;
    var bag = [];
    Object.keys(items).forEach(function(name) {
        var it = items[name];
        if (!it) return;
        bag.push({
            name: it.name || name,
            count: it.qty || 1,
            unit: it.unit || '个',
            rarity: it.rarity || '普通',
            desc: it.desc || '',
            usable: it.usable || false,
            effect: it.effect || '',
            equippable: it.equippable || false,
            equipped: it.equipped || false,
            slot: it.slot || ''
        });
    });
    gameState.currentBag = bag;
    // 【全量修复】同步到 StateManager，让 _syncLegacyMirror 维护镜像一致性
    // silent:true 避免循环通知（此函数本身是被各种写入路径调用的下游同步）
    if (typeof StateManager !== 'undefined' && StateManager.set) {
        StateManager.set('entities.bag', bag, { silent: true });
    }
}

// 任务同步：gm.quests (array) → gameState.currentQuests (array, 旧格式) + StateManager
// 【全量修复】此函数是 quests 写入的同步点之一：
// 由它统一更新 gameState.currentQuests 旧字段 + StateManager.set('entities.quests') 新状态层
// 【P1修复P1-M】gm.quests 已统一为 QuestMutator schema（title 为身份字段），
// 无需 title↔content 别名映射，直接透传 title/type/status/progress/hint
function _syncQuestsToGameState() {
    if (typeof gameState === 'undefined' || !gameState) return;
    if (typeof window === 'undefined' || !window.GameMemory) return;
    var gm = window.GameMemory;
    if (!Array.isArray(gm.quests)) return;
    var arr = gm.quests.map(function(q) {
        return {
            title: q.title || '',
            type: q.type || 'quest',
            status: q.status || 'pending',
            progress: q.progress || '',
            hint: q.hint || ''
        };
    });
    gameState.currentQuests = arr;
    // 【全量修复】同步到 StateManager，让 _syncLegacyMirror 维护镜像一致性
    if (typeof StateManager !== 'undefined' && StateManager.set) {
        StateManager.set('entities.quests', arr, { silent: true });
    }
}

// 关系同步：gm.tables.relationships (keyed) → gameState.relationships (array) + StateManager
// 【阶段5统一】此函数是 relationships 写入的唯一同步点：
// 任何修改 gameState.relationships 的路径最终都必须经过此函数（直接调用或经由 _pushRelationshipsToGM 回流）
// 由它统一更新 gameState.relationships 旧字段 + StateManager.set('entities.relationships') 新状态层
function _syncRelationshipsToGameState() {
    if (typeof gameState === 'undefined' || !gameState) return;
    if (typeof window === 'undefined' || !window.GameMemory) return;
    var gm = window.GameMemory;
    var arr;
    if (!gm.tables || !gm.tables.relationships) {
        arr = [];
    } else {
        var rels = gm.tables.relationships;
        arr = [];
        Object.keys(rels).forEach(function(key) {
            var r = rels[key];
            if (!r) return;
            if (Array.isArray(r)) {
                r.forEach(function(item) { arr.push(item); });
            } else {
                arr.push(r);
            }
        });
    }
    gameState.relationships = arr;
    // 【阶段5】同步到 StateManager，让 _syncLegacyMirror 维护镜像一致性
    // silent:true 避免循环通知（此函数本身是被各种写入路径调用的下游同步）
    if (typeof StateManager !== 'undefined' && StateManager.set) {
        StateManager.set('entities.relationships', arr, { silent: true });
    }
}

// 事件同步：gm.events (对象数组) → gameState.keyEvents (字符串数组) + StateManager.entities.events (对象数组)
// 【阶段1-A2】统一 schema：gm.events 和 StateManager.entities.events 都保持对象数组
// gameState.keyEvents 保持字符串数组（旧格式兼容），由 _syncLegacyMirror 自动转换
function _syncEventsToKeyEvents() {
    if (typeof gameState === 'undefined' || !gameState) return;
    if (typeof window === 'undefined' || !window.GameMemory) return;
    var gm = window.GameMemory;
    if (!Array.isArray(gm.events)) return;
    // gameState.keyEvents 保持字符串数组（旧格式，_syncLegacyMirror 也会自动转换）
    gameState.keyEvents = gm.events.map(function(e) {
        return typeof e === 'string' ? e : (e && e.content || '');
    }).filter(function(s) { return s && s.length > 0; });
    // StateManager.entities.events 保持对象数组（新格式，权威源）
    // _syncLegacyMirror 会自动将对象数组转为字符串数组镜像到 gameState.keyEvents
    if (typeof StateManager !== 'undefined' && StateManager.set) {
        StateManager.set('entities.events', gm.events, { silent: true });
    }
}

// 总入口：把所有权威源同步到视图
function _ensureDataLinkage() {
    if (typeof gameState === 'undefined' || !gameState) return;
    if (typeof window === 'undefined' || !window.GameMemory) return;
    var gm = window.GameMemory;
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
    if (typeof gameState === 'undefined' || !gameState) return;
    if (typeof window === 'undefined' || !window.GameMemory) return;
    var gm = window.GameMemory;
    if (!gm.tables) gm.tables = {};
    if (!gm.tables.items) gm.tables.items = {};
    if (!Array.isArray(gameState.currentBag)) return;
    gameState.currentBag.forEach(function(b) {
        if (!b || !b.name) return;
        var existing = gm.tables.items[b.name];
        if (existing) {
            if (b.count !== undefined) existing.qty = b.count;
            if (b.unit) existing.unit = b.unit;
            if (b.rarity) existing.rarity = b.rarity;
            if (b.desc !== undefined) existing.desc = b.desc;
            if (b.usable !== undefined) existing.usable = b.usable;
            if (b.effect !== undefined) existing.effect = b.effect;
            if (b.equippable !== undefined) existing.equippable = b.equippable;
            if (b.equipped !== undefined) existing.equipped = b.equipped;
            if (b.slot !== undefined) existing.slot = b.slot;
            existing.lastChangedTurn = gm.currentTurn;
        } else {
            gm.tables.items[b.name] = {
                name: b.name,
                qty: b.count || 1,
                unit: b.unit || '个',
                rarity: b.rarity || '普通',
                desc: b.desc || '',
                usable: b.usable || false,
                effect: b.effect || '',
                equippable: b.equippable || false,
                equipped: b.equipped || false,
                slot: b.slot || '',
                obtainedTurn: gm.currentTurn,
                lastChangedTurn: gm.currentTurn
            };
        }
    });
}

// 把 gameState.currentQuests 反向推送到 gm.quests
// 【P1修复P1-M】gm.quests 已统一为 QuestMutator schema（title 为身份字段），
// 无需 title↔content 别名映射，直接用 title 作为去重键
function _pushCurrentQuestsToGM() {
    if (typeof gameState === 'undefined' || !gameState) return;
    if (typeof window === 'undefined' || !window.GameMemory) return;
    var gm = window.GameMemory;
    if (!Array.isArray(gm.quests)) gm.quests = [];
    if (!Array.isArray(gameState.currentQuests)) return;
    var titleMap = {};
    gm.quests.forEach(function(q) { if (q && q.title) titleMap[q.title] = q; });
    gameState.currentQuests.forEach(function(cq) {
        if (!cq || !cq.title) return;
        var gq = titleMap[cq.title];
        if (!gq) {
            gq = { title: cq.title, type: cq.type || 'quest', status: 'pending', createdTurn: gm.currentTurn || 0, resolvedTurn: 0 };
            gm.quests.push(gq);
            titleMap[cq.title] = gq;
        }
        gq.type = cq.type || gq.type;
        // 状态映射：中文 → gm 内部状态
        if (cq.status === '已完成' || cq.status === 'resolved') {
            gq.status = 'resolved';
            if (!gq.resolvedTurn) gq.resolvedTurn = gm.currentTurn || 0;
        } else if (cq.status === '已失败' || cq.status === '失败' || cq.status === 'broken') {
            // 【修复 P1】兼容 '已失败'（QuestMutator.STATUS.FAILED）和 '失败'（旧数据）
            gq.status = 'broken';
            if (!gq.resolvedTurn) gq.resolvedTurn = gm.currentTurn || 0;
        } else {
            gq.status = 'pending';
        }
    });
}

// 把 gameState.relationships 反向推送到 gm.tables.relationships
function _pushRelationshipsToGM() {
    if (typeof gameState === 'undefined' || !gameState) return;
    if (typeof window === 'undefined' || !window.GameMemory) return;
    var gm = window.GameMemory;
    if (!gm.tables) gm.tables = {};
    if (!gm.tables.relationships) gm.tables.relationships = {};
    if (!Array.isArray(gameState.relationships)) return;
    // 用 from→to 作为 key
    gameState.relationships.forEach(function(r) {
        if (!r || !r.from || !r.to) return;
        var key = r.from + '→' + r.to;
        if (gm.tables.relationships[key]) {
            Object.assign(gm.tables.relationships[key], r);
        } else {
            gm.tables.relationships[key] = Object.assign({}, r);
        }
    });
}

// 把 gameState.keyEvents 反向推送到 gm.events
// 【阶段1-A2】此函数处理 <mem> 标签等直接写 gameState.keyEvents 的旧路径
// 推送后调用 _syncEventsToKeyEvents 统一同步（对象数组写 StateManager）
function _pushKeyEventsToGM() {
    if (typeof gameState === 'undefined' || !gameState) return;
    if (typeof window === 'undefined' || !window.GameMemory) return;
    var gm = window.GameMemory;
    if (!Array.isArray(gm.events)) gm.events = [];
    if (!Array.isArray(gameState.keyEvents)) return;
    gameState.keyEvents.forEach(function(evt) {
        if (typeof evt !== 'string' || !evt) return;
        var exists = gm.events.some(function(e) {
            var content = typeof e === 'string' ? e : (e.content || '');
            return content === evt;
        });
        if (!exists) {
            gm.events.push({ content: evt, importance: 7, source: 'story_parsed', turn: gm.currentTurn || 0 });
        }
    });
    // 【阶段1-A2】统一通过 _syncEventsToKeyEvents 同步到 StateManager（对象数组）
    // 旧代码直接 StateManager.set('entities.events', gameState.keyEvents) 会写入字符串数组，
    // 与 _applyKeyEvents 的对象数组 schema 冲突
    if (typeof _syncEventsToKeyEvents === 'function') {
        _syncEventsToKeyEvents();
    }
}

// 拦截 gm.saveToStorage：保存后自动同步 + 通知 UI
// 【P1-10修复】
// 1. 用 TimerManager 替代裸 setInterval/setTimeout（GlobalCleanup.cleanup 可统一清理）
// 2. 超时从 10 秒延长至 60 秒：慢设备/GameMemory 因 IndexedDB 迁移或世界书扫描延迟时，
//    10 秒内可能未完成初始化，导致 saveToStorage 永不被包装，后续所有保存都跳过 _ensureDataLinkage
// 3. 超时时输出错误日志（便于排查"数据同步失效"问题）
(function _wrapGMSaveToStorage() {
    if (typeof window === 'undefined') return;
    if (typeof TimerManager === 'undefined' || !TimerManager.setInterval) {
        // TimerManager 不可用时 fallback 到裸定时器（保持兼容）
        var checkIntervalLegacy = setInterval(function() {
            if (window.GameMemory && window.GameMemory.saveToStorage && !window.GameMemory._saveToStorageWrapped) {
                var orig = window.GameMemory.saveToStorage;
                window.GameMemory.saveToStorage = function() {
                    var result = orig.apply(this, arguments);
                    try { _ensureDataLinkage(); } catch (e) { console.warn('[DataLinkage] 同步失败:', e); }
                    return result;
                };
                window.GameMemory._saveToStorageWrapped = true;
                clearInterval(checkIntervalLegacy);
            }
        }, 200);
        setTimeout(function() { clearInterval(checkIntervalLegacy); }, 60000);
        return;
    }
    var checkKey = 'gmSaveWrap';
    TimerManager.setInterval(checkKey, function() {
        if (window.GameMemory && window.GameMemory.saveToStorage && !window.GameMemory._saveToStorageWrapped) {
            var orig = window.GameMemory.saveToStorage;
            window.GameMemory.saveToStorage = function() {
                var result = orig.apply(this, arguments);
                try { _ensureDataLinkage(); } catch (e) { console.warn('[DataLinkage] 同步失败:', e); }
                return result;
            };
            window.GameMemory._saveToStorageWrapped = true;
            TimerManager.clearInterval(checkKey);
        }
    }, 200);
    // 60 秒后停止检查并输出错误日志（GameMemory 仍未就绪 = 数据同步将失效）
    TimerManager.setTimeout(checkKey + '_cleanup', function() {
        if (!window.GameMemory || !window.GameMemory._saveToStorageWrapped) {
            console.error('[DataLinkage] GameMemory 60 秒内未就绪，saveToStorage 未被包装，数据同步将失效');
        }
        TimerManager.clearInterval(checkKey);
    }, 60000);
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
    toast: function(msg) {
        var ct = DOMCache.get('toastContainer', true);
        if (!ct) return;
        var t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        // 【阶段三】屏幕阅读器播报
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
        // 【修复BUG-M3】离开日志页时自动关闭子页面，防止子页面覆盖到其他页面
        if (fromPage && fromPage.id === 'logPage' && id !== 'logPage' && typeof closeLogSubPage === 'function') {
            try { closeLogSubPage(); } catch (e) {}
        }
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
    // 【阶段三】可聚焦元素选择器（用于焦点陷阱）
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
            // 【阶段三】ARIA 属性：标记为模态对话框
            if (!el.getAttribute('role')) el.setAttribute('role', 'dialog');
            el.setAttribute('aria-modal', 'true');
            // 尝试关联标题
            var titleEl = el.querySelector('.modal-title, .modal-header h3, h3, h2, .title');
            if (titleEl) {
                if (!titleEl.id) titleEl.id = id + '_title';
                el.setAttribute('aria-labelledby', titleEl.id);
            }
            // 【阶段三】焦点管理：移到第一个可聚焦元素，或弹窗本身
            this._focusModal(el);
            // 【阶段三】绑定全局键盘事件（仅一次）
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
    // 【阶段三】将焦点移入弹窗
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
    // 【阶段三】绑定全局弹窗键盘事件（Escape 关闭、Tab 焦点陷阱）
    _bindModalKeyboard: function() {
        if (this._modalKeydownBound) return;
        this._modalKeydownBound = true;
        document.addEventListener('keydown', function(e) {
            if (UI._modalStack.length === 0) return;
            var topId = UI._modalStack[UI._modalStack.length - 1];
            var topModal = document.getElementById(topId);
            if (!topModal) return;

            // Escape 关闭最顶层弹窗（confirm/prompt/generating 需要明确操作，不关闭）
            if (e.key === 'Escape' || e.code === 'Escape' || e.keyCode === 27) {
                if (topId === 'confirmModal' || topId === 'promptModal' || topId === 'generatingModal') return;
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
        content.innerHTML = opts.html || '';
        content.style.cssText = 'background:var(--card);border-radius:var(--radius-lg);max-width:400px;width:90%;max-height:80vh;overflow-y:auto;padding:20px;';
        overlay.appendChild(content);
        document.body.appendChild(overlay);
        // 注册关闭回调和持久化标记（由 hideModal 统一调度）
        if (opts.onClose) overlay._onClose = opts.onClose;
        overlay._persistent = !!opts.persistent;
        overlay._isDynamic = true; // 标记为动态创建的弹窗
        // 【阶段三】动态弹窗内容基础 ARIA 增强
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
            // 【阶段三】恢复焦点到打开弹窗前的元素（当所有弹窗都关闭时）
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
    // 【性能优化】用 _hasBound 标记代替 cloneNode，避免每次创建新元素
    if (!yesBtn._confirmHandler) {
        yesBtn._confirmHandler = function() {
            UI.hideModal('confirmModal');
            if (yesBtn._confirmResolve) yesBtn._confirmResolve(true);
        };
        yesBtn.addEventListener('click', yesBtn._confirmHandler);
    }
    yesBtn._confirmResolve = resolve;
    // 绑定"否"按钮，防止Promise永远悬挂
    var noBtn = document.getElementById('confirmNo');
    if (noBtn) {
        if (!noBtn._confirmHandler) {
            noBtn._confirmHandler = function() {
                UI.hideModal('confirmModal');
                if (noBtn._confirmResolve) noBtn._confirmResolve(false);
            };
            noBtn.addEventListener('click', noBtn._confirmHandler);
        }
        noBtn._confirmResolve = resolve;
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
    // 【性能优化】用 _hasBound 标记代替 cloneNode
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
            setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
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
        try { if (window.GameMemory) GameMemory.saveToStorage(); } catch (e) { console.warn('[afterMemoryChange] saveToStorage:', e); }
        // 【P1修复BUG-2.2】移除 GameLinker.refreshByDataChange：死代码空操作
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
        // 【优化 #10】返回浅拷贝，外部修改不会污染内部状态
        var cfg = this._configs[this._currentSlot] || this._configs[0];
        return cfg ? Object.assign({}, cfg) : null;
    },
    setConfig(slot, config) {
        this._configs[slot] = {
            ...this._configs[slot],
            ...config
            };
        this.save();
    },
    setCurrentSlot(slot) {
        this._currentSlot = slot;
        this.save();
    },
    setAutoRotate(val) {
        this._autoRotate = val;
        this.save();
    },
    async tryWithFallback(requestFn) {
        // 网络错误重试配置
        const MAX_RETRIES = 3; // 每个配置最多重试3次
        const RETRY_DELAY_BASE = 1000; // 基础延迟1秒
        // 【优化 #16】本轮调用的起始时间，用于埋点每个 slot 的耗时
        var startTs = Date.now();

        async function retryRequest(slotIdx, attempt) {
            try {
                const result = await requestFn(slotIdx);
                return result;
                } catch (e) {
                // 【优化 #8】网络错误判定改用原生字段，不再依赖翻译后的字符串匹配
                // translateError 之后文案是中文的，一旦未来改 i18n 这里就漏判
                var isRetryable =
                    (e && e.name === 'AbortError') ||
                    (e && e.name === 'TypeError' && /fetch|network/i.test(String(e.message || ''))) ||
                    (e && (e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' || e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN')) ||
                    (e && /network|fetch failed|timeout|aborted/i.test(String(e.message || '')));

                if (isRetryable && attempt < MAX_RETRIES - 1) {
                    var delay = RETRY_DELAY_BASE * Math.pow(2, attempt); // 指数退避
                    console.log('[重试] 配置 ' + (slotIdx + 1) + ' 第' + (attempt + 1) + '次失败，' + delay + 'ms后重试...');
                    await new Promise(function(resolve) { setTimeout(resolve, delay); });
                    return retryRequest(slotIdx, attempt + 1);
                }
                throw e;
            }
    }

    if (!this._autoRotate) {
        try {
            var result = await retryRequest(this._currentSlot, 0);
            this._logRequest(this._currentSlot, true, '', Date.now() - startTs);
            return result;
            } catch (e) {
            var _singleErr = (e && e.message) ? e.message : String(e);
            this._logRequest(this._currentSlot, false, _singleErr, Date.now() - startTs);
            this._markModelFailed(this._currentSlot, _singleErr);
            throw e;
            }
    }
    const totalSlots = this._configs.length;
    let attemptedCount = 0;
    // 轮换顺序：当前 slot 起循环，失败标记仅作 UI 提醒，不影响轮换顺序
    var orderedSlots = [];
    for (let i = 0; i < totalSlots; i++) {
        orderedSlots.push((this._currentSlot + i) % totalSlots);
    }
    // 【修复P0-1】聚合各配置失败原因，让最终错误信息透明
    var failReasons = [];
    for (let attempt = 0; attempt < totalSlots; attempt++) {
        const slotIdx = orderedSlots[attempt];
        const cfg = this._configs[slotIdx];
        // 跳过配置不完整的API
        if (!cfg.baseUrl || !cfg.apiKey) {
            console.log('[API轮换] 配置 ' + (slotIdx + 1) + ' 不完整，跳过');
            continue;
        }
        // 【优化】跳过近期因超时失败的配置，避免连续超时浪费用户时间
        if (this.isSlotTimeoutRecent(slotIdx)) {
            console.log('[API轮换] 配置 ' + (slotIdx + 1) + ' 近期超时，跳过');
            continue;
        }
        // 注意：不再自动跳过"近期失败"的模型——失败只是 UI 提醒，玩家想用就能用
        // 如果某个模型一直挂，玩家会在 UI 上看到 ⚠️ 提醒，自然会换或调整
        attemptedCount++;
    try {
        const result = await retryRequest(slotIdx, 0);
        this._logRequest(slotIdx, true, '', Date.now() - startTs);
        if (attempt > 0 && slotIdx !== this._currentSlot) {
            this.setCurrentSlot(slotIdx);
            UI.toast('已自动切换到配置 ' + (slotIdx + 1));
        }
        return result;
        } catch (e) {
        var errMsg = translateError((e && e.message) ? e.message : String(e));
        this._logRequest(slotIdx, false, errMsg, Date.now() - startTs);
        // 失败标记记录原因，超时模型会在短期内被跳过
        this._markModelFailed(slotIdx, errMsg);
        console.warn('配置 ' + (slotIdx + 1) + ' (' + cfg.model + ') 调用失败:', errMsg);
        // 【修复P0-1】记录失败原因，用于最终错误聚合
        failReasons.push('配置' + (slotIdx + 1) + '(' + (cfg.model || '?') + '): ' + errMsg);
        // 超时错误给出明确提示
        if (/timeout|timed out|超时/i.test(errMsg)) {
            UI.toast('配置 ' + (slotIdx + 1) + ' 请求超时，已临时跳过');
        } else if (attemptedCount < totalSlots && !/model_not_found|invalid_api_key|authentication_error|context_length_exceeded|insufficient_quota/i.test(errMsg)) {
            UI.toast('配置 ' + (slotIdx + 1) + ' 失败，尝试下一个...');
        }
    }
    }
    // 更详细的错误信息
    if (attemptedCount === 0) {
        throw new Error('没有可用的API配置，请检查API设置（URL和Key是否完整）');
    }
    // 【修复P0-1】最终错误附带各配置失败原因，让用户知道真正失败原因
    // 只保留前 3 条原因避免过长，每条截断到 100 字符
    var shortReasons = failReasons.slice(0, 3).map(function(r) {
        return r.length > 100 ? truncateByChars(r, 100, '...') : r;
    });
    var reasonSummary = shortReasons.length > 0 ? '\n失败原因：\n' + shortReasons.join('\n') : '';
    throw new Error('所有 ' + attemptedCount + ' 个可用配置均调用失败' + reasonSummary);
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
        // 【优化 #14】key 改为 slot+model 组合
        // 之前用 model 名，两个 slot 用同模型时一个挂会误标记另一个
        var key = slot + '|' + cfg.model;
        // 【优化】记录失败原因，便于超时时跳过近期失败的配置
        this._failedModels[key] = { time: Date.now(), reason: reason || 'unknown' };
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
    // 【优化 #14】按 slot 判断是否被标记为失败（与 _markModelFailed 的 key 对应）
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
    isModelFailed(modelName) {
        if (!modelName || !this._failedModels[modelName]) return false;
        // 24小时过期机制，与注释描述一致
        // 之前是永久生效，导致所有模型一旦失败过一次就永远被跳过
        var failedAt = this._getFailedTime(this._failedModels[modelName]);
        var now = Date.now();
        var TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
        if (now - failedAt > TWENTY_FOUR_HOURS) {
            // 已过期，清除失败标记
            delete this._failedModels[modelName];
            this.save();
            return false;
        }
        return true;
    },
    // 【优化】检查某个 slot 是否在近期因超时失败
    isSlotTimeoutRecent(slot, withinMs) {
        var cfg = this._configs[slot];
        if (!cfg || !cfg.model) return false;
        var key = slot + '|' + cfg.model;
        var record = this._failedModels[key];
        if (!record) return false;
        var reason = this._getFailedReason(record);
        var failedAt = this._getFailedTime(record);
        if (!/timeout|timed out|超时/i.test(reason)) return false;
        return (Date.now() - failedAt) < (withinMs || 5 * 60 * 1000);
    },
    getFailedModels() {
        var result = [];
        for (let m in this._failedModels) {
            // 【优化 #14】key 可能是 "slot|model" 形式，UI 显示时拆出 model
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
    // 【分类标签】UI提醒列表——纯分类，无任何功能限制
    // 作用：在UI上给模型打个标签（如"已下架""不推荐"），提醒玩家注意
    // 重要：列表中的模型完全可以正常使用，调用/轮换/重试逻辑均不检查此列表
    // 添加/删除模型到此列表，只影响UI显示，不影响任何功能
    // 【修复X20】移除硬编码的模型名——不同中转站下架情况不同，硬编码会误标
    // 改为空列表，如需标记特定模型，用户可自行添加
    _deprecatedModels: [],
    // 【纯查询】判断模型是否在分类标签中，仅用于UI显示，不影响功能
    isModelDeprecated(modelName) {
        return modelName && this._deprecatedModels.indexOf(modelName) !== -1;
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
    _networkStatus: 'unknown',
    async checkConnectivity(baseUrl) {
        var testUrl = this.normalizeUrl(baseUrl) + '/models';
        // 优先使用传入 baseUrl 对应配置的 apiKey，其次用当前配置
        var matchedCfg = this._configs.find(function(c) { return c.baseUrl && LocalGameAPI.normalizeUrl(c.baseUrl) === LocalGameAPI.normalizeUrl(baseUrl); });
        var apiKey = matchedCfg ? matchedCfg.apiKey : (this.getCurrentConfig() || {}).apiKey;
        var headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
        try {
            var controller = new AbortController();
            var timeoutId = setTimeout(function() { controller.abort(); }, 8000);
            var res = await fetch(testUrl, { method: 'GET', headers: headers, signal: controller.signal });
            clearTimeout(timeoutId);
            this._networkStatus = res.ok ? 'connected' : 'error';
            return { ok: res.ok, status: res.status, message: res.ok ? '连接正常' : 'HTTP ' + res.status };
        } catch (e) {
            this._networkStatus = 'disconnected';
            var msg = '';
            if (e.name === 'AbortError') msg = '连接超时（8秒无响应）';
            else if (e.message && e.message.includes('Failed to fetch')) msg = '网络不可达（DNS解析失败或被阻断）';
            else msg = (e && e.message) || '未知错误';
            return { ok: false, status: 0, message: msg };
        }
    },
    getNetworkStatus() {
        return this._networkStatus;
    },
    async fetchModels(baseUrl, apiKey) {
        if (!baseUrl) return [];
        try {
            const url = this.normalizeUrl(baseUrl) + '/models';
            const res = await fetch(url, {
                headers: {
                    'Authorization': 'Bearer ' + apiKey
                }
            });
            if (res.ok) {
                const data = await res.json();
                return (data.data || []).map(m => m.id).sort();
                } else {
                throw new Error(translateError('HTTP错误: ' + res.status));
            }
        } catch (e) {
        throw new Error('无法获取模型列表。建议：手动输入模型名称');
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
    DB_VERSION: 2,
    STORE_NAME: 'saves',
    _db: null,
    _ready: false,
    _useFallback: false,
    _fallbackFailCount: 0,
    MAX_FALLBACK_FAILS: 3,
    async init() {
        if (this._ready) return;
        try {
            this._db = await new Promise((resolve, reject) => {
                const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
                // 添加超时保护，防止 IndexedDB 在某些环境中永远不响应
                var timeoutId = TimerManager.setTimeout('idbOpenTimeout', function() {
                    reject(new Error('IndexedDB open timeout'));
                }, 3000);
                req.onupgradeneeded = function(e) {
                    var db = e.target.result;
                    if (!db.objectStoreNames.contains('saves')) {
                        db.createObjectStore('saves');
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
            console.log('✅ IndexedDB 就绪');
        } catch (e) {
            console.warn('⚠️ IndexedDB 不可用，回退 localStorage:', e);
            this._useFallback = true;
            this._ready = true;
        }
    },
    // ── 底层原始读写（带一次重试，偶发错误不立即永久 fallback） ──
    async _getRaw(key) {
        return await new Promise(function(resolve, reject) {
            var tx = SaveDB._db.transaction('saves', 'readonly');
            var req = tx.objectStore('saves').get(key);
            req.onsuccess = function() { resolve(req.result || null); };
            req.onerror = function() { reject(req.error || new Error('IDB get error')); };
        });
    },
    async _setRaw(key, data) {
        return await new Promise(function(resolve, reject) {
            var tx = SaveDB._db.transaction('saves', 'readwrite');
            var store = tx.objectStore('saves');
            if (data === null || data === undefined) store.delete(key);
            else store.put(data, key);
            tx.oncomplete = function() { resolve(); };
            tx.onerror = function() { reject(tx.error || new Error('IDB set error')); };
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
                            var slotNum = parseInt(key.replace('slot_', ''));
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
        var backupSlot = this._getBackupSlot(slot);
        // 【阶段二】写前备份：保留旧数据到备份槽，防止写入崩溃导致旧档丢失
        if (backupSlot !== null && data !== null && data !== undefined) {
            try {
                var oldData = await this.get(slot);
                if (oldData) {
                    if (this._useFallback) this._lsSet(backupSlot, oldData);
                    else await this._setRaw('slot_' + backupSlot, oldData);
                }
            } catch (backupErr) {
                console.warn('[SaveDB] 写前备份失败，继续写入:', backupErr);
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
    // 从备份槽恢复
    async restore(slot) {
        var backupSlot = this._getBackupSlot(slot);
        if (backupSlot === null) return null;
        var backup = await this.get(backupSlot);
        if (!backup) {
            console.warn('[SaveDB] 槽位 ' + slot + ' 没有备份可恢复');
            return null;
        }
        if (!this._verifyChecksum(backup)) {
            console.error('[SaveDB] 备份数据校验失败，无法恢复');
            return null;
        }
        await this.set(slot, backup);
        return backup;
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
                    if (saves.hasOwnProperty(slot) && saves[slot] && !this._isBackupSlot(parseInt(slot))) {
                        await this.set(parseInt(slot), saves[slot]);
                        migrated++;
                    }
                }
            }
        } catch (e) {
            // 【I修复】迁移失败不再静默：记录警告，但仍置位 IDB_MIGRATED 避免每次启动无限重试
            console.warn('[SaveDB.migrate] localStorage→IndexedDB 迁移失败，已跳过', migrated, '个存档:', e.message);
        }
        Storage.set(Storage.KEYS.IDB_MIGRATED, '1');
    },
    // ── 备份与校验工具 ──
    _getBackupSlot(slot) {
        if (slot === 0) return -1;
        if (typeof slot === 'number' && slot >= 1 && slot <= 99) return -100 - slot;
        return null;
    },
    _isBackupSlot(slot) {
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
                var slotNum = parseInt(k);
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
            Storage.set(Storage.KEYS.LOCAL_SAVES, jsonStr);
        } catch (e) {
            // 尝试清理后重试一次
            try {
                Storage.remove(Storage.KEYS.AUTO_SAVE_BACKUP);
                Storage.remove(Storage.KEYS.IDB_MIGRATED);
                var saves = this._lsGetAll();
                if (data === null) delete saves[slot];
                else saves[slot] = data;
                Storage.set(Storage.KEYS.LOCAL_SAVES, JSON.stringify(saves));
            } catch (e2) {
                console.error('❌ 清理后仍无法写入，存档可能丢失:', e2);
                // 尝试提示用户
                if (typeof UI !== 'undefined' && UI.toast) {
                    UI.toast('存储空间不足，请导出存档后清理');
                }
            }
        }
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
        maxTokens: 8192,
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

// 【P1修复BUG-5.8】运行时状态单例 RuntimeState
// 原问题：core.js 顶层用 var/let/const 声明大量全局（streamBuffer/isWaiting/isCompressing/
// npcEditingName/npcChatState/MAX_HISTORY），由 game.js/phone-ui.js 直接读写，无模块边界，
// 重构时极易遗漏。现统一封装到 RuntimeState 单例，通过 getter/setter 访问。
// 注意：
// - gameState 仍是顶层全局（StateManager 已封装其读写，且跨文件引用极广），暂不纳入
// - _streamModeLocked/_streamMode 声明在 game.js，不在本修复范围
// - RuntimeState.npcChatState 为对象引用，嵌套修改（.npcName/.chatHistory 等）直接操作底层对象
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
    // npcChatState 不提供 setter：嵌套对象通过 RuntimeState.npcChatState.xxx 修改
    // 重置时调 resetNpcChatState()
    resetNpcChatState() {
        this._npcChatState.npcName = '';
        this._npcChatState.chatHistory = [];
        this._npcChatState.abortController = null;
        this._npcChatState.isSending = false;
    }
};

// 【修复P1-3】统一状态重置入口——此前 startNewGame/loadFromSlot/handleImportFile 三处各自重置不同字段子集，
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
        gs.maxTokens = 8192;
    }
    // 特殊处理：_stats.startTime 读档时应重置
    if (gs._stats) {
        gs._stats.startTime = Date.now();
    }
    // 【优化·playerName 同步】gameState.playerName 此前从未被赋值，所有读取都走 || '玩家' 兜底
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
        WorldInfo._currentTurn = 0;
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
    _streamModeLocked = false;
    _streamMode = null;
    if (typeof _streamFullText !== 'undefined') _streamFullText = '';
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
    // 【P1-6修复】重置 QuestSystem._cachedGuidanceQuest：
    // 此前是模块级变量，生命周期=页面会话，跨存档加载不重置。
    // 复现：存档 A 完成游戏（_cachedGuidanceQuest.status=COMPLETED）→
    //       加载存档 B（新游戏）→ getAllQuests 复用存档 A 的已完成引导任务，
    //       任务页显示一个 id=guidance_<存档A时间戳> 的过期任务。
    // 在 resetRuntimeState 统一重置（覆盖 startNewGame + loadFromSlot + handleImportFile 三入口）
    if (typeof QuestSystem !== 'undefined') {
        QuestSystem._cachedGuidanceQuest = null;
    }
    // 清空UI残留
    var storyEl = document.getElementById('storyText');
    if (storyEl) storyEl.innerHTML = '';
    // full 模式：整体替换 gameState
    if (scope === 'full') {
        gameState = createDefaultGameState();
        // 【修复BUG-14】clear() 重建 tables 后，gameState.allCharacters 等别名断裂
        // 重新建立 gameState 与 GameMemory tables 之间的引用别名
        if (typeof _ensureDataLinkage === 'function') {
            try { _ensureDataLinkage(); } catch (e) { console.warn('[resetRuntimeState] 数据联动失败:', e); }
        }
    }
}

// 【P1修复BUG-5.8】streamBuffer / isWaiting / isCompressing / npcEditingName /
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
    displayed: '',
    isTyping: false,
    timer: null,
    // 【性能优化】baseSpeed 从 25ms 改为 50ms，肉眼几乎无差（20字/秒）但 CPU 减半
    // 进一步通过 textContent 增量更新当前段落避免每 tick 整个 innerHTML 重建
    baseSpeed: 50,
    onComplete: null,
    _visibilityHandler: null,
    _completedParagraphs: [],
    _currentParaChars: '',
    _lastRendered: '',
    _rafPending: false,
    // 【性能优化】缓存已完成段落的格式化HTML，避免每tick重新formatStory
    _cachedCompletedHtml: '',
    _cachedCompletedKey: '',
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
        // 【修复BUG-04】newText 是完整文本（displayed + queue + 新增），不是增量
        var newSuffix = newText.substring(this.displayed.length);
        if (newSuffix.indexOf(this.queue) === 0) {
            // 原 queue 是 newSuffix 前缀，只追加差异（最优路径）
            this.queue += newSuffix.substring(this.queue.length);
        } else if (this.queue.indexOf(newSuffix) === 0 && newSuffix.length > 0) {
            // newSuffix 是原 queue 前缀：流式过程中文本被截短，保持 queue 不变等待恢复
            // 避免覆盖导致闪烁或丢字
        } else {
            // 内容发生变化，用新的完整 suffix 替换 queue
            this.queue = newSuffix;
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
        }
        // 【用户需求】打字机开始时显示「跳过」按钮（无长按快进、无点击屏幕快进）
        try { _showSkipButton(); } catch (e) {}
        const self = this;
    TimerManager.setInterval('typewriter', function() {
        if (self.queue.length === 0) {
            self.pause();
            if (self._currentParaChars) {
                self._completedParagraphs.push(self._currentParaChars);
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
    var ch = self.queue[0];
    self.queue = self.queue.substring(1);
    self.displayed += ch;

    // 段落分割：遇到换行且当前段落有内容时，完成当前段落
    if (ch === '\n' && self._currentParaChars.length > 0) {
        self._completedParagraphs.push(self._currentParaChars);
        self._currentParaChars = '';
        self._renderCached();
        } else {
        self._currentParaChars += ch;
        self._renderCurrentPara();
    }

    // 标点智能停顿
    var pause = self._pauseMap[ch];
    if (pause) {
        self.pause();
        self._pauseTimer = TimerManager.setTimeout('typewriterPause', function() {
            self._pauseTimer = null;
            if (self.queue.length > 0 || self._currentParaChars.length > 0) {
                self.start();
                } else {
                self.pause();
                if (self._currentParaChars) {
                    self._completedParagraphs.push(self._currentParaChars);
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
            } else if (!document.hidden && !self.isTyping && self.queue.length > 0) {
                // 【修复X15】页面重新可见时自动恢复打字
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
        this.displayed = '';
        this._lastRendered = '';
        this.onComplete = null;
        this._cachedCompletedHtml = '';
        this._cachedCompletedKey = '';
        this._currentParaEl = null;
        // 【修复BUG-05】异常路径强制清理光标，防止解析失败时光标 ▌ 残留
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
        this.displayed += this.queue;
        this.queue = '';
        this.pause();
        this.render();
        if (this.onComplete) {
            this.onComplete();
            this.onComplete = null;
        }
    },
    // 【用户需求】明确的「跳过」方法（与 flush 行为一致，但语义清晰）
    skip() {
        if (!this.isTyping && this.queue.length === 0) return false;
        this.flush();
        return true;
    },
    isFinished() {
        // 确保 queue 已初始化
        if (typeof this.queue !== 'string') this.queue = '';
        return this.queue.length === 0 && !this.isTyping;
    },
    render() {
        var storyEl = DOMCache.get('storyText', true);
        if (!storyEl) return;
        var allText = this._completedParagraphs.join('\n') + (this._completedParagraphs.length > 0 ? '\n' : '') + this._currentParaChars;
        // 脏检查：内容未变化则跳过重绘
        if (allText === this._lastRendered) return;
        this._lastRendered = allText;

        // 【性能优化】当前段落用 textContent 增量更新，避免每 tick 整个 innerHTML 重建
        // 旧逻辑：每 50ms 都执行 storyEl.innerHTML = completedHtml + currentHtml
        //         → 浏览器必须重新解析"已完成段落"那部分 HTML（已经渲染过 N 次）
        // 新逻辑：已完成段落变更时（罕见，段尾换行时）才全量重渲染
        //         当前段落变化时（每 tick）只更新最后一个 <p> 的 textContent
        var completedKey = this._completedParagraphs.join('\n');
        if (completedKey !== this._cachedCompletedKey) {
            // 段落列表变了：全量重渲染（罕见）
            this._cachedCompletedKey = completedKey;
            this._cachedCompletedHtml = completedKey ? formatStory(completedKey) : '';
            this._currentParaEl = null;  // 强制重建当前段落元素
            storyEl.innerHTML = this._cachedCompletedHtml;
        }

        // 当前段落：增量更新（极快）
        if (this._currentParaChars) {
            // 打字机 tick 期间只做基本装饰标签移除（与原 formatStory 行为一致）
            var currentText = this._currentParaChars;
            if (typeof _cleanUnrecognizedTags === 'function') {
                currentText = _cleanUnrecognizedTags(currentText);
            } else if (typeof _reDecorTagsTyping !== 'undefined') {
                _reDecorTagsTyping.lastIndex = 0;
                currentText = currentText.replace(_reDecorTagsTyping, '');
            }
            if (!this._currentParaEl || this._currentParaEl.parentNode !== storyEl) {
                // 创建新段落元素，复用同一节点直到本段结束
                this._currentParaEl = document.createElement('p');
                this._currentParaEl.className = 'story-typing-para';
                storyEl.appendChild(this._currentParaEl);
            }
            // 【修复BUG-M6】生成过程中添加闪烁光标，提示文本尚未完成，避免玩家误以为截断
            var cursorHtml = (this.isTyping || this.queue.length > 0) ? '<span class="typing-cursor">▌</span>' : '';
            // currentText 已经过标签清理，innerHTML 安全
            this._currentParaEl.innerHTML = escapeHtml(currentText) + cursorHtml;
        } else if (this._currentParaEl) {
            // 当前段落清空：清掉元素引用，下一次会创建新的
            this._currentParaEl = null;
        }
        // 【修复】非打字状态时清理残留光标
        if (!this.isTyping && this.queue.length === 0) {
            this.cleanCursor();
        }
    },
    _renderCached() {
        // 渲染已完成的段落
        this.render();
    },
    _renderCurrentPara() {
        // 渲染当前段落（与原版保持一致：每 tick 直接 render，不做 80ms 节流）
        // 之前用 rAF + 80ms 节流反而让文本以 3 字/80ms 的节奏跳动，用户感觉"卡"
        this.render();
    },
    // 【修复】渲染前清理打字光标，防止生成结束后"▌"残留
    // 【P2修复BUG-012】增强清理：除了移除 .typing-cursor span 外，
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
// 【P1修复BUG-5.8】MAX_HISTORY / isCompressing / npcChatState / npcEditingName
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
// 自动提取所有分类
function isScrollNearBottom(el) {
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}

// ========================================
// 游戏内时间系统（AI动态生成）
// ========================================
var GameTimeSystem = {
    // 从剧情文本中智能提取时间信息作为兜底
    _extractTimeFromStory(story) {
        if (!story || typeof story !== 'string') return null;
        var result = {};
        // 提取日期：xxxx年xx月xx日 / xx-xx-xx / xx/xx/xx
        var dateMatch = story.match(/(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}日?)/);
        if (dateMatch) result.date = dateMatch[1];
        // 提取时间：xx:xx
        var timeMatch = story.match(/(\d{1,2}:\d{2})/);
        if (timeMatch) result.time = timeMatch[1];
        // 提取时段
        var periodKeywords = {
            '凌晨': '凌晨', '清晨': '清晨', '早晨': '早晨', '早上': '早上',
            '上午': '上午', '中午': '中午', '午后': '午后', '下午': '下午',
            '傍晚': '傍晚', '黄昏': '黄昏', '晚上': '晚上', '夜晚': '夜晚', '夜间': '夜间',
            '深夜': '深夜'
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
    // 【P0修复BUG-006】时间写入唯一入口：原实现与 AIResponseMutator._applyGameTime 重复调用
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
        // 兜底：没有gameTime或全部为空时，从story中提取
        if ((!resolved.date && !resolved.time && !resolved.period) && data && data.story) {
            var extracted = this._extractTimeFromStory(data.story);
            if (extracted) {
                if (extracted.date) resolved.date = extracted.date;
                if (extracted.time) resolved.time = extracted.time;
                if (extracted.period) resolved.period = extracted.period;
            }
        }
        // 【修复X10】data 为 null 时也要给默认时间，避免 UI 显示 "--"
        // 最终兜底：游戏开局给一个默认时间，避免UI显示"--"
        if (!resolved.date && !resolved.time && !resolved.period) {
            resolved.date = '游戏开始';
            resolved.period = '初始时刻';
        }
        // 【状态层同步】单一写入点：通过 TimeMutator.setTime 写入 StateManager.time
        // _syncLegacyMirror 自动同步到 gameState.gameTime（无需手动赋值）
        // 【P1修复P1-I】删除直接写 gameState.gameTime 的兜底分支：该分支绕过
        // TimeMutator 的单调性校验（time 不允许倒退），与 5.7 时间单调性契约冲突。
        // StateManager/TimeMutator 是必加载的状态层，不可用时应抛错而非静默写入。
        if (typeof TimeMutator !== 'undefined' && TimeMutator.setTime) {
            TimeMutator.setTime(resolved, { silent: true });
        } else if (typeof StateManager !== 'undefined' && StateManager.set) {
            StateManager.set('time', resolved, { silent: true });
        } else {
            throw new Error('[GameTimeSystem.parseFromAI] TimeMutator/StateManager 未加载，无法写入时间');
        }
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
            // 如果没有时间数据，显示默认文本
            timeEl.textContent = formatted || '--';
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
// 【阶段1-A1】safeJSONParse 已删除：与 ResponseParser._tryDirectJSON + _tryRobustJSON 完全重复
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
            // 【修复 P0-3】用 TextDecoder 正确解码 UTF-8，支持中文角色卡
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
function extractStr(text, field) {
    const m = text.match(new RegExp(`"${escapeRegExp(field)}"\\s*:\\s*"`));
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
    const m = text.match(new RegExp(`"${escapeRegExp(field)}"\\s*:\\s*\\[`));
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
// 状态机提取对象
function extractObj(text, field) {
    const m = text.match(new RegExp(`"${escapeRegExp(field)}"\\s*:\\s*\\{`));
        if (!m) return null;
        const start = m.index + m[0].length - 1;
        const end = _findMatching(text, '{', '}', start);
        if (end !== -1) {
            try {
                return JSON.parse(text.slice(start, end + 1))
            } catch {}
    }
// 手动提取
const partial = text.slice(start);
const obj = {};
const fp = /"(\w+)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
let fm;
while ((fm = fp.exec(partial)) !== null) obj[fm[1]] = fm[2].replace(/\\n/g, '\n').replace(/\\"/g, '"');
return Object.keys(obj).length > 0 ? obj : null;
}
// 状态机提取对象数组
function extractObjArr(text, field) {
    const m = text.match(new RegExp(`"${escapeRegExp(field)}"\\s*:\\s*\\[`));
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
// 【阶段1-A1】robustParse 已删除：与 ResponseParser._tryRobustJSON 完全重复
// 字段级状态机提取已由 ResponseParser Level 2（_tryRobustJSON + _repairTruncatedJSON）覆盖
// extractStr/extractArr/extractObj/extractObjArr 保留：仍被 game.js 多处用于从纯文本提取字段
// 【阶段1-A1】_parseMemTags 已删除：与 ResponseParser._tryMemTags 完全重复
// <mem> 标签解析统一由 ResponseParser.parse 的 Level 3 处理

// 将<mem>解析结果应用到gameState，自动维护结构化数据
function _applyMemsToGameState(mems) {
    if (!mems || mems.length === 0 || typeof gameState === 'undefined' || !gameState) return;
    mems.forEach(function(mem) {
        try {
            switch (mem.type) {
                case 'event':
                    if (mem.action === 'add' && mem._content) {
                        // 【阶段1-A2】统一通过 gm.addImportantEvent 写入事件
                        // 【P1修复BUG-011-legacy兜底】删除 gm 不可用时直接写 keyEvents 的兜底分支：
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
                    // 【P1修复BUG-7.4】删除 else 兜底分支（直接写 gameState.currentBag），
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
                    // 【阶段1统一】<mem> 标签角色变更委托 CharacterMutator
                    // 【P1修复BUG-011-legacy兜底】删除 CharacterMutator 不可用时回退旧逻辑的兜底分支：
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
                    // 【P1修复BUG-7.4】删除 else 兜底分支（直接写 gameState.currentQuests），
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
                    // 【修复 P1】写入 gameTime.date（StateSchema 标准字段），而非 gameTime.day（非标准，UI 读不到）
                    // 【P1修复BUG-011-时间】改为通过 TimeMutator.setTime 写入，由 _syncLegacyMirror 同步到 gameTime，
                    // 避免直接改 gameState.gameTime 绕过时间单调性校验（详见 5.7 时间单调性校验被绕过）。
                    // 【P1修复P1-I】删除 else 分支直接写 gameState.gameTime：该分支绕过单调性校验，
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
                    if (mem.action === 'add' && mem.name && typeof StateManager !== 'undefined') {
                        var _rawLocs = StateManager.get('entities.locations') || [];
                        var _locExists = _rawLocs.some(function(l) { return l && l.name === mem.name; });
                        if (!_locExists) {
                            _rawLocs.push({ name: mem.name, desc: mem._content || '' });
                            StateManager.set('entities.locations', _rawLocs, { silent: true });
                        }
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

    // 【阶段1-A1】单一解析入口：ResponseParser.parse 已是 5 层完整兜底
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
        // ResponseParser 不可用时的最小兜底（理论不应发生，契约层在 init 阶段已加载）
        console.error('[parseAIResponse] ResponseParser 不可用，解析能力降级');
        storyText = reply || '';
    }

    // 兜底：storyText 为空但 reply 有内容（纯文本小说预设）
    if ((!storyText || storyText.trim() === '') && reply && reply.trim()) {
        var cleanedReply = reply
            .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
            .replace(/<ECoT>[\s\S]*?<\/ECoT>/gi, '')
            .replace(/💭[\s\S]*?💭/g, '')
            .trim();
        if (cleanedReply) storyText = cleanedReply;
    }

    // 【修复X8/BUG-01/NEW-BUG-5】裸文本思维链泄漏检测
    // 复用 game.js 全局 _isThinkingContent 函数（阶段2-B1 统一），避免正则数组重复定义
    if (storyText && typeof _isThinkingContent === 'function' && _isThinkingContent(storyText)) {
        console.warn('[parseAIResponse] 检测到 AI 思维链泄漏到剧情，已拦截');
        storyText = '⚠️ **AI 回复格式异常**（输出了推理过程而非剧情）\n\n💡 建议点击 🔄 重新生成，或检查预设是否要求 JSON 输出格式。';
        if (typeof gameState !== 'undefined' && gameState) gameState._lastLeakBlocked = true;
    }

// 【修复P2-2】移除 _squelchPostProcess 调用块——该函数是 no-op（直接 return story），
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
    // 【修复NEW-BUG-6】仅在 data 解析失败时才检测截断，避免 ResponseParser 已通过
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

    return {
        data,
        storyText,
        mems: mems,
        truncated: _truncated,
        // 【阶段2修复P0-1】添加 success 字段，激活 AIResponseMutator 状态层
        // 原 parseAIResponse 不返回 success，导致 game.js:1712 的 parseResult.success 永远 undefined，
        // AIResponseMutator.apply 从不执行（状态层是死代码）。
        success: !!(data || storyText)
    };
}

// 【优化】校验 AI 返回的 JSON 字段完整性
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
        branches: function() { if (typeof renderChoices === 'function' && data.options) renderChoices(data.options); return { type: 'branches', title: title, content: content, options: data.options || [] }; },
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

// 【新增】手机功能 -> 手机模块
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

// 【新增】选项分支 -> 选项模块
case 'branches':
case '选项分支':
case '分支':
targetModule = { type: 'branches', title: '选项', content: theater.html || theater.content };
if (theater.data && theater.data.options) {
targetModule.options = theater.data.options;
// 同时更新游戏选项
if (typeof renderChoices === 'function') {
    renderChoices(theater.data.options);
}
}
break;

// 【新增】物品 -> 物品模块
case 'echo':
case '物品':
case 'items':
targetModule = { type: 'cards', title: '物品', items: parseItemsContent(theater.html || theater.content) };
if (theater.data && theater.data.items) {
targetModule.items = theater.data.items;
}
break;

// 【新增】文字剧场 -> 剧场模块
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

// 【新增】象牙塔预设 - 塔类小剧场映射
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

// 【新增】其他标签类型映射
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
targetModule = { type: 'comments', title: theater.title || '论坛', items: theater.data?.posts || [{ author: '小剧场', content: theater.content, time: new Date().toLocaleString() }] };
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
    if (typeof renderChoices === 'function') {
        renderChoices(options);
        console.log('[深度融合] 已将 ' + options.length + ' 个<branches>选项桥接到游戏选项系统');
    }
}
}

// 【深度融合】将预设<meow_FM>摘要桥接到游戏EnhancedMemory系统
// 【优化】旧代码写入 shortTermMemory.summaries（注入路径从不读取，是死字段）
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

// 【优化】注入到 EnhancedMemory._summaryLayers.near（会被 buildInjection 第9层读取）
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
if (!gameState.rollingSummary || gameState.rollingSummary.length < 50) {
    gameState.rollingSummary = summaryText.substring(0, 300);
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
    if (Object.keys(charUpdate).length > 0 && typeof mergeCharacters === 'function') {
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
            mergeCharacters([update]);
            console.log('[深度融合] 已将状态面板数据桥接到NPC系统:', targetCharName);
        }
    }
}

// 【深度融合】将预设的字数/段落配置同步到游戏设置界面
function _syncPresetWordCountToUI(config) {
    if (!config) return;
    // 确保 gameState.wordCountConfig 已初始化
    if (!gameState.wordCountConfig) {
        gameState.wordCountConfig = { enabled: true, min: 1500, max: 3000, paragraphMin: 15, paragraphMax: 17, paragraphStyle: 'medium', lengthPreset: 'medium' };
    }
// 更新gameState
if (config.enabled !== undefined) gameState.wordCountConfig.enabled = config.enabled;
if (config.min != null) gameState.wordCountConfig.min = config.min;
if (config.max != null) gameState.wordCountConfig.max = config.max;
if (config.paragraphMin != null) gameState.wordCountConfig.paragraphMin = config.paragraphMin;
if (config.paragraphMax != null) gameState.wordCountConfig.paragraphMax = config.paragraphMax;
if (config.paragraphStyle) gameState.wordCountConfig.paragraphStyle = config.paragraphStyle;
if (config.lengthPreset) gameState.wordCountConfig.lengthPreset = config.lengthPreset;

// 同步到UI元素（如果设置页面有对应的DOM）
var wcMinEl = document.getElementById('wcMin');
var wcMaxEl = document.getElementById('wcMax');
var wcStyleEl = document.getElementById('wcParagraphStyle');
var wcEnabledEl = document.getElementById('wcEnabled');

if (wcMinEl) wcMinEl.value = config.min || 1500;
if (wcMaxEl) wcMaxEl.value = config.max || 3000;
if (wcStyleEl) wcStyleEl.value = config.paragraphStyle || 'medium';
if (wcEnabledEl) wcEnabledEl.checked = config.enabled !== false;

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
// 【阶段1统一】角色关系子字段写入委托 CharacterMutator
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
        if (typeof renderNpcList === 'function') renderNpcList();
        console.log('[深度融合] 已将 ' + relations.length + ' 条角色关系桥接到NPC系统');
    }
}

// 【小剧场融合】解析论坛内容
function parseForumContent(html) {
    var items = [];
    // 尝试解析帖子列表
    var postMatches = html.match(/<div[^>]*class=["']post["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    postMatches.forEach(function(match) {
        var author = (match.match(/class=["']author["'][^>]*>([^<]+)/i) || [])[1] || '匿名';
        var content = (match.match(/class=["']content["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || match.replace(/<[^>]+>/g, '');
        var time = (match.match(/class=["']time["'][^>]*>([^<]+)/i) || [])[1] || new Date().toLocaleString();
        items.push({ author: author, content: content, time: time, likes: 0, replies: 0 });
    });
if (items.length === 0) {
    // 如果没有解析到结构化内容，将整个HTML作为一个帖子
    items.push({ author: '小剧场', content: html.replace(/<[^>]+>/g, '').substring(0, 200), time: new Date().toLocaleString() });
}
return items;
}

// 【小剧场融合】解析聊天内容
function parseChatContent(html) {
    var messages = [];
    var msgMatches = html.match(/<div[^>]*class=["']message["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    msgMatches.forEach(function(match) {
        var sender = (match.match(/class=["']sender["'][^>]*>([^<]+)/i) || [])[1] || '未知';
        var text = (match.match(/class=["']text["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || match.replace(/<[^>]+>/g, '');
        messages.push({ sender: sender, text: text, time: new Date().toLocaleTimeString() });
    });
return messages;
}

function injectToChatLog(npcName, theater) {
    if (!gameState._chatLogs || Array.isArray(gameState._chatLogs)) gameState._chatLogs = {};
    if (!gameState._chatLogs[npcName]) gameState._chatLogs[npcName] = [];
    gameState._chatLogs[npcName].push({
        role: 'npc',
        text: (theater.content || '').substring(0, 100) + (theater.content.length > 100 ? '...' : ''),
        time: new Date().toLocaleTimeString(),
        isTheater: true,
        theaterType: theater.type
    });
// 【修复】限制每个NPC聊天记录上限，防止无限增长导致存档膨胀
if (gameState._chatLogs[npcName].length > 50) {
    gameState._chatLogs[npcName] = gameState._chatLogs[npcName].slice(-50);
}
}

// 【小剧场融合】解析日程内容
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
function parseMailContent(html) {
    var mails = [];
    var mailMatches = html.match(/<div[^>]*class=["']mail["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    mailMatches.forEach(function(match) {
        var from = (match.match(/class=["']from["'][^>]*>([^<]+)/i) || [])[1] || '系统';
        var subject = (match.match(/class=["']subject["'][^>]*>([^<]+)/i) || [])[1] || '无主题';
        var content = (match.match(/class=["']body["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || match.replace(/<[^>]+>/g, '');
        mails.push({ from: from, subject: subject, preview: content.substring(0, 50), content: content, read: false, time: new Date().toLocaleString() });
    });
if (mails.length === 0) {
    mails.push({ from: '系统通知', subject: '小剧场', preview: html.replace(/<[^>]+>/g, '').substring(0, 50), content: html, read: false });
}
return mails;
}

// 【小剧场融合】解析商店内容
function parseShopContent(html) {
    var goods = [];
    var itemMatches = html.match(/<div[^>]*class=["']item["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    itemMatches.forEach(function(match) {
        var name = (match.match(/class=["']name["'][^>]*>([^<]+)/i) || [])[1] || '商品';
        var price = parseInt((match.match(/class=["']price["'][^>]*>([\d]+)/i) || [])[1]) || 100;
        var desc = (match.match(/class=["']description["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '';
        goods.push({ name: name, price: price, description: desc.replace(/<[^>]+>/g, ''), icon: '📦' });
    });
return goods;
}

// 【小剧场融合】解析朋友圈内容
function parseMomentsContent(html) {
    var moments = [];
    var momentMatches = html.match(/<div[^>]*class=["']moment["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    momentMatches.forEach(function(match) {
        var author = (match.match(/class=["']author["'][^>]*>([^<]+)/i) || [])[1] || '匿名';
        var content = (match.match(/class=["']content["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || match.replace(/<[^>]+>/g, '');
        var likes = parseInt((match.match(/class=["']likes["'][^>]*>([\d]+)/i) || [])[1]) || 0;
        moments.push({ author: author, content: content, time: '刚刚', likes: likes, comments: [] });
    });
if (moments.length === 0 && html.trim()) {
    moments.push({ author: '小剧场', content: html.replace(/<[^>]+>/g, ''), time: '刚刚', likes: 0, comments: [] });
}
return moments;
}

// 【小剧场融合】解析物品内容
function parseItemsContent(html) {
    var items = [];
    var itemMatches = html.match(/<div[^>]*class=["']item["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    itemMatches.forEach(function(match) {
        var name = (match.match(/class=["']name["'][^>]*>([^<]+)/i) || [])[1] || '物品';
        var count = parseInt((match.match(/class=["']count["'][^>]*>([\d]+)/i) || [])[1]) || 1;
        var rarity = (match.match(/class=["']rarity["'][^>]*>([^<]+)/i) || [])[1] || '普通';
        items.push({ name: name, count: count, rarity: rarity, icon: '🎁' });
    });
return items;
}

// 【小剧场融合】解析日记内容
function parseDiaryContent(html) {
    var entries = [];
    var entryMatches = html.match(/<div[^>]*class=["']entry["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    entryMatches.forEach(function(match) {
        var date = (match.match(/class=["']date["'][^>]*>([^<]+)/i) || [])[1] || new Date().toLocaleDateString();
        var content = (match.match(/class=["']content["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || match.replace(/<[^>]+>/g, '');
        entries.push({ date: date, content: content });
    });
return entries;
}

// 【P2-阶段3-8】HTTP 状态码翻译表（单一权威源）
// 原 translateError 内有三套重复映射：主 map 的完整格式（'400 Bad Request' 等）
// + 短格式（'401' 等）+ 局部 httpMap + 局部 apiCodeMap，翻译文案不一致。
// 现合并为单一表，三处匹配路径（HTTP 前缀 / Error: 前缀 / 裸码兜底）共用。
var HTTP_STATUS_MAP = {
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
    '529': '站点过载(529) → API服务器负载过高，请稍后重试',
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
        // 【P2-阶段3-8】完整格式（'400 Bad Request' 等）与短格式（'401' 等）已移除
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
// 【修复】如果翻译后的结果与原文不同，在末尾附加原始错误信息
// 这样用户既能看到中文解释，也能看到原始英文错误用于排查
// 【v3审查修复】HTTP 状态码优先匹配：原实现先做子串匹配，message="HTTP 429" 会命中
// map 中的裸数字 '429'（3字符），导致 httpMap 块沦为死代码，且两份翻译文案不一致。
// 现把 httpMap 提前到子串匹配之前，确保 "HTTP <status>" 走专用状态码翻译。
var httpMatch = m.match(/HTTP\s*(\d{3})/);
if (httpMatch) {
    var code = httpMatch[1];
    var httpMap = {
        '400': '请求格式错误(400) → 请检查模型名称和参数',
        '401': '认证失败(401) → API Key错误或已过期',
        '403': '没有权限(403) → 该Key无权访问此资源',
        '404': '地址不存在(404) → 请检查API地址',
        '408': '请求超时(408) → 服务器处理太慢',
        '429': '请求太频繁(429) → 请稍后再试',
        '500': '服务器内部错误(500) → 服务商问题，请稍后重试',
        '502': '网关错误(502) → 中转服务异常',
        '503': '服务不可用(503) → 服务过载或维护中',
        '504': '网关超时(504) → 中转服务等待上游超时',
        '529': '站点过载(529) → 服务器负载过高',
    };
    if (httpMap[code]) return httpMap[code];
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
    var apiCodeMap = {
        '400': '请求格式错误 → 请检查模型名称和参数是否正确',
        '401': '认证失败 → API Key错误或已过期，请到「设置→API配置」检查',
        '403': '权限不足 → 该API Key无权访问此模型',
        '404': '地址不存在 → 请检查API地址是否正确',
        '429': '请求太频繁 → 已触发速率限制，请等待几秒后重试',
        '500': '服务器内部错误 → API服务商的问题，请稍后重试',
        '502': '网关错误 → API中转服务异常，可能正在维护',
        '503': '服务不可用 → API服务暂时过载或维护中',
        '504': '网关超时 → API中转服务等待上游响应超时',
    };
    if (apiCodeMap[apiCode]) return apiCodeMap[apiCode];
}
// 都没匹配到，返回友好提示（截断过长消息）
if (m.length > 100) {
    return '发生错误：' + m.substring(0, 80) + '...（详情见控制台）';
}
return '发生错误：' + m;
}

// rebindBtn 辅助函数：统一处理按钮事件重新绑定
function rebindBtn(btn, eventType, handler) {
    var clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener(eventType, handler);
    return clone;
}

// safeSetItem 已在 utils.js 中统一定义，此处不再重复声明

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
// 【P0修复】白名单 HTML 净化（替代黑名单正则方案）
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
// 【统一管理】走 GlobalCleanup，页面卸载时统一移除
GlobalCleanup.registerListener(window, 'beforeunload', function() {
    try {
        var data = buildSaveData('');
        Storage.setJSON(Storage.KEYS.AUTO_SAVE_BACKUP, data);
    } catch(e) { console.warn('beforeunload save failed:', e); }
try {
    if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.saveToStorage) {
        EnhancedMemory.saveToStorage();
    }
} catch(memE) {}
});
function parseMarkdown(text) {
    if (!text) return '';
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}
// --- applyFontSize 适配 ---
/**
* 折叠/展开设置组
*/
function toggleSettingGroup(header) {
    var body = header.nextElementSibling;
    var icon = header.querySelector('.toggle-icon');
    if (body) {
        var isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'block' : 'none';
        if (icon) icon.textContent = isHidden ? '▲' : '▼';
    }
}
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
    // 【修复BUG-M3】切页前关闭日志子页面，避免子页面覆盖在新页面上
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
    // 【性能优化】tabs 结构未变时，只切 active 类，避免每次重建 6 个按钮
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
    storyEl.innerHTML =
    '<div style="text-align:center;padding:40px 0;display:flex;flex-direction:column;align-items:center;text-indent:0;">' +
    '<div style="display:flex;justify-content:center;gap:10px;margin-bottom:16px;">' +
    '<div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>' +
    '<span style="color:var(--text-secondary);font-size:13px;">' + flavors[Math.floor(Math.random() *
        flavors.length)] + '</span>' +
    '<div style="margin-top:8px;font-size:12px;color:var(--text-tertiary);text-align:center;">已等待 <span id="waitSec">0</span> 秒</div></div>';
    optsEl.innerHTML = '';
    var sec = 0;
    TimerManager.setInterval('loadingTimer', function() {
        sec++;
        var el = document.getElementById('waitSec');
        if (el) el.textContent = sec;
        else {
            TimerManager.clearInterval('loadingTimer');
        }
}, 1000);
}
function hideStoryLoading() {
    TimerManager.clearInterval('loadingTimer');
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
    // 【修复】不要清空剧情区，避免覆盖流式已渲染的内容
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
        el.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--danger);">' +
            '<div style="font-size:16px;margin-bottom:8px;">△ 生成失败</div>' +
            '<div style="font-size:14px;color:var(--text-secondary);margin-bottom:16px;">' + escapeHtml(msg) + '</div>' +
            (fileLine ? '<div style="font-size:11px;color:#d35400;margin-bottom:8px;">◎ 错误位置: ' + escapeHtml(fileLine) + '</div>' : '') +
            (action ? '<div style="margin-bottom:12px;">' + action + '</div>' : '') +
            '<details style="font-size:11px;color:var(--text-tertiary);text-align:left;"><summary style="cursor:pointer;">查看完整堆栈</summary><pre style="white-space:pre-wrap;word-break:break-all;padding:8px;background:var(--bg-secondary);border-radius:4px;">' + escapeHtml(stack || msg) + '</pre></details>' +
            '<div style="font-size:12px;color:var(--text-tertiary);margin-top:8px;">请检查网络连接和API设置后重试</div>' +
            '</div>';
    }
    // 3秒后自动淡出并移除错误banner（与其它弹窗保持一致）
    // 【缺陷修复】使用唯一 key + 走 TimerManager，避免连续生成失败时旧 banner 永久残留
    var errKey = 'errorBanner_' + Date.now() + '_' + Math.random();
    TimerManager.setTimeout(errKey, function() {
        var banner = document.querySelector('.api-error-banner[data-error-ts]');
        if (banner) {
            banner.style.opacity = '0';
            TimerManager.setTimeout(errKey + '_remove', function() {
                if (banner.parentNode) banner.remove();
            }, 500);
        }
    }, POPUP_DURATION_MS);
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
    // 【P1修复BUG-007】每次更新场景标题时同步刷新回合数标签
    // 旧实现把回合数塞进 sceneTitle 的 fallback，AI 一旦返回 title 就会覆盖回合数显示
    if (typeof updateTurnLabel === 'function') updateTurnLabel();
}

// 【P1修复BUG-007】独立的回合数标签更新函数
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
// 【阶段二】增强版全局存档写入锁
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

    // 超时保险：如果该锁持有超过 5 分钟仍未释放，强制重置
    // 【优化】旧代码直接 _saveLock = Promise.resolve() 会丢失 pending 操作链
    // 新代码：保留 pending 链，只重置状态计数器，让 pending 操作自然完成
    var timeoutLabel = 'saveLockTimeout_' + label + '_' + Date.now();
    TimerManager.setTimeout(timeoutLabel, function() {
        if (_saveLockState.holder === label && (Date.now() - _saveLockState.startTime) >= SAVE_LOCK_TIMEOUT) {
            console.error('[SaveLock] 锁超时强制释放:', label, '（pending 操作链保留，仅重置状态计数器）');
            // 只重置状态计数器，不重置 _saveLock Promise 链
            // pending 操作仍会自然完成，避免丢失写入
            _saveLockState.holder = null;
            _saveLockState.startTime = 0;
            _saveLockState.depth = 0;
        }
    }, SAVE_LOCK_TIMEOUT + 100);

    return run;
}

function isSaveLocked() {
    return _saveLockState.holder !== null;
}
function getSaveLockHolder() {
    return _saveLockState.holder;
}
async function autoSave() {
    if (_autoSaveTimer) return; // 防抖：已有待执行的保存，跳过
    // 加载中不自动保存，避免读到半合并状态
    if (typeof gameState !== 'undefined' && gameState && gameState._loading) return;
    _autoSaveTimer = TimerManager.setTimeout('autoSave', async function() {
        _autoSaveTimer = null;
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
                // 【阶段四】autoSave 明确开启序列化缓存，手动保存保持默认不重缓存
                await SaveDB.set(0, buildSaveData('', true));
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
    console.error('[自动保存] 保存失败:', e);
    // 失败时也隐藏指示器
    var dot2 = document.getElementById('autoSaveDot');
    if (dot2) dot2.style.display = 'none';
}
        }, 'autoSave');
}, 2000);
}
function safeAbort() { if (window._currentAbort) { try { window._currentAbort.abort(); } catch(e){} } }
// 缓存 setWaiting 重复 DOM 查询的元素引用
var _setWaitingCache = {
    input: null,
    sendBtn: null,
    genControl: null,
    progressBar: null,
    initialized: false
};

function setWaiting(w) {
    // 状态未变化时直接返回
    if (typeof isWaiting !== 'undefined' && isWaiting === w) return;
    isWaiting = w;

    // 【性能】延迟初始化元素引用：第一次调用时查询并缓存
    if (!_setWaitingCache.initialized) {
        _setWaitingCache.input = document.getElementById('customAction');
        _setWaitingCache.sendBtn = document.getElementById('btnSendAction');
        _setWaitingCache.genControl = document.getElementById('genControl');
        _setWaitingCache.progressBar = document.getElementById('genProgressBar');
        _setWaitingCache.initialized = true;
    }
    var input = _setWaitingCache.input;
    var sendBtn = _setWaitingCache.sendBtn;
    if (input) input.disabled = w;
    if (sendBtn) sendBtn.disabled = w;
    // 【修复BUG-006】AI 响应完成（w=false）时清空输入框残留文本，
    // 确保用户不会看到上一轮未清空的输入。提交时的清空（input.value=''）
    // 理论上已生效，此处作为防御性兜底，避免极端时序下文本残留导致误重复提交。
    if (!w && input && input.value) {
        input.value = '';
    }

    // 【性能】不遍历所有 .option-btn 设内联样式——改为在 body 上加/去 .is-waiting
    // CSS 用 .is-waiting .option-btn { pointer-events: none; opacity: .5; } 接管
    // 这样避免每 tick 扫描整个 DOM
    if (w) document.body.classList.add('is-waiting');
    else document.body.classList.remove('is-waiting');

    // 显示/隐藏生成控制条
    if (_setWaitingCache.genControl) {
        if (w) _setWaitingCache.genControl.classList.add('active');
        else _setWaitingCache.genControl.classList.remove('active');
    }
    // 显示/隐藏流式输出进度条
    if (_setWaitingCache.progressBar) {
        if (w) _setWaitingCache.progressBar.classList.add('active');
        else _setWaitingCache.progressBar.classList.remove('active');
    }
}

// ========================================
// 第3层: AI核心
// ========================================
// ========================================
// AI调用函数（替代 GameAPI.call）
// ========================================

// 【优化 #13】参数默认值表——值等于表中默认值的字段会被过滤掉，避免某些 API 后端报错
// 同时作为 truthy 判定参考（频率/存在惩罚是 OpenAI 标准参数，按非零决定是否发送）
var SKIP_DEFAULTS = {
    top_k: 0, min_p: 0, top_a: 0,
    repetition_penalty: 1, typical_p: 1, tfs: 1,
    mirostat_mode: 0, repetition_penalty_range: 0, repetition_penalty_slope: 0,
    epsilon_cutoff: 0, eta_cutoff: 0, dry_multiplier: 0, xtc_probability: 0,
    tool_reasoning_mode: 'disabled'
};

// 【优化 #18】合法的 reasoning_effort 值白名单，避免中转站收到乱写值后报错
var VALID_REASONING_EFFORT = ['low', 'medium', 'high', 'auto'];

// 【优化 #4】从 API 错误对象中提取并本地化错误信息
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
function mergeAdvancedPresetParams(presetParams) {
    if (typeof PresetManager === 'undefined') return;
    if (!PresetManager.presets || PresetManager.currentPresetIndex < 0) return;
    var _curPreset = PresetManager.presets[PresetManager.currentPresetIndex];
    if (!_curPreset || !_curPreset.params) return;
    var _pp = _curPreset.params;
    if (_pp.top_k != null && !presetParams.top_k) presetParams.top_k = Number(_pp.top_k) || 0;
    if (_pp.top_a != null && !presetParams.top_a) presetParams.top_a = Number(_pp.top_a) || 0;
    if (_pp.min_p != null && !presetParams.min_p) presetParams.min_p = Number(_pp.min_p) || 0;
    if (_pp.repetition_penalty != null && _pp.repetition_penalty !== 1) presetParams.repetition_penalty = Number(_pp.repetition_penalty) || 1;
    if (_pp.typical_p != null && _pp.typical_p !== 1) presetParams.typical_p = Number(_pp.typical_p) || 1;
    if (_pp.tail_free_sampling != null && _pp.tail_free_sampling !== 1) presetParams.tail_free_sampling = Number(_pp.tail_free_sampling) || 1;
    if (_pp.mirostat_mode != null && _pp.mirostat_mode !== 0) presetParams.mirostat_mode = Number(_pp.mirostat_mode) || 0;
    if (_pp.mirostat_tau != null && _pp.mirostat_tau !== 5.0) presetParams.mirostat_tau = Number(_pp.mirostat_tau) || 5.0;
    if (_pp.mirostat_eta != null && _pp.mirostat_eta !== 0.1) presetParams.mirostat_eta = Number(_pp.mirostat_eta) || 0.1;
    if (_pp.dry_multiplier != null && _pp.dry_multiplier !== 0) presetParams.dry_multiplier = Number(_pp.dry_multiplier) || 0;
    if (_pp.xtc_probability != null && _pp.xtc_probability !== 0) presetParams.xtc_probability = Number(_pp.xtc_probability) || 0;
    if (_pp.reasoning_effort != null) presetParams.reasoning_effort = String(_pp.reasoning_effort);
    if (_pp.seed != null) presetParams.seed = Number(_pp.seed) || null;
    if (_pp.max_tokens && Number(_pp.max_tokens) > 0) presetParams.max_tokens = Number(_pp.max_tokens);
}

// 【优化 #13 + #18】过滤请求参数：去掉 null/undefined/默认值/非法 reasoning_effort
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
    // 【优化 #18】reasoning_effort 白名单——只过滤明显是误填的值（如 "undefined"、空串、纯数字），
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

// 【优化 #15】构建单次 AI 请求的 body
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
        console.log('[API] 使用兼容模式，只发送基本参数');
    }

    // 基础参数（兼容模式只发这些）
    var params = {
        model: config.model || '',
        messages: messages,
        temperature: presetParams.temperature,
        max_tokens: presetParams.max_tokens,
        top_p: presetParams.top_p
    };

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
        params.response_format = presetParams.response_format || null;
        params.modalities = presetParams.modalities || null;
        params.tool_reasoning_mode = presetParams.tool_reasoning_mode || 'disabled';
        params.reasoning_effort = presetParams.reasoning_effort || null;
    } else {
        // 【优化 #5】兼容模式：frequency/presence 是 OpenAI 标准参数，保留
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
    // 【修复P0-1】移除 options.temperature 覆盖——temperature 统一从 PresetManager.currentParams 读取
    // 此前 options.temperature 来自 gameState.temperature，会覆盖 PresetManager 的值，导致预设温度不生效
    if (options.max_tokens != null) params.max_tokens = options.max_tokens;
    if (options.top_p != null) params.top_p = options.top_p;
    if (options.top_k != null) params.top_k = options.top_k;
    if (options.frequency_penalty != null) params.frequency_penalty = options.frequency_penalty;
    if (options.presence_penalty != null) params.presence_penalty = options.presence_penalty;
    if (options.stop != null) params.stop = options.stop;

    var filtered = filterRequestParams(params);
    if (options.stream) filtered.stream = true;
    // 【修复P1-1】temperature 防御性清理：NaN/负数/非数字修正为模型默认（不传）
    // 注意：不硬钳制到 1.0——OpenAI 官方支持 0-2，部分模型（如 Gemini/DeepSeek）支持更高
    // 真正的越界报错由 API 自己返回 400，调用方会通过 tryWithFallback 切换配置重试
    if (filtered.temperature != null) {
        var tp = Number(filtered.temperature);
        if (!isFinite(tp) || tp < 0) {
            console.warn('[API] temperature 异常值已移除，使用模型默认:', filtered.temperature);
            delete filtered.temperature;
        }
    }
    // 【修复 P0-2 + 动态化】移除 max_tokens 4096 硬上限——这是 API 游戏，AI 能理解输出长度
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
    // 【修复P1-2】max_tokens 上限动态约束：与 contextSize 联动
    // 不硬编码上限——某些模型支持输出 >50% 上下文长度（如 Gemini 2.0 Flash 输出 8192 / 输入 1M）
    // 只在 contextSize 已知且 max_tokens 明显超出时（>contextSize）才裁剪，避免必然的 400 错误
    if (filtered.max_tokens != null) {
        var ctxSize = 0;
        try {
            if (typeof gameState !== 'undefined' && gameState && gameState.contextSize) {
                ctxSize = Number(gameState.contextSize) || 0;
            }
        } catch (e) { /* gameState 可能未定义 */ }
        if (ctxSize > 0) {
            var mt2 = Number(filtered.max_tokens);
            if (mt2 > ctxSize) {
                console.warn('[API] max_tokens(' + mt2 + ') 超过 contextSize(' + ctxSize + ')，已裁剪');
                filtered.max_tokens = ctxSize;
            }
        }
    }
    // 注：不再强制下限 512——某些模型支持小 max_tokens 做摘要，应由调用方/预设决定
    return filtered;
}

// 【优化 #6 + #7】解析一条 SSE 事件文本，把内容累加到 ctx
// 统一前缀处理：兼容 "data:" 和 "data: " 两种格式
// 【修复 #19】部分推理模型的思考链走 reasoning_content 字段，
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
        // 【修复 #19 + #20】兼容 Cloudflare Workers AI 封装的 Kimi 模型：
        // 该模型把正文放在 reasoning_content 中，content 为 null。
        // 策略：优先取 content；content 为空时回退到 reasoning_content。
        var content = (typeof delta.content === 'string') ? delta.content : '';
        var reasoningChunk = (typeof delta.reasoning_content === 'string') ? delta.reasoning_content
                          : (typeof delta.reasoning === 'string') ? delta.reasoning : '';
        // Cloudflare Workers AI Kimi: content 为空但 reasoning_content 有内容 → 正文在 reasoning_content 中
        if (!content && reasoningChunk) {
            content = reasoningChunk;
        } else if (reasoningChunk) {
            // 真正的思考链，统计但不进入正文
            ctx.reasoningText += reasoningChunk;
        }
        ctx.fullText += content;
        // 【优化】content为空时跳过回调，避免反复推送空字符串到打字机
        if (ctx.onChunk && content) {
            try { ctx.onChunk(content, ctx.fullText); }
            catch (chunkErr) { console.warn('[callAI] onChunk 回调异常:', chunkErr); }
        }
    }
}

// 【优化 #15】SSE 解析为空时的兜底解析（兼容推理模型、异常格式）
// 1) 尝试整体 JSON 解析（部分 API 不走 SSE，直接返回 JSON）
// 2) 如果整体不是 JSON，从 rawBody 中找首条 data 行提取
// 3) 都失败时**回退到 rawBody 原文**——与原版 [backup/index.html L11882-11903] 一致：
//    原版注释明确说"如果也不是 JSON，直接用原始文本"，避免对未知格式显示空白
// 【修复X18】兜底路径也回退到 reasoning_content（与 executeAINormal 保持一致）
function parseAIResponseFallback(rawBody) {
    if (!rawBody) return '';
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
            // 【修复X18】content 为空时回退到 reasoning_content（与 executeAINormal 一致）
            if (_reasoning) {
                console.warn('[parseAIResponseFallback] content 为空，回退 reasoning_content（' + _reasoning.length + ' 字符）');
                return _reasoning;
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
    return rawBody;
}

// 【优化 #15】执行流式 AI 请求
async function executeAIStream(url, body, apiKey, signal, onChunk) {
    var res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify(body),
        signal: signal
    });
    if (!res.ok) {
        // 【P1修复BUG-001】保留 HTTP 状态码，确保 translateError 的 httpMap 能精确匹配
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
        throw new Error(errMsg);
    }

    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    // 【修复 #19】reasoningText 用于统计思考链长度，便于排查"只回了思考链没回正文"的情况
    var ctx = { fullText: '', reasoningText: '', streamError: null, onChunk: onChunk };
    var sseBuffer = '';
    // 【P0修复BUG-004】rawBody 滚动保留最近 256KB
    // 原值 64KB 在推理模型场景下会截断 JSON 末尾（思考过程+JSON 输出可达 50-150KB）
    // 提高到 256KB 可覆盖 99% 推理模型输出，避免 JSON 花括号不匹配
    var rawBody = '';
    var RAW_BODY_MAX = 256 * 1024;
    var rawBodyTruncated = false;

    while (true) {
        var readResult = await reader.read();
        if (readResult.done) {
            if (sseBuffer && sseBuffer.trim()) {
                parseSSEEventText(sseBuffer, ctx);
            }
            break;
        }
        var chunk = decoder.decode(readResult.value, { stream: true });
        // 【P0修复BUG-004】滚动保留最近 256KB，SSE 兜底通常依赖末尾内容
        rawBody += chunk;
            if (rawBody.length > RAW_BODY_MAX) {
                rawBody = rawBody.slice(-RAW_BODY_MAX);
                if (!rawBodyTruncated) {
                    rawBodyTruncated = true;
                    console.warn('[callAI] rawBody 超过 256KB，改为滚动保留最近 256KB 用于兜底');
                }
            }
        sseBuffer += chunk;
        var events = sseBuffer.split(/\r?\n\r?\n/);
        sseBuffer = events.pop() || '';
        for (let i = 0; i < events.length; i++) {
            parseSSEEventText(events[i], ctx);
        }
    }

    // 流中检测到错误
    if (ctx.streamError && !ctx.fullText) {
        throw new Error(ctx.streamError);
    } else if (ctx.streamError && ctx.fullText) {
        console.warn('[callAI] 流中有错误但已收到内容，忽略错误继续:', ctx.streamError);
        // 【优化 #11】UI 软提示
        if (typeof UI !== 'undefined' && UI.toast) {
            UI.toast('响应可能不完整：' + ctx.streamError);
        }
    }

    // 【修复 #19】流结束但剧情正文为空 + 有思考链时打警告，提示排查
    if (!ctx.fullText && ctx.reasoningText) {
        console.warn('[callAI] 推理模型仅返回思考链（' + ctx.reasoningText.length + ' 字符）未返回剧情正文，可能是 max_tokens 过小被思考链吃光');
    }

    // 兜底：SSE 解析为空时再尝试从 rawBody 提取
    if (!ctx.fullText && rawBody) {
        return parseAIResponseFallback(rawBody);
    }
    // 【修复X11】HTTP 200 但 SSE 解析为空 + 无 streamError 时，不应抛 openai_error
    // 旧逻辑：流式空回会返回空字符串，上游 parseAIResponse 兜底显示原文，但若 rawBody 也空则报错
    // 新逻辑：明确区分"HTTP 错误"（res.ok=false，已抛错）和"解析为空"（HTTP 200 但内容空）
    // 后者给出更具体的错误信息，避免误判为 openai_error
    if (!ctx.fullText && !ctx.streamError) {
        console.warn('[callAI] HTTP 200 但流式响应内容为空，可能是 API 返回了非 SSE 格式或空响应');
        throw new Error('AI返回内容为空 → 可能是API返回了非流式格式或响应被截断，请尝试关闭流式模式或重试');
    }
    return ctx.fullText;
}

// 【优化 #15】执行非流式 AI 请求
async function executeAINormal(url, body, apiKey, signal) {
    var res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify(body),
        signal: signal
    });
    if (!res.ok) {
        // 【P1修复BUG-001】保留 HTTP 状态码，确保 translateError 的 httpMap 能精确匹配（同 executeAIStream）
        var errMsg = 'HTTP ' + res.status;
        try {
            var errData = await res.json().catch(function() { return {}; });
            var apiMsg = extractErrorMessage(errData.error || errData, '');
            if (apiMsg) errMsg = errMsg + ': ' + apiMsg;
        } catch (e) { /* 忽略 */ }
        throw new Error(errMsg);
    }
    var data = await res.json();
    // 【修复X18】非流式模式回退到 reasoning_content（与流式模式行为一致）
    // 旧代码（修复 #19）明确拒绝回退，导致部分模型返回 200 但 content 为空时报"配置失败"
    // 流式模式（parseSSEEventText）已实现了回退，非流式应保持一致
    // 安全措施：打 _reasoningAsContent 标记，让 parseAIResponse 的思维链泄漏检测（X8）能拦截真正的推理内容
    var _nmsg = data.choices && data.choices[0] && data.choices[0].message;
    if (_nmsg) {
        var _content = (typeof _nmsg.content === 'string') ? _nmsg.content : '';
        var _reasoning = (typeof _nmsg.reasoning_content === 'string') ? _nmsg.reasoning_content
                       : (typeof _nmsg.reasoning === 'string') ? _nmsg.reasoning : '';
        if (_content) return _content;
        // 【修复X18】content 为空时回退到 reasoning_content（与 executeAIStream 一致）
        if (_reasoning) {
            console.warn('[executeAINormal] content 为空，回退使用 reasoning_content（' + _reasoning.length + ' 字符）');
            return _reasoning;
        }
        // 【修复X19】content 和 reasoning 都为空 → 抛明确错误，而非返回空串让上游困惑
        // 旧代码返回 ''，上游 parseAIResponse 兜底显示"AI未返回剧情内容"，用户不知道是模型问题
        // 新错误信息明确告知是模型兼容性问题，引导用户更换模型（不硬编码具体模型名）
        console.warn('[executeAINormal] 模型返回 200 但 content 和 reasoning_content 均为空，可能是不兼容的模型');
        throw new Error('该模型返回了空内容（content 和 reasoning_content 均为空）→ 可能是不支持文本生成的模型，请更换为支持文本对话的模型');
    }
    // JSON 解析成功但结构不识别，原版兜底行为：返回 res.text() 让用户看到原文
    try { return await res.text(); } catch (e) { return ''; }
}

// AI 调用主入口
// 【优化 #2 + #3 + #17】每次调用自带 5 分钟超时（按次，不是按流块）
// 【优化 #3】每次调用创建独立的 AbortController，串联外部 signal，支持 safeAbort 兼容
// 【优化 #17】入口只读一次配置
async function callAI(messages, options = {}) {
    // 【优化 #17】入口只读一次配置
    var initialCfg = LocalGameAPI.getCurrentConfig();
    if (!initialCfg || !initialCfg.baseUrl || !initialCfg.apiKey) {
        throw new Error('请先配置API（设置 → API配置）');
    }

    // 【优化 #2 + #3】每次调用创建独立的 AbortController
    // 【修复X12】超时时间从 5 分钟延长到 10 分钟，并支持用户自定义
    // 旧代码 5 分钟超时对部分推理模型不够，导致正常请求被误杀
    // 优先级：gameState.aiTimeoutMs（用户自定义）> 默认 10 分钟
    var _timeoutMs = 10 * 60 * 1000;
    if (typeof gameState !== 'undefined' && gameState && gameState.aiTimeoutMs && gameState.aiTimeoutMs > 0) {
        _timeoutMs = gameState.aiTimeoutMs;
    }
    var localAC = new AbortController();
    var timeoutId = setTimeout(function() {
        try { localAC.abort(new Error('AI请求超时（' + Math.round(_timeoutMs / 60000) + '分钟）')); }
        catch (e) { /* 忽略 */ }
    }, _timeoutMs);

    // 串联外部 signal：options.signal 优先，其次兼容旧的 window._currentAbort（safeAbort）
    var externalSignal = options.signal || (window._currentAbort && window._currentAbort.signal);
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
        return await LocalGameAPI.tryWithFallback(async function(slotIdx) {
            var config = LocalGameAPI._configs[slotIdx];
            var url = LocalGameAPI.normalizeUrl(config.baseUrl) + '/chat/completions';
            var body = buildAIRequestBody(messages, options, config);
            if (options.stream) {
                return await executeAIStream(url, body, config.apiKey, localAC.signal, options.onChunk);
            } else {
                return await executeAINormal(url, body, config.apiKey, localAC.signal);
            }
        });
    } finally {
        clearTimeout(timeoutId);
        if (externalListener && externalSignal) {
            try { externalSignal.removeEventListener('abort', externalListener); } catch (e) { /* 忽略 */ }
        }
    }
}
// ========================================
// Context Size 自动检测（动态，不硬编码模型列表）
// ========================================
// 【P1修复BUG-002】已知模型上下文大小硬编码表
// 用于 detectContextSize 优先级 3 的快速 fallback，避免 /models API 因 429 等限速失败后
// 回退到过低的 8192（远低于实际模型上下文如 128K），导致上下文预算被严重压缩、过早裁剪历史。
// 仅收录常见模型的保守下限，宁可小不可大（避免上下文超限报错）。
var _KNOWN_MODEL_CONTEXT = {
    // DeepSeek 系（官方上下文 64K-128K，按 64K 保守取）
    'deepseek-v4-flash': 64000,
    'deepseek-v4': 64000,
    'deepseek-chat': 64000,
    'deepseek-r1': 64000,
    'deepseek-reasoner': 64000,
    // 通用 "auto" 推理模型（多数推理模型 128K，按 128K 取）
    'auto': 128000,
    // GLM 系（128K）
    'glm-4': 128000,
    'glm-4-plus': 128000,
    'glm-4-flash': 128000,
    'glm-4-air': 128000,
    // Claude 系（200K）
    'claude-3-5-sonnet': 200000,
    'claude-3-opus': 200000,
    'claude-3-sonnet': 200000,
    'claude-3-haiku': 200000,
    'claude-3.5-sonnet': 200000,
    // GPT-4o 系（128K）
    'gpt-4o': 128000,
    'gpt-4o-mini': 128000,
    'gpt-4-turbo': 128000,
    // Gemini 系（1M，按 128K 保守取避免触发上下文预算策略）
    'gemini-1.5-pro': 128000,
    'gemini-1.5-flash': 128000,
    // Qwen 系（128K）
    'qwen-max': 128000,
    'qwen-plus': 128000,
    'qwen-turbo': 128000,
    // Kimi/Moonshot（128K）
    'moonshot-v1-8k': 8192,
    'moonshot-v1-32k': 32000,
    'moonshot-v1-128k': 128000
};

// 【P1修复BUG-002】带重试和指数退避的 fetch（网络错误/超时/429/5xx 重试，401/403 不重试）
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
                console.log('[Context检测] 网络错误，' + delay + 'ms 后重试 (' + (attempt + 1) + '/' + maxRetries + '):', msg);
                await new Promise(function(r) { setTimeout(r, delay); });
            }
        }
    }
    throw lastErr;
}

async function detectContextSize() {
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
                var models = data.data || data;
                if (Array.isArray(models)) {
                    var target = models.find(function(m) {
                        var id = (m.id || m.name || '').toLowerCase();
                        return id === model || id.endsWith('/' + model) || id.endsWith(':' + model);
                    });
                    if (target) {
                        // 部分API返回 context_length / max_context_length
                        var ctx = target.context_length || target.max_context_length || target.context_window || 0;
                        if (ctx > 0) {
                            gameState.contextSize = ctx;
                            console.log('[Context检测] 来自 /models API: ' + ctx);
                            return ctx;
                        }
                    }
                }
            }
        } catch (e) {
            console.log('[Context检测] /models API 不可用（已重试），尝试其他方式:', (e && e.message) || e);
        }
    }

    // 优先级3：从模型名中提取数字推断
    var ctxSize = 0;

    // 3a. 已知模型硬编码表（优先于正则，避免模型名不带数字时漏判）
    //     如 "auto"、"glm-4-flash" 等不带上下文数字标识的模型
    if (ctxSize === 0 && _KNOWN_MODEL_CONTEXT[model]) {
        ctxSize = _KNOWN_MODEL_CONTEXT[model];
        console.log('[Context检测] 来自硬编码模型表: ' + ctxSize);
    }

    // 3b. 模型名中直接标注的 context size（如 "xxx-32k", "xxx-128k"）
    if (ctxSize === 0) {
        var kMatch = model.match(/(\d+)k/);
        if (kMatch) ctxSize = parseInt(kMatch[1]) * 1024;
    }

    // 3c. 模型名中标注的数字（如 "xxx-8192", "xxx-128000"）
    if (ctxSize === 0) {
        var numMatch = model.match(/[-_](\d{4,})/);
        if (numMatch) {
            var num = parseInt(numMatch[1]);
            if (num >= 2048) ctxSize = num;
        }
    }

    // 3d. 动态询问AI自身的context size（完全动态，带 1 次重试）
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
                    var probeCtx = parseInt(numOnly);
                    if (probeCtx >= 2048 && probeCtx <= 10000000) {
                        ctxSize = probeCtx;
                        console.log('[Context检测] AI自报context: ' + ctxSize);
                    }
                }
            }
        } catch (e) {
            console.log('[Context检测] AI自报context失败（已重试），使用兜底值');
        }
    }

    // 兜底：默认 32K（【P1修复BUG-002】从 8192 提升到 32000）
    // 旧值 8192 远低于现代模型实际容量（多数 64K-128K），导致智能上下文裁剪过早淘汰历史消息。
    // 32000 是较保守的中间值，既能覆盖多数模型的实际需求，又不会因高估导致上下文超限。
    if (ctxSize === 0) {
        ctxSize = 32000;
        console.log('[Context检测] 所有探测均失败，使用兜底值 32000（旧值 8192 已废弃）');
    }

    gameState.contextSize = ctxSize;
    console.log('[Context检测] 最终结果(' + model + '): ' + ctxSize);
    return ctxSize;
}

// ========================================
// 开局设定提取：用AI从玩家设定中提取结构化信息，预填充记忆系统
// ========================================
async function extractSetupToMemory() {
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
            max_tokens: 4096
        });

        var parsed = parseJSONHelper(result);
        if (!parsed) {
            // 尝试从文本中提取JSON
            var jsonMatch = result && result.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsed = parseJSONHelper(jsonMatch[0]);
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

        // 3. 角色 → permanentFacts.npcProfiles + StateManager（经 CharacterMutator）
        if (Array.isArray(parsed.characters)) {
            var playerName = gameState.playerName || (gameState.protagonistSetup && gameState.protagonistSetup.mcName) || '';
            parsed.characters.forEach(function(c) {
                if (!c || !c.name) return;
                // 跳过主角（主角不进NPC表）
                if (playerName && (c.name === playerName || c.name.includes(playerName) || playerName.includes(c.name))) return;
                // 写入 permanentFacts.npcProfiles（保留原行为：AI 提取的角色描述作为永久事实）
                var profileDesc = c.name + '：' + (c.title || '') + (c.relation ? '，与主角关系：' + c.relation : '') + (typeof c.favorability === 'number' ? '，好感度' + c.favorability : '') + (c.desc ? '。' + c.desc : '');
                gm.addWorldAnchor('npc_profile', profileDesc, 'setup_extract', 0);
                // 【P1-11修复】删除 gm.tables.characters 直接写入与 gameState.allCharacters else 兜底：
                // 1. 原 gm.tables.characters[c.name] = {...} 绕过 CharacterMutator，与 mergeCharacters 双写：
                //    直接写 GameMemory 权威源后 mergeCharacters 再写 StateManager，两份数据各自演化易不同步。
                // 2. else 分支直接写 gameState.allCharacters 绕过 _syncLegacyMirror，造成数据孤岛。
                // 现统一委托 CharacterMutator.mergeCharacters（→ StateManager.set('entities.characters')）：
                //    - _syncLegacyMirror 自动同步数组→对象到 gameState.allCharacters
                //    - GameMemoryAdapter.syncToGameMemory 自动 MERGE 实体字段到 gm.tables.characters
                //      （保留运行时累积字段 history/accessCount/locked 等，新增条目用默认值）
                // 与 _applyMemsToGameState 对齐：缺失 mutator 即抛错，不再静默兜底。
                if (typeof CharacterMutator === 'undefined' || !CharacterMutator.mergeCharacters) {
                    throw new Error('[extractSetup] CharacterMutator 未加载，无法写入角色');
                }
                CharacterMutator.mergeCharacters([{
                    name: c.name,
                    title: c.title || '',
                    relation: c.relation || '',
                    favorability: typeof c.favorability === 'number' ? c.favorability : 50,
                    desc: c.desc || ''
                }]);
            });
        }

        // 4. 关系 → tables.relationships
        if (Array.isArray(parsed.relationships)) {
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
            // 【阶段5统一】删除原直接 push 到 gameState.relationships 的重复逻辑
            // 由 _syncRelationshipsToGameState 作为唯一同步点统一更新 gameState + StateManager
            if (typeof _syncRelationshipsToGameState === 'function') {
                _syncRelationshipsToGameState();
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
            // 同步到 gameState.currentBag
            if (typeof gameState !== 'undefined') {
                if (!gameState.currentBag) gameState.currentBag = [];
                parsed.items.forEach(function(item) {
                    if (!item || !item.name) return;
                    var exists = gameState.currentBag.some(function(b) { return b.name === item.name; });
                    if (!exists) gameState.currentBag.push({ name: item.name, count: item.count || 1, desc: item.desc || '', rarity: item.rarity || '普通' });
                });
            }
        }

        // 保存记忆数据
        gm.saveToStorage();
        // 【P1修复BUG-2.2】移除 GameLinker.refreshAll()：死代码空操作
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
                    max_tokens: Math.min(targetChars + 500, 8192)
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
}

// ========================================
// System Prompt
// ========================================
async function initializeGame() {
    try {
        // 检测 API 模型的 context size（异步：可能调/models API或询问AI）
        await detectContextSize();

        // 收集主角设定
        // 【修复BUG-002】startNewGame 已将主角设定写入 gameState.protagonistSetup（字段名 mcName 等），
        // 此前这里用 gameState.protagonistSetup = {} 重置后再从 DOM 元素 id="mcName" 读取——
        // 但 HTML 中输入框 id 是 "setupPlayerName"（非 "mcName"），导致重置后读取永远为空，
        // 主角名丢失，个人页显示"未命名"。改为：仅在未预填时才从 DOM 收集，并同步 playerName。
        if (!gameState.protagonistSetup || Object.keys(gameState.protagonistSetup).length === 0) {
            gameState.protagonistSetup = {};
            var mcFields = ['mcName', 'mcGender', 'mcAge', 'mcIdentity', 'mcPersonality', 'mcAppearance',
                'mcAbility', 'mcExtra'
            ];
            mcFields.forEach(function(id) {
                var el = document.getElementById(id);
                if (el && el.value.trim()) gameState.protagonistSetup[id] = el.value.trim();
            });
        }
        // 【修复BUG-002】同步 playerName，确保全项目读取一致
        // 此前新游戏流程从不设置 gameState.playerName，只有读档时（loadGameState）才同步，
        // 导致新游戏个人页始终显示"未命名"
        if (!gameState.playerName && gameState.protagonistSetup && gameState.protagonistSetup.mcName) {
            gameState.playerName = gameState.protagonistSetup.mcName;
        }
        if (!gameState.playerData) gameState.playerData = {};
        if (!gameState.playerData.name && gameState.playerName) {
            gameState.playerData.name = gameState.playerName;
        }
gameState.systemPrompt = buildSystemPrompt();
gameState.conversationHistory = [{
        role: 'system',
        content: gameState.systemPrompt
    }];
// 【优化】移除 customStyle 注入——customStyle 是死字段（无 UI 输入框），文风由 writingStyle 统一管理
// 旧代码在此注入【写作风格要求】对话，与文风选择（writingStyle）语义重复，可能互相矛盾
// 初始化游戏时间显示
if (typeof GameTimeSystem !== 'undefined') {
    GameTimeSystem.updateUI();
}
// 开局前：用AI提取设定，预填充记忆系统（按次计费，多一次API调用无妨）
extractSetupToMemory().then(function() {
    sendAIRequest('请开始游戏，描述开局场景。', true);
}).catch(function(e) {
    console.warn('[开局设定提取] 失败，直接开局:', e && e.message);
    sendAIRequest('请开始游戏，描述开局场景。', true);
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
