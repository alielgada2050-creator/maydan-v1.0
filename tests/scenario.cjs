const { makeEnv } = require('./harness.cjs');
const assert = require('assert');
let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  ✔ ' + m); };

function login(env, iqama) {
  env.__mails.length = 0;
  // reset resend window for test speed
  delete env.__cache['otpwin:' + iqama];
  const r = env.authRequestOtp(iqama, 'email');
  assert.ok(r.ok, JSON.stringify(r));
  const m = env.__mails.find(x => /رمز الدخول/.test(x.subject));
  const code = m.htmlBody.match(/>(\d{6})</)[1];
  const v = env.authVerifyOtp(iqama, code);
  assert.ok(v.ok, JSON.stringify(v));
  return v.token;
}

console.log('— Demo setup');
const env = makeEnv(); env.MAYDAN.MODE = 'demo';
env.__props.ADMIN_IQAMA = '2999999999';
console.log('  ' + env.setup().split('\n')[0]);
ok(env.__sheets.Users && env.__sheets.Crews, 'sheets created');
ok(env.readAll_('Crews').length === 4 && env.readAll_('Equipment').length === 13, 'demo data seeded (4 crews, 13 equipment)');
ok(env.readAll_('People').some(p => p.phone === '') , 'some workers have no phone');
const again = env.setup(); ok(env.readAll_('Crews').length === 4, 'setup is idempotent (no reseed)');
env.__setActive('');
assert.throws(() => env.setup()); ok(true, 'setup refused when called from the web (non-owner)');
env.__setActive('owner@example.com');

console.log('— Auth');
let r = env.authRequestOtp('123', 'email'); ok(!r.ok, 'invalid iqama rejected');
r = env.authRequestOtp('2555555555', 'email'); ok(r.ok && env.__mails.length === 0, 'unknown iqama: generic reply, no email sent (no enumeration)');
const tPm = login(env, '2100000001'); ok(/^[a-f0-9]{64}$/.test(tPm), 'PM logs in with iqama + OTP');
// wrong code + lock
delete env.__cache['otpwin:2100000003'];
env.authRequestOtp('2100000003', 'email');
for (let i = 0; i < 5; i++) { delete env.__cache['otp:2100000003']; env.authVerifyOtp('2100000003', '000000'); }
r = env.authRequestOtp('2100000003', 'email'); ok(!r.ok && /مقفل/.test(r.error), 'locked after 5 wrong codes');
delete env.__cache['lock:2100000003'];
const tSup = login(env, '2100000003'); ok(!!tSup, 'supervisor logs in after lock expires');
r = env.authGoogle(); ok(r.ok, 'Google login works for registered Workspace email');
const tAdmin = r.token;
ok(!env.api('bad', 'bootstrap').ok, 'invalid token rejected');
ok(env.api(tPm, 'nope').error === 'عملية غير معروفة', 'unknown action rejected');

console.log('— Bootstrap + permissions');
let b = env.api(tSup, 'bootstrap'); ok(b.ok && b.data.crews.length === 4, 'bootstrap returns crews');
ok(b.data.people.filter(p => p.iqama).every(p => p.iqama.startsWith('••')), 'iqama masked for supervisor');
const x03 = b.data.crews.find(c => c.id === 'CR-X03'), x05 = b.data.crews.find(c => c.id === 'CR-X05');
ok(x03.readiness.state === 'warn', 'X-03 works with warnings (JCB overdue oil, bobcat in shop)');
ok(x05.readiness.state === 'stopped', 'X-05 stopped: no working equipment with a driver');
ok(!env.api(tSup, 'users.list').ok, 'supervisor cannot list users');
ok(!env.api(tSup, 'equipment.save', { kind: 'x', code: 'y' }).ok, 'supervisor cannot edit equipment');
ok(!env.api(tSup, 'person.save', { name: 'X', role: 'worker', crewId: 'CR-X05' }).ok, 'supervisor cannot add to another crew');

console.log('— People data');
r = env.api(tSup, 'person.save', { name: 'عامل جديد', role: 'worker', crewId: 'CR-X03', phone: '0551234567' });
ok(r.ok && r.data.phone === '966551234567', 'supervisor adds worker; phone normalized 05→9665');
r = env.api(tSup, 'person.save', Object.assign({}, b.data.people.find(p => p.id === 'P-S1'), { phone: '0509998887' }));
ok(r.ok && env.findById_('People', 'P-S1').iqama === '2100000003', 'masked iqama preserved on edit');
ok(!env.api(tPm, 'person.save', { name: 'Y', role: 'worker', phone: '12' }).ok, 'bad phone rejected');
ok(!env.api(tPm, 'person.save', { name: '=HYPERLINK("x")', role: 'worker' }).ok === false, 'formula-like name accepted as text');
const inj = env.readAll_('People').find(p => p.name.startsWith('=HYPERLINK'));
ok(inj && env.__sheets.People.rows.some(row => row[1] === '=HYPERLINK("x")'), 'formula-like value stored as literal text');

console.log('— Moves');
r = env.api(tPm, 'move.equipment', { equipId: 'TR-41', toCrewId: 'CR-X05', withDriver: true });
ok(r.ok && env.findById_('Equipment', 'TR-41').crewId === 'CR-X05' && env.findById_('People', 'P-D6').crewId === 'CR-X05', 'Dyna moved with its driver');
r = env.api(tPm, 'move.equipment', { equipId: 'EQ-310', toCrewId: 'CR-X05', withDriver: false });
ok(r.ok && env.findById_('Equipment', 'EQ-310').driverId === '' && env.findById_('People', 'P-D5').crewId === 'CR-X03', 'broom moved without driver; driver stays');
b = env.api(tPm, 'bootstrap');
ok(b.data.crews.find(c => c.id === 'CR-X05').readiness.state !== 'stopped', 'X-05 becomes operational after receiving Dyna + driver');
r = env.api(tPm, 'move.person', { personId: 'P-W1', toCrewId: 'CR-E07' });
ok(r.ok && env.findById_('People', 'P-W1').crewId === 'CR-E07', 'worker moved between crews');
ok(env.readAll_('Notifications').length > 0, 'move notifications created');

console.log('— Proximity');
env.__mails.length = 0;
r = env.api(tAdmin, 'request.create', { crewId: 'CR-E07', neededType: 'excav', title: 'تجهيز حفرية GCB' });
ok(r.ok, 'GCB crew requests excavation');
const near = r.data.nearby[0];
ok(near.crewId === 'CR-X03' && near.km >= 0.9 && near.km <= 1.2 && near.inRadius, 'nearest = X-03 at ~1 km (' + near.km + ' km)');
const notifTitles = env.readAll_('Notifications').filter(n => n.refId === r.data.request.id);
const recips = notifTitles.map(n => env.findById_('Users', n.toUserId).role).sort();
ok(recips.includes('admin') && recips.includes('pm') && recips.includes('eng'), 'engineer, PM and platform admin notified (' + recips.join(',') + ')');
ok(env.__mails.length >= 3, 'notification emails sent');
r = env.api(tAdmin, 'request.assign', { id: r.data.request.id, crewId: 'CR-X03' });
ok(r.ok && env.readAll_('Jobs').some(j => j.title === 'تجهيز حفرية GCB'), 'assignment creates an ordered job');
ok(!env.api(tSup, 'location.update', { crewId: 'CR-E07', lat: 24.8, lng: 46.6 }).ok, 'supervisor cannot move another crew location');
ok(env.api(tSup, 'location.update', { crewId: 'CR-X03', lat: 24.85, lng: 46.66 }).ok, 'supervisor updates own crew location');
ok(!env.api(tSup, 'location.update', { crewId: 'CR-X03', lat: 51.5, lng: 0.1 }).ok, 'location outside KSA rejected');

console.log('— Jobs, users, AI, audit, backup');
const ids = env.readAll_('Jobs').map(j => j.id).reverse();
ok(env.api(tPm, 'jobs.reorder', { ids }).ok && env.findById_('Jobs', ids[0]).order === '1', 'jobs reordered');
ok(env.api(tAdmin, 'user.save', { name: 'مراقب جديد', role: 'supervisor', iqama: '2200000000', email: 'new@example.com' }).ok, 'admin adds user');
ok(!env.api(tAdmin, 'user.save', { name: 'dup', role: 'viewer', iqama: '2200000000' }).ok, 'duplicate iqama rejected');
const meAdmin = env.readAll_('Users').find(u => u.role === 'admin');
ok(!env.api(tAdmin, 'user.save', Object.assign({}, meAdmin, { role: 'viewer' })).ok, 'admin cannot demote self');
r = env.api(tPm, 'ai.ask', { question: 'ما الفرق المتوقفة؟' }); ok(!r.ok && /مفتاح/.test(r.error), 'AI without keys: clear message');
env.__props.GROQ_KEY = 'k';
r = env.api(tPm, 'ai.ask', { question: 'ما الفرق المتوقفة؟' }); ok(r.ok && r.data.provider === 'Groq', 'AI answers via Groq proxy');
const sent = JSON.parse(env.__fetches.at(-1).o.payload).messages[1].content;
ok(!/9665\d{8}/.test(sent) && !/21000000/.test(sent), 'AI context contains no phones or iqamas');
ok(env.api(tAdmin, 'audit.list').data.some(a => a.action === 'auth.login'), 'audit log records logins');
ok(env.api(tAdmin, 'backup.now').data.ok, 'backup to Drive works');
ok(env.api(tAdmin, 'settings.get').data.ai.find(p => p.id === 'groq').configured, 'settings report integrations without exposing keys');
ok(!JSON.stringify(env.api(tAdmin, 'settings.get')).includes('"k"'), 'keys never returned');
ok(env.authLogout(tPm).ok && !env.api(tPm, 'bootstrap').ok, 'logout invalidates session');

console.log('— Clean mode');
const env2 = makeEnv();
env2.MAYDAN.MODE = 'clean';
env2.setup();
ok(env2.readAll_('Crews').length === 0 && env2.readAll_('People').length === 0 && env2.readAll_('Users').length === 1 && env2.readAll_('Branches').length === 1, 'clean: empty data, only the admin + one branch');
const t2 = env2.authGoogle().token;
let c = env2.api(t2, 'person.save', { name: 'مراقب', role: 'supervisor', phone: '0500000000' }); ok(c.ok, 'clean: add supervisor');
let cr = env2.api(t2, 'crew.save', { name: 'فرقة 1', type: 'excav', supervisorId: c.data.id }); ok(cr.ok, 'clean: create crew');
ok(env2.api(t2, 'bootstrap').data.crews[0].readiness.state === 'stopped', 'clean: new crew stopped until equipment added');
const d = env2.api(t2, 'person.save', { name: 'سائق', role: 'driver', crewId: cr.data.id });
env2.api(t2, 'equipment.save', { kind: 'حفار JCB', code: 'J1', crewId: cr.data.id, driverId: d.data.id, status: 'ok', oilRemainKm: 3000 });
ok(env2.api(t2, 'bootstrap').data.crews[0].readiness.state === 'ready', 'clean: crew ready after JCB with driver');

console.log('\n' + pass + ' checks passed');
