@echo off
title Antigravity Pulse - PC Installer
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-pc.ps1"
pause
