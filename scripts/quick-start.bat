@echo off
echo 🚀 DEX Platform Quick Start (Windows)
echo ====================================

REM Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 18+ first.
    pause
    exit /b 1
)

REM Check npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm is not installed. Please install npm first.
    pause
    exit /b 1
)

echo ✅ Dependencies check passed

REM Install dependencies
echo 📦 Installing dependencies...

echo Installing root dependencies...
call npm install

echo Installing backend dependencies...
cd backend
call npm install
cd ..

echo Installing frontend dependencies...
cd frontend
call npm install --legacy-peer-deps
cd ..

echo ✅ Dependencies installed

REM Build applications
echo 🔨 Building applications...

echo Building backend...
cd backend
call npm run build >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Backend built successfully
) else (
    echo ℹ️ Backend build script not found or failed, continuing...
)
cd ..

echo Building frontend...
cd frontend
call npm run build >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Frontend built successfully
) else (
    echo ⚠️ Frontend build failed, but continuing with development mode
)
cd ..

REM Start services
echo 🎯 Starting DEX platform...

echo Starting backend server...
cd backend
start "DEX Backend" cmd /k "npm run dev"
cd ..

REM Wait for backend to start
timeout /t 3 /nobreak >nul

echo Starting frontend development server...
cd frontend
start "DEX Frontend" cmd /k "npm start"
cd ..

REM Wait for services to start
echo ⏳ Waiting for services to start...
timeout /t 8 /nobreak >nul

echo 🏥 Checking service health...

REM Check backend
curl -f http://localhost:3001/health >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Backend is running at http://localhost:3001
) else (
    echo ⚠️ Backend may not be fully ready yet
)

REM Check frontend
curl -f http://localhost:3000 >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Frontend is running at http://localhost:3000
) else (
    echo ⚠️ Frontend may not be fully ready yet
)

echo.
echo 🎉 DEX Platform is starting!
echo ==========================
echo 🌐 Frontend: http://localhost:3000
echo 🔗 Backend API: http://localhost:3001
echo 📊 Health Check: http://localhost:3001/health
echo 📈 Monitoring: http://localhost:3001/api/monitoring/metrics
echo.
echo 📝 Services are running in separate windows
echo    Close those windows to stop the services
echo.
echo Press any key to exit this script...
pause >nul