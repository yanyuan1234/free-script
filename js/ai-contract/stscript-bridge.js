// ========================================
// STscript 桥接层
// 将原 patch.js 中的 STscript 集成逻辑迁入 ai-contract 目录，
// 与 response-parser.js / output-sanitizer.js / prompt-builder.js 形成统一契约层。
// ========================================
(function() {
    'use strict';

    // 等待游戏核心模块加载完毕
    // （defer 脚本按顺序执行，正常情况下 PresetManager 必然已就绪；
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

        // gameAdapter 未注入时早退，不再挂载无效 hook
        if (typeof window.gameAdapter === 'undefined') {
            console.warn('[STscript] gameAdapter 未注入，跳过集成');
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

        // ── Hook 3: 增强 injectPresetGlobalVars ──
        // 在全局变量注入时同时处理STscript变量
        // 性能优化：使用缓存，只在预设切换时重新解析
        if (typeof injectPresetGlobalVars === 'function') {
            var origInject = injectPresetGlobalVars;
            var _presetVarCacheKey = null;
            var _presetVarParsed = false;

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

                        for (var i = 0; i < prompts.length; i++) {
                            var p = prompts[i];
                            if (p.enabled !== false && p.content) {
                                window.gameAdapter.parse(p.content);
                            }
                        }
                    }
                }
            };

            // 预设切换时的缓存清除已合并到 Hook 1 (PresetManager.loadPreset) 中
        }

        // ── Hook 6: 增强 RegexManager 支持月读/蛾摩拉正则格式 ──
        if (typeof RegexManager !== 'undefined') {
            var origApplyToOutput = RegexManager.applyToOutput;
            if (origApplyToOutput) {
                RegexManager.applyToOutput = function(text) {
                    text = origApplyToOutput.call(this, text);

                    if (window.gameAdapter && window.gameAdapter.currentPreset) {
                        text = window.gameAdapter.processResponse(text, {
                            messageDepth: (typeof gameState !== 'undefined') ?
                                (gameState.conversationHistory || []).length : 0
                        });
                    }

                    return text;
                };
            }

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

        console.log('[STscript] 集成完成！兼容引擎已激活');
    }

    // 启动集成
    if (document.readyState === 'loading') {
        GlobalCleanup.registerListener(document, 'DOMContentLoaded', initSTscriptIntegration);
    } else {
        initSTscriptIntegration();
    }
})();
