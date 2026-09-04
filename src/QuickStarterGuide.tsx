import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowRight, AudioLines, Command, Download, Gamepad2, Github, Info, Monitor, Play, Save, Sparkles, Usb, Video, type LucideIcon } from 'lucide-react'
import type { NavId } from './types'

type GuideLink = { page: NavId; label: string }
type GuideStep = { title: string; icon: LucideIcon; body: ReactNode; links: GuideLink[] }

const steps: GuideStep[] = [
  {
    title: 'Connect your Android', icon: Usb,
    body: <>Enable <strong>USB debugging</strong> in your phone’s Developer options. Connect a data-capable USB cable, unlock the phone, and approve this computer. Select the device in the picker at the top of the GUI.</>,
    links: [{ page: 'studio', label: 'Check connection' }],
  },
  {
    title: 'Check the Scrcpy runtime', icon: Download,
    body: <>If Studio shows <strong>Scrcpy runtime required</strong>, choose <strong>Install runtime</strong> or <strong>Choose executable</strong> for an existing installation. Wait for the connected-device details to load.</>,
    links: [{ page: 'studio', label: 'Open Studio' }],
  },
  {
    title: 'Choose what to capture', icon: Video,
    body: <>In Video, select <strong>Display</strong> to mirror your screen or <strong>Camera</strong> for a camera feed. Use a Quick video preset in Studio, or adjust the codec, size, FPS, and bit rate yourself. Unavailable codec options are disabled when reported by your device.</>,
    links: [{ page: 'video', label: 'Open Video' }],
  },
  {
    title: 'Go live, then Stop Stream', icon: Play,
    body: <>Press <strong>Go live</strong> in the Studio header or Device Link card. The <strong>MIRRORING</strong> state and a process PID confirm the session is running. Press <strong>Stop Stream</strong> in either place to end it.</>,
    links: [{ page: 'studio', label: 'Go to session controls' }],
  },
  {
    title: 'Add audio or a recording', icon: AudioLines,
    body: <>Use Audio to choose a supported source. To save a file, turn on <strong>Enable recording</strong>, select a <strong>Container</strong>, and use <strong>Browse</strong> to set a Destination before starting mirroring. A destination is required; the toggle alone does not save a recording.</>,
    links: [{ page: 'audio', label: 'Open Audio' }, { page: 'recording', label: 'Open Recording' }],
  },
  {
    title: 'Make it your setup', icon: Save,
    body: <>Save your settings in <strong>Profiles</strong> for later. In <strong>Appearance</strong>, choose light or dark mode, accents, Highlight, panel colors, spacing, and rounded corners. Highlight styles selected options, focus rings, labels, and notes.</>,
    links: [{ page: 'profiles', label: 'Open Profiles' }, { page: 'appearance', label: 'Open Appearance' }],
  },
]

const moreControls: Array<GuideLink & { icon: LucideIcon; detail: string }> = [
  { page: 'control', label: 'Controls', icon: Gamepad2, detail: 'Keyboard, mouse, gamepad, clipboard, and screen power.' },
  { page: 'display', label: 'Display', icon: Monitor, detail: 'Window size, orientation, and virtual-display options.' },
  { page: 'options', label: 'All commands', icon: Command, detail: 'Search the complete option list with CTRL + K.' },
]

export function QuickStarterGuide({ onNavigate, onStartTour }: { onNavigate(page: NavId): void; onStartTour(): void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.closest('.main-content')?.scrollTo({ top: 0 })
    heading.current?.focus({ preventScroll: true })
  }, [])
  const navigate = (page: NavId) => {
    heading.current?.closest('.main-content')?.scrollTo({ top: 0 })
    onNavigate(page)
  }
  return <article className="page starter-guide" aria-labelledby="starter-guide-title">
    <header className="page-header">
      <div className="page-icon"><Github aria-hidden="true" /></div>
      <div><span className="kicker">GETTING STARTED</span><h1 id="starter-guide-title" ref={heading} tabIndex={-1}>Quick Starter Guide</h1><p>Your first session in Pepperon’s GUI, one step at a time.</p></div>
    </header>

    <section className="guide-tour-banner">
      <div className="guide-tour-orbit" aria-hidden="true"><span /><Sparkles /></div>
      <div><span className="kicker">THE FUN-SIZE VERSION</span><h2>Want the grand tour?</h2><p>Five animated stops. Zero command-line homework.</p></div>
      <button type="button" data-start-feature-tour onClick={onStartTour}><Play size={15} />Play feature tour</button>
    </section>

    <aside className="guide-callout"><Info size={19} aria-hidden="true" /><p><strong>Mirroring stays local.</strong> Go live opens scrcpy on this PC. Guide shortcuts only open pages; they never start a session or change settings.</p></aside>

    <ol className="guide-steps">
      {steps.map(({ title, icon: Icon, body, links }, index) => <li className="guide-step" key={title}>
        <div className="guide-step-heading"><span className="guide-step-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><h2>{title}</h2><Icon size={18} aria-hidden="true" /></div>
        <p>{body}</p>
        <div className="guide-actions">{links.map(({ page, label }) => <button type="button" key={page} data-guide-destination={page} onClick={() => navigate(page)}>{label}<ArrowRight size={14} aria-hidden="true" /></button>)}</div>
      </li>)}
    </ol>

    <section className="guide-more" aria-labelledby="guide-more-title">
      <h2 id="guide-more-title">A little more control</h2>
      <div className="guide-shortcuts">{moreControls.map(({ page, label, icon: Icon, detail }) => <button type="button" key={page} data-guide-destination={page} onClick={() => navigate(page)}><Icon size={19} aria-hidden="true" /><span><strong>{label}</strong><small>{detail}</small></span><ArrowRight size={15} aria-hidden="true" /></button>)}</div>
      <p className="guide-apply-note"><Info size={14} aria-hidden="true" />Settings apply automatically. Some changes restart the session; eligible in-session controls apply directly. During recording, a restart creates a new recording segment.</p>
    </section>

    <section className="guide-help" aria-labelledby="guide-help-title">
      <h2 id="guide-help-title">If something gets stuck</h2>
      <details><summary>No device appears, or it says unauthorized</summary><p>Unlock your phone and check for the USB debugging approval prompt. Confirm the cable supports data, then use the refresh button on Studio’s Connected device card. Only select a device you recognize.</p></details>
      <details><summary>I want to connect over Wi-Fi</summary><p>Put the PC and phone on the same trusted network. For wireless debugging pairing, enter the phone’s pairing IP:port and pairing code in Studio’s ADB Connection card, then choose Pair. Replace the address with the phone’s connection IP:port and choose Connect—the pairing and connection ports can differ.</p></details>
      <details><summary>Go live is disabled, or the session fails</summary><p>Go live needs an installed runtime and an authorized device. In Video, make sure Capture source is the source you intend to use. Check Studio’s Activity log for the actual error, then review the selected codec, encoder, or recording destination before retrying.</p></details>
    </section>
  </article>
}
