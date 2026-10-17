import { Link } from 'react-router';
import type { Route } from './+types/recordings';
import { RecordingGrid } from '~/components/RecordingGrid';
import { getRecordings, YOUTUBE_CHANNEL_URL } from '~/lib/recordings';
import { pageMeta } from '~/lib/site';

export const meta: Route.MetaFunction = () =>
  pageMeta('Rekaman — SWE Growth', 'Rekaman sesi komunitas SWE Growth yang sudah lewat: talks, diskusi, dan kelas.');

/** Saat build: snapshot untuk HTML prerender. */
export async function loader() {
  return { recordings: await getRecordings() };
}

/** Di browser: selalu ambil yang terbaru. */
export async function clientLoader() {
  return { recordings: await getRecordings() };
}
clientLoader.hydrate = true as const;

export default function Recordings({ loaderData: { recordings } }: Route.ComponentProps) {
  return (
    <section className="block">
      <div className="wrap narrow-wrap">
        <h1 className="page-title">Rekaman</h1>
        <p className="muted" style={{ marginBottom: 28 }}>
          Nonton lagi sesi komunitas yang sudah lewat. Semua video juga ada di{' '}
          <a className="text-link" href={YOUTUBE_CHANNEL_URL} target="_blank" rel="noopener">channel YouTube SWE Growth</a>.
        </p>
        {recordings.length > 0 ? (
          <RecordingGrid recordings={recordings} />
        ) : (
          <p className="muted">
            Belum ada rekaman di sini. Lihat <Link className="text-link" to="/agenda">agenda</Link> untuk sesi berikutnya.
          </p>
        )}
      </div>
    </section>
  );
}
