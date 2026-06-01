@echo off
chcp 65001 > nul
title VOLK 1303 - Автоматичне створення репозиторію на GitHub
echo =====================================================================
echo   VOLK 1303 - АВТОМАТИЧНЕ СТВОРЕННЯ РЕПОЗИТОРІЮ НА GITHUB
echo =====================================================================
echo.
echo Щоб автоматично створити репозиторій, мені потрібен ваш Токен GitHub (PAT).
echo.
echo КРОК 1: Створіть токен доступу за цим швидким посиланням:
echo 👉 https://github.com/settings/tokens/new?scopes=repo^&description=VOLK1303-Deploy-Token
echo (увійдіть у свій GitHub, прокрутіть вниз та натисніть "Generate token")
echo Скопіюйте створений токен (починається на ghp_...).
echo.
echo КРОК 2: Введіть ваші дані нижче:
echo.

set /p github_user="Введіть ваш логін GitHub (username): "
set /p github_token="Введіть ваш скопійований токен (PAT): "
set /p github_repo="Введіть назву для нового репозиторію [за замовчуванням: volk1303-site]: "

if "%github_repo%"=="" set github_repo=volk1303-site

if "%github_user%"=="" (
    echo Помилка: Логін не введено!
    pause
    exit /b
)
if "%github_token%"=="" (
    echo Помилка: Токен не введено!
    pause
    exit /b
)

echo.
echo ⏳ Створення репозиторію '%github_repo%' на вашому GitHub...
powershell -Command "$body = @{ name = '%github_repo%'; private = $false } | ConvertTo-Json; $headers = @{ 'Authorization' = 'token %github_token%'; 'Accept' = 'application/vnd.github.v3+json'; 'User-Agent' = 'VOLK1303-Deployer' }; try { $res = Invoke-RestMethod -Uri 'https://api.github.com/user/repos' -Method Post -Headers $headers -Body $body -ContentType 'application/json'; echo '[УСПІХ] Репозиторій успішно створено на GitHub!'; exit 0 } catch { echo '[ПОМИЛКА] Не вдалося створити репозиторій. Перевірте токен або назву.'; exit 1 }"

if %errorlevel% neq 0 (
    echo.
    echo Спробуйте ще раз. Переконайтеся, що токен активний та репозиторій із такою назвою ще не існує.
    pause
    exit /b
)

echo.
echo ⏳ Прив'язка локального проекту та завантаження коду...
git remote remove origin >nul 2>&1
git remote add origin "https://%github_user%:%github_token%@github.com/%github_user%/%github_repo%.git"
git branch -M main
git push -u origin main

if %errorlevel% neq 0 (
    echo.
    echo [ПОМИЛКА] Не вдалося вивантажити код на GitHub.
) else (
    echo.
    echo =====================================================================
    echo   [УСПІХ] ВСЕ ГОТОВО! КОД УСПІШНО ЗАВАНТАЖЕНО НА GITHUB!
    echo =====================================================================
    echo.
    echo Тепер просто перейдіть на https://vercel.com, увійдіть через GitHub,
    echo виберіть репозиторій '%github_repo%' та натисніть 'Deploy'.
)
echo.
pause
