// يبني نسخ «اللصق» لغير المطورين: ملفان فقط (Code.gs + Index.html) + appsscript.json
// paste/demo  ← بيانات تجريبية افتراضياً
// paste/clean ← نسخة نظيفة للاستخدام الفعلي
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const order = ['Config', 'Db', 'Auth', 'Notify', 'Geo', 'Ai', 'Api', 'Setup'];
for (const mode of ['demo', 'clean']) {
  const out = path.join(root, 'paste', mode);
  fs.mkdirSync(out, { recursive: true });
  let code = order.map((f) => `/* ===== ${f}.gs ===== */\n` + src(f + '.gs')).join('\n');
  code = code.replace("var DEFAULT_MODE = 'clean';", `var DEFAULT_MODE = '${mode}';`);
  if (!code.includes(`var DEFAULT_MODE = '${mode}';`)) throw new Error('DEFAULT_MODE not found');
  if (!/function doGet\(/.test(code) || !/function setup\(/.test(code)) throw new Error('doGet/setup missing');
  const index = src('Index.html')
    .replace("<?!= include_('Styles'); ?>", src('Styles.html'))
    .replace("<?!= include_('App'); ?>", src('App.html'));
  if (index.includes('<?')) throw new Error('unresolved template tag in Index.html');
  fs.writeFileSync(path.join(out, 'Code.gs'), code);
  fs.writeFileSync(path.join(out, 'Index.html'), index);
  fs.copyFileSync(path.join(root, 'src', 'appsscript.json'), path.join(out, 'appsscript.json'));
  console.log('built paste/' + mode);
}
