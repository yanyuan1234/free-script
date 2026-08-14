/**
 * 输出处理器注册中心
 * 统一管理各模块对 AI 输出文本的处理（标签解析、内容提取、渲染注入等）
 *
 * 设计原因：
 *   各模块（CreativeTheater、ParallelWorld、StatusBar、DocRenderer、DreamEngine）
 *   原本尝试 hook RegexManager.processOutput，但该方法并不存在，
 *   导致所有模块的标签处理逻辑从未被执行。
 *
 *   本注册中心提供统一的 register/process 接口，
 *   由 renderStory() 在 RegexEngine.execute 之后统一调用。
 *
 * 依赖：无
 * 被依赖：game.js (renderStory), 各功能模块
 */
var OutputProcessor = {

    /**
     * 已注册的处理器列表
     * 格式: [{ id, fn, order }]
     * order 越小越先执行（默认 100）
     */
    _processors: [],

    /**
     * 注册一个输出处理器
     * @param {string} id - 处理器唯一标识（用于去重）
     * @param {function} fn - 处理函数，签名 (text) => text
     * @param {number} order - 执行顺序，越小越先（默认 100）
     */
    register: function(id, fn, order) {
        if (!id || typeof fn !== 'function') return;

        // 去重：如果已存在同 id 的处理器，替换之
        var existing = this._processors.find(function(p) { return p.id === id; });
        if (existing) {
            existing.fn = fn;
            existing.order = order || 100;
            return;
        }

        this._processors.push({
            id: id,
            fn: fn,
            order: order || 100
        });

        // 按 order 排序
        this._processors.sort(function(a, b) { return a.order - b.order; });
    },

    /**
     * 执行所有已注册的处理器
     * @param {string} text - AI 输出文本
     * @returns {string} 处理后的文本
     */
    process: function(text) {
        if (!text || typeof text !== 'string') return text;

        for (var i = 0; i < this._processors.length; i++) {
            try {
                text = this._processors[i].fn(text);
                if (!text || typeof text !== 'string') break;
            } catch (e) {
                console.error('[OutputProcessor] 处理器 "' + this._processors[i].id + '" 执行失败:', e);
            }
        }

        return text;
    },

    /**
     * 移除指定处理器
     */
    unregister: function(id) {
        this._processors = this._processors.filter(function(p) { return p.id !== id; });
    },

    /**
     * 获取已注册处理器数量
     */
    count: function() {
        return this._processors.length;
    }
};
