# Seedscape

Minecraft (Java 1.18–1.21.4) seed explorer for seedscape.world: biomes, structures,
strongholds, spawn and slime chunks on one map, with shaded relief, a 3D terrain
view and shareable links. Runs entirely in the browser.

- `vendor/cubiomes`: [cubiomes](https://github.com/Cubitect/cubiomes) (MIT), vendored
- `wasm/api.c`: bridge exported to JS; `./build.sh` rebuilds `public/cubiomes.{mjs,wasm}` (needs emscripten)
- `public/`: static site. `worker.js` renders tiles in a pool, `app.js` draws the map,
  `view3d.js` is the three.js diorama (lazy-loaded), `icons.js` holds the original icon set

Accuracy: positions come from cubiomes. Desert pyramids, jungle temples and mansions
use cubiomes' approximate terrain check on 1.18+; 3D terrain is an approximate surface.

Run locally: `npx serve public`
