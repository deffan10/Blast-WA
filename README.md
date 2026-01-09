# 📱 WhatsApp Blast - Bulk Messaging Application

Aplikasi web untuk mengirim pesan WhatsApp massal dengan fitur anti-ban dan manajemen kontak yang lengkap.

![Node.js](https://img.shields.io/badge/Node.js-20.x-green)
![Baileys](https://img.shields.io/badge/Baileys-7.x-blue)
![MySQL](https://img.shields.io/badge/MySQL-8.x-orange)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 📋 Daftar Isi

- [Fitur](#-fitur)
- [Screenshots](#-screenshots)
- [Teknologi](#-teknologi)
- [Spesifikasi Sistem](#-spesifikasi-sistem)
- [Quick Start](#-quick-start)
- [Instalasi Development](#-instalasi-development)
- [Konfigurasi](#️-konfigurasi)
- [Panduan Penggunaan](#-panduan-penggunaan)
- [Fitur Anti-Ban](#-fitur-anti-ban)
- [Deploy Production](#-deploy-production)
- [API Documentation](#-api-documentation)
- [Troubleshooting](#-troubleshooting)
- [Changelog](#-changelog)
- [Disclaimer](#️-disclaimer)

---

## ✨ Fitur

### Core Features
- ✅ **WhatsApp Web Integration** - Menggunakan Baileys v7.0.0-rc.9 (unofficial API)
- ✅ **QR Code Authentication** - Login via scan QR dari HP
- ✅ **Session Persistence** - Session tersimpan, tidak perlu scan ulang setiap restart
- ✅ **Bulk Messaging** - Kirim pesan ke banyak kontak sekaligus
- ✅ **Contact Management** - Import Excel dengan template download, grup kontak, validasi nomor WA
- ✅ **Message Templates** - Template dengan variabel `{{nama}}`, `{{no_hp}}`, `{{group}}` dan tracking penggunaan
- ✅ **Campaign Management** - Buat, jalankan, pause, resume, stop campaign dengan status dan durasi

### Anti-Ban Features
- ✅ **Random Delay** - Jeda acak antar pesan (1-15 menit, termasuk 1 menit untuk testing)
- ✅ **Daily Limit** - Batas pesan per hari (default 100)
- ✅ **Message Variation** - Variasi pesan otomatis (spasi invisible)
- ✅ **Consecutive Error Stop** - Stop otomatis jika 5 error berturut
- ✅ **Connection Conflict Detection** - Deteksi dan handle sesi duplikat

### Dashboard Features
- ✅ **Real-time Status** - Status koneksi WA via WebSocket (Socket.io)
- ✅ **Statistics** - Statistik pengiriman (sent, failed, skipped)
- ✅ **Pie Chart Statistik Blast** - Visualisasi donut chart untuk sent/failed/skipped
- ✅ **5 Campaign Terakhir** - Tabel ringkasan campaign dengan template, kontak, progress, durasi, status (Selesai/Proses)
- ✅ **Activity Log dengan Pagination** - 5 log per halaman, navigasi prev/next
- ✅ **Live Countdown Timer** - Countdown waktu tersisa untuk pesan pending (real-time)
- ✅ **Queue Position** - Posisi antrian untuk setiap pesan pending
- ✅ **Campaign Status & Duration** - Status otomatis "Selesai" saat 100%, tampilan durasi campaign
- ✅ **Template Usage Counter** - Tracking penggunaan template pesan
- ✅ **Responsive UI** - Tailwind CSS, Lucide Icons, mobile-friendly
- ✅ **Footer Credit** - Footer dengan credit di login (transparan) dan dashboard (putih)

---

## 📸 Screenshots

<img width="1873" height="948" alt="image" src="https://github.com/user-attachments/assets/77c575a4-dce6-448c-b48d-f2a6ac5e978b" />

### Login Page
- Modern gradient design
- Email & password authentication
- JWT token-based security
- Footer credit transparan menyatu dengan gradient

<img width="1868" height="948" alt="image" src="https://github.com/user-attachments/assets/a9809820-de79-45be-9584-8b24da63b7f9" />

### Dashboard
- Real-time statistics cards
- WhatsApp connection status indicator
- Pie chart statistik blast (sent/failed/skipped)
- 5 campaign terakhir dengan detail progress
- Recent activity with live countdown
- Blast statistics with progress bars

<img width="1867" height="949" alt="image" src="https://github.com/user-attachments/assets/cd3c4193-a656-46a8-b67f-11710ded4cf9" />

### Campaign Management
- Create new campaign with template selection
- Target specific contact groups
- Configurable message interval
- Pause/Resume/Stop controls

---

## 🛠 Teknologi

| Layer | Teknologi |
|-------|-----------|
| **Runtime** | Node.js 20.x LTS |
| **Framework** | Express.js 4.18.x |
| **WhatsApp** | @whiskeysockets/baileys 7.0.0-rc.9 |
| **Database** | MySQL 8.x + Sequelize ORM 6.x |
| **Realtime** | Socket.io 4.7.x |
| **Auth** | JWT (jsonwebtoken 9.x) + bcryptjs |
| **Frontend** | Vanilla JS, Tailwind CSS, Lucide Icons |
| **Queue** | In-memory queue (production-ready) |
| **File Upload** | Multer 2.x + ExcelJS 4.x |

---

## 💻 Spesifikasi Sistem

### Minimum Requirements

| Resource | Development | Production |
|----------|-------------|------------|
| CPU | 2 Core | 4 Core |
| RAM | 2 GB | 4 GB |
| Storage | 10 GB | 50 GB SSD |
| Node.js | 18.x+ | 20.x LTS |
| MySQL | 5.7+ | 8.x |

### Software Requirements

- **Node.js** >= 18.0.0 (Recommended: 20.x LTS)
- **MySQL** >= 5.7 (Recommended: 8.x)
- **npm** >= 9.x atau **yarn** >= 1.22
- **Git** (untuk clone repository)

### Untuk Production
- **PM2** (process manager)
- **Nginx** (reverse proxy)
- **SSL Certificate** (Let's Encrypt)
- **VPS/Cloud Server** (Ubuntu 22.04 recommended)

---

## 🚀 Quick Start

```bash
# 1. Clone & Install
git clone <repository-url>
cd Blast-WA
npm install

# 2. Setup Database (MySQL)
mysql -u root -p -e "CREATE DATABASE blast_wa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 3. Configure Environment
cp .env.example .env
# Edit .env sesuai kebutuhan

# 4. Start Server
npm run dev

# 5. Open Browser
# http://localhost:3000
# Login: admin@blasta.com / admin123
```

---

## 🚀 Instalasi Development

### 1. Clone Repository

```bash
git clone <repository-url>
cd Blast-WA
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Database

```sql
-- Login ke MySQL
mysql -u root -p

-- Buat database
CREATE DATABASE blast_wa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Buat user (optional)
CREATE USER 'wa'@'localhost' IDENTIFIED BY 'wa123';
GRANT ALL PRIVILEGES ON blast_wa.* TO 'wa'@'localhost';
FLUSH PRIVILEGES;
```

### 4. Konfigurasi Environment

```bash
# Copy template environment
cp .env.example .env

# Edit konfigurasi
nano .env
```

### 5. Jalankan Server

```bash
# Development
npm run dev

# Production
npm start
```

### 6. Akses Dashboard

```
URL: http://localhost:3000
Email: admin@blasta.com
Password: admin123
```

---

## ⚙️ Konfigurasi

### File `.env`

```env
# ==================================
# SERVER CONFIGURATION
# ==================================
PORT=3000
NODE_ENV=development

# ==================================
# DATABASE CONFIGURATION
# ==================================
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=blast_wa
DB_USER=root
DB_PASSWORD=

# ==================================
# JWT AUTHENTICATION
# ==================================
# WAJIB GANTI untuk production!
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_EXPIRES_IN=24h

# ==================================
# WHATSAPP SETTINGS
# ==================================
WA_SESSION_PATH=./wa_sessions
MAX_MESSAGES_PER_DAY=100
MIN_DELAY_SECONDS=300
MAX_DELAY_SECONDS=900
RANDOM_DELAY_MIN=30
RANDOM_DELAY_MAX=90

# ==================================
# ADMIN ACCOUNT
# ==================================
# WAJIB GANTI untuk production!
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=SecurePassword123!

# ==================================
# CORS (Production only)
# ==================================
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# ==================================
# REDIS (Optional - for Bull Queue)
# ==================================
# REDIS_HOST=localhost
# REDIS_PORT=6379
# REDIS_PASSWORD=
```

### Konfigurasi Anti-Ban (Recommended)

| Setting | Default | Recommended | Description |
|---------|---------|-------------|-------------|
| `MAX_MESSAGES_PER_DAY` | 100 | 50-100 | Batas pesan per hari |
| `MIN_DELAY_SECONDS` | 300 | 300-600 | Delay minimum (5-10 menit) |
| `MAX_DELAY_SECONDS` | 900 | 900-1800 | Delay maksimum (15-30 menit) |
| `RANDOM_DELAY_MIN` | 30 | 30-60 | Random tambahan min (detik) |
| `RANDOM_DELAY_MAX` | 90 | 60-120 | Random tambahan max (detik) |

---

## 📖 Panduan Penggunaan

### 1️⃣ Login & Koneksi WhatsApp

1. Buka `http://localhost:3000`
2. Login dengan kredensial admin
3. Klik tab **"WhatsApp"**
4. Klik tombol **"Scan QR"**
5. Buka WhatsApp di HP → **Linked Devices** → **Link a Device**
6. Scan QR Code yang muncul
7. Tunggu status berubah menjadi **"Connected"**

### 2️⃣ Kelola Kontak

**Tambah Manual:**
1. Klik tab **"Contacts"**
2. Klik **"Add Contact"**
3. Isi nama, nomor HP (format: 08xx atau 628xx)
4. Pilih grup (opsional)
5. Klik **"Save"**

**Import CSV:**
1. Siapkan file CSV dengan format:
   ```csv
   name,phone,group
   John Doe,081234567890,Customer
   Jane Doe,089876543210,Prospect
   ```
2. Klik **"Import CSV"**
3. Upload file
4. Kontak akan ditambahkan otomatis

**Validasi Nomor WA:**
1. Pilih kontak yang ingin divalidasi
2. Klik **"Validate"**
3. Sistem akan cek apakah nomor terdaftar di WhatsApp
4. Status akan berubah menjadi ✅ (registered) atau ❌ (not registered)

### 3️⃣ Buat Template Pesan

1. Klik tab **"Templates"**
2. Klik **"Add Template"**
3. Isi nama template
4. Tulis konten pesan dengan variabel:
   - `{{nama}}` - Nama kontak
   - `{{no_hp}}` - Nomor HP
   - `{{group}}` - Nama grup
5. Contoh:
   ```
   Halo {{nama}}! 👋

   Terima kasih sudah bergabung dengan kami.
   Nomor Anda {{no_hp}} sudah terdaftar di grup {{group}}.

   Salam,
   Admin
   ```
6. Klik **"Save"**

### 4️⃣ Jalankan Campaign Blast

1. Klik tab **"Campaigns"**
2. Klik **"New Campaign"**
3. Isi:
   - **Nama Campaign** - Identifikasi campaign
   - **Template** - Pilih template pesan
   - **Target Grup** - Pilih grup kontak atau "All"
   - **Interval** - Jeda antar pesan (dalam menit)
4. Klik **"Create"**
5. Klik **"Start"** untuk mulai mengirim
6. Monitor progress di dashboard:
   - 🟢 Sent - Terkirim
   - 🔴 Failed - Gagal
   - 🟡 Skipped - Dilewati (tidak terdaftar WA)
   - 🔵 Pending - Menunggu di antrian

### 5️⃣ Kontrol Campaign

| Aksi | Fungsi |
|------|--------|
| **Start** | Mulai mengirim pesan |
| **Pause** | Jeda sementara (bisa dilanjutkan) |
| **Resume** | Lanjutkan dari pause |
| **Stop** | Hentikan permanen |

### 6️⃣ Dashboard Aktivitas Terbaru

Bagian "Aktivitas Terbaru" menampilkan log pengiriman dengan fitur:

**Pagination:**
- 5 log per halaman
- Navigasi dengan tombol **Prev** dan **Next**
- Informasi halaman "Hal X dari Y"

**Status Informatif:**

| Status | Tampilan | Keterangan |
|--------|----------|------------|
| **Sent** | 🟢 Terkirim `14:30` | Pesan berhasil dikirim, tampil jam kirim |
| **Pending** | 🔵 Antrian #3 `~2m 30d` | Posisi antrian & estimasi waktu tersisa |
| **Failed** | 🔴 Gagal | Pesan error atau waktu gagal |
| **Skipped** | 🟡 Skip | Alasan skip (not registered, dll) |

**Estimasi Waktu Pending (Live Countdown):**
- Countdown otomatis berjalan setiap detik
- Tidak perlu refresh halaman
- Menampilkan `~Xm Xd` (menit & detik tersisa)
- Berubah menjadi "Sedang dikirim..." saat waktu habis
- Dihitung dari interval campaign + random delay

---

## 🛡 Fitur Anti-Ban

### Cara Kerja

1. **Random Delay**
   - Setiap pesan dikirim dengan jeda acak
   - Formula: `base_interval + random(30-90 detik)`
   - Contoh: interval 5 menit → actual 5.5-6.5 menit

2. **Message Variation**
   - Setiap pesan sedikit berbeda
   - Menambahkan zero-width space di posisi random
   - Mencegah deteksi pesan identik

3. **Daily Limit**
   - Batas default: 100 pesan/hari
   - Reset otomatis setiap hari
   - Campaign pause otomatis saat limit tercapai

4. **Error Detection**
   - Jika 5 error berturut-turut, campaign stop
   - Mencegah spam saat ada masalah koneksi

5. **Connection Monitoring**
   - Deteksi jika WhatsApp disconnect
   - Campaign pause otomatis

### ⚠️ Tips Menghindari Ban

1. **Jangan kirim terlalu banyak**
   - Akun baru: max 20-30 pesan/hari
   - Akun lama: max 100-200 pesan/hari

2. **Gunakan delay yang wajar**
   - Minimum 5 menit antar pesan
   - Lebih baik 10-15 menit

3. **Variasi konten pesan**
   - Jangan copy-paste pesan yang sama
   - Gunakan variabel `{{nama}}`

4. **Warmup akun baru**
   - Minggu 1: 10-20 pesan/hari
   - Minggu 2: 30-50 pesan/hari
   - Minggu 3+: 50-100 pesan/hari

5. **Monitor status kontak**
   - Hapus nomor yang tidak aktif
   - Validasi nomor secara berkala

---

## 🌐 Deploy Production

### A. Persiapan VPS

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install MySQL
sudo apt install -y mysql-server
sudo mysql_secure_installation

# Install PM2
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx
```

### B. Setup Database

```bash
# Login MySQL
sudo mysql -u root -p

# Buat database dan user
CREATE DATABASE blast_wa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'blastuser'@'localhost' IDENTIFIED BY 'StrongPassword123!';
GRANT ALL PRIVILEGES ON blast_wa.* TO 'blastuser'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### C. Deploy Aplikasi

```bash
# Clone repository
cd /var/www
sudo git clone <repository-url> blast-wa
cd blast-wa

# Set ownership
sudo chown -R $USER:$USER /var/www/blast-wa

# Install dependencies
npm install --production

# Setup environment
cp .env.example .env
nano .env
```

### D. Konfigurasi Production `.env`

```env
PORT=3000
NODE_ENV=production

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=blast_wa
DB_USER=blastuser
DB_PASSWORD=StrongPassword123!

# WAJIB: Generate random string 32+ karakter
JWT_SECRET=your-very-long-random-secret-key-here-minimum-32-chars

ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=YourSecureAdminPassword123!

WA_SESSION_PATH=./wa_sessions
MAX_MESSAGES_PER_DAY=100
MIN_DELAY_SECONDS=300
MAX_DELAY_SECONDS=900

CORS_ORIGINS=https://yourdomain.com
```

### E. Setup PM2

```bash
# Buat ecosystem file
nano ecosystem.config.js
```

```javascript
module.exports = {
  apps: [{
    name: 'blast-wa',
    script: 'src/server.js',
    instances: 1,           // JANGAN lebih dari 1 (singleton WA connection)
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/error.log',
    out_file: './logs/output.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
```

```bash
# Buat folder logs
mkdir -p logs

# Start dengan PM2
pm2 start ecosystem.config.js

# Auto-start on boot
pm2 startup
pm2 save
```

### F. Setup Nginx (Reverse Proxy + SSL)

```bash
# Buat config Nginx
sudo nano /etc/nginx/sites-available/blast-wa
```

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/blast-wa /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Install Certbot untuk SSL
sudo apt install -y certbot python3-certbot-nginx

# Generate SSL
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Reload Nginx
sudo systemctl reload nginx
```

### G. Firewall

```bash
# Allow ports
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### H. Monitoring & Maintenance

```bash
# Lihat logs real-time
pm2 logs blast-wa

# Monitor resources
pm2 monit

# Restart aplikasi
pm2 restart blast-wa

# Update aplikasi
cd /var/www/blast-wa
git pull
npm install --production
pm2 restart blast-wa

# Backup database (cron daily)
sudo crontab -e
# Tambahkan:
0 2 * * * mysqldump -u blastuser -p'StrongPassword123!' blast_wa > /backup/blast_wa_$(date +\%Y\%m\%d).sql
```

---

## 📚 API Documentation

### Authentication

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "password123"
}

Response:
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": 1, "name": "Admin", "email": "admin@example.com" }
}
```

### WhatsApp

```http
# Get status
GET /api/whatsapp/status
Authorization: Bearer <token>

# Connect (generate QR)
POST /api/whatsapp/connect

# Disconnect
POST /api/whatsapp/disconnect

# Validate phone number
POST /api/whatsapp/validate
{ "phone": "081234567890" }
```

### Contacts

```http
# List contacts
GET /api/contacts?page=1&limit=10&search=john

# Create contact
POST /api/contacts
{ "name": "John", "phone": "081234567890", "group_id": 1 }

# Import CSV
POST /api/contacts/import
Content-Type: multipart/form-data
file: contacts.csv
```

### Campaigns

```http
# List campaigns
GET /api/campaigns

# Create campaign
POST /api/campaigns
{
  "name": "Promo Campaign",
  "template_id": 1,
  "group_id": 1,
  "interval_minutes": 5
}

# Start campaign
POST /api/campaigns/:id/start

# Pause/Stop
POST /api/campaigns/:id/pause
POST /api/campaigns/:id/stop
```

### Dashboard

```http
# Get dashboard statistics
GET /api/dashboard/stats
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "contacts": { "total": 100, "registered": 85, "notRegistered": 15 },
    "groups": 5,
    "templates": 3,
    "blast": {
      "total": { "sent": 500, "failed": 20, "skipped": 30 },
      "today": { "sent": 50, "failed": 2, "skipped": 5 }
    },
    "whatsapp": { "status": "connected", "name": "John Doe", "phone": "6281234567890" }
  }
}

# Get recent activity with pagination
GET /api/dashboard/activity?page=1&limit=5
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": 123,
        "phone": "081234567890",
        "name": "John Doe",
        "status": "sent",
        "sent_at": "2026-01-09T14:30:00.000Z",
        "campaign": { "name": "Promo Campaign", "interval_minutes": 5 }
      },
      {
        "id": 122,
        "phone": "089876543210",
        "name": "Jane Doe",
        "status": "pending",
        "queuePosition": 3,
        "estimatedSendTime": "2026-01-09T14:45:00.000Z",
        "timeLeftMs": 300000,
        "campaign": { "name": "Promo Campaign", "interval_minutes": 5 }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 5,
      "totalLogs": 150,
      "totalPages": 30,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

---

## ❓ Troubleshooting

### QR Code tidak muncul

```bash
# Hapus session lama
rm -rf ./wa_sessions/*

# Restart server
pm2 restart blast-wa

# Cek logs
pm2 logs blast-wa
```

### Error "Stream Errored (conflict)"

1. Buka WhatsApp di HP
2. Settings → Linked Devices
3. Logout semua device
4. Tunggu 1-2 menit
5. Scan QR ulang

### Database connection failed

```bash
# Cek MySQL running
sudo systemctl status mysql

# Test koneksi manual
mysql -u blastuser -p blast_wa

# Cek firewall
sudo ufw status
```

### WhatsApp terputus terus

1. Pastikan HP tidak mode hemat baterai
2. WhatsApp di HP harus tetap aktif (tidak di-close)
3. Koneksi internet HP harus stabil
4. Jangan login WhatsApp Web di tempat lain
5. Jika muncul "Conflict", tunggu 2 menit lalu scan ulang

### Login redirect loop / tidak bisa masuk dashboard

1. Hard refresh browser: `Ctrl + Shift + R`
2. Clear localStorage: Buka DevTools (F12) → Application → Local Storage → Clear
3. Periksa Console (F12) untuk error JavaScript
4. Pastikan server berjalan tanpa error

### Campaign stuck di "running"

```bash
# Restart server
pm2 restart blast-wa

# Atau reset manual di database
mysql -u root -p
USE blast_wa;
UPDATE blast_campaigns SET status = 'stopped' WHERE status = 'running';
```

### Countdown tidak berjalan

1. Pastikan browser mendukung JavaScript modern
2. Hard refresh: `Ctrl + Shift + R`
3. Periksa Console untuk error

---

## 📝 Changelog

### v1.0.0 (2026-01-09)

**Features:**
- Initial release
- WhatsApp integration with Baileys v7.0.0-rc.9
- Contact management with CSV/Excel import
- Message templates with variables
- Campaign management (create, pause, resume, stop)
- Real-time dashboard with Socket.io
- Activity log with pagination (5 per page)
- Live countdown timer for pending messages
- Queue position indicator
- Anti-ban features (random delay, daily limit, message variation)
- JWT authentication
- Session persistence (no need to re-scan QR)
- Connection conflict detection

**Security:**
- Production security checks for JWT_SECRET
- bcryptjs password hashing
- Protected API routes with JWT middleware
- CORS configuration for production

---

## ⚠️ Disclaimer

1. **Unofficial API** - Aplikasi ini menggunakan Baileys yang merupakan unofficial WhatsApp API. Penggunaan berisiko akun diblokir oleh WhatsApp.

2. **Gunakan dengan bijak** - Jangan gunakan untuk spam. Kirim pesan hanya ke kontak yang sudah memberikan izin.

3. **Tanggung jawab pengguna** - Developer tidak bertanggung jawab atas penyalahgunaan aplikasi atau pemblokiran akun.

4. **Terms of Service** - Penggunaan mungkin melanggar [WhatsApp Terms of Service](https://www.whatsapp.com/legal/terms-of-service).

5. **Untuk keperluan bisnis**, pertimbangkan menggunakan [WhatsApp Business API](https://www.whatsapp.com/business/api) resmi.

---

## 📄 License

MIT License - lihat file [LICENSE](LICENSE) untuk detail.

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

---

## 📞 Support

Jika mengalami masalah atau butuh bantuan:

1. Cek bagian [Troubleshooting](#-troubleshooting)
2. Buka Issue di repository ini
3. Sertakan log error dan langkah reproduksi

---

## 👨‍💻 Credits

**Build with ❤️ + AI by [@deffnotjeff](https://instagram.com/deffnotjeff)**

```
Blast-WA/
├── public/               # Frontend files
│   ├── index.html        # Main HTML
│   └── js/
│       └── app.js        # Frontend JavaScript
├── src/
│   ├── config/           # App configuration
│   ├── controllers/      # Route controllers
│   ├── middleware/       # Express middleware
│   ├── models/           # Sequelize models
│   ├── routes/           # API routes
│   ├── seeders/          # Database seeders
│   ├── services/         # Business logic
│   │   ├── queue.service.js      # Queue system
│   │   └── whatsapp.service.js   # WhatsApp integration
│   ├── utils/            # Helper utilities
│   └── server.js         # Entry point
├── wa_sessions/          # WhatsApp session storage
├── uploads/              # File uploads
├── .env.example          # Environment template
├── package.json          # Dependencies
└── README.md             # This file
```
