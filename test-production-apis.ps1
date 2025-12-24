# Production API Test Script
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PRODUCTION API TEST RESULTS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "https://www.memeetf.tech"
$results = @()

# Test 1: Frontend
Write-Host "[1/8] Testing Frontend..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/" -UseBasicParsing
    $hasVite = $response.Content -match 'vite-build|index-.*\.js|index-.*\.css'
    $results += [PSCustomObject]@{
        Test = "Frontend"
        Status = $response.StatusCode
        Working = ($response.StatusCode -eq 200)
        Details = if ($hasVite) { "Vite build detected" } else { "Vite build NOT detected" }
    }
    Write-Host "  [OK] Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "  [OK] $($results[-1].Details)" -ForegroundColor Green
} catch {
    $results += [PSCustomObject]@{ Test = "Frontend"; Status = "ERROR"; Working = $false; Details = $_.Exception.Message }
    Write-Host "  [FAIL] Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Leaderboard API
Write-Host "[2/8] Testing Leaderboard API..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/leaderboard" -Method Get
    $results += [PSCustomObject]@{
        Test = "Leaderboard API"
        Status = 200
        Working = $true
        Details = "Returns leaderboard data"
    }
    Write-Host "  ✓ Status: 200" -ForegroundColor Green
    Write-Host "  ✓ Working correctly" -ForegroundColor Green
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $results += [PSCustomObject]@{ Test = "Leaderboard API"; Status = $status; Working = $false; Details = "Failed" }
    Write-Host "  ✗ Status: $status" -ForegroundColor Red
}
Write-Host ""

# Test 3: Test DB API
Write-Host "[3/8] Testing Database Connection..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/test-db" -Method Get
    if ($response.success) {
        $results += [PSCustomObject]@{
            Test = "Database Connection"
            Status = 200
            Working = $true
            Details = "Database connected successfully"
        }
        Write-Host "  [OK] Status: 200" -ForegroundColor Green
        Write-Host "  [OK] Database connected" -ForegroundColor Green
    } else {
        $results += [PSCustomObject]@{
            Test = "Database Connection"
            Status = 500
            Working = $false
            Details = $response.error
        }
        Write-Host "  [FAIL] Database not configured" -ForegroundColor Red
        Write-Host "  Error: $($response.error)" -ForegroundColor Red
    }
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $errorBody = ""
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $errorBody = $reader.ReadToEnd() | ConvertFrom-Json
    } catch {}
    
    $results += [PSCustomObject]@{
        Test = "Database Connection"
        Status = $status
        Working = $false
        Details = if ($errorBody.error) { $errorBody.error } else { "Database not configured" }
    }
    Write-Host "  [FAIL] Status: $status" -ForegroundColor Red
    Write-Host "  [FAIL] Database not configured - Check environment variables in Vercel" -ForegroundColor Red
}
Write-Host ""

# Test 4: ETFs API
Write-Host "[4/8] Testing ETFs API..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/etfs" -Method Get
    $results += [PSCustomObject]@{
        Test = "ETFs API"
        Status = 200
        Working = $true
        Details = "Returns ETF list"
    }
    Write-Host "  ✓ Status: 200" -ForegroundColor Green
    Write-Host "  ✓ Working correctly" -ForegroundColor Green
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $results += [PSCustomObject]@{
        Test = "ETFs API"
        Status = $status
        Working = $false
        Details = "Requires database connection"
    }
    Write-Host "  [WARN] Status: $status (Database required)" -ForegroundColor Yellow
}
Write-Host ""

# Test 5: X Auth Init API
Write-Host "[5/8] Testing X Auth Init API..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/auth/x" -Method Get
    $results += [PSCustomObject]@{
        Test = "X Auth Init"
        Status = 200
        Working = $true
        Details = "OAuth flow working"
    }
    Write-Host "  ✓ Status: 200" -ForegroundColor Green
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq 400) {
        $results += [PSCustomObject]@{
            Test = "X Auth Init"
            Status = $status
            Working = $true
            Details = "Working - 400 expected without walletAddress"
        }
        Write-Host "  OK Status: 400 (Expected - requires walletAddress param)" -ForegroundColor Green
    } else {
        $results += [PSCustomObject]@{
            Test = "X Auth Init"
            Status = $status
            Working = $false
            Details = "Check X_CLIENT_ID environment variable"
        }
        Write-Host "  [FAIL] Status: $status" -ForegroundColor Red
    }
}
Write-Host ""

# Test 6: Portfolio API (requires auth)
Write-Host "[6/8] Testing Portfolio API..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/portfolio?walletAddress=test" -Method Get
    $results += [PSCustomObject]@{
        Test = "Portfolio API"
        Status = 200
        Working = $true
        Details = "Returns portfolio data"
    }
    Write-Host "  ✓ Status: 200" -ForegroundColor Green
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $results += [PSCustomObject]@{
        Test = "Portfolio API"
        Status = $status
        Working = ($status -eq 400 -or $status -eq 404)
        Details = "Working (requires valid wallet)"
    }
    Write-Host "  [OK] Status: $status (Expected - requires valid wallet)" -ForegroundColor Green
}
Write-Host ""

# Test 7: Rewards API
Write-Host "[7/8] Testing Rewards API..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/rewards" -Method Get
    $results += [PSCustomObject]@{
        Test = "Rewards API"
        Status = 200
        Working = $true
        Details = "Returns rewards data"
    }
    Write-Host "  ✓ Status: 200" -ForegroundColor Green
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    $results += [PSCustomObject]@{
        Test = "Rewards API"
        Status = $status
        Working = $false
        Details = "Failed"
    }
    Write-Host "  ✗ Status: $status" -ForegroundColor Red
}
Write-Host ""

# Test 8: Assets (Vite build)
Write-Host "[8/8] Testing Vite Build Assets..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/vite-build/assets/index.html" -UseBasicParsing -ErrorAction SilentlyContinue
    if ($response.StatusCode -eq 200 -or $response.StatusCode -eq 404) {
        # Try to find actual asset files
        $htmlResponse = Invoke-WebRequest -Uri "$baseUrl/" -UseBasicParsing
        $hasAssets = $htmlResponse.Content -match '/vite-build/assets/'
        $results += [PSCustomObject]@{
            Test = "Vite Assets"
            Status = if ($hasAssets) { 200 } else { 404 }
            Working = $hasAssets
            Details = if ($hasAssets) { "Assets referenced correctly" } else { "Assets not found" }
        }
        $statusIcon = if ($hasAssets) { '[OK]' } else { '[WARN]' }
        $statusColor = if ($hasAssets) { 'Green' } else { 'Yellow' }
        Write-Host "  $statusIcon Assets: $(if ($hasAssets) { 'Found' } else { 'Not found' })" -ForegroundColor $statusColor
    }
} catch {
    $results += [PSCustomObject]@{
        Test = "Vite Assets"
        Status = "ERROR"
        Working = $false
        Details = "Could not verify"
    }
    Write-Host "  ? Could not verify assets" -ForegroundColor Yellow
}
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$working = ($results | Where-Object { $_.Working }).Count
$total = $results.Count

foreach ($result in $results) {
    $icon = if ($result.Working) { "[OK]" } else { "[FAIL]" }
    $color = if ($result.Working) { "Green" } else { "Red" }
    Write-Host "  $icon $($result.Test): " -NoNewline -ForegroundColor $color
    Write-Host "$($result.Status) - $($result.Details)"
}

Write-Host ""
Write-Host "Working: $working/$total APIs" -ForegroundColor $(if ($working -eq $total) { "Green" } elseif ($working -gt ($total/2)) { "Yellow" } else { "Red" })
Write-Host ""

# Critical issues
$critical = $results | Where-Object { $_.Test -eq "Database Connection" -and -not $_.Working }
if ($critical) {
    Write-Host "⚠ CRITICAL: Database not configured!" -ForegroundColor Red
    Write-Host "  → Add DATABASE_URL or PGHOST/PGUSER/etc. in Vercel" -ForegroundColor Yellow
    Write-Host "  → Make sure PGHOST is NOT 'localhost' (use your actual database host)" -ForegroundColor Yellow
    Write-Host ""
}

$frontend = $results | Where-Object { $_.Test -eq "Frontend" -and -not $_.Working }
if ($frontend) {
    Write-Host "⚠ CRITICAL: Frontend not loading correctly!" -ForegroundColor Red
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan

