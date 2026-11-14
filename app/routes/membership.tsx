import { Link } from 'react-router';
import type { Route } from './+types/membership';
import { PortalShell } from '~/components/PortalShell';
import { MEMBER_BENEFITS } from '~/lib/site';

export const meta: Route.MetaFunction = () => [{ title: 'Membership — SWE Growth' }, { name: 'robots', content: 'noindex' }];

/**
 * Membership berbayar & badge verified belum dibuka (MEMBERSHIP_LIVE di site.ts).
 * Tabel memberships dan is_member() tetap ada untuk saat fitur ini dirilis.
 */
export default function Membership() {
  return (
    <PortalShell title="Membership">
      <div>
        <div className="panel on-teal coming-soon">
          <span className="chip yellow">Segera hadir</span>
          <h2 className="detail-title">Membership & verified member</h2>
          <p>
            Kami sedang menyiapkan membership untuk mendukung komunitas. Untuk sekarang, semua yang ada di portal bisa kamu pakai gratis.
          </p>
          {MEMBER_BENEFITS.length > 0 && (
            <>
              <p className="mt-14">Yang sedang disiapkan:</p>
              <ul className="plain-list">
                {MEMBER_BENEFITS.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </>
          )}
        </div>
        <Link className="back mt-18" to="/portal">
          ← Kembali ke portal
        </Link>
      </div>
    </PortalShell>
  );
}
