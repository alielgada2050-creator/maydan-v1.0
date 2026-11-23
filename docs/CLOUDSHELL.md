# نشر ميدان على Google Cloud

## 1) اختر المشروع
<walkthrough-project-setup billing="true"></walkthrough-project-setup>

```bash
gcloud config set project <walkthrough-project-id/>
```

## 2) (اختياري) الدخول بحساب Google ورمز التحقق بالبريد
- **الدخول بحساب Google:** من [Credentials](https://console.cloud.google.com/apis/credentials) أنشئ OAuth client ID من نوع *Web application*. انسخ المعرّف.
- **رمز التحقق بالبريد عبر Gmail:** فعّل التحقق بخطوتين في حساب Gmail، ثم أنشئ [كلمة مرور تطبيق](https://myaccount.google.com/apppasswords).

```bash
export GOOGLE_CLIENT_ID="1234567890-xxxx.apps.googleusercontent.com"
export SMTP_USER="you@gmail.com" SMTP_PASS="xxxx xxxx xxxx xxxx"
```

## 3) النشر بأمر واحد
```bash
bash scripts/gcp-deploy.sh
```
يُنشئ السكربت: Firestore، ومساحة المرفقات، والأسرار، ومفتاح خرائط Google مقيّداً بعنوان ميدان، ثم ينشر على Cloud Run ويطبع **رابط ميدان** و**رمز الإعداد**.

## 4) أول دخول
افتح الرابط ← «إعداد مشرف المنصة» ← أدخل بياناتك ورمز الإعداد. ثم أضف الرابط في *Authorized JavaScript origins* لمعرّف OAuth إن فعّلت دخول Google.
