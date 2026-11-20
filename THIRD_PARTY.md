# Third-party items

Every third-party item (code, fonts, sounds, images) used in this repo is listed here with its license.
The CHIP-8 emulator, font glyphs, and test ROM are written from scratch for this project.

| Item | Type | Source | License | License file |
|---|---|---|---|---|
| typescript | dev dependency (npm) | https://www.npmjs.com/package/typescript | Apache-2.0 | `node_modules/typescript/LICENSE.txt` |
| vite | dev dependency (npm) | https://www.npmjs.com/package/vite | MIT | `node_modules/vite/LICENSE.md` |
| vitest | dev dependency (npm) | https://www.npmjs.com/package/vitest | MIT | `node_modules/vitest/LICENSE.md` |
| Octo compiler (`compiler.js`) | vendored code | https://github.com/JohnEarnest/Octo (commit `76f816c8e36891478e1caf5209d85a95d16a38dc`, file `js/compiler.js`), copyright (c) 2015 John Earnest | MIT (verified from the repository's LICENSE.txt and GitHub license metadata) | `src/compiler/LICENSE` |


Transitive npm packages are installed from the registry under their own licenses (see `package-lock.json`).

The vendored file `src/compiler/octo-compiler.js` has one change from upstream, documented in its header: the last line became an ES module export. `src/compiler/compile.ts` and `octo-compiler.d.ts` are our own.

No new third-party items in spec 5 (crt-ui): the shader, CSS, lightning and audio code are written for this project, and the UI uses system fonts only.
