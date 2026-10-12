import type { DeviceCapabilities, StudioConfig } from './types'

export interface SetupSuggestion {
  id: 'balanced' | 'latency' | 'quality' | 'streaming' | 'recording' | 'light'
  title: string
  tagline: string
  /** Codec · size · frame rate · bit rate, for display. */
  summary: string
  /** Why these values were chosen for this particular device. */
  reasons: string[]
  /** A follow-up step the suggestion cannot take for the user. */
  note?: string
  patch: Partial<StudioConfig>
}

export interface DeviceProfile {
  width: number
  height: number
  longSide: number
  refresh: number
  reported: boolean
  codecs: Set<string>
  hardware: Map<string, string>
  audioSupported: boolean
  audioCodecs: Set<string>
  wireless: boolean
}

export function describeDevice(capabilities: DeviceCapabilities | null, connection?: string): DeviceProfile
export function suggestSetups(capabilities: DeviceCapabilities | null, connection?: string): SetupSuggestion[]
export function suggestionApplied(suggestion: SetupSuggestion, config: StudioConfig): boolean
