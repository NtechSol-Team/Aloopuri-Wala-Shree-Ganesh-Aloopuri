@echo off
REM ============================================================
REM  Shree Ganesh Aloopuri - POS Terminal (silent receipt print)
REM  Receipts print straight to the DEFAULT printer, no popup.
REM  First set your receipt printer as the Windows default printer.
REM ============================================================

set "POS_URL=https://scfc-web.onrender.com/pos"
if not "%~1"=="" set "POS_URL=%~1"
set "PROFILE=%LOCALAPPDATA%\SCFC-POS-Profile"

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if exist "%CHROME%" (
  start "" "%CHROME%" --kiosk-printing --app=%POS_URL% --user-data-dir="%PROFILE%"
  goto :eof
)

REM Chrome not found - fall back to Microsoft Edge (same silent-print switch)
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --kiosk-printing --app=%POS_URL% --user-data-dir="%PROFILE%"
  goto :eof
)

echo.
echo Could not find Google Chrome or Microsoft Edge on this computer.
echo Please install Google Chrome from https://google.com/chrome and run this again.
echo.
pause
