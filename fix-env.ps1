# Fix .env file formatting
$envPath = "C:\Users\js\Desktop\MTF\.env"

# Read the file
$content = Get-Content $envPath -Raw

# Check for X_CLIENT_ID and X_CLIENT_SECRET
if ($content -match 'X_CLIENT_ID=(.+)') {
    Write-Host "X_CLIENT_ID found with value"
} else {
    Write-Host "X_CLIENT_ID is empty or missing value"
}

if ($content -match 'X_CLIENT_SECRET=(.+)') {
    Write-Host "X_CLIENT_SECRET found with value"
} else {
    Write-Host "X_CLIENT_SECRET is empty or missing value"
}

# Show the actual lines
Write-Host "`nCurrent X_ variables:"
Get-Content $envPath | Select-String "X_" | ForEach-Object {
    Write-Host $_.Line
}

