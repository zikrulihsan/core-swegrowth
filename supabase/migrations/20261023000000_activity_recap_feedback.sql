-- "Kegiatanku" di portal: rekap per kegiatan untuk peserta.
--
-- - activity_member_info.summary: ringkasan sesi (mis. tempelan Zoom AI
--   summary, boleh markdown), diisi admin di editor event.
-- - activity_recap(): ringkasan + link rekaman untuk peserta kegiatan itu
--   (pendaftaran yang tidak dibatalkan) dan admin. Rekaman khusus member tetap
--   hanya untuk verified member, sama seperti activity_links().
-- - activity_feedback: satu feedback (rating 1–5 + komentar) per peserta per
--   kegiatan, dikirim lewat submit_activity_feedback() setelah acara dimulai.
-- Aman dijalankan ulang.

alter table public.activity_member_info
  add column if not exists summary text check (char_length(summary) <= 20000);

-- ---------------------------------------------------------------------------
-- Rekap untuk peserta
-- ---------------------------------------------------------------------------

create or replace function public.activity_recap(p_activity_id uuid)
returns table (summary text, recording_url text, has_recording boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    nullif(trim(i.summary), ''),
    case when public.is_member() then i.recording_url end,
    i.recording_url is not null
  from public.activity_member_info i
  where i.activity_id = p_activity_id
    and (
      public.is_admin()
      or exists (
        select 1 from public.activity_registrations r
        where r.activity_id = p_activity_id and r.user_id = auth.uid() and r.status <> 'cancelled'
      )
    );
$$;

revoke all on function public.activity_recap(uuid) from public;
grant execute on function public.activity_recap(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Feedback
-- ---------------------------------------------------------------------------

create table if not exists public.activity_feedback (
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);

alter table public.activity_feedback enable row level security;

drop policy if exists "Members read own feedback" on public.activity_feedback;
create policy "Members read own feedback" on public.activity_feedback
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Admins read feedback" on public.activity_feedback;
create policy "Admins read feedback" on public.activity_feedback
  for select to authenticated
  using ((select public.is_admin()));

grant select on public.activity_feedback to authenticated;

-- Kirim atau ubah feedback: hanya peserta terkonfirmasi, setelah acara dimulai
-- (atau ditandai selesai). Event berulang: setelah sesi pertama.
create or replace function public.submit_activity_feedback(p_activity_id uuid, p_rating smallint, p_comment text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_activity public.activities%rowtype;
begin
  if v_uid is null then
    raise exception 'login_required' using errcode = '28000';
  end if;

  select * into v_activity from public.activities where id = p_activity_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.activity_registrations r
    where r.activity_id = p_activity_id and r.user_id = v_uid and r.status = 'confirmed'
  ) then
    raise exception 'not_participant' using errcode = '42501';
  end if;

  if v_activity.status <> 'completed' and (v_activity.starts_at is null or v_activity.starts_at > now()) then
    raise exception 'not_started' using errcode = 'P0001';
  end if;

  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'invalid_rating' using errcode = '22023';
  end if;

  insert into public.activity_feedback (activity_id, user_id, rating, comment)
  values (p_activity_id, v_uid, p_rating, left(trim(coalesce(p_comment, '')), 2000))
  on conflict (activity_id, user_id) do update
  set rating = excluded.rating, comment = excluded.comment, updated_at = now();
end;
$$;

revoke all on function public.submit_activity_feedback(uuid, smallint, text) from public;
grant execute on function public.submit_activity_feedback(uuid, smallint, text) to authenticated;
