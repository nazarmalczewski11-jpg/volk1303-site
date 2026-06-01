@echo off
chcp 65001 > nul
echo Розпочинаємо процес деплою на VPS...
python "%~dp0deploy_to_vps.py"
pause
