import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  ArrowLeft, ArrowRight, AudioLines, Check, Command, Gamepad2, Monitor,
  Palette, Play, Radio, SlidersHorizontal, Smartphone, Sparkles, Usb, Video, X,
  type LucideIcon,
} from 'lucide-react'

type TourStep = {
  kicker: string
  title: string
  copy: string
  icon: LucideIcon
  scene: 'welcome' | 'connect' | 'mix' | 'theme' | 'launch'
  note: string
}

const TOUR_STEPS: TourStep[] = [
  {
    kicker: 'WELCOME, EXPLORER',
    title: 'Meet your Android control room',
    copy: 'Pepperon’s GUI puts mirroring, recording, sound, controls, and every scrcpy flag behind one friendly dashboard.',
    icon: Sparkles,
    scene: 'welcome',
    note: 'No command-line treasure map required.',
  },
  {
    kicker: 'STEP ONE · DEVICE LINK',
    title: 'Plug in. Approve. High-five.',
    copy: 'Enable USB debugging, connect your phone, and approve this computer. Your device and its capabilities then appear automatically.',
    icon: Usb,
    scene: 'connect',
    note: 'Wireless ADB is waiting in Studio when cables cramp your style.',
  },
  {
    kicker: 'BUILD YOUR MIX',
    title: 'Tune the mirror before it leaves the phone',
    copy: 'Pick a quick preset or shape video, camera, audio, controls, displays, and recording one detail at a time.',
    icon: SlidersHorizontal,
    scene: 'mix',
    note: 'Eligible in-session changes apply automatically; the rest restart cleanly.',
  },
  {
    kicker: 'MAKE IT YOURS',
    title: 'Your colors. Your corners. Your vibe.',
    copy: 'Switch between light and dark, then customize accents, Highlight, panel colors, spacing, rounding, and background patterns.',
    icon: Palette,
    scene: 'theme',
    note: 'The Appearance page is where sensible themes become suspiciously personal.',
  },
  {
    kicker: 'READY FOR ACTION',
    title: 'Start Mirroring—locally',
    copy: 'Press Start Mirroring to open scrcpy on this PC. Watch the session state and activity log, then use Stop Mirroring when you are finished.',
    icon: Play,
    scene: 'launch',
    note: 'CTRL + K finds any command. Mirroring remains local to this PC.',
  },
]

function TourScene({ scene }: { scene: TourStep['scene'] }) {
  if (scene === 'welcome') return <div className="tour-scene tour-welcome-scene" aria-hidden="true">
    <span className="tour-orbit orbit-one" /><span className="tour-orbit orbit-two" />
    <div className="tour-phone"><span /><Smartphone /></div>
    <i className="tour-satellite satellite-video"><Video /></i>
    <i className="tour-satellite satellite-audio"><AudioLines /></i>
    <i className="tour-satellite satellite-control"><Gamepad2 /></i>
  </div>

  if (scene === 'connect') return <div className="tour-scene tour-connect-scene" aria-hidden="true">
    <div className="tour-mini-phone"><span className="tour-phone-glow" /><Smartphone /></div>
    <div className="tour-cable"><i /><Usb /></div>
    <div className="tour-device-found"><span /><div><strong>DEVICE FOUND</strong><small>Ready for mischief</small></div><Check /></div>
  </div>

  if (scene === 'mix') return <div className="tour-scene tour-mix-scene" aria-hidden="true">
    <div className="tour-mixer-screen"><Monitor /><span>PHONE PREVIEW</span><i /></div>
    <div className="tour-mixer-sliders">{[72, 46, 84].map((level, index) => <span key={level}><i style={{ width: `${level}%` }} /><b style={{ left: `${level}%` }}>{index + 1}</b></span>)}</div>
    <div className="tour-feature-chips"><span><Video />Video</span><span><AudioLines />Audio</span><span><Radio />Record</span></div>
  </div>

  if (scene === 'theme') return <div className="tour-scene tour-theme-scene" aria-hidden="true">
    <div className="tour-theme-window"><div><i /><i /><i /></div><section><span /><span /><span /></section></div>
    <div className="tour-swatches"><i /><i /><i /><i /></div>
    <Sparkles className="tour-theme-spark spark-one" /><Sparkles className="tour-theme-spark spark-two" />
  </div>

  return <div className="tour-scene tour-launch-scene" aria-hidden="true">
    <span className="tour-live-ring ring-one" /><span className="tour-live-ring ring-two" />
    <div className="tour-go-live"><Play /><strong>Start Mirroring</strong></div>
    <div className="tour-local-pill"><i />LOCAL SESSION</div>
    <div className="tour-command-hint"><Command /><span>CTRL + K</span><small>Every command</small></div>
  </div>
}

export function FirstRunTour({ open, onFinish }: { open: boolean; onFinish(): void }) {
  const [step, setStep] = useState(0)
  const dialog = useRef<HTMLDivElement>(null)
  const current = TOUR_STEPS[step]

  useEffect(() => {
    if (!open) return
    setStep(0)
    window.setTimeout(() => dialog.current?.querySelector<HTMLButtonElement>('[data-tour-focus]')?.focus(), 0)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onFinish()
      if (event.key === 'ArrowRight' && step < TOUR_STEPS.length - 1) setStep((value) => value + 1)
      if (event.key === 'ArrowLeft' && step > 0) setStep((value) => value - 1)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onFinish, step])

  if (!open) return null
  const Icon = current.icon
  const last = step === TOUR_STEPS.length - 1
  const keepFocusInside = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') || [])]
    if (!controls.length) return
    const first = controls[0]
    const final = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); final.focus() }
    else if (!event.shiftKey && document.activeElement === final) { event.preventDefault(); first.focus() }
  }

  return <div className="first-run-tour" role="presentation">
    <div className="tour-backdrop" />
    <div className="tour-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="tour-title" onKeyDown={keepFocusInside}>
      <button className="tour-close" data-tour-focus type="button" onClick={onFinish} aria-label="Skip feature tour" title="Skip tour"><X /></button>
      <div className="tour-visual"><TourScene scene={current.scene} /></div>
      <div className="tour-copy" key={step}>
        <div className="tour-kicker"><Icon /><span>{current.kicker}</span></div>
        <h1 id="tour-title">{current.title}</h1>
        <p>{current.copy}</p>
        <div className="tour-note"><Sparkles /><span>{current.note}</span></div>
      </div>
      <div className="tour-footer">
        <div className="tour-progress" aria-label={`Step ${step + 1} of ${TOUR_STEPS.length}`}>
          {TOUR_STEPS.map((item, index) => <button type="button" key={item.title} className={index === step ? 'active' : index < step ? 'complete' : ''} onClick={() => setStep(index)} aria-label={`Open tour step ${index + 1}`} aria-current={index === step ? 'step' : undefined}><span /></button>)}
        </div>
        <span className="tour-count">{String(step + 1).padStart(2, '0')} / {String(TOUR_STEPS.length).padStart(2, '0')}</span>
        <div className="tour-nav">
          {step > 0 ? <button className="tour-back" type="button" onClick={() => setStep((value) => value - 1)}><ArrowLeft />Back</button> : <button className="tour-skip" type="button" onClick={onFinish}>Skip tour</button>}
          <button className="tour-next" type="button" onClick={() => last ? onFinish() : setStep((value) => value + 1)}>{last ? <><Check />Enter the control room</> : <>Next<ArrowRight /></>}</button>
        </div>
      </div>
    </div>
  </div>
}
