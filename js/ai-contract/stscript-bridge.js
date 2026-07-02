/**
 * STscript Bridge
 * 将原 patch.js 中的 STscript 引擎 hook 迁移至此，与新架构统一入口
 * 依赖：PresetManager, RegexManager, injectPresetGlobalVars, window.gameAdapter
 *
 * 职责边界（CP-06 误报澄清）：
 *   本文件是 BRIDGE，只负责把酒馆生态（PresetManager / RegexManager / STscript macro 引擎）
 *   的状态变更同步到游戏世界，不是 slash command 注册器。
 *
 *   真正的 slash command 引擎在 js/tavern-compat.js（TavernHelperCompat）：
 *     - registerSlashCommand（line 167）  // 注册用户/预设命令
 *     - triggerSlash（line 169）          // 执行管道命令
 *     - _executeSingleCommand（line 181）  // 39 个内置命令（switch/case）
 *     - _loadPresetConfigs（line 790）    // 加载预设配置命令
 *     - window.SillyTavern（line 840）    // SillyTavern API shim
 *
 * 验证对比 backup/index.html：39/39 内置命令完全一致
 *   （详见 docs/CP-06-误报审计-2026-07-02.md）
 */
(function() {
    'use strict';

    // [T1-P1-23] 拆分 3 个依赖的独立重试：PresetManager / injectPresetGlobalVars / RegexManager
    // 旧实现只检测 PresetManager，injectPresetGlobalVars / RegexManager 后续才加载时，
    // hook 注册代码直接跳过 → 用户首次切换预设时跑原版而非增强版。
    // 引入 CustomEvent 'fsPresetDepsReady' 替代 setTimeout 轮询（外部依赖加载完后可主动 dispatch 触发）。
    var _PRESET_RETRY_MAX = 5;
    var _INJECT_RETRY_MAX = 5;
    var _REGEX_RETRY_MAX = 5;
    var _presetRetries = 0;
    var _injectRetries = 0;
    var _regexRetries = 0;
    var _depsReady = false;
    var _depsReadyCallbacks = [];

    function _onDepsReady(cb) {
        if (_depsReady) { try { cb(); } catch (e) { console.error('[STscriptBridge] depsReady cb 抛错:', e); } return; }
        _depsReadyCallbacks.push(cb);
    }

    function _tryFireDepsReady() {
        if (_depsReady) return;
        if (typeof PresetManager === 'undefined') return;
        if (typeof injectPresetGlobalVars === 'undefined') return;
        if (typeof RegexManager === 'undefined') return;
        _depsReady = true;
        var cbs = _depsReadyCallbacks;
        _depsReadyCallbacks = [];
        cbs.forEach(function(cb) { try { cb(); } catch (e) { console.error('[STscriptBridge] depsReady cb 抛错:', e); } });
    }

    // 外部脚本可主动 dispatch: document.dispatchEvent(new CustomEvent('fsPresetDepsReady'))
    // 用于依赖已就绪但 setTimeout 轮询尚未触发的场景
    if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('fsPresetDepsReady', _tryFireDepsReady);
    }

    function _retry(key, retries, max, fn) {
        if (retries >= max) {
            console.error('[STscriptBridge] ' + key + ' 始终未就绪，已放弃等待（其它依赖可继续）');
            return;
        }
        if (typeof TimerManager !== 'undefined' && TimerManager.setTimeout) {
            TimerManager.setTimeout('stscriptBridge_retry_' + key, fn, 100);
        } else {
            setTimeout(fn, 100);
        }
    }

    function _waitForInject() {
        if (typeof injectPresetGlobalVars !== 'undefined') {
            _tryFireDepsReady();
            return;
        }
        _injectRetries++;
        _retry('injectPresetGlobalVars', _injectRetries, _INJECT_RETRY_MAX, _waitForInject);
    }

    function _waitForRegex() {
        if (typeof RegexManager !== 'undefined') {
            _tryFireDepsReady();
            return;
        }
        _regexRetries++;
        _retry('RegexManager', _regexRetries, _REGEX_RETRY_MAX, _waitForRegex);
    }

    function initSTscriptBridge() {
        if (typeof PresetManager === 'undefined') {
            _presetRetries++;
            _retry('PresetManager', _presetRetries, _PRESET_RETRY_MAX, initSTscriptBridge);
            return;
        }

        if (typeof window.gameAdapter === 'undefined') {
            console.warn('[STscriptBridge] gameAdapter 未注入，跳过集成');
            return;
        }

        // 串行等待 injectPresetGlobalVars + RegexManager 各自就绪，3 个全齐后一次性注册所有 hook
        // 任一依赖缺失都不注册部分 hook（避免旧实现"PresetManager 就绪但 inject 未到"导致 hook 漏注册）
        _onDepsReady(function() { _registerHooks(); });
        _waitForInject();
        _waitForRegex();
    }

    function _registerHooks() {
        console.log('[STscriptBridge] 开始集成到游戏系统...');


        // 但 Hook 1 的 loadPreset wrapper（line 37-38）已在使用它们。依赖 var 提升到函数顶部才不报错，
        // 一旦后续维护误删 if 块或改用 let/const，loadPreset hook 会抛 ReferenceError。
        // 现统一提升到函数顶部显式声明，与 _presetRetries 同级，使作用域意图明确。
        var _presetVarCacheKey = null;
        var _presetVarParsed = false;

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

                var _pn = getPlayerName('');
                if (_pn) {
                    window.gameAdapter.updateContext({ user: _pn });
                }
            }

            return result;
        };

        // ── Hook 3: 增强 injectPresetGlobalVars ──
        if (typeof injectPresetGlobalVars === 'function') {
            var origInject = injectPresetGlobalVars;

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
