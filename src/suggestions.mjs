// Setup suggestions derived from what the connected device reports. Pure and
// dependency-free so the rules can be unit-tested without a phone attached.
//
// Every value suggested here is one the guided pages could set by hand; the
// suggestions only choose them from the device's display, encoder list, Android
// version and connection type. Nothing is probed or changed on the device.

// Android's bundled software encoders. Anything else in the list is a vendor
// (hardware) encoder: faster and far lighter on the phone.
const SOFTWARE_ENCODER = /^(c2\.android\.|OMX\.google\.)/i

export function describeDevice(capabilities, connection = 'USB') {
  const display = capabilities?.display || {}
  const width = display.physicalWidth || display.currentWidth || 0
  const height = display.physicalHeight || display.currentHeight || 0
  const encoders = capabilities?.video?.encoders || []
  const reported = Boolean(capabilities?.video?.reported && encoders.length)
  const hardware = new Map()
  for (const encoder of encoders) if (!SOFTWARE_ENCODER.test(encoder.name) && !hardware.has(encoder.codec)) hardware.set(encoder.codec, encoder.name)
  const audioCodecs = capabilities?.audio?.reported && capabilities.audio.codecs.length ? capabilities.audio.codecs : ['opus', 'aac', 'flac']
  return {
    width,
    height,
    longSide: Math.max(width, height),
    refresh: Math.round(display.maxRefreshRate || display.currentRefreshRate || 60),
    reported,
    // Without an encoder list, H.264 is the one codec every Android device encodes.
    codecs: new Set(reported ? encoders.map((encoder) => encoder.codec) : ['h264']),
    hardware,
    audioSupported: capabilities?.audio?.forwardingSupported !== false,
    audioCodecs: new Set(audioCodecs),
    wireless: connection === 'Wi-Fi',
  }
}

const megabits = (value) => `${Math.max(1, Math.round(value))}M`

export function suggestSetups(capabilities, connection = 'USB') {
  if (!capabilities) return []
  const device = describeDevice(capabilities, connection)
  const { longSide, refresh, hardware, codecs, wireless } = device

  const compatible = codecs.has('h264') ? 'h264' : [...codecs][0] || 'h264'
  const efficient = hardware.has('h265') ? 'h265' : compatible
  const cap = (limit) => String(longSide ? Math.min(longSide, limit) : limit)
  // A software encoder cannot keep up with large frames; stay at or below 1080p for it.
  const software = (codec) => device.reported && !hardware.has(codec)
  const fullSize = (codec) => software(codec) ? cap(1920) : ''
  const everydaySize = (codec) => software(codec) ? cap(1280) : cap(1920)
  const standardFps = String(Math.min(refresh, 60))
  const smoothFps = String(Math.min(refresh, 120))
  // A wireless link carries roughly half of what USB does before frames start to queue.
  const rate = (usbMegabits) => megabits(wireless ? usbMegabits / 2 : usbMegabits)
  const audioCodec = (preferred, fallback = 'opus') => device.audioCodecs.has(preferred) ? preferred : device.audioCodecs.has(fallback) ? fallback : [...device.audioCodecs][0] || 'opus'

  const encoderReason = (codec) => hardware.has(codec)
    ? `${codec.toUpperCase()} uses this phone's hardware encoder (${hardware.get(codec)}).`
    : device.reported ? `${codec.toUpperCase()} is encoded in software on this phone, so the frame size is kept modest.` : 'The encoder list was not reported, so the universally supported H.264 is used.'
  const linkReason = wireless ? 'Wi-Fi connection: bit rates are halved so frames do not queue.' : 'USB connection: full bit rate, no network jitter.'
  const nativeReason = longSide ? `Native ${device.width}×${device.height} is kept.` : 'The native resolution is kept.'
  const audioReason = device.audioSupported ? '' : 'This Android version cannot forward audio, so audio stays off.'

  const base = (patch) => ({
    videoEnabled: true, videoSource: 'display', videoEncoder: '', hwdec: 'auto',
    audioEnabled: device.audioSupported, audioEncoder: '',
    ...patch,
  })
  const build = (id, title, tagline, patch, reasons, note) => {
    const full = base(patch)
    const size = full.maxSize ? `${full.maxSize}px` : 'Native'
    return {
      id, title, tagline, note,
      summary: `${full.videoCodec.toUpperCase()} · ${size} · ${full.maxFps} fps · ${full.videoBitRate}`,
      reasons: [...new Set([...reasons, audioReason].filter(Boolean))],
      patch: full,
    }
  }

  return [
    build('balanced', 'Best match', 'A sensible everyday setup for this device.', {
      videoCodec: compatible, maxSize: everydaySize(compatible), maxFps: standardFps, videoBitRate: rate(software(compatible) ? 5 : 8), videoBuffer: '0',
      audioCodec: audioCodec('opus'), audioBitRate: '128K', audioBuffer: '50',
    }, [encoderReason(compatible), longSide > Number(everydaySize(compatible)) ? `The ${longSide}px screen is scaled to ${everydaySize(compatible)}px, which is sharp without the extra load.` : nativeReason, linkReason]),

    build('latency', 'Lowest latency', 'The quickest response for games and typing.', {
      videoCodec: compatible, maxSize: cap(1280), maxFps: smoothFps, videoBitRate: rate(6), videoBuffer: '0',
      audioCodec: audioCodec('opus'), audioBitRate: '96K', audioBuffer: wireless ? '40' : '25',
    }, [
      refresh > 60 ? `The display reaches ${refresh} Hz, so frames are capped at ${smoothFps} fps instead of 60.` : 'The display runs at 60 Hz, so 60 fps is the ceiling.',
      'A smaller frame encodes, travels and decodes faster; no video buffer is added.',
      encoderReason(compatible),
    ]),

    build('quality', 'Highest quality', 'Maximum picture and sound fidelity.', {
      videoCodec: efficient, maxSize: fullSize(efficient), maxFps: wireless || software(efficient) ? standardFps : smoothFps, videoBitRate: rate(software(efficient) ? 12 : efficient === 'h265' ? 20 : 30), videoBuffer: '50',
      audioCodec: audioCodec('flac'), audioBitRate: audioCodec('flac') === 'flac' ? '' : '256K', audioBuffer: audioCodec('flac') === 'flac' ? '120' : '80',
    }, [
      fullSize(efficient) ? '' : nativeReason,
      encoderReason(efficient),
      audioCodec('flac') === 'flac' ? 'Audio is forwarded as lossless FLAC.' : 'Lossless audio is not reported, so high-bit-rate audio is used.',
      linkReason,
    ]),

    build('streaming', 'Best for streaming', 'Steady, capture-friendly output for OBS and calls.', {
      videoCodec: compatible, maxSize: cap(1920), maxFps: standardFps, videoBitRate: rate(10), videoBuffer: '60',
      audioCodec: audioCodec('opus'), audioBitRate: '160K', audioBuffer: '100',
      borderless: true, alwaysOnTop: false, disableScreensaver: true, stayAwake: true,
    }, [
      'A short video buffer evens out frame pacing, which matters more than delay on a stream.',
      'The mirror window is borderless for a clean capture, and the phone is kept awake.',
      encoderReason(compatible),
    ]),

    build('recording', 'Best for recording', 'Clean files that are easy to edit.', {
      videoCodec: efficient, maxSize: fullSize(efficient), maxFps: standardFps, videoBitRate: rate(software(efficient) ? 10 : efficient === 'h265' ? 16 : 24), videoBuffer: '0',
      audioCodec: audioCodec('aac'), audioBitRate: audioCodec('aac') === 'aac' ? '192K' : '160K', audioBuffer: '50',
      recordFormat: 'mkv', stayAwake: true,
    }, [
      fullSize(efficient) ? '' : nativeReason,
      efficient === 'h265' ? 'H.265 keeps files roughly half the size of H.264 at the same quality.' : encoderReason(efficient),
      'MKV stays playable even if a recording is interrupted.',
    ], 'Choose a destination on the Recording page to start recording.'),

    build('light', 'Smooth and light', 'Least load on the phone and this computer.', {
      videoCodec: compatible, maxSize: cap(1024), maxFps: standardFps, videoBitRate: rate(3), videoBuffer: '0',
      audioCodec: audioCodec('opus'), audioBitRate: '96K', audioBuffer: '50',
    }, [
      'A small frame and low bit rate keep the phone cool and spare its battery.',
      encoderReason(compatible),
      linkReason,
    ]),
  ]
}

// A suggestion is in use when every value it would set is already set.
export function suggestionApplied(suggestion, config) {
  return Object.entries(suggestion.patch).every(([key, value]) => config[key] === value)
}
