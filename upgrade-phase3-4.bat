@echo off
echo.
echo  Upgrading to Phase 3 + 4 (Withdrawals + Notifications)...
echo.
echo  Updating database schema...
call npx prisma db push
echo.
echo  Done! New features available:
echo.
echo   Withdrawals page:   Track member withdrawals
echo   Notifications page: Send email reminders
echo.
echo  To enable email sending:
echo  1. Sign up free at resend.com
echo  2. Add to your .env file:
echo       RESEND_API_KEY="re_your_key_here"
echo       ADMIN_EMAIL="your@email.com"
echo  3. Restart with: npm run dev
echo.
pause
