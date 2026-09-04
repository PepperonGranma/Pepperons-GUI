// Read-only checks of the actual Windows artifacts. Optional arguments add installed EXEs.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const asar = require('@electron/asar')
const resedit = require('resedit')
const root = path.resolve(__dirname, '..')
const pkg = require('../package.json')
const sha256 = data => createHash('sha256').update(Buffer.from(data)).digest('hex')
const normalizedText = data => Buffer.from(data).toString('utf8').replaceAll('\r\n', '\n').trimEnd()
const iconBytes = fs.readFileSync(path.join(root, 'build/icon.ico'))
const expectedIcons = new Set(resedit.Data.IconFile.from(iconBytes).icons.map(item => sha256(item.data.bin)))
const release = path.join(root, 'release')
const unpacked = path.join(release, 'win-unpacked')
const archive = path.join(unpacked, 'resources/app.asar')
const files = asar.listPackage(archive).map(file => file.slice(1)).filter(file => !asar.statFile(archive, file).files)
assert(files.length > 0, 'The application archive is empty')
const forbidden = /(^|[\\/])(src|scripts|tests?|docs|\.git|\.cache|screenshots?)([\\/]|$)|\.(map|log|mp4|mkv|m4a|ts|tsx)$/i
assert.deepEqual(files.filter(file => forbidden.test(file)), [], 'Development files leaked into the application archive')
for (const file of ['electron/main.cjs', 'electron/preload.cjs', 'electron/command-constraints.mjs', 'dist/index.html', ...fs.readdirSync(path.join(root, 'dist/assets')).map(file => `dist/assets/${file}`)]) {
  assert(asar.extractFile(archive, path.normalize(file)).equals(fs.readFileSync(path.join(root, file))), `Stale packaged file: ${file}`)
}
assert(fs.readFileSync(path.join(unpacked, 'resources/icon.ico')).equals(iconBytes), 'Runtime icon differs from the source icon')
const requiredLegalFiles = [
  ['LICENSE', 'resources/LICENSE.txt'],
  ['THIRD_PARTY_NOTICES.md', 'resources/THIRD_PARTY_NOTICES.md'],
  ['licenses/adm-zip-MIT.txt', 'resources/licenses/adm-zip-MIT.txt'],
  ['licenses/react-MIT.txt', 'resources/licenses/react-MIT.txt'],
  ['licenses/lucide-ISC.txt', 'resources/licenses/lucide-ISC.txt'],
]
for (const [source, packaged] of requiredLegalFiles) {
  assert(fs.readFileSync(path.join(unpacked, packaged)).equals(fs.readFileSync(path.join(root, source))), `Missing or stale packaged legal file: ${packaged}`)
}
for (const file of ['LICENSE.electron.txt', 'LICENSES.chromium.html']) {
  assert(fs.statSync(path.join(unpacked, file)).size > 1000, `Missing Electron runtime notice: ${file}`)
}
assert.equal(normalizedText(asar.extractFile(archive, path.normalize('node_modules/adm-zip/LICENSE'))), normalizedText(fs.readFileSync(path.join(root, 'licenses/adm-zip-MIT.txt'))), 'adm-zip license differs from reviewed copy')
for (const [dependency, notice] of [['react', 'react-MIT.txt'], ['react-dom', 'react-MIT.txt'], ['scheduler', 'react-MIT.txt'], ['lucide-react', 'lucide-ISC.txt']]) {
  assert.equal(normalizedText(fs.readFileSync(path.join(root, 'node_modules', dependency, 'LICENSE'))), normalizedText(fs.readFileSync(path.join(root, 'licenses', notice))), `${dependency} license differs from reviewed copy`)
}
for (const file of files.filter(file => /\.(js|cjs|css|html)$/.test(file))) {
  const text = asar.extractFile(archive, file).toString()
  assert(!text.includes(root) && !text.includes(root.replaceAll('\\', '/')), `Development path embedded in ${file}`)
  if (file.endsWith('.css')) assert(!/@import\s|https?:\/\//i.test(text), `Remote stylesheet resource in ${file}`)
}
const packagedVersion = JSON.parse(asar.extractFile(archive, 'package.json')).version
assert.equal(packagedVersion, pkg.version, 'Packaged app version is stale')
assert.equal(pkg.license, 'Apache-2.0', 'Package license metadata is incorrect')
const executables = [path.join(unpacked, `${pkg.build.productName}.exe`), path.join(release, `${pkg.build.productName} Setup ${pkg.version}.exe`), ...process.argv.slice(2).map(file => path.resolve(file))]
for (const file of executables) {
  const data = fs.readFileSync(file)
  const resources = resedit.NtExecutableResource.from(resedit.NtExecutable.from(data, { ignoreCert: true }))
  const groups = resedit.Resource.IconGroupEntry.fromEntries(resources.entries)
  assert(groups.length, `Missing executable icon: ${file}`)
  for (const group of groups) {
    const icons = group.getIconItemsFromEntries(resources.entries)
    assert(icons.length && icons.every(icon => icon.isRaw() && expectedIcons.has(sha256(icon.bin))), `Unexpected/default icon remains: ${file}`)
  }
  const versions = resedit.Resource.VersionInfo.fromEntries(resources.entries).flatMap(info => info.getAllLanguagesForStringValues().map(language => info.getStringValues(language)))
  assert(versions.length && versions.every(info => info.ProductName === pkg.build.productName && info.CompanyName === 'PepperonGranma' && info.FileVersion === pkg.version), `Incorrect executable metadata: ${file}`)
  console.log(JSON.stringify({ path: file, bytes: data.length, sha256: sha256(data), iconGroups: groups.length, iconSizes: groups[0].icons.map(icon => icon.width || 256), version: versions[0].FileVersion }))
}
console.log(`PASS packaged assets, metadata, icons, and archive hygiene (${files.length} files; ${fs.statSync(archive).size} ASAR bytes)`)
