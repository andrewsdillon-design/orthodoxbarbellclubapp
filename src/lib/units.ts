// Pounds and kilograms. The API speaks kilograms; lifters see their own units. Mirrors obc/units.py.
import type { Units } from '../api/types';

export const LB_PER_KG = 2.20462262;

/** The smallest jump between working weights, the same plate increments the website rounds to. */
export const INCREMENT: Record<Units, number> = { lb: 5, kg: 2.5 };

export const lbToKg = (lb: number): number => lb / LB_PER_KG;
export const kgToLb = (kg: number): number => kg * LB_PER_KG;

export function roundTo(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}

/** kg -> the number shown in the lifter's units (unrounded). */
export function toUnits(kg: number, units: Units): number {
  return units === 'kg' ? kg : kgToLb(kg);
}

/** A number in the lifter's units -> kg. */
export function fromUnits(value: number, units: Units): number {
  return units === 'kg' ? value : lbToKg(value);
}

/** 225 -> "225", 102.5 -> "102.5", 102.04 -> "102" (one decimal at most). */
export function fmtNum(x: number): string {
  const r = Math.round(x * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** 102.058 kg -> "225 lb" (or "102.1 kg"). Blank for null. */
export function fmtWeight(kg: number | null | undefined, units: Units, withUnit = true): string {
  if (kg == null || Number.isNaN(kg)) return '';
  const n = fmtNum(toUnits(kg, units));
  return withUnit ? `${n} ${units}` : n;
}

/** A prescribed weight rounded to loadable plates in the lifter's units, e.g. 140.61 kg -> 310 (lb). */
export function plateWeight(kg: number, units: Units): number {
  return roundTo(toUnits(kg, units), INCREMENT[units]);
}

/**
 * A weight as typed, in kg. Blank -> null. Accepts "225", "225 lb", "102.5kg", "102,5".
 * Throws on anything that isn't a non-negative number.
 */
export function parseWeight(text: string, units: Units): number | null {
  let t = (text ?? '').trim().toLowerCase().replace(',', '.');
  if (!t) return null;
  let u: Units = units;
  for (const [suffix, unit] of [['kg', 'kg'], ['lbs', 'lb'], ['lb', 'lb']] as const) {
    if (t.endsWith(suffix)) {
      t = t.slice(0, -suffix.length).trim();
      u = unit;
      break;
    }
  }
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(t)) throw new Error(`"${text}" isn't a weight.`);
  return fromUnits(parseFloat(t), u);
}

/** Reps as a number to pre-fill: "5" -> 5, "8-12" -> 8, "3+" -> 3, "5RM" -> 5, "Max" / "20 yd" / "30-60s" -> null. */
export function prescribedReps(reps: string): number | null {
  const m = /^\s*(\d+)\s*(?:-\s*\d+)?\s*(\+|rm)?\s*$/i.exec(reps ?? '');
  return m ? parseInt(m[1], 10) : null;
}

/** Estimated one-rep max (Epley), as the website computes it. A single is its own max. */
export function e1rm(weightKg: number, reps: number): number {
  return reps <= 1 ? weightKg : weightKg * (1 + reps / 30);
}

/** Lean mass from total weight and body-fat percent. */
export function leanMass(weightKg: number, percent: number): number {
  return weightKg * (1 - percent / 100);
}

// Meet-sheet pound names for each weight class (the conventional labels, not computed roundings).
const CLASS_LB: Record<string, string> = {
  '44': '97', '48': '105', '52': '114', '56': '123', '60': '132', '67.5': '148', '75': '165',
  '82.5': '181', '90': '198', '100': '220', '110': '242', '125': '275', '140': '308',
};

/** A weight class as the API names it ("82.5", "140+") in the lifter's units: "181 lb", "308+ lb", "82.5 kg". */
export function classLabel(cls: string, units: Units): string {
  const plus = cls.endsWith('+') ? '+' : '';
  const key = cls.replace(/\+$/, '');
  if (units === 'kg' || !CLASS_LB[key]) return `${key}${plus} kg`;
  return `${CLASS_LB[key]}${plus} lb`;
}
