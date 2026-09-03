import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Dropdown } from './Dropdown'
import { QuickStarterGuide } from './QuickStarterGuide'
import {
  Activity, AppWindow, AudioLines, BatteryCharging, Box, Camera, Check, Clock3,
  CircleDot as Record, Clipboard, Command, Copy, Cpu, Download, Gamepad2, Gauge, Github, HardDrive, Info, Keyboard, Laptop,
  LayoutDashboard, ListFilter, Menu, Mic2, Minus, Monitor, MoonStar, MousePointer2, Palette, Play, Plus, Radio,
  RefreshCw, RotateCw, Save, Search, Settings2, ShieldCheck, SlidersHorizontal, Smartphone, Sparkles, Square,
  Sun, Terminal, Trash2, Unplug, Usb, Video, Wifi, WifiOff, X, Zap,
} from 'lucide-react'
import { demoApi } from './demoApi'
import { applyGuidedOptionValue, buildArgs, DEFAULT_CONFIG, DEFAULT_THEME, FALLBACK_OPTIONS, getGuidedOptionValue, QUICK_PRESETS } from './options'
import type {
  CliOption, Device, DeviceCapabilities, LiveSettingChange, LogEntry, NavId, RuntimeStatus, SavedProfile, SessionState, StudioConfig, ThemeSettings,
} from './types'

const api = window.scrcpyStudio || demoApi

const NAV_ITEMS: Array<{ id: NavId; label: string; icon: typeof Activity }> = [
  { id: 'studio', label: 'Studio', icon: LayoutDashboard },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'audio', label: 'Audio', icon: AudioLines },
  { id: 'control', label: 'Controls', icon: Gamepad2 },
  { id: 'display', label: 'Display', icon: Monitor },
  { id: 'recording', label: 'Recording', icon: Record },
  { id: 'options', label: 'All commands', icon: Command },
  { id: 'profiles', label: 'Profiles', icon: Save },
  { id: 'appearance', label: 'Appearance', icon: Palette },
]

const ONE_SHOT_OPTIONS = new Set(['--list-apps', '--list-camera-sizes', '--list-cameras', '--list-displays', '--list-encoders'])

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch { return fallback }
}

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function accentInk(hex: string) {
  const value = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(value)) return '#ffffff'
  const [red, green, blue] = [value.slice(0, 2), value.slice(2, 4), value.slice(4, 6)].map((channel) => parseInt(channel, 16) / 255)
  const linear = (channel: number) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
  const luminance = .2126 * linear(red) + .7152 * linear(green) + .0722 * linear(blue)
  return luminance > .46 ? '#111114' : '#ffffff'
}

export default function App() {
  const [activeNav, setActiveNav] = useState<NavId>('studio')
  const [config, setConfig] = useState<StudioConfig>(() => readStored('scrcpy-studio:config', DEFAULT_CONFIG))
  const [theme, setTheme] = useState<ThemeSettings>(() => readStored('scrcpy-studio:theme', DEFAULT_THEME))
  const [profiles, setProfiles] = useState<SavedProfile[]>(() => {
    try { return JSON.parse(localStorage.getItem('scrcpy-studio:profiles') || '[]') } catch { return [] }
  })
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [session, setSession] = useState<SessionState>({ running: false, status: 'offline' })
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null)
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(false)
  const [capabilitiesError, setCapabilitiesError] = useState('')
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 1, time: timeNow(), level: 'info', text: 'Studio initialized. Waiting for a device…' },
  ])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [installProgress, setInstallProgress] = useState({ progress: 0, message: '' })
  const [search, setSearch] = useState('')
  const [optionsCategory, setOptionsCategory] = useState('All')
  const [mobileNav, setMobileNav] = useState(false)
  const [toast, setToast] = useState('')
  const [wifiAddress, setWifiAddress] = useState('')
  const [preset, setPreset] = useState('balanced')
  const logId = useRef(2)
  const initialized = useRef(false)
  const configRef = useRef(config)
  const runtimeRef = useRef(runtime)
  const sessionRef = useRef(session)
  const previousConfig = useRef(config)
  const previousDesiredArgs = useRef(buildArgs(config))
  const previousDeviceStates = useRef<Map<string, string>>(new Map())
  const previousSessionStatus = useRef(session.status)

  const liveSettings = useCallback((next: StudioConfig): LiveSettingChange[] => [
    { key: 'showTouches', value: next.showTouches },
    { key: 'stayAwake', value: next.stayAwake },
    { key: 'screenPower', value: next.turnScreenOff },
  ], [])

  const addLog = useCallback((level: LogEntry['level'], text: string) => {
    const clean = text.trim()
    if (!clean) return
    setLogs((current) => [...current.slice(-199), { id: logId.current++, time: timeNow(), level, text: clean }])
  }, [])

  useEffect(() => { configRef.current = config }, [config])
  useEffect(() => { runtimeRef.current = runtime }, [runtime])
  useEffect(() => { sessionRef.current = session }, [session])

  const refreshDevices = useCallback(async () => {
    const next = await api.listDevices().catch(() => [])
    setDevices(next)
    const usable = next.filter((device) => device.usable !== false && device.state === 'device')
    const currentConfig = configRef.current
    if (usable.length && (!currentConfig.serial || !next.some((device) => device.serial === currentConfig.serial))) {
      setConfig((current) => ({ ...current, serial: usable[0].serial }))
    }
    const previous = previousDeviceStates.current
    if (previous.size) {
      const selected = currentConfig.serial
      if (selected) {
        const wasPresent = previous.get(selected) === 'device'
        const isPresent = next.some((device) => device.serial === selected && device.state === 'device')
        if (wasPresent !== isPresent) api.reportDevicePresence(selected, isPresent).catch(() => undefined)
      }
      const newlyUsable = usable.find((device) => previous.get(device.serial) !== 'device')
      if (newlyUsable && currentConfig.autoStartOnConnect && runtimeRef.current?.installed && ['offline', 'error'].includes(sessionRef.current.status)) {
        const nextConfig = { ...currentConfig, serial: newlyUsable.serial }
        setConfig(nextConfig)
        api.start({ args: buildArgs(nextConfig), liveChanges: liveSettings(nextConfig), autoReconnect: nextConfig.autoReconnect, reason: 'device connected' }).catch((error) => addLog('error', error.message))
      }
    }
    previousDeviceStates.current = new Map(next.map((device) => [device.serial, device.state]))
    return next
  }, [addLog, liveSettings])

  const refreshRuntime = useCallback(async () => {
    const next = await api.getRuntimeStatus()
    setRuntime(next)
    return next
  }, [])

  useEffect(() => {
    Promise.all([refreshRuntime(), refreshDevices(), api.getSessionState().then(setSession)]).finally(() => {
      initialized.current = true
      setLoading(false)
    })
    const removeLog = api.onLog((entry) => addLog(entry.level, entry.text))
    const removeState = api.onState((next) => {
      setSession(next)
      if (next.status !== previousSessionStatus.current) {
        if (next.status === 'live') addLog('success', `Session is live${next.pid ? ` (PID ${next.pid})` : ''}.`)
        else if (next.status === 'error') addLog('error', next.error || 'The Scrcpy session failed.')
        previousSessionStatus.current = next.status
      }
    })
    const removeInstall = api.onInstallProgress(setInstallProgress)
    const interval = window.setInterval(refreshDevices, 5000)
    return () => { removeLog(); removeState(); removeInstall(); window.clearInterval(interval) }
  }, [addLog, refreshDevices, refreshRuntime])

  useEffect(() => { localStorage.setItem('scrcpy-studio:config', JSON.stringify(config)) }, [config])
  useEffect(() => { localStorage.setItem('scrcpy-studio:theme', JSON.stringify(theme)) }, [theme])
  useEffect(() => { localStorage.setItem('scrcpy-studio:profiles', JSON.stringify(profiles)) }, [profiles])
  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 2500)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    if (!initialized.current) { previousConfig.current = config; return }
    const before = previousConfig.current
    const liveChanges: LiveSettingChange[] = []
    if (before.showTouches !== config.showTouches) liveChanges.push({ key: 'showTouches', value: config.showTouches })
    if (before.stayAwake !== config.stayAwake) liveChanges.push({ key: 'stayAwake', value: config.stayAwake })
    if (before.turnScreenOff !== config.turnScreenOff) liveChanges.push({ key: 'screenPower', value: config.turnScreenOff })
    const changedKeys = (Object.keys(config) as Array<keyof StudioConfig>).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(config[key]))
    previousConfig.current = config
    const runtimeConfig = capabilities?.audio.forwardingSupported === false ? { ...config, audioEnabled: false } : config
    const nextArgs = buildArgs(runtimeConfig)
    const argsChanged = JSON.stringify(nextArgs) !== JSON.stringify(previousDesiredArgs.current)
    previousDesiredArgs.current = nextArgs
    if (!changedKeys.length && !argsChanged) return
    api.applyConfig({
      args: nextArgs, liveChanges, autoReconnect: config.autoReconnect,
      reason: changedKeys.length === 1 ? `${String(changedKeys[0])} changed` : changedKeys.length ? `${changedKeys.length} settings changed` : 'device capability constraints changed',
    }).catch((error) => addLog('error', `Automatic apply failed: ${error.message}`))
  }, [config, capabilities?.audio.forwardingSupported, addLog])

  const refreshCapabilities = useCallback(async (force = false) => {
    const serial = configRef.current.serial
    if (!serial) { setCapabilities(null); return null }
    setCapabilitiesLoading(true)
    setCapabilitiesError('')
    try {
      const next = await api.getDeviceCapabilities(serial, force)
      if (configRef.current.serial === serial) setCapabilities(next)
      return next
    } catch (error) {
      if (configRef.current.serial === serial) {
        setCapabilities(null)
        setCapabilitiesError(error instanceof Error ? error.message : String(error))
      }
      return null
    } finally { if (configRef.current.serial === serial) setCapabilitiesLoading(false) }
  }, [])

  const selectedDeviceState = devices.find((device) => device.serial === config.serial)?.state
  useEffect(() => {
    if (config.serial && selectedDeviceState === 'device' && runtime?.installed) refreshCapabilities(false)
    else { setCapabilities(null); setCapabilitiesError(selectedDeviceState && selectedDeviceState !== 'device' ? `Device is ${selectedDeviceState}.` : '') }
  }, [config.serial, selectedDeviceState, runtime?.installedVersion, refreshCapabilities])

  const options = useMemo(() => {
    const live = new Map((runtime?.options || []).map((option) => [option.name, option]))
    const canDetermine = Boolean(runtime?.installed && live.size)
    return FALLBACK_OPTIONS.map((fallback) => ({ ...fallback, ...(live.get(fallback.name) || {}), source: live.has(fallback.name) ? 'runtime' as const : 'fallback' as const, runtimeAvailable: canDetermine ? live.has(fallback.name) : undefined }))
      .concat((runtime?.options || []).filter((item) => !FALLBACK_OPTIONS.some((fallback) => fallback.name === item.name)).map((item) => ({ ...item, source: 'runtime' as const, runtimeAvailable: true })))
      .filter((item) => !['--help', '--version'].includes(item.name))
  }, [runtime])
  const args = useMemo(() => buildArgs(capabilities?.audio.forwardingSupported === false ? { ...config, audioEnabled: false } : config), [config, capabilities?.audio.forwardingSupported])
  const commandText = `scrcpy${args.length ? ` ${args.join(' ')}` : ''}`
  const selectedDevice = devices.find((device) => device.serial === config.serial)

  const update = <K extends keyof StudioConfig>(key: K, value: StudioConfig[K]) => {
    setConfig((current) => ({ ...current, [key]: value }))
  }

  async function installRuntime() {
    setInstalling(true)
    setInstallProgress({ progress: 1, message: 'Contacting the official release server' })
    try {
      const next = await api.installRuntime()
      setRuntime(next)
      addLog('success', `Scrcpy ${next.installedVersion} installed from the official release.`)
      setToast('Scrcpy is ready')
      await refreshDevices()
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : String(error))
      setToast('Installation failed — see activity')
    } finally { setInstalling(false) }
  }

  async function chooseRuntime() {
    const next = await api.chooseRuntime()
    if (next) {
      setRuntime(next)
      addLog('success', `Using Scrcpy ${next.installedVersion} from ${next.path}`)
    }
  }

  async function toggleSession() {
    try {
      if (['starting', 'live', 'applying', 'restarting', 'reconnecting', 'stopping'].includes(session.status)) {
        await api.stop()
        addLog('info', 'Stop requested…')
      } else {
        const next = await api.start({ args, liveChanges: liveSettings(config), autoReconnect: config.autoReconnect, reason: session.status === 'error' ? 'retry' : 'manual start' })
        setSession(next)
      }
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : String(error))
      setToast('Could not start — see activity')
    }
  }

  async function copyCommand() {
    await navigator.clipboard.writeText(commandText)
    setToast('Command copied')
  }

  function applyPreset(name: string) {
    const next = QUICK_PRESETS.find((item) => item.name === name)
    if (!next) return
    setPreset(name)
    setConfig((current) => ({ ...current, ...next.patch }))
    setToast(`${next.label} preset applied`)
  }

  async function connectWifi() {
    if (!wifiAddress.trim()) return
    const address = wifiAddress.includes(':') ? wifiAddress : `${wifiAddress}:5555`
    const result = await api.adbAction('connect', { address }).catch((error) => ({ code: 1, output: error.message }))
    addLog(result.code === 0 ? 'success' : 'error', result.output)
    await refreshDevices()
  }

  async function refreshAll() {
    await refreshDevices()
    if (configRef.current.serial) await refreshCapabilities(true)
    setToast('Device and capabilities refreshed')
  }

  function saveProfile() {
    const name = `Profile ${profiles.length + 1}`
    setProfiles((current) => [...current, {
      id: crypto.randomUUID(), name, description: `${config.maxSize}p · ${config.maxFps} fps · ${config.videoCodec.toUpperCase()}`,
      config: structuredClone(config), updatedAt: Date.now(),
    }])
    setToast(`${name} saved`)
  }

  function activateNav(id: NavId) {
    setActiveNav(id)
    setMobileNav(false)
    if (id !== 'options') setSearch('')
  }

  const style = {
    '--accent': theme.accent,
    '--accent-ink': accentInk(theme.accent),
    '--mint': theme.mint,
    '--pink': theme.pink,
    '--surface': theme.mode === 'light' ? theme.lightSurface : theme.surface,
    '--radius': `${theme.radius}px`,
    '--control-height': theme.density === 'compact' ? '34px' : '40px',
  } as CSSProperties

  const pageProps = { config, update, setConfig, addLog }

  return (
    <div className={`app theme-${theme.mode} density-${theme.density} ${theme.pattern ? 'has-pattern' : ''}`} style={style}>
      <Sidebar active={activeNav} open={mobileNav} onSelect={activateNav} onClose={() => setMobileNav(false)} />
      <div className="app-shell">
        <TopBar
          devices={devices} selected={config.serial} onDevice={(serial) => update('serial', serial)}
          search={search} onSearch={(value) => { setSearch(value); if (value) { setActiveNav('options'); setOptionsCategory('All') } }}
          onMenu={() => setMobileNav((value) => !value)}
        />
        <main className="main-content">
          {activeNav === 'studio' && <StudioPage
            {...pageProps} runtime={runtime} devices={devices} device={selectedDevice} capabilities={capabilities} capabilitiesLoading={capabilitiesLoading} capabilitiesError={capabilitiesError} session={session} args={args}
            commandText={commandText} logs={logs} loading={loading} installing={installing} installProgress={installProgress}
            preset={preset} wifiAddress={wifiAddress} onWifiAddress={setWifiAddress} onConnect={connectWifi}
            onInstall={installRuntime} onChoose={chooseRuntime} onToggleSession={toggleSession} onCopy={copyCommand}
            onPreset={applyPreset} onNavigate={activateNav} onSaveProfile={saveProfile} onRefresh={refreshAll}
          />}
          {activeNav === 'video' && <VideoPage {...pageProps} capabilities={capabilities} />}
          {activeNav === 'audio' && <AudioPage {...pageProps} capabilities={capabilities} />}
          {activeNav === 'control' && <ControlPage {...pageProps} />}
          {activeNav === 'display' && <DisplayPage {...pageProps} />}
          {activeNav === 'recording' && <RecordingPage {...pageProps} />}
          {activeNav === 'options' && <OptionsPage
            options={options} config={config} setConfig={setConfig} search={search} onSearch={setSearch}
            category={optionsCategory} onCategory={setOptionsCategory} addLog={addLog}
          />}
          {activeNav === 'profiles' && <ProfilesPage profiles={profiles} config={config} onSave={saveProfile}
            onLoad={(profile) => { setConfig(structuredClone(profile.config)); setToast(`${profile.name} loaded`) }}
            onRename={(id, name) => setProfiles((current) => current.map((item) => item.id === id ? { ...item, name, updatedAt: Date.now() } : item))}
            onDelete={(id) => setProfiles((current) => current.filter((item) => item.id !== id))} />}
          {activeNav === 'appearance' && <AppearancePage theme={theme} setTheme={setTheme} onReset={() => setTheme(DEFAULT_THEME)} />}
          {activeNav === 'guide' && <QuickStarterGuide onNavigate={activateNav} />}
        </main>
      </div>
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  )
}

function Sidebar({ active, open, onSelect, onClose }: { active: NavId; open: boolean; onSelect(id: NavId): void; onClose(): void }) {
  return <>
    {open && <button className="sidebar-scrim" onClick={onClose} aria-label="Close navigation" />}
    <aside className={`sidebar ${open ? 'is-open' : ''}`}>
      <div className="sidebar-brand">
        <CatMark />
        <div><strong>Pepperon's</strong><span>GUI</span></div>
      </div>
      <nav>
        <p className="nav-eyebrow">Configuration</p>
        {NAV_ITEMS.slice(0, 7).map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? 'active' : ''} onClick={() => onSelect(id)}>
          <Icon size={18} /><span>{label}</span>{id === 'options' && <em>100+</em>}
        </button>)}
        <p className="nav-eyebrow">Workspace</p>
        {NAV_ITEMS.slice(7).map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? 'active' : ''} onClick={() => onSelect(id)}>
          <Icon size={18} /><span>{label}</span>
        </button>)}
      </nav>
      <div className="sidebar-guide">
        <button type="button" className={active === 'guide' ? 'active' : ''} aria-current={active === 'guide' ? 'page' : undefined} onClick={() => onSelect('guide')}>
          <Github size={18} aria-hidden="true" /><span>Quick Starter Guide</span>
        </button>
      </div>
    </aside>
  </>
}

function TopBar({ devices, selected, onDevice, search, onSearch, onMenu }: {
  devices: Device[]; selected: string; onDevice(value: string): void; search: string;
  onSearch(value: string): void; onMenu(): void
}) {
  const selectedDevice = devices.find((device) => device.serial === selected)
  const searchInput = useRef<HTMLInputElement>(null)
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInput.current?.focus()
        searchInput.current?.select()
      }
    }
    window.addEventListener('keydown', focusSearch)
    let active = true
    api.getWindowState().then((state) => { if (active) setMaximized(state.maximized) }).catch(() => undefined)
    const unsubscribe = api.onWindowState((state) => setMaximized(state.maximized))
    return () => { active = false; window.removeEventListener('keydown', focusSearch); unsubscribe() }
  }, [])
  const windowAction = (action: 'minimize' | 'toggle-maximize' | 'close') => { api.windowAction(action).catch(console.error) }
  return <header className="topbar">
    <button className="icon-button mobile-menu" onClick={onMenu} aria-label="Open navigation"><Menu size={18} /></button>
    <div className="device-picker">
      <span className={`status-dot ${selectedDevice?.state === 'device' ? 'online' : selectedDevice ? 'warning' : ''}`} />
      <Dropdown label="Android device" value={devices.length ? selected : ''} onChange={onDevice} disabled={!devices.length}
        placeholder="No Android device" options={devices.map((device) => [device.serial, `${device.model} · ${device.connection}${device.state !== 'device' ? ` · ${device.state}` : ''}`])} />
    </div>
    <label className="global-search"><Search size={17} /><input ref={searchInput} aria-label="Search commands" aria-keyshortcuts="Control+K" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search every Scrcpy command…" /><kbd>CTRL + K</kbd></label>
    <div className="window-controls" aria-label="Window controls">
      <button onClick={() => windowAction('minimize')} disabled={!window.scrcpyStudio} title="Minimize" aria-label="Minimize"><Minus size={16} /></button>
      <button onClick={() => windowAction('toggle-maximize')} disabled={!window.scrcpyStudio} title={maximized ? 'Restore window' : 'Maximize'} aria-label={maximized ? 'Restore window' : 'Maximize'}>{maximized ? <Copy size={14} /> : <Square size={14} />}</button>
      <button className="window-close" onClick={() => windowAction('close')} disabled={!window.scrcpyStudio} title="Close" aria-label="Close"><X size={18} /></button>
    </div>
  </header>
}

function CatMark({ small = false }: { small?: boolean }) {
  return <div className={`cat-mark ${small ? 'small' : ''}`} aria-hidden="true"><span className="cat-ear left" /><span className="cat-ear right" /><span className="cat-face"><i /><i /><b /></span></div>
}

type PageBaseProps = {
  config: StudioConfig
  update: <K extends keyof StudioConfig>(key: K, value: StudioConfig[K]) => void
  setConfig: React.Dispatch<React.SetStateAction<StudioConfig>>
  addLog(level: LogEntry['level'], text: string): void
}

function StudioPage(props: PageBaseProps & {
  runtime: RuntimeStatus | null; devices: Device[]; device?: Device; capabilities: DeviceCapabilities | null; capabilitiesLoading: boolean; capabilitiesError: string; session: SessionState; args: string[]; commandText: string;
  logs: LogEntry[]; loading: boolean; installing: boolean; installProgress: { progress: number; message: string }; preset: string;
  wifiAddress: string; onWifiAddress(value: string): void; onConnect(): void; onInstall(): void; onChoose(): void;
  onToggleSession(): void; onCopy(): void; onPreset(name: string): void; onNavigate(id: NavId): void; onSaveProfile(): void; onRefresh(): void
}) {
  const { config, update, runtime, devices, device, capabilities, capabilitiesLoading, capabilitiesError, session, args, commandText, logs, installing, installProgress, preset,
    wifiAddress, onWifiAddress, onConnect, onInstall, onChoose, onToggleSession, onCopy, onPreset, onNavigate, onSaveProfile, onRefresh, addLog } = props
  const [pairCode, setPairCode] = useState('')
  const usableDevice = device?.state === 'device'
  const display = capabilities?.display
  const hardware = capabilities?.hardware
  const videoCodecs = capabilities?.video.codecs.length ? capabilities.video.codecs.map((codec) => codec.toUpperCase()).join(' / ') : 'Not reported'
  const resolution = display?.currentWidth && display.currentHeight ? `${display.currentWidth} × ${display.currentHeight}` : 'Unknown'
  const refreshRate = (value?: number) => value ? `${Math.round(value * 100) / 100} Hz` : 'Unknown'
  const stateLabel = session.status.replace('-', ' ').toUpperCase()
  async function deviceAction(action: string, payload: Record<string, unknown> = {}) {
    const result = await api.adbAction(action, { serial: config.serial, ...payload }).catch((error) => ({ code: 1, output: error.message }))
    addLog(result.code === 0 ? 'success' : 'error', result.output)
    if (result.code === 0) onRefresh()
  }
  return <div className="page studio-page professional-dashboard">
    <header className="dashboard-header">
      <div><span className="kicker">DEVICE CONTROL</span><h1>Pepperon's GUI</h1><p>Android mirroring, recording, and input configuration.</p></div>
      <div className="dashboard-header-actions">
        <span className={`session-status status-${session.status}`}><i />{stateLabel}</span>
        {session.status === 'error' && <button className="secondary retry-button" onClick={() => api.retry()}><RefreshCw size={15} />Retry</button>}
        <SessionButton session={session} disabled={!runtime?.installed || !usableDevice} onClick={onToggleSession} />
      </div>
    </header>

    {!runtime?.installed && <section className="runtime-setup-bar">
      <div className="setup-icon"><Download size={19} /></div><div><strong>Scrcpy runtime required</strong><span>Install official Scrcpy {runtime?.latestVersion || 'latest'} or select an existing executable.</span></div>
      <button className="primary small" onClick={onInstall} disabled={installing}>{installing ? `${installProgress.progress}%` : 'Install runtime'}</button>
      <button className="secondary" onClick={onChoose}>Choose executable</button>
      {installing && <div className="runtime-progress"><span style={{ width: `${installProgress.progress}%` }} /></div>}
    </section>}

    <div className="overview-grid">
      <ConnectionVisual device={device} session={session} action={<SessionButton session={session} disabled={!runtime?.installed || !usableDevice} onClick={onToggleSession} className="connection-go-live" />} />

      <SectionCard title="Connected device" kicker="HARDWARE" icon={<Smartphone size={18} />} action={<button className="icon-button tiny" onClick={onRefresh} title="Refresh device and capabilities"><RefreshCw size={14} /></button>}>
        {device ? <div className="device-summary">
          <div className="device-glyph"><Smartphone size={24} /></div>
          <div className="device-primary"><h3>{hardware?.manufacturer ? `${hardware.manufacturer} ` : ''}{hardware?.model || device.model}</h3><span>{hardware?.androidVersion ? `Android ${hardware.androidVersion}` : 'Android version unknown'}{hardware?.sdk ? ` · API ${hardware.sdk}` : ''}</span></div>
          <StatusTag state={device.state} label={device.state === 'device' ? device.connection : device.state} />
          <div className="dense-specs"><Spec label="Serial" value={device.serial} mono /><Spec label="Architecture" value={hardware?.abi || 'Unknown'} /><Spec label="Device ID" value={hardware?.device || device.product || 'Unknown'} /></div>
        </div> : <EmptyState icon={<Unplug />} title="No Android device detected" text="Enable USB debugging and connect a device, or use ADB over Wi-Fi." />}
      </SectionCard>

      <SectionCard title="Session" kicker="PROCESS" icon={<Activity size={18} />}>
        <div className="session-panel"><div className={`session-orb status-${session.status}`}><Monitor size={22} /></div><div><strong>{stateLabel}</strong><span>{session.status === 'live' ? 'Native Scrcpy window active' : session.error || 'No active mirror process'}</span></div></div>
        <div className="dense-specs columns"><Spec label="PID" value={session.pid ? String(session.pid) : '—'} mono /><Spec label="Duration" value={<SessionDuration startedAt={session.startedAt} running={session.running} />} /><Spec label="Generation" value={String(session.generation || 0)} /></div>
        {session.status === 'applying' || session.status === 'restarting' ? <div className="apply-progress"><span /><small>Latest configuration is being applied automatically.</small></div> : null}
      </SectionCard>

      <SectionCard title="Display" kicker="CAPABILITIES" icon={<Monitor size={18} />}>
        <CapabilityState loading={capabilitiesLoading} error={capabilitiesError} empty={!capabilities} />
        {capabilities && <div className="capability-values"><strong>{resolution}</strong><span>{display?.currentRefreshRate ? `${refreshRate(display.currentRefreshRate)} current` : 'Refresh rate not reported'}</span><div className="dense-specs columns"><Spec label="Physical" value={display?.physicalWidth && display.physicalHeight ? `${display.physicalWidth} × ${display.physicalHeight}` : 'Unknown'} /><Spec label="Maximum" value={refreshRate(display?.maxRefreshRate)} /><Spec label="Density" value={display?.densityDpi ? `${display.densityDpi} DPI` : 'Unknown'} /></div></div>}
      </SectionCard>

      <SectionCard title="Video" kicker="ENCODING" icon={<Video size={18} />} action={<button className="text-button" onClick={() => onNavigate('video')}>Configure</button>}>
        <div className="capability-values"><strong>{config.videoCodec.toUpperCase()} · {config.maxFps || 'Unlimited'} FPS</strong><span>{videoCodecs}</span><div className="dense-specs columns"><Spec label="Bitrate" value={config.videoBitRate} /><Spec label="Max size" value={config.maxSize ? `${config.maxSize}px` : 'Native'} /><Spec label="Encoder" value={config.videoEncoder || 'Automatic'} /></div></div>
      </SectionCard>

      <SectionCard title="Audio" kicker="FORWARDING" icon={<AudioLines size={18} />} action={<button className="text-button" onClick={() => onNavigate('audio')}>Configure</button>}>
        <div className="capability-values"><strong>{!config.audioEnabled ? 'Disabled' : capabilities?.audio.forwardingSupported === false ? 'Unavailable' : `${config.audioCodec.toUpperCase()} · ${config.audioSource}`}</strong><span>{capabilities?.audio.supportMessage || 'Device audio support has not been inspected.'}</span><div className="dense-specs columns"><Spec label="Bitrate" value={config.audioBitRate} /><Spec label="Buffer" value={`${config.audioBuffer} ms`} /><Spec label="Encoder" value={config.audioEncoder || 'Automatic'} /></div></div>
      </SectionCard>

      <SectionCard title="Recording" kicker="OUTPUT" icon={<Record size={18} />} action={<button className="text-button" onClick={() => onNavigate('recording')}>Configure</button>}>
        <div className="recording-summary"><span className={config.recordingEnabled ? 'armed' : ''}><Record size={18} /></span><div><strong>{config.recordingEnabled ? session.running ? 'Recording active' : 'Recording armed' : 'Recording disabled'}</strong><small>{session.recordingPath || config.recordPath || 'No destination selected'}</small></div></div>
        <div className="dense-specs columns"><Spec label="Format" value={config.recordFormat.toUpperCase()} /><Spec label="Playback" value={config.noPlayback ? 'Disabled' : 'Enabled'} /><Spec label="Limit" value={config.timeLimit ? `${config.timeLimit}s` : 'None'} /></div>
      </SectionCard>
    </div>

    <div className="control-grid">
      <SectionCard title="Quick video" kicker="CONFIGURATION" icon={<Gauge size={18} />} action={<button className="icon-button tiny" onClick={onSaveProfile} title="Save current profile"><Save size={14} /></button>}>
        <div className="preset-compact">{QUICK_PRESETS.map((item) => <button className={preset === item.name ? 'active' : ''} key={item.name} onClick={() => onPreset(item.name)}>{item.label}</button>)}</div>
        <div className="field-grid triple"><Select label="Codec" value={config.videoCodec} onChange={(value) => update('videoCodec', value as StudioConfig['videoCodec'])} options={[['h264','H.264'],['h265','H.265'],['av1','AV1'],['vp8','VP8'],['vp9','VP9']]} /><Field label="Max FPS" value={config.maxFps} onChange={(value) => update('maxFps', value)} /><Field label="Bitrate" value={config.videoBitRate} onChange={(value) => update('videoBitRate', value)} /></div>
      </SectionCard>

      <SectionCard title="Quick controls" kicker="LIVE + STARTUP" icon={<SlidersHorizontal size={18} />}>
        <div className="switch-grid"><Switch label="Clipboard sync" checked={config.clipboardSync} onChange={(value) => update('clipboardSync', value)} /><Switch label="Show touches" checked={config.showTouches} onChange={(value) => update('showTouches', value)} /><Switch label="Keep awake" checked={config.stayAwake} onChange={(value) => update('stayAwake', value)} /><Switch label="Physical screen off" checked={config.turnScreenOff} onChange={(value) => update('turnScreenOff', value)} /></div>
      </SectionCard>

      <SectionCard title="Connection" kicker="ADB" icon={device?.connection === 'Wi-Fi' ? <Wifi size={18} /> : <Usb size={18} />}>
        <div className="device-list compact-list">{devices.map((item) => <button key={item.serial} className={config.serial === item.serial ? 'selected' : ''} onClick={() => update('serial', item.serial)}><span className="device-icon"><Smartphone size={17} /></span><span><strong>{item.model}</strong><small>{item.serial}</small></span><StatusTag state={item.state} label={item.connection} /></button>)}</div>
        {!devices.length && <EmptyState icon={<Unplug />} title="No devices" text="Connect by USB or enter a Wi-Fi ADB address below." />}
        <div className="wifi-connect"><label><Wifi size={15} /><input value={wifiAddress} onChange={(event) => onWifiAddress(event.target.value)} placeholder="IP:port" /></label><button onClick={onConnect}>Connect</button></div>
        <div className="pair-row"><input value={pairCode} onChange={(event) => setPairCode(event.target.value)} placeholder="Pairing code" /><button onClick={() => deviceAction('pair', { address: wifiAddress, code: pairCode })} disabled={!wifiAddress || !pairCode}>Pair</button><button onClick={() => deviceAction('tcpip', { port: 5555 })} disabled={!usableDevice}>Enable TCP/IP</button>{device?.connection === 'Wi-Fi' && <button onClick={() => deviceAction('disconnect', { address: device.serial })}>Disconnect</button>}</div>
        <div className="automation-switches"><Switch label="Auto-start when a device connects" checked={config.autoStartOnConnect} onChange={(value) => update('autoStartOnConnect', value)} /><Switch label="Reconnect when selected device returns" checked={config.autoReconnect} onChange={(value) => update('autoReconnect', value)} /></div>
      </SectionCard>

      <SectionCard className="command-card" title="Command preview" kicker="LATEST DESIRED CONFIG" icon={<Terminal size={18} />} action={<button className="icon-button tiny" onClick={onCopy}><Copy size={14} /></button>}>
        <div className="command-preview"><span className="prompt">$</span><code>{commandText}</code></div>
        <div className="command-stats"><span><Command size={13} />{args.length} active arguments</span><span><ShieldMark />argument-array execution</span></div>
        <button className="full secondary" onClick={() => onNavigate('options')}><ListFilter size={16} />Open all commands</button>
      </SectionCard>
    </div>

    <div className="activity-wide"><ActivityFeed logs={logs} /></div>
  </div>
}

function VideoPage({ config, update, capabilities }: PageBaseProps & { capabilities: DeviceCapabilities | null }) {
  const reportedCodecs = capabilities?.video.codecs || []
  const hasCodecData = reportedCodecs.length > 0
  const cameraOptions: Array<[string, string]> = [['', 'Automatic'], ...(capabilities?.camera.cameras || []).map((camera) => [camera.id, `${camera.id}${camera.facing ? ` · ${camera.facing}` : ''}`] as [string, string])]
  const selectedCamera = capabilities?.camera.cameras.find((camera) => camera.id === config.cameraId)
  const fpsShortcuts = [...new Set([30, 60, ...(capabilities?.display.supportedRefreshRates || []).map(Math.round)])].sort((a, b) => a - b)
  return <PageFrame title="Video studio" subtitle="Shape the stream before it leaves your Android device." icon={<Video />}>
    <div className="settings-grid">
      <SectionCard title="Capture source" kicker="SOURCE" icon={<Camera size={18} />}>
        <Segmented value={config.videoSource} onChange={(value) => update('videoSource', value as StudioConfig['videoSource'])} options={[['display', 'Display'], ['camera', 'Camera']]} />
        {config.videoSource === 'camera' && <div className="field-grid">
          <Select label="Camera ID" value={config.cameraId} disabled={Boolean(config.cameraFacing)} onChange={(value) => { update('cameraId', value); if (value) update('cameraFacing', '') }} options={cameraOptions} />
          <Select label="Facing" value={config.cameraFacing} disabled={Boolean(config.cameraId)} onChange={(value) => { update('cameraFacing', value as StudioConfig['cameraFacing']); if (value) update('cameraId', '') }} options={[['', 'Auto'], ['front', 'Front'], ['back', 'Back'], ['external', 'External']]} />
          <Field label="Camera size" value={config.cameraSize} onChange={(value) => update('cameraSize', value)} placeholder="1920x1080" />
          <Field label="Camera FPS" value={config.cameraFps} onChange={(value) => update('cameraFps', value)} />
          <Switch label="Camera torch" checked={config.cameraTorch} onChange={(value) => update('cameraTorch', value)} />
          {selectedCamera && <div className="capability-hint">Reported sizes: {selectedCamera.sizes.join(', ') || 'Not reported'} · FPS: {selectedCamera.frameRates.join(', ') || 'Not reported'}</div>}
        </div>}
      </SectionCard>
      <SectionCard title="Encoding" kicker="QUALITY" icon={<Cpu size={18} />}>
        <Select label="Video codec" value={config.videoCodec} onChange={(value) => update('videoCodec', value as StudioConfig['videoCodec'])}
          options={[['h264', 'H.264 · compatible', hasCodecData && !reportedCodecs.includes('h264')], ['h265', 'H.265 · efficient', hasCodecData && !reportedCodecs.includes('h265')], ['av1', 'AV1 · modern', hasCodecData && !reportedCodecs.includes('av1')], ['vp8', 'VP8 · v4.1', hasCodecData && !reportedCodecs.includes('vp8')], ['vp9', 'VP9 · v4.1', hasCodecData && !reportedCodecs.includes('vp9')]]} />
        <Select label="Video encoder" value={config.videoEncoder} onChange={(value) => update('videoEncoder', value)} options={[['', 'Automatic'], ...(capabilities?.video.encoders.filter((encoder) => encoder.codec === config.videoCodec).map((encoder) => [encoder.name, encoder.name] as [string, string]) || [])]} />
        {hasCodecData && <div className="capability-hint"><ShieldCheck size={13} />Reported by device: {reportedCodecs.map((codec) => codec.toUpperCase()).join(', ')}</div>}
        <div className="field-grid"><Field label="Bit rate" value={config.videoBitRate} onChange={(value) => update('videoBitRate', value)} hint="Supports K and M suffixes" />
          <Field label="Video buffer" value={config.videoBuffer} onChange={(value) => update('videoBuffer', value)} suffix="ms" /></div>
      </SectionCard>
      <SectionCard title="Frame geometry" kicker="CANVAS" icon={<Box size={18} />}>
        <div className="field-grid"><Field label="Maximum size" value={config.maxSize} onChange={(value) => update('maxSize', value)} suffix="px" />
          <Field label="Maximum FPS" value={config.maxFps} onChange={(value) => update('maxFps', value)} suffix="fps" /></div>
        <div className="value-shortcuts">{fpsShortcuts.map((fps) => <button className={config.maxFps === String(fps) ? 'active' : ''} key={fps} onClick={() => update('maxFps', String(fps))}>{fps} FPS</button>)}</div>
        <Field label="Crop" value={config.crop} onChange={(value) => update('crop', value)} placeholder="width:height:x:y" hint="Uses the device's natural orientation" />
      </SectionCard>
      <VisualSummary config={config} />
    </div>
  </PageFrame>
}

function AudioPage({ config, update, capabilities }: PageBaseProps & { capabilities: DeviceCapabilities | null }) {
  const unavailable = capabilities?.audio.forwardingSupported === false
  const reportedCodecs = capabilities?.audio.codecs || []
  return <PageFrame title="Audio room" subtitle="Route Android playback, microphones, and voice sources." icon={<AudioLines />}>
    <div className="settings-grid">
      <SectionCard title="Audio capture" kicker="SIGNAL" icon={<Mic2 size={18} />}>
        <Switch label="Forward audio" description={capabilities?.audio.supportMessage || 'Requires Android 11 or newer for device audio.'} checked={unavailable ? false : config.audioEnabled} disabled={unavailable} onChange={(value) => update('audioEnabled', value)} />
        {unavailable && <div className="inline-warning"><Info size={14} />Audio forwarding is unavailable on this Android version.</div>}
        <Select label="Source" value={config.audioSource} disabled={!config.audioEnabled} onChange={(value) => update('audioSource', value)} options={[
          ['output', 'Device output'], ['playback', 'Playback (keep local optional)'], ['mic', 'Microphone'], ['mic-unprocessed', 'Microphone · unprocessed'],
          ['mic-camcorder', 'Microphone · camcorder'], ['mic-voice-recognition', 'Voice recognition'], ['mic-voice-communication', 'Voice communication'],
          ['voice-call', 'Voice call'], ['voice-call-uplink', 'Voice call · uplink'], ['voice-call-downlink', 'Voice call · downlink'], ['voice-performance', 'Live performance'],
        ]} />
        <Switch label="Duplicate playback" description="Keep playback on the phone; valid with the playback source." checked={config.audioDup} disabled={config.audioSource !== 'playback'} onChange={(value) => update('audioDup', value)} />
      </SectionCard>
      <SectionCard title="Audio encoding" kicker="CODEC" icon={<Radio size={18} />}>
        <Select label="Codec" value={config.audioCodec} onChange={(value) => update('audioCodec', value as StudioConfig['audioCodec'])} options={[['opus', 'Opus', reportedCodecs.length > 0 && !reportedCodecs.includes('opus')], ['aac', 'AAC', reportedCodecs.length > 0 && !reportedCodecs.includes('aac')], ['flac', 'FLAC', reportedCodecs.length > 0 && !reportedCodecs.includes('flac')], ['raw', 'Raw PCM', reportedCodecs.length > 0 && !reportedCodecs.includes('raw')]]} />
        <Select label="Audio encoder" value={config.audioEncoder} onChange={(value) => update('audioEncoder', value)} options={[['', 'Automatic'], ...(capabilities?.audio.encoders.filter((encoder) => encoder.codec === config.audioCodec).map((encoder) => [encoder.name, encoder.name] as [string, string]) || [])]} />
        <div className="field-grid"><Field label="Bit rate" value={config.audioBitRate} onChange={(value) => update('audioBitRate', value)} />
          <Field label="Buffer" value={config.audioBuffer} onChange={(value) => update('audioBuffer', value)} suffix="ms" /></div>
      </SectionCard>
      <SectionCard title="Latency note" kicker="MONITOR" icon={<Zap size={18} />} className="accent-note">
        <p>Smaller buffers feel more immediate, but raise the chance of glitches on busy or wireless connections. Start at 50 ms and tune downward.</p>
        <div className="latency-scale"><span>Immediate</span><div><i style={{ left: `${Math.min(100, Number(config.audioBuffer) / 2)}%` }} /></div><span>Stable</span></div>
      </SectionCard>
    </div>
  </PageFrame>
}

function ControlPage({ config, update }: PageBaseProps) {
  return <PageFrame title="Control deck" subtitle="Choose how the desktop sends keyboard, mouse, and gamepad input." icon={<Gamepad2 />}>
    <div className="settings-grid">
      <SectionCard title="Master control" kicker="INPUT" icon={<MousePointer2 size={18} />}>
        <Switch label="Control the device" description="Disable for a view-only session." checked={config.controlEnabled} onChange={(value) => update('controlEnabled', value)} />
        <div className="mode-cards">
          <ModeSelect icon={<Keyboard />} label="Keyboard" value={config.keyboard} disabled={!config.controlEnabled} onChange={(value) => update('keyboard', value as StudioConfig['keyboard'])} options={['sdk', 'uhid', 'aoa', 'disabled']} />
          <ModeSelect icon={<MousePointer2 />} label="Mouse" value={config.mouse} disabled={!config.controlEnabled} onChange={(value) => update('mouse', value as StudioConfig['mouse'])} options={['sdk', 'uhid', 'aoa', 'disabled']} />
          <ModeSelect icon={<Gamepad2 />} label="Gamepad" value={config.gamepad} disabled={!config.controlEnabled} onChange={(value) => update('gamepad', value as StudioConfig['gamepad'])} options={['disabled', 'uhid', 'aoa']} />
        </div>
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
        <div className="guide-line"><strong>AOA</strong><span>USB accessory mode; can work without USB debugging in OTG mode.</span></div>
      </SectionCard>
    </div>
  </PageFrame>
}

function DisplayPage({ config, update }: PageBaseProps) {
  return <PageFrame title="Display & window" subtitle="Stage the native mirror window or create a new Android display." icon={<Monitor />}>
    <div className="settings-grid">
      <SectionCard title="Desktop window" kicker="FRAME" icon={<AppWindow size={18} />}>
        <Field label="Window title" value={config.windowTitle} onChange={(value) => update('windowTitle', value)} placeholder="Pepperon's GUI" />
        <div className="field-grid"><Field label="Width" value={config.windowWidth} onChange={(value) => update('windowWidth', value)} placeholder="Automatic" /><Field label="Height" value={config.windowHeight} onChange={(value) => update('windowHeight', value)} placeholder="Automatic" /></div>
        <div className="field-grid"><Field label="Position X" value={config.windowX} onChange={(value) => update('windowX', value)} placeholder="Automatic" /><Field label="Position Y" value={config.windowY} onChange={(value) => update('windowY', value)} placeholder="Automatic" /></div>
        <Switch label="Always on top" checked={config.alwaysOnTop} onChange={(value) => update('alwaysOnTop', value)} />
        <Switch label="Borderless" checked={config.borderless} onChange={(value) => update('borderless', value)} />
        <Switch label="Start fullscreen" checked={config.fullscreen} onChange={(value) => update('fullscreen', value)} />
        <Switch label="Disable screensaver" checked={config.disableScreensaver} onChange={(value) => update('disableScreensaver', value)} />
      </SectionCard>
      <SectionCard title="Virtual display" kicker="ANDROID" icon={<Laptop size={18} />}>
        <div className="field-grid"><Field label="Display ID" value={config.displayId} disabled={config.newDisplay} onChange={(value) => update('displayId', value)} /><Select label="Orientation" value={config.displayOrientation} onChange={(value) => update('displayOrientation', value)} options={[['0','0°'],['90','90°'],['180','180°'],['270','270°'],['flip0','Flip 0°'],['flip90','Flip 90°'],['flip180','Flip 180°'],['flip270','Flip 270°']]} /></div>
        <Switch label="Create a new display" description="Launch a separate virtual Android workspace instead of the main display." checked={config.newDisplay} onChange={(value) => update('newDisplay', value)} />
        <div className="field-grid"><Field label="Display size" value={config.newDisplaySize} disabled={!config.newDisplay} onChange={(value) => update('newDisplaySize', value)} placeholder="1920x1080" />
          <Field label="Density" value={config.newDisplayDpi} disabled={!config.newDisplay} onChange={(value) => update('newDisplayDpi', value)} suffix="dpi" /></div>
        <Switch label="Destroy content on close" checked={config.destroyDisplayContent} disabled={!config.newDisplay} onChange={(value) => update('destroyDisplayContent', value)} />
        <Switch label="System decorations" checked={config.displayDecorations} disabled={!config.newDisplay} onChange={(value) => update('displayDecorations', value)} />
      </SectionCard>
      <SectionCard title="Window preview" kicker="LAYOUT" icon={<Box size={18} />} className="window-preview-card">
        <div className={`mini-window ${config.borderless ? 'borderless' : ''} ${config.fullscreen ? 'fullscreen' : ''}`}>
          {!config.borderless && <div className="mini-title"><span /><span /><span /><em>{config.windowTitle || "Pepperon's GUI"}</em></div>}
          <div className="mini-screen"><CatMark /></div>
        </div>
      </SectionCard>
    </div>
  </PageFrame>
}

function RecordingPage({ config, update }: PageBaseProps) {
  async function choosePath() {
    const file = await api.chooseRecordingPath(config.recordFormat)
    if (file) update('recordPath', file)
  }
  return <PageFrame title="Recording booth" subtitle="Capture the stream without sacrificing Scrcpy's native responsiveness." icon={<Record />}>
    <div className="settings-grid">
      <SectionCard title="Record session" kicker="OUTPUT" icon={<Record size={18} />}>
        <Switch label="Enable recording" description="The recording begins and ends with the mirror session." checked={config.recordingEnabled} onChange={(value) => update('recordingEnabled', value)} />
        <Select label="Container" value={config.recordFormat} disabled={!config.recordingEnabled} onChange={(value) => update('recordFormat', value as StudioConfig['recordFormat'])}
          options={[['mp4', 'MP4 · video + audio'], ['mkv', 'MKV · video + audio'], ['m4a', 'M4A · audio'], ['mka', 'MKA · audio'], ['opus', 'Opus'], ['aac', 'AAC'], ['flac', 'FLAC'], ['wav', 'WAV']]} />
        <label className="field"><span>Destination</span><div className="path-field"><input value={config.recordPath} disabled={!config.recordingEnabled} onChange={(event) => update('recordPath', event.target.value)} placeholder="Choose a local file…" /><button onClick={choosePath} disabled={!config.recordingEnabled}>Browse</button></div></label>
      </SectionCard>
      <SectionCard title="Playback & timing" kicker="SESSION" icon={<Activity size={18} />}>
        <Switch label="Record without playback" description="Capture to file without opening video or audio playback." checked={config.noPlayback} onChange={(value) => update('noPlayback', value)} />
        <Field label="Time limit" value={config.timeLimit} onChange={(value) => update('timeLimit', value)} suffix="seconds" placeholder="Unlimited" />
      </SectionCard>
      <SectionCard title="Capture recipe" kicker="SUMMARY" icon={<Clipboard size={18} />} className="recipe-card">
        <div className="recipe-art"><span className={config.recordingEnabled ? 'armed' : ''}><Record /></span><i /></div>
        <h3>{config.recordingEnabled ? 'Recording armed' : 'Recording is off'}</h3>
        <p>{config.recordingEnabled ? `${config.recordFormat.toUpperCase()} · ${config.videoCodec.toUpperCase()} · ${config.audioEnabled ? config.audioCodec.toUpperCase() : 'No audio'}` : 'Enable recording and choose a destination to arm this session.'}</p>
      </SectionCard>
    </div>
  </PageFrame>
}

function OptionsPage({ options, config, setConfig, search, onSearch, category, onCategory, addLog }: {
  options: CliOption[]; config: StudioConfig; setConfig: React.Dispatch<React.SetStateAction<StudioConfig>>; search: string;
  onSearch(value: string): void; category: string; onCategory(value: string): void; addLog(level: LogEntry['level'], text: string): void
}) {
  const categories = ['All', ...Array.from(new Set(options.map((item) => item.category))).sort()]
  const filtered = options.filter((option) => {
    const query = search.toLowerCase().trim()
    return (category === 'All' || option.category === category) && (!query || `${option.name} ${option.description} ${option.category}`.toLowerCase().includes(query))
  })
  const activeCount = Object.values(config.extras).filter(Boolean).length
  function setExtra(option: CliOption, value: boolean | string) {
    setConfig((current) => {
      const guided = applyGuidedOptionValue(current, option.name, value)
      return guided || { ...current, extras: { ...current.extras, [option.name]: value } }
    })
  }
  return <PageFrame title="Every command" subtitle="The complete Scrcpy option surface, refreshed from your installed runtime." icon={<Command />} badge={`${options.length} FLAGS`}>
    <div className="option-toolbar">
      <label><Search size={17} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Filter by flag or description…" /></label>
      <div className="category-scroll">{categories.map((item) => <button className={category === item ? 'active' : ''} key={item} onClick={() => onCategory(item)}>{item}</button>)}</div>
      {activeCount > 0 && <button className="clear-options" onClick={() => setConfig((current) => ({ ...current, extras: {} }))}><Trash2 size={14} />Clear {activeCount}</button>}
    </div>
    <div className="options-meta"><span>Showing {filtered.length} commands</span><span><Sparkles size={14} />Known fields are synchronized with the guided controls</span></div>
    <div className="option-list">
      {filtered.map((option) => {
        const guided = getGuidedOptionValue(config, option.name)
        const current = guided !== undefined ? guided : config.extras[option.name]
        const enabled = current === true || (typeof current === 'string' && current.length > 0)
        const unavailable = option.runtimeAvailable === false
        const oneShot = ONE_SHOT_OPTIONS.has(option.name)
        return <div className={`option-row ${enabled ? 'enabled' : ''} ${unavailable ? 'unavailable' : ''}`} key={option.name}>
          <div className="option-copy"><span className="option-category">{option.category} · {unavailable ? 'UNAVAILABLE IN RUNTIME' : option.source === 'runtime' ? 'RUNTIME' : 'FALLBACK'}</span><code>{option.name}</code><p>{option.description || `Pass ${option.name} to Scrcpy.`}</p>{option.valueHint && <small>Value: {option.valueHint}</small>}</div>
          <div className="option-editor">
            {oneShot ? <button className="run-action" disabled={unavailable || !config.serial} onClick={async () => { const result = await api.runScrcpyAction([`--serial=${config.serial}`, option.name]).catch((error) => ({ code: 1, output: error.message })); addLog(result.code === 0 ? 'success' : 'error', result.output) }}><Play size={14} />Run</button>
            : option.kind === 'boolean' ? <Switch label="" checked={current === true} disabled={unavailable} onChange={(value) => setExtra(option, value)} />
              : <><input disabled={unavailable} value={typeof current === 'string' ? current : ''} onChange={(event) => setExtra(option, event.target.value)} placeholder={option.valueHint || 'value'} /><button disabled={unavailable} className={enabled ? 'active' : ''} onClick={() => setExtra(option, enabled ? '' : option.valueHint === 'value' ? '1' : option.valueHint || 'value')}><Plus size={15} /></button></>}
          </div>
        </div>
      })}
      {!filtered.length && <EmptyState icon={<Search />} title="No matching command" text="Try a broader name or choose another category." />}
    </div>
  </PageFrame>
}

function ProfilesPage({ profiles, config, onSave, onLoad, onRename, onDelete }: { profiles: SavedProfile[]; config: StudioConfig; onSave(): void; onLoad(profile: SavedProfile): void; onRename(id: string, name: string): void; onDelete(id: string): void }) {
  return <PageFrame title="Profiles" subtitle="Save a complete control-room setup and recall it in one click." icon={<Save />}>
    <div className="profile-hero"><div><span className="kicker">CURRENT MIX</span><h2>{config.videoCodec.toUpperCase()} · {config.maxFps} FPS · {config.videoBitRate}</h2><p>{Object.values(config.extras).filter(Boolean).length} advanced flags in this configuration.</p></div><button className="primary" onClick={onSave}><Save size={17} />Save as new profile</button></div>
    {profiles.length ? <div className="profile-grid">{profiles.map((profile, index) => <article className="profile-card" key={profile.id}>
      <div className={`profile-art art-${index % 4}`}><CatMark /><span>{profile.config.maxFps}</span></div>
      <div className="profile-body"><span className="option-category">PROFILE {String(index + 1).padStart(2, '0')}</span><h3>{profile.name}</h3><p>{profile.description}</p><small>Updated {new Date(profile.updatedAt).toLocaleDateString()}</small></div>
      <div className="profile-actions"><button onClick={() => onLoad(profile)}><Play size={14} />Load</button><button className="secondary profile-rename" onClick={() => { const name = window.prompt('Profile name', profile.name)?.trim(); if (name) onRename(profile.id, name) }}>Rename</button><button className="icon-button tiny" onClick={() => onDelete(profile.id)}><Trash2 size={14} /></button></div>
    </article>)}</div> : <div className="empty-profiles"><CatMark /><h2>Your presets will live here</h2><p>Tune the studio, then save the complete setup—including advanced flags and recording preferences.</p><button className="primary" onClick={onSave}><Plus size={17} />Save first profile</button></div>}
  </PageFrame>
}

function AppearancePage({ theme, setTheme, onReset }: { theme: ThemeSettings; setTheme: React.Dispatch<React.SetStateAction<ThemeSettings>>; onReset(): void }) {
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
      <SectionCard title="Live preview" kicker="INTERFACE" icon={theme.mode === 'dark' ? <MoonStar size={18} /> : <Sun size={18} />} className="theme-preview-card">
        <div className="theme-swatch-preview"><div className="preview-banner"><CatMark /><span>Pepperon's GUI</span></div><div className="preview-controls"><i /><i /><button>Go live</button></div><div className="preview-lines"><span /><span /><span /></div></div>
      </SectionCard>
    </div>
  </PageFrame>
}

function Spec({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return <div className={`spec ${mono ? 'mono' : ''}`}><span>{label}</span><strong>{value}</strong></div>
}

function StatusTag({ state, label }: { state: string; label: string }) {
  return <span className={`status-tag state-${state}`}><i />{label}</span>
}

function CapabilityState({ loading, error, empty }: { loading: boolean; error: string; empty: boolean }) {
  if (loading) return <div className="capability-state"><RefreshCw className="spin" size={14} />Inspecting device…</div>
  if (error) return <div className="capability-state error"><Info size={14} />{error}</div>
  if (empty) return <div className="capability-state"><Info size={14} />No capability data</div>
  return null
}

function SessionDuration({ startedAt, running }: { startedAt?: number; running: boolean }) {
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

function PageFrame({ title, subtitle, icon, badge, children }: { title: string; subtitle: string; icon: ReactNode; badge?: string; children: ReactNode }) {
  return <div className="page settings-page">
    <div className="page-header"><div className="page-icon">{icon}</div><div><span className="kicker">CONTROL ROOM</span><h1>{title}</h1><p>{subtitle}</p></div>{badge && <span className="page-badge">{badge}</span>}</div>
    {children}
  </div>
}

function SectionCard({ title, kicker, icon, action, className = '', children }: { title: string; kicker: string; icon?: ReactNode; action?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={`section-card ${className}`}>
    <div className="card-header"><div className="card-icon">{icon}</div><div><span className="kicker">{kicker}</span><h3>{title}</h3></div>{action && <div className="card-action">{action}</div>}</div>
    <div className="card-content">{children}</div>
  </section>
}

function Field({ label, value, onChange, placeholder, hint, suffix, disabled = false }: { label: string; value: string; onChange(value: string): void; placeholder?: string; hint?: string; suffix?: string; disabled?: boolean }) {
  return <label className="field"><span>{label}</span><div className="input-wrap"><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} />{suffix && <em>{suffix}</em>}</div>{hint && <small>{hint}</small>}</label>
}

function Select({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange(value: string): void; options: Array<[string, string, boolean?]>; disabled?: boolean }) {
  return <div className="field"><span>{label}</span><Dropdown label={label} value={value} onChange={onChange} options={options} disabled={disabled} /></div>
}

function Switch({ label, description, checked, onChange, disabled = false }: { label: string; description?: string; checked: boolean; onChange(value: boolean): void; disabled?: boolean }) {
  return <label className={`switch-row ${disabled ? 'disabled' : ''}`}><span className="switch-copy">{label && <strong>{label}</strong>}{description && <small>{description}</small>}</span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><i><b /></i></label>
}

function Segmented({ value, options, onChange }: { value: string; options: Array<[string, string]>; onChange(value: string): void }) {
  return <div className="segmented">{options.map(([optionValue, label]) => <button className={value === optionValue ? 'active' : ''} key={optionValue} onClick={() => onChange(optionValue)}>{label}</button>)}</div>
}

function ModeSelect({ icon, label, value, options, onChange, disabled = false }: { icon: ReactNode; label: string; value: string; options: string[]; onChange(value: string): void; disabled?: boolean }) {
  return <div className={`mode-select ${disabled ? 'disabled' : ''}`}><span className="mode-icon">{icon}</span><strong>{label}</strong><Dropdown label={label} value={value} options={options.map((option) => [option, option.toUpperCase()])} disabled={disabled} onChange={onChange} /></div>
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) {
  return <label className="color-field"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} /><span><strong>{label}</strong><small>{value.toUpperCase()}</small></span></label>
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="empty-state"><span>{icon}</span><div><strong>{title}</strong><p>{text}</p></div></div>
}

function ActivityFeed({ logs }: { logs: LogEntry[] }) {
  const recent = logs.slice(-5).reverse()
  return <SectionCard title="Activity" kicker="LIVE LOG" icon={<Activity size={18} />} className="activity-card" action={<span className="live-indicator"><i /> listening</span>}>
    <div className="activity-list">{recent.map((log) => <div className={`activity-entry ${log.level}`} key={log.id}><span>{log.level === 'error' ? <X /> : log.level === 'command' ? <Terminal /> : <Check />}</span><div><small>{log.time}</small><p>{log.text}</p></div></div>)}</div>
  </SectionCard>
}

function SessionButton({ session, disabled, onClick, className = '' }: {
  session: SessionState; disabled: boolean; onClick(): void; className?: string
}) {
  const busy = ['starting', 'applying', 'restarting', 'reconnecting', 'stopping'].includes(session.status)
  const active = session.running || busy
  return <button type="button" className={`primary session-button ${active ? 'stop' : ''} ${className}`} onClick={onClick} disabled={disabled || session.status === 'stopping'}>
    {active ? <Square size={15} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
    {session.status === 'live' ? 'Stop Stream' : busy ? session.status.toUpperCase() : 'Go live'}
  </button>
}

function ConnectionVisual({ device, session, action }: { device?: Device; session: SessionState; action: ReactNode }) {
  const connected = device?.state === 'device'
  const syncing = ['starting', 'applying', 'restarting', 'reconnecting'].includes(session.status)
  const visualState = session.status === 'live' ? 'live' : syncing ? 'syncing' : session.status === 'error' ? 'error' : connected ? 'connected' : 'offline'
  const stateLabel = visualState === 'live' ? 'Mirroring live' : visualState === 'syncing' ? 'Establishing link' : visualState === 'error' ? 'Link interrupted' : connected ? 'Device connected' : 'Waiting for device'
  const detail = connected ? `${device?.model || 'Android'} · ${device?.connection || 'ADB'}` : 'Connect by USB or Wi-Fi ADB'
  return <SectionCard title="Device link" kicker="CONNECTION" icon={device?.connection === 'Wi-Fi' ? <Wifi size={18} /> : <Usb size={18} />} className={`connection-visual-card visual-${visualState}`}>
    <div className="connection-stage">
      <div className="connection-pattern" />
      <div className="connection-rings"><i /><i /><i /></div>
      <div className="connection-phone">
        <span className="connection-speaker" />
        <div className="connection-screen"><i className="screen-orbit one" /><i className="screen-orbit two" /><CatMark /><span className="connection-scan" /></div>
        <span className="connection-home" />
      </div>
      <div className="connection-caption"><span className="connection-dot" /><div><strong>{stateLabel}</strong><small>{detail}</small></div></div>
      {action}
    </div>
  </SectionCard>
}

function VisualSummary({ config }: { config: StudioConfig }) {
  return <SectionCard title="Signal preview" kicker="OUTPUT" icon={<Sparkles size={18} />} className="signal-preview-card">
    <div className="signal-art"><div className="pixel-grid" /><div className="signal-phone"><CatMark /></div><div className="signal-rays" /></div>
    <div className="summary-badges"><span>{config.maxSize}px</span><span>{config.maxFps} fps</span><span>{config.videoCodec.toUpperCase()}</span><span>{config.videoBitRate}</span></div>
  </SectionCard>
}

function ShieldMark() {
  return <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M12 2 4 5v6c0 5.2 3.3 9 8 11 4.7-2 8-5.8 8-11V5l-8-3Z" fill="currentColor"/><path d="m8.5 12 2.2 2.2 4.8-5" fill="none" stroke="#10151d" strokeWidth="2"/></svg>
}
