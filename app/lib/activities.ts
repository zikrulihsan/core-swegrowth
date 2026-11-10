import type { ActivityRow, ActivityStatus, CommunityGroupRow, Recurrence, RegistrationStatus } from './database.types';
import { formatDate, formatWibTime, isoDate, isUpcoming } from './format';
import { anonSupabase, hasSupabase, supabase } from './supabase';

export type Activity = ActivityRow;

export const activityStatusLabel: Record<ActivityStatus, string> = {
  coming_soon: 'coming soon',
  scheduled: 'segera dibuka',
  registration_open: 'pendaftaran dibuka',
  full: 'waitlist tersedia',
  completed: 'selesai',
  cancelled: 'dibatalkan',
};

export const ACTIVITY_STATUSES = Object.keys(activityStatusLabel) as ActivityStatus[];

const isDone = (a: Activity) => a.status === 'completed' || a.status === 'cancelled';

/**
 * Belum selesai: dilihat dari ends_at kalau diisi (program panjang yang sudah mulai tetap tampil).
 * Event berulang selesai setelah sesi terakhirnya lewat.
 */
export const isActivityUpcoming = (a: Activity, now = new Date()) => {
  if (isDone(a)) return false;
  if (a.recurrence && a.starts_at) return nextSession(a, now) !== null;
  const until = a.ends_at ?? a.starts_at;
  return !until || isUpcoming(new Date(until), now);
};

// ---------------------------------------------------------------------------
// Event berulang: starts_at/ends_at = sesi pertama, sesi lain dihitung di sini.
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const WIB_MS = 7 * 60 * 60 * 1000;

type Schedule = Pick<Activity, 'starts_at' | 'ends_at' | 'recurrence' | 'recurrence_until'>;

/** Mulai sesi ke-n (0 = sesi pertama). Bulanan: tanggal yang sama, mundur ke akhir bulan kalau tidak ada. */
function sessionStart(first: Date, recurrence: Recurrence, n: number) {
  if (recurrence !== 'monthly') return new Date(first.getTime() + n * (recurrence === 'weekly' ? 7 : 14) * DAY_MS);
  const wall = new Date(first.getTime() + WIB_MS);
  const target = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() + n, 1, wall.getUTCHours(), wall.getUTCMinutes()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(wall.getUTCDate(), lastDay));
  return new Date(target.getTime() - WIB_MS);
}

/**
 * Sesi yang sedang/akan datang ({ starts_at, ends_at }); null kalau seri sudah
 * selesai. Seperti event biasa, sesi dianggap belum lewat sampai akhir harinya.
 */
export function nextSession(a: Schedule, now = new Date()) {
  if (!a.starts_at) return null;
  const first = new Date(a.starts_at);
  const duration = a.ends_at ? Date.parse(a.ends_at) - first.getTime() : null;
  const session = (start: Date) => ({
    starts_at: start.toISOString(),
    ends_at: duration === null ? null : new Date(start.getTime() + duration).toISOString(),
  });
  if (!a.recurrence) return isUpcoming(new Date(a.ends_at ?? a.starts_at), now) ? session(first) : null;

  for (let n = 0; n < 5000; n++) {
    const start = sessionStart(first, a.recurrence, n);
    if (a.recurrence_until && isoDate(new Date(start.getTime() + WIB_MS)) > a.recurrence_until) return null;
    const end = duration === null ? start : new Date(start.getTime() + duration);
    if (isUpcoming(end, now)) return session(start);
  }
  return null;
}

/** Untuk tampilan: event berulang memakai jadwal sesi berikutnya (kalau masih ada). */
export function withNextSession<T extends Schedule>(a: T, now = new Date()): T {
  if (!a.recurrence) return a;
  const next = nextSession(a, now);
  return next ? { ...a, ...next } : a;
}

/**
 * Agenda: event yang belum selesai, jadwal berulang diganti sesi berikutnya,
 * urut tanggal. Event tanpa jadwal di depan (atau di belakang dengan undatedLast).
 */
export function upcomingSessions(list: Activity[], { now = new Date(), undatedLast = false } = {}) {
  const key = (a: Activity) => a.starts_at ?? (undatedLast ? '\uffff' : '');
  return list
    .filter((a) => isActivityUpcoming(a, now))
    .map((a) => withNextSession(a, now))
    .sort((x, y) => key(x).localeCompare(key(y)));
}

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  weekly: 'Setiap minggu',
  biweekly: 'Dua minggu sekali',
  monthly: 'Setiap bulan',
};

const weekdayFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' });
const dayOfMonthFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', timeZone: 'Asia/Jakarta' });

/** "Setiap Kamis", "Dua minggu sekali, Kamis", "Setiap bulan, tanggal 12" (+ "s.d. …"). Null kalau tidak berulang. */
export function recurrenceLabel(a: Schedule) {
  if (!a.recurrence || !a.starts_at) return null;
  const first = new Date(a.starts_at);
  const base =
    a.recurrence === 'weekly'
      ? `Setiap ${weekdayFmt.format(first)}`
      : a.recurrence === 'biweekly'
        ? `Dua minggu sekali, ${weekdayFmt.format(first)}`
        : `Setiap bulan, tanggal ${dayOfMonthFmt.format(first)}`;
  return a.recurrence_until ? `${base} s.d. ${formatDate(a.recurrence_until)}` : base;
}

/** RRULE untuk Google Calendar (sama dengan calendar-sync). */
export function recurrenceRule(a: Schedule) {
  if (!a.recurrence) return null;
  const freq = a.recurrence === 'monthly' ? 'FREQ=MONTHLY' : `FREQ=WEEKLY${a.recurrence === 'biweekly' ? ';INTERVAL=2' : ''}`;
  // Akhir hari recurrence_until dalam WIB, ditulis dalam UTC.
  const until = a.recurrence_until ? `;UNTIL=${a.recurrence_until.replace(/-/g, '')}T165959Z` : '';
  return `RRULE:${freq}${until}`;
}

// ---------------------------------------------------------------------------
// Subgrup penyelenggara
// ---------------------------------------------------------------------------

export type CommunityGroup = CommunityGroupRow;

export async function getCommunityGroups(): Promise<CommunityGroup[]> {
  // Bisa dibaca semua orang (RLS), jadi tidak perlu menunggu sesi.
  const db = anonSupabase();
  if (!db) return [];
  const { data, error } = await db.from('community_groups').select('*').order('sort_order').order('name');
  if (error) {
    console.error('Tidak dapat mengambil subgrup komunitas:', error.message);
    return [];
  }
  return data;
}

/** Nama penyelenggara untuk ditampilkan; null = SWE Growth langsung. */
export const organizerOf = (a: Pick<Activity, 'organizer_group_id'>, groups: CommunityGroup[]) =>
  groups.find((g) => g.id === a.organizer_group_id) ?? null;

/** Sudah mulai tapi belum selesai, mis. program yang berjalan beberapa bulan. */
export const isActivityOngoing = (a: Pick<Activity, 'starts_at' | 'ends_at'>, now = new Date()) =>
  Boolean(a.starts_at && a.ends_at && new Date(a.starts_at) <= now && new Date(a.ends_at) > now);

export const canRegister = (a: Activity) => a.status === 'registration_open' || a.status === 'full';

/** Saat build pakai client anonim; di browser pakai client bersesi (admin bisa lihat draft). */
export function client() {
  if (typeof window === 'undefined') return anonSupabase();
  return hasSupabase ? supabase() : null;
}

export async function getPublishedActivities(): Promise<Activity[]> {
  const db = client();
  if (!db) return [];

  const { data, error } = await db
    .from('activities')
    .select('*')
    .eq('is_public', true)
    .order('starts_at', { ascending: true, nullsFirst: true });

  if (error) {
    console.error('Tidak dapat mengambil activity dari Supabase:', error.message);
    return [];
  }
  return data;
}

/**
 * Sudah lewat: ditandai selesai, atau jadwal (sesi terakhir untuk event
 * berulang) sudah lewat. Event yang dibatalkan tidak dihitung.
 */
export const isActivityPast = (a: Activity, now = new Date()) =>
  a.status !== 'cancelled' && !isActivityUpcoming(a, now) && (a.status === 'completed' || Boolean(a.starts_at));

/**
 * Kegiatan lalu, terbaru dulu. Seri berulang yang masih berjalan ikut tampil
 * kalau sudah punya foto dokumentasi dari sesi sebelumnya.
 */
export const pastActivities = (list: Activity[], now = new Date()) =>
  list
    .filter(
      (a) =>
        isActivityPast(a, now) ||
        (a.recurrence && a.status !== 'cancelled' && (a.photos ?? []).length > 0 && a.starts_at && new Date(a.starts_at) <= now),
    )
    .sort((x, y) => (y.starts_at ?? '').localeCompare(x.starts_at ?? ''));

/** Slug semua kegiatan publik, untuk prerender halaman detail saat build. */
export async function getPublishedActivitySlugs(): Promise<string[]> {
  const db = anonSupabase();
  if (!db) return [];
  const { data, error } = await db.from('activities').select('slug').eq('is_public', true);
  if (error) {
    console.error('Tidak dapat mengambil slug activity dari Supabase:', error.message);
    return [];
  }
  return data.map((a) => a.slug);
}

// Filter is_public sama dengan RLS anon, jadi client tanpa sesi cukup (dan tidak menunggu auth).
export async function getPublishedActivityBySlug(slug: string): Promise<Activity | null> {
  const db = anonSupabase();
  if (!db) return null;

  const { data, error } = await db.from('activities').select('*').eq('slug', slug).eq('is_public', true).maybeSingle();

  if (error) {
    console.error('Tidak dapat mengambil activity dari Supabase:', error.message);
    return null;
  }
  // Event berulang tampil dengan jadwal sesi berikutnya.
  return data && withNextSession(data);
}

/** Angka hero landing dari database (null kalau gagal diambil). */
export async function getCommunityStats() {
  const db = client();
  if (!db) return null;
  const { data, error } = await db.rpc('community_stats').maybeSingle();
  if (error) {
    console.error('Tidak dapat mengambil statistik komunitas:', error.message);
    return null;
  }
  return data;
}

/** Aktivitas 7 hari terakhir untuk landing (kosong kalau sepi atau gagal diambil). */
export async function getCommunityPulse() {
  const db = client();
  if (!db) return [];
  const { data, error } = await db.rpc('community_pulse');
  if (error) {
    console.error('Tidak dapat mengambil aktivitas komunitas:', error.message);
    return [];
  }
  return data;
}

/** Path publik detail event — dibagikan saat publikasi. */
export const activityPath = (a: Pick<Activity, 'slug'>) => `/agenda/${a.slug}`;
export const registerPath = (a: Pick<Activity, 'slug'>) => `/agenda/${a.slug}/daftar`;
export const registeredPath = (a: Pick<Activity, 'slug'>) => `/agenda/${a.slug}/terdaftar`;

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
export const priceLabel = (a: Pick<Activity, 'price_idr'>) => (a.price_idr > 0 ? rupiah.format(a.price_idr) : 'Gratis');
export const isPaid = (a: Pick<Activity, 'price_idr'>) => a.price_idr > 0;

/** "linkedin.com/in/ruby-abdullah/" → "ruby-abdullah". */
export const linkedinHandle = (url: string | null) => url?.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1] ?? null;

/**
 * Foto pembicara: URL manual kalau diisi admin, kalau tidak diambil dari profil
 * LinkedIn lewat unavatar.io (gratis, di-cache 28 hari). Null kalau keduanya tidak ada.
 */
export function speakerPhoto(a: Pick<Activity, 'speaker_photo_url' | 'speaker_linkedin_url'>) {
  if (a.speaker_photo_url) return a.speaker_photo_url;
  const handle = linkedinHandle(a.speaker_linkedin_url);
  return handle ? `https://unavatar.io/linkedin/${encodeURIComponent(handle)}?fallback=false` : null;
}

/** "Hari ini", "Besok", "3 hari lagi" — null kalau sudah lewat atau tanpa tanggal. */
export function countdown(a: Pick<Activity, 'starts_at'>, now = new Date()) {
  if (!a.starts_at) return null;
  const day = (d: Date) => new Date(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })).getTime();
  const days = Math.round((day(new Date(a.starts_at)) - day(now)) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return 'Hari ini';
  if (days === 1) return 'Besok';
  return `${days} hari lagi`;
}

/** "13.00–14.30 WIB" atau "13.00 WIB" kalau tanpa jam selesai. */
export function timeRange(a: Pick<Activity, 'starts_at' | 'ends_at'>) {
  if (!a.starts_at) return null;
  const start = formatWibTime(a.starts_at).replace(' WIB', '');
  return a.ends_at ? `${start}–${formatWibTime(a.ends_at)}` : `${start} WIB`;
}

export async function fetchPublicStats(activityId: string) {
  const { data } = (await anonSupabase()?.rpc('activity_public_stats', { p_activity_id: activityId }).maybeSingle()) ?? {};
  return data ?? { confirmed: 0, waitlisted: 0 };
}

export type CalendarSyncResult = {
  status?: 'created' | 'updated' | 'unchanged' | 'cancelled' | 'skipped' | 'not_configured';
  invited?: number;
  url?: string;
  error?: string;
  detail?: string;
};

/**
 * Samakan event dengan Google Calendar SWE Growth (edge function calendar-sync):
 * peserta terkonfirmasi jadi tamu, Google yang mengirim undangan. Gagal = tidak
 * mengganggu pendaftaran; admin bisa sinkron ulang dari editor event.
 */
export async function syncCalendar(activityId: string): Promise<CalendarSyncResult> {
  const { data, error } = await supabase().functions.invoke<CalendarSyncResult>('calendar-sync', {
    body: { activity_id: activityId },
  });
  if (error) return { error: error.message };
  return data ?? {};
}

/** Kode pendek untuk ditunjukkan peserta, dari id pendaftaran. */
export const registrationCode = (id: string) => `SWE-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;

export const isActiveRegistration = (s: RegistrationStatus | null | undefined) => s === 'confirmed' || s === 'waitlisted';

/** Status pendaftaran akun yang login untuk satu event (null kalau belum pernah). */
export async function fetchMyRegistration(activityId: string, userId: string) {
  const { data } = await supabase()
    .from('activity_registrations')
    .select('*')
    .eq('activity_id', activityId)
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

const calStamp = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, '');

/** Link "tambah ke Google Calendar". Tanpa ends_at dianggap 1 jam. Event berulang ikut pola ulangnya. */
export function googleCalendarUrl(a: Activity, details: string) {
  if (!a.starts_at) return null;
  const start = new Date(a.starts_at);
  const end = a.ends_at ? new Date(a.ends_at) : new Date(start.getTime() + 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: a.title,
    dates: `${calStamp(start)}/${calStamp(end)}`,
    details,
    location: a.location ?? (a.mode === 'online' ? 'Online' : ''),
  });
  const rule = recurrenceRule(a);
  if (rule) params.set('recur', rule);
  return `https://calendar.google.com/calendar/render?${params}`;
}

export const slugify = (input: string) =>
  input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

// ---------------------------------------------------------------------------
// Peserta: ikuti, daftar, batal
// ---------------------------------------------------------------------------

export async function isFollowing(activityId: string, userId: string) {
  const { data } = await supabase()
    .from('activity_interests')
    .select('id')
    .eq('activity_id', activityId)
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(data);
}

export const followActivity = (activityId: string) => supabase().rpc('follow_activity', { p_activity_id: activityId });

export const joinActivity = (args: { activityId: string; name: string; whatsapp: string; answers: Record<string, string> }) =>
  supabase().rpc('join_activity', {
    p_activity_id: args.activityId,
    p_name: args.name,
    p_whatsapp: args.whatsapp,
    p_answers: args.answers,
  });

export const cancelRegistration = (activityId: string) => supabase().rpc('cancel_activity_registration', { p_activity_id: activityId });

/** Link meeting & rekaman; RPC hanya mengembalikan isinya untuk peserta terkonfirmasi. */
export async function fetchActivityLinks(activityId: string) {
  const { data } = await supabase().rpc('activity_links', { p_activity_id: activityId }).maybeSingle();
  return data;
}

/** Status pendaftaran aktif (bukan batal) milik user, per event. */
export async function fetchMyRegistrationStatuses(userId: string) {
  const { data } = await supabase()
    .from('activity_registrations')
    .select('activity_id, status')
    .eq('user_id', userId)
    .neq('status', 'cancelled');
  return data ?? [];
}
