const assert = require('node:assert/strict')

async function main() {
  const { PARSER_CONSTRAINTS, allowedDescription, constraintsFor, validateConstraint, withConstraints } = await import('../electron/command-constraints.mjs')
  const expectedNumeric = [
    '--audio-bit-rate', '--audio-buffer', '--audio-output-buffer', '--camera-fps', '--display-id', '--max-size', '--min-size-alignment',
    '--port', '--screen-off-timeout', '--time-limit', '--tunnel-port', '--v4l2-buffer', '--video-bit-rate', '--video-buffer',
    '--window-height', '--window-width', '--window-x', '--window-y',
  ]
  assert.deepEqual(Object.entries(PARSER_CONSTRAINTS).filter(([, rule]) => rule.integer).map(([name]) => name).sort(), expectedNumeric.sort(), '4.1 numeric parser audit changed')

  const accepts = (name, values) => values.forEach(value => assert.equal(validateConstraint(value, constraintsFor(name, '4.1')), '', `${name} rejected ${value}`))
  const rejects = (name, values) => values.forEach(value => assert.notEqual(validateConstraint(value, constraintsFor(name, '4.1')), '', `${name} accepted ${value}`))
  accepts('--video-bit-rate', ['0', '8M', '128k', '2147483647', '2147M', '0x10K'])
  rejects('--video-bit-rate', ['-1', '2147483648', '2148M', '1G', '1.5M', 'banana'])
  accepts('--max-size', ['0', '65535', '0xFFFF', '01777'])
  rejects('--max-size', ['-1', '65536', '1.5', '08'])
  accepts('--min-size-alignment', ['1', '2', '4', '8', '16', '0x10'])
  rejects('--min-size-alignment', ['0', '3', '15', '17'])
  accepts('--audio-buffer', ['0', '3600000'])
  rejects('--audio-buffer', ['-1', '3600001'])
  accepts('--audio-output-buffer', ['0', '1000'])
  rejects('--audio-output-buffer', ['-1', '1001'])
  accepts('--camera-fps', ['0', '65535'])
  rejects('--camera-fps', ['-1', '65536'])
  accepts('--screen-off-timeout', ['0', '2147483'])
  rejects('--screen-off-timeout', ['-1', '2147484'])
  accepts('--window-x', ['auto', '-32767', '32767'])
  rejects('--window-x', ['-32768', '32768'])
  accepts('--port', ['0', '65535', '27199:27183'])
  rejects('--port', ['-1', '65536', '1:2:3', ':123'])
  accepts('--capture-orientation', ['0', 'flip270', '@', '@90', '@flip180'])
  rejects('--capture-orientation', ['45', '@45'])

  const bitrate = constraintsFor('--video-bit-rate', '4.1')
  assert.equal(allowedDescription(bitrate), '0 – 2,147,483,647 bit/s')
  assert.equal(constraintsFor('--max-size', '4.2'), undefined, '4.1 metadata leaked to an unreviewed runtime')
  assert.equal(constraintsFor('--max-fps', '4.1'), undefined, 'An invented max-fps bound returned')
  const fromHelp = withConstraints({ name: '--max-size', description: 'Limit dimensions. Default is 0 (unlimited).', source: 'runtime' }, '4.1')
  assert.equal(fromHelp.constraints.defaultValue, '0 (unlimited)')
  console.log(`PASS ${expectedNumeric.length} audited numeric commands, exact boundaries, suffixes, zeroes, discrete values, help defaults, and version gating`)
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1 })
