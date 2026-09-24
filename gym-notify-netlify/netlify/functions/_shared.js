import crypto from 'node:crypto';

export const TABLES = { single: 'Одиночные', split: 'Сплиты', trial: 'Пробные' };
export const BOT_TOKEN = process.env.BOT_TOKEN;
export const TRAINER_ID = process.env.TRAINER_ID;

// см. https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
export function checkInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const pairs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (computed !== hash) return null;
  try { return JSON.parse(params.get('user') || 'null'); } catch (e) { return null; }
}

export async function sendMessage(text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: TRAINER_ID, text, parse_mode: 'HTML' }),
  });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) console.error('Ошибка отправки в Telegram:', j.description || res.status);
  return j.ok;
}

export function todayKeyMsk() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const g = t => parts.find(p => p.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
export function addDaysKey(dateKey, n) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
export function fmtDayRu(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' });
}
export function plural(n) {
  const m = n % 100, k = n % 10;
  if (m > 10 && m < 20) return 'тренировок';
  if (k === 1) return 'тренировка';
  if (k > 1 && k < 5) return 'тренировки';
  return 'тренировок';
}
export function esc(s) { return String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }

/* ---------- напоминания ---------- */
export const CFG = {
  digestTime: process.env.DIGEST_TIME || '22:00',             // сводка на завтра, по Москве
  trainingLead: Number(process.env.TRAINING_LEAD_MIN || 60),  // за сколько минут до тренировки
  shiftLead: Number(process.env.SHIFT_LEAD_MIN || 120),       // за сколько минут до смены
};

const MSK_OFFSET = 3 * 60 * 60 * 1000; // Москва = UTC+3 круглый год
// момент начала события (дата + время по Москве) в миллисекундах UTC
export function mskToMs(dateKey, hm) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  return Date.UTC(y, m - 1, d, h, mi) - MSK_OFFSET;
}
function mskParts(ms) {
  const t = new Date(ms + MSK_OFFSET);
  const p = n => String(n).padStart(2, '0');
  return { date: `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`,
           hm: `${p(t.getUTCHours())}:${p(t.getUTCMinutes())}` };
}
const leadText = min => min % 60 === 0
  ? (min === 60 ? 'Через час' : `Через ${min / 60} ${min / 60 < 5 ? 'часа' : 'часов'}`)
  : `Через ${min} мин`;

// Возвращает { messages: [...текст], sentKeys: [...ключи] } — что нужно отправить сейчас.
// sent — объект уже отправленных ключей, чтобы ничего не дублировать.
// Напоминание уходит, как только до начала осталось меньше заданного времени,
// и только пока событие ещё не началось.
export function computeDue(data, sent, nowMs, cfg = CFG) {
  const messages = [], sentKeys = [];
  if (!data) return { messages, sentKeys };
  const now = mskParts(nowMs);

  // 1. Тренировки — за cfg.trainingLead минут, одним сообщением на одно время
  const groups = new Map();
  for (const t of Object.keys(TABLES)) {
    for (const c of data[t] || []) {
      for (const v of c.visits || []) {
        if (!v.from || !v.date) continue;
        const start = mskToMs(v.date, v.from);
        const key = `tr:${v.id}:${v.date}:${v.from}`;
        if (sent[key] || nowMs >= start || nowMs < start - cfg.trainingLead * 60000) continue;
        const gk = `${v.date} ${v.from}`;
        if (!groups.has(gk)) groups.set(gk, { from: v.from, to: v.to, start, items: [] });
        groups.get(gk).items.push({ name: c.name, table: t, to: v.to });
        sentKeys.push(key);
      }
    }
  }
  for (const g of [...groups.values()].sort((a, b) => a.start - b.start)) {
    const left = Math.round((g.start - nowMs) / 60000);
    const head = left >= cfg.trainingLead - 5 ? leadText(cfg.trainingLead) : `Через ${left} мин`;
    const who = g.items.map(x => `<b>${esc(x.name)}</b> · ${TABLES[x.table]}`).join('\n');
    messages.push(`🏋️ ${head}, в ${g.from}, ${g.items.length > 1 ? 'тренировки' : 'тренировка'}:\n${who}`);
  }

  // 2. Смены — за cfg.shiftLead минут
  for (const s of data.shifts || []) {
    const start = mskToMs(s.date, s.from);
    const key = `sh:${s.id}:${s.date}:${s.from}`;
    if (sent[key] || nowMs >= start || nowMs < start - cfg.shiftLead * 60000) continue;
    const left = Math.round((start - nowMs) / 60000);
    const head = left >= cfg.shiftLead - 5 ? leadText(cfg.shiftLead) : `Через ${left} мин`;
    messages.push(`🕒 ${head} смена в зале: ${s.from} – ${s.to}.`);
    sentKeys.push(key);
  }

  // 3. Сводка на завтра — один раз в день, начиная с cfg.digestTime
  const dkey = `digest:${now.date}`;
  if (!sent[dkey] && now.hm >= cfg.digestTime) {
    sentKeys.push(dkey);
    const tomorrow = addDaysKey(now.date, 1);
    const items = [];
    for (const t of Object.keys(TABLES))
      for (const c of data[t] || [])
        for (const v of c.visits || [])
          if (v.date === tomorrow && v.from) items.push({ ...v, name: c.name, table: t });
    items.sort((a, b) => a.from.localeCompare(b.from));
    const shifts = (data.shifts || []).filter(s => s.date === tomorrow).sort((a, b) => a.from.localeCompare(b.from));
    if (items.length || shifts.length) {
      let text = `🌙 Завтра, ${fmtDayRu(tomorrow)}:`;
      if (shifts.length) text += `\n\n🕒 Смена: ${shifts.map(s => `${s.from} – ${s.to}`).join(', ')}`;
      if (items.length) text += `\n\n📅 ${items.length} ${plural(items.length)}:\n` +
        items.map(v => `${v.from}–${v.to}  <b>${esc(v.name)}</b> · ${TABLES[v.table]}`).join('\n');
      messages.push(text);
    }
  }
  return { messages, sentKeys };
}
