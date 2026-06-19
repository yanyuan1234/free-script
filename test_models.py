import urllib.request
import json
import time

API_URL = 'https://api.iamhc.cn/v1/chat/completions'
API_KEY = 'sk-8SbSj8smJLH2NangCqzgv3Ct4nXUDLHaFBRjGFn8BieWpUFY'

PROMPT = """我想玩一个末日生存游戏，主角是一名普通大学生，在丧尸爆发的校园里求生。

【输出要求·JSON模式】直接输出JSON（以 { 开头），**不要任何前缀说明**，不要"让我开始"、不要"title:"、不要"story:"。
字段：{ "title": "简短章节标题（必填）", "story": "叙事（\\n换行，「」对话）", "choices": [{"id":"A","text":""}], "player": {"name":"","identity":"","stats":[]}, "characters": [{"name":"","relation":"","favorability":0}], "world": [{"type":"","title":"","content":""}], "bag": [{"name":"","count":1}], "quests": [{"title":"","status":""}], "gameTime": {"date":"","time":"","period":""} }
可选字段：hud, relationships, keyEvents, npcMessages, contextSummary（按需使用，空字段省略）
请开始游戏，描述开局场景。"""

MODELS = ['glm-4.7', 'glm-5.1', 'DeepSeek-V4-Flash', 'DeepSeek-V4-Pro', 'Kimi-K2.6', 'Qwen3.5-397B-A17B']

def test_model(model):
    try:
        req = urllib.request.Request(API_URL, data=json.dumps({
            'model': model,
            'messages': [{'role': 'user', 'content': PROMPT}],
            'stream': False
        }, ensure_ascii=False).encode('utf-8'), headers={
            'Authorization': f'Bearer {API_KEY}',
            'Content-Type': 'application/json'
        }, method='POST')
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        content = data['choices'][0]['message']['content']
        starts_json = content.strip().startswith('{')
        has_story = '"story"' in content
        has_title = '"title"' in content
        print(f'\n=== {model} ===')
        print(f'开头是JSON: {starts_json}, 含story: {has_story}, 含title: {has_title}')
        print(f'前400字符:\n{content[:400]}')
        return {'model': model, 'starts_json': starts_json, 'has_story': has_story, 'has_title': has_title, 'content': content}
    except Exception as e:
        print(f'\n=== {model} === 错误: {e}')
        return {'model': model, 'error': str(e)}

results = []
for m in MODELS:
    results.append(test_model(m))
    time.sleep(1)

with open('/workspace/test_output/model_test_results.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print('\n\n推荐模型（以{开头且含story/title）:')
for r in results:
    if r.get('starts_json') and r.get('has_story') and r.get('has_title'):
        print(f"- {r['model']}")
