import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './auth';
import { fetchQuestions, type Question } from './qna';

/**
 * Daftar pertanyaan satu event. Tidak real-time: dimuat saat halaman dibuka,
 * lalu hanya diperbarui lewat `reload` (tombol Perbarui) atau `refresh`
 * (setelah aksi seperti bertanya, vote, dan moderasi). Sesi login dipakai kalau ada,
 * supaya vote & "pertanyaanmu" ikut terbaca.
 *
 * `mutate` mengubah daftar di layar lebih dulu (optimistis). Hasil muat yang
 * dimulai sebelum perubahan itu dibuang, supaya tampilan tidak sempat kembali
 * ke data lama.
 */
export function useQuestions(activityId: string) {
  const { loading, user, isAdmin } = useAuth();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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

  /** Untuk tombol Perbarui: sama dengan refresh, plus status `refreshing`. */
  const reload = () => {
    setRefreshing(true);
    return refresh().finally(() => setRefreshing(false));
  };

  const mutate = useCallback((update: (list: Question[]) => Question[]) => {
    version.current++;
    setQuestions((list) => (list ? update(list) : list));
  }, []);

  useEffect(() => {
    if (!loading) void refresh();
  }, [loading, refresh]);

  return { questions, mutate, loadError, refreshing, now, refresh, reload, loading, user, signedIn, isAdmin };
}
