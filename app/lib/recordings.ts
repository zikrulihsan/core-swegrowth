import { activityPath, getPublishedActivities, pastActivities, type Activity } from './activities';
import { PAST_ACTIVITIES } from './past-activities';
import { getChannelVideos, youtubeId, type ChannelVideo } from './youtube';

/** Satu video di galeri rekaman: dari event di portal atau dari arsip lama. */
export type Recording = {
  key: string;
  title: string;
  videoId: string;
  /** ISO (event portal) atau "YYYY-MM-01" (arsip), untuk urutan dan tanggal. */
  date: string;
  /** Hanya arsip lama yang tanggalnya per bulan. */
  monthOnly: boolean;
  /** Halaman event kalau rekamannya dari portal. */
  eventPath: string | null;
};

export { YOUTUBE_CHANNEL_URL } from './youtube';

/**
 * Video terbaru di channel YouTube + event lalu yang punya youtube_url + arsip
 * yang diberi link youtube, terbaru dulu. Video yang terhubung ke event
 * memakai judul event dan menautkan ke halamannya.
 */
export function recordingsFrom(activities: Activity[], channel: ChannelVideo[] = []): Recording[] {
  const fromEvents = pastActivities(activities).flatMap((a) => {
    const videoId = youtubeId(a.youtube_url);
    return videoId && a.starts_at
      ? [{ key: a.id, title: a.title, videoId, date: a.starts_at, monthOnly: false, eventPath: activityPath(a) }]
      : [];
  });
  const fromArchive = PAST_ACTIVITIES.flatMap((a) => {
    const videoId = youtubeId(a.youtube);
    return videoId
      ? [{ key: `${a.month}-${a.title}`, title: a.title, videoId, date: `${a.month}-01`, monthOnly: true, eventPath: null }]
      : [];
  });
  const fromChannel = channel.map((v) => ({
    key: v.videoId,
    title: v.title,
    videoId: v.videoId,
    date: v.published,
    monthOnly: false,
    eventPath: null,
  }));
  // Video yang sama bisa tercatat di event, arsip, dan channel; simpan yang dari event.
  const seen = new Set<string>();
  return [...fromEvents, ...fromArchive, ...fromChannel]
    .filter((r) => !seen.has(r.videoId) && Boolean(seen.add(r.videoId)))
    .sort((x, y) => y.date.localeCompare(x.date));
}

/** `channelOk` false = feed YouTube gagal diambil, jadi daftarnya belum lengkap. */
export async function getRecordings() {
  const [activities, channel] = await Promise.all([getPublishedActivities(), getChannelVideos()]);
  return { recordings: recordingsFrom(activities, channel ?? []), channelOk: channel !== null };
}
