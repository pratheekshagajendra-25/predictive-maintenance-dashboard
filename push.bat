@echo off
setlocal
cd /d "%~dp0"
set "PATH=C:\Users\Pratheeksha G\AppData\Local\dyad\app-1.13.0\resources\git\cmd;%PATH%"

echo ======================================================================
echo   PREDICTIVE MAINTENANCE PLATFORM - GITHUB DEPLOYMENT
echo   Target Repository:
echo   https://github.com/pratheekshagajendra-25/predictive-maintenance-dashboard
echo ======================================================================
echo.

echo [1/2] Attempting push to origin/main...
git push -u origin main --force

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
echo   GITHUB AUTHENTICATION / ACCESS TOKEN REQUIRED
echo ======================================================================
echo   GitHub requires a Personal Access Token with 'repo' permissions
echo   to authorize the push.
echo.
echo   1. Open: https://github.com/settings/tokens
echo   2. Click "Generate new token (classic)"
echo   3. Select the 'repo' checkbox and click Generate
echo   4. Copy the token and paste it below:
echo ======================================================================
echo.

set /p GITHUB_TOKEN="Enter your GitHub Personal Access Token: "

if "%GITHUB_TOKEN%"=="" (
    echo [ERROR] Token cannot be empty.
    goto end
)

echo.
echo [2/2] Pushing project files to GitHub with token...
git push https://pratheekshagajendra-25:%GITHUB_TOKEN%@github.com/pratheekshagajendra-25/predictive-maintenance-dashboard.git main --force

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
