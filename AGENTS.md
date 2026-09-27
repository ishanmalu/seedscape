# AGENTS.md

Notes for anyone (human or tool) working on this repository.

## Project

Seedscape is a static site: Minecraft seed map, relief/3D view and seed
finder. World generation is cubiomes (C) compiled to WebAssembly and run in
Web Workers. There is no backend and no JS build step.

## Layout

- `wasm/api.c`: every C function the site calls (`sm_*`). Rebuild with
  `./build.sh` after changing it or `vendor/cubiomes`; commit the regenerated
  `public/cubiomes.mjs` and `public/cubiomes.wasm`.
- `public/`: the deployed site. `worker.js` (tiles, structures, meshes, with
  an IndexedDB cache), `finder.js` + `finder-ui.js` (seed search), `app.js`
  (map UI and URL state), `view3d.js` (three.js, lazy loaded), `tools.js`,
  `commands.js`, `waypoints-io.js`, `palette.js`, `seed.js`, `icons.js`
  (original SVG icons), `compare.html`, `sw.js` (offline cache; add new files
  to its CORE list).
- `vendor/cubiomes`: upstream cubiomes, vendored; don't edit in place.
- `public/vendor/three`: three.js r170, vendored; keep versions in sync
  with the import map in `index.html`.

## Commands

```sh
npx serve public      # local dev server
./build.sh            # rebuild WebAssembly (brew install emscripten)
node --test tests/*.test.mjs
vercel deploy --prod  # deploy (pushes to main also deploy via Vercel's GitHub integration)
```

## Conventions

- Plain ES modules, no frameworks, no bundler. Match the existing style:
  small functions, short comments explaining *why*.
- Anything user-controlled that reaches `innerHTML` goes through `esc()`
  from `icons.js` (waypoint names come from share links).
- Validate anything read from the URL hash; links can be hand-edited.
- Don't use Mojang/Minecraft artwork or the Minecraft name in branding.
- Commit messages describe the change and nothing else: no attribution
  trailers or tool credits.

## Checking changes

Run `node --test tests/*.test.mjs` (CI runs it on every push). Then verify
in a browser: map loads with no console errors, structures appear, the finder
returns results that match the map, and 3D builds. When tile output changes
(colours, shading, sampling), bump `CACHE_V` in `worker.js` so cached tiles
are regenerated.
