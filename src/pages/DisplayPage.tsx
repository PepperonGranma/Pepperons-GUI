import { AppWindow, Box, Laptop, Monitor } from 'lucide-react'
import { BrandMark, type PageBaseProps, PageFrame, SectionCard, Field, Select, Switch } from '../controls'

export function DisplayPage({ config, update }: PageBaseProps) {
  return <PageFrame title="Display & window" subtitle="Stage the native mirror window or create a new Android display." icon={<Monitor />}>
    <div className="settings-grid">
      <SectionCard title="Desktop window" kicker="FRAME" icon={<AppWindow size={18} />}>
        <Field label="Window title" value={config.windowTitle} onChange={(value) => update('windowTitle', value)} placeholder="Pepperon GUI" />
        <div className="field-grid"><Field flag="--window-width" label="Width" value={config.windowWidth} onChange={(value) => update('windowWidth', value)} placeholder="Automatic" /><Field flag="--window-height" label="Height" value={config.windowHeight} onChange={(value) => update('windowHeight', value)} placeholder="Automatic" /></div>
        <div className="field-grid"><Field flag="--window-x" label="Position X" value={config.windowX} onChange={(value) => update('windowX', value)} placeholder="Automatic" /><Field flag="--window-y" label="Position Y" value={config.windowY} onChange={(value) => update('windowY', value)} placeholder="Automatic" /></div>
        <Switch label="Always on top" checked={config.alwaysOnTop} onChange={(value) => update('alwaysOnTop', value)} />
        <Switch label="Borderless" checked={config.borderless} onChange={(value) => update('borderless', value)} />
        <Switch label="Start fullscreen" checked={config.fullscreen} onChange={(value) => update('fullscreen', value)} />
        <Switch label="Disable screensaver" checked={config.disableScreensaver} onChange={(value) => update('disableScreensaver', value)} />
      </SectionCard>
      <SectionCard title="Virtual display" kicker="ANDROID" icon={<Laptop size={18} />}>
        <div className="field-grid"><Field flag="--display-id" label="Display ID" value={config.displayId} disabled={config.newDisplay} onChange={(value) => update('displayId', value)} /><Select label="Orientation" value={config.displayOrientation} onChange={(value) => update('displayOrientation', value)} options={[['0','0°'],['90','90°'],['180','180°'],['270','270°'],['flip0','Flip 0°'],['flip90','Flip 90°'],['flip180','Flip 180°'],['flip270','Flip 270°']]} /></div>
        <Switch label="Create a new display" description="Launch a separate virtual Android workspace instead of the main display." checked={config.newDisplay} onChange={(value) => update('newDisplay', value)} />
        <div className="field-grid"><Field label="Display size" value={config.newDisplaySize} disabled={!config.newDisplay} onChange={(value) => update('newDisplaySize', value)} placeholder="1920x1080" />
          <Field label="Density" value={config.newDisplayDpi} disabled={!config.newDisplay} onChange={(value) => update('newDisplayDpi', value)} suffix="dpi" /></div>
        <Switch label="Destroy content on close" checked={config.destroyDisplayContent} disabled={!config.newDisplay} onChange={(value) => update('destroyDisplayContent', value)} />
        <Switch label="System decorations" checked={config.displayDecorations} disabled={!config.newDisplay} onChange={(value) => update('displayDecorations', value)} />
      </SectionCard>
      <SectionCard title="Window preview" kicker="LAYOUT" icon={<Box size={18} />} className="window-preview-card">
        <div data-tilt="7" className={`mini-window ${config.borderless ? 'borderless' : ''} ${config.fullscreen ? 'fullscreen' : ''}`}>
          {!config.borderless && <div className="mini-title"><span /><span /><span /><em>{config.windowTitle || "Pepperon GUI"}</em></div>}
          <div className="mini-screen"><BrandMark /></div>
        </div>
      </SectionCard>
    </div>
  </PageFrame>
}
