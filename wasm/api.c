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
            if (mapApproxHeight(&y, &ibuf[j * w + i], &g, &sn, (x + i * scale) >> 2, (z + j * scale) >> 2, 1, 1)) return 0;
            hbuf[j * w + i] = y;
        }
    return hbuf;
}

// ---------------------------------------------------------------------------
// Seed finder. Conditions are packed ints: [kind, id, radius] per condition,
// measured from block 0,0. kind 1 = structure type `id`, kind 2 = biome `id`.
// Cheap seed-only structure positions are checked first; generators are only
// seeded for survivors. Matches go to fout as (seed, x, z of first condition).

enum { COND_STRUCT = 1, COND_BIOME = 2, MAX_CAND = 16 };

static Generator fg_ow, fg_nether, fg_end;
static int f_mc = -1;
static int64_t fout_seed[256];
static int fout_pos[512];

EMSCRIPTEN_KEEPALIVE int64_t *sm_fout_seed(void) { return fout_seed; }
EMSCRIPTEN_KEEPALIVE int *sm_fout_pos(void) { return fout_pos; }

static int cand_x[8][MAX_CAND], cand_z[8][MAX_CAND], cand_n[8];

static int nearStructures(int ci, int type, int R, uint64_t seed)
{
    StructureConfig sc;
    if (!getStructureConfig(type, f_mc, &sc)) return 0;
    int rs = sc.regionSize * 16;
    int r0 = (int)floor((double)-R / rs), r1 = (int)floor((double)R / rs);
    int n = 0;
    for (int rz = r0; rz <= r1; rz++)
        for (int rx = r0; rx <= r1; rx++) {
            Pos p;
            if (!getStructurePos(type, f_mc, seed, rx, rz, &p)) continue;
            if ((int64_t)p.x * p.x + (int64_t)p.z * p.z > (int64_t)R * R) continue;
            if (n < MAX_CAND) { cand_x[ci][n] = p.x; cand_z[ci][n] = p.z; n++; }
        }
    cand_n[ci] = n;
    return n;
}

static Generator *seeded(int dim, uint64_t seed, uint8_t *done)
{
    int k = dim == DIM_NETHER ? 1 : dim == DIM_END ? 2 : 0;
    Generator *g = k == 1 ? &fg_nether : k == 2 ? &fg_end : &fg_ow;
    if (!done[k]) { applySeed(g, dim, seed); done[k] = 1; }
    return g;
}

static int viable(int type, Generator *g, int x, int z, uint64_t seed)
{
    if (!isViableStructurePos(type, g, x, z, 0)) return 0;
    if (type == End_City) {
        SurfaceNoise esn;
        initSurfaceNoise(&esn, DIM_END, seed);
        return isViableEndCityTerrain(g, &esn, x, z);
    }
    if (f_mc >= MC_1_18 && (type == Desert_Pyramid || type == Jungle_Temple || type == Mansion))
        return isViableStructureTerrain(type, g, x, z);
    return 1;
}

static int hasBiome(Generator *g, int id, int R, int *fx, int *fz)
{
    int step = R / 16; if (step < 32) step = 32;
    // Spiral-ish: rings outward so near hits exit early.
    for (int ring = 0; ring * step <= R; ring++) {
        for (int j = -ring; j <= ring; j++)
            for (int i = -ring; i <= ring; i++) {
                if (abs(i) != ring && abs(j) != ring) continue;
                int x = i * step, z = j * step;
                if ((int64_t)x * x + (int64_t)z * z > (int64_t)R * R) continue;
                if (getBiomeAt(g, 4, x >> 2, 16, z >> 2) == id) { *fx = x; *fz = z; return 1; }
            }
    }
    return 0;
}

EMSCRIPTEN_KEEPALIVE int sm_find(int mc, uint64_t start, int count, const int *cond, int n, int maxOut)
{
    if (mc != f_mc) {
        setupGenerator(&fg_ow, mc, 0); setupGenerator(&fg_nether, mc, 0); setupGenerator(&fg_end, mc, 0);
        f_mc = mc;
    }
    if (n > 8) n = 8;
    int found = 0;
    for (int k = 0; k < count && found < maxOut; k++) {
        uint64_t seed = start + (uint64_t)k;
        int ok = 1;
        // Phase 1: structure positions from the seed alone.
        for (int c = 0; c < n && ok; c++)
            if (cond[c*3] == COND_STRUCT && !nearStructures(c, cond[c*3+1], cond[c*3+2], seed)) ok = 0;
        if (!ok) continue;

        // Phase 2: biome/terrain viability, seeding generators only as needed.
        uint8_t done[3] = {0, 0, 0};
        int fx = 0, fz = 0;
        for (int c = 0; c < n && ok; c++) {
            int kind = cond[c*3], id = cond[c*3+1], R = cond[c*3+2];
            if (kind == COND_STRUCT) {
                StructureConfig sc;
                getStructureConfig(id, mc, &sc);
                Generator *g = seeded(sc.dim, seed, done);
                int any = 0;
                for (int i = 0; i < cand_n[c] && !any; i++)
                    if (viable(id, g, cand_x[c][i], cand_z[c][i], seed)) {
                        any = 1;
                        if (c == 0) { fx = cand_x[c][i]; fz = cand_z[c][i]; }
                    }
                ok = any;
            } else if (kind == COND_BIOME) {
                int bx, bz;
                ok = hasBiome(seeded(DIM_OVERWORLD, seed, done), id, R, &bx, &bz);
                if (ok && c == 0) { fx = bx; fz = bz; }
            }
        }
        if (!ok) continue;
        fout_seed[found] = (int64_t)seed;
        fout_pos[found*2] = fx; fout_pos[found*2+1] = fz;
        found++;
    }
    return found;
}
EMSCRIPTEN_KEEPALIVE int sm_biome_generates(int mc, int id) { return isOverworld(mc, id); }

// After sm_heights: mapApproxHeight reports the biome at the ground, which under
// water is often a cave biome. Swap in the biome at sea level for submerged
// cells. Ocean biomes are large, so sample them on a 4x coarser grid.
EMSCRIPTEN_KEEPALIVE int *sm_surface_biomes(int scale, int x, int z, int w, int h)
{
    int cw = (w + 3) / 4, ch = (h + 3) / 4;
    int *coarse = malloc(sizeof(int) * cw * ch);
    for (int k = 0; k < cw * ch; k++) coarse[k] = -1;
    for (int j = 0; j < h; j++)
        for (int i = 0; i < w; i++) {
            if (hbuf[j * w + i] >= 63) continue;
            int *c = &coarse[(j / 4) * cw + i / 4];
            if (*c < 0) {
                int si = (i / 4) * 4 + 2, sj = (j / 4) * 4 + 2;
                *c = getBiomeAt(&g, 4, (x + si * scale) >> 2, 63 >> 2, (z + sj * scale) >> 2);
            }
            ibuf[j * w + i] = *c;
        }
    free(coarse);
    return ibuf;
}
