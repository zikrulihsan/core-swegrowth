// Masuk ke app lain (mis. Trellonotes) memakai akun SWE Growth.
//
// Dipanggil swegrowth.id oleh user yang sudah login. Fungsi ini membuat token
// magic link sekali pakai untuk user itu (tanpa mengirim email), lalu
// mengembalikan URL app tujuan dengan token di fragment (#sso=…). App tujuan
// menukarnya lewat supabase.auth.verifyOtp() menjadi sesinya sendiri, jadi
// kedua app tidak berbagi refresh token.
//
// Deploy: supabase functions deploy app-handoff --no-verify-jwt
// (JWT diverifikasi di bawah lewat auth.getUser()).
import { createClient } from 'npm:@supabase/supabase-js@2';

/** App yang boleh menerima login, beserta origin yang diizinkan. */
const APPS: Record<string, string[]> = {
  trellonotes: ['https://notis.swegrowth.id', 'https://notes.swegrowth.id', 'https://trellonotes.netlify.app', 'http://localhost:5173', 'http://127.0.0.1:5173'],
  projects: ['https://projects.swegrowth.id', 'http://localhost:3000', 'http://127.0.0.1:3000'],
};

/** Origin swegrowth yang boleh memanggil fungsi ini. */
const CALLERS = ['https://swegrowth.id', 'http://localhost:5173', 'http://localhost:4321'];

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && CALLERS.includes(origin) ? origin : CALLERS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
});

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get('Origin')), 'Content-Type': 'application/json' };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });

  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  const { app, returnTo } = await req.json().catch(() => ({}));
  const allowed = typeof app === 'string' ? APPS[app] : undefined;
  if (!allowed) return reply(400, { error: 'unknown_app' });
  const origin = typeof returnTo === 'string' && allowed.includes(returnTo) ? returnTo : allowed[0];

  const url = Deno.env.get('SUPABASE_URL')!;
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!jwt) return reply(401, { error: 'login_required' });

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  const email = userData.user?.email;
  if (userError || !email) return reply(401, { error: 'login_required' });

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkError || !link.properties?.hashed_token) return reply(500, { error: 'handoff_failed' });

  return reply(200, { url: `${origin}/#sso=${encodeURIComponent(link.properties.hashed_token)}` });
});
