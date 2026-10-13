@echo off
setlocal
cd /d "%~dp0"

echo === Installing/updating build dependencies ===
pip install --upgrade pyinstaller pywebview flask flask-cors pillow

echo.
echo === Cleaning previous build ===
if exist build rmdir /s /q build
if exist dist  rmdir /s /q dist

echo.
echo === Building LayoutForge.exe ===
pyinstaller --noconfirm --clean build.spec

echo.
if exist "dist\LayoutForge.exe" (
    echo OK: dist\LayoutForge.exe
) else (
    echo BUILD FAILED
)
endlocal
pause