# Alur Blast (Step-by-Step)

Dokumen ini menjelaskan alur blast dari create campaign sampai pesan terkirim, dan titik-titik yang sudah dicek/diperbaiki.

---

## 1. Create Campaign (POST /api/blast/campaigns)

| Step | Lokasi | Yang terjadi |
|------|--------|--------------|
| 1.1 | `blast.controller.js` → createCampaign | Validasi: name, template_id wajib. Cek WA connected (getWhatsAppStatus). |
| 1.2 | - | Validasi template (MessageTemplate, is_active). Validasi group_id kalau ada. |
| 1.3 | - | Ambil kontak: `Contact.findAll` dengan `wa_status: 'registered'`, optional filter `group_id`. |
| 1.4 | - | Jika 0 kontak → 400 "No eligible contacts found". |
| 1.5 | - | Buat `BlastCampaign` (status: `queued`). |
| 1.6 | - | Untuk tiap kontak: cek `BlastLog` apakah sudah `sent` hari ini (sent_at >= today). Jika sudah → buat log dengan status `skipped`, skip_reason `already_sent_today`; kalau tidak → status `pending`. |
| 1.7 | - | Simpan campaign (termasuk skipped_count). |
| 1.8 | - | **addToBlastQueue(campaign.id)** → job blast masuk antrian. |
| 1.9 | - | Response 201 + data campaign. |

**Catatan:** Tidak ada endpoint "Start" terpisah; create = langsung masuk queue.

**Opsi "Hanya kirim ke yg belum di blast" (only_not_blasted):** Jika dicentang, sebelum buat log hanya kontak yang belum punya satupun BlastLog `status = 'sent'` yang dipakai; yang sudah pernah dapat blast tidak masuk campaign. Berguna untuk blast per grup agar terpantau (misal setelah bypass campaign besar, buat campaign per grup dengan opsi ini).

---

## 2. Queue (In-Memory)

| Step | Lokasi | Yang terjadi |
|------|--------|--------------|
| 2.1 | `queue.service.js` → createInMemoryQueue('blast', processBlast, { delayBetweenJobsMs }) | Satu job = satu campaignId. |
| 2.2 | - | Processor: `processBlast(campaignId)` dipanggil saat giliran job. **Hanya satu campaign yang jalan pada satu waktu** (antrian sequential). |
| 2.3 | - | Antar job blast: delay **DELAY_BETWEEN_CAMPAIGNS_SECONDS** (default 30s). Antar job validation: 500ms. |

---

## 3. Process Blast (processBlast)

| Step | Lokasi | Yang terjadi |
|------|--------|--------------|
| 3.1 | queue.service.js | BlastCampaign.findByPk + template + group. Campaign tidak ada → throw. |
| 3.2 | - | campaign.update({ status: 'running', started_at }). activeCampaigns.set(campaignId, { paused: false, stopped: false }). |
| 3.3 | - | BlastLog.findAll({ campaign_id, status: 'pending' }, order id ASC). |
| 3.4 | **Per log (for loop):** | |

### 3.4.a Cek jam kirim & session & limit

| Step | Yang terjadi |
|------|--------------|
| A0 | **Jam kirim:** Jika SEND_HOUR_START / SEND_HOUR_END diset dan waktu server di luar rentang → campaign status `paused`, error "Jam kirim hanya XX:00-YY:00. Silakan resume besok.", return (supaya besok resume dan counter harian ikut reset). |
| A1 | WhatsAppSession.findAll({ status: 'connected', is_active: true }). |
| A2 | sessionCount = 0 → campaign status `paused`, error_message "No WhatsApp sessions connected", break. |
| A3 | perSessionLimit = limitPerAccount ? totalLimit : floor(totalLimit / sessionCount). |
| A4 | Cek campaignState.stopped → break. |
| A5 | while (campaignState?.paused) { sleep 5s; re-get state; if stopped break }. |
| A6 | **Setelah keluar dari pause:** cek lagi stopped → kalau stopped, break (agar tidak lanjut kirim). |
| A7 | Refresh counter harian tiap session (checkAndResetDailyCounter + save). |
| A8 | eligibleSessions = session yang messages_sent_today < perSessionLimit. |
| A9 | eligibleSessions.length === 0 → campaign status `paused`, error batas harian, break. |

### 3.4.b Kontak & kirim

| Step | Yang terjadi |
|------|--------------|
| B1 | Contact.findByPk(log.contact_id). Tidak ada / wa_status !== 'registered' → log status `skipped`, campaign.skipped_count++, continue. |
| B2 | Isi template: replace {{nama}}, {{no_hp}}, {{group}}. addMessageVariation(message). |
| B3 | JID = contact.wa_jid || phoneToJid(contact.phone_normalized). |
| B4 | Pilih session: eligibleSessions.sort(by messages_sent_today ASC), ambil session[0]. |
| B5 | sendMessageWithSession(session.session_id, jid, message). |
| B6 | log.update(sent, message_content, wa_message_id, sent_at, sent_via). campaign.sent_count++. template.increment('usage_count'). |
| B7 | session.messages_sent_today++; session.last_message_date = today; session.save(). |
| B8 | consecutiveErrors = 0. Emit log & campaign. |
| B9 | **On error:** log status `failed`, campaign.failed_count++, consecutiveErrors++. Jika consecutiveErrors >= 5 → campaign status `paused`, break. |
| B10 | getBlastDelay(campaign.interval_minutes) → delay (min 1 menit). sleep(delay). |

### 3.5 Selesai loop

| Step | Yang terjadi |
|------|--------------|
| 3.5.1 | remainingPending = BlastLog.count({ campaign_id, status: 'pending' }). |
| 3.5.2 | Jika remainingPending === 0 dan status masih 'running' → campaign status `completed`, completed_at. |
| 3.5.3 | activeCampaigns.delete(campaignId). |

---

## 4. Pause / Resume / Stop

| Aksi | Endpoint | Yang terjadi |
|------|----------|--------------|
| Pause | POST campaigns/:id/pause | pauseBlastQueue(id) → state.paused = true. campaign.update(status: 'paused'). Loop processBlast akan masuk while(paused) dan menunggu. |
| Resume | POST campaigns/:id/resume | Cek ada WhatsApp session connected. resumeBlastQueue(id): kalau state ada → state.paused = false; kalau tidak (mis. sudah keluar dari processBlast) → addToBlastQueue(id) lagi. campaign.update(status: 'running'). |
| Stop | POST campaigns/:id/stop | stopBlastQueue(id) → state.stopped = true. BlastLog.update(pending → skipped, campaign_stopped). campaign.update(status: 'stopped', completed_at). processBlast akan break di iterasi berikutnya (atau setelah keluar dari while pause). |

---

## 5. Perbaikan yang dilakukan

1. **getProcessStatus:** Order pending logs pakai `id` ASC (bukan `scheduled_at` yang tidak ada di BlastLog).
2. **Setelah keluar dari loop pause:** Tambah pengecekan `activeCampaigns.get(campaignId)?.stopped` dan break agar tidak lanjut kirim satu pesan lagi setelah user klik Stop saat campaign paused.

---

## 6. Ringkasan alur singkat

```
POST /api/blast/campaigns
  → validasi + ambil kontak registered
  → buat BlastCampaign + BlastLog (pending/skipped)
  → addToBlastQueue(campaign.id)

Queue memanggil processBlast(campaignId)
  → status running, ambil pending logs
  → untuk tiap log:
      → cek session connected & batas per akun
      → cek pause/stop
      → pilih session paling sedikit kirim
      → kirim via sendMessageWithSession
      → update log + campaign + session counter
      → delay (interval + random, min 1 menit)
  → jika tidak ada pending lagi → status completed
  → hapus dari activeCampaigns
```

Pause = tunggu di dalam loop. Resume = lanjut loop atau re-queue. Stop = set stopped + break + update pending jadi skipped.

---

## 7. Multi Campaign (Beberapa Campaign Jalan)

### Cara kerja

- **Antrian satu worker:** Hanya **satu** campaign yang diproses pada satu waktu. Campaign berikutnya menunggu di queue sampai campaign saat ini selesai (atau pause/stop).
- **Urutan:** Sesuai urutan create (FIFO). Campaign A jalan dulu, selesai/pause → jeda 30s (default) → Campaign B jalan.
- **Batas kirim tetap berlaku:** Counter `messages_sent_today` disimpan **per session** di DB dan dipakai **bersama semua campaign**. Jadi batas 100/hari per akun (atau total dibagi) tetap dijaga meski ada banyak campaign; total kirim semua campaign tetap tidak melebihi limit per akun.

### Aturan max kirim

| Kondisi | Perilaku |
|--------|----------|
| LIMIT_PER_ACCOUNT=true (default) | Tiap akun WA max 100/hari. Campaign A + B + … bersama-sama tidak boleh melebihi 100 per akun. |
| LIMIT_PER_ACCOUNT=false | Total semua akun 100/hari dibagi rata. Sama: dipakai bersama semua campaign. |
| Campaign 1 pause karena limit | Campaign 1 keluar dari loop (status paused). Setelah jeda 30s, Campaign 2 mulai; ia baca counter terbaru dari DB jadi limit tetap dihormati. |

### Rekomendasi (anti-ban)

- **Multi campaign aman secara teknis:** Sequential + limit global per akun, jadi tidak double-count dan tidak melampaui batas.
- **Tetap disarankan:**  
  - Jangan buat terlalu banyak campaign sekaligus kalau total kontak sangat besar; tetap perhatikan batas harian per akun.  
  - Pakai **DELAY_BETWEEN_CAMPAIGNS_SECONDS** (default 30) agar ada jeda antara campaign terakhir selesai dan campaign berikutnya mulai; bisa dinaikkan (mis. 60) kalau ingin lebih aman.  
  - Secara risiko ban, yang penting total kirim per akun per hari dan pola delay (interval + random) per pesan; multi campaign sequential tidak menambah risiko selama limit dan delay dipatuhi.
