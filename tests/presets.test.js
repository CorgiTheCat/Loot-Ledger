import test from 'node:test';
import assert from 'node:assert/strict';
import { PresetStore } from '../src/loot/systems/PresetStore.js';

function storage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
const entries = () => [
  { id: 'token-a-item', name: 'Moonblade', emoji: 'Sword', weight: 7, rarity: 'rare', category: 'Weapon', description: 'Silver edge' },
  { id: 'token-a-gold', name: 'Gold', type: 'money', weight: 3, rarity: 'common', currency: 'gp', minAmount: 4, maxAmount: 12 },
];

test('a saved library survives reopening on another token for the same DM', () => {
  const browserStorage = storage();
  const onTokenA = new PresetStore(browserStorage, 'dm');
  const preset = onTokenA.save({ name: 'Goblin Camp', poolName: 'Camp spoils', entries: entries() });
  const onTokenB = new PresetStore(browserStorage, 'dm');
  assert.equal(onTokenB.list()[0].name, 'Goblin Camp');
  const loaded = onTokenB.load(preset.id);
  assert.equal(loaded.poolName, 'Camp spoils');
  assert.equal(loaded.entries[0].weight, 7);
  assert.equal(loaded.entries[0].rarity, 'rare');
  assert.equal(loaded.entries[0].description, 'Silver edge');
  assert.equal(loaded.entries[1].minAmount, 4);
  assert.equal(loaded.entries[1].maxAmount, 12);
});

test('editing the source or loaded drafts cannot mutate the saved template or another token', () => {
  const store = new PresetStore(storage(), 'dm');
  const source = entries();
  const saved = store.save({ name: 'Cache', entries: source });
  source[0].name = 'Changed source';
  const tokenA = store.load(saved.id);
  const tokenB = store.load(saved.id);
  assert.notEqual(tokenA.entries[0].id, tokenB.entries[0].id);
  assert.notEqual(tokenA.entries[0].id, 'token-a-item');
  tokenA.entries[0].weight = 0;
  tokenA.entries[0].name = 'Changed draft';
  assert.equal(tokenB.entries[0].name, 'Moonblade');
  assert.equal(store.list()[0].entries[0].weight, 7);
});

test('explicit updates preserve identity and reject ambiguous duplicate names', () => {
  const store = new PresetStore(storage(), 'dm');
  const a = store.save({ name: 'Camp', entries: entries() });
  store.save({ name: 'Cave', entries: entries() });
  assert.throws(() => store.save({ name: ' camp ', entries: entries() }), /already exists/);
  assert.throws(() => store.save({ id: a.id, name: 'Cave', entries: entries() }), /already exists/);
  const updated = store.save({ id: a.id, name: 'Camp improved', entries: [{ ...entries()[0], weight: 10 }] });
  assert.equal(updated.id, a.id);
  assert.equal(store.list().length, 2);
  assert.equal(store.load(a.id).entries[0].weight, 10);
});

test('deletion leaves token copies usable and can be undone', () => {
  const store = new PresetStore(storage(), 'dm');
  const saved = store.save({ name: 'Camp', entries: entries() });
  const draft = store.load(saved.id);
  const removed = store.remove(saved.id);
  assert.equal(store.list().length, 0);
  assert.equal(draft.entries[0].name, 'Moonblade');
  const restored = store.restore(removed);
  assert.equal(store.load(restored.id).entries[0].rarity, 'rare');
});

test('other DM identities have separate libraries', () => {
  const shared = storage();
  new PresetStore(shared, 'dm-a').save({ name: 'Camp', entries: entries() });
  assert.equal(new PresetStore(shared, 'dm-b').list().length, 0);
});

test('invalid entries and corrupt storage do not overwrite the library', () => {
  const shared = storage();
  const store = new PresetStore(shared, 'dm');
  store.save({ name: 'Camp', entries: entries() });
  const before = shared.getItem(store.key);
  assert.throws(() => store.save({ name: 'Broken', entries: [{ name: 'Item', weight: -1 }] }));
  assert.equal(shared.getItem(store.key), before);
  shared.setItem(store.key, '{bad-json');
  assert.throws(() => store.save({ name: 'Camp', entries: entries() }), /preserved/);
  assert.equal(shared.getItem(store.key), '{bad-json');
});

test('storage failures are reported instead of announcing a successful save', () => {
  const store = new PresetStore({ getItem: () => null, setItem: () => { throw new Error('Quota'); } }, 'dm');
  assert.throws(() => store.save({ name: 'Camp', entries: entries() }), /could not be saved/);
});
