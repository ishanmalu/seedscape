#!/bin/sh
# Rebuild public/cubiomes.{mjs,wasm} from vendor/cubiomes + wasm/api.c.
set -e
cd "$(dirname "$0")"
C=vendor/cubiomes
emcc -O3 -I$C wasm/api.c $C/generator.c $C/layers.c $C/biomenoise.c $C/biomes.c \
  $C/noise.c $C/finders.c $C/util.c $C/quadbase.c -o public/cubiomes.mjs \
  -sMODULARIZE -sEXPORT_ES6 -sENVIRONMENT=worker,node -sALLOW_MEMORY_GROWTH \
  -sEXPORTED_RUNTIME_METHODS=ccall,HEAPU8,HEAP32,UTF8ToString 2>&1 | grep -v -i warning || true
