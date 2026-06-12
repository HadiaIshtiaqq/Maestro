# Deploys NEXUS to Cloud Run. Secrets are read from .env — never hardcode them here.
# Usage: .\deploy.ps1

# Fix PATH for this session
$env:PATH += ";C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin"

# Load required env vars from .env
$envVars = @{}
Get-Content .env | Where-Object { $_ -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$' } | ForEach-Object {
  $envVars[$Matches[1]] = $Matches[2].Trim('"')
}

foreach ($required in @('MONGODB_URI', 'GEMINI_API_KEY', 'JWT_SECRET', 'OPERATOR_API_KEY')) {
  if (-not $envVars[$required]) {
    Write-Host "ERROR: $required missing from .env — refusing to deploy." -ForegroundColor Red
    exit 1
  }
}

# Login
Write-Host "Logging in to Google Cloud..." -ForegroundColor Cyan
gcloud auth login

# Set project
gcloud config set project phonic-scheme-496507-d2

# Enable APIs
Write-Host "Enabling Cloud Run APIs..." -ForegroundColor Cyan
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# Deploy
Write-Host "Deploying to Cloud Run..." -ForegroundColor Cyan
gcloud run deploy nexus-backend `
  --source . `
  --region us-central1 `
  --allow-unauthenticated `
  --memory 1Gi `
  --port 8080 `
  --update-env-vars NODE_ENV=production `
  --update-env-vars "MONGODB_URI=$($envVars['MONGODB_URI'])" `
  --update-env-vars "GEMINI_API_KEY=$($envVars['GEMINI_API_KEY'])" `
  --update-env-vars "ANTHROPIC_API_KEY=$($envVars['ANTHROPIC_API_KEY'])" `
  --update-env-vars "JWT_SECRET=$($envVars['JWT_SECRET'])" `
  --update-env-vars "OPERATOR_API_KEY=$($envVars['OPERATOR_API_KEY'])" `
  --update-env-vars "FIREBASE_PROJECT_ID=$($envVars['FIREBASE_PROJECT_ID'])" `
  --update-env-vars "FIREBASE_CLIENT_EMAIL=$($envVars['FIREBASE_CLIENT_EMAIL'])"

Write-Host "Done! Copy the Service URL above." -ForegroundColor Green
