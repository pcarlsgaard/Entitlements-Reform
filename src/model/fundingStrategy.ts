import type { FundingStrategy } from './types'

export const fundingStrategies: readonly FundingStrategy[] = [
  'paygo',
  'socialSecurityOnly',
  'medicareOnly',
  'both',
  'socialSecurityFirst',
  'savingsFundedSequential',
]

export const fundingStrategyLabels: Record<FundingStrategy, string> = {
  paygo: 'Both benefits PAYGO',
  socialSecurityOnly: 'Prefund SS · Medicare PAYGO',
  medicareOnly: 'SS PAYGO · prefund Medicare',
  both: 'Prefund both benefits',
  socialSecurityFirst: 'SS-first sequential prefunding',
  savingsFundedSequential: 'Savings-funded sequential prefunding',
}

export function prefundsSocialSecurity(strategy: FundingStrategy): boolean {
  return (
    fullyPrefundsSocialSecurity(strategy) ||
    strategy === 'savingsFundedSequential'
  )
}

export function fullyPrefundsSocialSecurity(
  strategy: FundingStrategy,
): boolean {
  return (
    strategy === 'socialSecurityOnly' ||
    strategy === 'both' ||
    strategy === 'socialSecurityFirst'
  )
}

export function fullyPrefundsMedicare(strategy: FundingStrategy): boolean {
  return strategy === 'medicareOnly' || strategy === 'both'
}

export function usesSocialSecurityDividend(strategy: FundingStrategy): boolean {
  return strategy === 'socialSecurityFirst'
}

export function usesSavingsFundedSequence(
  strategy: FundingStrategy,
): boolean {
  return strategy === 'savingsFundedSequential'
}

export function usesCohortFundingSchedule(
  strategy: FundingStrategy,
): boolean {
  return (
    strategy === 'socialSecurityFirst' ||
    strategy === 'savingsFundedSequential'
  )
}

export function hasAnyPrefunding(strategy: FundingStrategy): boolean {
  return strategy !== 'paygo'
}
