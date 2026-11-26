// Lê o calendário iCalendar (.ics) da casa e devolve os eventos em JSON.
// O browser não consegue ler .ics de Google/iCloud/Outlook diretamente (CORS),
// por isso o pedido passa por esta função, que corre no servidor do Supabase.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MAX_EVENTOS = 2000;
const DIA: Record<string, number> = {MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6};

type Evento = {id: string; titulo: string; data: string; hora: string | null; notas: string | null};
type Campo = {v: string; p: string};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {status, headers: {...CORS, 'Content-Type': 'application/json'}});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, {headers: CORS});
  try {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: {headers: {Authorization: `Bearer ${token}`}},
    });
    const {data: {user}} = await sb.auth.getUser(token);
    if (!user) return json({erro: 'Sessão inválida. Volta a entrar na app.'}, 401);

    const corpo = await req.json().catch(() => ({}));
    const hojeIso = new Date().toISOString().slice(0, 10);
    const de: string = corpo.de ?? addDias(hojeIso, -31);
    const ate: string = corpo.ate ?? addDias(hojeIso, 183);

    // a regra de segurança (RLS) só deixa ler a casa a que o utilizador pertence
    const {data: vinculo, error} = await sb.from('casa_membros').select('casas(ics_url)').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    const url0: string | null = (vinculo as any)?.casas?.ics_url ?? null;
    if (!url0) return json({erro: 'Ainda não há link de calendário configurado.'}, 400);

    let url = url0.trim();
    if (url.startsWith('webcal://')) url = 'https://' + url.slice('webcal://'.length);
    if (!url.startsWith('https://')) return json({erro: 'O link tem de começar por https:// ou webcal://'}, 400);

    const r = await fetch(url, {headers: {'User-Agent': 'Lar-agenda/1.0'}});
    if (!r.ok) return json({erro: `O calendário respondeu com erro ${r.status}. Confirma o link.`}, 502);

    const eventos = lerIcs(await r.text(), de, ate);
    return json({eventos: eventos.slice(0, MAX_EVENTOS), total: eventos.length, atualizado: new Date().toISOString()});
  } catch (e) {
    return json({erro: 'Não foi possível ler o calendário: ' + (e instanceof Error ? e.message : String(e))}, 500);
  }
});

/* ---------- leitura do formato iCalendar ---------- */

function lerIcs(texto: string, de: string, ate: string): Evento[] {
  // RFC 5545: linhas que começam por espaço ou tab continuam a linha anterior
  const linhas = texto.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out: Evento[] = [];
  let atual: Record<string, Campo> | null = null;
  for (const l of linhas) {
    if (l === 'BEGIN:VEVENT') { atual = {}; continue; }
    if (l === 'END:VEVENT') { if (atual) out.push(...evento(atual, de, ate)); atual = null; continue; }
    if (!atual) continue;
    const i = l.indexOf(':');
    if (i < 0) continue;
    const [nome, ...params] = l.slice(0, i).split(';');
    atual[nome.toUpperCase()] = {v: l.slice(i + 1), p: params.join(';').toUpperCase()};
  }
  return out.sort((a, b) => a.data.localeCompare(b.data) || (a.hora ?? '').localeCompare(b.hora ?? ''));
}

function evento(c: Record<string, Campo>, de: string, ate: string): Evento[] {
  if (c.STATUS?.v?.toUpperCase() === 'CANCELLED') return [];
  if (!c.DTSTART) return [];
  const pri = converter(c.DTSTART.v);
  if (!pri) return [];
  const titulo = desesc(c.SUMMARY?.v ?? '(sem título)');
  const local = c.LOCATION ? desesc(c.LOCATION.v) : '';
  const desc = c.DESCRIPTION ? desesc(c.DESCRIPTION.v) : '';
  const notas = [local ? `📍 ${local}` : '', desc].filter(Boolean).join('\n') || null;
  const uid = c.UID?.v ?? crypto.randomUUID();
  const datas = c.RRULE ? expandir(pri.data, c.RRULE.v, de, ate) : [pri.data];
  return datas.filter((d) => d >= de && d <= ate)
    .map((d) => ({id: `${uid}|${d}`, titulo, data: d, hora: pri.hora, notas}));
}

// aceita AAAAMMDD, AAAAMMDDTHHMMSS e AAAAMMDDTHHMMSSZ (UTC, convertido para Lisboa)
function converter(v: string): {data: string; hora: string | null} | null {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{0,2}(Z?))?$/);
  if (!m) return null;
  const data = `${m[1]}-${m[2]}-${m[3]}`;
  if (!m[4]) return {data, hora: null};
  if (m[6] === 'Z') {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d);
    const g = (t: string) => p.find((x) => x.type === t)!.value;
    return {data: `${g('year')}-${g('month')}-${g('day')}`, hora: `${g('hour')}:${g('minute')}`};
  }
  return {data, hora: `${m[4]}:${m[5]}`};
}

// Recorrências: DAILY, WEEKLY (com ou sem BYDAY), MONTHLY e YEARLY, com INTERVAL, COUNT e UNTIL.
// Não trata EXDATE (ocorrências apagadas uma a uma), nem BYMONTHDAY/BYSETPOS.
function expandir(ini: string, regra: string, de: string, ate: string): string[] {
  const p: Record<string, string> = {};
  regra.split(';').forEach((x) => { const [k, v] = x.split('='); if (k) p[k.toUpperCase()] = v ?? ''; });
  const freq = p.FREQ;
  const passo = Math.max(1, parseInt(p.INTERVAL || '1', 10) || 1);
  const fim = p.UNTIL ? `${p.UNTIL.slice(0, 4)}-${p.UNTIL.slice(4, 6)}-${p.UNTIL.slice(6, 8)}` : '9999-12-31';
  const max = p.COUNT ? parseInt(p.COUNT, 10) : Infinity;
  const out: string[] = [];
  let n = 0, it = 0;
  const conta = (d: string) => { n++; if (d >= de && d <= ate) out.push(d); };

  if (freq === 'WEEKLY' && p.BYDAY) {
    const dias = p.BYDAY.split(',').map((x) => DIA[x.slice(-2)]).filter((x) => x !== undefined).sort((a, b) => a - b);
    let semana = addDias(ini, -((new Date(ini + 'T00:00:00Z').getUTCDay() + 6) % 7)); // segunda-feira dessa semana
    while (semana <= ate && it++ < 50000) {
      for (const k of dias) {
        const d = addDias(semana, k);
        if (d < ini) continue;
        if (d > fim || n >= max) return out;
        conta(d);
      }
      semana = addDias(semana, 7 * passo);
    }
    return out;
  }

  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return ini >= de && ini <= ate ? [ini] : [];
  for (let i = 0; it++ < 50000; i++) {
    const d = freq === 'DAILY' ? addDias(ini, i * passo)
      : freq === 'WEEKLY' ? addDias(ini, 7 * i * passo)
      : freq === 'MONTHLY' ? addMeses(ini, i * passo)
      : addMeses(ini, 12 * i * passo);
    if (d > fim || d > ate || n >= max) break;
    conta(d);
  }
  return out;
}

const desesc = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

function addDias(iso: string, k: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + k);
  return d.toISOString().slice(0, 10);
}

function addMeses(iso: string, k: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + k);
  const ult = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ult));
  return d.toISOString().slice(0, 10);
}
