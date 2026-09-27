import { defaultCombinedPolicy } from './combined'
import type { CombinedPolicy } from './combined'
import { exampleHouseholds } from './householdScenario'
import type { ExampleHousehold } from './householdScenario'
import { transferProgramIds } from '../tax/model/transfers'

export const configurationStorageKey = 'entitlements-reform.configurations.v1'

export interface ScenarioState {
  policy: CombinedPolicy
  householdProfiles: ExampleHousehold[]
  householdYear: number
  householdSelectedId: string
}

export interface SavedConfiguration {
  format: 'entitlements-reform-configuration'
  version: 1
  id: string
  name: string
  savedAt: string
  scenario: ScenarioState
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function assertShape(reference: unknown, value: unknown, path: string): void {
  if (path === 'policy.tax.progressiveIntermediateStartPerAdult' && value === null) return
  if (reference === null) {
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value)))
      throw new Error(`${path} must be a number or null.`)
  } else if (typeof reference === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e9)
      throw new Error(`${path} must be a finite number.`)
  } else if (typeof reference === 'string' || typeof reference === 'boolean') {
    if (typeof value !== typeof reference) throw new Error(`${path} has the wrong type.`)
  } else if (Array.isArray(reference)) {
    if (!Array.isArray(value)) throw new Error(`${path} must be a list.`)
    for (const item of value) assertShape(reference[0] ?? 0, item, `${path}[]`)
  } else if (record(reference)) {
    if (!record(value)) throw new Error(`${path} must be an object.`)
    for (const [key, expected] of Object.entries(reference)) assertShape(expected, value[key], `${path}.${key}`)
  }
}

function oneOf(value: unknown, allowed: readonly string[], path: string): void {
  if (!allowed.includes(value as string)) throw new Error(`${path} is not recognized.`)
}

function within(value: number, low: number, high: number, path: string): void {
  if (value < low || value > high) throw new Error(`${path} is outside the simulator range.`)
}

/** Validate imported or browser-stored data before it reaches the fiscal engine. */
export function parseConfiguration(json: string): SavedConfiguration {
  let raw: unknown
  try { raw = JSON.parse(json) } catch { throw new Error('This is not valid JSON.') }
  if (!record(raw) || raw.format !== 'entitlements-reform-configuration' || raw.version !== 1)
    throw new Error('This is not a supported simulator configuration (version 1).')
  if (typeof raw.id !== 'string' || raw.id.length > 100 || !raw.id ||
      typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 80 ||
      typeof raw.savedAt !== 'string' || !Number.isFinite(Date.parse(raw.savedAt)) || !record(raw.scenario))
    throw new Error('The configuration header is incomplete.')
  const scenario = raw.scenario
  assertShape(defaultCombinedPolicy, scenario.policy, 'policy')
  if (!record(scenario.policy)) throw new Error('Missing policy.')
  const policy = scenario.policy as unknown as CombinedPolicy
  oneOf(policy.baselineMode, ['scheduled', 'payable'], 'baseline mode')
  oneOf(policy.tax.wageTaxMode, ['flat', 'progressive'], 'wage tax mode')
  oneOf(policy.tax.adultCreditMode, ['earned', 'universal'], 'adult credit mode')
  oneOf(policy.tax.adultCreditEarningsBase, ['cash', 'compensation'], 'earnings base')
  oneOf(policy.health.redistributionRule, ['nationalEqual', 'employerCellEqual', 'ownContribution'], 'redistribution')
  oneOf(policy.health.recipientScope, ['policyholders', 'coveredWorkers'], 'recipient scope')
  oneOf(policy.assumptions.fundingStrategy, ['paygo', 'socialSecurityOnly', 'medicareOnly', 'both', 'socialSecurityFirst', 'savingsFundedSequential'], 'funding strategy')
  if (![0, 18].includes(policy.assumptions.prefundingStartAge) ||
      policy.assumptions.reformYear !== 2026 || policy.assumptions.endYear !== 2095 ||
      policy.assumptions.maxModeledAge !== 110 || policy.assumptions.benefitPhaseInYears < 1 ||
      policy.assumptions.medicareYearB < policy.assumptions.medicareYearA ||
      policy.assumptions.medicareYearA < 2026 || policy.assumptions.medicareYearB > 2095)
    throw new Error('The configuration has incompatible horizon or transition settings.')
  within(policy.assumptions.fullRetirementAge, 62, 80, 'retirement age')
  within(policy.assumptions.medicareEligibilityAge, 60, 80, 'Medicare eligibility age')
  within(policy.assumptions.benefitPhaseInYears, 1, 70, 'benefit phase-in')
  within(policy.assumptions.realGDPGrowth, -0.02, 0.06, 'real GDP growth')
  within(policy.assumptions.inflation, 0, 0.08, 'inflation')
  within(policy.tax.rate, 0, 0.7, 'tax rate')
  within(policy.dynamic.phaseInYears, 1, 30, 'labor phase-in')
  within(policy.dynamic.capitalPhaseInYears, 1, 30, 'capital phase-in')
  if (policy.assumptions.socialSecurityBenefitCap2026 !== null)
    within(policy.assumptions.socialSecurityBenefitCap2026, 1000, 200000, 'Social Security cap')
  if (!Array.isArray(scenario.householdProfiles) || scenario.householdProfiles.length !== exampleHouseholds.length)
    throw new Error('The household examples are incomplete.')
  for (const example of exampleHouseholds) {
    const imported = scenario.householdProfiles.find((item: unknown) => record(item) && item.id === example.id)
    assertShape({ ...example, childAges2026: [0], manualAnnualBenefits2026: {} }, imported, example.id)
    const profile = imported as ExampleHousehold
    oneOf(profile.filingStatus, ['single', 'married'], 'filing status')
    oneOf(profile.coverage, ['esi', 'nongroup', 'uninsured', 'public'], 'coverage')
    within(profile.primaryAge2026, 18, 105, 'first adult age')
    within(profile.spouseAge2026, 18, 105, 'spouse age')
    within(profile.primaryWage2026, 0, 1e6, 'first adult wages')
    within(profile.spouseWage2026, 0, 1e6, 'spouse wages')
    within(profile.workThroughAge, 18, 80, 'work stop age')
    if (profile.childAges2026.length > 4 || profile.childAges2026.some(age => !Number.isInteger(age) || age < 0 || age > 17))
      throw new Error('Child ages must be between 0 and 17 (up to four children).')
    if (!record(profile.manualAnnualBenefits2026) || Object.entries(profile.manualAnnualBenefits2026).some(([key, amount]) =>
      !transferProgramIds.includes(key as typeof transferProgramIds[number]) ||
      typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 1e6))
      throw new Error('A manual transfer amount is invalid.')
  }
  if (typeof scenario.householdYear !== 'number' || !Number.isInteger(scenario.householdYear) ||
      scenario.householdYear < 2026 || scenario.householdYear > 2095 ||
      typeof scenario.householdSelectedId !== 'string' ||
      !exampleHouseholds.some(item => item.id === scenario.householdSelectedId))
    throw new Error('The household selection or year is invalid.')
  // Return a detached snapshot. Future versions can migrate at this boundary.
  return structuredClone(raw) as unknown as SavedConfiguration
}

export function makeConfiguration(name: string, scenario: ScenarioState, id: string = crypto.randomUUID()): SavedConfiguration {
  return parseConfiguration(JSON.stringify({
    format: 'entitlements-reform-configuration', version: 1, id,
    name: name.trim().slice(0, 80), savedAt: new Date().toISOString(), scenario,
  }))
}

export function parseConfigurationLibrary(json: string | null): SavedConfiguration[] {
  if (json === null) return []
  let raw: unknown
  try { raw = JSON.parse(json) } catch { throw new Error('Saved configurations in this browser could not be read.') }
  if (!Array.isArray(raw)) throw new Error('Saved configurations in this browser are invalid.')
  return raw.map(item => parseConfiguration(JSON.stringify(item)))
}
