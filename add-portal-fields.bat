@echo off
echo.
echo  Setting up Member Portal...
echo.
echo  Step 1: Updating database with portal fields...
call npx prisma db push
echo.
echo  Step 2: Verifying setup...
node add-portal-fields.js
echo.
pause
