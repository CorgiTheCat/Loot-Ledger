import { ThreeDDice } from 'dddice-js';

// dddice displays the result already committed by the GM's Loot session.
// Its API never decides which reward the player receives.
export class DddiceDice {
  constructor(host, { apiKey, room, passcode = '' }) {
    this.host = host;
    this.canvas = document.createElement('canvas');
    host.replaceChildren(this.canvas);
    this.roller = new ThreeDDice(this.canvas, apiKey, { autoClear: 4 });
    this.roller.start();
    this.roller.connect(room, passcode || undefined);
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.fit();
  }

  fit() {
    this.roller.resize(Math.max(1, this.host.clientWidth), Math.max(1, this.host.clientHeight));
  }

  attach(host) {
    if (this.host === host) return;
    this.resize.unobserve(this.host);
    this.host = host;
    host.replaceChildren(this.canvas);
    this.resize.observe(host);
    this.fit();
  }

  setDie(sides) { this.sides = sides; }

  async rollTo(rawRolls, mode = 'normal') {
    const chosen = mode === 'adv' ? Math.max(...rawRolls) : mode === 'dis' ? Math.min(...rawRolls) : rawRolls[0];
    const chosenIndex = rawRolls.indexOf(chosen);
    await this.roller.roll(rawRolls.map((value, index) => ({
      theme: 'dddice-standard',
      type: `d${this.sides}`,
      value,
      is_dropped: mode !== 'normal' && index !== chosenIndex,
    })), { label: 'Wayfarer Loot' });
  }

  dispose() {
    this.resize.disconnect();
    this.roller.disconnect();
    this.roller.stop();
  }
}
