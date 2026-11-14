import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { data, Link } from 'react-router';
import type { Route } from './+types/event-qna-screen';
import { ChatIcon, Check, EyeOffIcon, StarIcon, ThumbUpIcon, UserIcon } from '~/components/Icons';
import { getPublishedActivityBySlug } from '~/lib/activities';
import {
  applyModeration,
  avatarHue,
  groupQuestions,
  moderateQuestion,
  nextToPresent,
  qnaErrorMessage,
  qnaPath,
  screenQuestions,
  type Moderation,
  type Question,
  type QuestionSort,
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
/** Kartu di layar (termasuk "pertanyaan terbaru"), muat satu layar 16:9. */
const CARD_COUNT = 4;

/**
 * Mode layar untuk proyektor/screen share, seperti Present mode di Slido:
 * kartu pertanyaan (populer/terbaru) plus pertanyaan terbaru di bawah; yang
 * disorot tampil besar. Admin memoderasi langsung dari sini lewat ikon di
 * kartu, tombol (muncul saat mouse bergerak), atau shortcut keyboard:
 *   → / N  tandai terjawab lalu sorot pertanyaan berikutnya
 *   1–4    sorot kartu nomor itu
 *   0 / Esc lepas sorotan
 *   F      layar penuh
 */
export default function EventQnaScreen({ loaderData: { activity: a } }: Route.ComponentProps) {
  const { questions, mutate, refresh, isAdmin } = useQuestions(a.id, POLL_MS);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<QuestionSort>('popular');
  const busy = useRef(false);

  const groups = groupQuestions(questions ?? []);
  const current = groups.highlighted;
  const { list, latest } = screenQuestions(groups.open, sort, CARD_COUNT);
  /** Urutan nomor shortcut 1–4 = urutan kartu di layar. */
  const cards = latest ? [...list, latest] : list;
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

  const highlight = (q: Question) => run([{ q, change: { is_highlighted: true } }]);
  const release = () => current && run([{ q: current, change: { is_highlighted: false } }]);
  /**
   * Selesai membahas: vote terbanyak berikutnya disorot, lalu yang tadi
   * ditandai terjawab. Urutan ini membuat layar mana pun yang memuat data di
   * tengah-tengah tetap menampilkan sorotan, tidak sempat kosong.
   */
  const next = () =>
    run([
      ...(upNext ? [{ q: upNext, change: { is_highlighted: true } }] : []),
      ...(current ? [{ q: current, change: { status: 'answered' as const } }] : []),
    ]);

  // Dipasang ulang tiap render supaya shortcut selalu memakai kartu & sorotan terbaru.
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
        const target = cards[Number(key) - 1];
        if (target) void highlight(target);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const icons = (q: Question, n: number) =>
    isAdmin && (
      <span className="qna-screen-icons">
        <IconButton label={`Sorot (${n})`} onClick={() => highlight(q)}>
          <StarIcon />
        </IconButton>
        <IconButton label="Tandai terjawab" onClick={() => run([{ q, change: { status: 'answered' } }])}>
          <Check />
        </IconButton>
        <IconButton label="Sembunyikan" onClick={() => run([{ q, change: { status: 'hidden' } }])}>
          <EyeOffIcon />
        </IconButton>
      </span>
    );

  return (
    <div className={`qna-screen ${active ? '' : 'idle'}`}>
      <header className="qna-screen-head">
        <div className="qna-screen-title">
          <ChatIcon />
          <b>Tanya jawab</b>
          <span>
            {a.title}
            {a.qna_status === 'closed' ? ' · ditutup' : ''}
          </span>
        </div>
        <div className="qna-screen-tools">
          {a.qna_status === 'open' && (
            <span className="qna-screen-join">
              Kirim & vote di <b>{joinUrl}</b>
            </span>
          )}
          {!current && (
            <select aria-label="Urutkan" value={sort} onChange={(e) => setSort(e.target.value as QuestionSort)}>
              <option value="popular">Populer</option>
              <option value="recent">Terbaru</option>
            </select>
          )}
          <span className="qna-screen-count" title="Pertanyaan belum dijawab">
            <ChatIcon /> {groups.open.length}
          </span>
        </div>
      </header>

      <main className="qna-screen-main">
        {a.qna_status === 'off' && !isAdmin ? (
          <p className="qna-screen-empty">Tanya jawab tidak dibuka untuk kegiatan ini.</p>
        ) : questions === null ? (
          <p className="qna-screen-empty">Memuat pertanyaan…</p>
        ) : current ? (
          <section className="qna-screen-focus" aria-live="polite" key={current.id}>
            <span className="qna-screen-label">Sedang dibahas</span>
            <Card q={current} big />
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
        ) : cards.length === 0 ? (
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
          <section className="qna-screen-cards">
            {list.map((q, i) => (
              <Card key={q.id} q={q}>
                {icons(q, i + 1)}
              </Card>
            ))}
            {latest && (
              <>
                <p className="qna-screen-divider">Pertanyaan terbaru</p>
                <Card key={latest.id} q={latest}>
                  {icons(latest, list.length + 1)}
                </Card>
              </>
            )}
          </section>
        )}
        {error && <p className="qna-screen-error">{error}</p>}
      </main>

      <footer className="qna-screen-bar">
        <Link to={qnaPath(a)}>← Keluar</Link>
        {isAdmin && (
          <span>
            → lanjut · 1–{CARD_COUNT} sorot · 0/Esc lepas · {groups.answered.length} terjawab
          </span>
        )}
        <button type="button" onClick={() => void toggleFullscreen()}>
          Layar penuh (F)
        </button>
      </footer>
    </div>
  );
}

/** Kartu pertanyaan: penanya & vote di atas, pertanyaan di bawah. Ikon admin sebaris dengan vote, tidak menutupi teks. */
function Card({ q, big, children }: { q: Question; big?: boolean; children?: ReactNode }) {
  const long = q.body.length > (big ? 220 : 160);
  return (
    <article className={`qna-card ${big ? 'big' : ''} ${long ? 'long' : ''}`}>
      <div className="qna-card-head">
        <ScreenAvatar q={q} />
        <span className="qna-card-name">{author(q)}</span>
        <span className="qna-card-side">
          {children}
          <span className="qna-card-votes">
            <b key={q.votes}>{q.votes}</b>
            <ThumbUpIcon />
          </span>
        </span>
      </div>
      <p className="qna-card-text">{q.body}</p>
    </article>
  );
}

function ScreenAvatar({ q }: { q: Question }) {
  if (q.is_anonymous) {
    return (
      <span className="qna-avatar anon" aria-hidden="true">
        <UserIcon />
      </span>
    );
  }
  const name = author(q);
  if (q.author_avatar_url) {
    return <img className="qna-avatar" src={q.author_avatar_url} alt="" referrerPolicy="no-referrer" />;
  }
  const hue = avatarHue(name);
  return (
    <span className="qna-avatar" aria-hidden="true" style={{ background: `hsl(${hue} 70% 93%)`, color: `hsl(${hue} 45% 35%)` }}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Tombol ikon kecil; labelnya jadi tooltip & teks untuk pembaca layar. */
function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="qna-screen-icon" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
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
