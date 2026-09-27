# Seedscape

A Minecraft Java seed explorer that puts everything on one map: biomes,
structures, strongholds, spawn and slime chunks, with shaded relief, a 3D
terrain view and a seed finder. Everything runs in your browser.

**Live:** https://seedscape.vercel.app

## Features

- **One map, every layer.** Biomes plus 23 structure and feature types
  (villages to geodes, End gateways and islands), spawn, strongholds, slime
  chunks, a chunk grid and a structure-density heatmap.
- **Relief and 3D.** Hill-shaded terrain on the map, or a 3D diorama of up to
  3,200 × 3,200 blocks with coordinates and a live X/Y/Z readout.
- **Underground biomes.** View biomes at any height, e.g. the deep dark at y −40.
- **Structure details.** Click a structure: village type and zombie villages,
  bastion type, igloo basements, portal variants, End cities with ships,
  fortress layouts drawn on the map.
- **Seed finder.** Structures and biomes within range of 0, 0 or the world
  spawn: at least N of a structure, clusters (e.g. witch huts close together),
  biome coverage, spawn in a biome. Uses every CPU core and estimates rarity.
- **Biome search.** Jump to the nearest cherry grove, mushroom island, etc.
- **Tools.** Distance ruler (with Nether distance), Nether portal link helper,
  ⌘K command palette.
- **Waypoints.** Pin coordinates on the map or in 3D; import/export as JSON or
  Xaero's Minimap files; pins travel with the share link.
- **Share.** Links hold the whole view; PNG and 4K poster export; embeddable
  map; side-by-side seed comparison.
- Overworld, Nether and End; Java 1.18 – 1.21.4 and Bedrock (biomes only).
  Works offline after the first visit; generated tiles are cached locally.

## Accuracy

Structure positions and biomes come from cubiomes, which reimplements
Minecraft's world generation. Desert pyramids, jungle temples and mansions
use an approximate terrain check on 1.18+, and the 3D terrain is an
approximation of the surface (no trees, caves or buildings).

## Development

The site is static files in `public/`; there is no build step for the web
code.

```sh
npx serve public                 # run locally on http://localhost:3000
./build.sh                       # rebuild the WebAssembly (needs emscripten)
node --test tests/*.test.mjs     # tests (also run in CI on every push)
```

| Path | What it is |
|---|---|
| `wasm/api.c` | C bridge over cubiomes, compiled to `public/cubiomes.{mjs,wasm}` |
| `public/worker.js` | Map tiles and 3D meshes, run in a pool of workers |
| `public/finder.js`, `finder-ui.js` | Seed finder worker and panel |
| `public/app.js` | Map, layers, waypoints, URL state |
| `public/view3d.js` | three.js 3D view (loaded on demand) |
| `public/tools.js`, `commands.js`, `waypoints-io.js` | Ruler/portal tools, ⌘K palette, pin files |
| `public/compare.html` | Side-by-side seed comparison |
| `public/sw.js` | Offline support |
| `scripts/og.*` | Regenerates the social preview image |
| `tests/` | Node tests for the WebAssembly build and pure modules |

## Credits

- [cubiomes](https://github.com/Cubitect/cubiomes) by Cubitect (MIT), vendored in `vendor/cubiomes`
- [three.js](https://threejs.org) r170 (MIT), vendored in `public/vendor/three`
- [Inter](https://rsms.me/inter/) and [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (SIL OFL 1.1), in `public/fonts`

Bedrock shares Java's biome generation for a seed but places structures
differently, so the Bedrock option shows biomes and terrain only.

Page views are counted with Vercel Web Analytics (no cookies) on the live site only.

Not an official Minecraft product. Not approved by or associated with Mojang
or Microsoft.

## Support

Seedscape is free and has no ads. If it helps you, you can
[buy me a coffee](https://buymeacoffee.com/ishanmalu).

Built by [Ishan Malu](https://github.com/ishanmalu).

## License

MIT, see [LICENSE](LICENSE).
