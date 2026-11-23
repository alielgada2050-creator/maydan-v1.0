# واجهة API (الخادم)

كل الطلبات JSON. الطلبات غير `GET` تتطلب الترويسة `X-Requested-With: maydan`. الجلسة في كوكي `mdn_sid` (HttpOnly).

| الطريقة | المسار | الصلاحية | الوصف |
|---|---|---|---|
| GET | `/api/health` | عام | `{app, needsSetup, ai[], odoo}` |
| POST | `/api/auth/setup` | `SETUP_TOKEN` | إنشاء أول مشرف |
| POST | `/api/auth/login` | عام | `{iqama, pass}` → `{step:'otp', masks}` أو `{step:'activate'}` |
| POST | `/api/auth/otp/send` | بعد login | `{channel:'sms'|'email'}` |
| POST | `/api/auth/otp/verify` | بعد login | `{code}` → جلسة + `{user}` |
| GET | `/api/auth/me` | — | المستخدم الحالي |
| POST | `/api/auth/logout` | جلسة | إنهاء الجلسة |
| POST | `/api/auth/activate` | رمز تفعيل | `{iqama, code, pass}` |
| POST | `/api/requests` | عام | طلب حساب (بدون كلمة مرور) |
| GET | `/api/requests` | admin | الطلبات المعلقة |
| POST | `/api/requests/:id/approve` · `/reject` | admin | → `{code}` رمز تفعيل |
| GET | `/api/users` | جلسة | المشرف: الكل؛ غيره: نفسه |
| POST | `/api/users` | admin | إنشاء مستخدم → `{code}` |
| PATCH | `/api/users/:id` | admin | `{role?, active?}` |
| POST | `/api/users/:id/activation` | admin | رمز تفعيل جديد |
| GET / PUT | `/api/state` | جلسة / كتابة | بيانات المنصة `{version, state}` — 409 عند التعارض |
| GET / POST | `/api/audit` | admin, pm / جلسة | سجل التدقيق |
| POST | `/api/ai/chat` | جلسة | `{messages}` → `{text, via}` عبر المزودين المضبوطين |
| POST | `/api/odoo/employees` | admin | سحب `hr.employee` من Odoo |

لإضافة ربط جديد (Odoo/ERP/MCP) أضف route في `server/index.js` واستدعاءً في `server/integrations.js`، مع `requireUser(req, 'data')` و`audit()`.

## المرفقات
| الطريقة | المسار | الوصف |
|---|---|---|
| POST | `/api/files` | جسم الطلب = الملف الخام. ترويسات: `Content-Type` (PDF/JPEG/PNG/WebP/DOCX/XLSX)، `X-File-Id` اختياري (8–64 حرفاً `[A-Za-z0-9_-]`)، `X-File-Name` مُرمّز URL، `X-Requested-With: maydan`. يتطلب صلاحية `write`. ← `{ id }` |
| GET | `/api/files/:id` | تنزيل لمستخدم مسجّل فقط، `Content-Disposition: attachment`، `CSP: sandbox` |
| DELETE | `/api/files/:id` | لصاحب الملف أو admin/pm |
