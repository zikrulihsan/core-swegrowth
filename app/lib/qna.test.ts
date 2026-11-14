import { describe, expect, it } from 'vitest';
import { applyModeration, applyVote, groupQuestions, nextToPresent, sortQuestions, timeAgo, type Question } from './qna';

const q = (id: string, patch: Partial<Question> = {}): Question => ({
  id,
  body: `Pertanyaan ${id}`,
  status: 'open',
  is_highlighted: false,
  is_anonymous: false,
  author_name: null,
  author_handle: null,
  author_avatar_url: null,
  votes: 0,
  voted: false,
  is_mine: false,
  created_at: '2026-11-14T10:00:00Z',
  answered_at: null,
  ...patch,
});

describe('sortQuestions', () => {
  const list = [
    q('a', { votes: 2, created_at: '2026-11-14T10:00:00Z' }),
    q('b', { votes: 5, created_at: '2026-11-14T10:05:00Z' }),
    q('c', { votes: 2, created_at: '2026-11-14T09:00:00Z' }),
    q('d', { votes: 0, created_at: '2026-11-14T11:00:00Z' }),
  ];

  it('populer: vote terbanyak, seri yang lebih dulu masuk', () => {
    expect(sortQuestions(list, 'popular').map((x) => x.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('terbaru: paling baru di atas', () => {
    expect(sortQuestions(list, 'recent').map((x) => x.id)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('tab terjawab: yang terakhir dijawab di atas', () => {
    const answered = [
      q('x', { status: 'answered', answered_at: '2026-11-14T10:10:00Z', votes: 9 }),
      q('y', { status: 'answered', answered_at: '2026-11-14T10:20:00Z' }),
    ];
    expect(sortQuestions(answered, 'popular', 'answered').map((x) => x.id)).toEqual(['y', 'x']);
  });

  it('tidak mengubah array asli', () => {
    const copy = [...list];
    sortQuestions(list, 'recent');
    expect(list).toEqual(copy);
  });
});

describe('groupQuestions', () => {
  it('memisahkan per status dan mengambil sorotan yang masih terbuka', () => {
    const g = groupQuestions([q('a', { is_highlighted: true }), q('b', { status: 'answered' }), q('c', { status: 'hidden' }), q('d')]);
    expect(g.highlighted?.id).toBe('a');
    expect(g.open.map((x) => x.id)).toEqual(['a', 'd']);
    expect(g.answered.map((x) => x.id)).toEqual(['b']);
    expect(g.hidden.map((x) => x.id)).toEqual(['c']);
  });

  it('tanpa sorotan', () => {
    expect(groupQuestions([q('a')]).highlighted).toBeNull();
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-11-14T12:00:00Z');
  it('menit dan jam', () => {
    expect(timeAgo('2026-11-14T11:59:40Z', now)).toBe('baru saja');
    expect(timeAgo('2026-11-14T11:55:00Z', now)).toBe('5 menit lalu');
    expect(timeAgo('2026-11-14T09:00:00Z', now)).toBe('3 jam lalu');
  });
  it('lebih dari sehari jadi tanggal', () => {
    expect(timeAgo('2026-11-10T09:00:00Z', now)).not.toMatch(/lalu/);
  });
});

describe('nextToPresent', () => {
  it('vote terbanyak yang belum dijawab, selain yang disorot', () => {
    const next = nextToPresent([
      q('a', { votes: 9, is_highlighted: true }),
      q('b', { votes: 7, status: 'answered' }),
      q('c', { votes: 3, status: 'hidden' }),
      q('d', { votes: 2 }),
      q('e', { votes: 2, created_at: '2026-11-14T09:00:00Z' }),
    ]);
    expect(next?.id).toBe('e');
  });

  it('null kalau tidak ada lagi', () => {
    expect(nextToPresent([q('a', { status: 'answered' })])).toBeNull();
  });
});

describe('applyModeration', () => {
  const list = [q('a', { is_highlighted: true }), q('b'), q('c')];

  it('sorotan pindah: yang lain lepas', () => {
    const out = applyModeration(list, 'b', { is_highlighted: true });
    expect(out.filter((x) => x.is_highlighted).map((x) => x.id)).toEqual(['b']);
  });

  it('terjawab: lepas sorotan dan dapat waktu jawab', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    const a = applyModeration(list, 'a', { status: 'answered' }, now)[0];
    expect(a).toMatchObject({ status: 'answered', is_highlighted: false, answered_at: now.toISOString() });
  });

  it('dibuka lagi: waktu jawab dihapus', () => {
    const answered = [q('a', { status: 'answered', answered_at: '2026-11-14T11:00:00Z' })];
    expect(applyModeration(answered, 'a', { status: 'open' })[0].answered_at).toBeNull();
  });

  it('tidak mengubah array asli', () => {
    applyModeration(list, 'b', { is_highlighted: true });
    expect(list[0].is_highlighted).toBe(true);
  });
});

describe('applyVote', () => {
  it('vote dan batal vote', () => {
    const once = applyVote([q('a', { votes: 2 })], 'a');
    expect(once[0]).toMatchObject({ voted: true, votes: 3 });
    expect(applyVote(once, 'a')[0]).toMatchObject({ voted: false, votes: 2 });
  });
});
