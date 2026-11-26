// ================================================================
// Module: field transactions — views, actions and demo data
// Views: flow board (دورة المعاملات) · cluster map (خريطة الكلاستر)
//        coordination inbox (مركز التنسيق) · reports & returns (البلاغات) · team cards (بطاقات الفريق)
// ================================================================

const FL_COLORS = { plan: '#64748B', gate: '#B91C1C', safety: '#D97706', dig: '#C2410C', elec: '#1D4ED8', asphalt: '#334155', lab: '#7C3AED', pdc: '#0F766E', ripc: '#4338CA', closed: '#15803D' };
const FL_KIND_ICON = { coord: 'تنسيق', safety: 'سلامة', hse: 'HSE', elec: 'كهرباء', asphalt: 'أسفلت', lab: 'مختبر', permit: 'رخص', gate: 'بوابة', report: 'بلاغ', fwd: 'للمراقبين' };
let CMAP = null;

function flKpis() {
  const J = flJobs().filter(jobInScope).filter(flActive); const tm = addDays(1);
  return [['معاملات نشطة', J.length, 'info'], ['أعمال الغد', J.filter((j) => j.date === tm).length, 'warn'], ['بانتظار الرخصة', J.filter((j) => flIdx(j) <= flPath(j).indexOf('gate') && !flGateOk(j) && daysTo(j.date) <= 2).length, 'bad'],
    ['رخص < 5 أيام', J.filter((j) => j.permit && flPermitDays(j) !== null && flPermitDays(j) < 5).length, 'bad'], ['رخص < 14 يوماً', J.filter((j) => j.permit && flPermitDays(j) !== null && flPermitDays(j) >= 5 && flPermitDays(j) < 14).length, 'warn'], ['تنبيهات جديدة', DB.inbox.filter((i) => i.st === 'new').length, 'warn'], ['بلاغات مفتوحة', DB.reports.filter((r) => r.st !== 'resolved').length, 'warn']];
}
function flKpiRow() { return html`<div class="flkpi">${flKpis().map((k) => html`<div class="flk"><span>${k[0]}</span><b class="${k[1] ? 't-' + k[2] : ''}">${k[1]}</b></div>`)}</div>`; }
function flTicket(j) {
  const g = flGateLabel(j); const cl = UI.flSel === j.id ? ' on' : '';
  const dr = can('edit') && jobCanEdit(j) && j.stage !== 'closed' ? new Safe(' draggable="true" data-drag="fl"') : '';
  return html`<button type="button" class="flcard${cl}" data-act="fl-open" data-id="${j.id}"${dr} style="--sc:${FL_COLORS[j.stage]}">
    <span class="row between" style="gap:6px"><b class="ltr">${j.uid || j.baseNo || j.id}</b>${flPermitChip(j)}</span>
    <span class="flk-t">${j.kind}</span><span class="t-mut ltr" style="font-size:11px;text-align:start">${[j.baseNo, j.woNo ? 'WO ' + j.woNo : '', j.sapNo ? 'SAP ' + j.sapNo : ''].filter(Boolean).join(' · ')}</span>
    <span class="t-mut" style="font-size:12px">${j.district || '—'} · ${j.office || ''} · ${fmtD(j.date)}</span>
    <span class="row" style="gap:6px"><span class="pill ${g[1]}">${g[0]}</span>${j.lengthM ? html`<span class="pill mutp">${j.lengthM} م</span>` : ''}</span></button>`;
}
function viewFlow() {
  const off = UI.flOff || ''; const q = String(UI.flQ || '').trim().toLowerCase(); const dq = UI.flDist || '';
  const J = flJobs().filter(jobInScope).filter((j) => (!off || j.office === off) && (!dq || j.district === dq) && (!q || [j.uid, j.baseNo, j.txNo, j.permit, j.woNo, j.sapNo, j.district, j.kind].join(' ').toLowerCase().includes(q))).sort((a, b) => a.date.localeCompare(b.date));
  const dists = [...new Set(flJobs().filter(jobInScope).map((j) => j.district).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
  const sel = UI.flSel && DB.jobs.find((x) => x.id === UI.flSel);
  return html`<div class="ph"><div><h1 style="font-size:28px">دورة المعاملات الميدانية</h1><p>كل معاملة سجل واحد يتحرك بين المراحل: الرخصة ← السلامة ← الحفر ← الكهرباء ← الأسفلت ← المختبر ← الاستشاري ← المركز. كل انتقال يرسل تنبيهاً للمسؤول التالي برقم الرخصة وتاريخ انتهائها.</p></div>
    <div class="row">${can('edit') ? html`<button class="btn pri" type="button" data-act="fl-add">+ معاملة ميدانية</button>` : ''}<button class="btn" type="button" data-act="nav" data-v="permits">تقرير الرخص الحرجة</button><button class="btn" type="button" data-act="nav" data-v="cluster">خريطة الكلاستر</button></div></div>
  ${flKpiRow()}
  <div class="chips" role="group" aria-label="المكتب"><button type="button" class="chip" data-act="fl-off" data-k="" aria-pressed="${!off}">كل المكاتب</button>${DB.lists.offices.map((o) => html`<button type="button" class="chip" data-act="fl-off" data-k="${o}" aria-pressed="${off === o}">${o}</button>`)}</div>
  <div class="row flfilter"><input class="in" type="search" style="flex:1 1 240px;max-width:340px" placeholder="بحث بالمعرّف أو الأساس أو الرخصة أو أمر العمل أو SAP" value="${UI.flQ || ''}" data-input="fl-q" aria-label="بحث في المعاملات">
    <select class="in" style="flex:0 1 220px" data-change="fl-dist" aria-label="تصفية حسب الحي"><option value="">كل الأحياء (${dists.length})</option>${dists.map((x) => html`<option value="${x}" ${dq === x ? new Safe('selected') : ''}>${x} — ${districtArea(x) || 'أُضيف يدوياً'}</option>`)}</select>
    ${permitLegend()}<span class="t-mut" style="font-size:12px">اسحب البطاقة إلى المرحلة التالية لإنهاء المرحلة الحالية.</span></div>
  ${flAccessPanel()}
  ${sel ? flDetail(sel) : ''}
  <div class="board" aria-label="لوحة المراحل">${FL_FULL.map((s) => { const L = J.filter((j) => j.stage === s); return html`<section class="col" data-drop="fl" data-k="${s}"><h3 style="--sc:${FL_COLORS[s]}"><span>${FL_STAGES[s][0]}</span><span class="badge-n">${L.length}</span></h3>${L.length ? L.map(flTicket) : html`<p class="t-mut" style="font-size:12px;margin:6px">—</p>`}</section>`; })}</div>`;
}
function flStepper(j) {
  const P = flPath(j); const i = flIdx(j);
  return html`<ol class="stepper">${P.map((s, k) => html`<li class="${k < i ? 'done' : k === i ? 'cur' : ''}" style="--sc:${FL_COLORS[s]}"><b>${FL_STAGES[s][0]}</b><span>${FL_STAGES[s][1]}</span></li>`)}</ol>`;
}
function flStageActions(j) {
  const E = can('edit') && jobCanEdit(j); const s = j.stage; const nx = flNext(j); const nxN = nx ? FL_STAGES[nx][0] : '';
  if (!E) return html`<p class="t-mut">عرض فقط.</p>`;
  if (s === 'plan') return html`<div class="row"><button class="btn" type="button" data-act="fl-coord" data-id="${j.id}">إرسال تنبيه التنسيق الآن</button><button class="btn pri" type="button" data-act="fl-adv" data-id="${j.id}">الانتقال إلى ${nxN}</button></div>`;
  if (s === 'gate') {
    const g = flGateLabel(j);
    return html`<div class="gatebox"><p><b>لا يبدأ التنفيذ دون إرفاق صورة الرخصة أو التعهد.</b> يمكن للمهندس التجاوز بمبرر، على أن تُرفق الرخصة لاحقاً قبل موعد محدد.</p>
      <div class="row"><span class="pill ${g[1]}">${g[0]}</span></div>
      <div class="row"><button class="btn" type="button" data-act="fl-gate" data-id="${j.id}" data-k="permit">إرفاق صورة الرخصة</button><button class="btn" type="button" data-act="fl-gate" data-id="${j.id}" data-k="undertaking">إرفاق التعهد</button><button class="btn" type="button" data-act="fl-gate" data-id="${j.id}" data-k="override" style="color:var(--warn-tx)">تجاوز المهندس (إرفاق لاحقاً)</button></div>
      <div class="row"><button class="btn pri" type="button" data-act="fl-adv" data-id="${j.id}" ${flGateOk(j) ? '' : new Safe('aria-disabled="true"')}>الانتقال إلى ${nxN}</button></div></div>`;
  }
  if (s === 'safety') {
    const crew = crewById(j.crewId); const q = crew ? flCrewQual(crew) : [];
    return html`<div class="gatebox"><p><b>قبل الحفر:</b> توريد ${j.safety.barrier || 'صبات خرسانية'} وإنارة LED ولوحات تحذيرية، وفحص السلامة والصحة المهنية لتأهيل المراقب والعمالة.</p>
      <div class="row"><span class="pill ${j.safety.delivered ? 'ok' : 'warn'}">${j.safety.delivered ? 'تم التوريد والتأمين' : 'بانتظار التوريد'}</span><span class="pill ${j.safety.hse ? 'ok' : 'warn'}">${j.safety.hse ? 'اعتُمد فحص HSE' : 'بانتظار فحص HSE'}</span>${flNav(j) ? html`<a class="btn sm" href="${flNav(j)}" target="_blank" rel="noopener noreferrer">ملاحة فريق السلامة</a>` : ''}</div>
      ${q.length ? html`<details><summary>ملاحظات تأهيل الفرقة (${q.length})</summary><ul class="t-mut" style="font-size:13px">${q.map((x) => html`<li>${x}</li>`)}</ul></details>` : html`<p class="t-ok" style="font-size:13px">بطاقات الفرقة سليمة.</p>`}
      <div class="row"><button class="btn" type="button" data-act="fl-safety" data-id="${j.id}" data-k="req">إعادة إرسال طلب التوريد</button><button class="btn" type="button" data-act="fl-safety" data-id="${j.id}" data-k="delivered">تأكيد التوريد في الموقع</button><button class="btn" type="button" data-act="fl-safety" data-id="${j.id}" data-k="hse">اعتماد فحص HSE</button>
      <button class="btn pri" type="button" data-act="fl-adv" data-id="${j.id}" ${j.safety.delivered && j.safety.hse ? '' : new Safe('aria-disabled="true"')}>بدء ${nxN}</button></div></div>`;
  }
  if (s === 'lab') return html`<div class="row"><button class="btn pri" type="button" data-act="fl-adv" data-id="${j.id}">ناجح — رفع للاستشاري</button><button class="btn" type="button" data-act="fl-ret" data-id="${j.id}" data-k="lab" style="color:var(--red)">راسب — إعادة سفلتة</button></div>`;
  if (s === 'pdc') return html`<div class="row"><span class="pill ${j.pdc && daysTo(j.pdc.due) <= 10 ? 'bad' : 'info'}">مهلة الاستشاري: ${j.pdc ? daysTo(j.pdc.due) + ' يوم' : '—'}</span><button class="btn pri" type="button" data-act="fl-adv" data-id="${j.id}">قبول الاستشاري — رفع للمركز</button><button class="btn" type="button" data-act="fl-ret" data-id="${j.id}" data-k="pdc" style="color:var(--red)">إعادة من الاستشاري</button></div>`;
  if (s === 'ripc') return html`<div class="row"><button class="btn pri" type="button" data-act="fl-adv" data-id="${j.id}">قبول المركز — إغلاق نهائي</button><button class="btn" type="button" data-act="fl-ret" data-id="${j.id}" data-k="ripc" style="color:var(--red)">إعادة من المركز</button></div>`;
  if (s === 'closed') return html`<p class="t-ok">أُغلقت المعاملة نهائياً.</p>`;
  return html`<div class="row"><button class="btn pri" type="button" data-act="fl-adv" data-id="${j.id}">إنهاء «${FL_STAGES[s][0]}» والانتقال إلى ${nxN}</button></div>`;
}
function flDetail(j) {
  const nb = flNeighbors(j, cfg().flow.r2); const docs = DB.docs.filter((d) => d.taskId === j.id); const crew = crewById(j.crewId);
  const gf = gwOn() && gcfg().jobFolders && gcfg().jobFolders[j.id];
  return html`<article class="card fldetail" style="--sc:${FL_COLORS[j.stage]}"><div class="row between"><div><h2 style="font-size:20px">${j.kind} — ${j.district || ''}</h2>
      <p class="t-mut ltr" style="margin:4px 0 0;text-align:start"><b>${j.uid || ''}</b> · ${flFolderName(j)}</p></div>
      <div class="row">${flPermitChip(j)}${jobCanEdit(j) ? html`<button class="btn sm" type="button" data-act="fl-edit" data-id="${j.id}">تعديل</button>` : ''}<a class="btn sm wa" href="${wa('', '«ميدان» — ' + flJobText(j) + (flNav(j) ? '\nالموقع: ' + flPin(j) : ''))}" target="_blank" rel="noopener noreferrer">واتساب</a>${flNav(j) ? html`<a class="btn sm" href="${flNav(j)}" target="_blank" rel="noopener noreferrer">الملاحة</a>` : ''}<button class="btn sm" type="button" data-act="fl-close-detail">إغلاق</button></div></div>
    ${flLockBox(j)}${j.elecEng ? html`<p class="t-mut" style="font-size:13px;margin:0">مهندس الكهرباء المسؤول: <b>${j.elecEng.name}</b></p>` : ''}
    ${flStepper(j)}
    <div class="grid g2"><div class="flkv"><span>المكتب</span><b>${j.office || '—'}</b><span>الحي</span><b>${j.district || '—'}</b><span>المحطة / المخطط / القطعة</span><b>${[j.station, j.plan, j.plot].filter(Boolean).join(' / ') || '—'}</b><span>التاريخ</span><b>${j.date}</b><span>طول الحفر</span><b>${j.lengthM ? j.lengthM + ' م' : '—'}</b><span>الفرقة</span><b>${crew ? crew.id + ' · ' + crew.sup.name : '—'}</b></div>
      <div class="flkv"><span>المعرّف الموحّد</span><b class="ltr">${j.uid || '—'} <span class="t-mut">(${FL_CATS[flCatOf(j)][0]})</span></b><span>أمر العمل / SAP</span><b class="ltr">${j.woNo || '—'} / ${j.sapNo || '—'}</b><span>رقم الأساس</span><b class="ltr">${j.baseNo || '—'}</b><span>رقم المعاملة</span><b class="ltr">${j.txNo || '—'}</b><span>الرخصة</span><b>${flPermitLine(j)}</b><span>بوابة الرخصة</span><b>${flGateLabel(j)[0]}</b>
        <span>مجلد Drive</span><b>${gf ? html`<a href="${'https://drive.google.com/drive/folders/' + gf.id}" target="_blank" rel="noopener noreferrer">فتح مجلد «${flFolderName(j)}»</a>` : gwOn() ? html`<button class="btn sm" type="button" data-act="fl-folder" data-id="${j.id}">إنشاء مجلد المعاملة</button>` : html`<span class="t-mut">يُنشأ عند الربط مع Google Drive</span>`}</b></div></div>
    ${flStageActions(j)}
    ${flQaBox(j)}
    ${flHseBox(j)}
    ${j.gate && j.gate.mode === 'override' && !j.gate.fileId ? html`<p class="alert wr">تجاوز بواسطة ${j.gate.by}: ${j.gate.reason} — يجب إرفاق الرخصة قبل ${j.gate.due}. <button class="btn sm" type="button" data-act="fl-gate" data-id="${j.id}" data-k="late">إرفاق الرخصة الآن</button></p>` : ''}
    <div class="grid g2"><div><h3 style="font-size:15px">المعاملات القريبة (${nb.length}) — نطاق ${cfg().flow.r2} كم</h3>${nb.length ? html`<ul class="nb">${nb.map((x) => html`<li><button type="button" class="lnk" data-act="fl-open" data-id="${x.o.id}">${x.o.baseNo || x.o.id} — ${x.o.kind}</button><span class="t-mut">${x.o.district} · ${x.o.date}${x.dist != null ? ' · ' + x.dist.toFixed(1) + ' كم' : ''} · ${x.why.join('، ')}</span></li>`)}</ul>` : html`<p class="t-mut">لا توجد معاملات قريبة.</p>`}</div>
      <div><h3 style="font-size:15px">المستندات (${docs.length})</h3>${docs.length ? html`<ul class="nb">${docs.map((d) => html`<li><span>${d.type} — <span class="ltr">${d.fileName || d.title}</span>${d.geo ? html` <a class="pill ok" href="${'https://www.google.com/maps?q=' + d.geo.lat + ',' + d.geo.lng}" target="_blank" rel="noopener noreferrer" title="دقة ${d.geo.acc} م">GPS</a>` : ''}</span>${d.fileId ? html`<button class="btn sm" type="button" data-act="doc-file" data-id="${d.id}">تنزيل</button>` : ''}</li>`)}</ul>` : html`<p class="t-mut">لا مستندات بعد.</p>`}</div></div>
    <details><summary>سجل المعاملة (${j.log.length})</summary><ul class="nb">${j.log.slice(0, 30).map((l) => html`<li><span>${fmtT(l.tm)} · ${FL_STAGES[l.stage] ? FL_STAGES[l.stage][0] : l.stage}</span><span class="t-mut">${l.by}${l.note ? ' — ' + l.note : ''}</span></li>`)}</ul></details></article>`;
}

// ---------- cluster map ----------
function flClusterList() {
  const d = UI.flDay || 'week'; const off = UI.flOff || ''; const tm = addDays(1);
  const J = flJobs().filter(jobInScope).filter((j) => flActive(j) && (!off || j.office === off) && (d === 'all' || (d === 'tomorrow' ? j.date === tm : daysTo(j.date) >= -1 && daysTo(j.date) <= 7)));
  return { J, C: flClusters(J, UI.flRad || cfg().flow.clusterKm) };
}
function viewCluster() {
  const { J, C } = flClusterList(); const sv = flSavings(C); const rad = UI.flRad || cfg().flow.clusterKm; const d = UI.flDay || 'week';
  return html`<div class="ph"><div><h1 style="font-size:28px">خريطة الكلاستر والنطاق الجغرافي</h1><p>تجميع المعاملات المتقاربة حسب المسافة والحي والمحطة والمخطط، لتنسيق السلامة والمعدات والمراقبين والسفلتة مرة واحدة. الإحداثيات في البيانات التجريبية تقريبية للعرض.</p></div></div>
  <div class="row"><div class="chips" role="group" aria-label="نطاق التجميع">${[1, 2, 5].map((r) => html`<button type="button" class="chip" data-act="fl-rad" data-k="${r}" aria-pressed="${rad === r}">${r} كم</button>`)}</div>
    <div class="chips" role="group" aria-label="الفترة">${[['tomorrow', 'الغد'], ['week', 'هذا الأسبوع'], ['all', 'الكل']].map((x) => html`<button type="button" class="chip" data-act="fl-day" data-k="${x[0]}" aria-pressed="${d === x[0]}">${x[1]}</button>`)}</div>
    <div class="chips" role="group" aria-label="المكتب"><button type="button" class="chip" data-act="fl-off" data-k="" aria-pressed="${!UI.flOff}">كل المكاتب</button>${DB.lists.offices.map((o) => html`<button type="button" class="chip" data-act="fl-off" data-k="${o}" aria-pressed="${UI.flOff === o}">${o}</button>`)}</div></div>
  <div class="flkpi"><div class="flk"><span>معاملات في الفترة</span><b>${J.length}</b></div><div class="flk"><span>كلاسترات</span><b>${C.length}</b></div><div class="flk"><span>كلاسترات متعددة</span><b class="t-warn">${C.filter((c) => c.jobs.length > 1).length}</b></div><div class="flk"><span>زيارات يمكن توفيرها</span><b class="t-ok">${sv.trips}</b></div><div class="flk"><span>وفر تقديري</span><b class="t-ok">${sv.sar.toLocaleString('en')} ر.س</b></div></div>
  <div class="clwrap"><div class="card" style="padding:0;overflow:hidden"><div id="cmap" class="cmap" role="region" aria-label="خريطة الكلاستر"></div>
    <div class="row" style="padding:10px 14px;font-size:12px;gap:12px">${FL_FULL.filter((s) => s !== 'closed').map((s) => html`<span class="row" style="gap:4px"><i class="dot" style="background:${FL_COLORS[s]}"></i>${FL_STAGES[s][0]}</span>`)}</div></div>
    <div class="cllist">${C.map((c, i) => html`<article class="card clcard ${c.jobs.length > 1 ? 'multi' : ''}"><div class="row between"><b>كلاستر ${i + 1} — ${c.district}</b><span class="pill ${c.jobs.length > 1 ? 'warn' : 'mutp'}">${c.jobs.length} معاملة</span></div>
      <span class="t-mut" style="font-size:12px">${c.offices.join('، ')} · ${c.meters} م حفر · نصف قطر ${c.rad.toFixed(1)} كم</span>
      <ul class="nb">${c.jobs.map((j) => html`<li><button type="button" class="lnk" data-act="fl-open" data-id="${j.id}">${j.baseNo || j.id} — ${j.kind}</button><span class="t-mut">${j.date} · ${FL_STAGES[j.stage][0]}</span></li>`)}</ul>
      ${c.jobs.length > 1 && can('notify') ? html`<button class="btn sm pri" type="button" data-act="fl-cl-coord" data-i="${i}">إرسال تنسيق موحّد للمهندسين</button>` : ''}</article>`)}${C.length ? '' : html`<p class="t-mut">لا توجد معاملات في هذه الفترة.</p>`}</div></div>
  <div class="card"><div class="row between"><h2 style="font-size:17px">التحليل الذكي للتنسيق</h2><button class="btn pri" type="button" data-act="fl-ai" ${UI.flAi && UI.flAi.busy ? new Safe('disabled') : ''}>${UI.flAi && UI.flAi.busy ? 'جارٍ التحليل…' : 'حلّل خطة الأسبوع'}</button></div>
    ${UI.flAi && UI.flAi.text ? html`<div class="aiout">${UI.flAi.text}</div><p class="t-mut" style="font-size:12px">المصدر: ${UI.flAi.via}</p>` : html`<p class="t-mut">يقترح ترتيب التنفيذ لكل كلاستر، وتوحيد توريد السلامة والإنارة، وتسلسل الكهرباء ثم السفلتة قبل انتهاء الرخص. يعمل بمزودي الذكاء الاصطناعي المجانيين (OpenRouter وGroq وGemini) أو بتحليل محلي.</p>`}</div>`;
}
function flMountCluster() {
  const el = $('#cmap'); if (!el) return;
  if (!window.L) { el.innerHTML = html`<p class="t-mut" style="padding:20px">تعذّر تحميل الخريطة. القائمة على اليمين تعرض الكلاسترات نفسها.</p>`.s; return; }
  const { J, C } = flClusterList();
  CMAP = L.map(el, { zoomControl: true });
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
  const key = mapsKey(); if (key) googleLayers(key).then((g) => { if (!CMAP) return; (g ? (UI.mapType === 'satellite' ? g.satellite : g.roadmap) : osm).addTo(CMAP); }); else osm.addTo(CMAP);
  C.forEach((c, i) => { const multi = c.jobs.length > 1; L.circle([c.lat, c.lng], { radius: c.rad * 1000, color: multi ? '#C2410C' : '#64748B', weight: multi ? 2 : 1, dashArray: multi ? '' : '4 6', fillOpacity: multi ? 0.12 : 0.04 }).addTo(CMAP).bindTooltip(tr('كلاستر') + ' ' + (i + 1) + ' · ' + c.district + ' · ' + c.jobs.length, { permanent: multi, direction: 'top' }); });
  J.forEach((j) => { if (!flHasXY(j)) return; const on = UI.flSel === j.id; const m = L.circleMarker([j.lat, j.lng], { radius: on ? 10 : 7, color: '#fff', weight: 2, fillColor: FL_COLORS[j.stage], fillOpacity: 1 }).addTo(CMAP); m.bindTooltip((j.baseNo || j.id) + ' · ' + j.kind + ' · ' + j.date); m.on('click', () => { UI.flSel = j.id; render(); }); });
  const s = UI.flSel && DB.jobs.find((x) => x.id === UI.flSel);
  if (s && flHasXY(s)) [cfg().flow.r1, cfg().flow.r2].forEach((r) => L.circle([s.lat, s.lng], { radius: r * 1000, color: '#1D4ED8', weight: 1.5, dashArray: '6 6', fill: false }).addTo(CMAP).bindTooltip(r + ' كم'));
  const pts = J.filter(flHasXY).map((j) => [j.lat, j.lng]);
  if (s && flHasXY(s)) CMAP.setView([s.lat, s.lng], 12); else if (pts.length) CMAP.fitBounds(L.latLngBounds(pts).pad(0.15)); else CMAP.setView([24.75, 46.72], 11);
}
async function flAi() {
  const { J, C } = flClusterList(); UI.flAi = { busy: true, text: '', via: '' }; render();
  const data = { radiusKm: UI.flRad || cfg().flow.clusterKm, clusters: C.map((c, i) => ({ n: i + 1, district: c.district, offices: c.offices, meters: c.meters, jobs: c.jobs.map((j) => ({ base: j.baseNo, kind: j.kind, date: j.date, stage: FL_STAGES[j.stage][0], permit: j.permit, permitExpires: j.permitExp, gate: flGateLabel(j)[0] })) })) };
  const sys = 'أنت مخطط عمليات لمقاول شبكات كهرباء في الرياض. أعطِ خطة تنسيق عملية بالعربية في نقاط قصيرة: لكل كلاستر ترتيب التنفيذ، توحيد توريد السلامة والإنارة، تسلسل الكهرباء ثم السفلتة، الرخص المعرضة للانتهاء أو بلا إرفاق، وتقدير الوفر. لا تختلق بيانات.';
  const a = await aiChat([{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify(data).slice(0, 20000) }]);
  if (a) { UI.flAi = { busy: false, text: a.text.slice(0, 6000), via: a.via }; audit(CUR.name, 'تحليل ذكي للتنسيق', a.via); }
  else {
    const lines = C.filter((c) => c.jobs.length > 1).map((c, i) => { const J2 = c.jobs.slice().sort((x, y) => x.date.localeCompare(y.date)); const risk = J2.filter((j) => !flGateOk(j) || (flPermitDays(j) !== null && flPermitDays(j) <= 3)); return '• كلاستر ' + (i + 1) + ' (' + c.district + '): نفّذ بالترتيب ' + J2.map((j) => (j.baseNo || j.id) + ' ' + j.date).join(' ← ') + '. ورّد السلامة والإنارة مرة واحدة لـ ' + c.meters + ' م، ونسّق السفلتة بعد آخر تمديد.' + (risk.length ? ' انتبه: ' + risk.map((j) => (j.baseNo || j.id) + ' (' + (!flGateOk(j) ? 'بلا رخصة مرفقة' : 'الرخصة تنتهي خلال ' + flPermitDays(j) + ' يوم') + ')').join('، ') + '.' : ''); });
    const sv = flSavings(C); UI.flAi = { busy: false, text: (lines.length ? lines.join('\n') : 'لا توجد كلاسترات متعددة في هذه الفترة.') + '\nالوفر التقديري: ' + sv.trips + ' زيارة ≈ ' + sv.sar.toLocaleString('en') + ' ر.س.', via: 'تحليل محلي داخل المنصة (لا يوجد مزود ذكاء اصطناعي مضبوط)' };
  }
  render();
}

// ---------- coordination inbox ----------
function viewInbox() {
  const rf = UI.inRole || ''; const sf = UI.inSt || 'open';
  const L = DB.inbox.filter(inboxInScope).filter((i) => (!rf || i.roles.includes(rf) || (rf.startsWith('sup') && i.kind === 'fwd')) && (sf === 'all' || (sf === 'open' ? i.st !== 'done' : i.st === sf)));
  const cnt = (r) => DB.inbox.filter((i) => i.st !== 'done' && (i.roles.includes(r) || (r.startsWith('sup') && i.kind === 'fwd'))).length;
  return html`<div class="ph"><div><h1 style="font-size:28px">مركز التنسيق والتنبيهات</h1><p>توجيه آلي لكل تنبيه إلى المسؤول بالاسم والجوال: قسم الرخص، مهندسو المدني والكهرباء، الأسفلت، السلامة، HSE، والمختبر. المهندس يحوّل التنبيه للمراقبين بضغطة.</p></div><div class="row"><button class="btn" type="button" data-act="fl-tick">تشغيل الفحص المجدول الآن</button></div></div>
  <div class="chips" role="group" aria-label="المستلم"><button type="button" class="chip" data-act="in-role" data-k="" aria-pressed="${!rf}">الكل</button>${Object.keys(FL_ROLES).map((r) => html`<button type="button" class="chip" data-act="in-role" data-k="${r}" aria-pressed="${rf === r}">${FL_ROLES[r]}${cnt(r) ? ' (' + cnt(r) + ')' : ''}</button>`)}</div>
  <div class="chips" role="group" aria-label="الحالة">${[['open', 'المفتوحة'], ['fwd', 'المحوّلة للمراقبين'], ['done', 'المعالجة'], ['all', 'الكل']].map((x) => html`<button type="button" class="chip" data-act="in-st" data-k="${x[0]}" aria-pressed="${sf === x[0]}">${x[1]}</button>`)}</div>
  <div class="inbox">${L.slice(0, 120).map((i) => html`<article class="card initem ${i.st}"><div class="row between"><div class="row" style="gap:8px"><span class="pill ${i.kind === 'coord' ? 'warn' : i.kind === 'permit' || i.kind === 'gate' || i.kind === 'report' ? 'bad' : 'info'}">${FL_KIND_ICON[i.kind] || i.kind}</span><b>${i.title}</b></div><span class="t-mut" style="font-size:12px">${fmtT(i.tm)}</span></div>
    <p class="inbody">${i.body}</p>
    <div class="row" style="gap:6px">${i.to.map((p) => html`<span class="who-chip">${p.name}<a class="lnk w" href="${wa(p.phone, flWaText(i))}" target="_blank" rel="noopener noreferrer" aria-label="واتساب ${p.name}">واتساب ${p.name}</a></span>`)}${i.to.length ? '' : html`<span class="t-mut">لم يُحدَّد مسؤول لهذا الدور — أضفه في جدول المسؤوليات.</span>`}</div>
    <div class="row">${i.fwdRole && i.st === 'new' && can('notify') ? html`<button class="btn sm pri" type="button" data-act="fl-fwd" data-id="${i.id}">تحويل للمراقبين</button>` : ''}${i.st === 'fwd' ? html`<span class="pill ok">حُوِّل إلى: ${i.fwd.join('، ')}</span>` : ''}${i.jobIds.length ? html`<button class="btn sm" type="button" data-act="fl-goto" data-id="${i.jobIds[0]}">فتح المعاملة</button>` : ''}${i.nav ? html`<a class="btn sm" href="${i.nav}" target="_blank" rel="noopener noreferrer">الملاحة</a>` : ''}${i.st !== 'done' ? html`<button class="btn sm" type="button" data-act="fl-done" data-id="${i.id}">تمت المعالجة</button>` : ''}</div></article>`)}${L.length ? '' : html`<p class="t-mut">لا تنبيهات.</p>`}</div>
  <div class="card"><div class="row between"><h2 style="font-size:17px">جدول المسؤوليات والتوجيه</h2>${can('settings') ? html`<button class="btn sm" type="button" data-act="fl-ro" data-id="">+ مسؤول</button>` : ''}</div>
    <div class="tblw"><table><thead><tr><th scope="col">الدور</th><th scope="col">الاسم</th><th scope="col">المكاتب</th><th scope="col">الجوال</th><th scope="col">إجراء</th></tr></thead><tbody>${DB.roster.map((p) => html`<tr><td>${FL_ROLES[p.role] || p.role}</td><td>${p.name}</td><td>${p.offices.length ? p.offices.join('، ') : 'كل المكاتب'}</td><td class="ltr">${p.phone || '—'}</td><td>${can('settings') ? html`<button class="btn sm" type="button" data-act="fl-ro" data-id="${p.id}">تعديل</button>` : ''}</td></tr>`)}</tbody></table></div></div>`;
}

// ---------- reports & returns ----------
function viewReports() {
  const kf = UI.repK || ''; const L = DB.reports.filter((r) => scopeAll() || (r.jobId ? jobInScope(DB.jobs.find((j) => j.id === r.jobId) || {}) : can('notify'))).filter((r) => !kf || r.kind === kf).sort((a, b) => (a.st === 'resolved') - (b.st === 'resolved') || a.due.localeCompare(b.due));
  return html`<div class="ph"><div><h1 style="font-size:28px">البلاغات والمعادات</h1><p>معالجة المعاد من المختبر URS والاستشاري PDC ومركز المشاريع RIPC، وبلاغات البلدية 940 ومخالفات المركز، مع عدّاد المهلة والتوجيه للأسفلت أو المختبر أو التنفيذ المدني.</p></div>${can('edit') ? html`<button class="btn pri" type="button" data-act="fl-rep" data-id="">+ بلاغ / معاد</button>` : ''}</div>
  <div class="flkpi">${Object.keys(FL_REPORT_KINDS).map((k) => html`<button type="button" class="flk ${kf === k ? 'on' : ''}" data-act="rep-k" data-k="${kf === k ? '' : k}"><span>${FL_REPORT_KINDS[k][0]}</span><b>${DB.reports.filter((r) => r.kind === k && r.st !== 'resolved').length}</b></button>`)}</div>
  <div class="tblw"><table><thead><tr><th scope="col">النوع</th><th scope="col">الأساس / الرخصة</th><th scope="col">الحي</th><th scope="col">الملاحظة</th><th scope="col">المهلة</th><th scope="col">الحالة</th><th scope="col">توجيه</th></tr></thead><tbody>
  ${L.map((r) => { const dl = daysTo(r.due); return html`<tr><td>${r.kindName}</td><td class="ltr">${[r.baseNo, r.permit].filter(Boolean).join(' / ') || '—'}</td><td>${r.district || '—'}</td><td style="max-width:320px">${r.reason ? html`<b>${r.reason}</b><br>` : ''}${r.note || ''}${r.labNo || r.consultant ? html`<div class="t-mut" style="font-size:12px">${[r.labNo ? 'تقرير المختبر ' + r.labNo + (r.labType ? ' (' + r.labType + ')' : '') : '', r.consultant ? 'الاستشاري: ' + r.consultant + (r.consultantName ? ' — ' + r.consultantName : '') : ''].filter(Boolean).join(' · ')}</div>` : ''}${(r.files || []).length ? html`<div class="row" style="gap:4px;margin-top:4px">${r.files.map((fid, i) => html`<button class="btn sm" type="button" data-act="doc-file" data-id="${fid}">مرفق ${i + 1}</button>`)}</div>` : ''}</td>
    <td><span class="pill ${r.st === 'resolved' ? 'mutp' : dl < 0 ? 'bad' : dl <= 3 ? 'warn' : 'info'}">${r.st === 'resolved' ? '—' : dl < 0 ? 'متأخر ' + -dl + ' يوم' : dl + ' يوم'}</span></td>
    <td><span class="pill ${r.st === 'resolved' ? 'ok' : r.st === 'routed' ? 'info' : 'warn'}">${r.st === 'resolved' ? 'تمت المعالجة' : r.st === 'routed' ? 'موجّه: ' + (FL_ROLES[r.to] || '') : 'مفتوح'}</span></td>
    <td><div class="row" style="gap:4px">${r.st !== 'resolved' && can('edit') ? html`${['asphalt', 'lab', 'civil'].map((t) => html`<button class="btn sm" type="button" data-act="fl-rep-to" data-id="${r.id}" data-k="${t}">${FL_ROLES[t]}</button>`)}<button class="btn sm" type="button" data-act="fl-rep-done" data-id="${r.id}">تمت</button>` : ''}${r.jobId ? html`<button class="btn sm" type="button" data-act="fl-goto" data-id="${r.jobId}">المعاملة</button>` : ''}</div></td></tr>`; })}</tbody></table></div>${L.length ? '' : html`<p class="t-mut">لا بلاغات.</p>`}`;
}

// ---------- team cards (slider) ----------
const PHOTO_DOC = 'الصورة الشخصية';
const FL_CARD_DOCS = ['صورة الإقامة', 'كارت الأمن الصناعي', 'شهادة TUV', 'رخصة القيادة', 'كارت التأمين الطبي'];
function viewCards() {
  const q = (UI.cardQ || '').trim(); const E = (DB.employees || []).filter(empInScope).filter((e) => !q || (e.name + ' ' + e.iqama + ' ' + (e.job || '')).includes(q));
  const grp = { 'المهندسون والمراقبون': [], 'السائقون والمشغلون': [], 'العمال والفنيون': [], 'غير مربوطين بفرقة': [] };
  E.forEach((e) => { const l = empLink(e); if (l && (l.role === 'مهندس' || l.role === 'مراقب')) grp['المهندسون والمراقبون'].push(e); else if (isDriverEmp(e) || /مشغل|operator/i.test(e.job || '')) grp['السائقون والمشغلون'].push(e); else if (l) grp['العمال والفنيون'].push(e); else grp['غير مربوطين بفرقة'].push(e); });
  return html`<div class="ph"><div><h1 style="font-size:28px">بطاقات الفريق</h1><p>بطاقة لكل عامل ومراقب وسائق: صورة الإقامة، كارت الأمن الصناعي، شهادة TUV للمشغلين والسائقين، الرخصة، والتأمين — بتواريخ الانتهاء. تُحفظ الصور في Google Drive عند الربط.</p></div>
    <input class="in" type="search" placeholder="بحث بالاسم أو الإقامة أو المهنة" aria-label="بحث في البطاقات" data-input="card-q" value="${q}" style="max-width:320px"></div>
  ${Object.keys(grp).filter((k) => grp[k].length).map((k) => html`<section class="cardsec"><h2 style="font-size:17px">${k} <span class="t-mut">(${grp[k].length})</span></h2><div class="slider" tabindex="0" aria-label="${k}">${grp[k].slice(0, 60).map(flPersonCard)}</div></section>`)}
  ${E.length ? '' : html`<p class="t-mut">لا موظفين. استورد سجل الموظفين من الإعدادات.</p>`}`;
}
function flPersonCard(e) {
  const l = empLink(e); const iq = (e.docs || {})['صورة الإقامة']; const E = cardEditable(e); const rk = 'e-' + e.id;
  const st = FL_CARD_DOCS.map((t) => empDocState(e, t)); const bad = st.filter((x) => x.lvl === 'bad' || x.lvl === 'miss').length;
  return html`<article class="pcard" aria-label="${e.name}">
    <header class="pc-head">${(() => { const ph = (e.docs || {})[PHOTO_DOC]; const fid = (ph && ph.fileId) || (iq && iq.fileId); const inner = html`${fid ? html`<img alt="صورة ${e.name}" data-thumb="${fid}" class="pc-img">` : ''}<span class="pc-ini" aria-hidden="true">${new Safe('<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>')}</span>${E ? html`<i class="pc-cam" aria-hidden="true">${new Safe('<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.2"/></svg>')}</i>` : ''}`;
      return E ? html`<button type="button" class="pc-av" data-act="card-photo" data-id="${e.id}" aria-label="${fid ? 'تغيير' : 'إضافة'} صورة ${e.name}" title="${fid ? 'تغيير الصورة' : 'إضافة صورة شخصية'}">${inner}</button>` : html`<span class="pc-av">${inner}</span>`; })()}
      <div class="pc-id"><b title="${e.name}">${triName(e.name)}</b><span>${l && l.role === 'مراقب' ? supTag(l.crew) : e.job || '—'}</span><span class="pc-st ${bad ? 'bad' : 'ok'}">${bad ? bad + ' يحتاج إجراء' : 'مكتمل'}</span></div></header>
    <dl class="pc-meta"><div><dt>الفرقة</dt><dd>${l ? l.crew.id + ' · ' + l.role : '—'}</dd></div><div><dt>المهندس المسؤول</dt><dd>${l && l.crew.eng ? l.crew.eng.name : '—'}</dd></div></dl>
    <div class="row" style="gap:6px">${contactBtn(rk, e.name)}${E ? '' : html`<span class="pill mutp" title="التعديل للمهندس المسؤول عن الفرقة أو الموارد البشرية أو مدير المشروع">عرض فقط</span>`}</div>${contactRow(rk, { iqama: e.iqama, phone: e.phone })}
    ${e.xfer ? html`<p class="pc-xfer">نُقل من ${e.xfer.from}${e.xfer.fromEng ? ' (' + e.xfer.fromEng + ')' : ''} إلى ${e.xfer.to}${e.xfer.toEng ? ' (' + e.xfer.toEng + ')' : ''} · ${fmtD(e.xfer.tm.slice(0, 10))}. صلاحية التجديد وتحديث الملفات لدى المهندس الجديد.</p>` : ''}
    <ul class="pc-docs">${FL_CARD_DOCS.map((t, k) => { const s = st[k]; const d = s.d || {};
      return html`<li class="${s.lvl}"><i class="pc-dot" aria-hidden="true"></i><span class="pc-t">${t}</span><span class="pc-v">${s.lvl === 'na' ? 'غير مطلوب' : s.lvl === 'miss' ? 'غير مرفق' : d.exp ? (s.lvl === 'bad' ? 'منتهية ' : '') + d.exp : 'مرفق'}</span>
        <span class="pc-a">${d.fileId ? html`<button type="button" class="ib" data-act="emp-doc-file" data-id="${e.id}" data-k="${t}" aria-label="تنزيل ${t}" title="تنزيل">${new Safe('<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14"/></svg>')}</button>` : ''}${E && s.lvl !== 'na' ? html`<button type="button" class="ib" data-act="card-doc" data-id="${e.id}" data-k="${t}" aria-label="${d.fileId || d.exp ? 'تحديث' : 'رفع'} ${t}" title="${d.fileId || d.exp ? 'تحديث' : 'رفع'}">${new Safe('<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20V9m0 0l-4 4m4-4l4 4M5 4h14"/></svg>')}</button>` : ''}</span></li>`; })}</ul>
    ${E ? html`<button class="btn sm pc-edit" type="button" data-act="emp-edit" data-id="${e.id}">تعديل البيانات والملاحظات</button>` : ''}</article>`;
}
async function flThumbs() {
  for (const img of document.querySelectorAll('img[data-thumb]')) {
    if (img.dataset.done) continue; img.dataset.done = '1';
    try { const b = await fileGet(img.dataset.thumb); if (!b || !/^image\//.test(b.type)) { img.remove(); continue; } const fr = new FileReader(); fr.onload = () => { if (/^data:image\/(png|jpeg|webp);base64,/.test(fr.result)) { img.src = fr.result; img.classList.add('ok'); } }; fr.readAsDataURL(b); } catch (e) { img.remove(); }
  }
}

// ---------- render hooks ----------
function flBeforeRender() { if (CMAP) { CMAP.remove(); CMAP = null; } }
function flAfterRender() {
  if (CUR && FL_TICKED !== today() && DB.roster) { FL_TICKED = today(); if (flTick()) setTimeout(render, 0); }
  if (UI.view === 'cluster') flMountCluster();
  if (UI.view === 'cards') flThumbs();
}

// ---------- forms ----------
function flJobFields(j) {
  j = j || {};
  return [{ k: 'kind', label: 'نوع العمل', type: 'select', list: 'flKinds', val: j.kind || 'حفر مفتوح لتركيب ميني بيلر' }, { k: 'office', label: 'المكتب', type: 'select', list: 'offices', val: j.office || DB.lists.offices[0] },
    { k: 'cat', label: 'تصنيف المعرّف الموحّد', type: 'select', opts: [['', 'تلقائي حسب نوع العمل']].concat(Object.keys(FL_CATS).map((c) => [c, c + ' — ' + FL_CATS[c][0]])), val: j.cat && j.cat !== (FL_KIND_CAT[j.kind] || 'C') ? j.cat : '', hint: j.uid ? 'المعرّف الحالي ' + j.uid : 'يُولَّد بصيغة CAT-YY-XXXX' },
    { k: 'woNo', label: 'رقم أمر العمل', ltr: true, val: j.woNo || '', ph: '802xxxxxxx' }, { k: 'sapNo', label: 'رقم SAP', ltr: true, val: j.sapNo || '' },
    { k: 'baseNo', label: 'رقم الأساس', ltr: true, val: j.baseNo || '', ph: 'R6661' }, { k: 'txNo', label: 'رقم المعاملة / السكيم', ltr: true, val: j.txNo || '' },
    { k: 'permit', label: 'رقم الرخصة', ltr: true, val: j.permit || '' }, { k: 'permitType', label: 'نوع الرخصة', type: 'select', opts: [['اعتيادي', 'ترخيص اعتيادي'], ['طارئ', 'ترخيص طارئ (10 أيام)']], val: j.permitType || 'اعتيادي' },
    { k: 'permitExp', label: 'تاريخ انتهاء الرخصة', type: 'date', val: j.permitExp || '' }, { k: 'date', label: 'تاريخ التنفيذ', type: 'date', val: j.date || addDays(1) },
    { k: 'district', label: 'الحي (ابحث في أحياء الرياض)', type: 'combo', opts: districtOpts(), val: j.district || '', hint: 'اختر من القائمة أو اكتب حياً جديداً فيُضاف' }, { k: 'station', label: 'المحطة', val: j.station || '' }, { k: 'plan', label: 'المخطط', val: j.plan || '' }, { k: 'plot', label: 'القطعة', val: j.plot || '' },
    { k: 'lat', label: 'خط العرض', type: 'number', val: j.lat || '', ltr: true, hint: 'إن تُرك فارغاً يُملأ بمركز الحي تقريبياً' }, { k: 'lng', label: 'خط الطول', type: 'number', val: j.lng || '', ltr: true },
    { k: 'lengthM', label: 'طول الحفر (م)', type: 'number', val: j.lengthM || '' }, { k: 'depthM', label: 'عمق الحفر (م)', type: 'number', val: j.depthM || '', hint: 'أكثر من 1.5 م يتطلب تدعيماً وسلّماً' }, { k: 'barrier', label: 'نوع الصبات', type: 'select', opts: [['صبات خرسانية', 'صبات خرسانية'], ['صبات بلاستيكية', 'صبات بلاستيكية']], val: (j.safety && j.safety.barrier) || 'صبات خرسانية' },
    { k: 'elecEng', label: 'مهندس الكهرباء المسؤول (يرى المعاملة ويعدّلها)', type: 'select', opts: [['', '— بدون —']].concat(DB.users.filter((u) => u.role === 'eng' && userSpec(u) === 'elec').map((u) => [u.id, u.name])), val: (DB.users.find((u) => j.elecEng && personIs(j.elecEng, u)) || {}).id || '' },
    { k: 'crewId', label: 'الفرقة المنفذة', type: 'select', opts: [['', '— بدون —']].concat(DB.crews.map((c) => [c.id, c.id + ' · ' + (TYPES[c.type] ? TYPES[c.type][0] : '') + ' · ' + c.sup.name])), val: j.crewId || '' },
    { k: 'note', label: 'ملاحظات', type: 'textarea', val: j.note || '' }];
}
function flApply(j, v) {
  const oldCat = j.uid ? flCatOf(j) : '';
  ['kind', 'office', 'baseNo', 'txNo', 'permit', 'permitType', 'permitExp', 'date', 'district', 'station', 'plan', 'plot', 'crewId', 'note', 'woNo', 'sapNo'].forEach((k) => { j[k] = String(v[k] || '').trim().slice(0, 200); });
  j.district = rememberDistrict(j.district);
  { const eu = DB.users.find((u) => u.id === v.elecEng && u.role === 'eng'); j.elecEng = eu ? { name: eu.name, iqama: eu.iqama || '', phone: eu.phone || '' } : null; }
  jobTouch(j);
  j.lat = parseFloat(v.lat) || 0; j.lng = parseFloat(v.lng) || 0; j.lengthM = Math.max(0, Math.round(+v.lengthM || 0)); j.depthM = Math.max(0, Math.min(20, Math.round((+v.depthM || 0) * 10) / 10));
  if (!flHasXY(j) && DISTRICT_XY[j.district]) { j.lat = DISTRICT_XY[j.district][0]; j.lng = DISTRICT_XY[j.district][1]; j.xyApprox = true; } else if (v.lat) j.xyApprox = false;
  j.cat = FL_CATS[v.cat] ? v.cat : ''; const nc = flCatOf(j); flEnsureUid(j, !!oldCat && oldCat !== nc);
  j.safety = j.safety || {}; j.safety.barrier = v.barrier || 'صبات خرسانية';
  j.title = j.kind + ' — ' + j.district + (j.baseNo ? ' (' + j.baseNo + ')' : ''); j.site = j.district;
}
function flValidate(v) {
  if (!v.kind || !String(v.district || '').trim()) return 'نوع العمل والحي مطلوبان.';
  if (v.woNo && !/^\d{6,12}$/.test(String(v.woNo).trim())) return 'رقم أمر العمل أرقام فقط (6 إلى 12 رقماً).';
  if (v.sapNo && !/^\d{6,12}$/.test(String(v.sapNo).trim())) return 'رقم SAP أرقام فقط (6 إلى 12 رقماً).';
  if (v.baseNo && !/^[A-Za-z]{0,3}\d{3,10}$/.test(String(v.baseNo).trim())) return 'رقم الأساس بصيغة حرف ثم أرقام، مثل R6661.';
  if (v.permit && !/^[A-Za-z0-9\-\/]{3,20}$/.test(String(v.permit).trim())) return 'رقم الرخصة غير صالح.';
  if (v.permit && !v.permitExp) return 'أدخل تاريخ انتهاء الرخصة لتحديد لونها وحالتها.';
  if (v.lat && !(+v.lat > 16 && +v.lat < 33)) return 'خط العرض خارج المملكة.';
  if (v.lng && !(+v.lng > 34 && +v.lng < 56)) return 'خط الطول خارج المملكة.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date || '')) return 'تاريخ التنفيذ مطلوب.';
  return '';
}
async function flAttach(j, kind, file, o) {
  if (!file || !file.size) return 'اختر ملفاً.'; if (file.size > 10 * 1024 * 1024) return 'الملف أكبر من 10 ميجابايت.'; if (!ALLOWED_FILES[file.type] || /officedocument/.test(file.type)) return 'المسموح: صورة أو PDF.';
  o = o || {}; const stage = o.stage || j.stage; const name = flDocName(j, stage, file.name);
  let blob = file; try { blob = new File([file], name, { type: file.type }); } catch (e) { /* old browsers: keep the original name on the blob */ }
  const doc = { id: uid('d'), type: kind, title: kind + ' — ' + flFolderName(j), crewId: j.crewId, taskId: j.id, workType: '', person: CUR.name, exp: kind === 'تصريح' ? j.permitExp || '' : '', url: '', fileId: uid('f'), fileName: name, orig: safeName(file.name), mime: file.type, stage, geo: o.geo || null, size: file.size, form: null, tm: nowIso(), by: CUR.name };
  try { await filePut(doc.fileId, blob, j.id); } catch (e) { return 'تعذّر حفظ الملف.'; }
  DB.docs.unshift(doc); return doc;
}

const FL_ACT = {
  'card-photo': (d) => {
    const e = empById(d.id); if (!e || !need('cards')) return; if (!cardEditable(e)) return toast('تحديث الصورة للمهندس المسؤول عن الفرقة أو الموارد البشرية أو مدير المشروع.', 'err');
    openForm('الصورة الشخصية — ' + e.name, [{ k: 'file', label: 'صورة واضحة للوجه (JPG أو PNG أو WebP، حتى 5 ميجابايت)', type: 'file', capture: true, wide: true }], async (v) => {
      const f = v.file && v.file.size ? v.file : null; if (!f) return 'اختر صورة.'; if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return 'المسموح: صورة JPG أو PNG أو WebP.'; if (f.size > 5 * 1024 * 1024) return 'الصورة أكبر من 5 ميجابايت.';
      const cur = (e.docs || {})[PHOTO_DOC] || {}; const x = { fileId: uid('f'), fileName: safeName(f.name), size: f.size, type: f.type, tm: nowIso(), by: CUR.name };
      try { await filePut(x.fileId, f); } catch (err) { return 'تعذّر حفظ الصورة.'; } if (cur.fileId) fileDel(cur.fileId);
      e.docs = e.docs || {}; e.docs[PHOTO_DOC] = x; audit(CUR.name, 'تحديث الصورة الشخصية', e.name); toast('حُفظت صورة ' + e.name + '.');
    }, { ok: 'حفظ الصورة' });
  },
  'card-doc': (d) => {
    const e = empById(d.id); if (!e || !need('cards')) return; if (!cardEditable(e)) return toast('تجديد البطاقات وتحديث الملفات للمهندس المسؤول عن فرقة الموظف أو الموارد البشرية أو مدير المشروع.', 'err');
    const cur = (e.docs || {})[d.k] || {};
    openForm(d.k + ' — ' + e.name, [{ k: 'exp', label: 'تاريخ الانتهاء', type: 'date', val: cur.exp || '' }, { k: 'file', label: 'صورة أو PDF (حتى 10 ميجابايت)', type: 'file', capture: true, wide: true }], async (v) => {
      const f = v.file && v.file.size ? v.file : null; if (!f && !v.exp) return 'أرفق الملف أو أدخل تاريخ الانتهاء.';
      if (v.exp && !/^\d{4}-\d{2}-\d{2}$/.test(v.exp)) return 'تاريخ غير صالح.';
      const x = Object.assign({}, cur, { exp: v.exp || '', tm: nowIso(), by: CUR.name });
      if (f) { if (f.size > 10 * 1024 * 1024) return 'الملف أكبر من 10 ميجابايت.'; if (!ALLOWED_FILES[f.type] || /officedocument/.test(f.type)) return 'المسموح: صورة أو PDF.'; const old = cur.fileId; x.fileId = uid('f'); x.fileName = safeName(f.name); x.size = f.size; x.type = f.type; try { await filePut(x.fileId, f); } catch (err) { return 'تعذّر حفظ الملف.'; } if (old) fileDel(old); }
      e.docs = e.docs || {}; e.docs[d.k] = x; audit(CUR.name, 'تحديث ' + d.k, e.name); toast('حُفظ «' + d.k + '» لـ ' + e.name + '.');
    }, { ok: 'حفظ' });
  },
  'fl-add': () => { if (!need('edit')) return; openForm('معاملة ميدانية جديدة', flJobFields(), (v) => { const e = flValidate(v); if (e) return e; const j = newTask({ flow: true, stage: 'plan', dept: 'التنفيذ', workType: 'excav', sec: { no: '', date: '', by: '' }, data: {}, alerts: {}, log: [], gate: null, safety: {} }); flApply(j, v); DB.jobs.push(j); flLog(j, 'plan', 'إنشاء المعاملة');
    const nb = flNeighbors(j, cfg().flow.r2).length; if (j.date === addDays(1) || j.date === today()) flCoordinate(j, 'd1'); audit(CUR.name, 'إنشاء معاملة ميدانية', flFolderName(j)); UI.view = 'flow'; UI.flSel = j.id; toast(nb ? 'أُنشئت المعاملة — يوجد ' + nb + ' معاملات في نفس النطاق.' : 'أُنشئت المعاملة.'); }, { ok: 'إنشاء' }); },
  'fl-edit': (d) => { const j = DB.jobs.find((x) => x.id === d.id); if (!j || !need('edit')) return; openForm('تعديل المعاملة', flJobFields(j), (v) => { const e = flValidate(v); if (e) return e; flApply(j, v); flLog(j, j.stage, 'تعديل البيانات'); audit(CUR.name, 'تعديل معاملة ميدانية', flFolderName(j)); }); },
  'fl-open': (d) => { UI.flSel = d.id; if (UI.view !== 'cluster') UI.view = 'flow'; render(); const el = $('.fldetail'); if (el && UI.view === 'flow') el.scrollIntoView({ block: 'start', behavior: 'smooth' }); },
  'fl-goto': (d) => { UI.view = 'flow'; UI.flSel = d.id; render(); },
  'fl-close-detail': () => { UI.flSel = null; render(); },
  'fl-off': (d) => { UI.flOff = d.k; render(); }, 'fl-rad': (d) => { UI.flRad = +d.k; render(); }, 'fl-day': (d) => { UI.flDay = d.k; render(); },
  'in-role': (d) => { UI.inRole = d.k; render(); }, 'in-st': (d) => { UI.inSt = d.k; render(); }, 'rep-k': (d) => { UI.repK = d.k; render(); },
  'fl-coord': (d) => { const j = DB.jobs.find((x) => x.id === d.id); if (!j || !need('notify')) return; const n = flCoordinate(j, 'manual'); save(); toast('أُرسل تنبيه التنسيق لقسم الرخص' + (n ? ' والمهندسين (' + n + ' معاملات قريبة)' : '') + '.'); render(); },
  'fl-adv': (d) => {
    const j = DB.jobs.find((x) => x.id === d.id); if (!j || !need('edit')) return; const nx = flNext(j); if (!nx) return;
    if (j.stage === 'gate' && !flGateOk(j)) return toast('لا يمكن بدء التنفيذ: أرفق صورة الرخصة أو التعهد، أو سجّل تجاوز المهندس.', 'err');
    if (flIdx(j) < flPath(j).indexOf('gate') + 1 && nx !== 'gate' && !flGateOk(j)) return toast('أرفق الرخصة أولاً.', 'err');
    if (j.stage === 'safety' && !(j.safety.delivered && j.safety.hse)) return toast('أكّد توريد الصبات والإنارة واعتماد فحص HSE قبل الحفر.', 'err');
    if (j.stage === 'lab' && nx === 'pdc' && !j.qa) return toast('اعتمد قائمة التوثيق والجودة أولاً (الموقع، الطول، الرخصة، أمر العمل، SAP، صور المراحل الموثّقة).', 'err');
    if (['dig', 'elec', 'asphalt'].includes(j.stage)) { const st = j.stage; const had = flStageDocs(j, st).filter((x) => /^image\//.test(x.mime || 'image/')).length; return openForm('إنهاء «' + FL_STAGES[st][0] + '»', [{ k: 'note', label: 'ملاحظة التنفيذ', type: 'textarea' }, { k: 'photo', label: had ? 'صور أو ملفات إضافية (اختياري — يوجد ' + had + ')' : 'صور التنفيذ (صورة واحدة على الأقل — تُوثَّق بالموقع)', type: 'files', accept: 'image/*,.pdf,.docx,.xlsx', wide: true, hint: 'يمكن اختيار عدة صور وملفات PDF أو Word أو Excel معاً · تُسمّى تلقائياً ' + flDocName(j, st, 'x.jpg') }, PLEDGE_FIELD], async (v) => {
      const F = (v.photo || []).filter((f) => f && f.size); if (!F.some((f) => /^image\//.test(f.type)) && !had) return 'أرفق صورة تنفيذ واحدة على الأقل — لا تُغلق المرحلة دون دليل مرئي.'; if (!v.pledge) return PLEDGE_ERR;
      const r = await flAttachMany(j, 'صور التنفيذ', F, st); if (typeof r === 'string') return r; flSetStage(j, nx, v.note); flLog(j, st, 'تعهد ' + CUR.name + ' بصحة البيانات وتأمين الموقع'); audit(CUR.name, 'تقدم معاملة', flFolderName(j) + ' → ' + FL_STAGES[nx][0]); toast('انتقلت إلى «' + FL_STAGES[nx][0] + '» وأُرسل التنبيه للمسؤول.'); }, { ok: 'إنهاء والانتقال' }); }
    return openForm('نقل المعاملة إلى «' + FL_STAGES[nx][0] + '»', [{ k: 'note', label: 'ملاحظة (اختياري)', type: 'textarea' }, PLEDGE_FIELD], (v) => { if (!v.pledge) return PLEDGE_ERR; flSetStage(j, nx, v.note); flLog(j, j.stage, 'تعهد ' + CUR.name + ' بصحة البيانات'); audit(CUR.name, 'تقدم معاملة', flFolderName(j) + ' → ' + FL_STAGES[nx][0]); toast('انتقلت إلى «' + FL_STAGES[nx][0] + '».'); }, { ok: nx === 'closed' ? 'إغلاق المعاملة' : 'نقل' });
  },
  'fl-gate': (d) => {
    const j = DB.jobs.find((x) => x.id === d.id); if (!j || !need('edit')) return;
    if (d.k === 'override') {
      if (!['admin', 'pm', 'eng'].includes(CUR.role)) return toast('التجاوز للمهندس أو مدير المشروع فقط.', 'err');
      return openForm('تجاوز بوابة الرخصة', [{ k: 'reason', label: 'مبرر التجاوز', type: 'textarea' }, { k: 'due', label: 'موعد إرفاق الرخصة', type: 'date', val: addDays(1) }], (v) => { if (String(v.reason || '').trim().length < 5) return 'اكتب مبرراً واضحاً.'; if (!(v.due >= today() && daysTo(v.due) <= 3)) return 'موعد الإرفاق خلال 3 أيام كحد أقصى.';
        j.gate = { mode: 'override', by: CUR.name, tm: nowIso(), reason: v.reason.trim().slice(0, 300), due: v.due, fileId: '' }; flLog(j, j.stage, 'تجاوز المهندس — الإرفاق قبل ' + v.due); flNotify('gate', ['permits_sup', 'permits_eng'], 'تجاوز بوابة الرخصة بواسطة ' + CUR.name, flJobText(j) + '\nالمبرر: ' + j.gate.reason + '\nالإرفاق قبل ' + v.due, [j]); audit(CUR.name, 'تجاوز بوابة الرخصة', flFolderName(j)); }, { ok: 'تسجيل التجاوز', note: 'يُسجَّل التجاوز باسمك ويُبلَّغ مشرف التصاريح. يجب إرفاق الرخصة قبل الموعد.' });
    }
    const kind = d.k === 'undertaking' ? 'تعهد' : 'تصريح';
    openForm(d.k === 'undertaking' ? 'إرفاق التعهد' : 'إرفاق صورة الرخصة', [{ k: 'file', label: d.k === 'undertaking' ? 'ملف التعهد (صورة أو PDF)' : 'صورة الرخصة (صورة أو PDF)', type: 'file', wide: true }], async (v) => {
      const doc = await flAttach(j, kind, v.file); if (typeof doc === 'string') return doc;
      if (j.gate && j.gate.mode === 'override') { j.gate.fileId = doc.fileId; j.gate.lateAt = nowIso(); } else j.gate = { mode: d.k === 'undertaking' ? 'undertaking' : 'permit', fileId: doc.fileId, by: CUR.name, tm: nowIso() };
      flLog(j, j.stage, 'إرفاق ' + kind); audit(CUR.name, 'إرفاق ' + kind, flFolderName(j)); toast('أُرفق ' + kind + (gwOn() ? ' وحُفظ في مجلد المعاملة على Drive.' : '.'));
    }, { ok: 'إرفاق' });
  },
  'fl-safety': (d) => {
    const j = DB.jobs.find((x) => x.id === d.id); if (!j || !need('edit')) return;
    if (d.k === 'req') { j.safety.reqAt = ''; flSafetyRequest(j); toast('أُرسل طلب التوريد لفريق السلامة وطلب فحص HSE.'); }
    if (d.k === 'delivered') { j.safety.delivered = nowIso(); flLog(j, j.stage, 'تأكيد توريد ' + (j.safety.barrier || 'الصبات') + ' والإنارة'); toast('سُجّل توريد السلامة والإنارة.'); }
    if (d.k === 'hse' && !d.ok) { const L = hseSiteChecks(j); return openForm('فحص الموقع قبل اعتماد HSE', [{ k: 'c', label: 'قائمة الفحص (' + L.length + ' بنداً) — كل البنود إلزامية', type: 'checks', opts: L.map((x) => [x, x]), val: [] }], (v) => { const n = (v.c || []).filter((x) => L.includes(x)).length; if (n < L.length) return 'بقي ' + (L.length - n) + ' بنداً غير محقق — لا يُعتمد الفحص قبل استيفاء كل البنود.'; j.safety.checks = L.slice(); FL_ACT['fl-safety']({ id: j.id, k: 'hse', ok: 1 }); }, { ok: 'اعتماد فحص HSE', note: 'البنود من قائمة تصريح الحفر EXC وقواعد سلامة التوزيع ومكتبة إجراءات الشركة لهذا النوع من الأعمال.' }); }
    if (d.k === 'hse') { const crew = crewById(j.crewId); const q = crew ? flCrewQual(crew) : []; j.safety.hse = nowIso(); j.safety.hseNotes = q.slice(0, 10); flLog(j, j.stage, 'اعتماد فحص HSE' + (q.length ? ' مع ' + q.length + ' ملاحظات' : '')); toast(q.length ? 'اعتُمد الفحص مع ' + q.length + ' ملاحظات على البطاقات.' : 'اعتُمد فحص HSE.'); }
    save(); render();
  },
  'fl-ret': (d) => { const j = DB.jobs.find((x) => x.id === d.id); if (!j || !need('edit')) return; FL_ACT['fl-rep']({ id: '', job: j.id, k: d.k }); },
  'fl-folder': async (d) => { const j = DB.jobs.find((x) => x.id === d.id); if (!j) return; try { await gwToken(false).catch(() => gwToken(true)); await gwJobFolder(j); toast('أُنشئ مجلد «' + flFolderName(j) + '» في Drive.'); } catch (e) { toast(e.message, 'err'); } render(); },
  'fl-cl-coord': (d) => { if (!need('notify')) return; const c = flClusterList().C[+d.i]; if (!c) return; const head = c.jobs[0]; const list = c.jobs.map((j) => '• ' + (j.baseNo || j.id) + ' — ' + j.kind + ' — ' + j.district + ' · ' + j.date + ' · ' + flPermitLine(j)).join('\n');
    flNotify('coord', ['civil', 'elec', 'permits_eng', 'permits_sup'], 'تنسيق موحّد لكلاستر ' + c.district + ' (' + c.jobs.length + ' معاملات)', 'نطاق ' + c.rad.toFixed(1) + ' كم · ' + c.meters + ' م حفر\n' + list + '\nنسّقوا مرة واحدة: توريد سلامة وإنارة، المعدات، المراقبين، والسفلتة بالتوالي.', c.jobs, { fwdRole: 'sup_civil+sup_elec', nav: flNav(head) });
    c.jobs.forEach((j) => flLog(j, j.stage, 'تنسيق كلاستر ' + c.district)); audit(CUR.name, 'تنسيق كلاستر', c.district + ' · ' + c.jobs.length); save(); toast('أُرسل التنسيق الموحّد للمهندسين وقسم الرخص.'); render(); },
  'fl-ai': () => flAi(),
  'fl-qa': (d) => { const j = DB.jobs.find((x) => x.id === d.id); if (!j || !need('edit')) return; const miss = flQa(j).filter((x) => !x[1]); if (miss.length) return toast('ناقص: ' + miss.map((x) => x[0]).join('، '), 'err');
    j.qa = { by: CUR.name, tm: nowIso() }; flLog(j, j.stage, 'اعتماد قائمة التوثيق والجودة'); audit(CUR.name, 'اعتماد الجودة', flRef(j)); save(); toast('اعتُمدت قائمة التوثيق — يمكن الرفع للاستشاري.'); render(); },
  'print-page': () => { document.body.classList.add('pp'); const off = () => { document.body.classList.remove('pp'); window.removeEventListener('afterprint', off); }; window.addEventListener('afterprint', off); window.print(); setTimeout(off, 1500); },
  'fl-tick': () => { FL_TICKED = ''; const n = flTick(); FL_TICKED = today(); toast(n ? 'أُنشئ ' + n + ' تنبيهات جديدة.' : 'لا تنبيهات جديدة — كل شيء محدّث.'); render(); },
  'fl-fwd': (d) => {
    const it = DB.inbox.find((x) => x.id === d.id); if (!it || !need('notify')) return; const jobs = it.jobIds.map((id) => DB.jobs.find((j) => j.id === id)).filter(Boolean);
    const roles = String(it.fwdRole || 'sup_civil').split('+'); const sups = []; roles.forEach((r) => flWho(r, jobs.map((j) => j.office)).forEach((p) => sups.push({ id: p.id, role: r, name: p.name, phone: p.phone })));
    jobs.forEach((j) => { const c = crewById(j.crewId); if (c && !sups.some((s) => s.name === c.sup.name)) sups.push({ id: 'crew-' + c.id, role: 'sup', name: c.sup.name, phone: c.sup.phone }); });
    const f = flNotify('fwd', roles, 'تحويل من ' + CUR.name + ': ' + it.title, it.body, jobs, { nav: it.nav, parent: it.id }); f.to = sups;
    it.st = 'fwd'; it.fwd = sups.map((s) => s.name); audit(CUR.name, 'تحويل تنبيه للمراقبين', it.title); save(); toast('حُوِّل التنبيه إلى ' + sups.length + ' مراقبين.'); render();
  },
  'fl-done': (d) => { const it = DB.inbox.find((x) => x.id === d.id); if (!it) return; it.st = 'done'; it.doneBy = CUR.name; save(); render(); },
  'fl-ro': (d) => { if (!need('settings')) return; const p = DB.roster.find((x) => x.id === d.id) || { role: 'civil', name: '', offices: [], phone: '' };
    openForm(d.id ? 'تعديل مسؤول' : 'إضافة مسؤول', [{ k: 'role', label: 'الدور', type: 'select', opts: Object.keys(FL_ROLES).map((r) => [r, FL_ROLES[r]]), val: p.role }, { k: 'name', label: 'الاسم', val: p.name }, { k: 'phone', label: 'الجوال (واتساب)', ltr: true, val: p.phone, ph: '9665xxxxxxxx' }, { k: 'offices', label: 'المكاتب (فارغ = كل المكاتب)', type: 'checks', opts: DB.lists.offices.map((o) => [o, o]), val: p.offices }].concat(d.id ? [{ k: 'del', label: 'حذف هذا المسؤول', type: 'check' }] : []),
      (v) => { if (v.del) { DB.roster = DB.roster.filter((x) => x.id !== p.id); return; } const ph = String(v.phone || '').replace(/\D/g, ''); if (String(v.name || '').trim().length < 2) return 'الاسم مطلوب.'; if (ph && !/^9665\d{8}$/.test(normPhone(ph))) return 'رقم جوال سعودي غير صالح.';
        const offs = [].concat(v.offices || []).filter((o) => DB.lists.offices.includes(o));
        Object.assign(p, { role: v.role, name: v.name.trim().slice(0, 80), phone: ph ? normPhone(ph) : '', offices: offs }); if (!d.id) { p.id = uid('ro'); DB.roster.push(p); } audit(CUR.name, 'تعديل جدول المسؤوليات', p.name); }); },
  'fl-rep': (d) => {
    if (!need('edit')) return; const J = flJobs();
    openForm('تسجيل بلاغ / معاد', [{ k: 'kind', label: 'النوع', type: 'select', opts: Object.keys(FL_REPORT_KINDS).map((k) => [k, FL_REPORT_KINDS[k][0]]), val: d.k || 'pdc' }, { k: 'jobId', label: 'المعاملة', type: 'select', opts: [['', '— غير مربوط —']].concat(J.map((j) => [j.id, flFolderName(j) + ' · ' + j.district])), val: d.job || '' },
      { k: 'baseNo', label: 'رقم الأساس (إن لم تُربط)', ltr: true }, { k: 'permit', label: 'رقم الرخصة', ltr: true }, { k: 'district', label: 'الحي', type: 'combo', opts: districtOpts() }, { k: 'recv', label: 'تاريخ الاستلام', type: 'date', val: today() }, { k: 'note', label: 'الملاحظة / سبب الإعادة', type: 'textarea' }], (v) => {
      const K = FL_REPORT_KINDS[v.kind]; if (!K) return 'اختر النوع.'; const j = J.find((x) => x.id === v.jobId); if (!j && !v.baseNo && !v.permit) return 'اربط المعاملة أو أدخل رقم الأساس/الرخصة.';
      const r = { id: uid('rp'), kind: v.kind, kindName: K[0], jobId: j ? j.id : '', baseNo: j ? j.baseNo : v.baseNo.trim(), permit: j ? j.permit : v.permit.trim(), district: j ? j.district : rememberDistrict(v.district), note: String(v.note || '').trim().slice(0, 500), recv: v.recv || today(), due: addDays(K[1], v.recv || today()), st: 'open', to: '', tm: nowIso(), by: CUR.name };
      DB.reports.unshift(r);
      if (j) { if (v.kind === 'lab') flSetStage(j, 'asphalt', 'راسب المختبر — إعادة دك وسفلتة'); if (v.kind === 'pdc') { flSetStage(j, 'pdc', 'إعادة من الاستشاري — مهلة 60 يوماً جديدة'); } if (v.kind === 'ripc') flSetStage(j, 'pdc', 'إعادة من المركز — تعود للاستشاري أولاً'); }
      flNotify('report', ['permits_sup', 'civil'], K[0] + (r.baseNo ? ' — ' + r.baseNo : ''), (j ? flJobText(j) + '\n' : '') + r.note + '\nالمهلة حتى ' + r.due, j ? [j] : []); audit(CUR.name, 'تسجيل ' + K[0], r.baseNo || r.permit); UI.view = 'reports';
    }, { ok: 'تسجيل' });
  },
  'fl-rep-to': (d) => { const r = DB.reports.find((x) => x.id === d.id); if (!r || !need('notify')) return; const j = DB.jobs.find((x) => x.id === r.jobId); r.st = 'routed'; r.to = d.k;
    flNotify('report', [d.k], r.kindName + ' — مطلوب المعالجة', (j ? flJobText(j) + '\n' : 'الأساس ' + (r.baseNo || '—') + ' · الرخصة ' + (r.permit || '—') + '\n') + r.note + '\nالمهلة حتى ' + r.due, j ? [j] : [], { nav: j ? flNav(j) : '' }); save(); toast('وُجّه البلاغ إلى ' + FL_ROLES[d.k] + '.'); render(); },
  'fl-rep-done': (d) => { const r = DB.reports.find((x) => x.id === d.id); if (!r || !need('edit')) return; r.st = 'resolved'; r.doneAt = nowIso(); r.doneBy = CUR.name; audit(CUR.name, 'معالجة بلاغ', r.kindName); save(); render(); }
};

// ---------- demo data (fictional numbers; real district names; coordinates approximate) ----------
function seedFlow(d) {
  const T = (n) => addDays(n); const mk = (o) => { const j = Object.assign({ id: uid('t'), title: '', permit: '', permitExp: '', site: o.district, crewId: '', dept: 'التنفيذ', date: today(), st: 'new', hold: null, reqs: [], close: null, doneAt: null, created: nowIso(), workType: 'excav', sec: { no: '', date: '', by: '' }, data: {}, flow: true, stage: 'plan', alerts: {}, log: [], gate: null, safety: { barrier: 'صبات خرسانية' }, permitType: 'اعتيادي' }, o);
    j.title = j.kind + ' — ' + j.district + ' (' + j.baseNo + ')'; j.log.push({ tm: nowIso(), stage: j.stage, by: 'بيانات تجريبية', note: '' }); return j; };
  const G = (fid) => ({ mode: 'permit', fileId: fid, by: 'بيانات تجريبية', tm: nowIso() });
  const rows = [
    // مكتب الشمال — النرجس: كلاستر الغد (حفر مفتوح لميني بيلر + تمديد + أسفلت ضمن 2 كم)
    { office: 'مكتب الشمال', district: 'النرجس', kind: 'حفر مفتوح لتركيب ميني بيلر', baseNo: 'R7101', txNo: '261300101', permit: '2410001', permitExp: T(6), date: T(1), lat: 24.8612, lng: 46.6618, lengthM: 15, plan: '3218', crewId: 'X-03' },
    { office: 'مكتب الشمال', district: 'النرجس', kind: 'تمديد كابلات', baseNo: 'R7102', txNo: '261300102', permit: '2410002', permitExp: T(2), date: T(1), lat: 24.8661, lng: 46.6702, lengthM: 120, plan: '3218', crewId: 'E-07' },
    { office: 'مكتب الشمال', district: 'النرجس', kind: 'أسفلت وإعادة سفلتة', baseNo: 'R7103', txNo: '261300103', permit: '2410003', permitExp: T(9), date: T(2), lat: 24.8574, lng: 46.6555, lengthM: 80, stage: 'gate', gate: G('demo-permit') },
    { office: 'مكتب الشمال', district: 'الملقا', kind: 'تمديد كابلات', baseNo: 'R7104', txNo: '261300104', permit: '2410004', permitType: 'طارئ', permitExp: T(1), date: T(1), lat: 24.8118, lng: 46.6142, lengthM: 50, station: 'محطة الملقا 3' },
    { office: 'مكتب الشمال', district: 'القيروان', kind: 'حفر مفتوح', baseNo: 'R7105', txNo: '261300105', permit: '', permitExp: '', date: T(3), lat: 24.8334, lng: 46.5902, lengthM: 25 },
    { office: 'مكتب الشمال', district: 'الندى', kind: 'تركيب عدادات', baseNo: 'R7106', txNo: '261300106', permit: '2410006', permitExp: T(12), date: T(0), lat: 24.8085, lng: 46.6828, stage: 'elec', gate: G('demo-permit') },
    { office: 'مكتب الشمال', district: 'النرجس', kind: 'حفر مفتوح لتركيب ميني بيلر', baseNo: 'R7107', txNo: '261300107', permit: '2410007', permitExp: T(5), date: T(-1), lat: 24.8702, lng: 46.6655, lengthM: 20, stage: 'safety', gate: G('demo-permit'), crewId: 'X-03', safety: { barrier: 'صبات بلاستيكية', reqAt: nowIso() } },
    // مكتب خريص — الخليج / الجنادرية / النهضة
    { office: 'مكتب خريص', district: 'الخليج', kind: 'تمديد كابلات', baseNo: 'R7201', txNo: '261300201', permit: '2410101', permitExp: T(4), date: T(1), lat: 24.7762, lng: 46.8021, lengthM: 210, crewId: 'X-05' },
    { office: 'مكتب خريص', district: 'الخليج', kind: 'حفر مفتوح لتركيب ميني بيلر', baseNo: 'R7202', txNo: '261300202', permit: '2410102', permitExp: T(7), date: T(2), lat: 24.7801, lng: 46.8102, lengthM: 15 },
    { office: 'مكتب خريص', district: 'النهضة', kind: 'حفر مفتوح', baseNo: 'R7203', txNo: '261300203', permit: '2410103', permitExp: T(3), date: T(1), lat: 24.7629, lng: 46.8172, lengthM: 30 },
    { office: 'مكتب خريص', district: 'الجنادرية', kind: 'تمديد كابلات', baseNo: 'R7204', txNo: '261300204', permit: '2410104', permitExp: T(-1), date: T(-3), lat: 24.8003, lng: 46.8801, lengthM: 170, stage: 'dig', gate: G('demo-permit'), safety: { barrier: 'صبات خرسانية', reqAt: nowIso(), delivered: nowIso(), hse: nowIso() } },
    { office: 'مكتب خريص', district: 'الجنادرية', kind: 'حفر مفتوح لتركيب ميني بيلر', baseNo: 'R7205', txNo: '261300205', permit: '2410105', permitExp: T(8), date: T(-5), lat: 24.7962, lng: 46.8752, lengthM: 15, stage: 'asphalt', gate: G('demo-permit') },
    { office: 'مكتب خريص', district: 'اليرموك', kind: 'أسفلت وإعادة سفلتة', baseNo: 'R7206', txNo: '261300206', permit: '2410106', permitExp: T(10), date: T(-12), lat: 24.8141, lng: 46.7893, lengthM: 100, stage: 'lab', gate: G('demo-permit') },
    { office: 'مكتب خريص', district: 'الريان', kind: 'تمديد كابلات', baseNo: 'R7207', txNo: '261300207', permit: '2410107', permitExp: T(15), date: T(-30), lat: 24.7091, lng: 46.7752, lengthM: 370, stage: 'pdc', gate: G('demo-permit'), pdc: { start: T(-52), due: T(8) } },
    // مكتب الشرق — الملز / جرير / العزيزية
    { office: 'مكتب الشرق', district: 'الملز', kind: 'تمديد كابلات', baseNo: 'R7301', txNo: '261300301', permit: '2410201', permitExp: T(5), date: T(1), lat: 24.6631, lng: 46.7332, lengthM: 220, crewId: 'X-05' },
    { office: 'مكتب الشرق', district: 'جرير', kind: 'حفر مفتوح لتركيب ميني بيلر', baseNo: 'R7302', txNo: '261300302', permit: '2410202', permitExp: T(6), date: T(2), lat: 24.6612, lng: 46.7481, lengthM: 15 },
    { office: 'مكتب الشرق', district: 'الملز', kind: 'أسفلت وإعادة سفلتة', baseNo: 'R7303', txNo: '261300303', permit: '2410203', permitExp: T(2), date: T(3), lat: 24.6688, lng: 46.7395, lengthM: 180 },
    { office: 'مكتب الشرق', district: 'العزيزية', kind: 'تمديد كابلات', baseNo: 'R7304', txNo: '261300304', permit: '2410204', permitExp: T(11), date: T(4), lat: 24.5772, lng: 46.7641, lengthM: 300, station: 'محطة العزيزية' },
    { office: 'مكتب الشرق', district: 'العزيزية', kind: 'تركيب عدادات', baseNo: 'R7305', txNo: '261300305', permit: '2410205', permitExp: T(9), date: T(4), lat: 24.5801, lng: 46.7702, station: 'محطة العزيزية' },
    { office: 'مكتب الشرق', district: 'غبيرة', kind: 'حفر مفتوح', baseNo: 'R7306', txNo: '261300306', permit: '2410206', permitExp: T(20), date: T(-40), lat: 24.6132, lng: 46.7322, lengthM: 150, stage: 'ripc', gate: G('demo-permit') }
    ,{ office: 'مكتب خريص', district: 'الروضة', kind: 'صيانة أعطال جهد منخفض ومتوسط', baseNo: 'R7208', txNo: '261300208', permit: '2410108', permitExp: T(13), date: T(2), lat: 24.7352, lng: 46.7702, lengthM: 12 },
    { office: 'مكتب الشمال', district: 'الياسمين', kind: 'تمديد كابلات البايلوت', baseNo: 'R7108', txNo: '261300108', permit: '2410008', permitExp: T(26), date: T(5), lat: 24.8281, lng: 46.6402, lengthM: 260 },
    { office: 'مكتب الشرق', district: 'السلي', kind: 'حالة طارئة', baseNo: 'R7307', txNo: '261300307', permit: '2410207', permitType: 'طارئ', permitExp: T(8), date: T(0), lat: 24.6301, lng: 46.8102, lengthM: 8, stage: 'gate' }
  ].map(mk);
  rows.forEach((j, i) => { j.woNo = (j.kind === 'تركيب عدادات' ? '402' : '802') + String(3100100 + i * 37); j.sapNo = String(5400200 + i * 53); flEnsureUid(j, false, d.jobs.concat(rows.slice(0, i))); });
  rows.forEach((j) => { j.st = j.stage === 'plan' || j.stage === 'gate' ? 'new' : 'prog'; d.jobs.push(j); });
  (d.employees || []).forEach((e, i) => { if (i % 4 === 3) return; e.docs = e.docs || {}; const sx = (exp) => ({ exp, fileId: '', fileName: '', size: 0, tm: nowIso(), by: 'بيانات تجريبية' });
    e.docs['صورة الإقامة'] = sx(T(180 + i)); e.docs['كارت الأمن الصناعي'] = sx(i % 5 === 0 ? T(-4) : i % 7 === 0 ? T(12) : T(150)); e.docs['كارت التأمين الطبي'] = sx(T(90 + i));
    const jb = e.job || ''; e.authCat = /مراقب|مشرف|ملاحظ/.test(jb) ? 'receiver' : /مهندس/.test(jb) ? (i % 3 ? 'receiver' : 'issuer') : /سائق|مشغل/.test(jb) ? 'driver' : 'competent'; e.authType = /سائق|مشغل/.test(jb) ? '' : /عداد/.test(jb) ? 'METER' : e.authCat === 'competent' ? 'CABLE' : 'LV';
    e.docs['بطاقة التأهيل'] = sx(i % 6 === 1 ? T(-6) : i % 5 === 2 ? T(20) : T(200 + i)); e.authNo = 'AC-' + (4100 + i);
    if (/سائق|مشغل/.test(e.job || '')) { e.docs['رخصة القيادة'] = sx(T(300)); if (i % 2) e.docs['شهادة TUV'] = sx(i % 3 ? T(70) : T(-10)); } });
  d.reports = [
    { id: uid('rp'), kind: 'ripc', kindName: FL_REPORT_KINDS.ripc[0], jobId: '', baseNo: 'R6812', permit: '2387011', district: 'النرجس', note: 'نقص صور ما بعد الانتهاء وتقرير المختبر', recv: T(-20), due: T(40), st: 'open', to: '', tm: nowIso(), by: 'بيانات تجريبية' },
    { id: uid('rp'), kind: 'b940', kindName: FL_REPORT_KINDS.b940[0], jobId: '', baseNo: 'R6744', permit: '2396681', district: 'الخليج', note: 'هبوط أسفلت أمام المسار', recv: T(-1), due: T(2), st: 'open', to: '', tm: nowIso(), by: 'بيانات تجريبية' },
    { id: uid('rp'), kind: 'lab', kindName: FL_REPORT_KINDS.lab[0], jobId: '', baseNo: 'R6690', permit: '2392589', district: 'الملز', note: 'راسب دمك — نقطتان', recv: T(-2), due: T(5), st: 'routed', to: 'asphalt', tm: nowIso(), by: 'بيانات تجريبية' }
  ];
  return d;
}
