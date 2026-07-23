// ========================================
// 模型注册表 (Model Registry)
// 独立可维护文件 —— 参考 LiteLLM 的 model_prices_and_context_window.json 设计
// 覆盖所有主流模型的上下文窗口、最大输出、是否推理模型等信息
//
// 维护方式：
// 1. 新模型发布时，在此文件中添加对应条目
// 2. 条目按 provider 分组，使用 model name pattern 匹配
// 3. context_length 和 max_completion_tokens 来自官方文档
// 4. is_reasoning 标记推理模型（需要额外 reasoning token 预留）
//
// 匹配规则：
// - 按顺序遍历，第一个匹配的 pattern 生效
// - pattern 使用 includes 匹配（大小写不敏感）
// - 支持精确匹配（exact: true）和模糊匹配（默认）
// ========================================

var ModelRegistry = {
    // 注册表版本号（每次更新递增）
    version: '2026-07-23.1',

    // 模型条目列表（按优先级排列，越具体越靠前）
    _entries: [
        // ===== DeepSeek 系 =====
        { pattern: 'deepseek-v4-flash', context_length: 1000000, max_completion_tokens: 65536, is_reasoning: true, provider: 'deepseek' },
        { pattern: 'deepseek-v4', context_length: 1000000, max_completion_tokens: 65536, is_reasoning: true, provider: 'deepseek' },
        { pattern: 'deepseek-r1', context_length: 64000, max_completion_tokens: 32768, is_reasoning: true, provider: 'deepseek' },
        { pattern: 'deepseek-reasoner', context_length: 64000, max_completion_tokens: 32768, is_reasoning: true, provider: 'deepseek' },
        { pattern: 'deepseek-chat', context_length: 64000, max_completion_tokens: 8192, is_reasoning: false, provider: 'deepseek' },
        { pattern: 'deepseek', context_length: 64000, max_completion_tokens: 8192, is_reasoning: false, provider: 'deepseek' },

        // ===== OpenAI GPT 系 =====
        { pattern: 'gpt-4o-mini', context_length: 128000, max_completion_tokens: 16384, is_reasoning: false, provider: 'openai' },
        { pattern: 'gpt-4o', context_length: 128000, max_completion_tokens: 16384, is_reasoning: false, provider: 'openai' },
        { pattern: 'gpt-4-turbo', context_length: 128000, max_completion_tokens: 4096, is_reasoning: false, provider: 'openai' },
        { pattern: 'gpt-4.1', context_length: 1047576, max_completion_tokens: 32768, is_reasoning: false, provider: 'openai' },
        { pattern: 'gpt-4', context_length: 8192, max_completion_tokens: 4096, is_reasoning: false, provider: 'openai' },
        { pattern: 'o3-mini', context_length: 200000, max_completion_tokens: 100000, is_reasoning: true, provider: 'openai' },
        { pattern: 'o3', context_length: 200000, max_completion_tokens: 100000, is_reasoning: true, provider: 'openai' },
        { pattern: 'o1-mini', context_length: 128000, max_completion_tokens: 65536, is_reasoning: true, provider: 'openai' },
        { pattern: 'o1', context_length: 200000, max_completion_tokens: 100000, is_reasoning: true, provider: 'openai' },
        { pattern: 'gpt-3.5-turbo', context_length: 16384, max_completion_tokens: 4096, is_reasoning: false, provider: 'openai' },

        // ===== Anthropic Claude 系 =====
        { pattern: 'claude-3-5-sonnet', context_length: 200000, max_completion_tokens: 8192, is_reasoning: false, provider: 'anthropic' },
        { pattern: 'claude-3.5-sonnet', context_length: 200000, max_completion_tokens: 8192, is_reasoning: false, provider: 'anthropic' },
        { pattern: 'claude-3-5-haiku', context_length: 200000, max_completion_tokens: 8192, is_reasoning: false, provider: 'anthropic' },
        { pattern: 'claude-3-opus', context_length: 200000, max_completion_tokens: 4096, is_reasoning: false, provider: 'anthropic' },
        { pattern: 'claude-3-sonnet', context_length: 200000, max_completion_tokens: 4096, is_reasoning: false, provider: 'anthropic' },
        { pattern: 'claude-3-haiku', context_length: 200000, max_completion_tokens: 4096, is_reasoning: false, provider: 'anthropic' },
        { pattern: 'claude', context_length: 200000, max_completion_tokens: 8192, is_reasoning: false, provider: 'anthropic' },

        // ===== Google Gemini 系 =====
        { pattern: 'gemini-2.0-flash', context_length: 1048576, max_completion_tokens: 8192, is_reasoning: false, provider: 'google' },
        { pattern: 'gemini-1.5-pro', context_length: 2000000, max_completion_tokens: 8192, is_reasoning: false, provider: 'google' },
        { pattern: 'gemini-1.5-flash', context_length: 1000000, max_completion_tokens: 8192, is_reasoning: false, provider: 'google' },
        { pattern: 'gemini', context_length: 1000000, max_completion_tokens: 8192, is_reasoning: false, provider: 'google' },

        // ===== Qwen 通义千问 系 =====
        { pattern: 'qwen2.5-72b', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'alibaba' },
        { pattern: 'qwen2.5', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'alibaba' },
        { pattern: 'qwen-max', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'alibaba' },
        { pattern: 'qwen-plus', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'alibaba' },
        { pattern: 'qwen-turbo', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'alibaba' },
        { pattern: 'qwen', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'alibaba' },

        // ===== GLM 智谱 系 =====
        { pattern: 'glm-4-plus', context_length: 131072, max_completion_tokens: 4096, is_reasoning: false, provider: 'zhipu' },
        { pattern: 'glm-4-flash', context_length: 131072, max_completion_tokens: 4096, is_reasoning: false, provider: 'zhipu' },
        { pattern: 'glm-4-air', context_length: 131072, max_completion_tokens: 4096, is_reasoning: false, provider: 'zhipu' },
        { pattern: 'glm-4', context_length: 131072, max_completion_tokens: 4096, is_reasoning: false, provider: 'zhipu' },

        // ===== Moonshot/Kimi 系 =====
        { pattern: 'moonshot-v1-128k', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'moonshot' },
        { pattern: 'moonshot-v1-32k', context_length: 32768, max_completion_tokens: 8192, is_reasoning: false, provider: 'moonshot' },
        { pattern: 'moonshot-v1-8k', context_length: 8192, max_completion_tokens: 4096, is_reasoning: false, provider: 'moonshot' },
        { pattern: 'kimi', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'moonshot' },

        // ===== Meta Llama 系 =====
        { pattern: 'llama-3.3-70b', context_length: 131072, max_completion_tokens: 4096, is_reasoning: false, provider: 'meta' },
        { pattern: 'llama-3.1-405b', context_length: 131072, max_completion_tokens: 4096, is_reasoning: false, provider: 'meta' },
        { pattern: 'llama-3.1-70b', context_length: 131072, max_completion_tokens: 4096, is_reasoning: false, provider: 'meta' },
        { pattern: 'llama-3.1-8b', context_length: 131072, max_completion_tokens: 4096, is_reasoning: false, provider: 'meta' },
        { pattern: 'llama-3', context_length: 8192, max_completion_tokens: 4096, is_reasoning: false, provider: 'meta' },

        // ===== Mistral 系 =====
        { pattern: 'mistral-large', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'mistral' },
        { pattern: 'mistral-medium', context_length: 32768, max_completion_tokens: 8192, is_reasoning: false, provider: 'mistral' },
        { pattern: 'mistral-small', context_length: 32768, max_completion_tokens: 8192, is_reasoning: false, provider: 'mistral' },
        { pattern: 'mixtral', context_length: 32768, max_completion_tokens: 8192, is_reasoning: false, provider: 'mistral' },
        { pattern: 'mistral', context_length: 32768, max_completion_tokens: 8192, is_reasoning: false, provider: 'mistral' },

        // ===== Yandex YandexGPT 系 =====
        { pattern: 'yandexgpt', context_length: 8192, max_completion_tokens: 2048, is_reasoning: false, provider: 'yandex' },

        // ===== 通用 auto 路由 =====
        { pattern: 'auto', context_length: 128000, max_completion_tokens: 16384, is_reasoning: false, provider: 'auto' }
    ],

    // 缓存的 API 返回数据（从 /models 端点获取）
    _apiCache: null,
    _apiCacheTime: 0,
    _API_CACHE_TTL: 300000, // 5 分钟

    // 缓存的用户手动覆盖值
    _manualOverride: null,

    // 从 /models API 响应中提取模型信息
    // 支持多种格式：OpenAI、OpenRouter、LiteLLM、Gemini
    parseApiModelEntry: function(modelEntry) {
        if (!modelEntry || typeof modelEntry !== 'object') return null;

        var result = {
            context_length: 0,
            max_completion_tokens: 0
        };

        // 上下文窗口：尝试所有已知字段名
        // OpenRouter: context_length
        // LiteLLM: max_input_tokens
        // Gemini: inputTokenLimit (非标准格式，需在调用方转换)
        // KoboldCpp: max_context_length
        result.context_length =
            modelEntry.context_length ||
            modelEntry.max_context_length ||
            modelEntry.max_input_tokens ||
            modelEntry.context_window ||
            modelEntry.inputTokenLimit ||  // Gemini 格式
            0;

        // 最大输出 tokens：尝试所有已知字段名
        // OpenRouter: max_completion_tokens
        // LiteLLM: max_output_tokens
        // OpenAI: max_tokens (旧格式)
        // Gemini: outputTokenLimit
        result.max_completion_tokens =
            modelEntry.max_completion_tokens ||
            modelEntry.max_output_tokens ||
            modelEntry.max_tokens ||
            modelEntry.outputTokenLimit ||  // Gemini 格式
            0;

        return result;
    },

    // 从 API /models 响应中查找指定模型的信息
    // apiModels: /models 返回的 data 数组
    // modelName: 要查找的模型名（小写）
    findInApiModels: function(apiModels, modelName) {
        if (!apiModels || !Array.isArray(apiModels) || !modelName) return null;
        var modelLower = modelName.toLowerCase();

        for (var i = 0; i < apiModels.length; i++) {
            var m = apiModels[i];
            var id = (m.id || m.name || '').toLowerCase();
            if (!id) continue;

            // 匹配策略：精确 > 后缀 > includes
            if (id === modelLower ||
                id.endsWith('/' + modelLower) ||
                id.endsWith(':' + modelLower) ||
                id === modelLower.replace(/^[^/]+\//, '') ||  // 去掉 provider 前缀
                modelLower === id.replace(/^[^/]+\//, '')) {
                return this.parseApiModelEntry(m);
            }
        }

        // 模糊匹配：模型名包含在 id 中
        for (var j = 0; j < apiModels.length; j++) {
            var m2 = apiModels[j];
            var id2 = (m2.id || m2.name || '').toLowerCase();
            if (id2 && (id2.indexOf(modelLower) !== -1 || modelLower.indexOf(id2) !== -1)) {
                return this.parseApiModelEntry(m2);
            }
        }

        return null;
    },

    // 在注册表中查找模型信息
    // modelName: 模型名（原始大小写）
    // 返回 { context_length, max_completion_tokens, is_reasoning, provider } 或 null
    findInRegistry: function(modelName) {
        if (!modelName) return null;
        var modelLower = modelName.toLowerCase();

        for (var i = 0; i < this._entries.length; i++) {
            var entry = this._entries[i];
            if (modelLower.indexOf(entry.pattern) !== -1) {
                return {
                    context_length: entry.context_length,
                    max_completion_tokens: entry.max_completion_tokens,
                    is_reasoning: !!entry.is_reasoning,
                    provider: entry.provider || 'unknown'
                };
            }
        }
        return null;
    },

    // 综合查找：优先 API 缓存 → 注册表 → null
    // modelName: 模型名
    // 返回 { context_length, max_completion_tokens, is_reasoning, source }
    lookup: function(modelName) {
        var result = null;
        var source = 'none';

        // 1. 用户手动覆盖（最高优先级）
        if (this._manualOverride && this._manualOverride.context_length > 0) {
            result = {
                context_length: this._manualOverride.context_length,
                max_completion_tokens: this._manualOverride.max_completion_tokens || 0,
                is_reasoning: this._manualOverride.is_reasoning || false,
                source: 'manual'
            };
            return result;
        }

        // 2. API 缓存
        if (this._apiCache && (Date.now() - this._apiCacheTime < this._API_CACHE_TTL)) {
            var apiResult = this.findInApiModels(this._apiCache, modelName.toLowerCase());
            if (apiResult && apiResult.context_length > 0) {
                result = {
                    context_length: apiResult.context_length,
                    max_completion_tokens: apiResult.max_completion_tokens || 0,
                    is_reasoning: false,  // API 通常不返回此字段
                    source: 'api'
                };
                return result;
            }
        }

        // 3. 注册表
        var regResult = this.findInRegistry(modelName);
        if (regResult) {
            result = {
                context_length: regResult.context_length,
                max_completion_tokens: regResult.max_completion_tokens,
                is_reasoning: regResult.is_reasoning,
                source: 'registry'
            };
            return result;
        }

        return null;
    },

    // 缓存 /models API 返回的数据
    setApiCache: function(apiModels) {
        if (apiModels && Array.isArray(apiModels)) {
            this._apiCache = apiModels;
            this._apiCacheTime = Date.now();
        }
    },

    // 设置用户手动覆盖
    setManualOverride: function(contextLength, maxCompletionTokens, isReasoning) {
        if (contextLength > 0) {
            this._manualOverride = {
                context_length: contextLength,
                max_completion_tokens: maxCompletionTokens || 0,
                is_reasoning: !!isReasoning
            };
            // 持久化到 localStorage
            try {
                if (typeof Storage !== 'undefined') {
                    Storage.setJSON('freeScript_modelOverride', this._manualOverride);
                }
            } catch (e) {}
        } else {
            // contextLength = 0 表示清除覆盖，使用自动检测
            this._manualOverride = null;
            try {
                if (typeof Storage !== 'undefined') {
                    Storage.remove('freeScript_modelOverride');
                }
            } catch (e) {}
        }
    },

    // 从 localStorage 恢复用户手动覆盖
    loadManualOverride: function() {
        try {
            if (typeof Storage !== 'undefined') {
                var saved = Storage.getJSON('freeScript_modelOverride', null);
                if (saved && saved.context_length > 0) {
                    this._manualOverride = saved;
                }
            }
        } catch (e) {}
    },

    // 获取所有注册表条目（供 UI 展示）
    getAllEntries: function() {
        return this._entries.slice();
    },

    // 判断模型是否为推理模型
    isReasoningModel: function(modelName) {
        var result = this.findInRegistry(modelName);
        return result ? result.is_reasoning : false;
    }
};

// 启动时恢复用户手动覆盖
if (typeof window !== 'undefined') {
    ModelRegistry.loadManualOverride();
    window.ModelRegistry = ModelRegistry;
}

if (typeof module !== 'undefined' && module.exports) module.exports = ModelRegistry;
