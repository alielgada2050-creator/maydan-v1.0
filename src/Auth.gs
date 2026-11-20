/**
 * المصادقة: حساب Google (Workspace) أو رقم الإقامة/الهوية + رمز تحقق لمرة واحدة.
 * الرموز تُخزَّن مُجزّأة (SHA-256) ولا تُعاد للمتصفح أبداً.
 * الدوال العامة (بدون "_") هي فقط ما يستدعيه المتصفح.
 */

function sha256_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function randomDigits_(n) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now());
  var out = '';
  for (var i = 0; out.length < n; i++) out += String((bytes[i % bytes.length] & 0xff) % 10);
  return out;
}

function cache_() { return CacheService.getScriptCache(); }
function cget_(k) { var v = cache_().get(k); return v ? JSON.parse(v) : null; }
function cput_(k, v, sec) { cache_().put(k, JSON.stringify(v), Math.min(sec, 21600)); }

function validIqama_(s) { return /^[12]\d{9}$/.test(String(s || '')); }

function maskEmail_(e) {
  var p = String(e).split('@');
  if (p.length !== 2) return '';
  return p[0].charAt(0) + '•••' + p[0].slice(-1) + '@' + p[1];
}
function maskPhone_(p) {
  var d = String(p).replace(/\D/g, '');
  return d ? '+' + d.slice(0, 4) + ' ••• ' + d.slice(-3) : '';
}

function userByIqama_(iqama) {
  return readAll_('Users').filter(function (u) { return u.iqama === String(iqama) && u.active !== 'false'; })[0] || null;
}
function userByEmail_(email) {
  var e = String(email || '').toLowerCase();
  if (!e) return null;
  return readAll_('Users').filter(function (u) { return String(u.email).toLowerCase() === e && u.active !== 'false'; })[0] || null;
}

function isLocked_(iqama) {
  var l = cget_('lock:' + iqama);
  return l && l.until > Date.now();
}
function registerFail_(iqama) {
  var k = 'fail:' + iqama;
  var f = cget_(k) || { n: 0 };
  f.n++;
  if (f.n >= MAYDAN.LOCK_AFTER) {
    cput_('lock:' + iqama, { until: Date.now() + MAYDAN.LOCK_SEC * 1000 }, MAYDAN.LOCK_SEC);
    cache_().remove(k);
    var u = userByIqama_(iqama);
    audit_(u, 'auth.locked', 'Users', u ? u.id : '', { iqamaTail: String(iqama).slice(-2) });
    notifyRoles_(['admin'], 'قفل حساب مؤقت', 'تم قفل الدخول برقم ينتهي بـ ' + String(iqama).slice(-2) + ' بعد ' + MAYDAN.LOCK_AFTER + ' محاولات خاطئة.', '');
  } else {
    cput_(k, f, MAYDAN.LOCK_SEC);
  }
}

/** الخطوة 1: طلب رمز تحقق. ترد دائماً بنفس الشكل حتى لا يُعرف هل الرقم مسجّل. */
function authRequestOtp(iqama, channel) {
  iqama = String(iqama || '').trim();
  if (!validIqama_(iqama)) return { ok: false, error: 'رقم الإقامة/الهوية يجب أن يكون 10 أرقام ويبدأ بـ 1 أو 2.' };
  if (isLocked_(iqama)) return { ok: false, error: 'الحساب مقفل مؤقتاً. حاول بعد 15 دقيقة.' };

  var w = cget_('otpwin:' + iqama) || { n: 0, last: 0 };
  if (Date.now() - w.last < MAYDAN.OTP_RESEND_SEC * 1000) return { ok: false, error: 'انتظر دقيقة قبل طلب رمز جديد.' };
  if (w.n >= MAYDAN.OTP_MAX_PER_WINDOW) return { ok: false, error: 'تجاوزت عدد الرموز المسموح. حاول بعد 15 دقيقة.' };
  w.n++; w.last = Date.now();
  cput_('otpwin:' + iqama, w, MAYDAN.OTP_WINDOW_SEC);

  var u = userByIqama_(iqama);
  var generic = { ok: true, sentTo: 'الوسيلة المسجّلة لهذا الرقم', ttl: MAYDAN.OTP_TTL_SEC };
  if (!u) return generic; // لا نكشف وجود الحساب

  var code = randomDigits_(6);
  var salt = Utilities.getUuid();
  cput_('otp:' + iqama, { h: sha256_(salt + code), salt: salt, tries: 0, uid: u.id }, MAYDAN.OTP_TTL_SEC);

  var sentTo = '';
  var smsOk = false;
  if (channel === 'sms' && u.phone && prop_('TWILIO_SID')) smsOk = sendSms_(u.phone, 'رمز دخول ميدان: ' + code + ' — صالح 5 دقائق. لا تشاركه مع أحد.');
  if (smsOk) sentTo = maskPhone_(u.phone);
  else if (u.email) {
    MailApp.sendEmail({
      to: u.email,
      subject: 'رمز الدخول إلى ميدان',
      htmlBody: '<div dir="rtl" style="font-family:Tahoma,Arial;font-size:15px">رمز الدخول إلى منصة ميدان:<br><b style="font-size:28px;letter-spacing:6px">' + code + '</b><br>صالح لمدة 5 دقائق. إن لم تطلب هذا الرمز فتجاهل الرسالة وأبلغ مشرف المنصة.</div>',
      name: MAYDAN.APP_NAME
    });
    sentTo = maskEmail_(u.email);
  }
  if (!sentTo) return { ok: false, error: 'لا توجد وسيلة استلام مسجلة لهذا الحساب. تواصل مع مشرف المنصة.' };
  audit_(u, 'auth.otp_sent', 'Users', u.id, { channel: smsOk ? 'sms' : 'email' });
  return { ok: true, sentTo: sentTo, ttl: MAYDAN.OTP_TTL_SEC };
}

/** الخطوة 2: التحقق من الرمز وإنشاء جلسة */
function authVerifyOtp(iqama, code) {
  iqama = String(iqama || '').trim();
  code = String(code || '').replace(/\D/g, '');
  if (!validIqama_(iqama) || code.length !== 6) return { ok: false, error: 'بيانات غير مكتملة.' };
  if (isLocked_(iqama)) return { ok: false, error: 'الحساب مقفل مؤقتاً. حاول بعد 15 دقيقة.' };
  var rec = cget_('otp:' + iqama);
  if (!rec) { registerFail_(iqama); return { ok: false, error: 'الرمز غير صحيح أو انتهت صلاحيته.' }; }
  if (sha256_(rec.salt + code) !== rec.h) {
    rec.tries++;
    registerFail_(iqama);
    if (rec.tries >= MAYDAN.OTP_MAX_TRIES) cache_().remove('otp:' + iqama);
    else cput_('otp:' + iqama, rec, MAYDAN.OTP_TTL_SEC);
    return { ok: false, error: 'الرمز غير صحيح.', left: Math.max(0, MAYDAN.OTP_MAX_TRIES - rec.tries) };
  }
  cache_().remove('otp:' + iqama);
  cache_().remove('fail:' + iqama);
  var u = findById_('Users', rec.uid);
  if (!u || u.active === 'false') return { ok: false, error: 'الحساب غير مفعّل.' };
  return startSession_(u, 'otp');
}

/** الدخول بحساب Google: يعمل تلقائياً عند النشر داخل Google Workspace لنفس النطاق */
function authGoogle() {
  var email = '';
  try { email = Session.getActiveUser().getEmail(); } catch (e) { email = ''; }
  if (!email) return { ok: false, error: 'تعذّر التعرف على حساب Google. استخدم رقم الإقامة ورمز التحقق.' };
  var u = userByEmail_(email);
  if (!u) {
    audit_({ id: '', name: email }, 'auth.google_denied', 'Users', '', {});
    return { ok: false, error: 'حساب Google هذا غير مسجّل في ميدان. اطلب من مشرف المنصة إضافته.' };
  }
  return startSession_(u, 'google');
}

function startSession_(u, method) {
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  cput_('ses:' + token, { uid: u.id, at: Date.now() }, MAYDAN.SESSION_IDLE_SEC);
  update_('Users', u.id, { lastLoginAt: now_() });
  audit_(u, 'auth.login', 'Users', u.id, { method: method });
  return { ok: true, token: token, idleSec: MAYDAN.SESSION_IDLE_SEC };
}

/** يتحقق من الجلسة ويمدّها (انتهاء بعد خمول) */
function sessionUser_(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(String(token))) return null;
  var s = cget_('ses:' + token);
  if (!s) return null;
  var u = findById_('Users', s.uid);
  if (!u || u.active === 'false') { cache_().remove('ses:' + token); return null; }
  cput_('ses:' + token, s, MAYDAN.SESSION_IDLE_SEC);
  return u;
}

function authLogout(token) {
  var u = sessionUser_(token);
  if (u) audit_(u, 'auth.logout', 'Users', u.id, {});
  if (token) cache_().remove('ses:' + token);
  return { ok: true };
}
