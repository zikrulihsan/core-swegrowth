import { useState } from 'react';
import { youtubeThumb } from '~/lib/youtube';

/**
 * Pemutar ringan: hanya thumbnail sampai diklik, baru iframe YouTube dimuat
 * (tanpa cookie). Halaman event tetap cepat dan tidak memuat skrip YouTube.
 */
export function YouTubeEmbed({ id, title }: { id: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="yt-embed">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} aria-label={`Putar rekaman: ${title}`}>
          <img src={youtubeThumb(id)} alt="" loading="lazy" />
          <span className="yt-play" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
