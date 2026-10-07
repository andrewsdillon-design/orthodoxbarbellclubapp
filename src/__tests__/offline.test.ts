import { ApiError } from '../api/client';
import type { LogBody, LogResult, Session } from '../api/types';
import { OfflineQueue, type QueuedLog } from '../lib/offlineQueue';
import { buildLogBody, fillPrescribed, FormProblems, initForm } from '../lib/sessionForm';

const body = (performed_on = '2026-10-05'): LogBody => ({
  performed_on,
  notes: '',
  sets: [{ index: 0, set_no: 1, weight_kg: 100, reps: 5, rpe: null }],
});

function memoryStore() {
  let saved: QueuedLog[] | null = null;
  return {
    load: async () => saved,
    save: async (items: QueuedLog[]) => {
      saved = JSON.parse(JSON.stringify(items));
    },
    peek: () => saved,
  };
}

describe('offline queue', () => {
  it('keeps workouts saved with no signal and sends them when back online', async () => {
    const store = memoryStore();
    let online = false;
    const sent: string[] = [];
    const q = new OfflineQueue(async (item) => {
      if (!online) throw new ApiError(0, 'offline');
      sent.push(`${item.week}/${item.day_index}`);
      return {} as LogResult;
    }, store);

    await q.add({ week: 3, day_index: 0, day: 'Day 1', body: body() });
    await q.add({ week: 3, day_index: 1, day: 'Day 2', body: body() });
    expect(store.peek()).toHaveLength(2);

    const first = await q.flush();
    expect(first.stoppedOffline).toBe(true);
    expect(q.snapshot()).toHaveLength(2);

    online = true;
    const second = await q.flush();
    expect(second.sent).toHaveLength(2);
    expect(sent).toEqual(['3/0', '3/1']);
    expect(q.snapshot()).toHaveLength(0);
    expect(store.peek()).toEqual([]);
  });

  it('survives a restart', async () => {
    const store = memoryStore();
    const a = new OfflineQueue(async () => ({}) as LogResult, store);
    await a.add({ week: 1, day_index: 0, day: 'Day 1', body: body() });
    const b = new OfflineQueue(async () => ({}) as LogResult, store);
    await b.load();
    expect(b.snapshot()).toHaveLength(1);
    expect(b.pendingFor(1, 0)?.day).toBe('Day 1');
  });

  it('replaces an older save of the same session', async () => {
    const q = new OfflineQueue(async () => ({}) as LogResult, memoryStore());
    await q.add({ week: 2, day_index: 0, day: 'Day 1', body: body('2026-10-01') });
    await q.add({ week: 2, day_index: 0, day: 'Day 1', body: body('2026-10-02') });
    expect(q.snapshot()).toHaveLength(1);
    expect(q.snapshot()[0].body.performed_on).toBe('2026-10-02');
  });

  it('marks a log the server refuses instead of retrying it forever', async () => {
    const q = new OfflineQueue(async (item) => {
      if (item.week === 1) throw new ApiError(400, 'That session isn’t in your program.');
      return {} as LogResult;
    }, memoryStore());
    await q.add({ week: 1, day_index: 0, day: 'Day 1', body: body() });
    await q.add({ week: 2, day_index: 0, day: 'Day 1', body: body() });
    const r = await q.flush();
    expect(r.sent).toHaveLength(1);
    expect(r.failed).toHaveLength(1);
    expect(q.snapshot()).toHaveLength(1);
    expect(q.snapshot()[0].error).toMatch(/isn’t in your program/);
  });

  it('stops on a 401 and keeps everything', async () => {
    const q = new OfflineQueue(async () => {
      throw new ApiError(401, 'Sign in again.');
    }, memoryStore());
    await q.add({ week: 1, day_index: 0, day: 'Day 1', body: body() });
    await q.flush();
    expect(q.snapshot()).toHaveLength(1);
    expect(q.snapshot()[0].error).toBeUndefined();
  });
});

const session: Session = {
  week: 4,
  day_index: 0,
  day: 'Day 1 - Heavy',
  phase: 'Accumulation',
  cycle: 1,
  logged: false,
  performed_on: null,
  notes: '',
  exercises: [
    { index: 0, exercise: 'Squat', kind: 'main', sets: 3, reps: '5', percent: 75, note: '', prescribed_kg: 140.6136, prescribed_display: '310 lb', tm_estimated: false, addon: '', learn: null, first_set: 1, logged_sets: [] },
    { index: 1, exercise: 'Squat', kind: 'main', sets: 1, reps: '3+', percent: 85, note: '', prescribed_kg: 150, prescribed_display: '330 lb', tm_estimated: false, addon: '', learn: null, first_set: 4, logged_sets: [] },
    { index: 2, exercise: 'Plank', kind: 'accessory', sets: 2, reps: '30-60s', percent: null, note: '', prescribed_kg: null, prescribed_display: '', tm_estimated: false, addon: '', learn: null, first_set: 1, logged_sets: [] },
  ],
};

describe('set logging form', () => {
  it('fills as prescribed in the lifter units', () => {
    const form = fillPrescribed(initForm(session, 'lb'), session, 'lb');
    expect(form[0]).toEqual([
      { weight: '310', reps: '5', rpe: '' },
      { weight: '310', reps: '5', rpe: '' },
      { weight: '310', reps: '5', rpe: '' },
    ]);
    expect(form[1][0]).toEqual({ weight: '330', reps: '3', rpe: '' });
    expect(form[2][0]).toEqual({ weight: '', reps: '', rpe: '' });
  });

  it("doesn't overwrite what's typed, and can fill one exercise", () => {
    const form = initForm(session, 'kg');
    form[0][0] = { weight: '135', reps: '6', rpe: '8' };
    const filled = fillPrescribed(form, session, 'kg', 0);
    expect(filled[0][0]).toEqual({ weight: '135', reps: '6', rpe: '8' });
    expect(filled[0][1].weight).toBe('140');
    expect(filled[1][0].weight).toBe('');
  });

  it('builds the LogBody in kg with numbered sets', () => {
    const form = initForm(session, 'lb');
    form[0][0] = { weight: '315', reps: '5', rpe: '8.5' };
    form[1][0] = { weight: '330', reps: '7', rpe: '' };
    const out = buildLogBody(form, session, 'lb', '2026-10-05', '  good day ');
    expect(out.notes).toBe('good day');
    expect(out.sets).toHaveLength(2);
    expect(out.sets[0]).toMatchObject({ index: 0, set_no: 1, reps: 5, rpe: 8.5 });
    expect(out.sets[0].weight_kg).toBeCloseTo(142.882, 3);
    expect(out.sets[1]).toMatchObject({ index: 1, set_no: 4, reps: 7, rpe: null });
  });

  it('round-trips logged sets into the form', () => {
    const logged = { ...session, exercises: session.exercises.map((e, i) => (i === 0 ? { ...e, logged_sets: [{ set_no: 2, weight_kg: 142.8816, reps: 5, rpe: 8 }] } : e)) };
    expect(initForm(logged, 'lb')[0][1]).toEqual({ weight: '315', reps: '5', rpe: '8' });
  });

  it('lists every problem', () => {
    const form = initForm(session, 'lb');
    expect(() => buildLogBody(form, session, 'lb', '2026-10-05', '')).toThrow('Log at least one set.');
    form[0][0] = { weight: 'abc', reps: '5', rpe: '' };
    form[0][1] = { weight: '300', reps: '5.5', rpe: '' };
    form[0][2] = { weight: '300', reps: '5', rpe: '11' };
    try {
      buildLogBody(form, session, 'lb', '2026-10-05', '');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(FormProblems);
      expect((e as FormProblems).problems).toEqual([
        'Squat set 1: check the weight.',
        'Squat set 2: reps should be a whole number.',
        'Squat set 3: RPE is 1 to 10.',
      ]);
    }
  });
});
