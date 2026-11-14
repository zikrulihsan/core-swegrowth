import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './auth';
import { fetchQuestions, type Question } from './qna';

/**
 * Daftar pertanyaan satu event yang diperbarui berkala selama tab terlihat
 * (dan langsung saat tab kembali terlihat). Sesi login dipakai kalau ada,
 * supaya vote & "pertanyaanmu" ikut terbaca.
 *
 * `mutate` mengubah daftar di layar lebih dulu (optimistis). Hasil polling
 * yang mulai diambil sebelum perubahan itu dibuang, supaya tampilan tidak
 * sempat kembali ke data lama (vote berkedip, sorotan balik sebentar).
 */
export function useQuestions(activityId: string, intervalMs: number) {
  const { loading, user, isAdmin } = useAuth();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const version = useRef(0);
  const signedIn = Boolean(user);

  const refresh = useCallback(() => {
    const started = version.current;
    return fetchQuestions(activityId, signedIn).then(
      (list) => {
        if (started !== version.current) return;
        setQuestions(list);
        setLoadError(false);
        setNow(new Date());
      },
      () => setLoadError(true),
    );
  }, [activityId, signedIn]);

  const mutate = useCallback((update: (list: Question[]) => Question[]) => {
    version.current++;
    setQuestions((list) => (list ? update(list) : list));
  }, []);

  useEffect(() => {
    if (loading) return;
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, intervalMs);
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loading, refresh, intervalMs]);

  return { questions, mutate, loadError, now, refresh, loading, user, signedIn, isAdmin };
}
