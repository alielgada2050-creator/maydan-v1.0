# ربط ميدان بأدوات وخوادم Google

ميدان يعمل كاملاً على Google دون خادم خارجي:

| الخدمة | الاستخدام في ميدان |
|---|---|
| **Google Apps Script** | الخادم: واجهة البرمجة `api()`، المصادقة، الصلاحيات، الإشعارات |
| **Google Sheets** | قاعدة البيانات: Users, Crews, People, Equipment, Requests, Jobs, Notifications, Attachments, Audit |
| **Google Drive** | مجلد «ميدان»: قاعدة البيانات + المرفقات + نسخة احتياطية يومية (آخر 30 نسخة) |
| **Gmail (MailApp)** | رموز الدخول والإشعارات |
| **حساب Google / Workspace** | الدخول التلقائي لأعضاء نطاق Workspace |
| **Google Maps** | روابط الموقع والاتجاهات لكل فرقة |
| **Cloud Logging** | سجلات الأخطاء (`exceptionLogging: STACKDRIVER`) |

---

## الطريقة 1 — بدون أدوات (لصق ملفين)

1. <https://script.google.com> ← **مشروع جديد** ← سمِّه «ميدان».
2. افتح `Code.gs` ← احذف كل ما فيه ← الصق `paste/clean/Code.gs` (أو `paste/demo` للتجربة) ← **Ctrl+S**.
3. **+ ← HTML** ← الاسم: `Index` ← الصق `paste/clean/Index.html` ← **Ctrl+S**.
4. ⚙ إعدادات المشروع ← فعّل «إظهار ملف البيان appsscript.json» ← الصق `paste/clean/appsscript.json` ← **Ctrl+S**.
5. اختر الدالة **`setup`** ← **تشغيل** ← وافق على الصلاحيات ← انتظر «اكتمل التنفيذ».
6. **نشر ← نشر جديد ← ⚙ تطبيق ويب** ← التنفيذ باسم: **أنا** ← الوصول: **أي شخص** ← نشر ← انسخ الرابط `/exec`.

### أخطاء شائعة
| الرسالة | السبب والحل |
|---|---|
| `SyntaxError ... Code.gs` | لُصق ملف غير الكود (مثل README). الصق `Code.gs` فقط. |
| `Script function not found: doGet` | الكود لم يُحفظ أو النشر من نسخة قديمة. احفظ ثم: **نشر ← إدارة عمليات النشر ← ✏️ ← الإصدار: إصدار جديد ← نشر**. |
| تعليق على «جارِ تحميل» أو «تعذّر تشغيل ميدان» | افتح رابط `/exec`، أو نافذة خفية إن كان المتصفح مسجلاً بأكثر من حساب Google. |
| `لم يتم الإعداد بعد` | شغّل `setup` من المحرر مرة واحدة. |

> للاختبار دون نشر إصدار كل مرة: **نشر ← اختبار عمليات النشر** (رابط `/dev` يعرض آخر كود محفوظ).

---

## الطريقة 2 — للمطورين (clasp)

```bash
npm i -g @google/clasp@2.4.2
clasp login                                   # يفتح المتصفح لحساب Google
# فعّل Apps Script API مرة واحدة: https://script.google.com/home/usersettings
clasp create --type standalone --title "ميدان" --rootDir src
clasp push --force
```
ثم من المحرر: شغّل `setup` وانشر كتطبيق ويب.

---

## الطريقة 3 — نشر تلقائي من GitHub (GitHub Actions)

كل دمج في `main` يغيّر `src/` يُفحص ثم يُرفع إلى Apps Script ويحدّث نفس رابط `/exec`.

1. نفّذ الطريقة 2 مرة واحدة على جهازك، ثم انشر كتطبيق ويب يدوياً مرة.
2. في المستودع: **Settings ← Secrets and variables ← Actions**:

| النوع | الاسم | القيمة |
|---|---|---|
| Secret | `CLASPRC_JSON` | محتوى الملف `~/.clasprc.json` بعد `clasp login` |
| Secret | `SCRIPT_ID` | من ⚙ إعدادات المشروع ← معرّف النص البرمجي |
| Secret | `DEPLOYMENT_ID` | من نشر ← إدارة عمليات النشر ← معرّف النشر (يبدأ بـ AKfy…) |
| Variable | `GAS_DEPLOY_ENABLED` | `true` |

3. **Actions ← Deploy ← Run workflow** للتجربة.

> `CLASPRC_JSON` يمنح صلاحية على مشاريع Apps Script في حسابك. احفظه كسر فقط، ويُحذف من الخادم بعد كل تشغيل. يمكن إلغاؤه من <https://myaccount.google.com/permissions>.

---

## خصائص النص البرمجي (Script Properties)

⚙ إعدادات المشروع ← خصائص النص البرمجي:

| الخاصية | الغرض |
|---|---|
| `MAYDAN_MODE` | `demo` أو `clean` — يُضبط **قبل** أول تشغيل لـ `setup` |
| `ADMIN_IQAMA` / `ADMIN_NAME` | رقم إقامة واسم المشرف الأول |
| `TELEGRAM_BOT_TOKEN` | إشعارات تيليجرام (بوت من @BotFather) |
| `TWILIO_SID` `TWILIO_TOKEN` `TWILIO_FROM` | رمز الدخول عبر SMS |
| `OPENROUTER_KEY` `GROQ_KEY` `GEMINI_KEY` `DEEPSEEK_KEY` | الوكيل الذكي (و `*_MODEL` لتغيير النموذج) |

تُنشأ تلقائياً عند `setup` (لا تعدّلها): `SPREADSHEET_ID` `ROOT_FOLDER_ID` `ATTACH_FOLDER_ID` `BACKUP_FOLDER_ID` `SEEDED`.

---

## Google Workspace (موصى به للشركات)
- الدخول بزر Google يعمل تلقائياً لأعضاء نفس النطاق عند النشر بـ «التنفيذ باسم: أنا».
- حصة البريد أعلى (نحو 1500 رسالة يومياً مقابل نحو 100 لحساب Gmail العادي).
- أضف كل مستخدم في «المستخدمون والصلاحيات» ببريده الرسمي.

## مشروع Google Cloud قياسي (اختياري للتوسع)
⚙ إعدادات المشروع ← **مشروع Google Cloud Platform** ← اربطه بمشروع خاص بشركتك لتحصل على: سجلات Cloud Logging مركزية، تنبيهات الأخطاء، وإمكانية إضافة Google Maps Platform وFirestore لاحقاً.
