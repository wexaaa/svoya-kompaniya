@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\allow-radmin.ps1"
if errorlevel 1 (echo Не удалось добавить разрешение. Подтвердите запрос Windows и повторите запуск.) else (echo Порт игры разрешён только для подключения через Radmin VPN.)
pause
