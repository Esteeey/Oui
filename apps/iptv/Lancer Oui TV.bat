@echo off
title Oui TV - serveur
cd /d "%~dp0"
where node >nul 2>nul || (echo Installez Node.js depuis https://nodejs.org puis relancez. & pause & exit /b)
node server.js
pause
