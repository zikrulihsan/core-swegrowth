# SWE Growth — Portal Member

[![CI](https://github.com/zikrulihsan/core-swegrowth/actions/workflows/ci.yml/badge.svg)](https://github.com/zikrulihsan/core-swegrowth/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Kode sumber [swegrowth.id](https://swegrowth.id), portal komunitas software engineer Indonesia: agenda kegiatan,
pendaftaran event, profil member, dan rekomendasi. Mau ikut berkontribusi? Baca [CONTRIBUTING.md](CONTRIBUTING.md).

Stack: **React 19 + React Router (framework mode di atas Vite)**, Supabase (Postgres + Auth + RLS), deploy di Netlify.

Prinsip isi: tidak ada data contoh atau angka karangan. Bagian yang datanya kosong tidak ditampilkan.

## Halaman

| URL | Akses | Isi |
| --- | --- | --- |
| `/` | publik | Penjelasan singkat, komunitas WA (gratis) vs portal member, agenda terdekat |
| `/tentang` | publik | Cerita & tujuan SWE Growth (dulu di halaman goakal) |
| `/agenda` | publik | Daftar kegiatan komunitas mendatang (filter per subgrup `?oleh=slug`) + dokumentasi foto kegiatan |
| `/agenda/:slug` | publik | Detail kegiatan (link yang dibagikan): biaya (Gratis/harga), jadwal, tombol Daftar |
| `/agenda/:slug/daftar` | login | Form pendaftaran: data peserta dari profil + pertanyaan khusus event + setuju CoC |
| `/agenda/:slug/terdaftar` | login (peserta) | Konfirmasi: kode pendaftaran, kalender, link meeting (terbuka 1 jam sebelum acara), batal |
| `/onboarding` | login | Kenalan (motivasi) → isi profil → link grup WhatsApp |
| `/code-of-conduct` | publik | Aturan komunitas |
| `/privasi` | publik | Kebijakan privasi (dipakai juga di OAuth consent Google). Perbarui saat ada data/layanan baru |
| `/term-of-service` | publik | Syarat layanan |
| `/member/:handle` | publik | Profil publik member (username atau id) + "Member sejak". Tanpa WA, email, dan jawaban kenalan |
| `/masuk` | publik | Login Google (satu-satunya metode login) |
| `/menunggu` | login | Status membership: cara bayar & kabari admin |
| `/portal` | member aktif | Kegiatan yang diikuti, agenda, grup WhatsApp member |
| `/portal/profil` | login | Profil member + link profil publik untuk dibagikan |
| `/portal/membership` | login | Membership & verified member: **segera hadir** (`MEMBERSHIP_LIVE` di `app/lib/site.ts`) |
| `/portal/profil/edit` | login | Form profil member |
| `/admin` | admin | Data member (cari + unduh CSV), aktivasi membership, event, subgrup penyelenggara, grup WhatsApp |
| `/admin/member/:id` | admin | Profil lengkap satu member + kegiatan yang diikuti |
| `/admin/event/:id` | admin | Editor event (urutan = halaman publik): info + subgrup penyelenggara, pembicara (opsional) + foto LinkedIn, jadwal (bisa berulang), detail, pendaftaran, langkah setelah daftar, foto dokumentasi; statistik & pendaftar (CSV). `/admin/event/baru` untuk event baru |

Halaman publik di-prerender saat build; sisanya SPA lewat `__spa-fallback.html` (lihat `netlify.toml`). URL lama
(`/events`, `/blog`, `/jobs`, `/videos`, `/mentorship`, `/courses`, `/dashboard`, `/u/*`) diarahkan 301.

Tidak ada server dan tidak ada secret key di aplikasi. Hak akses dijaga di database: RLS + fungsi `is_admin()`,
`is_member()`, `is_curator()` di `supabase/migrations/`. Link meeting, rekaman, dan grup WhatsApp hanya terbaca oleh
member aktif.

## Menjalankan lokal

Butuh Node ≥ 22.22 (lihat `.nvmrc`).

```bash
cp .env.example .env   # isi VITE_SUPABASE_URL & VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev        # http://localhost:4321
npm run typecheck
npm run build      # output ke build/client
```

## Setup Supabase

1. Jalankan migration di `supabase/migrations/` **berurutan sesuai nama file** (SQL editor atau `supabase db push`).
   Semuanya aman dijalankan ulang.
2. **Auth → Providers**: hanya **Google** yang aktif (matikan Email), sign-up diizinkan. Opsi *Skip nonce checks* harus mati.
3. **Auth → URL Configuration**: Site URL `https://swegrowth.id`; Redirect URLs `https://swegrowth.id/auth/callback`
   dan `http://localhost:4321/auth/callback`.
4. **Admin**: tambahkan email ke tabel `activity_admin_emails`.
5. **Foto dokumentasi**: migration `20261020000000_community_events.sql` membuat bucket Storage publik `event-photos`
   (hanya admin yang bisa mengunggah, maks. 5 MB per foto; editor memperkecil foto sebelum diunggah).
6. **Rekaman YouTube**: migration `20261021000000_youtube_recording.sql` menambah kolom `activities.youtube_url`.
   Admin menempel link video di bagian Dokumentasi; rekaman tampil di galeri `/rekaman` dan beranda, diputar di halaman
   event, dan ditandai di Kegiatan lalu. Arsip lama (`app/lib/past-activities.ts`) ikut tampil kalau diberi `youtube`.

### Event komunitas

Semua event adalah kegiatan komunitas SWE Growth. Penyelenggaranya bisa **subgrup** (English Club, Fundamental, …)
yang dikelola di `/admin` → **Subgrup**; event tanpa subgrup tampil sebagai kegiatan SWE Growth. Pembicara opsional.

**Event berulang** (setiap minggu, dua minggu sekali, atau setiap bulan, opsional sampai tanggal tertentu): jadwal di
editor adalah sesi pertama. Agenda dan halaman event selalu menampilkan sesi berikutnya, satu pendaftaran berlaku untuk
seluruh sesi, dan event Google Calendar dibuat dengan pola ulang yang sama.

### Login Google tanpa domain supabase.co

`/masuk` dan tombol daftar di halaman event redirect langsung ke Google (OpenID Connect, `response_type=id_token`)
lalu kembali ke `/auth/google`, yang meneruskan ID token ke Supabase lewat `signInWithIdToken`. Jadi layar
dan email notifikasi Google menyebut `swegrowth.id`, bukan `<project-ref>.supabase.co`. Session tetap dari Supabase.

1. Google Cloud Console → *Credentials* → OAuth client (Web) yang dipakai provider Google di Supabase →
   **Authorized redirect URIs**: `https://swegrowth.id/auth/google` dan `http://localhost:4321/auth/google`.
   (Sengaja tanpa popup Google Identity Services: di Chrome mobile popup-nya sering tidak kembali ke halaman.)
2. Isi client ID itu ke env `VITE_GOOGLE_CLIENT_ID` (Netlify + `.env`), lalu deploy ulang.
3. Opsional: *OAuth consent screen → Branding* (nama, logo, homepage, `/privasi`, `/term-of-service`, authorized
   domain `swegrowth.id`) lalu ajukan verifikasi, supaya Google menampilkan nama "SWE Growth".

Tanpa client ID, tombolnya jatuh ke redirect OAuth Supabase (`/auth/callback`),
jadi redirect URL di langkah 3 di atas tetap diperlukan.

`app/lib/database.types.ts` ditulis tangan mengikuti migration; perbarui saat skema berubah.

## Google Calendar (undangan otomatis)

Peserta terkonfirmasi otomatis jadi **tamu** event di Google Calendar akun Gmail SWE Growth. Google yang mengirim
undangan, perubahan jadwal, dan pembatalan. Tamu tidak bisa melihat tamu lain. Sinkron dijalankan edge function
`supabase/functions/calendar-sync` setelah peserta daftar/batal dan setelah admin menyimpan event (tombol
**Sinkronkan sekarang** di editor event untuk sinkron ulang / mengundang peserta lama). Sebelum langkah di bawah
selesai, fungsi ini membalas `not_configured` dan pendaftaran tetap jalan normal.

1. **Google Cloud Console** → buat project → *APIs & Services → Library* → aktifkan **Google Calendar API**.
2. *OAuth consent screen* → **External**, isi nama app & email → tambahkan scope
   `https://www.googleapis.com/auth/calendar.events` → **Publish app** (status *In production*). Kalau dibiarkan
   *Testing*, refresh token kedaluwarsa setelah 7 hari. Peringatan "app belum diverifikasi" saat login aman dilewati
   karena hanya akun SWE Growth yang memberi izin.
3. *Credentials → Create credentials → OAuth client ID* → **Web application**, Authorized redirect URI:
   `https://developers.google.com/oauthplayground`.
4. Buka [OAuth Playground](https://developers.google.com/oauthplayground) → ikon ⚙️ → centang *Use your own OAuth
   credentials* → isi client ID & secret → di kolom scope ketik `https://www.googleapis.com/auth/calendar.events` →
   **Authorize APIs** → login dengan **Gmail SWE Growth** → **Exchange authorization code for tokens** → salin
   *Refresh token*.
5. Simpan sebagai secret Supabase dan deploy fungsinya:

   ```bash
   supabase secrets set --project-ref <ref> \
     GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… GOOGLE_REFRESH_TOKEN=…
   supabase functions deploy calendar-sync --no-verify-jwt --project-ref <ref>
   ```

   Opsional: `GOOGLE_CALENDAR_ID` (default kalender utama) dan `SITE_URL` (default `https://swegrowth.id`).
6. Jalankan migration `20261014000000_google_calendar.sql`, lalu coba dulu di event tes: daftar dengan email kedua,
   cek undangan masuk, ubah jam di editor, cek email perubahan, lalu batal daftar.

## Asisten tulis Gemini (detail acara & caption)

Di editor event, bagian **Detail acara** punya tombol **✨ Isi detail acara** (mengisi ringkasan, poin "yang akan
dibahas", dan deskripsi) dan **✨ Buat caption** (Instagram, LinkedIn, atau WhatsApp/Telegram, 2 variasi). Keduanya
memakai isi form saat ini plus catatan opsional dari admin, lewat Netlify edge function
`netlify/edge-functions/event-writer.ts` (`/api/event-writer`). API key Gemini hanya ada di server, dan fungsi ini
menolak siapa pun yang bukan admin (`is_admin()`).

Setup: buat API key di [Google AI Studio](https://aistudio.google.com/apikey), lalu di Netlify → *Site configuration →
Environment variables* tambahkan `GEMINI_API_KEY` (opsional `GEMINI_MODEL`, default `gemini-2.5-flash`) dan deploy
ulang. Saat `npm run dev` biasa endpoint ini tidak ada; pakai `netlify dev` untuk mencobanya secara lokal.

## Konfigurasi di `app/lib/site.ts`

- `SITE_URL`, `SITE_NAME` — domain dan nama situs (dipakai untuk URL absolut dan meta).
- `MEMBERSHIP_LIVE` — `false` selama membership berbayar belum dibuka.
- `COMMUNITY_CHANNELS` — link WhatsApp/Telegram/Discord komunitas yang tampil setelah onboarding dan di portal.
- `MEMBER_BENEFITS` — daftar benefit verified member. Hanya tulis yang sudah benar-benar tersedia.
- `ADMIN_WA` — nomor WhatsApp admin untuk tombol kontak.

Kalau kamu menjalankan fork untuk komunitasmu sendiri, ganti semua nilai di atas plus logo di `public/assets/`.

## Deploy

Netlify membaca `netlify.toml`: `npm run build`, publish `build/client`, Node 22. Set `VITE_SUPABASE_URL` dan
`VITE_SUPABASE_PUBLISHABLE_KEY` di environment Netlify. Agenda di halaman publik ikut diperbarui di browser, jadi
event baru tampil tanpa deploy ulang.

## Kontribusi

Issue dan pull request terbuka untuk siapa saja. Baca [CONTRIBUTING.md](CONTRIBUTING.md) dan
[Kode Etik](CODE_OF_CONDUCT.md). Celah keamanan dilaporkan secara privat, lihat [SECURITY.md](SECURITY.md).

## Lisensi

Kode di repo ini dirilis di bawah [lisensi MIT](LICENSE). Nama dan logo SWE Growth, serta konten komunitas (teks
halaman, foto, data member) tidak termasuk lisensi tersebut; fork untuk komunitas lain diharapkan memakai nama dan
logonya sendiri.
