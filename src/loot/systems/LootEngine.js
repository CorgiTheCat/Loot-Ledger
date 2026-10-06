export const RARITIES = Object.freeze([
  { id: 'common', label: 'Common', multiplier: 1 },
  { id: 'uncommon', label: 'Uncommon', multiplier: .65 },
  { id: 'rare', label: 'Rare', multiplier: .35 },
  { id: 'very-rare', label: 'Very Rare', multiplier: .18 },
  { id: 'legendary', label: 'Legendary', multiplier: .08 },
  { id: 'artifact', label: 'Artifact', multiplier: .03 },
]);
export function rarityInfo(value) { return RARITIES.find((rarity) => rarity.id === value) || RARITIES[0]; }
const dropWeight = (entry) => entry.weight;

export const DICE_SIDES = Object.freeze([20]);
export function selectDiceType() {
  return 20;
}

// Largest-remainder apportionment: every face is assigned once, weights stay
// proportional as closely as integer faces allow, and ties are stable by id.
export function buildLootDistribution(diceSides, entries) {
  if (!DICE_SIDES.includes(diceSides)) throw new RangeError('Unsupported die size.');
  const active = entries.filter((entry) => Number.isFinite(entry.weight) && entry.weight > 0);
  if (!active.length) return [];
  const total = active.reduce((sum, entry) => sum + dropWeight(entry), 0);
  // A die has at most twenty faces. Above that entry count, some entries
  // necessarily receive zero faces; deterministic tie breaking chooses which.
  const availableFaces = diceSides - 1; // Natural 1 is always an empty drop.
  const guaranteeOneFace = active.length <= availableFaces;
  const remainingFaces = guaranteeOneFace ? availableFaces - active.length : availableFaces;
  const shares = active.map((entry) => { const exact = remainingFaces * dropWeight(entry) / total; return { entry, faces: (guaranteeOneFace ? 1 : 0) + Math.floor(exact), remainder: exact - Math.floor(exact) }; });
  const unassigned = availableFaces - shares.reduce((n, share) => n + share.faces, 0);
  for (const share of shares.slice().sort((a, b) => b.remainder - a.remainder || String(a.entry.id).localeCompare(String(b.entry.id))).slice(0, unassigned)) share.faces++;
  let next = 2;
  return shares.filter(({ faces }) => faces > 0).map(({ entry, faces }) => { const minRoll = next; next += faces; return { lootId: entry.id, minRoll, maxRoll: next - 1, faces, probability: faces / diceSides }; });
}
export function findLootForRoll(roll, distribution) { return distribution.find((range) => roll >= range.minRoll && roll <= range.maxRoll) ?? null; }
export function rollDie(sides, randomInt = secureRandomInt) { return randomInt(1, sides); }
export function secureRandomInt(min, max) {
  const range = max - min + 1;
  if (!Number.isSafeInteger(range) || range < 1) throw new RangeError('Invalid random range.');
  if (globalThis.crypto?.getRandomValues) { const data = new Uint32Array(1); const limit = Math.floor(0x100000000 / range) * range; let value; do { crypto.getRandomValues(data); value = data[0]; } while (value >= limit); return min + value % range; }
  return min + Math.floor(Math.random() * range);
}
export function resolveRoll(rawRolls, mode) {
  if (!['normal', 'adv', 'dis'].includes(mode)) throw new RangeError('Invalid roll mode.');
  const needed = mode === 'normal' ? 1 : 2;
  if (rawRolls.length !== needed || rawRolls.some((roll) => !Number.isSafeInteger(roll) || roll < 1)) throw new RangeError('Invalid raw rolls.');
  return mode === 'adv' ? Math.max(...rawRolls) : mode === 'dis' ? Math.min(...rawRolls) : rawRolls[0];
}
export function createSession({ name, entries, createdBy = 'DM', now = Date.now(), id = crypto.randomUUID() }) {
  const clean = entries.map((entry, index) => normalizeEntry(entry, index));
  if (!clean.some((entry) => entry.weight > 0)) throw new Error('Add at least one loot entry with a positive drop rate before starting a session.');
  const diceSides = selectDiceType(clean);
  if (!diceSides) throw new Error('Add at least one in-stock loot entry before starting a session.');
  return { sessionId: id, name: name.trim() || 'Untitled Cache', lootEntries: clean, diceType: diceSides, createdBy, status: 'active', rollHistory: [], createdAt: now, revision: 0 };
}
export function normalizeEntry(entry, index = 0) {
  const weight = Number(entry.weight);
  if (!String(entry.name ?? '').trim()) throw new Error(`Loot ${index + 1} needs a name.`);
  if (!Number.isFinite(weight) || weight < 0) throw new Error(`${entry.name}: drop rate must be 0 or more.`);
  if (entry.rarity != null && !RARITIES.some((rarity) => rarity.id === entry.rarity)) throw new Error(`${entry.name}: choose a valid rarity.`);
  const money = entry.type === 'money';
  const minAmount = Number(entry.minAmount ?? 0), maxAmount = Number(entry.maxAmount ?? minAmount);
  if (money && (!Number.isSafeInteger(minAmount) || minAmount < 0 || !Number.isSafeInteger(maxAmount) || maxAmount < minAmount)) throw new Error(`${entry.name}: enter a valid money range.`);
  return { id: String(entry.id || `loot-${index + 1}`), sourceItemId: entry.sourceItemId ? String(entry.sourceItemId) : null, name: String(entry.name).trim(), emoji: String(entry.emoji || '📦'), category: String(entry.category || entry.itemType || (money ? 'Currency' : 'Adventuring Gear')), description: String(entry.description || ''), type: money ? 'money' : 'item', weight, rarity: rarityInfo(entry.rarity).id, currency: String(entry.currency || 'gp').toLowerCase(), minAmount, maxAmount };
}
export function redistributeSession(session) { return buildLootDistribution(20, session.lootEntries); }
export function resolveLootRoll(session, { mode = 'normal', modifier = 0, playerId = 'local-player', playerName = 'Player', randomInt = secureRandomInt, now = Date.now(), rollId = crypto.randomUUID() } = {}) {
  if (session.status !== 'active') throw new Error('This loot session is closed.');
  if (!Number.isSafeInteger(modifier) || !Number.isSafeInteger(modifier + 20)) throw new Error('Enter a valid whole-number roll modifier.');
  const distribution = redistributeSession(session);
  if (!distribution.length) throw new Error('No loot has a positive drop rate.');
  const sides = 20, count = mode === 'normal' ? 1 : 2;
  const rawRolls = Array.from({ length: count }, () => randomInt(1, sides));
  const baseRoll = resolveRoll(rawRolls, mode);
  if (baseRoll === 1) {
    session.diceType = 20;
    const result = {
      rollId, playerId, playerName, rollMode: mode, rawRolls, baseRoll,
      modifier, totalRoll: 1, finalRoll: 1, noLoot: true,
      lootId: null, lootName: 'No loot', rarity: null, emoji: '—',
      itemType: 'none', quantityReceived: 0, currency: '',
      description: 'Natural 1. You receive no items or currency. Bonuses do not apply.', timestamp: now,
    };
    session.rollHistory.push(result);
    session.revision++;
    return { result, distribution };
  }
  const totalRoll = baseRoll + modifier;
  const finalRoll = Math.max(2, Math.min(sides, totalRoll));
  const range = findLootForRoll(finalRoll, distribution);
  if (!range) throw new Error(`Roll ${finalRoll} does not map to loot.`);
  const entry = session.lootEntries.find((item) => item.id === range.lootId);
  if (!entry) throw new Error('The selected loot is no longer available.');
  const quantityReceived = entry.type === 'money' ? randomInt(entry.minAmount, entry.maxAmount) : 1;
  // Existing sessions from versions before 1.3 become D20 on their next roll.
  session.diceType = 20;
  const result = { rollId, playerId, playerName, rollMode: mode, rawRolls, baseRoll, modifier, totalRoll, finalRoll, lootId: entry.id, lootName: entry.name, rarity: rarityInfo(entry.rarity).id, emoji: entry.emoji, itemType: entry.type, quantityReceived, currency: entry.currency, description: entry.description, timestamp: now };
  session.rollHistory.push(result);
  session.revision++;
  return { result, distribution: redistributeSession(session) };
}
export function closeSession(session) { if (session.status === 'active') { session.status = 'closed'; session.revision++; } return session; }
