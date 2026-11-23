"""Build public/index.html (single file) from src/: inlines the app and pins its CSP script hash."""
import hashlib, base64, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'src/index.src.html'), encoding='utf-8').read()
js = open(os.path.join(ROOT, 'src/app.js'), encoding='utf-8').read()
# feature modules (src/modules/*.js, in name order) are inlined at the /*MODULES*/ marker, inside the app scope
mods = sorted(f for f in os.listdir(os.path.join(ROOT, 'src/modules')) if f.endswith('.js'))
assert js.count('/*MODULES*/') == 1, 'module marker missing'
js = js.replace('/*MODULES*/', '\n'.join('// ---- module: ' + f + ' ----\n' + open(os.path.join(ROOT, 'src/modules', f), encoding='utf-8').read() for f in mods))
assert '</script' not in js.lower(), 'app.js must not contain a closing script tag'
pre = [a for a in sys.argv[1:] if a.startswith('--preload=')]
args = [a for a in sys.argv[1:] if not a.startswith('--')]
if pre:
    import json
    data = json.load(open(pre[0].split('=', 1)[1], encoding='utf-8'))
    payload = json.dumps(data, ensure_ascii=False).replace('</', '<\\/')
    assert 'const PRELOAD_EMP = null;' in js
    js = js.replace('const PRELOAD_EMP = null;', 'const PRELOAD_EMP = ' + payload + ';')
block = '\n' + js + '\n'
out = src.replace('<script>\n/*APP_JS*/\n</script>', '<script>' + block + '</script>')
assert out != src, 'placeholder not found'
h = base64.b64encode(hashlib.sha256(block.encode('utf-8')).digest()).decode()
out = out.replace("'SCRIPT_HASH'", "'sha256-" + h + "'")
dest = args[0] if args else os.path.join(ROOT, 'public/index.html')
os.makedirs(os.path.dirname(dest), exist_ok=True)
open(dest, 'w', encoding='utf-8').write(out)
print('built', dest, len(out), 'bytes; script sha256-' + h)
