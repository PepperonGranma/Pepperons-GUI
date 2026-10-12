// Pure parsers for scrcpy and ADB text output. Dependency-free so they can be
// unit-tested without launching Electron.
export function categoryFor(name) {
  if (/audio/.test(name)) return 'Audio'
  if (/camera/.test(name)) return 'Camera'
  if (/window|fullscreen|screensaver|render|orientation|angle|mipmap|background/.test(name)) return 'Window'
  if (/record|v4l2|playback|time-limit/.test(name)) return 'Recording'
  if (/keyboard|mouse|gamepad|clipboard|paste|touch|control|key-repeat|shortcut/.test(name)) return 'Control'
  if (/display|new-display|vd-|flex-display/.test(name)) return 'Display'
  if (/tcpip|serial|select-|tunnel|port|adb|otg/.test(name)) return 'Connection'
  if (/video|fps|max-size|encoder|crop|codec|bit-rate|downsize|alignment|hwdec/.test(name)) return 'Video'
  return 'General'
}

export function parseHelp(raw) {
  const lines = raw.replace(/\r/g, '').split('\n')
  const options = []
  let current = null
  for (const line of lines) {
    // Option declarations in scrcpy help are indented by four spaces. Requiring
    // that exact level avoids treating indented usage examples as new options.
    const match = line.match(/^ {4}(?:(-[A-Za-z0-9]),\s*)?(--[a-z0-9][a-z0-9-]*)(.*)$/)
    if (match) {
      if (current) options.push(current)
      const suffix = (match[3] || '').trim()
      const hint = (suffix.startsWith('[=') && suffix.endsWith(']')
        ? suffix.slice(2, -1)
        : suffix.startsWith('=') ? suffix.slice(1) : suffix).replace(/^<|>$/g, '')
      current = {
        name: match[2],
        short: match[1] || '',
        valueHint: hint,
        kind: hint ? 'value' : 'boolean',
        optionalValue: suffix.startsWith('[='),
        category: categoryFor(match[2]),
        description: '',
      }
    } else if (current && (/^\S/.test(line) || /^ {4}-[A-Za-z0-9](?:\s|$)/.test(line))) {
      options.push(current)
      current = null
    } else if (current && line.trim()) {
      current.description += `${current.description ? ' ' : ''}${line.trim()}`
    }
  }
  if (current) options.push(current)
  return [...new Map(options.map((option) => [option.name, option])).values()]
}

export function parseProperties(raw) {
  const properties = {}
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\[([^\]]+)\]:\s*\[(.*)\]$/)
    if (match) properties[match[1]] = match[2]
  }
  return properties
}

export function parseResolution(raw, label) {
  const match = raw.match(new RegExp(`${label}\\s+(?:size:\\s*)?(\\d+)x(\\d+)`, 'i'))
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null
}

export function parseEncoders(raw, media) {
  const matches = []
  const expression = new RegExp(`--${media}-codec=([a-z0-9]+)[^\\n]*--${media}-encoder=(?:'([^']+)'|"([^"]+)"|([^\\s]+))`, 'gi')
  let match
  while ((match = expression.exec(raw))) matches.push({ codec: match[1].toLowerCase(), name: match[2] || match[3] || match[4] })
  if (!matches.length) {
    const sectionLines = raw.split(/\r?\n/).filter((line) => line.toLowerCase().includes(media))
    for (const line of sectionLines) {
      const codec = line.match(/\b(h264|h265|av1|vp8|vp9|opus|aac|flac|raw)\b/i)?.[1]
      const encoder = line.match(/(?:encoder[:=]\s*|--\w+-encoder=)(['"]?)([\w.:-]+)\1/i)?.[2]
      if (codec && encoder) matches.push({ codec: codec.toLowerCase(), name: encoder })
    }
  }
  return [...new Map(matches.map((item) => [`${item.codec}|${item.name}`, item])).values()]
}

export function parseDisplayCapabilities(wmSize, wmDensity, displayDump, displayList) {
  const physical = parseResolution(wmSize, 'Physical') || parseResolution(wmSize, '')
  const current = parseResolution(wmSize, 'Override') || physical
  const physicalDensity = wmDensity.match(/Physical density:\s*(\d+)/i)
  const overrideDensity = wmDensity.match(/Override density:\s*(\d+)/i)
  const density = Number((overrideDensity || physicalDensity || [])[1]) || undefined
  const modes = []
  const modeExpression = /(?:id|modeId)\s*[=:]\s*(\d+)[^\n]{0,100}?(?:width\s*[=:]\s*)?(\d{3,5})\s*(?:x|,\s*height\s*[=:]\s*)(\d{3,5})[^\n]{0,80}?(?:fps|refreshRate)\s*[=:]\s*(\d+(?:\.\d+)?)/gi
  let match
  while ((match = modeExpression.exec(displayDump))) modes.push({ id: Number(match[1]), width: Number(match[2]), height: Number(match[3]), refreshRate: Number(match[4]) })
  const rates = []
  const rateExpression = /(?:refreshRate|fps|mRefreshRate)\s*[=:]\s*(\d+(?:\.\d+)?)/gi
  while ((match = rateExpression.exec(displayDump))) {
    const rate = Number(match[1])
    if (rate >= 20 && rate <= 240) rates.push(Math.round(rate * 100) / 100)
  }
  const modeRates = modes.map((mode) => mode.refreshRate).filter(Boolean)
  const supportedRefreshRates = [...new Set(modeRates.length ? modeRates : rates)].sort((a, b) => a - b)
  const activeModeId = Number(displayDump.match(/(?:mActiveModeId|activeModeId)\s*[=:]\s*(\d+)/i)?.[1]) || undefined
  const activeMode = modes.find((mode) => mode.id === activeModeId)
  const directCurrent = Number(displayDump.match(/(?:mRefreshRate|refreshRate)\s*[=:]\s*(\d+(?:\.\d+)?)/i)?.[1]) || undefined
  const displayIds = [...new Set([...displayList.matchAll(/(?:--display-id=|Display\s+)(\d+)/gi)].map((item) => Number(item[1])))]
  if (!displayIds.length) displayIds.push(0)
  const orientation = displayDump.match(/(?:mCurrentOrientation|orientation)\s*[=:]\s*([A-Za-z0-9_-]+)/i)?.[1]
  return {
    physicalWidth: physical?.width,
    physicalHeight: physical?.height,
    currentWidth: current?.width,
    currentHeight: current?.height,
    densityDpi: density,
    currentRefreshRate: activeMode?.refreshRate || directCurrent,
    supportedRefreshRates,
    maxRefreshRate: supportedRefreshRates.length ? Math.max(...supportedRefreshRates) : undefined,
    orientation,
    displayIds,
    modes,
  }
}

export function parseCameras(raw, sizeRaw) {
  const cameras = []
  const lines = `${raw}\n${sizeRaw}`.split(/\r?\n/)
  for (const line of lines) {
    const id = line.match(/--camera-id=(?:'([^']+)'|"([^"]+)"|([^\s,)]+))/i)?.slice(1).find(Boolean)
      || line.match(/camera(?:\s+id)?\s*[:=]\s*([\w.-]+)/i)?.[1]
    if (!id) continue
    let camera = cameras.find((item) => item.id === id)
    if (!camera) {
      const facingText = line.match(/\b(front|back|external)\b/i)?.[1]?.toLowerCase()
      camera = { id, facing: facingText || 'unknown', sizes: [], frameRates: [] }
      cameras.push(camera)
    }
    for (const size of line.matchAll(/\b(\d{3,5}x\d{3,5})\b/g)) camera.sizes.push(size[1])
    for (const fps of line.matchAll(/(?:fps|@)\s*[=:]?\s*(\d+(?:\.\d+)?)/gi)) camera.frameRates.push(Number(fps[1]))
    const fpsSet = line.match(/fps\s*=\s*\{([^}]+)\}/i)?.[1]
    if (fpsSet) for (const value of fpsSet.split(',')) { const parsed = Number(value.trim()); if (parsed) camera.frameRates.push(parsed) }
    if (/high.?speed/i.test(line)) camera.highSpeed = true
    if (/torch/i.test(line)) camera.torchSupported = !/(?:no|without|unsupported)\s+torch/i.test(line)
  }
  for (const camera of cameras) {
    camera.sizes = [...new Set(camera.sizes)]
    camera.frameRates = [...new Set(camera.frameRates)].sort((a, b) => a - b)
  }
  return cameras
}

export function parseDeviceList(raw) {
  return raw.split(/\r?\n/).slice(1).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [serial, state, ...details] = line.split(/\s+/)
    const props = Object.fromEntries(details.filter((part) => part.includes(':')).map((part) => {
      const index = part.indexOf(':')
      return [part.slice(0, index), part.slice(index + 1)]
    }))
    return {
      serial,
      state,
      model: (props.model || props.device || 'Android device').replace(/_/g, ' '),
      product: props.product || '',
      transportId: props.transport_id || '',
      connection: serial.includes(':') ? 'Wi-Fi' : 'USB',
      usable: state === 'device',
    }
  })
}

// Process output arrives in arbitrary chunks, so a line can be cut in two. The
// splitter hands back only complete lines and keeps the unfinished tail for the
// next chunk; flush() returns whatever is left when the process ends.
export function createLineSplitter() {
  let tail = ''
  return {
    push(chunk) {
      const lines = (tail + String(chunk)).split(/\r?\n/)
      tail = lines.pop() || ''
      return lines.filter((line) => line.trim())
    },
    flush() {
      const rest = tail
      tail = ''
      return rest.trim() ? [rest] : []
    },
  }
}

// scrcpy prefixes its own failures with "ERROR:", optionally after a "[server]" tag.
export function isScrcpyError(line) {
  return /(?:^|\])\s*ERROR:/i.test(String(line).trim())
}
