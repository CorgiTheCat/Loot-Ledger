import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, resolveLootRoll } from '../src/loot/systems/LootEngine.js';

function pool() {
  return createSession({ name: 'Test cache', entries: Array.from({ length: 20 }, (_, i) => ({
    id: String(i + 1).padStart(2, '0'), name: `Item ${i + 1}`, quantity: 2, weight: 1,
  })) });
}

for (const scenario of [
  { name: 'sheet bonus +4', mode: 'normal', dice: [8], modifier: 4, base: 8, total: 12, table: 12 },
  { name: 'advantage adds +7 once', mode: 'adv', dice: [3, 12], modifier: 7, base: 12, total: 19, table: 19 },
  { name: 'disadvantage adds +7 after choosing the lower die', mode: 'dis', dice: [3, 12], modifier: 7, base: 3, total: 10, table: 10 },
  { name: 'overflow keeps full total and selects top loot', mode: 'normal', dice: [18], modifier: 7, base: 18, total: 25, table: 20 },
  { name: 'negative penalty selects bottom loot', mode: 'normal', dice: [2], modifier: -7, base: 2, total: -5, table: 1 },
  { name: 'large bonus has no game-specific cap', mode: 'normal', dice: [8], modifier: 100000, base: 8, total: 100008, table: 20 },
]) {
  test(scenario.name, () => {
    const session = pool();
    const rolls = [...scenario.dice];
    const { result } = resolveLootRoll(session, { mode: scenario.mode, modifier: scenario.modifier, randomInt: () => rolls.shift() });
    assert.equal(result.baseRoll, scenario.base);
    assert.equal(result.modifier, scenario.modifier);
    assert.equal(result.totalRoll, scenario.total);
    assert.equal(result.finalRoll, scenario.table);
    assert.deepEqual(result.rawRolls, scenario.dice);
    assert.equal(result.lootId, String(scenario.table).padStart(2, '0'));
    assert.equal(session.lootEntries[scenario.table - 1].quantity, 1);
    assert.equal(session.rollHistory[0], result);
  });
}

test('older clients default to modifier zero', () => {
  const { result } = resolveLootRoll(pool(), { randomInt: () => 6 });
  assert.equal(result.modifier, 0);
  assert.equal(result.totalRoll, 6);
  assert.equal(result.finalRoll, 6);
});

test('malformed modifiers cannot consume stock or add history', () => {
  for (const modifier of ['7', 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    const session = pool();
    const before = structuredClone(session);
    assert.throws(() => resolveLootRoll(session, { modifier }), /whole-number/);
    assert.deepEqual(session, before);
  }
});
