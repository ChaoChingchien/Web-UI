"""Test selector matching by calling the debug endpoint"""
import sys, json, subprocess, os, tempfile

def test_provider(provider_id):
    url = f'http://localhost:3001/api/debug/screenshot/{provider_id}'
    tmp = os.path.join(tempfile.gettempdir(), f'webai_sel_{provider_id}.json')
    try:
        # Save curl output to file to avoid encoding issues
        subprocess.run(['curl', '-s', '-o', tmp, url], timeout=60, check=True)
        with open(tmp, 'r', encoding='utf-8') as f:
            data = json.load(f)

        print(f'\n{"="*60}')
        print(f'  {provider_id.upper()}')
        print(f'{"="*60}')

        sm = data.get('selectorMatch', {})
        if not sm:
            print('  (no selectorMatch data)')
        for k, v in sorted(sm.items()):
            icon = '+' if v['found'] > 0 else '-'
            found = v['found']
            text = v['text'][:60] if v['text'] else ''
            print(f'  {icon} {k}: found={found}  "{text}"')

        vb = data.get('visibleButtons', [])
        if vb:
            print(f'  Visible buttons ({len(vb)} total):')
            for b in vb[:15]:
                txt = b['text'][:50]
                print(f'    [{b["tag"]}] "{txt}"')
    except Exception as e:
        print(f'  ERROR: {e}')
    finally:
        try: os.unlink(tmp)
        except: pass

if __name__ == '__main__':
    providers = sys.argv[1:] if len(sys.argv) > 1 else ['chatgpt', 'claude', 'deepseek', 'gemini']
    for p in providers:
        test_provider(p)
