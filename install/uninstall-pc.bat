@echo off
title Antigravity Pulse - PC Uninstaller
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-pc.ps1"
pause
