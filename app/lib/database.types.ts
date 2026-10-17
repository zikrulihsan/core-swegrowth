// Ditulis tangan mengikuti supabase/migrations/*.sql.
// Setelah migration di-apply, regenerate dengan:
//   npx supabase gen types typescript --project-id <project-ref> > app/lib/database.types.ts

export type ActivityStatus =
  | 'coming_soon'
  | 'scheduled'
  | 'registration_open'
  | 'full'
  | 'completed'
  | 'cancelled';

export type ActivityMode = 'online' | 'offline' | 'hybrid';
export type RegistrationStatus = 'confirmed' | 'waitlisted' | 'cancelled';
export type Seniority = 'student' | 'junior' | 'mid' | 'senior' | 'staff' | 'manager';

type Table<Row, Required extends keyof Row, Generated extends keyof Row = never> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required | Generated>> & Partial<Pick<Row, Generated>>;
  Update: Partial<Row>;
  Relationships: [];
};

/** Pertanyaan pendaftaran yang diatur admin per event (activities.registration_fields). */
export type RegistrationField = {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  required: boolean;
  options?: string[];
};

/** Langkah tambahan di halaman "terdaftar", diatur admin per event. */
export type NextStep = { title: string; url: string; description: string };

/** Pola jadwal berulang; starts_at/ends_at event = sesi pertama. */
export type Recurrence = 'weekly' | 'biweekly' | 'monthly';

/** Foto dokumentasi event (activities.photos). */
export type EventPhoto = { url: string; caption: string };

/** Subgrup komunitas yang menyelenggarakan event, mis. English Club. */
export type CommunityGroupRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sort_order: number;
  created_at: string;
};

export type ActivityRow = {
  activity_type: string;
  capacity: number | null;
  created_at: string;
  description: string;
  ends_at: string | null;
  id: string;
  image_url: string | null;
  is_public: boolean;
  location: string | null;
  mode: ActivityMode | null;
  /** 0 = gratis. Event berbayar belum bisa didaftar (pembayaran segera hadir). */
  price_idr: number;
  registration_fields: RegistrationField[];
  registration_closes_at: string | null;
  registration_opens_at: string | null;
  slug: string;
  speaker: string | null;
  speaker_title: string | null;
  speaker_linkedin_url: string | null;
  /** Kosong = foto diambil otomatis dari LinkedIn. */
  speaker_photo_url: string | null;
  next_steps: NextStep[];
  /** Poin "Yang akan dibahas". */
  highlights: string[];
  /** Subgrup penyelenggara; null = SWE Growth langsung. */
  organizer_group_id: string | null;
  recurrence: Recurrence | null;
  /** Tanggal WIB (yyyy-mm-dd) sesi terakhir boleh jatuh, inklusif; null = terus berulang. */
  recurrence_until: string | null;
  photos: EventPhoto[];
  /** Rekaman publik di YouTube, diputar di halaman event. */
  youtube_url: string | null;
  /** Diisi edge function calendar-sync. */
  google_event_id: string | null;
  google_event_url: string | null;
  calendar_synced_at: string | null;
  starts_at: string | null;
  status: ActivityStatus;
  summary: string;
  timezone: string;
  title: string;
  updated_at: string;
};

export type ActivityRegistrationRow = {
  id: string;
  activity_id: string;
  user_id: string | null;
  name: string;
  email: string;
  whatsapp: string | null;
  note: string | null;
  /** Jawaban pertanyaan pendaftaran, { [field.id]: jawaban }. */
  answers: Record<string, string>;
  status: RegistrationStatus;
  created_at: string;
  updated_at: string;
};

export type ActivityInterestRow = {
  id: string;
  activity_id: string;
  user_id: string | null;
  email: string;
  whatsapp: string | null;
  created_at: string;
};

/** Satu baris riwayat kerja di profiles.experiences. Bulan dalam format YYYY-MM. */
export type Experience = {
  role: string;
  company: string;
  start: string;
  /** null = masih bekerja di sini. */
  end: string | null;
  description: string;
};

export type ProfileRow = {
  id: string;
  username: string | null;
  email: string | null;
  whatsapp: string | null;
  full_name: string;
  headline: string;
  seniority: Seniority | null;
  company: string | null;
  bio: string;
  avatar_url: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  skills: string[];
  location: string | null;
  years_experience: number | null;
  portfolio_url: string | null;
  tech_stack: string[];
  experiences: Experience[];
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Kolom profil yang boleh tampil publik (lihat public_profile()). Tanpa WA & email. */
export type PublicProfile = Pick<
  ProfileRow,
  | 'id' | 'username' | 'full_name' | 'headline' | 'company' | 'seniority' | 'years_experience' | 'location'
  | 'avatar_url' | 'bio' | 'linkedin_url' | 'github_url' | 'portfolio_url' | 'skills' | 'tech_stack'
  | 'experiences' | 'created_at'
>;

export type MemberMotivationRow = {
  user_id: string;
  career_problem: string;
  help_wanted: string;
  join_reason: string;
  expectations: string;
  created_at: string;
  updated_at: string;
};

export type MembershipRow = {
  user_id: string;
  active_until: string;
  goakal_ref: string | null;
  note: string | null;
  activated_by: string | null;
  activated_at: string;
};

export type WhatsappGroupRow = {
  id: string;
  name: string;
  description: string;
  invite_url: string;
  sort_order: number;
  created_at: string;
};

export type MemberContributionRow = {
  id: string;
  title: string;
  category: string;
  description: string;
  url: string;
  maker_name: string;
  /** Member terdaftar yang membuat; maker_name dipakai kalau kosong. */
  maker_id: string | null;
  icon_url: string | null;
  sort_order: number;
  is_published: boolean;
  created_at: string;
};

/** Hasil published_contributions(): kontribusi + pembuat, hanya kolom aman. */
export type PublishedContribution = Pick<MemberContributionRow, 'id' | 'title' | 'category' | 'description' | 'url' | 'icon_url'> & {
  maker_name: string;
  /** Terisi kalau pembuat member dengan profil publik (/member/:handle). */
  maker_handle: string | null;
  maker_avatar_url: string | null;
};

export type RecommendationCategory = 'acara' | 'komunitas' | 'course' | 'buku' | 'podcast' | 'youtube' | 'newsletter' | 'web' | 'lainnya';
export type RecommendationStatus = 'pending' | 'approved' | 'rejected' | 'hidden';
export type RecommendationPrice = 'gratis' | 'berbayar' | 'freemium';
export type RecommendationLanguage = 'id' | 'en';
export type RecommendationRejectReason = 'duplikat' | 'kurang_relevan' | 'link_mati' | 'promosi' | 'tidak_sesuai_coc';

export type RecommendationTopicRow = { name: string; sort_order: number; created_at: string };

/** Angka agregat 7 hari terakhir; slug/title hanya untuk baris 'registration'. */
export type CommunityPulseRow = { kind: 'member' | 'registration'; slug: string | null; title: string | null; total: number };

export type RecommendationRow = {
  id: string;
  category: RecommendationCategory;
  title: string;
  url: string;
  /** "Kenapa direkomendasikan" — isi utama kartu. */
  reason: string;
  /** Penulis (buku) atau penyelenggara/pembuat. */
  organizer: string;
  topics: string[];
  price: RecommendationPrice | null;
  language: RecommendationLanguage | null;
  /** Khusus acara (yyyy-mm-dd); acara yang lewat tidak tampil di direktori. */
  event_date: string | null;
  event_mode: ActivityMode | null;
  location: string;
  /** Link afiliasi resmi SWE Growth (hanya admin yang menandai). */
  is_affiliate: boolean;
  source: 'admin' | 'member';
  submitted_by: string | null;
  show_recommender: boolean;
  status: RecommendationStatus;
  is_featured: boolean;
  featured_order: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: RecommendationRejectReason | null;
  reject_note: string;
  created_at: string;
  updated_at: string;
};

/** Hasil published_recommendations(): hanya kolom aman. */
export type PublishedRecommendation = Pick<
  RecommendationRow,
  | 'id' | 'category' | 'title' | 'url' | 'reason' | 'organizer' | 'topics' | 'price' | 'language'
  | 'event_date' | 'event_mode' | 'location' | 'is_affiliate' | 'source' | 'is_featured' | 'featured_order' | 'created_at'
> & {
  /** Terisi kalau usulan member yang mengizinkan namanya tampil dan profilnya publik. */
  recommender_name: string | null;
  recommender_handle: string | null;
  recommender_avatar_url: string | null;
};

export type ActivityMemberInfoRow = {
  activity_id: string;
  meeting_url: string | null;
  recording_url: string | null;
  updated_at: string;
};

export type ActivityLinks = {
  /** Terisi untuk peserta terkonfirmasi mulai meeting_opens_at (admin: selalu). */
  meeting_url: string | null;
  recording_url: string | null;
  has_meeting: boolean;
  has_recording: boolean;
  meeting_opens_at: string | null;
};

type Timestamps = 'id' | 'created_at' | 'updated_at';

export type Database = {
  public: {
    Tables: {
      activities: Table<ActivityRow, 'slug' | 'title', Timestamps>;
      activity_admin_emails: Table<{ email: string; created_at: string }, 'email', 'created_at'>;
      activity_interests: Table<ActivityInterestRow, 'activity_id' | 'email', 'id' | 'created_at'>;
      activity_registrations: Table<ActivityRegistrationRow, 'activity_id' | 'name' | 'email', Timestamps>;
      profiles: Table<ProfileRow, 'id', 'created_at' | 'updated_at'>;
      memberships: Table<MembershipRow, 'user_id' | 'active_until', 'activated_at'>;
      member_motivations: Table<
        MemberMotivationRow,
        'career_problem' | 'help_wanted' | 'join_reason',
        'user_id' | 'created_at' | 'updated_at'
      >;
      curators: Table<{ user_id: string; created_at: string }, 'user_id', 'created_at'>;
      whatsapp_groups: Table<WhatsappGroupRow, 'name' | 'invite_url', 'id' | 'created_at'>;
      member_contributions: Table<MemberContributionRow, 'title' | 'url', 'id' | 'created_at'>;
      recommendations: Table<RecommendationRow, 'category' | 'title' | 'url' | 'reason', Timestamps>;
      recommendation_topics: Table<RecommendationTopicRow, 'name', 'created_at'>;
      activity_member_info: Table<ActivityMemberInfoRow, 'activity_id', 'updated_at'>;
      community_groups: Table<CommunityGroupRow, 'slug' | 'name', 'id' | 'created_at'>;
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_member: { Args: Record<string, never>; Returns: boolean };
      is_curator: { Args: Record<string, never>; Returns: boolean };
      has_complete_profile: { Args: Record<string, never>; Returns: boolean };
      public_profile: { Args: { p_handle: string }; Returns: PublicProfile[] };
      published_contributions: { Args: Record<string, never>; Returns: PublishedContribution[] };
      published_recommendations: { Args: Record<string, never>; Returns: PublishedRecommendation[] };
      community_pulse: { Args: Record<string, never>; Returns: CommunityPulseRow[] };
      community_stats: { Args: Record<string, never>; Returns: { member_count: number; session_count: number }[] };
      check_recommendation_url: { Args: { p_url: string; p_exclude_id?: string | null }; Returns: { title: string; status: RecommendationStatus }[] };
      submit_recommendation: {
        Args: {
          p_category: RecommendationCategory;
          p_title: string;
          p_url: string;
          p_reason: string;
          p_organizer?: string;
          p_topics?: string[];
          p_price?: RecommendationPrice | null;
          p_language?: RecommendationLanguage | null;
          p_event_date?: string | null;
          p_event_mode?: ActivityMode | null;
          p_location?: string;
          p_show_recommender?: boolean;
          p_id?: string | null;
        };
        Returns: string;
      };
      activity_public_stats: { Args: { p_activity_id: string }; Returns: { confirmed: number; waitlisted: number }[] };
      join_activity: {
        Args: { p_activity_id: string; p_name: string; p_whatsapp: string; p_answers?: Record<string, string> };
        Returns: { registration_id: string; registration_status: RegistrationStatus }[];
      };
      cancel_activity_registration: { Args: { p_activity_id: string }; Returns: undefined };
      follow_activity: { Args: { p_activity_id: string }; Returns: undefined };
      activity_links: {
        Args: { p_activity_id: string };
        Returns: ActivityLinks[];
      };
    };
    Enums: {
      activity_status: ActivityStatus;
      registration_status: RegistrationStatus;
      seniority: Seniority;
    };
    CompositeTypes: Record<string, never>;
  };
};
