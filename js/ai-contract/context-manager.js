// ========================================
// 上下文管理器
// 负责对话历史、滚动摘要、token 预算、上下文压缩
// ========================================
var ContextManager = {
    // 默认配置
    DEFAULT_MAX_HISTORY_ROUNDS: 6,
    DEFAULT_TOKEN_BUDGET: 8000,
    DEFAULT_RESERVE_TOKENS: 2000,

    // 获取当前配置
    _getConfig: function(options) {
        options = options || {};
        var contextSize = 8000;
        var maxTokens = 4096;
        try {
            if (typeof StateManager !== 'undefined') {
                contextSize = StateManager.get('world.contextSize') || contextSize;
                maxTokens = StateManager.get('world.maxTokens') || maxTokens;
            } else if (typeof gameState !== 'undefined') {
                contextSize = gameState.contextSize || contextSize;
                maxTokens = gameState.maxTokens || maxTokens;
            }
        } catch (e) {}
        var budget = Math.max(2000, contextSize - maxTokens - 500);
        return {
            maxHistoryRounds: options.maxHistoryRounds || this.DEFAULT_MAX_HISTORY_ROUNDS,
            tokenBudget: options.tokenBudget || budget,
            reserveTokens: options.reserveTokens || this.DEFAULT_RESERVE_TOKENS,
            systemTokenLimit: options.systemTokenLimit || 3000
        };
    },

    // 读取历史
    _getHistory: function() {
        if (typeof StateManager !== 'undefined') {
            return StateManager.get('progress.conversationHistory') || [];
        }
        if (typeof gameState !== 'undefined') return gameState.conversationHistory || [];
        return [];
    },

    // 写入历史
    _setHistory: function(history, silent) {
        if (typeof StateManager !== 'undefined') {
            StateManager.set('progress.conversationHistory', history, { silent: !!silent });
        } else if (typeof gameState !== 'undefined') {
            gameState.conversationHistory = history;
        }
    },

    // 读取滚动摘要
    getRollingSummary: function() {
        if (typeof StateManager !== 'undefined') {
            return StateManager.get('progress.rollingSummary') || '';
        }
        if (typeof gameState !== 'undefined') return gameState.rollingSummary || '';
        return '';
    },

    // 写入滚动摘要
    setRollingSummary: function(text) {
        if (typeof StateManager !== 'undefined') {
            StateManager.set('progress.rollingSummary', text || '', { silent: true });
        } else if (typeof gameState !== 'undefined') {
            gameState.rollingSummary = text || '';
        }
    },

    // 估算消息列表 token 数
    estimateTokens: function(messages) {
        if (typeof estimateTokensForMessagesUtil === 'function') {
            return estimateTokensForMessagesUtil(messages);
        }
        if (typeof estimateTokensUtil === 'function') {
            var total = 0;
            for (var i = 0; i < messages.length; i++) {
                total += estimateTokensUtil(messages[i].content || '');
            }
            return total;
        }
        var len = 0;
        for (var i = 0; i < messages.length; i++) {
            len += (messages[i].content || '').length;
        }
        return Math.ceil(len / 1.7);
    },

    // 添加用户输入到历史
    appendUser: function(userInput) {
        var history = this._getHistory();
        history.push({ role: 'user', content: String(userInput || ''), timestamp: Date.now() });
        this._setHistory(history, true);
        this._maybeCompress();
    },

    // 添加 AI 回复到历史
    appendAssistant: function(rawReply, parsedData) {
        var content = '';
        if (parsedData && parsedData.storyText) {
            content = parsedData.storyText;
        } else if (typeof parsedData === 'string') {
            content = parsedData;
        } else if (rawReply) {
            content = String(rawReply);
        }
        var history = this._getHistory();
        history.push({ role: 'assistant', content: String(content || ''), rawReply: rawReply, timestamp: Date.now() });
        this._setHistory(history, true);
        this._maybeCompress();
    },

    // 构建发送给 AI 的消息列表
    buildMessages: function(userInput, options) {
        options = options || {};
        var config = this._getConfig(options);
        var systemPrompt = options.systemPrompt || '';
        var history = this._getHistory();
        var rollingSummary = this.getRollingSummary();

        var messages = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }

        // 有滚动摘要时插入摘要消息
        if (rollingSummary) {
            messages.push({ role: 'system', content: '【前情摘要】\n' + rollingSummary });
        }

        // 取最近 N 轮历史
        var rounds = this._toRounds(history);
        var recentRounds = rounds.slice(-config.maxHistoryRounds);
        for (var i = 0; i < recentRounds.length; i++) {
            var round = recentRounds[i];
            if (round.user) messages.push({ role: 'user', content: round.user.content });
            if (round.assistant) messages.push({ role: 'assistant', content: round.assistant.content });
        }

        // 本轮用户输入
        if (userInput !== undefined && userInput !== null && userInput !== '') {
            messages.push({ role: 'user', content: String(userInput) });
        }

        // 检查 token 预算，必要时压缩后再试一次
        var tokens = this.estimateTokens(messages);
        if (tokens > config.tokenBudget - config.reserveTokens) {
            this.compress(config.maxHistoryRounds - 2);
            // 重新构建
            return this.buildMessages(userInput, options);
        }

        return messages;
    },

    // 将历史记录按轮分组
    _toRounds: function(history) {
        var rounds = [];
        var current = {};
        for (var i = 0; i < history.length; i++) {
            var msg = history[i];
            if (msg.role === 'user') {
                if (current.user || current.assistant) {
                    rounds.push(current);
                }
                current = { user: msg };
            } else if (msg.role === 'assistant') {
                current.assistant = msg;
                rounds.push(current);
                current = {};
            } else {
                // 其他角色按 assistant 处理
                current.assistant = msg;
                rounds.push(current);
                current = {};
            }
        }
        if (current.user || current.assistant) rounds.push(current);
        return rounds;
    },

    // 检查是否需要压缩
    _maybeCompress: function() {
        var config = this._getConfig();
        var history = this._getHistory();
        var rounds = this._toRounds(history);
        if (rounds.length <= config.maxHistoryRounds) return;
        this.compress(config.maxHistoryRounds);
    },

    // 压缩历史：保留最近 keepRounds 轮完整对话，更早的合并为摘要
    compress: function(keepRounds) {
        keepRounds = keepRounds || this.DEFAULT_MAX_HISTORY_ROUNDS;
        var history = this._getHistory();
        var rounds = this._toRounds(history);
        if (rounds.length <= keepRounds) return;

        var recent = rounds.slice(-keepRounds);
        var old = rounds.slice(0, -keepRounds);
        var summaryText = this._summarizeRounds(old);
        var currentSummary = this.getRollingSummary();
        var newSummary = currentSummary ? (currentSummary + '\n' + summaryText) : summaryText;
        // 限制摘要长度，避免无限增长
        if (newSummary.length > 3000) {
            newSummary = '...' + newSummary.slice(-3000);
        }
        this.setRollingSummary(newSummary);

        // 重写历史为最近轮次
        var newHistory = [];
        for (var i = 0; i < recent.length; i++) {
            var round = recent[i];
            if (round.user) newHistory.push(round.user);
            if (round.assistant) newHistory.push(round.assistant);
        }
        this._setHistory(newHistory, true);
    },

    // 本地生成简单摘要（不依赖 AI），用于压缩历史
    _summarizeRounds: function(rounds) {
        var parts = [];
        for (var i = 0; i < rounds.length; i++) {
            var round = rounds[i];
            var userText = round.user ? (round.user.content || '').slice(0, 100) : '';
            var assistantText = round.assistant ? (round.assistant.content || '').slice(0, 200) : '';
            if (userText || assistantText) {
                parts.push('玩家：' + userText + '；剧情：' + assistantText);
            }
        }
        return parts.join('\n');
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = ContextManager;
