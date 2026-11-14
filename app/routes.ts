import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

/**
 * Detail event memakai versi prerender (event.tsx, ada `loader`) kalau env
 * Supabase diisi; tanpa env (CI, fork) versi SPA, karena `loader` wajib punya
 * path prerender. `react-router typegen` selalu memakai event.tsx supaya
 * tipenya (./+types/event) tetap dibuat dan typecheck lolos tanpa env.
 */
const prerenderEvents =
  Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_PUBLISHABLE_KEY) || process.argv.includes('typegen');

export default [
  // Publik — di-prerender saat build (lihat react-router.config.ts)
  index('routes/home.tsx'),
  route('agenda', 'routes/agenda.tsx'),
  // Detail event publik, di-prerender per kegiatan kalau Supabase dikonfigurasi; daftar butuh login
  route('agenda/:slug', prerenderEvents ? 'routes/event.tsx' : 'routes/event-spa.tsx'),
  route('agenda/:slug/daftar', 'routes/event-register.tsx'),
  route('agenda/:slug/terdaftar', 'routes/event-registered.tsx'),
  // Tanya jawab ala Slido (SPA): baca publik, login untuk bertanya & vote
  route('agenda/:slug/tanya', 'routes/event-qna.tsx'),
  // Tampilan proyektor/screen share; admin bisa memoderasi dari sini
  route('agenda/:slug/tanya/layar', 'routes/event-qna-screen.tsx'),
  route('portal/agenda/:slug', 'routes/portal-event-redirect.tsx'),
  route('rekaman', 'routes/recordings.tsx'),
  route('rekomendasi', 'routes/recommendations.tsx'),
  route('tentang', 'routes/about.tsx'),
  // Profil publik member (SPA, data dari public_profile())
  route('member/:handle', 'routes/member-public.tsx'),
  route('code-of-conduct', 'routes/code-of-conduct.tsx'),
  route('privasi', 'routes/privacy.tsx'),
  route('term-of-service', 'routes/terms.tsx'),

  // SPA
  route('masuk', 'routes/login.tsx'),
  route('auth/callback', 'routes/auth-callback.tsx'),
  route('auth/google', 'routes/auth-google.tsx'),

  // Wajib login (lihat member-layout); isi khusus verified dijaga per halaman
  layout('routes/member-layout.tsx', [
    route('onboarding', 'routes/onboarding.tsx'),
    route('portal', 'routes/portal.tsx'),
    // Kegiatanku: kegiatan yang diikuti + rekap (ringkasan, rekaman, feedback)
    route('portal/kegiatan', 'routes/my-activities.tsx'),
    route('portal/kegiatan/:slug', 'routes/my-activity.tsx'),
    route('portal/profil', 'routes/portal-profile.tsx'),
    route('portal/profil/edit', 'routes/portal-profile-edit.tsx'),
    route('portal/membership', 'routes/membership.tsx'),
    route('rekomendasi/kirim', 'routes/recommendation-submit.tsx'),
    // Masuk ke app lain dengan akun ini, mis. /ke/trellonotes
    route('ke/:app', 'routes/app-handoff.tsx'),
  ]),
  route('admin', 'routes/admin.tsx'),
  route('admin/member/:id', 'routes/admin-member.tsx'),
  route('admin/event/:id', 'routes/admin-event.tsx'),

  route('*', 'routes/not-found.tsx'),
] satisfies RouteConfig;
