export const DICE_FONTS = Object.freeze([
  { id: 'serif', name: 'Royal Serif', family: 'Georgia, serif' },
  { id: 'classic', name: 'Classic', family: '"Times New Roman", serif' },
  { id: 'sans', name: 'Modern', family: 'Arial, sans-serif' },
  { id: 'round', name: 'Adventurer', family: '"Trebuchet MS", sans-serif' },
  { id: 'mono', name: 'Runic Mono', family: '"Courier New", monospace' },
]);
export const DICE_MATERIALS = Object.freeze([
  { id: 'metal', name: 'Polished Metal', metalness: .85, roughness: .22, clearcoat: .4, transmission: 0 },
  { id: 'satin', name: 'Satin Metal', metalness: .65, roughness: .5, clearcoat: .1, transmission: 0 },
  { id: 'resin', name: 'Glossy Resin', metalness: .08, roughness: .22, clearcoat: 1, transmission: 0 },
  { id: 'stone', name: 'Matte Stone', metalness: 0, roughness: .9, clearcoat: 0, transmission: 0 },
  { id: 'glass', name: 'Frosted Crystal', metalness: .08, roughness: .3, clearcoat: 1, transmission: .28 },
]);
export const DICE_PATTERNS = Object.freeze([
  { id: 'none', name: 'Solid' }, { id: 'marble', name: 'Marble' },
  { id: 'speckled', name: 'Speckled' }, { id: 'stripes', name: 'Stripes' },
  { id: 'runes', name: 'Rune Marks' }, { id: 'stars', name: 'Starfield' },
]);
export const DICE_PALETTE = Object.freeze([
  ['Bronze', '#734b30'], ['Ruby', '#a92e46'], ['Amber', '#dc9c2e'],
  ['Emerald', '#268861'], ['Sapphire', '#3266c9'], ['Amethyst', '#8654bb'],
  ['Rose', '#d87fba'], ['Teal', '#2aafb5'], ['Ivory', '#e9debd'], ['Obsidian', '#272735'],
]);
export const DEFAULT_APPEARANCE = Object.freeze({
  bodyColor: '#734b30', numberColor: '#fff0c5', edgeColor: '#d6ae63',
  font: 'serif', material: 'resin', pattern: 'none', patternColor: '#d6ae63', patternScale: 1,
  metalness: .48, roughness: .32,
});
const color = (value, fallback) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
const amount = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
export function normalizeAppearance(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  return {
    bodyColor: color(value.bodyColor, DEFAULT_APPEARANCE.bodyColor),
    numberColor: color(value.numberColor, DEFAULT_APPEARANCE.numberColor),
    edgeColor: color(value.edgeColor, DEFAULT_APPEARANCE.edgeColor),
    font: DICE_FONTS.some(item => item.id === value.font) ? value.font : DEFAULT_APPEARANCE.font,
    material: DICE_MATERIALS.some(item => item.id === value.material) ? value.material : DEFAULT_APPEARANCE.material,
    pattern: DICE_PATTERNS.some(item => item.id === value.pattern) ? value.pattern : DEFAULT_APPEARANCE.pattern,
    patternColor: color(value.patternColor, DEFAULT_APPEARANCE.patternColor),
    patternScale: typeof value.patternScale === 'number' && Number.isFinite(value.patternScale)
      ? Math.max(.25, Math.min(4, value.patternScale)) : DEFAULT_APPEARANCE.patternScale,
    metalness: amount(value.metalness, DEFAULT_APPEARANCE.metalness),
    roughness: amount(value.roughness, DEFAULT_APPEARANCE.roughness),
  };
}
export function appearanceKey(playerId) { return `com.corgi.loot-ledger/dice-appearance/v1/${playerId}`; }
export function readAppearance(storage, playerId) {
  try { return normalizeAppearance(JSON.parse(storage.getItem(appearanceKey(playerId)) || '{}')); }
  catch { return normalizeAppearance(); }
}
export function saveAppearance(storage, playerId, appearance) {
  const clean = normalizeAppearance(appearance);
  storage.setItem(appearanceKey(playerId), JSON.stringify(clean));
  return clean;
}
