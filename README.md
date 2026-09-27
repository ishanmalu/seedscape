# Seedscape

A Minecraft Java seed explorer that puts everything on one map: biomes,
structures, strongholds, spawn and slime chunks, with shaded relief, a 3D
terrain view and a seed finder. Everything runs in your browser.

**Live:** https://seedscape.vercel.app

## Features

- **One map, every layer.** Biomes plus 18 structure types, spawn,
  strongholds, slime chunks and a chunk grid, each toggleable.
- **Relief and 3D.** Hill-shaded terrain on the map, or a 3D diorama of up to
  3,200 × 3,200 blocks with coordinates and a live X/Y/Z readout.
- **Seed finder.** Search for seeds where structures and biomes are within
  a set distance of 0, 0, using every CPU core.
- **Waypoints.** Pin coordinates on the map or in 3D; pins travel with the
  share link.
- **Shareable links.** Seed, version, position, layers and pins all live in
  the URL.
- Overworld, Nether and End; Java 1.18 – 1.21.4. Works offline after the
  first visit.

## Accuracy

Structure positions and biomes come from cubiomes, which reimplements
Minecraft's world generation. Desert pyramids, jungle temples and mansions
use an approximate terrain check on 1.18+, and the 3D terrain is an
approximation of the surface (no trees, caves or buildings).

## Development

The site is static files in `public/`; there is no build step for the web
code.

```sh
npx serve public          # run locally on http://localhost:3000
./build.sh                # rebuild the WebAssembly (needs emscripten)
```

| Path | What it is |
|---|---|
| `wasm/api.c` | C bridge over cubiomes, compiled to `public/cubiomes.{mjs,wasm}` |
| `public/worker.js` | Map tiles and 3D meshes, run in a pool of workers |
| `public/finder.js`, `finder-ui.js` | Seed finder worker and panel |
| `public/app.js` | Map, layers, waypoints, URL state |
| `public/view3d.js` | three.js 3D view (loaded on demand) |
| `public/sw.js` | Offline support |

## Credits

- [cubiomes](https://github.com/Cubitect/cubiomes) by Cubitect (MIT), vendored in `vendor/cubiomes`
- [three.js](https://threejs.org) r170 (MIT), vendored in `public/vendor/three`

Not an official Minecraft product. Not approved by or associated with Mojang
or Microsoft.

## License

MIT, see [LICENSE](LICENSE).
