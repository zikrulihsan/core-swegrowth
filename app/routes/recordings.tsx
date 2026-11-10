import { Link } from 'react-router';
import type { Route } from './+types/recordings';
import { RecordingGrid } from '~/components/RecordingGrid';
import { getRecordings, YOUTUBE_CHANNEL_URL } from '~/lib/recordings';
import { pageMeta } from '~/lib/site';

export const meta: Route.MetaFunction = () =>
  pageMeta('Rekaman — SWE Growth', 'Rekaman sesi komunitas SWE Growth yang sudah lewat: talks, diskusi, dan kelas.');

/** Saat build: snapshot untuk HTML prerender. */
export async function loader() {
  return { ...(await getRecordings()), live: false };
}

/** Di browser: selalu ambil yang terbaru. */
export async function clientLoader() {
  return { ...(await getRecordings()), live: true };
}
clientLoader.hydrate = true as const;

/**
 * Daftar kosong baru disebut "belum ada" kalau feed YouTube berhasil dibaca.
 * Snapshot build yang gagal ambil feed tampil "memuat" sampai data browser masuk.
 */
export default function Recordings({ loaderData: { recordings, channelOk, live } }: Route.ComponentProps) {
  const feed = channelOk ? null : live ? 'failed' : 'loading';
  return (
    <section className="block">
      <div className="wrap narrow-wrap">
        <h1 className="page-title">Rekaman</h1>
        <p className="muted mb-28">
          Nonton lagi sesi komunitas yang sudah lewat. Semua video juga ada di{' '}
          <a className="text-link" href={YOUTUBE_CHANNEL_URL} target="_blank" rel="noopener">
            channel YouTube SWE Growth
          </a>
          .
        </p>
        {recordings.length > 0 && <RecordingGrid recordings={recordings} />}
        {feed === 'loading' && recordings.length === 0 && <div className="loading-block">Memuat rekaman…</div>}
        {feed === 'failed' && (
          <p className="muted">
            Video terbaru dari YouTube belum berhasil dimuat.{' '}
            <a className="text-link" href={YOUTUBE_CHANNEL_URL} target="_blank" rel="noopener">
              Buka channel-nya
            </a>{' '}
            atau muat ulang halaman ini.
          </p>
        )}
        {channelOk && recordings.length === 0 && (
          <p className="muted">
            Belum ada rekaman di sini. Lihat{' '}
            <Link className="text-link" to="/agenda">
              agenda
            </Link>{' '}
            untuk sesi berikutnya.
          </p>
        )}
      </div>
    </section>
  );
}
