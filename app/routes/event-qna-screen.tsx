import { useCallback, useEffect, useRef, useState } from 'react';
import { data, Link } from 'react-router';
import type { Route } from './+types/event-qna-screen';
import { getPublishedActivityBySlug } from '~/lib/activities';
import {
  applyModeration,
  groupQuestions,
  moderateQuestion,
  nextToPresent,
  qnaErrorMessage,
  qnaPath,
  sortQuestions,
  type Moderation,
  type Question,
} from '~/lib/qna';
import { useQuestions } from '~/lib/use-questions';

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: `Layar tanya jawab: ${loaderData?.activity.title ?? 'Kegiatan'} — SWE Growth` },
  { name: 'robots', content: 'noindex' },
];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const activity = await getPublishedActivityBySlug(params.slug);
  if (!activity) throw data(null, { status: 404 });
  return { activity };
}

export function HydrateFallback() {
  return <div className="loading-block">Memuat layar tanya jawab…</div>;
}

/** Lebih sering dari halaman biasa supaya layar ikut berganti begitu moderator menyorot dari perangkat lain. */
const POLL_MS = 4_000;
/** Kontrol & kursor disembunyikan setelah mouse diam selama ini, supaya layar bersih untuk audiens. */
const IDLE_MS = 2_500;
const TOP_COUNT = 5;

/**
 * Mode layar untuk proyektor/screen share, seperti Present mode di Slido:
 * pertanyaan yang disorot tampil besar, kalau tidak ada tampil pertanyaan
 * teratas. Admin memoderasi langsung dari sini; tombolnya hanya muncul saat
 * mouse bergerak, dan ada shortcut keyboard:
 *   → / N  tandai terjawab lalu sorot pertanyaan berikutnya
 *   1–5    sorot pertanyaan nomor itu
 *   0 / Esc lepas sorotan
 *   F      layar penuh
 */
export default function EventQnaScreen({ loaderData: { activity: a } }: Route.ComponentProps) {
  const { questions, mutate, refresh, isAdmin } = useQuestions(a.id, POLL_MS);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const groups = groupQuestions(questions ?? []);
  const current = groups.highlighted;
  const top = sortQuestions(groups.open, 'popular').slice(0, TOP_COUNT);
  const upNext = nextToPresent(questions ?? []);
  const joinUrl = typeof window === 'undefined' ? qnaPath(a) : `${window.location.host}${qnaPath(a)}`;

  // Mouse diam → kontrol & kursor hilang.
  useEffect(() => {
    let timer = setTimeout(() => setActive(false), IDLE_MS);
    const wake = () => {
      setActive(true);
      clearTimeout(timer);
      timer = setTimeout(() => setActive(false), IDLE_MS);
    };
    window.addEventListener('mousemove', wake);
    window.addEventListener('touchstart', wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('touchstart', wake);
    };
  }, []);

  /**
   * Jalankan beberapa perubahan berurutan, satu aksi dalam satu waktu (tombol &
   * shortcut bisa beruntun). Layar langsung berubah; database menyusul.
   */
  const run = useCallback(
    async (steps: { q: Question; change: Moderation }[]) => {
      if (busy.current || steps.length === 0) return;
      busy.current = true;
      setError(null);
      mutate((list) => steps.reduce((acc, { q, change }) => applyModeration(acc, q.id, change), list));
      try {
        for (const { q, change } of steps) {
          const { error: dbError } = await moderateQuestion(q.id, change);
          if (dbError) {
            setError(qnaErrorMessage(dbError.message));
            break;
          }
        }
      } catch {
        setError(qnaErrorMessage(undefined));
      } finally {
        busy.current = false;
        // Buang hasil polling yang terambil di tengah langkah-langkah tadi, lalu
        // ambil ulang: data server selalu jadi patokan akhir (juga kalau ada yang gagal).
        mutate((list) => list);
        void refresh();
      }
    },
    [mutate, refresh],
  );

  const highlight = useCallback((q: Question) => run([{ q, change: { is_highlighted: true } }]), [run]);
  const release = useCallback(() => current && run([{ q: current, change: { is_highlighted: false } }]), [current, run]);
  /**
   * Selesai membahas: vote terbanyak berikutnya disorot, lalu yang tadi
   * ditandai terjawab. Urutan ini membuat layar mana pun yang memuat data di
   * tengah-tengah tetap menampilkan sorotan, tidak sempat kosong.
   */
  const next = useCallback(
    () =>
      run([
        ...(upNext ? [{ q: upNext, change: { is_highlighted: true } }] : []),
        ...(current ? [{ q: current, change: { status: 'answered' as const } }] : []),
      ]),
    [current, upNext, run],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Tombol yang ditahan tidak diulang-ulang (bisa melompati beberapa pertanyaan).
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const key = e.key.toLowerCase();
      if (key === 'f') {
        e.preventDefault();
        void toggleFullscreen();
        return;
      }
      if (!isAdmin) return;
      if (key === 'arrowright' || key === 'n') {
        e.preventDefault();
        void next();
      } else if (key === 'escape' || key === '0') {
        void release();
      } else if (/^[1-9]$/.test(key) && !current) {
        const target = top[Number(key) - 1];
        if (target) void highlight(target);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAdmin, next, release, highlight, current, top]);

  return (
    <div className={`qna-screen ${active ? '' : 'idle'}`}>
      <header className="qna-screen-head">
        <div>
          <span className="qna-screen-kicker">Tanya jawab{a.qna_status === 'closed' ? ' · ditutup' : ''}</span>
          <h1>{a.title}</h1>
        </div>
        {a.qna_status === 'open' && (
          <p className="qna-screen-join">
            Kirim & vote pertanyaan di
            <b>{joinUrl}</b>
          </p>
        )}
      </header>

      <main className="qna-screen-main">
        {a.qna_status === 'off' && !isAdmin ? (
          <p className="qna-screen-empty">Tanya jawab tidak dibuka untuk kegiatan ini.</p>
        ) : questions === null ? (
          <p className="qna-screen-empty">Memuat pertanyaan…</p>
        ) : current ? (
          <section className="qna-screen-focus" aria-live="polite" key={current.id}>
            <span className="qna-screen-label">Sedang dibahas</span>
            <p className={`qna-screen-text ${current.body.length > 220 ? 'long' : ''}`}>{current.body}</p>
            <p className="qna-screen-meta">
              {author(current)} · ▲ {current.votes} vote
            </p>
            {isAdmin && (
              <div className="qna-screen-actions">
                <button type="button" className="primary" onClick={next}>
                  {upNext ? 'Terjawab, lanjut berikutnya (→)' : 'Tandai terjawab (→)'}
                </button>
                <button type="button" onClick={release}>
                  Lepas sorotan (Esc)
                </button>
                <button type="button" onClick={() => run([{ q: current, change: { status: 'hidden' } }])}>
                  Sembunyikan
                </button>
              </div>
            )}
            {isAdmin && upNext && <p className="qna-screen-upnext">Berikutnya: {upNext.body}</p>}
          </section>
        ) : top.length === 0 ? (
          <p className="qna-screen-empty">
            Belum ada pertanyaan.
            {a.qna_status === 'open' && (
              <>
                {' '}
                Kirim pertanyaanmu di <b>{joinUrl}</b>
              </>
            )}
          </p>
        ) : (
          <section>
            <span className="qna-screen-label">Pertanyaan teratas</span>
            <ol className="qna-screen-list">
              {top.map((q, i) => (
                <li key={q.id}>
                  <span className="qna-screen-votes">
                    ▲ <b key={q.votes}>{q.votes}</b>
                  </span>
                  <div className="qna-screen-item">
                    <p>{q.body}</p>
                    {/* Tombol admin sebaris dengan nama penanya: tempatnya selalu ada, jadi tidak menutupi teks atau menggeser layout. */}
                    <div className="qna-screen-row">
                      <span className="qna-screen-author">{author(q)}</span>
                      {isAdmin && (
                        <div className="qna-screen-actions">
                          <button type="button" className="primary" onClick={() => highlight(q)}>
                            Sorot ({i + 1})
                          </button>
                          <button type="button" onClick={() => run([{ q, change: { status: 'answered' } }])}>
                            Terjawab
                          </button>
                          <button type="button" onClick={() => run([{ q, change: { status: 'hidden' } }])}>
                            Sembunyikan
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            {groups.open.length > top.length && <p className="qna-screen-more">+{groups.open.length - top.length} pertanyaan lainnya</p>}
          </section>
        )}
        {error && <p className="qna-screen-error">{error}</p>}
      </main>

      <footer className="qna-screen-bar">
        <Link to={qnaPath(a)}>← Keluar</Link>
        {isAdmin && (
          <span>
            → lanjut · 1–{TOP_COUNT} sorot · 0/Esc lepas · {groups.open.length} belum dijawab · {groups.answered.length} terjawab
          </span>
        )}
        <button type="button" onClick={() => void toggleFullscreen()}>
          Layar penuh (F)
        </button>
      </footer>
    </div>
  );
}

const author = (q: Question) => (q.is_anonymous ? 'Anonim' : (q.author_name ?? 'Peserta'));

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    // Browser menolak (mis. iframe); tidak apa-apa, tetap bisa dipakai tanpa layar penuh.
  }
}
