import { useEffect, useRef, useState, type ReactNode } from 'react';
import { data, Link, redirect } from 'react-router';
import type { Route } from './+types/event-qna-screen';
import {
  ArrowLeftIcon,
  ArrowUpRight,
  ChatIcon,
  CheckCircleIcon,
  ChevronsUpIcon,
  CopyIcon,
  ExpandIcon,
  EyeOffIcon,
  GearIcon,
  RefreshIcon,
  ThumbUpIcon,
  UserIcon,
} from '~/components/Icons';
import { getPublishedActivityBySlug } from '~/lib/activities';
import { requestRebuild } from '~/lib/admin-data';
import { fetchIsAdmin, requireUser } from '~/lib/auth';
import type { QnaStatus, QuestionStatus } from '~/lib/database.types';
import {
  applyStatus,
  avatarHue,
  groupQuestions,
  nextToPresent,
  qnaErrorMessage,
  qnaPath,
  screenQuestions,
  setQnaStatus,
  setQuestionStatus,
  type Question,
  type QuestionSort,
} from '~/lib/qna';
import { useQuestions } from '~/lib/use-questions';

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: `Present tanya jawab: ${loaderData?.activity.title ?? 'Kegiatan'} — SWE Growth` },
  { name: 'robots', content: 'noindex' },
];

/** Khusus admin; peserta diarahkan ke daftar pertanyaan biasa. */
export async function clientLoader({ request, params }: Route.ClientLoaderArgs) {
  await requireUser(request);
  const activity = await getPublishedActivityBySlug(params.slug);
  if (!activity) throw data(null, { status: 404 });
  if (!(await fetchIsAdmin())) throw redirect(qnaPath(activity));
  return { activity };
}

export function HydrateFallback() {
  return <div className="loading-block">Memuat tampilan present…</div>;
}

/** Kontrol & kursor disembunyikan setelah mouse diam selama ini, supaya layar bersih untuk audiens. */
const IDLE_MS = 2_500;
/** Kartu di layar (termasuk "pertanyaan terbaru"), muat satu layar 16:9. */
const CARD_COUNT = 4;
/** Ukuran layar (zoom isi), seperti "Screen size" di Slido; diingat per browser. */
const SCALE_KEY = 'swegrowth:qna-screen-scale';
const SCALE_MIN = 0.6;
const SCALE_MAX = 1.6;

function readScale() {
  try {
    const v = Number(localStorage.getItem(SCALE_KEY));
    return v >= SCALE_MIN && v <= SCALE_MAX ? v : 1;
  } catch {
    return 1;
  }
}

/**
 * Tampilan present untuk screen share/proyektor, khusus admin, seperti Present
 * mode di Slido: kartu pertanyaan (populer/terbaru) plus pertanyaan terbaru di
 * bawah. Seperti Highlight di Slido, admin menyorot satu pertanyaan (toggle):
 * pertanyaan itu naik ke paling atas dengan label "Sedang dibahas" dan warna
 * sorotan. Sorotan hanya tampilan di layar ini (tidak disimpan, peserta tidak
 * melihatnya).
 * Tidak real-time: daftar diperbarui lewat tombol Perbarui (R) atau setelah aksi.
 * Seperti Slido ada tombol kembali (kiri atas) dan dock (kiri bawah): perbarui,
 * pengaturan (salin link, buka/tutup Q&A peserta, halaman moderasi, ukuran
 * layar), dan layar penuh.
 * Shortcut keyboard:
 *   → / N  tandai terjawab lalu sorot pertanyaan berikutnya
 *   1–4    sorot/lepas kartu nomor itu
 *   0 / Esc lepas sorotan
 *   R      perbarui daftar
 *   F      layar penuh
 */
export default function EventQnaScreen({ loaderData: { activity: a } }: Route.ComponentProps) {
  const { questions, mutate, refresh, reload, refreshing } = useQuestions(a.id);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<QuestionSort>('popular');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [qnaStatus, setQnaStatusState] = useState<QnaStatus>(a.qna_status);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scale, setScale] = useState(readScale);
  const busy = useRef(false);
  const dock = useRef<HTMLDivElement>(null);

  const groups = groupQuestions(questions ?? []);
  // Yang disorot naik ke paling atas; yang sudah dijawab/disembunyikan otomatis lepas dari sorotan.
  const { current, list, latest } = screenQuestions(groups.open, sort, CARD_COUNT, currentId);
  /** Urutan nomor shortcut 1–4 = urutan kartu di layar. */
  const cards = [...(current ? [current] : []), ...list, ...(latest ? [latest] : [])];
  const upNext = nextToPresent(questions ?? [], current?.id ?? null);
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

  /** Ubah status satu pertanyaan: layar langsung berubah, lalu disimpan dan daftar dimuat ulang. */
  const setStatus = async (q: Question, status: QuestionStatus) => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    mutate((all) => applyStatus(all, q.id, status));
    try {
      const { error: dbError } = await setQuestionStatus(q.id, status);
      if (dbError) setError(qnaErrorMessage(dbError.message));
    } catch {
      setError(qnaErrorMessage(undefined));
    } finally {
      busy.current = false;
      void refresh();
    }
  };

  const changeScale = (delta: number) =>
    setScale((v) => {
      const next = Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, v + delta)) * 10) / 10;
      try {
        localStorage.setItem(SCALE_KEY, String(next));
      } catch {
        // Tanpa penyimpanan (mis. mode privat) ukuran tetap berlaku sampai halaman ditutup.
      }
      return next;
    });

  const copyJoinLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${qnaPath(a)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Link belum bisa disalin otomatis. Salin dari alamat di kanan atas.');
    }
  };

  /** Buka/tutup kesempatan peserta bertanya & vote (daftar tetap bisa dibaca saat ditutup). */
  const toggleAudienceQna = async () => {
    const next: QnaStatus = qnaStatus === 'open' ? 'closed' : 'open';
    setError(null);
    const { error: dbError } = await setQnaStatus(a.id, next);
    if (dbError) {
      setError(qnaErrorMessage(dbError.message));
      return;
    }
    setQnaStatusState(next);
    // Halaman event yang di-prerender ikut menampilkan status tanya jawab terbaru.
    void requestRebuild();
  };

  // Menu pengaturan tertutup saat klik di luar dock.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!dock.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  /** Seperti Slido: sorot = toggle; menyorot pertanyaan lain memindahkan sorotan. */
  const toggleHighlight = (q: Question) => setCurrentId((id) => (id === q.id ? null : q.id));
  const release = () => setCurrentId(null);
  /** Selesai membahas: sorotan pindah ke vote terbanyak berikutnya, yang tadi ditandai terjawab. */
  const next = () => {
    if (busy.current) return;
    setCurrentId(upNext?.id ?? null);
    if (current) void setStatus(current, 'answered');
  };

  // Dipasang ulang tiap render supaya shortcut selalu memakai kartu & sorotan terbaru.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Tombol yang ditahan tidak diulang-ulang (bisa melompati beberapa pertanyaan).
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.target instanceof HTMLSelectElement) return;
      const key = e.key.toLowerCase();
      if (menuOpen && key === 'escape') {
        setMenuOpen(false);
        return;
      }
      if (key === 'f') {
        e.preventDefault();
        void toggleFullscreen();
      } else if (key === 'r') {
        void reload();
      } else if (key === 'arrowright' || key === 'n') {
        e.preventDefault();
        next();
      } else if (key === 'escape' || key === '0') {
        release();
      } else if (/^[1-9]$/.test(key)) {
        const target = cards[Number(key) - 1];
        if (target) toggleHighlight(target);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const icons = (q: Question, n: number) => (
    <span className="qna-screen-icons">
      <IconButton
        label={q.id === current?.id ? `Lepas sorotan (${n})` : `Sorot (${n})`}
        pressed={q.id === current?.id}
        onClick={() => toggleHighlight(q)}
      >
        <ChevronsUpIcon />
      </IconButton>
      <IconButton label="Tandai terjawab" onClick={() => void setStatus(q, 'answered')}>
        <CheckCircleIcon />
      </IconButton>
      <IconButton label="Sembunyikan" onClick={() => void setStatus(q, 'hidden')}>
        <EyeOffIcon />
      </IconButton>
    </span>
  );

  return (
    <div className={`qna-screen ${active || menuOpen ? '' : 'idle'}`}>
      <Link className="qna-screen-back" to={qnaPath(a)} aria-label="Kembali ke halaman tanya jawab" title="Kembali">
        <ArrowLeftIcon />
      </Link>

      <div className="qna-screen-content" style={{ zoom: scale }}>
        <header className="qna-screen-head">
          <div className="qna-screen-title">
            <ChatIcon />
            <b>Tanya jawab</b>
            <span>
              {a.title}
              {qnaStatus !== 'open' ? ' · ditutup' : ''}
            </span>
          </div>
          <div className="qna-screen-tools">
            {qnaStatus === 'open' && (
              <span className="qna-screen-join">
                Kirim & vote di <b>{joinUrl}</b>
              </span>
            )}
            <select aria-label="Urutkan" value={sort} onChange={(e) => setSort(e.target.value as QuestionSort)}>
              <option value="popular">Populer</option>
              <option value="recent">Terbaru</option>
            </select>
            <span className="qna-screen-count" title="Pertanyaan belum dijawab">
              <ChatIcon /> {groups.open.length}
            </span>
          </div>
        </header>

        <main className="qna-screen-main">
          {questions === null ? (
            <p className="qna-screen-empty">Memuat pertanyaan…</p>
          ) : cards.length === 0 ? (
            <p className="qna-screen-empty">
              Belum ada pertanyaan.
              {qnaStatus === 'open' && (
                <>
                  {' '}
                  Kirim pertanyaanmu di <b>{joinUrl}</b>
                </>
              )}
            </p>
          ) : (
            <section className="qna-screen-cards" aria-live="polite">
              {current && (
                <Card key={current.id} q={current} highlighted>
                  {icons(current, 1)}
                </Card>
              )}
              {list.map((q) => (
                <Card key={q.id} q={q}>
                  {icons(q, cards.indexOf(q) + 1)}
                </Card>
              ))}
              {latest && (
                <>
                  <p className="qna-screen-divider">Pertanyaan terbaru</p>
                  <Card key={latest.id} q={latest}>
                    {icons(latest, cards.length)}
                  </Card>
                </>
              )}
            </section>
          )}
          {error && <p className="qna-screen-error">{error}</p>}
        </main>
      </div>

      <div className="qna-screen-dock" ref={dock}>
        {menuOpen && (
          <div className="qna-screen-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => void copyJoinLink()}>
              {copied ? 'Link tersalin ✓' : 'Salin link bergabung'}
              <CopyIcon />
            </button>
            <button type="button" role="menuitem" onClick={() => void toggleAudienceQna()}>
              {qnaStatus === 'open' ? 'Tutup Q&A peserta' : 'Buka Q&A peserta'}
              <ChatIcon />
            </button>
            <Link role="menuitem" to={qnaPath(a)} target="_blank">
              Halaman moderasi
              <ArrowUpRight />
            </Link>
            <Link role="menuitem" to={`/admin/event/${a.id}`} target="_blank">
              Editor event
              <ArrowUpRight />
            </Link>
            <div className="qna-screen-menu-size">
              <span>Ukuran layar</span>
              <button type="button" aria-label="Perkecil" disabled={scale <= SCALE_MIN} onClick={() => changeScale(-0.1)}>
                −
              </button>
              <b>{Math.round(scale * 100)}%</b>
              <button type="button" aria-label="Perbesar" disabled={scale >= SCALE_MAX} onClick={() => changeScale(0.1)}>
                +
              </button>
            </div>
            <p className="qna-screen-menu-help">
              Shortcut: → terjawab & sorot berikutnya · 1–{CARD_COUNT} sorot/lepas · Esc lepas · R perbarui · F layar penuh.{' '}
              {groups.answered.length} pertanyaan sudah terjawab.
            </p>
          </div>
        )}
        <div className="qna-screen-dock-bar">
          <button type="button" aria-label="Perbarui (R)" title="Perbarui (R)" disabled={refreshing} onClick={() => void reload()}>
            <RefreshIcon />
          </button>
          <button
            type="button"
            aria-label="Pengaturan"
            title="Pengaturan"
            aria-expanded={menuOpen}
            className={menuOpen ? 'on' : ''}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <GearIcon />
          </button>
          <button type="button" aria-label="Layar penuh (F)" title="Layar penuh (F)" onClick={() => void toggleFullscreen()}>
            <ExpandIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Kartu pertanyaan: penanya & vote di atas, pertanyaan di bawah. Ikon admin
 * sebaris dengan vote, tidak menutupi teks. Yang disorot diberi label
 * "Sedang dibahas" dan warna sorotan.
 */
function Card({ q, highlighted, children }: { q: Question; highlighted?: boolean; children?: ReactNode }) {
  const long = q.body.length > 160;
  return (
    <article className={`qna-card ${highlighted ? 'is-current' : ''} ${long ? 'long' : ''}`}>
      <div className="qna-card-head">
        <ScreenAvatar q={q} />
        <span className="qna-card-name">{author(q)}</span>
        {highlighted && <span className="qna-card-badge">Sedang dibahas</span>}
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
function IconButton({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`qna-screen-icon ${pressed ? 'on' : ''}`}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    >
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
