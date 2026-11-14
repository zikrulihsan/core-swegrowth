import type { PublicQuestion, QnaStatus, QuestionStatus } from './database.types';
import { formatShortDate } from './format';
import { anonSupabase, supabase } from './supabase';

export type Question = PublicQuestion;
export type QuestionSort = 'popular' | 'recent';
export type QuestionTab = 'open' | 'answered' | 'hidden';

export const QNA_STATUS_LABEL: Record<QnaStatus, string> = {
  open: 'Terbuka',
  closed: 'Ditutup (hanya baca)',
  off: 'Tidak dipakai',
};

export const qnaPath = (a: { slug: string }) => `/agenda/${a.slug}/tanya`;
export const qnaScreenPath = (a: { slug: string }) => `/agenda/${a.slug}/tanya/layar`;

export const QUESTION_MAX = 500;

/**
 * Urutan daftar: populer = vote terbanyak (seri: yang lebih dulu masuk),
 * terbaru = paling baru di atas. Tab terjawab selalu dari yang terakhir dijawab.
 */
export function sortQuestions(list: Question[], sort: QuestionSort, tab: QuestionTab = 'open') {
  const time = (q: Question) => Date.parse(q.created_at);
  return [...list].sort((x, y) => {
    if (tab === 'answered') return Date.parse(y.answered_at ?? y.created_at) - Date.parse(x.answered_at ?? x.created_at);
    if (sort === 'recent') return time(y) - time(x);
    return y.votes - x.votes || time(x) - time(y);
  });
}

/** Kelompok per tab plus pertanyaan yang sedang disorot (kalau ada). */
export function groupQuestions(list: Question[]) {
  const by = (s: QuestionStatus) => list.filter((q) => q.status === s);
  return {
    highlighted: list.find((q) => q.is_highlighted && q.status === 'open') ?? null,
    open: by('open'),
    answered: by('answered'),
    hidden: by('hidden'),
  };
}

/**
 * Pertanyaan berikutnya untuk dibahas: vote terbanyak yang belum dijawab
 * (seri: yang lebih dulu masuk), selain yang sedang disorot.
 */
export function nextToPresent(list: Question[]) {
  return (
    sortQuestions(
      list.filter((q) => q.status === 'open' && !q.is_highlighted),
      'popular',
    )[0] ?? null
  );
}

export type Moderation = { status?: QuestionStatus; is_highlighted?: boolean };

/**
 * Perubahan moderasi diterapkan ke daftar lokal, sama seperti trigger di
 * database: sorotan hanya satu per event, dan yang dijawab/disembunyikan
 * tidak lagi disorot.
 */
export function applyModeration(list: Question[], id: string, change: Moderation, now = new Date()) {
  return list.map((q) => {
    if (q.id !== id) return change.is_highlighted ? { ...q, is_highlighted: false } : q;
    const next = { ...q, ...change };
    if (next.status !== 'open') next.is_highlighted = false;
    if (change.status) next.answered_at = change.status === 'answered' ? (q.answered_at ?? now.toISOString()) : null;
    return next;
  });
}

/** Vote dibalik di daftar lokal (optimistis). */
export const applyVote = (list: Question[], id: string) =>
  list.map((q) => (q.id === id ? { ...q, voted: !q.voted, votes: q.votes + (q.voted ? -1 : 1) } : q));

/** "baru saja", "5 menit lalu", "3 jam lalu", lalu tanggal. */
export function timeAgo(ts: string, now = new Date()) {
  const minutes = Math.floor((now.getTime() - Date.parse(ts)) / 60_000);
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} jam lalu`;
  return formatShortDate(ts);
}

/** Pesan untuk kode error dari RPC tanya jawab. */
export function qnaErrorMessage(message: string | undefined) {
  if (message?.includes('too_fast')) return 'Tunggu beberapa detik sebelum mengirim pertanyaan lagi.';
  if (message?.includes('too_many_questions')) return 'Kamu sudah mengirim 10 pertanyaan untuk acara ini.';
  if (message?.includes('invalid_question')) return `Pertanyaan minimal 3 dan maksimal ${QUESTION_MAX} karakter.`;
  if (message?.includes('qna_closed')) return 'Sesi tanya jawab sudah ditutup.';
  if (message?.includes('own_question')) return 'Pertanyaan sendiri tidak bisa di-vote.';
  if (message?.includes('login_required')) return 'Masuk dulu untuk bertanya atau vote.';
  return 'Belum berhasil. Coba lagi sebentar lagi.';
}

/** Sesi login dipakai kalau ada supaya vote & "pertanyaanmu" ikut terbaca. */
export async function fetchQuestions(activityId: string, withSession: boolean): Promise<Question[]> {
  const db = withSession ? supabase() : anonSupabase();
  if (!db) return [];
  const { data, error } = await db.rpc('activity_questions_list', { p_activity_id: activityId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export const askQuestion = (activityId: string, body: string, anonymous: boolean) =>
  supabase().rpc('ask_activity_question', { p_activity_id: activityId, p_body: body, p_anonymous: anonymous });

export const toggleVote = (questionId: string) => supabase().rpc('toggle_question_vote', { p_question_id: questionId });

/** Penanya menarik pertanyaannya (RLS: hanya yang belum dijawab), admin menghapus apa saja. */
export const deleteQuestion = (questionId: string) => supabase().from('activity_questions').delete().eq('id', questionId);

/** Moderasi admin (RLS khusus admin). */
export const moderateQuestion = (questionId: string, patch: Moderation) =>
  supabase().from('activity_questions').update(patch).eq('id', questionId);

export const setQnaStatus = (activityId: string, qna_status: QnaStatus) =>
  supabase().from('activities').update({ qna_status }).eq('id', activityId);

export const importRegistrationQuestions = (activityId: string, fieldId: string) =>
  supabase().rpc('import_registration_questions', { p_activity_id: activityId, p_field_id: fieldId });
