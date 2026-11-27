// ================= 80 · global search (iqama · plate · istimara · unit number) =================
// Who: project manager, platform admin and HR (fleet/cars). Everyone else never sees the button or the view.
// What: one index over employees, crew people (engineer, supervisor, workers, drivers) and every unit
// (supervisor cars, equipment, dynas). Matching ignores spaces/dashes, Arabic-Indic digits and
// maps Saudi plate letters (أ ب ح د ر س ص ط ع ق ك ل م ن هـ و ى) to their Latin twins, so
// "أ ب ج 1234", "ABJ1234" and "١٢٣٤" all find the same car.
const SEARCH_ROLES = ['pm', 'admin', 'hr'];
const canSearch = () => !!CUR && SEARCH_ROLES.includes(CUR.role);
const PLATE_AR = { 'ا': 'a', 'أ': 'a', 'إ': 'a', 'آ': 'a', 'ب': 'b', 'ح': 'j', 'ج': 'j', 'د': 'd', 'ر': 'r', 'س': 's', 'ص': 'x', 'ط': 't', 'ع': 'e', 'ق': 'g', 'ك': 'k', 'ل': 'l', 'م': 'z', 'ن': 'n', 'ه': 'h', 'ـ': '', 'و': 'u', 'ى': 'v', 'ي': 'v' };
function srchNorm(s) {
  return String(s == null ? '' : s).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[\s\-_/.,:|·]+/g, '').toLowerCase();
}
const srchPlate = (s) => srchNorm(s).replace(/[؀-ۿ]/g, (c) => (c in PLATE_AR ? PLATE_AR[c] : c));
// does query q hit any of the values? returns the label of the first field that matched (or '')
function srchHit(q, fields) {
  const a = srchNorm(q), b = srchPlate(q); if (!a) return '';
  for (const f of fields) { if (!f || f[1] == null || f[1] === '') continue; const v = String(f[1]); if (srchNorm(v).includes(a) || (b.length > 1 && srchPlate(v).includes(b))) return f[0]; }
  return '';
}
const SRCH_KIND = { emp: 'موظف', person: 'فرد بالفرقة', unit: 'معدة / سيارة' };
function searchIndex() {
  const out = []; const seenIq = new Set(); const byKey = {};
  const crews = (typeof crewsV === 'function' ? crewsV() : DB.crews) || [];
  const roleOf = (c, p) => (c.eng === p ? 'مهندس' : c.sup === p ? 'مراقب' : p.role || 'عامل');
  crews.forEach((c) => {
    const people = [c.eng, c.sup].concat(c.workers || []).filter(Boolean);
    people.forEach((p) => {
      const key = p.empId || p.iqama || ''; const prev = key && byKey[key];
      if (prev) { if (!prev.crews.includes(c.id)) { prev.crews.push(c.id); prev.sub = prev.role + ' · ' + prev.crews.join('، '); } return; }
      if (p.iqama) seenIq.add(p.iqama); const role = roleOf(c, p);
      const it = { kind: 'person', title: p.name || '—', role, sub: role + ' · ' + c.id + ' ' + c.name, crew: c.id, crews: [c.id], iq: p.iqama || '', empId: p.empId || '', f: [['رقم الإقامة', p.iqama], ['الاسم', p.name], ['الجوال', p.phone]] };
      if (key) byKey[key] = it; out.push(it);
    });
    const units = [{ u: c.sup && c.sup.car, where: 'سيارة المراقب', drv: c.sup }].concat((c.eq || []).map((u) => ({ u, where: u.kind, drv: u.driver })), (c.workers || []).filter((w) => w.dyna).map((w) => ({ u: w.dyna, where: 'دينا', drv: w.dyna.driver || w })));
    units.forEach((x) => {
      const u = x.u; if (!u) return; if (x.drv && x.drv.iqama && x.where !== 'سيارة المراقب') seenIq.add(x.drv.iqama);
      out.push({ kind: 'unit', title: (u.kind || x.where) + ' ' + (u.code || ''), sub: x.where + ' · ' + c.id + (x.drv && x.drv.name ? ' · السائق ' + x.drv.name : ''), crew: c.id, code: u.code || '',
        f: [['رقم اللوحة / المعدة', u.code], ['رقم الاستمارة', u.regNo], ['رقم الهيكل', u.vin], ['إقامة السائق', x.drv && x.drv.iqama], ['السائق', x.drv && x.drv.name], ['الطراز', u.model]] });
    });
  });
  (DB.employees || []).filter((e) => typeof empInScope !== 'function' || empInScope(e)).forEach((e) => {
    if (e.iqama && seenIq.has(e.iqama)) return; // already listed with their crew
    const l = typeof empLink === 'function' ? empLink(e) : null;
    out.push({ kind: 'emp', title: e.name || '—', sub: (e.job || '') + (l ? ' · ' + l.crew.id : ' · غير مرتبط بفرقة'), crew: l ? l.crew.id : '', iq: e.iqama || '', empId: e.id, f: [['رقم الإقامة', e.iqama], ['الرقم الوظيفي', e.empNo], ['الاسم', e.name], ['الجوال', e.phone]] });
  });
  return out;
}
function searchRun(q, max) {
  if (!canSearch() || srchNorm(q).length < 2) return [];
  const r = []; for (const it of searchIndex()) { const hit = srchHit(q, it.f); if (hit) { r.push(Object.assign({ hit }, it)); if (max && r.length >= max) break; } }
  return r;
}
function searchRow(it) {
  const go = [];
  if (it.kind === 'unit') go.push(html`<button class="btn sm dark" type="button" data-act="srch-eq" data-id="${it.code}">في سجل المعدات</button>`);
  (it.crews || (it.crew ? [it.crew] : [])).slice(0, 4).forEach((id, i, all) => go.push(html`<button class="btn sm" type="button" data-act="srch-crew" data-id="${id}">${all.length > 1 ? 'الفرقة ' + id : 'فتح الفرقة'}</button>`));
  if (it.kind !== 'unit' && (it.iq || it.empId) && canSeeCards()) go.push(html`<button class="btn sm" type="button" data-act="srch-card" data-id="${it.iq || it.title}">البطاقة</button>`);
  return html`<li class="srch-r"><span class="srch-k k-${it.kind}">${SRCH_KIND[it.kind]}</span><div class="srch-t"><b>${it.title}</b><small>${it.sub}</small><small class="srch-hit">طابق: ${it.hit}</small></div><div class="row">${go}</div></li>`;
}
// compact search box with live results — used in the search view, crews, equipment and team cards
function searchBox(compact) {
  if (!canSearch()) return '';
  const q = UI.gQ || ''; const res = searchRun(q, compact ? 8 : 200);
  return html`<div class="srch ${compact ? 'srch-c' : ''}" role="search"><label class="sr" for="gq">بحث برقم الإقامة أو اللوحة أو الاستمارة</label>
    <div class="srch-in">${new Safe('<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>')}<input class="in" id="gq" type="search" autocomplete="off" inputmode="search" placeholder="رقم إقامة، رقم لوحة، رقم استمارة، أو رقم معدة…" value="${q}" data-input="g-q">${q ? html`<button class="btn ghost sm" type="button" data-act="srch-clr" aria-label="مسح البحث">مسح</button>` : ''}</div>
    ${srchNorm(q).length >= 2 ? html`<p class="muted srch-n" role="status">${res.length ? res.length + (compact && res.length >= 8 ? '+ نتيجة — افتح البحث الشامل للمزيد' : ' نتيجة') : 'لا نتائج مطابقة.'}${compact && res.length >= 8 ? html` <button class="btn ghost sm" type="button" data-act="nav" data-v="search">البحث الشامل</button>` : ''}</p><ul class="srch-l">${res.map(searchRow)}</ul>` : ''}</div>`;
}
function viewSearch() {
  if (!canSearch()) return html`<p class="alert note">البحث الشامل متاح لمدير المشروع ومدير المنصة والموارد البشرية.</p>`;
  return html`<div class="ph"><div><h1 style="font-size:28px">البحث الشامل</h1><p>ابحث برقم الإقامة أو رقم لوحة السيارة أو رقم الاستمارة أو رقم المعدة — في الموظفين وأفراد الفرق والمعدات والسيارات.</p></div></div>
  <div class="card">${searchBox(false)}<p class="muted" style="font-size:12px;margin-top:10px">تلميح: الأرقام العربية والإنجليزية سواء، والمسافات والشرطات تُتجاهل، وحروف اللوحة العربية تطابق نظيرتها اللاتينية (أ=A، ب=B، ح=J…). اختصار لوحة المفاتيح: Ctrl+K.</p></div>`;
}
const SEARCH_ACT = {
  'srch-clr': () => { UI.gQ = ''; render(); const n = $('#gq'); if (n) n.focus(); },
  'srch-crew': (d) => { UI.sel = d.id; UI.view = 'crews'; UI.move = null; render(); window.scrollTo(0, 0); },
  'srch-eq': (d) => { UI.eqFilter = 'all'; UI.eqQ = d.id || ''; UI.view = 'equip'; render(); window.scrollTo(0, 0); },
  'srch-card': (d) => { UI.cardQ = d.id || ''; UI.view = 'cards'; render(); window.scrollTo(0, 0); },
};
const SEARCH_ICON = 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM20 20l-3.5-3.5';
function searchMbarBtn() {
  return canSearch() ? html`<button type="button" class="mb-btn" data-act="nav" data-v="search" aria-label="البحث الشامل">${new Safe('<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="' + SEARCH_ICON + '"/></svg>')}</button>` : '';
}
function searchKey(e) {
  if (!(e.ctrlKey || e.metaKey) || (e.key !== 'k' && e.key !== 'K') || !canSearch()) return;
  e.preventDefault(); if (UI.view !== 'search') { UI.view = 'search'; render(); } const n = $('#gq'); if (n) { n.focus(); n.select(); }
}
