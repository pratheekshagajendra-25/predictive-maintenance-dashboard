@echo off
title Predictive Maintenance Platform Launcher
echo ======================================================================
echo Launching Predictive Maintenance Platform...
echo ======================================================================
echo.
echo 1. Starting Backend API Server (http://localhost:5000)...
start "Backend API - Port 5000" "%~dp0start_backend.bat"
timeout /t 3 /nobreak >nul

echo.
echo 2. Starting Frontend UI Server (http://localhost:5173)...
start "Frontend UI - Port 5173" "%~dp0start_frontend.bat"
timeout /t 3 /nobreak >nul

echo.
echo 3. Opening Dashboard in your browser...
start http://localhost:5173

echo.
echo ======================================================================
echo Platform is LIVE!
echo - Frontend Dashboard: http://localhost:5173
echo - Backend REST API:  http://localhost:5000/api
echo.
echo Default Credentials:
echo   - Admin Role:    admin    / Admin@12345
echo   - Customer Role: customer / Customer@12345
echo ======================================================================
timeout /t 5
