#!/bin/bash

echo "🚀 DEX Platform Quick Start"
echo "=========================="

# Check if running on Windows
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    echo "📋 Windows environment detected"
    NPM_CMD="npm.cmd"
else
    echo "📋 Unix environment detected"
    NPM_CMD="npm"
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check dependencies
echo "🔍 Checking dependencies..."

if ! command_exists node; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

if ! command_exists npm; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Dependencies check passed"

# Install dependencies
echo "📦 Installing dependencies..."

echo "Installing root dependencies..."
$NPM_CMD install

echo "Installing backend dependencies..."
cd backend
$NPM_CMD install
cd ..

echo "Installing frontend dependencies..."
cd frontend
$NPM_CMD install --legacy-peer-deps
cd ..

echo "✅ Dependencies installed"

# Build applications
echo "🔨 Building applications..."

echo "Building backend..."
cd backend
if [ -f "package.json" ] && $NPM_CMD run build >/dev/null 2>&1; then
    echo "✅ Backend built successfully"
else
    echo "ℹ️ Backend build script not found or failed, continuing..."
fi
cd ..

echo "Building frontend..."
cd frontend
if [ -f "package.json" ] && $NPM_CMD run build >/dev/null 2>&1; then
    echo "✅ Frontend built successfully"
else
    echo "⚠️ Frontend build failed, but continuing with development mode"
fi
cd ..

# Start services
echo "🎯 Starting DEX platform..."

# Start backend in development mode
echo "Starting backend server..."
cd backend
$NPM_CMD run dev &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 3

# Start frontend in development mode
echo "Starting frontend development server..."
cd frontend
$NPM_CMD start &
FRONTEND_PID=$!
cd ..

# Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 5

# Check if services are running
echo "🏥 Checking service health..."

# Check backend
if curl -f http://localhost:3001/health >/dev/null 2>&1; then
    echo "✅ Backend is running at http://localhost:3001"
else
    echo "⚠️ Backend may not be fully ready yet"
fi

# Check frontend
if curl -f http://localhost:3000 >/dev/null 2>&1; then
    echo "✅ Frontend is running at http://localhost:3000"
else
    echo "⚠️ Frontend may not be fully ready yet"
fi

echo ""
echo "🎉 DEX Platform is starting!"
echo "=========================="
echo "🌐 Frontend: http://localhost:3000"
echo "🔗 Backend API: http://localhost:3001"
echo "📊 Health Check: http://localhost:3001/health"
echo "📈 Monitoring: http://localhost:3001/api/monitoring/metrics"
echo ""
echo "📝 To stop the services:"
echo "   Press Ctrl+C or run: pkill -f 'npm'"
echo ""
echo "🔍 Logs will appear below..."

# Keep script running and show logs
wait