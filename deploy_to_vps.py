import os
import sys
import subprocess

# Ensure paramiko is installed
try:
    import paramiko
except ImportError:
    print("Встановлення необхідної бібліотеки paramiko...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko"])
    import paramiko

# Connection details
HOST = "203.161.55.65"
PORT = 22
USER = "root"
PASSWORD = "fWNCv520JK0fQ1i2yh"

# Directories (relative to this script)
LOCAL_DIR = os.path.dirname(os.path.abspath(__file__))
LOCAL_ASSETS = os.path.join(LOCAL_DIR, "assets")

# Remote VPS paths
REMOTE_DIST = "/var/www/volk1303/dist"
REMOTE_ASSETS = "/var/www/volk1303/dist/assets"

files_to_upload_root = [
    "admin.html",
    "admin.js",
    "app.js",
    "betting.html",
    "index.html",
    "my-bets.html",
    "profile.html",
    "shop.html",
    "smoke-bg.js",
    "style.css",
    "tournament.html",
    "крипта.png",
    "моно.png"
]

files_to_upload_assets = [
    "cs_abstract_bg.png",
    "cs_tournament_bg.png",
    "qr_crypto.png",
    "qr_mono.png",
    "wolf_banner.png",
    "wolf_logo.png"
]

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        print("Встановлення з'єднання з VPS...")
        ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=15)
        print("З'єднання успішно встановлено!")

        # 1. Backup old dist folder if exists
        backup_cmd = f"if [ -d \"{REMOTE_DIST}\" ]; then mv \"{REMOTE_DIST}\" \"{REMOTE_DIST}_backup_$(date +%Y%m%d_%H%M%S)\"; fi"
        print(f"Створення резервної копії старої версії: {backup_cmd}")
        stdin, stdout, stderr = ssh.exec_command(backup_cmd)
        stdout.read()
        err = stderr.read().decode('utf-8', errors='replace')
        if err:
            print(f"Попередження бекапу: {err}")
        else:
            print("Бекап завершено успішно.")

        # 2. Create remote folders
        print("Створення директорій на сервері...")
        mkdir_cmd = f"mkdir -p {REMOTE_ASSETS}"
        stdin, stdout, stderr = ssh.exec_command(mkdir_cmd)
        stdout.read()
        
        # 3. SFTP Upload
        print("Початок завантаження файлів через SFTP...")
        sftp = ssh.open_sftp()

        # Upload root files
        for filename in files_to_upload_root:
            local_path = os.path.join(LOCAL_DIR, filename)
            remote_path = f"{REMOTE_DIST}/{filename}"
            if os.path.exists(local_path):
                print(f"Завантаження: {filename} -> {remote_path}")
                sftp.put(local_path, remote_path)
            else:
                print(f"Увага: локальний файл {filename} не знайдено!")

        # Upload assets
        for filename in files_to_upload_assets:
            local_path = os.path.join(LOCAL_ASSETS, filename)
            remote_path = f"{REMOTE_ASSETS}/{filename}"
            if os.path.exists(local_path):
                print(f"Завантаження асету: {filename} -> {remote_path}")
                sftp.put(local_path, remote_path)
            else:
                print(f"Увага: локальний асет {filename} не знайдено!")

        sftp.close()
        print("SFTP завантаження завершено!")

        # 4. Restart Nginx
        print("Перевірка конфігурації Nginx...")
        stdin, stdout, stderr = ssh.exec_command("nginx -t")
        nginx_t_err = stderr.read().decode('utf-8', errors='replace')
        print(nginx_t_err.strip())

        print("Перезапуск веб-сервера Nginx...")
        stdin, stdout, stderr = ssh.exec_command("systemctl restart nginx")
        stdout.read()
        
        print("\nДеплой успішно виконано!")
        print("Ваш сайт доступний за посиланням: https://volk1303.online")

    except Exception as e:
        print(f"Помилка під час деплою: {e}")
    finally:
        ssh.close()
        print("З'єднання закрите.")

if __name__ == "__main__":
    main()
