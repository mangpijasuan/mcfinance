@echo off
echo.
echo  Setting up Loan Agreements + Policy Enforcement...
echo.
echo  Updating database schema...
call npx prisma db push
echo.
echo  Done! New features:
echo.
echo   Agreements page:     View and sign all loan agreements
echo   Policy enforcement:  New loans are automatically checked against policy
echo   Member portal:       Members can sign their agreements online
echo.
pause
