import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useMemo, useState, type FormEvent } from 'react';
import { data, Link, redirect } from 'react-router';
import type { Route } from './+types/my-activity';
import { PortalShell, type PortalSection } from '~/components/PortalShell';
import { YouTubeEmbed } from '~/components/YouTubeEmbed';
import {
  activityPath,
  fetchMyRegistration,
  getPublishedActivityBySlug,
  isActiveRegistration,
  isActivityUpcoming,
  registeredPath,
  timeRange,
  type Activity,
} from '~/lib/activities';
import { requireUser } from '~/lib/auth';
import type { ActivityFeedbackRow } from '~/lib/database.types';
import { formatWibDate } from '~/lib/format';
import {
  feedbackErrorMessage,
  feedbackOpen,
  fetchMyFeedback,
  fetchRecap,
  MY_ACTIVITIES_PATH,
  RATING_LABEL,
  submitFeedback,
} from '~/lib/my-activities';
import { qnaPath } from '~/lib/qna';
import { youtubeId } from '~/lib/youtube';

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: `${loaderData?.activity.title ?? 'Kegiatan'} — Kegiatanku — SWE Growth` },
  { name: 'robots', content: 'noindex' },
];

/** Hanya untuk yang terdaftar (tidak dibatalkan); selain itu ke halaman event publik. */
export async function clientLoader({ request, params }: Route.ClientLoaderArgs) {
  const user = await requireUser(request);
  const activity = await getPublishedActivityBySlug(params.slug);
  if (!activity) throw data(null, { status: 404 });
  const registration = await fetchMyRegistration(activity.id, user.id);
  if (!registration || !isActiveRegistration(registration.status)) throw redirect(activityPath(activity));
  const [recap, feedback] = await Promise.all([fetchRecap(activity.id), fetchMyFeedback(activity.id, user.id)]);
  return { activity, status: registration.status, recap, feedback, now: Date.now() };
}

export function HydrateFallback() {
  return <div className="loading-block">Memuat kegiatan…</div>;
}

/**
 * Rekap satu kegiatan yang diikuti: ringkasan sesi, rekaman, dan feedback.
 * Detail acara, tanya jawab, dan tiket jadi sub-menu (link) di menu samping.
 */
export default function MyActivity({ loaderData }: Route.ComponentProps) {
  const { activity: a, status, recap, feedback, now: loadedAt } = loaderData;
  const now = new Date(loadedAt);
  const upcoming = isActivityUpcoming(a, now);
  const confirmed = status === 'confirmed';

  const sections: PortalSection[] = [
    { id: 'ringkasan', label: 'Ringkasan' },
    { id: 'rekaman', label: 'Rekaman' },
    { id: 'feedback', label: 'Feedback' },
    ...(upcoming ? [{ to: registeredPath(a), label: 'Tiket & link meeting' }] : []),
    ...(a.qna_status !== 'off' ? [{ to: qnaPath(a), label: 'Tanya jawab' }] : []),
    { to: activityPath(a), label: 'Detail acara' },
  ];

  return (
    <PortalShell
      title={a.title}
      intro={
        <>
          <Link className="text-link" to={MY_ACTIVITIES_PATH}>
            ← Kegiatanku
          </Link>
          {' · '}
          {a.starts_at ? `${formatWibDate(a.starts_at)}, ${timeRange(a)}` : 'Jadwal menyusul'}
          {status === 'waitlisted' && ' · kamu di waitlist'}
        </>
      }
      sections={sections}
    >
      <div className="portal-stack">
        {upcoming && (
          <div className="panel">
            <div className="panel-head">
              <h2>Acara belum dimulai</h2>
            </div>
            <p className="form-sub">Ringkasan, rekaman, dan feedback tersedia di halaman ini setelah acara. Sampai jumpa!</p>
            <div className="inline-actions">
              <Link className="btn btn-primary sm" to={registeredPath(a)}>
                Tiket & link meeting
              </Link>
              {a.qna_status === 'open' && (
                <Link className="btn btn-ghost sm" to={qnaPath(a)}>
                  Kirim pertanyaan untuk pembicara
                </Link>
              )}
            </div>
          </div>
        )}

        <div className="panel" id="ringkasan">
          <div className="panel-head">
            <h2>Ringkasan sesi</h2>
          </div>
          {recap?.summary ? (
            <Summary markdown={recap.summary} />
          ) : (
            <p className="muted">
              {upcoming ? 'Ringkasan tersedia setelah acara.' : 'Ringkasan sesi belum tersedia. Admin akan menambahkannya setelah acara.'}
            </p>
          )}
        </div>

        <div className="panel" id="rekaman">
          <div className="panel-head">
            <h2>Rekaman</h2>
          </div>
          <Recording activity={a} recap={recap} upcoming={upcoming} />
        </div>

        <div className="panel" id="feedback">
          <div className="panel-head">
            <h2>Feedback</h2>
          </div>
          {!confirmed ? (
            <p className="muted">Feedback hanya untuk peserta terkonfirmasi.</p>
          ) : !feedbackOpen(a, now) ? (
            <p className="muted">Feedback dibuka setelah acara dimulai.</p>
          ) : (
            <FeedbackForm activityId={a.id} initial={feedback} />
          )}
        </div>
      </div>
    </PortalShell>
  );
}

/** Ringkasan dari Zoom biasanya markdown (judul, poin); dirender lalu dibersihkan. */
function Summary({ markdown }: { markdown: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(markdown, { async: false, breaks: true })), [markdown]);
  return <div className="prose recap-summary" dangerouslySetInnerHTML={{ __html: html }} />;
}

function Recording({
  activity: a,
  recap,
  upcoming,
}: {
  activity: Activity;
  recap: Route.ComponentProps['loaderData']['recap'];
  upcoming: boolean;
}) {
  const id = youtubeId(a.youtube_url);
  if (id) return <YouTubeEmbed id={id} title={a.title} />;
  if (recap?.recording_url) {
    return (
      <a className="btn btn-primary sm" href={recap.recording_url} target="_blank" rel="noopener">
        Tonton rekaman
      </a>
    );
  }
  if (recap?.has_recording) {
    return (
      <p className="muted">
        Rekaman kegiatan ini khusus verified member.{' '}
        <Link className="text-link" to="/portal/membership">
          Lihat membership
        </Link>
        .
      </p>
    );
  }
  return <p className="muted">{upcoming ? 'Rekaman tersedia setelah acara (kalau direkam).' : 'Belum ada rekaman untuk kegiatan ini.'}</p>;
}

function FeedbackForm({ activityId, initial }: { activityId: string; initial: ActivityFeedbackRow | null }) {
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [saved, setSaved] = useState(Boolean(initial));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!rating) {
      setMessage({ ok: false, text: 'Pilih nilai dulu.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await submitFeedback(activityId, rating, comment);
    setBusy(false);
    if (error) {
      setMessage({ ok: false, text: feedbackErrorMessage(error.message) });
      return;
    }
    setSaved(true);
    setMessage({ ok: true, text: 'Terima kasih! Feedbackmu membantu kami bikin kegiatan berikutnya lebih baik.' });
  };

  return (
    <form className="feedback-form" onSubmit={submit}>
      <p className="form-sub">{saved ? 'Feedbackmu sudah tersimpan. Kamu masih bisa mengubahnya.' : 'Bagaimana kegiatan ini menurutmu?'}</p>
      <div className="rating" role="radiogroup" aria-label="Nilai kegiatan">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} — ${RATING_LABEL[n]}`}
            title={RATING_LABEL[n]}
            className={n <= rating ? 'on' : ''}
            onClick={() => setRating(n)}
          >
            ★
          </button>
        ))}
        {rating > 0 && <span className="rating-label">{RATING_LABEL[rating]}</span>}
      </div>
      <div className="field">
        <label htmlFor="feedback-comment">
          Saran atau kesan <small>(opsional)</small>
        </label>
        <textarea
          id="feedback-comment"
          rows={4}
          maxLength={2000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Apa yang paling bermanfaat? Apa yang bisa lebih baik?"
        />
      </div>
      <div className="inline-actions">
        <button className="btn btn-primary sm" type="submit" disabled={busy}>
          {busy ? 'Mengirim…' : saved ? 'Perbarui feedback' : 'Kirim feedback'}
        </button>
      </div>
      {message && (
        <p className={`form-message ${message.ok ? 'success' : 'error'}`} role="status">
          {message.text}
        </p>
      )}
    </form>
  );
}
