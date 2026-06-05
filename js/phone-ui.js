
// ========================================
// 第7层: 论坛系统
// ========================================
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
    var modules = gameState._worldModules || [];
    var commentMods = modules.filter(function(m) {
        return m.type === 'comments';
    });
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
    safeAutoSave();
    requestForumNpcReplies(postIdx, text, playerName);
}
function replyToForumComment(postIdx, commentIdx) {
    var modules = gameState._worldModules || [];
    var commentMods = modules.filter(function(m) {
        return m.type === 'comments';
    });
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
    var modules = gameState._worldModules || [];
    var commentMods = modules.filter(function(m) {
        return m.type === 'comments';
    });
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
    var sysMsg = '你是一个游戏论坛系统。玩家刚在论坛发了一条评论，请生成NPC的回复。\n\n' +
        '【玩家信息】名字: ' + playerName + '，' + (playerIdentity || '普通玩家') + '\n' +
        '【当前角色关系】\n' + (function() {
            var rels = gameState.relationships || [];
            if (rels.length === 0) return '暂无关系数据';
            return rels.map(function(r) { return r.from + '→' + r.to + ': ' + r.type + (r.desc ? '(' + r.desc + ')' : ''); }).join('\n');
        })() + '\n' +
        '【帖子标题】' + (post.title || '未知') + '\n' +
        '【帖子内容】' + (post.main || post.content || '未知') + '\n' +
        '【已有评论】\n' + (existingComments || '暂无评论') + '\n\n' +
        '【可选NPC】' + (npcNames.length > 0 ? npcNames.join('、') : '随机生成网名') + '\n\n' +
        '生成规则：\n' +
        '1. 根据玩家身份和关系决定回复数量和热度：\n' +
        '   - 顶流/总裁/名人：5-10条回复，有人回复玩家、有人回复其他评论、有人聊别的话题\n' +
        '   - 普通人：2-4条回复\n' +
        '   - 无人问津：0-1条回复\n' +
        '2. 回复JSON数组格式：[{"name":"昵称","text":"内容","replyTo":"要回复的人名(可选)"}]\n' +
        '3. 【核心规则】NPC必须知道玩家(' + playerName + ')的真实身份！不要把玩家当陌生人！NPC的回复必须基于对玩家身份的了解来写。例如如果玩家是"殷家那位"，NPC应该知道并据此回复，而不是把玩家当普通网友。\n' +
        '4. 【回复规则】如果玩家在评论中@了某个NPC（用"名字"格式），被@的NPC必须回复玩家！这是强制要求，不能忽略。\n' +
        '5. 有人要直接回复玩家(' + playerName + ')，有人回复其他评论者，有人自说自话\n' +
        '6. 每条20-40字，纯文字，不要emoji\n' +
        '7. 态度多样：赞同、反对、吐槽、八卦、补充信息等\n' +
        '8. 如果玩家身份很高，在最后加一个字段 maySpawnNewPost: true，表示可能有人开新帖讨论此事';
    callAI([{
        role: 'system',
        content: sysMsg
    }, {
        role: 'user',
        content: '请生成NPC回复'
    }], {
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
    var modules = gameState._worldModules || [];
    var srcPost = modules.filter(function(m) {
        return m.type === 'comments';
    })[srcPostIdx];
    if (!srcPost) return;
    var sysMsg = '你是一个游戏论坛系统。玩家在论坛发言了，有人开了一个新帖子来讨论这件事。\n\n' +
        '【玩家】' + playerName + '\n' +
        '【原帖标题】' + (srcPost.title || '未知') + '\n' +
        '【玩家评论】' + playerComment + '\n\n' +
        '生成一个新帖子，JSON格式：{"title":"新帖子标题","author":"发帖人昵称","main":"帖子正文"}\n' +
        '要求：\n' +
        '1. 标题要吸引眼球，10-20字\n' +
        '2. 正文引用玩家的评论，加上自己的看法，50-100字\n' +
        '3. 纯文字，不要emoji\n' +
        '4. 帖子内容要和原帖相关但角度不同（八卦、分析、吐槽等）';
    callAI([{
        role: 'system',
        content: sysMsg
    }, {
        role: 'user',
        content: '生成新帖子'
    }], {
        stream: false
    }).then(function(resp) {
        try {
            var data = typeof resp === 'string' ? JSON.parse(resp) : resp;
            if (data && data.title && data.main) {
                if (!Array.isArray(gameState._worldModules)) gameState._worldModules = [];
                gameState._worldModules.push({
                    type: 'comments',
                    title: data.title,
                    author: data.author || '匿名',
                    main: data.main,
                    comments: []
                });
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
    var html = '<div id="diaryDatePicker" style="position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:100;display:flex;align-items:flex-start;justify-content:center;padding-top:80px;" onclick="if(event.target===this)closeDiaryDatePicker()">' +
        '<div style="background:#fff;border-radius:12px;width:280px;max-height:60vh;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,0.2);">' +
        '<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-weight:600;font-size:15px;display:flex;justify-content:space-between;align-items:center;">' +
        '<span>选择日期</span><span style="cursor:pointer;color:#999;font-size:20px;" onclick="closeDiaryDatePicker()">×</span></div>' +
        dateList.map(function(d) {
            return '<div style="padding:12px 16px;border-bottom:1px solid #f5f5f5;cursor:pointer;font-size:14px;" onclick="closeDiaryDatePicker();diaryJumpToDate(\'' + d.replace(/'/g, "\\'") + '\')">' + escapeHtml(d) + '</div>';
        }).join('') +
        '</div></div>';
    var container = document.querySelector('.diary-page') || document.getElementById('logSubContent');
    if (container) {
        var old = document.getElementById('diaryDatePicker');
        if (old) old.remove();
        var wrap = document.createElement('div');
        wrap.innerHTML = html;
        container.appendChild(wrap.firstElementChild);
    }
}
function closeDiaryDatePicker() {
    var el = document.getElementById('diaryDatePicker');
    if (el) el.remove();
}
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
    var mailModules = (gameState._worldModules || []).filter(function(m) {
        return m.type === 'mail';
    });
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
        if (typeof refreshNotificationBadge === 'function') refreshNotificationBadge();
        safeAutoSave();
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
        '<div style="display:flex;flex-direction:column;flex:1;background:#fff;overflow:hidden;">' +
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
    var mailModules = (gameState._worldModules || []).filter(function(m) {
        return m.type === 'mail';
    });
    if (mailModules.length > 0 && mailModules[0].items && Array.isArray(mailModules[0].items)) {
        if (index >= 0 && index < mailModules[0].items.length) {
            mailModules[0].items.splice(index, 1);
            safeAutoSave();
            UI.toast('邮件已删除');
            backToMailList();
        }
    } else if (gameState._mails && Array.isArray(gameState._mails)) {
        if (index >= 0 && index < gameState._mails.length) {
            gameState._mails.splice(index, 1);
            safeAutoSave();
            UI.toast('邮件已删除');
            backToMailList();
        }
    }
}
// --- 世界模块渲染 ---
// 【修复X1】所有AI返回的数据必须经过escapeHtml转义，防止XSS
function buildModuleHTML(mod) {
    var type = mod.type || 'text';
    var title = escapeHtml(mod.title || '');
    var content = escapeHtml(mod.content || '');
    var items = mod.items || mod.data || [];

    switch (type) {
        case 'text':
            return '<div class="world-module world-module-text">' +
                (title ? '<div class="world-module-title">' + title + '</div>' : '') +
                '<div class="world-module-content">' + content + '</div></div>';

        case 'list':
            if (!items || items.length === 0) return '';
            var listHtml = items.map(function(item) {
                var text = typeof item === 'string' ? item : (item.name || item.text || item
                    .title || JSON.stringify(item));
                return '<div class="world-module-list-item"><span class="world-module-list-dot"></span>' +
                    escapeHtml(text) + '</div>';
            }).join('');
            return '<div class="world-module world-module-list">' +
                (title ? '<div class="world-module-title">' + title + '</div>' : '') +
                '<div class="world-module-list">' + listHtml + '</div></div>';

        case 'ranking':
            if (!items || items.length === 0) return '';
            var rankHtml = items.map(function(item, idx) {
                var name = typeof item === 'string' ? item : String(item.name || item.text || item.title || '');
                var val = typeof item === 'object' ? String(item.value || item.score || '') : String(item || '');
                var medal = idx === 0 ? '1.' : idx === 1 ? '2.' : idx === 2 ? '3.' : (idx + 1);
                return '<div class="world-module-rank-item">' +
                    '<span class="world-module-rank-num">' + medal + '</span>' +
                    '<span class="world-module-rank-name">' + escapeHtml(name) + '</span>' +
                    (val ? '<span class="world-module-rank-val">' + escapeHtml(val) + '</span>' : '') +
                    '</div>';
            }).join('');
            return '<div class="world-module world-module-ranking">' +
                (title ? '<div class="world-module-title">' + title + '</div>' : '') +
                '<div class="world-module-rank-list">' + rankHtml + '</div></div>';

        case 'key_value':
            if (!items || items.length === 0) return '';
            var kvHtml = items.map(function(item) {
                var k = item.key || item.name || '';
                var v = item.value || item.val || '';
                return '<div class="world-module-kv-row">' +
                    '<span class="world-module-kv-key">' + escapeHtml(k) + '</span>' +
                    '<span class="world-module-kv-val">' + escapeHtml(v) + '</span></div>';
            }).join('');
            return '<div class="world-module world-module-kv">' +
                (title ? '<div class="world-module-title">' + title + '</div>' : '') +
                '<div class="world-module-kv-body">' + kvHtml + '</div></div>';

        case 'cards':
            if (!items || items.length === 0) return '';
            var cardsHtml = items.map(function(item) {
                var cardTitle = item.name || item.title || '';
                var cardDesc = item.desc || item.description || item.content || '';
                var cardIcon = item.icon || '';
                return '<div class="character-card pearl-card" style="cursor:default;">' +
                    '<div class="avatar avatar-md" style="font-size:20px;">' + escapeHtml(cardIcon) + '</div>' +
                    '<div class="char-info">' +
                    '<div class="char-name">' + escapeHtml(cardTitle) + '</div>' +
                    (cardDesc ? '<div class="char-meta">' + escapeHtml(cardDesc) + '</div>' : '') +
                    '</div></div>';
            }).join('');
            return '<div class="world-module world-module-cards">' +
                (title ? '<div class="world-module-title">' + title + '</div>' : '') +
                '<div class="world-module-cards-grid">' + cardsHtml + '</div></div>';

        case 'comments':
            if (!items || items.length === 0) return '';
            var commentsHtml = items.map(function(item) {
                var author = item.author || item.name || '匿名';
                var text = item.text || item.content || item.comment || '';
                return '<div class="world-module-comment">' +
                    '<div class="world-module-comment-author">' + escapeHtml(author) + '</div>' +
                    '<div class="world-module-comment-text">' + escapeHtml(text) + '</div></div>';
            }).join('');
            return '<div class="world-module world-module-comments">' +
                (title ? '<div class="world-module-title">' + title + '</div>' : '') +
                '<div class="world-module-comments-list">' + commentsHtml + '</div></div>';

        case 'moments':
            // 朋友圈模块：显示最近几条动态摘要
            var momentPosts = [];
            if (mod.posts) {
                momentPosts = mod.posts.slice(0, 3);
            } else if (mod.moments && Array.isArray(mod.moments)) {
                momentPosts = mod.moments.slice(0, 3);
            }
            if (momentPosts.length === 0) return '';
            var momentsSummaryHtml = momentPosts.map(function(p) {
                var mAuthor = (p.author || '匿名').replace(/\n/g, '').trim();
                var mText = p.text || p.content || p.main || '';
                if (mText.length > 50) mText = mText.substring(0, 50) + '...';
                return '<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">' +
                    '<strong style="color:#576b95;">' + escapeHtml(mAuthor) + '</strong>: ' +
                    escapeHtml(mText) + '</div>';
            }).join('');
            return '<div class="world-module world-module-text">' +
                (title ? '<div class="world-module-title">' + title + '</div>' : '') +
                '<div class="world-module-content">' + momentsSummaryHtml + '</div></div>';

        default:
            return '<div class="world-module world-module-text">' +
                (title ? '<div class="world-module-title">' + title + '</div>' : '') +
                '<div class="world-module-content">' + content + '</div></div>';
    }
}
function renderWorldModules(modules) {
    modules = modules || [];
    // 增量更新：保留旧模块，用新模块替换同类型的
    if (!Array.isArray(gameState._worldModules)) gameState._worldModules = [];
    var existingTypes = {};
    gameState._worldModules.forEach(function(mod, idx) {
        if (mod && mod.type) existingTypes[mod.type] = idx;
    });
    modules.forEach(function(newMod) {
        if (!newMod || !newMod.type) return;
        if (existingTypes.hasOwnProperty(newMod.type)) {
            // 替换同类型旧模块
            gameState._worldModules[existingTypes[newMod.type]] = newMod;
        } else {
            // 新增模块
            gameState._worldModules.push(newMod);
        }
    });
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
            content = mod.content || '';
        }
        
        if (content.trim()) {
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

// 从文本中自动提取关键词（用于世界书条目）
function _extractKeywords(text) {
    if (!text || typeof text !== 'string') return [];
    // 常见停用词
    var stopWords = ['的', '了', '是', '在', '有', '和', '与', '或', '不', '也', '都', '而', '但', '又', '很', '非常', '可以', '这个', '那个', '一个', '什么', '如何', '怎样', '为什么', '因为', '所以', '如果', '虽然', '但是', '然而', '以及', '及其', '其中', '通过', '进行', '使用', '具有', '属于', '关于', '对于', '根据', '按照', '需要', '能够', '应该', '必须', '已经', '正在', '将', '被', '把', '让', '给', '到', '从', '对', '等', '着', '过', '得', '地', '之', '其', '此', '该', '各', '每', '某', '些', '种', '样', '般', '件', '个', '条', '名', '位', '次', '种', '类', '级', '个', '人', '中', '上', '下', '里', '外', '前', '后', '左', '右', '大', '小', '多', '少', '高', '低', '长', '短', '好', '坏', '新', '旧', '强', '弱', '快', '慢', '远', '近', '深', '浅', '重', '轻', '冷', '热', '黑', '白', '红', '蓝', '绿', '黄', '金', '银', '铁', '石', '水', '火', '风', '雷', '电', '光', '暗', '天', '地', '日', '月', '星', '云', '山', '海', '河', '湖', '林', '树', '花', '草', '鸟', '鱼', '龙', '凤', '虎', '狼', '蛇', '马', '牛', '羊', '猪', '狗', '猫', '鸡', '鹤', '鹰', '血', '骨', '魂', '灵', '神', '魔', '妖', '鬼', '仙', '佛', '道', '法', '术', '功', '技', '武', '剑', '刀', '枪', '弓', '甲', '盾', '药', '丹', '符', '阵', '宝', '玉', '珠', '镜', '书', '卷', '印', '令', '牌', '门', '派', '宗', '教', '国', '城', '镇', '村', '店', '楼', '阁', '宫', '殿', '塔', '洞', '谷', '峰', '崖', '岛', '洲', '大陆', '世界', '空间', '境界', '层次', '阶段', '等级', '品质', '属性', '效果', '能力', '技能', '天赋', '资质', '经验', '等级', '修炼', '突破', '瓶颈', '天劫', '渡劫', '飞升', '转生', '重生', '穿越', '系统', '任务', '奖励', '惩罚', '积分', '兑换', '商店', '拍卖', '交易', '战斗', '战争', '冲突', '联盟', '合作', '背叛', '阴谋', '秘密', '宝藏', '遗迹', '副本', '探险', '冒险', '旅程', '使命', '命运', '宿命', '因果', '轮回', '前世', '今生', '来世', '记忆', '遗忘', '觉醒', '封印', '诅咒', '祝福', '预言', '传说', '神话', '历史', '故事', '背景', '设定', '规则', '制度', '法律', '秩序', '混乱', '正义', '邪恶', '中立', '善良', '黑暗', '光明'];
    
    // 提取2-4字的词组作为关键词
    var keywords = [];
    var seen = {};
    
    // 按标点分割成句子
    var sentences = text.replace(/[，。！？、；：""''【】《》（）\[\]\{\}<>\/\\@#$%^&*\+\=\~`\|]/g, ' ').split(/\s+/);
    
    sentences.forEach(function(sentence) {
        // 提取2-4字词组
        for (var len = 4; len >= 2; len--) {
            for (var i = 0; i <= sentence.length - len; i++) {
                var word = sentence.substring(i, i + len);
                // 跳过纯数字、含停用词的
                if (/^\d+$/.test(word)) continue;
                var hasStop = stopWords.some(function(sw) { return word === sw; });
                if (hasStop) continue;
                if (!seen[word] && word.length >= 2) {
                    seen[word] = true;
                    keywords.push(word);
                }
            }
        }
    });
    
    // 按词频排序，取前15个
    var freq = {};
    keywords.forEach(function(w) { freq[w] = (freq[w] || 0) + 1; });
    var sorted = Object.keys(freq).sort(function(a, b) { return freq[b] - freq[a]; });
    
    // 去重：如果短词被长词包含，优先保留长词
    var filtered = [];
    sorted.forEach(function(word) {
        var isSubstr = filtered.some(function(existing) {
            return existing.indexOf(word) !== -1 && existing !== word;
        });
        if (!isSubstr && filtered.length < 15) {
            filtered.push(word);
        }
    });
    
    return filtered;
}

// 统一获取剧情列表的辅助函数（storyHistory 已合并到 conversationHistory）
function getStoryList() {
    return (gameState.conversationHistory || [])
        .filter(function(m) { return m.role === 'assistant'; })
        .map(function(m, idx) {
            return { text: m.content || '', time: '', index: idx };
        });
}

// 【已禁用】本地模板生成的"假"朋友圈/日记已下线，全部由 API 动态生成。
// 保留空函数（仅清空旧数据），避免残留的 _moments / _npcDiaries 污染新内容。
// 朋友圈：由 AI 返回的 world[].type === 'moments' 提供（renderMomentsPage 读取 _worldModules）
// 日记：由 AI 返回的 world[].type === 'diary' 提供（renderDiaryPage 读取 _worldModules）
function generateLocalContent() {
    // no-op: 一切走 API
}

// 根据剧情生成朋友圈（已禁用）
function generateMomentsFromStory(npcs, storyText) {
    // no-op: 一切走 API
    return;
}

// 根据剧情生成日记（已禁用）
function generateDiaryFromStory(npcs, storyText) {
    // no-op: 一切走 API
    return;
}
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

    // 从剧情文本中移除装饰XML标签（不显示在剧情区域）
    function stripDecorTags(text) {
        if (!text) return text;
        var result = text;

        // 移除所有已定义的装饰标签（排除giggle，因为心声需要在剧情中显示）
        Object.keys(_appDefs).forEach(function(tag) {
            if (_excludeTags.indexOf(tag) !== -1) return;
            var escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            var regex = new RegExp('<' + escapedTag + '[\\s>][\\s\\S]*?<\\/' + escapedTag + '>', 'gi');
            result = result.replace(regex, '');
        });

        // 移除 <style>...</style><div>...</div> 块（ice组件）
        result = result.replace(/<style[\s>][\s\S]*?<\/style>\s*<div[\s>][\s\S]*?<\/div>/gi, '');

        // 移除 <details>...</details> 块（小剧场简约模式）
        result = result.replace(/<details[\s>][\s\S]*?<\/details>/gi, '');

        // 移除导演手记注释 <!-- ... -->
        result = result.replace(/<!--[\s\S]*?-->/g, '');

        // 移除 <gossip_rules>...</gossip_rules> 块
        result = result.replace(/<gossip_rules[\s>][\s\S]*?<\/gossip_rules>/gi, '');

        // 移除 <snow_rules>...</snow_rules> 块
        result = result.replace(/<snow_rules[\s>][\s\S]*?<\/snow_rules>/gi, '');

        // 移除 <激活群组>...</激活群组> 块
        result = result.replace(/<激活群组[\s>][\s\S]*?<\/激活群组>/gi, '');

        // 移除 <NSFW设计>...</NSFW设计> 块
        result = result.replace(/<NSFW设计[\s>][\s\S]*?<\/NSFW设计>/gi, '');

        // 移除 <tableThink>...</tableThink> 块
        result = result.replace(/<tableThink[\s>][\s\S]*?<\/tableThink>/gi, '');

        // 移除 <tableEdit>...</tableEdit> 块
        result = result.replace(/<tableEdit[\s>][\s\S]*?<\/tableEdit>/gi, '');

        // 移除 <horae>...</horae> 块
        result = result.replace(/<horae[\s>][\s\S]*?<\/horae>/gi, '');

        // 移除 <horaeevent>...</horaeevent> 块
        result = result.replace(/<horaeevent[\s>][\s\S]*?<\/horaeevent>/gi, '');

        // 移除 <image>...</image> 块（文生图）
        result = result.replace(/<image[\s>][\s\S]*?<\/image>/gi, '');

        // 移除 <imgthink>...</imgthink> 块
        result = result.replace(/<imgthink[\s>][\s\S]*?<\/imgthink>/gi, '');

        // 移除更多文生图相关标签，彻底清理节省token
        // 移除 pollinations.ai 图片链接
        result = result.replace(/https?:\/\/gen\.pollinations\.ai\/image\/[^\s<>"']+/gi, '');
        // 移除 <文生图>...</文生图> 块
        result = result.replace(/<文生图[\s>][\s\S]*?<\/文生图>/gi, '');
        // 移除 image###...### 格式
        result = result.replace(/image###[\s\S]*?###/gi, '');
        // 移除 <img> 标签（AI可能生成的图片标签）
        result = result.replace(/<img[^>]*>/gi, '');

        // 移除多余的空行（超过2个连续换行压缩为2个）
        result = result.replace(/\n{3,}/g, '\n\n');

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

    function updateLogFeatureVisibility() {
        var mods = gameState._worldModules || [];
        var hasCalendar = mods.some(function(m) { return m.type === 'calendar'; });
        var hasAuthorNote = mods.some(function(m) { return m.type === 'author_note'; });
        var calEl = document.getElementById('logFeat-calendar');
        if (calEl) calEl.style.display = hasCalendar ? '' : 'none';
        var anEl = document.getElementById('logFeat-author_note');
        if (anEl) anEl.style.display = hasAuthorNote ? '' : 'none';
    }
    updateLogFeatureVisibility();

    // 联动：在日志页顶部显示"近期重要事件"摘要（来自记忆系统）
    // 【性能优化】summaryEl 只创建一次，后续渲染只更新内容
    var summaryEl = document.getElementById('logMemorySummary');
    if (!summaryEl) {
        summaryEl = document.createElement('div');
        summaryEl.id = 'logMemorySummary';
        summaryEl.style.cssText = 'margin:10px 16px 0;padding:12px 14px;background:linear-gradient(135deg,#fff3e0 0%,#fce4ec 100%);border-radius:10px;font-size:12px;line-height:1.7;cursor:pointer;';
        var mainC = document.getElementById('logMainContent');
        if (mainC) mainC.insertBefore(summaryEl, mainC.firstChild);
        summaryEl.addEventListener('click', function() {
            if (window.MemoryManagerUI) {
                MemoryManagerUI.show();
                if (window.UI) UI.showPage('memoryPage');
            }
        });
    }
    try {
        if (window.EnhancedMemory && EnhancedMemory.longTermMemory) {
            var events = EnhancedMemory.longTermMemory.importantEvents || [];
            var recent3 = events.slice(-3).reverse();
            if (recent3.length > 0) {
                var html = '🧠 <b>近期记忆</b> · 点击查看全部<br>';
                recent3.forEach(function(e) {
                    var imp = e.importance || 5;
                    var dot = imp >= 9 ? '🔴' : (imp >= 7 ? '🟡' : '🟢');
                    html += dot + ' ' + escapeHtml((e.content || '').substring(0, 40)) + (e.content && e.content.length > 40 ? '…' : '') + '<br>';
                });
                summaryEl.innerHTML = html;
                summaryEl.style.display = '';
            } else {
                summaryEl.style.display = 'none';
            }
        } else {
            summaryEl.style.display = 'none';
        }
    } catch (e) { console.warn('[LogPage] 记忆摘要渲染失败:', e); }

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
            var subContainer = document.getElementById('logSubContainer');
            subContainer.style.animation = 'slideOutLeft .2s ease forwards';
            TimerManager.setTimeout('logSubBack', function() {
                subContainer.style.display = 'none';
                subContainer.style.animation = 'slideInRight .3s ease';
                document.getElementById('logMainContent').style.display = 'block';
            }, 200);
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
    ], 4);
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
        .replace(/<s>([\s\S]*?)<\/s>/g, '<del style="color:#999;">$1</del>')
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

    if (html !== null) {
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
    } else if (type === 'achieve') {
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
    var chattedNpcs = gameState._chattedNpcs || {};
    var chattedNames = Object.keys(chattedNpcs).filter(function(name) {
        return chattedNpcs[name] && gameState.allCharacters[name];
    });

    if (chattedNames.length === 0) {
        return '<div class="chat-list-page">' +
            '<div class="empty-state"><div class="empty-state-icon"></div><p>暂无消息</p><p style="font-size:13px;margin-top:8px;color:#666;">请在「人际」页面选择角色<br>点击「找TA聊聊」开始对话</p></div>' +
            '</div>';
    }

    var colors = ['#ff4d4f', '#07c160', '#1890ff', '#722ed1', '#fa8c16', '#eb2f96', '#13c2c2', '#52c41a'];
    var seen = gameState._notifSeenSnapshot && gameState._notifSeenSnapshot.chat || {};
    var html = '<div class="chat-list-page">' +
        '<div class="chat-list">' +
        chattedNames.map(function(name) {
            var c = gameState.allCharacters[name];
            var now = new Date();
            var h = now.getHours();
            var m = String(now.getMinutes()).padStart(2, '0');
            var timeStr = (h < 12 ? '上午' : '下午') + (h > 12 ? h - 12 : h) + ':' + m;
            var colorIdx = name.charCodeAt(0) % colors.length;
            var avatarColor = colors[colorIdx];
            var lastMsg = '点击开始对话';
            var unreadNpc = 0;
            if (gameState._chatLogs && gameState._chatLogs[name]) {
                var logs = gameState._chatLogs[name];
                if (logs.length > 0) {
                    var last = logs[logs.length - 1];
                    lastMsg = last.text.length > 20 ? last.text.substring(0, 20) + '...' : last.text;
                }
                var npcSent = logs.filter(function(m) {
                    if (!m) return false;
                    if (m.role === 'player' || m.from === 'player' || m.from === 'me') return false;
                    return (m.text || '').trim();
                });
                var seenCount = seen[name] || 0;
                unreadNpc = Math.max(0, npcSent.length - seenCount);
            }
            var unreadBadge = unreadNpc > 0 ?
                '<span style="display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 6px;background:#ff3b30;color:#fff;border-radius:9px;font-size:11px;font-weight:600;margin-left:6px;">' + (unreadNpc > 99 ? '99+' : unreadNpc) + '</span>' : '';
            var boldStyle = unreadNpc > 0 ? 'font-weight:600;color:#111;' : '';
            return '<div class="chat-item" role="button" tabindex="0" onclick="openNpcChat(\'' + name
                .replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;') + '\')">' +
                '<div class="chat-avatar" style="background:' + avatarColor + ';">' + name.charAt(0) +
                '</div>' +
                '<div class="chat-content"><div class="chat-row"><div class="chat-name" style="' + boldStyle + '">' + escapeHtml(name) + unreadBadge +
                '</div><div class="chat-time">' + escapeHtml(timeStr) + '</div></div><div class="chat-preview" style="' + boldStyle + '">' +
                escapeHtml(lastMsg) + '</div></div></div>';
        }).join('') +
        '</div></div>';
    return html;
}
// =================================================================
// 通知中心：刷新红点 + 打开/关闭弹窗
// =================================================================
function computeNotificationCounts() {
    try {
        // 邮件未读
        var unreadMail = 0;
        var mailModules = (gameState._worldModules || []).filter(function(m) { return m.type === 'mail'; });
        mailModules.forEach(function(mod) {
            (mod.items || []).forEach(function(m) { if (m && !m.read) unreadMail++; });
        });
        if ((gameState._mails || []).length) {
            (gameState._mails || []).forEach(function(m) { if (m && !m.read) unreadMail++; });
        }
        // 聊天未读（NPC 主动消息，已读快照差值）
        var unreadChat = 0;
        var seen = (gameState._notifSeenSnapshot && gameState._notifSeenSnapshot.chat) || {};
        var logs = gameState._chatLogs || {};
        Object.keys(logs).forEach(function(name) {
            var arr = logs[name] || [];
            var npcSent = arr.filter(function(m) {
                if (!m) return false;
                if (m.role === 'player' || m.from === 'player' || m.from === 'me') return false;
                return (m.text || '').trim();
            }).length;
            var seenCount = seen[name] || 0;
            unreadChat += Math.max(0, npcSent - seenCount);
        });
        var total = unreadMail + unreadChat;
        return { unreadMail: unreadMail, unreadChat: unreadChat, total: total };
    } catch (e) {
        console.warn('[notif] computeNotificationCounts failed:', e);
        return { unreadMail: 0, unreadChat: 0, total: 0 };
    }
}
function refreshNotificationBadge() {
    try {
        var counts = computeNotificationCounts();
        var badge = document.getElementById('notifBadge');
        if (badge) {
            if (counts.total > 0) {
                badge.style.display = 'inline-flex';
                badge.textContent = counts.total > 99 ? '99+' : String(counts.total);
            } else {
                badge.style.display = 'none';
                badge.textContent = '0';
            }
        }
        // 同步菜单/通知徽章（如有）
        var menuBadge = document.getElementById('menuNotifBadge');
        if (menuBadge) {
            if (counts.total > 0) {
                menuBadge.style.display = 'inline-flex';
                menuBadge.textContent = counts.total > 99 ? '99+' : String(counts.total);
            } else {
                menuBadge.style.display = 'none';
            }
        }
        return counts;
    } catch (e) {
        console.warn('[notif] refreshNotificationBadge failed:', e);
        return { unreadMail: 0, unreadChat: 0, total: 0 };
    }
}
function openNotificationCenter() {
    try {
        var counts = computeNotificationCounts();
        var list = document.getElementById('notificationCenterList');
        var titleEl = document.getElementById('notificationCenterTitle');
        if (titleEl) titleEl.textContent = '通知中心 (' + counts.total + ')';
        if (list) {
            var html = '';
            // 邮件
            var mailModules = (gameState._worldModules || []).filter(function(m) { return m.type === 'mail'; });
            var allMails = [];
            mailModules.forEach(function(mod) { (mod.items || []).forEach(function(it) { allMails.push(it); }); });
            if (allMails.length === 0) allMails = gameState._mails || [];
            var unreadMails = allMails.filter(function(m) { return m && !m.read; });
            unreadMails.forEach(function(m) {
                var sender = m.from || m.sender || '未知';
                var subject = m.subject || '无主题';
                html += '<div class="pearl-card" style="padding:10px 12px;margin-bottom:8px;cursor:pointer;" onclick="openMailDetail(' + allMails.indexOf(m) + ');closeNotificationCenter();">' +
                    '<div style="font-size:13px;font-weight:600;color:#1a73e8;">' + escapeHtml(sender) + '</div>' +
                    '<div style="font-size:14px;color:#333;margin-top:2px;">' + escapeHtml(subject) + '</div>' +
                    '<div style="font-size:11px;color:#999;margin-top:4px;">' + escapeHtml(m.time || m.date || '') + '</div></div>';
            });
            // 聊天（NPC 主动消息）
            var seen = (gameState._notifSeenSnapshot && gameState._notifSeenSnapshot.chat) || {};
            var logs = gameState._chatLogs || {};
            Object.keys(logs).forEach(function(name) {
                var arr = logs[name] || [];
                var npcSent = arr.filter(function(m) {
                    if (!m) return false;
                    if (m.role === 'player' || m.from === 'player' || m.from === 'me') return false;
                    return (m.text || '').trim();
                });
                var seenCount = seen[name] || 0;
                var unreadNpc = Math.max(0, npcSent.length - seenCount);
                if (unreadNpc > 0) {
                    var last = npcSent[npcSent.length - 1];
                    var preview = (last && last.text) ? last.text : '';
                    if (preview.length > 30) preview = preview.substring(0, 30) + '...';
                    html += '<div class="pearl-card" style="padding:10px 12px;margin-bottom:8px;cursor:pointer;" onclick="closeNotificationCenter();openNpcChat(\'' + name.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\');">' +
                        '<div style="font-size:13px;font-weight:600;color:#07C160;">' + escapeHtml(name) + '</div>' +
                        '<div style="font-size:14px;color:#333;margin-top:2px;">' + escapeHtml(preview) + '</div>' +
                        '<div style="font-size:11px;color:#999;margin-top:4px;">' + unreadNpc + ' 条未读</div></div>';
                }
            });
            if (!html) {
                html = '<div style="padding:40px 20px;text-align:center;color:#999;font-size:13px;">暂无未读通知</div>';
            }
            list.innerHTML = html;
        }
        if (typeof UI !== 'undefined' && UI.showModal) {
            UI.showModal('notificationCenterModal');
        } else {
            var m = document.getElementById('notificationCenterModal');
            if (m) m.style.display = 'flex';
        }
    } catch (e) {
        console.warn('[notif] openNotificationCenter failed:', e);
    }
}
function closeNotificationCenter() {
    try {
        if (typeof UI !== 'undefined' && UI.hideModal) {
            UI.hideModal('notificationCenterModal');
        } else {
            var m = document.getElementById('notificationCenterModal');
            if (m) m.style.display = 'none';
        }
    } catch (e) {}
}
// 兼容旧调用名
function toggleNotifCenter() { openNotificationCenter(); }

function renderQuestsPage() {
    return null;
}
function renderAchievePage() {
    return null;
}
// 渲染世界信息页面
function renderWorldPage() {
    var modules = gameState._worldModules || [];
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
                        if (mT.length > 50) mT = mT.substring(0, 50) + '...';
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
        html +=
            '<div class="empty-state" style="padding:60px 20px;">写 暂无朋友圈动态<br><span style="font-size:12px;color:#ccc;">游戏进行中会自动生成</span></div>';
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
                        return n;
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
    var modules = (gameState._worldModules || []).filter(function(m) { return m.type === 'moments'; });
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
    safeAutoSave();
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
    safeAutoSave();
    UI.toast('评论成功');
    // 刷新朋友圈页面
    var content = document.getElementById('logSubContent');
    if (content) { content.innerHTML = renderMomentsPage(); var child = content.firstElementChild; if (child) { child.style.flex = '1'; child.style.minHeight = '0'; } }
}

function renderForumPage() {
    var modules = gameState._worldModules || [];
    var commentMods = modules.filter(function(m) {
        return m.type === 'comments';
    });
    var playerName = gameState.playerName || '我';
    var colors = ['#8d6e63', '#03a9f4', '#ff4d4f', '#07c160', '#722ed1', '#fa8c16', '#eb2f96', '#13c2c2',
        '#1890ff', '#52c41a'
    ];
    var tagClasses = ['hot', 'bao', 'xin', 'hot', 'bao', 'xin'];
    var timeLabels = ['刚刚', '1分钟前', '3分钟前', '5分钟前', '10分钟前', '半小时前', '1小时前', '2小时前', '昨天', '前天'];

    if (commentMods.length === 0) {
        return '<div class="forum-page">' +
            '<div style="flex:1;display:flex;align-items:center;justify-content:center;background:#fff;"><div class="empty-state"><div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><p>暂无论坛帖子</p><p style="font-size:12px;margin-top:4px;">游戏进行中会自动生成</p></div></div>' +
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
                return '<div style="padding:60px 20px;text-align:center;color:#999;">还没发表过评论<br><span style="font-size:12px;">去点击话题发表你的观点吧</span></div>';
            }
            return myCommented.map(function(item) {
                return '<div class="forum-mine-item" style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:#fff;border-bottom:1px solid #f0f0f0;cursor:pointer;" onclick="openForumPost(' + item.idx + ')">' +
                    '<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#1a73e8 0%,#4285f4 100%);color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;">💬</div>' +
                    '<div style="flex:1;min-width:0;">' +
                    '<div style="font-size:14px;color:#222;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(item.title) + '</div>' +
                    '<div style="font-size:12px;color:#999;margin-top:2px;">你发表了 ' + item.count + ' 条评论</div>' +
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
    var modules = gameState._worldModules || [];
    var rankMods = modules.filter(function(m) {
        return m.type === 'ranking';
    });
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
            } else if (typeof it === 'object' && it !== null) {
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
    var bag = gameState.currentBag || [];
    var playerName = gameState.playerName || '我';
    var currency = gameState.currency || gameState.money || gameState.coins || 0;
    var currencyName = gameState.currencyName || '金币';

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

    var modules = gameState._worldModules || [];
    var cardMods = modules.filter(function(m) {
        return m.type === 'cards';
    });
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
    var diaryModules = (gameState._worldModules || []).filter(function(m) {
        return m.type === 'diary';
    });
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
                    escapeHtml(npcName).replace(/'/g, "\\'") + '\')">' +
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
    var mailModules = (gameState._worldModules || []).filter(function(m) {
        return m.type === 'mail';
    });
    var allMails = [];
    mailModules.forEach(function(mod) {
        if (mod.items && Array.isArray(mod.items)) {
            mod.items.forEach(function(item) {
                allMails.push(item);
            });
        }
    });
    if (allMails.length === 0) {
        allMails = gameState._mails || [];
    }

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
            if (preview.length > 80) preview = preview.substring(0, 80) + '...';
            preview = preview.replace(/<[^>]*>/g, '');
            var subjectStyle = mail.read ? '' : 'font-weight:600;color:#111;';
            var senderStyle = mail.read ? '' : 'font-weight:600;color:#111;';
            return '<div class="mail-list-item' + unread + '" onclick="openMailDetail(' + i +
                ')" style="' + (mail.read ? '' : 'background:#f5f8ff;') + '">' +
                '<div class="mail-list-header">' + unreadDot + '<div class="mail-list-sender" style="' + senderStyle + '">' + escapeHtml(sender) +
                '</div><div class="mail-list-date">' + escapeHtml(date) + '</div></div>' +
                '<div class="mail-list-subject" style="' + subjectStyle + '">' + escapeHtml(subject) + '</div>' +
                '<div class="mail-list-preview">' + escapeHtml(preview) + '</div></div>';
        }).join('');
    }

    return '<div style="display:flex;flex-direction:column;flex:1;background:#fff;overflow:hidden;">' +
        '<div class="mail-big-title">收件箱</div>' +
        '<div class="mail-search-box"><div class="mail-search-input"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>搜索</div></div>' +
        '<div class="mail-scroll-list">' + mailListHtml + '</div>' +
        '<div class="mail-bottom-bar"><div class="mail-bottom-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>删除</div><div class="mail-bottom-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>分享</div><div class="mail-bottom-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>回复转发</div><div class="mail-bottom-btn"><span>...</span>更多</div></div>' +
        '</div>';
}
// 渲染商店页面
function renderShopPage() {
    var shopModules = (gameState._worldModules || []).filter(function(m) {
        return m.type === 'shop';
    });
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

    if (allGoods.length === 0) allGoods = gameState._shopGoods || [];

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

    var _balance = gameState.currency || gameState.money || gameState.coins || 0;
    var _cName = gameState.currencyName || '金币';
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
    var shopModules = (gameState._worldModules || []).filter(function(m) { return m.type === 'shop'; });
    var allGoods = [];
    shopModules.forEach(function(mod) {
        if (mod.items && Array.isArray(mod.items)) { mod.items.forEach(function(item) { allGoods.push(item); }); }
    });
    if (allGoods.length === 0) allGoods = gameState._shopGoods || [];
    if (index < 0 || index >= allGoods.length) return;
    var item = allGoods[index];
    var price = parseInt(item.price) || 0;
    var currency = parseInt(gameState.currency || gameState.money || gameState.coins || 0);
    var currencyName = gameState.currencyName || '金币';
    if (item.count !== undefined && item.count !== null && parseInt(item.count) <= 0) {
        UI.toast('该商品已售稀');
        return;
    }
    if (currency < price) {
        UI.toast(currencyName + '不足！需要 ' + price + '，当前 ' + currency);
        return;
    }
    // 扣款
    if (gameState.currency !== undefined) gameState.currency -= price;
    else if (gameState.money !== undefined) gameState.money -= price;
    else if (gameState.coins !== undefined) gameState.coins -= price;
    // 加入背包
    if (!gameState.currentBag) gameState.currentBag = [];
    var bagItem = { name: item.name || '未知物品', icon: item.icon || '物', count: item.count || 1, desc: item.desc || item.description || '', rarity: item.rarity || '普通', rarityClass: item.rarityClass || 'common' };
    // 检查背包是否已有同名物品
    var found = false;
    for (var i = 0; i < gameState.currentBag.length; i++) {
        if (gameState.currentBag[i].name === bagItem.name) {
            gameState.currentBag[i].count = (gameState.currentBag[i].count || 1) + (bagItem.count || 1);
            found = true; break;
        }
    }
    if (!found) gameState.currentBag.push(bagItem);
    if (item.count !== undefined && item.count !== null) {
        item.count = Math.max(0, (parseInt(item.count) || 0) - 1);
    }
    UI.toast('购买成功：' + bagItem.name);
    safeAutoSave();
    var newCurrency = parseInt(gameState.currency || gameState.money || gameState.coins || 0);
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
    var container = document.createElement('div');
    container.className = 'calendar-page';
    container.style.cssText = 'padding:20px;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);min-height:100%;';

    // 标题
    var title = document.createElement('h2');
    title.textContent = '📅 日程表';
    title.style.cssText = 'color:#e94560;margin-bottom:20px;text-align:center;';
    container.appendChild(title);

    // 获取日程数据
    var calendarModule = gameState._worldModules && gameState._worldModules.find(function(m) { return m.type === 'calendar'; });
    var events = (calendarModule && calendarModule.events) || [];

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
        var date = evt.time ? evt.time.split(' ')[0] : '待定';
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
            if (evt.location) metaText.push('📍 ' + evt.location);
            if (evt.type) metaText.push('🏷️ ' + evt.type);
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
    var container = document.createElement('div');
    container.className = 'author-note-page';
    container.style.cssText = 'padding:20px;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);min-height:100%;';

    // 标题
    var title = document.createElement('h2');
    title.textContent = '✍️ 作者有话说';
    title.style.cssText = 'color:#e94560;margin-bottom:20px;text-align:center;';
    container.appendChild(title);

    // 获取作话数据
    var noteModule = gameState._worldModules && gameState._worldModules.find(function(m) { return m.type === 'author_note'; });
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
            switch (mod.type) {
                case 'text':
                    inner = '<div style="font-size:14px;line-height:1.7;">' + parseMarkdown(mod
                        .content || '') + '</div>';
                    break;
                case 'list':
                    inner = (mod.items || []).map(function(it) {
                        return '<div style="padding:6px 0;font-size:14px;">▸ ' + it +
                            '</div>';
                    }).join('');
                    break;
                case 'ranking':
                    inner = (mod.items || []).map(function(it, i) {
                        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;"><span style="font-weight:600;color:' +
                            (i < 3 ? 'var(--text)' : 'var(--text-tertiary)') + ';">' + (i +
                                1) + '</span><span style="font-size:14px;">' + it +
                            '</span></div>';
                    }).join('');
                    break;
                case 'key_value':
                    inner = (mod.items || []).map(function(kv) {
                        return '<div class="player-field"><span class="player-field-label">' +
                            kv.key + '</span><span class="player-field-value">' + kv.value +
                            '</span></div>';
                    }).join('');
                    break;
                case 'cards':
                    inner = (mod.items || []).map(function(c) {
                        return '<div class="pearl-card" style="padding:12px;margin-bottom:8px;"><div style="font-weight:500;">' +
                            (c.icon || '') + ' ' + c.title +
                            '</div><div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">' +
                            (c.content || '') + '</div></div>';
                    }).join('');
                    break;
                case 'comments':
                    inner = '<div style="font-size:14px;margin-bottom:8px;">' + (mod.main || '') +
                        '</div>' + (mod.comments || []).map(function(cm) {
                            return '<div style="padding:8px 0;border-top:1px solid var(--border);font-size:13px;"><strong>' +
                                cm.name + ':</strong> ' + cm.text + '</div>';
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
                            if (mT3.length > 50) mT3 = mT3.substring(0, 50) + '...';
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
        return '<div class="empty-state"><div class="empty-state-icon">单</div><p>暂无内容</p><p style="font-size:12px;margin-top:4px;">该功能将在游戏进行中自动填充</p></div>';
    }
}

// ========================================
// 第9层: 玩家/背包/物品
// ========================================
// --- 玩家状态渲染 ---
function renderPlayerStats(player) {
    // 如果AI返回了新数据，更新存储（使用Object.assign确保字段完整）
    if (player) {
        var existing = gameState.playerData || { name: '', stats: [], details: [], bag: [] };
        gameState.playerData = Object.assign({}, existing, player);
        // stats 是数组格式 [{label, value}, ...]，直接替换而不是合并
        if (player.stats && Array.isArray(player.stats)) {
            gameState.playerData.stats = player.stats;
        }
        if (Array.isArray(player.details)) {
            gameState.playerData.details = player.details;
        }
        if (Array.isArray(player.bag)) {
            gameState.playerData.bag = player.bag;
        }
    }
    renderPlayerPage();
}
function renderPlayerPage() {
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
                var emoji = fav >= 60 ? '❤️' : (fav >= 30 ? '💚' : (fav <= -20 ? '💔' : '💬'));
                rsHtml += emoji + ' ' + escapeHtml(c.name) + (c.relation ? '（' + escapeHtml(c.relation) + '）' : '') + ' 好感 ' + fav + '<br>';
            });
            relationSummaryEl.innerHTML = rsHtml;
        } else {
            relationSummaryEl.innerHTML = '<span style="color:#999;">尚未遇见任何角色</span>';
        }
    } catch (e) { console.warn('[PlayerPage] 关系摘要渲染失败:', e); }

    if (!data) {
        nameEl.textContent = '未命名';
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

    nameEl.textContent = data.name || '未命名';
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
    gameState.currentBag = items || [];
    // 【修复】itemsGrid 是在 renderItemsPage() 中通过 innerHTML 动态创建到 logSubContent 里的，
    // 不存在时仅更新 gameState.currentBag，下次进入物品页会自动用最新数据渲染。
    var container = document.getElementById('itemsGrid');
    if (!container) return;
    if (gameState.currentBag.length === 0) {
        container.innerHTML =
            '<div class="empty-state"><div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></div><p>背包空空如也</p></div>';
        return;
    }
    // 【修复X3】物品数据需要转义；并使用与 renderItemsPage 一致的 items-box 结构，保证 filterBagItems 仍可工作
    container.innerHTML = gameState.currentBag.map(function(item) {
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
// updateReviewPanel: 收藏面板刷新（占位，后续可扩展）
function updateReviewPanel() {
    if (typeof renderRecapPage === 'function') renderRecapPage();
}
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
        // 【修复X7】剧情回顾摘要需要转义
        container.innerHTML = '<div class="recap-timeline">' + stories.map(function(s, i) {
            var isCurrent = i === stories.length - 1;
            var summary = (s.text || '').substring(0, 80);
            return '<div class="timeline-item ' + (isCurrent ? 'current' : '') +
                '" onclick="showRecapDetail(' + i + ')">' +
                '<div class="timeline-item-head"><span class="timeline-item-title">第' + (i + 1) +
                '段</span></div>' +
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
    ], 3);
}
function showRecapDetail(idx) {
    var stories = getStoryList();
    if (!stories[idx]) return;
    var s = stories[idx];
    var titleEl = document.getElementById('recapDetailTitle');
    var bodyEl = document.getElementById('recapDetailBody');
    if (!titleEl || !bodyEl) return;
    titleEl.textContent = '第' + (idx + 1) + '段';
    // 先解析AI回复提取纯文本剧情，避免显示JSON格式
    var parseResult = parseAIResponse(s.text);
    var storyText = parseResult.storyText || s.text;
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
        list = JSON.parse(localStorage.getItem('freeScript_presets') || '[]');
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
    safeSetItem('freeScript_presets', JSON.stringify(list));
}
function loadWorldPreset(idx) {
    var presets = getPresets();
    if (!presets[idx]) return;
    var gpEl = document.getElementById('worldDescription');
    if (gpEl) gpEl.value = presets[idx].prompt || '';
    var mcFields = ['mcName', 'mcGender', 'mcAge', 'mcIdentity', 'mcPersonality', 'mcAppearance',
        'mcAbility', 'mcExtra'
    ];
    var mc = presets[idx].mc || {};
    mcFields.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = mc[id] || '';
    });
    var pbEl = document.getElementById('presetBody');
    if (pbEl) pbEl.classList.remove('open');
}
function deleteWorldPreset(idx) {
    UI.confirm('删除世界', '确定删除这个世界？').then(function(ok) { if (!ok) return;
    var presets = getPresets();
    presets.splice(idx, 1);
    savePresets(presets);
    renderPresetList();
    }).catch(function(err) { console.error('[世界预设] 操作失败:', err); });
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
    var emojiEl = document.getElementById('presetActionEmoji');
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
        if (mc.mcPersonality || mc.mcAppearance) document.getElementById('setupPlayerDesc').value =
            (mc.mcPersonality || '') + (mc.mcAppearance ? '\n' + mc.mcAppearance : '');
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
            SaveDB.set(slotId, null).catch(function(e) {
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
    el.addEventListener(event, handler, opts);
    return true;
}
function bindEventQuery(selector, event, handler, opts) {
    var el = document.querySelector(selector);
    if (!el) {
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('[bindEventQuery] selector not found:', selector);
        }
        return false;
    }
    // 【性能优化】防重复绑定
    var bindKey = '_bound_' + event;
    if (el[bindKey]) return true;
    el[bindKey] = true;
    el.addEventListener(event, handler, opts);
    return true;
}

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
                    UI.toast('✅ 头像已更新');
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

    // ★ 收藏/记录按钮
    bindEvent('menuTopStar', 'click', function() {
        toggleTheme();
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
                UI.toast('已取消生成');
            }
        });
    }

    // 加载最新存档按钮
    bindEvent('btnMenuLoadLatest', 'click', function() {
        loadFromSlot(0).catch(function(e) {
            console.error('加载最新存档失败:', e);
            UI.toast('加载失败');
        });
    });

    // 设置按钮 → API配置
    bindEvent('btnMenuApiSettings', 'click', function() {
        renderAPISettings();
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
            'setupPlayerDesc'
        ];
        var mcMap = {
            setupPlayerName: 'mcName',
            setupPlayerGender: 'mcGender',
            setupPlayerIdentity: 'mcIdentity',
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
    // 通知中心按钮
    bindEvent('btnNotifCenter', 'click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof openNotificationCenter === 'function') {
            openNotificationCenter();
        } else if (typeof toggleNotifCenter === 'function') {
            toggleNotifCenter();
        }
    });
    // 通知中心关闭按钮
    var notifCloseBtn = document.getElementById('notificationCenterClose');
    if (notifCloseBtn) notifCloseBtn.addEventListener('click', closeNotificationCenter);
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
            sendAIRequest(text);
        }
    });
    bindEvent('btnSendAction', 'click', function() {
        var input = document.getElementById('customAction');
        var text = input.value.trim();
        if (!text) return;
        input.value = '';
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
                // 将编辑后的文本写回最后一条 assistant 消息
                gameState.conversationHistory[lastAssistantIdx].content = editedText;
            }

            safeAutoSave();

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
        UI.showPage('storyPage');
    });

    // NPC页面返回
    bindEvent('npcBackBtn', 'click', function() {
        UI.showPage('storyPage');
    });

    // 回顾页面返回
    bindEvent('recapBackBtn', 'click', function() {
        UI.showPage('storyPage');
    });

    // 回顾导出
    bindEvent('recapExportBtn', 'click', function() {
        exportStoryText();
    });

    // 日志页面返回
    bindEvent('logBackBtn', 'click', function() {
        UI.showPage('storyPage');
    });

    // 日志子页面返回按钮（已在 renderLogPage 中绑定，此处不再重复）

    // 设置弹窗
    bindEvent('streamOn', 'click', function() {
        gameState.useStream = true;
        this.classList.add('active');
        document.getElementById('streamOff').classList.remove('active');
        // 同步预设的流式开关
        var presetStreamToggle = document.getElementById('presetStreamToggle');
        if (presetStreamToggle) presetStreamToggle.classList.add('checked');
        if (typeof PresetManager !== 'undefined' && PresetManager.currentParams) {
            PresetManager.currentParams.stream = true;
        }
        saveGameSettings();
    });
    bindEvent('streamOff', 'click', function() {
        gameState.useStream = false;
        this.classList.add('active');
        document.getElementById('streamOn').classList.remove('active');
        // 同步预设的流式开关
        var presetStreamToggle = document.getElementById('presetStreamToggle');
        if (presetStreamToggle) presetStreamToggle.classList.remove('checked');
        if (typeof PresetManager !== 'undefined' && PresetManager.currentParams) {
            PresetManager.currentParams.stream = false;
        }
        saveGameSettings();
    });

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

    // 自动压缩
    bindEvent('autoCompressOn', 'click', function() {
        gameState.autoCompress = true;
        this.classList.add('active');
        document.getElementById('autoCompressOff').classList.remove('active');
        saveGameSettings();
    });
    bindEvent('autoCompressOff', 'click', function() {
        gameState.autoCompress = false;
        this.classList.add('active');
        document.getElementById('autoCompressOn').classList.remove('active');
        saveGameSettings();
    });
    // 增量更新开关
    bindEvent('incrementalOn', 'click', function() {
        if (typeof EnhancedMemory !== 'undefined') EnhancedMemory.compressionConfig.incrementalUpdate = true;
        this.classList.add('active');
        document.getElementById('incrementalOff').classList.remove('active');
        UI.toast('增量更新已开启');
    });
    bindEvent('incrementalOff', 'click', function() {
        if (typeof EnhancedMemory !== 'undefined') EnhancedMemory.compressionConfig.incrementalUpdate = false;
        this.classList.add('active');
        document.getElementById('incrementalOn').classList.remove('active');
        UI.toast('增量更新已关闭');
    });
    // 触发阈值选择
    bindEvent('compressThreshold', 'change', function() {
        if (typeof EnhancedMemory !== 'undefined') EnhancedMemory.compressionConfig.triggerThreshold = parseFloat(this.value);
        UI.toast('触发阈值已设置为 ' + (this.value * 100) + '%');
    });
    // 回滚摘要按钮
    bindEvent('btnRollbackSummary', 'click', function() {
        if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.rollbackSummary()) {
            UI.toast('已回滚到上一版本摘要');
            updateCompressionStats();
        } else {
            UI.toast('没有更早的版本可回滚');
        }
    });
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

    // 重新开始
    bindEvent('btnSettingsBackToMenu', 'click', async function() {
        if (await UI.confirm('返回主页', '确定要返回主页吗？当前进度会自动保存。')) {
            try { await saveGame(); } catch(e) {}
            safeAbort();
            window._currentAbort = null;
            UI.hideModal('settingsModal');
            UI.showPage('menuPage');
            UI.toast('已返回主页');
        }
    });

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
                if (key && key !== 'freeScript_settings' && key !== 'free_script_api_config' && key !== 'free_script_api_provider') {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(function(k) { localStorage.removeItem(k); });
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
                if (key2 && key2 !== 'free_script_api_config' && key2 !== 'free_script_api_provider') {
                    keysToRemove2.push(key2);
                }
            }
            keysToRemove2.forEach(function(k) { localStorage.removeItem(k); });
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
    document.querySelectorAll('[data-close]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            UI.hideModal(this.dataset.close);
        });
    });

    // NPC编辑保存
    bindEvent('npcEditSave', 'click', function() {
        saveNpcEdit();
    });

    // NPC详情聊天按钮
    bindEvent('btnNpcChat', 'click', function() {
        UI.hideModal('npcDetailModal');
        // 需要知道当前选中的NPC名字
        var body = document.getElementById('npcDetailBody');
        var nameEl = body.querySelector('h3');
        if (nameEl) openNpcChat(nameEl.textContent);
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

    // 自动轮询
    bindEvent('apiAutoRotateOn', 'click', function() {
        LocalGameAPI.setAutoRotate(true);
        this.classList.add('active');
        document.getElementById('apiAutoRotateOff').classList.remove('active');
    });
    bindEvent('apiAutoRotateOff', 'click', function() {
        LocalGameAPI.setAutoRotate(false);
        this.classList.add('active');
        document.getElementById('apiAutoRotateOn').classList.remove('active');
    });

    // 【修复】重置 API 配置（清空 localStorage 并恢复默认配置）
    var btnResetApi = document.getElementById('btnResetApiConfigs');
    if (btnResetApi) {
        btnResetApi.addEventListener('click', async function() {
            var ok = await UI.confirm('重置API配置', '将清空所有 API 配置（包括 API Key），恢复为默认配置。\n\n确定继续？');
            if (!ok) return;
            try { localStorage.removeItem('free_script_api_config'); } catch (e) {}
            try { localStorage.removeItem('free_script_api_errors'); } catch (e) {}
            if (LocalGameAPI._failedModels) LocalGameAPI._failedModels = {};
            // 重新初始化
            LocalGameAPI._configs = [{
                baseUrl: 'https://api.iamhc.cn/v1', apiKey: '', model: 'auto', models: []
            },
            { baseUrl: 'https://api.iamhc.cn/v1', apiKey: '', model: 'Qwen3.6-35B-A3B', models: [] },
            { baseUrl: 'https://api.iamhc.cn/v1', apiKey: '', model: 'Qwen3.6-35B-A3B', models: [] },
            { baseUrl: 'https://api.iamhc.cn/v1', apiKey: '', model: 'Qwen3.6-35B-A3B', models: [] },
            { baseUrl: 'https://api.iamhc.cn/v1', apiKey: '', model: 'Qwen3.6-35B-A3B', models: [] }];
            LocalGameAPI._currentSlot = 0;
            LocalGameAPI.save();
            renderAPISettings();
            UI.toast('已重置为默认配置（请重新填入 API Key）');
        });
    }

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

    // 初始化自动轮询UI
    if (LocalGameAPI._autoRotate) {
        document.getElementById('apiAutoRotateOn').classList.add('active');
        document.getElementById('apiAutoRotateOff').classList.remove('active');
    } else {
        document.getElementById('apiAutoRotateOff').classList.add('active');
        document.getElementById('apiAutoRotateOn').classList.remove('active');
    }

    // 初始化流式UI
    if (gameState.useStream) {
        document.getElementById('streamOn').classList.add('active');
        document.getElementById('streamOff').classList.remove('active');
    } else {
        document.getElementById('streamOff').classList.add('active');
        document.getElementById('streamOn').classList.remove('active');
    }

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
    if (gameState.autoCompress !== false) {
        document.getElementById('autoCompressOn').classList.add('active');
        document.getElementById('autoCompressOff').classList.remove('active');
    } else {
        document.getElementById('autoCompressOff').classList.add('active');
        document.getElementById('autoCompressOn').classList.remove('active');
    }
    // 初始化增量更新UI
    if (typeof EnhancedMemory !== 'undefined' && !EnhancedMemory.compressionConfig.incrementalUpdate) {
        document.getElementById('incrementalOff').classList.add('active');
        document.getElementById('incrementalOn').classList.remove('active');
    }
}
function startNewGame() {
    var prompt = document.getElementById('worldDescription').value.trim();
    if (!prompt) {
        UI.toast('请描述你想玩的游戏');
        return;
    }

    // ======== 重置所有游戏数据 ========
    gameState = createDefaultGameState();
    streamBuffer = '';
    isWaiting = false;
    isCompressing = false;
    lastCompressTime = 0;
    _streamModeLocked = false;
    _streamMode = null;

    // 清空增强记忆系统（核心修复：防止旧记忆污染新游戏）
    if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.clear) {
        EnhancedMemory.clear();
    }

    // 清空NPC聊天状态
    npcChatState.npcName = '';
    npcChatState.chatHistory = [];
    npcChatState.abortController = null;
    npcChatState.isSending = false;

    // 清空打字机缓冲
    TypewriterBuffer.stop();

    // 清空UI残留
    var storyEl = document.getElementById('storyText');
    if (storyEl) storyEl.innerHTML = '';

    // ======== 开始新游戏 ========
    gameState.userPrompt = prompt;

    // 收集主角设定
    gameState.protagonistSetup = {};
    var mcMap = {
        setupPlayerName: 'mcName',
        setupPlayerGender: 'mcGender',
        setupPlayerIdentity: 'mcIdentity',
        setupPlayerDesc: 'mcPersonality'
    };
    Object.keys(mcMap).forEach(function(id) {
        var el = document.getElementById(id);
        if (el && el.value.trim()) gameState.protagonistSetup[mcMap[id]] = el.value.trim();
    });

    // 保存上次填写
    safeSetItem('freeScript_lastPrompt', prompt);

    UI.showPage('storyPage');

    // 渲染底部导航栏
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
        if (allText.length > 15000) allText = allText.substring(0, 15000) + '\n\n...（后续内容省略）';

        // 构建角色信息
        var charInfo = '';
        if (gameState.worldSnapshot && gameState.worldSnapshot.characters) {
            charInfo = gameState.worldSnapshot.characters.map(function(c) {
                return c.name + (c.relation ? '（' + c.relation + '）' : '');
            }).join('、');
        }
        var playerName = gameState.playerName || (gameState.worldSnapshot && gameState.worldSnapshot.player && gameState.worldSnapshot.player.name) || '主角';
        var worldTheme = (gameState.userPrompt || '').substring(0, 100);

        var prompt = '你是一个游戏结局生成器。根据以下游戏剧情，生成一个完整的结局。\n\n' +
            '【世界观】' + worldTheme + '\n' +
            '【主角】' + playerName + '\n' +
            '【主要角色】' + (charInfo || '未知') + '\n\n' +
            '【要求】\n' +
            '1. 用JSON格式回复：{"title":"结局标题","summary":"结局概述（200字）","epilogue":"后记（300字）","names":"相关角色名，用顿号分隔"}\n' +
            '2. 结局要符合剧情发展，有始有终\n' +
            '3. 直接输出JSON，不要代码块包裹\n' +
            '4. names字段中的角色名用顿号（、）分隔\n\n' +
            '【剧情】\n' + allText;

        var result = await callAI([{
            role: 'system',
            content: '你是专业的游戏结局编剧，擅长为文字冒险游戏创作有深度、有画面感的结局。所有输出必须用中文。'
        }, {
            role: 'user',
            content: prompt
        }], {
            stream: false,
            max_tokens: 2048,
            temperature: 0.7
        });
        var parsed = safeJSONParse(result);
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
                    if (data.characters) mergeCharacters(data.characters);
                    if (data.world) renderWorldModules(data.world);
                    if (data.world && typeof EnhancedMemory !== 'undefined' && EnhancedMemory.longTermMemory.worldNotes.length === 0) {
                        _autoExtractWorldNotes(data.world);
                    }
                    if (data.bag) renderBag(data.bag);
                    if (data.quests) {
                        mergeQuests(data.quests);
                        renderQuests();
                    }
                    if (data.relationships) {
                        mergeRelationships(data.relationships);
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
                        if (!gameState.gameTime) gameState.gameTime = {};
                        Object.assign(gameState.gameTime, data.gameTime);
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
    // 【修复】使用预设的 continue_nudge_prompt，而非硬编码文本
    var continuePrompt = '[Continue your last message...]';
    try {
        if (typeof PresetManager !== 'undefined' && PresetManager.presets && PresetManager.presets[PresetManager.currentPresetIndex]) {
            var preset = PresetManager.presets[PresetManager.currentPresetIndex];
            if (preset.continue_nudge_prompt) {
                continuePrompt = preset.continue_nudge_prompt;
            }
        }
    } catch(e) {
        console.warn('[continueStory] 获取 continue_nudge_prompt 失败:', e);
    }
    // 防 unhandledrejection：捕获异步错误
    try {
        var p = sendAIRequest(continuePrompt);
        if (p && typeof p.catch === 'function') {
            p.catch(function(e) {
                if (e && e.name === 'AbortError') return;
                console.error('[继续剧情] 异步操作失败:', e);
            });
        }
    } catch (e) {
        console.error('[继续剧情] 同步错误:', e);
    }
}
function deleteLastTurn() {
    // 检查撤销历史
    if (gameState._undoHistory && gameState._undoHistory.length > 0) {
        var lastUndo = gameState._undoHistory.pop();
        // 恢复到撤销前的状态
        gameState.conversationHistory = lastUndo.conversationHistory || [];
        // storyHistory 已合并到 conversationHistory
        gameState.allCharacters = lastUndo.allCharacters || {};
        gameState.worldSnapshot = lastUndo.worldSnapshot || {};
        gameState.keyEvents = lastUndo.keyEvents || [];
        gameState.currentQuests = lastUndo.currentQuests || [];
        gameState.relationships = lastUndo.relationships || [];
        gameState.currentBag = lastUndo.currentBag || [];
        
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
    // 限制最多10条
    if (gameState._undoHistory.length >= (gameState._MAX_UNDO_HISTORY || 50)) {
        gameState._undoHistory.shift(); // 移除最旧的
    }
    // 保存当前状态快照
    gameState._undoHistory.push({
        conversationHistory: JSON.parse(JSON.stringify(gameState.conversationHistory)),
        // storyHistory 已合并到 conversationHistory
        allCharacters: JSON.parse(JSON.stringify(gameState.allCharacters || {})),
        worldSnapshot: JSON.parse(JSON.stringify(gameState.worldSnapshot || {})),
        keyEvents: JSON.parse(JSON.stringify(gameState.keyEvents || [])),
        currentQuests: JSON.parse(JSON.stringify(gameState.currentQuests || [])),
        relationships: JSON.parse(JSON.stringify(gameState.relationships || [])),
        currentBag: JSON.parse(JSON.stringify(gameState.currentBag || [])),
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

        // 红色感叹号图标
        var errorIcon = isFailed ?
            '<span style="color:#ff3b30;margin-left:6px;font-size:14px;">❗</span>' : '';

        return '<div class="pearl-card api-card" role="button" tabindex="0" style="padding:14px;margin-bottom:10px;cursor:pointer;' +
            (isCurrent ? 'border-color:var(--text);' : '') + (isFailed ? 'border-color:#ff3b30;' :
                '') + '" onclick="showApiDetail(' + i + ')" data-api-index="' + i + '">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<div><div style="font-size:14px;font-weight:500;display:flex;align-items:center;">' +
            apiName + errorIcon + '</div>' +
            '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">' +
            urlDisplay + ' · ' + modelDisplay + '</div></div>' +
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
            tabsHtml += '<button class="tag-btn api-group-tab" data-group="' + g + '" data-group-name="' + g.replace(/'/g, "\\'") + '">' + g + '</button>';
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
                if (groupName && confirm('确定要删除分组"' + groupName + '"吗？该分组下的API将变为未分组。')) {
                    LocalGameAPI.deleteGroup(groupName);
                    renderAPISettings();
                    UI.toast('分组已删除');
                }
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
    var proxyUrlInput = document.getElementById('detailApiProxyUrl');
    if (proxyUrlInput) {
        proxyUrlInput.value = LocalGameAPI.getProxyUrl();
    }
    var proxyTestResult = document.getElementById('proxyTestResult');
    if (proxyTestResult) proxyTestResult.style.display = 'none';
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
                var icon = log.success ? '✅' : '❌';
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
                    var icon = log.success ? '✅' : '❌';
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
                    var icon = log.success ? '✅' : '❌';
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
        var proxyUrlEl = document.getElementById('detailApiProxyUrl');
        if (proxyUrlEl) {
            LocalGameAPI.setProxyUrl(proxyUrlEl.value.trim());
        }
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
                UI.toast('❌ 测试失败: ' + translateError(e.message || '未知错误'));
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

    var testProxyBtn = document.getElementById('btnTestProxy');
    if (testProxyBtn) {
        var newTestProxyBtn = testProxyBtn.cloneNode(true);
        testProxyBtn.parentNode.replaceChild(newTestProxyBtn, testProxyBtn);
        newTestProxyBtn.addEventListener('click', async function() {
            var proxyUrl = document.getElementById('detailApiProxyUrl').value.trim();
            var resultEl = document.getElementById('proxyTestResult');
            if (!resultEl) return;

            if (!proxyUrl) {
                resultEl.style.display = 'block';
                resultEl.style.color = 'var(--danger)';
                resultEl.textContent = '请先填写代理地址';
                return;
            }

            newTestProxyBtn.textContent = '测试中...';
            newTestProxyBtn.disabled = true;
            resultEl.style.display = 'block';
            resultEl.style.color = 'var(--text-tertiary)';
            resultEl.textContent = '正在测试代理连通性...';

            try {
                var oldProxy = LocalGameAPI.getProxyUrl();
                LocalGameAPI.setProxyUrl(proxyUrl);
                var baseUrl = document.getElementById('detailApiUrl').value.trim();
                var result = await LocalGameAPI.checkConnectivity(baseUrl);
                if (result.ok) {
                    resultEl.style.color = 'var(--success)';
                    resultEl.textContent = '✓ 代理连接正常';
                } else {
                    resultEl.style.color = 'var(--danger)';
                    resultEl.textContent = '✗ ' + result.message;
                }
            } catch (e) {
                resultEl.style.color = 'var(--danger)';
                resultEl.textContent = '✗ 测试失败: ' + e.message;
            } finally {
                newTestProxyBtn.textContent = '测试';
                newTestProxyBtn.disabled = false;
            }
        });
    }

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
                select.innerHTML = '<option value="">选择模型</option>';
                var failedCount = 0;
                models.forEach(function(m) {
                    if (LocalGameAPI.isModelFailed(m)) {
                        failedCount++;
                        return;
                    }
                    var opt = document.createElement('option');
                    opt.value = m;
                    opt.textContent = m;
                    select.appendChild(opt);
                });
                if (cfg.model && !LocalGameAPI.isModelFailed(cfg.model)) select.value = cfg
                    .model;
                var availableCount = models.length - failedCount;
                var msg = '获取到 ' + availableCount + ' 个可用模型';
                if (failedCount > 0) msg += '，' + failedCount + ' 个失败模型已隐藏';
                UI.toast(msg);
                // 保存可用模型数量到配置
                LocalGameAPI._configs[slot].availableModels = availableCount;
                LocalGameAPI.save();
                // 更新显示
                var modelEl = document.getElementById('apiDetailModels');
                if (modelEl) modelEl.textContent = availableCount;
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
                    var icon = log.success ? '✅' : '❌';
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
            select.innerHTML = '<option value="">选择模型</option>';
            models.forEach(function(m) {
                var opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                select.appendChild(opt);
            });
            UI.toast('获取到 ' + models.length + ' 个模型');
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
    var storyLengthEl = document.getElementById('settingStoryLength');
    if (storyLengthEl) {
        var len = parseInt(storyLengthEl.value);
        if (len && len >= 100) {
            gameState.maxTokens = len;
            // 【同步】设置页面的剧情长度修改后，同步到预设的max_tokens
            if (typeof PresetManager !== 'undefined' && PresetManager.currentParams) {
                PresetManager.currentParams.max_tokens = len;
                var maxTokensEl = document.getElementById('presetMaxTokens');
                if (maxTokensEl) maxTokensEl.value = len;
            }
        }
    }
    // 保存字数控制配置
    gameState.wordCountConfig = {
        enabled: document.getElementById('wcEnabled') ? document.getElementById('wcEnabled').checked : true,
        min: parseInt(document.getElementById('wcMin').value) || 1500,
        max: parseInt(document.getElementById('wcMax').value) || 3000,
        paragraphMin: parseInt(document.getElementById('wcParaMin').value) || 15,
        paragraphMax: parseInt(document.getElementById('wcParaMax').value) || 17,
        paragraphStyle: document.getElementById('wcParagraphStyle') ? document.getElementById('wcParagraphStyle').value : 'medium',
        perspective: document.getElementById('wcPerspective') ? document.getElementById('wcPerspective').value : 'third_person_limited',
        userPronoun: document.getElementById('wcUserPronoun') ? document.getElementById('wcUserPronoun').value : 'second_person',
        takeover: document.getElementById('wcTakeover') ? document.getElementById('wcTakeover').value : 'closed',
        narrate: document.getElementById('wcNarrate') ? document.getElementById('wcNarrate').value : 'closed'
    };
    // 保存默认参数设置（预设会覆盖这些）
    var defaultParams = {
        contextLength: parseInt(document.getElementById('settingContextLength') ? document.getElementById('settingContextLength').value : 8192) || 8192,
        temperature: parseFloat(document.getElementById('settingTemperature') ? document.getElementById('settingTemperature').value : 0.8) || 0.8,
        topP: parseFloat(document.getElementById('settingTopP') ? document.getElementById('settingTopP').value : 0.9) || 0.9,
        topK: parseInt(document.getElementById('settingTopK') ? document.getElementById('settingTopK').value : 0) || 0,
        frequencyPenalty: parseFloat(document.getElementById('settingFreqPen') ? document.getElementById('settingFreqPen').value : 0) || 0,
        presencePenalty: parseFloat(document.getElementById('settingPresPen') ? document.getElementById('settingPresPen').value : 0) || 0,
        repeatPenalty: parseFloat(document.getElementById('settingRepeatPen') ? document.getElementById('settingRepeatPen').value : 1.1) || 1.1
    };
    // 使用预设温度而非硬编码，避免覆盖预设设置
    gameState.temperature = (typeof PresetManager !== 'undefined' && PresetManager.currentParams) ? PresetManager.currentParams.temperature : defaultParams.temperature;
    gameState.autoCompress = document.getElementById('autoCompressOn') && document.getElementById(
        'autoCompressOn').classList.contains('active');
    gameState.generateChoices = true;
    safeSetItem('freeScript_settings', JSON.stringify({
        useStream: gameState.useStream,
        temperature: gameState.temperature,
        fontSize: gameState.fontSize,
        wordCountConfig: gameState.wordCountConfig,
        autoCompress: gameState.autoCompress,
        generateChoices: gameState.generateChoices,
        maxTokens: gameState.maxTokens,
        defaultParams: defaultParams
    }));
    applyFontSize();
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
async function exportSaves() {
    try {
        var allSaves = await SaveDB.getAll();
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
        var blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = '自由剧本存档_' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        TimerManager.setTimeout('revokeExportURL', function() { URL.revokeObjectURL(url); }, 1000);
        UI.toast('✅ 已导出 ' + Object.keys(allSaves).length + ' 个存档');
    } catch (e) {
        UI.toast('❌ 导出失败：' + translateError(e.message));
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
            UI.toast('❌ 文件格式不正确');
            return;
        }
        var slots = Object.keys(saves);
        if (slots.length === 0) {
            UI.toast('❌ 存档文件中没有有效存档');
            return;
        }
        // 验证每个存档的基本结构
        var validCount = 0;
        for (var k = 0; k < slots.length; k++) {
            var s = saves[slots[k]];
            if (s && s.state && s.time) validCount++;
        }
        if (validCount === 0) {
            UI.toast('❌ 存档文件中没有有效数据');
            return;
        }
        var msg = '发现 ' + validCount + ' 个存档。\n\n【确定】= 覆盖导入（清空现有存档）\n【取消】= 选择合并模式';
        var overwrite = await UI.confirm('导入存档', msg);
        if (overwrite) {
            // 覆盖模式
            for (var i = 0; i < slots.length; i++) {
                var slot = parseInt(slots[i]);
                if (!isNaN(slot) && saves[slots[i]]) {
                    await SaveDB.set(slot, saves[slots[i]]);
                }
            }
            UI.toast('✅ 覆盖导入完成');
        } else {
            // 合并模式
            var merge = await UI.confirm('合并导入', '确认以【合并模式】导入？（不会覆盖已有存档）');
            if (!merge) return;
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
            UI.toast('✅ 合并导入完成');
        }
        renderSaveUI();
    } catch (e) {
        UI.toast('❌ 导入失败：' + translateError(e.message));
        console.error('导入失败:', e);
    }
}
function openSettingsModal() {
    // 更新上下文信息
    var msgCount = gameState.conversationHistory ? gameState.conversationHistory.length : 0;
    var total = 0;
    if (gameState.conversationHistory) {
        gameState.conversationHistory.forEach(function(m) {
            total += (m.content || '').length;
        });
    }
    var estimated = Math.round(total * 1.5);
    var contextInfo = document.getElementById('contextInfo');
    if (contextInfo) contextInfo.textContent = '上下文: ' + msgCount + ' 条 | 约 ' + (estimated > 1000 ? (
        estimated / 1000).toFixed(1) + 'k' : estimated) + ' token';

    // 更新剧情长度
    var lengthEl = document.getElementById('settingStoryLength');
    if (lengthEl) lengthEl.value = gameState.maxTokens || 2048;

    // 同步预设参数到设置面板（预设 > 默认）
    if (typeof PresetManager !== 'undefined' && PresetManager.currentParams) {
        var p = PresetManager.currentParams;
        var el = function(id) { return document.getElementById(id); };
        if (el('settingContextLength') && p.context_length) el('settingContextLength').value = p.context_length;
        if (el('settingTemperature') && p.temperature !== undefined) el('settingTemperature').value = p.temperature;
        if (el('settingTopP') && p.top_p !== undefined) el('settingTopP').value = p.top_p;
        if (el('settingTopK') && p.top_k !== undefined) el('settingTopK').value = p.top_k;
        if (el('settingFreqPen') && p.frequency_penalty !== undefined) el('settingFreqPen').value = p.frequency_penalty;
        if (el('settingPresPen') && p.presence_penalty !== undefined) el('settingPresPen').value = p.presence_penalty;
        if (el('settingRepeatPen') && p.repeat_penalty !== undefined) el('settingRepeatPen').value = p.repeat_penalty;
    }

    // 显示设置弹窗
    UI.showModal('settingsModal');
}
// --- saveGameSettings 适配（已删除，使用上方完整实现） ---

// --- loadGameSettings 适配 ---
function loadGameSettings() {
    var s = localStorage.getItem('freeScript_settings');
    var defaultParams = null;
    if (s) {
        try {
            var d = JSON.parse(s);
            gameState.temperature = d.temperature || 0.8;
            gameState.fontSize = d.fontSize || 16;
            gameState.autoCompress = d.autoCompress !== false;
            gameState.useStream = d.useStream !== false;
            gameState.generateChoices = true;
            if (d.maxTokens) gameState.maxTokens = d.maxTokens;
            // 加载默认参数设置
            if (d.defaultParams) defaultParams = d.defaultParams;
            // 加载字数控制配置
            if (d.wordCountConfig) gameState.wordCountConfig = Object.assign(gameState.wordCountConfig || {}, d.wordCountConfig);
            if (gameState.wordCountConfig) {
                var wc = gameState.wordCountConfig;
                var el = function(id) { return document.getElementById(id); };
                if (el('wcEnabled')) el('wcEnabled').checked = wc.enabled !== false;
                if (el('wcMin')) el('wcMin').value = wc.min || 1500;
                if (el('wcMax')) el('wcMax').value = wc.max || 3000;
                if (el('wcParaMin')) el('wcParaMin').value = wc.paragraphMin || 15;
                if (el('wcParaMax')) el('wcParaMax').value = wc.paragraphMax || 17;
                if (el('wcParagraphStyle')) el('wcParagraphStyle').value = wc.paragraphStyle || 'medium';
                if (el('wcPerspective')) el('wcPerspective').value = wc.perspective || 'third_person_limited';
                if (el('wcUserPronoun')) el('wcUserPronoun').value = wc.userPronoun || 'second_person';
                if (el('wcTakeover')) el('wcTakeover').value = wc.takeover || 'closed';
                if (el('wcNarrate')) el('wcNarrate').value = wc.narrate || 'closed';
            }
        } catch (e) {
            console.warn('加载设置失败，使用默认值:', e);
        }
    }
    // 恢复默认参数UI（预设未加载时生效）
    var hasPresetLoaded = (typeof PresetManager !== 'undefined' && PresetManager.currentPresetIndex >= 0);
    if (!hasPresetLoaded && defaultParams) {
        var el2 = function(id) { return document.getElementById(id); };
        if (el2('settingContextLength')) el2('settingContextLength').value = defaultParams.contextLength || 8192;
        if (el2('settingTemperature')) el2('settingTemperature').value = defaultParams.temperature !== undefined ? defaultParams.temperature : 0.8;
        if (el2('settingTopP')) el2('settingTopP').value = defaultParams.topP !== undefined ? defaultParams.topP : 0.9;
        if (el2('settingTopK')) el2('settingTopK').value = defaultParams.topK !== undefined ? defaultParams.topK : 0;
        if (el2('settingFreqPen')) el2('settingFreqPen').value = defaultParams.frequencyPenalty !== undefined ? defaultParams.frequencyPenalty : 0;
        if (el2('settingPresPen')) el2('settingPresPen').value = defaultParams.presencePenalty !== undefined ? defaultParams.presencePenalty : 0;
        if (el2('settingRepeatPen')) el2('settingRepeatPen').value = defaultParams.repeatPenalty !== undefined ? defaultParams.repeatPenalty : 1.1;
    }
    applyFontSize();
}

// ========================================
// 第15层: 任务/成就系统
// ========================================
// ========================================
// 任务系统
// ========================================
// 渲染任务页面（返回null让QuestSystem处理）
// 渲染成就页面（返回null让AchievementSystem处理）
// ========================================
