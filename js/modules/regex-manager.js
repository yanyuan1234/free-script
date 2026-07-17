/**
 * 正则脚本管理器
 * 管理全局正则脚本和预设关联的正则脚本，负责对 AI 输出执行 find/replace
 * 依赖：preset-manager.js
 * 被依赖：macro-engine.js（间接）
 */
var RegexManager = {
    scripts: [],  // 全局正则脚本（用户自己添加的）
    _editingId: null,
    _presetScripts: [],  // 当前预设的正则脚本（随预设切换）
    _currentView: 'groups',  // 'groups' 或 'detail'
    _detailGroupType: null,  // 'global' 或 'preset'
    _detailGroupIdx: null,  // 预设索引（仅 preset 类型时使用）
    // 预设正则允许列表（仿酒馆 preset_allowed_regex 安全机制）
    // 参考：SillyTavern extension_settings.preset_allowed_regex
    // 存储格式：{ "预设名": true } — 记录用户已允许使用正则的预设
    // 首次加载含正则的预设时弹窗确认，确认后记录在此，后续不再弹窗
    _presetAllowedRegex: {},

    isScriptEnabled: function(script) {
        if (!script) return false;
        return script.enabled !== false && script.disabled !== true;
    },

    // 初始化
    init: function() {
        this.load();
        this._loadAllowedList();
        this.bindEvents();
        },

    // 加载预设正则允许列表
    _loadAllowedList: function() {
        try {
            var data = Storage.getJSON(Storage.KEYS.PRESET_ALLOWED_REGEX, {});
            this._presetAllowedRegex = data;
            } catch(e) {
                console.error('[RegexManager] 读取presetAllowedRegex失败:', e);
                this._presetAllowedRegex = {};
            }
        },

    // 保存预设正则允许列表
    _saveAllowedList: function() {
        try {
            Storage.setJSON(Storage.KEYS.PRESET_ALLOWED_REGEX, this._presetAllowedRegex);
            } catch(e) {
                console.warn('[RegexManager] 保存允许列表失败:', e);
            }
        },

    // 检查预设正则是否已被允许
    // 返回 Promise<boolean>，如果未被允许则弹窗询问用户
    checkPresetRegexAllowed: function(presetName, regexCount) {
        const self = this;
        // 如果已经允许过，直接通过
        if (self._presetAllowedRegex[presetName]) {
            return Promise.resolve(true);
        }
        // 首次加载，弹窗确认
        return UI.confirm(
        '预设正则脚本',
        '预设「' + presetName + '」包含 ' + regexCount + ' 个正则脚本。\n\n' +
        '这些正则会自动处理你的输入和AI的输出（如格式化、过滤等）。\n' +
        '是否允许使用这些正则脚本？\n\n' +
        '（确认后将记住你的选择，下次不再询问）'
        ).then(function(ok) {
            if (ok) {
                self._presetAllowedRegex[presetName] = true;
                self._saveAllowedList();
            }
        return ok;
        });
    },

    // 设置当前预设的正则脚本（切换预设时调用）
    // 【修改】增加 allowed 检查，仿酒馆的安全机制
    setPresetScripts: function(scripts, presetName) {
        this._presetScripts = scripts || [];
        console.log('[RegexManager] 已切换预设正则脚本:', this._presetScripts.length, '条');
        },

    // 清空预设正则脚本（不使用预设时调用）
    clearPresetScripts: function() {
        this._presetScripts = [];
        },

    // 从预设正则中移除指定脚本（删除预设时调用）
    removePresetScript: function(scriptName) {
        if (!scriptName) return;
        this._presetScripts = this._presetScripts.filter(function(s) {
            return (s.scriptName || s.name) !== scriptName;
            });
        },

    // 获取所有生效的正则脚本（全局 + 当前预设）
    getAllScripts: function() {
        // 合并全局正则和预设正则，预设正则在后（优先级更高）
        return this.scripts.concat(this._presetScripts);
        },

    // 从localStorage加载
    load: function() {
        try {
            var data = Storage.getJSON(Storage.KEYS.REGEX_SCRIPTS, []);
            this.scripts = Array.isArray(data) ? data : [];
            } catch(e) {
                console.error('[RegexManager] 读取regexScripts失败:', e);
                this.scripts = [];
            }
        },

    // 保存到localStorage
    save: function() {
        Storage.setJSON(Storage.KEYS.REGEX_SCRIPTS, this.scripts);
        },

    // 绑定事件
    bindEvents: function() {
        if (this._eventsBound) return;
        this._eventsBound = true;
        const self = this;

        // 返回按钮（从详情返回分组列表）
        var backBtn = document.getElementById('btnRegexBack');
        if (backBtn) {
            backBtn.addEventListener('click', function() {
                self.showGroupView();
                });
        }

        // 返回预设管理按钮
        var returnToPresetBtn = document.getElementById('btnRegexReturnToPreset');
        if (returnToPresetBtn) {
            returnToPresetBtn.addEventListener('click', function() {
                UI.hideModal('regexManagerModal');
                TimerManager.setTimeout('showPresetModal', function() { UI.showModal('presetManagerModal'); }, 100);
                });
        }

    // 从预设管理进入正则管理
    var openBtn = document.getElementById('btnOpenRegexManager');
    if (openBtn) {
        openBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            UI.hideModal('presetManagerModal');
            TimerManager.setTimeout('showRegexModal', function() { self.showModal(); }, 100);
            });
    }

    // 导入按钮
    var importBtn = document.getElementById('btnRegexImport');
    var fileInput = document.getElementById('regexFileInput');
    if (importBtn && fileInput) {
        importBtn.addEventListener('click', function() { fileInput.click(); });
        fileInput.addEventListener('change', function(e) {
            if (e.target.files[0]) self.importFromFile(e.target.files[0]);
            fileInput.value = '';
            });
    }

    // 新建按钮
    var addBtn = document.getElementById('btnRegexAdd');
    if (addBtn) {
        addBtn.addEventListener('click', function() {
            self._editingId = null;
            document.getElementById('regexEditTitle').textContent = '新建正则';
            document.getElementById('regexScriptName').value = '';
            document.getElementById('regexFindPattern').value = '';
            document.getElementById('regexReplaceString').value = '';
            document.getElementById('regexApplyInput').checked = true;
            document.getElementById('regexApplyOutput').checked = true;
            document.getElementById('regexEnabled').checked = true;
            UI.showModal('regexEditModal');
            });
    }

    // 导出按钮
    var regexExportBtn = document.getElementById('btnRegexExport');
    if (regexExportBtn) {
        regexExportBtn.addEventListener('click', function() {
            RegexManager.exportScripts();
            });
    }

    // 清空按钮
    var clearBtn = document.getElementById('btnRegexClear');
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            self.clearAllScripts();
            });
    }

    // 保存按钮
    var saveBtn = document.getElementById('btnRegexSave');
    if (saveBtn) {
        saveBtn.addEventListener('click', function() { self.saveScript(); });
    }


    var testBtn = document.getElementById('btnRegexTest');
    if (testBtn) {
        testBtn.addEventListener('click', function() { self.testScript(); });
    }

    // 删除按钮
    var deleteBtn = document.getElementById('btnRegexDelete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function() { self.deleteScript(); });
    }
    },

    // 显示模态框
    showModal: function() {
        this.showGroupView();
        UI.showModal('regexManagerModal');
        },

    // 渲染脚本列表
    // ===== 视图切换 =====

    // 显示分组列表视图（第一级）
    showGroupView: function() {
        this._currentView = 'groups';
        this._detailGroupType = null;
        this._detailGroupIdx = null;

        document.getElementById('regexGroupView').style.display = '';
        document.getElementById('regexDetailView').style.display = 'none';
        document.getElementById('btnRegexBack').style.display = 'none';
        document.getElementById('regexModalTitle').textContent = '正则脚本';
        // 恢复工具栏按钮显示
        document.getElementById('btnRegexImport').style.display = '';
        document.getElementById('btnRegexAdd').style.display = '';
        document.getElementById('btnRegexExport').style.display = '';
        document.getElementById('btnRegexClear').style.display = '';

        this.renderGroupList();
        },

    // 显示分组详情视图（第二级）
    showDetailView: function(groupType, groupIdx) {
        this._currentView = 'detail';
        this._detailGroupType = groupType;
        this._detailGroupIdx = groupIdx;

        document.getElementById('regexGroupView').style.display = 'none';
        document.getElementById('regexDetailView').style.display = '';
        document.getElementById('btnRegexBack').style.display = '';
        // 隐藏导入/新建按钮（在详情视图中不需要）
        document.getElementById('btnRegexImport').style.display = 'none';
        document.getElementById('btnRegexAdd').style.display = 'none';
        document.getElementById('btnRegexExport').style.display = 'none';
        document.getElementById('btnRegexClear').style.display = '';

        // 设置标题
        var title = groupType === 'global' ? '全局正则' : '预设正则';
        if (groupType === 'preset' && groupIdx != null) {
            var preset = PresetManager.presets[groupIdx];
            if (preset) title = preset.name + ' - 正则';
        }
        document.getElementById('regexModalTitle').textContent = title;
        document.getElementById('regexDetailTitle').textContent = title;

        // 绑定"全部开启/关闭"按钮
        var toggleAll = document.getElementById('regexToggleAll');
        if (toggleAll) {
            toggleAll.textContent = '全部开启';
            toggleAll.onclick = function() {
                if (toggleAll.textContent === '全部开启') {
                    self._setAllInGroup(true);
                    toggleAll.textContent = '全部关闭';
                    } else {
                    self._setAllInGroup(false);
                    toggleAll.textContent = '全部开启';
                }
};
}
const self = this;
this.renderDetailList();
},

// 设置当前分组内所有正则的启用状态
_setAllInGroup: function(enabled) {
    var scripts = this._getCurrentGroupScripts();
    scripts.forEach(function(s) { s.enabled = enabled; });
    if (this._detailGroupType === 'global') {
        this.save();
    }
this.renderDetailList();
this.renderGroupList();
},

// 获取当前分组的正则脚本数组
_getCurrentGroupScripts: function() {
    if (this._detailGroupType === 'global') {
        return this.scripts;
    } else if (this._detailGroupType === 'preset' && this._detailGroupIdx != null) {
    var preset = PresetManager.presets[this._detailGroupIdx];
    return (preset && preset.regexScripts) ? preset.regexScripts : [];
}
return [];
},

// ===== 渲染分组列表（第一级） =====
renderGroupList: function() {
    var container = document.getElementById('regexGroupList');
    if (!container) return;

    const self = this;
    var groups = [];

    // 全局正则分组
    var globalEnabled = 0;
    this.scripts.forEach(function(s) { if (self.isScriptEnabled(s)) globalEnabled++; });
    groups.push({
        type: 'global',
        name: '全局正则',
        count: this.scripts.length,
        enabledCount: globalEnabled,
        desc: '用户手动添加的正则脚本'
    });

// 各预设的正则分组
if (PresetManager && PresetManager.presets) {
    PresetManager.presets.forEach(function(preset, idx) {
        if (preset.regexScripts && preset.regexScripts.length > 0) {
            var enabled = 0;
            preset.regexScripts.forEach(function(s) { if (self.isScriptEnabled(s)) enabled++; });
            var isActive = idx === PresetManager.currentPresetIndex;
            groups.push({
                type: 'preset',
                idx: idx,
                name: preset.name + ' - 正则',
                count: preset.regexScripts.length,
                enabledCount: enabled,
                desc: '预设附带的正则脚本' + (isActive ? '（当前使用中）' : '')
            });
    }
});
}

if (groups.length === 0 || (groups.length === 1 && groups[0].count === 0)) {
    container.innerHTML = '<div class="wi-empty"><div>暂无正则脚本</div><div style="font-size:11px;margin-top:4px;">点击「导入」或「新建」来管理正则脚本</div></div>';
    return;
}

var html = '';
groups.forEach(function(g) {
    if (g.count === 0) return;
    var isActive = g.type === 'preset' && g.idx === PresetManager.currentPresetIndex;
    var tags = [];
    tags.push('<span style="background:var(--accent);color:#fff;">' + g.enabledCount + '/' + g.count + ' 启用</span>');
    if (isActive) tags.push('<span style="background:var(--success);color:#fff;">使用中</span>');

    var tagsHtml = tags.length > 0
    ? '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px;">' + tags.map(function(t) { return '<span style="font-size:9px;padding:1px 5px;border-radius:3px;">' + t + '</span>'; }).join('') + '</div>'
    : '';

    html += '<div class="pearl-card" style="padding:10px;margin-bottom:10px;cursor:pointer;border:' + (isActive ? '2px solid var(--success)' : 'none') + ';" data-regex-group="' + g.type + '" data-regex-group-idx="' + (g.idx != null ? g.idx : '') + '">' +
    '<div style="display:flex;justify-content:space-between;align-items:start;">' +
    '<div style="flex:1;min-width:0;" data-regex-group-open="' + g.type + '" data-regex-group-open-idx="' + (g.idx != null ? g.idx : '') + '">' +
    '<div style="font-size:13px;font-weight:600;">' + escapeHtml(g.name) + (isActive ? ' ✓' : '') + '</div>' +
    '<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">' + escapeHtml(g.desc) + '</div>' +
    tagsHtml +
    '</div>' +
    '<div style="display:flex;gap:6px;flex-shrink:0;margin-left:8px;align-items:center;">' +
    '<span class="regex-group-open-btn" data-type="' + g.type + '" data-idx="' + (g.idx != null ? g.idx : '') + '" style="font-size:11px;padding:3px 8px;background:transparent;color:var(--accent);border:1px solid var(--accent);border-radius:6px;cursor:pointer;white-space:nowrap;" title="查看条目">详情</span>' +
    '</div>' +
    '</div>' +
    '</div>';
});

container.innerHTML = html;

// 事件委托
container.onclick = function(e) {
    var openBtn = e.target.closest('[data-regex-group-open]');
    if (openBtn) {
        e.stopPropagation();
        var type = openBtn.dataset.regexGroupOpen;
        var idx = openBtn.dataset.regexGroupOpenIdx;
        self.showDetailView(type, idx !== '' ? parseInt(idx) : null);
        return;
    }
var card = e.target.closest('[data-regex-group]');
if (card) {
    var type = card.dataset.regexGroup;
    var idx = card.dataset.regexGroupIdx;
    self.showDetailView(type, idx !== '' ? parseInt(idx) : null);
}
};
},

// ===== 渲染分组内条目列表（第二级） =====
renderDetailList: function() {
    var container = document.getElementById('regexDetailList');
    var statsEl = document.getElementById('regexDetailStats');
    if (!container) return;

    var scripts = this._getCurrentGroupScripts();
    if (scripts.length === 0) {
        container.innerHTML = '<div class="wi-empty">该分组没有正则脚本</div>';
        if (statsEl) statsEl.textContent = '';
        return;
    }

var enabledCount = 0;
const self = this;
scripts.forEach(function(s) {
    if (self.isScriptEnabled(s)) enabledCount++;
});
if (statsEl) statsEl.textContent = enabledCount + '/' + scripts.length + ' 已启用';

var html = '';
scripts.forEach(function(script, idx) {
    var isEnabled = self.isScriptEnabled(script);
    var placementText = [];
    if (script.applyInput) placementText.push('输入');
    if (script.applyOutput) placementText.push('输出');
    var placementStr = placementText.join('+') || '未应用';

    var tags = [];
    tags.push('<span style="background:var(--bg);color:var(--text-tertiary);border:1px solid var(--border);">' + placementStr + '</span>');
    if (script.markdownOnly) tags.push('<span style="background:#8b5cf6;color:#fff;">仅MD</span>');
    if (script.promptOnly) tags.push('<span style="background:#6366f1;color:#fff;">仅Prompt</span>');
    if (script.runOnEdit) tags.push('<span style="background:#f59e0b;color:#fff;">编辑时</span>');

    if (script._lastError) {
        tags.push('<span style="background:#ef4444;color:#fff;" title="' + escapeHtml(script._lastError) + '">错误</span>');
    }

    var tagsHtml = '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px;">' + tags.map(function(t) { return '<span style="font-size:9px;padding:1px 5px;border-radius:3px;">' + t + '</span>'; }).join('') + '</div>';

    var displayName = script.name || script.scriptName || '未命名';


    var borderColor = script._lastError ? '#f59e0b' : (isEnabled ? 'var(--success)' : 'var(--danger)');
    html += '<div class="pearl-card" style="padding:8px 10px;opacity:' + (isEnabled ? '1' : '0.5') + ';border-left:3px solid ' + borderColor + ';">' +
    // 错误详情行（仅在有错误时显示）
    (script._lastError ? '<div style="font-size:10px;color:#f59e0b;margin-bottom:4px;word-break:break-all;">⚠ ' + escapeHtml(script._lastError) + (script._errorCount > 1 ? ' (×' + script._errorCount + ')' : '') + '</div>' : '') +
    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
    '<div style="flex:1;min-width:0;cursor:pointer;" data-regex-edit="' + idx + '">' +
    '<div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(displayName) + '</div>' +
    tagsHtml +
    '</div>' +
    '<div style="display:flex;gap:5px;flex-shrink:0;margin-left:8px;align-items:center;">' +
    '<span class="regex-enable-btn" data-regex-enable="' + idx + '" style="font-size:10px;padding:2px 7px;background:' + (isEnabled ? 'var(--success)' : 'transparent') + ';color:' + (isEnabled ? '#fff' : 'var(--success)') + ';border:1px solid var(--success);border-radius:6px;cursor:pointer;white-space:nowrap;' + (isEnabled ? 'font-weight:500;' : '') + '">启用</span>' +
    '<span class="regex-disable-btn" data-regex-disable="' + idx + '" style="font-size:10px;padding:2px 7px;background:' + (!isEnabled ? 'var(--danger)' : 'transparent') + ';color:' + (!isEnabled ? '#fff' : 'var(--danger)') + ';border:1px solid var(--danger);border-radius:6px;cursor:pointer;white-space:nowrap;' + (!isEnabled ? 'font-weight:500;' : '') + '">禁用</span>' +
    '<span class="regex-delete-btn" data-regex-delete="' + idx + '" style="font-size:10px;padding:2px 7px;background:var(--bg);color:var(--danger);border:1px solid var(--danger);border-radius:6px;cursor:pointer;white-space:nowrap;">删除</span>' +
    '</div>' +
    '</div>' +
    '</div>';
});

container.innerHTML = html;

// 事件委托
container.onclick = function(e) {
    var enableEl = e.target.closest('[data-regex-enable]');
    if (enableEl) {
        e.stopPropagation();
        var i = parseInt(enableEl.dataset.regexEnable, 10);
        self._toggleScriptInGroup(i, true);
        return;
    }
var disableEl = e.target.closest('[data-regex-disable]');
if (disableEl) {
    e.stopPropagation();
    var i = parseInt(disableEl.dataset.regexDisable, 10);
    self._toggleScriptInGroup(i, false);
    return;
}
var deleteEl = e.target.closest('[data-regex-delete]');
if (deleteEl) {
    e.stopPropagation();
    self._deleteScriptInGroup(parseInt(deleteEl.dataset.regexDelete, 10));
    return;
}
var editEl = e.target.closest('[data-regex-edit]');
if (editEl) {
    self.editScript(parseInt(editEl.dataset.regexEdit, 10));
}
};
},

// 切换分组内某条正则的启用状态
_toggleScriptInGroup: function(idx, enabled) {
    var scripts = this._getCurrentGroupScripts();
    if (idx < 0 || idx >= scripts.length) return;
    if (this._detailGroupType === 'global') {
        scripts[idx].enabled = enabled;
        this.save();
    } else if (this._detailGroupType === 'preset') {
    // 预设正则：disabled=true 表示禁用
    scripts[idx].disabled = !enabled;
    scripts[idx].enabled = enabled;
    // 保存预设，确保持久化
    PresetManager.save();
}
this.renderDetailList();
this.renderGroupList();
},

// 删除分组内某条正则
_deleteScriptInGroup: function(idx) {
    const self = this;
    UI.confirm('删除正则', '确定删除这条正则脚本？').then(function(ok) {
        if (!ok) return;
        if (self._detailGroupType === 'global') {
            self.scripts.splice(idx, 1);
        } else if (self._detailGroupType === 'preset' && self._detailGroupIdx >= 0) {
        var preset = PresetManager.presets[self._detailGroupIdx];
        if (preset && preset.regexScripts) {
            preset.regexScripts.splice(idx, 1);
            PresetManager.save();
        }
}
self.save();
self.renderDetailList();
UI.toast('已删除');
}).catch(function(err) {
console.error('[RegexManager] 删除正则失败:', err);
});
},

// 旧方法兼容（保持向后兼容）
renderScriptList: function() {
    if (this._currentView === 'groups') {
        this.renderGroupList();
    } else {
    this.renderDetailList();
}
},

// 导入酒馆正则脚本
importFromFile: function(file) {
    const self = this;
    UI.readJSONFile(file).then(function(data) {
        try {
            // 检测导入的是否是预设文件（包含预设特有字段）
            if (data.name && (data.description || data.character_book || data.world_info)) {
                UI.toast('这是预设文件，请前往「预设管理」页面导入');
                return;
            }
        var imported = self.parseRegexScripts(data);
        if (imported.length > 0) {
            self.scripts = self.scripts.concat(imported);
            if (self.scripts.length > 50) self.scripts = self.scripts.slice(0, 50);
            self.save();
            self.renderScriptList();
            UI.toast('成功导入 ' + imported.length + ' 个正则脚本');
        } else {
        UI.toast('未找到有效的正则脚本');
    }
} catch(err) {
UI.toast('导入失败: ' + translateError(err.message));
}
}).catch(function(err) {
UI.toast('文件读取失败: ' + translateError(err.message));
});
},

// 解析酒馆正则格式
parseRegexScripts: function(data) {
    var scripts = [];
    const self = this;

    // 情况1: 直接是数组
    if (Array.isArray(data)) {
        data.forEach(function(item) {
            // 传入 isImport=true，导入的正则 placement 未定义时不自动应用
            var parsed = self.parseSingleRegex(item, true);
            if (parsed) scripts.push(parsed);
        });
}
// 情况2: 包含 regex_scripts 字段
else if (data.regex_scripts && Array.isArray(data.regex_scripts)) {
    data.regex_scripts.forEach(function(item) {
        // 传入 isImport=true
        var parsed = self.parseSingleRegex(item, true);
        if (parsed) scripts.push(parsed);
    });
}
// 情况3: 单个脚本对象
else if (data.findRegex || data.scriptName) {
    // 传入 isImport=true
    var parsed = self.parseSingleRegex(data, true);
    if (parsed) scripts.push(parsed);
}

return scripts;
},

// 解析单个正则脚本
parseSingleRegex: function(data, isImport) {
    if (!data) return null;

    // placement 默认行为：
    // 酒馆中 placement 为空数组 [] 表示不应用于任何位置
    // 如果 placement 未定义，需要区分是导入的还是新建的：
    // - 导入的正则：placement 未定义表示不自动应用（除非明确包含 1 或 2）
    // - 新建的正则（isImport=false）：默认应用输入和输出
    var applyInput = false;
    var applyOutput = false;
    var extraPlacements = []; // 保留不识别的 placement 值，导出时不丢失

    // 更明确的 placement 检查逻辑
    var hasExplicitPlacement = data.placement !== undefined && data.placement !== null;
    var isEmptyPlacement = Array.isArray(data.placement) && data.placement.length === 0;

    if (hasExplicitPlacement && !isEmptyPlacement) {
        // placement是数组
        if (Array.isArray(data.placement)) {
            applyInput = data.placement.includes(2);  // 2 = USER_INPUT (酒馆标准)
            applyOutput = data.placement.includes(1); // 1 = MD_DISPLAY (AI输出, 酒馆标准)
            // 保留额外 placement 值（3, 5, 6 等）
            data.placement.forEach(function(p) {
                if (p !== 1 && p !== 2) extraPlacements.push(p);
            });
    }
// placement是数字
else if (typeof data.placement === 'number') {
    applyInput = data.placement === 2;  // 2 = USER_INPUT
    applyOutput = data.placement === 1; // 1 = MD_DISPLAY (AI输出)
    if (data.placement !== 1 && data.placement !== 2) extraPlacements.push(data.placement);
}
}


// 只有在没有明确 placement 且不是导入的情况下，才默认应用（兼容旧格式/新建正则）
// 从酒馆导入的正则，如果没有 placement 设置，应该不自动应用
else if (!hasExplicitPlacement && !isImport) {
    // 旧格式或新建的正则，默认应用
    applyInput = true;
    applyOutput = true;
}
// 如果是导入的但 placement 未定义，或 placement 为空数组，保持不应用（酒馆行为）

// trimStrings 格式转换：支持字符串（逗号分隔）或数组
function normalizeTrimStrings(val) {
    if (Array.isArray(val)) return val.filter(function(s) { return s && s.trim(); });
    if (typeof val === 'string' && val.trim()) {
        return val.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    }
return [];
}

return {
    id: data.id || Date.now() + Math.random(),
    name: data.scriptName || data.name || '导入的正则',
    findPattern: data.findRegex || data.find || '',
    replaceString: data.replaceString || data.replace || '',
    applyInput: applyInput,
    applyOutput: applyOutput,
    enabled: !data.disabled && data.enabled !== false,
    imported: true,
    trimStrings: normalizeTrimStrings(data.trimStrings),
    markdownOnly: !!data.markdownOnly,
    promptOnly: !!data.promptOnly,
    runOnEdit: !!data.runOnEdit,
    // substituteRegex兼容布尔值和字符串格式
    substituteRegex: (function() {
        var sub = data.substituteRegex;
        if (sub === true || sub === 'Raw') return 1;       // RAW
        if (sub === 'Escaped') return 2;                     // ESCAPED
        if (typeof sub === 'number' && sub > 0) return sub;  // 数字值直接使用
        return 0;                                           // NONE
    })(),
minDepth: data.minDepth != null ? data.minDepth : null,
maxDepth: data.maxDepth != null ? data.maxDepth : null,
_originalPlacement: Array.isArray(data.placement) ? data.placement.slice() : (typeof data.placement === 'number' ? [data.placement] : null) // 保留原始 placement 用于导出
};
},

// 编辑脚本
editScript: function(idx) {
    // [B7修复] 预设正则不在此处编辑（saveScript 写全局 this.scripts 会改错对象）
    if (this._detailGroupType === 'preset') {
        UI.toast('预设正则请通过预设编辑器修改');
        return;
    }
    var scripts = this._getCurrentGroupScripts ? this._getCurrentGroupScripts() : this.scripts;
    var script = scripts[idx];
    if (!script) return;

    this._editingId = script.id;
    document.getElementById('regexEditTitle').textContent = '编辑正则';
    document.getElementById('regexScriptName').value = script.name || '';
    document.getElementById('regexFindPattern').value = script.findPattern || '';
    document.getElementById('regexReplaceString').value = script.replaceString || '';
    document.getElementById('regexApplyInput').checked = !!script.applyInput;
    document.getElementById('regexApplyOutput').checked = !!script.applyOutput;
    document.getElementById('regexEnabled').checked = !!script.enabled;

    // 同步自定义checkbox
    var inputWrap = document.getElementById('regexApplyInputWrap');
    var outputWrap = document.getElementById('regexApplyOutputWrap');
    if (inputWrap) inputWrap.classList.toggle('checked', !!script.applyInput);
    if (outputWrap) outputWrap.classList.toggle('checked', !!script.applyOutput);

    // 同步高级设置
    var mdOnlyWrap = document.getElementById('regexMarkdownOnlyWrap');
    if (mdOnlyWrap) mdOnlyWrap.classList.toggle('checked', !!script.markdownOnly);
    var promptOnlyWrap = document.getElementById('regexPromptOnlyWrap');
    if (promptOnlyWrap) promptOnlyWrap.classList.toggle('checked', !!script.promptOnly);
    var runOnEditWrap = document.getElementById('regexRunOnEditWrap');
    if (runOnEditWrap) runOnEditWrap.classList.toggle('checked', !!script.runOnEdit);

    var minDepthEl = document.getElementById('regexMinDepth');
    if (minDepthEl) minDepthEl.value = (script.minDepth != null ? script.minDepth : '');
    var maxDepthEl = document.getElementById('regexMaxDepth');
    if (maxDepthEl) maxDepthEl.value = (script.maxDepth != null ? script.maxDepth : '');

    var subRegexEl = document.getElementById('regexSubstituteRegex');
    if (subRegexEl) subRegexEl.value = (script.substituteRegex != null ? script.substituteRegex : 0);

    var trimEl = document.getElementById('regexTrimStrings');
    if (trimEl) trimEl.value = (script.trimStrings && script.trimStrings.length > 0) ? script.trimStrings.join(', ') : '';

    UI.showModal('regexEditModal');
},

// 保存脚本
saveScript: function() {
    // 从自定义checkbox同步到隐藏checkbox
    var inputWrap = document.getElementById('regexApplyInputWrap');
    var outputWrap = document.getElementById('regexApplyOutputWrap');
    if (inputWrap) document.getElementById('regexApplyInput').checked = inputWrap.classList.contains('checked');
    if (outputWrap) document.getElementById('regexApplyOutput').checked = outputWrap.classList.contains('checked');

    var name = document.getElementById('regexScriptName').value.trim();
    var findPattern = document.getElementById('regexFindPattern').value.trim();
    var replaceString = document.getElementById('regexReplaceString').value;
    var applyInput = document.getElementById('regexApplyInput').checked;
    var applyOutput = document.getElementById('regexApplyOutput').checked;
    var enabled = document.getElementById('regexEnabled').checked;

    if (!name) {
        UI.toast('请输入脚本名称');
        return;
    }
if (!findPattern) {
    UI.toast('请输入查找正则');
    return;
}

// 读取高级设置
var mdOnlyWrap = document.getElementById('regexMarkdownOnlyWrap');
var promptOnlyWrap = document.getElementById('regexPromptOnlyWrap');
var runOnEditWrap = document.getElementById('regexRunOnEditWrap');
var minDepthEl = document.getElementById('regexMinDepth');
var maxDepthEl = document.getElementById('regexMaxDepth');
var subRegexEl = document.getElementById('regexSubstituteRegex');
var trimEl = document.getElementById('regexTrimStrings');

var minDepthVal = minDepthEl ? minDepthEl.value.trim() : '';
var maxDepthVal = maxDepthEl ? maxDepthEl.value.trim() : '';
var trimVal = trimEl ? trimEl.value.trim() : '';

var script = {
    id: this._editingId || Date.now(),
    name: name,
    findPattern: findPattern,
    replaceString: replaceString,
    applyInput: applyInput,
    applyOutput: applyOutput,
    enabled: enabled,
    imported: false,
    markdownOnly: mdOnlyWrap ? mdOnlyWrap.classList.contains('checked') : false,
    promptOnly: promptOnlyWrap ? promptOnlyWrap.classList.contains('checked') : false,
    runOnEdit: runOnEditWrap ? runOnEditWrap.classList.contains('checked') : false,
    minDepth: minDepthVal !== '' ? parseInt(minDepthVal) : null,
    maxDepth: maxDepthVal !== '' ? parseInt(maxDepthVal) : null,
    substituteRegex: subRegexEl ? parseInt(subRegexEl.value) : 0,
    trimStrings: trimVal !== '' ? trimVal.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [],
    // 保存时保留原始 _originalPlacement 中的额外 placement 值
    // 只更新 applyInput/applyOutput 对应的 1/2，保留其他值（如 5=WORLD_INFO）
    _originalPlacement: (function() {
        // [B6修复] 捕获 _editingId 到闭包变量，避免 find 回调内 this 丢失
        var editingId = this._editingId;
        var existing = (editingId && this.scripts)
        ? (this.scripts.find(function(s) { return s.id === editingId; }) || {})._originalPlacement
        : null;
        var base = Array.isArray(existing) ? existing.filter(function(p) { return p !== 1 && p !== 2; }) : [];
        // [B3修复] placement 1=MD_DISPLAY(AI输出), 2=USER_INPUT(用户输入)
        if (applyOutput && base.indexOf(1) === -1) base.push(1);
        if (applyInput && base.indexOf(2) === -1) base.push(2);
        return base;
    }).call(this)
};

if (this._editingId) {
    // 更新现有脚本
    for (var i = 0; i < this.scripts.length; i++) {
        if (this.scripts[i].id === this._editingId) {
            this.scripts[i] = script;
            break;
        }
}
} else {
// 新建脚本
this.scripts.push(script);
}

if (this.scripts.length > 50) this.scripts = this.scripts.slice(0, 50);
this.save();
UI.hideModal('regexEditModal');
this.renderScriptList();
UI.toast('正则脚本已保存');
},


// 用户在保存前可发现语法错误，避免保存后在运行时才暴露
testScript: function() {
    var findPattern = document.getElementById('regexFindPattern').value.trim();
    var replaceString = document.getElementById('regexReplaceString').value;
    if (!findPattern) {
        UI.toast('请输入查找正则');
        return;
    }

    // 解析 flags
    var flags = 'g';
    var regexBody = findPattern;
    var match = findPattern.match(/^\/(.+)\/([gimuy]*)$/);
    if (match) {
        regexBody = match[1];
        flags = match[2] || 'g';
        if (flags.indexOf('g') === -1) flags += 'g';
    }

    // 1. 验证语法
    var regex;
    try {
        regex = new RegExp(regexBody, flags);
    } catch (e) {
        UI.toast('正则语法错误: ' + e.message);
        console.warn('[RegexManager] 测试失败 - 语法错误:', e.message, 'pattern:', regexBody);
        return;
    }

    // 2. ReDoS 风险检查
    var redosPatterns = [
        /\((\([^()]*\)|[^()]*)*\+/,
        /\([^)]*\)\{[^}]*\}\{[^}]*\}/,
        /(\.\*|\.\+)[\*\+\?]\*[\*\+\?]/,
        /\(\.\*\)\+/,
        /\(\.\+\)\+/
    ];
    for (var ri = 0; ri < redosPatterns.length; ri++) {
        if (redosPatterns[ri].test(regexBody)) {
            UI.toast('⚠ 检测到潜在 ReDoS 风险，建议优化正则');
            return;
        }
    }

    // 3. 应用到示例文本，让用户看到匹配结果
    var sampleText = '这是一段示例文本，可用于测试正则匹配。\n英文 hello world 也会被扫描。';
    var replacement = (replaceString || '').replace(/{{match}}/g, '$&');
    var result;
    try {
        result = sampleText.replace(regex, replacement);
    } catch (e) {
        UI.toast('替换执行错误: ' + e.message);
        console.warn('[RegexManager] 测试失败 - 替换错误:', e.message);
        return;
    }

    // 4. 显示结果（用 createModal 弹窗，标题与关闭按钮内嵌在 html 中）
    var matchCountRe = new RegExp(regexBody, flags.indexOf('g') !== -1 ? flags : flags + 'g');
    var matchCount = (sampleText.match(matchCountRe) || []).length;
    var html = '<div style="font-size:12px;line-height:1.6;word-break:break-all;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:8px;">'
        + '<b style="font-size:14px;">正则测试结果</b>'
        + '<button class="circle-btn" onclick="UI.hideModal(this.closest(\'.modal-overlay\').id)" style="width:24px;height:24px;padding:0;">×</button>'
        + '</div>'
        + '<div style="margin-bottom:8px;color:var(--text-tertiary);">匹配次数: <b style="color:var(--success);">' + matchCount + '</b></div>'
        + '<div style="margin-bottom:4px;color:var(--text-tertiary);">原文:</div>'
        + '<pre style="background:var(--bg);padding:8px;border-radius:6px;white-space:pre-wrap;max-height:120px;overflow:auto;border:1px solid var(--border);margin:0 0 8px;">' + escapeHtml(sampleText) + '</pre>'
        + '<div style="margin:8px 0 4px;color:var(--text-tertiary);">替换后:</div>'
        + '<pre style="background:var(--bg);padding:8px;border-radius:6px;white-space:pre-wrap;max-height:120px;overflow:auto;border:1px solid var(--border);margin:0;">' + escapeHtml(result) + '</pre>'
        + '</div>';
    UI.createModal({ html: html });
},


// 删除脚本（编辑弹窗内）
deleteScript: async function() {
    if (!this._editingId) {
        UI.hideModal('regexEditModal');
        return;
    }
var ok = await UI.confirm('删除正则', '确定删除这个正则脚本？');
if (!ok) return;

this.scripts = this.scripts.filter(function(s) { return s.id !== RegexManager._editingId; });
this.save();
UI.hideModal('regexEditModal');
this.renderScriptList();
UI.toast('正则脚本已删除');
},

// 清空所有全局正则脚本（预设正则不受影响）
clearAllScripts: async function() {
    var count = this.scripts.length;
    if (count === 0) {
        UI.toast('没有可清空的全局正则脚本');
        return;
    }
var ok = await UI.confirm('清空全部正则', '确定清空所有 ' + count + ' 条全局正则脚本？\n\n注意：预设绑定的正则不受影响，切换预设时会自动恢复。');
if (!ok) return;

this.scripts = [];
this.save();
this.renderScriptList();
UI.toast('已清空 ' + count + ' 条全局正则脚本');
},

// ===== 执行引擎 =====

// placement常量定义（与SillyTavern一致）
// 酒馆标准: 1=MD显示(AI输出), 2=用户输入, 3=斜杠命令, 4=世界信息, 5=宏/命令, 6=推理
PLACEMENT: {
    MD_DISPLAY: 1,     // MD显示 - AI输出渲染后
    USER_INPUT: 2,     // 用户输入
    SLASH_COMMAND: 3,  // 斜杠命令
    WORLD_INFO: 4,     // 世界信息
    MACRO_COMMAND: 5,  // 宏/命令处理
    REASONING: 6       // 推理/COT
},

// 应用于文本
// placement: 'input'(用户输入), 'output'(AI输出), 'display'(仅显示), 'prompt'(仅prompt), 'worldInfo'(世界信息), 'reasoning'(推理)
apply: function(text, placement, messageIndex) {
    const self = this;
    var result = text;

    // 【根因修复 1】运行时超时保护：单个正则脚本执行超过阈值时跳过后续脚本。
    // 这是防止用户配置的低质量正则触发灾难性回溯导致浏览器冻结 150s+ 的最后防线。
    // RegexSafetyChecker.isSafe 是事前静态检查，无法防止运行时回溯，必须配合运行时计时。
    var _applyStartTime = Date.now();
    var _APPLY_TOTAL_TIMEOUT_MS = 5000;  // 全部脚本总执行上限 5 秒
    var _APPLY_PER_SCRIPT_MS = 2000;     // 单脚本上限 2 秒（足够正常正则，回溯爆炸会被截断）

    // 使用 getAllScripts() 获取全局正则 + 当前预设正则
    var allScripts = this.getAllScripts();
    for (var _si = 0; _si < allScripts.length; _si++) {
        // 总超时检查
        if (Date.now() - _applyStartTime > _APPLY_TOTAL_TIMEOUT_MS) {
            console.warn('[RegexManager] 总执行时间超过 ' + _APPLY_TOTAL_TIMEOUT_MS + 'ms，跳过剩余 ' + (allScripts.length - _si) + ' 个脚本');
            break;
        }
        var script = allScripts[_si];
        if (!self.isScriptEnabled(script)) continue;

        // 检查是否应该应用于当前位置
        // 构建 placement 集合（去重）
        var placements = [];
        if (script._originalPlacement) {
            script._originalPlacement.forEach(function(p) {
                if (placements.indexOf(p) === -1) placements.push(p);
            });
    }
// [T1-P1-14] 数字语义与 PLACEMENT 表对齐：1=AI_OUTPUT, 2=USER_INPUT
if (script.applyInput && placements.indexOf(2) === -1) placements.push(2);  // USER_INPUT
if (script.applyOutput && placements.indexOf(1) === -1) placements.push(1); // AI_OUTPUT

var shouldApply = false;

// 根据 placement 参数检查是否应该应用
// [T1-P1-14] 数字语义与 PLACEMENT 表对齐：1=AI_OUTPUT, 2=USER_INPUT, 4=WORLD_INFO, 6=REASONING
switch(placement) {
    case 'input':
    case 'user_input':
    // 2 = USER_INPUT
    shouldApply = placements.includes(2) || placements.includes('USER_INPUT');
    break;
    case 'output':
    case 'ai_output':
    // 1 = AI_OUTPUT (MD_DISPLAY)
    shouldApply = placements.includes(1) || placements.includes('AI_OUTPUT');
    break;
    case 'worldInfo':
    case 'world_info':
    // 4 = WORLD_INFO
    shouldApply = placements.includes(4) || placements.includes('WORLD_INFO');
    break;
    case 'reasoning':
    // 6 = REASONING (旧版本 5 = MACRO_COMMAND)
    shouldApply = placements.includes(6) || placements.includes('REASONING') || placements.includes(5) || placements.includes('MACRO_COMMAND');
    break;
    case 'display':
    // display模式：应用所有启用的脚本（除非明确排除）
    shouldApply = true;
    break;
    case 'prompt':
    // prompt模式：应用所有非display-only的脚本
    shouldApply = !script.markdownOnly;
    break;
    default:
    shouldApply = true;
}

if (!shouldApply) continue;

// runOnEdit: 仅在编辑模式下应用，正常生成流程中跳过
if (script.runOnEdit && placement !== 'edit') continue;

// markdownOnly: 仅在display模式下应用
if (script.markdownOnly && placement !== 'display') continue;

// promptOnly: 在 input/output/prompt/worldInfo/reasoning 模式下应用
// 不在 display 模式下应用（除非 markdownOnly 也为 true）
if (script.promptOnly && placement === 'display' && !script.markdownOnly) continue;

// 深度限制检查
if (messageIndex != null) {
    if (script.minDepth != null && script.minDepth > 0 && messageIndex < script.minDepth) continue;
    if (script.maxDepth != null && script.maxDepth > 0 && messageIndex > script.maxDepth) continue;
}

// 【根因修复 1】单脚本计时：记录执行前时间，执行后检查是否超时
var _scriptStartTime = Date.now();
try {
    result = self.applySingleScript(result, script);
} catch(e) {

    // 捕获 applySingleScript 未覆盖的异常（如 MacroEngine.process、trimStrings 等）
    if (script) {
        script._lastError = '执行异常: ' + (e && e.message ? e.message : String(e));
        script._errorTime = Date.now();
        script._errorCount = (script._errorCount || 0) + 1;
    }
    console.warn('[RegexManager] 脚本 "' + (script && script.name ? script.name : 'unnamed')
        + '" 执行异常，已跳过: ' + (e && e.message ? e.message : String(e)));
}
var _scriptElapsed = Date.now() - _scriptStartTime;
if (_scriptElapsed > _APPLY_PER_SCRIPT_MS) {
    // 单脚本执行超时，标记错误并跳过后续脚本（疑似灾难性回溯）
    if (script) {
        script._lastError = '执行超时(' + _scriptElapsed + 'ms)，疑似灾难性回溯';
        script._errorTime = Date.now();
        script._errorCount = (script._errorCount || 0) + 1;
    }
    console.warn('[RegexManager] 脚本 "' + (script && script.name ? script.name : 'unnamed')
        + '" 执行耗时 ' + _scriptElapsed + 'ms（超过 ' + _APPLY_PER_SCRIPT_MS + 'ms 上限），'
        + '疑似灾难性回溯，跳过剩余脚本。pattern: '
        + (script && script.findPattern ? script.findPattern.substring(0, 80) : 'unknown'));
    break;
}
}

return result;
},

// 应用单个脚本
applySingleScript: function(text, script) {
    var pattern = script.findPattern;
    var replacement = script.replaceString || '';


    // substituteRegex: 0=NONE, 1=RAW, 2=ESCAPED
    // 在应用正则之前，先处理 findPattern 和 replaceString 中的宏变量
    if (script.substituteRegex && script.substituteRegex > 0) {
        var subRegex = script.substituteRegex;
        // 获取宏环境变量
        var _smPlayerName = (typeof StateManager !== 'undefined' && StateManager.get) ? StateManager.get('entities.player.name') : '';
        var _smSnapshot = (typeof StateManager !== 'undefined' && StateManager.get) ? StateManager.get('progress.worldSnapshot') : null;
        var _smOriginal = (typeof StateManager !== 'undefined' && StateManager.get) ? StateManager.get('ui.lastOriginalContent') : '';
        var macroEnv = {
            user: _smPlayerName || '玩家',
            char: (_smSnapshot && _smSnapshot.characters && _smSnapshot.characters.length > 0) ? _smSnapshot.characters[0].name : '角色',
            original: _smOriginal || ''
        };

    // 处理 findPattern 中的宏
    if (subRegex === 1) {
        // RAW: 直接替换
        pattern = MacroEngine.process(pattern, macroEnv);
    } else if (subRegex === 2) {
    // ESCAPED: 转义后再替换
    var escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern = MacroEngine.process(escaped, macroEnv);
}

// 处理 replaceString 中的宏
if (subRegex === 1) {
    replacement = MacroEngine.process(replacement, macroEnv);
} else if (subRegex === 2) {
var escapedReplacement = replacement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
replacement = MacroEngine.process(escapedReplacement, macroEnv);
}
}

// 解析正则标志（如 /pattern/gi）
var flags = 'g';
var regexBody = pattern;

// 检查是否是 /pattern/flags 格式
var match = pattern.match(/^\/(.+)\/([gimuy]*)$/);
if (match) {
    regexBody = match[1];
    flags = match[2] || 'g';
    if (!flags.includes('g')) flags += 'g';
}

// 创建正则对象
// ReDoS 防护：统一使用 RegexSafetyChecker
if (typeof RegexSafetyChecker !== 'undefined' && !RegexSafetyChecker.isSafe(regexBody)) {
    console.warn('[RegexManager] 检测到潜在ReDoS风险的正则，已跳过执行: ' + regexBody.substring(0, 50));
    return text;
}


// 旧实现直接 new RegExp(regexBody, flags)，语法错误抛 SyntaxError 冒泡到 apply 的 try-catch
// 虽然外层会捕获，但仅 console.warn 不记录错误状态，下次调用又重新抛错，且 UI 无错误提示
var regex;
try {
    regex = new RegExp(regexBody, flags);
} catch (e) {
    if (script) {
        script._lastError = '语法错误: ' + e.message;
        script._errorTime = Date.now();
        script._errorCount = (script._errorCount || 0) + 1;
    }
    console.warn('[RegexManager] 正则脚本语法错误，已跳过: "'
        + (script && script.name ? script.name : 'unnamed')
        + '" pattern: ' + regexBody.substring(0, 80)
        + ' 错误: ' + e.message);
    return text;
}

// 处理替换字符串中的特殊变量
// $1, $2... 捕获组（原生支持）
// {{match}} 替换为 $&（整个匹配）
replacement = replacement.replace(/{{match}}/g, '$&');


var result;
try {
    result = text.replace(regex, replacement);
} catch (e) {
    if (script) {
        script._lastError = '替换错误: ' + e.message;
        script._errorTime = Date.now();
        script._errorCount = (script._errorCount || 0) + 1;
    }
    console.warn('[RegexManager] 正则替换执行错误，已跳过: "'
        + (script && script.name ? script.name : 'unnamed')
        + '" 错误: ' + e.message);
    return text;
}

// 成功执行后清除错误状态（错误恢复可见）
if (script && script._lastError) {
    script._lastError = null;
    script._errorTime = null;
}

// trimStrings: 从匹配结果中裁剪指定字符串
if (script.trimStrings && script.trimStrings.length > 0) {
    script.trimStrings.forEach(function(trimStr) {
        if (trimStr) {
            result = result.split(trimStr).join('');
        }
});
}

return result;
},

// 快捷方法：应用于用户输入
applyToInput: function(text) {
    return this.apply(text, 'input');
},

// 快捷方法：应用于AI输出
applyToOutput: function(text) {
    return this.apply(text, 'output');
},

// 导出所有正则脚本为JSON文件
exportScripts: function() {
    var exportData = this.scripts.map(function(s) {
        var placement = [];
        if (s.applyOutput) placement.push(1);  // 1 = MD_DISPLAY (AI输出)
        if (s.applyInput) placement.push(2);   // 2 = USER_INPUT
        if (s._originalPlacement) {
            s._originalPlacement.forEach(function(p) {
                if (placement.indexOf(p) === -1) placement.push(p);
            });
    }
return {
    scriptName: s.name,
    findRegex: s.findPattern,
    replaceString: s.replaceString,
    trimStrings: s.trimStrings || [],
    placement: placement,
    disabled: !s.enabled,
    markdownOnly: s.markdownOnly || false,
    promptOnly: s.promptOnly || false,
    runOnEdit: s.runOnEdit || false,
    substituteRegex: s.substituteRegex || 0,
    minDepth: s.minDepth != null ? s.minDepth : 0,
    maxDepth: s.maxDepth != null ? s.maxDepth : 0
};
});
UI.downloadJSON(exportData, 'regex_scripts.json');
}
};
