// ================================================================
// Module: role hierarchy and scope (who sees and edits what)
//   مدير العمليات  → يرى كل المنصة والمواقع والفرق ويرسل التنبيهات (بدون تعديل الهيكل)
//   مدير المنصة    → كل الصلاحيات (المستخدمون، الإعدادات، البيانات)
//   مدير المشروع   → المكاتب والفرق والمشاريع، نقل الأفراد بين الفرق والفرق بين المكاتب، الكروت والتأهيل
//   المهندس المسؤول → فرقه فقط: الكروت، التصاريح، تعديل الفرقة، النقل بين فرقه
//   المراقب        → فرقته فقط: بيانات العمال والإقامات والكروت وTUV والرخص
// Every action is checked twice: the permission, then the crew being inside the user's tree.
// ================================================================

const ROLE_INFO = {
  ops: ['مدير العمليات', 'يرى كل المنصة والمواقع والفرق ويرسل التنبيهات'],
  admin: ['مدير المنصة', 'كل الصلاحيات: المستخدمون والإعدادات والبيانات'],
  pm: ['مدير المشروع', 'المكاتب والفرق والمشاريع، النقل بين الفرق والمكاتب، الكروت والتأهيل'],
  eng: ['المهندس المسؤول', 'فرقه فقط: الكروت والتصاريح وتعديل الفرقة والنقل بين فرقه'],
  sup: ['المراقب', 'فرقته فقط: بيانات العمال والإقامات والكروت وTUV والرخص'],
  viewer: ['مشاهد', 'عرض فقط ضمن النطاق المحدد']
};
const ROLE_PERMS = {
  ops: ['request', 'ai', 'audit', 'notify'],
  admin: ['users', 'settings', 'data', 'org', 'moveorg', 'crewcfg', 'tasks', 'permits', 'cards', 'edit', 'move', 'request', 'ai', 'audit', 'notify'],
  pm: ['org', 'moveorg', 'crewcfg', 'tasks', 'permits', 'cards', 'edit', 'move', 'request', 'ai', 'audit', 'notify', 'data'],
  eng: ['crewcfg', 'tasks', 'permits', 'cards', 'edit', 'move', 'request', 'ai', 'notify'],
  sup: ['cards', 'edit', 'request', 'ai'],
  viewer: []
};
// stricter permission per action (checked before the action's own check), and whether the current crew must be in scope
const ACT_RULES = {
  'crew-add': ['org'], 'crew-edit': ['crewcfg', 1], 'sup-edit': ['edit', 1], 'w-add': ['edit', 1], 'w-edit': ['edit', 1], 'dy-add': ['edit', 1], 'dy-edit': ['edit', 1],
  'eq-add': ['crewcfg', 1], 'eq-edit': ['edit', 1], 'move-crew': ['moveorg', 1], 'move-eq': ['move', 1], 'move-w': ['move', 1], 'move-dy': ['move', 1],
  'crew-hold': ['request', 1], 'crew-resume': ['request', 1], 'proj-add': ['org'], 'proj-edit': ['org'], 'person-edit': ['org'], 'assign-person': ['org'], 'br-add': ['org'],
  'task-add': ['tasks'], 'task-edit': ['tasks'], 'doc-del': ['permits'], 'emp-user': ['users'], 'maint-log': ['edit'], 'odo-update': ['edit'],
  'fl-gate': ['permits'], 'fl-add': ['tasks'], 'fl-edit': ['tasks'], 'fl-coord': ['notify'], 'fl-cl-coord': ['notify'], 'fl-fwd': ['notify'], 'fl-ro': ['settings'], 'fl-rep-to': ['notify'], 'fl-folder': ['permits']
};

function normName(n) { return String(n || '').replace(/^\s*م\s*[./]?\s*/, '').replace(/\s+/g, ' ').trim(); }
function personIs(p, u) {
  if (!p || !u) return false;
  if (p.iqama && u.iqama && p.iqama === u.iqama) return true;
  if (p.phone && u.phone && normPhone(String(p.phone)) === normPhone(String(u.phone))) return true;
  return !!(p.name && u.name && normName(p.name).length > 3 && normName(p.name) === normName(u.name));
}
function scopeAll(u) { u = u || CUR; if (!u) return false; if (u.role === 'admin' || u.role === 'ops') return true; const s = u.scope || {}; return u.role === 'pm' && !(s.projects || []).length && !(s.offices || []).length && !(s.crews || []).length; }
function crewInScope(c, u) {
  u = u || CUR; if (!u || !c) return false; if (scopeAll(u)) return true;
  const s = u.scope || {};
  if ((s.crews || []).includes(c.id)) return true;
  if (u.role === 'pm' || u.role === 'viewer') return (s.projects || []).includes(c.projectId) || (s.offices || []).includes(c.branch);
  if (u.role === 'eng') return personIs(c.eng, u) || (s.projects || []).includes(c.projectId);
  if (u.role === 'sup') return personIs(c.sup, u);
  return false;
}
function crewsV() { return DB.crews.filter((c) => crewInScope(c)); }
function myOffices(u) { u = u || CUR; const s = (u && u.scope) || {}; return [...new Set((s.offices || []).concat(crewsV().map((c) => c.branch)))]; }
function jobInScope(j) {
  if (!CUR) return false; if (scopeAll()) return true;
  if (j.crewId) { const c = crewById(j.crewId); if (c) return crewInScope(c); }
  return (CUR.role === 'pm' || CUR.role === 'eng') && !!j.office && myOffices().includes(j.office);
}
function jobsV() { return DB.jobs.filter(jobInScope); }
function empInScope(e) { if (scopeAll()) return true; const l = empLink(e); return !!(l && crewInScope(l.crew)); }
function inboxInScope(i) { if (scopeAll()) return true; return i.to.some((p) => personIs(p, CUR)) || i.jobIds.some((id) => { const j = DB.jobs.find((x) => x.id === id); return j && jobInScope(j); }); }
function scopeLabel(u) {
  u = u || CUR; if (!u) return ''; if (scopeAll(u)) return 'النطاق: كل المكاتب والفرق';
  const L = DB.crews.filter((c) => crewInScope(c, u)); const n = L.length; return n ? 'النطاق: ' + (n === 1 ? 'فرقة ' : n + ' فرق: ') + L.slice(0, 4).map((c) => c.id).join('، ') + (n > 4 ? '…' : '') : 'لا فرق مرتبطة بالحساب بعد';
}
// wrap actions once after ACT is assembled
function applyActRules(ACT) {
  Object.keys(ACT_RULES).forEach((k) => {
    const f = ACT[k]; if (!f || f.__ruled) return; const [perm, scoped] = ACT_RULES[k];
    const g = function (d) {
      if (!need(perm)) return;
      if (scoped) { const c = (k === 'move-crew' || !d || !d.id || !crewById(d.id) ? curCrew() : crewById(d.id)); if (c && !crewInScope(c)) return toast('هذه الفرقة خارج نطاق صلاحيتك.', 'err'); }
      return f.apply(this, arguments);
    };
    g.__ruled = true; ACT[k] = g;
  });
  // field-transaction actions that name a job: the job must be inside the user's tree
  Object.keys(ACT).filter((k) => /^fl-(adv|gate|safety|ret|edit|coord|folder|open|goto)$/.test(k)).forEach((k) => {
    const f = ACT[k]; if (f.__jobScoped) return;
    const g = function (d) { const j = d && d.id && DB.jobs.find((x) => x.id === d.id); if (j && !jobInScope(j)) return toast('هذه المعاملة خارج نطاق فرقك.', 'err'); return f.apply(this, arguments); };
    g.__jobScoped = true; g.__ruled = f.__ruled; ACT[k] = g;
  });
}
function moveTargetOk(m) { if (!m || !m.target || m.kind === 'crew') return true; const c = crewById(m.target); return !!c && crewInScope(c); }

// users: scope editor
function scopeFields(u) {
  const s = u.scope || {};
  return [{ k: 'role', label: 'الدور الوظيفي', type: 'select', val: u.role, opts: Object.keys(ROLE_INFO).map((k) => [k, ROLE_INFO[k][0] + ' — ' + ROLE_INFO[k][1]]) },
    { k: 'offices', label: 'المكاتب / الفروع (لمدير المشروع)', type: 'checks', opts: [...new Set(DB.branches.concat(DB.lists.offices || []))].map((b) => [b, b]), val: s.offices || [] },
    { k: 'projects', label: 'المشاريع', type: 'checks', opts: (DB.projects || []).map((p) => [p.id, p.name]), val: s.projects || [] },
    { k: 'crews', label: 'فرق إضافية (يُربط المهندس والمراقب تلقائياً بفرقه بالإقامة أو الجوال)', type: 'checks', opts: DB.crews.map((c) => [c.id, c.id + ' · ' + c.name]), val: s.crews || [] }];
}
