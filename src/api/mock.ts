// Mock mode: an in-memory stand-in for the API that answers like the real server. It starts from
// fixtures.json (recorded from the Flask API by tools/record_fixtures.py) and keeps whatever you change
// until the app restarts, so logging, maxes, body weight and so on all behave.
import { e1rm, fmtWeight, INCREMENT, kgToLb, leanMass, roundTo } from '../lib/units';
import { isoDate } from '../lib/dates';
import type { Transport, TransportRequest, TransportResponse } from './client';
import type {
  AdminSummary,
  BodyFatEntry,
  ClubApplication,
  LeaderLift,
  ManageView,
  MemberAction,
  BodyWeightEntry,
  Club,
  EnrollBody,
  Enrollment,
  ExerciseProgress,
  Leaderboard,
  Lift,
  LogBody,
  LogResult,
  MaxResult,
  ProgramList,
  ProgramSummary,
  Progress,
  Session,
  SubmitMaxBody,
  User,
  Workout,
} from './types';
import fixtureData from './fixtures.json';

export interface Fixtures {
  me: User;
  programs: ProgramList;
  enrollment: Enrollment;
  sessions: Record<string, Session>;
  history: { workouts: Workout[] };
  progress: Progress;
  progress_by_exercise: Record<string, ExerciseProgress>;
  bodyweight: { entries: BodyWeightEntry[] };
  bodyfat: { entries: BodyFatEntry[]; methods: string[] };
  maxes: { results: MaxResult[] };
  clubs: Record<string, Club>;
  leaderboards: Record<string, Leaderboard>;
  manage: Record<string, ManageView>;
  club_lifts: Record<string, { pending: LeaderLift[]; reviewed: LeaderLift[] }>;
  admin_summary: AdminSummary;
  admin_applications: { applications: ClubApplication[] };
  admin_lifts: { lifts: LeaderLift[] };
}

export const MOCK_TOKEN = 'mock-token';
const LIFT_EXERCISE: Record<Lift, string> = { squat: 'Squat', bench: 'Bench Press', deadlift: 'Deadlift' };
const liftOf = (exercise: string) => (Object.keys(LIFT_EXERCISE) as Lift[]).find((k) => LIFT_EXERCISE[k] === exercise);

class Problem extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly problems: string[] = [],
  ) {
    super(message);
  }
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function createMockState(fixtures: Fixtures = fixtureData as unknown as Fixtures) {
  const s = clone(fixtures);
  return {
    ...s,
    token: null as string | null,
    recordedMaxes: { ...s.enrollment.maxes_kg },
    recordedProgram: s.enrollment.program.slug,
    loggedKeys: new Set(
      Object.values(s.sessions)
        .filter((x) => x.logged)
        .map((x) => `${x.week}/${x.day_index}`),
    ),
    nextId: 1000,
  };
}

export type MockState = ReturnType<typeof createMockState>;

/** Session keys in program order: "0/0", "0/1", ... */
function sessionOrder(state: MockState): string[] {
  const p = state.enrollment.program;
  const keys: string[] = [];
  for (let w = 0; w <= p.weeks; w++) for (let d = 0; d < p.days_per_week; d++) keys.push(`${w}/${d}`);
  return keys.filter((k) => getSessionRaw(state, k) !== null);
}

function phaseOf(program: ProgramSummary, week: number): string {
  return program.phases.find(([, weeks]) => weeks.includes(week))?.[0] ?? '';
}

/** A plain session for programs the fixtures don't cover (mock only): two main lifts a day. */
function syntheticSession(state: MockState, week: number, day: number): Session | null {
  const p = state.enrollment.program;
  if (week < 0 || week > p.weeks || day < 0 || day >= p.days_per_week || !p.main_lifts.length) return null;
  const phase = phaseOf(p, week) || 'Training';
  const test = /test|baseline/i.test(phase);
  const lifts = [0, 1].map((i) => p.main_lifts[(day * 2 + i) % p.main_lifts.length]);
  const percent = 70 + (week % 4) * 5;
  return {
    week,
    day_index: day,
    day: `Day ${day + 1}`,
    phase,
    cycle: 1,
    logged: false,
    performed_on: null,
    notes: '',
    exercises: [...new Set(lifts)].map((exercise, index) => ({
      index,
      exercise,
      kind: test ? 'test' : 'main',
      sets: test ? 1 : 5,
      reps: test ? 'Max' : '5',
      percent: test ? null : percent,
      note: test ? 'Work up in small jumps to a new max.' : '',
      prescribed_kg: null,
      prescribed_display: '',
      tm_estimated: false,
      addon: '',
      learn: null,
      first_set: 1,
      logged_sets: [],
    })),
  };
}

function getSessionRaw(state: MockState, key: string): Session | null {
  if (state.enrollment.program.slug === state.recordedProgram) return state.sessions[key] ?? null;
  if (!state.sessions[key]) {
    const [w, d] = key.split('/').map(Number);
    const made = syntheticSession(state, w, d);
    if (!made) return null;
    state.sessions[key] = made;
  }
  return state.sessions[key];
}

/** The session as the server would send it now: weights follow the current maxes and the lifter's units. */
function present(state: MockState, session: Session): Session {
  const units = state.me.units;
  const out = clone(session);
  for (const ex of out.exercises) {
    const now = state.enrollment.maxes_kg[ex.exercise];
    const then = state.recordedMaxes[ex.exercise];
    if (ex.percent != null && isNum(now)) {
      const base = ex.prescribed_kg != null && isNum(then) ? ex.prescribed_kg * (now / then) : (now * ex.percent) / 100;
      const shown = roundTo(units === 'kg' ? base : kgToLb(base), INCREMENT[units]);
      ex.prescribed_kg = units === 'kg' ? shown : shown / 2.20462262;
    }
    ex.prescribed_display = ex.prescribed_kg == null ? '' : fmtWeight(ex.prescribed_kg, units);
  }
  return out;
}

function sessionAt(state: MockState, week: number, day: number): Session {
  const raw = getSessionRaw(state, `${week}/${day}`);
  if (!raw) throw new Problem(404, "That session isn't in your program.");
  return raw;
}

function nextSession(state: MockState): Session | null {
  const start = `${state.enrollment.start_week}/0`;
  const order = sessionOrder(state);
  const from = Math.max(0, order.indexOf(start));
  const key = order.slice(from).find((k) => !state.loggedKeys.has(k));
  return key ? getSessionRaw(state, key) : null;
}

function refreshNext(state: MockState) {
  const n = nextSession(state);
  state.enrollment.next = n ? { week: n.week, day_index: n.day_index } : null;
}

function logSession(state: MockState, week: number, day: number, body: LogBody): LogResult {
  const session = sessionAt(state, week, day);
  if (!body || !Array.isArray(body.sets)) throw new Problem(400, 'Send the sets as a list.');
  const problems: string[] = [];
  const rows: { exercise: string; set_no: number; weight_kg: number | null; reps: number | null; rpe: number | null }[] = [];
  const seen = new Set<string>();
  body.sets.forEach((st, k) => {
    const ex = session.exercises[st.index];
    if (!ex) return void problems.push(`Set ${k + 1}'s exercise index is out of range.`);
    const lo = ex.first_set;
    const hi = ex.first_set + Math.max(ex.sets, 1) - 1;
    if (!Number.isInteger(st.set_no) || st.set_no < lo || st.set_no > hi)
      return void problems.push(`${ex.exercise} set number is out of range.`);
    if (st.weight_kg != null && (!isNum(st.weight_kg) || st.weight_kg < 0 || st.weight_kg > 1000))
      return void problems.push(`${ex.exercise} set ${st.set_no} weight is out of range.`);
    if (st.reps != null && (!Number.isInteger(st.reps) || st.reps < 0 || st.reps > 1000))
      return void problems.push(`${ex.exercise} set ${st.set_no} reps should be a whole number.`);
    if (st.rpe != null && (!isNum(st.rpe) || st.rpe < 1 || st.rpe > 10))
      return void problems.push(`${ex.exercise} set ${st.set_no} RPE is out of range.`);
    if (st.weight_kg == null && st.reps == null) return;
    const id = `${ex.exercise}/${st.set_no}`;
    if (seen.has(id)) return void problems.push(`${ex.exercise} set ${st.set_no} is in the list twice.`);
    seen.add(id);
    rows.push({ exercise: ex.exercise, set_no: st.set_no, weight_kg: st.weight_kg || null, reps: st.reps, rpe: st.rpe });
  });
  if (!rows.length && !problems.length) problems.push('Log at least one set.');
  if (problems.length) throw new Problem(400, problems[0], problems);
  const performed = body.performed_on || isoDate();

  // Personal records against everything logged before
  const best = new Map(state.progress.best_e1rm.map((b) => [b.exercise, b]));
  const prs: string[] = [];
  for (const r of rows) {
    if (!r.weight_kg || !r.reps) continue;
    const est = e1rm(r.weight_kg, r.reps);
    const old = best.get(r.exercise);
    if (old && est > old.e1rm_kg + 1e-6 && !prs.includes(r.exercise)) prs.push(r.exercise);
    if (!old || est > old.e1rm_kg) {
      best.set(r.exercise, { exercise: r.exercise, e1rm_kg: Math.round(est * 100) / 100, weight_kg: r.weight_kg, reps: r.reps, date: performed });
      const hist = (state.progress_by_exercise[r.exercise] ??= { exercise: r.exercise, history: [] });
      hist.history.push({ date: performed, e1rm_kg: Math.round(est * 100) / 100 });
    }
    const rm = (state.progress.rep_maxes[r.exercise] ??= {});
    if (r.reps <= 12) rm[String(r.reps)] = Math.max(rm[String(r.reps)] ?? 0, r.weight_kg);
  }
  state.progress.best_e1rm = [...best.values()].sort((a, b) => a.exercise.localeCompare(b.exercise));

  // Test-week maxes become the next cycle's training maxes
  const tested = new Set(session.exercises.filter((e) => e.kind === 'test').map((e) => e.exercise));
  const newMax: Record<string, number> = {};
  for (const r of rows)
    if (tested.has(r.exercise) && r.weight_kg && r.reps)
      newMax[r.exercise] = Math.max(newMax[r.exercise] ?? 0, e1rm(r.weight_kg, r.reps));
  Object.assign(state.enrollment.maxes_kg, newMax);
  state.progress.maxes_kg = { ...state.enrollment.maxes_kg };

  // Save the log on the session and in history
  for (const ex of session.exercises)
    ex.logged_sets = rows
      .filter((r) => r.exercise === ex.exercise && r.set_no >= ex.first_set && r.set_no < ex.first_set + Math.max(ex.sets, 1))
      .map(({ set_no, weight_kg, reps, rpe }) => ({ set_no, weight_kg, reps, rpe }));
  session.logged = true;
  session.performed_on = performed;
  session.notes = body.notes ?? '';
  state.loggedKeys.add(`${week}/${day}`);
  state.history.workouts = state.history.workouts.filter((w) => !(w.week === week && w.day_index === day));
  state.history.workouts.push({ week, day_index: day, day: session.day, program: state.enrollment.program.name, performed_on: performed, notes: session.notes, sets: rows });
  state.history.workouts.sort((a, b) => b.performed_on.localeCompare(a.performed_on));
  refreshNext(state);

  const single = rows.find(
    (r) => r.reps === 1 && r.weight_kg && tested.has(r.exercise) && liftOf(r.exercise) !== undefined,
  );
  const lift = single ? liftOf(single.exercise) : undefined;
  return {
    session: present(state, session),
    new_maxes: Object.keys(newMax).sort(),
    prs,
    submit_max: single && lift ? { lift, weight_kg: single.weight_kg as number, performed_on: performed } : null,
  };
}

function enroll(state: MockState, body: EnrollBody): Enrollment {
  const program = state.programs.programs.find((p) => p.slug === body?.program);
  if (!program) throw new Problem(400, 'Choose a program.');
  const problems: string[] = [];
  const startWeek = body.start_week ?? 1;
  if (!Number.isInteger(startWeek) || startWeek < 0 || startWeek > program.weeks) problems.push('The start week is out of range.');
  const addons = body.addons ?? [];
  for (const a of addons) if (!state.programs.addons.some((x) => x.slug === a)) problems.push(`There's no add-on called ${a}.`);
  const maxes = body.maxes_kg ?? {};
  if (!Object.keys(maxes).length && startWeek !== 0)
    problems.push('Enter your training maxes, or start with week 0, the baseline test week.');
  if (body.club && !state.me.clubs.some((c) => c.slug === body.club)) problems.push("You're not a member of that club.");
  if (problems.length) throw new Problem(400, problems[0], problems);
  if (program.slug !== state.enrollment.program.slug) {
    state.sessions = program.slug === state.recordedProgram ? clone(fixtureData as unknown as Fixtures).sessions : {};
    state.loggedKeys = new Set(Object.values(state.sessions).filter((x) => x.logged).map((x) => `${x.week}/${x.day_index}`));
  }
  state.enrollment = {
    program,
    addons: state.programs.addons.filter((a) => addons.includes(a.slug)),
    start_week: startWeek,
    start_date: body.start_date || isoDate(),
    maxes_kg: { ...maxes },
    club: body.club ?? null,
    next: null,
  };
  refreshNext(state);
  return state.enrollment;
}

function bodyfatEntry(state: MockState, b: { date?: string; percent?: number; method?: string; weight_kg?: number }): BodyFatEntry {
  const problems: string[] = [];
  if (!isNum(b?.percent) || b.percent < 2 || b.percent > 70) problems.push('Enter your body-fat percentage.');
  if (!b?.method || !state.bodyfat.methods.includes(b.method)) problems.push('Choose how it was measured.');
  if (b?.weight_kg != null && (!isNum(b.weight_kg) || b.weight_kg < 20 || b.weight_kg > 350)) problems.push('Body weight is out of range.');
  if (problems.length) throw new Problem(400, problems[0], problems);
  const weight = b.weight_kg ?? null;
  const entry: BodyFatEntry = {
    id: state.nextId++,
    date: b.date || isoDate(),
    percent: b.percent as number,
    method: b.method as string,
    weight_kg: weight,
    lean_kg: weight == null ? null : Math.round(leanMass(weight, b.percent as number) * 100) / 100,
  };
  state.bodyfat.entries = [entry, ...state.bodyfat.entries].sort((x, y) => y.date.localeCompare(x.date));
  return entry;
}

function latestBodyweight(state: MockState) {
  const latest = [...state.bodyweight.entries].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (latest) state.me.bodyweight_kg = latest.weight_kg;
}

function submitMax(state: MockState, b: SubmitMaxBody): MaxResult {
  const problems: string[] = [];
  if (!b || !['squat', 'bench', 'deadlift'].includes(b.lift)) problems.push('Choose the lift.');
  if (!isNum(b?.weight_kg) || b.weight_kg < 1 || b.weight_kg > 1000) problems.push('Enter the weight lifted.');
  if (!isNum(b?.bodyweight_kg) || b.bodyweight_kg < 30 || b.bodyweight_kg > 250)
    problems.push('Enter your body weight on the day (it sets your weight class).');
  if (!/^https?:\/\/\S+\.\S+/i.test(b?.video_url ?? '')) problems.push("Add a link to the video. Video or it didn't happen.");
  if (!b?.performed_on) problems.push('Enter the date of the lift.');
  if (problems.length) throw new Problem(400, problems[0], problems);
  const club = state.me.clubs.find((c) => c.slug === b.club) ?? state.me.clubs[0];
  const r: MaxResult = { id: state.nextId++, lift: b.lift, weight_kg: b.weight_kg, bodyweight_kg: b.bodyweight_kg, performed_on: b.performed_on, video_url: b.video_url, status: 'pending', club: club?.slug ?? null };
  state.maxes.results.unshift(r);
  state.me.bodyweight_kg = b.bodyweight_kg;
  return r;
}

type Handler = (state: MockState, m: RegExpMatchArray, req: TransportRequest, query: URLSearchParams) => unknown;

const routeTable: [string, RegExp, Handler][] = [
  ['POST', /^\/auth\/logout$/, (s) => ((s.token = null), { ok: true })],
  ['GET', /^\/me$/, (s) => s.me],
  ['PATCH', /^\/me$/, (s, _m, { body }) => {
    const b = (body ?? {}) as { units?: string; name?: string };
    if (b.units !== undefined) {
      if (b.units !== 'lb' && b.units !== 'kg') throw new Problem(400, 'Units are lb or kg.');
      s.me.units = b.units;
    }
    if (b.name !== undefined) {
      if (!String(b.name).trim()) throw new Problem(400, 'Enter your name.');
      s.me.name = String(b.name).trim();
    }
    return s.me;
  }],
  ['DELETE', /^\/me$/, (s, _m, { body }) => {
    if (!(body as { password?: string })?.password) throw new Problem(403, 'Enter your password to delete your account.');
    s.token = null;
    return { ok: true };
  }],
  ['GET', /^\/programs$/, (s) => s.programs],
  ['GET', /^\/enrollment$/, (s) => s.enrollment],
  ['POST', /^\/enrollment$/, (s, _m, { body }) => enroll(s, body as EnrollBody)],
  ['PATCH', /^\/enrollment\/maxes$/, (s, _m, { body }) => {
    const maxes = (body as { maxes_kg?: Record<string, number> })?.maxes_kg ?? {};
    const bad = Object.entries(maxes).filter(([, v]) => !isNum(v) || v < 1 || v > 1000);
    if (bad.length) throw new Problem(400, `The max for ${bad[0][0]} is out of range.`);
    Object.assign(s.enrollment.maxes_kg, maxes);
    s.progress.maxes_kg = { ...s.enrollment.maxes_kg };
    return s.enrollment;
  }],
  ['GET', /^\/today$/, (s) => {
    const n = nextSession(s);
    return n ? present(s, n) : null;
  }],
  ['GET', /^\/sessions\/(\d+)\/(\d+)$/, (s, m) => present(s, sessionAt(s, +m[1], +m[2]))],
  ['PUT', /^\/sessions\/(\d+)\/(\d+)\/log$/, (s, m, { body }) => logSession(s, +m[1], +m[2], body as LogBody)],
  ['GET', /^\/history$/, (s, _m, _r, query) => {
    const before = query.get('before');
    const limit = Math.min(100, Math.max(1, parseInt(query.get('limit') ?? '20', 10) || 20));
    const rows = s.history.workouts.filter((w) => !before || w.performed_on < before);
    return { workouts: rows.slice(0, limit) };
  }],
  ['GET', /^\/progress$/, (s) => s.progress],
  ['GET', /^\/progress\/(.+)$/, (s, m) => {
    const ex = decodeURIComponent(m[1]);
    return s.progress_by_exercise[ex] ?? { exercise: ex, history: [] };
  }],
  ['GET', /^\/bodyweight$/, (s) => s.bodyweight],
  ['POST', /^\/bodyweight$/, (s, _m, { body }) => {
    const b = (body ?? {}) as { date?: string; weight_kg?: number };
    if (!isNum(b.weight_kg) || b.weight_kg < 20 || b.weight_kg > 350) throw new Problem(400, 'Enter your body weight.');
    const date = b.date || isoDate();
    const existing = s.bodyweight.entries.find((e) => e.date === date);
    const entry = existing ?? { id: s.nextId++, date, weight_kg: b.weight_kg };
    entry.weight_kg = b.weight_kg;
    if (!existing) s.bodyweight.entries.push(entry);
    s.bodyweight.entries.sort((a, c) => c.date.localeCompare(a.date));
    latestBodyweight(s);
    return entry;
  }],
  ['DELETE', /^\/bodyweight\/(\d+)$/, (s, m) => {
    const before = s.bodyweight.entries.length;
    s.bodyweight.entries = s.bodyweight.entries.filter((e) => e.id !== +m[1]);
    if (s.bodyweight.entries.length === before) throw new Problem(404, 'Not found.');
    latestBodyweight(s);
    return { ok: true };
  }],
  ['GET', /^\/bodyfat$/, (s) => s.bodyfat],
  ['POST', /^\/bodyfat$/, (s, _m, { body }) => bodyfatEntry(s, body as object)],
  ['DELETE', /^\/bodyfat\/(\d+)$/, (s, m) => {
    const before = s.bodyfat.entries.length;
    s.bodyfat.entries = s.bodyfat.entries.filter((e) => e.id !== +m[1]);
    if (s.bodyfat.entries.length === before) throw new Problem(404, 'Not found.');
    return { ok: true };
  }],
  ['GET', /^\/maxes$/, (s) => s.maxes],
  ['POST', /^\/maxes$/, (s, _m, { body }) => submitMax(s, body as SubmitMaxBody)],
  ['GET', /^\/clubs\/([^/]+)$/, (s, m) => {
    const c = s.clubs[decodeURIComponent(m[1])];
    if (!c) throw new Problem(404, 'No such club.');
    return c;
  }],
  ['GET', /^\/clubs\/([^/]+)\/leaderboard$/, (s, m) => {
    const b = s.leaderboards[decodeURIComponent(m[1])];
    if (!b) throw new Problem(404, 'No such club.');
    return b;
  }],
];


// ----- Club leaders and admins: the same rules as obc/leadership.py ---------------------------------

const SITE = 'https://orthodoxbarbellclub.com';
const nowIso = () => new Date().toISOString();

function canLead(s: MockState, slug: string): boolean {
  return !!s.me.is_staff || !!s.me.clubs.find((c) => c.slug === slug)?.can_lead;
}

function ledClub(s: MockState, slug: string): ManageView {
  const view = s.manage[slug];
  if (!view || !s.clubs[slug]) throw new Problem(404, 'No such club.');
  if (!canLead(s, slug)) throw new Problem(403, "Only the club's founder, leaders and admins can do that.");
  return view;
}

function staff(s: MockState) {
  if (!s.me.is_staff) throw new Problem(403, 'Only site and regional admins can do that.');
}

/** Keep the club page's member list in step with the leader view. */
function syncMembers(s: MockState, slug: string) {
  s.clubs[slug].members = s.manage[slug].members.map(({ name, role }) => ({ name, role }));
}

function memberAction(s: MockState, slug: string, id: number, action: MemberAction): { ok: true; message: string } {
  const view = ledClub(s, slug);
  if (!['approve', 'deny', 'make_leader', 'make_member', 'remove'].includes(action))
    throw new Problem(400, 'Action is approve, deny, make_leader, make_member or remove.');
  const request = view.requests.find((r) => r.id === id);
  const member = view.members.find((m) => m.id === id);
  if (!request && !member) throw new Problem(404, 'No such member.');
  if (member?.role === 'founder' && !s.me.is_staff) throw new Problem(403, "You can't do that in this club.");
  let message = '';
  if (request && action === 'approve') {
    view.requests = view.requests.filter((r) => r.id !== id);
    view.members.push({ id, name: request.name, role: 'member', is_me: false, program: null });
    message = `${request.name} is in.`;
  } else if (request && action === 'deny') {
    view.requests = view.requests.filter((r) => r.id !== id);
    message = `${request.name}'s request was turned down.`;
  } else if (member && action === 'make_leader' && member.role === 'member') {
    member.role = 'leader';
    message = `${member.name} is now a club leader.`;
  } else if (member && action === 'make_member' && member.role === 'leader') {
    member.role = 'member';
    message = `${member.name} is a member again.`;
  } else if (member && action === 'remove' && !member.is_me && member.role !== 'founder') {
    view.members = view.members.filter((m) => m.id !== id);
    message = `${member.name} was removed from the club.`;
  } else {
    throw new Problem(400, "That can't be done to this member.");
  }
  syncMembers(s, slug);
  return { ok: true, message };
}

function createInvite(s: MockState, slug: string, b: { days?: number | null; uses?: number | null }) {
  const view = ledClub(s, slug);
  const problems: string[] = [];
  const days = b?.days ?? null;
  const uses = b?.uses ?? null;
  if (days !== null && (!Number.isInteger(days) || days < 0 || days > 365)) problems.push('Days is out of range.');
  if (uses !== null && (!Number.isInteger(uses) || uses < 0 || uses > 1000)) problems.push('Uses is out of range.');
  if (problems.length) throw new Problem(400, problems[0], problems);
  const code = Math.random().toString(36).slice(2, 14);
  const invite = {
    id: s.nextId++,
    code,
    url: `${SITE}/me/invite/${code}`,
    created_at: nowIso(),
    created_by: s.me.name,
    expires_at: days ? new Date(Date.now() + days * 86400000).toISOString() : null,
    max_uses: uses || null,
    uses: 0,
    usable: true,
  };
  view.invites.unshift(invite);
  return invite;
}

function findLift(s: MockState, id: number): LeaderLift | undefined {
  for (const c of Object.values(s.club_lifts)) {
    const hit = c.pending.find((l) => l.id === id) ?? c.reviewed.find((l) => l.id === id);
    if (hit) return hit;
  }
  return s.admin_lifts.lifts.find((l) => l.id === id);
}

function reviewLift(s: MockState, id: number, b: { action?: string; note?: string }) {
  const lift = findLift(s, id);
  if (!lift) throw new Problem(404, 'No such lift.');
  if (!lift.can_review) throw new Problem(403, "You can't do that in this club.");
  const action = b?.action;
  const note = String(b?.note ?? '').trim();
  if (action !== 'verify' && action !== 'reject') throw new Problem(400, 'Choose verify or reject.');
  if (action === 'reject' && !note) throw new Problem(400, 'Say why it was rejected so the lifter can fix it.');
  const wasPending = lift.status === 'pending';
  const done: LeaderLift = { ...lift, status: action === 'verify' ? 'verified' : 'rejected', review_note: note, reviewer: s.me.name };
  for (const [slug, c] of Object.entries(s.club_lifts)) {
    if (c.pending.some((l) => l.id === id) || c.reviewed.some((l) => l.id === id)) {
      c.pending = c.pending.filter((l) => l.id !== id);
      c.reviewed = [done, ...c.reviewed.filter((l) => l.id !== id)];
      if (wasPending && s.manage[slug]) s.manage[slug].pending_lifts = Math.max(0, s.manage[slug].pending_lifts - 1);
    }
  }
  if (s.admin_lifts.lifts.some((l) => l.id === id)) {
    s.admin_lifts.lifts = s.admin_lifts.lifts.filter((l) => l.id !== id);
  }
  if (wasPending) s.admin_summary.pending_lifts = Math.max(0, s.admin_summary.pending_lifts - 1);
  const owner = s.maxes.results.find((r) => r.id === id);
  if (owner) owner.status = done.status;
  return { ok: true, message: action === 'verify' ? `${lift.lifter}'s ${lift.lift_name} is verified.` : 'Rejected. The lifter will see your note.', lift: done };
}

function decideApplication(s: MockState, id: number, b: { action?: string; slug?: string; note?: string }) {
  staff(s);
  const app = s.admin_applications.applications.find((a) => a.id === id);
  if (!app) throw new Problem(404, 'No such application.');
  const note = String(b?.note ?? '').trim();
  const remove = () => {
    s.admin_applications.applications = s.admin_applications.applications.filter((a) => a.id !== id);
    s.admin_summary.pending_applications = Math.max(0, s.admin_summary.pending_applications - 1);
  };
  if (b?.action === 'approve') {
    const slug = String(b.slug || app.slug).trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,38}$/.test(slug)) throw new Problem(400, 'Web names are 2-40 letters, numbers and dashes.');
    if (s.clubs[slug] || s.admin_summary.clubs.some((c) => c.slug === slug))
      throw new Problem(400, 'A club already uses that web name. Enter a different one.');
    remove();
    s.admin_summary.clubs.push({ slug, name: app.club_name, city: app.city, state: app.state, kind: 'club', active: true, members: 1 });
    return { ok: true, message: `${app.club_name} is live.`, club: { slug, url: `${SITE}/c/${slug}/` } };
  }
  if (b?.action === 'reject') {
    if (!note) throw new Problem(400, 'Add a note saying why, so the founder knows what to change.');
    remove();
    return { ok: true, message: 'Application turned down.' };
  }
  throw new Problem(400, 'Action is approve or reject.');
}

const leaderRoutes: [string, RegExp, Handler][] = [
  ['GET', /^\/clubs\/([^/]+)\/manage$/, (s, m) => ledClub(s, decodeURIComponent(m[1]))],
  ['POST', /^\/clubs\/([^/]+)\/members\/(\d+)$/, (s, m, { body }) =>
    memberAction(s, decodeURIComponent(m[1]), +m[2], (body as { action: MemberAction })?.action)],
  ['GET', /^\/clubs\/([^/]+)\/invites$/, (s, m) => ({ invites: ledClub(s, decodeURIComponent(m[1])).invites.filter((i) => i.usable) })],
  ['POST', /^\/clubs\/([^/]+)\/invites$/, (s, m, { body }) => createInvite(s, decodeURIComponent(m[1]), body as object)],
  ['DELETE', /^\/clubs\/([^/]+)\/invites\/(\d+)$/, (s, m) => {
    const view = ledClub(s, decodeURIComponent(m[1]));
    if (!view.invites.some((i) => i.id === +m[2])) throw new Problem(404, 'No such invite.');
    view.invites = view.invites.filter((i) => i.id !== +m[2]);
    return { ok: true };
  }],
  ['POST', /^\/clubs\/([^/]+)\/announcements$/, (s, m, { body }) => {
    const slug = decodeURIComponent(m[1]);
    ledClub(s, slug);
    const text = String((body as { body?: string })?.body ?? '').trim();
    if (!text) throw new Problem(400, 'Write the announcement first.');
    const a = { id: s.nextId++, body: text, author: s.me.name, created_at: nowIso() };
    s.clubs[slug].announcements.unshift(a);
    return a;
  }],
  ['DELETE', /^\/clubs\/([^/]+)\/announcements\/(\d+)$/, (s, m) => {
    const slug = decodeURIComponent(m[1]);
    ledClub(s, slug);
    const before = s.clubs[slug].announcements.length;
    s.clubs[slug].announcements = s.clubs[slug].announcements.filter((a) => a.id !== +m[2]);
    if (s.clubs[slug].announcements.length === before) throw new Problem(404, 'No such announcement.');
    return { ok: true };
  }],
  ['GET', /^\/clubs\/([^/]+)\/lifts$/, (s, m, _r, query) => {
    const slug = decodeURIComponent(m[1]);
    ledClub(s, slug);
    const lifts = s.club_lifts[slug] ?? { pending: [], reviewed: [] };
    return { lifts: query.get('status') === 'reviewed' ? lifts.reviewed : lifts.pending };
  }],
  ['POST', /^\/lifts\/(\d+)\/review$/, (s, m, { body }) => reviewLift(s, +m[1], body as object)],
  ['GET', /^\/admin\/summary$/, (s) => (staff(s), s.admin_summary)],
  ['GET', /^\/admin\/applications$/, (s) => (staff(s), s.admin_applications)],
  ['POST', /^\/admin\/applications\/(\d+)$/, (s, m, { body }) => decideApplication(s, +m[1], body as object)],
  ['GET', /^\/admin\/lifts$/, (s) => (staff(s), s.admin_lifts)],
];

routeTable.push(...leaderRoutes);

const CREATED = /^POST \/(enrollment|bodyweight|bodyfat|maxes|clubs\/[^/]+\/(invites|announcements))$/;

export function mockTransport(state: MockState = createMockState(), latencyMs = 250): Transport {
  return async (req): Promise<TransportResponse> => {
    if (latencyMs) await new Promise((r) => setTimeout(r, latencyMs));
    const [path, qs = ''] = req.path.split('?');
    const query = new URLSearchParams(qs);
    try {
      if (req.method === 'POST' && path === '/auth/login') {
        const b = (req.body ?? {}) as { email?: string; password?: string };
        if (!b.email?.trim() || !b.password) throw new Problem(401, "That email and password don't match.");
        state.token = MOCK_TOKEN;
        return { status: 200, data: { token: MOCK_TOKEN, user: state.me } };
      }
      if (!req.token || req.token !== MOCK_TOKEN) {
        throw new Problem(401, 'Sign in again.');
      }
      for (const [method, re, handler] of routeTable) {
        const m = path.match(re);
        if (m && method === req.method) {
          const data = clone(handler(state, m, req, query) ?? null);
          return { status: CREATED.test(`${req.method} ${path}`) ? 201 : 200, data };
        }
      }
      throw new Problem(404, 'Not found.');
    } catch (e) {
      if (e instanceof Problem) {
        return { status: e.status, data: e.problems.length ? { error: e.message, problems: e.problems } : { error: e.message } };
      }
      throw e;
    }
  };
}
