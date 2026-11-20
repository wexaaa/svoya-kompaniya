@echo off
chcp 65001 >nul
cd /d "%~dp0"
call "%~dp0scripts\run-node.cmd" launcher.mjs
pause
