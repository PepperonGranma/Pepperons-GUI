export interface CliConstraints {
  min?: number
  max?: number
  allowedValues?: Array<number | string>
  unit?: string
  defaultValue?: string | number
  suffixes?: string[]
  suffixMultipliers?: Record<string, number>
  zeroMeaning?: string
  deviceDependent?: boolean
  note?: string
  integer?: boolean
  keywords?: string[]
  format?: 'port-range'
  sourceVersion?: string
  referenceOnly?: boolean
}
export const CONSTRAINT_VERSION: string
export const PARSER_CONSTRAINTS: Record<string, CliConstraints>
export function constraintsFor(name: string, runtimeVersion?: string): CliConstraints | undefined
export function withConstraints<T extends { name: string; description: string; source?: string }>(option: T, runtimeVersion?: string): T & { constraints?: CliConstraints }
export function allowedDescription(constraints: CliConstraints): string
export function validateConstraint(value: string, constraints?: CliConstraints): string
