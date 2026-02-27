# Migrasi Database

Jalankan file SQL di sini secara manual (phpMyAdmin, MySQL client, atau `mysql -u user -p nama_db < file.sql`) bila perlu.

## add_only_not_blasted_to_blast_campaigns.sql

- **Kolom:** `blast_campaigns.only_not_blasted` (TINYINT 0/1, default 0).
- **Campaign existing:** Semua row lama dapat `only_not_blasted = 0` (false), jadi perilaku tetap sama. Tidak ada data yang berubah.
- Setelah dijalankan, form "Buat Blast Baru" bisa pakai opsi "Hanya kirim ke yg belum di blast"; campaign baru yang pakai opsi itu akan simpan `only_not_blasted = 1`.

**Contoh jalankan:**
```bash
mysql -u root -p nama_database < migrations/add_only_not_blasted_to_blast_campaigns.sql
```

Script aman dijalankan lebih dari sekali (cek kolom dulu, hanya tambah bila belum ada).
