import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Info, RefreshCw } from 'lucide-react'
import { validateOptionValue } from '../electron/scrcpy-args.mjs'
import mascot from './assets/pepperon.webp'
import { Dropdown } from './Dropdown'
import type { LogEntry, StudioConfig } from './types'

// The project mark is the maintainer's drawing, shown as is.
export function BrandMark({ small = false }: { small?: boolean }) {
  return <div className={`cat-mark ${small ? 'small' : ''}`} aria-hidden="true"><img src={mascot} alt="" draggable={false} /></div>
}

export type PageBaseProps = {
  config: StudioConfig
  update: <K extends keyof StudioConfig>(key: K, value: StudioConfig[K]) => void
  setConfig: React.Dispatch<React.SetStateAction<StudioConfig>>
  addLog(level: LogEntry['level'], text: string): void
}

export function Spec({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return <div className={`spec ${mono ? 'mono' : ''}`}><span>{label}</span><strong>{value}</strong></div>
}

export function StatusTag({ state, label }: { state: string; label: string }) {
  return <span className={`status-tag state-${state}`}><i />{label}</span>
}

export function CapabilityState({ loading, error, empty }: { loading: boolean; error: string; empty: boolean }) {
  if (loading) return <div className="capability-state"><RefreshCw className="spin" size={14} />Inspecting device…</div>
  if (error) return <div className="capability-state error"><Info size={14} />{error}</div>
  if (empty) return <div className="capability-state"><Info size={14} />No capability data</div>
  return null
}

export function SessionDuration({ startedAt, running }: { startedAt?: number; running: boolean }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running])
  if (!running || !startedAt) return <>—</>
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return <>{[hours, minutes, rest].map((value) => String(value).padStart(2, '0')).join(':')}</>
}

export function PageFrame({ title, subtitle, icon, badge, children }: { title: string; subtitle: string; icon: ReactNode; badge?: string; children: ReactNode }) {
  return <div className="page settings-page">
    <div className="page-header"><div className="page-icon">{icon}</div><div><span className="kicker">CONTROL ROOM</span><h1>{title}</h1><p>{subtitle}</p></div>{badge && <span className="page-badge">{badge}</span>}</div>
    {children}
  </div>
}

export function SectionCard({ title, kicker, icon, action, className = '', children }: { title: string; kicker: string; icon?: ReactNode; action?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={`section-card ${className}`}>
    <div className="card-header"><div className="card-icon">{icon}</div><div><span className="kicker">{kicker}</span><h3>{title}</h3></div>{action && <div className="card-action">{action}</div>}</div>
    <div className="card-content">{children}</div>
  </section>
}

export const RuntimeVersionContext = createContext('')

const FIELD_COMMIT_DELAY_MS = 900

export function Field({ label, value, onChange, placeholder, hint, suffix, disabled = false, flag }: { label: string; value: string; onChange(value: string): void; placeholder?: string; hint?: string; suffix?: string; disabled?: boolean; flag?: string }) {
  const runtimeVersion = useContext(RuntimeVersionContext)
  // Edits stay local until the user pauses, leaves the field or presses Enter, so a
  // half-typed value never restarts a live session. Invalid drafts are never committed.
  const [draft, setDraft] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const id = useId()
  const problem = (next: string) => flag && next.trim() ? validateOptionValue(flag, next.trim(), runtimeVersion) : ''
  const commit = (next: string) => {
    window.clearTimeout(timer.current)
    if (problem(next)) return
    setDraft(null)
    if (next !== value) onChange(next)
  }
  useEffect(() => { window.clearTimeout(timer.current); setDraft(null) }, [value])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const shown = draft ?? value
  const error = problem(shown)
  return <label className="field"><span>{label}</span><div className="input-wrap"><input value={shown} placeholder={placeholder} disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={error ? id : undefined}
    onChange={(event) => { const next = event.target.value; setDraft(next); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => commit(next), FIELD_COMMIT_DELAY_MS) }}
    onBlur={() => { if (draft !== null) commit(draft) }} onKeyDown={(event) => { if (event.key === 'Enter' && draft !== null) commit(draft) }} />{suffix && <em>{suffix}</em>}</div>
    {error ? <small className="field-error" id={id} role="status">{error} The last valid setting is unchanged.</small> : hint && <small>{hint}</small>}</label>
}

export function Select({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange(value: string): void; options: Array<[string, string, boolean?]>; disabled?: boolean }) {
  return <div className="field"><span>{label}</span><Dropdown label={label} value={value} onChange={onChange} options={options} disabled={disabled} /></div>
}

export function Switch({ label, description, checked, onChange, disabled = false }: { label: string; description?: string; checked: boolean; onChange(value: boolean): void; disabled?: boolean }) {
  return <label className={`switch-row ${disabled ? 'disabled' : ''}`}><span className="switch-copy">{label && <strong>{label}</strong>}{description && <small>{description}</small>}</span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><i><b /></i></label>
}

export function Segmented({ value, options, onChange, disabled = false }: { value: string; options: Array<[string, string]>; onChange(value: string): void; disabled?: boolean }) {
  return <div className="segmented">{options.map(([optionValue, label]) => <button disabled={disabled} className={value === optionValue ? 'active' : ''} key={optionValue} onClick={() => onChange(optionValue)}>{label}</button>)}</div>
}

export const IS_WINDOWS = navigator.userAgent.includes('Windows')

export function ModeSelect({ icon, label, value, options, unavailable = [], onChange, disabled = false }: { icon: ReactNode; label: string; value: string; options: string[]; unavailable?: string[]; onChange(value: string): void; disabled?: boolean }) {
  return <div className={`mode-select ${disabled ? 'disabled' : ''}`}><span className="mode-icon">{icon}</span><strong>{label}</strong><Dropdown label={label} value={value} options={options.map((option) => [option, option.toUpperCase(), unavailable.includes(option) && option !== value])} disabled={disabled} onChange={onChange} /></div>
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) {
  return <label className="color-field"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} /><span><strong>{label}</strong><small>{value.toUpperCase()}</small></span></label>
}

export function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="empty-state"><span>{icon}</span><div><strong>{title}</strong><p>{text}</p></div></div>
}

export function ShieldMark() {
  return <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M12 2 4 5v6c0 5.2 3.3 9 8 11 4.7-2 8-5.8 8-11V5l-8-3Z" fill="currentColor"/><path d="m8.5 12 2.2 2.2 4.8-5" fill="none" stroke="#10151d" strokeWidth="2"/></svg>
}
