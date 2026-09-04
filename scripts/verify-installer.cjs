// Deep, read-only inspection of every executable/archive layer in the release.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const pkg = require('../package.json')
const installer = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, 'release', `${pkg.build.productName} Setup ${pkg.version}.exe`)
const sevenZip = 'C:/Program Files/7-Zip/7z.exe'
const hash = data => createHash('sha256').update(data).digest('hex')
const forbiddenHash = '9be85b986ea66a6997dde658abe82b3147ed2a1a3dcb784bb5176f41d22815a6'

function extract(type, archive, output) {
  fs.mkdirSync(output, { recursive: true })
  execFileSync(sevenZip, ['x', `-t${type}`, archive, `-o${output}`, '-y'], { windowsHide: true, stdio: 'pipe' })
}
function filesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const item = path.join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(item) : [item]
  })
}
function scan(directory, layer) {
  const files = filesBelow(directory)
  for (const file of files) {
    const relative = path.relative(directory, file)
    assert(!/winshell\.dll/i.test(relative), `${layer} contains forbidden file: ${relative}`)
    const data = fs.readFileSync(file)
    assert.notEqual(hash(data), forbiddenHash, `${layer} contains the removed DLL under another name: ${relative}`)
    assert(!data.includes(Buffer.from('WinShell.dll')) && !data.includes(Buffer.from('WinShell.dll', 'utf16le')), `${layer} references the removed DLL: ${relative}`)
  }
  return files
}

async function main() {
  assert(fs.existsSync(sevenZip), '7-Zip is required for release archive inspection')
  assert(fs.existsSync(installer), 'Release installer is missing')
  const cache = path.join(root, '.cache')
  await fsp.mkdir(cache, { recursive: true })
  const work = await fsp.mkdtemp(path.join(cache, 'package-audit-'))
  try {
    const outer = path.join(work, 'outer')
    extract('Nsis', installer, outer)
    const outerFiles = scan(outer, 'outer installer')
    const plugins = outerFiles.filter(file => /\.dll$/i.test(file)).map(file => path.basename(file)).sort()
    assert.deepEqual(plugins, ['SpiderBanner.dll', 'System.dll', 'nsExec.dll', 'nsis7z.dll'], 'Unexpected installer plug-in set')
    const appArchive = outerFiles.find(file => /app-64\.7z$/i.test(file))
    const uninstaller = outerFiles.find(file => /Uninstall Pepperon's GUI\.exe$/i.test(file))
    assert(appArchive && uninstaller, 'Installer payload or uninstaller is missing')

    const app = path.join(work, 'app')
    extract('7z', appArchive, app)
    scan(app, 'application payload')
    const sourceArchive = path.join(app, 'resources', 'licenses', 'sources', 'nsis7z-19.00-source.zip')
    assert(fs.existsSync(sourceArchive), 'Corresponding Nsis7z source is missing')
    const source = path.join(work, 'source')
    extract('zip', sourceArchive, source)
    const sourceFiles = scan(source, 'corresponding source archive')
    assert(sourceFiles.length > 300, 'Corresponding source archive is unexpectedly incomplete')

    const uninstallLayer = path.join(work, 'uninstaller')
    extract('Nsis', uninstaller, uninstallLayer)
    scan(uninstallLayer, 'nested uninstaller')

    for (const [name, expected] of Object.entries({
      'nsis7z.dll': 'b393f05e8ff919ef071181050e1873c9a776e1a0ae8329aefff7007d0cadf592',
      'SpiderBanner.dll': '996a259e53ca18b89ec36d038c40148957c978c0fd600a268497d4c92f882a93',
    })) {
      const file = outerFiles.find(item => path.basename(item).toLowerCase() === name.toLowerCase())
      assert.equal(hash(fs.readFileSync(file)), expected, `${name} differs from its reviewed upstream binary`)
    }
    console.log(JSON.stringify({ installer, bytes: fs.statSync(installer).size, sha256: hash(fs.readFileSync(installer)), outerEntries: outerFiles.length, sourceFiles: sourceFiles.length }))
    console.log('PASS deep installer, payload, uninstaller, corresponding-source, plug-in allowlist, and removed-DLL inspection')
  } finally {
    assert(work.startsWith(path.join(cache, 'package-audit-')), 'Unsafe audit cleanup path')
    await fsp.rm(work, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
