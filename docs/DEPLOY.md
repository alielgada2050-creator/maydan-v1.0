# النشر على Google Cloud (Cloud Run + Firestore)

المعمارية: خدمة Cloud Run واحدة تقدّم الصفحة والـ API، وFirestore (Native mode) للتخزين، وSecret Manager للأسرار، وGitHub Actions للنشر دون مفاتيح JSON.

## الطريقة الأسرع: Cloud Shell بأمر واحد
افتح [Cloud Shell على هذا المستودع](https://shell.cloud.google.com/cloudshell/editor?cloudshell_git_repo=https://github.com/alielgada2050-creator/maydan-v1.0&cloudshell_git_branch=main&cloudshell_tutorial=docs/CLOUDSHELL.md&show=terminal) ثم:
```bash
gcloud config set project YOUR_PROJECT_ID
export GOOGLE_CLIENT_ID="...apps.googleusercontent.com"      # اختياري: الدخول بحساب Google
export SMTP_USER="you@gmail.com" SMTP_PASS="app-password"     # اختياري: رمز التحقق بالبريد عبر Gmail
bash scripts/gcp-deploy.sh
```
الخطوات أدناه هي نفس ما يفعله السكربت، للنشر اليدوي أو عبر GitHub Actions.

## 1) إعداد المشروع (مرة واحدة)
```bash
PROJECT_ID=asas-maydan          # غيّره
REGION=me-central2              # الدمام — الأقرب للرياض
gcloud config set project $PROJECT_ID
gcloud services enable run.googleapis.com firestore.googleapis.com secretmanager.googleapis.com \
  artifactregistry.googleapis.com iamcredentials.googleapis.com cloudbuild.googleapis.com

gcloud firestore databases create --location=$REGION --type=firestore-native
gcloud artifacts repositories create maydan --repository-format=docker --location=$REGION

# حساب تشغيل الخدمة (أقل صلاحيات)
gcloud iam service-accounts create maydan-run
RUN_SA=maydan-run@$PROJECT_ID.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding $PROJECT_ID --member=serviceAccount:$RUN_SA --role=roles/datastore.user

# مرفقات المستندات (خاصة، بدون وصول عام) — ثم أضف متغير GitHub: FILES_BUCKET=$PROJECT_ID-maydan-files
gcloud services enable storage.googleapis.com
gcloud storage buckets create gs://$PROJECT_ID-maydan-files --location=$REGION --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets add-iam-policy-binding gs://$PROJECT_ID-maydan-files --member=serviceAccount:$RUN_SA --role=roles/storage.objectAdmin
```

## 2) الأسرار
```bash
mk() { printf '%s' "$2" | gcloud secrets create $1 --data-file=- ; gcloud secrets add-iam-policy-binding $1 --member=serviceAccount:$RUN_SA --role=roles/secretmanager.secretAccessor; }
mk maydan-session-secret "$(openssl rand -base64 48)"
mk maydan-setup-token   "$(openssl rand -base64 24)"   # تحتاجه مرة واحدة لإنشاء المشرف ثم احذف نسخته
mk maydan-otp-webhook-secret "$(openssl rand -hex 32)"
mk maydan-openai-key "sk-..."      # أو اتركه placeholder إن لم تستخدم OpenAI
mk maydan-groq-key   "gsk_..."
mk maydan-odoo-key   "odoo-api-key"
```
> كل سر مذكور في `.github/workflows/deploy.yml` يجب أن يكون موجوداً، وإلا فشل النشر. احذف السطر من الملف إن لم تستخدم الخدمة.

## 3) ربط GitHub بدون مفاتيح (Workload Identity Federation)
```bash
gcloud iam service-accounts create maydan-deploy
DEPLOY_SA=maydan-deploy@$PROJECT_ID.iam.gserviceaccount.com
for r in run.admin artifactregistry.writer iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding $PROJECT_ID --member=serviceAccount:$DEPLOY_SA --role=roles/$r; done

gcloud iam workload-identity-pools create github --location=global
gcloud iam workload-identity-pools providers create-oidc github --location=global --workload-identity-pool=github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository \
  --attribute-condition="assertion.repository=='ORG/maydan'"        # اسم المستودع
POOL=$(gcloud iam workload-identity-pools describe github --location=global --format='value(name)')
gcloud iam service-accounts add-iam-policy-binding $DEPLOY_SA --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/$POOL/attribute.repository/ORG/maydan"
```
في GitHub ← Settings ← Variables أضف:
`GCP_PROJECT_ID`، `GCP_REGION`، `GCP_WIF_PROVIDER` (= `$POOL/providers/github`)، `GCP_DEPLOY_SA`، `GCP_RUNTIME_SA` (= `$RUN_SA`)، `OTP_PROVIDER`، ونماذج الذكاء الاصطناعي (`OPENAI_MODEL`، `GROQ_MODEL`…)، وبيانات Odoo (`ODOO_URL`، `ODOO_DB`، `ODOO_USER`).

## 4) الرفع إلى GitHub
```bash
git init && git add . && git commit -m "Maydan v3"
git branch -M main && git remote add origin git@github.com:ORG/maydan.git && git push -u origin main
```
- `CI` يختبر ويبني ويفحص الأسرار عند كل دفع.
- `Deploy to Cloud Run` ينشر عند الدفع إلى `main` (بيئة `production` — يُنصح بتفعيل الموافقة اليدوية عليها).
- `Security review (Claude)` يراجع كل Pull Request أمنياً (يحتاج سر `CLAUDE_API_KEY`).

## 5) أول تشغيل
1. افتح رابط Cloud Run ← شاشة «إعداد مشرف المنصة» ← أدخل بيانات المشرف و`SETUP_TOKEN`.
2. احذف قيمة `SETUP_TOKEN` (أو عطّل نسخة السر) بعد الإنشاء: الإعداد يُرفض تلقائياً متى وُجد مستخدم.
3. الإعدادات ← البيانات والربط ← استيراد ملف `hr.employee` أو «سحب الموظفين من Odoo».
4. اربط نطاقاً للشركة: `gcloud run domain-mappings create --service maydan --domain maydan.asasconst.com --region $REGION`.

## إرسال رمز التحقق (OTP)
| `OTP_PROVIDER` | الاستخدام |
|---|---|
| `unifonic` | SMS داخل المملكة — `UNIFONIC_APPSID`، `UNIFONIC_SENDER` (اسم مرسل معتمد) |
| `twilio` | SMS — `TWILIO_ACCOUNT_SID`، `TWILIO_AUTH_TOKEN`، `TWILIO_FROM` |
| `webhook` | SMS أو بريد عبر خدمة الشركة: POST موقّع بـ HMAC-SHA256 في ترويسة `X-Maydan-Signature` |
| `console` | للتطوير فقط — يُرفض في الإنتاج |

## النسخ الاحتياطي
```bash
gcloud firestore export gs://$PROJECT_ID-backups/$(date +%F)    # جدولها يومياً عبر Cloud Scheduler
```
