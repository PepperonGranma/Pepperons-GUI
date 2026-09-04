# Third-party notices

Pepperon's GUI is licensed under Apache-2.0. The components below retain their own
licenses and are not relicensed by this project.

## Included in the Windows application

| Component | Version | License | How it is included |
| --- | ---: | --- | --- |
| [Electron](https://github.com/electron/electron) | 44.2.0 | MIT | Desktop runtime; its `LICENSE.electron.txt` is placed beside the application executable |
| [Chromium](https://www.chromium.org/) and related Electron runtime components | Electron 44.2.0 distribution | Multiple | Electron places `LICENSES.chromium.html` beside the application executable |
| [Node.js](https://github.com/nodejs/node) | Electron 44.2.0 distribution | MIT and bundled notices | Embedded by Electron; the Node.js section of `LICENSES.chromium.html` preserves its full notices |
| [React, React DOM, and Scheduler](https://github.com/react/react) | 19.2.8 / 19.2.8 / 0.27.0 | MIT | Compiled into the renderer bundle; see `licenses/react-MIT.txt` |
| [Lucide React icons](https://github.com/lucide-icons/lucide) | 0.468.0 | ISC | Selected icons compiled into the renderer bundle; see `licenses/lucide-ISC.txt` |
| [adm-zip](https://github.com/cthackers/adm-zip) | 0.6.0 | MIT | Runtime dependency retained in the application archive; see `licenses/adm-zip-MIT.txt` |

These accompanying license files retain the upstream copyright notices and full
license terms. Electron's Chromium notice collection also covers its embedded
third-party libraries, not just Chromium itself.

The CatMark application icon is generated from this repository's own markup, styles,
and default theme. The GUI uses system fonts and does not bundle third-party photos,
videos, audio, or font files.

## Optional scrcpy runtime

scrcpy is **not embedded in the Pepperon's GUI installer**. Users may choose an
existing installation, or ask the Windows app to download the official Genymobile
release archive directly from GitHub. The archive is unpacked intact, including its
`LICENSE.txt`, into the app's user-data directory.

scrcpy 4.1 is Apache-2.0 software developed by Genymobile, Romain Vimont, and
contributors. Its Windows distribution reports
linked SDL, FFmpeg/libav, and libusb components and includes ADB. Their applicable
copyright and license information remains part of the upstream distribution and
source projects. Pepperon's GUI does not modify or repackage those binaries.

- scrcpy: https://github.com/Genymobile/scrcpy
- Android Debug Bridge / platform tools: https://developer.android.com/tools/adb
- SDL: https://github.com/libsdl-org/SDL
- FFmpeg: https://ffmpeg.org/
- libusb: https://github.com/libusb/libusb

## Build and test tooling

Vite, the Vite React plugin, TypeScript, electron-builder, concurrently, cross-env,
wait-on, type declarations, and their transitive packages are development tools.
They are not copied into the application archive as standalone packages. Their
versions and license identifiers are recorded in `package-lock.json` and the
installed packages' own metadata.

The lockfile includes MPL-2.0-licensed Lightning CSS and its platform binaries as
development-only tooling. It also includes permissive WTFPL and dual-licensed
utilities in the packaging toolchain. None of these packages is copied into the
distributed application archive. No npm package in this lockfile has an unknown or
`UNLICENSED` license identifier.
