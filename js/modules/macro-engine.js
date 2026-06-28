/**
 * 宏引擎
 * 处理提示词中的宏替换（{{user}}、{{char}}、{{.var}}、{{$var}} 等）
 * 管理局部/全局变量（已迁移到 VariableStore，此处保留 API 兼容）
 * 依赖：regex-manager.js（间接，通过 PresetManager 注入）
 * 被依赖：preset-manager.js（prompt 渲染时调用 process）
 */
var MacroEngine = {
    // 局部变量存储（当前游戏会话级别）
    _localVars: {},
    // 全局变量存储（跨会话持久化）
    _globalVars: {},

    init: function() {
        // 【优化】变量系统已迁移到 VariableStore
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
    getTheaterContent: function(theaterType) {
        // 检测各种小剧场变量
        var theaterVars = {
            // 月读预设 - 之愿系列
            '盲盒之愿': this.getLocalVar('盲盒之愿') || this.getLocalVar('blind_box'),
            '每日之愿': this.getLocalVar('每日之愿') || this.getLocalVar('daily'),
            '涩涩之愿': this.getLocalVar('涩涩之愿') || this.getLocalVar('nsfw_wish'),
            '游戏之愿': this.getLocalVar('游戏之愿') || this.getLocalVar('game_wish'),
            '群聊之愿': this.getLocalVar('群聊之愿') || this.getLocalVar('chat_wish'),
            '论坛之愿': this.getLocalVar('论坛之愿') || this.getLocalVar('forum_wish'),
            '幸福之愿': this.getLocalVar('幸福之愿') || this.getLocalVar('happy_wish'),
            '哀伤之愿': this.getLocalVar('哀伤之愿') || this.getLocalVar('sad_wish'),
            '档案之愿': this.getLocalVar('档案之愿') || this.getLocalVar('archive_wish'),
            '快递之愿': this.getLocalVar('快递之愿') || this.getLocalVar('delivery_wish'),
            '播客之愿': this.getLocalVar('播客之愿') || this.getLocalVar('podcast_wish'),
            '购物之愿': this.getLocalVar('购物之愿') || this.getLocalVar('shopping_wish'),
            '桌面之愿': this.getLocalVar('桌面之愿') || this.getLocalVar('desktop_wish'),
            '日程之愿': this.getLocalVar('日程之愿') || this.getLocalVar('schedule_wish'),
            '通知之愿': this.getLocalVar('通知之愿') || this.getLocalVar('notification_wish'),
            '报告之愿': this.getLocalVar('报告之愿') || this.getLocalVar('report_wish'),
            '问卷之愿': this.getLocalVar('问卷之愿') || this.getLocalVar('survey_wish'),

            // 果实预设
            '小剧场规范': this.getLocalVar('小剧场规范'),
            'snow': this.getLocalVar('snow'),
            'emoji_snow': this.getLocalVar('emoji_snow'),
            '论坛小剧场': this.getLocalVar('论坛小剧场'),
            '日常剧场': this.getLocalVar('日常剧场'),
            '后台人生': this.getLocalVar('后台人生'),

            // 蛾摩拉预设
            '小剧场': this.getLocalVar('小剧场'),
            '蛾摩拉': this.getLocalVar('蛾摩拉'), // 作者有话说
            '日程表': this.getLocalVar('日程表'),
            '小夜单人状态': this.getLocalVar('小夜单人状态'),

            // 通用
            '剧场COT': this.getLocalVar('剧场COT'),

            // 【新增】酒馆预设标签识别
            // <gossip> → 论坛
            'gossip': this.getLocalVar('gossip'),
            '八卦': this.getLocalVar('八卦'),
            '论坛': this.getLocalVar('论坛'),

            // <角色手机> → 手机功能
            '角色手机': this.getLocalVar('角色手机'),
            '手机': this.getLocalVar('手机'),
            'phone': this.getLocalVar('phone'),

            // <通用状态> / <古风状态> → 状态面板
            '通用状态': this.getLocalVar('通用状态'),
            '古风状态': this.getLocalVar('古风状态'),
            '状态面板': this.getLocalVar('状态面板'),
            'status': this.getLocalVar('status'),

            // <meow_FM> → 摘要
            'meow_FM': this.getLocalVar('meow_FM'),
            '摘要': this.getLocalVar('摘要'),
            'summary': this.getLocalVar('summary'),

            // <branches> → 选项分支
            'branches': this.getLocalVar('branches'),
            '选项分支': this.getLocalVar('选项分支'),
            '分支': this.getLocalVar('分支'),

            // <echo> → 物品
            'echo': this.getLocalVar('echo'),
            '物品': this.getLocalVar('物品'),
            'items': this.getLocalVar('items'),

            // <ccd> → 文字剧场
            'ccd': this.getLocalVar('ccd'),
            '文字剧场': this.getLocalVar('文字剧场'),
            '剧场': this.getLocalVar('剧场'),

            // 【新增】象牙塔预设 - 更多小剧场类型
            '恋爱之愿': this.getLocalVar('恋爱之愿'),
            '同人之愿': this.getLocalVar('同人之愿'),
            '回忆之愿': this.getLocalVar('回忆之愿'),
            '平行之愿': this.getLocalVar('平行之愿'),
            '美食之愿': this.getLocalVar('美食之愿'),
            '广告之愿': this.getLocalVar('广告之愿'),
            '文学之愿': this.getLocalVar('文学之愿'),
            '恋爱小剧场': this.getLocalVar('恋爱小剧场'),
            '涩涩小剧场': this.getLocalVar('涩涩小剧场'),
            '游戏小剧场': this.getLocalVar('游戏小剧场'),
            '恋爱之塔': this.getLocalVar('恋爱之塔'),
            '涩涩之塔': this.getLocalVar('涩涩之塔'),
            '游戏之塔': this.getLocalVar('游戏之塔'),
            '群聊之塔': this.getLocalVar('群聊之塔'),
            '论坛之塔': this.getLocalVar('论坛之塔'),
            '同人之塔': this.getLocalVar('同人之塔'),
            '八卦之塔': this.getLocalVar('八卦之塔'),
            '回忆之塔': this.getLocalVar('回忆之塔'),
            '平行之塔': this.getLocalVar('平行之塔'),
            '美食之塔': this.getLocalVar('美食之塔'),
            '广告之塔': this.getLocalVar('广告之塔'),
            '报告之塔': this.getLocalVar('报告之塔'),
            '每日之塔': this.getLocalVar('每日之塔'),
            '文学之塔': this.getLocalVar('文学之塔'),
            '哀伤之塔': this.getLocalVar('哀伤之塔'),
            '幸福之塔': this.getLocalVar('幸福之塔'),
            '盲盒之塔': this.getLocalVar('盲盒之塔'),
            'ice': this.getLocalVar('ice'),
            'live': this.getLocalVar('live'),
            'danmu': this.getLocalVar('danmu'),
            'enigma': this.getLocalVar('enigma'),
            'podcast': this.getLocalVar('podcast'),
            'table_Edit': this.getLocalVar('table_Edit'),
            'horae': this.getLocalVar('horae'),
            'horaeevent': this.getLocalVar('horaeevent'),
            '作者有话说': this.getLocalVar('作者有话说'),
            'author_note': this.getLocalVar('author_note'),
            'giggle': this.getLocalVar('giggle'),
            '角色心声': this.getLocalVar('角色心声'),
            'snow_rules': this.getLocalVar('snow_rules'),
            'gossip_rules': this.getLocalVar('gossip_rules'),
            'novel_header': this.getLocalVar('novel_header'),
            'profile': this.getLocalVar('profile'),
            '角色关系': this.getLocalVar('角色关系'),
            'seeds': this.getLocalVar('seeds')
    };

            if (theaterType) {
                return theaterVars[theaterType] || '';
            }
        return theaterVars;
        },

    // 【小剧场融合】解析小剧场内容标签
    parseTheaterContent: function(content) {
        if (!content) return null;

        var result = {
            type: 'unknown',
            title: '',
            content: content,
            html: '',
            data: null // 新增：存储结构化数据
    };

            // 检测 <snow> 标签
            var snowMatch = content.match(/<snow>([\s\S]*?)<\/snow>/i);
            if (snowMatch) {
                result.type = 'snow';
                result.html = snowMatch[1];
                // 提取标题
                var summaryMatch = result.html.match(/<summary>([\s\S]*?)<\/summary>/i);
                if (summaryMatch) {
                    result.title = summaryMatch[1].replace(/<[^>]+>/g, '').trim();
                }
            return result;
        }

        // 检测 <author_note> 标签（蛾摩拉作话）
        var authorMatch = content.match(/<author_note>([\s\S]*?)<\/author_note>/i);
        if (authorMatch) {
            result.type = 'author_note';
            result.html = authorMatch[1];
            var mutteringMatch = result.html.match(/<muttering>([\s\S]*?)<\/muttering>/i);
            if (mutteringMatch) {
                result.content = mutteringMatch[1].trim();
            }
        return result;
    }

    // 检测 <calendar_widget> 标签（日程表）
    var calendarMatch = content.match(/<calendar_widget>([\s\S]*?)<\/calendar_widget>/i);
    if (calendarMatch) {
        result.type = 'calendar';
        result.html = calendarMatch[1];
        return result;
    }

    // 检测 <status_panel> 标签（状态栏）
    var statusMatch = content.match(/<status_panel>([\s\S]*?)<\/status_panel>/i);
    if (statusMatch) {
        result.type = 'status';
        result.html = statusMatch[1];
        return result;
    }

    // 【新增】检测 <gossip> 标签（论坛/八卦）
    var gossipMatch = content.match(/<gossip>([\s\S]*?)<\/gossip>/i);
    if (gossipMatch) {
        result.type = 'gossip';
        result.html = gossipMatch[1];
        result.title = '论坛';
        // 提取帖子列表
        var posts = [];
        var postMatches = result.html.match(/<post[^>]*>([\s\S]*?)<\/post>/gi) || [];
        postMatches.forEach(function(post) {
            var author = (post.match(/author=["']([^"']+)["']/i) || [])[1] || '匿名';
            var title = (post.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
            var body = (post.match(/<body>([\s\S]*?)<\/body>/i) || [])[1] || post.replace(/<[^>]+>/g, '');
            posts.push({ author: author, title: title, content: body, time: Date.now() });  // 【P2-3修复】持久化存时间戳
            });
        if (posts.length === 0) {
            posts.push({ author: '小剧场', content: result.html.replace(/<[^>]+>/g, '').substring(0, 200), time: Date.now() });  // 【P2-3修复】持久化存时间戳
        }
    result.data = { posts: posts };
    return result;
    }

    // 【新增】检测 <角色手机> 标签（手机功能）
    var phoneMatch = content.match(/<角色手机>([\s\S]*?)<\/角色手机>/i);
    if (phoneMatch) {
        result.type = 'phone';
        result.html = phoneMatch[1];
        result.title = '手机';
        // 提取手机应用/消息
        var apps = [];
        var appMatches = result.html.match(/<app[^>]*>([\s\S]*?)<\/app>/gi) || [];
        appMatches.forEach(function(app) {
            var name = (app.match(/name=["']([^"']+)["']/i) || [])[1] || '应用';
            var icon = (app.match(/icon=["']([^"']+)["']/i) || [])[1] || '◇';
            var notification = (app.match(/<notification>([\s\S]*?)<\/notification>/i) || [])[1] || '';
            apps.push({ name: name, icon: icon, notification: notification });
            });
        result.data = { apps: apps };
        return result;
    }

    // 【新增】检测 <通用状态> 标签（状态面板）
    var generalStatusMatch = content.match(/<通用状态>([\s\S]*?)<\/通用状态>/i);
    if (generalStatusMatch) {
        result.type = 'status';
        result.html = generalStatusMatch[1];
        result.title = '角色状态';
        // 提取状态项
        var stats = [];
        var statMatches = result.html.match(/<stat[^>]*>[\s\S]*?<\/stat>/gi) || [];
        statMatches.forEach(function(stat) {
            var name = (stat.match(/name=["']([^"']+)["']/i) || [])[1] || '状态';
            var value = (stat.match(/<value>([\s\S]*?)<\/value>/i) || [])[1] || '';
            var icon = (stat.match(/icon=["']([^"']+)["']/i) || [])[1] || '◇';
            stats.push({ name: name, value: value, icon: icon });
            });
        result.data = { stats: stats };
        return result;
    }

    // 【新增】检测 <古风状态> 标签（古风状态面板）
    var ancientStatusMatch = content.match(/<古风状态>([\s\S]*?)<\/古风状态>/i);
    if (ancientStatusMatch) {
        result.type = 'status';
        result.html = ancientStatusMatch[1];
        result.title = '角色状态';
        // 提取状态项
        var stats = [];
        var statMatches = result.html.match(/<stat[^>]*>[\s\S]*?<\/stat>/gi) || [];
        statMatches.forEach(function(stat) {
            var name = (stat.match(/name=["']([^"']+)["']/i) || [])[1] || '状态';
            var value = (stat.match(/<value>([\s\S]*?)<\/value>/i) || [])[1] || '';
            var icon = (stat.match(/icon=["']([^"']+)["']/i) || [])[1] || '◇';
            stats.push({ name: name, value: value, icon: icon });
            });
        result.data = { stats: stats, ancient: true };
        return result;
    }

    // 【新增】检测 <meow_FM> 标签（摘要）
    var meowFMMatch = content.match(/<meow_FM>([\s\S]*?)<\/meow_FM>/i);
    if (meowFMMatch) {
        result.type = 'summary';
        result.html = meowFMMatch[1];
        result.title = '摘要';
        // 提取摘要内容
        var summaryContent = (result.html.match(/<content>([\s\S]*?)<\/content>/i) || [])[1] || result.html;
        result.data = { summary: summaryContent.replace(/<[^>]+>/g, '').trim() };
        return result;
    }

    // 【新增】检测 <branches> 标签（选项分支）
    var branchesMatch = content.match(/<branches>([\s\S]*?)<\/branches>/i);
    if (branchesMatch) {
        result.type = 'branches';
        result.html = branchesMatch[1];
        result.title = '选项';
        // 提取分支选项
        var options = [];
        var optionMatches = result.html.match(/<option[^>]*>[\s\S]*?<\/option>/gi) || [];
        optionMatches.forEach(function(opt, idx) {
            var text = (opt.match(/<text>([\s\S]*?)<\/text>/i) || [])[1] || opt.replace(/<[^>]+>/g, '');
            var condition = (opt.match(/condition=["']([^"']+)["']/i) || [])[1] || '';
            options.push({ text: text.trim(), condition: condition, index: idx + 1 });
            });
        if (options.length === 0) {
            // 尝试简单解析
            var lines = result.html.split(/\n/).filter(function(l) { return l.trim(); });
            lines.forEach(function(line, idx) {
                options.push({ text: line.replace(/<[^>]+>/g, '').trim(), condition: '', index: idx + 1 });
                });
        }
    result.data = { options: options };
    return result;
    }

    // 【新增】检测 <echo> 标签（物品）
    var echoMatch = content.match(/<echo>([\s\S]*?)<\/echo>/i);
    if (echoMatch) {
        result.type = 'echo';
        result.html = echoMatch[1];
        result.title = '物品';
        // 提取物品列表
        var items = [];
        var itemMatches = result.html.match(/<item[^>]*>[\s\S]*?<\/item>/gi) || [];
        itemMatches.forEach(function(item) {
            var name = (item.match(/name=["']([^"']+)["']/i) || [])[1] || '物品';
            var desc = (item.match(/<desc>([\s\S]*?)<\/desc>/i) || [])[1] || '';
            var icon = (item.match(/icon=["']([^"']+)["']/i) || [])[1] || '🎁';
            var count = parseInt((item.match(/count=["'](\d+)["']/i) || [])[1]) || 1;
            items.push({ name: name, description: desc, icon: icon, count: count });
            });
        if (items.length === 0) {
            items.push({ name: '神秘物品', description: result.html.replace(/<[^>]+>/g, '').substring(0, 100), icon: '🎁', count: 1 });
        }
    result.data = { items: items };
    return result;
    }

    // 【新增】检测 <ccd> 标签（文字剧场）
    var ccdMatch = content.match(/<ccd>([\s\S]*?)<\/ccd>/i);
    if (ccdMatch) {
        result.type = 'ccd';
        result.html = ccdMatch[1];
        result.title = '文字剧场';
        // 提取剧场内容
        var scenes = [];
        var sceneMatches = result.html.match(/<scene[^>]*>[\s\S]*?<\/scene>/gi) || [];
        sceneMatches.forEach(function(scene) {
            var title = (scene.match(/title=["']([^"']+)["']/i) || [])[1] || '';
            var text = (scene.match(/<text>([\s\S]*?)<\/text>/i) || [])[1] || scene.replace(/<[^>]+>/g, '');
            scenes.push({ title: title, text: text.trim() });
            });
        if (scenes.length === 0) {
            result.data = { text: result.html.replace(/<[^>]+>/g, '').trim() };
            } else {
            result.data = { scenes: scenes };
        }
    return result;
    }

    // 【新增】检测 <live> 标签（直播内容）
    var liveMatch = content.match(/<live>\s*([\s\S]*?)\s*<\/live>/i);
    if (liveMatch) {
        result.type = 'live';
        result.html = liveMatch[1];
        result.title = '直播';
        return result;
    }

    // 【新增】检测 <danmu> 标签（弹幕）
    var danmuMatch = content.match(/<danmu>([\s\S]*?)<\/danmu>/i);
    if (danmuMatch) {
        result.type = 'danmu';
        result.html = danmuMatch[1];
        result.title = '弹幕';
        return result;
    }

    // 【新增】检测 <ice> 标签
    var iceMatch = content.match(/<ice>([\s\S]*?)<\/ice>/i);
    if (iceMatch) {
        result.type = 'ice';
        result.html = iceMatch[1];
        return result;
    }

    // 【新增】检测 <enigma> 标签
    var enigmaMatch = content.match(/<enigma>([\s\S]*?)<\/enigma>/i);
    if (enigmaMatch) {
        result.type = 'enigma';
        result.html = enigmaMatch[1];
        result.title = '谜题';
        return result;
    }

    // 【新增】检测 <podcast> 标签（文字标题）
    var podcastMatch = content.match(/<podcast>([\s\S]*?)<\/podcast>/i);
    if (podcastMatch) {
        result.type = 'podcast';
        result.html = podcastMatch[1];
        result.title = '播客';
        return result;
    }

    // 【新增】检测 <novel_header> 标签（小说标题头）
    var novelHeaderMatch = content.match(/<novel_header>([\s\S]*?)<\/novel_header>/i);
    if (novelHeaderMatch) {
        result.type = 'novel_header';
        result.html = novelHeaderMatch[1];
        result.title = '章节标题';
        return result;
    }

    // 【新增】检测 <profile> 标签（角色关系表格）
    var profileMatch = content.match(/<profile>([\s\S]*?)<\/profile>/i);
    if (profileMatch) {
        result.type = 'profile';
        result.html = profileMatch[1];
        result.title = '角色关系';
        return result;
    }

    // 【新增】检测 <giggle> 标签（角色心声）
    var giggleMatch = content.match(/<giggle>([\s\S]*?)<\/giggle>/i);
    if (giggleMatch) {
        result.type = 'giggle';
        result.html = giggleMatch[1];
        result.title = '角色心声';
        result.content = giggleMatch[1].replace(/<[^>]+>/g, '').trim();
        return result;
    }

    // 【新增】检测 <horae> / <horaeevent> 标签（记忆插件）
    var horaeMatch = content.match(/<horaeevent>([\s\S]*?)<\/horaeevent>/i) || content.match(/<horae>([\s\S]*?)<\/horae>/i);
    if (horaeMatch) {
        result.type = 'horae';
        result.html = horaeMatch[1];
        result.title = '记忆';
        return result;
    }

    // 【新增】检测 <tableEdit> / <table_Edit> 标签
    var tableEditMatch = content.match(/<tableEdit>([\s\S]*?)<\/tableEdit>/i) || content.match(/<table_Edit>([\s\S]*?)<\/table_Edit>/i);
    if (tableEditMatch) {
        result.type = 'table';
        result.html = tableEditMatch[1];
        result.title = '表格';
        return result;
    }

    return result;
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
            // 先替换长的再替换短的，避免冲突
            var keys = Object.keys(map).sort(function(a, b) { return b.length - a.length; });
            keys.forEach(function(k) {
                result = result.replace(new RegExp(k, 'g'), map[k]);
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
        return String(Math.floor(Math.random() * parseInt(formula)) + 1);
    }
    return '';
    },

    // 反转字符串
    reverse: function(text) {
        return text ? text.split('').reverse().join('') : '';
        },

    // 获取用户名
    getUser: function() {
        return gameState.playerName || '玩家';
        },

    // 获取角色名（取当前场景中的第一个NPC名或玩家指定名）
    getChar: function() {
        // 尝试从当前NPC列表获取
        if (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) {
            return gameState.worldSnapshot.characters[0].name || '角色';
        }
        return '角色';
    },

    // 新增：获取角色描述
    getCharDescription: function() {
        if (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) {
            return gameState.worldSnapshot.characters[0].desc || '';
        }
        return '';
    },

    // 新增：获取角色性格
    getCharPersonality: function() {
        if (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) {
            return gameState.worldSnapshot.characters[0].personality || '';
        }
        return '';
    },

    // 新增：获取场景描述
    getScenario: function() {
        if (gameState.worldSnapshot && gameState.worldSnapshot.scenario) {
            return gameState.worldSnapshot.scenario;
        }
        return gameState.userPrompt || '';
    },

    // 获取最后一条用户消息
    getLastUserMessage: function() {
        var history = gameState.conversationHistory || [];
        for (var i = history.length - 1; i >= 0; i--) {
            if (history[i].role === 'user') return history[i].content || '';
        }
        return '';
    },

    // 获取最后一条AI消息
    getLastCharMessage: function() {
        var history = gameState.conversationHistory || [];
        for (var i = history.length - 1; i >= 0; i--) {
            if (history[i].role === 'assistant') return history[i].content || '';
        }
        return '';
    },

    // 获取最后一条消息
    getLastMessage: function() {
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
        var target = new Date(utc + parseInt(offset) * 3600000);
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

    // ===== 补全酒馆常用宏 =====

    // 字符串操作宏
    text = text.replace(/\{\{uppercase\s*::\s*([^}]+?)\}\}/gi, function(_, t) { return (t||'').toUpperCase(); });
    text = text.replace(/\{\{lowercase\s*::\s*([^}]+?)\}\}/gi, function(_, t) { return (t||'').toLowerCase(); });
    text = text.replace(/\{\{strlen\s*::\s*([^}]+?)\}\}/gi, function(_, t) { return String((t||'').length); });
    text = text.replace(/\{\{substring\s*::\s*([^:]+?)\s*::\s*(\d+)\s*::\s*(\d+)\s*\}\}/gi, function(_, t, s, e) { return (t||'').substring(parseInt(s), parseInt(e)); });
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
        var maxIterations = 50;
        var iterations = 0;

        while (iterations < maxIterations) {
            var newText = text;

            // 使用非贪婪匹配先处理最内层的 {{if}}...{{/if}}
            // 然后通过while循环逐步处理外层
            newText = text.replace(
            /\{\{\s*if\s+([\s\S]*?)\s*\}\}([\s\S]*?)\{\{\s*\/?\s*if\s*\}\}/gi,
            function(match, condition, body) {
                // 在body中查找同级的{{else}}（跳过嵌套的{{if}}）
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
                                falseContent = body.substring(elseIdx + 7); // 跳过 '{{else'
                                    var elseEnd = falseContent.indexOf('}}');
                                if (elseEnd >= 0) falseContent = falseContent.substring(elseEnd + 2);
                                } else {
                                trueContent = body;
                                falseContent = '';
                            }

                            condition = condition.trim();
                            var isTrue = self._evaluateCondition(condition);
                            return isTrue ? trueContent : falseContent;
                        }
                        );

                        if (newText === text) break;
                        text = newText;
                        iterations++;
                    }

                return text;
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
