import { useRef, useState } from 'react';
import { Link } from 'react-router';
import type { Route } from './+types/portal-profile';
import { PortalShell } from '~/components/PortalShell';
import { ProfileView } from '~/components/ProfileView';
import { fetchProfile, requireUser, useSignOut } from '~/lib/auth';
import { fetchMotivation, isOnboarded, missingOnboardingParts, missingProfileParts, publicProfilePath } from '~/lib/profile';

export const meta: Route.MetaFunction = () => [{ title: 'Profil — SWE Growth' }, { name: 'robots', content: 'noindex' }];

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const user = await requireUser(request);
  const [profile, motivation] = await Promise.all([fetchProfile(user.id), fetchMotivation(user.id)]);
  if (!profile) throw new Error('Profil tidak ditemukan.');
  return { profile, onboarded: isOnboarded(profile, motivation), required: missingOnboardingParts(profile, motivation) };
}

export default function PortalProfile({ loaderData: { profile, onboarded, required } }: Route.ComponentProps) {
  const { signOut, busy } = useSignOut();
  const missing = missingProfileParts(profile);
  const publicPath = publicProfilePath(profile);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const linkRef = useRef<HTMLElement>(null);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${publicPath}`);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      // Clipboard ditolak (izin/konteks tidak aman): pilih teks link supaya bisa disalin manual.
      const el = linkRef.current;
      if (el) window.getSelection()?.selectAllChildren(el);
      setCopyState('failed');
    }
  };

  return (
    <PortalShell title="Profil">
      <div className="portal-stack">
        {!onboarded && (
          <div className="panel complete-card">
            <div>
              <h2>Lengkapi profilmu dulu, yuk</h2>
              <p className="muted">
                Tinggal sedikit lagi. Setelah lengkap, kamu dapat link komunitas (WhatsApp, Telegram), bisa daftar kegiatan, dan profil
                publikmu aktif.
              </p>
              <p className="complete-missing">Yang belum: {required.join(', ')}.</p>
            </div>
            <Link className="btn btn-primary" to="/onboarding?next=/portal/profil">
              Lengkapi sekarang
            </Link>
          </div>
        )}

        {onboarded && missing.length > 0 && (
          <p className="form-message success">
            Tambahkan {missing.join(', ')} supaya profilmu makin lengkap.{' '}
            <Link className="text-link" to="/portal/profil/edit">
              Lengkapi
            </Link>
          </p>
        )}

        {onboarded && (
          <div className="panel">
            <div className="panel-head">
              <h2>Profil publik</h2>
            </div>
            <p className="muted mb-12">
              Siapa pun bisa melihat profilmu lewat link ini. Nomor WhatsApp, email, dan jawaban kenalan tidak ikut tampil.
            </p>
            <div className="share-link">
              <code ref={linkRef}>swegrowth.id{publicPath}</code>
              <button className="btn btn-ghost sm" type="button" onClick={copyLink}>
                {copyState === 'copied' ? 'Tersalin' : 'Salin link'}
              </button>
              <Link className="text-link" to={publicPath}>
                Lihat sebagai publik
              </Link>
            </div>
            <p className="share-status" aria-live="polite">
              {copyState === 'copied' && 'Link profil tersalin.'}
              {copyState === 'failed' && 'Tidak bisa menyalin otomatis. Link sudah dipilih, tekan Ctrl+C atau ⌘C.'}
            </p>
          </div>
        )}

        <ProfileView
          profile={profile}
          actions={
            <Link className="btn btn-primary sm" to={onboarded ? '/portal/profil/edit' : '/onboarding?next=/portal/profil'}>
              {onboarded ? 'Edit profil' : 'Lengkapi profil'}
            </Link>
          }
        />

        <div className="profile-signout">
          <button className="btn btn-ghost sm" type="button" disabled={busy} onClick={signOut}>
            {busy ? 'Keluar…' : 'Keluar dari akun'}
          </button>
        </div>
      </div>
    </PortalShell>
  );
}
