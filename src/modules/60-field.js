// ================================================================
// Module: field documentation — multi-file uploads, pledge before closing/moving,
// site photos before leaving, documented returns (lab / consultant / RIPC), fonts.
// Loaded before the DB is created, so only declarations live at top level.
// ================================================================
const PLEDGE_FIELD = { k: 'pledge', label: 'أتعهد بصحة البيانات والمرفقات، وبأن الموقع مؤمَّن (حواجز وإنارة وأغطية) عند المغادرة', type: 'check', val: false, wide: true };
const PLEDGE_ERR = 'اختر «أتعهد» قبل الإغلاق أو النقل — يُسجَّل التعهد باسمك.';
const SITE_PHOTOS_MIN = 5;
const triName = (n) => String(n || '').trim().split(/\s+/).slice(0, 3).join(' ');

// attach several files (images / PDF / Word / Excel); images are geo-tagged
async function flAttachMany(j, kind, files, stage) {
  const ids = []; let geo = null; let noGeo = false;
  for (const f of files || []) {
    if (!f || !f.size) continue;
    const img = /^image\//.test(f.type); if (img && !geo && !noGeo) { geo = await geoNow(4000); if (!geo) noGeo = true; }
    const r = await flAttachAny(j, kind, f, { stage, geo: img ? geo : null }); if (typeof r === 'string') return r + ' (' + f.name + ')'; ids.push(r.id);
  }
  if (noGeo && ids.length) toast('حُفظت الصور دون موقع جغرافي — فعّل خدمة الموقع لتوثيقها.', 'err');
  return ids;
}
const FIELD_TYPES = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet))$/;
async function flAttachAny(j, kind, file, o) {
  if (!file || !file.size) return 'ملف فارغ.'; if (file.size > 15 * 1024 * 1024) return 'الملف أكبر من 15 ميجابايت.'; if (!FIELD_TYPES.test(file.type)) return 'المسموح: صور، PDF، Word، Excel.';
  o = o || {}; const stage = o.stage || j.stage || 'doc'; const name = flDocName(j, stage, file.name);
  let blob = file; try { blob = new File([file], name, { type: file.type }); } catch (e) { /* keep original */ }
  const doc = { id: uid('d'), type: kind, title: kind + ' — ' + (j.flow ? flFolderName(j) : j.title), crewId: j.crewId, taskId: j.id, workType: j.workType || '', person: CUR.name, exp: '', url: '', fileId: uid('f'), fileName: name, orig: safeName(file.name), mime: file.type, stage, geo: o.geo || null, size: file.size, form: null, tm: nowIso(), by: CUR.name };
  try { await filePut(doc.fileId, blob, j.id); } catch (e) { return 'تعذّر حفظ الملف.'; }
  DB.docs.unshift(doc); return doc;
}

// ---------- returns: lab / consultant / RIPC / 940 / violations ----------
const LAB_TYPES = ['دمك الردم (Compaction)', 'سماكة الأسفلت (Core)', 'كثافة الأسفلت', 'جودة المواد', 'مستويات وتسوية', 'أخرى'];
const RETURN_REASONS = ['رسوب فحص الدمك', 'رسوب سماكة أو كثافة الأسفلت', 'هبوط أو تشققات في السفلتة', 'نقص صور أو مستندات', 'عدم مطابقة المخططات', 'مخلفات أو عدم تنظيف الموقع', 'غطاء أو منسوب غير مطابق', 'أخرى'];
const RETURN_TO_ASPHALT = ['lab', 'b940', 'viol'];
function flReportForm(d) {
  if (!need('edit')) return; const J = flJobs().filter(jobInScope).sort((a, b) => (a.stage === 'closed') - (b.stage === 'closed') || String(b.date).localeCompare(String(a.date)));
  const jl = (j) => (j.uid || j.baseNo) + ' · رخصة ' + (j.permit || '—') + ' · ' + j.district + (j.stage === 'closed' ? ' (منتهية)' : ' (' + FL_STAGES[j.stage][0] + ')');
  openForm('تسجيل بلاغ / معاد', [
    { k: 'kind', label: 'النوع', type: 'select', opts: Object.keys(FL_REPORT_KINDS).map((k) => [k, FL_REPORT_KINDS[k][0]]), val: d.k || 'lab' },
    { k: 'jobId', label: 'المعاملة والرخصة (الجارية والمنتهية)', type: 'select', opts: [['', '— غير مربوط —']].concat(J.map((j) => [j.id, jl(j)])), val: d.job || '', wide: true },
    { k: 'baseNo', label: 'رقم الأساس (إن لم تُربط)', ltr: true }, { k: 'permit', label: 'رقم الرخصة (إن لم تُربط)', ltr: true },
    { k: 'labNo', label: 'رقم تقرير المختبر', ltr: true }, { k: 'labType', label: 'نوع الفحص', type: 'select', opts: [['', '—']].concat(LAB_TYPES.map((x) => [x, x])) },
    { k: 'consultant', label: 'الاستشاري / الجهة', val: '' }, { k: 'consultantName', label: 'اسم المهندس المراجع', val: '' },
    { k: 'reason', label: 'سبب الإعادة أو الرسوب', type: 'select', opts: RETURN_REASONS.map((x) => [x, x]) },
    { k: 'district', label: 'الحي (إن لم تُربط)', type: 'combo', opts: districtOpts() }, { k: 'recv', label: 'تاريخ الاستلام', type: 'date', val: today() },
    { k: 'note', label: 'تفاصيل الملاحظة', type: 'textarea', wide: true },
    { k: 'files', label: 'تقرير المختبر والصور أو الملف المعاد', type: 'files', wide: true, hint: 'يمكن اختيار عدة ملفات معاً: صور، PDF، Word، Excel' },
    { k: 'toAsphalt', label: 'إرجاع المعاملة لقسم الأسفلت والإصلاحات (ولو كانت منتهية)', type: 'check', val: !['pdc', 'ripc'].includes(d.k || 'lab'), wide: true }
  ], async (v) => {
    const K = FL_REPORT_KINDS[v.kind]; if (!K) return 'اختر النوع.'; const j = J.find((x) => x.id === v.jobId); if (!j && !v.baseNo.trim() && !v.permit.trim()) return 'اربط المعاملة أو أدخل رقم الأساس/الرخصة.';
    if (v.kind === 'lab' && !v.labNo.trim()) return 'أدخل رقم تقرير المختبر.'; if (v.labNo && !/^[A-Za-z0-9\-\/ ]{2,30}$/.test(v.labNo.trim())) return 'رقم تقرير المختبر غير صالح.';
    const F = (v.files || []).filter((f) => f && f.size); if (v.kind === 'lab' && !F.length) return 'أرفق تقرير المختبر (صورة أو PDF).';
    let files = []; if (F.length) { if (!j) return 'اربط المعاملة لإرفاق الملفات بها.'; const r = await flAttachMany(j, 'معاد — ' + K[0], F, 'ret'); if (typeof r === 'string') return r; files = r; }
    const r = { id: uid('rp'), kind: v.kind, kindName: K[0], jobId: j ? j.id : '', baseNo: j ? j.baseNo : v.baseNo.trim(), permit: j ? j.permit : v.permit.trim(), district: j ? j.district : rememberDistrict(v.district),
      labNo: v.labNo.trim().slice(0, 30), labType: v.labType || '', consultant: v.consultant.trim().slice(0, 80), consultantName: v.consultantName.trim().slice(0, 80), reason: v.reason || '', files,
      note: String(v.note || '').trim().slice(0, 500), recv: v.recv || today(), due: addDays(K[1], v.recv || today()), st: 'open', to: '', tm: nowIso(), by: CUR.name };
    DB.reports.unshift(r);
    if (j) {
      const was = j.stage; const why = K[0] + ' — ' + r.reason + (r.labNo ? ' · تقرير ' + r.labNo : '');
      if (v.toAsphalt) { j.qa = null; flSetStage(j, 'asphalt', 'إرجاع للأسفلت والإصلاحات: ' + why); r.st = 'routed'; r.to = 'asphalt'; flNotify('report', ['asphalt'], 'إصلاح مطلوب — ' + (j.uid || j.baseNo), flJobText(j) + '\n' + why + '\nالمهلة حتى ' + r.due, [j], { nav: flNav(j) }); }
      else if (v.kind === 'pdc' || v.kind === 'ripc') flSetStage(j, 'pdc', why);
      if (was === 'closed') flLog(j, 'asphalt', 'أُعيد فتح المعاملة المنتهية بسبب ' + K[0]);
    }
    flNotify('report', ['permits_sup', 'civil'], K[0] + (r.baseNo ? ' — ' + r.baseNo : ''), (j ? flJobText(j) + '\n' : '') + r.reason + (r.note ? '\n' + r.note : '') + '\nالمهلة حتى ' + r.due, j ? [j] : []);
    audit(CUR.name, 'تسجيل ' + K[0], (r.baseNo || r.permit) + (r.labNo ? ' · ' + r.labNo : '')); UI.view = 'reports';
  }, { ok: 'تسجيل' });
}

// ---------- site status before leaving: photos + securing + pledge ----------
function taskCloseForm(d) {
  const t = taskById(d.id); if (!t || !need('request')) return;
  const before = DB.docs.filter((x) => x.taskId === t.id && x.type === 'صور الموقع قبل المغادرة').length;
  openForm('تحديث حالة الموقع قبل المغادرة', [
    { k: 'finished', label: 'تم الانتهاء من جميع الأعمال في هذا الموقع', type: 'check', val: false, wide: true },
    { k: 'remaining', label: 'المتبقي في الموقع (إن لم يكتمل)', type: 'checks', list: 'remaining', val: t.close && !t.close.finished ? t.close.remaining : [] },
    { k: 'secured', label: 'الموقع المفتوح مؤمَّن: حواجز وإنارة ليلية وأغطية ولوحات تحذيرية', type: 'check', val: false, wide: true },
    { k: 'photos', label: 'صور الموقع قبل المغادرة (' + SITE_PHOTOS_MIN + ' صور على الأقل' + (before ? ' — مرفوع سابقاً ' + before : '') + ')', type: 'files', accept: 'image/*', wide: true, hint: 'اختر عدة صور معاً من الكاميرا أو المعرض — تُوثَّق بالموقع الجغرافي' },
    { k: 'note', label: 'ملاحظات', type: 'textarea' }, PLEDGE_FIELD
  ], async (v) => {
    if (!v.finished && !v.remaining.length) return 'حدّد ما تبقّى في الموقع، أو أكّد الانتهاء من الأعمال.'; if (v.finished && v.remaining.length) return 'لا يمكن تأكيد الانتهاء مع وجود بنود متبقية.';
    if (!v.finished && !v.secured) return 'أكّد تأمين الموقع المفتوح قبل المغادرة.';
    const P = (v.photos || []).filter((f) => f && f.size && /^image\//.test(f.type)); if (P.length + before < SITE_PHOTOS_MIN) return 'أرفق ' + SITE_PHOTOS_MIN + ' صور للموقع على الأقل (المرفق الآن ' + (P.length + before) + ').';
    if (!v.pledge) return PLEDGE_ERR;
    const ids = await flAttachMany(t, 'صور الموقع قبل المغادرة', P, 'close'); if (typeof ids === 'string') return ids;
    t.close = { tm: nowIso(), finished: v.finished, remaining: v.remaining, secured: !!v.secured || v.finished, photos: ids.length + before, pledge: { by: CUR.name, tm: nowIso() }, note: v.note.trim().slice(0, 400), by: CUR.name };
    if (v.finished) { t.st = 'done'; t.doneAt = nowIso(); if (!t.reqs.some((r) => r.type === SAFE_OUT)) t.reqs.push({ id: uid('rq'), type: SAFE_OUT, dept: REQ_DEPT[SAFE_OUT], due: today(), st: 'open', auto: true, tm: nowIso() }); toast('أُغلقت المهمة، وأُرسل طلب إزالة السلامة والإنارة لقسم السلامة.'); }
    else { if (t.st === 'new') t.st = 'prog'; toast('حُفظت حالة الموقع: متبقٍ ' + v.remaining.join('، ') + '.'); }
    audit(CUR.name, 'تحديث حالة الموقع مع تعهد', t.title + ': ' + (v.finished ? 'منتهٍ' : 'متبقٍ ' + v.remaining.join('، ')) + ' · ' + (ids.length + before) + ' صور');
  }, { ok: 'حفظ حالة الموقع', note: 'تُحفظ الصور في مجلد المعاملة ويُسجَّل التعهد باسمك ووقته.' });
}

// ---------- fonts ----------
const FONTS = [['plex', 'IBM Plex Sans Arabic', 'رسمي وواضح — الافتراضي'], ['tajawal', 'Tajawal', 'عصري ومضغوط — مناسب للجوال'], ['cairo', 'Cairo', 'عريض وسهل القراءة في الميدان']];
function fontPicker() {
  return html`<div class="card"><h2 style="font-size:17px">خط المنصة</h2><p class="t-mut" style="font-size:13px;margin:0">يُحفظ على هذا الجهاز لكل مستخدم.</p>
    <div class="fontpick" role="group" aria-label="اختيار الخط">${FONTS.map((f) => html`<button type="button" data-act="font" data-k="${f[0]}" aria-pressed="${FONT_K === f[0]}" style="font-family:'${f[1]}',system-ui,sans-serif"><b>ميدان — العمليات الميدانية 2026</b><span>${f[1]} · ${f[2]}</span></button>`)}</div></div>`;
}
Object.assign(FL_ACT, {
  'fl-rep': flReportForm, 'task-close': taskCloseForm,
  font: (d) => { if (!FONTS.some((f) => f[0] === d.k)) return; FONT_K = d.k; setPref('maydan_font', FONT_K); applyPrefs(); toast('الخط: ' + FONTS.find((f) => f[0] === d.k)[1]); render(); }
});
