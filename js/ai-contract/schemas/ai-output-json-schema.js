// ========================================
// AI 输出 JSON Schema（OpenAI/DeepSeek/通义 strict 模式用）
// 与 ai-output-schema.js（normalize/validate 用）并存，职责分离：
//   - ai-output-schema.js: 字段别名/normalize/validate，代码层用
//   - 本文件: 标准 JSON Schema draft-07，传给 API 做 strict 约束
// ========================================
// 设计原则：
// 1. 只约束核心结构（story + title + choices + gameTime + keyEvents）
//    其他字段用 additionalProperties: true 让 AI 自由发挥，避免 schema 过严导致生成失败
// 2. strict:true 要求所有 properties 都在 required 里，且不能有 additionalProperties:true
//    （OpenAI strict 模式限制）因此实际 strict schema 比"宽松 schema"字段更少
// 3. 提供 getStrictSchema() 和 getLooseSchema() 两套：
//    - strict: 给支持 strict 的 API（DeepSeek/通义/OpenAI/Claude）用，字段最小集
//    - loose: 给只支持 json_object 的 API 用，不约束字段
// ========================================

const AIOutputJSONSchema = {

    // strict 模式 schema（字段最小集，所有字段 required，无 additionalProperties）
    // OpenAI strict 模式硬性要求：properties 里所有字段必须在 required 数组里
    getStrictSchema() {
        return {
            type: 'object',
            properties: {
                story: {
                    type: 'string',
                    description: '叙事正文，用\\n换行，对话用「」包裹，第二人称"你"叙事'
                },
                title: {
                    type: 'string',
                    description: '本回合章节标题，简短'
                },
                choices: {
                    type: 'array',
                    description: '玩家可选的选项列表，2-4个',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', description: '选项标识' },
                            text: { type: 'string', description: '选项文本' }
                        },
                        required: ['id', 'text'],
                        additionalProperties: false
                    }
                },
                gameTime: {
                    type: 'object',
                    description: '游戏内时间',
                    properties: {
                        date: { type: 'string', description: '日期，如"第3天"' },
                        time: { type: 'string', description: '时刻，如"卯时"' },
                        period: { type: 'string', description: '时段：morning/afternoon/evening/night' }
                    },
                    required: ['date', 'time', 'period'],
                    additionalProperties: false
                },
                keyEvents: {
                    type: 'array',
                    description: '本回合关键事件，字符串数组',
                    items: { type: 'string' }
                },
                player: {
                    type: 'object',
                    description: '主角状态',
                    properties: {
                        name: { type: 'string' },
                        identity: { type: 'string' },
                        stats: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    label: { type: 'string' },
                                    value: { type: 'number' }
                                },
                                required: ['label', 'value'],
                                additionalProperties: false
                            }
                        }
                    },
                    required: ['name', 'identity', 'stats'],
                    additionalProperties: false
                }
            },
            required: ['story', 'title', 'choices', 'gameTime', 'keyEvents', 'player'],
            additionalProperties: false,
            // strict:true 是 OpenAI/DeepSeek 的扩展字段，要求模型严格遵守 schema
            strict: true
        };
    },

    // loose 模式（json_object）—— 只要求返回 JSON 对象，不约束字段
    // 用于不支持 json_schema strict 的 API
    getJsonObjectSchema() {
        return { type: 'json_object' };
    },

    // 构造 OpenAI 格式的 response_format
    // mode: 'strict' | 'json_object' | null
    buildResponseFormat(mode) {
        if (mode === 'strict') {
            return {
                type: 'json_schema',
                json_schema: {
                    name: 'game_output',
                    schema: this.getStrictSchema(),
                    strict: true
                }
            };
        }
        if (mode === 'json_object') {
            return this.getJsonObjectSchema();
        }
        return null;
    },

    // 检测模型是否可能支持 json_schema strict 模式
    // 保守策略：只对已知支持 strict 的模型族返回 true
    // 不在白名单的模型走 json_object 兜底，避免 400 错误
    isStrictSupported(modelName) {
        if (!modelName || typeof modelName !== 'string') return false;
        var m = modelName.toLowerCase();
        // DeepSeek 系（官方支持 json_schema strict）
        if (/deepseek/.test(m)) return true;
        // OpenAI GPT-4o / GPT-4.1 / o1 / o3 系（官方支持）
        if (/gpt-4o|gpt-4\.1|gpt-4-turbo|^o1|^o3|^o4/.test(m)) return true;
        // 通义 Qwen 系（阿里云官方支持）
        if (/qwen/.test(m)) return true;
        // Claude 3.5+ 系（Anthropic 通过 tool_use 间接支持，这里保守返回 false 走 json_object）
        // 智谱 GLM-4+ 系（支持 json_object，strict 支持不稳定，保守返回 false）
        return false;
    },

    // 检测模型是否至少支持 json_object 模式
    // 比 strict 宽松，绝大多数 OpenAI 兼容 API 都支持
    isJsonObjectSupported(modelName) {
        if (!modelName || typeof modelName !== 'string') return false;
        var m = modelName.toLowerCase();
        // 已知不支持的：少数老模型或本地小模型
        // 保守起见，不在黑名单的都认为支持
        if (/text-davinci|davinci|curie|babbage|ada/.test(m)) return false;
        return true;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = AIOutputJSONSchema;
