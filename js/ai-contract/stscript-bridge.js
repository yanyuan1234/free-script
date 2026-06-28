/**
 * STscript Bridge
 * 将原 patch.js 中的 STscript 引擎 hook 迁移至此，与新架构统一入口
 * 依赖：PresetManager, RegexManager, injectPresetGlobalVars, window.gameAdapter
 */
(function() {
    'use strict';

    var _initRetryCount = 0;
    var _INIT_RETRY_MAX = 5;

    function initSTscriptBridge() {
        if (typeof PresetManager === 'undefined') {
            if (_initRetryCount >= _INIT_RETRY_MAX) {
                console.error('[STscriptBridge] PresetManager 始终未就绪，已放弃集成');
                return;
            }
            _initRetryCount++;
            if (typeof TimerManager !== 'undefined' && TimerManager.setTimeout) {
                TimerManager.setTimeout('initSTscriptBridge', initSTscriptBridge, 100);
            } else {
                setTimeout(initSTscriptBridge, 100);
            }
            return;
        }

        if (typeof window.gameAdapter === 'undefined') {
            console.warn('[STscriptBridge] gameAdapter 未注入，跳过集成');
            return;
        }

        console.log('[STscriptBridge] 开始集成到游戏系统...');

        // ── Hook 1: PresetManager.loadPreset ──
        var origLoadPreset = PresetManager.loadPreset;
        PresetManager.loadPreset = function(idx) {
            _presetVarCacheKey = null;
            _presetVarParsed = false;

            var result = origLoadPreset.call(this, idx);

            var preset = this.presets[idx];
            if (preset && window.gameAdapter) {
                window.gameAdapter.onPresetLoaded(preset);

                if (typeof gameState !== 'undefined' && gameState.charName) {
                    window.gameAdapter.setCharacter({
                        id: 'current',
                        name: gameState.charName,
                        description: gameState.charDesc || '',
                        personality: gameState.charPersonality || '',
                        scenario: gameState.charScenario || ''
                    });
                }

                if (typeof gameState !== 'undefined' && gameState.playerName) {
                    window.gameAdapter.updateContext({ user: gameState.playerName });
                }
            }

            return result;
        };

        // ── Hook 3: 增强 injectPresetGlobalVars ──
        if (typeof injectPresetGlobalVars === 'function') {
            var origInject = injectPresetGlobalVars;
            var _presetVarCacheKey = null;
            var _presetVarParsed = false;

            injectPresetGlobalVars = function() {
                origInject.call(this);

                if (window.gameAdapter && window.gameAdapter.currentPreset) {
                    var preset = window.gameAdapter.currentPreset;
                    var prompts = preset.prompts || [];
                    var cacheKey = (preset.name || '') + '_' + prompts.length;

                    if (_presetVarCacheKey !== cacheKey || !_presetVarParsed) {
                        _presetVarCacheKey = cacheKey;
                        _presetVarParsed = true;

                        prompts.forEach(function(p) {
                            if (p.enabled !== false && p.content) {
                                window.gameAdapter.parse(p.content);
                            }
                        });
                    }
                }
            };
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

        console.log('[STscriptBridge] ✅ 集成完成');
    }

    if (document.readyState === 'loading') {
        if (typeof GlobalCleanup !== 'undefined') {
            GlobalCleanup.registerListener(document, 'DOMContentLoaded', initSTscriptBridge);
        } else {
            document.addEventListener('DOMContentLoaded', initSTscriptBridge);
        }
    } else {
        initSTscriptBridge();
    }
})();
