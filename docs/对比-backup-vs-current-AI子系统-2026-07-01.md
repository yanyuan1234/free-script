# Free-Script AI 子系统对比报告：backup vs current

> **报告日期**：2026-07-02
> **对比基线**：
> - `backup`（原始/参考版）：`/workspace/backup/index.html`（33,308 行）
> - `current`（当前重构版）：`/workspace/js/ai-contract/`（1,590 行）+ `js/core.js`（5,604 行）+ `js/modules/`（共 4,783 行）
> **对比目标**：以 backup 为参考基线，找出 current 中**错误**的修改（含被改坏的酒馆 API 对齐、丢失的优秀实现）；同时识别 current 中值得保留的优秀添加。

---

## 摘要（TL;DR）

| 子系统 | backup 状态 | current 状态 | 关键差异 | 评价 |
|--------|------------|-------------|---------|------|
| AI 请求构造 | `callAI` 11615–11930，**完整高级采样** + `isCompatibleMode` 兼容 | `buildAIRequestBody` 4668–4790，**几乎对齐** | 拆出独立函数；新增 `mergeAdvancedPresetParams`/`filterRequestParams`；`options.temperature` 覆盖行为被删除 | 拆分正确；温度覆盖删除是**功能丢失** |
| 错误码映射 | `translateError` 11243–11366，**统一 50+ 错误** | `_ERROR_MAPS` 3822–3849 + `translateError` 3852–4029，**重复定义 + 重复实现** | 拆出两张 HTTP/API_CODE 表，但 inline map（3857–3983）才是真正被命中的表；`HTTP_STATUS`/`API_CODE` 几乎**死代码** | 三套重复逻辑，违反 DRY |
| 响应解析 | `parseAIResponse` 10471–10572，**4 步兜底** | `ResponseParser.parse` 5–93，**5 层 + 截断修复** | 多 1 层 `<mem>` 标签 + 智能截断 JSON 补全（`_repairTruncatedJSON`） | **current 优秀添加**（截断修复、`<mem>` 标签） |
| 思维链标签 | `<thinking>` / `<ECoT>` / `💭` / `<cot>` / `<reasoning>` / `<chain_of_thought>`（6 个） | `THINKING_TAGS` 8 个（多 `analysis`、`thought`） | 多了 2 个；移除逻辑相似 | **current 更全** |
| JSON 契约 schema | backup prompt 中枚举 ~22 个字段（`npcMessages` / `moments` / `mail` / `shop` / `comments` 等） | `AIOutputSchema.getDefaultOutput` 17 个字段 | 缺 `npcMessages`、缺 `world[*].posts` 结构、缺 `character_version` 等 | current 简化但**丢酒馆主控世界书**字段 |
| 宏引擎 | `MacroEngine.process` 18111–18410，**60+ 宏** + `STscript` v2.1 完整引擎 | `modules/macro-engine.js` `process` 682–1350，**70+ 宏** | 几乎对齐；多了 `{{.var}}`/`{{$var}}` 简写语法；**少了** `{{if:}}...{{else}}...{{/if}}` 条件 | current 添加变量简写（加分）；**丢失条件判断**（严重） |
| 正则引擎 | `parseSingleRegex` 16857–17020（placement 逻辑） | `parseSingleRegex` 596–674（placement 逻辑） | **几乎完全相同** | 对齐 backup |
| 预设管理 | `parsePreset` 14800–14920（V2 完整支持） | `parsePreset` 433–660（V2 支持） | 几乎相同 | 对齐 backup |
| **STScript** | 完整引擎 v2.1（32239 32241 32247 32291 ），`registerSlashCommand`（28379）、`STscriptParser`、`STscriptEngine` 类、流程命令 while/foreach 收集（28240） | `stscript-bridge.js` 137 行，**仅 hook 上游函数**，**0 个 slash command 注册** | **整块 STscript 引擎被砍掉** | **最严重的丢失** |

---

## 1. AI 请求构造

### 1.1 backup 的实现（`backup/index.html:11615–11930`）

```js
// backup/index.html:11628–11697
var presetParams = PresetManager.getParams();
// 合并未在 getParams 中暴露的高级参数
if (PresetManager.presets && PresetManager.currentPresetIndex >= 0) {
    var _curPreset = PresetManager.presets[PresetManager.currentPresetIndex];
    if (_curPreset && _curPreset.params) {
        var _pp = _curPreset.params;
        if (_pp.top_k != null && !presetParams.top_k) presetParams.top_k = Number(_pp.top_k) || 0;
        if (_pp.top_a != null && !presetParams.top_a) presetParams.top_a = Number(_pp.top_a) || 0;
        if (_pp.min_p != null && !presetParams.min_p) presetParams.min_p = Number(_pp.min_p) || 0;
        if (_pp.repetition_penalty != null && _pp.repetition_penalty !== 1) presetParams.repetition_penalty = Number(_pp.repetition_penalty) || 1;
        if (_pp.typical_p != null && _pp.typical_p !== 1) presetParams.typical_p = Number(_pp.typical_p) || 1;
        if (_pp.tail_free_sampling != null && _pp.tail_free_sampling !== 1) presetParams.tail_free_sampling = Number(_pp.tail_free_sampling) || 1;
        if (_pp.mirostat_mode != null && _pp.mirostat_mode !== 0) presetParams.mirostat_mode = Number(_pp.mirostat_mode) || 0;
        if (_pp.mirostat_tau != null && _pp.mirostat_tau !== 5.0) presetParams.mirostat_tau = Number(_pp.mirostat_tau) || 5.0;
        if (_pp.mirostat_eta != null && _pp.mirostat_eta !== 0.1) presetParams.mirostat_eta = Number(_pp.mirostat_eta) || 0.1;
        if (_pp.dry_multiplier != null && _pp.dry_multiplier !== 0) presetParams.dry_multiplier = Number(_pp.dry_multiplier) || 0;
        if (_pp.xtc_probability != null && _pp.xtc_probability !== 0) presetParams.xtc_probability = Number(_pp.xtc_probability) || 0;
        if (_pp.reasoning_effort != null) presetParams.reasoning_effort = String(_pp.reasoning_effort);
        if (_pp.seed != null) presetParams.seed = Number(_pp.seed) || null;
        if (_pp.max_tokens && Number(_pp.max_tokens) > 0) presetParams.max_tokens = Number(_pp.max_tokens);
    }
}
// 构建请求参数
var params = {
    model: config.model || 'gpt-3.5-turbo',
    messages: messages,
    temperature: presetParams.temperature,
    max_tokens: presetParams.max_tokens,
    top_p: presetParams.top_p,
    ...(isCompatibleMode ? {} : {
        top_k, frequency_penalty, presence_penalty, min_p, top_a, repetition_penalty,
        typical_p, min_length, max_time,
        mirostat_mode, mirostat_tau, mirostat_eta,
        repetition_penalty_range, repetition_penalty_slope, tfs,
        epsilon_cutoff, eta_cutoff, dry_multiplier, dry_range, dry_allowed_length,
        xtc_probability, xtc_threshold, seed, response_format, modalities,
        tool_reasoning_mode, reasoning_effort
    })
};
if (presetParams.stop_sequences) {
    params.stop = presetParams.stop_sequences;
}
// options 覆盖
if (options.temperature != null) params.temperature = options.temperature;
if (options.max_tokens != null) params.max_tokens = options.max_tokens;
if (options.top_p != null) params.top_p = options.top_p;
if (options.top_k != null) params.top_k = options.top_k;
if (options.frequency_penalty != null) params.frequency_penalty = options.frequency_penalty;
if (options.presence_penalty != null) params.presence_penalty = options.presence_penalty;
if (options.stop != null) params.stop = options.stop;
```

**特点**：所有高级采样参数（top_k、top_a、min_p、repetition_penalty、typical_p、tfs、mirostat_*、dry_*、xtc_*、seed、response_format、modalities、tool_reasoning_mode、reasoning_effort）一次性展开；**`options.temperature` 会被 backup 中允许覆盖**（L11713）。

### 1.2 current 的实现（`js/core.js:4668–4790` + `js/core.js:4618–4662`）

```js
// js/core.js:4668–4731
function buildAIRequestBody(messages, options, config) {
    if (typeof PresetManager === 'undefined') {
        throw new Error('PresetManager 未初始化');
    }
    var presetParams = PresetManager.getParams();
    mergeAdvancedPresetParams(presetParams);
    // ...
    var params = {
        model: config.model || '',
        messages: messages,
        temperature: presetParams.temperature,
        max_tokens: presetParams.max_tokens,
        top_p: presetParams.top_p
    };
    if (!isCompatibleMode) {
        params.top_k = presetParams.top_k || 0;
        params.frequency_penalty = presetParams.frequency_penalty;
        // ... 同样 20+ 高级参数
    }
    if (presetParams.stop_sequences) {
        params.stop = presetParams.stop_sequences;
    }
    // options 中的采样参数覆盖预设
    // 此前 options.temperature 来自 gameState.temperature，会覆盖 PresetManager 的值
    if (options.max_tokens != null) params.max_tokens = options.max_tokens;
    if (options.top_p != null) params.top_p = options.top_p;
    if (options.top_k != null) params.top_k = options.top_k;
    if (options.frequency_penalty != null) params.frequency_penalty = options.frequency_penalty;
    if (options.presence_penalty != null) params.presence_penalty = options.presence_penalty;
    if (options.stop != null) params.stop = options.stop;
    var filtered = filterRequestParams(params);
    // ...
}
```

### 1.3 对比评价

| 项目 | backup | current | 评价 |
|------|--------|---------|------|
| 高级采样参数完整度 | 完整（21 个） | 完整（21 个） | ✅ 对齐 |
| `mergeAdvancedPresetParams` 提取 | inline | 抽成独立函数（4618–4638） | ✅ 重构合理 |
| `filterRequestParams` 提取 | inline | 抽成 `SKIP_DEFAULTS` 表（4566–4572）+ 函数 | ✅ 重构合理 |
| `options.temperature` 覆盖 | ✅ 允许 | ❌ **删除** | ⚠️ **功能丢失**——`core.js:4735` 注释说"此前 options.temperature 来自 gameState.temperature，会覆盖 PresetManager 的值，导致预设温度不生效"，但正确的修复应该是**只在 gameState.temperature 显式存在时**才覆盖，而不是一刀切删除 |
| `max_tokens` 兜底 | 默认 5（testConnection） / 由调用方 | 新增 `getContextSize` 动态约束（4770–4787） | ✅ current 优秀添加（避免硬编码 4096） |
| `temperature` 范围校验 | 无 | 新增 0–Inf 检查（4748–4754） | ✅ current 优秀添加 |

### 1.4 结论

- **应保留 current 优秀添加**：`mergeAdvancedPresetParams` 函数化、`filterRequestParams` 表驱动、`getContextSize` 动态约束、`temperature` 范围校验
- **应恢复 backup 优秀实现**：`options.temperature` 覆盖能力（被错误删除）

---

## 2. AI 错误码映射

### 2.1 backup 的实现（`backup/index.html:11243–11366`）

```js
function translateError(msg) {
    if (!msg) return '未知错误，请稍后重试';
    var m = msg;
    // 常见英文错误 -> 中文翻译映射表
    var map = {
        // 网络相关错误
        'Failed to fetch': '网络请求失败，请检查网络连接或API地址是否正确',
        'NetworkError when attempting to fetch resource': '网络错误，请检查网络连接',
        'Network request failed': '网络请求失败，请检查网络',
        'net::ERR_CONNECTION_REFUSED': '连接被拒绝，API地址可能不正确或服务未启动',
        'net::ERR_CONNECTION_TIMED_OUT': '连接超时，API服务器响应太慢',
        'net::ERR_NAME_NOT_RESOLVED': '域名解析失败，请检查API地址',
        'net::ERR_SSL_PROTOCOL_ERROR': 'SSL证书错误，请检查API地址是否使用HTTPS',
        'net::ERR_CERT_DATE_INVALID': 'SSL证书已过期',
        'net::ERR_INTERNET_DISCONNECTED': '网络已断开，请检查网络连接',
        'ECONNREFUSED': '连接被拒绝，API服务可能未启动',
        'ECONNRESET': '连接被重置，API服务器可能重启了',
        'ETIMEDOUT': '连接超时，API服务器响应太慢',
        'ENOTFOUND': '域名不存在，请检查API地址',
        // 请求取消
        'AbortError': '请求已取消',
        'The user aborted a request': '请求已被取消',
        // JSON 解析错误
        'Unexpected end of JSON input': '服务器返回了不完整的数据，请重试',
        'Unexpected token': '服务器返回了无法解析的数据',
        'JSON parse error': '服务器返回了无法解析的数据，请检查API配置',
        'SyntaxError': '数据格式错误，请检查API设置',
        // HTTP 状态码（直接匹配）
        '401 Unauthorized': '认证失败，API Key错误或已过期',
        '403 Forbidden': '没有权限，请检查API Key的访问权限',
        '404 Not Found': '请求的地址不存在，请检查API地址',
        '429 Too Many Requests': '请求过于频繁，请稍后再试',
        '500 Internal Server Error': 'API服务器内部错误，请稍后再试',
        '502 Bad Gateway': 'API网关错误，服务器可能正在维护',
        '503 Service Unavailable': 'API服务暂不可用，请稍后再试',
        '504 Gateway Timeout': 'API网关超时，服务器响应太慢',
        '401': '认证失败(API Key错误或已过期)',
        // ... 等等
        // API 特定错误
        'insufficient_quota': 'API额度不足，请充值或更换Key',
        'rate_limit_exceeded': '请求频率超限，请降低发送速度',
        'context_length_exceeded': '对话内容超出模型上下文长度限制，请压缩对话或更换模型',
        'invalid_api_key': 'API Key无效，请检查是否正确复制',
        'model_not_found': '模型不存在，请检查模型名称是否正确',
        // ...
    };
    // 翻译结果 + 原文追加：' (原始信息)'
    // HTTP NNN 状态码兜底：httpMap（400/401/403/...）
    // 都未匹配：截断 100 字符返回
}
```

**单一函数、单张 map 表**。逻辑清晰。

### 2.2 current 的实现（`js/core.js:3822–4029`）

```js
// js/core.js:3816–3849 注释
// 原 translateError 内有三套重复映射：
//   - HTTP_STATUS_MAP（行 3732，定义后从未被引用——死常量）
//   - httpMap（行 3895，inline 短版）
//   - apiCodeMap（行 3928，inline 独立表）
// 现合并为 _ERROR_MAPS.HTTP_STATUS（详情版）与 _ERROR_MAPS.API_CODE（精简版）
var _ERROR_MAPS = {
    HTTP_STATUS: {
        '400': '请求格式错误(400) → 请检查模型名称和参数是否正确',
        '401': '认证失败(401) → API Key错误或已过期，请到「设置→API配置」检查',
        '403': '没有权限(403) → 该API Key无权访问此模型，请检查Key的权限范围',
        '404': '地址不存在(404) → 请检查API地址是否正确（注意路径是否需要加/v1）',
        '408': '请求超时(408) → API服务器处理太慢，请重试',
        '429': '请求太频繁(429) → 已触发速率限制，请等待几秒后重试',
        '500': '服务器内部错误(500) → API服务商的问题，请稍后重试',
        '502': '网关错误(502) → API中转服务异常，可能正在维护',
        '503': '服务不可用(503) → API服务暂时过载或维护中，请稍后重试',
        '504': '网关超时(504) → API中转服务等待上游响应超时',
        '529': '站点过载(529) → API服务器负载过高，请稍后重试'
    },
    API_CODE: {
        '400': '请求格式错误 → 请检查模型名称和参数是否正确',
        '401': '认证失败 → API Key错误或已过期，请到「设置→API配置」检查',
        // ... 9 个 4xx/5xx
    }
};

// js/core.js:3852–3983 translateError 函数
function translateError(msg) {
    if (!msg) return '未知错误，请稍后重试';
    var m = msg;
    var map = {
        // ═══ 网络连接错误 ═══ (15 条)
        'Failed to fetch': '网络请求失败（可能原因：网络断开、API地址错误、服务未启动）→ 请检查网络连接和API地址',
        'NetworkError when attempting to fetch resource': '网络错误 → 请检查网络连接是否正常',
        // ... 比 backup 多：net::ERR_CONNECTION_CLOSED、net::ERR_EMPTY_RESPONSE、net::ERR_SOCKET_NOT_CONNECTED、
        //     EAI_AGAIN、EPROTO、UND_ERR_CONNECT_TIMEOUT
        // ═══ OpenAI/兼容API 特定错误 ═══
        // ... 与 backup 类似
        // ═══ API Key / 账户相关 ═══ (新增)
        'Incorrect API key provided': 'API Key 不正确 → ...',
        'You exceeded your current quota': '账户额度已用完 → ...',
        'You must provide a model': '未指定模型 → ...',
        'The model `': '模型不存在或已下架 → ...',
        'has been deprecated': '该模型已下架 → ...',
        'deprecat': '该模型已下架 → ...',
        'Billing': '账单问题 → ...',
        'billing_not_active': '账单未激活 → ...',
        'card_declined': '支付卡被拒绝 → ...',
        'trial_expired': '试用已过期 → ...',
        // ═══ 中文错误二次翻译（中转站返回的中文错误）═══ (新增)
        '余额不足': '账户余额不足 → 请到API服务商官网充值，或更换API Key',
        '额度不足': '账户额度不足 → 请到API服务商官网充值，或更换API Key',
        'API key 余额': 'API Key余额不足 → 请充值或更换Key',
        'key 已过期': 'API Key已过期 → 请到API服务商官网重新生成Key',
        '未配置模型': '未配置模型 → 请到「设置→API配置」填写模型名',
        '无效的': '参数无效 → 请检查API配置中的参数设置',
        // ═══ 模型相关 ═══ (新增)
        'invalid model': '模型名称无效 → ...',
        'model_overloaded': '模型过载 → ...',
        'model_rate_limit': '模型速率限制 → ...',
        // ═══ 内容安全/过滤 ═══ (新增)
        'content_filter': '内容被安全过滤 → ...',
        'safety': '安全过滤触发 → ...',
        'flagged': '内容被标记 → ...',
        // ═══ 流式/SSE相关 ═══ (新增)
        'stream_error': '流式传输错误 → ...',
        'connection lost': '连接丢失 → ...',
        // ═══ 模型兼容性错误（X19）═══ (新增)
        'does not exist': '该模型不存在或已下线 → ...',
        'model does not exist': '该模型不存在 → ...',
        'model is not found': '该模型未找到 → ...',
    };
    // 匹配路径：HTTP 状态码（HTTP_STATUS）→ 全 map 子串匹配（map 变量）→ API 错误码（API_CODE）→ 截断
}
```

### 2.3 对比评价

| 项目 | backup | current | 评价 |
|------|--------|---------|------|
| 网络错误覆盖 | 12 条（标准 net:: / ECONN*） | 18 条（多了 6 条，含中文错误） | ✅ current **更全** |
| 状态码覆盖 | 401/403/404/429/500/502/503/504 + 中文（8 条） | 408/400/401/403/404/408/429/500/502/503/504/529（11 条） | ✅ current 更全（多 408/529） |
| 中文错误二次翻译 | ❌ 无 | ✅ 6 条（余额/额度/Key 过期等） | ✅ current 优秀添加 |
| **OpenAI/兼容 API 特定错误** | `'insufficient_quota'` / `'rate_limit_exceeded'` / `'context_length_exceeded'` / `'invalid_api_key'` / `'model_not_found'` / `'openai_error'` / `'invalid_request_error'` / `'authentication_error'` / `'permission_denied'` / `'not_found'` / `'rate_limit_error'` / `'server_error'` / `'service_unavailable'` | 保留全部 + 新增 `'server_busy'` / `'overloaded'` / `'capacity'` | ✅ current 更全 |
| **`HTTP_STATUS` / `API_CODE` 死代码** | 不存在 | **定义后几乎不命中**——`API_CODE` 路径仅匹配 "Error: NNN" 格式，HTTP_STATUS 仅匹配 "HTTP NNN"；但**真正的所有错误码匹配都靠内联 map**（`Failed to fetch`、状态码字符串、OpenAI 错误名等都在 map 变量中） | ⚠️ **重构未完成**——`HTTP_STATUS` 与内联 map 重复定义相同状态码文案 |
| JavaScript 运行时错误 | `'Cannot read properties of null'` / `'Cannot read property'` / `'null is not an object'` / `'undefined is not an object'` / `'TypeError'` / `'ReferenceError'` | 保留全部 | ✅ 对齐 |
| 错误码结果格式 | `'翻译文案 (原始msg)'` | 同样 `'翻译文案 (原始msg)'` | ✅ 对齐 |
| backup 独有错误 | `'api key'` / `'api_key'` / `'API key'` / `'API Key'` / `'error processing'` / `'parse error'` / `'invalid response'` / `'empty response'` | 保留全部 + 新增 `'no api configuration'` / `'请求超时（5分钟）'` | ✅ 对齐 |

### 2.4 结论

- **应保留 current 优秀添加**：中文错误二次翻译、`408/529` 状态码、扩展的 OpenAI 错误、模型兼容性错误
- **应删除 current 错误修改**：
  - `_ERROR_MAPS.HTTP_STATUS` 和 `_ERROR_MAPS.API_CODE` 的死代码结构（与内联 map 重复定义）
  - 应该将内联 map 拆为 3 个 named module-level 表（NETWORK / HTTP_STATUS / OPENAI_ERROR），与拆分的设计意图一致

---

## 3. AI 响应解析

### 3.1 backup 的实现（`backup/index.html:10471–10572` + `10226–10469`）

```js
// backup/index.html:10471–10572 parseAIResponse
function parseAIResponse(reply) {
    let data = null;
    let storyText = '';
    // 1. 先尝试直接解析纯JSON（新格式）
    data = safeJSONParse(reply);
    // 2. 如果失败，兼容旧的```json格式
    if (!data) {
        const jsonMatch = reply.match(/```json\n?([\s\S]*?)\n?```/);
        if (jsonMatch) {
            data = safeJSONParse(jsonMatch[1]);
        }
    }
    // 3. 状态机兜底
    if (!data) {
        data = robustParse(reply);
    }
    // 4. 提取剧情文本
    if (data && data.story) {
        storyText = data.story;
    } else {
        // 状态机提取 story / JSON 字符串匹配 / 纯文本兜底
    }
    // 5. COT 标签剥离（6 种标签）
    //    <ECoT>...</ECoT> / <thinking>...</thinking> / <cot>...</cot> /
    //    <reasoning>...</reasoning> / <chain_of_thought>...</chain_of_thought> / 💭...💭
    // 6. 纯文本兜底（去掉 code block 残留）
    // 7. 小剧场融合：theaterVars / injectTheaterToLogs / _bridgeBranchesToChoices
    return { data, storyText };
}
```

**4 层兜底**（直接 JSON → 代码块 JSON → robustParse → 纯文本）。

辅助函数（10226–10469）：
- `safeJSONParse`：直接解析 + 状态机找 `{}` + 修复控制字符 + 切 `{}` 段
- `extractStr(text, field)`：状态机提字符串字段（**带 Unicode 转义处理**——`\n`/`"`/`\\`/`\uXXXX`）
- `extractArr(text, field)`：状态机提字符串数组
- `extractObj(text, field)`：状态机提对象
- `extractObjArr(text, field)`：状态机提对象数组
- `robustParse(raw)`：依次用 `extractStr('story')` / `extractObjArr('hud')` / `extractObjArr('choices')` / `extractObj('player')` / `extractObjArr('characters')` / `extractObjArr('world')` / `extractObjArr('bag')` 拼接部分 JSON

### 3.2 current 的实现（`js/ai-contract/response-parser.js`）

```js
// js/ai-contract/response-parser.js:5–93
parse(rawReply, options) {
    // 0. 剥离思维链（_stripThinkingTokens）
    //    THINKING_TAGS = ['think', 'thinking', 'reasoning', 'thought', 'analysis', 'ECoT', 'cot', 'chain_of_thought']
    // Level 0: direct JSON
    let data = this._tryDirectJSON(effectiveReply);
    // Level 1: code block JSON
    data = this._tryCodeBlockJSON(effectiveReply);
    // Level 2: 清理后 JSON + 状态机兜底（_tryRobustJSON + _repairTruncatedJSON）
    // Level 3: <mem> tags (pure text mode)
    // Level 4: plain text fallback
}
```

**5 层兜底**（剥离 thinking → direct → code block → 清理后 JSON + 状态机 → `<mem>` 标签 → 纯文本）。

辅助函数：
- `_tryDirectJSON` / `_tryCodeBlockJSON`：直接解析
- `_tryRobustJSON`：状态机找首尾 `{}` + `_findMatching` 括号匹配
- `_repairTruncatedJSON`：**智能补全被截断的 JSON**——状态机扫描未闭合的 `{`/`[` 层级 + 补全 `}`/`]`，从顶层逗号逐个回退（BUG-B 修复）
- `_tryMemTags`：提取 `<mem type="..." action="..." name="..." field="..." value="..." day="..." period="...">...</mem>` 标签
- `_tryPlainText`：纯文本兜底（也支持截断修复）
- `_findMatching`：括号匹配（字符串转义感知）

### 3.3 对比评价

| 项目 | backup | current | 评价 |
|------|--------|---------|------|
| 解析层数 | 4 层 | 5 层 | ✅ current 多 1 层（`<mem>` 标签） |
| 思维链标签数 | 6 个（`<thinking>`/`<ECoT>`/`<cot>`/`<reasoning>`/`<chain_of_thought>`/`💭`） | 8 个（多 `analysis`、`thought`） | ✅ current 更全 |
| **JSON 截断修复** | ❌ 无 | ✅ `_repairTruncatedJSON`（3 策略） | ✅ current **优秀添加**（修复 max_tokens 截断场景） |
| **`<mem>` 标签解析** | ❌ 无 | ✅ `_tryMemTags` | ✅ current 优秀添加（纯文本模式的状态机记忆） |
| 字符级 `extractStr/extractArr/extractObj/extractObjArr` 状态机 | ✅ 有（10226–10469） | ❌ 删了 | ⚠️ **功能丢失**——若 JSON 损坏但部分字段完整，backup 能逐字段恢复，current 必须完整 JSON |
| `safeJSONParse` 多重修复（控制字符、尾逗号） | ✅ 有 | ❌ 删了，被 `_tryRobustJSON` + `_repairTruncatedJSON` 部分覆盖 | ⚠️ **部分丢失** |
| `_postExtractMems` 二次处理 | ❌ 无 | ✅ 有（99–111）——AI 把 `<mem>` 嵌入 JSON story 字段时，自动剥离 | ✅ current 优秀添加 |

### 3.4 结论

- **应保留 current 优秀添加**：JSON 截断修复（`_repairTruncatedJSON`）、`<mem>` 标签解析、`_postExtractMems` 二次处理、8 个思维链标签
- **应恢复 backup 优秀实现**：
  - `extractStr/extractArr/extractObj/extractObjArr` 状态机提取函数——这些是 AI 返回半截 JSON 时的最后兜底
  - `safeJSONParse` 的尾逗号修复、控制字符过滤
- **应合并优势**：将 current 的 `_repairTruncatedJSON` 与 backup 的状态机字段提取结合——`safeJSONParse` 失败 → 状态机提取字段 → 仍失败则 `_repairTruncatedJSON`

---

## 4. JSON 契约字段（AI 输出 schema）

### 4.1 backup 的契约（来自 prompt L16297 + L18908）

```json
{
    "title": "当前章节标题",
    "story": "剧情正文，用\\n换行",
    "hud": [{"label": "显示名", "value": "数值", "icon": "单字图标"}],
    "choices": [{"id": "A", "text": "详细选项描述", "tag": "标签"}],
    "player": {
        "name": "角色名", "age": "年龄", "identity": "身份", "personality": "性格特点",
        "title": "显示在卡片标题的称号", "stats": [{"label": "属性名", "value": "属性值"}]
    },
    "characters": [{
        "name": "角色名", "title": "身份", "relation": "关系",
        "favorability": 50, "desc": "状态描述",
        "details": [{"key": "字段", "value": "值"}]
    }],
    "world": [
        {"type": "text", "title": "标题", "content": "内容"},
        {"type": "list", "title": "标题", "items": ["条目"]},
        {"type": "ranking", "title": "标题", "items": ["第一名"]},
        {"type": "key_value", "title": "标题", "items": [{"key": "键", "value": "值"}]},
        {"type": "cards", "title": "标题", "items": [{"icon": "...", "title": "...", "content": "..."}]},
        {"type": "comments", "title": "标题", "main": "主帖", "comments": [{"name": "...", "text": "..."}]},
        // current 缺失的扩展：
        {"type": "moments", "title": "朋友圈", "posts": [{"author": "...", "avatar": "👤", "text": "...", "time": "刚刚", "likes": 3, "comments": 1}]},
        {"type": "mail", "title": "收件箱", "items": [{"from": "...", "subject": "...", "body": "...完整邮件正文", "preview": "...", "date": "今天"}]},
        {"type": "shop", "title": "神秘商店", "items": [{"icon": "剑", "name": "...", "desc": "...", "price": 100}]}
    ],
    "bag": [{"name": "...", "count": 1, "desc": "...", "rarity": "普通", "usable": false, "effect": "...", "equippable": false, "equipped": false, "slot": "weapon"}],
    "quests": [{"title": "...", "type": "主线/支线/隐藏", "status": "进行中/已完成/失败", "progress": "2/5", "hint": "..."}],
    "relationships": [{"from": "角色A", "to": "角色B", "type": "关系类型", "desc": "..."}],
    "keyEvents": ["本回合发生的重要事件"],
    "npcMessages": [{"from": "NPC名字", "text": "NPC主动发给玩家的消息内容"}],
    "currency": 0,
    "currencyName": "根据世界观设定货币名称",
    "contextSummary": "用100-200字总结到目前为止所有剧情的关键信息",
    "gameTime": {"date": "...", "time": "...", "period": "...", "weather": "...", "era": "..."}
}
```

### 4.2 current 的契约（`js/ai-contract/schemas/ai-output-schema.js:10–29`）

```js
getDefaultOutput() {
    return {
        story: '',
        title: '',
        choices: [],
        player: { name: '', identity: '', stats: [] },
        characters: [],
        bag: [],
        currency: 0,
        currencyName: '金币',
        quests: [],
        gameTime: { date: '', time: '', period: '' },
        locations: [],
        keyEvents: [],
        relationships: [],
        world: [],
        contextSummary: '',
        hud: {}
    };
}
```

### 4.3 对比评价

| 字段 | backup 契约 | current schema | 评价 |
|------|-------------|---------------|------|
| `title` | ✅ | ✅ | 对齐 |
| `story` | ✅ | ✅ | 对齐 |
| `choices` | `[{id, text, tag}]` | `[{id, text/label}]` | ⚠️ 丢 `tag` |
| `hud` | `[{label, value, icon}]` | `{}` (object) | ⚠️ **schema 类型不一致**——backup 是数组，current 是对象 |
| `player` | `{name, age, identity, personality, title, stats: [{label, value}]}` | `{name, identity, stats}` | ⚠️ 丢 `age`/`personality`/`title` |
| `characters` | `[{name, title, relation, favorability, desc, details: [{key, value}]}]` | `[any]` | ⚠️ 丢所有内部结构定义 |
| `world` | 7 种 type（含 moments/mail/shop/comments） | `[any]` | ⚠️ **丢全部 type 定义**——这是酒馆主控世界书的核心扩展 |
| `bag` | `[{name, count, desc, rarity, usable, effect, equippable, equipped, slot}]` | `[any]` | ⚠️ 丢字段 |
| `quests` | `[{title, type, status, progress, hint}]` | `[any]` | ⚠️ 丢字段 |
| `relationships` | `[{from, to, type, desc}]` | `[any]` | ⚠️ 丢字段 |
| `keyEvents` | `["事件1", "事件2"]` | `[any]` + 归一化为字符串数组 | ✅ current 实际有处理（79–86） |
| `npcMessages` | `[{from, text}]` | ❌ **缺失** | ⚠️ **丢失**——backup 的 NPC 主动消息系统无对应字段 |
| `currency` | `0` | `0` | 对齐 |
| `currencyName` | `'金币'` | `'金币'` | 对齐 |
| `contextSummary` | `'100-200字...'` | `''` | 对齐 |
| `gameTime` | `{date, time, period, weather, era}` | `{date, time, period}` | ⚠️ 丢 `weather` / `era` |
| `locations` | ❌ backup 无 | `[]` | current 新增（无对应 backup 字段） |

### 4.4 结论

- **应保留 current 优秀添加**：`locations` 字段（虽然 backup 没有，但 current 引入了）
- **应恢复 backup 优秀实现**：
  - `npcMessages` 字段——这是 backup 中"手机功能"的核心数据源
  - `world[].type=comments` / `world[].type=moments` / `world[].type=mail` / `world[].type=shop` 类型契约
  - `hud[]` 数组契约（不是 `hud{}` 对象）
  - `characters[].details[]` / `bag[].rarity/usable/equippable` 等细粒度契约
  - `gameTime.weather` / `gameTime.era` 字段

---

## 5. 宏引擎

### 5.1 backup 的实现（`backup/index.html:18111–18600+`）

```js
// backup/index.html:18111–18260 MacroEngine.process
process: function(text, env) {
    if (!text || typeof text !== 'string') return text || '';
    const self = this;
    env = env || {};

    // 第一组：preEnvMacros（环境变量之前执行）
    // 1. 旧式标记 <USER> <BOT> <CHAR> <GROUP>
    // 2. 变量宏
    //    {{setvar::name::value}} / {{setglobalvar::...}} / {{addvar::...}} /
    //    {{incvar::name}} / {{decvar::name}} / {{deletevar::name}} / {{deleteglobalvar::name}}
    // 3. 基础工具宏
    //    {{newline}} / {{trim}} / {{noop}}

    // 变量简写
    text = this._processVariableShorthand(text);  // {{.var=val}} / {{$var=val}} / {{.var++}} / {{.var||fallback}}

    // 第二组：envMacros
    // {{user}} / {{char}} / {{original}} / {{raw::text}} /
    // {{input}} / {{lastMessage}} / {{lastUserMessage}} / {{lastCharMessage}} /
    // {{description}} / {{personality}} / {{scenario}}

    // 第三组：postEnvMacros
    // {{getvar::name}} / {{getglobalvar::name}} / {{hasvar::name}} / {{hasglobalvar::name}}
    // 时间：{{time}} / {{date}} / {{weekday}} / {{isotime}} / {{isodate}} / {{timestamp:fmt}} / {{datetimeformat fmt}} / {{time_UTC+X}}
    // {{uuid}}
    // {{pick::a::b::c}} / {{roll:1d6}} / {{roll 1d6}} / {{reverse::str}}
    // 注释：{{//...}}

    // 字符串/数学宏
    // {{uppercase::t}} / {{lowercase::t}} / {{strlen::t}} / {{substring::t::s::e}} / {{replace::t::f::r}}
    // {{min::a::b}} / {{max::a::b}} / {{abs::n}} / {{round::n}} / {{floor::n}} / {{ceil::n}}

    // 角色/会话信息宏
    // {{persona}} / {{user_persona}} / {{char_persona}} / {{model}} / {{chatSize}} / {{chatIndex}}
    // {{output}} / {{slot}} / {{charCard}} / {{example_message}}

    // 字符/比较/函数宏
    // {{eq::a::b}} / {{setcharvar::n::v}} / {{getcharvar::n}} / {{chatMetadata::k}}
    // {{random::args}}
}
```

**宏总数**：约 60 个。

### 5.2 current 的实现（`js/modules/macro-engine.js:682–1350`）

```js
// js/modules/macro-engine.js:682 process
process: function(text, env) {
    // 第一组：同 backup
    // - <USER> / <BOT|CHAR> / <GROUP>
    // - setvar/setglobalvar/addvar/incvar/decvar/deletevar/deleteglobalvar
    // - {{newline}} / {{trim}} / {{noop}}
    // - 变量简写 {{.var=val}} / {{$var=val}} / {{.var++}} / {{.var||fallback}} / {{$var||fallback}}

    // 第二组：同 backup
    // - {{user}} / {{char}} / {{original}} / {{raw::text}}
    // - {{input}} / {{lastMessage}} / {{lastUserMessage}} / {{lastCharMessage}}
    // - {{description}} / {{personality}} / {{scenario}}

    // 第三组：同 backup
    // - {{getvar::n}} / {{getglobalvar::n}} / {{hasvar::n}} / {{hasglobalvar::n}}
    // - 时间/UUID/pick/roll/reverse
    // - 字符串/数学宏
    // - 角色/会话信息
    // - {{eq::a::b}} / {{setcharvar::n::v}} / {{getcharvar::n}} / {{chatMetadata::k}}
    // - {{random::args}}
}
```

**宏总数**：约 70 个（多 `_processVariableShorthand` 中的 10+ 简写语法）。

### 5.3 对比评价

| 宏 | backup | current | 评价 |
|----|--------|---------|------|
| `{{user}}` / `{{char}}` / `{{input}}` / `{{description}}` / `{{personality}}` / `{{scenario}}` | ✅ | ✅ | 对齐 |
| `{{setvar::n::v}}` / `{{getvar::n}}` / `{{incvar}}` / `{{decvar}}` | ✅ | ✅ | 对齐 |
| `{{getglobalvar::n}}` / `{{setglobalvar::n::v}}` | ✅ | ✅ | 对齐 |
| `{{pick::a::b::c}}` / `{{roll:1d6}}` / `{{random::args}}` | ✅ | ✅ | 对齐 |
| `{{uppercase/lowercase/strlen/substring/replace::t::...}}` | ✅ | ✅ | 对齐 |
| `{{min/max/abs/round/floor/ceil::a::b}}` | ✅ | ✅ | 对齐 |
| 变量简写 `{{.var}}` / `{{.var=val}}` / `{{$var}}` / `{{$var=val}}` | ✅ | ✅ | 对齐 |
| `{{.var||fallback}}` / `{{$var||fallback}}` / `{{.var++}}` / `{{.var--}}` | ✅ | ✅ | 对齐 |
| `{{.var+=n}}` / `{{.var-=n}}` | ✅ | ✅ | 对齐 |
| `{{pipe\|uppercase}}` | ✅ | ✅ | 对齐 |
| `{{if:cond}}...{{else}}...{{/if}}` 条件判断 | ✅ | ❌ **缺失** | ⚠️ **重要丢失**——在 STscript Parser 中实现（`_processConditions`，backup L31692–31714），但 macro-engine.js 中无对应实现 |
| 小剧场变量别名（`盲盒之愿` / `每日之愿` / `论坛之愿` 等 30+） | ✅ | ✅（在 `_THEATER_VAR_KEYS`） | 对齐 |

### 5.4 结论

- **应保留 current 优秀添加**：
  - 变量简写语法的扩展（虽然 backup 也有，但 current 的实现更规范，10+ 简写语法）
  - `_TIMESTAMP_REGEX_MAP` 预编译正则（性能优化）
  - `_THEATER_VAR_KEYS` 表驱动的小剧场变量映射
- **应恢复 backup 优秀实现**：
  - **`{{if:cond}}...{{else}}...{{/if}}` 条件判断**——这是酒馆宏引擎的核心特性，backup 在 `STscriptParser._processConditions` 中实现（L31692），current 完全丢失

---

## 6. 正则引擎

### 6.1 backup 的实现（`backup/index.html:16850–17030`）

```js
// backup/index.html:16857–17020 parseSingleRegex（部分）
parseSingleRegex: function(data, isImport) {
    var applyInput = false, applyOutput = false;
    var extraPlacements = [];
    var hasExplicitPlacement = data.placement !== undefined && data.placement !== null;
    var isEmptyPlacement = Array.isArray(data.placement) && data.placement.length === 0;
    if (hasExplicitPlacement && !isEmptyPlacement) {
        if (Array.isArray(data.placement)) {
            applyInput = data.placement.includes(2);
            applyOutput = data.placement.includes(1);
            data.placement.forEach(function(p) {
                if (p !== 1 && p !== 2) extraPlacements.push(p);
            });
        } else if (typeof data.placement === 'number') {
            applyInput = data.placement === 2;
            applyOutput = data.placement === 1;
            if (data.placement !== 1 && data.placement !== 2) extraPlacements.push(data.placement);
        }
    } else if (!hasExplicitPlacement && !isImport) {
        applyInput = true;
        applyOutput = true;
    }
    return {
        id: data.id || ...,
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
        substituteRegex: ...,
        minDepth: ...,
        maxDepth: ...,
        _originalPlacement: ...
    };
}
```

### 6.2 current 的实现（`js/modules/regex-manager.js:596–674`）

**与 backup 几乎完全相同**——placement 数组 → input/output 映射逻辑一致；额外 placement 保留一致；`findRegex` / `find` / `replaceString` / `replace` 字段名兼容一致；`trimStrings` 字符串/数组归一化一致；`substituteRegex` 布尔/字符串/数字三态一致。

### 6.3 对比评价

| 项目 | backup | current | 评价 |
|------|--------|---------|------|
| `placement: [1]` / `placement: [2]` / `placement: [1,2]` 语义 | ✅ 正确 | ✅ 正确 | 对齐 |
| `placement: 1` (单数字) 兼容 | ✅ | ✅ | 对齐 |
| `placement: []` (空数组) 不应用 | ✅ | ✅ | 对齐 |
| `placement: undefined` (导入) 不应用 | ✅ | ✅ | 对齐 |
| `placement: undefined` (新建) 默认应用 | ✅ | ✅ | 对齐 |
| 额外 placement（3, 5, 6）保留 | ✅ | ✅ | 对齐 |
| `_originalPlacement` 导出时保留 | ✅ | ✅ | 对齐 |
| `substituteRegex: 0/1/2` 三态 | ✅ | ✅ | 对齐 |
| `minDepth` / `maxDepth` / `runOnEdit` / `markdownOnly` / `promptOnly` | ✅ | ✅ | 对齐 |
| `preset_allowed_regex` 安全机制 | ❌ backup 没有 | ✅ current 新增（54–73） | ✅ current 优秀添加 |

### 6.4 结论

- 正则引擎与 backup **几乎完美对齐**——`parseSingleRegex` 实质上是 backup 的 copy
- **应保留 current 优秀添加**：`preset_allowed_regex` 安全机制（仿酒馆 `extension_settings.preset_allowed_regex`）

---

## 7. 预设管理（V2/V3/V4 预设格式支持）

### 7.1 backup 的实现（`backup/index.html:14800–14950` + `12649–13790`）

```js
// backup/index.html:14800 parsePreset
parsePreset: function(data, fileName) {
    // V2 字段提取：
    //   - prompts / prompt_order / temperature / top_p / top_k / top_a /
    //     min_p / repetition_penalty / typical_p / tail_free_sampling /
    //     mirostat_mode / mirostat_tau / mirostat_eta /
    //     dry_multiplier / xtc_probability / reasoning_effort / seed / max_tokens
    //   - V2 Spec：priority / probability / position 字符串格式 / V2 decorators
    //   - V2 character_book 集成
    //   - chat/System/Tags 字段
    // prompt_order 排序：character_id === 100000 优先
}

// backup/index.html:12649–13790 V2 Spec 解析
// - V2 prompts: { name, content, system_prompt, injection_position, injection_order, enabled, marker }
// - V2 world_info / character_book
// - V2 extensions: regex_scripts, world_info_entries, entryGrouping (蛾摩拉 2.4)
// - decorators: @@activate / @@dont_activate / @@invert / @@icon / @@always_for / @@exclude_recursion

// backup/index.html:14848–14849 DeepSeek V4 支持
reasoning_effort: data.reasoning_effort || null,
```

### 7.2 current 的实现（`js/modules/preset-manager.js:433–670`）

```js
// js/modules/preset-manager.js:433 parsePreset
parsePreset: function(data, fileName) {
    // 提取字段（与 backup 类似）
    // 488: reasoning_effort: data.reasoning_effort || null,
    // 514: prompt_order 排序：character_id === 100000 优先
    // 592-612: V2 字段提取
    // 620-632: prompt_order 排序逻辑
}
```

### 7.3 对比评价

| 项目 | backup | current | 评价 |
|------|--------|---------|------|
| V2 `prompts` 格式 | ✅ | ✅ | 对齐 |
| V2 `prompt_order` 排序（character_id 100000 优先） | ✅ | ✅ | 对齐 |
| V2 `injection_position` / `injection_order` | ✅ | ✅ | 对齐 |
| V2 `enabled` / `marker` / `system_prompt` | ✅ | ✅ | 对齐 |
| V2 `decorators`（`@@activate` / `@@dont_activate`） | ✅ | ✅ | 对齐 |
| V2 `world_info_entries` 集成 | ✅ | ✅ | 对齐 |
| V2 `extensions.entryGrouping`（蛾摩拉 2.4） | ✅ | ❓ 待确认 | current 中没有发现 entryGrouping 处理 |
| V2 `character_book` 集成 | ✅ | ❓ | current 未见 |
| **DeepSeek V4 `reasoning_effort` 字段** | ✅ L14848 | ✅ L488 | 对齐 |
| V3 / V4 预设格式 | ✅ | ❓ | 几乎未提及 |

### 7.4 结论

- 预设管理基本对齐 backup
- **应恢复 backup 优秀实现**：
  - `entryGrouping`（蛾摩拉 2.4 分组系统）
  - `character_book` 角色卡集成
  - V3 / V4 预设格式的明确支持声明（虽然 prompt builder 中已用，但 preset 解析层未声明支持版本）

---

## 8. 酒馆助手 STScript（**严重丢失**）

### 8.1 backup 的实现

**完整 STscript v2.1 引擎**，包含以下模块：

| 模块 | 行号 | 功能 |
|------|------|------|
| `STscriptParser` | L31640–32127 | 主解析器（解析 setvar、conditions、random、roll、TemplateVars、XML macros、logic ops） |
| `STscriptEngine` 类 | L32132–32240 | 主引擎（processPreset、processResponse、processPromptText、getVar、getGlobalVar） |
| `STscriptVariableStore` | L32240 | 变量存储（local/global/character） |
| `STscriptTemplateVars` | L32241 | 模板变量（user/char/description/personality/scenario 等） |
| `PromptInjector` | L31900+ | prompt_order 应用、entryGrouping、buildPrompt |
| `RegexEngine.execute` | L32195–32218 | 蛾摩拉/果实正则格式执行 |
| `TavernHelperCompat` | L28230+ | `getContext` / `registerSlashCommand` (L28379) / 控制流收集模式 while/foreach (L28240) |
| `initSTscriptIntegration` | L32888+ | 集成到游戏系统：loadPreset hook + 变量注入 + 状态通知 |
| STscript UI 集成 | L31541 | `STscriptUI.onVariableChange` |

**关键证据**：

```js
// backup/index.html:28379
registerSlashCommand: function(name, callback) { this._slashCommands[name.toLowerCase()] = callback; },

// backup/index.html:28427 — /setvar slash command
case 'setvar':
    if(!m) m=argsStr.match(/(\S+)\s+(.*)/);  // 支持 /setvar key value 格式

// backup/index.html:28646 — slash command 调用
if(this._slashCommands[commandName]) result=this._slashCommands[commandName](argsStr);

// backup/index.html:28919 — 自定义 slash command 注册
self.registerSlashCommand(cmdName, function(){

// backup/index.html:31673–31678 — STscriptParser _processSetVars
text = text.replace(/\{\{setvar::([^:]+?)::([\s\S]*?)\}\}/g, function(full, name, val) {
    val = (val || '').trim();
    val = self.parse(val, { context: TemplateVars.context });
    VariableStore.setLocal(name.trim(), val);
    return '';
});

// backup/index.html:31692–31714 — STscriptParser _processConditions
_processConditions(text) {
    let maxIter = 20;
    while (text.includes('{{if:') && text.includes('{{/if}}') && maxIter-- > 0) {
        const innerIf = /\{\{if:([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
        // ... 嵌套 if/else/endif
    }
    return text;
}

// backup/index.html:32239–32247
global.STscriptEngine = STscriptEngine;
global.STscriptVariableStore = VariableStore;
global.STscriptTemplateVars = TemplateVars;
// ...
global.stscriptEngine = new STscriptEngine();
console.log('[STscript v2.1] 引擎已初始化 — 兼容果实/月读/蛾摩拉预设');
```

### 8.2 current 的实现（`js/ai-contract/stscript-bridge.js`）

**仅 137 行的 bridge 文件**——**只 hook 上游函数，无任何 STscript 引擎实现**：

```js
// js/ai-contract/stscript-bridge.js:41–69
// ── Hook 1: PresetManager.loadPreset ──
var origLoadPreset = PresetManager.loadPreset;
PresetManager.loadPreset = function(idx) {
    _presetVarCacheKey = null;
    _presetVarParsed = false;
    var result = origLoadPreset.call(this, idx);
    var preset = this.presets[idx];
    if (preset && window.gameAdapter) {
        window.gameAdapter.onPresetLoaded(preset);
        // ... setCharacter / updateContext
    }
    return result;
};

// js/ai-contract/stscript-bridge.js:97–123
// ── Hook 6: 增强 RegexManager 支持月读/蛾摩拉正则格式 ──
if (typeof RegexManager !== 'undefined') {
    var origApplyToOutput = RegexManager.applyToOutput;
    if (origApplyToOutput) {
        RegexManager.applyToOutput = function(text) {
            text = origApplyToOutput.call(this, text);
            if (window.gameAdapter && window.gameAdapter.currentPreset) {
                text = window.gameAdapter.processResponse(text, { ... });
            }
            return text;
        };
    }
    // ... applyToInput 同理
}
```

**完整缺失**：
- ❌ `STscriptParser` 类（解析 if/else/endif、setvar 递归、random、roll）
- ❌ `STscriptEngine` 主类（processPreset / processResponse / processPromptText）
- ❌ `registerSlashCommand`（酒馆最关键 API）
- ❌ `/setvar` / `/getvar` / `/if` / `/random` 等 slash command 实现
- ❌ 控制流命令 while / foreach 收集模式
- ❌ 蛾摩拉 2.4 `entryGrouping` 提示词分组
- ❌ `STscriptUI.onVariableChange` 事件通知

### 8.3 对比评价

| 项目 | backup | current | 评价 |
|------|--------|---------|------|
| `STscriptParser` 解析器 | ✅ 完整 | ❌ 缺失 | **严重丢失** |
| `STscriptEngine` 主类 | ✅ | ❌ | **严重丢失** |
| `STscriptVariableStore` / `STscriptTemplateVars` | ✅ | ❌ | **严重丢失** |
| `registerSlashCommand` 酒馆 API | ✅ 28379 | ❌ 缺失 | **严重丢失**——`/setvar` / `/getvar` / `/random` / `/if` 等命令全部无法使用 |
| `{{if:cond}}...{{else}}...{{/if}}` 条件宏 | ✅ 31692 | ❌ 缺失 | **严重丢失** |
| `PromptInjector.applyPromptOrder` | ✅ | ❌ | **严重丢失** |
| `entryGrouping` 蛾摩拉 2.4 | ✅ | ❌ | **严重丢失** |
| `getContext()` 酒馆兼容 | ✅ 28250 | ❌ 缺失 | **严重丢失**——酒馆扩展（Quick Reply / 第三方插件）无法使用 |
| 集成 hook（`loadPreset` / `applyToOutput` / `applyToInput`） | ✅ | ✅ | ✅ current 部分保留 |
| `gameAdapter` window 全局 | ❌ | ✅ | ✅ current 重构产物 |

### 8.4 结论

**STScript 是 current 中最严重的丢失**——`/setvar` / `/getvar` / `/if` / `/random` 等酒馆核心 slash command 全部无法使用；蛾摩拉 / 果实 / 月读三大预设格式的兼容丢失。

- **应恢复 backup 优秀实现**（**最高优先级**）：
  - `STscriptParser` + `STscriptEngine` 完整引擎
  - `registerSlashCommand` 酒馆 API
  - `{{if:cond}}...{{else}}...{{/if}}` 条件宏
  - `entryGrouping` 蛾摩拉 2.4
  - `getContext()` / `updateContext()` 酒馆兼容
  - `STscriptUI.onVariableChange` 事件通知

---

## 9. 总结优先级排序

按"被改坏的严重性"从高到低：

| 优先级 | 项目 | 评价 | 恢复成本 |
|--------|------|------|---------|
| **P0 严重** | STScript 完整引擎丢失 | `registerSlashCommand` / `{{if:}}` / `entryGrouping` / `getContext` 全部缺失；酒馆 / 蛾摩拉 / 果实 / 月读预设兼容性破坏 | 高（~800 行） |
| **P0 严重** | JSON 契约 `npcMessages` / `world[].type` 字段丢失 | 失去与酒馆主控世界书 / backup 原版的契约一致性；备份的 NPC 主动消息系统无法对齐 | 中（schema 改 6 行 + 业务 30+ 行） |
| **P1 重要** | `_ERROR_MAPS.HTTP_STATUS` / `API_CODE` 死代码 | 注释承诺"两表共用"，实际只有内联 map 真正被命中 | 低（10 行清理） |
| **P1 重要** | `options.temperature` 覆盖能力被错误删除 | 修复方向错误，应"条件覆盖"而非"一律不覆盖" | 低（1 行） |
| **P2 中等** | `extractStr/extractArr/extractObj/extractObjArr` 状态机函数丢失 | JSON 损坏时逐字段恢复能力丢失 | 中（200 行） |
| **P3 保留** | JSON 截断修复（`_repairTruncatedJSON`） | ✅ current 优秀添加 | 保留 |
| **P3 保留** | `<mem>` 标签解析 | ✅ current 优秀添加 | 保留 |
| **P3 保留** | 8 个思维链标签（多 `analysis` / `thought`） | ✅ current 更全 | 保留 |
| **P3 保留** | `preset_allowed_regex` 安全机制 | ✅ current 优秀添加 | 保留 |
| **P3 保留** | `mergeAdvancedPresetParams` / `filterRequestParams` 函数化重构 | ✅ 合理重构 | 保留 |
| **P3 保留** | `getContextSize` 动态约束 | ✅ 合理重构 | 保留 |
| **P3 保留** | `temperature` 范围校验 | ✅ 合理重构 | 保留 |
| **P3 保留** | 中文错误二次翻译 | ✅ current 优秀添加 | 保留 |
| **P3 保留** | `408/529` HTTP 状态码 | ✅ current 更全 | 保留 |
| **P3 保留** | 变量简写语法扩展 | ✅ current 优秀添加 | 保留 |

---

## 10. 报告附录

### 10.1 文件清单

| 路径 | 行数 | 角色 |
|------|------|------|
| `/workspace/backup/index.html` | 33,308 | backup 原始参考版（单文件） |
| `/workspace/js/core.js` | 5,604 | current `callAI` / `buildAIRequestBody` / `translateError` / `callAI` 主入口 |
| `/workspace/js/ai-contract/response-parser.js` | 461 | current 5 层解析器 + 截断修复 |
| `/workspace/js/ai-contract/output-sanitizer.js` | 80 | current 输出清理 + 8 个思维链标签 |
| `/workspace/js/ai-contract/schemas/ai-output-schema.js` | 137 | current AI 输出 schema（**丢字段**） |
| `/workspace/js/ai-contract/prompt-builder.js` | 241 | current prompt 片段化构建器（新增） |
| `/workspace/js/ai-contract/ai-response-mutator.js` | 672 | current 响应变更器（5 项校验规则） |
| `/workspace/js/ai-contract/stscript-bridge.js` | 137 | current STscript **hook only**（**整块引擎丢失**） |
| `/workspace/js/modules/macro-engine.js` | 1,353 | current 宏引擎（**条件宏丢失**） |
| `/workspace/js/modules/regex-manager.js` | 1,169 | current 正则引擎（与 backup 几乎一致） |
| `/workspace/js/modules/preset-manager.js` | 1,951 | current 预设管理（与 backup 几乎一致） |
| `/workspace/js/modules/smart-config-engine.js` | 310 | current 智能配置（新增） |

### 10.2 关键行号速查

| 内容 | backup 行号 | current 行号 |
|------|------------|-------------|
| `translateError` 函数定义 | 11243–11366 | 3852–4029 |
| `callAI` 函数定义 | 11615–11930 | 5037–5088 |
| `buildAIRequestBody`（current 独有） | N/A | 4668–4790 |
| `parseAIResponse`（backup）/ `parse`（current） | 10471–10572 | 5–93 |
| `safeJSONParse` | 10226–10264 | ❌ 删了 |
| `extractStr` / `extractArr` / `extractObj` / `extractObjArr` 状态机 | 10323–10439 | ❌ 删了 |
| `robustParse` | 10441–10469 | 合并到 `_tryRobustJSON` |
| `MacroEngine.process` | 18111–18410+ | 682–1350 |
| `STscriptParser` | 31640–32127 | ❌ 删了 |
| `STscriptEngine` | 32132–32240 | ❌ 删了 |
| `registerSlashCommand` | 28379 | ❌ 删了 |
| `registerRegexScript parseSingleRegex` | 16857–17020 | 596–674 |
| `parsePreset` | 14800–14950 | 433–670 |
| `_findMatching` 括号匹配 | 内部使用 | 440–458 |

### 10.3 报告生成说明

- 本报告基于代码静态对比，未做运行时验证
- 报告以 backup 为参考基线，识别 current 中**错误**的修改和**优秀**的添加
- 所有发现以文件路径 + 行号 + 代码片段为依据，可直接定位修复
- 重点关注"酒馆 API 对齐度"——用户使用酒馆生态预设时的兼容性
