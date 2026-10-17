import { useSearchParams } from 'react-router';
import type { Route } from './+types/agenda';
import { AgendaList } from '~/components/AgendaList';
import { byEventDate, ExternalEventList } from '~/components/ExternalEventList';
import { PastEventList } from '~/components/PastEventList';
import { getCommunityGroups, getPublishedActivities, pastActivities, upcomingSessions } from '~/lib/activities';
import { PAST_ACTIVITIES } from '~/lib/past-activities';
import { getPublishedRecommendations } from '~/lib/recommendations';
import { pageMeta } from '~/lib/site';

const monthFmt = new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric' });

export const meta: Route.MetaFunction = () =>
  pageMeta('Agenda — SWE Growth', 'Agenda kegiatan komunitas SWE Growth. Daftar gratis dengan akun Google.');

const load = async () => {
  const [activities, groups, recommendations] = await Promise.all([
    getPublishedActivities(),
    getCommunityGroups(),
    getPublishedRecommendations(),
  ]);
  // Acara dari luar = rekomendasi kategori acara (yang sudah lewat tidak ikut tayang).
  const external = recommendations.filter((r) => r.category === 'acara').sort(byEventDate);
  return {
    activities: upcomingSessions(activities),
    past: pastActivities(activities),
    groups,
    external,
    // Penanda "segera"/"baru" dihitung di browser saja supaya HTML prerender tidak basi.
    now: typeof window !== 'undefined' ? Date.now() : null,
  };
};

/** Saat build: snapshot agenda untuk HTML prerender. */
export async function loader() {
  return load();
}

/** Di browser: selalu ambil agenda terbaru. */
export async function clientLoader() {
  return load();
}
clientLoader.hydrate = true as const;

/**
 * Tab waktu (?waktu=lalu untuk kegiatan lalu) dan filter penyelenggara
 * (?oleh=slug-subgrup) disimpan di URL supaya bisa dibagikan.
 */
export default function Agenda({ loaderData: { activities, past, groups, external, now } }: Route.ComponentProps) {
  const [params, setParams] = useSearchParams();
  const showPast = params.get('waktu') === 'lalu';
  const group = groups.find((g) => g.slug === params.get('oleh')) ?? null;
  // Hanya subgrup yang punya kegiatan di tab ini.
  const usedGroups = groups.filter(
    (g) => g.id === group?.id || (showPast ? past : activities).some((a) => a.organizer_group_id === g.id),
  );
  const byGroup = <T extends { organizer_group_id: string | null }>(list: T[]) =>
    group ? list.filter((a) => a.organizer_group_id === group.id) : list;
  const shown = byGroup(activities);
  const shownPast = byGroup(past);

  const update = (key: 'waktu' | 'oleh', value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  return (
    <section className="block">
      <div className="wrap narrow-wrap">
        <h1 className="page-title">Agenda</h1>
        <p className="muted" style={{ marginBottom: 28 }}>
          Kegiatan komunitas SWE Growth, termasuk yang diadakan subgrup seperti English Club. Pilih kegiatan untuk melihat
          detail dan mendaftar. Daftarnya gratis, cukup login dengan Google.
        </p>

        <nav className="agenda-time-tabs" aria-label="Waktu kegiatan">
          <button type="button" aria-pressed={!showPast} onClick={() => update('waktu', null)}>
            Akan datang <span>{activities.length}</span>
          </button>
          <button type="button" aria-pressed={showPast} onClick={() => update('waktu', 'lalu')}>
            Kegiatan lalu <span>{past.length}</span>
          </button>
        </nav>

        {usedGroups.length > 0 && (
          <nav className="rec-tabs" aria-label="Penyelenggara">
            <button type="button" aria-pressed={!group} onClick={() => update('oleh', null)}>Semua</button>
            {usedGroups.map((g) => (
              <button key={g.id} type="button" aria-pressed={group?.id === g.id} onClick={() => update('oleh', g.slug)}>{g.name}</button>
            ))}
          </nav>
        )}
        {group?.description && <p className="muted" style={{ marginBottom: 16 }}>{group.description}</p>}

        {showPast ? (
          <>
            {shownPast.length === 0 ? (
              <p className="muted">{group ? `Belum ada kegiatan ${group.name} yang sudah lewat.` : 'Belum ada kegiatan yang sudah lewat.'}</p>
            ) : (
              <div className="panel"><PastEventList activities={shownPast} groups={groups} /></div>
            )}
            {!group && <PastArchive />}
          </>
        ) : shown.length === 0 ? (
          <p className="muted">
            {group ? `Belum ada kegiatan ${group.name} terjadwal.` : 'Belum ada kegiatan terjadwal.'}
            {shownPast.length > 0 && (
              <>
                {' '}
                <button type="button" className="link-btn" onClick={() => update('waktu', 'lalu')}>Lihat kegiatan lalu</button>.
              </>
            )}
          </p>
        ) : (
          <div className="panel"><AgendaList activities={shown} groups={groups} now={now} /></div>
        )}

        {/* Acara pihak lain tidak punya subgrup, jadi hanya tampil tanpa filter penyelenggara. */}
        {!showPast && !group && <ExternalEventList events={external} now={now} />}
      </div>
    </section>
  );
}

/** Arsip kegiatan sebelum agenda pindah ke portal (data statis). */
function PastArchive() {
  return (
    <details className="past-activities">
      <summary>Arsip sebelum portal ({PAST_ACTIVITIES.length}+ kegiatan sejak 2024)</summary>
      <ul>
        {PAST_ACTIVITIES.map((a) => (
          <li key={`${a.month}-${a.title}`}>
            <time>{monthFmt.format(new Date(`${a.month}-01T00:00:00`))}</time>
            <span>
              {a.title}
              {a.youtube && <> · <a href={a.youtube} target="_blank" rel="noreferrer">tonton rekaman</a></>}
            </span>
          </li>
        ))}
      </ul>
      <p>
        Dirangkum dari arsip media SWE Growth:{' '}
        <a href="https://x.com/swegrowthid" target="_blank" rel="noreferrer">X</a> dan{' '}
        <a href="https://www.youtube.com/@segrowthid" target="_blank" rel="noreferrer">YouTube</a>.
      </p>
    </details>
  );
}
