import { useState, type FormEvent } from 'react';
import { data, Link } from 'react-router';
import type { Route } from './+types/event-qna';
import { Avatar } from '~/components/Avatar';
import { GoogleSignIn } from '~/components/GoogleSignIn';
import { activityPath, getPublishedActivityBySlug } from '~/lib/activities';
import type { QuestionStatus } from '~/lib/database.types';
import {
  askQuestion,
  deleteQuestion,
  groupQuestions,
  moderateQuestion,
  QUESTION_MAX,
  qnaErrorMessage,
  qnaPath,
  qnaScreenPath,
  sortQuestions,
  timeAgo,
  toggleVote,
  type Question,
  type QuestionSort,
  type QuestionTab,
} from '~/lib/qna';
import { useQuestions } from '~/lib/use-questions';

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: `Tanya jawab: ${loaderData?.activity.title ?? 'Kegiatan'} — SWE Growth` },
  { name: 'description', content: 'Kirim pertanyaan untuk pembicara dan vote pertanyaan yang ingin kamu dengar jawabannya.' },
];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const activity = await getPublishedActivityBySlug(params.slug);
  if (!activity) throw data(null, { status: 404 });
  return { activity };
}

export function HydrateFallback() {
  return <div className="loading-block">Memuat tanya jawab…</div>;
}

/** Daftar diperbarui berkala selama tab terbuka, supaya vote & tanda terjawab ikut bergerak saat acara. */
const POLL_MS = 10_000;

/**
 * Tanya jawab ala Slido: siapa pun bisa membaca, login untuk bertanya & vote.
 * Admin memoderasi langsung dari halaman ini (sorot, tandai terjawab, sembunyikan).
 */
export default function EventQna({ loaderData: { activity: a } }: Route.ComponentProps) {
  const { questions, setQuestions, loadError, now, refresh, loading, signedIn, isAdmin } = useQuestions(a.id, POLL_MS);
  const [tab, setTab] = useState<QuestionTab>('open');
  const [sort, setSort] = useState<QuestionSort>('popular');
  const [error, setError] = useState<string | null>(null);

  const open = a.qna_status === 'open';

  const patch = (id: string, change: Partial<Question>) =>
    setQuestions((list) => list?.map((q) => (q.id === id ? { ...q, ...change } : q)) ?? null);

  const vote = async (q: Question) => {
    setError(null);
    // Optimistis: langsung berubah, dibetulkan dari server kalau gagal.
    patch(q.id, { voted: !q.voted, votes: q.votes + (q.voted ? -1 : 1) });
    const { error: rpcError } = await toggleVote(q.id);
    if (rpcError) {
      setError(qnaErrorMessage(rpcError.message));
      void refresh();
    }
  };

  const remove = async (q: Question) => {
    if (!confirm(q.is_mine ? 'Tarik pertanyaan ini?' : 'Hapus pertanyaan ini permanen?')) return;
    const { error: dbError } = await deleteQuestion(q.id);
    if (dbError) setError(qnaErrorMessage(dbError.message));
    await refresh();
  };

  const moderate = async (q: Question, change: { status?: QuestionStatus; is_highlighted?: boolean }) => {
    setError(null);
    const { error: dbError } = await moderateQuestion(q.id, change);
    if (dbError) setError(qnaErrorMessage(dbError.message));
    await refresh();
  };

  const groups = groupQuestions(questions ?? []);
  // Yang sedang disorot sudah tampil di atas, tidak diulang di daftar.
  const shown = sortQuestions(groups[tab], sort, tab).filter((q) => q.id !== groups.highlighted?.id);
  const tabs: { id: QuestionTab; label: string; count: number }[] = [
    { id: 'open', label: 'Pertanyaan', count: groups.open.length },
    { id: 'answered', label: 'Terjawab', count: groups.answered.length },
    ...(isAdmin ? [{ id: 'hidden' as const, label: 'Tersembunyi', count: groups.hidden.length }] : []),
  ];
  const actions = { vote, remove, moderate, canVote: open && signedIn, isAdmin, now };

  return (
    <section className="block qna-page">
      <div className="wrap wrap-680">
        <Link className="back" to={activityPath(a)}>
          ← Detail kegiatan
        </Link>
        <div className="qna-head">
          <h1 className="page-title">Tanya jawab</h1>
          <span className={`chip ${open ? 'yellow' : ''}`}>{open ? 'Terbuka' : a.qna_status === 'off' ? 'Tidak dibuka' : 'Ditutup'}</span>
        </div>
        <p className="qna-event">
          <Link to={activityPath(a)}>{a.title}</Link>
          {a.speaker && <> · bersama {a.speaker}</>}
        </p>

        {a.qna_status === 'off' && !isAdmin ? (
          <p className="panel muted mt-20">Tanya jawab tidak dibuka untuk kegiatan ini.</p>
        ) : (
          <>
            {isAdmin && (
              <p className="form-message mt-20">
                Kamu admin: sorot pertanyaan yang sedang dibahas, tandai terjawab, atau sembunyikan yang tidak pantas. Status tanya jawab
                diatur di <Link to={`/admin/event/${a.id}`}>editor event</Link>. Untuk screen share/proyektor, buka{' '}
                <Link to={qnaScreenPath(a)}>mode layar</Link>: moderasi bisa dilakukan dari sana juga.
              </p>
            )}

            {open ? (
              <AskForm activityId={a.id} path={qnaPath(a)} loading={loading} signedIn={signedIn} onAsked={refresh} />
            ) : (
              a.qna_status === 'closed' && (
                <p className="panel muted mt-20">Sesi tanya jawab sudah ditutup. Terima kasih atas pertanyaannya!</p>
              )
            )}

            {error && <p className="form-message error mt-20">{error}</p>}

            {groups.highlighted && (
              <div className="qna-highlight">
                <span className="qna-highlight-label">Sedang dibahas</span>
                <QuestionItem q={groups.highlighted} {...actions} />
              </div>
            )}

            <div className="qna-toolbar">
              <div className="qna-tabs" role="tablist" aria-label="Kelompok pertanyaan">
                {tabs.map((t) => (
                  <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                    {t.label} <span className="qna-count">{t.count}</span>
                  </button>
                ))}
              </div>
              {tab !== 'answered' && (
                <div className="qna-sort" role="group" aria-label="Urutkan">
                  {(['popular', 'recent'] as const).map((s) => (
                    <button key={s} type="button" aria-pressed={sort === s} onClick={() => setSort(s)}>
                      {s === 'popular' ? 'Populer' : 'Terbaru'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {questions === null ? (
              <p className="muted">{loadError ? 'Pertanyaan belum bisa dimuat. Mencoba lagi…' : 'Memuat pertanyaan…'}</p>
            ) : shown.length === 0 ? (
              <p className="panel empty-note muted">
                {tab === 'open'
                  ? open
                    ? 'Belum ada pertanyaan. Jadilah yang pertama bertanya!'
                    : 'Tidak ada pertanyaan yang belum dijawab.'
                  : tab === 'answered'
                    ? 'Belum ada pertanyaan yang ditandai terjawab.'
                    : 'Tidak ada pertanyaan yang disembunyikan.'}
              </p>
            ) : (
              <ul className="qna-list">
                {shown.map((q) => (
                  <li key={q.id}>
                    <QuestionItem q={q} {...actions} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function AskForm({
  activityId,
  path,
  loading,
  signedIn,
  onAsked,
}: {
  activityId: string;
  path: string;
  loading: boolean;
  signedIn: boolean;
  onAsked: () => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (loading) return <div className="panel qna-ask mt-20" aria-hidden="true" />;

  if (!signedIn) {
    return (
      <div className="panel qna-ask mt-20">
        <p>
          <b>Punya pertanyaan untuk pembicara?</b> Masuk dengan Google untuk bertanya dan vote pertanyaan yang ingin kamu dengar jawabannya.
        </p>
        <GoogleSignIn next={path} onError={(text) => setMessage({ ok: false, text })} />
        {message && <p className="form-message error">{message.text}</p>}
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await askQuestion(activityId, body, anonymous);
    setBusy(false);
    if (error) {
      setMessage({ ok: false, text: qnaErrorMessage(error.message) });
      return;
    }
    setBody('');
    setMessage({ ok: true, text: 'Pertanyaanmu terkirim. Ajak yang lain vote supaya cepat dibahas!' });
    await onAsked();
  };

  const left = QUESTION_MAX - body.length;
  return (
    <form className="panel qna-ask mt-20" onSubmit={submit}>
      <div className="field">
        <label className="sr-only" htmlFor="question">
          Pertanyaan
        </label>
        <textarea
          id="question"
          rows={3}
          required
          minLength={3}
          maxLength={QUESTION_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Tulis pertanyaanmu untuk pembicara…"
        />
      </div>
      <div className="qna-ask-row">
        <label className="check-field">
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> Kirim sebagai anonim
        </label>
        <span className={`qna-left ${left < 50 ? 'warn' : ''}`}>{left}</span>
        <button className="btn btn-primary sm" type="submit" disabled={busy || body.trim().length < 3}>
          {busy ? 'Mengirim…' : 'Kirim'}
        </button>
      </div>
      {message && <p className={`form-message ${message.ok ? 'success' : 'error'}`}>{message.text}</p>}
    </form>
  );
}

type ItemProps = {
  q: Question;
  canVote: boolean;
  isAdmin: boolean;
  now: Date;
  vote: (q: Question) => void;
  remove: (q: Question) => void;
  moderate: (q: Question, change: { status?: QuestionStatus; is_highlighted?: boolean }) => void;
};

function QuestionItem({ q, canVote, isAdmin, now, vote, remove, moderate }: ItemProps) {
  const name = q.is_anonymous ? 'Anonim' : (q.author_name ?? 'Peserta');
  const voteDisabled = !canVote || q.is_mine || q.status === 'hidden';
  const voteTitle = q.is_mine
    ? 'Pertanyaanmu sendiri'
    : !canVote
      ? 'Masuk untuk vote (selama tanya jawab dibuka)'
      : q.voted
        ? 'Batalkan vote'
        : 'Vote';

  return (
    <article className={`qna-item is-${q.status}`}>
      <button
        className={`qna-vote ${q.voted ? 'on' : ''}`}
        type="button"
        aria-pressed={q.voted}
        aria-label={`${voteTitle} (${q.votes} vote)`}
        title={voteTitle}
        disabled={voteDisabled}
        onClick={() => vote(q)}
      >
        <span aria-hidden="true">▲</span>
        <b>{q.votes}</b>
      </button>
      <div className="qna-body">
        <p className="qna-text">{q.body}</p>
        <div className="qna-meta">
          {q.is_anonymous ? (
            <span className="qna-author">Anonim</span>
          ) : (
            <span className="qna-author">
              <Avatar name={name} src={q.author_avatar_url} size={20} />
              {q.author_handle ? <Link to={`/member/${q.author_handle}`}>{name}</Link> : name}
            </span>
          )}
          <span>{timeAgo(q.created_at, now)}</span>
          {q.is_mine && <span className="chip">Pertanyaanmu</span>}
          {q.status === 'answered' && <span className="chip green">✓ Terjawab</span>}
          {q.status === 'hidden' && <span className="chip">Disembunyikan</span>}
          {q.is_mine && q.status === 'open' && !isAdmin && (
            <button className="link-btn" type="button" onClick={() => remove(q)}>
              Tarik
            </button>
          )}
        </div>
        {isAdmin && (
          <div className="qna-admin">
            {q.status === 'open' && (
              <button className="link-btn" type="button" onClick={() => moderate(q, { is_highlighted: !q.is_highlighted })}>
                {q.is_highlighted ? 'Lepas sorotan' : 'Sorot'}
              </button>
            )}
            {q.status === 'answered' ? (
              <button className="link-btn" type="button" onClick={() => moderate(q, { status: 'open' })}>
                Buka lagi
              </button>
            ) : (
              q.status === 'open' && (
                <button className="link-btn" type="button" onClick={() => moderate(q, { status: 'answered' })}>
                  Tandai terjawab
                </button>
              )
            )}
            <button className="link-btn" type="button" onClick={() => moderate(q, { status: q.status === 'hidden' ? 'open' : 'hidden' })}>
              {q.status === 'hidden' ? 'Tampilkan' : 'Sembunyikan'}
            </button>
            <button className="link-btn danger" type="button" onClick={() => remove(q)}>
              Hapus
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
