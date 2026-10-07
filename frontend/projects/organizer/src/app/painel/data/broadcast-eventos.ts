/** Card da tela "Próximos eventos" — a agenda de torneios que vêm por aí.
 *
 *  DESNORMALIZADO como Pré-jogo e Ranking: o painel (logado) lê os torneios públicos futuros e a
 *  contagem de inscrições (que o OBS, sem login, não consegue ler) e grava o card pronto em
 *  `broadcast/control.eventos`; o overlay só desenha. As vagas valem do último "Atualizar". */
export type EventosMode = 'full' | 'strip';

/** Como a inscrição aparece no selo. */
export type EventoStatus = 'abertas' | 'ultimas' | 'breve' | 'esgotado' | 'encerradas';

export const EVENTO_STATUS_LABEL: Record<EventoStatus, string> = {
  abertas: 'Inscrições abertas',
  ultimas: 'Últimas vagas',
  breve: 'Em breve',
  esgotado: 'Esgotado',
  encerradas: 'Inscrições encerradas',
};

export interface EventoItem {
  id: string;
  name: string;
  /** Datas em milissegundos (epoch): o doc não guarda `Date`. `endMs` = `startMs` em evento de um dia. */
  startMs: number;
  endMs: number;
  /** Local (nome da arena/clube) e cidade/UF — "Beach Club Jeri · Jijoca · CE". */
  venue: string | null;
  city: string | null;
  state: string | null;
  coverUrl: string | null;
  /** Nomes das categorias do evento. */
  categories: string[];
  /** Premiação total em centavos; `null` = sem premiação em dinheiro. */
  prizeCents: number | null;
  /** Vagas preenchidas e total; `null` = não deu pra contar. */
  filled: number | null;
  total: number | null;
  status: EventoStatus;
  /** Link de inscrição (vira o QR). */
  url: string;
}

export interface EventosCard {
  /** Mudou = a tela entra de novo (Atualizar). */
  key: string;
  /** "Circuito NexaGO 2026" — nome da temporada no cabeçalho. */
  season: string;
  /** Em ordem de data: o 1º é a "próxima etapa"; os demais (até 4) vão "na sequência". */
  items: EventoItem[];
}

export interface BroadcastEventos {
  on: boolean;
  mode: EventosMode;
  card: EventosCard | null;
}

export const DEFAULT_BROADCAST_EVENTOS: BroadcastEventos = { on: false, mode: 'full', card: null };

const STATUSES: readonly EventoStatus[] = ['abertas', 'ultimas', 'breve', 'esgotado', 'encerradas'];

function record(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
function int(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null;
}

function itemFromRaw(raw: unknown): EventoItem | null {
  const d = record(raw);
  const id = text(d['id']);
  const name = text(d['name']);
  const startMs = int(d['startMs']);
  const url = text(d['url']);
  if (!id || !name || startMs == null || !url) return null;
  const status = STATUSES.includes(d['status'] as EventoStatus) ? (d['status'] as EventoStatus) : 'abertas';
  const prize = int(d['prizeCents']);
  const total = int(d['total']);
  const filled = int(d['filled']);
  return {
    id,
    name,
    startMs,
    endMs: Math.max(int(d['endMs']) ?? startMs, startMs),
    venue: text(d['venue']),
    city: text(d['city']),
    state: text(d['state']),
    coverUrl: text(d['coverUrl']),
    categories: (Array.isArray(d['categories']) ? d['categories'] : []).map(text).filter((c): c is string => c !== null).slice(0, 8),
    prizeCents: prize != null && prize > 0 ? prize : null,
    filled: filled != null && filled >= 0 ? filled : null,
    total: total != null && total > 0 ? total : null,
    status,
    url,
  };
}

function cardFromRaw(raw: unknown): EventosCard | null {
  const d = record(raw);
  const key = text(d['key']);
  const items = (Array.isArray(d['items']) ? d['items'] : []).map(itemFromRaw).filter((i): i is EventoItem => i !== null).slice(0, 5);
  if (!key || items.length === 0) return null;
  return { key, season: text(d['season']) ?? '', items };
}

export function eventosFromRaw(raw: unknown): BroadcastEventos {
  const d = record(raw);
  return { on: d['on'] === true, mode: d['mode'] === 'strip' ? 'strip' : 'full', card: cardFromRaw(d['card']) };
}
