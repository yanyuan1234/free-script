/* ====== 深宫帝王录 - UI 渲染与交互 ====== */

(function() {
    'use strict';

    // ====== DOM 引用 ======
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // 创建界面
    const createScreen = $('#screen-create');
    const gameScreen = $('#screen-game');

    // 创建表单
    const inputName = $('#input-name');
    const genderGroup = $('#gender-group');
    const inputMonth = $('#input-month');
    const inputDay = $('#input-day');
    const motherRankGroup = $('#mother-rank-group');
    const motherPersonalityGroup = $('#mother-personality-group');
    const createPortrait = $('#create-portrait');
    const btnRerollPortrait = $('#btn-reroll-portrait');
    const btnStart = $('#btn-start');

    // 游戏界面
    const uiEra = $('#ui-era');
    const uiDate = $('#ui-date');
    const uiShichen = $('#ui-shichen');
    const barFavor = $('#bar-favor');
    const barPrestige = $('#bar-prestige');
    const barControl = $('#bar-control');
    const btnPause = $('#btn-pause');
    const btnSpeed = $('#btn-speed');
    const btnSkipEvent = $('#btn-skip-event');
    const gamePortrait = $('#game-portrait');
    const portraitName = $('#portrait-name');
    const eventList = $('#event-list');
    const choiceList = $('#choice-list');
    const bottomNav = $('#bottom-nav');
    const sidePanel = $('#side-panel');
    const panelTitle = $('#panel-title');
    const panelBody = $('#panel-body');
    const btnClosePanel = $('#btn-close-panel');
    const modalOverlay = $('#modal-overlay');
    const modalContent = $('#modal-content');
    const toastContainer = $('#toast-container');

    // ====== 状态 ======
    let currentPortrait = null;
    let selectedGender = 'male';
    let selectedMotherRank = 'noble';
    let selectedMotherPersonality = 'buddhist';
    let currentPanel = 'log';

    // ====== 初始化创建界面 ======
    function initCreateScreen() {
        // 填充月份
        for (let m = 1; m <= 12; m++) {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = MONTHS[m - 1] + '月';
            inputMonth.appendChild(opt);
        }
        // 填充日期
        for (let d = 1; d <= 30; d++) {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d + '日';
            inputDay.appendChild(opt);
        }

        // 随机立绘
        rerollPortrait();

        // 按钮组交互
        initBtnGroup(genderGroup, (val) => {
            selectedGender = val;
            rerollPortrait();
        });
        initBtnGroup(motherRankGroup, (val) => {
            selectedMotherRank = val;
        });
        initBtnGroup(motherPersonalityGroup, (val) => {
            selectedMotherPersonality = val;
        });

        // 换一换
        btnRerollPortrait.addEventListener('click', rerollPortrait);

        // 开始游戏
        btnStart.addEventListener('click', startGame);
    }

    function initBtnGroup(group, onChange) {
        const btns = group.querySelectorAll('.btn-choice');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (onChange) onChange(btn.dataset.value);
            });
        });
    }

    function rerollPortrait() {
        currentPortrait = portraitGen.randomParts(selectedGender, selectedGender === 'male' ? 'prince' : 'princess');
        portraitGen.render(createPortrait, currentPortrait, 120, 160);
    }

    // ====== 开始游戏 ======
    function startGame() {
        const name = inputName.value.trim();
        if (!name) {
            showToast('请输入名讳', 'danger');
            return;
        }

        const birthMonth = parseInt(inputMonth.value) || 1;
        const birthDay = parseInt(inputDay.value) || 1;

        // 初始化引擎
        engine.init({
            name: name,
            gender: selectedGender,
            motherRank: selectedMotherRank,
            motherPersonality: selectedMotherPersonality,
            birthMonth: birthMonth,
            birthDay: birthDay
        });

        // 切换到游戏界面
        createScreen.classList.remove('active');
        gameScreen.classList.add('active');

        // 初始化游戏 UI
        initGameUI();

        // 开始游戏循环
        engine.start();

        // 开场事件
        setTimeout(() => {
            addEventItem({
                name: '入宫',
                text: `${engine.state.player.title}${name}，于${engine._formatTime()}降生。` +
                      `母妃${engine.state.mother.name}，位分${engine.state.mother.rank.name}，` +
                      `性情${engine.state.mother.personalityData.name}。` +
                      `此间深宫，暗流涌动，且看${name}如何在这权谋漩涡中立足……`,
                time: engine._formatTime(),
                type: 'plot'
            });
        }, 500);
    }

    // ====== 初始化游戏 UI ======
    function initGameUI() {
        // 绑定引擎事件
        engine.on('tick', updateStatusBar);
        engine.on('event', (record) => addEventItem(record));
        engine.on('choice', showChoices);
        engine.on('choiceResult', onChoiceResult);
        engine.on('toast', (data) => showToast(data.text, data.type));
        engine.on('ageUp', (age) => showToast(`你已${age}岁`, 'success'));

        // 控制按钮
        btnPause.addEventListener('click', () => {
            engine.togglePause();
            btnPause.textContent = engine.paused ? '▷' : '❚❚';
            btnPause.classList.toggle('active', engine.paused);
        });

        btnSpeed.addEventListener('click', () => {
            const speeds = [1, 2, 3];
            const idx = speeds.indexOf(engine.speed);
            engine.setSpeed(speeds[(idx + 1) % speeds.length]);
            btnSpeed.textContent = ['▷▷', '▷▷▷', '▷▷▷▷'][engine.speed - 1];
        });

        btnSkipEvent.addEventListener('click', () => {
            engine.skipToNextEvent();
        });

        // 底部导航
        bottomNav.addEventListener('click', (e) => {
            const btn = e.target.closest('.nav-btn');
            if (!btn) return;
            const panel = btn.dataset.panel;
            if (panel === currentPanel && !sidePanel.classList.contains('hidden')) {
                closePanel();
                return;
            }
            $$('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            openPanel(panel);
        });

        // 关闭面板
        btnClosePanel.addEventListener('click', closePanel);

        // 初始状态
        updateStatusBar(engine.state);
        updatePlayerPortrait();
    }

    // ====== 更新状态栏 ======
    function updateStatusBar(state) {
        if (!state) return;
        const t = state.time;
        uiEra.textContent = t.eraName;
        uiDate.textContent = `${engine._yearStr(t.year)}年${MONTHS[t.month - 1]}月${engine._dayStr(t.day)}日`;
        uiShichen.textContent = SHICHEN[t.shichen].name;

        barFavor.style.width = state.player.favor + '%';
        barPrestige.style.width = state.player.prestige + '%';
        barControl.style.width = state.player.control + '%';
    }

    // ====== 更新玩家立绘 ======
    function updatePlayerPortrait() {
        const s = engine.state;
        if (!s) return;
        portraitGen.render(gamePortrait, s.player.portrait, 64, 80);
        portraitName.textContent = s.player.title + '·' + s.player.name;
    }

    // ====== 添加事件日志 ======
    function addEventItem(record) {
        const div = document.createElement('div');
        div.className = 'event-item';
        if (record.type === 'plot' || record.type === 'hidden') div.classList.add('event-important');
        if (record.type === 'crisis') div.classList.add('event-danger');
        if (record.type === 'choice') div.classList.add('event-choice');

        let html = `<div class="event-time">${record.time}</div>`;
        if (record.name) html += `<div class="event-name" style="color:var(--gold);font-weight:600;margin-bottom:2px;">【${record.name}】</div>`;
        html += `<div class="event-text">${record.text}</div>`;
        if (record.result) html += `<div class="event-result" style="color:var(--text-dim);margin-top:4px;font-style:italic;">→ ${record.result}</div>`;

        div.innerHTML = html;
        eventList.appendChild(div);

        // 自动滚动到底部
        const log = $('#event-log');
        setTimeout(() => log.scrollTop = log.scrollHeight, 50);
    }

    // ====== 显示选项 ======
    function showChoices(pending) {
        const { event, record } = pending;
        choiceList.innerHTML = '';

        // 先添加事件到日志
        addEventItem(record);

        // 显示选项按钮
        event.choices.forEach((choice, idx) => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = choice.text;
            btn.addEventListener('click', () => {
                engine.makeChoice(idx);
                choiceList.innerHTML = '';
            });
            choiceList.appendChild(btn);
        });
    }

    // ====== 选择结果 ======
    function onChoiceResult({ record, choice }) {
        // 更新结果到日志中最后一条
        const lastEvent = eventList.lastElementChild;
        if (lastEvent) {
            const resultDiv = document.createElement('div');
            resultDiv.className = 'event-result';
            resultDiv.style.cssText = 'color:var(--text-dim);margin-top:4px;font-style:italic;';
            resultDiv.textContent = '→ ' + record.result;
            lastEvent.appendChild(resultDiv);
        }

        updateStatusBar(engine.state);
        updatePlayerPortrait();
    }

    // ====== 侧边面板 ======
    function openPanel(panelName) {
        currentPanel = panelName;
        sidePanel.classList.remove('hidden');

        const titles = {
            log: '日志',
            schedule: '行程',
            relations: '人物',
            items: '物品',
            settings: '设置'
        };
        panelTitle.textContent = titles[panelName] || panelName;

        switch (panelName) {
            case 'log': renderLogPanel(); break;
            case 'schedule': renderSchedulePanel(); break;
            case 'relations': renderRelationsPanel(); break;
            case 'items': renderItemsPanel(); break;
            case 'settings': renderSettingsPanel(); break;
        }
    }

    function closePanel() {
        sidePanel.classList.add('hidden');
    }

    // 日志面板
    function renderLogPanel() {
        const s = engine.state;
        if (!s) { panelBody.innerHTML = '<p style="color:var(--text-dim)">暂无日志</p>'; return; }

        let html = '<div class="panel-list">';
        // 倒序显示
        const history = [...s.eventHistory].reverse();
        for (const record of history.slice(0, 50)) {
            html += `<div class="panel-item" style="flex-direction:column;align-items:flex-start;">
                <div style="font-size:10px;color:var(--text-dim)">${record.time}</div>
                <div style="font-size:13px;color:var(--text)">${record.name ? '【' + record.name + '】' : ''}${record.text}</div>
                ${record.result ? '<div style="font-size:11px;color:var(--text-dim);font-style:italic">→ ' + record.result + '</div>' : ''}
            </div>`;
        }
        html += '</div>';
        panelBody.innerHTML = html;
    }

    // 行程面板
    function renderSchedulePanel() {
        const s = engine.state;
        if (!s) return;

        let html = '<p style="color:var(--text-dim);font-size:12px;margin-bottom:12px;">选择明日行程</p>';
        html += '<div class="schedule-grid">';
        for (const [key, loc] of Object.entries(LOCATIONS)) {
            const selected = s.player.location === key ? ' selected' : '';
            html += `<div class="schedule-card${selected}" data-location="${key}">
                <div class="sc-icon">${loc.icon}</div>
                <div class="sc-name">${loc.name}</div>
                <div class="sc-desc">${loc.desc}</div>
            </div>`;
        }
        html += '</div>';
        panelBody.innerHTML = html;

        // 绑定点击
        panelBody.querySelectorAll('.schedule-card').forEach(card => {
            card.addEventListener('click', () => {
                panelBody.querySelectorAll('.schedule-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                const loc = card.dataset.location;
                engine.state.player.location = loc;
                showToast(`明日将前往${LOCATIONS[loc].name}`, 'success');
            });
        });
    }

    // 人物面板
    function renderRelationsPanel() {
        const s = engine.state;
        if (!s) return;

        let html = '<div class="panel-list">';

        // 母妃
        html += `<div class="panel-item">
            <div class="item-portrait" id="panel-mother-portrait"></div>
            <div class="item-info">
                <div class="item-name">${s.mother.name}</div>
                <div class="item-desc">${s.mother.rank.name} · ${s.mother.personalityData.name}</div>
                <div class="item-badges">
                    <span class="badge">圣宠 ${s.mother.favor}</span>
                    <span class="badge">健康 ${s.mother.health}</span>
                </div>
            </div>
        </div>`;

        // NPC
        for (const npc of s.npcs) {
            if (!npc.alive) continue;
            const personalityName = PERSONALITIES[npc.personality]?.name || npc.personality;
            const avgRelation = Math.round((npc.relations.impression + npc.relations.compatibility + npc.relations.recognition) / 3);
            const relationClass = avgRelation >= 70 ? '' : avgRelation >= 40 ? '' : 'badge-danger';
            html += `<div class="panel-item">
                <div class="item-portrait" id="panel-npc-portrait-${npc.id}"></div>
                <div class="item-info">
                    <div class="item-name">${npc.name}</div>
                    <div class="item-desc">${npc.title} · ${personalityName}</div>
                    <div class="item-badges">
                        <span class="badge ${relationClass}">好感 ${avgRelation}</span>
                    </div>
                </div>
            </div>`;
        }

        html += '</div>';
        panelBody.innerHTML = html;

        // 渲染立绘
        setTimeout(() => {
            const motherEl = $('#panel-mother-portrait');
            if (motherEl) portraitGen.render(motherEl, s.mother.portrait, 40, 50);

            for (const npc of s.npcs) {
                if (!npc.alive) continue;
                const el = $(`#panel-npc-portrait-${npc.id}`);
                if (el) portraitGen.render(el, npc.portrait, 40, 50);
            }
        }, 50);
    }

    // 物品面板
    function renderItemsPanel() {
        const s = engine.state;
        if (!s) return;

        let html = '<p style="color:var(--text-dim);font-size:12px;margin-bottom:12px;">角色属性</p>';
        html += '<div class="panel-list">';

        // 技能
        for (const [key, skill] of Object.entries(SKILLS)) {
            const level = s.player.skills[key] || 0;
            html += `<div class="panel-item" style="justify-content:space-between;">
                <div>
                    <div class="item-name">${skill.name}</div>
                    <div class="item-desc">${skill.desc}</div>
                </div>
                <div style="display:flex;gap:2px;">
                    ${Array.from({length: skill.maxLevel}, (_, i) =>
                        `<div style="width:8px;height:8px;border-radius:2px;background:${i < level ? 'var(--gold)' : 'var(--border)'}"></div>`
                    ).join('')}
                </div>
            </div>`;
        }

        html += '</div>';
        html += '<p style="color:var(--text-dim);font-size:12px;margin:16px 0 12px;">国家状况</p>';
        html += '<div class="panel-list">';
        html += `<div class="panel-item"><div class="item-name">制度</div><div class="item-desc">${NATION_TYPES[s.nation.type].name}</div></div>`;
        html += `<div class="panel-item"><div class="item-name">稳定度</div><div class="item-desc">${s.nation.stability}</div></div>`;
        html += `<div class="panel-item"><div class="item-name">国库</div><div class="item-desc">${s.nation.treasury}</div></div>`;
        html += `<div class="panel-item"><div class="item-name">军力</div><div class="item-desc">${s.nation.military}</div></div>`;
        html += '</div>';

        panelBody.innerHTML = html;
    }

    // 设置面板
    function renderSettingsPanel() {
        let html = '<div class="panel-list">';

        html += `<div class="setting-row">
            <label>游戏速度</label>
            <select id="setting-speed">
                <option value="1" ${engine.speed === 1 ? 'selected' : ''}>正常</option>
                <option value="2" ${engine.speed === 2 ? 'selected' : ''}>快速</option>
                <option value="3" ${engine.speed === 3 ? 'selected' : ''}>极速</option>
            </select>
        </div>`;

        html += `<div class="setting-row">
            <label>自动存档</label>
            <span style="color:var(--text-dim);font-size:12px;">每日自动</span>
        </div>`;

        html += `<div class="setting-row">
            <label>统计</label>
            <span style="color:var(--text-dim);font-size:12px;">事件${engine.state?.stats.totalEvents || 0} · 选择${engine.state?.stats.totalChoices || 0} · 天数${engine.state?.stats.daysPlayed || 0}</span>
        </div>`;

        html += '</div>';

        html += '<button class="btn-secondary" id="btn-manual-save" style="width:100%;margin-top:16px;">手动存档</button>';
        html += '<button class="btn-danger" id="btn-restart" style="margin-top:8px;">重新开始</button>';

        panelBody.innerHTML = html;

        // 绑定事件
        setTimeout(() => {
            const speedSelect = $('#setting-speed');
            if (speedSelect) {
                speedSelect.addEventListener('change', () => {
                    engine.setSpeed(parseInt(speedSelect.value));
                });
            }

            const btnSave = $('#btn-manual-save');
            if (btnSave) btnSave.addEventListener('click', () => engine.save());

            const btnRestart = $('#btn-restart');
            if (btnRestart) {
                btnRestart.addEventListener('click', () => {
                    showModal('确认重新开始？', '所有进度将丢失，确定要重新开始吗？', [
                        { text: '取消', confirm: false },
                        { text: '确认', confirm: true, className: 'btn-confirm' }
                    ], (confirmed) => {
                        if (confirmed) {
                            engine._stopTick();
                            engine.deleteSave();
                            gameScreen.classList.remove('active');
                            createScreen.classList.add('active');
                            eventList.innerHTML = '';
                            choiceList.innerHTML = '';
                        }
                    });
                });
            }
        }, 50);
    }

    // ====== Toast 提示 ======
    function showToast(text, type) {
        const toast = document.createElement('div');
        toast.className = 'toast' + (type ? ' toast-' + type : '');
        toast.textContent = text;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    }

    // ====== 模态框 ======
    function showModal(title, message, buttons, callback) {
        let html = `<h3>${title}</h3><p>${message}</p><div class="modal-actions">`;
        for (const btn of buttons) {
            html += `<button class="${btn.className || ''}" data-confirm="${btn.confirm}">${btn.text}</button>`;
        }
        html += '</div>';
        modalContent.innerHTML = html;
        modalOverlay.classList.remove('hidden');

        modalContent.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                modalOverlay.classList.add('hidden');
                if (callback) callback(btn.dataset.confirm === 'true');
            });
        });
    }

    // ====== 自动存档 ======
    setInterval(() => {
        if (engine.state && engine.running && !engine.paused) {
            engine.save();
        }
    }, 60000); // 每分钟自动存档

    // ====== 初始化 ======
    document.addEventListener('DOMContentLoaded', () => {
        initCreateScreen();

        // 检查是否有存档
        if (engine.hasSave()) {
            showModal('发现存档', '检测到上次的游戏存档，是否继续？', [
                { text: '重新开始', confirm: false },
                { text: '继续游戏', confirm: true, className: 'btn-confirm' }
            ], (confirmed) => {
                if (confirmed) {
                    engine.load();
                    createScreen.classList.remove('active');
                    gameScreen.classList.add('active');
                    initGameUI();
                    engine.resume();
                    // 恢复事件历史
                    for (const record of engine.state.eventHistory) {
                        addEventItem(record);
                    }
                    showToast('读档成功', 'success');
                }
            });
        }
    });

})();
