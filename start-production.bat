@echo off
echo Starting Bond Mate Backend in Production Mode...

REM Check if port 3000 is in use
netstat -ano | findstr :3000 >nul
if %errorlevel% == 0 (
    echo Port 3000 is already in use. Please kill the process first.
    echo Run: netstat -ano ^| findstr :3000
    echo Then: taskkill /PID <PID_NUMBER> /F
    pause
    exit /b 1
)

REM Build the project
echo Building TypeScript...
call npm run build
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)

REM Start the production server
echo Starting production server...
call npm run start:prod

pause
