@echo off
setlocal
if exist "%~dp0..\runtime\node.exe" goto portable
where node.exe >nul 2>nul
if errorlevel 1 goto missing
node.exe %*
exit /b %errorlevel%
:portable
"%~dp0..\runtime\node.exe" %*
exit /b %errorlevel%
:missing
echo Node.js 22 or newer was not found.
echo Download the Windows ZIP from GitHub Releases, or install Node.js and run npm ci.
exit /b 1
