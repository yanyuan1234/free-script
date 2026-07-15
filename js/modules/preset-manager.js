/**
 * 预设管理器
 * 管理 API 预设列表（温度、top_p、提示词顺序、占位符等）
 * 依赖：smart-config-engine.js
 * 被依赖：regex-manager.js
 */

// [T1-P1-12] 优先取单人聊天（character_id=100000）的 order，找不到则按 currentCharId 匹配分组，
// 最后取第一个非空 group。这样角色级 prompt_order 排序才能正确匹配
function _findPromptOrderGroup(data, currentCharId) {
    if (!data || !data.prompt_order || !Array.isArray(data.prompt_order) || data.prompt_order.length === 0) {
        return null;
    }
    // 1) 优先按当前角色 ID 匹配（角色级 prompt_order）
    if (currentCharId != null) {
        var charMatch = data.prompt_order.find(function(g) { return g && g.character_id === currentCharId; });
        if (charMatch) return charMatch;
    }
    // 2) 单人聊天全局顺序 (character_id === 100000)
    var globalMatch = data.prompt_order.find(function(g) { return g && g.character_id === 100000; });
    if (globalMatch) return globalMatch;
    // 3) 兜底：第一个非空 group
    return data.prompt_order.find(function(g) { return g != null; });
}

var PresetManager = {
    presets: [],
    currentPresetIndex: -1,
    // 当前应用的参数
    currentParams: {
        temperature: 0.8,
        top_p: 0.9,
        top_k: 0,
        frequency_penalty: 0,
        presence_penalty: 0,
        max_tokens: DEFAULT_MAX_TOKENS,
        tool_reasoning_mode: 'disabled'
    },

    // 初始化
    init: function() {
        this.load();
        // 注入官方内置预设（4 套：抒情/激进/平缓/标准）
        // 只在用户没有同 builtinId 的预设时才注入，避免覆盖
        this._injectBuiltInPresets();
        this.loadCurrentParams();
        this.bindEvents();
    },

    // 注入官方内置预设
    // 设计：builtinId 匹配则跳过（保留用户克隆后的版本），builtinId 不匹配则不覆盖
    // 旧版本残留的"_isBuiltin 但没 builtinId"的内置预设（早期月读/果实/蛾摩拉）会被清理
    _injectBuiltInPresets: function() {
        if (!window.BUILT_IN_PRESETS || !Array.isArray(window.BUILT_IN_PRESETS)) return;

        // 1) 清理旧版残留（无 builtinId 的 _isBuiltin 预设）
        var before = this.presets.length;
        this.presets = this.presets.filter(function(p) {
            return !(p && p._isBuiltin && !p.builtinId);
        });
        var cleaned = before - this.presets.length;

        // 2) 注入新内置（已存在 builtinId 相同的则跳过）
        var added = 0;
        var existingIds = {};
        this.presets.forEach(function(p) {
            if (p && p.builtinId) existingIds[p.builtinId] = true;
        });

        for (var i = 0; i < window.BUILT_IN_PRESETS.length; i++) {
            var bp = window.BUILT_IN_PRESETS[i];
            if (existingIds[bp.builtinId]) continue;
            // 深拷贝，避免共享引用导致跨预设状态串改（公共段被多套预设共享）
            var clone = JSON.parse(JSON.stringify(bp));
            // 解析正则脚本为引擎内部格式（findRegex→findPattern, placement→applyInput/applyOutput）
            // 否则 RegexManager.apply 读 findPattern 为 undefined，正则静默失效
            if (clone.regexScripts && clone.regexScripts.length > 0 && typeof RegexManager !== 'undefined' && RegexManager.parseSingleRegex) {
                clone._parsedRegexScripts = clone.regexScripts.map(function(r) {
                    try { return RegexManager.parseSingleRegex(r, false); }
                    catch(e) { console.error('[PresetManager] 内置正则解析失败:', r.scriptName, e); return null; }
                }).filter(Boolean);
            }
            this.presets.push(clone);
            added++;
        }

        if (cleaned > 0 || added > 0) {
            console.log('[PresetManager] 内置预设同步：清理 ' + cleaned + ' 个旧版，注入 ' + added + ' 个新版');
            this.save();
        }
    },

    // 把内置预设克隆为用户的"我的预设"（可改）
    // 复用 parsePreset 把内置预设序列化到内存里，再走一次标准的预设创建流程
    cloneAsMyPreset: function(builtinId) {
        var source = window.getBuiltInPresetById ? window.getBuiltInPresetById(builtinId) : null;
        if (!source) {
            UI.toast('未找到内置预设：' + builtinId);
            return;
        }

        // 深拷贝 source，避免污染内置
        var cloned = JSON.parse(JSON.stringify(source));
        // 改写标识：变成用户预设
        delete cloned._isBuiltin;
        delete cloned.builtinId;
        cloned.name = source.name + ' · 我的版本';
        cloned.description = '基于「' + source.name + '」克隆，可自由修改';
        cloned.clonedFrom = builtinId;
        cloned.clonedAt = Date.now();

        // 加到预设列表最前面
        this.presets.unshift(cloned);
        if (this.presets.length > 30) this.presets = this.presets.slice(0, 30);
        this.save();
        this.renderPresetList();
        UI.toast('已克隆为「' + cloned.name + '」，可自由修改');
        // 自动加载克隆版本
        try {
            this.loadPreset(0);
        } catch (e) {
            console.warn('[PresetManager] 克隆后加载失败:', e);
        }
    },

    // 显示内置预设选择器
    showBuiltInPicker: function() {
        if (!window.BUILT_IN_PRESETS) {
            UI.toast('内置预设未加载');
            return;
        }

        var cards = window.BUILT_IN_PRESETS.map(function(bp) {
            var id = escapeHtml(bp.builtinId);
            var name = escapeHtml(bp.name);
            var desc = escapeHtml(bp.description || '');
            var params = bp.params || {};
            var tagParts = [];
            tagParts.push('<span style="background:#8b5cf6;color:#fff;">Temp:' + params.temperature + '</span>');
            tagParts.push('<span style="background:#6366f1;color:#fff;">TopP:' + params.top_p + '</span>');
            tagParts.push('<span style="background:#64748b;color:#fff;">Max:' + (params.max_tokens || 4096) + '</span>');
            var tagsHtml = '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px;">' +
                tagParts.map(function(t) { return '<span style="font-size:9px;padding:1px 5px;border-radius:3px;">' + t + '</span>'; }).join('') + '</div>';

            return '<div class="pearl-card" style="padding:12px;margin-bottom:10px;border-left:3px solid var(--accent);">' +
                '<div style="display:flex;justify-content:space-between;align-items:start;">' +
                '<div style="flex:1;min-width:0;">' +
                '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">' + name + '</div>' +
                '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px;line-height:1.5;">' + desc + '</div>' +
                tagsHtml +
                '</div>' +
                '<div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;margin-left:10px;">' +
                '<button class="btn-primary" data-builtin-pick="' + id + '" style="font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer;">直接使用</button>' +
                '<button class="btn-secondary" data-builtin-clone="' + id + '" style="font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer;">克隆为我的</button>' +
                '</div>' +
                '</div>' +
                '</div>';
        }).join('');

        var html =
            '<div style="padding:16px;max-height:80vh;overflow-y:auto;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:8px;">' +
            '<b style="font-size:15px;">选择内置预设</b>' +
            '<button class="circle-btn" onclick="UI.hideModal(this.closest(\'.modal-overlay\').id)" style="width:24px;height:24px;padding:0;">×</button>' +
            '</div>' +
            '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:10px;line-height:1.5;">' +
            '4 套官方精工预设，按"风格基调"分类（题材自适应古风/现代/任何世界观）。<br>' +
            '<b>直接使用</b>：只读加载，玩家不可改 prompt。<br>' +
            '<b>克隆为我的</b>：复制成你的预设，可自由修改。' +
            '</div>' +
            cards +
            '</div>';

        UI.createModal({ html: html });

        // 事件委托
        setTimeout(function() {
            var overlay = document.querySelector('.modal-overlay:last-of-type');
            if (!overlay) return;
            overlay.addEventListener('click', function(e) {
                var pickBtn = e.target.closest('[data-builtin-pick]');
                if (pickBtn) {
                    e.stopPropagation();
                    var id = pickBtn.dataset.builtinPick;
                    var bp = window.getBuiltInPresetById(id);
                    if (bp) {
                        // 把内置预设直接设为当前（不持久化到 presets 列表，因为是只读）
                        // 方案：把内置预设先 unshift 到 presets 头部（_isBuiltin 标记）
                        // 但 _injectBuiltInPresets 已经会注入，这里直接 find + load
                        var idx = -1;
                        for (var i = 0; i < PresetManager.presets.length; i++) {
                            if (PresetManager.presets[i].builtinId === id) { idx = i; break; }
                        }
                        if (idx >= 0) {
                            PresetManager.loadPreset(idx);
                            UI.hideModal(overlay.id);
                            UI.toast('已加载「' + bp.name + '」（只读，可随时克隆为我的）');
                        } else {
                            // 兜底：注入一次再加载
                            PresetManager._injectBuiltInPresets();
                            UI.toast('请重新选择');
                        }
                    }
                    return;
                }
                var cloneBtn = e.target.closest('[data-builtin-clone]');
                if (cloneBtn) {
                    e.stopPropagation();
                    PresetManager.cloneAsMyPreset(cloneBtn.dataset.builtinClone);
                    UI.hideModal(overlay.id);
                }
            });
        }, 50);
    },

    // 从localStorage加载预设列表
    load: function() {
        try {
            var data = Storage.getJSON(Storage.KEYS.API_PRESETS, []);
            var arr = Array.isArray(data) ? data : [];
            // 过滤掉旧版"无 builtinId 的 _isBuiltin 残留"（早期月读/果实/蛾摩拉）
            // 保留：有 builtinId 的新版内置 + 用户自己的预设
            this.presets = arr.filter(function(p) { return p && !(p._isBuiltin && !p.builtinId); });
            if (this.presets.length !== arr.length) {
                this.save();
            }
        } catch(e) {
            console.error('[APIPresetManager] 读取apiPresets失败:', e);
            this.presets = [];
        }
    },

    // 保存预设列表
    save: function() {
        Storage.setJSON(Storage.KEYS.API_PRESETS, this.presets);
        },


    // 加载当前参数
    loadCurrentParams: function() {
        var params = {};
        try {
            params = Storage.getJSON(Storage.KEYS.CURRENT_PARAMS, {});
            } catch(e) {
                console.error('[APIPresetManager] 读取currentParams失败:', e);
                params = {};
            }
        if (params.temperature !== undefined) this.currentParams.temperature = params.temperature;
        if (params.top_p !== undefined) this.currentParams.top_p = params.top_p;
        if (params.top_k !== undefined) this.currentParams.top_k = params.top_k;
        if (params.frequency_penalty !== undefined) this.currentParams.frequency_penalty = params.frequency_penalty;
        if (params.presence_penalty !== undefined) this.currentParams.presence_penalty = params.presence_penalty;
        if (params.max_tokens !== undefined) this.currentParams.max_tokens = params.max_tokens;
        if (params.tool_reasoning_mode !== undefined) this.currentParams.tool_reasoning_mode = params.tool_reasoning_mode;
        this.syncParamsToUI();
        },

    // 保存当前参数
    saveCurrentParams: function() {
        Storage.setJSON(Storage.KEYS.CURRENT_PARAMS, this.currentParams);
        },

    // 数值参数配置表：统一驱动 syncParamsToUI / syncParamsFromUI
    // type: 'float' 用 parseFloat，'int' 用 safeInt；def 为读取失败时的默认值
    // valId: 可选的数值显示元素 id（无则不更新显示）
    _PARAM_CONTROLS: [
        { param: 'temperature',       elId: 'presetTemp',       valId: 'presetTempValue',       type: 'float', def: 0.8 },
        { param: 'top_p',             elId: 'presetTopP',       valId: 'presetTopPValue',       type: 'float', def: 0.9 },
        { param: 'frequency_penalty', elId: 'presetFreqPen',    valId: 'presetFreqPenValue',    type: 'float', def: 0 },
        { param: 'presence_penalty',  elId: 'presetPresPen',    valId: 'presetPresPenValue',    type: 'float', def: 0 },
        { param: 'max_tokens',        elId: 'presetMaxTokens',                                  type: 'int',   def: DEFAULT_MAX_TOKENS },
        { param: 'top_k',             elId: 'presetTopK',                                       type: 'int',   def: 0 },
        { param: 'min_p',             elId: 'presetMinP',       valId: 'presetMinPValue',       type: 'float', def: 0 },
        { param: 'repeat_penalty',    elId: 'presetRepeatPen',  valId: 'presetRepeatPenValue',  type: 'float', def: 1.1 }
    ],

    // 同步参数到UI
    syncParamsToUI: function() {
        var self = this;
        this._PARAM_CONTROLS.forEach(function(c) {
            var el = document.getElementById(c.elId);
            if (!el) return;
            var v = self.currentParams[c.param];
            // 保持与原逻辑一致：min_p/repeat_penalty 用 || 兜底默认值，其余直接取值
            if (v === undefined || v === null) v = c.def;
            if (c.param === 'min_p' || c.param === 'repeat_penalty') v = v || c.def;
            el.value = v;
            if (c.valId) {
                var valEl = document.getElementById(c.valId);
                if (valEl) valEl.textContent = v;
            }
        });
        // Sync presetStreamToggle display state
        var streamToggle = document.getElementById('presetStreamToggle');
        if (streamToggle) {
            if (this.currentParams.stream !== false) {
                streamToggle.classList.add('checked');
            } else {
                streamToggle.classList.remove('checked');
            }
        }
        // 同步游戏设置的流式开关
        gameState.useStream = this.currentParams.stream !== false;
    },
    syncParamsFromUI: function() {
        var self = this;
        this._PARAM_CONTROLS.forEach(function(c) {
            var el = document.getElementById(c.elId);
            if (!el) return;
            if (c.type === 'int') {
                self.currentParams[c.param] = safeInt(el.value, c.def);
            } else {
                self.currentParams[c.param] = parseFloat(el.value) || c.def;
            }
        });
        // Read presetStreamToggle state
        var streamToggle = document.getElementById('presetStreamToggle');
        if (streamToggle) {
            this.currentParams.stream = streamToggle.classList.contains('checked');
        }
        // 同步游戏设置的流式开关
        gameState.useStream = this.currentParams.stream !== false;

        this.saveCurrentParams();

        // 【同步】预设max_tokens修改后，同步到设置页面的"剧情长度"和gameState
        if (typeof _syncMaxTokens === 'function') {
            _syncMaxTokens(this.currentParams.max_tokens);
        } else {
            // fallback：直接同步
            var storyLengthEl = document.getElementById('settingStoryLength');
            if (storyLengthEl) {
                storyLengthEl.value = this.currentParams.max_tokens || 4096;
            }
            if (typeof gameState !== 'undefined') {
                gameState.maxTokens = this.currentParams.max_tokens || 4096;
            }
        }
    },

    // 绑定单个 click 事件（元素不存在时静默跳过）
    // 统一收口 var XBtn = document.getElementById('X'); if (XBtn) XBtn.addEventListener('click', ...) 重复模式
    _bindClick: function(id, handler) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    },

    // 绑定事件
    bindEvents: function() {
        // 修复：防止重复绑定
        if (this._eventsBound) return;
        this._eventsBound = true;
        const self = this;

        // 主页面 / 剧情页按钮 - 打开预设管理
        this._bindClick('btnMenuPresets', function() { PresetManager.showModal(); });
        this._bindClick('btnPresetsHeader', function() { self.showModal(); });

        // 导入按钮（需配合 fileInput change 事件）
        var importBtn = document.getElementById('btnPresetImport');
        var fileInput = document.getElementById('presetFileInput');
        if (importBtn && fileInput) {
            importBtn.addEventListener('click', function() { fileInput.click(); });
            fileInput.addEventListener('change', function(e) {
                if (e.target.files[0]) self.importFromFile(e.target.files[0]);
                fileInput.value = '';
            });
        }

        // 导出按钮
        this._bindClick('btnPresetExport', function() {
            var idx = PresetManager.currentPresetIndex || 0;
            PresetManager.exportPreset(idx);
        });

        // 保存当前为预设
        this._bindClick('btnPresetSaveCurrent', function() {
            UI.showModal('presetSaveNameModal');
            document.getElementById('presetSaveNameInput').value = '';
            document.getElementById('presetSaveNameInput').focus();
        });

        // 清空全部预设
        this._bindClick('btnPresetClearAll', function() { self.clearAllPresets(); });

        // 确认保存
        this._bindClick('btnPresetSaveConfirm', function() {
            var name = document.getElementById('presetSaveNameInput').value.trim();
            if (!name) {
                UI.toast('请输入预设名称');
                return;
            }
            self.saveCurrentAsPreset(name);
            UI.hideModal('presetSaveNameModal');
        });

        // 应用参数按钮
        this._bindClick('btnPresetApplyParams', function() {
            self.syncParamsFromUI();
            UI.toast('参数已应用');
        });

        // 参数调节区域折叠/展开
        // 修复：初始状态是 class="hidden"（CSS 隐藏），不是 style.display="none"
        // 必须同时检查 class，否则点一次就反向关闭
        var paramsToggle = document.getElementById('presetParamsToggle');
        var paramsContent = document.getElementById('presetParamsContent');
        var paramsToggleIcon = document.getElementById('presetParamsToggleIcon');
        if (paramsToggle && paramsContent && paramsToggleIcon) {
            paramsToggle.addEventListener('click', function() {
                var isHidden = paramsContent.classList.contains('hidden')
                    || paramsContent.style.display === 'none';
                if (isHidden) {
                    paramsContent.classList.remove('hidden');
                    paramsContent.style.display = '';
                    paramsToggleIcon.style.transform = 'rotate(180deg)';
                    paramsToggleIcon.textContent = '▲';
                } else {
                    paramsContent.classList.add('hidden');
                    paramsContent.style.display = 'none';
                    paramsToggleIcon.style.transform = 'rotate(0deg)';
                    paramsToggleIcon.textContent = '▼';
                }
            });
        }

        // 滑块实时更新显示值
        ['presetTemp', 'presetTopP', 'presetFreqPen', 'presetPresPen', 'presetTopK', 'presetMinP', 'presetRepeatPen'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', function() {
                    var valueEl = document.getElementById(id + 'Value');
                    if (valueEl) valueEl.textContent = el.value;
                });
            }
        });

        // 预设详情返回按钮
        this._bindClick('btnBackToPresetList', function() { UI.hideModal('presetDetailModal'); });

        // 全部开启/关闭按钮
        this._bindClick('presetToggleAll', function() { self._toggleAllPrompts(); });
    },

    // 显示模态框
    showModal: function() {
        this.syncParamsToUI();
        this.renderPresetList();
        UI.showModal('presetManagerModal');
        },

    // 渲染预设列表
    renderPresetList: function() {
        var container = document.getElementById('presetManagerList');
        var currentInfo = document.getElementById('currentPresetInfo');
        var currentName = document.getElementById('currentPresetName');
        var currentParams = document.getElementById('currentPresetParams');

        if (!container) return;

        if (this.presets.length === 0) {
            if (currentInfo) currentInfo.style.display = 'none';
            container.innerHTML =
                '<div class="empty-state" style="padding:24px 12px;">' +
                '<div style="font-size:13px;margin-bottom:12px;color:var(--text-secondary);">暂无预设</div>' +
                '<div style="display:flex;flex-direction:column;gap:8px;align-items:center;">' +
                '<button class="btn-primary" onclick="PresetManager.showBuiltInPicker()" style="padding:8px 16px;border-radius:8px;cursor:pointer;">选择内置预设</button>' +
                '<button class="btn-secondary" onclick="document.getElementById(\'presetFileInput\').click()" style="padding:6px 14px;border-radius:8px;cursor:pointer;font-size:11px;">导入酒馆预设</button>' +
                '</div>' +
                '<div style="font-size:10px;margin-top:10px;color:var(--text-tertiary);line-height:1.5;">4 套官方精工预设（抒情/激进/平缓/标准）<br>题材自适应古风/现代/任何世界观</div>' +
                '</div>';
            return;
        }

        // 显示当前参数
        if (currentInfo) {
            currentInfo.style.display = 'block';
            if (currentName) currentName.textContent = (this.currentPresetIndex >= 0 && this.currentPresetIndex < this.presets.length) ? this.presets[this.currentPresetIndex].name : '自定义参数';
            if (currentParams) {
                var cp = this.currentParams;
                var paramParts = [];
                paramParts.push('Temp:' + cp.temperature);
                paramParts.push('TopP:' + cp.top_p);
                if (cp.top_k && cp.top_k > 0) paramParts.push('TopK:' + cp.top_k);
                if (cp.frequency_penalty !== 0) paramParts.push('FreqPen:' + cp.frequency_penalty);
                if (cp.presence_penalty !== 0) paramParts.push('PresPen:' + cp.presence_penalty);
                paramParts.push('Max:' + cp.max_tokens);
                currentParams.textContent = paramParts.join(' | ');
            }
    }

    var html = '';
    const self = this;
    this.presets.forEach(function(preset, idx) {
        var isActive = idx === self.currentPresetIndex;
        var params = preset.params || {};
        var promptCount = (preset.prompts && preset.prompts.length) || 0;
        var enabledPromptCount = 0;
        if (preset.prompts) {
            preset.prompts.forEach(function(p) { if (p.enabled !== false) enabledPromptCount++; });
        }

    // 构建参数标签

    var tags = [];
    if (params.temperature != null) tags.push('<span style="background:#8b5cf6;color:#fff;">Temp:' + escapeHtml(params.temperature) + '</span>');
    if (params.top_p != null) tags.push('<span style="background:#6366f1;color:#fff;">TopP:' + escapeHtml(params.top_p) + '</span>');
    if (params.top_k && params.top_k > 0) tags.push('<span style="background:#f59e0b;color:#fff;">TopK:' + escapeHtml(params.top_k) + '</span>');
    if (params.min_p && params.min_p > 0) tags.push('<span style="background:#10b981;color:#fff;">MinP:' + escapeHtml(params.min_p) + '</span>');
    if (params.frequency_penalty != null && params.frequency_penalty !== 0) tags.push('<span style="background:var(--danger);color:#fff;">FreqPen:' + escapeHtml(params.frequency_penalty) + '</span>');
    if (params.presence_penalty != null && params.presence_penalty !== 0) tags.push('<span style="background:#0ea5e9;color:#fff;">PresPen:' + escapeHtml(params.presence_penalty) + '</span>');
    if (params.max_tokens) tags.push('<span style="background:#64748b;color:#fff;">Max:' + escapeHtml(params.max_tokens) + '</span>');
    if (promptCount > 0) tags.push('<span style="background:var(--accent);color:#fff;">提示词:' + enabledPromptCount + '/' + promptCount + '</span>');

    var tagsHtml = tags.length > 0
    ? '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px;">' + tags.map(function(t) { return '<span style="font-size:9px;padding:1px 5px;border-radius:3px;">' + t + '</span>'; }).join('') + '</div>'
    : '';

    html += '<div class="pearl-card" style="padding:10px;margin-bottom:10px;cursor:pointer;border:' + (isActive ? '2px solid var(--accent)' : 'none') + ';" data-preset-idx="' + idx + '">' +
    '<div style="display:flex;justify-content:space-between;align-items:start;">' +
    '<div style="flex:1;min-width:0;" data-preset-load="' + idx + '">' +
    '<div style="font-size:13px;font-weight:600;">' + escapeHtml(preset.name) + (isActive ? ' ✓' : '') + '</div>' +
    tagsHtml +
    '</div>' +
    '<div style="display:flex;gap:6px;flex-shrink:0;margin-left:8px;align-items:center;">' +
    (promptCount > 0 ? '<span class="preset-detail-btn" data-idx="' + idx + '" style="font-size:11px;padding:3px 8px;background:transparent;color:var(--accent);border:1px solid var(--accent);border-radius:6px;cursor:pointer;white-space:nowrap;" title="查看提示词条目">详情</span>' : '') +
    '<span class="preset-load-btn" data-preset-load="' + idx + '" style="font-size:11px;padding:3px 8px;background:' + (isActive ? 'var(--accent)' : 'transparent') + ';color:' + (isActive ? '#fff' : 'var(--accent)') + ';border:1px solid var(--accent);border-radius:6px;cursor:pointer;white-space:nowrap;' + (isActive ? 'font-weight:500;' : '') + '" title="加载此预设">加载</span>' +
    '<span class="preset-delete-btn" data-idx="' + idx + '" style="font-size:11px;padding:3px 8px;background:var(--bg);color:var(--danger);border:1px solid var(--danger);border-radius:6px;cursor:pointer;white-space:nowrap;" title="删除此预设">删除</span>' +
    '</div>' +
    '</div>' +
    '</div>';
    });

    container.innerHTML = html;

    // 绑定加载和删除事件
    // 使用事件委托
    container.onclick = function(e) {
        var detailEl = e.target.closest('.preset-detail-btn');
        if (detailEl) {
            e.stopPropagation();
            self.openPresetDetail(parseInt(detailEl.dataset.idx, 10));
            return;
        }
    var loadEl = e.target.closest('[data-preset-load]');
    if (loadEl) {
        e.stopPropagation();
        self.loadPreset(parseInt(loadEl.dataset.presetLoad, 10));
        return;
    }
    var deleteEl = e.target.closest('.preset-delete-btn');
    if (deleteEl) {
        e.stopPropagation();
        self.deletePreset(parseInt(deleteEl.dataset.idx, 10));
        return;
    }
    // 点击卡片其他区域也加载
    var cardEl = e.target.closest('[data-preset-idx]');
    if (cardEl) {
        self.loadPreset(parseInt(cardEl.dataset.presetIdx, 10));
    }
    };
    },

    // 导入酒馆预设
    importFromFile: function(file) {
        const self = this;
        UI.readJSONFile(file).then(function(data) {
            try {
                var imported = self.parsePreset(data, file.name);
                if (imported) {
                    // 新导入的放在最前面，并限制总数为 30；避免 push 后 slice 把新预设截掉
                    self.presets.unshift(imported);
                    if (self.presets.length > 30) self.presets = self.presets.slice(0, 30);

                    // 先解析正则脚本，再 loadPreset（否则 loadPreset 读原始格式，正则静默失效）
                    if (imported.regexScripts && imported.regexScripts.length > 0) {
                        try {
                            imported._parsedRegexScripts = RegexManager.parseRegexScripts(imported.regexScripts);
                        } catch(regexErr) {
                            console.error('[PresetManager] 正则脚本解析失败:', regexErr);
                        }
                    }

                    self.save();
                    self.renderPresetList();

                    // 自动加载导入的预设（应用参数和提示词）
                    var newIdx = 0;
                    try {
                        self.loadPreset(newIdx);
                        } catch(loadErr) {
                        console.error('[PresetManager] loadPreset 失败:', loadErr);
                        UI.toast('预设已导入，但加载失败: ' + translateError(loadErr.message));
                        }

                    // 提示导入的提示词数量
                    if (imported.prompts && imported.prompts.length > 0) {
                        UI.toast('已导入 ' + imported.prompts.length + ' 个提示词条目');
                    }

                    // 正则脚本提示（已在上面解析完成）
                    if (imported.regexScripts && imported.regexScripts.length > 0) {
                        UI.toast('已导入 ' + imported.regexScripts.length + ' 个正则脚本（预设绑定）');
                    }

                UI.toast('成功导入预设: ' + imported.name);
                } else {
                UI.toast('无法识别的预设格式');
            }
        } catch(err) {
        console.error('[PresetManager] 导入失败，完整错误堆栈:', err);
        UI.toast('导入失败: ' + translateError(err.message));
        }
    }).catch(function(err) {
        console.error('[PresetManager] 读取文件失败:', err);
        UI.toast('文件读取失败: ' + translateError(err.message));
    });
    },

    // 解析酒馆预设格式
    parsePreset: function(data, fileName) {
        // 辅助函数：安全取值，避免 0 被 falsy 吞掉
        // 取第一个非 null/undefined 的候选值，全为空则返回 defaultValue。
        // 原实现用 arguments.length 重载（3参/4参两种语义），易误用。
        function safeNum() {
            var args = Array.prototype.slice.call(arguments);
            if (args.length === 0) return undefined;
            var defaultValue = args[args.length - 1];
            for (var i = 0; i < args.length - 1; i++) {
                if (args[i] != null) return args[i];
            }
            return defaultValue;
        }
        // 提取参数（支持多种字段名，兼容 Chat Completion 和 Text Completion 两种格式）
        // 包含所有酒馆支持的采样参数
        var params = {
            temperature: safeNum(data.temp, data.temperature, 0.8),
            top_p: safeNum(data.top_p, null, 0.9),
            top_k: safeNum(data.top_k, null, 0),
            frequency_penalty: safeNum(data.freq_pen, data.frequency_penalty, 0),
            presence_penalty: safeNum(data.pres_pen, data.presence_pen, data.presence_penalty, 0),
            max_tokens: safeNum(data.openai_max_tokens, data.max_tokens, 4096),
            max_context: safeNum(data.openai_max_context, data.max_context, DEFAULT_CONTEXT_SIZE),
            min_p: safeNum(data.min_p, null, 0),
            top_a: safeNum(data.top_a, null, 0),
            repetition_penalty: safeNum(data.repetition_penalty, data.rep_pen, 1),
            // 新增：酒馆支持的额外采样参数
            typical_p: safeNum(data.typical_p, null, 1),
            min_length: safeNum(data.min_length, null, 0),
            max_time: safeNum(data.max_time, null, null),
            // 【改进1】stop_sequences直接使用字符串值，不用safeNum
            stop_sequences: data.stop_seq || data.stop_sequence || data.stop || data.stop_newlines || null,
            // 新增：Mirostat采样参数
            mirostat_mode: safeNum(data.mirostat_mode, null, 0),
            mirostat_tau: safeNum(data.mirostat_tau, null, 5.0),
            mirostat_eta: safeNum(data.mirostat_eta, null, 0.1),
            // 新增：重复惩罚范围
            repetition_penalty_range: safeNum(data.repetition_penalty_range, data.rep_pen_range, null, 0),
            repetition_penalty_slope: safeNum(data.repetition_penalty_slope, data.rep_pen_slope, null, 0),
            // 新增：其他高级参数
            tail_free_sampling: safeNum(data.tail_free_sampling, data.tfs, null, 1),
            epsilon_cutoff: safeNum(data.epsilon_cutoff, null, 0),
            eta_cutoff: safeNum(data.eta_cutoff, null, 0),
            dry_multiplier: safeNum(data.dry_multiplier, null, 0),
            dry_range: safeNum(data.dry_range, null, 0),
            dry_allowed_length: safeNum(data.dry_allowed_length, null, 2),
            xtc_probability: safeNum(data.xtc_probability, null, 0),
            xtc_threshold: safeNum(data.xtc_threshold, null, 0),
            // 新增：额外选项
            seed: safeNum(data.seed, null, null),
            response_format: safeNum(data.response_format, null, null),
            modalities: safeNum(data.modalities, null, null),
            tool_reasoning_mode: data.tool_reasoning_mode || 'disabled',
            // 部分推理模型的思考深度参数
            reasoning_effort: data.reasoning_effort || null,
            // 酒馆预设行为控制参数
            show_thoughts: data.show_thoughts !== undefined ? data.show_thoughts : null,
            use_sysprompt: data.use_sysprompt !== undefined ? data.use_sysprompt : true,
            squash_system_messages: data.squash_system_messages || false,
            continue_prefill: data.continue_prefill || false,
            continue_postfix: data.continue_postfix || ' ',
            assistant_prefill: data.assistant_prefill || '',
            assistant_impersonation: data.assistant_impersonation || '',
            function_calling: data.function_calling || false,
            verbosity: data.verbosity || 'auto'
            };

        // [T1-P1-13] 解析酒馆 V3 顶层 custom_variables / sampler_order / logit_bias
        if (data.custom_variables && typeof data.custom_variables === 'object' && !Array.isArray(data.custom_variables)) {
            params.custom_variables = Object.assign({}, data.custom_variables);
        }
        if (Array.isArray(data.sampler_order)) {
            params.sampler_order = data.sampler_order.slice();
        }
        if (data.logit_bias && typeof data.logit_bias === 'object' && !Array.isArray(data.logit_bias)) {
            params.logit_bias = Object.assign({}, data.logit_bias);
        }

        // 预设名称
        var name = data.name || data.preset || (fileName ? fileName.replace(/\.json$/i, '') : ('导入预设 ' + new Date().toLocaleDateString()));

        // 提取 prompts 数组（酒馆预设的核心内容）
        var importedPrompts = [];
        // [T1-P1-10] 解析酒馆 V4 openai_prompts 字段（OpenAI 风格预设）
        if (data.openai_prompts && Array.isArray(data.openai_prompts)) {
            data.openai_prompts.forEach(function(p) {
                if (!p || !p.content) return;
                importedPrompts.push({
                    identifier: p.name || '',
                    name: p.name || '',
                    role: p.role || 'system',
                    content: p.content,
                    injection_position: 0,
                    injection_depth: 4,
                    injection_order: p.injection_order != null ? p.injection_order : 100,
                    system_prompt: (p.name === 'main'),
                    enabled: p.enabled !== false,
                    forbid_overrides: !!p.forbid_overrides,
                    injection_trigger: p.injection_trigger || [],
                    marker: !!p.marker
                });
            });
        }
        if (data.prompts && Array.isArray(data.prompts)) {
            // 获取 prompt_order 中的启用状态和排列顺序
            // prompt_order 中可能使用 identifier（UUID）或 name 来引用 prompt
            // 需要同时支持两种匹配方式
            var promptEnabledMap = {};
            var promptNameMap = {};

            var promptOrderIndex = {};  // identifier/name -> 在 orderArr 中的位置
            if (data.prompt_order && Array.isArray(data.prompt_order) && data.prompt_order.length > 0) {

                var _curCharId = (typeof gameState !== 'undefined' && gameState) ? (gameState.currentCharacterId || (gameState.character && gameState.character.id) || (Array.isArray(gameState.characters) && gameState.characters[0] && gameState.characters[0].id) || null) : null;
                var orderGroup = _findPromptOrderGroup(data, _curCharId);
                var orderArr = orderGroup && orderGroup.order;
                if (orderArr && Array.isArray(orderArr)) {
                    orderArr.forEach(function(item, idx) {
                        // 同时按 identifier 和 name 建立映射
                        if (item.identifier) {
                            promptEnabledMap[item.identifier] = item.enabled;
                            promptOrderIndex[item.identifier] = idx;
                        }
                    if (item.name) {
                        promptNameMap[item.name] = item.enabled;
                        if (!(item.name in promptOrderIndex)) {
                            promptOrderIndex[item.name] = idx;
                        }
                }
            });
    }
    }
    // 解析所有 prompt（包括禁用的），但标记其启用状态
    // 用户可以选择性地开启禁用的条目
    data.prompts.forEach(function(p) {
        if (!p) return;
        // marker=true 的提示词保留（用于世界书注入位置标记）
        // 不再跳过，让 _applyPromptsToSystemPrompt 处理
        // 获取启用状态：优先用 identifier 匹配，其次用 name，最后用自身的 enabled 字段
        var isEnabled = false;
        if (p.identifier && (p.identifier in promptEnabledMap)) {
            isEnabled = promptEnabledMap[p.identifier];
            } else if (p.name && (p.name in promptNameMap)) {
            isEnabled = promptNameMap[p.name];
            } else {
            isEnabled = (p.enabled !== false);
        }
    // 跳过没有实际内容的（即使是启用的）
    if (!p.content || typeof p.content !== 'string' || p.content.trim() === '') return;
    // 跳过纯注释内容（被 {{// ... }} 包裹的）
    var trimmedContent = p.content.trim();
    if (trimmedContent.startsWith('{{//') && trimmedContent.endsWith('}}')) return;
    // 跳过酒馆内置标记位
    // 注意：enhanceDefinitions 是一个有效的提示词，保留其内容
    // 来源：SillyTavern PromptManager.js - enhanceDefinitions 会增强角色定义

    // 这些标记位（personaDescription, charDescription等）在预设中标记了注入位置
    // 保留它们可以让 _applyPromptsToSystemPrompt 正确处理
    var builtinMarkers = ['chatHistory', 'worldInfoBefore', 'worldInfoAfter'];
    // 注意：personaDescription, charDescription, charPersonality, scenario, dialogueExamples 不再跳过
    if (builtinMarkers.indexOf(p.identifier) !== -1 && (!p.content || p.content.trim() === '')) return;

    // enhanceDefinitions 是一个有效的提示词，需要保留
    // 它的内容会增强角色定义（如添加角色扮演指导等）
    if (p.identifier === 'enhanceDefinitions' && (!p.content || p.content.trim() === '')) {
        // 如果 enhanceDefinitions 没有内容，才跳过
        return;
    }

    // 特殊处理 system_prompt 标记的 prompt
    // jailbreak: 越狱提示词（放在聊天历史之后）
    // main: 主系统提示词（标记为系统提示词）
    // nsfw: NSFW提示词（标记为越狱提示词）

    // Free-Script原生预设中nsfw可能是身份定义而非越狱
    if ((p.identifier === 'jailbreak' || p.identifier === 'nsfw') && p.system_prompt !== true) {
        importedPrompts.push({
            identifier: p.identifier || '',
            name: p.name || '',
            role: p.role || 'system',
            content: p.content,
            injection_position: p.injection_position || 0,
            injection_depth: p.injection_depth || 4,

                    injection_order: (p.injection_order != null)
                    ? p.injection_order
                    : (promptOrderIndex[p.identifier] != null ? promptOrderIndex[p.identifier] : (promptOrderIndex[p.name] != null ? promptOrderIndex[p.name] : 100)),
                    system_prompt: !!p.system_prompt,
                    isJailbreak: true,  // 标记为越狱提示词，放在聊天历史之后
                    enabled: isEnabled,  // 保留原有的启用状态
            // 酒馆V2新增字段
            forbid_overrides: !!p.forbid_overrides,
            injection_trigger: p.injection_trigger || [],
            // [T1-P1-11] 显式保留 marker 字段（V2 锚点：chatHistory/worldInfoBefore/worldInfoAfter/enhanceDefinitions）
            marker: !!p.marker
            });
        return;
    }

    importedPrompts.push({
        identifier: p.identifier || '',
        name: p.name || '',
        role: p.role || 'system',
        content: p.content,
        injection_position: p.injection_position || 0,
        injection_depth: p.injection_depth || 4,

                    injection_order: (p.injection_order != null)
                    ? p.injection_order
                    : (promptOrderIndex[p.identifier] != null ? promptOrderIndex[p.identifier] : (promptOrderIndex[p.name] != null ? promptOrderIndex[p.name] : 100)),
                    system_prompt: !!p.system_prompt,
                    enabled: isEnabled,  // 保留原有的启用状态
        // 酒馆V2新增字段
        forbid_overrides: !!p.forbid_overrides,
        injection_trigger: p.injection_trigger || [],
        // [T1-P1-11] 显式保留 marker 字段
        marker: !!p.marker
    });
    });


    // 酒馆中 data.prompts 的数组顺序不等于用户拖拽的排列顺序
    // 真正的排序由 prompt_order 决定，必须以此为准
    if (data.prompt_order && Array.isArray(data.prompt_order) && data.prompt_order.length > 0) {

        var _curCharId = (typeof gameState !== 'undefined' && gameState) ? (gameState.currentCharacterId || (gameState.character && gameState.character.id) || (Array.isArray(gameState.characters) && gameState.characters[0] && gameState.characters[0].id) || null) : null;
        var orderGroup = _findPromptOrderGroup(data, _curCharId);
        var orderArr = orderGroup && orderGroup.order;
        if (orderArr && Array.isArray(orderArr) && orderArr.length > 0) {
            // 建立 identifier/name -> 排序索引 的映射
            var sortOrderMap = {};
            orderArr.forEach(function(item, idx) {
                if (item.identifier) sortOrderMap[item.identifier] = idx;
                if (item.name && !(item.name in sortOrderMap)) sortOrderMap[item.name] = idx;
                });
            // 稳定排序：按 prompt_order 中的位置排列，不在 order 中的保持原相对顺序
            importedPrompts.sort(function(a, b) {
                var orderA = sortOrderMap[a.identifier] != null ? sortOrderMap[a.identifier] : (sortOrderMap[a.name] != null ? sortOrderMap[a.name] : 99999);
                var orderB = sortOrderMap[b.identifier] != null ? sortOrderMap[b.identifier] : (sortOrderMap[b.name] != null ? sortOrderMap[b.name] : 99999);
                return orderA - orderB;
                });
        }
    }
    }

    // 提取 extensions.regex_scripts 和 SPreset.RegexBinding.regexes
    // 去重：同一条正则可能同时存在于两个位置
    //
    // 【注释说明 - 正则脚本的两种来源】
    // 来源1: extensions.regex_scripts — 酒馆标准正则脚本存储位置
    //   这是 SillyTavern 核心代码识别的路径，正则扩展（Regex Extension）从这里读写预设正则
    //   参考：SillyTavern engine.js 中 getScriptsByType(SCRIPT_TYPES.PRESET) 的读取逻辑
    //   读取路径：preset.extensions.regex_scripts
    //
    // 来源2: extensions.SPreset.RegexBinding.regexes — 酒馆助手（TavernHelper）扩展的正则绑定
    //   这是第三方扩展 TavernHelper 的自定义字段，不是酒馆核心代码识别的路径
    //   TavernHelper 用它来管理预设绑定的正则脚本（合并/覆盖标准正则）
    //   大佬的预设如果使用了酒馆助手，正则可能同时存在于两个位置
    //   保留此路径是为了兼容使用酒馆助手的预设
    var importedRegex = [];
    var regexNameSet = {};
    function addRegexUnique(list) {
        if (!list || !Array.isArray(list)) return;
        list.forEach(function(r) {
            var rName = r.scriptName || r.name || '';
            if (!rName || !regexNameSet[rName]) {
                regexNameSet[rName] = true;
                importedRegex.push(r);
            }
        });
    }
    if (data.extensions && data.extensions.regex_scripts && Array.isArray(data.extensions.regex_scripts)) {
        addRegexUnique(data.extensions.regex_scripts);
    }
    // 来源2: 酒馆助手（TavernHelper）扩展的正则绑定路径
    // 注意：这不是酒馆核心路径，是 TavernHelper 第三方扩展使用的字段
    if (data.extensions && data.extensions.SPreset && data.extensions.SPreset.RegexBinding
    && data.extensions.SPreset.RegexBinding.regexes && Array.isArray(data.extensions.SPreset.RegexBinding.regexes)) {
        addRegexUnique(data.extensions.SPreset.RegexBinding.regexes);
    }

    // 保存 tavern_helper 脚本信息（酒馆助手扩展的JS脚本）
    var tavernHelperScripts = [];
    var tavernHelperPresetConfig = null;
    if (data.extensions && data.extensions.tavern_helper && data.extensions.tavern_helper.scripts) {
        tavernHelperScripts = data.extensions.tavern_helper.scripts;
    }

    if (data.extensions && data.extensions.tavern_helper && data.extensions.tavern_helper.data
    && data.extensions.tavern_helper.data.presets && data.extensions.tavern_helper.data.presets.default) {
        tavernHelperPresetConfig = data.extensions.tavern_helper.data.presets.default;
    }


    var entryGrouping = null;
    if (data.extensions && data.extensions.entryGrouping && Array.isArray(data.extensions.entryGrouping) && data.extensions.entryGrouping.length > 0) {
        entryGrouping = data.extensions.entryGrouping;
    }


    var entryStates = null;
    if (data.extensions && data.extensions.entryStates) {
        entryStates = data.extensions.entryStates;
    }


    var regexBindings = null;
    if (data.extensions && data.extensions.regexBindings) {
        regexBindings = data.extensions.regexBindings;
        // 将 regexBindings 转换为标准 regex_scripts 格式
        if (Array.isArray(regexBindings)) {
            regexBindings.forEach(function(rb) {
                if (!rb) return;
                if (rb.findRegex || rb.find) {
                    addRegexUnique([{
                        id: rb.id || ('regex_' + Math.random().toString(36).substr(2, 9)),
                        scriptName: rb.name || 'Regex Binding',
                        findRegex: rb.findRegex || rb.find,
                        replaceString: rb.replaceString || rb.replace || '',
                        placement: rb.placement || [1, 2],
                        disabled: rb.disabled || false,
                        runOnEdit: rb.runOnEdit !== false
                        }]);
                }
            });
    }
    }

    // 保存 SPreset 配置（预设绑定的扩展配置）
    var spresetConfig = data.extensions && data.extensions.SPreset ? data.extensions.SPreset : null;


    var spresetButtons = null;
    if (data.extensions && data.extensions.SPreset && data.extensions.SPreset.button && data.extensions.SPreset.button.buttons) {
        spresetButtons = data.extensions.SPreset.button.buttons;
    }


    // 提取小剧场配置（月读预设等）
    var theaterConfig = null;
    if (data.extensions && data.extensions.theater) {
        theaterConfig = data.extensions.theater;
    }

    // 提取世界书配置
    var worldInfoConfig = null;
    if (data.extensions && data.extensions.world_info) {
        worldInfoConfig = data.extensions.world_info;
    }

    // 提取角色卡配置
    var characterConfig = null;
    if (data.extensions && data.extensions.character) {
        characterConfig = data.extensions.character;
    }

    // 提取UI主题配置
    var themeConfig = null;
    if (data.extensions && data.extensions.theme) {
        themeConfig = data.extensions.theme;
    }

    // 提取自定义变量
    var customVariables = null;
    if (data.extensions && data.extensions.variables) {
        customVariables = data.extensions.variables;
    }

    // 提取触发器配置
    var triggers = null;
    if (data.extensions && data.extensions.triggers) {
        triggers = data.extensions.triggers;
    }

    // 提取扩展API配置
    var apiExtensions = null;
    if (data.extensions && data.extensions.api) {
        apiExtensions = data.extensions.api;
    }


    var wordCountConfig = null;
    if (tavernHelperPresetConfig) {
        wordCountConfig = {
            min: tavernHelperPresetConfig.wordCount ? tavernHelperPresetConfig.wordCount.min : undefined,
            max: tavernHelperPresetConfig.wordCount ? tavernHelperPresetConfig.wordCount.max : undefined,
            paragraphMin: tavernHelperPresetConfig.paragraphCount ? tavernHelperPresetConfig.paragraphCount.min : undefined,
            paragraphMax: tavernHelperPresetConfig.paragraphCount ? tavernHelperPresetConfig.paragraphCount.max : undefined,
            paragraphStyle: tavernHelperPresetConfig.paragraphStyle || undefined,
            perspective: tavernHelperPresetConfig.perspective || undefined,
            userPronoun: tavernHelperPresetConfig.userPronoun || undefined,
            takeover: tavernHelperPresetConfig.takeover || undefined,
            narrate: tavernHelperPresetConfig.narrate || undefined,
            aiMode: tavernHelperPresetConfig.aiMode || undefined,
            enabled: true
            };
        // 移除 undefined 字段
        Object.keys(wordCountConfig).forEach(function(k) { if (wordCountConfig[k] === undefined) delete wordCountConfig[k]; });
        // 如果没有任何有效字段，设为 null
        if (Object.keys(wordCountConfig).length <= 1) wordCountConfig = null;
    }

    return {
        name: name,
        params: params,
        prompts: importedPrompts,
        regexScripts: importedRegex,
        tavernHelperScripts: tavernHelperScripts,
        spresetConfig: spresetConfig,
        spresetButtons: spresetButtons,
        entryGrouping: entryGrouping,
        entryStates: entryStates,
        regexBindings: regexBindings,

        theaterConfig: theaterConfig,
        worldInfoConfig: worldInfoConfig,
        characterConfig: characterConfig,
        themeConfig: themeConfig,
        customVariables: customVariables,
        triggers: triggers,
        apiExtensions: apiExtensions,

        wordCountConfig: wordCountConfig,
        // 酒馆兼容：用户人设提示词
        impersonation_prompt: data.impersonation_prompt || '',
        continue_nudge_prompt: data.continue_nudge_prompt || '[Continue your last message...]',
        names_behavior: data.names_behavior != null ? data.names_behavior : 0,
        // 酒馆兼容：工具推理模式
        tool_reasoning_mode: data.tool_reasoning_mode || 'disabled',
        imported: true,
        time: Date.now()
        };
    },

    // 保存当前参数为预设
    saveCurrentAsPreset: function(name) {
        this.syncParamsFromUI();
        var preset = {
            name: name,
            params: Object.assign({}, this.currentParams),
            imported: false,
            time: Date.now()
            };

        // 检查是否已存在同名预设
        var existingIdx = -1;
        for (var i = 0; i < this.presets.length; i++) {
            if (this.presets[i].name === name) {
                existingIdx = i;
                break;
            }
        }

    if (existingIdx >= 0) {
        this.presets[existingIdx] = preset;
        } else {
        this.presets.unshift(preset);
    }

    if (this.presets.length > 30) this.presets = this.presets.slice(0, 30);
    this.currentPresetIndex = existingIdx >= 0 ? existingIdx : 0;
    this.save();
    this.renderPresetList();
    UI.toast('世界已保存: ' + name);
    },

    // ===== 预设详情（提示词条目管理） =====

    // 当前查看详情的预设索引
    _detailPresetIdx: -1,

    // 打开预设详情
    openPresetDetail: function(idx) {
        var preset = this.presets[idx];
        if (!preset) return;
        this._detailPresetIdx = idx;

        // 设置标题
        document.getElementById('presetDetailTitle').textContent = preset.name || '预设详情';

        // 渲染参数概览
        var paramsEl = document.getElementById('presetDetailParams');
        var params = preset.params || {};
        var paramParts = [];
        if (params.temperature != null) paramParts.push('Temperature: ' + params.temperature);
        if (params.top_p != null) paramParts.push('Top P: ' + params.top_p);
        if (params.top_k && params.top_k > 0) paramParts.push('Top K: ' + params.top_k);
        if (params.min_p && params.min_p > 0) paramParts.push('Min P: ' + params.min_p);
        if (params.frequency_penalty != null && params.frequency_penalty !== 0) paramParts.push('Freq Pen: ' + params.frequency_penalty);
        if (params.presence_penalty != null && params.presence_penalty !== 0) paramParts.push('Pres Pen: ' + params.presence_penalty);
        if (params.max_tokens) paramParts.push('Max Tokens: ' + params.max_tokens);
        if (params.max_context) paramParts.push('Max Context: ' + params.max_context);

        paramsEl.innerHTML = '<div style="font-size:11px;color:var(--text-secondary);line-height:1.6;">' + escapeHtml(paramParts.join(' &nbsp;|&nbsp; ')) + '</div>';

        // 渲染提示词条目列表
        this._renderPromptList();

        // 渲染预设附带的正则脚本列表
        this._renderPresetRegexList();

        UI.showModal('presetDetailModal');
        },

    // 渲染提示词条目列表（支持 entryGrouping 分组显示）
    _renderPromptList: function() {
        var preset = this.presets[this._detailPresetIdx];
        if (!preset) return;

        var container = document.getElementById('presetPromptList');
        var statsEl = document.getElementById('presetPromptStats');
        var toggleAllEl = document.getElementById('presetToggleAll');
        var prompts = preset.prompts || [];

        if (prompts.length === 0) {
            container.innerHTML = '<div class="empty-state">此预设没有提示词条目<br>仅包含API参数调节</div>';
            statsEl.textContent = '';
            toggleAllEl.style.display = 'none';
            return;
        }

        // 统计启用数量
        var enabledCount = 0;
        prompts.forEach(function(p) { if (p.enabled !== false) enabledCount++; });
        statsEl.textContent = enabledCount + '/' + prompts.length + ' 已启用';

        // 全部开启/全部关闭
        var allEnabled = enabledCount === prompts.length;
        toggleAllEl.textContent = allEnabled ? '全部关闭' : '全部开启';
        toggleAllEl.style.display = '';

        // 角色标签颜色
        var roleColors = { 'system': '#8b5cf6', 'user': '#10b981', 'assistant': '#f59e0b' };
        // 位置标签（使用酒馆标准 injection_depth 映射）
        var posLabels = { 0: '角色前', 1: '角色后', 2: '示例前', 3: '示例后', 4: 'AN顶部', 5: 'AN底部' };
        // injection_position 标签
        var ipLabels = { 0: '聊天前', 1: '聊天后' };


        var groupMap = {}; // identifier -> group name
        var groupOrder = []; // 保持分组顺序
        if (preset.entryGrouping && Array.isArray(preset.entryGrouping)) {
            preset.entryGrouping.forEach(function(group) {
                if (group.name && group.memberIdentifiers) {
                    groupOrder.push(group.name);
                    group.memberIdentifiers.forEach(function(id) {
                        groupMap[id] = group.name;
                        });
                }
            });
    }

    // 渲染单个 prompt 条目的HTML
    function renderPromptItem(p, i) {
        var isEnabled = p.enabled !== false;
        var roleName = (p.role || 'system');
        var roleColor = roleColors[roleName] || '#64748b';
        var posLabel = posLabels[p.injection_depth] || ('深度' + (p.injection_depth != null ? p.injection_depth : 4));
        if (p.injection_position === 1) posLabel = '聊天后';
        var name = p.name || p.identifier || ('提示条 #' + (i + 1));

        return '<div class="pearl-card" style="padding:8px 10px;margin-bottom:6px;cursor:pointer;opacity:' + (isEnabled ? '1' : '0.5') + ';border-left:3px solid ' + (isEnabled ? 'var(--success)' : 'var(--danger)') + ';" data-prompt-idx="' + i + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<div style="flex:1;min-width:0;" data-prompt-view="' + i + '">' +
        '<div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(name) + '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px;">' +
        '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:' + roleColor + ';color:#fff;">' + escapeHtml(roleName) + '</span>' +
        '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:var(--bg);color:var(--text-tertiary);border:1px solid var(--border);">' + posLabel + '</span>' +
        (p.marker ? '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;">标记</span>' : '') +
        '</div>' +
        '</div>' +
        '<div style="display:flex;gap:5px;flex-shrink:0;margin-left:8px;align-items:center;">' +
        '<span class="preset-prompt-toggle" data-idx="' + i + '" style="font-size:10px;padding:2px 7px;background:' + (isEnabled ? 'var(--success)' : 'transparent') + ';color:' + (isEnabled ? '#fff' : 'var(--success)') + ';border:1px solid var(--success);border-radius:6px;cursor:pointer;white-space:nowrap;">' + (isEnabled ? '已启用' : '已关闭') + '</span>' +
        '</div>' +
        '</div>' +
        '</div>';
    }

    var html = '';

    if (groupOrder.length > 0) {

        // 先收集未分组的 prompt
        var grouped = {}; // group name -> [indices]
        var ungrouped = [];
        groupOrder.forEach(function(gn) { grouped[gn] = []; });

        prompts.forEach(function(p, i) {
            var gName = groupMap[p.identifier] || groupMap[p.name];
            if (gName && grouped[gName]) {
                grouped[gName].push(i);
                } else {
                ungrouped.push(i);
            }
        });

    // 渲染每个分组
    var groupColors = ['#8b5cf6','#10b981','#f59e0b','var(--danger)','#3b82f6','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16','#06b6d4','#a855f7'];
    var gIdx = 0;
    groupOrder.forEach(function(gn) {
        var members = grouped[gn];
        if (!members || members.length === 0) return;
        var gColor = groupColors[gIdx % groupColors.length];
        var gEnabled = members.filter(function(mi){ return prompts[mi].enabled !== false; }).length;
        var isCollapsed = false; // 默认展开

        html += '<div class="pearl-card" style="margin-bottom:8px;overflow:hidden;">' +
        '<div class="preset-group-header" data-group="' + escapeHtml(gn) + '" style="padding:10px 12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,' + gColor + '11,' + gColor + '08);border-bottom:1px solid var(--border);">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span style="font-size:13px;font-weight:600;color:' + gColor + ';">' + escapeHtml(gn) + '</span>' +
        '<span style="font-size:10px;color:var(--text-tertiary);">' + gEnabled + '/' + members.length + '</span>' +
        '</div>' +
        '<span style="font-size:10px;color:var(--text-tertiary);transition:transform 0.2s;" class="group-arrow">▼</span>' +
        '</div>' +
        '<div class="preset-group-body" style="padding:6px 8px;' + (isCollapsed ? 'display:none;' : '') + '">';

        members.forEach(function(mi) {
            html += renderPromptItem(prompts[mi], mi);
            });

        html += '</div></div>';
        gIdx++;
        });

    // 渲染未分组的 prompt
    if (ungrouped.length > 0) {
        html += '<div style="font-size:11px;color:var(--text-tertiary);padding:6px 0 4px;border-top:1px solid var(--border);margin-top:4px;">其他提示条 (' + ungrouped.length + ')</div>';
        ungrouped.forEach(function(i) {
            html += renderPromptItem(prompts[i], i);
            });
    }
    } else {
    // 无分组信息，平铺显示（保持原有行为）
    prompts.forEach(function(p, i) {
        html += renderPromptItem(p, i);
        });
    }

    container.innerHTML = html;


    container.querySelectorAll('.preset-group-header').forEach(function(header) {
        header.addEventListener('click', function(e) {
            if (e.target.closest('[data-prompt-view]') || e.target.closest('.preset-prompt-toggle')) return;
            var body = header.nextElementSibling;
            var arrow = header.querySelector('.group-arrow');
            if (body.style.display === 'none') {
                body.style.display = '';
                arrow.style.transform = '';
                } else {
                body.style.display = 'none';
                arrow.style.transform = 'rotate(-90deg)';
            }
        });
    });

    // 事件委托
    const self = this;
    container.onclick = function(e) {
        // 点击内容区域查看详情
        var viewEl = e.target.closest('[data-prompt-view]');
        if (viewEl) {
            self._viewPromptContent(parseInt(viewEl.dataset.promptView, 10));
            return;
        }
    // 点击开关按钮
    var toggleEl = e.target.closest('.preset-prompt-toggle');
    if (toggleEl) {
        self._togglePrompt(parseInt(toggleEl.dataset.idx, 10));
        return;
    }
    };
    },

    // 切换单个提示条的启用状态
    _togglePrompt: function(promptIdx) {
        var preset = this.presets[this._detailPresetIdx];
        if (!preset || !preset.prompts || !preset.prompts[promptIdx]) return;

        var p = preset.prompts[promptIdx];
        p.enabled = p.enabled === false ? true : false;

        this.save();
        this._renderPromptList();
        this.renderPresetList();

        // 如果是当前加载的预设，重新应用提示词
        if (this._detailPresetIdx === this.currentPresetIndex) {
            this._applyPromptsToSystemPrompt(preset);
        }

        UI.toast(p.enabled !== false ? '已启用: ' + (p.name || p.identifier || '提示条') : '已关闭: ' + (p.name || p.identifier || '提示条'));
    },

    // 查看提示条完整内容
    _viewPromptContent: function(promptIdx) {
        var preset = this.presets[this._detailPresetIdx];
        if (!preset || !preset.prompts || !preset.prompts[promptIdx]) return;

        var p = preset.prompts[promptIdx];
        var posLabels = { 0: '角色前', 1: '角色后', 2: '示例前', 3: '示例后', 4: '深度注入', 5: '示例顶部', 6: '示例底部' };

        document.getElementById('promptContentTitle').textContent = p.name || p.identifier || ('提示条 #' + (promptIdx + 1));
        document.getElementById('promptContentMeta').innerHTML =
        '角色: ' + escapeHtml(p.role || 'system') +
        ' &nbsp;|&nbsp; 位置: ' + escapeHtml(posLabels[p.injection_position] || String(p.injection_position)) +
        ' &nbsp;|&nbsp; 深度: ' + (p.injection_depth != null ? p.injection_depth : 4) +
        ' &nbsp;|&nbsp; 排序: ' + (p.injection_order != null ? p.injection_order : 100) +
        ' &nbsp;|&nbsp; 状态: ' + (p.enabled !== false ? '已启用' : '已关闭');
        document.getElementById('promptContentText').textContent = p.content || '(空内容)';

        UI.showModal('promptContentModal');
        },

    // 渲染预设附带的正则脚本列表
    _renderPresetRegexList: function() {
        var container = document.getElementById('presetRegexList');
        var statsEl = document.getElementById('presetRegexStats');
        var preset = this.presets[this._detailPresetIdx];
        if (!container) return;

        if (!preset || !preset.regexScripts || preset.regexScripts.length === 0) {
            container.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:10px;">预设没有附带正则脚本</div>';
            if (statsEl) statsEl.textContent = '';
            return;
        }

        var regexes = preset.regexScripts;
        var enabledCount = 0;
        regexes.forEach(function(r) {
            if (r.disabled !== true && r.enabled !== false) enabledCount++;
            });

        if (statsEl) statsEl.textContent = enabledCount + '/' + regexes.length + ' 已启用';

        var html = '<div style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto;">';
        const self = this;
        regexes.forEach(function(r, idx) {
            var isEnabled = r.disabled !== true && r.enabled !== false;
            var placementLabels = self._getPlacementLabel(r.placement);
            var displayName = (r.scriptName || r.name || ('正则 #' + (idx + 1)));
            var desc = (r.findRegex || '').substring(0, 40);
            if (desc.length === 40) desc += '...';

            html += '<div style="display:flex;align-items:center;padding:6px 8px;background:var(--bg-tertiary);border-radius:6px;font-size:12px;' + (isEnabled ? '' : 'opacity:0.6;') + '">';
            html += '<div style="flex:1;min-width:0;">';
            html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">';
            html += '<span style="' + (isEnabled ? 'color:var(--accent);' : 'color:var(--text-tertiary);') + 'font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(displayName) + '</span>';
            if (isEnabled) {
                html += '<span style="background:var(--accent);color:#fff;font-size:10px;padding:1px 4px;border-radius:3px;">启用</span>';
                } else {
                html += '<span style="background:var(--bg-secondary);color:var(--text-tertiary);font-size:10px;padding:1px 4px;border-radius:3px;">禁用</span>';
            }
        html += '</div>';
        if (desc) {
            html += '<div style="color:var(--text-tertiary);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">/' + escapeHtml(desc) + '/</div>';
        }
    if (placementLabels) {
        html += '<div style="color:var(--text-tertiary);font-size:10px;margin-top:1px;">' + escapeHtml(placementLabels) + '</div>';
    }
    html += '</div></div>';
    });
    html += '</div>';
    container.innerHTML = html;
    },

    // 获取正则的 placement 标签
    _getPlacementLabel: function(placement) {
        if (!placement) return '';
        var labels = [];
        var p = Array.isArray(placement) ? placement : [placement];
        p.forEach(function(v) {
            if (v === 1 || v === 'MD_DISPLAY') labels.push('AI输出');
            if (v === 2 || v === 'USER_INPUT') labels.push('用户输入');
            if (v === 4 || v === 'WORLD_INFO') labels.push('世界信息');
            if (v === 5 || v === 'MACRO_COMMAND') labels.push('宏/命令');
            if (v === 6 || v === 'REASONING') labels.push('推理/COT');
            if (v === 3 || v === 'SLASH_COMMAND') labels.push('斜杠命令');
            });
        return labels.join(', ');
        },

    /**
    * 自动应用预设中的"使用指南"配置
    * 【重要】只处理需要手动配置的项目（不在预设JSON中的配置）
    * 预设JSON中已配置好的参数（如temperature、reasoning_effort等）不要动
    *
    * 需要手动配置的项目：
    * 1. 自动解析标签（前缀/后缀）- 酒馆设置界面配置
    * 2. 命中缓存设置 - API设置界面配置
    * 3. 提示词后处理 - API设置界面配置
    * 4. 附加参数 - API设置界面配置
    */
    _autoApplyPresetConfig: function(preset) {
        if (!preset || !preset.params) return;

        var params = preset.params;
        var manualConfigs = []; // 需要手动配置的项目
        var presetConfigs = []; // 预设已配置的项目（仅记录，不动）

        // === 1. 自动解析标签配置 ===
        // 【关键】这是需要用户在酒馆里手动配置的，不在预设JSON中
        // 检测预设中是否有思维链相关内容，如果有则提醒用户需要配置自动解析
        var hasThinkingContent = false;
        var thinkingTagType = null;

        if (preset.prompts && preset.prompts.length > 0) {
            for (var i = 0; i < preset.prompts.length; i++) {
                var content = preset.prompts[i].content || '';
                if (content.indexOf('<thinking>') !== -1 || content.indexOf('</thinking>') !== -1) {
                    hasThinkingContent = true;
                    thinkingTagType = '<thinking>';
                    break;
                }
            if (content.indexOf('ECoT') !== -1) {
                hasThinkingContent = true;
                thinkingTagType = 'ECoT';
                break;
            }
        if (content.indexOf('💭') !== -1) {
            hasThinkingContent = true;
            thinkingTagType = '💭';
            break;
        }
    }
    }

    if (hasThinkingContent) {
        // 【自动配置】自动解析标签 - 这是需要手动配置的
        if (thinkingTagType === '<thinking>') {
            manualConfigs.push('自动解析: 前缀<thinking> 后缀</thinking>（请在API设置中确认）');
        } else if (thinkingTagType === 'ECoT') {
            manualConfigs.push('自动解析: 前缀<ECoT> 后缀</ECoT>（请在API设置中确认）');
        } else if (thinkingTagType === '💭') {
            manualConfigs.push('自动解析: 前缀💭 后缀💭（请在API设置中确认）');
        }
    }

    // === 2. 记录预设已配置的参数（不动它们）===
    // 这些参数在预设JSON中已经配置好了，直接使用即可
    if (params.temperature !== undefined) {
        presetConfigs.push('temperature: ' + params.temperature);
    }
    if (params.reasoning_effort) {
        presetConfigs.push('reasoning_effort: ' + params.reasoning_effort);
    }
    if (params.show_thoughts !== undefined) {
        presetConfigs.push('show_thoughts: ' + params.show_thoughts);
    }
    if (params.use_sysprompt !== undefined) {
        presetConfigs.push('use_sysprompt: ' + params.use_sysprompt);
    }
    if (params.squash_system_messages !== undefined) {
        presetConfigs.push('squash_system_messages: ' + params.squash_system_messages);
    }
    if (params.tool_reasoning_mode) {
        presetConfigs.push('tool_reasoning_mode: ' + params.tool_reasoning_mode);
    }

    // === 3. 应用需要在消息构建中使用的参数 ===
    // 这些参数影响消息构建逻辑，需要在代码中使用
    if (params.use_sysprompt === false) {
        gameState._useSysprompt = false;
        } else {
        gameState._useSysprompt = true;
    }

    if (params.squash_system_messages === true) {
        gameState._squashSystemMessages = true;
        } else {
        gameState._squashSystemMessages = false;
    }

    // === 4. 输出配置日志 ===
    console.log('[预设导入] 「' + (preset.name || '未命名') + '」配置分析:');

    if (presetConfigs.length > 0) {
        console.log('  □ 预设已配置（直接使用）:');
        presetConfigs.forEach(function(c) {
            console.log('     • ' + c);
            });
    }

    if (manualConfigs.length > 0) {
        console.log('  ◎ 已自动配置（需手动确认）:');
        manualConfigs.forEach(function(c) {
            console.log('     • ' + c);
            });
        UI.toast('请检查 ' + manualConfigs.length + ' 项手动配置');
        } else {
        UI.toast('预设已配置完成，无需额外设置');
    }
    },


    _loadEntryStates: function(preset) {
        if (!preset || !preset.entryStates) return;
        var states = preset.entryStates;
        // entryStates 可能是数组（多版本）或对象（单版本）
        var versions = [];
        if (Array.isArray(states)) {
            states.forEach(function(s) {
                if (s && s.name) versions.push(s);
                });
            } else if (states && typeof states === 'object') {
            Object.keys(states).forEach(function(key) {
                if (states[key] && states[key].name) versions.push(states[key]);
                });
        }
        if (versions.length === 0) return;
        // 存储到预设对象中供 UI 使用
        preset._entryStateVersions = versions;
        preset._activeEntryState = versions[0].name;

        var firstVersion = versions[0];
        if (firstVersion.entries && Array.isArray(firstVersion.entries)) {
            firstVersion.entries.forEach(function(entry) {
                var prompt = (preset.prompts || []).find(function(p) {
                    return p.identifier === entry.identifier || p.name === entry.name;
                    });
                if (prompt) {
                    prompt.enabled = entry.enabled;
                }
            });
        console.log('[预设] 已应用默认版本快照「' + firstVersion.name + '」的启用状态');
    }
    console.log('[预设] 已加载 ' + versions.length + ' 个预设版本快照:', versions.map(function(v) { return v.name; }).join(', '));
    },


    _applyPromptsToSystemPrompt: function(preset) {
        // 【关键】有预设时只取游戏上下文（玩家设定/记忆/私聊），不包含默认格式规则
        // 预设才是最高优先级，格式规则由预设的 system_prompt=true 条目完全控制
        var basePrompt = '';
        try { basePrompt = buildSystemPrompt(false); } catch(e) { basePrompt = (gameState && gameState.systemPrompt) || ''; }

        gameState.systemPrompt = basePrompt; // system prompt 只包含游戏上下文，格式规则由预设追加

        if (!preset || !preset.prompts || preset.prompts.length === 0) {
            gameState._jailbreakPrompt = '';
            gameState._assistantPrompt = '';
            gameState._impersonationPrompt = '';
            gameState._namesBehavior = 0;
            gameState._depthPrompts = {};
            gameState._positionPrompts = {};
            gameState._afterChatPrompts = [];
            return;
        }

        // 【关键修复】在处理预设提示词之前，先注入全局宏变量
        injectPresetGlobalVars();

        var positionPrompts = {}; // depth -> [prompts]  (depth 0~5, 固定位置)
        var jailbreakPrompts = [];
        var assistantPrompts = [];
        var depthPrompts = {};    // depth -> [prompts]  (depth >= 6, 动态深度)
        var systemPromptParts = []; // system_prompt=true 的提示词，合并到主系统提示词

        var firstChar = (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters[0]) || null;
        var history = gameState.conversationHistory || [];
        var lastMsg = history.length > 0 ? history[history.length - 1] : null;
        var lastUserMsg = '';
        var lastCharMsg = '';
        for (var i = history.length - 1; i >= 0; i--) {
            if (!lastUserMsg && history[i].role === 'user') lastUserMsg = history[i].content || '';
            if (!lastCharMsg && history[i].role === 'assistant') lastCharMsg = history[i].content || '';
            if (lastUserMsg && lastCharMsg) break;
        }
        var _origForPreset =
            (typeof StateManager !== 'undefined' && StateManager.get && StateManager.get('ui.lastOriginalContent')) ||
            (gameState && gameState._lastOriginalContent) || '';
        var macroEnv = {
            user: gameState.playerName || '玩家',
            char: firstChar ? (firstChar.name || '角色') : '角色',
            original: _origForPreset,
            input: lastUserMsg,
            lastUserMessage: lastUserMsg,
            lastCharMessage: lastCharMsg,
            lastMessage: lastMsg ? (lastMsg.content || '') : '',
            description: firstChar ? (firstChar.desc || '') : '',
            personality: firstChar ? (firstChar.personality || '') : '',
            scenario: (gameState.worldSnapshot && gameState.worldSnapshot.scenario) || gameState.userPrompt || ''
            };

        // 【酒馆标准提示词分流】
        // 酒馆 injection_depth 含义:
        //   0 = 角色定义前 (BEFORE_CHAR)
        //   1 = 角色定义后 (AFTER_CHAR)
        //   2 = 示例消息前 (EM_TOP)
        //   3 = 示例消息后 (EM_BOTTOM)
        //   4 = 作者注释顶部 (AN_TOP)
        //   5 = 作者注释底部 (AN_BOTTOM)
        //   >= 6 = 聊天历史深度（从末尾往回数）
        // 酒馆 injection_position 含义:
        //   0 = RELATIVE (从聊天底部往上数)
        //   1 = ABSOLUTE (从聊天顶部往下数)
        preset.prompts.forEach(function(p) {
            if (p.enabled === false) return;

            // 【酒馆兼容】marker=true 的提示词是位置标记，不产生内容
            if (p.marker === true) return;

            if (!p.content || !p.content.trim()) return;

            var injectionPosition = p.injection_position !== undefined ? p.injection_position : 0;
            var injectionDepth = p.injection_depth !== undefined ? p.injection_depth : 4;
            var role = p.role || 'system';

            // 越狱提示词

            // Free-Script原生预设中nsfw可能是身份定义，应走system_prompt路径
            if ((p.identifier === 'jailbreak' || p.identifier === 'nsfw' || p.isJailbreak) && p.system_prompt !== true) {
                jailbreakPrompts.push(p);
                return;
            }
        // assistant 角色提示词
        if (role === 'assistant') {
            assistantPrompts.push(p);
            return;
        }

    // 【关键】system_prompt=true 的提示词合并到主系统提示词
    // 酒馆中 main prompt 等标记为 system_prompt=true 的提示词
    // 会被拼接到系统提示词中，具有最高权重
    if (p.system_prompt === true) {
        systemPromptParts.push(p);
        return;
    }

    // 按 injection_depth 分流到 positionPrompts 或 depthPrompts
    if (injectionDepth >= 0 && injectionDepth <= 5) {
        // depth 0-5: 固定位置（角色前/后、示例前/后、AN顶/底）
        if (!positionPrompts[injectionDepth]) positionPrompts[injectionDepth] = [];
        positionPrompts[injectionDepth].push(p);
        } else {
        // depth >= 6: 动态深度注入（从聊天历史末尾往回数）
        if (!depthPrompts[injectionDepth]) depthPrompts[injectionDepth] = [];
        depthPrompts[injectionDepth].push(p);
    }
    });

    // 【关键】将 system_prompt=true 的提示词合并到主系统提示词
    // 预设优先：预设的main prompt（身份定义）放在最前面，游戏数据作为上下文跟在后面
    // 这样预设的身份定义和核心指令具有最高权重，不会被默认内容稀释
    if (systemPromptParts.length > 0) {
        systemPromptParts.sort(function(a, b) { return (a.injection_order || 100) - (b.injection_order || 100); });
        var spAppend = [];
        systemPromptParts.forEach(function(p) {
            var c = MacroEngine.process(p.content.trim(), macroEnv);
            if (c.trim()) spAppend.push(c);
            });
        if (spAppend.length > 0) {
            gameState.systemPrompt = spAppend.join('\n\n') + '\n\n' + gameState.systemPrompt;
        }
    }

    // 排序
    Object.keys(positionPrompts).forEach(function(d) {
        positionPrompts[d].sort(function(a, b) { return (a.injection_order || 100) - (b.injection_order || 100); });
        });
    jailbreakPrompts.sort(function(a, b) { return (a.injection_order || 100) - (b.injection_order || 100); });
    Object.keys(depthPrompts).forEach(function(d) {
        depthPrompts[d].sort(function(a, b) { return (a.injection_order || 100) - (b.injection_order || 100); });
        });

    // 处理宏并存储
    var jbParts = [];
    jailbreakPrompts.forEach(function(p) {
        var c = MacroEngine.process(p.content.trim(), macroEnv);
        if (c.trim()) jbParts.push(c);
        });
    gameState._jailbreakPrompt = jbParts.join('\n\n');

    var asstParts = [];
    assistantPrompts.forEach(function(p) {
        var c = MacroEngine.process(p.content.trim(), macroEnv);
        if (c.trim()) asstParts.push(c);
        });
    gameState._assistantPrompt = asstParts.join('\n\n');

    // 合并世界书depth prompts和预设depth prompts

    if (!gameState._depthPrompts) gameState._depthPrompts = {};
    Object.keys(gameState._depthPrompts).forEach(function(d) {
        gameState._depthPrompts[d] = (gameState._depthPrompts[d] || []).filter(function(e) {
            return e._source !== 'preset';
        });
        if (gameState._depthPrompts[d].length === 0) delete gameState._depthPrompts[d];
    });
    Object.keys(depthPrompts).forEach(function(d) {
        if (!gameState._depthPrompts[d]) gameState._depthPrompts[d] = [];
        depthPrompts[d].forEach(function(p, idx) {
            var c = MacroEngine.process(p.content.trim(), macroEnv);
            if (c.trim()) {
                // 【酒馆兼容】injection_position: 0=RELATIVE(默认，从聊天底部往上数)
                //                                1=ABSOLUTE(从聊天顶部往下数)
                // game.js 的深度注入逻辑会按这个标志决定从哪一端开始数
                var _id = 'preset_depth_' + d + '_' + idx;
                var _existing = gameState._depthPrompts[d].findIndex(function(e) { return e.identifier === _id; });
                var _entry = {
                    enabled: true,
                    content: c,
                    injection_position: (p.injection_position === 1) ? 1 : 0,
                    identifier: _id,
                    _source: 'preset',
                    _order: 200
                };
                if (_existing >= 0) {
                    gameState._depthPrompts[d][_existing] = _entry;
                } else {
                    gameState._depthPrompts[d].push(_entry);
                }
            }
        });
    });

    // 存储position prompts供sendAIRequest使用
    gameState._positionPrompts = {};
    Object.keys(positionPrompts).forEach(function(d) {
        gameState._positionPrompts[d] = [];
        positionPrompts[d].forEach(function(p) {
            var c = MacroEngine.process(p.content.trim(), macroEnv);
            if (c.trim()) {
                gameState._positionPrompts[d].push(c);
            }
        });
    });

    // 设置 impersonation_prompt
    if (preset.impersonation_prompt) {
        gameState._impersonationPrompt = MacroEngine.process(preset.impersonation_prompt, macroEnv);
        } else {
        gameState._impersonationPrompt = '';
    }

    // 【酒馆兼容】设置 assistant_prefill
    if (preset.params && preset.params.assistant_prefill) {
        gameState._assistantPrefill = MacroEngine.process(preset.params.assistant_prefill, macroEnv);
    } else {
        gameState._assistantPrefill = '';
    }

    // 设置 names_behavior
    gameState._namesBehavior = preset.names_behavior || 0;
    },
    _toggleAllPrompts: function() {
        var preset = this.presets[this._detailPresetIdx];
        if (!preset || !preset.prompts) return;

        // 判断当前是否全部启用
        var allEnabled = true;
        preset.prompts.forEach(function(p) { if (p.enabled === false) allEnabled = false; });

        // 切换到相反状态
        var newState = !allEnabled;
        preset.prompts.forEach(function(p) { p.enabled = newState; });

        this.save();
        this._renderPromptList();
        this.renderPresetList();

        // 如果是当前加载的预设，重新应用提示词
        if (this._detailPresetIdx === this.currentPresetIndex) {
            this._applyPromptsToSystemPrompt(preset);
        }

        UI.toast(newState ? '已全部开启' : '已全部关闭');
    },

    // 加载预设
    loadPreset: function(idx) {
        var preset = this.presets[idx];
        if (!preset) return;

        // 清理旧预设的扩展配置残留，防止切换后旧配置影响新预设
        gameState._theaterConfig = null;
        gameState._triggers = null;
        gameState._worldInfoConfig = null;
        gameState._characterConfig = null;
        gameState._themeConfig = null;
        gameState._customVariables = null;

        this.currentPresetIndex = idx;
        if (preset.params) {
            this.currentParams = Object.assign({}, preset.params);
            this.saveCurrentParams();
            this.syncParamsToUI();

            // 同步参数到 gameState（解决滑块更新但 gameState 未变的 bug）
            // syncParamsToUI() 只更新了 DOM，但没有自动更新 gameState

            // buildAIRequestBody 直接从 PresetManager 读取，gameState.temperature 已废弃

            if (typeof _syncMaxTokens === 'function') {
                _syncMaxTokens(this.currentParams.max_tokens);
            } else if (typeof gameState !== 'undefined') {
                gameState.maxTokens = this.currentParams.max_tokens != null ? this.currentParams.max_tokens : 4096;
            }

        // 更新所有 slider 的显示值（触发 input 事件更新 Value 显示）
        // 注意：滑块的 input 事件只更新显示文字，不更新 currentParams
        // 所以这里直接设置显示文字，而不是依赖事件
        var sliderIdMap = {
            'presetTemp': this.currentParams.temperature,
            'presetTopP': this.currentParams.top_p,
            'presetTopK': this.currentParams.top_k,
            'presetFreqPen': this.currentParams.frequency_penalty,
            'presetPresPen': this.currentParams.presence_penalty
            };
        Object.keys(sliderIdMap).forEach(function(id) {
            var el = document.getElementById(id);
            var valEl = document.getElementById(id + 'Value');
            var val = sliderIdMap[id];
            if (el && val !== undefined) {
                el.value = val;
                if (valEl) valEl.textContent = val;
            }
        });


    // 同步 context length（如果有的话）
    var ctxLenEl = document.getElementById('presetContextLength');
    if (ctxLenEl && this.currentParams.max_context) {
        ctxLenEl.value = this.currentParams.max_context;
    }
    }

    // 应用提示词到 systemPrompt
    this._applyPromptsToSystemPrompt(preset);
    // 【第4轮优化】同步更新 conversationHistory[0]，避免切换预设后旧 system prompt 残留
    // 仿 game.js:982-984 写法，让 WorldInfo 角色提取、buildSmartInjection 等直读 history[0] 的逻辑读到新值
    try {
        if (typeof gameState !== 'undefined' && gameState && gameState.conversationHistory
            && gameState.conversationHistory.length > 0
            && gameState.conversationHistory[0].role === 'system') {
            gameState.conversationHistory[0].content = gameState.systemPrompt;
        }
    } catch (e) { console.warn('[loadPreset] 同步 conversationHistory[0] 失败:', e); }
    // 【增强】加载预设后，自动应用预设的行为控制参数
    if (preset.params) {
        gameState._useSysprompt = preset.params.use_sysprompt !== undefined ? preset.params.use_sysprompt : true;
        gameState._squashSystemMessages = preset.params.squash_system_messages || false;
        gameState._namesBehavior = preset.params.names_behavior || 0;
        // 【酒馆兼容】世界书/预设提示词合并顺序：true=世界书在前（默认），false=预设在世界书前
        // 酒馆标准参数名 world_info_position_first（部分预设可能用 prompt_world_info_first）
        var wiFirstVal = preset.params.world_info_position_first;
        if (wiFirstVal === undefined) wiFirstVal = preset.params.prompt_world_info_first;
        gameState._wiFirst = (wiFirstVal === false) ? false : true;
        console.log('[预设加载] 行为参数: use_sysprompt=' + gameState._useSysprompt + ', squash=' + gameState._squashSystemMessages + ', names=' + gameState._namesBehavior + ', wiFirst=' + gameState._wiFirst);
    }

    // 正则脚本已由 RegexManager.setPresetScripts() 处理（见下方）

    // 智能配置：自动读取使用须知并配置
    // 切换预设时自动跟着切换配置
    if (typeof SmartConfigEngine !== 'undefined') {
        SmartConfigEngine.loadFromPreset(preset);
    }

    // 自动应用预设中的基础配置
    // 预设JSON中已配置的参数（如use_sysprompt、squash_system_messages等）
    this._autoApplyPresetConfig(preset);

    // 切换预设时，自动切换预设绑定的正则脚本
    // 预设正则与全局正则分开存储，切换预设时自动切换
    // 优先使用已解析的 _parsedRegexScripts
    // 【修改】增加安全确认机制，仿酒馆 preset_allowed_regex
    // 首次加载含正则的预设时弹窗询问用户，确认后才应用正则
    var presetScripts = preset._parsedRegexScripts || preset.regexScripts;
    if (presetScripts && presetScripts.length > 0) {
        var presetNameForRegex = preset.name || '未命名预设';
        RegexManager.checkPresetRegexAllowed(presetNameForRegex, presetScripts.length).then(function(allowed) {
            if (allowed) {
                RegexManager.setPresetScripts(presetScripts, presetNameForRegex);
                console.log('[Preset] 已切换预设正则脚本:', presetScripts.length, '条');
                } else {
                // 用户拒绝，清空预设正则
                RegexManager.clearPresetScripts();
                UI.toast('已跳过预设「' + presetNameForRegex + '」的正则脚本');
                console.log('[Preset] 用户拒绝了预设正则脚本');
            }
        }).catch(function(err) {
        console.error('[Preset] 正则确认失败:', err);
        RegexManager.clearPresetScripts();
        });
    } else {
    RegexManager.clearPresetScripts();
    }

    // 加载酒馆助手脚本（兼容层）
    if (preset.tavernHelperScripts && preset.tavernHelperScripts.length > 0) {
        console.log('[Preset] 检测到酒馆助手脚本:', preset.tavernHelperScripts.length, '个');
        if (typeof TavernHelperCompat !== 'undefined') {
            TavernHelperCompat.loadScripts({ scripts: preset.tavernHelperScripts });
        }
    }

    // 加载SPreset配置（Quick Reply按钮等）
    if (preset.spresetConfig) {
        console.log('[Preset] 检测到 SPreset 配置');
        if (typeof TavernHelperCompat !== 'undefined') {
            TavernHelperCompat.parseQuickReplies(preset.spresetConfig);
            // 渲染Quick Reply按钮
            TavernHelperCompat.renderQuickReplyBar();
        }
    }


    if (preset.spresetButtons && preset.spresetButtons.length > 0) {
        console.log('[Preset] 检测到 SPreset 快捷回复按钮:', preset.spresetButtons.length, '个');
        if (typeof TavernHelperCompat !== 'undefined') {
            TavernHelperCompat.parseQuickReplies({ button: { buttons: preset.spresetButtons } });
            TavernHelperCompat.renderQuickReplyBar();
        }
    }

    // 如果没有SPreset配置，也检查是否有Quick Reply需要渲染
    if (!preset.spresetConfig && !preset.spresetButtons && typeof TavernHelperCompat !== 'undefined') {
        TavernHelperCompat.renderQuickReplyBar();
    }

    // 【深度融合】将预设的字数/段落配置同步到游戏设置UI
    if (preset.wordCountConfig) {
        _syncPresetWordCountToUI(preset.wordCountConfig);
    }


    // 应用小剧场配置
    if (preset.theaterConfig) {
        console.log('[Preset] 检测到小剧场配置');
        if (!gameState._theaterConfig) gameState._theaterConfig = {};
        Object.assign(gameState._theaterConfig, preset.theaterConfig);
    }

    // 应用自定义变量
    if (preset.customVariables) {
        console.log('[Preset] 检测到自定义变量:', Object.keys(preset.customVariables).length, '个');
        if (typeof MacroEngine !== 'undefined') {
            Object.keys(preset.customVariables).forEach(function(varName) {
                MacroEngine.setLocalVar(varName, preset.customVariables[varName]);
                });
        }
    }

    // 应用触发器配置
    if (preset.triggers && Array.isArray(preset.triggers)) {
        console.log('[Preset] 检测到触发器配置:', preset.triggers.length, '个');
        gameState._triggers = preset.triggers;
    }

    // 应用UI主题配置
    if (preset.themeConfig) {
        console.log('[Preset] 检测到主题配置');
        // 可以在这里应用主题样式
        if (preset.themeConfig.primaryColor) {
            document.documentElement.style.setProperty('--accent', preset.themeConfig.primaryColor);
        }
    if (preset.themeConfig.backgroundColor) {
        document.documentElement.style.setProperty('--bg', preset.themeConfig.backgroundColor);
    }
    }

    // 应用世界书配置
    if (preset.worldInfoConfig) {
        console.log('[Preset] 检测到世界书配置');
        gameState._worldInfoConfig = preset.worldInfoConfig;
    }

    // 应用角色卡配置
    if (preset.characterConfig) {
        console.log('[Preset] 检测到角色卡配置');
        gameState._characterConfig = preset.characterConfig;
    }

    this.renderPresetList();
    UI.toast('已加载预设: ' + preset.name);

    // 更新世界创建页面的预设显示
    this.updateSetupPresetDisplay();

    this._loadEntryStates(preset);

    // 加载后自动关闭弹窗，让用户看到更新后的预设名称
    UI.hideModal('presetManagerModal');
    },

    // 更新世界创建页面的预设显示
    updateSetupPresetDisplay: function() {
        var nameEl = document.getElementById('setupPresetName');
        var descEl = document.getElementById('setupPresetDesc');
        if (!nameEl || !descEl) return;

        if (this.currentPresetIndex >= 0 && this.presets[this.currentPresetIndex]) {
            var preset = this.presets[this.currentPresetIndex];
            nameEl.textContent = preset.name;
            var params = preset.params || {};
            var desc = [];
            if (params.temperature !== undefined) desc.push('Temp:' + params.temperature);
            if (params.top_p !== undefined) desc.push('TopP:' + params.top_p);
            if (preset.prompts && preset.prompts.length > 0) {
                var enabledCount = preset.prompts.filter(function(p) { return p.enabled !== false; }).length;
                desc.push('提示词:' + enabledCount);
            }
        descEl.textContent = desc.length > 0 ? desc.join(' | ') : '已加载';
        } else {
        nameEl.textContent = '默认预设';
        descEl.textContent = '点击选择或导入酒馆预设';
        }
    },

    // 删除预设
    deletePreset: async function(idx) {
        var ok = await UI.confirm('删除预设', '确定删除这个预设？');
        if (!ok) return;
        var deletedPreset = this.presets[idx];
        this.presets.splice(idx, 1);
        if (this.currentPresetIndex === idx) {
            this.currentPresetIndex = -1;
            // 删除当前预设时，清空预设正则
            RegexManager.clearPresetScripts();
            } else if (this.currentPresetIndex > idx) {
            this.currentPresetIndex--;
        }
    // 无论删哪个预设，如果它绑定了正则脚本，从全局正则中也删除
    if (deletedPreset && deletedPreset.regexScripts && deletedPreset.regexScripts.length > 0) {
        const self = this;
        deletedPreset.regexScripts.forEach(function(script) {
            RegexManager.removePresetScript(script.scriptName || script.name);
            });
        console.log('[Preset] 已删除预设绑定的正则脚本:', deletedPreset.regexScripts.length, '条');
    }
    this.save();
    this.renderPresetList();
    UI.toast('预设已删除');
    },

    // 清空全部预设
    clearAllPresets: async function() {
        var count = this.presets.length;
        if (count === 0) {
            UI.toast('没有可清空的预设');
            return;
        }
    var ok = await UI.confirm('清空全部预设', '确定清空所有 ' + count + ' 个预设？\n\n此操作不可恢复。');
    if (!ok) return;

    this.presets = [];
    this.currentPresetIndex = -1;
    // 清空预设正则
    RegexManager.clearPresetScripts();
    this.save();
    this.renderPresetList();
    UI.toast('已清空 ' + count + ' 个预设');
    },

    // 获取当前参数（用于API调用）
    getParams: function() {
        return Object.assign({}, this.currentParams);
        },

    // 导出预设为JSON文件（包含完整内容）
    exportPreset: function(index) {
        var preset = this.presets[index];
        if (!preset) return;

        // 构建完整的导出数据
        var exportData = {
            name: preset.name,
            // 采样参数
            temperature: preset.params.temperature,
            top_p: preset.params.top_p,
            top_k: preset.params.top_k,
            frequency_penalty: preset.params.frequency_penalty,
            presence_penalty: preset.params.presence_penalty,
            openai_max_tokens: preset.params.max_tokens,
            openai_max_context: preset.params.max_context,
            min_p: preset.params.min_p || 0,
            top_a: preset.params.top_a || 0,
            repetition_penalty: preset.params.repetition_penalty || 1,
            // 包含prompts数组
            // [T1-P1-21] 显式输出 marker 锚点字段，与 T1-P1-11 导入对称
            prompts: (preset.prompts || []).map(function(p) {
                return {
                    identifier: p.identifier || '',
                    name: p.name || '',
                    role: p.role || 'system',
                    content: p.content,
                    injection_position: p.injection_position,
                    injection_depth: p.injection_depth,
                    injection_order: p.injection_order,
                    system_prompt: !!p.system_prompt,
                    enabled: p.enabled !== false,
                    forbid_overrides: !!p.forbid_overrides,
                    injection_trigger: p.injection_trigger || [],
                    marker: !!p.marker
                    };
                }),
            // 包含prompt_order（用于恢复启用状态）
            prompt_order: [{
                character_id: 100000,  // dummyId for global
                order: (preset.prompts || []).map(function(p) {
                    return {
                        identifier: p.identifier || '',
                        name: p.name || '',
                        enabled: p.enabled !== false
                        };
                    })
                }],
            // 包含extensions（正则脚本等）
            extensions: {}
            };

        // 包含正则脚本
        if (preset.regexScripts && preset.regexScripts.length > 0) {
            exportData.extensions.regex_scripts = preset.regexScripts.map(function(r) {
                return {
                    id: r.id || Date.now() + Math.random(),
                    scriptName: r.scriptName || r.name || '未命名正则',
                    findRegex: r.findRegex || r.findPattern || '',
                    replaceString: r.replaceString || '',
                    trimStrings: r.trimStrings || [],
                    placement: r._originalPlacement || (r.applyOutput ? [1] : []).concat(r.applyInput ? [2] : []),
                    disabled: r.disabled === true || r.enabled === false,
                    markdownOnly: !!r.markdownOnly,
                    promptOnly: !!r.promptOnly,
                    runOnEdit: !!r.runOnEdit,
                    // substituteRegex兼容布尔值和字符串格式
                    substituteRegex: (function() {
                        var sub = r.substituteRegex;
                        if (sub === true || sub === 'Raw') return 1;
                        if (sub === 'Escaped') return 2;
                        if (typeof sub === 'number' && sub > 0) return sub;
                        return 0;
                        })(),
                    minDepth: r.minDepth != null ? r.minDepth : null,
                    maxDepth: r.maxDepth != null ? r.maxDepth : null
                    };
                });
        }

        // 包含酒馆助手脚本
        if (preset.tavernHelperScripts && preset.tavernHelperScripts.length > 0) {
            exportData.extensions.tavern_helper = {
                scripts: preset.tavernHelperScripts
                };
        }

    // 包含SPreset配置
    if (preset.spresetConfig) {
        exportData.extensions.SPreset = preset.spresetConfig;
    }

    // 补充导出缺失字段
    exportData.wordCountConfig = preset.wordCountConfig || null;
    exportData.impersonation_prompt = preset.impersonation_prompt || '';
    exportData.continue_nudge_prompt = preset.continue_nudge_prompt || '';
    exportData.names_behavior = preset.names_behavior || 0;
    exportData.customVariables = preset.customVariables || null;
    exportData.triggers = preset.triggers || null;
    exportData.theaterConfig = preset.theaterConfig || null;
    exportData.worldInfoConfig = preset.worldInfoConfig || null;
    exportData.characterConfig = preset.characterConfig || null;
    exportData.themeConfig = preset.themeConfig || null;
    exportData.entryStates = preset.entryStates || null;

    var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (preset.name || 'preset') + '.json';
    a.click();
    TimerManager.setTimeout('revokePresetURL', function() { URL.revokeObjectURL(url); }, 1000);
    },

    // ========================================
    // 从 PresetEngine 合并的方法
    // ========================================


};
