/**
 * 伏笔因果链追踪系统
 * 灵感来源：银月蛛网 v2.7 — Cause/Effect 因果链 + hide/reveal 隐藏数据机制
 * 设计理念：在现有伏笔系统基础上增加因果双向追踪和隐藏数据管理，
 *           Cause持续保留直到被Effect回收，形成跨回合的叙事闭环。
 *
 * 与现有系统关系：
 *   - 增强 tavern-compat.js 中已有的 _dormantTracking.foreshadowings
 *   - 扩展 _parseAIPlanTags 解析新的因果链标签
 *   - 注册 PromptBuilder section 引导AI输出结构化伏笔
 *
 * 依赖：prompt-builder.js, EnhancedMemory (tavern-compat.js)
 */
var ForeshadowChain = {

    enabled: true,

    // 因果链注册表
    // 结构: { 'chainId': { cause: '描述', effect: null, createdTurn: 0, status: 'pending'|'resolved', hideData: [], revealData: [], relatedChars: [] } }
    _chains: {},

    // 隐藏数据注册表
    // 结构: { 'secretId': { content: '秘密内容', hidden: true, revealTurn: null, relatedChain: null } }
    _secrets: {},

    /**
     * 初始化
     */
    init: function() {
        this._loadData();
        this._registerPromptSection();
        this._enhancePlanTagParser();
        console.log('[ForeshadowChain] 因果链系统已初始化 (chains:' + Object.keys(this._chains).length + ', secrets:' + Object.keys(this._secrets).length + ')');
    },

    /**
     * 加载持久化数据
     */
    _loadData: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.getJSON) {
                this._chains = Storage.getJSON('foreshadow_chains', {}) || {};
                this._secrets = Storage.getJSON('foreshadow_secrets', {}) || {};
            }
        } catch(e) {
            console.warn('[ForeshadowChain] 读取数据失败:', e);
        }
    },

    /**
     * 保存数据
     */
    saveData: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.setJSON) {
                Storage.setJSON('foreshadow_chains', this._chains);
                Storage.setJSON('foreshadow_secrets', this._secrets);
            }
        } catch(e) {
            console.warn('[ForeshadowChain] 保存数据失败:', e);
        }
    },

    /**
     * 注册 PromptBuilder section
     * 引导AI使用因果链标签输出伏笔
     */
    _registerPromptSection: function() {
        if (typeof PromptBuilder === 'undefined') {
            var self = this;
            setTimeout(function() { self._registerPromptSection(); }, 500);
            return;
        }

        var self = this;
        PromptBuilder.registerSection('foreshadowChain', function(ctx) {
            if (!self.enabled) return '';

            var pendingChains = self._getPendingChainsText();
            var parts = [];
            parts.push('【伏笔因果链系统】');
            parts.push('用因果链追踪伏笔，形成跨回合的叙事闭环。');
            parts.push('');
            parts.push('标签格式：');
            parts.push('  <foreshadow id="唯一ID" priority="1-10" cause="因/伏笔描述" effect="">');
            parts.push('    可选: hide: 隐藏数据描述');
            parts.push('    可选: chars: 相关角色名(逗号分隔)');
            parts.push('  </foreshadow>');
            parts.push('');
            parts.push('  回收伏笔时：');
            parts.push('  <resolve id="伏笔ID" effect="果/回收描述">回收说明</resolve>');
            parts.push('');
            parts.push('  揭示隐藏数据时：');
            parts.push('  <reveal secret="秘密ID">揭示内容</reveal>');
            parts.push('');
            parts.push('规则：');
            parts.push('1. cause（因）是埋设的伏笔，未回收前持续保留在记忆中');
            parts.push('2. effect（果）是伏笔回收时的结果，回收后标记为resolved');
            parts.push('3. hide: 记录角色不知道但影响剧情的秘密（如身份、阴谋）');
            parts.push('4. reveal: 在合适时机揭示秘密，揭示后所有角色可知');
            parts.push('5. 优先级1-10，10为最紧急需要回收的伏笔');
            parts.push('6. 每回合至少检查一次未回收的伏笔，考虑是否在本回合回收');

            if (pendingChains) {
                parts.push('');
                parts.push('【当前未回收的伏笔链】');
                parts.push(pendingChains);
            }

            return parts.join('\n');
        }, { order: 65 });
    },

    /**
     * 获取未回收伏笔的文本摘要
     */
    _getPendingChainsText: function() {
        var pending = [];
        var self = this;
        Object.keys(this._chains).forEach(function(id) {
            var chain = self._chains[id];
            if (chain.status === 'pending') {
                var line = '#' + id + ' [P' + (chain.priority || 5) + '] ' + chain.cause;
                if (chain.createdTurn !== undefined) {
                    var age = self._getCurrentTurn() - chain.createdTurn;
                    if (age > 10) line += ' (已等待' + age + '回合)';
                }
                if (chain.hideData && chain.hideData.length > 0) {
                    line += ' [含' + chain.hideData.length + '条隐藏数据]';
                }
                pending.push(line);
            }
        });
        return pending.join('\n');
    },

    /**
     * 增强已有的 _parseAIPlanTags 解析器
     */
    _enhancePlanTagParser: function() {
        if (typeof EnhancedMemory === 'undefined') {
            var self = this;
            setTimeout(function() { self._enhancePlanTagParser(); }, 500);
            return;
        }

        var self = this;
        // 保存原始解析函数
        var originalParse = EnhancedMemory._parseAIPlanTags;

        EnhancedMemory._parseAIPlanTags = function(text) {
            // 调用原始解析
            if (originalParse) originalParse.call(this, text);

            // 解析新的因果链标签
            if (!text || typeof text !== 'string') return;
            self._parseChainTags(text);
            self._parseResolveTags(text);
            self._parseRevealTags(text);
        };
    },

    /**
     * 解析 <foreshadow> 因果链标签
     * 扩展格式: <foreshadow id="xxx" priority="5" cause="描述" effect="" chars="角色A,角色B">hide: 秘密</foreshadow>
     */
    _parseChainTags: function(text) {
        var regex = /<foreshadow\s+id="([^"]+)"(?:\s+priority="(\d+)")?(?:\s+cause="([^"]*)")?(?:\s+effect="([^"]*)")?(?:\s+chars="([^"]*)")?>([\s\S]*?)<\/foreshadow>/gi;
        var match;
        while ((match = regex.exec(text)) !== null) {
            var id = match[1];
            var priority = parseInt(match[2]) || 5;
            var cause = match[3] || match[6].trim();
            var effect = match[4] || '';
            var chars = match[5] ? match[5].split(',').map(function(s) { return s.trim(); }) : [];
            var innerContent = match[6] || '';

            // 提取 hide: 数据
            var hideData = [];
            var hideMatch = innerContent.match(/hide:\s*(.+)/g);
            if (hideMatch) {
                hideMatch.forEach(function(h) {
                    var content = h.replace(/^hide:\s*/, '').trim();
                    if (content) {
                        var secretId = id + '_secret_' + (hideData.length + 1);
                        hideData.push(secretId);
                        this._secrets[secretId] = {
                            content: content,
                            hidden: true,
                            revealTurn: null,
                            relatedChain: id
                        };
                    }
                }, this);
            }

            // 注册或更新因果链
            if (!this._chains[id] || this._chains[id].status === 'pending') {
                this._chains[id] = {
                    cause: cause,
                    effect: effect || null,
                    createdTurn: this._getCurrentTurn(),
                    status: effect ? 'resolved' : 'pending',
                    priority: priority,
                    hideData: hideData,
                    relatedChars: chars
                };
                console.log('[ForeshadowChain] 注册伏笔 #' + id + ' (P' + priority + '): ' + cause);
            }
        }
        this.saveData();
    },

    /**
     * 解析 <resolve> 回收标签
     */
    _parseResolveTags: function(text) {
        var regex = /<resolve\s+id="([^"]+)"(?:\s+effect="([^"]*)")?>([\s\S]*?)<\/resolve>/gi;
        var match;
        while ((match = regex.exec(text)) !== null) {
            var id = match[1];
            var effect = match[2] || match[3].trim();
            if (this._chains[id]) {
                this._chains[id].effect = effect;
                this._chains[id].status = 'resolved';
                this._chains[id].resolvedTurn = this._getCurrentTurn();
                console.log('[ForeshadowChain] 回收伏笔 #' + id + ': ' + effect);
            }
        }
        this.saveData();
    },

    /**
     * 解析 <reveal> 揭示标签
     */
    _parseRevealTags: function(text) {
        var regex = /<reveal\s+secret="([^"]+)">([\s\S]*?)<\/reveal>/gi;
        var match;
        while ((match = regex.exec(text)) !== null) {
            var secretId = match[1];
            var content = match[2].trim();
            if (this._secrets[secretId]) {
                this._secrets[secretId].hidden = false;
                this._secrets[secretId].revealTurn = this._getCurrentTurn();
                this._secrets[secretId].revealedContent = content;
                console.log('[ForeshadowChain] 揭示秘密 #' + secretId);
            }
        }
        this.saveData();
    },

    /**
     * 获取当前回合数
     */
    _getCurrentTurn: function() {
        if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory._messageCount) {
            return EnhancedMemory._messageCount;
        }
        return 0;
    },

    /**
     * 获取所有待回收伏笔
     */
    getPendingChains: function() {
        var result = [];
        var self = this;
        Object.keys(this._chains).forEach(function(id) {
            if (self._chains[id].status === 'pending') {
                result.push(Object.assign({ id: id }, self._chains[id]));
            }
        });
        return result.sort(function(a, b) {
            return (b.priority || 5) - (a.priority || 5);
        });
    },

    /**
     * 获取所有隐藏数据
     */
    getHiddenSecrets: function() {
        var result = [];
        var self = this;
        Object.keys(this._secrets).forEach(function(id) {
            if (self._secrets[id].hidden) {
                result.push(Object.assign({ id: id }, self._secrets[id]));
            }
        });
        return result;
    },

    /**
     * 获取伏笔统计
     */
    getStats: function() {
        var total = Object.keys(this._chains).length;
        var pending = this.getPendingChains().length;
        var resolved = total - pending;
        var secrets = Object.keys(this._secrets).length;
        var hidden = this.getHiddenSecrets().length;
        return { total: total, pending: pending, resolved: resolved, secrets: secrets, hidden: hidden };
    },

    setEnabled: function(enabled) {
        this.enabled = enabled;
    }
};
