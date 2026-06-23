// ============================================================
// STscript 引擎 - 游戏集成 Hook
// ============================================================
(function() {
    'use strict';

    // 等待游戏核心模块加载完毕
    function initSTscriptIntegration() {
        if (typeof PresetManager === 'undefined') {
            TimerManager.setTimeout('initSTscript', initSTscriptIntegration, 100);
            return;
        }

        console.log('[STscript] 开始集成到游戏系统...');

        // ── Hook 1: PresetManager.loadPreset ──
        // 在预设加载后激活STscript引擎 + 清除变量缓存
        var origLoadPreset = PresetManager.loadPreset;
        PresetManager.loadPreset = function(idx) {
            // 清除 injectPresetGlobalVars 的变量解析缓存
            _presetVarCacheKey = null;
            _presetVarParsed = false;

            // 调用原始加载
            var result = origLoadPreset.call(this, idx);

            // 激活STscript引擎
            var preset = this.presets[idx];
            if (preset && window.gameAdapter) {
                window.gameAdapter.onPresetLoaded(preset);

                // 设置角色信息
                if (typeof gameState !== 'undefined' && gameState.charName) {
                    window.gameAdapter.setCharacter({
                        id: 'current',
                        name: gameState.charName,
                        description: gameState.charDesc || '',
                        personality: gameState.charPersonality || '',
                        scenario: gameState.charScenario || ''
                    });
                }

                // 设置用户名
                if (typeof gameState !== 'undefined' && gameState.playerName) {
                    window.gameAdapter.updateContext({ user: gameState.playerName });
                }
            }

            return result;
        };

        // ── Hook 2: sendAIRequest - 已移除 ──
        // 原本计划在此预处理用户输入，但 RegexManager.applyToInput 已覆盖该功能，无需重复

        // ── Hook 3: 增强 injectPresetGlobalVars ──
        // 在全局变量注入时同时处理STscript变量
        // 性能优化：使用缓存，只在预设切换时重新解析，避免每次发消息都全量遍历
        if (typeof injectPresetGlobalVars === 'function') {
            var origInject = injectPresetGlobalVars;
            var _presetVarCacheKey = null; // 缓存键：预设名称+prompt数量
            var _presetVarParsed = false;  // 是否已解析过

            injectPresetGlobalVars = function() {
                origInject.call(this);

                // 额外：处理当前预设中的 setvar/getvar（带缓存）
                if (window.gameAdapter && window.gameAdapter.currentPreset) {
                    var preset = window.gameAdapter.currentPreset;
                    var prompts = preset.prompts || [];
                    var cacheKey = (preset.name || '') + '_' + prompts.length;

                    // 只在预设切换或首次时执行全量解析
                    if (_presetVarCacheKey !== cacheKey || !_presetVarParsed) {
                        _presetVarCacheKey = cacheKey;
                        _presetVarParsed = true;

                        prompts.forEach(function(p) {
                            if (p.enabled !== false && p.content) {
                                // 解析并执行 setvar 等指令
                                window.gameAdapter.parse(p.content);
                            }
                        });
                    }
                }
            };

            // 注意：预设切换时的缓存清除已合并到 Hook 1 (PresetManager.loadPreset) 中
        }

        // ── Hook 4: onStreamChunk - 已移除 ──
        // 流式chunk不应用美化正则（避免频繁DOM操作），正则在最终渲染时通过 Hook 6 处理

        // ── Hook 5: renderStory - 已移除 ──
        // 与 Hook 6 (RegexManager.applyToOutput) 重复，已在 Hook 6 中统一处理

        // ── Hook 6: 增强 RegexManager 支持月读/蛾摩拉正则格式 ──
        if (typeof RegexManager !== 'undefined') {
            // 保存原始 applyToOutput
            var origApplyToOutput = RegexManager.applyToOutput;
            if (origApplyToOutput) {
                RegexManager.applyToOutput = function(text) {
                    // 先用游戏原始正则处理
                    text = origApplyToOutput.call(this, text);

                    // 再用STscript引擎处理（兼容月读/蛾摩拉格式）
                    if (window.gameAdapter && window.gameAdapter.currentPreset) {
                        text = window.gameAdapter.processResponse(text, {
                            messageDepth: (typeof gameState !== 'undefined') ?
                                (gameState.conversationHistory || []).length : 0
                        });
                    }

                    return text;
                };
            }

            // 增强 applyToInput
            var origApplyToInput = RegexManager.applyToInput;
            if (origApplyToInput) {
                RegexManager.applyToInput = function(text) {
                    text = origApplyToInput.call(this, text);

                    if (window.gameAdapter && window.gameAdapter.currentPreset) {
                        text = window.gameAdapter.processUserInput(text);
                    }

                    return text;
                };
            }
        }

        // ── Hook 7: 预设导入增强 ──
        // 当用户导入酒馆预设JSON时，自动标准化格式
        if (typeof PresetManager !== 'undefined' && PresetManager.importPreset) {
            var origImport = PresetManager.importPreset;
            PresetManager.importPreset = function(data) {
                // 标准化预设格式
                if (data && !data._stscriptNormalized) {
                    data._stscriptNormalized = true;

                    // 确保 prompts 是数组
                    if (!Array.isArray(data.prompts)) data.prompts = [];

                    // 提取 extensions.regex_scripts
                    if (!data.regexScripts && data.extensions && data.extensions.regex_scripts) {
                        data.regexScripts = data.extensions.regex_scripts;
                    }

                    // 提取 extensions.tavern_helper
                    if (data.extensions && data.extensions.tavern_helper) {
                        data._tavernHelperScripts = data.extensions.tavern_helper.scripts || [];
                    }

                    // 提取 extensions.entryGrouping
                    if (data.extensions && data.extensions.entryGrouping) {
                        data._entryGrouping = data.extensions.entryGrouping;
                    }

                    // 自动检测预设类型
                    if (window.PresetConfigManager) {
                        data._presetType = PresetConfigManager.detectPresetType(data);
                        console.log('[STscript] 预设类型:', data._presetType);
                    }

                    // 验证兼容性
                    if (window.PresetConfigManager) {
                        var validation = PresetConfigManager.validatePreset(data);
                        validation.info.forEach(function(msg) {
                            console.log('[STscript] ' + msg);
                        });
                        validation.warnings.forEach(function(msg) {
                            console.warn('[STscript] ⚠️ ' + msg);
                        });
                    }
                }

                return origImport.call(this, data);
            };
        }

        console.log('[STscript] ✅ 集成完成！兼容引擎已激活');
        console.log('[STscript] 支持预设：果实·叶子版 / 月读·Gemini / 蛾摩拉☼');
    }

    // 启动集成
    if (document.readyState === 'loading') {
        GlobalCleanup.registerListener(document, 'DOMContentLoaded', initSTscriptIntegration);
    } else {
        initSTscriptIntegration();
    }
})();

/**
 * ============================================================================
 * 全局修复与优化模块 - 安全版本
 * 此补丁添加在原有代码之后，不修改原有代码
 * ============================================================================
 */
(function() {
    'use strict';
    
    console.log('[Fix Patch v3.0] 加载安全修复补丁...');
    
    // ============================================================================
    // 1. 内存泄漏修复 - 定时器管理器
    // ============================================================================
    // TimerManager 已在 utils.js 中统一定义（带ID管理），此处不再重复声明

    // ============================================================================
    // 2. 安全的状态访问工具
    // ============================================================================
    // StateUtils 已移除——StateManager.get/set 提供相同能力且支持路径翻译与通知
    
    // ============================================================================
    // 3. 防抖/节流工具
    // ============================================================================
    // debounce/throttle 已在 utils.js 中统一定义，此处不再重复声明
    
    // ============================================================================
    // 4. 全局错误处理增强
    // ============================================================================
    GlobalCleanup.registerListener(window, 'error', (e) => {
        // 过滤图片/CSS等资源加载错误（不显示给用户）
        if (e.target && (e.target.tagName === 'IMG' || e.target.tagName === 'LINK' || e.target.tagName === 'SCRIPT')) {
            return;
        }
        console.error('[全局错误]', e.message, 'at', e.filename, ':', e.lineno);
        if (typeof UI !== 'undefined' && UI.toast) {
            UI.toast('发生错误: ' + e.message);
        }
    }, true);
    
    GlobalCleanup.registerListener(window, 'unhandledrejection', (e) => {
        console.error('[未处理的Promise]', e.reason);
        if (typeof UI !== 'undefined' && UI.toast) {
            UI.toast('异步操作失败');
        }
        e.preventDefault();
    });
    
    // ============================================================================
    // 5. 页面生命周期管理 (Fix Issue 36: merged into first beforeunload handler)
    // ============================================================================
    
    // ============================================================================
    // 6. 移动端触摸优化
    // ============================================================================
    (function() {
        // 防止双击缩放
        let lastTouchEnd = 0;
        GlobalCleanup.registerListener(document, 'touchend', (e) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, { passive: false });
        
        // 优化滚动性能
        TimerManager.setTimeout('scrollOptimize', function() {
            const scrollables = document.querySelectorAll('.scrollable, .page, .modal-body, #gameContent');
            scrollables.forEach(el => {
                if (el) el.style.webkitOverflowScrolling = 'touch';
            });
        }, 100);
    })();
    
    // ============================================================================
    // 7. 确保关键对象存在
    // ============================================================================
    if (typeof gameState === 'undefined') {
        window.gameState = {};
    }
    
    // 确保关键路径存在
    const ensureExists = (path, defaultValue = {}) => {
        const keys = path.split('.');
        let current = window;
        
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (i === keys.length - 1) {
                if (current[key] === undefined) {
                    current[key] = defaultValue;
                }
            } else {
                if (!current[key] || typeof current[key] !== 'object') {
                    current[key] = {};
                }
                current = current[key];
            }
        }
    };
    
    ensureExists('gameState.allCharacters', {});
    ensureExists('gameState.currentBag', []);
    ensureExists('gameState.currentQuests', []);
    ensureExists('gameState.relationships', []);
    ensureExists('gameState.keyEvents', []);
    ensureExists('gameState.conversationHistory', []);
    
    // 确保动态属性存在
    if (!gameState._chatLogs || Array.isArray(gameState._chatLogs)) gameState._chatLogs = {};
    if (!gameState._theaterContent) gameState._theaterContent = {};
    if (!Array.isArray(gameState._worldModules)) gameState._worldModules = [];
    if (!gameState._chattedNpcs) gameState._chattedNpcs = {};
    if (!gameState._chatRemarks) gameState._chatRemarks = {};
    if (!gameState._blockedNpcs) gameState._blockedNpcs = {};
    if (!gameState._presetApps) gameState._presetApps = {};
    if (!gameState._depthPrompts) gameState._depthPrompts = {};
    if (!gameState._positionPrompts) gameState._positionPrompts = {};
    if (!Array.isArray(gameState._afterChatPrompts)) gameState._afterChatPrompts = [];
    if (!Array.isArray(gameState._undoHistory)) gameState._undoHistory = [];
    if (!gameState.pinnedModules) gameState.pinnedModules = {};
    
    console.log('[Fix Patch v3.0] ✅ 安全修复补丁已加载');
})();
