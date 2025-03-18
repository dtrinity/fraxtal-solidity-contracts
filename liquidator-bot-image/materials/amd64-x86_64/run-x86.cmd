@echo off
setlocal

:: Get command line arguments
set network=fraxtal_mainnet
set dex=combo

if "%network%"=="" goto usage
if "%dex%"=="" goto usage
goto continue

:usage
echo Usage: %0 ^<network^> ^<dex^>
exit /b 1

:continue
:: Get the current directory of the script
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

:: Load the docker image
echo Loading docker image...
docker load -i "%SCRIPT_DIR%\liquidator-bot-amd64.tar"

:: If there is a running container, remove it
docker ps | findstr "liquidator-bot-%network%" >nul
if %ERRORLEVEL% EQU 0 (
    echo Removing running container...
    docker rm -f liquidator-bot-%network%
)

:: Run the container with the specified configuration
echo Running container...
docker run ^
    -d ^
    -v "%CD%\.env:/usr/src/.env:ro" ^
    -v "%CD%\state:/usr/src/state" ^
    --memory 768m ^
    --restart unless-stopped ^
    --name liquidator-bot-%network% ^
    liquidator-bot:latest %network% %dex%

endlocal