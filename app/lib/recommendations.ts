import { client } from './activities';
import type {
  Database,
  PublishedRecommendation,
  RecommendationCategory,
  RecommendationLanguage,
  RecommendationPrice,
  RecommendationRejectReason,
  RecommendationRow,
  RecommendationStatus,
} from './database.types';
import { supabase } from './supabase';

export type Recommendation = PublishedRecommendation;

/** Urutan = urutan tab filter di direktori dan pilihan di form. */
export const CATEGORIES: { id: RecommendationCategory; label: string; organizerLabel: string }[] = [
  { id: 'acara', label: 'Acara', organizerLabel: 'Penyelenggara' },
  { id: 'komunitas', label: 'Komunitas', organizerLabel: 'Pengelola' },
  { id: 'course', label: 'Course', organizerLabel: 'Pembuat / platform' },
  { id: 'buku', label: 'Buku', organizerLabel: 'Penulis' },
  { id: 'podcast', label: 'Podcast', organizerLabel: 'Host' },
  { id: 'youtube', label: 'YouTube', organizerLabel: 'Channel' },
  { id: 'newsletter', label: 'Newsletter', organizerLabel: 'Penulis' },
  { id: 'web', label: 'Web', organizerLabel: 'Pengelola' },
  { id: 'lainnya', label: 'Lainnya', organizerLabel: 'Pembuat' },
];

export const categoryOf = (id: RecommendationCategory) => CATEGORIES.find((c) => c.id === id)!;
export const isCategory = (v: string | null): v is RecommendationCategory => CATEGORIES.some((c) => c.id === v);

export const PRICE_LABEL: Record<RecommendationPrice, string> = {
  gratis: 'Gratis',
  berbayar: 'Berbayar',
  freemium: 'Ada versi gratis',
};

export const LANGUAGE_LABEL: Record<RecommendationLanguage, string> = { id: 'Indonesia', en: 'Inggris' };

export const STATUS_LABEL: Record<RecommendationStatus, string> = {
  pending: 'Menunggu review',
  approved: 'Tayang',
  rejected: 'Belum bisa ditayangkan',
  hidden: 'Disembunyikan',
};

export const REJECT_REASONS: { id: RecommendationRejectReason; label: string }[] = [
  { id: 'duplikat', label: 'Sudah ada di direktori' },
  { id: 'kurang_relevan', label: 'Kurang relevan buat software engineer' },
  { id: 'link_mati', label: 'Link tidak bisa dibuka' },
  { id: 'promosi', label: 'Promosi atau link afiliasi' },
  { id: 'tidak_sesuai_coc', label: 'Tidak sesuai Code of Conduct' },
];

export const rejectReasonLabel = (id: RecommendationRejectReason | null) => REJECT_REASONS.find((r) => r.id === id)?.label ?? null;

/** Info singkat di kartu: tanggal acara, harga, format, bahasa. */
export function recommendationMeta(
  r: Pick<RecommendationRow, 'category' | 'event_date' | 'event_mode' | 'location' | 'price' | 'language'>,
) {
  const date =
    r.category === 'acara' && r.event_date
      ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
          new Date(r.event_date),
        )
      : null;
  const where = r.category === 'acara' ? [r.event_mode, r.location].filter(Boolean).join(' · ') : null;
  return [date, where, r.price && PRICE_LABEL[r.price], r.language && LANGUAGE_LABEL[r.language]].filter(Boolean) as string[];
}

/** Direktori publik (prerender saat build, diperbarui di browser). */
export async function getPublishedRecommendations(): Promise<Recommendation[]> {
  const db = client();
  if (!db) return [];

  const { data, error } = await db.rpc('published_recommendations');
  if (error) {
    console.error('Tidak dapat mengambil rekomendasi dari Supabase:', error.message);
    return [];
  }
  return data;
}

/** Nama topik yang bisa dipilih, urut sesuai yang diatur admin. */
export async function getRecommendationTopics(): Promise<string[]> {
  const db = client();
  if (!db) return [];

  const { data, error } = await db.from('recommendation_topics').select('name').order('sort_order').order('name');
  if (error) {
    console.error('Tidak dapat mengambil topik rekomendasi:', error.message);
    return [];
  }
  return data.map((t) => t.name);
}

/** Usulan milik akun yang login (semua status). Melempar kalau gagal dimuat. */
export async function fetchMyRecommendations(userId: string) {
  const { data, error } = await supabase()
    .from('recommendations')
    .select('*')
    .eq('submitted_by', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export const directoryPath = (category?: RecommendationCategory) => (category ? `/rekomendasi?kategori=${category}` : '/rekomendasi');
export const SUBMIT_PATH = '/rekomendasi/kirim';

/** Usulan milik user sendiri (untuk ?edit=); null kalau bukan miliknya. */
export async function fetchOwnRecommendation(id: string, userId: string) {
  const { data } = await supabase().from('recommendations').select('*').eq('id', id).eq('submitted_by', userId).maybeSingle();
  return data;
}

/** Link yang sudah pernah diusulkan (kecuali `excludeId`), untuk peringatan duplikat. */
export async function checkRecommendationUrl(url: string, excludeId: string | null) {
  const { data } = await supabase().rpc('check_recommendation_url', { p_url: url, p_exclude_id: excludeId }).maybeSingle();
  return data;
}

export const submitRecommendation = (args: Database['public']['Functions']['submit_recommendation']['Args']) =>
  supabase().rpc('submit_recommendation', args);

/**
 * Tarik usulan sendiri; RLS hanya mengizinkan selama masih pending. Delete yang ditolak RLS
 * tidak memberi error, jadi baris yang terhapus dihitung: 0 berarti usulan sudah tidak bisa ditarik.
 */
export async function withdrawRecommendation(id: string): Promise<'ok' | 'locked' | 'failed'> {
  const { data, error } = await supabase().from('recommendations').delete().eq('id', id).select('id');
  if (error) return 'failed';
  return data && data.length > 0 ? 'ok' : 'locked';
}
