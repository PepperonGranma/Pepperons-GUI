# Contributing to Pepperon's GUI

Thanks for helping improve the control room.

## Before opening a pull request

1. Search existing issues and keep each change focused.
2. Use Node.js 22.12 or newer and install with `npm ci`.
3. Run `npm run build` and `npm run test:constraints`.
4. Run the relevant UI, profile, lifecycle, or device suite described in
   [docs/RELEASING.md](docs/RELEASING.md).
5. Do not commit `node_modules/`, `dist/`, `release/`, `.cache/`, recordings,
   credentials, certificates, local paths, or user settings.

For command metadata, distinguish scrcpy parser rules from device capability and cite
the tagged upstream parser source. See
[docs/COMMAND-CONSTRAINTS.md](docs/COMMAND-CONSTRAINTS.md).

By submitting a contribution, you agree that it is licensed under this project's
[Apache License 2.0](LICENSE).
