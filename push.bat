@echo off
setlocal
cd /d "%~dp0"
set "PATH=C:\Users\Pratheeksha G\AppData\Local\dyad\app-1.13.0\resources\git\cmd;%PATH%"

echo ======================================================================
echo   INDUSTRY 4.0 PREDICTIVE MAINTENANCE PLATFORM - GITHUB DEPLOYMENT
echo   Target Repository:
echo   https://github.com/pratheekshagajendra-25/predictive-maintenance-dashboard
echo ======================================================================
echo.

git config --local --unset credential.helper 2>nul

echo [1/2] Attempting direct push to origin/main...
git push -u origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo ======================================================================
    echo   [SUCCESS] ALL PROJECT FILES PUSHED TO GITHUB SUCCESSFULLY!
    echo   Repository URL:
    echo   https://github.com/pratheekshagajendra-25/predictive-maintenance-dashboard
    echo ======================================================================
    goto end
)

echo.
echo ======================================================================
echo   GITHUB AUTHENTICATION REQUIRED
echo ======================================================================
echo   GitHub requires a Personal Access Token (Classic or Fine-Grained)
echo   with 'repo' write permissions.
echo.
echo   Generate a token at: https://github.com/settings/tokens
echo ======================================================================
echo.

set /p GITHUB_TOKEN="Enter your GitHub Personal Access Token: "

if "%GITHUB_TOKEN%"=="" (
    echo [ERROR] Token cannot be empty.
    goto end
)

echo.
echo [2/2] Pushing with provided credentials...
git push https://pratheekshagajendra-25:%GITHUB_TOKEN%@github.com/pratheekshagajendra-25/predictive-maintenance-dashboard.git main

if %ERRORLEVEL% equ 0 (
    echo.
    echo ======================================================================
    echo   [SUCCESS] ALL PROJECT FILES PUSHED TO GITHUB SUCCESSFULLY!
    echo   Repository URL:
    echo   https://github.com/pratheekshagajendra-25/predictive-maintenance-dashboard
    echo ======================================================================
) else (
    echo.
    echo [ERROR] Push failed. Please verify that your token has 'repo' permissions.
)

:end
echo.
pause
