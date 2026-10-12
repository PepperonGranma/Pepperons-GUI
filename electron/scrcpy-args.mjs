// scrcpy argument catalog and validation. Keep this dependency-free module shared
// by the Electron main process (the authority) and the renderer (inline feedback).
import { constraintsFor, validateConstraint } from './command-constraints.mjs'

export const VALUE_OPTIONS = new Set(`--angle --audio-bit-rate --audio-buffer --audio-codec --audio-codec-options --audio-encoder --audio-output-buffer --audio-source --background-color --camera-ar --camera-facing --camera-fps --camera-id --camera-size --camera-zoom --capture-orientation --crop --display-id --display-ime-policy --display-orientation --gamepad --hwdec --keyboard --max-fps --max-size --min-size-alignment --mouse --mouse-bind --new-display --orientation --pause-on-exit --port --push-target --record --record-format --record-orientation --render-driver --render-fit --screen-off-timeout --serial --shortcut-mod --start-app --tcpip --time-limit --tunnel-host --tunnel-port --v4l2-buffer --v4l2-sink --verbosity --video-bit-rate --video-buffer --video-codec --video-codec-options --video-encoder --video-source --window-height --window-title --window-width --window-x --window-y`.split(' '))
export const OPTIONAL_VALUE_OPTIONS = new Set(['--new-display', '--pause-on-exit', '--tcpip'])
export const BOOLEAN_OPTIONS = new Set(`--always-on-top --audio-dup --camera-high-speed --camera-torch --disable-screensaver --flex-display --force-adb-forward --fullscreen --ignore-video-encoder-constraints --keep-active --kill-adb-on-close --legacy-paste --list-apps --list-camera-sizes --list-cameras --list-displays --list-encoders --no-audio --no-audio-playback --no-cleanup --no-clipboard-autosync --no-control --no-downsize-on-error --no-key-repeat --no-mipmaps --no-mouse-hover --no-playback --no-power-on --no-terminal-title --no-vd-destroy-content --no-vd-system-decorations --no-video --no-video-playback --no-window --no-window-aspect-ratio-lock --otg --power-off-on-close --prefer-text --print-fps --raw-key-events --require-audio --select-tcpip --select-usb --show-touches --stay-awake --turn-screen-off --window-borderless`.split(' '))
export const OPTION_NAMES = [...VALUE_OPTIONS, ...BOOLEAN_OPTIONS].sort()

export const ENUM_VALUES = {
  '--audio-codec': ['opus', 'aac', 'flac', 'raw'],
  '--audio-source': ['output', 'playback', 'mic', 'mic-unprocessed', 'mic-camcorder', 'mic-voice-recognition', 'mic-voice-communication', 'voice-call', 'voice-call-uplink', 'voice-call-downlink', 'voice-performance'],
  '--camera-facing': ['front', 'back', 'external'],
  '--display-ime-policy': ['local', 'fallback', 'hide'],
  '--gamepad': ['disabled', 'uhid', 'aoa'],
  // Added in scrcpy 5.0. vaapi, d3d11va and videotoolbox each exist on one platform only.
  '--hwdec': ['auto', 'disabled', 'vaapi', 'd3d11va', 'videotoolbox'],
  '--keyboard': ['disabled', 'sdk', 'uhid', 'aoa'],
  '--mouse': ['disabled', 'sdk', 'uhid', 'aoa'],
  '--pause-on-exit': ['true', 'false', 'if-error'],
  '--record-format': ['mp4', 'mkv', 'm4a', 'mka', 'opus', 'aac', 'flac', 'wav'],
  '--render-driver': ['direct3d', 'opengl', 'opengles2', 'opengles', 'metal', 'software'],
  '--render-fit': ['letterbox', 'stretched', 'unscaled'],
  '--verbosity': ['verbose', 'debug', 'info', 'warn', 'error'],
  '--video-codec': ['h264', 'h265', 'av1', 'vp8', 'vp9'],
  '--video-source': ['display', 'camera'],
}

const SHORTCUT_MODIFIER = '(?:lctrl|rctrl|lalt|ralt|lsuper|rsuper)'
const SHORTCUT_MOD_EXPRESSION = new RegExp(`^${SHORTCUT_MODIFIER}(?:\\+${SHORTCUT_MODIFIER})*(?:,${SHORTCUT_MODIFIER}(?:\\+${SHORTCUT_MODIFIER})*)*$`)

// Syntax rules for one option value. Returns an error message, or '' when the
// value is acceptable. Never clamps, normalizes or rewrites the input.
export function validateOptionValue(name, value, runtimeVersion = '') {
  if (typeof value !== 'string') return `${name} requires a value.`
  const choices = ENUM_VALUES[name]
  if (choices && !choices.includes(value)) return `${name} must be one of: ${choices.join(', ')}.`
  const constraintError = validateConstraint(value, constraintsFor(name, runtimeVersion))
  if (constraintError) return `${name}: ${constraintError}`
  switch (name) {
    // These strings are forwarded to Android, not range-checked by scrcpy's CLI.
    // Retain basic numeric syntax validation without inventing upper/lower bounds.
    case '--angle': case '--max-fps': case '--camera-zoom':
      return Number.isFinite(Number(value)) ? '' : `${name} must be a finite number.`
    case '--background-color':
      return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value) ? '' : '--background-color must use #RGB or #RRGGBB.'
    case '--camera-ar':
      return value === 'sensor' || (/^(?:\d+(?:\.\d+)?|\d+:\d+)$/.test(value) && value.split(':').every((part) => Number(part) > 0)) ? '' : '--camera-ar must be sensor, a positive decimal, or num:den.'
    case '--camera-size':
      return /^\d+x\d+$/.test(value) && value.split('x').every((part) => Number(part) > 0) ? '' : '--camera-size must use positive widthxheight values.'
    case '--crop':
      return /^\d+:\d+:\d+:\d+$/.test(value) && value.split(':').slice(0, 2).every((part) => Number(part) > 0) ? '' : '--crop must use positive width:height and non-negative x:y values.'
    case '--new-display':
      return /^(?:\d+x\d+)?(?:\/\d+)?$/.test(value) && value.split(/[x/]/).filter(Boolean).every((part) => Number(part) > 0) ? '' : '--new-display must use positive widthxheight, widthxheight/dpi, /dpi, or no value.'
    case '--mouse-bind':
      return /^[+\-bhsn]{4}(?::[+\-bhsn]{4})?$/.test(value) ? '' : '--mouse-bind requires one or two four-character button maps.'
    case '--shortcut-mod':
      return SHORTCUT_MOD_EXPRESSION.test(value) ? '' : '--shortcut-mod contains an unsupported modifier expression.'
    case '--tcpip': {
      const port = value.match(/:(\d+)$/)?.[1]
      return /\s/.test(value) || value === '+' || (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) ? '--tcpip must use [+]ip[:port] with a valid port.' : ''
    }
    default:
      return ''
  }
}

// Validates a complete argument array and returns a copy. Throws on the first problem.
export function validateArgs(args, runtimeVersion = '') {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string' || arg.length > 2048 || /[\0\r\n]/.test(arg))) {
    throw new Error('Invalid Scrcpy arguments.')
  }
  if (args.join('').length > 32768) throw new Error('The generated command is too long.')
  const entries = args.map((arg) => {
    const separator = arg.indexOf('=')
    return { arg, name: separator < 0 ? arg : arg.slice(0, separator), value: separator < 0 ? undefined : arg.slice(separator + 1) }
  })
  if (entries.some(({ name }) => !/^--[a-z0-9][a-z0-9-]*$/.test(name))) throw new Error('Only long-form Scrcpy options are accepted.')
  const duplicate = entries.find((entry, index) => entries.findIndex((candidate) => candidate.name === entry.name) !== index)
  if (duplicate) throw new Error(`${duplicate.name} was provided more than once.`)
  if (entries.some(({ value }) => value === '')) throw new Error('Empty option values are not valid. Clear the option or enable an optional-value flag without a value.')
  const missingValue = entries.find(({ name, value }) => VALUE_OPTIONS.has(name) && value === undefined && !OPTIONAL_VALUE_OPTIONS.has(name))
  if (missingValue) throw new Error(`${missingValue.name} requires a value.`)
  const booleanWithValue = entries.find(({ name, value }) => BOOLEAN_OPTIONS.has(name) && value !== undefined)
  if (booleanWithValue) throw new Error(`${booleanWithValue.name} is a boolean flag and does not accept a value.`)
  for (const { name, value } of entries) {
    if (value === undefined) continue
    const error = validateOptionValue(name, value, runtimeVersion)
    if (error) throw new Error(error)
  }
  const valueFor = (name) => entries.find((entry) => entry.name === name)?.value
  const has = (name) => entries.some((entry) => entry.name === name)
  if (has('--no-control')) {
    const incompatible = ['--show-touches', '--stay-awake', '--turn-screen-off', '--power-off-on-close', '--keyboard', '--mouse', '--gamepad'].filter(has)
    if (incompatible.length) throw new Error(`${incompatible.join(', ')} require Scrcpy device control. Use the in-session ADB controls instead.`)
  }
  const selectors = args.filter((arg) => arg === '--serial' || arg.startsWith('--serial=') || arg === '--select-usb' || arg === '--select-tcpip' || arg.startsWith('--tcpip='))
  if (selectors.length > 1) throw new Error(`Choose only one Scrcpy device selector: ${selectors.join(', ')}.`)
  if (has('--audio-dup') && valueFor('--audio-source') !== 'playback') throw new Error('--audio-dup requires --audio-source=playback.')
  const audioConfiguration = ['--audio-bit-rate', '--audio-buffer', '--audio-codec', '--audio-codec-options', '--audio-dup', '--audio-encoder', '--audio-output-buffer', '--audio-source', '--require-audio'].filter(has)
  if (has('--no-audio') && audioConfiguration.length) throw new Error(`${audioConfiguration.join(', ')} cannot be combined with --no-audio.`)
  const videoConfiguration = ['--video-bit-rate', '--video-buffer', '--video-codec', '--video-codec-options', '--video-encoder', '--video-source', '--max-fps', '--max-size', '--crop', '--camera-ar', '--camera-facing', '--camera-fps', '--camera-high-speed', '--camera-id', '--camera-size', '--camera-torch', '--camera-zoom', '--display-id', '--new-display'].filter(has)
  if (has('--no-video') && videoConfiguration.length) throw new Error(`${videoConfiguration.join(', ')} cannot be combined with --no-video.`)
  if (has('--camera-id') && has('--camera-facing')) throw new Error('Choose either --camera-id or --camera-facing, not both.')
  const cameraOnly = ['--camera-ar', '--camera-facing', '--camera-fps', '--camera-high-speed', '--camera-id', '--camera-size', '--camera-torch', '--camera-zoom'].filter(has)
  if (cameraOnly.length && valueFor('--video-source') !== 'camera') throw new Error(`${cameraOnly.join(', ')} require --video-source=camera.`)
  const displayOnly = ['--display-id', '--new-display'].filter(has)
  if (valueFor('--video-source') === 'camera' && displayOnly.length) throw new Error(`${displayOnly.join(', ')} cannot be combined with --video-source=camera.`)
  if (has('--display-id') && has('--new-display')) throw new Error('--display-id cannot be combined with --new-display.')
  // scrcpy 5.0: a specific hardware decoder needs on-screen video playback and no V4L2 sink.
  const hwdec = valueFor('--hwdec')
  if (hwdec && hwdec !== 'auto' && hwdec !== 'disabled') {
    const noPlayback = ['--no-video', '--no-playback', '--no-video-playback', '--no-window'].filter(has)
    if (noPlayback.length) throw new Error(`--hwdec=${hwdec} requires video playback and cannot be combined with ${noPlayback.join(', ')}.`)
    if (has('--v4l2-sink')) throw new Error(`--hwdec=${hwdec} is not compatible with --v4l2-sink.`)
  }
  if (has('--record-format') && !has('--record')) throw new Error('--record-format requires --record.')
  if (has('--no-playback') && !has('--record') && !has('--v4l2-sink')) throw new Error('--no-playback requires --record or --v4l2-sink so the captured media has an output.')
  return [...args]
}

export function serialFromArgs(args) {
  const direct = args.find((arg) => arg.startsWith('--serial='))
  return direct ? direct.slice('--serial='.length) : ''
}

// AOA input opens the phone's USB interface directly. Windows allows only one
// process to hold it, and this app keeps adb connected to list and inspect devices,
// so scrcpy always fails with "not possible to open a USB device already open by
// another process (like adb)". Returns the options that select AOA, if any.
export function aoaInputOptions(args) {
  return ['--keyboard', '--mouse', '--gamepad'].filter((name) => args.includes(`${name}=aoa`))
}

// Each named hardware decoder is compiled into scrcpy for one platform only.
const HWDEC_PLATFORMS = { d3d11va: 'win32', vaapi: 'linux', videotoolbox: 'darwin' }
const PLATFORM_NAMES = { win32: 'Windows', linux: 'Linux', darwin: 'macOS' }

// Returns why this argument array cannot run on `platform` (a Node process.platform
// value), or '' when nothing platform-specific stands in the way.
export function platformIssue(args, platform) {
  if (platform === 'win32') {
    const aoa = aoaInputOptions(args)
    if (aoa.length) return `${aoa.join(', ')}: ${AOA_WINDOWS_MESSAGE}`
  }
  const hwdec = args.find((arg) => arg.startsWith('--hwdec='))?.slice('--hwdec='.length)
  const required = hwdec ? HWDEC_PLATFORMS[hwdec] : undefined
  if (required && required !== platform) return `--hwdec=${hwdec} is only available on ${PLATFORM_NAMES[required]}. Choose auto${platform === 'win32' ? ', d3d11va' : ''} or disabled.`
  return ''
}

export const AOA_WINDOWS_MESSAGE = 'AOA input cannot be used on Windows while ADB is connected to the device. Choose UHID or SDK instead.'

// Flags applied directly through ADB do not require a scrcpy restart.
const LIVE_FLAGS = new Set(['--show-touches', '--stay-awake', '--turn-screen-off'])
const comparableArgs = (args) => args.filter((arg) => !LIVE_FLAGS.has(arg)).slice().sort()

export function argsEqual(left, right) {
  return JSON.stringify(comparableArgs(left)) === JSON.stringify(comparableArgs(right))
}

// Display-only rendering of the argument array. Execution never goes through a
// shell; quoting keeps a copied command usable when a value contains spaces.
export function formatCommand(args) {
  const quoted = args.map((arg) => /[\s"&|<>^();,]/.test(arg) ? `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"` : arg)
  return ['scrcpy', ...quoted].join(' ')
}
