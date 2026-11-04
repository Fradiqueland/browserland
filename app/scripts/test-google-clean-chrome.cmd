@echo off
setlocal DisableDelayedExpansion
title Browserland - Teste de compatibilidade Google

rem Manual diagnostic only. Never use an existing browser profile, debugging,
rem extensions, custom identity, proxy overrides, or automatic account actions.
set "MB_TEST_CHROME="
if defined ProgramFiles if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "MB_TEST_CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined MB_TEST_CHROME if defined ProgramFiles(x86) if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "MB_TEST_CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined MB_TEST_CHROME if defined LOCALAPPDATA if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "MB_TEST_CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined MB_TEST_CHROME goto missing_chrome
if not defined LOCALAPPDATA goto missing_data
set "MB_TEST_ROOT=%LOCALAPPDATA%\Browserland-Google-Diagnostic"
if not exist "%MB_TEST_ROOT%\" mkdir "%MB_TEST_ROOT%"
if not exist "%MB_TEST_ROOT%\" goto missing_data

:new_profile
set "MB_TEST_PROFILE=%MB_TEST_ROOT%\profile-%RANDOM%-%RANDOM%-%RANDOM%"
if exist "%MB_TEST_PROFILE%" goto new_profile
mkdir "%MB_TEST_PROFILE%"
if not exist "%MB_TEST_PROFILE%\" goto missing_data

echo Vai abrir o Google Chrome instalado com um perfil novo e separado.
echo O teste usa as definicoes normais de rede do Chrome.
echo Os perfis existentes do Browserland e do Chrome ficam intactos.
echo A sessao de teste fica guardada nesta pasta:
echo "%MB_TEST_PROFILE%"
echo.
echo Na janela do Chrome, tente entrar na sua conta Google manualmente.
echo Depois indique se funcionou ou envie a mensagem exata do erro.
echo.
start "" "%MB_TEST_CHROME%" "--user-data-dir=%MB_TEST_PROFILE%" --new-window "https://accounts.google.com/"
if errorlevel 1 goto launch_failed
echo Pode fechar esta janela de instrucoes.
pause
exit /b 0

:missing_chrome
echo Nao foi encontrado o Google Chrome instalado neste computador.
pause
exit /b 1

:missing_data
echo Nao foi possivel criar uma pasta nova para este teste.
pause
exit /b 1

:launch_failed
echo Nao foi possivel abrir o Google Chrome. Nenhum perfil existente foi alterado.
pause
exit /b 1
