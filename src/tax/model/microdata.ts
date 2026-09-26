import baseline from '../data/baseline_2025.json';
import microdataJson from '../data/microdata_2025.json';
import type {
  AdultCreditAudit,
  AdultCreditAuditBucket,
  AdultCreditAuditBucketId,
  ReformSettings,
} from './types';

type DistributionCell = [
  asecCashWageDollars: number,
  scheduleAdults: number,
  creditAdults: number,
  taxUnitWeight: number,
];

export interface MicrodataScore {
  grossCompensationBase: number;
  taxableCompensationBase: number;
  exemptCompensationBase: number;
  progressiveEquivalentCompensationBase: number;
  progressiveMiddleCompensationBase: number;
  progressiveIntermediateCompensationBase: number;
  progressiveTopCompensationBase: number;
  progressiveAverageWageRateShare: number;
  adultCreditStatutoryCost: number;
  adultCreditCost: number;
  adultCreditAudit: AdultCreditAudit;
}

interface AdultCreditCalculation {
  maximum: number;
  phaseIn: number;
  phaseOut: number;
  credit: number;
}

interface AdultCreditBucketAccumulator {
  taxUnits: number;
  adults: number;
  statutoryCost: number;
}

const adultCreditBucketOrder: AdultCreditAuditBucketId[] = [
  'noEligibleAdult',
  'zeroCompensation',
  'phaseIn',
  'fullCredit',
  'phaseInPhaseOutOverlap',
  'phaseOut',
  'fullyPhasedOut',
  'noCreditUnderSchedule',
  'universalCredit',
];

function share(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function adultCredit(compensation: number, adults: number, settings: ReformSettings): AdultCreditCalculation {
  if (adults <= 0) return { maximum: 0, phaseIn: 0, phaseOut: 0, credit: 0 };
  const maximum = adults * settings.adultCredit;
  if (settings.adultCreditMode === 'universal') {
    return { maximum, phaseIn: maximum, phaseOut: 0, credit: maximum };
  }
  const phaseIn = Math.min(maximum, compensation * settings.adultCreditPhaseInRate);
  const phaseOutStart = adults * settings.adultCreditPhaseOutStartPerAdult;
  const phaseOut = Math.max(0, compensation - phaseOutStart) * settings.adultCreditPhaseOutRate;
  return { maximum, phaseIn, phaseOut, credit: Math.max(0, phaseIn - phaseOut) };
}

function adultCreditBucket(
  compensation: number,
  adults: number,
  calculation: AdultCreditCalculation,
  mode: ReformSettings['adultCreditMode'],
): AdultCreditAuditBucketId {
  if (adults <= 0) return 'noEligibleAdult';
  if (mode === 'universal') return 'universalCredit';
  if (compensation <= 0) return 'zeroCompensation';

  const tolerance = 1e-7;
  if (calculation.credit <= tolerance) {
    return calculation.maximum > tolerance && calculation.phaseOut > tolerance
      ? 'fullyPhasedOut'
      : 'noCreditUnderSchedule';
  }
  if (calculation.phaseOut > tolerance && calculation.phaseIn < calculation.maximum - tolerance) {
    return 'phaseInPhaseOutOverlap';
  }
  if (calculation.phaseOut > tolerance) return 'phaseOut';
  if (calculation.credit >= calculation.maximum - tolerance) return 'fullCredit';
  return 'phaseIn';
}

function zeroCreditCompensationPerAdult(settings: ReformSettings): number | null {
  if (settings.adultCreditMode === 'universal' || settings.adultCreditPhaseOutRate <= 0) return null;
  if (settings.adultCredit <= 0 || settings.adultCreditPhaseInRate <= 0) return 0;

  const maximumReachedAt = settings.adultCredit / settings.adultCreditPhaseInRate;
  const phaseOutStart = settings.adultCreditPhaseOutStartPerAdult;
  if (phaseOutStart < maximumReachedAt
    && settings.adultCreditPhaseOutRate > settings.adultCreditPhaseInRate) {
    const overlapExhaustion = settings.adultCreditPhaseOutRate * phaseOutStart
      / (settings.adultCreditPhaseOutRate - settings.adultCreditPhaseInRate);
    if (overlapExhaustion <= maximumReachedAt) return overlapExhaustion;
  }
  return phaseOutStart + settings.adultCredit / settings.adultCreditPhaseOutRate;
}

function progressiveBases(compensation: number, scheduleAdults: number, settings: ReformSettings): [number, number, number] {
  const zeroCeiling = scheduleAdults * settings.progressiveZeroBracketPerAdult;
  const topThreshold = Math.max(zeroCeiling, scheduleAdults * settings.progressiveTopBracketPerAdult);
  const intermediateStart = settings.progressiveIntermediateStartPerAdult === null
    ? topThreshold
    : Math.max(zeroCeiling, Math.min(topThreshold,
      scheduleAdults * settings.progressiveIntermediateStartPerAdult));
  const middleBase = Math.max(0, Math.min(compensation, intermediateStart) - zeroCeiling);
  const intermediateBase = Math.max(0, Math.min(compensation, topThreshold) - intermediateStart);
  const topBase = Math.max(0, compensation - topThreshold);
  return [middleBase, intermediateBase, topBase];
}

export function calculateMicrodataScore(settings: ReformSettings): MicrodataScore {
  const controls = microdataJson.compensationControlsBillions;
  const cashScale = microdataJson.calibration.cashWageScaleToBea2025;
  const socialInsurancePerCashDollar = controls.employerGovernmentSocialInsurance / controls.cashWagesAndSalaries;
  const healthInsurancePerCashDollar = baseline.compensationComponents.employerHealthInsurance
    / controls.cashWagesAndSalaries;
  const pensionOtherInsurancePerCashDollar = baseline.compensationComponents.employerPensionAndOtherInsurance
    / controls.cashWagesAndSalaries;
  const adultPopulationScale = microdataJson.calibration.adultPopulationScaleToCensus2025;
  const cashTaxableShare = 1 - share(settings.cashWageExemptionShare);
  const socialTaxableShare = 1 - share(settings.employerSocialInsuranceExemptionShare);
  const healthTaxableShare = 1 - share(settings.employerHealthInsuranceExemptionShare);
  const pensionOtherTaxableShare = 1 - share(settings.employerPensionOtherInsuranceExemptionShare);

  let progressiveBaseDollars = 0;
  let progressiveMiddleBaseDollars = 0;
  let progressiveIntermediateBaseDollars = 0;
  let progressiveTopBaseDollars = 0;
  let statutoryAdultCreditDollars = 0;
  let totalTaxUnits = 0;
  let totalAdults = 0;
  let positiveCreditTaxUnits = 0;
  let adultsInPositiveCreditUnits = 0;
  const auditBuckets = new Map<AdultCreditAuditBucketId, AdultCreditBucketAccumulator>(
    adultCreditBucketOrder.map((id) => [id, { taxUnits: 0, adults: 0, statutoryCost: 0 }]),
  );
  for (const rawCell of microdataJson.distribution) {
    const [asecCashWage, scheduleAdults, creditAdults, taxUnitWeight] = rawCell as DistributionCell;
    const projectedCashWage = asecCashWage * cashScale;
    const employerSocialInsurance = projectedCashWage * socialInsurancePerCashDollar;
    const employerHealthInsurance = projectedCashWage * healthInsurancePerCashDollar;
    const employerPensionOtherInsurance = projectedCashWage * pensionOtherInsurancePerCashDollar;
    const grossCompensation = projectedCashWage + employerSocialInsurance
      + employerHealthInsurance + employerPensionOtherInsurance;
    const taxableCompensation = projectedCashWage * cashTaxableShare
      + employerSocialInsurance * socialTaxableShare
      + employerHealthInsurance * healthTaxableShare
      + employerPensionOtherInsurance * pensionOtherTaxableShare;
    const [progressiveMiddleBase, progressiveIntermediateBase, progressiveTopBase] = progressiveBases(
      taxableCompensation,
      scheduleAdults,
      settings,
    );
    const middleRateShare = settings.rate > 0
      ? Math.min(1, Math.max(0, settings.progressiveMiddleRate / settings.rate))
      : 0;
    const intermediateRateShare = settings.rate > 0
      ? Math.min(1, Math.max(middleRateShare, settings.progressiveIntermediateRate / settings.rate))
      : 0;
    progressiveMiddleBaseDollars += taxUnitWeight * progressiveMiddleBase;
    progressiveIntermediateBaseDollars += taxUnitWeight * progressiveIntermediateBase;
    progressiveTopBaseDollars += taxUnitWeight * progressiveTopBase;
    progressiveBaseDollars += taxUnitWeight
      * (progressiveMiddleBase * middleRateShare
        + progressiveIntermediateBase * intermediateRateShare + progressiveTopBase);
    const creditEarnings = settings.adultCreditEarningsBase === 'cash'
      ? projectedCashWage + employerSocialInsurance : grossCompensation;
    const creditCalculation = adultCredit(creditEarnings, creditAdults, settings);
    const calibratedAdults = taxUnitWeight * creditAdults * adultPopulationScale;
    const calibratedCreditCost = taxUnitWeight * creditCalculation.credit * adultPopulationScale;
    const bucket = auditBuckets.get(adultCreditBucket(
      creditEarnings,
      creditAdults,
      creditCalculation,
      settings.adultCreditMode,
    ));
    if (!bucket) throw new Error('Adult-credit audit bucket is not initialized');
    bucket.taxUnits += taxUnitWeight;
    bucket.adults += calibratedAdults;
    bucket.statutoryCost += calibratedCreditCost;
    totalTaxUnits += taxUnitWeight;
    totalAdults += calibratedAdults;
    statutoryAdultCreditDollars += calibratedCreditCost;
    if (creditCalculation.credit > 0) {
      positiveCreditTaxUnits += taxUnitWeight;
      adultsInPositiveCreditUnits += calibratedAdults;
    }
  }

  const grossCompensationBase = baseline.components.compensation;
  const exemptCompensationBase = controls.cashWagesAndSalaries * share(settings.cashWageExemptionShare)
    + controls.employerGovernmentSocialInsurance * share(settings.employerSocialInsuranceExemptionShare)
    + baseline.compensationComponents.employerHealthInsurance
      * share(settings.employerHealthInsuranceExemptionShare)
    + baseline.compensationComponents.employerPensionAndOtherInsurance
      * share(settings.employerPensionOtherInsuranceExemptionShare);
  const taxableCompensationBase = grossCompensationBase - exemptCompensationBase;
  const adultCreditStatutoryCost = statutoryAdultCreditDollars / 1e9;
  const adultCreditCost = adultCreditStatutoryCost * share(settings.adultCreditTakeUpRate);
  const totalAdultsMillions = totalAdults / 1e6;
  const universalMaximumCostBillions = totalAdultsMillions * settings.adultCredit / 1000;
  const buckets: AdultCreditAuditBucket[] = adultCreditBucketOrder
    .map((id) => {
      const values = auditBuckets.get(id);
      if (!values) throw new Error('Adult-credit audit bucket is not initialized');
      const adultsMillions = values.adults / 1e6;
      const statutoryCostBillions = values.statutoryCost / 1e9;
      return {
        id,
        taxUnitsMillions: values.taxUnits / 1e6,
        adultsMillions,
        adultPopulationShare: totalAdultsMillions > 0 ? adultsMillions / totalAdultsMillions : 0,
        statutoryCostBillions,
        budgetCostBillions: statutoryCostBillions * share(settings.adultCreditTakeUpRate),
        averageStatutoryCreditPerAdult: adultsMillions > 0
          ? statutoryCostBillions * 1000 / adultsMillions
          : 0,
        statutoryCostShare: adultCreditStatutoryCost > 0
          ? statutoryCostBillions / adultCreditStatutoryCost
          : 0,
      };
    })
    .filter((bucket) => bucket.taxUnitsMillions > 0 || bucket.id === 'phaseInPhaseOutOverlap');
  const fullPhaseInCompensationPerAdult = settings.adultCreditMode === 'earned'
    && settings.adultCreditPhaseInRate > 0
    ? settings.adultCredit / settings.adultCreditPhaseInRate
    : null;
  const adultCreditAudit: AdultCreditAudit = {
    buckets,
    totalTaxUnitsMillions: totalTaxUnits / 1e6,
    totalAdultsMillions,
    positiveCreditTaxUnitsMillions: positiveCreditTaxUnits / 1e6,
    adultsInPositiveCreditUnitsMillions: adultsInPositiveCreditUnits / 1e6,
    adultsInPositiveCreditUnitsShare: totalAdults > 0
      ? adultsInPositiveCreditUnits / totalAdults
      : 0,
    universalMaximumCostBillions,
    statutoryCostShareOfUniversalMaximum: universalMaximumCostBillions > 0
      ? adultCreditStatutoryCost / universalMaximumCostBillions
      : 0,
    averageStatutoryCreditPerAdult: totalAdultsMillions > 0
      ? adultCreditStatutoryCost * 1000 / totalAdultsMillions
      : 0,
    fullPhaseInCompensationPerAdult,
    phaseOutStartCompensationPerAdult: settings.adultCreditPhaseOutStartPerAdult,
    zeroCreditCompensationPerAdult: zeroCreditCompensationPerAdult(settings),
    phaseInPhaseOutOverlap: fullPhaseInCompensationPerAdult !== null
      && settings.adultCreditPhaseOutStartPerAdult < fullPhaseInCompensationPerAdult,
  };

  return {
    grossCompensationBase,
    taxableCompensationBase,
    exemptCompensationBase,
    progressiveEquivalentCompensationBase: progressiveBaseDollars / 1e9,
    progressiveMiddleCompensationBase: progressiveMiddleBaseDollars / 1e9,
    progressiveIntermediateCompensationBase: progressiveIntermediateBaseDollars / 1e9,
    progressiveTopCompensationBase: progressiveTopBaseDollars / 1e9,
    progressiveAverageWageRateShare: taxableCompensationBase > 0
      ? (progressiveBaseDollars / 1e9) / taxableCompensationBase
      : 0,
    adultCreditStatutoryCost,
    adultCreditCost,
    adultCreditAudit,
  };
}

export const microdata2025 = microdataJson;
