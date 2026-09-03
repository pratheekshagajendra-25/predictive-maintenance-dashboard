@echo off
setlocal
cd /d "%~dp0"
set "PATH=C:\Users\Pratheeksha G\AppData\Local\dyad\app-1.13.0\resources\git\cmd;%PATH%"

echo ============================================================
echo Pushing project to GitHub:
echo https://github.com/pratheekshagajendra-25/predictive-maintenance-dashboard
echo ============================================================
echo.

git push -u origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo ============================================================
    echo [SUCCESS] Project successfully pushed to GitHub!
    echo URL: https://github.com/pratheekshagajendra-25/predictive-maintenance-dashboard
    echo ============================================================
) else (
    echo.
    echo [NOTE] If GitHub prompted for credentials or failed authentication,
    echo you can generate a Personal Access Token at:
    echo https://github.com/settings/tokens
    echo and use it as your password.
)

pause
