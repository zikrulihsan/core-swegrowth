import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { Await, data, Link } from 'react-router';
import type { Route } from './+types/event';
import { Avatar } from '~/components/Avatar';
import { GoogleSignIn } from '~/components/GoogleSignIn';
import { CalendarIcon, ClockIcon, PinIcon, RepeatIcon, UsersIcon } from '~/components/Icons';
import { PhotoGallery } from '~/components/PhotoGallery';
import { YouTubeEmbed } from '~/components/YouTubeEmbed';
import {
  activityPath,
  activityStatusLabel,
  canRegister,
  countdown,
  fetchMyRegistration,
  fetchPublicStats,
  getCommunityGroups,
  getPublishedActivityBySlug,
  isActiveRegistration,
  isActivityUpcoming,
  isPaid,
  nextSession,
  priceLabel,
  recurrenceLabel,
  registeredPath,
  registerPath,
  speakerPhoto,
  timeRange,
  type Activity,
  followActivity,
  isFollowing,
  organizerOf,
} from '~/lib/activities';
import { useAuth } from '~/lib/auth';
import type { RegistrationStatus } from '~/lib/database.types';
import { formatWibDate, formatWibDay, formatWibTime } from '~/lib/format';
import { qnaPath } from '~/lib/qna';
import { pageMeta } from '~/lib/site';
import { youtubeId } from '~/lib/youtube';

export const meta: Route.MetaFunction = ({ loaderData }) => {
  const a = loaderData?.activity;
  if (!a) return [{ title: 'Kegiatan tidak ditemukan — SWE Growth' }];
  const when = a.starts_at ? `${formatWibDate(a.starts_at)}, ${formatWibTime(a.starts_at)}. ` : '';
  return [
    ...pageMeta(`${a.title} — SWE Growth`, `${when}${a.summary || 'Kegiatan komunitas SWE Growth.'}`),
    ...(a.image_url ? [{ property: 'og:image', content: a.image_url }] : []),
  ];
};

/**
 * Detail event publik. Pendaftaran tiga langkah:
 * detail (tombol Daftar) → /daftar (form, terisi dari profil) → /terdaftar (konfirmasi).
 *
 * Kegiatan publik di-prerender saat build (lihat react-router.config.ts) supaya
 * isinya langsung tampil; di browser data selalu diambil ulang. Slug yang belum
 * ada saat build dilayani SPA fallback.
 */
const load = async (slug: string) => {
  // Subgrup diambil bersamaan (tabel kecil) supaya tidak menunggu id penyelenggara dulu.
  const [activity, groups] = await Promise.all([getPublishedActivityBySlug(slug), getCommunityGroups()]);
  if (!activity) throw data(null, { status: 404 });
  return { activity, organizer: organizerOf(activity, groups) };
};

/** Saat build: snapshot untuk HTML prerender. */
export async function loader({ params }: Route.LoaderArgs) {
  const loaded = await load(params.slug);
  return { ...loaded, stats: await fetchPublicStats(loaded.activity.id), now: Date.now() };
}

/** Di browser: halaman tampil begitu kegiatannya ada, kuota menyusul (butuh id kegiatan). */
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const loaded = await load(params.slug);
  return { ...loaded, stats: fetchPublicStats(loaded.activity.id), now: Date.now() };
}
clientLoader.hydrate = true as const;

type Stats = Awaited<ReturnType<typeof fetchPublicStats>>;
type StatsData = Stats | Promise<Stats>;

/** Tampilkan `children` dengan kuota; selama kuota belum ada pakai `fallback`. */
function WithStats({ stats, fallback, children }: { stats: StatsData; fallback: ReactNode; children: (stats: Stats) => ReactNode }) {
  return (
    <Suspense fallback={fallback}>
      <Await resolve={stats}>{children}</Await>
    </Suspense>
  );
}

const modeLabel = { online: 'Online', offline: 'Offline', hybrid: 'Hybrid' } as const;

/**
 * Susunan seperti poster: hero (judul → ringkasan → kapan & di mana → pembicara
 * → quick CTA) → "yang akan dibahas" → poster & deskripsi → bagian pendaftaran
 * lengkap di bawah. Quick CTA menggulir ke pendaftaran; tiap info tampil sekali.
 */
export default function EventPage({ loaderData: { activity: a, stats, organizer, now: loadedAt } }: Route.ComponentProps) {
  const place = [a.mode && modeLabel[a.mode], a.location].filter(Boolean).join(' · ');
  // Waktu ikut dari loader supaya hidrasi HTML prerender tidak berbeda isi.
  const now = new Date(loadedAt);
  // Jadwal sudah lewat dianggap selesai walau status belum diubah admin.
  const done = !isActivityUpcoming(a, now);
  const recordingId = youtubeId(a.youtube_url);
  const soon = done ? null : countdown(a, now);
  const my = useMine(a.id);

  return (
    <section className="event-page">
      <div className="wrap narrow-wrap">
        {/* Hero teal selebar layar (box-shadow + clip-path). */}
        <header className="event-hero on-teal">
          <Link className="back" to="/agenda">
            ← Agenda
          </Link>
          <div className="event-chips">
            <span className="chip yellow">{activityStatusLabel[done && a.status !== 'cancelled' ? 'completed' : a.status]}</span>
            <span className="chip price-chip">{priceLabel(a)}</span>
            {soon && <span className="chip price-chip">{soon}</span>}
          </div>
          <p className="event-organizer">
            Kegiatan komunitas SWE Growth
            {organizer && (
              <>
                {' '}
                · diadakan <Link to={`/agenda?oleh=${organizer.slug}`}>{organizer.name}</Link>
              </>
            )}
          </p>
          <h1 className="event-title">{a.title}</h1>
          {a.summary && <p className="event-summary-text">{a.summary}</p>}
          <EventMeta activity={a} place={place} now={now} />
          {a.speaker && <HeroSpeaker activity={a} />}
          {!done && (
            <WithStats stats={stats} fallback={<div className="quick-cta" aria-hidden="true" />}>
              {(s) => <QuickCta activity={a} stats={s} my={my} />}
            </WithStats>
          )}
        </header>

        <div className="event-main">
          {/* Rekaman paling atas: yang membuka event lalu biasanya mencari ini. */}
          {recordingId && (
            <section className="event-section" id="rekaman">
              <h2>Rekaman</h2>
              <YouTubeEmbed id={recordingId} title={a.title} />
              <p className="muted">
                <a href={a.youtube_url!} target="_blank" rel="noreferrer">
                  Tonton di YouTube
                </a>
              </p>
            </section>
          )}

          {a.qna_status !== 'off' && (
            <section className="event-section event-qna-cta">
              <div>
                <h2>Tanya jawab</h2>
                <p className="muted">
                  {a.qna_status === 'open'
                    ? 'Kirim pertanyaan untuk pembicara dan vote pertanyaan yang paling ingin kamu dengar jawabannya.'
                    : 'Lihat pertanyaan peserta dan mana saja yang sudah dijawab.'}
                </p>
              </div>
              <Link className="btn btn-ghost" to={qnaPath(a)}>
                {a.qna_status === 'open' ? 'Ajukan pertanyaan' : 'Lihat pertanyaan'}
              </Link>
            </section>
          )}

          {(a.highlights ?? []).length > 0 && (
            <section className="event-section highlights">
              <h2>Yang akan dibahas</h2>
              <ul>
                {a.highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </section>
          )}

          {a.image_url && <img className="event-poster" src={a.image_url} alt={`Poster ${a.title}`} />}

          {a.description && (
            <section className="event-section">
              <h2>Tentang acara</h2>
              <div className="prose">
                {a.description.split(/\n{2,}/).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </section>
          )}

          {(a.photos ?? []).length > 0 && (
            <section className="event-section" id="dokumentasi">
              <h2>Dokumentasi</h2>
              <PhotoGallery photos={a.photos} title={a.title} />
            </section>
          )}
        </div>

        {/* Pendaftaran lengkap: ringkasan di kiri, kartu aksi di kanan. */}
        <section className="event-register" id="daftar">
          <div className="event-register-recap">
            <h2>{isActiveRegistration(my.mine?.status) ? 'Pendaftaranmu' : done ? 'Pendaftaran' : 'Daftar acara ini'}</h2>
            <p className="event-register-title">{a.title}</p>
            <EventMeta activity={a} place={place} now={now} plain />
            {a.speaker && (
              <p className="muted">
                Bersama <b>{a.speaker}</b>
                {a.speaker_title ? `, ${a.speaker_title}` : ''}
              </p>
            )}
          </div>
          <RegisterCard activity={a} stats={stats} my={my} done={done} />
        </section>
      </div>
    </section>
  );
}

function EventMeta({ activity: a, place, now, plain }: { activity: Activity; place: string; now: Date; plain?: boolean }) {
  return (
    <ul className={plain ? 'event-meta plain' : 'event-meta'}>
      <MetaItem icon={<CalendarIcon />}>
        {a.recurrence && nextSession(a, now) && <span className="meta-prefix">Sesi berikutnya </span>}
        <b>{a.starts_at ? formatWibDay(a.starts_at) : 'Tanggal menyusul'}</b>
      </MetaItem>
      {a.starts_at && <MetaItem icon={<ClockIcon />}>{timeRange(a)}</MetaItem>}
      {recurrenceLabel(a) && <MetaItem icon={<RepeatIcon />}>{recurrenceLabel(a)}</MetaItem>}
      {place && <MetaItem icon={<PinIcon />}>{place}</MetaItem>}
    </ul>
  );
}

type Mine = { status: RegistrationStatus | null; following: boolean };
type My = ReturnType<typeof useMine>;

/** Status pendaftaran akun yang login, dipakai quick CTA & kartu daftar. */
function useMine(activityId: string) {
  const { loading, user } = useAuth();
  const [mine, setMine] = useState<Mine | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void Promise.all([fetchMyRegistration(activityId, user.id), isFollowing(activityId, user.id)]).then(([reg, following]) => {
      if (!cancelled) setMine({ status: reg?.status ?? null, following });
    });
    return () => {
      cancelled = true;
    };
  }, [activityId, user]);

  const current = user ? mine : null;
  return { user, mine: current, setMine, ready: !loading && (!user || current !== null) };
}

const scrollToRegister = () => document.getElementById('daftar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

/** Ringkasan sosial singkat di sebelah quick CTA. */
function socialProof(a: Activity, stats: Stats) {
  if (a.capacity) {
    const left = Math.max(a.capacity - stats.confirmed, 0);
    return left > 0 ? `sisa ${left} dari ${a.capacity} kursi` : 'kuota penuh, waitlist dibuka';
  }
  return stats.confirmed > 0 ? `${stats.confirmed} orang sudah terdaftar` : null;
}

/** Tombol cepat di hero: sudah terdaftar → langsung ke pendaftaranku; selain itu gulir ke bagian daftar. */
function QuickCta({ activity: a, stats, my }: { activity: Activity; stats: Stats; my: My }) {
  if (!my.ready) return <div className="quick-cta" aria-hidden="true" />;

  if (isActiveRegistration(my.mine?.status)) {
    return (
      <div className="quick-cta">
        <Link className="btn btn-primary" to={registeredPath(a)}>
          Lihat pendaftaranku
        </Link>
        <span>✓ {my.mine!.status === 'confirmed' ? 'Kamu sudah terdaftar' : 'Kamu ada di waitlist'}</span>
      </div>
    );
  }

  const label =
    a.status === 'coming_soon'
      ? my.mine?.following
        ? 'Kamu akan dikabari'
        : 'Ingatkan aku ↓'
      : canRegister(a) && !isPaid(a)
        ? a.status === 'full'
          ? 'Daftar waitlist ↓'
          : 'Daftar sekarang ↓'
        : 'Lihat pendaftaran ↓';
  const proof = [priceLabel(a), canRegister(a) && socialProof(a, stats)].filter(Boolean).join(' · ');

  return (
    <div className="quick-cta">
      <button className="btn btn-primary" type="button" onClick={scrollToRegister}>
        {label}
      </button>
      {proof && <span>{proof}</span>}
    </div>
  );
}

function MetaItem({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li>
      <span className="meta-icon" aria-hidden="true">
        {icon}
      </span>
      {children}
    </li>
  );
}

/** Pembicara di hero — nama kuning seperti di poster kegiatan. */
function HeroSpeaker({ activity: a }: { activity: Activity }) {
  return (
    <div className="hero-speaker">
      <Avatar name={a.speaker!} src={speakerPhoto(a)} size={52} />
      <div>
        <span className="hero-speaker-label">Bersama</span>
        <strong>{a.speaker}</strong>
        {(a.speaker_title || a.speaker_linkedin_url) && (
          <span className="hero-speaker-role">
            {a.speaker_title}
            {a.speaker_linkedin_url && (
              <a href={a.speaker_linkedin_url} target="_blank" rel="noopener noreferrer">
                LinkedIn ↗
              </a>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Kuota: bar terisi kalau ada kapasitas, kalau tidak cukup jumlah pendaftar.
 * Satu nilai saja (bukan chart), jadi tanpa legenda; angkanya selalu tertulis.
 */
function Seats({ activity: a, stats }: { activity: Activity; stats: Stats }) {
  if (a.capacity) {
    const filled = Math.min(stats.confirmed, a.capacity);
    const left = a.capacity - filled;
    return (
      <div className="seats">
        <div className="seats-line">
          <span>
            <b>{filled}</b> dari {a.capacity} kursi terisi
          </span>
          <span className="muted">{left > 0 ? `sisa ${left}` : 'penuh'}</span>
        </div>
        <div
          className="seats-track"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={a.capacity}
          aria-valuenow={filled}
          aria-label="Kursi terisi"
        >
          <span style={{ width: `${(filled / a.capacity) * 100}%` }} />
        </div>
        {stats.waitlisted > 0 && <p className="seats-note">{stats.waitlisted} orang di waitlist</p>}
      </div>
    );
  }
  if (stats.confirmed === 0) return null;
  return (
    <p className="seats seats-count">
      <span className="meta-icon" aria-hidden="true">
        <UsersIcon />
      </span>
      <span>
        <b>{stats.confirmed}</b> orang sudah terdaftar
      </span>
    </p>
  );
}

/** Kartu daftar: harga → kuota → satu aksi → keterangan singkat → bagikan. */
function RegisterCard({ activity: a, stats, my, done }: { activity: Activity; stats: StatsData; my: My; done: boolean }) {
  const { user, mine, setMine } = my;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /** Tombol Google untuk tamu; setelah login lanjut ke `next`. */
  const guestLogin = (next: string) => <GoogleSignIn next={next} text="signup_with" onError={setError} />;

  const follow = async () => {
    setBusy(true);
    const { error: rpcError } = await followActivity(a.id);
    setBusy(false);
    if (rpcError) setError('Belum berhasil. Coba lagi sebentar lagi.');
    else setMine((m) => ({ status: m?.status ?? null, following: true }));
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}${activityPath(a)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const action = (() => {
    if (done) {
      return (
        <>
          <p className="register-state">{a.status === 'cancelled' ? 'Kegiatan dibatalkan' : 'Kegiatan sudah selesai'}</p>
          {isActiveRegistration(mine?.status) ? (
            <Link className="btn btn-ghost btn-block" to={registeredPath(a)}>
              Lihat pendaftaranku
            </Link>
          ) : (
            <Link className="btn btn-ghost btn-block" to="/agenda">
              Lihat agenda berikutnya
            </Link>
          )}
        </>
      );
    }
    if (!my.ready) return <p className="muted">Memuat…</p>;

    if (isActiveRegistration(mine?.status)) {
      return (
        <>
          <p className="register-state ok">✓ {mine!.status === 'confirmed' ? 'Kamu sudah terdaftar' : 'Kamu ada di waitlist'}</p>
          <Link className="btn btn-primary btn-block" to={registeredPath(a)}>
            Lihat detail pendaftaran
          </Link>
        </>
      );
    }

    if (a.status === 'coming_soon') {
      if (mine?.following) return <p className="register-state ok">✓ Kamu akan dikabari saat pendaftaran dibuka</p>;
      return (
        <>
          {user ? (
            <button className="btn btn-primary btn-block" type="button" disabled={busy} onClick={follow}>
              Ingatkan aku
            </button>
          ) : (
            guestLogin(activityPath(a))
          )}
          <p className="register-note">
            {user ? '' : 'Masuk dengan Google, lalu tekan "Ingatkan aku". '}Pendaftaran belum dibuka. Kami kabari lewat email saat dibuka.
          </p>
        </>
      );
    }

    if (!canRegister(a)) return <p className="register-note">Pendaftaran belum dibuka. Pantau halaman ini.</p>;

    if (isPaid(a)) {
      return (
        <>
          <button className="btn btn-primary btn-block" type="button" disabled>
            Pembayaran segera hadir
          </button>
          <p className="register-note">Pendaftaran berbayar sedang disiapkan.</p>
        </>
      );
    }

    const full = a.status === 'full';
    return (
      <>
        {user ? (
          <Link className="btn btn-primary btn-block" to={registerPath(a)}>
            {full ? 'Daftar waitlist' : 'Daftar sekarang'}
          </Link>
        ) : (
          guestLogin(registerPath(a))
        )}
        <p className="register-note">
          {full ? 'Kuota utama penuh; kamu masuk waitlist dan otomatis naik kalau ada yang batal. ' : ''}
          {user ? 'Isi form singkat, data terisi dari profilmu.' : 'Login sekali, lalu isi form singkat.'}
        </p>
      </>
    );
  })();

  return (
    <div className="register-card">
      <div className="register-price">
        <span className="register-label">Biaya</span>
        <b>{priceLabel(a)}</b>
      </div>
      {!done && (
        <WithStats stats={stats} fallback={null}>
          {(s) => <Seats activity={a} stats={s} />}
        </WithStats>
      )}
      {error && <p className="form-message error">{error}</p>}
      <div className="register-action">{action}</div>
      <button className="register-share" type="button" onClick={copyLink}>
        {copied ? 'Link tersalin ✓' : 'Salin link untuk ajak teman'}
      </button>
    </div>
  );
}
