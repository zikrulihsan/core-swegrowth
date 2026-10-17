import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { Route } from './+types/home';
import { AgendaList } from '~/components/AgendaList';
import { byEventDate, ExternalEventRows } from '~/components/ExternalEventList';
import { RecommendationCard } from '~/components/RecommendationCard';
import { RecordingGrid } from '~/components/RecordingGrid';
import { Avatar } from '~/components/Avatar';
import { SOCIALS } from '~/components/Socials';
import { ArrowRight, ArrowUpRight, BookIcon, BriefcaseIcon, ChatIcon, MicIcon, UsersIcon, VideoIcon } from '~/components/Icons';
import { activityPath, getCommunityPulse, getCommunityStats, getCommunityGroups, getPublishedActivities, upcomingSessions } from '~/lib/activities';
import { PAST_ACTIVITIES } from '~/lib/past-activities';
import { useAuth } from '~/lib/auth';
import { getPublishedContributions } from '~/lib/contributions';
import type { RecommendationCategory } from '~/lib/database.types';
import { CATEGORIES, directoryPath, getPublishedRecommendations, SUBMIT_PATH } from '~/lib/recommendations';
import { recordingsFrom, YOUTUBE_CHANNEL_URL } from '~/lib/recordings';
import { TOPICS } from '~/lib/topics';
import { pageMeta } from '~/lib/site';

export const meta: Route.MetaFunction = () => pageMeta('SWE Growth — komunitas software engineer Indonesia');

const load = async () => {
  const [activities, groups, contributions, recommendations, stats, pulse] = await Promise.all([
    getPublishedActivities(),
    getCommunityGroups(),
    getPublishedContributions(),
    getPublishedRecommendations(),
    getCommunityStats(),
    getCommunityPulse(),
  ]);
  // Angka hero baru dianimasikan setelah data terbaru dari browser masuk; sebelumnya placeholder.
  const live = typeof window !== 'undefined';
  return {
    stats: heroStats(stats),
    live,
    pulse,
    activities: upcomingSessions(activities).slice(0, 3),
    recordings: recordingsFrom(activities).slice(0, 3),
    // Acara dari luar tampil di agenda, jadi tidak diulang di rekomendasi pilihan.
    external: recommendations.filter((r) => r.category === 'acara').sort(byEventDate).slice(0, 3),
    // Penanda "segera"/"baru" dihitung di browser saja supaya HTML prerender tidak basi.
    now: live ? Date.now() : null,
    groups,
    contributions,
    recommendations: recommendations.filter((r) => r.is_featured && r.category !== 'acara'),
  };
};

export async function loader() {
  return load();
}

export async function clientLoader() {
  return load();
}
clientLoader.hydrate = true as const;

/** Angka persis, pemisah ribuan ala Indonesia (1.024). */
const count = (n: number) => n.toLocaleString('id-ID');

/** Member & sesi dari database (sesi = arsip kegiatan lama + kegiatan di agenda); topik tetap. */
type HeroStat = { value: number; suffix?: string; label: string };

function heroStats(stats: { member_count: number; session_count: number } | null) {
  return [
    stats && { value: stats.member_count, label: 'member' },
    { value: PAST_ACTIVITIES.length + (stats?.session_count ?? 0), label: 'sesi komunitas' },
    { value: 10, suffix: '+', label: 'topik diskusi' },
  ].filter((s): s is HeroStat => Boolean(s));
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Angka naik dari 0 ke target (ease-out, ~1,2 detik); langsung ke target kalau reduced motion. */
function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setN(to);
      return;
    }
    const duration = 1200;
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      setN(Math.round(to * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [to]);

  return <>{count(n)}{suffix}</>;
}

/** Satu kalimat pendek per kartu. */
const ACTIVITIES = [
  { icon: <ChatIcon />, name: 'Ngobrol tiap hari', body: 'Grup WhatsApp per bidang: backend, frontend, infra, managerial.' },
  { icon: <BriefcaseIcon />, name: 'Share peluang', body: 'Loker, referral, dan rekomendasi event dari sesama member.' },
  { icon: <VideoIcon />, name: 'Diskusi online', body: 'Bahas topik yang lagi rame, langsung bareng-bareng.' },
  { icon: <UsersIcon />, name: 'Belajar bareng', body: 'Sesi rutin, satu materi dibahas sampai tuntas.' },
  { icon: <BookIcon />, name: 'Kelas', body: 'Materi runtut dari praktisi, berangkat dari masalah nyata.' },
  { icon: <MicIcon />, name: 'Talkshow', body: 'Cerita perjalanan karier langsung dari praktisi.' },
];


/**
 * Aktivitas minggu ini: satu chip tampil bergantian dengan efek flip.
 * Berhenti saat di-hover/fokus; dengan reduced motion semua chip tampil diam.
 */
function HeroPulse({ items }: { items: Route.ComponentProps['loaderData']['pulse'] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(false);
  const rotating = items.length > 1 && !still;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setStill(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!rotating || paused) return;
    const id = setInterval(() => setActive((i) => (i + 1) % items.length), 3500);
    return () => clearInterval(id);
  }, [rotating, paused, items.length]);

  const previous = (active - 1 + items.length) % items.length;

  return (
    <ul
      className={`hero-pulse${items.length > 1 ? ' rotating' : ''}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {items.map((p, i) => {
        const hidden = rotating && i !== active;
        return (
          <li
            key={p.slug ?? p.kind}
            data-state={i === active ? 'in' : i === previous ? 'out' : undefined}
            aria-hidden={hidden || undefined}
          >
            {p.kind === 'member' ? (
              <><b>{count(p.total)} engineer</b> baru gabung minggu ini</>
            ) : (
              <><b>{count(p.total)} orang</b> daftar <Link to={activityPath({ slug: p.slug! })} tabIndex={hidden ? -1 : undefined}>{p.title}</Link> minggu ini</>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function Home({ loaderData: { activities, recordings, external, now, groups, contributions, recommendations, stats, live, pulse } }: Route.ComponentProps) {
  const { user } = useAuth();
  const [picked, setPicked] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const active = TOPICS[hovered ?? picked];
  const [recCategory, setRecCategory] = useState<RecommendationCategory | null>(null);
  const recCategories = CATEGORIES.filter((c) => recommendations.some((r) => r.category === c.id));
  const featured = recommendations.filter((r) => !recCategory || r.category === recCategory).slice(0, 6);
  const hasAgenda = activities.length > 0 || external.length > 0;
  // Toggle agenda: SWE Growth dulu, kecuali belum ada kegiatan terjadwal.
  const [agendaTab, setAgendaTab] = useState<'swegrowth' | 'luar' | null>(null);
  const showExternal = (agendaTab ?? (activities.length > 0 ? 'swegrowth' : 'luar')) === 'luar';

  const joinButton = user ? (
    <Link className="btn btn-primary" to="/portal">Buka portal</Link>
  ) : (
    <Link className="btn btn-primary" to="/masuk?next=/portal">Daftar sekarang</Link>
  );

  return (
    <div className="home">
      <section className="block intro on-teal">
        <div className="wrap narrow-wrap">
          <h1>Tumbuh sebagai software engineer, <span className="hl">bareng-bareng.</span></h1>
          <p className="lead">Diskusi harian, belajar bareng, dan kelas bersama sesama software engineer Indonesia.</p>
          <div className="inline-actions">
            {joinButton}
            {!user && (
              <a className="btn btn-ghost" href={hasAgenda ? '#terdekat' : '/agenda'}>Lihat agenda terdekat</a>
            )}
          </div>
          <ul className="hero-stats">
            {stats.map((s) => (
              <li key={s.label}>
                {live ? (
                  <b><CountUp to={s.value} suffix={s.suffix} /></b>
                ) : (
                  // Placeholder: angka snapshot tetap ada di HTML (tak terlihat) supaya lebarnya pas.
                  <b className="stat-skel">{count(s.value)}{s.suffix}</b>
                )}
                <span>{s.label}</span>
              </li>
            ))}
          </ul>
          {pulse.length > 0 && <HeroPulse items={pulse} />}
        </div>
      </section>

      {hasAgenda && (
        <section className="home-section agenda-band" id="terdekat">
          <div className="wrap narrow-wrap">
            <div className="home-head">
              <p className="home-label">Agenda</p>
              <h2>Mau tumbuh di mana minggu ini?</h2>
            </div>
            <div className="home-agenda">
              <nav className="agenda-time-tabs" aria-label="Penyelenggara acara">
                <button type="button" aria-pressed={!showExternal} onClick={() => setAgendaTab('swegrowth')}>Dari SWE Growth</button>
                <button type="button" aria-pressed={showExternal} onClick={() => setAgendaTab('luar')}>Tempat lain untuk tumbuh</button>
              </nav>
              {showExternal ? (
                <div className="panel external-events">
                  <div className="panel-head">
                    <p className="muted">Acara pilihan di luar SWE Growth, daftar langsung di situs penyelenggara.</p>
                    <Link to={directoryPath('acara')}>Semua</Link>
                  </div>
                  {external.length > 0 ? (
                    <ExternalEventRows events={external} now={now} />
                  ) : (
                    <p className="muted">
                      Belum ada acara dari luar yang kami rekomendasikan.{' '}
                      <Link className="text-link" to={`${SUBMIT_PATH}?kategori=acara`}>Tahu acara bagus?</Link>
                    </p>
                  )}
                </div>
              ) : (
                <div className="panel">
                  <div className="panel-head">
                    <p className="muted">Diadakan komunitas, daftar gratis pakai akun Google.</p>
                    <Link to="/agenda">Semua</Link>
                  </div>
                  {activities.length > 0 ? (
                    <AgendaList activities={activities} groups={groups} now={now} />
                  ) : (
                    <p className="muted">Belum ada kegiatan terjadwal. Sementara itu, intip acara di tempat lain.</p>
                  )}
                </div>
              )}
            </div>
            <Link className="btn btn-ghost more-link" to="/agenda">Lihat semua agenda <ArrowRight /></Link>
          </div>
        </section>
      )}

      {recordings.length > 0 && (
        <section className="home-section">
          <div className="wrap narrow-wrap">
            <div className="home-head">
              <p className="home-label">Rekaman</p>
              <h2>Ketinggalan sesi? Nonton lagi di sini</h2>
            </div>
            <RecordingGrid recordings={recordings} />
            <div className="home-rec-more">
              <Link className="btn btn-ghost" to="/rekaman">Lihat semua rekaman <ArrowRight /></Link>
              <a className="text-link" href={YOUTUBE_CHANNEL_URL} target="_blank" rel="noopener">Channel YouTube SWE Growth</a>
            </div>
          </div>
        </section>
      )}

      <section className="home-section">
        <div className="wrap narrow-wrap">
          <div className="home-head">
            <p className="home-label">Kegiatan</p>
            <h2>Di sini kita ngapain aja?</h2>
          </div>
          <ul className="card-grid">
            {ACTIVITIES.map((a) => (
              <li key={a.name}>
                <span className="card-ic">{a.icon}</span>
                <h3>{a.name}</h3>
                <p>{a.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="home-section on-teal">
        <div className="wrap narrow-wrap">
          <div className="home-head">
            <p className="home-label">Topik</p>
            <h2>Yang lagi sering dibahas</h2>
          </div>
          <div onMouseLeave={() => setHovered(null)}>
            <p className="topic-detail" aria-live="polite" key={active.name}>
              <b>{active.name}</b>
              {active.body}
            </p>
            <ul className="topic-cloud">
              {TOPICS.map((t, i) => (
                <li key={t.name}>
                  <button
                    type="button"
                    className={t === active ? 'active' : undefined}
                    aria-pressed={i === picked}
                    onClick={() => setPicked(i)}
                    onMouseEnter={() => setHovered(i)}
                  >
                    {t.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {recommendations.length > 0 && (
        <section className="home-section">
          <div className="wrap narrow-wrap">
            <div className="home-head">
              <p className="home-label">Rekomendasi</p>
              <h2>Bekal buat terus grow</h2>
            </div>
            {recCategories.length > 1 && (
              <div className="rec-tabs home-rec-tabs" role="group" aria-label="Kategori rekomendasi">
                <button type="button" aria-pressed={!recCategory} onClick={() => setRecCategory(null)}>Semua</button>
                {recCategories.map((c) => (
                  <button key={c.id} type="button" aria-pressed={recCategory === c.id} onClick={() => setRecCategory(c.id)}>{c.label}</button>
                ))}
              </div>
            )}
            <ul className="rec-grid">
              {featured.map((r) => <RecommendationCard key={r.id} r={r} />)}
            </ul>
            <div className="home-rec-more">
              <Link className="btn btn-ghost" to={directoryPath(recCategory ?? undefined)}>Lihat semua rekomendasi <ArrowRight /></Link>
              <Link className="text-link" to={SUBMIT_PATH}>Punya rekomendasi? Kirim ke kita</Link>
            </div>
          </div>
        </section>
      )}

      {contributions.length > 0 && (
        <section className="home-section contrib-band">
          <div className="wrap narrow-wrap">
            <div className="home-head">
              <p className="home-label">Kontribusi</p>
              <h2>Dari member ke member</h2>
            </div>
            <ul className="contrib-list">
              {contributions.map((c) => (
                <li key={c.id}>
                  {c.icon_url ? (
                    <img className="contrib-ic" src={c.icon_url} alt="" width="40" height="40" loading="lazy" />
                  ) : (
                    <span className="contrib-ic">{c.title.charAt(0).toUpperCase()}</span>
                  )}
                  <div className="contrib-main">
                    <div className="contrib-title">
                      {/* Seluruh baris bisa diklik lewat link judul; link pembuat ada di atasnya. */}
                      <h3><a className="contrib-link" href={c.url} target="_blank" rel="noopener">{c.title}</a></h3>
                      {c.category && <span className="chip">{c.category}</span>}
                    </div>
                    {c.description && <p>{c.description}</p>}
                    {c.maker_name && (
                      c.maker_handle ? (
                        <Link className="contrib-maker" to={`/member/${c.maker_handle}`}>
                          <Avatar name={c.maker_name} src={c.maker_avatar_url} size={20} />
                          oleh {c.maker_name}
                        </Link>
                      ) : (
                        <span className="contrib-maker">oleh {c.maker_name}</span>
                      )
                    )}
                  </div>
                  <span className="contrib-go" aria-hidden="true"><ArrowUpRight /></span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="home-section">
        <div className="wrap narrow-wrap">
          <div className="home-closing on-teal">
            <h2>Buat siapa aja yang mau <span className="hl">survive dan bertumbuh</span> di software engineering.</h2>
            {joinButton}
            <div className="home-social">
              <span>Ikuti juga</span>
              <ul>
                {SOCIALS.filter((s) => s.name !== 'Instagram').map((s) => (
                  <li key={s.name}>
                    <a href={s.url} target="_blank" rel="noopener">{s.icon}{s.name}</a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
