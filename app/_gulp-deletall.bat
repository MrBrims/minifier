@echo off
cd /d "%~dp0.."
echo Running gulp deletall...
echo WARNING: this deletes source files in app/images/src and app/fonts
npx gulp deletall
echo gulp deletall completed!
pause
