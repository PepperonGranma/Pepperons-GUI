# 🐾 Pepperon GUI

> A friendly Windows control room for scrcpy—because nobody should have to
> memorize a small novel of command-line flags just to mirror a phone.

[![Latest release](https://img.shields.io/github/v/release/PepperonGranma/Pepperons-GUI?color=ff6bd6)](https://github.com/PepperonGranma/Pepperons-GUI/releases/latest)
[![Status](https://img.shields.io/badge/status-community%20project-00dec7)](#project-status)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-2f81f7)](#system-requirements)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

Pepperon GUI wraps [scrcpy](https://github.com/Genymobile/scrcpy) in a
responsive Electron desktop interface. Connect an Android device, shape a setup,
and press **Start Mirroring**. The app assembles and validates an argument array, launches
scrcpy directly, and keeps the command preview visible so nothing is hidden behind
the curtain.

```text
📱 Android device  →  🔌 ADB  →  🌶️ Pepperon GUI  →  🖥️ scrcpy
```

## Highlights

- **A real control room:** video, camera, audio, input, display, recording, virtual
  displays, window behavior, and the complete runtime-reported scrcpy catalog.
- **Capability-aware controls:** the GUI inspects the selected device and keeps
  device-specific choices separate from scrcpy parser constraints.
- **Suggestions for your device:** six ready-made setups — lowest latency, highest
  quality, streaming, recording and more — worked out from what the connected phone
  reports, each with the reasons behind it.
- **Predictable live changes:** eligible controls apply in place; startup-only
  changes are coalesced into one clean restart.
- **Profiles that remember the whole mix:** save, rename, load, delete, export, and
  import setups without losing the current session on an invalid import.
- **USB and local Wi-Fi ADB:** discover, pair, connect, reconnect, and select devices.
- **A GUI with a pulse:** dark/light modes, editable theme colors, density, radius,
  highlight color, responsive layouts, a first-run tour, and a cat who takes startup
  quality control very seriously.
- **Motion you control:** a drifting aurora backdrop, a 3D device that leans toward the
  pointer, card spotlights, and press ripples — each adjustable or switched off under
  Appearance → Motion & effects, and always off when Windows asks for reduced motion.
- **Out of the way when you want it:** an optional minimize-to-system-tray mode keeps
  mirroring running without a taskbar button.
- **No mystery shell command:** CTRL + K searches the catalog, and the exact desired
  argument array remains visible before launch.

## Install

### Windows installer

Download the Windows x64 installer from the project's
[latest GitHub Release](https://github.com/PepperonGranma/Pepperons-GUI/releases/latest),
run it, then connect a device with USB
debugging enabled. Builds are currently unsigned, so Windows may show a publisher or
SmartScreen warning; verify that the file came from this repository before running it.

Pepperon GUI can use `scrcpy.exe` from `SCRCPY_PATH`, `PATH`, the application
directory, or a path you choose. On Windows, **Install scrcpy** downloads the latest
official Genymobile release, verifies the GitHub-provided SHA-256 digest when one is
available, and keeps that runtime in the app's user-data directory.

### Run from source

```powershell
git clone https://github.com/PepperonGranma/Pepperons-GUI.git
cd Pepperons-GUI
npm ci
npm run dev
```

`npm ci` uses the reviewed lockfile. Development requires Node.js 22.12 or newer;
Node.js 24 is the release-validation environment.

## First connection

1. Enable Android **Developer options** and **USB debugging**.
2. Connect the phone by USB and accept its ADB authorization prompt.
3. Select the device in Pepperon GUI.
4. Choose a preset or tune the controls yourself.
5. Press **Start Mirroring**. When the show is over, press **Stop Mirroring**.

Wireless ADB remains on your local network. Pair or enable TCP/IP from the Connection
card, then select the wireless device just like a USB device.

## System requirements

- Windows 10 or 11, x64
- Node.js 22.12+ only when building from source
- An Android device supported by the selected scrcpy features
- USB debugging, or local-network ADB for wireless use
- scrcpy 5.0.1 recommended; 4.1, 5.0 and 5.0.1 have the fully audited numeric constraint set

The app's runtime catalog is parsed from the installed `scrcpy --help` output, but
version-specific numeric metadata is enabled only for reviewed releases: 4.1, 5.0 and
5.0.1. Other versions are best-effort until audited. scrcpy 5.0 added hardware video
decoding on the computer; choose the decoder under **Video → Hardware decoding**. When a
newer official release exists, the Studio page offers to update the managed runtime.

## Privacy and security

Mirroring, recording, and device commands run locally between this computer, ADB,
scrcpy, and the selected Android device. Pepperon GUI has no cloud relay, account,
analytics, telemetry, or remote font dependency. At startup and when runtime status
is refreshed, the app checks GitHub for the latest official scrcpy release. Runtime
downloads and external project links are user-initiated. Wireless ADB naturally uses
your local network.

The Electron renderer is sandboxed with context isolation, navigation is blocked,
external links are allowlisted, and child processes receive argument arrays with the
shell disabled. See [SECURITY.md](SECURITY.md) for responsible reporting.

## Development and validation

```powershell
npm ci
npm run build
npm test
npm run dist
node scripts/verify-package.cjs
```

`npm test` runs the unit tests for argument validation, the scrcpy/ADB output parsers,
and the audited numeric constraints; it needs no device. The same checks run in CI on
every push and pull request.

The Windows end-to-end suites cover the interface, first-run guide, startup ordering,
single-instance behavior, all-command editing, profiles, lifecycle hardening, package
shutdown, and a safe physical-device flow. Several suites require a packaged/debug
instance or an authorized device; their exact setup is in
[docs/RELEASING.md](docs/RELEASING.md).

The generated `dist/`, `release/`, `.cache/`, and `node_modules/` directories are not
source and are intentionally ignored.

## Project map

```text
electron/   Electron main process, IPC boundary, argument validation, output parsers,
            and scrcpy constraints
src/        React renderer: app shell, pages/, shared controls, command catalog, tour
test/       Unit tests (node:test) for the dependency-free electron/ modules
scripts/    Icon exporter plus device, UI, package, and lifecycle checks
docs/       Release workflow and scrcpy constraint audit
build/      Icon exports of the project mark used by Windows packaging
licenses/   License texts for third-party code bundled into the application
```

## Project status

Pepperon GUI 1.5.0 is a Windows-first community project. The current build
target is Windows x64 NSIS and is intentionally unsigned. There is no automatic GUI
updater yet, and physical USB unplug/replug remains a manual release check.

Pepperon GUI is an independent graphical front-end for
[scrcpy](https://github.com/Genymobile/scrcpy), developed by Genymobile, Romain Vimont,
and contributors under [Apache-2.0](https://github.com/Genymobile/scrcpy/blob/v4.1/LICENSE).
This project is not affiliated with, endorsed by, or an official project of Genymobile
or the scrcpy maintainers.

## Contributing

Bug reports and focused pull requests are welcome. Please read
[CONTRIBUTING.md](CONTRIBUTING.md), keep generated output out of commits, and include
the smallest test that proves your change. Ideas are welcome too—especially the sort
that make Pepperon purr without making the settings page grow whiskers.

## License and acknowledgements

Pepperon GUI is licensed under the [Apache License 2.0](LICENSE). Third-party
components keep their own licenses; packaged and optional-runtime details are listed
in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Big paw-bump to Genymobile, Romain Vimont, and the scrcpy contributors for the
engine under the hood—and to the Electron, Chromium, Node.js, React, Lucide, and
Feather communities whose work helps this control room feel at home on Windows.
Names and links are acknowledgements, not endorsements; the formal credits and
license texts live in the third-party notices above.
