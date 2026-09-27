# Seedmap

Minecraft (Java 1.18+) seed map: biomes, structures, strongholds, spawn, slime chunks
and grid on one pannable map, with shareable links. Runs entirely in the browser.

- `vendor/cubiomes`: [cubiomes](https://github.com/Cubitect/cubiomes) @ e61f905 (MIT), vendored
- `wasm/api.c`: bridge exported to JS; `./build.sh` rebuilds `public/cubiomes.{mjs,wasm}` (needs emscripten)
- `public/`: static site (worker pool renders 256px tiles, `app.js` draws)

Run locally: `npx serve public`
