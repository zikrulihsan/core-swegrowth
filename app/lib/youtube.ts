/**
 * Rekaman di channel YouTube SWE Growth. Admin cukup menempel link apa pun
 * (youtu.be, watch?v=, /live/, /shorts/, /embed/); yang disimpan tetap link aslinya.
 */
import { SITE_URL } from './site';

const ID = /^[\w-]{11}$/;

export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [kind, value] = u.pathname.slice(1).split('/');
    id = kind === 'watch' ? u.searchParams.get('v') : ['live', 'shorts', 'embed'].includes(kind) ? value : null;
  }
  return id && ID.test(id) ? id : null;
}

export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/** Pola untuk input admin dan constraint database (lihat migration youtube_recording). */
export const YOUTUBE_URL_PATTERN = 'https://(www\\.|m\\.)?(youtube\\.com|youtu\\.be)/.+';

/** Channel SWE Growth; bisa diganti lewat env VITE_YOUTUBE_CHANNEL_ID (Netlify). */
export const YOUTUBE_CHANNEL_ID = (import.meta.env.VITE_YOUTUBE_CHANNEL_ID as string | undefined) || 'UCf_Vj2VGiqAdHvqVfHVuU6A';
export const YOUTUBE_CHANNEL_URL = `https://www.youtube.com/channel/${YOUTUBE_CHANNEL_ID}`;
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;

export type ChannelVideo = { videoId: string; title: string; published: string };

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/** Feed Atom YouTube (maks. 15 video terbaru). Pakai regex supaya jalan juga saat prerender di Node. */
export function parseChannelFeed(xml: string): ChannelVideo[] {
  return xml
    .split('<entry>')
    .slice(1)
    .flatMap((entry) => {
      const videoId = entry.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1];
      const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1];
      const published = entry.match(/<published>([^<]+)<\/published>/)?.[1];
      return videoId && title && published ? [{ videoId, title: decode(title.trim()), published }] : [];
    });
}

async function fetchFeed(url: string): Promise<ChannelVideo[] | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return res.ok ? parseChannelFeed(await res.text()) : null;
  } catch {
    return null;
  }
}

/**
 * Video terbaru di channel; null kalau feed gagal diambil (beda dengan channel kosong).
 * Di browser lewat edge function /api/youtube-feed (CORS + cache). Saat build
 * langsung ke YouTube, yang sering menolak server build Netlify, jadi cadangannya
 * edge function di situs production.
 */
export async function getChannelVideos(): Promise<ChannelVideo[] | null> {
  // Di browser coba sekali lagi: edge function yang baru bangun kadang gagal di panggilan pertama.
  if (typeof window !== 'undefined') return (await fetchFeed('/api/youtube-feed')) ?? fetchFeed('/api/youtube-feed');
  return (await fetchFeed(FEED_URL)) ?? fetchFeed(`${SITE_URL}/api/youtube-feed`);
}
