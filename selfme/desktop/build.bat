@echo off
REM Build script for SelfMe Desktop (Windows)

echo Building SelfMe Desktop...

REM Step 1: Build Web UI
echo Building Web UI...
cd ..\web\frontend
call pnpm run build
cd ..\..\desktop

REM Step 2: Copy Web UI dist
echo Copying Web UI to desktop...
if exist dist rmdir /s /q dist
mkdir dist
xcopy /s /e /y ..\web\dist\* dist\

REM Step 3: Install dependencies (if needed)
if not exist node_modules (
  echo Installing dependencies...
  call pnpm install
)

REM Step 4: Build Electron app
echo Building Electron app...
call pnpm run build

echo Build complete! Check the build\ directory.
