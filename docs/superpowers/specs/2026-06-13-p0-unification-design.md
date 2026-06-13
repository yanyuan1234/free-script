# Free-Script 代码统一化设计（v2 · 最优方案）

> 日期：2026-06-13
> 范围：**第一批 P0**（其余 P1~P3 在后续批次处理）
> 目标：彻底解决"项目很分散"问题中最严重的内联 `onclick` + 字符串拼接 HTML 导致的脆弱、易错、难维护现状。

---

## 1. 背景

前次审查得出三个最关键问题：
1. **67 处内联 `onclick="funcName('${var}')"`**——XSS 隐患、参数转义噩梦、函数名重命名会漏改。
2. **148 处 `innerHTML` 字符串拼接**——读不懂、改不动、转义函数散落。
3. **多个 render 函数不统一使用 `RenderCache` / `shouldSkipPageRender`**——性能行为不一致。

UI 层大量写法像这样（[phone-ui.js:2213](file:///workspace/js/phone-ui.js#L2213)）：

```js
return '<div onclick="viewNpcDiary(\'' + escapeHtml(npcName).replace(/'/g, "\\'") + '\')" ...>' + ...;
```

这是反模式：HTML 模板、事件绑定、数据转义、调用约定四件事揉在一起。

---

## 2. 设计目标

| 目标 | 成功标准 |
|------|---------|
| 零内联 `onclick` | 全部走事件委托，HTML 标签只剩 `data-action` + `data-arg` |
| XSS 零新增 | 数据通过 `dataset` 传递，不走字符串拼接 |
| 新代码可读 | 一行模板写法，不再有 `onclick= "func(" + i + ")"` |
| 零回归 | 已有的 render 行为、按钮外观、点击效果完全不变 |
| 改造成本可控 | 每次只动一个文件，先迁移最危险的 XSS 点 |

---

## 3. 核心抽象：UIKit 统一基座

**`UIKit` 不是一个新框架，而是一个**轻量委托 + 元素工厂**的注册表。** 放在 [utils.js](file:///workspace/js/utils.js) 末尾（在 `RenderCache` 后面）。

### 3.1 `el(tag, props, children)` 元素工厂

```js
// 极简实现，不引入新依赖，保持 var 风格
function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
        for (var k in props) {
            if (k === 'class') node.className = props[k];
            else if (k === 'style' && typeof props[k] === 'object') {
                for (var s in props[k]) node.style[s] = props[k][s];
            } else if (k === 'dataset') {
                for (var d in props[k]) node.dataset[d] = props[k][d];
            } else if (k.indexOf('on') === 0 && typeof props[k] === 'function') {
                node.addEventListener(k.substring(2).toLowerCase(), props[k]);
            } else {
                node.setAttribute(k, props[k]);
            }
        }
    }
    if (children) {
        var arr = Array.isArray(children) ? children : [children];
        arr.forEach(function(c) {
            if (c == null) return;
            if (typeof c === 'string') node.appendChild(document.createTextNode(c));
            else node.appendChild(c);
        });
    }
    return node;
}
```

**故意不做的事**：不引入 jQuery/Preact/虚拟 DOM。手机/低端机跑游戏，引入大库得不偿失。

### 3.2 `delegate(rootEl, handlers)` 事件委托

```js
// 在容器上挂一个 listener，根据 data-action 路由
function delegate(root, handlers) {
    root.addEventListener('click', function(e) {
        var el = e.target.closest('[data-action]');
        if (!el || !root.contains(el)) return;
        var fn = handlers[el.dataset.action];
        if (fn) {
            // 把所有 data-* 收成一个 args 对象
            var args = {};
            for (var k in el.dataset) {
                if (k !== 'action') args[k] = el.dataset[k];
            }
            // 上下文 (current target) 放在最末
            fn.call(el, args, e);
        }
    });
}
```

**优势**：
- 渲染时只挂一次 listener，不用每渲染重绑 50 个按钮
- 数据通过 `dataset` 传递，**自动**对值做 HTML 实体转义（`el.dataset.x = "' or 1=1"` 不会 XSS）
- 调用约定：handler 签名 `(args, e) => void`

### 3.3 `bindActions(containerEl, handlers)` 一行绑定

绝大多数页面只需要这样：

```js
var root = document.getElementById('phoneContent');
root.innerHTML = renderMailListPage();
bindActions(root, {
    openMail:    function(a) { openMailDetail(parseInt(a.idx)); },
    deleteMail:  function(a) { deleteMail(parseInt(a.idx)); },
    backToList:  function() { backToMailList(); }
});
```

---

## 4. 改造策略：**两段式渐进**

### 4.1 改造前要先做的"零号工作"

1. 删 [utils.js:54-60](file:///workspace/js/utils.js#L54-L60) 重复 Logger 定义（仅保留 [utils.js:432](file:///workspace/js/utils.js#L432) IIFE 版）——1 处编辑
2. 在 [utils.js](file:///workspace/js/utils.js) 末尾新增 `el()` / `delegate()` / `bindActions()`（约 50 行）——新增 50 行
3. 在 [core.js:1827](file:///workspace/js/core.js#L1827) `UI` 对象上加 `bindActions(handlers)` 别名（让 `UI.bindActions(container, handlers)` 可用）——1 处编辑

**总增量：3 个文件，约 50 行新代码 + 8 行删除。零行为变化。**

### 4.2 第一批改造（高 XSS 风险优先）

按"一旦出错就崩游戏"的严重度排序：

| # | 文件 | 数量 | 改造复杂度 | 风险 |
|---|------|------|------------|------|
| 1 | [phone-ui.js](file:///workspace/js/phone-ui.js) 邮件列表 (2361, 491) | 3 | 低 | 高（带 `i` 参数） |
| 2 | [phone-ui.js](file:///workspace/js/phone-ui.js) NPC 日记 (2213) | 1 | 中 | **高**（含 `npcName` 转义 hack） |
| 3 | [phone-ui.js](file:///workspace/js/phone-ui.js) 朋友圈 (1697, 1698, 1701) | 3 | 中 | **高**（带 idx + 文本） |
| 4 | [phone-ui.js](file:///workspace/js/phone-ui.js) 日记日期选择 (422, 425, 427) | 3 | 中 | **高**（含日期转义 hack） |
| 5 | [phone-ui.js](file:///workspace/js/phone-ui.js) 论坛 (148, 1817, 1840, 1878, 1885, 1900, 1915, 1919, 1937, 1950-1952) | 12 | 中 | 中（带 postIdx） |
| 6 | [phone-ui.js](file:///workspace/js/phone-ui.js) 商店 (2459) | 1 | 低 | 中 |
| 7 | [phone-ui.js](file:///workspace/js/phone-ui.js) API 列表/详情 (4849, 3168) | 2 | 低 | 低 |
| 8 | [phone-ui.js](file:///workspace/js/phone-ui.js) 存档/读档 (6099, 6112-6120, 6125, 6151-6155, 6161, 6184-6185, 6229-6230, 6200) | 18 | 中 | 低 |
| 9 | [phone-ui.js](file:///workspace/js/phone-ui.js) 物品 tabs (2127, 2128, 2131) | 5 | 低 | 低 |
| 10 | [phone-ui.js](file:///workspace/js/phone-ui.js) NPC 列表 (6948, 6960) | 2 | 中 | **高**（NPC 名拼接） |
| 11 | [tavern-compat.js](file:///workspace/js/tavern-compat.js) (3398, 3463, 3700, 3701) | 4 | 中 | **高**（含事实类型转义） |
| 12 | [systems.js](file:///workspace/js/systems.js) (245, 666, 755) | 3 | 低 | 低 |
| 13 | [game.js](file:///workspace/js/game.js) (2855, 2928, 2942, 3454) | 4 | 中 | **高**（AI 生成的选项文本） |
| 14 | [core.js](file:///workspace/js/core.js) (3689, 3695) | 2 | 低 | 低 |

**合计 67 处。**

### 4.3 改造模式（统一范式）

每处改造都遵循 4 步：

```js
// 1. 把 'onclick="funcName(\'' + x + '\')"' 改成
//    'data-action="funcName" data-arg="' + escapeHtml(x) + '"'
//    （注意：dataset 写入是 HTML 安全编码的，x 不再需要 .replace(/'/g,...)）

// 2. 在外层容器拿到引用时，调一次
//    bindActions(containerEl, { funcName: function(a) { ... 原 onclick 逻辑 ... } });

// 3. 验证：手动点一次；XSS 测：把名字改成 O'Brien 测试转义

// 4. 提交一个原子 commit：「refactor: 把 X 页面 onclick 改为委托」
```

### 4.4 边界规则（明确不该改的地方）

- **HTML 标签属性里的 `onclick=`，仅指 `innerHTML` 字符串里**。`el.onclick =`（`=` 风格 JS 属性赋值）保留。
- **现有的 `addEventListener` 调用（86 处）**——已合理，不动。
- **第三方事件或动态创建元素**（`document.createElement` + `addEventListener`）——保持。
- **带 `event.target.closest(...)` 自定义事件**（如 [phone-ui.js:6960](file:///workspace/js/phone-ui.js#L6960)）——已经是事件形式，仅去掉 `onclick="event.stopPropagation();..."` 内联写法，改为对最近容器委托。
- **`onclick="if(event.target===this)closeDiaryDatePicker()"`**（[phone-ui.js:422](file:///workspace/js/phone-ui.js#L422)）这种"模态点击背景关闭"——单独用 `delegate` 不好做（没有 data-action），保留为 innerHTML 后用 `addEventListener('click', e=>{ if(e.target===container) closeDiaryDatePicker() })`。**特殊情况、不强求改。**

---

## 5. 测试与验证

### 5.1 自动化（无现成测试框架，限定范围）

```bash
# 1. 静态检查：必须无内联 onclick（除白名单 4 处）
grep -nP 'onclick="' js/*.js | grep -v 'data-action' | grep -vE 'event\.target===this'

# 2. JS 语法
for f in js/*.js; do node --check "$f" || exit 1; done

# 3. 模拟器手测（README 已有 http server 命令）
python3 -m http.server 8000
# 浏览器开 http://localhost:8000，依次点：邮件 → NPC日记 → 朋友圈 → 论坛 → 商店 → 物品
```

### 5.2 XSS 攻击向量回归

| 输入 | 旧版 | 新版 |
|------|------|------|
| NPC 名字 = `<script>alert(1)</script>` | escapeHtml + .replace 仍然有缝 | dataset 自动转义，绝对安全 |
| 论坛标题 = `O'Brien` | 字符拼接可能出 `'O\'Brien'` | dataset 不需要手动转义 |
| 邮件发送者 = `" onmouseover="alert(1)` | 注入到属性 | dataset 不走属性 |
| AI 输出选项 = `" onclick="hack()` | **可执行 JS** | dataset 转义，文本安全 |

### 5.3 行为不变清单

- 邮件列表点击 → 打开详情 ✓
- NPC 日记点击 → 切换 NPC ✓
- 朋友圈点赞 → 心变色 ✓
- 论坛回复 → 弹出输入框 ✓
- 商店购买 → 弹出确认 ✓
- 存档读档按钮全部可用 ✓

---

## 6. 不在本次范围（明确排除）

| 项 | 原因 |
|----|------|
| `console.*` 替换为 `Logger.*` | 9 个文件 278 处，独立 P1 任务 |
| 抽 `mergeList` 工具函数 | 涉及业务逻辑，独立 P2 任务 |
| 解决数据双轨（gm ↔ gameState） | 架构级，独立 P1 任务 |
| AI 调用入口合一（callAI vs sendAIRequest） | 涉及 prompt 构建，独立 P1 任务 |
| 全部 render 改用 `shouldSkipPageRender` | 性能层，独立 P1 任务 |
| CSS 主题变量化（去重 2000+ 行） | 视觉层，独立 P3 任务 |
| ES5/ES6 风格统一 | 风格规范，独立 P3 任务 |

---

## 7. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 改完某页面白屏 | 改一个提交一个；如白屏 `git revert` 回滚 |
| `bindActions` 重复绑定（同一容器挂多次） | 委托在容器上，一个容器挂一次就够；测试中校验 |
| 回调中 `this` 上下文变化 | `bindActions` 内 handler 已 `.call(el, args, e)`，el 等价于 `e.currentTarget` |
| 性能下降（每次点击 closest） | 67 处规模下 closest 远快于 67 个 listener |
| 现有调用栈中 `window.funcName` 全局函数依赖 | 新写法不依赖全局函数（函数引用直接传） |

---

## 8. 实施顺序（具体步骤）

```
Step 0.   删 utils.js:54-60 重复 Logger        [1 个文件，2分钟]
Step 1.   utils.js 末尾新增 el/delegate/bindActions  [1 个文件，5分钟]
Step 2.   core.js UI 对象加 bindActions 别名  [1 个文件，1分钟]
Step 3.   phone-ui.js 邮件列表 (3 处)         [1 个文件，15分钟]
Step 4.   phone-ui.js NPC 日记 (1 处)         [1 个文件，10分钟]
Step 5.   phone-ui.js 朋友圈 (3 处)            [1 个文件，15分钟]
Step 6.   phone-ui.js 日记日期选择 (3 处)      [1 个文件，10分钟]
Step 7.   phone-ui.js 论坛 (12 处)             [1 个文件，30分钟]
Step 8.   phone-ui.js 商店/物品 (6 处)          [1 个文件，15分钟]
Step 9.   phone-ui.js 存档读档 (18 处)         [1 个文件，30分钟]
Step 10.  phone-ui.js NPC 列表 (2 处)          [1 个文件，10分钟]
Step 11.  phone-ui.js API 列表/详情 (2 处)      [1 个文件，5分钟]
Step 12.  tavern-compat.js 记忆面板 (4 处)     [1 个文件，20分钟]
Step 13.  systems.js 任务/弹窗 (3 处)         [1 个文件，10分钟]
Step 14.  game.js 选项/心声 (4 处)            [1 个文件，15分钟]
Step 15.  core.js 错误面板 (2 处)             [1 个文件，5分钟]
Step 16.  最终验证 + 部署                       [1-2分钟]
```

每步可独立提交。每步人工测试对应页面 1 次。预计总耗时 **3-4 小时**（含测试）。

---

## 9. 验收标准

- [ ] `grep -c 'onclick="' js/*.js` 总数从 67 降到 ≤ 4（仅剩 4 处特殊边界）
- [ ] `node --check js/*.js` 全部通过
- [ ] 本地 8000 端口服务器：13 个改动页面全可正常点
- [ ] NPC 名输入 `<img src=x onerror=alert(1)>`：不弹窗
- [ ] 论坛标题输入 `O'Brien`：不报错
- [ ] 部署到 master 后 GitHub Actions 部署成功
- [ ] 已有功能（手机端 13 个页面、剧情、记忆）全部继续可用

---

## 10. 后续批次预告

完成 P0 后，下一批推荐处理：
- **P1-A**：解决 `gm` ↔ `gameState` 双向同步（统一权威源）
- **P1-B**：AI 调用入口合一（`callAI` 为唯一入口）
- **P1-C**：全部 render 改用 `shouldSkipPageRender`
- **P2**：抽 `mergeList` 工具函数（5 个 merge 函数合并）
- **P3**：CSS 主题变量化 + ES5/ES6 风格统一
