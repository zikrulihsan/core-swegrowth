import { useState } from 'react';
import { Link, useRevalidator } from 'react-router';
import type { Route } from './+types/portal';
import { CommunityChannels } from '~/components/CommunityChannels';
import { PortalShell, type PortalSection } from '~/components/PortalShell';
import {
  activityPath,
  activityStatusLabel,
  upcomingSessions,
  type Activity,
  fetchMyRegistrationStatuses,
  getPublishedActivities,
} from '~/lib/activities';
import { displayName, requireUser, useAuth } from '~/lib/auth';
import { fetchWhatsappGroups } from '~/lib/community';
import type { RecommendationRow, RegistrationStatus } from '~/lib/database.types';
import { formatWibTime, relativeFromNow, wibDayParts } from '~/lib/format';
import { MY_ACTIVITIES_PATH, myActivityPath } from '~/lib/my-activities';
import {
  categoryOf,
  directoryPath,
  fetchMyRecommendations,
  rejectReasonLabel,
  STATUS_LABEL,
  SUBMIT_PATH,
  withdrawRecommendation,
} from '~/lib/recommendations';

export const meta: Route.MetaFunction = () => [{ title: 'Portal — SWE Growth' }, { name: 'robots', content: 'noindex' }];

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const user = await requireUser(request);
  // Panel tambahan boleh gagal sendiri-sendiri: null = gagal dimuat, beda dengan daftar kosong.
  const [regs, activities, groups, recommendations] = await Promise.all([
    fetchMyRegistrationStatuses(user.id),
    getPublishedActivities(),
    fetchWhatsappGroups().catch(() => null),
    fetchMyRecommendations(user.id).catch(() => null),
  ]);

  const upcoming = upcomingSessions(activities, { undatedLast: true });
  const statusById = new Map(regs.map((r) => [r.activity_id, r.status]));
  const others = upcoming.filter((a) => !statusById.has(a.id));

  return {
    mine: upcoming.filter((a) => statusById.has(a.id)).map((a) => ({ activity: a, status: statusById.get(a.id)! })),
    // Beranda hanya cuplikan; agenda lengkap & kegiatan lalu ada di /agenda.
    others: others.slice(0, AGENDA_LIMIT),
    moreAgenda: others.length > AGENDA_LIMIT,
    groups,
    recommendations,
  };
}

const AGENDA_LIMIT = 3;

export function HydrateFallback() {
  return <div className="loading-block">Memuat portal…</div>;
}

const registrationLabel: Record<RegistrationStatus, string> = {
  confirmed: 'terdaftar',
  waitlisted: 'waitlist',
  cancelled: 'batal',
};

export default function Portal({ loaderData }: Route.ComponentProps) {
  const { mine, others, moreAgenda, groups, recommendations } = loaderData;
  const empty = mine.length === 0 && others.length === 0;
  const { user, profile } = useAuth();
  const firstName = displayName(profile, user).split(' ')[0];

  const sections: PortalSection[] = [
    ...(mine.length > 0 ? [{ id: 'diikuti', label: 'Kegiatanmu berikutnya' }] : []),
    ...(others.length > 0 ? [{ id: 'agenda', label: 'Agenda mendatang' }] : []),
    { id: 'komunitas', label: 'Komunitas' },
    ...(groups === null || groups.length > 0 ? [{ id: 'grup', label: 'Grup per bidang' }] : []),
    { id: 'rekomendasiku', label: 'Rekomendasiku' },
  ];

  return (
    <PortalShell title={`Halo, ${firstName}`} sections={sections}>
      <div className="portal-stack">
        {empty && <p className="muted">Belum ada agenda. Saat admin menambahkannya, semuanya muncul di halaman ini.</p>}

        {mine.length > 0 && (
          <div className="panel" id="diikuti">
            <div className="panel-head">
              <h2>Kegiatanmu berikutnya</h2>
              <Link to={MY_ACTIVITIES_PATH}>Semua kegiatanku</Link>
            </div>
            <EventRows
              items={mine.map((m) => ({ activity: m.activity, tag: registrationLabel[m.status], href: myActivityPath(m.activity) }))}
            />
          </div>
        )}

        {others.length > 0 && (
          <div className="panel" id="agenda">
            <div className="panel-head">
              <h2>Agenda mendatang</h2>
              <Link to="/agenda">Lihat selengkapnya</Link>
            </div>
            <EventRows items={others.map((a) => ({ activity: a, tag: activityStatusLabel[a.status], href: activityPath(a) }))} />
            {moreAgenda && (
              <p className="panel-more">
                <Link className="text-link" to="/agenda">
                  Lihat agenda lainnya di halaman Agenda →
                </Link>
              </p>
            )}
          </div>
        )}

        <div className="panel" id="komunitas">
          <div className="panel-head">
            <h2>Gabung komunitas</h2>
          </div>
          <CommunityChannels />
        </div>

        {groups === null ? (
          <div className="panel" id="grup">
            <div className="panel-head">
              <h2>Grup per bidang</h2>
            </div>
            <LoadError what="Daftar grup" />
          </div>
        ) : (
          groups.length > 0 && (
            <div className="panel" id="grup">
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
          )
        )}

        <MyRecommendations items={recommendations} />
      </div>
    </PortalShell>
  );
}

function EventRows({ items }: { items: { activity: Activity; tag: string; href: string }[] }) {
  return (
    <ul className="rows event-rows">
      {items.map(({ activity: a, tag, href }) => {
        const parts = a.starts_at ? wibDayParts(a.starts_at) : null;
        return (
          <li key={a.id}>
            <span className="date-tile">
              {parts ? (
                <>
                  <b>{parts.day}</b>
                  <span>{parts.month}</span>
                </>
              ) : (
                <span>TBA</span>
              )}
            </span>
            <div className="row-main">
              <Link className="title" to={href}>
                {a.title}
              </Link>
              <span>
                {[a.starts_at && `${relativeFromNow(a.starts_at)} · ${formatWibTime(a.starts_at)}`, a.mode].filter(Boolean).join(' · ') ||
                  'Jadwal menyusul'}
              </span>
            </div>
            <span className="chip">{tag}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Pesan gagal muat per panel, dengan tombol muat ulang data portal. */
function LoadError({ what }: { what: string }) {
  const revalidator = useRevalidator();
  const loading = revalidator.state === 'loading';
  return (
    <p className="form-message error load-error" role="status">
      {what} belum bisa dimuat. Cek koneksi, lalu{' '}
      <button className="link-btn" type="button" disabled={loading} onClick={() => revalidator.revalidate()}>
        {loading ? 'memuat ulang…' : 'muat ulang'}
      </button>
      .
    </p>
  );
}

const WITHDRAW_ERROR = {
  locked: 'Usulan ini sudah direview, jadi tidak bisa ditarik lagi.',
  failed: 'Gagal menarik usulan. Cek koneksi, lalu coba lagi.',
} as const;

/** Usulan rekomendasi milik member: status review, edit/tarik selama masih menunggu. */
function MyRecommendations({ items }: { items: RecommendationRow[] | null }) {
  const revalidator = useRevalidator();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; text: string } | null>(null);

  const withdraw = async (r: RecommendationRow) => {
    setBusy(r.id);
    setNotice(null);
    try {
      const result = await withdrawRecommendation(r.id);
      if (result !== 'ok') setNotice({ id: r.id, text: WITHDRAW_ERROR[result] });
      await revalidator.revalidate();
    } catch {
      setNotice({ id: r.id, text: WITHDRAW_ERROR.failed });
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  return (
    <div className="panel" id="rekomendasiku">
      <div className="panel-head">
        <h2>Rekomendasiku</h2>
        <Link to={SUBMIT_PATH}>Kirim rekomendasi</Link>
      </div>
      {items === null ? (
        <LoadError what="Rekomendasimu" />
      ) : items.length === 0 ? (
        <p className="form-sub">
          Tahu acara, komunitas, course, atau buku yang bikin kamu grow?{' '}
          <Link className="text-link" to={SUBMIT_PATH}>
            Rekomendasikan ke member lain
          </Link>
          .
        </p>
      ) : (
        <ul className="rows">
          {items.map((r) => (
            <li key={r.id}>
              <div className="row-main">
                <strong>{r.title}</strong>
                <span>
                  {categoryOf(r.category).label}
                  {r.status === 'rejected' && rejectReasonLabel(r.reject_reason) && ` · ${rejectReasonLabel(r.reject_reason)}`}
                  {r.status === 'rejected' && r.reject_note && ` · ${r.reject_note}`}
                </span>
                {r.status === 'pending' &&
                  (confirming === r.id ? (
                    <span className="inline-actions rec-row-actions rec-confirm">
                      <span>Tarik dari antrean review?</span>
                      <button className="link-btn danger" type="button" disabled={busy === r.id} onClick={() => withdraw(r)}>
                        {busy === r.id ? 'Menarik…' : 'Ya, tarik'}
                      </button>
                      <button className="link-btn" type="button" disabled={busy === r.id} onClick={() => setConfirming(null)} autoFocus>
                        Batal
                      </button>
                    </span>
                  ) : (
                    <span className="inline-actions rec-row-actions">
                      <Link className="text-link" to={`${SUBMIT_PATH}?edit=${r.id}`}>
                        Edit
                      </Link>
                      <button
                        className="link-btn"
                        type="button"
                        onClick={() => {
                          setNotice(null);
                          setConfirming(r.id);
                        }}
                      >
                        Tarik
                      </button>
                    </span>
                  ))}
                {r.status === 'approved' && (
                  <span>
                    <Link className="text-link" to={directoryPath(r.category)}>
                      Lihat di direktori
                    </Link>
                  </span>
                )}
                {notice?.id === r.id && (
                  <span className="row-error" role="alert">
                    {notice.text}
                  </span>
                )}
              </div>
              <span className={`chip rec-status ${r.status}`}>{STATUS_LABEL[r.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
