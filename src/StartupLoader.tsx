import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'

const messages = [
  'Waking up the control room…',
  'Polishing a suspicious number of pixels…',
  'Checking cables for dramatic tension…',
  'Teaching Pepperon the latest commands…',
]

export function StartupLoader({ leaving = false }: { leaving?: boolean }) {
  const [message, setMessage] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setMessage((value) => (value + 1) % messages.length), 650)
    return () => window.clearInterval(timer)
  }, [])

  return <div className={`startup-loader ${leaving ? 'is-leaving' : ''}`} role="status" aria-live="polite" aria-label="Pepperon's GUI is loading">
    <div className="startup-loader-grid" aria-hidden="true" />
    <div className="startup-loader-brand" aria-hidden="true"><Sparkles /><span>PEPPERON'S GUI</span><Sparkles /></div>
    <div className="squish-stage" aria-hidden="true">
      <div className="squish-spark spark-a">✦</div><div className="squish-spark spark-b">✦</div>
      <div className="loader-cat">
        <span className="loader-cat-ear ear-left" /><span className="loader-cat-ear ear-right" />
        <div className="loader-cat-head"><i /><i /><b /><em /></div>
        <div className="loader-cat-body"><span /><span /></div>
        <div className="loader-cat-tail" />
      </div>
      <span className="squish-shadow" />
    </div>
    <div className="startup-loader-copy"><strong>{messages[message]}</strong><span><i /><i /><i /></span></div>
    <small>ADB · SCRCPY · READY WHEN YOU ARE</small>
  </div>
}
