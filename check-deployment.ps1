# Check if smart contract is deployed on devnet
# This script checks the deployment status

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Checking Smart Contract Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$projectRoot = "C:\Users\js\Desktop\MTF"
Set-Location $projectRoot

# Check if Solana CLI is available
try {
    $solanaVersion = & solana --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Solana CLI: $solanaVersion" -ForegroundColor Green
    } else {
        Write-Host "❌ Solana CLI not found" -ForegroundColor Red
        Write-Host "Please install Solana CLI first" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "❌ Solana CLI not found: $_" -ForegroundColor Red
    Write-Host "Please install Solana CLI first" -ForegroundColor Yellow
    exit 1
}

# Get program ID from Anchor.toml
$anchorToml = Get-Content "Anchor.toml" -Raw
if ($anchorToml -match 'mtf_etf = "([^"]+)"') {
    $programId = $matches[1]
    Write-Host "Program ID from Anchor.toml: $programId" -ForegroundColor Cyan
    Write-Host ""
    
    # Check if program is deployed
    Write-Host "Checking deployment status on devnet..." -ForegroundColor Yellow
    try {
        & solana program show $programId --url devnet --output json | ConvertFrom-Json | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Program is DEPLOYED on devnet!" -ForegroundColor Green
            Write-Host ""
            & solana program show $programId --url devnet
        } else {
            Write-Host "❌ Program is NOT deployed on devnet" -ForegroundColor Red
            Write-Host ""
            Write-Host "To deploy, run:" -ForegroundColor Yellow
            Write-Host "  anchor build" -ForegroundColor White
            Write-Host "  anchor deploy --provider.cluster devnet" -ForegroundColor White
        }
    } catch {
        Write-Host "❌ Could not check deployment status: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "To deploy, run:" -ForegroundColor Yellow
        Write-Host "  anchor build" -ForegroundColor White
        Write-Host "  anchor deploy --provider.cluster devnet" -ForegroundColor White
    }
} else {
    Write-Host "❌ Could not find program ID in Anchor.toml" -ForegroundColor Red
}

Write-Host ""


