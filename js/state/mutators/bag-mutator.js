// ========================================
// 物品变更器 - BagMutator
// ========================================
const BagMutator = {
    // 设置整个物品列表（标准化后）
    setItems(items, options) {

        const arr = Array.isArray(items) ? items : (items ? [items] : []);
        const normalized = arr.map(this.normalizeItem.bind(this)).filter(Boolean);
        // 【数据断层修复】只写新路径，StateManager._syncLegacyMirror 自动同步到 currentBag
        return StateManager.set('entities.bag', normalized, options);
    },

    // 合并物品：保留已有，更新/插入新物品（同 renderBag 语义）

    // 现在精确匹配失败时再用归一化名称（去"的"、空格、标点）做模糊匹配，避免命名差异导致重复
    mergeItems(items, options) {

        const inputItems = Array.isArray(items) ? items : (items ? [items] : []);
        const rawBag = StateManager.get('entities.bag');
        const bag = Array.isArray(rawBag) ? rawBag : [];
        const existingMap = {};
        // 归一化名称 → 物品 key 的映射（用于模糊匹配）
        const fuzzyMap = {};
        bag.forEach(function(it, idx) {
            const key = (it && (it.name || it.title || it.id)) || ('__idx_' + idx);
            existingMap[key] = it;
            if (it && (it.name || it.title)) {
                var norm = BagMutator._normalizeItemName(it.name || it.title);
                if (norm) fuzzyMap[norm] = key;
            }
        });
        inputItems.forEach(function(it) {
            if (!it) return;
            const key = it.name || it.title || it.id;
            if (!key) return;
            // [T1-P1-28] 合并白名单扩展到 11 字段（与 normalizeItem 输出一致）
            // 旧 6 字段（count/desc/rarity/rarityClass/equipped/usable）漏 unit/effect/equippable/slot/history
            // AI 返回 effect:"回血 30" 旧实现不更新 → 永久丢失
            const _mergeFields = function(target, source) {
                if (source.count !== undefined) target.count = source.count;
                if (source.desc !== undefined) target.desc = source.desc;
                if (source.rarity !== undefined) target.rarity = source.rarity;
                if (source.rarityClass !== undefined) target.rarityClass = source.rarityClass;
                if (source.equipped !== undefined) target.equipped = source.equipped;
                if (source.usable !== undefined) target.usable = source.usable;
                if (source.unit !== undefined) target.unit = source.unit;
                if (source.effect !== undefined) target.effect = source.effect;
                if (source.equippable !== undefined) target.equippable = source.equippable;
                if (source.slot !== undefined) target.slot = source.slot;
                if (Array.isArray(source.history)) target.history = source.history.slice();
                };
            if (existingMap[key]) {
                // 精确匹配命中
                _mergeFields(existingMap[key], it);
            } else {
                // 精确匹配失败 → 模糊匹配
                var normKey = BagMutator._normalizeItemName(key);
                var fuzzyMatchKey = normKey && fuzzyMap[normKey];
                if (fuzzyMatchKey && existingMap[fuzzyMatchKey]) {
                    // 模糊匹配命中：合并到现有物品
                    _mergeFields(existingMap[fuzzyMatchKey], it);
                } else {
                    // 全新物品
                    bag.push(it);
                    existingMap[key] = it;
                    if (normKey) fuzzyMap[normKey] = key;
                }
            }
        });
        return this.setItems(bag, options);
    },


    // 例："磨边的羊毛袜" 与 "磨边羊毛袜" → "磨边羊毛袜"
    _normalizeItemName(name) {
        if (!name) return '';
        return String(name)
            .replace(/的/g, '')           // 去掉"的"修饰词
            .replace(/[\s·,，、。.]+/g, '') // 去空格和常见标点
            .replace(/[（(].*?[)）]/g, '')  // 去括号注释
            .trim()
            .toLowerCase();
    },

    // 从剧情文本中提取玩家获得的物品（高优先级优化：剧情提到的道具自动入包）
    // 支持格式：
    //   "三枚下品灵石"、"半瓶聚气丹"、"一把铁剑"、"获得玄铁剑"、"你得到了地图"
    // 返回标准化后的物品数组，可直接传给 mergeItems
    extractItemsFromStory(storyText, options) {
        options = options || {};
        if (!storyText || typeof storyText !== 'string') return [];
        const text = String(storyText);
        const units = '个块瓶把柄枚张本件颗粒壶包袋卷支只双串幅封盏锭株根剂';
        // 中文数字 → 阿拉伯数字
        const cnNums = {
            '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5,
            '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '半': 0.5, '几': 2
        };
        const results = [];
        const seen = {};

        // 模式 A：【数量 + 单位 + 物品名】，如 "三块下品灵石"
        const unitPattern = new RegExp('([零一二两三四五六七八九十半几\\d]+)\\s*?(?:' + units.split('').join('|') + ')\\s*?([\\u4e00-\\u9fa5]{2,12})', 'g');
        let m;
        while ((m = unitPattern.exec(text)) !== null) {
            const rawQty = m[1];
            const itemName = m[2].trim();
            let qty = parseFloat(rawQty);
            if (isNaN(qty)) {
                qty = 0;
                for (let i = 0; i < rawQty.length; i++) {
                    const v = cnNums[rawQty.charAt(i)];
                    if (v !== undefined) qty = Math.max(qty, v);
                }
            }
            if (qty <= 0) qty = 1;
            // 过滤明显不是物品的通用词
            if (this._isInvalidItemName(itemName)) continue;
            const normKey = this._normalizeItemName(itemName);
            if (!normKey || seen[normKey]) continue;
            seen[normKey] = true;
            results.push(this.normalizeItem({ name: itemName, count: qty }));
        }

        // 模式 B：【动词 + 了/到 + 物品名】，如 "得到了玄铁剑"、"获得清心符"
        const actionPattern = /(?:获得|得到|拿到|拾到|捡到|收到|领到|找到|购买|买入|换取|赢得|奖励|赠送|给予|交给|掏出|取出)(?:了|到|的|[一二两三四五六七八九十半几\d]*|[\s]*)([\u4e00-\u9fa5]{2,10})/g;
        while ((m = actionPattern.exec(text)) !== null) {
            const itemName = m[1].trim();
            if (this._isInvalidItemName(itemName)) continue;
            const normKey = this._normalizeItemName(itemName);
            if (!normKey || seen[normKey]) continue;
            seen[normKey] = true;
            results.push(this.normalizeItem({ name: itemName, count: 1 }));
        }

        // 模式 C：背包中已存在物品的增量描述，如 "灵石 +3"
        const plusPattern = /([\u4e00-\u9fa5]{2,10})\s*\+\s*(\d+)/g;
        while ((m = plusPattern.exec(text)) !== null) {
            const itemName = m[1].trim();
            const qty = parseInt(m[2], 10) || 1;
            if (this._isInvalidItemName(itemName)) continue;
            const normKey = this._normalizeItemName(itemName);
            if (!normKey || seen[normKey]) continue;
            seen[normKey] = true;
            results.push(this.normalizeItem({ name: itemName, count: qty }));
        }

        return results.filter(Boolean);
    },

    // 排除明显不是物品的常见词
    _isInvalidItemName(name) {
        const invalid = /^(感觉|想法|消息|消息|机会|线索|情报|任务|目标|方向|道路|方法|方式|能力|力量|灵气|灵力|法力|内力|元气|气息|呼吸|眼神|目光|表情|态度|决定|选择|疑惑|疑问|答案|结果|结局|命运|运气|机缘|机遇|危险|安全|痛苦|快乐|喜悦|愤怒|悲伤|恐惧|希望|绝望|信心|决心|勇气|智慧|知识|经验|记忆|梦境|现实|世界|时间|空间|地方|位置|境界|层次|修为|功力|功法|法术|神通|秘术|招式|剑法|刀法|拳法|掌法|身法|步法|心法|口诀|咒语|符咒|阵法|禁制|封印|结界|护盾|防御|攻击|伤害|治疗|恢复|生命|体力|精神|意志|灵魂|神识|元神|金丹|元婴|化神|合体|大乘|渡劫|飞升|仙界|魔界|妖界|人界|修真界|凡间|世俗|江湖|武林|门派|宗门|家族|世家|皇朝|帝国|王朝|国家|城池|村镇|山谷|洞府|秘境|遗迹|禁地|宝地|福地|洞天|仙府|洞窟|洞穴|森林|草原|沙漠|海洋|河流|湖泊|山脉|山峰|峡谷|悬崖|瀑布|温泉|药园|灵田|矿脉|石室|大殿|楼阁|亭台|桥梁|道路|街道|广场|市场|店铺|酒楼|客栈|茶馆|商行|钱庄|当铺|铁匠铺|药铺|书铺|裁缝铺|杂货铺|武器店|防具店|饰品店|拍卖行|交易所|宗门大殿|议事厅|藏经阁|炼丹房|炼器室|制符室|灵兽园|灵药园|演武场|闭关室|静室|客房|厢房|密室|宝库|藏宝阁|藏剑阁|御剑台|观星台|传送阵|山门|护山大阵|禁制核心|灵泉|灵眼|灵脉|龙脉|地脉|天脉|星脉|月华|日精|灵气|灵雾|霞光|天光|云海|雷云|风暴|火焰|寒冰|雷电|毒瘴|迷雾|幻境|梦境|心魔|外魔|天魔|妖兽|魔兽|灵兽|神兽|凶兽|异兽|鬼怪|僵尸|骷髅|傀儡|分身|化身|法身|真身|本体|肉身|躯壳|元婴|金丹|内丹|妖丹|魔核|晶核|灵核|魂晶|精血|魂魄|残魂|真灵|神魂|分神|神念|念头|意识|意志|执念|怨念|煞气|杀气|血气|生气|死气|阴气|阳气|魔气|妖气|仙气|神气|龙气|皇气|贵气|财气|福气|霉气|晦气|劫气|因果|业力|功德|气运|运势|命数|天数|天道|大道|法则|规则|秩序|混沌|虚无|虚空|空间|时间|光阴|岁月|年华|青春|衰老|死亡|轮回|转世|重生|复活|涅槃|升华|蜕变|进化|退化|变异|觉醒|觉醒|顿悟|悟道|突破|进阶|升级|降级|跌落|走火入魔|内伤|外伤|中毒|诅咒|祝福|加持|庇佑|护佑|镇压|封印|禁锢|束缚|控制|魅惑|迷惑|催眠|幻术|隐身|遁术|飞行|御剑|腾云|驾雾|瞬移|传送|穿梭|降临|飞升|下凡|转世|轮回|因果|缘分|姻缘|情缘|情劫|心劫|魔障|业障|瓶颈|桎梏|枷锁|牢笼|樊笼|困境|绝境|险境|妙境|佳境|胜境|化境|仙境|魔境|妖境|鬼境|冥境|幽境|秘境|洞天|福地|圣地|净土|乐土|故土|故乡|家乡|家园|巢穴|老巢|窝点|根据地|大本营|老窝|住处|居所|住所|住宅|宅院|院落|庭院|花园|菜园|田地|农田|耕地|牧场|林场|渔场|猎场|矿场|工场|作坊|工坊|店铺|摊位|货摊|柜台|货架|仓库|库房|储物间|地下室|地道|暗道|密道|捷径|小路|大道|官道|山路|水路|陆路|航路|航线|海路|空路|航道|路线|轨迹|痕迹|脚印|车辙|马蹄印|爪印|气味|气息|味道|香味|臭味|腥味|血腥味|药香味|花香|草香|木香|檀香|沉香|龙涎香|麝香|酒香|茶香|肉香|饭香|菜香|油香|书香|墨香|纸香|布香|皮香|毛香|铁锈味|铜臭味|土腥味|霉味|腐味|焦味|烟味|火药味|硫磺味|硝石味|血腥味|杀气|煞气|阴气|死气|尸气|鬼气|妖气|魔气|仙气|灵气)$/.test(name);
        if (invalid) return true;
        if (name.length < 2 || name.length > 10) return true;
        return false;
    },

    // 添加单个物品
    addItem(item, options) {
        const normalized = this.normalizeItem(item);
        if (!normalized) return false;
        const rawBag = StateManager.get('entities.bag');
        const bag = Array.isArray(rawBag) ? rawBag : [];
        const existing = bag.find((it) => it && it.name === normalized.name);
        if (existing) {
            existing.count = (existing.count || 1) + (normalized.count || 1);
        } else {
            bag.push(normalized);
        }
        return this.setItems(bag, options);
    },

    // 标准化物品格式

    // - count 为身份字段（旧 qty 已在 sync 层映射为 count，此处兼容读取但不输出）
    // - 保留 GameMemory 运行时字段（obtainedTurn/lastChangedTurn/history），避免 mutator 回写时丢失
    normalizeItem(raw) {
        if (!raw) return null;
        let name = '';
        if (typeof raw === 'string') {
            name = raw.trim();
        } else {
            name = String(raw.name || raw.title || raw.item || '').trim();
        }
        // 过滤无效值
        if (!name || name === '无' || name.toLowerCase() === 'undefined' ||
            name.toLowerCase() === 'null' || name === '未知') {
            return null;
        }
        let count = 1;

        const rawCount = raw.count !== undefined ? raw.count : raw.qty;
        if (rawCount !== undefined) {
            const parsed = parseInt(rawCount, 10);
            if (!isNaN(parsed) && parsed > 0) count = parsed;
        }
        const unit = raw.unit || '个';
        return {
            id: raw.id || ('item_' + name + '_' + Date.now()),
            name: name,
            count: count,
            unit: unit,
            rarity: raw.rarity || '普通',
            desc: raw.desc || raw.description || '',
            usable: !!raw.usable,
            effect: raw.effect || '',
            equippable: !!raw.equippable,
            equipped: !!raw.equipped,
            slot: raw.slot || '',

            obtainedTurn: raw.obtainedTurn || 0,
            lastChangedTurn: raw.lastChangedTurn || 0,
            history: Array.isArray(raw.history) ? raw.history : []
        };
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = BagMutator;
