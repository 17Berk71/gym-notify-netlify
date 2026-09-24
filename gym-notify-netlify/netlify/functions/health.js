import { getStore } from '@netlify/blobs';

export default async () => {
  const store = getStore('gym-notify');
  const data = await store.get('data', { type: 'json' });
  const lastSync = await store.get('lastSync', { type: 'json' });
  return Response.json({
    ok: true,
    hasData: !!data,
    counts: {
      single: data?.single?.length ?? 0,
      split: data?.split?.length ?? 0,
      trial: data?.trial?.length ?? 0,
      shifts: data?.shifts?.length ?? 0,
    },
    lastSync: lastSync || 'приложение ещё ни разу не присылало данные',
  });
};
