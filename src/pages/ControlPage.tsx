import { BatteryCharging, Gamepad2, Info, Keyboard, MousePointer2, Usb } from 'lucide-react'
import { type PageBaseProps, IS_WINDOWS, PageFrame, SectionCard, Switch, ModeSelect } from '../controls'
import type { StudioConfig } from '../types'

export function ControlPage({ config, update }: PageBaseProps) {
  // See aoaInputOptions in electron/scrcpy-args.mjs for why AOA cannot work here.
  const aoaUnavailable = IS_WINDOWS ? ['aoa'] : []
  const aoaSelected = IS_WINDOWS && config.controlEnabled && [config.keyboard, config.mouse, config.gamepad].includes('aoa')
  return <PageFrame title="Control deck" subtitle="Choose how the desktop sends keyboard, mouse, and gamepad input." icon={<Gamepad2 />}>
    <div className="settings-grid">
      <SectionCard title="Master control" kicker="INPUT" icon={<MousePointer2 size={18} />}>
        <Switch label="Control the device" description="Disable for a view-only session." checked={config.controlEnabled} onChange={(value) => update('controlEnabled', value)} />
        <div className="mode-cards">
          <ModeSelect unavailable={aoaUnavailable} icon={<Keyboard />} label="Keyboard" value={config.keyboard} disabled={!config.controlEnabled} onChange={(value) => update('keyboard', value as StudioConfig['keyboard'])} options={['sdk', 'uhid', 'aoa', 'disabled']} />
          <ModeSelect unavailable={aoaUnavailable} icon={<MousePointer2 />} label="Mouse" value={config.mouse} disabled={!config.controlEnabled} onChange={(value) => update('mouse', value as StudioConfig['mouse'])} options={['sdk', 'uhid', 'aoa', 'disabled']} />
          <ModeSelect unavailable={aoaUnavailable} icon={<Gamepad2 />} label="Gamepad" value={config.gamepad} disabled={!config.controlEnabled} onChange={(value) => update('gamepad', value as StudioConfig['gamepad'])} options={['disabled', 'uhid', 'aoa']} />
        </div>
        {aoaSelected && <div className="inline-warning"><Info size={14} />AOA input cannot be used on Windows while ADB is connected. Choose UHID or SDK to start mirroring.</div>}
      </SectionCard>
      <SectionCard title="Device behavior" kicker="SESSION" icon={<BatteryCharging size={18} />}>
        <Switch label="Synchronize clipboard" description="Copy and paste between the desktop and Android." checked={config.clipboardSync} onChange={(value) => update('clipboardSync', value)} />
        <Switch label="Show touches" description="Visualize touch points on the Android display." checked={config.showTouches} onChange={(value) => update('showTouches', value)} />
        <Switch label="Keep device awake" description="Prevent sleep while plugged in." checked={config.stayAwake} onChange={(value) => update('stayAwake', value)} />
        <Switch label="Turn screen off on start" description="Keep the physical device dark while mirroring." checked={config.turnScreenOff} onChange={(value) => update('turnScreenOff', value)} />
        <Switch label="Power off on close" description={config.controlEnabled ? 'Power off Android when the session ends.' : 'Requires Scrcpy device control.'} checked={config.powerOffOnClose} disabled={!config.controlEnabled} onChange={(value) => update('powerOffOnClose', value)} />
        {!config.controlEnabled && <div className="capability-hint">Show touches, keep-awake, and screen power remain available through direct ADB. Power-off-on-close requires Scrcpy control.</div>}
      </SectionCard>
      <SectionCard title="Transport guide" kicker="MODES" icon={<Usb size={18} />} className="guide-card">
        <div className="guide-line"><strong>SDK</strong><span>Broadest compatibility; injects events through Android APIs.</span></div>
        <div className="guide-line"><strong>UHID</strong><span>Acts like physical hardware and supports richer input.</span></div>
        <div className="guide-line"><strong>AOA</strong><span>{IS_WINDOWS ? 'USB accessory mode. Not usable on Windows from this app, because ADB already holds the USB connection.' : 'USB accessory mode; can work without USB debugging in OTG mode.'}</span></div>
      </SectionCard>
    </div>
  </PageFrame>
}
