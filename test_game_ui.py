from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
import time
import os
import json

# 配置
BASE_URL = 'http://127.0.0.1:8080/'
API_URL = 'https://api.iamhc.cn/v1'
API_KEY = 'sk-8SbSj8smJLH2NangCqzgv3Ct4nXUDLHaFBRjGFn8BieWpUFY'
MODEL = 'Qwen3.5-397B-A17B'  # 测试显示该模型直接输出原始 JSON，不包裹代码块
OUTPUT_DIR = '/workspace/test_output'
WORLD_DESC = '我想玩一个末日生存游戏，主角是一名普通大学生，在丧尸爆发的校园里求生。'

os.makedirs(OUTPUT_DIR, exist_ok=True)
console_logs = []
network_logs = []

def log(msg):
    print(f'[{time.strftime("%H:%M:%S")}] {msg}')

def screenshot(page, name, full_page=True):
    path = os.path.join(OUTPUT_DIR, name)
    page.screenshot(path=path, full_page=full_page)
    log(f'截图已保存: {path}')
    return path

def get_text(page, selector, default=''):
    try:
        el = page.locator(selector).first
        return el.inner_text(timeout=2000)
    except Exception as e:
        return default

def wait_for_no_loading(page, timeout_ms=120000):
    """等待生成控制条消失"""
    try:
        page.wait_for_selector('#genControl', state='hidden', timeout=timeout_ms)
    except PlaywrightTimeout:
        log('生成控制条未隐藏，继续检查')

def dump_state(page, label='debug'):
    """导出当前页面关键状态到日志"""
    try:
        state = page.evaluate("""
            (function(){
                var s = {
                    currentPage: document.querySelector('.page.active') ? document.querySelector('.page.active').id : null,
                    storyTitle: document.getElementById('storySceneTitle') ? document.getElementById('storySceneTitle').innerText : '',
                    storyHtml: document.getElementById('storyText') ? document.getElementById('storyText').innerHTML.substring(0,500) : '',
                    gameTime: document.getElementById('gameTimeText') ? document.getElementById('gameTimeText').innerText : '',
                    optionsCount: document.querySelectorAll('#optionsContainer .option-btn').length,
                    isWaiting: typeof isWaiting !== 'undefined' ? isWaiting : null,
                    genControlVisible: document.getElementById('genControl') ? document.getElementById('genControl').style.display !== 'none' : null
                };
                if(typeof gameState !== 'undefined'){
                    s.playerDataName = gameState.playerData && gameState.playerData.name ? gameState.playerData.name : '';
                    s.allCharactersKeys = gameState.allCharacters ? Object.keys(gameState.allCharacters) : [];
                    s.relationshipsLen = gameState.relationships ? gameState.relationships.length : 0;
                    s.currentBagLen = gameState.currentBag ? gameState.currentBag.length : 0;
                    s.currentQuestsLen = gameState.currentQuests ? gameState.currentQuests.length : 0;
                    s.keyEventsLen = gameState.keyEvents ? gameState.keyEvents.length : 0;
                    s.convHistoryLen = gameState.conversationHistory ? gameState.conversationHistory.length : 0;
                }
                if(typeof LocalGameAPI !== 'undefined'){
                    s.apiConfigs = LocalGameAPI._configs.map(function(c){ return {baseUrl:c.baseUrl, model:c.model}; });
                    s.apiCurrentSlot = LocalGameAPI._currentSlot;
                }
                return s;
            })()
        """)
        path = os.path.join(OUTPUT_DIR, f'state_{label}_{int(time.time())}.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
        log(f'状态导出: {path}')
        return state
    except Exception as e:
        log(f'状态导出失败: {e}')
        return {}

def configure_api(page):
    """通过 UI 配置 API"""
    log('打开 API 设置')
    page.click('#btnMenuApiSettings')
    page.wait_for_timeout(800)
    screenshot(page, '01_api_settings_list.png')

    # 点击第一个 API 卡片进入详情
    cards = page.locator('.api-card').all()
    if len(cards) > 0:
        cards[0].click()
    else:
        page.evaluate('if(typeof showApiDetail === "function") showApiDetail(0)')
    page.wait_for_timeout(800)
    screenshot(page, '02_api_detail_empty.png')

    # 填充表单
    page.fill('#detailApiName', '测试API')
    page.fill('#detailApiUrl', API_URL)
    page.fill('#detailApiKey', API_KEY)

    model_select = page.locator('#detailApiModelSelect')
    try:
        opts = model_select.locator('option').all_inner_texts()
        log(f'已有模型选项: {opts[:10]}')
    except Exception:
        opts = []
    if MODEL in opts:
        model_select.select_option(MODEL)
    else:
        manual_input = page.locator('#detailApiModelInput')
        if manual_input.is_visible():
            manual_input.fill(MODEL)
        else:
            page.evaluate(f"""
                var sel = document.getElementById('detailApiModelSelect');
                var inp = document.getElementById('detailApiModelInput');
                if(sel) sel.value = {json.dumps(MODEL)};
                if(inp) {{ inp.style.display = ''; inp.value = {json.dumps(MODEL)}; }}
            """)
    page.wait_for_timeout(300)
    screenshot(page, '03_api_detail_filled.png')

    page.click('#btnSaveApiDetail')
    page.wait_for_timeout(800)
    log('API 配置已保存')

    cards = page.locator('.api-card').all()
    if len(cards) > 0:
        cards[0].click()
        page.wait_for_timeout(500)
        page.click('#btnSetCurrentApi')
        page.wait_for_timeout(500)
        log('API 已设为当前')

    close_btn = page.locator('[data-close="apiConfigModal"]').first
    if close_btn.is_visible():
        close_btn.click()
    page.wait_for_timeout(500)
    screenshot(page, '04_menu_after_api_config.png')

def start_game(page):
    """从开始界面创建世界"""
    log('点击开始你的故事')
    page.click('#menuStartCard')
    page.wait_for_timeout(1000)
    screenshot(page, '05_world_setup.png')

    log('填写世界描述和主角设定')
    page.fill('#worldDescription', WORLD_DESC)
    page.fill('#setupPlayerName', '林默')
    page.fill('#setupPlayerGender', '男')
    page.fill('#setupPlayerIdentity', '大三学生')
    page.wait_for_timeout(300)
    screenshot(page, '06_world_setup_filled.png')

    log('点击创造世界')
    page.click('#btnCreateWorld')

    # 等待剧情页激活（可能经过 loadingPage）
    log('等待进入剧情页...')
    try:
        page.wait_for_selector('#storyPage.active', timeout=180000)
    except PlaywrightTimeout:
        dump_state(page, 'story_page_timeout')
        screenshot(page, 'timeout_story_page.png')
        raise

    log('等待 AI 生成剧情文本...')
    try:
        # 等待 storyText 里有内容（任意子元素文本非空）
        page.wait_for_function("""
            () => {
                var el = document.getElementById('storyText');
                return el && el.innerText.trim().length > 10 && el.innerText !== '等待开始...';
            }
        """, timeout=180000)
    except PlaywrightTimeout:
        dump_state(page, 'story_text_timeout')
        screenshot(page, 'timeout_story_text.png')
        raise

    wait_for_no_loading(page, timeout_ms=120000)
    page.wait_for_timeout(1500)
    screenshot(page, '07_story_initial.png')
    dump_state(page, 'after_initial_story')

    title = get_text(page, '#storySceneTitle', '--')
    story = get_text(page, '#storyText', '--')
    time_text = get_text(page, '#gameTimeText', '--')
    log(f'初始标题: {title[:80]}')
    log(f'初始时间: {time_text}')
    log(f'初始剧情长度: {len(story)}')

def make_choice(page, choice_index=0):
    """选择一个选项并发送，等待 AI 响应"""
    # 展开选项面板
    page.evaluate("if(typeof toggleChoicesPanel === 'function') toggleChoicesPanel()")
    page.wait_for_timeout(500)

    options = page.locator('#optionsContainer .option-btn').all()
    log(f'发现 {len(options)} 个选项')
    choice_text = '继续探索校园'
    if len(options) == 0:
        log('没有选项，使用默认自定义行动')
    else:
        idx = min(choice_index, len(options) - 1)
        choice_text = options[idx].inner_text().strip()
        log(f'选择选项 {idx}: {choice_text[:50]}')

    # 直接填充输入框并发送（避免点击被其他元素拦截）
    page.fill('#customAction', choice_text)
    page.click('#btnSendAction')

    log('等待 AI 响应...')
    page.wait_for_timeout(2000)
    wait_for_no_loading(page, timeout_ms=180000)
    try:
        page.wait_for_selector('#optionsContainer .option-btn', timeout=180000)
    except PlaywrightTimeout:
        log('未等到新选项，可能还在生成')
    page.wait_for_timeout(1500)
    screenshot(page, '08_story_after_choice.png')
    dump_state(page, 'after_choice')

def inspect_panel(page, nav_label, page_id, screenshot_name, content_selector=None):
    """导航到指定面板并截图/提取内容"""
    log(f'切换到 {nav_label} 面板')
    nav_items = page.locator('#gameNav .nav-item').all()
    clicked = False
    for item in nav_items:
        try:
            txt = item.inner_text()
            if nav_label in txt:
                item.click()
                clicked = True
                break
        except Exception:
            pass
    if not clicked:
        page.evaluate(f'UI.showPage({json.dumps(page_id)})')

    page.wait_for_timeout(1500)
    screenshot(page, screenshot_name)

    content = ''
    if content_selector:
        try:
            content = page.locator(content_selector).first.inner_text(timeout=3000)
        except Exception:
            content = ''
    log(f'{nav_label} 内容摘要: {content[:250].replace(chr(10), " ")}')
    return content

def inspect_memory_manager(page):
    """检查记忆管理页面"""
    log('切换到记忆管理')
    # 直接调用页面函数确保切换到记忆管理页
    page.evaluate("""
        if (typeof UI !== 'undefined' && UI.showPage) UI.showPage('memoryPage');
        if (typeof MemoryManagerUI !== 'undefined' && MemoryManagerUI.show) MemoryManagerUI.show();
    """)
    try:
        page.wait_for_selector('#memoryPage.active', timeout=5000)
    except PlaywrightTimeout:
        log('记忆页面未激活，继续检查')
    page.wait_for_timeout(1500)
    screenshot(page, '12_memory_page.png')
    content = get_text(page, '#memoryManagerContent', '')
    log(f'记忆管理内容摘要: {content[:250].replace(chr(10), " ")}')
    return content

def run_test():
    with sync_playwright() as p:
        browser = p.webkit.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 900})
        page = context.new_page()
        page.set_default_timeout(15000)

        # 监听控制台日志
        page.on('console', lambda msg: console_logs.append(f'[{msg.type}] {msg.text}'))
        # 监听页面错误
        page.on('pageerror', lambda err: console_logs.append(f'[pageerror] {err}'))
        # 监听网络请求
        page.on('request', lambda req: network_logs.append(f'[REQ] {req.method} {req.url}'))
        page.on('response', lambda resp: network_logs.append(
            f'[RESP] {resp.status} {resp.url}' + (
                f' ({resp.headers.get("content-type","")})' if resp.headers else ''
            )
        ))

        log(f'打开游戏: {BASE_URL}')
        page.goto(BASE_URL, wait_until='domcontentloaded', timeout=60000)
        page.wait_for_selector('#appLoading', state='hidden', timeout=60000)
        page.wait_for_timeout(1000)
        screenshot(page, '00_home.png')

        # 注入 API 配置
        log('通过 localStorage 注入 API 配置')
        api_config = {
            'configs': [{
                'baseUrl': API_URL,
                'apiKey': API_KEY,
                'model': MODEL,
                'models': [],
                'name': '测试API',
                'group': '',
                'compatibleMode': False
            }],
            'currentSlot': 0,
            'autoRotate': False,
            'groups': [],
            'currentGroup': 'all',
            'requestLog': [],
            'failedModels': {}
        }
        page.evaluate(f"""
            localStorage.setItem('free_script_api_config', JSON.stringify({json.dumps(api_config)}));
        """)

        page.reload(wait_until='networkidle', timeout=60000)
        page.wait_for_selector('#appLoading', state='hidden', timeout=60000)
        page.wait_for_timeout(1000)

        configure_api(page)
        start_game(page)
        make_choice(page, choice_index=0)

        # 检查各面板
        results = {}
        results['个人'] = inspect_panel(page, '个人', 'playerPage', '09_panel_player.png', '#playerPageBody')
        results['人际'] = inspect_panel(page, '人际', 'npcPage', '10_panel_npc.png', '#characterList')
        results['日志'] = inspect_panel(page, '日志', 'logPage', '11_panel_log.png', '#logMainContent')
        results['记忆管理'] = inspect_memory_manager(page)

        # 保存日志
        with open(os.path.join(OUTPUT_DIR, 'console_logs.txt'), 'w', encoding='utf-8') as f:
            f.write('\n'.join(console_logs))
        with open(os.path.join(OUTPUT_DIR, 'network_logs.txt'), 'w', encoding='utf-8') as f:
            f.write('\n'.join(network_logs))

        # 汇总
        log('========== 测试结果汇总 ==========')
        for name, content in results.items():
            empty_markers = ['等待AI', '未命名', '未设置', '空']
            is_empty = not content or any(m in content for m in empty_markers)
            status = '❌ 内容为空' if is_empty else '✅ 有内容'
            log(f'{name}: {status} (长度 {len(content)})')

        log('测试完成，所有截图保存在 ' + OUTPUT_DIR)
        browser.close()

if __name__ == '__main__':
    run_test()
