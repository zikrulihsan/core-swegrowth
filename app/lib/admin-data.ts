import type { ActivityRegistrationRow, ActivityStatus, Database } from './database.types';
import { supabase } from './supabase';

/**
 * Semua query halaman admin (/admin, /admin/event/:id, /admin/member/:id).
 * Hak akses tetap dijaga RLS + is_admin() di database; fungsi di sini hanya
 * mengumpulkan query supaya komponen tidak memanggil Supabase langsung.
 */

type Tables = Database['public']['Tables'];
type Insert<T extends keyof Tables> = Tables[T]['Insert'];
type Update<T extends keyof Tables> = Tables[T]['Update'];

// ---------------------------------------------------------------------------
// Dashboard /admin
// ---------------------------------------------------------------------------

export async function loadAdminDashboard() {
  const db = supabase();
  const [
    profiles,
    memberships,
    motivations,
    activities,
    registrations,
    groups,
    contributions,
    recommendations,
    recommendationTopics,
    communityGroups,
  ] = await Promise.all([
    db.from('profiles').select('*').order('created_at', { ascending: false }),
    db.from('memberships').select('*'),
    db.from('member_motivations').select('*'),
    db.from('activities').select('*').order('created_at', { ascending: false }),
    db.from('activity_registrations').select('activity_id, status'),
    db.from('whatsapp_groups').select('*').order('sort_order').order('created_at'),
    db.from('member_contributions').select('*').order('sort_order').order('created_at'),
    db.from('recommendations').select('*').order('created_at', { ascending: false }),
    db.from('recommendation_topics').select('*').order('sort_order').order('name'),
    db.from('community_groups').select('*').order('sort_order').order('name'),
  ]);
  return {
    profiles: profiles.data ?? [],
    memberships: memberships.data ?? [],
    motivations: motivations.data ?? [],
    activities: activities.data ?? [],
    registrations: registrations.data ?? [],
    groups: groups.data ?? [],
    contributions: contributions.data ?? [],
    recommendations: recommendations.data ?? [],
    recommendationTopics: recommendationTopics.data ?? [],
    communityGroups: communityGroups.data ?? [],
  };
}

export type AdminDashboard = Awaited<ReturnType<typeof loadAdminDashboard>>;

/** Profil lengkap satu member + kegiatan yang pernah diikuti. */
export async function loadAdminMember(userId: string) {
  const db = supabase();
  const [profile, membership, motivation, regs, activities] = await Promise.all([
    db.from('profiles').select('*').eq('id', userId).maybeSingle(),
    db.from('memberships').select('*').eq('user_id', userId).maybeSingle(),
    db.from('member_motivations').select('*').eq('user_id', userId).maybeSingle(),
    db
      .from('activity_registrations')
      .select('activity_id, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    db.from('activities').select('id, title, slug'),
  ]);
  const activityOf = new Map((activities.data ?? []).map((a) => [a.id, a]));
  return {
    profile: profile.data,
    membership: membership.data,
    motivation: motivation.data,
    registrations: (regs.data ?? []).map((r) => ({ ...r, activity: activityOf.get(r.activity_id) ?? null })),
  };
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

export const saveMembership = (row: Insert<'memberships'>) => supabase().from('memberships').upsert(row);

export const endMembership = (userId: string, lastDay: string) =>
  supabase().from('memberships').update({ active_until: lastDay }).eq('user_id', userId);

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

export const setActivityStatus = (id: string, status: ActivityStatus) => supabase().from('activities').update({ status }).eq('id', id);

/**
 * Minta Netlify build ulang (edge function /api/rebuild, khusus admin) supaya
 * HTML prerender halaman kegiatan & agenda ikut terbarui. Gagal tidak apa-apa:
 * halaman publik tetap mengambil data terbaru di browser.
 */
export async function requestRebuild() {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  await fetch('/api/rebuild', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
}

const communityGroupsQuery = () =>
  supabase()
    .from('community_groups')
    .select('*')
    .order('sort_order')
    .order('name')
    .then((r) => r.data ?? []);

/** Data editor event. `id` null = event baru; `activity` null dari id yang ada = tidak ditemukan. */
export async function loadEventEditor(id: string | null) {
  if (!id) return { activity: null, info: null, registrations: [] as ActivityRegistrationRow[], groups: await communityGroupsQuery() };
  const db = supabase();
  const [activity, info, registrations, groups] = await Promise.all([
    db.from('activities').select('*').eq('id', id).maybeSingle(),
    db.from('activity_member_info').select('*').eq('activity_id', id).maybeSingle(),
    db.from('activity_registrations').select('*').eq('activity_id', id).order('created_at'),
    communityGroupsQuery(),
  ]);
  return { activity: activity.data, info: info.data, registrations: registrations.data ?? [], groups };
}

type MemberLinks = Pick<Insert<'activity_member_info'>, 'meeting_url' | 'recording_url' | 'summary'>;

/**
 * Simpan event (baru kalau `id` null) beserta link khusus member. Mengembalikan
 * error Supabase pertama, atau id event yang tersimpan.
 */
export async function saveActivity(id: string | null, fields: Insert<'activities'>, links: MemberLinks) {
  const db = supabase();
  const saved = id
    ? await db.from('activities').update(fields).eq('id', id).select('id').single()
    : await db.from('activities').insert(fields).select('id').single();
  if (saved.error) return { error: saved.error, id: null };
  const info = await db.from('activity_member_info').upsert({ activity_id: saved.data.id, ...links, updated_at: new Date().toISOString() });
  return { error: info.error, id: saved.data.id };
}

/** Feedback peserta untuk satu event (RLS: admin membaca semua). */
export async function fetchActivityFeedback(activityId: string) {
  const { data, error } = await supabase()
    .from('activity_feedback')
    .select('*')
    .eq('activity_id', activityId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

/** Bucket Storage publik untuk foto dokumentasi (lihat migration community_events). */
const photoBucket = () => supabase().storage.from('event-photos');

export async function uploadEventPhoto(path: string, body: Blob, contentType: string) {
  const storage = photoBucket();
  const { error } = await storage.upload(path, body, { contentType, cacheControl: '31536000' });
  return error ? { error, url: null } : { error: null, url: storage.getPublicUrl(path).data.publicUrl };
}

// ---------------------------------------------------------------------------
// Subgrup, grup WhatsApp, kontribusi member
// ---------------------------------------------------------------------------

export const saveCommunityGroup = (id: string | null, row: Insert<'community_groups'>) =>
  id ? supabase().from('community_groups').update(row).eq('id', id) : supabase().from('community_groups').insert(row);

export const deleteCommunityGroup = (id: string) => supabase().from('community_groups').delete().eq('id', id);

export const addWhatsappGroup = (row: Insert<'whatsapp_groups'>) => supabase().from('whatsapp_groups').insert(row);

export const deleteWhatsappGroup = (id: string) => supabase().from('whatsapp_groups').delete().eq('id', id);

export const saveContribution = (id: string | null, row: Insert<'member_contributions'>) =>
  id ? supabase().from('member_contributions').update(row).eq('id', id) : supabase().from('member_contributions').insert(row);

export const setContributionPublished = (id: string, isPublished: boolean) =>
  supabase().from('member_contributions').update({ is_published: isPublished }).eq('id', id);

export const deleteContribution = (id: string) => supabase().from('member_contributions').delete().eq('id', id);

// ---------------------------------------------------------------------------
// Rekomendasi
// ---------------------------------------------------------------------------

export const addRecommendation = (row: Insert<'recommendations'>) => supabase().from('recommendations').insert(row);

export const updateRecommendation = (id: string, patch: Update<'recommendations'>) =>
  supabase().from('recommendations').update(patch).eq('id', id);

export const deleteRecommendation = (id: string) => supabase().from('recommendations').delete().eq('id', id);

export const addRecommendationTopic = (row: Insert<'recommendation_topics'>) => supabase().from('recommendation_topics').insert(row);

/** Topik dikunci dengan namanya; ganti nama ikut memperbarui rekomendasi lewat trigger di database. */
export const updateRecommendationTopic = (name: string, patch: Update<'recommendation_topics'>) =>
  supabase().from('recommendation_topics').update(patch).eq('name', name);

export const deleteRecommendationTopic = (name: string) => supabase().from('recommendation_topics').delete().eq('name', name);
