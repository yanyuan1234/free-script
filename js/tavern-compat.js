var TavernHelperCompat = {
    _context: null,
    _slashCommands: {},
    _pipeValue: '',
    _scripts: [],
    _quickReplies: [],
    _eventListeners: {},
    _presetConfig: null,
    // 【修复B P2-1】控制流命令收集模式
    _collectingMode: null,  // null | 'while' | 'foreach'
    
    // 初始化
    init: function() {
        this._initToastr();
        console.log('[TavernHelperCompat] 酒馆助手兼容层已初始化');
    },
    
    // 1. getContext() 兼容层
    // 返回与SillyTavern一致的数据格式
    getContext: function() {
        if (this._context) return this._context;
        
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
    if (gameState && gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) {
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
        characters: (gameState && gameState.worldSnapshot && gameState.worldSnapshot.characters) ? gameState.worldSnapshot.characters : [],
        // 当前角色ID
        characterId: 0,
        // 聊天ID
        chatId: gameState && gameState.saveKey ? gameState.saveKey : 'default',
        // 群组ID（如果支持群组）
        groupId: null,
        // 角色名（AI）
        name1: character.name || '角色',
        // 玩家名
        name2: (gameState && gameState.playerName) || '玩家',
        // 角色卡完整数据
        characterCard: character,
        // 聊天元数据
        chatMetadata: gameState && gameState.chatMetadata ? gameState.chatMetadata : {},
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
    return {
        apiType: gameState && gameState.apiType ? gameState.apiType : 'openai',
        model: gameState && gameState.model ? gameState.model : '',
        temperature: gameState && gameState.temperature ? gameState.temperature : 0.7,
        maxTokens: gameState && gameState.maxTokens ? gameState.maxTokens : 2000,
        contextSize: gameState && gameState.contextSize ? gameState.contextSize : 8000,
        systemPrompt: gameState && gameState.systemPrompt ? gameState.systemPrompt : '',
        jailbreakPrompt: gameState && gameState._jailbreakPrompt ? gameState._jailbreakPrompt : ''
    };
},

// 2. 通知系统
_initToastr: function() {
    if (window.toastr) return;
    var container = document.createElement('div');
    container.id = 'tavern-toastr-container';
    container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(container);
    var style = document.createElement('style');
    style.id = 'tavern-toastr-style';
    style.textContent = '@keyframes toastrSlideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}';
    document.head.appendChild(style);
    window.toastr = {
        info: function(msg) { TavernHelperCompat._showToast(msg, '#2196F3'); },
        success: function(msg) { TavernHelperCompat._showToast(msg, '#4CAF50'); },
        warning: function(msg) { TavernHelperCompat._showToast(msg, '#FF9800'); },
        error: function(msg) { TavernHelperCompat._showToast(msg, '#F44336'); }
    };
},

_showToast: function(msg, color) {
    var container = document.getElementById('tavern-toastr-container');
    if (!container) return;
    var toast = document.createElement('div');
    toast.style.cssText = 'background:' + color + ';color:white;padding:12px 20px;border-radius:8px;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);pointer-events:auto;animation:toastrSlideIn 0.3s ease;max-width:400px;word-break:break-word;';
    toast.textContent = msg;
    container.appendChild(toast);
    TimerManager.setTimeout('toastrHide_' + Date.now(), function() { toast.style.opacity='0'; toast.style.transition='opacity 0.3s'; TimerManager.setTimeout('toastrRemove_' + Date.now(), function(){toast.remove();},300); }, 3000);
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
            var prompt = argsStr.replace(/okButton="[^"]*"/g,'').replace(/cancelButton="[^"]*"/g,'').trim();
            result = prompt(prompt||'请输入:', function(v){return v||'';}); break;
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
            var ms=parseInt(argsStr)||1000;
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
            if(gameState && gameState.conversationHistory && argsStr) {
                gameState.conversationHistory.push({role: 'system', content: argsStr});
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
            if(gameState && gameState.conversationHistory) {
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
emit: function(event, data) { var l=this._eventListeners[event]; if(l)l.forEach(function(cb){try{cb(data);}catch(e){console.error('[TavernHelper] listener error:',e);}}); },

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
                        if (typeof setGlobalVar === 'function') setGlobalVar(varName, varValue);
                        else if (typeof MacroEngine !== 'undefined' && MacroEngine.setGlobalVar) MacroEngine.setGlobalVar(varName, varValue);
                        else { if(!gameState._globalVars) gameState._globalVars = {}; gameState._globalVars[varName] = varValue; }
                    });
                }

                // 【增强】快捷回复与游戏融合
                // 如果按钮有prompt，作为用户输入发送
                if (btn.prompt && btn.prompt.trim()) {
                    var promptText = MacroEngine.process(btn.prompt, {
                        user: gameState.playerName || '玩家',
                        char: (gameState.worldSnapshot && gameState.worldSnapshot.characters && gameState.worldSnapshot.characters.length > 0) ? gameState.worldSnapshot.characters[0].name : '角色',
                        input: (document.getElementById('userInput') || {}).value || ''
                    });
                    if (promptText && promptText.trim()) {
                        // 记录到日志
                        if (!gameState._quickReplyLog) gameState._quickReplyLog = [];
                        gameState._quickReplyLog.push({
                            name: btn.name || '快捷回复',
                            prompt: promptText,
                            time: new Date().toLocaleTimeString()
                        });
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
    var dangerousPatterns = [
        /\beval\s*\(/,
        /\bFunction\s*\(/,
        /\bnew\s+Function\s*\(/,
        /\bdocument\.write\s*\(/,
        /\bdocument\.writeln\s*\(/
    ];
    for (var i = 0; i < dangerousPatterns.length; i++) {
        if (dangerousPatterns[i].test(code)) {
            console.warn('[TavernHelper] ' + (sourceName || '脚本') + ' 错误: 检测到危险代码模式');
            return '';
        }
    }
    try {
        var sandbox = this._createSandbox();
        code = code.replace(/^import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*$/gm, '// [import 已被兼容层替换]');
        code = code.replace(/window\.SillyTavern/g, 'window.TavernHelperCompat');
        var preamble = 'var getContext=arguments[0],triggerSlash=arguments[1],toastr=arguments[2],eventSource=arguments[3];\n';
        var fn = new Function('getContext','triggerSlash','toastr','eventSource','console','setTimeout','setInterval','clearTimeout','clearInterval','Promise','fetch', preamble+code);
        fn(sandbox.getContext, sandbox.triggerSlash, sandbox.toastr, sandbox.eventSource, console, setTimeout, setInterval, clearTimeout, clearInterval, Promise, fetch);
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
    TimerManager.setTimeout('appReady', function() {
        TavernHelperCompat.emit('APP_READY', {});
        console.log('[TavernHelper] APP_READY 事件已触发');
    }, 500);
    console.log('[TavernHelper] ✅ 酒馆助手兼容层加载完成');
},

_loadPresetConfigs: function(presets) {
    if(!presets||!presets.default) return;
    this._presetConfig = presets.default;
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
},

getPresetConfig: function() { return this._presetConfig||{}; }
};

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

    version: 3,
    currentTurn: 0,
    lastInjectionTurn: -1,
    gameClock: { day: 1, period: '早晨', lastUpdateTurn: 0 },

    permanentFacts: { pcIdentity: [], worldRules: [], settings: [], npcProfiles: [], promises: [] },
    tables: { characters: {}, items: {}, locations: {}, relationships: {} },
    plot: { worldSetting: '', chapters: [], currentChapter: '', pendingMysteries: [] },
    events: [],
    timeline: [],
    quests: [],
    workingMemory: { recentMessages: [], currentTopic: null, turns: [], messages: [], nearSummary: '', midSummary: '', farSummary: '' },
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
    currentSummaryIndex: -1,
    _saving: false,
    _pendingSave: false,

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
        if (!this.workingMemory.nearSummary) this.workingMemory.nearSummary = '';
        if (!this.workingMemory.midSummary) this.workingMemory.midSummary = '';
        if (!this.workingMemory.farSummary) this.workingMemory.farSummary = '';
        this.startAutoSave();
        return this;
    },

    _migrateFromOldFormat: function() {
        var self = this;
        var oldData = null;
        try { oldData = JSON.parse(localStorage.getItem('freeScript_enhancedMemory') || 'null'); } catch(e) { oldData = null; }
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
            var typeMap = { pc_identity: 'pcIdentity', setting: 'settings', world_rule: 'worldRules', npc_profile: 'npcProfiles', promise: 'promises' };
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
            self.quests = ltm.activeQuests.map(function(q) { return { content: q.content || '', type: q.type || 'promise', status: q.status || 'pending', createdTurn: q.createdTurn || 0, resolvedTurn: q.resolvedAt ? turn : 0, stale: q.stale || false }; });
        }
        if (ltm.worldSetting) self.plot.worldSetting = ltm.worldSetting;
        if (old.stats) self.stats = { totalMessages: old.stats.totalMessages || 0, totalSummaries: old.stats.totalSummaries || 0, lastUpdateTime: old.stats.lastUpdateTime || null, tokenSaved: old.stats.tokenSaved || 0 };
        if (old.compressionConfig) { self.compressionConfig.triggerThreshold = old.compressionConfig.triggerThreshold || 0.75; self.compressionConfig.incrementalUpdate = old.compressionConfig.incrementalUpdate !== false; }
        self.saveToStorage();
        console.log('[GameMemory] 旧版数据迁移完成');
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
            // 设定压缩检查
            self.compressSetupIfNeeded();
        } catch (e) {
            self.stats.lastError = { msg: (e && e.message) || String(e), stack: (e && e.stack) || '', time: Date.now() };
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
                if (action === 'add' && innerContent) { self.addQuest({ content: innerContent, type: 'quest', status: 'pending' }); edit.content = innerContent; }
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
                        self.tables.characters[charName] = { name: charName, title: '', relation: '', mood: '', location: '', outfit: '', favorability: 50, status: '', history: [{ turn: self.currentTurn, changes: attrs.field + ': ' + attrs.value }], lastChangedTurn: self.currentTurn, locked: false };
                        self.tables.characters[charName][attrs.field] = attrs.value;
                    }
                    self._changeLog.push({ turn: self.currentTurn, type: 'character', key: charName, field: attrs.field, oldValue: oldValue, newValue: attrs.value });
                }
            } else if (type === 'item' && attrs.name) {
                var itemName = attrs.name;
                var action = attrs.action || 'add';
                var qty = parseInt(attrs.qty) || 1;
                var item = self.tables.items[itemName];
                if (action === 'add') {
                    if (item) { var oldQty = item.qty; item.qty += qty; item.lastChangedTurn = self.currentTurn; item.history.push({ turn: self.currentTurn, from: oldQty, to: item.qty }); if (item.history.length > 10) item.history = item.history.slice(-10); self._changeLog.push({ turn: self.currentTurn, type: 'item', key: itemName, field: 'qty', oldValue: oldQty, newValue: item.qty }); }
                    else { self.tables.items[itemName] = { name: itemName, qty: qty, unit: attrs.unit || '个', rarity: attrs.rarity || '普通', desc: attrs.desc || '', obtainedTurn: self.currentTurn, lastChangedTurn: self.currentTurn, history: [{ turn: self.currentTurn, from: 0, to: qty }] }; self._changeLog.push({ turn: self.currentTurn, type: 'item', key: itemName, field: 'qty', oldValue: 0, newValue: qty }); }
                } else if (action === 'remove' && item) { var oldQty2 = item.qty; item.qty = Math.max(0, item.qty - qty); item.lastChangedTurn = self.currentTurn; item.history.push({ turn: self.currentTurn, from: oldQty2, to: item.qty }); if (item.history.length > 10) item.history = item.history.slice(-10); self._changeLog.push({ turn: self.currentTurn, type: 'item', key: itemName, field: 'qty', oldValue: oldQty2, newValue: item.qty }); }
                else if (action === 'change' && item) { var oldQty3 = item.qty; item.qty = qty; item.lastChangedTurn = self.currentTurn; item.history.push({ turn: self.currentTurn, from: oldQty3, to: qty }); if (item.history.length > 10) item.history = item.history.slice(-10); self._changeLog.push({ turn: self.currentTurn, type: 'item', key: itemName, field: 'qty', oldValue: oldQty3, newValue: qty }); }
            } else if (type === 'location' && attrs.name) {
                var locName = attrs.name;
                var loc = self.tables.locations[locName];
                if (attrs.field && attrs.value !== undefined) {
                    if (loc) { if (loc.locked) { edit.skipped = true; edit.reason = 'locked'; } else { var oldVal = loc[attrs.field]; loc[attrs.field] = attrs.value; loc.lastChangedTurn = self.currentTurn; self._changeLog.push({ turn: self.currentTurn, type: 'location', key: locName, field: attrs.field, oldValue: oldVal, newValue: attrs.value }); } }
                    else { self.tables.locations[locName] = { name: locName, desc: '', features: '', charactersPresent: '', lastChangedTurn: self.currentTurn, locked: false }; self.tables.locations[locName][attrs.field] = attrs.value; self._changeLog.push({ turn: self.currentTurn, type: 'location', key: locName, field: attrs.field, oldValue: '', newValue: attrs.value }); }
                }
            }
            edits.push(edit);
            return '';
        });
        cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n').trim();
        return { cleanedText: cleanedText, edits: edits };
    },

    _parseMemAttrs: function(attrsStr) {
        var attrs = {};
        if (!attrsStr) return attrs;
        var re = /(\w+)\s*=\s*(?:"([^"]*?)"|'([^']*?)')/g;
        var m;
        while ((m = re.exec(attrsStr)) !== null) { attrs[m[1]] = m[2] !== undefined ? m[2] : m[3]; }
        return attrs;
    },

    // 关键词激活：更新记忆条目的访问计数
    _updateAccessCounts: function(message) {
        var self = this;
        if (!message || !message.content) return;
        var content = message.content;
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

        // 近层：最近3轮，保留详细
        var nearTurns = turns.slice(-3);
        self._summaryLayers.near = nearTurns.map(function(t) {
            var parts = [];
            if (t.user) parts.push('玩家: ' + truncateByChars(t.user, 150, '...'));
            if (t.assistant) parts.push('AI: ' + truncateByChars(t.assistant, 150, '...'));
            return parts.join(' | ');
        });

        // 中层：4-10轮前，压缩为摘要
        if (totalTurns > 3) {
            var midTurns = turns.slice(Math.max(0, totalTurns - 10), totalTurns - 3);
            self._summaryLayers.mid = midTurns.map(function(t) {
                var parts = [];
                if (t.user) parts.push('玩家: ' + truncateByChars(t.user, 60, '...'));
                if (t.assistant) parts.push('AI: ' + truncateByChars(t.assistant, 60, '...'));
                return parts.join(' | ');
            });
        }

        // 远层：10轮以前，只保留关键句
        if (totalTurns > 10) {
            var farTurns = turns.slice(0, totalTurns - 10);
            self._summaryLayers.far = farTurns.map(function(t) {
                var text = (t.user || '') + (t.assistant || '');
                // 提取关键句（含关键词的句子）
                var sentences = text.split(/[。！？\n]/).filter(function(s) { return s.trim().length > 5; });
                var keySentences = sentences.filter(function(s) {
                    return /(约定|承诺|获得|失去|死亡|突破|发现|决定|重要|关键|转折)/.test(s);
                });
                if (keySentences.length === 0 && sentences.length > 0) keySentences = [sentences[sentences.length - 1]];
                return keySentences.map(function(s) { return truncateByChars(s.trim(), 40, '...'); }).join('；');
            }).filter(function(s) { return s.length > 0; });
        }

        // 生成合并摘要文本
        self.workingMemory.nearSummary = self._summaryLayers.near.join('\n');
        self.workingMemory.midSummary = self._summaryLayers.mid.join('\n');
        self.workingMemory.farSummary = self._summaryLayers.far.join('\n');
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
            try { if (typeof gameState !== 'undefined' && gameState.conversationHistory) recentText2 = gameState.conversationHistory.slice(-3).map(function(m) { return m.content || ''; }).join(' '); } catch(e) {}
            for (var ki = 0; ki < setupKw.length; ki++) {
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
                if (typeof gameState !== 'undefined' && gameState.conversationHistory) {
                    recentText = gameState.conversationHistory.slice(-3).map(function(m) { return m.content || ''; }).join(' ');
                }
            } catch(e) {}
            for (var i = 0; i < keywords.length; i++) {
                if (recentText.indexOf(keywords[i]) >= 0) return true;
            }
        }
        return false;
    },

    // 开局设定智能分层（Lorebook风格：核心常驻+按需加载）
    processSetupPrompt: function(fullSetup) {
        if (!fullSetup || fullSetup.length < 100) return;
        var self = this;
        self._setupLayers.fullSetup = fullSetup;
        self._setupLayers.compressed = false;
        self._setupLayers.extractTurn = self.currentTurn;

        // 按次计费优化：长设定需要更大的兜底截断，避免AI解析前丢失关键信息
        var setupLen = fullSetup.length;
        var coreRulesBudget = Math.max(800, Math.min(setupLen * 0.15, 4000));
        var worldSummaryBudget = Math.max(600, Math.min(setupLen * 0.1, 3000));
        // 默认先用简单截断作为核心规则（AI解析完成前的前置方案）
        self._setupLayers.coreRules = truncateByChars(fullSetup, coreRulesBudget, '...');
        self._setupLayers.worldSummary = truncateByChars(fullSetup, worldSummaryBudget, '...');
        self.saveToStorage();

        // AI驱动解析：让AI自己分类、提取关键词、生成摘要
        self._aiParseSetup(fullSetup);
    },

    // AI驱动的设定解析（核心方法）
    _aiParseSetup: function(fullSetup) {
        var self = this;

        // 构建解析提示词
        var parsePrompt = '请解析以下游戏设定，提取关键信息。\n\n'
            + '你理解如何从设定中提取：核心规则（硬性限制/底线/红线）、世界观概括、重要角色（名字/身份/5-10个关键词/200字以内详细描述含性格外貌关系特质）、主角身份、约定承诺、全局关键词。\n\n'
            + '【设定内容】\n' + fullSetup + '\n\n'
            + '输出纯JSON，不要代码块：\n'
            + '{"coreRules":["规则1","规则2"],'
            + '"worldSummary":"世界观概括",'
            + '"characters":[{"name":"角色名","identity":"身份","keywords":["关键词1","关键词2","关键词3","关键词4","关键词5"],"summary":"200字以内详细描述，包含性格、外貌、与主角关系、关键特质"}],'
            + '"playerIdentity":"主角身份",'
            + '"promises":["约定1","约定2"],'
            + '"setupKeywords":["关键词1","关键词2"]}';

        var messages = [
            { role: 'system', content: '你是游戏设定解析专家，只输出纯JSON，不要任何其他文字。' },
            { role: 'user', content: parsePrompt }
        ];

        // 按次计费优化：长设定需要更多输出token来完整解析
        var parseMaxTokens = Math.max(2000, Math.min(Math.floor(fullSetup.length / 3), 8000));

        // 调用AI解析
        if (typeof callAI === 'function') {
            callAI(messages, { max_tokens: parseMaxTokens }).then(function(response) {
                try {
                    var content = response;
                    if (response && response.choices && response.choices[0] && response.choices[0].message) {
                        content = response.choices[0].message.content;
                    }
                    // 提取JSON
                    var jsonStr = content;
                    var jsonMatch = content.match(/\{[\s\S]*\}/);
                    if (jsonMatch) jsonStr = jsonMatch[0];

                    var parsed = JSON.parse(jsonStr);
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

        // 核心规则层
        if (parsed.coreRules && parsed.coreRules.length > 0) {
            self._setupLayers.coreRules = parsed.coreRules.join('\n');
            // 按次计费：长设定允许更多核心规则，上限提高到设定长度的20%
            var coreMax = Math.max(2000, Math.min(self._setupLayers.fullSetup.length * 0.2, 8000));
            if (self._setupLayers.coreRules.length > coreMax) {
                self._setupLayers.coreRules = truncateByChars(self._setupLayers.coreRules, coreMax, '...');
            }
        }

        // 世界摘要层
        if (parsed.worldSummary) {
            self._setupLayers.worldSummary = parsed.worldSummary;
            // 按次计费：长设定允许更详细的摘要，上限提高到设定长度的15%
            var summaryMax = Math.max(1500, Math.min(self._setupLayers.fullSetup.length * 0.15, 6000));
            if (self._setupLayers.worldSummary.length > summaryMax) {
                self._setupLayers.worldSummary = truncateByChars(self._setupLayers.worldSummary, summaryMax, '...');
            }
        }

        // 全局关键词
        if (parsed.setupKeywords && parsed.setupKeywords.length > 0) {
            self._setupLayers.setupKeywords = parsed.setupKeywords;
        }

        // 主角身份 → 永久事实
        if (parsed.playerIdentity) {
            self.permanentFacts.pcIdentity = self.permanentFacts.pcIdentity || [];
            self.permanentFacts.pcIdentity.push({ content: parsed.playerIdentity, locked: true });
        }

        // 核心规则 → 永久事实
        if (parsed.coreRules && parsed.coreRules.length > 0) {
            self.permanentFacts.worldRules = self.permanentFacts.worldRules || [];
            parsed.coreRules.slice(0, 10).forEach(function(rule) {
                if (!self.permanentFacts.worldRules.some(function(a) { return a.content === rule; })) {
                    self.permanentFacts.worldRules.push({ content: rule, locked: true });
                }
            });
        }

        // 约定 → 永久事实
        if (parsed.promises && parsed.promises.length > 0) {
            self.permanentFacts.promises = self.permanentFacts.promises || [];
            parsed.promises.forEach(function(p) {
                if (!self.permanentFacts.promises.some(function(a) { return a.content === p; })) {
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
                if (!self.permanentFacts.npcProfiles.some(function(a) { return a.content.split('【')[0] === char.name; })) {
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
                        favorability: 50,
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

        self.saveToStorage();
        console.log('[设定解析] AI解析完成，核心规则' + (parsed.coreRules ? parsed.coreRules.length : 0) + '条，角色' + (parsed.characters ? parsed.characters.length : 0) + '个');

        // 通知UI刷新
        if (typeof GameLinker !== 'undefined') {
            GameLinker.refreshByDataChange('_memory');
            GameLinker.refreshByDataChange('allCharacters');
        }
    },

    // 获取当前应该注入的设定文本（分层策略）
    getSetupInjection: function() {
        var self = this;
        var layers = self._setupLayers;

        // 如果没有处理过设定，返回null（让旧逻辑处理）
        if (!layers.fullSetup) return null;

        var currentTurn = self.currentTurn || 0;

        // 按次计费优化：前8轮注入完整设定（AI需要完整上下文来建立世界）
        if (currentTurn <= 8 || !layers.compressed) {
            // 但即使是前8轮，也把核心规则单独提到最前面
            var result = '';
            if (layers.coreRules) {
                result += '【核心规则】\n' + layers.coreRules + '\n\n';
            }
            result += '【完整设定】\n' + layers.fullSetup;
            return result;
        }

        // 8轮后：核心规则 + 世界摘要（详细角色设定由永久事实区按需注入）
        var result = '';
        if (layers.coreRules) {
            result += '【核心规则】\n' + layers.coreRules + '\n\n';
        }
        if (layers.worldSummary) {
            result += '【世界摘要】\n' + layers.worldSummary + '\n\n';
        }
        return result;
    },

    // 标记设定已压缩（在第8轮后调用）
    compressSetupIfNeeded: function() {
        var self = this;
        if (self.currentTurn >= 8 && !self._setupLayers.compressed) {
            self._setupLayers.compressed = true;
            self.saveToStorage();
            console.log('[设定分层] 第' + self.currentTurn + '轮，设定已压缩为核心规则+世界摘要模式');
        }
    },

    buildInjection: function() {
        var self = this;
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
        
        // 注入头尾模板
        var headers = {
            permanentFacts: '【记忆·永久事实】\n',
            changes: '【记忆·变化更新】(第' + currentTurn + '回合)\n',
            plot: '【记忆·当前剧情】\n',
            quests: '【记忆·进行中约定】\n',
            characters: '【记忆·角色状态】\n',
            events: '【记忆·重要事件】\n',
            items: '【记忆·持有物品】\n',
            sceneState: '【记忆·场景状态】\n',
            summaryLayers: '【记忆·对话摘要】\n'
        };
        var footers = {
            permanentFacts: '\n', changes: '\n', plot: '\n', quests: '\n',
            characters: '\n', events: '\n', items: '\n', sceneState: '\n', summaryLayers: '\n'
        };
        
        // 总量控制：先全部组装，超限时按优先级从低到高裁剪
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
        
        // 第三步：如果超限，按优先级从低到高裁剪
        var maxChars = budget.maxChars;
        if (totalChars > maxChars) {
            // 按优先级从低到高排序（优先级低的先裁剪）
            var sorted = moduleTexts.slice().sort(function(a, b) { return a.priority - b.priority; });
            var excess = totalChars - maxChars;
            for (var i = 0; i < sorted.length && excess > 0; i++) {
                var m = sorted[i];
                if (m.text.length <= excess) {
                    // 整个模块删除
                    excess -= m.text.length;
                    m.text = '';
                } else {
                    // 部分裁剪
                    m.text = truncateByChars(m.text, m.text.length - excess, '...');
                    excess = 0;
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
        return injection;
    },

    buildSmartInjection: function() { return this.buildInjection(); },

    _buildPermanentFactsSection: function() {
        var lines = [];
        var pf = this.permanentFacts;
        var typeLabels = { pcIdentity: '主角', worldRules: '设定规则', settings: '世界设定', npcProfiles: '关键角色', promises: '玩家承诺/约定' };
        var topic = this.detectCurrentTopic();
        var topicKeywords = (topic && topic.keywords) ? topic.keywords : [];
        var topicChars = (topic && topic.characters) ? topic.characters : [];

        ['pcIdentity', 'settings', 'worldRules', 'npcProfiles', 'promises'].forEach(function(t) {
            var list = pf[t];
            if (list && list.length > 0) {
                lines.push('【' + typeLabels[t] + '】');
                if (t === 'npcProfiles') {
                    // 角色档案：按关键词匹配排序，相关角色优先注入
                    var sorted = list.slice().sort(function(a, b) {
                        var scoreA = 0, scoreB = 0;
                        var kA = a.keywords || [], kB = b.keywords || [];
                        var nameA = a.content.split('【')[0], nameB = b.content.split('【')[0];
                        // 当前话题中的角色最优先
                        if (topicChars.indexOf(nameA) >= 0) scoreA += 100;
                        if (topicChars.indexOf(nameB) >= 0) scoreB += 100;
                        // 关键词匹配
                        kA.forEach(function(k) { if (topicKeywords.indexOf(k) >= 0) scoreA += 10; });
                        kB.forEach(function(k) { if (topicKeywords.indexOf(k) >= 0) scoreB += 10; });
                        return scoreB - scoreA;
                    });
                    sorted.forEach(function(a) { lines.push('• ' + a.content); });
                } else {
                    list.forEach(function(a) { lines.push('• ' + a.content); });
                }
            }
        });
        return lines;
    },

    _buildChangeUpdateSection: function(lastTurn) {
        var lines = [];
        var self = this;
        var gameTime = self.getGameTimeStr();
        // 角色变化（带时间锚点）
        Object.keys(self.tables.characters).forEach(function(name) {
            var c = self.tables.characters[name];
            if (c.lastChangedTurn > lastTurn) {
                var relTime = self._calculateRelativeTime(c.gameTime || '');
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
                lines.push(line);
            }
        });
        // 物品变化（带时间锚点）
        Object.keys(self.tables.items).forEach(function(name) {
            var it = self.tables.items[name];
            if (it.lastChangedTurn > lastTurn) {
                var relTime2 = self._calculateRelativeTime(it.gameTime || '');
                var timeTag2 = relTime2 ? '(' + relTime2 + ')' : '';
                var line = '• 物品·' + name + timeTag2;
                if (it.history && it.history.length > 0) {
                    var lastH2 = it.history[it.history.length - 1];
                    line += '：数量 ' + lastH2.from + '→' + lastH2.to;
                }
                lines.push(line);
            }
        });
        // 新事件
        self.events.forEach(function(e) {
            if (e.turn > lastTurn) {
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
        if (this.plot.worldSetting) lines.push('【世界观】' + this.plot.worldSetting);
        var chs = this.plot.chapters;
        if (chs && chs.length > 0) { lines.push('【' + chs[0].title + '】' + chs[0].summary); if (chs.length > 1) chs.slice(-2).forEach(function(ch) { lines.push('【' + ch.title + '】' + ch.summary); }); }
        if (this.plot.currentChapter) lines.push('【当前进展】' + truncateByChars(this.plot.currentChapter, 400, '...'));
        if (this.plot.pendingMysteries && this.plot.pendingMysteries.length > 0) { lines.push('【待解决悬念】'); this.plot.pendingMysteries.forEach(function(m) { lines.push('• ' + m); }); }
        return lines;
    },

    _buildQuestsSection: function() {
        var lines = [];
        var currentTurn = this.currentTurn;
        this.quests.filter(function(q) { return q.status === 'pending'; }).forEach(function(q) { lines.push('• ' + q.content); });
        return lines;
    },

    _buildCharactersSection: function(lastTurn, topic) {
        var lines = [];
        var self = this;
        if (!topic) topic = self.detectCurrentTopic();
        var allChars = Object.keys(self.tables.characters).map(function(n) { return self.tables.characters[n]; });
        // 评分排序（访问计数 + 话题相关 + 近期变化）
        allChars.forEach(function(c) {
            var score = 0;
            // 复用评分（Arkhon风格：被提及越多越重要）
            score += (c.accessCount || 0) * 5;
            // 话题相关
            if (topic.characters && topic.characters.indexOf(c.name) >= 0) score += 500;
            // 近期变化
            if (c.lastChangedTurn > lastTurn) score += 300;
            // 好感度极端值
            if (typeof c.favorability === 'number') score += Math.abs(c.favorability - 50);
            c._injectScore = score;
        });
        allChars.sort(function(a, b) { return b._injectScore - a._injectScore; });
        
        // 关键词激活：只注入相关的角色（有变化/被提及/高访问的）
        var relevantChars = allChars.filter(function(c) {
            // 始终包含：近期有变化的
            if (c.lastChangedTurn > lastTurn) return true;
            // 始终包含：高访问计数的（被频繁提及）
            if ((c.accessCount || 0) >= 3) return true;
            // 按需包含：当前话题相关的
            if (self._isRelevantToScene(c.name, c.keywords, topic)) return true;
            // 始终包含：好感度极端的
            if (typeof c.favorability === 'number' && (c.favorability >= 80 || c.favorability <= 20)) return true;
            return false;
        });
        
        // 最多注入角色数（按次计费：预算充裕时注入更多角色）
        var maxChars = (self.budget && self.budget.maxChars > 4000) ? 20 : 12;
        relevantChars.slice(0, maxChars).forEach(function(c) {
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
        return lines;
    },

    _buildEventsSection: function(lastTurn) {
        var lines = [];
        var self = this;
        self._recalcEventDecayScores(self.currentTurn);
        var maxEvents = (self.budget && self.budget.maxChars > 4000) ? 30 : 18;
        self.events.slice().sort(function(a, b) { return (b.decayScore || 0) - (a.decayScore || 0); }).slice(0, maxEvents).forEach(function(e) {
            var imp = e.importance || 5;
            var relTime = self._calculateRelativeTime(e.gameTime || '');
            var timeTag = relTime ? ' [' + relTime + ']' : '';
            lines.push((imp >= 9 ? '🔴' : (imp >= 7 ? '🟡' : '🟢')) + '[重要度' + imp + ']' + timeTag + ' ' + e.content);
        });
        return lines;
    },

    _buildItemsSection: function(lastTurn, topic) {
        var lines = [];
        var self = this;
        if (!topic) topic = self.detectCurrentTopic();
        var allItems = Object.keys(self.tables.items).map(function(n) { return self.tables.items[n]; }).filter(function(it) { return it && it.qty > 0; });
        
        // 关键词激活：只注入相关物品
        var relevantItems = allItems.filter(function(it) {
            // 始终包含：近期有变化的
            if (it.lastChangedTurn > lastTurn) return true;
            // 始终包含：高访问计数的
            if ((it.accessCount || 0) >= 2) return true;
            // 按需包含：当前话题相关的
            if (self._isRelevantToScene(it.name, it.keywords, topic)) return true;
            // 始终包含：珍稀及以上品质的
            if (it.rarity === '珍稀' || it.rarity === '传说') return true;
            return false;
        });
        
        relevantItems.sort(function(a, b) {
            var aScore = (a.accessCount || 0) * 10 + (a.lastChangedTurn > lastTurn ? 100 : 0);
            var bScore = (b.accessCount || 0) * 10 + (b.lastChangedTurn > lastTurn ? 100 : 0);
            return bScore - aScore;
        }).slice(0, 10).forEach(function(it) {
            var line = '• ' + it.name;
            if (it.qty > 1) line += ' x' + it.qty + (it.unit || '');
            if (it.rarity && it.rarity !== '普通') line += ' [' + it.rarity + ']';
            if (it.desc) line += ' - ' + truncateByChars(it.desc, 30, '...');
            lines.push(line);
        });
        return lines;
    },

    // 逐层摘要注入（Qvink风格：近详细→远压缩）
    // 按次计费：注入更多摘要，让AI掌握更多剧情脉络
    _buildSummaryLayersSection: function() {
        var lines = [];
        var self = this;
        // 远层：关键句
        if (self._summaryLayers.far && self._summaryLayers.far.length > 0) {
            lines.push('〔更早〕');
            self._summaryLayers.far.slice(-10).forEach(function(s) { lines.push('• ' + s); });
        }
        // 中层：压缩摘要
        if (self._summaryLayers.mid && self._summaryLayers.mid.length > 0) {
            lines.push('〔近期摘要〕');
            self._summaryLayers.mid.slice(-8).forEach(function(s) { lines.push('• ' + s); });
        }
        // 近层：详细
        if (self._summaryLayers.near && self._summaryLayers.near.length > 0) {
            lines.push('〔最近对话〕');
            self._summaryLayers.near.forEach(function(s) { lines.push('• ' + s); });
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
        if (message.role === 'user') currentTurn.user = message.content;
        else if (message.role === 'assistant') currentTurn.assistant = message.content;
        while (self.workingMemory.turns.length > MAX_TURNS) self.workingMemory.turns.shift();
        self.workingMemory.messages = [];
        for (var i = 0; i < self.workingMemory.turns.length; i++) { var t = self.workingMemory.turns[i]; if (t.user !== null && t.user !== undefined) self.workingMemory.messages.push({ role: 'user', content: t.user, timestamp: t.timestamp, turn: t.turn }); if (t.assistant !== null && t.assistant !== undefined) self.workingMemory.messages.push({ role: 'assistant', content: t.assistant, timestamp: t.timestamp, turn: t.turn }); }
        self.workingMemory.timestamp = Date.now();
    },

    _extractImportantInfo: function(gameData) {
        var self = this;
        var info = { characters: [], items: [], locations: [], events: [], relationships: [], importance: 0 };
        if (!gameData) return info;
        if (gameData.characters) gameData.characters.forEach(function(char) { info.characters.push({ name: char.name, title: char.title, relation: char.relation, favorability: char.favorability, desc: char.desc }); });
        if (gameData.bag) gameData.bag.forEach(function(item) { info.items.push({ name: item.name, count: item.count, desc: item.desc, rarity: item.rarity }); });
        if (gameData.keyEvents && gameData.keyEvents.length > 0) { gameData.keyEvents.forEach(function(ev) { info.events.push({ content: ev, importance: self.scoreEventImportance(ev) }); }); var maxImp = 0; info.events.forEach(function(e) { if (e.importance > maxImp) maxImp = e.importance; }); info.importance = Math.max(info.importance, maxImp); }
        if (gameData.relationships) { info.relationships = gameData.relationships; info.importance += 1; }
        if (gameData.story) { if (gameData.story.length > 500) info.importance += 1; if (gameData.story.length > 1000) info.importance += 2; }
        return info;
    },

    _updateTables: function(gameData, extractedInfo) {
        var self = this;
        var turn = self.currentTurn;
        if (!gameData) return;
        if (!extractedInfo) extractedInfo = { characters: [], items: [], events: [], relationships: [] };
        if (extractedInfo.characters.length > 0) {
            extractedInfo.characters.forEach(function(char) {
                var key = char.name;
                var existing = self.tables.characters[key];
                self.tables.characters[key] = { name: char.name, title: char.title || (existing ? existing.title : ''), relation: char.relation || (existing ? existing.relation : ''), mood: (existing ? existing.mood : ''), location: (existing ? existing.location : ''), outfit: (existing ? existing.outfit : ''), favorability: (typeof char.favorability === 'number') ? char.favorability : (existing ? existing.favorability : 50), status: (existing ? existing.status : ''), history: existing ? existing.history.concat([{ turn: turn, changes: char.desc || '' }]).slice(-10) : [{ turn: turn, changes: char.desc || '' }], lastChangedTurn: turn, gameTime: self.getGameTimeStr(), accessCount: existing ? (existing.accessCount || 0) : 0, locked: existing ? existing.locked : false };
            });
        }
        if (extractedInfo.items.length > 0) {
            extractedInfo.items.forEach(function(item) {
                var key = item.name;
                var existing = self.tables.items[key];
                var oldQty = existing ? existing.qty : 0;
                var newQty = item.count || 1;
                self.tables.items[key] = { name: item.name, qty: newQty, unit: existing ? existing.unit : '个', rarity: item.rarity || (existing ? existing.rarity : '普通'), desc: item.desc || (existing ? existing.desc : ''), obtainedTurn: existing ? existing.obtainedTurn : turn, lastChangedTurn: turn, gameTime: self.getGameTimeStr(), accessCount: existing ? (existing.accessCount || 0) : 0, history: existing ? existing.history.concat([{ turn: turn, from: oldQty, to: newQty }]).slice(-10) : [{ turn: turn, from: 0, to: newQty }] };
            });
        }
        if (gameData.story) { self._extractLocations(gameData.story).forEach(function(loc) { if (!self.tables.locations[loc]) self.tables.locations[loc] = { name: loc, desc: '', features: '', charactersPresent: '', lastChangedTurn: turn, locked: false }; else self.tables.locations[loc].lastChangedTurn = turn; }); }
        if (gameData.relationships) gameData.relationships.forEach(function(rel) { self.tables.relationships[rel.from + '->' + rel.to] = { from: rel.from, to: rel.to, type: rel.type, desc: rel.desc, lastChangedTurn: turn }; });
    },

    _extractLocations: function(story) {
        var locations = [];
        if (!story) return locations;
        [/在([^，。！？\s]{2,10})(?:里|内|中|上|下)/g, /来到([^，。！？\s]{2,10})/g, /前往([^，。！？\s]{2,10})/g, /进入([^，。！？\s]{2,10})/g].forEach(function(pattern) {
            pattern.lastIndex = 0;
            var match;
            while ((match = pattern.exec(story)) !== null) { var loc = match[1].trim(); if (loc.length > 1 && loc.length < 15 && locations.indexOf(loc) === -1) locations.push(loc); if (match.index === pattern.lastIndex) pattern.lastIndex++; }
        });
        return locations;
    },

    _shouldUpdateLongTerm: function(extractedInfo) { if (this.currentTurn % 5 === 0) return true; if (extractedInfo.importance >= 5) return true; if (extractedInfo.events.length >= 2) return true; return false; },

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
        if (extractedInfo.events.length > 0) {
            extractedInfo.events.forEach(function(event) {
                var content = (typeof event === 'string') ? event : event.content;
                var imp = (typeof event === 'object' && event.importance) ? event.importance : 5;
                if (!self.events.some(function(e) { return e.content === content; })) self.events.push({ content: content, turn: currentTurn, gameTime: self.getGameTimeStr(), importance: imp, decayScore: imp });
            });
            self._recalcEventDecayScores(currentTurn);
            self._pruneImportantEvents(50);
        }
    },

    _generateSummary: function(message, gameData, extractedInfo) {
        var summary = { turn: this.currentTurn + 1, timestamp: Date.now(), title: gameData ? gameData.title : '', storySummary: '', keyEvents: extractedInfo.events, characters: extractedInfo.characters.map(function(c) { return c.name; }), importance: extractedInfo.importance, changes: [] };
        if (gameData && gameData.contextSummary) summary.storySummary = gameData.contextSummary;
        else if (gameData && gameData.story) summary.storySummary = gameData.story.substring(0, 100) + '...';
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

    getRelativeTime: function(timestamp) {
        if (!timestamp) return '未知时间';
        var diff = Date.now() - timestamp;
        var minutes = Math.floor(diff / 60000); var hours = Math.floor(diff / 3600000); var days = Math.floor(diff / 86400000);
        if (minutes < 1) return '刚刚'; if (minutes < 60) return minutes + '分钟前'; if (hours < 24) return hours + '小时前'; if (days === 1) return '昨天'; if (days < 7) return days + '天前'; if (days < 30) return Math.floor(days / 7) + '周前'; return Math.floor(days / 30) + '个月前';
    },

    addWorldAnchor: function(type, content, source, createdTurn) {
        var self = this;
        var typeMap = { pc_identity: 'pcIdentity', setting: 'settings', world_rule: 'worldRules', npc_profile: 'npcProfiles', promise: 'promises' };
        var key = typeMap[type] || type;
        if (!self.permanentFacts[key]) self.permanentFacts[key] = [];
        if (self.permanentFacts[key].some(function(a) { return a.content === content; })) return null;
        if (type === 'npc_profile' && content) {
            var nameMatch = content.match(/^([一-鿿A-Za-z·]{1,6})/);
            if (nameMatch) {
                var name = nameMatch[1];
                for (var i = 0; i < self.permanentFacts[key].length; i++) {
                    if (self.permanentFacts[key][i].content.indexOf(name) === 0) {
                        if (self.permanentFacts[key][i].source === 'manual') return null;
                        self.permanentFacts[key][i] = { content: content, source: source || 'auto', locked: true, createdTurn: createdTurn || self.currentTurn };
                        return self.permanentFacts[key][i];
                    }
                }
            }
        }
        var anchor = { content: content, source: source || 'auto', locked: true, createdTurn: createdTurn || self.currentTurn };
        self.permanentFacts[key].push(anchor);
        var total = 0; Object.keys(self.permanentFacts).forEach(function(k) { total += self.permanentFacts[k].length; });
        if (total > 50 && self.permanentFacts.npcProfiles && self.permanentFacts.npcProfiles.length > 15) self.permanentFacts.npcProfiles = self.permanentFacts.npcProfiles.slice(-15);
        return anchor;
    },

    removeWorldAnchorsBySource: function(sourcePrefix) {
        var self = this; var removed = 0;
        Object.keys(self.permanentFacts).forEach(function(key) { var before = self.permanentFacts[key].length; self.permanentFacts[key] = self.permanentFacts[key].filter(function(a) { return !(a && a.source && a.source.indexOf(sourcePrefix) === 0); }); removed += before - self.permanentFacts[key].length; });
        if (removed > 0) try { self.saveToStorage(); } catch(e) {}
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
        if (syncContent.length > 300) syncContent = syncContent.substring(0, 300) + '...';
        var created = self.addWorldAnchor(anchorType, syncContent, sourceTag, self.currentTurn);
        try { if (created) self.saveToStorage(); } catch(e) {}
        return created;
    },

    addQuest: function(quest) {
        if (this.quests.some(function(q) { return q.content === quest.content && q.status === 'pending'; })) return null;
        if (!quest.createdTurn) quest.createdTurn = this.currentTurn;
        if (!quest.status) quest.status = 'pending';
        if (!quest.type) quest.type = 'promise';
        this.quests.push(quest);
        return quest;
    },

    addActiveQuest: function(quest) { return this.addQuest(quest); },

    resolveQuest: function(contentFragment, newStatus) {
        var self = this; var count = 0;
        self.quests.forEach(function(q) { if (q.status === 'pending' && q.content.indexOf(contentFragment) >= 0) { q.status = newStatus || 'resolved'; q.resolvedTurn = self.currentTurn; count++; } });
        return count;
    },

    _cleanupQuests: function() {
        var self = this; var currentTurn = self.currentTurn;
        self.quests = self.quests.filter(function(q) { if (q.status === 'resolved' || q.status === 'broken') { if (currentTurn - (q.resolvedTurn || currentTurn) > 30) return false; } if (q.status === 'pending') q.stale = (currentTurn - (q.createdTurn || 0)) > 50; return true; });
    },

    extractPromisesFromText: function(text) {
        if (!text || typeof text !== 'string') return [];
        var promises = []; var seen = {};
        for (var i = 0; i < this.PROMISE_KEYWORDS.length; i++) {
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
            var quest = self.addQuest({ type: 'promise', content: p.content, status: 'pending' });
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
            // 按次计费优化：不存完整设定（已在system prompt中注入），只存设定摘要避免重复
            var setupSummary = gameState.userPrompt.length > 500 
                ? truncateByChars(gameState.userPrompt, 500, '...(完整设定见系统提示词)') 
                : gameState.userPrompt;
            self.addWorldAnchor('setting', '玩家开场设定：' + setupSummary, 'userPrompt', self.currentTurn);
        }
        if (typeof gameState !== 'undefined' && gameState.customStyle && self.currentTurn <= 2) self.addWorldAnchor('setting', '风格偏好：' + gameState.customStyle, 'userStyle', self.currentTurn);
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
        try { this.saveToStorage(); } catch(e) {}
        return true;
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
        var keptEpic = epic.slice(0, 15);
        normal.sort(function(a, b) { return b.decayScore - a.decayScore; });
        this.events = keptEpic.concat(normal.slice(0, Math.max(0, maxCount - keptEpic.length))).sort(function(a, b) { return (a.turn || 0) - (b.turn || 0); });
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
            if (typeof gameState === 'undefined' || !gameState.conversationHistory) return topic;
            var allText = gameState.conversationHistory.slice(-3).map(function(m) { return m.content || ''; }).join(' ');
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
        // 按次计费优化：尽可能多用上下文，只留15%给输出，其余全塞游戏数据
        // 字符/token比约1.7，所以 maxChars ≈ ctxSize * 0.85 * 1.7
        var base = Math.floor(ctxSize * 0.85 * 1.7);
        // 上下限保护
        if (base < 4000) base = 4000;
        if (base > 180000) base = 180000;
        this.budget.maxChars = base;
        // 按次计费：各模块理想预算也按比例放大
        var scale = base / 4000; // 以4000为基准缩放
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
        var lastCompressTime = Date.now() - (window.lastCompressTime || 0);
        if (currentTokenCount > maxTokens * config.triggerThreshold) return { shouldCompress: true, reason: 'Token超限 (' + currentTokenCount + '/' + maxTokens + ')' };
        // 按次计费：放宽消息数量阈值，保留更多原文
        if (messageCount > 100) return { shouldCompress: true, reason: '消息数量过多 (' + messageCount + '条)' };
        if (lastCompressTime > config.cooldownMinutes * 60 * 1000 && messageCount >= 60) { var recentMessages = (typeof gameState !== 'undefined' && gameState.conversationHistory) ? gameState.conversationHistory.slice(-5) : []; if (recentMessages.some(function(m) { var c = m.content || ''; return c.indexOf('重要') >= 0 || c.indexOf('关键') >= 0 || c.indexOf('转折') >= 0; })) return { shouldCompress: true, reason: '检测到重要事件，建议压缩' }; }
        return { shouldCompress: false, reason: '暂不需要压缩' };
    },

    search: function(keyword, options) {
        var results = { events: [], characters: [], items: [], summaries: [] };
        var self = this;
        this.events.forEach(function(e) { if (e.content && e.content.indexOf(keyword) !== -1) results.events.push(e); });
        Object.keys(self.tables.characters).forEach(function(name) { if (name.indexOf(keyword) !== -1) results.characters.push(self.tables.characters[name]); });
        Object.keys(self.tables.items).forEach(function(name) { if (name.indexOf(keyword) !== -1) results.items.push(self.tables.items[name]); });
        if (self.workingMemory.recentMessages) self.workingMemory.recentMessages.forEach(function(s) { if (s && s.indexOf(keyword) !== -1) results.summaries.push(s); });
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
            var data = { version: self.version, currentTurn: self.currentTurn, lastInjectionTurn: self.lastInjectionTurn, gameClock: self.gameClock, permanentFacts: self.permanentFacts, tables: self.tables, plot: self.plot, events: self.events, timeline: self.timeline, quests: self.quests, workingMemory: self.workingMemory, budget: self.budget, compressionConfig: self.compressionConfig, stats: self.stats, _changeLog: self._changeLog, _injectionSnapshots: self._injectionSnapshots, _summaryLayers: self._summaryLayers, _setupLayers: self._setupLayers, savedAt: Date.now() };
            var result = safeSetItem('freeScript_memory', JSON.stringify(data));
            if (!result || result.success === false) self._handleSaveFailure(result, data);
        } catch(e) { self._handleSaveFailure({ error: 'serialize_error', message: e.message }, null); }
        finally { self._saving = false; if (self._pendingSave) { self._pendingSave = false; TimerManager.setTimeout('gameMemoryDeferredSave', function() { self.saveToStorage(); }, 50); } }
    },

    _handleSaveFailure: function(result, originalData) {
        try {
            console.warn('[GameMemory] 保存失败，降级处理:', (result && result.message) || 'unknown');
            if (this.timeline && this.timeline.length > 20) this.timeline = this.timeline.slice(-20);
            if (this.events && this.events.length > 20) this.events = this.events.slice(-20);
            this._changeLog = [];
            var reduced = { version: this.version, currentTurn: this.currentTurn, lastInjectionTurn: this.lastInjectionTurn, gameClock: this.gameClock, permanentFacts: this.permanentFacts, tables: this.tables, plot: this.plot, events: this.events, timeline: this.timeline, quests: this.quests, workingMemory: this.workingMemory, _injectionSnapshots: this._injectionSnapshots, _summaryLayers: this._summaryLayers, _setupLayers: this._setupLayers, stats: this.stats, savedAt: Date.now() };
            var r2 = safeSetItem('freeScript_memory', JSON.stringify(reduced));
            if (r2 && r2.success) console.log('[GameMemory] 降级保存成功');
            else console.error('[GameMemory] 降级保存仍然失败：', r2);
        } catch(e2) { console.error('[GameMemory] 降级保存异常：', e2); }
    },

    loadFromStorage: function() {
        var self = this; var data = null;
        try { data = JSON.parse(localStorage.getItem('freeScript_memory') || 'null'); } catch(e) { data = null; }
        if (!data || data.version !== 3) return false;
        if (typeof data.currentTurn === 'number') self.currentTurn = data.currentTurn;
        if (typeof data.lastInjectionTurn === 'number') self.lastInjectionTurn = data.lastInjectionTurn;
        if (data.gameClock) self.gameClock = data.gameClock;
        if (data.permanentFacts) self.permanentFacts = data.permanentFacts;
        if (data.tables) self.tables = data.tables;
        if (data.plot) self.plot = data.plot;
        if (data.events) self.events = data.events;
        if (data.timeline) self.timeline = data.timeline;
        if (data.quests) self.quests = data.quests;
        if (data.workingMemory) self.workingMemory = data.workingMemory;
        if (data.budget) self.budget = data.budget;
        if (data.compressionConfig) self.compressionConfig = data.compressionConfig;
        if (data.stats) self.stats = data.stats;
        if (data._changeLog) self._changeLog = data._changeLog;
        if (data._injectionSnapshots) self._injectionSnapshots = data._injectionSnapshots;
        if (data._summaryLayers) self._summaryLayers = data._summaryLayers;
        if (data._setupLayers) self._setupLayers = data._setupLayers;
        if (!self.workingMemory.turns) self.workingMemory.turns = [];
        if (!self.workingMemory.messages) self.workingMemory.messages = [];
        if (!self.workingMemory.recentMessages) self.workingMemory.recentMessages = [];
        if (!self.plot.pendingMysteries) self.plot.pendingMysteries = [];
        if (!self._injectionSnapshots) self._injectionSnapshots = {};
        if (!self._summaryLayers) self._summaryLayers = { near: [], mid: [], far: [] };
        if (!self._setupLayers) self._setupLayers = { coreRules: '', worldSummary: '', fullSetup: '', compressed: false, extractTurn: -1, setupKeywords: [] };
        if (!self._setupLayers.setupKeywords) self._setupLayers.setupKeywords = [];
        if (!self.workingMemory.nearSummary) self.workingMemory.nearSummary = '';
        if (!self.workingMemory.midSummary) self.workingMemory.midSummary = '';
        if (!self.workingMemory.farSummary) self.workingMemory.farSummary = '';
        return true;
    },

    startAutoSave: function() { var self = this; if (this._autoSaveTimer) TimerManager.clearInterval('gameMemoryAutoSave'); TimerManager.setInterval('gameMemoryAutoSave', function() { self.saveToStorage(); }, 30000); },
    stopAutoSave: function() { TimerManager.clearInterval('gameMemoryAutoSave'); },

    clear: function() {
        this.currentTurn = 0; this.lastInjectionTurn = -1; this.gameClock = { day: 1, period: '早晨', lastUpdateTurn: 0 };
        this.permanentFacts = { pcIdentity: [], worldRules: [], settings: [], npcProfiles: [], promises: [] };
        this.tables = { characters: {}, items: {}, locations: {}, relationships: {} };
        this.plot = { worldSetting: '', chapters: [], currentChapter: '', pendingMysteries: [] };
        this.events = []; this.timeline = []; this.quests = [];
        this.workingMemory = { recentMessages: [], currentTopic: null, turns: [], messages: [], nearSummary: '', midSummary: '', farSummary: '' };
        this.stats = { totalMessages: 0, totalSummaries: 0, lastUpdateTime: null, tokenSaved: 0 };
        this._changeLog = []; this.summaryHistory = []; this.currentSummaryIndex = -1;
        this._injectionSnapshots = {};
        this._summaryLayers = { near: [], mid: [], far: [] };
        this._setupLayers = { coreRules: '', worldSummary: '', fullSetup: '', compressed: false, extractTurn: -1, setupKeywords: [] };
        localStorage.removeItem('freeScript_memory'); localStorage.removeItem('freeScript_enhancedMemory');
    },

    saveSummaryHistory: function() {},
    rollbackSummary: function() { return false; },
    getCharacterInfo: function(name) { return this.tables.characters[name] || null; },
    getItemHistory: function(name) { var it = this.tables.items[name]; return it ? it.history : null; },
    getTimeline: function(startTurn, endTurn) { return this.timeline.filter(function(t) { return t.turn >= (startTurn || 0) && t.turn <= (endTurn || Infinity); }); },
    getRelationshipNetwork: function(charName) { var network = []; var self = this; Object.keys(self.tables.relationships).forEach(function(key) { var rel = self.tables.relationships[key]; if (rel.from === charName || rel.to === charName) network.push(rel); }); return network; }
};

// 全局暴露
window.GameMemory = GameMemory;
window.EnhancedMemory = GameMemory;

GlobalCleanup.registerListener(document, 'DOMContentLoaded', function() { GameMemory.init(); });

// 向后兼容 getter
Object.defineProperty(GameMemory, 'longTermMemory', {
    get: function() {
        var self = this;
        // worldAnchors: 从 permanentFacts 映射（只读快照）
        var worldAnchors = [];
        var typeMap = { pcIdentity: 'pc_identity', settings: 'setting', worldRules: 'world_rule', npcProfiles: 'npc_profile', promises: 'promise' };
        Object.keys(self.permanentFacts).forEach(function(key) { var oldType = typeMap[key] || key; self.permanentFacts[key].forEach(function(a) { worldAnchors.push({ type: oldType, content: a.content, source: a.source, locked: a.locked, createdTurn: a.createdTurn }); }); });
        // itemTable: 直接引用 tables.items（允许旧代码写入，格式兼容）
        var itemTable = self.tables.items;
        // worldNotes: 持久化数组
        if (!self._worldNotes) self._worldNotes = [];
        // 返回的对象中 characterTable / importantEvents / quests / timeline 是实时引用
        // masterSummary 写入通过 setter 回写
        var result = {
            worldAnchors: worldAnchors,
            activeQuests: self.quests,
            characterTable: self.tables.characters,
            itemTable: itemTable,
            locationTable: self.tables.locations,
            relationships: self.tables.relationships,
            mainPlot: self.plot.chapters,
            currentChapterSummary: self.plot.currentChapter,
            importantEvents: self.events,
            timeline: self.timeline,
            worldSetting: self.plot.worldSetting,
            worldNotes: self._worldNotes,
            masterSummary: self.plot.worldSetting + '\n' + (self.plot.currentChapter || '')
        };
        // masterSummary setter：写入时回写到 plot
        var _self = self;
        Object.defineProperty(result, 'masterSummary', {
            get: function() { return _self.plot.worldSetting + '\n' + (_self.plot.currentChapter || ''); },
            set: function(val) { if (typeof val === 'string') { var parts = val.split('\n'); _self.plot.worldSetting = parts[0] || ''; _self.plot.currentChapter = parts.slice(1).join('\n') || val; } },
            configurable: true
        });
        return result;
    },
    set: function() {}, configurable: true
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
        if (val && val.summaries) this.workingMemory.recentMessages = val.summaries;
    },
    configurable: true
});

Object.defineProperty(GameMemory, 'injectionBudget', {
    get: function() { return this.budget; },
    set: function(val) { if (val) Object.assign(this.budget, val); },
    configurable: true
});

Object.defineProperty(GameMemory, 'workingMemory', {
    get: function() { return this._workingMemory || { messages: [], turns: [], recentMessages: [], currentTopic: null, nearSummary: '', midSummary: '', farSummary: '' }; },
    set: function(val) { this._workingMemory = val; },
    configurable: true
});

/**
 * ========================================
 * 记忆管理UI界面 v3 - 适配 GameMemory
 * ========================================
 */

var MemoryManagerUI = {

    isVisible: false,
    currentTab: 'overview',

    _esc: function(str) { if (str === null || str === undefined) return ''; return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); },
    _escAttr: function(str) { if (str === null || str === undefined) return ''; return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/</g, '\\x3c').replace(/>/g, '\\x3e').replace(/\n/g, '\\n').replace(/\r/g, '\\r'); },

    initNavigation: function() {
        var self = this;
        var backBtn = document.getElementById('memoryBackBtn');
        if (backBtn) backBtn.addEventListener('click', function() { UI.showPage('storyPage'); renderNavBar('gameNav', [{ page: 'storyPage', icon: 'icon-book', label: '剧情' }, { page: 'playerPage', icon: 'icon-user', label: '个人' }, { page: 'npcPage', icon: 'icon-users', label: '人际' }, { page: 'logPage', icon: 'icon-grid', label: '日志' }, { page: 'memoryPage', icon: 'icon-sparkles', label: '记忆' }, { page: 'recapPage', icon: 'icon-clock', label: '回顾' }], 0); });
        var saveBtn = document.getElementById('btnMemorySave');
        if (saveBtn) saveBtn.addEventListener('click', function() { self.saveMemoryEdits(); });
        var summaryEdit = document.getElementById('memorySummaryEdit');
        if (summaryEdit) summaryEdit.addEventListener('input', function() { var counter = document.getElementById('memorySummaryCount'); if (counter) counter.textContent = summaryEdit.value.length + ' 字'; });
    },

    saveMemoryEdits: function() {
        var summaryEl = document.getElementById('memorySummaryEdit');
        if (summaryEl && typeof gameState !== 'undefined') gameState.rollingSummary = summaryEl.value.trim();
        var worldEdit = document.getElementById('memoryWorldEdit');
        if (worldEdit && typeof gameState !== 'undefined') { try { gameState.worldSnapshot = JSON.parse(worldEdit.value); } catch(e) {} }
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
        var tabMap = { overview: 'renderOverview', permanentFacts: 'renderPermanentFacts', characters: 'renderCharacters', items: 'renderItems', locations: 'renderLocations', relationships: 'renderRelationships', plot: 'renderPlot', events: 'renderEvents', quests: 'renderQuests', timeline: 'renderTimeline', injection: 'renderInjectionPreview', search: 'renderSearch', summaryLayers: 'renderSummaryLayers', sceneState: 'renderSceneState' };
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
            + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:12px;color:var(--text-tertiary);">游戏时间</div><div style="font-size:20px;font-weight:600;">' + this._esc(gm.getGameTimeStr()) + '</div></div>'
            + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:12px;color:var(--text-tertiary);">永久事实</div><div style="font-size:20px;font-weight:600;">' + totalAnchors + ' 条</div></div>'
            + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:12px;color:var(--text-tertiary);">进行中约定</div><div style="font-size:20px;font-weight:600;">' + pendingQuests + ' 待办</div></div>'
            + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:12px;color:var(--text-tertiary);">当前回合</div><div style="font-size:20px;font-weight:600;">' + gm.currentTurn + '</div></div>'
            + '</div></div>'
            + '<div class="memory-card"><div class="memory-card-title">新功能状态</div><div style="display:flex;gap:16px;flex-wrap:wrap;">'
            + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:12px;color:var(--text-tertiary);">逐层摘要</div><div style="font-size:14px;font-weight:600;">near ' + ((gm._summaryLayers && gm._summaryLayers.near) ? gm._summaryLayers.near.length : 0) + ' / mid ' + ((gm._summaryLayers && gm._summaryLayers.mid) ? gm._summaryLayers.mid.length : 0) + ' / far ' + ((gm._summaryLayers && gm._summaryLayers.far) ? gm._summaryLayers.far.length : 0) + ' 条</div></div>'
            + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:12px;color:var(--text-tertiary);">场景状态</div><div style="font-size:14px;font-weight:600;">' + Object.values(gm.tables.locations).filter(function(l) { return !!l.sceneState; }).length + ' 个地点有场景锁定</div></div>'
            + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:12px;color:var(--text-tertiary);">变化驱动</div><div style="font-size:14px;font-weight:600;">上次跳过 ' + (gm._lastInjectionStats && gm._lastInjectionStats.skippedModules ? gm._lastInjectionStats.skippedModules.length : 0) + ' 个无变化模块</div></div>'
            + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:12px;color:var(--text-tertiary);">设定分层</div><div style="font-size:14px;font-weight:600;">' + (gm._setupLayers && gm._setupLayers.compressed ? '已压缩（核心规则+世界摘要）' : (gm._setupLayers && gm._setupLayers.fullSetup ? '完整模式（前3轮）' : '未初始化')) + '</div></div>'
            + '</div></div>'
            + '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;"><span>🧠 注入预览</span><button onclick="MemoryManagerUI.switchTab(\'injection\')" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--accent);padding:4px 10px;border-radius:6px;cursor:pointer;">查看详情</button></div>'
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
            layers.near.forEach(function(s) { html += '<div style="padding:8px 10px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;line-height:1.5;">' + self._esc(s) + '</div>'; });
        } else {
            html += '<div style="padding:12px;text-align:center;color:var(--text-tertiary);font-size:13px;">暂无近层摘要</div>';
        }
        html += '</div>';
        html += '<div style="margin-bottom:16px;"><div style="font-size:13px;font-weight:600;margin-bottom:8px;color:#ff9500;">〔近期摘要〕压缩 · ' + (layers.mid || []).length + ' 条</div>';
        if (layers.mid && layers.mid.length > 0) {
            layers.mid.forEach(function(s) { html += '<div style="padding:8px 10px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;line-height:1.5;">' + self._esc(s) + '</div>'; });
        } else {
            html += '<div style="padding:12px;text-align:center;color:var(--text-tertiary);font-size:13px;">暂无中层摘要</div>';
        }
        html += '</div>';
        html += '<div style="margin-bottom:16px;"><div style="font-size:13px;font-weight:600;margin-bottom:8px;color:#999;">〔更早记忆〕关键句 · ' + (layers.far || []).length + ' 条</div>';
        if (layers.far && layers.far.length > 0) {
            layers.far.forEach(function(s) { html += '<div style="padding:8px 10px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;line-height:1.5;color:var(--text-secondary);">' + self._esc(s) + '</div>'; });
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
                html += '<div style="font-weight:600;">' + self._esc(loc.name) + (loc.locked ? ' 🔒' : '') + '</div>';
                html += '<button onclick="MemoryManagerUI.editSceneState(\'' + self._escAttr(loc.name) + '\')" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--border);padding:4px 8px;border-radius:6px;cursor:pointer;">编辑场景</button>';
                html += '</div>';
                if (hasScene) {
                    html += '<div style="font-size:13px;color:var(--text-secondary);padding:6px 8px;background:rgba(255,149,0,0.1);border-radius:4px;">' + self._esc(loc.sceneState) + '</div>';
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
        document.getElementById('memoryManagerContent').innerHTML = '<div class="memory-card"><div class="memory-card-title">编辑场景状态: ' + this._esc(name) + '</div><div style="display:flex;flex-direction:column;gap:12px;">'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">场景状态（描述当前场景细节，AI会记住）</label><textarea id="editSceneState" style="width:100%;min-height:80px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;resize:vertical;outline:none;font-family:inherit;" placeholder="如：壁炉燃烧中，桌上摆着两杯热茶...">' + this._esc(loc.sceneState || '') + '</textarea></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">锁定场景 <span style="font-size:11px;">（锁定后状态不会自动清除）</span></label><input id="editSceneLocked" type="checkbox"' + (loc.locked ? ' checked' : '') + ' style="width:auto;"></div>'
            + '<div style="display:flex;gap:8px;justify-content:flex-end;"><button onclick="MemoryManagerUI.switchTab(\'sceneState\')" style="padding:10px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;">取消</button><button onclick="MemoryManagerUI.saveSceneState(\'' + this._escAttr(name) + '\')" style="padding:10px 20px;border:none;border-radius:8px;background:var(--accent);color:white;cursor:pointer;font-size:13px;">保存</button></div></div></div>';
    },

    saveSceneState: function(name) {
        var gm = window.GameMemory; if (!gm || !gm.tables.locations[name]) return;
        gm.tables.locations[name].sceneState = document.getElementById('editSceneState').value.trim();
        gm.tables.locations[name].locked = document.getElementById('editSceneLocked').checked;
        gm.saveToStorage(); if (typeof GameLinker !== 'undefined') GameLinker.refreshByDataChange('worldSnapshot'); this.switchTab('sceneState'); UI.toast('场景状态已保存');
    },

    renderPermanentFacts: function(gm) {
        var self = this;
        var typeLabels = { pcIdentity: '🎭 主角身份', settings: '🌍 世界设定', worldRules: '📜 设定规则', npcProfiles: '👤 关键角色', promises: '🤝 玩家承诺' };
        var typeOrder = ['pcIdentity', 'settings', 'worldRules', 'npcProfiles', 'promises'];
        var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><div style="font-size:13px;color:var(--text-tertiary);">永久事实——任何情况下 AI 都会优先看到</div><button onclick="MemoryManagerUI.addPermanentFact()" style="font-size:12px;color:white;background:var(--accent);border:none;padding:6px 14px;border-radius:6px;cursor:pointer;">+ 手动添加</button></div>';
        var total = 0; Object.keys(gm.permanentFacts).forEach(function(k) { total += gm.permanentFacts[k].length; });
        if (total === 0) html += '<div style="text-align:center;padding:40px;color:var(--text-tertiary);">还没有永久事实</div>';
        typeOrder.forEach(function(t) {
            var list = gm.permanentFacts[t]; if (!list || list.length === 0) return;
            html += '<div class="memory-card"><div class="memory-card-title">' + (typeLabels[t] || t) + ' <span style="font-weight:normal;font-size:11px;color:var(--text-tertiary);">' + list.length + ' 条</span></div>';
            list.forEach(function(a, i) {
                var sourceTag = a.source === 'manual' ? '<span style="font-size:10px;background:#4a4;color:white;padding:1px 6px;border-radius:4px;margin-left:6px;">手动</span>' : a.source === 'auto' ? '<span style="font-size:10px;background:#666;color:white;padding:1px 6px;border-radius:4px;margin-left:6px;">自动</span>' : '';
                html += '<div style="padding:12px 14px;background:var(--bg);border-radius:8px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;"><div style="flex:1;font-size:14px;line-height:1.7;word-break:break-all;">' + self._esc(a.content) + sourceTag + '</div><div style="display:flex;gap:6px;flex-shrink:0;"><button onclick="MemoryManagerUI.editPermanentFact(\'' + t + '\',' + i + ')" style="font-size:12px;color:var(--accent);background:none;border:1px solid var(--border);padding:4px 10px;border-radius:6px;cursor:pointer;">编辑</button><button onclick="MemoryManagerUI.deletePermanentFact(\'' + t + '\',' + i + ')" style="font-size:12px;color:#f44;background:none;border:1px solid var(--border);padding:4px 10px;border-radius:6px;cursor:pointer;">删除</button></div></div>';
            });
            html += '</div>';
        });
        return html;
    },

    addPermanentFact: function() {
        document.getElementById('memoryManagerContent').innerHTML = '<div class="memory-card"><div class="memory-card-title">添加永久事实</div><div style="margin-bottom:10px;"><label style="font-size:12px;color:var(--text-secondary);">类型</label><select id="newFactType" style="width:100%;padding:8px;margin-top:4px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;"><option value="pcIdentity">🎭 主角身份</option><option value="settings">🌍 世界设定</option><option value="worldRules">📜 设定规则</option><option value="npcProfiles">👤 关键角色</option><option value="promises" selected>🤝 玩家承诺</option></select></div><div style="margin-bottom:10px;"><label style="font-size:12px;color:var(--text-secondary);">内容</label><textarea id="newFactContent" rows="4" style="width:100%;padding:8px;margin-top:4px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;resize:vertical;box-sizing:border-box;" placeholder="输入永久事实内容..."></textarea></div><div style="display:flex;gap:8px;justify-content:flex-end;"><button onclick="MemoryManagerUI.switchTab(\'permanentFacts\')" style="padding:8px 16px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text);cursor:pointer;">取消</button><button onclick="MemoryManagerUI.saveNewPermanentFact()" style="padding:8px 16px;border:none;border-radius:6px;background:var(--accent);color:white;cursor:pointer;">添加</button></div></div>';
    },

    saveNewPermanentFact: function() {
        var gm = window.GameMemory; if (!gm) return;
        var type = document.getElementById('newFactType').value;
        var content = (document.getElementById('newFactContent').value || '').trim();
        if (!content) { UI.toast && UI.toast('内容不能为空'); return; }
        var oldTypeMap = { pcIdentity: 'pc_identity', settings: 'setting', worldRules: 'world_rule', npcProfiles: 'npc_profile', promises: 'promise' };
        var result = gm.addWorldAnchor(oldTypeMap[type] || type, content, 'manual', gm.currentTurn);
        if (result) { gm.saveToStorage(); UI.toast && UI.toast('已添加'); } else UI.toast && UI.toast('已存在（重复内容）');
        this.switchTab('permanentFacts');
    },

    editPermanentFact: function(type, idx) {
        var gm = window.GameMemory; if (!gm || !gm.permanentFacts[type] || !gm.permanentFacts[type][idx]) return;
        document.getElementById('memoryManagerContent').innerHTML = '<div class="memory-card"><div class="memory-card-title">编辑永久事实</div><div style="margin-bottom:10px;"><textarea id="editFactContent" rows="4" style="width:100%;padding:8px;margin-top:4px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;resize:vertical;box-sizing:border-box;">' + this._esc(gm.permanentFacts[type][idx].content) + '</textarea></div><div style="display:flex;gap:8px;justify-content:flex-end;"><button onclick="MemoryManagerUI.switchTab(\'permanentFacts\')" style="padding:8px 16px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text);cursor:pointer;">取消</button><button onclick="MemoryManagerUI.savePermanentFact(\'' + type + '\',' + idx + ')" style="padding:8px 16px;border:none;border-radius:6px;background:var(--accent);color:white;cursor:pointer;">保存</button></div></div>';
    },

    savePermanentFact: function(type, idx) {
        var gm = window.GameMemory; if (!gm || !gm.permanentFacts[type]) return;
        var content = (document.getElementById('editFactContent').value || '').trim();
        if (!content) { UI.toast && UI.toast('内容不能为空'); return; }
        gm.permanentFacts[type][idx].content = content; gm.permanentFacts[type][idx].source = 'manual'; gm.saveToStorage(); if (typeof GameLinker !== 'undefined') GameLinker.refreshByDataChange('_memory'); UI.toast && UI.toast('已保存'); this.switchTab('permanentFacts');
    },

    deletePermanentFact: function(type, idx) {
        var gm = window.GameMemory; if (!gm || !gm.permanentFacts[type]) return;
        if (!confirm('确定要删除这条永久事实吗？')) return;
        gm.permanentFacts[type].splice(idx, 1); gm.saveToStorage(); if (typeof GameLinker !== 'undefined') GameLinker.refreshByDataChange('_memory'); UI.toast && UI.toast('已删除'); this.switchTab('permanentFacts');
    },

    renderCharacters: function(gm) {
        var self = this; var chars = Object.values(gm.tables.characters);
        var html = '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;"><span>角色档案</span><button onclick="MemoryManagerUI.addCharacter()" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--accent);padding:4px 10px;border-radius:6px;cursor:pointer;">+ 添加角色</button></div>';
        if (chars.length === 0) html += '<div class="memory-empty-state"><div>暂无角色数据</div></div>';
        else chars.forEach(function(char) {
            html += '<div class="memory-character-card"><div class="memory-character-avatar">👤</div><div style="flex:1;"><div style="font-weight:600;">' + self._esc(char.name) + (char.locked ? ' 🔒' : '') + '</div><div style="font-size:12px;color:var(--text-secondary);">' + self._esc(char.title || '') + ' | 关系: ' + self._esc(char.relation || '未知') + ' | 好感: ' + self._esc(char.favorability || 0) + '</div>' + (char.mood ? '<div style="font-size:11px;color:var(--text-tertiary);">心情: ' + self._esc(char.mood) + '</div>' : '') + (char.location ? '<div style="font-size:11px;color:var(--text-tertiary);">位置: ' + self._esc(char.location) + '</div>' : '') + (char.accessCount ? '<div style="font-size:11px;color:var(--text-tertiary);">提及: ' + char.accessCount + '次</div>' : '') + (char.gameTime ? '<div style="font-size:11px;color:var(--text-tertiary);">上次变化: ' + self._esc(gm._calculateRelativeTime(char.gameTime)) + '</div>' : '') + '</div><div style="display:flex;flex-direction:column;gap:4px;"><button onclick="MemoryManagerUI.editCharacter(\'' + self._escAttr(char.name) + '\')" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--border);padding:4px 8px;border-radius:6px;cursor:pointer;">编辑</button><button onclick="MemoryManagerUI.deleteCharacter(\'' + self._escAttr(char.name) + '\')" style="font-size:11px;color:#f44;background:none;border:1px solid var(--border);padding:4px 8px;border-radius:6px;cursor:pointer;">删除</button></div></div>';
        });
        html += '</div>'; return html;
    },

    editCharacter: function(name) {
        var gm = window.GameMemory; var char = gm.tables.characters[name]; if (!char) return;
        document.getElementById('memoryManagerContent').innerHTML = '<div class="memory-card"><div class="memory-card-title">编辑角色: ' + this._esc(name) + '</div><div style="display:flex;flex-direction:column;gap:12px;">'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">名称</label><input id="editCharName" value="' + this._esc(name) + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">身份/称号</label><input id="editCharTitle" value="' + this._esc(char.title || '') + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">关系</label><input id="editCharRelation" value="' + this._esc(char.relation || '') + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">好感度</label><input id="editCharFav" type="number" value="' + this._esc(char.favorability || 0) + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">心情</label><input id="editCharMood" value="' + this._esc(char.mood || '') + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">位置</label><input id="editCharLocation" value="' + this._esc(char.location || '') + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">锁定场景</label><input id="editCharLocked" type="checkbox"' + (char.locked ? ' checked' : '') + ' style="width:auto;"></div>'
            + '<div style="display:flex;gap:8px;justify-content:flex-end;"><button onclick="MemoryManagerUI.switchTab(\'characters\')" style="padding:10px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;">取消</button><button onclick="MemoryManagerUI.saveCharacter(\'' + this._escAttr(name) + '\')" style="padding:10px 20px;border:none;border-radius:8px;background:var(--accent);color:white;cursor:pointer;font-size:13px;">保存</button></div></div></div>';
    },

    saveCharacter: function(oldName) {
        var gm = window.GameMemory; var newName = document.getElementById('editCharName').value.trim(); if (!newName) return;
        var char = gm.tables.characters[oldName] || {}; if (oldName !== newName) delete gm.tables.characters[oldName];
        gm.tables.characters[newName] = { name: newName, title: document.getElementById('editCharTitle').value.trim(), relation: document.getElementById('editCharRelation').value.trim(), mood: document.getElementById('editCharMood').value.trim(), location: document.getElementById('editCharLocation').value.trim(), outfit: char.outfit || '', favorability: parseInt(document.getElementById('editCharFav').value) || 0, status: char.status || '', history: char.history || [], gameTime: gm.getGameTimeStr(), accessCount: char.accessCount || 0, lastChangedTurn: gm.currentTurn, locked: document.getElementById('editCharLocked').checked };
        gm.saveToStorage();
        // 同步到gameState
        if (typeof gameState !== 'undefined' && gameState.allCharacters) {
            if (oldName !== newName && gameState.allCharacters[oldName]) delete gameState.allCharacters[oldName];
            gameState.allCharacters[newName] = gameState.allCharacters[newName] || {};
            gameState.allCharacters[newName].name = newName;
            gameState.allCharacters[newName].title = document.getElementById('editCharTitle').value.trim();
            gameState.allCharacters[newName].relation = document.getElementById('editCharRelation').value.trim();
            gameState.allCharacters[newName].favorability = parseInt(document.getElementById('editCharFav').value) || 0;
        }
        if (typeof GameLinker !== 'undefined') GameLinker.refreshByDataChange('allCharacters');
        this.switchTab('characters');
    },

    deleteCharacter: function(name) { var gm = window.GameMemory; if (!gm || !gm.tables.characters[name]) return; delete gm.tables.characters[name]; gm.saveToStorage(); if (typeof gameState !== 'undefined' && gameState.allCharacters && gameState.allCharacters[name]) { delete gameState.allCharacters[name]; } if (typeof GameLinker !== 'undefined') GameLinker.refreshByDataChange('allCharacters'); this.switchTab('characters'); UI.toast('角色已删除'); },

    addCharacter: function() {
        document.getElementById('memoryManagerContent').innerHTML = '<div class="memory-card"><div class="memory-card-title">➕ 添加角色</div><div style="display:flex;flex-direction:column;gap:12px;">'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">名称 *</label><input id="addCharName" placeholder="角色名称" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">身份/称号</label><input id="addCharTitle" placeholder="如：剑术导师" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">关系</label><input id="addCharRelation" placeholder="如：朋友、敌人" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">好感度</label><input id="addCharFav" type="number" value="50" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>'
            + '<div style="display:flex;gap:8px;justify-content:flex-end;"><button onclick="MemoryManagerUI.switchTab(\'characters\')" style="padding:10px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;">取消</button><button onclick="MemoryManagerUI.saveNewCharacter()" style="padding:10px 20px;border:none;border-radius:8px;background:var(--accent);color:white;cursor:pointer;font-size:13px;">添加</button></div></div></div>';
    },

    saveNewCharacter: function() {
        var gm = window.GameMemory; var name = document.getElementById('addCharName').value.trim(); if (!name) { alert('请输入角色名称'); return; }
        gm.tables.characters[name] = { name: name, title: document.getElementById('addCharTitle').value.trim(), relation: document.getElementById('addCharRelation').value.trim(), mood: '', location: '', outfit: '', favorability: parseInt(document.getElementById('addCharFav').value) || 0, status: '', history: [], gameTime: gm.getGameTimeStr(), accessCount: 0, lastChangedTurn: gm.currentTurn, locked: false };
        gm.saveToStorage();
        // 同步到gameState
        if (typeof gameState !== 'undefined') {
            if (!gameState.allCharacters) gameState.allCharacters = {};
            gameState.allCharacters[name] = { name: name, title: document.getElementById('addCharTitle').value.trim(), relation: document.getElementById('addCharRelation').value.trim(), favorability: parseInt(document.getElementById('addCharFav').value) || 0 };
        }
        if (typeof GameLinker !== 'undefined') GameLinker.refreshByDataChange('allCharacters');
        this.switchTab('characters');
    },

    renderItems: function(gm) {
        var self = this; var items = Object.values(gm.tables.items);
        var html = '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;"><span>物品追踪</span><button onclick="MemoryManagerUI.addItem()" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--accent);padding:4px 10px;border-radius:6px;cursor:pointer;">+ 添加物品</button></div>';
        if (items.length === 0) html += '<div class="memory-empty-state"><div>暂无物品数据</div></div>';
        else items.forEach(function(item) {
            var rarityColor = { '普通': '#999', '精良': '#34c759', '珍稀': '#007aff', '传说': '#ff9500' }[item.rarity] || '#999';
            html += '<div class="memory-character-card"><div class="memory-character-avatar" style="background:' + self._esc(rarityColor) + '20;color:' + self._esc(rarityColor) + ';">📦</div><div style="flex:1;"><div style="font-weight:600;">' + self._esc(item.name) + '</div><div style="font-size:12px;color:var(--text-secondary);">数量: ' + self._esc(item.qty) + (item.unit ? self._esc(item.unit) : '') + ' | 品质: <span style="color:' + self._esc(rarityColor) + ';">' + self._esc(item.rarity || '普通') + '</span></div>' + (item.desc ? '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">' + self._esc(item.desc) + '</div>' : '') + (item.accessCount ? '<div style="font-size:11px;color:var(--text-tertiary);">提及: ' + item.accessCount + '次</div>' : '') + '</div><div style="display:flex;flex-direction:column;gap:4px;"><button onclick="MemoryManagerUI.editItem(\'' + self._escAttr(item.name) + '\')" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--border);padding:4px 8px;border-radius:6px;cursor:pointer;">编辑</button><button onclick="MemoryManagerUI.deleteItem(\'' + self._escAttr(item.name) + '\')" style="font-size:11px;color:#f44;background:none;border:1px solid var(--border);padding:4px 8px;border-radius:6px;cursor:pointer;">删除</button></div></div>';
        });
        html += '</div>'; return html;
    },

    editItem: function(name) {
        var gm = window.GameMemory; var item = gm.tables.items[name]; if (!item) return;
        document.getElementById('memoryManagerContent').innerHTML = '<div class="memory-card"><div class="memory-card-title">编辑物品: ' + this._esc(name) + '</div><div style="display:flex;flex-direction:column;gap:12px;">'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">名称</label><input id="editItemName" value="' + this._esc(name) + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">数量</label><input id="editItemQty" type="number" value="' + this._esc(item.qty || 1) + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">单位</label><input id="editItemUnit" value="' + this._esc(item.unit || '个') + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">品质</label><select id="editItemRarity" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"><option value="普通"' + (item.rarity === '普通' ? ' selected' : '') + '>普通</option><option value="精良"' + (item.rarity === '精良' ? ' selected' : '') + '>精良</option><option value="珍稀"' + (item.rarity === '珍稀' ? ' selected' : '') + '>珍稀</option><option value="传说"' + (item.rarity === '传说' ? ' selected' : '') + '>传说</option></select></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">描述</label><textarea id="editItemDesc" style="width:100%;min-height:80px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;resize:vertical;outline:none;font-family:inherit;">' + this._esc(item.desc || '') + '</textarea></div>'
            + '<div style="display:flex;gap:8px;justify-content:flex-end;"><button onclick="MemoryManagerUI.switchTab(\'items\')" style="padding:10px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;">取消</button><button onclick="MemoryManagerUI.saveItem(\'' + this._escAttr(name) + '\')" style="padding:10px 20px;border:none;border-radius:8px;background:var(--accent);color:white;cursor:pointer;font-size:13px;">保存</button></div></div></div>';
    },

    saveItem: function(oldName) {
        var gm = window.GameMemory; var newName = document.getElementById('editItemName').value.trim(); if (!newName) return;
        var item = gm.tables.items[oldName] || {}; if (oldName !== newName) delete gm.tables.items[oldName];
        gm.tables.items[newName] = { name: newName, qty: parseInt(document.getElementById('editItemQty').value) || 1, unit: document.getElementById('editItemUnit').value.trim() || '个', rarity: document.getElementById('editItemRarity').value, desc: document.getElementById('editItemDesc').value.trim(), obtainedTurn: item.obtainedTurn || gm.currentTurn, lastChangedTurn: gm.currentTurn, gameTime: gm.getGameTimeStr(), accessCount: item.accessCount || 0, history: item.history || [] };
        gm.saveToStorage();
        // 同步到gameState.currentBag
        if (typeof gameState !== 'undefined' && gameState.currentBag) {
            if (oldName !== newName) gameState.currentBag = gameState.currentBag.filter(function(b) { return b.name !== oldName; });
            var found = false;
            for (var i = 0; i < gameState.currentBag.length; i++) {
                if (gameState.currentBag[i].name === newName) {
                    gameState.currentBag[i].count = parseInt(document.getElementById('editItemQty').value) || 1;
                    gameState.currentBag[i].rarity = document.getElementById('editItemRarity').value;
                    gameState.currentBag[i].desc = document.getElementById('editItemDesc').value.trim();
                    found = true; break;
                }
            }
            if (!found) gameState.currentBag.push({ name: newName, count: parseInt(document.getElementById('editItemQty').value) || 1, desc: document.getElementById('editItemDesc').value.trim(), rarity: document.getElementById('editItemRarity').value });
        }
        if (typeof GameLinker !== 'undefined') GameLinker.refreshByDataChange('currentBag');
        this.switchTab('items');
    },

    deleteItem: function(name) { var gm = window.GameMemory; if (!gm || !gm.tables.items[name]) return; delete gm.tables.items[name]; gm.saveToStorage(); if (typeof gameState !== 'undefined' && gameState.currentBag) { gameState.currentBag = gameState.currentBag.filter(function(b) { return b.name !== name; }); } if (typeof GameLinker !== 'undefined') GameLinker.refreshByDataChange('currentBag'); this.switchTab('items'); UI.toast('物品已删除'); },

    addItem: function() {
        document.getElementById('memoryManagerContent').innerHTML = '<div class="memory-card"><div class="memory-card-title">➕ 添加物品</div><div style="display:flex;flex-direction:column;gap:12px;">'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">名称 *</label><input id="addItemName" placeholder="物品名称" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">数量</label><input id="addItemQty" type="number" value="1" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">单位</label><input id="addItemUnit" value="个" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">品质</label><select id="addItemRarity" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"><option value="普通">普通</option><option value="精良">精良</option><option value="珍稀">珍稀</option><option value="传说">传说</option></select></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">描述</label><textarea id="addItemDesc" placeholder="物品描述..." style="width:100%;min-height:80px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;resize:vertical;outline:none;font-family:inherit;"></textarea></div>'
            + '<div style="display:flex;gap:8px;justify-content:flex-end;"><button onclick="MemoryManagerUI.switchTab(\'items\')" style="padding:10px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;">取消</button><button onclick="MemoryManagerUI.saveNewItem()" style="padding:10px 20px;border:none;border-radius:8px;background:var(--accent);color:white;cursor:pointer;font-size:13px;">添加</button></div></div></div>';
    },

    saveNewItem: function() {
        var gm = window.GameMemory; var name = document.getElementById('addItemName').value.trim(); if (!name) { alert('请输入物品名称'); return; }
        gm.tables.items[name] = { name: name, qty: parseInt(document.getElementById('addItemQty').value) || 1, unit: document.getElementById('addItemUnit').value.trim() || '个', rarity: document.getElementById('addItemRarity').value, desc: document.getElementById('addItemDesc').value.trim(), obtainedTurn: gm.currentTurn, lastChangedTurn: gm.currentTurn, gameTime: gm.getGameTimeStr(), accessCount: 0, history: [{ turn: gm.currentTurn, from: 0, to: parseInt(document.getElementById('addItemQty').value) || 1 }] };
        gm.saveToStorage();
        // 同步到gameState.currentBag
        if (typeof gameState !== 'undefined') {
            if (!gameState.currentBag) gameState.currentBag = [];
            var exists = gameState.currentBag.some(function(b) { return b.name === name; });
            if (!exists) gameState.currentBag.push({ name: name, count: parseInt(document.getElementById('addItemQty').value) || 1, desc: document.getElementById('addItemDesc').value.trim(), rarity: document.getElementById('addItemRarity').value });
        }
        if (typeof GameLinker !== 'undefined') GameLinker.refreshByDataChange('currentBag');
        this.switchTab('items');
    },

    renderLocations: function(gm) {
        var self = this; var locs = Object.values(gm.tables.locations);
        var html = '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;"><span>地点记录</span><button onclick="MemoryManagerUI.addLocation()" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--accent);padding:4px 10px;border-radius:6px;cursor:pointer;">+ 添加地点</button></div>';
        if (locs.length === 0) html += '<div class="memory-empty-state"><div>暂无地点数据</div></div>';
        else locs.forEach(function(loc) {
            html += '<div style="padding:12px;background:var(--bg);border-radius:8px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;"><div style="flex:1;"><div style="font-weight:600;">' + self._esc(loc.name) + (loc.locked ? ' 🔒' : '') + '</div>' + (loc.desc ? '<div style="font-size:12px;color:var(--text-secondary);">' + self._esc(loc.desc) + '</div>' : '') + (loc.features ? '<div style="font-size:11px;color:var(--text-tertiary);">特征: ' + self._esc(loc.features) + '</div>' : '') + (loc.sceneState ? '<div style="font-size:11px;color:#ff9500;">场景: ' + self._esc(loc.sceneState) + (loc.locked ? ' [锁定]' : '') + '</div>' : '') + (loc.accessCount ? '<div style="font-size:11px;color:var(--text-tertiary);">提及: ' + loc.accessCount + '次</div>' : '') + '</div><div style="display:flex;gap:4px;"><button onclick="MemoryManagerUI.editLocation(\'' + self._escAttr(loc.name) + '\')" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--border);padding:4px 8px;border-radius:6px;cursor:pointer;">编辑</button><button onclick="MemoryManagerUI.deleteLocation(\'' + self._escAttr(loc.name) + '\')" style="font-size:11px;color:#f44;background:none;border:1px solid var(--border);padding:4px 8px;border-radius:6px;cursor:pointer;">删除</button></div></div>';
        });
        html += '</div>'; return html;
    },

    editLocation: function(name) {
        var gm = window.GameMemory; var loc = gm.tables.locations[name]; if (!loc) return;
        document.getElementById('memoryManagerContent').innerHTML = '<div class="memory-card"><div class="memory-card-title">编辑地点</div><div style="display:flex;flex-direction:column;gap:12px;">'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">名称</label><input id="editLocName" value="' + this._esc(name) + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">描述</label><textarea id="editLocDesc" style="width:100%;min-height:80px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;resize:vertical;outline:none;font-family:inherit;">' + this._esc(loc.desc || '') + '</textarea></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">特征</label><input id="editLocFeatures" value="' + this._esc(loc.features || '') + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">锁定场景</label><input id="editLocLocked" type="checkbox"' + (loc.locked ? ' checked' : '') + ' style="width:auto;"></div>'
            + '<div style="display:flex;gap:8px;justify-content:flex-end;"><button onclick="MemoryManagerUI.switchTab(\'locations\')" style="padding:10px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;">取消</button><button onclick="MemoryManagerUI.saveLocation(\'' + this._escAttr(name) + '\')" style="padding:10px 20px;border:none;border-radius:8px;background:var(--accent);color:white;cursor:pointer;font-size:13px;">保存</button></div></div></div>';
    },

    saveLocation: function(oldName) {
        var gm = window.GameMemory; var newName = document.getElementById('editLocName').value.trim(); if (!newName) { alert('请输入地点名称'); return; }
        var loc = gm.tables.locations[oldName]; if (!loc) return; if (newName !== oldName) delete gm.tables.locations[oldName];
        gm.tables.locations[newName] = { name: newName, desc: document.getElementById('editLocDesc').value.trim(), features: document.getElementById('editLocFeatures').value.trim(), charactersPresent: loc.charactersPresent || '', lastChangedTurn: gm.currentTurn, locked: document.getElementById('editLocLocked').checked };
        gm.saveToStorage(); if (typeof GameLinker !== 'undefined') GameLinker.refreshByDataChange('worldSnapshot'); this.switchTab('locations');
    },

    deleteLocation: function(name) { var gm = window.GameMemory; if (!gm || !gm.tables.locations[name]) return; delete gm.tables.locations[name]; gm.saveToStorage(); if (typeof GameLinker !== 'undefined') GameLinker.refreshByDataChange('worldSnapshot'); this.switchTab('locations'); UI.toast('地点已删除'); },

    addLocation: function() {
        document.getElementById('memoryManagerContent').innerHTML = '<div class="memory-card"><div class="memory-card-title">➕ 添加地点</div><div style="display:flex;flex-direction:column;gap:12px;">'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">名称 *</label><input id="addLocName" placeholder="地点名称" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">描述</label><textarea id="addLocDesc" placeholder="地点描述..." style="width:100%;min-height:80px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;resize:vertical;outline:none;font-family:inherit;"></textarea></div>'
            + '<div style="display:flex;gap:8px;justify-content:flex-end;"><button onclick="MemoryManagerUI.switchTab(\'locations\')" style="padding:10px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;">取消</button><button onclick="MemoryManagerUI.saveNewLocation()" style="padding:10px 20px;border:none;border-radius:8px;background:var(--accent);color:white;cursor:pointer;font-size:13px;">添加</button></div></div></div>';
    },

    saveNewLocation: function() {
        var gm = window.GameMemory; var name = document.getElementById('addLocName').value.trim(); if (!name) { alert('请输入地点名称'); return; }
        gm.tables.locations[name] = { name: name, desc: document.getElementById('addLocDesc').value.trim(), features: '', charactersPresent: '', lastChangedTurn: gm.currentTurn, locked: false };
        gm.saveToStorage(); if (typeof GameLinker !== 'undefined') GameLinker.refreshByDataChange('worldSnapshot'); this.switchTab('locations');
    },

    renderRelationships: function(gm) {
        var self = this; var rels = Object.values(gm.tables.relationships);
        var html = '<div class="memory-card"><div class="memory-card-title">关系网</div>';
        if (rels.length === 0) html += '<div class="memory-empty-state"><div>暂无关系数据</div></div>';
        else rels.forEach(function(rel) { html += '<div style="padding:10px;background:var(--bg);border-radius:8px;margin-bottom:6px;"><div style="font-weight:600;">' + self._esc(rel.from) + ' → ' + self._esc(rel.to) + '</div><div style="font-size:12px;color:var(--text-secondary);">' + self._esc(rel.type || '') + (rel.desc ? ' - ' + self._esc(rel.desc) : '') + '</div></div>'; });
        html += '</div>'; return html;
    },

    renderPlot: function(gm) {
        var self = this;
        var html = '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;"><span>剧情大纲</span><button onclick="MemoryManagerUI.editPlot()" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--accent);padding:4px 10px;border-radius:6px;cursor:pointer;">编辑</button></div>';
        if (gm.plot.worldSetting) html += '<div style="margin-bottom:12px;"><div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">世界观</div><div style="padding:12px;background:var(--bg);border-radius:8px;white-space:pre-wrap;line-height:1.6;">' + self._esc(gm.plot.worldSetting) + '</div></div>';
        if (gm.plot.chapters.length > 0) { html += '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">章节</div>'; gm.plot.chapters.forEach(function(ch) { html += '<div style="padding:10px;background:var(--bg);border-radius:8px;margin-bottom:6px;"><div style="font-weight:600;">' + self._esc(ch.title) + ' <span style="font-size:11px;color:var(--text-tertiary);">回合 ' + ch.startTurn + '-' + ch.endTurn + '</span></div><div style="font-size:12px;color:var(--text-secondary);white-space:pre-wrap;">' + self._esc(ch.summary) + '</div></div>'; }); }
        if (gm.plot.currentChapter) html += '<div style="margin-top:12px;"><div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">当前进展</div><div style="padding:12px;background:var(--bg);border-radius:8px;white-space:pre-wrap;line-height:1.6;max-height:200px;overflow-y:auto;">' + self._esc(gm.plot.currentChapter) + '</div></div>';
        if (gm.plot.pendingMysteries && gm.plot.pendingMysteries.length > 0) { html += '<div style="margin-top:12px;"><div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">待解决悬念</div>'; gm.plot.pendingMysteries.forEach(function(m) { html += '<div style="padding:6px 10px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;">• ' + self._esc(m) + '</div>'; }); html += '</div>'; }
        html += '</div>'; return html;
    },

    editPlot: function() {
        var gm = window.GameMemory;
        document.getElementById('memoryManagerContent').innerHTML = '<div class="memory-card"><div class="memory-card-title">编辑剧情大纲</div><div style="display:flex;flex-direction:column;gap:12px;">'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">世界观</label><textarea id="editPlotWorld" style="width:100%;min-height:100px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;resize:vertical;outline:none;font-family:inherit;">' + this._esc(gm.plot.worldSetting || '') + '</textarea></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">当前进展</label><textarea id="editPlotCurrent" style="width:100%;min-height:150px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;resize:vertical;outline:none;font-family:inherit;">' + this._esc(gm.plot.currentChapter || '') + '</textarea></div>'
            + '<div style="display:flex;gap:8px;justify-content:flex-end;"><button onclick="MemoryManagerUI.switchTab(\'plot\')" style="padding:10px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;">取消</button><button onclick="MemoryManagerUI.savePlot()" style="padding:10px 20px;border:none;border-radius:8px;background:var(--accent);color:white;cursor:pointer;font-size:13px;">保存</button></div></div></div>';
    },

    savePlot: function() { var gm = window.GameMemory; gm.plot.worldSetting = document.getElementById('editPlotWorld').value.trim(); gm.plot.currentChapter = document.getElementById('editPlotCurrent').value.trim(); gm.saveToStorage(); if (typeof gameState !== 'undefined') { gameState.rollingSummary = (gm.plot.worldSetting || '') + '\n' + (gm.plot.currentChapter || ''); } if (typeof GameLinker !== 'undefined') GameLinker.refreshByDataChange('rollingSummary'); this.switchTab('plot'); },

    renderEvents: function(gm) {
        var self = this; var events = gm.events.slice(-20).reverse();
        var html = '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;"><span>重要事件</span><button onclick="MemoryManagerUI.addEvent()" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--accent);padding:4px 10px;border-radius:6px;cursor:pointer;">+ 添加事件</button></div>';
        if (events.length === 0) html += '<div class="memory-empty-state"><div>暂无重要事件</div></div>';
        else events.forEach(function(event, idx) {
            var realIdx = gm.events.length - 1 - idx; var imp = event.importance || 5;
            var icon = imp >= 9 ? '🔴' : (imp >= 7 ? '🟡' : '🟢');
            html += '<div class="memory-event-item" style="display:flex;align-items:flex-start;gap:8px;"><div style="flex:1;"><div style="font-weight:600;margin-bottom:4px;">' + icon + ' ' + self._esc(event.content) + '</div><div style="font-size:11px;color:var(--text-tertiary);">第' + self._esc(event.turn) + '回合 | ' + self._esc(event.gameTime || '') + (event.gameTime ? ' (' + self._esc(gm._calculateRelativeTime(event.gameTime)) + ')' : '') + ' | 重要度: ' + self._esc(imp) + '/10' + (event.accessCount ? ' | 提及' + event.accessCount + '次' : '') + '</div></div><button onclick="MemoryManagerUI.deleteEvent(' + realIdx + ')" style="font-size:11px;color:#f44;background:none;border:1px solid var(--border);padding:4px 8px;border-radius:6px;cursor:pointer;">删除</button></div>';
        });
        html += '</div>'; return html;
    },

    addEvent: function() {
        document.getElementById('memoryManagerContent').innerHTML = '<div class="memory-card"><div class="memory-card-title">➕ 添加事件</div><div style="display:flex;flex-direction:column;gap:12px;">'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">事件内容 *</label><textarea id="addEventContent" placeholder="描述发生了什么..." style="width:100%;min-height:100px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;resize:vertical;outline:none;font-family:inherit;"></textarea></div>'
            + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">重要度 (1-10)</label><input id="addEventImportance" type="number" min="1" max="10" value="5" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>'
            + '<div style="display:flex;gap:8px;justify-content:flex-end;"><button onclick="MemoryManagerUI.switchTab(\'events\')" style="padding:10px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;">取消</button><button onclick="MemoryManagerUI.saveNewEvent()" style="padding:10px 20px;border:none;border-radius:8px;background:var(--accent);color:white;cursor:pointer;font-size:13px;">添加</button></div></div></div>';
    },

    saveNewEvent: function() {
        var gm = window.GameMemory; var content = document.getElementById('addEventContent').value.trim(); if (!content) { alert('请输入事件内容'); return; }
        gm.events.push({ content: content, turn: gm.currentTurn, gameTime: gm.getGameTimeStr(), importance: parseInt(document.getElementById('addEventImportance').value) || 5, decayScore: parseInt(document.getElementById('addEventImportance').value) || 5 });
        if (gm.events.length > 50) gm.events = gm.events.slice(-50); gm.saveToStorage();
        // 同步到gameState.keyEvents
        if (typeof gameState !== 'undefined') {
            if (!gameState.keyEvents) gameState.keyEvents = [];
            if (gameState.keyEvents.indexOf(content) === -1) { gameState.keyEvents.push(content); if (gameState.keyEvents.length > 30) gameState.keyEvents = gameState.keyEvents.slice(-30); }
        }
        if (typeof GameLinker !== 'undefined') GameLinker.refreshByDataChange('keyEvents');
        this.switchTab('events');
    },

    deleteEvent: function(index) { var gm = window.GameMemory; if (!gm || !gm.events[index]) return; var evtContent = gm.events[index] ? gm.events[index].content : ''; gm.events.splice(index, 1); gm.saveToStorage(); if (typeof gameState !== 'undefined' && gameState.keyEvents && evtContent) { var idx = gameState.keyEvents.indexOf(evtContent); if (idx >= 0) gameState.keyEvents.splice(idx, 1); } if (typeof GameLinker !== 'undefined') GameLinker.refreshByDataChange('keyEvents'); this.switchTab('events'); UI.toast('事件已删除'); },

    renderQuests: function(gm) {
        var self = this; var quests = gm.quests || [];
        var pending = quests.filter(function(q) { return q.status === 'pending'; });
        var resolved = quests.filter(function(q) { return q.status === 'resolved'; });
        var typeIcons = { promise: '🤝', quest: '📜', threat: '⚠️', mystery: '❓' };
        var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><div style="font-size:13px;color:var(--text-tertiary);">' + pending.length + ' 进行中 | ' + resolved.length + ' 已完成</div></div>';
        if (pending.length > 0) {
            html += '<div class="memory-card"><div class="memory-card-title">进行中</div>';
            pending.forEach(function(q, i) {
                var icon = typeIcons[q.type] || '📜'; var age = gm.currentTurn - (q.createdTurn || 0);
                var staleWarn = q.stale || age > 30 ? '<span style="color:#f44;font-size:11px;margin-left:6px;">[长期未兑现]</span>' : '';
                html += '<div style="padding:10px;background:var(--bg);border-radius:8px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;"><div style="flex:1;"><div style="font-weight:600;">' + icon + ' ' + self._esc(q.content) + staleWarn + '</div><div style="font-size:11px;color:var(--text-tertiary);">创建于第' + self._esc(q.createdTurn || 0) + '回合</div></div><button onclick="MemoryManagerUI.resolveQuestByIndex(' + quests.indexOf(q) + ')" style="font-size:11px;color:#4a4;background:none;border:1px solid var(--border);padding:4px 8px;border-radius:6px;cursor:pointer;">完成</button></div>';
            });
            html += '</div>';
        }
        if (resolved.length > 0) {
            html += '<div class="memory-card"><div class="memory-card-title">已完成</div>';
            resolved.slice(-5).forEach(function(q) {
                var icon = typeIcons[q.type] || '📜';
                html += '<div style="padding:8px 10px;background:var(--bg);border-radius:6px;margin-bottom:4px;opacity:0.6;"><div style="font-size:13px;">✅ ' + icon + ' ' + self._esc(q.content) + '</div></div>';
            });
            html += '</div>';
        }
        if (quests.length === 0) html += '<div class="memory-empty-state"><div>暂无约定/任务</div></div>';
        return html;
    },

    resolveQuestByIndex: function(idx) {
        var gm = window.GameMemory; if (!gm || !gm.quests[idx]) return;
        gm.quests[idx].status = 'resolved'; gm.quests[idx].resolvedTurn = gm.currentTurn; gm.saveToStorage();
        // 同步到gameState.currentQuests
        if (typeof gameState !== 'undefined' && gameState.currentQuests && gm.quests[idx].content) {
            var questContent = gm.quests[idx].content;
            for (var i = 0; i < gameState.currentQuests.length; i++) {
                if (gameState.currentQuests[i].title && gameState.currentQuests[i].title.indexOf(questContent.substring(0, 10)) >= 0) {
                    gameState.currentQuests[i].status = '已完成'; break;
                }
            }
        }
        if (typeof GameLinker !== 'undefined') GameLinker.refreshByDataChange('currentQuests');
        this.switchTab('quests'); UI.toast('约定已完成');
    },

    renderTimeline: function(gm) {
        var self = this; var tl = gm.timeline.slice(-20).reverse();
        var html = '<div class="memory-card"><div class="memory-card-title">时间线</div>';
        if (tl.length === 0) html += '<div class="memory-empty-state"><div>暂无时间线数据</div></div>';
        else tl.forEach(function(t) { html += '<div style="padding:8px 10px;background:var(--bg);border-radius:6px;margin-bottom:4px;display:flex;gap:10px;align-items:center;"><div style="font-size:11px;color:var(--text-tertiary);white-space:nowrap;">第' + self._esc(t.turn) + '回合</div><div style="font-size:11px;color:var(--accent);white-space:nowrap;">' + self._esc(t.gameTime || '') + '</div><div style="font-size:13px;flex:1;">' + self._esc(t.summary || '') + '</div></div>'; });
        html += '</div>'; return html;
    },

    renderInjectionPreview: function(gm) {
        var self = this;
        var injection = gm.buildInjection();
        var stats = gm._lastInjectionStats || {};
        var html = '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;"><span>注入预览</span><button onclick="MemoryManagerUI.refreshInjection()" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--accent);padding:4px 10px;border-radius:6px;cursor:pointer;">🔄 刷新</button></div>'
            + '<div style="padding:12px;background:var(--bg);border-radius:8px;margin-bottom:12px;"><div style="font-size:11px;color:var(--text-secondary);">总字符: ' + (stats.totalChars || 0) + ' / 预算: ' + (stats.budget || 0) + '</div>'
            + (stats.skippedModules && stats.skippedModules.length > 0 ? '<div style="font-size:11px;color:#ff9500;margin-top:4px;">变化驱动跳过: ' + stats.skippedModules.join(', ') + ' (无变化，零Token)</div>' : '')
            + '</div>'
            + '<div style="padding:12px;background:var(--bg);border-radius:8px;white-space:pre-wrap;font-size:13px;line-height:1.6;max-height:400px;overflow-y:auto;font-family:monospace;">' + self._esc(injection) + '</div></div>';
        return html;
    },

    refreshInjection: function() { this.switchTab('injection'); },

    renderSearch: function(gm) {
        var self = this;
        return '<div class="memory-card"><div class="memory-card-title">搜索记忆</div><div style="display:flex;gap:8px;margin-bottom:12px;"><input id="memorySearchInput" placeholder="输入关键词搜索..." style="flex:1;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"><button onclick="MemoryManagerUI.doSearch()" style="padding:10px 16px;border:none;border-radius:8px;background:var(--accent);color:white;cursor:pointer;font-size:13px;">搜索</button></div><div id="memorySearchResults"></div></div>';
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
        if (results.events.length > 0) { html += '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">事件 (' + results.events.length + ')</div>'; results.events.forEach(function(e) { html += '<div style="padding:8px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;">' + self._esc(e.content) + '</div>'; }); }
        if (results.characters.length > 0) { html += '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;margin-top:8px;">角色 (' + results.characters.length + ')</div>'; results.characters.forEach(function(c) { html += '<div style="padding:8px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;">' + self._esc(c.name) + (c.relation ? ' - ' + self._esc(c.relation) : '') + '</div>'; }); }
        if (results.items.length > 0) { html += '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;margin-top:8px;">物品 (' + results.items.length + ')</div>'; results.items.forEach(function(it) { html += '<div style="padding:8px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;">' + self._esc(it.name) + ' x' + self._esc(it.qty) + '</div>'; }); }
        if (results.summaries.length > 0) { html += '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;margin-top:8px;">摘要 (' + results.summaries.length + ')</div>'; results.summaries.forEach(function(s) { html += '<div style="padding:8px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;">' + self._esc(s) + '</div>'; }); }
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
            safeSetItem('fs_global_vars', JSON.stringify(d));
            } catch (e) { /* silent */ }
        },
    loadGlobal() {
        try {
            const d = JSON.parse(localStorage.getItem('fs_global_vars') || '{}');
            Object.entries(d).forEach(([k, v]) => this.global.set(k, v));
            } catch (e) { /* silent */ }
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
            const content = p.parsedContent || p.content;
            if (!content || !content.trim()) return;
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

    // ── 构建增强Prompt（发送到API前调用） ──
    buildEnhancedPrompt(userMessage) {
        if (!this.currentPreset) return this._buildDefaultPrompt();

        this.updateContext({ lastUserMessage: userMessage });

        const result = this.engine.processPreset(this.currentPreset, {
            user: this.engine.templates.context.user,
            char: this.engine.templates.context.char,
            lastUserMessage: userMessage,
            chatHistory: this.chatHistory,
            character: this.currentCharacter,
            scenario: this.currentCharacter?.scenario || '',
            personality: this.currentCharacter?.personality || ''
            });

        return result.messages;
    },

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

    // ── Markdown渲染后处理（美化正则） ──
    processMarkdown(text) {
        if (!text || !this.currentPreset) return text;

        const scripts = this.currentPreset.regexScripts || [];
        if (!scripts.length) return text;

        // 只应用 markdownOnly=true 且 promptOnly=false 的正则（美化类）
        return this.engine.regex.execute(text, scripts, {
            messageDepth: this._messageDepth,
            isPrompt: false,
            isMarkdown: true
            });
    },

    // ── 聊天历史管理 ──
    addToHistory(role, content) {
        this.chatHistory.push({ role, content });
        if (role === 'user') this._messageDepth++;
        if (this.chatHistory.length > 50) this.chatHistory = this.chatHistory.slice(-50);
        this.updateContext({ chatHistory: this.chatHistory });
    },
    clearHistory() {
        this.chatHistory = [];
        this._messageDepth = 0;
        this.updateContext({ chatHistory: [] });
    },

    // ── 默认Prompt ──
    _buildDefaultPrompt() {
        const messages = [];
        if (this.currentCharacter) {
            messages.push({
                role: 'system',
                content: `你是${this.currentCharacter.name}。${this.currentCharacter.description || ''}`
                });
        }
    return messages;
    },

    // ── 外部API ──
    getVariable(name, scope = 'local') { return this.engine.getVar(name, scope); },
    setVariable(name, value, scope = 'local') { this.engine.setVar(name, value, scope); },
    parse(text) { return this.engine.parser.parse(text, { context: this.engine.templates.context }); },

    /**
    * 获取预设中的快速切换配置
    */
    getQuickSwitchProfiles() {
        if (!this.currentPreset?.tavernHelperScripts) return [];
        const helper = this.currentPreset.tavernHelperScripts[0];
        if (!helper?.data?.presets) return {};
        return helper.data.presets;
    },

    /**
    * 获取预设中的命令列表
    */
    getCommands() {
        if (!this.currentPreset?.tavernHelperScripts) return [];
        const helper = this.currentPreset.tavernHelperScripts[0];
        return helper?.data?.default?.commands || {};
    },

    /**
    * 应用快速切换配置
    */
    applyQuickSwitchProfile(profileId) {
        const profiles = this.getQuickSwitchProfiles();
        const profile = profiles[profileId];
        if (!profile?.promptStates) return false;

        const prompts = this.currentPreset.prompts || [];
        profile.promptStates.forEach(state => {
            const prompt = prompts.find(p => p.identifier === state.promptId);
            if (prompt) {
                prompt.enabled = state.afterEnabled !== false;
            }
        });

    console.log('[GameAdapter] 已应用快速切换配置:', profile.name);
    return true;
    }
    };

    // ============================================================================
    // 增强的API构建器 v2.0
    // ============================================================================
    var EnhancedAPIBuilder = {
    buildRequest(messages, params = {}) {
        return {
            messages,
            temperature: 1.3,
            top_p: 0.91,
            top_k: 64,
            frequency_penalty: 0,
            presence_penalty: 0,
            max_tokens: 3000,
            ...params
            };
    },
    estimateTokens(messages) {
        let total = 0;
        messages.forEach(msg => {
            const c = msg.content || '';
            const cn = (c.match(/[\u4e00-\u9fa5]/g) || []).length;
            const other = c.length - cn;
            total += Math.ceil(cn / 1.5) + Math.ceil(other / 4);
            });
        return total;
    }
    };

    // ============================================================================
    // 导出
    // ============================================================================
    global.GameAdapter = GameAdapter;
    global.EnhancedAPIBuilder = EnhancedAPIBuilder;
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
    // 月读预设配置
    // ============================================================================
    var MoonReadPresetConfig = {
    name: "【月读】Gemini v1.2 @电波系",
    version: "1.2",
    author: "电波系",

    /**
    * 必须开启的正则脚本
    */
    requiredRegex: [
    "月读必开-[1]清除多余内容",
    "月读必开-[2]6楼外只发送摘要",
    "月读必开-[3]10楼外角色关系、绝密档案、伏笔不发送",
    "月读必开-[4]极光小剧场修正vh",
    "月读必开-[5]不发送多余内容"
    ],

    /**
    * 推荐开启的正则脚本
    */
    recommendedRegex: [
    "月读选开-捕获用户输入",
    "月读选开-不发送以前的用户输入",
    "月读选开-统一折叠样式"
    ],

    /**
    * 美化类正则（markdownOnly）
    */
    beautyRegex: [
    "月读美化-现代文字标题",
    "月读美化-古风文字标题",
    "月读美化-ta的物品|默认版",
    "月读美化-ta的手机|默认版",
    "月读美化-叽喳论坛|默认版",
    "月读美化-文字剧场|默认版",
    "月读美化-摘要美化|默认版",
    "月读美化-选项美化|默认版"
    ],

    /**
    * 必须开启的Prompt条目
    */
    requiredPrompts: [
    { identifier: "main", name: "🌙静谧之夜" },
    { identifier: "nsfw", name: "🌌无限月读" },
    { identifier: "ccb29029-f8b4-43a5-8dd7-433fc42e01a8", name: "==.✟.世界引擎.✟.==" },
    { identifier: "6af0bf14-7519-4fe0-b9ff-064d928814ff", name: "📜获取变量" },
    { identifier: "worldInfoBefore", name: "worldInfoBefore" },
    { identifier: "worldInfoAfter", name: "worldInfoAfter" },
    { identifier: "charDescription", name: "charDescription" },
    { identifier: "charPersonality", name: "charPersonality" },
    { identifier: "scenario", name: "scenario" },
    { identifier: "dialogueExamples", name: "dialogueExamples" },
    { identifier: "chatHistory", name: "chatHistory" }
    ],

    /**
    * 叙事视角（多选一）
    */
    perspectives: [
    { id: "third_person_omniscient", name: "第三人称全知", desc: "可在出场人物视角间切换" },
    { id: "third_person_limited", name: "第三人称有限", desc: "以char视角叙事" },
    { id: "first_person_limited", name: "第一人称有限", desc: "以角色的\u201c我\u201d叙事" }
    ],

    /**
    * 用户代称（多选一）
    */
    userPronouns: [
    { id: "third_person", name: "第三人称", desc: "使用他/她/姓名" },
    { id: "second_person", name: "第二人称", desc: "使用\u201c你\u201d" },
    { id: "first_person", name: "第一人称", desc: "使用\u201c我\u201d" }
    ],

    /**
    * 推进节奏（多选一）
    */
    pacing: [
    { id: "4d9ce617", name: "🌊慢火浸润", desc: "极度细腻" },
    { id: "ddafe1ba", name: "🌊稳态推进", desc: "均衡（推荐）" },
    { id: "617bac07", name: "🌊均衡脉冲", desc: "中等节奏" },
    { id: "fe598bd2", name: "🌊高压疾行", desc: "快速推进" },
    { id: "cb91db4c", name: "🌊自由变奏", desc: "自动调节" }
    ],

    /**
    * 推荐参数
    */
    recommendedParams: {
        temperature: 1.0,
        top_p: 0.95,
        top_k: 64,
        frequency_penalty: 0,
        presence_penalty: 0,
        max_tokens: 8192
    }
    };

    // ============================================================================
    // 果实预设配置（保留v1）
    // ============================================================================
    var FruitPresetConfig = {
    name: "【MoM】果实·叶子版3.0",
    version: "3.0",
    recommendedParams: {
        temperature: 1.3,
        top_p: 0.91,
        top_k: 64,
        frequency_penalty: 0,
        presence_penalty: 0,
        max_tokens: 3000
    }
    };

    // ============================================================================
    // 蛾摩拉预设配置
    // ============================================================================
    var GomorrahPresetConfig = {
    name: "[MoM]蛾摩拉☼2.4",
    version: "2.4",
    author: "蛾摩拉与弥赛亚",

    requiredRegex: [
    "MoM必选-[1]清除多余内容",
    "MoM必选-[2]摘要处理",
    "MoM必选-[3]seeds处理",
    "MoM必选-[4]格式过滤"
    ],

    beautyRegex: [
    "蛾摩拉说-日间",
    "蛾摩拉说-夜间",
    "蛾摩拉-小说标题",
    "蛾摩拉-日程表",
    "蛾摩拉-其他"
    ],

    requiredPrompts: [
    { identifier: "main", name: "身份定义3" },
    { identifier: "jailbreak", name: "---❉---" },
    { identifier: "nsfw", name: "☚长篇剧情规范" },
    { identifier: "worldInfoBefore", name: "✪角色定义之前" },
    { identifier: "worldInfoAfter", name: "✪角色定义之后" },
    { identifier: "charDescription", name: "♚<char>设定" },
    { identifier: "charPersonality", name: "♚<char>个性" },
    { identifier: "scenario", name: "🔹是Gemini🔸是Claude" },
    { identifier: "chatHistory", name: "Chat History" },
    { identifier: "dialogueExamples", name: "Chat Examples" },
    { identifier: "personaDescription", name: "♔<user>设定" }
    ],

    recommendedParams: {
        temperature: 1.71,
        top_p: 0.9,
        top_k: 0,
        frequency_penalty: 0,
        presence_penalty: 0,
        max_tokens: 30000
    }
    };

    // ============================================================================
    // 通用预设管理器
    // ============================================================================
    var PresetConfigManager = {
configs: {
moonread: MoonReadPresetConfig,
fruit: FruitPresetConfig,
gomorrah: GomorrahPresetConfig
},

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
 * 获取预设配置
 */
getConfig(presetType) {
return this.configs[presetType] || null;
},

/**
 * 获取推荐参数
 */
getRecommendedParams(presetType) {
const config = this.getConfig(presetType);
return config?.recommendedParams || {
    temperature: 1.2,
    top_p: 0.9,
    top_k: 64,
    max_tokens: 4000
};
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
    global.MoonReadPresetConfig = MoonReadPresetConfig;
    global.FruitPresetConfig = FruitPresetConfig;
    global.GomorrahPresetConfig = GomorrahPresetConfig;

})(window);
