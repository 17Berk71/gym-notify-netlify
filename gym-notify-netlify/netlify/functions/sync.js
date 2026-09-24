import { getStore } from '@netlify/blobs';
import { checkInitData, TRAINER_ID } from './_shared.js';

// мини-приложение открывается с другого адреса — разрешаем ему присылать данные
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};
const reply = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } });

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return reply({ ok: false, error: 'method' }, 405);

  const store = getStore('gym-notify');
  // запоминаем последнюю попытку — её видно в /.netlify/functions/health
  const note = (status, extra = {}) =>
    store.setJSON('lastSync', { at: new Date().toISOString(), status, ...extra }).catch(() => {});

  let body;
  try { body = JSON.parse(await req.text()); } catch (e) { await note('bad json'); return reply({ ok: false, error: 'bad json' }, 400); }
  const { initData, data } = body || {};

  const user = initData && checkInitData(initData);
  if (!user) { await note('bad initData — подпись не сошлась (проверьте BOT_TOKEN)'); return reply({ ok: false, error: 'bad initData' }, 401); }
  if (String(user.id) !== String(TRAINER_ID)) {
    await note('чужой id — проверьте TRAINER_ID', { gotId: user.id });
    return reply({ ok: false, error: 'not trainer' }, 403);
  }

  await store.setJSON('data', data);
  await note('ok');
  return reply({ ok: true });
};
