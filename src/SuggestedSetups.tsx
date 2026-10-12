import { useMemo } from 'react'
import { Check, CircleDot, Feather, Gem, Radio, RefreshCw, Sparkles, Wand2, Zap, type LucideIcon } from 'lucide-react'
import { SectionCard } from './controls'
import { suggestSetups, suggestionApplied, type SetupSuggestion } from './suggestions.mjs'
import type { Device, DeviceCapabilities, StudioConfig } from './types'

const ICONS: Record<SetupSuggestion['id'], LucideIcon> = {
  balanced: Sparkles, latency: Zap, quality: Gem, streaming: Radio, recording: CircleDot, light: Feather,
}

// Setups chosen from what the selected device reports. Applying one only fills in
// the same fields the guided pages edit, so it can be adjusted afterwards.
export function SuggestedSetups({ config, capabilities, device, loading, onApply }: {
  config: StudioConfig
  capabilities: DeviceCapabilities | null
  device?: Device
  loading: boolean
  onApply(suggestion: SetupSuggestion): void
}) {
  const ready = device?.state === 'device' && capabilities?.serial === device.serial
  const suggestions = useMemo(() => ready ? suggestSetups(capabilities, device?.connection) : [], [ready, capabilities, device?.connection])
  const name = capabilities?.hardware.model || device?.model || 'your device'

  return <SectionCard className="suggestions-card" kicker="TAILORED" title={ready ? `Suggested for ${name}` : 'Suggested setups'} icon={<Wand2 size={18} />}>
    {!ready
      ? <div className="suggestions-empty">{loading ? <><RefreshCw className="spin" size={14} />Inspecting the device to tailor suggestions…</> : 'Connect and authorize a device to see setups chosen for its display, encoders and connection.'}</div>
      : <div className="suggestion-grid">
        {suggestions.map((suggestion) => {
          const Icon = ICONS[suggestion.id]
          const applied = suggestionApplied(suggestion, config)
          return <article key={suggestion.id} className={`suggestion ${applied ? 'applied' : ''}`} data-suggestion={suggestion.id}>
            <header><span className="suggestion-icon"><Icon size={16} /></span><div><h4>{suggestion.title}</h4><p>{suggestion.tagline}</p></div></header>
            <code>{suggestion.summary}</code>
            <ul>{suggestion.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            {suggestion.note && <small>{suggestion.note}</small>}
            <button type="button" className="secondary" disabled={applied} onClick={() => onApply(suggestion)}>{applied ? <><Check size={14} />In use</> : 'Apply'}</button>
          </article>
        })}
      </div>}
  </SectionCard>
}
