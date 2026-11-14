import { useEffect, useState } from 'react';
import { slugify } from '~/lib/activities';
import { fetchActivityFeedback } from '~/lib/admin-data';
import type { ActivityFeedbackRow, ActivityRegistrationRow } from '~/lib/database.types';
import { formatWibDate } from '~/lib/format';
import { RATING_LABEL } from '~/lib/my-activities';
import { csvCell } from './Registrants';

/** Ringkasan feedback peserta (Portal → Kegiatanku): rata-rata, sebaran nilai, dan komentar. */
export function FeedbackPanel({
  activityId,
  activityTitle,
  registrations,
}: {
  activityId: string;
  activityTitle: string;
  registrations: ActivityRegistrationRow[];
}) {
  const [rows, setRows] = useState<ActivityFeedbackRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchActivityFeedback(activityId).then(
      (data) => !cancelled && setRows(data),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [activityId]);

  const nameOf = (userId: string) => registrations.find((r) => r.user_id === userId)?.name ?? 'Peserta';
  const list = rows ?? [];
  const average = list.length ? list.reduce((sum, r) => sum + r.rating, 0) / list.length : 0;
  const counts = [5, 4, 3, 2, 1].map((n) => ({ n, count: list.filter((r) => r.rating === n).length }));

  const download = () => {
    const lines = list.map((r) => [nameOf(r.user_id), r.rating, r.comment, r.updated_at].map((v) => csvCell(String(v))).join(','));
    const blob = new Blob(['﻿' + ['Nama,Nilai,Komentar,Waktu', ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `feedback-${slugify(activityTitle)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="panel mt-28">
      <div className="panel-head">
        <h2>Feedback peserta ({list.length})</h2>
        {list.length > 0 && (
          <button className="btn btn-ghost sm" type="button" onClick={download}>
            Unduh CSV
          </button>
        )}
      </div>
      {failed ? (
        <p className="form-message error">Feedback belum bisa dimuat. Muat ulang halaman untuk mencoba lagi.</p>
      ) : rows === null ? (
        <p className="muted">Memuat…</p>
      ) : list.length === 0 ? (
        <p className="muted">
          Belum ada feedback. Peserta terkonfirmasi bisa memberi feedback di Portal → Kegiatanku setelah acara dimulai.
        </p>
      ) : (
        <>
          <div className="feedback-summary">
            <p className="feedback-average">
              <b>{average.toFixed(1)}</b> / 5<span>{RATING_LABEL[Math.round(average)]}</span>
            </p>
            <ul className="feedback-bars">
              {counts.map(({ n, count }) => (
                <li key={n}>
                  <span>{n}★</span>
                  <span className="feedback-bar" aria-hidden="true">
                    <span style={{ width: `${(count / list.length) * 100}%` }} />
                  </span>
                  <span>{count}</span>
                </li>
              ))}
            </ul>
          </div>
          <ul className="rows mt-16">
            {list.map((r) => (
              <li key={r.user_id}>
                <div className="row-main">
                  <strong>
                    {'★'.repeat(r.rating)}
                    <span className="muted">{'★'.repeat(5 - r.rating)}</span> · {nameOf(r.user_id)}
                  </strong>
                  {r.comment && <span>{r.comment}</span>}
                </div>
                <span className="muted">{formatWibDate(r.updated_at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
