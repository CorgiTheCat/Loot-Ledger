import OBR from '@owlbear-rodeo/sdk';
import { createSession, resolveLootRoll } from './systems/LootEngine.js';
import { LOOT_KEY, LOOT_ARCHIVE_KEY, LOOT_CHANNEL } from './constants.js';

const MENU_ID = 'com.corgi.loot-ledger/menu';

let role = 'PLAYER';
let ownConnectionId = '';
let queue = Promise.resolve();
const completed = new Map();

function send(message) {
  return OBR.broadcast.sendMessage(LOOT_CHANNEL, message, { destination: 'ALL' });
}

function enqueue(work) {
  queue = queue.then(work, work).catch((error) => console.error('Loot Ledger request failed', error));
}

async function writeSession(tokenId, session, archive) {
  let written = false;
  await OBR.scene.items.updateItems([tokenId], (items) => {
    for (const item of items) {
      written = true;
      item.metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
      item.metadata[LOOT_KEY] = session;
      if (archive) item.metadata[LOOT_ARCHIVE_KEY] = archive;
    }
  });
  if (!written) throw new Error('This loot token was removed during the action.');
}

async function handleMessage(event) {
  const message = event.data;
  if (role !== 'GM' || !message || !['admin-create', 'admin-close', 'roll-request'].includes(message.type)) return;
  enqueue(async () => {
    const { tokenId, requestId } = message;
    if (typeof tokenId !== 'string' || typeof requestId !== 'string' || requestId.length > 120) return;
    const players = await OBR.party.getPlayers();
    const gmConnections = [...new Set([...players.filter((player) => player.role === 'GM').map((player) => player.connectionId), ownConnectionId])].sort();
    if (gmConnections[0] !== ownConnectionId) return;
    const reply = async (success, data = {}) => send({ type: 'loot-response', requestId, connectionId: event.connectionId, success, ...data });
    if (completed.has(requestId)) { await reply(true, completed.get(requestId)); return; }
    try {
      const [token] = await OBR.scene.items.getItems([tokenId]);
      if (!token) throw new Error('This loot token is no longer in the scene.');
      const current = token.metadata?.[LOOT_KEY];
      const senderIsGm = event.connectionId === ownConnectionId || players.some((player) => player.connectionId === event.connectionId && player.role === 'GM');
      if (message.type.startsWith('admin-') && !senderIsGm) throw new Error('Only a DM can manage loot.');
      if (message.type === 'admin-create') {
        if (current?.status === 'active') throw new Error('Close the current session before starting another.');
        const session = createSession({ name: String(message.name || token.name || 'Loot Cache'), entries: message.entries || [], createdBy: await OBR.player.getId() });
        const archive = current ? [...(token.metadata?.[LOOT_ARCHIVE_KEY] || []), current].slice(-20) : null;
        await writeSession(tokenId, session, archive);
        const payload = { session };
        completed.set(requestId, payload);
        await reply(true, payload);
        return;
      }
      if (message.type === 'admin-close') {
        if (!current || current.status !== 'active') throw new Error('There is no active loot session.');
        const session = { ...current, status: 'closed', revision: current.revision + 1 };
        await writeSession(tokenId, session);
        const payload = { session };
        completed.set(requestId, payload);
        await reply(true, payload);
        return;
      }
      if (!current || current.status !== 'active') throw new Error('This loot session has closed.');
      if (!['normal', 'adv', 'dis'].includes(message.mode)) throw new Error('Choose a valid roll mode.');
      const actor = players.find((player) => player.connectionId === event.connectionId);
      if (actor?.role === 'GM') throw new Error('Use a player connection to roll loot.');
      const session = structuredClone(current);
      const { result } = resolveLootRoll(session, {
        mode: message.mode,
        modifier: message.modifier ?? 0,
        playerId: actor?.id || event.connectionId,
        playerName: actor?.name || 'Adventurer',
        rollId: requestId,
      });
      await writeSession(tokenId, session);
      const payload = { result };
      completed.set(requestId, payload);
      await reply(true, payload);
      if (completed.size > 300) completed.delete(completed.keys().next().value);
    } catch (error) {
      await reply(false, { error: error instanceof Error ? error.message : 'The loot action failed.' });
    }
  });
}

OBR.onReady(async () => {
  role = await OBR.player.getRole();
  ownConnectionId = await OBR.player.getConnectionId();
  OBR.player.onChange(async () => { role = await OBR.player.getRole(); });
  await OBR.contextMenu.create({
    id: MENU_ID,
    icons: [
      { icon: '/loot-icon.png', label: 'Loot Ledger — Manage', filter: { min: 1, max: 1, roles: ['GM'] } },
      { icon: '/loot-icon.png', label: 'Loot Ledger — Roll', filter: { min: 1, max: 1, roles: ['PLAYER'], every: [{ key: ['metadata', LOOT_KEY, 'status'], value: 'active' }] } },
    ],
    async onClick(context) {
      if (context.items.length !== 1) return;
      const item = context.items[0];
      const playerRole = await OBR.player.getRole();
      if (playerRole !== 'GM' && item.metadata?.[LOOT_KEY]?.status !== 'active') return;
      const [width, height] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
      await OBR.modal.open({
        id: 'com.corgi.loot-ledger/modal',
        url: `/loot.html?token=${encodeURIComponent(item.id)}`,
        width: Math.max(320, Math.min(1050, width - 48)),
        height: Math.max(440, Math.min(780, height - 64)),
      });
    },
  });
  OBR.broadcast.onMessage(LOOT_CHANNEL, handleMessage);
});
