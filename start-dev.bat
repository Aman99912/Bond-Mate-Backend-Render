@echo off
echo Starting Bond Mate Backend in Development Mode...

REM Check if port 3000 is in use
netstat -ano | findstr :3000 >nul
if %errorlevel% == 0 (
    echo Port 3000 is already in use. Please kill the process first.
    echo Run: netstat -ano ^| findstr :3000
    echo Then: taskkill /PID <PID_NUMBER> /F
    pause
    exit /b 1
)

REM Start the development server
echo Starting development server...
call npm run dev

pause
