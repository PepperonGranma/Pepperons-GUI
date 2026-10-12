import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AUDITED_VERSIONS, auditedVersion, constraintsFor, isNewerVersion } from '../electron/command-constraints.mjs'
import {
  BOOLEAN_OPTIONS, OPTION_NAMES, OPTIONAL_VALUE_OPTIONS, VALUE_OPTIONS,
  aoaInputOptions, argsEqual, formatCommand, platformIssue, serialFromArgs, validateArgs, validateOptionValue,
} from '../electron/scrcpy-args.mjs'

const accepts = (args) => assert.deepEqual(validateArgs(args, '4.1'), args)
const rejects = (args, pattern) => assert.throws(() => validateArgs(args, '4.1'), pattern)

test('the catalog has no option that is both a flag and a value option', () => {
  assert.deepEqual([...VALUE_OPTIONS].filter((name) => BOOLEAN_OPTIONS.has(name)), [])
  assert.equal(OPTION_NAMES.length, VALUE_OPTIONS.size + BOOLEAN_OPTIONS.size)
  for (const name of OPTIONAL_VALUE_OPTIONS) assert(VALUE_OPTIONS.has(name), `${name} is not a value option`)
})

test('a typical generated command is accepted and returned as a copy', () => {
  const args = ['--serial=abc123', '--video-codec=h264', '--video-bit-rate=8M', '--max-size=1920', '--max-fps=60', '--audio-codec=opus', '--keyboard=sdk', '--stay-awake']
  const result = validateArgs(args, '4.1')
  assert.deepEqual(result, args)
  assert.notEqual(result, args)
})

test('malformed argument arrays are rejected', () => {
  rejects('--no-audio', /Invalid Scrcpy arguments/)
  rejects([42], /Invalid Scrcpy arguments/)
  rejects(['--window-title=a\nb'], /Invalid Scrcpy arguments/)
  rejects(['-f'], /Only long-form/)
  rejects(['scrcpy'], /Only long-form/)
  rejects(['--no-audio', '--no-audio'], /more than once/)
  rejects(['--max-size='], /Empty option values/)
  rejects(['--max-size'], /requires a value/)
  rejects(['--fullscreen=yes'], /boolean flag/)
  rejects([`--window-title=${'x'.repeat(2049)}`], /Invalid Scrcpy arguments/)
})

test('optional-value options may be passed bare', () => {
  accepts(['--new-display'])
  accepts(['--new-display=1920x1080/240'])
  accepts(['--new-display=/240'])
  accepts(['--pause-on-exit'])
})

test('enumerations and parser constraints are enforced', () => {
  rejects(['--video-codec=mpeg2'], /--video-codec must be one of/)
  rejects(['--max-size=65536'], /--max-size:/)
  rejects(['--video-bit-rate=1G'], /--video-bit-rate:/)
  accepts(['--video-bit-rate=0x10K'])
})

test('unknown future options pass through with syntax checks only', () => {
  accepts(['--some-future-flag', '--another-future=value'])
})

test('value syntax rules', () => {
  const ok = (name, values) => values.forEach((value) => assert.equal(validateOptionValue(name, value, '4.1'), '', `${name} rejected ${value}`))
  const bad = (name, values) => values.forEach((value) => assert.notEqual(validateOptionValue(name, value, '4.1'), '', `${name} accepted ${value}`))
  ok('--max-fps', ['60', '59.94']); bad('--max-fps', ['fast', '60fps'])
  ok('--background-color', ['#fff', '#0E0e10']); bad('--background-color', ['fff', '#ffff', 'red'])
  ok('--camera-ar', ['sensor', '1.6', '16:9']); bad('--camera-ar', ['0', '16:0', 'wide'])
  ok('--camera-size', ['1920x1080']); bad('--camera-size', ['1920', '0x1080', '1920X1080'])
  ok('--crop', ['1224:1440:0:0']); bad('--crop', ['1224:1440', '0:1440:0:0', 'a:b:c:d'])
  ok('--new-display', ['1920x1080', '1920x1080/420', '/240']); bad('--new-display', ['1920', '0x1080', '1920x1080/0'])
  ok('--mouse-bind', ['bhsn', '++++:bhsn']); bad('--mouse-bind', ['bhs', 'xxxx'])
  ok('--shortcut-mod', ['lctrl', 'lctrl+lalt,rsuper']); bad('--shortcut-mod', ['ctrl', 'lctrl+'])
  ok('--tcpip', ['192.168.1.5', '+192.168.1.5:5555']); bad('--tcpip', ['+', '192.168.1.5:0', '192.168.1.5:70000', 'a b'])
  ok('--window-title', ['Anything goes here'])
})

test('numeric parser metadata is not applied to an unreviewed runtime', () => {
  assert.notEqual(validateOptionValue('--max-size', '70000', '4.1'), '')
  assert.equal(validateOptionValue('--max-size', '70000', '9.9'), '')
})

test('cross-option rules', () => {
  rejects(['--no-control', '--stay-awake'], /require Scrcpy device control/)
  rejects(['--serial=a', '--select-usb'], /only one Scrcpy device selector/)
  rejects(['--audio-dup'], /--audio-dup requires/)
  accepts(['--audio-source=playback', '--audio-dup'])
  rejects(['--no-audio', '--audio-codec=opus'], /cannot be combined with --no-audio/)
  rejects(['--no-video', '--max-size=1920'], /cannot be combined with --no-video/)
  rejects(['--video-source=camera', '--camera-id=0', '--camera-facing=back'], /either --camera-id or --camera-facing/)
  rejects(['--camera-id=0'], /require --video-source=camera/)
  rejects(['--video-source=camera', '--display-id=1'], /cannot be combined with --video-source=camera/)
  rejects(['--display-id=1', '--new-display'], /cannot be combined with --new-display/)
  rejects(['--record-format=mkv'], /requires --record/)
  rejects(['--no-playback'], /requires --record or --v4l2-sink/)
  accepts(['--record=C:\\Videos\\clip.mkv', '--record-format=mkv', '--no-playback'])
})

test('live ADB flags do not count as a configuration change', () => {
  assert(argsEqual(['--max-fps=60', '--stay-awake'], ['--show-touches', '--max-fps=60']))
  assert(argsEqual(['--a', '--b'], ['--b', '--a']))
  assert(!argsEqual(['--max-fps=60'], ['--max-fps=90']))
})

test('the selected serial is read from the argument array', () => {
  assert.equal(serialFromArgs(['--no-audio', '--serial=192.168.1.5:5555']), '192.168.1.5:5555')
  assert.equal(serialFromArgs(['--select-usb']), '')
})

test('the displayed command quotes values that a shell would split', () => {
  assert.equal(formatCommand([]), 'scrcpy')
  assert.equal(formatCommand(['--no-audio', '--max-fps=60']), 'scrcpy --no-audio --max-fps=60')
  assert.equal(formatCommand(['--record=C:\\My Videos\\a.mp4']), 'scrcpy "--record=C:\\My Videos\\a.mp4"')
  assert.equal(formatCommand(['--window-title=Say "hi"']), 'scrcpy "--window-title=Say \\"hi\\""')
  assert.equal(formatCommand(['--push-target=/sdcard/My Files\\']), 'scrcpy "--push-target=/sdcard/My Files\\\\"')
  assert.equal(formatCommand(['--start-app=a&b']), 'scrcpy "--start-app=a&b"')
})

test('AOA input modes are detected so Windows launches can be refused up front', () => {
  assert.deepEqual(aoaInputOptions(['--keyboard=aoa', '--mouse=sdk', '--gamepad=aoa']), ['--keyboard', '--gamepad'])
  assert.deepEqual(aoaInputOptions(['--keyboard=uhid', '--window-title=aoa']), [])
  // Still syntactically valid: the restriction is about the platform, not the parser.
  accepts(['--keyboard=aoa', '--mouse=aoa', '--gamepad=aoa'])
})

test('scrcpy 5.0 hardware decoding option', () => {
  for (const mode of ['auto', 'disabled', 'vaapi', 'd3d11va', 'videotoolbox']) accepts([`--hwdec=${mode}`])
  rejects(['--hwdec=cuda'], /--hwdec must be one of/)
  rejects(['--hwdec'], /requires a value/)
  // A named decoder needs on-screen playback and no V4L2 sink; auto and disabled do not.
  rejects(['--hwdec=d3d11va', '--no-video-playback'], /requires video playback/)
  rejects(['--hwdec=d3d11va', '--record=a.mp4', '--no-playback'], /requires video playback/)
  rejects(['--hwdec=d3d11va', '--no-window'], /requires video playback/)
  rejects(['--hwdec=vaapi', '--v4l2-sink=/dev/video0'], /not compatible with --v4l2-sink/)
  accepts(['--hwdec=auto', '--record=a.mp4', '--no-playback'])
  accepts(['--hwdec=disabled', '--v4l2-sink=/dev/video0'])
})

test('platform-only settings are refused before launch', () => {
  assert.equal(platformIssue(['--hwdec=d3d11va'], 'win32'), '')
  assert.match(platformIssue(['--hwdec=vaapi'], 'win32'), /only available on Linux/)
  assert.match(platformIssue(['--hwdec=videotoolbox'], 'win32'), /only available on macOS/)
  assert.match(platformIssue(['--hwdec=d3d11va'], 'linux'), /only available on Windows/)
  assert.equal(platformIssue(['--hwdec=auto'], 'linux'), '')
  assert.match(platformIssue(['--keyboard=aoa'], 'win32'), /AOA input cannot be used on Windows/)
  assert.equal(platformIssue(['--keyboard=aoa'], 'linux'), '')
})

test('numeric metadata applies to every audited release and nothing else', () => {
  assert.deepEqual(AUDITED_VERSIONS, ['4.1', '5.0', '5.0.1'])
  for (const version of ['4.1', '4.1.0', '5.0', '5.0.0', '5.0.1']) assert(auditedVersion(version), `${version} should be audited`)
  for (const version of ['3.3.4', '4.0', '4.2', '5.0.2', '5.1', 'unknown']) assert.equal(auditedVersion(version), '', `${version} should not be audited`)
  assert.equal(constraintsFor('--max-size', '5.0.1').sourceVersion, '5.0.1')
  assert.equal(constraintsFor('--max-size', '4.1').sourceVersion, '4.1')
  assert.equal(constraintsFor('--max-size', '5.1'), undefined)
  // No runtime inspected yet: the newest audited table is shown as reference only.
  assert.deepEqual([constraintsFor('--max-size').sourceVersion, constraintsFor('--max-size').referenceOnly], ['5.0.1', true])
})

test('runtime update detection compares release numbers', () => {
  assert(isNewerVersion('5.0.1', '4.1'))
  assert(isNewerVersion('5.0.1', '5.0'))
  assert(isNewerVersion('5.10', '5.9'))
  assert(!isNewerVersion('5.0.1', '5.0.1'))
  assert(!isNewerVersion('4.1', '5.0.1'))
  assert(!isNewerVersion('5.0', '5.0.0'))
  // Unknown on either side never produces an update prompt.
  assert(!isNewerVersion('', '4.1'))
  assert(!isNewerVersion('5.0.1', ''))
  assert(!isNewerVersion('5.0.1', '5.0-dev'))
})
