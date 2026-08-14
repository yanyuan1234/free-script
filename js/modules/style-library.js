/**
 * 多文风库与切换系统
 * 灵感来源：恒·序 v1.95 (40+文学风格) + God of novel v3 (风格库)
 * 设计理念：预设多种文学风格模板，用户可在游戏中实时切换文风。
 *           每种风格包含词汇偏好、句式特征、修辞倾向等参数。
 *           通过 PromptBuilder section 注入当前选中的文风指导。
 *
 * 依赖：prompt-builder.js
 */
var StyleLibrary = {

    enabled: true,

    // 当前选中的文风ID
    currentStyle: 'balanced',

    // 文风库定义
    styles: [],

    /**
     * 初始化
     */
    init: function() {
        this._defineStyles();
        this._loadSettings();
        this._registerSection();
        console.log('[StyleLibrary] 文风库已初始化 (' + this.styles.length + '种风格, 当前: ' + this.currentStyle + ')');
    },

    /**
     * 定义文风库
     * 来源：恒·序 v1.95 + God of novel v3 + 文学创作理论
     */
    _defineStyles: function() {
        this.styles = [
            {
                id: 'balanced',
                name: '均衡叙事',
                category: '通用',
                description: '叙事、对话、描写均衡分配，适合大多数场景',
                vocabulary: '用词精准，不偏华丽也不偏朴素',
                sentencePattern: '长短句交替，节奏自然',
                rhetoric: '适度使用比喻和拟人，以贴切为原则',
                pacing: '快慢适中，张弛有度',
                example: '他推开门，冷风裹着雨丝扑面而来。走廊尽头的灯忽明忽暗，像是在犹豫要不要继续亮着。'
            },
            {
                id: 'classical',
                name: '古典雅致',
                category: '文学',
                description: '用词典雅，句式工整，有古典文学韵味',
                vocabulary: '多用四字格和书面语，避免口语化表达',
                sentencePattern: '句式工整，多用对偶和排比',
                rhetoric: '善用典故、比喻、借代，修辞典雅',
                pacing: '节奏舒缓，重在意境营造',
                example: '夜阑人静，月华如水。他独倚危栏，望尽天涯路远，心事浩茫连广宇。'
            },
            {
                id: 'modernist',
                name: '现代先锋',
                category: '文学',
                description: '意识流风格，内心独白丰富，叙事碎片化',
                vocabulary: '用词新颖，多用通感和跨界比喻',
                sentencePattern: '句子断裂、跳跃，模仿思维流',
                rhetoric: '大量使用通感、隐喻、象征',
                pacing: '非线性，时间跳跃，意识流动',
                example: '光。碎片。她想起某个下午——不，是许多个下午叠在一起。手指触碰杯壁的凉意，和记忆中某个温度重合。'
            },
            {
                id: 'minimalist',
                name: '极简白描',
                category: '文学',
                description: '用最少文字传达最多信息，克制而有力',
                vocabulary: '用词简练，剔除所有多余修饰',
                sentencePattern: '短句为主，干脆利落',
                rhetoric: '几乎不用修辞，以白描为主',
                pacing: '节奏明快，留白丰富',
                example: '门开了。他站在那里。没说话。雨还在下。'
            },
            {
                id: 'poetic',
                name: '诗意抒情',
                category: '文学',
                description: '语言富有诗意，注重感官和情绪渲染',
                vocabulary: '用词柔美，多感官词汇',
                sentencePattern: '句式流动，有韵律感',
                rhetoric: '大量比喻、通感、拟人，营造诗意',
                pacing: '舒缓如流水，情绪层层递进',
                example: '黄昏把最后的金色洒在她肩上，像一只温柔的蝴蝶停在那里，不愿飞走。空气里有桂花香，若有若无。'
            },
            {
                id: 'hardboiled',
                name: '冷硬派',
                category: '类型',
                description: '冷峻客观，对话犀利，有侦探小说质感',
                vocabulary: '用词直接，口语化，带讽刺',
                sentencePattern: '短句+冷对话，节奏快',
                rhetoric: '少用修辞，用行动和对话说话',
                pacing: '紧凑，不拖泥带水',
                example: '"你来了。"她说。我点了根烟。窗外的雨没有要停的意思。"坐吧。"我没坐。'
            },
            {
                id: 'cinematic',
                name: '电影感',
                category: '类型',
                description: '画面感强，镜头语言丰富，注重场景调度',
                vocabulary: '用词视觉化，多用空间和光影词汇',
                sentencePattern: '长短镜头交替，有画面切换感',
                rhetoric: '用场景调度代替心理描写',
                pacing: '有节奏的推拉摇移',
                example: '镜头从他的手开始——指节发白，握着那封信。慢慢上摇：领口、下巴、嘴唇紧抿。最后是眼睛。那双眼睛里有整个暴风雨。'
            },
            {
                id: 'gothic',
                name: '哥特暗黑',
                category: '类型',
                description: '阴郁压抑，氛围沉重，有哥特小说质感',
                vocabulary: '用词阴沉，多黑暗和衰败意象',
                sentencePattern: '长句缠绕，层层修饰',
                rhetoric: '大量使用象征、预兆、双重意象',
                pacing: '缓慢沉重，如暗流涌动',
                example: '古堡的石墙上爬满了枯萎的藤蔓，像无数干枯的手指抓紧最后的体面。走廊深处传来某种声响——不是风，风不会那样叹息。'
            },
            {
                id: 'lightnovel',
                name: '轻小说',
                category: '类型',
                description: '轻松活泼，对话丰富，有日式轻小说风格',
                vocabulary: '用词活泼，有流行语和网络用语',
                sentencePattern: '短句+大量对话，节奏轻快',
                rhetoric: '夸张的比喻和吐槽',
                pacing: '明快，适合快速阅读',
                example: '「等等等等！我说的不是那个意思啦！」她猛地摆手，脸颊泛红。啊，这个反应也太经典了吧。我不禁在心里给她的可爱度又加了一分。'
            },
            {
                id: 'wuxia',
                name: '武侠风',
                category: '国风',
                description: '有中国传统武侠小说的韵味',
                vocabulary: '用词古雅但不晦涩，有江湖气',
                sentencePattern: '四字短句与长句交错，有节奏感',
                rhetoric: '善用对仗、夸张，武打描写注重招式',
                pacing: '动静结合，打斗快如闪电，铺垫缓如流水',
                example: '剑光一闪，如惊鸿掠影。他身形未动，长剑已入鞘三寸。对方愣了一瞬，衣襟裂开一线——这一剑，快到了极致。'
            },
            {
                id: 'scifi',
                name: '科幻感',
                category: '类型',
                description: '冷静理性，有科技感和未来感',
                vocabulary: '多用科技术语，精确的数据和描述',
                sentencePattern: '逻辑清晰，有技术报告的质感',
                rhetoric: '用技术细节营造真实感',
                pacing: '理性推进，信息密度高',
                example: '量子纠缠通讯器在0.003秒内完成了握手。他盯着全息屏上跳动的数据流——熵值异常。这不应该出现在封闭系统中。'
            },
            {
                id: 'lyrical-realism',
                name: '抒情现实主义',
                category: '文学',
                description: '扎根现实但有文学性，细腻而真实',
                vocabulary: '日常用词为主，偶有文学性升华',
                sentencePattern: '自然流畅，有口语感但不粗俗',
                rhetoric: '克制的比喻，服务于真实感',
                pacing: '贴近生活节奏，不刻意制造戏剧性',
                example: '厨房里炖着汤，咕嘟咕嘟地响。她坐在小板凳上择菜，阳光从阳台照进来，照着她的手背。日子就是这样，一天接一天地过。'
            }
        ];
    },

    /**
     * 加载用户设置
     */
    _loadSettings: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.getJSON) {
                var settings = Storage.getJSON('style_library_settings', null);
                if (settings) {
                    this.enabled = settings.enabled !== false;
                    this.currentStyle = settings.currentStyle || 'balanced';
                }
            }
        } catch(e) {
            console.warn('[StyleLibrary] 读取设置失败:', e);
        }
    },

    /**
     * 保存设置
     */
    saveSettings: function() {
        try {
            if (typeof Storage !== 'undefined' && Storage.setJSON) {
                Storage.setJSON('style_library_settings', {
                    enabled: this.enabled,
                    currentStyle: this.currentStyle
                });
            }
        } catch(e) {
            console.warn('[StyleLibrary] 保存设置失败:', e);
        }
    },

    /**
     * 注册 PromptBuilder section
     */
    _registerSection: function() {
        if (typeof PromptBuilder === 'undefined') {
            var self = this;
            setTimeout(function() { self._registerSection(); }, 500);
            return;
        }

        var self = this;
        PromptBuilder.registerSection('styleLibrary', function(ctx) {
            if (!self.enabled) return '';

            var style = self._getStyleById(self.currentStyle);
            if (!style) return '';

            var parts = [];
            parts.push('【文风指导·' + style.name + '】');
            parts.push('当前文风：' + style.name + '（' + style.category + '）');
            parts.push('风格说明：' + style.description);
            parts.push('用词偏好：' + style.vocabulary);
            parts.push('句式特征：' + style.sentencePattern);
            parts.push('修辞倾向：' + style.rhetoric);
            parts.push('节奏控制：' + style.pacing);
            parts.push('风格示例：' + style.example);
            parts.push('请在本次输出中严格遵循以上文风要求。');

            return parts.join('\n');
        }, { order: 57 });
    },

    /**
     * 根据ID获取文风
     */
    _getStyleById: function(id) {
        return this.styles.find(function(s) { return s.id === id; });
    },

    /**
     * 切换文风
     */
    setStyle: function(styleId) {
        var style = this._getStyleById(styleId);
        if (!style) return false;
        this.currentStyle = styleId;
        this.saveSettings();
        console.log('[StyleLibrary] 文风已切换为: ' + style.name);
        return true;
    },

    /**
     * 获取所有文风列表
     */
    getAllStyles: function() {
        return this.styles.map(function(s) {
            return { id: s.id, name: s.name, category: s.category, description: s.description };
        });
    },

    /**
     * 按分类获取文风
     */
    getStylesByCategory: function() {
        var grouped = {};
        this.styles.forEach(function(s) {
            if (!grouped[s.category]) grouped[s.category] = [];
            grouped[s.category].push({ id: s.id, name: s.name, description: s.description });
        });
        return grouped;
    },

    /**
     * 获取当前文风
     */
    getCurrentStyle: function() {
        var style = this._getStyleById(this.currentStyle);
        return style ? { id: style.id, name: style.name, category: style.category } : null;
    },

    setEnabled: function(enabled) {
        this.enabled = enabled;
        this.saveSettings();
    }
};
