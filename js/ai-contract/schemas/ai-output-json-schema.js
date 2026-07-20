// ========================================
// AI 输出 JSON Schema（OpenAI/DeepSeek/通义 strict 模式用）
// 与 ai-output-schema.js（normalize/validate 用）并存，职责分离：
//   - ai-output-schema.js: 字段别名/normalize/validate，代码层用
//   - 本文件: 标准 JSON Schema draft-07，传给 API 做 strict 约束
// ========================================
// 设计原则：
// 1. strict schema 必须覆盖 prompt-builder.js / game.js _buildFormatRules 要求的全部字段
//    否则 additionalProperties:false 会禁止 AI 输出 characters/items/quests 等
//    导致游戏状态系统（角色/物品/任务）完全失效（P0 修复 R1/BUG-B）
// 2. strict:true 要求所有 properties 都在 required 里，且 additionalProperties:false
//    （OpenAI strict 模式限制）因此所有字段都标记 required，AI 每轮必须返回（空时返回空数组）
// 3. 提供 getStrictSchema() 和 getJsonObjectSchema() 两套：
//    - strict: 给支持 strict 的 API（DeepSeek/通义/OpenAI）用，字段全集
//    - json_object: 给只支持 json_object 的 API 用，不约束字段
// ========================================

const AIOutputJSONSchema = {

    // strict 模式 schema（字段全集，所有字段 required，无 additionalProperties）
    // OpenAI strict 模式硬性要求：properties 里所有字段必须在 required 数组里
    // P0 修复 R1/BUG-B：补齐 characters/bag/quests/relationships/locations/world/npcMessages/
    // memoryUpdates/currency/currencyName/contextSummary/hud，与 prompt 要求对齐
    // 否则 additionalProperties:false 会禁止 AI 输出这些字段，导致状态系统失效
    getStrictSchema() {
        return {
            type: 'object',
            properties: {
                story: {
                    type: 'string',
                    description: '叙事正文，用\\n换行，对话用「」包裹，第二人称"你"叙事。必须是JSON第一个字段'
                },
                title: {
                    type: 'string',
                    description: '本回合章节标题，4-8字简短'
                },
                choices: {
                    type: 'array',
                    description: '玩家可选的选项列表，恰好3个',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', description: '选项标识 A/B/C' },
                            text: { type: 'string', description: '选项文本，10-25字' }
                        },
                        required: ['id', 'text'],
                        additionalProperties: false
                    }
                },
                player: {
                    type: 'object',
                    description: '主角状态（玩家唯一操控角色）',
                    properties: {
                        name: { type: 'string', description: '主角姓名，必须严格等于主角姓名' },
                        identity: { type: 'string', description: '身份' },
                        stats: {
                            type: 'array',
                            description: '主角属性',
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
                },
                characters: {
                    type: 'array',
                    description: 'NPC列表（禁止包含主角）。已知角色即使本回合未出场也要保留',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: 'NPC名（不加括号备注）' },
                            title: { type: 'string', description: '头衔' },
                            relation: { type: 'string', description: '与主角关系' },
                            favorability: { type: 'number', description: '好感度 -100到100' },
                            desc: { type: 'string', description: '简述' }
                        },
                        required: ['name', 'title', 'relation', 'favorability', 'desc'],
                        additionalProperties: false
                    }
                },
                bag: {
                    type: 'array',
                    description: '主角背包物品',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            count: { type: 'number' },
                            desc: { type: 'string' },
                            rarity: { type: 'string', description: '普通/精良/珍稀/传说' },
                            usable: { type: 'boolean' },
                            effect: { type: 'string' },
                            equippable: { type: 'boolean' },
                            equipped: { type: 'boolean' },
                            slot: { type: 'string', description: 'weapon/armor/accessory/head' }
                        },
                        required: ['name', 'count', 'desc', 'rarity', 'usable', 'effect', 'equippable', 'equipped', 'slot'],
                        additionalProperties: false
                    }
                },
                quests: {
                    type: 'array',
                    description: '任务列表，每回合至少1个进行中任务',
                    items: {
                        type: 'object',
                        properties: {
                            title: { type: 'string' },
                            type: { type: 'string', description: '主线/支线/隐藏' },
                            status: { type: 'string', description: '进行中/已完成/失败' },
                            progress: { type: 'string', description: '当前/总数' },
                            hint: { type: 'string' }
                        },
                        required: ['title', 'type', 'status', 'progress', 'hint'],
                        additionalProperties: false
                    }
                },
                relationships: {
                    type: 'array',
                    description: '关系网，上限10条',
                    items: {
                        type: 'object',
                        properties: {
                            from: { type: 'string', description: '主角用"主角"二字' },
                            type: { type: 'string', description: '暧昧/恋人/敌对/仇恨/友好/盟友/师徒/上下级/亲人/家族/对手/中立 之一' },
                            to: { type: 'string' },
                            desc: { type: 'string' }
                        },
                        required: ['from', 'type', 'to', 'desc'],
                        additionalProperties: false
                    }
                },
                locations: {
                    type: 'array',
                    description: '本回合涉及的关键地点',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            desc: { type: 'string' }
                        },
                        required: ['name', 'desc'],
                        additionalProperties: false
                    }
                },
                world: {
                    type: 'array',
                    description: '世界模块，与剧情联动',
                    items: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', description: 'text/list/ranking/key_value/cards/comments/moments/mail/shop/diary/chat/forum' },
                            title: { type: 'string' },
                            content: { type: 'string' },
                            items: { type: 'array', items: {} }
                        },
                        required: ['type', 'title', 'content', 'items'],
                        additionalProperties: false
                    }
                },
                npcMessages: {
                    type: 'array',
                    description: 'NPC即时闲聊消息（正式通知用mail）',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            text: { type: 'string' },
                            emotion: { type: 'string' }
                        },
                        required: ['name', 'text', 'emotion'],
                        additionalProperties: false
                    }
                },
                memoryUpdates: {
                    type: 'array',
                    description: '永久记忆维护，无变更时返回空数组',
                    items: {
                        type: 'object',
                        properties: {
                            op: { type: 'string', description: 'add/replace/delete' },
                            category: { type: 'string', description: 'pcIdentity/settings/worldRules/npcProfiles/promises/worldPlaces' },
                            content: { type: 'string' },
                            reason: { type: 'string' }
                        },
                        required: ['op', 'category', 'content', 'reason'],
                        additionalProperties: false
                    }
                },
                currency: {
                    type: 'number',
                    description: '当前金钱数量，必须准确反映剧情变化'
                },
                currencyName: {
                    type: 'string',
                    description: '货币名称（修仙用灵石，现代用元，古代用银两等）'
                },
                contextSummary: {
                    type: 'string',
                    description: '本回合剧情摘要，100-200字'
                },
                gameTime: {
                    type: 'object',
                    description: '游戏内时间',
                    properties: {
                        date: { type: 'string', description: '日期，如"第3天"' },
                        time: { type: 'string', description: '时刻，如"卯时"' },
                        period: { type: 'string', description: '时段：morning/afternoon/evening/night' },
                        weather: { type: 'string', description: '晴/阴/雨/雪' },
                        era: { type: 'string', description: '时代/年号' }
                    },
                    required: ['date', 'time', 'period', 'weather', 'era'],
                    additionalProperties: false
                },
                keyEvents: {
                    type: 'array',
                    description: '本回合关键事件，0-3条，无重要事件时返回空数组',
                    items: { type: 'string' }
                },
                hud: {
                    type: 'object',
                    description: 'HUD显示数据，最多4个',
                    properties: {
                        items: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    label: { type: 'string' },
                                    value: { type: 'string' },
                                    icon: { type: 'string' }
                                },
                                required: ['label', 'value', 'icon'],
                                additionalProperties: false
                            }
                        }
                    },
                    required: ['items'],
                    additionalProperties: false
                }
            },
            required: ['story', 'title', 'choices', 'player', 'characters', 'bag', 'quests', 'relationships', 'locations', 'world', 'npcMessages', 'memoryUpdates', 'currency', 'currencyName', 'contextSummary', 'gameTime', 'keyEvents', 'hud'],
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
        // 【P1-3 修复】DeepSeek API 在 strict:true 时可能拒绝响应（400 错误），
        // 降级为 json_object 模式，避免 API 调用失败
        if (/deepseek/.test(m)) return false;
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
        // 【P0-json_object 修复】DeepSeek 模型在 response_format: json_object 时
        // 会输出 "我们{}" 等截断内容（仅输出 reasoning 的前几个 token），
        // 而非完整 JSON 故事。DeepSeek 本身已能通过系统提示词输出高质量 JSON，
        // 不需要 json_object 强制约束。关闭 json_object 让模型自由输出 JSON 即可。
        if (/deepseek/.test(m)) return false;
        return true;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = AIOutputJSONSchema;
