@echo off
cd /d "%~dp0.."
echo Running gulp fonts...
npx gulp fonts
echo gulp fonts completed!
pause
