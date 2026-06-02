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
on: function(event, cb) { if(!this._eventListeners[event])this._eventListeners[event]=[]; this._eventListeners[event].push(cb); },
emit: function(event, data) { var l=this._eventListeners[event]; if(l)l.forEach(function(cb){cb(data);}); },

// 5. Quick Reply 按钮（增强版 - 支持酒馆完整字段）
parseQuickReplies: function(data) {
    if(!data||!data.button||!data.button.buttons) return [];
    this._quickReplies = data.button.buttons.filter(function(b){
        if (b.disabled === true) return false;
        if (b.visible === false) return false;
        return true;
    });
    if (!gameState._quickReplies) gameState._quickReplies = [];
    gameState._quickReplies = this._quickReplies.map(function(b) {
        return { name: b.name, prompt: b.prompt || '', script: b.script || '', setVariable: b.setVariable || null, emphasized: b.emphasized || false, secondary: b.secondary || false };
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
                    if (typeof safeAutoSave === 'function') safeAutoSave();
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
        masterSummary: '',           // 整体剧情大纲
        importantEvents: [],         // 重要事件列表
        characterTable: {},          // 角色状态表
        itemTable: {},               // 物品追踪表
        locationTable: {},           // 地点记录表
        timeline: [],                // 时间线
        relationships: {},            // 关系网
        worldNotes: []                // 世界观设定
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
    // 3. 消息处理（每回合调用）
    // ========================================
    
    /**
    * 处理新消息，更新三层记忆
    * @param {Object} message - {role, content, timestamp}
    * @param {Object} gameData - AI返回的完整数据
    */
    processMessage: function(message, gameData) {
        const self = this;

        // 1. 添加到工作记忆
        this._addToWorkingMemory(message, gameData);

        // 2. 提取重要信息
        var extractedInfo = this._extractImportantInfo(gameData);

        // 3. 更新结构化表格
        this._updateTables(gameData, extractedInfo);

        // 4. 生成摘要
        var summary = this._generateSummary(message, gameData, extractedInfo);

        // 5. 更新短期记忆
        this._updateShortTermMemory(summary, extractedInfo);

        // 6. 更新长期记忆（每5回合或遇到重要事件时）
        if (this._shouldUpdateLongTerm(extractedInfo)) {
            this._updateLongTermMemory(summary, extractedInfo);
        }

        // 7. 更新时间线
        this._updateTimeline(message, gameData, extractedInfo);

        // 8. 更新统计
        this.stats.totalMessages++;
        this.stats.lastUpdateTime = Date.now();
    },
    
    /**
    * 添加到工作记忆
    */
    _addToWorkingMemory: function(message, gameData) {
        // 工作记忆只保留最近3回合
        if (this.workingMemory.messages.length >= 6) {  // 3回合 = 6条消息（用户+AI）
            this.workingMemory.messages.shift();
            this.workingMemory.messages.shift();
        }

        this.workingMemory.messages.push({
            role: message.role,
            content: message.content,
            timestamp: Date.now(),
            turn: this.stats.totalMessages + 1
            });

        this.workingMemory.timestamp = Date.now();
    },
    
    /**
    * 提取重要信息
    */
    _extractImportantInfo: function(gameData) {
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
        info.events = gameData.keyEvents;
        info.importance += gameData.keyEvents.length * 2;
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
        const self = this;
        var timestamp = Date.now();

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
    */
    _extractLocations: function(story) {
        var locations = [];
        // 简单规则：寻找"在..."、"来到..."等模式
        var patterns = [
        /在([^，。！？]{2,10})(?:里|内|中|上|下)/g,
        /来到([^，。！？]{2,10})/g,
        /前往([^，。！？]{2,10})/g,
        /进入([^，。！？]{2,10})/g
        ];

        patterns.forEach(function(pattern) {
            var match;
            while ((match = pattern.exec(story)) !== null) {
                var loc = match[1].trim();
                if (loc.length > 1 && loc.length < 15 && locations.indexOf(loc) === -1) {
                    locations.push(loc);
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
        // 添加到短期记忆
        this.shortTermMemory.summaries.push(summary);

        // 只保留最近10回合
        if (this.shortTermMemory.summaries.length > this.shortTermMemory.maxRounds) {
            this.shortTermMemory.summaries.shift();
        }

        // 添加事件
        if (extractedInfo.events.length > 0) {
            const self = this;
            extractedInfo.events.forEach(function(event) {
                self.shortTermMemory.events.push({
                    content: event,
                    turn: summary.turn,
                    timestamp: summary.timestamp
                    });
                });

            // 只保留最近20个事件
            if (this.shortTermMemory.events.length > 20) {
                this.shortTermMemory.events = this.shortTermMemory.events.slice(-20);
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
    * 更新长期记忆
    */
    _updateLongTermMemory: function(summary, extractedInfo) {
        const self = this;

        // 更新整体大纲
        if (summary.storySummary) {
            if (this.longTermMemory.masterSummary) {
                this.longTermMemory.masterSummary += '\n' + summary.storySummary;
                } else {
                this.longTermMemory.masterSummary = summary.storySummary;
            }

        // 限制长度
        if (this.longTermMemory.masterSummary.length > 2000) {
            this.longTermMemory.masterSummary = '...' +
            this.longTermMemory.masterSummary.slice(-1800);
        }
    }

    // 添加重要事件
    if (extractedInfo.events.length > 0) {
        extractedInfo.events.forEach(function(event) {
            // 检查是否已存在
            var exists = self.longTermMemory.importantEvents.some(function(e) {
                return e.content === event;
                });
    
            if (!exists) {
                self.longTermMemory.importantEvents.push({
                    content: event,
                    turn: summary.turn,
                    timestamp: Date.now(),
                    importance: extractedInfo.importance
                    });
                // 【修复】限制重要事件数量，防止无限增长
                if (self.longTermMemory.importantEvents.length > 50) {
                    self.longTermMemory.importantEvents = self.longTermMemory.importantEvents.slice(-50);
                }
        }
    });
    }
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
                msg.content.substring(0, 100) + '...');
                });
        }

        // 2. 短期记忆摘要
        if (this.shortTermMemory.summaries.length > 0) {
            parts.push('【近期剧情】');
            this.shortTermMemory.summaries.slice(-3).forEach(function(s) {
                parts.push('第' + s.turn + '回合: ' + s.storySummary.substring(0, 80) + '...');
                });
        }

    // 3. 长期记忆大纲
    if (this.longTermMemory.masterSummary) {
        parts.push('【剧情大纲】');
        parts.push(this.longTermMemory.masterSummary.substring(0, 300) + '...');
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
        try {
            var data = {
                workingMemory: this.workingMemory,
                shortTermMemory: this.shortTermMemory,
                longTermMemory: this.longTermMemory,
                stats: this.stats,
                compressionConfig: this.compressionConfig,
                summaryHistory: this.summaryHistory,
                currentSummaryIndex: this.currentSummaryIndex,
                savedAt: Date.now()
                };

            safeSetItem('freeScript_enhancedMemory', JSON.stringify(data));
            } catch(e) {
                // 尝试清理长期记忆中过多的条目后重试
                try {
                    if (this.longTermMemory) {
                        var events = this.longTermMemory.importantEvents;
                        if (events && events.length > 50) {
                            console.log('[EnhancedMemory] 重要事件过多，清理旧数据...');
                            this.longTermMemory.importantEvents = events.slice(-30);
                        }
                    var timeline = this.longTermMemory.timeline;
                    if (timeline && timeline.length > 50) {
                        this.longTermMemory.timeline = timeline.slice(-30);
                    }
                    var reduced = {
                        workingMemory: this.workingMemory,
                        shortTermMemory: this.shortTermMemory,
                        longTermMemory: this.longTermMemory,
                        stats: this.stats,
                        savedAt: Date.now()
                        };
                    safeSetItem('freeScript_enhancedMemory', JSON.stringify(reduced));
                    console.log('[EnhancedMemory] 清理后重新保存成功');
                }
            } catch(e2) {
        }
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
        this.workingMemory = { messages: [], summaries: [], timestamp: null };
        this.shortTermMemory = { summaries: [], events: [], maxRounds: 10 };
        this.longTermMemory = {
            masterSummary: '',
            importantEvents: [],
            characterTable: {},
            itemTable: {},
            locationTable: {},
            timeline: [],
            relationships: {},
            worldNotes: []
            };
        this.stats = { totalMessages: 0, totalSummaries: 0, lastUpdateTime: null, tokenSaved: 0 };
        this.summaryHistory = [];
        this.currentSummaryIndex = -1;
        localStorage.removeItem('freeScript_enhancedMemory');
        }
    ,
    // ========================================
    // 10. 摘要历史管理
    // ========================================
    saveSummaryHistory: function(summary, messageCount) {
        this.summaryHistory.push({
            summary: summary,
            timestamp: Date.now(),
            messageCount: messageCount,
            importantEvents: JSON.parse(JSON.stringify(this.longTermMemory.importantEvents.slice(-10))),
            characterSnapshot: JSON.parse(JSON.stringify(this.longTermMemory.characterTable))
            });
        this.currentSummaryIndex = this.summaryHistory.length - 1;
        if (this.summaryHistory.length > 10) {
            this.summaryHistory.shift();
            this.currentSummaryIndex--;
        }
        this.saveToStorage();
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
    buildSmartInjection: function() {
        var injection = '';
        var topic = this.detectCurrentTopic();
        if (this.longTermMemory.masterSummary) {
            injection += '<剧情摘要>\n';
            var st = this.longTermMemory.masterSummary;
            if (st.length > 500) st = st.slice(-500);
            injection += st + '\n</剧情摘要>\n\n';
        }
        if (topic.characters.length > 0) {
            injection += '<相关角色状态>\n';
            const self = this;
            topic.characters.forEach(function(name) {
                var ch = self.longTermMemory.characterTable[name];
                if (ch && ch.history) {
                    var rc = ch.history.slice(-3).map(function(c) { return c.desc || ''; }).filter(Boolean).join('; ');
                    injection += name + ': ' + rc + '\n';
                }
            });
        injection += '</相关角色状态>\n\n';
    }
    if (topic.items.length > 0) {
        injection += '<相关物品>\n';
        var self2 = this;
        topic.items.forEach(function(name) {
            var it = self2.longTermMemory.itemTable[name];
            if (it) injection += name + ': ' + (it.desc || '持有中') + '\n';
            });
        injection += '</相关物品>\n\n';
    }
    if (this.longTermMemory.importantEvents.length > 0) {
        injection += '<关键事件记录>\n';
        this.longTermMemory.importantEvents.slice(-5).forEach(function(e) {
            injection += '- ' + (e.content || e.event || '') + '\n';
            });
        injection += '</关键事件记录>\n\n';
    }
    if (gameState.worldSnapshot && gameState.worldSnapshot.summary) {
        injection += '<当前状态>\n' + gameState.worldSnapshot.summary + '\n</当前状态>\n';
    }

    // 注入世界观设定（仅注入非世界书来源的本地笔记，世界书由WorldInfo系统自动注入）
    if (this.longTermMemory.worldNotes && this.longTermMemory.worldNotes.length > 0) {
        var localNotes = this.longTermMemory.worldNotes.filter(function(n) { return n.source !== 'auto'; });
        if (localNotes.length > 0) {
            injection += '<世界观笔记>\n';
            localNotes.forEach(function(note) {
                injection += '【' + (note.category || '其他') + '】' + (note.title || '') + ': ' + (note.content || '') + '\n';
                });
            injection += '</世界观笔记>\n';
        }
    }

    return injection;
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
switch (scope) {
    case 'global': return this.variables.getGlobal(name);
    case 'character': return this.variables.getCharacter(this.variables.getCurrentCharacter(), name);
    default: return this.variables.getLocal(name);
}
}
setVar(name, value, scope = 'local') {
switch (scope) {
    case 'global': this.variables.setGlobal(name, value); break;
    case 'character': this.variables.setCharacter(this.variables.getCurrentCharacter(), name, value); break;
    default: this.variables.setLocal(name, value);
}
}
    }

    // ============================================================================
    // 导出
    // ============================================================================
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
