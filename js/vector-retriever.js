// ========================================
// VectorRetriever 向量化语义检索模块（P2）
// 参考 SillyTavern vectra / RisuAI HypaMemory
// 用 transformers.js 在浏览器跑 all-MiniLM-L6-v2 embedding 模型
// 对世界书条目做向量化检索，解决关键词匹配漏检问题
// ========================================
var VectorRetriever = {
    // transformers.js pipeline 实例
    _pipeline: null,
    // 模型加载状态：idle/loading/ready/error
    _status: 'idle',
    // 模型名（all-MiniLM-L6-v2：384维，体积小，浏览器友好）
    _modelName: 'Xenova/all-MiniLM-L6-v2',
    // 条目向量缓存：key = entryKey, value = { vector: Float32Array, content: string, turn: number, hash: string }
    // entryKey 格式：'bookId:uid' 或自定义
    _vectorCache: {},
    // 查询向量缓存（同回合同查询文本只算一次）
    _queryCache: { text: '', vector: null, turn: -1 },
    // 是否启用（受设置开关控制）
    _enabled: false,
    // 加载进度回调
    _onProgress: null,
    // 相似度阈值（余弦相似度 > 阈值才算命中）
    _threshold: 0.35,
    // Top-K 检索数量
    _topK: 5,

    // 是否已就绪
    isReady() {
        return this._status === 'ready' && this._pipeline;
    },

    // 是否启用
    isEnabled() {
        return this._enabled;
    },

    // 设置启用状态（受设置开关控制）
    setEnabled(v) {
        this._enabled = !!v;
        if (!this._enabled) {
            // 关闭时清理缓存释放内存
            this._vectorCache = {};
            this._queryCache = { text: '', vector: null, turn: -1 };
        }
    },

    // 当前状态
    getStatus() {
        return this._status;
    },

    // 设置进度回调
    onProgress(fn) {
        this._onProgress = typeof fn === 'function' ? fn : null;
    },

    // 内容哈希（用于检测条目内容变化，决定是否需要重新算向量）
    _hashContent(s) {
        if (!s) return '';
        var h = 0;
        s = String(s);
        for (var i = 0; i < s.length; i++) {
            h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        }
        return h.toString(36);
    },

    // 异步加载 transformers.js + 模型（懒加载）
    // 返回 Promise<pipeline>
    async _loadPipeline() {
        if (this._status === 'ready' && this._pipeline) return this._pipeline;
        if (this._status === 'loading') {
            // 已在加载中，轮询等待
            return new Promise((resolve, reject) => {
                var elapsed = 0;
                var wait = setInterval(() => {
                    elapsed += 200;
                    if (this._status === 'ready') { clearInterval(wait); resolve(this._pipeline); }
                    else if (this._status === 'error') { clearInterval(wait); reject(new Error('模型加载失败')); }
                    else if (elapsed > 60000) { clearInterval(wait); reject(new Error('模型加载超时(60s)')); }
                }, 200);
            });
        }
        this._status = 'loading';
        try {
            if (this._onProgress) this._onProgress('正在加载语义检索模型...');
            // 动态加载 transformers.js（CDN）
            if (typeof window.transformers === 'undefined') {
                await this._loadScript('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js');
            }
            var { pipeline } = window.transformers;
            // 配置：允许远程模型下载，禁用本地缓存警告
            window.transformers.env.allowRemoteModels = true;
            window.transformers.env.allowLocalModels = false;
            if (this._onProgress) this._onProgress('正在初始化 embedding 模型（首次约 25MB）...');
            this._pipeline = await pipeline('feature-extraction', this._modelName, {
                quantized: true // 量化版减小体积
            });
            this._status = 'ready';
            if (this._onProgress) this._onProgress('语义检索模型已就绪');
            return this._pipeline;
        } catch (e) {
            this._status = 'error';
            console.error('[VectorRetriever] 模型加载失败:', e);
            throw e;
        }
    },

    // 动态加载 script
    _loadScript(src) {
        return new Promise((resolve, reject) => {
            var s = document.createElement('script');
            s.src = src;
            s.crossOrigin = 'anonymous';
            s.onload = resolve;
            s.onerror = function() { reject(new Error('加载失败: ' + src)); };
            document.head.appendChild(s);
        });
    },

    // 计算单条文本的 embedding
    async _embed(text) {
        if (!text || !text.trim()) return null;
        var pipe = await this._loadPipeline();
        var output = await pipe(text, { pooling: 'mean', normalize: true });
        // [C3修复] 返回副本，避免 pipeline 复用内部 buffer 导致已缓存向量被后续调用覆盖
        return new Float32Array(output.data);
    },

    // 余弦相似度（向量已 normalize，直接点积）
    _cosine(a, b) {
        if (!a || !b || a.length !== b.length) return 0;
        var sum = 0;
        for (var i = 0; i < a.length; i++) sum += a[i] * b[i];
        return sum;
    },

    // 为单条世界书条目计算并缓存向量
    // entryKey: 'bookId:uid'
    // content: 条目正文
    // 返回向量（命中缓存则直接返回）
    async ensureEntryVector(entryKey, content) {
        if (!entryKey || !content) return null;
        var hash = this._hashContent(content);
        var cached = this._vectorCache[entryKey];
        if (cached && cached.hash === hash) return cached.vector;
        var vector = await this._embed(content);
        this._vectorCache[entryKey] = { vector: vector, content: content, hash: hash };
        return vector;
    },

    // 批量计算条目向量（首次启用或导入新条目时）
    async buildIndex(entries) {
        if (!this._enabled || !Array.isArray(entries) || entries.length === 0) return;
        try {
            // 先确保模型加载
            await this._loadPipeline();
            for (var i = 0; i < entries.length; i++) {
                var e = entries[i];
                if (!e || !e.content) continue;
                await this.ensureEntryVector(e.key, e.content);
            }
            console.log('[VectorRetriever] 索引构建完成，共 ' + entries.length + ' 条');
        } catch (e) {
            console.error('[VectorRetriever] 索引构建失败:', e);
        }
    },

    // 清理已不存在的条目的向量缓存（删除条目时调用）
    pruneCache(validKeys) {
        if (!Array.isArray(validKeys)) return;
        var validSet = {};
        validKeys.forEach(function(k) { validSet[k] = true; });
        Object.keys(this._vectorCache).forEach((k) => {
            if (!validSet[k]) delete this._vectorCache[k];
        });
    },

    // 语义检索：根据查询文本找出最相似的 Top-K 条目
    // candidates: [{ key, content, entry }, ...] 候选条目
    // queryText: 查询文本（最近对话）
    // 返回: [{ entry, score, key }, ...] 按 score 降序，最多 topK 条，score >= threshold
    async retrieve(candidates, queryText, options) {
        if (!this._enabled || !candidates || candidates.length === 0 || !queryText) return [];
        options = options || {};
        var topK = options.topK || this._topK;
        var threshold = options.threshold || this._threshold;
        try {
            // 计算查询向量
            var queryVec = await this._embed(queryText);
            if (!queryVec) return [];

            var scored = [];
            for (var i = 0; i < candidates.length; i++) {
                var c = candidates[i];
                if (!c || !c.content) continue;
                var entryVec = await this.ensureEntryVector(c.key, c.content);
                if (!entryVec) continue;
                var score = this._cosine(queryVec, entryVec);
                scored.push({ entry: c.entry, score: score, key: c.key });
            }
            scored.sort((a, b) => b.score - a.score);
            return scored.slice(0, topK).filter(function(s) { return s.score >= threshold; });
        } catch (e) {
            console.error('[VectorRetriever] 检索失败:', e);
            return [];
        }
    },

    // 重置所有状态（关闭功能时调用）
    reset() {
        this._vectorCache = {};
        this._queryCache = { text: '', vector: null, turn: -1 };
    }
};

if (typeof window !== 'undefined') window.VectorRetriever = VectorRetriever;
