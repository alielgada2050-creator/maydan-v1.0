# الربط مع Odoo

## الوضع الحالي (مُنفَّذ)
| الاتجاه | الطريقة |
|---|---|
| Odoo ← ميدان (يدوي) | Odoo: الموظفون ← تحديد ← إجراء ← تصدير (xlsx) ثم في ميدان: المستخدمون ← سجل الموظفين ← استيراد |
| Odoo ← ميدان (تلقائي) | زر «سحب الموظفين من Odoo» — الخادم يستدعي Odoo External API (JSON-RPC) `hr.employee.search_read` |
| ميدان ← Odoo | تصدير سجل الموظفين بنفس أعمدة Odoo (`id, name, identification_id, job_id, department_id, parent_id, work_email, mobile_phone, work_phone`) لإعادة الاستيراد في Odoo |

### معالجة ملف hr.employee الحالي
- رقم الإقامة مدمج في الاسم (قبله أو بعده) → يُفصل تلقائياً إلى `identification_id`.
- `work_phone` يحتوي أرقاماً بصيغة `1067/000013` → تُحفظ «رقماً وظيفياً» وليست جوالاً.
- المدير (`parent_id`) يُربط برقم إقامته.
- **ناقص في الملف:** أرقام الجوال (78 من 80) — مطلوبة لإرسال رمز الدخول. أضف `mobile_phone` في Odoo أو من شاشة الموظف.

## مستخدم الربط في Odoo
1. أنشئ مستخدماً مخصصاً `maydan-integration` بصلاحية **Employees / Officer (قراءة)** فقط.
2. Preferences ← Account Security ← New API Key → ضعه في Secret Manager باسم `maydan-odoo-key`.
3. متغيرات الخادم: `ODOO_URL=https://erp.company.sa`، `ODOO_DB`، `ODOO_USER=maydan-integration`.
4. المفتاح لا يغادر الخادم، ولا يُرسل إلى المتصفح.

## المرحلة التالية (مقترحة)
| البند | Odoo model | الاتجاه |
|---|---|---|
| المعدات والمركبات | `fleet.vehicle` / `maintenance.equipment` | ثنائي: العداد والصيانة من ميدان ← Odoo |
| طلبات الصيانة | `maintenance.request` | ميدان ← Odoo عند «تسجيل صيانة» |
| المشاريع والمهام | `project.project` / `project.task` | Odoo ← ميدان |
| المواد والتوريد | `stock.picking` | طلب «توريد مواد» ← Odoo |

### خياران للربط الآلي
1. **API مباشر (موصى به):** endpoints في `server/integrations.js` على نمط `odooEmployees()` مع Cloud Scheduler للمزامنة الدورية وسجل في `audit`.
2. **MCP:** خادم MCP لـ Odoo (مثل `mcp-server-odoo`) يتيح للوكيل الذكي قراءة Odoo بصلاحيات مستخدم الربط نفسه. يُشغَّل داخل شبكة الشركة فقط، مع قائمة سماح بالـ models.

> كل كتابة إلى Odoo تمر عبر الخادم بصلاحية مشرف المنصة، وتُسجَّل في سجل التدقيق.
