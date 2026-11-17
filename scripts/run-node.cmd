@echo off
if exist "%~dp0..\runtime\node.exe" goto portable
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Установите Node.js 22 или новее и выполните npm ci в папке игры.
  echo Либо скачайте готовый Windows ZIP из Releases на GitHub.
  exit /b 1
)
node.exe %*
exit /b %errorlevel%
:portable
"%~dp0..\runtime\node.exe" %*
exit /b %errorlevel%
