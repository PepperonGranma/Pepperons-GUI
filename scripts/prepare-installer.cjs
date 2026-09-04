// Build-time adaptation of the pinned MIT-licensed electron-builder templates.
// Keep the normal two-pass installer/uninstaller pipeline and resource editing.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { getNsisPluginsPath } = require('app-builder-lib/out/toolsets/windows')
let originalPlugins

exports.default = async function prepareInstaller(context) {
  if (context.electronPlatformName !== 'win32') return
  assert.equal(require('app-builder-lib/package.json').version, '26.16.0', 'Review installer templates before changing electron-builder')
  const root = context.packager.projectDir
  const output = path.join(root, '.cache', 'nsis-templates')
  const resources = path.join(root, '.cache', 'nsis-resources')
  const upstream = path.join(path.dirname(require.resolve('app-builder-lib/package.json')), 'templates', 'nsis')
  // Only these plug-ins are needed by the Windows x64 one-click installer.
  const plugins = {
    'nsis7z.dll': 'b393f05e8ff919ef071181050e1873c9a776e1a0ae8329aefff7007d0cadf592',
    'SpiderBanner.dll': '996a259e53ca18b89ec36d038c40148957c978c0fd600a268497d4c92f882a93',
  }
  // Cache the original lookup before setting our override, including when the
  // builder invokes this hook more than once in the same process.
  originalPlugins ??= getNsisPluginsPath('0.0.0')
  const sourcePlugins = await originalPlugins
  await fs.mkdir(output, { recursive: true })
  await fs.mkdir(path.join(resources, 'plugins', 'x86-unicode'), { recursive: true })
  // Remove only the generated hook outputs, never the shared builder cache.
  for (const directory of [output, path.join(resources, 'plugins', 'x86-unicode')]) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      assert(entry.isFile(), `Unexpected directory in generated installer inputs: ${entry.name}`)
      await fs.unlink(path.join(directory, entry.name))
    }
  }
  for (const [plugin, expectedHash] of Object.entries(plugins)) {
    const data = await fs.readFile(path.join(sourcePlugins, 'x86-unicode', plugin))
    assert.equal(createHash('sha256').update(data).digest('hex'), expectedHash, `Unreviewed installer plug-in: ${plugin}`)
    await fs.writeFile(path.join(resources, 'plugins', 'x86-unicode', plugin), data)
  }
  let replaced = 0
  let finalCleanupAdded = 0
  for (const directory of [upstream, path.join(upstream, 'include')]) {
    for (const file of await fs.readdir(directory)) {
      if (!/\.(nsi|nsh)$/.test(file)) continue
      let source = await fs.readFile(path.join(directory, file), 'utf8')
      source = source.replace(/WinShell::(SetLnkAUMI|UninstShortcut|UninstAppUserModelId)/g, (_, operation) => {
        replaced++
        return '!insertmacro ' + ({ SetLnkAUMI: 'PepperonSetShortcutAppId', UninstShortcut: 'PepperonUnpinShortcut', UninstAppUserModelId: 'PepperonClearDestinations' })[operation]
      })
      source = source
        .replaceAll('${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$startAppArgs"', 'ExecShell "open" "$launchLink" "$startAppArgs"')
        .replaceAll('${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"', 'ExecShell "open" "$launchLink" "$1"')
        .replaceAll('${StdUtils.GetParentPath} $R5 `${TO}`', '${GetParent} `${TO}` $R5')
        .replaceAll('${StdUtils.GetAllParameters} $R8 "0"', 'StrCpy $R8 $CMDLINE')
        .replaceAll('${StdUtils.GetAllParameters} $R0 0', '${GetParameters} $R0')
      if (file === 'uninstaller.nsh') {
        const registryCleanup = '  DeleteRegKey SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}"'
        assert(source.includes(registryCleanup), 'Pinned uninstaller cleanup changed; review before packaging')
        source = source.replace(registryCleanup, `${registryCleanup}

  # Shell cleanup runs after the first install-directory removal. Remove any
  # empty directory recreated while Windows resolves shortcut properties.
  SetOutPath $TEMP
  RMDir /REBOOTOK "$INSTDIR"`)
        finalCleanupAdded++
      }
      // StdUtils' remaining two call sites belong only to the NSIS web target.
      // This project builds the offline NSIS target and rejects that drift below.
      assert(!/WinShell::/i.test(source), `Unreviewed shortcut operation in ${file}`)
      await fs.writeFile(path.join(output, file), '; Adapted for Pepperon\'s GUI: Shell calls use the project System/COM macros.\n; Upstream electron-builder 26.16.0, MIT; see licenses/electron-builder-MIT.txt.\n' + source)
    }
  }
  assert.equal(replaced, 10, 'Pinned shortcut call sites changed; review before packaging')
  assert.equal(finalCleanupAdded, 1, 'Final uninstall cleanup was not applied exactly once')
  const generated = (await Promise.all((await fs.readdir(output)).map(file => fs.readFile(path.join(output, file), 'utf8')))).join('\n')
  assert.equal((generated.match(/StdUtils::/g) || []).length, 58, 'Pinned StdUtils definitions changed; review the offline target')
  assert.equal((generated.match(/\$\{StdUtils\./g) || []).length, 2, 'Unexpected StdUtils call in offline installer templates')
  process.env.ELECTRON_BUILDER_NSIS_RESOURCES_DIR = resources
  console.log('Prepared NSIS System/COM integration and restricted installer plug-in inputs')
}
