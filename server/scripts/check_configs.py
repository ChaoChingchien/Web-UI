import sys, json
raw = sys.stdin.buffer.read().decode('utf-8')
data = json.loads(raw)
for p in data:
    wc = p.get('web_config', {})
    ms = '+' if wc.get('modeSelector') else '-'
    mls = '+' if wc.get('modelSelector') else '-'
    tg = '+' if wc.get('toggles') else '-'
    print(f'{p["id"]:10s} | mode={ms} model={mls} toggles={tg}')
