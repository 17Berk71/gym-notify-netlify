import { getStore } from '@netlify/blobs';

export default async () => {
  const store = getStore('gym-notify');
  const data = await store.get('data', { type: 'json' });
  const single = data?.single?.length ?? 0;
  const split = data?.split?.length ?? 0;
  const trial = data?.trial?.length ?? 0;
  const shifts = data?.shifts?.length ?? 0;
  return Response.json({
    ok: true,
    hasData: !!data,
    counts: { single, split, trial, shifts },
  });
};
