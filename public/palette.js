// "Natural" map palette: muted, atlas-like colours by biome name. Biomes not
// listed keep cubiomes' classic colour. Shared by the page and the workers.
export const NATURAL = {
  ocean: '#1f4f8a', deep_ocean: '#173d6e', warm_ocean: '#2a8fb0', lukewarm_ocean: '#2878a8',
  deep_lukewarm_ocean: '#1f5f8f', cold_ocean: '#24558c', deep_cold_ocean: '#1b447a',
  frozen_ocean: '#6b8fb8', deep_frozen_ocean: '#4f6f9a', river: '#3a78c4', frozen_river: '#8fb0d8',
  plains: '#8fb35a', sunflower_plains: '#a3bd55', meadow: '#9cc46a', cherry_grove: '#e8a8c8',
  forest: '#4f7f37', flower_forest: '#6f9a3f', birch_forest: '#6a9a4a', old_growth_birch_forest: '#5f8f45',
  dark_forest: '#355a26', pale_garden: '#b8bdb0', taiga: '#3f6b4a', old_growth_pine_taiga: '#4a5f3a',
  old_growth_spruce_taiga: '#43603c', snowy_taiga: '#a7c4b8', grove: '#a8c6b5',
  snowy_plains: '#e6eef2', ice_spikes: '#c9e3f0', snowy_slopes: '#e4ecf2', frozen_peaks: '#cfe0ee',
  jagged_peaks: '#dfe6ec', stony_peaks: '#9a9a9e', beach: '#e0d49a', snowy_beach: '#e8e4d0',
  stony_shore: '#8c8c88', desert: '#e3cf8c', savanna: '#b5ad5c', savanna_plateau: '#a79f55',
  windswept_savanna: '#9c9760', badlands: '#c46a3a', eroded_badlands: '#cf7a45',
  wooded_badlands: '#a8763f', jungle: '#3f8f2a', sparse_jungle: '#5f9a3a', bamboo_jungle: '#6aa032',
  swamp: '#4f6a45', mangrove_swamp: '#3f6040', mushroom_fields: '#a07fa8',
  windswept_hills: '#7d8a78', windswept_gravelly_hills: '#8a8a86', windswept_forest: '#56705a',
  dripstone_caves: '#7a6a58', lush_caves: '#5f9a4a', deep_dark: '#1f2a33',
  nether_wastes: '#7a2e2a', soul_sand_valley: '#5e4a3c', crimson_forest: '#8f2230',
  warped_forest: '#2a6f6a', basalt_deltas: '#4a4a50',
  the_end: '#8c86a0', small_end_islands: '#6f6a82', end_midlands: '#9c95b0',
  end_highlands: '#aaa3bf', end_barrens: '#7c7690', the_void: '#0b0d12',
};
export const PALETTES = { classic: {}, natural: NATURAL };
export const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
