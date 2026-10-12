import { useState, type ReactNode } from 'react'
import { Activity, AudioLines, Check, CircleDot as Record, Command, Copy, Download, Gauge, ListFilter, Monitor, Play, RefreshCw, Save, SlidersHorizontal, Smartphone, Square, Terminal, Unplug, Usb, Video, Wifi, X } from 'lucide-react'
import { api } from '../api'
import { SuggestedSetups } from '../SuggestedSetups'
import type { SetupSuggestion } from '../suggestions.mjs'
import { isNewerVersion } from '../../electron/command-constraints.mjs'
import { BrandMark, type PageBaseProps, Spec, StatusTag, CapabilityState, SessionDuration, SectionCard, Field, Select, Switch, EmptyState, ShieldMark } from '../controls'
import { QUICK_PRESETS } from '../options'
import type { Device, DeviceCapabilities, LogEntry, NavId, RuntimeStatus, SessionState, StudioConfig } from '../types'

const DISMISSED_UPDATE_KEY = 'scrcpy-studio:dismissed-runtime-update'

export function StudioPage(props: PageBaseProps & {
  runtime: RuntimeStatus | null; devices: Device[]; device?: Device; capabilities: DeviceCapabilities | null; capabilitiesLoading: boolean; capabilitiesError: string; session: SessionState; args: string[]; commandText: string;
  logs: LogEntry[]; loading: boolean; installing: boolean; installProgress: { progress: number; message: string }; preset: string;
  wifiAddress: string; onWifiAddress(value: string): void; onConnect(): void; onInstall(): void; onChoose(): void;
  onToggleSession(): void; onCopy(): void; onPreset(name: string): void; onNavigate(id: NavId): void; onSaveProfile(): void; onRefresh(): void; onApplySuggestion(suggestion: SetupSuggestion): void
}) {
  const { config, update, runtime, devices, device, capabilities, capabilitiesLoading, capabilitiesError, session, args, commandText, logs, installing, installProgress, preset,
    wifiAddress, onWifiAddress, onConnect, onInstall, onChoose, onToggleSession, onCopy, onPreset, onNavigate, onSaveProfile, onRefresh, onApplySuggestion, addLog } = props
  const [pairCode, setPairCode] = useState('')
  const usableDevice = device?.state === 'device'
  const display = capabilities?.display
  const hardware = capabilities?.hardware
  const videoCodecs = capabilities?.video.codecs.length ? capabilities.video.codecs.map((codec) => codec.toUpperCase()).join(' / ') : 'Not reported'
  const resolution = display?.currentWidth && display.currentHeight ? `${display.currentWidth} × ${display.currentHeight}` : 'Unknown'
  const refreshRate = (value?: number) => value ? `${Math.round(value * 100) / 100} Hz` : 'Unknown'
  const stateLabel = session.status === 'live' ? 'MIRRORING' : session.status.replace('-', ' ').toUpperCase()
  const updateAvailable = Boolean(runtime && isNewerVersion(runtime.latestVersion, runtime.installedVersion))
  const managedRuntime = runtime?.source === 'managed'
  const [dismissedUpdate, setDismissedUpdate] = useState(() => { try { return localStorage.getItem(DISMISSED_UPDATE_KEY) || '' } catch { return '' } })
  const dismissUpdate = () => {
    const version = runtime?.latestVersion || ''
    try { localStorage.setItem(DISMISSED_UPDATE_KEY, version) } catch { /* The notice simply returns next launch. */ }
    setDismissedUpdate(version)
  }
  const deviceName = hardware?.model || device?.model || 'Your device'
  const headline = !runtime?.installed ? 'Install the scrcpy runtime to get started.'
    : session.status === 'live' ? `Mirroring ${deviceName}${session.recordingPath ? ' and recording' : ''}.`
    : session.status === 'error' ? 'The last session ended with an error. See Activity below.'
    : usableDevice ? `${deviceName} is connected and ready to mirror.`
    : device ? `${deviceName} is ${device.state}. Check the prompt on the phone.`
    : 'Connect an Android device by USB or Wi-Fi to begin.'
  async function deviceAction(action: string, payload: Record<string, unknown> = {}) {
    const result = await api.adbAction(action, { serial: config.serial, ...payload }).catch((error) => ({ code: 1, output: error.message }))
    addLog(result.code === 0 ? 'success' : 'error', result.output)
    if (result.code === 0) onRefresh()
  }
  return <div className="page studio-page professional-dashboard">
    <header className="dashboard-header" data-tilt="1">
      <div><span className="kicker">DEVICE CONTROL</span><h1>Pepperon GUI</h1><p>{headline}</p>
        <div className="hero-chips" aria-label="Current setup">
          <span className="hero-chip">{device?.connection === 'Wi-Fi' ? <Wifi /> : <Usb />}<strong>{device ? deviceName : 'No device'}</strong>{device && <>{device.connection}</>}</span>
          <button type="button" className="hero-chip" title="Open video settings" onClick={() => onNavigate('video')}><Video />{config.videoEnabled ? <><strong>{config.videoCodec.toUpperCase()}</strong>{config.maxSize ? `${config.maxSize}px` : 'Native'} · {config.maxFps || 'Unlimited'} fps · {config.videoBitRate}</> : <strong>Video off</strong>}</button>
          <button type="button" className="hero-chip" title="Open audio settings" onClick={() => onNavigate('audio')}><AudioLines />{config.audioEnabled && capabilities?.audio.forwardingSupported !== false ? <><strong>{config.audioCodec.toUpperCase()}</strong>{config.audioSource}</> : <strong>Audio off</strong>}</button>
          {config.recordingEnabled && <button type="button" className="hero-chip recording" title="Open recording settings" onClick={() => onNavigate('recording')}><Record /><strong>{session.running ? 'Recording' : 'Recording armed'}</strong>{config.recordFormat.toUpperCase()}</button>}
        </div></div>
      <div className="dashboard-header-actions">
        <span className={`session-status status-${session.status}`}><i />{stateLabel}</span>
        {session.status === 'error' && <button className="secondary retry-button" onClick={() => api.retry()}><RefreshCw size={15} />Retry</button>}
        <SessionButton session={session} disabled={!runtime?.installed || !usableDevice} onClick={onToggleSession} />
      </div>
    </header>

    {runtime?.installed && updateAvailable && dismissedUpdate !== runtime.latestVersion && <section className="runtime-setup-bar update">
      <div className="setup-icon"><Download size={19} /></div>
      <div><strong>Scrcpy {runtime.latestVersion} is available</strong><span>You have {runtime.installedVersion}. {!managedRuntime ? 'This copy was chosen manually, so update it outside the app.' : session.status !== 'offline' && session.status !== 'error' ? 'Stop mirroring to update.' : 'The update comes from the official release and is verified before it replaces the current runtime.'}</span></div>
      {managedRuntime && <button className="primary small" onClick={onInstall} disabled={installing || (session.status !== 'offline' && session.status !== 'error')}>{installing ? `${installProgress.progress}%` : 'Update runtime'}</button>}
      <button className="secondary" onClick={() => { api.openExternal(runtime.releaseUrl).catch(() => undefined) }}>Release notes</button>
      <button className="icon-button tiny" aria-label="Dismiss update notice" title="Not now" onClick={dismissUpdate}><X size={14} /></button>
      {installing && <div className="runtime-progress"><span style={{ width: `${installProgress.progress}%` }} /></div>}
    </section>}

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
          <div className="dense-specs"><Spec label="Serial" value={device.serial} mono /><Spec label="ABI" value={hardware?.abi || 'Unknown'} /><Spec label="Device ID" value={hardware?.device || device.product || 'Unknown'} /></div>
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
        <div className="capability-values"><strong>{config.videoEnabled ? `${config.videoCodec.toUpperCase()} · ${config.maxFps || 'Unlimited'} FPS` : 'Video disabled'}</strong><span>{config.videoEnabled ? videoCodecs : 'Audio-only or control-only session'}</span><div className="dense-specs columns"><Spec label="Bitrate" value={config.videoEnabled ? config.videoBitRate || 'Default' : '—'} /><Spec label="Max size" value={config.videoEnabled ? (config.maxSize ? `${config.maxSize}px` : 'Native') : '—'} /><Spec label="Encoder" value={config.videoEnabled ? (config.videoEncoder || 'Automatic') : '—'} /></div></div>
      </SectionCard>

      <SectionCard title="Audio" kicker="FORWARDING" icon={<AudioLines size={18} />} action={<button className="text-button" onClick={() => onNavigate('audio')}>Configure</button>}>
        <div className="capability-values"><strong>{!config.audioEnabled ? 'Disabled' : capabilities?.audio.forwardingSupported === false ? 'Unavailable' : `${config.audioCodec.toUpperCase()} · ${config.audioSource}`}</strong><span>{capabilities?.audio.supportMessage || 'Device audio support has not been inspected.'}</span><div className="dense-specs columns"><Spec label="Bitrate" value={config.audioBitRate || 'Default'} /><Spec label="Buffer" value={config.audioBuffer ? `${config.audioBuffer} ms` : 'Default'} /><Spec label="Encoder" value={config.audioEncoder || 'Automatic'} /></div></div>
      </SectionCard>

      <SectionCard title="Recording" kicker="OUTPUT" icon={<Record size={18} />} action={<button className="text-button" onClick={() => onNavigate('recording')}>Configure</button>}>
        <div className="recording-summary"><span className={config.recordingEnabled ? 'armed' : ''}><Record size={18} /></span><div><strong>{config.recordingEnabled ? session.running ? 'Recording active' : 'Recording armed' : 'Recording disabled'}</strong><small>{session.recordingPath || config.recordPath || 'No destination selected'}</small></div></div>
        <div className="dense-specs columns"><Spec label="Format" value={config.recordFormat.toUpperCase()} /><Spec label="Playback" value={config.noPlayback ? 'Disabled' : 'Enabled'} /><Spec label="Limit" value={config.timeLimit ? `${config.timeLimit}s` : 'None'} /></div>
      </SectionCard>
    </div>

    <SuggestedSetups config={config} capabilities={capabilities} device={device} loading={capabilitiesLoading} onApply={onApplySuggestion} />

    <div className="control-grid">
      <SectionCard title="Quick video" kicker="CONFIGURATION" icon={<Gauge size={18} />} action={<button className="icon-button tiny" onClick={onSaveProfile} title="Save current profile"><Save size={14} /></button>}>
        <div className="preset-compact">{QUICK_PRESETS.map((item) => <button className={preset === item.name ? 'active' : ''} key={item.name} onClick={() => onPreset(item.name)}>{item.label}</button>)}</div>
        <div className="field-grid triple"><Select label="Codec" value={config.videoCodec} onChange={(value) => update('videoCodec', value as StudioConfig['videoCodec'])} options={[['h264','H.264'],['h265','H.265'],['av1','AV1'],['vp8','VP8'],['vp9','VP9']]} /><Field flag="--max-fps" label="Max FPS" value={config.maxFps} onChange={(value) => update('maxFps', value)} /><Field flag="--video-bit-rate" label="Bitrate" value={config.videoBitRate} onChange={(value) => update('videoBitRate', value)} /></div>
      </SectionCard>

      <SectionCard title="Quick controls" kicker="MIRRORING + STARTUP" icon={<SlidersHorizontal size={18} />}>
        <div className="switch-grid"><Switch label="Clipboard sync" checked={config.clipboardSync} onChange={(value) => update('clipboardSync', value)} /><Switch label="Show touches" checked={config.showTouches} onChange={(value) => update('showTouches', value)} /><Switch label="Keep awake" checked={config.stayAwake} onChange={(value) => update('stayAwake', value)} /><Switch label="Physical screen off" checked={config.turnScreenOff} onChange={(value) => update('turnScreenOff', value)} /></div>
      </SectionCard>

      <SectionCard title="Connection" kicker="ADB" icon={device?.connection === 'Wi-Fi' ? <Wifi size={18} /> : <Usb size={18} />}>
        <div className="device-list compact-list">{devices.map((item) => <button key={item.serial} className={config.serial === item.serial ? 'selected' : ''} onClick={() => update('serial', item.serial)}><span className="device-icon"><Smartphone size={17} /></span><span><strong>{item.model}</strong><small>{item.serial}</small></span><StatusTag state={item.state} label={item.connection} /></button>)}</div>
        {!devices.length && <EmptyState icon={<Unplug />} title="No devices" text="Connect by USB or enter a Wi-Fi ADB address below." />}
        <div className="wifi-connect"><label><Wifi size={15} /><input aria-label="Wi-Fi ADB address" value={wifiAddress} onChange={(event) => onWifiAddress(event.target.value)} placeholder="IP:port" /></label><button onClick={onConnect}>Connect</button></div>
        <div className="pair-row"><input aria-label="Pairing code" value={pairCode} onChange={(event) => setPairCode(event.target.value)} placeholder="Pairing code" /><button onClick={() => deviceAction('pair', { address: wifiAddress, code: pairCode })} disabled={!wifiAddress || !pairCode}>Pair</button><button onClick={() => deviceAction('tcpip', { port: 5555 })} disabled={!usableDevice}>Enable TCP/IP</button>{device?.connection === 'Wi-Fi' && <button onClick={() => deviceAction('disconnect', { address: device.serial })}>Disconnect</button>}</div>
        <div className="automation-switches"><Switch label="Auto-start when a device connects" checked={config.autoStartOnConnect} onChange={(value) => update('autoStartOnConnect', value)} /><Switch label="Reconnect when selected device returns" checked={config.autoReconnect} onChange={(value) => update('autoReconnect', value)} /></div>
      </SectionCard>

      <SectionCard className="command-card" title="Command preview" kicker="LATEST DESIRED CONFIG" icon={<Terminal size={18} />} action={<button className="icon-button tiny" onClick={onCopy} title="Copy command" aria-label="Copy command"><Copy size={14} /></button>}>
        <div className="command-preview"><span className="prompt">$</span><code>{commandText}</code></div>
        <div className="command-stats"><span><Command size={13} />{args.length} active arguments</span><span><ShieldMark />argument-array execution</span>{runtime?.installedVersion && <span className="runtime-version"><Terminal size={13} />scrcpy {runtime.installedVersion}</span>}</div>
        <button className="full secondary" onClick={() => onNavigate('options')}><ListFilter size={16} />Open all commands</button>
      </SectionCard>
    </div>

    <div className="activity-wide"><ActivityFeed logs={logs} /></div>
  </div>
}

function ActivityFeed({ logs }: { logs: LogEntry[] }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const shown = (expanded ? logs : logs.slice(-5)).slice().reverse()
  async function copyLog() {
    await navigator.clipboard.writeText(logs.map((log) => `${log.time} [${log.level}] ${log.text}`).join('\n'))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }
  return <SectionCard title="Activity" kicker="SESSION LOG" icon={<Activity size={18} />} className="activity-card" action={<div className="activity-actions">
    <button className="text-button" onClick={copyLog}>{copied ? 'Copied' : 'Copy log'}</button>
    <button className="text-button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? 'Show recent' : `Show all (${logs.length})`}</button>
    <span className="live-indicator"><i /> listening</span></div>}>
    <div className={`activity-list ${expanded ? 'expanded' : ''}`}>{shown.map((log) => <div className={`activity-entry ${log.level}`} key={log.id}><span>{log.level === 'error' ? <X /> : log.level === 'command' ? <Terminal /> : <Check />}</span><div><small>{log.time}</small><p>{log.text}</p></div></div>)}</div>
  </SectionCard>
}

function SessionButton({ session, disabled, onClick, className = '' }: {
  session: SessionState; disabled: boolean; onClick(): void; className?: string
}) {
  const busy = ['starting', 'applying', 'restarting', 'reconnecting', 'stopping'].includes(session.status)
  const active = session.running || busy
  return <button type="button" className={`primary session-button ${active ? 'stop' : ''} ${className}`} onClick={onClick} disabled={disabled || session.status === 'stopping'}>
    {active ? <Square size={15} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
    {session.status === 'live' ? 'Stop Mirroring' : busy ? session.status.toUpperCase() : 'Start Mirroring'}
  </button>
}

function ConnectionVisual({ device, session, action }: { device?: Device; session: SessionState; action: ReactNode }) {
  const connected = device?.state === 'device'
  const syncing = ['starting', 'applying', 'restarting', 'reconnecting'].includes(session.status)
  const visualState = session.status === 'live' ? 'live' : syncing ? 'syncing' : session.status === 'error' ? 'error' : connected ? 'connected' : 'offline'
  const stateLabel = visualState === 'live' ? 'Mirroring active' : visualState === 'syncing' ? 'Establishing link' : visualState === 'error' ? 'Link interrupted' : connected ? 'Device connected' : 'Waiting for device'
  const detail = connected ? `${device?.model || 'Android'} · ${device?.connection || 'ADB'}` : 'Connect by USB or Wi-Fi ADB'
  return <SectionCard title="Device link" kicker="CONNECTION" icon={device?.connection === 'Wi-Fi' ? <Wifi size={18} /> : <Usb size={18} />} className={`connection-visual-card visual-${visualState}`}>
    <div className="connection-stage" data-tilt="16">
      <div className="connection-pattern" />
      <div className="connection-rings"><i /><i /><i /></div>
      <div className="connection-phone">
        <span className="connection-speaker" />
        <div className="connection-screen"><i className="screen-orbit one" /><i className="screen-orbit two" /><BrandMark /><span className="connection-scan" /></div>
        <span className="connection-home" />
      </div>
      <div className="connection-caption"><span className="connection-dot" /><div><strong>{stateLabel}</strong><small>{detail}</small></div></div>
      {action}
    </div>
  </SectionCard>
}
