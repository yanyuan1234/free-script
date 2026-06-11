/* ====== 深宫帝王录 - 游戏引擎核心 ====== */

class GameEngine {
    constructor() {
        this.state = null;
        this.running = false;
        this.speed = 1;           // 1=正常, 2=快, 3=极快
        this.paused = true;
        this.tickInterval = null;
        this.baseTickMs = 3000;   // 基础时间间隔（毫秒）
        this.listeners = {};      // 事件监听器
        this.pendingChoices = null; // 当前等待选择的事件
    }

    // ====== 初始化游戏 ======
    init(config) {
        const motherRank = RANKS.find(r => r.id === config.motherRank) || RANKS[4];
        const motherPersonality = MOTHER_PERSONALITIES[config.motherPersonality] || MOTHER_PERSONALITIES.buddhist;

        // 随机国家制度
        const nationKeys = Object.keys(NATION_TYPES);
        const nationType = nationKeys[Math.floor(Math.random() * nationKeys.length)];

        // 创建玩家角色
        const playerGender = config.gender;
        const playerTitle = playerGender === 'male' ? '皇子' : '公主';

        // 生成玩家立绘部件
        const playerPortrait = portraitGen.randomParts(playerGender, playerGender === 'male' ? 'prince' : 'princess');

        // 生成母妃
        const motherName = generateName('female');
        const motherPortrait = portraitGen.randomParts('female', config.motherRank);

        // 生成皇帝
        const emperorAge = 30 + Math.floor(Math.random() * 20);

        this.state = {
            // 玩家
            player: {
                name: config.name || (playerGender === 'male' ? '承乾' : '若兰'),
                gender: playerGender,
                title: playerTitle,
                age: 6 + Math.floor(Math.random() * 4), // 6-9岁开局
                portrait: playerPortrait,
                skills: {
                    literature: 1 + Math.floor(Math.random() * 2),
                    strategy: 1,
                    martial: 1,
                    music: 1,
                    medicine: 0,
                    charm: 2 + Math.floor(Math.random() * 2),
                    management: 0,
                    equestrian: 0
                },
                favor: motherRank.favor,      // 圣宠
                prestige: motherRank.level,   // 声望（受母妃位分影响）
                control: 0,                   // 掌控力
                health: 100,
                titles: [playerTitle],
                location: 'palace'
            },

            // 母妃
            mother: {
                name: motherName,
                rank: motherRank,
                personality: config.motherPersonality,
                personalityData: motherPersonality,
                favor: motherRank.favor,
                health: 80 + Math.floor(Math.random() * 20),
                portrait: motherPortrait,
                age: 20 + Math.floor(Math.random() * 10)
            },

            // 皇帝
            emperor: {
                favor: motherRank.favor,
                health: 70 + Math.floor(Math.random() * 30),
                age: emperorAge,
                mood: 'normal', // normal, happy, angry, sad
                attendance: 0   // 连续不上朝天数
            },

            // 时间
            time: {
                year: 1,
                month: config.birthMonth || 1,
                day: config.birthDay || 1,
                shichen: 4, // 辰时（从4开始，即早上7-9点）
                eraName: '开元'
            },

            // 国家
            nation: {
                type: nationType,
                stability: 70 + Math.floor(Math.random() * 20),
                treasury: 50 + Math.floor(Math.random() * 30),
                military: 60 + Math.floor(Math.random() * 20)
            },

            // NPC 列表
            npcs: [],

            // 事件历史
            eventHistory: [],

            // 标记
            flags: {},

            // 统计
            stats: {
                totalEvents: 0,
                totalChoices: 0,
                daysPlayed: 0
            }
        };

        // 生成初始 NPC
        this._generateInitialNPCs();

        return this.state;
    }

    // ====== 生成初始 NPC ======
    _generateInitialNPCs() {
        // 生成其他皇子/公主
        const siblingCount = 2 + Math.floor(Math.random() * 4); // 2-5个兄弟姐妹
        for (let i = 0; i < siblingCount; i++) {
            const gender = Math.random() > 0.5 ? 'male' : 'female';
            const template = gender === 'male' ? NPC_TEMPLATES.prince : NPC_TEMPLATES.princess;
            const personality = generatePersonality(template.personalityPool);
            const name = generateName(gender);
            const portrait = portraitGen.randomParts(gender, gender === 'male' ? 'prince' : 'princess');
            const motherRank = randomRank();

            this.state.npcs.push({
                id: 'sibling_' + i,
                name: name,
                gender: gender,
                title: gender === 'male' ? '皇子' : '公主',
                type: 'sibling',
                personality: personality,
                portrait: portrait,
                age: 5 + Math.floor(Math.random() * 10),
                motherRank: motherRank,
                skills: { ...template.baseSkills },
                relations: {
                    impression: 50 + Math.floor(Math.random() * 30) - 15,
                    compatibility: 50 + Math.floor(Math.random() * 30) - 15,
                    recognition: 50 + Math.floor(Math.random() * 30) - 15
                },
                alive: true
            });
        }

        // 生成几个妃嫔
        const consortCount = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < consortCount; i++) {
            const template = NPC_TEMPLATES.consort;
            const personality = generatePersonality(template.personalityPool);
            const name = generateName('female');
            const rank = randomRank();
            const portrait = portraitGen.randomParts('female', rank.id);

            this.state.npcs.push({
                id: 'consort_' + i,
                name: name,
                gender: 'female',
                title: rank.name,
                type: 'consort',
                personality: personality,
                portrait: portrait,
                rank: rank,
                age: 18 + Math.floor(Math.random() * 15),
                skills: { ...template.baseSkills },
                relations: {
                    impression: 50 + Math.floor(Math.random() * 30) - 15,
                    compatibility: 50 + Math.floor(Math.random() * 30) - 15,
                    recognition: 50 + Math.floor(Math.random() * 30) - 15
                },
                alive: true
            });
        }

        // 生成贴身宫女/太监
        const servantName = generateName(Math.random() > 0.5 ? 'female' : 'male');
        const servantGender = Math.random() > 0.5 ? 'female' : 'male';
        this.state.npcs.push({
            id: 'servant_main',
            name: servantName,
            gender: servantGender,
            title: servantGender === 'female' ? '贴身宫女' : '贴身太监',
            type: 'servant',
            personality: 'loyal',
            portrait: portraitGen.randomParts(servantGender, 'servant'),
            age: 10 + Math.floor(Math.random() * 5),
            skills: { charm: 2, management: 2 },
            relations: {
                impression: 70,
                compatibility: 60,
                recognition: 50
            },
            alive: true,
            isMainServant: true
        });
    }

    // ====== 时间推进 ======
    tick() {
        if (this.paused || this.pendingChoices) return;

        const time = this.state.time;

        // 推进时辰
        time.shichen++;
        if (time.shichen >= 12) {
            time.shichen = 0;
            time.day++;
            this.state.stats.daysPlayed++;

            // 每日效果
            this._dailyEffects();

            if (time.day > 30) {
                time.day = 1;
                time.month++;
                // 每月效果
                this._monthlyEffects();

                if (time.month > 12) {
                    time.month = 1;
                    time.year++;
                    // 每年效果
                    this._yearlyEffects();
                }
            }
        }

        // 触发事件
        this._processEvents();

        // 通知 UI 更新
        this.emit('tick', this.state);
    }

    // 每日效果
    _dailyEffects() {
        const s = this.state;

        // 皇帝不上朝计数
        if (s.player.location !== 'court') {
            s.emperor.attendance++;
        } else {
            s.emperor.attendance = Math.max(0, s.emperor.attendance - 1);
        }

        // 掌控力衰减
        if (s.emperor.attendance > 3) {
            s.player.control = Math.max(0, s.player.control - 1);
        }

        // 技能自然增长（极慢）
        const skillKeys = Object.keys(s.player.skills);
        const randomSkill = skillKeys[Math.floor(Math.random() * skillKeys.length)];
        if (Math.random() < 0.1) {
            s.player.skills[randomSkill] = Math.min(10, s.player.skills[randomSkill] + 1);
        }

        // 年龄增长（每年一次，简化为每360天）
        if (s.stats.daysPlayed % 360 === 0) {
            s.player.age++;
            s.mother.age++;
            this.emit('ageUp', s.player.age);
        }
    }

    // 每月效果
    _monthlyEffects() {
        const s = this.state;

        // 国家稳定度波动
        s.nation.stability += Math.floor(Math.random() * 5) - 2;
        s.nation.stability = Math.max(0, Math.min(100, s.nation.stability));

        // 母妃圣宠波动
        const personalityEffect = s.mother.personalityData.effects.favorGain;
        s.mother.favor += Math.floor((Math.random() * 6 - 2) * personalityEffect);
        s.mother.favor = Math.max(0, Math.min(100, s.mother.favor));
    }

    // 每年效果
    _yearlyEffects() {
        const s = this.state;

        // 皇帝健康衰减
        s.emperor.health -= Math.floor(Math.random() * 3);
        s.emperor.health = Math.max(0, Math.min(100, s.emperor.health));

        // 国库波动
        s.nation.treasury += Math.floor(Math.random() * 10) - 3;
        s.nation.treasury = Math.max(0, Math.min(100, s.nation.treasury));
    }

    // ====== 事件处理 ======
    _processEvents() {
        if (this.pendingChoices) return;

        // 根据权重随机选择事件
        const eligible = EVENT_POOL.filter(event => this._checkConditions(event));
        if (eligible.length === 0) return;

        // 加权随机
        const totalWeight = eligible.reduce((sum, e) => sum + e.weight, 0);
        let r = Math.random() * totalWeight;
        let selected = eligible[0];
        for (const event of eligible) {
            r -= event.weight;
            if (r <= 0) { selected = event; break; }
        }

        // 处理事件文本替换
        let text = selected.text;
        text = this._replaceTemplates(text);

        // 记录事件
        const eventRecord = {
            id: selected.id,
            name: selected.name,
            text: text,
            time: this._formatTime(),
            type: selected.type,
            hidden: selected.hidden || false
        };

        this.state.eventHistory.push(eventRecord);
        this.state.stats.totalEvents++;

        // 如果有选择，暂停并等待
        if (selected.choices && selected.choices.length > 0) {
            this.pendingChoices = {
                event: selected,
                record: eventRecord
            };
            this.emit('choice', this.pendingChoices);
        } else {
            this.emit('event', eventRecord);
        }
    }

    // 检查事件条件
    _checkConditions(event) {
        const cond = event.conditions;
        if (!cond) return true;

        const s = this.state;

        if (cond.minAge && s.player.age < cond.minAge) return false;
        if (cond.motherRankMax) {
            const maxRank = RANKS.find(r => r.id === cond.motherRankMax);
            if (maxRank && s.mother.rank.level > maxRank.level) return false;
        }
        if (cond.flag && !s.flags[cond.flag]) return false;

        return true;
    }

    // 模板替换
    _replaceTemplates(text) {
        const s = this.state;

        // {motherLine:greeting} 等
        text = text.replace(/\{motherLine:(\w+)\}/g, (match, key) => {
            const lines = s.mother.personalityData.lines;
            return lines[key] || match;
        });

        return text;
    }

    // 做出选择
    makeChoice(choiceIndex) {
        if (!this.pendingChoices) return;

        const { event, record } = this.pendingChoices;
        const choice = event.choices[choiceIndex];
        if (!choice) return;

        const s = this.state;

        // 应用效果
        if (choice.effects) {
            this._applyEffects(choice.effects);
        }

        // 处理条件检查结果
        let resultText = choice.result;
        if (choice.conditionCheck) {
            const conditionMet = this._checkChoiceCondition(choice.conditionCheck);
            if (!conditionMet && choice.resultAlt) {
                resultText = choice.resultAlt;
            }
        }

        // 模板替换
        resultText = this._replaceTemplates(resultText);

        // 记录选择结果
        record.choice = choice.text;
        record.result = resultText;

        // 设置标记
        if (choice.setFlag) {
            s.flags[choice.setFlag] = true;
        }

        // 生成NPC
        if (choice.spawnNPC) {
            this._spawnNPCFromChoice(choice);
        }

        s.stats.totalChoices++;

        // 清除等待状态
        this.pendingChoices = null;

        this.emit('choiceResult', { record, choice });

        // 如果有后续事件
        if (choice.followUp) {
            const followUp = EVENT_POOL.find(e => e.id === choice.followUp);
            if (followUp) {
                setTimeout(() => {
                    const followRecord = {
                        id: followUp.id,
                        name: followUp.name,
                        text: this._replaceTemplates(followUp.text),
                        time: this._formatTime(),
                        type: followUp.type
                    };
                    this.state.eventHistory.push(followRecord);
                    this.emit('event', followRecord);
                }, 1500);
            }
        }
    }

    // 检查选择条件
    _checkChoiceCondition(check) {
        const s = this.state;
        if (check.servantSmart) {
            const mainServant = s.npcs.find(n => n.isMainServant);
            return mainServant && mainServant.skills.management >= 3;
        }
        if (check.motherPersonality) {
            return s.mother.personality === check.motherPersonality;
        }
        if (check.favorHigh) {
            return s.player.favor >= 60;
        }
        return true;
    }

    // 应用效果
    _applyEffects(effects) {
        const s = this.state;
        for (const [key, value] of Object.entries(effects)) {
            if (key in s.player.skills) {
                s.player.skills[key] = Math.max(0, Math.min(10, s.player.skills[key] + value));
            } else if (key === 'favor') {
                s.player.favor = Math.max(0, Math.min(100, s.player.favor + value));
            } else if (key === 'prestige') {
                s.player.prestige = Math.max(0, Math.min(100, s.player.prestige + value));
            } else if (key === 'control') {
                s.player.control = Math.max(0, Math.min(100, s.player.control + value));
            } else if (key === 'health') {
                s.player.health = Math.max(0, Math.min(100, s.player.health + value));
            }
        }
    }

    // 从选择生成NPC
    _spawnNPCFromChoice(choice) {
        const type = choice.npcType || 'servant';
        const template = NPC_TEMPLATES[type];
        if (!template) return;

        const gender = template.gender;
        const name = generateName(gender);
        const personality = generatePersonality(template.personalityPool);
        const portrait = portraitGen.randomParts(gender, type);

        const npc = {
            id: type + '_' + Date.now(),
            name: name,
            gender: gender,
            title: template.title,
            type: type,
            personality: personality,
            portrait: portrait,
            age: 14 + Math.floor(Math.random() * 10),
            skills: { ...template.baseSkills },
            relations: {
                impression: 60 + Math.floor(Math.random() * 20),
                compatibility: 50 + Math.floor(Math.random() * 20),
                recognition: 40 + Math.floor(Math.random() * 20)
            },
            alive: true
        };

        this.state.npcs.push(npc);
        this.emit('npcSpawn', npc);
    }

    // ====== 时间格式化 ======
    _formatTime() {
        const t = this.state.time;
        return `${t.eraName}${this._yearStr(t.year)}年${MONTHS[t.month - 1]}月${this._dayStr(t.day)}日 ${SHICHEN[t.shichen].name}`;
    }

    _yearStr(year) {
        const nums = ['零','元','二','三','四','五','六','七','八','九','十'];
        if (year <= 10) return nums[year];
        if (year < 20) return '十' + nums[year - 10];
        if (year < 100) return nums[Math.floor(year / 10)] + '十' + (year % 10 ? nums[year % 10] : '');
        return String(year);
    }

    _dayStr(day) {
        const prefix = ['初','初','初','初','初','初','初','初','初','初',
                        '十','十','十','十','十','十','十','十','十','二',
                        '廿','廿','廿','廿','廿','廿','廿','廿','廿','三'];
        const suffix = ['一','二','三','四','五','六','七','八','九','十',
                        '一','二','三','四','五','六','七','八','九','十',
                        '一','二','三','四','五','六','七','八','九','十'];
        if (day === 10) return '初十';
        if (day === 20) return '二十';
        if (day === 30) return '三十';
        return prefix[day - 1] + suffix[day - 1];
    }

    // ====== 游戏控制 ======
    start() {
        this.paused = false;
        this.running = true;
        this._startTick();
        this.emit('start', this.state);
    }

    pause() {
        this.paused = true;
        this._stopTick();
        this.emit('pause');
    }

    resume() {
        this.paused = false;
        this._startTick();
        this.emit('resume');
    }

    togglePause() {
        if (this.paused) this.resume();
        else this.pause();
    }

    setSpeed(speed) {
        this.speed = speed;
        if (this.running && !this.paused) {
            this._stopTick();
            this._startTick();
        }
        this.emit('speedChange', speed);
    }

    skipToNextEvent() {
        // 快速推进到下一个事件
        this.tick();
    }

    _startTick() {
        this._stopTick();
        const interval = this.baseTickMs / this.speed;
        this.tickInterval = setInterval(() => this.tick(), interval);
    }

    _stopTick() {
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
    }

    // ====== 存档系统 ======
    save() {
        try {
            const data = JSON.stringify(this.state);
            localStorage.setItem('palace_game_save', data);
            this.emit('toast', { text: '存档成功', type: 'success' });
            return true;
        } catch (e) {
            this.emit('toast', { text: '存档失败', type: 'danger' });
            return false;
        }
    }

    load() {
        try {
            const data = localStorage.getItem('palace_game_save');
            if (!data) return false;
            this.state = JSON.parse(data);
            this.emit('load', this.state);
            return true;
        } catch (e) {
            return false;
        }
    }

    hasSave() {
        return !!localStorage.getItem('palace_game_save');
    }

    deleteSave() {
        localStorage.removeItem('palace_game_save');
    }

    // ====== 事件系统 ======
    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    emit(event, data) {
        if (!this.listeners[event]) return;
        for (const cb of this.listeners[event]) {
            try { cb(data); } catch (e) { console.error('Event error:', e); }
        }
    }
}

// 全局引擎实例
const engine = new GameEngine();
