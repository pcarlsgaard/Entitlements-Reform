import baseline from '../data/baseline_2025.json';
import childCreditMicrodataJson from '../data/child_credit_microdata_2025.json';
import microdataJson from '../data/microdata_2025.json';
import type { ReformSettings } from './types';

declare module './types' {
  interface ReformSettings {
    /** Additional per-child credit layered on top of childCredit for children under age 6. */
    under6ChildCredit?: number;
    /** Share of the maximum child credit available regardless of earnings. */
    childCreditBaselineRefundableShare?: number;
    /** Earnings phase-in rate applied only to the portion not refundable at baseline. */
    childCreditPhaseInRate?: number;
  }

  interface HouseholdInput {
    /** Number of qualifying children younger than 6; constrained to total children. */
    childrenUnder6?: number;
  }
}

interface ChildCreditMicrodataSnapshot {
  schemaVersion: number;
  snapshot: string;
  source: Record<string, unknown>;
  calibration: {
    childPopulationScaleToCensus2025: number;
  };
  fallbackUnder6PopulationMillions: number;
  distributionColumns: string[];
  distribution: number[][];
}

const childCreditMicrodata = childCreditMicrodataJson as ChildCreditMicrodataSnapshot;

function share(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function nonnegative(value: number | undefined): number {
  return Math.max(0, value ?? 0);
}

export function childCreditMaximum(
  children: number,
  childrenUnder6: number,
  settings: ReformSettings,
): number {
  const qualifyingChildren = Math.max(0, children);
  const qualifyingUnder6 = Math.max(0, Math.min(qualifyingChildren, childrenUnder6));
  return qualifyingChildren * Math.max(0, settings.childCredit)
    + qualifyingUnder6 * nonnegative(settings.under6ChildCredit);
}

export function calculateChildCredit(
  compensation: number,
  children: number,
  childrenUnder6: number,
  settings: ReformSettings,
): number {
  const maximum = childCreditMaximum(children, childrenUnder6, settings);
  if (maximum <= 0) return 0;

  // Legacy settings predate the refundability controls and remain fully refundable.
  const baselineShare = share(settings.childCreditBaselineRefundableShare ?? 1);
  const baseline = maximum * baselineShare;
  const remaining = maximum - baseline;
  if (remaining <= 0) return maximum;

  const phaseIn = Math.min(
    remaining,
    Math.max(0, compensation) * nonnegative(settings.childCreditPhaseInRate),
  );
  return baseline + phaseIn;
}

export function hasDetailedChildCreditMicrodata(): boolean {
  return childCreditMicrodata.distribution.length > 0;
}

/** Score the checked-in age-aware CPS tax-unit snapshot; no CI/network work. */
export function calculateAggregateChildCreditCost(settings: ReformSettings): number {
  if (hasDetailedChildCreditMicrodata()) {
    const compensationScale = microdataJson.calibration.grossCompensationScaleToBea2025;
    const childScale = childCreditMicrodata.calibration.childPopulationScaleToCensus2025;
    let costDollars = 0;
    for (const row of childCreditMicrodata.distribution) {
      const [rawCashWage, children, childrenUnder6, taxUnitWeight] = row as [number, number, number, number];
      const compensation = rawCashWage * compensationScale;
      costDollars += taxUnitWeight
        * calculateChildCredit(compensation, children, childrenUnder6, settings)
        * childScale;
    }
    return costDollars / 1e9;
  }

  throw new Error('Missing pinned child-credit microdata; cannot score earnings phase-in safely.');
}

export function childCreditPopulationSummary(): { childrenMillions: number; under6Millions: number } {
  if (hasDetailedChildCreditMicrodata()) {
    const childScale = childCreditMicrodata.calibration.childPopulationScaleToCensus2025;
    let children = 0;
    let under6 = 0;
    for (const row of childCreditMicrodata.distribution) {
      const [, childCount, under6Count, weight] = row as [number, number, number, number];
      children += childCount * weight * childScale;
      under6 += under6Count * weight * childScale;
    }
    return { childrenMillions: children / 1e6, under6Millions: under6 / 1e6 };
  }
  return {
    childrenMillions: baseline.populationsMillions.children,
    under6Millions: childCreditMicrodata.fallbackUnder6PopulationMillions,
  };
}
