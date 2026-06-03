// ========================================
// 第0层: 全局变量和配置
// ========================================
// 【已清理】移除开发模式日志重定向，减少运行时开销
// ========================================
// 自由剧本 - 完整游戏逻辑
// ========================================

// ========================================
// UI工具
// ========================================
var UI = {
    toast: function(msg) {
        var ct = document.getElementById('toastContainer');
        if (!ct) return;
        var t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        ct.appendChild(t);
        TimerManager.setTimeout('uiToast', function() {
            if (t.parentNode) t.remove();
            }, 2500);
        },
    showPage: function(id) {
        var el = document.getElementById(id);
        if (el && el.classList.contains('active')) return;
        var pages = document.querySelectorAll('.page');
        for (var pi = 0; pi < pages.length; pi++) {
            pages[pi].classList.remove('active');
        }
        if (el) el.classList.add('active');
    },
    _modalStack: [],
    _pendingResolvers: {},
    showModal: function(id) {
        var el = document.getElementById(id);
        if (el) {
            // 模态框栈管理：每次打开新模态框时提升z-index
            this._modalStack.push(id);
            var zIndex = 100 + this._modalStack.length * 10;
            el.style.zIndex = zIndex;
            el.classList.add('active');
        }
    },
    hideModal: function(id) {
        var el = document.getElementById(id);
        if (el) {
            el.classList.remove('active');
            el.style.zIndex = '';
            // 从栈中移除
            var idx = this._modalStack.indexOf(id);
            if (idx !== -1) this._modalStack.splice(idx, 1);
        }
        // 自动 resolve 未完成的 Promise（如 confirm/prompt 的关闭按钮或点击背景关闭）
        if (this._pendingResolvers[id]) {
            var resolve = this._pendingResolvers[id];
            delete this._pendingResolvers[id];
            // confirmModal 默认 resolve false，promptModal 默认 resolve null
            resolve(id === 'confirmModal' ? false : null);
        }
    },
    confirm: function(title, message) {
        return new Promise(function(resolve) {
            var titleEl = document.getElementById('confirmTitle');
            var msgEl = document.getElementById('confirmMessage');
            if (!titleEl || !msgEl) {
                resolve(false);
                return;
            }
        titleEl.textContent = title;
        msgEl.textContent = message;
        // 注册 resolver，确保任何关闭方式都能 resolve Promise
        UI._pendingResolvers['confirmModal'] = function(val) { resolve(val); };
        UI.showModal('confirmModal');
        var yesBtn = document.getElementById('confirmYes');
        if (!yesBtn) {
            delete UI._pendingResolvers['confirmModal'];
            resolve(false);
            return;
        }
        var newYes = yesBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newYes, yesBtn);
        newYes.addEventListener('click', function() {
            delete UI._pendingResolvers['confirmModal'];
            UI.hideModal('confirmModal');
            resolve(true);
            });
        // 绑定"否"按钮
        var noBtn = document.getElementById('confirmNo');
        if (noBtn) {
            var newNo = noBtn.cloneNode(true);
            noBtn.parentNode.replaceChild(newNo, noBtn);
            newNo.addEventListener('click', function() {
                delete UI._pendingResolvers['confirmModal'];
                UI.hideModal('confirmModal');
                resolve(false);
                });
        }
        // 绑定右上角关闭按钮（circle-btn）
        var closeBtn = document.querySelector('#confirmModal .modal-header [data-close="confirmModal"]');
        if (closeBtn) {
            var newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
            newCloseBtn.addEventListener('click', function() {
                delete UI._pendingResolvers['confirmModal'];
                UI.hideModal('confirmModal');
                resolve(false);
            });
        }
    });
    },
    prompt: function(title, defaultValue) {
        return new Promise(function(resolve) {
            var titleEl = document.getElementById('promptTitle');
            var inputEl = document.getElementById('promptInput');
            if (!titleEl || !inputEl) {
                resolve(null);
                return;
            }
        titleEl.textContent = title;
        inputEl.value = defaultValue || '';
        // 注册 resolver，确保任何关闭方式都能 resolve Promise
        UI._pendingResolvers['promptModal'] = function(val) { resolve(val); };
        UI.showModal('promptModal');
        inputEl.focus();
        var okBtn = document.getElementById('promptOk');
        var cancelBtn = document.getElementById('promptCancel');
        if (!okBtn) {
            delete UI._pendingResolvers['promptModal'];
            resolve(null);
            return;
        }
        var newOk = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOk, okBtn);
        newOk.addEventListener('click', function() {
            delete UI._pendingResolvers['promptModal'];
            UI.hideModal('promptModal');
            resolve(inputEl.value || null);
            });
        if (cancelBtn) {
            var newCancel = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
            newCancel.addEventListener('click', function() {
                delete UI._pendingResolvers['promptModal'];
                UI.hideModal('promptModal');
                resolve(null);
                });
        }
        // 绑定右上角关闭按钮（circle-btn）
        var closeBtn = document.querySelector('#promptModal .modal-header [data-close="promptModal"]');
        if (closeBtn) {
            var newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
            newCloseBtn.addEventListener('click', function() {
                delete UI._pendingResolvers['promptModal'];
                UI.hideModal('promptModal');
                resolve(null);
            });
        }
    // 回车确认
    inputEl.onkeydown = function(e) {
        if (e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            delete UI._pendingResolvers['promptModal'];
            UI.hideModal('promptModal');
            resolve(inputEl.value || null);
        }
    };
    });
    }
};
// ==================== API配置管理 ====================
// 来源：game_integrated.html 第 3438-3531 行
// 功能：多API端点管理、分组、自动轮询、连接测试、模型列表获取

var LocalGameAPI = {
    _configs: [{
        baseUrl: 'https://api.iamhc.cn/v1',
        apiKey: '',
        model: 'auto',
        models: []
    },
    {
        baseUrl: 'https://api.iamhc.cn/v1',
        apiKey: '',
        model: 'moonshotai/kimi-k2.6',
        models: []
        },
    {
        baseUrl: 'https://api.iamhc.cn/v1',
        apiKey: '',
        model: 'Qwen3.6-35B-A3B',
        models: []
        },
    {
        baseUrl: 'https://api.iamhc.cn/v1',
        apiKey: '',
        model: 'meta/llama-3.3-70b-instruct',
        models: []
        },
    {
        baseUrl: 'https://api.iamhc.cn/v1',
        apiKey: '',
        model: 'qwen/qwen3-coder-480b-a35b-instruct',
        models: []
        }
    ],
    _currentSlot: 0,
    _autoRotate: true,
    _requestLog: [], // [{slot, model, time, success, error}]
    _failedModels: {}, // {modelName: timestamp}
    _MAX_LOG: 50,
    init() {
        try {
            const saved = localStorage.getItem('free_script_api_config');
            if (saved) {
                const data = JSON.parse(saved);
                // 版本检查：如果旧配置包含已下线的模型，清除旧配置使用新默认值
                // 【修复】清除旧配置时保留 apiKey 和 baseUrl，避免用户配置丢失
                const oldModels = ['deepseek-v4-flash', 'gemini-2.5-flash'];
                const hasOld = data.configs && data.configs.some(c => oldModels.includes(c.model));
                if (hasOld) {
                    // 保留已有配置的 apiKey 和 baseUrl
                    const savedKeys = {};
                    data.configs.forEach((cfg, idx) => {
                        if (cfg.apiKey) savedKeys[idx] = { apiKey: cfg.apiKey };
                        if (cfg.baseUrl) savedKeys[idx] = savedKeys[idx] || {};
                        if (cfg.baseUrl) savedKeys[idx].baseUrl = cfg.baseUrl;
                        });
                    // 应用新默认值，但保留 apiKey 和 baseUrl
                    this._configs.forEach((cfg, idx) => {
                        if (savedKeys[idx]) {
                            if (savedKeys[idx].apiKey) cfg.apiKey = savedKeys[idx].apiKey;
                            if (savedKeys[idx].baseUrl) cfg.baseUrl = savedKeys[idx].baseUrl;
                        }
                    });
                console.log('[API] 检测到旧模型配置，已更新配置（保留API密钥）');
                this.save();
                return;
            }
            if (data.configs && data.configs.length > 0) {
                this._configs = data.configs;
            }
        this._currentSlot = data.currentSlot || 0;
        this._autoRotate = data.autoRotate !== undefined ? data.autoRotate : this._autoRotate;
        this._groups = data.groups || [];
        this._currentGroup = data.currentGroup || 'all';
        this._requestLog = data.requestLog || [];
        this._failedModels = data.failedModels || {};
    }
    } catch (e) {
    console.error('加载API配置失败:', e);
    }
    },
    save() {
        try {
            safeSetItem('free_script_api_config', JSON.stringify({
                configs: this._configs,
                currentSlot: this._currentSlot,
                autoRotate: this._autoRotate,
                groups: this._groups || [],
                currentGroup: this._currentGroup || 'all',
                requestLog: this._requestLog.slice(-this._MAX_LOG),
                failedModels: this._failedModels
                }));
            } catch (e) {
            console.error('保存API配置失败:', e);
            }
    },
    getGroups() {
        const groups = new Set();
        if (this._groups) this._groups.forEach(g => groups.add(g));
        this._configs.forEach(c => {
            if (c.group) groups.add(c.group);
            });
        return Array.from(groups);
    },
    deleteGroup(groupName) {
        // 从 _groups 数组中删除
        if (this._groups) {
            this._groups = this._groups.filter(g => g !== groupName);
        }
    // 将该分组下的所有API变为未分组
    this._configs.forEach(cfg => {
        if (cfg.group === groupName) {
            cfg.group = '';
        }
    });
    this.save();
    },
    getCurrentConfig() {
        return this._configs[this._currentSlot] || this._configs[0];
    },
    setConfig(slot, config) {
        this._configs[slot] = {
            ...this._configs[slot],
            ...config
            };
        this.save();
    },
    setCurrentSlot(slot) {
        this._currentSlot = slot;
        this.save();
    },
    setAutoRotate(val) {
        this._autoRotate = val;
        this.save();
    },
    async tryWithFallback(requestFn) {
        // 网络错误重试配置
        const MAX_RETRIES = 3; // 每个配置最多重试3次
        const RETRY_DELAY_BASE = 1000; // 基础延迟1秒

        async function retryRequest(slotIdx, attempt) {
            try {
                const result = await requestFn(slotIdx);
                return result;
                } catch (e) {
                var errMsg = translateError((e && e.message) ? e.message : String(e));
                // 判断是否是可重试的错误
                var isRetryable =
                errMsg.includes('网络') ||
                errMsg.includes('network') ||
                errMsg.includes('timeout') ||
                errMsg.includes('超时') ||
                errMsg.includes('ECONNREFUSED') ||
                errMsg.includes('ETIMEDOUT') ||
                errMsg.includes('fetch') ||
                errMsg.includes('Failed to fetch') ||
                errMsg.includes('abort') ||
                errMsg.includes('AbortError') ||
                (e.name === 'TypeError' && errMsg.includes('fetch'));

                if (isRetryable && attempt < MAX_RETRIES - 1) {
                    var delay = RETRY_DELAY_BASE * Math.pow(2, attempt); // 指数退避
                    console.log('[重试] 配置 ' + (slotIdx + 1) + ' 第' + (attempt + 1) + '次失败，' + delay + 'ms后重试...');
                    await new Promise(function(resolve) { setTimeout(resolve, delay); });
                    return retryRequest(slotIdx, attempt + 1);
                }
                throw e;
            }
    }

    if (!this._autoRotate) {
        try {
            var result = await retryRequest(this._currentSlot, 0);
            this._logRequest(this._currentSlot, true);
            return result;
            } catch (e) {
            this._logRequest(this._currentSlot, false, e.message);
            this._markModelFailed(this._currentSlot);
            throw e;
            }
    }
    const totalSlots = this._configs.length;
    let attemptedCount = 0;
    for (let attempt = 0; attempt < totalSlots; attempt++) {
        const slotIdx = (this._currentSlot + attempt) % totalSlots;
        const cfg = this._configs[slotIdx];
        // 跳过配置不完整的API
        if (!cfg.baseUrl || !cfg.apiKey) {
            console.log('[API轮换] 配置 ' + (slotIdx + 1) + ' 不完整，跳过');
            continue;
        }
    // 跳过最近失败的模型（24小时内）
    if (cfg.model && this.isModelFailed(cfg.model)) {
        console.log('[API轮换] 模型 ' + cfg.model + ' 最近失败，跳过');
        continue;
    }
    attemptedCount++;
    try {
        const result = await retryRequest(slotIdx, 0);
        this._logRequest(slotIdx, true);
        if (attempt > 0 && slotIdx !== this._currentSlot) {
            this.setCurrentSlot(slotIdx);
            UI.toast('已自动切换到配置 ' + (slotIdx + 1));
        }
        return result;
        } catch (e) {
        var errMsg = translateError((e && e.message) ? e.message : String(e));
        this._logRequest(slotIdx, false, errMsg);
        this._markModelFailed(slotIdx);
        console.warn('配置 ' + (slotIdx + 1) + ' (' + cfg.model + ') 调用失败:', errMsg);
        if (attemptedCount < totalSlots) UI.toast('配置 ' + (slotIdx + 1) + ' 失败，尝试下一个...');
    }
    }
    // 更详细的错误信息
    if (attemptedCount === 0) {
        throw new Error('没有可用的API配置，请检查API设置（URL和Key是否完整）');
    }
    throw new Error('所有 ' + attemptedCount + ' 个可用配置均调用失败，请检查API配置');
    },
    _logRequest(slot, success, error) {
        var cfg = this._configs[slot];
        if (!cfg) return;
        this._requestLog.push({
            slot: slot,
            model: cfg.model || '?',
            time: Date.now(),
            success: !!success,
            error: error || ''
            });
        if (this._requestLog.length > this._MAX_LOG) {
            this._requestLog = this._requestLog.slice(-this._MAX_LOG);
        }
    // 【优化】防抖保存，避免每次请求都写 localStorage
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(function() { LocalGameAPI.save(); }, 2000);
    },
    _markModelFailed(slot) {
        var cfg = this._configs[slot];
        if (!cfg || !cfg.model) return;
        this._failedModels[cfg.model] = Date.now();
        this.save();
    },
    isModelFailed(modelName) {
        if (!modelName || !this._failedModels[modelName]) return false;
        // 24小时过期机制，与注释描述一致
        // 之前是永久生效，导致所有模型一旦失败过一次就永远被跳过
        var failedAt = this._failedModels[modelName];
        var now = Date.now();
        var TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
        if (now - failedAt > TWENTY_FOUR_HOURS) {
            // 已过期，清除失败标记
            delete this._failedModels[modelName];
            this.save();
            return false;
        }
    return true;
    },
    getFailedModels() {
        var result = [];
        for (var m in this._failedModels) {
            result.push({
                model: m,
                failedAt: this._failedModels[m]
                });
        }
    return result.sort(function(a, b) {
        return b.failedAt - a.failedAt;
        });
    },
    getRequestStats(slot) {
        var logs = this._requestLog.filter(function(l) {
            return l.slot === slot;
            });
        var total = logs.length;
        var errors = logs.filter(function(l) {
            return !l.success;
            }).length;
        var cfg = this._configs[slot];
        // 模型数优先用获取模型列表时保存的数量，否则从请求日志中统计
        var modelCount = (cfg && cfg.availableModels) ? cfg.availableModels : 0;
        if (modelCount === 0) {
            var models = {};
            logs.forEach(function(l) {
                models[l.model] = true;
                });
            modelCount = Object.keys(models).length;
        }
    return {
        total: total,
        errors: errors,
        modelCount: modelCount,
        recentLogs: logs.slice(-50).reverse()
        };
    },
    normalizeUrl(baseUrl) {
        return baseUrl.replace(/\/$/, '');
    },
    _proxyUrl: '',
    _networkStatus: 'unknown',
    setProxyUrl(url) {
        this._proxyUrl = (url || '').trim();
        localStorage.setItem('freeScript_proxyUrl', this._proxyUrl);
    },
    getProxyUrl() {
        if (!this._proxyUrl) {
            this._proxyUrl = localStorage.getItem('freeScript_proxyUrl') || '';
        }
        return this._proxyUrl;
    },
    buildApiUrl(baseUrl, path) {
        var proxyUrl = this.getProxyUrl();
        if (proxyUrl) {
            var targetUrl = this.normalizeUrl(baseUrl) + path;
            return proxyUrl + '?target=' + encodeURIComponent(targetUrl);
        }
        return this.normalizeUrl(baseUrl) + path;
    },
    async checkConnectivity(baseUrl) {
        var testUrl = this.buildApiUrl(baseUrl, '/models');
        var cfg = this.getCurrentConfig();
        var headers = { 'Content-Type': 'application/json' };
        if (cfg && cfg.apiKey) headers['Authorization'] = 'Bearer ' + cfg.apiKey;
        try {
            var controller = new AbortController();
            var timeoutId = setTimeout(function() { controller.abort(); }, 8000);
            var res = await fetch(testUrl, { method: 'GET', headers: headers, signal: controller.signal });
            clearTimeout(timeoutId);
            this._networkStatus = res.ok ? 'connected' : 'error';
            return { ok: res.ok, status: res.status, message: res.ok ? '连接正常' : 'HTTP ' + res.status };
        } catch (e) {
            this._networkStatus = 'disconnected';
            var msg = '';
            if (e.name === 'AbortError') msg = '连接超时（8秒无响应）';
            else if (e.message.includes('Failed to fetch')) msg = '网络不可达（DNS解析失败或被阻断）';
            else msg = e.message;
            return { ok: false, status: 0, message: msg };
        }
    },
    getNetworkStatus() {
        return this._networkStatus;
    },
    async fetchModels(baseUrl, apiKey) {
        if (!baseUrl) return [];
        try {
            const url = this.buildApiUrl(baseUrl, '/models');
            const res = await fetch(url, {
                headers: {
                    'Authorization': 'Bearer ' + apiKey
                }
            });
            if (res.ok) {
                const data = await res.json();
                return (data.data || []).map(m => m.id).sort();
                } else {
                throw new Error(translateError('HTTP错误: ' + res.status));
            }
        } catch (e) {
        throw new Error('无法获取模型列表。建议：手动输入模型名称');
    }
    },
    async testConnection(config, signal) {
        if (!config.baseUrl || !config.apiKey) return {
            success: false,
            message: '请填写完整配置'
            };
        try {
            const url = this.normalizeUrl(config.baseUrl) + '/chat/completions';
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + config.apiKey
                },
            body: JSON.stringify({
                model: config.model || 'gpt-3.5-turbo',
                messages: [{
                    role: 'user',
                    content: 'Hi'
                    }],
                max_tokens: 5
                }),
            signal: signal || null
            });
            if (res.ok) return {
                success: true,
                message: '连接成功'
                };
            else {
                const err = await res.json().catch(() => ({}));
                return {
                    success: false,
                    message: translateError((err.error && err.error.message) || '') || 'HTTP ' + res.status
                    };
            }
        } catch (e) {
        return {
            success: false,
            message: translateError(e.message)
            };
    }
    }
};
// ========================================
// IndexedDB 存档层（带 localStorage fallback）
// ========================================
var SaveDB = {
    DB_NAME: 'BunnyGameDB',
    DB_VERSION: 1,
    STORE_NAME: 'saves',
    _db: null,
    _ready: false,
    _useFallback: false,
    async init() {
        if (this._ready) return;
        try {
            this._db = await new Promise((resolve, reject) => {
                const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
                // 添加超时保护，防止 IndexedDB 在某些环境中永远不响应
                var timeoutId = TimerManager.setTimeout('idbOpenTimeout', function() {
                    reject(new Error('IndexedDB open timeout'));
                    }, 3000);
                req.onupgradeneeded = function(e) {
                    var db = e.target.result;
                    if (!db.objectStoreNames.contains('saves')) {
                        db.createObjectStore('saves');
                    }
                };
            req.onsuccess = function(e) {
                TimerManager.clearTimeout('idbOpenTimeout');
                resolve(e.target.result);
                };
            req.onerror = function(e) {
                TimerManager.clearTimeout('idbOpenTimeout');
                reject(e.target.error);
                };
            });
            this._ready = true;
            console.log('✅ IndexedDB 就绪');
            } catch (e) {
            console.warn('⚠️ IndexedDB 不可用，回退 localStorage:', e);
            this._useFallback = true;
            this._ready = true;
        }
    },
    async get(slot) {
        await this.init();
        // 优先检查fallback模式
        if (this._useFallback) return this._lsGetAll()[slot] || null;
        try {
            return await new Promise(function(resolve) {
                var tx = SaveDB._db.transaction('saves', 'readonly');
                var req = tx.objectStore('saves').get('slot_' + slot);
                req.onsuccess = function() {
                    resolve(req.result || null);
                    };
                req.onerror = function() {
                    resolve(null);
                    };
                });
            } catch (e) {
            console.warn('IDB get失败，切换到fallback模式:', e);
            // 失败后永久切换到fallback模式
            this._useFallback = true;
            return this._lsGetAll()[slot] || null;
            }
    },
    async getAll() {
        await this.init();
        // 优先检查fallback模式
        if (this._useFallback) return this._lsGetAll();
        try {
            return await new Promise(function(resolve) {
                var tx = SaveDB._db.transaction('saves', 'readonly');
                var store = tx.objectStore('saves');
                var result = {};
                var req = store.openCursor();
                req.onsuccess = function(e) {
                    var cursor = e.target.result;
                    if (cursor) {
                        var key = cursor.key;
                        if (typeof key === 'string' && key.startsWith('slot_')) {
                            var slotNum = parseInt(key.replace('slot_', ''));
                            if (!isNaN(slotNum)) result[slotNum] = cursor.value;
                        }
                    cursor.continue();
                    } else {
                    resolve(result);
                }
            };
            req.onerror = function() {
                resolve(SaveDB._lsGetAll());
                };
            });
        } catch (e) {
        console.warn('IDB getAll失败，切换到fallback模式:', e);
        // 失败后永久切换到fallback模式
        this._useFallback = true;
        return this._lsGetAll();
    }
    },
    async set(slot, data) {
        await this.init();
        // 优先检查fallback模式
        if (this._useFallback) {
            this._lsSet(slot, data);
            return;
        }
    try {
        await new Promise(function(resolve, reject) {
            var tx = SaveDB._db.transaction('saves', 'readwrite');
            var store = tx.objectStore('saves');
            if (data === null || data === undefined) {
                store.delete('slot_' + slot);
                } else {
                store.put(data, 'slot_' + slot);
            }
        tx.oncomplete = resolve;
        tx.onerror = function() {
            reject(tx.error);
            };
        });
        } catch (e) {
        console.warn('IDB写入失败，切换到fallback模式:', e);
        // 失败后永久切换到fallback模式
        this._useFallback = true;
        this._lsSet(slot, data);
    }
    },
    // 启动时自动迁移：localStorage → IndexedDB
    async migrate() {
        await this.init();
        if (this._useFallback) return;
        // fallback模式不需要迁移
        if (localStorage.getItem('_idb_migrated')) return;
        // 已迁移过
        var migrated = 0;
        // 迁移 freeScript_localSaves（新格式）
        try {
            var raw = localStorage.getItem('freeScript_localSaves');
            if (raw) {
                var saves = JSON.parse(raw);
                for (var slot in saves) {
                    if (saves.hasOwnProperty(slot) && saves[slot]) {
                        await this.set(parseInt(slot), saves[slot]);
                        migrated++;
                    }
            }
        }
    } catch (e) {}
    safeSetItem('_idb_migrated', '1');
    },
    // ── localStorage fallback 方法 ──
    _lsGetAll() {
        try {
            return JSON.parse(localStorage.getItem('freeScript_localSaves') || '{}');
            } catch (e) {
            console.error('[SaveManager] 读取localSaves失败:', e);
            return {};
            }
    },
    // 检查数据大小是否安全
    _isDataSizeSafe(data) {
        try {
            var jsonStr = JSON.stringify(data);
            var sizeKB = jsonStr.length / 1024;
            // 警告阈值：4MB（localStorage限制约5MB）
            if (sizeKB > 4096) {
                console.warn('⚠️ 存档数据较大:', sizeKB.toFixed(1), 'KB');
                return false;
            }
            return true;
            } catch (e) {
            return false;
        }
    },
    _lsSet(slot, data) {
        try {
            var saves = this._lsGetAll();
            if (data === null) delete saves[slot];
            else saves[slot] = data;
            var jsonStr = JSON.stringify(saves);
            // 检查容量
            if (jsonStr.length > 4.5 * 1024 * 1024) {
                try { localStorage.removeItem('__autoSaveBackup'); } catch (e) {}
            }
            safeSetItem('freeScript_localSaves', jsonStr);
            } catch (e) {
            // 尝试清理后重试一次
            try {
                localStorage.removeItem('__autoSaveBackup');
                localStorage.removeItem('_idb_migrated');
                var saves = this._lsGetAll();
                if (data === null) delete saves[slot];
                else saves[slot] = data;
                safeSetItem('freeScript_localSaves', JSON.stringify(saves));
                } catch (e2) {
                console.error('❌ 清理后仍无法写入，存档可能丢失:', e2);
                // 尝试提示用户
                if (typeof UI !== 'undefined' && UI.toast) {
                    UI.toast('存储空间不足，请导出存档后清理');
                }
            }
    }
    }
};
// ========================================
// 题 材 库 数 据
// 未来加题材只需往数组里push对象即可
// ========================================
const THEME_LIBRARY = [
    // ---- 修仙玄幻 ----
    {
        category: '修仙玄幻',
        icon: '武',
        title: '废材逆袭·退婚流',
        desc: '被退婚的废材，意外获得系统金手指，一路逆袭打脸',
        prompt: '我想玩修仙养成，被退婚的废材，开局有系统金手指',
        tags: ['系统', '逆袭', '爽文'],
        hot: true
    }, {
    category: '修仙玄幻',
    icon: '',
    title: '宗门小弟·卧薪尝胆',
    desc: '宗门外门弟子，天赋平庸但意志坚定，苦修成圣',
    prompt: '我想玩修仙游戏，我是一个天赋平庸的外门弟子，没有金手指，靠毅力和智谋一步步成长',
    tags: ['慢热', '硬核', '成长']
}, {
category: '修仙玄幻',
icon: '',
title: '妖族觉醒·化形之路',
desc: '你是一只修炼千年的妖兽，刚刚化为人形混入人界',
prompt: '我想玩修仙游戏，我是一只刚化形的妖狐，混入人类修仙宗门，要隐藏身份修炼',
tags: ['妖族', '隐藏身份', '剧情']
},
// ---- 宫斗权谋 ----
{
    category: '宫斗权谋',
    icon: '',
    title: '小答应·宫斗求生',
    desc: '刚入宫的小答应，目标活到最后成为皇后',
    prompt: '我想玩宫斗模拟器，刚入宫的小答应，目标成为皇后',
    tags: ['策略', '权谋', '后宫'],
    hot: true
}, {
category: '宫斗权谋',
icon: '',
title: '权臣之路·朝堂风云',
desc: '落魄世家子弟入朝为官，在各派势力中周旋上位',
prompt: '我想玩朝堂权谋游戏，我是落魄世家子弟刚中进士入朝为官，要在各派系斗争中往上爬',
tags: ['权谋', '朝堂', '烧脑']
},
// ---- 末日生存 ----
{
    category: '末日生存',
    icon: '',
    title: '丧尸围城·便利店开局',
    desc: '在便利店醒来，外面全是丧尸，你能活几天？',
    prompt: '我想玩末日生存，在便利店醒来，外面全是丧尸',
    tags: ['生存', '硬核', '恐怖'],
    hot: true
}, {
category: '末日生存',
icon: '',
title: '核冬天·地堡求生',
desc: '核战后的地下掩体，资源有限，外面辐射致命',
prompt: '我想玩末日生存，核战后我在一个地下掩体里醒来，物资只够7天，需要决定是守还是出去探索',
tags: ['资源管理', '抉择', '废土']
},
// ---- 娱乐圈 ----
{
    category: '娱乐圈',
    icon: '💃',
    title: '女团选秀·逆风翻盘',
    desc: '被公司雪藏的练习生，想靠实力在选秀中翻红',
    prompt: '我想玩女团选秀，被公司雪藏的练习生，想靠实力翻红',
    tags: ['选秀', '热血', '成长']
}, {
category: '娱乐圈',
icon: '🎤',
title: '黑红艺人·洗白上位',
desc: '十八线黑红艺人，满身黑料但有实力，想洗白',
prompt: '我想玩娱乐圈，十八线黑红艺人，想洗白上位',
tags: ['策略', '舆论', '翻身'],
hot: true
}, {
category: '娱乐圈',
icon: '',
title: '天才编剧·影视江湖',
desc: '有才华的小编剧，被大导演看中卷入影视圈纷争',
prompt: '我想玩娱乐圈游戏，我是一个有才华的小编剧，写的剧本被大导演看中，卷入影视圈的各种纷争',
tags: ['剧情', '创作', '职场']
},
// ---- 无限流 ----
{
    category: '无限流',
    icon: '',
    title: '恐怖副本·智商求生',
    desc: '被拉进诡异副本，要靠智商和勇气活下来',
    prompt: '我想玩无限流，被拉进恐怖副本，要靠智商活下来',
    tags: ['推理', '恐怖', '烧脑'],
    hot: true
}, {
category: '无限流',
icon: '',
title: '规则怪谈·诡异医院',
desc: '你在一家医院醒来，墙上贴满了奇怪的规则',
prompt: '我想玩规则怪谈游戏，我在一家诡异医院醒来，到处贴着奇怪的规则，违反规则就会死',
tags: ['怪谈', '规则', '解谜']
},
// ---- 校园青春 ----
{
    category: '校园青春',
    icon: '',
    title: '转校生·社团物语',
    desc: '高二转学到新学校，加入了一个快要废部的社团',
    prompt: '我想玩校园青春游戏，高二转学生，加入了一个只剩3人快被废部的社团，要在文化祭前拯救社团',
    tags: ['青春', '日常', '热血']
}, {
category: '校园青春',
icon: '',
title: '高三冲刺·命运分岔',
desc: '高三最后一年，学习、友情、暗恋交织的日常',
prompt: '我想玩校园游戏，高三学生，成绩中等偏上，暗恋同桌，好朋友要出国，在学业和感情中做选择',
tags: ['青春', '恋爱', '日常']
},
// ---- 商战职场 ----
{
    category: '商战职场',
    icon: '',
    title: '创业维艰·车库起步',
    desc: '互联网创业者，从车库开始，挑战行业巨头',
    prompt: '我想玩创业模拟游戏，我是一个刚辞职的程序员，有一个颠覆性的产品idea，从车库开始创业',
    tags: ['商战', '创业', '策略']
}, {
category: '商战职场',
icon: '🏢',
title: '办公室政治·升职之路',
desc: '一个大公司新人，在复杂的办公室关系中生存升职',
prompt: '我想玩职场游戏，我是刚入职大公司的新人，部门里派系复杂，要在各种办公室政治中升职',
tags: ['职场', '策略', '现实']
},
// ---- 历史架空 ----
{
    category: '历史架空',
    icon: '',
    title: '三国谋士·乱世生存',
    desc: '穿越到三国时代，作为无名谋士开始乱世求生',
    prompt: '我想玩三国游戏，我穿越成了一个无名谋士，开局在一个小县城，天下即将大乱',
    tags: ['三国', '策略', '穿越']
},
// ---- 奇幻冒险 ----
{
    category: '奇幻冒险',
    icon: '',
    title: '魔法学院·新生入学',
    desc: '收到魔法学院的录取通知书，开始奇幻校园生活',
    prompt: '我想玩西方奇幻游戏，我是一个刚被魔法学院录取的平民新生，没有显赫家世，要靠自己在学院里站稳脚跟',
    tags: ['魔法', '学院', '冒险']
},
// ---- 悬疑推理 ----
{
    category: '悬疑推理',
    icon: '侦',
    title: '连环案件·新手侦探',
    desc: '小镇发生离奇连环失踪案，你是唯一的侦探',
    prompt: '我想玩悬疑推理游戏，我是一个小镇上的新手私人侦探，镇上发生了连环失踪案，警察毫无头绪',
    tags: ['推理', '悬疑', '剧情'],
    hot: true
},
// ---- 恋爱模拟 ----
{
    category: '恋爱模拟',
    icon: '',
    title: '合租奇缘·都市爱情',
    desc: '因为租房意外和陌生人合租，都市爱情故事开始',
    prompt: '我想玩恋爱模拟游戏，因为租房出了问题不得不和一个陌生人合租，对方性格很难相处但其实外冷内热',
    tags: ['恋爱', '日常', '甜文']
},
];
// ========================================
// 全局状态
// ========================================
// 游戏版本号，用于存档兼容性检查
const GAME_VERSION = '1.2.0';

// gameState工厂函数，确保初始化和重置时字段一致
function createDefaultGameState() {
    return {
        _version: GAME_VERSION,
        userPrompt: '',
        customStyle: '',
        systemPrompt: '',
        conversationHistory: [],
        allCharacters: {},
        temperature: 0.8,
        fontSize: 16,
        pinnedModules: {},
        rollingSummary: '',
        autoCompress: true,
        tokenCount: 0,
        maxTokens: 80000,
        useStream: true,
        streamFailCount: 0,
        generateChoices: true,
        keyEvents: [],
        worldSnapshot: {},
        currentQuests: [],
        relationships: [],
        currentBag: [],
        playerData: null,
        favStories: [],
        generatedNovel: '',
        protagonistSetup: {},
        _jailbreakPrompt: '',
        _assistantPrompt: '',
        gameTime: {
            date: '', time: '', period: '', weather: '', era: ''
        },
    _presetApps: {},
    _stats: {
        startTime: Date.now(),
        totalTurns: 0,
        totalTokens: 0,
        maxTokensInTurn: 0,
        totalCharacters: 0,
        completedQuests: 0,
        totalPlayTime: 0
    },
_undoHistory: [],
_MAX_UNDO_HISTORY: 50,
wordCountConfig: {
    enabled: true,
    min: 1500,
    max: 3000,
    paragraphMin: 15,
    paragraphMax: 17,
    paragraphStyle: 'medium',
    lengthPreset: 'medium'
},
_theaterContent: {},
_worldModules: [],
_chatLogs: {},
_chattedNpcs: {},
_chatLogs: {},
_lastAIReply: null,
_depthPrompts: {},
_positionPrompts: {},
_afterChatPrompts: [],
_wiCachedResult: null,
_moments: [],
_npcDiaries: {},
_mail: [],
_diary: []
};
}

var gameState = createDefaultGameState();

var streamBuffer = '';
var isWaiting = false;
// ======= 打字机缓冲系统 v3（性能优化版） =======
// 优化：requestAnimationFrame 渲染节流、索引式队列、标点智能停顿、脏检查
var TypewriterBuffer = {
    _queue: '',
    _queueIdx: 0,
    displayed: '',
    isTyping: false,
    timer: null,
    baseSpeed: 25,
    onComplete: null,
    _visibilityHandler: null,
    _completedParagraphs: [],
    _currentParaChars: '',
    _lastRendered: '',
    _forceFullRender: false,
    _rafPending: false,
    // 标点停顿映射（字符 → 额外等待ms）
    _pauseMap: {
        '\u3002': 120, '\uff01': 120, '\uff1f': 120, '\u2026': 80,
        '\uff1b': 80, '\uff1a': 60,
        '\uff0c': 50, '\u3001': 40,
        '\u300c': 30, '\u300d': 40, '\u300b': 40,
        '\n': 60
    },

    // 队列剩余长度（避免重复创建子字符串）
    get queueLen() { return this._queue.length - this._queueIdx; },

    push(newText) {
        if (!newText) return;
        if (typeof this._queue !== 'string') this._queue = '';
        if (typeof this.displayed !== 'string') this.displayed = '';
        if (newText.length > this.displayed.length + this.queueLen) {
            // 新文本更长，追加增量部分
            var newPart = newText.substring(this.displayed.length + this.queueLen);
            this._queue += newPart;
        } else {
            // 重建队列（仅在此情况下需要拷贝）
            this._queue = newText.substring(this.displayed.length);
            this._queueIdx = 0;
        }
        if (!this.isTyping) this.start();
    },
    start() {
        if (this.isTyping) return;
        this.isTyping = true;
        if (this.displayed.length === 0) {
            this._completedParagraphs = [];
            this._currentParaChars = '';
        }
        this._forceFullRender = true;
        const self = this;
        TimerManager.setInterval('typewriter', function() {
            if (self.queueLen === 0) {
                self.pause();
                if (self._currentParaChars) {
                    self._completedParagraphs.push(self._currentParaChars);
                    self._currentParaChars = '';
                }
                self._scheduleRender();
                if (self.onComplete) {
                    self.onComplete();
                    self.onComplete = null;
                }
                return;
            }
            var ch = self._queue[self._queueIdx];
            self._queueIdx++;
            self.displayed += ch;

            // 段落分割：遇到换行且当前段落有内容时，完成当前段落
            if (ch === '\n' && self._currentParaChars.length > 0) {
                self._completedParagraphs.push(self._currentParaChars);
                self._currentParaChars = '';
                self._scheduleRender();
            } else {
                self._currentParaChars += ch;
                self._scheduleRender();
            }

            // 定期清理已消费的队列前缀，防止字符串无限增长
            if (self._queueIdx > 512) {
                self._queue = self._queue.substring(self._queueIdx);
                self._queueIdx = 0;
            }

            // 标点智能停顿
            var pause = self._pauseMap[ch];
            if (pause) {
                self.pause();
                self._pauseTimer = TimerManager.setTimeout('typewriterPause', function() {
                    self._pauseTimer = null;
                    if (self.queueLen > 0 || self._currentParaChars.length > 0) {
                        self.start();
                    } else {
                        self.pause();
                        if (self._currentParaChars) {
                            self._completedParagraphs.push(self._currentParaChars);
                            self._currentParaChars = '';
                        }
                        self._scheduleRender();
                        if (self.onComplete) {
                            self.onComplete();
                            self.onComplete = null;
                        }
                    }
                }, pause);
            }
        }, this.baseSpeed);
        if (!this._visibilityHandler) {
            this._visibilityHandler = function() {
                if (document.hidden && self.isTyping) self.pause();
            };
            GlobalCleanup.registerListener(document, 'visibilitychange', this._visibilityHandler);
        }
    },
    pause() {
        this.isTyping = false;
        TimerManager.clearInterval('typewriter');
    },
    stop() {
        if (this._pauseTimer) { TimerManager.clearTimeout('typewriterPause'); this._pauseTimer = null; }
        this.pause();
        this._queue = '';
        this._queueIdx = 0;
        this.displayed = '';
        this._lastRendered = '';
        this._forceFullRender = true;
        this._rafPending = false;
        this.onComplete = null;
    },
    destroy() {
        this.stop();
        if (this._visibilityHandler) {
            document.removeEventListener('visibilitychange', this._visibilityHandler);
            this._visibilityHandler = null;
        }
    },
    flush() {
        if (typeof this._queue !== 'string') this._queue = '';
        if (typeof this.displayed !== 'string') this.displayed = '';
        // 一次性消费所有剩余队列
        this.displayed += this._queue.substring(this._queueIdx);
        this._queue = '';
        this._queueIdx = 0;
        this.pause();
        this.render();
        if (this.onComplete) {
            this.onComplete();
            this.onComplete = null;
        }
    },
    isFinished() {
        if (typeof this._queue !== 'string') this._queue = '';
        return this.queueLen === 0 && !this.isTyping;
    },
    // 使用 requestAnimationFrame 节流渲染，避免每字符都触发 DOM 重绘
    _scheduleRender() {
        if (this._rafPending) return;
        this._rafPending = true;
        var self = this;
        requestAnimationFrame(function() {
            self._rafPending = false;
            self.render();
        });
    },
    render() {
        var storyEl = DOMCache.get('storyText', true) || document.getElementById('storyText');
        if (!storyEl) return;
        var allText = this._completedParagraphs.join('\n') + (this._completedParagraphs.length > 0 ? '\n' : '') + this._currentParaChars;
        // 脏检查：内容未变化则跳过重绘
        if (allText === this._lastRendered) return;
        this._lastRendered = allText;
        storyEl.innerHTML = formatStory(allText);
    },
    _renderCached() {
        this._scheduleRender();
    },
    _renderCurrentPara() {
        this._scheduleRender();
    }
};
const MAX_HISTORY = 20;

// ========================================
// Token 计数 + 自动压缩
// ========================================
let isCompressing = false;
let lastCompressTime = 0;
const npcChatState = {
    npcName: '',
    chatHistory: [],
    // [{role:'player'|'npc', text:'...'}]
    isSending: false,
    // 【修复R1】NPC聊天使用独立的AbortController，避免与主游戏共享导致竞态条件
    abortController: null
};
// ========================================
// NPC编辑 & 手动添加
// ========================================
let npcEditingName = '';
// 空=新增模式，有值=编辑模式
// --- 打字机光标颜色适配 ---

// ========================================
// 第1层: 工具函数
// ========================================
// 自动提取所有分类
function isScrollNearBottom(el) {
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}

// ========================================
// 游戏内时间系统（AI动态生成）
// ========================================
var GameTimeSystem = {
    // 从AI回复的JSON中解析时间字段并更新gameTime
    parseFromAI(data) {
        if (!data) return;
        if (!gameState.gameTime) {
            gameState.gameTime = { date: '', time: '', period: '', weather: '', era: '' };
        }
    var gt = gameState.gameTime;
    // AI在JSON中返回 gameTime 字段
    if (data.gameTime) {
        if (data.gameTime.date) gt.date = data.gameTime.date;
        if (data.gameTime.time) gt.time = data.gameTime.time;
        if (data.gameTime.period) gt.period = data.gameTime.period;
        if (data.gameTime.weather) gt.weather = data.gameTime.weather;
        if (data.gameTime.era) gt.era = data.gameTime.era;
    }
    },

    // 格式化时间显示（用于UI）
    formatTime() {
        var gt = gameState.gameTime;
        if (!gt) return '';
        var parts = [];
        if (gt.date) parts.push(gt.date);
        if (gt.time) parts.push(gt.time);
        else if (gt.period) parts.push(gt.period);
        return parts.join(' ');
    },

    // 格式化短标题（用于标题栏）
    formatShort() {
        var gt = gameState.gameTime;
        if (!gt) return '';
        var parts = [];
        if (gt.date) parts.push(gt.date);
        if (gt.period) parts.push(gt.period);
        return parts.join(' · ');
    },

    // 更新UI显示
    updateUI() {
        var timeEl = document.getElementById('gameTimeText');
        if (timeEl) {
            var formatted = this.formatTime();
            // 如果没有时间数据，显示默认文本
            timeEl.textContent = formatted || '--';
        }
    // 标题栏显示章节标题，不显示时间（时间已经在顶部显示）
    // var titleTimeEl = document.getElementById('storySceneTitle');
    // if (titleTimeEl) {
        //     var short = this.formatShort();
        //     if (short) {
            //         titleTimeEl.textContent = short;
            //     }
        // }
    }
};

// ========================================
// 超强JSON容错解析系统（状态机）
// ========================================
// 通用括号匹配状态机
function _findMatching(str, startChar, endChar, startIdx) {
    let depth = 0, inS = false, esc = false;
    for (let i = startIdx; i < str.length; i++) {
        const c = str[i];
        if (esc) { esc = false; continue; }
        if (c === '\\') { esc = true; continue; }
        if (c === '"') inS = !inS;
        if (inS) continue;
        if (c === startChar) depth++;
        if (c === endChar) { depth--; if (depth === 0) return i; }
    }
return -1;
}
function safeJSONParse(str) {
    if (!str || typeof str !== 'string') return null;
    try {
        let s = str.trim();
        if (s.startsWith('```')) s = s.replace(/^```json\s*/i, '').replace(/^```/, '').trim();
        if (s.endsWith('```')) s = s.slice(0, -3).trim();
        const tryP = t => {
            try {
                return JSON.parse(t);
            } catch {
            return null;
        }
};
let r = tryP(s);
if (r) return r;
// 状态机找第一个完整 {}
const fb = s.indexOf('{');
    if (fb !== -1) {
        const end = _findMatching(s, '{', '}', fb);
        if (end !== -1) {
            r = tryP(s.slice(fb, end + 1));
            if (r) return r
        }
}
// 修复常见错误
let fx = s.replace(/[\u0000-\u001F]+/g, ' ').replace(/,(\s*[}\]])/g, '$1').replace(/,+/g, ',');
r = tryP(fx);
if (r) return r;
const js = s.indexOf('{'),
    je = s.lastIndexOf('}');
if (js !== -1 && je > js) {
    r = tryP(s.slice(js, je + 1).replace(/,(\s*[}\]])/g, '$1'));
if (r) return r
}
return null;
} catch {
return null;
}
}
// 状态机提取字符串字段
// PNG角色卡解析工具 - 从PNG文件的tEXt chunk中提取chara数据
function extractCharaData(arrayBuffer) {
    try {
        var data = new Uint8Array(arrayBuffer);
        // 检查PNG签名
        var pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
        for (var i = 0; i < 8; i++) {
            if (data[i] !== pngSignature[i]) return null;
        }
    // 遍历PNG chunks
    var offset = 8;
    while (offset < data.length) {
        // 读取chunk长度 (4 bytes, big-endian)
        var length = (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
        offset += 4;
        // 读取chunk类型 (4 bytes)
        var type = String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
        offset += 4;
        // 检查是否为tEXt chunk
        if (type === 'tEXt') {
            // 读取keyword (null-terminated)
            var keywordEnd = offset;
            while (keywordEnd < offset + length && data[keywordEnd] !== 0) keywordEnd++;
            var keyword = String.fromCharCode.apply(null, data.slice(offset, keywordEnd));
            // 检查是否为chara关键字
            if (keyword === 'chara') {
                // 读取text数据 (keyword之后，null之后)
                var textStart = keywordEnd + 1;
                var textData = data.slice(textStart, offset + length);
                // 解码base64
                var base64 = '';
                for (var j = 0; j < textData.length; j++) {
                    base64 += String.fromCharCode(textData[j]);
                }
            var decoded = atob(base64);
            var jsonStr = '';
            for (var k = 0; k < decoded.length; k++) {
                jsonStr += String.fromCharCode(decoded.charCodeAt(k));
            }
        return JSON.parse(jsonStr);
    }
}
// 跳到下一个chunk (length + 4 bytes CRC)
offset += length + 4;
// 如果是IEND chunk，停止
if (type === 'IEND') break;
}
return null;
} catch (e) {
console.warn('解析PNG角色卡失败:', e);
return null;
}
}

function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function extractStr(text, field) {
    const m = text.match(new RegExp(`"${escapeRegExp(field)}"\\s*:\\s*"`));
    if (!m) return null;
    let r = '',
    esc = false;
    for (let i = m.index + m[0].length; i < text.length; i++) {
        const c = text[i];
        if (esc) {
            switch (c) {
                case 'n':
                r += '\n';
                break;
                case '"':
                r += '"';
                break;
                case '\\':
                r += '\\';
                break;
                default:
                r += c
            }
        esc = false
    } else if (c === '\\') esc = true;
else if (c === '"') return r;
else r += c;
}
return r.length > 0 ? r : null;
}
// 状态机提取数组
function extractArr(text, field) {
    const m = text.match(new RegExp(`"${escapeRegExp(field)}"\\s*:\\s*\\[`));
        if (!m) return null;
        let i = m.index + m[0].length,
        items = [],
        inS = false,
        esc = false,
        cur = '';
        while (i < text.length) {
            const c = text[i];
            if (esc) {
                switch (c) {
                    case 'n':
                    cur += '\n';
                    break;
                    case '"':
                    cur += '"';
                    break;
                    default:
                    cur += c
                }
            esc = false;
            i++;
            continue
        }
    if (c === '\\' && inS) {
        esc = true;
        i++;
        continue
    }
if (c === '"') {
    if (!inS) {
        inS = true;
        cur = ''
    } else {
    inS = false;
    items.push(cur);
    cur = ''
}
i++;
continue
}
if (!inS && c === ']') break;
if (inS) cur += c;
i++;
}
if (inS && cur.length > 0) items.push(cur);
return items.length > 0 ? items : null;
}
// 状态机提取对象
function extractObj(text, field) {
    const m = text.match(new RegExp(`"${escapeRegExp(field)}"\\s*:\\s*\\{`));
        if (!m) return null;
        const start = m.index + m[0].length - 1;
        const end = _findMatching(text, '{', '}', start);
        if (end !== -1) {
            try {
                return JSON.parse(text.slice(start, end + 1))
            } catch {}
    }
// 手动提取
const partial = text.slice(start);
const obj = {};
const fp = /"(\w+)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
let fm;
while ((fm = fp.exec(partial)) !== null) obj[fm[1]] = fm[2].replace(/\\n/g, '\n').replace(/\\"/g, '"');
return Object.keys(obj).length > 0 ? obj : null;
}
// 状态机提取对象数组
function extractObjArr(text, field) {
    const m = text.match(new RegExp(`"${escapeRegExp(field)}"\\s*:\\s*\\[`));
        if (!m) return null;
        const result = [];
        let i = m.index + m[0].length;
        while (i < text.length) {
            while (i < text.length && text[i] !== '{' && text[i] !== ']') i++;
            if (i >= text.length || text[i] === ']') break;
        const os = i;
        const oe = _findMatching(text, '{', '}', os);
        if (oe !== -1) {
            try {
                result.push(JSON.parse(text.slice(os, oe + 1)))
            } catch {}
        i = oe + 1
    } else break;
}
return result.length > 0 ? result : null;
}
// 强力状态机兜底
function robustParse(raw) {
    if (!raw) return null;
    const r = {};
    let ok = false;
    const story = extractStr(raw, 'story');
    if (story) {
        r.story = story;
        ok = true;
    }
// 提取各字段
const hud = extractObjArr(raw, 'hud');
if (hud) r.hud = hud;
const choices = extractObjArr(raw, 'choices');
if (choices) r.choices = choices;
const player = extractObj(raw, 'player');
if (player) {
    r.player = player;
    if (!r.player.stats) r.player.stats = extractObjArr(raw, 'stats') || [];
}
const chars = extractObjArr(raw, 'characters');
if (chars) r.characters = chars;
const world = extractObjArr(raw, 'world');
if (world) r.world = world;
const bag = extractObjArr(raw, 'bag');
if (bag) r.bag = bag;
// story从JSON外面提取
if (Object.keys(r).length > 0) ok = true;
return ok ? r : null;
}
// 主解析函数
function parseAIResponse(reply) {
    let data = null;
    let storyText = '';
    // 1. 先尝试直接解析纯JSON（新格式）
    data = safeJSONParse(reply);
    // 2. 如果失败，兼容旧的```json格式
    if (!data) {
        const jsonMatch = reply.match(/```json\n?([\s\S]*?)\n?```/);
        if (jsonMatch) {
            data = safeJSONParse(jsonMatch[1]);
        }
}
// 3. 状态机兜底
if (!data) {
    data = robustParse(reply);
}
// 4. 提取剧情文本
if (data && data.story) {
    // 新格式：story在JSON里
    storyText = data.story;
} else {
// 先用状态机提取story
storyText = extractStr(reply, 'story') || '';
// 如果还没有，尝试从JSON中提取story字段值
if (!storyText) {
    var storyMatch = reply.match(/"story"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
    if (storyMatch) {
        storyText = storyMatch[1].replace(/\\n/g, '\n');
    }
}
// 最后兜底：去掉JSON代码块，保留纯文本
if (!storyText) {
    storyText = reply.replace(/```json[\s\S]*?```/g, '').replace(/```[\s\S]*?```/g, '').trim();
}
// 如果还是空，直接用原始回复
if (!storyText) {
    storyText = reply;
}
}
// 【修复】兜底：如果storyText仍然为空，但reply有内容，
// 说明是纯文本小说预设（非JSON格式），直接使用原文
if (!storyText || storyText.trim() === '') {
    if (reply && reply.trim()) {
        var cleanedReply = reply
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
        .replace(/<ECoT>[\s\S]*?<\/ECoT>/gi, '')
        .replace(/💭[\s\S]*?💭/g, '')
        .trim();
        if (cleanedReply) {
            storyText = cleanedReply;
            // 尝试从纯文本中提取可能的JSON数据
            if (!data) {
                try {
                    // 尝试从文本末尾提取JSON块
                    var jsonBlockMatch = cleanedReply.match(/\{[\s\S]*\}/);
                    if (jsonBlockMatch) {
                        var extracted = safeJSONParse(jsonBlockMatch[0]);
                        if (extracted && typeof extracted === 'object') {
                            data = extracted;
                            // 从文本中移除JSON块
                            storyText = cleanedReply.replace(jsonBlockMatch[0], '').trim();
                        }
                }
        } catch(e) {}
}
}
}
}

// 【小剧场融合】提取小剧场内容
var theaterContent = {};
if (typeof MacroEngine !== 'undefined') {
    var theaterVars = MacroEngine.getTheaterContent();
    Object.keys(theaterVars).forEach(function(key) {
        var val = theaterVars[key];
        if (val && val.trim()) {
            var parsed = MacroEngine.parseTheaterContent(val);
            if (parsed && parsed.type !== 'unknown') {
                theaterContent[key] = parsed;
            }
    }
});
}

// 将提取到的小剧场内容存储到 gameState
if (Object.keys(theaterContent).length > 0) {
    if (!gameState._theaterContent) gameState._theaterContent = {};
    Object.assign(gameState._theaterContent, theaterContent);
    console.log('[小剧场融合] 提取到', Object.keys(theaterContent).length, '个小剧场');

    // 根据小剧场类型注入到对应的日志功能
    injectTheaterToLogs(theaterContent);

    // 【深度融合】将预设<branches>选项桥接到游戏原生选项系统
    _bridgeBranchesToChoices(theaterContent);
}

return {
    data,
    storyText
};
}

// 【小剧场融合】将小剧场内容注入到日志功能
function injectTheaterToLogs(theaterContent) {
    if (!theaterContent || Object.keys(theaterContent).length === 0) return;

    // 确保 _worldModules 存在
    if (!Array.isArray(gameState._worldModules)) gameState._worldModules = [];

    Object.keys(theaterContent).forEach(function(key) {
        var theater = theaterContent[key];
        var targetModule = null;

        // 根据小剧场类型映射到对应的日志功能
        switch (key) {
            // 论坛类 -> 论坛
            case '论坛之愿':
            case '论坛小剧场':
            case '文艺盲盒小剧场':
            case 'gossip':
            case '八卦':
            case '论坛':
            targetModule = { type: 'comments', title: theater.title || '论坛', items: parseForumContent(theater.html || theater.content) };
            // 如果有结构化数据，使用它
            if (theater.data && theater.data.posts) {
                targetModule.items = theater.data.posts;
            }
        break;

        // 群聊类 -> 聊天记录
        case '群聊之愿':
        targetModule = { type: 'chat', npc: '群聊', messages: parseChatContent(theater.html || theater.content) };
        injectToChatLog('群聊', theater);
        break;

        // 日程类 -> 新增日程模块
        case '日程之愿':
        case '日程表':
        targetModule = { type: 'calendar', title: '日程表', events: parseCalendarContent(theater.html || theater.content) };
        break;

        // 通知类 -> 邮件
        case '通知之愿':
        targetModule = { type: 'mail', title: '系统通知', mails: parseMailContent(theater.html || theater.content) };
        break;

        // 购物类 -> 商店
        case '购物之愿':
        targetModule = { type: 'shop', title: '商店', goods: parseShopContent(theater.html || theater.content) };
        break;

        // 朋友圈/日常 -> 朋友圈
        case '每日之愿':
        case '日常剧场':
        case '盲盒之愿':
        targetModule = { type: 'moments', moments: parseMomentsContent(theater.html || theater.content) };
        break;

        // 桌面/盲盒 -> 物品
        case '桌面之愿':
        targetModule = { type: 'cards', title: '物品', items: parseItemsContent(theater.html || theater.content) };
        break;

        // 日记类 -> 日记
        case '后台人生':
        targetModule = { type: 'diary', npc: '后台', entries: parseDiaryContent(theater.html || theater.content) };
        break;

        // 作话 -> 新增作话模块
        case '蛾摩拉':
        targetModule = { type: 'author_note', title: '作者有话说', content: theater.content };
        break;

        // 【深度融合】状态栏 -> 同时更新游戏NPC系统
        case '小夜单人状态':
        case '通用状态':
        case '古风状态':
        case '状态面板':
        case 'status':
        targetModule = { type: 'status', title: '角色状态', content: theater.html || theater.content };
        // 如果有结构化数据，使用它
        if (theater.data && theater.data.stats) {
            targetModule.stats = theater.data.stats;
            targetModule.ancient = theater.data.ancient || false;
        }
    // 【深度融合】将状态数据桥接到游戏NPC系统
    _bridgeStatusToCharacters(theater);
    break;

    // 档案/报告 -> 世界信息
    case '档案之愿':
    case '报告之愿':
    targetModule = { type: 'text', title: theater.title || key, content: theater.content };
    break;

    // 【新增】手机功能 -> 手机模块
    case '角色手机':
    case '手机':
    case 'phone':
    targetModule = { type: 'phone', title: '手机', content: theater.html || theater.content };
    if (theater.data && theater.data.apps) {
        targetModule.apps = theater.data.apps;
    }
break;

// 【深度融合】摘要 -> 同时注入游戏记忆系统和日志模块
case 'meow_FM':
case '摘要':
case 'summary':
targetModule = { type: 'summary', title: '摘要', content: theater.html || theater.content };
if (theater.data && theater.data.summary) {
    targetModule.summary = theater.data.summary;
}
// 【深度融合】将预设摘要桥接到游戏EnhancedMemory
_bridgeSummaryToMemory(theater);
break;

// 【新增】选项分支 -> 选项模块
case 'branches':
case '选项分支':
case '分支':
targetModule = { type: 'branches', title: '选项', content: theater.html || theater.content };
if (theater.data && theater.data.options) {
    targetModule.options = theater.data.options;
    // 同时更新游戏选项
    if (typeof renderChoices === 'function') {
        renderChoices(theater.data.options);
    }
}
break;

// 【新增】物品 -> 物品模块
case 'echo':
case '物品':
case 'items':
targetModule = { type: 'cards', title: '物品', items: parseItemsContent(theater.html || theater.content) };
if (theater.data && theater.data.items) {
    targetModule.items = theater.data.items;
}
break;

// 【新增】文字剧场 -> 剧场模块
case 'ccd':
case '文字剧场':
case '剧场':
targetModule = { type: 'theater', title: '文字剧场', content: theater.html || theater.content };
if (theater.data) {
    if (theater.data.scenes) {
        targetModule.scenes = theater.data.scenes;
    } else if (theater.data.text) {
    targetModule.text = theater.data.text;
}
}
break;

// 【新增】象牙塔预设 - 塔类小剧场映射
case '恋爱之塔':
case '恋爱小剧场':
case '恋爱之愿':
targetModule = { type: 'theater', title: '恋爱剧场', content: theater.html || theater.content };
break;

case '涩涩之塔':
case '涩涩小剧场':
case '涩涩之愿':
targetModule = { type: 'theater', title: '涩涩剧场', content: theater.html || theater.content };
break;

case '游戏之塔':
case '游戏小剧场':
case '游戏之愿':
targetModule = { type: 'theater', title: '游戏剧场', content: theater.html || theater.content };
break;

case '群聊之塔':
targetModule = { type: 'chat', npc: '群聊', messages: parseChatContent(theater.html || theater.content) };
injectToChatLog('群聊', theater);
break;

case '论坛之塔':
case '八卦之塔':
targetModule = { type: 'comments', title: theater.title || '论坛', items: parseForumContent(theater.html || theater.content) };
if (theater.data && theater.data.posts) {
    targetModule.items = theater.data.posts;
}
break;

case '同人之塔':
case '同人之愿':
targetModule = { type: 'theater', title: '同人剧场', content: theater.html || theater.content };
break;

case '回忆之塔':
case '回忆之愿':
targetModule = { type: 'diary', npc: '回忆', entries: parseDiaryContent(theater.html || theater.content) };
break;

case '平行之塔':
case '平行之愿':
targetModule = { type: 'theater', title: '平行世界', content: theater.html || theater.content };
break;

case '美食之塔':
case '美食之愿':
targetModule = { type: 'theater', title: '美食剧场', content: theater.html || theater.content };
break;

case '广告之塔':
case '广告之愿':
targetModule = { type: 'theater', title: '广告', content: theater.html || theater.content };
break;

case '报告之塔':
case '报告之愿':
targetModule = { type: 'text', title: theater.title || '报告', content: theater.content };
break;

case '每日之塔':
case '文学之塔':
case '文学之愿':
targetModule = { type: 'theater', title: theater.title || '文学', content: theater.html || theater.content };
break;

case '哀伤之塔':
case '哀伤之愿':
targetModule = { type: 'theater', title: '哀伤', content: theater.html || theater.content };
break;

case '幸福之塔':
case '幸福之愿':
targetModule = { type: 'moments', moments: parseMomentsContent(theater.html || theater.content) };
break;

case '盲盒之塔':
targetModule = { type: 'cards', title: '盲盒物品', items: parseItemsContent(theater.html || theater.content) };
break;

// 【新增】其他标签类型映射
case 'ice':
targetModule = { type: 'text', title: 'ice', content: theater.html || theater.content };
break;

case 'live':
targetModule = { type: 'theater', title: '直播', content: theater.html || theater.content };
break;

case 'danmu':
targetModule = { type: 'theater', title: '弹幕', content: theater.html || theater.content };
break;

case 'enigma':
targetModule = { type: 'text', title: '谜题', content: theater.html || theater.content };
break;

case 'podcast':
targetModule = { type: 'theater', title: '播客', content: theater.html || theater.content };
break;

case '作者有话说':
case 'author_note':
targetModule = { type: 'author_note', title: '作者有话说', content: theater.content };
break;

case 'giggle':
case '角色心声':
targetModule = { type: 'text', title: '角色心声', content: theater.content };
break;

case 'novel_header':
targetModule = { type: 'text', title: '章节标题', content: theater.html || theater.content };
break;

case 'profile':
case '角色关系':
targetModule = { type: 'text', title: '角色关系', content: theater.html || theater.content };
// 【深度融合】将角色关系数据桥接到游戏关系系统
_bridgeProfileToRelationships(theater);
break;

case 'horae':
case 'horaeevent':
targetModule = { type: 'text', title: '记忆', content: theater.html || theater.content };
break;

// 其他 -> 世界信息
default:
if (theater.type === 'snow') {
    targetModule = { type: 'text', title: theater.title || key, content: theater.content };
} else if (theater.type === 'gossip') {
targetModule = { type: 'comments', title: theater.title || '论坛', items: theater.data?.posts || [{ author: '小剧场', content: theater.content, time: new Date().toLocaleString() }] };
} else if (theater.type === 'phone') {
targetModule = { type: 'phone', title: '手机', content: theater.html || theater.content, apps: theater.data?.apps || [] };
} else if (theater.type === 'status') {
targetModule = { type: 'status', title: '角色状态', content: theater.html || theater.content, stats: theater.data?.stats || [] };
} else if (theater.type === 'summary') {
targetModule = { type: 'summary', title: '摘要', content: theater.html || theater.content, summary: theater.data?.summary || '' };
} else if (theater.type === 'branches') {
targetModule = { type: 'branches', title: '选项', content: theater.html || theater.content, options: theater.data?.options || [] };
} else if (theater.type === 'echo') {
targetModule = { type: 'cards', title: '物品', items: theater.data?.items || parseItemsContent(theater.html || theater.content) };
} else if (theater.type === 'ccd') {
targetModule = { type: 'theater', title: '文字剧场', content: theater.html || theater.content, scenes: theater.data?.scenes, text: theater.data?.text };
}
}

if (targetModule) {
    // 查找是否已有同类型模块，有则更新，无则添加
    var existingIdx = gameState._worldModules.findIndex(function(m) {
        return m.type === targetModule.type && m.title === targetModule.title;
    });
if (existingIdx >= 0) {
    gameState._worldModules[existingIdx] = targetModule;
} else {
gameState._worldModules.push(targetModule);
}
console.log('[小剧场融合] 已注入', key, '到', targetModule.type);
}
});
}

// 【深度融合】将预设<branches>选项桥接到游戏原生renderChoices系统
// 这样预设的剧情分支选项会直接出现在游戏选项面板中，而不是只在日志页
function _bridgeBranchesToChoices(theaterContent) {
    if (!theaterContent) return;
    var branchesData = theaterContent['branches'] || theaterContent['选项分支'] || theaterContent['分支'];
    if (!branchesData) return;

    // 从解析后的数据中提取选项
    var options = [];
    if (branchesData.data && branchesData.data.options && branchesData.data.options.length > 0) {
        // 结构化数据（<option>子标签解析结果）
        options = branchesData.data.options.map(function(opt) {
            return {
                id: String.fromCharCode(65 + ((opt.index || 0) % 26)),
                text: opt.text || opt.content || '',
                tag: opt.condition ? '条件' : '分支'
            };
    });
} else if (branchesData.html || branchesData.content) {
// 纯文本格式，按行解析
var rawText = (branchesData.html || branchesData.content).replace(/<[^>]+>/g, '').trim();
var lines = rawText.split(/\n/).filter(function(l) { return l.trim(); });
options = lines.map(function(line, idx) {
    return {
        id: String.fromCharCode(65 + (idx % 26)),
        text: line.trim(),
        tag: '分支'
    };
});
}

if (options.length > 0) {
    // 桥接到游戏原生选项系统
    if (typeof renderChoices === 'function') {
        renderChoices(options);
        console.log('[深度融合] 已将 ' + options.length + ' 个<branches>选项桥接到游戏选项系统');
    }
}
}

// 【深度融合】将预设<meow_FM>摘要桥接到游戏EnhancedMemory系统
function _bridgeSummaryToMemory(theaterData) {
    if (!theaterData) return;
    var summaryText = '';
    if (theaterData.data && theaterData.data.summary) {
        summaryText = theaterData.data.summary;
    } else if (theaterData.content) {
    summaryText = theaterData.content.replace(/<[^>]+>/g, '').trim();
} else if (theaterData.html) {
summaryText = theaterData.html.replace(/<[^>]+>/g, '').trim();
}
if (!summaryText || summaryText.length < 10) return;

// 注入到EnhancedMemory的短期记忆
if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.shortTermMemory && EnhancedMemory.shortTermMemory.summaries) {
    var summaryEntry = {
        turn: (gameState._stats && gameState._stats.totalTurns) || 0,
        storySummary: summaryText.substring(0, 500),
        timestamp: Date.now(),
        source: 'preset_meow_FM'
    };
EnhancedMemory.shortTermMemory.summaries.push(summaryEntry);
// 保留最近10条短期记忆
if (EnhancedMemory.shortTermMemory.summaries.length > EnhancedMemory.shortTermMemory.maxRounds) {
    EnhancedMemory.shortTermMemory.summaries = EnhancedMemory.shortTermMemory.summaries.slice(-EnhancedMemory.shortTermMemory.maxRounds);
}
console.log('[深度融合] 已将<meow_FM>摘要桥接到EnhancedMemory (长度:' + summaryText.length + ')');
}

// 同时更新游戏的滚动摘要（如果AI没有返回contextSummary）
if (!gameState.rollingSummary || gameState.rollingSummary.length < 50) {
    gameState.rollingSummary = summaryText.substring(0, 300);
    console.log('[深度融合] 已更新滚动摘要');
}
}

// 【深度融合】将预设状态面板数据桥接到游戏NPC角色系统
function _bridgeStatusToCharacters(theaterData) {
    if (!theaterData) return;
    var stats = (theaterData.data && theaterData.data.stats) || [];
    if (stats.length === 0) return;

    // 从状态项中提取角色信息
    var charUpdate = {};
    stats.forEach(function(stat) {
        if (!stat || !stat.name) return;
        var name = stat.name.replace(/[：:]/g, '').trim();
        var value = (stat.value || '').replace(/<[^>]+>/g, '').trim();
        if (!name || !value) return;

        // 映射常见状态字段到游戏角色属性
        var lowerName = name.toLowerCase();
        if (lowerName.includes('心情') || lowerName.includes('情绪') || lowerName.includes('状态')) {
            charUpdate.desc = value; // NPC状态描述
        } else if (lowerName.includes('位置') || lowerName.includes('地点') || lowerName.includes('所在')) {
        charUpdate.location = value;
    } else if (lowerName.includes('穿着') || lowerName.includes('服装') || lowerName.includes('服饰')) {
    charUpdate.outfit = value;
}
});

// 更新NPC的状态（尝试从状态项中提取角色名）
if (Object.keys(charUpdate).length > 0 && typeof mergeCharacters === 'function') {
    // 尝试从状态项中提取角色名
    var targetCharName = null;
    if (theaterData.data && theaterData.data.title) {
        targetCharName = theaterData.data.title.replace(/[：:]/g, '').trim();
    }
// 如果没找到，尝试从stats中找包含"名字"/"角色"的字段
if (!targetCharName && stats.length > 0) {
    stats.forEach(function(stat) {
        if (!stat || !stat.name) return;
        var n = stat.name.toLowerCase();
        if ((n.includes('名字') || n.includes('角色') || n.includes('名称') || n === 'name') && stat.value) {
            targetCharName = stat.value.replace(/<[^>]+>/g, '').trim();
        }
});
}
// 回退：尝试匹配已有角色
if (!targetCharName && gameState.allCharacters) {
    var charNames = Object.keys(gameState.allCharacters);
    if (charNames.length > 0) targetCharName = charNames[0];
}
if (targetCharName) {
    var update = Object.assign({ name: targetCharName }, charUpdate);
    mergeCharacters([update]);
    console.log('[深度融合] 已将状态面板数据桥接到NPC系统:', targetCharName);
}
}
}

// 【深度融合】将预设的字数/段落配置同步到游戏设置界面
function _syncPresetWordCountToUI(config) {
    if (!config) return;
    // 确保 gameState.wordCountConfig 已初始化
    if (!gameState.wordCountConfig) {
        gameState.wordCountConfig = { enabled: true, min: 1500, max: 3000, paragraphMin: 15, paragraphMax: 17, paragraphStyle: 'medium', lengthPreset: 'medium' };
    }
// 更新gameState
if (config.enabled !== undefined) gameState.wordCountConfig.enabled = config.enabled;
if (config.min != null) gameState.wordCountConfig.min = config.min;
if (config.max != null) gameState.wordCountConfig.max = config.max;
if (config.paragraphMin != null) gameState.wordCountConfig.paragraphMin = config.paragraphMin;
if (config.paragraphMax != null) gameState.wordCountConfig.paragraphMax = config.paragraphMax;
if (config.paragraphStyle) gameState.wordCountConfig.paragraphStyle = config.paragraphStyle;
if (config.lengthPreset) gameState.wordCountConfig.lengthPreset = config.lengthPreset;

// 同步到UI元素（如果设置页面有对应的DOM）
var wcMinEl = document.getElementById('wcMin');
var wcMaxEl = document.getElementById('wcMax');
var wcStyleEl = document.getElementById('wcParagraphStyle');
var wcEnabledEl = document.getElementById('wcEnabled');

if (wcMinEl) wcMinEl.value = config.min || 1500;
if (wcMaxEl) wcMaxEl.value = config.max || 3000;
if (wcStyleEl) wcStyleEl.value = config.paragraphStyle || 'medium';
if (wcEnabledEl) wcEnabledEl.checked = config.enabled !== false;

// 更新显示值
var wcMinValEl = document.getElementById('wcMinValue');
var wcMaxValEl = document.getElementById('wcMaxValue');
if (wcMinValEl) wcMinValEl.textContent = config.min || 1500;
if (wcMaxValEl) wcMaxValEl.textContent = config.max || 3000;

console.log('[深度融合] 已将预设字数配置同步到设置UI:', config.min + '-' + config.max + '字');
}

// 【深度融合】将预设<profile>角色关系数据桥接到游戏关系系统
function _bridgeProfileToRelationships(theaterData) {
    if (!theaterData) return;
    var content = theaterData.html || theaterData.content || '';
    if (!content || content.length < 20) return;

    // 尝试从mermaid图或文本中提取角色关系
    // 常见格式: "角色A --关系--> 角色B" 或 "角色A - 关系 - 角色B"
    var relations = [];

    // mermaid格式: A-->|关系|B
    var mermaidRegex = /([^\s\-|>]+?)\s*(?:--+>|===+>)\s*\|?\s*([^|>]+?)\s*\|?\s*([^\s\-|]+)/g;
    var match;
    while ((match = mermaidRegex.exec(content)) !== null) {
        relations.push({ from: match[1].trim(), relation: match[2].trim(), to: match[3].trim() });
    }

// 文本格式: "A和B：关系" 或 "A - B：关系"
if (relations.length === 0) {
    var textRegex = /(?:^|\n)\s*([^:\n]+?)\s*[和与\-—]\s*([^:\n]+?)\s*[：:]\s*(.+?)(?:\n|$)/g;
    while ((match = textRegex.exec(content)) !== null) {
        relations.push({ from: match[1].trim(), relation: match[3].trim(), to: match[2].trim() });
    }
}

// 将提取的关系注入到游戏系统
if (relations.length > 0 && gameState.allCharacters) {
    relations.forEach(function(rel) {
        // 更新"from"角色的关系描述
        if (gameState.allCharacters[rel.from]) {
            gameState.allCharacters[rel.from].relation = rel.relation;
        }
    // 确保"to"角色也存在
    if (!gameState.allCharacters[rel.to]) {
        gameState.allCharacters[rel.to] = { name: rel.to, relation: '' };
    }
});
if (typeof renderNpcList === 'function') renderNpcList();
console.log('[深度融合] 已将 ' + relations.length + ' 条角色关系桥接到NPC系统');
}
}

// 【小剧场融合】解析论坛内容
function parseForumContent(html) {
    var items = [];
    // 尝试解析帖子列表
    var postMatches = html.match(/<div[^>]*class=["']post["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    postMatches.forEach(function(match) {
        var author = (match.match(/class=["']author["'][^>]*>([^<]+)/i) || [])[1] || '匿名';
        var content = (match.match(/class=["']content["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || match.replace(/<[^>]+>/g, '');
        var time = (match.match(/class=["']time["'][^>]*>([^<]+)/i) || [])[1] || new Date().toLocaleString();
        items.push({ author: author, content: content, time: time, likes: 0, replies: 0 });
    });
if (items.length === 0) {
    // 如果没有解析到结构化内容，将整个HTML作为一个帖子
    items.push({ author: '小剧场', content: html.replace(/<[^>]+>/g, '').substring(0, 200), time: new Date().toLocaleString() });
}
return items;
}

// 【小剧场融合】解析聊天内容
function parseChatContent(html) {
    var messages = [];
    var msgMatches = html.match(/<div[^>]*class=["']message["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    msgMatches.forEach(function(match) {
        var sender = (match.match(/class=["']sender["'][^>]*>([^<]+)/i) || [])[1] || '未知';
        var text = (match.match(/class=["']text["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || match.replace(/<[^>]+>/g, '');
        messages.push({ sender: sender, text: text, time: new Date().toLocaleTimeString() });
    });
return messages;
}

function injectToChatLog(npcName, theater) {
    if (!gameState._chatLogs || Array.isArray(gameState._chatLogs)) gameState._chatLogs = {};
    if (!gameState._chatLogs[npcName]) gameState._chatLogs[npcName] = [];
    gameState._chatLogs[npcName].push({
        role: 'npc',
        text: (theater.content || '').substring(0, 100) + (theater.content.length > 100 ? '...' : ''),
        time: new Date().toLocaleTimeString(),
        isTheater: true,
        theaterType: theater.type
    });
// 【修复】限制每个NPC聊天记录上限，防止无限增长导致存档膨胀
if (gameState._chatLogs[npcName].length > 200) {
    gameState._chatLogs[npcName] = gameState._chatLogs[npcName].slice(-200);
}
}

// 【小剧场融合】解析日程内容
function parseCalendarContent(html) {
    var events = [];
    // 尝试解析Event格式: Event: type|title|description|time|location
    var eventMatches = html.match(/Event:\s*([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^\n]+)/gi) || [];
    eventMatches.forEach(function(match) {
        var parts = match.replace(/Event:\s*/, '').split('|');
        events.push({
            type: parts[0] || '其他',
            title: parts[1] || '无标题',
            description: parts[2] || '',
            time: parts[3] || '',
            location: parts[4] || ''
        });
});
if (events.length === 0) {
    // 尝试解析简单列表
    var lines = html.replace(/<[^>]+>/g, '').split('\n').filter(function(l) { return l.trim(); });
    lines.forEach(function(line) {
        events.push({ type: '日程', title: line.trim(), description: '', time: '', location: '' });
    });
}
return events;
}

// 【小剧场融合】解析邮件内容
function parseMailContent(html) {
    var mails = [];
    var mailMatches = html.match(/<div[^>]*class=["']mail["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    mailMatches.forEach(function(match) {
        var from = (match.match(/class=["']from["'][^>]*>([^<]+)/i) || [])[1] || '系统';
        var subject = (match.match(/class=["']subject["'][^>]*>([^<]+)/i) || [])[1] || '无主题';
        var content = (match.match(/class=["']body["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || match.replace(/<[^>]+>/g, '');
        mails.push({ from: from, subject: subject, preview: content.substring(0, 50), content: content, read: false, time: new Date().toLocaleString() });
    });
if (mails.length === 0) {
    mails.push({ from: '系统通知', subject: '小剧场', preview: html.replace(/<[^>]+>/g, '').substring(0, 50), content: html, read: false });
}
return mails;
}

// 【小剧场融合】解析商店内容
function parseShopContent(html) {
    var goods = [];
    var itemMatches = html.match(/<div[^>]*class=["']item["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    itemMatches.forEach(function(match) {
        var name = (match.match(/class=["']name["'][^>]*>([^<]+)/i) || [])[1] || '商品';
        var price = parseInt((match.match(/class=["']price["'][^>]*>([\d]+)/i) || [])[1]) || 100;
        var desc = (match.match(/class=["']description["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '';
        goods.push({ name: name, price: price, description: desc.replace(/<[^>]+>/g, ''), icon: '📦' });
    });
return goods;
}

// 【小剧场融合】解析朋友圈内容
function parseMomentsContent(html) {
    var moments = [];
    var momentMatches = html.match(/<div[^>]*class=["']moment["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    momentMatches.forEach(function(match) {
        var author = (match.match(/class=["']author["'][^>]*>([^<]+)/i) || [])[1] || '匿名';
        var content = (match.match(/class=["']content["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || match.replace(/<[^>]+>/g, '');
        var likes = parseInt((match.match(/class=["']likes["'][^>]*>([\d]+)/i) || [])[1]) || 0;
        moments.push({ author: author, content: content, time: '刚刚', likes: likes, comments: [] });
    });
if (moments.length === 0 && html.trim()) {
    moments.push({ author: '小剧场', content: html.replace(/<[^>]+>/g, ''), time: '刚刚', likes: 0, comments: [] });
}
return moments;
}

// 【小剧场融合】解析物品内容
function parseItemsContent(html) {
    var items = [];
    var itemMatches = html.match(/<div[^>]*class=["']item["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    itemMatches.forEach(function(match) {
        var name = (match.match(/class=["']name["'][^>]*>([^<]+)/i) || [])[1] || '物品';
        var count = parseInt((match.match(/class=["']count["'][^>]*>([\d]+)/i) || [])[1]) || 1;
        var rarity = (match.match(/class=["']rarity["'][^>]*>([^<]+)/i) || [])[1] || '普通';
        items.push({ name: name, count: count, rarity: rarity, icon: '🎁' });
    });
return items;
}

// 【小剧场融合】解析日记内容
function parseDiaryContent(html) {
    var entries = [];
    var entryMatches = html.match(/<div[^>]*class=["']entry["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
    entryMatches.forEach(function(match) {
        var date = (match.match(/class=["']date["'][^>]*>([^<]+)/i) || [])[1] || new Date().toLocaleDateString();
        var content = (match.match(/class=["']content["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || match.replace(/<[^>]+>/g, '');
        entries.push({ date: date, content: content });
    });
return entries;
}

// API错误信息中文翻译
function translateError(msg) {
    if (!msg) return '未知错误，请稍后重试';
    var m = msg;
    // 常见英文错误 -> 中文翻译映射表
    var map = {
        // 网络相关错误
        'Failed to fetch': '网络请求失败，请检查网络连接或API地址是否正确',
        'NetworkError when attempting to fetch resource': '网络错误，请检查网络连接',
        'Network request failed': '网络请求失败，请检查网络',
        'net::ERR_CONNECTION_REFUSED': '连接被拒绝，API地址可能不正确或服务未启动',
        'net::ERR_CONNECTION_TIMED_OUT': '连接超时，API服务器响应太慢',
        'net::ERR_NAME_NOT_RESOLVED': '域名解析失败，请检查API地址',
        'net::ERR_SSL_PROTOCOL_ERROR': 'SSL证书错误，请检查API地址是否使用HTTPS',
        'net::ERR_CERT_DATE_INVALID': 'SSL证书已过期',
        'net::ERR_INTERNET_DISCONNECTED': '网络已断开，请检查网络连接',
        'ECONNREFUSED': '连接被拒绝，API服务可能未启动',
        'ECONNRESET': '连接被重置，API服务器可能重启了',
        'ETIMEDOUT': '连接超时，API服务器响应太慢',
        'ENOTFOUND': '域名不存在，请检查API地址',
        // 请求取消
        'AbortError': '请求已取消',
        'The user aborted a request': '请求已被取消',
        // JSON解析错误
        'Unexpected end of JSON input': '服务器返回了不完整的数据，请重试',
        'Unexpected token': '服务器返回了无法解析的数据',
        'JSON parse error': '服务器返回了无法解析的数据，请检查API配置',
        'SyntaxError': '数据格式错误，请检查API设置',
        // HTTP状态码（直接匹配）
        '401 Unauthorized': '认证失败，API Key错误或已过期',
        '403 Forbidden': '没有权限，请检查API Key的访问权限',
        '404 Not Found': '请求的地址不存在，请检查API地址',
        '429 Too Many Requests': '请求过于频繁，请稍后再试',
        '500 Internal Server Error': 'API服务器内部错误，请稍后再试',
        '502 Bad Gateway': 'API网关错误，服务器可能正在维护',
        '503 Service Unavailable': 'API服务暂不可用，请稍后再试',
        '504 Gateway Timeout': 'API网关超时，服务器响应太慢',
        '401': '认证失败(API Key错误或已过期)',
        '403': '没有权限访问该资源',
        '404': '请求的地址不存在，请检查API地址',
        '429': '请求过于频繁，请稍后再试(已触发速率限制)',
        '500': 'API服务器内部错误，请稍后再试',
        '502': 'API网关错误，服务器可能正在维护',
        '503': 'API服务暂不可用，请稍后再试',
        '504': 'API网关超时，服务器响应太慢',
        // API特定错误
        'insufficient_quota': 'API额度不足，请充值或更换Key',
        'rate_limit_exceeded': '请求频率超限，请降低发送速度',
        'context_length_exceeded': '对话内容超出模型上下文长度限制，请压缩对话或更换模型',
        'invalid_api_key': 'API Key无效，请检查是否正确复制',
        'model_not_found': '模型不存在，请检查模型名称是否正确',
        'Maximum context length': '超出最大上下文长度限制',
        'This model maximum context length': '超出模型最大上下文长度',
        'openai_error': 'OpenAI接口错误，请检查API地址和密钥是否正确',
        'invalid_request_error': '请求格式错误，请检查模型名称或参数',
        'authentication_error': '认证失败，API Key无效或已过期',
        'permission_denied': '没有权限，请检查API Key的访问权限',
        'not_found': '请求的资源不存在',
        'rate_limit_error': '请求频率超限，请稍后再试',
        'server_error': 'API服务器内部错误，请稍后再试',
        'service_unavailable': 'API服务暂不可用，请稍后再试',
        // JavaScript运行时错误
        'Cannot read properties of null': '数据加载失败，请刷新页面后重试',
        'Cannot read property': '数据读取失败，请稍后重试',
        'null is not an object': '数据未加载完成，请稍后重试',
        'undefined is not an object': '数据未定义，请刷新页面重试',
        'TypeError': '类型错误，请稍后重试',
        'ReferenceError': '引用错误，请刷新页面',
        // 其他常见错误
        'timeout': '请求超时，请检查网络或重试',
        'Timeout': '请求超时，请稍后重试',
        'CORS': '跨域请求被阻止，请检查API地址',
        'cors': '跨域请求被阻止，请检查API设置',
        'Invalid URL': 'API地址无效，请检查设置',
        'No API key': '未配置API Key，请先在设置中添加',
        'No API configuration': '未配置API，请先在设置中添加',
        'fetch failed': '获取数据失败，请检查网络和API地址',
        'api key': 'API密钥',
        'api_key': 'API密钥',
        'API key': 'API密钥',
        'API Key': 'API密钥',
        'error processing': '处理数据时出错',
        'parse error': '解析数据出错',
        'invalid response': '无效的响应',
        'empty response': '服务器返回了空数据',
    };
// 【修复】如果翻译后的结果与原文不同，在末尾附加原始错误信息
// 这样用户既能看到中文解释，也能看到原始英文错误用于排查
// 【优化】缓存排序后的 key 数组，避免每次调用都重新排序
var _translateErrorSortedKeys = null;
var translated = null;
for (var key in map) {
    if (m === key) { translated = map[key]; break; }
}
if (!translated) {
    if (!_translateErrorSortedKeys) {
        _translateErrorSortedKeys = Object.keys(map).sort(function(a, b) { return b.length - a.length; });
    }
    for (var i = 0; i < _translateErrorSortedKeys.length; i++) {
        var key = _translateErrorSortedKeys[i];
        if (m.indexOf(key) !== -1) { translated = map[key]; break; }
    }
}
if (translated && translated !== m) {
    return translated + ' (' + m + ')';
}
// HTTP状态码翻译
var httpMatch = m.match(/HTTP\s*(\d{3})/);
if (httpMatch) {
    var code = httpMatch[1];
    var httpMap = {
        '400': '请求格式错误(400)',
        '401': '认证失败，API Key错误(401)',
        '403': '没有权限(403)',
        '404': '地址不存在(404)',
        '429': '请求太频繁，请稍后再试(429)',
        '500': '服务器内部错误(500)',
        '502': '网关错误(502)',
        '503': '服务暂不可用(503)',
        '504': '网关超时(504)',
    };
if (httpMap[code]) return httpMap[code];
}
// 都没匹配到，返回友好提示（截断过长消息）
if (m.length > 100) {
    return '发生错误：' + m.substring(0, 80) + '...（详情见控制台）';
}
return '发生错误：' + m;
}

// rebindBtn 辅助函数：统一处理按钮事件重新绑定
function rebindBtn(btn, eventType, handler) {
    var clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener(eventType, handler);
    return clone;
}

function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
        try { localStorage.removeItem('__autoSaveBackup'); } catch (e2) {}
        try { localStorage.setItem(key, value); return true; } catch (e3) {}
    }
return false;
}
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 轻量级HTML净化（防止XSS）
// 允许基本格式标签，移除危险属性和事件处理器
function sanitizeHtml(html) {
    if (!html) return '';
    var str = String(html);
    // 移除script标签及其内容（注意：不能在代码中直接写关闭script标签，会被HTML解析器截断）
    str = str.replace(new RegExp('<script[\\s\\S]*?<\\/script>', 'gi'), '');
    // 移除SVG事件（onload, onerror等，包括无空格分隔的情况）
    str = str.replace(/\/?on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>\/]+)/gi, '');
    // 移除所有事件属性（onclick, onerror, onload 等）
    str = str.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    // 移除 javascript: 协议（包括大小写变体和编码变体）
    str = str.replace(/href\s*=\s*["']?\s*javascript\s*:[^"'>]*/gi, 'href="#"');
    str = str.replace(/src\s*=\s*["']?\s*javascript\s*:[^"'>]*/gi, 'src=""');
    // 移除 vbscript: 协议
    str = str.replace(/href\s*=\s*["']?\s*vbscript\s*:[^"'>]*/gi, 'href="#"');
    // 移除 data: 协议（防止base64注入）
    str = str.replace(/src\s*=\s*["']?\s*data\s*:[^"'>]*/gi, 'src=""');
    // 移除危险标签
    str = str.replace(/<(iframe|object|embed|form|meta|link|base|svg)[^>]*>/gi, '');
    str = str.replace(new RegExp('<\\/(iframe|object|embed|form|meta|link|base|svg)>', 'gi'), '');
    // 移除 style 标签中的 expression 和 url()
    str = str.replace(/expression\s*\([^)]*\)/gi, '');
    return str;
}
// 页面关闭前保存（合并所有 beforeunload 逻辑，避免多个监听器）
window.addEventListener('beforeunload', function() {
    try {
        var data = buildSaveData('');
        safeSetItem('__autoSaveBackup', JSON.stringify(data));
    } catch(e) { console.warn('beforeunload save failed:', e); }
    try {
        if (typeof EnhancedMemory !== 'undefined' && EnhancedMemory.saveToStorage) {
            EnhancedMemory.saveToStorage();
        }
    } catch(memE) {}
    // 清理全局资源（定时器、事件监听器等）
    try {
        if (typeof GlobalCleanup !== 'undefined') GlobalCleanup.cleanup();
    } catch(gcE) {}
});
function parseMarkdown(text) {
    if (!text) return '';
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}
// --- applyFontSize 适配 ---
/**
* 折叠/展开设置组
*/
function toggleSettingGroup(header) {
    var body = header.nextElementSibling;
    var icon = header.querySelector('.toggle-icon');
    if (body) {
        var isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'block' : 'none';
        if (icon) icon.textContent = isHidden ? '▲' : '▼';
    }
}
function applyFontSize() {
    var storyText = DOMCache.get('storyText') || document.getElementById('storyText');
    if (storyText) storyText.style.fontSize = (gameState.fontSize || 16) + 'px';
}



// ========================================
// 第2层: UI基础
// ========================================
// ========================================
// 导航栏渲染
// ========================================
// 导航栏事件委托处理函数（避免重复绑定）
const _navBarClickHandler = function(e) {
    var btn = e.target.closest('.nav-item');
    if (!btn) return;
    var page = btn.dataset.navPage;
    if (!page) return;
    UI.showPage(page);
    // 触发页面渲染
    if (page === 'playerPage') renderPlayerPage();
    else if (page === 'npcPage') renderNpcPage();
    else if (page === 'recapPage') renderRecapPage();
    else if (page === 'logPage') renderLogPage();
    else if (page === 'memoryPage' && typeof MemoryManagerUI !== 'undefined') { MemoryManagerUI.show(); UI.showPage('memoryPage'); }
};
function renderNavBar(containerId, tabs, activeIndex) {
    var container = document.getElementById(containerId);
    if (!container) return;
    // 首次渲染时绑定事件委托，避免重复绑定
    if (!container._hasEventDelegate) {
        container.addEventListener('click', _navBarClickHandler);
        container._hasEventDelegate = true;
    }
container.innerHTML = tabs.map(function(tab, i) {
    var isActive = i === activeIndex ? ' active' : '';
    return '<button class="nav-item' + isActive + '" data-nav-page="' + tab.page + '">' +
    '<svg class="icon"><use href="#' + tab.icon + '"/></svg>' +
    '<span class="nav-label">' + tab.label + '</span></button>';
}).join('');
}
function showStoryLoading() {
    // 清理定时器，防止泄漏
    TimerManager.clearInterval('loadingTimer');
    var flavors = ['命运的齿轮转动中...', '世界正在生成...', 'AI正在构思剧情...', '新篇章即将揭晓...'];
    var storyEl = document.getElementById('storyText');
    var optsEl = document.getElementById('optionsContainer');
    if (!storyEl || !optsEl) return;
    storyEl.innerHTML =
    '<div style="text-align:center;padding:40px 0;display:flex;flex-direction:column;align-items:center;text-indent:0;">' +
    '<div style="display:flex;justify-content:center;gap:10px;margin-bottom:16px;">' +
    '<div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>' +
    '<span style="color:var(--text-secondary);font-size:13px;">' + flavors[Math.floor(Math.random() *
        flavors.length)] + '</span>' +
    '<div style="margin-top:8px;font-size:12px;color:var(--text-tertiary);text-align:center;">已等待 <span id="waitSec">0</span> 秒</div></div>';
    optsEl.innerHTML = '';
    var sec = 0;
    TimerManager.setInterval('loadingTimer', function() {
        sec++;
        var el = document.getElementById('waitSec');
        if (el) el.textContent = sec;
        else {
            TimerManager.clearInterval('loadingTimer');
        }
}, 1000);
}
function hideStoryLoading() {
    TimerManager.clearInterval('loadingTimer');
    var storyEl = document.getElementById('storyText');
    if (storyEl && storyEl.querySelector('.loading-dot')) {
        storyEl.innerHTML = '';
    }
}
function showError(msg) {
    TimerManager.clearInterval('loadingTimer');
    var el = document.getElementById('storyText');
    if (!el) return;
    // 错误消息需要转义，并提供更友好的中文提示
    el.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--danger);">' +
    '<div style="font-size:16px;margin-bottom:8px;">⚠️ 生成失败</div>' +
    '<div style="font-size:14px;color:#666;margin-bottom:16px;">' + escapeHtml(msg) + '</div>' +
    '<div style="font-size:11px;color:#bbb;margin-bottom:12px;word-break:break-all;">原始错误: ' + escapeHtml(msg) + '</div>' +
    '<div style="font-size:12px;color:#999;">请检查网络连接和API设置后重试</div>' +
    '</div>';
}
// --- 章节标题更新 ---
function updateSceneTitle(title) {
    var titleEl = document.getElementById('storySceneTitle');
    if (titleEl && title) {
        titleEl.textContent = title;
    }
}
var _autoSaveTimer = null;
async function autoSave() {
    if (_autoSaveTimer) return; // 防抖：已有待执行的保存，跳过
    _autoSaveTimer = TimerManager.setTimeout('autoSave', async function() {
        _autoSaveTimer = null;
        try {
            if (typeof SaveDB !== 'undefined') {
                await SaveDB.set(0, buildSaveData(''));
            }
    } catch (e) {
    console.error('[自动保存] 保存失败:', e);
}
}, 2000);
}
function safeAutoSave() { try { autoSave(); } catch(e) { console.warn('autoSave failed:', e); } }
function safeAbort() { if (window._currentAbort) { try { window._currentAbort.abort(); } catch(e){} } }
function setWaiting(w) {
    isWaiting = w;
    var input = DOMCache.get('customAction') || document.getElementById('customAction');
    var sendBtn = DOMCache.get('btnSendAction') || document.getElementById('btnSendAction');
    if (input) input.disabled = w;
    if (sendBtn) sendBtn.disabled = w;
    var optBtns = document.querySelectorAll('.option-btn');
    for (var oi = 0; oi < optBtns.length; oi++) {
        optBtns[oi].style.pointerEvents = w ? 'none' : 'auto';
        optBtns[oi].style.opacity = w ? '.5' : '1';
    }
// 显示/隐藏生成控制条
var genControl = document.getElementById('genControl');
if (genControl) {
    if (w) genControl.classList.add('active');
    else genControl.classList.remove('active');
}
// 显示/隐藏流式输出进度条
var progressBar = document.getElementById('genProgressBar');
if (progressBar) {
    if (w) progressBar.classList.add('active');
    else progressBar.classList.remove('active');
}
}



// ========================================
// 第3层: AI核心
// ========================================
// ========================================
// AI调用函数（替代 GameAPI.call）
// ========================================
async function callAI(messages, options = {}) {
    if (!LocalGameAPI.getCurrentConfig() || !LocalGameAPI.getCurrentConfig().baseUrl || !LocalGameAPI
    .getCurrentConfig().apiKey) {
        throw new Error('请先配置API（设置 → API配置）');
    }

return await LocalGameAPI.tryWithFallback(async function(slotIdx) {
    const config = LocalGameAPI._configs[slotIdx];
    const url = LocalGameAPI.buildApiUrl(config.baseUrl, '/chat/completions');
    // 【修复】先检查 PresetManager 是否存在，再调用 getParams()
    if (typeof PresetManager === 'undefined') {
        throw new Error('PresetManager 未初始化');
    }
var presetParams = PresetManager.getParams();
// 【增强】合并预设中的高级采样参数（如果预设有定义）
// 【修复】添加类型校验，确保数值参数为Number类型
if (PresetManager.presets && PresetManager.currentPresetIndex >= 0) {
    var _curPreset = PresetManager.presets[PresetManager.currentPresetIndex];
    if (_curPreset && _curPreset.params) {
        var _pp = _curPreset.params;
        // 合并未在 getParams 中暴露的高级参数（带类型转换）
        if (_pp.top_k != null && !presetParams.top_k) presetParams.top_k = Number(_pp.top_k) || 0;
        if (_pp.top_a != null && !presetParams.top_a) presetParams.top_a = Number(_pp.top_a) || 0;
        if (_pp.min_p != null && !presetParams.min_p) presetParams.min_p = Number(_pp.min_p) || 0;
        if (_pp.repetition_penalty != null && _pp.repetition_penalty !== 1) presetParams.repetition_penalty = Number(_pp.repetition_penalty) || 1;
        if (_pp.typical_p != null && _pp.typical_p !== 1) presetParams.typical_p = Number(_pp.typical_p) || 1;
        if (_pp.tail_free_sampling != null && _pp.tail_free_sampling !== 1) presetParams.tail_free_sampling = Number(_pp.tail_free_sampling) || 1;
        if (_pp.mirostat_mode != null && _pp.mirostat_mode !== 0) presetParams.mirostat_mode = Number(_pp.mirostat_mode) || 0;
        if (_pp.mirostat_tau != null && _pp.mirostat_tau !== 5.0) presetParams.mirostat_tau = Number(_pp.mirostat_tau) || 5.0;
        if (_pp.mirostat_eta != null && _pp.mirostat_eta !== 0.1) presetParams.mirostat_eta = Number(_pp.mirostat_eta) || 0.1;
        if (_pp.dry_multiplier != null && _pp.dry_multiplier !== 0) presetParams.dry_multiplier = Number(_pp.dry_multiplier) || 0;
        if (_pp.xtc_probability != null && _pp.xtc_probability !== 0) presetParams.xtc_probability = Number(_pp.xtc_probability) || 0;
        if (_pp.reasoning_effort != null) presetParams.reasoning_effort = String(_pp.reasoning_effort);
        if (_pp.seed != null) presetParams.seed = Number(_pp.seed) || null;
        // 确保max_tokens使用预设值（带类型转换）
        if (_pp.max_tokens && Number(_pp.max_tokens) > 0) presetParams.max_tokens = Number(_pp.max_tokens);
    }
}

// 【修复】对中转站API不做提供商检测和参数过滤
// 中转站通常兼容OpenAI格式，发送所有参数让中转站自行处理
// 如果用户明确开启了 compatibleMode，则只发送基本参数
var isCompatibleMode = config.compatibleMode === true;
if (isCompatibleMode) {
    console.log('[API] 使用兼容模式，只发送基本参数');
}

// 构建请求参数（兼容模式只发基本参数）
var params = {
    model: config.model || 'gpt-3.5-turbo',
    messages: messages,
    temperature: presetParams.temperature,
    max_tokens: presetParams.max_tokens,
    top_p: presetParams.top_p,
    ...(isCompatibleMode ? {} : {
        top_k: presetParams.top_k || 0,
        frequency_penalty: presetParams.frequency_penalty,
        presence_penalty: presetParams.presence_penalty,
        min_p: presetParams.min_p || 0,
        top_a: presetParams.top_a || 0,
        repetition_penalty: presetParams.repetition_penalty || 1,
        typical_p: presetParams.typical_p || 1,
        min_length: presetParams.min_length || 0,
        max_time: presetParams.max_time || null,
        mirostat_mode: presetParams.mirostat_mode || 0,
        mirostat_tau: presetParams.mirostat_tau || 5.0,
        mirostat_eta: presetParams.mirostat_eta || 0.1,
        repetition_penalty_range: presetParams.repetition_penalty_range || 0,
        repetition_penalty_slope: presetParams.repetition_penalty_slope || 0,
        tfs: presetParams.tail_free_sampling || 1,
        epsilon_cutoff: presetParams.epsilon_cutoff || 0,
        eta_cutoff: presetParams.eta_cutoff || 0,
        dry_multiplier: presetParams.dry_multiplier || 0,
        dry_range: presetParams.dry_range || 0,
        dry_allowed_length: presetParams.dry_allowed_length || 2,
        xtc_probability: presetParams.xtc_probability || 0,
        xtc_threshold: presetParams.xtc_threshold || 0,
        seed: presetParams.seed || null,
        response_format: presetParams.response_format || null,
        modalities: presetParams.modalities || null,
        tool_reasoning_mode: presetParams.tool_reasoning_mode || 'disabled',
        reasoning_effort: presetParams.reasoning_effort || null
    })
};

if (presetParams.stop_sequences) {
    params.stop = presetParams.stop_sequences;
}
if (isCompatibleMode) {
    if (presetParams.frequency_penalty !== undefined && presetParams.frequency_penalty !== 0) {
        params.frequency_penalty = presetParams.frequency_penalty;
    }
if (presetParams.presence_penalty !== undefined && presetParams.presence_penalty !== 0) {
    params.presence_penalty = presetParams.presence_penalty;
}
}

// 允许 options 中的采样参数覆盖预设值
if (options.temperature != null) params.temperature = options.temperature;
if (options.max_tokens != null) params.max_tokens = options.max_tokens;
if (options.top_p != null) params.top_p = options.top_p;
if (options.top_k != null) params.top_k = options.top_k;
if (options.frequency_penalty != null) params.frequency_penalty = options.frequency_penalty;
if (options.presence_penalty != null) params.presence_penalty = options.presence_penalty;
if (options.stop != null) params.stop = options.stop;

// 过滤掉 null 和默认值参数，避免某些 API 后端报错
var filteredParams = {};
Object.keys(params).forEach(function(key) {
    var val = params[key];
    if (val !== null && val !== undefined) {
        if (key === 'top_k' && val === 0) return;
        if (key === 'min_p' && val === 0) return;
        if (key === 'top_a' && val === 0) return;
        if (key === 'repetition_penalty' && val === 1) return;
        if (key === 'typical_p' && val === 1) return;
        if (key === 'mirostat_mode' && val === 0) return;
        if (key === 'repetition_penalty_range' && val === 0) return;
        if (key === 'repetition_penalty_slope' && val === 0) return;
        if (key === 'tfs' && val === 1) return;
        if (key === 'epsilon_cutoff' && val === 0) return;
        if (key === 'eta_cutoff' && val === 0) return;
        if (key === 'dry_multiplier' && val === 0) return;
        if (key === 'xtc_probability' && val === 0) return;
        if (key === 'tool_reasoning_mode' && val === 'disabled') return;
        filteredParams[key] = val;
    }
});
console.log('[API] 参数过滤完成，发送参数数:', Object.keys(filteredParams).length);

if (options.stream) filteredParams.stream = true;

const body = filteredParams;

// 如果预设中有 reasoning_effort 参数，传递给 API
// reasoning_effort 支持: "low", "medium", "high", "auto" 等
if (body.reasoning_effort) {
    // 某些 API 使用 reasoning_effort，某些使用 thinking.budget_tokens
    // 这里保持原样传递，让 API 后端自行处理
}

// 【修复R1】支持自定义signal，避免NPC聊天与主游戏共享AbortController
const signal = options.signal || (window._currentAbort ? window._currentAbort.signal : undefined);

if (options.stream) {
    // 流式请求
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + config.apiKey
        },
    body: JSON.stringify(body),
    signal: signal,
});
if (!res.ok) {
    let errMsg = translateError('API错误: ' + res.status);
    try {
        const errData = await res.json();
        // 优先取 message，其次取 code/type，最后拼接所有字段
        var errObj = errData.error || errData;
        errMsg = translateError(errObj.message) ||
        translateError(errObj.code) ||
        translateError(errObj.type) ||
        translateError(errObj.error) ||
        errMsg;
    } catch (e) { console.warn('[API] 错误响应解析失败:', e); }
throw new Error(errMsg);
}
const reader = res.body.getReader();
const decoder = new TextDecoder();
let fullText = '';
let rawBody = '';
let sseBuffer = '';
let streamError = null; // 【修复】捕获流中的错误响应
while (true) {
    const {
        done,
        value
    } = await reader.read();
if (done) {
    // 流结束时，处理剩余的buffer
    if (sseBuffer && sseBuffer.trim()) {
        const lines = sseBuffer.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                    const json = JSON.parse(line.slice(6));
                    // 【修复】检测流中的错误响应
                    if (json.error && !streamError) {
                        var errObj = json.error;
                        streamError = translateError(errObj.message) || translateError(errObj.code) || translateError(errObj.msg) || ('API流式错误: ' + JSON.stringify(errObj));
                        console.error('[callAI] 流式错误:', streamError);
                        continue;
                    }
                const content = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content || '';
                fullText += content;
                if (options.onChunk) {
                    try {
                        options.onChunk(fullText);
                    } catch (chunkErr) {
                    console.warn('[callAI] onChunk 回调异常:', chunkErr);
                }
        }
} catch (e) {
// 【修复】JSON解析失败时，检查是否是错误格式的数据
var lineContent = line.slice(6).trim();
if (lineContent.indexOf('"error"') !== -1 || lineContent.indexOf('"code"') !== -1) {
    console.warn('[callAI] 可能的错误响应（无法解析JSON）:', lineContent.substring(0, 200));
}
}
}
}
}
break;
}
const chunk = decoder.decode(value, {
    stream: true
});
rawBody += chunk;
// 解析SSE
sseBuffer += chunk;
// 按双换行分割完整SSE事件
const events = sseBuffer.split(/\r?\n\r?\n/);
// 最后一段可能不完整，保留在buffer中
sseBuffer = events.pop() || '';
for (const event of events) {
    const lines = event.split('\n');
    for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
                const json = JSON.parse(line.slice(6));
                // 【修复】检测流中的错误响应
                if (json.error && !streamError) {
                    var errObj = json.error;
                    streamError = translateError(errObj.message) || translateError(errObj.code) || translateError(errObj.msg) || ('API流式错误: ' + JSON.stringify(errObj));
                    console.error('[callAI] 流式错误:', streamError);
                    continue;
                }
            const content = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content || '';
            fullText += content;
            if (options.onChunk) {
                try {
                    options.onChunk(fullText);
                } catch (chunkErr) {
                console.warn('[callAI] onChunk 回调异常 (事件循环):', chunkErr);
            }
    }
} catch (e) {
// 【修复】JSON解析失败时，检查是否是错误格式的数据
var lineContent = line.slice(6).trim();
if (lineContent.indexOf('"error"') !== -1 || lineContent.indexOf('"code"') !== -1) {
    console.warn('[callAI] 可能的错误响应（无法解析JSON）:', lineContent.substring(0, 200));
}
}
}
}
}
}
// 【修复】如果流中检测到错误且没有收到任何有效内容，抛出错误
// 如果已有部分内容，说明API可能先发了警告但仍正常返回，不中断
if (streamError && !fullText) {
    throw new Error(streamError);
} else if (streamError && fullText) {
console.warn('[callAI] 流中有错误但已收到内容，忽略错误继续:', streamError);
}
// 兜底：如果SSE解析为空，尝试将rawBody作为普通JSON解析
if (!fullText && rawBody) {
    try {
        const jsonData = JSON.parse(rawBody);
        // 【修复】检查兜底JSON中是否包含错误
        if (jsonData.error) {
            var errObj = jsonData.error;
            throw new Error(translateError(errObj.message) || translateError(errObj.code) || translateError(errObj.msg) || ('API错误: ' + JSON.stringify(errObj)));
        }
    fullText = (jsonData.choices && jsonData.choices[0] && jsonData.choices[
        0].message && jsonData.choices[0].message.content) || '';
    // 【修复】如果依然没有有效内容且有usage信息（说明请求成功但无输出），返回空而非rawBody
    if (!fullText && jsonData.usage) {
        fullText = '';
    } else if (!fullText) {
    fullText = rawBody;
}
} catch (e) {
if (e.message && e.message.indexOf('API') === 0) throw e; // 重新抛出我们的错误
// 如果也不是JSON，直接用原始文本
fullText = rawBody;
}
}
return fullText;
} else {
// 非流式请求
const res = await fetch(url, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.apiKey
    },
body: JSON.stringify(body),
signal: signal
});
if (!res.ok) {
    const err = await res.json().catch(function() {
        return {};
    });
var errObj = err.error || err;
throw new Error(translateError(errObj.message) ||
translateError(errObj.code) || translateError(errObj.type) ||
'API错误: ' + res.status);
}
const data = await res.json();
return (data.choices && data.choices[0] && data.choices[0].message && data
.choices[0].message.content) || '';
}
});
}
// ========================================
// System Prompt
// ========================================
function initializeGame() {
    try {
        // 收集主角设定
        gameState.protagonistSetup = {};
        var mcFields = ['mcName', 'mcGender', 'mcAge', 'mcIdentity', 'mcPersonality', 'mcAppearance',
            'mcAbility', 'mcExtra'
        ];
    mcFields.forEach(function(id) {
        var el = document.getElementById(id);
        if (el && el.value.trim()) gameState.protagonistSetup[id] = el.value.trim();
    });
gameState.systemPrompt = buildSystemPrompt();
gameState.conversationHistory = [{
        role: 'system',
        content: gameState.systemPrompt
    }];
if (gameState.customStyle) {
    gameState.conversationHistory.push({
        role: 'user',
        content: '【写作风格要求】请在所有输出中遵循：\n' + gameState.customStyle + '\n\n回复"明白"确认。'
    }, {
    role: 'assistant',
    content: '明白，我会遵循上述写作风格。'
});
}
// 初始化游戏时间显示
if (typeof GameTimeSystem !== 'undefined') {
    GameTimeSystem.updateUI();
}
sendAIRequest('请开始游戏，描述开局场景。', true);
} catch (e) {
console.error('初始化游戏失败:', e);
UI.toast('游戏初始化失败: ' + translateError(e.message));
}
}
// ========================================
// 世界书系统 (World Info / Lorebook)
// 兼容 SillyTavern 世界书格式
// ========================================
