export type NavId = 'studio' | 'video' | 'audio' | 'control' | 'display' | 'recording' | 'options' | 'profiles' | 'appearance' | 'guide'

export interface CliOption {
  constraints?: import('../electron/command-constraints.mjs').CliConstraints
  name: string
  short?: string
  valueHint: string
  kind: 'boolean' | 'value'
  optionalValue?: boolean
  category: string
  description: string
  runtimeAvailable?: boolean
  source?: 'runtime' | 'fallback'
}

export interface RuntimeStatus {
  installed: boolean
  installedVersion: string
  latestVersion: string
  releaseUrl: string
  source: string
  path: string
  options: CliOption[]
}

export interface Device {
  serial: string
  state: string
  model: string
  product: string
  transportId: string
  connection: 'USB' | 'Wi-Fi'
  usable?: boolean
}

export type SessionStatus = 'offline' | 'starting' | 'live' | 'applying' | 'restarting' | 'reconnecting' | 'stopping' | 'disconnected' | 'error'

export interface SessionState {
  running: boolean
  status: SessionStatus
  pid?: number
  startedAt?: number
  stoppedAt?: number
  code?: number | null
  error?: string
  generation?: number
  desiredArgs?: string[]
  appliedArgs?: string[]
  activeSerial?: string
  recordingPath?: string
  reason?: string
}

export interface DeviceHardwareInfo {
  manufacturer?: string
  model?: string
  product?: string
  device?: string
  abi?: string
  androidVersion?: string
  sdk?: number
  buildId?: string
}

export interface DisplayMode {
  id?: number
  width?: number
  height?: number
  refreshRate?: number
}

export interface DisplayCapabilities {
  physicalWidth?: number
  physicalHeight?: number
  currentWidth?: number
  currentHeight?: number
  densityDpi?: number
  currentRefreshRate?: number
  supportedRefreshRates: number[]
  maxRefreshRate?: number
  orientation?: string
  displayIds: number[]
  modes: DisplayMode[]
}

export interface MediaEncoder {
  codec: string
  name: string
}

export interface VideoCapabilities {
  codecs: string[]
  encoders: MediaEncoder[]
  reported: boolean
}

export interface AudioCapabilities {
  forwardingSupported?: boolean
  supportMessage: string
  codecs: string[]
  encoders: MediaEncoder[]
  reported: boolean
}

export interface CameraInfo {
  id: string
  facing?: 'front' | 'back' | 'external' | 'unknown'
  sizes: string[]
  frameRates: number[]
  highSpeed?: boolean
  torchSupported?: boolean
}

export interface CameraCapabilities {
  reported: boolean
  cameras: CameraInfo[]
  message: string
}

export interface DeviceCapabilities {
  serial: string
  capturedAt: number
  cacheKey: string
  hardware: DeviceHardwareInfo
  display: DisplayCapabilities
  video: VideoCapabilities
  audio: AudioCapabilities
  camera: CameraCapabilities
  warnings: string[]
}

export type LiveSettingKey = 'showTouches' | 'stayAwake' | 'screenPower'

export interface LiveSettingChange {
  key: LiveSettingKey
  value: boolean
}

export interface ApplyConfigurationRequest {
  args: string[]
  liveChanges?: LiveSettingChange[]
  reason?: string
  autoReconnect?: boolean
}

export interface ApplyConfigResult {
  accepted: boolean
  generation: number
  restartScheduled: boolean
  state: SessionState
}

export interface LogEntry {
  id: number
  time: string
  level: 'info' | 'error' | 'command' | 'success'
  text: string
}

export interface StudioConfig {
  serial: string
  videoEnabled: boolean
  videoSource: 'display' | 'camera'
  videoCodec: 'h264' | 'h265' | 'av1' | 'vp8' | 'vp9'
  videoEncoder: string
  videoBitRate: string
  maxSize: string
  maxFps: string
  videoBuffer: string
  crop: string
  audioEnabled: boolean
  audioCodec: 'opus' | 'aac' | 'flac' | 'raw'
  audioEncoder: string
  audioSource: string
  audioBitRate: string
  audioBuffer: string
  audioDup: boolean
  controlEnabled: boolean
  keyboard: 'sdk' | 'uhid' | 'aoa' | 'disabled'
  mouse: 'sdk' | 'uhid' | 'aoa' | 'disabled'
  gamepad: 'disabled' | 'uhid' | 'aoa'
  clipboardSync: boolean
  showTouches: boolean
  stayAwake: boolean
  turnScreenOff: boolean
  powerOffOnClose: boolean
  windowTitle: string
  windowWidth: string
  windowHeight: string
  windowX: string
  windowY: string
  alwaysOnTop: boolean
  borderless: boolean
  fullscreen: boolean
  disableScreensaver: boolean
  recordingEnabled: boolean
  recordPath: string
  recordFormat: 'mp4' | 'mkv' | 'm4a' | 'mka' | 'opus' | 'aac' | 'flac' | 'wav'
  noPlayback: boolean
  timeLimit: string
  cameraId: string
  cameraFacing: 'front' | 'back' | 'external' | ''
  cameraSize: string
  cameraFps: string
  cameraTorch: boolean
  newDisplay: boolean
  displayId: string
  displayOrientation: string
  newDisplaySize: string
  newDisplayDpi: string
  destroyDisplayContent: boolean
  displayDecorations: boolean
  autoStartOnConnect: boolean
  autoReconnect: boolean
  extras: Record<string, boolean | string>
}

export interface ThemeSettings {
  mode: 'dark' | 'light'
  accent: string
  mint: string
  pink: string
  surface: string
  lightSurface: string
  radius: number
  density: 'cozy' | 'compact'
  pattern: boolean
}

export interface SavedProfile {
  id: string
  name: string
  description: string
  config: StudioConfig
  updatedAt: number
}

export interface StudioApi {
  getWindowState(): Promise<{ maximized: boolean }>
  windowAction(action: 'minimize' | 'toggle-maximize' | 'close'): Promise<void>
  onWindowState(callback: (state: { maximized: boolean }) => void): () => void
  getRuntimeStatus(): Promise<RuntimeStatus>
  chooseRuntime(): Promise<RuntimeStatus | null>
  installRuntime(): Promise<RuntimeStatus>
  listDevices(): Promise<Device[]>
  getDeviceCapabilities(serial: string, force?: boolean): Promise<DeviceCapabilities>
  start(request: ApplyConfigurationRequest): Promise<SessionState>
  applyConfig(request: ApplyConfigurationRequest): Promise<ApplyConfigResult>
  stop(): Promise<SessionState>
  retry(): Promise<SessionState>
  getSessionState(): Promise<SessionState>
  validateArgs(args: string[]): Promise<{ valid: true; args: string[] }>
  reportDevicePresence(serial: string, present: boolean): Promise<SessionState>
  runScrcpyAction(args: string[]): Promise<{ code: number; output: string }>
  adbAction(action: string, payload: Record<string, unknown>): Promise<{ code: number; output: string }>
  chooseRecordingPath(format: string): Promise<string>
  openExternal(url: string): Promise<boolean>
  onLog(callback: (payload: Omit<LogEntry, 'id' | 'time'>) => void): () => void
  onState(callback: (payload: SessionState) => void): () => void
  onInstallProgress(callback: (payload: { progress: number; message: string }) => void): () => void
}

declare global {
  interface Window {
    scrcpyStudio?: StudioApi
  }
}
