// ================================================================
// Module: access rules — who sees and who edits (cards, transactions, contacts)
//   • Team cards: platform admin, operations manager, HR, project manager, and each engineer for his
//     own crews only. Editing a card: admin / HR / project manager in scope; an engineer edits only the
//     supervisor and the people under him in his crews (never another engineer's card).
//   • Moving a person to a crew of another engineer hands the renewal / file-update right to the new
//     engineer; the move is recorded on the person (xfer) and the old engineer loses access.
//   • Transactions: civil engineers see their crews' transactions and those they worked on; electrical
//     engineers see transactions assigned to them (elecEng) and their own crews'. Editing needs the
//     transaction to be in the user's current tree, or a time-limited grant approved by the project
//     manager / platform admin (access requests).
//   • Contacts (iqama, phones, WhatsApp) are hidden until the user presses «بيانات التواصل».
// The same rules are enforced by the server (server/index.js: viewState / guardState).
// ================================================================
Object.assign(ROLE_INFO, { hr: ['إدارة الموارد البشرية', 'كل بطاقات الفريق ومستنداتهم وتأهيلهم — دون تعديل الفرق أو المعاملات'] });
ROLE_PERMS.hr = ['cards', 'request', 'ai', 'audit'];
const ENG_SPEC = { civil: 'مهندس مدني', elec: 'مهندس كهرباء' };
const userSpec = (u) => ((u || CUR || {}).scope || {}).spec || '';

// ---------- supervisors numbered per office ----------
const officeName = (b) => 'مكتب ' + String(b || '—').replace(/^\s*(فرع|مكتب)\s+/, '');
function supTag(c) {
  if (!c) return '';
  const same = DB.crews.filter((x) => x.branch === c.branch && x.sup && x.sup.name).sort((a, b) => a.id.localeCompare(b.id));
  const n = Math.max(1, same.findIndex((x) => x.id === c.id) + 1); const t = TYPES[c.type] ? TYPES[c.type][0] : '';
  return 'مراقب ' + t + ' ' + n + ' · ' + officeName(c.branch);
}
// what to show beside a name in selects and lists — never the iqama
function personTag(e) {
  const l = e && empLink(e); if (!l) return (e && e.job) || '';
  if (l.role === 'مراقب') return supTag(l.crew);
  if (l.role === 'مهندس') return 'مهندس · ' + officeName(l.crew.branch);
  return (e.job || l.role) + ' · ' + l.crew.id;
}

// ---------- team cards ----------
const canSeeCards = () => !!CUR && ['admin', 'ops', 'hr', 'pm', 'eng'].includes(CUR.role);
function cardEditable(e) {
  if (!CUR || !e || !can('cards')) return false;
  if (CUR.role === 'admin' || CUR.role === 'hr') return true;
  if (CUR.role === 'pm') return empInScope(e);
  if (CUR.role === 'eng') { const l = empLink(e); return !!l && crewInScope(l.crew) && l.role !== 'مهندس'; }
  return false;
}
function markTransfer(people, src, dst) {
  if (!src || !dst || personIs(src.eng || {}, dst.eng || {})) return;
  people.filter(Boolean).forEach((p) => { const e = (p.empId && empById(p.empId)) || empByIqama(p.iqama); if (!e) return;
    e.xfer = { from: src.id, fromEng: src.eng ? src.eng.name : '', to: dst.id, toEng: dst.eng ? dst.eng.name : '', tm: nowIso(), by: CUR.name }; });
  DB.notifs = DB.notifs || [];
  DB.notifs.unshift({ id: uid('n'), tm: nowIso(), title: 'نقل بين مهندسين', body: 'نُقل أفراد من ' + src.id + ' (' + (src.eng ? src.eng.name : '—') + ') إلى ' + dst.id + ' (' + (dst.eng ? dst.eng.name : '—') + '). صلاحية تجديد البطاقات وتحديث الملفات انتقلت إلى المهندس الجديد.', to: 'eng' });
}

// ---------- transactions ----------
function jobGrant(j, u) { u = u || CUR; const g = j.grants && j.grants[u && u.id]; return !!g && g > nowIso(); }
function jobCanEdit(j, u) {
  u = u || CUR; if (!u || !j) return false;
  if (u.role === 'ops' || u.role === 'hr' || u.role === 'viewer') return false;
  if (scopeAll(u)) return true;
  if (jobGrant(j, u)) return true;
  if (u.role === 'eng' && userSpec(u) === 'elec' && j.elecEng && personIs(j.elecEng, u)) return true;
  if (j.crewId) { const c = crewById(j.crewId); if (c) return crewInScope(c, u); }
  return (u.role === 'pm' || (u.role === 'eng' && userSpec(u) !== 'elec')) && !!j.office && myOffices(u).includes(j.office);
}
function jobVisible(j, u) {
  u = u || CUR; if (!u || !j) return false; if (scopeAll(u) || u.role === 'hr') return true;
  if (jobCanEdit(j, u)) return true;
  if ((j.editors || []).includes(u.id)) return true;
  return !!(j.accessReq || []).find((r) => r.uid === u.id);
}
function jobTouch(j) { if (!j || !CUR) return; j.editors = (j.editors || []).filter((x) => x !== CUR.id); j.editors.unshift(CUR.id); j.editors.length = Math.min(j.editors.length, 20); }
function flLockBox(j) {
  if (!j || jobCanEdit(j)) return '';
  const mine = (j.accessReq || []).find((r) => r.uid === CUR.id && r.st === 'pending');
  const c = crewById(j.crewId);
  return html`<p class="alert wr" role="status" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span style="flex:1;min-width:200px"><b>للعرض فقط.</b> ${c ? 'المعاملة الآن لدى ' + c.id + (c.eng ? ' (' + c.eng.name + ')' : '') + '. ' : ''}التعديل بعد موافقة مدير المشروع أو مدير المنصة.</span>
    ${mine ? html`<span class="pill info">طلبك قيد المراجعة</span>` : CUR.role === 'eng' || CUR.role === 'sup' || CUR.role === 'pm' ? html`<button class="btn sm" type="button" data-act="fl-access-req" data-id="${j.id}">طلب صلاحية تعديل</button>` : ''}</p>`;
}
function accessReqs() { return DB.jobs.flatMap((j) => (j.accessReq || []).filter((r) => r.st === 'pending').map((r) => ({ j, r }))).filter((x) => scopeAll() || jobCanEdit(x.j)); }
function flAccessPanel() {
  if (!CUR || !['admin', 'pm'].includes(CUR.role)) return ''; const L = accessReqs(); if (!L.length) return '';
  return html`<div class="card"><h3 style="font-size:16px">طلبات صلاحية التعديل · ${L.length}</h3><ul class="nb">${L.map((x) => html`<li><span><b>${x.r.name}</b> يطلب تعديل <button type="button" class="lnk" data-act="fl-goto" data-id="${x.j.id}">${x.j.uid || x.j.baseNo}</button>${x.r.note ? ' — ' + x.r.note : ''} <span class="t-mut">· ${ago(x.r.tm)}</span></span>
    <span class="row" style="gap:6px"><button class="btn sm pri" type="button" data-act="fl-access-ok" data-id="${x.j.id}" data-k="${x.r.uid}">موافقة 72 ساعة</button><button class="btn sm" type="button" data-act="fl-access-no" data-id="${x.j.id}" data-k="${x.r.uid}">رفض</button></span></li>`)}</ul></div>`;
}
const ACCESS_ACT = {
  'fl-access-req': (d) => { const j = DB.jobs.find((x) => x.id === d.id); if (!j || !jobVisible(j) || jobCanEdit(j)) return;
    openForm('طلب صلاحية تعديل — ' + (j.uid || j.baseNo), [{ k: 'note', label: 'سبب الطلب', type: 'textarea', max: 300 }], (v) => { const note = String(v.note || '').trim(); if (note.length < 5) return 'اكتب سبب الطلب.';
      j.accessReq = (j.accessReq || []).filter((r) => r.uid !== CUR.id); j.accessReq.push({ uid: CUR.id, name: CUR.name, note: note.slice(0, 300), tm: nowIso(), st: 'pending' });
      DB.notifs = DB.notifs || []; DB.notifs.unshift({ id: uid('n'), tm: nowIso(), title: 'طلب صلاحية تعديل', body: CUR.name + ' يطلب تعديل ' + (j.uid || j.baseNo) + ': ' + note.slice(0, 120), to: 'pm' });
      audit(CUR.name, 'طلب صلاحية تعديل', (j.uid || j.baseNo)); toast('أُرسل الطلب لمدير المشروع ومدير المنصة.'); }, { ok: 'إرسال الطلب' }); },
  'fl-access-ok': (d) => { if (!CUR || !['admin', 'pm'].includes(CUR.role)) return need('users'); const j = DB.jobs.find((x) => x.id === d.id); if (!j || !(scopeAll() || jobCanEdit(j))) return; const r = (j.accessReq || []).find((x) => x.uid === d.k && x.st === 'pending'); if (!r) return;
    r.st = 'ok'; r.by = CUR.name; r.at = nowIso(); j.grants = j.grants || {}; j.grants[r.uid] = new Date(Date.now() + 72 * 3600e3).toISOString(); if (j.flow) flLog(j, j.stage, 'منح صلاحية تعديل مؤقتة لـ ' + r.name);
    audit(CUR.name, 'منح صلاحية تعديل', r.name + ' · ' + (j.uid || j.baseNo)); save(); toast('مُنح ' + r.name + ' صلاحية التعديل 72 ساعة.'); render(); },
  'fl-access-no': (d) => { if (!CUR || !['admin', 'pm'].includes(CUR.role)) return need('users'); const j = DB.jobs.find((x) => x.id === d.id); if (!j) return; const r = (j.accessReq || []).find((x) => x.uid === d.k && x.st === 'pending'); if (!r) return;
    r.st = 'no'; r.by = CUR.name; r.at = nowIso(); audit(CUR.name, 'رفض صلاحية تعديل', r.name + ' · ' + (j.uid || j.baseNo)); save(); render(); },
  'reveal': (d) => { UI.reveal = UI.reveal || {}; UI.reveal[d.k] = !UI.reveal[d.k]; if (UI.reveal[d.k]) audit(CUR.name, 'عرض بيانات التواصل', d.n || d.k); render(); },
  'eq-show': () => { const on = !UI.layers.eq; Object.assign(UI.layers, { eq: on, drivers: on, dynas: on, cars: on }); try { localStorage.setItem('maydan_eq', on ? '1' : '0'); } catch (e) { /* private mode */ } render(); },
  'demo-as': (d) => { if (!DEMO) return; const u = DB.users.find((x) => x.id === d.k); if (!u) return; CUR = u; if (UI.view === 'cards' && !canSeeCards()) UI.view = 'dash'; toast('تجربة المنصة بصلاحية: ' + ROLES[u.role] + (userSpec(u) ? ' (' + ENG_SPEC[userSpec(u)] + ')' : '')); render(); }
};
Object.assign(FL_ACT, ACCESS_ACT);

// contacts hidden until asked
const revealed = (k) => !!(UI.reveal && UI.reveal[k]);
function contactBtn(k, name) { return html`<button type="button" class="btn sm ghost rv" data-act="reveal" data-k="${k}" data-n="${name || ''}" aria-expanded="${revealed(k)}">${revealed(k) ? 'إخفاء البيانات' : 'بيانات التواصل'}</button>`; }
function contactRow(k, p) {
  if (!p || !revealed(k)) return '';
  return html`<div class="rvbox">${p.iqama ? html`<span>الإقامة <b class="ltr">${p.iqama}</b></span>` : ''}${p.phone ? html`<span>الجوال <b class="ltr">+${p.phone}</b></span><a class="lnk w" href="${safeUrl(wa(p.phone))}" target="_blank" rel="noopener noreferrer">واتساب</a><a class="lnk t" href="${safeUrl(tg(p.phone))}" target="_blank" rel="noopener noreferrer">تليجرام</a>` : ''}${!p.iqama && !p.phone ? html`<span class="t-mut">لا بيانات تواصل مسجلة.</span>` : ''}</div>`;
}
function demoSwitcher() {
  if (!DEMO) return '';
  return html`<label class="demo-as"><span>تجربة بصلاحية</span><select class="in" data-change="demo-as" aria-label="تجربة المنصة بصلاحية مستخدم آخر">${DB.users.map((u) => html`<option value="${u.id}" ${CUR && CUR.id === u.id ? new Safe('selected') : ''}>${ROLES[u.role]}${userSpec(u) ? ' (' + ENG_SPEC[userSpec(u)] + ')' : ''} — ${u.name}</option>`)}</select></label>`;
}
