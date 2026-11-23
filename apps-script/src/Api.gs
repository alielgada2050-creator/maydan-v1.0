/**
 * نقطة الدخول للواجهة وواجهة البرمجة الموحدة.
 * كل طلب يمر عبر api(token, action, payload): تحقق من الجلسة ← تحقق من الصلاحية ← تحقق من المدخلات ← تنفيذ ← سجل تدقيق.
 */

function doGet() {
  var t = HtmlService.createTemplateFromFile('Index');
  t.appName = MAYDAN.APP_NAME;
  return t.evaluate()
    .setTitle(MAYDAN.APP_NAME + ' — إدارة الفرق والمعدات')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/* ---------- التحقق من المدخلات ---------- */
function str_(v, max, required, label) {
  var s = String(v === undefined || v === null ? '' : v).trim();
  if (required && !s) throw new Error('الحقل مطلوب: ' + (label || ''));
  if (s.length > (max || 200)) throw new Error('النص طويل جداً: ' + (label || ''));
  return s;
}
function enum_(v, allowed, label) {
  if (allowed.indexOf(v) < 0) throw new Error('قيمة غير صالحة: ' + (label || ''));
  return v;
}
/** يوحّد الجوال إلى صيغة دولية: 05xxxxxxxx ← 9665xxxxxxxx */
function phone_(v) {
  var d = String(v || '').replace(/\D/g, '');
  if (!d) return '';
  if (/^05\d{8}$/.test(d)) d = '966' + d.slice(1);
  else if (/^5\d{8}$/.test(d)) d = '966' + d;
  else if (/^00\d+$/.test(d)) d = d.slice(2);
  if (d.length < 8 || d.length > 15) throw new Error('رقم الجوال غير صالح');
  return d;
}
function num_(v, min, max, label) {
  if (v === '' || v === null || v === undefined) return '';
  var n = Number(v);
  if (isNaN(n) || n < min || n > max) throw new Error('رقم غير صالح: ' + (label || ''));
  return String(n);
}
function date_(v) {
  var s = String(v || '').trim();
  if (!s) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('التاريخ يجب أن يكون بصيغة YYYY-MM-DD');
  return s;
}
function iqamaOpt_(v) {
  var s = String(v || '').trim();
  if (s && !validIqama_(s)) throw new Error('رقم الإقامة/الهوية غير صالح');
  return s;
}
function exists_(table, id, label) {
  if (!id) return '';
  if (!findById_(table, id)) throw new Error('غير موجود: ' + (label || table));
  return String(id);
}

/* ---------- الصلاحيات ---------- */
var PERMS_ = {
  'bootstrap': ['admin', 'pm', 'eng', 'supervisor', 'viewer'],
  'notif.read': ['admin', 'pm', 'eng', 'supervisor', 'viewer'],
  'person.save': ['admin', 'pm', 'eng', 'supervisor'],
  'person.delete': ['admin', 'pm'],
  'equipment.save': ['admin', 'pm', 'eng'],
  'equipment.delete': ['admin', 'pm'],
  'crew.save': ['admin', 'pm', 'eng'],
  'crew.delete': ['admin', 'pm'],
  'branch.save': ['admin', 'pm'],
  'move.equipment': ['admin', 'pm', 'eng'],
  'move.person': ['admin', 'pm', 'eng'],
  'location.update': ['admin', 'pm', 'eng', 'supervisor'],
  'request.create': ['admin', 'pm', 'eng', 'supervisor'],
  'request.assign': ['admin', 'pm', 'eng'],
  'request.close': ['admin', 'pm', 'eng'],
  'job.save': ['admin', 'pm', 'eng'],
  'jobs.reorder': ['admin', 'pm', 'eng'],
  'users.list': ['admin'],
  'user.save': ['admin'],
  'audit.list': ['admin', 'pm'],
  'ai.ask': ['admin', 'pm', 'eng'],
  'attach.upload': ['admin', 'pm', 'eng', 'supervisor'],
  'attach.list': ['admin', 'pm', 'eng', 'supervisor', 'viewer'],
  'settings.get': ['admin'],
  'backup.now': ['admin']
};

/** هل المراقب مسؤول عن هذه الفرقة؟ */
function supervises_(me, crewId) {
  if (me.role !== 'supervisor') return true;
  var c = findById_('Crews', crewId);
  return !!(c && me.personId && c.supervisorId === me.personId);
}

/** الدالة الوحيدة لكل العمليات بعد الدخول */
function api(token, action, payload) {
  try {
    var me = sessionUser_(token);
    if (!me) return { ok: false, auth: false, error: 'انتهت الجلسة. سجّل الدخول من جديد.' };
    action = String(action || '');
    var allowed = PERMS_[action];
    if (!allowed) return { ok: false, error: 'عملية غير معروفة' };
    if (allowed.indexOf(me.role) < 0) {
      audit_(me, 'denied', action, '', {});
      return { ok: false, error: 'ليست لديك صلاحية لهذه العملية' };
    }
    var data = ACTIONS_[action](me, payload || {});
    return { ok: true, data: data };
  } catch (e) {
    console.error(action, e);
    return { ok: false, error: e && e.message ? e.message : 'خطأ غير متوقع' };
  }
}

var ACTIONS_ = {
  'bootstrap': function (me) {
    var eq = readAll_('Equipment');
    var crews = readAll_('Crews').filter(function (c) { return c.active !== 'false'; }).map(function (c) {
      var o = strip_(c); o.readiness = crewReadiness_(c, eq); return o;
    });
    var users = readAll_('Users');
    return {
      me: { id: me.id, name: me.name, role: me.role, roleName: MAYDAN.ROLE_NAMES[me.role], personId: me.personId },
      config: {
        mode: MAYDAN.MODE, version: MAYDAN.VERSION, oilWarnKm: MAYDAN.OIL_WARN_KM, proximityKm: MAYDAN.PROXIMITY_KM,
        crewTypes: MAYDAN.CREW_TYPES, personRoles: MAYDAN.PERSON_ROLES, equipStatus: MAYDAN.EQUIP_STATUS,
        requestStatus: MAYDAN.REQUEST_STATUS, roleNames: MAYDAN.ROLE_NAMES, today: today_(),
        driveUrl: prop_('ROOT_FOLDER_ID') ? 'https://drive.google.com/drive/folders/' + prop_('ROOT_FOLDER_ID') : '',
        sheetUrl: (me.role === 'admin' || me.role === 'pm') && prop_('SPREADSHEET_ID') ? 'https://docs.google.com/spreadsheets/d/' + prop_('SPREADSHEET_ID') : ''
      },
      branches: readAll_('Branches').map(strip_),
      crews: crews,
      people: readAll_('People').filter(function (p) { return p.active !== 'false'; }).map(function (p) {
        var o = strip_(p);
        if (me.role === 'viewer') o.iqama = '';
        else if (o.iqama && me.role !== 'admin' && me.role !== 'pm') o.iqama = '••••••' + o.iqama.slice(-4);
        return o;
      }),
      equipment: eq.map(strip_),
      requests: readAll_('Requests').filter(function (r) { return r.status !== 'closed'; }).map(strip_),
      jobs: readAll_('Jobs').filter(function (j) { return j.status !== 'done'; }).map(strip_).sort(function (a, b) { return Number(a.order) - Number(b.order); }),
      notifications: readAll_('Notifications').filter(function (n) { return n.toUserId === me.id; }).slice(-30).reverse().map(strip_),
      staffUsers: users.filter(function (u) { return u.active !== 'false' && ['admin', 'pm', 'eng'].indexOf(u.role) >= 0; }).map(function (u) { return { id: u.id, name: u.name, role: u.role, personId: u.personId }; })
    };
  },

  'notif.read': function (me) {
    readAll_('Notifications').filter(function (n) { return n.toUserId === me.id && n.status === 'new'; }).forEach(function (n) { update_('Notifications', n.id, { status: 'read' }); });
    return true;
  },

  'person.save': function (me, p) {
    var masked = String(p.iqama || '').indexOf('•') >= 0;
    if (masked) p.iqama = '';
    var rec = {
      name: str_(p.name, 80, true, 'الاسم'),
      iqama: iqamaOpt_(p.iqama),
      role: enum_(p.role, Object.keys(MAYDAN.PERSON_ROLES), 'الدور'),
      phone: phone_(p.phone),
      crewId: exists_('Crews', p.crewId, 'الفرقة'),
      notes: str_(p.notes, 300),
      active: 'true', updatedAt: now_()
    };
    if (me.role === 'supervisor' && !supervises_(me, rec.crewId)) throw new Error('يمكنك تعديل أفراد فرقتك فقط');
    if (p.id) {
      var old = findById_('People', p.id);
      if (!old) throw new Error('الفرد غير موجود');
      if (me.role === 'supervisor' && !supervises_(me, old.crewId)) throw new Error('يمكنك تعديل أفراد فرقتك فقط');
      if (masked) rec.iqama = old.iqama; // قيمة مقنّعة لم تتغير
      update_('People', p.id, rec);
      audit_(me, 'person.update', 'People', p.id, { name: rec.name, crewId: rec.crewId });
      return findById_('People', p.id) && strip_(findById_('People', p.id));
    }
    rec.id = newId_('P');
    insert_('People', rec);
    audit_(me, 'person.create', 'People', rec.id, { name: rec.name, crewId: rec.crewId });
    return rec;
  },

  'person.delete': function (me, p) {
    var old = findById_('People', p.id);
    if (!old) throw new Error('الفرد غير موجود');
    update_('People', p.id, { active: 'false', crewId: '', updatedAt: now_() });
    readAll_('Equipment').filter(function (e) { return e.driverId === p.id; }).forEach(function (e) { update_('Equipment', e.id, { driverId: '', updatedAt: now_() }); });
    readAll_('Crews').filter(function (c) { return c.supervisorId === p.id; }).forEach(function (c) { update_('Crews', c.id, { supervisorId: '', updatedAt: now_() }); });
    audit_(me, 'person.archive', 'People', p.id, { name: old.name });
    return true;
  },

  'equipment.save': function (me, p) {
    var rec = {
      kind: str_(p.kind, 60, true, 'نوع المعدة'),
      code: str_(p.code, 40, true, 'رقم المعدة'),
      plate: str_(p.plate, 30),
      crewId: exists_('Crews', p.crewId, 'الفرقة'),
      driverId: exists_('People', p.driverId, 'السائق'),
      ownerId: exists_('People', p.ownerId, 'المراقب'),
      status: enum_(p.status || 'ok', Object.keys(MAYDAN.EQUIP_STATUS), 'الحالة'),
      oilRemainKm: num_(p.oilRemainKm, -100000, 100000, 'غيار الزيت'),
      nextOilDate: date_(p.nextOilDate),
      inspExpiry: date_(p.inspExpiry),
      notes: str_(p.notes, 300),
      updatedAt: now_()
    };
    if (p.id) {
      if (!findById_('Equipment', p.id)) throw new Error('المعدة غير موجودة');
      update_('Equipment', p.id, rec);
      audit_(me, 'equipment.update', 'Equipment', p.id, { code: rec.code, status: rec.status });
      return strip_(findById_('Equipment', p.id));
    }
    rec.id = newId_('EQ');
    insert_('Equipment', rec);
    audit_(me, 'equipment.create', 'Equipment', rec.id, { code: rec.code });
    return rec;
  },

  'equipment.delete': function (me, p) {
    var old = findById_('Equipment', p.id);
    if (!old) throw new Error('المعدة غير موجودة');
    remove_('Equipment', p.id);
    audit_(me, 'equipment.delete', 'Equipment', p.id, { code: old.code });
    return true;
  },

  'crew.save': function (me, p) {
    var rec = {
      name: str_(p.name, 80, true, 'اسم الفرقة'),
      type: enum_(p.type, Object.keys(MAYDAN.CREW_TYPES), 'نوع الفرقة'),
      branchId: exists_('Branches', p.branchId, 'الفرع'),
      supervisorId: exists_('People', p.supervisorId, 'المراقب'),
      engineerId: exists_('People', p.engineerId, 'المهندس'),
      district: str_(p.district, 80),
      active: 'true', updatedAt: now_()
    };
    if (p.id) {
      if (!findById_('Crews', p.id)) throw new Error('الفرقة غير موجودة');
      update_('Crews', p.id, rec);
      if (rec.supervisorId) update_('People', rec.supervisorId, { crewId: p.id, role: 'supervisor', updatedAt: now_() });
      audit_(me, 'crew.update', 'Crews', p.id, { name: rec.name });
      return strip_(findById_('Crews', p.id));
    }
    rec.id = newId_('CR');
    rec.lat = ''; rec.lng = ''; rec.locAt = '';
    insert_('Crews', rec);
    if (rec.supervisorId) update_('People', rec.supervisorId, { crewId: rec.id, role: 'supervisor', updatedAt: now_() });
    audit_(me, 'crew.create', 'Crews', rec.id, { name: rec.name });
    return rec;
  },

  'crew.delete': function (me, p) {
    var c = findById_('Crews', p.id);
    if (!c) throw new Error('الفرقة غير موجودة');
    var busy = readAll_('People').some(function (x) { return x.crewId === p.id && x.active !== 'false'; }) || readAll_('Equipment').some(function (e) { return e.crewId === p.id; });
    if (busy) throw new Error('انقل أفراد الفرقة ومعداتها أولاً');
    update_('Crews', p.id, { active: 'false', updatedAt: now_() });
    audit_(me, 'crew.archive', 'Crews', p.id, { name: c.name });
    return true;
  },

  'branch.save': function (me, p) {
    var rec = { name: str_(p.name, 80, true, 'اسم الفرع'), districts: str_(p.districts, 300), updatedAt: now_() };
    if (p.id) { update_('Branches', p.id, rec); audit_(me, 'branch.update', 'Branches', p.id, rec); return strip_(findById_('Branches', p.id)); }
    rec.id = newId_('BR'); insert_('Branches', rec); audit_(me, 'branch.create', 'Branches', rec.id, rec); return rec;
  },

  'move.equipment': function (me, p) {
    var e = findById_('Equipment', p.equipId);
    if (!e) throw new Error('المعدة غير موجودة');
    var to = findById_('Crews', p.toCrewId);
    if (!to) throw new Error('الفرقة المستلمة غير موجودة');
    var from = e.crewId;
    var patch = { crewId: to.id, updatedAt: now_() };
    if (p.withDriver && e.driverId) update_('People', e.driverId, { crewId: to.id, updatedAt: now_() });
    if (!p.withDriver) patch.driverId = '';
    update_('Equipment', e.id, patch);
    audit_(me, 'move.equipment', 'Equipment', e.id, { from: from, to: to.id, withDriver: !!p.withDriver });
    notifyCrewLeads_([from, to.id], 'نقل معدة', 'نُقلت ' + e.kind + ' ' + e.code + (p.withDriver ? ' مع سائقها' : ' بدون سائق') + ' إلى ' + to.name + ' بواسطة ' + me.name + '.', e.id);
    return true;
  },

  'move.person': function (me, p) {
    var person = findById_('People', p.personId);
    if (!person) throw new Error('الفرد غير موجود');
    var to = findById_('Crews', p.toCrewId);
    if (!to) throw new Error('الفرقة المستلمة غير موجودة');
    var from = person.crewId;
    update_('People', person.id, { crewId: to.id, updatedAt: now_() });
    readAll_('Equipment').filter(function (e) { return e.driverId === person.id && e.crewId !== to.id; }).forEach(function (e) { update_('Equipment', e.id, { driverId: '', updatedAt: now_() }); });
    readAll_('Crews').filter(function (c) { return c.supervisorId === person.id && c.id !== to.id; }).forEach(function (c) { update_('Crews', c.id, { supervisorId: '', updatedAt: now_() }); });
    audit_(me, 'move.person', 'People', person.id, { from: from, to: to.id });
    notifyCrewLeads_([from, to.id], 'نقل فرد', 'نُقل ' + person.name + ' إلى ' + to.name + ' بواسطة ' + me.name + '.', person.id);
    return true;
  },

  'location.update': function (me, p) {
    var c = findById_('Crews', p.crewId);
    if (!c) throw new Error('الفرقة غير موجودة');
    if (!supervises_(me, c.id)) throw new Error('يمكنك تحديث موقع فرقتك فقط');
    var lat = num_(p.lat, 16, 33, 'خط العرض'), lng = num_(p.lng, 34, 56, 'خط الطول'); // حدود المملكة تقريباً
    update_('Crews', c.id, { lat: lat, lng: lng, locAt: now_() });
    return { lat: lat, lng: lng, locAt: now_() };
  },

  'request.create': function (me, p) {
    var crew = findById_('Crews', p.crewId);
    if (!crew) throw new Error('الفرقة الطالبة غير موجودة');
    if (!supervises_(me, crew.id)) throw new Error('يمكنك الطلب لفرقتك فقط');
    var needed = enum_(p.neededType, Object.keys(MAYDAN.CREW_TYPES), 'نوع الفرقة المطلوبة');
    var lat = p.lat !== undefined && p.lat !== '' ? num_(p.lat, 16, 33, 'خط العرض') : crew.lat;
    var lng = p.lng !== undefined && p.lng !== '' ? num_(p.lng, 34, 56, 'خط الطول') : crew.lng;
    if (!lat || !lng) throw new Error('حدّث موقع الفرقة أولاً حتى يتم البحث عن الفرق القريبة');
    var nearby = findNearby_(lat, lng, needed, MAYDAN.PROXIMITY_KM, crew.id);
    var rec = {
      id: newId_('REQ'), neededType: needed, title: str_(p.title, 160, true, 'وصف الطلب'), crewId: crew.id,
      district: crew.district, lat: lat, lng: lng, status: 'open', assignedCrewId: '',
      nearbyJson: JSON.stringify(nearby), createdBy: me.id, createdAt: now_(), updatedAt: now_()
    };
    insert_('Requests', rec);
    audit_(me, 'request.create', 'Requests', rec.id, { needed: needed, nearby: nearby.length });

    var near = nearby.filter(function (n) { return n.inRadius; })[0];
    var body = 'طلبت ' + crew.name + ' (' + (crew.district || '') + ') فرقة ' + MAYDAN.CREW_TYPES[needed] + ': ' + rec.title + '.\n' +
      (near ? 'أقرب فرقة متاحة: ' + near.name + ' على بُعد ' + near.km + ' كم — يمكن إسنادها مباشرة.' :
        nearby[0] ? 'لا توجد فرقة ضمن ' + MAYDAN.PROXIMITY_KM + ' كم. الأقرب: ' + nearby[0].name + ' (' + nearby[0].km + ' كم).' : 'لا توجد فرقة متاحة من هذا النوع حالياً.');
    var extra = [];
    var eng = crew.engineerId && readAll_('Users').filter(function (u) { return u.personId === crew.engineerId && u.active !== 'false'; })[0];
    if (eng) extra.push(eng);
    notifyRoles_(['admin', 'pm'], near ? 'فرقة قريبة متاحة لطلبك' : 'طلب فرقة جديد', body, rec.id, extra);
    return { request: rec, nearby: nearby };
  },

  'request.assign': function (me, p) {
    var r = findById_('Requests', p.id);
    if (!r) throw new Error('الطلب غير موجود');
    var c = findById_('Crews', p.crewId);
    if (!c) throw new Error('الفرقة غير موجودة');
    update_('Requests', r.id, { status: 'assigned', assignedCrewId: c.id, updatedAt: now_() });
    var maxOrder = readAll_('Jobs').reduce(function (m, j) { return Math.max(m, Number(j.order) || 0); }, 0);
    insert_('Jobs', { id: newId_('JOB'), title: r.title, crewId: c.id, district: r.district, order: String(maxOrder + 1), status: 'open', updatedAt: now_() });
    audit_(me, 'request.assign', 'Requests', r.id, { crewId: c.id });
    notifyCrewLeads_([r.crewId, c.id], 'تم إسناد الطلب', 'أُسند الطلب «' + r.title + '» إلى ' + c.name + ' بواسطة ' + me.name + '.', r.id);
    return true;
  },

  'request.close': function (me, p) {
    if (!findById_('Requests', p.id)) throw new Error('الطلب غير موجود');
    update_('Requests', p.id, { status: 'closed', updatedAt: now_() });
    audit_(me, 'request.close', 'Requests', p.id, { reason: str_(p.reason, 200) });
    return true;
  },

  'job.save': function (me, p) {
    var rec = { title: str_(p.title, 160, true, 'العمل'), crewId: exists_('Crews', p.crewId, 'الفرقة'), district: str_(p.district, 80), status: enum_(p.status || 'open', ['open', 'done'], 'الحالة'), updatedAt: now_() };
    if (p.id) { update_('Jobs', p.id, rec); audit_(me, 'job.update', 'Jobs', p.id, rec); return true; }
    rec.id = newId_('JOB');
    rec.order = String(readAll_('Jobs').length + 1);
    insert_('Jobs', rec); audit_(me, 'job.create', 'Jobs', rec.id, rec); return rec;
  },

  'jobs.reorder': function (me, p) {
    if (!Array.isArray(p.ids) || p.ids.length > 500) throw new Error('ترتيب غير صالح');
    p.ids.forEach(function (id, i) { if (findById_('Jobs', id)) update_('Jobs', id, { order: String(i + 1), updatedAt: now_() }); });
    audit_(me, 'jobs.reorder', 'Jobs', '', { count: p.ids.length });
    return true;
  },

  'users.list': function () {
    return readAll_('Users').map(function (u) { var o = strip_(u); return o; });
  },

  'user.save': function (me, p) {
    var rec = {
      iqama: iqamaOpt_(p.iqama),
      name: str_(p.name, 80, true, 'الاسم'),
      role: enum_(p.role, MAYDAN.ROLES, 'الدور'),
      email: str_(p.email, 120).toLowerCase(),
      phone: phone_(p.phone),
      telegramChatId: str_(p.telegramChatId, 40),
      personId: exists_('People', p.personId, 'الفرد المرتبط'),
      active: p.active === false || p.active === 'false' ? 'false' : 'true'
    };
    if (rec.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rec.email)) throw new Error('البريد غير صالح');
    if (!rec.iqama && !rec.email) throw new Error('أدخل رقم الإقامة أو البريد على الأقل');
    var dup = readAll_('Users').filter(function (u) { return u.id !== p.id && ((rec.iqama && u.iqama === rec.iqama) || (MAYDAN.MODE !== 'demo' && rec.email && String(u.email).toLowerCase() === rec.email)); })[0];
    if (dup) throw new Error('يوجد مستخدم بنفس رقم الإقامة أو البريد');
    if (p.id) {
      if (p.id === me.id && (rec.role !== 'admin' || rec.active === 'false')) throw new Error('لا يمكنك إزالة صلاحية المشرف عن نفسك');
      update_('Users', p.id, rec);
      audit_(me, 'user.update', 'Users', p.id, { role: rec.role, active: rec.active });
      return true;
    }
    rec.id = newId_('U'); rec.createdAt = now_();
    insert_('Users', rec);
    audit_(me, 'user.create', 'Users', rec.id, { role: rec.role });
    return true;
  },

  'audit.list': function () {
    var a = readAll_('Audit');
    return a.slice(-300).reverse().map(strip_);
  },

  'ai.ask': function (me, p) {
    var q = str_(p.question, 1500, true, 'السؤال');
    var k = 'ai:' + me.id, n = cget_(k) || 0;
    if (n >= 30) throw new Error('تجاوزت حد الأسئلة لهذه الساعة');
    cput_(k, n + 1, 3600);
    var r = askAI_(q);
    audit_(me, 'ai.ask', 'AI', '', { provider: r.provider || '', ok: r.ok });
    if (!r.ok) throw new Error(r.error);
    return r;
  },

  'attach.upload': function (me, p) {
    var entity = enum_(p.entity, ['Crews', 'People', 'Equipment', 'Requests'], 'النوع');
    if (!findById_(entity, p.entityId)) throw new Error('السجل غير موجود');
    var mime = enum_(p.mime, MAYDAN.UPLOAD_MIME, 'نوع الملف');
    var bytes = Utilities.base64Decode(String(p.base64 || ''));
    if (bytes.length > MAYDAN.MAX_UPLOAD_MB * 1024 * 1024) throw new Error('الملف أكبر من ' + MAYDAN.MAX_UPLOAD_MB + ' ميجابايت');
    var name = str_(p.name, 120, true, 'اسم الملف').replace(/[\\/:*?"<>|]/g, '_');
    var folder = DriveApp.getFolderById(prop_('ATTACH_FOLDER_ID'));
    var file = folder.createFile(Utilities.newBlob(bytes, mime, name));
    var rec = { id: newId_('ATT'), entity: entity, entityId: p.entityId, name: name, mime: mime, fileId: file.getId(), url: file.getUrl(), by: me.name, at: now_() };
    insert_('Attachments', rec);
    audit_(me, 'attach.upload', entity, p.entityId, { name: name });
    return rec;
  },

  'attach.list': function (me, p) {
    return readAll_('Attachments').filter(function (a) { return a.entity === p.entity && a.entityId === p.entityId; }).map(strip_);
  },

  'settings.get': function () {
    return {
      mode: MAYDAN.MODE,
      spreadsheet: !!prop_('SPREADSHEET_ID'),
      drive: !!prop_('ROOT_FOLDER_ID'),
      telegram: !!prop_('TELEGRAM_BOT_TOKEN'),
      sms: !!prop_('TWILIO_SID'),
      mailQuota: MailApp.getRemainingDailyQuota(),
      ai: aiStatus_(),
      lastBackup: prop_('LAST_BACKUP_AT')
    };
  },

  'backup.now': function (me) {
    var r = runBackup_(true);
    audit_(me, 'backup.now', 'Drive', '', r);
    return r;
  }
};

/** يبلّغ مراقب ومهندس كل فرقة معنية + مدراء المشاريع */
function notifyCrewLeads_(crewIds, title, body, refId) {
  var users = readAll_('Users').filter(function (u) { return u.active !== 'false'; });
  var extra = [];
  crewIds.forEach(function (cid) {
    var c = cid && findById_('Crews', cid);
    if (!c) return;
    users.forEach(function (u) { if (u.personId && (u.personId === c.supervisorId || u.personId === c.engineerId)) extra.push(u); });
  });
  notifyRoles_(['pm'], title, body, refId, extra);
}
