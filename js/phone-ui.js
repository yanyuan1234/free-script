
// ========================================
// 第7层: 论坛系统
// ========================================
//
// 【P1修复BUG-7.10 / P1-7.16】UI 层绕过 StateManager 直接读写业务状态字段
// -----------------------------------------------------------------------------
// 项目架构：StateManager 是权威源 + _syncLegacyMirror 单向镜像到 gameState 旧字段
// （供 UI 读取兼容，参见 state-manager.js 顶部 P1-5.3 注释）。
// 但 phone-ui.js 大量函数仍直接读写 legacy 字段：
//   - 读：gameState.allCharacters / currentBag / currentQuests / playerData / keyEvents /
//          relationships / _worldModules（40+ 处）
//   - 写：gameState.currentBag.push / gameState.allCharacters[name] = ...
//          / gameState.playerData = ... / gameState.keyEvents = ...
//
// 风险：
//   1. 直接写 legacy 字段绕过 _syncLegacyMirror → StateManager.get 返回陈旧值
//   2. 直接读 legacy 字段 → 读到镜像值，可能与 StateManager 实际值有时序差异
//   3. 同一概念（角色/物品/任务）有 StateManager 内部值 + gameState 镜像值两份
//
// 修复路线（与 P1-5.3 共同推进）：
//   - 短期（本注释）：明确边界，新增 UI 函数禁止直接读写 legacy 字段
//   - 中期：phone-ui.js 全部改读 StateManager.get / 改写 StateManager.set 或对应 Mutator
//   - 长期：删除 _syncLegacyMirror 与 gameState 旧字段（参见 P1-5.3）
//
// 写入替换映射（推荐 Mutator）：
//   - gameState.currentBag.push(...)        → BagMutator.mergeItems([item])
//   - gameState.allCharacters[name] = obj   → CharacterMutator.replaceCharacter(name, obj)
//   - gameState.playerData = ...            → StateManager.set('entities.player', ...)
//   - gameState.currentQuests = ...         → QuestMutator.addQuest / resolveQuest
//   - gameState.keyEvents = ...             → StateManager.set('entities.events', ...)
//
// 注：本会话仅完成短期文档化，物理迁移涉及 80+ 调用点，延后到独立重构任务。


// ========================================
// 【P2-阶段3-15】玩家货币读写 helper
// 统一 phone-ui.js 中 5 处 currency fallback 读取 + 3 处 currencyName + 1 处扣款
// 原 fallback 链 gameState.currency || gameState.money || gameState.coins || 0 散落多处
// ========================================
function getPlayerMoney() {
    // 【P1-2修复】优先从 StateManager 权威源读取，_syncLegacyMirror 会自动同步到 gameState.currency
    if (typeof StateManager !== 'undefined' && StateManager.get) {
        var cur = StateManager.get('entities.currency');
        if (cur !== undefined && cur !== null) return cur;
    }
    return gameState.currency || gameState.money || gameState.coins || 0;
}
function getCurrencyName() {
    // 【P1-2修复】优先从 StateManager 读取
    if (typeof StateManager !== 'undefined' && StateManager.get) {
        var name = StateManager.get('entities.currencyName');
        if (name) return name;
    }
    return gameState.currencyName || '金币';
}
// 扣款：统一走 StateManager，_syncLegacyMirror 自动回写 gameState.currency
// 【P1-2修复】原直接改 gameState.currency 不反向同步到 StateManager，
// 导致 StateManager.get('entities.currency') 返回陈旧值（架构违反：
// StateManager 是权威源，gameState 是只读镜像）
function subtractPlayerMoney(amount) {
    var current = getPlayerMoney();
    var newAmount = current - amount;
    if (typeof StateManager !== 'undefined' && StateManager.set) {
        StateManager.set('entities.currency', newAmount, { silent: true });
        // _syncLegacyMirror 自动同步到 gameState.currency，无需手动双写
    } else {
        // legacy fallback：StateManager 不可用时直接改 gameState
        if (gameState.currency !== undefined) gameState.currency -= amount;
        else if (gameState.money !== undefined) gameState.money -= amount;
        else if (gameState.coins !== undefined) gameState.coins -= amount;
    }
}

// ========================================
// 【P2-阶段3-14】按类型筛选世界模块 helper
// 统一 phone-ui.js 中 13+ 处 (gameState._worldModules || []).filter(m => m.type === 'xxx')
// 支持单类型字符串或类型数组（兼容 BUG-007 的 comments/forum 双类型）
// ========================================
function getModulesByType(type) {
    var mods = gameState._worldModules || [];
    if (Array.isArray(type)) {
        return mods.filter(function(m) { return m && type.indexOf(m.type) >= 0; });
    }
    return mods.filter(function(m) { return m && m.type === type; });
}


function _switchForumView(showHot) {
    var hotView = document.getElementById('forumHotView');
    var topicView = document.getElementById('forumTopicView');
    var tabBar = document.getElementById('forumTabBar');
    var details = document.querySelectorAll('.forum-post-detail');
    var showEl = showHot ? hotView : topicView;
    var hideEl = showHot ? topicView : hotView;
    var activeIdx = showHot ? 0 : 1;
    if (hideEl && hideEl.style.display !== 'none') {
        hideEl.classList.add('slide-out');
        TimerManager.setTimeout('forumSlideOut', function() {
            hideEl.style.display = 'none';
            hideEl.classList.remove('slide-out');
            if (showEl) {
                showEl.style.display = 'block';
                showEl.classList.add('slide-in');
                TimerManager.setTimeout('forumSlideIn', function() { showEl.classList.remove('slide-in'); }, 250);
            }
        }, 200);
    } else {
        if (showEl) showEl.style.display = 'block';
    }
    for (var i = 0; i < details.length; i++) {
        details[i].style.display = 'none';
        details[i].classList.remove('active');
    }
    if (tabBar) tabBar.style.display = 'flex';
    var tabs = document.querySelectorAll('.forum-tab-item');
    for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
    if (tabs[activeIdx]) tabs[activeIdx].classList.add('active');
}
function showForumHot() { _switchForumView(true); }
function showForumTopic() { _switchForumView(false); }
function showForumMine() {
    var hotView = document.getElementById('forumHotView');
    var topicView = document.getElementById('forumTopicView');
    var mineView = document.getElementById('forumMineView');
    var tabBar = document.getElementById('forumTabBar');
    if (hotView) hotView.style.display = 'none';
    if (topicView) topicView.style.display = 'none';
    if (mineView) mineView.style.display = 'block';
    if (tabBar) tabBar.style.display = 'flex';
    var tabs = document.querySelectorAll('.forum-tab-item');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    if (tabs[2]) tabs[2].classList.add('active');
    var details = document.querySelectorAll('.forum-post-detail');
    for (var k = 0; k < details.length; k++) details[k].style.display = 'none';
}
function openForumPost(idx) {
    var detail = document.getElementById('forumPostDetail' + idx);
    var hotView = document.getElementById('forumHotView');
    var topicView = document.getElementById('forumTopicView');
    var tabBar = document.getElementById('forumTabBar');
    var allDetails = document.querySelectorAll('.forum-post-detail');
    for (var i = 0; i < allDetails.length; i++) {
        allDetails[i].style.display = 'none';
        allDetails[i].classList.remove('active');
    }
    if (hotView) hotView.style.display = 'none';
    if (topicView) topicView.style.display = 'none';
    if (tabBar) tabBar.style.display = 'none';
    if (detail) {
        detail.style.display = 'flex';
        detail.classList.add('active');
        detail.style.height = '100%';
    }
}
function closeForumPost(idx) {
    var detail = document.getElementById('forumPostDetail' + idx);
    if (detail) {
        detail.classList.remove('active');
        TimerManager.setTimeout('closeForumPost', function() {
            detail.style.display = 'none';
            showForumHot();
        }, 300);
    } else {
        showForumHot();
    }
}
function sendForumComment(postIdx, replyToName) {
    var input = document.querySelector('#forumPostDetail' + postIdx + ' .forum-comment-input');
    if (!input) return;
    var text = input.textContent.trim();
    if (!text) return;
    input.textContent = '';
    var playerName = gameState.playerName || '我';
    var commentMods = getModulesByType('comments');
    if (!commentMods[postIdx]) return;
    if (!commentMods[postIdx].comments) commentMods[postIdx].comments = [];
    var newComment = {
        name: playerName,
        text: text,
        time: new Date().toLocaleTimeString(),
        isPlayer: true,
        replyTo: replyToName || ''
    };
    commentMods[postIdx].comments.push(newComment);
    appendForumReply(postIdx, newComment);
    autoSave();
    requestForumNpcReplies(postIdx, text, playerName);
}
function replyToForumComment(postIdx, commentIdx) {
    var commentMods = getModulesByType('comments');
    if (!commentMods[postIdx] || !commentMods[postIdx].comments[commentIdx]) return;
    var targetName = commentMods[postIdx].comments[commentIdx].name || '匿名';
    var input = document.querySelector('#forumPostDetail' + postIdx + ' .forum-comment-input');
    if (!input) return;
    input.focus();
    input.textContent = '@' + targetName + ' ';
    input.setAttribute('data-reply-to', targetName);
    // 使用统一的keydown处理，避免事件覆盖问题
    input.onkeydown = function(e) {
        if ((e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13) && !e.shiftKey) {
            e.preventDefault();
            var replyTo = input.getAttribute('data-reply-to') || '';
            sendForumComment(postIdx, replyTo);
            // 发送后清除replyTo状态
            input.removeAttribute('data-reply-to');
        }
    };
}
function appendForumReply(postIdx, comment) {
    var detail = document.getElementById('forumPostDetail' + postIdx);
    if (!detail) return;
    var list = detail.querySelector('.forum-reply-list');
    if (!list) return;
    var item = document.createElement('div');
    item.className = 'forum-reply-item' + (comment.replyTo ? ' thread' : '');
    item.style.opacity = '0';
    item.style.transform = 'translateY(10px)';
    item.style.transition = 'opacity .3s, transform .3s';
    var avatarColor = comment.isPlayer ? '#333' : '#8d6e63';
    var replyPrefix = comment.replyTo ? '<span class="forum-at-user">@' + escapeHtml(comment.replyTo) + '</span> ' : '';
    item.innerHTML = '<div class="forum-reply-avatar" style="background:' + avatarColor + '">' + escapeHtml((comment.name || '匿').charAt(0)) + '</div>' +
        '<div class="forum-reply-main"><div class="forum-reply-name">' + escapeHtml(comment.name || '匿名') + '</div>' +
        '<div class="forum-reply-content">' + replyPrefix + escapeHtml(comment.text || '') + '</div>' +
        '<div class="forum-reply-meta">' + escapeHtml(comment.time || '刚刚') +
        '　<span style="cursor:pointer" onclick="replyToForumComment(' + postIdx + ',' + ((detail
            .querySelectorAll('.forum-reply-item').length)) + ')">回复</span></div></div>';
    list.appendChild(item);
    requestAnimationFrame(function() {
        item.style.opacity = '1';
        item.style.transform = 'translateY(0)';
    });
    var scroll = detail.querySelector('.forum-post-scroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
}
function requestForumNpcReplies(postIdx, playerText, playerName) {
    var commentMods = getModulesByType('comments');
    var post = commentMods[postIdx];
    if (!post) return;
    var existingComments = (post.comments || []).slice(-8).map(function(c) {
        return (c.replyTo ? c.name + '回复' + c.replyTo + ': ' : c.name + ': ') + c.text;
    }).join('\n');
    var playerIdentity = '';
    if (gameState.player) {
        playerIdentity = '身份: ' + (gameState.player.title || gameState.player.identity || '普通玩家');
        if (gameState.player.desc) playerIdentity += '，' + gameState.player.desc;
    }
    var npcNames = [];
    if (gameState.allCharacters) Object.values(gameState.allCharacters).forEach(function(c) {
        if (c.name) npcNames.push(c.name + '(' + (c.title || c.desc || '') + ')');
    });
    var sysMsg = '你是一个社区系统，负责让角色们自然地回复帖子。每个角色根据自己的性格、立场和与玩家的关系来发言——有人热情、有人冷淡、有人吃瓜、有人抬杠，这才是真实的社区。\n\n' +
        '【玩家信息】名字: ' + playerName + '，' + (playerIdentity || '普通玩家') + '\n' +
        '【玩家设定】\n' + (typeof getCompactSetupForSubFunction === 'function' ? getCompactSetupForSubFunction() : (gameState.userPrompt && gameState.userPrompt.trim() ? gameState.userPrompt.trim() : '无')) + '\n' +
        '【当前角色关系】\n' + (function() {
            var rels = gameState.relationships || [];
            if (rels.length === 0) return '暂无关系数据';
            return rels.map(function(r) { return r.from + '→' + r.to + ': ' + r.type + (r.desc ? '(' + r.desc + ')' : ''); }).join('\n');
        })() + '\n' +
        '【帖子标题】' + (post.title || '未知') + '\n' +
        '【帖子内容】' + (post.main || post.content || '未知') + '\n' +
        '【已有评论】\n' + (existingComments || '暂无评论') + '\n\n' +
        '【可选NPC】' + (npcNames.length > 0 ? npcNames.join('、') : '随机生成网名') + '\n\n';
    // 注入主角身份快照（P2 修复：让论坛 NPC 了解玩家身份/性格/属性）
    if (gameState.worldSnapshot && gameState.worldSnapshot.player) {
        var _fp2 = gameState.worldSnapshot.player;
        if (_fp2.identity) sysMsg += '【主角身份】' + _fp2.identity + '\n';
        if (_fp2.personality) sysMsg += '【主角性格】' + _fp2.personality + '\n';
        if (_fp2.stats && _fp2.stats.length > 0) {
            sysMsg += '【主角属性】' + _fp2.stats.map(function(s) { return s.label + ':' + s.value; }).join(', ') + '\n';
        }
        sysMsg += '\n';
    }
    // 注入增强记忆（让NPC了解剧情进展）
    if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.buildSmartInjection) {
        var _forumMemText = EnhancedMemory.buildSmartInjection();
        if (_forumMemText) sysMsg += '【剧情记忆】\n' + _forumMemText + '\n\n';
    }
    // 注入世界书（让NPC知道世界设定）
    // 【P1修复BUG-011-世界书入口】删除 `: WorldInfo.buildInjection(...)` 兜底分支
    if (typeof getWorldInfoInjection === 'function') {
        var _forumWI = getWorldInfoInjection();
        var _forumWIText = isObject(_forumWI) ? (_forumWI.text || '') : (_forumWI || '');
        if (_forumWIText) sysMsg += '【世界知识】\n' + _forumWIText + '\n\n';
    }
    // 【提示词重设计】让 AI 理解「真实社区」的质感，再交给它自由发挥
    sysMsg += '【一个真实的社区是什么样的】\n' +
        '想象一个热闹的讨论区：不同性格的网友会基于自己的立场自然发言——有人热心、有人抬杠、有人围观、有人阴阳怪气，这才是真实的网络生态。\n' +
        '被@到的角色大概率会回复。回复要短平快，像真人发评论。\n' +
        '如果某个角色的发言太火，可能引发新帖讨论——你觉得会引发就加上 maySpawnNewPost: true，交给程序决定要不要触发。\n\n' +
        '【程序需要的输出】\n' +
        '你的输出会喂给论坛界面渲染——保持 JSON 结构，原始文本最稳，markdown 代码块包裹会让评论显示失败。\n' +
        '[{"name":"昵称","text":"内容","replyTo":"要回复的人名(可选)"}]\n' +
        '当决定触发新帖时，包装成对象：{"replies": [...], "maySpawnNewPost": true}';
    // 【一致性修复】注入预设写作风格，与主剧情/私聊同步
    sysMsg += (typeof getPresetStyleBlock === 'function' ? getPresetStyleBlock() : '');
    // 【P0边界修复】_useSysprompt=false 时把 system role 转为 user
    var _forumMsg = _applyUseSysprompt([{
        role: 'system',
        content: sysMsg
    }, {
        role: 'user',
        content: '请生成NPC回复'
    }]);
    callAI(_forumMsg, {
        stream: false
    }).then(function(resp) {
        try {
            var data = typeof resp === 'string' ? JSON.parse(resp) : resp;
            var replies = Array.isArray(data) ? data : (data.replies || []);
            if (!commentMods[postIdx].comments) commentMods[postIdx].comments = [];
            var delay = 500;
            replies.forEach(function(r, rIdx) {
                if (!r.name || !r.text) return;
                TimerManager.setTimeout('forumReply_' + postIdx + '_' + rIdx, function() {
                    commentMods[postIdx].comments.push({
                        name: r.name,
                        text: r.text,
                        time: new Date().toLocaleTimeString(),
                        replyTo: r.replyTo || ''
                    });
                    appendForumReply(postIdx, {
                        name: r.name,
                        text: r.text,
                        time: new Date().toLocaleTimeString(),
                        replyTo: r.replyTo || ''
                    });
                    autoSave();
                }, delay);
                delay += 300 + Math.random() * 500;
            });
            // 跨帖联动：身份高时可能生成新帖
            if (data.maySpawnNewPost && modules.length < 8) {
                TimerManager.setTimeout('spawnForumPost_' + postIdx, function() {
                    spawnForumPostAboutPlayer(postIdx, playerText, playerName);
                }, delay + 500);
            }
        } catch (e) {
            console.warn('论坛NPC回复解析失败:', e);
        }
    }).catch(function(e) {
        console.warn('论坛NPC回复请求失败:', e);
    });
}
function spawnForumPostAboutPlayer(srcPostIdx, playerComment, playerName) {
    var srcPost = getModulesByType('comments')[srcPostIdx];
    if (!srcPost) return;
    var sysMsg = '你是一个社区系统。玩家在社区发言引起了关注，有人开了一个新帖子来讨论这件事——这是社区的自然反应。\n\n' +
        '【玩家】' + playerName + '\n' +
        '【玩家设定】\n' + (typeof getCompactSetupForSubFunction === 'function' ? getCompactSetupForSubFunction() : (gameState.userPrompt && gameState.userPrompt.trim() ? gameState.userPrompt.trim() : '无')) + '\n' +
        '【原帖标题】' + (srcPost.title || '未知') + '\n' +
        '【玩家评论】' + playerComment + '\n\n';
    // 注入玩家身份快照（让新帖符合玩家身份）
    if (gameState.worldSnapshot && gameState.worldSnapshot.player) {
        var _fp = gameState.worldSnapshot.player;
        if (_fp.identity) sysMsg += '【主角身份】' + _fp.identity + '\n';
        if (_fp.personality) sysMsg += '【主角性格】' + _fp.personality + '\n';
    }
    // 注入增强记忆（让新帖了解剧情进展）
    if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.buildSmartInjection) {
        var _spawnMemText = EnhancedMemory.buildSmartInjection();
        if (_spawnMemText) sysMsg += '【剧情记忆】\n' + _spawnMemText + '\n\n';
    }
    // 注入世界书（让新帖符合世界设定——P1 修复：跨帖生成前漏注世界书）
    // 【P1修复BUG-011-世界书入口】删除直调 WorldInfo.buildInjection，统一走 getWorldInfoInjection
    if (typeof getWorldInfoInjection === 'function') {
        var _spawnWI = getWorldInfoInjection();
        var _spawnWIText = isObject(_spawnWI) ? (_spawnWI.text || '') : (_spawnWI || '');
        if (_spawnWIText) sysMsg += '【世界知识】\n' + _spawnWIText + '\n\n';
    }
    // 【提示词重设计】让 AI 理解「好帖子」的质感，再交给它自由发挥
    sysMsg += '【好帖子的样子】\n' +
        '想象一个真实的网络帖子：标题能让人一眼想点进来（10-20字，能引发好奇或共鸣），正文有立场和观点，引用玩家原话加上自己的看法（50-100字），角度和原帖不同让人有新鲜感。\n\n' +
        '【程序需要的输出】\n' +
        '你的输出会喂给论坛界面渲染——保持 JSON 结构，原始文本最稳，markdown 代码块包裹会让新帖显示失败。\n' +
        '{"title":"新帖子标题","author":"发帖人昵称","main":"帖子正文"}';
    // 【一致性修复】注入预设写作风格，与主剧情/私聊同步
    sysMsg += (typeof getPresetStyleBlock === 'function' ? getPresetStyleBlock() : '');
    // 【P0边界修复】_useSysprompt=false 时把 system role 转为 user（与其他 side function 一致）
    var _spawnMsg = _applyUseSysprompt([{
        role: 'system',
        content: sysMsg
    }, {
        role: 'user',
        content: '生成新帖子'
    }]);
    callAI(_spawnMsg, {
        stream: false
    }).then(function(resp) {
        try {
            var data = typeof resp === 'string' ? JSON.parse(resp) : resp;
            if (data && data.title && data.main) {
                // 【全量修复-P2】方向反转：以 StateManager 为权威源读取，本地累积后写回
                var _mods = (typeof StateManager !== 'undefined' && StateManager.get)
                    ? (StateManager.get('ui.worldModules') || [])
                    : (Array.isArray(gameState._worldModules) ? gameState._worldModules : []);
                _mods.push({
                    type: 'comments',
                    title: data.title,
                    author: data.author || '匿名',
                    main: data.main,
                    comments: []
                });
                // 写入权威源 StateManager，_syncLegacyMirror 自动回写 gameState._worldModules
                if (typeof StateManager !== 'undefined' && StateManager.set) {
                    StateManager.set('ui.worldModules', _mods, { silent: true });
                } else if (typeof gameState !== 'undefined') {
                    gameState._worldModules = _mods;
                }
                autoSave();
                // 刷新论坛页面
                var forumContainer = document.getElementById('logSubContent');
                if (forumContainer) {
                    forumContainer.innerHTML = renderForumPage();
                }
            }
        } catch (e) {
            console.warn('跨帖联动生成失败:', e);
        }
    }).catch(function(e) {
        console.warn('跨帖联动请求失败:', e);
    });
}
// 渲染论坛页面

// ========================================
// 第8层: 日志子页面渲染函数
// ========================================
function switchItemsTab(type, el) {
    var tabs = el.parentElement.querySelectorAll('.items-tab-btn');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    el.classList.add('active');
    var itemsSection = document.getElementById('itemsSection');
    var billSection = document.getElementById('billSection');
    if (itemsSection) itemsSection.style.display = type === 'items' ? 'block' : 'none';
    if (billSection) billSection.style.display = type === 'bill' ? 'block' : 'none';
}
// 背包分类筛选
function filterBagItems(category, el) {
    if (el) {
        var tabs = el.parentElement.querySelectorAll('.items-sub-tab');
        for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
        el.classList.add('active');
    }
    var grid = document.getElementById('itemsGrid');
    if (!grid) return;
    var boxes = grid.querySelectorAll('.items-box');
    for (var j = 0; j < boxes.length; j++) {
        var box = boxes[j];
        var rarityEl = box.querySelector('.items-box-rarity');
        var rarityText = rarityEl ? rarityEl.textContent.trim() : '';
        var nameEl = box.querySelector('.items-box-name');
        var nameText = nameEl ? nameEl.textContent.trim() : '';
        var show = true;
        if (category === 'all') { show = true; }
        else if (category === '装备') { show = nameText.indexOf('[已装备]') !== -1 || rarityText === '装备' || rarityText.indexOf('装备') !== -1; }
        else if (category === '消耗品') { show = rarityText === '消耗品' || rarityText.indexOf('消耗') !== -1; }
        else if (category === '材料') { show = rarityText === '材料' || rarityText.indexOf('材料') !== -1; }
        box.style.display = show ? '' : 'none';
    }
}
function viewNpcDiary(name) {
    gameState._currentDiaryNpc = name;
    if (!gameState._npcDiaries) gameState._npcDiaries = {};
    if (!gameState._npcDiaries[name]) {
        gameState._npcDiaries[name] = {
            entries: [],
            memos: []
        };
    }
    openLogSubPage('diary');
}
function diaryBackToList() {
    gameState._currentDiaryNpc = '';
    openLogSubPage('diary');
}
function diaryChangeDate(dir) {
    if (!gameState._diaryDateOffset) gameState._diaryDateOffset = 0;
    gameState._diaryDateOffset += dir;
    openLogSubPage('diary');
}
function diaryResetDate() {
    gameState._diaryDateOffset = 0;
    openLogSubPage('diary');
}
function openDiaryDatePicker() {
    var npcName = gameState._currentDiaryNpc;
    if (!npcName) return;
    var diaries = gameState._npcDiaries || {};
    var entries = (diaries[npcName] && diaries[npcName].entries) || [];
    if (entries.length === 0) {
        UI.toast('该角色尚无日记');
        return;
    }
    var seen = {};
    var dateList = [];
    entries.forEach(function(e) {
        if (e && e.date && !seen[e.date]) {
            seen[e.date] = true;
            dateList.push(e.date);
        }
    });
    dateList.sort(function(a, b) { return a < b ? 1 : (a > b ? -1 : 0); });
    // 【缺陷修复】改用 UI.createModal 走统一弹窗管理，避免 z-index:999999 与 modal 栈冲突
    var listHtml = '<div style="background:var(--bg);border-radius:12px;width:280px;max-height:60vh;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,0.2);">' +
        '<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-weight:600;font-size:15px;display:flex;justify-content:space-between;align-items:center;">' +
        '<span>选择日期</span><span style="cursor:pointer;color:var(--text-secondary);font-size:20px;" onclick="UI.hideModal(\'diaryDatePicker\')">×</span></div>' +
        dateList.map(function(d) {
            // 【优化·XSS 修复】旧代码只转义单引号，不防 XSS；新代码先 escapeHtml 再转义单引号
            // d 来自 AI 返回的日记数据，可能含恶意字符
            // 【J修复】统一用 escapeAttr（转义 \ ' " < > \n \r），替代 escapeHtml+手动单引号转义
            var safeD = escapeAttr(d);
            return '<div style="padding:12px 16px;border-bottom:1px solid #f5f5f5;cursor:pointer;font-size:14px;" onclick="UI.hideModal(\'diaryDatePicker\');diaryJumpToDate(\'' + safeD + '\')">' + escapeHtml(d) + '</div>';
        }).join('') +
        '</div>';
    UI.createModal({ id: 'diaryDatePicker', html: listHtml, persistent: false });
}
// 【P2清理】删除 closeDiaryDatePicker（全项目零调用）
function diaryJumpToDate(dateStr) {
    var npcName = gameState._currentDiaryNpc;
    if (!npcName) return;
    var diaries = gameState._npcDiaries || {};
    var entries = (diaries[npcName] && diaries[npcName].entries) || [];
    var idx = entries.findIndex(function(e) { return e && e.date === dateStr; });
    gameState._diaryDateOffset = -idx;
    openLogSubPage('diary');
}
// 邮件详情
function openMailDetail(index) {
    var mailModules = getModulesByType('mail');
    var allMails = [];
    mailModules.forEach(function(mod) {
        if (mod.items && Array.isArray(mod.items)) {
            mod.items.forEach(function(item) {
                allMails.push(item);
            });
        }
    });
    if (allMails.length === 0) allMails = gameState._mails || [];
    if (index >= allMails.length) return;
    var mail = allMails[index];
    if (!mail.read) {
        mail.read = true;
        if (!gameState._notifSeenSnapshot) gameState._notifSeenSnapshot = {};
        if (!gameState._notifSeenSnapshot.mail) gameState._notifSeenSnapshot.mail = { count: 0 };
        var seenMailCount = 0;
        for (var mi = 0; mi < allMails.length; mi++) {
            if (allMails[mi].read) seenMailCount++;
        }
        gameState._notifSeenSnapshot.mail.count = Math.max(gameState._notifSeenSnapshot.mail.count, seenMailCount);
        autoSave();
    }
    var sender = mail.from || mail.sender || '未知发件人';
    var avatar = sender.charAt(0);
    var subject = mail.subject || '无主题';
    var time = mail.date || mail.time || '';
    var body = mail.body || mail.preview || mail.content || '';
    if (!body || body === '<p>无内容</p>') {
        body = mail.preview || '（无正文内容）';
    }
    // 使用sanitizeHtml净化邮件正文，防止XSS
    body = sanitizeHtml(body);
    var detailHtml =
        '<div style="display:flex;flex-direction:column;flex:1;background:var(--bg);overflow:hidden;">' +
        '<div class="mail-detail-nav"><div class="mail-detail-back" onclick="backToMailList()">←</div><div class="mail-detail-actions"><div class="mail-detail-action-btn" onclick="deleteMail(' + index + ')"></div></div></div>' +
        '<div class="mail-detail-scroll">' +
        '<div class="mail-detail-subject">' + escapeHtml(subject) + '</div>' +
        '<div class="mail-detail-meta"><div class="mail-detail-avatar">' + escapeHtml(avatar) +
        '</div><div class="mail-detail-info"><div class="mail-detail-from">' + escapeHtml(sender) +
        '</div><div class="mail-detail-to">发送至 我</div></div><div class="mail-detail-time">' + escapeHtml(
            time) + '</div></div>' +
        '<div class="mail-detail-body">' + body + '</div>' +
        '</div>' +
        '<div class="mail-detail-bottom"><div class="mail-detail-bottom-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>删除</div><div class="mail-detail-bottom-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>分享</div><div class="mail-detail-bottom-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>回复转发</div><div class="mail-detail-bottom-btn"><span>...</span>更多</div></div>' +
        '</div>';
    var content = document.getElementById('logSubContent');
    if (content) {
        content.innerHTML = detailHtml;
        var child = content.firstElementChild;
        if (child) {
            child.style.flex = '1';
            child.style.minHeight = '0';
        }
    }
}
function backToMailList() {
    openLogSubPage('mail');
}
function deleteMail(index) {
    var mailModules = getModulesByType('mail');
    if (mailModules.length > 0 && mailModules[0].items && Array.isArray(mailModules[0].items)) {
        if (index >= 0 && index < mailModules[0].items.length) {
            mailModules[0].items.splice(index, 1);
            autoSave();
            UI.toast('邮件已删除');
            backToMailList();
        }
    } else if (gameState._mails && Array.isArray(gameState._mails)) {
        if (index >= 0 && index < gameState._mails.length) {
            gameState._mails.splice(index, 1);
            autoSave();
            UI.toast('邮件已删除');
            backToMailList();
        }
    }
}
// 【P2清理】删除 buildModuleHTML（全项目零调用）
// 模块级：根据 gameState._worldModules 控制 logFeat-calendar / logFeat-author_note 元素显隐
// 【P0 修复】原定义嵌套在 renderLogPage 内部，外层 typeof 检查永远返回 'undefined'，
// 导致 renderWorldModules 三处调用永远不执行，日历/作者备注入口无法及时刷新。
function updateLogFeatureVisibility() {
    if (typeof gameState === 'undefined') return;
    var mods = gameState._worldModules || [];
    var hasCalendar = mods.some(function(m) { return m.type === 'calendar'; });
    var hasAuthorNote = mods.some(function(m) { return m.type === 'author_note'; });
    var calEl = document.getElementById('logFeat-calendar');
    if (calEl) calEl.style.display = hasCalendar ? '' : 'none';
    var anEl = document.getElementById('logFeat-author_note');
    if (anEl) anEl.style.display = hasAuthorNote ? '' : 'none';
}
function renderWorldModules(modules) {
    modules = modules || [];
    // 增量更新：保留旧模块。
    // 历史型模块（聊天/论坛/朋友圈/邮件/日记/成就）追加，不替换；状态型模块（排行/商店/文本/列表等）按类型替换。
    // 【全量修复-P2】方向反转：以 StateManager 为权威源读取，本地累积变更后写回
    var _existingMods = (typeof StateManager !== 'undefined' && StateManager.get)
        ? (StateManager.get('ui.worldModules') || [])
        : (Array.isArray(gameState._worldModules) ? gameState._worldModules : []);
    // 【修复BUG-007】forum 与 comments 同为论坛类型，都应累积；forum 也需结构标准化
    var accumulateTypes = { 'chat': true, 'comments': true, 'forum': true, 'moments': true, 'mail': true, 'diary': true, 'achievements': true, 'achievement': true };
    // 【修复BUG-007/015】标准化 AI 返回的模块结构，消除 prompt↔渲染器结构错配：
    //   - forum: AI 返回 items:[{author,content,replies}] → 拆为多个 comments 模块（模块级字段）
    //   - moments: AI 返回 items:[{author,content,time,likes,comments}] → 重命名为 posts（渲染器读 posts）
    modules = modules.map(function(mod) {
        if (!mod) return mod;
        // forum 标准化：拆为多个 comments 模块
        if (mod.type === 'forum' && Array.isArray(mod.items)) {
            var items = mod.items;
            var first = items[0] || {};
            var normalized = {
                type: 'comments',
                title: mod.title || first.title || first.author + '的帖子' || '论坛帖子',
                author: first.author || '匿名',
                main: first.content || first.main || '',
                content: first.content || first.main || '',
                comments: (first.replies || []).map(function(r) {
                    return { name: r.author || '匿名', text: r.content || '', replyTo: r.replyTo || '' };
                })
            };
            if (items.length > 1) {
                normalized._extras = items.slice(1).map(function(it) {
                    return {
                        type: 'comments',
                        title: it.title || (it.author || '匿名') + '的帖子',
                        author: it.author || '匿名',
                        main: it.content || '',
                        content: it.content || '',
                        comments: (it.replies || []).map(function(r) {
                            return { name: r.author || '匿名', text: r.content || '', replyTo: r.replyTo || '' };
                        })
                    };
                });
            }
            return normalized;
        }
        // 【修复BUG-015】moments 标准化：AI 按 prompt 返回 items，渲染器读 posts
        if (mod.type === 'moments' && Array.isArray(mod.items) && !mod.posts) {
            mod.posts = mod.items.map(function(it) {
                return {
                    author: (it && it.author) || '匿名',
                    text: (it && (it.text || it.content || it.main)) || '',
                    content: (it && it.content) || '',
                    time: (it && it.time) || '',
                    location: (it && it.location) || '',
                    images: (it && it.images) || [],
                    likes: Array.isArray(it && it.likes) ? it.likes : (typeof (it && it.likes) === 'number' ? [] : (it && it.likes || [])),
                    comments: Array.isArray(it && it.comments) ? it.comments.map(function(c) {
                        return { name: c.author || c.name || '匿名', text: c.content || c.text || '', replyTo: c.replyTo || '' };
                    }) : []
                };
            });
            // 保留 items 以备其他读取，但 posts 为主
            return mod;
        }
        return mod;
    }).filter(Boolean);
    // 展开 _extras 为独立模块
    var extraMods = [];
    modules.forEach(function(m) {
        if (m && m._extras) {
            extraMods = extraMods.concat(m._extras);
            delete m._extras;
        }
    });
    modules = modules.concat(extraMods);
    var replaceTypes = {};
    _existingMods.forEach(function(mod, idx) {
        if (mod && mod.type && !accumulateTypes[mod.type]) replaceTypes[mod.type] = idx;
    });
    modules.forEach(function(newMod) {
        if (!newMod || !newMod.type) return;
        if (!accumulateTypes[newMod.type] && replaceTypes.hasOwnProperty(newMod.type)) {
            // 替换同类型旧模块
            _existingMods[replaceTypes[newMod.type]] = newMod;
        } else {
            // 新增模块（历史型追加）
            _existingMods.push(newMod);
        }
    });
    // 【P1-3修复】限制每种模块类型数量，防止无限增长
    // 旧实现 filter 从头遍历保留前 N 条，丢弃末尾新追加的模块——方向错误！
    // 累积型模块（chat/comments/forum/moments/mail/diary/achievements）是后追加的最新内容，
    // 应保留最近的 N 条（即数组末尾），丢弃最旧的（数组头部）。
    // - 累积型上限 50（审查文档建议值，平衡历史完整性与 token 占用）
    // - 状态型上限 20（替换语义下通常只有 1-2 个，20 足够冗余）
    // 实现策略：倒序遍历保留最新 N 条，再正序还原（保持时间顺序）
    var _ACC_TYPE_LIMIT = 50;  // 累积型每类型上限
    var _STATE_TYPE_LIMIT = 20; // 状态型每类型上限
    var _typeLimits = {};
    _existingMods.forEach(function(m) {
        if (m && m.type) {
            _typeLimits[m.type] = accumulateTypes[m.type] ? _ACC_TYPE_LIMIT : _STATE_TYPE_LIMIT;
        }
    });
    var _keptByType = {};
    var _reversed = _existingMods.slice().reverse();  // 倒序：最新的在前
    var _filteredReversed = _reversed.filter(function(m) {
        if (!m || !m.type) return true;
        var limit = _typeLimits[m.type] || _STATE_TYPE_LIMIT;
        _keptByType[m.type] = (_keptByType[m.type] || 0) + 1;
        return _keptByType[m.type] <= limit;
    });
    _existingMods = _filteredReversed.reverse();  // 再正序还原（最旧的在前，最新的在后）
    // 【全量修复-P2】写入权威源 StateManager，_syncLegacyMirror 自动回写 gameState._worldModules
    if (typeof StateManager !== 'undefined' && StateManager.set) {
        StateManager.set('ui.worldModules', _existingMods, { silent: true });
    } else if (typeof gameState !== 'undefined') {
        gameState._worldModules = _existingMods;
    }
    // 【已移除】本地模板生成朋友圈/日记：现在由 AI 主动在 world 中提供 moments/diary 模块
    // 自动将AI返回的world模块解析到世界观设定中（仅首次或worldNotes为空时）
    if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.longTermMemory.worldNotes.length === 0 && modules.length > 0) {
        _autoExtractWorldNotes(modules);
    }
    // 【修复】世界页是通过 renderWorldPage() 渲染到 logSubContent 里的，
    // 不存在独立的 logWorldContent 容器。检测用户是否正停留在世界子页面，
    // 如果是则用最新数据重新渲染；否则只更新 gameState，下次进入世界页时自动反映。
    var subContainer = document.getElementById('logSubContainer');
    var subTitleEl = document.getElementById('logSubTitle');
    var subContentEl = document.getElementById('logSubContent');
    var isWorldPageActive = subContainer && subContainer.style.display !== 'none'
        && subContentEl && subTitleEl && subTitleEl.textContent === '世界信息';
    if (!isWorldPageActive) {
        if (typeof updateLogFeatureVisibility === 'function') updateLogFeatureVisibility();
        return;
    }
    if (gameState._worldModules.length === 0) {
        subContentEl.innerHTML =
            '<div class="empty-state"><div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div><p>暂无世界信息</p></div>';
        if (typeof updateLogFeatureVisibility === 'function') updateLogFeatureVisibility();
        return;
    }
    subContentEl.innerHTML = renderWorldPage();
    if (typeof updateLogFeatureVisibility === 'function') updateLogFeatureVisibility();
}

// 自动将AI返回的world模块解析到世界观设定页面
function _autoExtractWorldNotes(modules) {
    if (!modules || !Array.isArray(modules) || modules.length === 0) return;
    if (typeof EnhancedMemory === 'undefined') return;
    
    var categoryMap = {
        'text': '设定',
        'list': '规则',
        'ranking': '设定',
        'key_value': '规则',
        'cards': '设定',
        'comments': '设定'
    };
    
    modules.forEach(function(mod) {
        if (!mod || !mod.title) return;
        var content = '';
        
        if (mod.type === 'list' && Array.isArray(mod.items)) {
            content = mod.items.join('\n');
        } else if (mod.type === 'ranking' && Array.isArray(mod.items)) {
            content = mod.items.map(function(item, idx) {
                return (idx + 1) + '. ' + item;
            }).join('\n');
        } else if (mod.type === 'key_value' && Array.isArray(mod.items)) {
            content = mod.items.map(function(kv) {
                return (kv.key || '') + ': ' + (kv.value || '');
            }).join('\n');
        } else if (mod.type === 'cards' && Array.isArray(mod.items)) {
            content = mod.items.map(function(card) {
                return '【' + (card.title || '') + '】' + (card.content || '');
            }).join('\n');
        } else if (mod.type === 'comments') {
            content = '主帖: ' + (mod.main || '') + '\n';
            if (Array.isArray(mod.comments)) {
                content += mod.comments.map(function(c) {
                    return '- ' + (c.name || '') + ': ' + (c.text || '');
                }).join('\n');
            }
        } else {
            // 【修复X17】mod.content 可能是 undefined/数组/对象（非字符串），不能直接用 || ''
            // 因为数组是 truthy，[] || '' 会得到 [] 而非 ''，后续 .trim() 抛 TypeError
            content = (typeof mod.content === 'string') ? mod.content : '';
        }

        // 【修复X17】双重保险：确保 content 是字符串再 trim
        if (typeof content === 'string' && content.trim()) {
            EnhancedMemory.longTermMemory.worldNotes.push({
                title: mod.title,
                category: categoryMap[mod.type] || '设定',
                content: content.trim(),
                timestamp: Date.now(),
                source: 'auto' // 标记为自动提取
            });
        }
    });
    
    EnhancedMemory.saveToStorage();
    console.log('[世界观] 已自动提取 ' + modules.length + ' 条世界设定到世界页面');
}

// 【P2清理】删除 _extractKeywords（全项目零调用）
// 统一获取剧情列表的辅助函数（storyHistory 已合并到 conversationHistory）
// 【修复BUG-03】历史消息可能是 JSON 字符串（_slimAssistantMessage 精简格式 {"title":"...","story":"..."}）
// 旧实现直接返回 m.content，回顾页显示为原始 JSON 字符串，玩家无法阅读
// 现解析 JSON 提取 title/story，并标记思考内容为隐藏（与 BUG-04 拦截呼应）
function getStoryList() {
    var list = (gameState.conversationHistory || [])
        .filter(function(m) { return m.role === 'assistant'; })
        .map(function(m, idx) {
            var raw = m.content || '';
            var title = '';
            var story = raw;
            // 1. 尝试解析 JSON 格式的历史消息
            if (raw && typeof raw === 'string' && raw.trim().charAt(0) === '{') {
                try {
                    var parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === 'object') {
                        title = parsed.title || parsed.sceneTitle || parsed.scene || '';
                        story = parsed.story || parsed.storyText || parsed.content || '';
                    }
                } catch (e) { /* 非 JSON 或解析失败，保留原文 */ }
            }
            // 2. 检测 AI 思考内容（BUG-04 残留 / 历史污染数据）
            if (_isThinkingContent(story)) {
                story = '【本回合 AI 回复异常，内容已隐藏】';
                title = title || '— 解析失败 —';
            }
            // 3. 兜底：如果 story 为空但 raw 有内容（如纯文本模式），用 raw
            if (!story && raw) story = raw;
            return { text: story || '', title: title || '', time: m.time || '', index: idx };
        });
    return list;
}

// 【已禁用】本地模板生成的"假"朋友圈/日记已下线，全部由 API 动态生成。
// 保留空函数（仅清空旧数据），避免残留的 _moments / _npcDiaries 污染新内容。
// 朋友圈：由 AI 返回的 world[].type === 'moments' 提供（renderMomentsPage 读取 _worldModules）
// 日记：由 AI 返回的 world[].type === 'diary' 提供（renderDiaryPage 读取 _worldModules）
// ========================================
// 预设装饰组件管理器 (PresetAppManager)
// 自动解析AI输出中的XML装饰标签，将其提取为日志页面中的动态app
// 支持的标签：<gossip> <snow> <角色手机> <echo> <title> <branches> <ice>
//           <通用状态> <古风状态> <meow_FM> <giggle> <danmu> <live>
// ========================================
var PresetAppManager = (function() {
    // 存储解析出的装饰组件数据
    var _apps = {};
    // 组件定义：标签名 -> {name, icon, color}
    // 注意：文生图相关标签已移除，不解析不显示，节省token
    var _appDefs = {
        'gossip':     { name: '文末吐槽', icon: '', color: '#FF6B6B' },
        'snow':       { name: '小剧场',   icon: '', color: '#A78BFA' },
        '角色手机':    { name: '偷看手机', icon: '', color: '#34D399' },
        '通用状态':    { name: '角色状态', icon: '', color: '#60A5FA' },
        '古风状态':    { name: '古风状态', icon: '', color: '#D4A574' },
        'echo':       { name: 'ta的物品', icon: '', color: '#F472B6' },
        'title':      { name: '章节标题', icon: '', color: '#FBBF24' },
        'branches':   { name: '剧情分支', icon: '', color: '#818CF8' },
        'ice':        { name: '文中视觉', icon: '', color: '#2DD4BF' },
        'meow_fm':    { name: '月之华章', icon: '', color: '#C084FC' },
        'giggle':     { name: '角色心声', icon: '', color: '#FB923C' },
        'danmu':      { name: '弹幕',     icon: '', color: '#94A3B8' },
        'live':       { name: '直播',     icon: '', color: '#F43F5E' },
        'tableEdit':  { name: '表格',     icon: '', color: '#6EE7B7' }
        // 文生图已移除：不解析、不显示、节省token
    };

    // 从AI回复文本中解析所有装饰XML标签
    // giggle标签已在剧情中渲染为心声触发器，不需要在日志页面重复显示
    var _excludeTags = ['giggle'];
    function parseFromText(text) {
        if (!text) return;
        var newApps = {};

        // 遍历所有已定义的标签
        Object.keys(_appDefs).forEach(function(tag) {
            // 跳过排除的标签
            if (_excludeTags.indexOf(tag) !== -1) return;
            // 处理标签名中的特殊字符
            var escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            var regex = new RegExp('<' + escapedTag + '[\\s>][\\s\\S]*?<\\/' + escapedTag + '>', 'gi');
            var matches = text.match(regex);
            if (matches && matches.length > 0) {
                // 合并多个同名标签的内容
                newApps[tag] = matches.map(function(m) {
                    return m;
                }).join('\n');
            }
        });

        // 特殊处理：<details> 标签（小剧场的简约文字模式）
        var detailsRegex = /<details[\s>][\s\S]*?<\/details>/gi;
        var detailsMatches = text.match(detailsRegex);
        if (detailsMatches && detailsMatches.length > 0) {
            // 检查是否包含小剧场特征
            var hasSnowTag = !!newApps['snow'];
            if (!hasSnowTag) {
                var snowContent = detailsMatches.map(function(m) { return m; }).join('\n');
                // 检查是否包含小剧场关键词
                if (snowContent.indexOf('ccd') !== -1 || snowContent.indexOf('创意标题') !== -1 ||
                    snowContent.indexOf('小剧场') !== -1 || snowContent.indexOf('SYSTEM_LOG') !== -1) {
                    newApps['snow'] = snowContent;
                }
            }
        }

        // 特殊处理：<style> 标签（文中可视化 ice）
        var styleRegex = /<style[\s>][\s\S]*?<\/style>\s*<div[\s>][\s\S]*?<\/div>/gi;
        var styleMatches = text.match(styleRegex);
        if (styleMatches && !newApps['ice']) {
            newApps['ice'] = styleMatches.join('\n');
        }

        // 更新存储
        var changed = false;
        Object.keys(newApps).forEach(function(tag) {
            if (newApps[tag] !== _apps[tag]) {
                _apps[tag] = newApps[tag];
                changed = true;
            }
        });

        // 清除不再存在的app（可选：保留上一次的）

        if (changed) {
            _saveToState();
            console.log('[PresetAppManager] 解析到装饰组件:', Object.keys(newApps));
        }
    }

    // 【性能优化】预编译 stripDecorTags 中所有正则，合并同类标签为单个正则
    // 将所有 XML 标签对合并为一个正则，避免 20+ 次独立的 replace 调用
    var _decorTagNames = ['gossip_rules', 'snow_rules', '激活群组', 'NSFW设计',
        'tableThink', 'tableEdit', 'horae', 'horaeevent', 'image', 'imgthink', '文生图', 'details'];
    var _decorTagsRegex = new RegExp(
        '<(?:' + _decorTagNames.join('|').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        ')[\\s>][\\s\\S]*?<\\/(?:' + _decorTagNames.join('|').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')>', 'gi');
    var _reStyleDiv = /<style[\s>][\s\S]*?<\/style>\s*<div[\s>][\s\S]*?<\/div>/gi;
    var _reComment = /<!--[\s\S]*?-->/g;
    var _rePollinations = /https?:\/\/gen\.pollinations\.ai\/image\/[^\s<>"']+/gi;
    var _reImageHash = /image###[\s\S]*?###/gi;
    var _reImgTag = /<img[^>]*>/gi;
    var _reMultiNewline = /\n{3,}/g;

    // 从剧情文本中移除装饰XML标签（不显示在剧情区域）
    function stripDecorTags(text) {
        if (!text) return text;
        var result = text;

        // 移除所有已定义的装饰标签（排除giggle，因为心声需要在剧情中显示）
        // 【性能优化】动态标签也用预编译正则，避免 forEach + new RegExp
        Object.keys(_appDefs).forEach(function(tag) {
            if (_excludeTags.indexOf(tag) !== -1) return;
            var escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            var regex = new RegExp('<' + escapedTag + '[\\s>][\\s\\S]*?<\\/' + escapedTag + '>', 'gi');
            result = result.replace(regex, '');
        });

        // 移除 <style>...</style><div>...</div> 块（ice组件）
        _reStyleDiv.lastIndex = 0;
        result = result.replace(_reStyleDiv, '');

        // 【性能优化】合并所有固定标签名为单个正则匹配
        _decorTagsRegex.lastIndex = 0;
        result = result.replace(_decorTagsRegex, '');

        // 移除导演手记注释 <!-- ... -->
        _reComment.lastIndex = 0;
        result = result.replace(_reComment, '');

        // 移除 pollinations.ai 图片链接
        _rePollinations.lastIndex = 0;
        result = result.replace(_rePollinations, '');
        // 移除 image###...### 格式
        _reImageHash.lastIndex = 0;
        result = result.replace(_reImageHash, '');
        // 移除 <img> 标签（AI可能生成的图片标签）
        _reImgTag.lastIndex = 0;
        result = result.replace(_reImgTag, '');

        // 移除多余的空行（超过2个连续换行压缩为2个）
        _reMultiNewline.lastIndex = 0;
        result = result.replace(_reMultiNewline, '\n\n');

        return result.trim();
    }

    // 获取当前所有动态app
    function getApps() {
        var list = [];
        Object.keys(_apps).forEach(function(tag) {
            var def = _appDefs[tag];
            if (def && _apps[tag]) {
                list.push({
                    tag: tag,
                    name: def.name,
                    icon: def.icon,
                    color: def.color,
                    content: _apps[tag],
                    hasNew: _apps[tag]._isNew || false
                });
            }
        });
        return list;
    }

    // 获取指定app的内容
    function getAppContent(tag) {
        return _apps[tag] || null;
    }

    // 保存到 gameState
    function _saveToState() {
        if (gameState) {
            gameState._presetApps = {};
            Object.keys(_apps).forEach(function(tag) {
                gameState._presetApps[tag] = _apps[tag];
            });
        }
    }

    // 从 gameState 恢复
    function loadFromState() {
        if (gameState && gameState._presetApps) {
            _apps = {};
            Object.keys(gameState._presetApps).forEach(function(tag) {
                _apps[tag] = gameState._presetApps[tag];
            });
        }
    }

    // 清除所有动态app
    function clear() {
        _apps = {};
        if (gameState) gameState._presetApps = {};
    }

    return {
        parseFromText: parseFromText,
        stripDecorTags: stripDecorTags,
        getApps: getApps,
        getAppContent: getAppContent,
        loadFromState: loadFromState,
        clear: clear,
        _appDefs: _appDefs
    };
})();

// --- 日志页面渲染 ---
function renderLogPage() {
    // 【性能优化】日志页数据未变时跳过整页重绘（点击导航栏频繁触发）
    try {
        var _presetApps = (gameState && gameState._presetApps) || {};
        var _wMods = (gameState && gameState._worldModules) || [];
        var _dateKey = (new Date()).getDate();
        var _key = Object.keys(_presetApps).length + '|' + _wMods.length + '|' + _dateKey;
        if (typeof RenderCache !== 'undefined' && RenderCache.same('renderLogPage', _key)) return;
        if (typeof RenderCache !== 'undefined') RenderCache.mark('renderLogPage', _key);
    } catch (e) { /* 缓存失败不阻塞渲染 */ }
    var now = new Date();
    var dateEl = document.getElementById('logTopDate');
    if (dateEl) dateEl.textContent = String(now.getMonth() + 1).padStart(2, '0') + '/' + String(now
    .getDate()).padStart(2, '0');

    // 确保显示主内容区域
    var logMainContent = document.getElementById('logMainContent');
    var logSubContainer = document.getElementById('logSubContainer');
    if (logMainContent) logMainContent.style.display = 'block';
    if (logSubContainer) logSubContainer.style.display = 'none';

    // 渲染预设动态app入口
    _renderPresetApps();

    updateLogFeatureVisibility();

    // 近期记忆已迁移到记忆管理页面的"近期记忆"标签页
    // 日志页面不再显示近期记忆摘要

    // 事件委托
    var logFeatureGrid = document.getElementById('logFeatureGrid');
    if (logFeatureGrid && !logFeatureGrid._hasDelegatedClick) {
        logFeatureGrid.addEventListener('click', function(e) {
            var item = e.target.closest('[data-log]');
            if (item && item.dataset.log) {
                e.preventDefault();
                e.stopPropagation();
                console.log('[日志页面] 点击:', item.dataset.log, item.id);
                openLogSubPage(item.dataset.log);
            }
        });
        logFeatureGrid._hasDelegatedClick = true;
    }

    // 子页面返回按钮
    var logSubBackBtn = document.getElementById('logSubBackBtn');
    if (logSubBackBtn && !logSubBackBtn._hasClick) {
        logSubBackBtn.addEventListener('click', function() {
            closeLogSubPage();
        });
        logSubBackBtn._hasClick = true;
    }

    renderNavBar('logNav', [{
            page: 'storyPage',
            icon: 'icon-book',
            label: '剧情'
        },
        {
            page: 'playerPage',
            icon: 'icon-user',
            label: '个人'
        },
        {
            page: 'npcPage',
            icon: 'icon-users',
            label: '人际'
        },
        {
            page: 'logPage',
            icon: 'icon-grid',
            label: '日志'
        },
        {
            page: 'memoryPage',
            icon: 'icon-sparkles',
            label: '记忆'
        },
        {
            page: 'recapPage',
            icon: 'icon-clock',
            label: '回顾'
        }
    ], 3);
}
// 日志子页面渲染函数映射
// 原代码在这里引用了 renderChatPage 等函数，但它们在下一个 script 块中才定义
// 改为延迟初始化：在第一次使用时才构建映射
var _logPageRenderers = null;
function getLogPageRenderers() {
    if (_logPageRenderers) return _logPageRenderers;
    _logPageRenderers = {
        chat: renderChatPage,
        quests: renderQuestsPage,
        achieve: renderAchievePage,
        world: renderWorldPage,
        moments: renderMomentsPage,
        forum: renderForumPage,
        rank: renderRankPage,
        items: renderItemsPage,
        diary: renderDiaryPage,
        mail: renderMailPage,
        shop: renderShopPage,
        // 【小剧场融合】新增渲染器
        calendar: renderCalendarPage,
        author_note: renderAuthorNotePage
    };
    return _logPageRenderers;
}

// ========================================
// 预设动态app渲染
// ========================================

// 渲染预设动态app入口网格
function _renderPresetApps() {
    var container = document.getElementById('presetAppGrid');
    if (!container) return;

    // 恢复状态
    if (typeof PresetAppManager !== 'undefined') {
        PresetAppManager.loadFromState();
    }

    var apps = (typeof PresetAppManager !== 'undefined') ? PresetAppManager.getApps() : [];
    if (apps.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'grid';
    container.innerHTML = apps.map(function(app) {
        return '<div class="preset-item preset-app-dynamic" data-preset-app="' + app.tag + '" ' +
            'role="button" tabindex="0" style="cursor:pointer;">' +
            '<div class="preset-icon-box" style="background:' + app.color + '15;border:1px solid ' + app.color + '30;">' +
            '<span style="font-size:24px;">' + escapeHtml(app.icon) + '</span></div>' +
            '<div class="preset-name" style="font-size:11px;color:' + app.color + ';">' + escapeHtml(app.name) + '</div>' +
            '</div>';
    }).join('');

    // 绑定事件
    if (!container._hasDelegatedClick) {
        container.addEventListener('click', function(e) {
            var item = e.target.closest('[data-preset-app]');
            if (item && item.dataset.presetApp) {
                e.preventDefault();
                e.stopPropagation();
                _openPresetApp(item.dataset.presetApp);
            }
        });
        container._hasDelegatedClick = true;
    }
}

// 打开预设动态app
function _openPresetApp(tag) {
    var content = (typeof PresetAppManager !== 'undefined') ? PresetAppManager.getAppContent(tag) : null;
    if (!content) {
        UI.toast('暂无内容');
        return;
    }

    var def = (typeof PresetAppManager !== 'undefined') ? PresetAppManager._appDefs[tag] : null;
    var title = def ? def.name : tag;

    var logSubTitle = document.getElementById('logSubTitle');
    if (logSubTitle) logSubTitle.textContent = title;
    var subContainer = document.getElementById('logSubContainer');
    if (!subContainer) return;
    // 【修复】.hidden class 用了 display:none !important，会压住 style.display。
    // 必须移除 class 才能让 inline style 生效。
    subContainer.classList.remove('hidden');
    subContainer.style.display = 'block';
    subContainer.style.animation = 'slideInRight .3s ease';
    var logMainContent = document.getElementById('logMainContent');
    if (logMainContent) logMainContent.style.display = 'none';

    var contentEl = document.getElementById('logSubContent');
    if (!contentEl) return;

    // 根据标签类型选择渲染方式
    var html = '';
    if (tag === 'ice' || tag === 'snow') {
        // ice 和 snow 可能包含 HTML/CSS，需要安全渲染
        html = _renderPresetAppHTML(content, tag);
    } else {
        // 其他标签：将XML内容转换为可读的HTML
        html = _renderPresetAppContent(content, tag);
    }

    contentEl.style.padding = '0';
    contentEl.style.display = 'flex';
    contentEl.style.flexDirection = 'column';
    contentEl.innerHTML = html;

    // 让子元素填满容器
    var child = contentEl.firstElementChild;
    if (child) {
        child.style.flex = '1';
        child.style.minHeight = '0';
    }
}

// 渲染包含HTML/CSS的预设app（如ice、snow中的交互小剧场）
function _renderPresetAppHTML(content, tag) {
    // 安全处理：使用 sandbox iframe 隔离 AI 生成的内容
    var wrapperClass = 'preset-app-content';
    if (tag === 'snow') wrapperClass += ' preset-app-snow';
    if (tag === 'ice') wrapperClass += ' preset-app-ice';

    return '<iframe sandbox="allow-scripts" srcdoc="' + content.replace(/"/g, '&quot;') + '" style="width:100%;border:none;min-height:200px;border-radius:8px;"></iframe>';
}

// 渲染纯文本/XML预设app内容
function _renderPresetAppContent(content, tag) {
    var def = (typeof PresetAppManager !== 'undefined') ? PresetAppManager._appDefs[tag] : null;
    var color = def ? def.color : '#666';
    var icon = def ? def.icon : '';

    // 将XML标签内容转换为可读HTML
    var displayContent = content
        // 移除外层XML标签
        .replace(/^<[^>]+>/, '')
        .replace(/<\/[^>]+>$/, '')
        // 保留内部XML子标签作为格式化
        .replace(/<([^/][^>]*)>/g, function(m, tagName) {
            // 常见子标签转换
            var name = tagName.split(/\s/)[0].toLowerCase();
            if (name === 'status' || name === 'sns' || name === 'memo' || name === 'wallet' ||
                name === 'zone' || name === 'browse' || name === 'calendar' || name === 'music' ||
                name === 'char' || name === 'char1' || name === 'char2' || name === 'char3') {
                return '<div class="preset-app-section"><p class="preset-app-section-title" style="color:' + color + ';font-weight:600;border-bottom:1px solid ' + color + '30;padding-bottom:4px;margin-bottom:8px;">' + tagName.split(/\s/)[0] + '</p>';
            }
            return '<span style="color:' + color + ';font-weight:500;">[' + tagName.split(/\s/)[0] + ']</span>';
        })
        .replace(/<\/([^>]+)>/g, function(m, tagName) {
            var name = tagName.split(/\s/)[0].toLowerCase();
            if (name === 'status' || name === 'sns' || name === 'memo' || name === 'wallet' ||
                name === 'zone' || name === 'browse' || name === 'calendar' || name === 'music' ||
                name === 'char' || name === 'char1' || name === 'char2' || name === 'char3') {
                return '</div>';
            }
            return '';
        })
        // 处理 <s> 删除线
        .replace(/<s>([\s\S]*?)<\/s>/g, '<del style="color:var(--text-secondary);">$1</del>')
        // 处理换行
        .replace(/\n/g, '<br>');

    return '<div class="preset-app-content preset-app-text" style="padding:16px;">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">' +
        '<span style="font-size:20px;">' + icon + '</span>' +
        '<span style="font-size:15px;font-weight:600;color:' + color + ';">' + (def ? def.name : tag) + '</span>' +
        '</div>' +
        '<div style="font-size:13px;line-height:1.8;color:var(--text);word-break:break-word;">' +
        displayContent +
        '</div></div>';
}
// 关闭日志子页面（返回日志主页面）
function closeLogSubPage() {
    var subContainer = document.getElementById('logSubContainer');
    if (!subContainer || subContainer.style.display === 'none') return;
    subContainer.style.animation = 'slideOutLeft .2s ease forwards';
    TimerManager.setTimeout('logSubBack', function() {
        subContainer.style.display = 'none';
        subContainer.classList.add('hidden');
        subContainer.style.animation = 'slideInRight .3s ease';
        var logMainContent = document.getElementById('logMainContent');
        if (logMainContent) logMainContent.style.display = 'block';
    }, 200);
}

function openLogSubPage(type) {
    var titles = {
        chat: '聊天',
        forum: '论坛',
        rank: '排行榜',
        items: '物品',
        quests: '任务',
        shop: '商店',
        moments: '朋友圈',
        achieve: '成就',
        diary: '日记',
        mail: '邮箱',
        world: '世界信息'
    };
    var title = titles[type] || type;
    var logSubTitle = document.getElementById('logSubTitle');
    if (logSubTitle) logSubTitle.textContent = title;
    var subContainer = document.getElementById('logSubContainer');
    if (!subContainer) return;
    // 【修复】.hidden class 用了 display:none !important，会压住 style.display。
    // 必须移除 class 才能让 inline style 生效。
    subContainer.classList.remove('hidden');
    subContainer.style.display = 'block';
    subContainer.style.animation = 'slideInRight .3s ease';
    var logMainContent = document.getElementById('logMainContent');
    if (logMainContent) logMainContent.style.display = 'none';

    var content = document.getElementById('logSubContent');
    if (!content) return;

    var html = '';
    var renderer = getLogPageRenderers()[type];

    if (renderer) {
        html = renderer();
    } else {
        html = renderDefaultPage(type);
    }

    // 应用页面样式
    _applyLogPageStyle(content, type, html);
}
// 应用日志页面样式
function _applyLogPageStyle(content, type, html) {
    var isFullScreen = ['chat', 'forum', 'moments', 'rank', 'items', 'diary', 'mail', 'shop', 'quests',
        'achieve'
    ].indexOf(type) >= 0;

    if (isFullScreen) {
        content.style.padding = '0';
        content.style.display = 'flex';
        content.style.flexDirection = 'column';
    } else {
        content.style.padding = '16px';
        content.style.display = 'block';
    }

    // 【修复BUG-02】renderItemsPage 在缓存命中时返回 undefined，应跳过写入而非覆盖为 "undefined"
    if (html !== null && html !== undefined) {
        if (html instanceof HTMLElement) {
            content.innerHTML = '';
            content.appendChild(html);
        } else {
            content.innerHTML = html;
        }
    } else if (type === 'quests') {
        if (typeof QuestSystem !== 'undefined' && QuestSystem.renderQuestPage) {
            QuestSystem.renderQuestPage(content);
        }
    }

    // 修复：聊天页面用事件委托，data-chat-name → openNpcChat，避免内联 onclick 的 XSS
    if (type === 'chat' && !content._chatClickBound) {
        content._chatClickBound = true;
        content.addEventListener('click', function(e) {
            var item = e.target.closest('[data-chat-name]');
            if (item) {
                var n = item.getAttribute('data-chat-name');
                if (n && typeof openNpcChat === 'function') {
                    openNpcChat(n);
                }
            }
        });
    }
    if (type === 'achieve') {
        if (typeof AchievementSystem !== 'undefined' && AchievementSystem.renderAchievePage) {
            AchievementSystem.renderAchievePage(content);
        }
    }

    // 全屏页面需要让子元素填满容器
    if (isFullScreen) {
        var child = content.firstElementChild;
        if (child) {
            child.style.flex = '1';
            child.style.minHeight = '0';
        }
    }
}
// 渲染聊天页面
function renderChatPage() {
    // 【改造】聊天来源改为两路合并：
    //   1. AI 在 world 模块返回的 type='chat' 条目（自动生成，不依赖玩家发起）
    //   2. 玩家手动发起的 _chattedNpcs + _chatLogs（保留兼容）
    var aiChatMap = {};  // name -> {lastMsg, time, unread, logs}
    var worldMods = gameState._worldModules || [];
    worldMods.forEach(function(mod) {
        if (!mod || mod.type !== 'chat') return;
        // 支持两种结构：{npc, content, time} 单条 或 {items:[{npc,content,time}]} 列表
        var items = Array.isArray(mod.items) ? mod.items : [mod];
        items.forEach(function(it) {
            if (!it || !it.npc) return;
            var npcName = String(it.npc).trim();
            if (!npcName) return;
            if (!aiChatMap[npcName]) aiChatMap[npcName] = { logs: [], lastMsg: '', time: '', unread: 0 };
            var text = String(it.content || it.text || '').trim();
            if (!text) return;
            var logEntry = { role: 'npc', from: 'npc', text: text, time: it.time || '' };
            aiChatMap[npcName].logs.push(logEntry);
            aiChatMap[npcName].lastMsg = text;
            aiChatMap[npcName].time = it.time || '';
        });
    });

    var chattedNpcs = gameState._chattedNpcs || {};
    // 合并：AI 生成的 NPC + 玩家手动聊过的 NPC
    var allNames = Object.keys(aiChatMap);
    Object.keys(chattedNpcs).forEach(function(name) {
        if (chattedNpcs[name] && gameState.allCharacters[name] && allNames.indexOf(name) === -1) {
            allNames.push(name);
        }
    });
    // 过滤掉不存在于角色列表的（除非是 AI 生成的）
    var chattedNames = allNames.filter(function(name) {
        return aiChatMap[name] || (chattedNpcs[name] && gameState.allCharacters[name]);
    });

    // 【性能】渲染缓存——切回来时数据没变就不重渲染
    var _seen = gameState._notifSeenSnapshot && gameState._notifSeenSnapshot.chat || {};
    var _seenSig = Object.keys(_seen).sort().map(function(k) { return k + ':' + _seen[k]; }).join(',');
    var _totalLogs = 0;
    var _logs = gameState._chatLogs || {};
    for (var _lk in _logs) _totalLogs += _logs[_lk].length;
    var _aiTotal = 0;
    Object.keys(aiChatMap).forEach(function(k) { _aiTotal += aiChatMap[k].logs.length; });
    var _key = chattedNames.length + '|' + _totalLogs + '|' + _aiTotal + '|' + _seenSig;
    if (shouldSkipPageRender('renderChatPage', _key)) return;

    if (chattedNames.length === 0) {
        return '<div class="chat-list-page">' +
            '<div class="empty-state"><div class="empty-state-icon"></div><p>暂无消息</p><p style="font-size:13px;margin-top:8px;color:var(--text-secondary);">NPC 会在剧情推进中主动发来消息</p></div>' +
            '</div>';
    }

    var colors = ['#ff4d4f', '#07c160', '#1890ff', '#722ed1', '#fa8c16', '#eb2f96', '#13c2c2', '#52c41a'];
    var seen = gameState._notifSeenSnapshot && gameState._notifSeenSnapshot.chat || {};
    var html = '<div class="chat-list-page">' +
        '<div class="chat-list">' +
        chattedNames.map(function(name) {
            var c = gameState.allCharacters[name] || {};
            var aiChat = aiChatMap[name];
            var now = new Date();
            var h = now.getHours();
            var m = String(now.getMinutes()).padStart(2, '0');
            var timeStr = (h < 12 ? '上午' : '下午') + (h > 12 ? h - 12 : h) + ':' + m;
            var colorIdx = name.charCodeAt(0) % colors.length;
            var avatarColor = colors[colorIdx];
            var lastMsg = '点击开始对话';
            var unreadNpc = 0;
            // 优先用 AI 生成的最新消息
            if (aiChat && aiChat.logs.length > 0) {
                lastMsg = aiChat.lastMsg;
                if (lastMsg.length > 20) lastMsg = truncateByChars(lastMsg, 20, '...');
                if (aiChat.time) timeStr = aiChat.time;
            }
            // 合并玩家手动聊天记录
            if (gameState._chatLogs && gameState._chatLogs[name]) {
                var logs = gameState._chatLogs[name];
                if (logs.length > 0) {
                    var last = logs[logs.length - 1];
                    var lastText = last.text || '';
                    // 手动聊天记录更新则覆盖 AI 的预览
                    if (!aiChat || logs[logs.length - 1]._ts > (aiChat._ts || 0)) {
                        lastMsg = lastText.length > 20 ? truncateByChars(lastText, 20, '...') : lastText;
                    }
                }
                var npcSent = logs.filter(function(m) {
                    if (!m) return false;
                    if (m.role === 'player' || m.from === 'player' || m.from === 'me') return false;
                    return (m.text || '').trim();
                });
                var seenCount = seen[name] || 0;
                unreadNpc = Math.max(0, npcSent.length - seenCount);
            }
            // AI 生成的未读消息也算
            if (aiChat) {
                var aiSeenCount = seen[name] || 0;
                var aiUnread = Math.max(0, aiChat.logs.length - aiSeenCount);
                unreadNpc = Math.max(unreadNpc, aiUnread);
            }
            var unreadBadge = unreadNpc > 0 ?
                '<span style="display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 6px;background:#ff3b30;color:#fff;border-radius:9px;font-size:11px;font-weight:600;margin-left:6px;">' + (unreadNpc > 99 ? '99+' : unreadNpc) + '</span>' : '';
            var boldStyle = unreadNpc > 0 ? 'font-weight:600;color:var(--text);' : '';
            // 修复：改用 data-name + 事件委托，避免拼接 onclick 字符串带来的 XSS 风险
            var safeName = String(name || '').replace(/[\r\n\t\v\f\0]/g, ' ').slice(0, 100);
            var firstChar = safeName.charAt(0) || '?';
            return '<div class="chat-item" role="button" tabindex="0" data-chat-name="' + escapeHtml(safeName) + '">' +
                '<div class="chat-avatar" style="background:' + avatarColor + ';">' + escapeHtml(firstChar) +
                '</div>' +
                '<div class="chat-content"><div class="chat-row"><div class="chat-name" style="' + boldStyle + '">' + escapeHtml(safeName) + unreadBadge +
                '</div><div class="chat-time">' + escapeHtml(timeStr) + '</div></div><div class="chat-preview" style="' + boldStyle + '">' +
                escapeHtml(lastMsg) + '</div></div></div>';
        }).join('') +
        '</div></div>';
    return html;
}
function renderQuestsPage() {
    return null;
}
function renderAchievePage() {
    return null;
}
// 渲染世界信息页面
function renderWorldPage() {
    var modules = gameState._worldModules || [];
    // 【性能】渲染缓存
    var _lastTitle = modules.length > 0 ? (modules[modules.length-1].title || '') : '';
    var _lastMain = modules.length > 0 ? String(modules[modules.length-1].main || modules[modules.length-1].content || '').slice(0, 40) : '';
    var _key = modules.length + '|' + _lastTitle + '|' + _lastMain;
    if (shouldSkipPageRender('renderWorldPage', _key)) return;
    if (modules.length === 0) {
        return '<div class="empty-state"><div class="empty-state-icon">世</div><p>暂无世界信息</p></div>';
    }

    return modules.map(function(mod) {
        var inner = '';
        switch (mod.type) {
            case 'text':
                inner = '<div style="font-size:14px;line-height:1.7;">' + parseMarkdown(escapeHtml(mod
                    .content || '')) + '</div>';
                break;
            case 'list':
                inner = (mod.items || []).map(function(it) {
                    return '<div style="padding:6px 0;font-size:14px;">▸ ' + escapeHtml(it) + '</div>';
                }).join('');
                break;
            case 'ranking':
                inner = (mod.items || []).map(function(it, i) {
                    return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;"><span style="font-weight:600;color:' +
                        (i < 3 ? 'var(--text)' : 'var(--text-tertiary)') + ';">' + (i + 1) +
                        '</span><span style="font-size:14px;">' + escapeHtml(it) + '</span></div>';
                }).join('');
                break;
            case 'key_value':
                inner = (mod.items || []).map(function(kv) {
                    return '<div class="player-field"><span class="player-field-label">' +
                        escapeHtml(kv.key) + '</span><span class="player-field-value">' + escapeHtml(kv.value) +
                        '</span></div>';
                }).join('');
                break;
            case 'cards':
                inner = (mod.items || []).map(function(c) {
                    return '<div class="pearl-card" style="padding:12px;margin-bottom:8px;"><div style="font-weight:500;">' +
                        escapeHtml(c.icon || '') + ' ' + escapeHtml(c.title || '') +
                        '</div><div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">' +
                        escapeHtml(c.content || '') + '</div></div>';
                }).join('');
                break;
            case 'comments':
                inner = '<div style="font-size:14px;margin-bottom:8px;">' + escapeHtml(mod.main || '') +
                    '</div>' + (mod.comments || []).map(function(cm) {
                        return '<div style="padding:8px 0;border-top:1px solid var(--border);font-size:13px;"><strong>' +
                            escapeHtml(cm.name) + ':</strong> ' + escapeHtml(cm.text) + '</div>';
                    }).join('');
                break;
            case 'moments':
                var mPosts2 = [];
                if (mod.posts) { mPosts2 = mod.posts.slice(0, 3); }
                else if (mod.moments && Array.isArray(mod.moments)) { mPosts2 = mod.moments.slice(0, 3); }
                if (mPosts2.length > 0) {
                    inner = mPosts2.map(function(p) {
                        var mA = (p.author || '匿名').replace(/\n/g, '').trim();
                        var mT = p.text || p.content || p.main || '';
                        if (mT.length > 50) mT = truncateByChars(mT, 50, '...');
                        return '<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">' +
                            '<strong style="color:#576b95;">' + escapeHtml(mA) + '</strong>: ' +
                            escapeHtml(mT) + '</div>';
                    }).join('');
                } else {
                    inner = '<div style="font-size:14px;color:var(--text-secondary);">暂无朋友圈动态</div>';
                }
                break;
            default:
                inner = '<div style="font-size:14px;">' + parseMarkdown(escapeHtml(mod.content || JSON
                    .stringify(mod))) + '</div>';
        }
        return '<div class="pearl-card" style="padding:14px;margin-bottom:12px;"><div style="font-size:13px;font-weight:600;margin-bottom:8px;">' +
            escapeHtml(mod.title || '信息') + '</div>' + inner + '</div>';
    }).join('');
}
// 渲染朋友圈页面
function renderMomentsPage() {
    var playerName = gameState.playerName || '我';
    var modules = gameState._worldModules || [];
    // 朋友圈只使用 type === 'moments' 的模块，不复用 comments
    var momentModules = modules.filter(function(m) {
        return m.type === 'moments';
    });
    // 【性能】渲染缓存
    var _lastContent = momentModules.length > 0 ? String(momentModules[momentModules.length-1].content || '').slice(0, 30) : '';
    var _key = 'moments:' + momentModules.length + '|' + _lastContent;
    if (shouldSkipPageRender('renderMomentsPage', _key)) return;

    var posts = [];
    momentModules.forEach(function(mod) {
        if (mod.posts) {
            mod.posts.forEach(function(p) {
                posts.push({
                    author: p.author || '匿名', avatar: p.avatar || '',
                    text: p.text || p.content || p.main || '', time: p.time || '',
                    location: p.location || '', images: p.images || [],
                    likes: Array.isArray(p.likes) ? p.likes : [],
                    comments: Array.isArray(p.comments) ? p.comments : []
                });
            });
        } else if (mod.moments && Array.isArray(mod.moments)) {
            mod.moments.forEach(function(m) {
                posts.push({
                    author: m.author || '匿名', avatar: m.avatar || '',
                    text: m.text || m.content || '', time: m.time || '',
                    location: m.location || '', images: m.images || [],
                    likes: Array.isArray(m.likes) ? m.likes : [],
                    comments: Array.isArray(m.comments) ? m.comments : []
                });
            });
        } else {
            posts.push({
                author: mod.author || '匿名',
                avatar: mod.avatar || '',
                text: mod.main || mod.content || '',
                time: mod.time || '',
                location: mod.location || '',
                images: mod.images || [],
                likes: mod.likes || [],
                comments: mod.comments || []
            });
        }
    });
    // 【已移除】gameState._moments 本地兑底，全部由 AI 动态生成

    var avatarInitial = playerName.charAt(0);
    var now = new Date();
    var dateStr = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日';
    var sig = gameState.playerSignature || gameState.signature || '这个人很懒，什么都没留下~';

    var html = '<div class="moments-page" style="position:relative;">';
    html +=
        '<div class="cover-section"><div class="cover-placeholder">游戏封面</div><div class="cover-overlay"></div>';
    html += '<div class="user-info"><div class="user-name">' + playerName + '</div>';
    html += '<div class="user-avatar"><div class="avatar-placeholder">' + avatarInitial +
        '</div></div></div></div>';
    html += '<div class="signature">' + sig + '</div>';
    html += '<div class="date-header">' + dateStr + '</div>';

    if (posts.length === 0) {
        // 【P2修复BUG-013】朋友圈缺失时显示"暂无动态"占位，而非使用故事文本填充
        // 修复历史Bug：原"写 暂无朋友圈动态"包含残留的"写 "前缀字符
        html +=
            '<div class="empty-state" style="padding:60px 20px;text-align:center;">' +
            '<div style="font-size:36px;margin-bottom:12px;opacity:0.4;">○</div>' +
            '<div style="font-size:14px;color:var(--text-secondary);">暂无朋友圈动态</div>' +
            '<div style="font-size:12px;color:var(--text-tertiary);margin-top:6px;">游戏进行中会自动生成</div>' +
            '</div>';
    } else {
        posts.forEach(function(post, idx) {
            var authorName = (post.author || '匿名').replace(/\n/g, '').replace(/\r/g, '').trim();
            var avatarIsUrl = post.avatar && /^https?:\/\/.+/i.test(post.avatar);
            var postAvatar = avatarIsUrl ? '<img src="' + escapeHtml(post.avatar) + '" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
                '<div class="avatar-placeholder" style="display:none;">' + escapeHtml(authorName.charAt(0)) + '</div>' :
                '<div class="avatar-placeholder">' + escapeHtml(authorName.charAt(0)) + '</div>';
            // 统一使用相对时间格式
            var postTime = post.time;
            if (!postTime || /^\d{4}-\d{2}-\d{2}/.test(postTime)) {
                // 如果时间为空或为绝对时间格式，生成相对时间
                var offsetMinutes = idx * 30 + Math.floor(Math.random() * 30);
                if (offsetMinutes < 60) postTime = offsetMinutes + '分钟前';
                else if (offsetMinutes < 24 * 60) postTime = Math.floor(offsetMinutes / 60) + '小时前';
                else postTime = Math.floor(offsetMinutes / (24 * 60)) + '天前';
            }
            if (!post.likes) post.likes = [];
            var mentions = (post.text || '').indexOf(playerName) !== -1;
            if (!mentions && Array.isArray(post.comments)) {
                for (var ci = 0; ci < post.comments.length; ci++) {
                    var cm = post.comments[ci];
                    if (cm && (cm.name === playerName || (cm.text || '').indexOf(playerName) !== -1 || cm.replyTo === playerName)) {
                        mentions = true;
                        break;
                    }
                }
            }
            html += '<div class="moment" style="' + (mentions ? 'background:linear-gradient(180deg,#e8f3ff 0%,#f7fbff 60%);border-left:3px solid #1a73e8;padding-left:6px;border-radius:6px;' : '') + '">';
            if (mentions) {
                html += '<div style="display:inline-flex;align-items:center;gap:4px;background:#1a73e8;color:#fff;font-size:11px;padding:2px 8px;border-radius:10px;margin-bottom:6px;font-weight:500;">@ 提到你</div>';
            }
            html += '<div class="moment-avatar">' + postAvatar + '</div>';
            html += '<div class="moment-content">';
            html += '<div class="moment-name">' + escapeHtml(authorName) + '</div>';
            if (post.text) html += '<div class="moment-text">' + escapeHtml(post.text) + '</div>';
            html += '<div class="moment-time">';
            html += '<span class="moment-time-text">' + postTime + '</span>';
            html += '<div class="more-btn"></div>';
            html += '</div>';

            // 修复5: 确保likes和comments是数组
            var likes = Array.isArray(post.likes) ? post.likes : [];
            var comments = Array.isArray(post.comments) ? post.comments : [];
            var hasLikes = likes.length > 0;
            var hasComments = comments.length > 0;
            if (hasLikes || hasComments) {
                html += '<div class="interaction-box">';
                if (hasLikes) {
                    html +=
                        '<div class="likes"><svg class="heart-icon" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
                    html += likes.map(function(n) {
                        return escapeHtml(n);
                    }).join(', ');
                    html += '</div>';
                }
                if (hasComments) {
                    html += '<div class="comments">';
                    comments.forEach(function(cm) {
                        if (cm.replyTo) {
                            html +=
                                '<div class="comment-item"><span class="comment-author">' +
                                escapeHtml(cm.name || '匿名') +
                                '</span><span class="reply-arrow">回复</span><span class="comment-author">' +
                                escapeHtml(cm.replyTo) + '</span><span>：' + escapeHtml(cm
                                    .text || '') + '</span></div>';
                        } else {
                            html +=
                                '<div class="comment-item"><span class="comment-author">' +
                                escapeHtml(cm.name || '匿名') + '</span><span>：' + escapeHtml(
                                    cm.text || '') + '</span></div>';
                        }
                    });
                    html += '</div>';
                }
                html += '</div>';
            }
            html += '</div>';
            // 互动栏：点赞 + 评论
            html += '<div class="moment-actions" style="display:flex;border-top:1px solid #f0f0f0;margin-top:8px;padding-top:8px;gap:20px;">';
            var isLiked = post.likes && Array.isArray(post.likes) && post.likes.indexOf(playerName) !== -1;
            html += '<span style="font-size:13px;color:' + (isLiked ? '#ff3b30' : '#999') + ';cursor:pointer;" onclick="toggleMomentLike(' + idx + ')">' + (isLiked ? '已赞' : '赞') + '</span>';
            html += '<span style="font-size:13px;color:#576b95;cursor:pointer;" onclick="showMomentCommentInput(' + idx + ',this)">评论</span>';
            html += '</div>';
            html += '<div id="momentCommentBox_' + idx + '" style="display:none;margin-top:8px;">';
            html += '<div style="display:flex;gap:8px;align-items:center;"><input type="text" id="momentCommentInput_' + idx + '" placeholder="写评论..." style="flex:1;border:1px solid #e5e5e5;border-radius:16px;padding:6px 12px;font-size:13px;outline:none;" onkeydown="if(event.key===\'Enter\')sendMomentComment(' + idx + ')"><span style="font-size:13px;color:#576b95;cursor:pointer;white-space:nowrap;" onclick="sendMomentComment(' + idx + ')">发送</span></div>';
            html += '</div>';
            html += '</div>';
        });
    }

    html += '<div class="bottom-space"></div>';
    html += '</div>';
    return html;
}
// 朋友圈互动函数
function getMomentPost(idx) {
    var modules = getModulesByType('moments');
    var allPosts = [];
    modules.forEach(function(mod) {
        if (mod.posts) {
            mod.posts.forEach(function(p) {
                allPosts.push({
                    author: p.author || '匿名', avatar: p.avatar || '',
                    text: p.text || p.content || p.main || '', time: p.time || '',
                    location: p.location || '', images: p.images || [],
                    likes: Array.isArray(p.likes) ? p.likes : [],
                    comments: Array.isArray(p.comments) ? p.comments : []
                });
            });
        } else if (mod.moments && Array.isArray(mod.moments)) {
            mod.moments.forEach(function(m) {
                allPosts.push({
                    author: m.author || '匿名', avatar: m.avatar || '',
                    text: m.text || m.content || '', time: m.time || '',
                    location: m.location || '', images: m.images || [],
                    likes: Array.isArray(m.likes) ? m.likes : [],
                    comments: Array.isArray(m.comments) ? m.comments : []
                });
            });
        } else {
            allPosts.push({
                author: mod.author || '匿名', avatar: mod.avatar || '',
                text: mod.main || mod.content || '', time: mod.time || '',
                location: mod.location || '', images: mod.images || [],
                likes: mod.likes || [], comments: mod.comments || []
            });
        }
    });
    // 【已移除】gameState._moments 本地兑底，全部由 AI 动态生成
    if (idx >= 0 && idx < allPosts.length) return allPosts[idx];
    return null;
}
function toggleMomentLike(idx) {
    var post = getMomentPost(idx);
    if (!post) return;
    var playerName = gameState.playerName || '我';
    if (!Array.isArray(post.likes)) post.likes = [];
    var likeIdx = post.likes.indexOf(playerName);
    if (likeIdx === -1) { post.likes.push(playerName); }
    else { post.likes.splice(likeIdx, 1); }
    autoSave();
    // 刷新朋友圈页面
    var content = document.getElementById('logSubContent');
    if (content) { content.innerHTML = renderMomentsPage(); var child = content.firstElementChild; if (child) { child.style.flex = '1'; child.style.minHeight = '0'; } }
}
function showMomentCommentInput(idx, el) {
    var box = document.getElementById('momentCommentBox_' + idx);
    if (box) { box.style.display = box.style.display === 'none' ? 'block' : 'none'; if (box.style.display === 'block') { var input = document.getElementById('momentCommentInput_' + idx); if (input) input.focus(); } }
}
function sendMomentComment(idx) {
    var input = document.getElementById('momentCommentInput_' + idx);
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;
    var post = getMomentPost(idx);
    if (!post) return;
    var playerName = gameState.playerName || '我';
    if (!Array.isArray(post.comments)) post.comments = [];
    post.comments.push({ name: playerName, text: text, replyTo: '' });
    autoSave();
    UI.toast('评论成功');
    // 刷新朋友圈页面
    var content = document.getElementById('logSubContent');
    if (content) { content.innerHTML = renderMomentsPage(); var child = content.firstElementChild; if (child) { child.style.flex = '1'; child.style.minHeight = '0'; } }
}

function renderForumPage() {
    // 【修复BUG-007】AI prompt 要求 type:"forum"，但渲染器和 ensureLogFallbacks 用 type:"comments"。
    // 此前 AI 返回的 forum 模块被过滤掉导致论坛永远空白。现同时接受两种类型。
    var commentMods = getModulesByType(['comments', 'forum']);
    // 【性能】渲染缓存
    var _lastMod = commentMods.length > 0 ? commentMods[commentMods.length-1] : null;
    var _lastSig = _lastMod ? String(_lastMod.title || '').slice(0, 20) + '|' + (_lastMod.comments || []).length : '';
    var _key = 'forum:' + commentMods.length + '|' + _lastSig;
    if (shouldSkipPageRender('renderForumPage', _key)) return;
    var playerName = gameState.playerName || '我';
    var colors = ['#8d6e63', '#03a9f4', '#ff4d4f', '#07c160', '#722ed1', '#fa8c16', '#eb2f96', '#13c2c2',
        '#1890ff', '#52c41a'
    ];
    var tagClasses = ['hot', 'bao', 'xin', 'hot', 'bao', 'xin'];
    var timeLabels = ['刚刚', '1分钟前', '3分钟前', '5分钟前', '10分钟前', '半小时前', '1小时前', '2小时前', '昨天', '前天'];

    if (commentMods.length === 0) {
        return '<div class="forum-page">' +
            '<div style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--bg);"><div class="empty-state"><div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><p>暂无论坛帖子</p><p style="font-size:12px;margin-top:4px;">游戏进行中会自动生成</p></div></div>' +
            '<div class="forum-tab-bar"><div class="forum-tab-item active"><div class="forum-tab-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div><span>热点</span></div><div class="forum-tab-item"><div class="forum-tab-icon">#</div><span>话题</span></div><div class="forum-tab-item"><div class="forum-tab-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><span>我的</span></div></div>' +
            '</div>';
    }

    var hotItems = commentMods.map(function(mod, idx) {
        var rankClass = idx === 0 ? 'top1' : idx === 1 ? 'top2' : idx === 2 ? 'top3' : '';
        var tagClass = tagClasses[idx % tagClasses.length];
        var tagText = tagClass === 'hot' ? '热' : tagClass === 'bao' ? '爆' : '新';
        // 使用确定性hash生成固定数值，避免每次渲染都变
        var seed = 0;
        var titleStr = mod.title || '帖子';
        for (var si = 0; si < titleStr.length; si++) seed = ((seed << 5) - seed + titleStr
            .charCodeAt(si)) | 0;
        var count = (Math.abs(seed) % 450 + 50) + '.' + (Math.abs(seed >> 8) % 9) + '万';
        return '<div class="forum-hot-item" role="button" tabindex="0" onclick="openForumPost(' +
            idx + ')">' +
            '<div class="forum-hot-rank ' + rankClass + '">' + (idx + 1) + '</div>' +
            '<div class="forum-hot-info"><div class="forum-hot-title">' + escapeHtml(mod.title ||
                '帖子') + '</div><div class="forum-hot-count">' + count + '</div></div>' +
            '<div class="forum-hot-tag ' + tagClass + '">' + tagText + '</div></div>';
    }).join('');

    var feedItems = commentMods.map(function(mod, idx) {
        var author = mod.author || '匿名';
        var avatarChar = author ? author.charAt(0) : '?';
        var avatarColor = colors[idx % colors.length];
        var timeLabel = timeLabels[idx % timeLabels.length];
        // 使用确定性hash生成固定数值
        var seed = 0;
        var seedStr = (mod.title || '') + (mod.author || '');
        for (var si = 0; si < seedStr.length; si++) seed = ((seed << 5) - seed + seedStr.charCodeAt(
            si)) | 0;
        var likes = Math.abs(seed) % 4900 + 100;
        var comments = Math.abs(seed >> 4) % 490 + 10;
        var shares = Math.abs(seed >> 8) % 950 + 50;
        var bodyText = mod.main || mod.content || '';
        var tagText = mod.title || '';
        return '<div class="forum-feed-item" role="button" tabindex="0" onclick="openForumPost(' +
            idx + ')">' +
            '<div class="forum-feed-header">' +
            '<div class="forum-feed-avatar" style="background:' + avatarColor + ';">' + avatarChar +
            '</div>' +
            '<div class="forum-feed-info"><div class="forum-feed-name-row"><span class="forum-feed-name">' +
            escapeHtml(author) +
            '</span><span class="forum-feed-verified">√</span></div><div class="forum-feed-time">' +
            timeLabel + '</div></div>' +
            '</div>' +
            '<div class="forum-feed-body">' + escapeHtml(bodyText) + (tagText ?
                ' <span class="forum-feed-tag">#' + escapeHtml(tagText) + '#</span>' : '') +
            '</div>' +
            '<div class="forum-feed-actions"><span>' + likes + '</span><span>' + comments +
            '</span><span>转 ' + shares + '</span></div>' +
            '</div>';
    }).join('');

    var postDetails = commentMods.map(function(mod, idx) {
        var author = mod.author || '匿名';
        var avatarChar = author ? author.charAt(0) : '?';
        var avatarColor = colors[idx % colors.length];
        var comments = mod.comments || [];
        var replyHtml = comments.map(function(cm, ci) {
            var cmChar = (cm.name || '匿').charAt(0);
            var cmColor = colors[(idx + ci + 3) % colors.length];
            var isThread = cm.replyTo ? ' thread' : '';
            var replyPrefix = cm.replyTo ? '<span class="forum-at-user">@' + escapeHtml(cm.replyTo) +
                '</span> ' : '';
            return '<div class="forum-reply-item' + isThread + '">' +
                '<div class="forum-reply-avatar" style="background:' + cmColor + ';">' +
                escapeHtml(cmChar) + '</div>' +
                '<div class="forum-reply-main">' +
                '<div class="forum-reply-name">' + escapeHtml(cm.name || '匿名') + '</div>' +
                '<div class="forum-reply-content">' + replyPrefix + escapeHtml(cm.text || '') +
                '</div>' +
                '<div class="forum-reply-meta"><span>' + timeLabels[(idx + ci) % timeLabels
                    .length] +
                '</span><span style="cursor:pointer" onclick="replyToForumComment(' + idx +
                ',' + ci + ')">回复</span></div>' +
                '</div></div>';
        }).join('');

        return '<div class="forum-post-detail" id="forumPostDetail' + idx +
            '" style="display:none;flex-direction:column;">' +
            '<div class="forum-nav-bar"><div class="forum-nav-back" onclick="closeForumPost(' +
            idx +
            ')">←</div><div class="forum-nav-title">帖子详情</div><div class="forum-nav-right">↻</div></div>' +
            '<div class="forum-post-scroll">' +
            '<div class="forum-post-main"><div class="forum-post-title">' + (mod.title || '帖子') +
            '</div><div class="forum-post-sub">1分钟前　回复</div></div>' +
            '<div class="forum-reply-list">' + replyHtml + '</div>' +
            '<div style="height:20px;"></div>' +
            '</div>' +
            '<div class="forum-post-footer">' +
            '<div class="forum-my-avatar" style="background:#333;">' + playerName.charAt(0) +
            '</div>' +
            '<div class="forum-comment-input" contenteditable="true" data-post-idx="' + idx +
            '" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();sendForumComment(' +
            idx + ')}"></div>' +
            '<div class="forum-send-btn" onclick="sendForumComment(' + idx + ')">></div>' +
            '</div>' +
            '</div>';
    }).join('');

    return '<div class="forum-page" id="forumPage">' +
        '<div id="forumHotView">' +
        '<div style="flex:1;overflow-y:auto;">' +
        '<div class="forum-search-box"><div class="forum-search-input" contenteditable="true"></div></div>' +
        '<div class="forum-section-title">热搜榜单</div>' +
        '<div class="forum-hot-list">' + hotItems + '</div>' +
        '<div style="height:20px;"></div>' +
        '</div>' +
        '</div>' +
        '<div id="forumTopicView" style="display:none;">' +
        '<div class="forum-nav-bar"><div class="forum-nav-back" onclick="showForumHot()">←</div><div class="forum-nav-title" id="forumTopicTitle">话题</div><div class="forum-nav-right"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></div></div>' +
        '<div class="forum-topic-body">' + feedItems + '</div>' +
        '</div>' +
        '<div id="forumMineView" style="display:none;">' +
        '<div class="forum-nav-bar"><div class="forum-nav-back" onclick="showForumHot()">←</div><div class="forum-nav-title">我评论过的</div><div class="forum-nav-right"></div></div>' +
        '<div class="forum-mine-body">' + (function() {
            var mineHtml = '';
            var myCommented = [];
            commentMods.forEach(function(mod, idx) {
                var cmts = mod.comments || [];
                var myCount = 0;
                for (var mi = 0; mi < cmts.length; mi++) {
                    if (cmts[mi].name === playerName) myCount++;
                }
                if (myCount > 0) {
                    myCommented.push({ idx: idx, title: mod.title || '帖子', count: myCount, mod: mod });
                }
            });
            if (myCommented.length === 0) {
                return '<div style="padding:60px 20px;text-align:center;color:var(--text-secondary);">还没发表过评论<br><span style="font-size:12px;">去点击话题发表你的观点吧</span></div>';
            }
            return myCommented.map(function(item) {
                return '<div class="forum-mine-item" style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--bg);border-bottom:1px solid #f0f0f0;cursor:pointer;" onclick="openForumPost(' + item.idx + ')">' +
                    '<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#1a73e8 0%,#4285f4 100%);color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;">◇</div>' +
                    '<div style="flex:1;min-width:0;">' +
                    '<div style="font-size:14px;color:var(--text);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(item.title) + '</div>' +
                    '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">你发表了 ' + item.count + ' 条评论</div>' +
                    '</div>' +
                    '<div style="color:#ccc;font-size:16px;">›</div>' +
                    '</div>';
            }).join('');
        })() + '</div>' +
        '</div>' +
        postDetails +
        '<div class="forum-tab-bar" id="forumTabBar">' +
        '<div class="forum-tab-item active" onclick="showForumHot()"><div class="forum-tab-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div><span>热点</span></div>' +
        '<div class="forum-tab-item" onclick="showForumTopic()"><div class="forum-tab-icon">#</div><span>话题</span></div>' +
        '<div class="forum-tab-item" onclick="showForumMine()"><div class="forum-tab-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><span>我的</span></div>' +
        '</div>' +
        '</div>';
}
// 渲染排行榜页面
function renderRankPage() {
    var rankMods = getModulesByType('ranking');
    // 【性能】渲染缓存
    var _key = 'rank:' + rankMods.length + '|' + (rankMods[0] ? String(rankMods[0].title || '').slice(0, 20) : '');
    if (shouldSkipPageRender('renderRankPage', _key)) return;
    var playerData = gameState.playerData || {};
    var playerName = playerData.name || (gameState.protagonistSetup && gameState.protagonistSetup.mcName) || '我';
    var playerTitle = playerData.title || '';
    var rankTitle = (rankMods[0] && rankMods[0].title) || '排行榜';

    var rankItems = [];
    rankMods.forEach(function(mod) {
        var items = mod.items || [];
        items.forEach(function(it) {
            if (typeof it === 'string') {
                // 去掉"第X名"、"NO.1"、"NO1"等前缀
                var cleaned = it.replace(/^(第[一二三四五六七八九十百千万\d]+名|NO\.?\s*\d+|第\d+名)[：:\s]*/i, '');
                var parts = cleaned.split(/[\s：:]+/);
                var name = parts[0] || cleaned;
                var value = parts.length > 1 ? parts[parts.length - 1] : '';
                rankItems.push({
                    name: name,
                    value: value,
                    extra: ''
                });
            } else if (isObject(it)) {
                var rawName = String(it.name || it.title || it.label || it[0] || '未知');
                // 去掉name中的NO.1/NO1/第X名等前缀
                rawName = rawName.replace(/^(NO\.?\s*\d+|第[一二三四五六七八九十百千万\d]+名|第\d+名)[：:\s]*/i, '').trim();
                rankItems.push({
                    name: rawName,
                    value: String(it.value || it.score || it.points || it[1] || ''),
                    extra: String(it.extra || it.desc || it[2] || '')
                });
            }
        });
    });

    // 上次排行快照，用于计算 ↑/↓
    var prevSnapshot = gameState._lastRankSnapshot || {};
    var currentNameToRank = {};
    rankItems.forEach(function(it, i) { currentNameToRank[it.name] = i; });
    var rowHtml = '';
    if (rankItems.length === 0) {
        rowHtml =
            '<div class="empty-state"><div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg></div><p>暂无排行数据</p><p style="font-size:12px;margin-top:4px;">游戏进行中会自动生成</p></div>';
    } else {
        rowHtml = rankItems.map(function(it, i) {
            var rankClass = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
            var valueDisplay = it.value || '-';
            var extraDisplay = it.extra || '';
            var isPlayer = it.name === playerName || (playerName && it.name.indexOf(playerName) !== -1) || (playerName && playerName.indexOf(it.name) !== -1);
            // 排名变化指示
            var changeTag = '';
            if (prevSnapshot[it.name] !== undefined) {
                var prev = prevSnapshot[it.name];
                if (prev > i) {
                    changeTag = '<span style="display:inline-flex;align-items:center;gap:2px;background:#e8f5e9;color:#2e7d32;font-size:11px;padding:1px 6px;border-radius:8px;margin-left:6px;font-weight:600;">↑' + (prev - i) + '</span>';
                } else if (prev < i) {
                    changeTag = '<span style="display:inline-flex;align-items:center;gap:2px;background:#ffebee;color:#c62828;font-size:11px;padding:1px 6px;border-radius:8px;margin-left:6px;font-weight:600;">↓' + (i - prev) + '</span>';
                } else {
                    changeTag = '<span style="display:inline-flex;align-items:center;gap:2px;background:#f5f5f5;color:#999;font-size:11px;padding:1px 6px;border-radius:8px;margin-left:6px;">—</span>';
                }
            } else {
                changeTag = '<span style="display:inline-flex;align-items:center;background:#e3f2fd;color:#1976d2;font-size:11px;padding:1px 6px;border-radius:8px;margin-left:6px;">NEW</span>';
            }
            return '<div class="rank-row' + (isPlayer ? ' rank-self' : '') + '">' +
                '<div class="rank-num ' + rankClass + '">' + (i + 1) + '</div>' +
                '<div class="rank-id' + (isPlayer ? ' rank-id-self' : '') + '">' + it.name + (
                    isPlayer ? ' (我)' : '') + changeTag + '</div>' +
                '<div class="rank-calls">' + valueDisplay + '</div>' +
                (extraDisplay ? '<div class="rank-duration">' + extraDisplay + '</div>' : '') +
                '</div>';
        }).join('');
    }
    // 更新快照（在异步生成完后会被覆盖）
    gameState._lastRankSnapshot = currentNameToRank;

    // 查找玩家排名
    var playerRank = -1;
    var playerValue = '';
    for (var ri = 0; ri < rankItems.length; ri++) {
        if (rankItems[ri].name === playerName || (playerName && rankItems[ri].name.indexOf(playerName) !== -1) || (playerName && playerName.indexOf(rankItems[ri].name) !== -1)) {
            playerRank = ri;
            playerValue = rankItems[ri].value || '';
            break;
        }
    }

    var myChangeTag = '';
    if (playerRank >= 0 && prevSnapshot[playerName] !== undefined) {
        if (prevSnapshot[playerName] > playerRank) myChangeTag = '<span style="background:#e8f5e9;color:#2e7d32;font-size:12px;padding:2px 8px;border-radius:10px;margin-left:8px;font-weight:600;">↑ 上升 ' + (prevSnapshot[playerName] - playerRank) + ' 位</span>';
        else if (prevSnapshot[playerName] < playerRank) myChangeTag = '<span style="background:#ffebee;color:#c62828;font-size:12px;padding:2px 8px;border-radius:10px;margin-left:8px;font-weight:600;">↓ 下降 ' + (playerRank - prevSnapshot[playerName]) + ' 位</span>';
    }
    return '<div class="rank-page">' +
        '<div class="rank-card">' +
        '<div class="rank-card-header"><span class="rank-card-tab active">' + rankTitle + '</span></div>' +
        '<div class="rank-user-id">' + playerName + myChangeTag + '</div>' +
        (playerTitle ? '<div class="rank-user-stage">' + playerTitle + '</div>' : '') +
        '<div class="rank-stats-row">' +
        '<div class="rank-stat-box"><div class="rank-stat-num">' + (playerValue || '--') +
        '</div><div class="rank-stat-label">我的数值</div></div>' +
        '<div class="rank-stat-box"><div class="rank-stat-num">' + (playerRank >= 0 ? (playerRank + 1) :
            '未上榜') + '</div><div class="rank-stat-label">我的排名</div></div>' +
        '</div>' +
        '</div>' +
        '<div class="rank-list-body">' + rowHtml + '</div>' +
        '</div>';
}
function renderItemsPage() {
    var bag = (StateManager ? StateManager.get('entities.bag') : (gameState.currentBag || [])).filter(function(item) {
        // 【修复BUG-M2】过滤占位/空值物品
        if (!item) return false;
        var name = String(item.name || item.title || '').trim();
        return name && name !== '无' && name !== 'undefined' && name !== 'null' && name !== '未知';
    });
    var playerName = gameState.playerName || '我';
    var currency = getPlayerMoney();
    var currencyName = getCurrencyName();
    // 【性能】渲染缓存（基于过滤后的 bag）
    var _lastItem = bag.length > 0 ? String(bag[bag.length-1].name || bag[bag.length-1].title || '') : '';
    var _key = 'items:' + bag.length + '|' + currency + '|' + _lastItem;
    if (shouldSkipPageRender('renderItemsPage', _key)) return;

    var itemsHtml = '';
    if (bag.length === 0) {
        itemsHtml =
            '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;color:#999;padding:60px 0;"><div style="font-size:40px;margin-bottom:12px;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></div><p>背包空空如也</p><p style="font-size:12px;margin-top:4px;">探索世界获取物品吧</p></div>';
    } else {
        itemsHtml = bag.map(function(item, i) {
            var count = item.count || 1;
            var rarity = item.rarity || '普通';
            var rarityClass = item.rarityClass || 'common';
            var equipped = item.equipped ? ' [已装备]' : '';
            return '<div class="items-box" role="button" tabindex="0" style="padding:20px 10px;">' +
                '<div class="items-box-name" style="font-size:14px;font-weight:500;margin-bottom:8px;">' + (item.name || '未知物品') + equipped + '</div>' +
                '<div class="items-box-count" style="margin-bottom:4px;">x' + count + '</div>' +
                '<div class="items-box-rarity ' + rarityClass + '">' + rarity + '</div></div>';
        }).join('');
    }

    var cardMods = getModulesByType('cards');
    var flowItems = '';
    if (cardMods.length > 0) {
        flowItems = cardMods.slice(0, 5).map(function(mod) {
            var icon = mod.icon || (mod.amount > 0 ? '金' : '钱');
            var title = mod.title || mod.desc || '交易记录';
            var dateStr = mod.date || mod.time || '';
            var amount = mod.amount || mod.value || mod.change || 0;
            var isIncome = amount > 0;
            var amountStr = (isIncome ? '+' : '') + amount;
            var amountClass = isIncome ? 'income' : 'expense';
            return '<div class="items-flow-item">' +
                '<div class="items-flow-icon">' + icon + '</div>' +
                '<div class="items-flow-info"><div class="items-flow-name">' + title +
                '</div><div class="items-flow-meta">' + dateStr + '</div></div>' +
                '<div class="items-flow-amount ' + amountClass + '">' + amountStr + '</div></div>';
        }).join('');
    }

    return '<div class="items-page">' +
        '<div class="items-body">' +
        '<div class="items-balance-card">' +
        '<div class="items-card-logo"><svg viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 13L2 9z"/></svg></div>' +
        '<div class="items-balance-label">' + currencyName + '余额</div>' +
        '<div class="items-balance-amount">' + currency + '</div>' +
        '<div class="items-card-circles"><div class="items-card-circle red"></div><div class="items-card-circle orange"></div></div>' +
        '</div>' +
        '<div class="items-tab-switch">' +
        '<div class="items-tab-btn active" onclick="switchItemsTab(\'items\',this)">物品</div>' +
        '<div class="items-tab-btn" onclick="switchItemsTab(\'bill\',this)">账单</div>' +
        '</div>' +
        '<div id="itemsSection">' +
        '<div class="items-sub-tabs" id="itemsSubTabs"><div class="items-sub-tab active" onclick="filterBagItems(\'all\',this)">全部</div><div class="items-sub-tab" onclick="filterBagItems(\'装备\',this)">装备</div><div class="items-sub-tab" onclick="filterBagItems(\'消耗品\',this)">消耗品</div><div class="items-sub-tab" onclick="filterBagItems(\'材料\',this)">材料</div></div>' +
        '<div class="items-grid" id="itemsGrid" style="justify-items:center;">' + itemsHtml + '</div>' +
        '</div>' +
        '<div id="billSection" style="display:none;">' +
        '<div class="items-sub-tabs"><div class="items-sub-tab active">全部</div><div class="items-sub-tab">收入</div><div class="items-sub-tab">支出</div></div>' +
        '<div class="items-flow-header"><span class="items-flow-title">最近流水</span><span class="items-flow-count">' +
        cardMods.length + '</span></div>' +
        '<div class="items-flow-list">' + (flowItems ||
            '<div class="empty-state" style="padding:30px 0;">暂无流水记录</div>') + '</div>' +
        '</div>' +
        '</div>' +
        '</div>';
}
// 渲染日记页面
function renderDiaryPage() {
    // 【已重构】日记数据完全从 AI 的 world[].type === 'diary' 模块读取，不再依赖本地生成
    // 兼容的数据格式：
    //   items 形式：{"type":"diary","items":[{"npc":"角色名","date":"...","content":"...","mood":"...","memos":[...]}]}
    //   扁平形式：{"type":"diary","npc":"角色名","date":"...","content":"...","mood":"...","memos":[...]}
    var diaries = gameState._npcDiaries || {};
    var currentDiaryNpc = gameState._currentDiaryNpc || '';
    var chars = Object.values(gameState.allCharacters || {});
    var colors = ['#8d6e63', '#03a9f4', '#ff4d4f', '#07c160', '#722ed1', '#fa8c16', '#eb2f96', '#13c2c2'];
    var now = new Date();
    var dateStr = String(now.getMonth() + 1).padStart(2, '0') + '.' + String(now.getDate()).padStart(2,
        '0');

    // 【已重构】从 AI 的 world[].type === 'diary' 模块汇总日记数据
    var diaryModules = getModulesByType('diary');
    var collectDiaryEntry = function(entry) {
        if (!entry || !entry.npc) return;
        var npcName = entry.npc;
        if (!diaries[npcName]) diaries[npcName] = { entries: [], memos: [] };
        if (entry.content) {
            diaries[npcName].entries.push({
                date: entry.date || '',
                content: entry.content,
                mood: entry.mood || ''
            });
        }
        if (Array.isArray(entry.memos)) {
            entry.memos.forEach(function(m) {
                if (m) diaries[npcName].memos.push(m);
            });
        }
    };
    diaryModules.forEach(function(mod) {
        if (Array.isArray(mod.items)) {
            mod.items.forEach(collectDiaryEntry);
        } else {
            collectDiaryEntry(mod);
        }
    });

    if (!currentDiaryNpc) {
        // 【已重构】列表模式：显示有日记的 NPC
        var npcNames = Object.keys(diaries).filter(function(n) {
            return (diaries[n].entries || []).length > 0 || (diaries[n].memos || []).length > 0;
        });
        var listHtml;
        if (npcNames.length === 0) {
            listHtml =
                '<div class="diary-empty"><div class="diary-empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div><p>日记是私密的</p><p style="font-size:13px;margin-top:8px;color:#666;">AI 正在记录他们的心情...<br><br><span style="color:#999;font-size:12px;">（日记内容由 AI 在剧情推进中动态生成）</span></p></div>';
        } else {
            listHtml = npcNames.map(function(npcName) {
                var charIdx = chars.findIndex(function(c) { return c.name === npcName; });
                var av = charIdx >= 0 ? colors[charIdx % colors.length] : '#8d6e63';
                var entriesArr = diaries[npcName].entries || [];
                var mCount = (diaries[npcName].memos || []).length;
                // 检测有多少篇提到玩家
                var mentionCount = 0;
                if (gameState.playerName) {
                    for (var me = 0; me < entriesArr.length; me++) {
                        if ((entriesArr[me].content || entriesArr[me].text || '').indexOf(gameState.playerName) !== -1) {
                            mentionCount++;
                        }
                    }
                }
                var mentionTag = mentionCount > 0 ?
                    '<span style="display:inline-flex;align-items:center;gap:2px;background:#1a73e8;color:#fff;font-size:11px;padding:2px 8px;border-radius:10px;margin-left:6px;font-weight:500;">@ 提到你 ×' + mentionCount + '</span>' : '';
                return '<div class="character-card pearl-card" style="cursor:pointer;margin-bottom:8px;' + (mentionCount > 0 ? 'background:linear-gradient(90deg,#e8f3ff 0%,#fff 60%);border-left:3px solid #1a73e8;' : '') + '" onclick="viewNpcDiary(\'' +
                    escapeAttr(npcName) + '\')">' +
                    '<div class="avatar avatar-md" style="background:' + av + ';color:#fff;">' + escapeHtml(npcName.charAt(0)) + '</div>' +
                    '<div class="char-info">' +
                    '<div class="char-name">' + escapeHtml(npcName) + mentionTag + '</div>' +
                    '<div class="char-meta" style="font-size:12px;color:var(--text-secondary);">' +
                    entriesArr.length + ' 篇日记 · ' + mCount + ' 条备忘' +
                    '</div></div></div>';
            }).join('');
        }
        return '<div class="diary-page">' +
            '<div class="diary-date-nav"><div class="diary-nav-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg></div><div class="diary-nav-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></div><div class="diary-nav-date">' +
            dateStr +
            '</div><div class="diary-nav-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div><div class="diary-nav-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></div></div>' +
            '<div class="diary-user-bar"><div class="diary-user-avatar"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div class="diary-user-name">日记</div></div>' +
            '<div class="diary-body" style="padding:12px;">' + listHtml + '</div></div>';
    }

    var npcData = diaries[currentDiaryNpc] || { entries: [], memos: [] };
    var npcChar = gameState.allCharacters[currentDiaryNpc] || {};
    var avatarColor = '#8d6e63';
    var charIdx = chars.findIndex(function(c) {
        return c.name === currentDiaryNpc;
    });
    if (charIdx >= 0) avatarColor = colors[charIdx % colors.length];

    var allEntries = npcData.entries || [];
    var _playerName = gameState.playerName || '';
    // 提到玩家的日记置顶
    if (_playerName && allEntries.length > 1) {
        allEntries = allEntries.slice().sort(function(a, b) {
            var am = ((a.content || a.text || '').indexOf(_playerName) !== -1) ? 1 : 0;
            var bm = ((b.content || b.text || '').indexOf(_playerName) !== -1) ? 1 : 0;
            if (am !== bm) return bm - am;
            return 0; // 保持原始顺序
        });
        npcData.entries = allEntries;
    }
    var entries = allEntries;
    var currentOffset = gameState._diaryDateOffset || 0;
    if (currentOffset < 0) {
        var targetIdx = -currentOffset;
        if (targetIdx >= 0 && targetIdx < allEntries.length) {
            entries = [allEntries[targetIdx]];
        }
    } else if (currentOffset > 0) {
        entries = allEntries.slice(currentOffset);
    } else if (allEntries.length > 0) {
        entries = [allEntries[allEntries.length - 1]];
    }
    if (entries.length > 0) {
        var firstEntry = entries[0];
        if (firstEntry && firstEntry.date) {
            dateStr = firstEntry.date;
        }
    }
    var journalHtml = '';
    if (entries.length === 0) {
        journalHtml =
            '<div class="diary-card"><div class="diary-card-header"><div class="diary-card-label">JOURNAL（' +
            currentDiaryNpc +
            '）</div><div class="diary-card-lock"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div></div>' +
            '<div class="diary-card-text"><p>暂无日记内容，该角色的日记将在剧情推进中自动生成。</p></div></div>';
    } else {
        journalHtml = entries.map(function(entry) {
            var entryText = entry.content || entry.text || '';
            var paragraphs = entryText.split('\n').filter(function(p) {
                return p.trim();
            }).map(function(p) {
                return '<p>' + escapeHtml(p) + '</p>';
            }).join('');
            var moodTag = entry.mood ? '<span style="float:right;font-size:12px;color:#999;">' + escapeHtml(entry.mood) + '</span>' : '';
            var dateTag = entry.date ? '<div style="font-size:12px;color:#999;margin-bottom:6px;">' + escapeHtml(entry.date) + moodTag + '</div>' : '';
            var _mentionsPlayer = _playerName && entryText.indexOf(_playerName) !== -1;
            var cardStyle = _mentionsPlayer ? 'background:linear-gradient(180deg,#e8f3ff 0%,#f7fbff 100%);border-left:3px solid #1a73e8;' : '';
            var mentionBadge = _mentionsPlayer ?
                '<div style="display:inline-flex;align-items:center;gap:4px;background:#1a73e8;color:#fff;font-size:11px;padding:2px 8px;border-radius:10px;margin-bottom:6px;font-weight:500;">@ 提到你</div><br>' : '';
            return '<div class="diary-card" style="' + cardStyle + '">' + mentionBadge + '<div class="diary-card-header"><div class="diary-card-label">JOURNAL（' +
                currentDiaryNpc +
                '）</div><div class="diary-card-lock"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div></div>' +
                '<div class="diary-card-text">' + dateTag + paragraphs + '</div></div>';
        }).join('');
    }

    var memos = npcData.memos || [];
    var memoHtml = '';
    if (memos.length > 0) {
        var memoItems = memos.map(function(m) {
            return '<li class="diary-memo-item"><span class="diary-memo-dot"></span><span>' + escapeHtml(m) +
                '</span></li>';
        }).join('');
        memoHtml =
            '<div class="diary-memo-card"><div class="diary-memo-tag">MEMO</div><ul class="diary-memo-list">' +
            memoItems + '</ul>' +
            '<div class="diary-memo-dots"><div class="diary-memo-dot-nav active"></div><div class="diary-memo-dot-nav"></div><div class="diary-memo-dot-nav"></div></div></div>';
    }

    return '<div class="diary-page">' +
        '<div style="display:flex;align-items:center;gap:8px;padding:8px 15px;flex-shrink:0;"><div class="diary-nav-btn" onclick="diaryBackToList()" style="font-size:20px;">←</div></div>' +
        '<div class="diary-date-nav"><div class="diary-nav-btn" onclick="diaryChangeDate(-1)" title="上一条"><</div><div class="diary-nav-date" onclick="openDiaryDatePicker()" style="cursor:pointer;display:flex;align-items:center;gap:4px;justify-content:center;" title="点击选择日期"><span style="font-size:13px;">📅</span>' +
        dateStr +
        '</div><div class="diary-nav-btn" onclick="diaryChangeDate(1)" title="下一条">></div><div class="diary-nav-btn" onclick="diaryResetDate()" title="返回最近">»</div></div>' +
        '<div class="diary-user-bar"><div class="diary-user-avatar" style="background:' + avatarColor +
        ';color:#fff;font-size:14px;">' + currentDiaryNpc.charAt(0) +
        '</div><div class="diary-user-name">' + currentDiaryNpc + (npcChar.title ? ' · ' + npcChar.title :
            '') + '</div></div>' +
        '<div class="diary-body">' + journalHtml + memoHtml + '</div>' +
        '</div>';
}
// 渲染邮件页面
function renderMailPage() {
    var mailModules = getModulesByType('mail');
    // 【性能】渲染缓存
    var _lastMod = mailModules.length > 0 ? mailModules[mailModules.length-1] : null;
    var _lastSig = _lastMod ? (_lastMod.items ? _lastMod.items.length : 0) : 0;
    var _key = 'mail:' + mailModules.length + '|' + _lastSig;
    if (shouldSkipPageRender('renderMailPage', _key)) return;
    var allMails = [];
    mailModules.forEach(function(mod) {
        if (mod.items && Array.isArray(mod.items)) {
            mod.items.forEach(function(item) {
                allMails.push(item);
            });
        }
    });
    // 【阶段3清理】原 if (allMails.length === 0) allMails = gameState._mails || [];
    // _mails 从未被任何代码写入（死字段），删除 fallback。
    // 所有邮件数据统一来自 _worldModules 的 type:'mail' 模块。

    var mailListHtml = '';
    if (allMails.length === 0) {
        mailListHtml =
            '<div class="empty-state" style="padding:60px 0;"><div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg></div><p>收件箱为空</p><p style="font-size:12px;margin-top:4px;">暂无邮件</p></div>';
    } else {
        mailListHtml = allMails.map(function(mail, i) {
            var unread = mail.read ? '' : ' unread';
            var unreadDot = mail.read ? '' :
                '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff3b30;margin-right:6px;flex-shrink:0;"></span>';
            var sender = mail.from || mail.sender || '未知发件人';
            var date = mail.date || mail.time || '';
            var subject = mail.subject || '无主题';
            var preview = mail.preview || mail.body || '';
            if (preview.length > 80) preview = truncateByChars(preview, 80, '...');
            preview = preview.replace(/<[^>]*>/g, '');
            var subjectStyle = mail.read ? '' : 'font-weight:600;color:var(--text);';
            var senderStyle = mail.read ? '' : 'font-weight:600;color:var(--text);';
            return '<div class="mail-list-item' + unread + '" onclick="openMailDetail(' + i +
                ')" style="' + (mail.read ? '' : 'background:#f5f8ff;') + '">' +
                '<div class="mail-list-header">' + unreadDot + '<div class="mail-list-sender" style="' + senderStyle + '">' + escapeHtml(sender) +
                '</div><div class="mail-list-date">' + escapeHtml(date) + '</div></div>' +
                '<div class="mail-list-subject" style="' + subjectStyle + '">' + escapeHtml(subject) + '</div>' +
                '<div class="mail-list-preview">' + escapeHtml(preview) + '</div></div>';
        }).join('');
    }

    return '<div style="display:flex;flex-direction:column;flex:1;background:var(--bg);overflow:hidden;">' +
        '<div class="mail-big-title">收件箱</div>' +
        '<div class="mail-search-box"><div class="mail-search-input"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>搜索</div></div>' +
        '<div class="mail-scroll-list">' + mailListHtml + '</div>' +
        '<div class="mail-bottom-bar"><div class="mail-bottom-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>删除</div><div class="mail-bottom-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>分享</div><div class="mail-bottom-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>回复转发</div><div class="mail-bottom-btn"><span>...</span>更多</div></div>' +
        '</div>';
}
// 渲染商店页面
function renderShopPage() {
    var shopModules = getModulesByType('shop');
    // 【性能】渲染缓存
    // 【P2-阶段3-15】统一走 getPlayerMoney（原缺失 coins fallback，现已对齐其他读取点）
    var _currency = getPlayerMoney();
    var _key = 'shop:' + shopModules.length + '|' + _currency;
    if (shouldSkipPageRender('renderShopPage', _key)) return;
    var allGoods = [];
    var categories = [];

    shopModules.forEach(function(mod) {
        if (mod.items && Array.isArray(mod.items)) {
            mod.items.forEach(function(item) {
                allGoods.push(item);
            });
        }
        if (mod.categories && Array.isArray(mod.categories)) {
            mod.categories.forEach(function(cat) {
                if (typeof cat === 'string') {
                    categories.push({
                        icon: '包',
                        name: cat
                    });
                } else {
                    categories.push({
                        icon: cat.icon || '类',
                        name: cat.name || cat.title || '分类'
                    });
                }
            });
        }
    });

    // 【阶段3清理】_shopGoods 死字段已删除，商品数据统一来自 _worldModules

    var catHtml = '';
    if (categories.length > 0) {
        catHtml = categories.map(function(c) {
            return '<div class="shop-cat-item"><div class="shop-cat-icon">' + c.icon +
                '</div><div class="shop-cat-name">' + c.name + '</div></div>';
        }).join('');
    }

    var goodsHtml = '';
    if (allGoods.length === 0) {
        goodsHtml =
            '<div class="empty-state"><div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></div><p>商店暂无商品</p><p style="font-size:12px;margin-top:4px;">探索世界解锁更多商品</p></div>';
    } else {
        goodsHtml = allGoods.map(function(g, gi) {
            var icon = g.icon || '包';
            var name = g.name || '未知商品';
            var desc = g.desc || g.description || '';
            var price = g.price || '0';
            var ownedCount = 0;
            var bag = gameState.currentBag || [];
            for (var bi = 0; bi < bag.length; bi++) {
                if (bag[bi].name === (g.name || '未知商品')) {
                    ownedCount = bag[bi].count || 1;
                    break;
                }
            }
            var stockCount = (g.count !== undefined && g.count !== null) ? parseInt(g.count) : null;
            var isSoldOut = stockCount !== null && stockCount <= 0;
            var priceDisplay = '';
            if (typeof price === 'number' || /^\d+$/.test(price)) {
                priceDisplay = '¥' + price;
            } else if (price && price !== '0') {
                priceDisplay = price;
            } else {
                priceDisplay = '价格面议';
            }
            var ownedDisplay = ownedCount > 0 ? '<div style="font-size:11px;color:var(--success);margin-top:4px;">已拥有: ×' + ownedCount + '</div>' : '';
            var stockTag = stockCount !== null && !isSoldOut ?
                '<div style="font-size:11px;color:#999;margin-top:2px;">库存: ' + stockCount + '</div>' : '';
            var soldOutTag = isSoldOut ?
                '<div style="font-size:11px;color:#e53935;margin-top:2px;font-weight:500;">已售稀</div>' : '';
            var buyAction = isSoldOut ?
                '<span style="font-size:11px;padding:2px 8px;background:#ccc;color:#fff;border-radius:10px;cursor:not-allowed;white-space:nowrap;">已售稀</span>' :
                '<span style="font-size:11px;padding:2px 8px;background:var(--accent,#333);color:#fff;border-radius:10px;cursor:pointer;white-space:nowrap;">购买</span>';
            var itemStyle = isSoldOut ? 'opacity:0.6;cursor:not-allowed;' : 'cursor:pointer;';
            var itemClick = isSoldOut ? '' : ' onclick="buyShopItem(' + gi + ')"';
            return '<div class="shop-goods-item" style="' + itemStyle + '"' + itemClick + '><div class="shop-goods-icon">' + escapeHtml(icon) +
                '</div><div class="shop-goods-info"><div class="shop-goods-name">' + escapeHtml(name) +
                '</div><div class="shop-goods-desc">' + escapeHtml(desc) + '</div>' +
                ownedDisplay + stockTag + soldOutTag +
                '</div><div class="shop-goods-price" style="display:flex;align-items:center;gap:6px;">' + escapeHtml(priceDisplay) +
                buyAction + '</div></div>';
        }).join('');
    }

    // 分类为空时不显示分类区域
    var catSectionHtml = catHtml ?
        '<div class="shop-section-title">分类</div><div class="shop-cat-row">' + catHtml + '</div>' : '';

    var _balance = getPlayerMoney();
    var _cName = getCurrencyName();
    var balanceBar = '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:linear-gradient(135deg,#ffd54f 0%,#ffb300 100%);color:#5d4037;font-weight:600;"><span style="display:flex;align-items:center;gap:6px;">💰 <span>当前' + _cName + '：<span id="shopBalanceDisplay" style="color:#d84315;">' + _balance + '</span></span></span><span style="font-size:12px;opacity:0.7;">点击商品购买</span></div>';
    return '<div style="display:flex;flex-direction:column;flex:1;background:#f5f5f5;overflow:hidden;">' +
        balanceBar +
        '<div class="shop-search-box"><div class="shop-search-input"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>搜索商品</div></div>' +
        '<div class="shop-banner"><div class="shop-banner-text">限时特惠<br>新品上架</div><div class="shop-banner-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></div></div>' +
        catSectionHtml +
        '<div class="shop-section-title">新品推荐</div>' +
        '<div class="shop-goods-list">' + goodsHtml + '</div>' +
        '</div>';
}
// 商城购买函数
function buyShopItem(index) {
    var shopModules = getModulesByType('shop');
    var allGoods = [];
    shopModules.forEach(function(mod) {
        if (mod.items && Array.isArray(mod.items)) { mod.items.forEach(function(item) { allGoods.push(item); }); }
    });
    // 【阶段3清理】_shopGoods 死字段已删除，商品数据统一来自 _worldModules
    if (index < 0 || index >= allGoods.length) return;
    var item = allGoods[index];
    var price = safeInt(item.price, 0);
    var currency = getPlayerMoney();
    var currencyName = getCurrencyName();
    if (item.count !== undefined && item.count !== null && parseInt(item.count) <= 0) {
        UI.toast('该商品已售稀');
        return;
    }
    if (currency < price) {
        UI.toast(currencyName + '不足！需要 ' + price + '，当前 ' + currency);
        return;
    }
    // 扣款
    subtractPlayerMoney(price);
    // 加入背包
    var bagItem = { name: item.name || '未知物品', icon: item.icon || '物', count: item.count || 1, desc: item.desc || item.description || '', rarity: item.rarity || '普通', rarityClass: item.rarityClass || 'common' };
    if (StateManager && BagMutator) {
        BagMutator.addItem(bagItem, { silent: true });
    } else {
        if (!gameState.currentBag) gameState.currentBag = [];
        var found = false;
        for (var i = 0; i < gameState.currentBag.length; i++) {
            if (gameState.currentBag[i].name === bagItem.name) {
                gameState.currentBag[i].count = (gameState.currentBag[i].count || 1) + (bagItem.count || 1);
                found = true; break;
            }
        }
        if (!found) gameState.currentBag.push(bagItem);
    }
    // 【数据联通】同步写入权威源 gm.tables.items
    if (typeof _pushCurrentBagToGM === 'function') {
        try { _pushCurrentBagToGM(); } catch (e) { console.warn('[buyShopItem] push 失败:', e); }
    }
    // 【P1修复BUG-2.2】移除 GameLinker.refreshByDataChange('currentBag')：死代码空操作
    if (item.count !== undefined && item.count !== null) {
        item.count = Math.max(0, safeInt(item.count, 0) - 1);
    }
    UI.toast('购买成功：' + bagItem.name);
    autoSave();
    var newCurrency = getPlayerMoney();
    var content = document.getElementById('logSubContent');
    if (content) { content.innerHTML = renderShopPage(); var child = content.firstElementChild; if (child) { child.style.flex = '1'; child.style.minHeight = '0'; } }
    var shopBal = document.getElementById('shopBalanceDisplay');
    if (shopBal) shopBal.textContent = newCurrency;
    var balanceAmount = document.querySelector('.items-balance-amount');
    if (balanceAmount) {
        balanceAmount.textContent = newCurrency;
    }
}

// 【小剧场融合】日程表页面渲染
function renderCalendarPage() {
    // 【性能】渲染缓存
    var _calMod = gameState._worldModules && gameState._worldModules.find(function(m) { return m.type === 'calendar'; });
    var _events = (_calMod && _calMod.events) || [];
    var _lastTime = _events.length > 0 ? String(_events[_events.length-1].time || _events[_events.length-1].title || '') : '';
    var _key = 'calendar:' + _events.length + '|' + _lastTime;
    if (shouldSkipPageRender('renderCalendarPage', _key)) return;
    var container = document.createElement('div');
    container.className = 'calendar-page';
    container.style.cssText = 'padding:20px;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);min-height:100%;';

    // 标题
    var title = document.createElement('h2');
    title.textContent = '📅 日程表';
    title.style.cssText = 'color:#e94560;margin-bottom:20px;text-align:center;';
    container.appendChild(title);

    // 获取日程数据
    var calendarModule = _calMod;
    var events = _events;

    // 如果没有数据，显示提示
    if (events.length === 0) {
        var emptyTip = document.createElement('div');
        emptyTip.style.cssText = 'text-align:center;color:#888;padding:40px;';
        emptyTip.innerHTML = '<p>暂无日程安排</p><p style="font-size:12px;margin-top:10px;">小剧场中的日程内容将显示在这里</p>';
        container.appendChild(emptyTip);
        return container;
    }

    // 按日期分组
    var groupedEvents = {};
    events.forEach(function(evt) {
        // 修复：evt.time 可能是数字/Date，先转字符串再 split
        var date = '待定';
        if (evt && typeof evt.time === 'string' && evt.time) {
            date = evt.time.split(' ')[0] || '待定';
        }
        if (!groupedEvents[date]) groupedEvents[date] = [];
        groupedEvents[date].push(evt);
    });

    // 渲染每一天
    Object.keys(groupedEvents).forEach(function(date) {
        var daySection = document.createElement('div');
        daySection.style.cssText = 'margin-bottom:20px;background:rgba(255,255,255,0.05);border-radius:12px;padding:15px;';

        var dateLabel = document.createElement('div');
        dateLabel.textContent = date;
        dateLabel.style.cssText = 'color:#0f3460;font-weight:bold;margin-bottom:10px;font-size:14px;';
        daySection.appendChild(dateLabel);

        groupedEvents[date].forEach(function(evt) {
            var eventCard = document.createElement('div');
            eventCard.style.cssText = 'background:rgba(233,69,96,0.1);border-left:3px solid #e94560;padding:10px;margin-bottom:8px;border-radius:4px;';

            var eventTitle = document.createElement('div');
            eventTitle.textContent = evt.title || '无标题';
            eventTitle.style.cssText = 'color:#fff;font-weight:bold;margin-bottom:4px;';
            eventCard.appendChild(eventTitle);

            if (evt.description) {
                var eventDesc = document.createElement('div');
                eventDesc.textContent = evt.description;
                eventDesc.style.cssText = 'color:#aaa;font-size:12px;margin-bottom:4px;';
                eventCard.appendChild(eventDesc);
            }

            var eventMeta = document.createElement('div');
            eventMeta.style.cssText = 'color:#666;font-size:11px;';
            var metaText = [];
            if (evt.time && evt.time.includes(' ')) metaText.push(evt.time.split(' ')[1]);
            if (evt.location) metaText.push('◎ ' + evt.location);
            if (evt.type) metaText.push('◇ ' + evt.type);
            eventMeta.textContent = metaText.join(' | ');
            eventCard.appendChild(eventMeta);

            daySection.appendChild(eventCard);
        });

        container.appendChild(daySection);
    });

    return container;
}

// 【小剧场融合】作者有话说页面渲染
function renderAuthorNotePage() {
    // 【性能】渲染缓存
    var _noteMod = gameState._worldModules && gameState._worldModules.find(function(m) { return m.type === 'author_note'; });
    var _theaterNotes = gameState._theaterContent ? Object.keys(gameState._theaterContent).filter(function(k) {
        return gameState._theaterContent[k] && gameState._theaterContent[k].type === 'author_note';
    }).length : 0;
    var _lastNote = _theaterNotes > 0 ? String((gameState._theaterContent[Object.keys(gameState._theaterContent).filter(function(k) {
        return gameState._theaterContent[k] && gameState._theaterContent[k].type === 'author_note';
    }).pop()].content || '')).slice(0, 30) : '';
    var _key = 'author_note:' + (_noteMod ? 1 : 0) + '|' + _theaterNotes + '|' + _lastNote;
    if (shouldSkipPageRender('renderAuthorNotePage', _key)) return;
    var container = document.createElement('div');
    container.className = 'author-note-page';
    container.style.cssText = 'padding:20px;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);min-height:100%;';

    // 标题
    var title = document.createElement('h2');
    title.textContent = '作者有话说';
    title.style.cssText = 'color:#e94560;margin-bottom:20px;text-align:center;';
    container.appendChild(title);

    // 获取作话数据
    var noteModule = _noteMod;
    var notes = [];

    // 从 _theaterContent 中也获取
    if (gameState._theaterContent) {
        Object.keys(gameState._theaterContent).forEach(function(key) {
            var theater = gameState._theaterContent[key];
            if (theater.type === 'author_note') {
                notes.push({
                    source: key,
                    content: theater.content,
                    html: theater.html,
                    time: new Date().toLocaleString()
                });
            }
        });
    }

    // 如果没有数据，显示提示
    if (notes.length === 0) {
        var emptyTip = document.createElement('div');
        emptyTip.style.cssText = 'text-align:center;color:#888;padding:40px;';
        emptyTip.innerHTML = '<p>暂无作者留言</p><p style="font-size:12px;margin-top:10px;">小剧场中的"作者有话说"将显示在这里</p>';
        container.appendChild(emptyTip);
        return container;
    }

    // 渲染每条作话
    notes.forEach(function(note) {
        var noteCard = document.createElement('div');
        noteCard.style.cssText = 'background:rgba(255,255,255,0.05);border-radius:12px;padding:20px;margin-bottom:15px;';

        var noteHeader = document.createElement('div');
        noteHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;';

        var noteSource = document.createElement('span');
        noteSource.textContent = note.source || '作者';
        noteSource.style.cssText = 'color:#e94560;font-weight:bold;';
        noteHeader.appendChild(noteSource);

        var noteTime = document.createElement('span');
        noteTime.textContent = note.time;
        noteTime.style.cssText = 'color:#666;font-size:11px;';
        noteHeader.appendChild(noteTime);

        noteCard.appendChild(noteHeader);

        var noteContent = document.createElement('div');
        noteContent.style.cssText = 'color:#ddd;line-height:1.6;white-space:pre-wrap;';
        noteContent.textContent = note.content || note.html || '';
        noteCard.appendChild(noteContent);

        container.appendChild(noteCard);
    });

    return container;
}

// 渲染默认页面
function renderDefaultPage(type) {
    var modules = gameState._worldModules || [];
    var typeMap = {
        forum: 'comments',
        shop: 'cards',
        achieve: 'ranking',
        diary: 'text',
        mail: 'comments',
        rank: 'ranking'
    };
    var matchType = typeMap[type] || 'text';
    var matched = modules.filter(function(m) {
        return m.type === matchType;
    });

    if (matched.length > 0) {
        return matched.map(function(mod) {
            var inner = '';
            // 修复：AI 返回的字段全部 escapeHtml，防止 XSS
            switch (mod.type) {
                case 'text':
                    inner = '<div style="font-size:14px;line-height:1.7;">' + parseMarkdown(mod
                        .content || '') + '</div>';
                    break;
                case 'list':
                    inner = (mod.items || []).map(function(it) {
                        var txt = isObject(it) ? (it.name || it.text || it.title || JSON.stringify(it)) : String(it || '');
                        return '<div style="padding:6px 0;font-size:14px;">▸ ' + escapeHtml(txt) +
                            '</div>';
                    }).join('');
                    break;
                case 'ranking':
                    inner = (mod.items || []).map(function(it, i) {
                        var txt = isObject(it) ? (it.name || it.text || it.title || JSON.stringify(it)) : String(it || '');
                        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;"><span style="font-weight:600;color:' +
                            (i < 3 ? 'var(--text)' : 'var(--text-tertiary)') + ';">' + (i +
                                1) + '</span><span style="font-size:14px;">' + escapeHtml(txt) +
                            '</span></div>';
                    }).join('');
                    break;
                case 'key_value':
                    inner = (mod.items || []).map(function(kv) {
                        return '<div class="player-field"><span class="player-field-label">' +
                            escapeHtml(kv && kv.key) + '</span><span class="player-field-value">' + escapeHtml(kv && kv.value) +
                            '</span></div>';
                    }).join('');
                    break;
                case 'cards':
                    inner = (mod.items || []).map(function(c) {
                        return '<div class="pearl-card" style="padding:12px;margin-bottom:8px;"><div style="font-weight:500;">' +
                            escapeHtml(c && c.icon || '') + ' ' + escapeHtml(c && c.title) +
                            '</div><div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">' +
                            escapeHtml(c && c.content || '') + '</div></div>';
                    }).join('');
                    break;
                case 'comments':
                    inner = '<div style="font-size:14px;margin-bottom:8px;">' + escapeHtml(mod.main || '') +
                        '</div>' + (mod.comments || []).map(function(cm) {
                            return '<div style="padding:8px 0;border-top:1px solid var(--border);font-size:13px;"><strong>' +
                                escapeHtml(cm && cm.name) + ':</strong> ' + escapeHtml(cm && cm.text) + '</div>';
                        }).join('');
                    break;
                case 'moments':
                    var mPosts3 = [];
                    if (mod.posts) { mPosts3 = mod.posts.slice(0, 3); }
                    else if (mod.moments && Array.isArray(mod.moments)) { mPosts3 = mod.moments.slice(0, 3); }
                    if (mPosts3.length > 0) {
                        inner = mPosts3.map(function(p) {
                            var mA3 = (p.author || '匿名').replace(/\n/g, '').trim();
                            var mT3 = p.text || p.content || p.main || '';
                            if (mT3.length > 50) mT3 = truncateByChars(mT3, 50, '...');
                            return '<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">' +
                                '<strong style="color:#576b95;">' + mA3 + '</strong>: ' +
                                mT3 + '</div>';
                        }).join('');
                    } else {
                        inner = '<div style="font-size:14px;color:var(--text-secondary);">暂无朋友圈动态</div>';
                    }
                    break;
                default:
                    inner = '<div style="font-size:14px;">' + parseMarkdown(escapeHtml(mod.content || JSON
                        .stringify(mod))) + '</div>';
            }
            return '<div class="pearl-card" style="padding:14px;margin-bottom:12px;"><div style="font-size:13px;font-weight:600;margin-bottom:8px;">' +
                (mod.title || '信息') + '</div>' + inner + '</div>';
        }).join('');
    } else {
        // 【修复BUG-L2】为各空状态子页面提供更明确的引导
        var hints = {
            chat: 'NPC 会在剧情推进中主动发来消息',
            forum: '论坛内容会随剧情推进由 AI 自动生成',
            rank: '排行榜将在有竞争/评比剧情时自动出现',
            shop: '商店会在剧情中出现可交易场景后解锁',
            moments: '朋友圈动态会随角色关系与事件自动更新',
            diary: '日记条目会在剧情触发回忆或内心独白时生成',
            mail: '邮件会在 NPC 或系统向玩家发送消息时出现',
            achieve: '成就系统即将开放'
        };
        var hint = hints[type] || '该功能将在游戏进行中自动填充';
        return '<div class="empty-state"><div class="empty-state-icon">单</div><p>暂无内容</p><p style="font-size:13px;margin-top:8px;color:var(--text-secondary);padding:0 24px;text-align:center;">' + escapeHtml(hint) + '</p></div>';
    }
}

// ========================================
// 第9层: 玩家/背包/物品
// ========================================
// --- 玩家状态渲染 ---
function renderPlayerStats(player) {
    // 如果AI返回了新数据，更新存储（使用Object.assign确保字段完整）
    if (player) {
        // 【修复BUG-003】AI 返回纯文本时，AIOutputSchema.normalize 填充默认空 player
        // { name: '', identity: '', stats: [] }，此处若不拦截会用空 stats 覆盖已有属性。
        // 判定为"空 player"（无 name/identity 且 stats 为空数组）时跳过更新，仅刷新页面。
        var _hasName = String(player.name || '').trim();
        var _hasIdentity = String(player.identity || '').trim();
        var _hasStats = Array.isArray(player.stats) ? player.stats.length > 0 : !!player.stats;
        var _hasOther = player.title || player.personality || player.level !== undefined;
        var _isEmpty = !_hasName && !_hasIdentity && !_hasStats && !_hasOther;
        if (!_isEmpty) {
            var existing = gameState.playerData || { name: '', stats: [], details: [], bag: [] };
            gameState.playerData = Object.assign({}, existing, player);
            // 【修复BUG-003】仅在 AI 返回了非空 stats 数组时才覆盖，避免空数组清空已生成的属性
            if (player.stats && Array.isArray(player.stats) && player.stats.length > 0) {
                gameState.playerData.stats = player.stats;
            }
            if (Array.isArray(player.details) && player.details.length > 0) {
                gameState.playerData.details = player.details;
            }
            if (Array.isArray(player.bag) && player.bag.length > 0) {
                gameState.playerData.bag = player.bag;
            }
            // 【修复BUG-002】锁定主角名：禁止 AI 用空名或不同名覆盖玩家设定的名字
            var _lockedName = (gameState.protagonistSetup && gameState.protagonistSetup.mcName) || gameState.playerName || existing.name;
            if (_lockedName && gameState.playerData.name !== _lockedName) {
                gameState.playerData.name = _lockedName;
            }
        }
    }
    renderPlayerPage();
}
function renderPlayerPage() {
    // 【性能优化】避免相同数据触发重绘（页面切回时尤其有用）
    try {
        var pd = gameState.playerData || {};
        // 【修复】原 cacheKey 漏算 identity/title/stats/personality，
        // 导致 AI 更新主角属性或身份后个人页不重绘
        var statsSig = '';
        if (Array.isArray(pd.stats)) {
            statsSig = pd.stats.map(function(s) { return (s.label || '') + ':' + (s.value || ''); }).join(',');
        }
        var cacheKey = JSON.stringify({
            n: pd.name, id: pd.identity, t: pd.title, p: pd.personality,
            st: statsSig,
            lv: pd.level, exp: pd.exp,
            favs: (gameState.relationships || []).length,
            inv: (gameState.currentBag || []).length,
            r: (gameState.conversationHistory || []).length
        });
        if (typeof RenderCache !== 'undefined' && RenderCache.same('renderPlayerPage', cacheKey)) return;
        if (typeof RenderCache !== 'undefined') RenderCache.mark('renderPlayerPage', cacheKey);
    } catch (e) { /* 缓存失败不阻塞渲染 */ }
    var data = gameState.playerData;
    var nameEl = document.getElementById('playerPageName');
    var subEl = document.getElementById('playerPageSub');
    var avatarFallback = document.getElementById('playerPageAvatarFallback');
    var staticFields = document.getElementById('playerStaticFields');
    var dynamicFields = document.getElementById('playerDynamicFields');
    // 【修复】移除对已删除的 playerEvents 元素的检查（已改为 relationNet）
    if (!nameEl || !subEl || !avatarFallback || !staticFields || !dynamicFields) return;

    // === 联动1：个人页面显示"记忆锚点"提示（让玩家知道AI记得什么）===
    var anchorHintEl = document.getElementById('playerAnchorHint');
    if (!anchorHintEl) {
        anchorHintEl = document.createElement('div');
        anchorHintEl.id = 'playerAnchorHint';
        anchorHintEl.style.cssText = 'margin-top:12px;padding:10px 12px;background:linear-gradient(135deg,#e3f2fd 0%,#f3e5f5 100%);border-radius:8px;font-size:12px;color:#555;line-height:1.6;';
        var dynAfter = dynamicFields.parentNode;
        if (dynAfter) dynAfter.insertBefore(anchorHintEl, dynamicFields.nextSibling);
    }
    try {
        if (window.EnhancedMemory && EnhancedMemory.longTermMemory) {
            var anchors = EnhancedMemory.longTermMemory.worldAnchors || [];
            var pcId = anchors.filter(function(a) { return a.type === 'pc_identity'; });
            var setting = anchors.filter(function(a) { return a.type === 'setting' || a.type === 'world_rule'; });
            var hintHtml = '🧠 <b>AI记忆锚点</b>（永不忘）：<br>';
            if (pcId.length > 0) hintHtml += '<b>你的设定：</b>' + escapeHtml(pcId[0].content) + '<br>';
            if (setting.length > 0) hintHtml += '<b>世界：</b>' + escapeHtml(setting[0].content.substring(0, 60)) + (setting[0].content.length > 60 ? '...' : '');
            if (pcId.length === 0 && setting.length === 0) {
                hintHtml += '<span style="color:#999;">暂无永久事实（首次剧情后自动建立）</span>';
            }
            anchorHintEl.innerHTML = hintHtml;
        }
    } catch (e) { console.warn('[PlayerPage] 锚点提示渲染失败:', e); }

    // === 联动2：与最近的NPC关系摘要 ===
    var relationSummaryEl = document.getElementById('playerRelationSummary');
    if (!relationSummaryEl) {
        relationSummaryEl = document.createElement('div');
        relationSummaryEl.id = 'playerRelationSummary';
        relationSummaryEl.style.cssText = 'margin-top:10px;padding:10px 12px;background:#f9fbe7;border-radius:8px;font-size:12px;line-height:1.6;';
        var relNet = document.getElementById('relationNet');
        if (relNet && relNet.parentNode) relNet.parentNode.insertBefore(relationSummaryEl, relNet);
    }
    try {
        var chars = Object.values(gameState.allCharacters || {});
        if (chars.length > 0) {
            var topChars = chars.slice().sort(function(a, b) {
                return (b.favorability || 0) - (a.favorability || 0);
            }).slice(0, 3);
            var rsHtml = '💞 <b>最近的人际关系：</b><br>';
            topChars.forEach(function(c) {
                var fav = Math.round(c.favorability || 0);
                // 【修复】原 emoji 分级有重叠 bug：30<=fav<60 和 -20<=fav<30 都返回◇
                // 现按好感/中立/反感三档清晰划分
                var emoji;
                if (fav >= 60) emoji = '♥';        // 好感
                else if (fav >= 15) emoji = '◇';   // 友善
                else if (fav > -15) emoji = '○';   // 中立
                else if (fav > -40) emoji = '▽';   // 疏远
                else emoji = '✕';                   // 反感
                rsHtml += emoji + ' ' + escapeHtml(c.name) + (c.relation ? '（' + escapeHtml(c.relation) + '）' : '') + ' 好感 ' + fav + '<br>';
            });
            relationSummaryEl.innerHTML = rsHtml;
        } else {
            relationSummaryEl.innerHTML = '<span style="color:#999;">尚未遇见任何角色</span>';
        }
    } catch (e) { console.warn('[PlayerPage] 关系摘要渲染失败:', e); }

    if (!data) {
        nameEl.textContent = '主角';
        subEl.textContent = '等待AI分配...';
        avatarFallback.innerHTML =
            '<svg class="icon" style="width:36px;height:36px;stroke-width:1.5;"><use href="#icon-user"/></svg>';
        staticFields.innerHTML = '<p class="text-soft" style="font-size:13px;">AI会根据世界观自动生成</p>';
        dynamicFields.innerHTML = '<p class="text-soft" style="font-size:13px;">属性将由AI根据世界观动态生成</p>';
        // 【修复】eventsEl 已改为 relationNet，直接渲染导航栏
        var relNetEl = document.getElementById('relationNet');
        if (relNetEl) relNetEl.innerHTML = '<p class="text-soft" style="font-size:13px;">暂无关系记录</p>';
        renderNavBar('playerNav', [{
                page: 'storyPage',
                icon: 'icon-book',
                label: '剧情'
            },
            {
                page: 'playerPage',
                icon: 'icon-user',
                label: '个人'
            },
            {
                page: 'npcPage',
                icon: 'icon-users',
                label: '人际'
            },
            {
                page: 'logPage',
                icon: 'icon-grid',
                label: '日志'
            },
            {
                page: 'memoryPage',
                icon: 'icon-sparkles',
                label: '记忆'
            },
            {
                page: 'recapPage',
                icon: 'icon-clock',
                label: '回顾'
            }
        ], 1);
        return;
    }

    nameEl.textContent = data.name || '主角';
    subEl.textContent = data.title || data.identity || '身份待定';
    avatarFallback.textContent = data.name ? data.name.charAt(0) : '?';

    // 基本信息
    var fixedFields = [{
            label: '姓名',
            value: data.name
        },
        {
            label: '年龄',
            value: data.age
        },
        {
            label: '身份',
            value: data.identity
        },
        {
            label: '性格',
            value: data.personality
        }
    ];
    var staticHtml = '';
    fixedFields.forEach(function(f) {
        if (f.value) {
            staticHtml += '<div class="player-field"><span class="player-field-label">' + escapeHtml(f.label) +
                '</span><span class="player-field-value">' + escapeHtml(f.value) + '</span></div>';
        }
    });
    staticFields.innerHTML = staticHtml || '<p class="text-soft" style="font-size:13px;">AI会根据世界观自动生成</p>';

    // 动态属性 - 修复6: 恢复原版显示data.stats带进度条的属性值
    var dynHtml = '';
    if (data.stats && data.stats.length > 0) {
        data.stats.forEach(function(s) {
            var numVal = parseInt(s.value);
            if (!isNaN(numVal) && numVal >= 0 && numVal <= 100) {
                var isWarning = numVal < 30;
                dynHtml += '<div class="player-field-rich ' + (isWarning ? 'player-field-warning' : '') + '">' +
                    '<div class="player-field-head"><span class="player-field-label">' + escapeHtml(s.label) +
                    '</span><span class="player-field-value">' + escapeHtml(s.value) + '</span></div>' +
                    '<div class="progress-bar"><div class="progress-fill" style="width:' + numVal +
                    '%;"></div></div></div>';
            } else {
                dynHtml += '<div class="player-field"><span class="player-field-label">' + escapeHtml(s.label) +
                    '</span><span class="player-field-value">' + escapeHtml(s.value) + '</span></div>';
            }
        });
    } else {
        dynHtml = '<p class="text-soft" style="font-size:13px;">属性将由AI根据世界观动态生成</p>';
    }
    dynamicFields.innerHTML = dynHtml;

    // 关系网
    var rels = gameState.relationships || [];
    // 【修复】关系网为空但已有角色时，自动从角色推断关系，避免"关系摘要"已列出角色而关系网仍显示空状态
    if (rels.length === 0 && Object.keys(gameState.allCharacters || {}).length > 0 && typeof _inferRelationshipsFromCharacters === 'function') {
        _inferRelationshipsFromCharacters();
        rels = gameState.relationships || [];
    }
    var relNetEl = document.getElementById('relationNet');
    if (relNetEl) {
        if (rels.length > 0) {
        var relTypeColor = {
            '暧昧': '#ff6b6b', '恋人': '#ff4757', '友好': '#2ed573',
            '敌对': '#ff6348', '仇恨': '#ff0000', '盟友': '#1e90ff',
            '师徒': '#9c88ff', '上下级': '#ffa502', '亲人': '#ff6b81',
            '家族': '#eccc68', '对手': '#ff7f50', '中立': '#a4b0be'
        };
        relNetEl.innerHTML = rels.map(function(r) {
            var color = relTypeColor[r.type] || '#999';
            return '<div class="relation-item">' +
                '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">' +
                '<span style="font-weight:500;font-size:13px;">' + escapeHtml(r.from) + '</span>' +
                '<span style="font-size:11px;color:#fff;background:' + color + ';padding:1px 6px;border-radius:10px;">' + escapeHtml(r.type) + '</span>' +
                '<span style="color:#999;font-size:12px;">→</span>' +
                '<span style="font-weight:500;font-size:13px;">' + escapeHtml(r.to) + '</span>' +
                '</div>' +
                '<div style="font-size:12px;color:var(--text-secondary);">' + escapeHtml(r.desc || '') + '</div>' +
                '</div>';
        }).join('');
        } else {
            relNetEl.innerHTML = '<p class="text-soft" style="font-size:13px;">暂无关系记录</p>';
        }
    }

    renderNavBar('playerNav', [{
            page: 'storyPage',
            icon: 'icon-book',
            label: '剧情'
        },
        {
            page: 'playerPage',
            icon: 'icon-user',
            label: '个人'
        },
        {
            page: 'npcPage',
            icon: 'icon-users',
            label: '人际'
        },
        {
            page: 'logPage',
            icon: 'icon-grid',
            label: '日志'
        },
        {
            page: 'memoryPage',
            icon: 'icon-sparkles',
            label: '记忆'
        },
        {
            page: 'recapPage',
            icon: 'icon-clock',
            label: '回顾'
        }
    ], 1);
}
// --- 背包渲染 ---
function renderBag(items) {
    // 【修复BUG-08】renderBag 原用替换语义，AI 只返回本轮新物品时会清空旧物品
    // 改为合并语义：以现有 currentBag 为基础，合并/覆盖 AI 返回的物品
    if (items && Array.isArray(items)) {
        if (StateManager && BagMutator) {
            BagMutator.mergeItems(items, { silent: true });
        } else {
            var existingBag = Array.isArray(gameState.currentBag) ? gameState.currentBag : [];
            var existingMap = {};
            existingBag.forEach(function(it, idx) {
                var key = (it && (it.name || it.title || it.id)) || ('__idx_' + idx);
                existingMap[key] = it;
            });
            items.forEach(function(it) {
                if (!it) return;
                var key = it.name || it.title || it.id;
                if (!key) return;
                if (existingMap[key]) {
                    // 保留原有字段，更新数量等可覆盖字段
                    existingMap[key].count = it.count !== undefined ? it.count : (existingMap[key].count || 1);
                    if (it.desc !== undefined) existingMap[key].desc = it.desc;
                    if (it.rarity !== undefined) existingMap[key].rarity = it.rarity;
                    if (it.rarityClass !== undefined) existingMap[key].rarityClass = it.rarityClass;
                    if (it.equipped !== undefined) existingMap[key].equipped = it.equipped;
                    if (it.usable !== undefined) existingMap[key].usable = it.usable;
                } else {
                    existingBag.push(it);
                    existingMap[key] = it;
                }
            });
            gameState.currentBag = existingBag;
        }
    }
    // 【修复BUG-02】refreshAllPanels() 调用 renderBag() 不传参时，不要清空背包
    // 不传参表示仅重绘当前背包
    var currentBag = StateManager ? StateManager.get('entities.bag') : gameState.currentBag;
    if (!Array.isArray(currentBag)) {
        currentBag = [];
        if (StateManager) StateManager.set('entities.bag', currentBag, { silent: true });
        gameState.currentBag = currentBag;
    }
    // 【数据联通】同步写入权威源 gm.tables.items
    if (typeof _pushCurrentBagToGM === 'function') {
        try { _pushCurrentBagToGM(); } catch (e) { console.warn('[renderBag] push 失败:', e); }
    }
    // 重绘后修复 gameState.allCharacters 等引用别名（背包变更可能伴随角色变更）
    if (typeof _ensureDataLinkage === 'function') {
        try { _ensureDataLinkage(); } catch (e) { console.warn('[renderBag] 数据联动失败:', e); }
    }
    // 【修复】itemsGrid 是在 renderItemsPage() 中通过 innerHTML 动态创建到 logSubContent 里的，
    // 不存在时仅更新 gameState.currentBag，下次进入物品页会自动用最新数据渲染。
    var container = document.getElementById('itemsGrid');
    if (!container) return;
    // 【性能优化】背包内容未变则跳过重绘
    try {
        var bagKey = JSON.stringify(currentBag.map(function(it) {
            return [it.id || it.name, it.count || it.amount || 1];
        }));
        if (typeof RenderCache !== 'undefined' && RenderCache.same('renderBag', bagKey)) return;
        if (typeof RenderCache !== 'undefined') RenderCache.mark('renderBag', bagKey);
    } catch (e) { /* 缓存失败不阻塞渲染 */ }
    if (currentBag.length === 0) {
        container.innerHTML =
            '<div class="empty-state"><div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></div><p>背包空空如也</p></div>';
        return;
    }
    // 【修复X3】物品数据需要转义；并使用与 renderItemsPage 一致的 items-box 结构，保证 filterBagItems 仍可工作
    // 【修复BUG-M2】同步过滤占位/空值物品，避免在物品网格中显示“无”等占位条目
    container.innerHTML = currentBag.filter(function(item) {
        if (!item) return false;
        var name = String(item.name || item.title || '').trim();
        return name && name !== '无' && name !== 'undefined' && name !== 'null' && name !== '未知' && name !== '未知物品';
    }).map(function(item) {
        var name = item.name || item || '未知物品';
        var count = item.count || item.amount || 1;
        var rarity = item.rarity || '普通';
        var rarityClass = item.rarityClass || 'common';
        var equipped = item.equipped ? ' [已装备]' : '';
        var desc = item.desc || item.description || '';
        var descHtml = desc ? '<div class="char-meta" style="margin-top:4px;font-size:12px;color:var(--text-secondary);">' + escapeHtml(desc) + '</div>' : '';
        return '<div class="items-box" role="button" tabindex="0" style="padding:20px 10px;">' +
            '<div class="items-box-name" style="font-size:14px;font-weight:500;margin-bottom:8px;">' + escapeHtml(name) + equipped + '</div>' +
            '<div class="items-box-count" style="margin-bottom:4px;">x' + count + '</div>' +
            '<div class="items-box-rarity ' + rarityClass + '">' + escapeHtml(rarity) + '</div>' +
            descHtml +
            '</div>';
    }).join('');
}
// 渲染物品页面

// ========================================
// 第10层: 回顾/导出
// ========================================
// ========================================
// 收藏 & 导出
// ========================================
function exportStoryText() {
    var stories = getStoryList();
    if (stories.length === 0) {
        UI.toast('暂无剧情');
        return;
    }
    var text = stories.map(function(it, idx) {
        return '=== 第' + (idx + 1) + '段 ===\n\n' + it.text;
    }).join('\n\n\n');
    var title = gameState.userPrompt ? gameState.userPrompt.substring(0, 20) : '自由剧本';
    var blob = new Blob([text], {
        type: 'text/plain;charset=utf-8'
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = title + '_剧情记录.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    TimerManager.setTimeout('revokeStoryURL', function() { URL.revokeObjectURL(url); }, 1000);
}
// --- 任务渲染（空壳已删除，使用上方完整实现） ---

// --- 关系网渲染（空壳已删除，使用上方完整实现） ---

// --- 剧情回顾渲染 ---
function renderRecapPage() {
    var container = document.getElementById('recapList');
    if (!container) return;
    // 【性能优化】剧情回顾数据未变时跳过整页重绘（每次点击导航栏都会触发）
    try {
        var storiesProbe = getStoryList();
        var _key = storiesProbe.length + '|' + (storiesProbe.length ? storiesProbe[storiesProbe.length - 1].text.length : 0);
        if (typeof RenderCache !== 'undefined' && RenderCache.same('renderRecapPage', _key)) return;
        if (typeof RenderCache !== 'undefined') RenderCache.mark('renderRecapPage', _key);
    } catch (e) { /* 缓存失败不阻塞渲染 */ }
    // 联动：用记忆里的最近剧情摘要补全回顾
    var stories = getStoryList();
    if (stories.length === 0) {
        // 联动：如果故事列表为空但记忆里有剧情大纲，显示"从记忆中恢复"
        var memSummary = '';
        if (window.EnhancedMemory && EnhancedMemory.longTermMemory) {
            var m = EnhancedMemory.longTermMemory;
            if (m.worldSetting) memSummary += '【世界观】' + m.worldSetting + '\n';
            if (m.currentChapterSummary) memSummary += '【当前进展】' + m.currentChapterSummary + '\n';
        }
        if (memSummary) {
            container.innerHTML =
                '<div class="recap-timeline"><div class="timeline-item current">' +
                '<div class="timeline-item-head"><span class="timeline-item-title">从记忆恢复</span></div>' +
                '<div class="timeline-item-summary" style="white-space:pre-wrap;line-height:1.6;">' +
                escapeHtml(memSummary.substring(0, 500)) + '</div></div></div>';
        } else {
            container.innerHTML =
                '<div class="empty-state"><div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></div><p>暂无剧情记录</p></div>';
        }
    } else {
        // 【修复X7/BUG-03】剧情回顾摘要需要转义；卡片标题优先用 story title
        container.innerHTML = '<div class="recap-timeline">' + stories.map(function(s, i) {
            var isCurrent = i === stories.length - 1;
            var summary = (s.text || '').substring(0, 80);
            var cardTitle = s.title || ('第' + (i + 1) + '段');
            return '<div class="timeline-item ' + (isCurrent ? 'current' : '') +
                '" onclick="showRecapDetail(' + i + ')">' +
                '<div class="timeline-item-head"><span class="timeline-item-title">' +
                escapeHtml(cardTitle) + '</span></div>' +
                '<div class="timeline-item-summary">' + escapeHtml(summary) + '...</div></div>';
        }).join('') + '</div>';
    }
    renderNavBar('recapNav', [{
            page: 'storyPage',
            icon: 'icon-book',
            label: '剧情'
        },
        {
            page: 'playerPage',
            icon: 'icon-user',
            label: '个人'
        },
        {
            page: 'npcPage',
            icon: 'icon-users',
            label: '人际'
        },
        {
            page: 'logPage',
            icon: 'icon-grid',
            label: '日志'
        },
        {
            page: 'memoryPage',
            icon: 'icon-sparkles',
            label: '记忆'
        },
        {
            page: 'recapPage',
            icon: 'icon-clock',
            label: '回顾'
        }
    ], 5);
}
function showRecapDetail(idx) {
    var stories = getStoryList();
    if (!stories[idx]) return;
    var s = stories[idx];
    var titleEl = document.getElementById('recapDetailTitle');
    var bodyEl = document.getElementById('recapDetailBody');
    if (!titleEl || !bodyEl) return;
    // 【修复BUG-03】使用 getStoryList 已解析的 title；若空则回退到"第N段"
    titleEl.textContent = s.title || '第' + (idx + 1) + '段';
    // s.text 已是 JSON 解析后的 story 字段（getStoryList 处理过），直接 formatStory 即可
    // 仅在 s.text 仍是 JSON 字符串时（旧历史数据）兜底解析一次
    var storyText = s.text || '';
    if (storyText && storyText.trim().charAt(0) === '{') {
        try {
            var parsed = JSON.parse(storyText);
            if (parsed && typeof parsed === 'object') {
                storyText = parsed.story || parsed.storyText || parsed.content || storyText;
            }
        } catch (e) { /* 忽略，用原文 */ }
    }
    bodyEl.innerHTML = formatStory(storyText);
    UI.showModal('recapDetailModal');
}

// ========================================
// 第11层: 预设系统
// ========================================
// ========================================
// 预设管理系统
// ========================================
function getPresets() {
    var list = [];
    try {
        list = Storage.getJSON(Storage.KEYS.PRESETS, []);
    } catch (e) {
        console.error('[PresetManager] 读取presets失败:', e);
        list = [];
    }
    // 兼容：为没有 saveSlotId 的旧预设分配ID
    var needSave = false;
    for (var pi = 0; pi < list.length; pi++) {
        if (!list[pi].saveSlotId) {
            var hash = 0;
            var str = (list[pi].name || '') + (list[pi].time || '') + (list[pi].prompt || '') + pi;
            for (var ci = 0; ci < str.length; ci++) {
                hash = ((hash << 5) - hash) + str.charCodeAt(ci);
                hash |= 0;
            }
            list[pi].saveSlotId = 1000 + Math.abs(hash % 9000);
            needSave = true;
        }
    }
    if (needSave) savePresets(list);
    return list;
}
function savePresets(list) {
    Storage.setJSON(Storage.KEYS.PRESETS, list);
}
function renderPresetPages() {
    var presets = getPresets();
    var wrapper = document.getElementById('presetPagesWrapper');
    var pagination = document.getElementById('presetPagination');
    wrapper.innerHTML = '';
    pagination.innerHTML = '';

    if (presets.length === 0) {
        wrapper.innerHTML =
            '<div class="preset-page"><div class="preset-empty"><div class="preset-empty-icon" style="display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div><p>暂无世界</p><p style="font-size:12px;">开始游戏后可保存为世界</p></div></div>';
        pagination.innerHTML = '<div class="preset-dot active"></div>';
        return;
    }

    var perPage = 8;
    var totalPages = Math.ceil(presets.length / perPage);
    for (var page = 0; page < totalPages; page++) {
        var pageEl = document.createElement('div');
        pageEl.className = 'preset-page';
        var pagePresets = presets.slice(page * perPage, (page + 1) * perPage);
        pagePresets.forEach(function(preset, idx) {
            var item = document.createElement('div');
            item.className = 'preset-item';
            var globalIdx = page * perPage + idx;
            item.innerHTML =
                '<div class="preset-icon-box"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></div><div class="preset-name">' +
                escapeHtml(preset.name) + '</div>';
            item.addEventListener('click', function() {
                showPresetAction(globalIdx);
            });
            pageEl.appendChild(item);
        });
        wrapper.appendChild(pageEl);
        var dot = document.createElement('div');
        dot.className = 'preset-dot' + (page === 0 ? ' active' : '');
        pagination.appendChild(dot);
    }
    if (!wrapper._hasScrollHandler) {
        wrapper.addEventListener('scroll', function() {
            var scrollLeft = wrapper.scrollLeft;
            var pageWidth = wrapper.clientWidth;
            var currentPage = Math.round(scrollLeft / pageWidth);
            pagination.querySelectorAll('.preset-dot').forEach(function(d, i) {
                d.classList.toggle('active', i === currentPage);
            });
        });
        wrapper._hasScrollHandler = true;
    }
}
function showPresetAction(idx) {
    var presets = getPresets();
    if (!presets[idx]) return;
    var preset = presets[idx];
    var nameEl = document.getElementById('presetActionName');
    var metaEl = document.getElementById('presetActionMeta');
    var emojiEl = document.getElementById('presetActionIcon');
    if (nameEl) nameEl.textContent = preset.name;
    if (metaEl) metaEl.textContent = preset.time || '自定义预设';
    if (emojiEl) emojiEl.textContent = '包';

    // 确保预设有一个专属存档槽位ID
    if (!preset.saveSlotId) {
        // 用预设创建时间戳生成唯一ID，映射到1000+的槽位避免与手动存档冲突
        preset.saveSlotId = 1000 + idx;
        // 尝试用更稳定的hash
        var hash = 0;
        var str = preset.name + (preset.time || '') + (preset.prompt || '');
        for (var ci = 0; ci < str.length; ci++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(ci);
            hash |= 0;
        }
        preset.saveSlotId = 1000 + Math.abs(hash % 9000);
        savePresets(presets);
    }

    // 显示继续旅程按钮
    var continueBtn = document.getElementById('btnPresetContinue');
    if (continueBtn) continueBtn.style.display = 'flex';

    UI.showModal('presetActionModal');

    // 绑定按钮事件
    var newStartBtn = document.getElementById('btnPresetStartNew').cloneNode(true);
    var newEditBtn = document.getElementById('btnPresetEdit').cloneNode(true);
    var newDeleteBtn = document.getElementById('btnPresetDelete').cloneNode(true);
    document.getElementById('btnPresetStartNew').parentNode.replaceChild(newStartBtn, document
        .getElementById('btnPresetStartNew'));
    document.getElementById('btnPresetEdit').parentNode.replaceChild(newEditBtn, document.getElementById(
        'btnPresetEdit'));
    document.getElementById('btnPresetDelete').parentNode.replaceChild(newDeleteBtn, document
        .getElementById('btnPresetDelete'));

    newStartBtn.addEventListener('click', function() {
        UI.hideModal('presetActionModal');
        // 记录当前预设的存档槽位，游戏开始后自动存档到这里
        gameState._currentPresetSlotId = preset.saveSlotId;
        gameState._currentPresetName = preset.name;
        // 填充设定并跳转到世界设定页
        document.getElementById('worldDescription').value = preset.prompt || '';
        var mc = preset.mc || {};
        if (mc.mcName) document.getElementById('setupPlayerName').value = mc.mcName;
        if (mc.mcGender) document.getElementById('setupPlayerGender').value = mc.mcGender;
        if (mc.mcIdentity) document.getElementById('setupPlayerIdentity').value = mc.mcIdentity;
        if (mc.mcAge) document.getElementById('setupPlayerAge').value = mc.mcAge;
        if (mc.mcAppearance) document.getElementById('setupPlayerAppearance').value = mc.mcAppearance;
        if (mc.mcAbility) document.getElementById('setupPlayerAbility').value = mc.mcAbility;
        if (mc.mcPersonality) document.getElementById('setupPlayerDesc').value = mc.mcPersonality;
        UI.showPage('worldSetupPage');
    });

    // 绑定"继续旅程"按钮
    if (continueBtn) {
        var newContinueBtn = continueBtn.cloneNode(true);
        continueBtn.parentNode.replaceChild(newContinueBtn, continueBtn);
        newContinueBtn.style.display = 'flex'; // 始终显示
        newContinueBtn.addEventListener('click', function() {
            // 打开存档列表页面
            showPresetSaveList(preset);
        });
    }

    newEditBtn.addEventListener('click', function() {
        UI.hideModal('presetActionModal');
        // 显示编辑弹窗
        document.getElementById('editPresetName').value = preset.name;
        UI.showModal('editPresetModal');
        var saveBtn = document.getElementById('btnConfirmEditPreset');
        var newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        newSaveBtn.addEventListener('click', function() {
            var name = document.getElementById('editPresetName').value.trim();
            if (!name) {
                UI.toast('请输入预设名称');
                return;
            }
            preset.name = name;
            savePresets(presets);
            UI.hideModal('editPresetModal');
            renderPresetPages();
            UI.toast('已保存');
        });
    });

    newDeleteBtn.addEventListener('click', function() {
        var slotId = preset.saveSlotId;
        presets.splice(idx, 1);
        savePresets(presets);
        UI.hideModal('presetActionModal');
        renderPresetPages();
        // 同时删除关联的存档
        if (slotId) {
            withSaveLock(async function() {
                await SaveDB.set(slotId, null);
            }, 'deletePresetSave:' + slotId).catch(function(e) {
                console.warn('删除预设存档失败:', e);
            });
        }
        UI.toast('已删除');
    });
}
function showPresetSaveList(preset) {
    // 隐藏预设操作面板，显示存档列表
    UI.hideModal('presetActionModal');

    var listBody = document.getElementById('presetSaveListBody');
    var listTitle = document.getElementById('presetSaveListTitle');
    listTitle.textContent = preset.name + ' - 旅程记录';

    // 显示加载中
    listBody.innerHTML =
        '<div style="text-align:center;padding:40px;color:var(--text-secondary);"><div style="font-size:24px;margin-bottom:8px;">⏳</div>加载中...</div>';
    UI.showModal('presetSaveListModal');

    // 绑定返回按钮
    var backBtn = document.getElementById('btnBackToPresetAction');
    var newBackBtn = backBtn.cloneNode(true);
    backBtn.parentNode.replaceChild(newBackBtn, backBtn);
    newBackBtn.addEventListener('click', function() {
        UI.hideModal('presetSaveListModal');
        UI.showModal('presetActionModal');
    });

    // 查询存档
    SaveDB.get(preset.saveSlotId).then(function(saveData) {
        if (saveData && saveData.state) {
            // 有存档，显示存档卡片
            var saveTime = saveData.time || '未知时间';
            var saveName = saveData.name || saveData.prompt || '存档';

            listBody.innerHTML =
                '<div class="pearl-card" style="padding:16px;cursor:pointer;transition:transform 0.2s;" onmouseover="this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.transform=\'none\'">' +
                '<div style="display:flex;align-items:center;gap:12px;">' +
                '<div style="width:48px;height:48px;background:var(--accent-soft);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;font-size:24px;">📚</div>' +
                '<div style="flex:1;">' +
                '<div style="font-size:15px;font-weight:500;color:var(--text);">' + escapeHtml(saveName) +
                '</div>' +
                '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">' +
                escapeHtml(saveTime) + '</div>' +
                '</div>' +
                '<svg class="icon" style="color:var(--text-tertiary);"><use href="#icon-chevron-right"/></svg>' +
                '</div>' +
                '</div>';

            // 绑定点击加载
            listBody.querySelector('.pearl-card').addEventListener('click', function() {
                UI.hideModal('presetSaveListModal');
                loadFromSlot(preset.saveSlotId).then(function() {
                    gameState._currentPresetSlotId = preset.saveSlotId;
                    gameState._currentPresetName = preset.name;
                }).catch(function(e) {
                    console.error('加载预设存档失败:', e);
                    UI.toast('加载存档失败', 'error');
                }).catch(function(err) { console.error('[预设系统] 操作失败:', err); });
            });
        } else {
            // 无存档，显示空状态
            listBody.innerHTML = '<div style="text-align:center;padding:60px 20px;">' +
                '<div style="font-size:48px;margin-bottom:16px;opacity:0.5;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>' +
                '<div style="font-size:16px;color:var(--text);margin-bottom:8px;">暂无旅程记录</div>' +
                '<div style="font-size:13px;color:var(--text-secondary);">点击"开始新旅程"开启你的冒险</div>' +
                '</div>';
        }
    }).catch(function(e) {
        console.error('查询存档失败:', e);
        listBody.innerHTML =
            '<div style="text-align:center;padding:40px;color:var(--text-secondary);">加载失败，请重试</div>';
    }).catch(function(err) { console.error('[预设系统] 操作失败:', err); });
}

// ========================================
// 第12层: 页面初始化和事件
// ========================================
// 通用事件绑定助手：元素不存在时安全跳过（避免 TypeError 连锁中断后续绑定）
// 【统一管理】所有通过 bindEvent/bindEventQuery 绑定的监听都走 GlobalCleanup，
// 页面卸载时统一移除，避免内存泄漏
function bindEvent(id, event, handler, opts) {
    var el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el) {
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('[bindEvent] element not found:', id);
        }
        return false;
    }
    // 【性能优化】防重复绑定：使用 _hasBound 标记，同一元素同一事件只绑定一次
    var bindKey = '_bound_' + event;
    if (el[bindKey]) return true;
    el[bindKey] = true;
    if (typeof GlobalCleanup !== 'undefined' && GlobalCleanup.registerListener) {
        GlobalCleanup.registerListener(el, event, handler, opts);
    } else {
        el.addEventListener(event, handler, opts);
    }
    return true;
}
// 【P2清理】删除 bindEventQuery（全项目零调用）
// 页面加载时自动恢复上次填写的内容
function renderMenu() {
    // 渲染预设页面
    renderPresetPages();
}
function bindEvents() {
    // 防止重复绑定事件
    if (bindEvents._bound) return;
    bindEvents._bound = true;
    // 菜单页头像上传（带大小限制和压缩）
    var menuAvatarUpload = document.getElementById('menuAvatarUpload');
    if (menuAvatarUpload) {
        menuAvatarUpload.addEventListener('change', function(e) {
            var file = e.target.files[0];
            if (!file) return;
            // 图片大小限制：最大2MB
            var maxSize = 2 * 1024 * 1024;
            if (file.size > maxSize) {
                UI.toast('图片太大，请选择小于2MB的图片');
                e.target.value = '';
                return;
            }
            var reader = new FileReader();
            reader.onload = function(ev) {
                // 压缩图片
                var img = new Image();
                img.onload = function() {
                    var canvas = document.createElement('canvas');
                    var ctx = canvas.getContext('2d');
                    var maxDim = 512;
                    var w = img.width;
                    var h = img.height;
                    if (w > maxDim || h > maxDim) {
                        if (w > h) {
                            h = Math.round(h * maxDim / w);
                            w = maxDim;
                        } else {
                            w = Math.round(w * maxDim / h);
                            h = maxDim;
                        }
                    }
                    canvas.width = w;
                    canvas.height = h;
                    ctx.drawImage(img, 0, 0, w, h);
                    var compressedData = canvas.toDataURL('image/jpeg', 0.8);
                    
                    // 保存到gameState
                    if (!gameState.playerData) gameState.playerData = {};
                    gameState.playerData.avatar = compressedData;
                    
                    // 更新UI
                    var imgEl = document.getElementById('menuAvatarImg');
                    var fallbackEl = document.getElementById('menuAvatarFallback');
                    if (imgEl) {
                        imgEl.src = compressedData;
                        imgEl.style.display = 'block';
                    }
                    if (fallbackEl) fallbackEl.style.display = 'none';
                    
                    autoSave();
                    UI.toast('头像已更新');
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        });
    }
    
    // 开始按钮
    var startCard = document.getElementById('menuStartCard');
    startCard.addEventListener('click', function() {
        UI.showPage('worldSetupPage');
    });

    // 记录按钮
    bindEvent('btnMenuRecords', 'click', function() {
        showGameStats();
    });

    // ★ 收藏/记录按钮（原版行为：打开加载存档弹窗，比切换主题更合理）
    bindEvent('menuTopStar', 'click', function() {
        openSaveLoadModal();
    });

    // 生成中取消按钮
    var genCancelBtn = document.getElementById('genCancelBtn');
    if (genCancelBtn) {
        genCancelBtn.addEventListener('click', function() {
            if (isWaiting) {
                safeAbort();
                setWaiting(false);
                hideStoryLoading();
                TypewriterBuffer.stop();
                streamBuffer = '';
                _streamModeLocked = false;
                _streamMode = null;
                if (typeof _streamFullText !== 'undefined') _streamFullText = '';
                UI.toast('已取消生成');
            }
        });
    }

    // 状态栏里的「跳过」按钮（紧挨取消）—— 直接复用 TypewriterBuffer.skip()
    // 显示/隐藏由 core.js 的 _showSkipButton / _hideSkipButton 统一控制
    var genSkipBtn = document.getElementById('genSkipBtn');
    if (genSkipBtn) {
        genSkipBtn.addEventListener('click', function(ev) {
            ev.stopPropagation();
            try {
                if (typeof TypewriterBuffer !== 'undefined') {
                    TypewriterBuffer.skip();
                }
            } catch (e) {
                console.warn('[GenSkipBtn] 跳过失败:', e);
            }
        });
    }

    // 加载存档按钮
    bindEvent('btnMenuLoadLatest', 'click', function() {
        loadFromSlot(0).catch(function(e) {
            console.error('加载存档失败:', e);
            UI.toast('加载失败');
        });
    });

    // API按钮 → API配置
    bindEvent('btnMenuApiSettings', 'click', function() {
        renderAPISettings();
    });

    // 设置按钮 → 游戏设置
    bindEvent('btnMenuGameSettings', 'click', function() {
        if (typeof openSettingsModal === 'function') openSettingsModal();
    });

    // 主页面世界书按钮（已由 WorldInfo.bindEvents 绑定，此处不再重复）
    // 主页面预设按钮（已由 PresetManager.bindEvents 绑定，此处不再重复）

    // 记忆按钮（在导航栏中通过_navBarClickHandler处理）

    // 世界设定页面
    bindEvent('worldSetupBackBtn', 'click', function() {
        UI.showPage('menuPage');
    });

    // 创造世界按钮
    bindEvent('btnCreateWorld', 'click', function() {
        startNewGame();
    });

    // 保存预设按钮
    bindEvent('btnCreatePresetFromSetup', 'click', function() {
        document.getElementById('savePresetName').value = '';
        UI.showModal('savePresetModal');
    });

    // 确认保存预设
    bindEvent('btnConfirmSavePreset', 'click', function() {
        var name = document.getElementById('savePresetName').value.trim();
        if (!name) {
            UI.toast('请输入预设名称');
            return;
        }
        var prompt = document.getElementById('worldDescription').value.trim();
        var mc = {};
        var mcFields = ['setupPlayerName', 'setupPlayerGender', 'setupPlayerIdentity',
            'setupPlayerAge', 'setupPlayerAppearance', 'setupPlayerAbility', 'setupPlayerDesc'
        ];
        var mcMap = {
            setupPlayerName: 'mcName',
            setupPlayerGender: 'mcGender',
            setupPlayerIdentity: 'mcIdentity',
            setupPlayerAge: 'mcAge',
            setupPlayerAppearance: 'mcAppearance',
            setupPlayerAbility: 'mcAbility',
            setupPlayerDesc: 'mcPersonality'
        };
        mcFields.forEach(function(id) {
            var el = document.getElementById(id);
            if (el && el.value.trim()) mc[mcMap[id]] = el.value.trim();
        });
        var presets = getPresets();
        presets.unshift({
            name: name,
            prompt: prompt,
            mc: mc,
            time: new Date().toLocaleString()
        });
        if (presets.length > 20) presets = presets.slice(0, 20);
        savePresets(presets);
        UI.hideModal('savePresetModal');
        renderPresetPages();
        UI.toast('世界已保存');
    });

    // 剧情页面
    bindEvent('btnSaveHeader', 'click', function() {
        openSaveLoadModal();
    });
    bindEvent('btnApiConfigHeader', 'click', function() {
        renderAPISettings();
    });
    bindEvent('btnSettingsHeader', 'click', function() {
        openSettingsModal();
    });
    // 世界书按钮（已由 WorldInfo.bindEvents 绑定，此处不再重复）
    // 预设按钮
    // 预设按钮（已由 PresetManager.bindEvents 绑定，此处不再重复）
    bindEvent('btnUndo', 'click', function() {
        deleteLastTurn();
    });
    bindEvent('btnRetry', 'click', function() {
        retryStory();
    });
    bindEvent('btnContinueGen', 'click', function() {
        continueStory();
    });

    // 自定义行动输入
    bindEvent('customAction', 'keypress', function(e) {
        if (e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            var text = this.value.trim();
            if (!text) return;
            this.value = '';
            this.focus();
            sendAIRequest(text);
        }
    });
    bindEvent('btnSendAction', 'click', function() {
        var input = document.getElementById('customAction');
        var text = input.value.trim();
        if (!text) return;
        input.value = '';
        input.focus();
        sendAIRequest(text);
    });

    // 编辑当前剧情内容（原页面 contenteditable 模式）
    var isEditingStory = false;
    var storyTextBackup = '';
    var editToolbar = null;
    bindEvent('btnEditLastMsg', 'click', function() {
        if (isWaiting) {
            UI.toast('请等待AI回复完成');
            return;
        }

        var storyTextEl = document.getElementById('storyText');
        if (!storyTextEl) return;

        // 如果正在编辑，则取消编辑
        if (isEditingStory) {
            storyTextEl.innerHTML = storyTextBackup;
            storyTextEl.contentEditable = 'false';
            storyTextEl.style.outline = '';
            if (editToolbar && editToolbar.parentNode) editToolbar.parentNode.removeChild(editToolbar);
            editToolbar = null;
            isEditingStory = false;
            document.getElementById('btnEditLastMsg').title = '编辑剧情';
            return;
        }

        if (gameState.conversationHistory.length === 0) {
            UI.toast('暂无可编辑的剧情');
            return;
        }

        // 备份当前HTML
        storyTextBackup = storyTextEl.innerHTML;

        // 开启 contentEditable
        storyTextEl.contentEditable = 'true';
        storyTextEl.style.outline = '2px dashed #07c160';
        storyTextEl.style.outlineOffset = '-2px';

        // 创建浮动工具栏（保存 + 取消）
        editToolbar = document.createElement('div');
        editToolbar.id = 'storyEditToolbar';
        editToolbar.style.cssText = 'position:sticky;top:0;z-index:100;display:flex;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.95);backdrop-filter:blur(8px);border-bottom:1px solid #e5e5e5;border-radius:8px 8px 0 0;margin-bottom:8px;';

        var saveBtn = document.createElement('button');
        saveBtn.textContent = '✓ 保存修改';
        saveBtn.style.cssText = 'padding:6px 14px;background:#07c160;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:500;';
        saveBtn.onclick = function() {
            // 从编辑后的 HTML 中提取纯文本作为新的剧情内容
            var editedText = storyTextEl.innerText || storyTextEl.textContent || '';
            editedText = editedText.trim();

            if (editedText === (storyTextEl.innerText || '')) {
                // 内容没变，检查是否真的没改
            }

            saveUndoState();

            // 把编辑后的完整文本合并为最后一条 assistant 消息
            // 先找到最后一条 assistant 消息的索引
            var lastAssistantIdx = -1;
            for (var i = gameState.conversationHistory.length - 1; i >= 0; i--) {
                if (gameState.conversationHistory[i].role === 'assistant') {
                    lastAssistantIdx = i;
                    break;
                }
            }

            if (lastAssistantIdx >= 0) {
                // 【P1-2修复】将编辑后的文本写回最后一条 assistant 消息
                // 原直接改 gameState.conversationHistory 绕过 StateManager，
                // 导致 StateManager.get('progress.conversationHistory') 返回旧值
                // 现统一走 StateManager.set，_syncLegacyMirror 自动同步到 gameState
                if (typeof StateManager !== 'undefined' && StateManager.get && StateManager.set) {
                    var history = StateManager.get('progress.conversationHistory') || [];
                    if (history.length > 0) {
                        // 找最后一条 assistant 消息（与上面 gameState 查找逻辑一致）
                        var smLastAssistantIdx = -1;
                        for (var j = history.length - 1; j >= 0; j--) {
                            if (history[j].role === 'assistant') {
                                smLastAssistantIdx = j;
                                break;
                            }
                        }
                        if (smLastAssistantIdx >= 0) {
                            history[smLastAssistantIdx].content = editedText;
                            StateManager.set('progress.conversationHistory', history, { silent: true });
                        }
                    }
                } else {
                    gameState.conversationHistory[lastAssistantIdx].content = editedText;
                }
            }

            autoSave();

            // 退出编辑模式
            storyTextEl.contentEditable = 'false';
            storyTextEl.style.outline = '';
            if (editToolbar && editToolbar.parentNode) editToolbar.parentNode.removeChild(editToolbar);
            editToolbar = null;
            isEditingStory = false;
            document.getElementById('btnEditLastMsg').title = '编辑剧情';

            // 重新渲染以同步格式
            renderStory();
            UI.toast('剧情已更新');
        };

        var cancelBtn = document.createElement('button');
        cancelBtn.textContent = '✕ 取消';
        cancelBtn.style.cssText = 'padding:6px 14px;background:#f0f0f0;color:#333;border:none;border-radius:4px;cursor:pointer;font-size:13px;';
        cancelBtn.onclick = function() {
            storyTextEl.innerHTML = storyTextBackup;
            storyTextEl.contentEditable = 'false';
            storyTextEl.style.outline = '';
            if (editToolbar && editToolbar.parentNode) editToolbar.parentNode.removeChild(editToolbar);
            editToolbar = null;
            isEditingStory = false;
            document.getElementById('btnEditLastMsg').title = '编辑剧情';
        };

        editToolbar.appendChild(saveBtn);
        editToolbar.appendChild(cancelBtn);

        // 把工具栏插入到 storyTextEl 最前面
        storyTextEl.insertBefore(editToolbar, storyTextEl.firstChild);

        isEditingStory = true;
        document.getElementById('btnEditLastMsg').title = '取消编辑';
    });

    // 玩家页面返回
    bindEvent('playerBackBtn', 'click', function() {
        UI.goHome();
    });

    // NPC页面返回
    bindEvent('npcBackBtn', 'click', function() {
        UI.goHome();
    });

    // 回顾页面返回
    bindEvent('recapBackBtn', 'click', function() {
        UI.goHome();
    });

    // 回顾导出
    bindEvent('recapExportBtn', 'click', function() {
        exportStoryText();
    });

    // 日志页面返回
    bindEvent('logBackBtn', 'click', function() {
        UI.goHome();
    });

    // 日志子页面返回按钮（已在 renderLogPage 中绑定，此处不再重复）

    // 【修复X13】移除 streamOn/streamOff 事件绑定
    // 这两个元素已从 index.html 中移除（流式开关改由预设面板的 presetStreamToggle 控制）
    // 旧代码每次加载都会打 warn "element not found: streamOn/streamOff"

    // 字体大小
    document.querySelectorAll('[data-fontsize]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('[data-fontsize]').forEach(function(b) {
                b.classList.remove('active');
            });
            this.classList.add('active');
            var sizes = {
                small: 14,
                medium: 16,
                large: 20
            };
            gameState.fontSize = sizes[this.dataset.fontsize] || 16;
            applyFontSize();
            saveGameSettings();
        });
    });

    // 【修复P2-1】统一布尔开关为 switch checkbox，替代双按钮组
    // 自动压缩
    bindEvent('autoCompressToggle', 'change', function() {
        gameState.autoCompress = this.checked;
        saveGameSettings();
    });
    // 增量更新开关
    bindEvent('incrementalToggle', 'change', function() {
        if (typeof EnhancedMemory !== 'undefined') EnhancedMemory.compressionConfig.incrementalUpdate = this.checked;
        UI.toast('增量更新已' + (this.checked ? '开启' : '关闭'));
    });
    // 触发阈值选择
    bindEvent('compressThreshold', 'change', function() {
        if (typeof EnhancedMemory !== 'undefined') EnhancedMemory.compressionConfig.triggerThreshold = parseFloat(this.value);
        // 【修复 P1】同步持久化到 SETTINGS，否则刷新后 loadGameSettings 会用 SETTINGS 旧值覆盖 EnhancedMemory
        saveGameSettings();
        UI.toast('触发阈值已设置为 ' + (this.value * 100) + '%');
    });
    // 【修复P3】移除 btnRollbackSummary 处理器——EnhancedMemory.rollbackSummary 是 stub（恒返回 false），按钮无效
    // 更新压缩统计
    function updateCompressionStats() {
        var statsEl = document.getElementById('compressionStats');
        if (statsEl && typeof EnhancedMemory !== 'undefined') {
            var saved = EnhancedMemory.stats.tokenSaved || 0;
            var historyCount = EnhancedMemory.summaryHistory.length || 0;
            statsEl.textContent = '已节省: ' + saved + ' token | 摘要版本: ' + historyCount;
        }
    }
    updateCompressionStats();

    // AI生成选项开关
    // AI生成选项已移除，始终开启
    gameState.generateChoices = true;

    // 压缩历史
    bindEvent('btnCompressHistory', 'click', function() {
        manualCompress();
    });

    // 【修复P2-3】移除 btnSettingsBackToMenu（与 header 的 btnBackToMenu 重复）
    // 用户关闭设置弹窗后点击 header 返回主页即可

    // 导出为小说
    bindEvent('btnExportNovel', 'click', function() {
        exportAsNovel();
    });

    // 清除数据（分级选择）
    bindEvent('btnSettingsClear', 'click', async function() {
        // 第一次确认：选择清除范围
        var clearAll = await UI.confirm('清除数据', '选择清除范围：\n\n确定 = 清除存档和设置（保留API配置）\n取消 = 仅清除存档（保留设置和API配置）');
        if (!clearAll) {
            // 仅清除存档
            var keysToRemove = [];
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                // 【统一管理】白名单引用 Storage.KEYS，避免拼写错误或遗漏
                if (key && key !== Storage.KEYS.SETTINGS && key !== Storage.KEYS.API_CONFIG && key !== 'free_script_api_provider') {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(function(k) { Storage.remove(k); });
            try { indexedDB.deleteDatabase('BunnyGameDB'); } catch(e) { console.warn('删除IndexedDB失败:', e); }
            location.reload();
            return;
        }
        // 第二次确认：是否清除全部数据（包括API配置）
        var clearEverything = await UI.confirm('清除全部数据', '确定要清除全部数据吗？包括API配置。此操作不可恢复。');
        if (clearEverything) {
            localStorage.clear();
            indexedDB.deleteDatabase('BunnyGameDB');
            location.reload();
        } else {
            // 清除存档和设置，但保留API配置
            var keysToRemove2 = [];
            for (var j = 0; j < localStorage.length; j++) {
                var key2 = localStorage.key(j);
                if (key2 && key2 !== Storage.KEYS.API_CONFIG && key2 !== 'free_script_api_provider') {
                    keysToRemove2.push(key2);
                }
            }
            keysToRemove2.forEach(function(k) { Storage.remove(k); });
            try { indexedDB.deleteDatabase('BunnyGameDB'); } catch(e) { console.warn('删除IndexedDB失败:', e); }
            location.reload();
        }
    });

    // 生成结局
    bindEvent('btnGenerateEnding', 'click', function() {
        generateEnding();
    });

    // 结局页面
    bindEvent('btnEndingHome', 'click', function() {
        UI.showPage('menuPage');
    });

    // 关闭弹窗按钮
    // 【缺陷修复】改用事件委托，让动态插入的 data-close 按钮也能生效
    // 【统一管理】走 GlobalCleanup，页面卸载时统一移除
    GlobalCleanup.registerListener(document, 'click', function(e) {
        var target = e.target.closest('[data-close]');
        if (target) {
            UI.hideModal(target.dataset.close);
        }
    });

    // NPC编辑保存
    bindEvent('npcEditSave', 'click', function() {
        saveNpcEdit();
    });

    // 加载页面取消
    bindEvent('btnLoadingCancel', 'click', function() {
        UI.showPage('worldSetupPage');
    });

    // API配置模态框
    bindEvent('btnCreateApi', 'click', function() {
        showCreateApiModal();
    });
    bindEvent('btnCreateGroup', 'click', function() {
        showCreateGroupModal();
    });
    bindEvent('btnRefreshAllApi', 'click', async function() {
        var btn = this;
        // 如果正在测试中，点击则取消
        if (btn._testing && btn._testAbortCtrl) {
            btn._testAbortCtrl.abort();
            return;
        }
        var configs = LocalGameAPI._configs;
        if (!configs || configs.length === 0) {
            UI.toast('没有API配置');
            return;
        }
        btn.disabled = true;
        btn._testing = true;
        btn._testAbortCtrl = new AbortController();
        var origText = btn.textContent;
        btn.textContent = '点击取消';
        var successList = [];
        var failList = [];
        for (var i = 0; i < configs.length; i++) {
            var cfg = configs[i];
            if (!cfg.baseUrl || !cfg.apiKey) {
                failList.push((cfg.name || 'API' + (i + 1)) + '(配置不全)');
                continue;
            }
            try {
                var result = await LocalGameAPI.testConnection({
                    baseUrl: cfg.baseUrl,
                    apiKey: cfg.apiKey,
                    model: cfg.model || ''
                }, btn._testAbortCtrl.signal);
                if (result.success) {
                    successList.push(cfg.name || 'API' + (i + 1));
                } else {
                    failList.push((cfg.name || 'API' + (i + 1)) + '(' + result.message + ')');
                }
            } catch (e) {
                if (e.name === 'AbortError') {
                    failList.push('测试已取消');
                    break;
                }
                failList.push((cfg.name || 'API' + (i + 1)) + '(' + e.message + ')');
            }
        }
        btn.disabled = false;
        btn._testing = false;
        btn._testAbortCtrl = null;
        btn.textContent = origText;
        renderAPISettings();
        // 显示结果
        var msg = '';
        if (successList.length > 0) msg += '连接成功: ' + successList.join(', ');
        if (failList.length > 0) msg += (msg ? '\n' : '') + '连接失败: ' + failList.join(', ');
        if (!msg) msg = '没有可测试的API';
        UI.toast(msg);
    });

    // 【修复P2-1】统一布尔开关为 switch checkbox，替代双按钮组
    // 自动轮询
    bindEvent('apiAutoRotateToggle', 'change', function() {
        LocalGameAPI.setAutoRotate(this.checked);
    });

    // 题材标签 - 点击后从THEME_LIBRARY选取题材填充描述
    var presetCategoryMap = {
        'xianxia': '修仙玄幻',
        'gongdou': '宫斗权谋',
        'apocalypse': '末日生存',
        'entertainment': '娱乐圈',
        'infinite': '无限流',
        'campus': '校园青春',
        'business': '商战职场',
        'history': '历史架空',
        'fantasy': '奇幻冒险',
        'mystery': '悬疑推理',
        'romance': '恋爱模拟'
    };
    document.querySelectorAll('.world-preset-chip').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.world-preset-chip').forEach(function(b) {
                b.classList.remove('active');
            });
            this.classList.add('active');
            var preset = this.dataset.preset;
            var descEl = document.getElementById('worldDescription');
            if (preset === 'free') {
                if (descEl) descEl.value = '';
                return;
            }
            var category = presetCategoryMap[preset];
            if (!category || !descEl) return;
            var themes = THEME_LIBRARY.filter(function(t) {
                return t.category === category;
            });
            if (themes.length > 0) {
                var hot = themes.find(function(t) {
                    return t.hot;
                }) || themes[0];
                descEl.value = hot.prompt;
            }
        });
    });

    // 【修复P2-1】初始化布尔开关 UI（switch checkbox，替代双按钮组的 active class 切换）
    // 初始化自动轮询UI
    var _apiRotateEl = document.getElementById('apiAutoRotateToggle');
    if (_apiRotateEl) _apiRotateEl.checked = !!LocalGameAPI._autoRotate;

    // 【修复X13】移除 streamOn/streamOff 初始化代码（元素已不存在）
    // 流式开关状态由预设面板的 presetStreamToggle 控制

    // 初始化字体大小UI
    var fontSizes = {
        14: 'small',
        16: 'medium',
        18: 'medium',
        20: 'large'
    };
    var currentFontSize = fontSizes[gameState.fontSize] || 'medium';
    document.querySelectorAll('[data-fontsize]').forEach(function(b) {
        b.classList.toggle('active', b.dataset.fontsize === currentFontSize);
    });

    // 初始化智能压缩UI
    var _autoCompressEl = document.getElementById('autoCompressToggle');
    if (_autoCompressEl) _autoCompressEl.checked = gameState.autoCompress !== false;
    // 初始化增量更新UI
    var _incrementalEl = document.getElementById('incrementalToggle');
    if (_incrementalEl && typeof EnhancedMemory !== 'undefined') {
        _incrementalEl.checked = !!EnhancedMemory.compressionConfig.incrementalUpdate;
    }
}
function startNewGame() {
    var prompt = document.getElementById('worldDescription').value.trim();
    if (!prompt) {
        UI.toast('请描述你想玩的游戏');
        return;
    }

    // ======== 重置所有游戏数据 ========
    // 【修复P1-3】统一调用 resetRuntimeState('full')，替代分散的重置逻辑
    // 此前 startNewGame/loadFromSlot/handleImportFile 三处各自重置不同字段子集，极易字段遗漏
    resetRuntimeState('full');

    // ======== 开始新游戏 ========
    gameState.userPrompt = prompt;

    // 设定分层处理
    if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.processSetupPrompt) {
        EnhancedMemory.processSetupPrompt(gameState.userPrompt);
    }

    // 收集主角设定
    gameState.protagonistSetup = {};
    var mcMap = {
        setupPlayerName: 'mcName',
        setupPlayerGender: 'mcGender',
        setupPlayerIdentity: 'mcIdentity',
        setupPlayerAge: 'mcAge',
        setupPlayerAppearance: 'mcAppearance',
        setupPlayerAbility: 'mcAbility',
        setupPlayerDesc: 'mcPersonality'
    };
    Object.keys(mcMap).forEach(function(id) {
        var el = document.getElementById(id);
        if (el && el.value.trim()) gameState.protagonistSetup[mcMap[id]] = el.value.trim();
    });

    // 收集作者备注（酒馆Author's Note特性）
    var authorsNoteEl = document.getElementById('authorsNote');
    if (authorsNoteEl && authorsNoteEl.value.trim()) {
        gameState.authorsNote = authorsNoteEl.value.trim();
    }

    // 保存上次填写
    Storage.set(Storage.KEYS.LAST_PROMPT, prompt);

    UI.goHome();

    // 延迟初始化游戏，让浏览器先渲染页面（避免页面切换卡顿）
    requestAnimationFrame(function() {
        initializeGame();
    });

    // 触发事件：CHAT_CREATED（创建新聊天）
    if (typeof TavernHelperCompat !== 'undefined') {
        TavernHelperCompat.emit('CHAT_CREATED', {
            chatId: gameState.saveKey || 'default',
            timestamp: Date.now()
        });
    }
}
// --- 生成结局 ---
async function generateEnding() {
    var stories = getStoryList();
    if (stories.length < 3) {
        UI.toast('至少玩3轮再来生成结局');
        return;
    }
    UI.hideModal('settingsModal');
    UI.showPage('endingPage');

    // 【日志页面】弹窗提示：AI 正在生成结局，可取消
    if (typeof UI.showGenerating === 'function') {
        UI.showGenerating('结局', {
            hint: '结局会参考全程记忆与角色关系，生成约需 10-30 秒',
            onCancel: function() {
                if (window._currentAbort) {
                    try { window._currentAbort.abort(); } catch (e) {}
                }
                UI.toast('已取消生成');
            }
        });
    }

    // 延迟生成，让浏览器先渲染页面
    requestAnimationFrame(function() {
        _generateEndingRender(stories);
    });
}
async function _generateEndingRender(stories) {
    document.getElementById('endingLabel').textContent = 'ENDING';
    document.getElementById('endingTitle').textContent = '正在生成结局...';
    document.getElementById('endingNames').textContent = '';
    document.getElementById('endingSummary').innerHTML =
        '<p style="text-align:center;padding:20px;color:var(--text-secondary);">AI正在构思结局...</p>';
    document.getElementById('endingEpilogue').textContent = '';

    try {
        var allText = stories.map(function(it, idx) {
            return '【第' + (idx + 1) + '段】\n' + it.text;
        }).join('\n\n');
        // 【动态化】根据 contextSize 动态计算截断长度，不再硬编码 15000
        // 旧代码截断到 15000 字，长游戏的后半段剧情 AI 看不到，结局生成质量差
        // 新策略：按 contextSize 的 60% 估算（留 40% 给 prompt 和输出），最少 10000 字
        var _ctxSize = (gameState && gameState.contextSize) || 8000;
        var _maxEndingChars = Math.max(10000, Math.floor(_ctxSize * 0.6 * 1.7));
        if (allText.length > _maxEndingChars) allText = allText.substring(0, _maxEndingChars) + '\n\n...（后续内容省略）';

        // 构建角色信息
        var charInfo = '';
        if (gameState.worldSnapshot && gameState.worldSnapshot.characters) {
            charInfo = gameState.worldSnapshot.characters.map(function(c) {
                return c.name + (c.relation ? '（' + c.relation + '）' : '');
            }).join('、');
        }
        var playerName = gameState.playerName || (gameState.worldSnapshot && gameState.worldSnapshot.player && gameState.worldSnapshot.player.name) || '主角';
        var worldTheme = (typeof getCompactSetupForSubFunction === 'function') ? getCompactSetupForSubFunction() : (gameState.userPrompt || '');

        var prompt = '你是一个结局创作专家，你的任务是为这段故事画上一个有深度、有画面感的句号。结局应该与原作世界观和风格一脉相承。\n\n' +
            '【玩家设定】\n' + (worldTheme.trim() || '无') + '\n' +
            '【主角】' + playerName + '\n' +
            '【主要角色】' + (charInfo || '未知') + '\n\n';
        // 注入增强记忆（让结局反映实际剧情发展和角色变化）
        if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.buildSmartInjection) {
            var _endingMemText = EnhancedMemory.buildSmartInjection();
            if (_endingMemText) prompt += '【剧情记忆】\n' + _endingMemText + '\n\n';
        }
        // 注入世界书（让结局风格符合世界设定——P1 修复：结局生成前漏注世界书）
        // 【P1修复BUG-011-世界书入口】删除 `: WorldInfo.buildInjection(...)` 兜底分支
        if (typeof getWorldInfoInjection === 'function') {
            var _endingWI = getWorldInfoInjection();
            var _endingWIText = isObject(_endingWI) ? (_endingWI.text || '') : (_endingWI || '');
            if (_endingWIText) prompt += '【世界知识】\n' + _endingWIText + '\n\n';
        }
        // 【提示词重设计】让 AI 理解「好结局」的质感，再交给它自由发挥
        prompt += '【好结局的样子】\n' +
            '想象你正在给一个故事画句号——标题要让人想点进去看（3-8字，点出核心情感或转折），概述是 1-2 段浓缩旅程意义的文字（与主角的内心变化呼应），后记可以更感性一点（像作者写给读者的悄悄话，留下余韵），names 列出关键角色用顿号分隔。\n' +
            '你理解这是结局——它要和整段旅程呼应，而不是凭空冒出来的随机内容。\n\n' +
            '【程序需要的输出】\n' +
            '你的输出会喂给结局页渲染——保持 JSON 结构，原始文本最稳，markdown 代码块包裹会让玩家看不到内容。\n' +
            '{"title":"结局标题","summary":"结局概述","epilogue":"后记","names":"角色1、角色2、角色3"}\n\n' +
            (typeof getPresetStyleBlock === 'function' ? getPresetStyleBlock() : '') +
            '【剧情】\n' + allText;

        // 【P0边界修复】_useSysprompt=false 时把 system role 转为 user
        var _endingMsg = _applyUseSysprompt([{
            role: 'system',
            content: '你是一位讲故事的人，正在为一段旅程画上有余韵的句号。'
        }, {
            role: 'user',
            content: prompt
        }]);
        var result = await callAI(_endingMsg, {
            stream: false,
            max_tokens: 2048,
            temperature: 0.7
        });
        var parsed = parseJSONHelper(result);
        if (parsed) {
            document.getElementById('endingTitle').textContent = parsed.title || '未知结局';
            document.getElementById('endingNames').textContent = parsed.names || '';
            document.getElementById('endingSummary').innerHTML =
                '<h4>结局概述</h4><p style="font-size:14px;line-height:1.8;">' + escapeHtml(parsed.summary || '') +
                '</p>';
            document.getElementById('endingEpilogue').textContent = parsed.epilogue || '';
        } else {
            document.getElementById('endingTitle').textContent = '旅途的终点';
            document.getElementById('endingSummary').innerHTML =
                '<p style="font-size:14px;line-height:1.8;">' + escapeHtml(result) + '</p>';
        }
    } catch (e) {
        document.getElementById('endingTitle').textContent = '生成失败';
        document.getElementById('endingSummary').innerHTML = '<p style="color:var(--danger);">' + escapeHtml(translateError(e.message)) + '</p>';
    } finally {
        // 【日志页面】结局生成结束（成功/失败/取消）都关闭弹窗
        try { if (typeof UI !== 'undefined' && UI.hideGenerating) UI.hideGenerating(); } catch (e) {}
    }
}
// --- 设置弹窗 ---
// --- 恢复游戏界面 ---
function restoreGame() {
    try {
        UI.showPage('storyPage');

        // 延迟渲染，让浏览器先显示页面（避免页面切换卡顿）
        requestAnimationFrame(function() {
            _restoreGameRender();
        });
    } catch (e) {
        console.error('恢复游戏界面失败:', e);
        UI.toast('存档数据已加载，但界面恢复失败');
        setWaiting(false);
    }
}
function _restoreGameRender() {
    try {
        // 恢复最后一条AI回复的剧情和选项
        var lastAI = null;
        for (var i = gameState.conversationHistory.length - 1; i >= 0; i--) {
            if (gameState.conversationHistory[i].role === 'assistant') {
                lastAI = gameState.conversationHistory[i];
                break;
            }
        }
        if (lastAI) {
            try {
                var result = parseAIResponse(lastAI.content);
                var data = result.data;
                var storyText = result.storyText;
                if (storyText) renderStory(storyText);
                if (data) {
                    if (data.hud) renderHUD(data.hud);
                    if (data.title || data.scene) updateSceneTitle(data.title || data.scene);
                    if (data.choices) renderChoices(data.choices);
                    if (data.player) renderPlayerStats(data.player);
                    // 【P1-1修复】存档恢复路径不重写状态：存档加载时所有实体数据
                    // （characters/bag/quests/relationships）已从存档数据完整恢复到
                    // StateManager.entities 与 gameState 旧字段。此处仅刷新 UI 展示，
                    // 避免 merge*/renderBag(items) 重复触发状态写入（不在 transaction 内，
                    // 无法回滚；且 MERGE 语义可能改变存档已保存的数据顺序与内容）。
                    // renderWorldModules 例外：它是 ui.worldModules 的唯一写入者（无 mutator），
                    // 存档恢复时需重建 UI 模块，故保留 data.world 调用。
                    if (data.characters) renderNpcList();
                    if (data.world) renderWorldModules(data.world);
                    if (data.world && typeof EnhancedMemory !== 'undefined' && EnhancedMemory.longTermMemory.worldNotes.length === 0) {
                        _autoExtractWorldNotes(data.world);
                    }
                    if (data.bag) renderBag();
                    if (data.quests) {
                        renderQuests();
                    }
                    if (data.relationships) {
                        renderRelationships();
                    }
                    // 【修复】保存关键数据到gameState，确保读档后能恢复
                    if (data.title || data.scene) {
                        gameState._lastSceneTitle = data.title || data.scene;
                    }
                    if (data.hud) {
                        gameState._lastHUD = data.hud;
                    }
                    if (data.gameTime) {
                        // 【P1修复BUG-5.7】读档恢复路径统一走 TimeMutator.setTime，避免直接改
                        // gameState.gameTime 绕过状态层；读档切换到不同时间线是合理场景，
                        // 通过 skipMonotonicCheck 跳过单调性校验，避免读档后时间被错误拦截
                        if (typeof TimeMutator !== 'undefined' && TimeMutator.setTime) {
                            var _gtMerged = Object.assign({}, gameState.gameTime || {}, data.gameTime);
                            TimeMutator.setTime(_gtMerged, { silent: true, skipMonotonicCheck: true });
                        } else if (!gameState.gameTime) {
                            gameState.gameTime = {};
                            Object.assign(gameState.gameTime, data.gameTime);
                        }
                    }
                }
                if (!data || !data.choices) {
                    renderChoices([{
                            id: 'A',
                            text: '继续'
                        },
                        {
                            id: 'B',
                            text: '观察四周'
                        },
                        {
                            id: 'C',
                            text: '等待'
                        }
                    ]);
                }
            } catch (parseErr) {
                console.warn('解析最后回复失败:', parseErr);
                document.getElementById('storyText').innerHTML = '<p>存档已恢复，点击「继续」推进剧情。</p>';
                renderChoices([{
                        id: 'A',
                        text: '继续'
                    },
                    {
                        id: 'B',
                        text: '观察四周'
                    },
                    {
                        id: 'C',
                        text: '等待'
                    }
                ]);
            }
        } else {
            document.getElementById('storyText').innerHTML = '<p>存档已恢复。点击选项或输入文字继续游戏。</p>';
            renderChoices([{
                    id: 'A',
                    text: '继续'
                },
                {
                    id: 'B',
                    text: '查看状态'
                },
                {
                    id: 'C',
                    text: '探索'
                }
            ]);
        }

        // 从gameState固定数据渲染
        renderPlayerStats(null);
        renderNpcList();
        renderQuests();
        renderRelationships();
        if (gameState.currentBag && gameState.currentBag.length > 0) renderBag(gameState.currentBag);
        // 恢复场景标题和HUD数据
        if (gameState._lastSceneTitle) {
            updateSceneTitle(gameState._lastSceneTitle);
        } else if (gameState.userPrompt) {
            // 兜底：用用户的世界描述作为标题（截取前20字）
            var fallbackTitle = gameState.userPrompt.replace(/\n/g, ' ').substring(0, 20);
            if (fallbackTitle.length < gameState.userPrompt.length) fallbackTitle += '...';
            updateSceneTitle(fallbackTitle);
        }
        if (gameState._lastHUD) {
            renderHUD(gameState._lastHUD);
        }
        applyFontSize();
        setWaiting(false);

        // 渲染导航栏
        renderNavBar('gameNav', [{
                page: 'storyPage',
                icon: 'icon-book',
                label: '剧情'
            },
            {
                page: 'playerPage',
                icon: 'icon-user',
                label: '个人'
            },
            {
                page: 'npcPage',
                icon: 'icon-users',
                label: '人际'
            },
            {
                page: 'logPage',
                icon: 'icon-grid',
                label: '日志'
            },
            {
                page: 'memoryPage',
                icon: 'icon-sparkles',
                label: '记忆'
            },
            {
                page: 'recapPage',
                icon: 'icon-clock',
                label: '回顾'
            }
        ], 0);
    } catch (e) {
        console.error('_restoreGameRender 渲染失败:', e);
        UI.toast('存档数据已加载，但界面恢复失败');
        setWaiting(false);
    }
}
// --- 默认游戏状态 ---
// --- setWaiting 适配 ---
async function retryStory() {
    if (isWaiting || gameState.conversationHistory.length < 3) return;
    gameState.conversationHistory.pop();
    var lastUserMsg = gameState.conversationHistory.pop();
    if (lastUserMsg) {
        // 【日志页面】弹窗提示：AI 正在重新生成，可取消
        if (typeof UI.showGenerating === 'function') {
            UI.showGenerating('重新生成回复', {
                hint: 'AI 会重新演绎这一段剧情，生成约需 5-20 秒',
                onCancel: function() {
                    if (window._currentAbort) {
                        try { window._currentAbort.abort(); } catch (e) {}
                    }
                    UI.toast('已取消生成');
                }
            });
        } else if (typeof UI !== 'undefined' && UI.toast) {
            UI.toast('正在重新生成...');
        }
        // 防 unhandledrejection：捕获异步错误
        try {
            var p = sendAIRequest(lastUserMsg.content);
            if (p && typeof p.catch === 'function') {
                p.catch(function(e) {
                    if (e && e.name === 'AbortError') return;
                    console.error('[重新生成] 异步操作失败:', e);
                });
            }
        } catch (e) {
            console.error('[重新生成] 同步错误:', e);
        }
    }
}
async function continueStory() {
    if (isWaiting) return;
    // 【日志页面】弹窗提示：AI 正在继续剧情，可取消
    if (typeof UI.showGenerating === 'function') {
        UI.showGenerating('继续剧情', {
            hint: 'AI 会接着上一段剧情继续演绎，生成约需 5-20 秒',
            onCancel: function() {
                if (window._currentAbort) {
                    try { window._currentAbort.abort(); } catch (e) {}
                }
                UI.toast('已取消生成');
            }
        });
    } else if (typeof UI !== 'undefined' && UI.toast) {
        UI.toast('正在继续剧情...');
    }
    // 【修复】使用预设的 continue_nudge_prompt，而非硬编码文本
    var continuePrompt = '[Continue your last message...]';
    var continuePrefill = '';
    try {
        if (typeof PresetManager !== 'undefined' && PresetManager.presets && PresetManager.presets[PresetManager.currentPresetIndex]) {
            var preset = PresetManager.presets[PresetManager.currentPresetIndex];
            if (preset.continue_nudge_prompt) {
                continuePrompt = preset.continue_nudge_prompt;
            }
            // 【酒馆兼容】continue_prefill：继续生成时追加assistant消息引导输出
            if (preset.params && preset.params.continue_prefill) {
                continuePrefill = preset.params.continue_prefill;
            }
        }
    } catch(e) {
        console.warn('[continueStory] 获取 continue_nudge_prompt 失败:', e);
    }
    // 设置 continue_prefill 标记，sendAIRequest 会读取
    gameState._continuePrefill = continuePrefill;
    // 防 unhandledrejection：捕获异步错误
    try {
        var p = sendAIRequest(continuePrompt);
        if (p && typeof p.catch === 'function') {
            p.catch(function(e) {
                if (e && e.name === 'AbortError') return;
                console.error('[继续剧情] 异步操作失败:', e);
            });
        }
        // 【优化·时序修复】_continuePrefill 必须在 sendAIRequest 完成后才清除
        // 旧代码同步清除，但 sendAIRequest 是异步的，AI 请求可能拿不到该值
        // 新代码：在 then/catch 后清除，确保 sendAIRequest 内部能读到
        if (p && typeof p.then === 'function') {
            p.then(function() { gameState._continuePrefill = ''; }).catch(function() { gameState._continuePrefill = ''; });
        } else {
            // 兜底：1秒后清除（防止 sendAIRequest 非 Promise 时标记残留）
            setTimeout(function() { gameState._continuePrefill = ''; }, 1000);
        }
    } catch (e) {
        console.error('[继续剧情] 同步错误:', e);
        gameState._continuePrefill = '';
    }
}
function deleteLastTurn() {
    // 检查撤销历史
    if (gameState._undoHistory && gameState._undoHistory.length > 0) {
        var lastUndo = gameState._undoHistory.pop();
        // 恢复到撤销前的状态
        gameState.conversationHistory = lastUndo.conversationHistory || [];
        // storyHistory 已合并到 conversationHistory
        // 【阶段1统一】撤销时角色恢复：通过 CharacterMutator.setCharacters 写入 StateManager，
        // _syncLegacyMirror 自动维护 gameState.allCharacters 镜像。
        // 原逻辑直接操作 gm.tables.characters（绕过 StateManager 导致 entities.characters 不同步）。
        var _undoChars = lastUndo.allCharacters || {};
        var _undoCharList = Object.keys(_undoChars).map(function(k) { return _undoChars[k]; }).filter(Boolean);
        if (typeof CharacterMutator !== 'undefined' && CharacterMutator.setCharacters) {
            CharacterMutator.setCharacters(_undoCharList, { silent: true });
        }
        // 仍同步 gm.tables.characters（GameMemory 内部缓存，部分旧逻辑读取）
        if (typeof window !== 'undefined' && window.GameMemory && window.GameMemory.tables) {
            var gm = window.GameMemory;
            if (gm.tables.characters) {
                Object.keys(gm.tables.characters).forEach(function(k) { delete gm.tables.characters[k]; });
                Object.keys(_undoChars).forEach(function(k) {
                    try {
                        gm.tables.characters[k] = StateSchema.deepClone(_undoChars[k]);
                    } catch(e) {
                        gm.tables.characters[k] = _undoChars[k];
                    }
                });
            }
        }
        gameState.worldSnapshot = lastUndo.worldSnapshot || {};
        // 【P1-2修复】撤销时统一走 StateManager 写入权威源，_syncLegacyMirror 自动同步旧字段
        // 原直接改 gameState.keyEvents/currentQuests/relationships/currentBag 绕过 StateManager，
        // 导致 StateManager.get 返回旧值（架构违反：StateManager 是权威源）
        if (typeof StateManager !== 'undefined' && StateManager.set) {
            StateManager.set('entities.events', lastUndo.keyEvents || [], { silent: true });
            StateManager.set('entities.quests', lastUndo.currentQuests || [], { silent: true });
            StateManager.set('entities.relationships', lastUndo.relationships || [], { silent: true });
            StateManager.set('entities.bag', lastUndo.currentBag || [], { silent: true });
        } else {
            gameState.keyEvents = lastUndo.keyEvents || [];
            gameState.currentQuests = lastUndo.currentQuests || [];
            gameState.relationships = lastUndo.relationships || [];
            gameState.currentBag = lastUndo.currentBag || [];
        }
        // 【v3审查修复】恢复回合数与场景标题
        if (lastUndo.totalTurns !== undefined && gameState._stats) {
            gameState._stats.totalTurns = lastUndo.totalTurns;
        }
        if (lastUndo.progressTurn !== undefined && typeof StateManager !== 'undefined' && StateManager.set) {
            StateManager.set('progress.turn', lastUndo.progressTurn, { silent: true });
        }
        if (lastUndo.sceneTitle !== undefined) {
            gameState._lastSceneTitle = lastUndo.sceneTitle;
            if (typeof StateManager !== 'undefined' && StateManager.set) {
                StateManager.set('progress.sceneTitle', lastUndo.sceneTitle, { silent: true });
                StateManager.set('progress.lastSceneTitle', lastUndo.sceneTitle, { silent: true });
            }
        }

        // 【数据联通】反向推送到权威源 + 触发 UI 刷新
        if (typeof _pushCurrentBagToGM === 'function') _pushCurrentBagToGM();
        if (typeof _pushCurrentQuestsToGM === 'function') _pushCurrentQuestsToGM();
        if (typeof _pushRelationshipsToGM === 'function') _pushRelationshipsToGM();
        // 【阶段5统一】undo 后 _pushRelationshipsToGM 已把 gameState.relationships 推到 gm.tables
        // 再调用 _syncRelationshipsToGameState 让单一同步点统一更新 StateManager
        if (typeof _syncRelationshipsToGameState === 'function') _syncRelationshipsToGameState();
        if (typeof _pushKeyEventsToGM === 'function') _pushKeyEventsToGM();
        // 【P1修复BUG-2.2】移除 GameLinker.refreshByDataChange：死代码空操作
        // 【v3审查修复】撤销后刷新回合数标签与场景标题，否则 UI 仍显示撤销前的值
        if (typeof updateTurnLabel === 'function') updateTurnLabel();
        if (typeof updateSceneTitle === 'function' && lastUndo.sceneTitle) updateSceneTitle(lastUndo.sceneTitle);

        // 重新渲染
        var lastAI = [...gameState.conversationHistory].reverse().find(m => m.role === 'assistant');
        if (lastAI) {
            var parsed = parseAIResponse(lastAI.content);
            if (parsed.storyText) renderStory(parsed.storyText);
            if (parsed.data && parsed.data.choices) renderChoices(parsed.data.choices);
            else renderChoices([{id: 'A', text: '继续'}, {id: 'B', text: '观察'}, {id: 'C', text: '等待'}]);
        }
        UI.toast('已撤销 (' + gameState._undoHistory.length + '/' + (gameState._MAX_UNDO_HISTORY || 50) + ')');
        autoSave();
        return;
    }
    
    // 原有逻辑：删除最后一轮对话
    if (gameState.conversationHistory.length < 3) {
        UI.toast('已经是最开始了');
        return;
    }
    gameState.conversationHistory.pop();
    gameState.conversationHistory.pop();
    var lastAI = [...gameState.conversationHistory].reverse().find(m => m.role === 'assistant');
    if (lastAI) {
        var parsed = parseAIResponse(lastAI.content);
        if (parsed.storyText) renderStory(parsed.storyText);
        if (parsed.data && parsed.data.choices) renderChoices(parsed.data.choices);
        else renderChoices([{id: 'A', text: '继续'}, {id: 'B', text: '观察'}, {id: 'C', text: '等待'}]);
    }
}

// 保存当前状态到撤销历史（在AI回复前调用）
function saveUndoState() {
    if (!gameState._undoHistory) gameState._undoHistory = [];
    // 【P1-4修复】FIFO 上限：默认 50 条，可通过 _MAX_UNDO_HISTORY 覆盖
    // 每条快照含 conversationHistory + allCharacters + worldSnapshot 等 7 个字段深拷贝，
    // 50 条上限平衡撤销深度与内存占用（200 回合长会话：50 × history 大小，约 5-15MB）
    // 旧注释"限制最多10条"与代码 || 50 不一致，已修正
    if (gameState._undoHistory.length >= (gameState._MAX_UNDO_HISTORY || 50)) {
        gameState._undoHistory.shift(); // 移除最旧的
    }
    // 【优化】structuredClone 对循环引用对象会抛错，添加 try/catch fallback
    // 旧代码 fallback 到 JSON.parse(JSON.stringify()) 也会因循环引用抛错
    // 新代码：先尝试 structuredClone，失败则用安全拷贝（跳过循环引用字段）
    var _safeClone = function(o) {
        if (typeof structuredClone === 'function') {
            try { return structuredClone(o); } catch(e) { /* 循环引用，走 fallback */ }
        }
        try { return JSON.parse(JSON.stringify(o)); } catch(e) {
            // 【优化】最终 fallback：浅拷贝 + 跳过无法序列化的字段
            console.warn('[saveUndoState] 深拷贝失败，使用浅拷贝:', e && e.message);
            var result = Array.isArray(o) ? [] : {};
            for (var k in o) {
                if (typeof o[k] !== 'object' || o[k] === null) {
                    try { result[k] = o[k]; } catch(e2) {}
                }
            }
            return result;
        }
    };
    gameState._undoHistory.push({
        conversationHistory: _safeClone(gameState.conversationHistory),
        allCharacters: _safeClone(gameState.allCharacters || {}),
        worldSnapshot: _safeClone(gameState.worldSnapshot || {}),
        keyEvents: _safeClone(gameState.keyEvents || []),
        currentQuests: _safeClone(gameState.currentQuests || []),
        relationships: _safeClone(gameState.relationships || []),
        currentBag: _safeClone(gameState.currentBag || []),
        // 【v3审查修复】保存回合数与场景标题，否则 deleteLastTurn 恢复对话后
        //   _stats.totalTurns / progress.turn 仍为递增后的值，UI 显示"第 N+1 回合"
        //   但对话内容是回合 N-1 的，回合数与对话严重不同步
        totalTurns: (gameState._stats && gameState._stats.totalTurns) || 0,
        progressTurn: (typeof StateManager !== 'undefined' && StateManager.get) ? StateManager.get('progress.turn') : 0,
        sceneTitle: gameState._lastSceneTitle || (typeof StateManager !== 'undefined' && StateManager.get ? StateManager.get('progress.sceneTitle') : '') || '',
        lastSceneTitle: gameState._lastSceneTitle || '',
        timestamp: Date.now()
    });
}
// --- 恢复上次填写 ---

// --- 恢复上次填写 ---

// ========================================
// 第13层: API配置UI
// ========================================
// --- API配置渲染 ---
function renderAPISettings() {
    UI.showModal('apiConfigModal');
    var container = document.getElementById('apiListContainer');
    if (!container) return;
    var configs = LocalGameAPI._configs;
    var currentSlot = LocalGameAPI._currentSlot;

    if (configs.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>暂无API配置</p></div>';
        return;
    }

    // 检查每个API的连接状态
    var connectionStatus = LocalGameAPI._connectionStatus || {};

    container.innerHTML = configs.map(function(cfg, i) {
        var isCurrent = i === currentSlot;
        var modelDisplay = cfg.model || '未设置';
        var urlDisplay = cfg.baseUrl ? cfg.baseUrl.replace(/^https?:\/\//, '').split('/')[0] :
        '未设置';
        var apiName = cfg.name || 'API ' + (i + 1);
        var isConnected = connectionStatus[i] === true;
        var isFailed = connectionStatus[i] === false;
        // 下架/失败模型只是 UI 提醒，玩家依然能正常用
        var modelIsDeprecated = cfg.model && LocalGameAPI.isModelDeprecated(cfg.model);
        var modelIsFailed = cfg.model && LocalGameAPI.isModelFailed(cfg.model);
        var modelWarnTag = (modelIsDeprecated || modelIsFailed) ?
            ' <span style="color:#e6a23c;font-size:11px;margin-left:4px;" title="下架/失败提醒（依然可用）">△提醒</span>' : '';

        // 红色感叹号图标（连接测试失败）
        var errorIcon = isFailed ?
            '<span style="color:#ff3b30;margin-left:6px;font-size:14px;">!</span>' : '';

        return '<div class="pearl-card api-card" role="button" tabindex="0" style="padding:14px;margin-bottom:10px;cursor:pointer;' +
            (isCurrent ? 'border-color:var(--text);' : '') + (isFailed ? 'border-color:#ff3b30;' :
                '') + '" onclick="showApiDetail(' + i + ')" data-api-index="' + i + '">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<div><div style="font-size:14px;font-weight:500;display:flex;align-items:center;">' +
            escapeHtml(apiName) + errorIcon + '</div>' +
            '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">' +
            escapeHtml(urlDisplay) + ' · ' + escapeHtml(modelDisplay) + modelWarnTag + '</div></div>' +
            (isCurrent ? '<span class="badge badge-primary">使用中</span>' : '') +
            '</div></div>';
    }).join('');

    // 更新分组标签
    var groups = LocalGameAPI.getGroups();
    var groupTabs = document.getElementById('apiGroupTabs');
    if (groupTabs) {
        var tabsHtml = '<button class="tag-btn active" data-group="all">全部</button>' +
            '<button class="tag-btn" data-group="ungrouped">未分组</button>';
        groups.forEach(function(g) {
            var gSafe = escapeHtml(g);
            tabsHtml += '<button class="tag-btn api-group-tab" data-group="' + gSafe + '" data-group-name="' + gSafe + '">' + gSafe + '</button>';
        });
        groupTabs.innerHTML = tabsHtml;
        // 绑定分组tab点击事件
        groupTabs.querySelectorAll('.tag-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                groupTabs.querySelectorAll('.tag-btn').forEach(function(b) {
                    b.classList.remove('active');
                });
                this.classList.add('active');
                var group = this.dataset.group;
                var cards = container.querySelectorAll('.api-card');
                cards.forEach(function(card) {
                    var idx = parseInt(card.dataset.apiIndex);
                    var cfg = LocalGameAPI._configs[idx];
                    if (group === 'all') {
                        card.style.display = '';
                    } else if (group === 'ungrouped') {
                        card.style.display = (!cfg || !cfg.group) ? '' : 'none';
                    } else {
                        card.style.display = (cfg && cfg.group === group) ? '' : 'none';
                    }
                });
            });
        });
        // 绑定自定义分组双击删除事件
        groupTabs.querySelectorAll('.api-group-tab').forEach(function(btn) {
            btn.addEventListener('dblclick', function() {
                var groupName = this.dataset.groupName;
                if (!groupName) return;
                // 【缺陷修复】改用 UI.confirm 替代原生 confirm，与游戏 UI 风格一致
                UI.confirm('删除分组', '确定要删除分组"' + groupName + '"吗？该分组下的API将变为未分组。').then(function(ok) {
                    if (!ok) return;
                    LocalGameAPI.deleteGroup(groupName);
                    renderAPISettings();
                    UI.toast('分组已删除');
                });
            });
        });
    }
}
function showApiDetail(slot) {
    var cfg = LocalGameAPI._configs[slot];
    if (!cfg) return;
    document.getElementById('apiDetailName').textContent = cfg.name || 'API ' + (slot + 1);
    document.getElementById('apiDetailUrl').textContent = cfg.baseUrl || '--';
    document.getElementById('detailApiName').value = cfg.name || '';
    document.getElementById('detailApiUrl').value = cfg.baseUrl || '';
    document.getElementById('detailApiKey').value = cfg.apiKey || '';
    // 确保当前模型在select的option列表中，否则手动添加
    var modelSelect = document.getElementById('detailApiModelSelect');
    var currentModel = cfg.model || '';
    if (currentModel) {
        var hasOption = false;
        for (var oi = 0; oi < modelSelect.options.length; oi++) {
            if (modelSelect.options[oi].value === currentModel) { hasOption = true; break; }
        }
        if (!hasOption) {
            var opt = document.createElement('option');
            opt.value = currentModel;
            opt.textContent = currentModel;
            modelSelect.appendChild(opt);
        }
    }
    modelSelect.value = currentModel;
    document.getElementById('detailApiModelInput').value = currentModel;
    document.getElementById('detailApiGroup').value = cfg.group || '';
    // 加载兼容模式设置
    var compatibleModeCheckbox = document.getElementById('detailApiCompatibleMode');
    if (compatibleModeCheckbox) {
        compatibleModeCheckbox.checked = cfg.compatibleMode === true;
    }
    // 动态填充分组选项
    var groupSelect = document.getElementById('detailApiGroup');
    if (groupSelect) {
        var currentGroup = cfg.group || '';
        groupSelect.innerHTML = '<option value="">未分组</option>';
        LocalGameAPI.getGroups().forEach(function(g) {
            var opt = document.createElement('option');
            opt.value = g;
            opt.textContent = g;
            groupSelect.appendChild(opt);
        });
        groupSelect.value = currentGroup;
    }

    var isCurrent = slot === LocalGameAPI._currentSlot;
    document.getElementById('apiDetailStatusBadge').textContent = isCurrent ? '正在使用' : '未使用';
    document.getElementById('apiDetailStatusBadge').className = 'badge ' + (isCurrent ? 'badge-primary' :
        'badge-soft');
    document.getElementById('apiDetailModel').textContent = cfg.model || '--';

    // 显示请求统计
    var stats = LocalGameAPI.getRequestStats(slot);
    var reqEl = document.getElementById('apiDetailRequests');
    var modelEl = document.getElementById('apiDetailModels');
    if (reqEl) reqEl.textContent = stats.total;
    if (modelEl) modelEl.textContent = stats.modelCount;

    // 显示最近请求
    var recentEl = document.getElementById('apiDetailRecent');
    if (recentEl) {
        if (stats.recentLogs.length > 0) {
            var allLogsHtml = stats.recentLogs.map(function(log) {
                var timeStr = new Date(log.time).toLocaleTimeString();
                var icon = log.success ? '✓' : '✕';
                var errText = log.error ?
                    '<div style="font-size:11px;color:#e74c3c;margin-top:2px;word-break:break-all;">' +
                    escapeHtml(log.error) + '</div>' : '';
                return '<div style="padding:6px 0;border-bottom:1px solid var(--border);">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                    '<span>' + icon + ' ' + escapeHtml(log.model) + '</span>' +
                    '<span style="font-size:11px;color:var(--text-tertiary);">' + timeStr +
                    '</span></div>' + errText + '</div>';
            }).join('');

            if (stats.recentLogs.length > 5) {
                var visibleLogs = stats.recentLogs.slice(0, 5);
                var hiddenLogs = stats.recentLogs.slice(5);
                var visibleHtml = visibleLogs.map(function(log) {
                    var timeStr = new Date(log.time).toLocaleTimeString();
                    var icon = log.success ? '✓' : '✕';
                    var errText = log.error ?
                        '<div style="font-size:11px;color:#e74c3c;margin-top:2px;word-break:break-all;">' +
                        escapeHtml(log.error) + '</div>' : '';
                    return '<div style="padding:6px 0;border-bottom:1px solid var(--border);">' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                        '<span>' + icon + ' ' + escapeHtml(log.model) + '</span>' +
                        '<span style="font-size:11px;color:var(--text-tertiary);">' + timeStr +
                        '</span></div>' + errText + '</div>';
                }).join('');
                var hiddenHtml = hiddenLogs.map(function(log) {
                    var timeStr = new Date(log.time).toLocaleTimeString();
                    var icon = log.success ? '✓' : '✕';
                    var errText = log.error ?
                        '<div style="font-size:11px;color:#e74c3c;margin-top:2px;word-break:break-all;">' +
                        escapeHtml(log.error) + '</div>' : '';
                    return '<div style="padding:6px 0;border-bottom:1px solid var(--border);">' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                        '<span>' + icon + ' ' + escapeHtml(log.model) + '</span>' +
                        '<span style="font-size:11px;color:var(--text-tertiary);">' + timeStr +
                        '</span></div>' + errText + '</div>';
                }).join('');
                recentEl.innerHTML = visibleHtml +
                    '<div id="apiRecentHidden" style="display:none;">' + hiddenHtml + '</div>' +
                    '<div style="text-align:center;padding:6px 0;">' +
                    '<a href="javascript:void(0)" id="apiRecentToggle" ' +
                    'style="font-size:12px;color:var(--primary);cursor:pointer;">展开全部 (' + stats.recentLogs.length + '条)</a>' +
                    '</div>';
                // 绑定展开/折叠
                TimerManager.setTimeout('bindApiToggle', function() {
                    var toggle = document.getElementById('apiRecentToggle');
                    var hidden = document.getElementById('apiRecentHidden');
                    if (toggle && hidden) {
                        toggle.addEventListener('click', function() {
                            var isExpanded = hidden.style.display !== 'none';
                            hidden.style.display = isExpanded ? 'none' : '';
                            toggle.textContent = isExpanded ?
                                '展开全部 (' + stats.recentLogs.length + '条)' : '收起';
                        });
                    }
                }, 50);
            } else {
                recentEl.innerHTML = allLogsHtml;
            }
        } else {
            recentEl.innerHTML = '<span style="color:var(--text-tertiary);">暂无记录</span>';
        }
    }

    // 显示错误日志
    var errorListEl = document.getElementById('apiErrorList');
    if (errorListEl) {
        var errorLogs = LocalGameAPI._requestLog.filter(function(l) {
            return l.slot === slot && !l.success;
        }).slice(-10).reverse();
        if (errorLogs.length > 0) {
            errorListEl.innerHTML = errorLogs.map(function(log) {
                var timeStr = new Date(log.time).toLocaleString();
                return '<div class="pearl-card" style="padding:12px;border-left:3px solid #e74c3c;">' +
                    '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:6px;">' +
                    '<span>' + escapeHtml(log.model) + '</span><span>' + timeStr + '</span></div>' +
                    '<div style="font-size:13px;color:#e74c3c;word-break:break-all;">' + escapeHtml(log
                        .error || '未知错误') + '</div></div>';
            }).join('');
        } else {
            errorListEl.innerHTML =
                '<div class="empty-state">暂无错误记录</div>';
        }
    }

    // 绑定清空最近请求按钮
    var clearRecentBtn = document.getElementById('btnClearApiRecent');
    if (clearRecentBtn) {
        var newClearRecentBtn = clearRecentBtn.cloneNode(true);
        clearRecentBtn.parentNode.replaceChild(newClearRecentBtn, clearRecentBtn);
        newClearRecentBtn.addEventListener('click', function() {
            LocalGameAPI._requestLog = LocalGameAPI._requestLog.filter(function(l) {
                return l.slot !== slot;
            });
            if (recentEl) recentEl.innerHTML = '<span style="color:var(--text-tertiary);">暂无记录</span>';
            UI.toast('已清空该配置的请求记录');
        });
    }

    // 绑定清空错误按钮
    var clearErrorsBtn = document.getElementById('btnClearApiErrors');
    if (clearErrorsBtn) {
        var newClearBtn = clearErrorsBtn.cloneNode(true);
        clearErrorsBtn.parentNode.replaceChild(newClearBtn, clearErrorsBtn);
        newClearBtn.addEventListener('click', function() {
            LocalGameAPI._requestLog = LocalGameAPI._requestLog.filter(function(l) {
                return l.slot !== slot || l.success;
            });
            errorListEl.innerHTML = '<div class="empty-state">暂无错误记录</div>';
            UI.toast('已清空该配置的错误记录');
        });
    }

    UI.showModal('apiDetailModal');

    // 绑定保存按钮
    var saveBtn = document.getElementById('btnSaveApiDetail');
    var newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    newSaveBtn.addEventListener('click', function() {
        var compatibleMode = document.getElementById('detailApiCompatibleMode');
        LocalGameAPI.setConfig(slot, {
            name: document.getElementById('detailApiName').value.trim() || cfg.name,
            baseUrl: document.getElementById('detailApiUrl').value.trim(),
            apiKey: document.getElementById('detailApiKey').value.trim(),
            model: document.getElementById('detailApiModelSelect').value || document
                .getElementById('detailApiModelInput').value.trim(),
            group: document.getElementById('detailApiGroup').value,
            compatibleMode: compatibleMode ? compatibleMode.checked : false
        });
        UI.hideModal('apiDetailModal');
        renderAPISettings();
        UI.toast('已保存');
    });

    // 绑定设为当前按钮
    var setCurrentBtn = document.getElementById('btnSetCurrentApi');
    var newSetCurrentBtn = setCurrentBtn.cloneNode(true);
    setCurrentBtn.parentNode.replaceChild(newSetCurrentBtn, setCurrentBtn);
    newSetCurrentBtn.addEventListener('click', function() {
        LocalGameAPI.setCurrentSlot(slot);
        UI.hideModal('apiDetailModal');
        renderAPISettings();
        UI.toast('已切换');
    });

    // 绑定测试按钮
    var testBtn = document.getElementById('btnTestApiDetail');
    var cancelTestBtn = document.getElementById('btnCancelTestApi');
    var newTestBtn = testBtn.cloneNode(true);
    testBtn.parentNode.replaceChild(newTestBtn, testBtn);
    var newCancelBtn = cancelTestBtn.cloneNode(true);
    cancelTestBtn.parentNode.replaceChild(newCancelBtn, cancelTestBtn);
    var _testAbortCtrl = null;
    newTestBtn.addEventListener('click', async function() {
        newTestBtn.textContent = '测试中...';
        newTestBtn.disabled = true;
        newCancelBtn.style.display = '';

        // 创建 AbortController 用于取消测试
        _testAbortCtrl = new AbortController();

        // 添加try-finally确保按钮状态恢复
        try {
            // 初始化连接状态
            if (!LocalGameAPI._connectionStatus) {
                LocalGameAPI._connectionStatus = {};
            }

            var result = await LocalGameAPI.testConnection({
                baseUrl: document.getElementById('detailApiUrl').value.trim(),
                apiKey: document.getElementById('detailApiKey').value.trim(),
                model: document.getElementById('detailApiModelSelect').value || document
                    .getElementById('detailApiModelInput').value.trim()
            }, _testAbortCtrl.signal);

            // 保存连接状态
            LocalGameAPI._connectionStatus[slot] = result.success;

            UI.toast(result.message);

            // 刷新API列表显示状态
            renderAPISettings();
        } catch (e) {
            if (e.name === 'AbortError') {
                UI.toast('已取消测试');
            } else {
                console.error('测试连接失败:', e);
                UI.toast('测试失败: ' + translateError(e.message || '未知错误'));
            }
        } finally {
            newTestBtn.textContent = '测试连接';
            newTestBtn.disabled = false;
            newCancelBtn.style.display = 'none';
            _testAbortCtrl = null;
        }
    });
    // 绑定取消测试按钮
    newCancelBtn.addEventListener('click', function() {
        if (_testAbortCtrl) {
            _testAbortCtrl.abort();
            _testAbortCtrl = null;
        }
        newTestBtn.textContent = '测试连接';
        newTestBtn.disabled = false;
        newCancelBtn.style.display = 'none';
    });

    // 绑定复制按钮
    var copyBtn = document.getElementById('btnCopyApi');
    var newCopyBtn = copyBtn.cloneNode(true);
    copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);
    newCopyBtn.addEventListener('click', function() {
        var currentModel = document.getElementById('detailApiModelSelect').value || document
            .getElementById('detailApiModelInput').value.trim();
        LocalGameAPI._configs.push({
            name: cfg.name,
            baseUrl: document.getElementById('detailApiUrl').value.trim(),
            apiKey: document.getElementById('detailApiKey').value.trim(),
            model: currentModel,
            models: cfg.models || [],
            group: cfg.group || '',
            compatibleMode: cfg.compatibleMode || false
        });
        LocalGameAPI.save();
        UI.hideModal('apiDetailModal');
        renderAPISettings();
        UI.toast('已复制，可修改模型名');
    });

    // 绑定删除按钮
    var deleteBtn = document.getElementById('btnDeleteApi');
    var newDeleteBtn = deleteBtn.cloneNode(true);
    deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
    newDeleteBtn.addEventListener('click', async function() {
        if (await UI.confirm('删除API', '确定要删除这个API配置吗？')) {
            LocalGameAPI._configs.splice(slot, 1);
            if (LocalGameAPI._currentSlot >= LocalGameAPI._configs.length) {
                LocalGameAPI._currentSlot = Math.max(0, LocalGameAPI._configs.length - 1);
            }
            LocalGameAPI.save();
            UI.hideModal('apiDetailModal');
            renderAPISettings();
            UI.toast('已删除');
        }
    });

    // 绑定tab切换（概览/错误）
    var tabs = document.querySelectorAll('#apiDetailModal [data-api-tab]');
    tabs.forEach(function(tab) {
        var newTab = tab.cloneNode(true);
        tab.parentNode.replaceChild(newTab, tab);
        newTab.addEventListener('click', function() {
            var target = this.getAttribute('data-api-tab');
            tabs.forEach(function(t) {
                t.classList.remove('active');
            });
            this.classList.add('active');
            document.querySelectorAll('#apiDetailModal .edit-panel').forEach(function(p) {
                p.classList.remove('active');
            });
            var panelId = target === 'errors' ? 'apiErrorsPanel' : 'apiOverviewPanel';
            document.getElementById(panelId).classList.add('active');
        });
    });

    // 绑定获取模型列表按钮
    var fetchModelsBtn = document.getElementById('btnFetchModelsDetail');
    if (fetchModelsBtn) {
        var newFetchBtn = fetchModelsBtn.cloneNode(true);
        fetchModelsBtn.parentNode.replaceChild(newFetchBtn, fetchModelsBtn);
        newFetchBtn.addEventListener('click', async function() {
            var url = document.getElementById('detailApiUrl').value.trim();
            var key = document.getElementById('detailApiKey').value.trim();
            if (!url || !key) {
                UI.toast('请先填写接口地址和密钥');
                return;
            }
            newFetchBtn.disabled = true;
            newFetchBtn.textContent = '获取中...';
            try {
                var models = await LocalGameAPI.fetchModels(url, key);
                var select = document.getElementById('detailApiModelSelect');
                // 分类：正常  vs  △ 提醒（已下架/失败）—— 分两组显示
                // 注意：下架/失败模型依然可选、依然能用，仅作提醒
                select.innerHTML = '<option value="">选择模型</option>';
                var normalGroup = document.createElement('optgroup');
                normalGroup.label = '正常模型';
                var warnGroup = document.createElement('optgroup');
                warnGroup.label = '△ 提醒（已下架/近期失败，仍可使用）';
                var warnCount = 0;
                models.forEach(function(m) {
                    var isFailed = LocalGameAPI.isModelFailed(m);
                    var isDeprecated = LocalGameAPI.isModelDeprecated(m);
                    var opt = document.createElement('option');
                    opt.value = m;
                    if (isFailed || isDeprecated) {
                        opt.textContent = m + (isFailed && isDeprecated ? '（下架+失败）' :
                            isDeprecated ? '（已下架）' : '（近期失败）');
                        warnGroup.appendChild(opt);
                        warnCount++;
                    } else {
                        opt.textContent = m;
                        normalGroup.appendChild(opt);
                    }
                });
                select.appendChild(normalGroup);
                select.appendChild(warnGroup);
                if (cfg.model) select.value = cfg.model;
                var msg = '获取到 ' + models.length + ' 个模型';
                if (warnCount > 0) msg += '，' + warnCount + ' 个有提醒（依然可选）';
                UI.toast(msg);
                // 保存可用模型数量到配置
                LocalGameAPI._configs[slot].availableModels = models.length;
                LocalGameAPI.save();
                // 更新显示
                var modelEl = document.getElementById('apiDetailModels');
                if (modelEl) modelEl.textContent = models.length;
            } catch (e) {
                UI.toast(translateError(e.message));
            }
            newFetchBtn.disabled = false;
            newFetchBtn.textContent = '获取模型列表';
        });
    }

    // 绑定失败模型列表按钮
    var failedModelsBtn = document.getElementById('btnFailedModelsDetail');
    if (failedModelsBtn) {
        var newFailedBtn = failedModelsBtn.cloneNode(true);
        failedModelsBtn.parentNode.replaceChild(newFailedBtn, failedModelsBtn);
        newFailedBtn.addEventListener('click', function() {
            var failedModels = LocalGameAPI.getFailedModels();
            var select = document.getElementById('detailApiModelSelect');
            if (failedModels.length === 0) {
                UI.toast('暂无失败模型');
                return;
            }
            // 清空现有选项，只显示失败模型
            select.innerHTML = '<option value="">选择失败模型</option>';
            failedModels.forEach(function(fm) {
                var opt = document.createElement('option');
                opt.value = fm.model;
                opt.textContent = fm.model;
                opt.style.color = '#e74c3c';
                select.appendChild(opt);
            });
            select.value = failedModels[0].model;
            UI.toast('已加载 ' + failedModels.length + ' 个失败模型');
        });
    }

    // 绑定返回按钮
    var backBtn = document.getElementById('apiDetailBack');
    var newBackBtn = backBtn.cloneNode(true);
    backBtn.parentNode.replaceChild(newBackBtn, backBtn);
    newBackBtn.addEventListener('click', function() {
        UI.hideModal('apiDetailModal');
        UI.showModal('apiConfigModal');
    });

    // 绑定刷新按钮（刷新统计数据）
    var refreshBtn = document.getElementById('apiDetailRefresh');
    var newRefreshBtn = refreshBtn.cloneNode(true);
    refreshBtn.parentNode.replaceChild(newRefreshBtn, refreshBtn);
    newRefreshBtn.addEventListener('click', function() {
        var stats = LocalGameAPI.getRequestStats(slot);
        var reqEl = document.getElementById('apiDetailRequests');
        var modelEl = document.getElementById('apiDetailModels');
        if (reqEl) reqEl.textContent = stats.total;
        if (modelEl) modelEl.textContent = stats.modelCount;
        var recentEl = document.getElementById('apiDetailRecent');
        if (recentEl) {
            if (stats.recentLogs.length > 0) {
                recentEl.innerHTML = stats.recentLogs.map(function(log) {
                    var timeStr = new Date(log.time).toLocaleTimeString();
                    var icon = log.success ? '✓' : '✕';
                    var errText = log.error ?
                        '<div style="font-size:11px;color:#e74c3c;margin-top:2px;word-break:break-all;">' +
                        log.error + '</div>' : '';
                    return '<div style="padding:6px 0;border-bottom:1px solid var(--border);">' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                        '<span>' + icon + ' ' + log.model + '</span>' +
                        '<span style="font-size:11px;color:var(--text-tertiary);">' +
                        timeStr + '</span></div>' + errText + '</div>';
                }).join('');
            } else {
                recentEl.innerHTML = '<span style="color:var(--text-tertiary);">暂无记录</span>';
            }
        }
        var errorListEl = document.getElementById('apiErrorList');
        if (errorListEl) {
            var errorLogs = LocalGameAPI._requestLog.filter(function(l) {
                return l.slot === slot && !l.success;
            }).slice(-10).reverse();
            if (errorLogs.length > 0) {
                errorListEl.innerHTML = errorLogs.map(function(log) {
                    var timeStr = new Date(log.time).toLocaleString();
                    return '<div class="pearl-card" style="padding:12px;border-left:3px solid #e74c3c;">' +
                        '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:6px;">' +
                        '<span>' + log.model + '</span><span>' + timeStr + '</span></div>' +
                        '<div style="font-size:13px;color:#e74c3c;word-break:break-all;">' +
                        (log.error || '未知错误') + '</div></div>';
                }).join('');
            } else {
                errorListEl.innerHTML =
                    '<div class="empty-state">暂无错误记录</div>';
            }
        }
        UI.toast('已刷新统计');
    });

    // 密码显示切换
    var togglePwd = document.getElementById('detailApiTogglePwd');
    var newTogglePwd = togglePwd.cloneNode(true);
    togglePwd.parentNode.replaceChild(newTogglePwd, togglePwd);
    newTogglePwd.addEventListener('click', function() {
        var input = document.getElementById('detailApiKey');
        input.type = input.type === 'password' ? 'text' : 'password';
    });
}
function showCreateApiModal() {
    document.getElementById('createApiName').value = '';
    document.getElementById('createApiUrl').value = '';
    document.getElementById('createApiKey').value = '';
    document.getElementById('createApiModelSelect').innerHTML = '<option value="">选择或输入模型</option>';
    document.getElementById('createApiModelInput').value = '';
    document.getElementById('createApiModelInput').style.display = 'none';
    document.getElementById('createApiGroup').innerHTML = '<option value="">未分组</option>';
    var groups = LocalGameAPI.getGroups();
    groups.forEach(function(g) {
        var opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        document.getElementById('createApiGroup').appendChild(opt);
    });
    UI.showModal('createApiModal');

    var confirmBtn = document.getElementById('btnConfirmCreateApi');
    var newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', function() {
        var url = document.getElementById('createApiUrl').value.trim();
        var key = document.getElementById('createApiKey').value.trim();
        if (!url || !key) {
            UI.toast('请填写接口地址和密钥');
            return;
        }
        var model = document.getElementById('createApiModelSelect').value || document
            .getElementById('createApiModelInput').value.trim();
        LocalGameAPI._configs.push({
            name: document.getElementById('createApiName').value.trim(),
            baseUrl: url,
            apiKey: key,
            model: model,
            models: [],
            group: document.getElementById('createApiGroup').value
        });
        LocalGameAPI.save();
        UI.hideModal('createApiModal');
        renderAPISettings();
        UI.toast('API已创建');
    });

    // 密码切换
    var togglePwd = document.getElementById('createApiTogglePwd');
    var newTogglePwd = togglePwd.cloneNode(true);
    togglePwd.parentNode.replaceChild(newTogglePwd, togglePwd);
    newTogglePwd.addEventListener('click', function() {
        var input = document.getElementById('createApiKey');
        input.type = input.type === 'password' ? 'text' : 'password';
    });

    // 获取模型列表
    var fetchBtn = document.getElementById('btnFetchModelsCreate');
    var newFetchBtn = fetchBtn.cloneNode(true);
    fetchBtn.parentNode.replaceChild(newFetchBtn, fetchBtn);
    newFetchBtn.addEventListener('click', async function() {
        var url = document.getElementById('createApiUrl').value.trim();
        var key = document.getElementById('createApiKey').value.trim();
        if (!url || !key) {
            UI.toast('请先填写接口地址和密钥');
            return;
        }
        newFetchBtn.disabled = true;
        try {
            var models = await LocalGameAPI.fetchModels(url, key);
            var select = document.getElementById('createApiModelSelect');
            // 分类：正常  vs  △ 提醒（已下架/失败）—— 分两组显示
            // 下架/失败模型依然可选、依然能用，仅作提醒
            select.innerHTML = '<option value="">选择模型</option>';
            var normalGroup = document.createElement('optgroup');
            normalGroup.label = '正常模型';
            var warnGroup = document.createElement('optgroup');
            warnGroup.label = '△ 提醒（已下架/近期失败，仍可使用）';
            var warnCount = 0;
            models.forEach(function(m) {
                var isFailed = LocalGameAPI.isModelFailed(m);
                var isDeprecated = LocalGameAPI.isModelDeprecated(m);
                var opt = document.createElement('option');
                opt.value = m;
                if (isFailed || isDeprecated) {
                    opt.textContent = m + (isFailed && isDeprecated ? '（下架+失败）' :
                        isDeprecated ? '（已下架）' : '（近期失败）');
                    warnGroup.appendChild(opt);
                    warnCount++;
                } else {
                    opt.textContent = m;
                    normalGroup.appendChild(opt);
                }
            });
            select.appendChild(normalGroup);
            select.appendChild(warnGroup);
            var msg = '获取到 ' + models.length + ' 个模型';
            if (warnCount > 0) msg += '，' + warnCount + ' 个有提醒（依然可选）';
            UI.toast(msg);
        } catch (e) {
            UI.toast(translateError(e.message));
        }
        newFetchBtn.disabled = false;
    });
}
function showCreateGroupModal() {
    document.getElementById('createGroupName').value = '';
    UI.showModal('createGroupModal');

    var confirmBtn = document.getElementById('btnConfirmCreateGroup');
    var newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', function() {
        var name = document.getElementById('createGroupName').value.trim();
        if (!name) {
            UI.toast('请输入分组名称');
            return;
        }
        if (!LocalGameAPI._groups) LocalGameAPI._groups = [];
        LocalGameAPI._groups.push(name);
        LocalGameAPI.save();
        UI.hideModal('createGroupModal');
        renderAPISettings();
        UI.toast('分组已创建');
    });
}

// ========================================
// 第14层: 设置
// ========================================
function saveGameSettings() {
    var fontSizeMap = {
        small: 14,
        medium: 16,
        large: 20
    };
    var activeFont = document.querySelector('[data-fontsize].active');
    gameState.fontSize = activeFont ? (fontSizeMap[activeFont.dataset.fontsize] || 16) : 16;
    // 【修复S1】读取剧情长度设置并同步到gameState.maxTokens
    // 【修复P1-2】统一调用 _syncMaxTokens，替代分散的内联同步
    var storyLengthEl = document.getElementById('settingStoryLength');
    if (storyLengthEl) {
        var len = parseInt(storyLengthEl.value);
        if (len && len >= 100) {
            if (typeof _syncMaxTokens === 'function') {
                _syncMaxTokens(len);
            }
        }
    }
    // 保存字数控制配置
    // 【修复 P0-4】所有字段统一 null 检查，避免元素不存在时崩溃
    var wcMinEl = document.getElementById('wcMin');
    var wcMaxEl = document.getElementById('wcMax');
    var wcParaMinEl = document.getElementById('wcParaMin');
    var wcParaMaxEl = document.getElementById('wcParaMax');
    // 【优化·边界校验】min > max 时自动交换，避免注入矛盾指令给 AI
    var _wcMin = safeInt(wcMinEl ? wcMinEl.value : '', 1500);
    var _wcMax = safeInt(wcMaxEl ? wcMaxEl.value : '', 3000);
    if (_wcMin > _wcMax) { var _tmp = _wcMin; _wcMin = _wcMax; _wcMax = _tmp; }
    var _pcMin = safeInt(wcParaMinEl ? wcParaMinEl.value : '', 15);
    var _pcMax = safeInt(wcParaMaxEl ? wcParaMaxEl.value : '', 17);
    if (_pcMin > _pcMax) { var _tmp2 = _pcMin; _pcMin = _pcMax; _pcMax = _tmp2; }
    gameState.wordCountConfig = {
        enabled: document.getElementById('wcEnabled') ? document.getElementById('wcEnabled').checked : true,
        min: _wcMin,
        max: _wcMax,
        paragraphMin: _pcMin,
        paragraphMax: _pcMax,
        paragraphStyle: document.getElementById('wcParagraphStyle') ? document.getElementById('wcParagraphStyle').value : 'medium',
        perspective: document.getElementById('wcPerspective') ? document.getElementById('wcPerspective').value : 'third_person_limited',
        userPronoun: document.getElementById('wcUserPronoun') ? document.getElementById('wcUserPronoun').value : 'second_person',
        takeover: document.getElementById('wcTakeover') ? document.getElementById('wcTakeover').value : 'closed',
        narrate: document.getElementById('wcNarrate') ? document.getElementById('wcNarrate').value : 'closed',
        pacing: document.getElementById('wcPacing') ? document.getElementById('wcPacing').value : 'steady'
    };
    // 保存默认参数设置（从预设管理器读取，设置页已移除手动输入框）
    var pm = (typeof PresetManager !== 'undefined' && PresetManager.currentParams) ? PresetManager.currentParams : null;
    var defaultParams = {
        contextLength: pm ? (pm.context_length || pm.openai_max_context || 8192) : 8192,
        temperature: pm ? pm.temperature : 0.8,
        topP: pm ? pm.top_p : 0.9,
        topK: pm ? (pm.top_k || 0) : 0,
        frequencyPenalty: pm ? (pm.frequency_penalty || 0) : 0,
        presencePenalty: pm ? (pm.presence_penalty || 0) : 0,
        repeatPenalty: pm ? (pm.repeat_penalty || 1.1) : 1.1
    };
    // 【修复P0-1】不再同步 gameState.temperature——temperature 统一由 PresetManager.currentParams 管理
    // buildAIRequestBody 直接从 PresetManager 读取，gameState.temperature 已废弃
    // 【修复P2-1】从 switch checkbox 读取 autoCompress，替代双按钮组的 active class 判断
    var _autoCompressToggleEl = document.getElementById('autoCompressToggle');
    gameState.autoCompress = _autoCompressToggleEl ? _autoCompressToggleEl.checked : true;
    gameState.summaryThreshold = parseInt(document.getElementById('summaryThreshold') ? document.getElementById('summaryThreshold').value : 6) || 0;
    // 【酒馆预设融合】保存叙事增强设置
    var writingStyleEl = document.getElementById('settingWritingStyle');
    if (writingStyleEl) gameState.writingStyle = writingStyleEl.value;
    var cotModeEl = document.getElementById('settingCotMode');
    if (cotModeEl) gameState.cotMode = cotModeEl.value;
    // 【修复P2-1】移除 anti429Mode UI 读取——该字段是死代码，没有任何代码读取它来影响请求
    // squashSystemMessages 已固定开启，不需要从UI读取
    // === 酒馆预设融合：叙事融合层 v2 ===
    // 章节模式
    var chapterModeEl = document.getElementById('settingChapterMode');
    if (chapterModeEl) gameState.chapterMode = chapterModeEl.value;
    // 【修复P3】squelchRules/npcDescriptionRules 字段已从 createDefaultGameState 移除——死代码
    // NSFW 内容控制应通过自定义风格/设定实现，而非无效的安慰剂开关
    // 摘要阈值从智能压缩区读取（已有summaryThreshold元素）
    gameState.generateChoices = true;
    var _saveResult = Storage.setJSON(Storage.KEYS.SETTINGS, {
        useStream: gameState.useStream,
        // 【修复P0-1】不再导出 gameState.temperature——统一由 PresetManager.currentParams 持久化
        fontSize: gameState.fontSize,
        wordCountConfig: gameState.wordCountConfig,
        autoCompress: gameState.autoCompress,
        summaryThreshold: gameState.summaryThreshold,
        generateChoices: gameState.generateChoices,
        maxTokens: gameState.maxTokens,
        // 【修复P0-3】持久化 compressThreshold，此前不保存导致刷新后 UI 显示 80% 但实际用 92%
        compressThreshold: (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.compressionConfig) ? EnhancedMemory.compressionConfig.triggerThreshold : 0.92,
        defaultParams: defaultParams,
        // 【酒馆预设融合】叙事增强设置
        writingStyle: gameState.writingStyle,
        cotMode: gameState.cotMode,
        // === 酒馆预设融合 v2 ===
        chapterMode: gameState.chapterMode,
        narrativeEyes: gameState.narrativeEyes,
        // 【修复P2-3】不再导出 squelchRules——死代码，UI 已移除
        presetArchetype: gameState.presetArchetype
    });
    applyFontSize();
    // 【修复 P2】检查 Storage.setJSON 返回值，配额超限时提示用户而非虚假"保存成功"
    if (_saveResult && _saveResult.success === false) {
        if (typeof UI !== 'undefined' && UI.toast) UI.toast('保存失败：存储空间不足，请导出存档后清理');
        console.warn('[saveGameSettings] 存储失败:', _saveResult.error);
        return;
    }
    // 保存成功提示
    if (typeof UI !== 'undefined' && UI.toast) UI.toast('设置已保存');
}
(function() {
    if (!document.getElementById('importFileInput')) {
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.id = 'importFileInput';
        inp.accept = '.json';
        inp.style.display = 'none';
        inp.addEventListener('change', handleImportFile);
        document.body.appendChild(inp);
    }
})();

// 【修复P1-2】统一 max_tokens 同步入口——此前 max_tokens 有 4 重表示（PresetManager.currentParams.max_tokens / gameState.maxTokens / settingStoryLength / presetMaxTokens），
// 同步逻辑分散在 6 处，任何一处遗漏都会导致"请求用的长度"和"压缩计算用的长度"不一致。
// 现在统一调用 _syncMaxTokens()，从 PresetManager.currentParams.max_tokens（唯一源）同步到其他 3 处。
function _syncMaxTokens(value) {
    var mt = value != null ? value :
        (typeof PresetManager !== 'undefined' && PresetManager.currentParams ?
            (PresetManager.currentParams.max_tokens != null ? PresetManager.currentParams.max_tokens : 8192) : 8192);
    // 1. 同步 PresetManager（如果 value 是外部传入的）
    if (value != null && typeof PresetManager !== 'undefined' && PresetManager.currentParams) {
        PresetManager.currentParams.max_tokens = mt;
    }
    // 2. 同步 gameState.maxTokens（压缩计算用）
    if (typeof gameState !== 'undefined' && gameState) {
        gameState.maxTokens = mt;
    }
    // 3. 同步 settingStoryLength（设置页 UI）
    var storyLengthEl = document.getElementById('settingStoryLength');
    if (storyLengthEl) storyLengthEl.value = mt;
    // 4. 同步 presetMaxTokens（预设管理器 UI）
    var maxTokensEl = document.getElementById('presetMaxTokens');
    if (maxTokensEl) maxTokensEl.value = mt;
}

// === 推荐档位切换 ===
// 【修复P1-1】合并双预设系统——此前 applyParamPreset（game.js）和 applyArchetype（phone-ui.js）
// 是两套独立的预设系统，字段重叠但不完全一致，需要 SAMPLING_PARAMS_BASELINE 重置补丁避免互相污染。
// 现在统一为 UNIFIED_PRESETS 单一预设表，两个函数都从它读取，天然无残留问题。
// 字段集：temperature/top_p/top_k/frequency_penalty/presence_penalty/max_tokens/repeat_penalty
var UNIFIED_PRESETS = {
    // 短篇档（= applyParamPreset.conservative = applyArchetype.conservative）
    conservative: {
        temperature: 0.88, top_p: 0.88, top_k: 0,
        frequency_penalty: 0.2, presence_penalty: 0.2,
        max_tokens: 4096, repeat_penalty: 1.1,
        _label: '📘 短篇', _name: '低温稳定',
        _desc: '低温+低惩罚，输出稳定可控，适合需要一致性的叙事'
    },
    // 中篇档（= applyParamPreset.balanced = applyArchetype.natural）
    natural: {
        temperature: 1.3, top_p: 0.91, top_k: 64,
        frequency_penalty: 0, presence_penalty: 0,
        max_tokens: 8192, repeat_penalty: 1.1,
        _label: '📗 中篇', _name: '均衡自然',
        _desc: '中高温+TopK，输出自然丰富，适合大多数场景'
    },
    // 长篇档（= applyParamPreset.creative = applyArchetype.passionate）
    passionate: {
        temperature: 1.71, top_p: 0.9, top_k: 0,
        frequency_penalty: 0.65, presence_penalty: 0.75,
        max_tokens: 8192, repeat_penalty: 1.1,
        _label: '📙 长篇', _name: '高温创意',
        _desc: '超高温+高惩罚，输出极具创意，适合长篇叙事'
    },
    // 细腻档（= applyArchetype.delicate，与 conservative 采样参数相同，仅语义不同）
    delicate: {
        temperature: 0.88, top_p: 0.88, top_k: 0,
        frequency_penalty: 0.2, presence_penalty: 0.2,
        max_tokens: 4096, repeat_penalty: 1.1,
        _label: '📕 细腻', _name: '低温细腻',
        _desc: '克制含蓄，适合日常情感'
    },
    // 默认档（= applyParamPreset.default）
    default: {
        temperature: 0.8, top_p: 0.9, top_k: 0,
        frequency_penalty: 0, presence_penalty: 0,
        max_tokens: 4096, repeat_penalty: 1.1,
        _label: '⚙️ 默认', _name: '默认参数',
        _desc: 'Free-Script 默认参数'
    }
};
// 兼容别名：applyParamPreset 历史使用 balanced/creative 等名称，映射到统一预设
var PRESET_ALIASES = {
    balanced: 'natural',
    creative: 'passionate'
};
// 【修复P1-1】统一的参数应用函数——applyParamPreset 和 applyArchetype 都调用它
// 从 UNIFIED_PRESETS 读取完整字段集，一次性写入 PresetManager，无需 baseline 重置
function _applyUnifiedPreset(presetKey, opts) {
    var key = PRESET_ALIASES[presetKey] || presetKey;
    var p = UNIFIED_PRESETS[key];
    if (!p) return false;
    // 写入 PresetManager（这是 callAI 真正读取的源）
    if (typeof PresetManager !== 'undefined' && PresetManager.currentParams) {
        PresetManager.currentParams.temperature = p.temperature;
        PresetManager.currentParams.top_p = p.top_p;
        PresetManager.currentParams.top_k = p.top_k;
        PresetManager.currentParams.frequency_penalty = p.frequency_penalty;
        PresetManager.currentParams.presence_penalty = p.presence_penalty;
        PresetManager.currentParams.max_tokens = p.max_tokens;
        PresetManager.currentParams.repeat_penalty = p.repeat_penalty;
        if (typeof PresetManager.saveCurrentParams === 'function') PresetManager.saveCurrentParams();
        if (typeof PresetManager.syncParamsToUI === 'function') PresetManager.syncParamsToUI();
    }
    // 同步 max_tokens 到 gameState（压缩计算用）和 UI
    // 【修复P1-2】统一调用 _syncMaxTokens，替代分散的内联同步
    if (typeof _syncMaxTokens === 'function') {
        _syncMaxTokens(p.max_tokens);
    } else {
        // fallback：直接同步
        if (typeof gameState !== 'undefined' && gameState) {
            gameState.maxTokens = p.max_tokens;
        }
        var elMaxTokens = document.getElementById('settingStoryLength');
        if (elMaxTokens) elMaxTokens.value = p.max_tokens;
    }
    // 可选：更新 presetArchetype（仅 applyArchetype 调用时）
    if (opts && opts.setArchetype && typeof gameState !== 'undefined') {
        gameState.presetArchetype = key;
    }
    // 可选：UI 卡片高亮（仅 applyArchetype 调用时）
    if (opts && opts.updateCardHighlight) {
        document.querySelectorAll('.archetype-card').forEach(function(el) {
            el.classList.toggle('active', el.getAttribute('data-archetype') === key);
        });
    }
    return true;
}
function applyArchetype(name) {
    if (!_applyUnifiedPreset(name, { setArchetype: true, updateCardHighlight: true })) return;
    var p = UNIFIED_PRESETS[PRESET_ALIASES[name] || name];
    if (p && typeof UI !== 'undefined' && UI.toast) {
        UI.toast('已切换到「' + p._label + '」写法（导入他人预设时会被覆盖）');
    }
}

// === 触发剧情助手 ===
// 让 AI 自动完成剧情总结/检查等体力活
function triggerGrandSummary(mode) {
    if (typeof gameState === 'undefined') return;
    var messages = [];
    var userInput = '';
    var modeLabel = '';
    if (mode === 'chapter') {
        modeLabel = '本章剧情';
        userInput = '【系统指令】请对最近一轮的剧情进行【本章大总结】。' +
                    '停止推进剧情，输出以下结构：\n' +
                    '- 核心事件（按时间顺序）\n' +
                    '- 角色关系变化\n' +
                    '- 关键物品/约定\n' +
                    '- 世界状态更新\n' +
                    '使用简洁陈述句，避免修饰，保留重要细节。';
    } else if (mode === 'full') {
        modeLabel = '全部剧情';
        userInput = '【系统指令】请对全部历史剧情进行【全文大总结】。' +
                    '停止推进剧情，输出以下结构：\n' +
                    '- 时间线（按日期组织）\n' +
                    '- 核心事件汇总\n' +
                    '- 角色关系发展\n' +
                    '- 关键转折点\n' +
                    '- 当前世界状态\n' +
                    '使用简洁陈述句，按逻辑顺序组织信息。';
    } else if (mode === 'check') {
        modeLabel = '剧情连贯性';
        userInput = '【系统指令】请对最近10轮剧情进行【连贯性检查】。' +
                    '检查以下方面：\n' +
                    '- 角色行为是否一致\n' +
                    '- 时间线是否合理\n' +
                    '- 是否存在前后矛盾\n' +
                    '- 是否有未解决的伏笔\n' +
                    '输出检查报告，不要推进剧情。';
    }
    if (!userInput) return;
    // 【日志页面】弹窗提示：AI 正在生成总结，可取消
    if (typeof UI.showGenerating === 'function') {
        UI.showGenerating(modeLabel + '总结', {
            hint: '总结会扫描全剧情记录，生成约需 5-20 秒',
            onCancel: function() {
                if (window._currentAbort) {
                    try { window._currentAbort.abort(); } catch (e) {}
                }
                UI.toast('已取消生成');
            }
        });
    } else if (typeof UI !== 'undefined' && UI.toast) {
        UI.toast('正在生成「' + modeLabel + '」总结...');
    }
    // 直接调用 sendAIRequest
    if (typeof sendAIRequest === 'function') {
        sendAIRequest(userInput, false);
    } else {
        // 兜底：写入 conversationHistory
        if (gameState.conversationHistory) {
            gameState.conversationHistory.push({ role: 'user', content: userInput });
        }
    }
}
async function exportSaves() {
    try {
        // 【阶段二】导出走全局存档锁，避免与写入操作并发
        var allSaves = await withSaveLock(async function() {
            return await SaveDB.getAll();
        }, 'exportSaves');
        if (Object.keys(allSaves).length === 0) {
            UI.toast('当前没有任何存档可导出');
            return;
        }
        var exportData = {
            _exportInfo: {
                game: 'freeScript',
                version: 1,
                exportTime: new Date().toLocaleString(),
                slotCount: Object.keys(allSaves).length
            },
            saves: allSaves
        };
        UI.downloadJSON(exportData, '自由剧本存档_' + new Date().toISOString().slice(0, 10) + '.json');
        UI.toast('已导出 ' + Object.keys(allSaves).length + ' 个存档');
    } catch (e) {
        UI.toast('导出失败：' + translateError(e.message));
        console.error('导出失败:', e);
    }
}
async function handleImportFile(e) {
    var file = e.target.files[0];
    e.target.value = '';
    // 重置，允许再次选同一文件
    if (!file) return;
    try {
        var text = await file.text();
        var data = JSON.parse(text);
        // 兼容两种格式：有 _exportInfo 包装 和 直接的 saves 对象
        var saves = null;
        if (data._exportInfo && data.saves) {
            saves = data.saves;
        } else if (data['0'] || data['1'] || data['2']) {
            // 直接就是 {slot: saveData} 格式
            saves = data;
        } else {
            UI.toast('文件格式不正确');
            return;
        }
        var slots = Object.keys(saves);
        if (slots.length === 0) {
            UI.toast('存档文件中没有有效存档');
            return;
        }
        // 验证每个存档的基本结构
        var validCount = 0;
        for (var k = 0; k < slots.length; k++) {
            var s = saves[slots[k]];
            if (s && s.state && s.time) validCount++;
        }
        if (validCount === 0) {
            UI.toast('存档文件中没有有效数据');
            return;
        }
        var msg = '发现 ' + validCount + ' 个存档。\n\n【确定】= 覆盖导入（清空现有存档）\n【取消】= 选择合并模式';
        var overwrite = await UI.confirm('导入存档', msg);
        var merge = false;
        if (!overwrite) {
            merge = await UI.confirm('合并导入', '确认以【合并模式】导入？（不会覆盖已有存档）');
            if (!merge) return;
        }
        // 【阶段二】实际写入走全局存档锁，UI 确认在锁外完成
        await withSaveLock(async function() {
            if (overwrite) {
                // 覆盖模式
                for (var i = 0; i < slots.length; i++) {
                    var slot = parseInt(slots[i]);
                    if (!isNaN(slot) && saves[slots[i]]) {
                        await SaveDB.set(slot, saves[slots[i]]);
                    }
                }
                UI.toast('覆盖导入完成');
            } else if (merge) {
                // 合并模式
                var imported = 0;
                for (var j = 0; j < slots.length; j++) {
                    var mSlot = parseInt(slots[j]);
                    if (isNaN(mSlot) || !saves[slots[j]]) continue;
                    var existing = await SaveDB.get(mSlot);
                    if (!existing) {
                        await SaveDB.set(mSlot, saves[slots[j]]);
                        imported++;
                    }
                }
                UI.toast('合并导入完成');
            }
        }, 'handleImportFile');
        renderSaveUI();
    } catch (e) {
        UI.toast('导入失败：' + translateError(e.message));
        console.error('导入失败:', e);
    }
}
// 【修复】将字数控制配置同步到设置 UI 的通用方法
// 从传入的 wordCountConfig 回填所有 wc* 控件，确保打开设置弹窗时显示已保存的值
function _syncWordCountConfigToUI(wc) {
    if (!wc) return;
    var get = function(id) { return document.getElementById(id); };
    if (get('wcEnabled')) get('wcEnabled').checked = wc.enabled !== false;
    if (get('wcMin')) get('wcMin').value = wc.min || 1500;
    if (get('wcMax')) get('wcMax').value = wc.max || 3000;
    if (get('wcParaMin')) get('wcParaMin').value = wc.paragraphMin || 15;
    if (get('wcParaMax')) get('wcParaMax').value = wc.paragraphMax || 17;
    if (get('wcParagraphStyle')) get('wcParagraphStyle').value = wc.paragraphStyle || 'medium';
    if (get('wcPerspective')) get('wcPerspective').value = wc.perspective || 'third_person_limited';
    if (get('wcUserPronoun')) get('wcUserPronoun').value = wc.userPronoun || 'second_person';
    if (get('wcTakeover')) get('wcTakeover').value = wc.takeover || 'closed';
    if (get('wcNarrate')) get('wcNarrate').value = wc.narrate || 'closed';
    if (get('wcPacing')) get('wcPacing').value = wc.pacing || 'steady';
}

// 【修复 P1】将已保存的设置同步到设置弹窗 UI（除 wordCountConfig 外的其他控件）
// openSettingsModal 和 loadGameSettings 共用，避免两处回填逻辑分叉
function _syncSettingsToUI(d) {
    var get = function(id) { return document.getElementById(id); };
    // 没有已保存数据时，从 gameState 取当前值
    if (!d) {
        d = {
            writingStyle: gameState.writingStyle,
            cotMode: gameState.cotMode,
            chapterMode: gameState.chapterMode,
            narrativeEyes: gameState.narrativeEyes,
            presetArchetype: gameState.presetArchetype,
            summaryThreshold: gameState.summaryThreshold,
            autoCompress: gameState.autoCompress,
            compressThreshold: (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.compressionConfig) ? EnhancedMemory.compressionConfig.triggerThreshold : 0.92
        };
    }
    // 叙事增强
    if (d.writingStyle !== undefined) { var ws = get('settingWritingStyle'); if (ws) ws.value = d.writingStyle || ''; }
    if (d.cotMode !== undefined) { var cm = get('settingCotMode'); if (cm) cm.value = d.cotMode || ''; }
    // 章节模式
    if (d.chapterMode !== undefined) { var chm = get('settingChapterMode'); if (chm) chm.value = d.chapterMode || 'off'; }
    // 视角开关（narrativeEyes）
    if (d.narrativeEyes && typeof d.narrativeEyes === 'object') {
        document.querySelectorAll('.narrative-eye-toggle').forEach(function(cb) {
            var eye = cb.getAttribute('data-eye');
            if (eye && d.narrativeEyes[eye] !== undefined) cb.checked = !!d.narrativeEyes[eye];
        });
    }
    // 原型卡（presetArchetype）
    if (d.presetArchetype !== undefined) {
        document.querySelectorAll('.archetype-card').forEach(function(el) {
            el.classList.toggle('active', el.getAttribute('data-archetype') === d.presetArchetype);
        });
    }
    // 摘要阈值
    if (d.summaryThreshold !== undefined) { var st = get('summaryThreshold'); if (st) st.value = d.summaryThreshold; }
    // 自动压缩开关
    if (d.autoCompress !== undefined) { var ac = get('autoCompressToggle'); if (ac) ac.checked = d.autoCompress !== false; }
    // 压缩触发阈值
    if (d.compressThreshold !== undefined) {
        var ct = get('compressThreshold');
        if (ct) ct.value = d.compressThreshold;
    }
}

function openSettingsModal() {
    // 更新上下文信息
    var msgCount = gameState.conversationHistory ? gameState.conversationHistory.length : 0;
    var estimated = estimateTokensForMessagesUtil(gameState.conversationHistory);
    var contextInfo = document.getElementById('contextInfo');
    if (contextInfo) contextInfo.textContent = '上下文: ' + msgCount + ' 条 | 约 ' + (estimated > 1000 ? (
        estimated / 1000).toFixed(1) + 'k' : estimated) + ' token';

    // 更新剧情长度
    var lengthEl = document.getElementById('settingStoryLength');
    // 【修复P1-2】统一默认值为 4096，与全局一致（此前这里是 2048，与 PresetManager 默认 4096 不一致）
    if (lengthEl) lengthEl.value = gameState.maxTokens || 4096;

    // 【修复P3】移除 7 个死 ID 引用——settingContextLength/settingTemperature/settingTopP/settingTopK/
    // settingFreqPen/settingPresPen/settingRepeatPen 在 HTML 中均不存在（参数由预设管理器控制）

    // 【修复 P0】回填字数控制 UI——此前 openSettingsModal 不回填，导致每次打开都显示 HTML 默认值
    // 优先从 Storage 读取用户上次保存的值（避免被预设加载覆盖），回退到 gameState.wordCountConfig
    var _savedSettings = null;
    try {
        var _raw = Storage.get(Storage.KEYS.SETTINGS);
        if (_raw) _savedSettings = JSON.parse(_raw);
    } catch (e) { /* 读取失败时回退到 gameState */ }
    var _savedWc = (_savedSettings && _savedSettings.wordCountConfig) ? _savedSettings.wordCountConfig : null;
    _syncWordCountConfigToUI(_savedWc || gameState.wordCountConfig);

    // 【修复 P1】回填其他设置控件——与 wordCountConfig 同类问题，打开弹窗时也需从 Storage 回填
    // 否则用户改了不保存就关闭，下次打开看到的是 DOM 残留而非已保存值
    _syncSettingsToUI(_savedSettings);

    // 显示设置弹窗
    UI.showModal('settingsModal');
}
// --- saveGameSettings 适配（已删除，使用上方完整实现） ---

// --- loadGameSettings 适配 ---
function loadGameSettings() {
    var s = Storage.get(Storage.KEYS.SETTINGS);
    var defaultParams = null;
    if (s) {
        try {
            var d = JSON.parse(s);
            // 【修复P0-1】不再恢复 gameState.temperature——统一由 PresetManager.currentParams 管理
            gameState.fontSize = d.fontSize || 16;
            gameState.autoCompress = d.autoCompress !== false;
            gameState.summaryThreshold = d.summaryThreshold !== undefined ? d.summaryThreshold : 6;
            gameState.useStream = d.useStream !== false;
            gameState.generateChoices = true;
            if (d.maxTokens) gameState.maxTokens = d.maxTokens;
            // 加载默认参数设置
            if (d.defaultParams) defaultParams = d.defaultParams;
            // 加载字数控制配置
            if (d.wordCountConfig) gameState.wordCountConfig = Object.assign(gameState.wordCountConfig || {}, d.wordCountConfig);
            if (gameState.wordCountConfig) {
                _syncWordCountConfigToUI(gameState.wordCountConfig);
            }
            // 【修复P0-3】恢复 compressThreshold 到 UI 和 EnhancedMemory
            // 此前不恢复导致刷新后 UI 显示 80%（HTML 默认）但实际压缩用 92%（EnhancedMemory 默认）
            var _savedThreshold = d.compressThreshold !== undefined ? d.compressThreshold : 0.92;
            if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.compressionConfig) {
                EnhancedMemory.compressionConfig.triggerThreshold = _savedThreshold;
            }
            // 【酒馆预设融合】恢复叙事增强设置
            if (d.writingStyle !== undefined) gameState.writingStyle = d.writingStyle;
            if (d.cotMode !== undefined) gameState.cotMode = d.cotMode;
            // 【修复P2-1】不再恢复 anti429Mode——死代码已移除
            // squashSystemMessages 固定开启，不再从存档恢复（预设可覆盖）
            // === 酒馆预设融合 v2 恢复 ===
            if (d.chapterMode !== undefined) gameState.chapterMode = d.chapterMode;
            // 【修复P3】不再恢复 npcDescriptionRules——死代码字段已从 createDefaultGameState 移除
            if (d.narrativeEyes && typeof d.narrativeEyes === 'object') {
                gameState.narrativeEyes = d.narrativeEyes;
            }
            if (d.presetArchetype !== undefined) gameState.presetArchetype = d.presetArchetype;
            // 【修复 P1】统一回填设置 UI（summaryThreshold/compressThreshold/writingStyle/cotMode/
            // chapterMode/narrativeEyes/presetArchetype/autoCompressToggle），与 openSettingsModal 共用
            _syncSettingsToUI({
                summaryThreshold: gameState.summaryThreshold,
                compressThreshold: _savedThreshold,
                writingStyle: gameState.writingStyle,
                cotMode: gameState.cotMode,
                chapterMode: gameState.chapterMode,
                narrativeEyes: gameState.narrativeEyes,
                presetArchetype: gameState.presetArchetype,
                autoCompress: gameState.autoCompress
            });
        } catch (e) {
            console.warn('加载设置失败，使用默认值:', e);
        }
    }
    // 恢复默认参数（设置页已移除手动输入框，参数由预设管理器控制）
    // 如果预设未加载且有保存的默认参数，同步到PresetManager
    var hasPresetLoaded = (typeof PresetManager !== 'undefined' && PresetManager.currentPresetIndex >= 0);
    if (!hasPresetLoaded && defaultParams && typeof PresetManager !== 'undefined' && PresetManager.currentParams) {
        PresetManager.currentParams.temperature = defaultParams.temperature !== undefined ? defaultParams.temperature : 0.8;
        PresetManager.currentParams.top_p = defaultParams.topP !== undefined ? defaultParams.topP : 0.9;
        PresetManager.currentParams.top_k = defaultParams.topK !== undefined ? defaultParams.topK : 0;
        PresetManager.currentParams.frequency_penalty = defaultParams.frequencyPenalty !== undefined ? defaultParams.frequencyPenalty : 0;
        PresetManager.currentParams.presence_penalty = defaultParams.presencePenalty !== undefined ? defaultParams.presencePenalty : 0;
        PresetManager.currentParams.repeat_penalty = defaultParams.repeatPenalty !== undefined ? defaultParams.repeatPenalty : 1.1;
        PresetManager.currentParams.context_length = defaultParams.contextLength || 8192;
        PresetManager.syncParamsToUI();
    }
    applyFontSize();
}

// ========================================
// 第15层: 任务/成就系统
// ========================================
// ========================================
// 任务系统
// ========================================

// ========================================
// 存档系统 - UI操作（从 game.js 收拢）
// ========================================

// 【P2清理】删除 SAVE_GAME_ID / LOCAL_SAVE_KEY（全项目零调用）
// 保留 LOCAL_MANUAL_COUNT / LOCAL_EXT_START / LOCAL_EXT_END（openSaveLoadModal 在用）
const LOCAL_MANUAL_COUNT = 5;
const LOCAL_EXT_START = 6;
const LOCAL_EXT_END = 10;

// 【P2清理】删除 safeLoadOldManual（全项目零调用）
async function renameSave(slot) {
    try {
        var data = await SaveDB.get(slot);
        if (!data) return;
        var oldName = data.name || data.prompt || '';
        var newName = await UI.prompt('修改存档名：', oldName);
        if (newName === null) return;
        data.name = newName;
        await withSaveLock(async function() {
            await SaveDB.set(slot, data);
        }, 'renameSave:' + slot);
        renderSaveUI();
    } catch (e) {
        console.error('renameSave出错:', e);
        UI.toast('改名失败');
    }
}

// 自动存档函数（简化版）
async function openSaveLoadModal() {
    var body = document.getElementById('saveLoadBody');
    if (!body) return;
    body.innerHTML =
        '<div style="text-align:center;padding:20px;color:var(--text-secondary)">加载中...</div>';
    UI.showModal('saveLoadModal');
    try {
        var autoData = await SaveDB.get(0);
        var slots = [];
        for (var i = 1; i <= 5; i++) {
            slots.push({
                slot: i,
                data: await SaveDB.get(i)
            });
        }
        var html = '';
        html += '<div class="sl-section-title">自动存档</div>';
        if (autoData) {
            html += '<div class="sl-slot"><div class="sl-slot-info"><div class="sl-slot-name">' +
                escapeHtml(autoData.name || '自动存档') + '</div><div class="sl-slot-meta">' + escapeHtml(
                    autoData.time || '') +
                '</div></div><div class="sl-slot-actions"><button class="sl-btn primary" onclick="loadFromSlot(0)">读取</button></div></div>';
        } else {
            html +=
                '<div class="sl-slot sl-slot-empty"><div class="sl-slot-info"><div class="sl-slot-name">暂无自动存档</div></div></div>';
        }
        html += '<hr class="sl-divider">';
        html += '<div class="sl-section-title">手动存档</div>';
        for (var j = 0; j < slots.length; j++) {
            var s = slots[j];
            if (s.data) {
                html += '<div class="sl-slot"><div class="sl-slot-info"><div class="sl-slot-name">' +
                    escapeHtml(s.data.name || ('存档 ' + s.slot)) + '</div><div class="sl-slot-meta">' +
                    escapeHtml(s.data.time || '') +
                    '</div></div><div class="sl-slot-actions"><button class="sl-btn primary" onclick="loadFromSlot(' +
                    s.slot + ')">读取</button><button class="sl-btn" onclick="saveToSlot(' + s.slot +
                    ')">覆盖</button><button class="sl-btn danger" onclick="deleteSaveSlot(' + s.slot +
                    ')">删除</button></div></div>';
            } else {
                html +=
                    '<div class="sl-slot sl-slot-empty"><div class="sl-slot-info"><div class="sl-slot-name">存档位 ' +
                    s.slot +
                    ' - 空</div></div><div class="sl-slot-actions"><button class="sl-btn" onclick="saveToSlot(' +
                    s.slot + ')">保存</button></div></div>';
            }
        }
        html +=
            '<div class="sl-bottom-actions"><button class="sl-btn" onclick="UI.hideModal(\'saveLoadModal\')">关闭</button></div>';
        body.innerHTML = html;
    } catch (e) {
        console.error('openSaveLoadModal出错:', e);
        body.innerHTML =
            '<div style="text-align:center;padding:20px;color:var(--danger)">加载存档列表失败</div>';
    }
}
async function deleteSaveSlot(slot) {
    return deleteFromSlot(slot);
}

async function renderSaveUI() {
    var ct = document.getElementById('saveLoadBody');
    if (!ct) return;
    var html = '';
    // 生成存档行的通用函数
    function slotRow(label, icon, data, slot, showSave) {
        var info = _formatSaveSlotData(data);
        var displayName = '';
        if (info) {
            displayName = icon + ' ' + label + ' - <strong>' + escapeHtml(info.name) +
                '</strong> <span style="font-size:11px;color:var(--text-tertiary)">(' + escapeHtml(info.time) + ')</span>';
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #e0ecf8;flex-wrap:wrap;gap:4px">' +
                '<span style="font-size:13px;color:var(--text-tertiary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">' +
                displayName + '</span>' + '<div style="display:flex;gap:4px;flex-shrink:0">' +
                '<button class="save-action-btn" onclick="renameSave(' + slot + ')">改名</button>' +
                '<button class="save-action-btn" onclick="loadFromSlot(' + slot + ')">读取</button>' + (
                    showSave ? '<button class="save-action-btn" onclick="safeSaveSlot(' + slot +
                    ')">覆盖</button>' : '') +
                '<button class="save-action-btn" onclick="deleteFromSlot(' + slot +
                ')" style="color:#ff6b6b">删除</button>' + '</div></div>';
        } else {
            displayName = icon + ' ' + label + ' - 空';
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #e0ecf8">' +
                '<span style="font-size:13px;color:var(--text-tertiary)">' + displayName + '</span>' + (showSave ?
                    '<button class="save-action-btn" onclick="safeSaveSlot(' + slot + ')">保存</button>' :
                    '') + '</div>';
        }
    }
    // 自动存档
    var auto = await SaveDB.get(0);
    html += slotRow('自动存档', '电', auto, 0, false);
    // 手动存档 1~5
    for (var mi = 1; mi <= LOCAL_MANUAL_COUNT; mi++) {
        var manual = await SaveDB.get(mi);
        html += slotRow('手动存档' + mi, '', manual, mi, true);
    }
    // 扩展存档 6~10
    html += '<div style="font-size:12px;color:var(--text-tertiary);margin-top:12px;margin-bottom:6px">扩展存档</div>';
    for (var ei = LOCAL_EXT_START; ei <= LOCAL_EXT_END; ei++) {
        var ext = await SaveDB.get(ei);
        html += slotRow('存档' + ei, '', ext, ei, true);
    }
    // 迁移按钮已移除（自由版无云存档）
    // 导入导出
    html += '<div style="margin-top:14px;padding-top:12px;border-top:2px dashed var(--border)">' +
        '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px;text-align:center">包 存档导入 / 导出</div>' +
        '<div style="display:flex;gap:8px">' +
        '<button class="pixel-btn blue big" onclick="exportSaves()" style="flex:1">导出全部存档</button>' +
        '<button class="pixel-btn big" onclick="document.getElementById(\'importFileInput\').click()" style="flex:1">导入存档</button>' +
        '</div>' +
        '<div style="font-size:10px;color:var(--text-tertiary);text-align:center;margin-top:6px">导出为JSON文件，可在其他设备导入恢复</div>' +
        '</div>';
    ct.innerHTML = html;
}
// 【P2清理】删除 openLoadModal（全项目零调用）
// 安全读档包装（解决async onclick静默失败问题）
function safeLoadSlot(slot) {
    loadFromSlot(slot).catch(function(e) {
        console.error('读档失败:', e);
        UI.toast('读档失败: ' + translateError(e.message));
    });
}

// ========================================
// NPC聊天系统 - UI操作（从 game.js 收拢）
// ========================================
function openNpcChat(name) {
    try {
        UI.hideModal('npcDetailModal');
    } catch (e) {}
    npcChatState.npcName = name;
    if (gameState && (!gameState._chatLogs || Array.isArray(gameState._chatLogs))) gameState._chatLogs = {};
    // 【改造】聊天历史合并 AI 在 world 模块生成的 chat 记录
    var manualLogs = (gameState && gameState._chatLogs && gameState._chatLogs[name]) ? gameState._chatLogs[name].slice() : [];
    var aiChatLogs = [];
    var _worldMods = (gameState && gameState._worldModules) || [];
    _worldMods.forEach(function(mod) {
        if (!mod || mod.type !== 'chat') return;
        var items = Array.isArray(mod.items) ? mod.items : [mod];
        items.forEach(function(it) {
            if (!it || !it.npc || String(it.npc).trim() !== name) return;
            var text = String(it.content || it.text || '').trim();
            if (text) aiChatLogs.push({ role: 'npc', from: 'npc', text: text, time: it.time || '', _ai: true });
        });
    });
    // AI 生成的放前面（历史），手动聊天的放后面（最新）
    npcChatState.chatHistory = aiChatLogs.concat(manualLogs);
    npcChatState.isSending = false;
        npcChatState.abortController = null; // 重置NPC聊天的AbortController
    if (gameState) {
        if (!gameState._chattedNpcs) gameState._chattedNpcs = {};
        gameState._chattedNpcs[name] = true;
    }
    // 【优化】打开聊天时标记该 NPC 的消息为已读
    if (gameState && gameState._notifSeenSnapshot) {
        if (!gameState._notifSeenSnapshot.chat) gameState._notifSeenSnapshot.chat = {};
        var npcSent = ((gameState._chatLogs && gameState._chatLogs[name]) || []).filter(function(m) {
            if (!m) return false;
            if (m.role === 'player' || m.from === 'player' || m.from === 'me') return false;
            return (m.text || '').trim();
        });
        gameState._notifSeenSnapshot.chat[name] = npcSent.length;
    }
    var titleEl = document.getElementById('npcChatTitle');
    var msgsEl = document.getElementById('npcChatMessages');
    var choicesEl = document.getElementById('npcChatChoices');
    var inputEl = document.getElementById('npcChatInput');
    var sendEl = document.getElementById('npcChatSend');
    if (!titleEl || !msgsEl || !choicesEl || !inputEl || !sendEl) {
        console.warn('npcChatModal not found');
        return;
    }
    var remark = (gameState && gameState._chatRemarks && gameState._chatRemarks[name]) || name;
    titleEl.textContent = '与「' + remark + '」对话';
    msgsEl.innerHTML = '';
    choicesEl.innerHTML = '';
    inputEl.value = '';
    inputEl.placeholder = '对' + name + '说...';
    sendEl.disabled = false; // 重新渲染历史气泡
    npcChatState.chatHistory.forEach(function(msg) {
        addNpcChatBubble(msg.role, msg.text, true);
    });
    UI.showModal('npcChatModal');
    // 绑定回车（使用事件委托避免重复绑定）
    var input = document.getElementById('npcChatInput');
    if (input && !input._hasEnterBinding) {
        input._hasEnterBinding = true;
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13) {
                if (!e.shiftKey) {
                    e.preventDefault();
                    sendNpcChat();
                }
            }
        });
    }
}
function closeNpcChat() {
    UI.hideModal('npcChatModal');
    npcChatState.npcName = '';
    npcChatState.chatHistory = [];
    npcChatState.isSending = false;
    var ep = document.getElementById('emojiPanel');
    if (ep) ep.classList.remove('open');
}
function toggleChatMenu() {
    var existing = document.getElementById('chatMenuPanel');
    if (existing) {
        existing.remove();
        return;
    }
    var menu = document.createElement('div');
    menu.id = 'chatMenuPanel';
    menu.style.cssText =
        'position:absolute;top:44px;right:8px;background:var(--bg);border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.12);padding:4px 0;z-index:200;min-width:130px;overflow:hidden';
    var items = [{
            text: '编辑备注',
            action: 'editChatRemark'
        },
        {
            text: '修改头像',
            action: 'changeNpcAvatar'
        },
        {
            text: '拉黑好友',
            action: 'blockNpc'
        },
        {
            text: '删除好友',
            action: 'deleteNpcChat'
        }
    ];
    items.forEach(function(item) {
        var row = document.createElement('div');
        row.style.cssText =
            'padding:12px 16px;font-size:14px;color:var(--text);cursor:pointer;transition:background .15s';
        row.textContent = item.text;
        row.onmouseenter = function() {
            this.style.background = '#f5f5f5';
        };
        row.onmouseleave = function() {
            this.style.background = '';
        };
        row.onclick = function() {
            menu.remove();
            var fn = window[item.action];
            if (typeof fn === 'function') fn();
            else console.warn('[聊天菜单] 函数未定义:', item.action);
        };
        menu.appendChild(row);
    });
    var header = document.querySelector('.chat-detail-header');
    if (header) header.appendChild(menu);
    // 【性能优化】用 once 选项监听器自动清理，防止重复打开菜单导致监听器累积
    var closeMenu = function(e) {
        if (!menu.contains(e.target) && e.target.id !== 'chatDetailMore') {
            menu.remove();
        }
    };
    TimerManager.setTimeout('chatMenuClick', function() {
        document.addEventListener('click', closeMenu, { once: true });
    }, 10);
}
function editChatRemark() {
    var name = npcChatState.npcName;
    var currentRemark = (gameState && gameState._chatRemarks && gameState._chatRemarks[name]) || '';
    var menu = document.getElementById('chatMenuPanel');
    if (menu) menu.remove();
    var header = document.querySelector('.chat-detail-header');
    if (!header) return;
    var panel = document.createElement('div');
    panel.id = 'chatRemarkPanel';
    panel.style.cssText =
        'position:absolute;top:44px;left:8px;right:8px;background:var(--bg);border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.12);padding:12px 16px;z-index:200';
    var safeRemark = (currentRemark || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    panel.innerHTML = '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">备注名</div>' +
        '<input type="text" id="remarkInput" value="' + safeRemark +
        '" placeholder="输入备注名" style="width:100%;height:36px;border:1px solid #e5e5e5;border-radius:8px;padding:0 12px;font-size:14px;outline:none;box-sizing:border-box">' +
        '<div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end">' +
        '<span id="remarkCancel" style="padding:6px 16px;font-size:14px;color:#999;cursor:pointer">取消</span>' +
        '<span id="remarkSave" style="padding:6px 16px;font-size:14px;color:#07C160;cursor:pointer;font-weight:500">保存</span></div>';
    header.appendChild(panel);
    var inp = document.getElementById('remarkInput');
    var cancelBtn = document.getElementById('remarkCancel');
    var saveBtn = document.getElementById('remarkSave');
    if (!inp || !cancelBtn || !saveBtn) { panel.remove(); return; }
    TimerManager.setTimeout('remarkFocus', function() {
        if (inp) { inp.focus(); inp.select(); }
    }, 50);
    cancelBtn.onclick = function() {
        panel.remove();
    };
    saveBtn.onclick = function() {
        var val = inp.value.trim();
        if (gameState) {
            if (!gameState._chatRemarks) gameState._chatRemarks = {};
            if (val) {
                gameState._chatRemarks[name] = val;
            } else {
                delete gameState._chatRemarks[name];
            }
        }
        autoSave();
        var titleEl = document.getElementById('npcChatTitle');
        if (titleEl) titleEl.textContent = val ? '与「' + val + '」对话' : '与「' + name + '」对话';
        panel.remove();
    };
    inp.onkeypress = function(e) {
        if (e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            document.getElementById('remarkSave').click();
        }
    };
}
function changeNpcAvatar() {
    var name = npcChatState.npcName;
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
        var file = e.target.files[0];
        if (!file) return;
        // 图片大小限制：最大2MB
        var maxSize = 2 * 1024 * 1024; // 2MB
        if (file.size > maxSize) {
            UI.toast('图片太大，请选择小于2MB的图片');
            return;
        }
        var reader = new FileReader();
        reader.onload = function(ev) {
            // 压缩大图片
            var img = new Image();
            img.onload = function() {
                var canvas = document.createElement('canvas');
                var ctx = canvas.getContext('2d');
                var maxDim = 512; // 最大宽高
                var w = img.width;
                var h = img.height;
                if (w > maxDim || h > maxDim) {
                    if (w > h) {
                        h = Math.round(h * maxDim / w);
                        w = maxDim;
                    } else {
                        w = Math.round(w * maxDim / h);
                        h = maxDim;
                    }
                }
                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);
                var compressedData = canvas.toDataURL('image/jpeg', 0.8);

                if (gameState) {
                    if (!gameState._npcAvatars) gameState._npcAvatars = {};
                    gameState._npcAvatars[name] = compressedData;
                }
                autoSave();
                var avatars = document.querySelectorAll(
                '.chat-message:not(.self) .chat-message-avatar');
                avatars.forEach(function(a) {
                    a.style.backgroundImage = 'url(' + compressedData + ')';
                    a.style.backgroundSize = 'cover';
                    a.style.backgroundPosition = 'center';
                    a.textContent = '';
                });
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    };
    input.click();
}
function blockNpc() {
    var name = npcChatState.npcName;
    if (gameState) {
        if (!gameState._blockedNpcs) gameState._blockedNpcs = {};
        if (gameState._blockedNpcs[name]) {
            gameState._blockedNpcs[name] = false;
            autoSave();
            UI.toast('已取消拉黑「' + name + '」');
            return;
        }
    }
    var menu = document.getElementById('chatMenuPanel');
    if (menu) menu.remove();
    // 【缺陷修复】改用 UI.confirm 走统一弹窗管理，避免 z-index 冲突和无法 Esc 关闭
    UI.confirm('拉黑好友', '确定拉黑「' + name + '」？拉黑后将不再收到消息。').then(function(ok) {
        if (!ok) return;
        if (gameState) {
            if (!gameState._blockedNpcs) gameState._blockedNpcs = {};
            gameState._blockedNpcs[name] = true;
        }
        autoSave();
        closeNpcChat();
    });
}
function deleteNpcChat() {
    var name = npcChatState.npcName;
    var menu = document.getElementById('chatMenuPanel');
    if (menu) menu.remove();
    // 【缺陷修复】改用 UI.confirm 走统一弹窗管理，避免 z-index 冲突和无法 Esc 关闭
    UI.confirm('删除聊天', '删除与「' + name + '」的聊天？聊天记录将被清除，不可恢复。').then(function(ok) {
        if (!ok) return;
        if (gameState) {
            if (gameState._chatLogs) delete gameState._chatLogs[name];
            if (gameState._chattedNpcs) delete gameState._chattedNpcs[name];
        }
        autoSave();
        closeNpcChat();
    });
}
function toggleEmojiPanel() {
    var panel = document.getElementById('emojiPanel');
    if (!panel) return;
    if (panel.classList.contains('open')) {
        panel.classList.remove('open');
        return;
    }
    renderEmojiPanel();
    panel.classList.add('open');
}
function renderEmojiPanel() {
    var panel = document.getElementById('emojiPanel');
    if (!panel) return;
    panel.innerHTML = '';
    if (gameState && !gameState._customEmojis) gameState._customEmojis = ['[笑脸]', '[大哭]', '[怒]', '[晕]', '[偷笑]', '[吃瓜]',
        '[暗中观察]', '[狗头]', '[抱抱]', '[白眼]'
    ];
    if (gameState && gameState._customEmojis && gameState._customEmojis.length === 0) {
        var hint = document.createElement('div');
        hint.className = 'empty-state';
        hint.style.cssText = 'width:100%;padding:16px 0';
        hint.textContent = '还没有表情，点击 + 添加';
        panel.appendChild(hint);
    } else {
        (gameState._customEmojis || []).forEach(function(e, i) {
            var item = document.createElement('span');
            item.className = 'emoji-item';
            item.style.position = 'relative';
            item.textContent = e;
            item.onclick = function(ev) {
                if (ev.target.classList.contains('emoji-del')) return;
                insertEmoji(e);
            };
            var del = document.createElement('span');
            del.className = 'emoji-del';
            del.textContent = '×';
            del.style.cssText =
                'position:absolute;top:-6px;right:-6px;width:16px;height:16px;background:#ff3b30;color:#fff;border-radius:50%;font-size:10px;display:none;align-items:center;justify-content:center;cursor:pointer;line-height:16px;text-align:center';
            del.onclick = function(ev) {
                ev.stopPropagation();
                gameState._customEmojis.splice(i, 1);
                autoSave();
                renderEmojiPanel();
            };
            item.onmouseenter = function() {
                del.style.display = 'flex';
            };
            item.onmouseleave = function() {
                del.style.display = 'none';
            };
            item.appendChild(del);
            panel.appendChild(item);
        });
    }
    var addBtn = document.createElement('span');
    addBtn.className = 'emoji-item';
    addBtn.style.cssText = 'background:#07C160;color:#fff;font-weight:600';
    addBtn.textContent = '+ 添加';
    addBtn.onclick = function() {
        panel.innerHTML = '';
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;width:100%;align-items:center';
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.placeholder = '输入表情名，如：吃瓜';
        inp.style.cssText =
            'flex:1;height:32px;border:1px solid #ddd;border-radius:8px;padding:0 10px;font-size:13px;outline:none';
        inp.id = 'emojiNewInput';
        var confirmBtn = document.createElement('span');
        confirmBtn.className = 'emoji-item';
        confirmBtn.style.cssText = 'background:#07C160;color:#fff;font-weight:600;flex-shrink:0';
        confirmBtn.textContent = '确定';
        confirmBtn.onclick = function() {
            var val = inp.value.trim();
            if (!val) return;
            var emoji = '[' + val + ']';
            if (gameState && gameState._customEmojis && gameState._customEmojis.indexOf(emoji) === -1) {
                gameState._customEmojis.push(emoji);
                autoSave();
            }
            renderEmojiPanel();
        };
        var cancelBtn = document.createElement('span');
        cancelBtn.className = 'emoji-item';
        cancelBtn.style.cssText = 'flex-shrink:0';
        cancelBtn.textContent = '取消';
        cancelBtn.onclick = function() {
            renderEmojiPanel();
        };
        row.appendChild(inp);
        row.appendChild(confirmBtn);
        row.appendChild(cancelBtn);
        panel.appendChild(row);
        TimerManager.setTimeout('emojiFocus', function() {
            if (inp) inp.focus();
        }, 50);
        inp.onkeypress = function(e) {
            if (e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            confirmBtn.click();
        }
        };
    };
    panel.appendChild(addBtn);
}
function insertEmoji(emoji) {
    var input = document.getElementById('npcChatInput');
    if (!input) return;
    var start = input.selectionStart;
    var end = input.selectionEnd;
    var val = input.value;
    input.value = val.substring(0, start) + emoji + val.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + emoji.length;
}
function showNpcMessageNotification(name, text) {
    var container = document.getElementById('npcNotifContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'npcNotifContainer';
        container.style.cssText =
            'position:fixed;top:0;left:0;right:0;z-index:999999;display:flex;flex-direction:column;align-items:center;pointer-events:none;padding-top:8px;gap:6px';
        document.body.appendChild(container);
    }
    var notif = document.createElement('div');
    notif.style.cssText =
        'background:rgba(0,0,0,0.8);color:#fff;padding:10px 18px;border-radius:20px;font-size:13px;max-width:300px;pointer-events:auto;cursor:pointer;opacity:0;transform:translateY(-20px);transition:opacity .3s,transform .3s;display:flex;align-items:center;gap:8px';
    var avatar = document.createElement('span');
    avatar.style.cssText =
        'width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0';
    avatar.textContent = name.charAt(0);
    var content = document.createElement('div');
    content.innerHTML = '<div style="font-weight:600;font-size:12px;opacity:0.9">' + escapeHtml(name) +
        '</div><div style="font-size:12px;opacity:0.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px">' +
        escapeHtml(text) + '</div>';
    notif.appendChild(avatar);
    notif.appendChild(content);
    container.appendChild(notif);
    notif.onclick = function() {
        notif.remove();
        openNpcChat(name);
    };
    requestAnimationFrame(function() {
        notif.style.opacity = '1';
        notif.style.transform = 'translateY(0)';
    });
    // 【缺陷修复】使用唯一 key，避免多个 NPC 通知同时显示时定时器互相覆盖导致永不消失
    var keyPrefix = 'npcNotif_' + Date.now() + '_' + Math.random();
    TimerManager.setTimeout(keyPrefix + '_hide', function() {
        notif.style.opacity = '0';
        notif.style.transform = 'translateY(-20px)';
        TimerManager.setTimeout(keyPrefix + '_remove', function() {
            if (notif.parentNode) notif.remove();
        }, 300);
        // 【全游戏弹窗策略】3 秒——使用 POPUP_DURATION_MS 常量（core.js 定义）
    }, typeof POPUP_DURATION_MS !== 'undefined' ? POPUP_DURATION_MS : 3000);
}
function sendNpcChat() {
    if (npcChatState.isSending) return;
    var input = document.getElementById('npcChatInput');
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    // 显示玩家气泡
    addNpcChatBubble('player', text);
    // 请求NPC回复（防 unhandledrejection：捕获异步错误）
    try {
        var p = requestNpcReply(text);
        if (p && typeof p.catch === 'function') {
            p.catch(function(e) {
                if (e && e.name === 'AbortError') return;
                console.error('[NPC聊天] 异步操作失败:', e);
                if (typeof UI !== 'undefined' && UI.toast) {
                    UI.toast('发送失败: ' + (e && e.message ? e.message : '未知错误'));
                }
            });
        }
    } catch (e) {
        console.error('[NPC聊天] 同步错误:', e);
        if (typeof UI !== 'undefined' && UI.toast) {
            UI.toast('发送失败: ' + (e && e.message ? e.message : '未知错误'));
        }
    }
}
function selectNpcChatChoice(text) {
    if (npcChatState.isSending) return;
    // 清掉选项
    document.getElementById('npcChatChoices').innerHTML = '';
    // 显示玩家气泡
    addNpcChatBubble('player', text);
    // 请求NPC回复（防 unhandledrejection）
    try {
        var p = requestNpcReply(text);
        if (p && typeof p.catch === 'function') {
            p.catch(function(e) {
                if (e && e.name === 'AbortError') return;
                console.error('[NPC聊天] 异步操作失败:', e);
                if (typeof UI !== 'undefined' && UI.toast) {
                    UI.toast('发送失败: ' + (e && e.message ? e.message : '未知错误'));
                }
            });
        }
    } catch (e) {
        console.error('[NPC聊天] 同步错误:', e);
        if (typeof UI !== 'undefined' && UI.toast) {
            UI.toast('发送失败: ' + (e && e.message ? e.message : '未知错误'));
        }
    }
}
function renderRichMessage(text) {
    if (!text) return '';
    text = text.replace(/\[照片[：:]([^\]]+)\]/g, function(m, desc) {
        return '<div class="rich-photo"><div class="rich-photo-desc">' + escapeHtml(desc) +
            '</div></div>';
    });
    text = text.replace(/\[定位[：:]([^\]]+)\]/g, function(m, loc) {
        return '<div class="rich-location"><div class="rich-location-name">' + escapeHtml(loc) +
            '</div></div>';
    });
    // 【修复C P2-2】对NPC聊天消息进行HTML净化，防止XSS
    return sanitizeHtml(text);
}
function addNpcChatBubble(role, text, skipPush) {
    var messages = document.getElementById('npcChatMessages');
    if (!messages) return;
    var isPlayer = role === 'player';
    var avatarChar = isPlayer ? '我' : (npcChatState.npcName ? npcChatState.npcName.charAt(0) : '?');
    var now = new Date();
    var timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    var bubble = document.createElement('div');
    bubble.className = 'chat-message' + (isPlayer ? ' self' : '');
    bubble.innerHTML = '<div class="chat-message-avatar">' + escapeHtml(avatarChar) + '</div>' +
        '<div><div class="chat-message-content">' + renderRichMessage(text) +
        '</div><div class="chat-message-meta"><span>' + timeStr + '</span></div></div>';
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    if (!skipPush) {
        npcChatState.chatHistory.push({
            role: role,
            text: text
        });
        // 限制聊天历史长度，防止内存泄漏
        if (npcChatState.chatHistory.length > 100) {
            npcChatState.chatHistory = npcChatState.chatHistory.slice(-50);
        }
        if (gameState) {
            if (!gameState._chatLogs || Array.isArray(gameState._chatLogs)) gameState._chatLogs = {};
            gameState._chatLogs[npcChatState.npcName] = npcChatState.chatHistory.slice();
        }
        // 自动保存聊天记录
        autoSave();
    }
}
function openEditNpcModal(name) {
    UI.hideModal('npcDetailModal');
    npcEditingName = name;
    var c = gameState.allCharacters[name];
    if (!c) return;
    var el;
    el = document.getElementById('npcEditModalTitle'); if (el) el.textContent = '编辑「' + name + '」';
    el = document.getElementById('npcEditName'); if (el) { el.value = c.name || ''; el.disabled = true; }
    el = document.getElementById('npcEditTitle2'); if (el) el.value = c.title || '';
    el = document.getElementById('npcEditRelation'); if (el) el.value = c.relation || '';
    el = document.getElementById('npcEditFavor'); if (el) el.value = c.favorability !== undefined ? c.favorability : 0;
    el = document.getElementById('npcEditDesc'); if (el) el.value = c.desc || '';
    var extra = '';
    if (c.details && c.details.length > 0) {
        extra = c.details.map(function(d) {
            return d.key + ': ' + d.value;
        }).join('\n');
    }
    el = document.getElementById('npcEditExtra'); if (el) el.value = extra;
    UI.showModal('npcEditModal');
}
function saveNpcEdit() {
    // 修复：每个 input 都做 nullish 检查，缺一不崩溃
    var nameEl = document.getElementById('npcEditName');
    if (!nameEl) { UI.toast('页面未加载完整'); return; }
    var name = nameEl.value.trim();
    if (!name) {
        UI.toast('请填写角色名字');
        return;
    }
    var titleEl = document.getElementById('npcEditTitle2');
    var relationEl = document.getElementById('npcEditRelation');
    var favorEl = document.getElementById('npcEditFavor');
    var descEl = document.getElementById('npcEditDesc');
    var extraEl = document.getElementById('npcEditExtra');
    var title = titleEl ? titleEl.value.trim() : '';
    var relation = relationEl ? relationEl.value.trim() : '';
    var favor = favorEl ? parseInt(favorEl.value) : NaN;
    // 【修复 P2】输入为空或非数字时，取当前角色已有好感度，而非硬编码 50（与 openEditNpcModal 默认值 0 一致）
    if (isNaN(favor)) {
        var _curC = gameState.allCharacters && gameState.allCharacters[name];
        favor = (_curC && _curC.favorability !== undefined) ? _curC.favorability : 0;
    }
    var desc = descEl ? descEl.value.trim() : '';
    var extra = extraEl ? extraEl.value.trim() : '';
    // 【修复】好感度范围与渲染一致为 -100~100（原 0-100 无法表达反感）
    favor = Math.max(-100, Math.min(100, favor));
    var details = [];
    if (extra) {
        extra.split('\n').forEach(function(line) {
            line = line.trim();
            if (!line) return;
            var idx = line.indexOf(':');
            if (idx === -1) idx = line.indexOf('：');
            if (idx !== -1) {
                details.push({
                    key: line.substring(0, idx).trim(),
                    value: line.substring(idx + 1).trim()
                });
            } else {
                details.push({
                    key: '设定',
                    value: line
                });
            }
        });
    }
    // 【阶段1统一】NPC 编辑保存：统一委托 CharacterMutator.replaceCharacter
    // 替代原直接 delete + gameState.allCharacters[name]=（绕过 StateManager 导致不同步）
    var _newCharObj = {
        name: name,
        title: title,
        relation: relation,
        favorability: favor,
        desc: desc,
        details: details
    };
    if (typeof CharacterMutator !== 'undefined' && CharacterMutator.replaceCharacter) {
        // 若改名（npcEditingName !== name），replaceCharacter 会自动删除旧名并迁移累积数据
        CharacterMutator.replaceCharacter(npcEditingName || name, _newCharObj);
    } else if (gameState && gameState.allCharacters) {
        // 兜底：CharacterMutator 不可用时回退旧逻辑
        if (npcEditingName && npcEditingName !== name) {
            delete gameState.allCharacters[npcEditingName];
        }
        gameState.allCharacters[name] = _newCharObj;
    }
    // 注入到对话历史让AI记住
    var injectText = '【系统提示：玩家更新了角色「' + name + '」的设定】\n' + '姓名: ' + name + '\n' + (title ? '身份: ' + title +
        '\n' : '') + (relation ? '关系: ' + relation + '\n' : '') + '好感度: ' + favor + '\n' + (desc ?
        '状态: ' + desc + '\n' : '');
    if (details.length > 0) {
        injectText += details.map(function(d) {
            return d.key + ': ' + d.value;
        }).join('\n') + '\n';
    }
    injectText += '请在后续剧情中按照以上设定来描写该角色。';
    if (gameState && gameState.conversationHistory && gameState.conversationHistory.length > 0) {
        gameState.conversationHistory.push({
            role: 'user',
            content: injectText
        }, {
            role: 'assistant',
            content: '明白，已更新「' + name + '」的角色设定，后续会保持一致。'
        });
    }
    renderNpcList();
    UI.hideModal('npcEditModal');
    autoSave();
    UI.toast('角色「' + name + '」已保存');
}
function renderNpcList() {
    renderNpcPage();
}
function renderNpcPage() {
    // 确保 allCharacters 已初始化
    if (gameState && !gameState.allCharacters) gameState.allCharacters = {};
    var chars = Object.values((gameState && gameState.allCharacters) || {});
    // 【性能优化】数据未变时跳过整页重绘（每次点击导航栏都会触发此函数）
    try {
        // 【修复】原 key 只算 length/totalFav/lastName，漏算 title/relation/desc/details，
        // 导致 AI 更新角色状态描述或关系后人际页不重绘
        var totalFav = 0, sigParts = [];
        for (var _ci = 0; _ci < chars.length; _ci++) {
            var _c = chars[_ci];
            totalFav += Number(_c.favorability) || 0;
            sigParts.push(_c.name + ':' + (_c.favorability || 0) + ':' + (_c.title || '') + ':' + (_c.relation || '') + ':' + (_c.desc || '').length);
        }
        var _key = chars.length + '|' + totalFav + '|' + sigParts.join('|');
        if (typeof RenderCache !== 'undefined' && RenderCache.same('renderNpcPage', _key)) return;
        if (typeof RenderCache !== 'undefined') RenderCache.mark('renderNpcPage', _key);
    } catch (e) { /* 缓存失败不阻塞渲染 */ }
    var container = document.getElementById('characterList');
    if (!container) return;
    if (chars.length === 0) {
        container.innerHTML =
            '<div class="empty-state"><div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><p>暂无角色</p><p style="font-size:12px;margin-top:4px;">AI会在剧情中自动创造角色</p></div>';
    } else {
        container.innerHTML = chars.map(function(c) {
            var fav = Number(c.favorability) || 0;
            fav = Math.max(-100, Math.min(100, fav));
            // 【J修复】统一用 escapeAttr，替代 escapeHtml+手动单引号转义
            var sn = escapeAttr(c.name);
            // 【修改】直接使用AI返回的relation字段，不再硬编码好感度等级
            var favLevel = c.relation || '中立';
            // 根据好感度数值选择颜色（-100到100，0为中立）
            var favColor = '#b8c5d0'; // 默认灰蓝（中立）
            if (fav >= 80) favColor = '#ff6b9d'; // 粉色（极度亲密）
            else if (fav >= 60) favColor = '#ff8fab'; // 浅粉
            else if (fav >= 40) favColor = '#ffb3c6'; // 更浅粉
            else if (fav >= 15) favColor = '#a8dadc'; // 青色（友好）
            else if (fav >= -15) favColor = '#b8c5d0'; // 灰蓝（中立）
            else if (fav >= -40) favColor = '#9a8c98'; // 灰紫（疏远）
            else favColor = '#6c757d'; // 深灰（敌意）

            var tagsHtml = '';
            if (c.relation) tagsHtml += '<span class="char-tag">' + escapeHtml(c.relation) + '</span>';
            if (c.title) tagsHtml += '<span class="char-tag">' + escapeHtml(c.title) + '</span>';
            // 添加好感度等级标签
            tagsHtml += '<span class="char-tag" style="background:' + favColor + '20;color:' + favColor + ';">' + escapeHtml(favLevel) + '</span>';

            var firstChar = (c.name && typeof c.name === 'string') ? c.name.charAt(0) : '?';
            return '<div class="character-card pearl-card" onclick="openNpcDetail(\'' + sn +
                '\')">' +
                '<div class="avatar avatar-md"><span>' + escapeHtml(firstChar) + '</span></div>' +
                '<div class="char-info">' +
                '<div class="char-name">' + escapeHtml(c.name) + '</div>' +
                (c.title ? '<div class="char-meta">' + escapeHtml(c.title) + '</div>' : '') +
                '<div class="char-tags">' + tagsHtml + '</div>' +
                '<div class="char-stats">' +
                '<div class="char-stat-row"><span>好感</span><div class="progress-bar" style="background:' + favColor + '20;"><div class="progress-fill" style="width:' +
                // 【修复】好感度范围 -100~100，映射到 0~100% 宽度（0 为中点 50%）
                // 原 width:fav% 对负值非法（如 -40%），浏览器忽略显示空条
                Math.max(0, Math.min(100, 50 + fav / 2)) + '%;background:' + favColor + ';"></div></div><span class="char-stat-value">' + fav + '</span></div>' +
                '</div>' +
                (c.desc ?
                    '<div class="npc-thought-bubble" onclick="event.stopPropagation();this.classList.toggle(\'expanded\')"><div class="npc-thought-label">状态</div><div class="thought-content"><div class="npc-thought-text">' +
                    escapeHtml(c.desc) + '</div></div></div>' : '') +
                '</div></div>';
        }).join('');
    }
    // 仅在导航栏未渲染过时才重建
    var npcNav = document.getElementById('npcNav');
    if (npcNav && !npcNav._rendered) {
        renderNavBar('npcNav', [{
                page: 'storyPage',
                icon: 'icon-book',
                label: '剧情'
            },
            {
                page: 'playerPage',
                icon: 'icon-user',
                label: '个人'
            },
            {
                page: 'npcPage',
                icon: 'icon-users',
                label: '人际'
            },
            {
                page: 'logPage',
                icon: 'icon-grid',
                label: '日志'
            },
            {
                page: 'memoryPage',
                icon: 'icon-sparkles',
                label: '记忆'
            },
            {
                page: 'recapPage',
                icon: 'icon-clock',
                label: '回顾'
            }
        ], 2);
        npcNav._rendered = true;
    }
}
function openNpcDetail(name) {
    if (!gameState || !gameState.allCharacters) return;
    var c = gameState.allCharacters[name];
    if (!c) return;

    // 构建详情内容
    var html = '';
    // 头像和名称
    html += '<div style="text-align:center;margin-bottom:16px;">' +
        '<div class="avatar avatar-lg" style="margin:0 auto;"><span>' + escapeHtml(c.name.charAt(0)) + '</span></div>' +
        '<h3 style="font-size:20px;font-weight:600;margin-top:10px;">' + escapeHtml(c.name) + '</h3>' +
        (c.title ? '<p class="text-soft">' + escapeHtml(c.title) + '</p>' : '') +
        '</div>';

    // 基本信息字段（key-value 行）
    var baseFields = [{
            key: '身份',
            value: c.title || '-'
        },
        {
            key: '关系',
            value: c.relation || '-'
        }
    ];
    if (c.desc) baseFields.push({
        key: '状态',
        value: c.desc
    });

    html += '<div class="pearl-card" style="padding:12px;margin-bottom:12px;">';
    html += baseFields.map(function(f) {
        return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:14px;">' +
            '<span style="color:var(--text-secondary);">' + f.key + '</span>' +
            '<span style="color:var(--text);font-weight:500;">' + escapeHtml(f.value) + '</span></div>';
    }).join('');

    // 动态 details 字段
    if (c.details && c.details.length > 0) {
        html += c.details.map(function(d) {
            return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:14px;">' +
                '<span style="color:var(--text-secondary);">' + escapeHtml(d.key) + '</span>' +
                '<span style="color:var(--text);font-weight:500;">' + escapeHtml(d.value) + '</span></div>';
        }).join('');
    }
    html += '</div>';

    // 好感度进度条（数值+等级）
    if (c.favorability !== undefined) {
        var fav = Number(c.favorability) || 0;
        // 范围 -100 到 100，0 为中立
        fav = Math.max(-100, Math.min(100, fav));
        // 使用AI动态生成的关系描述，不再硬编码等级名称
        var favLevel = c.relation || '中立';
        var favColor = '';
        if (fav >= 80) favColor = '#ff6b9d';
        else if (fav >= 60) favColor = '#ff8fab';
        else if (fav >= 40) favColor = '#ffb3c6';
        else if (fav >= 15) favColor = '#a8dadc';
        else if (fav >= -15) favColor = '#b8c5d0';
        else if (fav >= -40) favColor = '#9a8c98';
        else favColor = '#6c757d';

        html += '<div class="pearl-card" style="padding:12px;margin-bottom:12px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<span style="font-size:13px;color:var(--text-secondary);font-weight:500;">好感度</span>' +
            '<span style="display:flex;align-items:center;gap:8px;">' +
            '<span style="font-size:12px;color:#fff;background:' + favColor + ';padding:2px 8px;border-radius:10px;font-weight:500;">' + favLevel + '</span>' +
            '<span style="font-size:14px;color:var(--text);font-weight:600;">' + fav + '</span></span></div>' +
            // 【修复】好感度 -100~100 映射到 0~100% 宽度（0 为中点 50%），原 width:fav% 对负值非法
            '<div class="progress-bar" style="background:' + favColor + '20;"><div class="progress-fill" style="width:' + Math.max(0, Math.min(100, 50 + fav / 2)) + '%;background:' + favColor + ';"></div></div></div>';
    }

    document.getElementById('npcDetailBody').innerHTML = html;
    UI.showModal('npcDetailModal');

    // 绑定编辑按钮
    var editBtn = document.getElementById('btnNpcEdit');
    if (editBtn) {
        var newEditBtn = editBtn.cloneNode(true);
        editBtn.parentNode.replaceChild(newEditBtn, editBtn);
        newEditBtn.addEventListener('click', function() {
            UI.hideModal('npcDetailModal');
            openEditNpcModal(name);
        });
    }
    // 绑定删除按钮
    var deleteBtn = document.getElementById('btnNpcDelete');
    if (deleteBtn) {
        var newDeleteBtn = deleteBtn.cloneNode(true);
        deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
        newDeleteBtn.addEventListener('click', function() {
            UI.confirm('删除角色', '确定删除角色「' + escapeHtml(name) + '」？').then(function(ok) { if (ok) {
            // 添加防抖检查
            if (newDeleteBtn.disabled) return;
            newDeleteBtn.disabled = true;
                // 【阶段1统一】删除角色委托 CharacterMutator.removeCharacter
                if (typeof CharacterMutator !== 'undefined' && CharacterMutator.removeCharacter) {
                    CharacterMutator.removeCharacter(name);
                } else if (gameState && gameState.allCharacters) {
                    delete gameState.allCharacters[name];
                }
                renderNpcList();
                UI.hideModal('npcDetailModal');
                UI.toast('已删除角色');
                newDeleteBtn.disabled = false;
            }
            }).catch(function(err) { console.error('[NPC系统] 操作失败:', err); });
        });
    }
}
