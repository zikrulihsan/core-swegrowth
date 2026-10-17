import { activityPath, getPublishedActivities, pastActivities, type Activity } from './activities';
import { PAST_ACTIVITIES } from './past-activities';
import { youtubeId } from './youtube';

/** Satu video di galeri rekaman: dari event di portal atau dari arsip lama. */
export type Recording = {
  key: string;
  title: string;
  videoId: string;
  /** ISO (event portal) atau "YYYY-MM-01" (arsip), untuk urutan dan tanggal. */
  date: string;
  /** Hanya arsip yang tanggalnya per bulan. */
  monthOnly: boolean;
  /** Halaman event kalau rekamannya dari portal. */
  eventPath: string | null;
};

export const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@segrowthid';

/** Event lalu yang punya youtube_url + arsip yang diberi link youtube, terbaru dulu. */
export function recordingsFrom(activities: Activity[]): Recording[] {
  const fromEvents = pastActivities(activities).flatMap((a) => {
    const videoId = youtubeId(a.youtube_url);
    return videoId && a.starts_at
      ? [{ key: a.id, title: a.title, videoId, date: a.starts_at, monthOnly: false, eventPath: activityPath(a) }]
      : [];
  });
  const fromArchive = PAST_ACTIVITIES.flatMap((a) => {
    const videoId = youtubeId(a.youtube);
    return videoId ? [{ key: `${a.month}-${a.title}`, title: a.title, videoId, date: `${a.month}-01`, monthOnly: true, eventPath: null }] : [];
  });
  // Video yang sama bisa tercatat di event dan arsip; simpan yang dari event.
  const seen = new Set<string>();
  return [...fromEvents, ...fromArchive]
    .filter((r) => !seen.has(r.videoId) && Boolean(seen.add(r.videoId)))
    .sort((x, y) => y.date.localeCompare(x.date));
}

export async function getRecordings() {
  return recordingsFrom(await getPublishedActivities());
}
