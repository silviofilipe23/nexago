import { environment } from '../../../environments/environment';
import type { EventoItem, EventoStatus, EventosCard } from '../data/broadcast-eventos';
import { tournamentShareLink } from '../data/tournament-share';
import type { UpcomingEventPrize, UpcomingEventSummary } from '../data/upcoming-events-repository';

/** Quantos eventos o card leva: 1 "próxima etapa" + 4 "na sequência". */
export const EVENTOS_MAX = 5;

/** Valor em reais de um texto ("2000", "R$ 2.000,00") — mesma leitura do `prizeLabel` do site. */
export function prizeAmountOf(text: string): number {
  const digits = text.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const amount = Number(digits);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function sumCents(list: readonly UpcomingEventPrize[]): number {
  return list.reduce((sum, p) => {
    if (p.valueCents != null && p.valueCents > 0) return sum + Math.round(p.valueCents);
    return sum + (p.value ? Math.round(prizeAmountOf(p.value) * 100) : 0);
  }, 0);
}

/** Premiação total em centavos. Prêmios na raiz mandam; só sem eles somam os das categorias.
 *  `cashPrizesEnabled === false` ou soma zero = sem premiação em dinheiro (`null`). */
export function prizeCentsOf(e: Pick<UpcomingEventSummary, 'prizes' | 'categoryPrizes' | 'cashPrizesEnabled'>): number | null {
  if (e.cashPrizesEnabled === false) return null;
  const root = sumCents(e.prizes);
  const total = root > 0 ? root : sumCents(e.categoryPrizes);
  return total > 0 ? total : null;
}

/** Vagas: soma das categorias com capacidade; sem elas, o `capacity` do doc. `null` = sem total. */
export function totalSpotsOf(e: Pick<UpcomingEventSummary, 'categories' | 'capacity'>): number | null {
  const fromCategories = e.categories.reduce((sum, c) => sum + Math.max(0, c.maxTeams ?? 0), 0);
  const total = fromCategories > 0 ? fromCategories : Math.max(0, e.capacity);
  return total > 0 ? total : null;
}

/** Selo de inscrição. Precedência: esgotado > encerradas > breve > ultimas > abertas.
 *  - esgotado: há total e filled >= total;
 *  - encerradas: prazo de inscrição passou ou o doc está fechado ('closed'/'encerradas');
 *  - breve: a abertura das inscrições ainda não chegou;
 *  - ultimas: mais de 85% das vagas preenchidas. */
export function eventoStatusOf(
  e: Pick<UpcomingEventSummary, 'status' | 'registrationOpensAt' | 'registrationClosesAt'>,
  total: number | null,
  filled: number | null,
  nowMs: number,
): EventoStatus {
  if (total != null && filled != null && filled >= total) return 'esgotado';
  if ((e.registrationClosesAt && e.registrationClosesAt.getTime() < nowMs) || e.status === 'closed' || e.status === 'encerradas') return 'encerradas';
  if (e.registrationOpensAt && e.registrationOpensAt.getTime() > nowMs) return 'breve';
  if (total != null && filled != null && filled / total > 0.85) return 'ultimas';
  return 'abertas';
}

/** Card da tela "Próximos eventos". `filled` mapeia id → inscrições contadas (ausente = não deu
 *  pra contar). `null` sem eventos. */
export function eventosCardOf(
  src: readonly UpcomingEventSummary[],
  filled: ReadonlyMap<string, number>,
  nowMs: number,
  key: string,
  season: string,
): EventosCard | null {
  const items = src.slice(0, EVENTOS_MAX).map((e): EventoItem => {
    const total = totalSpotsOf(e);
    const count = filled.get(e.id) ?? null;
    const startMs = e.startAt.getTime();
    return {
      id: e.id,
      name: e.name,
      startMs,
      endMs: Math.max(e.endAt?.getTime() ?? startMs, startMs),
      venue: e.venue,
      city: e.city,
      state: e.state,
      coverUrl: e.coverUrl,
      categories: e.categories.map((c) => c.name),
      prizeCents: prizeCentsOf(e),
      filled: count,
      total,
      status: eventoStatusOf(e, total, count, nowMs),
      url: tournamentShareLink(
        { id: e.id, name: e.name, visibility: 'publicListing' },
        { siteBaseUrl: environment.publicSiteUrl, athleteBaseUrl: environment.athleteAppUrl },
      ).url,
    };
  });
  return items.length === 0 ? null : { key, season, items };
}
