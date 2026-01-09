# WhatsApp Blast Application

Aplikasi WhatsApp Blast berbasis WhatsApp Web (unofficial) dengan fokus pada keamanan akun (anti-ban), struktur modular, dan kemudahan penggunaan.

## 🚀 Fitur

### 1. Authentication (Login Admin)
- Halaman login admin dengan email/password
- JWT token authentication
- Session management
- Middleware proteksi route

### 2. Dashboard
- Status WhatsApp (Connected/Disconnected)
- Total kontak, grup, dan template
- Statistik blast (Terkirim, Gagal, Skip)
- Aktivitas terbaru realtime

### 3. WhatsApp Login
- Scan QR Code menggunakan WhatsApp Web
- Auto reconnect jika koneksi terputus
- Tombol Scan QR, Disconnect, dan Refresh session
- Status realtime via Socket.io

### 4. Kontak Management
- Tambah kontak manual
- Import kontak dari Excel (.xlsx)
- Filter berdasarkan grup dan status WA
- Pencarian kontak

### 5. Validasi Nomor WhatsApp (Anti-Ban)
- Normalisasi nomor ke format internasional (628xxx)
- Cek registrasi WhatsApp via Baileys
- Validasi bertahap (queue) untuk menghindari ban
- Status: registered / not_registered / unknown

### 6. Grup Kontak
- CRUD grup kontak
- Warna custom untuk setiap grup
- Pengelompokan kontak

### 7. Template Message
- CRUD template pesan
- Support variable: `{{nama}}`, `{{no_hp}}`, `{{group}}`
- Preview template

### 8. Blast Message System
- Pilih template dan grup target
- Interval kirim: 5/10/15 menit
- Random delay tambahan (30-90 detik)
- Progress realtime
- Pause/Stop/Resume campaign

### 9. Anti-Ban Strategy
- Maksimal 100 pesan/hari (configurable)
- Random delay antar pesan
- Variasi pesan kecil (spasi/emoji)
- Skip nomor tidak terdaftar
- Skip nomor sudah dikirimi hari ini
- Stop otomatis jika banyak error beruntun
- Stop otomatis jika WhatsApp disconnect

## 📋 Requirements

- Node.js >= 18
- MySQL
- Redis (opsional, untuk queue yang lebih robust)

## 🛠️ Installation

### 1. Clone Repository

```bash
cd c:\laragon\www\Blast-WA
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Database

Buat database MySQL:

```sql
CREATE DATABASE blast_wa;
```

### 4. Configure Environment

Copy `.env.example` ke `.env` dan sesuaikan konfigurasi:

```env
# Server
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=blast_wa
DB_USER=root
DB_PASSWORD=

# JWT
JWT_SECRET=your-secret-key-change-this

# Redis (optional)
REDIS_HOST=localhost
REDIS_PORT=6379

# WhatsApp Settings
MAX_MESSAGES_PER_DAY=100
MIN_DELAY_SECONDS=300
MAX_DELAY_SECONDS=900
```

### 5. Run Application

```bash
# Development mode
npm run dev

# Production mode
npm start
```

### 6. Access Dashboard

Buka browser: `http://localhost:3000`

Default login:
- Email: `admin@blasta.com`
- Password: `admin123`

## 📁 Project Structure

```
Blast-WA/
├── public/                 # Frontend files
│   ├── index.html         # Main HTML
│   └── js/
│       └── app.js         # Frontend JavaScript
├── src/
│   ├── config/            # Configuration
│   │   ├── index.js       # Main config
│   │   └── database.js    # Database connection
│   ├── controllers/       # Route controllers
│   │   ├── auth.controller.js
│   │   ├── dashboard.controller.js
│   │   ├── contact.controller.js
│   │   ├── contactGroup.controller.js
│   │   ├── template.controller.js
│   │   ├── blast.controller.js
│   │   └── whatsapp.controller.js
│   ├── middleware/        # Express middleware
│   │   ├── auth.middleware.js
│   │   └── upload.middleware.js
│   ├── models/            # Sequelize models
│   │   ├── User.js
│   │   ├── Contact.js
│   │   ├── ContactGroup.js
│   │   ├── MessageTemplate.js
│   │   ├── BlastCampaign.js
│   │   ├── BlastLog.js
│   │   └── WhatsAppSession.js
│   ├── routes/            # API routes
│   │   ├── auth.routes.js
│   │   ├── dashboard.routes.js
│   │   ├── contact.routes.js
│   │   ├── contactGroup.routes.js
│   │   ├── template.routes.js
│   │   ├── blast.routes.js
│   │   └── whatsapp.routes.js
│   ├── services/          # Business logic
│   │   ├── whatsapp.service.js
│   │   └── queue.service.js
│   ├── seeders/           # Database seeders
│   │   └── admin.seeder.js
│   ├── utils/             # Utility functions
│   │   ├── phone.util.js
│   │   └── delay.util.js
│   └── server.js          # Main server file
├── uploads/               # Uploaded files
├── wa_sessions/           # WhatsApp session files
├── .env                   # Environment variables
├── .env.example           # Example environment
├── package.json           # Dependencies
└── README.md              # Documentation
```

## 📊 API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `GET /api/auth/profile` - Get profile
- `PUT /api/auth/password` - Update password
- `POST /api/auth/logout` - Logout

### Dashboard
- `GET /api/dashboard/stats` - Get statistics

### WhatsApp
- `GET /api/whatsapp/status` - Get WA status
- `POST /api/whatsapp/scan` - Start QR scan
- `POST /api/whatsapp/disconnect` - Disconnect
- `POST /api/whatsapp/refresh` - Refresh session

### Contacts
- `GET /api/contacts` - List contacts
- `GET /api/contacts/:id` - Get contact
- `POST /api/contacts` - Create contact
- `PUT /api/contacts/:id` - Update contact
- `DELETE /api/contacts/:id` - Delete contact
- `POST /api/contacts/import` - Import from Excel
- `POST /api/contacts/:id/validate` - Validate single
- `POST /api/contacts/validate-all` - Validate all

### Groups
- `GET /api/groups` - List groups
- `GET /api/groups/:id` - Get group
- `POST /api/groups` - Create group
- `PUT /api/groups/:id` - Update group
- `DELETE /api/groups/:id` - Delete group

### Templates
- `GET /api/templates` - List templates
- `GET /api/templates/:id` - Get template
- `POST /api/templates` - Create template
- `PUT /api/templates/:id` - Update template
- `DELETE /api/templates/:id` - Delete template
- `POST /api/templates/preview` - Preview template

### Blast
- `GET /api/blast/campaigns` - List campaigns
- `GET /api/blast/campaigns/:id` - Get campaign
- `GET /api/blast/campaigns/:id/logs` - Get campaign logs
- `POST /api/blast/campaigns` - Create & start campaign
- `POST /api/blast/campaigns/:id/pause` - Pause
- `POST /api/blast/campaigns/:id/resume` - Resume
- `POST /api/blast/campaigns/:id/stop` - Stop
- `DELETE /api/blast/campaigns/:id` - Delete

## 📝 Format Excel Import

File Excel harus memiliki kolom:
- `nama` - Nama kontak (wajib)
- `no_hp` - Nomor HP (wajib)
- `group` - Nama grup (opsional)

Contoh:
| nama | no_hp | group |
|------|-------|-------|
| John Doe | 081234567890 | Pelanggan |
| Jane Doe | 082345678901 | Reseller |

## ⚠️ Peringatan Anti-Ban

Sistem ini sudah dilengkapi fitur anti-ban:

1. **Limit harian**: Max 100 pesan/hari (bisa diatur)
2. **Delay**: 5-15 menit antar pesan + random 30-90 detik
3. **Validasi**: Hanya kirim ke nomor terdaftar WA
4. **Skip duplicate**: Tidak kirim ke nomor yang sudah dikirimi hari ini
5. **Auto stop**: Berhenti jika banyak error beruntun
6. **Variasi pesan**: Sedikit variasi untuk menghindari deteksi spam

**PENTING**: Meskipun sudah ada fitur anti-ban, penggunaan blast WhatsApp tetap berisiko. Gunakan dengan bijak dan sesuai kebijakan WhatsApp.

## 🔧 Troubleshooting

### WhatsApp Tidak Connect
1. Pastikan tidak ada session lain yang aktif
2. Coba Disconnect dan Scan QR ulang
3. Periksa koneksi internet

### Import Excel Error
1. Pastikan format kolom sesuai (nama, no_hp, group)
2. Pastikan file berformat .xlsx atau .csv
3. Ukuran file max 10MB

### Queue Tidak Berjalan
1. Pastikan Redis terinstall (opsional)
2. Jika tanpa Redis, sistem akan menggunakan in-memory queue
3. Restart aplikasi jika diperlukan

## 📄 License

MIT License - Gunakan dengan bijak dan bertanggung jawab.

## 🤝 Support

Untuk pertanyaan dan bantuan, silakan buat issue di repository ini
