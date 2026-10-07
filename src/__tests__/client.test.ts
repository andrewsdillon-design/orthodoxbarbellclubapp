import { ApiError, createClient, errorMessage, fetchTransport, type Transport, type TransportRequest } from '../api/client';
import { createMockState, MOCK_TOKEN, mockTransport } from '../api/mock';
import type { LogBody } from '../api/types';

function recording(status: number, data: unknown) {
  const calls: TransportRequest[] = [];
  const transport: Transport = async (req) => {
    calls.push(req);
    return { status, data };
  };
  return { calls, transport };
}

describe('API client', () => {
  it('sends the bearer token, the method, the path and the body', async () => {
    const { calls, transport } = recording(200, { id: 1 });
    const api = createClient({ transport, getToken: () => 'abc' });
    await api.updateMe({ units: 'kg' });
    expect(calls[0]).toEqual({ method: 'PATCH', path: '/me', body: { units: 'kg' }, token: 'abc' });
  });

  it("doesn't send a token to log in", async () => {
    const { calls, transport } = recording(200, { token: 't', user: {} });
    const api = createClient({ transport, getToken: () => 'old' });
    await api.login('a@b.com', 'pw', 'iPhone 15');
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/auth/login', token: null });
    expect(calls[0].body).toEqual({ email: 'a@b.com', password: 'pw', device: 'iPhone 15' });
  });

  it('builds paths and query strings', async () => {
    const { calls, transport } = recording(200, {});
    const api = createClient({ transport, getToken: () => 't' });
    await api.history({ before: '2026-10-01', limit: 20 });
    await api.history();
    await api.exerciseProgress('Bench Press');
    await api.logSession(3, 1, { performed_on: '2026-10-05', notes: '', sets: [] });
    await api.leaderboard('st nick');
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /history?before=2026-10-01&limit=20',
      'GET /history',
      'GET /progress/Bench%20Press',
      'PUT /sessions/3/1/log',
      'GET /clubs/st%20nick/leaderboard',
    ]);
  });

  it('turns error responses into ApiError with the problems list', async () => {
    const { transport } = recording(400, { error: 'Check the sets.', problems: ['Squat set 1 reps', 'Bench set 2 weight'] });
    const api = createClient({ transport, getToken: () => 't' });
    const err = await api.today().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.problems).toHaveLength(2);
    expect(errorMessage(err)).toBe('Squat set 1 reps\nBench set 2 weight');
  });

  it('calls onUnauthorized on a 401', async () => {
    const { transport } = recording(401, { error: 'Sign in again.' });
    const onUnauthorized = jest.fn();
    const api = createClient({ transport, getToken: () => 't', onUnauthorized });
    await expect(api.me()).rejects.toMatchObject({ status: 401, unauthorized: true });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  describe('fetchTransport', () => {
    const realFetch = globalThis.fetch;
    afterEach(() => {
      globalThis.fetch = realFetch;
    });

    it('calls the API base with JSON and the Authorization header', async () => {
      const fetchMock = jest.fn().mockResolvedValue({ status: 200, text: async () => '{"ok":true}' });
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const res = await fetchTransport('https://orthodoxbarbellclub.com/api/v1/')({
        method: 'POST',
        path: '/bodyweight',
        body: { date: '2026-10-01', weight_kg: 90 },
        token: 'tok',
      });
      expect(res).toEqual({ status: 200, data: { ok: true } });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://orthodoxbarbellclub.com/api/v1/bodyweight');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer tok');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(init.body)).toEqual({ date: '2026-10-01', weight_kg: 90 });
    });

    it('reports no signal as an offline ApiError', async () => {
      globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as unknown as typeof fetch;
      const err = await fetchTransport('https://x.test')({ method: 'GET', path: '/me' }).catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.offline).toBe(true);
    });
  });
});

describe('mock mode', () => {
  const make = () => {
    let token: string | null = null;
    const api = createClient({ transport: mockTransport(createMockState(), 0), getToken: () => token });
    return {
      api,
      signIn: async () => {
        token = (await api.login('moses@demo.test', 'anything', 'test')).token;
      },
    };
  };

  it('needs a sign-in, like the server', async () => {
    const { api, signIn } = make();
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
    await expect(api.login('a@b.com', '', 'test')).rejects.toMatchObject({ status: 401 });
    await signIn();
    const me = await api.me();
    expect(me.clubs.length).toBeGreaterThan(0);
  });

  it('serves fixtures shaped like the spec', async () => {
    const { api, signIn } = make();
    await signIn();
    const { programs, addons } = await api.programs();
    expect(programs.length).toBeGreaterThan(0);
    expect(addons.every((a) => a.kind === 'addon')).toBe(true);
    const e = await api.enrollment();
    expect(e?.next).toBeTruthy();
    const today = await api.today();
    expect(today).toMatchObject({ week: e!.next!.week, day_index: e!.next!.day_index, logged: false });
    for (const ex of today!.exercises) {
      expect(['main', 'variation', 'accessory', 'plyo', 'test', 'strongman']).toContain(ex.kind);
      expect(typeof ex.reps).toBe('string');
    }
    const board = await api.leaderboard(e!.club ?? (await api.me()).clubs[0].slug);
    expect(Object.keys(board.boards).sort()).toEqual(['bench', 'deadlift', 'squat', 'total']);
  });

  it('logs a session, moves today along and reports PRs', async () => {
    const { api, signIn } = make();
    await signIn();
    const today = (await api.today())!;
    const main = today.exercises.find((x) => x.prescribed_kg != null)!;
    const body: LogBody = {
      performed_on: '2026-10-05',
      notes: 'Felt strong',
      sets: [{ index: main.index, set_no: main.first_set, weight_kg: (main.prescribed_kg as number) + 40, reps: 5, rpe: 9 }],
    };
    const out = await api.logSession(today.week, today.day_index, body);
    expect(out.session.logged).toBe(true);
    expect(out.prs).toContain(main.exercise);
    const next = (await api.today())!;
    expect(`${next.week}/${next.day_index}`).not.toBe(`${today.week}/${today.day_index}`);
    const { workouts } = await api.history({ limit: 1 });
    expect(workouts[0]).toMatchObject({ week: today.week, day_index: today.day_index, notes: 'Felt strong' });
  });

  it('rejects an empty log and out-of-range sets', async () => {
    const { api, signIn } = make();
    await signIn();
    const today = (await api.today())!;
    await expect(api.logSession(today.week, today.day_index, { performed_on: '2026-10-05', notes: '', sets: [] })).rejects.toMatchObject({
      status: 400,
      message: 'Log at least one set.',
    });
    await expect(
      api.logSession(today.week, today.day_index, {
        performed_on: '2026-10-05',
        notes: '',
        sets: [{ index: 0, set_no: 99, weight_kg: 50, reps: 5, rpe: null }],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('offers to submit a tested single and makes it the new training max', async () => {
    const { api, signIn } = make();
    await signIn();
    const e = (await api.enrollment())!;
    const testWeek = e.program.phases.find(([name, weeks]) => /test/i.test(name) && weeks[0] > 0)![1][0];
    const session = await api.session(testWeek, 0);
    const squat = session.exercises.find((x) => x.kind === 'test' && x.exercise === 'Squat')!;
    const out = await api.logSession(testWeek, 0, {
      performed_on: '2026-10-05',
      notes: '',
      sets: [{ index: squat.index, set_no: squat.first_set, weight_kg: 180, reps: 1, rpe: 10 }],
    });
    expect(out.submit_max).toEqual({ lift: 'squat', weight_kg: 180, performed_on: '2026-10-05' });
    expect(out.new_maxes).toContain('Squat');
    expect((await api.enrollment())!.maxes_kg.Squat).toBe(180);
    const r = await api.submitMax({ lift: 'squat', weight_kg: 180, bodyweight_kg: 90, performed_on: '2026-10-05', video_url: 'https://youtu.be/x' });
    expect(r.status).toBe('pending');
    await expect(
      api.submitMax({ lift: 'squat', weight_kg: 180, bodyweight_kg: 90, performed_on: '2026-10-05', video_url: 'not a link' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('follows the units setting and maxes in prescriptions', async () => {
    const { api, signIn } = make();
    await signIn();
    await api.updateMe({ units: 'kg' });
    const today = (await api.today())!;
    const ex = today.exercises.find((x) => x.prescribed_kg != null && x.percent != null)!;
    expect(ex.prescribed_display).toMatch(/ kg$/);
    const before = ex.prescribed_kg as number;
    const max = (await api.enrollment())!.maxes_kg[ex.exercise];
    if (max) {
      await api.updateMaxes({ [ex.exercise]: max * 1.1 });
      const after = (await api.today())!.exercises.find((x) => x.index === ex.index)!;
      expect(after.prescribed_kg).toBeGreaterThan(before);
    }
  });

  it('keeps body weight and body fat', async () => {
    const { api, signIn } = make();
    await signIn();
    const entry = await api.addBodyweight('2026-10-05', 88.5);
    expect((await api.me()).bodyweight_kg).toBe(88.5);
    await api.deleteBodyweight(entry.id);
    const { methods } = await api.bodyfat();
    const bf = await api.addBodyfat({ date: '2026-10-05', percent: 15, method: methods[0], weight_kg: 90 });
    expect(bf.lean_kg).toBe(76.5);
    await expect(api.addBodyfat({ date: '2026-10-05', percent: 15, method: 'Guessing' })).rejects.toMatchObject({ status: 400 });
  });

  it('uses the mock token', async () => {
    const { api } = make();
    const { token } = await api.login('a@b.com', 'pw', 'x');
    expect(token).toBe(MOCK_TOKEN);
  });
});

describe('when the site has no app API yet', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('explains an HTML 404 instead of showing a raw error', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ status: 404, text: async () => '<!doctype html><title>404</title>' }) as unknown as typeof fetch;
    const api = createClient({ transport: fetchTransport('https://x.test/api/v1'), getToken: () => null });
    const err = await api.login('a@b.com', 'pw', 'iPhone').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/isn't ready for the app yet/);
  });
});
