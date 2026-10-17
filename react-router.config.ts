import type { Config } from '@react-router/dev/config';
import { loadEnv } from 'vite';

// .env lokal belum masuk process.env saat config dibaca; di Netlify sudah.
Object.assign(process.env, { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env });

/**
 * Tidak ada server runtime: halaman publik di-prerender jadi HTML saat build
 * (bagus untuk SEO & share link), sisanya — portal member dan admin — jalan
 * sebagai SPA lewat __spa-fallback.html.
 */
export default {
  ssr: false,
  prerender: ['/', '/tentang', '/agenda', '/rekaman', '/rekomendasi', '/code-of-conduct', '/privasi', '/term-of-service'],
} satisfies Config;
