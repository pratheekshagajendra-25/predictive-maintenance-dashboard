@echo off
title Predictive Maintenance - Backend API (Port 5000)
cd /d "%~dp0\backend"
echo ============================================================
echo Starting Predictive Maintenance Node.js Backend API on port 5000...
echo ============================================================
node server.js
if errorlevel 1 (
    echo Node.js backend failed to start. Running npm start...
    npm start
)
pause
