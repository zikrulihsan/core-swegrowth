/**
 * Preview link kegiatan untuk WhatsApp, Telegram, X, LinkedIn, dst.
 *
 * Kegiatan yang sudah ada saat build di-prerender lengkap dengan meta. Kegiatan
 * yang lebih baru dilayani app shell SPA tanpa meta, dan crawler preview tidak
 * menjalankan JS. Untuk crawler saja, edge function ini mengambil kegiatan dari
 * Supabase lalu menyisipkan title + Open Graph ke HTML sebelum dikirim.
 * Pengunjung biasa langsung dilayani tanpa menunggu Supabase.
 * Gagal ambil data = HTML dikirim apa adanya, halaman tetap jalan.
 */
import type { Config, Context } from '@netlify/edge-functions';
import { isbot } from 'isbot';

const SITE_URL = 'https://swegrowth.id';
const FALLBACK_IMAGE = `${SITE_URL}/assets/swe-growth-logo.png`;

type Activity = {
  title: string;
  summary: string | null;
  starts_at: string | null;
  mode: string | null;
  image_url: string | null;
  slug: string;
};

const wibDay = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
});
const wibTime = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function fetchActivity(slug: string): Promise<Activity | null> {
  const url = Netlify.env.get('VITE_SUPABASE_URL');
  const key = Netlify.env.get('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (!url || !key) return null;

  const query = new URLSearchParams({
    select: 'title,summary,starts_at,mode,image_url,slug',
    slug: `eq.${slug}`,
    is_public: 'eq.true',
    limit: '1',
  });
  const res = await fetch(`${url}/rest/v1/activities?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) return null;
  const rows: Activity[] = await res.json();
  return rows[0] ?? null;
}

function metaTags(a: Activity) {
  const start = a.starts_at ? new Date(a.starts_at) : null;
  const when = start ? `${wibDay.format(start)}, ${wibTime.format(start)} WIB` : 'Jadwal menyusul';
  const where = a.mode ? ` · ${a.mode[0].toUpperCase()}${a.mode.slice(1)}` : '';
  const description = `${when}${where}. ${a.summary || 'Kegiatan komunitas SWE Growth.'}`;
  const title = `${a.title} — SWE Growth`;
  const url = `${SITE_URL}/agenda/${a.slug}`;
  const image = a.image_url || FALLBACK_IMAGE;

  const tags: [string, string, string][] = [
    ['name', 'description', description],
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', 'SWE Growth'],
    ['property', 'og:locale', 'id_ID'],
    ['property', 'og:url', url],
    ['property', 'og:title', title],
    ['property', 'og:description', description],
    ['property', 'og:image', image],
    ['name', 'twitter:card', a.image_url ? 'summary_large_image' : 'summary'],
    ['name', 'twitter:title', title],
    ['name', 'twitter:description', description],
    ['name', 'twitter:image', image],
  ];
  return [
    `<title>${escape(title)}</title>`,
    `<link rel="canonical" href="${escape(url)}"/>`,
    ...tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escape(value)}"/>`),
  ].join('');
}

export default async function handler(request: Request, context: Context) {
  // Hanya halaman detail (/agenda/:slug); /daftar dan /terdaftar dibiarkan.
  const slug = new URL(request.url).pathname.match(/^\/agenda\/([^/]+)\/?$/)?.[1];
  if (!slug || !isbot(request.headers.get('user-agent'))) return;

  const [response, activity] = await Promise.all([context.next(), fetchActivity(decodeURIComponent(slug)).catch(() => null)]);
  if (!activity || !response.headers.get('content-type')?.includes('text/html')) return response;

  const original = await response.text();
  // HTML prerender sudah punya meta kegiatan.
  if (original.includes('property="og:title"')) return new Response(original, response);

  const html = original
    // Deskripsi default dari root diganti punya kegiatan.
    .replace(/<meta name="description"[^>]*>/, '')
    .replace('</head>', `${metaTags(activity)}</head>`);

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(html, { status: response.status, headers });
}

export const config: Config = { path: '/agenda/*' };
