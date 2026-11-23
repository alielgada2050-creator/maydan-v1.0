#!/usr/bin/env bash
# ميدان — إعداد ونشر كامل على Google Cloud بأمر واحد (شغّله من Google Cloud Shell)
#   bash scripts/gcp-deploy.sh
# متغيرات اختيارية قبل التشغيل:
#   PROJECT_ID=...            مشروع Google Cloud (الافتراضي: المشروع المحدد في gcloud)
#   REGION=me-central2        الدمام — الأقرب للرياض
#   GOOGLE_CLIENT_ID=...      معرّف OAuth (Web) لتفعيل «الدخول بحساب Google»
#   GOOGLE_ALLOWED_DOMAIN=asasconst.com   (اختياري) قصر دخول Google على نطاق الشركة
#   SMTP_USER=you@gmail.com SMTP_PASS=app-password   رمز التحقق بالبريد عبر Gmail (كلمة مرور تطبيق)
#   OTP_PROVIDER=unifonic|twilio|webhook   لرمز التحقق بالـ SMS (أضف بياناته بعد النشر)
# يعيد التشغيل بأمان: ما هو موجود لا يُعاد إنشاؤه.
set -euo pipefail
say() { printf '\n\033[1;33m▸ %s\033[0m\n' "$*"; }
PROJECT_ID=${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}
[ -n "$PROJECT_ID" ] || { echo "حدّد المشروع أولاً: gcloud config set project YOUR_PROJECT_ID"; exit 1; }
REGION=${REGION:-me-central2}; SERVICE=maydan
RUN_SA="maydan-run@$PROJECT_ID.iam.gserviceaccount.com"; BUCKET="$PROJECT_ID-maydan-files"
gcloud config set project "$PROJECT_ID" >/dev/null

say "تفعيل الخدمات (Cloud Run، Firestore، Secret Manager، Cloud Build، Storage، مفاتيح API، خرائط Google)"
gcloud services enable run.googleapis.com firestore.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com storage.googleapis.com apikeys.googleapis.com tile.googleapis.com

say "قاعدة البيانات Firestore"
if ! gcloud firestore databases describe --database='(default)' >/dev/null 2>&1; then
  for LOC in "$REGION" me-central1 eur3; do gcloud firestore databases create --location="$LOC" --type=firestore-native && break; echo "الموقع $LOC غير متاح لـ Firestore، تجربة التالي…"; done
fi

say "حساب تشغيل الخدمة بأقل صلاحيات"
gcloud iam service-accounts describe "$RUN_SA" >/dev/null 2>&1 || gcloud iam service-accounts create maydan-run --display-name="Maydan runtime"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$RUN_SA" --role=roles/datastore.user --condition=None >/dev/null

say "مساحة الصور والمرفقات (خاصة، بلا وصول عام)"
gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1 || gcloud storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$RUN_SA" --role=roles/storage.objectAdmin >/dev/null

say "الأسرار في Secret Manager"
secret() { if ! gcloud secrets describe "$1" >/dev/null 2>&1; then printf '%s' "$2" | gcloud secrets create "$1" --data-file=- --replication-policy=automatic >/dev/null; fi
  gcloud secrets add-iam-policy-binding "$1" --member="serviceAccount:$RUN_SA" --role=roles/secretmanager.secretAccessor >/dev/null; }
secret maydan-session-secret "$(openssl rand -base64 48)"
SETUP_TOKEN_NEW=""; if ! gcloud secrets describe maydan-setup-token >/dev/null 2>&1; then SETUP_TOKEN_NEW=$(openssl rand -hex 16); fi
secret maydan-setup-token "${SETUP_TOKEN_NEW:-x}"
secret maydan-erp-secret "$(openssl rand -hex 32)"
SECRETS="SESSION_SECRET=maydan-session-secret:latest,SETUP_TOKEN=maydan-setup-token:latest,ERP_WEBHOOK_SECRET=maydan-erp-secret:latest"
if [ -n "${SMTP_PASS:-}" ]; then secret maydan-smtp-pass "$SMTP_PASS"; printf '%s' "$SMTP_PASS" | gcloud secrets versions add maydan-smtp-pass --data-file=- >/dev/null; SECRETS="$SECRETS,SMTP_PASS=maydan-smtp-pass:latest"; fi

OTP=${OTP_PROVIDER:-none}   # none = بدون SMS؛ رمز التحقق بالبريد إن ضُبط SMTP
ENVV="NODE_ENV=production,STORE=firestore,FILES_BUCKET=$BUCKET,OTP_PROVIDER=$OTP"
[ -n "${SMTP_USER:-}" ] && ENVV="$ENVV,SMTP_HOST=${SMTP_HOST:-smtp.gmail.com},SMTP_PORT=${SMTP_PORT:-465},SMTP_USER=$SMTP_USER,SMTP_FROM=${SMTP_FROM:-$SMTP_USER}"
[ -n "${GOOGLE_CLIENT_ID:-}" ] && ENVV="$ENVV,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"
[ -n "${GOOGLE_ALLOWED_DOMAIN:-}" ] && ENVV="$ENVV,GOOGLE_ALLOWED_DOMAIN=$GOOGLE_ALLOWED_DOMAIN"

say "صلاحيات البناء (Cloud Build)"
PN=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
for SA in "$PN-compute@developer.gserviceaccount.com" "$PN@cloudbuild.gserviceaccount.com"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role=roles/run.builder --condition=None >/dev/null 2>&1 || true; done

say "بناء ونشر ميدان على Cloud Run ($REGION) — يستغرق بضع دقائق"
gcloud run deploy "$SERVICE" --source . --region "$REGION" --service-account "$RUN_SA" \
  --allow-unauthenticated --min-instances=0 --max-instances=4 --cpu=1 --memory=512Mi \
  --update-env-vars "$ENVV" --update-secrets "$SECRETS" --quiet
URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')

say "مفتاح خرائط Google مقيّد بعنوان ميدان وبخدمة Map Tiles فقط"
KEY_NAME=$(gcloud services api-keys list --filter='displayName=maydan-maps' --format='value(name)' 2>/dev/null | head -1)
if [ -z "$KEY_NAME" ]; then gcloud services api-keys create --display-name=maydan-maps --api-target=service=tile.googleapis.com --allowed-referrers="$URL/*" >/dev/null
  KEY_NAME=$(gcloud services api-keys list --filter='displayName=maydan-maps' --format='value(name)' | head -1); fi
MAPS_KEY=$(gcloud services api-keys get-key-string "$KEY_NAME" --format='value(keyString)')
gcloud run services update "$SERVICE" --region "$REGION" --update-env-vars "GOOGLE_MAPS_KEY=$MAPS_KEY" --quiet >/dev/null

say "تم النشر"
echo "رابط ميدان:        $URL"
if [ -n "$SETUP_TOKEN_NEW" ]; then echo "رمز الإعداد (مرة واحدة لإنشاء حساب مشرف المنصة): $SETUP_TOKEN_NEW"; fi
echo "قاعدة البيانات:     Firestore ($REGION)  ·  المرفقات: gs://$BUCKET  ·  خرائط Google: مفعّلة"
[ -n "${GOOGLE_CLIENT_ID:-}" ] && echo "الدخول بحساب Google: مفعّل — أضف $URL في Authorized JavaScript origins لمعرّف OAuth" || echo "الدخول بحساب Google: أعد التشغيل مع GOOGLE_CLIENT_ID=... لتفعيله"
[ -n "${SMTP_USER:-}" ] && echo "رمز التحقق: بالبريد عبر $SMTP_USER" || echo "رمز التحقق: اضبط SMTP_USER/SMTP_PASS (Gmail) أو مزود SMS — راجع docs/DEPLOY.md"
