// ========================================
// StateTagParser - JSON-Lite 状态标签解析器
// 方案 C 核心组件：从 AI 输出的故事末尾 <state> 块提取结构化数据
// 不依赖 response_format，所有模型都能输出，兼容 auto 路由模型
// ========================================
const StateTagParser = {
    // <state>...</state> 块匹配（大小写不敏感，允许多行）
    _reStateBlock: /<state>([\s\S]*?)<\/state>/i,

    // 各子标签匹配（非贪婪，支持内容中含 '<' 字符）
    _reChar: /<char>([\s\S]*?)<\/char>/gi,
    _reItem: /<item>([\s\S]*?)<\/item>/gi,
    _reQuest: /<quest>([\s\S]*?)<\/quest>/gi,
    _reTime: /<time>([\s\S]*?)<\/time>/i,
    _reChoice: /<choice>([\s\S]*?)<\/choice>/gi,
    _reTitle: /<title>([\s\S]*?)<\/title>/i,
    _reRel: /<rel>([\s\S]*?)<\/rel>/gi,

    // 从原始 AI 回复中提取 <state> 块并解析
    // 返回 { success, storyText, data, stateBlock }
    //   success=true 表示找到并解析了 <state> 块
    //   storyText 是去掉 <state> 块后的纯故事文本
    //   data 是 AIOutputSchema 兼容结构
    parse(rawReply) {
        if (!rawReply || typeof rawReply !== 'string') {
            return { success: false, storyText: '', data: null, stateBlock: '' };
        }

        const blockMatch = rawReply.match(this._reStateBlock);
        if (!blockMatch) {
            return { success: false, storyText: '', data: null, stateBlock: '' };
        }

        const stateBlock = blockMatch[1];
        // 故事文本 = 原文去掉 <state> 块
        const storyText = rawReply.replace(this._reStateBlock, '').trim();

        // 构建与 AIOutputSchema 兼容的数据结构
        const data = (typeof AIOutputSchema !== 'undefined' && AIOutputSchema)
            ? AIOutputSchema.getDefaultOutput() : {};
        data.story = storyText;
        data._isStateTag = true;  // 标记来源，供下游区分

        // 解析角色：<char>角色名|关系|心情|位置</char>
        const characters = [];
        let charMatch;
        this._reChar.lastIndex = 0;
        while ((charMatch = this._reChar.exec(stateBlock)) !== null) {
            const parts = this._splitPipe(charMatch[1]);
            if (parts.length > 0 && parts[0]) {
                characters.push({
                    name: parts[0] || '',
                    title: parts[1] || '',        // title 字段复用为"关系/称谓"
                    relation: parts[1] || '',
                    mood: parts[2] || '',
                    location: parts[3] || ''
                });
            }
        }
        data.characters = characters;

        // 解析物品：<item>物品名|数量|单位|稀有度|描述</item>
        const bag = [];
        this._reItem.lastIndex = 0;
        let itemMatch;
        while ((itemMatch = this._reItem.exec(stateBlock)) !== null) {
            const parts = this._splitPipe(itemMatch[1]);
            if (parts.length > 0 && parts[0]) {
                bag.push({
                    name: parts[0] || '',
                    qty: this._parseInt(parts[1], 1),
                    unit: parts[2] || '个',
                    rarity: parts[3] || '普通',
                    desc: parts[4] || ''
                });
            }
        }
        data.bag = bag;

        // 解析任务：<quest>任务名|状态</quest>
        const quests = [];
        this._reQuest.lastIndex = 0;
        let questMatch;
        while ((questMatch = this._reQuest.exec(stateBlock)) !== null) {
            const parts = this._splitPipe(questMatch[1]);
            if (parts.length > 0 && parts[0]) {
                quests.push({
                    title: parts[0] || '',
                    status: parts[1] || 'active',
                    type: 'quest'
                });
            }
        }
        data.quests = quests;

        // 解析时间：<time>天数|时段</time>
        const timeMatch = stateBlock.match(this._reTime);
        if (timeMatch) {
            const parts = this._splitPipe(timeMatch[1]);
            const day = this._parseInt(parts[0], 1);
            const period = parts[1] || '';
            data.gameTime = {
                date: '第' + day + '天',
                time: period,
                period: period
            };
        }

        // 解析选项：<choice>选项文本</choice>
        const choices = [];
        this._reChoice.lastIndex = 0;
        let choiceMatch;
        while ((choiceMatch = this._reChoice.exec(stateBlock)) !== null) {
            const text = choiceMatch[1].trim();
            if (text) choices.push({ id: '', text: text });
        }
        data.choices = choices;

        // 解析标题：<title>场景标题</title>
        const titleMatch = stateBlock.match(this._reTitle);
        if (titleMatch) {
            data.title = titleMatch[1].trim();
        }

        // 解析关系：<rel>角色A|角色B|关系类型</rel>
        const relationships = [];
        this._reRel.lastIndex = 0;
        let relMatch;
        while ((relMatch = this._reRel.exec(stateBlock)) !== null) {
            const parts = this._splitPipe(relMatch[1]);
            if (parts.length >= 3) {
                relationships.push({
                    from: parts[0],
                    to: parts[1],
                    type: parts[2]
                });
            }
        }
        data.relationships = relationships;

        return {
            success: true,
            storyText: storyText,
            data: data,
            stateBlock: stateBlock
        };
    },

    // 安全的管道分隔（容忍首尾空白）
    _splitPipe(s) {
        if (!s) return [];
        return String(s).split('|').map(function(p) { return p.trim(); });
    },

    // 安全的整数解析
    _parseInt(s, def) {
        var n = parseInt(s, 10);
        return isNaN(n) ? def : n;
    },

    // 检测 AI 回复是否包含 <state> 块（快速判断，不解析）
    hasStateBlock(rawReply) {
        if (!rawReply || typeof rawReply !== 'string') return false;
        return this._reStateBlock.test(rawReply);
    }
};

// 暴露到全局（非 ES module 环境）
if (typeof window !== 'undefined') {
    window.StateTagParser = StateTagParser;
}
if (typeof globalThis !== 'undefined') {
    globalThis.StateTagParser = StateTagParser;
}
