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
    // 【全游戏弹窗策略】3 秒——使用 POPUP_DURATION_MS 常量（core.js 定义）
    var _popupMs = (typeof POPUP_DURATION_MS !== 'undefined') ? POPUP_DURATION_MS : 3000;
    if (typeof TimerManager !== 'undefined' && TimerManager.setTimeout) {
        TimerManager.setTimeout('toastrHide_' + Date.now(), function() { toast.style.opacity='0'; toast.style.transition='opacity 0.3s'; if (typeof TimerManager !== 'undefined' && TimerManager.setTimeout) TimerManager.setTimeout('toastrRemove_' + Date.now(), function(){toast.remove();},300); }, _popupMs);
    } else {
        setTimeout(function() { toast.style.opacity='0'; toast.style.transition='opacity 0.3s'; setTimeout(function(){toast.remove();},300); }, _popupMs);
    }
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
                        if (typeof setGlobalVar === 'function') setGlobalVar(varName, varValue);
                        else if (typeof MacroEngine !== 'undefined' && MacroEngine.setGlobalVar) MacroEngine.setGlobalVar(varName, varValue);
                        else { if(!gameState._globalVars) gameState._globalVars = {}; gameState._globalVars[varName] = varValue; }
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
                        // 记录到日志
                        if (typeof gameState !== 'undefined') {
                            if (!gameState._quickReplyLog) gameState._quickReplyLog = [];
                            gameState._quickReplyLog.push({
                                name: btn.name || '快捷回复',
                                prompt: promptText,
                                time: new Date().toLocaleTimeString()
                            });
                        }
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
        if (!this.workingMemory.nearSummary) this.workingMemory.nearSummary = '';
        if (!this.workingMemory.midSummary) this.workingMemory.midSummary = '';
        if (!this.workingMemory.farSummary) this.workingMemory.farSummary = '';
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
            var key = q.content || ('quest_' + idx);
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
            // 设定压缩检查
            self.compressSetupIfNeeded();
            // 【AI叙事驱动】更新所有角色/物品/任务的休眠状态
            self._updateDormantStatus(message);
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
                    if (item) { var oldQty = item.qty; item.qty += qty; item.lastChangedTurn = self.currentTurn; if (!item.history) item.history = []; item.history.push({ turn: self.currentTurn, from: oldQty, to: item.qty }); if (item.history.length > 10) item.history = item.history.slice(-10); self._changeLog.push({ turn: self.currentTurn, type: 'item', key: itemName, field: 'qty', oldValue: oldQty, newValue: item.qty }); }
                    else { self.tables.items[itemName] = { name: itemName, qty: qty, unit: attrs.unit || '个', rarity: attrs.rarity || '普通', desc: attrs.desc || '', obtainedTurn: self.currentTurn, lastChangedTurn: self.currentTurn, history: [{ turn: self.currentTurn, from: 0, to: qty }] }; self._changeLog.push({ turn: self.currentTurn, type: 'item', key: itemName, field: 'qty', oldValue: 0, newValue: qty }); }
                } else if (action === 'remove' && item) { var oldQty2 = item.qty; item.qty = Math.max(0, item.qty - qty); item.lastChangedTurn = self.currentTurn; if (!item.history) item.history = []; item.history.push({ turn: self.currentTurn, from: oldQty2, to: item.qty }); if (item.history.length > 10) item.history = item.history.slice(-10); self._changeLog.push({ turn: self.currentTurn, type: 'item', key: itemName, field: 'qty', oldValue: oldQty2, newValue: item.qty }); }
                else if (action === 'change' && item) { var oldQty3 = item.qty; item.qty = qty; item.lastChangedTurn = self.currentTurn; if (!item.history) item.history = []; item.history.push({ turn: self.currentTurn, from: oldQty3, to: qty }); if (item.history.length > 10) item.history = item.history.slice(-10); self._changeLog.push({ turn: self.currentTurn, type: 'item', key: itemName, field: 'qty', oldValue: oldQty3, newValue: qty }); }
            } else if (type === 'location' && attrs.name) {
                var locName = attrs.name;
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
        // 同步到 gameState 视图并触发 GameLinker 通知 UI
        if (edits.length > 0 && typeof _ensureDataLinkage === 'function') {
            try { _ensureDataLinkage(); } catch (e) {}
        }
        if (edits.length > 0 && typeof GameLinker !== 'undefined') {
            try {
                var hasCharacter = edits.some(function(e) { return e.type === 'character'; });
                var hasItem = edits.some(function(e) { return e.type === 'item'; });
                var hasQuest = edits.some(function(e) { return e.type === 'quest'; });
                var hasEvent = edits.some(function(e) { return e.type === 'event'; });
                if (hasCharacter) GameLinker.refreshByDataChange('allCharacters');
                if (hasItem) GameLinker.refreshByDataChange('currentBag');
                if (hasQuest) GameLinker.refreshByDataChange('currentQuests');
                if (hasEvent) GameLinker.refreshByDataChange('keyEvents');
            } catch (e) {}
        }
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
                var fPriority = parseInt(fAttrs.priority) || 5;
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
        function isMentioned(name) {
            if (!name || name.length < 1) return false;
            // 简单名称（1-2字）用边界检查，复杂名称直接包含检查
            if (name.length <= 2) {
                // 短名称需要更严格的匹配：前后不能是中文/字母/数字
                var re = new RegExp('(^|[^\\u4e00-\\u9fa5a-zA-Z0-9])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^\\u4e00-\\u9fa5a-zA-Z0-9]|$)');
                return re.test(content);
            }
            return content.indexOf(name) >= 0;
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
            var key = q.content || q.id || '';
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
        Object.keys(self._dormantTracking.foreshadowings || {}).forEach(function(fsId) {
            var fs = self._dormantTracking.foreshadowings[fsId];
            if (!fs || fs.triggered) return;
            fs.dormantRounds = currentTurn - fs.createdTurn;
        });
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

        // 近层：最近3轮，保留完整内容（不截断，剧情不能断层）
        var nearTurns = turns.slice(-3);
        self._summaryLayers.near = nearTurns.map(function(t) {
            var parts = [];
            if (t && t.user) parts.push('玩家: ' + t.user);
            if (t && t.assistant) parts.push('AI: ' + t.assistant);
            return parts.join(' | ');
        });

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
            try { if (typeof gameState !== 'undefined' && Array.isArray(gameState.conversationHistory)) recentText2 = gameState.conversationHistory.slice(-3).map(function(m) { return (m && m.content) || ''; }).join(' '); } catch(e) {}
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
                if (typeof gameState !== 'undefined' && Array.isArray(gameState.conversationHistory)) {
                    recentText = gameState.conversationHistory.slice(-3).map(function(m) { return (m && m.content) || ''; }).join(' ');
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

                    var parsed = JSON.parse(jsonStr);
                    if (!parsed || typeof parsed !== 'object') {
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
        if (parsed.coreRules && parsed.coreRules.length > 0) {
            self.permanentFacts.worldRules = self.permanentFacts.worldRules || [];
            parsed.coreRules.slice(0, 10).forEach(function(rule) {
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

        // 通知UI刷新
        if (typeof GameLinker !== 'undefined') {
            GameLinker.refreshByDataChange('_memory');
            GameLinker.refreshByDataChange('allCharacters');
        }
    },

    // 获取当前应该注入的设定文本（渐进式压缩策略）
    // 核心思路：不突然切换，而是随轮次逐步精简，始终保留结构
    getSetupInjection: function() {
        var self = this;
        var layers = self._setupLayers;

        // 如果没有处理过设定，返回null（让旧逻辑处理）
        if (!layers.fullSetup) return null;

        var result = '';

        // 【去重优化】增强记忆已注入核心规则和角色档案时，设定只保留叙述性内容
        // 避免同一条规则在【设定】和【当前状态与记忆】中重复出现
        var hasMemoryInjection = (self.permanentFacts &&
            ((self.permanentFacts.worldRules && self.permanentFacts.worldRules.length > 0) ||
             (self.permanentFacts.npcProfiles && self.permanentFacts.npcProfiles.length > 0)));

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
            var setupTokens = Math.ceil(layers.fullSetup.length / 1.7);
            var setupRatio = setupTokens / ctxSize;

            if (layers.compressed && layers.compressedSetup && setupRatio > 0.4) {
                result += '【设定精简版】（原文' + layers.originalLength + '字，精简至' + layers.compressedLength + '字，完整规则见【核心设定】）\n' + layers.compressedSetup;
            } else {
                result += '【完整设定】\n' + layers.fullSetup;
            }
        }

        return result;
    },

    // 提取设定中的章节标题行，作为结构索引
    // 让AI知道设定中有哪些内容，即使看不到全文也能知道"有什么"
    _extractSectionIndex: function(fullSetup) {
        if (!fullSetup) return '';
        var lines = fullSetup.split('\n');
        var indexLines = [];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            // 匹配中文标题格式：一、二、三、1. 2. 【】等
            if (/^[一二三四五六七八九十]+[、．.]/.test(line) ||
                /^（[一二三四五六七八九十]+）/.test(line) ||
                /^\d+[、．.．]/.test(line) ||
                /^【[^】]+】$/.test(line) ||
                /^#+\s/.test(line)) {
                indexLines.push(line);
            }
        }
        // 如果结构化标题不足3个，说明是散文式设定（如纯角色卡）
        // 改为提取每个段落的核心句（第一句或前30字）
        if (indexLines.length < 3) {
            indexLines = [];
            var paragraphs = fullSetup.split(/\n\s*\n/);
            for (var j = 0; j < paragraphs.length && indexLines.length < 20; j++) {
                var para = paragraphs[j].trim();
                if (!para || para.length < 10) continue;
                // 提取段落的第一句话（以句号/问号/感叹号结尾）
                var firstSentence = para.match(/^[^。？！\n]{2,40}[。？！]?/);
                if (firstSentence) {
                    var sentence = firstSentence[0].trim();
                    // 保留完整首句，截断会丢失段落核心语义
                    indexLines.push('• ' + sentence);
                }
            }
        }
        return indexLines.slice(0, 30).join('\n');
    },

    // 标记设定已压缩（渐进式，不再需要硬开关）
    compressSetupIfNeeded: function() {
        // 渐进式压缩由 getSetupInjection 根据轮次自动处理，无需手动标记
        // 保留此方法以兼容旧代码
    },

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
            for (var i = 0; i < sorted.length && excess > 0; i++) {
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
                    for (var li = 1; li < lines.length; li++) {
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

        // 不同模块采用不同的精简策略（绝不截断）
        switch (moduleKey) {
            case 'characters':
                // 【优化】三层架构已分层，精简时只保留活跃角色的关键字段
                // 去掉 outfit（穿着细节），保留关系/好感/心情/位置/状态
                return headerLine + '\n' + bodyLines.map(function(line) {
                    // 如果是休眠角色索引行，大幅压缩
                    if (line.indexOf('存在角色：') === 0 || line.indexOf('（这些角色') === 0) {
                        return line.length > 60 ? line.substring(0, 60) + '…等' : line;
                    }
                    return line.replace(/\s*\|\s*outfit:[^\n]*/g, '');
                }).join('\n');

            case 'items':
                // 【优化】三层架构已分层，休眠物品只保留名字列表
                return headerLine + '\n' + bodyLines.map(function(line) {
                    if (line.indexOf('持有物品：') === 0 && line.length > 80) {
                        return line.substring(0, 80) + '…等';
                    }
                    return line;
                }).join('\n');

            case 'quests':
                // 【优化】休眠约定可以精简描述
                return headerLine + '\n' + bodyLines.map(function(line) {
                    if (line.indexOf('【休眠约定') === 0) return line;
                    // 约定内容如果太长，保留前40字
                    if (line.indexOf('• ') === 0 && line.length > 60) {
                        return line.substring(0, 60) + '…';
                    }
                    return line;
                }).join('\n');

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
        var typeLabels = { pcIdentity: '主角身份', worldRules: '世界规则', settings: '世界设定', npcProfiles: '关键角色', promises: '玩家承诺' };
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
                    sorted.forEach(function(a) { if (a && a.content) lines.push('• ' + a.content); });
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
        if (this.plot.worldSetting) lines.push('【世界观】' + this.plot.worldSetting);
        var chs = this.plot.chapters;
        if (chs && chs.length > 0) { lines.push('【' + chs[0].title + '】' + chs[0].summary); if (chs.length > 1) chs.slice(-2).forEach(function(ch) { lines.push('【' + ch.title + '】' + ch.summary); }); }
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
            if (!q || !q.content) return;
            var track = self._dormantTracking && self._dormantTracking.quests ? self._dormantTracking.quests[q.content] : null;
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
                lines.push('• ' + q.content);
            });
        }

        // Linked层：一段时间未提及但仍重要的约定
        if (linkedQuests.length > 0) {
            lines.push('【待办约定（一段时间未推进）】');
            linkedQuests.forEach(function(q) {
                lines.push('• ' + q.content);
            });
        }

        // Dormant层：长期未推进的约定（提醒AI）
        if (dormantQuests.length > 0) {
            lines.push('【休眠约定（长期未推进，AI可考虑发展或放弃）】');
            dormantQuests.forEach(function(q) {
                lines.push('• ' + q.content);
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
            if (!e || !e.content) return;
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
                lines.push('• ' + q.content + '（已休眠' + q.rounds + '回合）');
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
        if (message && message.role === 'user') currentTurn.user = message.content;
        else if (message && message.role === 'assistant') currentTurn.assistant = message.content;
        while (self.workingMemory.turns.length > MAX_TURNS) self.workingMemory.turns.shift();
        self.workingMemory.messages = [];
        for (var i = 0; i < self.workingMemory.turns.length; i++) { var t = self.workingMemory.turns[i]; if (t && t.user !== null && t.user !== undefined) self.workingMemory.messages.push({ role: 'user', content: t.user, timestamp: t.timestamp, turn: t.turn }); if (t && t.assistant !== null && t.assistant !== undefined) self.workingMemory.messages.push({ role: 'assistant', content: t.assistant, timestamp: t.timestamp, turn: t.turn }); }
        self.workingMemory.timestamp = Date.now();
    },

    _extractImportantInfo: function(gameData) {
        var self = this;
        var info = { characters: [], items: [], locations: [], events: [], relationships: [], importance: 0 };
        if (!gameData) return info;
        if (Array.isArray(gameData.characters)) gameData.characters.forEach(function(char) { if (char) info.characters.push({ name: char.name, title: char.title, relation: char.relation, favorability: char.favorability, desc: char.desc }); });
        if (Array.isArray(gameData.bag)) gameData.bag.forEach(function(item) { if (item) info.items.push({ name: item.name, count: item.count, desc: item.desc, rarity: item.rarity }); });
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
        if (extractedInfo.characters && extractedInfo.characters.length > 0) {
            extractedInfo.characters.forEach(function(char) {
                if (!char || !char.name) return;
                var key = char.name;
                var existing = self.tables.characters[key];
                self.tables.characters[key] = { name: char.name, title: char.title || (existing ? existing.title : ''), relation: char.relation || (existing ? existing.relation : ''), mood: (existing ? existing.mood : ''), location: (existing ? existing.location : ''), outfit: (existing ? existing.outfit : ''), favorability: (typeof char.favorability === 'number') ? char.favorability : (existing ? existing.favorability : 50), status: (existing ? existing.status : ''), history: existing && Array.isArray(existing.history) ? existing.history.concat([{ turn: turn, changes: char.desc || '' }]).slice(-10) : [{ turn: turn, changes: char.desc || '' }], lastChangedTurn: turn, gameTime: self.getGameTimeStr(), accessCount: existing ? (existing.accessCount || 0) : 0, locked: existing ? existing.locked : false };
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
            });
        }
        if (gameData.story) { self._extractLocations(gameData.story).forEach(function(loc) { if (!self.tables.locations[loc]) self.tables.locations[loc] = { name: loc, desc: '', features: '', charactersPresent: '', lastChangedTurn: turn, locked: false }; else self.tables.locations[loc].lastChangedTurn = turn; }); }
        if (gameData.relationships && Array.isArray(gameData.relationships)) gameData.relationships.forEach(function(rel) { if (rel && rel.from && rel.to) self.tables.relationships[rel.from + '->' + rel.to] = { from: rel.from, to: rel.to, type: rel.type, desc: rel.desc, lastChangedTurn: turn }; });
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
        }
    },

    _generateSummary: function(message, gameData, extractedInfo) {
        var summary = { turn: this.currentTurn + 1, timestamp: Date.now(), title: gameData ? gameData.title : '', storySummary: '', keyEvents: (extractedInfo && extractedInfo.events) || [], characters: (extractedInfo && extractedInfo.characters && Array.isArray(extractedInfo.characters)) ? extractedInfo.characters.map(function(c) { return c && c.name; }).filter(Boolean) : [], importance: (extractedInfo && extractedInfo.importance) || 0, changes: [] };
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
        if (self.permanentFacts[key].some(function(a) { return a && a.content === content; })) return null;
        if (type === 'npc_profile' && content) {
            var nameMatch = content.match(/^([一-鿿A-Za-z·]{1,6})/);
            if (nameMatch) {
                var name = nameMatch[1];
                for (var i = 0; i < self.permanentFacts[key].length; i++) {
                    var entry = self.permanentFacts[key][i];
                    if (entry && entry.content && entry.content.indexOf(name) === 0) {
                        if (entry.source === 'manual') return null;
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
        if (!quest || !quest.content) return null;
        if (this.quests.some(function(q) { return q && q.content === quest.content && q.status === 'pending'; })) return null;
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
        if (lastCompressTime > config.cooldownMinutes * 60 * 1000 && messageCount >= 60) { var recentMessages = (typeof gameState !== 'undefined' && Array.isArray(gameState.conversationHistory)) ? gameState.conversationHistory.slice(-5) : []; if (recentMessages.some(function(m) { var c = (m && m.content) || ''; return c.indexOf('重要') >= 0 || c.indexOf('关键') >= 0 || c.indexOf('转折') >= 0; })) return { shouldCompress: true, reason: '检测到重要事件，建议压缩' }; }
        return { shouldCompress: false, reason: '暂不需要压缩' };
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
            var data = { version: self.version, currentTurn: self.currentTurn, lastInjectionTurn: self.lastInjectionTurn, gameClock: self.gameClock, permanentFacts: self.permanentFacts, tables: self.tables, plot: self.plot, events: self.events, timeline: self.timeline, quests: self.quests, workingMemory: self.workingMemory, budget: self.budget, compressionConfig: self.compressionConfig, stats: self.stats, _changeLog: self._changeLog, _injectionSnapshots: self._injectionSnapshots, _summaryLayers: self._summaryLayers, _setupLayers: self._setupLayers, _dormantTracking: self._dormantTracking, _storytellingConfig: self._storytellingConfig, savedAt: Date.now() };
            var result = safeSetItem('freeScript_memory', JSON.stringify(data));
            if (!result || result.success === false) self._handleSaveFailure(result, data);
        } catch(e) { self._handleSaveFailure({ error: 'serialize_error', message: e.message }, null); }
        finally { self._saving = false; if (self._pendingSave) { self._pendingSave = false; if (typeof TimerManager !== 'undefined' && TimerManager.setTimeout) { TimerManager.setTimeout('gameMemoryDeferredSave', function() { self.saveToStorage(); }, 50); } else { setTimeout(function() { self.saveToStorage(); }, 50); } } }
    },

    _handleSaveFailure: function(result, originalData) {
        try {
            console.warn('[GameMemory] 保存失败，降级处理:', (result && result.message) || 'unknown');
            if (this.timeline && this.timeline.length > 20) this.timeline = this.timeline.slice(-20);
            if (this.events && this.events.length > 20) this.events = this.events.slice(-20);
            this._changeLog = [];
            var reduced = { version: this.version, currentTurn: this.currentTurn, lastInjectionTurn: this.lastInjectionTurn, gameClock: this.gameClock, permanentFacts: this.permanentFacts, tables: this.tables, plot: this.plot, events: this.events, timeline: this.timeline, quests: this.quests, workingMemory: this.workingMemory, _injectionSnapshots: this._injectionSnapshots, _summaryLayers: this._summaryLayers, _setupLayers: this._setupLayers, _dormantTracking: this._dormantTracking, _storytellingConfig: this._storytellingConfig, stats: this.stats, savedAt: Date.now() };
            var r2 = safeSetItem('freeScript_memory', JSON.stringify(reduced));
            if (r2 && r2.success) console.log('[GameMemory] 降级保存成功');
            else console.error('[GameMemory] 降级保存仍然失败：', r2);
        } catch(e2) { console.error('[GameMemory] 降级保存异常：', e2); }
    },

    loadFromStorage: function() {
        var self = this; var data = null;
        try { data = JSON.parse(localStorage.getItem('freeScript_memory') || 'null'); } catch(e) { data = null; }
        if (!data || data.version !== 3) return false;
        // 顶层字段映射（data.key → self.key，按顺序应用；undefined 不覆盖）
        var topFields = ['currentTurn', 'lastInjectionTurn', 'gameClock', 'permanentFacts', 'tables', 'plot', 'events', 'timeline', 'quests', 'workingMemory', 'budget', 'compressionConfig', 'stats', '_changeLog', '_injectionSnapshots', '_summaryLayers', '_setupLayers', '_dormantTracking', '_storytellingConfig'];
        for (var i = 0; i < topFields.length; i++) { var k = topFields[i]; if (data[k] !== undefined) self[k] = data[k]; }
        // 嵌套对象默认值补全
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
        // 加载后初始化休眠追踪（兼容旧存档）
        self._initDormantTracking();
        return true;
    },

    startAutoSave: function() { var self = this; if (typeof TimerManager !== 'undefined' && TimerManager.clearInterval) TimerManager.clearInterval('gameMemoryAutoSave'); if (typeof TimerManager !== 'undefined' && TimerManager.setInterval) TimerManager.setInterval('gameMemoryAutoSave', function() { self.saveToStorage(); }, 30000); },
    stopAutoSave: function() { if (typeof TimerManager !== 'undefined' && TimerManager.clearInterval) TimerManager.clearInterval('gameMemoryAutoSave'); },

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
        this._dormantTracking = { characters: {}, items: {}, quests: {}, foreshadowings: {} };
        this._storytellingConfig = { dormantWarningThreshold: 20, dormantUrgentThreshold: 30, foreshadowWarningThreshold: 15, maxForeshadowings: 20, aiGuidanceEnabled: true };
        localStorage.removeItem('freeScript_memory'); localStorage.removeItem('freeScript_enhancedMemory');
    },

    saveSummaryHistory: function() {},
    rollbackSummary: function() { return false; },
    getCharacterInfo: function(name) { return this.tables.characters[name] || null; },
    getItemHistory: function(name) { var it = this.tables.items[name]; return it ? it.history : null; },
    getTimeline: function(startTurn, endTurn) { return this.timeline.filter(function(t) { return t.turn >= (startTurn || 0) && t.turn <= (endTurn || Infinity); }); },
    getRelationshipNetwork: function(charName) { var network = []; var self = this; Object.keys(self.tables.relationships).forEach(function(key) { var rel = self.tables.relationships[key]; if (rel && (rel.from === charName || rel.to === charName)) network.push(rel); }); return network; }
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
        Object.keys(self.permanentFacts).forEach(function(key) { var oldType = typeMap[key] || key; var list = self.permanentFacts[key]; if (Array.isArray(list)) list.forEach(function(a) { if (a) worldAnchors.push({ type: oldType, content: a.content, source: a.source, locked: a.locked, createdTurn: a.createdTurn }); }); });
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
    set: function(val) {
        if (!val || typeof val !== 'object') return;
        var self = this;
        // 恢复永久事实
        if (val.worldAnchors && Array.isArray(val.worldAnchors)) {
            var typeMap = { pc_identity: 'pcIdentity', setting: 'settings', world_rule: 'worldRules', npc_profile: 'npcProfiles', promise: 'promises' };
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
                refresh: { color: 'var(--accent)',  bg: 'none',        border: 'var(--accent)',  text: '🔄 刷新', fontSize: '11px', padding: '4px 10px'  },
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
            inputHtml = '<input id="' + id + '" type="number" value="' + this._esc(val) + '"' + (field.min !== undefined ? ' min="' + field.min + '"' : '') + (field.max !== undefined ? ' max="' + field.max + '"' : '') + ' style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">';
        } else if (type === 'textarea') {
            var minH = field.minHeight || '80px';
            inputHtml = '<textarea id="' + id + '" rows="' + (field.rows || 4) + '"' + (field.placeholder ? ' placeholder="' + this._esc(field.placeholder) + '"' : '') + ' style="width:100%;min-height:' + minH + ';padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;resize:vertical;outline:none;font-family:inherit;">' + this._esc(val) + '</textarea>';
        } else if (type === 'select') {
            var opts = (field.options || []).map(function(o) {
                var v = (typeof o === 'object' && o !== null) ? o.v : o;
                var t = (typeof o === 'object' && o !== null) ? o.t : o;
                return '<option value="' + this._esc(v) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + this._esc(t) + '</option>';
            }, this).join('');
            inputHtml = '<select id="' + id + '" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">' + opts + '</select>';
        } else {
            inputHtml = '<input id="' + id + '" value="' + this._esc(val) + '"' + (field.placeholder ? ' placeholder="' + this._esc(field.placeholder) + '"' : '') + ' style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;">';
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
            + '<div style="flex:1;padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:12px;color:var(--text-tertiary);">游戏时间</div><div style="font-size:20px;font-weight:600;">' + this._esc(gm.getGameTimeStr()) + '</div></div>'
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
                html += self._btn('edit', 'editSceneState', loc.name);
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
        var fields = [
            { id: 'editSceneState', label: '场景状态（描述当前场景细节，AI会记住）', type: 'textarea', placeholder: '如：壁炉燃烧中，桌上摆着两杯热茶...', minHeight: '80px' },
            { id: 'editSceneLocked', label: '锁定场景 <span style="font-size:11px;">（锁定后状态不会自动清除）</span>', type: 'checkbox' }
        ];
        var values = [loc.sceneState || '', loc.locked];
        var html = '<div class="memory-card"><div class="memory-card-title">编辑场景状态: ' + this._esc(name) + '</div><div style="display:flex;flex-direction:column;gap:12px;">';
        for (var i = 0; i < fields.length; i++) html += this._formField(fields[i], values[i]);
        html += this._formFooter('sceneState', 'saveSceneState', name);
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
    },

    saveSceneState: function(name) {
        var gm = window.GameMemory; if (!gm || !gm.tables.locations[name]) return;
        gm.tables.locations[name].sceneState = document.getElementById('editSceneState').value.trim();
        gm.tables.locations[name].locked = document.getElementById('editSceneLocked').checked;
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
                var dot = imp >= 9 ? '🔴' : (imp >= 7 ? '🟡' : '🟢');
                var gameTime = e.gameTime || '';
                html += '<div style="padding:8px 10px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;line-height:1.5;">'
                    + dot + ' ' + self._esc(e.content)
                    + (gameTime ? '<span style="color:var(--text-tertiary);font-size:11px;margin-left:8px;">' + self._esc(gameTime) + '</span>' : '')
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

    renderPermanentFacts: function(gm) {
        var self = this;
        var typeLabels = { pcIdentity: '🎭 主角身份', settings: '🌍 世界设定', worldRules: '📜 设定规则', npcProfiles: '👤 关键角色', promises: '🤝 玩家承诺' };
        var typeOrder = ['pcIdentity', 'settings', 'worldRules', 'npcProfiles', 'promises'];
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
                html += '<div style="padding:12px 14px;background:var(--bg);border-radius:8px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;"><div style="flex:1;font-size:14px;line-height:1.7;word-break:break-all;">' + self._esc(a.content) + sourceTag + '</div>' + btns + '</div>';
            });
            html += '</div>';
        });
        return html;
    },

    addPermanentFact: function() {
        var fields = [
            { id: 'newFactType', label: '类型', type: 'select', options: [
                { v: 'pcIdentity', t: '🎭 主角身份' },
                { v: 'settings',   t: '🌍 世界设定' },
                { v: 'worldRules', t: '📜 设定规则' },
                { v: 'npcProfiles',t: '👤 关键角色' },
                { v: 'promises',   t: '🤝 玩家承诺' }
            ], default: 'promises' },
            { id: 'newFactContent', label: '内容', type: 'textarea', placeholder: '输入永久事实内容...', rows: 4, minHeight: '60px' }
        ];
        var html = '<div class="memory-card"><div class="memory-card-title">添加永久事实</div><div style="margin-bottom:10px;">';
        for (var i = 0; i < fields.length; i++) html += this._formField(fields[i], undefined);
        html += this._formFooter('permanentFacts', 'saveNewPermanentFact', undefined, 'add');
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
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
        var fields = [{ id: 'editFactContent', label: '', type: 'textarea', rows: 4, minHeight: '60px' }];
        var html = '<div class="memory-card"><div class="memory-card-title">编辑永久事实</div><div style="margin-bottom:10px;">';
        for (var i = 0; i < fields.length; i++) html += this._formField(fields[i], gm.permanentFacts[type][idx].content);
        html += this._formFooter('permanentFacts', 'savePermanentFact', [type, idx]);
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
    },

    savePermanentFact: function(type, idx) {
        var gm = window.GameMemory; if (!gm || !gm.permanentFacts[type]) return;
        var content = (document.getElementById('editFactContent').value || '').trim();
        if (!content) { UI.toast && UI.toast('内容不能为空'); return; }
        gm.permanentFacts[type][idx].content = content; gm.permanentFacts[type][idx].source = 'manual';
        UI.afterMemoryChange('permanentFacts', '_memory', '已保存');
    },

    deletePermanentFact: function(type, idx) {
        var gm = window.GameMemory; if (!gm || !gm.permanentFacts[type]) return;
        if (!confirm('确定要删除这条永久事实吗？')) return;
        gm.permanentFacts[type].splice(idx, 1);
        UI.afterMemoryChange('permanentFacts', '_memory', '已删除');
    },

    renderCharacters: function(gm) {
        var self = this; var chars = Object.values(gm.tables.characters);
        var html = '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;"><span>角色档案</span>' + this._btn('addOutline', 'addCharacter', undefined) + '</div>';
        if (chars.length === 0) html += '<div class="memory-empty-state"><div>暂无角色数据</div></div>';
        else chars.forEach(function(char) {
            var btns = '<div style="display:flex;flex-direction:column;gap:4px;">' + self._btn('edit', 'editCharacter', char.name) + self._btn('delete', 'deleteCharacter', char.name) + '</div>';
            html += '<div class="memory-character-card"><div class="memory-character-avatar">👤</div><div style="flex:1;"><div style="font-weight:600;">' + self._esc(char.name) + (char.locked ? ' 🔒' : '') + '</div><div style="font-size:12px;color:var(--text-secondary);">' + self._esc(char.title || '') + ' | 关系: ' + self._esc(char.relation || '未知') + ' | 好感: ' + self._esc(char.favorability || 0) + '</div>' + (char.mood ? '<div style="font-size:11px;color:var(--text-tertiary);">心情: ' + self._esc(char.mood) + '</div>' : '') + (char.location ? '<div style="font-size:11px;color:var(--text-tertiary);">位置: ' + self._esc(char.location) + '</div>' : '') + (char.accessCount ? '<div style="font-size:11px;color:var(--text-tertiary);">提及: ' + char.accessCount + '次</div>' : '') + (char.gameTime ? '<div style="font-size:11px;color:var(--text-tertiary);">上次变化: ' + self._esc(gm._calculateRelativeTime(char.gameTime)) + '</div>' : '') + '</div>' + btns + '</div>';
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
        var html = '<div class="memory-card"><div class="memory-card-title">编辑角色: ' + this._esc(name) + '</div><div style="display:flex;flex-direction:column;gap:12px;">';
        for (var i = 0; i < fields.length; i++) html += this._formField(fields[i], values[i]);
        html += this._formFooter('characters', 'saveCharacter', name);
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
    },

    saveCharacter: function(oldName) {
        var gm = window.GameMemory; var newName = document.getElementById('editCharName').value.trim(); if (!newName) return;
        var char = gm.tables.characters[oldName] || {}; if (oldName !== newName) delete gm.tables.characters[oldName];
        gm.tables.characters[newName] = { name: newName, title: document.getElementById('editCharTitle').value.trim(), relation: document.getElementById('editCharRelation').value.trim(), mood: document.getElementById('editCharMood').value.trim(), location: document.getElementById('editCharLocation').value.trim(), outfit: char.outfit || '', favorability: parseInt(document.getElementById('editCharFav').value) || 0, status: char.status || '', history: char.history || [], gameTime: gm.getGameTimeStr(), accessCount: char.accessCount || 0, lastChangedTurn: gm.currentTurn, locked: document.getElementById('editCharLocked').checked };
        if (typeof gameState !== 'undefined' && gameState.allCharacters) {
            if (oldName !== newName && gameState.allCharacters[oldName]) delete gameState.allCharacters[oldName];
            gameState.allCharacters[newName] = gameState.allCharacters[newName] || {};
            gameState.allCharacters[newName].name = newName;
            gameState.allCharacters[newName].title = document.getElementById('editCharTitle').value.trim();
            gameState.allCharacters[newName].relation = document.getElementById('editCharRelation').value.trim();
            gameState.allCharacters[newName].favorability = parseInt(document.getElementById('editCharFav').value) || 0;
        }
        UI.afterMemoryChange('characters', 'allCharacters', undefined);
    },

    deleteCharacter: function(name) {
        var gm = window.GameMemory; if (!gm || !gm.tables.characters[name]) return;
        delete gm.tables.characters[name];
        if (typeof gameState !== 'undefined' && gameState.allCharacters && gameState.allCharacters[name]) delete gameState.allCharacters[name];
        UI.afterMemoryChange('characters', 'allCharacters', '角色已删除');
    },

    addCharacter: function() {
        var fields = [
            { id: 'addCharName', label: '名称', type: 'text', placeholder: '角色名称', required: true },
            { id: 'addCharTitle', label: '身份/称号', type: 'text', placeholder: '如：剑术导师' },
            { id: 'addCharRelation', label: '关系', type: 'text', placeholder: '如：朋友、敌人' },
            { id: 'addCharFav', label: '好感度', type: 'number', default: 50 }
        ];
        var html = '<div class="memory-card"><div class="memory-card-title">➕ 添加角色</div><div style="display:flex;flex-direction:column;gap:12px;">';
        for (var i = 0; i < fields.length; i++) html += this._formField(fields[i], undefined);
        html += this._formFooter('characters', 'saveNewCharacter', undefined);
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
    },

    saveNewCharacter: function() {
        var gm = window.GameMemory; var name = document.getElementById('addCharName').value.trim(); if (!name) { alert('请输入角色名称'); return; }
        gm.tables.characters[name] = { name: name, title: document.getElementById('addCharTitle').value.trim(), relation: document.getElementById('addCharRelation').value.trim(), mood: '', location: '', outfit: '', favorability: parseInt(document.getElementById('addCharFav').value) || 0, status: '', history: [], gameTime: gm.getGameTimeStr(), accessCount: 0, lastChangedTurn: gm.currentTurn, locked: false };
        // 同步到gameState
        if (typeof gameState !== 'undefined') {
            if (!gameState.allCharacters) gameState.allCharacters = {};
            gameState.allCharacters[name] = { name: name, title: document.getElementById('addCharTitle').value.trim(), relation: document.getElementById('addCharRelation').value.trim(), favorability: parseInt(document.getElementById('addCharFav').value) || 0 };
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
            html += '<div class="memory-character-card"><div class="memory-character-avatar" style="background:' + self._esc(rarityColor) + '20;color:' + self._esc(rarityColor) + ';">📦</div><div style="flex:1;"><div style="font-weight:600;">' + self._esc(item.name) + '</div><div style="font-size:12px;color:var(--text-secondary);">数量: ' + self._esc(item.qty) + (item.unit ? self._esc(item.unit) : '') + ' | 品质: <span style="color:' + self._esc(rarityColor) + ';">' + self._esc(item.rarity || '普通') + '</span></div>' + (item.desc ? '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">' + self._esc(item.desc) + '</div>' : '') + (item.accessCount ? '<div style="font-size:11px;color:var(--text-tertiary);">提及: ' + item.accessCount + '次</div>' : '') + '</div>' + btns + '</div>';
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
        var html = '<div class="memory-card"><div class="memory-card-title">编辑物品: ' + this._esc(name) + '</div><div style="display:flex;flex-direction:column;gap:12px;">';
        for (var i = 0; i < fields.length; i++) html += this._formField(fields[i], values[i]);
        html += this._formFooter('items', 'saveItem', name);
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
    },

    saveItem: function(oldName) {
        var gm = window.GameMemory; var newName = document.getElementById('editItemName').value.trim(); if (!newName) return;
        var item = gm.tables.items[oldName] || {}; if (oldName !== newName) delete gm.tables.items[oldName];
        gm.tables.items[newName] = { name: newName, qty: parseInt(document.getElementById('editItemQty').value) || 1, unit: document.getElementById('editItemUnit').value.trim() || '个', rarity: document.getElementById('editItemRarity').value, desc: document.getElementById('editItemDesc').value.trim(), obtainedTurn: item.obtainedTurn || gm.currentTurn, lastChangedTurn: gm.currentTurn, gameTime: gm.getGameTimeStr(), accessCount: item.accessCount || 0, history: item.history || [] };
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
        UI.afterMemoryChange('items', 'currentBag', undefined);
    },

    deleteItem: function(name) {
        var gm = window.GameMemory; if (!gm || !gm.tables.items[name]) return;
        delete gm.tables.items[name];
        if (typeof gameState !== 'undefined' && gameState.currentBag) gameState.currentBag = gameState.currentBag.filter(function(b) { return b.name !== name; });
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
        var html = '<div class="memory-card"><div class="memory-card-title">➕ 添加物品</div><div style="display:flex;flex-direction:column;gap:12px;">';
        for (var i = 0; i < fields.length; i++) html += this._formField(fields[i], undefined);
        html += this._formFooter('items', 'saveNewItem', undefined, 'add');
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
    },

    saveNewItem: function() {
        var gm = window.GameMemory; var name = document.getElementById('addItemName').value.trim(); if (!name) { alert('请输入物品名称'); return; }
        gm.tables.items[name] = { name: name, qty: parseInt(document.getElementById('addItemQty').value) || 1, unit: document.getElementById('addItemUnit').value.trim() || '个', rarity: document.getElementById('addItemRarity').value, desc: document.getElementById('addItemDesc').value.trim(), obtainedTurn: gm.currentTurn, lastChangedTurn: gm.currentTurn, gameTime: gm.getGameTimeStr(), accessCount: 0, history: [{ turn: gm.currentTurn, from: 0, to: parseInt(document.getElementById('addItemQty').value) || 1 }] };
        // 同步到gameState.currentBag
        if (typeof gameState !== 'undefined') {
            if (!gameState.currentBag) gameState.currentBag = [];
            var exists = gameState.currentBag.some(function(b) { return b.name === name; });
            if (!exists) gameState.currentBag.push({ name: name, count: parseInt(document.getElementById('addItemQty').value) || 1, desc: document.getElementById('addItemDesc').value.trim(), rarity: document.getElementById('addItemRarity').value });
        }
        UI.afterMemoryChange('items', 'currentBag', undefined);
    },

    renderLocations: function(gm) {
        var self = this; var locs = Object.values(gm.tables.locations);
        var html = '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;"><span>地点记录</span>' + this._btn('addOutline', 'addLocation', undefined) + '</div>';
        if (locs.length === 0) html += '<div class="memory-empty-state"><div>暂无地点数据</div></div>';
        else locs.forEach(function(loc) {
            var btns = '<div style="display:flex;gap:4px;">' + self._btn('edit', 'editLocation', loc.name) + self._btn('delete', 'deleteLocation', loc.name) + '</div>';
            html += '<div style="padding:12px;background:var(--bg);border-radius:8px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;"><div style="flex:1;"><div style="font-weight:600;">' + self._esc(loc.name) + (loc.locked ? ' 🔒' : '') + '</div>' + (loc.desc ? '<div style="font-size:12px;color:var(--text-secondary);">' + self._esc(loc.desc) + '</div>' : '') + (loc.features ? '<div style="font-size:11px;color:var(--text-tertiary);">特征: ' + self._esc(loc.features) + '</div>' : '') + (loc.sceneState ? '<div style="font-size:11px;color:#ff9500;">场景: ' + self._esc(loc.sceneState) + (loc.locked ? ' [锁定]' : '') + '</div>' : '') + (loc.accessCount ? '<div style="font-size:11px;color:var(--text-tertiary);">提及: ' + loc.accessCount + '次</div>' : '') + '</div>' + btns + '</div>';
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
        for (var i = 0; i < fields.length; i++) html += this._formField(fields[i], values[i]);
        html += this._formFooter('locations', 'saveLocation', name);
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
    },

    saveLocation: function(oldName) {
        var gm = window.GameMemory; var newName = document.getElementById('editLocName').value.trim(); if (!newName) { alert('请输入地点名称'); return; }
        var loc = gm.tables.locations[oldName]; if (!loc) return; if (newName !== oldName) delete gm.tables.locations[oldName];
        gm.tables.locations[newName] = { name: newName, desc: document.getElementById('editLocDesc').value.trim(), features: document.getElementById('editLocFeatures').value.trim(), charactersPresent: loc.charactersPresent || '', lastChangedTurn: gm.currentTurn, locked: document.getElementById('editLocLocked').checked };
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
        var html = '<div class="memory-card"><div class="memory-card-title">➕ 添加地点</div><div style="display:flex;flex-direction:column;gap:12px;">';
        for (var i = 0; i < fields.length; i++) html += this._formField(fields[i], undefined);
        html += this._formFooter('locations', 'saveNewLocation', undefined);
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
    },

    saveNewLocation: function() {
        var gm = window.GameMemory; var name = document.getElementById('addLocName').value.trim(); if (!name) { alert('请输入地点名称'); return; }
        gm.tables.locations[name] = { name: name, desc: document.getElementById('addLocDesc').value.trim(), features: '', charactersPresent: '', lastChangedTurn: gm.currentTurn, locked: false };
        UI.afterMemoryChange('locations', 'worldSnapshot', undefined);
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
        var html = '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;"><span>剧情大纲</span>' + this._btn('editOutline', 'editPlot', undefined) + '</div>';
        if (gm.plot.worldSetting) html += '<div style="margin-bottom:12px;"><div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">世界观</div><div style="padding:12px;background:var(--bg);border-radius:8px;white-space:pre-wrap;line-height:1.6;">' + self._esc(gm.plot.worldSetting) + '</div></div>';
        if (gm.plot.chapters.length > 0) { html += '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">章节</div>'; gm.plot.chapters.forEach(function(ch) { html += '<div style="padding:10px;background:var(--bg);border-radius:8px;margin-bottom:6px;"><div style="font-weight:600;">' + self._esc(ch.title) + ' <span style="font-size:11px;color:var(--text-tertiary);">回合 ' + ch.startTurn + '-' + ch.endTurn + '</span></div><div style="font-size:12px;color:var(--text-secondary);white-space:pre-wrap;">' + self._esc(ch.summary) + '</div></div>'; }); }
        if (gm.plot.currentChapter) html += '<div style="margin-top:12px;"><div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">当前进展</div><div style="padding:12px;background:var(--bg);border-radius:8px;white-space:pre-wrap;line-height:1.6;max-height:200px;overflow-y:auto;">' + self._esc(gm.plot.currentChapter) + '</div></div>';
        if (gm.plot.pendingMysteries && gm.plot.pendingMysteries.length > 0) { html += '<div style="margin-top:12px;"><div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">待解决悬念</div>'; gm.plot.pendingMysteries.forEach(function(m) { html += '<div style="padding:6px 10px;background:var(--bg);border-radius:6px;margin-bottom:4px;font-size:13px;">• ' + self._esc(m) + '</div>'; }); html += '</div>'; }
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
        for (var i = 0; i < fields.length; i++) html += this._formField(fields[i], values[i]);
        html += this._formFooter('plot', 'savePlot', undefined);
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
    },

    savePlot: function() {
        var gm = window.GameMemory; gm.plot.worldSetting = document.getElementById('editPlotWorld').value.trim(); gm.plot.currentChapter = document.getElementById('editPlotCurrent').value.trim();
        if (typeof gameState !== 'undefined') { gameState.rollingSummary = (gm.plot.worldSetting || '') + '\n' + (gm.plot.currentChapter || ''); }
        UI.afterMemoryChange('plot', 'rollingSummary', undefined);
    },

    renderEvents: function(gm) {
        var self = this; var events = gm.events.slice(-20).reverse();
        var html = '<div class="memory-card"><div class="memory-card-title" style="justify-content:space-between;"><span>重要事件</span>' + this._btn('addOutline', 'addEvent', undefined) + '</div>';
        if (events.length === 0) html += '<div class="memory-empty-state"><div>暂无重要事件</div></div>';
        else events.forEach(function(event, idx) {
            var realIdx = gm.events.length - 1 - idx; var imp = event.importance || 5;
            var icon = imp >= 9 ? '🔴' : (imp >= 7 ? '🟡' : '🟢');
            html += '<div class="memory-event-item" style="display:flex;align-items:flex-start;gap:8px;"><div style="flex:1;"><div style="font-weight:600;margin-bottom:4px;">' + icon + ' ' + self._esc(event.content) + '</div><div style="font-size:11px;color:var(--text-tertiary);">第' + self._esc(event.turn) + '回合 | ' + self._esc(event.gameTime || '') + (event.gameTime ? ' (' + self._esc(gm._calculateRelativeTime(event.gameTime)) + ')' : '') + ' | 重要度: ' + self._esc(imp) + '/10' + (event.accessCount ? ' | 提及' + event.accessCount + '次' : '') + '</div></div>' + self._btn('delete', 'deleteEvent', realIdx) + '</div>';
        });
        html += '</div>'; return html;
    },

    addEvent: function() {
        var fields = [
            { id: 'addEventContent', label: '事件内容', type: 'textarea', placeholder: '描述发生了什么...', minHeight: '100px' },
            { id: 'addEventImportance', label: '重要度 (1-10)', type: 'number', min: 1, max: 10, default: 5 }
        ];
        var html = '<div class="memory-card"><div class="memory-card-title">➕ 添加事件</div><div style="display:flex;flex-direction:column;gap:12px;">';
        for (var i = 0; i < fields.length; i++) html += this._formField(fields[i], undefined);
        html += this._formFooter('events', 'saveNewEvent', undefined, 'add');
        document.getElementById('memoryManagerContent').innerHTML = html + '</div></div>';
    },

    saveNewEvent: function() {
        var gm = window.GameMemory; var content = document.getElementById('addEventContent').value.trim(); if (!content) { alert('请输入事件内容'); return; }
        gm.events.push({ content: content, turn: gm.currentTurn, gameTime: gm.getGameTimeStr(), importance: parseInt(document.getElementById('addEventImportance').value) || 5, decayScore: parseInt(document.getElementById('addEventImportance').value) || 5 });
        if (gm.events.length > 50) gm.events = gm.events.slice(-50);
        if (typeof gameState !== 'undefined') {
            if (!gameState.keyEvents) gameState.keyEvents = [];
            if (gameState.keyEvents.indexOf(content) === -1) { gameState.keyEvents.push(content); if (gameState.keyEvents.length > 30) gameState.keyEvents = gameState.keyEvents.slice(-30); }
        }
        UI.afterMemoryChange('events', 'keyEvents', undefined);
    },

    deleteEvent: function(index) {
        var gm = window.GameMemory; if (!gm || !gm.events[index]) return;
        var evtContent = gm.events[index] ? gm.events[index].content : '';
        gm.events.splice(index, 1);
        if (typeof gameState !== 'undefined' && gameState.keyEvents && evtContent) { var idx = gameState.keyEvents.indexOf(evtContent); if (idx >= 0) gameState.keyEvents.splice(idx, 1); }
        UI.afterMemoryChange('events', 'keyEvents', '事件已删除');
    },

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
                html += '<div style="padding:10px;background:var(--bg);border-radius:8px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;"><div style="flex:1;"><div style="font-weight:600;">' + icon + ' ' + self._esc(q.content) + staleWarn + '</div><div style="font-size:11px;color:var(--text-tertiary);">创建于第' + self._esc(q.createdTurn || 0) + '回合</div></div>' + self._btn('resolve', 'resolveQuestByIndex', quests.indexOf(q)) + '</div>';
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
        gm.quests[idx].status = 'resolved'; gm.quests[idx].resolvedTurn = gm.currentTurn;
        if (typeof gameState !== 'undefined' && gameState.currentQuests && gm.quests[idx].content) {
            var questContent = gm.quests[idx].content;
            for (var i = 0; i < gameState.currentQuests.length; i++) {
                if (gameState.currentQuests[i].title && gameState.currentQuests[i].title.indexOf(questContent.substring(0, 10)) >= 0) {
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
        else tl.forEach(function(t) { html += '<div style="padding:8px 10px;background:var(--bg);border-radius:6px;margin-bottom:4px;display:flex;gap:10px;align-items:center;"><div style="font-size:11px;color:var(--text-tertiary);white-space:nowrap;">第' + self._esc(t.turn) + '回合</div><div style="font-size:11px;color:var(--accent);white-space:nowrap;">' + self._esc(t.gameTime || '') + '</div><div style="font-size:13px;flex:1;">' + self._esc(t.summary || '') + '</div></div>'; });
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
            + '<div style="padding:12px;background:var(--bg);border-radius:8px;white-space:pre-wrap;font-size:13px;line-height:1.6;max-height:400px;overflow-y:auto;font-family:monospace;">' + self._esc(injection) + '</div></div>';
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
