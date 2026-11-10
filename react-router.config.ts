import type { Config } from '@react-router/dev/config';
import { loadEnv } from 'vite';

// .env lokal belum masuk process.env saat config dibaca; di Netlify sudah.
Object.assign(process.env, { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env });

/**
 * Path detail semua kegiatan publik. Tanpa env Supabase (CI, fork) kosong dan
 * routes.ts memakai versi SPA. Dengan env, gagal ambil = build gagal (deploy
 * lama tetap tayang), karena route berisi `loader` wajib punya path prerender.
 */
async function publicEventPaths() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];
  const res = await fetch(`${url}/rest/v1/activities?select=slug&is_public=eq.true`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Tidak dapat mengambil slug kegiatan untuk prerender: HTTP ${res.status}`);
  const rows: { slug: string }[] = await res.json();
  return rows.map((r) => `/agenda/${encodeURIComponent(r.slug)}`);
}

/**
 * Tidak ada server runtime: halaman publik di-prerender jadi HTML saat build
 * (bagus untuk SEO & share link), sisanya — portal member dan admin — jalan
 * sebagai SPA lewat __spa-fallback.html. Detail kegiatan ikut di-prerender;
 * admin memicu build ulang lewat /api/rebuild setelah menyimpan event.
 */
export default {
  ssr: false,
  async prerender() {
    return [
      '/',
      '/tentang',
      '/agenda',
      '/rekaman',
      '/rekomendasi',
      '/code-of-conduct',
      '/privasi',
      '/term-of-service',
      ...(await publicEventPaths()),
    ];
  },
} satisfies Config;
