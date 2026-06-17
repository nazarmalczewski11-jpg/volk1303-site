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
    "tournament.html"
]

files_to_upload_assets = [
    "cs_abstract_bg.png",
    "cs_tournament_bg.png",
    "qr_crypto.png",
    "qr_mono.png",
    "wolf_banner.png",
    "wolf_logo.png",
    "stream_offline_bg.jpg"
]

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        print("Встановлення з'єднання з VPS...")
        ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=15)
        print("З'єднання успішно встановлено!")

        # 1. Backup old dist folder and database if exists
        backup_cmd = (
            f"if [ -d \"{REMOTE_DIST}\" ]; then mv \"{REMOTE_DIST}\" \"{REMOTE_DIST}_backup_$(date +%Y%m%d_%H%M%S)\"; fi; "
            f"if [ -f \"/var/www/volk1303/kv_store.json\" ]; then cp \"/var/www/volk1303/kv_store.json\" \"/var/www/volk1303/kv_store.json.bak_$(date +%Y%m%d_%H%M%S)\"; fi"
        )
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

        # Upload backend files
        backend_files = ["server.js", "kv_store.json"]
        for filename in backend_files:
            local_path = os.path.join(LOCAL_DIR, filename)
            remote_path = f"/var/www/volk1303/{filename}"
            if os.path.exists(local_path):
                print(f"Завантаження бекенд-файлу: {filename} -> {remote_path}")
                sftp.put(local_path, remote_path)
            else:
                print(f"Увага: локальний бекенд-файл {filename} не знайдено!")

        # Upload assets recursively
        def upload_dir_recursive(local_path, remote_path):
            try:
                sftp.mkdir(remote_path)
                print(f"Створено директорію на сервері: {remote_path}")
            except IOError:
                pass  # Directory already exists
            
            for item in os.listdir(local_path):
                l_item = os.path.join(local_path, item)
                r_item = f"{remote_path}/{item}"
                if os.path.isdir(l_item):
                    upload_dir_recursive(l_item, r_item)
                else:
                    print(f"Завантаження асету: {item} -> {r_item}")
                    sftp.put(l_item, r_item)

        print("Рекурсивне завантаження асетів...")
        upload_dir_recursive(LOCAL_ASSETS, REMOTE_ASSETS)

        sftp.close()
        print("SFTP завантаження завершено!")

        # 4. Restart services
        print("Перевірка конфігурації Nginx...")
        stdin, stdout, stderr = ssh.exec_command("nginx -t")
        nginx_t_err = stderr.read().decode('utf-8', errors='replace')
        print(nginx_t_err.strip())

        print("Перезапуск бекенд-сервісу (volk-api.service)...")
        stdin, stdout, stderr = ssh.exec_command("systemctl restart volk-api")
        stdout.read()
        
        print("Перезапуск веб-сервера Nginx...")
        stdin, stdout, stderr = ssh.exec_command("systemctl restart nginx")
        stdout.read()
        
        print("\nДеплой успішно виконано!")
        print("Основний сайт: https://volk1303.online")
        print("Панель адміністратора: https://volk1303.online/admin.html")

    except Exception as e:
        print(f"Помилка під час деплою: {e}")
    finally:
        ssh.close()
        print("З'єднання закрите.")

if __name__ == "__main__":
    main()
