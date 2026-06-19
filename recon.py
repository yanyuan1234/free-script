from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.webkit.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 800})
    page = context.new_page()
    page.goto('http://localhost:8080/', wait_until='networkidle', timeout=30000)
    page.screenshot(path='/workspace/recon_home.png', full_page=True)
    print('Screenshot saved: /workspace/recon_home.png')
    
    buttons = page.locator('button, a, input, textarea, select').all()
    for i, el in enumerate(buttons[:80]):
        try:
            text = el.inner_text()[:60].replace('\n', ' ')
        except:
            text = ''
        tag = el.evaluate('el => el.tagName')
        el_id = el.get_attribute('id') or ''
        cls = el.get_attribute('class') or ''
        print(f'{i}: {tag} text="{text}" id="{el_id}" class="{cls}"')
    
    browser.close()
