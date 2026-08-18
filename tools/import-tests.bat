@echo off
REM ============================================================
REM  Quizzy — Test Cafe folder importer (drag & drop)
REM
REM  Drag a folder of test JSONs onto this file and drop it.
REM  Everything else happens automatically.
REM
REM  You can also run it from a terminal with the same options
REM  as import-tests.js, e.g.:
REM     import-tests.bat "D:\tests\pw test" --under "PW Test"
REM ============================================================
setlocal

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo   x Node.js was not found on this PC.
    echo     Install it from https://nodejs.org then try again.
    echo.
    pause
    exit /b 1
)

if "%~1"=="" (
    echo.
    echo   Drag a folder of test JSONs onto this file to import it.
    echo.
    node "%~dp0import-tests.js" --help
    echo.
    echo   Current Test Cafe contents:
    node "%~dp0import-tests.js" --list
    pause
    exit /b 0
)

node "%~dp0import-tests.js" %*
echo.
pause
