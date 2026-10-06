import OBR from '@owlbear-rodeo/sdk';
import { LOOT_CHANNEL, LOOT_KEY } from '../constants.js';

export class OwlbearLootAdapter {
  constructor(tokenId) {
    this.tokenId = tokenId;
  }

  async getToken() {
    const [token] = await OBR.scene.items.getItems([this.tokenId]);
    if (!token) throw new Error('This loot token is no longer in the scene.');
    return token;
  }

  async getSession() {
    return (await this.getToken()).metadata?.[LOOT_KEY] || null;
  }

  subscribeToSession(listener) {
    return OBR.scene.items.onChange((items) => {
      const token = items.find((item) => item.id === this.tokenId);
      listener(token?.metadata?.[LOOT_KEY] || null, token || null);
    });
  }

  async request(type, data = {}) {
    const requestId = crypto.randomUUID();
    const connectionId = await OBR.player.getConnectionId();
    return new Promise((resolve, reject) => {
      let stop = () => {};
      const timer = setTimeout(() => {
        stop();
        reject(new Error('The DM did not respond. Check that Loot Ledger is enabled in the Owlbear room.'));
      }, 12000);
      stop = OBR.broadcast.onMessage(LOOT_CHANNEL, (event) => {
        const message = event.data;
        if (message?.type !== 'loot-response' || message.requestId !== requestId || message.connectionId !== connectionId) return;
        clearTimeout(timer);
        stop();
        if (message.success) resolve(message);
        else reject(new Error(message.error || 'The loot action failed.'));
      });
      OBR.broadcast.sendMessage(LOOT_CHANNEL, { type, tokenId: this.tokenId, requestId, ...data }, { destination: 'ALL' })
        .catch((error) => { clearTimeout(timer); stop(); reject(error); });
    });
  }

  async createSession(name, entries) {
    const response = await this.request('admin-create', { name, entries });
    return response.session;
  }

  async closeSession() {
    const response = await this.request('admin-close');
    return response.session;
  }

  async rollLoot(mode, modifier = 0) {
    const response = await this.request('roll-request', { mode, modifier });
    return response.result;
  }
}
