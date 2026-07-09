// ========================================
// Swipe 多分支重生成管理器
// 参考 SillyTavern / RisuAI / mufy 的 swipe 机制
// 让 retryStory 保留多个版本，玩家可横向切换
//
// 【设计原则】swipe 只存在于当前回合，进入下一回合时自动覆盖
// 避免长期积累导致内存/存档膨胀
//
// 数据结构（progress.swipes）：
//   { versions: [swipe...], current: 0, turn: 5 }
// 仅保留当前 turn 的多版本，新回合开始时整体覆盖
//
// 每个 swipe = { storyText, choices, sceneTitle, response, turn, timestamp }
// ========================================
var SwipeManager = {
    // 内存缓存：当前轮次的 swipe 版本数组（与 progress.swipes.versions 同步）
    _swipes: [],
    // 当前显示的 swipe 索引（-1 表示无 swipe / 普通模式）
    _currentIndex: -1,
    // 标记：正在 retry 生成新 swipe（避免重复 push）
    _isRetrying: false,

    // 内部：读取 progress.swipes（单轮结构）
    _readState() {
        if (typeof StateManager === 'undefined' || !StateManager.get) return null;
        var s = StateManager.get('progress.swipes');
        if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
        // 兼容老格式（按 turn 索引的对象）：取当前 turn 对应的条目
        if (s.versions && Array.isArray(s.versions)) return s;
        // 老格式迁移：按 turn 索引的对象，取当前 turn
        var turn = this._currentTurn();
        var entry = s[String(turn)];
        if (entry && Array.isArray(entry.versions)) return entry;
        return null;
    },

    // 内部：写入 progress.swipes（单轮结构，整体覆盖）
    _writeState(versions, current) {
        if (typeof StateManager === 'undefined' || !StateManager.set) return;
        if (!versions || versions.length === 0) {
            // 无版本时写空结构（而非 null，避免 normalizeState 误判）
            StateManager.set('progress.swipes', { versions: [], current: -1, turn: this._currentTurn() }, { silent: true });
            return;
        }
        StateManager.set('progress.swipes', {
            versions: versions,
            current: (typeof current === 'number' && current >= 0) ? current : 0,
            turn: this._currentTurn()
        }, { silent: true });
    },

    // 内部：读取当前 turn
    _currentTurn() {
        if (typeof StateManager === 'undefined' || !StateManager.get) return 0;
        return StateManager.get('progress.turn') || 0;
    },

    // 内部：把内存缓存同步到 progress.swipes
    _flushToState() {
        if (this._swipes.length === 0) return;
        this._writeState(this._swipes, this._currentIndex);
    },

    // 加载当前 turn 的 swipe 到内存（存档加载/retry 回填时调用）
    loadCurrentTurn() {
        var state = this._readState();
        if (state && Array.isArray(state.versions) && state.versions.length > 0) {
            this._swipes = state.versions;
            this._currentIndex = (typeof state.current === 'number') ? state.current : 0;
            this._renderSwitcher();
        } else {
            this._swipes = [];
            this._currentIndex = -1;
            this._hideSwitcher();
        }
    },

    // 重置（每轮新对话开始时调用）
    // 【关键】这是"进入下一回合时覆盖上一轮 swipe"的核心入口
    // 由 sendAIRequest 在非 retry 模式下调用，清空内存 + 写空结构到 StateManager
    reset() {
        this._swipes = [];
        this._currentIndex = -1;
        this._isRetrying = false;
        this._hideSwitcher();
        // 写空结构覆盖上一轮的 swipe（实现"只存当前回合"）
        this._writeState([], -1);
    },

    // 当前是否有 swipe 版本
    hasSwipes() {
        return this._swipes.length > 0;
    },

    // 当前 swipe 数量
    count() {
        return this._swipes.length;
    },

    // 当前索引（1-based for UI）
    currentIndex() {
        return this._currentIndex;
    },

    // 是否正在 retry 生成新 swipe
    isRetrying() {
        return this._isRetrying;
    },

    setRetrying(v) {
        this._isRetrying = !!v;
    },

    // 记录一个 swipe 版本（AI 回复成功后调用）
    // 如果是 retry 触发的新版本，追加；否则重置后记录（覆盖上一轮）
    addSwipe(swipe) {
        if (!swipe || !swipe.storyText) return;
        if (this._isRetrying) {
            // retry 生成的新版本：追加到现有内存
            // 若内存为空（如页面刷新后直接 retry），从 StateManager 加载当前 turn
            if (this._swipes.length === 0) {
                this.loadCurrentTurn();
            }
            this._swipes.push(swipe);
            this._currentIndex = this._swipes.length - 1;
            this._isRetrying = false;
        } else {
            // 正常新一轮对话：内存重置为单一版本（覆盖上一轮）
            this._swipes = [swipe];
            this._currentIndex = 0;
        }
        this._flushToState();
        this._renderSwitcher();
    },

    // 切换到指定索引的 swipe（恢复 UI 显示）
    switchTo(index) {
        if (index < 0 || index >= this._swipes.length) return;
        if (index === this._currentIndex) return;
        this._currentIndex = index;
        var swipe = this._swipes[index];
        if (!swipe) return;

        // 恢复 UI 显示（仅 UI 层，conversationHistory 由 _syncLastAssistantContent 同步）
        if (typeof renderStory === 'function' && swipe.storyText) {
            renderStory(swipe.storyText);
        }
        if (typeof renderChoices === 'function') {
            var choices = swipe.choices;
            if (choices && choices.length > 0) {
                renderChoices(choices);
            } else {
                renderChoices([{ id: 'A', text: '继续' }, { id: 'B', text: '观察' }, { id: 'C', text: '等待' }]);
            }
        }
        if (typeof updateSceneTitle === 'function' && swipe.sceneTitle) {
            updateSceneTitle(swipe.sceneTitle);
        }
        // 标记当前 conversationHistory 中最后一条 assistant 消息的内容为当前 swipe 的 response
        // 这样下一轮 AI 请求时看到的"上一轮回复"是玩家选中的版本
        this._syncLastAssistantContent(swipe.response || swipe.storyText);

        // 持久化当前选中索引
        this._flushToState();
        this._renderSwitcher();
        if (typeof UI !== 'undefined' && UI.toast) {
            UI.toast('已切换到版本 ' + (index + 1) + '/' + this._swipes.length);
        }
    },

    // 切换到上一个
    prev() {
        if (this._currentIndex > 0) this.switchTo(this._currentIndex - 1);
    },

    // 切换到下一个
    next() {
        if (this._currentIndex < this._swipes.length - 1) this.switchTo(this._currentIndex + 1);
    },

    // 把当前选中的 swipe 的 response 同步到 conversationHistory 最后一条 assistant 消息
    // 确保下一轮 AI 请求看到的是玩家选中的版本
    _syncLastAssistantContent(content) {
        if (!content) return;
        if (typeof StateManager === 'undefined' || !StateManager.get || !StateManager.set) return;
        var hist = StateManager.get('progress.conversationHistory') || [];
        if (hist.length < 2) return;
        // 找最后一条 assistant 消息
        for (var i = hist.length - 1; i >= 0; i--) {
            if (hist[i] && hist[i].role === 'assistant') {
                // 创建新数组（避免 mutate 原数组，与 _updateConversationHistory 约定一致）
                var newHist = hist.slice();
                newHist[i] = { role: 'assistant', content: content };
                StateManager.set('progress.conversationHistory', newHist, { silent: true });
                return;
            }
        }
    },

    // 获取当前选中的 swipe（供 retryStory 判断是否需要保留旧版本）
    getCurrentSwipe() {
        return this._currentIndex >= 0 ? this._swipes[this._currentIndex] : null;
    },

    // 渲染切换器 UI（< 1/3 >）
    _renderSwitcher() {
        var container = document.getElementById('swipeSwitcher');
        if (!container) return;
        if (!this.hasSwipes() || this._swipes.length <= 1) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }
        container.style.display = 'flex';
        var idx = this._currentIndex + 1;
        var total = this._swipes.length;
        container.innerHTML =
            '<button class="swipe-btn" id="swipePrev" title="上一个版本"' + (this._currentIndex === 0 ? ' disabled' : '') + '>‹</button>' +
            '<span class="swipe-counter" id="swipeCounter">' + idx + ' / ' + total + '</span>' +
            '<button class="swipe-btn" id="swipeNext" title="下一个版本"' + (this._currentIndex >= total - 1 ? ' disabled' : '') + '>›</button>';
        // 绑定事件
        var prevBtn = document.getElementById('swipePrev');
        var nextBtn = document.getElementById('swipeNext');
        if (prevBtn) prevBtn.onclick = function(e) { e.preventDefault(); SwipeManager.prev(); };
        if (nextBtn) nextBtn.onclick = function(e) { e.preventDefault(); SwipeManager.next(); };
    },

    _hideSwitcher() {
        var container = document.getElementById('swipeSwitcher');
        if (container) {
            container.style.display = 'none';
            container.innerHTML = '';
        }
    }
};

if (typeof window !== 'undefined') window.SwipeManager = SwipeManager;
