import { Link } from 'react-router';
import type { Route } from './+types/my-activities';
import { PortalShell, type PortalSection } from '~/components/PortalShell';
import { fetchMyRegistrationStatuses, getPublishedActivities, timeRange, type Activity } from '~/lib/activities';
import { requireUser } from '~/lib/auth';
import { formatWibDate, wibDayParts } from '~/lib/format';
import { feedbackOpen, fetchMyFeedbackIds, myActivityPath, splitMyActivities, type MyActivity } from '~/lib/my-activities';
import { youtubeId } from '~/lib/youtube';

export const meta: Route.MetaFunction = () => [{ title: 'Kegiatanku — SWE Growth' }, { name: 'robots', content: 'noindex' }];

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const user = await requireUser(request);
  const [regs, activities, feedbackIds] = await Promise.all([
    fetchMyRegistrationStatuses(user.id),
    getPublishedActivities(),
    fetchMyFeedbackIds(user.id),
  ]);
  return { ...splitMyActivities(activities, regs), feedbackIds, now: Date.now() };
}

export function HydrateFallback() {
  return <div className="loading-block">Memuat kegiatanmu…</div>;
}

/** Semua kegiatan yang diikuti; tiap baris membuka rekap (ringkasan, rekaman, feedback). */
export default function MyActivities({ loaderData }: Route.ComponentProps) {
  const { upcoming, past, feedbackIds, now } = loaderData;
  const sections: PortalSection[] = [
    ...(upcoming.length > 0 ? [{ id: 'akan-datang', label: 'Akan datang' }] : []),
    ...(past.length > 0 ? [{ id: 'sudah-lewat', label: 'Sudah lewat' }] : []),
  ];

  return (
    <PortalShell
      title="Kegiatanku"
      intro="Kegiatan yang kamu daftar. Buka untuk melihat ringkasan, rekaman, dan memberi feedback."
      sections={sections}
    >
      <div className="portal-stack">
        {upcoming.length === 0 && past.length === 0 && (
          <div className="panel">
            <p className="muted">
              Kamu belum mendaftar kegiatan apa pun.{' '}
              <Link className="text-link" to="/agenda">
                Lihat agenda
              </Link>{' '}
              dan daftar kegiatan pertamamu.
            </p>
          </div>
        )}

        {upcoming.length > 0 && (
          <div className="panel" id="akan-datang">
            <div className="panel-head">
              <h2>Akan datang</h2>
            </div>
            <MyRows items={upcoming} chips={(m) => [m.status === 'waitlisted' ? 'waitlist' : 'terdaftar']} />
          </div>
        )}

        {past.length > 0 && (
          <div className="panel" id="sudah-lewat">
            <div className="panel-head">
              <h2>Sudah lewat</h2>
            </div>
            <MyRows
              items={past}
              chips={(m) => [
                ...(youtubeId(m.activity.youtube_url) ? ['rekaman'] : []),
                ...(m.status === 'confirmed' && feedbackOpen(m.activity, new Date(now))
                  ? [feedbackIds.includes(m.activity.id) ? 'feedback ✓' : 'beri feedback']
                  : []),
              ]}
            />
          </div>
        )}
      </div>
    </PortalShell>
  );
}

function MyRows({ items, chips }: { items: MyActivity[]; chips: (m: MyActivity) => string[] }) {
  return (
    <ul className="rows event-rows">
      {items.map((m) => (
        <li key={m.activity.id}>
          <DateTile activity={m.activity} />
          <div className="row-main">
            <Link className="title" to={myActivityPath(m.activity)}>
              {m.activity.title}
            </Link>
            <span>{m.activity.starts_at ? `${formatWibDate(m.activity.starts_at)}, ${timeRange(m.activity)}` : 'Jadwal menyusul'}</span>
          </div>
          <span className="my-chips">
            {chips(m).map((c) => (
              <span key={c} className={`chip ${c === 'beri feedback' ? 'yellow' : ''}`}>
                {c}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DateTile({ activity: a }: { activity: Activity }) {
  const parts = a.starts_at ? wibDayParts(a.starts_at) : null;
  return (
    <span className="date-tile">
      {parts ? (
        <>
          <b>{parts.day}</b>
          <span>{parts.month}</span>
        </>
      ) : (
        <span>TBA</span>
      )}
    </span>
  );
}
