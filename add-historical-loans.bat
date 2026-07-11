@echo off
echo.
echo  Importing 5 years of historical loan data (2021-2025)...
echo.
echo  Step 1: Updating database schema...
call npx prisma db push
echo.
echo  Step 2: Loading loan records...
node add-historical-loans.js
echo.
pause
