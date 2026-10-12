import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Activity, AudioLines, Check, CircleDot as Record, Command, Copy, Gamepad2, Github, LayoutDashboard, Menu, Minus, Monitor, Palette, Save, Search, Square, Video, X } from 'lucide-react'
import { withConstraints } from '../electron/command-constraints.mjs'
import { formatCommand, platformIssue } from '../electron/scrcpy-args.mjs'
import { api } from './api'
import { useInteractiveSurfaces } from './interactions'
import { BrandMark, IS_WINDOWS, RuntimeVersionContext } from './controls'
import { Dropdown } from './Dropdown'
import { FirstRunTour } from './FirstRunTour'
import { buildArgs, DEFAULT_CONFIG, DEFAULT_THEME, FALLBACK_OPTIONS, QUICK_PRESETS } from './options'
import { AppearancePage } from './pages/AppearancePage'
import { AudioPage } from './pages/AudioPage'
import { ControlPage } from './pages/ControlPage'
import { DisplayPage } from './pages/DisplayPage'
import { OptionsPage } from './pages/OptionsPage'
import { ProfilesPage } from './pages/ProfilesPage'
import { RecordingPage } from './pages/RecordingPage'
import { StudioPage } from './pages/StudioPage'
import { VideoPage } from './pages/VideoPage'
import { normalizeConfig, profileDescription, parseProfiles, readProfiles, PROFILE_NAME_LIMIT, mergeProfiles } from './profiles'
import { QuickStarterGuide } from './QuickStarterGuide'
import { StartupLoader } from './StartupLoader'
import type { AppSettings, Device, DeviceCapabilities, LiveSettingChange, LogEntry, NavId, RuntimeStatus, SavedProfile, SessionState, StudioConfig, ThemeSettings } from './types'

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

const ONBOARDING_KEY = 'scrcpy-studio:onboarding-v1'

type ToastTone = 'success' | 'error'

function isFirstRun() {
  try { return localStorage.getItem(ONBOARDING_KEY) !== 'seen' } catch { return true }
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch { return fallback }
}

const PLATFORM = IS_WINDOWS ? 'win32' : navigator.userAgent.includes('Mac') ? 'darwin' : 'linux'

// The configuration scrcpy can actually be given: settings the device or the
// installed runtime cannot honour are dropped rather than failing the launch.
function effectiveConfig(config: StudioConfig, capabilities: DeviceCapabilities | null, hwdecAvailable: boolean): StudioConfig {
  let next = config
  if (capabilities?.audio.forwardingSupported === false) next = { ...next, audioEnabled: false }
  if (!hwdecAvailable && next.hwdec !== 'auto') next = { ...next, hwdec: 'auto' }
  return next
}

function configurationIssue(config: StudioConfig, capabilities: DeviceCapabilities | null) {
  const blocked = platformIssue(buildArgs(config), PLATFORM)
  if (blocked) return blocked
  if (config.recordingEnabled && !config.recordPath.trim()) return 'Choose a recording destination or turn recording off.'
  if (config.noPlayback && !config.recordingEnabled && !config.extras['--v4l2-sink']) return 'Record without playback requires an enabled recording destination or a V4L2 sink.'
  if (config.videoEnabled && capabilities?.video.reported && !capabilities.video.codecs.includes(config.videoCodec)) return `${config.videoCodec.toUpperCase()} is not reported by this device.`
  if (config.videoEnabled && config.videoEncoder) {
    const encoder = capabilities?.video.encoders.find((item) => item.name === config.videoEncoder)
    if (capabilities?.video.reported && !encoder) return `Video encoder ${config.videoEncoder} is unavailable on this device.`
    if (encoder && encoder.codec !== config.videoCodec) return `Video encoder ${config.videoEncoder} does not support ${config.videoCodec.toUpperCase()}.`
  }
  if (config.audioEnabled && config.audioEncoder) {
    const encoder = capabilities?.audio.encoders.find((item) => item.name === config.audioEncoder)
    if (capabilities?.audio.reported && !encoder) return `Audio encoder ${config.audioEncoder} is unavailable on this device.`
    if (encoder && encoder.codec !== config.audioCodec) return `Audio encoder ${config.audioEncoder} does not support ${config.audioCodec.toUpperCase()}.`
  }
  if (config.videoEnabled && !config.newDisplay && config.displayId !== '0' && capabilities?.display.displayIds.length && !capabilities.display.displayIds.includes(Number(config.displayId))) return `Display ${config.displayId} is unavailable on this device.`
  if (config.videoEnabled && config.videoSource === 'camera' && config.cameraId) {
    const camera = capabilities?.camera.cameras.find((item) => item.id === config.cameraId)
    if (capabilities?.camera.reported && !camera) return `Camera ${config.cameraId} is unavailable on this device.`
    if (camera && config.cameraSize && camera.sizes.length && !camera.sizes.includes(config.cameraSize)) return `${config.cameraSize} is unavailable for camera ${config.cameraId}.`
    if (camera && config.cameraFps && Number(config.cameraFps) !== 0 && camera.frameRates.length && !camera.frameRates.includes(Number(config.cameraFps))) return `${config.cameraFps} FPS is unavailable for camera ${config.cameraId}.`
  }
  return ''
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
  const [config, setConfig] = useState<StudioConfig>(() => {
    try { return normalizeConfig(JSON.parse(localStorage.getItem('scrcpy-studio:config') || 'null')) } catch { return structuredClone(DEFAULT_CONFIG) }
  })
  const [theme, setTheme] = useState<ThemeSettings>(() => readStored('scrcpy-studio:theme', DEFAULT_THEME))
  const [profiles, setProfiles] = useState<SavedProfile[]>(readProfiles)
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
  const [showLoader, setShowLoader] = useState(true)
  const [loaderLeaving, setLoaderLeaving] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installProgress, setInstallProgress] = useState({ progress: 0, message: '' })
  const [search, setSearch] = useState('')
  const [optionsCategory, setOptionsCategory] = useState('All')
  const [mobileNav, setMobileNav] = useState(false)
  const [toast, setToastState] = useState<{ text: string; tone: ToastTone } | null>(null)
  const setToast = useCallback((text: string, tone: ToastTone = 'success') => setToastState(text ? { text, tone } : null), [])
  const [wifiAddress, setWifiAddress] = useState('')
  const [tourOpen, setTourOpen] = useState(isFirstRun)
  const [tourAutoPlay, setTourAutoPlay] = useState(false)
  const tourReturnNav = useRef<NavId>('studio')
  const [startupDone, setStartupDone] = useState({ runtime: false, devices: false, session: false })
  const [appSettings, setAppSettings] = useState<AppSettings>({ minimizeToTray: false, closeToTray: false })
  const logId = useRef(2)
  const initialized = useRef(false)
  const configRef = useRef(config)
  const runtimeRef = useRef(runtime)
  const sessionRef = useRef(session)
  const previousConfig = useRef(config)
  const previousDesiredArgs = useRef(buildArgs(config))
  const previousDeviceStates = useRef<Map<string, string>>(new Map())
  const previousSessionStatus = useRef(session.status)

  // --hwdec arrived in scrcpy 5.0. Until an installed runtime has been inspected, assume the current release.
  const hwdecAvailable = useMemo(() => !runtime?.installed || !runtime.options.length || runtime.options.some((option) => option.name === '--hwdec'), [runtime])

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
    let mounted = true
    let exitTimer: number | undefined
    const reached = (stage: keyof typeof startupDone) => () => { if (mounted) setStartupDone((current) => ({ ...current, [stage]: true })) }
    const startup = Promise.allSettled([
      refreshRuntime().finally(reached('runtime')),
      refreshDevices().finally(reached('devices')),
      api.getSessionState().then(setSession).finally(reached('session')),
    ])
    const minimumDisplay = new Promise((resolve) => window.setTimeout(resolve, 2200))
    Promise.all([startup, minimumDisplay]).then(() => {
      if (!mounted) return
      initialized.current = true
      setLoading(false)
      setLoaderLeaving(true)
      exitTimer = window.setTimeout(() => {
        if (mounted) setShowLoader(false)
      }, 420)
    })
    api.getAppSettings().then((settings) => { if (mounted) setAppSettings(settings) }).catch(() => undefined)
    const removeLog = api.onLog((entry) => addLog(entry.level, entry.text))
    const removeState = api.onState((next) => {
      setSession(next)
      if (next.status !== previousSessionStatus.current) {
        if (next.status === 'live') addLog('success', `Mirroring active${next.pid ? ` (PID ${next.pid})` : ''}.`)
        else if (next.status === 'error') addLog('error', next.error || 'The Scrcpy session failed.')
        previousSessionStatus.current = next.status
      }
    })
    const removeInstall = api.onInstallProgress(setInstallProgress)
    // A hidden, idle window has nothing to react to; resume as soon as it is shown.
    const pollDevices = () => {
      if (document.hidden && sessionRef.current.status === 'offline' && !configRef.current.autoStartOnConnect) return
      refreshDevices()
    }
    const onVisible = () => { if (!document.hidden) refreshDevices() }
    document.addEventListener('visibilitychange', onVisible)
    const interval = window.setInterval(pollDevices, 5000)
    return () => { mounted = false; document.removeEventListener('visibilitychange', onVisible); if (exitTimer) window.clearTimeout(exitTimer); removeLog(); removeState(); removeInstall(); window.clearInterval(interval) }
  }, [addLog, refreshDevices, refreshRuntime])

  useEffect(() => { localStorage.setItem('scrcpy-studio:config', JSON.stringify(config)) }, [config])
  useEffect(() => { localStorage.setItem('scrcpy-studio:theme', JSON.stringify(theme)) }, [theme])
  useEffect(() => { localStorage.setItem('scrcpy-studio:profiles', JSON.stringify(profiles)) }, [profiles])
  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToastState(null), toast.tone === 'error' ? 4500 : 2500)
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
    const runtimeConfig = effectiveConfig(config, capabilities, hwdecAvailable)
    const nextArgs = buildArgs(runtimeConfig)
    const argsChanged = JSON.stringify(nextArgs) !== JSON.stringify(previousDesiredArgs.current)
    previousDesiredArgs.current = nextArgs
    if (!changedKeys.length && !argsChanged) return
    const issue = configurationIssue(runtimeConfig, capabilities)
    if (issue) { addLog('error', `Configuration not applied: ${issue}`); return }
    api.applyConfig({
      args: nextArgs, liveChanges, autoReconnect: config.autoReconnect,
      reason: changedKeys.length === 1 ? `${String(changedKeys[0])} changed` : changedKeys.length ? `${changedKeys.length} settings changed` : 'device capability constraints changed',
    }).catch((error) => addLog('error', `Automatic apply failed: ${error.message}`))
  }, [config, capabilities, hwdecAvailable, addLog])

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
      .map(option => option.runtimeAvailable === false ? { ...option, constraints: undefined } : withConstraints(option, runtime?.installedVersion))
  }, [runtime])
  const args = useMemo(() => buildArgs(effectiveConfig(config, capabilities, hwdecAvailable)), [config, capabilities, hwdecAvailable])
  const commandText = formatCommand(args)
  const selectedDevice = devices.find((device) => device.serial === config.serial)
  const preset = useMemo(() => QUICK_PRESETS.find((item) => Object.entries(item.patch)
    .every(([key, value]) => config[key as keyof StudioConfig] === value))?.name || '', [config])

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
      setToast('Installation failed — see activity', 'error')
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
        const issue = configurationIssue(effectiveConfig(config, capabilities, hwdecAvailable), capabilities)
        if (issue) { addLog('error', issue); setToast('Cannot start mirroring — see activity', 'error'); return }
        const next = await api.start({ args, liveChanges: liveSettings(config), autoReconnect: config.autoReconnect, reason: session.status === 'error' ? 'retry' : 'manual start' })
        setSession(next)
      }
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : String(error))
      setToast('Could not start — see activity', 'error')
    }
  }

  async function copyCommand() {
    await navigator.clipboard.writeText(commandText)
    setToast('Command copied')
  }

  function applyPreset(name: string) {
    const next = QUICK_PRESETS.find((item) => item.name === name)
    if (!next) return
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
    const usedNumbers = new Set(profiles.map((profile) => Number(profile.name.match(/^Profile (\d+)$/i)?.[1])).filter(Number.isFinite))
    let number = 1
    while (usedNumbers.has(number)) number += 1
    const name = `Profile ${number}`
    setProfiles((current) => [...current, {
      id: crypto.randomUUID(), name, description: profileDescription(config),
      config: { ...structuredClone(config), serial: '' }, updatedAt: Date.now(),
    }])
    setToast(`${name} saved`)
  }

  async function exportProfiles() {
    try {
      const file = await api.exportProfiles(JSON.stringify({ format: 'pepperons-gui-profiles', version: 1, exportedAt: new Date().toISOString(), profiles }, null, 2))
      if (file) { addLog('success', `Profiles exported to ${file}`); setToast(`${profiles.length} profile${profiles.length === 1 ? '' : 's'} exported`) }
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : String(error))
      setToast('Export failed — see activity', 'error')
    }
  }

  async function importProfiles() {
    try {
      const raw = await api.importProfiles()
      if (raw === null) return
      const parsed: unknown = JSON.parse(raw)
      const incoming = parseProfiles(Array.isArray(parsed) ? parsed : (parsed as { profiles?: unknown } | null)?.profiles)
      if (!incoming.length) { setToast('No valid profiles were found in that file', 'error'); return }
      setProfiles((current) => mergeProfiles(current, incoming))
      setToast(`${incoming.length} profile${incoming.length === 1 ? '' : 's'} imported`)
    } catch (error) {
      addLog('error', `Profile import failed: ${error instanceof Error ? error.message : String(error)}`)
      setToast('That file is not a valid profile export', 'error')
    }
  }

  function renameProfile(id: string, name: string) {
    const clean = name.trim()
    if (!clean) { setToast('Profile name cannot be empty', 'error'); return false }
    if (clean.length > PROFILE_NAME_LIMIT) { setToast(`Profile names are limited to ${PROFILE_NAME_LIMIT} characters`, 'error'); return false }
    if (profiles.some((item) => item.id !== id && item.name.toLocaleLowerCase() === clean.toLocaleLowerCase())) {
      setToast('That profile name already exists', 'error')
      return false
    }
    setProfiles((current) => current.map((item) => item.id === id ? { ...item, name: clean, updatedAt: Date.now() } : item))
    setToast(`${clean} renamed`)
    return true
  }

  async function changeAppSetting(key: keyof AppSettings, value: boolean) {
    try {
      setAppSettings(await api.setAppSetting(key, value))
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : String(error))
      setToast('Could not change the tray setting — see activity', 'error')
    }
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
    '--fx': Math.max(0, Math.min(100, Number(theme.glow) || 0)) / 100,
  } as CSSProperties
  const appRoot = useRef<HTMLDivElement>(null)
  const animated = theme.motion !== 'off'
  useInteractiveSurfaces(appRoot, { spotlight: theme.spotlight, tilt: theme.tilt && animated, ripple: animated })

  const pageProps = { config, update, setConfig, addLog }
  useEffect(() => {
    const jump = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.shiftKey || event.metaKey || !/^[1-9]$/.test(event.key)) return
      event.preventDefault()
      setActiveNav(NAV_ITEMS[Number(event.key) - 1].id)
      setMobileNav(false)
    }
    window.addEventListener('keydown', jump)
    return () => window.removeEventListener('keydown', jump)
  }, [])
  const finishTour = useCallback(() => {
    try { localStorage.setItem(ONBOARDING_KEY, 'seen') } catch { /* Continue without persistence when storage is unavailable. */ }
    setTourOpen(false)
    // The tour walked through other pages; put the user back where they started it.
    setActiveNav(tourReturnNav.current)
  }, [])
  const playTour = useCallback(() => {
    tourReturnNav.current = activeNav
    setTourAutoPlay(true)
    setTourOpen(true)
  }, [activeNav])

  return (
    <div ref={appRoot} className={`app theme-${theme.mode} density-${theme.density} motion-${theme.motion} backdrop-${theme.backdrop} ${theme.pattern ? 'has-pattern' : ''} ${theme.tilt && animated ? 'fx-tilt' : ''} ${theme.spotlight ? 'fx-spotlight' : ''}`} style={style}>
      <Sidebar active={activeNav} open={mobileNav} commandCount={options.length} onSelect={activateNav} onClose={() => setMobileNav(false)} />
      <div className="app-shell">
        <TopBar
          devices={devices} selected={config.serial} onDevice={(serial) => update('serial', serial)}
          search={search} onSearch={(value) => { setSearch(value); if (value) { setActiveNav('options'); setOptionsCategory('All') } }}
          onMenu={() => setMobileNav((value) => !value)}
        />
        <RuntimeVersionContext.Provider value={runtime?.installedVersion || ''}><div className="canvas"><div className="backdrop" aria-hidden="true"><i /><i /><i /></div><main className="main-content">
          {activeNav === 'studio' && <StudioPage
            {...pageProps} runtime={runtime} devices={devices} device={selectedDevice} capabilities={capabilities} capabilitiesLoading={capabilitiesLoading} capabilitiesError={capabilitiesError} session={session} args={args}
            commandText={commandText} logs={logs} loading={loading} installing={installing} installProgress={installProgress}
            preset={preset} wifiAddress={wifiAddress} onWifiAddress={setWifiAddress} onConnect={connectWifi}
            onInstall={installRuntime} onChoose={chooseRuntime} onToggleSession={toggleSession} onCopy={copyCommand}
            onPreset={applyPreset} onNavigate={activateNav} onSaveProfile={saveProfile} onRefresh={refreshAll}
            onApplySuggestion={(suggestion) => { setConfig((current) => ({ ...current, ...suggestion.patch })); setToast(`${suggestion.title} applied`) }}
          />}
          {activeNav === 'video' && <VideoPage {...pageProps} capabilities={capabilities} hwdecAvailable={hwdecAvailable} />}
          {activeNav === 'audio' && <AudioPage {...pageProps} capabilities={capabilities} />}
          {activeNav === 'control' && <ControlPage {...pageProps} />}
          {activeNav === 'display' && <DisplayPage {...pageProps} />}
          {activeNav === 'recording' && <RecordingPage {...pageProps} />}
          {activeNav === 'options' && <OptionsPage
            options={options} config={config} setConfig={setConfig} search={search} onSearch={setSearch}
            category={optionsCategory} onCategory={setOptionsCategory} addLog={addLog}
          />}
          {activeNav === 'profiles' && <ProfilesPage profiles={profiles} config={config} onSave={saveProfile}
            onLoad={(profile) => { setConfig({ ...normalizeConfig(profile.config), serial: configRef.current.serial }); setToast(`${profile.name} loaded`) }}
            onRename={renameProfile} onExport={exportProfiles} onImport={importProfiles}
            onDelete={(id) => {
              const deleted = profiles.find((item) => item.id === id)
              setProfiles((current) => current.filter((item) => item.id !== id))
              setToast(deleted ? `${deleted.name} deleted` : 'Profile deleted')
            }} />}
          {activeNav === 'appearance' && <AppearancePage theme={theme} setTheme={setTheme} onReset={() => setTheme(DEFAULT_THEME)} appSettings={appSettings} onAppSetting={changeAppSetting} />}
          {activeNav === 'guide' && <QuickStarterGuide onNavigate={activateNav} onStartTour={playTour} />}
        </main></div></RuntimeVersionContext.Provider>
      </div>
      <FirstRunTour open={!showLoader && tourOpen} autoPlay={tourAutoPlay} onNavigate={setActiveNav} onFinish={finishTour} />
      {showLoader && <StartupLoader leaving={loaderLeaving} stages={[
        { label: 'Checking the scrcpy runtime', done: startupDone.runtime },
        { label: 'Looking for Android devices', done: startupDone.devices },
        { label: 'Restoring your session', done: startupDone.session },
      ]} />}
      <div className="toast-region" role="status" aria-live="polite">{toast && <div className={`toast ${toast.tone}`}>{toast.tone === 'error' ? <X size={16} /> : <Check size={16} />}{toast.text}</div>}</div>
    </div>
  )
}

function Sidebar({ active, open, commandCount, onSelect, onClose }: { active: NavId; open: boolean; commandCount: number; onSelect(id: NavId): void; onClose(): void }) {
  // Ctrl+1…9 jump straight to a page; the hint appears when a row is hovered or focused.
  const item = ({ id, label, icon: Icon }: (typeof NAV_ITEMS)[number]) => {
    const shortcut = NAV_ITEMS.findIndex((entry) => entry.id === id) + 1
    return <button key={id} className={active === id ? 'active' : ''} aria-current={active === id ? 'page' : undefined} aria-keyshortcuts={`Control+${shortcut}`} onClick={() => onSelect(id)}>
      <Icon size={18} /><span>{label}</span>{id === 'options' && commandCount > 0 && <em>{commandCount}</em>}<kbd aria-hidden="true">Ctrl {shortcut}</kbd>
    </button>
  }
  return <>
    {open && <button className="sidebar-scrim" onClick={onClose} aria-label="Close navigation" />}
    <aside className={`sidebar ${open ? 'is-open' : ''}`}>
      <div className="sidebar-brand">
        <BrandMark />
        <div><strong>Pepperon</strong><span>GUI</span></div>
      </div>
      <nav>
        <p className="nav-eyebrow">Configuration</p>
        {NAV_ITEMS.slice(0, 7).map(item)}
        <p className="nav-eyebrow">Workspace</p>
        {NAV_ITEMS.slice(7).map(item)}
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
