// The set-logging form, kept as plain data so it's easy to test: what's typed in each box, how
// "fill as prescribed" fills it, and how it becomes the API's LogBody (in kilograms).
import type { LogBody, LogSet, Session, SessionExercise, Units } from '../api/types';
import { fmtNum, parseWeight, plateWeight, prescribedReps, toUnits } from './units';

export interface SetInput {
  weight: string;
  reps: string;
  rpe: string;
}

/** form[exerciseIndex][setOffset] */
export type SessionFormState = SetInput[][];

const blank = (): SetInput => ({ weight: '', reps: '', rpe: '' });

export const setCount = (ex: SessionExercise) => Math.max(ex.sets, 1);

export function initForm(session: Session, units: Units, saved?: LogBody | null): SessionFormState {
  return session.exercises.map((ex) =>
    Array.from({ length: setCount(ex) }, (_, n) => {
      const setNo = ex.first_set + n;
      const fromQueue = saved?.sets.find((s) => s.index === ex.index && s.set_no === setNo);
      const logged = fromQueue ?? ex.logged_sets.find((s) => s.set_no === setNo);
      if (!logged) return blank();
      return {
        weight: logged.weight_kg == null ? '' : fmtNum(toUnits(logged.weight_kg, units)),
        reps: logged.reps == null ? '' : String(logged.reps),
        rpe: logged.rpe == null ? '' : fmtNum(logged.rpe),
      };
    }),
  );
}

/** The weight and reps to pre-fill for an exercise, in the lifter's units ('' when there's nothing to go on). */
export function prescribedFor(ex: SessionExercise, units: Units): { weight: string; reps: string } {
  const reps = prescribedReps(ex.reps);
  return {
    weight: ex.prescribed_kg == null ? '' : fmtNum(plateWeight(ex.prescribed_kg, units)),
    reps: reps == null ? '' : String(reps),
  };
}

/** Fill empty weight and reps boxes with the prescription. Only the given exercise when `only` is set. */
export function fillPrescribed(form: SessionFormState, session: Session, units: Units, only?: number): SessionFormState {
  return form.map((sets, i) => {
    if (only !== undefined && i !== only) return sets;
    const p = prescribedFor(session.exercises[i], units);
    return sets.map((s) => ({ ...s, weight: s.weight || p.weight, reps: s.reps || p.reps }));
  });
}

export class FormProblems extends Error {
  constructor(readonly problems: string[]) {
    super(problems[0]);
  }
}

/** The form as the API wants it. Throws FormProblems listing every box that doesn't make sense. */
export function buildLogBody(
  form: SessionFormState,
  session: Session,
  units: Units,
  performedOn: string,
  notes: string,
): LogBody {
  const problems: string[] = [];
  const sets: LogSet[] = [];
  session.exercises.forEach((ex, i) => {
    (form[i] ?? []).forEach((s, n) => {
      const setNo = ex.first_set + n;
      const label = `${ex.exercise} set ${setNo}`;
      if (!s.weight.trim() && !s.reps.trim()) return;
      let weight: number | null = null;
      try {
        weight = parseWeight(s.weight, units);
      } catch {
        problems.push(`${label}: check the weight.`);
        return;
      }
      let reps: number | null = null;
      if (s.reps.trim()) {
        if (!/^\d+$/.test(s.reps.trim())) {
          problems.push(`${label}: reps should be a whole number.`);
          return;
        }
        reps = parseInt(s.reps, 10);
      }
      let rpe: number | null = null;
      if (s.rpe.trim()) {
        rpe = parseFloat(s.rpe.replace(',', '.'));
        if (!Number.isFinite(rpe) || rpe < 1 || rpe > 10) {
          problems.push(`${label}: RPE is 1 to 10.`);
          return;
        }
      }
      sets.push({ index: ex.index, set_no: setNo, weight_kg: weight, reps, rpe });
    });
  });
  if (!sets.length && !problems.length) problems.push('Log at least one set.');
  if (problems.length) throw new FormProblems(problems);
  return { performed_on: performedOn, notes: notes.trim(), sets };
}
