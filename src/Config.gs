/**
 * ميدان — Maydan Field Operations
 * الإعدادات العامة. المفاتيح السرية لا تُكتب هنا أبداً:
 * تُحفظ في: إعدادات المشروع ← خصائص النص البرمجي (Script Properties).
 */
var DEFAULT_MODE = 'clean';   // 'demo' = بيانات تجريبية | 'clean' = نسخة نظيفة للاستخدام الفعلي

var MAYDAN = {
  // يمكن تغيير الوضع دون تعديل الكود: خاصية MAYDAN_MODE = demo أو clean (قبل تشغيل setup)
  MODE: (function () {
    try { var m = PropertiesService.getScriptProperties().getProperty('MAYDAN_MODE'); return m === 'demo' || m === 'clean' ? m : DEFAULT_MODE; }
    catch (e) { return DEFAULT_MODE; }
  })(),
  APP_NAME: 'ميدان',
  VERSION: '1.0.0',

  // الدخول برقم الإقامة + رمز التحقق
  OTP_TTL_SEC: 300,          // صلاحية الرمز 5 دقائق
  OTP_MAX_TRIES: 3,          // محاولات إدخال الرمز
  OTP_RESEND_SEC: 60,        // إعادة الإرسال بعد 60 ثانية
  OTP_MAX_PER_WINDOW: 3,     // أقصى عدد رموز في النافذة
  OTP_WINDOW_SEC: 900,       // نافذة 15 دقيقة
  LOCK_AFTER: 5,             // قفل بعد 5 محاولات خاطئة
  LOCK_SEC: 900,             // مدة القفل 15 دقيقة
  SESSION_IDLE_SEC: 1800,    // الجلسة تنتهي بعد 30 دقيقة خمول

  // التشغيل الميداني
  PROXIMITY_KM: 1.5,         // نطاق البحث عن فرقة قريبة
  OIL_WARN_KM: 500,          // تنبيه غيار الزيت قبل هذه المسافة
  MAX_UPLOAD_MB: 5,
  UPLOAD_MIME: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],

  ROLES: ['admin', 'pm', 'eng', 'supervisor', 'viewer'],
  ROLE_NAMES: { admin: 'مشرف المنصة', pm: 'مدير مشروع', eng: 'مهندس', supervisor: 'مراقب', viewer: 'مشاهد' },
  CREW_TYPES: { excav: 'حفريات', elec: 'كهرباء', civil: 'مدني', safety: 'سلامة', supply: 'إمداد ولوجستيات', other: 'أخرى' },
  PERSON_ROLES: { engineer: 'مهندس', supervisor: 'مراقب', technician: 'فني', worker: 'عامل', driver: 'سائق', operator: 'مشغّل معدة' },
  EQUIP_STATUS: { ok: 'تعمل', due: 'تحتاج صيانة', shop: 'في الورشة', out: 'خارج الخدمة' },
  REQUEST_STATUS: { open: 'مفتوح', assigned: 'تم الإسناد', closed: 'مغلق' }
};

/** جداول قاعدة البيانات (أوراق Google Sheets) وأعمدتها */
var SCHEMA = {
  Users:         ['id', 'iqama', 'name', 'role', 'email', 'phone', 'telegramChatId', 'personId', 'active', 'createdAt', 'lastLoginAt'],
  Branches:      ['id', 'name', 'districts', 'updatedAt'],
  Crews:         ['id', 'name', 'type', 'branchId', 'supervisorId', 'engineerId', 'district', 'lat', 'lng', 'locAt', 'active', 'updatedAt'],
  People:        ['id', 'name', 'iqama', 'role', 'phone', 'crewId', 'notes', 'active', 'updatedAt'],
  Equipment:     ['id', 'kind', 'code', 'plate', 'crewId', 'driverId', 'ownerId', 'status', 'oilRemainKm', 'nextOilDate', 'inspExpiry', 'notes', 'updatedAt'],
  Requests:      ['id', 'neededType', 'title', 'crewId', 'district', 'lat', 'lng', 'status', 'assignedCrewId', 'nearbyJson', 'createdBy', 'createdAt', 'updatedAt'],
  Jobs:          ['id', 'title', 'crewId', 'district', 'order', 'status', 'updatedAt'],
  Notifications: ['id', 'at', 'toUserId', 'title', 'body', 'channel', 'status', 'refId'],
  Attachments:   ['id', 'entity', 'entityId', 'name', 'mime', 'fileId', 'url', 'by', 'at'],
  Audit:         ['at', 'userId', 'userName', 'action', 'entity', 'entityId', 'details']
};

/** خاصية من Script Properties */
function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}
function setProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}
