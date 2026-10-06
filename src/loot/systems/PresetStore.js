import { normalizeEntry } from './LootEngine.js';

// One library per DM and extension origin, independent of the selected token.
export class PresetStore {
  constructor(storage, playerId) {
    this.storage = storage;
    this.key = `com.corgi.loot-ledger/presets/v1/${playerId}`;
  }

  list() {
    const raw = this.storage.getItem(this.key);
    if (!raw) return [];
    let presets;
    try { presets = JSON.parse(raw); }
    catch { throw new Error('The preset library could not be read. Existing data has been preserved.'); }
    if (!Array.isArray(presets)) throw new Error('The preset library has an invalid format.');
    return presets.map((preset) => {
      if (!preset || typeof preset.id !== 'string' || typeof preset.name !== 'string' || !Array.isArray(preset.entries)) {
        throw new Error('The preset library has an invalid format.');
      }
      return { ...preset, entries: preset.entries.map(normalizeEntry) };
    });
  }

  save({ id, name, poolName, entries }) {
    const cleanName = String(name ?? '').trim();
    if (!cleanName || cleanName.length > 80) throw new Error('Enter a preset name of 1 to 80 characters.');
    if (!Array.isArray(entries) || !entries.length) throw new Error('Add at least one loot entry before saving a preset.');
    const cleanEntries = entries.map(normalizeEntry);
    const presets = this.list();
    if (id && !presets.some((preset) => preset.id === id)) throw new Error('This preset no longer exists.');
    if (presets.some((preset) => preset.id !== id && preset.name.toLowerCase() === cleanName.toLowerCase())) {
      throw new Error('A preset with this name already exists. Select it and use Update selected, or choose another name.');
    }
    const preset = {
      id: id || crypto.randomUUID(), name: cleanName,
      poolName: String(poolName || cleanName).trim().slice(0, 80),
      entries: cleanEntries, updatedAt: Date.now(),
    };
    const index = presets.findIndex((item) => item.id === preset.id);
    if (index < 0) presets.push(preset); else presets[index] = preset;
    this.write(presets);
    return preset;
  }

  load(id) {
    const preset = this.list().find((item) => item.id === id);
    if (!preset) throw new Error('Choose an existing preset.');
    return {
      poolName: preset.poolName,
      entries: preset.entries.map((entry) => ({ ...entry, id: crypto.randomUUID() })),
    };
  }

  remove(id) {
    const presets = this.list();
    const removed = presets.find((item) => item.id === id);
    if (!removed) throw new Error('Choose an existing preset.');
    this.write(presets.filter((item) => item.id !== id));
    return removed;
  }

  restore(preset) {
    return this.save({ ...preset, id: undefined });
  }

  write(presets) {
    try { this.storage.setItem(this.key, JSON.stringify(presets)); }
    catch { throw new Error('Presets could not be saved. Check browser storage permissions and available space.'); }
  }
}
