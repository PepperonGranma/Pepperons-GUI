// Compile and execute the same NSIS macros used by the release. Uses a private
// shortcut/AppUserModelID; never changes the user's application Jump List.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { getMakeNsisPath } = require('app-builder-lib/out/toolsets/windows')
const root = path.resolve(__dirname, '..')
const quote = value => value.replaceAll('$', '$$').replaceAll('"', '$\\"')

async function main() {
  const cache = path.join(root, '.cache')
  await fs.mkdir(cache, { recursive: true })
  const directory = await fs.mkdtemp(path.join(cache, 'shell-probe-'))
  const shortcut = path.join(directory, 'Shortcut with spaces ♥.lnk')
  const results = path.join(directory, 'results.txt')
  const appId = 'studio.scrcpy.shell-acceptance-fixture'
  const nsis = await getMakeNsisPath('0.0.0')
  try {
    for (const phase of ['create', 'cleanup']) {
      const exe = path.join(directory, `${phase}.exe`)
      const source = `Unicode true
RequestExecutionLevel user
SilentInstall silent
OutFile "${quote(exe)}"
!define PEPPERON_SHELL_PROBE "${quote(results)}"
!include "${quote(path.join(root, 'build/nsis/integration.nsh'))}"
Section
${phase === 'create' ? `CreateShortCut "${quote(shortcut)}" "$SYSDIR\\notepad.exe"
!insertmacro PepperonSetShortcutAppId "${quote(shortcut)}" "${appId}"
!insertmacro PepperonTestParameter $6 "keep-shortcuts"
FileOpen $7 "${quote(results)}" a
FileSeek $7 0 END
FileWrite $7 "FlagPresent:$6$\\r$\\n"
!insertmacro PepperonTestParameter $6 "not-present"
FileWrite $7 "FlagAbsent:$6$\\r$\\n"
FileClose $7` : `!insertmacro PepperonUnpinShortcut "${quote(shortcut)}"
!insertmacro PepperonClearDestinations "${appId}"
Delete "${quote(shortcut)}"`}
SectionEnd
`
      execFileSync(nsis.path, ['-V2', '-INPUTCHARSET', 'UTF8', '-'], { input: source, env: { ...process.env, ...nsis.env }, windowsHide: true })
      execFileSync(exe, phase === 'create' ? ['--keep-shortcuts'] : [], { windowsHide: true })
      if (phase === 'create') {
        // Shell property-system reads independently of the NSIS writer.
        const script = `$ProgressPreference='SilentlyContinue'; $folder=(New-Object -ComObject Shell.Application).NameSpace('${directory.replaceAll("'", "''")}'); $item=$folder.ParseName('${path.basename(shortcut)}'); [Console]::Write($item.ExtendedProperty('System.AppUserModel.ID'))`
        const actual = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true }).trim()
        assert.equal(actual, appId, 'Shortcut AppUserModelID did not persist')
      } else {
        await assert.rejects(fs.stat(shortcut), { code: 'ENOENT' })
      }
    }
    const lines = (await fs.readFile(results, 'utf8')).trim().split(/\r?\n/)
    assert.equal(lines.length, 6)
    assert.equal(lines[0], 'SetShortcutAppId:0')
    assert.deepEqual(lines.slice(1, 3), ['FlagPresent:true', 'FlagAbsent:false'])
    // Windows may return S_FALSE for a shortcut that was not pinned.
    assert(/^UnpinShortcut:[01]$/.test(lines[3]), lines[3])
    assert.deepEqual(lines.slice(4), ['RemoveAllDestinations:0', 'DeleteList:0'])
    console.log('PASS Unicode shortcut AppUserModelID persisted; unpin and both Jump List cleanup APIs succeeded; fixture shortcut removed', lines.join(', '))
  } finally {
    // mkdtemp guarantees this is a newly created, project-owned fixture directory.
    await fs.rm(directory, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
