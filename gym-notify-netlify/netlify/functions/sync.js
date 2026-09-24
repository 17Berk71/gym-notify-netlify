import { getStore } from '@netlify/blobs';
import { checkInitData, TRAINER_ID } from './_shared.js';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body;
  try { body = await req.json(); } catch (e) { return new Response('bad json', { status: 400 }); }
  const { initData, data } = body || {};

  const user = initData && checkInitData(initData);
  if (!user) return Response.json({ ok: false, error: 'bad initData' }, { status: 401 });
  if (String(user.id) !== String(TRAINER_ID)) return Response.json({ ok: false, error: 'not trainer' }, { status: 403 });

  const store = getStore('gym-notify');
  await store.setJSON('data', data);
  return Response.json({ ok: true });
};
