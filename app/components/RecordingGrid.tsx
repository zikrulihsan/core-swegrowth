import { Link } from 'react-router';
import { formatWibDate } from '~/lib/format';
import type { Recording } from '~/lib/recordings';
import { YouTubeEmbed } from './YouTubeEmbed';

const monthFmt = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' });

/** Galeri rekaman: tiap kartu bisa diputar di tempat, judul membuka halaman event kalau ada. */
export function RecordingGrid({ recordings }: { recordings: Recording[] }) {
  return (
    <ul className="recording-grid">
      {recordings.map((r) => (
        <li key={r.key}>
          <YouTubeEmbed id={r.videoId} title={r.title} />
          <h3>{r.eventPath ? <Link to={r.eventPath}>{r.title}</Link> : r.title}</h3>
          <time dateTime={r.date}>
            {r.monthOnly ? monthFmt.format(new Date(`${r.date}T00:00:00`)) : formatWibDate(r.date)}
          </time>
        </li>
      ))}
    </ul>
  );
}
