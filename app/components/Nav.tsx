import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { useAuth } from '~/lib/auth';
import { AccountMenu } from './AccountMenu';

type NavLinkItem = { to: string; label: string };
type NavItem = NavLinkItem | { label: string; items: (NavLinkItem & { hint: string })[] };

export function Nav() {
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const { loading, user, isAdmin } = useAuth();
  const [subOpen, setSubOpen] = useState<string | null>(null);
  // Rekomendasi sementara tidak di menu (halamannya tetap ada, ditautkan dari beranda dan footer).
  const links: NavItem[] = [
    {
      label: 'Kegiatan',
      items: [
        { to: '/agenda', label: 'Agenda', hint: 'Sesi yang akan datang' },
        { to: '/rekaman', label: 'Rekaman', hint: 'Nonton lagi sesi yang sudah lewat' },
      ],
    },
    ...(user ? [{ to: '/portal', label: 'Portal' }] : []),
    { to: '/tentang', label: 'Tentang' },
    { to: '/code-of-conduct', label: 'Code of Conduct' },
    ...(isAdmin ? [{ to: '/admin', label: 'Admin' }] : []),
  ];

  useEffect(() => {
    setOpen(false);
    setSubOpen(null);
  }, [pathname]);

  useEffect(() => {
    if (!open && !subOpen) return;
    const close = () => {
      setOpen(false);
      setSubOpen(null);
    };
    const onClick = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, subOpen]);

  return (
    <nav className={`site-nav on-teal${open ? ' menu-open' : ''}`} ref={navRef}>
      <div className="wrap nav-in">
        <Link className="brand" to="/" aria-label="SWE Growth Community">
          <img className="brand-logo" src="/assets/swe-growth-logo.png" alt="SWE Growth Community" width="32" height="32" />
          <span className="b-name"><b>SWE Growth</b></span>
        </Link>
        <div className="nav-links" id="navLinks">
          {links.map((l) =>
            'items' in l ? (
              <div key={l.label} className={`nav-group${subOpen === l.label ? ' open' : ''}`}>
                <button
                  type="button"
                  className={`lk${l.items.some((i) => pathname.startsWith(i.to)) ? ' active' : ''}`}
                  aria-expanded={subOpen === l.label}
                  onClick={() => setSubOpen((v) => (v === l.label ? null : l.label))}
                >
                  {l.label}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                <div className="nav-sub">
                  {l.items.map((i) => (
                    <NavLink key={i.to} className="lk" to={i.to}>
                      {i.label}
                      <small>{i.hint}</small>
                    </NavLink>
                  ))}
                </div>
              </div>
            ) : (
              <NavLink key={l.to} className="lk" to={l.to}>{l.label}</NavLink>
            ),
          )}
        </div>
        <div className="nav-cta">
          {/* Saat prerender sesi belum diketahui: sisakan tempat supaya layout tidak lompat. */}
          {loading ? (
            <span className="nav-account-slot" aria-hidden="true" />
          ) : user ? (
            <AccountMenu />
          ) : (
            <>
              <Link className="btn btn-ghost nav-login" to="/masuk?next=/portal">Masuk</Link>
              <Link className="btn btn-primary" to="/masuk?next=/portal">Daftar</Link>
            </>
          )}
          <button
            type="button"
            className="nav-burger"
            aria-label={open ? 'Tutup menu' : 'Buka menu'}
            aria-expanded={open}
            aria-controls="navLinks"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
          >
            <svg className="ic-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            <svg className="ic-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      </div>
    </nav>
  );
}
