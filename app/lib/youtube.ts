/**
 * Rekaman di channel YouTube SWE Growth. Admin cukup menempel link apa pun
 * (youtu.be, watch?v=, /live/, /shorts/, /embed/); yang disimpan tetap link aslinya.
 */
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
