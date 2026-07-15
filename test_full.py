#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Free-Script 全功能自动化测试 - 3 轮 + 所有页面 + bug 验证"""
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
import time, os, json, traceback

BASE_URL = 'http://127.0.0.1:8080/'
API_URL = 'https://api.iamhc.cn/v1'
API_KEY = 'sk-8SbSj8smJLH2NangCqzgv3Ct4nXUDLHaFBRjGFn8BieWpUFY'
MODEL = 'Qwen3.5-397B-A17B'
OUT = '/workspace/test_output'
WORLD = '我想玩一个末日生存游戏，主角是一名普通大学生，在丧尸爆发的校园里求生。'
os.makedirs(OUT, exist_ok=True)

console_logs, network_logs, errors, findings = [], [], [], []

def log(msg):
    print(f'[{time.strftime("%H:%M:%S")}] {msg}', flush=True)

def shot(page, name):
    p = f'{OUT}/{name}.png'
    try: page.screenshot(path=p, full_page=True); return p
    except Exception as e: log(f'截图失败 {name}: {e}'); return ''

def safe(act, label, default=None):
    try: return act()
    except Exception as e: errors.append(f'{label}: {e}'); return default

def wait_story(page, timeout=180000):
    page.wait_for_function("""
        () => {
            var el = document.getElementById('storyText');
            return el && el.innerText.trim().length > 30 && el.innerText.indexOf('等待开始') === -1;
        }
    """, timeout=timeout)

def wait_no_loading(page, timeout=180000):
    try: page.wait_for_selector('#genControl', state='hidden', timeout=timeout)
    except PlaywrightTimeout: log('genControl 未隐藏')

def page_state(page):
    try:
        return page.evaluate("""() => {
            var st = {};
            st.currentPage = document.querySelector('.page.active')?.id || null;
            st.storyLen = document.getElementById('storyText')?.innerText.trim().length || 0;
            st.optionsLen = document.querySelectorAll('#optionsContainer .option-btn').length;
            st.time = document.getElementById('gameTimeText')?.innerText || '';
            st.isWaiting = typeof isWaiting !== 'undefined' ? isWaiting : null;
            st.modalCount = document.querySelectorAll('.modal-overlay:not(.hidden)').length;
            if (typeof gameState !== 'undefined') {
                st.playerName = gameState.playerData?.name || '';
                st.charKeys = Object.keys(gameState.allCharacters || {});
                st.relLen = (gameState.relationships||[]).length;
                st.bagLen = (gameState.currentBag||[]).length;
                st.questLen = (gameState.currentQuests||[]).length;
                st.eventLen = (gameState.keyEvents||[]).length;
                st.convLen = (gameState.conversationHistory||[]).length;
                st.locations = Object.keys(gameState.worldPlaces || {});
            }
            if (typeof StateManager !== 'undefined') {
                try { st.sm_turns = StateManager.get('progress.turn'); } catch(e){}
                try { st.sm_perm = Object.keys(StateManager.get('entities.permanentFacts') || {}); } catch(e){}
            }
            if (typeof LocalGameAPI !== 'undefined') {
                st.apiModel = LocalGameAPI._configs[LocalGameAPI._currentSlot]?.model || '';
                st.apiUrl = LocalGameAPI._configs[LocalGameAPI._currentSlot]?.baseUrl || '';
                st.apiSlot = LocalGameAPI._currentSlot;
            }
            return st;
        }""")
    except Exception as e: return {'error': str(e)}

def find_obj_in_console(pat):
    matches = [l for l in console_logs if pat in l]
    return matches

def close_modal_by_id(page, modal_id):
    """通过 UI.hideModal 关闭指定 modal，如果失败就暴力关闭"""
    try:
        result = page.evaluate(f"""
            (function() {{
                if (typeof UI !== 'undefined' && UI.hideModal) {{
                    UI.hideModal({json.dumps(modal_id)});
                    return {{method: 'UI.hideModal', ok: true}};
                }}
                return {{method: 'none', ok: false}};
            }})()
        """)
        page.wait_for_timeout(200)
    except: pass
    # 兜底
    page.evaluate(f"""
        (function(){{
            var m = document.getElementById({json.dumps(modal_id)});
            if (m) {{
                m.classList.remove('active');
                m.classList.add('hidden');
                m.style.display = 'none';
            }}
        }})()
    """)
    page.wait_for_timeout(200)

def close_all_modals(page):
    page.evaluate("""
        (function(){
            document.querySelectorAll('.modal-overlay').forEach(m => {
                m.classList.remove('active');
                m.classList.add('hidden');
                m.style.display = 'none';
            });
        })()
    """)
    page.wait_for_timeout(300)

def visit_main_tab(page, label, page_id, idx_in_nav):
    """通过底部 nav 切换主 tab"""
    log(f'访问主 Tab: {label} -> {page_id}')
    try:
        page.evaluate(f"UI.showPage({json.dumps(page_id)})")
        page.wait_for_timeout(1200)
    except Exception as e:
        errors.append(f'showPage {page_id}: {e}')
    s = page_state(page)
    findings.append({'tab': label, 'page': page_id, 'active': s.get('currentPage')==page_id, 'state': s})
    shot(page, f'maintab_{page_id}')

def visit_log_sub(page, sub_id, sub_label):
    """访问日志子页"""
    log(f'访问日志子页: {sub_label} ({sub_id})')
    try:
        page.evaluate(f"UI.showPage('logPage')")
        page.wait_for_timeout(500)
        page.evaluate(f"document.querySelector('[data-log={json.dumps(sub_id)}]')?.click()")
        page.wait_for_timeout(1200)
    except Exception as e:
        errors.append(f'log sub {sub_id}: {e}')
        return
    s = page_state(page)
    # 子页内容在 #logSubContent
    sub_content = safe(lambda: page.locator('#logSubContent').first.inner_text(timeout=2000), f'{sub_id} content', '')
    findings.append({'logSub': sub_label, 'sub_content_len': len(sub_content or ''), 'has_content': bool((sub_content or '').strip())})
    shot(page, f'logsub_{sub_id}')
    # 返回日志主页面
    try:
        page.evaluate("document.getElementById('logSubBackBtn')?.click()")
        page.wait_for_timeout(500)
    except: pass

def visit_memory_tab(page, tab_id, tab_label):
    """访问记忆 12 Tab"""
    log(f'访问记忆 Tab: {tab_label} ({tab_id})')
    try:
        page.evaluate("UI.showPage('memoryPage')")
        page.wait_for_timeout(500)
        page.evaluate(f"document.querySelector('[data-tab={json.dumps(tab_id)}]')?.click()")
        page.wait_for_timeout(1500)
    except Exception as e:
        errors.append(f'mem tab {tab_id}: {e}')
        return
    content = safe(lambda: page.locator('#memoryManagerContent').first.inner_text(timeout=2000), f'mem {tab_id} content', '')
    findings.append({'memTab': tab_label, 'len': len(content or ''), 'hasContent': bool((content or '').strip())})
    shot(page, f'mem_{tab_id}')

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'])
        ctx = browser.new_context(viewport={'width':1280,'height':900})
        page = ctx.new_page()
        page.set_default_timeout(20000)

        page.on('console', lambda m: console_logs.append(f'[{m.type}] {m.text[:300]}'))
        page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
        page.on('response', lambda r: network_logs.append(f'{r.status} {r.url[:100]}'))

        # ====== Phase 1: 启动 + 注入 API ======
        log(f'打开游戏 {BASE_URL}')
        page.goto(BASE_URL, wait_until='domcontentloaded', timeout=60000)
        page.wait_for_selector('#appLoading', state='hidden', timeout=60000)
        page.wait_for_timeout(1500)
        shot(page, '00_home')

        log('注入 API 配置到 localStorage')
        api_cfg = {
            'configs':[{'baseUrl':API_URL,'apiKey':API_KEY,'model':MODEL,'models':[],'name':'测试API','group':'','compatibleMode':False}],
            'currentSlot':0,'autoRotate':False,'groups':[],'currentGroup':'all','requestLog':[],'failedModels':{}
        }
        page.evaluate(f"localStorage.setItem('free_script_api_config', JSON.stringify({json.dumps(api_cfg)}));")
        page.reload(wait_until='networkidle', timeout=60000)
        page.wait_for_selector('#appLoading', state='hidden', timeout=60000)
        page.wait_for_timeout(2000)

        # 验证 API 已注入
        s = page_state(page)
        findings.append({'phase':'api_loaded', 'apiModel':s.get('apiModel'), 'apiUrl':s.get('apiUrl')})

        # ====== Phase 2: 走 UI 配置 API（验证 UI 入口可用） ======
        log('通过 UI 走一遍 API 配置流程')
        try:
            page.click('#btnMenuApiSettings')
            page.wait_for_timeout(1200)
            acm = page.evaluate("document.getElementById('apiConfigModal')?.classList.contains('active')")
            findings.append({'phase':'open_api_config', 'apiConfigModal_active': acm, 'issue': 'apiConfigModal 应打开' if not acm else ''})
            cards = page.locator('.api-card').all()
            if cards:
                cards[0].click()
                page.wait_for_timeout(800)
                adm = page.evaluate("document.getElementById('apiDetailModal')?.classList.contains('active')")
                findings.append({'phase':'open_api_detail', 'apiDetailModal_active': adm, 'issue': 'apiDetailModal 应打开' if not adm else ''})
            shot(page, '01_api_detail')
            # 关闭详情 modal
            close_modal_by_id(page, 'apiDetailModal')
            # 关闭主 modal
            close_modal_by_id(page, 'apiConfigModal')
            modals_after = page.evaluate("Array.from(document.querySelectorAll('.modal-overlay.active')).map(m => m.id)")
            findings.append({'phase':'close_api_modal', 'still_active_modals': modals_after, 'issue': 'API 模态关闭后仍有 active modal' if modals_after else ''})
        except Exception as e:
            errors.append(f'API 配置 UI 流程: {e}')
            close_all_modals(page)

        # ====== Phase 3: 选预设 ======
        log('从预设选择器选个内置预设')
        try:
            page.click('#btnMenuPresets')
            page.wait_for_timeout(1500)
            shot(page, '02_preset_picker')
            pmm = page.evaluate("document.getElementById('presetManagerModal')?.classList.contains('active')")
            findings.append({'phase':'open_preset_manager', 'presetManagerModal_active': pmm, 'issue': 'presetManagerModal 应打开' if not pmm else ''})
            # 看内置预设入口
            all_items = page.evaluate("Array.from(document.querySelectorAll('#presetManagerModal .preset-item, #presetActionList .preset-item, [data-preset-index], [data-builtin]')).length")
            log(f'presetManagerModal 内有 {all_items} 个预设项')
            # 尝试点第一个内置预设（通过"使用预设"或类似按钮）
            built_in_btns = page.locator('#presetManagerModal button:has-text("使用"), #presetManagerModal button:has-text("启用"), #presetManagerModal [data-action*="apply"], #presetManagerModal [data-action*="use"]').all()
            if built_in_btns:
                log(f'发现 {len(built_in_btns)} 个"使用"按钮')
                built_in_btns[0].click()
                page.wait_for_timeout(2000)
                shot(page, '02b_after_apply_preset')
            close_modal_by_id(page, 'presetManagerModal')
            close_all_modals(page)
            modals_after = page.evaluate("Array.from(document.querySelectorAll('.modal-overlay.active')).map(m => m.id)")
            findings.append({'phase':'close_preset_modal', 'still_active_modals': modals_after, 'issue': '预设模态关闭后仍有 active modal' if modals_after else ''})
        except Exception as e:
            errors.append(f'预设选择: {e}')
            close_all_modals(page)

        # 顺便检查 menuPage 是否真的可见
        menu_visible = page.evaluate("document.getElementById('menuPage')?.classList.contains('active')")
        findings.append({'phase':'before_world_setup', 'menuPage_active': menu_visible, 'modals_still_active': page.evaluate("Array.from(document.querySelectorAll('.modal-overlay.active')).map(m => m.id)")})

        # ====== Phase 4: 进世界设定页 + 创建世界 ======
        log('开始游戏 -> 世界设定')
        page.click('#menuStartCard')
        page.wait_for_timeout(1500)
        shot(page, '03_world_setup')
        page.fill('#worldDescription', WORLD)
        page.fill('#setupPlayerName', '林默')
        page.fill('#setupPlayerGender', '男')
        page.fill('#setupPlayerIdentity', '大三学生')
        page.wait_for_timeout(500)
        shot(page, '04_world_setup_filled')

        log('创建世界 - 等待 90s')
        page.click('#btnCreateWorld')
        try:
            page.wait_for_selector('#storyPage.active', timeout=120000)
        except PlaywrightTimeout:
            log('未进入 storyPage，dump state')
            findings.append({'phase':'create_world', 'state':page_state(page), 'errors':list(errors)})
            shot(page, 'fail_create_world')
            browser.close()
            return

        log('等待初始剧情生成...')
        try:
            wait_story(page, timeout=120000)
        except PlaywrightTimeout:
            findings.append({'phase':'initial_story', 'state':page_state(page), 'console_tail':console_logs[-30:]})
            shot(page, 'fail_initial_story')

        wait_no_loading(page)
        page.wait_for_timeout(2000)
        shot(page, '05_story_initial')
        s = page_state(page)
        findings.append({'phase':'initial_story', 'state':s})
        log(f'初始剧情长度: {s.get("storyLen")}, 选项数: {s.get("optionsLen")}')

        # ====== Phase 5: 3 轮选择 ======
        for round_idx in range(3):
            log(f'=== 第 {round_idx+1} 轮 ===')
            try:
                page.evaluate("if(typeof toggleChoicesPanel==='function') toggleChoicesPanel()")
                page.wait_for_timeout(500)
            except: pass
            options = page.locator('#optionsContainer .option-btn').all()
            log(f'本轮选项数: {len(options)}')
            if not options:
                # 没选项时用自定义行动
                action = f'第 {round_idx+1} 轮行动：仔细观察周围环境，谨慎行动'
            else:
                action = options[min(round_idx, len(options)-1)].inner_text().strip()
            log(f'发送: {action[:60]}')
            page.fill('#customAction', action)
            page.click('#btnSendAction')
            page.wait_for_timeout(2000)
            try:
                wait_story(page, timeout=120000)
            except PlaywrightTimeout:
                findings.append({'phase':f'round{round_idx+1}_story','state':page_state(page),'console_tail':console_logs[-20:]})
            wait_no_loading(page)
            page.wait_for_timeout(2000)
            s = page_state(page)
            findings.append({'phase':f'round{round_idx+1}_done','state':s,'action':action[:80]})
            shot(page, f'06_round{round_idx+1}_after')

        # ====== Phase 6: 访问所有主 Tab ======
        log('====== Phase 6: 遍历 6 主 Tab ======')
        for label, pid, idx in [
            ('剧情','storyPage',0),('个人','playerPage',1),('人际','npcPage',2),
            ('日志','logPage',3),('记忆','memoryPage',4),('回顾','recapPage',5)
        ]:
            visit_main_tab(page, label, pid, idx)

        # ====== Phase 7: 遍历日志 12 子页 ======
        log('====== Phase 7: 遍历日志 12 子页 ======')
        log_subs = [
            ('chat','私聊'),('moments','朋友圈'),('forum','论坛'),('rank','排行榜'),
            ('items','物品'),('quests','任务'),('shop','商店'),('achieve','成就'),
            ('diary','日记'),('mail','邮件'),('calendar','日历'),('author_note','作话')
        ]
        for sid, sl in log_subs:
            visit_log_sub(page, sid, sl)

        # ====== Phase 8: 遍历记忆 12 Tab ======
        log('====== Phase 8: 遍历记忆 12 Tab ======')
        mem_tabs = [
            ('overview','总览'),('anchors','永久事实'),('recentMemory','近期记忆'),('quests','约定任务'),
            ('timeline','时间线'),('characters','角色'),('items','物品'),('locations','地点'),
            ('events','事件'),('world','世界'),('search','搜索'),('injection','注入预览')
        ]
        for tid, tl in mem_tabs:
            visit_memory_tab(page, tid, tl)

        # ====== Phase 9: 验证关键 bug 修复状态 ======
        log('====== Phase 9: Bug 验证 ======')
        # B-1: 检查 LocalGameAPI._currentSlot/apiModel
        s = page_state(page)
        findings.append({'bug_check':'LocalGameAPI state', 'api':s.get('apiModel'), 'slot':s.get('apiSlot')})

        # B-2: 测试 settings 模态框
        try:
            page.evaluate("UI.showPage('storyPage')")
            page.wait_for_timeout(500)
            if hasattr(page, 'openSettingsModal'):
                # 尝试通过菜单入口
                pass
            # 通过右上角设置按钮
            try:
                page.click('#btnMenuSettings, .menu-settings-btn, [data-action="openSettings"]', timeout=2000)
            except: pass
            page.wait_for_timeout(1000)
            shot(page, '07_settings')
        except Exception as e:
            errors.append(f'settings 模态: {e}')

        # B-3: 测试 save/load 模态框
        try:
            try: page.click('#btnMenuSaveLoad, [data-action="openSaveLoad"]', timeout=2000)
            except: pass
            page.wait_for_timeout(1000)
            shot(page, '08_saveload')
            try: page.evaluate("document.querySelector('[data-close=saveLoadModal]')?.click()")
            except: pass
            page.wait_for_timeout(300)
        except Exception as e:
            errors.append(f'saveload 模态: {e}')

        # B-4: 测试 presetManager 模态框
        try:
            try: page.click('#btnMenuPresets, [data-action="openPresetManager"]', timeout=2000)
            except: pass
            page.wait_for_timeout(1000)
            shot(page, '09_preset_manager')
            try: page.evaluate("document.querySelector('[data-close=presetManagerModal]')?.click()")
            except: pass
            page.wait_for_timeout(300)
        except Exception as e:
            errors.append(f'preset manager 模态: {e}')

        # B-5: 测试 worldinfo 模态框
        try:
            try: page.click('#btnMenuWorldBook, [data-action="openWorldInfo"]', timeout=2000)
            except: pass
            page.wait_for_timeout(1000)
            shot(page, '10_worldinfo')
            try: page.evaluate("document.querySelector('[data-close=worldInfoModal]')?.click()")
            except: pass
            page.wait_for_timeout(300)
        except Exception as e:
            errors.append(f'worldinfo 模态: {e}')

        # B-6: 测试 regex manager
        try:
            # 通过预设管理内的按钮触发，或独立入口
            page.evaluate("if(typeof RegexManager!=='undefined' && RegexManager.openUI) RegexManager.openUI()")
            page.wait_for_timeout(1000)
            shot(page, '11_regex_manager')
            try: page.evaluate("document.querySelector('[data-close=regexManagerModal]')?.click()")
            except: pass
            page.wait_for_timeout(300)
        except Exception as e:
            errors.append(f'regex manager 模态: {e}')

        # B-7: 测试 swipe
        try:
            page.evaluate("UI.showPage('storyPage')")
            page.wait_for_timeout(500)
            swipe_info = page.evaluate("typeof SwipeManager !== 'undefined' ? {has: true, current: SwipeManager.current, versions: SwipeManager.versions?.length} : {has: false}")
            findings.append({'bug_check':'SwipeManager', 'info': swipe_info})
        except Exception as e:
            errors.append(f'swipe 检查: {e}')

        # B-8: 测试角色卡导出
        try:
            export_info = page.evaluate("typeof exportPlayerAsV2 === 'function' || typeof exportAsV3 === 'function'")
            findings.append({'bug_check':'exportPlayerAsV2 exists', 'has': export_info})
        except Exception as e:
            errors.append(f'export 检查: {e}')

        # B-9: 测试 StateManager Mutator 都能调用
        try:
            mut_check = page.evaluate("""() => {
                var r = {};
                ['BagMutator','CharacterMutator','QuestMutator','LocationMutator',
                 'CurrencyMutator','RelationshipMutator','TimeMutator','UndoMutator']
                .forEach(m => r[m] = typeof window[m] !== 'undefined');
                return r;
            }""")
            findings.append({'bug_check':'All Mutators loaded', 'mutators':mut_check})
        except Exception as e:
            errors.append(f'mutator 检查: {e}')

        # B-10: 测试 EnhancedMemory 字段
        try:
            mem_check = page.evaluate("""() => {
                if (typeof GameMemory === 'undefined') return {has:false};
                return {
                    has: true,
                    permFields: Object.keys(GameMemory.permanentFacts || {}),
                    hasLTM: !!GameMemory.longTermMemory,
                    hasSTM: !!GameMemory.shortTermMemory
                };
            }""")
            findings.append({'bug_check':'EnhancedMemory fields', 'info': mem_check})
        except Exception as e:
            errors.append(f'enhancedmemory 检查: {e}')

        # B-11: 测试 VectorRetriever 状态
        try:
            vec_check = page.evaluate("""() => {
                if (typeof VectorRetriever === 'undefined') return {has:false};
                return {has:true, enabled: VectorRetriever.isEnabled && VectorRetriever.isEnabled()};
            }""")
            findings.append({'bug_check':'VectorRetriever', 'info':vec_check})
        except Exception as e:
            errors.append(f'vectorretriever 检查: {e}')

        # B-12: 测 worldinfo 实际加载
        try:
            wi_check = page.evaluate("""() => {
                if (typeof worldBooks === 'undefined') return {has:false};
                return {has:true, count: (worldBooks||[]).length, names: (worldBooks||[]).map(b=>b.name)};
            }""")
            findings.append({'bug_check':'WorldInfo books', 'info':wi_check})
        except Exception as e:
            errors.append(f'worldinfo 检查: {e}')

        # B-13: 测 GameTimeSystem
        try:
            time_check = page.evaluate("""() => {
                if (typeof GameTimeSystem === 'undefined') return {has:false};
                return {has:true, time: GameTimeSystem.formatTime ? GameTimeSystem.formatTime() : ''};
            }""")
            findings.append({'bug_check':'GameTimeSystem', 'info':time_check})
        except Exception as e:
            errors.append(f'gametime 检查: {e}')

        # B-14: 测 regex manager
        try:
            reg_check = page.evaluate("""() => {
                if (typeof RegexManager === 'undefined') return {has:false};
                return {has:true, scripts: (RegexManager.scripts||[]).length, presetScripts: (RegexManager._presetScripts||[]).length};
            }""")
            findings.append({'bug_check':'RegexManager', 'info':reg_check})
        except Exception as e:
            errors.append(f'regexmanager 检查: {e}')

        # B-15: 测 PresetManager
        try:
            pm_check = page.evaluate("""() => {
                if (typeof PresetManager === 'undefined') return {has:false};
                return {has:true, count: (PresetManager.presets||[]).length, current: PresetManager.currentPresetIndex};
            }""")
            findings.append({'bug_check':'PresetManager', 'info':pm_check})
        except Exception as e:
            errors.append(f'presetmanager 检查: {e}')

        # B-16: 测 MacroEngine
        try:
            me_check = page.evaluate("""() => {
                if (typeof MacroEngine === 'undefined') return {has:false};
                return {has:true, hasUser: typeof MacroEngine.process === 'function'};
            }""")
            findings.append({'bug_check':'MacroEngine', 'info':me_check})
        except Exception as e:
            errors.append(f'macroengine 检查: {e}')

        # ====== Phase 10: 内存/资源检查 ======
        try:
            perf = page.evaluate("""() => {
                return {
                    perf: !!performance.memory,
                    memUsed: performance.memory ? performance.memory.usedJSHeapSize : 0,
                    memLimit: performance.memory ? performance.memory.jsHeapSizeLimit : 0
                };
            }""")
            findings.append({'perf': perf})
        except: pass

        # ====== Phase 11: 错误/警告统计 ======
        err_logs = [l for l in console_logs if '[error]' in l or '[warning]' in l]
        findings.append({'console_errors_count': len(err_logs), 'page_errors': errors})

        # ====== 写出报告 ======
        with open(f'{OUT}/full_findings.json','w',encoding='utf-8') as f:
            json.dump(findings, f, ensure_ascii=False, indent=2)
        with open(f'{OUT}/console_logs.txt','w',encoding='utf-8') as f:
            f.write('\n'.join(console_logs))
        with open(f'{OUT}/network_logs.txt','w',encoding='utf-8') as f:
            f.write('\n'.join(network_logs))
        with open(f'{OUT}/errors.txt','w',encoding='utf-8') as f:
            f.write('\n'.join(errors))

        log(f'====== 测试完成 ======')
        log(f'findings: {len(findings)}, console: {len(console_logs)}, errors: {len(errors)}')
        browser.close()

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print('FATAL:', e)
        traceback.print_exc()
