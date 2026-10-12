// Parser facts, not hardware recommendations. See docs/COMMAND-CONSTRAINTS.md.
// Keep this dependency-free module shared by Electron and the command cards.
// Releases whose desktop CLI parser has been audited against this table. 5.0 and
// 5.0.1 changed cli.c, str.c and options.c only to add --hwdec (an enumeration).
export const AUDITED_VERSIONS = ['4.1', '5.0', '5.0.1']
export const CONSTRAINT_VERSION = AUDITED_VERSIONS.at(-1)

// '5.0.0' and '5.0' name the same release.
export function auditedVersion(runtimeVersion = '') {
  const normalized = String(runtimeVersion).trim().replace(/^v/, '').replace(/(\.\d+)\.0$/, '$1')
  return AUDITED_VERSIONS.includes(normalized) ? normalized : ''
}
const integer = (min, max, unit, rest = {}) => ({ integer: true, min, max, unit, ...rest })
const orientations = ['0', '90', '180', '270', 'flip0', 'flip90', 'flip180', 'flip270']
const bitrate = defaultValue => integer(0, 2147483647, 'bit/s', {
  defaultValue, suffixes: ['K', 'M'], suffixMultipliers: { K: 1000, M: 1000000 },
  deviceDependent: true, note: 'Device encoder limits may be lower.',
})

export const PARSER_CONSTRAINTS = {
  '--video-bit-rate': bitrate('8M'),
  '--audio-bit-rate': bitrate('128K'),
  '--max-size': integer(0, 65535, 'px', { defaultValue: 0, zeroMeaning: 'unlimited', deviceDependent: true, note: 'Actual maximum resolution depends on the device encoder.' }),
  '--min-size-alignment': { integer: true, allowedValues: [1, 2, 4, 8, 16], defaultValue: 1 },
  '--audio-buffer': integer(0, 3600000, 'ms', { defaultValue: 50, note: 'When omitted, FLAC uses 120 ms; other codecs use 50 ms.' }),
  '--video-buffer': integer(0, 3600000, 'ms', { defaultValue: 0, zeroMeaning: 'no buffering' }),
  '--v4l2-buffer': integer(0, 3600000, 'ms', { defaultValue: 0, zeroMeaning: 'no buffering' }),
  '--audio-output-buffer': integer(0, 1000, 'ms', { defaultValue: 10 }),
  '--camera-fps': integer(0, 65535, 'fps', { defaultValue: 0, zeroMeaning: 'Android default (normally 30 fps)', deviceDependent: true, note: 'Available frame rates depend on the camera and capture size.' }),
  '--display-id': integer(0, 2147483647, '', { defaultValue: 0, zeroMeaning: 'main display', deviceDependent: true, note: 'The display ID must exist on the connected device.' }),
  '--screen-off-timeout': integer(0, 2147483, 's', { note: 'If omitted, the device screen-off timeout is unchanged.' }),
  '--time-limit': integer(0, 2147483647, 's', { defaultValue: 0, zeroMeaning: 'unlimited' }),
  '--tunnel-port': integer(0, 65535, '', { defaultValue: 0, zeroMeaning: 'not forced' }),
  '--port': integer(0, 65535, '', { format: 'port-range', defaultValue: '27183:27199', note: 'One port or two colon-separated ports; scrcpy orders the endpoints.' }),
  '--window-width': integer(0, 65535, 'px', { defaultValue: 0, zeroMeaning: 'automatic' }),
  '--window-height': integer(0, 65535, 'px', { defaultValue: 0, zeroMeaning: 'automatic' }),
  '--window-x': integer(-32767, 32767, 'px', { keywords: ['auto'], defaultValue: 'auto' }),
  '--window-y': integer(-32767, 32767, 'px', { keywords: ['auto'], defaultValue: 'auto' }),
  '--display-orientation': { allowedValues: orientations, defaultValue: '0' },
  '--orientation': { allowedValues: orientations, defaultValue: '0' },
  '--record-orientation': { allowedValues: ['0', '90', '180', '270'], defaultValue: '0' },
  '--capture-orientation': { allowedValues: [...orientations, '@', ...orientations.map(value => `@${value}`)], defaultValue: '0' },
}

export function constraintsFor(name, runtimeVersion = '') {
  // Do not present audited limits as verified facts for an unreviewed runtime.
  const audited = auditedVersion(runtimeVersion)
  if (runtimeVersion && !audited) return undefined
  const constraints = PARSER_CONSTRAINTS[name]
  return constraints ? { ...constraints, sourceVersion: audited || CONSTRAINT_VERSION, referenceOnly: !runtimeVersion } : undefined
}

export function withConstraints(option, runtimeVersion = '') {
  const constraints = constraintsFor(option.name, runtimeVersion)
  if (!constraints) return { ...option, constraints: undefined }
  // Only default prose is read from help; never infer parser ranges from it.
  const helpDefault = option.source === 'runtime'
    ? option.description.match(/\bDefault is (.+?)(?:\.(?:\s|$)|$)/i)?.[1]
    : undefined
  return { ...option, constraints: helpDefault ? { ...constraints, defaultValue: helpDefault } : constraints }
}

const numberFormat = new Intl.NumberFormat('en-US')
const format = value => typeof value === 'number' ? numberFormat.format(value) : value
export function allowedDescription(constraints) {
  if (constraints.allowedValues) return constraints.allowedValues.map(format).join(', ')
  const unit = constraints.unit ? ` ${constraints.unit}` : ''
  const bounds = constraints.min !== undefined && constraints.max !== undefined
    ? `${format(constraints.min)} – ${format(constraints.max)}${unit}`
    : constraints.min !== undefined ? `≥ ${format(constraints.min)}${unit}` : `≤ ${format(constraints.max)}${unit}`
  return `${bounds}${constraints.format === 'port-range' ? ' per port' : ''}${constraints.keywords?.length ? `, or ${constraints.keywords.join(', ')}` : ''}`
}

// scrcpy uses strtol(base=0): signed decimal, 0-prefixed octal and 0x hex.
// BigInt avoids precision loss at suffix boundaries and on oversized input.
function parseInteger(value, constraints) {
  let token = value, multiplier = 1
  if (constraints.suffixes?.includes(token.slice(-1).toUpperCase())) {
    multiplier = constraints.suffixMultipliers[token.slice(-1).toUpperCase()]
    token = token.slice(0, -1)
  }
  const match = token.match(/^([+-]?)(0[xX][0-9a-fA-F]+|0[0-7]*|[1-9][0-9]*)$/)
  if (!match) return null
  const digits = match[2]
  const magnitude = BigInt(/^0[0-7]+$/.test(digits) ? `0o${digits.slice(1)}` : digits)
  return magnitude * (match[1] === '-' ? -1n : 1n) * BigInt(multiplier)
}

// Empty means remove the optional argument in the GUI, not numeric zero.
// Return an error without ever clamping, normalizing or rewriting the input.
export function validateConstraint(value, constraints) {
  if (!constraints || value === '') return ''
  if (typeof value !== 'string') return 'Enter a value.'
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (constraints.keywords?.includes(trimmed)) return ''
  if (constraints.allowedValues && !constraints.integer) {
    return constraints.allowedValues.includes(trimmed) ? '' : `Allowed values: ${allowedDescription(constraints)}.`
  }
  const parts = constraints.format === 'port-range' ? trimmed.split(':') : [trimmed]
  if (parts.length > 2 || parts.some(part => !part)) return 'Enter one port or two ports separated by a colon.'
  for (const part of parts) {
    const parsed = parseInteger(part, constraints)
    if (parsed === null) return `Enter a whole number${constraints.suffixes?.length ? `; ${constraints.suffixes.join(' and ')} suffixes are supported` : ''}.`
    if (constraints.allowedValues && !constraints.allowedValues.some(value => typeof value === 'number' && BigInt(value) === parsed)) {
      return `Allowed values: ${allowedDescription(constraints)}.`
    }
    if ((constraints.min !== undefined && parsed < BigInt(constraints.min)) || (constraints.max !== undefined && parsed > BigInt(constraints.max))) {
      return `Enter a value from ${allowedDescription(constraints)}.`
    }
  }
  return ''
}

// Compares dotted release numbers such as "5.0.1" and "4.1". Anything that is not
// purely numeric (an unknown or development build) is never reported as outdated.
export function isNewerVersion(candidate, current) {
  const parse = (value) => /^\d+(\.\d+)*$/.test(String(value).trim()) ? String(value).trim().split('.').map(Number) : null
  const next = parse(candidate)
  const now = parse(current)
  if (!next || !now) return false
  for (let index = 0; index < Math.max(next.length, now.length); index += 1) {
    const difference = (next[index] || 0) - (now[index] || 0)
    if (difference !== 0) return difference > 0
  }
  return false
}
