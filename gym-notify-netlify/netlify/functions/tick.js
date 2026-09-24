import { getStore } from '@netlify/blobs';
import { computeDue, sendMessage } from './_shared.js';

// Раз в 5 минут: проверяем, не пора ли напомнить о тренировке, смене
// или прислать вечернюю сводку на завтра.
export default async () => {
  const store = getStore('gym-notify');
  const data = await store.get('data', { type: 'json' });
  if (!data) return new Response('нет данных — приложение ещё не синхронизировалось');

  const sent = (await store.get('sent', { type: 'json' })) || {};
  const now = Date.now();
  const { messages, sentKeys } = computeDue(data, sent, now);

  for (const text of messages) await sendMessage(text);
  for (const k of sentKeys) sent[k] = now;

  // чистим старые отметки (старше 3 дней), чтобы хранилище не росло
  for (const [k, ts] of Object.entries(sent)) if (now - ts > 3 * 864e5) delete sent[k];
  if (sentKeys.length) await store.setJSON('sent', sent);

  return new Response(`отправлено сообщений: ${messages.length}`);
};

export const config = { schedule: '*/5 * * * *' };
