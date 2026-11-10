/**
 * Build ulang situs setelah admin menyimpan event (POST /api/rebuild), supaya
 * HTML prerender halaman kegiatan ikut terbarui. Sampai build selesai, halaman
 * tetap menampilkan data terbaru karena browser selalu mengambil ulang.
 *
 * Env Netlify: NETLIFY_BUILD_HOOK_URL (Site configuration → Build & deploy →
 * Build hooks). URL hook tidak pernah sampai ke browser; hanya admin
 * (is_admin() di Supabase, dicek dengan sesi login pemanggil) yang boleh memicu.
 */
import type { Config } from '@netlify/edge-functions';

const env = (name: string) => Netlify.env.get(name) ?? '';

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Tanya Supabase apakah pemilik JWT ini admin (RLS/is_admin() memakai email di token). */
async function isAdmin(jwt: string) {
  const url = env('VITE_SUPABASE_URL');
  const key = env('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (!url || !key) return false;
  const res = await fetch(`${url}/rest/v1/rpc/is_admin`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(5000),
  });
  return res.ok && (await res.json()) === true;
}

export default async (req: Request) => {
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  const hook = env('NETLIFY_BUILD_HOOK_URL');
  if (!hook) return reply(200, { status: 'not_configured' });

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!jwt || !(await isAdmin(jwt))) return reply(403, { error: 'forbidden' });

  const res = await fetch(`${hook}?trigger_title=${encodeURIComponent('Event diperbarui dari admin')}`, {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
  });
  return res.ok ? reply(200, { status: 'ok' }) : reply(502, { status: 'error', detail: `HTTP ${res.status}` });
};

export const config: Config = { path: '/api/rebuild' };
