/**
 * 结构化状态栏系统
 * 灵感来源：银月蛛网 v2.7 — 题记+时间状态栏
 * 设计理念：在游戏界面显示结构化状态信息：角色情绪/位置/状态、
 *           当前时间/天气/环境、剧情进度。用标签从AI输出中提取并渲染。
 *
 * 依赖：prompt-builder.js, phone-ui.js
 */
var StatusBar = {

    enabled: true,

    // 最近一次解析的状态数据
    _currentStatus: null,

    // 状态栏UI元素
    _barElement: null,

    /**
     * 状态栏字段定义
     */
    FIELDS: {
        EPIGRAPH: 'epigraph',      // 题记/诗句
        TIME: 'time',              // 游戏内时间
        DATE: 'date',              // 游戏内日期
        LOCATION: 'location',      // 当前位置
        WEATHER: 'weather',        // 天气
        TEMPERATURE: 'temperature', // 温度
        MOOD: 'mood',              // 角色情绪
        QUEST: 'quest',            // 当前任务
        PROGRESS: 'progress'       // 剧情进度
    },

    /**
     * 初始化
     */
    init: function() {
        this._loadSettings();
        this._registerPromptSection();
        this._registerStatusProcessor();
        this._createBarElement();
        console.log('[StatusBar] 状态栏系统已初始化');
    },

    /**
     * 加载设置
     */
    _loadSettings: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.getJSON) {
                var settings = Storage.getJSON('status_bar_settings', null);
                if (settings) {
                    this.enabled = settings.enabled !== false;
                }
            }
        } catch(e) {
            console.warn('[StatusBar] 读取设置失败:', e);
        }
    },

    saveSettings: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.setJSON) {
                Storage.setJSON('status_bar_settings', { enabled: this.enabled });
            }
        } catch(e) {}
    },

    /**
     * 注册 PromptBuilder section
     * 来源：银月蛛网 v2.7 的题记+时间状态栏格式
     */
    _registerPromptSection: function() {
        if (typeof PromptBuilder === 'undefined') {
            var self = this;
            setTimeout(function() { self._registerPromptSection(); }, 500);
            return;
        }

        var self = this;
        PromptBuilder.registerSection('statusBar', function(ctx) {
            if (!self.enabled) return '';

            var parts = [];
            parts.push('【结构化状态栏】');
            parts.push('在正文之前输出结构化状态信息，用于游戏界面状态栏显示。');
            parts.push('格式如下：');
            parts.push('<status>');
            parts.push('epigraph: 结合当前剧情、角色心理或环境，生成一句短句/诗句（15-30字）');
            parts.push('time: 游戏内具体时间（如：下午3点15分）');
            parts.push('date: 游戏内日期（如：2024年11月15日）');
            parts.push('location: 当前所处地点（需具体）');
            parts.push('weather: 当前天气状况（含温度，如：微雨，18℃）');
            parts.push('mood: 主角当前情绪状态（简短，如：焦虑、期待）');
            parts.push('quest: 当前主线任务（一句话）');
            parts.push('</status>');
            parts.push('');
            parts.push('要求：');
            parts.push('1. 状态栏必须在正文之前输出');
            parts.push('2. 每个字段都要填写，不能为空');
            parts.push('3. epigraph要有文学性，与当前氛围契合');
            parts.push('4. 天气要随时间合理变化');
            parts.push('5. mood要反映角色真实的心理状态');

            return parts.join('\n');
        }, { order: 53 });
    },

    /**
     * 注册状态处理器
     * 从AI输出中解析 <status> 标签
     */
    _registerStatusProcessor: function() {
        if (typeof RegexManager === 'undefined') {
            var self = this;
            setTimeout(function() { self._registerStatusProcessor(); }, 1000);
            return;
        }

        var self = this;
        var originalProcess = RegexManager.processOutput;

        if (originalProcess) {
            RegexManager.processOutput = function(text) {
                text = originalProcess.call(this, text);
                return self._extractAndStripStatus(text);
            };
        } else {
            RegexManager.processStatus = function(text) {
                return self._extractAndStripStatus(text);
            };
        }

        console.log('[StatusBar] 已注册状态处理器');
    },

    /**
     * 从文本中提取状态栏数据并移除标签
     */
    _extractAndStripStatus: function(text) {
        if (!text || typeof text !== 'string') return text;

        var statusMatch = text.match(/<status>([\s\S]*?)<\/status>/i);
        if (!statusMatch) return text;

        var statusContent = statusMatch[1];
        var status = this._parseStatusFields(statusContent);
        this._currentStatus = status;
        this._updateBarElement();

        // 从正文中移除状态栏标签（不显示在聊天气泡中）
        return text.replace(/<status>[\s\S]*?<\/status>/i, '').trim();
    },

    /**
     * 解析状态字段
     */
    _parseStatusFields: function(content) {
        var fields = {};
        var lines = content.trim().split('\n');
        lines.forEach(function(line) {
            line = line.trim();
            if (!line) return;
            var colonIdx = line.indexOf(':');
            if (colonIdx === -1) return;
            var key = line.substring(0, colonIdx).trim().toLowerCase();
            var value = line.substring(colonIdx + 1).trim();
            fields[key] = value;
        });
        return fields;
    },

    /**
     * 创建状态栏UI元素
     */
    _createBarElement: function() {
        // 等待DOM就绪
        var self = this;
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                self._createBarElement();
            });
            return;
        }

        // 查找游戏容器
        var gameContainer = document.querySelector('.phone-screen') ||
                           document.querySelector('#game-container') ||
                           document.querySelector('.chat-container');

        if (!gameContainer) {
            setTimeout(function() { self._createBarElement(); }, 500);
            return;
        }

        // 创建状态栏元素
        var bar = document.createElement('div');
        bar.id = 'game-status-bar';
        bar.style.cssText = [
            'position:sticky',
            'top:0',
            'z-index:50',
            'background:rgba(20,20,35,0.92)',
            'backdrop-filter:blur(12px)',
            'border-bottom:1px solid rgba(255,255,255,0.08)',
            'padding:8px 16px',
            'font-size:12px',
            'color:#e0e0e0',
            'display:none',
            'transition:opacity 0.3s ease'
        ].join(';');

        bar.innerHTML = '<div class="status-epigraph" style="font-style:italic;color:#a0a0c0;text-align:center;margin-bottom:4px;font-size:12px;"></div>' +
                       '<div class="status-info" style="display:flex;flex-wrap:wrap;gap:6px 12px;justify-content:center;font-size:11px;"></div>';

        // 插入到游戏容器之前
        gameContainer.parentNode.insertBefore(bar, gameContainer);
        this._barElement = bar;
    },

    /**
     * 更新状态栏UI
     */
    _updateBarElement: function() {
        if (!this._barElement || !this._currentStatus) return;

        var s = this._currentStatus;
        var bar = this._barElement;

        // 题记
        var epigraphEl = bar.querySelector('.status-epigraph');
        if (epigraphEl && s.epigraph) {
            epigraphEl.textContent = '「' + s.epigraph + '」';
        }

        // 状态信息
        var infoEl = bar.querySelector('.status-info');
        if (infoEl) {
            var chips = [];
            if (s.time) chips.push('🕐 ' + s.time);
            if (s.date) chips.push('📅 ' + s.date);
            if (s.location) chips.push('📍 ' + s.location);
            if (s.weather) chips.push('🌤 ' + s.weather);
            if (s.mood) chips.push('💭 ' + s.mood);
            if (s.quest) chips.push('⚔ ' + s.quest);

            infoEl.innerHTML = chips.map(function(c) {
                return '<span style="background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:10px;">' + c + '</span>';
            }).join('');
        }

        // 显示状态栏
        bar.style.display = 'block';
    },

    /**
     * 获取当前状态
     */
    getCurrentStatus: function() {
        return this._currentStatus;
    },

    setEnabled: function(enabled) {
        this.enabled = enabled;
        this.saveSettings();
        if (!enabled && this._barElement) {
            this._barElement.style.display = 'none';
        }
    }
};
