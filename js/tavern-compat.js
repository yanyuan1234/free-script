var TavernHelperCompat = {
    _slashCommands: {},
    _pipeValue: '',
    _scripts: [],
    _quickReplies: [],
    _eventListeners: {},
    // 【P1修复P1-L】删除 _presetConfig 字段：仅由 _loadPresetConfigs 写入、由 getPresetConfig
    // 读取，但 getPresetConfig 全项目零外部调用，构成死字段。
    // 【修复B P2-1】控制流命令收集模式
    _collectingMode: null,  // null | 'while' | 'foreach'
    
    // 初始化
    init: function() {
        this._initToastr();
        console.log('[TavernHelperCompat] 酒馆助手兼容层已初始化');
    },
    
    // 1. getContext() 兼容层
    // 返回与SillyTavern一致的数据格式
    // 【P1-mem修复】缓存加入版本校验，state 变化时自动失效
    _context: null,
    _contextVersion: '',
    getContext: function() {
        // 计算当前状态版本：聊天长度 + 存档key + 角色数量
        var chatLen = (typeof gameState !== 'undefined' && gameState && Array.isArray(gameState.conversationHistory)) ? gameState.conversationHistory.length : 0;
        var saveKey = (typeof gameState !== 'undefined' && gameState && gameState.saveKey) ? gameState.saveKey : '';
        var charLen = (typeof gameState !== 'undefined' && gameState && gameState.worldSnapshot && Array.isArray(gameState.worldSnapshot.characters)) ? gameState.worldSnapshot.characters.length : 0;
        var version = chatLen + '|' + saveKey + '|' + charLen;
        if (this._context && this._contextVersion === version) return this._context;
        this._contextVersion = version;
        // 构建聊天消息列表（与酒馆格式一致）
        var chat = [];
        // 修复：检查 conversationHistory 是数组（防御旧存档/损坏数据）
        if (gameState && Array.isArray(gameState.conversationHistory)) {
            chat = gameState.conversationHistory.map(function(msg, idx) {
                if (!msg) return null;
                return {
                    mes: msg.content || msg.text || '',
                    name: msg.role === 'user' ? (gameState.playerName || '玩家') : (msg.name || '角色'),
                    is_user: msg.role === 'user',
                    is_system: msg.role === 'system',
                    send_date: msg.timestamp || Date.now(),
                    extra: msg.extra || {},
                    index: idx
                };
            }).filter(Boolean);
        }

    // 获取角色信息
    var character = {};
    if (typeof gameState !== 'undefined' && gameState && gameState.worldSnapshot && Array.isArray(gameState.worldSnapshot.characters) && gameState.worldSnapshot.characters.length > 0) {
        var char = gameState.worldSnapshot.characters[0];
        character = {
            name: char.name || '角色',
            description: char.desc || '',
            personality: char.personality || '',
            scenario: char.scenario || '',
            first_mes: char.first_mes || '',
            mes_example: char.mes_example || '',
            creatorcomment: char.creatorcomment || '',
            tags: char.tags || [],
            creator: char.creator || '',
            character_version: char.character_version || '',
            // V2 Spec字段
            data: char.data || {},
            character_book: char.character_book || null
        };
    }

    this._context = {
        // 核心聊天数据
        chat: chat,
        // 角色列表
        characters: (typeof gameState !== 'undefined' && gameState && gameState.worldSnapshot && Array.isArray(gameState.worldSnapshot.characters)) ? gameState.worldSnapshot.characters : [],
        // 当前角色ID
        characterId: 0,
        // 聊天ID
        chatId: (typeof gameState !== 'undefined' && gameState && gameState.saveKey) ? gameState.saveKey : 'default',
        // 群组ID（如果支持群组）
        groupId: null,
        // 角色名（AI）
        name1: character.name || '角色',
        // 玩家名
        name2: (typeof gameState !== 'undefined' && gameState && gameState.playerName) || '玩家',
        // 角色卡完整数据
        characterCard: character,
        // 聊天元数据
        chatMetadata: (typeof gameState !== 'undefined' && gameState && gameState.chatMetadata) ? gameState.chatMetadata : {},
        // 扩展设置
        extensionSettings: this._getExtensionSettings(),
        // 全局设置
        settings: this._getSettings()
    };
    return this._context;
},

// 获取扩展设置
_getExtensionSettings: function() {
    var settings = {};
    // 世界书设置
    if (typeof WorldInfo !== 'undefined') {
        settings.worldInfo = WorldInfo.settings || {};
    }
    // 正则设置
    if (typeof RegexManager !== 'undefined') {
        settings.regex = {
            globalScripts: RegexManager.globalScripts || [],
            presetScripts: RegexManager.presetScripts || []
        };
    }
    // 记忆设置
    // 记忆设置（已合并到 MemoryManagerUI，无需单独获取）
    return settings;
},

// 获取全局设置
_getSettings: function() {
    var gs = (typeof gameState !== 'undefined') ? gameState : null;
    return {
        apiType: gs && gs.apiType ? gs.apiType : 'openai',
        model: gs && gs.model ? gs.model : '',
        temperature: gs && typeof gs.temperature === 'number' ? gs.temperature : 0.7,
        maxTokens: gs && gs.maxTokens ? gs.maxTokens : 2000,
        contextSize: gs && gs.contextSize ? gs.contextSize : 8000,
        systemPrompt: gs && gs.systemPrompt ? gs.systemPrompt : '',
        jailbreakPrompt: gs && gs._jailbreakPrompt ? gs._jailbreakPrompt : ''
    };
},

// 2. 通知系统
// 【缺陷修复】toastr 合并到 UI.toast，移除独立容器，避免两套 toast 系统并存
// 保留 toastr 接口供旧代码调用，内部统一委托给 UI.toast
_initToastr: function() {
    if (window.toastr) return;
    window.toastr = {
        info: function(msg) { if (typeof UI !== 'undefined' && UI.toast) UI.toast(msg); },
        success: function(msg) { if (typeof UI !== 'undefined' && UI.toast) UI.toast(msg); },
        warning: function(msg) { if (typeof UI !== 'undefined' && UI.toast) UI.toast(msg); },
        error: function(msg) { if (typeof UI !== 'undefined' && UI.toast) UI.toast(msg); }
    };
},

// 3. 斜杠命令系统
registerSlashCommand: function(name, callback) { this._slashCommands[name.toLowerCase()] = callback; },

triggerSlash: function(commandStr) {
    if (!commandStr || typeof commandStr !== 'string') return Promise.resolve('');
    const self = this;
    var commands = commandStr.split('|');
    var chain = Promise.resolve('');
    commands.forEach(function(cmd) {
        chain = chain.then(function(pipeValue) { self._pipeValue = pipeValue || ''; return self._executeSingleCommand(cmd.trim()); }).catch(function(err) { console.error('[斜杠命令] 操作失败:', err); });
    });
    return chain;
},

// 扩展斜杠命令执行器，支持更多命令
_executeSingleCommand: function(cmdStr) {
    if (!cmdStr) return Promise.resolve(this._pipeValue);

    // 【修复B P2-1】收集模式：当处于 while/foreach 收集阶段时，将命令收集到数组中
    if (this._collectingMode === 'while') {
        this._whileCommands.push(cmdStr);
        return Promise.resolve('');
    }
    if (this._collectingMode === 'foreach') {
        this._foreachCommands.push(cmdStr);
        return Promise.resolve('');
    }

    var match = cmdStr.match(/^\/(\S+)\s*(.*)/);
    if (!match) return Promise.resolve(cmdStr);
    var commandName = match[1].toLowerCase();
    var argsStr = match[2] || '';
    var result = '';

    switch (commandName) {
        case 'send':
            // 将调试日志注释化，减少控制台噪音
            if (typeof sendAIRequest === 'function') TimerManager.setTimeout('sendAI', function(){sendAIRequest(argsStr);},100);
            result = argsStr; break;
        case 'echo':
            var sevMatch = argsStr.match(/severity=(\w+)\s+(.*)/);
            if (sevMatch) { var s=sevMatch[1]; var t=sevMatch[2]; if(window.toastr&&toastr[s])toastr[s](t); else console.log('[echo '+s+'] '+t); result=t; }
            else { if(window.toastr)toastr.info(argsStr); result=argsStr; } break;
        case 'input':
            var promptText = argsStr.replace(/okButton="[^"]*"/g,'').replace(/cancelButton="[^"]*"/g,'').trim();
            result = window.prompt(promptText || '请输入:') || ''; break;
        // 变量命令 - 支持更多格式
        case 'setvar':
            var m=argsStr.match(/key=(\S+)\s+(.*)/);
            if(!m) m=argsStr.match(/(\S+)\s+(.*)/);  // 支持 /setvar key value 格式
            if(m){if(typeof MacroEngine!=='undefined')MacroEngine.setLocalVar(m[1],m[2]);}
            result=''; break;
        case 'getvar':
            var n=argsStr.trim();
            result=(typeof MacroEngine!=='undefined')?MacroEngine.getLocalVar(n):''; break;
        case 'setglobalvar':
            var m=argsStr.match(/key=(\S+)\s+(.*)/);
            if(!m) m=argsStr.match(/(\S+)\s+(.*)/);
            if(m){if(typeof MacroEngine!=='undefined')MacroEngine.setGlobalVar(m[1],m[2]);}
            result=''; break;
        case 'getglobalvar':
            var n=argsStr.trim();
            result=(typeof MacroEngine!=='undefined')?MacroEngine.getGlobalVar(n):''; break;
        case 'addvar':
            var m=argsStr.match(/key=(\S+)\s+(.*)/);
            if(!m) m=argsStr.match(/(\S+)\s+(.*)/);
            if(m&&typeof MacroEngine!=='undefined')MacroEngine.addVar(m[1],m[2]);
            result=''; break;
        case 'incvar':
            var n=argsStr.trim();
            result=(typeof MacroEngine!=='undefined')?MacroEngine.incVar(n):''; break;
        case 'decvar':
            var n=argsStr.trim();
            result=(typeof MacroEngine!=='undefined')?MacroEngine.decVar(n):''; break;
        // 新增：let命令（声明变量）
        case 'let':
            var m=argsStr.match(/(\S+)\s*=(.*)/);
            if(m&&typeof MacroEngine!=='undefined'){
                var val=m[2].trim();
                // 支持管道值
                if(val==='{{pipe}}'||val==='pipe') val=this._pipeValue;
                MacroEngine.setLocalVar(m[1],val);
            }
            result=''; break;
        // 新增：return命令（返回值）
        case 'return':
            var val=argsStr.trim();
            if(val==='{{pipe}}'||val==='pipe') val=this._pipeValue;
            result=val; break;
        // 新增：if/else-if/else命令
        case 'if':
            this._ifCondition = this._evaluateCondition(argsStr);
            this._ifExecuted = this._ifCondition;
            result=''; break;
        case 'else-if':
            if(!this._ifExecuted){
                this._ifCondition = this._evaluateCondition(argsStr);
                this._ifExecuted = this._ifCondition;
            } else {
                this._ifCondition = false;
            }
            result=''; break;
        case 'else':
            if(!this._ifExecuted){
                this._ifCondition = true;
                this._ifExecuted = true;
            } else {
                this._ifCondition = false;
            }
            result=''; break;
        case 'endif':
            this._ifCondition = null;
            this._ifExecuted = false;
            result=''; break;
        // 【修复B P2-1】新增：while命令（循环）- 进入收集模式
        case 'while':
            this._whileCondition = argsStr;
            this._whileCommands = [];
            this._collectingMode = 'while';  // 【修复B P2-1】开始收集循环体命令
            result=''; break;
        case 'endwhile':
            // 【修复B P2-1】退出收集模式，执行循环
            this._collectingMode = null;
            if(this._whileCondition&&this._whileCommands.length>0){
                var _maxWhileIter = 1000;
                while(this._evaluateCondition(this._whileCondition) && _maxWhileIter-- > 0){
                    var self=this;
                    this._whileCommands.forEach(function(cmd){
                        self._executeSingleCommand(cmd);
                    });
                }
            }
            this._whileCondition=null;
            this._whileCommands=[];
            result=''; break;
        // 【修复B P2-1】新增：foreach命令（遍历）- 进入收集模式
        case 'foreach':
            var m=argsStr.match(/(\S+)\s+of\s+(.+)/);
            if(m){
                var varName=m[1];
                var listStr=m[2].trim();
                var list=[];
                if(listStr.startsWith('[')&&listStr.endsWith(']')){
                    try{list=JSON.parse(listStr);}catch(e){list=listStr.slice(1,-1).split(',').map(function(s){return s.trim();});}
                }else if(typeof MacroEngine!=='undefined'){
                    var val=MacroEngine.getLocalVar(listStr);
                    if(val) list=val.split(',').map(function(s){return s.trim();});
                }
                this._foreachList=list;
                this._foreachVar=varName;
                this._foreachIndex=0;
                this._foreachCommands=[];
                this._collectingMode = 'foreach';  // 【修复B P2-1】开始收集循环体命令
            }
            result=''; break;
        case 'endforeach':
            // 【修复B P2-1】退出收集模式，执行遍历
            this._collectingMode = null;
            if(this._foreachList&&this._foreachCommands.length>0){
                var self=this;
                this._foreachList.forEach(function(item,idx){
                    if(typeof MacroEngine!=='undefined'){
                        MacroEngine.setLocalVar(self._foreachVar,item);
                        MacroEngine.setLocalVar(self._foreachVar+'_index',idx);
                    }
                    self._foreachCommands.forEach(function(cmd){
                        self._executeSingleCommand(cmd);
                    });
                });
            }
            this._foreachList=null;
            this._foreachCommands=[];
            result=''; break;
        // 新增：delay命令（延迟）
        case 'delay':
            var ms = safeInt(argsStr, 1000);
            return new Promise(function(resolve){
                TimerManager.setTimeout('delayCmd', function(){resolve('');},ms);
            });
        // 新增：run命令（运行脚本）
        case 'run':
            var scriptName=argsStr.trim();
            if(this._scripts[scriptName]){
                result=this.executeScript(this._scripts[scriptName]);
            }else{
                console.warn('[TavernHelper] 脚本未找到: '+scriptName);
            }
            break;
        // 新增：trigger-name命令（触发命名事件）
        case 'trigger-name':
            var eventName=argsStr.trim();
            this.emit('trigger:'+eventName,{});
            result=''; break;
        case 'hide': case 'unhide': result=''; break;
        case 'trigger':
            if(typeof sendAIRequest==='function') TimerManager.setTimeout('triggerAI', function(){sendAIRequest();},100);
            result=''; break;
        case 'pass': result=argsStr; break;
        case 'comment': case '#': result=''; break;
        // 更多酒馆常用命令
        case 'swipe':
            if(typeof sendAIRequest==='function') TimerManager.setTimeout('swipeAI', function(){sendAIRequest('请重新生成');},100);
            result=''; break;
        case 'continue':
            // 【修复】使用预设的 continue_nudge_prompt
            (function() {
                var continuePrompt = '[Continue your last message...]';
                try {
                    if (typeof PresetManager !== 'undefined' && PresetManager.presets && PresetManager.presets[PresetManager.currentPresetIndex]) {
                        var preset = PresetManager.presets[PresetManager.currentPresetIndex];
                        if (preset.continue_nudge_prompt) {
                            continuePrompt = preset.continue_nudge_prompt;
                        }
                    }
                } catch(e) {}
                if(typeof sendAIRequest==='function') TimerManager.setTimeout('continueAI', function(){sendAIRequest(continuePrompt);},100);
            })();
            result=''; break;
        case 'sys':
        case 'system':
            // 添加系统消息到对话历史
            if(argsStr && typeof StateManager !== 'undefined' && StateManager.get && StateManager.set) {
                var _ch = StateManager.get('progress.conversationHistory') || [];
                _ch.push({role: 'system', content: argsStr});
                StateManager.set('progress.conversationHistory', _ch, { silent: true });
            }
            result=''; break;
        case 'persona':
            if(gameState && argsStr) {
                gameState.playerPersonality = argsStr;
            }
            result=''; break;
        case 'char':
        case 'character':
            if(gameState && gameState.worldSnapshot && gameState.worldSnapshot.characters) {
                result = JSON.stringify(gameState.worldSnapshot.characters[0] || {});
            } else {
                result = '{}';
            }
            break;
        case 'chat':
            if(gameState && Array.isArray(gameState.conversationHistory)) {
                result = JSON.stringify(gameState.conversationHistory.slice(-5));
            } else {
                result = '[]';
            }
            break;
        case 'reset':
            if(typeof MacroEngine !== 'undefined') {
                MacroEngine._localVars = {};
            }
            result=''; break;
        case 'clear':
            if(gameState) {
                gameState.conversationHistory = [];
            }
            result=''; break;
        case 'save':
            // 【修复8 P1-1】使用存在的 saveToSlot 函数代替不存在的 saveGame
            if(typeof saveToSlot === 'function') {
                saveToSlot(1);
            }
            result=''; break;
        case 'load':
            // 【修复8 P1-1】使用存在的 loadFromSlot 函数代替不存在的 loadGame
            if(typeof loadFromSlot === 'function') {
                loadFromSlot(parseInt(argsStr.trim()) || 1);
            }
            result=''; break;
        default:
            if(this._slashCommands[commandName]) result=this._slashCommands[commandName](argsStr);
            else console.warn('[TavernHelper] 未知命令: /'+commandName);
    }
    return Promise.resolve(result);
},

// 新增：条件评估方法
_evaluateCondition: function(condition) {
    // 支持简单条件：var == value, var != value, var > value, var < value
    var match = condition.match(/(.+?)\s*(==|!=|>|>=|<|<=)\s*(.+)/);
    if (!match) {
        // 简单布尔检查
        if (typeof MacroEngine !== 'undefined') {
            var val = MacroEngine.getLocalVar(condition.trim());
            return !!val && val !== 'false' && val !== '0';
        }
        return false;
    }
    var left = match[1].trim();
    var op = match[2];
    var right = match[3].trim();
    // 获取变量值
    var leftVal = left;
    var rightVal = right;
    if (typeof MacroEngine !== 'undefined') {
        var lv = MacroEngine.getLocalVar(left);
        if (lv !== undefined && lv !== null) leftVal = lv;
        var rv = MacroEngine.getLocalVar(right);
        if (rv !== undefined && rv !== null) rightVal = rv;
    }
    // 处理管道值
    if (leftVal === '{{pipe}}' || leftVal === 'pipe') leftVal = this._pipeValue;
    if (rightVal === '{{pipe}}' || rightVal === 'pipe') rightVal = this._pipeValue;
    // 数值比较
    var leftNum = parseFloat(leftVal);
    var rightNum = parseFloat(rightVal);
    if (!isNaN(leftNum) && !isNaN(rightNum)) {
        switch(op) {
            case '==': return leftNum == rightNum;
            case '!=': return leftNum != rightNum;
            case '>': return leftNum > rightNum;
            case '>=': return leftNum >= rightNum;
            case '<': return leftNum < rightNum;
            case '<=': return leftNum <= rightNum;
        }
    }
    // 字符串比较
    switch(op) {
        case '==': return leftVal == rightVal;
        case '!=': return leftVal != rightVal;
        case '>': return leftVal > rightVal;
        case '>=': return leftVal >= rightVal;
        case '<': return leftVal < rightVal;
        case '<=': return leftVal <= rightVal;
    }
    return false;
},

// 4. 事件系统
// 【性能优化】on() 自动去重，相同函数引用不会重复注册
on: function(event, cb) {
    if(!this._eventListeners[event]) this._eventListeners[event] = [];
    if(this._eventListeners[event].indexOf(cb) === -1) {
        this._eventListeners[event].push(cb);
    }
},
emit: function(event, data) { var l=this._eventListeners[event]; if(l && Array.isArray(l))l.forEach(function(cb){try{cb(data);}catch(e){console.error('[TavernHelper] listener error:',e);}}); },

// 5. Quick Reply 按钮（增强版 - 支持酒馆完整字段）
parseQuickReplies: function(data) {
    if(!data||!data.button||!data.button.buttons) return [];
    this._quickReplies = data.button.buttons.filter(function(b){
        // 支持 disabled 字段
        if (b.disabled === true) return false;
        // 支持 visible 字段
        if (b.visible === false) return false;
        return true;
    });
    this._renderQuickReplyButtons();
    return this._quickReplies;
},

_renderQuickReplyButtons: function() {
    const self = this;
    // 【深度融合】将预设快捷回复按钮注入到游戏原生操作栏中
    var container = document.getElementById('tavern-quick-reply-container');
    var actionBar = document.querySelector('.custom-action-bar');
    if(!container){
        container = document.createElement('div');
        container.id = 'tavern-quick-reply-container';
        // 使用游戏原生操作栏的样式，融入而非独立
        container.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;overflow-x:auto;-webkit-overflow-scrolling:touch;';
        // 插入到操作栏内部，在输入框之前
        if(actionBar){
            var inputField = actionBar.querySelector('.input-field');
            if(inputField){
                actionBar.insertBefore(container, inputField);
            } else {
                actionBar.appendChild(container);
            }
        } else {
            var inputArea = document.querySelector('#userInputArea')||document.querySelector('.chat-input-area')||document.querySelector('#chatForm');
            if(inputArea) inputArea.parentNode.insertBefore(container,inputArea);
            else document.body.appendChild(container);
        }
    }
    
    // 清空容器
    container.innerHTML = '';
    
    // 如果没有快捷回复按钮，直接返回
    if (!this._quickReplies || this._quickReplies.length === 0) {
        return;
    }
    
    this._quickReplies.forEach(function(btn,i){
        var button = document.createElement('button');
        button.textContent = btn.name||'按钮 '+(i+1);
        // 【深度融合】使用游戏原生按钮样式，视觉统一
        button.className = 'action-bar-btn';
        button.style.cssText = 'flex-shrink:0;font-size:12px;padding:6px 12px;white-space:nowrap;border-radius:var(--radius-icon);';
        
        // 【修复】支持 emphasized 字段（强调样式）
        var isEmphasized = btn.emphasized === true;
        if (isEmphasized) {
            button.classList.add('emphasized');
        }
        
        // 【新增】支持 secondary 字段（次要样式）
        if (btn.secondary === true || btn.style === 'secondary') {
            button.classList.add('secondary');
        }
        
        button.onclick = function() {
                self.emit('QUICK_REPLY_CLICKED', { button: btn, index: i });

                // 【修复】支持 setVariable 字段
                if (btn.setVariable && typeof btn.setVariable === 'object') {
                    Object.keys(btn.setVariable).forEach(function(varName) {
                        var varValue = btn.setVariable[varName];
                        if (typeof varValue === 'string') {
                            varValue = MacroEngine.process(varValue, {
                                user: gameState.playerName || '玩家',
                                char: (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) ? gameState.worldSnapshot.characters[0].name : '角色'
                            });
                        }
                        // 设置为全局变量
                        // 【优化】移除 gameState._globalVars 死字段写入——MacroEngine._globalVars 已迁移到 VariableStore
                        // 旧代码的 else 分支写入 gameState._globalVars，但该字段从未被任何读取逻辑使用
                        if (typeof setGlobalVar === 'function') setGlobalVar(varName, varValue);
                        else if (typeof MacroEngine !== 'undefined' && MacroEngine.setGlobalVar) MacroEngine.setGlobalVar(varName, varValue);
                        else console.warn('[TavernHelperCompat] 无法设置全局变量:', varName);
                    });
                }

                // 【增强】快捷回复与游戏融合
                // 如果按钮有prompt，作为用户输入发送
                if (btn.prompt && btn.prompt.trim()) {
                    var promptText = '';
                    try {
                        promptText = MacroEngine.process(btn.prompt, {
                            user: (typeof gameState !== 'undefined' && gameState.playerName) || '玩家',
                            char: (typeof gameState !== 'undefined' && gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) ? gameState.worldSnapshot.characters[0].name : '角色',
                            input: (document.getElementById('userInput') || {}).value || ''
                        });
                    } catch (e) {
                        console.warn('[快捷回复] 宏处理失败:', e);
                        promptText = btn.prompt;
                    }
                    if (promptText && promptText.trim()) {
                        // 【P2清理】删除 gameState._quickReplyLog 写入（写入后从不读取，全项目零消费）
                        // 发送消息
                        var inputEl = document.getElementById('userInput') || document.getElementById('customAction');
                        if (inputEl) {
                            inputEl.value = promptText;
                            // 触发发送
                            if (typeof sendAIRequest === 'function') {
                                sendAIRequest(promptText);
                            }
                        }
                    }
                }
                // 如果按钮有script，执行脚本
                if (btn.script && btn.script.trim()) {
                    try {
                        self.triggerSlash(btn.script);
                    } catch(e) {
                        console.warn('[快捷回复] 脚本执行失败:', e);
                    }
                }
            };
        container.appendChild(button);
    });
    
    console.log('[快捷回复] 已渲染', this._quickReplies.length, '个按钮');
},

// 添加 renderQuickReplyBar 别名方法，兼容预设导入调用
renderQuickReplyBar: function() {
    this._renderQuickReplyButtons();
},

// 6. 脚本执行引擎
loadScripts: function(data) {
    if(!data||!data.scripts) return;
    const self = this;
    this._scripts = data.scripts;
    data.scripts.forEach(function(script){
        if(script.enabled===false) return;
        // 【优化】使用统一的 _executeScriptCode 方法
        self._executeScriptCode(script.content, script.name || '未命名');
    });
},

_createSandbox: function() {
    const self = this;
    return {
        getContext: function(){return self.getContext();},
        triggerSlash: function(cmd){return self.triggerSlash(cmd);},
        toastr: window.toastr||{info:function(m){console.log('[toastr] '+m);},success:function(m){console.log('[toastr] '+m);},warning:function(m){console.log('[toastr] '+m);},error:function(m){console.log('[toastr] '+m);}},
        eventSource: {on:function(e,cb){self.on(e,cb);},emit:function(e,d){self.emit(e,d);},once:function(e,cb){var w=function(d){self._removeListener(e,w);cb(d);};self.on(e,w);},removeListener:function(e,cb){self._removeListener(e,cb);}},
        // 【修复】暴露 SillyTavern 引用，让脚本中的 window.SillyTavern 可用
        SillyTavern: window.SillyTavern
    };
},

// 【修复7 P0-3】executeScript 方法 - 复用 _executeScriptCode 内部方法
executeScript: function(scriptContent) {
    return this._executeScriptCode(scriptContent, 'executeScript');
},

// 【新增】内部通用脚本执行方法
// 安全说明：此处使用 Function 构造函数是必要的，用于执行预设文件中的自定义脚本。
// 安全措施：
// 1. 脚本来源仅限预设文件，不接受用户直接输入
// 2. 使用沙箱环境隔离，限制可访问的全局对象
// 3. 过滤危险的 import 语句
// 4. 检测并阻止嵌套的 eval/Function 调用
// 5. 限制代码长度防止资源耗尽攻击
_executeScriptCode: function(code, sourceName) {
    if (typeof code !== 'string') {
        console.warn('[TavernHelper] ' + (sourceName || '脚本') + ' 错误: 代码必须是字符串');
        return '';
    }
    if (code.length > 100000) {
        console.warn('[TavernHelper] ' + (sourceName || '脚本') + ' 错误: 代码长度超过限制 (100KB)');
        return '';
    }
    // 【P0修复】加强危险模式检测：覆盖更多绕过手法
    var dangerousPatterns = [
        /\beval\s*\(/,
        /\bFunction\s*\(/,
        /\bnew\s+Function\s*\(/,
        /\bdocument\.write\s*\(/,
        /\bdocument\.writeln\s*\(/,
        // 间接 eval 调用
        /\bwindow\s*\[\s*['"]eval['"]\s*\]/,
        /\bglobalThis\s*\.\s*eval\b/,
        /\bself\s*\.\s*eval\b/,
        /\btop\s*\.\s*eval\b/,
        /\bparent\s*\.\s*eval\b/,
        /\bframes\s*\[\s*['"]eval['"]\s*\]/,
        /\(\s*0\s*,\s*eval\s*\)/,
        /\bReflect\s*\.\s*apply\s*\(\s*eval\b/,
        // 字符串形式的定时器调用
        /\bsetTimeout\s*\(\s*['"]/,
        /\bsetInterval\s*\(\s*['"]/,
        // 【新增】constructor/prototype 绕过
        /\bconstructor\s*\[\s*['"]constructor['"]\s*\]/,
        /\b__proto__\b/,
        // 【新增】window.Function / globalThis.Function 间接调用
        /\bwindow\s*\.\s*Function\b/,
        /\bglobalThis\s*\.\s*Function\b/,
        // 【新增】document.cookie / localStorage 直接访问
        /\bdocument\s*\.\s*cookie\b/,
        // 【新增】XMLHttpRequest 直接构造
        /\bnew\s+XMLHttpRequest\b/
    ];
    for (let i = 0; i < dangerousPatterns.length; i++) {
        if (dangerousPatterns[i].test(code)) {
            console.warn('[TavernHelper] ' + (sourceName || '脚本') + ' 错误: 检测到危险代码模式');
            return '';
        }
    }
    try {
        var sandbox = this._createSandbox();
        code = code.replace(/^import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*$/gm, '// [import 已被兼容层替换]');
        code = code.replace(/window\.SillyTavern/g, 'window.TavernHelperCompat');
        // 【P0修复】添加 'use strict' 阻止 this 指向 window
        // 移除 fetch 注入（沙箱不应有任意网络请求能力）
        // this 绑定为 null（严格模式下不会回退到 window）
        var preamble = "'use strict';\nvar getContext=arguments[0],triggerSlash=arguments[1],toastr=arguments[2],eventSource=arguments[3];\n";
        var fn = new Function('getContext','triggerSlash','toastr','eventSource','console','setTimeout','setInterval','clearTimeout','clearInterval','Promise', preamble+code);
        // 严格模式下 this=null，不会泄漏到 window
        fn.call(null, sandbox.getContext, sandbox.triggerSlash, sandbox.toastr, sandbox.eventSource, console, setTimeout, setInterval, clearTimeout, clearInterval, Promise);
        return '';
    } catch(e) {
        console.warn('[TavernHelper] ' + (sourceName || '脚本') + ' 错误: ' + e.message);
        return '';
    }
},

// 7. 主入口
loadFromPreset: function(presetData) {
    console.log('[TavernHelper] 正在加载酒馆助手兼容层...');
    this._initToastr();
    var th = presetData.tavern_helper||presetData.extensions_tavern_helper||null;
    if(th){
        if(th.scripts) this.loadScripts(th);
        if(th.button) this.parseQuickReplies(th);
        if(th.data&&th.data.presets) this._loadPresetConfigs(th.data.presets);
    }
    // 【修复】从 SPreset 扩展中提取快捷回复（兼容果实预设）
    var sp = presetData.SPreset || presetData.extensions_SPreset || null;
    if (sp && sp.button && sp.button.buttons) {
        this.parseQuickReplies({ button: sp.button });
    }
    // 【修复】从预设的 spresetButtons 字段加载快捷回复（果实预设）
    if (presetData.spresetButtons && presetData.spresetButtons.length > 0) {
        this.parseQuickReplies({ button: { buttons: presetData.spresetButtons } });
    }
    // 【修复】触发 APP_READY 事件（酒馆助手脚本可能依赖此事件）
    if (typeof TimerManager !== 'undefined' && TimerManager.setTimeout) {
        TimerManager.setTimeout('appReady', function() {
            TavernHelperCompat.emit('APP_READY', {});
            console.log('[TavernHelper] APP_READY 事件已触发');
        }, 500);
    } else {
        setTimeout(function() {
            TavernHelperCompat.emit('APP_READY', {});
            console.log('[TavernHelper] APP_READY 事件已触发');
        }, 500);
    }
    console.log('[TavernHelper] ✅ 酒馆助手兼容层加载完成');
},

_loadPresetConfigs: function(presets) {
    if(!presets||!presets.default) return;
    // 【P1修复P1-L】删除 this._presetConfig = presets.default 赋值：死字段（无外部读取点）
    if(presets.default.commands){
        var self=this;
        Object.keys(presets.default.commands).forEach(function(cmdName){
            var cmdText = presets.default.commands[cmdName];
            self.registerSlashCommand(cmdName, function(){
                if(typeof sendAIRequest==='function') sendAIRequest(cmdText);
                return cmdText;
            });
        });
    }
    // 【修复P0-1补充】将酒馆助手预设配置同步到当前预设的 wordCountConfig
    // 这样 injectPresetGlobalVars 就能读取到正确的字数/视角等配置
    if (typeof PresetManager !== 'undefined' && PresetManager.currentPresetIndex >= 0) {
        var currentPreset = PresetManager.presets[PresetManager.currentPresetIndex];
        if (currentPreset && !currentPreset.wordCountConfig && presets.default) {
            var cfg = presets.default;
            var wcConfig = {
                min: cfg.wordCount ? cfg.wordCount.min : undefined,
                max: cfg.wordCount ? cfg.wordCount.max : undefined,
                paragraphMin: cfg.paragraphCount ? cfg.paragraphCount.min : undefined,
                paragraphMax: cfg.paragraphCount ? cfg.paragraphCount.max : undefined,
                paragraphStyle: cfg.paragraphStyle || undefined,
                perspective: cfg.perspective || undefined,
                userPronoun: cfg.userPronoun || undefined,
                takeover: cfg.takeover || undefined,
                narrate: cfg.narrate || undefined,
                aiMode: cfg.aiMode || undefined,
                enabled: true
            };
            Object.keys(wcConfig).forEach(function(k) { if (wcConfig[k] === undefined) delete wcConfig[k]; });
            if (Object.keys(wcConfig).length > 1) {
                currentPreset.wordCountConfig = wcConfig;
                console.log('[TavernHelper] 已从预设配置同步 wordCountConfig:', JSON.stringify(wcConfig));
            }
        }
    }
}
};

// 【P1修复P1-L】删除 getPresetConfig 方法：返回 _presetConfig，但 _presetConfig 已删除
// （死字段清理的连锁：_presetConfig 无写入点后，getPresetConfig 也无意义）

// 全局暴露（酒馆脚本需要）
window.getContext = function(){return TavernHelperCompat.getContext();};
window.triggerSlash = function(cmd){return TavernHelperCompat.triggerSlash(cmd);};

// 【修复】补全 SillyTavern API，让酒馆助手脚本能正常运行
window.SillyTavern = {
getContext: function(){return TavernHelperCompat.getContext();},
chat: [],
characters: [],
getCharacters: function(){ return (gameState && gameState.worldSnapshot && gameState.worldSnapshot.characters) || []; },
checkCharExists: function(name){ var chars = this.getCharacters(); return chars.some(function(c){return c.name === name;}); },
saveChat: function(){ console.log('[SillyTavern] saveChat: 游戏自动存档已处理'); },
saveChatConditional: function(){ console.log('[SillyTavern] saveChatConditional: 游戏自动存档已处理'); },
generateRaw: function(prompt, options){
    console.log('[SillyTavern] generateRaw: 通过 sendAIRequest 发送');
    if(typeof sendAIRequest === 'function') sendAIRequest(prompt);
    return '';
},
generateRawQuiet: function(prompt, options){
    console.log('[SillyTavern] generateRawQuiet: 静默生成');
    return '';
},
getChatMetadata: function(){ return (gameState && gameState.chatMetadata) || {}; },
setChatMetadata: function(key, value){
    if(!gameState.chatMetadata) gameState.chatMetadata = {};
    if(typeof key === 'object') { Object.assign(gameState.chatMetadata, key); }
    else { gameState.chatMetadata[key] = value; }
},
writeExtensionSetting: function(extension, key, value){
    if(!gameState.extensionSettings) gameState.extensionSettings = {};
    if(!gameState.extensionSettings[extension]) gameState.extensionSettings[extension] = {};
    gameState.extensionSettings[extension][key] = value;
},
readExtensionSetting: function(extension, key, defaultValue){
    var ext = (gameState && gameState.extensionSettings && gameState.extensionSettings[extension]) || {};
    return ext[key] !== undefined ? ext[key] : (defaultValue !== undefined ? defaultValue : null);
},
eventSource: {
    on: function(e, cb){ TavernHelperCompat.on(e, cb); },
    emit: function(e, d){ TavernHelperCompat.emit(e, d); },
    once: function(e, cb){
        var wrapper = function(d){ TavernHelperCompat._removeListener(e, wrapper); cb(d); };
        TavernHelperCompat.on(e, wrapper);
    },
    removeListener: function(e, cb){ TavernHelperCompat._removeListener(e, cb); }
}
};

// 【修复】添加 _removeListener 方法到 TavernHelperCompat
if(!TavernHelperCompat._removeListener){
TavernHelperCompat._removeListener = function(event, cb){
    var l = this._eventListeners[event];
    if(l){
        var idx = l.indexOf(cb);
        if(idx !== -1) l.splice(idx, 1);
    }
};
}

console.log('[TavernHelper] 酒馆助手兼容层已加载 (SillyTavern API 已补全)');

// 自初始化：确保即使 initApp 在定义之前执行，init 也能被调用
if (typeof initApp !== 'undefined' && initApp._initialized) {
TavernHelperCompat.init();
}

/**
 * ========================================
 * 游戏记忆系统 v3 - GameMemory
 * 变化驱动注入 + AI可编辑记忆 + 时间锚点
 * ========================================
 */

var GameMemory = {

    // 【P1修复P1-M】版本升至 v4：quests 条目 content 字段重命名为 title，
    // 与 QuestMutator schema 对齐，消除 core.js 内 title↔content 别名映射
    version: 4,
    currentTurn: 0,
    // 【P0修复】longTermMemory getter 缓存：原 getter 每次访问都重建 worldAnchors 数组
    // （遍历 permanentFacts 全量映射）+ defineProperty(masterSummary)，单次 _parseStructuredSummary
    // 可触发 35+ 次 getter 调用。现按 dirty 标志缓存，permanentFacts 变更时置 dirty。
    _ltmCache: null,
    _ltmDirty: true,
    lastInjectionTurn: -1,
    gameClock: { day: 1, period: '早晨', lastUpdateTurn: 0 },

    permanentFacts: { pcIdentity: [], worldRules: [], settings: [], npcProfiles: [], promises: [], worldPlaces: [] },
    tables: { characters: {}, items: {}, locations: {}, relationships: {} },
    plot: { worldSetting: '', chapters: [], currentChapter: '', pendingMysteries: [] },
    events: [],
    timeline: [],
    quests: [],
    // 【优化】移除 nearSummary/midSummary/farSummary 死字段——注入路径从不读取，_summaryLayers 已统一处理
    workingMemory: { recentMessages: [], currentTopic: null, turns: [], messages: [] },
    // 变化驱动注入快照（Horae风格：无变化零Token）
    _injectionSnapshots: {},
    // 逐层摘要系统（Qvink风格：近详细→远压缩）
    _summaryLayers: { near: [], mid: [], far: [] },
    // 开局设定分层系统
    _setupLayers: { coreRules: '', worldSummary: '', fullSetup: '', compressed: false, extractTurn: -1, setupKeywords: [] },
    budget: {
        maxChars: 4000,
        minBudget: { permanentFacts: 1200, quests: 200, plot: 400, characters: 400, events: 300, items: 150, workingMemory: 400, sceneState: 100, summaryLayers: 200 },
        idealBudget: { permanentFacts: 2500, quests: 300, plot: 600, characters: 600, events: 500, items: 200, workingMemory: 600, sceneState: 200, summaryLayers: 400 },
    },
    compressionConfig: { triggerThreshold: 0.92, cooldownMinutes: 15, incrementalUpdate: true, lastCompressionTurn: 0 },
    stats: { totalMessages: 0, totalSummaries: 0, lastUpdateTime: null, tokenSaved: 0 },
    _changeLog: [],
    summaryHistory: [],
    // 【P2清理】删除 currentSummaryIndex（仅初始化与 reset，全项目零读取；summaryHistory 保留供 phone-ui.js 压缩统计显示）
    _saving: false,
    _pendingSave: false,

    // ===== AI叙事驱动系统：三层数据架构 + 编剧提醒 =====
    // 休眠追踪：记录每个角色/物品/任务/伏笔的休眠状态
    _dormantTracking: {
        // 结构: { characters: { '角色名': { status: 'active'|'linked'|'dormant', dormantSince: 回合数, lastMentioned: 回合数, dormantRounds: 0 } } }
        characters: {},
        items: {},
        quests: {},
        foreshadowings: {}  // 伏笔注册表：{ '伏笔ID': { desc: '描述', createdTurn: 0, dormantRounds: 0, triggered: false, priority: 5 } }
    },
    // 编剧提醒配置
    _storytellingConfig: {
        dormantWarningThreshold: 20,   // 休眠20回合开始提醒
        dormantUrgentThreshold: 30,    // 休眠30回合紧急提醒
        foreshadowWarningThreshold: 15, // 伏笔15回合未触发开始提醒
        maxForeshadowings: 20,         // 最大伏笔数量
        aiGuidanceEnabled: true        // 启用AI剧情引导
    },

    PROMISE_KEYWORDS: [
        /我(答应|承诺|发誓|保证|担保|立誓|向你)/g,
        /(答应|承诺|发誓|保证|担保|立誓)你/g,
        /我(一定|必定|决|定要|绝不|无论如何|无论如何都|誓死)([一-龥]{0,8})/g,
        /(我们|你我)(约定|说定|一言为定|一言)/g,
        /我(不会|不能|永不|决不)(让|允许|让.{0,4}受伤|让.{0,4}死|让.{0,4}受到)/g,
        /我(接|领)了?这个?(任务|委托|请求)/g,
        /我(一定要|必须|迟早会)([一-龥]{1,8}(报仇|血债|偿命|复仇))/g
    ],

    init: function() {
        var loaded = this.loadFromStorage();
        if (!loaded) this._migrateFromOldFormat();
        if (!this._injectionSnapshots) this._injectionSnapshots = {};
        if (!this._summaryLayers) this._summaryLayers = { near: [], mid: [], far: [] };
        if (!this._setupLayers) this._setupLayers = { coreRules: '', worldSummary: '', fullSetup: '', compressed: false, extractTurn: -1, setupKeywords: [] };
        if (!this._setupLayers.setupKeywords) this._setupLayers.setupKeywords = [];
        // 【修复 P2】移除 nearSummary/midSummary/farSummary 死字段初始化——这些字段已废弃，无人读取
        // if (!this.workingMemory.nearSummary) this.workingMemory.nearSummary = '';
        // if (!this.workingMemory.midSummary) this.workingMemory.midSummary = '';
        // if (!this.workingMemory.farSummary) this.workingMemory.farSummary = '';
        // 初始化AI叙事驱动系统的休眠追踪
        this._initDormantTracking();
        this.startAutoSave();
        return this;
    },

    // 初始化/迁移休眠追踪数据
    _initDormantTracking: function() {
        var self = this;
        if (!self._dormantTracking) {
            self._dormantTracking = { characters: {}, items: {}, quests: {}, foreshadowings: {} };
        }
        if (!self._dormantTracking.characters) self._dormantTracking.characters = {};
        if (!self._dormantTracking.items) self._dormantTracking.items = {};
        if (!self._dormantTracking.quests) self._dormantTracking.quests = {};
        if (!self._dormantTracking.foreshadowings) self._dormantTracking.foreshadowings = {};
        if (!self._storytellingConfig) {
            self._storytellingConfig = { dormantWarningThreshold: 20, dormantUrgentThreshold: 30, foreshadowWarningThreshold: 15, maxForeshadowings: 20, aiGuidanceEnabled: true };
        }

        // 为所有现有角色/物品/任务建立休眠追踪（如果还没有）
        Object.keys(self.tables.characters || {}).forEach(function(name) {
            if (!self._dormantTracking.characters[name]) {
                self._dormantTracking.characters[name] = {
                    status: 'active',
                    dormantSince: self.currentTurn,
                    lastMentioned: self.currentTurn,
                    dormantRounds: 0
                };
            }
        });
        Object.keys(self.tables.items || {}).forEach(function(name) {
            if (!self._dormantTracking.items[name]) {
                self._dormantTracking.items[name] = {
                    status: 'active',
                    dormantSince: self.currentTurn,
                    lastMentioned: self.currentTurn,
                    dormantRounds: 0
                };
            }
        });
        (self.quests || []).forEach(function(q, idx) {
            var key = q.title || ('quest_' + idx);
            if (!self._dormantTracking.quests[key]) {
                self._dormantTracking.quests[key] = {
                    status: q.status === 'pending' ? 'active' : 'dormant',
                    dormantSince: self.currentTurn,
                    lastMentioned: self.currentTurn,
                    dormantRounds: 0
                };
            }
        });
    },

    _migrateFromOldFormat: function() {
        var self = this;
        var oldData = null;
        try { oldData = Storage.getJSON(Storage.KEYS.ENHANCED_MEMORY, null); } catch(e) { oldData = null; }
        if (!oldData) return false;
        console.log('[GameMemory] 检测到旧版 EnhancedMemory 数据，开始迁移...');
        var old = oldData;
        var turn = (old.stats && old.stats.totalMessages) || 0;
        self.currentTurn = turn;
        if (old.workingMemory) {
            if (old.workingMemory.turns) self.workingMemory.turns = old.workingMemory.turns;
            if (old.workingMemory.messages) self.workingMemory.messages = old.workingMemory.messages;
        }
        if (old.shortTermMemory && old.shortTermMemory.summaries) {
            self.workingMemory.recentMessages = old.shortTermMemory.summaries.map(function(s) { return (typeof s === 'string') ? s : (s.storySummary || ''); });
        }
        var ltm = old.longTermMemory || {};
        if (ltm.worldAnchors && ltm.worldAnchors.length > 0) {
            var typeMap = { pc_identity: 'pcIdentity', setting: 'settings', world_rule: 'worldRules', npc_profile: 'npcProfiles', promise: 'promises', world_place: 'worldPlaces' };
            ltm.worldAnchors.forEach(function(a) {
                var key = typeMap[a.type] || 'settings';
                if (!self.permanentFacts[key]) self.permanentFacts[key] = [];
                self.permanentFacts[key].push({ content: a.content, source: a.source || 'auto', locked: a.locked !== false, createdTurn: a.createdTurn || turn });
            });
        }
        if (ltm.characterTable) {
            Object.keys(ltm.characterTable).forEach(function(name) {
                var c = ltm.characterTable[name];
                self.tables.characters[name] = {
                    name: c.name || name, title: c.title || '', relation: c.relation || '', mood: c.mood || '',
                    location: c.location || '', outfit: c.outfit || '', favorability: c.favorability, status: c.status || '',
                    history: (c.history || []).map(function(h) { return { turn: turn, changes: h.desc || '' }; }),
                    lastChangedTurn: turn, locked: false
                };
            });
        }
        if (ltm.itemTable) {
            Object.keys(ltm.itemTable).forEach(function(name) {
                var it = ltm.itemTable[name];
                self.tables.items[name] = {
                    name: it.name || name, qty: it.count || 1, unit: it.unit || '个', rarity: it.rarity || '普通',
                    desc: it.desc || '', obtainedTurn: turn, lastChangedTurn: turn,
                    history: (it.changeHistory || []).map(function(h) { return { turn: turn, from: h.change === '增加' ? (h.count - 1) : (h.count + 1), to: h.count }; })
                };
            });
        }
        if (ltm.locationTable) {
            Object.keys(ltm.locationTable).forEach(function(name) {
                self.tables.locations[name] = { name: name, desc: '', features: '', charactersPresent: '', lastChangedTurn: turn, locked: false };
            });
        }
        if (ltm.relationships) {
            Object.keys(ltm.relationships).forEach(function(key) {
                var rel = ltm.relationships[key];
                self.tables.relationships[rel.from + '->' + rel.to] = { from: rel.from, to: rel.to, type: rel.type || '', desc: rel.desc || '', lastChangedTurn: turn };
            });
        }
        if (ltm.mainPlot && ltm.mainPlot.length > 0) {
            self.plot.chapters = ltm.mainPlot.map(function(ch) { return { title: ch.title || '', summary: ch.summary || '', startTurn: ch.startTurn || 0, endTurn: ch.endTurn || 0 }; });
        }
        if (ltm.currentChapterSummary) self.plot.currentChapter = ltm.currentChapterSummary;
        if (ltm.importantEvents && ltm.importantEvents.length > 0) {
            self.events = ltm.importantEvents.map(function(e) {
                return { content: (typeof e === 'string') ? e : e.content, importance: e.importance || 5, turn: e.turn || 0, gameTime: '', decayScore: e.decayScore || e.importance || 5 };
            });
        }
        if (ltm.timeline && ltm.timeline.length > 0) {
            self.timeline = ltm.timeline.map(function(t) { return { turn: t.turn || 0, gameTime: t.relativeTime || '', summary: t.title || '' }; });
        }
        if (ltm.activeQuests && ltm.activeQuests.length > 0) {
            // 【P1修复P1-M】写入 title 字段（与 QuestMutator schema 对齐），兼容旧数据 content
            self.quests = ltm.activeQuests.map(function(q) { return { title: q.content || q.title || '', type: q.type || 'promise', status: q.status || 'pending', createdTurn: q.createdTurn || 0, resolvedTurn: q.resolvedAt ? turn : 0, stale: q.stale || false }; });
        }
        if (ltm.worldSetting) self.plot.worldSetting = ltm.worldSetting;
        if (old.stats) self.stats = { totalMessages: old.stats.totalMessages || 0, totalSummaries: old.stats.totalSummaries || 0, lastUpdateTime: old.stats.lastUpdateTime || null, tokenSaved: old.stats.tokenSaved || 0 };
        if (old.compressionConfig) { self.compressionConfig.triggerThreshold = old.compressionConfig.triggerThreshold || 0.75; self.compressionConfig.incrementalUpdate = old.compressionConfig.incrementalUpdate !== false; }
        self.saveToStorage();
        console.log('[GameMemory] 旧版数据迁移完成');
        // 【P0修复】permanentFacts 已从旧版数据迁移恢复，失效 longTermMemory 缓存
        self._ltmDirty = true;
        return true;
    },

    processMessage: function(role, content, gameData) {
        var self = this;
        try {
            var message = (typeof role === 'object') ? role : { role: role, content: content || '' };
            gameData = gameData || {};
            if (message.role === 'assistant' && message.content) {
                var parseResult = self.parseAIEditTags(message.content);
                message.content = parseResult.cleanedText;
                // 解析AI剧情计划标签（plan/recall/trigger/foreshadow）
                self._parseAIPlanTags(message.content);
            }
            self._extractAndRegisterPromises(message);
            self._addToWorkingMemory(message, gameData);
            var extractedInfo = self._extractImportantInfo(gameData);
            self._updateTables(gameData, extractedInfo);
            if (self._shouldUpdateLongTerm(extractedInfo)) self._updateLongTermMemory(message, gameData, extractedInfo);
            self._updateTimeline(message, gameData, extractedInfo);
            if (self.stats.totalMessages <= 2 || (self.stats.totalMessages % 5 === 0)) self._harvestWorldAnchors(gameData);
            if (self.stats.totalMessages % 10 === 0) self._cleanupQuests();
            self.currentTurn++;
            self.stats.totalMessages++;
            self.stats.lastUpdateTime = Date.now();
            self._detectChanges();
            // 关键词激活：更新记忆条目的访问计数（Arkhon风格：复用评分）
            self._updateAccessCounts(message);
            // 逐层摘要：更新摘要层级（Qvink风格）
            self._updateSummaryLayers();
            // 【优化】移除 compressSetupIfNeeded() 调用——函数体为空（仅有注释），是无用调用
            // 【AI叙事驱动】更新所有角色/物品/任务的休眠状态
            self._updateDormantStatus(message);
        } catch (e) {
            // 【P2清理】删除 self.stats.lastError 写入（写入后从不读取，全项目零消费）
            console.error('[GameMemory.processMessage] 内部错误（已记录，游戏继续）:', e);
        }
    },

    parseAIEditTags: function(text) {
        var self = this;
        if (!text || typeof text !== 'string') return { cleanedText: text || '', edits: [] };
        var edits = [];
        var cleanedText = text;
        var contentTagRe = /<mem\s+([^>]*?)>([\s\S]*?)<\/mem>/g;
        cleanedText = cleanedText.replace(contentTagRe, function(full, attrsStr, innerContent) {
            var attrs = self._parseMemAttrs(attrsStr);
            var type = attrs.type || '';
            var action = attrs.action || 'add';
            innerContent = (innerContent || '').trim();
            var edit = { type: type, action: action, raw: full };
            if (type === 'event' && action === 'add' && innerContent) {
                self.addImportantEvent({ content: innerContent, importance: 7, source: 'ai_edit' });
                edit.content = innerContent;
            } else if (type === 'quest') {
                if (action === 'add' && innerContent) { self.addQuest({ title: innerContent, type: 'quest', status: 'pending' }); edit.content = innerContent; }
                else if (action === 'resolve' && innerContent) { self.resolveQuest(innerContent, 'resolved'); edit.content = innerContent; }
            } else if (type === 'time') {
                if (attrs.day) self.gameClock.day = parseInt(attrs.day) || self.gameClock.day;
                if (attrs.period) self.gameClock.period = attrs.period;
                self.gameClock.lastUpdateTurn = self.currentTurn;
            }
            edits.push(edit);
            return '';
        });
        var selfClosingRe = /<mem\s+([^>]*?)\/>/g;
        cleanedText = cleanedText.replace(selfClosingRe, function(full, attrsStr) {
            var attrs = self._parseMemAttrs(attrsStr);
            var type = attrs.type || '';
            var edit = { type: type, attrs: attrs, raw: full };
            if (type === 'character' && attrs.name) {
                var charName = attrs.name;
                // 【P1-mem修复】防止原型污染：charName 和 field 都不能是危险 key
                if (!self._isSafeKey(charName) || !self._isSafeKey(attrs.field)) {
                    edit.skipped = true; edit.reason = 'unsafe_key';
                    edits.push(edit); return '';
                }
                var char = self.tables.characters[charName];
                if (attrs.field && attrs.value !== undefined) {
                    var oldValue = char ? char[attrs.field] : undefined;
                    if (char) {
                        if (char.locked) { edit.skipped = true; edit.reason = 'locked'; }
                        else {
                            char[attrs.field] = attrs.value;
                            char.lastChangedTurn = self.currentTurn;
                            if (!char.history) char.history = [];
                            char.history.push({ turn: self.currentTurn, changes: attrs.field + ': ' + (oldValue || '') + '→' + attrs.value });
                            if (char.history.length > 10) char.history = char.history.slice(-10);
                        }
                    } else {
                        self.tables.characters[charName] = { name: charName, title: '', relation: '', mood: '', location: '', outfit: '', favorability: 0, status: '', history: [{ turn: self.currentTurn, changes: attrs.field + ': ' + attrs.value }], lastChangedTurn: self.currentTurn, locked: false };
                        self.tables.characters[charName][attrs.field] = attrs.value;
                    }
                    self._changeLog.push({ turn: self.currentTurn, type: 'character', key: charName, field: attrs.field, oldValue: oldValue, newValue: attrs.value });
                }
            } else if (type === 'item' && attrs.name) {
                var itemName = attrs.name;
                // 【P1-mem修复】防止原型污染
                if (!self._isSafeKey(itemName)) {
                    edit.skipped = true; edit.reason = 'unsafe_key';
                    edits.push(edit); return '';
                }
                var action = attrs.action || 'add';
                var qty = safeInt(attrs.qty, 1);
                var item = self.tables.items[itemName];
                if (action === 'add') {
                    if (item) { var oldQty = item.qty; item.qty += qty; item.lastChangedTurn = self.currentTurn; if (!item.history) item.history = []; item.history.push({ turn: self.currentTurn, from: oldQty, to: item.qty }); if (item.history.length > 10) item.history = item.history.slice(-10); self._changeLog.push({ turn: self.currentTurn, type: 'item', key: itemName, field: 'qty', oldValue: oldQty, newValue: item.qty }); }
                    else { self.tables.items[itemName] = { name: itemName, qty: qty, unit: attrs.unit || '个', rarity: attrs.rarity || '普通', desc: attrs.desc || '', obtainedTurn: self.currentTurn, lastChangedTurn: self.currentTurn, history: [{ turn: self.currentTurn, from: 0, to: qty }] }; self._changeLog.push({ turn: self.currentTurn, type: 'item', key: itemName, field: 'qty', oldValue: 0, newValue: qty }); }
                } else if (action === 'remove' && item) { var oldQty2 = item.qty; item.qty = Math.max(0, item.qty - qty); item.lastChangedTurn = self.currentTurn; if (!item.history) item.history = []; item.history.push({ turn: self.currentTurn, from: oldQty2, to: item.qty }); if (item.history.length > 10) item.history = item.history.slice(-10); self._changeLog.push({ turn: self.currentTurn, type: 'item', key: itemName, field: 'qty', oldValue: oldQty2, newValue: item.qty }); }
                else if (action === 'change' && item) { var oldQty3 = item.qty; item.qty = qty; item.lastChangedTurn = self.currentTurn; if (!item.history) item.history = []; item.history.push({ turn: self.currentTurn, from: oldQty3, to: qty }); if (item.history.length > 10) item.history = item.history.slice(-10); self._changeLog.push({ turn: self.currentTurn, type: 'item', key: itemName, field: 'qty', oldValue: oldQty3, newValue: qty }); }
            } else if (type === 'location' && attrs.name) {
                var locName = attrs.name;
                // 【P1-mem修复】防止原型污染
                if (!self._isSafeKey(locName) || !self._isSafeKey(attrs.field)) {
                    edit.skipped = true; edit.reason = 'unsafe_key';
                    edits.push(edit); return '';
                }
                var loc = self.tables.locations[locName];
                if (attrs.field && attrs.value !== undefined) {
                    if (loc) { if (loc.locked) { edit.skipped = true; edit.reason = 'locked'; } else { var oldVal = loc[attrs.field]; loc[attrs.field] = attrs.value; loc.lastChangedTurn = self.currentTurn; self._changeLog.push({ turn: self.currentTurn, type: 'location', key: locName, field: attrs.field, oldValue: oldVal, newValue: attrs.value }); } }
                    else { self.tables.locations[locName] = { name: locName, desc: '', features: '', charactersPresent: '', lastChangedTurn: self.currentTurn, locked: false }; if (self.tables.locations[locName]) self.tables.locations[locName][attrs.field] = attrs.value; self._changeLog.push({ turn: self.currentTurn, type: 'location', key: locName, field: attrs.field, oldValue: '', newValue: attrs.value }); }
                }
            }
            edits.push(edit);
            return '';
        });
        cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n').trim();
        // 【数据联通】<mem> 直接写入权威源（gm.tables.* / gm.quests / gm.events），
        // 同步到 gameState 视图（UI 刷新由各调用方主动触发）
        if (edits.length > 0 && typeof _ensureDataLinkage === 'function') {
            try { _ensureDataLinkage(); } catch (e) { console.warn('[mem解析] 数据联通同步失败:', e); }
        }
        // 【P1修复BUG-2.2】移除 GameLinker.refreshByDataChange：死代码空操作
        return { cleanedText: cleanedText, edits: edits };
    },

    _parseMemAttrs: function(attrsStr) {
        var attrs = {};
        if (!attrsStr) return attrs;
        var re = /(\w+)\s*=\s*(?:"([^"]*?)"|'([^']*?)')/g;
        var m;
        // 【P1-mem修复】过滤危险 key，防止原型污染
        var DANGEROUS = { '__proto__': 1, 'constructor': 1, 'prototype': 1 };
        while ((m = re.exec(attrsStr)) !== null) {
            var key = m[1];
            if (DANGEROUS[key]) continue;
            attrs[key] = m[2] !== undefined ? m[2] : m[3];
        }
        return attrs;
    },

    // 【P1-mem修复】检查 key 是否安全（防止原型污染）
    _isSafeKey: function(key) {
        if (!key || typeof key !== 'string') return false;
        return key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
    },

    // ===== AI Plan 标签解析：让AI能表达剧情意图 =====
    // 支持的标签：
    // <plan>剧情计划描述</plan> - AI的编剧计划
    // <recall>角色名/物品名</recall> - 唤醒休眠的角色/物品
    // <trigger>伏笔ID</trigger> - 触发某个伏笔
    // <foreshadow id="xxx" priority="5">伏笔描述</foreshadow> - 注册新伏笔
    _parseAIPlanTags: function(text) {
        var self = this;
        if (!text || typeof text !== 'string') return;
        try {
            // 解析 <foreshadow> 标签
            var foreshadowRe = /<foreshadow\s+([^>]*?)>([\s\S]*?)<\/foreshadow>/g;
            var fm;
            while ((fm = foreshadowRe.exec(text)) !== null) {
                var fAttrs = self._parseMemAttrs(fm[1]);
                var fDesc = (fm[2] || '').trim();
                var fId = fAttrs.id || ('fs_' + self.currentTurn + '_' + Math.random().toString(36).substr(2, 6));
                var fPriority = safeInt(fAttrs.priority, 5);
                if (fDesc && self._dormantTracking && self._dormantTracking.foreshadowings) {
                    // 如果已存在相同描述的伏笔，不重复注册
                    var exists = Object.keys(self._dormantTracking.foreshadowings).some(function(k) {
                        var f = self._dormantTracking.foreshadowings[k];
                        return f && f.desc === fDesc;
                    });
                    if (!exists) {
                        self._dormantTracking.foreshadowings[fId] = {
                            desc: fDesc,
                            createdTurn: self.currentTurn,
                            dormantRounds: 0,
                            triggered: false,
                            priority: fPriority
                        };
                        console.log('[AI叙事] 注册新伏笔:', fId, fDesc);
                    }
                }
            }

            // 解析 <recall> 标签 - AI主动唤醒休眠角色/物品
            var recallRe = /<recall>([\s\S]*?)<\/recall>/g;
            var rm;
            while ((rm = recallRe.exec(text)) !== null) {
                var recallTarget = (rm[1] || '').trim();
                if (recallTarget) {
                    // 尝试匹配角色
                    if (self.tables.characters && self.tables.characters[recallTarget]) {
                        self._setDormantStatus('characters', recallTarget, 'active');
                        console.log('[AI叙事] AI唤醒角色:', recallTarget);
                    }
                    // 尝试匹配物品
                    if (self.tables.items && self.tables.items[recallTarget]) {
                        self._setDormantStatus('items', recallTarget, 'active');
                        console.log('[AI叙事] AI唤醒物品:', recallTarget);
                    }
                }
            }

            // 解析 <trigger> 标签 - AI触发伏笔
            var triggerRe = /<trigger>([\s\S]*?)<\/trigger>/g;
            var tm;
            while ((tm = triggerRe.exec(text)) !== null) {
                var triggerId = (tm[1] || '').trim();
                if (triggerId && self._dormantTracking && self._dormantTracking.foreshadowings) {
                    var fs = self._dormantTracking.foreshadowings[triggerId];
                    if (fs) {
                        fs.triggered = true;
                        fs.triggeredTurn = self.currentTurn;
                        console.log('[AI叙事] 伏笔已触发:', triggerId, fs.desc);
                    } else {
                        // 尝试按描述匹配
                        Object.keys(self._dormantTracking.foreshadowings).forEach(function(k) {
                            var f = self._dormantTracking.foreshadowings[k];
                            if (f && f.desc.indexOf(triggerId) >= 0) {
                                f.triggered = true;
                                f.triggeredTurn = self.currentTurn;
                                console.log('[AI叙事] 伏笔已触发(描述匹配):', k, f.desc);
                            }
                        });
                    }
                }
            }

            // 解析 <plan> 标签 - 记录AI的编剧计划（仅日志，不修改数据）
            var planRe = /<plan>([\s\S]*?)<\/plan>/g;
            var pm;
            while ((pm = planRe.exec(text)) !== null) {
                var planText = (pm[1] || '').trim();
                if (planText) {
                    console.log('[AI叙事] AI编剧计划:', planText.substring(0, 100) + (planText.length > 100 ? '...' : ''));
                }
            }
        } catch (e) {
            console.warn('[AI叙事] Plan标签解析错误:', e);
        }
    },

    // 设置某个实体的休眠状态
    _setDormantStatus: function(category, key, status) {
        var self = this;
        if (!self._dormantTracking || !self._dormantTracking[category]) return;
        var track = self._dormantTracking[category][key];
        if (!track) {
            self._dormantTracking[category][key] = {
                status: status,
                dormantSince: self.currentTurn,
                lastMentioned: self.currentTurn,
                dormantRounds: 0
            };
        } else {
            track.status = status;
            if (status === 'active') {
                track.dormantRounds = 0;
                track.lastMentioned = self.currentTurn;
            } else if (status === 'dormant' && track.status !== 'dormant') {
                track.dormantSince = self.currentTurn;
            }
        }
    },

    // 更新所有实体的休眠状态（每回合调用一次）
    _updateDormantStatus: function(message) {
        var self = this;
        if (!self._dormantTracking) return;
        var content = (message && message.content) || '';
        var currentTurn = self.currentTurn;
        var cfg = self._storytellingConfig || { dormantWarningThreshold: 20, dormantUrgentThreshold: 30 };

        // 辅助：检查内容中是否精确提到某个名称（避免子串误匹配）
        // 例如 "小明" 不会匹配 "小明王"，但会匹配 "小明说"、"叫小明"
        // 【P1-25修复】统一用边界检查，不再对长名称走 indexOf 子串匹配。
        // 旧实现对 ≤2 字名称用边界检查，对长名称直接 indexOf，导致：
        //   - "李明" 会匹配到 "李明星" → 误判角色被提及 → 不触发休眠提醒
        //   - "小明月" 中包含 "小明" → 误匹配
        // 现统一用 (?:^|[^\u4e00-\u9fa5a-zA-Z0-9]) + name + (?:[^\u4e00-\u9fa5a-zA-Z0-9]|$)
        // 对中文场景 \b 不可靠（\b 只在 ASCII 字符边界生效），故用 Unicode 范围排除。
        function isMentioned(name) {
            if (!name || name.length < 1) return false;
            var re = new RegExp('(^|[^\\u4e00-\\u9fa5a-zA-Z0-9])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^\\u4e00-\\u9fa5a-zA-Z0-9]|$)');
            return re.test(content);
        }

        // 更新角色休眠状态
        Object.keys(self.tables.characters || {}).forEach(function(name) {
            var track = self._dormantTracking.characters[name];
            if (!track) {
                track = { status: 'active', dormantSince: currentTurn, lastMentioned: currentTurn, dormantRounds: 0 };
                self._dormantTracking.characters[name] = track;
            }
            if (isMentioned(name)) {
                // 被提到 → 激活
                if (track.status !== 'active') {
                    track.status = 'active';
                    track.dormantRounds = 0;
                    console.log('[AI叙事] 角色激活:', name);
                }
                track.lastMentioned = currentTurn;
            } else {
                // 未被提到 → 增加休眠计数
                track.dormantRounds = currentTurn - track.lastMentioned;
                // 自动降级：active → linked → dormant
                if (track.status === 'active' && track.dormantRounds >= 5) {
                    track.status = 'linked';
                } else if (track.status === 'linked' && track.dormantRounds >= cfg.dormantWarningThreshold) {
                    track.status = 'dormant';
                }
            }
        });

        // 更新物品休眠状态
        Object.keys(self.tables.items || {}).forEach(function(name) {
            var track = self._dormantTracking.items[name];
            if (!track) {
                track = { status: 'active', dormantSince: currentTurn, lastMentioned: currentTurn, dormantRounds: 0 };
                self._dormantTracking.items[name] = track;
            }
            if (isMentioned(name)) {
                if (track.status !== 'active') {
                    track.status = 'active';
                    track.dormantRounds = 0;
                    console.log('[AI叙事] 物品激活:', name);
                }
                track.lastMentioned = currentTurn;
            } else {
                track.dormantRounds = currentTurn - track.lastMentioned;
                if (track.status === 'active' && track.dormantRounds >= 3) {
                    track.status = 'linked';
                } else if (track.status === 'linked' && track.dormantRounds >= cfg.dormantWarningThreshold) {
                    track.status = 'dormant';
                }
            }
        });

        // 更新任务休眠状态
        (self.quests || []).forEach(function(q) {
            var key = q.title || q.id || '';
            if (!key) return;
            var track = self._dormantTracking.quests[key];
            if (!track) {
                track = { status: q.status === 'pending' ? 'active' : 'dormant', dormantSince: currentTurn, lastMentioned: currentTurn, dormantRounds: 0 };
                self._dormantTracking.quests[key] = track;
            }
            if (q.status !== 'pending') {
                track.status = 'dormant';
                return;
            }
            if (isMentioned(key.substring(0, 10))) {
                if (track.status !== 'active') {
                    track.status = 'active';
                    track.dormantRounds = 0;
                }
                track.lastMentioned = currentTurn;
            } else {
                track.dormantRounds = currentTurn - track.lastMentioned;
                if (track.status === 'active' && track.dormantRounds >= 5) {
                    track.status = 'linked';
                } else if (track.status === 'linked' && track.dormantRounds >= cfg.dormantWarningThreshold) {
                    track.status = 'dormant';
                }
            }
        });

        // 更新伏笔休眠计数
        // 【P1-mem修复】同时淘汰过期的已触发/低优先级伏笔，防止无限增长
        var MAX_FORESHADOWINGS = 100;
        var FORESHADOW_EXPIRE_TURNS = 50;
        var fsKeys = Object.keys(self._dormantTracking.foreshadowings || {});
        fsKeys.forEach(function(fsId) {
            var fs = self._dormantTracking.foreshadowings[fsId];
            if (!fs) return;
            if (fs.triggered) {
                // 已触发的伏笔，超过阈值轮次后删除
                if (currentTurn - (fs.triggeredTurn || 0) > FORESHADOW_EXPIRE_TURNS) {
                    delete self._dormantTracking.foreshadowings[fsId];
                }
                return;
            }
            fs.dormantRounds = currentTurn - fs.createdTurn;
            // 未触发但休眠过久的低优先级伏笔，删除
            if (fs.dormantRounds > FORESHADOW_EXPIRE_TURNS && (fs.priority || 0) < 5) {
                delete self._dormantTracking.foreshadowings[fsId];
            }
        });
        // 硬上限：超过 100 条时，按优先级+创建时间淘汰最旧的
        var remaining = Object.keys(self._dormantTracking.foreshadowings || {});
        if (remaining.length > MAX_FORESHADOWINGS) {
            remaining.sort(function(a, b) {
                var fa = self._dormantTracking.foreshadowings[a];
                var fb = self._dormantTracking.foreshadowings[b];
                var pa = (fa.priority || 0), pb = (fb.priority || 0);
                if (pa !== pb) return pa - pb; // 优先级低的排前面（先删）
                return (fa.createdTurn || 0) - (fb.createdTurn || 0); // 旧的排前面
            });
            var toRemove = remaining.length - MAX_FORESHADOWINGS;
            for (let i = 0; i < toRemove; i++) {
                delete self._dormantTracking.foreshadowings[remaining[i]];
            }
        }
    },

    // 关键词激活：更新记忆条目的访问计数（含衰减机制）
    _updateAccessCounts: function(message) {
        var self = this;
        if (!message || !message.content) return;
        var content = message.content;
        // 每轮衰减：accessCount乘0.9，防止只增不减导致旧条目永远高权重
        if (self._lastDecayTurn !== self.currentTurn) {
            self._lastDecayTurn = self.currentTurn;
            ['characters', 'items', 'locations'].forEach(function(table) {
                Object.keys(self.tables[table] || {}).forEach(function(key) {
                    var entry = self.tables[table][key];
                    if (entry.accessCount) {
                        entry.accessCount = Math.round(entry.accessCount * 0.9);
                        if (entry.accessCount < 1) entry.accessCount = 0;
                    }
                });
            });
        }
        // 角色被提及时增加访问计数
        Object.keys(self.tables.characters).forEach(function(name) {
            if (content.indexOf(name) >= 0) {
                var c = self.tables.characters[name];
                if (!c.accessCount) c.accessCount = 0;
                c.accessCount++;
                c.lastAccessTurn = self.currentTurn;
            }
        });
        // 物品被提及时增加访问计数
        Object.keys(self.tables.items).forEach(function(name) {
            if (content.indexOf(name) >= 0) {
                var it = self.tables.items[name];
                if (!it.accessCount) it.accessCount = 0;
                it.accessCount++;
                it.lastAccessTurn = self.currentTurn;
            }
        });
        // 地点被提及时增加访问计数
        Object.keys(self.tables.locations).forEach(function(name) {
            if (content.indexOf(name) >= 0) {
                var loc = self.tables.locations[name];
                if (!loc.accessCount) loc.accessCount = 0;
                loc.accessCount++;
                loc.lastAccessTurn = self.currentTurn;
            }
        });
    },

    // 逐层摘要系统（Qvink风格）
    _updateSummaryLayers: function() {
        var self = this;
        var turns = self.workingMemory.turns || [];
        var totalTurns = turns.length;

        // 【阶段4修复重复注入】原 near 层注入最近3轮完整原文（玩家:xxx | AI:xxx），
        // 但 conversationHistory 也会把最近 N 轮原文作为 messages 发送给 API，
        // 导致同一份内容在 system prompt 和 messages 数组中重复出现，浪费大量 token。
        // 改为：near 层置空，最近3轮由 conversationHistory 唯一承载。
        // summaryLayers 只负责4轮以前的压缩（mid/far），避免剧情断层。
        self._summaryLayers.near = [];

        // 中层：4-10轮前，保留完整内容（不截断）
        if (totalTurns > 3) {
            var midTurns = turns.slice(Math.max(0, totalTurns - 10), totalTurns - 3);
            self._summaryLayers.mid = midTurns.map(function(t) {
                var parts = [];
                if (t && t.user) parts.push('玩家: ' + t.user);
                if (t && t.assistant) parts.push('AI: ' + t.assistant);
                return parts.join(' | ');
            });
        }

        // 远层：10轮以前，提取关键句（不截断单句，选择最重要的句子）
        if (totalTurns > 10) {
            var farTurns = turns.slice(0, totalTurns - 10);
            self._summaryLayers.far = farTurns.map(function(t) {
                var text = ((t && t.user) || '') + ((t && t.assistant) || '');
                // 提取关键句（含关键词的句子，保留完整语义）
                var sentences = text.split(/[。！？\n]/).filter(function(s) { return s.trim().length > 5; });
                var keySentences = sentences.filter(function(s) {
                    return /(约定|承诺|获得|失去|死亡|突破|发现|决定|重要|关键|转折)/.test(s);
                });
                if (keySentences.length === 0 && sentences.length > 0) keySentences = [sentences[sentences.length - 1]];
                return keySentences.map(function(s) { return s.trim(); }).join('；');
            }).filter(function(s) { return s && s.length > 0; });
        }

        // 【优化】移除 workingMemory.nearSummary/midSummary/farSummary 赋值——这 3 个字段是死字段，注入路径从不读取
    },

    // 变化驱动：检测某模块是否有变化（Horae风格）
    _hasModuleChanged: function(moduleKey, currentValue) {
        var snapshot = this._injectionSnapshots[moduleKey];
        if (!snapshot) return true; // 首次注入，视为有变化
        return snapshot !== currentValue;
    },

    // 变化驱动：保存注入快照
    _saveInjectionSnapshot: function(moduleKey, value) {
        this._injectionSnapshots[moduleKey] = value;
    },

    // 关键词激活：判断记忆条目是否与当前场景相关
    _isRelevantToScene: function(name, keywords, topic) {
        // 始终包含：最近变化过的、被频繁访问的
        // 按需包含：当前话题提及的
        if (!topic) topic = this.detectCurrentTopic();
        // 全局设定关键词匹配
        var setupKw = this._setupLayers.setupKeywords || [];
        if (setupKw.length > 0) {
            var recentText2 = '';
            try { if (typeof gameState !== 'undefined' && Array.isArray(gameState.conversationHistory)) recentText2 = gameState.conversationHistory.slice(-3).map(function(m) { return (m && m.content) || ''; }).join(' '); } catch(e) {}
            for (let ki = 0; ki < setupKw.length; ki++) {
                if (recentText2.indexOf(setupKw[ki]) >= 0) return true;
            }
        }
        // 当前话题提及
        if (topic.characters && topic.characters.indexOf(name) >= 0) return true;
        if (topic.items && topic.items.indexOf(name) >= 0) return true;
        if (topic.locations && topic.locations.indexOf(name) >= 0) return true;
        // 自带关键词匹配
        if (keywords && keywords.length > 0) {
            var recentText = '';
            try {
                if (typeof gameState !== 'undefined' && Array.isArray(gameState.conversationHistory)) {
                    recentText = gameState.conversationHistory.slice(-3).map(function(m) { return (m && m.content) || ''; }).join(' ');
                }
            } catch(e) {}
            for (let i = 0; i < keywords.length; i++) {
                if (recentText.indexOf(keywords[i]) >= 0) return true;
            }
        }
        return false;
    },

    // 开局设定智能分层（Lorebook风格：核心常驻+按需加载）
    processSetupPrompt: function(fullSetup) {
        // 【修复BUG-15】原 100 字符阈值过高，简短世界描述会被判定为"未初始化"
        // 只要是非空字符串（≥5 字符）就保存基础设定分层状态
        if (!fullSetup || fullSetup.length < 5) return;
        var self = this;
        self._setupLayers.fullSetup = fullSetup;
        self._setupLayers.compressed = false;
        self._setupLayers.extractTurn = self.currentTurn;

        // AI解析完成前的兜底方案：不截断，直接用完整设定
        // 截断会导致规则丢失（规则往往在设定后半段），不如完整保留
        self._setupLayers.coreRules = fullSetup;
        self._setupLayers.worldSummary = fullSetup;
        self.saveToStorage();

        // AI驱动解析：让AI自己分类、提取关键词、生成摘要
        self._aiParseSetup(fullSetup);
    },

    // AI驱动的设定解析（核心方法）
    _aiParseSetup: function(fullSetup) {
        var self = this;

        // 【提示词重设计】从「7条硬性提取要点」改为「场景化引导 + 信任模型」
        // 思路：让 AI 理解「两种设定稿的不同读法」和「为什么需要这些字段」
        var parsePrompt = '你正在帮一位游戏编剧解读一份设定稿——把它拆解成结构化卡片，方便后续剧情生成时按需调用。\n\n' +
            '这份设定稿可能是两种风格：\n' +
            '- 「游戏世界观」：含规则、体系、副本、职业、阵营……读这种稿时，重点抽「这个世界如何运转」\n' +
            '- 「纯角色卡」：含角色外貌、性格、背景、关系……读这种稿时，重点抽「这个角色是什么样的人、处于什么处境」\n' +
            '你根据内容本身判断风格，按风格重点抽取，别硬套。\n\n' +
            '你抽出来的东西会在后续剧情里被检索调用，所以请思考「AI 后续看到这个字段会怎么用」——能用的就抽，冗余的就别写。\n' +
            '- 硬性限制、铁律、不能违反的原则——这些是「承重墙」，一定要抽到 coreRules\n' +
            '- 世界观/角色核心概括——一句话能说清的事，就别用一段话；让后续 AI 30 秒内 get 到\n' +
            '- 重要角色——除了名字身份，给 5-10 个关键词帮后续 AI 快速 get 到这个人的调性，再加' + ((typeof getDynamicTruncationConfig === 'function') ? getDynamicTruncationConfig().characterSummaryChars : 500) + '字以内的具体描述（性格、外貌、与主角关系、关键特质）\n' +
            '- 角色原型——像「前任们」「追求者」这种群体性角色，提取类型、动机、与主角的关系模式，方便后续剧情生成新角色时参考\n' +
            '- 主角身份——如果设定里有明确主角，提取其核心身份标签\n' +
            '- 约定承诺——角色间有羁绊/约定/承诺，抽到 promises\n' +
            '- 全局关键词——贯穿全文的核心概念词，方便快速匹配\n\n' +
            '【为什么用JSON】前端按字段名读数据，字段名要准。直接输出原始JSON文本，别用markdown代码块包起来——解析器只认纯文本。\n\n' +
            '【设定内容】\n' + fullSetup;
        var messages = [
            { role: 'system', content: '你正在帮一位游戏编剧解读设定稿。' },
            { role: 'user', content: parsePrompt }
        ];

        // 按次计费优化：长设定需要更多输出token来完整解析，无上限
        var parseMaxTokens = Math.max(2000, Math.floor(fullSetup.length / 2));

        // 调用AI解析
        if (typeof callAI === 'function') {
            callAI(messages, { max_tokens: parseMaxTokens }).then(function(response) {
                try {
                    var content = response;
                    if (response && typeof response === 'object') {
                        if (response.choices && Array.isArray(response.choices) && response.choices[0] && response.choices[0].message && typeof response.choices[0].message.content === 'string') {
                            content = response.choices[0].message.content;
                        } else if (typeof response.content === 'string') {
                            content = response.content;
                        } else if (typeof response.text === 'string') {
                            content = response.text;
                        }
                    }
                    if (!content || typeof content !== 'string') {
                        console.warn('[设定解析] AI返回内容为空或格式异常');
                        return;
                    }
                    // 提取JSON
                    var jsonStr = content;
                    var jsonMatch = content.match(/\{[\s\S]*\}/);
                    if (jsonMatch) jsonStr = jsonMatch[0];

                    var parsed;
                    try { parsed = JSON.parse(jsonStr); } catch(jsonErr) {
                        // 尝试修复常见JSON问题：尾随逗号、单引号
                        try {
                            var fixed = jsonStr.replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"');
                            parsed = JSON.parse(fixed);
                        } catch(fixErr) {
                            console.warn('[设定解析] JSON解析失败，无法修复:', jsonErr);
                            return;
                        }
                    }
                    if (!isObject(parsed)) {
                        console.warn('[设定解析] AI返回JSON解析结果非对象');
                        return;
                    }
                    self._applyAIParsedSetup(parsed);
                } catch(e) {
                    console.warn('[设定解析] AI解析失败，使用默认分层:', e);
                    // 失败时保留简单截断方案
                }
            }).catch(function(e) {
                console.warn('[设定解析] AI调用失败:', e);
            });
        }
    },

    // 应用AI解析结果到记忆系统
    _applyAIParsedSetup: function(parsed) {
        var self = this;

        // 核心规则层（AI已经提取了最重要的规则，不截断）
        if (parsed.coreRules && parsed.coreRules.length > 0) {
            self._setupLayers.coreRules = parsed.coreRules.join('\n');
        }

        // 世界摘要层（AI已经总结了世界观，不截断）
        if (parsed.worldSummary) {
            self._setupLayers.worldSummary = parsed.worldSummary;
        }

        // 全局关键词
        if (parsed.setupKeywords && parsed.setupKeywords.length > 0) {
            self._setupLayers.setupKeywords = parsed.setupKeywords;
        }

        // 主角身份 → 永久事实（去重：覆盖旧身份，避免重复注入）
        if (parsed.playerIdentity) {
            self.permanentFacts.pcIdentity = self.permanentFacts.pcIdentity || [];
            // 只保留一条主角身份，新解析覆盖旧的
            self.permanentFacts.pcIdentity = [{ content: parsed.playerIdentity, locked: true, source: 'aiParse', createdTurn: self.currentTurn }];
        }

        // 核心规则 → 永久事实
        // 【动态化】移除 slice(0, 10) 硬上限——核心规则是"承重墙"，不应被截断
        // 旧代码只保留前 10 条规则，多余的规则 AI 后续看不到，导致世界观不一致
        // 新策略：保留所有规则，由 token 预算系统自然控制总量
        if (parsed.coreRules && parsed.coreRules.length > 0) {
            self.permanentFacts.worldRules = self.permanentFacts.worldRules || [];
            parsed.coreRules.forEach(function(rule) {
                if (!self.permanentFacts.worldRules.some(function(a) { return a && a.content === rule; })) {
                    self.permanentFacts.worldRules.push({ content: rule, locked: true });
                }
            });
        }

        // 约定 → 永久事实
        if (parsed.promises && parsed.promises.length > 0) {
            self.permanentFacts.promises = self.permanentFacts.promises || [];
            parsed.promises.forEach(function(p) {
                if (!self.permanentFacts.promises.some(function(a) { return a && a.content === p; })) {
                    self.permanentFacts.promises.push({ content: p, locked: true });
                }
            });
        }

        // 角色 → 永久事实 + 角色表（存储完整描述，注入时按需截取）
        if (parsed.characters && parsed.characters.length > 0) {
            self.permanentFacts.npcProfiles = self.permanentFacts.npcProfiles || [];
            parsed.characters.forEach(function(char) {
                // 永久事实：存储完整描述（不再截断），注入时按关键词匹配按需截取
                var profile = char.name + '：' + (char.summary || char.identity || '');
                if (char.keywords && char.keywords.length > 0) {
                    profile = char.name + '【' + char.keywords.join(',') + '】：' + (char.summary || char.identity || '');
                }
                if (!self.permanentFacts.npcProfiles.some(function(a) { return a && a.content && a.content.split('【')[0] === char.name; })) {
                    self.permanentFacts.npcProfiles.push({ content: profile, locked: true, keywords: char.keywords || [] });
                }
                // 角色表
                if (!self.tables.characters[char.name]) {
                    self.tables.characters[char.name] = {
                        name: char.name,
                        title: char.identity || '',
                        relation: char.identity || '',
                        mood: '',
                        location: '',
                        outfit: '',
                        favorability: 0,
                        status: '',
                        history: [],
                        lastChangedTurn: self.currentTurn,
                        gameTime: self.getGameTimeStr(),
                        accessCount: 0,
                        locked: false,
                        keywords: char.keywords || []
                    };
                } else {
                    // 已有角色，补充关键词
                    if (char.keywords && char.keywords.length > 0) {
                        self.tables.characters[char.name].keywords = char.keywords;
                    }
                }
            });
        }

        // 角色原型 → 永久事实（让AI知道有哪些类型的NPC可以出场）
        if (parsed.characterArchetypes && parsed.characterArchetypes.length > 0) {
            self.permanentFacts.npcProfiles = self.permanentFacts.npcProfiles || [];
            parsed.characterArchetypes.forEach(function(arch) {
                var desc = arch.type + '：动机-' + (arch.motivation || '未知') + '，关系模式-' + (arch.relationPattern || '未知');
                if (arch.example) desc += '（例：' + arch.example + '）';
                if (!self.permanentFacts.npcProfiles.some(function(a) { return a && a.content && a.content.indexOf(arch.type) === 0; })) {
                    self.permanentFacts.npcProfiles.push({ content: desc, locked: true, keywords: [arch.type, arch.motivation || ''] });
                }
            });
        }

        self.saveToStorage();
        console.log('[设定解析] AI解析完成，核心规则' + (parsed.coreRules ? parsed.coreRules.length : 0) + '条，角色' + (parsed.characters ? parsed.characters.length : 0) + '个，角色原型' + (parsed.characterArchetypes ? parsed.characterArchetypes.length : 0) + '个');

        // AI解析完成后，删除settings中来自userPrompt的原始整条设定（避免与结构化数据重复）
        if (self.permanentFacts.settings && self.permanentFacts.settings.length > 0) {
            var beforeLen = self.permanentFacts.settings.length;
            self.permanentFacts.settings = self.permanentFacts.settings.filter(function(a) {
                return !(a.source && (a.source === 'userPrompt' || a.source.indexOf('userPrompt:') === 0));
            });
            var removed = beforeLen - self.permanentFacts.settings.length;
            if (removed > 0) {
                console.log('[设定解析] 已清理' + removed + '条原始开场设定（已被AI结构化数据替代）');
                self.saveToStorage();
            }
        }

        // 【P0修复】permanentFacts 已变更（pcIdentity/worldRules/promises/npcProfiles/settings），
        // 失效 longTermMemory 缓存（覆盖本方法所有 permanentFacts 写入点）
        self._ltmDirty = true;
        // 【P1修复BUG-2.2】移除 GameLinker 通知：死代码空操作，UI 刷新由调用方主动触发
    },

    // 获取当前应该注入的设定文本（渐进式压缩策略）
    // 核心思路：不突然切换，而是随轮次逐步精简，始终保留结构
    getSetupInjection: function() {
        var self = this;
        var layers = self._setupLayers;

        // 如果没有处理过设定，返回null（让旧逻辑处理）
        if (!layers.fullSetup) return null;

        var result = '';

        // 【阶段4修复】增强记忆已注入核心规则和角色档案时，设定只保留叙述性内容
        // 避免同一条规则在【设定】和【当前状态与记忆】中重复出现
        // 【修复】原 hasMemoryInjection 只检查 worldRules/npcProfiles，漏了 settings/pcIdentity/promises，
        // 导致 permanentFacts 已有 settings 数据时仍走 else 分支注入【完整设定】造成重复
        var hasMemoryInjection = (self.permanentFacts &&
            ((self.permanentFacts.worldRules && self.permanentFacts.worldRules.length > 0) ||
             (self.permanentFacts.npcProfiles && self.permanentFacts.npcProfiles.length > 0) ||
             (self.permanentFacts.settings && self.permanentFacts.settings.length > 0) ||
             (self.permanentFacts.pcIdentity && self.permanentFacts.pcIdentity.length > 0) ||
             (self.permanentFacts.promises && self.permanentFacts.promises.length > 0) ||
             (self.permanentFacts.worldPlaces && self.permanentFacts.worldPlaces.length > 0)));

        if (hasMemoryInjection) {
            // 记忆系统已有结构化数据 → 设定只注入叙述性内容（外貌、性格描写、背景故事）
            // 核心规则和角色档案由记忆系统的【核心设定】负责，不重复
            if (layers.compressed && layers.compressedSetup) {
                result += '【设定（叙述层）】（核心规则和角色档案已在记忆区注入，此处为描写性内容）\n' + layers.compressedSetup;
            } else {
                // 没有精简版时，注入完整设定但标注去重
                result += '【设定（叙述层）】（核心规则和角色档案已在记忆区注入，此处为描写性内容，如有重复以记忆区为准）\n' + layers.fullSetup;
            }
        } else {
            // 记忆系统还没有数据（开局第一轮） → 完整注入
            if (layers.coreRules) {
                result += '【核心规则】\n' + layers.coreRules + '\n\n';
            }

            var ctxSize = (typeof gameState !== 'undefined' && gameState.contextSize) ? gameState.contextSize : 8000;
            if (!ctxSize || isNaN(ctxSize) || ctxSize <= 0) ctxSize = 8000;
            var setupTokens = estimateTokensUtil(layers.fullSetup);
            var setupRatio = setupTokens / ctxSize;

            if (layers.compressed && layers.compressedSetup && setupRatio > 0.4) {
                result += '【设定精简版】（原文' + layers.originalLength + '字，精简至' + layers.compressedLength + '字，完整规则见【核心设定】）\n' + layers.compressedSetup;
            } else {
                result += '【完整设定】\n' + layers.fullSetup;
            }
        }

        return result;
    },

    // 【P2清理】删除 _extractSectionIndex（全项目零调用）
    // 【优化】移除 compressSetupIfNeeded 空函数——函数体只有注释，processMessage 已不再调用
    // 保留此注释说明：渐进式压缩由 getSetupInjection 根据轮次自动处理，无需手动标记

    buildInjection: function() {
        var self = this;
        // 同轮次缓存：同一轮内多次调用直接返回缓存结果
        // 【优化】加入数据版本号：如果本轮数据有变化（如AI编辑了记忆），缓存失效
        var cacheVersion = self._getCacheVersion();
        if (self._cachedInjectionTurn === self.currentTurn && self._cachedInjection && self._cachedInjectionVersion === cacheVersion) {
            return self._cachedInjection;
        }
        self._adaptBudget();
        var budget = self.budget;
        var currentTurn = self.currentTurn;
        var lastTurn = self.lastInjectionTurn;
        var topic = self.detectCurrentTopic();
        var parts = [];
        
        // ═══ 第一层：永久事实（始终注入，最高优先级）═══
        var factLines = self._buildPermanentFactsSection();
        if (factLines.length > 0) {
            var factContent = factLines.join('\n');
            parts.push({ key: 'permanentFacts', priority: 10, lines: factLines, changed: true });
        }
        
        // ═══ 第二层：变化更新（变化驱动：无变化零Token）═══
        var changeLines = self._buildChangeUpdateSection(lastTurn);
        var changeContent = changeLines.join('\n');
        var changeChanged = self._hasModuleChanged('changes', changeContent);
        if (changeChanged && changeLines.length > 0) {
            parts.push({ key: 'changes', priority: 9, lines: changeLines, changed: true });
            self._saveInjectionSnapshot('changes', changeContent);
        }
        
        // ═══ 第三层：当前剧情 ═══
        var plotLines = self._buildPlotSection();
        if (plotLines.length > 0) parts.push({ key: 'plot', priority: 8, lines: plotLines, changed: true });
        
        // ═══ 第四层：进行中约定 ═══
        var questLines = self._buildQuestsSection();
        if (questLines.length > 0) parts.push({ key: 'quests', priority: 7, lines: questLines, changed: true });
        
        // ═══ 第五层：角色状态（关键词激活 + 变化驱动 + 时间锚点）═══
        var charLines = self._buildCharactersSection(lastTurn, topic);
        var charContent = charLines.join('\n');
        var charChanged = self._hasModuleChanged('characters', charContent);
        if (charLines.length > 0) {
            parts.push({ key: 'characters', priority: 6, lines: charLines, changed: charChanged });
            self._saveInjectionSnapshot('characters', charContent);
        }
        
        // ═══ 第六层：重要事件（时间锚点 + 增强衰减）═══
        var eventLines = self._buildEventsSection(lastTurn);
        if (eventLines.length > 0) parts.push({ key: 'events', priority: 5, lines: eventLines, changed: true });
        
        // ═══ 第七层：持有物品（关键词激活）═══
        var itemLines = self._buildItemsSection(lastTurn, topic);
        if (itemLines.length > 0) parts.push({ key: 'items', priority: 4, lines: itemLines, changed: true });
        
        // ═══ 第八层：场景状态（场景锁定）═══
        var sceneLines = self._buildSceneStateSection(topic);
        if (sceneLines.length > 0) parts.push({ key: 'sceneState', priority: 4, lines: sceneLines, changed: true });
        
        // ═══ 第九层：逐层摘要（替代原文工作记忆）═══
        var summaryLines = self._buildSummaryLayersSection();
        if (summaryLines.length > 0) parts.push({ key: 'summaryLayers', priority: 3, lines: summaryLines, changed: true });

        // ═══ 第十层：编剧提醒系统（AI剧情引导）═══
        var reminderLines = self._buildStorytellingReminders();
        if (reminderLines.length > 0) parts.push({ key: 'storytellingReminders', priority: 2, lines: reminderLines, changed: true });
        
        // 注入头尾模板——标题不仅标注分类，还告诉AI这层信息的用途
        var headers = {
            permanentFacts: '【核心设定（始终生效，冲突时以此为准）】\n',
            changes: '【本轮变化（第' + currentTurn + '回合，比旧状态更准确）】\n',
            plot: '【剧情进展（当前故事线）】\n',
            quests: '【进行中的约定（玩家承诺和任务）】\n',
            characters: '【角色近况（比世界快照中的角色数据更实时）】\n',
            events: '【重要事件（影响后续剧情的关键节点）】\n',
            items: '【持有物品（比世界快照中的背包数据更实时）】\n',
            sceneState: '【当前场景（角色所在的环境）】\n',
            summaryLayers: '【对话摘要（早期对话的浓缩版，细节以原文为准）】\n',
            storytellingReminders: '【编剧提醒（AI剧情引导提示）】\n'
        };
        var footers = {
            permanentFacts: '\n', changes: '\n', plot: '\n', quests: '\n',
            characters: '\n', events: '\n', items: '\n', sceneState: '\n', summaryLayers: '\n', storytellingReminders: '\n'
        };
        
        // 总量控制：超限时智能压缩而非直接丢弃
        // 第一步：组装所有模块的完整文本
        var moduleTexts = [];
        parts.forEach(function(p) {
            if (!p.changed) return;
            var header = headers[p.key] || '';
            var footer = footers[p.key] || '';
            var content = p.lines.join('\n');
            moduleTexts.push({ key: p.key, priority: p.priority, text: header + content + footer });
        });
        
        // 第二步：计算总量
        var totalChars = 0;
        moduleTexts.forEach(function(m) { totalChars += m.text.length; });
        
        // 第三步：如果超限，按优先级从低到高智能压缩（保留结构，精简内容，不丢弃）
        var maxChars = budget.maxChars;
        if (totalChars > maxChars) {
            // 按优先级从低到高排序（优先级低的先压缩）
            var sorted = moduleTexts.slice().sort(function(a, b) { return a.priority - b.priority; });
            var excess = totalChars - maxChars;
            for (let i = 0; i < sorted.length && excess > 0; i++) {
                var m = sorted[i];
                var originalLen = m.text.length;
                // 智能压缩：保留标题行和关键信息，精简详细描述
                m.text = self._smartCompressModule(m.text, m.key);
                var saved = originalLen - m.text.length;
                excess -= saved;
                // 如果压缩后仍然超限，选择关键行保留（不截断，避免语义断裂）
                if (excess > 0 && m.text.length > excess) {
                    var lines = m.text.split('\n');
                    var headerLine = lines[0] || '';
                    // 从标题行之后，按行选择保留（优先保留含关键信息的行）
                    var keptLines = [headerLine];
                    var usedChars = headerLine.length + 1;
                    var targetChars = m.text.length - excess;
                    for (let li = 1; li < lines.length; li++) {
                        if (usedChars + lines[li].length + 1 <= targetChars) {
                            keptLines.push(lines[li]);
                            usedChars += lines[li].length + 1;
                        }
                    }
                    if (keptLines.length > 1) {
                        m.text = keptLines.join('\n') + '\n(部分内容已精简)';
                    } else {
                        // 只剩标题，总比完全删除好
                        m.text = headerLine + '\n(内容已精简)';
                    }
                    excess -= (originalLen - m.text.length - saved);
                } else if (excess > 0) {
                    excess -= (originalLen - m.text.length - saved);
                }
            }
        }
        
        // 第四步：组装最终注入文本（按优先级从高到低排列）
        var injection = '';
        moduleTexts.filter(function(m) { return m.text.length > 0; })
            .sort(function(a, b) { return b.priority - a.priority; })
            .forEach(function(m) { injection += m.text; });
        
        self._lastInjectionStats = { totalChars: injection.length, budget: budget.maxChars, moduleChars: {}, skippedModules: [] };
        moduleTexts.forEach(function(m) {
            self._lastInjectionStats.moduleChars[m.key] = m.text.length;
        });
        parts.forEach(function(p) {
            if (!p.changed) self._lastInjectionStats.skippedModules.push(p.key);
        });
        self.lastInjectionTurn = currentTurn;
        self._cachedInjection = injection;
        self._cachedInjectionTurn = currentTurn;
        self._cachedInjectionVersion = self._getCacheVersion();
        return injection;
    },

    // 生成缓存版本号：基于数据变化状态，确保AI编辑记忆后缓存失效
    _getCacheVersion: function() {
        var self = this;
        var versionParts = [];
        versionParts.push(self.currentTurn);
        versionParts.push(self._changeLog ? self._changeLog.length : 0);
        versionParts.push(Object.keys(self.tables.characters).length);
        versionParts.push(Object.keys(self.tables.items).length);
        versionParts.push(self.quests ? self.quests.length : 0);
        versionParts.push(self.events ? self.events.length : 0);
        return versionParts.join('_');
    },

    buildSmartInjection: function() { return this.buildInjection(); },

    // 智能精简模块文本：不截断，用选择+结构化精简代替
    // 【优化】与三层架构配合：已经分层的模块（characters/items/quests）精简策略更激进
    // 核心原则：剧情游戏靠文字发展，截断会导致剧情断层
    // 策略：1.保留完整语义 2.去掉冗余修饰 3.内容太多时选择最重要的
    _smartCompressModule: function(text, moduleKey) {
        if (!text || text.length < 200) return text; // 太短不需要精简
        var lines = text.split('\n');
        var headerLine = lines[0] || '';
        var bodyLines = lines.slice(1);

        // 不同模块采用不同的精简策略
        // 【动态化】移除所有 substring 截断——注释说"绝不截断"但实际截断了，丢失角色/物品/约定信息
        // 新策略：只做字段级精简（如去掉 outfit），不做字符级截断，由 token 预算系统控制总量
        switch (moduleKey) {
            case 'characters':
                // 三层架构已分层，精简时只保留活跃角色的关键字段
                // 去掉 outfit（穿着细节），保留关系/好感/心情/位置/状态
                return headerLine + '\n' + bodyLines.map(function(line) {
                    return line.replace(/\s*\|\s*outfit:[^\n]*/g, '');
                }).join('\n');

            case 'items':
                // 三层架构已分层，保留完整物品信息
                return headerLine + '\n' + bodyLines.join('\n');

            case 'quests':
                // 保留完整约定内容
                return headerLine + '\n' + bodyLines.join('\n');

            case 'events':
                // 事件：按重要度选择，不截断单条
                // 优先保留高重要度事件，低重要度的排后面
                var sortedEvents = bodyLines.slice().sort(function(a, b) {
                    var aImportance = (a.match(/重要度(\d+)/) || [0, 0])[1];
                    var bImportance = (b.match(/重要度(\d+)/) || [0, 0])[1];
                    return parseInt(bImportance) - parseInt(aImportance);
                });
                return headerLine + '\n' + sortedEvents.join('\n');

            case 'summaryLayers':
                // 摘要：已经是AI总结的内容，不应该再截断
                return text;

            case 'sceneState':
                // 场景状态：保留完整信息，场景是当前剧情的舞台
                return text;

            case 'changes':
                // 变化更新：保留完整变化描述，截断会丢失状态变化
                return text;

            case 'permanentFacts':
                // 永久事实：最高优先级，绝对不截断
                return text;

            case 'storytellingReminders':
                // 编剧提醒：如果太长，优先保留角色和伏笔提醒
                return headerLine + '\n' + bodyLines.filter(function(line) {
                    return line.indexOf('【角色') >= 0 || line.indexOf('【伏笔') >= 0 ||
                           line.indexOf('• ') === 0 || line.indexOf('【编剧指导】') >= 0;
                }).join('\n');

            default:
                // 通用：默认不截断，保留完整语义
                return text;
        }
    },

    _buildPermanentFactsSection: function() {
        var lines = [];
        var pf = this.permanentFacts;
        // 【P1修复BUG-010】新增 worldPlaces 类目，确保 AI 在后续回合能看到已确定的地名
        var typeLabels = { pcIdentity: '主角身份', worldRules: '世界规则', settings: '世界设定', npcProfiles: '关键角色', promises: '玩家承诺', worldPlaces: '关键地点' };
        var topic = this.detectCurrentTopic();
        var topicKeywords = (topic && topic.keywords) ? topic.keywords : [];
        var topicChars = (topic && topic.characters) ? topic.characters : [];

        // 【Token优化】角色近况已注入时，核心设定中的角色档案精简为索引
        // 避免同一条角色信息在【核心设定】和【角色近况】中重复出现
        var hasCharSection = Object.keys(this.tables.characters).length > 0;

        ['pcIdentity', 'settings', 'worldRules', 'npcProfiles', 'promises', 'worldPlaces'].forEach(function(t) {
            var list = pf[t];
            if (list && list.length > 0) {
                lines.push('【' + typeLabels[t] + '】');
                if (t === 'npcProfiles') {
                    // 角色档案：按关键词匹配排序，相关角色优先注入
                    var sorted = list.slice().sort(function(a, b) {
                        var scoreA = 0, scoreB = 0;
                        var kA = (a && a.keywords) || [], kB = (b && b.keywords) || [];
                        var nameA = (a && a.content) ? a.content.split('【')[0] : '', nameB = (b && b.content) ? b.content.split('【')[0] : '';
                        // 当前话题中的角色最优先
                        if (topicChars.indexOf(nameA) >= 0) scoreA += 100;
                        if (topicChars.indexOf(nameB) >= 0) scoreB += 100;
                        // 关键词匹配
                        kA.forEach(function(k) { if (topicKeywords.indexOf(k) >= 0) scoreA += 10; });
                        kB.forEach(function(k) { if (topicKeywords.indexOf(k) >= 0) scoreB += 10; });
                        return scoreB - scoreA;
                    });
                    if (hasCharSection) {
                        // 【动态化】移除"只保留第一句/40字"截断——AI 需要完整角色档案来保持一致性
                        // 旧代码只保留角色名和第一句描述（最多40字），AI 看不到完整角色设定
                        // 新策略：保留完整角色内容，由 token 预算系统自然控制
                        sorted.forEach(function(a) {
                            if (a && a.content) {
                                lines.push('• ' + a.content);
                            }
                        });
                    } else {
                        sorted.forEach(function(a) { if (a && a.content) lines.push('• ' + a.content); });
                    }
                } else {
                    list.forEach(function(a) { if (a && a.content) lines.push('• ' + a.content); });
                }
            }
        });
        return lines;
    },

    // 通用变化行构建器：减少角色/物品变化的重复代码
    _buildEntityChangeLines: function(table, lastTurn, formatter) {
        var lines = [];
        var self = this;
        Object.keys(table).forEach(function(name) {
            var entity = table[name];
            if (entity && entity.lastChangedTurn > lastTurn) {
                lines.push(formatter(name, entity, self));
            }
        });
        return lines;
    },

    _buildChangeUpdateSection: function(lastTurn) {
        var lines = [];
        var self = this;
        var gameTime = self.getGameTimeStr();

        // 角色变化（使用通用构建器）
        lines = lines.concat(self._buildEntityChangeLines(self.tables.characters, lastTurn, function(name, c, ctx) {
            var relTime = ctx._calculateRelativeTime(c.gameTime || '');
            var timeTag = relTime ? '(' + relTime + ')' : '';
            var line = '• ' + name + timeTag;
            var changes = [];
            if (c.history && c.history.length > 0) {
                var lastH = c.history[c.history.length - 1];
                if (lastH.changes) changes.push(lastH.changes);
            }
            if (c.mood) changes.push('心情：' + c.mood);
            if (c.location) changes.push('位置：' + c.location);
            if (changes.length > 0) line += '：' + changes.join(' | ');
            return line;
        }));

        // 物品变化（使用通用构建器）
        lines = lines.concat(self._buildEntityChangeLines(self.tables.items, lastTurn, function(name, it, ctx) {
            var relTime = ctx._calculateRelativeTime(it.gameTime || '');
            var timeTag = relTime ? '(' + relTime + ')' : '';
            var line = '• 物品·' + name + timeTag;
            if (it.history && it.history.length > 0) {
                var lastH = it.history[it.history.length - 1];
                line += '：数量 ' + lastH.from + '→' + lastH.to;
            }
            return line;
        }));

        // 新事件
        self.events.forEach(function(e) {
            if (e && e.turn > lastTurn && e.content) {
                var relTime3 = self._calculateRelativeTime(e.gameTime || '');
                var timeTag3 = relTime3 ? ' [' + relTime3 + ']' : '';
                lines.push('• 新事件' + timeTag3 + '：' + e.content);
            }
        });

        // 时间变化
        if (self.gameClock.lastUpdateTurn > lastTurn) lines.push('• 时间：' + gameTime);
        return lines;
    },

    _buildPlotSection: function() {
        var lines = [];
        var self = this;
        if (this.plot.worldSetting) lines.push('【世界观】' + this.plot.worldSetting);
        var chs = this.plot.chapters;
        // 【修复BUG-07】注入去重：前 3 回合 worldSetting 与 chapters[0].summary 来自同一 storySummary，
        // 同一段文本若同时出现在【世界观】和【章节标题】段落会浪费 token 且语义重复
        var seen = {};
        if (this.plot.worldSetting) seen[this.plot.worldSetting] = true;
        var pushChapter = function(ch) {
            if (!ch || !ch.summary) return;
            if (seen[ch.summary]) return;  // 与 worldSetting 或前一个 chapter 重复则跳过
            seen[ch.summary] = true;
            lines.push('【' + ch.title + '】' + ch.summary);
        };
        if (chs && chs.length > 0) {
            pushChapter(chs[0]);
            if (chs.length > 1) chs.slice(-2).forEach(pushChapter);
        }
        if (this.plot.currentChapter) lines.push('【当前进展】' + this.plot.currentChapter);
        if (this.plot.pendingMysteries && this.plot.pendingMysteries.length > 0) { lines.push('【待解决悬念】'); this.plot.pendingMysteries.forEach(function(m) { lines.push('• ' + m); }); }
        return lines;
    },

    _buildQuestsSection: function() {
        var lines = [];
        var self = this;
        var currentTurn = self.currentTurn;
        var activeQuests = [];
        var linkedQuests = [];
        var dormantQuests = [];

        self.quests.forEach(function(q) {
            if (!q || !q.title) return;
            var track = self._dormantTracking && self._dormantTracking.quests ? self._dormantTracking.quests[q.title] : null;
            var status = track ? track.status : 'active';

            if (q.status !== 'pending') {
                // 已完成的任务进入休眠
                return;
            }

            if (status === 'active') {
                activeQuests.push(q);
            } else if (status === 'linked') {
                linkedQuests.push(q);
            } else {
                dormantQuests.push(q);
            }
        });

        // Active层：进行中的约定
        if (activeQuests.length > 0) {
            lines.push('【活跃约定（近期提及）】');
            activeQuests.forEach(function(q) {
                lines.push('• ' + q.title);
            });
        }

        // Linked层：一段时间未提及但仍重要的约定
        if (linkedQuests.length > 0) {
            lines.push('【待办约定（一段时间未推进）】');
            linkedQuests.forEach(function(q) {
                lines.push('• ' + q.title);
            });
        }

        // Dormant层：长期未推进的约定（提醒AI）
        if (dormantQuests.length > 0) {
            lines.push('【休眠约定（长期未推进，AI可考虑发展或放弃）】');
            dormantQuests.forEach(function(q) {
                lines.push('• ' + q.title);
            });
        }

        return lines;
    },

    _buildCharactersSection: function(lastTurn, topic) {
        var lines = [];
        var self = this;
        if (!topic) topic = self.detectCurrentTopic();
        var allChars = Object.keys(self.tables.characters).map(function(n) { return self.tables.characters[n]; });

        // 评分排序（访问计数 + 话题相关 + 近期变化 + 休眠状态）
        allChars.forEach(function(c) {
            var score = 0;
            var track = self._dormantTracking && self._dormantTracking.characters ? self._dormantTracking.characters[c.name] : null;
            var status = track ? track.status : 'active';
            // 活跃状态加分
            if (status === 'active') score += 1000;
            else if (status === 'linked') score += 300;
            else score += 50; // dormant 也有基础分，防止完全消失
            // 复用评分（Arkhon风格：被提及越多越重要）
            score += (c.accessCount || 0) * 5;
            // 话题相关
            if (topic.characters && topic.characters.indexOf(c.name) >= 0) score += 500;
            // 近期变化
            if (c.lastChangedTurn > lastTurn) score += 300;
            // 好感度极端值
            if (typeof c.favorability === 'number') score += Math.abs(c.favorability - 50);
            c._injectScore = score;
            c._dormantStatus = status;
        });
        allChars.sort(function(a, b) { return (b && b._injectScore || 0) - (a && a._injectScore || 0); });

        // 三层架构：Active（完整）/ Linked（压缩）/ Dormant（索引）
        var activeChars = [];
        var linkedChars = [];
        var dormantChars = [];

        allChars.forEach(function(c) {
            if (!c || !c.name) return;
            var status = c._dormantStatus || 'active';
            // 强制激活条件：近期变化、话题相关、好感极端
            var forceActive = false;
            if (c.lastChangedTurn > lastTurn) forceActive = true;
            if (topic.characters && topic.characters.indexOf(c.name) >= 0) forceActive = true;
            if (typeof c.favorability === 'number' && (c.favorability >= 80 || c.favorability <= 20)) forceActive = true;
            if ((c.accessCount || 0) >= 5) forceActive = true;

            if (status === 'active' || forceActive) {
                activeChars.push(c);
            } else if (status === 'linked') {
                linkedChars.push(c);
            } else {
                dormantChars.push(c);
            }
        });

        // Active层：完整信息
        if (activeChars.length > 0) {
            lines.push('【活跃角色（完整数据）】');
            activeChars.forEach(function(c) {
                var relTime = self._calculateRelativeTime(c.gameTime || '');
                var timeTag = relTime ? ' [' + relTime + ']' : '';
                var line = '• ' + c.name + timeTag;
                if (c.title) line += '（' + c.title + '）';
                if (c.relation) line += ' | 关系:' + c.relation;
                if (typeof c.favorability === 'number') line += ' | 好感:' + c.favorability;
                if (c.mood) line += ' | 心情:' + c.mood;
                if (c.location) line += ' | 位置:' + c.location;
                if (c.status) line += ' | ' + c.status;
                lines.push(line);
            });
        }

        // Linked层：压缩信息（只保留关键字段）
        if (linkedChars.length > 0) {
            lines.push('【关联角色（压缩数据）】');
            linkedChars.forEach(function(c) {
                var line = '• ' + c.name;
                if (c.title) line += '（' + c.title + '）';
                if (typeof c.favorability === 'number') line += ' | 好感:' + c.favorability;
                // 只保留最关键的状态
                if (c.status && c.status.indexOf('危') >= 0) line += ' | ' + c.status;
                lines.push(line);
            });
        }

        // Dormant层：仅索引（让AI知道有这些角色存在，但不给详细数据）
        if (dormantChars.length > 0) {
            lines.push('【休眠角色（仅索引，AI可主动唤醒）】');
            var names = dormantChars.map(function(c) { return c.name; }).join('、');
            lines.push('存在角色：' + names);
            lines.push('（这些角色已长期未出场，AI可在需要时使用<recall>' + dormantChars[0].name + '</recall>唤醒）');
        }

        return lines;
    },

    _buildEventsSection: function(lastTurn) {
        var lines = [];
        var self = this;
        self._recalcEventDecayScores(self.currentTurn);
        // 按次计费：不硬限制事件数，让预算系统通过智能压缩自然控制
        self.events.slice().sort(function(a, b) { return (b && b.decayScore || 0) - (a && a.decayScore || 0); }).forEach(function(e) {
            if (!e) return;
            // 【修复BUG-02】防御 content 为对象/非字符串：拼接前强制转字符串
            var content = e.content;
            if (content && typeof content === 'object') {
                content = String(content.title || content.name || content.content || content.event || content.desc || '');
            } else if (typeof content !== 'string') {
                content = String(content || '');
            }
            content = (content || '').trim();
            if (!content) return;
            var imp = e.importance || 5;
            var relTime = self._calculateRelativeTime(e.gameTime || '');
            var timeTag = relTime ? ' [' + relTime + ']' : '';
            lines.push((imp >= 9 ? '●' : (imp >= 7 ? '◐' : '○')) + '[重要度' + imp + ']' + timeTag + ' ' + content);
        });
        return lines;
    },

    _buildItemsSection: function(lastTurn, topic) {
        var lines = [];
        var self = this;
        if (!topic) topic = self.detectCurrentTopic();
        var allItems = Object.keys(self.tables.items).map(function(n) { return self.tables.items[n]; }).filter(function(it) { return it && it.qty > 0; });

        // 三层分类
        var activeItems = [];
        var linkedItems = [];
        var dormantItems = [];

        allItems.forEach(function(it) {
            if (!it || !it.name) return;
            var track = self._dormantTracking && self._dormantTracking.items ? self._dormantTracking.items[it.name] : null;
            var status = track ? track.status : 'active';

            // 强制激活条件
            var forceActive = false;
            if (it.lastChangedTurn > lastTurn) forceActive = true;
            if (topic.items && topic.items.indexOf(it.name) >= 0) forceActive = true;
            if ((it.accessCount || 0) >= 3) forceActive = true;
            if (it.rarity === '珍稀' || it.rarity === '传说') forceActive = true;

            if (status === 'active' || forceActive) {
                activeItems.push(it);
            } else if (status === 'linked') {
                linkedItems.push(it);
            } else {
                dormantItems.push(it);
            }
        });

        // Active层：完整信息
        if (activeItems.length > 0) {
            lines.push('【活跃物品（完整数据）】');
            activeItems.sort(function(a, b) {
                var aScore = (a.accessCount || 0) * 10 + (a.lastChangedTurn > lastTurn ? 100 : 0);
                var bScore = (b.accessCount || 0) * 10 + (b.lastChangedTurn > lastTurn ? 100 : 0);
                return bScore - aScore;
            }).forEach(function(it) {
                var line = '• ' + it.name;
                if (it.qty > 1) line += ' x' + it.qty + (it.unit || '');
                if (it.rarity && it.rarity !== '普通') line += ' [' + it.rarity + ']';
                if (it.desc) line += ' - ' + it.desc;
                lines.push(line);
            });
        }

        // Linked层：压缩信息
        if (linkedItems.length > 0) {
            lines.push('【关联物品（压缩数据）】');
            linkedItems.forEach(function(it) {
                var line = '• ' + it.name;
                if (it.qty > 1) line += ' x' + it.qty;
                if (it.rarity && it.rarity !== '普通') line += ' [' + it.rarity + ']';
                lines.push(line);
            });
        }

        // Dormant层：仅索引
        if (dormantItems.length > 0) {
            lines.push('【休眠物品（仅索引，AI可主动唤醒）】');
            var names = dormantItems.map(function(it) { return it.name + (it.qty > 1 ? 'x' + it.qty : ''); }).join('、');
            lines.push('持有物品：' + names);
        }

        return lines;
    },

    // 编剧提醒系统：检测休眠过久的角色/物品/任务/伏笔，给AI剧情引导提示
    // 【优化】加入上次出场状态上下文 + 场景关联提醒
    _buildStorytellingReminders: function() {
        var lines = [];
        var self = this;
        if (!self._storytellingConfig || !self._storytellingConfig.aiGuidanceEnabled) return lines;
        var cfg = self._storytellingConfig;
        var currentTurn = self.currentTurn;

        // 获取当前场景信息（用于场景关联提醒）
        var currentScene = self._getCurrentSceneInfo();

        // 1. 检测休眠过久的角色（需要AI唤醒）
        var dormantChars = [];
        Object.keys(self._dormantTracking.characters || {}).forEach(function(name) {
            var track = self._dormantTracking.characters[name];
            if (track && track.status === 'dormant' && track.dormantRounds >= cfg.dormantWarningThreshold) {
                var char = self.tables.characters[name];
                if (char) {
                    // 【优化】计算场景关联度
                    var sceneRelevance = self._calcSceneRelevance(char, currentScene);
                    dormantChars.push({
                        name: name,
                        rounds: track.dormantRounds,
                        urgent: track.dormantRounds >= cfg.dormantUrgentThreshold,
                        lastState: self._getEntityLastState('character', char),
                        sceneRelevance: sceneRelevance
                    });
                }
            }
        });

        // 2. 检测休眠过久的物品（需要AI消耗或使用）
        var dormantItems = [];
        Object.keys(self._dormantTracking.items || {}).forEach(function(name) {
            var track = self._dormantTracking.items[name];
            if (track && track.status === 'dormant' && track.dormantRounds >= cfg.dormantWarningThreshold) {
                var item = self.tables.items[name];
                if (item && item.qty > 0) {
                    dormantItems.push({
                        name: name,
                        rounds: track.dormantRounds,
                        qty: item.qty,
                        lastState: item.desc || ''
                    });
                }
            }
        });

        // 3. 检测休眠过久的任务（需要AI推进）
        var dormantQuests = [];
        Object.keys(self._dormantTracking.quests || {}).forEach(function(key) {
            var track = self._dormantTracking.quests[key];
            if (track && track.status === 'dormant' && track.dormantRounds >= cfg.dormantWarningThreshold) {
                dormantQuests.push({ content: key, rounds: track.dormantRounds });
            }
        });

        // 4. 检测未触发的伏笔（需要AI回收）
        var pendingForeshadows = [];
        Object.keys(self._dormantTracking.foreshadowings || {}).forEach(function(fsId) {
            var fs = self._dormantTracking.foreshadowings[fsId];
            if (fs && !fs.triggered && fs.dormantRounds >= cfg.foreshadowWarningThreshold) {
                pendingForeshadows.push({ id: fsId, desc: fs.desc, rounds: fs.dormantRounds, priority: fs.priority });
            }
        });

        // 按场景关联度排序角色（关联度高的优先提醒）
        dormantChars.sort(function(a, b) { return b.sceneRelevance.score - a.sceneRelevance.score; });

        // 生成提醒文本
        if (dormantChars.length > 0) {
            lines.push('【角色唤醒建议】');
            lines.push('以下角色已长期未出场，建议AI在合适时机通过<recall>角色名</recall>唤醒：');
            dormantChars.forEach(function(c) {
                var marker = c.urgent ? '【紧急】' : '';
                var sceneHint = c.sceneRelevance.score > 0 ? ' [场景关联：' + c.sceneRelevance.reason + ']' : '';
                var stateHint = c.lastState ? ' | 上次状态：' + c.lastState : '';
                lines.push('• ' + marker + c.name + '（已休眠' + c.rounds + '回合）' + sceneHint + stateHint);
            });
        }

        if (dormantItems.length > 0) {
            lines.push('【物品使用建议】');
            lines.push('以下物品已长期未被使用/提及，建议AI设计剧情让它们发挥作用：');
            dormantItems.forEach(function(it) {
                var descHint = it.lastState ? ' | ' + it.lastState : '';
                lines.push('• ' + it.name + ' x' + it.qty + '（已休眠' + it.rounds + '回合）' + descHint);
            });
        }

        if (dormantQuests.length > 0) {
            lines.push('【任务推进建议】');
            lines.push('以下约定/任务已长期未推进，建议AI设计剧情推动进展或给出放弃理由：');
            dormantQuests.forEach(function(q) {
                lines.push('• ' + q.title + '（已休眠' + q.rounds + '回合）');
            });
        }

        if (pendingForeshadows.length > 0) {
            lines.push('【伏笔回收建议】');
            lines.push('以下伏笔已铺设较长时间，建议AI在合适时机触发（使用<trigger>伏笔ID</trigger>）：');
            pendingForeshadows.sort(function(a, b) { return b.priority - a.priority; }).forEach(function(fs) {
                lines.push('• [' + fs.id + '] ' + fs.desc + '（已' + fs.rounds + '回合，优先级' + fs.priority + '）');
            });
        }

        // 5. 场景关联快速唤醒提示（高关联度角色直接提示）
        var nearbyChars = dormantChars.filter(function(c) { return c.sceneRelevance.score >= 2; });
        if (nearbyChars.length > 0) {
            lines.push('');
            lines.push('【场景关联快速提示】');
            lines.push('以下休眠角色与当前场景高度关联，非常适合立即唤醒：');
            nearbyChars.slice(0, 3).forEach(function(c) {
                lines.push('• ' + c.name + '（' + c.sceneRelevance.reason + '）← 推荐立即唤醒');
            });
        }

        // 6. 综合编剧指导（如果有很多休眠内容）
        var totalDormant = dormantChars.length + dormantItems.length + dormantQuests.length + pendingForeshadows.length;
        if (totalDormant >= 3) {
            lines.push('');
            lines.push('【编剧指导】');
            lines.push('当前有大量休眠剧情元素。作为编剧搭档，建议你：');
            lines.push('1. 选择一个休眠角色重新引入剧情（<recall>角色名</recall>）');
            lines.push('2. 让一个休眠物品发挥作用，或设计消耗/升级剧情');
            lines.push('3. 推进一个长期未动的任务，或给出合理的搁置理由');
            lines.push('4. 回收一个已铺设的伏笔，给玩家惊喜（<trigger>伏笔ID</trigger>）');
            lines.push('5. 如要注册新伏笔，使用<foreshadow id="唯一ID" priority="1-10">描述</foreshadow>');
        }

        return lines;
    },

    // 获取当前场景信息（用于场景关联提醒）
    _getCurrentSceneInfo: function() {
        var self = this;
        var scene = { location: '', charactersPresent: [], keywords: [] };
        // 从最近对话中提取地点
        try {
            if (typeof gameState !== 'undefined' && Array.isArray(gameState.conversationHistory)) {
                var recentText = gameState.conversationHistory.slice(-2).map(function(m) { return (m && m.content) || ''; }).join(' ');
                // 提取地点关键词
                var locPatterns = [/在([^，。！？\s]{2,8})(?:里|内|中|上|下|旁|边)/, /来到([^，。！？\s]{2,8})/, /前往([^，。！？\s]{2,8})/];
                locPatterns.forEach(function(p) {
                    var m = recentText.match(p);
                    if (m && m[1]) scene.keywords.push(m[1]);
                });
            }
        } catch(e) {}
        // 从角色表中找当前在场的角色
        Object.keys(self.tables.characters || {}).forEach(function(name) {
            var c = self.tables.characters[name];
            if (c && c.location) {
                scene.charactersPresent.push({ name: name, location: c.location });
            }
        });
        return scene;
    },

    // 计算角色与当前场景的关联度（0-3分）
    _calcSceneRelevance: function(char, scene) {
        var score = 0;
        var reasons = [];
        if (!char || !scene) return { score: 0, reason: '' };

        // 角色位置与当前场景关键词匹配
        if (char.location && scene.keywords.length > 0) {
            scene.keywords.forEach(function(kw) {
                if (char.location.indexOf(kw) >= 0 || kw.indexOf(char.location) >= 0) {
                    score += 2;
                    reasons.push('就在' + char.location);
                }
            });
        }

        // 角色位置与其他在场角色相同（暗示他们可能在同一地点）
        if (char.location && scene.charactersPresent.length > 0) {
            scene.charactersPresent.forEach(function(cp) {
                if (cp.name !== char.name && cp.location === char.location) {
                    score += 1;
                    reasons.push('与' + cp.name + '同在' + char.location);
                }
            });
        }

        // 角色好感度极端（剧情张力）
        if (typeof char.favorability === 'number' && (char.favorability >= 90 || char.favorability <= 10)) {
            score += 1;
            reasons.push(char.favorability >= 90 ? '好感极高' : '敌意极深');
        }

        return { score: score, reason: reasons.slice(0, 2).join('，') };
    },

    // 获取实体上次出场时的状态摘要
    _getEntityLastState: function(type, entity) {
        if (!entity) return '';
        var states = [];
        if (type === 'character') {
            if (entity.mood) states.push('心情' + entity.mood);
            if (entity.location) states.push('在' + entity.location);
            if (typeof entity.favorability === 'number') states.push('好感' + entity.favorability);
            if (entity.status) states.push('状态' + entity.status);
        }
        return states.join('，');
    },

    // 逐层摘要注入（Qvink风格：近详细→远压缩）
    // 按次计费：注入更多摘要，让AI掌握更多剧情脉络
    _buildSummaryLayersSection: function() {
        var lines = [];
        var self = this;
        // 远层：关键句
        if (self._summaryLayers.far && self._summaryLayers.far.length > 0) {
            lines.push('〔更早〕');
            self._summaryLayers.far.slice(-10).forEach(function(s) { if (s) lines.push('• ' + s); });
        }
        // 中层：压缩摘要
        if (self._summaryLayers.mid && self._summaryLayers.mid.length > 0) {
            lines.push('〔近期摘要〕');
            self._summaryLayers.mid.slice(-8).forEach(function(s) { if (s) lines.push('• ' + s); });
        }
        // 近层：详细
        if (self._summaryLayers.near && self._summaryLayers.near.length > 0) {
            lines.push('〔最近对话〕');
            self._summaryLayers.near.forEach(function(s) { if (s) lines.push('• ' + s); });
        }
        return lines;
    },

    // 场景状态注入（Horae风格：场景锁定）
    _buildSceneStateSection: function(topic) {
        var lines = [];
        var self = this;
        if (!topic) topic = self.detectCurrentTopic();
        // 当前所在地点的场景状态
        Object.keys(self.tables.locations).forEach(function(name) {
            var loc = self.tables.locations[name];
            if (!loc) return;
            // 只注入当前相关的地点
            if (!self._isRelevantToScene(name, loc.keywords, topic) && loc.lastChangedTurn < self.lastInjectionTurn) return;
            if (loc.sceneState) {
                var line = '• ' + name + '：' + loc.sceneState;
                if (loc.locked) line += ' [锁定]';
                lines.push(line);
            }
        });
        return lines;
    },

    _addToWorkingMemory: function(message, gameData) {
        var self = this;
        var MAX_TURNS = 3;
        if (!self.workingMemory.turns) self.workingMemory.turns = [];
        var currentTurn = self.workingMemory.turns[self.workingMemory.turns.length - 1];
        if (!currentTurn || currentTurn.assistant !== null) { currentTurn = { user: null, assistant: null, turn: self.currentTurn + 1, timestamp: Date.now() }; self.workingMemory.turns.push(currentTurn); }
        // 确保内容永远是字符串，防止对象被直接显示成 [object Object] 或 JSON
        var content = '';
        if (message && message.content !== undefined && message.content !== null) {
            content = typeof message.content === 'string' ? message.content : (typeof message.content === 'object' ? JSON.stringify(message.content) : String(message.content));
        }
        if (message && message.role === 'user') currentTurn.user = content;
        else if (message && message.role === 'assistant') currentTurn.assistant = content;
        while (self.workingMemory.turns.length > MAX_TURNS) self.workingMemory.turns.shift();
        self.workingMemory.messages = [];
        for (let i = 0; i < self.workingMemory.turns.length; i++) { var t = self.workingMemory.turns[i]; if (t && t.user !== null && t.user !== undefined) self.workingMemory.messages.push({ role: 'user', content: t.user, timestamp: t.timestamp, turn: t.turn }); if (t && t.assistant !== null && t.assistant !== undefined) self.workingMemory.messages.push({ role: 'assistant', content: t.assistant, timestamp: t.timestamp, turn: t.turn }); }
        self.workingMemory.timestamp = Date.now();
    },

    _extractImportantInfo: function(gameData) {
        var self = this;
        var info = { characters: [], items: [], locations: [], events: [], relationships: [], importance: 0 };
        if (!gameData) return info;
        if (Array.isArray(gameData.characters)) gameData.characters.forEach(function(char) { if (char) info.characters.push({ name: char.name, title: char.title, relation: char.relation, favorability: char.favorability, desc: char.desc }); });
        if (Array.isArray(gameData.bag)) gameData.bag.forEach(function(item) { if (item) info.items.push({ name: item.name, count: item.count, desc: item.desc, rarity: item.rarity }); });
        if (gameData.keyEvents && gameData.keyEvents.length > 0) { gameData.keyEvents.forEach(function(ev) {
            // 【修复BUG-02】防御事件为对象的情况：normalize 后可能仍残留对象，统一转字符串
            var content = ev;
            if (ev && typeof ev === 'object') {
                content = String(ev.title || ev.name || ev.content || ev.event || ev.desc || ev.description || '');
            } else if (typeof ev !== 'string') {
                content = String(ev || '');
            }
            content = (content || '').trim();
            if (!content) return;
            info.events.push({ content: content, importance: self.scoreEventImportance(content) });
        }); var maxImp = 0; info.events.forEach(function(e) { if (e.importance > maxImp) maxImp = e.importance; }); info.importance = Math.max(info.importance, maxImp); }
        if (gameData.relationships) { info.relationships = gameData.relationships; info.importance += 1; }
        if (gameData.story) { if (gameData.story.length > 500) info.importance += 1; if (gameData.story.length > 1000) info.importance += 2; }
        return info;
    },

    _updateTables: function(gameData, extractedInfo) {
        var self = this;
        var turn = self.currentTurn;
        if (!gameData) return;
        if (!extractedInfo) extractedInfo = { characters: [], items: [], events: [], relationships: [] };
        if (extractedInfo.characters && extractedInfo.characters.length > 0) {
            extractedInfo.characters.forEach(function(char) {
                if (!char || !char.name) return;
                var key = char.name;
                var existing = self.tables.characters[key];
                var isNew = !existing;
                self.tables.characters[key] = { name: char.name, title: char.title || (existing ? existing.title : ''), relation: char.relation || (existing ? existing.relation : ''), mood: (existing ? existing.mood : ''), location: (existing ? existing.location : ''), outfit: (existing ? existing.outfit : ''), favorability: (typeof char.favorability === 'number') ? char.favorability : (existing ? existing.favorability : 50), status: (existing ? existing.status : ''), history: existing && Array.isArray(existing.history) ? existing.history.concat([{ turn: turn, changes: char.desc || '' }]).slice(-10) : [{ turn: turn, changes: char.desc || '' }], lastChangedTurn: turn, gameTime: self.getGameTimeStr(), accessCount: existing ? (existing.accessCount || 0) : 0, locked: existing ? existing.locked : false };
                // 【P0-2.1 阶段1】任何对 self.tables.characters 的修改都必须失效 longTermMemory 缓存
                // 旧实现只在 NPC profile 进 permanentFacts 时置 dirty（行 2839），导致 characters/item/location/relationship
                // 修改后的 longTermMemory 缓存返回 stale data，记忆面板看不到新事实。
                self._ltmDirty = true;
                // 【修复】新角色首次出现时加入永久事实-关键角色，确保记忆面板及时更新
                if (isNew || (typeof char.favorability === 'number' && char.favorability > 0)) {
                    self.permanentFacts.npcProfiles = self.permanentFacts.npcProfiles || [];
                    var profileContent = char.name + '：' + (char.desc || char.title || char.relation || '新遇见的角色');
                    var alreadyExists = self.permanentFacts.npcProfiles.some(function(a) {
                        return a && a.content && a.content.indexOf(char.name + '：') === 0;
                    });
                    if (!alreadyExists) {
                        self.permanentFacts.npcProfiles.push({ content: profileContent, locked: false, source: 'runtime', createdTurn: turn });
                        console.log('[记忆系统] 新角色加入永久事实:', char.name);
                        // 【P0修复】permanentFacts 已变更，失效 longTermMemory 缓存
                        self._ltmDirty = true;
                    }
                }
            });
        }
        if (extractedInfo.items && extractedInfo.items.length > 0) {
            extractedInfo.items.forEach(function(item) {
                if (!item || !item.name) return;
                var key = item.name;
                var existing = self.tables.items[key];
                var oldQty = existing ? existing.qty : 0;
                var newQty = item.count || 1;
                self.tables.items[key] = { name: item.name, qty: newQty, unit: existing ? existing.unit : '个', rarity: item.rarity || (existing ? existing.rarity : '普通'), desc: item.desc || (existing ? existing.desc : ''), obtainedTurn: existing ? existing.obtainedTurn : turn, lastChangedTurn: turn, gameTime: self.getGameTimeStr(), accessCount: existing ? (existing.accessCount || 0) : 0, history: existing && Array.isArray(existing.history) ? existing.history.concat([{ turn: turn, from: oldQty, to: newQty }]).slice(-10) : [{ turn: turn, from: 0, to: newQty }] };
                // 【P0-2.1 阶段1】任何对 self.tables.items 的修改都必须失效 longTermMemory 缓存
                self._ltmDirty = true;
            });
        }
        if (gameData.story) { self._extractLocations(gameData.story).forEach(function(loc) { if (!self.tables.locations[loc]) self.tables.locations[loc] = { name: loc, desc: '', features: '', charactersPresent: '', lastChangedTurn: turn, locked: false }; else self.tables.locations[loc].lastChangedTurn = turn; }); }
        // 【P0-2.1 阶段1】locations 修改后失效 longTermMemory 缓存
        if (gameData.story) self._ltmDirty = true;
        if (gameData.relationships && Array.isArray(gameData.relationships)) gameData.relationships.forEach(function(rel) { if (rel && rel.from && rel.to) self.tables.relationships[rel.from + '->' + rel.to] = { from: rel.from, to: rel.to, type: rel.type, desc: rel.desc, lastChangedTurn: turn }; });
        // 【P0-2.1 阶段1】relationships 修改后失效 longTermMemory 缓存
        if (gameData.relationships && Array.isArray(gameData.relationships) && gameData.relationships.length > 0) self._ltmDirty = true;
    },

    _extractLocations: function(story) {
        var locations = [];
        if (!story) return locations;
        // 【修复BUG-12】扩展地点提取正则，覆盖常见句式
        // 注意：捕获组只取强地点上下文，避免“停下脚步”等被误判
        var patterns = [
            /在([^，。！？\s]{2,10})(?:里|内|中|旁|边|外|前|后|间|室|房|厅|楼|层)/g,
            /来到([^，。！？\s]{2,10})/g,
            /前往([^，。！？\s]{2,10})/g,
            /进入([^，。！？\s]{2,10})/g,
            /到达([^，。！？\s]{2,10})/g,
            /离开([^，。！？\s]{2,10})/g,
            /穿过([^，。！？\s]{2,10})/g,
            /站在([^，。！？\s]{2,10})(?:里|内|中|旁|边|外|前|后|口|前|后)/g,
            /([^，。！？\s]{2,10})(?:门口|前面|后面|里面|外面|旁边|附近|周围|区域|内部|外部)/g
        ];
        // 常见非地点词黑名单（情绪、感官、时间、方位副词、抽象概念、动词短语等）
        var blacklist = {
            '清晨': true, '早晨': true, '上午': true, '中午': true, '下午': true, '傍晚': true,
            '晚上': true, '夜晚': true, '深夜': true, '凌晨': true, '白天': true, '黑夜': true,
            '阳光': true, '月光': true, '灯光': true, '火光': true, '阴影': true, '黑暗': true,
            '光明': true, '夜色': true, '晨光': true, '暮光': true, '曙光': true, '余晖': true,
            '瞬间': true, '时刻': true, '时候': true, '时间': true, '片刻': true, '刹那': true,
            '眼前': true, '耳边': true, '身后': true, '背后': true, '身旁': true, '周围': true,
            '附近': true, '这里': true, '那里': true, '别处': true, '原地': true, '远处': true,
            '近处': true, '高空': true, '低空': true, '空中': true, '地上': true, '地下': true,
            '室内': true, '室外': true, '户外': true, '屋里': true, '屋外': true,
            '触觉': true, '听觉': true, '视觉': true, '嗅觉': true, '味觉': true,
            '绝望': true, '恐惧': true, '惊慌': true, '冷静': true, '紧张': true, '疲惫': true,
            '疼痛': true, '饥饿': true, '口渴': true, '寒冷': true, '炎热': true,
            '心中': true, '脑海': true, '思绪': true, '意识': true, '记忆': true,
            '下一秒': true, '下一刻': true, '片刻后': true, '不久后': true, '紧接着': true,
            '依靠': true, '深渊': true, '绝境': true, '危墙': true, '边缘': true,
            '脚步': true, '步子': true, '手中': true, '怀里': true, '面前': true, '跟前': true,
            '一路上': true, '一路': true, '原地': true, '当场': true, '暗自': true, '猛然': true,
            '缓缓': true, '慢慢': true, '迅速': true, '立刻': true, '随即': true, '忽然': true,
            '突然': true, '不禁': true, '不由': true, '心中': true, '心底': true
        };
        // 地点特征后缀白名单
        var locSuffixes = ['室', '房', '厅', '楼', '层', '间', '店', '铺', '库', '仓',
            '场', '馆', '园', '院', '所', '站', '口', '门', '窗', '梯', '台', '阶',
            '道', '路', '街', '巷', '桥', '洞', '穴', '窟', '牢', '狱', '塔', '堡',
            '镇', '城', '村', '区', '域', '带', '角', '边', '侧', '处', '地', '方'];
        // 常见动词/助词后缀：若捕获结果以这些结尾，大概率不是地点
        var verbSuffixes = ['停', '站', '坐', '躺', '蹲', '趴', '走', '跑', '跳', '追',
            '赶', '看', '望', '盯', '瞧', '听', '闻', '摸', '拿', '抓', '握', '抱',
            '举', '抬', '低', '转', '回', '过', '来', '去', '上', '下', '进', '出',
            '开', '关', '说', '喊', '叫', '笑', '哭', '想', '觉', '感', '知', '会',
            '能', '要', '想', '着', '了', '过', '得', '地', '的', '个', '位', '种'];
        patterns.forEach(function(pattern) {
            pattern.lastIndex = 0;
            var match;
            while ((match = pattern.exec(story)) !== null) {
                var loc = match[1].trim();
                // 基本长度过滤
                if (!loc || loc.length < 2 || loc.length >= 15) continue;
                // 【修复乱码】含"的"字大概率不是地点名（如"你的面"、"昏暗的林"）
                if (loc.indexOf('的') !== -1) continue;
                // 黑名单过滤
                if (blacklist[loc]) continue;
                // 纯数字/纯英文过滤
                if (/^\d+$/.test(loc) || /^[a-zA-Z]+$/.test(loc)) continue;
                // 含有明显非地点后缀过滤
                if (/[呢吗吧啊嘛矣呵哼]$/.test(loc)) continue;
                // 若以常见动词/助词结尾，过滤
                var lastChar = loc.charAt(loc.length - 1);
                if (verbSuffixes.indexOf(lastChar) !== -1) continue;
                // 若包含明显的人称/动作词，过滤
                if (/[你我他她它咱们他们她们它们]$/.test(loc)) continue;
                // 优先保留带地点特征后缀的词
                var hasLocSuffix = locSuffixes.some(function(suffix) {
                    return loc.indexOf(suffix) !== -1;
                });
                // 短词（2字）没有地点后缀，过滤
                if (loc.length <= 2 && !hasLocSuffix) continue;
                if (locations.indexOf(loc) === -1) locations.push(loc);
                if (match.index === pattern.lastIndex) pattern.lastIndex++;
            }
        });
        return locations;
    },

    _shouldUpdateLongTerm: function(extractedInfo) { if (!extractedInfo) return false; if (this.currentTurn % 5 === 0) return true; if (extractedInfo.importance >= 5) return true; if (extractedInfo.events && extractedInfo.events.length >= 2) return true; return false; },

    _updateLongTermMemory: function(message, gameData, extractedInfo) {
        var self = this;
        var currentTurn = self.currentTurn;
        var summary = self._generateSummary(message, gameData, extractedInfo);
        if (summary.storySummary) {
            if (currentTurn <= 3 && !self.plot.worldSetting) self.plot.worldSetting = summary.storySummary;
            var lastPlot = self.plot.chapters.length > 0 ? self.plot.chapters[self.plot.chapters.length - 1] : null;
            var isNewChapter = false;
            if (extractedInfo.importance >= 8) isNewChapter = true;
            if (lastPlot && summary.title && lastPlot.title !== summary.title) isNewChapter = true;
            if (!lastPlot || currentTurn - lastPlot.startTurn >= 10) isNewChapter = true;
            if (isNewChapter || !lastPlot) {
                if (self.plot.currentChapter && lastPlot) { lastPlot.summary = self.plot.currentChapter; lastPlot.endTurn = currentTurn - 1; }
                self.plot.chapters.push({ title: summary.title || ('第' + (self.plot.chapters.length + 1) + '章'), summary: summary.storySummary, startTurn: currentTurn, endTurn: currentTurn });
                if (self.plot.chapters.length > 5) { var first = self.plot.chapters[0]; var recent = self.plot.chapters.slice(-4); self.plot.chapters = [first].concat(recent); }
                self.plot.currentChapter = summary.storySummary;
            } else {
                self.plot.currentChapter += '\n' + summary.storySummary;
                if (Array.from(self.plot.currentChapter).length > 800) self.plot.currentChapter = self._smartTruncateSummary(self.plot.currentChapter, 600);
                lastPlot.summary = self.plot.currentChapter;
                lastPlot.endTurn = currentTurn;
            }
        }
        if (extractedInfo.events && extractedInfo.events.length > 0) {
            extractedInfo.events.forEach(function(event) {
                var content = (typeof event === 'string') ? event : (event && event.content);
                var imp = (typeof event === 'object' && event && event.importance) ? event.importance : 5;
                if (content && !self.events.some(function(e) { return e && e.content === content; })) self.events.push({ content: content, turn: currentTurn, gameTime: self.getGameTimeStr(), importance: imp, decayScore: imp });
            });
            self._recalcEventDecayScores(currentTurn);
            self._pruneImportantEvents(50);
            // 【阶段1-A2】统一同步：gm.events → StateManager.entities.events + gameState.keyEvents
            if (typeof _syncEventsToKeyEvents === 'function') _syncEventsToKeyEvents();
        }
    },

    _generateSummary: function(message, gameData, extractedInfo) {
        var summary = { turn: this.currentTurn + 1, timestamp: Date.now(), title: gameData ? gameData.title : '', storySummary: '', keyEvents: (extractedInfo && extractedInfo.events) || [], characters: (extractedInfo && extractedInfo.characters && Array.isArray(extractedInfo.characters)) ? extractedInfo.characters.map(function(c) { return c && c.name; }).filter(Boolean) : [], importance: (extractedInfo && extractedInfo.importance) || 0, changes: [] };
        if (gameData && gameData.contextSummary) summary.storySummary = gameData.contextSummary;
        else if (gameData && gameData.story) summary.storySummary = gameData.story;
        // 【动态化】移除 substring(0, 100) 截断——摘要应保留完整剧情，由预算系统控制长度
        // 旧代码截断到 100 字会导致 AI 看到的剧情摘要严重失真
        return summary;
    },

    _updateTimeline: function(message, gameData, extractedInfo) {
        this.timeline.push({ turn: this.currentTurn + 1, gameTime: this.getGameTimeStr(), summary: gameData ? (gameData.title || '') : '' });
        if (this.timeline.length > 50) this.timeline = this.timeline.slice(-50);
    },

    getGameTimeStr: function() { return '第' + this.gameClock.day + '天 ' + this.gameClock.period; },

    _calculateRelativeTime: function(gameTime) {
        if (!gameTime) return '';
        var dayMatch = gameTime.match(/第(\d+)天/);
        if (dayMatch) { var diff = this.gameClock.day - parseInt(dayMatch[1]); if (diff === 0) return '今天'; if (diff === 1) return '昨天'; if (diff === 2) return '前天'; if (diff < 7) return diff + '天前'; if (diff < 30) return Math.floor(diff / 7) + '周前'; return Math.floor(diff / 30) + '个月前'; }
        return gameTime;
    },

    // 【P2清理】删除 getRelativeTime（全项目零调用）
    addWorldAnchor: function(type, content, source, createdTurn) {
        var self = this;
        var typeMap = { pc_identity: 'pcIdentity', setting: 'settings', world_rule: 'worldRules', npc_profile: 'npcProfiles', promise: 'promises', world_place: 'worldPlaces' };
        var key = typeMap[type] || type;
        if (!self.permanentFacts[key]) self.permanentFacts[key] = [];
        if (self.permanentFacts[key].some(function(a) { return a && a.content === content; })) return null;
        if (type === 'npc_profile' && content) {
            var nameMatch = content.match(/^([一-鿿A-Za-z·]{1,6})/);
            if (nameMatch) {
                var name = nameMatch[1];
                for (let i = 0; i < self.permanentFacts[key].length; i++) {
                    var entry = self.permanentFacts[key][i];
                    if (entry && entry.content && entry.content.indexOf(name) === 0) {
                        if (entry.source === 'manual') return null;
                        self.permanentFacts[key][i] = { content: content, source: source || 'auto', locked: true, importance: 1.0, createdTurn: createdTurn || self.currentTurn };
                        return self.permanentFacts[key][i];
                    }
                }
            }
        }
        // 【P1优化】根据类型分配重要性权重
        // 核心设定(pc/世界规则/角色) = 1.0, 次要(设定/承诺) = 0.5
        var _importance = (type === 'pc_identity' || type === 'world_rule' || type === 'npc_profile') ? 1.0 : 0.5;
        // 【P1-12 阶段四】自动提取的事实不锁定，允许淘汰算法清理；手动添加的锁定保留
        var _isManual = (source === 'manual');
        var anchor = { content: content, source: source || 'auto', locked: _isManual, importance: _importance, createdTurn: createdTurn || self.currentTurn };
        self.permanentFacts[key].push(anchor);
        var total = 0; Object.keys(self.permanentFacts).forEach(function(k) { total += self.permanentFacts[k].length; });
        // 【P1优化】超过30条时按重要性权重淘汰（保留locked和高权重）
        // 避免100轮后token堆积膨胀
        if (total > 30) {
            Object.keys(self.permanentFacts).forEach(function(k) {
                var list = self.permanentFacts[k];
                if (!list || list.length === 0) return;
                // 找出可淘汰的（!locked），按重要性升序
                var evictable = list.filter(function(a) { return a && !a.locked; });
                if (evictable.length === 0) return;
                evictable.sort(function(a, b) {
                    return ((a.importance) || 0) - ((b.importance) || 0);
                });
                // 保留数量 = 当前key数 × (30/total)，最低5条
                var keep = Math.max(5, Math.floor(list.length * 30 / total));
                if (evictable.length > keep) {
                    var toEvict = evictable.slice(0, evictable.length - keep);
                    var evictSet = new Set(toEvict);
                    self.permanentFacts[k] = list.filter(function(a) { return !evictSet.has(a); });
                    console.log('[永久事实淘汰] ' + k + ': 淘汰' + toEvict.length + '条低权重事实, 保留' + self.permanentFacts[k].length);
                }
            });
        }
        // 【P0修复】permanentFacts 已变更，失效 longTermMemory 缓存
        self._ltmDirty = true;
        return anchor;
    },

    removeWorldAnchorsBySource: function(sourcePrefix) {
        var self = this; var removed = 0;
        Object.keys(self.permanentFacts).forEach(function(key) { var before = self.permanentFacts[key].length; self.permanentFacts[key] = self.permanentFacts[key].filter(function(a) { return !(a && a.source && a.source.indexOf(sourcePrefix) === 0); }); removed += before - self.permanentFacts[key].length; });
        if (removed > 0) try { self.saveToStorage(); } catch(e) { console.warn('[GameMemory] removeWorldAnchorsBySource 保存失败:', e); }
        // 【P0修复】permanentFacts 可能已变更，失效 longTermMemory 缓存
        if (removed > 0) self._ltmDirty = true;
        return removed;
    },

    syncWorldInfoEntry: function(entry, uid, bookId) {
        var self = this;
        if (!entry) return null;
        if (entry.enabled === false) { self.removeWorldAnchorsBySource('worldInfo:' + bookId + ':' + uid); return null; }
        var content = (entry.content || '').trim();
        if (!content) { self.removeWorldAnchorsBySource('worldInfo:' + bookId + ':' + uid); return null; }
        var shouldSync = !!entry.constant;
        var anchorType = 'worldRules';
        if (!shouldSync) { var ruleRe = /(设定|规则|世界观|铁律|守则|不变|永远|永不|不可|严禁|禁止|角色|主角|境界|等级|天道|法则)/; if (ruleRe.test(content) || ruleRe.test(entry.comment || '')) { shouldSync = true; anchorType = 'settings'; } }
        if (!shouldSync) return null;
        var sourceTag = 'worldInfo:' + bookId + ':' + uid;
        self.removeWorldAnchorsBySource(sourceTag);
        var label = entry.comment ? '【' + entry.comment + '】' : '';
        var syncContent = label ? label + ' ' + content : content;
        // 【动态化】移除 300 字截断——世界设定是核心信息，不应被截断
        // 旧代码截断到 300 字会导致长世界设定丢失后半段，AI 看到不完整的世界观
        // 新策略：保留完整内容，由 token 预算系统自然控制
        var created = self.addWorldAnchor(anchorType, syncContent, sourceTag, self.currentTurn);
        try { if (created) self.saveToStorage(); } catch(e) { console.warn('[GameMemory] syncWorldInfoEntry 保存失败:', e); }
        return created;
    },

    // 【P1修复P1-M】任务 schema 统一为 QuestMutator 版本：以 title 为身份字段
    // （原 content 字段已废弃，旧存档由 _migrateDataToV3 重命名）
    addQuest: function(quest) {
        if (!quest || !quest.title) return null;
        if (this.quests.some(function(q) { return q && q.title === quest.title && q.status === 'pending'; })) return null;
        if (!quest.createdTurn) quest.createdTurn = this.currentTurn;
        if (!quest.status) quest.status = 'pending';
        if (!quest.type) quest.type = 'promise';
        this.quests.push(quest);
        return quest;
    },

    // 【P2清理】删除 addActiveQuest（全项目零调用）
    resolveQuest: function(contentFragment, newStatus) {
        var self = this; var count = 0;
        self.quests.forEach(function(q) { if (q.status === 'pending' && q.title.indexOf(contentFragment) >= 0) { q.status = newStatus || 'resolved'; q.resolvedTurn = self.currentTurn; count++; } });
        return count;
    },

    _cleanupQuests: function() {
        var self = this; var currentTurn = self.currentTurn;
        self.quests = self.quests.filter(function(q) { if (q.status === 'resolved' || q.status === 'broken') { if (currentTurn - (q.resolvedTurn || currentTurn) > 30) return false; } if (q.status === 'pending') q.stale = (currentTurn - (q.createdTurn || 0)) > 50; return true; });
    },

    extractPromisesFromText: function(text) {
        if (!text || typeof text !== 'string') return [];
        var promises = []; var seen = {};
        for (let i = 0; i < this.PROMISE_KEYWORDS.length; i++) {
            var localRe = new RegExp(this.PROMISE_KEYWORDS[i].source, 'g');
            var m;
            while ((m = localRe.exec(text)) !== null) {
                var start = Math.max(0, m.index - 15); var end = Math.min(text.length, m.index + m[0].length + 25);
                var context = text.substring(start, end).replace(/\s+/g, ' ').trim();
                var key = text.substring(m.index, m.index + m[0].length);
                if (!seen[key]) { seen[key] = true; promises.push({ type: 'promise', content: context, fullMatch: m[0], importance: 10 }); }
                if (m.index === localRe.lastIndex) localRe.lastIndex++;
            }
        }
        return promises;
    },

    _extractAndRegisterPromises: function(message) {
        var self = this; var content = (message && message.content) || ''; if (!content) return [];
        var registered = [];
        self.extractPromisesFromText(content).forEach(function(p) {
            var anchor = self.addWorldAnchor('promise', p.content, message.role === 'user' ? 'player' : 'ai', self.currentTurn);
            if (anchor) registered.push(anchor);
            var quest = self.addQuest({ type: 'promise', title: p.content, status: 'pending' });
            if (quest) registered.push(quest);
        });
        return registered;
    },

    _harvestWorldAnchors: function(gameData) {
        var self = this;
        if (typeof gameState !== 'undefined' && gameState.worldSnapshot) {
            var snap = gameState.worldSnapshot;
            if (snap.summary) self.addWorldAnchor('pc_identity', snap.summary, 'worldSnapshot', self.currentTurn);
            if (Array.isArray(snap.characters)) snap.characters.forEach(function(c) { if (c && c.name) { var desc = c.desc ? c.name + '：' + c.desc : c.name; if (c.relation) desc += '（与玩家关系：' + c.relation + '）'; if (typeof c.favorability === 'number') desc += '，好感度' + c.favorability; self.addWorldAnchor('npc_profile', desc, 'worldSnapshot', self.currentTurn); } });
        }
        if (typeof gameState !== 'undefined' && gameState.userPrompt && self.currentTurn <= 2) {
            // 拆分存储：将玩家设定按段落拆分为独立条目，而非整条存入
            var prompt = gameState.userPrompt;
            var paragraphs = prompt.split(/\n+/).filter(function(p) { return p.trim().length > 0; });
            if (paragraphs.length <= 1) {
                // 只有一段，直接存入
                self.addWorldAnchor('setting', '玩家开场设定：' + prompt, 'userPrompt', self.currentTurn);
            } else {
                // 多段：每段作为独立条目存入
                paragraphs.forEach(function(para, idx) {
                    self.addWorldAnchor('setting', para.trim(), 'userPrompt:' + idx, self.currentTurn);
                });
            }
        }
        // 【优化】移除 customStyle 注入——customStyle 是死字段（无 UI 输入框），文风由 writingStyle 统一管理
    },

    scoreEventImportance: function(text) {
        if (!text) return 5; var score = 5;
        if (/(约定|承诺|发誓|答应|保证|一言为定)/.test(text)) score = 10;
        if (/(死|亡|牺牲|陨落|献祭|背叛|决裂|反目|断绝)/.test(text)) score = Math.max(score, 9);
        if (/(突破|渡劫|飞升|成仙|婚礼|结拜|拜师|收徒)/.test(text)) score = Math.max(score, 8);
        if (/(获得|得到|夺得|继承|传承|失去|丢失|告白|表白|拒绝|接受)/.test(text)) score = Math.max(score, 8);
        if (/(决战|生死|搏斗|战斗|死斗)/.test(text)) score = Math.max(score, 7);
        if (text.length < 8) score = Math.min(score, 4);
        if (/\d/.test(text) && (text.indexOf('境界') >= 0 || text.indexOf('级') >= 0 || text.indexOf('层') >= 0)) score = Math.max(score, 7);
        return score;
    },

    addImportantEvent: function(eventOrContent) {
        if (!this.events) this.events = [];
        var evt = (typeof eventOrContent === 'string') ? { content: eventOrContent, importance: 5 } : eventOrContent;
        if (!evt || !evt.content) return false;
        if (this.events.some(function(e) { return e.content === evt.content; })) return false;
        this.events.push({ content: evt.content, turn: this.currentTurn, gameTime: this.getGameTimeStr(), importance: evt.importance || 5, decayScore: evt.importance || 5, accessCount: 0 });
        this._pruneImportantEvents(50);
        // 【阶段1-A2】统一同步：gm.events → StateManager.entities.events（对象数组）+ gameState.keyEvents（字符串数组）
        if (typeof _syncEventsToKeyEvents === 'function') _syncEventsToKeyEvents();
        try { this.saveToStorage(); } catch(e) { console.warn('[GameMemory] addImportantEvent 保存失败:', e); }
        return true;
    },

    // 【阶段1-A2】批量添加事件（供 AIResponseMutator._applyKeyEvents 调用）
    // 避免 N 次 addImportantEvent = N 次 _syncEventsToKeyEvents + N 次 saveToStorage
    addImportantEvents: function(eventList) {
        if (!this.events) this.events = [];
        if (!Array.isArray(eventList) || eventList.length === 0) return 0;
        var self = this;
        var added = 0;
        eventList.forEach(function(evt) {
            if (!evt || !evt.content) return;
            if (self.events.some(function(e) { return e.content === evt.content; })) return;
            self.events.push({
                content: evt.content,
                turn: evt.turn !== undefined ? evt.turn : self.currentTurn,
                gameTime: evt.gameTime || self.getGameTimeStr(),
                importance: evt.importance || 5,
                decayScore: evt.decayScore || evt.importance || 5,
                accessCount: 0
            });
            added++;
        });
        if (added > 0) {
            self._pruneImportantEvents(50);
            // 批量同步：仅 1 次 _syncEventsToKeyEvents + 1 次 saveToStorage
            if (typeof _syncEventsToKeyEvents === 'function') _syncEventsToKeyEvents();
            try { self.saveToStorage(); } catch(e) { console.warn('[GameMemory] addImportantEvents 保存失败:', e); }
        }
        return added;
    },

    _recalcEventDecayScores: function(currentTurn) {
        this.events.forEach(function(e) {
            var age = Math.max(0, currentTurn - (e.turn || 0));
            var accessBonus = Math.min(3, (e.accessCount || 0) * 0.5);
            var decay = Math.max(0.3, 1 - age / 80);
            e.decayScore = (e.importance || 5) * decay + accessBonus;
            if (e.importance >= 9) e.decayScore = (e.importance || 5) * Math.max(0.6, 1 - age / 150) + accessBonus;
        });
    },

    _pruneImportantEvents: function(maxCount) {
        if (!this.events || this.events.length <= maxCount) return;
        this._recalcEventDecayScores(this.currentTurn);
        var epic = this.events.filter(function(e) { return e.importance >= 9; });
        var normal = this.events.filter(function(e) { return e.importance < 9; });
        epic.sort(function(a, b) { return b.decayScore - a.decayScore; });
        normal.sort(function(a, b) { return b.decayScore - a.decayScore; });

        // 【P0-3修复】恢复 epic 上限，按比例分配预算：
        // - 旧代码 var keptEpic = epic（无上限）导致 epic.length > maxCount 时
        //   normal.slice(0, max(0, maxCount - epic.length)) = []，等价于无任何裁剪
        //   长游戏（200 回合）后 events 膨胀到 200-400 条，buildSmartInjection 与
        //   saveToStorage 体积同步膨胀，最终触发配额错误
        // - 现策略：epic 占 60% 预算（至少 5 条），normal 占 40%
        //   保留重要事件优先权的同时强制 epic 也受裁剪
        // - 若 epic 实际数量 < 预算，剩余预算让渡给 normal
        var epicBudget = Math.max(5, Math.floor(maxCount * 0.6));
        var keptEpic = epic.slice(0, Math.min(epic.length, epicBudget));
        var normalBudget = Math.max(0, maxCount - keptEpic.length);
        var keptNormal = normal.slice(0, normalBudget);
        this.events = keptEpic.concat(keptNormal).sort(function(a, b) { return (a.turn || 0) - (b.turn || 0); });

        // 修复后裁剪监控：被丢弃事件数大于 0 时记录，便于排查
        if (keptEpic.length < epic.length) {
            console.log('[GameMemory] _pruneImportantEvents: epic 裁剪 '
                + (epic.length - keptEpic.length) + '/' + epic.length
                + ' 条（budget=' + epicBudget + ', maxCount=' + maxCount + '）');
        }
        if (keptNormal.length < normal.length) {
            console.log('[GameMemory] _pruneImportantEvents: normal 裁剪 '
                + (normal.length - keptNormal.length) + '/' + normal.length + ' 条');
        }
    },

    _smartTruncateSummary: function(text, maxChars) {
        if (!text) return ''; var arr = Array.from(text); if (arr.length <= maxChars) return text;
        var paragraphs = text.split(/\n+/); var keepHead = paragraphs[0] || ''; var tail = paragraphs.slice(1).join('\n');
        var tailBudget = maxChars - Array.from(keepHead).length - 20; if (tailBudget < 100) tailBudget = 100;
        var tailArr = Array.from(tail); var keptTail = tailArr.length > tailBudget ? tailArr.slice(tailArr.length - tailBudget).join('') : tail;
        return keepHead + '\n…(早期剧情已省略)…\n' + keptTail;
    },

    _detectChanges: function() { if (this._changeLog.length > 100) this._changeLog = this._changeLog.slice(-50); },

    detectCurrentTopic: function() {
        var topic = { characters: [], items: [], locations: [], keywords: [] };
        try {
            if (typeof gameState === 'undefined' || !Array.isArray(gameState.conversationHistory)) return topic;
            var allText = gameState.conversationHistory.slice(-3).map(function(m) { return (m && m.content) || ''; }).join(' ');
            var self = this;
            Object.keys(self.tables.characters).forEach(function(name) { if (allText.indexOf(name) >= 0) topic.characters.push(name); });
            Object.keys(self.tables.items).forEach(function(name) { if (allText.indexOf(name) >= 0) topic.items.push(name); });
            Object.keys(self.tables.locations).forEach(function(name) { if (allText.indexOf(name) >= 0) topic.locations.push(name); });
            // 提取关键词（动词+名词组合）
            var kwRe = /(?:在|去|来|到|找|打|杀|买|卖|给|拿|用|吃|喝|穿|学|练|修|突破|战斗|逃跑|追|躲|等|看|听|说|问|想|记|忘)([^，。！？\s]{2,8})/g;
            var m;
            while ((m = kwRe.exec(allText)) !== null) {
                var kw = m[1].trim();
                if (kw.length >= 2 && topic.keywords.indexOf(kw) === -1) topic.keywords.push(kw);
            }
        } catch(e) {}
        return topic;
    },

    _adaptBudget: function() {
        var ctxSize = (typeof gameState !== 'undefined' && gameState.contextSize) ? gameState.contextSize : 8000;
        if (!ctxSize || isNaN(ctxSize) || ctxSize <= 0) ctxSize = 8000;
        // 【修复】为AI生成保留至少30%的上下文空间，防止输入挤占导致输出为空
        // 原逻辑只留15%，在max_tokens较小时容易导致AI无输出空间
        // 字符/token比约1.7，所以 maxChars ≈ ctxSize * 0.70 * 1.7
        var base = Math.floor(ctxSize * 0.70 * 1.7);
        // 上下限保护
        if (base < 3500) base = 3500;
        if (base > 150000) base = 150000;
        this.budget.maxChars = base;
        // 按次计费：各模块理想预算也按比例放大
        var scale = base / 4000; // 以4000为基准缩放
        // 【优化】限制缩放倍数，避免大上下文模型在低优先级模块塞入过多内容
        if (scale > 15) scale = 15;
        var minB = this.budget.minBudget;
        var idealB = this.budget.idealBudget;
        if (minB) {
            minB.permanentFacts = Math.max(minB.permanentFacts || 0, Math.floor(1200 * scale));
            minB.quests = Math.max(minB.quests || 0, Math.floor(200 * scale));
            minB.plot = Math.max(minB.plot || 0, Math.floor(400 * scale));
            minB.characters = Math.max(minB.characters || 0, Math.floor(400 * scale));
            minB.events = Math.max(minB.events || 0, Math.floor(300 * scale));
            minB.items = Math.max(minB.items || 0, Math.floor(150 * scale));
            minB.workingMemory = Math.max(minB.workingMemory || 0, Math.floor(400 * scale));
            minB.sceneState = Math.max(minB.sceneState || 0, Math.floor(100 * scale));
            minB.summaryLayers = Math.max(minB.summaryLayers || 0, Math.floor(200 * scale));
        }
        if (idealB) {
            idealB.permanentFacts = Math.max(idealB.permanentFacts || 0, Math.floor(2500 * scale));
            idealB.quests = Math.max(idealB.quests || 0, Math.floor(300 * scale));
            idealB.plot = Math.max(idealB.plot || 0, Math.floor(600 * scale));
            idealB.characters = Math.max(idealB.characters || 0, Math.floor(600 * scale));
            idealB.events = Math.max(idealB.events || 0, Math.floor(500 * scale));
            idealB.items = Math.max(idealB.items || 0, Math.floor(200 * scale));
            idealB.workingMemory = Math.max(idealB.workingMemory || 0, Math.floor(600 * scale));
            idealB.sceneState = Math.max(idealB.sceneState || 0, Math.floor(200 * scale));
            idealB.summaryLayers = Math.max(idealB.summaryLayers || 0, Math.floor(400 * scale));
        }
    },

    shouldTriggerCompression: function(currentTokenCount, maxTokens) {
        var config = this.compressionConfig;
        var messageCount = (typeof gameState !== 'undefined' && gameState.conversationHistory) ? gameState.conversationHistory.length : 0;
        // 【P0修复】冷却检查使用 compressionConfig.lastCompressionTurn（回合维度）
        // 该字段由 recordCompression() 在压缩完成后更新（成功=完整冷却，失败=1回合短冷却）
        var currentTurn = (typeof gameState !== 'undefined' && gameState._stats) ? (gameState._stats.totalTurns || 0) : 0;
        var lastCompressTurn = config.lastCompressionTurn || 0;
        var turnsSinceLastCompress = currentTurn - lastCompressTurn;
        if (currentTokenCount > maxTokens * config.triggerThreshold) return { shouldCompress: true, reason: 'Token超限 (' + currentTokenCount + '/' + maxTokens + ')' };
        // 按次计费：放宽消息数量阈值，保留更多原文
        if (messageCount > 100) return { shouldCompress: true, reason: '消息数量过多 (' + messageCount + '条)' };
        // 冷却：至少经过 cooldownMinutes 等效回合数（用消息数估算，约10条/回合）后才考虑事件触发压缩
        if (turnsSinceLastCompress >= config.cooldownMinutes && messageCount >= 60) { var recentMessages = (typeof gameState !== 'undefined' && Array.isArray(gameState.conversationHistory)) ? gameState.conversationHistory.slice(-5) : []; if (recentMessages.some(function(m) { var c = (m && m.content) || ''; return c.indexOf('重要') >= 0 || c.indexOf('关键') >= 0 || c.indexOf('转折') >= 0; })) return { shouldCompress: true, reason: '检测到重要事件，建议压缩' }; }
        return { shouldCompress: false, reason: '暂不需要压缩' };
    },

    // 【P0修复】记录压缩完成，更新 lastCompressionTurn 回合基准
    // success: true=压缩成功（设完整冷却 cooldownMinutes 回合），false=压缩失败（设 1 回合短冷却）
    // 原 BUG：lastCompressionTurn 初始化为 0 后从未更新，导致 turnsSinceLastCompress 永远 = currentTurn，
    // 15 回合后事件触发冷却形同虚设（turnsSinceLastCompress >= cooldownMinutes 恒为 true）
    recordCompression: function(success) {
        // 【P1-26修复】统一用 self.currentTurn，不再读 gameState._stats.totalTurns。
        // GameMemory 内部其他 30+ 处都用 self.currentTurn，唯独此处读镜像字段。
        // gameState._stats 是 _syncLegacyMirror 的延后镜像，与 self.currentTurn 更新时机不同，
        // 可能导致压缩冷却计算偏差（turnsSinceLastCompress = currentTurn - lastCompressionTurn）。
        var currentTurn = this.currentTurn || 0;
        var cd = (this.compressionConfig && this.compressionConfig.cooldownMinutes) || 15;
        if (success) {
            this.compressionConfig.lastCompressionTurn = currentTurn;
        } else {
            // 失败：设 1 回合短冷却，使下一回合 turnsSinceLastCompress = cd，冷却刚好解除
            this.compressionConfig.lastCompressionTurn = currentTurn - cd + 1;
        }
    },

    search: function(keyword, options) {
        var results = { events: [], characters: [], items: [], summaries: [] };
        var self = this;
        this.events.forEach(function(e) { if (e && e.content && e.content.indexOf(keyword) !== -1) results.events.push(e); });
        Object.keys(self.tables.characters).forEach(function(name) { if (name.indexOf(keyword) !== -1) { var c = self.tables.characters[name]; if (c) results.characters.push(c); } });
        Object.keys(self.tables.items).forEach(function(name) { if (name.indexOf(keyword) !== -1) { var it = self.tables.items[name]; if (it) results.items.push(it); } });
        if (self.workingMemory.recentMessages && Array.isArray(self.workingMemory.recentMessages)) self.workingMemory.recentMessages.forEach(function(s) { if (s && s.indexOf(keyword) !== -1) results.summaries.push(s); });
        return results;
    },

    getStats: function() {
        return { totalMessages: this.stats.totalMessages, totalCharacters: Object.keys(this.tables.characters).length, totalItems: Object.keys(this.tables.items).length, totalLocations: Object.keys(this.tables.locations).length, totalEvents: this.events.length, timelineLength: this.timeline.length, memorySize: JSON.stringify(this).length };
    },

    saveToStorage: function() {
        var self = this;
        if (self._saving) { self._pendingSave = true; return; }
        self._saving = true;
        try {
            // 保存前清理 _changeLog，只保留最近20条
            if (self._changeLog && self._changeLog.length > 20) self._changeLog = self._changeLog.slice(-20);
            var data = { version: self.version, currentTurn: self.currentTurn, lastInjectionTurn: self.lastInjectionTurn, gameClock: self.gameClock, permanentFacts: self.permanentFacts, tables: self.tables, plot: self.plot, events: self.events, timeline: self.timeline, quests: self.quests, workingMemory: self.workingMemory, budget: self.budget, compressionConfig: self.compressionConfig, stats: self.stats, _changeLog: self._changeLog, _injectionSnapshots: self._injectionSnapshots, _summaryLayers: self._summaryLayers, _setupLayers: self._setupLayers, _dormantTracking: self._dormantTracking, _storytellingConfig: self._storytellingConfig, _worldNotes: self._worldNotes || [], savedAt: Date.now() };
            var result = Storage.setJSON(Storage.KEYS.MEMORY, data);
            if (!result || result.success === false) self._handleSaveFailure(result, data);
        } catch(e) { self._handleSaveFailure({ error: 'serialize_error', message: e.message }, null); }
        finally { self._saving = false; if (self._pendingSave) { self._pendingSave = false; if (typeof TimerManager !== 'undefined' && TimerManager.setTimeout) { TimerManager.setTimeout('gameMemoryDeferredSave', function() { self.saveToStorage(); }, 50); } else { setTimeout(function() { self.saveToStorage(); }, 50); } } }
    },

    _handleSaveFailure: function(result, originalData) {
        // 【P1-TC1 阶段4】失败重试次数上限 + UI 提示
        // 旧逻辑：catch 静默吞错，finally 块调度 50ms 后无限重试，
        // 若降级保存持续失败（如 storage 满）会进入死循环。
        // 新逻辑：累计重试 ≥3 次后停止并 toast 告知用户，避免静默耗电/性能。
        this._saveFailureCount = (this._saveFailureCount || 0) + 1;
        try {
            console.warn('[GameMemory] 保存失败，降级处理 (' + this._saveFailureCount + '/3):', (result && result.message) || 'unknown');
            if (this.timeline && this.timeline.length > 20) this.timeline = this.timeline.slice(-20);
            if (this.events && this.events.length > 20) this.events = this.events.slice(-20);
            this._changeLog = [];
            var reduced = { version: this.version, currentTurn: this.currentTurn, lastInjectionTurn: this.lastInjectionTurn, gameClock: this.gameClock, permanentFacts: this.permanentFacts, tables: this.tables, plot: this.plot, events: this.events, timeline: this.timeline, quests: this.quests, workingMemory: this.workingMemory, _injectionSnapshots: this._injectionSnapshots, _summaryLayers: this._summaryLayers, _setupLayers: this._setupLayers, _dormantTracking: this._dormantTracking, _storytellingConfig: this._storytellingConfig, _worldNotes: this._worldNotes || [], stats: this.stats, savedAt: Date.now() };
            var r2 = Storage.setJSON(Storage.KEYS.MEMORY, reduced);
            if (r2 && r2.success) {
                console.log('[GameMemory] 降级保存成功');
                this._saveFailureCount = 0;
            } else {
                console.error('[GameMemory] 降级保存仍然失败：', r2);
                if (this._saveFailureCount >= 3 && typeof UI !== 'undefined' && UI.toast) {
                    UI.toast('存档连续失败，请检查浏览器存储空间');
                }
            }
        } catch(e2) {
            console.error('[GameMemory] 降级保存异常：', e2);
            if (this._saveFailureCount >= 3 && typeof UI !== 'undefined' && UI.toast) {
                UI.toast('存档异常：' + (e2 && e2.message || '未知'));
            }
        }
    },

    loadFromStorage: function() {
        var self = this; var data = null;
        try { data = Storage.getJSON(Storage.KEYS.MEMORY, null); } catch(e) { data = null; }
        // 【修复 P0-6】链式迁移：支持 v1/v2/v3/v4 → 当前 v4，旧版本不再静默丢弃
        // 旧代码 `if (!data || data.version !== 3) return false;` 会让 v2 数据被静默丢弃
        // 【P1修复P1-M】版本升至 v4：quests 条目 content 字段重命名为 title
        if (!data) return false;
        if (data.version !== 4) {
            console.warn('[GameMemory] 检测到旧版本数据 v' + data.version + '，开始迁移到 v4');
            // 备份原始数据，防止迁移失败导致数据丢失
            try {
                Storage.setJSON(Storage.KEYS.MEMORY + '_backup_v' + (data.version || 0), data);
            } catch(backupErr) {
                console.warn('[GameMemory] 备份旧版数据失败（继续迁移）:', backupErr);
            }
            data = this._migrateDataToV3(data);
            if (!data) {
                console.error('[GameMemory] 迁移失败，数据无法加载');
                if (typeof UI !== 'undefined' && UI.toast) {
                    UI.toast('记忆数据版本过旧且迁移失败，已备份原始数据');
                }
                return false;
            }
            // 迁移成功后立即保存为新版本
            // 【I修复】移除冗余 try/catch：简单属性赋值无抛错可能
            this._migratedData = data;
            console.log('[GameMemory] 迁移到 v4 完成');
        }
        // 顶层字段映射（data.key → self.key，按顺序应用；undefined 不覆盖）
        var topFields = ['currentTurn', 'lastInjectionTurn', 'gameClock', 'permanentFacts', 'tables', 'plot', 'events', 'timeline', 'quests', 'workingMemory', 'budget', 'compressionConfig', 'stats', '_changeLog', '_injectionSnapshots', '_summaryLayers', '_setupLayers', '_dormantTracking', '_storytellingConfig', '_worldNotes'];
        for (let i = 0; i < topFields.length; i++) { var k = topFields[i]; if (data[k] !== undefined) self[k] = data[k]; }
        // 嵌套对象默认值补全
        if (!self.workingMemory.turns) self.workingMemory.turns = [];
        if (!self.workingMemory.messages) self.workingMemory.messages = [];
        if (!self.workingMemory.recentMessages) self.workingMemory.recentMessages = [];
        if (!self.plot.pendingMysteries) self.plot.pendingMysteries = [];
        if (!self._injectionSnapshots) self._injectionSnapshots = {};
        if (!self._summaryLayers) self._summaryLayers = { near: [], mid: [], far: [] };
        if (!self._setupLayers) self._setupLayers = { coreRules: '', worldSummary: '', fullSetup: '', compressed: false, extractTurn: -1, setupKeywords: [] };
        if (!self._setupLayers.setupKeywords) self._setupLayers.setupKeywords = [];
        // 加载后初始化休眠追踪（兼容旧存档）
        self._initDormantTracking();
        // 【P0修复】permanentFacts 已从存档恢复，失效 longTermMemory 缓存
        self._ltmDirty = true;
        // 迁移成功后异步保存
        if (this._migratedData) {
            this._migratedData = null;
            var migrateSelf = this;
            TimerManager.setTimeout('migrateMemorySave', function() { migrateSelf.saveToStorage(); }, 100);
        }
        return true;
    },

    // 【修复 P0-6】将旧版本数据结构迁移到当前版本
    // 支持 v1（无 version 字段）、v2（旧 EnhancedMemory 格式）、v3 → v4
    // 【P1修复P1-M】v3→v4：任务 schema 统一为 QuestMutator 版本，quests 条目
    // 的 content 字段重命名为 title（与 QuestMutator.normalizeQuest 输出对齐），
    // 消除 core.js 内 title↔content 别名映射。
    _migrateDataToV3: function(data) {
        try {
            var v = data.version || 1;
            // v1/v2/v3 → v4：字段结构基本兼容，只需补全缺失字段并修正版本号
            var migrated = StateSchema.deepClone(data);
            // 补全 v3 新增字段
            if (!migrated.permanentFacts) migrated.permanentFacts = { pcIdentity: [], worldRules: [], settings: [], npcProfiles: [], promises: [], worldPlaces: [] };
            // 【P1修复BUG-010】补全 worldPlaces 字段（旧存档升级）
            if (!migrated.permanentFacts.worldPlaces) migrated.permanentFacts.worldPlaces = [];
            if (!migrated.tables) migrated.tables = { characters: {}, items: {}, locations: {}, relationships: {} };
            if (!migrated.plot) migrated.plot = { worldSetting: '', chapters: [], currentChapter: '', pendingMysteries: [] };
            if (!migrated.events) migrated.events = [];
            if (!migrated.timeline) migrated.timeline = [];
            if (!migrated.quests) migrated.quests = [];
            if (!migrated.workingMemory) migrated.workingMemory = { recentMessages: [], currentTopic: null, turns: [], messages: [] };
            if (!migrated.stats) migrated.stats = { totalMessages: 0, totalSummaries: 0, lastUpdateTime: null, tokenSaved: 0 };
            if (!migrated._dormantTracking) migrated._dormantTracking = { characters: {}, items: {}, locations: {} };
            if (!migrated._storytellingConfig) migrated._storytellingConfig = {};
            if (!migrated._worldNotes) migrated._worldNotes = [];
            if (!migrated._summaryLayers) migrated._summaryLayers = { near: [], mid: [], far: [] };
            if (!migrated._setupLayers) migrated._setupLayers = { coreRules: '', worldSummary: '', fullSetup: '', compressed: false, extractTurn: -1, setupKeywords: [] };
            // 【P1修复P1-M】v3→v4：quests 条目 content 字段重命名为 title
            // （与 QuestMutator schema 对齐，消除 title↔content 别名映射）
            // 注：_dormantTracking.quests 的 key 是任务标识字符串本身（非字段名），无需迁移
            if (Array.isArray(migrated.quests)) {
                migrated.quests.forEach(function(q) {
                    if (q && q.content && q.title === undefined) {
                        q.title = q.content;
                        delete q.content;
                    }
                });
            }
            migrated.version = 4;
            return migrated;
        } catch(e) {
            console.error('[GameMemory] _migrateDataToV3 失败:', e);
            return null;
        }
    },

    startAutoSave: function() { var self = this; if (typeof TimerManager !== 'undefined' && TimerManager.clearInterval) TimerManager.clearInterval('gameMemoryAutoSave'); if (typeof TimerManager !== 'undefined' && TimerManager.setInterval) TimerManager.setInterval('gameMemoryAutoSave', function() { self.saveToStorage(); }, 30000); },
    stopAutoSave: function() { if (typeof TimerManager !== 'undefined' && TimerManager.clearInterval) TimerManager.clearInterval('gameMemoryAutoSave'); },

    clear: function() {
        this.currentTurn = 0; this.lastInjectionTurn = -1; this.gameClock = { day: 1, period: '早晨', lastUpdateTurn: 0 };
        this.permanentFacts = { pcIdentity: [], worldRules: [], settings: [], npcProfiles: [], promises: [], worldPlaces: [] };
        this.tables = { characters: {}, items: {}, locations: {}, relationships: {} };
        this.plot = { worldSetting: '', chapters: [], currentChapter: '', pendingMysteries: [] };
        this.events = []; this.timeline = []; this.quests = [];
        // 【阶段1-A2】clear 后同步清空 StateManager.entities.events
        if (typeof StateManager !== 'undefined' && StateManager.set) {
            StateManager.set('entities.events', [], { silent: true });
        }
        this.workingMemory = { recentMessages: [], currentTopic: null, turns: [], messages: [] };
        this.stats = { totalMessages: 0, totalSummaries: 0, lastUpdateTime: null, tokenSaved: 0 };
        this._changeLog = []; this.summaryHistory = []; // 【P2清理】删除 currentSummaryIndex 重置
        this._injectionSnapshots = {};
        this._summaryLayers = { near: [], mid: [], far: [] };
        this._setupLayers = { coreRules: '', worldSummary: '', fullSetup: '', compressed: false, extractTurn: -1, setupKeywords: [] };
        this._dormantTracking = { characters: {}, items: {}, quests: {}, foreshadowings: {} };
        this._storytellingConfig = { dormantWarningThreshold: 20, dormantUrgentThreshold: 30, foreshadowWarningThreshold: 15, maxForeshadowings: 20, aiGuidanceEnabled: true };
        Storage.remove(Storage.KEYS.MEMORY); Storage.remove(Storage.KEYS.ENHANCED_MEMORY);
    },

    // 【P2清理】删除 getCharacterInfo（全项目零调用）
    // 【P2清理】删除 getItemHistory（全项目零调用）
    // 【P2清理】删除 getTimeline（全项目零调用）
    // 【P2清理】删除 getRelationshipNetwork（全项目零调用）
    // 【P1修复BUG-011-longTermMemory只读快照】配套写入 API
    // longTermMemory getter 已改为只读快照，旧代码直接 `longTermMemory.characterTable[name] = {...}`
    // 等写入方式不再生效（写入的是快照副本，不影响源 tables.characters）。现提供以下 API 替代。
    recordCharacterChange: function(name, changeDesc) {
        // 替代旧代码：EnhancedMemory.longTermMemory.characterTable[name].changes.push({time, change: changeDesc})
        // + 自动维护 firstAppearance/lastUpdate/lastChangedTurn/gameTime/accessCount 等运行时字段
        if (!name || typeof name !== 'string') return;
        var self = this;
        var c = self.tables.characters[name];
        var gtStr = (typeof self.getGameTimeStr === 'function') ? self.getGameTimeStr() : '';
        if (!c) {
            // 新角色首次登场记录
            c = {
                name: name,
                firstAppearance: Date.now(),
                changes: [],
                gameTime: gtStr,
                accessCount: 0,
                lastChangedTurn: (typeof self.currentTurn === 'number') ? self.currentTurn : 0
            };
            self.tables.characters[name] = c;
        }
        c.lastUpdate = Date.now();
        c.lastChangedTurn = (typeof self.currentTurn === 'number') ? self.currentTurn : (c.lastChangedTurn || 0);
        c.gameTime = gtStr || (c.gameTime || '');
        if (changeDesc) {
            if (!Array.isArray(c.changes)) c.changes = [];
            c.changes.push({ time: Date.now(), change: changeDesc });
        }
        self._ltmDirty = true;
    },
    recordItemObtained: function(itemName, desc) {
        // 替代旧代码：EnhancedMemory.longTermMemory.itemTable[item] = {name, obtainedTime, desc, ...}
        if (!itemName || typeof itemName !== 'string') return;
        var self = this;
        if (self.tables.items[itemName]) return; // 已存在不重复记录
        var gtStr = (typeof self.getGameTimeStr === 'function') ? self.getGameTimeStr() : '';
        self.tables.items[itemName] = {
            name: itemName,
            obtainedTime: Date.now(),
            desc: desc || '玩家持有',
            gameTime: gtStr,
            accessCount: 0,
            lastChangedTurn: (typeof self.currentTurn === 'number') ? self.currentTurn : 0
        };
        self._ltmDirty = true;
    },

    // 【P1修复BUG-011-permanentFacts责任越界】公共 API：upsert 单条 permanentFact
    // 替代 AIResponseMutator._applyPermanentFacts 内部直接操纵 self.permanentFacts[category] 的旧实现。
    // category ∈ ['worldPlaces','npcProfiles','pcIdentity','settings','worldRules','promises']
    // fact = { content, locked, source, createdTurn, keywords? }
    // 返回值：'added' 新增 | 'updated' 已存在且更新 | 'noop' 已存在且无变化
    upsertPermanentFact: function(category, fact) {
        if (!category || !fact || !fact.content) return 'noop';
        var self = this;
        if (!self.permanentFacts) self.permanentFacts = {};
        if (!Array.isArray(self.permanentFacts[category])) self.permanentFacts[category] = [];
        var list = self.permanentFacts[category];

        // 【P0-1修复】统一支持中英文冒号切分，并 trim 去除空格
        // 旧实现 split('：') 仅识别中文全角冒号，AI 输出英文冒号时同一实体被作为新条目重复入库
        var _splitByColon = function(text) { return String(text).split(/[:：]/).map(function(s) { return s.trim(); }); };
        // 保留原 content 的冒号风格，避免合并后冒号不一致
        var _detectColonSep = function(text) {
            var s = String(text);
            return s.indexOf('：') !== -1 ? '：' : ':';
        };

        // 去重键：按 content 字段的首段匹配，避免同名条目重复
        var key = _splitByColon(fact.content)[0];
        var idx = list.findIndex(function(a) {
            if (!a || !a.content) return false;
            if (a.content === fact.content) return true;
            return _splitByColon(a.content)[0] === key;
        });
        if (idx === -1) {
            list.push({
                content: fact.content,
                locked: fact.locked !== false,
                source: fact.source || 'runtime',
                createdTurn: fact.createdTurn || self.currentTurn || 0,
                keywords: fact.keywords
            });
            self._ltmDirty = true;
            return 'added';
        }
        // 已存在：合并新信息（追加旧条目没有的字段，不覆盖）
        var old = list[idx];
        var changed = false;
        if (fact.keywords && Array.isArray(fact.keywords)) {
            if (!Array.isArray(old.keywords)) { old.keywords = []; changed = true; }
            fact.keywords.forEach(function(k) {
                if (k && old.keywords.indexOf(k) === -1) { old.keywords.push(k); changed = true; }
            });
        }
        // 仅当旧条目 content 缺少信息时合并（追加 旧 content 中没有的子段）
        if (String(fact.content).length > String(old.content).length) {
            var oldParts = _splitByColon(old.content);
            var newParts = _splitByColon(fact.content);
            // 保留 old.content 的冒号风格，old 无冒号时取 fact 的冒号风格，最终 fallback 中文冒号
            var sep = oldParts.length > 1 ? _detectColonSep(old.content)
                    : (newParts.length > 1 ? _detectColonSep(fact.content) : '：');
            var merged = oldParts.slice();
            newParts.forEach(function(p, i) {
                if (i === 0) return; // 跳过名字段
                if (p && oldParts.indexOf(p) === -1) { merged.push(p); changed = true; }
            });
            if (changed) old.content = merged.join(sep);
        }
        if (fact.locked === true && !old.locked) { old.locked = true; changed = true; }
        if (changed) self._ltmDirty = true;
        return changed ? 'updated' : 'noop';
    },

    // 【P1修复BUG-011】替换式写入：用单条 fact 替换整个 category 数组。
    // 适用场景：pcIdentity（主角身份）——语义为"最新值覆盖"，不像 worldPlaces/npcProfiles 需要累积合并。
    // 调用方：AIResponseMutator._applyPermanentFacts 第 3 段（pcIdentity）
    setPermanentFact: function(category, fact) {
        if (!category || !fact || !fact.content) return 'noop';
        var self = this;
        if (!self.permanentFacts) self.permanentFacts = {};
        var list = Array.isArray(self.permanentFacts[category]) ? self.permanentFacts[category] : [];
        var oldContent = (list[0] && list[0].content) ? String(list[0].content) : '';
        var newContent = String(fact.content).trim();
        if (oldContent === newContent) return 'noop';
        self.permanentFacts[category] = [{
            content: newContent,
            locked: fact.locked !== false,
            source: fact.source || 'runtime',
            createdTurn: fact.createdTurn || self.currentTurn || 0,
            keywords: fact.keywords
        }];
        self._ltmDirty = true;
        return 'updated';
    }
};

// 全局暴露
window.GameMemory = GameMemory;
window.EnhancedMemory = GameMemory;

GlobalCleanup.registerListener(document, 'DOMContentLoaded', function() { GameMemory.init(); });

// 向后兼容 getter
// 【P0修复】缓存 longTermMemory 结果：worldAnchors 是 permanentFacts 的只读快照（需遍历重建），
// 其余字段均为实时引用（characterTable/itemTable/importantEvents 等）。
// 缓存后高频调用（如 _parseStructuredSummary 单次 35+ 次访问）只重建 1 次，
// permanentFacts 变更时由各写入点置 _ltmDirty=true 触发下次重建。
Object.defineProperty(GameMemory, 'longTermMemory', {
    get: function() {
        var self = this;
        if (self._ltmCache && !self._ltmDirty) {
            return self._ltmCache;
        }
        // worldAnchors: 从 permanentFacts 映射（只读快照）
        var worldAnchors = [];
        var typeMap = { pcIdentity: 'pc_identity', settings: 'setting', worldRules: 'world_rule', npcProfiles: 'npc_profile', promises: 'promise', worldPlaces: 'world_place' };
        Object.keys(self.permanentFacts).forEach(function(key) { var oldType = typeMap[key] || key; var list = self.permanentFacts[key]; if (Array.isArray(list)) list.forEach(function(a) { if (a) worldAnchors.push({ type: oldType, content: a.content, source: a.source, locked: a.locked, createdTurn: a.createdTurn }); }); });
        // 【P1修复BUG-011-longTermMemory只读快照】characterTable/itemTable/locationTable/relationships
        // 改为深拷贝快照，禁止外部通过引用直接写入 tables.characters/items/locations/relationships。
        // 旧实现返回实时引用，game.js:2487-2561 多处直接 `longTermMemory.characterTable[name] = {...}`
        // 写入会改到 tables.characters，与 longTermMemory.worldAnchors.push（无效）语义不一致。
        // 现统一为只读：写入必须通过 GameMemory API（recordCharacterChange / recordItemObtained 等）。
        var deepClone = (typeof StateSchema !== 'undefined' && StateSchema.deepClone)
            ? StateSchema.deepClone
            : function(o) { return JSON.parse(JSON.stringify(o)); };
        // worldNotes: 持久化数组（_worldNotes 由各写入点懒初始化 + push，此处返回引用以保留 push 语义）
        if (!self._worldNotes) self._worldNotes = [];
        var result = {
            worldAnchors: worldAnchors,
            activeQuests: self.quests,
            characterTable: deepClone(self.tables.characters) || {},
            itemTable: deepClone(self.tables.items) || {},
            locationTable: deepClone(self.tables.locations) || {},
            relationships: deepClone(self.tables.relationships) || {},
            mainPlot: self.plot.chapters,
            currentChapterSummary: self.plot.currentChapter,
            importantEvents: self.events,
            timeline: self.timeline,
            worldSetting: self.plot.worldSetting,
            worldNotes: self._worldNotes,
            masterSummary: self.plot.worldSetting + '\n' + (self.plot.currentChapter || '')
        };
        // masterSummary setter：写入时回写到 plot（保留：摘要写入是合法的 plot 更新入口）
        var _self = self;
        Object.defineProperty(result, 'masterSummary', {
            get: function() { return _self.plot.worldSetting + '\n' + (_self.plot.currentChapter || ''); },
            set: function(val) { if (typeof val === 'string') { var parts = val.split('\n'); _self.plot.worldSetting = parts[0] || ''; _self.plot.currentChapter = parts.slice(1).join('\n') || val; _self._ltmDirty = true; } },
            configurable: true
        });
        self._ltmCache = result;
        self._ltmDirty = false;
        return result;
    },
    set: function(val) {
        if (!isObject(val)) return;
        var self = this;
        // 恢复永久事实
        if (val.worldAnchors && Array.isArray(val.worldAnchors)) {
            var typeMap = { pc_identity: 'pcIdentity', setting: 'settings', world_rule: 'worldRules', npc_profile: 'npcProfiles', promise: 'promises', world_place: 'worldPlaces' };
            val.worldAnchors.forEach(function(a) {
                if (!a) return;
                var key = typeMap[a.type] || 'settings';
                if (!self.permanentFacts[key]) self.permanentFacts[key] = [];
                if (!self.permanentFacts[key].some(function(x) { return x && x.content === a.content; })) {
                    self.permanentFacts[key].push({ content: a.content, source: a.source || 'auto', locked: a.locked !== false, createdTurn: a.createdTurn || 0 });
                }
            });
        }
        // 恢复角色表
        if (val.characterTable && typeof val.characterTable === 'object') {
            Object.keys(val.characterTable).forEach(function(name) {
                var c = val.characterTable[name];
                if (c) self.tables.characters[name] = c;
            });
        }
        // 恢复物品表
        if (val.itemTable && typeof val.itemTable === 'object') {
            Object.keys(val.itemTable).forEach(function(name) {
                var it = val.itemTable[name];
                if (it) self.tables.items[name] = it;
            });
        }
        // 恢复地点表
        if (val.locationTable && typeof val.locationTable === 'object') {
            Object.keys(val.locationTable).forEach(function(name) {
                var loc = val.locationTable[name];
                if (loc) self.tables.locations[name] = loc;
            });
        }
        // 恢复关系
        if (val.relationships && Array.isArray(val.relationships)) {
            self.tables.relationships = {};
            val.relationships.forEach(function(rel) {
                if (rel && rel.from && rel.to) self.tables.relationships[rel.from + '->' + rel.to] = rel;
            });
        }
        // 恢复事件
        if (val.importantEvents && Array.isArray(val.importantEvents)) {
            self.events = val.importantEvents;
            // 【阶段1-A2】反序列化后同步到 StateManager.entities.events + gameState.keyEvents
            if (typeof _syncEventsToKeyEvents === 'function') _syncEventsToKeyEvents();
        }
        // 恢复时间线
        if (val.timeline && Array.isArray(val.timeline)) {
            self.timeline = val.timeline;
        }
        // 恢复世界观
        if (val.worldSetting && typeof val.worldSetting === 'string') {
            self.plot.worldSetting = val.worldSetting;
        }
        // 恢复任务
        if (val.activeQuests && Array.isArray(val.activeQuests)) {
            self.quests = val.activeQuests;
        }
        // 【P0修复】permanentFacts 已通过 setter 恢复，失效 longTermMemory 缓存
        self._ltmDirty = true;
    }, configurable: true
});

Object.defineProperty(GameMemory, 'shortTermMemory', {
    get: function() {
        var self = this;
        if (!self.workingMemory.recentMessages) self.workingMemory.recentMessages = [];
        return {
            summaries: self.workingMemory.recentMessages,
            events: [],
            maxRounds: 10
        };
    },
    set: function(val) {
        // 允许外部代码替换 shortTermMemory
        if (val && val.summaries && Array.isArray(val.summaries)) this.workingMemory.recentMessages = val.summaries;
    },
    configurable: true
});

// 【P2清理】删除 injectionBudget getter/setter（全项目零引用）

Object.defineProperty(GameMemory, 'workingMemory', {
    // 【优化】移除 nearSummary/midSummary/farSummary 死字段
    get: function() { return this._workingMemory || { messages: [], turns: [], recentMessages: [], currentTopic: null }; },
    set: function(val) { this._workingMemory = val; },
    configurable: true
});

/**
 * ========================================
 * 记忆管理UI界面 v3 - 适配 GameMemory
 * ========================================
 */

var MemoryManagerUI = {
    // 【P1修复BUG-7.17】UI 层与业务逻辑耦合说明
    // -----------------------------------------------------------------------------
    // 本对象是 UI 层，但 saveCharacter/saveItem 等方法内同时执行：
    //   1. 直接写 GameMemory.tables.<entity>[name]（业务同步路径之一）
    //   2. 调用对应 Mutator（CharacterMutator.replaceCharacter 等，业务同步路径之二）
    //   3. 调用 UI.afterMemoryChange（UI 刷新）
    //   4. 失效缓存 gm._cachedInjection = null
    //
    // 与 GameMemory 自身的 addImportantEvent（内含同步+持久化）形成两套写入路径。
    //
    // 修复路线（短期文档化 + 中期解耦）：
    //   - 短期（本注释）：明确职责边界，新增方法禁止同时执行 1+2 双写
    //   - 中期：MemoryManagerUI 只调用 GameMemory 公开 API（如新增 GameMemory.saveCharacter），
    //            由 GameMemory 内部触发 StateManager 同步与缓存失效；删除 UI 层对
    //            Mutator 与 gm.tables 的直接写入
    //   - 写入职责归位后，UI 层只负责：表单读取 → 调 GameMemory API → 触发 UI 刷新
    //
    // 注：当前 saveCharacter/saveItem 等方法仍同时写 gm.tables.* 与调 Mutator，
    //      双写在 Mutator 已加载的环境下会通过 StateManager.set → _syncLegacyMirror
    //      再次回写到 gm.tables.*（详见 GameMemoryAdapter.syncToGameMemory 的 MERGE 策略）。
    //      不会产生数据冲突，但属于冗余写入。物理解耦延后到独立重构任务。

    isVisible: false,
    currentTab: 'overview',

    _escAttr: function(str) { return escapeAttr(str); },

    // 通用按钮：action ∈ edit/delete/cancel/save/add/addOutline/editOutline/refresh/detail/search/resolve
    // arg 支持 string / number（数字不加引号，字符串加引号并转义）
    // borderRadius: 可选，默认 6px（与原版小按钮一致；大表单按钮传 8px）
    _btn: function(action, fnName, arg, borderRadius) {
        var s = MemoryManagerUI._btnPresets._getPreset(action);
        var argStr;
        if (arg === undefined || arg === null) {
            argStr = '';
        } else if (typeof arg === 'number') {
            argStr = String(arg);
        } else {
            argStr = '\'' + this._escAttr(arg) + '\'';
        }
        var onclick = 'MemoryManagerUI.' + fnName + (argStr ? '(' + argStr + ')' : '()');
        var radius = borderRadius || '6px';
        return '<button onclick="' + onclick + '" style="font-size:' + s.fontSize + ';color:' + s.color + ';background:' + s.bg + ';border:1px solid ' + s.border + ';padding:' + s.padding + ';border-radius:' + radius + ';cursor:pointer;">' + s.text + '</button>';
    },

    // 获取按钮预设样式（供 _formFooter 等复用）
    _btnPresets: { _presets: null, _getPreset: function(action) {
        if (!this._presets) {
            this._presets = {
                edit:   { color: 'var(--accent)',  bg: 'none',         border: 'var(--border)',   text: '编辑',    fontSize: '12px', padding: '4px 8px'   },
                delete: { color: '#f44',           bg: 'none',         border: 'var(--border)',   text: '删除',    fontSize: '12px', padding: '4px 8px'   },
                cancel: { color: 'var(--text)',    bg: 'transparent',  border: 'var(--border)',   text: '取消',    fontSize: '13px', padding: '10px 20px' },
                save:   { color: 'white',          bg: 'var(--accent)', border: 'none',          text: '保存',    fontSize: '13px', padding: '10px 20px' },
                add:    { color: 'white',          bg: 'var(--accent)', border: 'none',          text: '添加',    fontSize: '13px', padding: '10px 20px' },
                addOutline: { color: 'var(--accent)', bg: 'none',       border: 'var(--accent)',  text: '+ 添加',  fontSize: '11px', padding: '4px 10px'  },
                editOutline: { color: 'var(--accent)', bg: 'none',      border: 'var(--accent)',  text: '编辑',    fontSize: '11px', padding: '4px 10px'  },
                refresh: { color: 'var(--accent)',  bg: 'none',        border: 'var(--accent)',  text: '↻ 刷新', fontSize: '11px', padding: '4px 10px'  },
                detail: { color: 'var(--accent)',   bg: 'none',        border: 'var(--accent)',  text: '查看详情', fontSize: '11px', padding: '4px 10px'  },
                search: { color: 'white',           bg: 'var(--accent)', border: 'none',         text: '搜索',    fontSize: '13px', padding: '10px 16px' },
                resolve: { color: '#4a4',          bg: 'none',         border: 'var(--border)',   text: '完成',    fontSize: '11px', padding: '4px 8px'   }
            };
        }
        return this._presets[action] || this._presets.edit;
    } },

    // 通用输入字段：field = { id, label, type, default, options, placeholder, required, rows, min, max }
    _formField: function(field, value) {
        var id = field.id;
        var label = field.label || '';
        var val = (value !== undefined && value !== null) ? value : (field.default !== undefined ? field.default : '');
        var type = field.type || 'text';
        var inputHtml = '';
        if (type === 'checkbox') {
            inputHtml = '<input id="' + id + '" type="checkbox"' + (val ? ' checked' : '') + ' style="width:auto;">';
        } else if (type === 'number') {
            inputHtml = '<input id="' + id + '" type="number" value="' + escapeHtml(val) + '"' + (field.min !== undefined ? ' min="' + field.min + '"' : '') + (field.max !== undefined ? ' max="' + field.max + '"' : '') + ' style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">';
        } else if (type === 'textarea') {
            var minH = field.minHeight || '80px';
            inputHtml = '<textarea id="' + id + '" rows="' + (field.rows || 4) + '"' + (field.placeholder ? ' placeholder="' + escapeHtml(field.placeholder) + '"' : '') + ' style="width:100%;min-height:' + minH + ';padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;resize:vertical;outline:none;font-family:inherit;">' + escapeHtml(val) + '</textarea>';
        } else if (type === 'select') {
            var opts = (field.options || []).map(function(o) {
                var v = (isObject(o)) ? o.v : o;
                var t = (isObject(o)) ? o.t : o;
                return '<option value="' + escapeHtml(v) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + escapeHtml(t) + '</option>';
            }, this).join('');
            inputHtml = '<select id="' + id + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">' + opts + '</select>';
        } else {
            inputHtml = '<input id="' + id + '" value="' + escapeHtml(val) + '"' + (field.placeholder ? ' placeholder="' + escapeHtml(field.placeholder) + '"' : '') + ' style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">';
        }
        var labelHtml = label ? '<label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">' + label + (field.required ? ' *' : '') + '</label>' : '';
        return '<div>' + labelHtml + inputHtml + '</div>';
    },

    // 表单底部：取消 + 保存按钮对
    // saveArgs: undefined | string | array<string|number> 多个参数用 array
    // saveAction: 'save'（默认）| 'add'（add 模式按钮显示"添加"）
    // 大表单按钮 borderRadius=8px（与原版一致）
    _formFooter: function(cancelTab, saveFn, saveArgs, saveAction) {
        var action = saveAction || 'save';
        var saveBtn;
        if (saveArgs === undefined || saveArgs === null) {
            saveBtn = this._btn(action, saveFn, undefined, '8px');
        } else if (Array.isArray(saveArgs)) {
            var parts = saveArgs.map(function(a) {
                return typeof a === 'string' ? "'" + this._escAttr(a) + "'" : a;
            }, this);
            var s = MemoryManagerUI._btnPresets._getPreset(action);
            saveBtn = '<button onclick="MemoryManagerUI.' + saveFn + '(' + parts.join(',') + ')" style="font-size:' + s.fontSize + ';color:' + s.color + ';background:' + s.bg + ';border:' + s.border + ';padding:' + s.padding + ';border-radius:8px;cursor:pointer;">' + s.text + '</button>';
        } else {
            saveBtn = this._btn(action, saveFn, saveArgs, '8px');
        }
        // cancel 按钮固定 8px
        return '<div style="display:flex;gap:8px;justify-content:flex-end;">'
            + this._btn('cancel', 'switchTab', cancelTab, '8px')
            + saveBtn
            + '</div>';
    },

    initNavigation: function() {
        var self = this;
        var backBtn = document.getElementById('memoryBackBtn');
        if (backBtn) backBtn.addEventListener('click', function() { UI.goHome(); });
        var saveBtn = document.getElementById('btnMemorySave');
        if (saveBtn) saveBtn.addEventListener('click', function() { self.saveMemoryEdits(); });
        var summaryEdit = document.getElementById('memorySummaryEdit');
        if (summaryEdit) summaryEdit.addEventListener('input', function() { var counter = document.getElementById('memorySummaryCount'); if (counter) counter.textContent = summaryEdit.value.length + ' 字'; });
    },

    saveMemoryEdits: function() {
        var summaryEl = document.getElementById('memorySummaryEdit');
        if (summaryEl && typeof gameState !== 'undefined') gameState.rollingSummary = summaryEl.value.trim();
        var worldEdit = document.getElementById('memoryWorldEdit');
        // 【I修复】用户手编 JSON 非法时不再静默吞掉，提示用户
        if (worldEdit && typeof gameState !== 'undefined') {
            try { gameState.worldSnapshot = JSON.parse(worldEdit.value); }
            catch(e) { console.warn('[saveMemoryEdits] worldSnapshot JSON 解析失败:', e.message); UI.toast('世界快照JSON格式错误，已忽略'); }
        }
        if (typeof autoSave === 'function') autoSave();
        UI.toast('记忆已保存');
    },

    show: function() {
        this.initNavigation(); this.isVisible = true; this.currentTab = 'overview'; this.renderContent();
        document.querySelectorAll('.memory-tab').forEach(function(el) { el.classList.remove('active'); });
        var activeTab = document.querySelector('.memory-tab[data-tab="overview"]');
        if (activeTab) activeTab.classList.add('active');
        renderNavBar('memoryNav', [{ page: 'storyPage', icon: 'icon-book', label: '剧情' }, { page: 'playerPage', icon: 'icon-user', label: '个人' }, { page: 'npcPage', icon: 'icon-users', label: '人际' }, { page: 'logPage', icon: 'icon-grid', label: '日志' }, { page: 'memoryPage', icon: 'icon-sparkles', label: '记忆' }, { page: 'recapPage', icon: 'icon-clock', label: '回顾' }], 4);
    },

    onPageShow: function() { this.show(); },
    hide: function() { this.isVisible = false; },

    switchTab: function(tab) {
        this.currentTab = tab; this.renderContent();
        document.querySelectorAll('.memory-tab').forEach(function(el) { el.classList.remove('active'); });
        var activeTab = document.querySelector('.memory-tab[data-tab="' + tab + '"]');
        if (activeTab) activeTab.classList.add('active');
    },

    renderContent: function() {
        var content = document.getElementById('memoryManagerContent');
        if (!content) return;
        var gm = window.GameMemory || (typeof GameMemory !== 'undefined' ? GameMemory : null);
        if (!gm) { content.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-tertiary);">记忆系统未初始化</div>'; return; }
        var tabMap = { overview: 'renderOverview', anchors: 'renderPermanentFacts', permanentFacts: 'renderPermanentFacts', recentMemory: 'renderRecentMemory', characters: 'renderCharacters', items: 'renderItems', locations: 'renderLocations', relationships: 'renderRelationships', plot: 'renderPlot', events: 'renderEvents', quests: 'renderQuests', timeline: 'renderTimeline', injection: 'renderInjectionPreview', search: 'renderSearch', summaryLayers: 'renderSummaryLayers', sceneState: 'renderSceneState', world: 'renderLocations' };
        var method = tabMap[this.currentTab];
        content.innerHTML = (method && this[method]) ? this[method](gm) : this.renderOverview(gm);
    },

    renderOverview: function(gm) {
        var stats = gm.getStats();
        var pendingQuests = gm.quests.filter(function(q) { return q.status === 'pending'; }).length;
        var totalAnchors = 0; Object.keys(gm.permanentFacts).forEach(function(k) { totalAnchors += gm.permanentFacts[k].length; });
        return '<div class="memory-card"><div class="memory-card-title">记忆统计</div><div class="memory-stat-grid">'
            + '<div class="memory-stat-item"><div class="memory-stat-value">' + stats.totalMessages + '</div><div class="memory-stat-label">总消息数</div></div>'
            + '<div class="memory-stat-item"><div class="memory-stat-value">' + stats.totalCharacters + '</div><div class="memory-stat-label">角色数</div></div>'
            + '<div class="memory-stat-item"><div class="memory-stat-value">' + stats.totalItems + '</div><div class="memory-stat-label">物品数</div></div>'
            + '<div class="memory-stat-item"><div class="memory-stat-value">' + stats.totalLocations + '</div><div class="memory-stat-label">地点数</div></div>'
            + '<div class="memory-stat-item"><div class="memory-stat-value">' + stats.totalEvents + '</div><div class="memory-stat-label">重要事件</div></div>'
            + '<div class="memory-stat-item"><div class="memory-stat-value">' + (stats.memorySize / 1024).toFixed(1) + 'KB</div><div class="memory-stat-label">数据大小</div></div>'
            + '</div></div>'
            + '<div class="memory-card"><div class="memory-card-title">系统状态</div><div style="display:flex;gap:16px;">'
            + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:12px;color:var(--text-tertiary);">游戏时间</div><div style="font-size:20px;font-weight:600;">' + escapeHtml(gm.getGameTimeStr()) + '</div></div>'
            + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:12px;color:var(--text-tertiary);">永久事实</div><div style="font-size:20px;font-weight:600;">' + totalAnchors + ' 条</div></div>'
            + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:12px;color:var(--text-tertiary);">进行中约定</div><div style="font-size:20px;font-weight:600;">' + pendingQuests + ' 待办</div></div>'
            + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:12px;color:var(--text-tertiary);">当前回合</div><div style="font-size:20px;font-weight:600;">' + gm.currentTurn + '</div></div>'
            + '</div></div>'
            + '<div class="memory-card"><div class="memory-card-title">新功能状态</div><div style="display:flex;gap:16px;flex-wrap:wrap;">'
            + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:12px;color:var(--text-tertiary);">逐层摘要</div><div style="font-size:14px;font-weight:600;">near ' + ((gm._summaryLayers && gm._summaryLayers.near) ? gm._summaryLayers.near.length : 0) + ' / mid ' + ((gm._summaryLayers && gm._summaryLayers.mid) ? gm._summaryLayers.mid.length : 0) + ' / far ' + ((gm._summaryLayers && gm._summaryLayers.far) ? gm._summaryLayers.far.length : 0) + ' 条</div></div>'
            + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:12px;color:var(--text-tertiary);">场景状态</div><div style="font-size:14px;font-weight:600;">' + Object.values(gm.tables.locations).filter(function(l) { return !!l.sceneState; }).length + ' 个地点有场景锁定</div></div>'
            + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:12px;color:var(--text-tertiary);">变化驱动</div><div style="font-size:14px;font-weight:600;">上次跳过 ' + (gm._lastInjectionStats && gm._lastInjectionStats.skippedModules ? gm._lastInjectionStats.skippedModules.length : 0) + ' 个无变化模块</div></div>'
            + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:12px;color:var(--text-tertiary);">设定分层</div><div style="font-size:14px;font-weight:600;">' + (gm._setupLayers && gm._setupLayers.fullSetup ? (gm._setupLayers.compressed ? '精简版（规则在永久事实）' : '完整注入（每轮）') : '未初始化') + '</div></div>'
            + '</div></div>'
            + '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;"><span>🧠 注入预览</span>' + this._btn('detail', 'switchTab', 'injection') + '</div>'
            + '<div style="padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">'
            + (gm._lastInjectionStats ? '总字符: ' + gm._lastInjectionStats.totalChars + ' / 预算: ' + gm._lastInjectionStats.budget : '尚未生成注入内容')
            + '</div></div></div>';
    },

    renderSummaryLayers: function(gm) {
        var self = this;
        var layers = gm._summaryLayers || { near: [], mid: [], far: [] };
        var html = '<div class="memory-card"><div class="memory-card-title">逐层摘要</div>';
        html += '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:12px;">近层保留详细对话，中层压缩摘要，远层只保留关键句。越远的记忆越精简，节省Token。</div>';
        html += '<div style="margin-bottom:16px;"><div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--accent);">〔最近对话〕详细 · ' + (layers.near || []).length + ' 条</div>';
        if (layers.near && layers.near.length > 0) {
            layers.near.forEach(function(s) { html += '<div style="padding:8px 10px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;line-height:1.5;">' + escapeHtml(s) + '</div>'; });
        } else {
            html += '<div style="padding:12px;text-align:center;color:var(--text-tertiary);font-size:13px;">暂无近层摘要</div>';
        }
        html += '</div>';
        html += '<div style="margin-bottom:16px;"><div style="font-size:13px;font-weight:600;margin-bottom:8px;color:#ff9500;">〔近期摘要〕压缩 · ' + (layers.mid || []).length + ' 条</div>';
        if (layers.mid && layers.mid.length > 0) {
            layers.mid.forEach(function(s) { html += '<div style="padding:8px 10px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;line-height:1.5;">' + escapeHtml(s) + '</div>'; });
        } else {
            html += '<div style="padding:12px;text-align:center;color:var(--text-tertiary);font-size:13px;">暂无中层摘要</div>';
        }
        html += '</div>';
        html += '<div style="margin-bottom:16px;"><div style="font-size:13px;font-weight:600;margin-bottom:8px;color:#999;">〔更早记忆〕关键句 · ' + (layers.far || []).length + ' 条</div>';
        if (layers.far && layers.far.length > 0) {
            layers.far.forEach(function(s) { html += '<div style="padding:8px 10px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;line-height:1.5;color:var(--text-secondary);">' + escapeHtml(s) + '</div>'; });
        } else {
            html += '<div style="padding:12px;text-align:center;color:var(--text-tertiary);font-size:13px;">暂无远层摘要</div>';
        }
        html += '</div>';
        html += '</div>';
        return html;
    },

    renderSceneState: function(gm) {
        var self = this;
        var locs = Object.values(gm.tables.locations);
        var html = '<div class="memory-card"><div class="memory-card-title">场景状态</div>';
        html += '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:12px;">场景锁定：标记地点的当前状态（如"壁炉燃烧中"），AI不会遗忘已锁定的场景细节。</div>';
        if (locs.length === 0) {
            html += '<div style="padding:20px;text-align:center;color:var(--text-tertiary);">暂无地点数据</div>';
        } else {
            locs.forEach(function(loc) {
                var hasScene = !!loc.sceneState;
                html += '<div style="padding:12px;background:var(--bg);border-radius:8px;margin-bottom:8px;">';
                html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
                html += '<div style="font-weight:600;">' + escapeHtml(loc.name) + (loc.locked ? ' ◈' : '') + '</div>';
                html += self._btn('edit', 'editSceneState', loc.name);
                html += '</div>';
                if (hasScene) {
                    html += '<div style="font-size:13px;color:var(--text-secondary);padding:6px 8px;background:rgba(255,149,0,0.1);border-radius:4px;">' + escapeHtml(loc.sceneState) + '</div>';
                } else {
                    html += '<div style="font-size:12px;color:var(--text-tertiary);">未设置场景状态</div>';
                }
                if (loc.accessCount) {
                    html += '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">提及次数: ' + loc.accessCount + '</div>';
                }
                html += '</div>';
            });
        }
        html += '</div>';
        return html;
    },

    editSceneState: function(name) {
        var gm = window.GameMemory; var loc = gm.tables.locations[name]; if (!loc) return;
        var fields = [
            { id: 'editSceneState', label: '场景状态（描述当前场景细节，AI会记住）', type: 'textarea', placeholder: '如：壁炉燃烧中，桌上摆着两杯热茶...', minHeight: '80px' },
            { id: 'editSceneLocked', label: '锁定场景 <span style="font-size:11px;">（锁定后状态不会自动清除）</span>', type: 'checkbox' }
        ];
        var values = [loc.sceneState || '', loc.locked];
        var html = '<div class="memory-card"><div class="memory-card-title">编辑场景状态: ' + escapeHtml(name) + '</div><div style="display:flex;flex-direction:column;gap:12px;">';
        for (let i = 0; i < fields.length; i++) html += this._formField(fields[i], values[i]);
        html += this._formFooter('sceneState', 'saveSceneState', name);
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
    },

    saveSceneState: function(name) {
        var gm = window.GameMemory; if (!gm || !gm.tables.locations[name]) return;
        gm.tables.locations[name].sceneState = document.getElementById('editSceneState').value.trim();
        gm.tables.locations[name].locked = document.getElementById('editSceneLocked').checked;
        // 【P1-24/P0-7修复】失效 longTermMemory 缓存：locationTable 是 deepClone 快照
        gm._ltmDirty = true;
        UI.afterMemoryChange('sceneState', 'worldSnapshot', '场景状态已保存');
    },

    // 近期记忆专属标签页（从日志页面迁移过来）
    renderRecentMemory: function(gm) {
        var self = this;
        var html = '<div class="memory-card"><div class="memory-card-title">近期记忆</div>';
        html += '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:12px;">AI最近看到的重要事件和对话摘要，按重要度排列。这些内容每轮都会注入给AI。</div>';

        // 重要事件
        var events = gm.events || [];
        if (events.length > 0) {
            html += '<div style="margin-bottom:16px;"><div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--accent);">〔重要事件〕' + events.length + ' 条</div>';
            // 按重要度排序显示
            var sorted = events.slice().sort(function(a, b) { return (b.importance || 5) - (a.importance || 5); });
            sorted.forEach(function(e, idx) {
                var imp = e.importance || 5;
                var dot = imp >= 9 ? '●' : (imp >= 7 ? '◐' : '○');
                var gameTime = e.gameTime || '';
                html += '<div style="padding:8px 10px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;line-height:1.5;">'
                    + dot + ' ' + escapeHtml(e.content)
                    + (gameTime ? '<span style="color:var(--text-tertiary);font-size:11px;margin-left:8px;">' + escapeHtml(gameTime) + '</span>' : '')
                    + '</div>';
            });
            html += '</div>';
        } else {
            html += '<div style="padding:12px;text-align:center;color:var(--text-tertiary);font-size:13px;">暂无重要事件</div>';
        }

        // 逐层摘要
        var layers = gm._summaryLayers || { near: [], mid: [], far: [] };
        html += '<div style="margin-bottom:16px;"><div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--accent);">〔最近对话〕详细 · ' + (layers.near || []).length + ' 条</div>';
        if (layers.near && layers.near.length > 0) {
            layers.near.forEach(function(s) { html += '<div style="padding:8px 10px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;line-height:1.5;">' + escapeHtml(s) + '</div>'; });
        } else {
            html += '<div style="padding:12px;text-align:center;color:var(--text-tertiary);font-size:13px;">暂无近层摘要</div>';
        }
        html += '</div>';

        html += '<div style="margin-bottom:16px;"><div style="font-size:13px;font-weight:600;margin-bottom:8px;color:#ff9500;">〔近期摘要〕压缩 · ' + (layers.mid || []).length + ' 条</div>';
        if (layers.mid && layers.mid.length > 0) {
            layers.mid.forEach(function(s) { html += '<div style="padding:8px 10px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;line-height:1.5;">' + escapeHtml(s) + '</div>'; });
        } else {
            html += '<div style="padding:12px;text-align:center;color:var(--text-tertiary);font-size:13px;">暂无中层摘要</div>';
        }
        html += '</div>';

        html += '<div style="margin-bottom:16px;"><div style="font-size:13px;font-weight:600;margin-bottom:8px;color:#999;">〔更早记忆〕关键句 · ' + (layers.far || []).length + ' 条</div>';
        if (layers.far && layers.far.length > 0) {
            layers.far.forEach(function(s) { html += '<div style="padding:8px 10px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;line-height:1.5;color:var(--text-secondary);">' + escapeHtml(s) + '</div>'; });
        } else {
            html += '<div style="padding:12px;text-align:center;color:var(--text-tertiary);font-size:13px;">暂无远层摘要</div>';
        }
        html += '</div>';

        html += '</div>';
        return html;
    },

    renderPermanentFacts: function(gm) {
        var self = this;
        var typeLabels = { pcIdentity: '◇ 主角身份', settings: '◇ 世界设定', worldRules: '◇ 设定规则', npcProfiles: '◇ 关键角色', promises: '◇ 玩家承诺', worldPlaces: '◇ 关键地点' };
        // 【v3审查修复】补回 'worldPlaces'，否则关键地点永久事实在 UI 列表中不可见
        // （addPermanentFact 表单可选该类型，buildPermanentFactsSection 也会注入，
        //   但渲染循环 typeOrder 遗漏导致列表为空、统计却计入）
        var typeOrder = ['pcIdentity', 'settings', 'worldRules', 'npcProfiles', 'promises', 'worldPlaces'];
        var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><div style="font-size:13px;color:var(--text-tertiary);">永久事实——任何情况下 AI 都会优先看到</div>' + this._btn('add', 'addPermanentFact', undefined) + '</div>';
        var total = 0; Object.keys(gm.permanentFacts).forEach(function(k) { total += gm.permanentFacts[k].length; });
        if (total === 0) html += '<div style="text-align:center;padding:40px;color:var(--text-tertiary);">还没有永久事实</div>';
        typeOrder.forEach(function(t) {
            var list = gm.permanentFacts[t]; if (!list || list.length === 0) return;
            html += '<div class="memory-card"><div class="memory-card-title">' + (typeLabels[t] || t) + ' <span style="font-weight:normal;font-size:11px;color:var(--text-tertiary);">' + list.length + ' 条</span></div>';
            list.forEach(function(a, i) {
                var sourceTag = a.source === 'manual' ? '<span style="font-size:10px;background:#4a4;color:white;padding:1px 6px;border-radius:4px;margin-left:6px;">手动</span>' : a.source === 'auto' ? '<span style="font-size:10px;background:#666;color:white;padding:1px 6px;border-radius:4px;margin-left:6px;">自动</span>' : '';
                var escType = self._escAttr(t);
                var editBtn = '<button onclick="MemoryManagerUI.editPermanentFact(\'' + escType + '\',' + i + ')" style="font-size:12px;color:var(--accent);background:none;border:1px solid var(--border);padding:4px 10px;border-radius:6px;cursor:pointer;">编辑</button>';
                var delBtn  = '<button onclick="MemoryManagerUI.deletePermanentFact(\'' + escType + '\',' + i + ')" style="font-size:12px;color:#f44;background:none;border:1px solid var(--border);padding:4px 10px;border-radius:6px;cursor:pointer;">删除</button>';
                var btns = '<div style="display:flex;gap:6px;flex-shrink:0;">' + editBtn + delBtn + '</div>';
                html += '<div style="padding:12px 14px;background:var(--bg);border-radius:8px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;"><div style="flex:1;font-size:14px;line-height:1.7;word-break:break-all;">' + escapeHtml(a.content) + sourceTag + '</div>' + btns + '</div>';
            });
            html += '</div>';
        });
        return html;
    },

    addPermanentFact: function() {
        var fields = [
            { id: 'newFactType', label: '类型', type: 'select', options: [
                { v: 'pcIdentity', t: '◇ 主角身份' },
                { v: 'settings',   t: '◇ 世界设定' },
                { v: 'worldRules', t: '◇ 设定规则' },
                { v: 'npcProfiles',t: '◇ 关键角色' },
                { v: 'promises',   t: '◇ 玩家承诺' },
                { v: 'worldPlaces',t: '◇ 关键地点' }
            ], default: 'promises' },
            { id: 'newFactContent', label: '内容', type: 'textarea', placeholder: '输入永久事实内容...', rows: 4, minHeight: '60px' }
        ];
        var html = '<div class="memory-card"><div class="memory-card-title">添加永久事实</div><div style="margin-bottom:10px;">';
        for (let i = 0; i < fields.length; i++) html += this._formField(fields[i], undefined);
        html += this._formFooter('permanentFacts', 'saveNewPermanentFact', undefined, 'add');
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
    },

    saveNewPermanentFact: function() {
        var gm = window.GameMemory; if (!gm) return;
        var type = document.getElementById('newFactType').value;
        var content = (document.getElementById('newFactContent').value || '').trim();
        if (!content) { UI.toast && UI.toast('内容不能为空'); return; }
        var oldTypeMap = { pcIdentity: 'pc_identity', settings: 'setting', worldRules: 'world_rule', npcProfiles: 'npc_profile', promises: 'promise', worldPlaces: 'world_place' };
        var result = gm.addWorldAnchor(oldTypeMap[type] || type, content, 'manual', gm.currentTurn);
        if (result) {
            gm.saveToStorage(); UI.toast && UI.toast('已添加');
            // 【v3审查修复】同 savePermanentFact，新增永久事实后失效注入缓存
            gm._cachedInjection = null; gm._cachedInjectionTurn = -1;
        } else UI.toast && UI.toast('已存在（重复内容）');
        this.switchTab('permanentFacts');
    },

    editPermanentFact: function(type, idx) {
        var gm = window.GameMemory; if (!gm || !gm.permanentFacts[type] || !gm.permanentFacts[type][idx]) return;
        var fields = [{ id: 'editFactContent', label: '', type: 'textarea', rows: 4, minHeight: '60px' }];
        var html = '<div class="memory-card"><div class="memory-card-title">编辑永久事实</div><div style="margin-bottom:10px;">';
        for (let i = 0; i < fields.length; i++) html += this._formField(fields[i], gm.permanentFacts[type][idx].content);
        html += this._formFooter('permanentFacts', 'savePermanentFact', [type, idx]);
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
    },

    savePermanentFact: function(type, idx) {
        var gm = window.GameMemory; if (!gm || !gm.permanentFacts[type]) return;
        var content = (document.getElementById('editFactContent').value || '').trim();
        if (!content) { UI.toast && UI.toast('内容不能为空'); return; }
        gm.permanentFacts[type][idx].content = content; gm.permanentFacts[type][idx].source = 'manual';
        // 【v3审查修复】失效注入缓存：_getCacheVersion 不含 permanentFacts 计数，
        //   编辑后 cacheVersion 不变、currentTurn 不变 → buildInjection 命中缓存返回旧文本，
        //   AI 本轮仍看到旧设定，用户以为编辑没保存
        gm._cachedInjection = null; gm._cachedInjectionTurn = -1;
        // 【P0修复】失效 longTermMemory 缓存（worldAnchors 是 permanentFacts 的只读快照）
        gm._ltmDirty = true;
        UI.afterMemoryChange('permanentFacts', '_memory', '已保存');
    },

    deletePermanentFact: function(type, idx) {
        var gm = window.GameMemory; if (!gm || !gm.permanentFacts[type]) return;
        // 【P1-TC2 阶段4】先校验 idx 范围，避免 splice 静默失败 / 越界删除
        if (typeof idx !== 'number' || idx < 0 || idx >= gm.permanentFacts[type].length) {
            console.warn('[MemoryManager] deletePermanentFact 索引越界:', type, idx);
            return;
        }
        // 【缺陷修复】改用 UI.confirm 替代原生 confirm，与游戏 UI 风格一致
        UI.confirm('删除永久事实', '确定要删除这条永久事实吗？').then(function(ok) {
            if (!ok) return;
            var removed = gm.permanentFacts[type].splice(idx, 1);
            if (removed.length === 0) {
                console.warn('[MemoryManager] deletePermanentFact splice 返回空，索引异常:', idx);
                return;
            }
            // 【v3审查修复】同 savePermanentFact，失效注入缓存
            gm._cachedInjection = null; gm._cachedInjectionTurn = -1;
            // 【P0修复】失效 longTermMemory 缓存（worldAnchors 是 permanentFacts 的只读快照）
            gm._ltmDirty = true;
            UI.afterMemoryChange('permanentFacts', '_memory', '已删除');
        });
    },

    renderCharacters: function(gm) {
        var self = this; var chars = Object.values(gm.tables.characters);
        var html = '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;"><span>角色档案</span>' + this._btn('addOutline', 'addCharacter', undefined) + '</div>';
        if (chars.length === 0) html += '<div class="memory-empty-state"><div>暂无角色数据</div></div>';
        else chars.forEach(function(char) {
            var btns = '<div style="display:flex;flex-direction:column;gap:4px;">' + self._btn('edit', 'editCharacter', char.name) + self._btn('delete', 'deleteCharacter', char.name) + '</div>';
            html += '<div class="memory-character-card"><div class="memory-character-avatar">◇</div><div style="flex:1;"><div style="font-weight:600;">' + escapeHtml(char.name) + (char.locked ? ' ◈' : '') + '</div><div style="font-size:12px;color:var(--text-secondary);">' + escapeHtml(char.title || '') + ' | 关系: ' + escapeHtml(char.relation || '未知') + ' | 好感: ' + escapeHtml(char.favorability || 0) + '</div>' + (char.mood ? '<div style="font-size:11px;color:var(--text-tertiary);">心情: ' + escapeHtml(char.mood) + '</div>' : '') + (char.location ? '<div style="font-size:11px;color:var(--text-tertiary);">位置: ' + escapeHtml(char.location) + '</div>' : '') + (char.accessCount ? '<div style="font-size:11px;color:var(--text-tertiary);">提及: ' + char.accessCount + '次</div>' : '') + (char.gameTime ? '<div style="font-size:11px;color:var(--text-tertiary);">上次变化: ' + escapeHtml(gm._calculateRelativeTime(char.gameTime)) + '</div>' : '') + '</div>' + btns + '</div>';
        });
        html += '</div>'; return html;
    },

    editCharacter: function(name) {
        var gm = window.GameMemory; var char = gm.tables.characters[name]; if (!char) return;
        var fields = [
            { id: 'editCharName', label: '名称', type: 'text', required: true },
            { id: 'editCharTitle', label: '身份/称号', type: 'text' },
            { id: 'editCharRelation', label: '关系', type: 'text' },
            { id: 'editCharFav', label: '好感度', type: 'number' },
            { id: 'editCharMood', label: '心情', type: 'text' },
            { id: 'editCharLocation', label: '位置', type: 'text' },
            { id: 'editCharLocked', label: '锁定场景', type: 'checkbox' }
        ];
        var values = [name, char.title, char.relation, char.favorability, char.mood, char.location, char.locked];
        var html = '<div class="memory-card"><div class="memory-card-title">编辑角色: ' + escapeHtml(name) + '</div><div style="display:flex;flex-direction:column;gap:12px;">';
        for (let i = 0; i < fields.length; i++) html += this._formField(fields[i], values[i]);
        html += this._formFooter('characters', 'saveCharacter', name);
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
    },

    // 【P1-24修复】通用：MemoryManagerUI 写入实体后，同步运行时字段到 gm.tables 并失效缓存
    // -----------------------------------------------------------------------------
    // 实体字段（name/title/relation/...）由 GameMemoryAdapter 在 StateManager.set 后通过
    // MERGE 自动写入 gm.tables（见 game-memory-adapter.js _mergeTable fieldMap）。
    // 运行时字段（history/gameTime/accessCount/locked/lastChangedTurn 等）不在适配器 fieldMap 中，
    // 需显式写入。本助手统一 6 处 save* 函数的 rename + ensure-exists + runtime-write + 缓存失效逻辑。
    //
    // tableName: 'items' | 'characters' | 'locations'
    // name: 新名称；oldName: 旧名称（rename 场景，可为 undefined）
    // runtimeData: 包含运行时字段的对象
    // runtimeFields: 要写入的运行时字段名数组
    _syncGMRuntimeEntry: function(tableName, name, oldName, runtimeData, runtimeFields) {
        var gm = window.GameMemory;
        if (!gm || !gm.tables[tableName]) return;
        // rename：删除旧名条目（适配器不会主动删除）
        if (oldName && oldName !== name && gm.tables[tableName][oldName]) {
            delete gm.tables[tableName][oldName];
        }
        // 确保新名条目存在（适配器应已创建，此处保险）
        if (!gm.tables[tableName][name]) {
            gm.tables[tableName][name] = { name: name };
        }
        // 仅写入运行时字段（实体字段由 GameMemoryAdapter MERGE 处理，避免重复写入）
        var entry = gm.tables[tableName][name];
        for (var i = 0; i < runtimeFields.length; i++) {
            var f = runtimeFields[i];
            if (runtimeData[f] !== undefined) entry[f] = runtimeData[f];
        }
        // 【P0-7修复】失效 longTermMemory 缓存：characterTable/itemTable/locationTable
        // 是 deepClone 快照，gm.tables 改动后必须置 _ltmDirty=true，否则下次读取返回旧快照
        gm._ltmDirty = true;
    },

    saveCharacter: function(oldName) {
        var gm = window.GameMemory; var newName = document.getElementById('editCharName').value.trim(); if (!newName) return;
        var char = gm.tables.characters[oldName] || {};
        var _newCharData = { name: newName, title: document.getElementById('editCharTitle').value.trim(), relation: document.getElementById('editCharRelation').value.trim(), mood: document.getElementById('editCharMood').value.trim(), location: document.getElementById('editCharLocation').value.trim(), outfit: char.outfit || '', favorability: parseInt(document.getElementById('editCharFav').value) || 0, status: char.status || '', history: char.history || [], gameTime: gm.getGameTimeStr(), accessCount: char.accessCount || 0, lastChangedTurn: gm.currentTurn, locked: document.getElementById('editCharLocked').checked };

        // 【P0-4修复】单一写入入口 + 事务性回滚：
        // 旧实现先改 gm.tables 再调 Mutator，若 Mutator 失败 gm 已被污染（gm.tables[oldName] 已删除、
        // gm.tables[newName] 已写入新数据），状态不一致；后续 buildSmartInjection 读到错乱状态
        // 新策略：先走 Mutator（写 StateManager.entities.characters），成功后再同步 gm.tables 运行时字段
        // Mutator 内部 normalizeCharacter 失败或 StateManager.set 拒绝（非法路径/只读）均返回 false
        if (typeof CharacterMutator !== 'undefined' && CharacterMutator.replaceCharacter) {
            var mutatorOk = false;
            try {
                mutatorOk = !!CharacterMutator.replaceCharacter(oldName, _newCharData);
            } catch (e) {
                console.error('[MemoryManagerUI] CharacterMutator.replaceCharacter 异常:', e);
            }
            if (!mutatorOk) {
                UI.toast('保存失败：状态层拒绝写入（角色名可能为空或非法）');
                return;  // gm.tables 完全未改动，状态一致
            }
            // 【P1-24修复】Mutator 成功 → 适配器已 MERGE 实体字段到 gm.tables[newName]
            // 仅同步运行时字段（含 outfit/status 防御性覆盖）+ 失效 longTermMemory 缓存
            this._syncGMRuntimeEntry('characters', newName, oldName, _newCharData,
                ['history', 'gameTime', 'accessCount', 'lastChangedTurn', 'locked', 'outfit', 'status']);
        } else if (typeof gameState !== 'undefined' && gameState.allCharacters) {
            // legacy 兜底（无 StateManager 环境）
            if (oldName !== newName) delete gm.tables.characters[oldName];
            gm.tables.characters[newName] = _newCharData;
            if (oldName !== newName && gameState.allCharacters[oldName]) delete gameState.allCharacters[oldName];
            gameState.allCharacters[newName] = gameState.allCharacters[newName] || {};
            gameState.allCharacters[newName].name = newName;
            gameState.allCharacters[newName].title = _newCharData.title;
            gameState.allCharacters[newName].relation = _newCharData.relation;
            gameState.allCharacters[newName].favorability = _newCharData.favorability;
        }
        UI.afterMemoryChange('characters', 'allCharacters', undefined);
    },

    deleteCharacter: function(name) {
        var gm = window.GameMemory; if (!gm || !gm.tables.characters[name]) return;
        delete gm.tables.characters[name];
        // 【阶段1统一】删除角色委托 CharacterMutator.removeCharacter（替代直接 delete allCharacters）
        if (typeof CharacterMutator !== 'undefined' && CharacterMutator.removeCharacter) {
            CharacterMutator.removeCharacter(name);
        } else if (typeof gameState !== 'undefined' && gameState.allCharacters && gameState.allCharacters[name]) {
            delete gameState.allCharacters[name];
        }
        // 【v3审查修复】清理 permanentFacts.npcProfiles 中的孤儿引用
        // 否则 AI 在"核心设定"层仍看到已删除角色的 profile，可能继续让该角色登场
        if (gm.permanentFacts && Array.isArray(gm.permanentFacts.npcProfiles)) {
            var profiles = gm.permanentFacts.npcProfiles;
            for (var i = profiles.length - 1; i >= 0; i--) {
                var p = profiles[i];
                if (p && p.content && p.content.indexOf(name) === 0) {
                    // 确认是精确匹配角色名（后面跟分隔符或结束），避免误删"李四丰"的 profile
                    var after = p.content.substring(name.length);
                    if (!after || /^[\s:：\-—【（(]/.test(after)) {
                        profiles.splice(i, 1);
                    }
                }
            }
            gm._cachedInjection = null; gm._cachedInjectionTurn = -1;
        }
        UI.afterMemoryChange('characters', 'allCharacters', '角色已删除');
    },

    addCharacter: function() {
        var fields = [
            { id: 'addCharName', label: '名称', type: 'text', placeholder: '角色名称', required: true },
            { id: 'addCharTitle', label: '身份/称号', type: 'text', placeholder: '如：剑术导师' },
            { id: 'addCharRelation', label: '关系', type: 'text', placeholder: '如：朋友、敌人' },
            { id: 'addCharFav', label: '好感度', type: 'number', default: 50 }
        ];
        var html = '<div class="memory-card"><div class="memory-card-title">+ 添加角色</div><div style="display:flex;flex-direction:column;gap:12px;">';
        for (let i = 0; i < fields.length; i++) html += this._formField(fields[i], undefined);
        html += this._formFooter('characters', 'saveNewCharacter', undefined);
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
    },

    saveNewCharacter: function() {
        var gm = window.GameMemory; var name = document.getElementById('addCharName').value.trim(); if (!name) { UI.toast && UI.toast('请输入角色名称'); return; }
        var _newCharData = { name: name, title: document.getElementById('addCharTitle').value.trim(), relation: document.getElementById('addCharRelation').value.trim(), mood: '', location: '', outfit: '', favorability: parseInt(document.getElementById('addCharFav').value) || 0, status: '', history: [], gameTime: gm.getGameTimeStr(), accessCount: 0, lastChangedTurn: gm.currentTurn, locked: false };

        // 【P0-4修复】先走 Mutator，成功后再写 gm.tables 运行时字段（与 saveCharacter 同模式）
        if (typeof CharacterMutator !== 'undefined' && CharacterMutator.mergeCharacters) {
            var mutatorOk = false;
            try {
                mutatorOk = !!CharacterMutator.mergeCharacters([_newCharData]);
            } catch (e) {
                console.error('[MemoryManagerUI] CharacterMutator.mergeCharacters 异常:', e);
            }
            if (!mutatorOk) {
                UI.toast('保存失败：状态层拒绝写入');
                return;
            }
            // 【P1-24修复】Mutator 成功 → 适配器已 MERGE 实体字段；仅同步运行时字段 + 失效缓存
            this._syncGMRuntimeEntry('characters', name, undefined, _newCharData,
                ['history', 'gameTime', 'accessCount', 'lastChangedTurn', 'locked', 'outfit', 'status']);
        } else if (typeof gameState !== 'undefined') {
            // legacy 兜底
            gm.tables.characters[name] = _newCharData;
            if (!gameState.allCharacters) gameState.allCharacters = {};
            gameState.allCharacters[name] = { name: name, title: _newCharData.title, relation: _newCharData.relation, favorability: _newCharData.favorability };
        }
        UI.afterMemoryChange('characters', 'allCharacters', undefined);
    },

    renderItems: function(gm) {
        var self = this; var items = Object.values(gm.tables.items);
        var html = '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;"><span>物品追踪</span>' + this._btn('addOutline', 'addItem', undefined) + '</div>';
        if (items.length === 0) html += '<div class="memory-empty-state"><div>暂无物品数据</div></div>';
        else items.forEach(function(item) {
            var rarityColor = { '普通': '#999', '精良': '#34c759', '珍稀': '#007aff', '传说': '#ff9500' }[item.rarity] || '#999';
            var btns = '<div style="display:flex;flex-direction:column;gap:4px;">' + self._btn('edit', 'editItem', item.name) + self._btn('delete', 'deleteItem', item.name) + '</div>';
            html += '<div class="memory-character-card"><div class="memory-character-avatar" style="background:' + escapeHtml(rarityColor) + '20;color:' + escapeHtml(rarityColor) + ';">📦</div><div style="flex:1;"><div style="font-weight:600;">' + escapeHtml(item.name) + '</div><div style="font-size:12px;color:var(--text-secondary);">数量: ' + escapeHtml(item.qty) + (item.unit ? escapeHtml(item.unit) : '') + ' | 品质: <span style="color:' + escapeHtml(rarityColor) + ';">' + escapeHtml(item.rarity || '普通') + '</span></div>' + (item.desc ? '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">' + escapeHtml(item.desc) + '</div>' : '') + (item.accessCount ? '<div style="font-size:11px;color:var(--text-tertiary);">提及: ' + item.accessCount + '次</div>' : '') + '</div>' + btns + '</div>';
        });
        html += '</div>'; return html;
    },

    editItem: function(name) {
        var gm = window.GameMemory; var item = gm.tables.items[name]; if (!item) return;
        var fields = [
            { id: 'editItemName', label: '名称', type: 'text', required: true },
            { id: 'editItemQty', label: '数量', type: 'number' },
            { id: 'editItemUnit', label: '单位', type: 'text' },
            { id: 'editItemRarity', label: '品质', type: 'select', options: ['普通', '精良', '珍稀', '传说'] },
            { id: 'editItemDesc', label: '描述', type: 'textarea', minHeight: '80px' }
        ];
        var values = [name, item.qty || 1, item.unit || '个', item.rarity || '普通', item.desc || ''];
        var html = '<div class="memory-card"><div class="memory-card-title">编辑物品: ' + escapeHtml(name) + '</div><div style="display:flex;flex-direction:column;gap:12px;">';
        for (let i = 0; i < fields.length; i++) html += this._formField(fields[i], values[i]);
        html += this._formFooter('items', 'saveItem', name);
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
    },

    saveItem: function(oldName) {
        var gm = window.GameMemory; var newName = document.getElementById('editItemName').value.trim(); if (!newName) return;
        var item = gm.tables.items[oldName] || {};
        var _newItemData = { name: newName, qty: parseInt(document.getElementById('editItemQty').value) || 1, unit: document.getElementById('editItemUnit').value.trim() || '个', rarity: document.getElementById('editItemRarity').value, desc: document.getElementById('editItemDesc').value.trim(), obtainedTurn: item.obtainedTurn || gm.currentTurn, lastChangedTurn: gm.currentTurn, gameTime: gm.getGameTimeStr(), accessCount: item.accessCount || 0, history: item.history || [] };

        // 【P0-4修复】单一写入入口 + 事务性回滚（与 saveCharacter 同模式）：
        // 旧实现先改 gm.tables.items 再调 _syncItemsToBag，若同步失败 gm 已被污染
        // 新策略：先走 BagMutator（写 StateManager.entities.bag），成功后再同步 gm.tables.items 运行时字段
        // 注意：BagMutator 无 replaceItem，故用 setItems 全量重写 + 处理 rename
        if (typeof BagMutator !== 'undefined' && BagMutator.setItems) {
            // 构建 StateManager 视角的 bag（按 gm.tables.items 现状 + 用户编辑）
            // 此处不能直接复用 _syncItemsToBag 因为它假设 gm.tables 已是最终态
            var smBag = [];
            Object.keys(gm.tables.items).forEach(function(name) {
                var it = gm.tables.items[name];
                if (!it) return;
                if (name === oldName) return;  // 跳过旧条目，下面用新名添加
                smBag.push({
                    name: it.name || name,
                    count: it.qty || 1,
                    unit: it.unit || '个',
                    rarity: it.rarity || '普通',
                    desc: it.desc || '',
                    usable: it.usable || false,
                    effect: it.effect || '',
                    equippable: it.equippable || false,
                    equipped: it.equipped || false,
                    slot: it.slot || '',
                    obtainedTurn: it.obtainedTurn || 0,
                    lastChangedTurn: it.lastChangedTurn || 0,
                    history: Array.isArray(it.history) ? it.history : []
                });
            });
            // 加入编辑后的新条目（用新名）
            smBag.push({
                name: _newItemData.name,
                count: _newItemData.qty,
                unit: _newItemData.unit,
                rarity: _newItemData.rarity,
                desc: _newItemData.desc,
                usable: item.usable || false,
                effect: item.effect || '',
                equippable: item.equippable || false,
                equipped: item.equipped || false,
                slot: item.slot || '',
                obtainedTurn: _newItemData.obtainedTurn,
                lastChangedTurn: _newItemData.lastChangedTurn,
                history: _newItemData.history
            });

            var mutatorOk = false;
            try {
                mutatorOk = !!BagMutator.setItems(smBag);
            } catch (e) {
                console.error('[MemoryManagerUI] BagMutator.setItems 异常:', e);
            }
            if (!mutatorOk) {
                UI.toast('保存失败：状态层拒绝写入');
                return;  // gm.tables 未改动
            }
            // 【P1-24修复】Mutator 成功 → 适配器已 MERGE 实体字段（qty/unit/rarity/desc）到 gm.tables.items[newName]
            // 仅同步运行时字段（obtainedTurn/lastChangedTurn/gameTime/accessCount/history）+ 失效缓存
            this._syncGMRuntimeEntry('items', newName, oldName, _newItemData,
                ['obtainedTurn', 'lastChangedTurn', 'gameTime', 'accessCount', 'history']);
        } else if (typeof _syncItemsToBag === 'function') {
            // legacy 兜底：直接改 gm.tables，再走 _syncItemsToBag 同步
            if (oldName !== newName) delete gm.tables.items[oldName];
            gm.tables.items[newName] = _newItemData;
            _syncItemsToBag();
        } else if (typeof gameState !== 'undefined' && gameState.currentBag) {
            // 兜底：_syncItemsToBag 不可用时直接改视图
            if (oldName !== newName) delete gm.tables.items[oldName];
            gm.tables.items[newName] = _newItemData;
            if (oldName !== newName) gameState.currentBag = gameState.currentBag.filter(function(b) { return b.name !== oldName; });
            var found = false;
            for (let i = 0; i < gameState.currentBag.length; i++) {
                if (gameState.currentBag[i].name === newName) {
                    gameState.currentBag[i].count = _newItemData.qty;
                    gameState.currentBag[i].rarity = _newItemData.rarity;
                    gameState.currentBag[i].desc = _newItemData.desc;
                    found = true; break;
                }
            }
            if (!found) gameState.currentBag.push({ name: newName, count: _newItemData.qty, desc: _newItemData.desc, rarity: _newItemData.rarity });
        }
        UI.afterMemoryChange('items', 'currentBag', undefined);
    },

    deleteItem: function(name) {
        var gm = window.GameMemory; if (!gm || !gm.tables.items[name]) return;
        delete gm.tables.items[name];
        // 【全量修复-P0】删除物品走 _syncItemsToBag 统一同步点
        // _syncItemsToBag 会从 gm.tables.items 重新构建 bag 并写 StateManager
        if (typeof _syncItemsToBag === 'function') {
            _syncItemsToBag();
        } else if (typeof gameState !== 'undefined' && gameState.currentBag) {
            gameState.currentBag = gameState.currentBag.filter(function(b) { return b.name !== name; });
        }
        UI.afterMemoryChange('items', 'currentBag', '物品已删除');
    },

    addItem: function() {
        var fields = [
            { id: 'addItemName', label: '名称', type: 'text', placeholder: '物品名称', required: true },
            { id: 'addItemQty', label: '数量', type: 'number', default: 1 },
            { id: 'addItemUnit', label: '单位', type: 'text', default: '个' },
            { id: 'addItemRarity', label: '品质', type: 'select', options: ['普通', '精良', '珍稀', '传说'] },
            { id: 'addItemDesc', label: '描述', type: 'textarea', placeholder: '物品描述...', minHeight: '80px' }
        ];
        var html = '<div class="memory-card"><div class="memory-card-title">+ 添加物品</div><div style="display:flex;flex-direction:column;gap:12px;">';
        for (let i = 0; i < fields.length; i++) html += this._formField(fields[i], undefined);
        html += this._formFooter('items', 'saveNewItem', undefined, 'add');
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
    },

    saveNewItem: function() {
        var gm = window.GameMemory; var name = document.getElementById('addItemName').value.trim(); if (!name) { UI.toast && UI.toast('请输入物品名称'); return; }
        var _newItemData = { name: name, qty: parseInt(document.getElementById('addItemQty').value) || 1, unit: document.getElementById('addItemUnit').value.trim() || '个', rarity: document.getElementById('addItemRarity').value, desc: document.getElementById('addItemDesc').value.trim(), obtainedTurn: gm.currentTurn, lastChangedTurn: gm.currentTurn, gameTime: gm.getGameTimeStr(), accessCount: 0, history: [{ turn: gm.currentTurn, from: 0, to: parseInt(document.getElementById('addItemQty').value) || 1 }] };

        // 【P0-4修复】先走 BagMutator，成功后再写 gm.tables.items 运行时字段
        if (typeof BagMutator !== 'undefined' && BagMutator.mergeItems) {
            var mutatorOk = false;
            try {
                mutatorOk = !!BagMutator.mergeItems([{
                    name: _newItemData.name,
                    count: _newItemData.qty,
                    unit: _newItemData.unit,
                    rarity: _newItemData.rarity,
                    desc: _newItemData.desc,
                    obtainedTurn: _newItemData.obtainedTurn,
                    lastChangedTurn: _newItemData.lastChangedTurn,
                    history: _newItemData.history
                }]);
            } catch (e) {
                console.error('[MemoryManagerUI] BagMutator.mergeItems 异常:', e);
            }
            if (!mutatorOk) {
                UI.toast('保存失败：状态层拒绝写入');
                return;
            }
            // 【P1-24修复】Mutator 成功 → 适配器已 MERGE 实体字段；仅同步运行时字段 + 失效缓存
            this._syncGMRuntimeEntry('items', name, undefined, _newItemData,
                ['obtainedTurn', 'lastChangedTurn', 'gameTime', 'accessCount', 'history']);
        } else if (typeof _syncItemsToBag === 'function') {
            // legacy 兜底：直接改 gm.tables，再走 _syncItemsToBag 同步
            gm.tables.items[name] = _newItemData;
            _syncItemsToBag();
        } else if (typeof gameState !== 'undefined') {
            // 兜底：_syncItemsToBag 不可用时直接改视图
            gm.tables.items[name] = _newItemData;
            if (!gameState.currentBag) gameState.currentBag = [];
            var exists = gameState.currentBag.some(function(b) { return b.name === name; });
            if (!exists) gameState.currentBag.push({ name: name, count: _newItemData.qty, desc: _newItemData.desc, rarity: _newItemData.rarity });
        }
        UI.afterMemoryChange('items', 'currentBag', undefined);
    },

    renderLocations: function(gm) {
        var self = this; var locs = Object.values(gm.tables.locations);
        var html = '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;"><span>地点记录</span>' + this._btn('addOutline', 'addLocation', undefined) + '</div>';
        if (locs.length === 0) html += '<div class="memory-empty-state"><div>暂无地点数据</div></div>';
        else locs.forEach(function(loc) {
            var btns = '<div style="display:flex;gap:4px;">' + self._btn('edit', 'editLocation', loc.name) + self._btn('delete', 'deleteLocation', loc.name) + '</div>';
            html += '<div style="padding:12px;background:var(--bg);border-radius:8px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;"><div style="flex:1;"><div style="font-weight:600;">' + escapeHtml(loc.name) + (loc.locked ? ' ◈' : '') + '</div>' + (loc.desc ? '<div style="font-size:12px;color:var(--text-secondary);">' + escapeHtml(loc.desc) + '</div>' : '') + (loc.features ? '<div style="font-size:11px;color:var(--text-tertiary);">特征: ' + escapeHtml(loc.features) + '</div>' : '') + (loc.sceneState ? '<div style="font-size:11px;color:#ff9500;">场景: ' + escapeHtml(loc.sceneState) + (loc.locked ? ' [锁定]' : '') + '</div>' : '') + (loc.accessCount ? '<div style="font-size:11px;color:var(--text-tertiary);">提及: ' + loc.accessCount + '次</div>' : '') + '</div>' + btns + '</div>';
        });
        html += '</div>'; return html;
    },

    editLocation: function(name) {
        var gm = window.GameMemory; var loc = gm.tables.locations[name]; if (!loc) return;
        var fields = [
            { id: 'editLocName', label: '名称', type: 'text', required: true },
            { id: 'editLocDesc', label: '描述', type: 'textarea', minHeight: '80px' },
            { id: 'editLocFeatures', label: '特征', type: 'text' },
            { id: 'editLocLocked', label: '锁定场景', type: 'checkbox' }
        ];
        var values = [name, loc.desc || '', loc.features || '', loc.locked];
        var html = '<div class="memory-card"><div class="memory-card-title">编辑地点</div><div style="display:flex;flex-direction:column;gap:12px;">';
        for (let i = 0; i < fields.length; i++) html += this._formField(fields[i], values[i]);
        html += this._formFooter('locations', 'saveLocation', name);
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
    },

    saveLocation: function(oldName) {
        var gm = window.GameMemory; var newName = document.getElementById('editLocName').value.trim(); if (!newName) { UI.toast && UI.toast('请输入地点名称'); return; }
        var loc = gm.tables.locations[oldName]; if (!loc) return;
        var _newLocData = { name: newName, desc: document.getElementById('editLocDesc').value.trim(), features: document.getElementById('editLocFeatures').value.trim(), charactersPresent: loc.charactersPresent || '', lastChangedTurn: gm.currentTurn, locked: document.getElementById('editLocLocked').checked };

        // 【P0-4修复】单一写入入口 + 事务性回滚：
        // 旧实现只改 gm.tables.locations 不同步 StateManager，导致用户编辑对 StateManager.entities.locations
        // 不可见——后续 AI 写入新 locations 时 StateManager.set('entities.locations') 会覆盖，
        // 但 gm.tables 中用户编辑的 entry 因适配器 MERGE 语义被保留（孤儿条目），
        // 造成"用户改了地点锁定但 AI 看不到"的不一致
        // 新策略：先写 StateManager.entities.locations（无 LocMutator，直接操作数组），成功后再同步 gm.tables
        if (typeof StateManager !== 'undefined' && StateManager.get && StateManager.set) {
            // 构建 StateManager 视角的 locations（按现有 + 用户编辑）
            var smLocs = [];
            var rawLocs = StateManager.get('entities.locations') || [];
            rawLocs.forEach(function(l) {
                if (l && l.name && l.name !== oldName) {
                    smLocs.push({ name: l.name, desc: l.desc || '', features: l.features || '', charactersPresent: l.charactersPresent || '' });
                }
            });
            // 加入编辑后的新条目
            smLocs.push({
                name: _newLocData.name,
                desc: _newLocData.desc,
                features: _newLocData.features,
                charactersPresent: _newLocData.charactersPresent
            });

            var smOk = false;
            try {
                smOk = !!StateManager.set('entities.locations', smLocs, { silent: true });
            } catch (e) {
                console.error('[MemoryManagerUI] StateManager.set entities.locations 异常:', e);
            }
            if (!smOk) {
                UI.toast('保存失败：状态层拒绝写入');
                return;  // gm.tables 未改动
            }
            // 【P1-24修复】StateManager 成功 → 适配器已 MERGE 实体字段（desc/features/charactersPresent）
            // 仅同步运行时字段（lastChangedTurn/locked）+ 失效缓存
            this._syncGMRuntimeEntry('locations', newName, oldName, _newLocData,
                ['lastChangedTurn', 'locked']);
        } else {
            // legacy 兜底（无 StateManager 环境）
            if (newName !== oldName) delete gm.tables.locations[oldName];
            gm.tables.locations[newName] = _newLocData;
        }
        UI.afterMemoryChange('locations', 'worldSnapshot', undefined);
    },

    deleteLocation: function(name) {
        var gm = window.GameMemory; if (!gm || !gm.tables.locations[name]) return;
        delete gm.tables.locations[name];
        UI.afterMemoryChange('locations', 'worldSnapshot', '地点已删除');
    },

    addLocation: function() {
        var fields = [
            { id: 'addLocName', label: '名称', type: 'text', placeholder: '地点名称', required: true },
            { id: 'addLocDesc', label: '描述', type: 'textarea', placeholder: '地点描述...', minHeight: '80px' }
        ];
        var html = '<div class="memory-card"><div class="memory-card-title">+ 添加地点</div><div style="display:flex;flex-direction:column;gap:12px;">';
        for (let i = 0; i < fields.length; i++) html += this._formField(fields[i], undefined);
        html += this._formFooter('locations', 'saveNewLocation', undefined);
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
    },

    saveNewLocation: function() {
        var gm = window.GameMemory; var name = document.getElementById('addLocName').value.trim(); if (!name) { UI.toast && UI.toast('请输入地点名称'); return; }
        var _newLocData = { name: name, desc: document.getElementById('addLocDesc').value.trim(), features: '', charactersPresent: '', lastChangedTurn: gm.currentTurn, locked: false };

        // 【P0-4修复】先写 StateManager.entities.locations（无 LocMutator，直接操作数组）
        if (typeof StateManager !== 'undefined' && StateManager.get && StateManager.set) {
            var rawLocs = StateManager.get('entities.locations') || [];
            var smLocs = rawLocs.filter(function(l) { return l && l.name; }).map(function(l) {
                return { name: l.name, desc: l.desc || '', features: l.features || '', charactersPresent: l.charactersPresent || '' };
            });
            // 检查是否已存在同名条目，避免重复
            var exists = smLocs.some(function(l) { return l.name === name; });
            if (!exists) {
                smLocs.push({ name: _newLocData.name, desc: _newLocData.desc, features: _newLocData.features, charactersPresent: _newLocData.charactersPresent });
            }
            var smOk = false;
            try {
                smOk = !!StateManager.set('entities.locations', smLocs, { silent: true });
            } catch (e) {
                console.error('[MemoryManagerUI] StateManager.set entities.locations 异常:', e);
            }
            if (!smOk) {
                UI.toast('保存失败：状态层拒绝写入');
                return;
            }
            // 【P1-24修复】StateManager 成功 → 适配器已 MERGE 实体字段；仅同步运行时字段 + 失效缓存
            this._syncGMRuntimeEntry('locations', name, undefined, _newLocData,
                ['lastChangedTurn', 'locked']);
        } else {
            // legacy 兜底
            gm.tables.locations[name] = _newLocData;
        }
        UI.afterMemoryChange('locations', 'worldSnapshot', undefined);
    },

    renderRelationships: function(gm) {
        var self = this; var rels = Object.values(gm.tables.relationships);
        var html = '<div class="memory-card"><div class="memory-card-title">关系网</div>';
        if (rels.length === 0) html += '<div class="memory-empty-state"><div>暂无关系数据</div></div>';
        else rels.forEach(function(rel) { html += '<div style="padding:10px;background:var(--bg);border-radius:8px;margin-bottom:6px;"><div style="font-weight:600;">' + escapeHtml(rel.from) + ' → ' + escapeHtml(rel.to) + '</div><div style="font-size:12px;color:var(--text-secondary);">' + escapeHtml(rel.type || '') + (rel.desc ? ' - ' + escapeHtml(rel.desc) : '') + '</div></div>'; });
        html += '</div>'; return html;
    },

    renderPlot: function(gm) {
        var self = this;
        var html = '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;"><span>剧情大纲</span>' + this._btn('editOutline', 'editPlot', undefined) + '</div>';
        if (gm.plot.worldSetting) html += '<div style="margin-bottom:12px;"><div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">世界观</div><div style="padding:12px;background:var(--bg);border-radius:8px;white-space:pre-wrap;line-height:1.6;">' + escapeHtml(gm.plot.worldSetting) + '</div></div>';
        if (gm.plot.chapters.length > 0) { html += '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">章节</div>'; gm.plot.chapters.forEach(function(ch) { html += '<div style="padding:10px;background:var(--bg);border-radius:8px;margin-bottom:6px;"><div style="font-weight:600;">' + escapeHtml(ch.title) + ' <span style="font-size:11px;color:var(--text-tertiary);">回合 ' + ch.startTurn + '-' + ch.endTurn + '</span></div><div style="font-size:12px;color:var(--text-secondary);white-space:pre-wrap;">' + escapeHtml(ch.summary) + '</div></div>'; }); }
        if (gm.plot.currentChapter) html += '<div style="margin-top:12px;"><div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">当前进展</div><div style="padding:12px;background:var(--bg);border-radius:8px;white-space:pre-wrap;line-height:1.6;max-height:200px;overflow-y:auto;">' + escapeHtml(gm.plot.currentChapter) + '</div></div>';
        if (gm.plot.pendingMysteries && gm.plot.pendingMysteries.length > 0) { html += '<div style="margin-top:12px;"><div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">待解决悬念</div>'; gm.plot.pendingMysteries.forEach(function(m) { html += '<div style="padding:6px 10px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;">• ' + escapeHtml(m) + '</div>'; }); html += '</div>'; }
        html += '</div>'; return html;
    },

    editPlot: function() {
        var gm = window.GameMemory;
        var fields = [
            { id: 'editPlotWorld', label: '世界观', type: 'textarea', minHeight: '100px' },
            { id: 'editPlotCurrent', label: '当前进展', type: 'textarea', minHeight: '150px' }
        ];
        var values = [gm.plot.worldSetting || '', gm.plot.currentChapter || ''];
        var html = '<div class="memory-card"><div class="memory-card-title">编辑剧情大纲</div><div style="display:flex;flex-direction:column;gap:12px;">';
        for (let i = 0; i < fields.length; i++) html += this._formField(fields[i], values[i]);
        html += this._formFooter('plot', 'savePlot', undefined);
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
    },

    savePlot: function() {
        var gm = window.GameMemory; gm.plot.worldSetting = document.getElementById('editPlotWorld').value.trim(); gm.plot.currentChapter = document.getElementById('editPlotCurrent').value.trim();
        if (typeof gameState !== 'undefined') { gameState.rollingSummary = (gm.plot.worldSetting || '') + '\n' + (gm.plot.currentChapter || ''); }
        // 【P1-24/P0-7修复】失效 longTermMemory 缓存：worldSetting/currentChapterSummary 来自 plot
        gm._ltmDirty = true;
        UI.afterMemoryChange('plot', 'rollingSummary', undefined);
    },

    renderEvents: function(gm) {
        var self = this; var events = gm.events.slice(-20).reverse();
        var html = '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;"><span>重要事件</span>' + this._btn('addOutline', 'addEvent', undefined) + '</div>';
        if (events.length === 0) html += '<div class="memory-empty-state"><div>暂无重要事件</div></div>';
        else events.forEach(function(event, idx) {
            var realIdx = gm.events.length - 1 - idx; var imp = event.importance || 5;
            var icon = imp >= 9 ? '●' : (imp >= 7 ? '◐' : '○');
            html += '<div class="memory-event-item" style="display:flex;align-items:flex-start;gap:8px;"><div style="flex:1;"><div style="font-weight:600;margin-bottom:4px;">' + icon + ' ' + escapeHtml(event.content) + '</div><div style="font-size:11px;color:var(--text-tertiary);">第' + escapeHtml(event.turn) + '回合 | ' + escapeHtml(event.gameTime || '') + (event.gameTime ? ' (' + escapeHtml(gm._calculateRelativeTime(event.gameTime)) + ')' : '') + ' | 重要度: ' + escapeHtml(imp) + '/10' + (event.accessCount ? ' | 提及' + event.accessCount + '次' : '') + '</div></div>' + self._btn('delete', 'deleteEvent', realIdx) + '</div>';
        });
        html += '</div>'; return html;
    },

    addEvent: function() {
        var fields = [
            { id: 'addEventContent', label: '事件内容', type: 'textarea', placeholder: '描述发生了什么...', minHeight: '100px' },
            { id: 'addEventImportance', label: '重要度 (1-10)', type: 'number', min: 1, max: 10, default: 5 }
        ];
        var html = '<div class="memory-card"><div class="memory-card-title">+ 添加事件</div><div style="display:flex;flex-direction:column;gap:12px;">';
        for (let i = 0; i < fields.length; i++) html += this._formField(fields[i], undefined);
        html += this._formFooter('events', 'saveNewEvent', undefined, 'add');
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
    },

    saveNewEvent: function() {
        var gm = window.GameMemory; var content = document.getElementById('addEventContent').value.trim(); if (!content) { UI.toast && UI.toast('请输入事件内容'); return; }
        var importance = parseInt(document.getElementById('addEventImportance').value) || 5;
        // 【阶段1-A2】统一通过 gm.addImportantEvent 写入（含去重 + 修剪 + 同步 + 持久化）
        // 旧代码直接 gm.events.push + 手动 slice(-50) + _syncEventsToKeyEvents，绕过去重逻辑
        var added = gm.addImportantEvent({ content: content, importance: importance });
        if (!added) { UI.toast && UI.toast('该事件已存在'); return; }
        UI.afterMemoryChange('events', 'keyEvents', undefined);
    },

    deleteEvent: function(index) {
        var gm = window.GameMemory; if (!gm || !gm.events[index]) return;
        gm.events.splice(index, 1);
        // 【阶段1-A2】统一通过 _syncEventsToKeyEvents 同步 + saveToStorage 持久化
        // _syncEventsToKeyEvents 是 core.js 的函数声明（hoisted），始终可用
        if (typeof _syncEventsToKeyEvents === 'function') _syncEventsToKeyEvents();
        try { gm.saveToStorage(); } catch(e) { console.warn('[MemoryManagerUI] deleteEvent 保存失败:', e); }
        UI.afterMemoryChange('events', 'keyEvents', '事件已删除');
    },

    renderQuests: function(gm) {
        var self = this; var quests = gm.quests || [];
        var pending = quests.filter(function(q) { return q.status === 'pending'; });
        var resolved = quests.filter(function(q) { return q.status === 'resolved'; });
        var typeIcons = { promise: '◇', quest: '◇', threat: '△', mystery: '?' };
        var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><div style="font-size:13px;color:var(--text-tertiary);">' + pending.length + ' 进行中 | ' + resolved.length + ' 已完成</div></div>';
        if (pending.length > 0) {
            html += '<div class="memory-card"><div class="memory-card-title">进行中</div>';
            pending.forEach(function(q, i) {
                var icon = typeIcons[q.type] || '◇'; var age = gm.currentTurn - (q.createdTurn || 0);
                var staleWarn = q.stale || age > 30 ? '<span style="color:#f44;font-size:11px;margin-left:6px;">[长期未兑现]</span>' : '';
                html += '<div style="padding:10px;background:var(--bg);border-radius:8px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;"><div style="flex:1;"><div style="font-weight:600;">' + icon + ' ' + escapeHtml(q.title) + staleWarn + '</div><div style="font-size:11px;color:var(--text-tertiary);">创建于第' + escapeHtml(q.createdTurn || 0) + '回合</div></div>' + self._btn('resolve', 'resolveQuestByIndex', quests.indexOf(q)) + '</div>';
            });
            html += '</div>';
        }
        if (resolved.length > 0) {
            html += '<div class="memory-card"><div class="memory-card-title">已完成</div>';
            resolved.slice(-5).forEach(function(q) {
                var icon = typeIcons[q.type] || '◇';
                html += '<div style="padding:8px 10px;background:var(--bg);border-radius:6px;margin-bottom:4px;opacity:0.6;"><div style="font-size:13px;">✓ ' + icon + ' ' + escapeHtml(q.title) + '</div></div>';
            });
            html += '</div>';
        }
        if (quests.length === 0) html += '<div class="memory-empty-state"><div>暂无约定/任务</div></div>';
        return html;
    },

    resolveQuestByIndex: function(idx) {
        var gm = window.GameMemory; if (!gm || !gm.quests[idx]) return;
        gm.quests[idx].status = 'resolved'; gm.quests[idx].resolvedTurn = gm.currentTurn;
        if (typeof gameState !== 'undefined' && gameState.currentQuests && gm.quests[idx].title) {
            var questTitle = gm.quests[idx].title;
            for (let i = 0; i < gameState.currentQuests.length; i++) {
                if (gameState.currentQuests[i].title && gameState.currentQuests[i].title.indexOf(questTitle.substring(0, 10)) >= 0) {
                    gameState.currentQuests[i].status = '已完成'; break;
                }
            }
        }
        UI.afterMemoryChange('quests', 'currentQuests', '约定已完成');
    },

    renderTimeline: function(gm) {
        var self = this; var tl = gm.timeline.slice(-20).reverse();
        var html = '<div class="memory-card"><div class="memory-card-title">时间线</div>';
        if (tl.length === 0) html += '<div class="memory-empty-state"><div>暂无时间线数据</div></div>';
        else tl.forEach(function(t) { html += '<div style="padding:8px 10px;background:var(--bg);border-radius:6px;margin-bottom:4px;display:flex;gap:10px;align-items:center;"><div style="font-size:11px;color:var(--text-tertiary);white-space:nowrap;">第' + escapeHtml(t.turn) + '回合</div><div style="font-size:11px;color:var(--accent);white-space:nowrap;">' + escapeHtml(t.gameTime || '') + '</div><div style="font-size:13px;flex:1;">' + escapeHtml(t.summary || '') + '</div></div>'; });
        html += '</div>'; return html;
    },

    renderInjectionPreview: function(gm) {
        var self = this;
        var injection = gm.buildInjection();
        var stats = gm._lastInjectionStats || {};
        var html = '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;"><span>注入预览</span>' + this._btn('refresh', 'refreshInjection', undefined) + '</div>'
            + '<div style="padding:12px;background:var(--bg);border-radius:8px;margin-bottom:12px;"><div style="font-size:11px;color:var(--text-secondary);">总字符: ' + (stats.totalChars || 0) + ' / 预算: ' + (stats.budget || 0) + '</div>'
            + (stats.skippedModules && stats.skippedModules.length > 0 ? '<div style="font-size:11px;color:#ff9500;margin-top:4px;">变化驱动跳过: ' + stats.skippedModules.join(', ') + ' (无变化，零Token)</div>' : '')
            + '</div>'
            + '<div style="padding:12px;background:var(--bg);border-radius:8px;white-space:pre-wrap;font-size:13px;line-height:1.6;max-height:400px;overflow-y:auto;font-family:monospace;">' + escapeHtml(injection) + '</div></div>';
        return html;
    },

    refreshInjection: function() { this.switchTab('injection'); },

    renderSearch: function(gm) {
        var self = this;
        return '<div class="memory-card"><div class="memory-card-title">搜索记忆</div><div style="display:flex;gap:8px;margin-bottom:12px;"><input id="memorySearchInput" placeholder="输入关键词搜索..." style="flex:1;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">' + this._btn('search', 'doSearch', undefined, '8px') + '</div><div id="memorySearchResults"></div></div>';
    },

    doSearch: function() {
        var input = document.getElementById('memorySearchInput');
        if (!input) return;
        var keyword = input.value.trim();
        if (!keyword) return;
        var gm = window.GameMemory;
        var results = gm.search(keyword);
        var container = document.getElementById('memorySearchResults');
        if (!container) return;
        var self = this;
        var html = '';
        if (results.events.length > 0) { html += '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">事件 (' + results.events.length + ')</div>'; results.events.forEach(function(e) { html += '<div style="padding:8px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;">' + escapeHtml(e.content) + '</div>'; }); }
        if (results.characters.length > 0) { html += '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;margin-top:8px;">角色 (' + results.characters.length + ')</div>'; results.characters.forEach(function(c) { html += '<div style="padding:8px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;">' + escapeHtml(c.name) + (c.relation ? ' - ' + escapeHtml(c.relation) : '') + '</div>'; }); }
        if (results.items.length > 0) { html += '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;margin-top:8px;">物品 (' + results.items.length + ')</div>'; results.items.forEach(function(it) { html += '<div style="padding:8px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;">' + escapeHtml(it.name) + ' x' + escapeHtml(it.qty) + '</div>'; }); }
        if (results.summaries.length > 0) { html += '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;margin-top:8px;">摘要 (' + results.summaries.length + ')</div>'; results.summaries.forEach(function(s) { html += '<div style="padding:8px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;">' + escapeHtml(s) + '</div>'; }); }
        if (!html) html = '<div style="text-align:center;padding:20px;color:var(--text-tertiary);">未找到匹配结果</div>';
        container.innerHTML = html;
    }
};

window.MemoryManagerUI = MemoryManagerUI;

/**
 * ============================================================================
 * STscript Engine v2.1 for 自由剧本 (Free Script)
 * ============================================================================
 * 完整兼容 SillyTavern / 酒馆助手 的 STscript 语法解析引擎
 * 
 * v2.1 更新（蛾摩拉2.4适配）：
 * - 新增：{{random:选项1::选项2}} 单冒号语法（蛾摩拉变体）
 * - 新增：{{trim}} 去除首尾空白
 * - 新增：entryGrouping 条目分组支持
 * - 增强：jailbreak 兼容 identifier 方式（蛾摩拉无 isJailbreak 字段）
 * - 增强：变量名支持中文（蛾摩拉大量使用中文变量名）
 * - 修复：setvar 值中含 :: 时的贪婪匹配问题
 * 
 * v2.0 更新：
 * - 新增：{{char}}/{{user}} 宏变量替换（支持 <user>/<char> XML标签）
 * - 新增：{{lastUserMessage}} / {{lastCharMessage}} / {{time}} / {{date}}
 * - 新增：{{roll:dN}} 骰子语法（如 {{roll:d20}}）
 * - 新增：{{charCard}} 角色卡信息注入
 * - 新增：{{input}} / {{lastMessage}} 别名
 * - 增强：条件判断支持嵌套、多条件 && / ||
 * - 增强：{{if}} 支持 > < >= <= contains 等比较运算
 * - 增强：{{random}} 支持权重 {{random::w:2:选项A::w:1:选项B}}
 * - 修复：setvar 多行值处理、递归解析
 * ============================================================================
 */

(function(global) {
    'use strict';

    // ============================================================================
    // 变量存储系统 (会话级)
    // ============================================================================
    var VariableStore = {
    local: new Map(),
    global: new Map(),
    character: new Map(),
    currentCharacterId: null,

    setLocal(name, value) {
        this.local.set(name, String(value));
        this._notifyChange('local', name, value);
    },
    getLocal(name, defaultValue = '') {
        return this.local.has(name) ? this.local.get(name) : defaultValue;
    },
    setGlobal(name, value) {
        this.global.set(name, String(value));
        this._persistGlobal();
        this._notifyChange('global', name, value);
    },
    getGlobal(name, defaultValue = '') {
        return this.global.has(name) ? this.global.get(name) : defaultValue;
    },
    setCharacter(charId, name, value) {
        if (!this.character.has(charId)) this.character.set(charId, new Map());
        this.character.get(charId).set(name, String(value));
        this._notifyChange('character', name, value, charId);
    },
    getCharacter(charId, name, defaultValue = '') {
        if (!this.character.has(charId)) return defaultValue;
        const m = this.character.get(charId);
        return m.has(name) ? m.get(name) : defaultValue;
    },
    setCurrentCharacter(charId) { this.currentCharacterId = charId; },
    getCurrentCharacter() { return this.currentCharacterId; },

    _persistGlobal() {
        try {
            const d = {};
            this.global.forEach((v, k) => d[k] = v);
            Storage.setJSON(Storage.KEYS.GLOBAL_VARS, d);
            } catch (e) {
                // 【优化】记录错误日志，便于调试存档失败问题
                console.warn('[VariableStore] 全局变量持久化失败:', e && e.message);
            }
        },
    loadGlobal() {
        try {
            const d = Storage.getJSON(Storage.KEYS.GLOBAL_VARS, {});
            Object.entries(d).forEach(([k, v]) => this.global.set(k, v));
            } catch (e) {
                // 【优化】记录错误日志，便于调试存档读取失败问题
                console.warn('[VariableStore] 全局变量加载失败:', e && e.message);
            }
        },
    clearAll() { this.local.clear(); this.character.clear(); },
    clearLocal() { this.local.clear(); },
    _notifyChange(scope, name, value, charId = null) {
        if (window.STscriptUI) window.STscriptUI.onVariableChange(scope, name, value, charId);
    },
    export() {
        const r = { local: {}, global: {}, character: {} };
        this.local.forEach((v, k) => r.local[k] = v);
        this.global.forEach((v, k) => r.global[k] = v);
        this.character.forEach((cm, cid) => {
            r.character[cid] = {};
            cm.forEach((v, k) => r.character[cid][k] = v);
            });
        return r;
    }
    };
    VariableStore.loadGlobal();

    // ============================================================================
    // 模板变量系统 v2.0
    // ============================================================================
    var TemplateVars = {
    context: {
        user: '用户',
        char: '助手',
        lastUserMessage: '',
        lastCharMessage: '',
        chatHistory: [],
        character: null
    },

    setContext(ctx) { Object.assign(this.context, ctx); },

    get(name) {
        const c = this.context;
        switch (name) {
            // 核心身份
            case 'user': return c.user || '用户';
            case 'char': return c.char || '助手';
            // 消息相关
            case 'lastusermessage':
            case 'lastmessage':
            case 'input': return c.lastUserMessage || '';
            case 'lastcharmessage': return c.lastCharMessage || '';
            // 时间
            case 'timestamp': return new Date().toISOString();
            case 'date': return new Date().toLocaleDateString('zh-CN');
            case 'time': return new Date().toLocaleTimeString('zh-CN');
            case 'datetime': return new Date().toLocaleString('zh-CN');
            // 随机
            case 'uuid': return this._uuid();
            case 'random': return Math.random().toString(36).substring(2, 10);
            case 'roll': return Math.floor(Math.random() * 100) + 1;
            // 角色卡
            case 'charcard':
            case 'char_card': return this._charCardSummary();
            case 'chardesc':
            case 'char_desc': return c.character?.description || '';
            case 'charpersonality':
            case 'char_personality': return c.character?.personality || '';
            case 'charscenario':
            case 'char_scenario': return c.character?.scenario || '';
            case 'charname':
            case 'char_name': return c.char || '助手';
            case 'username':
            case 'user_name': return c.user || '用户';
            // 聊天统计
            case 'chatindex':
            case 'chat_index': return String((c.chatHistory || []).length);
            case 'messagenumber':
            case 'message_number': return String((c.chatHistory || []).length + 1);
            default:
            return VariableStore.getLocal(name) ||
            VariableStore.getGlobal(name) ||
            VariableStore.getCharacter(VariableStore.getCurrentCharacter(), name) ||
            '';
        }
    },

    _uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
    },

    _charCardSummary() {
        const c = this.context.character;
        if (!c) return '';
        let s = '';
        if (c.name) s += `角色名: ${c.name}\n`;
        if (c.description) s += `描述: ${c.description}\n`;
        if (c.personality) s += `性格: ${c.personality}\n`;
        if (c.scenario) s += `场景: ${c.scenario}\n`;
        if (c.first_mes) s += `开场白: ${c.first_mes}\n`;
        return s.trim();
    }
    };

    // ============================================================================
    // STscript 解析器 v2.0
    // ============================================================================
    var STscriptParser = {

/**
 * 主解析入口
 */
parse(text, options = {}) {
if (!text || typeof text !== 'string') return text;
const ctx = options.context || {};
TemplateVars.setContext(ctx);

// 按顺序处理
text = this._removeComments(text);
text = this._processSetVars(text);
text = this._processConditions(text);
text = this._processRandom(text);
text = this._processRoll(text);
text = this._replaceTemplateVars(text);
text = this._replaceXmlMacros(text);
text = this._processLogicOps(text);

return text;
},

// ── 注释 ──
_removeComments(text) {
return text.replace(/\{\{\/\/[^}]*?\}\}/gs, '');
},

// ── 变量设置 ──
_processSetVars(text) {
// {{setvar::name::value}} — value 可跨行
// 性能优化：使用单次 replace 回调，避免 O(N*L) 的逐次全文本替换
const self = this;
text = text.replace(/\{\{setvar::([^:]+?)::([\s\S]*?)\}\}/g, function(full, name, val) {
    val = (val || '').trim();
    val = self.parse(val, { context: TemplateVars.context });
    VariableStore.setLocal(name.trim(), val);
    return '';
});
// {{setglobalvar::name::value}}
text = text.replace(/\{\{setglobalvar::([^:]+?)::([\s\S]*?)\}\}/g, function(full, name, val) {
    val = (val || '').trim();
    val = self.parse(val, { context: TemplateVars.context });
    VariableStore.setGlobal(name.trim(), val);
    return '';
});
// {{trim}} — 去除首尾空白
text = text.replace(/\{\{trim\}\}/gi, '');
return text;
},

// ── 条件判断（支持嵌套） ──
_processConditions(text) {
// 先处理 {{if:cond}}...{{else}}...{{/if}}
let maxIter = 20; // 防止无限循环
while (text.includes('{{if:') && text.includes('{{/if}}') && maxIter-- > 0) {
    // 找最内层的 if/else/endif
    const innerIf = /\{\{if:([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
    let changed = false;
    text = text.replace(innerIf, (match, condition, body) => {
        // 检查body内是否有else
        const elseIdx = this._findElse(body);
        if (elseIdx !== -1) {
            const ifPart = body.substring(0, elseIdx);
            const elsePart = body.substring(elseIdx + 8); // {{else}} length
            changed = true;
            return this._evalCond(condition.trim()) ? ifPart : elsePart;
        }
        changed = true;
        return this._evalCond(condition.trim()) ? body : '';
    });
    if (!changed) break;
}
return text;
},

_findElse(text) {
// 找第一个不在嵌套if中的 {{else}}
let depth = 0;
let pos = 0;
while (pos < text.length) {
    const ifIdx = text.indexOf('{{if:', pos);
    const endIdx = text.indexOf('{{/if}}', pos);
    const elseIdx = text.indexOf('{{else}}', pos);
    if (ifIdx === -1 && endIdx === -1 && elseIdx === -1) break;
    // 找最近的
    let nearest = -1;
    if (ifIdx !== -1) nearest = ifIdx;
    if (endIdx !== -1 && (nearest === -1 || endIdx < nearest)) nearest = endIdx;
    if (elseIdx !== -1 && (nearest === -1 || elseIdx < nearest)) nearest = elseIdx;

    if (nearest === ifIdx) { depth++; pos = ifIdx + 5; }
    else if (nearest === endIdx) { depth--; pos = endIdx + 7; }
    else if (nearest === elseIdx && depth === 0) { return elseIdx; }
    else { pos = elseIdx + 8; }
}
return -1;
},

_evalCond(condition) {
// 替换变量
condition = condition.replace(/\{\{([^}]+)\}\}/g, (_, name) => TemplateVars.get(name.trim()));
condition = condition.trim();

// 支持 && 和 ||
if (/\&\&/.test(condition)) {
    return condition.split('&&').map(s => this._evalCond(s.trim())).every(Boolean);
}
if (/\|\|/.test(condition)) {
    return condition.split('||').map(s => this._evalCond(s.trim())).some(Boolean);
}

// 比较运算
// 【修复】使用正则精确匹配运算符，避免 !== / === 被错误截断
const opPatterns = [
    [/(!==)/, (a, b) => a !== b],
    [/(!=)/, (a, b) => a !== b],
    [/(===)/, (a, b) => a === b],
    [/(==)/, (a, b) => a === b],
    [/(>=)/, (a, b) => Number(a) >= Number(b)],
    [/(<=)/, (a, b) => Number(a) <= Number(b)],
    [/(>)/, (a, b) => Number(a) > Number(b)],
    [/(<)/, (a, b) => Number(a) < Number(b)],
];
for (const [rx, fn] of opPatterns) {
    const m = condition.match(rx);
    if (m) {
        const op = m[1];
        const idx = condition.indexOf(op);
        const left = condition.substring(0, idx).trim();
        const right = condition.substring(idx + op.length).trim();
        return fn(left, right);
    }
}

// contains
if (/contains/i.test(condition)) {
    const parts = condition.split(/contains/i).map(s => s.trim());
    return parts[0].includes(parts[1]);
}

// 简单真值
const lc = condition.toLowerCase();
return lc !== '' && lc !== 'false' && lc !== '0' && lc !== 'null' && lc !== 'undefined';
},

// ── 随机选择 ──
_processRandom(text) {
const self = this;
// 合并处理：{{random::选项1::选项2}} 和 {{random:选项1::选项2}} 和逗号分隔
// 性能优化：原来有3次正则替换（其中2次正则完全相同），现在合并为2次
// {{random::...}} 双冒号格式（果实/月读 + 蛾摩拉逗号分隔变体）
text = text.replace(/\{\{random::([^}]+)\}\}/g, function(_, opts) {
    // 同时支持 :: 分隔和 , 分隔
    if (opts.includes(',')) {
        return self._pickRandom(opts.split(','));
    }
    return self._pickRandom(opts.split('::'));
});
// {{random:...}} 单冒号格式（蛾摩拉变体）
text = text.replace(/\{\{random:([^}]+)\}\}/g, function(_, opts) {
    return self._pickRandom(opts.split('::'));
});
return text;
},

_pickRandom(choices) {
const items = choices.map(s => s.trim()).filter(s => s);
if (!items.length) return '';
// 支持权重 w:N
const weighted = items.map(c => {
    const wm = c.match(/^w:(\d+):(.+)$/);
    if (wm) return { weight: parseInt(wm[1]), text: wm[2] };
    return { weight: 1, text: c };
});
const total = weighted.reduce((s, w) => s + w.weight, 0);
let r = Math.random() * total;
for (const w of weighted) {
    r -= w.weight;
    if (r <= 0) return w.text;
}
return weighted[weighted.length - 1].text;
},

// ── 骰子 ──
_processRoll(text) {
// {{roll:d20}} {{roll:d6}} {{roll:d100}}
return text.replace(/\{\{roll:d(\d+)\}\}/gi, (_, sides) => {
    return String(Math.floor(Math.random() * parseInt(sides)) + 1);
});
},

// ── 模板变量替换 ──
_replaceTemplateVars(text) {
// {{getvar::name}}
text = text.replace(/\{\{getvar::([^}]+)\}\}/g, (_, n) => VariableStore.getLocal(n.trim()));
// {{getglobalvar::name}}
text = text.replace(/\{\{getglobalvar::([^}]+)\}\}/g, (_, n) => VariableStore.getGlobal(n.trim()));
// {{varname}} — 不含 :: 的简单变量
text = text.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g, (_, n) => TemplateVars.get(n));
return text;
},

// ── XML宏替换（月读预设大量使用 <user>/<char> 标签） ──
_replaceXmlMacros(text) {
const userName = TemplateVars.get('user');
const charName = TemplateVars.get('char');
// <user> → 用户名
text = text.replace(/<user>/gi, userName);
text = text.replace(/<\/user>/gi, '');
// <char> → 角色名
text = text.replace(/<char>/gi, charName);
text = text.replace(/<\/char>/gi, '');
return text;
},

// ── 逻辑运算 ──
_processLogicOps(text) {
text = text.replace(/\{\{and::([^}]+)::([^}]+)\}\}/g, (_, c1, c2) =>
    (this._evalCond(c1) && this._evalCond(c2)) ? 'true' : 'false');
text = text.replace(/\{\{or::([^}]+)::([^}]+)\}\}/g, (_, c1, c2) =>
    (this._evalCond(c1) || this._evalCond(c2)) ? 'true' : 'false');
text = text.replace(/\{\{not::([^}]+)\}\}/g, (_, c1) =>
    (!this._evalCond(c1)) ? 'true' : 'false');
return text;
},

// ── 批量解析prompts ──
parsePrompts(prompts, context = {}) {
if (!Array.isArray(prompts)) return [];
return prompts.map(p => {
    if (!p || !p.content) return p;
    return {
        ...p,
        parsedContent: this.parse(p.content, { context }),
        originalContent: p.content
    };
});
}
    };

    // ============================================================================
    // Prompt 注入系统 v2.0
    // ============================================================================
    var PromptInjector = {
    POSITION: {
        BEFORE_CHAR: 0, AFTER_CHAR: 1,
        BEFORE_EXAMPLE: 2, AFTER_EXAMPLE: 3,
        AN_TOP: 4, AN_BOTTOM: 5,
        AT_DEPTH: 6, OUTLET: 7
    },
    ROLE: { SYSTEM: 0, USER: 1, ASSISTANT: 2 },

    /**
    * 根据 prompt_order 构建有序prompt列表
    * @param {Array} prompts - 原始prompts
    * @param {Array} promptOrder - prompt_order数组（月读/蛾摩拉预设特有）
    * @returns {Array} 排序后的prompts
    */
    applyPromptOrder(prompts, promptOrder) {
        if (!promptOrder || !Array.isArray(promptOrder)) return prompts;
        const orderMap = {};
        promptOrder.forEach((item, idx) => {
            if (item && item.identifier) {
                orderMap[item.identifier] = {
                    enabled: item.enabled !== false,
                    orderIndex: idx
                    };
            }
        });
    return prompts.map(p => {
        const order = orderMap[p.identifier];
        if (order !== undefined) {
            return {
                ...p,
                enabled: order.enabled,
                injection_order: order.orderIndex
                };
        }
    return p;
    });
    },

    /**
    * 应用 entryGrouping（蛾摩拉2.4条目分组）
    * @param {Array} prompts - 原始prompts
    * @param {Array} groups - entryGrouping数组
    * @returns {Object} { prompts, groups }
    */
    applyEntryGrouping(prompts, groups) {
        if (!groups || !Array.isArray(groups)) return { prompts, groups: [] };
        // entryGrouping 仅用于UI分组显示，不影响prompt内容
        // 返回分组信息供UI层使用
        return { prompts, groups };
    },

    /**
    * 构建最终prompt
    */
    buildPrompt(prompts, options = {}) {
        const {
            character = null,
            scenario = '',
            personality = '',
            chatHistory = [],
            depth = 4
            } = options;

        const enabled = prompts.filter(p => p.enabled !== false);
        enabled.sort((a, b) => (a.injection_order || 100) - (b.injection_order || 100));

        // 按位置分组
        const groups = {
            system: [],       // position 0, 4
            afterChar: [],    // position 1, 5
            examples: [],     // position 2, 3
            depthMap: {},     // position 6
            outlet: [],       // position 7
            jailbreak: []
            };

        enabled.forEach(p => {
            const content = String(p.parsedContent || p.content || '');
            if (!content.trim()) return;
            const pos = p.injection_position || 0;
            const role = p.role || 0;
            const d = p.injection_depth || depth;
            const item = { role, content, name: p.name, identifier: p.identifier };

            // 标记为jailbreak的单独收集（兼容 isJailbreak 字段和 identifier 方式）
            const isJB = p.isJailbreak === true ||
            p.identifier === 'jailbreak' ||
            (p.name && (p.name.includes('❉') || p.name.toLowerCase().includes('jailbreak')));
            if (isJB) { groups.jailbreak.push(item); return; }

            switch (pos) {
                case 0: case 4: groups.system.push(item); break;
                case 1: case 5: groups.afterChar.push(item); break;
                case 2: case 3: groups.examples.push(item); break;
                case 6:
                if (!groups.depthMap[d]) groups.depthMap[d] = [];
                groups.depthMap[d].push(item);
                break;
                case 7: groups.outlet.push(item); break;
                default: groups.system.push(item);
            }
        });

    const messages = [];
    const rs = (role) => {
        switch (role) {
            case 1: return 'user';
            case 2: return 'assistant';
            default: return 'system';
        }
    };

    // 1. 系统提示（角色定义前）
    groups.system.forEach(p => messages.push({ role: rs(p.role), content: p.content }));

    // 2. 角色定义
    if (character) {
        let charPrompt = '';
        if (character.name) charPrompt += `你是${character.name}。`;
        if (character.description) charPrompt += character.description;
        if (charPrompt) messages.push({ role: 'system', content: charPrompt });
    }
    if (scenario) messages.push({ role: 'system', content: `场景：${scenario}` });
    if (personality) messages.push({ role: 'system', content: `性格：${personality}` });

    // 3. 角色定义后
    groups.afterChar.forEach(p => messages.push({ role: rs(p.role), content: p.content }));

    // 4. 示例消息
    groups.examples.forEach(p => messages.push({ role: rs(p.role), content: p.content }));

    // 5. 深度注入
    const sortedDepths = Object.keys(groups.depthMap).map(Number).sort((a, b) => b - a);
    for (const d of sortedDepths) {
        groups.depthMap[d].forEach(p => messages.push({ role: rs(p.role), content: p.content }));
    }

    // 6. 聊天历史
    (chatHistory || []).forEach(msg => messages.push({ role: msg.role, content: msg.content }));

    // 7. Jailbreak（最后）
    groups.jailbreak.forEach(p => messages.push({ role: rs(p.role), content: p.content }));

    return messages;
    }
    };

    // ============================================================================
    // 正则脚本引擎 v2.0
    // ============================================================================
    var RegexEngine = {
    /**
    * 执行正则脚本
    * @param {string} text - 输入文本
    * @param {Array} scripts - 正则脚本数组
    * @param {Object} options - 执行选项
    * @param {number} options.messageDepth - 当前消息深度（用于minDepth/maxDepth过滤）
    * @param {boolean} options.isPrompt - 是否为prompt阶段（用于promptOnly过滤）
    * @param {boolean} options.isMarkdown - 是否为markdown渲染阶段（用于markdownOnly过滤）
    */
    execute(text, scripts, options = {}) {
        if (!text || !Array.isArray(scripts)) return text;
        const { messageDepth = 0, isPrompt = true, isMarkdown = false } = options;

        for (const script of scripts) {
            if (!script) continue;
            // 兼容两种格式
            const disabled = script.disabled === true || script.enabled === false;
            if (disabled) continue;

            // ── placement 过滤（月读格式） ──
            // placement: [1] = user input, [2] = AI output
            const placement = script.placement || [];
            if (placement.length > 0) {
                // 1 = 用户输入侧, 2 = AI输出侧
                // 如果当前不在placement范围内则跳过
                // 默认都执行（如果没有placement限制）
            }

        // ── promptOnly / markdownOnly 过滤（月读格式） ──
        if (script.promptOnly === true && !isPrompt) continue;
        if (script.markdownOnly === true && !isMarkdown) continue;

        // ── minDepth / maxDepth 过滤（月读格式） ──
        if (script.minDepth !== null && script.minDepth !== undefined && messageDepth < script.minDepth) continue;
        if (script.maxDepth !== null && script.maxDepth !== undefined && messageDepth > script.maxDepth) continue;

        // ── run_on / runOnEdit 过滤（果实/月读格式） ──
        const runOn = script.run_on || script.runOnEdit;
        // runOnEdit 在两个阶段都运行，run_on 只在指定阶段运行
        // 这里简化为：都执行

        try {
            text = this._applyScript(text, script);
            } catch (e) {
            console.error('[RegexEngine] 正则执行失败:', script.scriptName || script.name, e);
            }
    }
    return text;
    },

    /**
    * 应用单个正则脚本（兼容果实+月读两种格式）
    */
    _applyScript(text, script) {
        // 月读格式: findRegex / replaceString
        // 果实格式: find / replace + flags
        let findStr = script.findRegex || script.find || script.pattern || '';
        let replaceStr = script.replaceString || script.replace || script.replacement || '';

        if (!findStr) return text;

        let regex;
        if (findStr.startsWith('/') && findStr.includes('/', 1)) {
            // /pattern/flags 格式（月读常用）
            const lastSlash = findStr.lastIndexOf('/');
            const pattern = findStr.slice(1, lastSlash);
            const flags = findStr.slice(lastSlash + 1) || '';
            regex = new RegExp(pattern, flags);
            } else {
            const flags = script.flags || 'g';
            regex = new RegExp(findStr, flags);
        }

    // trimStrings（月读格式：额外要trim的字符串）
    if (script.trimStrings && Array.isArray(script.trimStrings)) {
        for (const ts of script.trimStrings) {
            if (ts) text = text.replace(new RegExp(this._escapeRegex(ts), 'g'), '');
        }
    }

    // substituteRegex（月读格式：0=不替换, 1=替换为regex）
    if (script.substituteRegex === 1 && replaceStr) {
        try { replaceStr = new RegExp(replaceStr).source; } catch (e) { /* keep as-is */ }
    }

    return text.replace(regex, replaceStr);
    },

    _escapeRegex(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    };

    // ============================================================================
    // 主引擎类 v2.0
    // ============================================================================
    class STscriptEngine {
constructor() {
this.variables = VariableStore;
this.parser = STscriptParser;
this.injector = PromptInjector;
this.regex = RegexEngine;
this.templates = TemplateVars;
this._preset = null;
}

init(context = {}) {
this.templates.setContext(context);
}

/**
 * 处理预设（完整流程）
 */
processPreset(preset, context = {}) {
if (!preset) return null;
this._preset = preset;
this.init(context);

let prompts = preset.prompts || [];

// 如果有 prompt_order，应用排序
if (preset.prompt_order && preset.prompt_order.length > 0) {
    prompts = this.injector.applyPromptOrder(prompts, preset.prompt_order[0]?.order || preset.prompt_order);
}

// 如果有 entryGrouping，应用分组（蛾摩拉2.4）
let entryGroups = [];
if (preset.extensions?.entryGrouping) {
    const result = this.injector.applyEntryGrouping(prompts, preset.extensions.entryGrouping);
    prompts = result.prompts;
    entryGroups = result.groups;
}

// 解析所有prompts
const parsedPrompts = this.parser.parsePrompts(prompts, context);

// 构建最终prompt
const messages = this.injector.buildPrompt(parsedPrompts, {
    character: context.character,
    scenario: context.scenario,
    personality: context.personality,
    chatHistory: context.chatHistory || []
});

return {
    params: preset.params || {},
    messages,
    prompts: parsedPrompts,
    regexScripts: preset.regexScripts || [],
    variables: this.variables.export(),
    entryGroups // 返回分组信息
};
}

/**
 * 处理AI回复（后处理）
 */
processResponse(response, options = {}) {
if (!response || !this._preset) return response;
const scripts = this._preset.regexScripts || this._preset.extensions?.regex_scripts || [];
if (!scripts.length) return response;

return this.regex.execute(response, scripts, {
    messageDepth: options.messageDepth || 0,
    isPrompt: false,
    isMarkdown: true  // 回复通常用于markdown渲染
});
}

/**
 * 处理prompt阶段的文本（发送到API前）
 */
processPromptText(text, options = {}) {
if (!text || !this._preset) return text;
const scripts = this._preset.regexScripts || this._preset.extensions?.regex_scripts || [];
if (!scripts.length) return text;

return this.regex.execute(text, scripts, {
    messageDepth: options.messageDepth || 0,
    isPrompt: true,
    isMarkdown: false
});
}

getVar(name, scope = 'local') {
    if (!name) return '';
    // 【桥接】走 MacroEngine：自动 trim + 纯数字字符串转 Number，
    // 保证 {{getvar::xxx}} 在酒馆/STscript 语法和游戏宏语法里行为一致
    if (scope === 'local' && typeof MacroEngine !== 'undefined' && MacroEngine.getLocalVar) {
        try { return MacroEngine.getLocalVar(String(name)); } catch (e) { /* fallthrough */ }
    }
    if (scope === 'global' && typeof MacroEngine !== 'undefined' && MacroEngine.getGlobalVar) {
        try { return MacroEngine.getGlobalVar(String(name)); } catch (e) { /* fallthrough */ }
    }
    const key = (typeof name === 'string') ? name.trim() : name;
    switch (scope) {
        case 'global': return this.variables.getGlobal(key);
        case 'character': return this.variables.getCharacter(this.variables.getCurrentCharacter(), key);
        default: return this.variables.getLocal(key);
    }
}
setVar(name, value, scope = 'local') {
    if (!name) return value;
    // 【桥接】走 MacroEngine：保证预设 setvar 写入和宏 {{setvar::xxx}} 写入走同一条路径
    if (scope === 'local' && typeof MacroEngine !== 'undefined' && MacroEngine.setLocalVar) {
        try { MacroEngine.setLocalVar(String(name), value); return value; } catch (e) { /* fallthrough */ }
    }
    if (scope === 'global' && typeof MacroEngine !== 'undefined' && MacroEngine.setGlobalVar) {
        try { MacroEngine.setGlobalVar(String(name), value); return value; } catch (e) { /* fallthrough */ }
    }
    const key = (typeof name === 'string') ? name.trim() : name;
    switch (scope) {
        case 'global': this.variables.setGlobal(key, value); break;
        case 'character': this.variables.setCharacter(this.variables.getCurrentCharacter(), key, value); break;
        default: this.variables.setLocal(key, value);
    }
    return value;
}
    }

    // ============================================================================
    // 导出
    // ============================================================================
    // 【关键修复】VariableStore 必须暴露到 window，否则 modules.js 里的 MacroEngine
    // 因为 typeof VariableStore === 'undefined' 而静默失败，导致 setvar/getvar
    // 宏、STscript 引擎与游戏宏系统之间数据不同步。
    // 兼容保留 STscriptVariableStore 别名，旧代码不受影响。
    global.VariableStore = VariableStore;
    global.STscriptEngine = STscriptEngine;
    global.STscriptVariableStore = VariableStore;
    global.STscriptTemplateVars = TemplateVars;

    if (typeof document !== 'undefined') {
GlobalCleanup.registerListener(document, 'DOMContentLoaded', () => {
if (!global.stscriptEngine) {
    global.stscriptEngine = new STscriptEngine();
    console.log('[STscript v2.1] 引擎已初始化 — 兼容果实/月读/蛾摩拉预设');
}
});
    }

})(window);


/**
 * ============================================================================
 * 自由剧本 - STscript 集成适配层 v2.1
 * ============================================================================
 * 将 STscript 引擎与现有游戏逻辑无缝集成
 * 
 * v2.1 更新（蛾摩拉2.4适配）：
 * - 新增：entryGrouping 条目分组自动提取
 * - 新增：预设自动识别支持蛾摩拉类型
 * - 增强：_normalizePreset 提取 entryGrouping
 * 
 * v2.0 更新：
 * - 新增：prompt_order 完整支持
 * - 新增：extensions.regex_scripts 自动提取
 * - 新增：tavern_helper 脚本解析（提取commands/quickSwitchProfiles）
 * - 新增：美化正则自动应用（markdown渲染阶段）
 * - 新增：消息深度追踪（minDepth/maxDepth过滤）
 * - 增强：预设导入自动识别格式（果实/月读/通用）
 * ============================================================================
 */

(function(global) {
    'use strict';

    var GameAdapter = {
    engine: null,
    currentPreset: null,
    currentCharacter: null,
    chatHistory: [],
    _messageDepth: 0,

    // ── 初始化 ──
    init() {
        if (!global.stscriptEngine) {
            global.stscriptEngine = new STscriptEngine();
        }
    this.engine = global.stscriptEngine;
    console.log('[GameAdapter v2.0] 集成适配器已初始化');
    },

    // ── 预设加载（核心入口） ──
    onPresetLoaded(preset) {
        this.currentPreset = this._normalizePreset(preset);
        this.engine.variables.clearLocal();
        this._messageDepth = 0;

        // 自动提取 extensions.regex_scripts
        if (this.currentPreset.extensions?.regex_scripts) {
            this.currentPreset.regexScripts = this.currentPreset.extensions.regex_scripts;
        }

    console.log('[GameAdapter] 预设已加载:', this.currentPreset.name,
    '| prompts:', (this.currentPreset.prompts || []).length,
    '| regex:', (this.currentPreset.regexScripts || []).length,
    '| prompt_order:', !!(this.currentPreset.prompt_order));

    if (global.UI?.toast) {
        UI.toast(`已加载预设: ${this.currentPreset.name} (STscript v2.0 已激活)`);
    }
    },

    /**
    * 标准化预设格式（兼容果实/月读/通用）
    * 月读: { prompts, prompt_order, extensions: { regex_scripts, tavern_helper } }
    * 果实: { prompts, extensions: { regex_scripts, tavern_helper: { scripts } } }
    * 通用: { prompts, regexScripts }
    */
    _normalizePreset(preset) {
        if (!preset) return preset;
        const p = { ...preset };

        // 确保 prompts 是数组
        if (!Array.isArray(p.prompts)) p.prompts = [];

        // 提取 regex_scripts（兼容两种路径）
        if (!p.regexScripts) {
            p.regexScripts = p.extensions?.regex_scripts || [];
        }
    if (!p.regexScripts || !Array.isArray(p.regexScripts)) p.regexScripts = [];

    // 提取 tavern_helper 脚本
    if (p.extensions?.tavern_helper?.scripts) {
        p.tavernHelperScripts = p.extensions.tavern_helper.scripts;
    }

    // 提取 SPreset 配置
    if (p.extensions?.SPreset) {
        p.spresetConfig = p.extensions.SPreset;
    }

    // 提取 entryGrouping（蛾摩拉2.4）
    if (p.extensions?.entryGrouping) {
        p.entryGrouping = p.extensions.entryGrouping;
    }

    return p;
    },

    // ── 角色管理 ──
    setCharacter(character) {
        this.currentCharacter = character;
        this.engine.variables.setCurrentCharacter(character.id || 'default');
        this.updateContext({
            char: character.name || '助手',
            character: character
            });
    },

    // ── 上下文更新 ──
    updateContext(context) {
        this.engine.templates.setContext({
            user: context.user || this.engine.templates.context.user,
            char: context.char || this.engine.templates.context.char,
            lastUserMessage: context.lastUserMessage || this.engine.templates.context.lastUserMessage,
            lastCharMessage: context.lastCharMessage || this.engine.templates.context.lastCharMessage,
            chatHistory: context.chatHistory || this.chatHistory,
            character: context.character || this.currentCharacter,
            scenario: context.scenario || '',
            personality: context.personality || ''
            });
    },

    // 【P2清理】删除 buildEnhancedPrompt（全项目零调用）
    // ── 处理AI回复（收到回复后调用） ──
    processResponse(response) {
        if (!response || !this.currentPreset) return response;

        // 1. 正则后处理
        response = this.engine.processResponse(response, {
            messageDepth: this._messageDepth
            });

        // 2. 更新聊天历史
        this.chatHistory.push({ role: 'assistant', content: response });
        if (this.chatHistory.length > 50) this.chatHistory = this.chatHistory.slice(-50);
        this._messageDepth++;

        // 3. 更新上下文
        this.updateContext({ lastCharMessage: response, chatHistory: this.chatHistory });

        return response;
    },

    // ── 处理用户输入（发送前预处理） ──
    processUserInput(input) {
        if (!input || !this.currentPreset) return input;

        const scripts = this.currentPreset.regexScripts || [];
        if (!scripts.length) return input;

        // 应用 promptOnly=true 且 placement 包含 1 的正则
        return this.engine.regex.execute(input, scripts, {
            messageDepth: 0,
            isPrompt: true,
            isMarkdown: false
            });
    },

    // 【P2清理】删除 processMarkdown（全项目零调用）
    // 【P2清理】删除 addToHistory（全项目零调用）
    // 【P2清理】删除 clearHistory（全项目零调用）
    // 【P2清理】删除 _buildDefaultPrompt（全项目零调用）
    // 【P2清理】删除 getVariable（全项目零调用）
    // 【P2清理】删除 setVariable（全项目零调用）
    parse(text) { return this.engine.parser.parse(text, { context: this.engine.templates.context }); },

    // 【P2清理】删除 getQuickSwitchProfiles（全项目零调用）
    // 【P2清理】删除 getCommands（全项目零调用）
    // 【P2清理】删除 applyQuickSwitchProfile（全项目零调用）
    };

    // ============================================================================
    // 导出
    // ============================================================================
    // 【清理】移除未使用的 EnhancedAPIBuilder（buildRequest/estimateTokens 从未被调用，
    //        且 estimateTokens 与 utils.js 的 estimateTokensForMessagesUtil 重复）
    global.GameAdapter = GameAdapter;
    global.gameAdapter = GameAdapter;

    if (typeof document !== 'undefined') {
const init = () => GameAdapter.init();
if (document.readyState === 'loading') {
GlobalCleanup.registerListener(document, 'DOMContentLoaded', init);
} else {
init();
}
    }

})(window);


/**
 * ============================================================================
 * 预设配置管理器 v2.1
 * ============================================================================
 * 支持【果实·叶子版3.0】、【月读·Gemini v1.2】和【蛾摩拉☼2.4】三个预设的配置管理
 * ============================================================================
 */

(function(global) {
    'use strict';

    // ============================================================================
    // 通用预设管理器
    // ============================================================================
    // 【P1修复P1-L】删除 MoonReadPresetConfig / FruitPresetConfig / GomorrahPresetConfig
    // 三个对象及其字段（requiredRegex / recommendedRegex / beautyRegex / requiredPrompts /
    // perspectives / userPronouns / pacing / recommendedParams）—— 这些"详细字段"从未被
    // 任何代码读取，对应 UI 入口（视角选择 / 节奏选择 / 推荐参数应用）从未实现。
    // 同时删除 PresetConfigManager.configs / getConfig / getRecommendedParams—— 链式死代码：
    // getRecommendedParams 零外部调用 → getConfig 仅被它调用 → configs 仅被 getConfig 读取。
    // 保留 detectPresetType（patch.js:161）与 validatePreset（patch.js:167），二者是真正被
    // 使用的预设识别/校验逻辑，不依赖任何 config 对象字段。
    var PresetConfigManager = {

/**
 * 自动识别预设类型
 */
detectPresetType(preset) {
if (!preset) return 'unknown';
const name = (preset.name || '').toLowerCase();
const prompts = preset.prompts || [];

// 检查特征标识
const hasMoonRead = prompts.some(p =>
    p.identifier === 'main' && (p.name || '').includes('静谧之夜')
);
const hasFruit = prompts.some(p =>
    (p.name || '').includes('乐园载入') || (p.name || '').includes('超现实梦境')
);

if (hasMoonRead || name.includes('月读')) return 'moonread';
if (hasFruit || name.includes('果实') || name.includes('mom')) return 'fruit';
// 蛾摩拉检测
const hasGomorrah = prompts.some(p =>
    p.identifier === 'main' && (p.name || '').includes('身份定义')
);
if (hasGomorrah || name.includes('蛾摩拉') || name.includes('gomorrah')) return 'gomorrah';
return 'generic';
},

/**
 * 验证预设兼容性
 */
validatePreset(preset) {
const result = {
    compatible: true,
    warnings: [],
    info: []
};

if (!preset) {
    result.compatible = false;
    result.warnings.push('预设为空');
    return result;
}

// 检查prompts
if (!preset.prompts || !Array.isArray(preset.prompts)) {
    result.warnings.push('预设缺少prompts数组');
} else {
    result.info.push(`共 ${preset.prompts.length} 个prompt条目`);
}

// 检查正则脚本
const regexScripts = preset.regexScripts || preset.extensions?.regex_scripts || [];
if (regexScripts.length > 0) {
    result.info.push(`共 ${regexScripts.length} 个正则脚本`);

    // 检查月读格式
    const hasFindRegex = regexScripts.some(s => s.findRegex);
    const hasFind = regexScripts.some(s => s.find);
    if (hasFindRegex) result.info.push('正则格式: 月读 (findRegex)');
    if (hasFind) result.info.push('正则格式: 果实 (find)');

    // 检查美化正则
    const beautyScripts = regexScripts.filter(s => s.markdownOnly === true);
    if (beautyScripts.length > 0) {
        result.info.push(`${beautyScripts.length} 个美化正则（需要markdown渲染支持）`);
    }
}

// 检查prompt_order
if (preset.prompt_order) {
    result.info.push('包含prompt_order排序');
}

// 检查tavern_helper
if (preset.extensions?.tavern_helper?.scripts) {
    result.info.push('包含酒馆助手脚本');
    result.warnings.push('酒馆助手脚本中的triggerSlash/toastr等API不可用，但commands配置已提取');
}

// 检查STscript语法
const allContent = (preset.prompts || []).map(p => p.content || '').join('\n');
const stscriptFeatures = [];
if (/\{\{setvar::/.test(allContent)) stscriptFeatures.push('setvar');
if (/\{\{getvar::/.test(allContent)) stscriptFeatures.push('getvar');
if (/\{\{if:/.test(allContent)) stscriptFeatures.push('条件判断');
if (/\{\{random::/.test(allContent)) stscriptFeatures.push('random');
if (/<user>/i.test(allContent)) stscriptFeatures.push('<user>标签');
if (/<char>/i.test(allContent)) stscriptFeatures.push('<char>标签');

if (stscriptFeatures.length > 0) {
    result.info.push(`STscript特性: ${stscriptFeatures.join(', ')}`);
}

return result;
}
    };

    // ============================================================================
    // 导出
    // ============================================================================
    global.PresetConfigManager = PresetConfigManager;

})(window);
