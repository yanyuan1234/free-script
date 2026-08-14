/**
 * 平行世界线追踪系统
 * 灵感来源：双人成行 v12.0 — <parallel_world> 平行世界规则
 * 设计理念：追踪当前场景中未出场但与剧情有关的角色状态，
 *           维护空间连续性，记录平行发生的事件。
 *           通过标签从AI输出中提取，注入下一回合的上下文。
 *
 * 依赖：prompt-builder.js, RegexManager
 */
var ParallelWorld = {

    enabled: true,

    // 世界线记录
    // 结构: [{ turn, chars: [{ name, location, status, action, relation }], timestamp }]
    _worldLines: [],

    // 角色最后已知位置（用于空间连续性检查）
    _lastKnownLocations: {},

    /**
     * 初始化
     */
    init: function() {
        this._loadData();
        this._registerPromptSection();
        this._registerProcessor();
        console.log('[ParallelWorld] 平行世界线系统已初始化');
    },

    /**
     * 加载数据
     */
    _loadData: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.getJSON) {
                this._worldLines = Storage.getJSON('parallel_world_lines', []) || [];
                this._lastKnownLocations = Storage.getJSON('parallel_last_locations', {}) || {};
            }
        } catch(e) {
            console.warn('[ParallelWorld] 读取数据失败:', e);
        }
    },

    saveData: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.setJSON) {
                Storage.setJSON('parallel_world_lines', this._worldLines);
                Storage.setJSON('parallel_last_locations', this._lastKnownLocations);
            }
        } catch(e) {}
    },

    /**
     * 注册 PromptBuilder section
     * 来源：双人成行 v12.0 的 <parallel_world_rule>
     */
    _registerPromptSection: function() {
        if (typeof PromptBuilder === 'undefined') {
            var self = this;
            setTimeout(function() { self._registerPromptSection(); }, 500);
            return;
        }

        var self = this;
        PromptBuilder.registerSection('parallelWorld', function(ctx) {
            if (!self.enabled) return '';

            var recentLines = self._getRecentLinesText();
            var parts = [];
            parts.push('【平行世界线追踪】');
            parts.push('在正文之后，简要交代本次正文中未实际出场但与当前剧情有关的角色状态。');
            parts.push('');
            parts.push('输出格式：');
            parts.push('<parallel_world>');
            parts.push('角色A: 地点/状态/行动/与当前剧情的轻微关联');
            parts.push('角色B: 地点/状态/行动/与当前剧情的轻微关联');
            parts.push('</parallel_world>');
            parts.push('');
            parts.push('规则：');
            parts.push('1. 仅记录本轮未出场但剧情上值得同步的角色（3-5名）');
            parts.push('2. 不属于当前正文正在发生的主场景');
            parts.push('3. 不是玩家亲眼所见，除非正文明确切换视角');
            parts.push('4. 空间连续性：角色从A地到B地必须有合理移动过程，禁止瞬移');
            parts.push('5. 远距离参与只能通过通讯、传话、监控、信件等方式');
            parts.push('6. 不得强行介入当前场景，不得剧透');
            parts.push('7. 没有需要同步的角色时，跳过此标签');

            if (recentLines) {
                parts.push('');
                parts.push('【最近的世界线记录】');
                parts.push(recentLines);
            }

            return parts.join('\n');
        }, { order: 77 });
    },

    /**
     * 注册处理器
     */
    _registerProcessor: function() {
        if (typeof OutputProcessor === 'undefined') {
            var self = this;
            setTimeout(function() { self._registerProcessor(); }, 500);
            return;
        }

        var self = this;
        OutputProcessor.register('parallel-world', function(text) {
            return self._extractAndRender(text);
        }, 75);

        console.log('[ParallelWorld] 已注册到 OutputProcessor');
    },

    /**
     * 提取并渲染平行世界标签
     */
    _extractAndRender: function(text) {
        if (!text || typeof text !== 'string') return text;

        var match = text.match(/<parallel_world>([\s\S]*?)<\/parallel_world>/i);
        if (!match) return text;

        var content = match[1].trim();
        var chars = this._parseParallelChars(content);

        // 记录世界线
        if (chars.length > 0) {
            this._worldLines.push({
                turn: this._getCurrentTurn(),
                chars: chars,
                timestamp: Date.now()
            });

            // 更新最后已知位置
            chars.forEach(function(c) {
                if (c.name && c.location) {
                    this._lastKnownLocations[c.name] = {
                        location: c.location,
                        status: c.status,
                        turn: this._getCurrentTurn()
                    };
                }
            }, this);

            this.saveData();
        }

        // 渲染为折叠面板
        var rendered = this._renderFoldPanel(content);

        // 替换原始标签
        return text.replace(/<parallel_world>[\s\S]*?<\/parallel_world>/i, rendered);
    },

    /**
     * 解析平行世界角色信息
     */
    _parseParallelChars: function(content) {
        var lines = content.split('\n');
        var chars = [];
        lines.forEach(function(line) {
            line = line.trim();
            if (!line) return;
            var match = line.match(/^([^:]+):\s*(.+)/);
            if (match) {
                var name = match[1].trim();
                var details = match[2].trim();
                // 尝试解析 地点/状态/行动/关联
                var parts = details.split('/');
                chars.push({
                    name: name,
                    location: parts[0] ? parts[0].trim() : '',
                    status: parts[1] ? parts[1].trim() : '',
                    action: parts[2] ? parts[2].trim() : '',
                    relation: parts[3] ? parts[3].trim() : ''
                });
            }
        });
        return chars;
    },

    /**
     * 渲染为折叠面板
     * 来源：双人成行 v12.0 的简约美化版样式
     */
    _renderFoldPanel: function(content) {
        return '<details style="box-sizing:border-box;overflow:hidden;margin:10px 0;border-top:1px solid rgba(255,255,255,0.1);border-bottom:1px solid rgba(255,255,255,0.1);padding:0;">' +
               '<summary style="list-style:none;display:flex;justify-content:center;align-items:center;min-height:36px;padding:8px 0;cursor:pointer;user-select:none;color:#888;font-size:11px;letter-spacing:2px;">' +
               'Parallel World' +
               '</summary>' +
               '<div style="padding:0 0 12px;font-size:13px;line-height:2;white-space:pre-wrap;word-break:break-word;color:#aaa;">' +
               content +
               '</div></details>';
    },

    /**
     * 获取最近的世界线记录文本
     */
    _getRecentLinesText: function() {
        if (this._worldLines.length === 0) return '';
        var recent = this._worldLines.slice(-2);
        var lines = [];
        recent.forEach(function(wl) {
            wl.chars.forEach(function(c) {
                lines.push(c.name + ': ' + c.location + '/' + c.status + '/' + c.action);
            });
        });
        return lines.join('\n');
    },

    /**
     * 获取角色的最后已知位置
     */
    getLastKnownLocation: function(charName) {
        return this._lastKnownLocations[charName] || null;
    },

    /**
     * 获取所有世界线记录
     */
    getWorldLines: function() {
        return this._worldLines.slice();
    },

    _getCurrentTurn: function() {
        if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory._messageCount) {
            return EnhancedMemory._messageCount;
        }
        return this._worldLines.length;
    },

    setEnabled: function(enabled) {
        this.enabled = enabled;
    }
};
