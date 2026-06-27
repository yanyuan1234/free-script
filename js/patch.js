// ============================================================
// STscript 引擎 - 游戏集成 Hook
// ============================================================
//
// 【P1修复BUG-7.9】patch.js 与新架构职责重叠
// -----------------------------------------------
// 本文件通过猴子补丁 hook PresetManager / RegexManager 实现 STscript 引擎集成：
//   - Hook 1: PresetManager.loadPreset → gameAdapter.onPresetLoaded
//   - Hook 3: injectPresetGlobalVars → gameAdapter.parse (setvar/getvar)
//   - Hook 6: RegexManager.applyToOutput/Input → gameAdapter.processResponse/UserInput
//   - （Hook 7 已删除 - 见 P2-D12）
//
// `js/ai-contract/` 目录存在新的 response-parser.js / output-sanitizer.js /
// prompt-builder.js，与 Hook 6（gameAdapter.processResponse）+ Hook 3（gameAdapter.parse）
// 在职责上重合：都是「正则脚本 / prompt 构建」的执行入口。
//
// 修复路线（短期文档化 + 中期迁移）：
//   - 短期（本注释 + 死代码清理）：删除已移除的 Hook 2/4/5 注释占位、空章节注释
//   - 中期：将本文件 hook 逻辑迁入 `ai-contract/stscript-bridge.js`，与新架构合并为
//            单一入口；删除 patch.js
//   - 迁移要点：所有 hook 必须保留「先调原始方法再调 gameAdapter」的语义，
//              否则会破坏 PresetManager/RegexManager 的现有调用方
//
// 注：本会话内仅完成短期死代码清理，物理迁移延后到独立重构任务。
(function() {
    'use strict';

    // 等待游戏核心模块加载完毕
    // 【附录B-6】原代码 100ms 自重试轮询，现改为单次重试 + 上限 5 次
    // （defer 脚本按顺序执行，patch.js 最后加载，正常情况 PresetManager 必然已就绪；
    //   此重试仅为异步竞态的兜底，不应无限循环）
    var _initRetryCount = 0;
    var _INIT_RETRY_MAX = 5;
    function initSTscriptIntegration() {
        if (typeof PresetManager === 'undefined') {
            if (_initRetryCount >= _INIT_RETRY_MAX) {
                console.error('[STscript] PresetManager 始终未就绪，已放弃集成');
                return;
            }
            _initRetryCount++;
            if (typeof TimerManager !== 'undefined' && TimerManager.setTimeout) {
                TimerManager.setTimeout('initSTscript', initSTscriptIntegration, 100);
            } else {
                setTimeout(initSTscriptIntegration, 100);
            }
            return;
        }

        // 【附录B-4】gameAdapter 未注入时早退，不再静默挂着 4 个无效 hook
        // 原代码：Hook 1/3/6/7 全部走 `if (window.gameAdapter)` 内部判断，gameAdapter
        // 缺失时所有 hook 静默无效，但猴补丁仍挂在 PresetManager/RegexManager 上，
        // 每次调用都多走一层函数调用 + 闭包变量检查。
        // 修复：未注入则直接早退，不再执行后续 hook 挂载。
        if (typeof window.gameAdapter === 'undefined') {
            console.warn('[STscript] gameAdapter 未注入，跳过集成（Hook 1/3/6/7 不挂载）');
            return;
        }

        console.log('[STscript] 开始集成到游戏系统...');

        // ── Hook 1: PresetManager.loadPreset ──
        // 在预设加载后激活STscript引擎 + 清除变量缓存
        const origLoadPreset = PresetManager.loadPreset;
        PresetManager.loadPreset = function(idx) {
            // 清除 injectPresetGlobalVars 的变量解析缓存
            _presetVarCacheKey = null;
            _presetVarParsed = false;

            // 调用原始加载
            const result = origLoadPreset.call(this, idx);

            // 激活STscript引擎
            const preset = this.presets[idx];
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

        // ── Hook 3: 增强 injectPresetGlobalVars ──
        // 在全局变量注入时同时处理STscript变量
        // 性能优化：使用缓存，只在预设切换时重新解析，避免每次发消息都全量遍历
        if (typeof injectPresetGlobalVars === 'function') {
            const origInject = injectPresetGlobalVars;
            var _presetVarCacheKey = null; // 缓存键：预设名称+prompt数量
            var _presetVarParsed = false;  // 是否已解析过

            injectPresetGlobalVars = function() {
                origInject.call(this);

                // 额外：处理当前预设中的 setvar/getvar（带缓存）
                if (window.gameAdapter && window.gameAdapter.currentPreset) {
                    const preset = window.gameAdapter.currentPreset;
                    const prompts = preset.prompts || [];
                    const cacheKey = (preset.name || '') + '_' + prompts.length;

                    // 只在预设切换或首次时执行全量解析
                    if (_presetVarCacheKey !== cacheKey || !_presetVarParsed) {
                        _presetVarCacheKey = cacheKey;
                        _presetVarParsed = true;

                        prompts.forEach(p => {
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

        // ── Hook 6: 增强 RegexManager 支持月读/蛾摩拉正则格式 ──
        if (typeof RegexManager !== 'undefined') {
            // 保存原始 applyToOutput
            const origApplyToOutput = RegexManager.applyToOutput;
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
            const origApplyToInput = RegexManager.applyToInput;
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
        // 【P2-D12 阶段4】删除：PresetManager 实际无 importPreset 方法（实际为 importFromFile），
        // 整段 if 永远 false，44 行死代码。预设标准化已由 PresetManager.parsePreset 内部完成。
        // 同时移除顶部注释里的 "Hook 7" 引用。
        // （占位已删，下方原 Hook 7 代码已移除）

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
    // 6. 移动端触摸优化
    // ============================================================================
    (function() {
        // 【附录B-5】iOS 17+ Safari 已移除 300ms 触摸延迟，此处的 preventDefault 会误伤
        // 合法双击操作。改用 HTML viewport meta 控制缩放（index.html 已设置）：
        //   <meta name="viewport" content="..., maximum-scale=1, user-scalable=no">
        // 移除 touchend 监听器。

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
