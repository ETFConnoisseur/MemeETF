# Script to move MTF project to a shorter path to avoid Windows extended path issues
# Run this as Administrator if needed

Write-Host "Moving MTF project to shorter path..." -ForegroundColor Yellow
Write-Host ""

$sourcePath = "C:\Users\js\Desktop\MTF"
$destPath = "C:\MTF"

if (Test-Path $destPath) {
    Write-Host "ERROR: Destination path $destPath already exists!" -ForegroundColor Red
    Write-Host "Please remove it first or choose a different destination." -ForegroundColor Yellow
    exit 1
}

Write-Host "Source: $sourcePath" -ForegroundColor Cyan
Write-Host "Destination: $destPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will move the entire project. Continue? (Y/N)" -ForegroundColor Yellow
$response = Read-Host

if ($response -ne 'Y' -and $response -ne 'y') {
    Write-Host "Cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host "Moving project..." -ForegroundColor Yellow
try {
    Move-Item -Path $sourcePath -Destination $destPath -Force
    Write-Host "SUCCESS! Project moved to $destPath" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Open a new terminal" -ForegroundColor White
    Write-Host "2. Navigate to: cd C:\MTF" -ForegroundColor White
    Write-Host "3. Run: .\build-and-deploy.ps1" -ForegroundColor White
} catch {
    Write-Host "ERROR: Failed to move project: $_" -ForegroundColor Red
    exit 1
}



