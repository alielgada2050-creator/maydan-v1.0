# معمارية ميدان

## الطبقات
| الطبقة | الملفات | المسؤولية |
|---|---|---|
| الواجهة والنواة | `src/app.js` + `src/index.src.html` | العرض الآمن (`html```)، الجلسات والدخول، الفرق والمعدات، الوثائق، الإعدادات، اللغة والسمات |
| وحدات الميزات | `src/modules/*.js` | تُدمج عند البناء داخل نطاق التطبيق نفسه (علامة `/*MODULES*/`) بترتيب الاسم |
| — محرك المعاملات | `10-flow-core.js` | المراحل، بوابة الرخصة، التوجيه حسب الدور، التنسيق الجغرافي، الكلاستر، الجدولة |
| — الواجهات | `20-flow-views.js` | دورة المعاملات، خريطة الكلاستر، مركز التنسيق، البلاغات، بطاقات الفريق، البيانات التجريبية |
| التخزين | المتصفح · Google Sheets/Drive · الخادم | يُختار من الإعدادات ← التخزين والربط |
| الخادم (اختياري) | `server/` | Cloud Run: جلسات HttpOnly، OTP، Firestore، Cloud Storage، دخول Google، Webhook للـ ERP، وسيط الذكاء الاصطناعي |
| البناء | `scripts/build.py` | ملف HTML واحد مع بصمة CSP للسكربت |

## الأدوار والنطاق (`src/modules/05-roles.js`)
| الدور | يرى | يعدّل |
|---|---|---|
| مدير العمليات | كل المنصة والمواقع والفرق | يرسل التنبيهات والتنسيق فقط |
| مدير المنصة | الكل | الكل: المستخدمون، الإعدادات، البيانات |
| مدير المشروع | مكاتبه/مشاريعه (أو الكل إن لم يُقيَّد) | المكاتب والفرق والمشاريع، نقل الأفراد بين الفرق والفرق بين المكاتب، الكروت والتأهيل، التصاريح |
| المهندس المسؤول | فرقه (يُربط تلقائياً بالإقامة/الجوال/الاسم كمهندس للفرقة) | إعدادات فرقه، الكروت، التصاريح، النقل بين فرقه |
| المراقب | فرقته (كمراقب لها) | بيانات العمال والإقامات والكروت وTUV والرخص |
- كل إجراء يمر بفحصين: الصلاحية (`ACT_RULES`) ثم أن الفرقة/المعاملة/الموظف داخل شجرة المستخدم.
- **على الخادم** (`guardState` في `server/index.js`): يُرفض أي تعديل لفرقة خارج نطاق المهندس/المراقب، أو للإعدادات والهيكل لغير مدير المشروع/المنصة، ومدير العمليات لا يغيّر إلا التنبيهات.
- في النسخة المستقلة (بلا خادم) الفحص داخل المتصفح فقط؛ للإلزام الكامل استخدم الخادم.

## دورة المعاملة الميدانية
```
مجدولة → بوابة الرخصة → تأمين السلامة → الحفر → الكهرباء → الردم والأسفلت → مختبر URS → الاستشاري PDC → مركز المشاريع RIPC → مغلقة
```
- **بوابة الرخصة:** لا تنفيذ دون صورة الرخصة أو التعهد. تجاوز المهندس مسموح بمبرر وموعد إرفاق (≤ 3 أيام)، ويُبلَّغ مشرف التصاريح ويُنبَّه عند التأخر.
- **السلامة:** للحفر المفتوح؛ طلب توريد الصبات (خرسانية/بلاستيكية) وإنارة LED مع رابط ملاحة، وفحص HSE لبطاقات المراقب والعمالة (الإقامة، الأمن الصناعي، TUV، الرخصة).
- **بعد الحفر:** تنبيه مهندس الكهرباء ← يحوّله لمراقبي الكهرباء. **بعد تمديد الكابل:** تنبيه مهندس الأسفلت للتنفيذ بالتوالي.
- **المعادات:** راسب المختبر ← الأسفلت؛ إعادة الاستشاري ← 60 يوماً جديدة؛ إعادة المركز ← الاستشاري أولاً.
- كل تنبيه يحمل رقم الأساس والمعاملة والرخصة وتاريخ انتهائها والأيام المتبقية.

## التنسيق الجغرافي
- **الجيران:** نفس الحي أو المحطة أو المخطط أو القطعة، أو ضمن 2 كم / 5 كم (قابلة للتعديل في `settings.flow`).
- **قبل التنفيذ بيوم (مجدول تلقائياً عند الدخول وكل يوم):** تنبيه لقسم الرخص (م. عبدالله السيد) ومشرف التصاريح (علي الجدع)، وإذا وُجدت معاملات قريبة فتنبيه موحّد لمهندسي المدني والكهرباء ← تحويل للمراقبين لتنسيق واحد.
- **الكلاستر:** تجميع بالربط الأحادي ضمن 1/2/5 كم أو نفس المحطة/المخطط، مع تقدير الزيارات الموفّرة (توريد وإزالة السلامة، فحص HSE، زيارة المراقب، تعبئة الأسفلت).

## نموذج البيانات (إضافات)
- `jobs[]` بـ `flow:true`: `kind, office, baseNo, txNo, permit, permitType, permitExp, district, station, plan, plot, lat, lng, lengthM, stage, gate, safety, pdc, alerts, log`
- `roster[]`: `role, name, phone, offices[]` — جدول المسؤوليات والتوجيه
- `inbox[]`: التنبيهات الموجّهة (`to[]` بالاسم والجوال، `fwdRole`، `st: new|fwd|done`)
- `reports[]`: البلاغات والمعادات بمهلها
- `settings.google.jobFolders`: مجلد Drive لكل معاملة باسم `الأساس - المعاملة - الرخصة` داخل مجلد «المعاملات»

## الذكاء الاصطناعي
مزودون متوافقون مع OpenAI (OpenRouter، Groq، Gemini، DeepSeek، 9Router) بترتيب احتياطي؛ وعلى الخادم تبقى المفاتيح في Secret Manager. عند عدم توفر مزود يعمل تحليل محلي.

## Documented approval system (v8)
- `src/modules/03-riyadh.js`: 175 Riyadh districts grouped by area, plus approximate centres. They feed a searchable `combo` field (input + datalist). Districts users add are kept in `DB.lists.districts`.
- `src/modules/30-docsys.js`:
  - **Unified ID:** `CAT-YY-XXXX`, where CAT is C civil/802, M meters/402·801, F LV/MV faults, P33 pilot cables, or X emergencies.
  - **Work-order and SAP numbers** are recorded on every transaction.
  - **One permit-status rule** for every chip and report:
    - expired = black
    - under 5 days = red
    - under 14 days = amber
    - otherwise green
  - The scheduler sends a yellow-zone alert once a permit is under 14 days, and red alerts daily from under 5 days.
  - **Critical-permits report** (`permits` view): the top 10 permits nearest to expiry, the 60-day closure rule, and visual-evidence status. It can be printed.
  - **Stage photos:** finishing the civil, electrical or asphalt stage requires a photo. The photo is geo-tagged and renamed `ID_STAGE_YYYYMMDD_SAP.ext`.
  - **QA checklist:** location, length, permit and its attachment, WO, SAP, and geo-tagged stage photos. It must be approved («اعتماد الجودة») before a file moves from the lab to PDC.
  - **Kanban drag and drop:** elements use `data-drag` / `data-drop`. A flow ticket can only be dropped on the next stage. Task columns map to the start / hold / resume / close actions.
