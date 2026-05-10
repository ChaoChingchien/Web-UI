"""Read DOM JSON files with UTF-8 encoding for Windows"""
import json, os, glob, sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

screenshots_dir = r'C:\Projects\Web-AI\server\screenshots'
for f in sorted(glob.glob(os.path.join(screenshots_dir, '*_dom.json'))):
    provider = os.path.basename(f).replace('_dom.json', '')
    with open(f, 'r', encoding='utf-8') as fh:
        data = json.load(fh)

    print(f'\n{"="*60}')
    print(f'  {provider.upper()}')
    print(f'{"="*60}')

    buttons = data.get('dom', {}).get('buttons', [])
    for b in buttons:
        txt = b["text"].replace('\n', ' | ')[:80]
        print(f'  [{b["tag"]:6s}] {b["rect"]:>8s}  "{txt}"')

    if not buttons:
        print('  (no buttons)')
        if 'error' in data:
            print(f'  ERROR: {data["error"]}')
