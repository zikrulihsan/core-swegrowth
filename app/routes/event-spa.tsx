/**
 * Detail event tanpa prerender: dipakai saat build tanpa env Supabase (CI, fork)
 * karena `loader` hanya boleh ada kalau minimal satu path-nya di-prerender.
 */
export { default, meta, clientLoader } from './event';
