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
        if (gameState && gameState.conversationHistory) {
            chat = gameState.conversationHistory.map(function(msg, idx) {
                return {
                    mes: msg.content || msg.text || '',
                    name: msg.role === 'user' ? (gameState.playerName || '玩家') : (msg.name || '角色'),
                    is_user: msg.role === 'user',
                    is_system: msg.role === 'system',
                    send_date: msg.timestamp || Date.now(),
                    extra: msg.extra || {},
                    index: idx
};
        });
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
 * 顶级记忆系统 - 方案C完整实现
 * Enhanced Memory System - Tier C Implementation
 * ========================================
 * 
 * 核心特性：
 * 1. 三层记忆架构（工作记忆/短期记忆/长期记忆）
 * 2. 时间感知系统（绝对时间戳 + 相对时间计算）
 * 3. 智能摘要系统（自动识别重要消息 + 分层压缩）
 * 4. 结构化表格（角色表/物品表/地点表/时间表）
 * 5. 记忆检索系统（搜索 + 筛选 + 关联查询）
 * 6. 变化驱动注入（只发送变化的部分，节省Token）
 */

// ========================================
// 顶级记忆系统
// ========================================
var EnhancedMemory = {
    
    // ========================================
    // 1. 三层记忆存储
    // ========================================
    
    // 工作记忆：当前对话上下文（最近3回合）
    workingMemory: {
        messages: [],
        summaries: [],
        timestamp: null
    },
    
    // 短期记忆：最近10回合的详细记录
    shortTermMemory: {
        summaries: [],
        events: [],
        maxRounds: 10
    },
    
    // 长期记忆：重要事件 + 结构化表格
    longTermMemory: {
        // === 分层剧情大纲（替代纯文本 masterSummary）===
        // 世界观/开场设定：永久保留，不截断
        worldSetting: '',
        // 主线剧情：按章节分段，保留最近N章 + 第一章
        mainPlot: [],
        // 当前章节详细摘要
        currentChapterSummary: '',
        // 兼容旧存档
        masterSummary: '',
        importantEvents: [],         // 重要事件列表（按 importance 排序）
        characterTable: {},          // 角色状态表
        itemTable: {},               // 物品追踪表
        locationTable: {},           // 地点记录表
        timeline: [],                // 时间线
        relationships: {},            // 关系网
        worldNotes: [],              // 世界观设定
        // === 永久事实区（永不压缩、永远注入）===
        worldAnchors: [],
        // === 进行中的约定 ===
        activeQuests: []
    },

    // ========================================
    // 1.1 记忆注入预算配置（核心防膨胀机制）
    // ========================================
    injectionBudget: {
        // 总字符预算（约等于 token 上限的 60%，留余量给对话历史）
        // 按模型上下文自适应：8K模型约4000字，16K约8000字，32K约12000字
        maxChars: 4000,
        // 各模块最小保证预算（即使超总预算也至少保留这些）
        minBudget: {
            worldAnchors: 600,      // 永久事实必须保留
            activeQuests: 200,      // 进行中的约定
            currentPlot: 400,       // 当前章节 + 近期主线
            characters: 400,        // 角色状态
            events: 300,            // 重要事件
            items: 150,             // 持有物品
            workingMemory: 400      // 最近对话
        },
        // 各模块理想预算（优先满足，剩余再分配）
        idealBudget: {
            worldAnchors: 800,
            activeQuests: 300,
            currentPlot: 600,
            characters: 600,
            events: 500,
            items: 200,
            workingMemory: 600
        }
    },
    
    // 记忆统计
    stats: {
        totalMessages: 0,
        totalSummaries: 0,
        lastUpdateTime: null,
        tokenSaved: 0
    },
    // 压缩配置
    compressionConfig: {
        triggerThreshold: 0.8,
        minMessages: 20,
        cooldownMinutes: 5,
        keepRecentMessages: 10,
        incrementalUpdate: true,
        autoTrigger: true
    },
    // 摘要历史版本（最多10个）
    summaryHistory: [],
    currentSummaryIndex: -1,
    
    // ========================================
    // 2. 初始化
    // ========================================

    init: function() {
        this.loadFromStorage();
        this.startAutoSave();
        return this;
    },

    // ========================================
    // 1.5 永久事实 & 约定系统（核心反"AI 遗忘"机制）
    // ========================================

    /**
     * 承诺/约定关键词识别（重要性 10）
     * 命中后自动进 worldAnchors（永久区）和 activeQuests（待办区）
     */
    PROMISE_KEYWORDS: [
        // 承诺
        /我(答应|承诺|发誓|保证|担保|立誓|发誓|向你)/g,
        /(答应|承诺|发誓|保证|担保|立誓)你/g,
        /我(一定|必定|决|定要|绝不|无论如何|无论如何都|誓死)([一-龥]{0,8})/g,
        /(我们|你我)(约定|说定|一言为定|一言为定|一言)/g,
        /我(不会|不能|永不|决不)(让|允许|让.{0,4}受伤|让.{0,4}死|让.{0,4}受到)/g,
        // 玩家接受的任务
        /我(接|领)了?这个?(任务|委托|请求)/g,
        // 复仇/未解
        /我(一定要|必须|迟早会)([一-龥]{1,8}(报仇|血债|偿命|复仇))/g
    ],

    /**
     * 重要事件关键词权重（用于评分）
     */
    HIGH_IMPORTANCE_KEYWORDS: [
        /死|亡|牺牲|陨落|献祭/g,         // 9
        /背叛|决裂|反目|断绝/g,             // 9
        /婚礼|结拜|拜师|收徒|入赘/g,        // 8
        /突破|渡劫|飞升|成仙/g,              // 8
        /获得|得到|夺得|继承|传承/g,         // 8
        /失去|丢失|被盗|被夺/g,              // 8
        /告白|表白|拒绝|接受/g,              // 8
        /决战|生死|搏斗|战斗|死斗/g          // 7
    ],

    /**
     * 从一段文本中提取承诺，返回匹配的承诺数组
     */
    extractPromisesFromText: function(text) {
        if (!text || typeof text !== 'string') return [];
        var promises = [];
        var seen = {};
        for (var i = 0; i < this.PROMISE_KEYWORDS.length; i++) {
            var re = this.PROMISE_KEYWORDS[i];
            // 每次用 new 避免 lastIndex 残留
            var localRe = new RegExp(re.source, 'g');
            var m;
            while ((m = localRe.exec(text)) !== null) {
                var idx = m.index;
                // 取前后各 25 字作为上下文
                var start = Math.max(0, idx - 15);
                var end = Math.min(text.length, idx + m[0].length + 25);
                var context = text.substring(start, end).replace(/\s+/g, ' ').trim();
                // 去重：以 m[0] + 中心 5 字为 key
                var center = text.substring(idx, idx + m[0].length);
                var key = center;
                if (!seen[key]) {
                    seen[key] = true;
                    promises.push({
                        type: 'promise',
                        content: context,
                        fullMatch: m[0],
                        importance: 10
                    });
                }
                if (m.index === localRe.lastIndex) localRe.lastIndex++;
            }
        }
        return promises;
    },

    /**
     * 评估事件重要性（1-10）
     */
    scoreEventImportance: function(text) {
        if (!text) return 5;
        var score = 5;
        // 承诺/约定类直接拉满
        if (/约定|承诺|发誓|答应|保证|一言为定/.test(text)) {
            score = 10;
        }
        // 死亡/背叛/决裂
        if (/(死|亡|牺牲|陨落|献祭|背叛|决裂|反目|断绝)/.test(text)) {
            score = Math.max(score, 9);
        }
        // 修为/突破
        if (/(突破|渡劫|飞升|成仙|婚礼|结拜|拜师|收徒)/.test(text)) {
            score = Math.max(score, 8);
        }
        // 获得/失去/告白
        if (/(获得|得到|夺得|继承|传承|失去|丢失|告白|表白|拒绝|接受)/.test(text)) {
            score = Math.max(score, 8);
        }
        // 战斗
        if (/(决战|生死|搏斗|战斗|死斗)/.test(text)) {
            score = Math.max(score, 7);
        }
        // 长度惩罚
        if (text.length < 8) score = Math.min(score, 4);
        // 包含数字（境界、修为等级）→ 重要
        if (/\d/.test(text) && (text.indexOf('境界') >= 0 || text.indexOf('级') >= 0 || text.indexOf('层') >= 0)) {
            score = Math.max(score, 7);
        }
        return score;
    },

    /**
     * 添加永久事实（不可删除除非手动重置）
     * @param {string} type - setting/pc_identity/npc_profile/promise/world_rule
     */
    addWorldAnchor: function(type, content, source, createdTurn) {
        var self = this;
        if (!self.longTermMemory.worldAnchors) self.longTermMemory.worldAnchors = [];
        // 去重：同 type + 同 content 已有则跳过
        var exists = self.longTermMemory.worldAnchors.some(function(a) {
            return a.type === type && a.content === content;
        });
        if (exists) return null;
        // 角色类特殊去重：同 type=npc_profile 且 content 以同名开头则认为是同一人
        if (type === 'npc_profile' && content) {
            // 提取名字：name 是中文字符（不含全角标点）
            var nameMatch = content.match(/^([一-鿿A-Za-z·]{1,6})/);
            if (nameMatch) {
                var name = nameMatch[1];
                // 找到所有同名 anchor
                var existing = self.longTermMemory.worldAnchors.filter(function(a) {
                    return a.type === 'npc_profile' && a.content.indexOf(name) === 0;
                });
                // 如果有手动编辑过的（source==='manual'），不动它
                var hasManual = existing.some(function(a) { return a.source === 'manual'; });
                if (existing.length > 0 && hasManual) {
                    // 已有手动版本，跳过自动更新
                    return null;
                }
                var dup = existing.length > 0;
                if (dup) {
                    // 已经有同名角色锚点，更新它（用更新的描述）
                    var newAnchors = [];
                    for (var ai = 0; ai < self.longTermMemory.worldAnchors.length; ai++) {
                        var a = self.longTermMemory.worldAnchors[ai];
                        if (a.type === 'npc_profile' && a.content.indexOf(name) === 0) {
                            newAnchors.push({
                                type: a.type,
                                content: content,
                                locked: a.locked,
                                createdTurn: a.createdTurn,
                                source: source,
                                createdAt: Date.now()
                            });
                        } else {
                            newAnchors.push(a);
                        }
                    }
                    self.longTermMemory.worldAnchors = newAnchors;
                    return null;
                }
            }
        }
        var anchor = {
            type: type,            // setting / pc_identity / npc_profile / promise / world_rule
            content: content,
            locked: true,
            createdTurn: createdTurn || self.stats.totalMessages,
            source: source || 'auto',
            createdAt: Date.now()
        };
        self.longTermMemory.worldAnchors.push(anchor);
        // 限制总数量（避免无限增长导致 localStorage 爆掉）
        if (self.longTermMemory.worldAnchors.length > 50) {
            // 保留所有 promise + pc_identity + setting + world_rule；
            // 对 npc_profile 保留最近 15 条
            var preserved = self.longTermMemory.worldAnchors.filter(function(a) {
                return a.type !== 'npc_profile';
            });
            var npcs = self.longTermMemory.worldAnchors.filter(function(a) {
                return a.type === 'npc_profile';
            }).slice(-15);
            self.longTermMemory.worldAnchors = preserved.concat(npcs);
        }
        return anchor;
    },

    /**
     * 根据 source 批量删除世界锚点（世界书删除条目时联动清理）
     * @param {string} sourcePrefix - 源标识前缀，如 'worldInfo:book_xxx:uid_yyy'
     * @returns {number} 删除数量
     */
    removeWorldAnchorsBySource: function(sourcePrefix) {
        var self = this;
        if (!self.longTermMemory.worldAnchors) return 0;
        var before = self.longTermMemory.worldAnchors.length;
        self.longTermMemory.worldAnchors = self.longTermMemory.worldAnchors.filter(function(a) {
            return !(a && a.source && a.source.indexOf(sourcePrefix) === 0);
        });
        var removed = before - self.longTermMemory.worldAnchors.length;
        if (removed > 0) {
            try { if (self.saveToStorage) self.saveToStorage(); } catch (e) {}
        }
        return removed;
    },

    /**
     * 把世界书条目同步到永久事实区
     * 判定规则（满足任一即同步）：
     *   1. 标记为 constant（常驻/绿灯条目）
     *   2. content / comment 命中核心设定关键词
     * @param {object} entry - 世界书条目
     * @param {string} uid - 条目 UID
     * @param {string} bookId - 所属书 ID
     * @returns {object|null} 同步的锚点（未同步返回 null）
     */
    syncWorldInfoEntry: function(entry, uid, bookId) {
        var self = this;
        if (!entry) return null;
        // 未启用或空内容不参与同步
        if (entry.enabled === false) {
            self.removeWorldAnchorsBySource('worldInfo:' + bookId + ':' + uid);
            return null;
        }
        var content = (entry.content || '').trim();
        if (!content) {
            // 空内容：清理之前可能同步的锚点
            self.removeWorldAnchorsBySource('worldInfo:' + bookId + ':' + uid);
            return null;
        }
        // 决定是否同步：constant 标记 OR 关键词命中
        var shouldSync = !!entry.constant;
        var anchorType = 'world_rule';
        if (!shouldSync) {
            // 关键词检测：包含"设定/规则/世界观/铁律/守则/不变/永远/不可/角色/主角/境界/等级"
            var ruleRe = /(设定|规则|世界观|铁律|守则|不变|永远|永不|不可|严禁|禁止|角色|主角|境界|等级|天道|法则)/;
            if (ruleRe.test(content) || ruleRe.test(entry.comment || '')) {
                shouldSync = true;
                anchorType = 'setting';
            }
        }
        if (!shouldSync) return null;
        // 重新同步前先清理旧的同源锚点（避免重复）
        var sourceTag = 'worldInfo:' + bookId + ':' + uid;
        self.removeWorldAnchorsBySource(sourceTag);
        // 拼接同步内容（带标题便于追溯）
        var label = entry.comment ? '【' + entry.comment + '】' : '';
        var syncContent = label ? label + ' ' + content : content;
        if (syncContent.length > 300) syncContent = syncContent.substring(0, 300) + '...';
        var created = self.addWorldAnchor(anchorType, syncContent, sourceTag, self.stats ? self.stats.totalMessages : 0);
        try { if (created && self.saveToStorage) self.saveToStorage(); } catch (e) {}
        return created;
    },

    /**
     * 手动添加/更新进行中的约定
     */
    addActiveQuest: function(quest) {
        var self = this;
        if (!self.longTermMemory.activeQuests) self.longTermMemory.activeQuests = [];
        // 同内容的 pending 任务不重复添加
        var exists = self.longTermMemory.activeQuests.some(function(q) {
            return q.content === quest.content && q.status === 'pending';
        });
        if (exists) return null;
        if (!quest.createdTurn) quest.createdTurn = self.stats.totalMessages;
        if (!quest.status) quest.status = 'pending';
        if (!quest.type) quest.type = 'promise';
        if (!quest.createdAt) quest.createdAt = Date.now();
        self.longTermMemory.activeQuests.push(quest);
        return quest;
    },

    /**
     * 标记约定为已解决/已违反
     */
    resolveQuest: function(contentFragment, newStatus) {
        var self = this;
        if (!self.longTermMemory.activeQuests) return 0;
        var count = 0;
        self.longTermMemory.activeQuests.forEach(function(q) {
            if (q.status === 'pending' && q.content.indexOf(contentFragment) >= 0) {
                q.status = newStatus || 'resolved';
                q.resolvedAt = Date.now();
                count++;
            }
        });
        return count;
    },

    /**
     * 清理过期约定：resolved/broken 超过30回合的自动归档
     * 长期 pending（>50回合）的保留但标记为 stale
     */
    cleanupQuests: function() {
        var self = this;
        if (!self.longTermMemory.activeQuests) return;
        var currentTurn = self.stats.totalMessages;
        self.longTermMemory.activeQuests = self.longTermMemory.activeQuests.filter(function(q) {
            if (q.status === 'resolved' || q.status === 'broken') {
                // 已关闭的约定：30回合后彻底删除
                var age = currentTurn - (q.resolvedAt ? q.resolvedTurn || currentTurn : currentTurn);
                if (age > 30) return false;
            }
            if (q.status === 'pending') {
                // 长期 pending 标记
                q.stale = (currentTurn - (q.createdTurn || 0)) > 50;
            }
            return true;
        });
    },

    /**
     * 在 processMessage 时调用：扫描用户消息和 AI 回复，提取承诺并加入永久区
     */
    extractAndRegisterPromises: function(message, gameData) {
        var self = this;
        if (!self.longTermMemory.worldAnchors) self.longTermMemory.worldAnchors = [];
        if (!self.longTermMemory.activeQuests) self.longTermMemory.activeQuests = [];
        var content = (message && message.content) || '';
        if (!content) return [];

        var registered = [];
        var promises = self.extractPromisesFromText(content);
        promises.forEach(function(p) {
            // 写入永久区
            var anchor = self.addWorldAnchor(
                'promise',
                p.content,
                message.role === 'user' ? 'player' : 'ai',
                self.stats.totalMessages
            );
            if (anchor) registered.push(anchor);
            // 写入待办
            var quest = self.addActiveQuest({
                type: 'promise',
                content: p.content,
                from: message.role === 'user' ? 'player' : 'ai',
                status: 'pending'
            });
            if (quest) registered.push(quest);
        });
        return registered;
    },

    /**
     * 从 gameState.worldSnapshot / worldNotes / 早期对话里收割世界锚点
     * 触发时机：首回合 + 每 5 回合
     */
    _harvestWorldAnchors: function(gameData) {
        var self = this;
        if (!self.longTermMemory.worldAnchors) self.longTermMemory.worldAnchors = [];
        if (!self.longTermMemory.worldAnchorsInitialized) self.longTermMemory.worldAnchorsInitialized = false;

        // 1) 从 worldSnapshot 收割
        if (typeof gameState !== 'undefined' && gameState.worldSnapshot) {
            var snap = gameState.worldSnapshot;
            // PC 身份
            if (snap.summary) {
                self.addWorldAnchor('pc_identity', snap.summary, 'worldSnapshot', self.stats.totalMessages);
            }
            // NPC profile
            if (Array.isArray(snap.characters)) {
                snap.characters.forEach(function(c) {
                    if (c && c.name) {
                        var desc = c.desc ? c.name + '：' + c.desc : c.name;
                        if (c.relation) desc += '（与玩家关系：' + c.relation + '）';
                        if (typeof c.favorability === 'number') desc += '，好感度' + c.favorability;
                        self.addWorldAnchor('npc_profile', desc, 'worldSnapshot', self.stats.totalMessages);
                    }
                });
            }
        }

        // 2) 从 worldNotes 收割
        if (Array.isArray(self.longTermMemory.worldNotes)) {
            self.longTermMemory.worldNotes.forEach(function(n) {
                if (n && n.content && n.source !== 'auto') {
                    self.addWorldAnchor('world_rule', '【' + (n.category || '设定') + '】' + n.title + ': ' + n.content, 'worldNote', self.stats.totalMessages);
                }
            });
        }

        // 3) 从 userPrompt 收割（玩家在游戏开始时写的开场设定）
        if (typeof gameState !== 'undefined' && gameState.userPrompt && self.stats.totalMessages <= 2) {
            self.addWorldAnchor('setting', '玩家开场设定：' + gameState.userPrompt, 'userPrompt', self.stats.totalMessages);
        }
        if (typeof gameState !== 'undefined' && gameState.customStyle && self.stats.totalMessages <= 2) {
            self.addWorldAnchor('setting', '风格偏好：' + gameState.customStyle, 'userStyle', self.stats.totalMessages);
        }

        // 4) 从早期对话里收割关键 NPC（出现在前 6 条消息里、且后续被持续提及的角色）
        self._harvestPersistentNPCs();
    },

    /**
     * 从角色表里挑选"主线 NPC"（出现 ≥ 3 次 + 好感度 > 30 或 < -10）写入锚点
     * 这些角色不会因为短期没提到就消失
     */
    _harvestPersistentNPCs: function() {
        var self = this;
        if (!self.longTermMemory.characterTable) return;
        var chars = self.longTermMemory.characterTable;
        Object.keys(chars).forEach(function(name) {
            var c = chars[name];
            if (c.important) return;  // 已注册
            // 判定：提及 ≥ 3 次 且 (好感度有意义 或 有关系标签)
            var appearance = c.history ? c.history.length : 0;
            var isSignificant = appearance >= 3 ||
                (typeof c.favorability === 'number' && (c.favorability >= 30 || c.favorability <= -10));
            if (isSignificant) {
                var desc = name;
                if (c.title) desc += '（' + c.title + '）';
                if (c.relation) desc += '，与玩家：' + c.relation;
                if (typeof c.favorability === 'number') desc += '，好感度' + c.favorability;
                if (c.desc) desc += '。' + truncateByChars(c.desc, 60, '...');
                var anchor = self.addWorldAnchor('npc_profile', desc, 'persistent_npc', self.stats.totalMessages);
                if (anchor) c.important = true;
            }
        });
    },
    
    // ========================================
    // 3. 消息处理（每回合调用）
    // ========================================
    
    /**
    * 处理新消息，更新三层记忆
    * @param {Object} message - {role, content, timestamp}
    * @param {Object} gameData - AI返回的完整数据
    */
    processMessage: function(message, gameData) {
        var self = this;
        // 【防御】processMessage 自身容错：任何内部错误都不能让游戏崩溃
        // 错误信息记录到 stats.lastError，下一次 save 时持久化
        try {
        // 0. 扫描承诺/约定，自动写入永久事实区（重要性 10，永不丢失）
        self.extractAndRegisterPromises(message, gameData);

        // 1. 添加到工作记忆
        self._addToWorkingMemory(message, gameData);

        // 2. 提取重要信息
        var extractedInfo = self._extractImportantInfo(gameData);

        // 3. 更新结构化表格
        self._updateTables(gameData, extractedInfo);

        // 4. 生成摘要
        var summary = self._generateSummary(message, gameData, extractedInfo);

        // 5. 更新短期记忆
        self._updateShortTermMemory(summary, extractedInfo);

        // 6. 更新长期记忆（每5回合或遇到重要事件时）
        if (self._shouldUpdateLongTerm(extractedInfo)) {
            self._updateLongTermMemory(summary, extractedInfo);
        }

        // 7. 更新时间线
        self._updateTimeline(message, gameData, extractedInfo);

        // 8. 提取世界锚点（首回合或定期触发）
        if (self.stats.totalMessages <= 2 || (self.stats.totalMessages % 5 === 0)) {
            self._harvestWorldAnchors(gameData);
        }

        // 9. 定期清理过期约定
        if (self.stats.totalMessages % 10 === 0) {
            self.cleanupQuests();
        }

        // 10. 更新统计
        self.stats.totalMessages++;
        self.stats.lastUpdateTime = Date.now();
        } catch (e) {
            // 记忆系统错误不打断游戏
            self.stats.lastError = {
                msg: (e && e.message) || String(e),
                stack: (e && e.stack) || '',
                time: Date.now()
            };
            console.error('[EnhancedMemory.processMessage] 内部错误（已记录，游戏继续）:', e);
        }
    },

    /**
    * 添加到工作记忆
    * 改为按"回合"成对保留，确保不会出现只有 user 没有 assistant 的破碎回合
    */
    _addToWorkingMemory: function(message, gameData) {
        var self = this;
        var MAX_TURNS = 3;
        if (!self.workingMemory.turns) self.workingMemory.turns = [];

        // 找到当前回合（最后一个还没填完 assistant 的回合），否则新建
        var currentTurn = self.workingMemory.turns[self.workingMemory.turns.length - 1];
        if (!currentTurn || currentTurn.assistant !== null) {
            currentTurn = { user: null, assistant: null, turn: self.stats.totalMessages + 1, timestamp: Date.now() };
            self.workingMemory.turns.push(currentTurn);
        }
        if (message.role === 'user') {
            currentTurn.user = message.content;
        } else if (message.role === 'assistant') {
            currentTurn.assistant = message.content;
        }

        // 保留最近 MAX_TURNS 回合
        while (self.workingMemory.turns.length > MAX_TURNS) {
            self.workingMemory.turns.shift();
        }

        // 同步到 messages 数组（向后兼容 buildMemoryInjection 的读取方式）
        self.workingMemory.messages = [];
        for (var i = 0; i < self.workingMemory.turns.length; i++) {
            var t = self.workingMemory.turns[i];
            if (t.user !== null && t.user !== undefined) {
                self.workingMemory.messages.push({ role: 'user', content: t.user, timestamp: t.timestamp, turn: t.turn });
            }
            if (t.assistant !== null && t.assistant !== undefined) {
                self.workingMemory.messages.push({ role: 'assistant', content: t.assistant, timestamp: t.timestamp, turn: t.turn });
            }
        }
        self.workingMemory.timestamp = Date.now();
    },
    
    /**
    * 提取重要信息
    */
    _extractImportantInfo: function(gameData) {
        var self = this;
        var info = {
            characters: [],
            items: [],
            locations: [],
            events: [],
            relationships: [],
            importance: 0  // 0-10 重要度评分
            };

        if (!gameData) return info;

        // 提取角色信息
        if (gameData.characters) {
            gameData.characters.forEach(function(char) {
                info.characters.push({
                    name: char.name,
                    title: char.title,
                    relation: char.relation,
                    favorability: char.favorability,
                    desc: char.desc
                    });
                });
        }

        // 提取物品信息
        if (gameData.bag) {
            gameData.bag.forEach(function(item) {
                info.items.push({
                    name: item.name,
                    count: item.count,
                    desc: item.desc,
                    rarity: item.rarity
                    });
                });
        }

    // 提取重要事件
    if (gameData.keyEvents && gameData.keyEvents.length > 0) {
        // 对每个 event 单独打分
        gameData.keyEvents.forEach(function(ev) {
            info.events.push({
                content: ev,
                importance: self.scoreEventImportance(ev)
            });
        });
        // 累计权重用最高值
        var maxImp = 0;
        info.events.forEach(function(e) { if (e.importance > maxImp) maxImp = e.importance; });
        info.importance = Math.max(info.importance, maxImp);
    }

    // 提取关系变化
    if (gameData.relationships) {
        info.relationships = gameData.relationships;
        info.importance += 1;
    }

    // 根据剧情长度判断重要度
    if (gameData.story) {
        var storyLength = gameData.story.length;
        if (storyLength > 500) info.importance += 1;
        if (storyLength > 1000) info.importance += 2;
    }

    return info;
    },
    
    /**
    * 更新结构化表格
    */
    _updateTables: function(gameData, extractedInfo) {
        var self = this;
        var timestamp = Date.now();
        if (!gameData) return;
        if (!extractedInfo) extractedInfo = { characters: [], items: [], events: [], relationships: [] };

        // 更新角色表
        if (extractedInfo.characters.length > 0) {
            extractedInfo.characters.forEach(function(char) {
                var key = char.name;
                var existing = self.longTermMemory.characterTable[key];
    
                self.longTermMemory.characterTable[key] = {
                    name: char.name,
                    title: char.title,
                    relation: char.relation,
                    favorability: char.favorability,
                    desc: char.desc,
                    lastSeen: timestamp,
                    firstSeen: existing ? existing.firstSeen : timestamp,
                    appearanceCount: existing ? (existing.appearanceCount + 1) : 1,
                    history: existing ? existing.history.concat([{
                        time: timestamp,
                        favorability: char.favorability,
                        desc: char.desc
                        }]).slice(-10) : [{
                        time: timestamp,
                        favorability: char.favorability,
                        desc: char.desc
                        }]
                    };
                });
        }

        // 更新物品表
        if (extractedInfo.items.length > 0) {
            extractedInfo.items.forEach(function(item) {
                var key = item.name;
                var existing = self.longTermMemory.itemTable[key];
    
                // 检测变化
                var change = '';
                if (existing) {
                    if (item.count > existing.count) change = '增加';
                    else if (item.count < existing.count) change = '减少';
                    } else {
                    change = '获得';
                }
    
            self.longTermMemory.itemTable[key] = {
                name: item.name,
                count: item.count,
                desc: item.desc,
                rarity: item.rarity,
                firstAcquired: existing ? existing.firstAcquired : timestamp,
                lastUpdate: timestamp,
                changeHistory: existing ? existing.changeHistory.concat([{
                    time: timestamp,
                    count: item.count,
                    change: change
                    }]).slice(-5) : [{
                    time: timestamp,
                    count: item.count,
                    change: change
                    }]
                };
            });
    }

    // 更新地点表（从story中提取）
    if (gameData.story) {
        var locations = this._extractLocations(gameData.story);
        locations.forEach(function(loc) {
            if (!self.longTermMemory.locationTable[loc]) {
                self.longTermMemory.locationTable[loc] = {
                    name: loc,
                    firstVisited: timestamp,
                    lastVisited: timestamp,
                    visitCount: 1
                    };
                } else {
                self.longTermMemory.locationTable[loc].lastVisited = timestamp;
                self.longTermMemory.locationTable[loc].visitCount++;
            }
        });
    }

    // 更新关系网
    if (gameData.relationships) {
        gameData.relationships.forEach(function(rel) {
            var key = rel.from + '_' + rel.to;
            self.longTermMemory.relationships[key] = {
                from: rel.from,
                to: rel.to,
                type: rel.type,
                desc: rel.desc,
                lastUpdate: timestamp
                };
            });
    }
    },
    
    /**
    * 从剧情文本中提取地点
    * 注意：必须在方法内 new RegExp，否则全局正则的 lastIndex 会保留
    */
    _extractLocations: function(story) {
        var locations = [];
        if (!story) return locations;
        // 简单规则：寻找"在..."、"来到..."等模式
        var patterns = [
            /在([^，。！？\s]{2,10})(?:里|内|中|上|下)/g,
            /来到([^，。！？\s]{2,10})/g,
            /前往([^，。！？\s]{2,10})/g,
            /进入([^，。！？\s]{2,10})/g
        ];

        patterns.forEach(function(pattern) {
            pattern.lastIndex = 0;  // 防御性重置
            var match;
            while ((match = pattern.exec(story)) !== null) {
                var loc = match[1].trim();
                if (loc.length > 1 && loc.length < 15 && locations.indexOf(loc) === -1) {
                    locations.push(loc);
                }
                // 防御 0 长度匹配导致死循环
                if (match.index === pattern.lastIndex) {
                    pattern.lastIndex++;
                }
            }
        });

        return locations;
    },
    
    /**
    * 生成摘要
    */
    _generateSummary: function(message, gameData, extractedInfo) {
        var summary = {
            turn: this.stats.totalMessages + 1,
            timestamp: Date.now(),
            title: gameData ? gameData.title : '',
            storySummary: '',
            keyEvents: extractedInfo.events,
            characters: extractedInfo.characters.map(function(c) { return c.name; }),
            importance: extractedInfo.importance,
            changes: []
            };

        // 生成剧情摘要（使用AI返回的contextSummary或自己生成）
        if (gameData && gameData.contextSummary) {
            summary.storySummary = gameData.contextSummary;
            } else if (gameData && gameData.story) {
            // 简单摘要：取前100字
            summary.storySummary = gameData.story.substring(0, 100) + '...';
        }

        // 记录变化
        if (extractedInfo.events.length > 0) {
            summary.changes.push({
                type: 'event',
                content: extractedInfo.events
                });
        }

    return summary;
    },
    
    /**
    * 更新短期记忆
    */
    _updateShortTermMemory: function(summary, extractedInfo) {
        var self = this;
        // 添加到短期记忆
        self.shortTermMemory.summaries.push(summary);

        // 只保留最近10回合
        if (self.shortTermMemory.summaries.length > self.shortTermMemory.maxRounds) {
            self.shortTermMemory.summaries.shift();
        }

        // 添加事件（兼容字符串和对象）
        if (extractedInfo.events.length > 0) {
            extractedInfo.events.forEach(function(event) {
                var content = (typeof event === 'string') ? event : event.content;
                self.shortTermMemory.events.push({
                    content: content,
                    turn: summary.turn,
                    timestamp: summary.timestamp
                });
            });

            // 只保留最近20个事件
            if (self.shortTermMemory.events.length > 20) {
                self.shortTermMemory.events = self.shortTermMemory.events.slice(-20);
            }
        }
    },
    
    /**
    * 判断是否应该更新长期记忆
    */
    _shouldUpdateLongTerm: function(extractedInfo) {
        // 每5回合更新一次
        if (this.stats.totalMessages % 5 === 0) return true;

        // 遇到重要事件时更新
        if (extractedInfo.importance >= 5) return true;

        // 有多个事件时更新
        if (extractedInfo.events.length >= 2) return true;

        return false;
        },
    
    /**
    * 更新长期记忆（重构：分层大纲 + 时间衰减事件）
    */
    _updateLongTermMemory: function(summary, extractedInfo) {
        var self = this;
        var currentTurn = self.stats.totalMessages + 1;

        // === 1. 更新分层剧情大纲 ===
        if (summary.storySummary) {
            // 首次：提取世界观设定（前3回合的摘要视为世界观）
            if (currentTurn <= 3 && !self.longTermMemory.worldSetting) {
                self.longTermMemory.worldSetting = summary.storySummary;
            }
            // 章节检测：如果 title 变化或重要度>=8，视为新章节
            var lastPlot = self.longTermMemory.mainPlot.length > 0
                ? self.longTermMemory.mainPlot[self.longTermMemory.mainPlot.length - 1]
                : null;
            var isNewChapter = false;
            if (extractedInfo.importance >= 8) isNewChapter = true;
            if (lastPlot && summary.title && lastPlot.title !== summary.title) isNewChapter = true;
            // 每10回合强制分章
            if (!lastPlot || currentTurn - lastPlot.startTurn >= 10) isNewChapter = true;

            if (isNewChapter || !lastPlot) {
                // 保存上一章摘要到 mainPlot
                if (self.longTermMemory.currentChapterSummary && lastPlot) {
                    lastPlot.summary = self.longTermMemory.currentChapterSummary;
                    lastPlot.endTurn = currentTurn - 1;
                }
                // 开新章
                self.longTermMemory.mainPlot.push({
                    title: summary.title || ('第' + (self.longTermMemory.mainPlot.length + 1) + '章'),
                    summary: summary.storySummary,
                    startTurn: currentTurn,
                    endTurn: currentTurn,
                    importance: extractedInfo.importance || 5
                });
                // 限制章节数：保留第一章 + 最近4章
                if (self.longTermMemory.mainPlot.length > 5) {
                    var first = self.longTermMemory.mainPlot[0];
                    var recent = self.longTermMemory.mainPlot.slice(-4);
                    self.longTermMemory.mainPlot = [first].concat(recent);
                }
                self.longTermMemory.currentChapterSummary = summary.storySummary;
            } else {
                // 追加到当前章节
                self.longTermMemory.currentChapterSummary += '\n' + summary.storySummary;
                // 限制当前章节长度
                if (Array.from(self.longTermMemory.currentChapterSummary).length > 800) {
                    self.longTermMemory.currentChapterSummary = self._smartTruncateSummary(
                        self.longTermMemory.currentChapterSummary, 600
                    );
                }
                // 同步更新最后一章
                lastPlot.summary = self.longTermMemory.currentChapterSummary;
                lastPlot.endTurn = currentTurn;
            }

            // 兼容旧字段
            self.longTermMemory.masterSummary = self._buildLegacyMasterSummary();
        }

        // === 2. 添加重要事件（带时间衰减评分）===
        if (extractedInfo.events.length > 0) {
            extractedInfo.events.forEach(function(event) {
                var content = (typeof event === 'string') ? event : event.content;
                var imp = (typeof event === 'object' && event.importance) ? event.importance : 5;
                // 去重：同 content 不重复
                var exists = self.longTermMemory.importantEvents.some(function(e) {
                    return e.content === content;
                });
                if (!exists) {
                    self.longTermMemory.importantEvents.push({
                        content: content,
                        turn: currentTurn,
                        timestamp: Date.now(),
                        importance: imp,
                        // 衰减评分：初始=importance，随时间下降
                        decayScore: imp
                    });
                }
            });
            // 重新计算所有事件的衰减评分，然后裁剪
            self._recalcEventDecayScores(currentTurn);
            self._pruneImportantEvents(50);
        }
    },

    /**
     * 构建兼容旧版本的 masterSummary（首章世界观 + 最近章节）
     */
    _buildLegacyMasterSummary: function() {
        var parts = [];
        if (this.longTermMemory.worldSetting) {
            parts.push('【世界观】' + this.longTermMemory.worldSetting);
        }
        var plot = this.longTermMemory.mainPlot;
        if (plot && plot.length > 0) {
            // 保留第一章 + 最近2章
            var keep = [plot[0]];
            if (plot.length > 1) {
                keep = keep.concat(plot.slice(-2));
            }
            keep.forEach(function(ch) {
                parts.push('【' + ch.title + '】' + ch.summary);
            });
        }
        return parts.join('\n');
    },

    /**
     * 重新计算所有事件的衰减评分
     * 公式：decayScore = importance * max(0.3, 1 - age/80)
     * 80回合后衰减到30%，保证早期高分事件不会永远霸榜
     */
    _recalcEventDecayScores: function(currentTurn) {
        var self = this;
        self.longTermMemory.importantEvents.forEach(function(e) {
            var age = Math.max(0, currentTurn - (e.turn || 0));
            var decay = Math.max(0.3, 1 - age / 80);
            e.decayScore = (e.importance || 5) * decay;
            // 超高分事件（>=9）衰减更慢
            if (e.importance >= 9) {
                e.decayScore = (e.importance || 5) * Math.max(0.6, 1 - age / 150);
            }
        });
    },

    /**
     * 按 decayScore 裁剪 importantEvents（替代旧版的纯 importance 排序）
     * 高分（importance>=9）事件最多保留15条，避免无限堆积
     */
    _pruneImportantEvents: function(maxCount) {
        var self = this;
        if (!self.longTermMemory.importantEvents) return;
        if (self.longTermMemory.importantEvents.length <= maxCount) return;

        // 确保所有事件都有 decayScore
        var currentTurn = self.stats.totalMessages;
        self._recalcEventDecayScores(currentTurn);

        // importance>=9 的"史诗事件"单独处理：最多保留15条，按 decayScore 排序
        var epic = self.longTermMemory.importantEvents.filter(function(e) {
            return e.importance >= 9;
        });
        var normal = self.longTermMemory.importantEvents.filter(function(e) {
            return e.importance < 9;
        });

        // 史诗事件按 decayScore 排序，保留 top 15
        epic.sort(function(a, b) { return b.decayScore - a.decayScore; });
        var keptEpic = epic.slice(0, 15);

        // 普通事件按 decayScore 排序，填满剩余预算
        normal.sort(function(a, b) { return b.decayScore - a.decayScore; });
        var budget = Math.max(0, maxCount - keptEpic.length);
        var keptNormal = normal.slice(0, budget);

        // 合并后按 turn 升序排列（输出时更自然）
        self.longTermMemory.importantEvents = keptEpic.concat(keptNormal).sort(function(a, b) {
            return (a.turn || 0) - (b.turn || 0);
        });
    },

    /**
    * 智能截断：保留"开头的世界观/主角身份"和"近期发展"
    * 策略：按段落/换行分割，优先丢弃中间较早的段落
    */
    _smartTruncateSummary: function(text, maxChars) {
        if (!text) return '';
        var arr = Array.from(text);
        if (arr.length <= maxChars) return text;

        // 按换行切成段落
        var paragraphs = text.split(/\n+/);
        // 保留首段（通常是开场/世界观）+ 末尾若干段
        var keepHead = paragraphs[0] || '';
        var tail = paragraphs.slice(1).join('\n');
        var headArr = Array.from(keepHead);
        var tailBudget = maxChars - headArr.length - 20;  // 预留 "…(早期剧情已省略)…\n" 标记
        if (tailBudget < 100) tailBudget = 100;
        var tailArr = Array.from(tail);
        var keptTail = tailArr.length > tailBudget
            ? tailArr.slice(tailArr.length - tailBudget).join('')
            : tail;
        return keepHead + '\n…(早期剧情已省略)…\n' + keptTail;
    },
    
    /**
    * 更新时间线
    */
    _updateTimeline: function(message, gameData, extractedInfo) {
        var timelineEntry = {
            turn: this.stats.totalMessages + 1,
            timestamp: Date.now(),
            relativeTime: this._calculateRelativeTime(),
            title: gameData ? gameData.title : '',
            events: extractedInfo.events,
            characters: extractedInfo.characters.map(function(c) { return c.name; })
            };

        this.longTermMemory.timeline.push(timelineEntry);

        // 只保留最近50个时间点
        if (this.longTermMemory.timeline.length > 50) {
            this.longTermMemory.timeline = this.longTermMemory.timeline.slice(-50);
        }
    },
    
    // ========================================
    // 4. 时间感知系统
    // ========================================
    
    /**
    * 计算相对时间
    */
    _calculateRelativeTime: function() {
        if (!this.longTermMemory.timeline.length) {
            return '开始';
        }

        var lastTime = this.longTermMemory.timeline[this.longTermMemory.timeline.length - 1].timestamp;
        var now = Date.now();
        var diff = now - lastTime;

        // 转换为游戏内时间（假设每回合=1小时）
        var turns = this.stats.totalMessages;
        var hours = turns;
        var days = Math.floor(hours / 24);

        if (days === 0) {
            if (hours === 0) return '刚开始';
            if (hours === 1) return '1小时后';
            return hours + '小时后';
            } else if (days === 1) {
            return '第二天';
            } else if (days < 7) {
            return days + '天后';
            } else if (days < 30) {
            return Math.floor(days / 7) + '周后';
            } else {
            return Math.floor(days / 30) + '个月后';
        }
    },
    
    /**
    * 获取格式化的相对时间
    */
    getRelativeTime: function(timestamp) {
        if (!timestamp) return '未知时间';

        var now = Date.now();
        var diff = now - timestamp;

        var minutes = Math.floor(diff / 60000);
        var hours = Math.floor(diff / 3600000);
        var days = Math.floor(diff / 86400000);

        if (minutes < 1) return '刚刚';
        if (minutes < 60) return minutes + '分钟前';
        if (hours < 24) return hours + '小时前';
        if (days === 1) return '昨天';
        if (days < 7) return days + '天前';
        if (days < 30) return Math.floor(days / 7) + '周前';
        return Math.floor(days / 30) + '个月前';
        },
    
    // ========================================
    // 5. 记忆注入系统（变化驱动）
    // ========================================
    
    /**
    * 构建记忆注入内容（发送给AI）
    * 截断处用 CJK 安全的 truncateByChars，避免把汉字切一半
    */
    buildMemoryInjection: function() {
        var parts = [];
        var changes = this._detectChanges();

        // 1. 工作记忆（最近3回合）
        if (this.workingMemory.messages.length > 0) {
            parts.push('【最近对话】');
            var recent = this.workingMemory.messages.slice(-4);
            recent.forEach(function(msg) {
                parts.push((msg.role === 'user' ? '玩家' : 'AI') + ': ' +
                truncateByChars(msg.content, 100, '...'));
            });
        }

        // 2. 短期记忆摘要
        if (this.shortTermMemory.summaries.length > 0) {
            parts.push('【近期剧情】');
            this.shortTermMemory.summaries.slice(-3).forEach(function(s) {
                parts.push('第' + s.turn + '回合: ' + truncateByChars(s.storySummary, 80, '...'));
            });
        }

        // 3. 长期记忆大纲
        if (this.longTermMemory.masterSummary) {
            parts.push('【剧情大纲】');
            parts.push(truncateByChars(this.longTermMemory.masterSummary, 300, '...'));
        }

        // 4. 变化驱动（只发送有变化的部分）
        if (changes.length > 0) {
            parts.push('【最新变化】');
            changes.forEach(function(change) {
                parts.push(change);
            });
        }

        // 5. 重要事件提醒
        var recentImportant = this.longTermMemory.importantEvents
        .filter(function(e) { return e.importance >= 7; })
        .slice(-3);
        if (recentImportant.length > 0) {
            parts.push('【重要事件】');
            recentImportant.forEach(function(e) {
                parts.push('• ' + e.content);
            });
        }

        // 6. 角色状态（只发送有变化的）
        var characterUpdates = this._getCharacterUpdates();
        if (characterUpdates.length > 0) {
            parts.push('【角色状态更新】');
            characterUpdates.forEach(function(update) {
                parts.push(update);
            });
        }

        return parts.join('\n');
    },
    
    /**
    * 检测变化
    */
    _detectChanges: function() {
        var changes = [];
        const self = this;

        // 检测物品变化
        Object.keys(this.longTermMemory.itemTable).forEach(function(itemName) {
            var item = self.longTermMemory.itemTable[itemName];
            if (item.changeHistory && item.changeHistory.length > 0) {
                var lastChange = item.changeHistory[item.changeHistory.length - 1];
                if (Date.now() - lastChange.time < 300000) {  // 5分钟内的变化
                    changes.push('物品变化: ' + itemName + ' ' + lastChange.change +
                    '到' + lastChange.count + '个');
                }
        }
        });

    // 检测关系变化
    Object.keys(this.longTermMemory.relationships).forEach(function(key) {
        var rel = self.longTermMemory.relationships[key];
        if (Date.now() - rel.lastUpdate < 300000) {
            changes.push('关系变化: ' + rel.from + ' 对 ' + rel.to + ' 现在是 ' + rel.type);
        }
    });

    return changes;
    },
    
    /**
    * 获取角色状态更新
    */
    _getCharacterUpdates: function() {
        var updates = [];
        const self = this;

        Object.keys(this.longTermMemory.characterTable).forEach(function(charName) {
            var char = self.longTermMemory.characterTable[charName];
            if (char.history && char.history.length > 1) {
                var last = char.history[char.history.length - 1];
                var prev = char.history[char.history.length - 2];
    
                if (last.favorability !== prev.favorability) {
                    var change = last.favorability > prev.favorability ? '提升' : '下降';
                    updates.push(charName + '好感度' + change + '到' + last.favorability);
                }
        }
        });

    return updates;
    },
    
    // ========================================
    // 6. 记忆检索系统
    // ========================================
    
    /**
    * 搜索记忆
    */
    search: function(keyword, options) {
        options = options || {};
        var results = {
            events: [],
            characters: [],
            items: [],
            summaries: []
            };

        const self = this;

        // 搜索事件
        this.longTermMemory.importantEvents.forEach(function(e) {
            if (e.content.indexOf(keyword) !== -1) {
                results.events.push(e);
            }
        });

        // 搜索角色
        Object.keys(this.longTermMemory.characterTable).forEach(function(name) {
            if (name.indexOf(keyword) !== -1) {
                results.characters.push(self.longTermMemory.characterTable[name]);
            }
        });

    // 搜索物品
    Object.keys(this.longTermMemory.itemTable).forEach(function(name) {
        if (name.indexOf(keyword) !== -1) {
            results.items.push(self.longTermMemory.itemTable[name]);
        }
    });

    // 搜索摘要
    this.shortTermMemory.summaries.forEach(function(s) {
        if (s.storySummary && s.storySummary.indexOf(keyword) !== -1) {
            results.summaries.push(s);
        }
    });

    return results;
    },
    
    /**
    * 获取角色完整信息
    */
    getCharacterInfo: function(charName) {
        return this.longTermMemory.characterTable[charName] || null;
        },
    
    /**
    * 获取物品历史
    */
    getItemHistory: function(itemName) {
        var item = this.longTermMemory.itemTable[itemName];
        return item ? item.changeHistory : null;
        },
    
    /**
    * 获取时间线
    */
    getTimeline: function(startTurn, endTurn) {
        return this.longTermMemory.timeline.filter(function(t) {
            return t.turn >= (startTurn || 0) && t.turn <= (endTurn || Infinity);
            });
        },
    
    /**
    * 获取关系网
    */
    getRelationshipNetwork: function(charName) {
        var network = [];
        const self = this;

        Object.keys(this.longTermMemory.relationships).forEach(function(key) {
            var rel = self.longTermMemory.relationships[key];
            if (rel.from === charName || rel.to === charName) {
                network.push(rel);
            }
        });

        return network;
    },
    
    // ========================================
    // 7. 数据持久化
    // ========================================
    
    saveToStorage: function() {
        var self = this;
        // 防止与 autoSave 之类的并发写入打架
        if (self._saving) {
            self._pendingSave = true;
            return;
        }
        self._saving = true;
        try {
            // 每次写入前裁剪：summaryHistory 单次 snapshot 会深拷贝整个 characterTable，
            // 反复压缩后会出现"历史嵌套膨胀"导致 localStorage 爆掉。
            // 1. characterSnapshot 只保留核心字段
            // 2. 历史快照按 size 估算，超过 MAX_HISTORY_BYTES 就丢最旧
            var MAX_HISTORY_BYTES = 64 * 1024;  // 64KB 上限
            var histCharSnapshot = null;
            if (self.longTermMemory && self.longTermMemory.characterTable) {
                histCharSnapshot = {};
                Object.keys(self.longTermMemory.characterTable).forEach(function(name) {
                    var c = self.longTermMemory.characterTable[name];
                    histCharSnapshot[name] = {
                        name: c.name,
                        title: c.title,
                        relation: c.relation,
                        favorability: c.favorability,
                        desc: c.desc,
                        firstSeen: c.firstSeen,
                        lastSeen: c.lastSeen
                    };
                });
            }
            // 计算历史大小，按需裁剪
            var totalHistBytes = 0;
            var trimmedHistory = [];
            for (var i = self.summaryHistory.length - 1; i >= 0; i--) {
                var h = self.summaryHistory[i];
                var hSize = (h.summary || '').length + JSON.stringify(h.importantEvents || []).length +
                            JSON.stringify(h.characterSnapshot || {}).length;
                if (totalHistBytes + hSize > MAX_HISTORY_BYTES && trimmedHistory.length > 0) break;
                totalHistBytes += hSize;
                trimmedHistory.unshift(h);
            }
            if (trimmedHistory.length !== self.summaryHistory.length) {
                self.summaryHistory = trimmedHistory;
                if (self.currentSummaryIndex >= self.summaryHistory.length) {
                    self.currentSummaryIndex = self.summaryHistory.length - 1;
                }
            }

            var data = {
                workingMemory: self.workingMemory,
                shortTermMemory: self.shortTermMemory,
                longTermMemory: self.longTermMemory,
                stats: self.stats,
                compressionConfig: self.compressionConfig,
                summaryHistory: self.summaryHistory,
                currentSummaryIndex: self.currentSummaryIndex,
                savedAt: Date.now()
            };
            var serialized = JSON.stringify(data);
            // 【修复】safeSetItem 不抛异常而是返回 {success:false}，必须检查返回值
            var result = safeSetItem('freeScript_enhancedMemory', serialized);
            if (!result || result.success === false) {
                self._handleSaveFailure(result, data);
            }
        } catch(e) {
            // JSON 序列化异常时尝试降级保存
            self._handleSaveFailure({ error: 'serialize_error', message: e.message }, null);
        } finally {
            self._saving = false;
            if (self._pendingSave) {
                self._pendingSave = false;
                // 延后一拍再写，避免递归
                TimerManager.setTimeout('enhancedMemoryDeferredSave', function() {
                    self.saveToStorage();
                }, 50);
            }
        }
    },

    /**
     * 降级保存：先裁掉大字段再写
     */
    _handleSaveFailure: function(result, originalData) {
        try {
            if (!this.longTermMemory) return;
            console.warn('[EnhancedMemory] 保存失败，降级处理:', (result && result.message) || 'unknown');
            // 1. 裁掉 timeline 和 importantEvents 中最旧的一半
            if (this.longTermMemory.timeline && this.longTermMemory.timeline.length > 20) {
                this.longTermMemory.timeline = this.longTermMemory.timeline.slice(-20);
            }
            if (this.longTermMemory.importantEvents && this.longTermMemory.importantEvents.length > 20) {
                this.longTermMemory.importantEvents = this.longTermMemory.importantEvents.slice(-20);
            }
            // 2. 清空 summaryHistory（最占空间的大户）
            this.summaryHistory = [];
            this.currentSummaryIndex = -1;
            // 3. 裁短 masterSummary
            if (this.longTermMemory.masterSummary && Array.from(this.longTermMemory.masterSummary).length > 1500) {
                this.longTermMemory.masterSummary = this._smartTruncateSummary(
                    this.longTermMemory.masterSummary, 1200
                );
            }
            // 4. 再试一次
            var reduced = {
                workingMemory: this.workingMemory,
                shortTermMemory: this.shortTermMemory,
                longTermMemory: this.longTermMemory,
                stats: this.stats,
                savedAt: Date.now()
            };
            var r2 = safeSetItem('freeScript_enhancedMemory', JSON.stringify(reduced));
            if (r2 && r2.success) {
                console.log('[EnhancedMemory] 降级保存成功');
            } else {
                console.error('[EnhancedMemory] 降级保存仍然失败：', r2);
            }
        } catch (e2) {
            console.error('[EnhancedMemory] 降级保存异常：', e2);
        }
    },
    
    loadFromStorage: function() {
        var data = {};
        try {
            data = JSON.parse(localStorage.getItem('freeScript_enhancedMemory') || '{}');
        } catch(e) {
            data = {};
        }

        if (data.workingMemory) this.workingMemory = data.workingMemory;
        if (data.shortTermMemory) this.shortTermMemory = data.shortTermMemory;
        if (data.longTermMemory) this.longTermMemory = data.longTermMemory;
        if (data.stats) this.stats = data.stats;
        if (data.compressionConfig) this.compressionConfig = data.compressionConfig;
        if (data.summaryHistory) this.summaryHistory = data.summaryHistory;
        if (typeof data.currentSummaryIndex === 'number') this.currentSummaryIndex = data.currentSummaryIndex;

        // === 向后兼容：为旧存档补字段 ===
        if (!this.longTermMemory.worldAnchors) this.longTermMemory.worldAnchors = [];
        if (!this.longTermMemory.activeQuests) this.longTermMemory.activeQuests = [];
        // 旧存档的 importantEvents 可能是字符串数组，迁移成对象
        if (this.longTermMemory.importantEvents && this.longTermMemory.importantEvents.length > 0) {
            var needsMigration = false;
            this.longTermMemory.importantEvents.forEach(function(e) {
                if (typeof e === 'string') needsMigration = true;
            });
            if (needsMigration) {
                this.longTermMemory.importantEvents = this.longTermMemory.importantEvents.map(function(e, i) {
                    if (typeof e === 'string') {
                        return { content: e, turn: 0, importance: 5, timestamp: 0 };
                    }
                    return e;
                });
            }
        }
        // 旧存档的 characterTable 可能没有 important 字段
        if (this.longTermMemory.characterTable) {
            Object.keys(this.longTermMemory.characterTable).forEach(function(name) {
                var c = this.longTermMemory.characterTable[name];
                if (typeof c.important === 'undefined') c.important = false;
            }, this);
        }
    },
    
    startAutoSave: function() {
        const self = this;
        // 保存interval ID，防止内存泄漏
        if (this._autoSaveTimer) TimerManager.clearInterval('enhancedMemoryAutoSave');
        TimerManager.setInterval('enhancedMemoryAutoSave', function() {
            self.saveToStorage();
            }, 30000);
        },

    stopAutoSave: function() {
        // 停止自动保存
        TimerManager.clearInterval('enhancedMemoryAutoSave');
        },
    
    // ========================================
    // 8. 统计和报告
    // ========================================
    
    getStats: function() {
        return {
            totalMessages: this.stats.totalMessages,
            totalCharacters: Object.keys(this.longTermMemory.characterTable).length,
            totalItems: Object.keys(this.longTermMemory.itemTable).length,
            totalLocations: Object.keys(this.longTermMemory.locationTable).length,
            totalEvents: this.longTermMemory.importantEvents.length,
            timelineLength: this.longTermMemory.timeline.length,
            memorySize: JSON.stringify(this.longTermMemory).length
            };
        },
    
    generateReport: function() {
        var stats = this.getStats();
        var report = [
        '【记忆系统报告】',
        '总消息数: ' + stats.totalMessages,
        '角色数: ' + stats.totalCharacters,
        '物品数: ' + stats.totalItems,
        '地点数: ' + stats.totalLocations,
        '重要事件: ' + stats.totalEvents,
        '时间线长度: ' + stats.timelineLength,
        '记忆数据大小: ' + (stats.memorySize / 1024).toFixed(2) + 'KB'
        ];

        return report.join('\n');
        },
    
    // ========================================
    // 9. 清理和重置
    // ========================================
    
    clear: function() {
        this.workingMemory = { messages: [], summaries: [], timestamp: null, turns: [] };
        this.shortTermMemory = { summaries: [], events: [], maxRounds: 10 };
        this.longTermMemory = {
            masterSummary: '',
            importantEvents: [],
            characterTable: {},
            itemTable: {},
            locationTable: {},
            timeline: [],
            relationships: {},
            worldNotes: [],
            worldAnchors: [],
            activeQuests: []
        };
        this.stats = { totalMessages: 0, totalSummaries: 0, lastUpdateTime: null, tokenSaved: 0 };
        this.summaryHistory = [];
        this.currentSummaryIndex = -1;
        localStorage.removeItem('freeScript_enhancedMemory');
    },
    // ========================================
    // 10. 摘要历史管理
    // ========================================
    saveSummaryHistory: function(summary, messageCount) {
        var self = this;
        // 浅拷贝 characterTable 的核心字段，避免反复压缩时整张表被嵌套到 history 里
        var characterSnapshot = {};
        if (self.longTermMemory && self.longTermMemory.characterTable) {
            Object.keys(self.longTermMemory.characterTable).forEach(function(name) {
                var c = self.longTermMemory.characterTable[name];
                characterSnapshot[name] = {
                    name: c.name,
                    title: c.title,
                    relation: c.relation,
                    favorability: c.favorability,
                    desc: c.desc,
                    firstSeen: c.firstSeen,
                    lastSeen: c.lastSeen
                };
            });
        }
        self.summaryHistory.push({
            summary: summary,
            timestamp: Date.now(),
            messageCount: messageCount,
            importantEvents: JSON.parse(JSON.stringify(self.longTermMemory.importantEvents.slice(-10))),
            characterSnapshot: characterSnapshot
        });
        self.currentSummaryIndex = self.summaryHistory.length - 1;
        if (self.summaryHistory.length > 10) {
            self.summaryHistory.shift();
            self.currentSummaryIndex--;
        }
        // 持久化交给 saveToStorage（里面会按字节再次裁剪）
        self.saveToStorage();
    },
    rollbackSummary: function() {
        if (this.currentSummaryIndex <= 0) return false;
        this.currentSummaryIndex--;
        var h = this.summaryHistory[this.currentSummaryIndex];
        this.longTermMemory.masterSummary = h.summary;
        this.longTermMemory.importantEvents = h.importantEvents;
        this.longTermMemory.characterTable = h.characterSnapshot;
        this.saveToStorage();
        return true;
        },
    getSummaryHistoryList: function() {
        const self = this;
        return this.summaryHistory.map(function(item, index) {
            return {
                index: index,
                isCurrent: index === self.currentSummaryIndex,
                timestamp: new Date(item.timestamp).toLocaleString(),
                messageCount: item.messageCount,
                summaryPreview: item.summary.substring(0, 100) + '...'
                };
            });
        },
    // ========================================
    // 11. 智能触发判断
    // ========================================
    shouldTriggerCompression: function(currentTokenCount, maxTokens) {
        var config = this.compressionConfig;
        var messageCount = gameState.conversationHistory.length;
        var lastCompressTime = Date.now() - (window.lastCompressTime || 0);
        if (currentTokenCount > maxTokens * config.triggerThreshold) {
            return { shouldCompress: true, reason: 'Token超限 (' + currentTokenCount + '/' + maxTokens + ')' };
        }
        if (messageCount > config.minMessages * 2) {
            return { shouldCompress: true, reason: '消息数量过多 (' + messageCount + '条)' };
        }
    if (lastCompressTime > config.cooldownMinutes * 60 * 1000 && messageCount >= config.minMessages) {
        var recentMessages = gameState.conversationHistory.slice(-5);
        var hasImportantEvent = recentMessages.some(function(m) {
            var c = m.content || '';
            return c.includes('重要') || c.includes('关键') || c.includes('转折') || c.includes('获得') || c.includes('失去') || c.includes('登场');
            });
        if (hasImportantEvent) {
            return { shouldCompress: true, reason: '检测到重要事件，建议压缩' };
        }
    }
    return { shouldCompress: false, reason: '暂不需要压缩' };
    },
    // ========================================
    // 12. 智能记忆注入
    // ========================================
    detectCurrentTopic: function() {
        var recentMessages = gameState.conversationHistory.slice(-3);
        var allText = recentMessages.map(function(m) { return m.content || ''; }).join(' ');
        var topic = { characters: [], items: [], locations: [] };
        const self = this;
        Object.keys(this.longTermMemory.characterTable).forEach(function(name) {
            if (allText.includes(name)) topic.characters.push(name);
            });
        Object.keys(this.longTermMemory.itemTable).forEach(function(name) {
            if (allText.includes(name)) topic.items.push(name);
            });
        Object.keys(this.longTermMemory.locationTable).forEach(function(name) {
            if (allText.includes(name)) topic.locations.push(name);
            });
        return topic;
        },
    /**
     * 自适应预算：根据模型上下文大小调整注入预算
     */
    _adaptBudget: function() {
        var ctxSize = (gameState && gameState.contextSize) || 8000;
        var base = 4000;
        if (ctxSize >= 32000) base = 12000;
        else if (ctxSize >= 16000) base = 8000;
        else if (ctxSize >= 12000) base = 6000;
        this.injectionBudget.maxChars = base;
        // 最小预算按比例缩放
        var ratio = base / 4000;
        var minB = this.injectionBudget.minBudget;
        var idealB = this.injectionBudget.idealBudget;
        Object.keys(minB).forEach(function(k) { minB[k] = Math.floor(minB[k] * ratio); });
        Object.keys(idealB).forEach(function(k) { idealB[k] = Math.floor(idealB[k] * ratio); });
    },

    /**
     * 带预算控制的字符串构建器
     */
    _buildSection: function(header, footer, lines, maxChars) {
        if (!lines || lines.length === 0) return '';
        var content = lines.join('\n');
        var total = header.length + footer.length + content.length;
        if (total <= maxChars) return header + content + footer;
        // 超预算：逐行截断
        var budget = maxChars - header.length - footer.length - 3; // 预留 "..."
        var kept = [];
        var used = 0;
        for (var i = 0; i < lines.length; i++) {
            if (used + lines[i].length + 1 <= budget) {
                kept.push(lines[i]);
                used += lines[i].length + 1;
            } else {
                break;
            }
        }
        return header + kept.join('\n') + '...' + footer;
    },

    buildSmartInjection: function() {
        var self = this;
        self._adaptBudget();
        var topic = self.detectCurrentTopic();
        var currentTurn = self.stats.totalMessages;
        var budget = self.injectionBudget;

        // ===== 阶段1：收集各模块原始数据 =====
        var modules = {
            worldAnchors: { priority: 10, lines: [], used: 0 },
            activeQuests: { priority: 9, lines: [], used: 0 },
            currentPlot: { priority: 8, lines: [], used: 0 },
            characters: { priority: 7, lines: [], used: 0 },
            events: { priority: 6, lines: [], used: 0 },
            items: { priority: 4, lines: [], used: 0 },
            workingMemory: { priority: 5, lines: [], used: 0 }
        };

        // --- 0. 永久事实区 ---
        if (self.longTermMemory.worldAnchors && self.longTermMemory.worldAnchors.length > 0) {
            var byType = {};
            self.longTermMemory.worldAnchors.forEach(function(a) {
                if (!byType[a.type]) byType[a.type] = [];
                byType[a.type].push(a);
            });
            var order = ['pc_identity', 'setting', 'world_rule', 'npc_profile', 'promise'];
            var typeLabels = {
                pc_identity: '主角', setting: '世界设定', world_rule: '设定规则',
                npc_profile: '关键角色', promise: '玩家承诺/约定'
            };
            order.forEach(function(t) {
                if (byType[t] && byType[t].length > 0) {
                    modules.worldAnchors.lines.push('【' + typeLabels[t] + '】');
                    byType[t].forEach(function(a) {
                        modules.worldAnchors.lines.push('• ' + a.content);
                    });
                }
            });
        }

        // --- 1. 进行中的约定 ---
        if (self.longTermMemory.activeQuests && self.longTermMemory.activeQuests.length > 0) {
            var pending = self.longTermMemory.activeQuests.filter(function(q) {
                return q.status === 'pending';
            });
            pending.forEach(function(q) {
                var age = currentTurn - (q.createdTurn || 0);
                var warn = age > 20 ? '[长期未兑现] ' : '';
                modules.activeQuests.lines.push('• ' + warn + q.content);
            });
        }

        // --- 2. 分层剧情大纲 ---
        if (self.longTermMemory.worldSetting) {
            modules.currentPlot.lines.push('【世界观】' + self.longTermMemory.worldSetting);
        }
        var plot = self.longTermMemory.mainPlot;
        if (plot && plot.length > 0) {
            // 第一章
            modules.currentPlot.lines.push('【' + plot[0].title + '】' + plot[0].summary);
            // 最近章节
            if (plot.length > 1) {
                var recent = plot.slice(-2);
                recent.forEach(function(ch) {
                    modules.currentPlot.lines.push('【' + ch.title + '】' + ch.summary);
                });
            }
        }
        if (self.longTermMemory.currentChapterSummary) {
            modules.currentPlot.lines.push('【当前进展】' + self.longTermMemory.currentChapterSummary);
        }

        // --- 3. 角色状态（带场景相关性权重）---
        if (self.longTermMemory.characterTable && Object.keys(self.longTermMemory.characterTable).length > 0) {
            var allChars = Object.keys(self.longTermMemory.characterTable).map(function(name) {
                return self.longTermMemory.characterTable[name];
            });
            // 计算综合分数：important + history + favorability + 场景相关性
            allChars.forEach(function(c) {
                var score = (c.important ? 1000 : 0) +
                            (c.history ? c.history.length : 0) * 10 +
                            (typeof c.favorability === 'number' ? Math.abs(c.favorability - 50) : 0);
                // 场景相关性：当前对话中提到的角色 +500
                if (topic.characters.indexOf(c.name) >= 0) score += 500;
                // 最近出现：3回合内 +300
                var lastSeen = c.lastSeen || 0;
                if (Date.now() - lastSeen < 10 * 60 * 1000) score += 300;
                c._injectScore = score;
            });
            allChars.sort(function(a, b) { return b._injectScore - a._injectScore; });
            // 场景相关角色强制标记
            var sceneChars = allChars.filter(function(c) {
                return topic.characters.indexOf(c.name) >= 0;
            });
            // 取 top 5，但保证场景相关角色至少出现
            var maxChars = 5;
            var selected = sceneChars.slice();
            allChars.forEach(function(c) {
                if (selected.length >= maxChars) return;
                if (selected.indexOf(c) < 0) selected.push(c);
            });
            selected.forEach(function(c) {
                var name = c.name || '?';
                var line = '• ' + name;
                if (c.title) line += '（' + c.title + '）';
                if (c.relation) line += ' | 与玩家:' + c.relation;
                if (typeof c.favorability === 'number') line += ' | 好感:' + c.favorability;
                if (c.mood) line += ' | 心情:' + c.mood;
                if (c.location) line += ' | 位置:' + c.location;
                if (c.history && c.history.length > 0) {
                    var lastDesc = c.history[c.history.length - 1];
                    if (lastDesc.desc) line += ' | 近况:' + truncateByChars(lastDesc.desc, 40, '...');
                }
                modules.characters.lines.push(line);
            });
        }

        // --- 4. 重要事件（按 decayScore 排序）---
        if (self.longTermMemory.importantEvents && self.longTermMemory.importantEvents.length > 0) {
            self._recalcEventDecayScores(currentTurn);
            var sortedEvents = self.longTermMemory.importantEvents.slice().sort(function(a, b) {
                return (b.decayScore || 0) - (a.decayScore || 0);
            });
            // 取 top 10，但保证有场景相关事件
            var sceneEventContents = [];
            topic.characters.forEach(function(name) {
                sortedEvents.forEach(function(e) {
                    if (e.content && e.content.indexOf(name) >= 0 && sceneEventContents.indexOf(e.content) < 0) {
                        sceneEventContents.push(e.content);
                    }
                });
            });
            var selectedEvents = [];
            var seen = {};
            // 先加场景相关
            sceneEventContents.forEach(function(content) {
                sortedEvents.forEach(function(e) {
                    if (e.content === content && !seen[e.content]) {
                        seen[e.content] = true;
                        selectedEvents.push(e);
                    }
                });
            });
            // 再补 decayScore 高的
            sortedEvents.forEach(function(e) {
                if (selectedEvents.length >= 10) return;
                if (!seen[e.content]) {
                    seen[e.content] = true;
                    selectedEvents.push(e);
                }
            });
            selectedEvents.forEach(function(e) {
                var imp = e.importance || 5;
                var icon = imp >= 9 ? '🔴' : (imp >= 7 ? '🟡' : '🟢');
                modules.events.lines.push(icon + '[重要度' + imp + '] ' + e.content);
            });
        }

        // --- 5. 物品状态 ---
        if (self.longTermMemory.itemTable && Object.keys(self.longTermMemory.itemTable).length > 0) {
            var items = Object.keys(self.longTermMemory.itemTable).map(function(k) {
                return self.longTermMemory.itemTable[k];
            }).filter(function(it) { return it && (it.count || 0) > 0; });
            // 场景相关物品优先
            items.sort(function(a, b) {
                var aScene = topic.items.indexOf(a.name) >= 0 ? 1000 : 0;
                var bScene = topic.items.indexOf(b.name) >= 0 ? 1000 : 0;
                return (bScene + (b.rarity ? 1 : 0)) - (aScene + (a.rarity ? 1 : 0));
            });
            items.slice(0, 8).forEach(function(it) {
                var line = '• ' + it.name;
                if (it.count && it.count > 1) line += ' x' + it.count;
                if (it.rarity) line += ' [' + it.rarity + ']';
                if (it.desc) line += ' - ' + truncateByChars(it.desc, 30, '...');
                modules.items.lines.push(line);
            });
        }

        // --- 6. 工作记忆 ---
        if (self.workingMemory.messages && self.workingMemory.messages.length > 0) {
            var recent = self.workingMemory.messages.slice(-6);
            recent.forEach(function(msg) {
                modules.workingMemory.lines.push(
                    (msg.role === 'user' ? '玩家' : 'AI') + ': ' + msg.content
                );
            });
        }

        // ===== 阶段2：预算分配与渲染 =====
        // 计算各模块 header+footer 开销
        var headers = {
            worldAnchors: '<永久事实(任何情况下不可违背)>\n',
            activeQuests: '<进行中的约定(AI必须在剧情中遵守)>\n',
            currentPlot: '<剧情大纲>\n',
            characters: '<角色状态>\n',
            events: '<重要事件>\n',
            items: '<持有物品>\n',
            workingMemory: '<最近对话>\n'
        };
        var footers = {
            worldAnchors: '\n</永久事实>\n\n',
            activeQuests: '\n</进行中的约定>\n\n',
            currentPlot: '\n</剧情大纲>\n\n',
            characters: '\n</角色状态>\n\n',
            events: '\n</重要事件>\n\n',
            items: '\n</持有物品>\n\n',
            workingMemory: '\n</最近对话>\n'
        };

        // 先满足最小预算
        var remaining = budget.maxChars;
        var allocated = {};
        var keys = Object.keys(modules);
        keys.forEach(function(k) {
            var mod = modules[k];
            var min = budget.minBudget[k] || 100;
            var need = headers[k].length + footers[k].length;
            var linesChars = mod.lines.join('\n').length;
            var actual = Math.min(min - need, linesChars);
            if (actual < 0) actual = 0;
            allocated[k] = actual + need;
            remaining -= allocated[k];
        });

        // 剩余预算按优先级分配
        if (remaining > 0) {
            // 按优先级排序
            var prioKeys = keys.slice().sort(function(a, b) {
                return modules[b].priority - modules[a].priority;
            });
            prioKeys.forEach(function(k) {
                var mod = modules[k];
                var ideal = (budget.idealBudget[k] || 200) - allocated[k];
                if (ideal <= 0) return;
                var linesChars = mod.lines.join('\n').length;
                var want = Math.min(ideal, linesChars);
                var give = Math.min(want, remaining);
                allocated[k] += give;
                remaining -= give;
            });
        }

        // 渲染各模块（带截断）
        var injection = '';
        keys.forEach(function(k) {
            var mod = modules[k];
            if (mod.lines.length === 0) return;
            var alloc = allocated[k] || 0;
            var header = headers[k];
            var footer = footers[k];
            var contentBudget = alloc - header.length - footer.length;
            if (contentBudget <= 0) return;
            var section = self._buildSection(header, footer, mod.lines, alloc);
            injection += section;
        });

        // 记录本次注入统计
        self._lastInjectionStats = {
            totalChars: injection.length,
            budget: budget.maxChars,
            moduleChars: {}
        };
        keys.forEach(function(k) {
            self._lastInjectionStats.moduleChars[k] = allocated[k] || 0;
        });

        return injection;
    },

    /**
     * 外部添加重要事件的接口（剧情/私聊联动使用）
     * @param {string|object} eventOrContent - 事件字符串或 {content, importance, source, type}
     */
    addImportantEvent: function(eventOrContent) {
        if (!this.longTermMemory) this.longTermMemory = {};
        if (!this.longTermMemory.importantEvents) this.longTermMemory.importantEvents = [];
        var evt = (typeof eventOrContent === 'string')
            ? { content: eventOrContent, importance: 5 }
            : eventOrContent;
        if (!evt || !evt.content) return false;
        var currentTurn = (this.stats && this.stats.totalMessages) || 0;
        // 去重
        var exists = this.longTermMemory.importantEvents.some(function(e) {
            return e.content === evt.content;
        });
        if (exists) return false;
        this.longTermMemory.importantEvents.push({
            content: evt.content,
            turn: currentTurn,
            timestamp: Date.now(),
            importance: evt.importance || 5,
            source: evt.source || 'external',
            type: evt.type || 'event',
            decayScore: evt.importance || 5
        });
        // 触发裁剪
        if (this._pruneImportantEvents) this._pruneImportantEvents(50);
        // 持久化
        try { if (this.saveToStorage) this.saveToStorage(); } catch (e) {}
        return true;
    }
};

// 全局暴露
window.EnhancedMemory = EnhancedMemory;

// 自动初始化
GlobalCleanup.registerListener(document, 'DOMContentLoaded', function() {
    EnhancedMemory.init();
});

/**
 * ========================================
 * 记忆管理UI界面
 * Memory Manager UI
 * ========================================
 */

var MemoryManagerUI = {

    isVisible: false,
    currentTab: 'overview',

    // 【修复XSS】HTML转义辅助方法，防止XSS注入
    _esc: function(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        },
    // 【修复XSS】安全属性值转义（用于onclick等属性中的字符串参数）
    _escAttr: function(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/</g, '\\x3c').replace(/>/g, '\\x3e').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
        },
    
    // 【结构重组】从 MemoryManager 迁移的页面导航功能
    initNavigation: function() {
        const self = this;
        // 记忆页面返回按钮
        var backBtn = document.getElementById('memoryBackBtn');
        if (backBtn) {
            backBtn.addEventListener('click', function() {
                UI.showPage('storyPage');
                renderNavBar('gameNav', [{
                    page: 'storyPage',
                    icon: 'icon-book',
                    label: '剧情'
                },
            {
                page: 'playerPage',
                icon: 'icon-user',
                label: '个人'
                },
            {
                page: 'npcPage',
                icon: 'icon-users',
                label: '人际'
                },
            {
                page: 'logPage',
                icon: 'icon-grid',
                label: '日志'
                },
            {
                page: 'memoryPage',
                icon: 'icon-sparkles',
                label: '记忆'
                },
            {
                page: 'recapPage',
                icon: 'icon-clock',
                label: '回顾'
                }
            ], 0);
            });
        }
    // 记忆保存按钮
    var saveBtn = document.getElementById('btnMemorySave');
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            self.saveMemoryEdits();
            });
    }
    // 摘要字数统计
    var summaryEdit = document.getElementById('memorySummaryEdit');
    if (summaryEdit) {
        summaryEdit.addEventListener('input', function() {
            var counter = document.getElementById('memorySummaryCount');
            if (counter) counter.textContent = summaryEdit.value.length + ' 字';
            });
    }
    },

    // 【结构重组】从 MemoryManager 迁移的手动保存功能
    saveMemoryEdits: function() {
        // 保存摘要
        var summaryEl = document.getElementById('memorySummaryEdit');
        if (summaryEl && gameState) {
            gameState.rollingSummary = summaryEl.value.trim();
        }
        // 保存世界状态
        var worldEdit = document.getElementById('memoryWorldEdit');
        if (worldEdit && gameState) {
            try {
                var parsed = JSON.parse(worldEdit.value);
                gameState.worldSnapshot = parsed;
                } catch(e) {
                    // JSON解析失败，保持原样
                }
        }
    // 自动保存
    if (typeof autoSave === 'function') {
        autoSave();
    }
    UI.toast('记忆已保存');
    },

    /**
    * 显示记忆管理界面（方案C：全屏页面模式）
    */
    show: function() {
        this.initNavigation();
        // 方案C：直接渲染到页面内的容器
        this.isVisible = true;
        this.currentTab = 'overview';
        this.renderContent();

        // 更新标签样式
        document.querySelectorAll('.memory-tab').forEach(function(el) {
            el.classList.remove('active');
            });
        var activeTab = document.querySelector('.memory-tab[data-tab="overview"]');
        if (activeTab) activeTab.classList.add('active');

        // 渲染底部导航栏
        renderNavBar('memoryNav', [{
            page: 'storyPage',
            icon: 'icon-book',
            label: '剧情'
        },
        {
            page: 'playerPage',
            icon: 'icon-user',
            label: '个人'
            },
        {
            page: 'npcPage',
            icon: 'icon-users',
            label: '人际'
            },
        {
            page: 'logPage',
            icon: 'icon-grid',
            label: '日志'
            },
        {
            page: 'memoryPage',
            icon: 'icon-sparkles',
            label: '记忆'
            },
        {
            page: 'recapPage',
            icon: 'icon-clock',
            label: '回顾'
            }
        ], 4);
    },
    
    /**
    * 页面切换时调用
    */
    onPageShow: function() {
        this.show();
        },
    
    /**
    * 隐藏记忆管理界面（保留但不再使用）
    */
    hide: function() {
        this.isVisible = false;
        },
    
    /**
    * 切换标签页
    */
    switchTab: function(tab) {
        this.currentTab = tab;
        this.renderContent();

        // 更新标签样式
        document.querySelectorAll('.memory-tab').forEach(function(el) {
            el.classList.remove('active');
            });
        var activeTab = document.querySelector('.memory-tab[data-tab="' + tab + '"]');
        if (activeTab) activeTab.classList.add('active');
        },
    
    /**
    * 渲染内容
    */
    renderContent: function() {
        var content = document.getElementById('memoryManagerContent');
        if (!content) return;

        // 尝试从 window 或全局获取 EnhancedMemory
        var em = window.EnhancedMemory || (typeof EnhancedMemory !== 'undefined' ? EnhancedMemory : null);
        if (!em) {
            content.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-tertiary);">记忆系统未初始化</div>';
            return;
        }

        switch(this.currentTab) {
            case 'overview':
            content.innerHTML = this.renderOverview(em);
            break;
            case 'anchors':
            content.innerHTML = this.renderAnchors(em);
            break;
            case 'quests':
            content.innerHTML = this.renderQuests(em);
            break;
            case 'timeline':
            content.innerHTML = this.renderTimeline(em);
            break;
            case 'characters':
            content.innerHTML = this.renderCharacters(em);
            break;
            case 'items':
            content.innerHTML = this.renderItems(em);
            break;
            case 'locations':
            content.innerHTML = this.renderLocations(em);
            break;
            case 'events':
            content.innerHTML = this.renderEvents(em);
            break;
            case 'world':
            content.innerHTML = this.renderWorld(em);
            break;
            case 'search':
            content.innerHTML = this.renderSearch(em);
            break;
            case 'injection':
            content.innerHTML = this.renderInjectionPreview(em);
            break;
        }
    },
    
    /**
    * 渲染总览
    */
    renderOverview: function(em) {
        var stats = em.getStats();

        // 【修复5 XSS】对用户可控的 masterSummary 进行转义
        var safeSummary = this._esc(em.longTermMemory.masterSummary || '暂无大纲，AI会在对话过程中自动生成');

        return '<div class="memory-card">'
        + '<div class="memory-card-title">记忆统计</div>'
        + '<div class="memory-stat-grid">'
        + '<div class="memory-stat-item">'
        + '<div class="memory-stat-value">' + stats.totalMessages + '</div>'
        + '<div class="memory-stat-label">总消息数</div>'
        + '</div>'
        + '<div class="memory-stat-item">'
        + '<div class="memory-stat-value">' + stats.totalCharacters + '</div>'
        + '<div class="memory-stat-label">角色数</div>'
        + '</div>'
        + '<div class="memory-stat-item">'
        + '<div class="memory-stat-value">' + stats.totalItems + '</div>'
        + '<div class="memory-stat-label">物品数</div>'
        + '</div>'
        + '<div class="memory-stat-item">'
        + '<div class="memory-stat-value">' + stats.totalLocations + '</div>'
        + '<div class="memory-stat-label">地点数</div>'
        + '</div>'
        + '<div class="memory-stat-item">'
        + '<div class="memory-stat-value">' + stats.totalEvents + '</div>'
        + '<div class="memory-stat-label">重要事件</div>'
        + '</div>'
        + '<div class="memory-stat-item">'
        + '<div class="memory-stat-value">' + (stats.memorySize / 1024).toFixed(1) + 'KB</div>'
        + '<div class="memory-stat-label">数据大小</div>'
        + '</div>'
        + '</div>'
        + '</div>'

        + '<div class="memory-card">'
        + '<div class="memory-card-title">三层记忆状态</div>'
        + '<div style="display:flex;gap:16px;">'
        + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;">'
        + '<div style="font-size:12px;color:var(--text-tertiary);">工作记忆</div>'
        + '<div style="font-size:20px;font-weight:600;">' + em.workingMemory.messages.length + ' 条</div>'
        + '<div style="font-size:11px;color:var(--text-tertiary);">最近3回合</div>'
        + '</div>'
        + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;">'
        + '<div style="font-size:12px;color:var(--text-tertiary);">短期记忆</div>'
        + '<div style="font-size:20px;font-weight:600;">' + em.shortTermMemory.summaries.length + ' 条</div>'
        + '<div style="font-size:11px;color:var(--text-tertiary);">最近10回合</div>'
        + '</div>'
        + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;">'
        + '<div style="font-size:12px;color:var(--text-tertiary);">长期记忆</div>'
        + '<div style="font-size:20px;font-weight:600;">' + stats.totalEvents + ' 事件</div>'
        + '<div style="font-size:11px;color:var(--text-tertiary);">永久保存</div>'
        + '</div>'
        + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;">'
        + '<div style="font-size:12px;color:var(--text-tertiary);">永久事实</div>'
        + '<div style="font-size:20px;font-weight:600;">' + (em.longTermMemory.worldAnchors ? em.longTermMemory.worldAnchors.length : 0) + ' 条</div>'
        + '<div style="font-size:11px;color:var(--text-tertiary);">永不丢失</div>'
        + '</div>'
        + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;">'
        + '<div style="font-size:12px;color:var(--text-tertiary);">进行中约定</div>'
        + '<div style="font-size:20px;font-weight:600;">' + (em.longTermMemory.activeQuests ? em.longTermMemory.activeQuests.filter(function(q){return q.status==='pending';}).length : 0) + ' 待办</div>'
        + '<div style="font-size:11px;color:var(--text-tertiary);">AI 必须遵守</div>'
        + '</div>'
        + '</div>'
        + '</div>'

        + '<div class="memory-card">'
        + '<div class="memory-card-title" style="justify-content:space-between;">'
        + '<span>📖 剧情大纲</span>'
        + '<button onclick="MemoryManagerUI.editMasterSummary()" style="'
        + 'font-size:11px;color:var(--accent);background:none;border:1px solid var(--accent);'
        + 'padding:4px 10px;border-radius:6px;cursor:pointer;'
        + '">编辑</button>'
        + '</div>'
        + '<div id="masterSummaryDisplay" style="padding:12px;background:var(--bg);border-radius:8px;max-height:200px;overflow-y:auto;white-space:pre-wrap;line-height:1.6;">'
        + safeSummary
        + '</div>'
        + '</div>'

        + '<div class="memory-card">'
        + '<div class="memory-card-title" style="justify-content:space-between;">'
        + '<span>🧠 当前注入预览</span>'
        + '<button onclick="MemoryManagerUI.switchTab(\'injection\')" style="'
        + 'font-size:11px;color:var(--accent);background:none;border:1px solid var(--accent);'
        + 'padding:4px 10px;border-radius:6px;cursor:pointer;'
        + '">查看详情</button>'
        + '</div>'
        + '<div style="padding:12px;background:var(--bg);border-radius:8px;">'
        + '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px;">'
        + '本回合实际发送给AI的记忆内容（已按预算截断）'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">'
        + (em._lastInjectionStats
            ? '总字符: ' + em._lastInjectionStats.totalChars + ' / 预算: ' + em._lastInjectionStats.budget
              + '<br>永久事实: ' + (em._lastInjectionStats.moduleChars.worldAnchors || 0) + '字'
              + ' | 约定: ' + (em._lastInjectionStats.moduleChars.activeQuests || 0) + '字'
              + ' | 剧情: ' + (em._lastInjectionStats.moduleChars.currentPlot || 0) + '字'
              + ' | 角色: ' + (em._lastInjectionStats.moduleChars.characters || 0) + '字'
              + ' | 事件: ' + (em._lastInjectionStats.moduleChars.events || 0) + '字'
            : '尚未生成注入内容，发送一条消息后可见')
        + '</div>'
        + '</div>'
        + '</div>';
        },
    
    // ========================================
    // 编辑剧情大纲
    // ========================================
    editMasterSummary: function() {
        var em = window.EnhancedMemory;
        var display = document.getElementById('masterSummaryDisplay');
        if (!display) return;

        var current = em.longTermMemory.masterSummary || '';
        // 【修复6 XSS】使用DOM API构建textarea并设置value，而非通过innerHTML插入
        display.innerHTML = ''
        + '<textarea id="masterSummaryEdit" style="'
        + 'width:100%;min-height:200px;padding:12px;'
        + 'background:var(--bg);border:1px solid var(--accent);'
        + 'border-radius:8px;font-size:13px;color:var(--text);'
        + 'resize:vertical;line-height:1.6;font-family:inherit;outline:none;'
        + '"></textarea>'
        + '<div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end;">'
        + '<button onclick="MemoryManagerUI.cancelEditSummary()" style="'
        + 'padding:8px 16px;border:1px solid var(--border);border-radius:8px;'
        + 'background:transparent;color:var(--text);cursor:pointer;font-size:13px;'
        + '">取消</button>'
        + '<button onclick="MemoryManagerUI.saveMasterSummary()" style="'
        + 'padding:8px 16px;border:none;border-radius:8px;'
        + 'background:var(--accent);color:white;cursor:pointer;font-size:13px;'
        + '">保存</button>'
        + '</div>';
        // 通过DOM API安全设置textarea的值
        var textarea = document.getElementById('masterSummaryEdit');
        if (textarea) textarea.value = current;
        },
    
    cancelEditSummary: function() {
        this.renderContent();
        },
    
    saveMasterSummary: function() {
        var em = window.EnhancedMemory;
        var edit = document.getElementById('masterSummaryEdit');
        if (!edit) return;

        em.longTermMemory.masterSummary = edit.value;
        em.saveToStorage();

        this.renderContent();
        },
    
    /**
    * 渲染时间线
    */
    renderTimeline: function(em) {
        const self = this;
        var timeline = em.longTermMemory.timeline.slice(-20).reverse();

        if (timeline.length === 0) {
            return '<div style="text-align:center;padding:40px;color:var(--text-tertiary);">暂无时间线数据</div>';
        }

        var html = '<div class="memory-card"><div class="memory-card-title">剧情时间线</div>';

        timeline.forEach(function(item) {
            html += '<div class="memory-timeline-item">' +
            '<div class="memory-timeline-time">' +
            '第' + self._esc(item.turn) + '回合<br>' +
            self._esc(item.relativeTime) +
            '</div>' +
            '<div style="flex:1;">' +
            '<div style="font-weight:600;margin-bottom:4px;">' + self._esc(item.title || '无标题') + '</div>' +
            '<div style="font-size:12px;color:var(--text-secondary);">' +
            (item.events.length > 0 ? '事件: ' + item.events.map(function(e){return self._esc(e);}).join(', ') : '') +
            '</div>' +
            '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">' +
            '出场: ' + item.characters.map(function(c){return self._esc(c);}).join(', ') +
            '</div>' +
            '</div>' +
            '</div>';
            });

        html += '</div>';
        return html;
    },
    
    /**
    * 渲染角色
    */
    renderCharacters: function(em) {
        const self = this;
        var characters = Object.values(em.longTermMemory.characterTable);

        var html = '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;">'
        + '<span>角色档案</span>'
        + '<button onclick="MemoryManagerUI.addCharacter()" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--accent);padding:4px 10px;border-radius:6px;cursor:pointer;">+ 添加角色</button>'
        + '</div>';

        if (characters.length === 0) {
            html += '<div class="memory-empty-state"><div class="memory-empty-state-icon"></div><div>暂无角色数据</div></div>';
            } else {
            characters.forEach(function(char) {
                var safeName = self._escAttr(char.name);
                html += '<div class="memory-character-card">' +
                '<div class="memory-character-avatar">👤</div>' +
                '<div style="flex:1;">' +
                '<div style="font-weight:600;">' + self._esc(char.name) + '</div>' +
                '<div style="font-size:12px;color:var(--text-secondary);">' +
                self._esc(char.title || '') + ' | 关系: ' + self._esc(char.relation || '未知') + ' | 好感: ' + self._esc(char.favorability || 0) +
                '</div>' +
                '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">' +
                self._esc(char.desc || '') +
                '</div>' +
                '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">' +
                '出场 ' + self._esc(char.appearanceCount) + ' 次 | 最后出现: ' + self._esc(em.getRelativeTime(char.lastSeen)) +
                '</div>' +
                '</div>' +
                '<div style="display:flex;flex-direction:column;gap:4px;">' +
                '<button onclick="MemoryManagerUI.editCharacter(\'' + safeName + '\')" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--border);padding:4px 8px;border-radius:6px;cursor:pointer;">编辑</button>' +
                '<button onclick="MemoryManagerUI.deleteCharacter(\'' + safeName + '\')" style="font-size:11px;color:#f44;background:none;border:1px solid var(--border);padding:4px 8px;border-radius:6px;cursor:pointer;">删除</button>' +
                '</div>' +
                '</div>';
                });
        }

        html += '</div>';
        return html;
    },
    
    // ========================================
    // 角色编辑/添加/删除
    // ========================================
    editCharacter: function(name) {
        var em = window.EnhancedMemory;
        var char = em.longTermMemory.characterTable[name];
        if (!char) return;

        var container = document.getElementById('memoryManagerContent');
        container.innerHTML = '<div class="memory-card">' +
        '<div class="memory-card-title">编辑角色: ' + this._esc(name) + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:12px;">' +
        '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">名称</label>' +
        '<input id="editCharName" value="' + this._esc(name) + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>' +
        '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">身份/称号</label>' +
        '<input id="editCharTitle" value="' + this._esc(char.title || '') + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>' +
        '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">关系</label>' +
        '<input id="editCharRelation" value="' + this._esc(char.relation || '') + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>' +
        '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">好感度</label>' +
        '<input id="editCharFav" type="number" value="' + this._esc(char.favorability || 0) + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;"></div>' +
        '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">描述</label>' +
        '<textarea id="editCharDesc" style="width:100%;min-height:80px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;resize:vertical;outline:none;font-family:inherit;">' + this._esc(char.desc || '') + '</textarea></div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
        '<button onclick="MemoryManagerUI.switchTab(\'characters\')" style="padding:10px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;">取消</button>' +
        '<button onclick="MemoryManagerUI.saveCharacter(\'' + this._escAttr(name) + '\')" style="padding:10px 20px;border:none;border-radius:8px;background:var(--accent);color:white;cursor:pointer;font-size:13px;">保存</button>' +
        '</div></div></div>';
        },
    
    saveCharacter: function(oldName) {
        var em = window.EnhancedMemory;
        var newName = document.getElementById('editCharName').value.trim();
        if (!newName) return;

        var char = em.longTermMemory.characterTable[oldName] || {};

        // 如果改了名字，删除旧的
        if (oldName !== newName) {
            delete em.longTermMemory.characterTable[oldName];
        }

        em.longTermMemory.characterTable[newName] = {
            name: newName,
            title: document.getElementById('editCharTitle').value.trim(),
            relation: document.getElementById('editCharRelation').value.trim(),
            favorability: parseInt(document.getElementById('editCharFav').value) || 0,
            desc: document.getElementById('editCharDesc').value.trim(),
            lastSeen: char.lastSeen || Date.now(),
            firstSeen: char.firstSeen || Date.now(),
            appearanceCount: char.appearanceCount || 1,
            history: char.history || []
            };

        em.saveToStorage();
        this.switchTab('characters');
    },

    deleteCharacter: function(name) {
        var em = window.EnhancedMemory;
        if (!em || !em.longTermMemory.characterTable[name]) return;
        delete em.longTermMemory.characterTable[name];
        em.saveToStorage();
        this.switchTab('characters');
        UI.toast('角色已删除');
        },

    addCharacter: function() {
        var em = window.EnhancedMemory;
        var container = document.getElementById('memoryManagerContent');
        container.innerHTML = `
        <div class="memory-card">
        <div class="memory-card-title">➕ 添加角色</div>
        <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
        <label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">名称 *</label>
        <input id="addCharName" placeholder="角色名称" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">
        </div>
        <div>
        <label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">身份/称号</label>
        <input id="addCharTitle" placeholder="如：剑术导师" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">
        </div>
        <div>
        <label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">关系</label>
        <input id="addCharRelation" placeholder="如：朋友、敌人" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">
        </div>
        <div>
        <label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">好感度</label>
        <input id="addCharFav" type="number" value="50" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">
        </div>
        <div>
        <label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">描述</label>
        <textarea id="addCharDesc" placeholder="角色描述..." style="width:100%;min-height:80px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;resize:vertical;outline:none;font-family:inherit;"></textarea>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button onclick="MemoryManagerUI.switchTab('characters')" style="padding:10px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;">取消</button>
        <button onclick="MemoryManagerUI.saveNewCharacter()" style="padding:10px 20px;border:none;border-radius:8px;background:var(--accent);color:white;cursor:pointer;font-size:13px;">添加</button>
        </div>
        </div>
        </div>`;
        },
    
    saveNewCharacter: function() {
        var em = window.EnhancedMemory;
        var name = document.getElementById('addCharName').value.trim();
        if (!name) { alert('请输入角色名称'); return; }

        var now = Date.now();
        em.longTermMemory.characterTable[name] = {
            name: name,
            title: document.getElementById('addCharTitle').value.trim(),
            relation: document.getElementById('addCharRelation').value.trim(),
            favorability: parseInt(document.getElementById('addCharFav').value) || 0,
            desc: document.getElementById('addCharDesc').value.trim(),
            lastSeen: now,
            firstSeen: now,
            appearanceCount: 0,
            history: []
            };

        em.saveToStorage();
        this.switchTab('characters');
        },
    
    /**
    * 渲染物品
    */
    renderItems: function(em) {
        var items = Object.values(em.longTermMemory.itemTable);
        const self = this; // 【修复1 XSS】保存this引用

        var html = '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;">'
        + '<span>物品追踪</span>'
        + '<button onclick="MemoryManagerUI.addItem()" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--accent);padding:4px 10px;border-radius:6px;cursor:pointer;">+ 添加物品</button>'
        + '</div>';

        if (items.length === 0) {
            html += '<div class="memory-empty-state"><div class="memory-empty-state-icon"></div><div>暂无物品数据</div></div>';
            } else {
            items.forEach(function(item) {
                var rarityColor = {
                    '普通': '#999', '精良': '#34c759', '珍稀': '#007aff', '传说': '#ff9500'
                    }[item.rarity] || '#999';

                // 【修复1 XSS】使用字符串拼接 + _esc/_escAttr 转义，防止XSS注入
                html += '<div class="memory-character-card">'
                + '<div class="memory-character-avatar" style="background:' + self._esc(rarityColor) + '20;color:' + self._esc(rarityColor) + ';">📦</div>'
                + '<div style="flex:1;">'
                + '<div style="font-weight:600;">' + self._esc(item.name) + '</div>'
                + '<div style="font-size:12px;color:var(--text-secondary);">'
                + '数量: ' + self._esc(item.count) + ' | 品质: <span style="color:' + self._esc(rarityColor) + ';">' + self._esc(item.rarity || '普通') + '</span>'
                + '</div>'
                + '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">'
                + self._esc(item.desc || '')
                + '</div>'
                + '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">'
                + '获得时间: ' + self._esc(em.getRelativeTime(item.firstAcquired))
                + '</div>'
                + '</div>'
                + '<div style="display:flex;flex-direction:column;gap:4px;">'
                + '<button onclick="MemoryManagerUI.editItem(\'' + self._escAttr(item.name) + '\')" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--border);padding:4px 8px;border-radius:6px;cursor:pointer;">编辑</button>'
                + '<button onclick="MemoryManagerUI.deleteItem(\'' + self._escAttr(item.name) + '\')" style="font-size:11px;color:#f44;background:none;border:1px solid var(--border);padding:4px 8px;border-radius:6px;cursor:pointer;">删除</button>'
                + '</div>'
                + '</div>';
                });
        }

        html += '</div>';
        return html;
    },
    
    // ========================================
    // 物品编辑/添加/删除
    // ========================================
    editItem: function(name) {
        var em = window.EnhancedMemory;
        var item = em.longTermMemory.itemTable[name];
        if (!item) return;

        // 【修复2 XSS】使用字符串拼接 + _esc/_escAttr 转义，防止XSS注入
        var container = document.getElementById('memoryManagerContent');
        container.innerHTML = '<div class="memory-card">'
        + '<div class="memory-card-title">编辑物品: ' + this._esc(name) + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:12px;">'
        + '<div>'
        + '<label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">名称</label>'
        + '<input id="editItemName" value="' + this._esc(name) + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">'
        + '</div>'
        + '<div>'
        + '<label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">数量</label>'
        + '<input id="editItemCount" type="number" value="' + this._esc(item.count || 1) + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">'
        + '</div>'
        + '<div>'
        + '<label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">品质</label>'
        + '<select id="editItemRarity" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">'
        + '<option value="普通"' + (item.rarity === '普通' ? ' selected' : '') + '>普通</option>'
        + '<option value="精良"' + (item.rarity === '精良' ? ' selected' : '') + '>精良</option>'
        + '<option value="珍稀"' + (item.rarity === '珍稀' ? ' selected' : '') + '>珍稀</option>'
        + '<option value="传说"' + (item.rarity === '传说' ? ' selected' : '') + '>传说</option>'
        + '</select>'
        + '</div>'
        + '<div>'
        + '<label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">描述</label>'
        + '<textarea id="editItemDesc" style="width:100%;min-height:80px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;resize:vertical;outline:none;font-family:inherit;">' + this._esc(item.desc || '') + '</textarea>'
        + '</div>'
        + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
        + '<button onclick="MemoryManagerUI.switchTab(\'items\')" style="padding:10px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;">取消</button>'
        + '<button onclick="MemoryManagerUI.saveItem(\'' + this._escAttr(name) + '\')" style="padding:10px 20px;border:none;border-radius:8px;background:var(--accent);color:white;cursor:pointer;font-size:13px;">保存</button>'
        + '</div>'
        + '</div>'
        + '</div>';
        },
    
    saveItem: function(oldName) {
        var em = window.EnhancedMemory;
        var newName = document.getElementById('editItemName').value.trim();
        if (!newName) return;

        var item = em.longTermMemory.itemTable[oldName] || {};
        if (oldName !== newName) delete em.longTermMemory.itemTable[oldName];

        em.longTermMemory.itemTable[newName] = {
            name: newName,
            count: parseInt(document.getElementById('editItemCount').value) || 1,
            rarity: document.getElementById('editItemRarity').value,
            desc: document.getElementById('editItemDesc').value.trim(),
            firstAcquired: item.firstAcquired || Date.now(),
            lastUpdate: Date.now(),
            changeHistory: item.changeHistory || []
            };

        em.saveToStorage();
        this.switchTab('items');
        },
    
    deleteItem: function(name) {
        var em = window.EnhancedMemory;
        if (!em || !em.longTermMemory.itemTable[name]) return;
        delete em.longTermMemory.itemTable[name];
        em.saveToStorage();
        this.switchTab('items');
        UI.toast('物品已删除');
        },
    
    addItem: function() {
        var container = document.getElementById('memoryManagerContent');
        container.innerHTML = `
        <div class="memory-card">
        <div class="memory-card-title">➕ 添加物品</div>
        <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
        <label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">名称 *</label>
        <input id="addItemName" placeholder="物品名称" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">
        </div>
        <div>
        <label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">数量</label>
        <input id="addItemCount" type="number" value="1" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">
        </div>
        <div>
        <label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">品质</label>
        <select id="addItemRarity" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">
        <option value="普通">普通</option>
        <option value="精良">精良</option>
        <option value="珍稀">珍稀</option>
        <option value="传说">传说</option>
        </select>
        </div>
        <div>
        <label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">描述</label>
        <textarea id="addItemDesc" placeholder="物品描述..." style="width:100%;min-height:80px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;resize:vertical;outline:none;font-family:inherit;"></textarea>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button onclick="MemoryManagerUI.switchTab('items')" style="padding:10px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;">取消</button>
        <button onclick="MemoryManagerUI.saveNewItem()" style="padding:10px 20px;border:none;border-radius:8px;background:var(--accent);color:white;cursor:pointer;font-size:13px;">添加</button>
        </div>
        </div>
        </div>`;
        },
    
    saveNewItem: function() {
        var em = window.EnhancedMemory;
        var name = document.getElementById('addItemName').value.trim();
        if (!name) { alert('请输入物品名称'); return; }

        var now = Date.now();
        em.longTermMemory.itemTable[name] = {
            name: name,
            count: parseInt(document.getElementById('addItemCount').value) || 1,
            rarity: document.getElementById('addItemRarity').value,
            desc: document.getElementById('addItemDesc').value.trim(),
            firstAcquired: now,
            lastUpdate: now,
            changeHistory: [{ time: now, count: 1, change: '获得' }]
            };

        em.saveToStorage();
        this.switchTab('items');
        },
    
    /**
    * 渲染事件
    */
    renderEvents: function(em) {
        var events = em.longTermMemory.importantEvents.slice(-20).reverse();
        const self = this; // 【修复3 XSS】保存this引用

        var html = '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;">'
        + '<span>重要事件</span>'
        + '<button onclick="MemoryManagerUI.addEvent()" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--accent);padding:4px 10px;border-radius:6px;cursor:pointer;">+ 添加事件</button>'
        + '</div>';

        if (events.length === 0) {
            html += '<div class="memory-empty-state"><div class="memory-empty-state-icon"></div><div>暂无重要事件</div></div>';
            } else {
            events.forEach(function(event, idx) {
                var realIdx = em.longTermMemory.importantEvents.length - 1 - idx;
                // 【修复3 XSS】使用字符串拼接 + _esc 转义，防止XSS注入
                html += '<div class="memory-event-item" style="display:flex;align-items:flex-start;gap:8px;">'
                + '<div style="flex:1;">'
                + '<div style="font-weight:600;margin-bottom:4px;">' + self._esc(event.content) + '</div>'
                + '<div style="font-size:11px;color:var(--text-tertiary);">'
                + '第' + self._esc(event.turn) + '回合 | ' + self._esc(em.getRelativeTime(event.timestamp)) + ' | 重要度: ' + self._esc(event.importance) + '/10'
                + '</div>'
                + '</div>'
                + '<div style="display:flex;flex-direction:column;gap:4px;">'
                + '<button onclick="MemoryManagerUI.editEvent(' + realIdx + ')" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--border);padding:4px 8px;border-radius:6px;cursor:pointer;">编辑</button>'
                + '<button onclick="MemoryManagerUI.deleteEvent(' + realIdx + ')" style="font-size:11px;color:#f44;background:none;border:1px solid var(--border);padding:4px 8px;border-radius:6px;cursor:pointer;">删除</button>'
                + '</div>'
                + '</div>';
                });
        }

        html += '</div>';
        return html;
    },
    
    // ========================================
    // 事件编辑/添加/删除
    // ========================================
    editEvent: function(index) {
        var em = window.EnhancedMemory;
        var event = em.longTermMemory.importantEvents[index];
        if (!event) return;

        // 【修复4 XSS】使用字符串拼接 + _esc 转义，防止XSS注入
        var container = document.getElementById('memoryManagerContent');
        container.innerHTML = '<div class="memory-card">'
        + '<div class="memory-card-title">编辑事件</div>'
        + '<div style="display:flex;flex-direction:column;gap:12px;">'
        + '<div>'
        + '<label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">事件内容</label>'
        + '<textarea id="editEventContent" style="width:100%;min-height:100px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;resize:vertical;outline:none;font-family:inherit;">' + this._esc(event.content) + '</textarea>'
        + '</div>'
        + '<div>'
        + '<label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">重要度 (1-10)</label>'
        + '<input id="editEventImportance" type="number" min="1" max="10" value="' + this._esc(event.importance || 5) + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">'
        + '</div>'
        + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
        + '<button onclick="MemoryManagerUI.switchTab(\'events\')" style="padding:10px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;">取消</button>'
        + '<button onclick="MemoryManagerUI.saveEvent(' + index + ')" style="padding:10px 20px;border:none;border-radius:8px;background:var(--accent);color:white;cursor:pointer;font-size:13px;">保存</button>'
        + '</div>'
        + '</div>'
        + '</div>';
        },
    
    saveEvent: function(index) {
        var em = window.EnhancedMemory;
        var content = document.getElementById('editEventContent').value.trim();
        if (!content) { alert('事件内容不能为空'); return; }

        em.longTermMemory.importantEvents[index].content = content;
        em.longTermMemory.importantEvents[index].importance = parseInt(document.getElementById('editEventImportance').value) || 5;
        em.saveToStorage();
        this.switchTab('events');
        },
    
    deleteEvent: function(index) {
        var em = window.EnhancedMemory;
        if (!em || !em.longTermMemory.importantEvents[index]) return;
        em.longTermMemory.importantEvents.splice(index, 1);
        em.saveToStorage();
        this.switchTab('events');
        UI.toast('事件已删除');
        },
    
    addEvent: function() {
        var container = document.getElementById('memoryManagerContent');
        container.innerHTML = `
        <div class="memory-card">
        <div class="memory-card-title">➕ 添加事件</div>
        <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
        <label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">事件内容 *</label>
        <textarea id="addEventContent" placeholder="描述发生了什么重要事件..." style="width:100%;min-height:100px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;resize:vertical;outline:none;font-family:inherit;"></textarea>
        </div>
        <div>
        <label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">重要度 (1-10)</label>
        <input id="addEventImportance" type="number" min="1" max="10" value="5" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button onclick="MemoryManagerUI.switchTab('events')" style="padding:10px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;">取消</button>
        <button onclick="MemoryManagerUI.saveNewEvent()" style="padding:10px 20px;border:none;border-radius:8px;background:var(--accent);color:white;cursor:pointer;font-size:13px;">添加</button>
        </div>
        </div>
        </div>`;
        },
    
    saveNewEvent: function() {
        var em = window.EnhancedMemory;
        var content = document.getElementById('addEventContent').value.trim();
        if (!content) { alert('请输入事件内容'); return; }

        em.longTermMemory.importantEvents.push({
            content: content,
            turn: em.stats.totalMessages || 0,
            timestamp: Date.now(),
            importance: parseInt(document.getElementById('addEventImportance').value) || 5
            });
        // 【修复】限制重要事件数量
        if (em.longTermMemory.importantEvents.length > 50) {
            em.longTermMemory.importantEvents = em.longTermMemory.importantEvents.slice(-50);
        }

        em.saveToStorage();
        this.switchTab('events');
    },
    
    /**
    * 渲染搜索
    */
    renderSearch: function(em) {
        return `
        <div class="memory-card">
        <div class="memory-card-title">记忆搜索</div>
        <input type="text" class="memory-search-input"
        placeholder="搜索角色、物品、事件..."
        onkeyup="MemoryManagerUI.performSearch(this.value)">
        <div id="memorySearchResults" class="memory-search-results">
        <div style="text-align:center;padding:20px;color:var(--text-tertiary);">
        输入关键词开始搜索
        </div>
        </div>
        </div>
        `;
        },
    
    /**
    * 执行搜索
    */
    performSearch: function(keyword) {
        if (!keyword || keyword.length < 2) return;

        var em = window.EnhancedMemory;
        var results = em.search(keyword);
        var container = document.getElementById('memorySearchResults');

        var html = '';

        // 角色结果
        if (results.characters.length > 0) {
            html += '<div style="margin-bottom:16px;"><div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px;">角色</div>';
            results.characters.forEach(function(char) {
                html += `<div class="memory-character-card">
                <div class="memory-character-avatar">👤</div>
                <div><div style="font-weight:600;">${escapeHtml(char.name)}</div>
                <div style="font-size:12px;color:var(--text-secondary);">${char.title || ''}</div></div>
                </div>`;
                });
            html += '</div>';
        }

        // 事件结果
        if (results.events.length > 0) {
            html += '<div style="margin-bottom:16px;"><div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px;">事件</div>';
            results.events.forEach(function(event) {
                html += `<div class="memory-event-item">${event.content}</div>`;
                });
            html += '</div>';
        }

    // 物品结果
    if (results.items.length > 0) {
        html += '<div><div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px;">物品</div>';
        results.items.forEach(function(item) {
            html += `<div class="memory-character-card">
            <div class="memory-character-avatar">📦</div>
            <div><div style="font-weight:600;">${item.name}</div>
            <div style="font-size:12px;color:var(--text-secondary);">数量: ${item.count}</div></div>
            </div>`;
            });
        html += '</div>';
    }

    if (html === '') {
        html = '<div style="text-align:center;padding:20px;color:var(--text-tertiary);">未找到相关记忆</div>';
    }

    container.innerHTML = html;
    },
    
    /**
    * 渲染地点
    */
    renderLocations: function(em) {
        var locations = Object.values(em.longTermMemory.locationTable);

        if (locations.length === 0) {
            return '<div class="memory-empty-state"><div class="memory-empty-state-icon"></div><div>暂无地点数据</div><div style="font-size:13px;margin-top:8px;">AI会在剧情中自动记录地点</div></div>';
        }

        var html = '<div class="memory-card">'
        + '<div class="memory-card-title" style="justify-content:space-between;">'
        + '<span>地点记录</span>'
        + '<button onclick="MemoryManagerUI.addLocation()" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--accent);padding:4px 10px;border-radius:6px;cursor:pointer;">+ 添加地点</button>'
        + '</div>';

        locations.sort(function(a, b) { return b.visitCount - a.visitCount; }).forEach(function(loc) {
            html += `
            <div class="memory-location-card" style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg);border-radius:8px;margin-bottom:8px;">
            <div style="font-size:24px;"></div>
            <div style="flex:1;">
            <div style="font-weight:600;">${escapeHtml(loc.name)}</div>
            <div style="font-size:12px;color:var(--text-secondary);">
            访问 ${loc.visitCount} 次
            </div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">
            首次: ${em.getRelativeTime(loc.firstVisited)} |
            最近: ${em.getRelativeTime(loc.lastVisited)}
            </div>
            </div>
            <div style="display:flex;gap:4px;">
            <button onclick="MemoryManagerUI.editLocation('${escapeHtml(loc.name).replace(/'/g, "\\\\'")}')" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--border);padding:4px 8px;border-radius:6px;cursor:pointer;">编辑</button>
            <button onclick="MemoryManagerUI.deleteLocation('${escapeHtml(loc.name).replace(/'/g, "\\\\'")}')" style="font-size:11px;color:#f44;background:none;border:1px solid var(--border);padding:4px 8px;border-radius:6px;cursor:pointer;">删除</button>
            </div>
            </div>
            `;
            });

        html += '</div>';
        return html;
    },
    
    // 编辑地点
    editLocation: function(name) {
        var em = window.EnhancedMemory;
        var loc = em.longTermMemory.locationTable[name];
        if (!loc) return;

        var container = document.getElementById('memoryManagerContent');
        container.innerHTML = `
        <div class="memory-card">
        <div class="memory-card-title">编辑地点</div>
        <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
        <label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">地点名称</label>
        <input type="text" id="editLocName" value="${loc.name}" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;" placeholder="地点名称...">
        </div>
        <div>
        <label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">访问次数</label>
        <input type="number" id="editLocCount" value="${loc.visitCount}" min="1" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button onclick="MemoryManagerUI.switchTab('locations')" style="padding:10px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;">取消</button>
        <button onclick="MemoryManagerUI.saveLocation('${name}')" style="padding:10px 20px;border:none;border-radius:8px;background:var(--accent);color:white;cursor:pointer;font-size:13px;">保存</button>
        </div>
        </div>
        </div>`;
        },
    
    // 保存地点
    saveLocation: function(oldName) {
        var em = window.EnhancedMemory;
        var newName = document.getElementById('editLocName').value.trim();
        var newCount = parseInt(document.getElementById('editLocCount').value) || 1;

        if (!newName) { alert('请输入地点名称'); return; }

        var loc = em.longTermMemory.locationTable[oldName];
        if (!loc) return;

        // 如果改名了，删除旧条目
        if (newName !== oldName) {
            delete em.longTermMemory.locationTable[oldName];
        }

        em.longTermMemory.locationTable[newName] = {
            name: newName,
            visitCount: newCount,
            firstVisited: loc.firstVisited,
            lastVisited: loc.lastVisited
            };

        em.saveToStorage();
        this.switchTab('locations');
    },

    // 删除地点
    deleteLocation: function(name) {
        var em = window.EnhancedMemory;
        if (!em || !em.longTermMemory.locationTable[name]) return;
        delete em.longTermMemory.locationTable[name];
        em.saveToStorage();
        this.switchTab('locations');
        UI.toast('地点已删除');
        },

    // ========================================
    // 世界观设定页面
    // ========================================
    renderWorld: function(em) {
        const self = this;
        // 从世界书读取条目（世界页面是世界书的简约管理入口）
        var allEntries = {};
        if (typeof WorldInfo !== 'undefined') {
            var books = WorldInfo.books || [];
            books.forEach(function(book) {
                if (!book.enabled) return;
                var entries = book.entries || {};
                Object.keys(entries).forEach(function(uid) {
                    var entry = entries[uid];
                    if (entry && entry.enabled !== false) {
                        allEntries[uid] = entry;
                    }
                });
            });
        }
    // 也显示 worldNotes（兼容旧数据）
    var notes = em.longTermMemory.worldNotes || [];

    var html = '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;">'
    + '<span>🌍 世界设定</span>'
    + '<div style="display:flex;gap:6px;">'
    + '<button onclick="MemoryManagerUI.addWorldNote()" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--accent);padding:4px 10px;border-radius:6px;cursor:pointer;">+ 快速添加</button>'
    + '</div>'
    + '</div>'
    + '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:12px;">快速管理世界书条目 · 添加的设定会自动生成关键词并注入AI上下文</div>';

    // 渲染世界书条目
    var entryKeys = Object.keys(allEntries);
    if (entryKeys.length > 0) {
        html += '<div style="font-size:11px;color:var(--accent);margin-bottom:8px;">📖 世界书条目（' + entryKeys.length + '条）</div>';
        entryKeys.forEach(function(uid) {
            var entry = allEntries[uid];
            var keywords = (entry.key || []).join(', ');
            var content = entry.content || '';
            var preview = content.length > 80 ? content.substring(0, 80) + '...' : content;
            html += '<div class="memory-event-item" style="display:flex;align-items:flex-start;gap:8px;">'
            + '<div style="flex:1;">'
            + '<div style="font-weight:600;margin-bottom:4px;">' + self._esc(entry.comment || '未命名') + '</div>'
            + '<div style="font-size:12px;color:var(--text-secondary);white-space:pre-wrap;line-height:1.5;">' + self._esc(preview) + '</div>'
            + '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">'
            + '关键词: ' + self._esc(keywords || '无')
            + '</div>'
            + '</div>'
            + '<div style="display:flex;flex-direction:column;gap:4px;">'
            + '<button onclick="MemoryManagerUI.editWorldEntry(\'' + uid + '\')" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--border);padding:4px 8px;border-radius:6px;cursor:pointer;">编辑</button>'
            + '<button onclick="MemoryManagerUI.deleteWorldEntry(\'' + uid + '\')" style="font-size:11px;color:#f44;background:none;border:1px solid var(--border);padding:4px 8px;border-radius:6px;cursor:pointer;">删除</button>'
            + '</div>'
            + '</div>';
            });
    }

    // 渲染旧版 worldNotes（兼容）
    if (notes.length > 0) {
        html += '<div style="font-size:11px;color:var(--text-tertiary);margin:12px 0 8px;">📝 本地笔记（' + notes.length + '条，仅记录不注入AI）</div>';
        notes.forEach(function(note, idx) {
            var realIdx = em.longTermMemory.worldNotes.length - 1 - idx;
            html += '<div class="memory-event-item" style="display:flex;align-items:flex-start;gap:8px;">'
            + '<div style="flex:1;">'
            + '<div style="font-weight:600;margin-bottom:4px;">' + self._esc(note.title || '无标题') + '</div>'
            + '<div style="font-size:13px;color:var(--text-secondary);white-space:pre-wrap;line-height:1.5;">' + self._esc(note.content || '') + '</div>'
            + '</div>'
            + '<div style="display:flex;flex-direction:column;gap:4px;">'
            + '<button onclick="MemoryManagerUI.editWorldNote(' + realIdx + ')" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--border);padding:4px 8px;border-radius:6px;cursor:pointer;">编辑</button>'
            + '<button onclick="MemoryManagerUI.deleteWorldNote(' + realIdx + ')" style="font-size:11px;color:#f44;background:none;border:1px solid var(--border);padding:4px 8px;border-radius:6px;cursor:pointer;">删除</button>'
            + '</div>'
            + '</div>';
            });
    }

    if (entryKeys.length === 0 && notes.length === 0) {
        html += '<div class="memory-empty-state"><div class="memory-empty-state-icon"></div><div>暂无世界设定</div><div style="font-size:12px;margin-top:4px;">点击上方按钮快速添加，设定会自动注入AI上下文</div></div>';
    }

    html += '</div>';
    return html;
    },

    addWorldNote: function() {
        var container = document.getElementById('memoryManagerContent');
        container.innerHTML = '<div class="memory-card">'
        + '<div class="memory-card-title">➕ 快速添加世界设定</div>'
        + '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:12px;">设定将自动保存到世界书，并从标题和内容中提取关键词</div>'
        + '<div style="display:flex;flex-direction:column;gap:12px;">'
        + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">标题 *</label>'
        + '<input id="addWNTitle" placeholder="如：魔法体系、势力分布" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">'
        + '</div>'
        + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">内容 *（支持长文本，几千字也没问题）</label>'
        + '<textarea id="addWNContent" placeholder="详细描述这个设定...&#10;&#10;系统会自动从标题和内容中提取关键词，用于触发注入。" style="width:100%;min-height:200px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;resize:vertical;outline:none;font-family:inherit;"></textarea>'
        + '</div>'
        + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
        + '<button onclick="MemoryManagerUI.switchTab(\'world\')" style="padding:10px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;">取消</button>'
        + '<button onclick="MemoryManagerUI.saveNewWorldNote()" style="padding:10px 20px;border:none;border-radius:8px;background:var(--accent);color:white;cursor:pointer;font-size:13px;">添加到世界书</button>'
        + '</div></div></div>';
        },

    saveNewWorldNote: function() {
        var title = document.getElementById('addWNTitle').value.trim();
        var content = document.getElementById('addWNContent').value.trim();
        if (!title || !content) { UI.toast('请填写标题和内容'); return; }

        // 自动从标题和内容中提取关键词
        var keywords = _extractKeywords(title + ' ' + content);
        // 确保标题本身也是关键词
        if (keywords.indexOf(title) === -1 && title.length <= 10) {
            keywords.unshift(title);
        }

        // 保存到世界书
        if (typeof WorldInfo === 'undefined') {
            UI.toast('世界书未初始化');
            return;
        }

    // 确保至少有一本书
    if (WorldInfo.books.length === 0) {
        WorldInfo.books.push({
            id: 'book_' + Date.now(),
            name: '游戏设定',
            enabled: true,
            entries: {}
            });
    }

    // 找到第一本启用的书
    var targetBook = null;
    for (var i = 0; i < WorldInfo.books.length; i++) {
        if (WorldInfo.books[i].enabled) {
            targetBook = WorldInfo.books[i];
            break;
        }
    }
    if (!targetBook) {
        targetBook = WorldInfo.books[0];
        targetBook.enabled = true;
    }

    var uid = Date.now() + Math.floor(Math.random() * 1000);
    targetBook.entries[uid] = {
        uid: uid,
        key: keywords,
        keysecondary: [],
        content: content,
        comment: title,
        constant: false,
        selective: false,
        enabled: true,
        order: 100,
        probability: 100,
        depth: 4,
        position: 0,
        role: 0,
        group: '',
        groupOverride: false,
        groupWeight: 100,
        scanDepth: null,
        caseSensitive: null,
        matchWholeWords: null,
        excludeRecursion: false,
        preventRecursion: false,
        selectiveLogic: 0,
        sticky: null,
        cooldown: null,
        delay: null,
        delayUntilRecursion: false,
        ignoreBudget: false,
        addMemo: false,
        useGroupScoring: null,
        useProbability: true,
        vectorized: false,
        triggers: [],
        matchPersonaDescription: false,
        matchCharacterDescription: false,
        automationId: '',
        outletName: ''
        };

    WorldInfo.save();
    this.switchTab('world');
    UI.toast('已添加到世界书（关键词: ' + keywords.slice(0, 5).join(', ') + '）');
    },

    editWorldNote: function(index) {
        var em = window.EnhancedMemory;
        var note = em.longTermMemory.worldNotes[index];
        if (!note) return;

        var container = document.getElementById('memoryManagerContent');
        var cats = ['规则','设定','灵感','势力','历史','地理','其他'];
        var optionsHtml = cats.map(function(c) {
            return '<option value="' + c + '"' + (note.category === c ? ' selected' : '') + '>' + c + '</option>';
            }).join('');

        container.innerHTML = '<div class="memory-card">'
        + '<div class="memory-card-title">编辑世界观设定</div>'
        + '<div style="display:flex;flex-direction:column;gap:12px;">'
        + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">标题</label>'
        + '<input id="editWNTitle" value="' + this._esc(note.title || '') + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">'
        + '</div>'
        + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">分类</label>'
        + '<select id="editWNCategory" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">'
        + optionsHtml + '</select>'
        + '</div>'
        + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">内容</label>'
        + '<textarea id="editWNContent" style="width:100%;min-height:150px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;resize:vertical;outline:none;font-family:inherit;">' + this._esc(note.content || '') + '</textarea>'
        + '</div>'
        + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
        + '<button onclick="MemoryManagerUI.switchTab(\'world\')" style="padding:10px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;">取消</button>'
        + '<button onclick="MemoryManagerUI.saveWorldNote(' + index + ')" style="padding:10px 20px;border:none;border-radius:8px;background:var(--accent);color:white;cursor:pointer;font-size:13px;">保存</button>'
        + '</div></div></div>';
        },

    saveWorldNote: function(index) {
        var em = window.EnhancedMemory;
        var title = document.getElementById('editWNTitle').value.trim();
        var content = document.getElementById('editWNContent').value.trim();
        if (!title || !content) { UI.toast('请填写标题和内容'); return; }

        em.longTermMemory.worldNotes[index].title = title;
        em.longTermMemory.worldNotes[index].category = document.getElementById('editWNCategory').value;
        em.longTermMemory.worldNotes[index].content = content;
        em.saveToStorage();
        this.switchTab('world');
        },

    deleteWorldNote: function(index) {
        var em = window.EnhancedMemory;
        if (!em || !em.longTermMemory.worldNotes || !em.longTermMemory.worldNotes[index]) return;
        em.longTermMemory.worldNotes.splice(index, 1);
        em.saveToStorage();
        this.switchTab('world');
        UI.toast('设定已删除');
        },

    // ========================================
    // 世界书条目编辑/删除（从世界页面操作）
    // ========================================
    editWorldEntry: function(uid) {
        if (typeof WorldInfo === 'undefined') return;
        var entry = null;
        var book = null;
        for (var i = 0; i < WorldInfo.books.length; i++) {
            if (WorldInfo.books[i].entries && WorldInfo.books[i].entries[uid]) {
                entry = WorldInfo.books[i].entries[uid];
                book = WorldInfo.books[i];
                break;
            }
        }
    if (!entry) { UI.toast('条目不存在'); return; }

    var container = document.getElementById('memoryManagerContent');
    container.innerHTML = '<div class="memory-card">'
    + '<div class="memory-card-title">编辑世界书条目</div>'
    + '<div style="display:flex;flex-direction:column;gap:12px;">'
    + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">标题</label>'
    + '<input id="editWETitle" value="' + this._esc(entry.comment || '') + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">'
    + '</div>'
    + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">关键词（逗号分隔，用于触发注入）</label>'
    + '<input id="editWEKeys" value="' + this._esc((entry.key || []).join(', ')) + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;" placeholder="如：剑修,剑气,剑意">'
    + '</div>'
    + '<div><label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">内容</label>'
    + '<textarea id="editWEContent" style="width:100%;min-height:200px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;resize:vertical;outline:none;font-family:inherit;">' + this._esc(entry.content || '') + '</textarea>'
    + '</div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
    + '<button onclick="MemoryManagerUI.switchTab(\'world\')" style="padding:10px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;">取消</button>'
    + '<button onclick="MemoryManagerUI.saveWorldEntry(\'' + uid + '\')" style="padding:10px 20px;border:none;border-radius:8px;background:var(--accent);color:white;cursor:pointer;font-size:13px;">保存</button>'
    + '</div></div></div>';
    },

    saveWorldEntry: function(uid) {
        if (typeof WorldInfo === 'undefined') return;
        var title = document.getElementById('editWETitle').value.trim();
        var keysStr = document.getElementById('editWEKeys').value.trim();
        var content = document.getElementById('editWEContent').value.trim();
        if (!content) { UI.toast('内容不能为空'); return; }

        var keywords = keysStr ? keysStr.split(/[,，]/).map(function(k) { return k.trim(); }).filter(Boolean) : [];

        for (var i = 0; i < WorldInfo.books.length; i++) {
            if (WorldInfo.books[i].entries && WorldInfo.books[i].entries[uid]) {
                WorldInfo.books[i].entries[uid].comment = title;
                WorldInfo.books[i].entries[uid].key = keywords;
                WorldInfo.books[i].entries[uid].content = content;
                break;
            }
        }

    WorldInfo.save();
    this.switchTab('world');
    UI.toast('世界书条目已更新');
    },

    deleteWorldEntry: function(uid) {
        if (typeof WorldInfo === 'undefined') return;
        for (var i = 0; i < WorldInfo.books.length; i++) {
            if (WorldInfo.books[i].entries && WorldInfo.books[i].entries[uid]) {
                delete WorldInfo.books[i].entries[uid];
                break;
            }
        }
    WorldInfo.save();
    this.switchTab('world');
    UI.toast('世界书条目已删除');
    },

    // 添加地点
    addLocation: function() {
        var container = document.getElementById('memoryManagerContent');
        container.innerHTML = `
        <div class="memory-card">
        <div class="memory-card-title">➕ 添加地点</div>
        <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
        <label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">地点名称 *</label>
        <input type="text" id="addLocName" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;" placeholder="输入地点名称...">
        </div>
        <div>
        <label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:4px;">访问次数</label>
        <input type="number" id="addLocCount" value="1" min="1" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button onclick="MemoryManagerUI.switchTab('locations')" style="padding:10px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;">取消</button>
        <button onclick="MemoryManagerUI.saveNewLocation()" style="padding:10px 20px;border:none;border-radius:8px;background:var(--accent);color:white;cursor:pointer;font-size:13px;">添加</button>
        </div>
        </div>
        </div>`;
        },
    
    // 保存新地点
    saveNewLocation: function() {
        var em = window.EnhancedMemory;
        var name = document.getElementById('addLocName').value.trim();
        var count = parseInt(document.getElementById('addLocCount').value) || 1;

        if (!name) { alert('请输入地点名称'); return; }
        if (em.longTermMemory.locationTable[name]) { alert('地点 "' + name + '" 已存在'); return; }

        var now = Date.now();
        em.longTermMemory.locationTable[name] = {
            name: name,
            visitCount: count,
            firstVisited: now,
            lastVisited: now
            };

        em.saveToStorage();
        this.switchTab('locations');
        },

    /**
     * 渲染注入预览调试面板
     */
    renderInjectionPreview: function(em) {
        var injection = em.buildSmartInjection ? em.buildSmartInjection() : '';
        var stats = em._lastInjectionStats || { totalChars: 0, budget: 0, moduleChars: {} };
        var mc = stats.moduleChars || {};

        var html = '<div class="memory-card">'
            + '<div class="memory-card-title" style="justify-content:space-between;">'
            + '<span>🧠 记忆注入预览</span>'
            + '<span style="font-size:12px;color:var(--text-tertiary);">'
            + '总字符: ' + stats.totalChars + ' / 预算: ' + stats.budget
            + ' (' + (stats.budget > 0 ? Math.round(stats.totalChars / stats.budget * 100) : 0) + '%)'
            + '</span>'
            + '</div>'
            + '<div style="margin-bottom:12px;font-size:12px;color:var(--text-secondary);line-height:1.6;">'
            + '这是本回合实际发送给AI的记忆内容。如果AI忘记设定，检查"永久事实"是否包含；如果AI忘记近期剧情，检查"最近对话"和"当前进展"。'
            + '</div>'
            + '<div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:8px;margin-bottom:16px;">'
            + '<div style="padding:8px;background:var(--bg);border-radius:6px;text-align:center;">'
            + '<div style="font-size:11px;color:var(--text-tertiary);">永久事实</div>'
            + '<div style="font-size:14px;font-weight:600;">' + (mc.worldAnchors || 0) + '字</div>'
            + '</div>'
            + '<div style="padding:8px;background:var(--bg);border-radius:6px;text-align:center;">'
            + '<div style="font-size:11px;color:var(--text-tertiary);">约定</div>'
            + '<div style="font-size:14px;font-weight:600;">' + (mc.activeQuests || 0) + '字</div>'
            + '</div>'
            + '<div style="padding:8px;background:var(--bg);border-radius:6px;text-align:center;">'
            + '<div style="font-size:11px;color:var(--text-tertiary);">剧情</div>'
            + '<div style="font-size:14px;font-weight:600;">' + (mc.currentPlot || 0) + '字</div>'
            + '</div>'
            + '<div style="padding:8px;background:var(--bg);border-radius:6px;text-align:center;">'
            + '<div style="font-size:11px;color:var(--text-tertiary);">角色</div>'
            + '<div style="font-size:14px;font-weight:600;">' + (mc.characters || 0) + '字</div>'
            + '</div>'
            + '<div style="padding:8px;background:var(--bg);border-radius:6px;text-align:center;">'
            + '<div style="font-size:11px;color:var(--text-tertiary);">事件</div>'
            + '<div style="font-size:14px;font-weight:600;">' + (mc.events || 0) + '字</div>'
            + '</div>'
            + '<div style="padding:8px;background:var(--bg);border-radius:6px;text-align:center;">'
            + '<div style="font-size:11px;color:var(--text-tertiary);">物品</div>'
            + '<div style="font-size:14px;font-weight:600;">' + (mc.items || 0) + '字</div>'
            + '</div>'
            + '<div style="padding:8px;background:var(--bg);border-radius:6px;text-align:center;">'
            + '<div style="font-size:11px;color:var(--text-tertiary);">最近对话</div>'
            + '<div style="font-size:14px;font-weight:600;">' + (mc.workingMemory || 0) + '字</div>'
            + '</div>'
            + '<div style="padding:8px;background:var(--bg);border-radius:6px;text-align:center;">'
            + '<div style="font-size:11px;color:var(--text-tertiary);">剩余预算</div>'
            + '<div style="font-size:14px;font-weight:600;">' + Math.max(0, stats.budget - stats.totalChars) + '字</div>'
            + '</div>'
            + '</div>'
            + '<div style="padding:12px;background:#1a1a2e;border-radius:8px;max-height:500px;overflow-y:auto;">'
            + '<pre style="margin:0;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-all;color:#e0e0e0;font-family:monospace;">'
            + this._esc(injection || '（暂无注入内容）')
            + '</pre>'
            + '</div>'
            + '</div>';

        // 场景相关性提示
        var topic = em.detectCurrentTopic ? em.detectCurrentTopic() : { characters: [], items: [], locations: [] };
        if (topic.characters.length > 0 || topic.items.length > 0 || topic.locations.length > 0) {
            html += '<div class="memory-card">'
                + '<div class="memory-card-title">🔍 当前场景检测</div>'
                + '<div style="font-size:12px;color:var(--text-secondary);line-height:1.6;">'
                + '以下角色/物品/地点在当前对话中被检测到，已优先注入：<br>'
                + (topic.characters.length > 0 ? '角色: ' + topic.characters.join(', ') + '<br>' : '')
                + (topic.items.length > 0 ? '物品: ' + topic.items.join(', ') + '<br>' : '')
                + (topic.locations.length > 0 ? '地点: ' + topic.locations.join(', ') + '<br>' : '')
                + '</div>'
                + '</div>';
        }

        return html;
    }
};

window.MemoryManagerUI = MemoryManagerUI;

// === 永久事实（worldAnchors）编辑面板 ===
MemoryManagerUI.renderAnchors = function(em) {
    var self = this;
    var anchors = (em.longTermMemory && em.longTermMemory.worldAnchors) || [];
    var typeLabels = {
        pc_identity: '🎭 主角',
        setting: '🌍 世界设定',
        world_rule: '📜 设定规则',
        npc_profile: '👤 关键角色',
        promise: '🤝 玩家承诺'
    };
    // 按 type 分组
    var byType = {};
    anchors.forEach(function(a, i) {
        if (!byType[a.type]) byType[a.type] = [];
        byType[a.type].push({ a: a, idx: i });
    });
    var typeOrder = ['pc_identity', 'setting', 'world_rule', 'npc_profile', 'promise'];

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
        + '<div style="font-size:13px;color:var(--text-tertiary);">永久事实——任何情况下 AI 都会优先看到。AI 记错就改这里。</div>'
        + '<button onclick="MemoryManagerUI.addWorldAnchor()" style="font-size:12px;color:white;background:var(--accent);border:none;padding:6px 14px;border-radius:6px;cursor:pointer;">+ 手动添加</button>'
        + '</div>';

    if (anchors.length === 0) {
        html += '<div style="text-align:center;padding:40px;color:var(--text-tertiary);">还没有永久事实。开始游戏后会自动从世界设定提取，你也可以手动添加。</div>';
    }

    typeOrder.forEach(function(t) {
        var list = byType[t];
        if (!list || list.length === 0) return;
        html += '<div class="memory-card">'
            + '<div class="memory-card-title">' + (typeLabels[t] || t) + ' <span style="font-weight:normal;font-size:11px;color:var(--text-tertiary);">' + list.length + ' 条</span></div>';
        list.forEach(function(entry) {
            var a = entry.a;
            var i = entry.idx;
            var sourceTag = a.source === 'manual' ? '<span style="font-size:10px;background:#4a4;color:white;padding:1px 6px;border-radius:4px;margin-left:6px;">手动</span>' :
                            a.source === 'auto' ? '<span style="font-size:10px;background:#666;color:white;padding:1px 6px;border-radius:4px;margin-left:6px;">自动</span>' : '';
            html += '<div style="padding:10px 12px;background:var(--bg);border-radius:8px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">'
                + '<div style="flex:1;font-size:13px;line-height:1.6;word-break:break-all;">' + self._esc(a.content) + sourceTag + '</div>'
                + '<div style="display:flex;gap:4px;flex-shrink:0;">'
                + '<button onclick="MemoryManagerUI.editWorldAnchor(' + i + ')" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--border);padding:3px 8px;border-radius:6px;cursor:pointer;">编辑</button>'
                + '<button onclick="MemoryManagerUI.deleteWorldAnchor(' + i + ')" style="font-size:11px;color:#f44;background:none;border:1px solid var(--border);padding:3px 8px;border-radius:6px;cursor:pointer;">删除</button>'
                + '</div>'
                + '</div>';
        });
        html += '</div>';
    });
    return html;
};

MemoryManagerUI.addWorldAnchor = function() {
    var self = this;
    var container = document.getElementById('memoryManagerContent');
    if (!container) return;
    container.innerHTML = '<div class="memory-card">'
        + '<div class="memory-card-title">添加永久事实</div>'
        + '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px;">添加后 AI 在任何情况下都会优先看到这条信息。</div>'
        + '<div style="margin-bottom:10px;">'
        + '<label style="font-size:12px;color:var(--text-secondary);">类型</label>'
        + '<select id="newAnchorType" style="width:100%;padding:8px;margin-top:4px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;">'
        + '<option value="pc_identity">🎭 主角身份</option>'
        + '<option value="setting">🌍 世界设定</option>'
        + '<option value="world_rule">📜 设定规则</option>'
        + '<option value="npc_profile">👤 关键角色</option>'
        + '<option value="promise" selected>🤝 玩家承诺/约定</option>'
        + '</select></div>'
        + '<div style="margin-bottom:10px;">'
        + '<label style="font-size:12px;color:var(--text-secondary);">内容</label>'
        + '<textarea id="newAnchorContent" rows="4" style="width:100%;padding:8px;margin-top:4px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;resize:vertical;box-sizing:border-box;" placeholder="例如：主角楚风是剑修少年，自幼在青云宗长大"></textarea>'
        + '</div>'
        + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
        + '<button onclick="MemoryManagerUI.switchTab(\'anchors\')" style="padding:8px 16px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text);cursor:pointer;">取消</button>'
        + '<button onclick="MemoryManagerUI.saveNewWorldAnchor()" style="padding:8px 16px;border:none;border-radius:6px;background:var(--accent);color:white;cursor:pointer;">添加</button>'
        + '</div>'
        + '</div>';
};

MemoryManagerUI.saveNewWorldAnchor = function() {
    var em = window.EnhancedMemory;
    if (!em) return;
    var type = document.getElementById('newAnchorType').value;
    var content = (document.getElementById('newAnchorContent').value || '').trim();
    if (!content) { UI.toast && UI.toast('内容不能为空'); return; }
    var result = em.addWorldAnchor(type, content, 'manual', em.stats.totalMessages);
    if (result) {
        em.saveToStorage();
        UI.toast && UI.toast('已添加');
    } else {
        UI.toast && UI.toast('已存在（重复内容）');
    }
    this.switchTab('anchors');
};

MemoryManagerUI.editWorldAnchor = function(idx) {
    var self = this;
    var em = window.EnhancedMemory;
    if (!em) return;
    var anchor = em.longTermMemory.worldAnchors[idx];
    if (!anchor) return;
    var container = document.getElementById('memoryManagerContent');
    container.innerHTML = '<div class="memory-card">'
        + '<div class="memory-card-title">编辑永久事实</div>'
        + '<div style="margin-bottom:10px;">'
        + '<label style="font-size:12px;color:var(--text-secondary);">类型</label>'
        + '<select id="editAnchorType" style="width:100%;padding:8px;margin-top:4px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;">'
        + '<option value="pc_identity"' + (anchor.type==='pc_identity'?' selected':'') + '>🎭 主角身份</option>'
        + '<option value="setting"' + (anchor.type==='setting'?' selected':'') + '>🌍 世界设定</option>'
        + '<option value="world_rule"' + (anchor.type==='world_rule'?' selected':'') + '>📜 设定规则</option>'
        + '<option value="npc_profile"' + (anchor.type==='npc_profile'?' selected':'') + '>👤 关键角色</option>'
        + '<option value="promise"' + (anchor.type==='promise'?' selected':'') + '>🤝 玩家承诺/约定</option>'
        + '</select></div>'
        + '<div style="margin-bottom:10px;">'
        + '<label style="font-size:12px;color:var(--text-secondary);">内容</label>'
        + '<textarea id="editAnchorContent" rows="4" style="width:100%;padding:8px;margin-top:4px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;resize:vertical;box-sizing:border-box;">' + self._esc(anchor.content) + '</textarea>'
        + '</div>'
        + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
        + '<button onclick="MemoryManagerUI.switchTab(\'anchors\')" style="padding:8px 16px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text);cursor:pointer;">取消</button>'
        + '<button onclick="MemoryManagerUI.saveWorldAnchor(' + idx + ')" style="padding:8px 16px;border:none;border-radius:6px;background:var(--accent);color:white;cursor:pointer;">保存</button>'
        + '</div>'
        + '</div>';
};

MemoryManagerUI.saveWorldAnchor = function(idx) {
    var em = window.EnhancedMemory;
    if (!em) return;
    var anchor = em.longTermMemory.worldAnchors[idx];
    if (!anchor) return;
    var type = document.getElementById('editAnchorType').value;
    var content = (document.getElementById('editAnchorContent').value || '').trim();
    if (!content) { UI.toast && UI.toast('内容不能为空'); return; }
    anchor.type = type;
    anchor.content = content;
    anchor.source = 'manual';  // 标记为手动
    em.saveToStorage();
    UI.toast && UI.toast('已保存');
    this.switchTab('anchors');
};

MemoryManagerUI.deleteWorldAnchor = function(idx) {
    var em = window.EnhancedMemory;
    if (!em) return;
    if (!confirm('确定要删除这条永久事实吗？删除后 AI 将不再看到它。')) return;
    em.longTermMemory.worldAnchors.splice(idx, 1);
    em.saveToStorage();
    UI.toast && UI.toast('已删除');
    this.switchTab('anchors');
};

// === 进行中约定（activeQuests）编辑面板 ===
MemoryManagerUI.renderQuests = function(em) {
    var self = this;
    var quests = (em.longTermMemory && em.longTermMemory.activeQuests) || [];
    var pending = quests.filter(function(q) { return q.status === 'pending'; });
    var resolved = quests.filter(function(q) { return q.status === 'resolved'; });
    var broken = quests.filter(function(q) { return q.status === 'broken'; });
    var typeIcons = { promise: '🤝', quest: '📜', threat: '⚠️', mystery: '❓' };

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
        + '<div style="font-size:13px;color:var(--text-tertiary);">约定/任务——AI 必须在剧情中遵守。状态: pending=进行中 / resolved=已兑现 / broken=已违反</div>'
        + '<button onclick="MemoryManagerUI.addActiveQuest()" style="font-size:12px;color:white;background:var(--accent);border:none;padding:6px 14px;border-radius:6px;cursor:pointer;">+ 手动添加</button>'
        + '</div>';

    function renderSection(title, list, color) {
        if (list.length === 0) return '';
        var section = '<div class="memory-card">'
            + '<div class="memory-card-title" style="color:' + color + ';">' + title + ' <span style="font-weight:normal;font-size:11px;color:var(--text-tertiary);">' + list.length + ' 条</span></div>';
        list.forEach(function(q) {
            var realIdx = quests.indexOf(q);
            var icon = typeIcons[q.type] || '📌';
            var typeLabel = q.type === 'promise' ? '承诺' : (q.type === 'quest' ? '任务' : (q.type === 'threat' ? '威胁' : '悬念'));
            var fromTo = '';
            if (q.from) fromTo = '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">' + (q.from === 'player' ? '来自：玩家' : '来自：AI') + '</div>';
            section += '<div style="padding:10px 12px;background:var(--bg);border-radius:8px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">'
                + '<div style="flex:1;">'
                + '<div style="font-size:13px;line-height:1.6;word-break:break-all;">' + icon + ' <span style="font-size:10px;background:#666;color:white;padding:1px 6px;border-radius:4px;">' + typeLabel + '</span> ' + self._esc(q.content) + '</div>'
                + fromTo
                + '</div>'
                + '<div style="display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">';
            if (q.status === 'pending') {
                section += '<button onclick="MemoryManagerUI.resolveQuestByIdx(' + realIdx + ',\'resolved\')" style="font-size:11px;color:#080;background:none;border:1px solid #4a4;padding:3px 8px;border-radius:6px;cursor:pointer;">✓兑现</button>'
                    + '<button onclick="MemoryManagerUI.resolveQuestByIdx(' + realIdx + ',\'broken\')" style="font-size:11px;color:#f44;background:none;border:1px solid #f44;padding:3px 8px;border-radius:6px;cursor:pointer;">✗违反</button>';
            }
            section += '<button onclick="MemoryManagerUI.editActiveQuest(' + realIdx + ')" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--border);padding:3px 8px;border-radius:6px;cursor:pointer;">编辑</button>'
                + '<button onclick="MemoryManagerUI.deleteActiveQuest(' + realIdx + ')" style="font-size:11px;color:#f44;background:none;border:1px solid var(--border);padding:3px 8px;border-radius:6px;cursor:pointer;">删除</button>'
                + '</div>'
                + '</div>';
        });
        section += '</div>';
        return section;
    }

    html += renderSection('⏳ 进行中', pending, 'var(--accent)');
    html += renderSection('✅ 已兑现', resolved, '#4a4');
    html += renderSection('❌ 已违反', broken, '#f44');

    if (quests.length === 0) {
        html += '<div style="text-align:center;padding:40px;color:var(--text-tertiary);">还没有约定。开始对话后 AI 提取的承诺会出现在这里，你也可以手动添加任务/承诺。</div>';
    }
    return html;
};

MemoryManagerUI.addActiveQuest = function() {
    var self = this;
    var container = document.getElementById('memoryManagerContent');
    container.innerHTML = '<div class="memory-card">'
        + '<div class="memory-card-title">添加约定/任务</div>'
        + '<div style="margin-bottom:10px;"><label style="font-size:12px;color:var(--text-secondary);">类型</label>'
        + '<select id="newQuestType" style="width:100%;padding:8px;margin-top:4px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;">'
        + '<option value="promise" selected>🤝 玩家承诺</option>'
        + '<option value="quest">📜 任务</option>'
        + '<option value="threat">⚠️ 威胁/复仇</option>'
        + '<option value="mystery">❓ 未解悬念</option>'
        + '</select></div>'
        + '<div style="margin-bottom:10px;"><label style="font-size:12px;color:var(--text-secondary);">内容</label>'
        + '<textarea id="newQuestContent" rows="3" style="width:100%;padding:8px;margin-top:4px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;resize:vertical;box-sizing:border-box;" placeholder="例如：主角承诺会去找苏婉儿"></textarea></div>'
        + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
        + '<button onclick="MemoryManagerUI.switchTab(\'quests\')" style="padding:8px 16px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text);cursor:pointer;">取消</button>'
        + '<button onclick="MemoryManagerUI.saveNewActiveQuest()" style="padding:8px 16px;border:none;border-radius:6px;background:var(--accent);color:white;cursor:pointer;">添加</button>'
        + '</div></div>';
};

MemoryManagerUI.saveNewActiveQuest = function() {
    var em = window.EnhancedMemory;
    if (!em) return;
    var type = document.getElementById('newQuestType').value;
    var content = (document.getElementById('newQuestContent').value || '').trim();
    if (!content) { UI.toast && UI.toast('内容不能为空'); return; }
    var result = em.addActiveQuest({ type: type, content: content, from: 'manual', status: 'pending' });
    if (result) {
        em.saveToStorage();
        UI.toast && UI.toast('已添加');
    } else {
        UI.toast && UI.toast('已存在相同内容');
    }
    this.switchTab('quests');
};

MemoryManagerUI.editActiveQuest = function(idx) {
    var self = this;
    var em = window.EnhancedMemory;
    if (!em) return;
    var quest = em.longTermMemory.activeQuests[idx];
    if (!quest) return;
    var container = document.getElementById('memoryManagerContent');
    container.innerHTML = '<div class="memory-card">'
        + '<div class="memory-card-title">编辑约定/任务</div>'
        + '<div style="margin-bottom:10px;"><label style="font-size:12px;color:var(--text-secondary);">类型</label>'
        + '<select id="editQuestType" style="width:100%;padding:8px;margin-top:4px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;">'
        + '<option value="promise"' + (quest.type==='promise'?' selected':'') + '>🤝 玩家承诺</option>'
        + '<option value="quest"' + (quest.type==='quest'?' selected':'') + '>📜 任务</option>'
        + '<option value="threat"' + (quest.type==='threat'?' selected':'') + '>⚠️ 威胁/复仇</option>'
        + '<option value="mystery"' + (quest.type==='mystery'?' selected':'') + '>❓ 未解悬念</option>'
        + '</select></div>'
        + '<div style="margin-bottom:10px;"><label style="font-size:12px;color:var(--text-secondary);">内容</label>'
        + '<textarea id="editQuestContent" rows="3" style="width:100%;padding:8px;margin-top:4px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;resize:vertical;box-sizing:border-box;">' + self._esc(quest.content) + '</textarea></div>'
        + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
        + '<button onclick="MemoryManagerUI.switchTab(\'quests\')" style="padding:8px 16px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text);cursor:pointer;">取消</button>'
        + '<button onclick="MemoryManagerUI.saveActiveQuest(' + idx + ')" style="padding:8px 16px;border:none;border-radius:6px;background:var(--accent);color:white;cursor:pointer;">保存</button>'
        + '</div></div>';
};

MemoryManagerUI.saveActiveQuest = function(idx) {
    var em = window.EnhancedMemory;
    if (!em) return;
    var quest = em.longTermMemory.activeQuests[idx];
    if (!quest) return;
    quest.type = document.getElementById('editQuestType').value;
    quest.content = (document.getElementById('editQuestContent').value || '').trim();
    if (!quest.content) { UI.toast && UI.toast('内容不能为空'); return; }
    em.saveToStorage();
    UI.toast && UI.toast('已保存');
    this.switchTab('quests');
};

MemoryManagerUI.deleteActiveQuest = function(idx) {
    var em = window.EnhancedMemory;
    if (!em) return;
    if (!confirm('确定要删除这条约定吗？')) return;
    em.longTermMemory.activeQuests.splice(idx, 1);
    em.saveToStorage();
    UI.toast && UI.toast('已删除');
    this.switchTab('quests');
};

MemoryManagerUI.resolveQuestByIdx = function(idx, newStatus) {
    var em = window.EnhancedMemory;
    if (!em) return;
    var q = em.longTermMemory.activeQuests[idx];
    if (!q) return;
    q.status = newStatus;
    q.resolvedAt = Date.now();
    em.saveToStorage();
    UI.toast && UI.toast(newStatus === 'resolved' ? '已标记为兑现' : '已标记为违反');
    this.switchTab('quests');
};



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
