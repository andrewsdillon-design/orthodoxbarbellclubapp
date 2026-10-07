// Data hooks, one per API read. Keys are shared so a save can refresh everything it touches.
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { Units } from '../api/types';

export const keys = {
  me: ['me'] as const,
  programs: ['programs'] as const,
  enrollment: ['enrollment'] as const,
  today: ['today'] as const,
  session: (w: number, d: number) => ['session', w, d] as const,
  history: ['history'] as const,
  progress: ['progress'] as const,
  exercise: (ex: string) => ['progress', ex] as const,
  bodyweight: ['bodyweight'] as const,
  bodyfat: ['bodyfat'] as const,
  maxes: ['maxes'] as const,
  club: (slug: string) => ['club', slug] as const,
  leaderboard: (slug: string) => ['leaderboard', slug] as const,
  manage: (slug: string) => ['manage', slug] as const,
  clubLifts: (slug: string, status: string) => ['clubLifts', slug, status] as const,
  admin: ['admin'] as const,
};

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: api.me });

/** The lifter's units, lb until we know better. */
export function useUnits(): Units {
  return useMe().data?.units ?? 'lb';
}

export const usePrograms = () => useQuery({ queryKey: keys.programs, queryFn: api.programs, staleTime: 3600_000 });
export const useEnrollment = () => useQuery({ queryKey: keys.enrollment, queryFn: api.enrollment });
export const useToday = () => useQuery({ queryKey: keys.today, queryFn: api.today });
export const useSession = (week: number, day: number) =>
  useQuery({ queryKey: keys.session(week, day), queryFn: () => api.session(week, day) });

const PAGE = 20;

export const useHistory = () =>
  useInfiniteQuery({
    queryKey: keys.history,
    queryFn: ({ pageParam }) => api.history({ before: pageParam || undefined, limit: PAGE }),
    initialPageParam: '',
    getNextPageParam: (last) =>
      last.workouts.length < PAGE ? undefined : last.workouts[last.workouts.length - 1].performed_on,
  });

/** Every logged session, for marking the program calendar. */
export const useLoggedSessions = () =>
  useQuery({
    queryKey: [...keys.history, 'all'],
    queryFn: async () => {
      const { workouts } = await api.history({ limit: 100 });
      return workouts;
    },
  });

export const useProgress = () => useQuery({ queryKey: keys.progress, queryFn: api.progress });
export const useExerciseProgress = (exercise: string | null) =>
  useQuery({
    queryKey: keys.exercise(exercise ?? ''),
    queryFn: () => api.exerciseProgress(exercise as string),
    enabled: !!exercise,
  });

export const useBodyweight = () => useQuery({ queryKey: keys.bodyweight, queryFn: api.bodyweight });
export const useBodyfat = () => useQuery({ queryKey: keys.bodyfat, queryFn: api.bodyfat });
export const useMaxes = () => useQuery({ queryKey: keys.maxes, queryFn: api.maxes });
export const useClub = (slug: string | null) =>
  useQuery({ queryKey: keys.club(slug ?? ''), queryFn: () => api.club(slug as string), enabled: !!slug });
export const useLeaderboard = (slug: string | null) =>
  useQuery({ queryKey: keys.leaderboard(slug ?? ''), queryFn: () => api.leaderboard(slug as string), enabled: !!slug });

// Club leaders and admins
export const useManage = (slug: string | null, enabled = true) =>
  useQuery({ queryKey: keys.manage(slug ?? ''), queryFn: () => api.manage(slug as string), enabled: !!slug && enabled });
export const useClubLifts = (slug: string | null, status: 'pending' | 'reviewed' = 'pending', enabled = true) =>
  useQuery({
    queryKey: keys.clubLifts(slug ?? '', status),
    queryFn: () => api.clubLifts(slug as string, status),
    enabled: !!slug && enabled,
  });
export const useAdminSummary = (enabled = true) =>
  useQuery({ queryKey: [...keys.admin, 'summary'], queryFn: api.adminSummary, enabled });
export const useAdminApplications = (enabled = true) =>
  useQuery({ queryKey: [...keys.admin, 'applications'], queryFn: api.adminApplications, enabled });
export const useAdminLifts = (enabled = true) =>
  useQuery({ queryKey: [...keys.admin, 'lifts'], queryFn: api.adminLifts, enabled });

/** After any leader or admin action: refresh everything it could have changed. */
export function leaderKeysToRefresh(): readonly (readonly unknown[])[] {
  return [['manage'], ['club'], ['clubLifts'], keys.admin, keys.maxes, ['leaderboard'], keys.me];
}
