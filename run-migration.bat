@echo off
echo 🔧 Running platform data migration...
cd /d "%~dp0"
node scripts/fixPlatformData.js
echo ✅ Migration completed!
pause
