// ========================================
// 故障兜底引擎
// 重试、模型切换、纯文本降级
// ========================================
var FallbackEngine = {
    MAX_RETRIES: 2,
    RETRY_DELAY_MS: 1000,

    execute: function(callFn, options) {
        options = options || {};
        var self = this;
        var attempt = 0;
        var failedModels = [];
        var currentModel = options.modelId || null;

        function tryCall() {
            return new Promise(function(resolve, reject) {
                callFn(currentModel).then(resolve).catch(function(err) {
                    if (attempt < self.MAX_RETRIES) {
                        attempt++;
                        console.warn('[FallbackEngine] retry ' + attempt + ' for model ' + currentModel + ':', err && err.message);
                        setTimeout(function() { tryCall().then(resolve).catch(reject); }, self.RETRY_DELAY_MS);
                    } else if (!options.noModelSwitch && typeof self.nextModel === 'function') {
                        var next = self.nextModel(currentModel, failedModels);
                        if (next && next !== currentModel) {
                            failedModels.push(currentModel);
                            currentModel = next;
                            attempt = 0;
                            console.warn('[FallbackEngine] switch to model:', next);
                            tryCall().then(resolve).catch(reject);
                        } else {
                            reject(err);
                        }
                    } else {
                        reject(err);
                    }
                });
            });
        }
        return tryCall();
    },

    nextModel: function(failedModelId, failedList) {
        var configs = [];
        try {
            var cfg = (typeof LocalGameAPI !== 'undefined' && LocalGameAPI.getModelConfigs) ?
                LocalGameAPI.getModelConfigs() : null;
            if (cfg && Array.isArray(cfg)) configs = cfg;
        } catch (e) {}
        if (configs.length === 0 && typeof gameState !== 'undefined' && gameState._apiConfigs) {
            configs = gameState._apiConfigs;
        }
        failedList = failedList || [];
        for (var i = 0; i < configs.length; i++) {
            var id = configs[i].id || configs[i].modelId || configs[i].model;
            if (id && id !== failedModelId && failedList.indexOf(id) === -1) return id;
        }
        return null;
    },

    degradeMode: function(context) {
        context = context || {};
        if (typeof StateManager !== 'undefined') {
            StateManager.set('world.pureTextMode', true, { silent: true });
        }
        if (typeof gameState !== 'undefined') gameState.pureTextMode = true;
        console.warn('[FallbackEngine] degraded to pure text mode');
        return true;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = FallbackEngine;
