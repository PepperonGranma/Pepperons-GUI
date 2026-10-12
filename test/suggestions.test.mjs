import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateOptionValue } from '../electron/scrcpy-args.mjs'
import { describeDevice, suggestSetups, suggestionApplied } from '../src/suggestions.mjs'

const capabilities = ({ width, height, refresh, encoders, sdk = 34, audio = ['opus', 'aac', 'flac'] }) => ({
  serial: 'TEST', capturedAt: 0, cacheKey: 'TEST|5.0.1', hardware: { sdk }, warnings: [],
  display: { physicalWidth: width, physicalHeight: height, currentWidth: width, currentHeight: height, maxRefreshRate: refresh, supportedRefreshRates: refresh ? [60, refresh] : [], displayIds: [0], modes: [] },
  video: { codecs: [...new Set(encoders.map((encoder) => encoder.codec))], encoders, reported: encoders.length > 0 },
  audio: { forwardingSupported: sdk >= 30, supportMessage: '', codecs: audio, encoders: [], reported: audio.length > 0 },
  camera: { reported: false, cameras: [], message: '' },
})

const DEVICES = {
  flagship: capabilities({ width: 1264, height: 2780, refresh: 120, encoders: [
    { codec: 'h264', name: 'c2.qti.avc.encoder' }, { codec: 'h265', name: 'c2.qti.hevc.encoder' }, { codec: 'av1', name: 'c2.android.av1.encoder' },
    { codec: 'h264', name: 'c2.android.avc.encoder' }, { codec: 'vp8', name: 'c2.android.vp8.encoder' },
  ] }),
  midRange: capabilities({ width: 1080, height: 2400, refresh: 90, encoders: [{ codec: 'h264', name: 'OMX.MTK.VIDEO.ENCODER.AVC' }, { codec: 'h264', name: 'OMX.google.h264.encoder' }], audio: ['opus', 'aac'] }),
  oldPhone: capabilities({ width: 720, height: 1280, refresh: 60, sdk: 29, encoders: [{ codec: 'h264', name: 'OMX.google.h264.encoder' }, { codec: 'vp8', name: 'OMX.google.vp8.encoder' }] }),
  tablet: capabilities({ width: 2560, height: 1600, refresh: 144, encoders: [{ codec: 'h264', name: 'c2.exynos.h264.encoder' }, { codec: 'h265', name: 'c2.exynos.hevc.encoder' }] }),
  // A device that answered nothing useful: no display size, no encoder list, no audio codecs.
  silent: { ...capabilities({ width: 0, height: 0, refresh: 0, encoders: [], audio: [] }) },
}

const FLAGS = { videoCodec: '--video-codec', maxSize: '--max-size', maxFps: '--max-fps', videoBitRate: '--video-bit-rate', videoBuffer: '--video-buffer', audioCodec: '--audio-codec', audioBitRate: '--audio-bit-rate', audioBuffer: '--audio-buffer', recordFormat: '--record-format' }
const megabits = (value) => Number(value.replace('M', ''))

test('every device gets the same six suggestions, in a stable order', () => {
  for (const [name, device] of Object.entries(DEVICES)) {
    for (const connection of ['USB', 'Wi-Fi']) {
      assert.deepEqual(suggestSetups(device, connection).map((item) => item.id), ['balanced', 'latency', 'quality', 'streaming', 'recording', 'light'], `${name} over ${connection}`)
    }
  }
  assert.deepEqual(suggestSetups(null), [])
})

test('every suggested value is one scrcpy accepts and this device supports', () => {
  for (const [name, device] of Object.entries(DEVICES)) {
    const profile = describeDevice(device)
    for (const connection of ['USB', 'Wi-Fi']) {
      for (const suggestion of suggestSetups(device, connection)) {
        const label = `${name}/${connection}/${suggestion.id}`
        for (const [key, flag] of Object.entries(FLAGS)) {
          const value = suggestion.patch[key]
          if (value === undefined || value === '') continue
          assert.equal(validateOptionValue(flag, value, '5.0.1'), '', `${label}: ${flag}=${value}`)
        }
        assert(profile.codecs.has(suggestion.patch.videoCodec), `${label}: ${suggestion.patch.videoCodec} is not a codec this device encodes`)
        if (profile.longSide && suggestion.patch.maxSize) assert(Number(suggestion.patch.maxSize) <= profile.longSide, `${label}: frame is upscaled beyond the screen`)
        assert(Number(suggestion.patch.maxFps) <= Math.max(60, profile.refresh), `${label}: frame rate exceeds the display`)
        assert.equal(suggestion.patch.videoEncoder, '', `${label}: a specific encoder would not survive a device change`)
        assert.equal(suggestion.patch.audioEnabled, profile.audioSupported, `${label}: audio switch`)
        assert(suggestion.reasons.length >= 2 && suggestion.reasons.every((reason) => reason.endsWith('.')), `${label}: reasons`)
        assert.match(suggestion.summary, /^[A-Z0-9]+ · (Native|\d+px) · \d+ fps · \d+M$/, `${label}: summary`)
      }
    }
  }
})

test('hardware encoders are told apart from Android software encoders', () => {
  const flagship = describeDevice(DEVICES.flagship)
  assert.deepEqual([...flagship.hardware.keys()].sort(), ['h264', 'h265'])
  assert.equal(flagship.hardware.get('h265'), 'c2.qti.hevc.encoder')
  assert.deepEqual([...describeDevice(DEVICES.oldPhone).hardware.keys()], [])
  assert.deepEqual([...describeDevice(DEVICES.midRange).hardware.keys()], ['h264'])
})

test('a capable phone is pushed further than a modest one', () => {
  const pick = (device, id, connection = 'USB') => suggestSetups(device, connection).find((item) => item.id === id).patch
  // Efficient codec and native resolution only where a hardware H.265 encoder exists.
  assert.deepEqual([pick(DEVICES.flagship, 'quality').videoCodec, pick(DEVICES.flagship, 'quality').maxSize], ['h265', ''])
  assert.deepEqual([pick(DEVICES.midRange, 'quality').videoCodec, pick(DEVICES.midRange, 'quality').maxSize], ['h264', ''])
  // Software-only encoding never gets a native-size or high-frame-rate suggestion.
  assert.equal(pick(DEVICES.oldPhone, 'quality').maxSize, '1280')
  assert.equal(pick(DEVICES.oldPhone, 'balanced').maxSize, '1280')
  assert.equal(pick(DEVICES.oldPhone, 'quality').maxFps, '60')
  // High-refresh displays raise the low-latency frame cap; 60 Hz displays do not.
  assert.equal(pick(DEVICES.flagship, 'latency').maxFps, '120')
  assert.equal(pick(DEVICES.tablet, 'latency').maxFps, '120')
  assert.equal(pick(DEVICES.midRange, 'latency').maxFps, '90')
  assert.equal(pick(DEVICES.oldPhone, 'latency').maxFps, '60')
  // Lossless audio only when the device reports FLAC.
  assert.equal(pick(DEVICES.flagship, 'quality').audioCodec, 'flac')
  assert.equal(pick(DEVICES.midRange, 'quality').audioCodec, 'opus')
})

test('Wi-Fi halves the bit rate and Android 10 keeps audio off', () => {
  for (const id of ['balanced', 'latency', 'quality', 'streaming', 'recording', 'light']) {
    const usb = suggestSetups(DEVICES.flagship, 'USB').find((item) => item.id === id).patch.videoBitRate
    const wifi = suggestSetups(DEVICES.flagship, 'Wi-Fi').find((item) => item.id === id).patch.videoBitRate
    assert(megabits(wifi) < megabits(usb), `${id}: ${wifi} should be lower than ${usb}`)
  }
  const old = suggestSetups(DEVICES.oldPhone)
  assert(old.every((item) => item.patch.audioEnabled === false))
  assert(old.every((item) => item.reasons.some((reason) => reason.includes('cannot forward audio'))))
})

test('a device that reports nothing still gets safe, universal settings', () => {
  for (const suggestion of suggestSetups(DEVICES.silent)) {
    assert.equal(suggestion.patch.videoCodec, 'h264', suggestion.id)
    assert(['', '1024', '1280', '1920'].includes(suggestion.patch.maxSize), `${suggestion.id}: ${suggestion.patch.maxSize}`)
    assert.equal(suggestion.patch.maxFps, '60', suggestion.id)
  }
})

test('the streaming and recording setups carry their extra settings', () => {
  const streaming = suggestSetups(DEVICES.flagship).find((item) => item.id === 'streaming').patch
  assert.deepEqual([streaming.borderless, streaming.disableScreensaver, streaming.stayAwake], [true, true, true])
  const recording = suggestSetups(DEVICES.flagship).find((item) => item.id === 'recording')
  assert.equal(recording.patch.recordFormat, 'mkv')
  assert.match(recording.note, /destination/)
  // Recording must not arm itself: there is no file path to write to yet.
  assert.equal(recording.patch.recordingEnabled, undefined)
})

test('a suggestion reads as in use only when all of its values are set', () => {
  const [balanced, latency] = suggestSetups(DEVICES.flagship)
  const config = { ...latency.patch, ...balanced.patch, serial: 'x' }
  assert(suggestionApplied(balanced, config))
  assert(!suggestionApplied(latency, config))
})
