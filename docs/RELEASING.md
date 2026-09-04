# Windows releases

Pepperon's GUI keeps its existing `studio.scrcpy.desktop` app ID and
`scrcpy-studio` user-data/local-storage identifiers. Do not rename these during
branding or packaging changes: they preserve installed upgrades and saved profiles.

## Reproducible build

Use Node.js 22.12+ (Node 24 is used for release validation), then:

```powershell
npm ci
npm run build
npm run dist
```

Electron and electron-builder are pinned in `package.json` and the lockfile.
The release target is Windows x64 NSIS. Keep the old release outside the output
directory, or remove only the validated generated `release` directory, before
creating final artifacts. Never clear the user's AppData to test an upgrade.

`build/icon.ico` and `build/icon.png` are exports of the existing `CatMark`
markup/styles and default theme, not a replacement design. Regenerate them with
`npm run build:icons` after an intentional source-icon change. The icon exporter
uses an isolated `.cache/icon-export` profile, never the user's GUI data. Only
the ICO is copied to packaged runtime resources; exporter source and PNG stay out.

## Smoke and regression tests

Launch the **packaged or installed** executable with a unique
`--remote-debugging-port=PORT`, set `SCRCPY_STUDIO_DEBUG_URL` to its localhost URL,
and run:

```powershell
npm run test:commands
npm run test:ui
npm run test:guide
npm run test:device
npm run test:hardening
```

`SCRCPY_TEST_SERIAL` optionally selects the phone for `test:device`.
`scripts/e2e-profile-relaunch.cjs stage|verify` requires a complete app restart
between stages. `scripts/e2e-release-shutdown.cjs` covers `security`, `offline`,
`idle`, `mirroring`, `applying`, `recording`, `persist-stage`, and `persist-verify`.
It closes the app; relaunch for each mode. Recording mode creates and removes its own
temporary recording directory. Set `PEPPERON_RELEASE_RECORDING` only to intentionally
retain a capture at a new path for manual inspection. Persistence probes restore the original settings.
Keep shared ADB running and do not substitute logical disconnect tests for a physical
USB-unplug test. Never distribute shortcuts with remote-debugging flags.

Run `node scripts/verify-package.cjs` after packaging to check ASAR contents, source
matching, all embedded icon groups, metadata, sizes, and SHA-256 hashes. Additional
EXE path arguments verify the installed app and uninstaller with the same checks.

## Unsigned and trusted signing

The checked-in build intentionally uses `win.signExecutable: false`. Unlike the
old `signAndEditExecutable: false` workaround, this preserves executable resource
editing, including the app icon, product name, author, and version. It does not
claim a trusted publisher or suppress Windows warnings.

For a trusted release, obtain a legitimate Windows code-signing identity first:

- Use a CA-issued Authenticode certificate with its private key available through
  the provider's supported hardware token/HSM or certificate store. In builder 26,
  enable `win.signExecutable`, set `win.signtoolOptions.certificateSubjectName`
  or `certificateSha1` to select that identity, and configure its supported signing
  integration and RFC 3161 timestamp service. If the provider legitimately supports
  a PFX/P12, use secret `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` environment values;
  never commit the certificate, private key, or password.
- Alternatively, use an approved Azure Trusted Signing account/certificate profile
  and `win.azureSignOptions` (endpoint, account name, profile, publisher). Supply
  Entra authentication through protected CI credentials with signing permission.
- Enable `forceCodeSigning: true` in that signing environment so a missing identity
  fails the build. Verify Authenticode signatures and timestamps on both application
  and installer, then retest install/upgrade/uninstall. Do not create a self-signed
  production certificate. Signing does not guarantee immediate SmartScreen reputation.

Configuration above is for the pinned builder **26.x** schema, not the redesigned
27.x prerelease schema. References: [builder 26 Windows options](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.16.0/packages/app-builder-lib/src/options/winOptions.ts),
[Electron migration notes](https://www.electronjs.org/docs/latest/breaking-changes).
