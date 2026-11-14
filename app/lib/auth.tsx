import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { redirect, useNavigate } from 'react-router';
import type { MembershipRow, ProfileRow } from './database.types';
import { hasSupabase, supabase } from './supabase';

type AuthState = {
  /** true sampai sesi dari localStorage selesai dibaca — selalu true saat prerender. */
  loading: boolean;
  user: User | null;
  profile: ProfileRow | null;
  isAdmin: boolean;
  /** Verified member = membership aktif (admin selalu true). */
  isMember: boolean;
  membership: MembershipRow | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export async function fetchProfile(userId: string) {
  const { data } = await supabase().from('profiles').select('*').eq('id', userId).maybeSingle();
  return data;
}

export async function fetchIsAdmin() {
  const { data } = await supabase().rpc('is_admin');
  return data === true;
}

export async function fetchIsMember() {
  const { data } = await supabase().rpc('is_member');
  return data === true;
}

export async function fetchMembership(userId: string) {
  const { data } = await supabase().from('memberships').select('*').eq('user_id', userId).maybeSingle();
  return data;
}

type Account = {
  profile: ProfileRow | null;
  isAdmin: boolean;
  isMember: boolean;
  membership: MembershipRow | null;
};

async function fetchAccount(userId: string): Promise<Account> {
  const [profile, isAdmin, isMember, membership] = await Promise.all([
    fetchProfile(userId),
    fetchIsAdmin(),
    fetchIsMember(),
    fetchMembership(userId),
  ]);
  return { profile, isAdmin, isMember, membership };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [membership, setMembership] = useState<MembershipRow | null>(null);
  const [loading, setLoading] = useState(hasSupabase);

  const userId = session?.user.id;

  useEffect(() => {
    if (!hasSupabase) return;
    const { data } = supabase().auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const applyAccount = useCallback((a: Account) => {
    setProfile(a.profile);
    setIsAdmin(a.isAdmin);
    setIsMember(a.isMember);
    setMembership(a.membership);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (userId) applyAccount(await fetchAccount(userId));
  }, [userId, applyAccount]);

  useEffect(() => {
    // Query Supabase jangan di-await di dalam callback onAuthStateChange (bisa deadlock),
    // jadi profil diambil di effect terpisah setiap user berganti.
    if (!userId) return;
    let cancelled = false;
    void fetchAccount(userId).then((a) => {
      if (!cancelled) applyAccount(a);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, applyAccount]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      user: session?.user ?? null,
      // Data milik user sebelumnya tidak ikut terbaca setelah logout.
      profile: userId ? profile : null,
      isAdmin: userId ? isAdmin : false,
      isMember: userId ? isMember : false,
      membership: userId ? membership : null,
      refreshProfile,
      signOut: async () => {
        // Kalau server tidak terjangkau, tetap hapus sesi di perangkat ini.
        const { error } = await supabase().auth.signOut();
        if (error) await supabase().auth.signOut({ scope: 'local' });
      },
    }),
    [loading, session, userId, profile, isAdmin, isMember, membership, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Keluar lalu kembali ke beranda; dipakai menu akun di navbar dan halaman profil. */
export function useSignOut() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await signOut();
    } finally {
      setBusy(false);
      navigate('/', { replace: true });
    }
  };
  return { signOut: run, busy };
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>.');
  return ctx;
}

export const loginPath = (next: string) => `/masuk?next=${encodeURIComponent(next)}`;

const callbackUrl = (next: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

/**
 * Login Google lewat redirect OAuth Supabase; setelah selesai kembali ke `next`.
 * Cadangan kalau tombol Google Identity Services tidak bisa dimuat (lihat GoogleSignIn).
 */
export const signInWithGoogle = (next: string) =>
  supabase().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl(next) } });

/** Login dengan ID token dari tombol Google Identity Services (tanpa redirect ke supabase.co). */
export const signInWithGoogleIdToken = (token: string, nonce: string) =>
  supabase().auth.signInWithIdToken({ provider: 'google', token, nonce });

/** Nonce acak: versi SHA-256 untuk Google, versi mentah untuk Supabase. */
export async function makeNonce() {
  const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return { raw, hashed };
}

export const GOOGLE_REDIRECT_KEY = 'swegrowth:google-redirect';
export const googleRedirectUri = () => `${window.location.origin}/auth/google`;

/**
 * Login Google lewat redirect satu halaman penuh langsung ke Google (OpenID Connect,
 * response_type=id_token), lalu ID token-nya diteruskan ke Supabase di /auth/google.
 * Dipakai di HP: tanpa popup, tab baru, atau FedCM yang sering gagal di Chrome mobile,
 * dan layar Google tetap menyebut domain kita.
 */
export async function startGoogleRedirect(clientId: string, next: string) {
  const nonce = await makeNonce();
  const state = crypto.randomUUID();
  sessionStorage.setItem(GOOGLE_REDIRECT_KEY, JSON.stringify({ state, nonce: nonce.raw, next }));
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(),
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce: nonce.hashed,
    state,
    prompt: 'select_account',
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

/** Untuk clientLoader: ambil user yang login, atau lempar redirect ke halaman masuk. */
export async function requireUser(request: Request) {
  const url = new URL(request.url);
  const next = url.pathname + url.search;
  if (!hasSupabase) throw redirect(loginPath(next));

  const { data } = await supabase().auth.getSession();
  if (!data.session) throw redirect(loginPath(next));
  return data.session.user;
}

export async function getOptionalUser() {
  if (!hasSupabase) return null;
  const { data } = await supabase().auth.getSession();
  return data.session?.user ?? null;
}

export async function requireAdmin(request: Request) {
  const user = await requireUser(request);
  if (!(await fetchIsAdmin())) throw redirect('/portal');
  return user;
}

/** Hanya izinkan redirect ke path internal (cegah open redirect lewat ?next=). */
/**
 * Hanya path internal. "//x" dan "/\x" ditolak karena browser membacanya sebagai
 * domain lain (open redirect).
 */
export function safeNext(next: string | null, fallback = '/portal') {
  return next && /^\/(?![/\\])/.test(next) ? next : fallback;
}

export function displayName(profile: ProfileRow | null, user: User | null) {
  return profile?.full_name || user?.email?.split('@')[0] || 'member';
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?'
  );
}

/** URL login sekali pakai untuk app lain (edge function app-handoff); null kalau gagal. */
export async function requestAppHandoff(app: string, returnTo: string | null) {
  const { data, error } = await supabase().functions.invoke<{ url: string }>('app-handoff', { body: { app, returnTo } });
  return error || !data?.url ? null : data.url;
}

/**
 * Sesi setelah redirect OAuth Supabase. Biasanya kode sudah ditukar otomatis
 * (detectSessionInUrl); kalau belum (client dibuat sebelum URL berisi code), tukar di sini.
 */
export async function sessionFromCallback(code: string | null) {
  const { data } = await supabase().auth.getSession();
  if (data.session || !code) return data.session;
  const exchanged = await supabase().auth.exchangeCodeForSession(code);
  return exchanged.data.session;
}
