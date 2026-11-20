// Render the real App.html in jsdom with google.script.run bridged to the mocked server.
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const { makeEnv } = require('./harness.cjs');
const assert = require('assert');

const env = makeEnv(); env.MAYDAN.MODE = 'demo'; env.setup();
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.html'), 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
const dom = new JSDOM('<!doctype html><html dir="rtl"><body><div id="app"></div><div id="toast" class="hidden"></div></body></html>', { runScripts: 'outside-only', url: 'https://script.google.com/x' });
const w = dom.window;
const errors = [];
w.addEventListener('error', e => errors.push(e.message));
w.confirm = () => true;
w.google = { script: { get run() {
  let ok, fail; const r = new Proxy({}, { get(_, k) {
    if (k === 'withSuccessHandler') return f => { ok = f; return r; };
    if (k === 'withFailureHandler') return f => { fail = f; return r; };
    return (...a) => setTimeout(() => { try { ok(JSON.parse(JSON.stringify(env[k](...a)))); } catch (e) { fail(e); } }, 0);
  } }); return r; } } };
w.L = undefined; // leaflet absent → map should degrade gracefully
w.eval(src);
const $ = s => w.document.querySelector(s), $$ = s => [...w.document.querySelectorAll(s)];
const text = () => w.document.getElementById('app').textContent;
const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const byText = (sel, t) => $$(sel).find(e => e.textContent.trim().includes(t));
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ✔ ' + m); };

(async () => {
  ok(text().includes('تسجيل الدخول'), 'login screen renders');
  $('#iq').value = '2100000003';
  $('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait();
  ok(text().includes('رمز التحقق'), 'OTP step shown');
  const code = env.__mails.at(-1).htmlBody.match(/>(\d{6})</)[1];
  $('#otp').value = code; $('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(80);
  ok(text().includes('الفرق ومعداتها') && text().includes('أحمد سالم'), 'supervisor lands on own crew X-03');
  ok(text().includes('سيارة مراقب') && text().includes('أ ب ج 4521'), 'supervisor car shown with plate');
  ok(text().includes('حفار JCB') && text().includes('ترنشر') && text().includes('بوبكات') && text().includes('بروش مكنسة') && text().includes('شاحنة ديانا'), 'all excavation equipment listed');
  ok(text().includes('متأخر') && text().includes('في الورشة'), 'oil overdue + shop status visible');
  ok(text().includes('عبر المراقب أحمد سالم'), 'worker without phone → contact via supervisor');
  ok($$('a[href^="https://wa.me/"]').length > 3 && $$('a[href^="https://t.me/+"]').length > 3, 'WhatsApp and Telegram links');
  ok(!byText('button', 'تعديل الفرقة'), 'supervisor cannot edit crew (button hidden)');
  // layers
  click(byText('button.chip', 'المعدات')); await wait();
  ok(!text().includes('المعدات والسائقون'), 'equipment layer hidden by toggle');
  click(byText('button.chip', 'المعدات')); await wait();
  // add worker with phone
  click(byText('button', '+ إضافة فرد')); await wait();
  $('#f_name').value = 'عامل اختبار'; $('#f_phone').value = '0557777777';
  $('.drawer form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(100);
  ok(text().includes('عامل اختبار') && text().includes('+966557777777'), 'supervisor adds worker with phone');
  // XSS attempt
  click(byText('button', '+ إضافة فرد')); await wait();
  $('#f_name').value = '<img src=x onerror=alert(1)>';
  $('.drawer form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(100);
  ok(text().includes('<img src=x') && !$('#app img'), 'HTML in names is shown as text (no XSS)');
  // views
  for (const v of ['الخريطة والطلبات', 'ترتيب الأعمال', 'الأفراد', 'المعدات والسيارات']) {
    click(byText('.nav a', v)); await wait(40);
    ok(text().includes(v.split(' ')[0]) && errors.length === 0, 'view renders: ' + v);
  }
  ok(!byText('.nav a', 'المستخدمون'), 'admin views hidden for supervisor');
  // logout → login as admin via Google
  click(byText('button', 'خروج')); await wait(40);
  click(byText('button', 'الدخول بحساب Google')); await wait(80);
  ok(byText('.nav a', 'المستخدمون والصلاحيات'), 'admin via Google sees admin views');
  click(byText('.crewbtn', 'كهرباء')); await wait();
  ok(text().includes('ونش كابلات'), 'switch crew to E-07');
  // move equipment without driver
  click(byText('.nav a', 'المعدات والسيارات')); await wait();
  const row = $$('tr').find(t => t.textContent.includes('EQ-205'));
  click([...row.querySelectorAll('button')].find(b => b.textContent === 'نقل')); await wait();
  $('#f_toCrewId').value = 'CR-X05'; $('#withDrv').checked = false;
  $('.drawer form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(100);
  ok(env.findById_('Equipment', 'EQ-205').crewId === 'CR-X05' && env.findById_('Equipment', 'EQ-205').driverId === '', 'trencher moved without driver from UI');
  // request with proximity
  click(byText('.nav a', 'الخريطة والطلبات')); await wait();
  ok(text().includes('تحميل الخريطة'), 'map loads lazily (no blocking CDN)');
  click(byText('button', 'طلب فرقة')); await wait();
  $('#f_crewId').value = 'CR-E07'; $('#f_neededType').value = 'excav'; $('#f_title').value = 'حفرية GCB';
  $('.drawer form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(150);
  ok(text().includes('فرقة حفريات X-03') && text().includes('كم'), 'request card lists nearby X-03 with distance');
  for (const v of ['المستخدمون والصلاحيات', 'سجل الدخول والتدقيق', 'الإعدادات والتكامل', 'الوكيل الذكي']) {
    click(byText('.nav a', v)); await wait(60);
    ok(errors.length === 0 && !text().includes('undefined'), 'view renders: ' + v);
  }
  click(byText('button', 'الإشعارات')); await wait(60);
  ok(w.document.querySelector('.drawer') && w.document.querySelector('.drawer').textContent.includes('فرقة'), 'notifications panel shows alerts');
  ok(errors.length === 0, 'no runtime errors: ' + errors.join(' | '));
  console.log('\n' + n + ' UI checks passed');
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message, errors); process.exit(1); });
