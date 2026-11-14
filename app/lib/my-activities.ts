import { isActivityPast, upcomingSessions, type Activity } from './activities';
import type { RegistrationStatus } from './database.types';
import { supabase } from './supabase';

/** Halaman satu kegiatan di portal (rekap: ringkasan, rekaman, feedback). */
export const myActivityPath = (a: Pick<Activity, 'slug'>) => `/portal/kegiatan/${a.slug}`;
export const MY_ACTIVITIES_PATH = '/portal/kegiatan';

export type MyActivity = { activity: Activity; status: RegistrationStatus };

/**
 * Kegiatan yang didaftar akun ini (tidak dibatalkan), dibagi akan datang
 * (urut tanggal, event berulang pakai sesi berikutnya) dan sudah lewat
 * (terbaru dulu).
 */
export function splitMyActivities(activities: Activity[], regs: { activity_id: string; status: RegistrationStatus }[], now = new Date()) {
  const status = new Map(regs.filter((r) => r.status !== 'cancelled').map((r) => [r.activity_id, r.status]));
  const mine = activities.filter((a) => status.has(a.id));
  const tag = (a: Activity): MyActivity => ({ activity: a, status: status.get(a.id)! });
  return {
    upcoming: upcomingSessions(mine, { now, undatedLast: true }).map(tag),
    past: mine
      .filter((a) => isActivityPast(a, now))
      .sort((x, y) => (y.starts_at ?? '').localeCompare(x.starts_at ?? ''))
      .map(tag),
  };
}

/** Feedback dibuka setelah acara dimulai (event berulang: sesi pertama) atau ditandai selesai. */
export const feedbackOpen = (a: Pick<Activity, 'status' | 'starts_at'>, now = new Date()) =>
  a.status === 'completed' || Boolean(a.starts_at && Date.parse(a.starts_at) <= now.getTime());

export const RATING_LABEL = ['', 'Kurang', 'Cukup', 'Bagus', 'Bagus sekali', 'Luar biasa'] as const;

/** Ringkasan & rekaman khusus member; kosong kalau bukan peserta atau belum diisi admin. */
export async function fetchRecap(activityId: string) {
  const { data } = await supabase().rpc('activity_recap', { p_activity_id: activityId }).maybeSingle();
  return data;
}

export async function fetchMyFeedback(activityId: string, userId: string) {
  const { data } = await supabase().from('activity_feedback').select('*').eq('activity_id', activityId).eq('user_id', userId).maybeSingle();
  return data;
}

/** Id kegiatan yang sudah diberi feedback oleh akun ini. */
export async function fetchMyFeedbackIds(userId: string) {
  const { data } = await supabase().from('activity_feedback').select('activity_id').eq('user_id', userId);
  return (data ?? []).map((f) => f.activity_id);
}

export const submitFeedback = (activityId: string, rating: number, comment: string) =>
  supabase().rpc('submit_activity_feedback', { p_activity_id: activityId, p_rating: rating, p_comment: comment });

export function feedbackErrorMessage(message: string | undefined) {
  if (message?.includes('not_started')) return 'Feedback dibuka setelah acara dimulai.';
  if (message?.includes('not_participant')) return 'Feedback hanya untuk peserta terkonfirmasi kegiatan ini.';
  if (message?.includes('invalid_rating')) return 'Pilih nilai 1 sampai 5.';
  return 'Feedback belum terkirim. Coba lagi sebentar lagi.';
}
