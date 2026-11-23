// ================================================================
// Module: field transactions — workflow engine (منظومة المعاملات الميدانية)
// Each transaction is one record (a job with flow=true) that moves through stages.
// Every stage change notifies the role that owns the next step, by name and phone,
// with the permit number and its expiry on every message.
// Loaded before the DB is created, so only declarations live at top level.
// ================================================================

const FL_STAGES = {
  plan: ['مجدولة', 'التخطيط والتنسيق الجغرافي'],
  gate: ['بوابة الرخصة', 'إرفاق صورة الرخصة أو التعهد'],
  safety: ['تأمين السلامة', 'صبات وإنارة LED وفحص HSE'],
  dig: ['الحفر والتنفيذ المدني', 'حفر مفتوح / مسار'],
  elec: ['الأعمال الكهربائية', 'تمديد الكابل / التركيب'],
  asphalt: ['الردم والأسفلت', 'السفلتة وإعادة الوضع'],
  lab: ['مختبر URS', 'فحص الدمك والأسفلت'],
  pdc: ['الاستشاري PDC', 'مهلة 60 يوماً'],
  ripc: ['مركز المشاريع RIPC', 'القبول النهائي'],
  closed: ['مغلقة نهائياً', '']
};
const FL_FULL = ['plan', 'gate', 'safety', 'dig', 'elec', 'asphalt', 'lab', 'pdc', 'ripc', 'closed'];
const FL_KINDS = {
  'حفر مفتوح لتركيب ميني بيلر': FL_FULL,
  'حفر مفتوح': FL_FULL,
  'تمديد كابلات': FL_FULL,
  'تركيب عدادات': ['plan', 'gate', 'elec', 'closed'],
  'أسفلت وإعادة سفلتة': ['plan', 'gate', 'safety', 'asphalt', 'lab', 'pdc', 'ripc', 'closed']
};
const FL_OPEN = (j) => (FL_KINDS[j.kind] || FL_FULL).includes('safety');
const FL_ROLES = {
  permits_eng: 'مهندس قسم الرخص', permits_sup: 'مشرف التصاريح والإغلاقات', civil: 'مهندس التنفيذ المدني', elec: 'مهندس الكهرباء',
  asphalt: 'مهندس الأسفلت', safety: 'السلامة والإنارة', hse: 'السلامة والصحة المهنية (HSE)', lab: 'مختبر URS',
  sup_civil: 'مراقب مدني', sup_elec: 'مراقب كهرباء'
};
const FL_REPORT_KINDS = { lab: ['معاد من المختبر URS', 7], pdc: ['معاد من الاستشاري PDC', 60], ripc: ['معاد من مركز المشاريع RIPC', 60], b940: ['بلاغ البلدية 940', 3], viol: ['مخالفة مركز المشاريع', 7] };
const FL_TRIP_SAR = 350; // assumed cost of one field trip (vehicle + crew time) for the savings estimate
let FL_TICKED = '';

function flRosterDefault() {
  const r = (role, name, offices, phone) => ({ id: uid('ro'), role, name, offices: offices || [], phone: phone || '' });
  return [
    r('permits_eng', 'م. عبدالله السيد'), r('permits_sup', 'علي الجدع', [], '966597778853'),
    r('civil', 'م. يحيى', ['مكتب خريص', 'مكتب الشمال']), r('civil', 'م. طارق', ['مكتب الشمال', 'مكتب الشرق']),
    r('elec', 'م. أحمد عبدالعال', ['مكتب خريص']), r('elec', 'م. مصطفى بسيوني', ['مكتب الشمال', 'مكتب الشرق']),
    r('asphalt', 'مهندس الأسفلت — سما الشام'), r('safety', 'مسؤول السلامة والإنارة'), r('hse', 'مفتش السلامة والصحة المهنية'), r('lab', 'م. محمد الجعفري'),
    r('sup_civil', 'مراقب مدني — خريص', ['مكتب خريص']), r('sup_civil', 'مراقب مدني — الشمال', ['مكتب الشمال']), r('sup_civil', 'مراقب مدني — الشرق', ['مكتب الشرق']),
    r('sup_elec', 'مراقب كهرباء — خريص', ['مكتب خريص']), r('sup_elec', 'مراقب كهرباء — الشمال والشرق', ['مكتب الشمال', 'مكتب الشرق'])
  ];
}

// runs inside migrate3 on every load (idempotent)
function migrateFlow(d) {
  d.lists.offices = d.lists.offices || ['مكتب خريص', 'مكتب الشمال', 'مكتب الشرق'];
  d.lists.flKinds = d.lists.flKinds || Object.keys(FL_KINDS);
  if (!d.lists.empDocs.includes('شهادة TUV')) d.lists.empDocs.splice(2, 0, 'شهادة TUV');
  d.roster = d.roster || flRosterDefault();
  d.inbox = d.inbox || []; d.reports = d.reports || [];
  d.settings.flow = d.settings.flow || { r1: 2, r2: 5, clusterKm: 2 };
  d.jobs.forEach((j) => { if (j.flow) { j.alerts = j.alerts || {}; j.log = j.log || []; j.gate = j.gate || null; j.safety = j.safety || {}; } });
  return d;
}

// ---------- helpers ----------
const flJobs = () => DB.jobs.filter((j) => j.flow);
const flPath = (j) => FL_KINDS[j.kind] || FL_FULL;
const flIdx = (j) => flPath(j).indexOf(j.stage);
const flNext = (j) => flPath(j)[flIdx(j) + 1] || '';
const flActive = (j) => j.flow && j.stage !== 'closed';
const flHasXY = (j) => isFinite(j.lat) && isFinite(j.lng) && j.lat && j.lng;
const flPermitDays = (j) => (j.permitExp ? daysTo(j.permitExp) : null);
const flFolderName = (j) => [j.baseNo, j.txNo, j.permit].filter(Boolean).join(' - ') || j.id;
const flNav = (j) => (flHasXY(j) ? 'https://www.google.com/maps/dir/?api=1&destination=' + j.lat + ',' + j.lng : '');
const flPin = (j) => (flHasXY(j) ? 'https://www.google.com/maps?q=' + j.lat + ',' + j.lng : '');
function flPermitLine(j) {
  if (!j.permit) return 'الرخصة: غير مسجلة';
  const d = flPermitDays(j);
  return 'الرخصة ' + j.permit + (j.permitType ? ' (' + j.permitType + ')' : '') + (j.permitExp ? ' · تنتهي ' + j.permitExp + (d < 0 ? ' — منتهية منذ ' + -d + ' يوم' : d === 0 ? ' — تنتهي اليوم' : ' — متبقي ' + d + ' يوم') : '');
}
function flPermitChip(j) {
  if (!j.permit) return html`<span class="pill bad">بلا رخصة</span>`;
  const d = flPermitDays(j); const c = d === null ? 'mutp' : d < 0 ? 'bad' : d <= 3 ? 'warn' : 'ok';
  return html`<span class="pill ${c}" title="${flPermitLine(j)}">رخصة ${j.permit}${d === null ? '' : d < 0 ? ' · منتهية' : ' · ' + d + ' يوم'}</span>`;
}
function flGateOk(j) { const g = j.gate; return !!g && ((g.mode === 'permit' || g.mode === 'undertaking') ? !!g.fileId : g.mode === 'override'); }
function flGateLabel(j) {
  const g = j.gate; if (!g) return ['بانتظار إرفاق الرخصة', 'bad'];
  if (g.mode === 'permit') return ['صورة الرخصة مرفقة', 'ok'];
  if (g.mode === 'undertaking') return ['تعهد مرفق', 'ok'];
  return [g.fileId ? 'تجاوز — أُرفقت الرخصة لاحقاً' : 'تجاوز المهندس — الإرفاق قبل ' + g.due, g.fileId ? 'ok' : 'warn'];
}
function flWho(role, offices) {
  const off = (offices || []).filter(Boolean);
  return DB.roster.filter((p) => p.role === role && (!p.offices.length || !off.length || p.offices.some((o) => off.includes(o))));
}
function flJobText(j) {
  return j.kind + ' — ' + (j.district || '') + (j.station ? ' · محطة ' + j.station : '') + (j.plan ? ' · مخطط ' + j.plan : '') + (j.plot ? ' · قطعة ' + j.plot : '') +
    '\nالأساس ' + (j.baseNo || '—') + ' · المعاملة ' + (j.txNo || '—') + '\n' + flPermitLine(j) + (j.lengthM ? '\nطول الحفر ' + j.lengthM + ' م' : '') + '\nالتاريخ ' + j.date;
}

// ---------- notification routing (inbox) ----------
function flNotify(kind, roles, title, body, jobs, extra) {
  const ids = [].concat(jobs || []).filter(Boolean).map((j) => j.id);
  const offices = [...new Set([].concat(jobs || []).filter(Boolean).map((j) => j.office))];
  const to = []; roles.forEach((r) => flWho(r, offices).forEach((p) => { if (!to.some((x) => x.id === p.id)) to.push({ id: p.id, role: r, name: p.name, phone: p.phone }); }));
  const it = Object.assign({ id: uid('in'), tm: nowIso(), kind, roles, to, title, body, jobIds: ids, st: 'new', fwd: [], by: CUR ? CUR.name : 'النظام' }, extra || {});
  DB.inbox.unshift(it); if (DB.inbox.length > 600) DB.inbox.length = 600;
  return it;
}
function flWaText(it) { return '«ميدان» — ' + it.title + '\n' + it.body + (it.nav ? '\nالملاحة: ' + it.nav : ''); }

// ---------- stage engine ----------
function flLog(j, stage, note) { j.log.unshift({ tm: nowIso(), stage, by: CUR ? CUR.name : 'النظام', note: note || '' }); }
function flSetStage(j, to, note) {
  j.stage = to; j.st = to === 'closed' ? 'done' : to === 'plan' || to === 'gate' ? 'new' : 'prog'; if (to === 'closed') j.doneAt = nowIso();
  flLog(j, to, note);
  const t = flJobText(j);
  if (to === 'safety') flSafetyRequest(j);
  if (to === 'elec' && flPath(j).includes('dig')) flNotify('elec', ['elec'], 'انتهى الحفر — جاهز لتمديد الكابل / التركيب', t + '\nبعد الإطلاع حوّل التنبيه لمراقبي الكهرباء.', [j], { fwdRole: 'sup_elec', nav: flNav(j) });
  if (to === 'elec' && !flPath(j).includes('dig')) flNotify('elec', ['elec'], 'معاملة جاهزة للتنفيذ الكهربائي', t, [j], { fwdRole: 'sup_elec', nav: flNav(j) });
  if (to === 'asphalt') flNotify('asphalt', ['asphalt', 'civil'], 'جاهز للردم والسفلتة — تنسيق بالتوالي', t + '\nتم الانتهاء من ' + (flPath(j).includes('elec') ? 'تمديد الكابل والأعمال الكهربائية' : 'الحفر') + '. نسّق السفلتة قبل انتهاء الرخصة لتفادي الغرامات.', [j], { nav: flNav(j) });
  if (to === 'lab') flNotify('lab', ['lab'], 'طلب فحص مختبر URS', t, [j], { nav: flNav(j) });
  if (to === 'pdc') { j.pdc = { start: today(), due: addDays(60) }; flNotify('permit', ['permits_sup', 'permits_eng'], 'رُفعت للاستشاري PDC — بدأت مهلة 60 يوماً', t + '\nآخر موعد: ' + j.pdc.due, [j]); }
  if (to === 'ripc') flNotify('permit', ['permits_sup'], 'قُبلت من الاستشاري — رُفعت لمركز المشاريع RIPC', t, [j]);
  if (to === 'closed') flNotify('permit', ['permits_sup', 'permits_eng'], 'إغلاق نهائي للمعاملة', t, [j]);
}
function flSafetyRequest(j) {
  if (j.safety.reqAt) return;
  j.safety.reqAt = nowIso();
  const items = (j.safety.barrier || 'صبات خرسانية') + ' · إنارة LED' + (j.lengthM ? ' لمسار ' + j.lengthM + ' م' : '');
  flNotify('safety', ['safety'], 'توريد وتأمين موقع حفر مفتوح', flJobText(j) + '\nالمطلوب: ' + items + ' · لوحات تحذيرية.\nيُؤمَّن الموقع قبل بدء الحفر.', [j], { nav: flNav(j) });
  const crew = crewById(j.crewId); const q = crew ? flCrewQual(crew) : [];
  flNotify('hse', ['hse'], 'فحص السلامة والصحة المهنية قبل الحفر', flJobText(j) + '\nالتحقق من تأهيل المراقب والعمالة' + (crew ? ' (فرقة ' + crew.id + ')' : '') + (q.length ? ':\n- ' + q.slice(0, 8).join('\n- ') : ': لا ملاحظات على البطاقات.'), [j], { nav: flNav(j) });
}
// qualification of a crew: supervisor + workers + drivers need valid cards
function flCrewQual(c) {
  const out = []; const people = [c.sup].concat(c.workers, c.eq.map((u) => u.driver).filter(Boolean), c.workers.filter((w) => w.dyna && w.dyna.driver).map((w) => w.dyna.driver));
  people.forEach((p) => {
    const e = p && (empById(p.empId) || empByIqama(p.iqama)); if (!p || !p.name) return;
    if (!e) { out.push(p.name + ': غير مربوط بسجل الموظفين'); return; }
    ['كارت الأمن الصناعي', 'صورة الإقامة', 'شهادة TUV', 'رخصة القيادة'].forEach((t) => { const s = empDocState(e, t); if (s.lvl === 'bad' || s.lvl === 'miss') out.push(e.name + ': ' + t + (s.lvl === 'bad' ? ' منتهية' : ' ناقصة')); });
  });
  return out;
}

// coordination: same district / station / plan / plot, or within r km
function flNeighbors(j, r) {
  return flJobs().filter((o) => o.id !== j.id && flActive(o) && Math.abs(daysTo(o.date) - daysTo(j.date)) <= 7).map((o) => {
    const dist = flHasXY(j) && flHasXY(o) ? km(j, o) : null; const why = [];
    if (j.district && o.district === j.district) why.push('نفس الحي');
    if (j.station && o.station === j.station) why.push('نفس المحطة');
    if (j.plan && o.plan === j.plan) why.push('نفس المخطط');
    if (j.plot && o.plot === j.plot && o.plan === j.plan) why.push('نفس القطعة');
    if (dist !== null && dist <= r) why.push(dist <= cfg().flow.r1 ? 'ضمن ' + cfg().flow.r1 + ' كم' : 'ضمن ' + r + ' كم');
    return { o, dist, why };
  }).filter((x) => x.why.length).sort((a, b) => (a.dist == null ? 99 : a.dist) - (b.dist == null ? 99 : b.dist));
}
function flCoordinate(j, reason) {
  const nb = flNeighbors(j, cfg().flow.r2); const when = j.date === addDays(1) ? 'غداً' : j.date === today() ? 'اليوم' : 'بتاريخ ' + j.date;
  const head = 'في هذا الموقع سيتم ' + when + ' عمل ' + j.kind + (j.lengthM ? ' بطول ' + j.lengthM + ' م' : '') + '.';
  const list = nb.map((x) => '• ' + x.o.kind + ' — ' + x.o.district + ' (' + (x.o.baseNo || x.o.id) + ')' + (x.dist != null ? ' على بعد ' + x.dist.toFixed(1) + ' كم' : '') + ' · ' + x.why.join('، ') + ' · ' + x.o.date).join('\n');
  flNotify('coord', ['permits_eng', 'permits_sup'], when + ': ' + j.kind + ' — ' + (j.district || ''), head + '\n' + flJobText(j) + (nb.length ? '\nمعاملات قريبة في نفس النطاق (' + nb.length + '):\n' + list : ''), [j], { nav: flNav(j) });
  if (nb.length) flNotify('coord', ['civil', 'elec'], 'تنسيق موحّد: ' + (nb.length + 1) + ' معاملات في نطاق ' + cfg().flow.r2 + ' كم — ' + (j.district || ''), head + '\n' + flJobText(j) + '\nالمعاملات القريبة:\n' + list + '\nنسّقوا مرة واحدة: سلامة وإنارة، معدات، مراقبين، وسفلتة بالتوالي. ثم حوّلوا للمراقبين.', [j].concat(nb.map((x) => x.o)), { fwdRole: 'sup_civil+sup_elec', nav: flNav(j) });
  if (FL_OPEN(j)) flSafetyRequest(j);
  j.alerts[reason || 'coord'] = today(); flLog(j, j.stage, 'تنبيه تنسيق' + (nb.length ? ' مع ' + nb.length + ' معاملات قريبة' : ''));
  return nb.length;
}

// scheduler: runs on sign-in and every 5 minutes — tomorrow's alerts, permit expiry, attach-later deadlines, report deadlines
function flTick() {
  if (!CUR || !DB.jobs || !DB.roster) return 0; let n = 0; const td = today(), tm = addDays(1);
  flJobs().forEach((j) => {
    if (!flActive(j)) return;
    if ((j.date === tm || j.date === td) && !j.alerts.d1 && flIdx(j) <= flPath(j).indexOf('gate')) { flCoordinate(j, 'd1'); n++; }
    const pd = flPermitDays(j);
    if (j.permit && pd !== null && pd <= 3 && j.alerts.exp !== td) { flNotify('permit', ['permits_eng', 'permits_sup', 'civil'], pd < 0 ? 'رخصة منتهية والعمل قائم — خطر غرامة' : 'رخصة تقترب من الانتهاء', flJobText(j) + '\nجدّد الرخصة أو أنهِ الأعمال وأغلق الموقع قبل الانتهاء لتفادي الغرامات.', [j]); j.alerts.exp = td; n++; }
    if (j.gate && j.gate.mode === 'override' && !j.gate.fileId && j.gate.due < td && j.alerts.gate !== td) { flNotify('gate', ['permits_sup', 'civil'], 'تأخر إرفاق الرخصة بعد تجاوز المهندس', flJobText(j) + '\nتجاوز بواسطة ' + j.gate.by + ' — كان الإرفاق مطلوباً قبل ' + j.gate.due, [j]); j.alerts.gate = td; n++; }
    if (j.pdc && j.stage === 'pdc' && daysTo(j.pdc.due) <= 10 && j.alerts.pdc !== td) { flNotify('permit', ['permits_sup', 'permits_eng'], 'مهلة الاستشاري (60 يوماً) تنتهي خلال ' + daysTo(j.pdc.due) + ' يوم', flJobText(j), [j]); j.alerts.pdc = td; n++; }
  });
  DB.reports.forEach((r) => { if (r.st !== 'resolved' && daysTo(r.due) <= 2 && r.alerted !== td) { const j = DB.jobs.find((x) => x.id === r.jobId); flNotify('report', ['permits_sup', 'civil'], r.kindName + ' — المهلة ' + (daysTo(r.due) < 0 ? 'انتهت' : 'تنتهي خلال ' + daysTo(r.due) + ' يوم'), (j ? flJobText(j) + '\n' : '') + (r.note || ''), j ? [j] : []); r.alerted = td; n++; } });
  if (n) save();
  return n;
}

// clusters: single-linkage within clusterKm, or same station / plan
function flClusters(list, kmMax) {
  const P = list.filter(flHasXY); const parent = P.map((_, i) => i); const f = (i) => (parent[i] === i ? i : (parent[i] = f(parent[i])));
  for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) {
    const x = P[a], y = P[b];
    if (km(x, y) <= kmMax || (x.station && x.station === y.station) || (x.plan && x.plan === y.plan && x.district === y.district)) parent[f(a)] = f(b);
  }
  const g = {}; P.forEach((j, i) => { (g[f(i)] = g[f(i)] || []).push(j); });
  return Object.values(g).map((jobs) => {
    const lat = jobs.reduce((s, j) => s + j.lat, 0) / jobs.length, lng = jobs.reduce((s, j) => s + j.lng, 0) / jobs.length;
    const rad = Math.max(0.35, ...jobs.map((j) => km({ lat, lng }, j))) + 0.25;
    const cnt = {}; jobs.forEach((j) => { cnt[j.district] = (cnt[j.district] || 0) + 1; }); const dist = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] || '';
    return { jobs, lat, lng, rad, district: dist, offices: [...new Set(jobs.map((j) => j.office))], meters: jobs.reduce((s, j) => s + (+j.lengthM || 0), 0) };
  }).sort((a, b) => b.jobs.length - a.jobs.length);
}
// shared trips when a cluster is coordinated once: safety delivery + safety removal + HSE visit + supervisor visit + asphalt mobilisation
function flSavings(clusters) { const trips = clusters.reduce((s, c) => s + Math.max(0, c.jobs.length - 1) * 5, 0); return { trips, sar: trips * FL_TRIP_SAR }; }
