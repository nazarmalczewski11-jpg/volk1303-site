@echo off
chcp 65001 > nul
title VOLK 1303 - Завантаження на GitHub
echo ========================================================
echo   VOLK 1303 - ЗАВАНТАЖЕННЯ КОДУ НА GITHUB
echo ========================================================
echo.
echo 1. Перейдіть на сайт https://github.com у браузері.
echo 2. Увійдіть у свій акаунт та створіть НОВИЙ репозиторій (New repository).
echo    - Дайте йому назву (наприклад, volk1303-site).
echo    - Залиште його публічним або приватним (на ваш вибір).
echo    - НЕ додавайте README, .gitignore або ліцензію (репозиторій має бути порожнім).
echo 3. Скопіюйте посилання на ваш репозиторій.
echo    (наприклад: https://github.com/vash-username/volk1303.git)
echo.
set /p repo_url="Введіть або вставте посилання на репозиторій: "

if "%repo_url%"=="" (
    echo Помилка: Посилання не введено!
    pause
    exit /b
)

echo.
echo Налаштування зв'язку з GitHub...
git remote remove origin >nul 2>&1
git remote add origin %repo_url%
git branch -M main

echo.
echo Завантаження коду на GitHub (може з'явитися вікно для авторизації на GitHub)...
git push -u origin main

if %errorlevel% neq 0 (
    echo.
    echo [ПОМИЛКА] Не вдалося завантажити код. Будь ласка, перевірте підключення та спробуйте знову.
) else (
    echo.
    echo [УСПІХ] Код успішно завантажено на GitHub!
    echo Тепер ви можете легко розгорнути його на Vercel.
)
echo.
pause
