-- Rekaman publik dari channel YouTube SWE Growth, diputar langsung di halaman
-- event dan ditandai di daftar kegiatan lalu. Beda dengan
-- activity_member_info.recording_url yang khusus member. Aman dijalankan ulang.

alter table public.activities
  add column if not exists youtube_url text
  check (youtube_url ~ '^https://(www\.|m\.)?(youtube\.com|youtu\.be)/.+');
