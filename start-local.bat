@echo off
echo Starting Change Tracker locally...
echo.

cd /d "%~dp0backend"

echo [1/2] Starting backend on http://localhost:8000 ...
start "Backend" cmd /k "venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 3 /nobreak >nul

echo [2/2] Starting frontend on http://localhost:3000 ...
cd /d "%~dp0frontend"
start "Frontend" cmd /k "npm run dev"

echo.
echo Both servers starting in separate windows.
echo   API:      http://localhost:8000/docs
echo   Frontend: http://localhost:3000
echo   Login:    see BOOTSTRAP_* credentials in backend\.env
echo.
pause
