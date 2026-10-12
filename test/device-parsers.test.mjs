import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  categoryFor, createLineSplitter, isScrcpyError, parseCameras, parseDeviceList, parseDisplayCapabilities, parseEncoders, parseHelp, parseProperties,
} from '../electron/device-parsers.mjs'

const HELP = `Usage: scrcpy [options]

Options:

    --always-on-top
        Make scrcpy window always on top (above other windows).

    -b, --video-bit-rate=value
        Encode the video at the given bit rate, expressed in bits/s. Unit
        suffixes are supported: 'K' (x1000) and 'M' (x1000000).
        Default is 8M.

    --new-display[=[<width>x<height>][/<dpi>]]
        Create a new display with the specified resolution and density.
        Examples:
            --new-display=1920x1080
            --new-display=/240

    -x, --flex-display
        Continuously resize the virtual display to match the window.

Shortcuts:

    In the following list, MOD is the shortcut modifier.
`

test('scrcpy --help is parsed into a catalog', () => {
  const options = parseHelp(HELP.replace(/\n/g, '\r\n'))
  assert.deepEqual(options.map((option) => option.name), ['--always-on-top', '--video-bit-rate', '--new-display', '--flex-display'])
  const [onTop, bitRate, newDisplay, flex] = options
  assert.equal(onTop.kind, 'boolean')
  assert.equal(onTop.category, 'General')
  assert.deepEqual({ kind: bitRate.kind, short: bitRate.short, valueHint: bitRate.valueHint, optionalValue: bitRate.optionalValue }, { kind: 'value', short: '-b', valueHint: 'value', optionalValue: false })
  assert.match(bitRate.description, /Default is 8M\.$/)
  assert.equal(newDisplay.optionalValue, true)
  assert.equal(newDisplay.kind, 'value')
  assert.match(newDisplay.description, /--new-display=\/240$/, 'indented examples belong to the option description')
  assert.equal(flex.kind, 'boolean')
  assert(!flex.description.includes('MOD'), 'the last option absorbed the next help section')
})

test('options are grouped into stable categories', () => {
  assert.equal(categoryFor('--audio-codec'), 'Audio')
  assert.equal(categoryFor('--camera-size'), 'Camera')
  assert.equal(categoryFor('--record-format'), 'Recording')
  assert.equal(categoryFor('--keyboard'), 'Control')
  assert.equal(categoryFor('--new-display'), 'Display')
  assert.equal(categoryFor('--tcpip'), 'Connection')
  assert.equal(categoryFor('--max-fps'), 'Video')
  assert.equal(categoryFor('--hwdec'), 'Video')
  assert.equal(categoryFor('--verbosity'), 'General')
})

test('adb devices -l output is parsed', () => {
  const devices = parseDeviceList([
    'List of devices attached',
    'R58M123ABC             device product:beyond1 model:SM_G973F device:beyond1 transport_id:4',
    '192.168.1.20:5555      device product:panther model:Pixel_7 device:panther transport_id:7',
    'ZY22ABCDEF             unauthorized transport_id:9',
    '',
  ].join('\r\n'))
  assert.equal(devices.length, 3)
  assert.deepEqual(devices[0], { serial: 'R58M123ABC', state: 'device', model: 'SM G973F', product: 'beyond1', transportId: '4', connection: 'USB', usable: true })
  assert.equal(devices[1].connection, 'Wi-Fi')
  assert.deepEqual({ model: devices[2].model, usable: devices[2].usable, state: devices[2].state }, { model: 'Android device', usable: false, state: 'unauthorized' })
  assert.deepEqual(parseDeviceList('List of devices attached\n\n'), [])
})

test('getprop output is parsed', () => {
  assert.deepEqual(parseProperties('[ro.build.version.sdk]: [34]\r\n[ro.product.model]: [Pixel 7]\nnoise\n[empty]: []'), {
    'ro.build.version.sdk': '34', 'ro.product.model': 'Pixel 7', empty: '',
  })
})

test('scrcpy --list-encoders output is parsed per media type', () => {
  const raw = `[server] INFO: List of video encoders:
    --video-codec=h264 --video-encoder=c2.exynos.h264.encoder     (hw) [vendor]
    --video-codec=h264 --video-encoder=OMX.google.h264.encoder    (sw) (alias for c2.android.avc.encoder)
    --video-codec=h265 --video-encoder='c2.exynos.hevc.encoder'   (hw) [vendor]
[server] INFO: List of audio encoders:
    --audio-codec=opus --audio-encoder=c2.android.opus.encoder    (sw)
    --audio-codec=opus --audio-encoder=c2.android.opus.encoder    (sw)`
  assert.deepEqual(parseEncoders(raw, 'video'), [
    { codec: 'h264', name: 'c2.exynos.h264.encoder' },
    { codec: 'h264', name: 'OMX.google.h264.encoder' },
    { codec: 'h265', name: 'c2.exynos.hevc.encoder' },
  ])
  assert.deepEqual(parseEncoders(raw, 'audio'), [{ codec: 'opus', name: 'c2.android.opus.encoder' }])
  assert.deepEqual(parseEncoders('', 'video'), [])
})

test('display state is assembled from wm and dumpsys output', () => {
  const display = parseDisplayCapabilities(
    'Physical size: 1440x3088\nOverride size: 1080x2316',
    'Physical density: 600\nOverride density: 450',
    'mActiveModeId=2\n{id=1, width=1440, height=3088, fps=60.0}\n{id=2, width=1440, height=3088, fps=120.0}',
    '--display-id=0    (1440x3088)\n--display-id=2    (1920x1080)',
  )
  assert.deepEqual({ w: display.physicalWidth, h: display.physicalHeight, cw: display.currentWidth, ch: display.currentHeight }, { w: 1440, h: 3088, cw: 1080, ch: 2316 })
  assert.equal(display.densityDpi, 450)
  assert.deepEqual(display.supportedRefreshRates, [60, 120])
  assert.equal(display.maxRefreshRate, 120)
  assert.equal(display.currentRefreshRate, 120)
  assert.deepEqual(display.displayIds, [0, 2])
})

test('missing display data falls back to safe defaults', () => {
  const display = parseDisplayCapabilities('', '', '', '')
  assert.deepEqual(display.displayIds, [0])
  assert.deepEqual(display.supportedRefreshRates, [])
  assert.equal(display.maxRefreshRate, undefined)
  assert.equal(display.physicalWidth, undefined)
})

test('scrcpy camera listings are parsed', () => {
  const cameras = parseCameras(
    '[server] INFO: List of cameras:\n    --camera-id=0    (back, 4032x3024, fps=[15, 30])\n    --camera-id=1    (front, 3264x2448, fps=[15, 30])',
    '    --camera-id=0    (back, 4032x3024, fps=[15, 30])\n        - 1920x1080\n        - 1280x720',
  )
  assert.deepEqual(cameras.map((camera) => [camera.id, camera.facing]), [['0', 'back'], ['1', 'front']])
  assert(cameras[0].sizes.includes('4032x3024'))
  assert.deepEqual(parseCameras('', ''), [])
})

test('process output is reassembled into whole lines across chunks', () => {
  const splitter = createLineSplitter()
  assert.deepEqual(splitter.push('INFO: Renderer: direct3d11\r\nWARN: Decoder \'video\': hard'), ['INFO: Renderer: direct3d11'])
  assert.deepEqual(splitter.push('ware decoding unavailable\n\nERROR: [FFmpeg] Get current frame'), ["WARN: Decoder 'video': hardware decoding unavailable"])
  assert.deepEqual(splitter.push(' error\n'), ['ERROR: [FFmpeg] Get current frame error'])
  assert.deepEqual(splitter.push('tail without newline'), [])
  assert.deepEqual(splitter.flush(), ['tail without newline'])
  assert.deepEqual(splitter.flush(), [])
})

test('scrcpy error lines are recognised with or without a source tag', () => {
  assert(isScrcpyError('ERROR: Server connection failed'))
  assert(isScrcpyError('[server] ERROR: Capture/encoding error'))
  assert(isScrcpyError('  error: lower case counts too'))
  assert(!isScrcpyError('INFO: no ERROR: here is fine? '.replace('ERROR:', 'error word')))
  assert(!isScrcpyError('WARN: Could not get initial audio timestamp'))
})
