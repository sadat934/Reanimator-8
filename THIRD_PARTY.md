# Third-party items

Every third-party item (code, fonts, sounds, images) used in this repo is listed here with its license.
The CHIP-8 emulator, font glyphs, and test ROM are written from scratch for this project.

| Item | Type | Source | License | License file |
|---|---|---|---|---|
| typescript | dev dependency (npm) | https://www.npmjs.com/package/typescript | Apache-2.0 | `node_modules/typescript/LICENSE.txt` |
| vite | dev dependency (npm) | https://www.npmjs.com/package/vite | MIT | `node_modules/vite/LICENSE.md` |
| vitest | dev dependency (npm) | https://www.npmjs.com/package/vitest | MIT | `node_modules/vitest/LICENSE.md` |

Transitive npm packages are installed from the registry under their own licenses (see `package-lock.json`).

## Planned

- **Octo** (CHIP-8 high-level compiler): to be vendored in spec 2 (`compiler-and-harness`), with its license file kept next to the vendored code under `src/compiler/`. Not present yet.
