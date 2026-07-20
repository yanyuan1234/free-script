/**
 * @file bookmark.js
 * @description 书签/分支系统模块
 *
 * 允许玩家从对话历史中的特定消息创建分支书签，从而探索不同的剧情线。
 * 每个书签会深拷贝创建时刻的完整 gameState 与（截断到 messageIndex 的）
 * conversationHistory，玩家可在任意时刻切换回某个书签，回到该分支起点
 * 继续游戏，实现"多周目/多分支"式的剧情探索。
 *
 * 数据持久化：
 *   - 书签集合通过 localStorage（键名 freeScript_bookmarks）持久化，
 *     跨会话保留。
 *   - 同时镜像写入 StateManager 的 ui.bookmarks 路径，便于 UI 层通过
 *     StateManager.subscribe 订阅刷新。
 *
 * 依赖：
 *   - StateManager（js/state/state-manager.js）：读取/写入游戏状态
 *   - StateSchema（js/state/schema.js）：deepClone 工具与版本号
 *   - Storage（js/utils.js）：localStorage 安全读写（可选，缺失时回退原生）
 *
 * 暴露接口（window.BookmarkManager）：
 *   - create(messageIndex, label)         创建书签分支
 *   - list()                              列出所有书签
 *   - get(bookmarkId)                     获取单个书签
 *   - switchTo(bookmarkId)                切换到指定书签分支
 *   - delete(bookmarkId)                  删除书签
 *   - exportBranch(bookmarkId)            导出分支为独立存档
 *   - getActive()                         获取当前激活的书签 ID
 *   - updateLabel(bookmarkId, newLabel)   更新书签标签
 *   - clear()                             清空所有书签
 */

// ========================================
// 书签/分支系统 - BookmarkManager
// ========================================
(function () {
    'use strict';

    /**
     * localStorage 持久化键名
     * @type {string}
     * @private
     */
    var STORAGE_KEY = 'freeScript_bookmarks';

    /**
     * StateManager 中镜像书签集合的路径
     * @type {string}
     * @private
     */
    var STATE_PATH = 'ui.bookmarks';

    /**
     * 生成全局唯一的书签 ID
     * 采用 时间戳(36进制) + 随机串 的组合，确保极低碰撞概率
     * @returns {string} 形如 "bm_lh2k3x_8f2a1b" 的唯一 ID
     * @private
     */
    function _generateId() {
        var ts = Date.now().toString(36);
        var rand = Math.random().toString(36).slice(2, 8);
        return 'bm_' + ts + '_' + rand;
    }

    /**
     * 深拷贝工具
     * 优先使用 StateSchema.deepClone（已处理危险键过滤），缺失时回退到 JSON 方案
     * @param {*} obj - 待拷贝对象
     * @returns {*} 深拷贝结果
     * @private
     */
    function _deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (typeof StateSchema !== 'undefined' && typeof StateSchema.deepClone === 'function') {
            return StateSchema.deepClone(obj);
        }
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch (e) {
            console.error('[BookmarkManager] 深拷贝失败:', e);
            return obj;
        }
    }

    /**
     * 从 localStorage 读取书签集合
     * 优先走 Storage 工具（带异常吞咽），否则回退原生 localStorage
     * @returns {Array<Object>} 书签数组（永不返回 null，异常时返回空数组）
     * @private
     */
    function _loadFromStorage() {
        if (typeof Storage !== 'undefined' && typeof Storage.getJSON === 'function') {
            var list = Storage.getJSON(STORAGE_KEY, []);
            return Array.isArray(list) ? list : [];
        }
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            var parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.warn('[BookmarkManager] 读取书签失败，返回空列表:', e);
            return [];
        }
    }

    /**
     * 将书签集合写入 localStorage
     * @param {Array<Object>} bookmarks - 书签数组
     * @returns {boolean} 是否写入成功
     * @private
     */
    function _saveToStorage(bookmarks) {
        if (!Array.isArray(bookmarks)) bookmarks = [];
        if (typeof Storage !== 'undefined' && typeof Storage.setJSON === 'function') {
            var result = Storage.setJSON(STORAGE_KEY, bookmarks);
            return !!(result && result.success !== false);
        }
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
            return true;
        } catch (e) {
            console.error('[BookmarkManager] 持久化失败:', e);
            return false;
        }
    }

    /**
     * 同步书签集合到 StateManager（ui.bookmarks）
     * 使用 silent 选项避免触发冗余通知；同步失败不影响主流程
     * @param {Array<Object>} bookmarks - 书签数组
     * @private
     */
    function _syncToStateManager(bookmarks) {
        try {
            if (typeof StateManager !== 'undefined' && typeof StateManager.set === 'function') {
                StateManager.set(STATE_PATH, bookmarks, { silent: true });
            }
        } catch (e) {
            // 同步到 StateManager 失败不影响 localStorage 主流程
            console.debug('[BookmarkManager] 同步到 StateManager 失败:', e);
        }
    }

    /**
     * 获取当前完整游戏状态快照（深拷贝）
     * 优先使用 StateManager.snapshot()，缺失时回退到 window.gameState 深拷贝
     * @returns {Object|null} 完整状态快照，失败返回 null
     * @private
     */
    function _captureGameState() {
        if (typeof StateManager !== 'undefined' && typeof StateManager.snapshot === 'function') {
            try {
                return StateManager.snapshot();
            } catch (e) {
                console.warn('[BookmarkManager] StateManager.snapshot 失败:', e);
            }
        }
        if (typeof window !== 'undefined' && window.gameState) {
            return _deepClone(window.gameState);
        }
        return null;
    }

    /**
     * 获取当前对话历史（深拷贝）
     * 对话历史存储于 progress.conversationHistory，每条消息结构为
     * { role: 'user'|'assistant'|'system', content: string, ... }
     * @returns {Array<Object>} 对话历史数组
     * @private
     */
    function _captureConversationHistory() {
        if (typeof StateManager !== 'undefined' && typeof StateManager.get === 'function') {
            try {
                var hist = StateManager.get('progress.conversationHistory');
                return Array.isArray(hist) ? hist : [];
            } catch (e) {
                console.warn('[BookmarkManager] 读取 conversationHistory 失败:', e);
            }
        }
        if (typeof window !== 'undefined' && window.gameState &&
            window.gameState.conversationHistory && Array.isArray(window.gameState.conversationHistory)) {
            return _deepClone(window.gameState.conversationHistory);
        }
        return [];
    }

    /**
     * 校验并修正 messageIndex，使其落在 [0, len-1] 区间
     * @param {number} messageIndex - 待校验的索引
     * @param {number} length - 对话历史长度
     * @returns {number} 校正后的索引；length 为 0 时返回 -1 表示无消息可标记
     * @private
     */
    function _sanitizeMessageIndex(messageIndex, length) {
        if (typeof messageIndex !== 'number' || !isFinite(messageIndex) || messageIndex < 0) {
            return length > 0 ? length - 1 : -1;
        }
        if (length === 0) return -1;
        if (messageIndex >= length) return length - 1;
        return Math.floor(messageIndex);
    }

    /**
     * @namespace BookmarkManager
     * @description 书签管理器全局接口
     */
    var BookmarkManager = {
        /**
         * 当前激活的书签 ID
         * null 表示当前处于"主分支"（未切换到任何书签）
         * @type {string|null}
         * @private
         */
        _activeBookmarkId: null,

        /**
         * 从指定消息创建书签分支
         *
         * 创建时会深拷贝当前完整 gameState 作为快照，
         * 并把 conversationHistory 截断到 [0, messageIndex] 作为分支起点。
         * 切换回该书签时，将以这两个快照恢复状态与对话，玩家可从此处探索新剧情。
         *
         * @param {number} messageIndex - 分支起点的消息索引（0-based，包含该消息）
         * @param {string} [label] - 书签可读标签，缺省时自动生成 "书签 #N"
         * @returns {Object|null} 创建成功的书签对象（深拷贝），失败返回 null
         *
         * @example
         * // 在第 5 条消息处创建书签
         * var bm = BookmarkManager.create(5, '酒馆选择前');
         * if (bm) console.log('已创建:', bm.id, bm.label);
         */
        create: function (messageIndex, label) {
            // 捕获当前完整状态
            var gameStateSnapshot = _captureGameState();
            if (!gameStateSnapshot) {
                console.warn('[BookmarkManager] 创建失败：无法获取当前 gameState');
                return null;
            }

            // 捕获当前对话历史
            var fullHistory = _captureConversationHistory();

            // 校正 messageIndex
            var safeIndex = _sanitizeMessageIndex(messageIndex, fullHistory.length);
            if (safeIndex < 0) {
                console.warn('[BookmarkManager] 创建失败：对话历史为空，无法创建书签');
                return null;
            }
            if (safeIndex !== messageIndex) {
                console.debug('[BookmarkManager] messageIndex 已校正:',
                    messageIndex, '->', safeIndex);
            }

            // 截断对话历史到分支起点（深拷贝，包含 messageIndex 处的消息）
            var conversationHistorySnapshot = _deepClone(fullHistory.slice(0, safeIndex + 1));

            // 生成标签
            var nextLabel = label || ('书签 #' + (this.list().length + 1));

            // 构建书签对象
            var bookmark = {
                /** 书签唯一 ID */
                id: _generateId(),
                /** 可读标签 */
                label: String(nextLabel),
                /** 分支起点的消息索引 */
                messageIndex: safeIndex,
                /** 创建时间戳（毫秒） */
                timestamp: Date.now(),
                /** 创建时刻的完整 gameState 深拷贝 */
                gameStateSnapshot: gameStateSnapshot,
                /** 分支起点的对话历史深拷贝（截断到 messageIndex） */
                conversationHistorySnapshot: conversationHistorySnapshot
            };

            // 持久化到 localStorage
            var bookmarks = _loadFromStorage();
            bookmarks.push(bookmark);
            if (!_saveToStorage(bookmarks)) {
                console.error('[BookmarkManager] 书签持久化失败，创建中止');
                return null;
            }

            // 镜像到 StateManager
            _syncToStateManager(bookmarks);

            console.log('[BookmarkManager] 书签已创建:', bookmark.id, '"' + bookmark.label + '"',
                '@msg#' + safeIndex);
            return _deepClone(bookmark);
        },

        /**
         * 列出所有书签
         * @returns {Array<Object>} 书签列表的深拷贝（按创建时间升序），无书签时返回空数组
         *
         * @example
         * var list = BookmarkManager.list();
         * list.forEach(function(bm) {
         *   console.log(bm.id, bm.label, new Date(bm.timestamp));
         * });
         */
        list: function () {
            var bookmarks = _loadFromStorage();
            // 按 timestamp 升序排序后返回深拷贝
            var sorted = bookmarks.slice().sort(function (a, b) {
                return (a.timestamp || 0) - (b.timestamp || 0);
            });
            return _deepClone(sorted);
        },

        /**
         * 获取单个书签（深拷贝）
         * @param {string} bookmarkId - 书签 ID
         * @returns {Object|null} 书签对象的深拷贝，不存在时返回 null
         */
        get: function (bookmarkId) {
            if (!bookmarkId) return null;
            var bookmarks = _loadFromStorage();
            for (var i = 0; i < bookmarks.length; i++) {
                if (bookmarks[i] && bookmarks[i].id === bookmarkId) {
                    return _deepClone(bookmarks[i]);
                }
            }
            return null;
        },

        /**
         * 切换到指定书签分支
         *
         * 执行流程：
         *   1. 通过 StateManager.attachState 用书签的 gameStateSnapshot 替换当前状态
         *      （attachState 会重建 window.gameState 引用，不调用 normalizeState，
         *       保证快照原样恢复）
         *   2. 显式覆盖 progress.conversationHistory 为书签的截断版本，
         *      使对话回到分支起点
         *   3. 记录当前激活的书签 ID
         *
         * 注意：切换会丢弃当前未保存的进度，建议在切换前由 UI 层提示玩家确认。
         *
         * @param {string} bookmarkId - 目标书签 ID
         * @returns {boolean} 切换是否成功
         *
         * @example
         * if (BookmarkManager.switchTo('bm_lh2k3x_8f2a1b')) {
         *   console.log('已回到分支起点，可探索新剧情');
         * }
         */
        switchTo: function (bookmarkId) {
            var bookmark = this.get(bookmarkId);
            if (!bookmark) {
                console.warn('[BookmarkManager] 切换失败：书签不存在:', bookmarkId);
                return false;
            }
            if (!bookmark.gameStateSnapshot) {
                console.warn('[BookmarkManager] 切换失败：书签缺少 gameStateSnapshot:', bookmarkId);
                return false;
            }

            // 1. 恢复完整 gameState（深拷贝快照，避免污染原书签）
            var restoredState = _deepClone(bookmark.gameStateSnapshot);
            if (typeof StateManager !== 'undefined' && typeof StateManager.attachState === 'function') {
                var ok = StateManager.attachState(restoredState);
                if (!ok) {
                    console.warn('[BookmarkManager] attachState 失败，尝试直接赋值');
                    if (typeof window !== 'undefined') {
                        window.gameState = restoredState;
                    }
                }
            } else if (typeof window !== 'undefined') {
                // 兜底：直接替换全局 gameState
                window.gameState = restoredState;
            } else {
                console.error('[BookmarkManager] 无可用状态恢复途径');
                return false;
            }

            // 2. 覆盖 conversationHistory 为分支起点（截断版本）
            if (bookmark.conversationHistorySnapshot &&
                typeof StateManager !== 'undefined' && typeof StateManager.set === 'function') {
                StateManager.set('progress.conversationHistory',
                    _deepClone(bookmark.conversationHistorySnapshot));
            }

            // 3. 记录激活的书签
            this._activeBookmarkId = bookmark.id;

            console.log('[BookmarkManager] 已切换到书签:', '"' + bookmark.label + '"',
                '@msg#' + bookmark.messageIndex);
            return true;
        },

        /**
         * 删除书签
         * 若删除的是当前激活的书签，会清空激活标记（但不会自动切回主分支，
         * 调用方需自行决定后续行为）。
         * @param {string} bookmarkId - 待删除书签 ID
         * @returns {boolean} 删除是否成功（书签不存在也返回 false）
         */
        delete: function (bookmarkId) {
            if (!bookmarkId) return false;
            var bookmarks = _loadFromStorage();
            var before = bookmarks.length;
            bookmarks = bookmarks.filter(function (bm) {
                return bm && bm.id !== bookmarkId;
            });
            if (bookmarks.length === before) {
                // 没有匹配项，书签不存在
                return false;
            }
            if (!_saveToStorage(bookmarks)) {
                console.error('[BookmarkManager] 删除后持久化失败');
                return false;
            }
            _syncToStateManager(bookmarks);

            // 清理激活标记
            if (this._activeBookmarkId === bookmarkId) {
                this._activeBookmarkId = null;
            }
            console.log('[BookmarkManager] 书签已删除:', bookmarkId);
            return true;
        },

        /**
         * 导出分支为独立存档
         *
         * 基于书签的 gameStateSnapshot，并把其中的 conversationHistory
         * 替换为书签的截断版本，包装成可独立加载的存档对象。
         * 调用方可进一步把返回值 JSON.stringify 后保存为文件或分享。
         *
         * @param {string} bookmarkId - 书签 ID
         * @returns {Object|null} 独立存档对象，失败返回 null。结构：
         *   {
         *     meta: {
         *       type: 'bookmark_branch_export',
         *       bookmarkId, bookmarkLabel, messageIndex,
         *       originalTimestamp, exportedAt, version
         *     },
         *     gameState: { ...完整状态，conversationHistory 已截断... }
         *   }
         *
         * @example
         * var exported = BookmarkManager.exportBranch('bm_lh2k3x_8f2a1b');
         * if (exported) {
         *   var blob = new Blob([JSON.stringify(exported)], {type:'application/json'});
         *   // 下载或分享 blob ...
         * }
         */
        exportBranch: function (bookmarkId) {
            var bookmark = this.get(bookmarkId);
            if (!bookmark) {
                console.warn('[BookmarkManager] 导出失败：书签不存在:', bookmarkId);
                return null;
            }
            if (!bookmark.gameStateSnapshot) {
                console.warn('[BookmarkManager] 导出失败：书签缺少 gameStateSnapshot:', bookmarkId);
                return null;
            }

            // 深拷贝 gameState 作为导出基底（避免污染原书签）
            var exportedState = _deepClone(bookmark.gameStateSnapshot);

            // 用截断的 conversationHistory 覆盖，使导出存档即为分支起点
            if (exportedState && exportedState.progress) {
                exportedState.progress.conversationHistory =
                    _deepClone(bookmark.conversationHistorySnapshot || []);
            } else if (exportedState) {
                exportedState.progress = {
                    conversationHistory: _deepClone(bookmark.conversationHistorySnapshot || [])
                };
            }

            // 包装为独立存档格式
            var version = (typeof StateSchema !== 'undefined' && StateSchema.VERSION)
                ? StateSchema.VERSION : '1.0.0';

            return {
                meta: {
                    /** 存档类型标识 */
                    type: 'bookmark_branch_export',
                    /** 源书签 ID */
                    bookmarkId: bookmark.id,
                    /** 源书签标签 */
                    bookmarkLabel: bookmark.label,
                    /** 分支起点消息索引 */
                    messageIndex: bookmark.messageIndex,
                    /** 书签原始创建时间 */
                    originalTimestamp: bookmark.timestamp,
                    /** 导出时间 */
                    exportedAt: Date.now(),
                    /** 状态 schema 版本 */
                    version: version
                },
                /** 完整游戏状态（对话历史已截断到分支起点） */
                gameState: exportedState
            };
        },

        /**
         * 获取当前激活的书签 ID
         * @returns {string|null} 激活书签 ID，未切换到任何书签时返回 null（主分支）
         */
        getActive: function () {
            return this._activeBookmarkId;
        },

        /**
         * 更新书签标签
         * @param {string} bookmarkId - 书签 ID
         * @param {string} newLabel - 新标签
         * @returns {boolean} 更新是否成功
         */
        updateLabel: function (bookmarkId, newLabel) {
            if (!bookmarkId || !newLabel) return false;
            var label = String(newLabel);
            var bookmarks = _loadFromStorage();
            var updated = false;
            for (var i = 0; i < bookmarks.length; i++) {
                if (bookmarks[i] && bookmarks[i].id === bookmarkId) {
                    bookmarks[i].label = label;
                    updated = true;
                    break;
                }
            }
            if (!updated) return false;
            if (!_saveToStorage(bookmarks)) {
                console.error('[BookmarkManager] 更新标签后持久化失败');
                return false;
            }
            _syncToStateManager(bookmarks);
            console.log('[BookmarkManager] 标签已更新:', bookmarkId, '->', label);
            return true;
        },

        /**
         * 清空所有书签
         * 不可逆操作，调用方应先提示玩家确认。
         * @returns {boolean} 是否清空成功
         */
        clear: function () {
            if (!_saveToStorage([])) {
                console.error('[BookmarkManager] 清空书签失败');
                return false;
            }
            _syncToStateManager([]);
            this._activeBookmarkId = null;
            console.log('[BookmarkManager] 所有书签已清空');
            return true;
        },

        /**
         * 初始化：从 localStorage 加载书签并同步到 StateManager
         * 建议在游戏启动流程中调用一次
         */
        init: function () {
            var bookmarks = _loadFromStorage();
            _syncToStateManager(bookmarks);
            console.log('[BookmarkManager] 初始化完成，已加载', bookmarks.length, '个书签');
        }
    };

    // 暴露全局接口
    if (typeof window !== 'undefined') {
        window.BookmarkManager = BookmarkManager;
    }
    // 兼容 CommonJS（用于 Node 环境的单元测试）
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = BookmarkManager;
    }
})();
