import { useRef, useState, type FormEvent } from 'react';
import { data, Link, useNavigate, useRevalidator } from 'react-router';
import type { Route } from './+types/admin-event';
import { CalendarPanel } from '~/components/admin-event/CalendarPanel';
import { CopyLink, EditorSection, PosterButton } from '~/components/admin-event/EditorParts';
import { PhotosEditor } from '~/components/admin-event/PhotosEditor';
import { QnaPanel } from '~/components/admin-event/QnaPanel';
import { Registrants } from '~/components/admin-event/Registrants';
import { FieldsEditor, NextStepsEditor } from '~/components/admin-event/RegistrationEditors';
import { Stats } from '~/components/admin-event/Stats';
import { Avatar } from '~/components/Avatar';
import { EventWriter } from '~/components/EventWriter';
import {
  ACTIVITY_STATUSES,
  activityPath,
  activityStatusLabel,
  linkedinHandle,
  RECURRENCE_LABEL,
  slugify,
  speakerPhoto,
  syncCalendar,
  type CalendarSyncResult,
} from '~/lib/activities';
import { loadEventEditor, requestRebuild, saveActivity } from '~/lib/admin-data';
import { Field, isoToWib, useMutation, val, wibToIso } from '~/lib/admin-form';
import { requireAdmin } from '~/lib/auth';
import type { ActivityStatus, EventPhoto, NextStep, QnaStatus, Recurrence, RegistrationField } from '~/lib/database.types';
import { formatWibDate, formatWibTime } from '~/lib/format';
import { QNA_STATUS_LABEL } from '~/lib/qna';
import { SITE_URL } from '~/lib/site';
import { YOUTUBE_URL_PATTERN, youtubeId } from '~/lib/youtube';

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: `${loaderData?.activity?.title ?? 'Event baru'} — Admin SWE Growth` },
  { name: 'robots', content: 'noindex' },
];

/** /admin/event/baru atau /admin/event/:id */
export async function clientLoader({ request, params }: Route.ClientLoaderArgs) {
  await requireAdmin(request);
  const isNew = params.id === 'baru';
  const loaded = await loadEventEditor(isNew ? null : params.id);
  if (!isNew && !loaded.activity) throw data(null, { status: 404 });
  return loaded;
}

export function HydrateFallback() {
  return <div className="loading-block">Memuat event…</div>;
}

const DEFAULT_FIELDS: RegistrationField[] = [{ id: 'pertanyaan', label: 'Pertanyaan untuk pembicara', type: 'textarea', required: false }];

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
      qna_status: (val(form, 'qna_status') || 'open') as QnaStatus,
      price_idr: Number.parseInt(val(form, 'price_idr') || '0', 10),
      capacity: capacity ? Number.parseInt(capacity, 10) : null,
      registration_fields: JSON.parse(val(form, 'registration_fields') || '[]') as RegistrationField[],
      next_steps: JSON.parse(val(form, 'next_steps') || '[]') as NextStep[],
      highlights: val(form, 'highlights')
        .split('\n')
        .map((h) => h.trim())
        .filter(Boolean)
        .slice(0, 8),
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

    const saved = { id: '' };
    const ok = await run(
      async () => {
        const result = await saveActivity(a?.id ?? null, fields, links);
        saved.id = result.id ?? '';
        return result;
      },
      a ? 'Perubahan tersimpan dan langsung tampil di halaman publik.' : 'Event dibuat.',
    );

    if (!ok) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const id = a?.id ?? saved.id;
    if (!a) navigate(`/admin/event/${id}`, { replace: true });
    // Jadwal/judul berubah → event Google & semua tamu ikut diperbarui.
    void sync(id);
    void requestRebuild();
  };

  return (
    <section className="block">
      <div className="wrap admin-wrap">
        <Link className="back" to="/admin?tab=event">
          ← Semua event
        </Link>
        <div className="editor-head">
          <h1 className="page-title">{a ? a.title : 'Event baru'}</h1>
          {a && (
            <div className="inline-actions">
              <Link className="btn btn-ghost sm" to={activityPath(a)} target="_blank">
                Lihat halaman publik ↗
              </Link>
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
            <Field id="title" label="Judul">
              <input id="title" name="title" required minLength={3} maxLength={140} defaultValue={a?.title} />
            </Field>
            <Field id="summary" label="Ringkasan" optional hint="Satu-dua kalimat di bawah judul.">
              <textarea id="summary" name="summary" rows={2} maxLength={500} defaultValue={a?.summary} />
            </Field>
            <Field id="image_url" label="Link poster (gambar)" optional>
              <input
                id="image_url"
                name="image_url"
                type="url"
                pattern="https://.*"
                value={poster}
                onChange={(e) => setPoster(e.target.value)}
                placeholder="https://…/poster.png"
              />
            </Field>
            {poster.startsWith('https://') && <img className="poster-preview" src={poster} alt="Pratinjau poster" />}
            <Field
              id="organizer_group_id"
              label="Penyelenggara"
              hint={
                groups.length === 0
                  ? 'Tambah subgrup (mis. English Club) di Admin → Subgrup.'
                  : 'Event tetap tampil sebagai kegiatan komunitas SWE Growth.'
              }
            >
              <select id="organizer_group_id" name="organizer_group_id" defaultValue={a?.organizer_group_id ?? ''}>
                <option value="">SWE Growth (tanpa subgrup)</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id="slug"
              label="Slug URL"
              optional
              hint={a ? 'Mengubah slug membuat link lama yang sudah dibagikan tidak berlaku.' : 'Kosongkan = otomatis dari judul.'}
            >
              <input id="slug" name="slug" defaultValue={a?.slug} placeholder="otomatis dari judul" />
            </Field>
          </EditorSection>

          <EditorSection
            n={2}
            title="Pembicara (opsional)"
            hint="Kosongkan kalau belum ada pembicara; bagian ini tidak tampil. Kalau diisi, tampil menonjol di bagian atas halaman event. Foto otomatis dari profil LinkedIn; isi link foto kalau ingin pakai foto lain."
          >
            <div className="speaker-editor">
              <Avatar
                name={a?.speaker || 'Pembicara'}
                src={speakerPhoto({ speaker_linkedin_url: speakerLinkedin || null, speaker_photo_url: speakerPhotoUrl || null })}
                size={72}
              />
              <div className="form-grid">
                <Field id="speaker" label="Nama" optional>
                  <input id="speaker" name="speaker" maxLength={120} defaultValue={a?.speaker ?? ''} />
                </Field>
                <Field id="speaker_title" label="Peran / jabatan" optional>
                  <input
                    id="speaker_title"
                    name="speaker_title"
                    maxLength={120}
                    defaultValue={a?.speaker_title ?? ''}
                    placeholder="Founder & CEO @Rubythalib.ai"
                  />
                </Field>
                <Field
                  id="speaker_linkedin_url"
                  label="LinkedIn"
                  optional
                  hint={speakerLinkedin && !linkedinHandle(speakerLinkedin) ? 'Format: https://www.linkedin.com/in/username' : undefined}
                >
                  <input
                    id="speaker_linkedin_url"
                    name="speaker_linkedin_url"
                    type="url"
                    pattern="https://.*"
                    value={speakerLinkedin}
                    onChange={(e) => setSpeakerLinkedin(e.target.value)}
                    placeholder="https://www.linkedin.com/in/…"
                  />
                </Field>
                <Field id="speaker_photo_url" label="Link foto" optional>
                  <input
                    id="speaker_photo_url"
                    name="speaker_photo_url"
                    type="url"
                    pattern="https://.*"
                    value={speakerPhotoUrl}
                    onChange={(e) => setSpeakerPhotoUrl(e.target.value)}
                    placeholder="kosong = dari LinkedIn"
                  />
                </Field>
              </div>
            </div>
          </EditorSection>

          <EditorSection
            n={3}
            title="Jadwal & tempat"
            hint="Untuk event berulang, isi mulai & selesai sesi pertama. Sesi berikutnya dihitung otomatis dan agenda selalu menampilkan sesi terdekat."
          >
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
                  {(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => (
                    <option key={r} value={r}>
                      {RECURRENCE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </Field>
              {recurrence && (
                <Field id="recurrence_until" label="Berulang sampai" optional hint="Tanggal sesi terakhir. Kosongkan = terus berulang.">
                  <input id="recurrence_until" name="recurrence_until" type="date" defaultValue={a?.recurrence_until ?? ''} />
                </Field>
              )}
              <Field id="mode" label="Format">
                <select id="mode" name="mode" defaultValue={a?.mode ?? 'online'}>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </Field>
              <Field id="location" label="Lokasi" optional hint="Publik. Jangan isi link meeting di sini.">
                <input id="location" name="location" defaultValue={a?.location ?? ''} placeholder="Zoom / Google Meet / nama venue" />
              </Field>
            </div>
          </EditorSection>

          <EditorSection
            n={4}
            title="Detail acara"
            hint="Tulis sendiri atau minta Gemini menyusunnya dari isi form. Caption media sosial juga bisa dibuat di sini."
          >
            <EventWriter
              formRef={formRef}
              organizers={Object.fromEntries(groups.map((g) => [g.id, g.name]))}
              publicUrl={a ? `${SITE_URL}${activityPath(a)}` : null}
            />
            <Field
              id="highlights"
              label="Yang akan dibahas"
              optional
              hint="Satu poin per baris, maksimal 8. Tampil menonjol di atas deskripsi — tulis yang bikin orang penasaran."
            >
              <textarea
                id="highlights"
                name="highlights"
                rows={4}
                defaultValue={a?.highlights?.join('\n')}
                placeholder={
                  'Bagaimana ceritanya bangun perusahaan AI di Indonesia?\nAI engineer itu sebenarnya apa?\nBagaimana prospek karier AI engineering ke depannya?'
                }
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
                  {ACTIVITY_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {activityStatusLabel[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="price_idr" label="Biaya (Rp)" hint="0 = Gratis. Event berbayar belum bisa didaftar (pembayaran segera hadir).">
                <input
                  id="price_idr"
                  name="price_idr"
                  type="number"
                  min={0}
                  step={1000}
                  inputMode="numeric"
                  defaultValue={a?.price_idr ?? 0}
                />
              </Field>
              <Field id="capacity" label="Kuota peserta" optional hint="Lewat kuota, pendaftar masuk waitlist.">
                <input
                  id="capacity"
                  name="capacity"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="tanpa batas"
                  defaultValue={a?.capacity ?? ''}
                />
              </Field>
              <Field
                id="qna_status"
                label="Tanya jawab"
                hint="Halaman /tanya: peserta bertanya & vote, admin menandai terjawab. Ditutup = daftar tetap bisa dibaca."
              >
                <select id="qna_status" name="qna_status" defaultValue={a?.qna_status ?? 'open'}>
                  {(Object.keys(QNA_STATUS_LABEL) as QnaStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {QNA_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <FieldsEditor initial={a?.registration_fields ?? DEFAULT_FIELDS} />
            <label className="check-field">
              <input type="checkbox" name="is_public" defaultChecked={a?.is_public ?? true} /> Tampilkan di agenda (publik)
            </label>
          </EditorSection>

          <EditorSection n={6} title="Setelah daftar" hint="Isi halaman konfirmasi yang dilihat peserta setelah mendaftar.">
            <div className="form-grid">
              <Field id="meeting_url" label="Link meeting" optional hint="Hanya peserta terkonfirmasi, terbuka 1 jam sebelum acara.">
                <input
                  id="meeting_url"
                  name="meeting_url"
                  type="url"
                  pattern="https://.*"
                  defaultValue={info?.meeting_url ?? ''}
                  placeholder="https://meet.google.com/…"
                />
              </Field>
              <Field
                id="recording_url"
                label="Link rekaman khusus member"
                optional
                hint="Untuk verified member (segera hadir). Rekaman publik diisi di bagian Dokumentasi."
              >
                <input
                  id="recording_url"
                  name="recording_url"
                  type="url"
                  pattern="https://.*"
                  defaultValue={info?.recording_url ?? ''}
                  placeholder="https://youtu.be/…"
                />
              </Field>
            </div>
            <NextStepsEditor initial={a?.next_steps ?? []} />
          </EditorSection>

          <EditorSection
            n={7}
            title="Dokumentasi"
            hint="Rekaman dan foto kegiatan, tampil di halaman event dan di daftar Kegiatan lalu pada agenda. Foto pertama jadi sampul."
          >
            <Field
              id="youtube_url"
              label="Rekaman YouTube"
              optional
              hint="Video publik/unlisted di channel SWE Growth. Diputar langsung di halaman event, terbuka untuk semua orang."
            >
              <input
                id="youtube_url"
                name="youtube_url"
                type="url"
                pattern={YOUTUBE_URL_PATTERN}
                defaultValue={a?.youtube_url ?? ''}
                placeholder="https://youtu.be/…"
              />
            </Field>
            <PhotosEditor initial={a?.photos ?? []} folder={a?.id ?? 'baru'} />
          </EditorSection>

          <div className="editor-save">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Menyimpan…' : a ? 'Simpan perubahan' : 'Simpan & publikasikan'}
            </button>
            {a && (
              <span className="muted">
                Terakhir diubah {formatWibDate(a.updated_at)}, {formatWibTime(a.updated_at)}
              </span>
            )}
          </div>
        </form>

        {a && <QnaPanel activity={a} />}

        {a && <Registrants activityTitle={a.title} fields={a.registration_fields} rows={registrations} />}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Google Calendar
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Statistik
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pendaftar
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Editor daftar: pertanyaan pendaftaran & langkah berikutnya
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Foto dokumentasi
// ---------------------------------------------------------------------------
