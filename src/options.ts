import { categoryFor } from '../electron/device-parsers.mjs'
import { OPTION_NAMES, OPTIONAL_VALUE_OPTIONS, VALUE_OPTIONS } from '../electron/scrcpy-args.mjs'
import type { CliOption, StudioConfig, ThemeSettings } from './types'

export const DEFAULT_CONFIG: StudioConfig = {
  serial: '',
  videoEnabled: true,
  videoSource: 'display',
  videoCodec: 'h264',
  videoEncoder: '',
  videoBitRate: '8M',
  maxSize: '1920',
  maxFps: '60',
  videoBuffer: '0',
  crop: '',
  hwdec: 'auto',
  audioEnabled: true,
  audioCodec: 'opus',
  audioEncoder: '',
  audioSource: 'output',
  audioBitRate: '128K',
  audioBuffer: '50',
  audioDup: false,
  controlEnabled: true,
  keyboard: 'sdk',
  mouse: 'sdk',
  gamepad: 'disabled',
  clipboardSync: true,
  showTouches: false,
  stayAwake: true,
  turnScreenOff: false,
  powerOffOnClose: false,
  windowTitle: '',
  windowWidth: '',
  windowHeight: '',
  windowX: '',
  windowY: '',
  alwaysOnTop: false,
  borderless: false,
  fullscreen: false,
  disableScreensaver: true,
  recordingEnabled: false,
  recordPath: '',
  recordFormat: 'mp4',
  noPlayback: false,
  timeLimit: '',
  cameraId: '',
  cameraFacing: '',
  cameraSize: '',
  cameraFps: '30',
  cameraTorch: false,
  newDisplay: false,
  displayId: '0',
  displayOrientation: '0',
  newDisplaySize: '1920x1080',
  newDisplayDpi: '240',
  destroyDisplayContent: true,
  displayDecorations: true,
  autoStartOnConnect: false,
  autoReconnect: true,
  extras: {},
}

export const DEFAULT_THEME: ThemeSettings = {
  mode: 'dark',
  accent: '#9147ff',
  mint: '#a970ff',
  pink: '#bf94ff',
  surface: '#18181b',
  lightSurface: '#ffffff',
  radius: 10,
  density: 'compact',
  pattern: false,
  motion: 'full',
  backdrop: 'aurora',
  tilt: true,
  spotlight: true,
  glow: 60,
}

// One-click bundles for the Motion & effects settings.
export const EFFECT_PRESETS: Array<{ name: string; label: string; patch: Pick<ThemeSettings, 'motion' | 'backdrop' | 'tilt' | 'spotlight' | 'glow'> }> = [
  { name: 'minimal', label: 'Minimal', patch: { motion: 'off', backdrop: 'none', tilt: false, spotlight: false, glow: 0 } },
  { name: 'balanced', label: 'Balanced', patch: { motion: 'subtle', backdrop: 'static', tilt: true, spotlight: true, glow: 45 } },
  { name: 'showtime', label: 'Showtime', patch: { motion: 'full', backdrop: 'aurora', tilt: true, spotlight: true, glow: 85 } },
]

const VALUE_HINTS: Record<string, string> = {
  '--angle': 'degrees', '--audio-bit-rate': 'value', '--audio-buffer': 'ms', '--audio-codec': 'name',
  '--audio-codec-options': 'key:type=value', '--audio-encoder': 'name', '--audio-output-buffer': 'ms', '--audio-source': 'source',
  '--background-color': 'hexcolor', '--camera-ar': 'ratio', '--camera-facing': 'facing', '--camera-fps': 'fps',
  '--camera-id': 'id', '--camera-size': 'widthxheight', '--camera-zoom': 'zoom', '--capture-orientation': 'value',
  '--crop': 'width:height:x:y', '--display-id': 'id', '--display-ime-policy': 'value', '--display-orientation': 'value',
  '--gamepad': 'mode', '--hwdec': 'mode', '--keyboard': 'mode', '--max-fps': 'value', '--max-size': 'value',
  '--min-size-alignment': 'value', '--mouse': 'mode', '--mouse-bind': 'buttons', '--new-display': 'widthxheight/dpi',
  '--orientation': 'value', '--pause-on-exit': 'mode', '--port': 'port[:port]', '--push-target': 'path',
  '--record': 'file', '--record-format': 'format', '--record-orientation': 'value', '--render-driver': 'name',
  '--render-fit': 'mode', '--screen-off-timeout': 'seconds', '--serial': 'serial', '--shortcut-mod': 'key[+key]',
  '--start-app': 'name', '--tcpip': '[ip[:port]]', '--time-limit': 'seconds', '--tunnel-host': 'ip', '--tunnel-port': 'port',
  '--v4l2-buffer': 'ms', '--v4l2-sink': 'device', '--verbosity': 'level', '--video-bit-rate': 'value',
  '--video-buffer': 'ms', '--video-codec': 'name', '--video-codec-options': 'key:type=value', '--video-encoder': 'name',
  '--video-source': 'source', '--window-height': 'value', '--window-title': 'text', '--window-width': 'value',
  '--window-x': 'value', '--window-y': 'value',
}

const DESCRIPTIONS: Record<string, string> = {
  '--always-on-top': 'Keep the mirror above other windows.',
  '--max-size': 'Limit the video dimension while preserving aspect ratio.',
  '--max-fps': 'Limit the capture frame rate.',
  '--video-codec': 'Choose H.264, H.265, AV1, VP8, or VP9.',
  '--video-bit-rate': 'Set the encoded video bit rate.',
  '--audio-source': 'Choose device output, playback, microphone, or voice capture.',
  '--keyboard': 'Select SDK, UHID, AOA, or disabled keyboard injection.',
  '--mouse': 'Select SDK, UHID, AOA, or disabled mouse injection.',
  '--new-display': 'Create and mirror a new Android virtual display.',
  '--record': 'Record the mirrored session to a local media file.',
  '--start-app': 'Start an Android app by package name or friendly name.',
  '--ignore-video-encoder-constraints': 'Ignore reported encoder size constraints (added in v4.1).',
  '--hwdec': 'Decode video on the computer\'s GPU: auto, disabled, d3d11va (Windows), vaapi (Linux) or videotoolbox (macOS). Added in v5.0.',
}

// The catalog itself lives in electron/scrcpy-args.mjs, shared with main-process validation.
export const FALLBACK_OPTIONS: CliOption[] = OPTION_NAMES.map((name) => ({
  name,
  short: '',
  valueHint: VALUE_OPTIONS.has(name) ? VALUE_HINTS[name] || 'value' : '',
  kind: VALUE_OPTIONS.has(name) ? 'value' : 'boolean',
  optionalValue: OPTIONAL_VALUE_OPTIONS.has(name),
  category: categoryFor(name),
  description: DESCRIPTIONS[name] || `Pass ${name} directly to Scrcpy.`,
}))

const handledOptions = new Set([
  '--serial', '--no-video', '--video-source', '--video-codec', '--video-encoder', '--video-bit-rate', '--max-size', '--max-fps', '--video-buffer', '--crop', '--hwdec',
  '--no-audio', '--audio-codec', '--audio-source', '--audio-bit-rate', '--audio-buffer', '--audio-dup', '--no-control',
  '--audio-encoder', '--keyboard', '--mouse', '--gamepad', '--no-clipboard-autosync', '--show-touches', '--stay-awake', '--turn-screen-off',
  '--power-off-on-close', '--window-title', '--window-width', '--window-height', '--window-x', '--window-y', '--always-on-top', '--window-borderless', '--fullscreen', '--disable-screensaver',
  '--record', '--record-format', '--no-playback', '--time-limit', '--camera-id', '--camera-facing', '--camera-size', '--camera-fps',
  '--camera-torch', '--display-id', '--display-orientation', '--new-display', '--no-vd-destroy-content', '--no-vd-system-decorations',
])

export function isGuidedOption(name: string) {
  return handledOptions.has(name)
}

export const HWDEC_MODES = ['auto', 'disabled', 'd3d11va', 'vaapi', 'videotoolbox'] as const

export function buildArgs(config: StudioConfig): string[] {
  const args: string[] = []
  const value = (name: string, next: string) => { if (next.trim()) args.push(`${name}=${next.trim()}`) }
  const flag = (name: string, enabled: boolean) => { if (enabled) args.push(name) }

  const selectorOverride = config.extras['--select-usb'] === true
    || config.extras['--select-tcpip'] === true
    || (typeof config.extras['--tcpip'] === 'string' && Boolean(config.extras['--tcpip'].trim()))
  if (!selectorOverride) value('--serial', config.serial)
  if (!config.videoEnabled) flag('--no-video', true)
  else {
    value('--video-source', config.videoSource)
    value('--video-codec', config.videoCodec)
    value('--video-encoder', config.videoEncoder)
    value('--video-bit-rate', config.videoBitRate)
    value('--max-size', config.maxSize)
    value('--max-fps', config.maxFps)
    if (config.videoBuffer !== '0') value('--video-buffer', config.videoBuffer)
    value('--crop', config.crop)
    // Automatic is scrcpy's own default, and older runtimes do not know the flag at all.
    if (config.hwdec && config.hwdec !== 'auto') value('--hwdec', config.hwdec)
  }

  if (!config.audioEnabled) flag('--no-audio', true)
  else {
    value('--audio-codec', config.audioCodec)
    value('--audio-encoder', config.audioEncoder)
    value('--audio-source', config.audioSource)
    value('--audio-bit-rate', config.audioBitRate)
    value('--audio-buffer', config.audioBuffer)
    flag('--audio-dup', config.audioDup && config.audioSource === 'playback')
  }

  if (!config.controlEnabled) flag('--no-control', true)
  else {
    value('--keyboard', config.keyboard)
    value('--mouse', config.mouse)
    value('--gamepad', config.gamepad)
    flag('--no-clipboard-autosync', !config.clipboardSync)
    flag('--show-touches', config.showTouches)
    flag('--stay-awake', config.stayAwake)
    flag('--turn-screen-off', config.turnScreenOff)
    flag('--power-off-on-close', config.powerOffOnClose)
  }

  value('--window-title', config.windowTitle)
  value('--window-width', config.windowWidth)
  value('--window-height', config.windowHeight)
  value('--window-x', config.windowX)
  value('--window-y', config.windowY)
  flag('--always-on-top', config.alwaysOnTop)
  flag('--window-borderless', config.borderless)
  flag('--fullscreen', config.fullscreen)
  flag('--disable-screensaver', config.disableScreensaver)

  if (config.recordingEnabled && config.recordPath) {
    value('--record', config.recordPath)
    value('--record-format', config.recordFormat)
  }
  flag('--no-playback', config.noPlayback)
  value('--time-limit', config.timeLimit)

  if (config.videoEnabled && config.videoSource === 'camera') {
    value('--camera-id', config.cameraId)
    value('--camera-facing', config.cameraFacing)
    value('--camera-size', config.cameraSize)
    value('--camera-fps', config.cameraFps)
    flag('--camera-torch', config.cameraTorch)
  }

  if (!config.videoEnabled) {
    // Display selection and virtual-display flags only affect video capture.
  } else if (config.newDisplay) {
    const display = config.newDisplaySize
      ? `${config.newDisplaySize}${config.newDisplayDpi ? `/${config.newDisplayDpi}` : ''}`
      : config.newDisplayDpi ? `/${config.newDisplayDpi}` : ''
    if (display) value('--new-display', display)
    else flag('--new-display', true)
    flag('--no-vd-destroy-content', !config.destroyDisplayContent)
    flag('--no-vd-system-decorations', !config.displayDecorations)
  } else {
    value('--display-id', config.displayId === '0' ? '' : config.displayId)
  }
  value('--display-orientation', config.displayOrientation === '0' ? '' : config.displayOrientation)

  for (const [name, extraValue] of Object.entries(config.extras)) {
    if (handledOptions.has(name)) continue
    if (extraValue === true) args.push(name)
    else if (typeof extraValue === 'string' && extraValue.trim()) args.push(`${name}=${extraValue.trim()}`)
  }
  return args
}

export function getGuidedOptionValue(config: StudioConfig, name: string): boolean | string | undefined {
  const values: Record<string, boolean | string> = {
    '--serial': config.serial, '--no-video': !config.videoEnabled, '--video-source': config.videoSource, '--video-codec': config.videoCodec,
    '--video-encoder': config.videoEncoder, '--video-bit-rate': config.videoBitRate, '--max-size': config.maxSize,
    '--max-fps': config.maxFps, '--video-buffer': config.videoBuffer, '--crop': config.crop, '--hwdec': config.hwdec === 'auto' ? '' : config.hwdec,
    '--no-audio': !config.audioEnabled, '--audio-codec': config.audioCodec, '--audio-encoder': config.audioEncoder,
    '--audio-source': config.audioSource, '--audio-bit-rate': config.audioBitRate, '--audio-buffer': config.audioBuffer,
    '--audio-dup': config.audioDup, '--no-control': !config.controlEnabled, '--keyboard': config.keyboard,
    '--mouse': config.mouse, '--gamepad': config.gamepad, '--no-clipboard-autosync': !config.clipboardSync,
    '--show-touches': config.showTouches, '--stay-awake': config.stayAwake, '--turn-screen-off': config.turnScreenOff,
    '--power-off-on-close': config.powerOffOnClose, '--window-title': config.windowTitle, '--window-width': config.windowWidth,
    '--window-height': config.windowHeight, '--window-x': config.windowX, '--window-y': config.windowY,
    '--always-on-top': config.alwaysOnTop, '--window-borderless': config.borderless, '--fullscreen': config.fullscreen,
    '--disable-screensaver': config.disableScreensaver, '--record': config.recordPath, '--record-format': config.recordFormat,
    '--no-playback': config.noPlayback, '--time-limit': config.timeLimit, '--camera-id': config.cameraId,
    '--camera-facing': config.cameraFacing, '--camera-size': config.cameraSize, '--camera-fps': config.cameraFps,
    '--camera-torch': config.cameraTorch, '--display-id': config.displayId, '--display-orientation': config.displayOrientation,
    '--new-display': config.newDisplay
      ? config.newDisplaySize ? `${config.newDisplaySize}${config.newDisplayDpi ? `/${config.newDisplayDpi}` : ''}` : config.newDisplayDpi ? `/${config.newDisplayDpi}` : true
      : '',
    '--no-vd-destroy-content': !config.destroyDisplayContent, '--no-vd-system-decorations': !config.displayDecorations,
  }
  return handledOptions.has(name) ? values[name] : undefined
}

export function applyGuidedOptionValue(config: StudioConfig, name: string, next: boolean | string): StudioConfig | null {
  const text = typeof next === 'string' ? next : ''
  const bool = next === true
  const patch: Partial<StudioConfig> = {}
  switch (name) {
    case '--serial': patch.serial = text; break
    case '--no-video': patch.videoEnabled = !bool; break
    case '--video-source': patch.videoSource = text as StudioConfig['videoSource']; break
    case '--video-codec': patch.videoCodec = text as StudioConfig['videoCodec']; break
    case '--video-encoder': patch.videoEncoder = text; break
    case '--video-bit-rate': patch.videoBitRate = text; break
    case '--max-size': patch.maxSize = text; break
    case '--max-fps': patch.maxFps = text; break
    case '--video-buffer': patch.videoBuffer = text; break
    case '--crop': patch.crop = text; break
    case '--hwdec': patch.hwdec = (HWDEC_MODES as readonly string[]).includes(text) ? text as StudioConfig['hwdec'] : 'auto'; break
    case '--no-audio': patch.audioEnabled = !bool; break
    case '--audio-codec': patch.audioCodec = text as StudioConfig['audioCodec']; break
    case '--audio-encoder': patch.audioEncoder = text; break
    case '--audio-source': patch.audioSource = text; break
    case '--audio-bit-rate': patch.audioBitRate = text; break
    case '--audio-buffer': patch.audioBuffer = text; break
    case '--audio-dup': patch.audioDup = bool; break
    case '--no-control': patch.controlEnabled = !bool; break
    case '--keyboard': patch.keyboard = text as StudioConfig['keyboard']; break
    case '--mouse': patch.mouse = text as StudioConfig['mouse']; break
    case '--gamepad': patch.gamepad = text as StudioConfig['gamepad']; break
    case '--no-clipboard-autosync': patch.clipboardSync = !bool; break
    case '--show-touches': patch.showTouches = bool; break
    case '--stay-awake': patch.stayAwake = bool; break
    case '--turn-screen-off': patch.turnScreenOff = bool; break
    case '--power-off-on-close': patch.powerOffOnClose = bool; break
    case '--window-title': patch.windowTitle = text; break
    case '--window-width': patch.windowWidth = text; break
    case '--window-height': patch.windowHeight = text; break
    case '--window-x': patch.windowX = text; break
    case '--window-y': patch.windowY = text; break
    case '--always-on-top': patch.alwaysOnTop = bool; break
    case '--window-borderless': patch.borderless = bool; break
    case '--fullscreen': patch.fullscreen = bool; break
    case '--disable-screensaver': patch.disableScreensaver = bool; break
    case '--record': patch.recordPath = text; patch.recordingEnabled = Boolean(text); break
    case '--record-format': patch.recordFormat = text as StudioConfig['recordFormat']; break
    case '--no-playback': patch.noPlayback = bool; break
    case '--time-limit': patch.timeLimit = text; break
    case '--camera-id': patch.cameraId = text; break
    case '--camera-facing': patch.cameraFacing = text as StudioConfig['cameraFacing']; break
    case '--camera-size': patch.cameraSize = text; break
    case '--camera-fps': patch.cameraFps = text; break
    case '--camera-torch': patch.cameraTorch = bool; break
    case '--display-id': patch.displayId = text; break
    case '--display-orientation': patch.displayOrientation = text; break
    case '--new-display': {
      if (next === true) { patch.newDisplay = true; patch.newDisplaySize = ''; patch.newDisplayDpi = ''; break }
      const [size, dpi = ''] = text.split('/')
      patch.newDisplay = Boolean(text); patch.newDisplaySize = size; patch.newDisplayDpi = dpi; break
    }
    case '--no-vd-destroy-content': patch.destroyDisplayContent = !bool; break
    case '--no-vd-system-decorations': patch.displayDecorations = !bool; break
    default: return null
  }
  return { ...config, ...patch }
}

export const LIVE_ADB_CONFIG_KEYS: Array<keyof StudioConfig> = ['showTouches', 'stayAwake', 'turnScreenOff']

export const QUICK_PRESETS: Array<{ name: string; label: string; description: string; patch: Partial<StudioConfig> }> = [
  { name: 'balanced', label: 'Balanced', description: '1080p · 60 fps · 8 Mbps', patch: { videoEnabled: true, maxSize: '1920', maxFps: '60', videoBitRate: '8M', videoCodec: 'h264', videoBuffer: '0' } },
  { name: 'quality', label: 'Studio', description: '1440p · 60 fps · 16 Mbps', patch: { videoEnabled: true, maxSize: '2560', maxFps: '60', videoBitRate: '16M', videoCodec: 'h265', videoBuffer: '20' } },
  { name: 'latency', label: 'Low latency', description: '720p · 90 fps · 6 Mbps', patch: { videoEnabled: true, maxSize: '1280', maxFps: '90', videoBitRate: '6M', videoCodec: 'h264', videoBuffer: '0', audioBuffer: '20' } },
  { name: 'wireless', label: 'Wireless', description: '720p · 45 fps · 4 Mbps', patch: { videoEnabled: true, maxSize: '1280', maxFps: '45', videoBitRate: '4M', videoCodec: 'h264', videoBuffer: '50' } },
]
