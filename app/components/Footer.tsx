import { Link } from 'react-router';
import { SOCIALS } from './Socials';

export function Footer() {
  return (
    <footer className="site-footer on-teal">
      <div className="wrap foot-in">
        <div className="foot-brand">
          <Link className="brand" to="/">
            <img className="brand-logo" src="/assets/swe-growth-logo.png" alt="SWE Growth Community" width="32" height="32" loading="lazy" />
            <span className="b-name"><b>SWE Growth</b></span>
          </Link>
          <div className="foot-note">Komunitas software engineer Indonesia. Bagian dari Ahsan Project.</div>
          <div className="foot-social">
            {SOCIALS.map((s) => (
              <a key={s.name} href={s.url} target="_blank" rel="noopener" aria-label={s.name}>{s.icon}</a>
            ))}
          </div>
        </div>
        <div className="foot-links">
          <Link to="/tentang">Tentang</Link>
          <Link to="/agenda">Agenda</Link>
          <Link to="/rekaman">Rekaman</Link>
          <Link to="/rekomendasi">Rekomendasi</Link>
          <Link to="/code-of-conduct">Code of Conduct</Link>
          <Link to="/privasi">Privasi</Link>
          <Link to="/term-of-service">Syarat Layanan</Link>
          <Link to="/masuk?next=/portal">Masuk</Link>
        </div>
      </div>
    </footer>
  );
}
