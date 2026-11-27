'use strict';
// Run: npm test   (uses the file store in a temp dir and the console OTP provider; no network, no cloud)
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('os'); const fs = require('fs'); const path = require('path');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'maydan-test-'));
Object.assign(process.env, { STORE: 'file', DATA_DIR: DIR, OTP_PROVIDER: 'console', SETUP_TOKEN: 'test-setup-token-123456', NODE_ENV: 'test', PORT: '0', GOOGLE_CLIENT_ID: 'cid-test.apps.googleusercontent.com', GOOGLE_VERIFY_STUB: '1', GOOGLE_MAPS_KEY: 'test-maps-key', ERP_WEBHOOK_SECRET: 'erp-secret' });
const http = require('http'); const crypto = require('crypto'); const ERP = []; const erpSrv = http.createServer((q, s) => { let b = ''; q.on('data', (c) => { b += c; }); q.on('end', () => { ERP.push({ h: q.headers, b }); s.end('ok'); }); });
const { server } = require('../index.js');
let base;
before(() => new Promise((r) => erpSrv.listen(0, () => { process.env.ERP_WEBHOOK_URL = 'http://127.0.0.1:' + erpSrv.address().port + '/maydan'; server.listen(0, () => { base = 'http://127.0.0.1:' + server.address().port; r(); }); })));
after(() => { server.close(); erpSrv.close(); fs.rmSync(DIR, { recursive: true, force: true }); });

function client() {
  const jar = {};
  const call = async (method, p, body, extra) => {
    const headers = Object.assign({ 'Content-Type': 'application/json', 'X-Requested-With': 'maydan' }, extra || {});
    const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; '); if (ck) headers.Cookie = ck;
    const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach((c) => { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v) jar[k] = v; else delete jar[k]; });
    let j = null; try { j = await r.json(); } catch (e) { /* html */ } return { status: r.status, j, r };
  };
  return { call, jar };
}
async function signIn(c, iqama, pass) {
  const l = await c.call('POST', '/api/auth/login', { iqama, pass }); assert.strictEqual(l.status, 200, JSON.stringify(l.j));
  const s = await c.call('POST', '/api/auth/otp/send', { channel: 'sms' }); assert.match(s.j.devCode, /^\d{6}$/);
  const v = await c.call('POST', '/api/auth/otp/verify', { code: s.j.devCode }); assert.strictEqual(v.status, 200); return v.j.user;
}

test('health reports setup needed and no AI/Odoo configured', async () => {
  const c = client(); const h = await c.call('GET', '/api/health');
  assert.deepStrictEqual(h.j, { app: 'maydan', needsSetup: true, ai: [], odoo: false, otp: { sms: true, email: true }, store: 'file', files: 'local', erp: true, googleClientId: 'cid-test.apps.googleusercontent.com', mapsKey: 'test-maps-key' });
});
test('setup requires the SETUP_TOKEN and a strong password', async () => {
  const c = client();
  assert.strictEqual((await c.call('POST', '/api/auth/setup', { token: 'wrong', name: 'Admin', iqama: '2123456789', phone: '966597778853', pass: 'Maydan2026Safe' })).status, 403);
  assert.strictEqual((await c.call('POST', '/api/auth/setup', { token: 'test-setup-token-123456', name: 'Admin', iqama: '2123456789', phone: '966597778853', pass: 'weak' })).status, 400);
  assert.strictEqual((await c.call('POST', '/api/auth/setup', { token: 'test-setup-token-123456', name: 'علي الجدع', iqama: '2123456789', phone: '966597778853', email: 'a@b.co', pass: 'Maydan2026Safe' })).status, 200);
  assert.strictEqual((await c.call('POST', '/api/auth/setup', { token: 'test-setup-token-123456', name: 'X', iqama: '2999999999', phone: '966597778853', pass: 'Maydan2026Safe' })).status, 409);
  const users = JSON.parse(fs.readFileSync(path.join(DIR, 'users.json'), 'utf8')); const u = Object.values(users)[0];
  assert.ok(u.hash && !JSON.stringify(u).includes('Maydan2026Safe'), 'password stored only as scrypt hash');
});
test('CSRF: state-changing request without the custom header is refused', async () => {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); assert.strictEqual(r.status, 403);
  const c = client(); assert.strictEqual((await c.call('POST', '/api/auth/login', { iqama: '2123456789', pass: 'x' }, { Origin: 'https://evil.example' })).status, 403);
});
test('login → OTP → session cookie (HttpOnly, SameSite=Strict); wrong OTP counts down', async () => {
  const c = client();
  const l = await c.call('POST', '/api/auth/login', { iqama: '2123456789', pass: 'Maydan2026Safe' }); assert.strictEqual(l.j.step, 'otp'); assert.strictEqual(l.j.masks.sms, '+9665•• ••• 853');
  assert.strictEqual((await c.call('GET', '/api/state')).status, 401, 'no data before OTP');
  const s = await c.call('POST', '/api/auth/otp/send', { channel: 'sms' });
  assert.strictEqual((await c.call('POST', '/api/auth/otp/send', { channel: 'sms' })).status, 429, 'resend throttled');
  const bad = await c.call('POST', '/api/auth/otp/verify', { code: s.j.devCode === '000000' ? '111111' : '000000' }); assert.match(bad.j.error, /المتبقية: 2/);
  const v = await c.call('POST', '/api/auth/otp/verify', { code: s.j.devCode }); assert.strictEqual(v.status, 200); assert.strictEqual(v.j.user.role, 'admin'); assert.ok(!('hash' in v.j.user));
  const sc = v.r.headers.getSetCookie().join(';'); assert.match(sc, /mdn_sid=.*HttpOnly.*SameSite=Strict/);
  assert.strictEqual((await c.call('GET', '/api/auth/me')).j.user.name, 'علي الجدع');
});
test('forged session cookie is rejected', async () => { const c = client(); c.jar.mdn_sid = 'abc.def'; assert.strictEqual((await c.call('GET', '/api/state')).status, 401); });
test('lockout after 5 wrong passwords, even the right one is refused', async () => {
  const c = client(); for (let i = 0; i < 5; i++) await c.call('POST', '/api/auth/login', { iqama: '2123456789', pass: 'Wrong' + i + 'xxxxxx' });
  const r = await c.call('POST', '/api/auth/login', { iqama: '2123456789', pass: 'Maydan2026Safe' }); assert.strictEqual(r.status, 423);
  const locks = JSON.parse(fs.readFileSync(path.join(DIR, 'locks.json'), 'utf8')); delete locks['2123456789']; fs.writeFileSync(path.join(DIR, 'locks.json'), JSON.stringify(locks));
});
test('account request → admin approval → activation → limited role', async () => {
  // reload file store cache after manual edit above
  const store = require('../index.js').store; store.cache.delete('locks');
  const pub = client(); assert.strictEqual((await pub.call('POST', '/api/requests', { name: 'م. يحي الشريف', iqama: '2987654321', phone: '966501234567', role: 'admin' })).status, 200);
  const admin = client(); await signIn(admin, '2123456789', 'Maydan2026Safe');
  const reqs = (await admin.call('GET', '/api/requests')).j.requests; assert.strictEqual(reqs[0].role, 'viewer', 'cannot request admin');
  const ap = await admin.call('POST', '/api/requests/' + reqs[0].id + '/approve', {}); assert.match(ap.j.code, /^[A-Z2-9]{8}$/);
  const u = client(); assert.strictEqual((await u.call('POST', '/api/auth/login', { iqama: '2987654321', pass: 'x' })).j.step, 'activate');
  assert.strictEqual((await u.call('POST', '/api/auth/activate', { iqama: '2987654321', code: 'WRONG123', pass: 'Yahya2026Pass' })).status, 400);
  assert.strictEqual((await u.call('POST', '/api/auth/activate', { iqama: '2987654321', code: ap.j.code, pass: 'Yahya2026Pass' })).status, 200);
  await signIn(u, '2987654321', 'Yahya2026Pass');
  assert.strictEqual((await u.call('GET', '/api/users')).j.users.length, 1, 'non-admin sees only self');
  assert.strictEqual((await u.call('POST', '/api/users', { name: 'x', iqama: '2111111111', phone: '966500000000' })).status, 403);
  assert.strictEqual((await u.call('PUT', '/api/state', { version: 0, state: { crews: [] } })).status, 403, 'viewer cannot write');
  assert.strictEqual((await u.call('GET', '/api/audit')).status, 403);
  const uid = (await admin.call('GET', '/api/users')).j.users.find((x) => x.iqama === '2987654321').id;
  assert.strictEqual((await admin.call('PATCH', '/api/users/' + uid, { role: 'eng' })).j.user.role, 'eng');
  assert.strictEqual((await u.call('PUT', '/api/state', { version: 0, state: { crews: [{ id: 'X-1' }] } })).status, 200, 'engineer can write');
  await admin.call('PATCH', '/api/users/' + uid, { active: false });
  assert.strictEqual((await u.call('GET', '/api/state')).status, 401, 'deactivated user loses access immediately');
  const me = (await admin.call('GET', '/api/auth/me')).j.user; assert.strictEqual((await admin.call('PATCH', '/api/users/' + me.id, { role: 'viewer' })).status, 400, 'admin cannot demote self');
});
test('state: optimistic concurrency and server strips users/locks/audit', async () => {
  const a = client(); await signIn(a, '2123456789', 'Maydan2026Safe');
  const g = await a.call('GET', '/api/state'); const v = g.j.version;
  const p = await a.call('PUT', '/api/state', { version: v, state: { crews: [{ id: 'X-03' }], users: [{ hash: 'leak' }], audit: [1] } }); assert.strictEqual(p.j.version, v + 1);
  assert.strictEqual((await a.call('PUT', '/api/state', { version: v, state: { crews: [] } })).status, 409, 'stale version refused');
  const s = (await a.call('GET', '/api/state')).j.state; assert.deepStrictEqual(s.users, []); assert.deepStrictEqual(s.audit, []);
});
test('AI endpoint needs a session and reports no provider; Odoo endpoint needs admin', async () => {
  const anon = client(); assert.strictEqual((await anon.call('POST', '/api/ai/chat', { messages: [{ role: 'user', content: 'hi' }] })).status, 401);
  const a = client(); await signIn(a, '2123456789', 'Maydan2026Safe'); assert.strictEqual((await a.call('POST', '/api/ai/chat', { messages: [{ role: 'user', content: 'hi' }] })).status, 503);
  assert.strictEqual((await a.call('POST', '/api/odoo/employees', {})).status, 502);
});
test('page is served with cloud marker, strict CSP and security headers', async () => {
  const r = await fetch(base + '/'); const h = await r.text();
  assert.ok(h.includes('<meta name="maydan-server" content="1">'));
  const csp = r.headers.get('content-security-policy'); assert.match(csp, /connect-src 'self'/); assert.match(csp, /frame-ancestors 'none'/); assert.match(csp, /script-src 'sha256-/);
  assert.strictEqual(r.headers.get('x-frame-options'), 'DENY'); assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual((await fetch(base + '/../package.json')).status, 404); assert.strictEqual((await fetch(base + '/server/index.js')).status, 404);
});
test('logout revokes the session', async () => { const a = client(); await signIn(a, '2123456789', 'Maydan2026Safe'); const sid = a.jar.mdn_sid; await a.call('POST', '/api/auth/logout', {}); const b = client(); b.jar.mdn_sid = sid; assert.strictEqual((await b.call('GET', '/api/state')).status, 401); });
test('attachments: upload checks type and content, download is sandboxed, delete needs the owner', async () => {
  const a = client(); await signIn(a, '2123456789', 'Maydan2026Safe');
  const ck = () => Object.entries(a.jar).map(([k, v]) => k + '=' + v).join('; ');
  const up = (type, buf, id) => fetch(base + '/api/files', { method: 'POST', headers: { 'Content-Type': type, 'X-Requested-With': 'maydan', 'X-File-Id': id, 'X-File-Name': encodeURIComponent('إقامة.pdf'), Cookie: ck() }, body: buf });
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF');
  assert.strictEqual((await up('text/html', Buffer.from('<script>x</script>'), 'f-aaaa1111')).status, 415);
  assert.strictEqual((await up('application/pdf', Buffer.from('<script>x</script>'), 'f-aaaa1111')).status, 415);
  assert.strictEqual((await up('application/pdf', pdf, '../../etc')).status, 400);
  assert.strictEqual((await up('application/pdf', pdf, 'f-aaaa1111')).status, 200);
  assert.strictEqual((await up('application/pdf', pdf, 'f-aaaa1111')).status, 409);
  const anon = await fetch(base + '/api/files/f-aaaa1111'); assert.strictEqual(anon.status, 401);
  const g = await fetch(base + '/api/files/f-aaaa1111', { headers: { Cookie: ck() } }); assert.strictEqual(g.status, 200);
  assert.match(g.headers.get('content-security-policy'), /sandbox/); assert.match(g.headers.get('content-disposition'), /^attachment/);
  assert.ok(Buffer.from(await g.arrayBuffer()).equals(pdf));
  const d = await a.call('DELETE', '/api/files/f-aaaa1111'); assert.strictEqual(d.status, 200);
  assert.strictEqual((await fetch(base + '/api/files/f-aaaa1111', { headers: { Cookie: ck() } })).status, 404);
});

test('Sign in with Google: verified email of an active user → OTP step; wrong audience or unknown email refused; page CSP allows Google', async () => {
  const c = client(); const CID = 'cid-test.apps.googleusercontent.com';
  const h = await c.call('GET', '/api/health'); assert.strictEqual(h.j.googleClientId, CID); assert.ok(h.j.mapsKey);
  assert.strictEqual((await c.call('POST', '/api/auth/google', { credential: 'a@b.co|other-client' })).status, 401);
  assert.strictEqual((await c.call('POST', '/api/auth/google', { credential: 'stranger@x.com|' + CID })).status, 403);
  const g = await c.call('POST', '/api/auth/google', { credential: 'A@B.co|' + CID }); assert.strictEqual(g.status, 200); assert.strictEqual(g.j.step, 'otp');
  const s = await c.call('POST', '/api/auth/otp/send', { channel: 'sms' }); const v = await c.call('POST', '/api/auth/otp/verify', { code: s.j.devCode }); assert.strictEqual(v.status, 200); assert.strictEqual(v.j.user.iqama, '2123456789');
  const p = await c.call('GET', '/'); const csp = p.r.headers.get('content-security-policy');
  assert.match(csp, /script-src [^;]*https:\/\/accounts\.google\.com\/gsi\/client/); assert.match(csp, /frame-src https:\/\/accounts\.google\.com\/gsi\//); assert.match(csp, /connect-src 'self' [^;]*https:\/\/tile\.googleapis\.com/); assert.match(csp, /frame-ancestors 'none'/);
});

test('company system (ERP) webhook receives each data update, HMAC-signed, without users', async () => {
  const a = client(); await signIn(a, '2123456789', 'Maydan2026Safe');
  const cur = await a.call('GET', '/api/state'); ERP.length = 0;
  const put = await a.call('PUT', '/api/state', { version: cur.j.version, state: { crews: [{ id: 'X-01' }], users: [{ hash: 'secret' }] } }); assert.strictEqual(put.status, 200);
  for (let i = 0; i < 40 && !ERP.length; i++) await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(ERP.length, 1); const { h, b } = ERP[0];
  assert.strictEqual(h['x-maydan-signature'], 'sha256=' + crypto.createHmac('sha256', 'erp-secret').update(b).digest('hex'));
  const p = JSON.parse(b); assert.strictEqual(p.event, 'state.updated'); assert.strictEqual(p.state.crews[0].id, 'X-01'); assert.deepStrictEqual(p.state.users, []);
});
test('role tree: supervisors and engineers can only change their own crews; ops only sends alerts', () => {
  const { guardState } = require('../index.js');
  const crew = (id, sup, eng) => ({ id, branch: 'مكتب الشمال', projectId: 'p1', sup: { name: sup.name, iqama: sup.iqama, phone: sup.phone }, eng, workers: [{ name: 'w' }] });
  const S = { crews: [crew('X-1', { name: 'أحمد', iqama: '2111111111' }, { name: 'م. سامي', phone: '966500000001' }), crew('X-2', { name: 'سعيد', iqama: '2222222222' }, { name: 'م. ناصر' })], settings: { a: 1 }, inbox: [] };
  const clone = () => JSON.parse(JSON.stringify(S));
  const sup = { role: 'sup', name: 'أحمد', iqama: '2111111111', phone: '' }, eng = { role: 'eng', name: 'سامي', iqama: '9', phone: '0500000001' }, ops = { role: 'ops', name: 'o', iqama: '8' };
  let n = clone(); n.crews[0].workers.push({ name: 'new' }); guardState(sup, S, n);
  n = clone(); n.crews[1].workers.push({ name: 'x' }); assert.throws(() => guardState(sup, S, n), /خارج نطاق/);
  n = clone(); n.settings.a = 2; assert.throws(() => guardState(sup, S, n), /الإعدادات/);
  n = clone(); n.crews[0].workers = []; guardState(eng, S, n);
  n = clone(); n.crews.push(crew('X-9', { name: 'z' }, {})); assert.throws(() => guardState(eng, S, n), /مدير المشروع/);
  n = clone(); n.inbox.push({ id: 1 }); guardState(ops, S, n);
  n = clone(); n.crews[0].workers = []; assert.throws(() => guardState(ops, S, n), /التنبيهات فقط/);
  const pm = { role: 'pm', scope: { offices: ['مكتب الشرق'] } }; n = clone(); n.crews[0].workers = []; assert.throws(() => guardState(pm, S, n), /خارج نطاق/);
  guardState({ role: 'admin' }, S, Object.assign(clone(), { settings: {} }));
});

test('need-to-know: scoped users receive only their part; saves keep hidden data; transfers lock edits; HR edits cards only', () => {
  const { guardState, viewState, mergeState } = require('../index.js');
  const crew = (id, sup, eng, b) => ({ id, branch: b || 'مكتب الشمال', projectId: 'p1', sup, eng, workers: [{ id: id + 'w', name: 'عامل ' + id, iqama: id === 'X-1' ? '2333333333' : '2444444444' }], eq: [] });
  const S = { crews: [crew('X-1', { name: 'أحمد', iqama: '2111111111' }, { name: 'م. سامي', iqama: '2555555555' }), crew('X-2', { name: 'سعيد', iqama: '2222222222' }, { name: 'م. ناصر', iqama: '2666666666' })],
    jobs: [{ id: 'j1', crewId: 'X-1', kind: 'حفر' }, { id: 'j2', crewId: 'X-2', kind: 'حفر', editors: ['u-eng'] }, { id: 'j3', crewId: 'X-2', kind: 'كابل', elecEng: { name: 'م. خالد', iqama: '2777777777' } }],
    employees: [{ id: 'e1', name: 'عامل X-1', iqama: '2333333333' }, { id: 'e2', name: 'عامل X-2', iqama: '2444444444' }], docs: [{ id: 'd1', crewId: 'X-2' }, { id: 'd2', taskId: 'j1' }], roster: [{ iqama: '2999999999' }], settings: {} };
  const clone = () => JSON.parse(JSON.stringify(S));
  const eng = { id: 'u-eng', role: 'eng', name: 'م. سامي', iqama: '2555555555', scope: { spec: 'civil' } }, elec = { id: 'u-el', role: 'eng', name: 'م. خالد', iqama: '2777777777', scope: { spec: 'elec' } }, hr = { id: 'u-hr', role: 'hr', name: 'HR' };
  const v = viewState(clone(), eng);
  assert.deepStrictEqual(v.crews.map((c) => c.id), ['X-1']); assert.deepStrictEqual(v.jobs.map((j) => j.id), ['j1', 'j2']);
  assert.deepStrictEqual(v.employees.map((e) => e.id), ['e1']); assert.deepStrictEqual(v.docs.map((d) => d.id), ['d2']); assert.strictEqual(v.roster, undefined);
  assert.deepStrictEqual(viewState(clone(), elec).jobs.map((j) => j.id), ['j3']);
  // saving a partial state keeps hidden crews, jobs, people and the HR roster
  const back = JSON.parse(JSON.stringify(v)); back.crews[0].workers.push({ name: 'new' });
  const m = mergeState(clone(), back, eng); assert.deepStrictEqual(m.crews.map((c) => c.id).sort(), ['X-1', 'X-2']); assert.strictEqual(m.employees.length, 2); assert.strictEqual(m.roster.length, 1); guardState(eng, S, m);
  // j2 moved away: view only; editing refused, an access request is allowed; forging a grant is refused
  let n = clone(); n.jobs[1].kind = 'x'; assert.throws(() => guardState(eng, S, n), /للعرض فقط/);
  n = clone(); n.jobs[1].accessReq = [{ uid: 'u-eng', name: 'م. سامي', note: 'صور', st: 'pending' }]; guardState(eng, S, n);
  n = clone(); n.jobs[1].grants = { 'u-eng': '2999-01-01T00:00:00Z' }; assert.throws(() => guardState(eng, S, n), /مدير المشروع/);
  const G = clone(); G.jobs[1].grants = { 'u-eng': '2999-01-01T00:00:00Z' }; n = JSON.parse(JSON.stringify(G)); n.jobs[1].kind = 'y'; guardState(eng, G, n);
  n = clone(); n.jobs[2].kind = 'تمديد'; guardState(elec, S, n);
  // cards: an engineer edits only people of his crews; HR edits every card but nothing else
  n = clone(); n.employees[1].job = 'x'; assert.throws(() => guardState(eng, S, n), /خارج نطاق/);
  n = clone(); n.employees[0].job = 'فني'; guardState(eng, S, n);
  n = clone(); n.employees[1].docs = { a: 1 }; guardState(hr, S, n);
  n = clone(); n.crews[0].workers = []; assert.throws(() => guardState(hr, S, n), /الموارد البشرية/);
  assert.strictEqual(viewState(clone(), hr).crews.length, 2);
});

test('supply control: a supervisor requests and receives; only engineer / project manager approve and register suppliers', () => {
  const { guardState } = require('../index.js');
  const S = { crews: [{ id: 'X-1', branch: 'b', sup: { name: 'أحمد', iqama: '2111111111' }, eng: { name: 'م. سامي', iqama: '2555555555' }, workers: [], eq: [] }], jobs: [{ id: 'j1', crewId: 'X-1', supply: [{ id: 's1', kind: 'backfill', qty: 50, st: 'req' }] }], employees: [], suppliers: [] };
  const sup = { id: 'u-s', role: 'sup', name: 'أحمد', iqama: '2111111111' }, eng = { id: 'u-e', role: 'eng', name: 'م. سامي', iqama: '2555555555' };
  const c = () => JSON.parse(JSON.stringify(S));
  let n = c(); n.jobs[0].supply.push({ id: 's2', kind: 'sand', qty: 5, st: 'req' }); guardState(sup, S, n);
  n = c(); n.jobs[0].supply[0].st = 'ord'; n.jobs[0].supply[0].supplier = { name: 'x' }; assert.throws(() => guardState(sup, S, n), /اعتماد التوريد/);
  n = c(); n.suppliers.push({ id: 'p', no: '1', name: 'x' }); assert.throws(() => guardState(sup, S, n), /الموردين/);
  n = c(); n.jobs[0].supply[0].st = 'ord'; n.jobs[0].supply[0].supplier = { name: 'x' }; n.suppliers.push({ id: 'p', no: '1', name: 'x' }); guardState(eng, S, n);
  const O = c(); O.jobs[0].supply[0].st = 'ord'; n = JSON.parse(JSON.stringify(O)); n.jobs[0].supply[0].st = 'del'; n.jobs[0].supply[0].dq = 48; guardState(sup, O, n);
});
