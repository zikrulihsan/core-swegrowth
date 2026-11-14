import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { ActivityRow } from '~/lib/database.types';
import { fetchQuestions, groupQuestions, importRegistrationQuestions, qnaPath, QNA_STATUS_LABEL, type Question } from '~/lib/qna';

/**
 * Ringkasan tanya jawab di editor event: jumlah per status, link ke halaman
 * moderasi, dan impor pertanyaan dari form pendaftaran.
 */
export function QnaPanel({ activity: a }: { activity: ActivityRow }) {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const textFields = a.registration_fields.filter((f) => f.type !== 'select');
  const [fieldId, setFieldId] = useState(textFields.find((f) => f.id === 'pertanyaan')?.id ?? textFields[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(
    () =>
      fetchQuestions(a.id, true)
        .then(setQuestions)
        .catch(() => setQuestions([])),
    [a.id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const runImport = async () => {
    setBusy(true);
    setMessage(null);
    const { data, error } = await importRegistrationQuestions(a.id, fieldId);
    setBusy(false);
    if (error) {
      setMessage({ ok: false, text: `Impor gagal: ${error.message}` });
      return;
    }
    setMessage({
      ok: true,
      text: data ? `${data} pertanyaan diimpor sebagai anonim.` : 'Tidak ada pertanyaan baru (yang sudah diimpor dilewati).',
    });
    await load();
  };

  const g = groupQuestions(questions ?? []);

  return (
    <div className="panel mt-28">
      <div className="panel-head">
        <h2>Tanya jawab</h2>
        <Link to={qnaPath(a)} target="_blank">
          Buka & moderasi ↗
        </Link>
      </div>
      <p className="muted">
        Status: <b>{QNA_STATUS_LABEL[a.qna_status]}</b> (ubah di bagian Pendaftaran).{' '}
        {questions === null
          ? 'Memuat…'
          : `${g.open.length} belum dijawab · ${g.answered.length} terjawab · ${g.hidden.length} disembunyikan.`}
      </p>

      {textFields.length > 0 && (
        <div className="qna-import">
          <p className="form-sub">
            Impor jawaban dari form pendaftaran jadi pertanyaan <b>anonim</b> (pendaftar menulisnya tanpa tahu akan tampil publik). Aman
            diulang: yang sudah diimpor dilewati.
          </p>
          <div className="inline-actions">
            <select aria-label="Pertanyaan pendaftaran yang diimpor" value={fieldId} onChange={(e) => setFieldId(e.target.value)}>
              {textFields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost sm" type="button" disabled={busy || !fieldId} onClick={runImport}>
              {busy ? 'Mengimpor…' : 'Impor ke tanya jawab'}
            </button>
          </div>
          {message && <p className={`form-message ${message.ok ? 'success' : 'error'}`}>{message.text}</p>}
        </div>
      )}
    </div>
  );
}
