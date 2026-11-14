-- Tanya jawab per event ala Slido di /agenda/:slug/tanya.
--
-- - activities.qna_status: 'open' (bisa bertanya & vote), 'closed' (daftar tetap
--   tampil, tidak bisa bertanya/vote), 'off' (halaman tanya jawab tidak dipakai).
-- - activity_questions: satu pertanyaan, bisa anonim. Admin menandai terjawab,
--   menyorot satu pertanyaan yang sedang dibahas, atau menyembunyikannya.
-- - activity_question_votes: satu upvote per akun per pertanyaan.
-- - Pertanyaan dari form pendaftaran bisa diimpor admin (selalu anonim, karena
--   pendaftar menulisnya tanpa tahu akan tampil publik).
--
-- Semua orang bisa membaca daftar lewat activity_questions_list(); nama penanya
-- anonim tidak pernah ikut keluar, juga untuk admin (layar sering dibagikan saat
-- acara). Menulis lewat RPC; moderasi lewat RLS khusus admin.
-- Aman dijalankan ulang.

alter table public.activities
  add column if not exists qna_status text not null default 'open'
  check (qna_status in ('off', 'open', 'closed'));

create table if not exists public.activity_questions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(body) between 3 and 500),
  is_anonymous boolean not null default false,
  status text not null default 'open' check (status in ('open', 'answered', 'hidden')),
  -- Sedang dibahas; maksimal satu per event (dijaga trigger).
  is_highlighted boolean not null default false,
  -- Terisi kalau diimpor dari jawaban form pendaftaran.
  source_registration_id uuid unique references public.activity_registrations (id) on delete set null,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists activity_questions_activity_idx on public.activity_questions (activity_id, created_at);
create index if not exists activity_questions_user_idx on public.activity_questions (user_id);

create table if not exists public.activity_question_votes (
  question_id uuid not null references public.activity_questions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

create index if not exists activity_question_votes_user_idx on public.activity_question_votes (user_id);

alter table public.activity_questions enable row level security;
alter table public.activity_question_votes enable row level security;

-- Baca langsung: admin (editor) dan penanya untuk pertanyaannya sendiri.
-- Halaman publik memakai activity_questions_list().
drop policy if exists "Admins manage questions" on public.activity_questions;
create policy "Admins manage questions" on public.activity_questions
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Authors read own questions" on public.activity_questions;
create policy "Authors read own questions" on public.activity_questions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Penanya boleh menarik pertanyaannya selama belum dijawab.
drop policy if exists "Authors delete own open questions" on public.activity_questions;
create policy "Authors delete own open questions" on public.activity_questions
  for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'open');

drop policy if exists "Admins read votes" on public.activity_question_votes;
create policy "Admins read votes" on public.activity_question_votes
  for select to authenticated
  using ((select public.is_admin()));

grant select, update, delete on public.activity_questions to authenticated;
grant select on public.activity_question_votes to authenticated;

-- ---------------------------------------------------------------------------
-- Trigger: updated_at, answered_at, satu sorotan per event
-- ---------------------------------------------------------------------------

create or replace function public.activity_questions_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status = 'answered' and (tg_op = 'INSERT' or old.status <> 'answered') then
    new.answered_at := now();
  elsif new.status <> 'answered' then
    new.answered_at := null;
  end if;
  -- Yang sudah dijawab/disembunyikan tidak lagi disorot.
  if new.status <> 'open' then
    new.is_highlighted := false;
  end if;
  return new;
end;
$$;

drop trigger if exists activity_questions_before_write on public.activity_questions;
create trigger activity_questions_before_write
  before insert or update on public.activity_questions
  for each row execute function public.activity_questions_before_write();

create or replace function public.activity_questions_single_highlight()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.activity_questions
  set is_highlighted = false
  where activity_id = new.activity_id and id <> new.id and is_highlighted;
  return null;
end;
$$;

drop trigger if exists activity_questions_single_highlight on public.activity_questions;
create trigger activity_questions_single_highlight
  after insert or update of is_highlighted on public.activity_questions
  for each row when (new.is_highlighted)
  execute function public.activity_questions_single_highlight();

-- ---------------------------------------------------------------------------
-- Daftar pertanyaan (publik)
-- ---------------------------------------------------------------------------

create or replace function public.activity_questions_list(p_activity_id uuid)
returns table (
  id uuid,
  body text,
  status text,
  is_highlighted boolean,
  is_anonymous boolean,
  author_name text,
  author_handle text,
  author_avatar_url text,
  votes integer,
  voted boolean,
  is_mine boolean,
  created_at timestamptz,
  answered_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    q.id,
    q.body,
    q.status,
    q.is_highlighted,
    q.is_anonymous,
    case when not q.is_anonymous then nullif(p.full_name, '') end,
    -- Link profil hanya untuk profil yang memang publik (lihat public_profile()).
    case when not q.is_anonymous and p.onboarded_at is not null and p.full_name <> ''
      then coalesce(p.username, p.id::text) end,
    case when not q.is_anonymous then p.avatar_url end,
    (select count(*)::integer from public.activity_question_votes v where v.question_id = q.id),
    exists (select 1 from public.activity_question_votes v where v.question_id = q.id and v.user_id = auth.uid()),
    q.user_id is not null and q.user_id = auth.uid(),
    q.created_at,
    q.answered_at
  from public.activity_questions q
  join public.activities a on a.id = q.activity_id
  left join public.profiles p on p.id = q.user_id
  where q.activity_id = p_activity_id
    and (
      public.is_admin()
      or (a.is_public and a.qna_status <> 'off' and (q.status <> 'hidden' or q.user_id = auth.uid()))
    )
  order by q.created_at;
$$;

revoke all on function public.activity_questions_list(uuid) from public;
grant execute on function public.activity_questions_list(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bertanya & vote
-- ---------------------------------------------------------------------------

create or replace function public.ask_activity_question(p_activity_id uuid, p_body text, p_anonymous boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'login_required' using errcode = '28000';
  end if;

  perform 1 from public.activities
  where id = p_activity_id and is_public and qna_status = 'open';
  if not found then
    raise exception 'qna_closed' using errcode = 'P0001';
  end if;

  if char_length(v_body) < 3 or char_length(v_body) > 500 then
    raise exception 'invalid_question' using errcode = '22023';
  end if;

  -- Rem spam: maksimal 10 pertanyaan per akun per event, jeda 10 detik.
  if (select count(*) from public.activity_questions where activity_id = p_activity_id and user_id = v_uid) >= 10 then
    raise exception 'too_many_questions' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.activity_questions
    where user_id = v_uid and created_at > now() - interval '10 seconds'
  ) then
    raise exception 'too_fast' using errcode = 'P0001';
  end if;

  insert into public.activity_questions (activity_id, user_id, body, is_anonymous)
  values (p_activity_id, v_uid, v_body, coalesce(p_anonymous, false))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.ask_activity_question(uuid, text, boolean) from public;
grant execute on function public.ask_activity_question(uuid, text, boolean) to authenticated;

-- Tekan sekali = vote, tekan lagi = batal. Mengembalikan status vote terbaru.
create or replace function public.toggle_question_vote(p_question_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_question public.activity_questions%rowtype;
begin
  if v_uid is null then
    raise exception 'login_required' using errcode = '28000';
  end if;

  select q.* into v_question from public.activity_questions q
  join public.activities a on a.id = q.activity_id
  where q.id = p_question_id and q.status <> 'hidden' and a.is_public and a.qna_status = 'open';
  if not found then
    raise exception 'qna_closed' using errcode = 'P0001';
  end if;

  if v_question.user_id = v_uid then
    raise exception 'own_question' using errcode = 'P0001';
  end if;

  delete from public.activity_question_votes where question_id = p_question_id and user_id = v_uid;
  if found then
    return false;
  end if;
  insert into public.activity_question_votes (question_id, user_id) values (p_question_id, v_uid);
  return true;
end;
$$;

revoke all on function public.toggle_question_vote(uuid) from public;
grant execute on function public.toggle_question_vote(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Impor dari form pendaftaran (admin)
-- ---------------------------------------------------------------------------

-- Jawaban pertanyaan pendaftaran `p_field_id` dari pendaftar aktif jadi
-- pertanyaan anonim. Yang sudah pernah diimpor dilewati, jadi aman diulang.
create or replace function public.import_registration_questions(p_activity_id uuid, p_field_id text default 'pertanyaan')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;

  insert into public.activity_questions (activity_id, user_id, body, is_anonymous, source_registration_id, created_at)
  select r.activity_id, r.user_id, left(trim(r.answers ->> p_field_id), 500), true, r.id, r.created_at
  from public.activity_registrations r
  where r.activity_id = p_activity_id
    and r.status <> 'cancelled'
    and char_length(trim(coalesce(r.answers ->> p_field_id, ''))) >= 3
  on conflict (source_registration_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.import_registration_questions(uuid, text) from public;
grant execute on function public.import_registration_questions(uuid, text) to authenticated;
