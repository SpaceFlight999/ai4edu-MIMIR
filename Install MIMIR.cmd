@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-mimir.ps1"
if errorlevel 1 pause
