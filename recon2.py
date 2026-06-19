from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.webkit.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 800})
    page = context.new_page()
    page.goto('http://localhost:8080/', wait_until='networkidle', timeout=30000)
    
    # Click API settings
    page.click('#btnMenuApiSettings')
    page.wait_for_timeout(1000)
    page.screenshot(path='/workspace/recon_api.png', full_page=True)
    
    # Print API form inputs
    inputs = page.locator('#apiConfigPanel input, #apiConfigPanel textarea, #apiConfigPanel select, #apiConfigPanel button').all()
    print(f'Found {len(inputs)} elements in API panel')
    for i, el in enumerate(inputs[:50]):
        try:
            text = el.inner_text()[:60].replace('\n', ' ')
        except:
            text = ''
        tag = el.evaluate('el => el.tagName')
        el_id = el.get_attribute('id') or ''
        cls = el.get_attribute('class') or ''
        placeholder = el.get_attribute('placeholder') or ''
        print(f'{i}: {tag} text="{text}" id="{el_id}" placeholder="{placeholder}" class="{cls}"')
    
    browser.close()
