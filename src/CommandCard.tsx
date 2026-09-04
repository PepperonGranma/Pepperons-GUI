import { useEffect, useState } from 'react'
import { Play, Plus, X } from 'lucide-react'
import { allowedDescription, validateConstraint } from '../electron/command-constraints.mjs'
import type { CliOption } from './types'

export function ConstraintDetails({ option }: { option: CliOption }) {
  const constraints = option.constraints
  if (!constraints) return null
  return <div className="command-constraints" id={`constraint-${option.name}`}>
    <span className="constraint-source">scrcpy CLI · {constraints.sourceVersion}{constraints.referenceOnly ? ' reference' : ''}</span>
    <span><strong>Allowed:</strong> {allowedDescription(constraints)}</span>
    {constraints.defaultValue !== undefined && <span><strong>Default:</strong> {constraints.defaultValue}</span>}
    {constraints.zeroMeaning && <span>0 = {constraints.zeroMeaning}</span>}
    {constraints.suffixes && constraints.suffixes.length > 0 ? <span>{constraints.suffixes.map(suffix => `${suffix} = ×${constraints.suffixMultipliers?.[suffix]?.toLocaleString('en-US')}`).join(' · ')}</span> : null}
    {constraints.note && <span className={constraints.deviceDependent ? 'constraint-device' : ''}>{constraints.note}</span>}
  </div>
}

export function CommandCard({ option, current, onChange, oneShot, canRun, onRun }: {
  option: CliOption
  current: boolean | string | undefined
  onChange(value: boolean | string): void
  oneShot: boolean
  canRun: boolean
  onRun(): void
}) {
  // Invalid edits are local drafts: never persist them to profiles or send them
  // to a running session. External changes (e.g. a loaded profile) replace drafts.
  const [draft, setDraft] = useState<string | null>(null)
  useEffect(() => { setDraft(null) }, [current])
  const value = draft ?? (typeof current === 'string' ? current : '')
  const error = validateConstraint(value, option.constraints)
  const enabled = current === true || (typeof current === 'string' && current.length > 0)
  const unavailable = option.runtimeAvailable === false
  const clearable = enabled || draft !== null
  const changeValue = (next: string) => {
    if (validateConstraint(next, option.constraints)) { setDraft(next); return }
    setDraft(null)
    onChange(next)
  }
  return <div className={`option-row ${enabled ? 'enabled' : ''} ${unavailable ? 'unavailable' : ''}`} data-command={option.name}>
    <div className="option-copy">
      <span className="option-category">{option.category} · {unavailable ? 'UNAVAILABLE IN RUNTIME' : option.source === 'runtime' ? 'RUNTIME' : 'FALLBACK'}</span>
      <code>{option.name}</code>
      <p title={option.description}>{option.description || `Pass ${option.name} to Scrcpy.`}</p>
      {option.valueHint && <small>Value: {option.valueHint}</small>}
      <ConstraintDetails option={option} />
    </div>
    <div className="command-input-group">
      <div className="option-editor">
        {oneShot ? <button className="run-action" disabled={!canRun || unavailable} onClick={onRun}><Play size={14} />Run</button>
          : option.kind === 'boolean' ? <label className={`switch-row ${unavailable ? 'disabled' : ''}`}><span className="switch-copy" /><input type="checkbox" aria-label={option.name} checked={current === true} disabled={unavailable} onChange={event => onChange(event.target.checked)} /><i><b /></i></label>
          : <><input aria-label={option.name} aria-invalid={error ? true : undefined} aria-describedby={[option.constraints ? `constraint-${option.name}` : '', error ? `error-${option.name}` : ''].filter(Boolean).join(' ') || undefined} disabled={unavailable} value={value} onChange={event => changeValue(event.target.value)} placeholder={option.valueHint || 'value'} spellCheck={false} />
            <button disabled={unavailable} className={clearable ? 'active' : ''} aria-label={clearable ? `Clear ${option.name}` : option.optionalValue ? `Enable ${option.name} without a value` : `Focus ${option.name}`} title={clearable ? 'Clear value' : option.optionalValue ? 'Enable without a value' : 'Enter a value'} onClick={event => {
              if (clearable) { setDraft(null); onChange('') }
              else if (option.optionalValue) onChange(true)
              else (event.currentTarget.previousElementSibling as HTMLInputElement | null)?.focus()
            }}>{clearable ? <X size={15} /> : <Plus size={15} />}</button></>}
      </div>
      {error && <p className="command-validation-error" id={`error-${option.name}`} role="status">{error} The last valid setting is unchanged.</p>}
    </div>
  </div>
}
