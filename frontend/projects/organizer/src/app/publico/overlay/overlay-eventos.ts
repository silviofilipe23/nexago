import type { EventoItem } from '../../painel/data/broadcast-eventos';

/** Helpers de formatação da tela "Próximos eventos". Puros — a tela só desenha. */

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');
const startOfDay = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** Bloco de data: "24–25" + "OUT"; um dia só = "07" + "NOV"; entre meses = "30–02" + "OUT–NOV". */
export function eventoDataOf(e: Pick<EventoItem, 'startMs' | 'endMs'>): { dias: string; mes: string } {
  const a = new Date(e.startMs);
  const b = new Date(e.endMs);
  const mesmoDia = startOfDay(e.startMs) === startOfDay(e.endMs);
  if (mesmoDia) return { dias: pad(a.getDate()), mes: MONTHS[a.getMonth()]! };
  const dias = `${pad(a.getDate())}–${pad(b.getDate())}`;
  const mes = a.getMonth() === b.getMonth() ? MONTHS[a.getMonth()]! : `${MONTHS[a.getMonth()]}–${MONTHS[b.getMonth()]}`;
  return { dias, mes };
}

/** Dia da semana do início ("SÁB"). */
export function eventoDiaSemanaOf(e: Pick<EventoItem, 'startMs'>): string {
  return WEEKDAYS[new Date(e.startMs).getDay()]!;
}

/** Dias corridos até o início (hoje = 0, já começou = 0). Conta pela data de hoje, não pela hora. */
export function eventoDiasRestantes(e: Pick<EventoItem, 'startMs'>, nowMs: number): number {
  return Math.max(0, Math.round((startOfDay(e.startMs) - startOfDay(nowMs)) / DAY_MS));
}

/** Duração em dias corridos ("2 dias", "1 dia"). */
export function eventoDuracaoLabel(e: Pick<EventoItem, 'startMs' | 'endMs'>): string {
  const n = Math.round((startOfDay(e.endMs) - startOfDay(e.startMs)) / DAY_MS) + 1;
  return `${n} ${n === 1 ? 'dia' : 'dias'}`;
}

/** "R$ 25.000" (sem centavos quando redondo); `null` sem premiação. */
export function eventoPremiacaoLabel(cents: number | null): string | null {
  if (cents == null || cents <= 0) return null;
  const reais = cents / 100;
  return `R$ ${reais.toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(reais) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** Percentual de vagas preenchidas, 0–100; `null` quando não há contagem. */
export function eventoVagasPct(e: Pick<EventoItem, 'filled' | 'total'>): number | null {
  if (e.filled == null || e.total == null || e.total <= 0) return null;
  return Math.min(100, Math.round((e.filled / e.total) * 100));
}

/** "Beach Club Jeri · Jijoca · CE" — só o que existe. */
export function eventoLocalLabel(e: Pick<EventoItem, 'venue' | 'city' | 'state'>): string {
  return [e.venue, e.city, e.state].filter((p): p is string => !!p).join(' · ');
}

export const EVENTOS_STRIP_MS = 7000;
