import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { displayName, useAuth, useSignOut } from '~/lib/auth';
import { formatDate } from '~/lib/format';
import { memberSince } from '~/lib/profile';
import { MEMBERSHIP_LIVE } from '~/lib/site';
import { Avatar } from './Avatar';

/** Sub-menu di bawah menu aktif: lompat ke bagian halaman (`id`) atau ke halaman lain (`to`). */
export type PortalSection = { id: string; label: string } | { to: string; label: string };

const stroke = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

const ICONS = {
  home: (
    <svg {...stroke}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z" />
    </svg>
  ),
  activities: (
    <svg {...stroke}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16M9 15l2 2 4-4" />
    </svg>
  ),
  profile: (
    <svg {...stroke}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
    </svg>
  ),
  membership: (
    <svg {...stroke}>
      <path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </svg>
  ),
  admin: (
    <svg {...stroke}>
      <path d="M12 3 5 6v5.5c0 4.4 3 8 7 9.5 4-1.5 7-5.1 7-9.5V6z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  signout: (
    <svg {...stroke}>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M10 16l-4-4 4-4M6 12h10" />
    </svg>
  ),
};

/**
 * Kerangka semua halaman portal: menu samping (desktop) atau strip tab (HP),
 * lalu judul halaman dan isinya. `sections` = lompatan ke bagian di halaman
 * yang sedang dibuka, tampil di bawah menu aktif.
 */
export function PortalShell({
  title,
  intro,
  sections,
  children,
}: {
  title: ReactNode;
  intro?: ReactNode;
  sections?: PortalSection[];
  children: ReactNode;
}) {
  return (
    <section className="block portal-section">
      <div className="wrap portal-shell">
        <PortalSidebar sections={sections} />
        <div className="portal-main">
          <header className="portal-head">
            <h1 className="page-title">{title}</h1>
            {intro && <p className="muted">{intro}</p>}
          </header>
          {children}
        </div>
      </div>
    </section>
  );
}

function PortalSidebar({ sections }: { sections?: PortalSection[] }) {
  const { user, profile, membership, isMember, isAdmin } = useAuth();
  const { signOut, busy } = useSignOut();
  const { pathname, hash } = useLocation();
  const name = displayName(profile, user);

  const status = !MEMBERSHIP_LIVE ? (
    profile && memberSince(profile.created_at)
  ) : isMember ? (
    <span className="chip yellow">Verified{membership ? ` s/d ${formatDate(membership.active_until)}` : ''}</span>
  ) : (
    <Link className="text-link" to="/portal/membership">
      {membership ? 'Membership berakhir, perpanjang' : 'Jadi verified member'}
    </Link>
  );

  const items = [
    { to: '/portal', label: 'Beranda', icon: ICONS.home, end: true },
    { to: '/portal/kegiatan', label: 'Kegiatanku', icon: ICONS.activities, end: false },
    { to: '/portal/profil', label: 'Profil', icon: ICONS.profile, end: false },
    {
      to: '/portal/membership',
      label: 'Membership',
      icon: ICONS.membership,
      end: false,
      badge: !MEMBERSHIP_LIVE ? 'segera' : undefined,
    },
    ...(isAdmin ? [{ to: '/admin', label: 'Admin', icon: ICONS.admin, end: false }] : []),
  ];

  return (
    <aside className="portal-side on-teal">
      <div className="side-user">
        <Avatar name={name} src={profile?.avatar_url} size={44} />
        <div>
          <strong>{name}</strong>
          {status && <span className="side-status">{status}</span>}
        </div>
      </div>

      <nav className="side-nav" aria-label="Menu portal">
        <ul>
          {items.map((item) => {
            const active = item.end ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end} className="side-link">
                  <span className="side-ic">{item.icon}</span>
                  <span className="side-label">{item.label}</span>
                  {item.badge && <span className="side-badge">{item.badge}</span>}
                </NavLink>
                {active && sections && sections.length > 0 && (
                  <ul className="side-sub" aria-label={`Bagian ${item.label}`}>
                    {sections.map((s) =>
                      'to' in s ? (
                        <li key={s.to}>
                          <Link to={s.to}>{s.label} ↗</Link>
                        </li>
                      ) : (
                        <li key={s.id}>
                          <a href={`#${s.id}`} aria-current={hash === `#${s.id}` ? 'location' : undefined}>
                            {s.label}
                          </a>
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <button className="side-link side-signout" type="button" disabled={busy} onClick={signOut}>
        <span className="side-ic">{ICONS.signout}</span>
        <span className="side-label">{busy ? 'Keluar…' : 'Keluar'}</span>
      </button>
    </aside>
  );
}
