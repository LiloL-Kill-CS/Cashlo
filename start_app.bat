@echo off
title Cashlo POS Server
cd /d "c:\aplikasi_bisnis"
echo ===================================================
echo   CASHLO POS SERVER
echo   Akses di HP: http://192.168.1.8:3000
echo   Akses di PC: http://localhost:3000
echo   ----------------------------------------
echo   JANGAN TUTUP JENDELA INI AGAR WEB TETAP JALAN
echo ===================================================
echo.
npm run dev
pause
