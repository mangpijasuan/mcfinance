@echo off
echo.
echo ================================================
echo   Millionaires Club Admin -- Setup
echo ================================================
echo.

:: 1. Copy env file
if not exist .env.local (
    copy .env.example .env.local
    echo [OK] Created .env.local
) else (
    echo [OK] .env.local already exists
)

if not exist .env (
    copy .env.local .env
    echo [OK] Created .env for Prisma
) else (
    echo [OK] .env already exists
)

:: 2. Install dependencies
echo.
echo Installing packages (this takes ~1 min)...
call npm install

:: 3. Generate Prisma client and push schema
echo.
echo Setting up database...
call npx prisma generate
call npx prisma db push

:: 4. Seed data
echo.
echo Loading your club data (211 members, loans, history)...
call npx tsx prisma/seed.ts

echo.
echo ================================================
echo   All done!
echo.
echo   Run:  npm run dev
echo   Open: http://localhost:3000
echo.
echo   Login:
echo     Email:    admin@millionairesclub.com
echo     Password: admin123
echo ================================================
echo.
pause
