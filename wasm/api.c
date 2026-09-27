// Thin bridge between cubiomes and the browser. One generator per worker.
#include <emscripten.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "generator.h"
#include "finders.h"
#include "util.h"

static Generator g;
static int g_mc = MC_NEWEST;
static int g_dim = DIM_OVERWORLD;
static uint64_t g_seed;
static unsigned char colors[256][3];
static int colors_ready;

static unsigned char *pix;
static int *cache;
static size_t pix_cap, cache_cap;

EMSCRIPTEN_KEEPALIVE int sm_newest(void) { return MC_NEWEST; }

EMSCRIPTEN_KEEPALIVE void sm_init(int mc, uint64_t seed, int dim)
{
    if (!colors_ready) { initBiomeColors(colors); colors_ready = 1; }
    g_mc = mc; g_seed = seed; g_dim = dim;
    setupGenerator(&g, mc, 0);
    applySeed(&g, dim, seed);
}

// Render biomes for a w*h area at the given scale (1, 4, 16, ...), as RGBA.
EMSCRIPTEN_KEEPALIVE unsigned char *sm_biomes(int scale, int x, int z, int w, int h, int y)
{
    Range r = { scale, x, z, w, h, y, 1 };
    size_t need = getMinCacheSize(&g, scale, w, 1, h);
    if (need > cache_cap) { free(cache); cache = malloc(need * sizeof(int)); cache_cap = need; }
    if ((size_t)w * h * 4 > pix_cap) { free(pix); pix_cap = (size_t)w * h * 4; pix = malloc(pix_cap); }
    if (genBiomes(&g, cache, r)) return 0;
    for (int i = 0; i < w * h; i++) {
        int id = cache[i];
        unsigned char *c = (id >= 0 && id < 256) ? colors[id] : colors[0];
        pix[i*4] = c[0]; pix[i*4+1] = c[1]; pix[i*4+2] = c[2]; pix[i*4+3] = 255;
    }
    return pix;
}

EMSCRIPTEN_KEEPALIVE int sm_biome_at(int x, int y, int z) { return getBiomeAt(&g, 1, x, y, z); }
EMSCRIPTEN_KEEPALIVE const char *sm_biome_name(int id) { return biome2str(g_mc, id); }

// Surface noise for the current seed and dimension, built on first use.
static SurfaceNoise sn;
static uint64_t sn_seed = ~0ULL;
static int sn_dim = DIM_UNDEF;
static void surface(void)
{
    if (sn_seed == g_seed && sn_dim == g_dim) return;
    initSurfaceNoise(&sn, g_dim, g_seed);
    sn_seed = g_seed; sn_dim = g_dim;
}

static int out[8192];

// Viable structure positions of a type within a block rectangle. Returns
// count; positions are in the static buffer as x,z pairs.
EMSCRIPTEN_KEEPALIVE int *sm_out(void) { return out; }

EMSCRIPTEN_KEEPALIVE int sm_structures(int type, int x0, int z0, int x1, int z1)
{
    StructureConfig sc;
    if (!getStructureConfig(type, g_mc, &sc) || sc.dim != g_dim) return 0;
    int rs = sc.regionSize * 16;
    int rx0 = (int)floor((double)x0 / rs), rz0 = (int)floor((double)z0 / rs);
    int rx1 = (int)floor((double)x1 / rs), rz1 = (int)floor((double)z1 / rs);
    int n = 0;
    for (int rz = rz0; rz <= rz1; rz++)
    for (int rx = rx0; rx <= rx1; rx++) {
        Pos p;
        if (!getStructurePos(type, g_mc, g_seed, rx, rz, &p)) continue;
        if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1) continue;
        if (!isViableStructurePos(type, &g, p.x, p.z, 0)) continue;
        // Biomes alone overshoot these; cubiomes has extra terrain checks.
        if (type == End_City) {
            surface();
            if (!isViableEndCityTerrain(&g, &sn, p.x, p.z)) continue;
        } else if (g_mc >= MC_1_18 && g_dim == DIM_OVERWORLD &&
                   (type == Desert_Pyramid || type == Jungle_Temple || type == Mansion)) {
            if (!isViableStructureTerrain(type, &g, p.x, p.z)) continue;
        }
        if (n >= 4096) return n;
        out[n*2] = p.x; out[n*2+1] = p.z; n++;
    }
    return n;
}

EMSCRIPTEN_KEEPALIVE int sm_spawn(void)
{
    Pos p = getSpawn(&g);
    out[0] = p.x; out[1] = p.z;
    return 1;
}

EMSCRIPTEN_KEEPALIVE int sm_strongholds(int count)
{
    StrongholdIter sh;
    Generator og;
    setupGenerator(&og, g_mc, 0);
    applySeed(&og, DIM_OVERWORLD, g_seed);
    initFirstStronghold(&sh, g_mc, g_seed);
    int n = 0;
    while (n < count && n < 4096) {
        int more = nextStronghold(&sh, &og);
        out[n*2] = sh.pos.x; out[n*2+1] = sh.pos.z; n++;
        if (more <= 0) break;
    }
    return n;
}

// Slime chunks in a chunk rectangle, as a byte mask (1 = slime).
EMSCRIPTEN_KEEPALIVE unsigned char *sm_slime(int cx, int cz, int w, int h)
{
    if ((size_t)w * h > pix_cap) { free(pix); pix_cap = (size_t)w * h; pix = malloc(pix_cap); }
    for (int j = 0; j < h; j++)
        for (int i = 0; i < w; i++)
            pix[j*w+i] = isSlimeChunk(g_seed, cx+i, cz+j);
    return pix;
}

EMSCRIPTEN_KEEPALIVE int sm_str2mc(const char *s) { return str2mc(s); }
EMSCRIPTEN_KEEPALIVE int *sm_ids(void) { return cache; }
EMSCRIPTEN_KEEPALIVE unsigned char *sm_color(int id) { return colors[id & 255]; }

// Approximate surface height (blocks) for a w*h grid of cells, each `scale`
// blocks apart, starting at block (x, z). Overworld only.
static float *hbuf;
static int *ibuf;
static size_t hcap;

EMSCRIPTEN_KEEPALIVE int *sm_hids(void) { return ibuf; }

EMSCRIPTEN_KEEPALIVE float *sm_heights(int scale, int x, int z, int w, int h)
{
    if (g_dim != DIM_OVERWORLD || g_mc < MC_1_18) return 0;
    surface();
    if ((size_t)w * h > hcap) {
        free(hbuf); free(ibuf); hcap = (size_t)w * h;
        hbuf = malloc(hcap * sizeof(float)); ibuf = malloc(hcap * sizeof(int));
    }
    if (scale == 4) {
        if (mapApproxHeight(hbuf, ibuf, &g, &sn, x >> 2, z >> 2, w, h)) return 0;
        return hbuf;
    }
    for (int j = 0; j < h; j++)
        for (int i = 0; i < w; i++) {
            float y;
            if (mapApproxHeight(&y, 0, &g, &sn, (x + i * scale) >> 2, (z + j * scale) >> 2, 1, 1)) return 0;
            hbuf[j * w + i] = y;
        }
    return hbuf;
}
