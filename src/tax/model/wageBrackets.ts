import type { ReformSettings, WageBracket } from './types';

/** Thresholds apply to the taxable household compensation base per filing adult. */
export const marginalProtectionPresets: Record<3 | 4 | 5, WageBracket[]> = {
  3: [
    { upperPerAdult: 70000, rate: 0.175 },
    { upperPerAdult: 275000, rate: 0.25 },
    { upperPerAdult: null, rate: 0.35 },
  ],
  4: [
    { upperPerAdult: 70000, rate: 0.175 },
    { upperPerAdult: 220000, rate: 0.25 },
    { upperPerAdult: 275000, rate: 0.30 },
    { upperPerAdult: null, rate: 0.35 },
  ],
  5: [
    { upperPerAdult: 20000, rate: 0.075 },
    { upperPerAdult: 70000, rate: 0.175 },
    { upperPerAdult: 220000, rate: 0.25 },
    { upperPerAdult: 275000, rate: 0.30 },
    { upperPerAdult: null, rate: 0.35 },
  ],
};

export function wageBracketTax(taxableCompensation: number, adults: number, brackets: readonly WageBracket[]): number {
  const income = Math.max(0, taxableCompensation);
  const count = Math.max(1, adults);
  let lower = 0;
  let tax = 0;
  for (const band of brackets) {
    const upper = band.upperPerAdult === null ? Number.POSITIVE_INFINITY
      : Math.max(lower, count * band.upperPerAdult);
    tax += Math.max(0, Math.min(income, upper) - lower) * Math.max(0, band.rate);
    lower = upper;
    if (income <= upper) break;
  }
  return tax;
}

export function wageBracketMarginalRate(taxableCompensation: number, adults: number, brackets: readonly WageBracket[]): number {
  const income = Math.max(0, taxableCompensation);
  for (const band of brackets) {
    if (band.upperPerAdult === null || income < Math.max(1, adults) * band.upperPerAdult) {
      return Math.max(0, band.rate);
    }
  }
  return Math.max(0, brackets[brackets.length - 1]?.rate ?? 0);
}

export function wageScheduleLabel(settings: ReformSettings): string {
  if (settings.wageTaxMode === 'flat') return `${(settings.rate * 100).toFixed(1)}% flat X tax`;
  if (settings.progressiveWageBrackets?.length) {
    return `${settings.progressiveWageBrackets.map(b => `${(b.rate * 100).toFixed(1)}%`).join(' / ')} wage X tax`;
  }
  return `${(settings.rate * 100).toFixed(1)}% top / ${(settings.progressiveMiddleRate * 100).toFixed(1)}% middle X tax (legacy)`;
}
