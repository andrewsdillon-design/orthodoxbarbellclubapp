// A typed client for the OBC API. It talks through a Transport: real HTTP (fetchTransport) or the
// in-memory mock (mock.ts), so every screen works the same against either.
import type {
  BodyFatEntry,
  BodyFatList,
  BodyWeightEntry,
  Club,
  EnrollBody,
  Enrollment,
  ExerciseProgress,
  History,
  Leaderboard,
  LogBody,
  LoginResult,
  LogResult,
  MaxResult,
  Ok,
  ProgramList,
  Progress,
  Session,
  SubmitMaxBody,
  Units,
  User,
} from './types';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface TransportRequest {
  method: Method;
  path: string; // starts with "/", relative to the API base, may include a query string
  body?: unknown;
  token?: string | null;
}

export interface TransportResponse {
  status: number;
  data: unknown;
}

export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

/** status 0 means the request never reached the server (no signal, DNS, timeout). */
export class ApiError extends Error {
  readonly status: number;
  readonly problems: string[];

  constructor(status: number, message: string, problems: string[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.problems = problems;
  }

  get offline(): boolean {
    return this.status === 0;
  }

  get unauthorized(): boolean {
    return this.status === 401;
  }
}

export function isOffline(e: unknown): boolean {
  return e instanceof ApiError && e.offline;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.offline) return "No connection. Check your signal and try again.";
    return e.problems.length > 1 ? e.problems.join('\n') : e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong.';
}

export function fetchTransport(baseUrl: string, timeoutMs = 20000): Transport {
  const base = baseUrl.replace(/\/+$/, '');
  return async ({ method, path, body, token }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await fetch(base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(0, 'offline');
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        // A web page instead of JSON: the site is up but the app API isn't (not deployed, or down).
        data = {
          error:
            res.status === 404
              ? "The OBC website isn't ready for the app yet. Try again later, or sign in on orthodoxbarbellclub.com."
              : `The OBC server had a problem (HTTP ${res.status}). Try again in a few minutes.`,
        };
      }
    }
    return { status: res.status, data };
  };
}

export interface ClientOptions {
  transport: Transport;
  getToken: () => string | null;
  /** Called on any 401 so the app can sign out. */
  onUnauthorized?: () => void;
}

const q = encodeURIComponent;

export function createClient({ transport, getToken, onUnauthorized }: ClientOptions) {
  async function request<T>(method: Method, path: string, body?: unknown, auth = true): Promise<T> {
    const res = await transport({ method, path, body, token: auth ? getToken() : null });
    if (res.status >= 200 && res.status < 300) return res.data as T;
    const err = (res.data ?? {}) as { error?: string; problems?: string[] };
    const message = err.error || `Request failed (HTTP ${res.status}).`;
    if (res.status === 401 && auth) onUnauthorized?.();
    throw new ApiError(res.status, message, Array.isArray(err.problems) ? err.problems : []);
  }

  return {
    // Auth and account
    login: (email: string, password: string, device: string) =>
      request<LoginResult>('POST', '/auth/login', { email, password, device }, false),
    logout: () => request<Ok>('POST', '/auth/logout'),
    me: () => request<User>('GET', '/me'),
    updateMe: (changes: { units?: Units; name?: string }) => request<User>('PATCH', '/me', changes),
    deleteMe: (password: string) => request<Ok>('DELETE', '/me', { password }),

    // Programs and enrollment
    programs: () => request<ProgramList>('GET', '/programs'),
    enrollment: () => request<Enrollment | null>('GET', '/enrollment'),
    enroll: (body: EnrollBody) => request<Enrollment>('POST', '/enrollment', body),
    updateMaxes: (maxes_kg: Record<string, number>) =>
      request<Enrollment>('PATCH', '/enrollment/maxes', { maxes_kg }),

    // Training
    today: () => request<Session | null>('GET', '/today'),
    session: (week: number, day: number) => request<Session>('GET', `/sessions/${week}/${day}`),
    logSession: (week: number, day: number, body: LogBody) =>
      request<LogResult>('PUT', `/sessions/${week}/${day}/log`, body),
    history: (opts: { before?: string; limit?: number } = {}) => {
      const params = [
        opts.before ? `before=${q(opts.before)}` : '',
        opts.limit ? `limit=${opts.limit}` : '',
      ].filter(Boolean);
      return request<History>('GET', `/history${params.length ? `?${params.join('&')}` : ''}`);
    },

    // Progress
    progress: () => request<Progress>('GET', '/progress'),
    exerciseProgress: (exercise: string) => request<ExerciseProgress>('GET', `/progress/${q(exercise)}`),

    // Body
    bodyweight: () => request<{ entries: BodyWeightEntry[] }>('GET', '/bodyweight'),
    addBodyweight: (date: string, weight_kg: number) =>
      request<BodyWeightEntry>('POST', '/bodyweight', { date, weight_kg }),
    deleteBodyweight: (id: number) => request<Ok>('DELETE', `/bodyweight/${id}`),
    bodyfat: () => request<BodyFatList>('GET', '/bodyfat'),
    addBodyfat: (entry: { date: string; percent: number; method: string; weight_kg?: number }) =>
      request<BodyFatEntry>('POST', '/bodyfat', entry),
    deleteBodyfat: (id: number) => request<Ok>('DELETE', `/bodyfat/${id}`),

    // Leaderboard maxes
    maxes: () => request<{ results: MaxResult[] }>('GET', '/maxes'),
    submitMax: (body: SubmitMaxBody) => request<MaxResult>('POST', '/maxes', body),

    // Clubs
    club: (slug: string) => request<Club>('GET', `/clubs/${q(slug)}`),
    leaderboard: (slug: string) => request<Leaderboard>('GET', `/clubs/${q(slug)}/leaderboard`),
  };
}

export type ApiClient = ReturnType<typeof createClient>;
