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
// - 重要：更具体的 pattern 必须排在更宽泛的 pattern 前面
//   例如 'gpt-5.6' 必须在 'gpt-5' 之前，'grok-4.3' 必须在 'grok-4' 之前
//
// 数据更新日期：2026-07-23
// 数据来源：各厂商官方文档 / API specs
// ========================================

var ModelRegistry = {
    // 注册表版本号（每次更新递增）
    version: '2026-07-23.2',

    // 模型条目列表（按优先级排列，越具体越靠前）
    _entries: [
        // ===== DeepSeek 系 =====
        // V4 系列：1M 上下文，384K 最大输出（推理模型）
        { pattern: 'deepseek-v4-flash', context_length: 1000000, max_completion_tokens: 384000, is_reasoning: true, provider: 'deepseek' },
        { pattern: 'deepseek-v4-pro', context_length: 1000000, max_completion_tokens: 384000, is_reasoning: true, provider: 'deepseek' },
        { pattern: 'deepseek-v4', context_length: 1000000, max_completion_tokens: 384000, is_reasoning: true, provider: 'deepseek' },
        // V3.1：128K 上下文，8K 最大输出
        { pattern: 'deepseek-v3.1', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'deepseek' },
        { pattern: 'deepseek-v3', context_length: 65536, max_completion_tokens: 8192, is_reasoning: false, provider: 'deepseek' },
        // R1 推理模型：64K 上下文，32K 最大输出
        { pattern: 'deepseek-r1', context_length: 65536, max_completion_tokens: 32768, is_reasoning: true, provider: 'deepseek' },
        { pattern: 'deepseek-reasoner', context_length: 65536, max_completion_tokens: 32768, is_reasoning: true, provider: 'deepseek' },
        // deepseek-chat (V3 API 名称)：64K 上下文，8K 最大输出
        { pattern: 'deepseek-chat', context_length: 65536, max_completion_tokens: 8192, is_reasoning: false, provider: 'deepseek' },
        // 兜底
        { pattern: 'deepseek', context_length: 65536, max_completion_tokens: 8192, is_reasoning: false, provider: 'deepseek', is_fallback: true },

        // ===== OpenAI GPT 系 =====
        // GPT-5.6（2026 最新）：1.05M 上下文，128K 最大输出
        { pattern: 'gpt-5.6', context_length: 1050000, max_completion_tokens: 128000, is_reasoning: true, provider: 'openai' },
        // GPT-5.5：1.05M 上下文，128K 最大输出
        { pattern: 'gpt-5.5', context_length: 1050000, max_completion_tokens: 128000, is_reasoning: true, provider: 'openai' },
        // GPT-5.4：1.05M 上下文，128K 最大输出
        { pattern: 'gpt-5.4-mini', context_length: 272000, max_completion_tokens: 128000, is_reasoning: true, provider: 'openai' },
        { pattern: 'gpt-5.4', context_length: 1050000, max_completion_tokens: 128000, is_reasoning: true, provider: 'openai' },
        // GPT-5.2：400K 上下文，128K 最大输出
        { pattern: 'gpt-5.2', context_length: 400000, max_completion_tokens: 128000, is_reasoning: true, provider: 'openai' },
        // GPT-5.1：400K 上下文，128K 最大输出
        { pattern: 'gpt-5.1', context_length: 400000, max_completion_tokens: 128000, is_reasoning: true, provider: 'openai' },
        // GPT-5 系列：400K 上下文，128K 最大输出
        { pattern: 'gpt-5-mini', context_length: 400000, max_completion_tokens: 128000, is_reasoning: true, provider: 'openai' },
        { pattern: 'gpt-5-nano', context_length: 400000, max_completion_tokens: 128000, is_reasoning: true, provider: 'openai' },
        { pattern: 'gpt-5', context_length: 400000, max_completion_tokens: 128000, is_reasoning: true, provider: 'openai' },
        // GPT-4o 系列：128K 上下文，16K 最大输出
        { pattern: 'gpt-4o-mini', context_length: 128000, max_completion_tokens: 16384, is_reasoning: false, provider: 'openai' },
        { pattern: 'gpt-4o', context_length: 128000, max_completion_tokens: 16384, is_reasoning: false, provider: 'openai' },
        // GPT-4.1：1M 上下文，32K 最大输出
        { pattern: 'gpt-4.1', context_length: 1047576, max_completion_tokens: 32768, is_reasoning: false, provider: 'openai' },
        // GPT-4 系列
        { pattern: 'gpt-4-turbo', context_length: 128000, max_completion_tokens: 4096, is_reasoning: false, provider: 'openai' },
        { pattern: 'gpt-4', context_length: 8192, max_completion_tokens: 4096, is_reasoning: false, provider: 'openai' },
        // o 系列推理模型
        { pattern: 'o3-mini', context_length: 200000, max_completion_tokens: 100000, is_reasoning: true, provider: 'openai' },
        { pattern: 'o3', context_length: 200000, max_completion_tokens: 100000, is_reasoning: true, provider: 'openai' },
        { pattern: 'o1-mini', context_length: 128000, max_completion_tokens: 65536, is_reasoning: true, provider: 'openai' },
        { pattern: 'o1', context_length: 200000, max_completion_tokens: 100000, is_reasoning: true, provider: 'openai' },
        // 旧模型
        { pattern: 'gpt-3.5-turbo', context_length: 16384, max_completion_tokens: 4096, is_reasoning: false, provider: 'openai' },

        // ===== Anthropic Claude 系 =====
        // Claude Opus 4.7（2026 最新）：1M 上下文，128K 最大输出
        { pattern: 'claude-opus-4-7', context_length: 1000000, max_completion_tokens: 128000, is_reasoning: true, provider: 'anthropic' },
        // Claude Opus 4.6：1M 上下文，128K 最大输出
        { pattern: 'claude-opus-4-6', context_length: 1000000, max_completion_tokens: 128000, is_reasoning: true, provider: 'anthropic' },
        // Claude Sonnet 4.6：1M 上下文，64K 最大输出
        { pattern: 'claude-sonnet-4-6', context_length: 1000000, max_completion_tokens: 64000, is_reasoning: true, provider: 'anthropic' },
        // Claude Sonnet 4.5 / 4：200K 上下文（1M beta），16K 最大输出
        { pattern: 'claude-sonnet-4-5', context_length: 200000, max_completion_tokens: 16000, is_reasoning: false, provider: 'anthropic' },
        { pattern: 'claude-sonnet-4', context_length: 200000, max_completion_tokens: 16000, is_reasoning: false, provider: 'anthropic' },
        // Claude 3.5 系列：200K 上下文，8K 最大输出
        { pattern: 'claude-3-5-sonnet', context_length: 200000, max_completion_tokens: 8192, is_reasoning: false, provider: 'anthropic' },
        { pattern: 'claude-3.5-sonnet', context_length: 200000, max_completion_tokens: 8192, is_reasoning: false, provider: 'anthropic' },
        { pattern: 'claude-3-5-haiku', context_length: 200000, max_completion_tokens: 8192, is_reasoning: false, provider: 'anthropic' },
        { pattern: 'claude-3.5-haiku', context_length: 200000, max_completion_tokens: 8192, is_reasoning: false, provider: 'anthropic' },
        // Claude 3 系列：200K 上下文
        { pattern: 'claude-3-opus', context_length: 200000, max_completion_tokens: 4096, is_reasoning: false, provider: 'anthropic' },
        { pattern: 'claude-3-sonnet', context_length: 200000, max_completion_tokens: 4096, is_reasoning: false, provider: 'anthropic' },
        { pattern: 'claude-3-haiku', context_length: 200000, max_completion_tokens: 4096, is_reasoning: false, provider: 'anthropic' },
        // 兜底
        { pattern: 'claude', context_length: 200000, max_completion_tokens: 8192, is_reasoning: false, provider: 'anthropic', is_fallback: true },

        // ===== Google Gemini 系 =====
        // Gemini 3.1 Pro：2M 上下文，65K 最大输出
        { pattern: 'gemini-3.1-pro', context_length: 2000000, max_completion_tokens: 65536, is_reasoning: true, provider: 'google' },
        // Gemini 3 Pro：1M 上下文，65K 最大输出
        { pattern: 'gemini-3-pro', context_length: 1048576, max_completion_tokens: 65536, is_reasoning: true, provider: 'google' },
        { pattern: 'gemini-3', context_length: 1048576, max_completion_tokens: 65536, is_reasoning: true, provider: 'google', is_fallback: true },
        // Gemini 2.5 Pro / Flash：1M 上下文，65K 最大输出（推理模型）
        { pattern: 'gemini-2.5-pro', context_length: 1048576, max_completion_tokens: 65536, is_reasoning: true, provider: 'google' },
        { pattern: 'gemini-2.5-flash', context_length: 1048576, max_completion_tokens: 65536, is_reasoning: true, provider: 'google' },
        // Gemini 2.0 Flash：1M 上下文，8K 最大输出
        { pattern: 'gemini-2.0-flash', context_length: 1048576, max_completion_tokens: 8192, is_reasoning: false, provider: 'google' },
        // Gemini 1.5 系列
        { pattern: 'gemini-1.5-pro', context_length: 2097152, max_completion_tokens: 8192, is_reasoning: false, provider: 'google' },
        { pattern: 'gemini-1.5-flash', context_length: 1048576, max_completion_tokens: 8192, is_reasoning: false, provider: 'google' },
        // 兜底
        { pattern: 'gemini', context_length: 1048576, max_completion_tokens: 8192, is_reasoning: false, provider: 'google', is_fallback: true },

        // ===== GLM 智谱 系 =====
        // GLM-4.7：200K 上下文，128K 最大输出（支持思维链推理）
        { pattern: 'glm-4.7', context_length: 200000, max_completion_tokens: 128000, is_reasoning: true, provider: 'zhipu' },
        // GLM-4.6：200K 上下文，128K 最大输出（支持思维链推理）
        { pattern: 'glm-4.6', context_length: 200000, max_completion_tokens: 128000, is_reasoning: true, provider: 'zhipu' },
        // GLM-4.5：128K 上下文
        { pattern: 'glm-4.5', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'zhipu' },
        // GLM-4 系列：128K 上下文
        { pattern: 'glm-4-plus', context_length: 131072, max_completion_tokens: 4096, is_reasoning: false, provider: 'zhipu' },
        { pattern: 'glm-4-flash', context_length: 131072, max_completion_tokens: 4096, is_reasoning: false, provider: 'zhipu' },
        { pattern: 'glm-4-air', context_length: 131072, max_completion_tokens: 4096, is_reasoning: false, provider: 'zhipu' },
        { pattern: 'glm-4', context_length: 131072, max_completion_tokens: 4096, is_reasoning: false, provider: 'zhipu' },
        // 兜底
        { pattern: 'glm', context_length: 131072, max_completion_tokens: 4096, is_reasoning: false, provider: 'zhipu', is_fallback: true },

        // ===== xAI Grok 系 =====
        // Grok 4.3：2M 上下文，131K 最大输出
        { pattern: 'grok-4.3', context_length: 2000000, max_completion_tokens: 131072, is_reasoning: true, provider: 'xai' },
        // Grok 4.1 Fast：2M 上下文，131K 最大输出
        { pattern: 'grok-4.1', context_length: 2000000, max_completion_tokens: 131072, is_reasoning: true, provider: 'xai' },
        // Grok 4 Fast：2M 上下文，131K 最大输出
        { pattern: 'grok-4-fast', context_length: 2000000, max_completion_tokens: 131072, is_reasoning: true, provider: 'xai' },
        // Grok 4：256K 上下文，131K 最大输出
        { pattern: 'grok-4', context_length: 256000, max_completion_tokens: 131072, is_reasoning: true, provider: 'xai' },
        // Grok 3：131K 上下文，8K 最大输出
        { pattern: 'grok-3-mini', context_length: 131072, max_completion_tokens: 8192, is_reasoning: true, provider: 'xai' },
        { pattern: 'grok-3', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'xai' },
        // Grok 2：131K 上下文
        { pattern: 'grok-2', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'xai' },
        // 兜底
        { pattern: 'grok', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'xai', is_fallback: true },

        // ===== Moonshot/Kimi 系 =====
        // Kimi K3（2026 最新）：1M 上下文（推理模型）
        { pattern: 'kimi-k3', context_length: 1048576, max_completion_tokens: 65536, is_reasoning: true, provider: 'moonshot' },
        // Kimi K2.7 Code：256K 上下文（推理模型）
        { pattern: 'kimi-k2.7', context_length: 262144, max_completion_tokens: 16384, is_reasoning: true, provider: 'moonshot' },
        // Kimi K2.6：256K 上下文
        { pattern: 'kimi-k2.6', context_length: 262144, max_completion_tokens: 16384, is_reasoning: false, provider: 'moonshot' },
        // Kimi K2.5：256K 上下文，16K 最大输出
        { pattern: 'kimi-k2.5', context_length: 262144, max_completion_tokens: 16384, is_reasoning: false, provider: 'moonshot' },
        // Kimi K2：128K 上下文，25K 最大输出
        { pattern: 'kimi-k2', context_length: 131072, max_completion_tokens: 25000, is_reasoning: false, provider: 'moonshot' },
        // Kimi 兜底
        { pattern: 'kimi', context_length: 131072, max_completion_tokens: 16384, is_reasoning: false, provider: 'moonshot', is_fallback: true },
        // Moonshot v1 系列（旧 API 名称）
        { pattern: 'moonshot-v1-128k', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'moonshot' },
        { pattern: 'moonshot-v1-32k', context_length: 32768, max_completion_tokens: 8192, is_reasoning: false, provider: 'moonshot' },
        { pattern: 'moonshot-v1-8k', context_length: 8192, max_completion_tokens: 4096, is_reasoning: false, provider: 'moonshot' },
        { pattern: 'moonshot', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'moonshot', is_fallback: true },

        // ===== Qwen 通义千问 系 =====
        // Qwen3.7 Max / Plus：1M 上下文，65K 最大输出
        { pattern: 'qwen3.7-max', context_length: 1000000, max_completion_tokens: 65536, is_reasoning: true, provider: 'alibaba' },
        { pattern: 'qwen3.7-plus', context_length: 1000000, max_completion_tokens: 65536, is_reasoning: true, provider: 'alibaba' },
        { pattern: 'qwen3.7', context_length: 1000000, max_completion_tokens: 65536, is_reasoning: true, provider: 'alibaba', is_fallback: true },
        // Qwen3.6 Flash：256K 上下文
        { pattern: 'qwen3.6-flash', context_length: 262144, max_completion_tokens: 8192, is_reasoning: false, provider: 'alibaba' },
        { pattern: 'qwen3.6', context_length: 262144, max_completion_tokens: 8192, is_reasoning: false, provider: 'alibaba', is_fallback: true },
        // Qwen3 系列
        { pattern: 'qwen3-max', context_length: 262144, max_completion_tokens: 32768, is_reasoning: true, provider: 'alibaba' },
        { pattern: 'qwen3-plus', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'alibaba' },
        { pattern: 'qwen3-turbo', context_length: 1048576, max_completion_tokens: 8192, is_reasoning: false, provider: 'alibaba' },
        { pattern: 'qwen3', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'alibaba', is_fallback: true },
        // Qwen2.5 系列
        { pattern: 'qwen2.5', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'alibaba' },
        // 旧 Qwen 系列
        { pattern: 'qwen-max', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'alibaba' },
        { pattern: 'qwen-plus', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'alibaba' },
        { pattern: 'qwen-turbo', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'alibaba' },
        // 兜底
        { pattern: 'qwen', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'alibaba', is_fallback: true },

        // ===== Meta Llama 系 =====
        // Llama 4 系列
        { pattern: 'llama-4-scout', context_length: 10000000, max_completion_tokens: 8192, is_reasoning: false, provider: 'meta' },
        { pattern: 'llama-4-maverick', context_length: 1000000, max_completion_tokens: 8192, is_reasoning: false, provider: 'meta' },
        { pattern: 'llama-4', context_length: 1000000, max_completion_tokens: 8192, is_reasoning: false, provider: 'meta', is_fallback: true },
        // Llama 3.3 / 3.1：128K 上下文
        { pattern: 'llama-3.3', context_length: 131072, max_completion_tokens: 4096, is_reasoning: false, provider: 'meta' },
        { pattern: 'llama-3.1', context_length: 131072, max_completion_tokens: 4096, is_reasoning: false, provider: 'meta' },
        // Llama 3：8K 上下文
        { pattern: 'llama-3', context_length: 8192, max_completion_tokens: 4096, is_reasoning: false, provider: 'meta' },
        // 兜底
        { pattern: 'llama', context_length: 8192, max_completion_tokens: 4096, is_reasoning: false, provider: 'meta', is_fallback: true },

        // ===== Mistral 系 =====
        { pattern: 'mistral-large', context_length: 131072, max_completion_tokens: 8192, is_reasoning: false, provider: 'mistral' },
        { pattern: 'mistral-medium', context_length: 32768, max_completion_tokens: 8192, is_reasoning: false, provider: 'mistral' },
        { pattern: 'mistral-small', context_length: 32768, max_completion_tokens: 8192, is_reasoning: false, provider: 'mistral' },
        { pattern: 'mixtral', context_length: 32768, max_completion_tokens: 8192, is_reasoning: false, provider: 'mistral' },
        { pattern: 'mistral', context_length: 32768, max_completion_tokens: 8192, is_reasoning: false, provider: 'mistral', is_fallback: true },

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
    // 返回 { context_length, max_completion_tokens, is_reasoning, provider, is_fallback } 或 null
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
                    provider: entry.provider || 'unknown',
                    is_fallback: !!entry.is_fallback
                };
            }
        }
        return null;
    },

    // 综合查找：优先手动覆盖 → API 缓存 → 注册表
    // modelName: 模型名
    // 返回 { context_length, max_completion_tokens, is_reasoning, source } 或 null
    // 这是 detectContextSize() 的主入口，处理 ModelRegistry 内部的三种数据源
    // 不处理预设 max_context、模型名正则、AI 自报等外部逻辑（由 detectContextSize 编排）
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
                source: 'registry',
                is_fallback: regResult.is_fallback
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
