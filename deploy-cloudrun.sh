#!/usr/bin/env bash
# ── Maestro Cloud Run Deploy Script ────────────────────────────────────────────
# Usage: ./deploy-cloudrun.sh
# Prerequisites: gcloud CLI authenticated, project set to phonic-scheme-496507-d2
set -e

PROJECT_ID="phonic-scheme-496507-d2"
REGION="us-central1"
SERVICE="maestro-backend"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE}:latest"

echo "==> Building & pushing image..."
gcloud builds submit \
  --tag "$IMAGE" \
  --project "$PROJECT_ID" \
  .

echo "==> Deploying to Cloud Run..."
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5 \
  --port 8080 \
  --set-env-vars "NODE_ENV=production" \
  --update-secrets \
    "MONGODB_URI=Maestro_MONGODB_URI:latest,\
REDIS_URL=Maestro_REDIS_URL:latest,\
GEMINI_API_KEY=Maestro_GEMINI_KEY:latest,\
JWT_SECRET=Maestro_JWT_SECRET:latest,\
FIREBASE_PROJECT_ID=Maestro_FB_PROJECT_ID:latest,\
FIREBASE_CLIENT_EMAIL=Maestro_FB_CLIENT_EMAIL:latest,\
FIREBASE_PRIVATE_KEY=Maestro_FB_PRIVATE_KEY:latest"

echo ""
echo "==> Done! Service URL:"
gcloud run services describe "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format "value(status.url)"
