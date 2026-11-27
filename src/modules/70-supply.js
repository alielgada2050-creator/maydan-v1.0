// ================================================================
// Module: work assignment, supply control and quantities
//   • Assignment: every time a task / transaction is assigned to a crew, the crew's engineer and
//     supervisor are notified that this crew is authorised to finish the work; they acknowledge it.
//   • Supply & safety requests (safety + lighting, backfill, sand, subbase, concrete, asphalt, waste):
//     supervisor → his engineer + project manager approve and link a supplier (registry number / PO)
//     → delivery receipt photographed on site with the delivered quantity → variance vs estimate is
//     flagged to the project manager and the platform admin.
//   • Quantities per transaction are calculated from the excavation length with parameters editable
//     in Settings (defaults must be checked against the unified contract).
//   • Sortable lists: drag the grip handle (mouse or touch) or use the arrow keys on it.
// Loaded before the DB is created, so only declarations live at top level.
// ================================================================
const SUPPLY = {
  safety: ['السلامة والإنارة', 'طقم', 'صبات وحواجز وأقماع ولوحات وإنارة LED'],
  backfill: ['دفان / ردم', 'م³', 'مواد الردم المعتمدة'],
  sand: ['رمل ناعم', 'م³', 'فرشة ووسادة الكابلات'],
  subbase: ['صبيز (Subbase)', 'م³', 'طبقة الأساس تحت الأسفلت'],
  concrete: ['خرسانة', 'م³', 'بلاطات حماية وقواعد'],
  asphalt: ['أسفلت', 'طن', 'إعادة السفلتة حسب العقد'],
  waste: ['إزالة مخلفات', 'م³', 'نقل ناتج الحفر والمخلفات']
};
const SUP_ST = { req: ['بانتظار الاعتماد', 'warn'], ok: ['معتمد — بانتظار المورد', 'info'], ord: ['مُسند للمورد', 'info'], del: ['تم التوريد — بانتظار المطابقة', 'warn'], done: ['مطابق ومغلق', 'ok'], rej: ['مرفوض', 'bad'] };
const QTY_DEF = { width: 0.6, depth: 1.0, sandT: 0.3, concT: 0.1, subT: 0.2, overlap: 0.3, asphT: 0.07, density: 2.35, swell: 1.25, tol: 10 };
const qcfg = () => Object.assign({}, QTY_DEF, (cfg().qty || {}));
const r2 = (x) => Math.round(x * 100) / 100;
function qtyEstimate(j) {
  const Q = qcfg(); const L = +j.lengthM || 0; if (!L) return null;
  const W = +j.widthM || Q.width, D = +j.depthM || Q.depth, AW = W + 2 * Q.overlap;
  const exc = L * W * D, sand = L * W * Q.sandT, conc = L * W * Q.concT, sub = L * AW * Q.subT, aArea = L * AW;
  const back = Math.max(0, L * W * (D - Q.sandT - Q.concT) - L * W * (Q.subT + Q.asphT));
  return { L, W, D, exc: r2(exc), backfill: r2(back), sand: r2(sand), concrete: r2(conc), subbase: r2(sub), asphaltArea: r2(aArea), asphalt: r2(aArea * Q.asphT * Q.density), waste: r2(exc * Q.swell), safety: 1 };
}
const supList = (j) => (j.supply = j.supply || []);
function supTotals(j, k) { const L = supList(j).filter((s) => s.kind === k && s.st !== 'rej'); return { req: r2(L.reduce((a, s) => a + (+s.qty || 0), 0)), del: r2(L.reduce((a, s) => a + (+s.dq || 0), 0)) }; }

// ---------- people to notify ----------
function crewPeople(c) { if (!c) return []; return [c.eng ? { id: 'p-eng-' + c.id, role: 'eng', name: c.eng.name, phone: c.eng.phone || '' } : null, c.sup ? { id: 'p-sup-' + c.id, role: 'sup', name: c.sup.name, phone: c.sup.phone || '' } : null].filter(Boolean); }
function pmPeople(j) { return DB.users.filter((u) => u.active !== false && (u.role === 'pm' || u.role === 'admin') && (u.role === 'admin' || jobCanEdit(j, u))).map((u) => ({ id: u.id, role: u.role, name: u.name, phone: u.phone || '' })); }
function notifyPeople(kind, to, title, body, j, extra) {
  const seen = new Set(); to = to.filter((p) => p && !seen.has(p.name) && seen.add(p.name));
  const it = Object.assign({ id: uid('in'), tm: nowIso(), kind, roles: [...new Set(to.map((p) => p.role))], to, title, body, jobIds: j ? [j.id] : [], st: 'new', fwd: [], by: CUR ? CUR.name : 'النظام' }, extra || {});
  DB.inbox = DB.inbox || []; DB.inbox.unshift(it); if (DB.inbox.length > 600) DB.inbox.length = 600; return it;
}
const jobRef = (j) => (j.uid || j.baseNo || j.permit || '') + ' — ' + (j.kind || j.title);
const jobLoc = (j) => (j.district || j.site || '') + (j.lat ? '\nالموقع: https://maps.google.com/?q=' + j.lat + ',' + j.lng : '');

// ---------- assignment watch (runs on every save) ----------
function assignWatch() {
  if (!DB || !Array.isArray(DB.jobs) || !CUR) return;
  DB.jobs.forEach((j) => {
    if (j.assignedTo === undefined) { j.assignedTo = j.crewId || ''; return; }
    if ((j.crewId || '') === j.assignedTo) return;
    const prev = j.assignedTo; j.assignedTo = j.crewId || ''; j.ack = null;
    j.assignLog = (j.assignLog || []).concat([{ tm: nowIso(), from: prev, to: j.assignedTo, by: CUR.name }]).slice(-20);
    const c = crewById(j.crewId); if (!c) return;
    notifyPeople('assign', crewPeople(c).concat(pmPeople(j).filter((p) => p.role === 'pm')), 'إسناد عمل إلى ' + c.id + ' — ' + jobRef(j),
      'الفرقة ' + c.id + ' (' + c.name + ') مخوّلة بتنفيذ وإنهاء الأعمال:\n' + jobRef(j) + (j.permit ? '\nالرخصة ' + j.permit + (j.permitExp ? ' — تنتهي ' + j.permitExp : '') : '') + (j.woNo ? '\nأمر العمل ' + j.woNo : '') + '\n' + jobLoc(j) + (prev ? '\nنُقل الإسناد من ' + prev : '') + '\nأسندها: ' + CUR.name, j);
  });
}
function assignBox(j) {
  const c = crewById(j.crewId); if (!c) return '';
  const me = CUR && ((c.sup && personIs(c.sup, CUR)) || (c.eng && personIs(c.eng, CUR)));
  const last = (j.assignLog || []).slice(-1)[0];
  return html`<div class="assign"><div class="row between" style="gap:8px"><div><b>الإسناد:</b> ${c.id} · ${c.name}<div class="t-mut" style="font-size:12px">المهندس: ${c.eng ? c.eng.name : '—'} · المراقب: ${c.sup ? c.sup.name + ' (' + supTag(c) + ')' : '—'}${last ? ' · أسندها ' + last.by + ' ' + ago(last.tm) : ''}</div></div>
    ${j.ack ? html`<span class="pill ok">استلم ${j.ack.by} · ${ago(j.ack.tm)}</span>` : me ? html`<button class="btn sm pri" type="button" data-act="assign-ack" data-id="${j.id}">استلام الإسناد</button>` : html`<span class="pill warn">بانتظار استلام الفرقة</span>`}</div></div>`;
}

// ---------- supply requests ----------
function canApproveSupply(j) { return !!CUR && (CUR.role === 'admin' || CUR.role === 'pm' || (CUR.role === 'eng' && jobCanEdit(j))); }
function supplyBox(j) {
  const S = supList(j); const est = j.flow ? qtyEstimate(j) : null; const E = can('request') && jobCanEdit(j);
  return html`<div class="gatebox supply"><div class="row between"><b>التوريد والسلامة والكميات</b>${E ? html`<button class="btn sm pri" type="button" data-act="sup-req" data-id="${j.id}">+ طلب توريد / سلامة</button>` : ''}</div>
    ${est ? html`<div class="tblw"><table class="qtbl"><thead><tr><th>البند</th><th>المحسوب من طول ${est.L} م</th><th>المطلوب</th><th>المورَّد</th><th>الفرق</th></tr></thead><tbody>${['backfill', 'sand', 'subbase', 'concrete', 'asphalt', 'waste'].map((k) => { const t = supTotals(j, k); const e = est[k]; const dv = t.del ? r2(((t.del - e) / (e || 1)) * 100) : null; const bad = dv !== null && Math.abs(dv) > qcfg().tol;
      return html`<tr><td>${SUPPLY[k][0]}</td><td class="ltr">${e} ${SUPPLY[k][1]}</td><td class="ltr">${t.req || '—'}</td><td class="ltr">${t.del || '—'}</td><td>${dv === null ? '—' : html`<span class="pill ${bad ? 'bad' : 'ok'}">${dv > 0 ? '+' : ''}${dv}%</span>`}</td></tr>`; })}</tbody></table></div>
      <p class="t-mut" style="font-size:11.5px;margin:0">عرض ${est.W} م × عمق ${est.D} م · مساحة السفلتة ${est.asphaltArea} م² · معاملات الحساب من الإعدادات (راجعها مع العقد الموحد).</p>` : j.flow ? html`<p class="t-mut" style="font-size:12px;margin:0">أدخل طول الحفر في بيانات المعاملة لتُحسب الكميات تلقائياً.</p>` : ''}
    ${S.length ? html`<ul class="hsel">${S.map((s) => html`<li class="${SUP_ST[s.st][1] === 'bad' ? 'bad' : SUP_ST[s.st][1] === 'ok' ? 'info' : 'warn'}"><span><b>${SUPPLY[s.kind][0]}</b> ${s.qty ? s.qty + ' ' + SUPPLY[s.kind][1] : ''}${s.supplier ? ' · المورد: ' + s.supplier.name + (s.supplier.no ? ' (' + s.supplier.no + ')' : '') : ''}${s.po ? ' · أمر ' + s.po : ''}${s.dq ? ' · وُرِّد ' + s.dq + ' ' + SUPPLY[s.kind][1] : ''}<small class="t-mut" style="display:block">${s.by} · ${ago(s.tm)}${s.note ? ' · ' + s.note : ''}</small></span>
      <span class="row" style="gap:4px"><span class="pill ${SUP_ST[s.st][1]}">${SUP_ST[s.st][0]}</span>${(s.receipts || []).map((id, i) => html`<button class="btn sm" type="button" data-act="doc-file" data-id="${id}">إيصال ${i + 1}</button>`)}${supActions(j, s)}</span></li>`)}</ul>` : ''}</div>`;
}
function supActions(j, s) {
  const A = canApproveSupply(j); const site = can('request') && jobCanEdit(j);
  if (s.st === 'req' && A) return html`<button class="btn sm pri" type="button" data-act="sup-ok" data-id="${j.id}" data-k="${s.id}">اعتماد وإسناد مورد</button><button class="btn sm" type="button" data-act="sup-rej" data-id="${j.id}" data-k="${s.id}">رفض</button>`;
  if ((s.st === 'ok' || s.st === 'ord') && site) return html`<button class="btn sm pri" type="button" data-act="sup-del" data-id="${j.id}" data-k="${s.id}">استلام وإرفاق الإيصال</button>`;
  if (s.st === 'del' && A) return html`<button class="btn sm pri" type="button" data-act="sup-close" data-id="${j.id}" data-k="${s.id}">مطابقة وإغلاق</button>`;
  return '';
}
const supById = (j, id) => supList(j).find((s) => s.id === id);
function supNotify(j, s, title, body, toPm) { const c = crewById(j.crewId); const to = crewPeople(c).concat(toPm ? pmPeople(j) : []); notifyPeople('supply', to, title + ' — ' + jobRef(j), body + '\n' + jobLoc(j), j); }
const SUPPLY_ACT = {
  'assign-ack': (d) => { const j = DB.jobs.find((x) => x.id === d.id); if (!j) return; const c = crewById(j.crewId); if (!c || !((c.sup && personIs(c.sup, CUR)) || (c.eng && personIs(c.eng, CUR)))) return toast('الاستلام لمهندس الفرقة أو مراقبها.', 'err');
    j.ack = { by: CUR.name, tm: nowIso() }; if (j.flow) flLog(j, j.stage, 'استلام الإسناد'); audit(CUR.name, 'استلام إسناد', jobRef(j)); save(); toast('سُجّل استلام الإسناد.'); render(); },
  'sup-req': (d) => { const j = DB.jobs.find((x) => x.id === d.id); if (!j || !need('request')) return; if (!jobCanEdit(j)) return toast('الطلب لمسؤولي هذه المعاملة.', 'err'); const est = j.flow ? qtyEstimate(j) : null;
    openForm('طلب توريد / سلامة — ' + jobRef(j), [{ k: 'kind', label: 'النوع', type: 'select', opts: Object.keys(SUPPLY).map((k) => [k, SUPPLY[k][0] + ' — ' + SUPPLY[k][2] + (est && est[k] && k !== 'safety' ? ' (المحسوب ' + est[k] + ' ' + SUPPLY[k][1] + ')' : '')]), val: 'safety' },
      { k: 'qty', label: 'الكمية المطلوبة (اتركها فارغة لاعتماد المحسوب)', type: 'number', ltr: true }, { k: 'due', label: 'مطلوب بتاريخ', type: 'date', val: today() }, { k: 'note', label: 'تفاصيل', type: 'textarea', max: 300 }], (v) => {
      const K = SUPPLY[v.kind]; if (!K) return 'اختر النوع.'; let q = +v.qty || (est && v.kind !== 'safety' ? est[v.kind] : 1); if (!(q > 0) || q > 100000) return 'كمية غير صالحة.'; if (!validDate(v.due)) return 'تاريخ غير صالح.';
      const s = { id: uid('su'), kind: v.kind, qty: r2(q), est: est && est[v.kind] ? est[v.kind] : null, due: v.due, note: String(v.note || '').trim().slice(0, 300), st: 'req', by: CUR.name, tm: nowIso(), log: [] };
      supList(j).push(s); supNotify(j, s, 'طلب ' + K[0], 'طلب ' + CUR.name + ' ' + K[0] + ': ' + s.qty + ' ' + K[1] + (s.est ? ' (المحسوب ' + s.est + ')' : '') + ' — مطلوب ' + s.due + (s.note ? '\n' + s.note : '') + '\nبانتظار اعتماد المهندس المخوّل أو مدير المشروع.', true);
      if (j.flow) flLog(j, j.stage, 'طلب ' + K[0] + ' ' + s.qty + ' ' + K[1]); audit(CUR.name, 'طلب توريد', K[0] + ' · ' + jobRef(j)); }, { ok: 'إرسال الطلب' }); },
  'sup-ok': (d) => { const j = DB.jobs.find((x) => x.id === d.id); const s = j && supById(j, d.k); if (!s || !canApproveSupply(j)) return toast('الاعتماد للمهندس المخوّل أو مدير المشروع.', 'err');
    const SP = (DB.suppliers || []).filter((x) => !x.kinds || !x.kinds.length || x.kinds.includes(s.kind));
    openForm('اعتماد ' + SUPPLY[s.kind][0] + ' وإسناد المورد', [{ k: 'sid', label: 'المورد المسجل', type: 'select', opts: [['', '— مورد جديد أو غير مسجل —']].concat(SP.map((x) => [x.id, x.name + ' · رقم ' + x.no])) }, { k: 'sname', label: 'اسم المورد (إن لم يكن مسجلاً)' }, { k: 'sno', label: 'رقم المورد', ltr: true }, { k: 'po', label: 'رقم أمر الشراء / التوريد', ltr: true }, { k: 'qty', label: 'الكمية المعتمدة', type: 'number', val: s.qty, ltr: true }], (v) => {
      let sp = SP.find((x) => x.id === v.sid); if (!sp && !v.sname.trim()) return 'اختر المورد أو اكتب اسمه.';
      if (!sp) { if (v.sno && !/^[A-Za-z0-9\-]{1,20}$/.test(v.sno.trim())) return 'رقم المورد غير صالح.'; sp = { id: uid('sp'), name: v.sname.trim().slice(0, 80), no: v.sno.trim(), kinds: [s.kind], phone: '' }; DB.suppliers = DB.suppliers || []; DB.suppliers.push(sp); }
      const q = +v.qty; if (!(q > 0)) return 'كمية غير صالحة.'; s.qty = r2(q); s.supplier = { id: sp.id, name: sp.name, no: sp.no }; s.po = String(v.po || '').trim().slice(0, 30); s.st = 'ord'; s.okBy = { by: CUR.name, role: CUR.role, tm: nowIso() };
      supNotify(j, s, 'اعتماد ' + SUPPLY[s.kind][0], 'اعتمد ' + CUR.name + ' ' + s.qty + ' ' + SUPPLY[s.kind][1] + ' من ' + sp.name + (sp.no ? ' (رقم ' + sp.no + ')' : '') + (s.po ? ' — أمر ' + s.po : '') + '\nعند الوصول: يستلم المراقب ويرفق الإيصال بالكمية الفعلية.', false);
      audit(CUR.name, 'اعتماد توريد', SUPPLY[s.kind][0] + ' · ' + sp.name + ' · ' + jobRef(j)); }, { ok: 'اعتماد' }); },
  'sup-rej': (d) => { const j = DB.jobs.find((x) => x.id === d.id); const s = j && supById(j, d.k); if (!s || !canApproveSupply(j)) return;
    openForm('رفض الطلب', [{ k: 'why', label: 'السبب', type: 'textarea', max: 200 }], (v) => { if (String(v.why || '').trim().length < 3) return 'اكتب السبب.'; s.st = 'rej'; s.rej = { by: CUR.name, why: v.why.trim().slice(0, 200), tm: nowIso() }; supNotify(j, s, 'رفض ' + SUPPLY[s.kind][0], 'رفض ' + CUR.name + ': ' + s.rej.why, false); audit(CUR.name, 'رفض توريد', jobRef(j)); }); },
  'sup-del': (d) => { const j = DB.jobs.find((x) => x.id === d.id); const s = j && supById(j, d.k); if (!s || !jobCanEdit(j)) return;
    openForm('استلام ' + SUPPLY[s.kind][0] + ' في الموقع', [{ k: 'dq', label: 'الكمية المستلمة فعلياً (' + SUPPLY[s.kind][1] + ')', type: 'number', val: s.qty, ltr: true }, { k: 'ticket', label: 'رقم الإيصال / بطاقة الوزن', ltr: true }, { k: 'files', label: 'صورة الإيصال وصور التوريد في الموقع', type: 'files', wide: true }, PLEDGE_FIELD], async (v) => {
      const q = +v.dq; if (!(q > 0)) return 'أدخل الكمية المستلمة.'; const F = (v.files || []).filter((f) => f && f.size); if (!F.length) return 'أرفق صورة الإيصال.'; if (!v.pledge) return PLEDGE_ERR;
      const ids = await flAttachMany(j, 'إيصال توريد — ' + SUPPLY[s.kind][0], F, 'supply'); if (typeof ids === 'string') return ids;
      s.dq = r2(q); s.ticket = String(v.ticket || '').trim().slice(0, 30); s.receipts = (s.receipts || []).concat(ids); s.st = 'del'; s.delBy = { by: CUR.name, tm: nowIso() };
      const base = s.est || s.qty; const dv = r2(((s.dq - base) / (base || 1)) * 100); const over = Math.abs(dv) > qcfg().tol;
      supNotify(j, s, (over ? 'فرق كمية ' : 'استلام ') + SUPPLY[s.kind][0], 'استلم ' + CUR.name + ' ' + s.dq + ' ' + SUPPLY[s.kind][1] + (s.ticket ? ' — إيصال ' + s.ticket : '') + ' من ' + (s.supplier ? s.supplier.name : '—') + '\nالمعتمد ' + s.qty + (s.est ? ' · المحسوب ' + s.est : '') + ' · الفرق ' + (dv > 0 ? '+' : '') + dv + '%' + (over ? '\nتجاوز حد التفاوت ' + qcfg().tol + '% — يلزم المراجعة.' : ''), true);
      if (over) notifyAdmins('فرق كمية توريد — ' + jobRef(j), SUPPLY[s.kind][0] + ': ' + s.dq + ' مقابل ' + base + ' (' + dv + '%)');
      if (j.flow) flLog(j, j.stage, 'استلام ' + SUPPLY[s.kind][0] + ' ' + s.dq + ' ' + SUPPLY[s.kind][1]); audit(CUR.name, 'استلام توريد مع إيصال', SUPPLY[s.kind][0] + ' · ' + jobRef(j)); }, { ok: 'تأكيد الاستلام' }); },
  'sup-close': (d) => { const j = DB.jobs.find((x) => x.id === d.id); const s = j && supById(j, d.k); if (!s || !canApproveSupply(j)) return; s.st = 'done'; s.closeBy = { by: CUR.name, tm: nowIso() }; audit(CUR.name, 'مطابقة توريد', SUPPLY[s.kind][0] + ' · ' + jobRef(j)); save(); render(); },
  'supl-add': () => { if (!CUR || !['admin', 'pm'].includes(CUR.role)) return toast('سجل الموردين لمدير المشروع أو مدير المنصة.', 'err');
    openForm('مورد جديد', [{ k: 'name', label: 'اسم المورد' }, { k: 'no', label: 'رقم المورد', ltr: true }, { k: 'phone', label: 'الجوال', ltr: true }, { k: 'kinds', label: 'المواد التي يوردها', type: 'checks', opts: Object.keys(SUPPLY).map((k) => [k, SUPPLY[k][0]]), val: [] }], (v) => {
      if (String(v.name || '').trim().length < 2) return 'اكتب اسم المورد.'; if (!/^[A-Za-z0-9\-]{1,20}$/.test(String(v.no || '').trim())) return 'أدخل رقم المورد (حروف لاتينية وأرقام).'; if (v.phone && !/^\+?\d{9,15}$/.test(v.phone.trim())) return 'رقم الجوال غير صالح.';
      DB.suppliers = DB.suppliers || []; if (DB.suppliers.some((x) => x.no === v.no.trim())) return 'رقم المورد مسجل مسبقاً.'; DB.suppliers.push({ id: uid('sp'), name: v.name.trim().slice(0, 80), no: v.no.trim(), phone: String(v.phone || '').replace(/\D/g, ''), kinds: v.kinds || [] }); audit(CUR.name, 'إضافة مورد', v.name.trim()); }); },
  'qty-cfg': () => { if (!need('settings')) return; const Q = qcfg();
    openForm('معاملات حساب الكميات', [['width', 'عرض الحفرية الافتراضي (م)'], ['depth', 'العمق الافتراضي (م)'], ['sandT', 'سماكة الرمل حول الكابل (م)'], ['concT', 'سماكة بلاطات الخرسانة (م)'], ['subT', 'سماكة الصبيز (م)'], ['overlap', 'زيادة القص لكل جانب في السفلتة (م)'], ['asphT', 'سماكة الأسفلت (م)'], ['density', 'كثافة الأسفلت (طن/م³)'], ['swell', 'معامل انتفاش ناتج الحفر'], ['tol', 'حد تفاوت الكميات المسموح (%)']].map((x) => ({ k: x[0], label: x[1], type: 'number', val: Q[x[0]], ltr: true })), (v) => {
      const o = {}; for (const k of Object.keys(QTY_DEF)) { const n = +v[k]; if (!(n >= 0) || n > 100) return 'قيمة غير صالحة: ' + k; o[k] = n; } cfg().qty = o; audit(CUR.name, 'تعديل معاملات الكميات', JSON.stringify(o)); }, { ok: 'حفظ', note: 'القيم الافتراضية تقريبية — طابقها مع جداول الكميات في العقد الموحد قبل الاعتماد.' }); }
};

// ---------- supply view ----------
function viewSupply() {
  const J = jobsV(); const rows = J.flatMap((j) => supList(j).map((s) => ({ j, s }))); const tab = UI.supTab || 'req';
  const flt = { req: (r) => r.s.st === 'req', run: (r) => ['ok', 'ord', 'del'].includes(r.s.st), all: () => true };
  const L = rows.filter(flt[tab] || flt.all).sort((a, b) => String(b.s.tm).localeCompare(a.s.tm));
  const over = rows.filter((r) => r.s.dq && Math.abs(((r.s.dq - (r.s.est || r.s.qty)) / ((r.s.est || r.s.qty) || 1)) * 100) > qcfg().tol);
  const asph = J.filter((j) => j.flow).map((j) => ({ j, e: qtyEstimate(j) })).filter((x) => x.e);
  const tot = (k) => r2(asph.reduce((a, x) => a + x.e[k], 0));
  return html`<div class="ph"><div><h1 style="font-size:28px">التوريد والمواد</h1><p>طلبات السلامة والإنارة والدفان والرمل والصبيز والخرسانة والأسفلت وإزالة المخلفات — من طلب المراقب إلى اعتماد المهندس ومدير المشروع، وإسناد المورد، وإيصال الموقع، ومطابقة الكمية مع المحسوب من طول الحفر.</p></div>
    <div class="row">${CUR && ['admin', 'pm'].includes(CUR.role) ? html`<button class="btn" type="button" data-act="supl-add">+ مورد</button>` : ''}${can('settings') ? html`<button class="btn" type="button" data-act="qty-cfg">معاملات الحساب</button>` : ''}</div></div>
  <div class="flkpi"><div class="flk"><span>بانتظار الاعتماد</span><b class="t-warn">${rows.filter(flt.req).length}</b></div><div class="flk"><span>قيد التوريد</span><b>${rows.filter(flt.run).length}</b></div><div class="flk"><span>فروق كميات</span><b class="t-bad">${over.length}</b></div><div class="flk"><span>أسفلت محسوب</span><b>${tot('asphalt')} طن</b></div><div class="flk"><span>دفان محسوب</span><b>${tot('backfill')} م³</b></div></div>
  <div class="tabs" role="tablist">${[['req', 'بانتظار الاعتماد'], ['run', 'قيد التوريد'], ['all', 'كل الطلبات'], ['qty', 'كميات المعاملات'], ['sup', 'الموردون']].map((t) => html`<button type="button" role="tab" aria-selected="${tab === t[0]}" data-act="sup-tab" data-k="${t[0]}">${t[1]}</button>`)}</div>
  ${tab === 'sup' ? html`<div class="card">${(DB.suppliers || []).length ? html`<div class="tblw"><table><thead><tr><th>رقم المورد</th><th>المورد</th><th>المواد</th><th>الطلبات</th></tr></thead><tbody>${(DB.suppliers || []).map((x) => html`<tr><td class="ltr"><b>${x.no}</b></td><td>${x.name}</td><td>${(x.kinds || []).map((k) => SUPPLY[k] ? SUPPLY[k][0] : k).join('، ') || '—'}</td><td>${rows.filter((r) => r.s.supplier && r.s.supplier.id === x.id).length}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">لا موردين مسجلين بعد.</p>`}</div>`
  : tab === 'qty' ? html`<div class="card"><div class="tblw"><table class="qtbl"><thead><tr><th>المعاملة</th><th>الفرقة</th><th>الطول م</th><th>دفان م³</th><th>رمل م³</th><th>صبيز م³</th><th>خرسانة م³</th><th>أسفلت طن</th><th>مخلفات م³</th></tr></thead><tbody>${asph.map((x) => html`<tr><td><button type="button" class="lnk" data-act="fl-goto" data-id="${x.j.id}">${x.j.uid || x.j.baseNo}</button></td><td>${x.j.crewId || '—'}</td><td class="ltr">${x.e.L}</td>${['backfill', 'sand', 'subbase', 'concrete', 'asphalt', 'waste'].map((k) => { const t = supTotals(x.j, k); return html`<td class="ltr">${x.e[k]}${t.del ? html`<div class="t-mut" style="font-size:11px">وُرِّد ${t.del}</div>` : ''}</td>`; })}</tr>`)}
      <tr class="tot"><td colspan="2"><b>الإجمالي</b></td><td class="ltr"><b>${tot('L')}</b></td>${['backfill', 'sand', 'subbase', 'concrete', 'asphalt', 'waste'].map((k) => html`<td class="ltr"><b>${tot(k)}</b></td>`)}</tr></tbody></table></div>
      <p class="t-mut" style="font-size:12px">تُحسب تلقائياً من طول الحفر وعرضه وعمقه في بيانات كل معاملة. كمية الأسفلت = الطول × (العرض + زيادة القص للجانبين) × السماكة × الكثافة. راجع المعاملات من «معاملات الحساب» لتطابق العقد الموحد.</p></div>`
  : html`<div class="card">${L.length ? html`<ul class="hsel">${L.map(({ j, s }) => html`<li class="${s.st === 'req' ? 'warn' : s.st === 'rej' ? 'bad' : 'info'}"><span><button type="button" class="lnk" data-act="${j.flow ? 'fl-goto' : 'task-open'}" data-id="${j.id}">${jobRef(j)}</button> · <b>${SUPPLY[s.kind][0]}</b> ${s.qty} ${SUPPLY[s.kind][1]}${s.supplier ? ' · ' + s.supplier.name + ' (' + s.supplier.no + ')' : ''}${s.dq ? ' · وُرِّد ' + s.dq : ''}<small class="t-mut" style="display:block">${j.crewId || '—'} · طلبه ${s.by} ${ago(s.tm)}</small></span><span class="row" style="gap:4px"><span class="pill ${SUP_ST[s.st][1]}">${SUP_ST[s.st][0]}</span>${supActions(j, s)}</span></li>`)}</ul>` : html`<p class="empty">لا طلبات في هذا التصنيف.</p>`}</div>`}`;
}
SUPPLY_ACT['sup-tab'] = (d) => { UI.supTab = d.k; render(); };

// ---------- sortable lists (drag handle; mouse, touch and keyboard) ----------
const SORTABLE = {
  jobs: (from, to, after) => { if (!need('edit')) return false; return moveIn(DB.jobs, (j) => j.id, from, to, after); },
  prov: (from, to, after) => { if (!need('settings')) return false; return moveIn(cfg().providers, (p) => p.id, from, to, after); },
  logos: () => true // handled by index in sortCommit
};
function moveIn(arr, key, from, to, after) {
  const ks = arr.map(key); const i = ks.indexOf(from); let k = ks.indexOf(to); if (i < 0 || k < 0 || i === k) return false;
  const [it] = arr.splice(i, 1); k = arr.map(key).indexOf(to); if (k < 0) k = arr.length; arr.splice(after ? k + 1 : k, 0, it); return true;
}
// logos are keyed by index, recompute after the splice
function sortCommit(list, from, to, after) { const f = SORTABLE[list]; if (!f) return; if (list === 'logos') { const L = cfg().brand.logos; const i = +from, k = +to; if (!need('settings') || isNaN(i) || isNaN(k) || i === k) return; const [it] = L.splice(i, 1); L.splice(after ? (k > i ? k : k + 1) : (k > i ? k - 1 : k), 0, it); const p = L.findIndex((l) => l.primary); if (p > 0) L.unshift(L.splice(p, 1)[0]); save(); render(); return; } if (f(from, to, after)) { save(); render(); } }
const grip = (list, id, label) => html`<button type="button" class="grip" data-grip="${list}" data-id="${id}" aria-label="${label || 'إعادة الترتيب'} — اسحب أو استخدم الأسهم" title="اسحب لإعادة الترتيب">${new Safe('<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>')}</button>`;
function sortWire() {
  let S = null;
  const items = (list) => Array.from(document.querySelectorAll('[data-sort="' + list + '"]'));
  document.addEventListener('pointerdown', (e) => {
    const g = e.target.closest && e.target.closest('[data-grip]'); if (!g || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const it = g.closest('[data-sort]'); if (!it) return; e.preventDefault();
    S = { list: g.dataset.grip, id: g.dataset.id, el: it, y: e.clientY, x: e.clientX, on: false, pid: e.pointerId, target: null, after: false };
    try { g.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
  });
  document.addEventListener('pointermove', (e) => {
    if (!S || e.pointerId !== S.pid) return; if (!S.on && Math.hypot(e.clientX - S.x, e.clientY - S.y) < 6) return; S.on = true; S.el.classList.add('sorting');
    const over = document.elementFromPoint(e.clientX, e.clientY); const t = over && over.closest && over.closest('[data-sort="' + S.list + '"]');
    items(S.list).forEach((x) => x.classList.remove('drop-before', 'drop-after')); if (!t || t === S.el) { S.target = null; return; }
    const r = t.getBoundingClientRect(); const horiz = getComputedStyle(t.parentElement).flexDirection.startsWith('row'); const after = horiz ? (document.dir === 'rtl' ? e.clientX < r.left + r.width / 2 : e.clientX > r.left + r.width / 2) : e.clientY > r.top + r.height / 2;
    t.classList.add(after ? 'drop-after' : 'drop-before'); S.target = t.dataset.id; S.after = after;
  });
  const end = (e) => { if (!S || (e && e.pointerId !== S.pid)) return; const s = S; S = null; items(s.list).forEach((x) => x.classList.remove('drop-before', 'drop-after', 'sorting')); if (s.on && s.target) sortCommit(s.list, s.id, s.target, s.after); };
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
  document.addEventListener('keydown', (e) => {
    const g = e.target.closest && e.target.closest('[data-grip]'); if (!g || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault();
    const L = items(g.dataset.grip); const i = L.findIndex((x) => x.dataset.id === g.dataset.id); const back = e.key === 'ArrowUp' || e.key === (document.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft'); const n = L[i + (back ? -1 : 1)]; if (!n) return;
    sortCommit(g.dataset.grip, g.dataset.id, n.dataset.id, !back); const ng = document.querySelector('[data-grip="' + g.dataset.grip + '"][data-id="' + (g.dataset.grip === 'logos' ? String(i + (back ? -1 : 1)) : g.dataset.id) + '"]'); if (ng) ng.focus();
  });
}

function supplyMigrate(d) { d.suppliers = d.suppliers || []; d.jobs.forEach((j) => { if (j.assignedTo === undefined) j.assignedTo = j.crewId || ''; }); return d; }
Object.assign(FL_ACT, SUPPLY_ACT);
