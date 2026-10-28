@echo off
set "HUI_START_DIR=%~dp0"
powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath (Join-Path $env:HUI_START_DIR (([string][char]0x7ED8)+'.exe')) -WindowStyle Hidden"
