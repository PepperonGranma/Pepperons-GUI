# Third-party notices

Pepperon's GUI is licensed under Apache-2.0. The components below retain their
own licenses and are not relicensed by this project.

## Included in the Windows application

| Component | Version | License | Packaged notice |
| --- | ---: | --- | --- |
| [Electron](https://github.com/electron/electron) | 44.2.0 | MIT | `LICENSE.electron.txt` beside the installed executable |
| Chromium and Electron runtime components | Electron 44.2.0 distribution | Multiple | `LICENSES.chromium.html` beside the executable |
| Node.js | Electron 44.2.0 distribution | MIT and bundled notices | Node.js section of `LICENSES.chromium.html` |
| React, React DOM, Scheduler | 19.2.8 / 19.2.8 / 0.27.0 | MIT | `licenses/react-MIT.txt` |
| Lucide React | 0.468.0 | ISC | `licenses/lucide-ISC.txt` |
| Feather icon designs incorporated by Lucide | 4.29.2 lineage | MIT | `licenses/feather-MIT.txt` |
| adm-zip | 0.6.0 | MIT | `licenses/adm-zip-MIT.txt` |

The Lucide ISC notice credits Cole Bemis for the Feather portions. The separate
Feather MIT notice, including its 2013–2023 Cole Bemis copyright, is included
in full as requested by that upstream license.

Electron's Chromium notice collection covers the runtime libraries embedded in
that distribution. The CatMark icon and startup cat are project artwork made
from repository markup and styles. The application uses system fonts and does
not bundle third-party photos, video, audio, or font files.

## Included in the Windows installer

The installer is generated from the MIT-licensed electron-builder 26.16.0 NSIS
templates. Pepperon's GUI makes a small, documented template adaptation at build
time; the full upstream notice is in `licenses/electron-builder-MIT.txt`.

| Component | Version | License or permission | Packaged notice |
| --- | ---: | --- | --- |
| NSIS core, System plug-in, nsExec plug-in, and standard headers | 3.0.4.1 toolset | zlib/libpng and applicable bundled terms | `licenses/NSIS-COPYING.txt` |
| Nsis7z | 19.00 | LGPL-2.1-or-later as stated by its authors; embedded LZMA SDK is public domain | `licenses/nsis7z-ReadMe.txt`, `licenses/LGPL-2.1.txt`, `licenses/LZMA-SDK-public-domain.txt`, and corresponding source in `licenses/sources/nsis7z-19.00-source.zip` |
| SpiderBanner | 2016-06-24 build | Author's installer-use permission and NSIS API terms | `licenses/SpiderBanner-ReadMe.txt` and `licenses/NSIS-COPYING.txt` |

The Nsis7z source archive contains the matching 19.00 plug-in sources combined
with the LZMA SDK 19.00 C/C++ sources that its build instructions require. Build
products, user-specific project settings, and third-party import libraries are
excluded. The archived source SHA-256 is
`866253a1c82e51e071ba92053c8762c8369d5ea436248c7e460047f0d4f430e7`.

No separate shortcut helper library is redistributed. Shortcut AppUserModelID,
unpin, and Jump List cleanup use the standard NSIS System plug-in and documented
Windows COM interfaces. The per-user offline build also disables electron-builder's
unused elevation helper and replaces its utility plug-in calls with standard NSIS
functions.

## Optional scrcpy runtime

scrcpy is **not embedded in the Pepperon's GUI installer**. Users may choose an
existing installation, or ask the app to download an official Genymobile release
archive directly from GitHub. The archive is unpacked intact, including its
`LICENSE.txt`, into the app's user-data directory.

scrcpy 4.1 is Apache-2.0 software developed by Genymobile, Romain Vimont, and
contributors. Its Windows archive includes ADB and reports SDL, FFmpeg/libav,
libusb, and dav1d components. Their notices and license terms remain part of the
upstream archive and projects; Pepperon's GUI neither modifies nor republishes
those binaries.

- [scrcpy](https://github.com/Genymobile/scrcpy)
- [Android Debug Bridge / platform tools](https://developer.android.com/tools/adb)
- [SDL](https://github.com/libsdl-org/SDL)
- [FFmpeg](https://ffmpeg.org/)
- [libusb](https://github.com/libusb/libusb)
- [dav1d](https://code.videolan.org/videolan/dav1d)

## Build and test tooling

Vite, the Vite React plug-in, TypeScript, electron-builder, concurrently,
cross-env, wait-on, type declarations, and their transitive packages are
development tools. Except for the attributed electron-builder template code,
they are not copied into the final installer as runtime packages. Their exact
versions and license identifiers are recorded in `package-lock.json` and their
package metadata.

The reviewed lockfile has no dependency with an unknown or `UNLICENSED` license
identifier. Development-only packages include MPL-2.0 Lightning CSS, permissive
WTFPL utilities, and dual-licensed utilities; they are not redistributed in the
application archive.
