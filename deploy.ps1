# Vercel Deployment Script
Write-Host "🚀 Preparing for Vercel Deployment..." -ForegroundColor Cyan

# Check if logged in
Write-Host "`nChecking Vercel login status..." -ForegroundColor Yellow
$loginCheck = vercel whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Not logged in to Vercel" -ForegroundColor Red
    Write-Host "Please run: vercel login" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Logged in as: $loginCheck" -ForegroundColor Green

# Check if project is linked
Write-Host "`nChecking project link..." -ForegroundColor Yellow
if (-not (Test-Path ".vercel/project.json")) {
    Write-Host "⚠️  Project not linked. Will link during deployment." -ForegroundColor Yellow
}

# Build check
Write-Host "`nBuilding project..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Build successful!" -ForegroundColor Green

# Deploy
Write-Host "`n🚀 Deploying to Vercel..." -ForegroundColor Cyan
Write-Host "Choose deployment option:" -ForegroundColor Yellow
Write-Host "1. Preview deployment (vercel)" -ForegroundColor White
Write-Host "2. Production deployment (vercel --prod)" -ForegroundColor White

$choice = Read-Host "Enter choice (1 or 2)"

if ($choice -eq "2") {
    vercel --prod
} else {
    vercel
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Deployment successful!" -ForegroundColor Green
    Write-Host "`n⚠️  Don't forget to:" -ForegroundColor Yellow
    Write-Host "1. Set environment variables in Vercel Dashboard" -ForegroundColor White
    Write-Host "2. Update X_REDIRECT_URI to your production URL" -ForegroundColor White
    Write-Host "3. Test the deployment" -ForegroundColor White
} else {
    Write-Host "`n❌ Deployment failed!" -ForegroundColor Red
}

