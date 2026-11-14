import { describe, expect, it } from 'vitest';
import type { Activity } from './activities';
import { feedbackOpen, splitMyActivities } from './my-activities';

const act = (id: string, patch: Partial<Activity> = {}) =>
  ({
    id,
    slug: id,
    title: id,
    status: 'registration_open',
    starts_at: null,
    ends_at: null,
    recurrence: null,
    recurrence_until: null,
    photos: [],
    ...patch,
  }) as Activity;

describe('splitMyActivities', () => {
  const now = new Date('2026-11-14T12:00:00Z');
  const list = [
    act('lalu-1', { starts_at: '2026-10-01T12:00:00Z' }),
    act('lalu-2', { starts_at: '2026-11-01T12:00:00Z' }),
    act('nanti', { starts_at: '2026-11-20T12:00:00Z' }),
    act('tak-daftar', { starts_at: '2026-11-21T12:00:00Z' }),
    act('batal', { starts_at: '2026-11-22T12:00:00Z' }),
  ];
  const regs = [
    { activity_id: 'lalu-1', status: 'confirmed' as const },
    { activity_id: 'lalu-2', status: 'confirmed' as const },
    { activity_id: 'nanti', status: 'waitlisted' as const },
    { activity_id: 'batal', status: 'cancelled' as const },
  ];

  it('hanya yang didaftar & tidak dibatalkan, dibagi akan datang / lewat', () => {
    const { upcoming, past } = splitMyActivities(list, regs, now);
    expect(upcoming.map((m) => [m.activity.id, m.status])).toEqual([['nanti', 'waitlisted']]);
    expect(past.map((m) => m.activity.id)).toEqual(['lalu-2', 'lalu-1']);
  });
});

describe('feedbackOpen', () => {
  const now = new Date('2026-11-14T12:00:00Z');
  it('setelah mulai atau ditandai selesai', () => {
    expect(feedbackOpen({ status: 'registration_open', starts_at: '2026-11-14T11:00:00Z' }, now)).toBe(true);
    expect(feedbackOpen({ status: 'registration_open', starts_at: '2026-11-15T11:00:00Z' }, now)).toBe(false);
    expect(feedbackOpen({ status: 'completed', starts_at: null }, now)).toBe(true);
    expect(feedbackOpen({ status: 'scheduled', starts_at: null }, now)).toBe(false);
  });
});
