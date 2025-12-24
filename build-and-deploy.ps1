# MTF ETF Build and Deploy Script
# Run this script as Administrator

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MTF ETF Build and Deploy Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Set environment variables
$env:HOME = $env:USERPROFILE

# Add Solana to PATH if it exists
$solanaPaths = @(
    "$env:USERPROFILE\.local\share\solana\install\active_release\bin",
    "$env:LOCALAPPDATA\solana\install\active_release\bin",
    "C:\Users\js\.avm\bin"
)

foreach ($path in $solanaPaths) {
    if (Test-Path $path) {
        if ($env:Path -notlike "*$path*") {
            $env:Path += ";$path"
        }
    }
}

# Work around Windows extended path issues by using a shorter build directory
# Set CARGO_TARGET_DIR to a shorter path to avoid \\?\ extended path issues
$shortBuildPath = "$env:TEMP\mtf-build"
New-Item -ItemType Directory -Force -Path $shortBuildPath | Out-Null
$env:CARGO_TARGET_DIR = $shortBuildPath
Write-Host "Using shorter build path: $shortBuildPath" -ForegroundColor Cyan

# Try to use system Rust toolchain instead of Solana's bundled one
# Set Solana's toolchain to use system Rust if possible
$env:SOLANA_TOOLCHAIN = "stable"
$env:RUSTC = "rustc"
$env:RUSTUP_TOOLCHAIN = "stable"

# Change to project directory
Set-Location "C:\Users\js\Desktop\MTF"

Write-Host "[1/4] Building Anchor program..." -ForegroundColor Yellow

# Update Rust to latest stable (fixes lock file version 4 compatibility)
Write-Host "Ensuring Rust is up to date..." -ForegroundColor Yellow
rustup update stable 2>&1 | Out-Null

# Remove old Cargo.lock if it exists (fixes version 4 lock file issue)
if (Test-Path "programs\mtf-etf\Cargo.lock") {
    Write-Host "Removing old Cargo.lock to regenerate..." -ForegroundColor Yellow
    Remove-Item "programs\mtf-etf\Cargo.lock" -Force
}

# Clean build directories to avoid path issues
Write-Host "Cleaning build directories..." -ForegroundColor Yellow
if (Test-Path "programs\mtf-etf\target") {
    Remove-Item "programs\mtf-etf\target" -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path "$env:TEMP\mtf-build") {
    Remove-Item "$env:TEMP\mtf-build" -Recurse -Force -ErrorAction SilentlyContinue
}

# Regenerate lock file with current Cargo version
Write-Host "Regenerating Cargo.lock with current Cargo version..." -ForegroundColor Yellow
Push-Location "programs\mtf-etf"
cargo generate-lockfile 2>&1 | Out-Null

# Downgrade lock file version from 4 to 3 for compatibility
if (Test-Path "Cargo.lock") {
    $content = Get-Content "Cargo.lock" -Raw
    if ($content -match 'version = 4') {
        Write-Host "Downgrading lock file from version 4 to 3..." -ForegroundColor Yellow
        $content = $content -replace 'version = 4', 'version = 3'
        Set-Content "Cargo.lock" -Value $content -NoNewline
    }
}
Pop-Location
Write-Host "Lock file regenerated" -ForegroundColor Green

Write-Host "Starting build..." -ForegroundColor Yellow
anchor build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "Build successful!" -ForegroundColor Green
Write-Host ""

# Check wallet balance
Write-Host "[2/4] Checking wallet balance..." -ForegroundColor Yellow
try {
    $balanceOutput = solana balance 2>&1
    $balanceText = $balanceOutput | Out-String
    if ($balanceText -match '(\d+\.?\d*)\s+SOL') {
        $balanceValue = [double]$matches[1]
    } else {
        $balanceValue = 0
    }
} catch {
    Write-Host "Could not check balance, assuming 0" -ForegroundColor Yellow
    $balanceValue = 0
}

if ($balanceValue -lt 2.0) {
    Write-Host "Wallet balance is low: $balanceValue SOL" -ForegroundColor Yellow
    Write-Host "Requesting airdrop..." -ForegroundColor Yellow
    solana airdrop 2
    Start-Sleep -Seconds 5
    try {
        $balanceOutput = solana balance 2>&1
        $balanceText = $balanceOutput | Out-String
        if ($balanceText -match '(\d+\.?\d*)\s+SOL') {
            $balanceValue = [double]$matches[1]
        }
    } catch {
        Write-Host "Could not verify new balance" -ForegroundColor Yellow
    }
    Write-Host "New balance: $balanceValue SOL" -ForegroundColor Green
}

if ($balanceValue -lt 1.5) {
    Write-Host "WARNING: Balance may be insufficient for deployment" -ForegroundColor Yellow
    Write-Host "You may need to request more SOL from: https://faucet.solana.com" -ForegroundColor Yellow
}

Write-Host ""

# Deploy the program
Write-Host "[3/4] Deploying program to devnet..." -ForegroundColor Yellow
anchor deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "Deployment failed!" -ForegroundColor Red
    exit 1
}
Write-Host "Deployment successful!" -ForegroundColor Green
Write-Host ""

# Get the deployed program ID
Write-Host "[4/4] Verifying deployment..." -ForegroundColor Yellow
$programId = solana address -k target/deploy/mtf_etf-keypair.json
Write-Host "Program ID: $programId" -ForegroundColor Cyan
Write-Host ""

# Verify it's deployed
$programInfo = solana program show $programId --output json | ConvertFrom-Json
if ($programInfo) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "SUCCESS! Program deployed to devnet" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Program ID: $programId" -ForegroundColor Cyan
    Write-Host "Program Data: $($programInfo.programdataAddress)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "The .env file has been updated with this program ID." -ForegroundColor Green
    Write-Host "Your application is now ready to use the real smart contract!" -ForegroundColor Green
} else {
    Write-Host "WARNING: Could not verify program deployment" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

