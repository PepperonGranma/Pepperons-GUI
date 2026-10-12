import { useEffect, useState } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import mascot from './assets/pepperon.webp'

export type StartupStage = { label: string; done: boolean }

const asides = [
  'Waking up the control room…',
  'Polishing a suspicious number of pixels…',
  'Checking cables for dramatic tension…',
  'Teaching Pepperon the latest commands…',
]

// The checklist mirrors what the app is really waiting for, so the bar only
// fills as fast as the runtime, device and session checks actually finish.
export function StartupLoader({ leaving = false, stages }: { leaving?: boolean; stages: StartupStage[] }) {
  const [aside, setAside] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setAside((value) => (value + 1) % asides.length), 900)
    return () => window.clearInterval(timer)
  }, [])

  const finished = stages.filter((stage) => stage.done).length
  const current = stages.findIndex((stage) => !stage.done)
  const percent = stages.length ? Math.round((finished / stages.length) * 100) : 100

  return <div className={`startup-loader ${leaving ? 'is-leaving' : ''}`} role="status" aria-live="polite" aria-label="Pepperon GUI is loading">
    <div className="startup-loader-grid" aria-hidden="true" />
    <div className="loader-stage" aria-hidden="true">
      <span className="loader-orbit orbit-a"><i /></span><span className="loader-orbit orbit-b"><i /></span>
      <div className="loader-mascot"><img src={mascot} alt="" draggable={false} /></div>
      <span className="loader-shadow" />
    </div>
    <div className="loader-title" aria-hidden="true"><strong>Pepperon GUI</strong><span>Android control room</span></div>
    <ul className="loader-steps">
      {stages.map((stage, index) => <li key={stage.label} className={stage.done ? 'done' : index === current ? 'active' : ''}>
        <span aria-hidden="true">{stage.done ? <Check /> : index === current ? <LoaderCircle /> : null}</span>{stage.label}
      </li>)}
    </ul>
    <div className="loader-progress" role="progressbar" aria-label="Startup progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${Math.max(8, percent)}%` }} /></div>
    <small aria-hidden="true">{asides[aside]}</small>
  </div>
}
