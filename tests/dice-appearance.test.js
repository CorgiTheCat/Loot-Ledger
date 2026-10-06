import test from 'node:test';
import assert from 'node:assert/strict';
import { DICE_FONTS, DICE_MATERIALS, DICE_PATTERNS, DEFAULT_APPEARANCE, normalizeAppearance, readAppearance, saveAppearance, appearanceKey } from '../src/loot/systems/DiceAppearance.js';
import { materialValues } from '../src/loot/components/DiceSkin.js';

const memory = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

test('each of the five fonts and every pattern survives saving and reopening', () => {
  assert.equal(DICE_FONTS.length, 5);
  const storage = memory();
  for (const font of DICE_FONTS) for (const pattern of DICE_PATTERNS) {
    saveAppearance(storage, 'player', { ...DEFAULT_APPEARANCE, font: font.id, pattern: pattern.id, bodyColor: '#3266c9' });
    const loaded = readAppearance(storage, 'player');
    assert.equal(loaded.font, font.id); assert.equal(loaded.pattern, pattern.id);
    assert.equal(loaded.bodyColor, '#3266c9');
  }
});

test('player styles are independent and unsaved preview edits do not overwrite them', () => {
  const storage = memory();
  saveAppearance(storage, 'alice', { ...DEFAULT_APPEARANCE, bodyColor: '#268861' });
  saveAppearance(storage, 'bob', { ...DEFAULT_APPEARANCE, bodyColor: '#a92e46' });
  const draft = readAppearance(storage, 'alice'); draft.bodyColor = '#ffffff';
  assert.equal(readAppearance(storage, 'alice').bodyColor, '#268861');
  assert.equal(readAppearance(storage, 'bob').bodyColor, '#a92e46');
});

test('unsupported stored fields are ignored and unsafe colors or fonts use defaults', () => {
  const normalized = normalizeAppearance({ bodyColor: 'url(https://example.com)', numberColor: '#abcdef', font: 'evil font', material: 'missing', pattern: 'unknown', metalness: Infinity, roughness: -2, modifier: 100, mode: 'adv' });
  assert.equal(normalized.bodyColor, DEFAULT_APPEARANCE.bodyColor);
  assert.equal(normalized.numberColor, '#abcdef'); assert.equal(normalized.font, DEFAULT_APPEARANCE.font);
  assert.equal(normalized.metalness, DEFAULT_APPEARANCE.metalness); assert.equal(normalized.roughness, 0);
  assert(!('modifier' in normalized)); assert(!('mode' in normalized));
});

test('corrupt or inaccessible storage still produces usable default dice', () => {
  const storage = memory(); storage.setItem(appearanceKey('player'), '{broken');
  assert.deepEqual(readAppearance(storage, 'player'), DEFAULT_APPEARANCE);
  assert.deepEqual(readAppearance({ getItem: () => { throw new Error('Blocked'); } }, 'player'), DEFAULT_APPEARANCE);
});

test('material choices configure visibly different renderer properties', () => {
  for (const material of DICE_MATERIALS) {
    const style = normalizeAppearance({ ...DEFAULT_APPEARANCE, material: material.id, metalness: material.metalness, roughness: material.roughness });
    const values = materialValues(style);
    assert.equal(values.metalness, material.metalness);
    assert.equal(values.roughness, material.roughness);
    assert.equal(values.transmission, material.transmission);
  }
  assert(materialValues({ ...DEFAULT_APPEARANCE, material: 'glass' }).transmission > 0);
  assert.equal(materialValues({ ...DEFAULT_APPEARANCE, material: 'stone' }).clearcoat, 0);
});

test('a failed save is reported and never silently returns success', () => {
  assert.throws(() => saveAppearance({ setItem: () => { throw new Error('Quota'); } }, 'player', DEFAULT_APPEARANCE), /Quota/);
});
