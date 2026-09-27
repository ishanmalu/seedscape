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

static int out[8192]; // shared result buffer (pairs, triples or quads)

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

// ---------------------------------------------------------------------------
// Structure details, layouts, End islands, biome search, palette.

// Variant info for a structure at (x, z), written to out[]:
// [biome, abandoned, start, giant, underground, basement, size, cracked, ship]
EMSCRIPTEN_KEEPALIVE int sm_variant(int type, int x, int z)
{
    StructureVariant sv;
    memset(&sv, 0, sizeof sv);
    memset(out, 0, 9 * sizeof(int));
    int biome = getBiomeAt(&g, 4, (x >> 2) + 2, g_mc >= MC_1_18 ? 319 >> 2 : 0, (z >> 2) + 2);
    if (getVariant(&sv, type, g_mc, g_seed, x, z, biome)) {
        out[0] = sv.biome; out[1] = sv.abandoned; out[2] = sv.start; out[3] = sv.giant;
        out[4] = sv.underground; out[5] = sv.basement; out[6] = sv.size; out[7] = sv.cracked;
    } else out[0] = -1;
    if (type == End_City) {
        static Piece pieces[END_CITY_PIECES_MAX];
        int n = getEndCityPieces(pieces, g_seed, x >> 4, z >> 4);
        for (int i = 0; i < n; i++) if (pieces[i].type == END_SHIP) { out[8] = 1; break; }
    }
    return 1;
}

// Fortress piece footprints as (x0, z0, x1, z1) quads in out[]. Returns count.
EMSCRIPTEN_KEEPALIVE int sm_fortress_pieces(int x, int z)
{
    static Piece list[400];
    int n = getFortressPieces(list, 400, g_mc, g_seed, x >> 4, z >> 4);
    if (n > 400) n = 400;
    for (int i = 0; i < n; i++) {
        out[i*4] = list[i].bb0.x; out[i*4+1] = list[i].bb0.z;
        out[i*4+2] = list[i].bb1.x; out[i*4+3] = list[i].bb1.z;
    }
    return n;
}

// Small End islands in a block rectangle as (x, z, r) triples. Returns count.
EMSCRIPTEN_KEEPALIVE int sm_end_islands(int x0, int z0, int x1, int z1)
{
    int n = 0;
    for (int cz = z0 >> 4; cz <= (z1 >> 4); cz++)
        for (int cx = x0 >> 4; cx <= (x1 >> 4); cx++) {
            EndIsland is[2];
            int k = getEndIslands(is, g_mc, g_seed, cx, cz);
            for (int i = 0; i < k && n < 2700; i++) {
                out[n*3] = is[i].x; out[n*3+1] = is[i].z; out[n*3+2] = is[i].r; n++;
            }
        }
    return n;
}

// Nearest block position of biome `id` to (x, z), searching outward in rings
// up to maxR. Coarser steps further out. Result in out[0..1]; returns 1 if found.
EMSCRIPTEN_KEEPALIVE int sm_locate_biome(int id, int x, int z, int maxR)
{
    int y = g_dim == DIM_END ? 0 : 64 >> 2; // Overworld and Nether biomes vary with height
    if (getBiomeAt(&g, 4, x >> 2, y, z >> 2) == id) { out[0] = x; out[1] = z; return 1; }
    for (int r = 16; r <= maxR; ) {
        int step = r < 1024 ? 16 : r < 4096 ? 32 : 64;
        // Points on the square ring at distance r, spaced `step` apart.
        for (int t = -r; t < r; t += step) {
            int px[4] = { x + t, x + r, x - t, x - r }, pz[4] = { z - r, z + t, z + r, z - t };
            for (int k = 0; k < 4; k++)
                if (getBiomeAt(&g, 4, px[k] >> 2, y, pz[k] >> 2) == id) {
                    out[0] = px[k]; out[1] = pz[k]; return 1;
                }
        }
        r += step;
    }
    return 0;
}

// Override a biome's display colour (used by the map palette).
EMSCRIPTEN_KEEPALIVE void sm_set_color(int id, int r, int gg, int b)
{
    if (!colors_ready) { initBiomeColors(colors); colors_ready = 1; }
    colors[id & 255][0] = r; colors[id & 255][1] = gg; colors[id & 255][2] = b;
}
EMSCRIPTEN_KEEPALIVE void sm_reset_colors(void) { initBiomeColors(colors); colors_ready = 1; }

// ---------------------------------------------------------------------------
// Seed finder. Conditions are packed ints [kind, id, radius, count, extra]:
//   1 structure  `id`: at least `count` within `radius`
//   2 biome      `id`: present within `radius` (extra > 0: covers >= extra %)
//   3 cluster    `id`: `count` of them within `extra` blocks of each other,
//                      somewhere within `radius`
//   4 spawn biome `id`: the world spawn is in this biome (radius ignored)
// Distances are from block 0,0, or from the (estimated) world spawn when
// `fromSpawn` is set. Cheap seed-only structure positions are checked first;
// generators are seeded only for survivors.

enum { C_STRUCT = 1, C_BIOME = 2, C_CLUSTER = 3, C_SPAWN_BIOME = 4, CW = 5,
       MAX_CAND = 64, MAX_REGIONS = 128, MAX_CONDS = 8, SPAWN_SLACK = 1024 };

static Generator fg_ow, fg_nether, fg_end;
static int f_mc = -1, f_done;
static int64_t fout_seed[256];
static int fout_pos[512];
static int cand_x[MAX_CONDS][MAX_CAND], cand_z[MAX_CONDS][MAX_CAND], cand_n[MAX_CONDS];

EMSCRIPTEN_KEEPALIVE int64_t *sm_fout_seed(void) { return fout_seed; }
EMSCRIPTEN_KEEPALIVE int *sm_fout_pos(void) { return fout_pos; }
EMSCRIPTEN_KEEPALIVE int sm_fdone(void) { return f_done; }

static int64_t d2(int x, int z, int cx, int cz) { int64_t dx = x - cx, dz = z - cz; return dx * dx + dz * dz; }

// Structure attempt positions within R of (cx, cz); keeps the nearest MAX_CAND.
static int nearStructures(int ci, int type, int R, int cx, int cz, uint64_t seed)
{
    StructureConfig sc;
    if (!getStructureConfig(type, f_mc, &sc)) return 0;
    int rs = sc.regionSize * 16;
    int rx0 = (int)floor((double)(cx - R) / rs), rx1 = (int)floor((double)(cx + R) / rs);
    int rz0 = (int)floor((double)(cz - R) / rs), rz1 = (int)floor((double)(cz + R) / rs);
    // Small-grid structures with a huge radius would scan millions of regions.
    if (rx1 - rx0 + 1 > MAX_REGIONS) { int m = (rx0 + rx1) / 2; rx0 = m - MAX_REGIONS / 2; rx1 = m + MAX_REGIONS / 2 - 1; }
    if (rz1 - rz0 + 1 > MAX_REGIONS) { int m = (rz0 + rz1) / 2; rz0 = m - MAX_REGIONS / 2; rz1 = m + MAX_REGIONS / 2 - 1; }
    int n = 0;
    for (int rz = rz0; rz <= rz1; rz++)
        for (int rx = rx0; rx <= rx1; rx++) {
            Pos p;
            if (!getStructurePos(type, f_mc, seed, rx, rz, &p)) continue;
            int64_t d = d2(p.x, p.z, cx, cz);
            if (d > (int64_t)R * R) continue;
            if (n < MAX_CAND) { cand_x[ci][n] = p.x; cand_z[ci][n] = p.z; n++; continue; }
            int64_t worst = -1; int wi = 0;
            for (int i = 0; i < n; i++) {
                int64_t di = d2(cand_x[ci][i], cand_z[ci][i], cx, cz);
                if (di > worst) { worst = di; wi = i; }
            }
            if (d < worst) { cand_x[ci][wi] = p.x; cand_z[ci][wi] = p.z; }
        }
    cand_n[ci] = n;
    return n;
}

static Generator *seeded(int dim, uint64_t seed, uint8_t *done)
{
    int k = dim == DIM_NETHER ? 1 : dim == DIM_END ? 2 : 0;
    Generator *gen = k == 1 ? &fg_nether : k == 2 ? &fg_end : &fg_ow;
    if (!done[k]) { applySeed(gen, dim, seed); done[k] = 1; }
    return gen;
}

static int viable(int type, Generator *gen, int x, int z, uint64_t seed)
{
    if (!isViableStructurePos(type, gen, x, z, 0)) return 0;
    if (type == End_City) {
        SurfaceNoise esn;
        initSurfaceNoise(&esn, DIM_END, seed);
        return isViableEndCityTerrain(gen, &esn, x, z);
    }
    if (f_mc >= MC_1_18 && (type == Desert_Pyramid || type == Jungle_Temple || type == Mansion))
        return isViableStructureTerrain(type, gen, x, z);
    return 1;
}

// Biome `id` within R of (cx, cz). minPct == 0: any sample (nearest ring first);
// otherwise at least minPct % of samples. First hit goes to (fx, fz).
static int biomeCheck(Generator *gen, int id, int R, int cx, int cz, int minPct, int *fx, int *fz)
{
    int step = R / 16; if (step < 32) step = 32;
    int total = 0, hits = 0;
    for (int ring = 0; ring * step <= R; ring++)
        for (int j = -ring; j <= ring; j++)
            for (int i = -ring; i <= ring; i++) {
                if (abs(i) != ring && abs(j) != ring) continue;
                int x = cx + i * step, z = cz + j * step;
                if (d2(x, z, cx, cz) > (int64_t)R * R) continue;
                total++;
                if (getBiomeAt(gen, 4, x >> 2, 16, z >> 2) != id) continue;
                if (!hits) { *fx = x; *fz = z; }
                hits++;
                if (minPct == 0) return 1;
            }
    return minPct > 0 && total > 0 && hits * 100 >= minPct * total;
}

EMSCRIPTEN_KEEPALIVE int sm_find(int mc, uint64_t start, int count, const int *cond, int n, int fromSpawn, int maxOut)
{
    if (mc != f_mc) {
        setupGenerator(&fg_ow, mc, 0); setupGenerator(&fg_nether, mc, 0); setupGenerator(&fg_end, mc, 0);
        f_mc = mc;
    }
    if (n > MAX_CONDS) n = MAX_CONDS;
    int found = 0, k;
    for (k = 0; k < count && found < maxOut; k++) {
        uint64_t seed = start + (uint64_t)k;
        int ok = 1;

        // Phase 1: structure positions from the seed alone. Around spawn we
        // don't know the centre yet, so look a bit wider and refine later.
        int slack = fromSpawn ? SPAWN_SLACK : 0;
        for (int c = 0; c < n && ok; c++) {
            const int *q = cond + c * CW;
            if (q[0] == C_STRUCT || q[0] == C_CLUSTER) {
                int need = q[3] < 1 ? 1 : q[3];
                if (nearStructures(c, q[1], q[2] + slack, 0, 0, seed) < need) ok = 0;
            }
        }
        if (!ok) continue;

        uint8_t done[3] = {0, 0, 0};
        int cx = 0, cz = 0;
        if (fromSpawn) {
            Pos sp = estimateSpawn(seeded(DIM_OVERWORLD, seed, done), NULL);
            cx = sp.x; cz = sp.z;
        }

        // Phase 2: biome/terrain checks, seeding generators only as needed.
        int fx = cx, fz = cz;
        for (int c = 0; c < n && ok; c++) {
            const int *q = cond + c * CW;
            int kind = q[0], id = q[1], R = q[2], need = q[3] < 1 ? 1 : q[3], extra = q[4];
            if (kind == C_STRUCT || kind == C_CLUSTER) {
                StructureConfig sc;
                getStructureConfig(id, mc, &sc);
                Generator *gen = seeded(sc.dim, seed, done);
                int vx[MAX_CAND], vz[MAX_CAND], nv = 0;
                for (int i = 0; i < cand_n[c]; i++) {
                    int x = cand_x[c][i], z = cand_z[c][i];
                    if (d2(x, z, cx, cz) > (int64_t)R * R) continue;
                    if (!viable(id, gen, x, z, seed)) continue;
                    vx[nv] = x; vz[nv] = z; nv++;
                    if (kind == C_STRUCT && nv >= need) break;
                }
                if (kind == C_STRUCT) {
                    ok = nv >= need;
                    if (ok && c == 0) { fx = vx[0]; fz = vz[0]; }
                } else {
                    // Some structure with need-1 others within `extra` blocks.
                    ok = 0;
                    for (int i = 0; i < nv && !ok; i++) {
                        int near = 1;
                        for (int j = 0; j < nv; j++)
                            if (j != i && d2(vx[i], vz[i], vx[j], vz[j]) <= (int64_t)extra * extra) near++;
                        if (near >= need) { ok = 1; if (c == 0) { fx = vx[i]; fz = vz[i]; } }
                    }
                }
            } else if (kind == C_BIOME) {
                int bx, bz;
                ok = biomeCheck(seeded(DIM_OVERWORLD, seed, done), id, R, cx, cz, extra, &bx, &bz);
                if (ok && c == 0) { fx = bx; fz = bz; }
            } else if (kind == C_SPAWN_BIOME) {
                Generator *gen = seeded(DIM_OVERWORLD, seed, done);
                if (!fromSpawn) { Pos sp = estimateSpawn(gen, NULL); cx = sp.x; cz = sp.z; }
                ok = getBiomeAt(gen, 4, cx >> 2, 16, cz >> 2) == id;
                if (ok && c == 0) { fx = cx; fz = cz; }
            }
        }
        if (!ok) continue;
        fout_seed[found] = (int64_t)seed;
        fout_pos[found*2] = fx; fout_pos[found*2+1] = fz;
        found++;
    }
    f_done = k;
    return found;
}
