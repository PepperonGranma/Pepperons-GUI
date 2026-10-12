import { AppWindow, MoonStar, Palette, RotateCw, SlidersHorizontal, Sparkles, Sun } from 'lucide-react'
import { EFFECT_PRESETS } from '../options'
import { BrandMark, PageFrame, SectionCard, Switch, Segmented, ColorField } from '../controls'
import type { AppSettings, ThemeSettings } from '../types'

export function AppearancePage({ theme, setTheme, onReset, appSettings, onAppSetting }: {
  theme: ThemeSettings; setTheme: React.Dispatch<React.SetStateAction<ThemeSettings>>; onReset(): void
  appSettings: AppSettings; onAppSetting(key: keyof AppSettings, value: boolean): void
}) {
  const set = <K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) => setTheme((current) => ({ ...current, [key]: value }))
  return <PageFrame title="Appearance" subtitle="Make the control room yours. Every choice is saved locally." icon={<Palette />}>
    <div className="appearance-layout">
      <SectionCard title="Interface colors" kicker="THEME" icon={<Palette size={18} />}>
        <div className="color-fields"><ColorField label="Primary accent" value={theme.accent} onChange={(value) => set('accent', value)} /><ColorField label="Secondary accent" value={theme.mint} onChange={(value) => set('mint', value)} /><ColorField label="Highlight" value={theme.pink} onChange={(value) => set('pink', value)} /><ColorField label="Dark panel" value={theme.surface} onChange={(value) => set('surface', value)} /><ColorField label="Light panel" value={theme.lightSurface} onChange={(value) => set('lightSurface', value)} /></div>
      </SectionCard>
      <SectionCard title="Shape & density" kicker="LAYOUT" icon={<SlidersHorizontal size={18} />}>
        <label className="appearance-mode-label"><span>Color mode</span><Segmented value={theme.mode} onChange={(value) => set('mode', value as ThemeSettings['mode'])} options={[["dark", "Dark"], ["light", "Light"]]} /></label>
        <label className="range-field"><span>Corner radius <strong>{theme.radius}px</strong></span><input type="range" min="4" max="28" value={theme.radius} onChange={(event) => set('radius', Number(event.target.value))} /></label>
        <Segmented value={theme.density} onChange={(value) => set('density', value as ThemeSettings['density'])} options={[['cozy', 'Cozy'], ['compact', 'Compact']]} />
        <Switch label="Subtle background pattern" checked={theme.pattern} onChange={(value) => set('pattern', value)} />
        <button className="full secondary" onClick={onReset}><RotateCw size={16} />Restore default theme</button>
      </SectionCard>
      <SectionCard title="Motion & effects" kicker="FEEL" icon={<Sparkles size={18} />} className="effects-card">
        <div className="effects-grid">
          <div>
            <label className="appearance-mode-label"><span>Style</span><div className="preset-compact effect-presets">{EFFECT_PRESETS.map((preset) => <button key={preset.name} className={(Object.keys(preset.patch) as Array<keyof typeof preset.patch>).every((key) => theme[key] === preset.patch[key]) ? 'active' : ''} onClick={() => setTheme((current) => ({ ...current, ...preset.patch }))}>{preset.label}</button>)}</div></label>
            <label className="appearance-mode-label"><span>Animation</span><Segmented value={theme.motion} onChange={(value) => set('motion', value as ThemeSettings['motion'])} options={[['full', 'Full'], ['subtle', 'Subtle'], ['off', 'Off']]} /></label>
            <label className="appearance-mode-label"><span>Backdrop</span><Segmented value={theme.backdrop} onChange={(value) => set('backdrop', value as ThemeSettings['backdrop'])} options={[['aurora', 'Aurora'], ['static', 'Still'], ['none', 'None']]} /></label>
          </div>
          <div>
            <label className="range-field"><span>Glow intensity <strong>{theme.glow}%</strong></span><input type="range" min="0" max="100" step="5" value={theme.glow} onChange={(event) => set('glow', Number(event.target.value))} /></label>
            <Switch label="3D tilt" description="The phone and previews lean toward the pointer." checked={theme.tilt} disabled={theme.motion === 'off'} onChange={(value) => set('tilt', value)} />
            <Switch label="Pointer spotlight" description="A soft light follows the pointer across cards." checked={theme.spotlight} onChange={(value) => set('spotlight', value)} />
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Interactive preview" kicker="INTERFACE" icon={theme.mode === 'dark' ? <MoonStar size={18} /> : <Sun size={18} />} className="theme-preview-card">
        <div className="theme-swatch-preview" data-tilt="6"><div className="preview-banner"><BrandMark /><span>Pepperon GUI</span></div><div className="preview-controls"><i /><i /><button>Start Mirroring</button></div><div className="preview-lines"><span /><span /><span /></div></div>
      </SectionCard>
      <SectionCard title="Desktop behavior" kicker="WINDOW" icon={<AppWindow size={18} />} className="desktop-behavior-card">
        <Switch label="Minimize to system tray" description="Minimizing hides the window to the notification area instead of the taskbar. Mirroring keeps running; click the tray icon to bring the window back." checked={appSettings.minimizeToTray} onChange={(value) => onAppSetting('minimizeToTray', value)} />
        <Switch label="Close to system tray" description="The close button hides the window instead of quitting. Use Quit in the tray menu to exit." checked={appSettings.closeToTray} onChange={(value) => onAppSetting('closeToTray', value)} />
      </SectionCard>
    </div>
  </PageFrame>
}
