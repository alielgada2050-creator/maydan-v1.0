'use strict';
/**
 * Maydan server — runs on Google Cloud Run (or locally). No framework: Node 20 built-ins only.
 * Security: scrypt password hashes, OTP (hashed, 5 min, 3 tries, 60 s resend), lockout, HttpOnly+Secure+SameSite=Strict
 * session cookies (idle 30 min / absolute 12 h), server-side role checks, CSRF header + Origin check, rate limits,
 * strict CSP and security headers, body-size limits, audit log, secrets only from environment / Secret Manager.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { makeStore, makeBlobs } = require('./store');
const X = require('./integrations');

const PORT = +process.env.PORT || 8080;
const PROD = process.env.NODE_ENV === 'production';
const IDLE = 30 * 60e3, ABS = 12 * 3600e3, OTP_TTL = 5 * 60e3, LOCK = 15 * 60e3, MAX_FAILS = 5;
const ROLES = ['admin', 'pm', 'eng', 'sup', 'viewer'];
const PERMS = { admin: ['users', 'write', 'audit', 'data'], pm: ['write', 'audit'], eng: ['write'], sup: ['write'], viewer: [] };
const store = makeStore();
const blobs = makeBlobs();
const SECRET = process.env.SESSION_SECRET || (PROD ? null : 'dev-only-secret-change-me');
if (!SECRET || (PROD && SECRET.length < 32)) { console.error('SESSION_SECRET (>=32 chars) is required in production'); process.exit(1); }

// ---------- helpers ----------
const now = () => Date.now();
const iso = () => new Date().toISOString();
const rid = (n) => crypto.randomBytes(n || 24).toString('base64url');
const h256 = (s) => crypto.createHash('sha256').update(String(s)).digest('base64url');
const hmac = (s) => crypto.createHmac('sha256', SECRET).update(String(s)).digest('base64url');
const teq = (a, b) => { const A = Buffer.from(String(a)), B = Buffer.from(String(b)); return A.length === B.length && crypto.timingSafeEqual(A, B); };
const scrypt = (pass, salt) => new Promise((res, rej) => crypto.scrypt(String(pass), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k.toString('base64url')))));
const validIqama = (s) => /^[12]\d{9}$/.test(String(s || ''));
const validPhone = (p) => /^9665\d{8}$/.test(String(p || ''));
const strong = (p) => typeof p === 'string' && p.length >= 10 && p.length <= 200 && /[A-Za-z؀-ۿ]/.test(p) && /\d/.test(p);
const maskPhone = (p) => (p ? '+' + p.slice(0, 4) + '•• ••• ' + p.slice(-3) : '');
const maskMail = (m) => { if (!m || !m.includes('@')) return ''; const [a, b] = m.split('@'); return a[0] + '•••••' + a.slice(-1) + '@' + b; };
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n || 200);
const pub = (u) => ({ id: u.id, name: u.name, iqama: u.iqama, phone: u.phone, email: u.email, role: u.role, active: !!u.active, pending: !!u.activation, created: u.created });
class HttpErr extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const E = (s, m) => { throw new HttpErr(s, m); };

// ---------- rate limiting (per instance; Cloud Run also supports Cloud Armor for global limits) ----------
const buckets = new Map();
function limit(key, max, winMs) { const t = now(); const b = buckets.get(key) || { n: 0, reset: t + winMs }; if (t > b.reset) { b.n = 0; b.reset = t + winMs; } b.n++; buckets.set(key, b); if (b.n > max) E(429, 'محاولات كثيرة. حاول بعد قليل.'); }
setInterval(() => { const t = now(); for (const [k, b] of buckets) if (t > b.reset) buckets.delete(k); }, 60e3).unref();

// ---------- audit ----------
async function audit(user, res, detail, ip) { const id = Date.now().toString(36) + rid(4); await store.set('audit', id, { id, tm: iso(), user: clean(user, 100), res: clean(res, 80), detail: clean(detail, 300), dev: clean(ip, 60) }); }

// ---------- cookies & sessions ----------
function parseCookies(req) { const o = {}; (req.headers.cookie || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }); return o; }
function setCookie(res, name, val, maxAgeSec) { const parts = [name + '=' + encodeURIComponent(val), 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=' + maxAgeSec]; if (PROD || process.env.COOKIE_SECURE === '1') parts.push('Secure'); const prev = res.getHeader('Set-Cookie') || []; res.setHeader('Set-Cookie', [].concat(prev, parts.join('; '))); }
const signed = (v) => v + '.' + hmac(v);
const unsign = (s) => { if (!s) return null; const i = s.lastIndexOf('.'); if (i < 1) return null; const v = s.slice(0, i); return teq(hmac(v), s.slice(i + 1)) ? v : null; };
async function currentUser(req) {
  const sid = unsign(parseCookies(req).mdn_sid); if (!sid) return null;
  const s = await store.get('sessions', h256(sid)); if (!s || s.exp < now() || s.abs < now()) { if (s) await store.del('sessions', h256(sid)); return null; }
  const u = await store.get('users', s.uid); if (!u || !u.active) return null;
  if (s.exp - now() < IDLE - 60e3) { s.exp = now() + IDLE; await store.set('sessions', h256(sid), s); }
  return u;
}
async function requireUser(req, perm) { const u = await currentUser(req); if (!u) E(401, 'انتهت الجلسة. سجّل الدخول مجدداً.'); if (perm && !(PERMS[u.role] || []).includes(perm)) E(403, 'لا تملك صلاحية لهذا الإجراء.'); return u; }

// ---------- activation codes ----------
async function issueActivation(u) { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const code = Array.from(crypto.randomBytes(8), (b) => A[b % A.length]).join(''); const salt = rid(12); u.activation = { hash: h256(code + salt), salt, exp: now() + 72 * 3600e3 }; u.active = false; delete u.hash; delete u.salt; await store.set('users', u.id, u); return code; }
const findByIqama = async (iq) => (await store.list('users', (u) => u.iqama === iq))[0] || null;

// ---------- routes ----------
const R = {};
const route = (m, p, fn) => { R[m + ' ' + p] = fn; };
route('GET', '/api/health', async () => ({ app: 'maydan', needsSetup: (await store.count('users')) === 0, ai: X.aiProviders().map((p) => p.name), odoo: X.odooOn() }));

route('POST', '/api/auth/setup', async (req, res, b, ip) => {
  limit('setup:' + ip, 5, 15 * 60e3);
  const tok = process.env.SETUP_TOKEN; if (!tok || tok.length < 16) E(403, 'الإعداد الأولي مغلق: اضبط SETUP_TOKEN على الخادم.');
  if (!teq(h256(b.token || ''), h256(tok))) E(403, 'رمز الإعداد غير صحيح.');
  if ((await store.count('users')) > 0) E(409, 'تم إعداد المنصة مسبقاً.');
  if (!validIqama(b.iqama) || !validPhone(b.phone) || clean(b.name).length < 3 || !strong(b.pass)) E(400, 'تحقق من الاسم والإقامة والجوال وقوة كلمة المرور.');
  const salt = rid(16); const u = { id: 'u-' + rid(9), name: clean(b.name, 80), iqama: b.iqama, phone: b.phone, email: clean(b.email, 120), role: 'admin', active: true, salt, hash: await scrypt(b.pass, salt), created: iso() };
  await store.set('users', u.id, u); await audit(u.name, 'إنشاء حساب مشرف المنصة', '', ip); return { ok: true };
});
route('POST', '/api/auth/login', async (req, res, b, ip) => {
  limit('login:' + ip, 30, 15 * 60e3);
  const iq = String(b.iqama || ''); if (!validIqama(iq)) E(400, 'رقم الإقامة/الهوية يجب أن يكون 10 أرقام ويبدأ بـ 1 أو 2.');
  const lk = await store.get('locks', iq); if (lk && lk.until > now()) E(423, 'الحساب مقفل مؤقتاً بسبب محاولات خاطئة. حاول بعد ' + Math.ceil((lk.until - now()) / 60e3) + ' دقيقة.');
  const u = await findByIqama(iq);
  if (u && u.activation) return { step: 'activate' };
  const h = await scrypt(String(b.pass || ''), u && u.salt ? u.salt : 'no-user-salt-dummy');
  if (!(u && u.active && u.hash && teq(h, u.hash))) {
    const l = await store.tx('locks', iq, (cur) => { const x = cur || { fails: 0, until: 0 }; x.fails++; if (x.fails >= MAX_FAILS) { x.until = now() + LOCK; x.fails = 0; } return x; });
    await audit('إقامة ' + iq[0] + '•••••••' + iq.slice(-2), l.until > now() ? 'قفل مؤقت' : 'كلمة مرور خاطئة', '', ip);
    E(401, l.until > now() ? 'تم قفل الحساب 15 دقيقة بعد 5 محاولات خاطئة.' : 'بيانات الدخول غير صحيحة.');
  }
  await store.del('locks', iq);
  const pre = rid(24); await store.set('pre', h256(pre), { uid: u.id, exp: now() + 10 * 60e3, tries: 3, otp: null, resendAt: 0 });
  setCookie(res, 'mdn_pre', signed(pre), 600);
  return { step: 'otp', masks: { sms: maskPhone(u.phone), email: maskMail(u.email) } };
});
async function preState(req) { const pre = unsign(parseCookies(req).mdn_pre); if (!pre) E(401, 'انتهت مهلة الدخول. ابدأ من جديد.'); const p = await store.get('pre', h256(pre)); if (!p || p.exp < now()) E(401, 'انتهت مهلة الدخول. ابدأ من جديد.'); return { key: h256(pre), p }; }
route('POST', '/api/auth/otp/send', async (req, res, b, ip) => {
  limit('otp:' + ip, 15, 15 * 60e3);
  const { key, p } = await preState(req); if (p.resendAt > now()) E(429, 'يمكن إعادة الإرسال بعد ' + Math.ceil((p.resendAt - now()) / 1000) + ' ثانية.');
  const u = await store.get('users', p.uid); if (!u) E(401, 'انتهت مهلة الدخول.');
  const channel = b.channel === 'email' && u.email ? 'email' : 'sms';
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0'); const salt = rid(12);
  p.otp = { hash: h256(code + salt), salt, exp: now() + OTP_TTL }; p.tries = 3; p.resendAt = now() + 60e3; await store.set('pre', key, p);
  try { const r = await X.sendOtp(channel, channel === 'sms' ? u.phone : u.email, code); return { sent: true, devCode: r.dev ? code : undefined }; } catch (e) { console.error('otp send failed', e.message); E(502, 'تعذّر إرسال الرمز. تواصل مع مشرف المنصة.'); }
});
route('POST', '/api/auth/otp/verify', async (req, res, b, ip) => {
  limit('otpv:' + ip, 30, 15 * 60e3);
  const { key, p } = await preState(req); if (!p.otp || p.otp.exp < now()) E(401, 'انتهت صلاحية الرمز. اطلب رمزاً جديداً.');
  const u = await store.get('users', p.uid); if (!u || !u.active) E(401, 'انتهت مهلة الدخول.');
  if (!teq(h256(String(b.code || '') + p.otp.salt), p.otp.hash)) { p.tries--; await audit(u.name, 'رمز تحقق خاطئ', '', ip); if (p.tries <= 0) { await store.del('pre', key); E(401, 'استُنفدت محاولات الرمز. سجّل الدخول من جديد.'); } await store.set('pre', key, p); E(400, 'رمز غير صحيح. المحاولات المتبقية: ' + p.tries); }
  await store.del('pre', key); setCookie(res, 'mdn_pre', '', 0);
  const sid = rid(32); await store.set('sessions', h256(sid), { uid: u.id, exp: now() + IDLE, abs: now() + ABS, ip: clean(ip, 60), ua: clean(req.headers['user-agent'], 160), created: iso() });
  setCookie(res, 'mdn_sid', signed(sid), ABS / 1000); await audit(u.name, 'نجاح', '', ip); return { user: pub(u) };
});
route('GET', '/api/auth/me', async (req) => { const u = await currentUser(req); return { user: u ? pub(u) : null }; });
route('POST', '/api/auth/logout', async (req, res, b, ip) => { const sid = unsign(parseCookies(req).mdn_sid); if (sid) { const s = await store.get('sessions', h256(sid)); await store.del('sessions', h256(sid)); if (s) { const u = await store.get('users', s.uid); if (u) await audit(u.name, 'خروج', '', ip); } } setCookie(res, 'mdn_sid', '', 0); return { ok: true }; });
route('POST', '/api/auth/activate', async (req, res, b, ip) => {
  limit('act:' + ip, 10, 15 * 60e3);
  const u = await findByIqama(String(b.iqama || '')); if (!u || !u.activation || u.activation.exp < now()) E(400, 'رمز التفعيل غير صالح أو منتهٍ. اطلب رمزاً جديداً من مشرف المنصة.');
  if (!teq(h256(String(b.code || '').trim().toUpperCase() + u.activation.salt), u.activation.hash)) { await audit(u.name, 'رمز تفعيل خاطئ', '', ip); E(400, 'رمز التفعيل غير صحيح.'); }
  if (!strong(b.pass)) E(400, 'كلمة المرور: 10 أحرف على الأقل وتحتوي حروفاً وأرقاماً.');
  u.salt = rid(16); u.hash = await scrypt(b.pass, u.salt); delete u.activation; u.active = true; await store.set('users', u.id, u); await audit(u.name, 'تفعيل الحساب', '', ip); return { ok: true };
});

route('POST', '/api/requests', async (req, res, b, ip) => {
  limit('req:' + ip, 5, 60 * 60e3);
  if (!validIqama(b.iqama) || !validPhone(b.phone) || clean(b.name).length < 3) E(400, 'تحقق من الاسم ورقم الإقامة والجوال.');
  if (await findByIqama(b.iqama) || (await store.list('requests', (r) => r.iqama === b.iqama && r.st === 'pending')).length) E(409, 'يوجد حساب أو طلب سابق لهذا الرقم.');
  const r = { id: 'r-' + rid(9), name: clean(b.name, 80), iqama: b.iqama, phone: b.phone, email: clean(b.email, 120), role: ['eng', 'sup', 'pm', 'viewer'].includes(b.role) ? b.role : 'viewer', msg: clean(b.msg, 400), tm: iso(), st: 'pending' };
  await store.set('requests', r.id, r); await audit(r.name, 'طلب حساب', r.role, ip); return { ok: true };
});
route('GET', '/api/requests', async (req) => { await requireUser(req, 'users'); return { requests: (await store.list('requests', (r) => r.st === 'pending')).sort((a, b) => b.tm.localeCompare(a.tm)) }; });
route('POST', '/api/requests/:id/approve', async (req, res, b, ip, prm) => {
  const me = await requireUser(req, 'users'); const r = await store.get('requests', prm.id); if (!r || r.st !== 'pending') E(404, 'الطلب غير موجود.');
  if (await findByIqama(r.iqama)) E(409, 'يوجد مستخدم بهذا الرقم.');
  r.st = 'approved'; await store.set('requests', r.id, r); const u = { id: 'u-' + rid(9), name: r.name, iqama: r.iqama, phone: r.phone, email: r.email, role: r.role, active: false, created: iso() };
  const code = await issueActivation(u); await audit(me.name, 'اعتماد طلب حساب', u.name, ip); return { code };
});
route('POST', '/api/requests/:id/reject', async (req, res, b, ip, prm) => { const me = await requireUser(req, 'users'); const r = await store.get('requests', prm.id); if (!r) E(404, 'الطلب غير موجود.'); r.st = 'rejected'; await store.set('requests', r.id, r); await audit(me.name, 'رفض طلب حساب', r.name, ip); return { ok: true }; });

route('GET', '/api/users', async (req) => { const me = await requireUser(req); if (!(PERMS[me.role] || []).includes('users')) return { users: [pub(me)] }; return { users: (await store.list('users')).map(pub) }; });
route('POST', '/api/users', async (req, res, b, ip) => {
  const me = await requireUser(req, 'users'); if (!validIqama(b.iqama) || !validPhone(b.phone) || clean(b.name).length < 2) E(400, 'تحقق من رقم الإقامة والجوال.'); if (await findByIqama(b.iqama)) E(409, 'يوجد مستخدم بهذا الرقم.');
  const u = { id: 'u-' + rid(9), name: clean(b.name, 80), iqama: b.iqama, phone: b.phone, email: clean(b.email, 120), role: ROLES.includes(b.role) ? b.role : 'viewer', active: false, created: iso() };
  const code = await issueActivation(u); await audit(me.name, 'إضافة مستخدم', u.name, ip); return { code };
});
route('PATCH', '/api/users/:id', async (req, res, b, ip, prm) => {
  const me = await requireUser(req, 'users'); const u = await store.get('users', prm.id); if (!u) E(404, 'المستخدم غير موجود.'); if (u.id === me.id) E(400, 'لا يمكنك تعديل صلاحيتك أو إيقاف حسابك.');
  if (b.role != null) { if (!ROLES.includes(b.role)) E(400, 'صلاحية غير صالحة.'); u.role = b.role; } if (b.active != null && !u.activation) u.active = !!b.active;
  await store.set('users', u.id, u); /* a deactivated user is rejected on the next request: currentUser() checks u.active */ await audit(me.name, 'تعديل مستخدم', u.name + ' ' + u.role + (u.active ? '' : ' (موقوف)'), ip); return { user: pub(u) };
});
route('POST', '/api/users/:id/activation', async (req, res, b, ip, prm) => { const me = await requireUser(req, 'users'); const u = await store.get('users', prm.id); if (!u) E(404, 'المستخدم غير موجود.'); if (u.id === me.id) E(400, 'لا يمكن إعادة تعيين حسابك من هنا.'); const code = await issueActivation(u); await audit(me.name, 'إصدار رمز تفعيل', u.name, ip); return { code }; });

route('GET', '/api/state', async (req) => { await requireUser(req); const s = await store.get('state', 'main'); return { version: s ? s.version : 0, state: s ? JSON.parse(s.json) : null }; });
route('PUT', '/api/state', async (req, res, b, ip) => {
  const me = await requireUser(req, 'write'); if (!b || typeof b.state !== 'object' || !Array.isArray(b.state.crews)) E(400, 'بيانات غير صالحة.');
  const st = Object.assign({}, b.state, { users: [], locks: {}, audit: [] }); const json = JSON.stringify(st); if (json.length > 4.5 * 1024 * 1024) E(413, 'حجم البيانات كبير. أرسل الملفات عبر التخزين وليس داخل البيانات.');
  const out = await store.tx('state', 'main', (cur) => { const v = cur ? cur.version : 0; if (+b.version !== v) E(409, 'تم تعديل البيانات من مستخدم آخر.'); return { version: v + 1, json, by: me.id, tm: iso() }; });
  return { version: out.version };
});
route('GET', '/api/audit', async (req) => { await requireUser(req, 'audit'); return { audit: (await store.list('audit')).sort((a, b) => b.tm.localeCompare(a.tm)).slice(0, 500) }; });
route('POST', '/api/audit', async (req, res, b, ip) => { const me = await requireUser(req); limit('audit:' + me.id, 120, 60e3); await audit(me.name, b.res, b.detail, ip); return { ok: true }; });
route('POST', '/api/ai/chat', async (req, res, b) => {
  const me = await requireUser(req); limit('ai:' + me.id, 20, 60e3);
  const msgs = Array.isArray(b.messages) ? b.messages.slice(0, 8).filter((m) => m && ['system', 'user', 'assistant'].includes(m.role)).map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 60000) })) : []; if (!msgs.length) E(400, 'رسالة فارغة.');
  const r = await X.aiChat(msgs); if (!r) E(503, 'لا يوجد مزود ذكاء اصطناعي متاح.'); return r;
});
route('POST', '/api/odoo/employees', async (req, res, b, ip) => { const me = await requireUser(req, 'data'); limit('odoo:' + me.id, 6, 60e3); try { const rows = await X.odooEmployees(); await audit(me.name, 'سحب الموظفين من Odoo', rows.length + ' سجل', ip); return { rows }; } catch (e) { E(502, e.message); } });

// ---------- attachments ----------
const FILE_TYPES = { 'application/pdf': (b) => b.slice(0, 4).toString('latin1') === '%PDF', 'image/jpeg': (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF, 'image/png': (b) => b.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/webp': (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (b) => b.slice(0, 2).toString('latin1') === 'PK', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (b) => b.slice(0, 2).toString('latin1') === 'PK' };
function readRaw(req, max) { return new Promise((resolve, reject) => { let n = 0; const chunks = []; req.on('data', (c) => { n += c.length; if (n > max) { reject(new HttpErr(413, 'الملف أكبر من 10 ميجابايت.')); req.destroy(); } else chunks.push(c); }); req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject); }); }
async function fileRoutes(req, res, url, ip) {
  if (req.method === 'POST' && url.pathname === '/api/files') {
    const me = await requireUser(req, 'write'); limit('files:' + me.id, 60, 60e3);
    const want = String(req.headers['x-file-id'] || ''); if (want && !/^[A-Za-z0-9_-]{8,64}$/.test(want)) E(400, 'معرّف غير صالح.'); if (want && await store.get('files', want)) E(409, 'المعرّف مستخدم.');
    const type = String(req.headers['content-type'] || '').split(';')[0].trim(); const check = FILE_TYPES[type]; if (!check) E(415, 'نوع الملف غير مسموح.');
    const buf = await readRaw(req, 10 * 1024 * 1024); if (!buf.length || !check(buf)) E(415, 'محتوى الملف لا يطابق نوعه.');
    const id = want || rid(18); const name = clean(decodeURIComponent(String(req.headers['x-file-name'] || 'file')), 120).replace(/[\\/:*?"<>|]/g, '_');
    await blobs.put(id, buf); await store.set('files', id, { id, name, type, size: buf.length, by: me.id, tm: iso() }); await audit(me.name, 'رفع ملف', name, ip);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ id })); return true;
  }
  const m = /^\/api\/files\/([A-Za-z0-9_-]{8,64})$/.exec(url.pathname); if (!m) return false;
  if (req.method === 'GET') { await requireUser(req); const meta = await store.get('files', m[1]); const buf = meta && await blobs.get(m[1]); if (!buf) E(404, 'الملف غير موجود.');
    res.writeHead(200, { 'Content-Type': meta.type, 'Content-Length': buf.length, 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(meta.name), 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, no-store' }); res.end(buf); return true; }
  if (req.method === 'DELETE') { const me = await requireUser(req, 'write'); const meta = await store.get('files', m[1]); if (!meta) E(404, 'الملف غير موجود.'); if (meta.by !== me.id && !['admin', 'pm'].includes(me.role)) E(403, 'لا تملك صلاحية حذف هذا الملف.'); await blobs.del(m[1]); await store.del('files', m[1]); await audit(me.name, 'حذف ملف', m[1], ip); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return true; }
  return false;
}

// ---------- static page ----------
const PUBLIC = path.join(__dirname, '..', 'public');
let PAGE = null;
function page() {
  if (!PAGE || !PROD) { let h = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8'); h = h.replace('<meta name="maydan-server" content="0">', '<meta name="maydan-server" content="1">');
    const csp = (/http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(h) || [])[1] || "default-src 'none'"; PAGE = { h, csp: csp.replace(/connect-src [^;]+/, "connect-src 'self'") + "; frame-ancestors 'none'" }; }
  return PAGE;
}
function secHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(self), microphone=(), payment=()'); res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

// ---------- server ----------
const MAX_BODY = 5 * 1024 * 1024;
function readBody(req) { return new Promise((resolve, reject) => { let n = 0; const chunks = []; req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { reject(new HttpErr(413, 'الطلب كبير جداً.')); req.destroy(); } else chunks.push(c); }); req.on('end', () => { if (!n) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(new HttpErr(400, 'JSON غير صالح.')); } }); req.on('error', reject); }); }
function match(method, url) { if (R[method + ' ' + url]) return [R[method + ' ' + url], {}]; for (const k of Object.keys(R)) { const [m, p] = k.split(' '); if (m !== method || !p.includes(':')) continue; const re = new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[A-Za-z0-9_-]{1,64})') + '$'); const mm = re.exec(url); if (mm) return [R[k], mm.groups]; } return [null, null]; }
const server = http.createServer(async (req, res) => {
  secHeaders(res);
  const url = new URL(req.url, 'http://x'); const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  try {
    if (url.pathname.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (req.method !== 'GET') { if (req.headers['x-requested-with'] !== 'maydan') E(403, 'طلب مرفوض.'); const o = req.headers.origin; if (o && o !== 'https://' + req.headers.host && o !== 'http://' + req.headers.host) E(403, 'مصدر غير مسموح.'); }
      limit('ip:' + ip, 600, 60e3);
      if (url.pathname.startsWith('/api/files') && await fileRoutes(req, res, url, ip)) return;
      const [fn, prm] = match(req.method, url.pathname); if (!fn) E(404, 'غير موجود.');
      const body = req.method === 'GET' ? {} : await readBody(req);
      const out = await fn(req, res, body, ip, prm); res.writeHead(200); return res.end(JSON.stringify(out));
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) { const p = page(); res.setHeader('Content-Security-Policy', p.csp); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.writeHead(200); return res.end(p.h); }
    if (url.pathname === '/robots.txt') { res.setHeader('Content-Type', 'text/plain'); res.writeHead(200); return res.end('User-agent: *\nDisallow: /\n'); }
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
  } catch (e) {
    const status = e instanceof HttpErr ? e.status : 500; if (status === 500) console.error(e);
    if (!res.headersSent) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); } res.end(JSON.stringify({ error: status === 500 ? 'خطأ في الخادم.' : e.message }));
  }
});
server.headersTimeout = 20000; server.requestTimeout = 60000;
if (require.main === module) server.listen(PORT, () => console.log('maydan listening on :' + PORT + (PROD ? ' (production)' : ' (development)')));
module.exports = { server, store };
