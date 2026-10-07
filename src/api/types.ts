// The OBC app API (v1), as documented in docs/API.md. Weights on the wire are always kilograms.

export type Units = 'lb' | 'kg';
export type Lift = 'squat' | 'bench' | 'deadlift';
export type ExerciseKind = 'main' | 'variation' | 'accessory' | 'plyo' | 'test' | 'strongman';

export interface ClubRef {
  slug: string;
  name: string;
  role: string;
  kind: string;
  url: string;
  /** Founder, leader, or an admin who oversees the club: show the Lead view. */
  can_lead?: boolean;
}

export interface User {
  id: number;
  name: string;
  email: string;
  units: Units;
  sex: 'M' | 'F' | string;
  role: string;
  /** Site or regional admin: show the Admin screen. */
  is_staff?: boolean;
  bodyweight_kg: number | null;
  clubs: ClubRef[];
}

export interface LoginResult {
  token: string;
  user: User;
}

export interface Ok {
  ok: true;
}

/** [phase name, [week numbers]] */
export type Phase = [string, number[]];

export interface ProgramSummary {
  slug: string;
  name: string;
  kind: 'program' | 'addon';
  level: string;
  days_per_week: number;
  weeks: number;
  description: string;
  main_lifts: string[];
  phases: Phase[];
}

export interface ProgramList {
  programs: ProgramSummary[];
  addons: ProgramSummary[];
}

export interface SessionRef {
  week: number;
  day_index: number;
}

export interface Enrollment {
  program: ProgramSummary;
  addons: ProgramSummary[];
  start_week: number;
  start_date: string;
  maxes_kg: Record<string, number>;
  club?: string | null;
  next: SessionRef | null;
}

export interface EnrollBody {
  program: string;
  start_week: number;
  start_date: string;
  addons: string[];
  maxes_kg: Record<string, number>;
  club?: string;
}

export interface LoggedSet {
  set_no: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
}

export interface SessionExercise {
  index: number;
  exercise: string;
  kind: ExerciseKind | string;
  sets: number;
  /** "5", "8-12", "3+", "Max", "5RM", "20 yd" */
  reps: string;
  percent: number | null;
  note: string;
  prescribed_kg: number | null;
  prescribed_display: string;
  tm_estimated: boolean;
  addon: string;
  learn: string | null;
  first_set: number;
  logged_sets: LoggedSet[];
}

export interface Session {
  week: number;
  day_index: number;
  day: string;
  phase: string;
  cycle: number | null;
  logged: boolean;
  performed_on: string | null;
  notes: string;
  exercises: SessionExercise[];
}

export interface LogSet {
  index: number;
  set_no: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
}

export interface LogBody {
  performed_on: string;
  notes: string;
  sets: LogSet[];
}

export interface SubmitMaxOffer {
  lift: Lift;
  weight_kg: number;
  performed_on: string;
}

export interface LogResult {
  session: Session;
  new_maxes: string[];
  prs: string[];
  submit_max: SubmitMaxOffer | null;
}

export interface WorkoutSet {
  exercise: string;
  set_no: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
}

export interface Workout {
  week: number;
  day_index: number;
  day: string;
  program: string;
  performed_on: string;
  notes: string;
  sets: WorkoutSet[];
}

export interface History {
  workouts: Workout[];
}

export interface BestE1rm {
  exercise: string;
  e1rm_kg: number;
  weight_kg: number;
  reps: number;
  date: string;
}

export interface Progress {
  maxes_kg: Record<string, number>;
  best_e1rm: BestE1rm[];
  /** exercise -> { "reps": best kg } */
  rep_maxes: Record<string, Record<string, number>>;
}

export interface ExerciseProgress {
  exercise: string;
  history: { date: string; e1rm_kg: number }[];
}

export interface BodyWeightEntry {
  id: number;
  date: string;
  weight_kg: number;
}

export interface BodyFatEntry {
  id: number;
  date: string;
  percent: number;
  method: string;
  weight_kg: number | null;
  lean_kg: number | null;
}

export interface BodyFatList {
  entries: BodyFatEntry[];
  methods: string[];
}

export interface MaxResult {
  id: number;
  lift: Lift;
  weight_kg: number;
  bodyweight_kg: number;
  performed_on: string;
  video_url: string;
  status: 'pending' | 'verified' | 'rejected' | string;
  club?: string | null;
}

export interface SubmitMaxBody {
  lift: Lift;
  weight_kg: number;
  bodyweight_kg: number;
  performed_on: string;
  video_url: string;
  club?: string;
}

export interface Announcement {
  id?: number;
  body: string;
  author: string;
  created_at: string;
}

export interface Club {
  slug: string;
  name: string;
  parish: string;
  city: string;
  state: string;
  schedule: string;
  about: string;
  url: string;
  my_role: string | null;
  can_lead?: boolean;
  announcements: Announcement[];
  members: { name: string; role: string }[];
}

export type BoardKind = 'total' | 'squat' | 'bench' | 'deadlift';

export interface BoardRow {
  rank: number;
  name: string;
  weight_class: string;
  bodyweight_kg: number;
  total_kg: number;
  dots: number;
  lifts_kg: Partial<Record<Lift, number>>;
}

export interface Leaderboard {
  boards: Record<BoardKind, BoardRow[]>;
  team_total_kg: number;
  team_size: number;
}

export interface ApiErrorBody {
  error: string;
  problems?: string[];
}

// ----- Club leaders --------------------------------------------------------------------------------

export type MemberAction = 'approve' | 'deny' | 'make_leader' | 'make_member' | 'remove';

export interface JoinRequest {
  id: number;
  name: string;
  requested_at: string;
}

export interface ManagedMember {
  /** The membership id, used in /clubs/{slug}/members/{id}. */
  id: number;
  name: string;
  role: 'founder' | 'leader' | 'member' | string;
  is_me: boolean;
  program: string | null;
}

export interface Invite {
  id: number;
  code: string;
  url: string;
  created_at: string;
  created_by: string;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  usable: boolean;
}

export interface ManageView {
  slug: string;
  name: string;
  requests: JoinRequest[];
  members: ManagedMember[];
  invites: Invite[];
  pending_lifts: number;
}

export interface LeaderLift extends MaxResult {
  lifter: string;
  lift_name: string;
  /** A YouTube embed link, or null: then open video_url. */
  embed_url: string | null;
  submitted_at: string;
  review_note: string;
  reviewer: string | null;
  /** False on your own lift: nobody reviews their own. */
  can_review: boolean;
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

// ----- Site and regional admins ------------------------------------------------------------------

export interface AdminClub {
  slug: string;
  name: string;
  city: string;
  state: string;
  kind: string;
  active: boolean;
  members: number;
}

export interface AdminSummary {
  pending_applications: number;
  pending_lifts: number;
  regions: string[];
  clubs: AdminClub[];
}

export interface ClubApplication {
  id: number;
  club_name: string;
  slug: string;
  parish: string;
  city: string;
  state: string;
  region: string | null;
  schedule: string;
  about: string;
  equipment: string[];
  status: string;
  applicant: { name: string; email: string };
  submitted_at: string;
  review_note?: string;
}
