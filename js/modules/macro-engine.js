/**
 * 宏引擎
 * 处理提示词中的宏替换（{{user}}、{{char}}、{{.var}}、{{$var}} 等）
 * 管理局部/全局变量（已迁移到 VariableStore，此处保留 API 兼容）
 * 依赖：regex-manager.js（间接，通过 PresetManager 注入）
 * 被依赖：preset-manager.js（prompt 渲染时调用 process）
 */

// 原实现 timestamp 函数每次调用都在 keys.forEach 内执行 new RegExp(k, 'g')，
// 对 12 个格式占位符各编译一次正则。{{timestamp:FORMAT}} 宏每条消息渲染都可能触发。
// 现预编译到模块级常量，仅编译一次。
var _TIMESTAMP_REGEX_MAP = {
    'YYYY': /YYYY/g,
    'MM': /MM/g,
    'DD': /DD/g,
    'HH': /HH/g,
    'mm': /mm/g,
    'ss': /ss/g,
    'M': /M/g,
    'D': /D/g,
    'H': /H/g,
    'm': /m/g,
    's': /s/g
};
var _TIMESTAMP_SORTED_KEYS = Object.keys(_TIMESTAMP_REGEX_MAP).sort(function(a, b) { return b.length - a.length; });

// 小剧场变量映射表：每项为 [主名, 别名?]
// 有别名时取 主名 || 别名，无别名时直接取主名。
// 顺序与原 getTheaterContent 内 theaterVars 字面量保持一致，确保返回对象 key 顺序不变。
var _THEATER_VAR_KEYS = [
    // 月读预设 - 之愿系列（主名 || 英文别名）
    ['盲盒之愿', 'blind_box'], ['每日之愿', 'daily'], ['涩涩之愿', 'nsfw_wish'],
    ['游戏之愿', 'game_wish'], ['群聊之愿', 'chat_wish'], ['论坛之愿', 'forum_wish'],
    ['幸福之愿', 'happy_wish'], ['哀伤之愿', 'sad_wish'], ['档案之愿', 'archive_wish'],
    ['快递之愿', 'delivery_wish'], ['播客之愿', 'podcast_wish'], ['购物之愿', 'shopping_wish'],
    ['桌面之愿', 'desktop_wish'], ['日程之愿', 'schedule_wish'], ['通知之愿', 'notification_wish'],
    ['报告之愿', 'report_wish'], ['问卷之愿', 'survey_wish'],
    // 果实预设
    ['小剧场规范'], ['snow'], ['emoji_snow'], ['论坛小剧场'], ['日常剧场'], ['后台人生'],
    // 蛾摩拉预设
    ['小剧场'], ['蛾摩拉'], ['日程表'], ['小夜单人状态'],
    // 通用
    ['剧场COT'],
    // <gossip> → 论坛
    ['gossip'], ['八卦'], ['论坛'],
    // <角色手机> → 手机功能
    ['角色手机'], ['手机'], ['phone'],
    // <通用状态> / <古风状态> → 状态面板
    ['通用状态'], ['古风状态'], ['状态面板'], ['status'],
    // <meow_FM> → 摘要
    ['meow_FM'], ['摘要'], ['summary'],
    // <branches> → 选项分支
    ['branches'], ['选项分支'], ['分支'],
    // <echo> → 物品
    ['echo'], ['物品'], ['items'],
    // <ccd> → 文字剧场
    ['ccd'], ['文字剧场'], ['剧场'],
    // 之愿/小剧场/之塔扩展
    ['恋爱之愿'], ['同人之愿'], ['回忆之愿'], ['平行之愿'], ['美食之愿'], ['广告之愿'], ['文学之愿'],
    ['恋爱小剧场'], ['涩涩小剧场'], ['游戏小剧场'],
    ['恋爱之塔'], ['涩涩之塔'], ['游戏之塔'], ['群聊之塔'], ['论坛之塔'], ['同人之塔'],
    ['八卦之塔'], ['回忆之塔'], ['平行之塔'], ['美食之塔'], ['广告之塔'], ['报告之塔'],
    ['每日之塔'], ['文学之塔'], ['哀伤之塔'], ['幸福之塔'], ['盲盒之塔'],
    // 其余小剧场变量
    ['ice'], ['live'], ['danmu'], ['enigma'], ['podcast'], ['table_Edit'], ['horae'], ['horaeevent'],
    ['作者有话说'], ['author_note'], ['giggle'], ['角色心声'], ['snow_rules'], ['gossip_rules'],
    ['novel_header'], ['profile'], ['角色关系'], ['seeds']
];

var MacroEngine = {
    // 局部变量存储（当前游戏会话级别）
    _localVars: {},
    // 全局变量存储（跨会话持久化）
    _globalVars: {},

    init: function() {

        // 保留此方法用于向后兼容
        if (typeof VariableStore !== 'undefined') {
            VariableStore.loadGlobal();
        }
    },


    // 设置局部变量
    setLocalVar: function(name, value) {
        if (!name || typeof VariableStore === 'undefined') return '';
        VariableStore.setLocal(name.trim(), value);
        return '';
        },

    // 获取局部变量
    getLocalVar: function(name) {
        if (!name || typeof VariableStore === 'undefined') return '';
        var val = VariableStore.getLocal(name.trim(), '');
        // 自动类型转换：纯数字字符串转为数字
        if (typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val))) {
            return Number(val);
        }
        return val;
    },

    // 设置全局变量
    setGlobalVar: function(name, value) {
        if (!name || typeof VariableStore === 'undefined') return '';
        VariableStore.setGlobal(name.trim(), value);
        return '';
        },

    // 获取全局变量
    getGlobalVar: function(name) {
        if (!name || typeof VariableStore === 'undefined') return '';
        var val = VariableStore.getGlobal(name.trim(), '');
        if (typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val))) {
            return Number(val);
        }
        return val;
    },

    // 检查变量是否存在
    hasVar: function(name) {
        if (!name || typeof VariableStore === 'undefined') return 'false';
        return VariableStore.local.has(name.trim()) ? 'true' : 'false';
        },

    hasGlobalVar: function(name) {
        if (!name || typeof VariableStore === 'undefined') return 'false';
        return VariableStore.global.has(name.trim()) ? 'true' : 'false';
        },

    // 删除变量
    deleteVar: function(name) {
        if (!name || typeof VariableStore === 'undefined') return '';
        VariableStore.local.delete(name.trim());
        return '';
        },

    deleteGlobalVar: function(name) {
        if (!name || typeof VariableStore === 'undefined') return '';
        VariableStore.global.delete(name.trim());
        VariableStore._persistGlobal();
        return '';
        },

    // 增加变量值（数字相加或字符串拼接）
    addVar: function(name, value) {
        if (!name || typeof VariableStore === 'undefined') return '';
        name = name.trim();
        var current = VariableStore.getLocal(name, '');
        if (!current) {
            VariableStore.setLocal(name, String(value));
            } else {
            var numCurrent = Number(current);
            var numValue = Number(value);
            if (!isNaN(numCurrent) && !isNaN(numValue)) {
                VariableStore.setLocal(name, String(numCurrent + numValue));
                } else {
                VariableStore.setLocal(name, String(current) + String(value));
            }
        }
    return '';
    },

    // 变量递增
    incVar: function(name) {
        if (!name || typeof VariableStore === 'undefined') return '';
        name = name.trim();
        var current = Number(VariableStore.getLocal(name, '0')) || 0;
        VariableStore.setLocal(name, String(current + 1));
        return '';
        },

    // 变量递减
    decVar: function(name) {
        if (!name || typeof VariableStore === 'undefined') return '';
        name = name.trim();
        var current = Number(VariableStore.getLocal(name, '0')) || 0;
        VariableStore.setLocal(name, String(current - 1));
        return '';
        },

    // 生成 UUID
    uuid: function() {
        if (crypto && crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
            });
        },

    // 【小剧场融合】检测小剧场开关和内容
    // theaterVars 由 _THEATER_VAR_KEYS 驱动：[主名, 别名?] → 主名 || (别名? 主名 : '')
    getTheaterContent: function(theaterType) {
        var theaterVars = {};
        for (var i = 0; i < _THEATER_VAR_KEYS.length; i++) {
            var entry = _THEATER_VAR_KEYS[i];
            var key = entry[0];
            var alias = entry[1];
            var val = this.getLocalVar(key);
            if (alias) val = val || this.getLocalVar(alias);
            theaterVars[key] = val;
        }
        if (theaterType) {
            return theaterVars[theaterType] || '';
        }
        return theaterVars;
    },

    // 【小剧场融合】解析小剧场内容标签
    // 【P0 根因修复】用线性扫描器替代所有 [\s\S]*? 正则，避免灾难性回溯
    parseTheaterContent: function(content) {
        if (!content) return null;

        var result = {
            type: 'unknown',
            title: '',
            content: content,
            html: '',
            data: null
        };

        // 【P0 修复】一次性线性扫描所有已知标签，找到最早出现的
        // 替代 30+ 个 content.match(/<tag>([\s\S]*?)<\/tag>/i) 串联调用
        var _theaterTagNames = [
            'snow', 'author_note', 'calendar_widget', 'status_panel', 'gossip',
            '角色手机', '通用状态', '古风状态', 'meow_FM', 'branches', 'echo',
            'ccd', 'live', 'danmu', 'ice', 'enigma', 'podcast', 'novel_header',
            'profile', 'giggle', 'horaeevent', 'horae', 'tableEdit', 'table_Edit'
        ];

        var _firstMatch = null;
        if (typeof findFirstPairedTag === 'function') {
            _firstMatch = findFirstPairedTag(content, _theaterTagNames);
        } else {
            // Fallback：原始正则逻辑（仅在工具函数不可用时）
            for (var _ti = 0; _ti < _theaterTagNames.length; _ti++) {
                var _tn = _theaterTagNames[_ti];
                var _re = new RegExp('<' + _tn + '>([\\s\\S]*?)</' + _tn + '>', 'i');
                var _m = content.match(_re);
                if (_m) {
                    _firstMatch = { tagName: _tn.toLowerCase(), rawTagName: _tn, content: _m[1], fullMatch: _m[0], index: content.indexOf('<' + _tn) };
                    break;
                }
            }
        }

        if (!_firstMatch) return result;

        // 辅助函数：在 html 中查找第一个子标签内容（线性扫描）
        function _findFirstInner(html, tagNames) {
            if (typeof findFirstPairedTag === 'function') {
                return findFirstPairedTag(html, tagNames);
            }
            for (var i = 0; i < tagNames.length; i++) {
                var re = new RegExp('<' + tagNames[i] + '>([\\s\\S]*?)</' + tagNames[i] + '>', 'i');
                var m = html.match(re);
                if (m) return { content: m[1], fullMatch: m[0], tagName: tagNames[i].toLowerCase() };
            }
            return null;
        }

        // 辅助函数：提取所有子标签内容（线性扫描）
        function _extractAllInner(html, tagName) {
            if (typeof extractPairedTagContents === 'function') {
                return extractPairedTagContents(html, tagName);
            }
            // Fallback
            var arr = [];
            var re = new RegExp('<' + tagName + '[^>]*>([\\s\\S]*?)</' + tagName + '>', 'gi');
            var m;
            while ((m = re.exec(html)) !== null) {
                arr.push({ fullMatch: m[0], content: m[1] });
            }
            return arr;
        }

        // 辅助函数：提取所有子标签（含 fullMatch 和 attributes）
        function _extractAllTags(html, tagName) {
            if (typeof extractPairedTags === 'function') {
                return extractPairedTags(html, [tagName]);
            }
            var arr = [];
            var re = new RegExp('<' + tagName + '[^>]*>([\\s\\S]*?)</' + tagName + '>', 'gi');
            var m;
            while ((m = re.exec(html)) !== null) {
                arr.push({ fullMatch: m[0], content: m[1] });
            }
            return arr;
        }

        // 辅助函数：从 fullMatch 中提取属性值
        function _getAttr(fullMatch, attrName) {
            var re = new RegExp(attrName + '=["\']([^"\']+)["\']', 'i');
            var m = fullMatch.match(re);
            return m ? m[1] : null;
        }

        var tagName = _firstMatch.tagName;  // 小写
        var rawTagName = _firstMatch.rawTagName || tagName;
        result.html = _firstMatch.content;

        // 根据标签名设置类型和标题
        switch (tagName) {
            case 'snow':
                result.type = 'snow';
                var _sumMatch = _findFirstInner(result.html, ['summary']);
                if (_sumMatch) {
                    result.title = _sumMatch.content.replace(/<[^>]+>/g, '').trim();
                }
                return result;

            case 'author_note':
                result.type = 'author_note';
                var _mutMatch = _findFirstInner(result.html, ['muttering']);
                if (_mutMatch) {
                    result.content = _mutMatch.content.trim();
                }
                return result;

            case 'calendar_widget':
                result.type = 'calendar';
                return result;

            case 'status_panel':
                result.type = 'status';
                return result;

            case 'gossip':
                result.type = 'gossip';
                result.title = '论坛';
                var _posts = [];
                var _postTags = _extractAllTags(result.html, 'post');
                _postTags.forEach(function(post) {
                    var _author = _getAttr(post.fullMatch, 'author') || '匿名';
                    var _titleMatch = _findFirstInner(post.content, ['title']);
                    var _title = _titleMatch ? _titleMatch.content : '';
                    var _bodyMatch = _findFirstInner(post.content, ['body']);
                    var _body = _bodyMatch ? _bodyMatch.content : post.content.replace(/<[^>]+>/g, '');
                    _posts.push({ author: _author, title: _title, content: _body, time: Date.now() });
                });
                if (_posts.length === 0) {
                    _posts.push({ author: '小剧场', content: result.html.replace(/<[^>]+>/g, '').substring(0, 200), time: Date.now() });
                }
                result.data = { posts: _posts };
                return result;

            case '角色手机':
                result.type = 'phone';
                result.title = '手机';
                var _apps = [];
                var _appTags = _extractAllTags(result.html, 'app');
                _appTags.forEach(function(app) {
                    var _name = _getAttr(app.fullMatch, 'name') || '应用';
                    var _icon = _getAttr(app.fullMatch, 'icon') || '◇';
                    var _notifMatch = _findFirstInner(app.content, ['notification']);
                    var _notif = _notifMatch ? _notifMatch.content : '';
                    _apps.push({ name: _name, icon: _icon, notification: _notif });
                });
                result.data = { apps: _apps };
                return result;

            case '通用状态':
                result.type = 'status';
                result.title = '角色状态';
                var _stats = [];
                var _statTags = _extractAllTags(result.html, 'stat');
                _statTags.forEach(function(stat) {
                    var _name = _getAttr(stat.fullMatch, 'name') || '状态';
                    var _valMatch = _findFirstInner(stat.content, ['value']);
                    var _val = _valMatch ? _valMatch.content : '';
                    var _icon = _getAttr(stat.fullMatch, 'icon') || '◇';
                    _stats.push({ name: _name, value: _val, icon: _icon });
                });
                result.data = { stats: _stats };
                return result;

            case '古风状态':
                result.type = 'status';
                result.title = '角色状态';
                var _stats2 = [];
                var _statTags2 = _extractAllTags(result.html, 'stat');
                _statTags2.forEach(function(stat) {
                    var _name = _getAttr(stat.fullMatch, 'name') || '状态';
                    var _valMatch = _findFirstInner(stat.content, ['value']);
                    var _val = _valMatch ? _valMatch.content : '';
                    var _icon = _getAttr(stat.fullMatch, 'icon') || '◇';
                    _stats2.push({ name: _name, value: _val, icon: _icon });
                });
                result.data = { stats: _stats2, ancient: true };
                return result;

            case 'meow_fm':
                result.type = 'summary';
                result.title = '摘要';
                var _contMatch = _findFirstInner(result.html, ['content']);
                var _summaryContent = _contMatch ? _contMatch.content : result.html;
                result.data = { summary: _summaryContent.replace(/<[^>]+>/g, '').trim() };
                return result;

            case 'branches':
                result.type = 'branches';
                result.title = '选项';
                var _options = [];
                var _optTags = _extractAllTags(result.html, 'option');
                _optTags.forEach(function(opt, idx) {
                    var _textMatch = _findFirstInner(opt.content, ['text']);
                    var _text = _textMatch ? _textMatch.content : opt.content.replace(/<[^>]+>/g, '');
                    var _condition = _getAttr(opt.fullMatch, 'condition') || '';
                    _options.push({ text: _text.trim(), condition: _condition, index: idx + 1 });
                });
                if (_options.length === 0) {
                    var _lines = result.html.split(/\n/).filter(function(l) { return l.trim(); });
                    _lines.forEach(function(line, idx) {
                        _options.push({ text: line.replace(/<[^>]+>/g, '').trim(), condition: '', index: idx + 1 });
                    });
                }
                result.data = { options: _options };
                return result;

            case 'echo':
                result.type = 'echo';
                result.title = '物品';
                var _items = [];
                var _itemTags = _extractAllTags(result.html, 'item');
                _itemTags.forEach(function(item) {
                    var _name = _getAttr(item.fullMatch, 'name') || '物品';
                    var _descMatch = _findFirstInner(item.content, ['desc']);
                    var _desc = _descMatch ? _descMatch.content : '';
                    var _icon = _getAttr(item.fullMatch, 'icon') || '🎁';
                    var _count = parseInt(_getAttr(item.fullMatch, 'count')) || 1;
                    _items.push({ name: _name, description: _desc, icon: _icon, count: _count });
                });
                if (_items.length === 0) {
                    _items.push({ name: '神秘物品', description: result.html.replace(/<[^>]+>/g, '').substring(0, 100), icon: '🎁', count: 1 });
                }
                result.data = { items: _items };
                return result;

            case 'ccd':
                result.type = 'ccd';
                result.title = '文字剧场';
                var _scenes = [];
                var _sceneTags = _extractAllTags(result.html, 'scene');
                _sceneTags.forEach(function(scene) {
                    var _title = _getAttr(scene.fullMatch, 'title') || '';
                    var _textMatch = _findFirstInner(scene.content, ['text']);
                    var _text = _textMatch ? _textMatch.content : scene.content.replace(/<[^>]+>/g, '');
                    _scenes.push({ title: _title, text: _text.trim() });
                });
                if (_scenes.length === 0) {
                    result.data = { text: result.html.replace(/<[^>]+>/g, '').trim() };
                } else {
                    result.data = { scenes: _scenes };
                }
                return result;

            case 'live':
                result.type = 'live';
                result.html = result.html.replace(/^\s+|\s+$/g, '');
                result.title = '直播';
                return result;

            case 'danmu':
                result.type = 'danmu';
                result.title = '弹幕';
                return result;

            case 'ice':
                result.type = 'ice';
                return result;

            case 'enigma':
                result.type = 'enigma';
                result.title = '谜题';
                return result;

            case 'podcast':
                result.type = 'podcast';
                result.title = '播客';
                return result;

            case 'novel_header':
                result.type = 'novel_header';
                result.title = '章节标题';
                return result;

            case 'profile':
                result.type = 'profile';
                result.title = '角色关系';
                return result;

            case 'giggle':
                result.type = 'giggle';
                result.title = '角色心声';
                result.content = result.html.replace(/<[^>]+>/g, '').trim();
                return result;

            case 'horaeevent':
            case 'horae':
                result.type = 'horae';
                result.title = '记忆';
                return result;

            case 'tableedit':
            case 'table_edit':
                result.type = 'table';
                result.title = '表格';
                return result;

            default:
                return result;
        }
    },

    // 格式化时间戳
    timestamp: function(format) {
        var d = new Date();
        if (!format) format = 'YYYYMMDDHHmmss';
        var map = {
            'YYYY': d.getFullYear(),
            'MM': String(d.getMonth() + 1).padStart(2, '0'),
            'DD': String(d.getDate()).padStart(2, '0'),
            'HH': String(d.getHours()).padStart(2, '0'),
            'mm': String(d.getMinutes()).padStart(2, '0'),
            'ss': String(d.getSeconds()).padStart(2, '0'),
            'M': d.getMonth() + 1,
            'D': d.getDate(),
            'H': d.getHours(),
            'm': d.getMinutes(),
            's': d.getSeconds()
    };
            var result = format;

            // 按长度降序替换（先替换长的再替换短的，避免冲突）
            _TIMESTAMP_SORTED_KEYS.forEach(function(k) {
                result = result.replace(_TIMESTAMP_REGEX_MAP[k], map[k]);
                });
            return result;
        },

        // 获取当前时间
    time: function() {
            var d = new Date();
            return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        },

        // 获取当前日期
    date: function() {
            var d = new Date();
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        },

        // 获取星期几
    weekday: function() {
            var days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
            return days[new Date().getDay()];
        },

        // 随机选择
    random: function(listString) {
            if (!listString) return '';
            var list;
            if (listString.indexOf('::') !== -1) {
                list = listString.split('::');
                } else {
                list = listString.split(',').map(function(s) { return s.trim(); });
            }
        if (list.length === 0) return '';
        return list[Math.floor(Math.random() * list.length)];
        },

    // 骰子
    roll: function(formula) {
        if (!formula) return '';
        formula = formula.trim();
        // 简单的 XdY 格式支持
        var match = formula.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
        if (match) {
            var count = safeInt(match[1], 1);
            var sides = safeInt(match[2], 6);
            var modifier = safeInt(match[3], 0);
            var total = 0;
            for (var i = 0; i < count; i++) {
                total += Math.floor(Math.random() * sides) + 1;
            }
        return String(total + modifier);
        }
    // 纯数字视为 1dX
    if (/^\d+$/.test(formula)) {
        return String(Math.floor(Math.random() * parseInt(formula, 10)) + 1);
    }
    return '';
    },

    // 反转字符串
    reverse: function(text) {
        return text ? text.split('').reverse().join('') : '';
        },

    // 获取用户名
    getUser: function() {
        if (typeof gameState === 'undefined' || !gameState) return '玩家';
        return gameState.playerName || '玩家';
        },

    // 获取角色名（取当前场景中的第一个NPC名或玩家指定名）
    getChar: function() {
        if (typeof gameState === 'undefined' || !gameState) return '角色';
        // 尝试从当前NPC列表获取
        if (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) {
            return gameState.worldSnapshot.characters[0].name || '角色';
        }
        return '角色';
    },

    // 新增：获取角色描述
    getCharDescription: function() {
        if (typeof gameState === 'undefined' || !gameState) return '';
        if (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) {
            return gameState.worldSnapshot.characters[0].desc || '';
        }
        return '';
    },

    // 新增：获取角色性格
    getCharPersonality: function() {
        if (typeof gameState === 'undefined' || !gameState) return '';
        if (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) {
            return gameState.worldSnapshot.characters[0].personality || '';
        }
        return '';
    },

    // 新增：获取场景描述
    getScenario: function() {
        if (typeof gameState === 'undefined' || !gameState) return '';
        if (gameState.worldSnapshot && gameState.worldSnapshot.scenario) {
            return gameState.worldSnapshot.scenario;
        }
        return gameState.userPrompt || '';
    },

    // 获取当前模型名（与 SillyTavern {{model}} 对齐）
    getModel: function() {
        if (typeof LocalGameAPI !== 'undefined' && LocalGameAPI.getCurrentConfig) {
            var cfg = LocalGameAPI.getCurrentConfig();
            if (cfg && cfg.model) return cfg.model;
        }
        if (typeof gameState !== 'undefined' && gameState && gameState._lastModelName) {
            return gameState._lastModelName;
        }
        return '';
    },

    // 获取最后一条用户消息
    getLastUserMessage: function() {
        if (typeof gameState === 'undefined' || !gameState) return '';
        var history = gameState.conversationHistory || [];
        for (var i = history.length - 1; i >= 0; i--) {
            if (history[i].role === 'user') return history[i].content || '';
        }
        return '';
    },

    // 获取最后一条AI消息
    getLastCharMessage: function() {
        if (typeof gameState === 'undefined' || !gameState) return '';
        var history = gameState.conversationHistory || [];
        for (var i = history.length - 1; i >= 0; i--) {
            if (history[i].role === 'assistant') return history[i].content || '';
        }
        return '';
    },

    // 获取最后一条消息
    getLastMessage: function() {
        if (typeof gameState === 'undefined' || !gameState) return '';
        var history = gameState.conversationHistory || [];
        if (history.length > 0) return history[history.length - 1].content || '';
        return '';
        },

    /**
    * 核心方法：处理文本中的所有宏
    * 按照酒馆的执行顺序分三组处理
    * @param {string} text - 要处理的文本
    * @param {object} env - 可选的环境变量覆盖
    * @param {string} env.original - {{original}} 宏的替换值（未经宏处理的原始内容）
    * @param {string} env.user - {{user}} 宏的替换值
    * @param {string} env.char - {{char}} 宏的替换值
    */
    process: function(text, env) {
        if (!text || typeof text !== 'string') return String(text || '');
        // [T1-P1-16] 性能短路：text 中没有任何宏标记（{{ 或 <<）时直接返回，
        // 避免 40+ 次 text.replace 空扫描。保留回退保留 `<<` 兼容旧式标记
        if (text.indexOf('{{') === -1 && text.indexOf('<<') === -1) return text;
        const self = this;
        env = env || {};

        // ===== 第一组：preEnvMacros（环境变量之前执行） =====

        // 1. 旧式标记 <USER> <BOT> <CHAR> <GROUP>
        text = text.replace(/<USER>/gi, function() { return env.user || self.getUser(); });
        text = text.replace(/<(?:BOT|CHAR)>/gi, function() { return env.char || self.getChar(); });
        text = text.replace(/<GROUP>/gi, function() { return env.char || self.getChar(); });

        // 2. 变量宏（最先执行，因为其他宏可能依赖变量值）
        // setvar::name::value
        text = text.replace(/\{\{setvar\s*::\s*([^:]+?)\s*::\s*([\s\S]*?)\}\}/gi, function(_, name, value) {
            return self.setLocalVar(name, value);
            });
        // setglobalvar::name::value
        text = text.replace(/\{\{setglobalvar\s*::\s*([^:]+?)\s*::\s*([\s\S]*?)\}\}/gi, function(_, name, value) {
            return self.setGlobalVar(name, value);
            });
        // addvar::name::value（支持多行值）
        text = text.replace(/\{\{addvar\s*::\s*([^:]+?)\s*::\s*([\s\S]*?)\}\}/gi, function(_, name, value) {
            return self.addVar(name, value);
            });
        // incvar::name
        text = text.replace(/\{\{incvar\s*::\s*([^}]+?)\}\}/gi, function(_, name) {
        return self.incVar(name);
        });
        // decvar::name
        text = text.replace(/\{\{decvar\s*::\s*([^}]+?)\}\}/gi, function(_, name) {
        return self.decVar(name);
        });
    // deletevar::name
    text = text.replace(/\{\{deletevar\s*::\s*([^}]+?)\}\}/gi, function(_, name) {
    return self.deleteVar(name);
    });
    // deleteglobalvar::name
    text = text.replace(/\{\{deleteglobalvar\s*::\s*([^}]+?)\}\}/gi, function(_, name) {
    return self.deleteGlobalVar(name);
    });

    // 3. 基础工具宏
    text = text.replace(/\{\{newline\}\}/gi, '\n');
    text = text.replace(/(?:\r?\n)*\{\{trim\}\}(?:\r?\n)*/gi, '');
    text = text.replace(/\{\{noop\}\}/gi, '');

    // ===== 新增：变量简写支持（必须在 setvar 之后，getvar 之前）=====
    // {{.varname}} - 获取局部变量简写
    // {{.varname = value}} - 设置局部变量简写
    // {{$varname}} - 获取全局变量简写
    // {{$varname = value}} - 设置全局变量简写
    // {{.varname++}} / {{.varname--}} - 递增/递减
    // {{.varname || fallback}} - 如果变量为空则使用fallback
    text = this._processVariableShorthand(text);

    // ===== 第二组：envMacros（环境变量） =====
    // 添加缺少的关键宏
    text = text.replace(/\{\{user\}\}/gi, function() { return env.user || self.getUser(); });
    text = text.replace(/\{\{char\}\}/gi, function() { return env.char || self.getChar(); });
    // {{original}} - 原始内容（未经宏处理的内容，用于包含COT标签发送给AI）
    text = text.replace(/\{\{original\}\}/gi, function() { return env.original || ''; });
    // {{raw:text}} - 原始文本（跳过宏处理）
    text = text.replace(/\{\{raw\s*::\s*([\s\S]*?)\}\}/gi, function(_, rawText) { return rawText; });

    // 新增关键宏（与SillyTavern一致）
    // {{input}} - 用户最后输入的内容
    text = text.replace(/\{\{input\}\}/gi, function() { return env.input || self.getLastUserMessage(); });
    // {{lastMessage}} - 最后一条消息的内容
    text = text.replace(/\{\{lastMessage\}\}/gi, function() { return env.lastMessage || self.getLastMessage(); });
    // {{lastUserMessage}} - 最后一条用户消息
    text = text.replace(/\{\{lastUserMessage\}\}/gi, function() { return env.lastUserMessage || self.getLastUserMessage(); });
    // {{lastCharMessage}} - 最后一条AI消息
    text = text.replace(/\{\{lastCharMessage\}\}/gi, function() { return env.lastCharMessage || self.getLastCharMessage(); });
    // {{description}} - 角色描述
    text = text.replace(/\{\{description\}\}/gi, function() { return env.description || self.getCharDescription(); });
    // {{personality}} - 角色性格
    text = text.replace(/\{\{personality\}\}/gi, function() { return env.personality || self.getCharPersonality(); });
    // {{scenario}} - 场景描述
    text = text.replace(/\{\{scenario\}\}/gi, function() { return env.scenario || self.getScenario(); });

    // ===== 第三组：postEnvMacros（环境变量之后执行） =====

    // getvar::name（在 setvar 之后执行）
    text = text.replace(/\{\{getvar\s*::\s*([^}]+?)\}\}/gi, function(_, name) {
    return self.getLocalVar(name);
    });
    // getglobalvar::name
    text = text.replace(/\{\{getglobalvar\s*::\s*([^}]+?)\}\}/gi, function(_, name) {
    return self.getGlobalVar(name);
    });
    // hasvar::name
    text = text.replace(/\{\{hasvar\s*::\s*([^}]+?)\}\}/gi, function(_, name) {
    return self.hasVar(name);
    });
    // hasglobalvar::name
    text = text.replace(/\{\{hasglobalvar\s*::\s*([^}]+?)\}\}/gi, function(_, name) {
    return self.hasGlobalVar(name);
    });

    // 时间日期宏
    text = text.replace(/\{\{time\}\}/gi, function() { return self.time(); });
    text = text.replace(/\{\{date\}\}/gi, function() { return self.date(); });
    text = text.replace(/\{\{weekday\}\}/gi, function() { return self.weekday(); });
    text = text.replace(/\{\{isotime\}\}/gi, function() { return self.time(); });
    text = text.replace(/\{\{isodate\}\}/gi, function() { return self.date(); });
    // {{timestamp:FORMAT}}
    text = text.replace(/\{\{timestamp\s*:\s*([^}]+?)\}\}/gi, function(_, fmt) {
    return self.timestamp(fmt);
    });
    // {{datetimeformat FORMAT}}
    text = text.replace(/\{\{datetimeformat\s+([^}]+?)\}\}/gi, function(_, fmt) {
    return self.timestamp(fmt);
    });
    // {{time_UTC+X}}
    text = text.replace(/\{\{time_UTC([-+]\d+)\}\}/gi, function(_, offset) {
        var d = new Date();
        var utc = d.getTime() + d.getTimezoneOffset() * 60000;
        var target = new Date(utc + parseInt(offset, 10) * 3600000);
        return String(target.getHours()).padStart(2, '0') + ':' + String(target.getMinutes()).padStart(2, '0');
        });

    // UUID
    text = text.replace(/\{\{uuid\}\}/gi, function() { return self.uuid(); });

    // {{pick::a::b::c}} 稳定随机（基于内容哈希）
    text = text.replace(/\{\{pick\s*::\s*([\s\S]*?)\}\}/gi, function(_, listStr) {
        return self.random(listStr); // 简化实现，使用随机
        });

    // 骰子
    text = text.replace(/\{\{roll\s*:\s*([^}]+?)\}\}/gi, function(_, formula) {
    return self.roll(formula);
    });
    text = text.replace(/\{\{roll\s+([^}]+?)\}\}/gi, function(_, formula) {
    return self.roll(formula);
    });

    // 反转字符串
    text = text.replace(/\{\{reverse\s*::\s*([^}]+?)\}\}/gi, function(_, str) {
    return self.reverse(str);
    });

    // 注释宏（最后执行）
    text = text.replace(/\{\{\/\/([\s\S]*?)\}\}/gm, '');

    // [T1-P1-15] 补 4 个酒馆核心宏（idle_duration/lastMessageId/mesId/last_message）
    // {{last_message}} - 最后一条消息（任意角色）
    text = text.replace(/\{\{last_message\}\}/gi, function() {
        return self.getLastMessage ? self.getLastMessage() : (env.lastMessage || '');
        });
    // {{lastMessageId}} - 最后一条消息的 ID（酒馆专用）
    text = text.replace(/\{\{lastMessageId\}\}/gi, function() {
        if (typeof gameState === 'undefined' || !gameState) return '0';
        var history = gameState.conversationHistory || [];
        return history.length > 0 ? String(history.length - 1) : '0';
        });
    // {{mesId}} - 等价 lastMessageId
    text = text.replace(/\{\{mesId\}\}/gi, function() {
        if (typeof gameState === 'undefined' || !gameState) return '0';
        var history = gameState.conversationHistory || [];
        return history.length > 0 ? String(history.length - 1) : '0';
        });
    // {{idle_duration}} - 距离上次聊天时间（人类可读：5m / 2h / 3d）
    text = text.replace(/\{\{idle_duration\}\}/gi, function() {
        if (typeof gameState === 'undefined' || !gameState) return '0m';
        var lastTs = gameState._lastMessageTime || gameState.lastMessageTime;
        if (!lastTs) return '0m';
        var diff = Date.now() - Number(lastTs);
        if (diff < 60000) return Math.floor(diff / 1000) + 's';
        if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
        if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
        return Math.floor(diff / 86400000) + 'd';
        });

    // {{model}} - 当前正在使用的模型名（酒馆角色卡/预设常用）
    text = text.replace(/\{\{model\}\}/gi, function() {
        return env.model || self.getModel();
    });

    // ===== 补全酒馆常用宏 =====

    // 字符串操作宏
    text = text.replace(/\{\{uppercase\s*::\s*([^}]+?)\}\}/gi, function(_, t) { return (t||'').toUpperCase(); });
    text = text.replace(/\{\{lowercase\s*::\s*([^}]+?)\}\}/gi, function(_, t) { return (t||'').toLowerCase(); });
    text = text.replace(/\{\{strlen\s*::\s*([^}]+?)\}\}/gi, function(_, t) { return String((t||'').length); });
    text = text.replace(/\{\{substring\s*::\s*([^:]+?)\s*::\s*(\d+)\s*::\s*(\d+)\s*\}\}/gi, function(_, t, s, e) { return (t||'').substring(parseInt(s, 10), parseInt(e, 10)); });
    text = text.replace(/\{\{replace\s*::\s*([^:]+?)\s*::\s*([^:]+?)\s*::\s*([^}]*?)\}\}/gi, function(_, t, f, r) { return (t||'').split(f).join(r); });

    // 数学运算宏
    text = text.replace(/\{\{min\s*::\s*([^:]+?)\s*::\s*([^}]+?)\}\}/g, function(_, a, b) { return String(Math.min(parseFloat(a)||0, parseFloat(b)||0)); });
    text = text.replace(/\{\{max\s*::\s*([^:]+?)\s*::\s*([^}]+?)\}\}/g, function(_, a, b) { return String(Math.max(parseFloat(a)||0, parseFloat(b)||0)); });
    text = text.replace(/\{\{abs\s*::\s*([^}]+?)\}\}/g, function(_, n) { return String(Math.abs(parseFloat(n)||0)); });
    text = text.replace(/\{\{round\s*::\s*([^}]+?)\}\}/g, function(_, n) { return String(Math.round(parseFloat(n)||0)); });
    text = text.replace(/\{\{floor\s*::\s*([^}]+?)\}\}/g, function(_, n) { return String(Math.floor(parseFloat(n)||0)); });
    text = text.replace(/\{\{ceil\s*::\s*([^}]+?)\}\}/g, function(_, n) { return String(Math.ceil(parseFloat(n)||0)); });

    // 角色信息宏
    text = text.replace(/\{\{persona\}\}/gi, function() { return (typeof gameState !== 'undefined' && gameState.playerPersona) || ''; });
    text = text.replace(/\{\{user_persona\}\}/gi, function() { return (typeof gameState !== 'undefined' && gameState.playerPersona) || ''; });
    text = text.replace(/\{\{char_persona\}\}/gi, function() {
        var chars = (typeof gameState !== 'undefined' && gameState.worldSnapshot && gameState.worldSnapshot.characters) || [];
        return chars.length > 0 ? (chars[0].personality || '') : '';
        });
    text = text.replace(/\{\{model\}\}/gi, function() { return (typeof gameState !== 'undefined' && gameState._currentModel) || ''; });
    text = text.replace(/\{\{chatSize\}\}/gi, function() { return String((typeof gameState !== 'undefined' && gameState.conversationHistory) ? gameState.conversationHistory.length : 0); });
    text = text.replace(/\{\{chatIndex\}\}/gi, function() { return String((typeof gameState !== 'undefined' && gameState.conversationHistory) ? gameState.conversationHistory.length : 0); });
    text = text.replace(/\{\{output\}\}/gi, function() { return (typeof gameState !== 'undefined' && gameState._lastAIOutput) || ''; });
    text = text.replace(/\{\{slot\}\}/gi, function() { return String((typeof gameState !== 'undefined' && gameState.currentSlot != null) ? gameState.currentSlot : 0); });
    text = text.replace(/\{\{charCard\}\}/gi, function() {
        var chars = (typeof gameState !== 'undefined' && gameState.worldSnapshot && gameState.worldSnapshot.characters) || [];
        if (chars.length > 0) { var c = chars[0]; return [c.desc||'', c.personality||'', c.scenario||''].filter(Boolean).join('\n'); }
        return '';
        });
    text = text.replace(/\{\{example_message\}\}/gi, function() {
        var chars = (typeof gameState !== 'undefined' && gameState.worldSnapshot && gameState.worldSnapshot.characters) || [];
        return chars.length > 0 ? (chars[0].mes_example || '') : '';
        });

    // 比较宏
    text = text.replace(/\{\{eq\s*::\s*([^:]+?)\s*::\s*([^}]+?)\}\}/gi, function(_, a, b) { return a === b ? 'true' : 'false'; });

    // 角色变量宏
    text = text.replace(/\{\{setcharvar\s*::\s*([^:]+?)\s*::\s*([^}]*?)\}\}/gi, function(_, name, val) {
    if(typeof gameState !== 'undefined') { if(!gameState._charVars) gameState._charVars = {}; gameState._charVars[name] = val; }
    return '';
    });
    text = text.replace(/\{\{getcharvar\s*::\s*([^}]+?)\}\}/gi, function(_, name) {
    return (typeof gameState !== 'undefined' && gameState._charVars && gameState._charVars[name]) || '';
    });

    // 聊天元数据宏
    text = text.replace(/\{\{chatMetadata\s*::\s*([^}]+?)\}\}/gi, function(_, key) {
    var meta = (typeof gameState !== 'undefined' && gameState.chatMetadata) || {};
    return meta[key] !== undefined ? String(meta[key]) : '';
    });

    // 权重随机宏 {{random::w:N:选项A::w:M:选项B::选项C}}
    text = text.replace(/\{\{random\s*::\s*([\s\S]*?)\}\}/gi, function(_, argsStr) {
        var parts = argsStr.split('::').filter(function(s){return s.trim();});
        if (parts.length <= 1) return parts[0] || '';
        var pool = [];
        parts.forEach(function(p) {
            var wMatch = p.match(/^w\s*:\s*(\d+)\s*:\s*(.*)$/);
            if (wMatch) { var w = safeInt(wMatch[1], 1); for (var wi = 0; wi < w; wi++) pool.push(wMatch[2]); }
            else { pool.push(p); }
            });
        return pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : '';
        });

    // ===== 管道宏机制 {{value|pipe1|pipe2|...}} =====
    // 酒馆标准：将前一步的输出作为下一步的输入，支持链式操作
    // 例如 {{getvar::name|uppercase|trim}} 或 {{char|lowercase}}
    text = this._applyPipeMacros(text);

    // ===== 第四组：条件宏 {{if}}...{{/if}} 和 {{else}} =====
    // 处理 scoped if（多行格式）
    text = this._processScopedConditionals(text);

    // 清理残留的未识别宏（可选：保留原样或清空）
    // 这里选择保留原样，避免误删内容

    return text;
    },

    /**
    * 处理条件宏 {{if condition}}...{{/if}} 和 {{if condition}}...{{else}}...{{/if}}
    * 支持多行 scoped 格式
    */
    _processScopedConditionals: function(text) {
        const self = this;
        // 【根因修复 3】原 maxIterations=50 + 正则 \/? 让 {{if}} 误判为闭合标签，
        // 导致每次循环只消解一层嵌套。未闭合 {{if}} 时全文扫描 50 次 = O(50×n)。
        // 改为 maxIterations=15（实际嵌套深度极少超过 10）+ 强制闭合标签必须有斜杠。
        var maxIterations = 15;
        var iterations = 0;
        // 【第八轮 7.1+7.2】总循环计时 + 单次 replace 软超时（5s 总 / 2s 单次）
        // 当 AI 输出畸形 {{if}} 嵌套时，单次 replace 的双 [\s\S]*? 仍可能回溯
        var _loopStartTime = Date.now();
        var _LOOP_TOTAL_TIMEOUT_MS = 5000;

        while (iterations < maxIterations) {
            // 总循环超时保护
            if (Date.now() - _loopStartTime > _LOOP_TOTAL_TIMEOUT_MS) {
                console.warn('[SafeRegex] _processScopedConditionals 总循环超时('
                    + (Date.now() - _loopStartTime) + 'ms/' + _LOOP_TOTAL_TIMEOUT_MS
                    + 'ms), iterations=' + iterations + ', inLen=' + (text ? text.length : 0));
                break;
            }
            var newText = text;
            var _iterStartTime = Date.now();

            // 【P0 根因修复】用 indexOf 线性扫描替代双 [\s\S]*? 正则
            // 原正则 /\{\{\s*if\s+([\s\S]*?)\s*\}\}([\s\S]*?)\{\{\s*\/\s*if\s*\}\}/gi
            // 有两个 [\s\S]*? 串联，当 {{if}} 没有配对 {{/if}} 时会导致灾难性回溯
            var _condCallback = function(match, condition, body) {
                // 在body中查找同级{{else}}（跳过嵌套{{if}}）
                var elseIdx = -1;
                var depth = 0;
                var pos = 0;
                var lowerBody = body.toLowerCase();
                while (pos < lowerBody.length) {
                    var ifPos = lowerBody.indexOf('{{if', pos);
                    var endIfPos = lowerBody.indexOf('{{/if', pos);
                    var elsePos = lowerBody.indexOf('{{else', pos);
                    if (endIfPos === -1) break;
                    var nearest = endIfPos;
                    if (ifPos !== -1 && ifPos < nearest) nearest = ifPos;
                    if (elsePos !== -1 && elsePos < nearest) nearest = elsePos;
                    if (nearest === ifPos) { depth++; pos = ifPos + 5; }
                    else if (nearest === endIfPos) {
                        if (depth > 0) { depth--; pos = endIfPos + 5; }
                        else break;
                    } else if (nearest === elsePos && depth === 0) {
                        elseIdx = elsePos; pos = elsePos + 7;
                    } else { pos = nearest + 5; }
                }

                var trueContent, falseContent;
                if (elseIdx >= 0) {
                    trueContent = body.substring(0, elseIdx);
                    falseContent = body.substring(elseIdx + 7);
                    var elseEnd = falseContent.indexOf('}}');
                    if (elseEnd >= 0) falseContent = falseContent.substring(elseEnd + 2);
                } else {
                    trueContent = body;
                    falseContent = '';
                }

                condition = condition.trim();
                var isTrue = self._evaluateCondition(condition);
                return isTrue ? trueContent : falseContent;
            };

            // 【P0 修复】indexOf 线性扫描找最内层 {{if}}...{{/if}} 配对
            // 从左到右扫描，维护嵌套深度，找到深度归零的配对
            newText = self._replaceInnermostIfPair(text, _condCallback);

            // 单次迭代超时检测
            var _iterElapsed = Date.now() - _iterStartTime;
            if (_iterElapsed > 2000) {
                console.warn('[SafeRegex] _processScopedConditionals#' + iterations
                    + ' 单次耗时 ' + _iterElapsed + 'ms (inLen=' + (text ? text.length : 0) + ')');
            }

            if (newText === text) break;
            text = newText;
            iterations++;
        }

        // 总耗时日志（超过 200ms 才打印，避免正常路径噪音）
        var _totalElapsed = Date.now() - _loopStartTime;
        if (_totalElapsed >= 200) {
            console.log('[SafeRegex] _processScopedConditionals 总耗时 ' + _totalElapsed
                + 'ms (iterations=' + iterations + ', inLen=' + (text ? text.length : 0) + ')');
        }

        return text;
    },

    /**
    * 【P0 根因修复】用 indexOf 线性扫描找最内层 {{if}}...{{/if}} 配对并替换
    * 替代双 [\s\S]*? 正则，复杂度 O(n)，无回溯风险
    * @param {string} text 原始文本
    * @param {function} callback 回调函数(match, condition, body) => 替换文本
    * @returns {string} 替换后的文本（如果没有匹配则返回原文）
    */
    _replaceInnermostIfPair: function(text, callback) {
        if (!text || text.length < 8) return text;
        var lowerText = text.toLowerCase();
        var pos = 0;
        var len = text.length;

        // 第一遍：找到所有 {{if 和 {{/if 的位置，维护深度
        // 从左到右找第一个 {{if，然后找配对的 {{/if（深度归零）
        var ifStart = lowerText.indexOf('{{if', pos);
        // 排除 {{/if}} 的误匹配（indexOf('{{if') 会匹配 '{{/if' 的 '{{i' 部分？不会，因为 '{{if' 的第3个字符是 'i'，而 '{{/' 的第2个字符是 '/'
        // 但需要确认 {{if 后面不是 / 字符
        while (ifStart !== -1) {
            // 检查是否是 {{/if（跳过）
            var charAfterIf = ifStart + 2 < len ? text.charAt(ifStart + 2) : '';
            if (charAfterIf === '/') {
                ifStart = lowerText.indexOf('{{if', ifStart + 1);
                continue;
            }
            // 确认是 {{if 开头（后面需要跟空白或字母）
            // 找到 }} 闭合
            var ifClose = text.indexOf('}}', ifStart + 4);
            if (ifClose === -1) break;

            // 提取 condition：{{if condition}}
            var ifInner = text.slice(ifStart + 2, ifClose); // "if condition"
            // 验证是 "if" 开头（可能有空白）
            var ifInnerTrimmed = ifInner.replace(/^\s*/, '');
            if (ifInnerTrimmed.slice(0, 2).toLowerCase() !== 'if' ||
                (ifInnerTrimmed.length > 2 && ifInnerTrimmed.charAt(2) !== ' ' && ifInnerTrimmed.charAt(2) !== '\t' && ifInnerTrimmed.charAt(2) !== '\n')) {
                // 不是 {{if 条件，跳过
                ifStart = lowerText.indexOf('{{if', ifStart + 1);
                continue;
            }
            var condition = ifInnerTrimmed.slice(2).trim(); // 去掉 "if" 前缀

            // 从 ifClose+2 开始找配对的 {{/if}}，维护嵌套深度
            var depth = 1;
            var searchPos = ifClose + 2;
            var endIfIdx = -1;
            while (searchPos < len) {
                var nextIf = lowerText.indexOf('{{if', searchPos);
                var nextEndIf = lowerText.indexOf('{{/if', searchPos);

                if (nextEndIf === -1) break; // 没有闭合标签

                if (nextIf !== -1 && nextIf < nextEndIf) {
                    // 检查 nextIf 是否是 {{/if（避免误匹配）
                    var c = text.charAt(nextIf + 2);
                    if (c !== '/') {
                        depth++;
                    }
                    searchPos = nextIf + 4;
                } else {
                    // 找到 {{/if
                    depth--;
                    if (depth === 0) {
                        endIfIdx = nextEndIf;
                        break;
                    }
                    searchPos = nextEndIf + 5;
                }
            }

            if (endIfIdx === -1) {
                // 没有配对的 {{/if}}，跳过这个 {{if
                ifStart = lowerText.indexOf('{{if', ifStart + 1);
                continue;
            }

            // 找到 {{/if}} 的闭合 }}
            var endIfClose = text.indexOf('}}', endIfIdx);
            if (endIfClose === -1) {
                ifStart = lowerText.indexOf('{{if', ifStart + 1);
                continue;
            }

            // 提取 body
            var body = text.slice(ifClose + 2, endIfIdx);
            var fullMatch = text.slice(ifStart, endIfClose + 2);

            // 调用回调函数
            var replacement = callback(fullMatch, condition, body);

            // 替换并返回
            return text.slice(0, ifStart) + replacement + text.slice(endIfClose + 2);
        }

        return text; // 没有找到任何配对
    },

        /**
        * 评估条件表达式
        * @param {string} condition - 条件表达式
        * @returns {boolean} - 条件是否为真
        */
    _evaluateCondition: function(condition) {
            condition = condition.trim();
            if (!condition) return false;

            // 检查否定 !
            var isNegated = false;
            if (condition.startsWith('!')) {
                isNegated = true;
                condition = condition.slice(1).trim();
            }

        var result = false;

        // 检查比较运算符（支持 ==, !=, >, <, >=, <=）
        var compMatch = condition.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
        if (compMatch) {
            var left = this._resolveConditionValue(compMatch[1].trim());
            var op = compMatch[2];
            var right = this._resolveConditionValue(compMatch[3].trim());
            // 尝试数值比较
            var numLeft = Number(left), numRight = Number(right);
            var useNumeric = !isNaN(numLeft) && !isNaN(numRight) && left !== '' && right !== '';
            if (useNumeric) { left = numLeft; right = numRight; }
            switch (op) {
                case '==': result = left == right; break;
                case '!=': result = left != right; break;
                case '>':  result = useNumeric ? left > right : String(left) > String(right); break;
                case '<':  result = useNumeric ? left < right : String(left) < String(right); break;
                case '>=': result = useNumeric ? left >= right : String(left) >= String(right); break;
                case '<=': result = useNumeric ? left <= right : String(left) <= String(right); break;
            }
        }
        // 检查局部变量引用 {{if .varname}}
        else if (/^\.(\w+)$/.test(condition)) {
            var localMatch = condition.match(/^\.(\w+)$/);
            var val = this.getLocalVar(localMatch[1]);
            result = this._isTruthy(val);
        }
    // 检查全局变量引用 {{if $varname}}
    else if (/^\$\w+$/.test(condition)) {
        var val = this.getGlobalVar(condition.slice(1));
        result = this._isTruthy(val);
    }
    // 检查 hasvar
    else if (condition.startsWith('hasvar')) {
        var nameMatch = condition.match(/hasvar\s*::\s*([^}]+)/i);
    if (nameMatch) {
        result = this.hasVar(nameMatch[1]) === 'true';
    }
    }
    // 检查 hasglobalvar
    else if (condition.startsWith('hasglobalvar')) {
        var nameMatch = condition.match(/hasglobalvar\s*::\s*([^}]+)/i);
    if (nameMatch) {
        result = this.hasGlobalVar(nameMatch[1]) === 'true';
    }
    }
    // 检查 getvar
    else if (condition.startsWith('getvar')) {
        var nameMatch = condition.match(/getvar\s*::\s*([^}]+)/i);
    if (nameMatch) {
        var val = this.getLocalVar(nameMatch[1]);
        result = this._isTruthy(val);
    }
    }
    // 检查 getglobalvar
    else if (condition.startsWith('getglobalvar')) {
        var nameMatch = condition.match(/getglobalvar\s*::\s*([^}]+)/i);
    if (nameMatch) {
        var val = this.getGlobalVar(nameMatch[1]);
        result = this._isTruthy(val);
    }
    }
    // 检查内建变量
    else if (condition === 'user') {
        result = this._isTruthy(this.getUser());
    }
    else if (condition === 'char') {
        result = this._isTruthy(this.getChar());
    }
    // 直接值判断
    else {
        result = this._isTruthy(condition);
    }

    // 应用否定
    if (isNegated) result = !result;

    return result;
    },

    // 解析条件表达式中的值（支持变量引用和字面量）
    _resolveConditionValue: function(val) {
        val = val.trim();
        // 去除引号包裹
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            return val.slice(1, -1);
        }
        // 局部变量引用
        if (val.startsWith('.')) {
            var resolved = this.getLocalVar(val.slice(1));
            return resolved !== '' ? resolved : val;
        }
    // 全局变量引用
    if (val.startsWith('$')) {
        var resolved = this.getGlobalVar(val.slice(1));
        return resolved !== '' ? resolved : val;
    }
    // getvar::name
    var gvMatch = val.match(/^getvar\s*::\s*(.+)$/i);
    if (gvMatch) return this.getLocalVar(gvMatch[1]);
    // getglobalvar::name
    var ggvMatch = val.match(/^getglobalvar\s*::\s*(.+)$/i);
    if (ggvMatch) return this.getGlobalVar(ggvMatch[1]);
    return val;
    },

    /**
    * 管道宏处理器 {{value|pipe1|pipe2|...}}
    * 酒馆标准：将前一步的输出作为下一步的输入
    */
    _applyPipeMacros: function(text) {
        const self = this;
        // 匹配 {{...|pipe1|pipe2|...}} 格式（管道符在宏内部）
        // 需要处理嵌套的 :: 分隔符，所以用非贪婪匹配找到最外层的 }}
    text = text.replace(/\{\{([^}]+?\|[^}]+)\}\}/g, function(match, inner) {
    var parts = inner.split('|').map(function(s) { return s.trim(); });
    if (parts.length < 2) return match; // 没有管道符，不处理

    // 第一部分是值（可能包含 :: 分隔的宏参数）
    var value = parts[0];

    // 如果值部分包含未处理的宏引用，先解析
    // 例如 getvar::name 中的 :: 不应被 split('|') 影响
    value = self._resolveMacroValue(value);

    // 依次应用管道操作
    for (var i = 1; i < parts.length; i++) {
        value = self._applySinglePipe(value, parts[i]);
    }
    return value;
    });
    return text;
    },

    // 解析宏值（处理 getvar::name、setglobalvar::name::val 等格式）
    _resolveMacroValue: function(value) {
        const self = this;
        // getvar::name
        value = value.replace(/^getvar\s*::\s*(.+)$/i, function(_, name) {
            return String(self.getLocalVar(name));
            });
        // getglobalvar::name
        value = value.replace(/^getglobalvar\s*::\s*(.+)$/i, function(_, name) {
            return String(self.getGlobalVar(name));
            });
        return value;
        },

    // 应用单个管道操作
    _applySinglePipe: function(value, pipe) {
        var p = pipe.trim().toLowerCase();
        var arg = '';
        // 提取管道参数（如 trim::xxx 中的 xxx）
        var argMatch = pipe.trim().match(/^(\w+)\s*::\s*(.+)$/);
        if (argMatch) {
            p = argMatch[1].toLowerCase();
            arg = argMatch[2].trim();
        }
        switch (p) {
            case 'uppercase': return (value || '').toUpperCase();
            case 'lowercase': return (value || '').toLowerCase();
            case 'trim': return (value || '').trim();
            case 'strlen': return String((value || '').length);
            case 'reverse': return (value || '').split('').reverse().join('');
            case 'abs': return String(Math.abs(parseFloat(value) || 0));
            case 'round': return String(Math.round(parseFloat(value) || 0));
            case 'floor': return String(Math.floor(parseFloat(value) || 0));
            case 'ceil': return String(Math.ceil(parseFloat(value) || 0));
            case 'replace':
            // replace::from::to
            var rParts = arg.split('::');
            if (rParts.length >= 2) return (value || '').split(rParts[0]).join(rParts[1]);
            return value;
            case 'substring':
            // substring::start::end
            var sParts = arg.split('::');
            if (sParts.length >= 2) return (value || '').substring(safeInt(sParts[0], 0), safeInt(sParts[1], 0));
            return value;
            case 'min':
            return String(Math.min(parseFloat(value) || 0, parseFloat(arg) || 0));
            case 'max':
            return String(Math.max(parseFloat(value) || 0, parseFloat(arg) || 0));
            case 'contains':
            return (value || '').includes(arg) ? 'true' : 'false';
            case 'startswith':
            return (value || '').startsWith(arg) ? 'true' : 'false';
            case 'endswith':
            return (value || '').endsWith(arg) ? 'true' : 'false';
            case 'eq':
            return value === arg ? 'true' : 'false';
            case 'chomp':
            return (value || '').replace(/\n+$/, '');
            default: return value; // 未知管道，原样返回
        }
    },

    /**
    * 判断值是否为真
    */
    _isTruthy: function(value) {
        if (value === undefined || value === null) return false;
        if (typeof value === 'boolean') return value;

        var strValue = String(value).trim().toLowerCase();

        // 假值
        if (strValue === '') return false;
        if (strValue === 'false') return false;
        if (strValue === '0') return false;
        if (strValue === 'off') return false;
        if (strValue === 'no') return false;
        if (strValue === 'null') return false;
        if (strValue === 'undefined') return false;

        return true;
        },


    /**
    * 处理变量简写
    * 支持：
    * - {{.varname}} - 获取局部变量
    * - {{$varname}} - 获取全局变量
    * - {{.varname = value}} - 设置局部变量
    * - {{$varname = value}} - 设置全局变量
    * - {{.varname++}} / {{.varname--}} - 递增/递减
    * - {{.varname || fallback}} - 如果变量为空则使用fallback
    */
    _processVariableShorthand: function(text) {
        const self = this;

        // 处理赋值操作符 =（必须先处理，避免与其他操作符冲突）
        // {{.varname = value}}
        text = text.replace(/\{\{\s*\.(\w+)\s*=\s*([\s\S]*?)\}\}/gi, function(_, name, value) {
            self.setLocalVar(name, value);
            return '';
            });
        // {{$varname = value}}
        text = text.replace(/\{\{\s*\$(\w+)\s*=\s*([\s\S]*?)\}\}/gi, function(_, name, value) {
            self.setGlobalVar(name, value);
            return '';
            });

        // 处理 ||= 操作符 (逻辑或赋值)
        // {{.varname ||= fallback}}
        text = text.replace(/\{\{\s*\.(\w+)\s*\|\|=\s*([\s\S]*?)\}\}/gi, function(_, name, fallback) {
            var current = self.getLocalVar(name);
            if (!self._isTruthy(current)) {
                self.setLocalVar(name, fallback);
                return fallback;
            }
        return current;
        });
        // {{$varname ||= fallback}}
        text = text.replace(/\{\{\s*\$(\w+)\s*\|\|=\s*([\s\S]*?)\}\}/gi, function(_, name, fallback) {
            var current = self.getGlobalVar(name);
            if (!self._isTruthy(current)) {
                self.setGlobalVar(name, fallback);
                return fallback;
            }
        return current;
        });

    // 处理 || 操作符 (逻辑或) - 必须在递增递减之前
    // {{.varname || fallback}}
    text = text.replace(/\{\{\s*\.(\w+)\s*\|\|\s*([\s\S]*?)\}\}/gi, function(_, name, fallback) {
        var current = self.getLocalVar(name);
        if (!self._isTruthy(current)) {
            return fallback;
        }
    return current;
    });
    // {{$varname || fallback}}
    text = text.replace(/\{\{\s*\$(\w+)\s*\|\|\s*([\s\S]*?)\}\}/gi, function(_, name, fallback) {
        var current = self.getGlobalVar(name);
        if (!self._isTruthy(current)) {
            return fallback;
        }
    return current;
    });

    // 处理 ++ 操作符
    // {{.varname++}}
    text = text.replace(/\{\{\s*\.(\w+)\+\+\s*\}\}/gi, function(_, name) {
        return self.incVar(name);
        });
    // {{$varname++}}
    text = text.replace(/\{\{\s*\$(\w+)\+\+\s*\}\}/gi, function(_, name) {
        var current = self.getGlobalVar(name) || '0';
        var num = Number(current) || 0;
        var newVal = String(num + 1);
        self.setGlobalVar(name, newVal);
        return newVal;
        });

    // 处理 -- 操作符
    // {{.varname--}}
    text = text.replace(/\{\{\s*\.(\w+)--\s*\}\}/gi, function(_, name) {
        return self.decVar(name);
        });
    // {{$varname--}}
    text = text.replace(/\{\{\s*\$(\w+)--\s*\}\}/gi, function(_, name) {
        var current = self.getGlobalVar(name) || '0';
        var num = Number(current) || 0;
        var newVal = String(num - 1);
        self.setGlobalVar(name, newVal);
        return newVal;
        });

    // 处理 += 操作符
    // {{.varname += n}}
    text = text.replace(/\{\{\s*\.(\w+)\s*\+=\s*([\s\S]*?)\}\}/gi, function(_, name, increment) {
        self.addVar(name, increment);
        return '';
        });
    // {{$varname += n}}
    text = text.replace(/\{\{\s*\$(\w+)\s*\+=\s*([\s\S]*?)\}\}/gi, function(_, name, increment) {
        var current = self.getGlobalVar(name) || '0';
        var numCurrent = Number(current);
        var numIncrement = Number(increment);
        if (!isNaN(numCurrent) && !isNaN(numIncrement)) {
            self.setGlobalVar(name, String(numCurrent + numIncrement));
        }
    return '';
    });

    // 处理 -= 操作符
    // {{.varname -= n}}
    text = text.replace(/\{\{\s*\.(\w+)\s*-=\s*([\s\S]*?)\}\}/gi, function(_, name, decrement) {
        var current = self.getLocalVar(name) || '0';
        var numCurrent = Number(current);
        var numDecrement = Number(decrement);
        if (!isNaN(numCurrent) && !isNaN(numDecrement)) {
            self.setLocalVar(name, String(numCurrent - numDecrement));
        }
    return '';
    });
    // {{$varname -= n}}
    text = text.replace(/\{\{\s*\$(\w+)\s*-=\s*([\s\S]*?)\}\}/gi, function(_, name, decrement) {
        var current = self.getGlobalVar(name) || '0';
        var numCurrent = Number(current);
        var numDecrement = Number(decrement);
        if (!isNaN(numCurrent) && !isNaN(numDecrement)) {
            self.setGlobalVar(name, String(numCurrent - numDecrement));
        }
    return '';
    });

    // 处理简单的获取（最后处理）
    // {{.varname}}
    text = text.replace(/\{\{\s*\.(\w+)\s*\}\}/gi, function(_, name) {
        return self.getLocalVar(name);
        });
    // {{$varname}}
    text = text.replace(/\{\{\s*\$(\w+)\s*\}\}/gi, function(_, name) {
        return self.getGlobalVar(name);
        });

    return text;
    }
};
