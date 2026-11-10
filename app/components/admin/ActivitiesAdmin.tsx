import { Link } from 'react-router';
import { ACTIVITY_STATUSES, activityStatusLabel, organizerOf, recurrenceLabel } from '~/lib/activities';
import { useMutation } from '~/lib/admin-form';
import type { ActivityStatus, CommunityGroupRow } from '~/lib/database.types';
import { formatWibDate, formatWibTime } from '~/lib/format';
import { requestRebuild, setActivityStatus, type AdminDashboard } from '~/lib/admin-data';

type Activities = AdminDashboard['activities'];
type RegistrationSummary = AdminDashboard['registrations'];

/** Daftar event + statistik singkat; edit lengkap di /admin/event/:id. */
export function ActivitiesAdmin({
  activities,
  registrations,
  groups,
}: {
  activities: Activities;
  registrations: RegistrationSummary;
  groups: CommunityGroupRow[];
}) {
  const { busy, run, flash } = useMutation();
  const countOf = (id: string, status: string) => registrations.filter((r) => r.activity_id === id && r.status === status).length;

  return (
    <div className="admin-stack">
      <div className="line admin-toolbar">
        <p className="form-sub m-0">Setiap event punya halaman publik /agenda/slug untuk dibagikan.</p>
        <Link className="btn btn-primary sm" to="/admin/event/baru">
          + Tambah event
        </Link>
      </div>
      {flash}
      <div className="panel">
        <h2>Event ({activities.length})</h2>
        {activities.length === 0 ? (
          <p className="form-sub">Belum ada event.</p>
        ) : (
          <ul className="admin-list">
            {activities.map((a) => {
              const confirmed = countOf(a.id, 'confirmed');
              const waitlisted = countOf(a.id, 'waitlisted');
              return (
                <li key={a.id}>
                  <div className="line">
                    <div>
                      <Link to={`/admin/event/${a.id}`}>
                        <strong>{a.title}</strong>
                      </Link>
                      <span className="slug">
                        {[
                          a.starts_at ? `${formatWibDate(a.starts_at)} ${formatWibTime(a.starts_at)}` : 'jadwal belum diisi',
                          recurrenceLabel(a)?.toLowerCase(),
                          organizerOf(a, groups) && `oleh ${organizerOf(a, groups)!.name}`,
                          (a.photos ?? []).length > 0 && `${a.photos.length} foto`,
                          a.price_idr > 0 ? `Rp${a.price_idr.toLocaleString('id-ID')}` : 'gratis',
                          !a.is_public && 'disembunyikan',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <span className="slug">
                        {confirmed} terdaftar{a.capacity ? ` / ${a.capacity} kursi` : ''}
                        {waitlisted ? ` · ${waitlisted} waitlist` : ''}
                      </span>
                    </div>
                    <div className="inline-actions">
                      <select
                        aria-label={`Status ${a.title}`}
                        value={a.status}
                        disabled={busy}
                        onChange={(e) =>
                          void run(() => setActivityStatus(a.id, e.target.value as ActivityStatus), `Status "${a.title}" diperbarui.`).then(
                            (ok) => {
                              if (ok) void requestRebuild();
                            },
                          )
                        }
                      >
                        {ACTIVITY_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {activityStatusLabel[st]}
                          </option>
                        ))}
                      </select>
                      <Link className="btn btn-ghost sm" to={`/admin/event/${a.id}`}>
                        Edit
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
