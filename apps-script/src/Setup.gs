/**
 * الإعداد لمرة واحدة: شغّل setup من المحرر (اختر الدالة ← تشغيل).
 * ينشئ في Drive: مجلد «ميدان» وبداخله قاعدة البيانات (Google Sheets) ومجلدا المرفقات والنسخ الاحتياطية،
 * ويضيف حسابك كمشرف للمنصة، ويجدول نسخة احتياطية يومية.
 * آمن لإعادة التشغيل: لا يكرر إنشاء شيء موجود ولا يعيد زرع البيانات.
 */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var owner = Session.getEffectiveUser().getEmail();
  // بعد الإعداد الأول لا يُعاد التشغيل إلا من المالك داخل المحرر (يمنع استدعاءه من المتصفح)
  var active = '';
  try { active = Session.getActiveUser().getEmail(); } catch (e) { active = ''; }
  if (props.getProperty('SEEDED') && active !== owner) throw new Error('setup متاح للمالك من المحرر فقط');

  // 1) المجلدات
  var root = props.getProperty('ROOT_FOLDER_ID') ? DriveApp.getFolderById(props.getProperty('ROOT_FOLDER_ID')) : DriveApp.createFolder(MAYDAN.APP_NAME + ' — Maydan');
  props.setProperty('ROOT_FOLDER_ID', root.getId());
  if (!props.getProperty('ATTACH_FOLDER_ID')) props.setProperty('ATTACH_FOLDER_ID', root.createFolder('المرفقات').getId());
  if (!props.getProperty('BACKUP_FOLDER_ID')) props.setProperty('BACKUP_FOLDER_ID', root.createFolder('النسخ الاحتياطية').getId());

  // 2) قاعدة البيانات
  var ss;
  if (props.getProperty('SPREADSHEET_ID')) ss = SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'));
  else {
    ss = SpreadsheetApp.create(MAYDAN.APP_NAME + ' — قاعدة البيانات');
    props.setProperty('SPREADSHEET_ID', ss.getId());
    DriveApp.getFileById(ss.getId()).moveTo(root);
  }
  ss.setSpreadsheetLocale('ar');
  ss.setSpreadsheetTimeZone('Asia/Riyadh');
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var cols = SCHEMA[name];
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#0B1626').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@'); // نص: يحفظ الأصفار البادئة للجوالات والإقامات
    sh.setRightToLeft(true);
  });
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('ورقة1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  // حماية الأوراق: المالك فقط يعدّل مباشرة؛ الباقون عبر المنصة
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    var protections = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    var pr = protections.length ? protections[0] : sh.protect();
    pr.setDescription('ميدان — يُعدَّل عبر المنصة فقط');
    pr.removeEditors(pr.getEditors().filter(function (e) { return e.getEmail() !== owner; }));
    if (pr.canDomainEdit()) pr.setDomainEdit(false);
  });

  // 3) المشرف الأول = صاحب النشر
  clearCache_('Users');
  if (!userByEmail_(owner)) {
    insert_('Users', {
      id: newId_('U'), iqama: props.getProperty('ADMIN_IQAMA') || '', name: props.getProperty('ADMIN_NAME') || 'مشرف المنصة',
      role: 'admin', email: owner, phone: '', telegramChatId: '', personId: '', active: 'true', createdAt: now_(), lastLoginAt: ''
    });
  }

  // 4) البيانات
  if (MAYDAN.MODE === 'demo' && !props.getProperty('SEEDED')) { seedDemo_(owner); props.setProperty('SEEDED', 'demo'); }
  if (MAYDAN.MODE === 'clean' && !props.getProperty('SEEDED')) {
    insert_('Branches', { id: newId_('BR'), name: 'الفرع الرئيسي', districts: '', updatedAt: now_() });
    props.setProperty('SEEDED', 'clean');
  }

  // 5) النسخ الاحتياطي اليومي 2 فجراً
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'backupDaily'; });
  if (!has) ScriptApp.newTrigger('backupDaily').timeBased().atHour(2).everyDays(1).inTimezone('Asia/Riyadh').create();

  var msg = 'تم الإعداد ✔\nقاعدة البيانات: ' + ss.getUrl() + '\nمجلد Drive: ' + root.getUrl() + '\nالمشرف: ' + owner + '\nالوضع: ' + MAYDAN.MODE;
  console.log(msg);
  return msg;
}

/** يُشغَّل يومياً بالمشغّل الزمني. محمي من التكرار عند استدعائه من خارج المشغّل. */
function backupDaily() { return runBackup_(false); }

function runBackup_(force) {
  var last = Number(prop_('LAST_BACKUP_MS') || 0);
  if (!force && Date.now() - last < 20 * 3600 * 1000) return { skipped: true };
  if (force && Date.now() - last < 10 * 60 * 1000) return { skipped: true, reason: 'نسخة حديثة موجودة' };
  var folder = DriveApp.getFolderById(prop_('BACKUP_FOLDER_ID'));
  var name = MAYDAN.APP_NAME + ' — نسخة ' + Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH-mm');
  var copy = DriveApp.getFileById(prop_('SPREADSHEET_ID')).makeCopy(name, folder);
  setProp_('LAST_BACKUP_MS', Date.now());
  setProp_('LAST_BACKUP_AT', now_());
  // الاحتفاظ بآخر 30 نسخة
  var files = [], it = folder.getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); }).slice(30).forEach(function (f) { f.setTrashed(true); });
  return { ok: true, url: copy.getUrl(), name: name };
}

/** بيانات تجريبية: فرع، فرق حفريات وكهرباء وسلامة بمراقبيها وسياراتهم وعمالها ومعداتها وسائقيها */
function seedDemo_(ownerEmail) {
  var t = now_();
  var br = [
    { id: 'BR-N', name: 'فرع شمال الرياض', districts: 'النرجس، الخليج، الياسمين' },
    { id: 'BR-C', name: 'فرع وسط الرياض', districts: 'الملز، الربوة، الفيصلية' }
  ];
  br.forEach(function (b) { b.updatedAt = t; insert_('Branches', b); });

  var P = function (id, name, role, phone, crewId, iqama) {
    return { id: id, name: name, iqama: iqama || '', role: role, phone: phone || '', crewId: crewId, notes: '', active: 'true', updatedAt: t };
  };
  var people = [
    P('P-ENG1', 'م/يحي الشريف', 'engineer', '966500000301', 'CR-E07', '2100000002'),
    P('P-ENG2', 'م. عبدالله السيد', 'engineer', '966500000302', '', '2100000001'),
    // X-03 حفريات
    P('P-S1', 'أحمد سالم', 'supervisor', '966500000101', 'CR-X03', '2100000003'),
    P('P-W1', 'محمد رفيق', 'worker', '', 'CR-X03'), P('P-W2', 'سليم خان', 'worker', '966500000122', 'CR-X03'),
    P('P-W3', 'جمال عبدالقادر', 'worker', '', 'CR-X03'), P('P-W4', 'نور حسين', 'worker', '', 'CR-X03'),
    P('P-D1', 'عمران علي', 'driver', '966500000111', 'CR-X03'), P('P-D2', 'رشيد أحمد', 'driver', '966500000112', 'CR-X03'),
    P('P-D3', 'ياسر محمود', 'operator', '966500000113', 'CR-X03'), P('P-D4', 'فيصل كريم', 'operator', '966500000114', 'CR-X03'),
    P('P-D5', 'شاهد إقبال', 'operator', '', 'CR-X03'), P('P-D6', 'خالد يوسف', 'driver', '966500000116', 'CR-X03'),
    // X-05 حفريات
    P('P-S2', 'سعيد مراد', 'supervisor', '966500000201', 'CR-X05'),
    P('P-W5', 'عادل باشا', 'worker', '', 'CR-X05'), P('P-W6', 'حسن شريف', 'worker', '', 'CR-X05'),
    P('P-D7', 'منير سعد', 'operator', '966500000211', 'CR-X05'),
    // E-07 كهرباء
    P('P-S3', 'طلال العتيبي', 'supervisor', '966500000311', 'CR-E07'),
    P('P-T1', 'طارق جميل', 'technician', '966500000321', 'CR-E07'), P('P-T2', 'بلال نعيم', 'technician', '', 'CR-E07'),
    P('P-D8', 'ناصر حمدي', 'driver', '966500000312', 'CR-E07'),
    // S-02 سلامة
    P('P-S4', 'وليد عيسى', 'supervisor', '966500000401', 'CR-S02'), P('P-T3', 'كمال سيد', 'technician', '', 'CR-S02')
  ];
  people.forEach(function (p) { insert_('People', p); });

  var C = function (id, name, type, branchId, sup, eng, district, lat, lng) {
    return { id: id, name: name, type: type, branchId: branchId, supervisorId: sup, engineerId: eng, district: district, lat: String(lat), lng: String(lng), locAt: t, active: 'true', updatedAt: t };
  };
  [
    C('CR-X03', 'فرقة حفريات X-03', 'excav', 'BR-N', 'P-S1', 'P-ENG1', 'حي النرجس', 24.8442, 46.6612),
    C('CR-X05', 'فرقة حفريات X-05', 'excav', 'BR-C', 'P-S2', 'P-ENG2', 'حي الملز', 24.6630, 46.7350),
    C('CR-E07', 'فرقة كهرباء E-07 (GCB)', 'elec', 'BR-N', 'P-S3', 'P-ENG1', 'حي النرجس', 24.8355, 46.6555),
    C('CR-S02', 'فرقة سلامة S-02', 'safety', 'BR-C', 'P-S4', 'P-ENG2', 'حي الربوة', 24.6905, 46.7610)
  ].forEach(function (c) { insert_('Crews', c); });

  var E = function (id, kind, code, plate, crewId, driverId, ownerId, status, oil, insp) {
    return { id: id, kind: kind, code: code, plate: plate, crewId: crewId, driverId: driverId, ownerId: ownerId, status: status, oilRemainKm: String(oil), nextOilDate: '', inspExpiry: insp, notes: '', updatedAt: t };
  };
  [
    E('EQ-112', 'حفار JCB', 'EQ-112', '', 'CR-X03', 'P-D1', '', 'ok', 900, '2027-03-31'),
    E('EQ-118', 'حفار JCB', 'EQ-118', '', 'CR-X03', 'P-D2', '', 'due', -150, '2027-01-15'),
    E('EQ-205', 'ترنشر', 'EQ-205', '', 'CR-X03', 'P-D3', '', 'ok', 2200, '2027-05-01'),
    E('EQ-087', 'بوبكات', 'EQ-087', '', 'CR-X03', 'P-D4', '', 'shop', 0, '2026-10-30'),
    E('EQ-310', 'بروش مكنسة', 'EQ-310', '', 'CR-X03', 'P-D5', '', 'ok', 400, '2027-02-10'),
    E('TR-41', 'شاحنة ديانا', 'TR-41', 'ر س ع 7713', 'CR-X03', 'P-D6', '', 'ok', 1300, '2027-04-20'),
    E('CAR-S1', 'سيارة مراقب — هايلكس', 'CAR-S1', 'أ ب ج 4521', 'CR-X03', 'P-S1', 'P-S1', 'ok', 1800, '2027-06-01'),
    E('EQ-121', 'حفار JCB', 'EQ-121', '', 'CR-X05', 'P-D7', '', 'shop', 0, '2027-02-01'),
    E('TR-52', 'شاحنة ديانا', 'TR-52', 'ط ي ك 5120', 'CR-X05', '', '', 'ok', 2500, '2027-03-01'),
    E('CAR-S2', 'سيارة مراقب — نافارا', 'CAR-S2', 'د هـ و 3390', 'CR-X05', 'P-S2', 'P-S2', 'due', -300, '2027-01-20'),
    E('EQ-140', 'ونش كابلات', 'EQ-140', 'ل م ن 2210', 'CR-E07', 'P-D8', '', 'ok', 1100, '2027-02-28'),
    E('CAR-S3', 'سيارة مراقب — لاندكروزر', 'CAR-S3', 'ل م ن 1188', 'CR-E07', 'P-S3', 'P-S3', 'ok', 650, '2027-05-15'),
    E('CAR-S4', 'سيارة مراقب — هايلكس', 'CAR-S4', 'س ص ق 6045', 'CR-S02', 'P-S4', 'P-S4', 'ok', 3000, '2027-07-01')
  ].forEach(function (e) { insert_('Equipment', e); });

  // مستخدمون تجريبيون: الرموز تصل إلى بريد صاحب النشر
  [
    { iqama: '2100000001', name: 'م. عبدالله السيد', role: 'pm', personId: 'P-ENG2' },
    { iqama: '2100000002', name: 'م/يحي الشريف', role: 'eng', personId: 'P-ENG1' },
    { iqama: '2100000003', name: 'أحمد سالم', role: 'supervisor', personId: 'P-S1' }
  ].forEach(function (u) {
    insert_('Users', { id: newId_('U'), iqama: u.iqama, name: u.name, role: u.role, email: ownerEmail, phone: '', telegramChatId: '', personId: u.personId, active: 'true', createdAt: t, lastLoginAt: '' });
  });

  [
    { title: 'تجهيز حفرية GCB — R7047', crewId: 'CR-X03', district: 'حي النرجس' },
    { title: 'تمديد كابل جهد متوسط — R6580', crewId: 'CR-E07', district: 'حي النرجس' },
    { title: 'جولة سلامة وإغلاق موقع', crewId: 'CR-S02', district: 'حي الربوة' }
  ].forEach(function (j, i) { insert_('Jobs', { id: newId_('JOB'), title: j.title, crewId: j.crewId, district: j.district, order: String(i + 1), status: 'open', updatedAt: t }); });
}
