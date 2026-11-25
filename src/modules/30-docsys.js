// ================================================================
// Module: documented approval system (دليل التوثيق والمعرّف الموحّد)
// - Unified ID per transaction: CAT-YY-XXXX (C civil/routes 802 · M meters 402/801 ·
//   F LV/MV fault maintenance · P33 pilot cables · X emergencies).
// - Work-order (أمر العمل) and SAP numbers on every task.
// - Permit status colours: expired black · < 5 days red · < 14 days amber · otherwise green.
// - Uploaded files are renamed PROJECT_STAGE_DATE_SAP.ext; stage photos carry GPS.
// - QA documentation checklist must be approved before a file goes to the consultant (PDC).
// - Critical-permits report (top 10 nearest to expiry) + Kanban drag-and-drop.
// Loaded before the DB is created, so only declarations live at top level.
// ================================================================
const FL_CATS = {
  C: ['الإنشاءات', 'أعمال مدنية ومسارات — أوامر 802'],
  M: ['العدادات', 'تركيب واستبدال عدادات — 402 / 801'],
  F: ['الأعطال', 'صيانة جهد منخفض ومتوسط'],
  P33: ['كابلات البايلوت', 'تمديد وتوصيل كابلات البايلوت'],
  X: ['الحالات الطارئة', 'أعمال طارئة — ترخيص 10 أيام']
};
// new kinds from the guide, appended to the existing ones
Object.assign(FL_KINDS, {
  'صيانة أعطال جهد منخفض ومتوسط': FL_FULL,
  'تمديد كابلات البايلوت': FL_FULL,
  'حالة طارئة': FL_FULL
});
const FL_KIND_CAT = { 'تركيب عدادات': 'M', 'صيانة أعطال جهد منخفض ومتوسط': 'F', 'تمديد كابلات البايلوت': 'P33', 'حالة طارئة': 'X' };
function flCatOf(j) { if (j.cat && FL_CATS[j.cat]) return j.cat; if (j.permitType === 'طارئ' && !FL_KIND_CAT[j.kind]) return 'X'; return FL_KIND_CAT[j.kind] || 'C'; }
const UID_RE = /^(C|M|F|P33|X)-\d{2}-\d{4}$/;
function flUidNext(cat, yy, jobs) {
  const pre = cat + '-' + yy + '-'; let mx = 0;
  (jobs || DB.jobs).forEach((j) => { if (j.uid && j.uid.startsWith(pre)) mx = Math.max(mx, +j.uid.slice(pre.length) || 0); });
  return pre + String(mx + 1).padStart(4, '0');
}
function flEnsureUid(j, force, jobs) {
  const cat = flCatOf(j); j.cat = cat;
  if (j.uid && !force && j.uid.startsWith(cat + '-')) return j.uid;
  j.uid = flUidNext(cat, String((j.date || today()).slice(2, 4)), jobs); return j.uid;
}
const flRef = (j) => j.uid || j.baseNo || j.id;
function flMigrateIds(d) {
  d.lists.flKinds = d.lists.flKinds || [];
  Object.keys(FL_KINDS).forEach((k) => { if (!d.lists.flKinds.includes(k)) d.lists.flKinds.push(k); });
  d.lists.districts = d.lists.districts || [];
  d.jobs.forEach((j) => { j.woNo = j.woNo || ''; if (j.flow) { j.sapNo = j.sapNo || ''; j.qa = j.qa || null; flEnsureUid(j, false, d.jobs); } });
  return d;
}

// ---------- permit status ----------
// one rule for every list, report and chip in the app
function permitState(exp, has) {
  if (!has) return { c: 'bad', k: 'none', label: 'بلا رخصة', d: null };
  if (!exp) return { c: 'mutp', k: 'nodate', label: 'بلا تاريخ انتهاء', d: null };
  const d = daysTo(exp);
  if (d < 0) return { c: 'exp', k: 'exp', label: 'منتهية منذ ' + -d + ' يوم', d };
  if (d < 5) return { c: 'bad', k: 'red', label: d === 0 ? 'تنتهي اليوم' : 'متبقي ' + d + ' يوم', d };
  if (d < 14) return { c: 'warn', k: 'amber', label: 'متبقي ' + d + ' يوم', d };
  return { c: 'ok', k: 'green', label: 'سارية · ' + d + ' يوم', d };
}
const flPermitState = (j) => permitState(j.permitExp, !!j.permit);
const PERMIT_LEGEND = [['exp', 'منتهية'], ['bad', 'أقل من 5 أيام'], ['warn', 'أقل من 14 يوماً'], ['ok', 'سارية']];
function permitLegend() { return html`<div class="row plegend" aria-label="دليل ألوان الرخص">${PERMIT_LEGEND.map((x) => html`<span class="pill ${x[0]}">${x[1]}</span>`)}</div>`; }

// ---------- documentation (naming + GPS) ----------
const STAGE_CODE = { gate: 'PERMIT', safety: 'SAFETY', dig: 'CIVIL', elec: 'ELEC', asphalt: 'ASPHALT', lab: 'LAB', pdc: 'PDC', ripc: 'RIPC', plan: 'PLAN', closed: 'CLOSE' };
function flDocName(j, stage, orig) {
  const ext = (String(orig || '').match(/\.([a-z0-9]{2,5})$/i) || [, 'jpg'])[1].toLowerCase();
  const part = (s) => String(s || '').replace(/[^A-Za-z0-9\-]/g, '');
  return [part(flRef(j)) || 'NOID', STAGE_CODE[stage] || 'DOC', today().replace(/-/g, ''), part(j.sapNo) || 'NOSAP'].join('_') + '.' + ext;
}
function geoNow(ms) {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    let done = false; const t = setTimeout(() => { if (!done) { done = true; res(null); } }, ms || 4000);
    try { navigator.geolocation.getCurrentPosition((p) => { if (done) return; done = true; clearTimeout(t); res({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy || 0), tm: nowIso() }); }, () => { if (!done) { done = true; clearTimeout(t); res(null); } }, { enableHighAccuracy: true, timeout: ms || 4000, maximumAge: 60000 }); } catch (e) { done = true; clearTimeout(t); res(null); }
  });
}
const flStageDocs = (j, stage) => DB.docs.filter((d) => d.taskId === j.id && d.stage === stage);

// ---------- QA checklist (before the consultant) ----------
function flQa(j) {
  const P = flPath(j); const docs = DB.docs.filter((d) => d.taskId === j.id);
  const photo = (s) => !P.includes(s) || flStageDocs(j, s).length > 0;
  const geo = ['dig', 'elec', 'asphalt'].filter((s) => P.includes(s)).every((s) => flStageDocs(j, s).some((d) => d.geo));
  return [
    ['الموقع (الحي والإحداثيات)', !!j.district && flHasXY(j)],
    ['طول الحفر بالمتر', !P.includes('dig') && !P.includes('asphalt') ? true : +j.lengthM > 0],
    ['رقم الرخصة ومرفقها', !!j.permit && docs.some((d) => d.type === 'تصريح' || d.type === 'تعهد')],
    ['رقم أمر العمل', !!j.woNo],
    ['رقم SAP', !!j.sapNo],
    ['صور المراحل (مدني / كهرباء / أسفلت)', ['dig', 'elec', 'asphalt'].every(photo)],
    ['الصور موثّقة بالموقع الجغرافي', geo]
  ];
}
const flQaOk = (j) => flQa(j).every((x) => x[1]);

// ---------- critical permits report ----------
function permitRows() {
  const rows = [];
  jobsV().forEach((j) => {
    if (!j.permit || j.st === 'done' || (j.flow && j.stage === 'closed')) return;
    const s = permitState(j.permitExp, true); if (s.d === null) return;
    rows.push({ j, s });
  });
  return rows.sort((a, b) => a.s.d - b.s.d);
}
function permitNote(j, s) {
  if (s.k === 'exp') return j.flow && ['lab', 'pdc', 'ripc'].includes(j.stage) ? 'منتهية — أكمل ملف الإغلاق قبل مهلة 60 يوماً' : 'منتهية والعمل قائم — خطر غرامة، جدّد أو أغلق الموقع';
  if (!j.flow) return j.st === 'hold' ? 'المهمة متوقفة — راجع سبب التوقف' : 'متابعة التنفيذ قبل الانتهاء';
  if (!flGateOk(j)) return 'لم تُرفق صورة الرخصة بعد';
  const m = { plan: 'جدولة التنفيذ والتنسيق الجغرافي', gate: 'إرفاق الرخصة وبدء التنفيذ', safety: 'توريد السلامة وفحص HSE', dig: 'إنهاء الحفر', elec: 'إنهاء الأعمال الكهربائية', asphalt: 'إنهاء السفلتة قبل الانتهاء', lab: 'فحص المختبر', pdc: 'متابعة الاستشاري', ripc: 'متابعة المركز' };
  return m[j.stage] || '';
}
function ring(d, c) {
  const p = Math.max(0, Math.min(1, (d < 0 ? 0 : d) / 30)); const C = 2 * Math.PI * 22;
  return new Safe('<svg class="pring pr-' + c + '" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="22" class="pr-bg"/><circle cx="26" cy="26" r="22" class="pr-fg" stroke-dasharray="' + (C * p).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 26 26)"/><text x="26" y="30" text-anchor="middle">' + (d < 0 ? '!' : d) + '</text></svg>');
}
function viewPermits() {
  const R = permitRows(); const top = R.slice(0, 10);
  const cnt = (k) => R.filter((r) => r.s.c === k).length;
  const closing = flJobs().filter(jobInScope).filter((j) => j.permitExp && daysTo(j.permitExp) < 0 && ['asphalt', 'lab', 'pdc', 'ripc'].includes(j.stage));
  const ev = flJobs().filter(jobInScope).filter((j) => flActive(j) && flIdx(j) > flPath(j).indexOf('dig'));
  const evOk = ev.filter((j) => flQa(j)[6][1]).length;
  return html`<div class="ph"><div><h1 style="font-size:28px">تقرير الرخص الحرجة</h1><p>أقرب ${top.length} رخص للانتهاء من المهام والمعاملات الجارية، مع الإجراء المطلوب لكل رخصة. يُحدَّث تلقائياً.</p></div>
    <div class="row no-print"><button class="btn" type="button" data-act="print-page">طباعة التقرير</button><button class="btn" type="button" data-act="nav" data-v="flow">دورة المعاملات</button></div></div>
  <div class="flkpi"><div class="flk"><span>منتهية</span><b class="t-exp">${cnt('exp')}</b></div><div class="flk"><span>أقل من 5 أيام</span><b class="t-bad">${cnt('bad')}</b></div><div class="flk"><span>أقل من 14 يوماً</span><b class="t-warn">${cnt('warn')}</b></div><div class="flk"><span>سارية</span><b class="t-ok">${cnt('ok')}</b></div><div class="flk"><span>صور موثّقة بالموقع</span><b>${evOk}/${ev.length}</b></div></div>
  ${permitLegend()}
  ${top.length ? html`<div class="pgrid">${top.map((r, i) => { const j = r.j; const crew = crewById(j.crewId); return html`<article class="card pcrit pc-${r.s.c}"><div class="row" style="gap:12px;flex-wrap:nowrap">${ring(r.s.d, r.s.c)}
      <div style="min-width:0;flex:1"><div class="row between" style="gap:6px"><b class="ltr">${j.uid || j.permit}</b><span class="t-mut" style="font-size:12px">#${i + 1}</span></div>
      <div style="font-size:13px">رخصة <b class="ltr">${j.permit}</b> · ${j.kind || j.title}</div>
      <div class="t-mut" style="font-size:12px">${j.district || j.site || '—'}${crew ? ' · ' + crew.id : ''} · تنتهي <bdi class="ltr">${j.permitExp}</bdi></div></div></div>
      <p class="pnote"><span class="pill ${r.s.c}">${r.s.label}</span> ${permitNote(j, r.s)}</p>
      ${j.flow ? html`<button class="btn sm no-print" type="button" data-act="fl-goto" data-id="${j.id}">فتح المعاملة</button>` : html`<button class="btn sm no-print" type="button" data-act="task-open" data-id="${j.id}">فتح المهمة</button>`}</article>`; })}</div>` : html`<p class="empty">لا رخص جارية بتواريخ انتهاء.</p>`}
  <div class="grid g2"><div class="card"><h3 style="font-size:16px">قاعدة الـ 60 يوماً بعد انتهاء الرخصة</h3><p class="t-mut" style="font-size:13px">بعد انتهاء الرخصة يجب استكمال تقرير المختبر URS ورفع ملف الإغلاق للاستشاري خلال 60 يوماً.</p>
      ${closing.length ? html`<ul class="nb">${closing.map((j) => { const left = 60 + daysTo(j.permitExp); return html`<li><button type="button" class="lnk" data-act="fl-goto" data-id="${j.id}">${flRef(j)} — ${FL_STAGES[j.stage][0]}</button><span class="pill ${left <= 10 ? 'bad' : left <= 30 ? 'warn' : 'info'}">${left < 0 ? 'تجاوزت المهلة ' + -left + ' يوم' : 'متبقي ' + left + ' يوم'}</span></li>`; })}</ul>` : html`<p class="t-ok" style="font-size:13px">لا ملفات إغلاق بعد انتهاء الرخصة.</p>`}</div>
    <div class="card"><h3 style="font-size:16px">الأدلة المرئية</h3><p class="t-mut" style="font-size:13px">كل مرحلة تنفيذ تُغلق بصورة موثّقة بالموقع الجغرافي، وتُسمّى ملفاتها: المعرّف_المرحلة_التاريخ_SAP.</p>
      ${ev.length ? html`<ul class="nb">${ev.map((j) => { const ok = flQa(j)[6][1]; return html`<li><button type="button" class="lnk" data-act="fl-goto" data-id="${j.id}">${flRef(j)} — ${j.district}</button><span class="pill ${ok ? 'ok' : 'warn'}">${ok ? 'موثّقة' : 'ناقصة'}</span></li>`; })}</ul>` : html`<p class="t-mut" style="font-size:13px">لا معاملات بعد مرحلة الحفر.</p>`}</div></div>`;
}

// ---------- QA box inside the transaction detail ----------
function flQaBox(j) {
  const Q = flQa(j); const ok = Q.every((x) => x[1]); const show = flIdx(j) >= flPath(j).indexOf('lab') || j.qa;
  if (!show && flPath(j).includes('lab')) return '';
  return html`<div class="gatebox qa"><div class="row between"><b>قائمة التوثيق والجودة قبل الرفع للاستشاري</b>${j.qa ? html`<span class="pill ok">اعتمد ${j.qa.by} · ${fmtT(j.qa.tm)}</span>` : html`<span class="pill ${ok ? 'info' : 'warn'}">${Q.filter((x) => x[1]).length}/${Q.length}</span>`}</div>
    <ul class="qal">${Q.map((x) => html`<li class="${x[1] ? 'y' : 'n'}">${x[1] ? '✓' : '✗'} ${x[0]}</li>`)}</ul>
    ${!j.qa && can('edit') && jobCanEdit(j) ? html`<button class="btn sm ${ok ? 'pri' : ''}" type="button" data-act="fl-qa" data-id="${j.id}" ${ok ? '' : new Safe('aria-disabled="true"')}>اعتماد الجودة</button>` : ''}</div>`;
}

// ---------- Kanban (drag & drop) ----------
// tickets carry data-drag="<board>" data-id; columns carry data-drop="<board>" data-k="<column>"
const KANBAN = {
  fl: (id, col) => {
    const j = DB.jobs.find((x) => x.id === id); if (!j || col === j.stage) return;
    if (col !== flNext(j)) return toast('اسحب المعاملة إلى المرحلة التالية فقط («' + (flNext(j) ? FL_STAGES[flNext(j)][0] : '—') + '»). الإعادة تتم بتسجيل بلاغ.', 'err');
    FL_ACT['fl-adv']({ id });
  },
  task: (id, col) => {
    const t = taskById(id); if (!t || t.st === col) return;
    const m = { prog: t.st === 'hold' ? 'task-resume' : 'task-start', hold: 'task-hold', done: 'task-close' }[col];
    if (!m) return toast('لا يمكن إعادة المهمة إلى «جديدة».', 'err');
    if (m === 'task-start' && t.st !== 'new') return;
    ACT[m]({ id });
  }
};
function kbWire() {
  let drag = null;
  document.addEventListener('dragstart', (e) => { const el = e.target.closest && e.target.closest('[data-drag]'); if (!el) return; drag = { b: el.dataset.drag, id: el.dataset.id }; el.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', el.dataset.id); } catch (x) { /* ignore */ } });
  document.addEventListener('dragover', (e) => { const c = drag && e.target.closest && e.target.closest('[data-drop="' + drag.b + '"]'); if (!c) return; e.preventDefault(); document.querySelectorAll('.kb-over').forEach((x) => { if (x !== c) x.classList.remove('kb-over'); }); c.classList.add('kb-over'); });
  document.addEventListener('drop', (e) => { const c = drag && e.target.closest && e.target.closest('[data-drop="' + drag.b + '"]'); if (!c) return; e.preventDefault(); const d = drag; drag = null; document.querySelectorAll('.kb-over,.drag').forEach((x) => x.classList.remove('kb-over', 'drag')); if (KANBAN[d.b]) KANBAN[d.b](d.id, c.dataset.k); });
  document.addEventListener('dragend', () => { drag = null; document.querySelectorAll('.kb-over,.drag').forEach((x) => x.classList.remove('kb-over', 'drag')); });
}
function viewTaskKanban(list) {
  const E = can('request');
  return html`<div class="board kb" aria-label="لوحة كانبان للمهام">${Object.keys(JOB_ST).map((s) => { const L = list.filter((t) => t.st === s); return html`<section class="col" data-drop="task" data-k="${s}"><h3><span>${JOB_ST[s][0]}</span><span class="badge-n">${L.length}</span></h3>
    ${L.length ? L.map((t) => { const c = crewById(t.crewId); const ps = t.permit ? permitState(t.permitExp, true) : null; return html`<button type="button" class="flcard" data-act="task-sel" data-id="${t.id}" ${E ? new Safe('draggable="true" data-drag="task"') : ''}>
      <span class="row between" style="gap:6px"><b class="ltr">${t.uid || t.woNo || t.permit || '—'}</b>${ps ? html`<span class="pill ${ps.c}">${ps.label}</span>` : ''}</span>
      <span class="flk-t">${t.title}</span><span class="t-mut" style="font-size:12px">${c ? c.id : 'غير مُسندة'} · ${t.site || '—'} · ${fmtD(t.date)}</span>${t.woNo ? html`<span class="t-mut ltr" style="font-size:11px">WO ${t.woNo}</span>` : ''}</button>`; }) : html`<p class="t-mut" style="font-size:12px;margin:6px">—</p>`}</section>`; })}</div>`;
}
