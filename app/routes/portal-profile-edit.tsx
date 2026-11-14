import { Link, useNavigate } from 'react-router';
import type { Route } from './+types/portal-profile-edit';
import { PortalShell } from '~/components/PortalShell';
import { ProfileForm } from '~/components/ProfileForm';
import { fetchProfile, requireUser, useAuth } from '~/lib/auth';

export const meta: Route.MetaFunction = () => [{ title: 'Edit profil — SWE Growth' }, { name: 'robots', content: 'noindex' }];

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const user = await requireUser(request);
  const profile = await fetchProfile(user.id);
  if (!profile) throw new Error('Profil tidak ditemukan.');
  return { profile, email: user.email ?? '' };
}

export default function PortalProfileEdit({ loaderData: { profile, email } }: Route.ComponentProps) {
  const { refreshProfile } = useAuth();
  const navigate = useNavigate();

  return (
    <PortalShell
      title="Edit profil"
      intro={<>Email akun: {email}. Profil tampil publik, kecuali nomor WhatsApp dan email yang hanya terlihat oleh kamu dan admin.</>}
    >
      <div>
        <Link className="back" to="/portal/profil">
          ← Kembali ke profil
        </Link>
        <ProfileForm
          profile={profile}
          submitLabel="Simpan profil"
          onSaved={async () => {
            await refreshProfile();
            navigate('/portal/profil');
          }}
        />
      </div>
    </PortalShell>
  );
}
