// فحص صياغة كل ملفات الخادم وسكربت الواجهة
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let n = 0;
for (const f of fs.readdirSync(path.join(root, 'src'))) {
  const p = path.join(root, 'src', f);
  let code = fs.readFileSync(p, 'utf8');
  if (f.endsWith('.html')) { const m = [...code.matchAll(/<script>([\s\S]*?)<\/script>/g)]; if (!m.length) continue; code = m.map((x) => x[1]).join('\n;\n'); }
  else if (!f.endsWith('.gs')) continue;
  new vm.Script(code, { filename: f }); n++;
}
// الدوال الداخلية يجب أن تنتهي بـ "_" حتى لا يستدعيها المتصفح عبر google.script.run
const allowedPublic = new Set(['doGet', 'api', 'authRequestOtp', 'authVerifyOtp', 'authGoogle', 'authLogout', 'setup', 'backupDaily', 'sha256_']);
const bad = [];
for (const f of fs.readdirSync(path.join(root, 'src')).filter((x) => x.endsWith('.gs'))) {
  for (const m of fs.readFileSync(path.join(root, 'src', f), 'utf8').matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)) {
    if (!m[1].endsWith('_') && !allowedPublic.has(m[1])) bad.push(f + ': ' + m[1]);
  }
}
if (bad.length) { console.error('دوال عامة غير مقصودة (يمكن استدعاؤها من المتصفح):\n' + bad.join('\n')); process.exit(1); }
console.log('syntax OK (' + n + ' files), public surface OK');
