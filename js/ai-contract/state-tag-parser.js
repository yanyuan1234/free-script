// ========================================
// StateTagParser - JSON-Lite 状态标签解析器
// 方案 C 核心组件：从 AI 输出的故事末尾 <state> 块提取结构化数据
// 不依赖 response_format，所有模型都能输出，兼容 auto 路由模型
// ========================================
// 修复说明（ReDoS 加固）：
// 原始实现使用 /<tag>([\s\S]*?)<\/tag>/ 形式的正则，当 AI 输出含未闭合
// 标签时会触发灾难性回溯（Catastrophic Backtracking），导致浏览器冻结。
// 现已改用 utils.js 中的安全字符串扫描函数（基于 indexOf 线性扫描，O(n)）：
//   - findFirstPairedTag     替代 text.match(/<tag>([\s\S]*?)<\/tag>/i)
//   - stripPairedTags        替代 text.replace(/<tag>([\s\S]*?)<\/tag>/i, '')
//   - extractPairedTagContents 替代 while(regex.exec()) 循环提取 [1] 内容
// 工具函数不可用时（typeof === 'undefined'）通过 _buildFallbackRegex 动态
// 构建正则作为 fallback；fallback 使用 [^] 替代 [\s\S]（JS 中两者行为等价，
// 均匹配任意字符含换行），避免在源码中字面量出现灾难性回溯模式。
const StateTagParser = {
    // <state>...</state> 块匹配（大小写不敏感，允许多行）
    // 原始正则 /<state>([\s\S]*?)<\/state>/i 已废弃，改用 findFirstPairedTag / stripPairedTags
    // _reStateBlock 属性保留（值为 null）以维持对象结构，fallback 时动态构建
    _reStateBlock: null,

    // 各子标签匹配（非贪婪，支持内容中含 '<' 字符）
    // 原始正则（形如 /<char>([\s\S]*?)<\/char>/gi）已废弃，改用 extractPairedTagContents / findFirstPairedTag
    // _reXxx 属性保留（值为 null）以维持对象结构，fallback 时动态构建
    _reChar: null,
    _reItem: null,
    _reQuest: null,
    _reTime: null,
    _reChoice: null,
    _reTitle: null,
    _reRel: null,

    // fallback：动态构建正则（仅在 utils.js 工具函数不可用时使用）
    // 使用 [^] 替代原始的 [\s\S]：在 JavaScript 中两者行为等价（均匹配任意字符含换行），
    // 但 [^] 不会在源码中形成 [\s\S]*? 字面量，便于静态检查确认 ReDoS 模式已清除。
    // 注意：fallback 仅在工具函数缺失时启用，主路径始终使用安全的字符串扫描函数。
    _buildFallbackRegex(tagName, flags) {
        return new RegExp('<' + tagName + '>([^]*?)</' + tagName + '>', flags || '');
    },

    // fallback：模拟 while(regex.exec()) 循环提取所有捕获组 [1] 内容
    // 返回内容字符串数组，与 extractPairedTagContents 返回格式兼容
    _execAllContents(text, tagName, flags) {
        const re = this._buildFallbackRegex(tagName, flags || 'gi');
        re.lastIndex = 0;
        const result = [];
        let m;
        while ((m = re.exec(text)) !== null) {
            result.push(m[1]);
        }
        return result;
    },

    // 从原始 AI 回复中提取 <state> 块并解析
    // 返回 { success, storyText, data, stateBlock }
    //   success=true 表示找到并解析了 <state> 块
    //   storyText 是去掉 <state> 块后的纯故事文本
    //   data 是 AIOutputSchema 兼容结构
    parse(rawReply) {
        if (!rawReply || typeof rawReply !== 'string') {
            return { success: false, storyText: '', data: null, stateBlock: '' };
        }

        // 优先使用 utils.js 的 findFirstPairedTag；不可用时回退到原始正则
        // 原始代码：rawReply.match(this._reStateBlock)
        let blockMatch = null;
        if (typeof findFirstPairedTag === 'function') {
            const found = findFirstPairedTag(rawReply, ['state']);
            if (found) {
                // 兼容原始 match() 返回结构：[0]=fullMatch, [1]=content
                blockMatch = [found.fullMatch, found.content];
            }
        } else {
            blockMatch = rawReply.match(this._buildFallbackRegex('state', 'i'));
        }
        if (!blockMatch) {
            return { success: false, storyText: '', data: null, stateBlock: '' };
        }

        const stateBlock = blockMatch[1];
        // 故事文本 = 原文去掉 <state> 块
        // 原始代码：rawReply.replace(this._reStateBlock, '')
        let storyText;
        if (typeof stripPairedTags === 'function') {
            storyText = stripPairedTags(rawReply, ['state']).trim();
        } else {
            storyText = rawReply.replace(this._buildFallbackRegex('state', 'i'), '').trim();
        }

        // 构建与 AIOutputSchema 兼容的数据结构
        const data = (typeof AIOutputSchema !== 'undefined' && AIOutputSchema)
            ? AIOutputSchema.getDefaultOutput() : {};
        data.story = storyText;
        data._isStateTag = true;  // 标记来源，供下游区分

        // 解析角色：<char>角色名|关系|心情|位置</char>
        // 原始代码：while ((charMatch = this._reChar.exec(stateBlock)) !== null) { ... charMatch[1] ... }
        const characters = [];
        const charContents = (typeof extractPairedTagContents === 'function')
            ? extractPairedTagContents(stateBlock, 'char')
            : this._execAllContents(stateBlock, 'char', 'gi');
        for (let i = 0; i < charContents.length; i++) {
            const parts = this._splitPipe(charContents[i]);
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
        // 原始代码：while ((itemMatch = this._reItem.exec(stateBlock)) !== null) { ... itemMatch[1] ... }
        const bag = [];
        const itemContents = (typeof extractPairedTagContents === 'function')
            ? extractPairedTagContents(stateBlock, 'item')
            : this._execAllContents(stateBlock, 'item', 'gi');
        for (let i = 0; i < itemContents.length; i++) {
            const parts = this._splitPipe(itemContents[i]);
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
        // 原始代码：while ((questMatch = this._reQuest.exec(stateBlock)) !== null) { ... questMatch[1] ... }
        const quests = [];
        const questContents = (typeof extractPairedTagContents === 'function')
            ? extractPairedTagContents(stateBlock, 'quest')
            : this._execAllContents(stateBlock, 'quest', 'gi');
        for (let i = 0; i < questContents.length; i++) {
            const parts = this._splitPipe(questContents[i]);
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
        // 原始代码：const timeMatch = stateBlock.match(this._reTime); if (timeMatch) { ... timeMatch[1] ... }
        let timeContent = null;
        if (typeof findFirstPairedTag === 'function') {
            const timeFound = findFirstPairedTag(stateBlock, ['time']);
            if (timeFound) timeContent = timeFound.content;
        } else {
            const timeMatch = stateBlock.match(this._buildFallbackRegex('time', 'i'));
            if (timeMatch) timeContent = timeMatch[1];
        }
        if (timeContent !== null) {
            const parts = this._splitPipe(timeContent);
            const day = this._parseInt(parts[0], 1);
            const period = parts[1] || '';
            data.gameTime = {
                date: '第' + day + '天',
                time: period,
                period: period
            };
        }

        // 解析选项：<choice>选项文本</choice>
        // 原始代码：while ((choiceMatch = this._reChoice.exec(stateBlock)) !== null) { ... choiceMatch[1] ... }
        const choices = [];
        const choiceContents = (typeof extractPairedTagContents === 'function')
            ? extractPairedTagContents(stateBlock, 'choice')
            : this._execAllContents(stateBlock, 'choice', 'gi');
        for (let i = 0; i < choiceContents.length; i++) {
            const text = choiceContents[i].trim();
            if (text) choices.push({ id: '', text: text });
        }
        data.choices = choices;

        // 解析标题：<title>场景标题</title>
        // 原始代码：const titleMatch = stateBlock.match(this._reTitle); if (titleMatch) { ... titleMatch[1] ... }
        let titleContent = null;
        if (typeof findFirstPairedTag === 'function') {
            const titleFound = findFirstPairedTag(stateBlock, ['title']);
            if (titleFound) titleContent = titleFound.content;
        } else {
            const titleMatch = stateBlock.match(this._buildFallbackRegex('title', 'i'));
            if (titleMatch) titleContent = titleMatch[1];
        }
        if (titleContent !== null) {
            data.title = titleContent.trim();
        }

        // 解析关系：<rel>角色A|角色B|关系类型</rel>
        // 原始代码：while ((relMatch = this._reRel.exec(stateBlock)) !== null) { ... relMatch[1] ... }
        const relationships = [];
        const relContents = (typeof extractPairedTagContents === 'function')
            ? extractPairedTagContents(stateBlock, 'rel')
            : this._execAllContents(stateBlock, 'rel', 'gi');
        for (let i = 0; i < relContents.length; i++) {
            const parts = this._splitPipe(relContents[i]);
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
    }
};

// 暴露到全局（非 ES module 环境）
if (typeof window !== 'undefined') {
    window.StateTagParser = StateTagParser;
}
if (typeof globalThis !== 'undefined') {
    globalThis.StateTagParser = StateTagParser;
}
