import { useState } from 'react';
import { data, Link, redirect, useLocation, useNavigate, useRevalidator } from 'react-router';
import type { Route } from './+types/event-registered';
import { EventSummary } from '~/components/EventSummary';
import {
  activityPath,
  fetchMyRegistration,
  getPublishedActivityBySlug,
  googleCalendarUrl,
  isActiveRegistration,
  registrationCode,
  syncCalendar,
  timeRange,
  cancelRegistration,
  fetchActivityLinks,
} from '~/lib/activities';
import { fetchProfile, requireUser } from '~/lib/auth';
import { formatWibDate, formatWibTime } from '~/lib/format';
import { fetchMotivation, isOnboarded } from '~/lib/profile';
import { qnaPath } from '~/lib/qna';

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: `Terdaftar: ${loaderData?.activity.title ?? 'Kegiatan'} — SWE Growth` },
  { name: 'robots', content: 'noindex' },
];

/** Langkah 3 pendaftaran: konfirmasi + semua yang peserta perlukan sampai hari-H. */
export async function clientLoader({ request, params }: Route.ClientLoaderArgs) {
  const user = await requireUser(request);
  const activity = await getPublishedActivityBySlug(params.slug);
  if (!activity) throw data(null, { status: 404 });

  const [registration, links, profile, motivation] = await Promise.all([
    fetchMyRegistration(activity.id, user.id),
    fetchActivityLinks(activity.id),
    fetchProfile(user.id),
    fetchMotivation(user.id),
  ]);
  if (!registration || !isActiveRegistration(registration.status)) throw redirect(activityPath(activity));

  return { activity, registration, links, onboarded: isOnboarded(profile, motivation) };
}

export function HydrateFallback() {
  return <div className="loading-block">Memuat pendaftaran…</div>;
}

export default function EventRegistered({ loaderData }: Route.ComponentProps) {
  const { activity: a, registration: r, links, onboarded } = loaderData;
  const location = useLocation();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const state = location.state as { justRegistered?: boolean; invited?: boolean } | null;
  const justRegistered = Boolean(state?.justRegistered);
  // Undangan Google Calendar terkirim (baru saja, atau event sudah tersinkron sebelumnya).
  const invited = r.status === 'confirmed' && (Boolean(state?.invited) || Boolean(a.google_event_id));
  const confirmed = r.status === 'confirmed';
  const eventUrl = `${window.location.origin}${activityPath(a)}`;
  const calendar = googleCalendarUrl(a, `Detail & link meeting: ${window.location.origin}${location.pathname}`);
  const answered = a.registration_fields.filter((f) => r.answers[f.id]);
  const done = a.status === 'completed' || a.status === 'cancelled';

  const cancel = async () => {
    if (!confirm('Batalkan pendaftaran untuk kegiatan ini? Kursimu akan diberikan ke peserta lain.')) return;
    setBusy(true);
    await cancelRegistration(a.id);
    // Hapus dari tamu Google Calendar (dan undang peserta yang naik dari waitlist).
    void syncCalendar(a.id);
    navigate(activityPath(a), { replace: true });
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(eventUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <section className="block on-teal registered-hero">
        <div className="wrap wrap-680">
          <span className="check-badge" aria-hidden="true">
            {confirmed ? '✓' : '⏳'}
          </span>
          <h1 className="page-title">
            {confirmed ? (justRegistered ? 'Pendaftaran berhasil!' : 'Kamu sudah terdaftar') : 'Kamu masuk waitlist'}
          </h1>
          <p className="lead">
            {confirmed
              ? 'Sampai jumpa di acara. Simpan halaman ini: link meeting akan muncul di sini.'
              : 'Kuota utama sedang penuh. Kalau ada peserta yang batal, kamu otomatis naik dan halaman ini berubah.'}
          </p>
        </div>
      </section>

      <section className="block">
        <div className="wrap portal-stack wrap-680">
          {/* Tiket */}
          <div className="panel ticket">
            <EventSummary activity={a} />
            <dl className="ticket-meta">
              <div>
                <dt>Peserta</dt>
                <dd>{r.name}</dd>
              </div>
              <div>
                <dt>Kode pendaftaran</dt>
                <dd className="mono-code">{registrationCode(r.id)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`chip ${confirmed ? 'yellow' : ''}`}>{confirmed ? 'Terkonfirmasi' : 'Waitlist'}</span>
                </dd>
              </div>
            </dl>
          </div>

          {/* Langkah berikutnya */}
          {!done && (
            <div className="panel">
              <div className="panel-head">
                <h2>Langkah berikutnya</h2>
              </div>
              <ol className="next-steps">
                <li>
                  <strong>{invited ? 'Terima undangan kalender' : 'Simpan jadwal'}</strong>
                  <span>
                    {a.starts_at ? `${formatWibDate(a.starts_at)}, ${timeRange(a)}. ` : 'Jadwal diumumkan menyusul di halaman kegiatan. '}
                    {invited &&
                      `Undangan Google Calendar dikirim ke ${r.email}. Buka emailnya lalu pilih "Ya" — kalau jadwal berubah, kalendermu ikut diperbarui.`}
                  </span>
                  {calendar && (
                    <a className="btn btn-ghost sm" href={calendar} target="_blank" rel="noopener">
                      {invited ? 'Belum dapat undangan? Tambah manual' : 'Tambah ke Google Calendar'}
                    </a>
                  )}
                </li>
                <li>
                  <strong>Link meeting</strong>
                  <MeetingLink confirmed={confirmed} links={links} onRefresh={() => revalidator.revalidate()} />
                </li>
                {a.qna_status === 'open' && (
                  <li>
                    <strong>Kirim pertanyaan untuk pembicara</strong>
                    <span>Tulis pertanyaanmu dan vote pertanyaan peserta lain. Yang paling banyak vote dibahas lebih dulu.</span>
                    <Link className="btn btn-ghost sm" to={qnaPath(a)}>
                      Buka tanya jawab
                    </Link>
                  </li>
                )}
                {(a.next_steps ?? []).map((step, i) => (
                  <li key={i}>
                    <strong>{step.title}</strong>
                    {step.description && <span>{step.description}</span>}
                    {step.url && (
                      <a className="btn btn-ghost sm" href={step.url} target="_blank" rel="noopener">
                        Buka link
                      </a>
                    )}
                  </li>
                ))}
                {!onboarded && (
                  <li>
                    <strong>Gabung grup WhatsApp komunitas</strong>
                    <span>Lengkapi profil member, lalu link grupnya langsung muncul.</span>
                    <Link className="btn btn-ghost sm" to={`/onboarding?next=${encodeURIComponent(location.pathname)}`}>
                      Lengkapi profil
                    </Link>
                  </li>
                )}
              </ol>
            </div>
          )}

          {answered.length > 0 && (
            <div className="panel">
              <div className="panel-head">
                <h2>Jawabanmu</h2>
              </div>
              <dl className="answers">
                {answered.map((f) => (
                  <div key={f.id}>
                    <dt>{f.label}</dt>
                    <dd>{r.answers[f.id]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div className="panel">
            <div className="panel-head">
              <h2>Ajak teman</h2>
            </div>
            <div className="share-link">
              <code>{eventUrl.replace(/^https?:\/\//, '')}</code>
              <button className="btn btn-ghost sm" type="button" onClick={copyLink}>
                {copied ? 'Tersalin ✓' : 'Salin link'}
              </button>
            </div>
          </div>

          <div className="inline-actions">
            <Link className="btn btn-ghost" to={activityPath(a)}>
              Detail kegiatan
            </Link>
            <Link className="btn btn-ghost" to="/portal">
              Ke portal
            </Link>
            {!done && (
              <button className="link-btn push-right" type="button" disabled={busy} onClick={cancel}>
                Batalkan pendaftaran
              </button>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

type Links = Route.ComponentProps['loaderData']['links'];

function MeetingLink({ confirmed, links, onRefresh }: { confirmed: boolean; links: Links; onRefresh: () => void }) {
  const [now] = useState(Date.now);
  if (!confirmed) return <span>Link meeting tersedia setelah kamu naik dari waitlist ke peserta terkonfirmasi.</span>;
  if (links?.meeting_url) {
    return (
      <>
        <span>Link sudah dibuka. Masuk beberapa menit sebelum acara dimulai.</span>
        <a className="btn btn-primary sm" href={links.meeting_url} target="_blank" rel="noopener">
          Buka link meeting
        </a>
      </>
    );
  }
  const opensAt = links?.meeting_opens_at;
  const opensLater = opensAt && Date.parse(opensAt) > now;
  return (
    <>
      <span>
        {opensLater
          ? `Terbuka di halaman ini mulai ${formatWibDate(opensAt)}, ${formatWibTime(opensAt)} (1 jam sebelum acara).`
          : 'Link meeting akan muncul di halaman ini sebelum acara dimulai.'}
      </span>
      {!opensLater && (
        <button className="link-btn" type="button" onClick={onRefresh}>
          Cek lagi
        </button>
      )}
    </>
  );
}
