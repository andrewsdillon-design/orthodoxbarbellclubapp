import {
  classLabel,
  e1rm,
  fmtNum,
  fmtWeight,
  fromUnits,
  kgToLb,
  lbToKg,
  leanMass,
  parseWeight,
  plateWeight,
  prescribedReps,
  roundTo,
  toUnits,
} from '../lib/units';

describe('unit conversion', () => {
  it('converts pounds and kilograms both ways', () => {
    expect(kgToLb(100)).toBeCloseTo(220.462, 3);
    expect(lbToKg(225)).toBeCloseTo(102.058, 3);
    expect(lbToKg(kgToLb(140))).toBeCloseTo(140, 10);
  });

  it('shows weights in the lifter units', () => {
    expect(toUnits(100, 'kg')).toBe(100);
    expect(toUnits(100, 'lb')).toBeCloseTo(220.46, 2);
    expect(fromUnits(225, 'lb')).toBeCloseTo(102.058, 3);
    expect(fromUnits(102.5, 'kg')).toBe(102.5);
  });

  it('formats like the website', () => {
    expect(fmtNum(225)).toBe('225');
    expect(fmtNum(102.5)).toBe('102.5');
    expect(fmtNum(102.04)).toBe('102');
    expect(fmtWeight(lbToKg(225), 'lb')).toBe('225 lb');
    expect(fmtWeight(102.5, 'kg')).toBe('102.5 kg');
    expect(fmtWeight(null, 'lb')).toBe('');
    expect(fmtWeight(102.5, 'kg', false)).toBe('102.5');
  });

  it('rounds prescriptions to loadable plates', () => {
    expect(roundTo(227, 5)).toBe(225);
    expect(plateWeight(140.6136, 'lb')).toBe(310);
    expect(plateWeight(101.3, 'kg')).toBe(102.5);
    expect(plateWeight(100.9, 'kg')).toBe(100);
    expect(plateWeight(101.3, 'lb')).toBe(225);
  });

  it('parses typed weights into kg', () => {
    expect(parseWeight('', 'lb')).toBeNull();
    expect(parseWeight('  ', 'kg')).toBeNull();
    expect(parseWeight('225', 'lb')).toBeCloseTo(102.058, 3);
    expect(parseWeight('102,5', 'kg')).toBe(102.5);
    expect(parseWeight('100 kg', 'lb')).toBe(100);
    expect(parseWeight('225lbs', 'kg')).toBeCloseTo(102.058, 3);
    expect(() => parseWeight('heavy', 'lb')).toThrow();
    expect(() => parseWeight('-5', 'lb')).toThrow();
  });

  it('reads prescribed reps', () => {
    expect(prescribedReps('5')).toBe(5);
    expect(prescribedReps('8-12')).toBe(8);
    expect(prescribedReps('3+')).toBe(3);
    expect(prescribedReps('5RM')).toBe(5);
    expect(prescribedReps('Max')).toBeNull();
    expect(prescribedReps('20 yd')).toBeNull();
    expect(prescribedReps('30-60s')).toBeNull();
  });

  it('estimates maxes and lean mass the way the server does', () => {
    expect(e1rm(140, 1)).toBe(140);
    expect(e1rm(100, 5)).toBeCloseTo(116.667, 3);
    expect(leanMass(90, 20)).toBe(72);
  });

  it('names weight classes in either unit', () => {
    expect(classLabel('82.5', 'lb')).toBe('181 lb');
    expect(classLabel('140+', 'lb')).toBe('308+ lb');
    expect(classLabel('90', 'kg')).toBe('90 kg');
  });
});
