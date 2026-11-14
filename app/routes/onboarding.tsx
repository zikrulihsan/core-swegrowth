import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { Route } from './+types/onboarding';
import { CommunityChannels } from '~/components/CommunityChannels';
import { ProfileForm } from '~/components/ProfileForm';
import { fetchProfile, requireUser, safeNext, useAuth } from '~/lib/auth';
import { fetchWhatsappGroups } from '~/lib/community';
import type { MemberMotivationRow, WhatsappGroupRow } from '~/lib/database.types';
import { fetchMotivation, MOTIVATION_QUESTIONS, saveMotivation } from '~/lib/profile';

export const meta: Route.MetaFunction = () => [{ title: 'Gabung SWE Growth' }];

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const user = await requireUser(request);
  const [profile, motivation] = await Promise.all([fetchProfile(user.id), fetchMotivation(user.id)]);
  if (!profile) throw new Error('Profil tidak ditemukan. Pastikan migration Supabase sudah dijalankan.');
  return { profile, motivation, email: user.email };
}

type Step = 'kenalan' | 'profil' | 'grup';
const STEPS: { id: Step | 'akun'; label: string }[] = [
  { id: 'akun', label: 'Daftar akun' },
  { id: 'kenalan', label: 'Kenalan' },
  { id: 'profil', label: 'Isi profil' },
  { id: 'grup', label: 'Gabung komunitas' },
];

/**
 * Alur setelah daftar: kenalan (konteks + motivasi) → isi profil → kanal
 * komunitas (WhatsApp aktif; Telegram & Discord menyusul) + grup per bidang. RLS whatsapp_groups baru terbuka setelah keduanya tersimpan.
 */
export default function Onboarding({ loaderData }: Route.ComponentProps) {
  const { profile, email } = loaderData;
  const [params] = useSearchParams();
  const { refreshProfile } = useAuth();
  const [motivation, setMotivation] = useState(loaderData.motivation);
  const [step, setStep] = useState<Step>(loaderData.motivation ? 'profil' : 'kenalan');
  const [groups, setGroups] = useState<WhatsappGroupRow[]>([]);
  const next = safeNext(params.get('next'));

  const goTo = (s: Step) => {
    setStep(s);
    window.scrollTo({ top: 0 });
  };

  return (
    <section className="block">
      <div className="wrap wrap-760">
        <Steps current={step} />

        {step === 'kenalan' && (
          <MotivationStep
            motivation={motivation}
            onSaved={(m) => {
              setMotivation(m);
              goTo('profil');
            }}
          />
        )}

        {step === 'profil' && (
          <>
            <h1 className="page-title">Lengkapi profil member</h1>
            <p className="muted mb-26 measure-60">
              Setelah profil tersimpan, link komunitas (WhatsApp, Telegram, Discord) langsung muncul. Bagian bertanda (opsional) boleh
              dilengkapi nanti. Profil akan tampil publik; nomor WhatsApp dan email hanya terlihat oleh kamu dan admin. Email akun: {email}.{' '}
              <button className="link-btn" type="button" onClick={() => goTo('kenalan')}>
                Ubah jawaban kenalan
              </button>
            </p>
            <ProfileForm
              profile={profile}
              submitLabel="Simpan & dapatkan link komunitas"
              onSaved={async () => {
                const [list] = await Promise.all([fetchWhatsappGroups().catch(() => []), refreshProfile()]);
                setGroups(list);
                goTo('grup');
              }}
            />
          </>
        )}

        {step === 'grup' && <Welcome groups={groups} next={next} name={profile.full_name} />}
      </div>
    </section>
  );
}

function Steps({ current }: { current: Step }) {
  const index = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="signup-steps" aria-label="Langkah pendaftaran">
      {STEPS.map((s, i) => (
        <li key={s.id} data-state={i < index ? 'done' : undefined} aria-current={i === index ? 'step' : undefined}>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function MotivationStep({ motivation, onSaved }: { motivation: MemberMotivationRow | null; onSaved: (m: MemberMotivationRow) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const answers = Object.fromEntries(MOTIVATION_QUESTIONS.map((q) => [q.name, String(form.get(q.name) ?? '').trim()])) as Record<
      (typeof MOTIVATION_QUESTIONS)[number]['name'],
      string
    >;

    setBusy(true);
    setError(null);
    const { data, error: saveError } = await saveMotivation(motivation?.user_id ?? null, answers);
    setBusy(false);

    if (saveError) {
      setError('Jawaban belum tersimpan. Coba lagi.');
      return;
    }
    onSaved(data);
  };

  return (
    <>
      <h1 className="page-title">Kenalan dulu, yuk</h1>
      <div className="panel mb-22">
        <p className="mb-10">
          SWE Growth adalah komunitas software engineer Indonesia yang fokus bareng-bareng belajar <strong>career growth</strong>, bukan
          satu tech stack tertentu. Topiknya seperti Effective Engineer, Going Abroad, sampai System Design Interview.
        </p>
        <p className="muted">
          Jawabanmu di bawah membantu kami menyusun kelas, sharing session, dan program lain sesuai masalah yang teman-teman hadapi.{' '}
          <Link className="text-link" to="/tentang" target="_blank" rel="noopener">
            Baca cerita lengkap SWE Growth ↗
          </Link>
        </p>
      </div>

      <form className="form-card wide" onSubmit={onSubmit}>
        {error && <p className="form-message error">{error}</p>}
        {MOTIVATION_QUESTIONS.map((q) => (
          <div className="field" key={q.name}>
            <label htmlFor={q.name}>
              {q.label}
              {!q.required && <small> (opsional)</small>}
            </label>
            <textarea id={q.name} name={q.name} rows={3} maxLength={2000} required={q.required} defaultValue={motivation?.[q.name] ?? ''} />
          </div>
        ))}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Menyimpan…' : 'Lanjut isi profil'}
        </button>
      </form>
    </>
  );
}

function Welcome({ groups, next, name }: { groups: WhatsappGroupRow[]; next: string; name: string }) {
  return (
    <>
      <h1 className="page-title">Profil tersimpan. Selamat bergabung, {name.split(' ')[0]}!</h1>
      <p className="muted mb-22 measure-58">
        Yuk langsung gabung ke WhatsApp, tempat ngobrol utama yang sudah rame dari awal. Telegram baru dibuka, dan Discord menyusul. Semua
        link ini juga selalu ada di portal.
      </p>

      <div className="mb-22">
        <CommunityChannels />
      </div>

      {groups.length > 0 && (
        <div className="panel mb-22">
          <div className="panel-head">
            <h2>Grup per bidang</h2>
          </div>
          <ul className="rows">
            {groups.map((g) => (
              <li key={g.id}>
                <div className="row-main">
                  <strong>{g.name}</strong>
                  {g.description && <span>{g.description}</span>}
                </div>
                <a className="btn btn-ghost sm" href={g.invite_url} target="_blank" rel="noopener">
                  Gabung
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link className="btn btn-ghost" to={next}>
        Lanjut ke portal
      </Link>
    </>
  );
}
