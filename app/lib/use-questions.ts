import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth';
import { fetchQuestions, type Question } from './qna';

/**
 * Daftar pertanyaan satu event yang diperbarui berkala selama tab terlihat
 * (dan langsung saat tab kembali terlihat). Sesi login dipakai kalau ada,
 * supaya vote & "pertanyaanmu" ikut terbaca.
 */
export function useQuestions(activityId: string, intervalMs: number) {
  const { loading, user, isAdmin } = useAuth();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const signedIn = Boolean(user);

  const refresh = useCallback(
    () =>
      fetchQuestions(activityId, signedIn).then(
        (list) => {
          setQuestions(list);
          setLoadError(false);
          setNow(new Date());
        },
        () => setLoadError(true),
      ),
    [activityId, signedIn],
  );

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

  return { questions, setQuestions, loadError, now, refresh, loading, user, signedIn, isAdmin };
}
