/* ====== 深宫帝王录 - 数据配置 ====== */

// 时辰表
const SHICHEN = [
    { name: '子时', range: '23:00-01:00' },
    { name: '丑时', range: '01:00-03:00' },
    { name: '寅时', range: '03:00-05:00' },
    { name: '卯时', range: '05:00-07:00' },
    { name: '辰时', range: '07:00-09:00' },
    { name: '巳时', range: '09:00-11:00' },
    { name: '午时', range: '11:00-13:00' },
    { name: '未时', range: '13:00-15:00' },
    { name: '申时', range: '15:00-17:00' },
    { name: '酉时', range: '17:00-19:00' },
    { name: '戌时', range: '19:00-21:00' },
    { name: '亥时', range: '21:00-23:00' }
];

// 月份
const MONTHS = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];

// 妃嫔品阶（从高到低）
const RANKS = [
    { id: 'empress',   name: '皇后', level: 9, favor: 80, power: 70 },
    { id: 'consort',   name: '贵妃', level: 8, favor: 60, power: 50 },
    { id: 'concubine', name: '妃',   level: 7, favor: 45, power: 35 },
    { id: 'noble',     name: '嫔',   level: 6, favor: 30, power: 20 },
    { id: 'beauty',    name: '贵人', level: 5, favor: 20, power: 10 },
    { id: 'commoner',  name: '常在', level: 4, favor: 10, power: 5 },
    { id: 'promise',   name: '答应', level: 3, favor: 5,  power: 2 },
    { id: 'cold',      name: '冷宫', level: 0, favor: 0,  power: 0 }
];

// 母亲性格
const MOTHER_PERSONALITIES = {
    schemer: {
        name: '宫斗高手',
        desc: '深谙后宫之道，善于谋划布局',
        effects: { favorGain: 1.3, dangerReduce: 0.7, childProtect: 0.8 },
        lines: {
            greeting: '我儿，今日宫中可有什么风声？',
            advice: '切莫轻信他人，这宫里没有无缘无故的好意。',
            danger: '此事有蹊跷，你且按我说的做。',
            protect: '谁敢动我的孩子，我让他生不如死。'
        }
    },
    naive: {
        name: '天真烂漫',
        desc: '心思单纯，不懂宫斗险恶',
        effects: { favorGain: 0.8, dangerReduce: 1.3, childProtect: 0.5 },
        lines: {
            greeting: '我儿来啦！今日想吃什么？母妃给你做。',
            advice: '做人嘛，以诚待人便好。',
            danger: '不会吧……他们看起来不像坏人呀。',
            protect: '求求你们，别伤害我的孩子……'
        }
    },
    buddhist: {
        name: '佛系咸鱼',
        desc: '与世无争，随遇而安',
        effects: { favorGain: 0.9, dangerReduce: 1.0, childProtect: 0.6 },
        lines: {
            greeting: '哦，你来了啊。',
            advice: '随缘吧，命里有时终须有。',
            danger: '唉，又是这些事……躲也躲不掉。',
            protect: '算了算了，别争了。'
        }
    },
    fierce: {
        name: '人不犯我我不犯人',
        desc: '平时温和，一旦被触犯绝不退让',
        effects: { favorGain: 1.0, dangerReduce: 0.8, childProtect: 0.9 },
        lines: {
            greeting: '我儿，可有人欺负你？',
            advice: '人不犯我我不犯人，人若犯我……',
            danger: '谁敢？我跟他拼命！',
            protect: '动我孩子？我让她知道什么叫后果。'
        }
    }
};

// 姓氏池
const SURNAMES = ['李','王','张','刘','陈','杨','赵','黄','周','吴','徐','孙','胡','朱','高','林','何','郭','马','罗','梁','宋','郑','谢','韩','唐','冯','于','董','萧','程','曹','袁','邓','许','傅','沈','曾','彭','吕','苏','卢','蒋','蔡','贾','丁','魏','薛','叶','阎','余','潘','杜','戴','夏','钟','汪','田','任','姜','范','方','石','姚','谭','廖','邹','熊','金','陆','郝','孔','白','崔','康','毛','邱','秦','江','史','顾','侯','邵','孟','龙','万','段','雷','钱','汤','尹','黎','易','常','武','乔','贺','赖','龚','文'];

// 名字池（男/女）
const MALE_NAMES = ['承乾','承恩','承泽','承瑞','承安','承和','承明','承志','承业','承福','弘文','弘武','弘道','弘德','弘义','弘信','弘达','弘远','弘毅','弘亮','子轩','子墨','子谦','子恒','子安','子宁','子睿','子瑜','子昂','子清','景行','景明','景瑞','景和','景泰','景福','景年','景云','景曜','景辉','天佑','天赐','天佑','天瑞','天和','天朗','天翔','天霖','天承','天泽'];
const FEMALE_NAMES = ['若兰','若雪','若烟','若云','若曦','若琳','若瑶','若萱','若琳','若霜','婉清','婉仪','婉容','婉宁','婉柔','婉慧','婉静','婉秀','婉贞','婉芳','思琪','思瑶','思颖','思涵','思雨','思语','思宁','思安','思悦','思怡','梦瑶','梦蝶','梦琳','梦涵','梦颖','梦霜','梦烟','梦月','梦雪','梦琪','清荷','清韵','清雅','清宁','清婉','清漪','清霜','清影','清音','清照'];

// 地点
const LOCATIONS = {
    palace:    { name: '寝宫',     desc: '你的居所', icon: '🏠' },
    study:     { name: '御书房',   desc: '读书习字', icon: '📚' },
    garden:    { name: '御花园',   desc: '赏花散步', icon: '🌸' },
    kitchen:   { name: '御膳房',   desc: '品鉴美食', icon: '🍜' },
    court:     { name: '朝堂',     desc: '旁听朝政', icon: '⚖️' },
    mother:    { name: '母妃宫中', desc: '探望母妃', icon: '👩' },
    market:    { name: '市集',     desc: '出宫游玩', icon: '🏪' },
    temple:    { name: '寺庙',     desc: '祈福还愿', icon: '⛩️' },
    training:  { name: '演武场',   desc: '习武强身', icon: '⚔️' },
    music:     { name: '清音坊',   desc: '听曲学琴', icon: '🎵' }
};

// 技能
const SKILLS = {
    literature: { name: '文学', desc: '诗词歌赋', maxLevel: 10 },
    strategy:   { name: '谋略', desc: '运筹帷幄', maxLevel: 10 },
    martial:    { name: '武艺', desc: '强身健体', maxLevel: 10 },
    music:      { name: '琴艺', desc: '音律之道', maxLevel: 10 },
    medicine:   { name: '医术', desc: '悬壶济世', maxLevel: 10 },
    charm:      { name: '魅力', desc: '仪态风度', maxLevel: 10 },
    management: { name: '经营', desc: '理财之道', maxLevel: 10 },
    equestrian: { name: '马术', desc: '策马奔腾', maxLevel: 10 }
};

// 国家制度
const NATION_TYPES = {
    matriarchy: { name: '女尊国', desc: '女性为尊，男性受限', difficulty: 'hard' },
    patriarchy: { name: '男尊国', desc: '男性为尊，女性受限', difficulty: 'normal' },
    equality:   { name: '平等国', desc: '男女平等', difficulty: 'easy' }
};

// ====== 事件系统 ======

// 事件类型
const EVENT_TYPES = {
    DAILY: 'daily',         // 日常事件
    PLOT: 'plot',           // 剧情事件
    CHOICE: 'choice',       // 选择事件
    CRISIS: 'crisis',       // 危机事件
    ROMANCE: 'romance',     // 情感事件
    POLITICAL: 'political', // 朝政事件
    MOTHER: 'mother',       // 母妃事件
    HIDDEN: 'hidden'        // 隐藏事件
};

// 事件池
const EVENT_POOL = [
    // === 日常事件 ===
    {
        id: 'daily_meal_bad',
        type: EVENT_TYPES.DAILY,
        name: '难以下咽',
        text: '今日呈上来的饭菜格外难吃，似是御膳房敷衍了事。',
        conditions: { minAge: 6 },
        weight: 15,
        choices: [
            {
                text: '去御膳房大发雷霆',
                effects: { favor: 2, prestige: 1, control: 1 },
                result: '你怒气冲冲地去了御膳房，厨子吓得跪地求饶。此后几日饭菜精致了许多。',
                followUp: 'daily_meal_good'
            },
            {
                text: '不去理会',
                effects: { favor: -1 },
                result: '你默默咽下难吃的饭菜。贴身太监面露难色，却不敢多言。',
                conditionCheck: { servantSmart: false },
                resultAlt: '你不去理会，下一顿饭菜依旧难吃。看来是有人故意为之。',
                followUp: 'daily_meal_worse'
            }
        ]
    },
    {
        id: 'daily_garden_walk',
        type: EVENT_TYPES.DAILY,
        name: '御花园漫步',
        text: '天气晴好，你在御花园中散步，花香扑鼻。',
        conditions: { minAge: 5 },
        weight: 20,
        choices: [
            {
                text: '继续散步',
                effects: { charm: 1 },
                result: '你在花丛中漫步，偶遇几位宫女，她们偷偷打量着你。'
            },
            {
                text: '回寝宫读书',
                effects: { literature: 1 },
                result: '你回到寝宫，翻开一卷古籍，沉浸其中。'
            }
        ]
    },
    {
        id: 'daily_study',
        type: EVENT_TYPES.DAILY,
        name: '太傅授课',
        text: '太傅今日授课，讲的是《资治通鉴》中的权谋之术。',
        conditions: { minAge: 6 },
        weight: 18,
        choices: [
            {
                text: '认真听讲',
                effects: { literature: 2, strategy: 1 },
                result: '你专心致志，太傅频频点头，课后还额外指点了你几句。'
            },
            {
                text: '心不在焉',
                effects: { literature: -1 },
                result: '你走神被太傅发现，罚抄了十遍。'
            }
        ]
    },
    {
        id: 'daily_servant_gossip',
        type: EVENT_TYPES.DAILY,
        name: '宫女闲话',
        text: '贴身宫女悄悄告诉你，近日宫中有些风言风语……',
        conditions: { minAge: 8 },
        weight: 12,
        choices: [
            {
                text: '仔细询问',
                effects: { strategy: 1 },
                result: '你从宫女口中得知了一些有用的消息，心中暗暗记下。'
            },
            {
                text: '不感兴趣',
                effects: {},
                result: '你摆摆手，宫女识趣地退下了。'
            }
        ]
    },

    // === 母妃事件 ===
    {
        id: 'mother_visit',
        type: EVENT_TYPES.MOTHER,
        name: '母妃召见',
        text: '母妃差人来传话，让你去她宫中一趟。',
        conditions: { minAge: 5 },
        weight: 16,
        choices: [
            {
                text: '立刻前往',
                effects: { favor: 2 },
                result: '你赶到母妃宫中，{motherLine:greeting}',
                isMotherEvent: true
            },
            {
                text: '稍后再去',
                effects: { favor: -1 },
                result: '你推说有事，稍后才去。母妃面上不显，眼中却闪过一丝失落。'
            }
        ]
    },
    {
        id: 'mother_trouble',
        type: EVENT_TYPES.MOTHER,
        name: '母妃受辱',
        text: '听闻母妃今日在花园中被某位高位妃嫔当众羞辱，身边宫女被打了一巴掌。',
        conditions: { minAge: 8, motherRankMax: 'noble' },
        weight: 10,
        choices: [
            {
                text: '去找那位妃嫔理论',
                effects: { favor: 3, prestige: 2, charm: 1 },
                result: '你怒气冲冲地找上门去，那位妃嫔见你虽年幼却气势不凡，讪讪地赔了不是。{motherLine:protect}',
                isMotherEvent: true
            },
            {
                text: '暗中记下，伺机报复',
                effects: { strategy: 2, favor: 1 },
                result: '你强忍怒意，将此事记在心中。{motherLine:advice}',
                isMotherEvent: true
            },
            {
                text: '安慰母妃，劝她忍耐',
                effects: { favor: -2 },
                result: '你劝母妃忍一时风平浪静，母妃叹了口气，不再说话。',
                conditionCheck: { motherPersonality: 'buddhist' },
                resultAlt: '母妃听后反而释然了，"罢了，忍忍便好。"'
            }
        ]
    },
    {
        id: 'mother_advice',
        type: EVENT_TYPES.MOTHER,
        name: '母妃教诲',
        text: '母妃将你叫到身边，语重心长地与你说话。',
        conditions: { minAge: 7 },
        weight: 14,
        choices: [
            {
                text: '认真聆听',
                effects: { strategy: 2, favor: 1 },
                result: '{motherLine:advice}',
                isMotherEvent: true
            },
            {
                text: '左耳进右耳出',
                effects: { strategy: -1, favor: -1 },
                result: '你心不在焉地听着，母妃叹了口气，"你这孩子……"'
            }
        ]
    },

    // === 宫斗事件 ===
    {
        id: 'plot_poison_food',
        type: EVENT_TYPES.CRISIS,
        name: '食中藏毒',
        text: '你正要动筷，贴身太监突然拦住你——银针试毒，针尖发黑！',
        conditions: { minAge: 10 },
        weight: 5,
        choices: [
            {
                text: '追查到底',
                effects: { strategy: 2, prestige: 3, control: 2 },
                result: '你下令彻查，最终查到是御膳房一个宫女受人指使。顺藤摸瓜，牵出了一位对你不满的皇兄的母妃。'
            },
            {
                text: '暗中调查',
                effects: { strategy: 3 },
                result: '你不动声色，暗中命人调查。此事背后水很深，你决定先隐忍不发。'
            },
            {
                text: '不了了之',
                effects: { favor: -3, control: -2 },
                result: '此事不了了之，但宫中人人皆知你好欺负，此后暗箭更多。'
            }
        ]
    },
    {
        id: 'plot_framed',
        type: EVENT_TYPES.CRISIS,
        name: '栽赃嫁祸',
        text: '有人在你寝宫中搜出了巫蛊之物！此事若被父皇知晓，轻则禁足，重则……',
        conditions: { minAge: 10 },
        weight: 4,
        choices: [
            {
                text: '立刻向父皇禀明冤情',
                effects: { favor: 1, prestige: -1 },
                result: '你跪在父皇面前据理力争，父皇虽未深究，但眼中疑虑未消。',
                conditionCheck: { favorHigh: true },
                resultAlt: '父皇信了你，温言安慰，并命人追查真凶。'
            },
            {
                text: '反将一军，嫁祸他人',
                effects: { strategy: 3, prestige: 1, control: 1 },
                result: '你暗中布局，将证据指向了另一个有嫌疑的皇子。此计虽险，却成功脱身。'
            },
            {
                text: '求母妃帮忙',
                effects: { favor: 2 },
                result: '母妃出面周旋，{motherLine:protect}',
                isMotherEvent: true
            }
        ]
    },

    // === 朝政事件 ===
    {
        id: 'political_flood',
        type: EVENT_TYPES.POLITICAL,
        name: '南方大水',
        text: '朝堂传来急报：南方数州暴雨成灾，堤坝决口，灾民流离失所。',
        conditions: { minAge: 12 },
        weight: 6,
        choices: [
            {
                text: '请命前往赈灾',
                effects: { prestige: 5, favor: 3, literature: 1 },
                result: '你主动请缨，父皇龙颜大悦。赈灾途中你亲眼目睹了百姓疾苦，心中暗下决心。'
            },
            {
                text: '建议开仓放粮',
                effects: { strategy: 2, prestige: 2 },
                result: '你提出开仓放粮、减免赋税的建议，朝臣们纷纷侧目，没想到年幼的皇子竟有如此见地。'
            },
            {
                text: '事不关己',
                effects: { control: -2 },
                result: '你沉默不语。数日后传来消息，灾情恶化，盗贼四起，朝中有人开始质疑皇族的无能。'
            }
        ]
    },

    // === 情感事件 ===
    {
        id: 'romance_garden_meet',
        type: EVENT_TYPES.ROMANCE,
        name: '花间偶遇',
        text: '御花园中，你偶遇一位面生的少女正在花丛中哭泣。',
        conditions: { minAge: 12 },
        weight: 8,
        choices: [
            {
                text: '上前询问',
                effects: { charm: 2 },
                result: '你走近询问，少女抬起泪眼，竟是某位大臣之女。她因迷路而慌张，你送她回了前厅。她红着脸向你道谢。',
                spawnNPC: true,
                npcType: 'romance'
            },
            {
                text: '绕道而行',
                effects: {},
                result: '你不想多事，转身离去。身后传来少女的啜泣声，渐渐远去。'
            }
        ]
    },

    // === 隐藏事件 ===
    {
        id: 'hidden_cold_palace_secret',
        type: EVENT_TYPES.HIDDEN,
        name: '冷宫秘闻',
        text: '你无意间路过冷宫，听到里面传来低语声。透过门缝，你看到一位面容枯槁的女子正对着墙壁自言自语，说的竟是先皇后的死因……',
        conditions: { minAge: 12, motherRankMax: 'concubine' },
        weight: 2,
        hidden: true,
        choices: [
            {
                text: '仔细倾听',
                effects: { strategy: 3 },
                result: '你屏息倾听，得到了一个惊人的秘密——先皇后的死并非病逝，而是被人毒杀！你将此事深埋心底。',
                setFlag: 'know_empress_death'
            },
            {
                text: '赶紧离开',
                effects: {},
                result: '你不想惹祸上身，快步离开了冷宫。但那低语声似乎在你耳边回响不散。'
            }
        ]
    }
];

// NPC 模板
const NPC_TEMPLATES = {
    prince: {
        title: '皇子',
        gender: 'male',
        baseSkills: { literature: 3, strategy: 3, martial: 3, charm: 2 },
        personalityPool: ['ambitious', 'cunning', 'gentle', 'arrogant', 'timid', 'righteous']
    },
    princess: {
        title: '公主',
        gender: 'female',
        baseSkills: { literature: 3, music: 3, charm: 3, strategy: 2 },
        personalityPool: ['gentle', 'cunning', 'proud', 'kind', 'schemer', 'naive']
    },
    consort: {
        title: '妃嫔',
        gender: 'female',
        baseSkills: { charm: 4, strategy: 2, management: 2 },
        personalityPool: ['schemer', 'gentle', 'fierce', 'naive', 'ambitious']
    },
    official: {
        title: '朝臣',
        gender: 'male',
        baseSkills: { literature: 4, strategy: 3, management: 3 },
        personalityPool: ['righteous', 'cunning', 'loyal', 'corrupt', 'ambitious']
    },
    servant: {
        title: '宫人',
        gender: 'female',
        baseSkills: { charm: 2, management: 1 },
        personalityPool: ['loyal', 'schemer', 'naive', 'timid']
    },
    romance: {
        title: '闺秀',
        gender: 'female',
        baseSkills: { charm: 4, literature: 2, music: 2 },
        personalityPool: ['gentle', 'kind', 'proud', 'talented']
    }
};

// 性格定义
const PERSONALITIES = {
    ambitious: { name: '野心勃勃', desc: '志在高位，不择手段' },
    cunning:   { name: '城府深沉', desc: '心思缜密，善于算计' },
    gentle:    { name: '温润如玉', desc: '待人温和，与世无争' },
    arrogant:  { name: '目中无人', desc: '自视甚高，看不起人' },
    timid:     { name: '胆小怕事', desc: '遇事退缩，不敢出头' },
    righteous: { name: '刚正不阿', desc: '正直无私，不畏强权' },
    kind:      { name: '善良纯真', desc: '心地善良，乐于助人' },
    proud:     { name: '高傲矜持', desc: '自视甚高，不轻易低头' },
    schemer:   { name: '心机深沉', desc: '善于谋划，步步为营' },
    naive:     { name: '天真无邪', desc: '心思单纯，容易轻信' },
    loyal:     { name: '忠心耿耿', desc: '忠心不二，值得信赖' },
    corrupt:   { name: '贪财好利', desc: '见钱眼开，容易被收买' },
    talented:  { name: '才华横溢', desc: '天赋异禀，出类拔萃' },
    fierce:    { name: '泼辣果断', desc: '行事果决，不拖泥带水' }
};

// 随机姓名生成
function generateName(gender) {
    const surname = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
    const namePool = gender === 'male' ? MALE_NAMES : FEMALE_NAMES;
    const name = namePool[Math.floor(Math.random() * namePool.length)];
    return surname + name;
}

// 随机性格生成
function generatePersonality(pool) {
    return pool[Math.floor(Math.random() * pool.length)];
}

// 随机妃嫔品阶
function randomRank() {
    const weights = [1, 2, 3, 5, 6, 7, 6, 3]; // 皇后最少，中间多
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) return RANKS[i];
    }
    return RANKS[4]; // 默认贵人
}
