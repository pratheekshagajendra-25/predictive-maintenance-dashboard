# PowerShell Startup Script for Industry 4.0 Predictive Maintenance Platform
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "Launching Full-Stack Industry 4.0 Predictive Maintenance Platform..." -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Start Node.js Backend API
Write-Host "Starting Node.js Backend API on http://localhost:5000..." -ForegroundColor Yellow
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", "Set-Location '$scriptDir\backend'; node server.js"

Start-Sleep -Seconds 3

# 2. Start Frontend UI
Write-Host "Starting Frontend Vite UI on http://localhost:5173..." -ForegroundColor Yellow
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", "Set-Location '$scriptDir\frontend'; npm run dev"

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "Services successfully launched!" -ForegroundColor Green
Write-Host "  - Frontend UI: http://localhost:5173" -ForegroundColor White
Write-Host "  - Backend API: http://localhost:5000" -ForegroundColor White
Write-Host ""
Write-Host "Default Credentials:" -ForegroundColor Yellow
Write-Host "  - Admin:    admin    / Admin@12345" -ForegroundColor White
Write-Host "  - Customer: customer / Customer@12345" -ForegroundColor White
Write-Host "======================================================================" -ForegroundColor Green
