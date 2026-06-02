        /**
         * 安全工具函数 - 2026-06-01
         * 仅新增工具，不修改任何原有逻辑
         */
        const DOMCache = {
            _cache: {}, _maxAge: 5000,
            get(id) {
                var c = this._cache[id];
                if (c && (Date.now() - c.t < this._maxAge)) return c.el;
                var el = document.getElementById(id);
                if (el) this._cache[id] = { el: el, t: Date.now() };
                return el;
            },
            query(sel) {
                var c = this._cache[sel];
                if (c && (Date.now() - c.t < this._maxAge)) return c.el;
                var el = document.querySelector(sel);
                if (el) this._cache[sel] = { el: el, t: Date.now() };
                return el;
            },
            clear() { this._cache = {}; }
        };

        const Logger = {
            DEBUG: false, INFO: false, WARN: true, ERROR: true,
            debug: function() { if (this.DEBUG && console && console.log) console.log.apply(console, ['[DEBUG]'].concat(Array.from(arguments))); },
            info: function() { if (this.INFO && console && console.info) console.info.apply(console, ['[INFO]'].concat(Array.from(arguments))); },
            warn: function() { if (this.WARN && console && console.warn) console.warn.apply(console, ['[WARN]'].concat(Array.from(arguments))); },
            error: function() { if (this.ERROR && console && console.error) console.error.apply(console, ['[ERROR]'].concat(Array.from(arguments))); }
        };

        const TimerManager = {
            _intervals: {}, _timeouts: {},
            setInterval: function(id, fn, delay) { this.clearInterval(id); this._intervals[id] = setInterval(fn, delay); },
            setTimeout: function(id, fn, delay) { this.clearTimeout(id); const self = this; this._timeouts[id] = setTimeout(function() { fn(); delete self._timeouts[id]; }, delay); },
            clearInterval: function(id) { if (this._intervals[id]) { clearInterval(this._intervals[id]); delete this._intervals[id]; } },
            clearTimeout: function(id) { if (this._timeouts[id]) { clearTimeout(this._timeouts[id]); delete this._timeouts[id]; } },
            clearAll: function() { for (var i in this._intervals) clearInterval(this._intervals[i]); for (var i in this._timeouts) clearTimeout(this._timeouts[i]); this._intervals = {}; this._timeouts = {}; }
        };

        const GlobalCleanup = {
            _listeners: [],
            registerListener: function(target, type, handler, options) { target.addEventListener(type, handler, options); this._listeners.push({target:target,type:type,handler:handler,options:options}); },
            cleanup: function() { for (var i = 0; i < this._listeners.length; i++) { try { this._listeners[i].target.removeEventListener(this._listeners[i].type, this._listeners[i].handler, this._listeners[i].options); } catch(e) {} } this._listeners = []; TimerManager.clearAll(); DOMCache.clear(); }
        };

        window.addEventListener('beforeunload', function() { GlobalCleanup.cleanup(); });

        function sanitizeHTML(str) { if (!str) return ''; if (typeof str !== 'string') str = String(str); return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

        function debounce(fn, delay) { var t = null; return function() { var a = arguments, c = this; if (t) clearTimeout(t); t = setTimeout(function() { fn.apply(c, a); t = null; }, delay); }; }
        function throttle(fn, interval) { var last = 0, t = null; return function() { var a = arguments, c = this, now = Date.now(), r = interval - (now - last); if (r <= 0) { if (t) { clearTimeout(t); t = null; } last = now; fn.apply(c, a); } else if (!t) { t = setTimeout(function() { last = Date.now(); t = null; fn.apply(c, a); }, r); } }; }

        function safeExecute(fn, fallback) { try { return fn(); } catch(e) { return fallback; } }
        function safeSetItem(key, value) { try { localStorage.setItem(key, value); return true; } catch(e) { return false; } }
        function safeGetItem(key, defaultValue) { try { var v = localStorage.getItem(key); return v !== null ? v : defaultValue; } catch(e) { return defaultValue; } }

        window.addEventListener('error', function(event) { if (console && console.error) console.error('[全局错误]', event.message); });
        window.addEventListener('unhandledrejection', function(event) { if (console && console.error) console.error('[Promise错误]', event.reason); });
