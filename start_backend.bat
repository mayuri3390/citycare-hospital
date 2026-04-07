@echo off
echo ==================================================
echo  CityCare Hospital Management System
echo  Backend Setup Script
echo ==================================================
echo.

cd /d "%~dp0backend"

echo [1/3] Creating virtual environment...
python -m venv venv
call venv\Scripts\activate.bat

echo.
echo [2/3] Installing dependencies...
pip install -r requirements.txt

echo.
echo [3/3] Starting Flask server on http://localhost:5000
echo     (CTRL+C to stop)
echo.
echo NOTE: Ensure MySQL is running and configured in backend/config/config.py
echo Default MySQL credentials: host=localhost, user=root, password=(empty), db=citycare_db
echo.

python app.py

pause
