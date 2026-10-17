import { Link } from 'react-router';
import { activityPath, organizerOf, recurrenceLabel, type Activity, type CommunityGroup } from '~/lib/activities';
import { formatWibDate, wibDayParts } from '~/lib/format';
import { youtubeId, youtubeThumb } from '~/lib/youtube';

/**
 * Kegiatan lalu: tiap baris membuka detail event; yang punya rekaman langsung
 * ke pemutarnya, yang punya foto ke galerinya. Thumbnail: foto pertama, atau
 * thumbnail video kalau belum ada foto.
 */
export function PastEventList({
  activities,
  groups = [],
  tagOf,
}: {
  activities: Activity[];
  groups?: CommunityGroup[];
  /** Label tambahan per event, mis. "kamu ikut" di portal. */
  tagOf?: (a: Activity) => string | null;
}) {
  return (
    <ul className="rows past-event-rows">
      {activities.map((a) => {
        const parts = a.starts_at ? wibDayParts(a.starts_at) : null;
        const organizer = organizerOf(a, groups);
        const photos = a.photos ?? [];
        const video = youtubeId(a.youtube_url);
        const href = video ? `${activityPath(a)}#rekaman` : photos.length > 0 ? `${activityPath(a)}#dokumentasi` : activityPath(a);
        const thumb = photos[0]?.url ?? (video && youtubeThumb(video));
        const tag = tagOf?.(a);
        return (
          <li key={a.id}>
            <span className="date-tile">
              {parts ? <><b>{parts.day}</b><span>{parts.month}</span></> : <span>—</span>}
            </span>
            <div className="row-main">
              <Link className="title" to={href}>{a.title}</Link>
              <span>
                {[
                  a.recurrence ? recurrenceLabel(a) : a.starts_at && formatWibDate(a.starts_at),
                  organizer && `oleh ${organizer.name}`,
                  video ? 'ada rekaman' : null,
                  photos.length > 0 ? `${photos.length} foto` : null,
                  tag,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            {thumb && (
              <Link className={`past-event-thumb${video ? ' has-video' : ''}`} to={href} tabIndex={-1} aria-hidden="true">
                <img src={thumb} alt="" loading="lazy" />
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
