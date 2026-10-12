import { DEFAULT_CONFIG, isGuidedOption } from './options'
import type { SavedProfile, StudioConfig } from './types'

export function normalizeConfig(value: unknown): StudioConfig {
  const candidate = value && typeof value === 'object' ? value as Partial<StudioConfig> : {}
  const normalized = { ...DEFAULT_CONFIG } as StudioConfig
  for (const key of Object.keys(DEFAULT_CONFIG) as Array<keyof StudioConfig>) {
    if (key === 'extras') continue
    const next = candidate[key]
    if (typeof next === typeof DEFAULT_CONFIG[key]) (normalized as unknown as Record<string, unknown>)[key] = next
  }
  const extras = candidate.extras
  if (typeof candidate.videoEnabled !== 'boolean' && extras && typeof extras === 'object' && !Array.isArray(extras) && (extras as Record<string, unknown>)['--no-video'] === true) {
    normalized.videoEnabled = false
  }
  normalized.extras = extras && typeof extras === 'object' && !Array.isArray(extras)
    ? Object.fromEntries(Object.entries(extras).filter(([name, item]) => !isGuidedOption(name) && (typeof item === 'boolean' || typeof item === 'string')))
    : {}
  return normalized
}

export function profileDescription(config: StudioConfig) {
  return config.videoEnabled ? `${config.maxSize}p · ${config.maxFps} fps · ${config.videoCodec.toUpperCase()}` : `Audio only · ${config.audioCodec.toUpperCase()}`
}

export function parseProfiles(parsed: unknown): SavedProfile[] {
    if (!Array.isArray(parsed)) return []
    const ids = new Set<string>()
    return parsed.flatMap((item): SavedProfile[] => {
      if (!item || typeof item !== 'object') return []
      const raw = item as Partial<SavedProfile>
      if (typeof raw.id !== 'string' || !raw.id || ids.has(raw.id) || typeof raw.name !== 'string' || !raw.name.trim()) return []
      ids.add(raw.id)
      const config = { ...normalizeConfig(raw.config), serial: '' }
      return [{
        id: raw.id,
        name: raw.name.trim(),
        description: typeof raw.description === 'string' && raw.description.trim() ? raw.description : profileDescription(config),
        config,
        updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
      }]
    })
}

export function readProfiles(): SavedProfile[] {
  try { return parseProfiles(JSON.parse(localStorage.getItem('scrcpy-studio:profiles') || '[]')) } catch { return [] }
}

export const PROFILE_NAME_LIMIT = 64

// Imported profiles never replace existing ones: colliding ids are regenerated
// and colliding names receive a numeric suffix.
export function mergeProfiles(current: SavedProfile[], incoming: SavedProfile[]): SavedProfile[] {
  const ids = new Set(current.map((profile) => profile.id))
  const names = new Set(current.map((profile) => profile.name.toLocaleLowerCase()))
  const merged = [...current]
  for (const profile of incoming) {
    const id = ids.has(profile.id) ? crypto.randomUUID() : profile.id
    const base = profile.name.slice(0, PROFILE_NAME_LIMIT)
    let name = base
    for (let copy = 2; names.has(name.toLocaleLowerCase()); copy += 1) {
      const suffix = ` (${copy})`
      name = `${base.slice(0, PROFILE_NAME_LIMIT - suffix.length)}${suffix}`
    }
    ids.add(id)
    names.add(name.toLocaleLowerCase())
    merged.push({ ...profile, id, name })
  }
  return merged
}
