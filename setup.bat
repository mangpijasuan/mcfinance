@echo off
echo.
echo ================================================
echo   Millionaires Club Admin -- Setup
echo ================================================
echo.
echo Needs Node.js 22+ and Docker Desktop (for the local PostgreSQL database).
echo.

:: 1. Env files
if not exist .env.local (
    copy .env.example .env.local
    echo [OK] Created .env.local
    echo      Set NEXTAUTH_SECRET and MFA_ENCRYPTION_KEY in .env.local.
    echo      Each can be generated with: openssl rand -base64 32
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
call npm install || goto :error

:: 3. Database: start PostgreSQL and apply migrations
echo.
echo Starting PostgreSQL and applying migrations...
call npm run db:up || goto :error
call npx prisma migrate deploy || goto :error

:: 4. Seed data
if "%ADMIN_SEED_PASSWORD%"=="" (
    set /p ADMIN_SEED_PASSWORD=Choose a password for admin@millionairesclub.com ^(12+ characters^): 
)
echo.
echo Loading club data...
call npx prisma db seed || goto :error

echo.
echo ================================================
echo   All done!
echo.
echo   Run:  npm run dev
echo   Open: http://localhost:3000
echo.
echo   Login: admin@millionairesclub.com
echo          with the password you just chose.
echo   You will set up two-factor authentication at first sign-in.
echo ================================================
echo.
pause
exit /b 0

:error
echo.
echo Setup failed. See the message above.
pause
exit /b 1
