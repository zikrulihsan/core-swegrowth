import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { data, Link, useNavigate, useRevalidator } from 'react-router';
import type { Route } from './+types/admin-event';
import { Avatar } from '~/components/Avatar';
import { EventWriter } from '~/components/EventWriter';
import {
  ACTIVITY_STATUSES,
  activityPath,
  activityStatusLabel,
  linkedinHandle,
  RECURRENCE_LABEL,
  registrationCode,
  slugify,
  speakerPhoto,
  syncCalendar,
  type CalendarSyncResult,
} from '~/lib/activities';
import { Field, isoToWib, useMutation, val, wibToIso } from '~/lib/admin-form';
import { requireAdmin } from '~/lib/auth';
import type { ActivityRegistrationRow, ActivityStatus, CommunityGroupRow, EventPhoto, NextStep, Recurrence, RegistrationField } from '~/lib/database.types';
import { downloadEventPoster } from '~/lib/event-poster';
import { formatWibDate, formatWibTime } from '~/lib/format';
import { SITE_URL } from '~/lib/site';
import { supabase } from '~/lib/supabase';
import { YOUTUBE_URL_PATTERN, youtubeId } from '~/lib/youtube';

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: `${loaderData?.activity?.title ?? 'Event baru'} — Admin SWE Growth` },
  { name: 'robots', content: 'noindex' },
];

/** /admin/event/baru atau /admin/event/:id */
export async function clientLoader({ request, params }: Route.ClientLoaderArgs) {
  await requireAdmin(request);
  const db = supabase();
  const groups = db.from('community_groups').select('*').order('sort_order').order('name').then((r) => r.data ?? []);
  if (params.id === 'baru') return { activity: null, info: null, registrations: [] as ActivityRegistrationRow[], groups: await groups };

  const [activity, info, registrations, groupRows] = await Promise.all([
    db.from('activities').select('*').eq('id', params.id).maybeSingle(),
    db.from('activity_member_info').select('*').eq('activity_id', params.id).maybeSingle(),
    db.from('activity_registrations').select('*').eq('activity_id', params.id).order('created_at'),
    groups,
  ]);
  if (!activity.data) throw data(null, { status: 404 });
  return { activity: activity.data, info: info.data, registrations: registrations.data ?? [], groups: groupRows };
}

export function HydrateFallback() {
  return <div className="loading-block">Memuat event…</div>;
}

const DEFAULT_FIELDS: RegistrationField[] = [
  { id: 'pertanyaan', label: 'Pertanyaan untuk pembicara', type: 'textarea', required: false },
];

/**
 * Editor event. Urutan bagian mengikuti halaman publik /agenda/:slug (pembicara
 * tampil di hero, "yang akan dibahas" di atas deskripsi), lalu
 * pendaftaran dan halaman konfirmasi (/terdaftar) — yang diisi di sini, itu yang tampil.
 */
export default function AdminEvent({ loaderData }: Route.ComponentProps) {
  const { activity: a, info, registrations, groups } = loaderData;
  const navigate = useNavigate();
  const { busy, run, flash } = useMutation();
  const [speakerLinkedin, setSpeakerLinkedin] = useState(a?.speaker_linkedin_url ?? '');
  const [speakerPhotoUrl, setSpeakerPhotoUrl] = useState(a?.speaker_photo_url ?? '');
  const [poster, setPoster] = useState(a?.image_url ?? '');
  const [recurrence, setRecurrence] = useState<string>(a?.recurrence ?? '');
  const [calendar, setCalendar] = useState<CalendarSyncResult | null>(null);
  const revalidator = useRevalidator();
  const formRef = useRef<HTMLFormElement>(null);

  /** Samakan dengan Google Calendar lalu muat ulang (supaya link & waktu sinkron tampil). */
  const sync = async (id: string) => {
    setCalendar({ status: undefined });
    const result = await syncCalendar(id);
    setCalendar(result);
    await revalidator.revalidate();
  };

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const title = val(form, 'title');
    const capacity = val(form, 'capacity');
    const fields = {
      title,
      slug: slugify(val(form, 'slug') || title),
      summary: val(form, 'summary'),
      description: val(form, 'description'),
      image_url: val(form, 'image_url') || null,
      starts_at: wibToIso(val(form, 'starts_at')),
      ends_at: wibToIso(val(form, 'ends_at')),
      mode: val(form, 'mode') as 'online' | 'offline' | 'hybrid',
      location: val(form, 'location') || null,
      speaker: val(form, 'speaker') || null,
      speaker_title: val(form, 'speaker_title') || null,
      speaker_linkedin_url: val(form, 'speaker_linkedin_url') || null,
      speaker_photo_url: val(form, 'speaker_photo_url') || null,
      organizer_group_id: val(form, 'organizer_group_id') || null,
      recurrence: (val(form, 'recurrence') || null) as Recurrence | null,
      recurrence_until: val(form, 'recurrence') ? val(form, 'recurrence_until') || null : null,
      photos: JSON.parse(val(form, 'photos') || '[]') as EventPhoto[],
      youtube_url: val(form, 'youtube_url') || null,
      status: val(form, 'status') as ActivityStatus,
      price_idr: Number.parseInt(val(form, 'price_idr') || '0', 10),
      capacity: capacity ? Number.parseInt(capacity, 10) : null,
      registration_fields: JSON.parse(val(form, 'registration_fields') || '[]') as RegistrationField[],
      next_steps: JSON.parse(val(form, 'next_steps') || '[]') as NextStep[],
      highlights: val(form, 'highlights').split('\n').map((h) => h.trim()).filter(Boolean).slice(0, 8),
      is_public: form.get('is_public') === 'on',
    };
    if (fields.starts_at && fields.ends_at && fields.ends_at <= fields.starts_at) {
      alert('Jam selesai harus setelah jam mulai.');
      return;
    }
    if (fields.youtube_url && !youtubeId(fields.youtube_url)) {
      alert('Link rekaman YouTube tidak dikenali. Pakai link video, mis. https://youtu.be/… atau https://www.youtube.com/watch?v=…');
      return;
    }
    if (fields.recurrence && !fields.starts_at) {
      alert('Event berulang butuh jadwal mulai sesi pertama.');
      return;
    }
    if (fields.recurrence_until && fields.recurrence_until < val(form, 'starts_at').slice(0, 10)) {
      alert('Tanggal berakhir pengulangan harus setelah sesi pertama.');
      return;
    }
    const links = { meeting_url: val(form, 'meeting_url') || null, recording_url: val(form, 'recording_url') || null };

    const created = { id: '' };
    const ok = await run(async () => {
      const db = supabase();
      const saved = a
        ? await db.from('activities').update(fields).eq('id', a.id).select('id').single()
        : await db.from('activities').insert(fields).select('id').single();
      if (saved.error) return saved;
      created.id = saved.data.id;
      return db.from('activity_member_info').upsert({ activity_id: saved.data.id, ...links, updated_at: new Date().toISOString() });
    }, a ? 'Perubahan tersimpan dan langsung tampil di halaman publik.' : 'Event dibuat.');

    if (!ok) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const id = a?.id ?? created.id;
    if (!a) navigate(`/admin/event/${id}`, { replace: true });
    // Jadwal/judul berubah → event Google & semua tamu ikut diperbarui.
    void sync(id);
  };

  return (
    <section className="block">
      <div className="wrap admin-wrap">
        <Link className="back" to="/admin?tab=event">← Semua event</Link>
        <div className="editor-head">
          <h1 className="page-title">{a ? a.title : 'Event baru'}</h1>
          {a && (
            <div className="inline-actions">
              <Link className="btn btn-ghost sm" to={activityPath(a)} target="_blank">Lihat halaman publik ↗</Link>
              <CopyLink path={activityPath(a)} />
              <PosterButton activity={a} organizer={groups.find((g) => g.id === a.organizer_group_id)?.name ?? null} />
            </div>
          )}
        </div>
        {flash}
        {a && <CalendarPanel activity={a} result={calendar} onSync={() => sync(a.id)} />}

        {a && <Stats activity={a} registrations={registrations} />}

        <form className="editor" ref={formRef} onSubmit={save} key={a?.updated_at ?? 'new'}>
          <EditorSection n={1} title="Info utama" hint="Tampil di bagian atas halaman event dan di agenda.">
            <Field id="title" label="Judul"><input id="title" name="title" required minLength={3} maxLength={140} defaultValue={a?.title} /></Field>
            <Field id="summary" label="Ringkasan" optional hint="Satu-dua kalimat di bawah judul.">
              <textarea id="summary" name="summary" rows={2} maxLength={500} defaultValue={a?.summary} />
            </Field>
            <Field id="image_url" label="Link poster (gambar)" optional>
              <input id="image_url" name="image_url" type="url" pattern="https://.*" value={poster} onChange={(e) => setPoster(e.target.value)} placeholder="https://…/poster.png" />
            </Field>
            {poster.startsWith('https://') && <img className="poster-preview" src={poster} alt="Pratinjau poster" />}
            <Field id="organizer_group_id" label="Penyelenggara" hint={groups.length === 0 ? 'Tambah subgrup (mis. English Club) di Admin → Subgrup.' : 'Event tetap tampil sebagai kegiatan komunitas SWE Growth.'}>
              <select id="organizer_group_id" name="organizer_group_id" defaultValue={a?.organizer_group_id ?? ''}>
                <option value="">SWE Growth (tanpa subgrup)</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>
            <Field id="slug" label="Slug URL" optional hint={a ? 'Mengubah slug membuat link lama yang sudah dibagikan tidak berlaku.' : 'Kosongkan = otomatis dari judul.'}>
              <input id="slug" name="slug" defaultValue={a?.slug} placeholder="otomatis dari judul" />
            </Field>
          </EditorSection>

          <EditorSection n={2} title="Pembicara (opsional)" hint="Kosongkan kalau belum ada pembicara; bagian ini tidak tampil. Kalau diisi, tampil menonjol di bagian atas halaman event. Foto otomatis dari profil LinkedIn; isi link foto kalau ingin pakai foto lain.">
            <div className="speaker-editor">
              <Avatar name={a?.speaker || 'Pembicara'} src={speakerPhoto({ speaker_linkedin_url: speakerLinkedin || null, speaker_photo_url: speakerPhotoUrl || null })} size={72} />
              <div className="form-grid">
                <Field id="speaker" label="Nama" optional><input id="speaker" name="speaker" maxLength={120} defaultValue={a?.speaker ?? ''} /></Field>
                <Field id="speaker_title" label="Peran / jabatan" optional>
                  <input id="speaker_title" name="speaker_title" maxLength={120} defaultValue={a?.speaker_title ?? ''} placeholder="Founder & CEO @Rubythalib.ai" />
                </Field>
                <Field id="speaker_linkedin_url" label="LinkedIn" optional hint={speakerLinkedin && !linkedinHandle(speakerLinkedin) ? 'Format: https://www.linkedin.com/in/username' : undefined}>
                  <input id="speaker_linkedin_url" name="speaker_linkedin_url" type="url" pattern="https://.*" value={speakerLinkedin} onChange={(e) => setSpeakerLinkedin(e.target.value)} placeholder="https://www.linkedin.com/in/…" />
                </Field>
                <Field id="speaker_photo_url" label="Link foto" optional>
                  <input id="speaker_photo_url" name="speaker_photo_url" type="url" pattern="https://.*" value={speakerPhotoUrl} onChange={(e) => setSpeakerPhotoUrl(e.target.value)} placeholder="kosong = dari LinkedIn" />
                </Field>
              </div>
            </div>
          </EditorSection>

          <EditorSection n={3} title="Jadwal & tempat" hint="Untuk event berulang, isi mulai & selesai sesi pertama. Sesi berikutnya dihitung otomatis dan agenda selalu menampilkan sesi terdekat.">
            <div className="form-grid">
              <Field id="starts_at" label="Mulai (WIB)" optional>
                <input id="starts_at" name="starts_at" type="datetime-local" defaultValue={isoToWib(a?.starts_at ?? null)} />
              </Field>
              <Field id="ends_at" label="Selesai (WIB)" optional>
                <input id="ends_at" name="ends_at" type="datetime-local" defaultValue={isoToWib(a?.ends_at ?? null)} />
              </Field>
              <Field id="recurrence" label="Berulang">
                <select id="recurrence" name="recurrence" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
                  <option value="">Tidak berulang</option>
                  {(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>)}
                </select>
              </Field>
              {recurrence && (
                <Field id="recurrence_until" label="Berulang sampai" optional hint="Tanggal sesi terakhir. Kosongkan = terus berulang.">
                  <input id="recurrence_until" name="recurrence_until" type="date" defaultValue={a?.recurrence_until ?? ''} />
                </Field>
              )}
              <Field id="mode" label="Format">
                <select id="mode" name="mode" defaultValue={a?.mode ?? 'online'}>
                  <option value="online">Online</option><option value="offline">Offline</option><option value="hybrid">Hybrid</option>
                </select>
              </Field>
              <Field id="location" label="Lokasi" optional hint="Publik. Jangan isi link meeting di sini.">
                <input id="location" name="location" defaultValue={a?.location ?? ''} placeholder="Zoom / Google Meet / nama venue" />
              </Field>
            </div>
          </EditorSection>

          <EditorSection n={4} title="Detail acara" hint="Tulis sendiri atau minta Gemini menyusunnya dari isi form. Caption media sosial juga bisa dibuat di sini.">
            <EventWriter
              formRef={formRef}
              organizers={Object.fromEntries(groups.map((g) => [g.id, g.name]))}
              publicUrl={a ? `${SITE_URL}${activityPath(a)}` : null}
            />
            <Field id="highlights" label="Yang akan dibahas" optional hint="Satu poin per baris, maksimal 8. Tampil menonjol di atas deskripsi — tulis yang bikin orang penasaran.">
              <textarea
                id="highlights"
                name="highlights"
                rows={4}
                defaultValue={a?.highlights?.join('\n')}
                placeholder={'Bagaimana ceritanya bangun perusahaan AI di Indonesia?\nAI engineer itu sebenarnya apa?\nBagaimana prospek karier AI engineering ke depannya?'}
              />
            </Field>
            <Field id="description" label="Deskripsi" optional hint="Pisahkan paragraf dengan baris kosong.">
              <textarea id="description" name="description" rows={8} defaultValue={a?.description} />
            </Field>
          </EditorSection>

          <EditorSection n={5} title="Pendaftaran">
            <div className="form-grid">
              <Field id="status" label="Status">
                <select id="status" name="status" defaultValue={a?.status ?? 'registration_open'}>
                  {ACTIVITY_STATUSES.map((s) => <option key={s} value={s}>{activityStatusLabel[s]}</option>)}
                </select>
              </Field>
              <Field id="price_idr" label="Biaya (Rp)" hint="0 = Gratis. Event berbayar belum bisa didaftar (pembayaran segera hadir).">
                <input id="price_idr" name="price_idr" type="number" min={0} step={1000} inputMode="numeric" defaultValue={a?.price_idr ?? 0} />
              </Field>
              <Field id="capacity" label="Kuota peserta" optional hint="Lewat kuota, pendaftar masuk waitlist.">
                <input id="capacity" name="capacity" type="number" min={1} inputMode="numeric" placeholder="tanpa batas" defaultValue={a?.capacity ?? ''} />
              </Field>
            </div>
            <FieldsEditor initial={a?.registration_fields ?? DEFAULT_FIELDS} />
            <label className="check-field"><input type="checkbox" name="is_public" defaultChecked={a?.is_public ?? true} /> Tampilkan di agenda (publik)</label>
          </EditorSection>

          <EditorSection n={6} title="Setelah daftar" hint="Isi halaman konfirmasi yang dilihat peserta setelah mendaftar.">
            <div className="form-grid">
              <Field id="meeting_url" label="Link meeting" optional hint="Hanya peserta terkonfirmasi, terbuka 1 jam sebelum acara.">
                <input id="meeting_url" name="meeting_url" type="url" pattern="https://.*" defaultValue={info?.meeting_url ?? ''} placeholder="https://meet.google.com/…" />
              </Field>
              <Field id="recording_url" label="Link rekaman khusus member" optional hint="Untuk verified member (segera hadir). Rekaman publik diisi di bagian Dokumentasi.">
                <input id="recording_url" name="recording_url" type="url" pattern="https://.*" defaultValue={info?.recording_url ?? ''} placeholder="https://youtu.be/…" />
              </Field>
            </div>
            <NextStepsEditor initial={a?.next_steps ?? []} />
          </EditorSection>

          <EditorSection n={7} title="Dokumentasi" hint="Rekaman dan foto kegiatan, tampil di halaman event dan di daftar Kegiatan lalu pada agenda. Foto pertama jadi sampul.">
            <Field id="youtube_url" label="Rekaman YouTube" optional hint="Video publik/unlisted di channel SWE Growth. Diputar langsung di halaman event, terbuka untuk semua orang.">
              <input id="youtube_url" name="youtube_url" type="url" pattern={YOUTUBE_URL_PATTERN} defaultValue={a?.youtube_url ?? ''} placeholder="https://youtu.be/…" />
            </Field>
            <PhotosEditor initial={a?.photos ?? []} folder={a?.id ?? 'baru'} />
          </EditorSection>

          <div className="editor-save">
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Menyimpan…' : a ? 'Simpan perubahan' : 'Simpan & publikasikan'}</button>
            {a && <span className="muted">Terakhir diubah {formatWibDate(a.updated_at)}, {formatWibTime(a.updated_at)}</span>}
          </div>
        </form>

        {a && <Registrants activityTitle={a.title} fields={a.registration_fields} rows={registrations} />}
      </div>
    </section>
  );
}

function EditorSection({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="editor-section">
      <legend><span className="editor-n">{n}</span>{title}</legend>
      {hint && <p className="form-sub">{hint}</p>}
      {children}
    </fieldset>
  );
}

/** Unduh poster PNG (1080×1350) dari data event yang tersimpan, siap dibagikan. */
function PosterButton({ activity, organizer }: { activity: Activity; organizer: string | null }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-ghost sm"
      type="button"
      disabled={busy}
      title="Dari data yang sudah disimpan"
      onClick={async () => {
        setBusy(true);
        try {
          await downloadEventPoster(activity, organizer);
        } catch (e) {
          alert(`Poster gagal dibuat: ${e instanceof Error ? e.message : e}`);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? 'Membuat poster…' : 'Download poster'}
    </button>
  );
}

function CopyLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-ghost sm"
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}${path}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? 'Tersalin ✓' : 'Salin link publik'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Google Calendar
// ---------------------------------------------------------------------------

const calendarText = (r: CalendarSyncResult) =>
  r.error ? `Gagal sinkron: ${r.detail ?? r.error}`
  : r.status === 'not_configured' ? 'Google Calendar belum disambungkan (secrets GOOGLE_* belum diisi di Supabase).'
  : r.status === 'skipped' ? 'Belum bisa dibuat di Google Calendar: isi jadwal mulai dulu.'
  : r.status === 'cancelled' ? 'Event Google dibatalkan; tamu sudah dikabari.'
  : r.status === 'created' ? `Event Google dibuat, ${r.invited ?? 0} peserta diundang.`
  : r.status === 'updated' ? `Google Calendar diperbarui (${r.invited ?? 0} tamu).`
  : r.status === 'unchanged' ? `Sudah sinkron (${r.invited ?? 0} tamu).`
  : 'Menyinkronkan…';

/** Status sinkron: peserta terkonfirmasi = tamu event Google; Google yang mengirim undangan. */
function CalendarPanel({ activity: a, result, onSync }: { activity: Activity; result: CalendarSyncResult | null; onSync: () => void }) {
  const busy = result !== null && result.status === undefined && !result.error;
  return (
    <div className={`calendar-panel${result?.error ? ' error' : ''}`}>
      <div>
        <strong>Google Calendar</strong>
        <span>
          {result
            ? calendarText(result)
            : a.google_event_id
              ? `Tersinkron ${a.calendar_synced_at ? `${formatWibDate(a.calendar_synced_at)}, ${formatWibTime(a.calendar_synced_at)}` : ''}. Peserta terkonfirmasi otomatis jadi tamu.`
              : 'Belum ada event Google. Sinkronkan untuk membuatnya dan mengundang peserta yang sudah terdaftar.'}
        </span>
      </div>
      <div className="inline-actions">
        {a.google_event_url && <a className="btn btn-ghost sm" href={a.google_event_url} target="_blank" rel="noopener">Buka di Calendar ↗</a>}
        <button className="btn btn-ghost sm" type="button" disabled={busy} onClick={onSync}>{busy ? 'Menyinkronkan…' : 'Sinkronkan sekarang'}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Statistik
// ---------------------------------------------------------------------------

type Activity = NonNullable<Route.ComponentProps['loaderData']['activity']>;

function Stats({ activity: a, registrations }: { activity: Activity; registrations: ActivityRegistrationRow[] }) {
  const count = (s: string) => registrations.filter((r) => r.status === s).length;
  const confirmed = count('confirmed');
  const weekAgo = Date.now() - 7 * 86_400_000;
  const lastWeek = registrations.filter((r) => r.status !== 'cancelled' && Date.parse(r.created_at) >= weekAgo).length;
  const withQuestion = registrations.filter((r) => r.status !== 'cancelled' && Object.keys(r.answers ?? {}).length > 0).length;

  const tiles = [
    { label: 'Terdaftar', value: String(confirmed), sub: a.capacity ? `dari ${a.capacity} kursi (${Math.round((confirmed / a.capacity) * 100)}%)` : 'tanpa batas kuota' },
    { label: 'Waitlist', value: String(count('waitlisted')) },
    { label: 'Batal', value: String(count('cancelled')) },
    { label: '7 hari terakhir', value: String(lastWeek), sub: 'pendaftar baru' },
    { label: 'Mengisi pertanyaan', value: String(withQuestion) },
  ];

  return (
    <div className="stat-row">
      {tiles.map((t) => (
        <div className="stat" key={t.label}>
          <span className="stat-label">{t.label}</span>
          <b className="stat-value">{t.value}</b>
          {t.sub && <span className="stat-sub">{t.sub}</span>}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pendaftar
// ---------------------------------------------------------------------------

const csvCell = (v: string | null | undefined) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function Registrants({ activityTitle, fields, rows }: { activityTitle: string; fields: RegistrationField[]; rows: ActivityRegistrationRow[] }) {
  const download = () => {
    const header = ['Kode', 'Nama', 'Email', 'WhatsApp', 'Status', 'Daftar', ...fields.map((f) => f.label)];
    const lines = rows.map((r) =>
      [registrationCode(r.id), r.name, r.email, r.whatsapp, r.status, r.created_at, ...fields.map((f) => r.answers?.[f.id])].map(csvCell).join(','),
    );
    const blob = new Blob(['﻿' + [header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `pendaftar-${slugify(activityTitle)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="panel" style={{ marginTop: 28 }}>
      <div className="panel-head">
        <h2>Pendaftar ({rows.length})</h2>
        {rows.length > 0 && <button className="btn btn-ghost sm" type="button" onClick={download}>Unduh CSV</button>}
      </div>
      {rows.length === 0 ? (
        <p className="muted">Belum ada pendaftar.</p>
      ) : (
        <div className="registrants">
          <table>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={r.status === 'cancelled' ? { opacity: 0.5 } : undefined}>
                  <td className="mono-code">{registrationCode(r.id)}</td>
                  <td>{r.name}</td>
                  <td>{r.email}</td>
                  <td>{r.whatsapp ?? '—'}</td>
                  <td>{r.status}</td>
                  <td>
                    {fields.filter((f) => r.answers?.[f.id]).map((f) => <div key={f.id}><b>{f.label}:</b> {r.answers[f.id]}</div>)}
                    {!fields.some((f) => r.answers?.[f.id]) && r.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor daftar: pertanyaan pendaftaran & langkah berikutnya
// ---------------------------------------------------------------------------

/**
 * Pertanyaan tambahan di form pendaftaran. Disimpan sebagai JSON lewat input
 * tersembunyi; id dipertahankan saat label diubah supaya jawaban lama tetap cocok.
 */
function FieldsEditor({ initial }: { initial: RegistrationField[] }) {
  const [fields, setFields] = useState(initial);
  const update = (i: number, patch: Partial<RegistrationField>) =>
    setFields((list) => list.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const newId = () => {
    let n = fields.length + 1;
    while (fields.some((f) => f.id === `pertanyaan-${n}`)) n++;
    return `pertanyaan-${n}`;
  };

  return (
    <fieldset className="fields-editor">
      <legend>Pertanyaan di form pendaftaran</legend>
      <p className="form-sub">Nama, email, dan WhatsApp sudah otomatis dari profil peserta.</p>
      <input type="hidden" name="registration_fields" value={JSON.stringify(fields.filter((f) => f.label.trim()))} />
      {fields.map((f, i) => (
        <div className="fields-editor-row" key={f.id}>
          <input aria-label="Pertanyaan" value={f.label} maxLength={200} placeholder="Tulis pertanyaan" onChange={(e) => update(i, { label: e.target.value })} />
          <select aria-label="Jenis jawaban" value={f.type} onChange={(e) => update(i, { type: e.target.value as RegistrationField['type'] })}>
            <option value="text">Teks singkat</option>
            <option value="textarea">Paragraf</option>
            <option value="select">Pilihan</option>
          </select>
          <label className="check-field"><input type="checkbox" checked={f.required} onChange={(e) => update(i, { required: e.target.checked })} /> Wajib</label>
          <button className="link-btn" type="button" onClick={() => setFields((list) => list.filter((_, j) => j !== i))}>Hapus</button>
          {f.type === 'select' && (
            <input
              className="span-all"
              aria-label="Pilihan jawaban"
              placeholder="Pilihan, pisahkan dengan koma"
              defaultValue={(f.options ?? []).join(', ')}
              onChange={(e) => update(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
            />
          )}
        </div>
      ))}
      {fields.length < 10 && (
        <button className="btn btn-ghost sm" type="button" onClick={() => setFields((list) => [...list, { id: newId(), label: '', type: 'text', required: false }])}>
          + Tambah pertanyaan
        </button>
      )}
    </fieldset>
  );
}

/** Langkah custom di halaman konfirmasi: judul, keterangan, link (mis. grup WA event, materi). */
function NextStepsEditor({ initial }: { initial: NextStep[] }) {
  const [steps, setSteps] = useState(initial);
  const update = (i: number, patch: Partial<NextStep>) => setSteps((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <fieldset className="fields-editor">
      <legend>Langkah berikutnya (custom)</legend>
      <p className="form-sub">
        Tampil setelah langkah bawaan (simpan jadwal & link meeting). Contoh: "Gabung grup WA peserta", "Isi pre-test", "Unduh materi".
      </p>
      <input type="hidden" name="next_steps" value={JSON.stringify(steps.filter((s) => s.title.trim()))} />
      {steps.map((s, i) => (
        <div className="step-editor-row" key={i}>
          <input aria-label="Judul langkah" value={s.title} maxLength={120} placeholder="Judul, mis. Gabung grup WA peserta" onChange={(e) => update(i, { title: e.target.value })} />
          <input aria-label="Link" type="url" pattern="https://.*" value={s.url} placeholder="https://…" onChange={(e) => update(i, { url: e.target.value })} />
          <input className="span-all" aria-label="Keterangan" value={s.description} maxLength={300} placeholder="Keterangan singkat (opsional)" onChange={(e) => update(i, { description: e.target.value })} />
          <button className="link-btn" type="button" onClick={() => setSteps((list) => list.filter((_, j) => j !== i))}>Hapus</button>
        </div>
      ))}
      {steps.length < 10 && (
        <button className="btn btn-ghost sm" type="button" onClick={() => setSteps((list) => [...list, { title: '', url: '', description: '' }])}>
          + Tambah langkah
        </button>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Foto dokumentasi
// ---------------------------------------------------------------------------

const PHOTO_BUCKET = 'event-photos';
const MAX_PHOTOS = 40;
const MAX_SIDE = 1920;

/** Perkecil foto (sisi terpanjang 1920px, JPEG) supaya cepat dimuat dan di bawah batas 5 MB bucket. */
async function shrinkPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  return blob ?? file;
}

/**
 * Foto diunggah ke Supabase Storage (bucket event-photos) begitu dipilih, lalu
 * daftarnya (urutan + keterangan) ikut tersimpan saat tombol Simpan ditekan.
 * Bisa juga menempel link gambar yang sudah ada di tempat lain.
 */
function PhotosEditor({ initial, folder }: { initial: EventPhoto[]; folder: string }) {
  const [photos, setPhotos] = useState(initial);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const room = MAX_PHOTOS - photos.length;

  const update = (i: number, patch: Partial<EventPhoto>) => setPhotos((list) => list.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const move = (i: number, delta: number) =>
    setPhotos((list) => {
      const next = [...list];
      const [item] = next.splice(i, 1);
      next.splice(Math.max(0, Math.min(next.length, i + delta)), 0, item);
      return next;
    });

  const upload = async (files: FileList | null) => {
    const picked = Array.from(files ?? []).slice(0, room);
    if (picked.length === 0) return;
    setError(null);
    setUploading(picked.length);
    const storage = supabase().storage.from(PHOTO_BUCKET);
    for (const file of picked) {
      const body = await shrinkPhoto(file);
      const ext = body.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() ?? 'jpg').toLowerCase();
      const path = `${folder}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await storage.upload(path, body, { contentType: body.type || file.type, cacheControl: '31536000' });
      if (uploadError) setError(`Gagal mengunggah ${file.name}: ${uploadError.message}`);
      else setPhotos((list) => [...list, { url: storage.getPublicUrl(path).data.publicUrl, caption: '' }]);
      setUploading((n) => n - 1);
    }
  };

  const addLink = () => {
    if (!link.startsWith('https://')) return setError('Link foto harus diawali https://');
    setError(null);
    setPhotos((list) => [...list, { url: link, caption: '' }]);
    setLink('');
  };

  return (
    <div className="photos-editor">
      <input type="hidden" name="photos" value={JSON.stringify(photos.map((p) => ({ url: p.url, caption: p.caption.trim() })))} />
      {error && <p className="form-message error">{error}</p>}
      {photos.length > 0 && (
        <ul className="photos-editor-list">
          {photos.map((p, i) => (
            <li key={`${i}-${p.url}`}>
              <img src={p.url} alt="" />
              <div>
                <input aria-label={`Keterangan foto ${i + 1}`} value={p.caption} maxLength={200} placeholder={i === 0 ? 'Keterangan (opsional) · foto sampul' : 'Keterangan (opsional)'} onChange={(e) => update(i, { caption: e.target.value })} />
                <div className="inline-actions">
                  {i > 0 && <button className="link-btn" type="button" onClick={() => move(i, -1)}>↑ Naik</button>}
                  {i < photos.length - 1 && <button className="link-btn" type="button" onClick={() => move(i, 1)}>↓ Turun</button>}
                  <button className="link-btn" type="button" onClick={() => setPhotos((list) => list.filter((_, j) => j !== i))}>Hapus</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {room > 0 ? (
        <div className="photos-editor-add">
          <label className="btn btn-ghost sm">
            {uploading > 0 ? `Mengunggah ${uploading} foto…` : '+ Unggah foto'}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={uploading > 0} onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
          </label>
          <input aria-label="Link foto" type="url" value={link} placeholder="atau tempel link gambar https://…" onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} />
          <button className="btn btn-ghost sm" type="button" disabled={!link} onClick={addLink}>Tambah link</button>
        </div>
      ) : (
        <p className="form-sub">Maksimal {MAX_PHOTOS} foto.</p>
      )}
      {photos.length !== initial.length || photos.some((p, i) => p.url !== initial[i]?.url || p.caption !== initial[i]?.caption) ? (
        <p className="field-hint">Tekan Simpan supaya perubahan foto tampil di halaman publik.</p>
      ) : null}
    </div>
  );
}
