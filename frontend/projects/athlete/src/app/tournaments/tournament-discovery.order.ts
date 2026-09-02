/**
 * Ordem da listagem do Competir: primeiro o torneio mais próximo.
 *
 * Ordenar só por `startDate` crescente — o que a tela fazia — empilha o passado no topo: a lista
 * abria com o torneio de meses atrás e o deste fim de semana ficava lá embaixo. Pior, torneio sem
 * data cadastrada vinha antes de todos, porque o mapper preenche `startDate` com o epoch quando o
 * doc não tem `startAt`.
 *
 * A ordem passa a ser: acontecendo/por vir (o mais cedo primeiro) → sem data marcada → encerrados
 * (o mais recente primeiro). "Encerrado" é o mesmo estado que o card já anuncia no badge, então a
 * lista concorda com o que está desenhado nela.
 */

import type { TournamentListingStatus } from './tournament-discovery.models';

/** O que a ordenação precisa do card (estrutural: `DiscoveryTournament` satisfaz isso). */
export interface DiscoveryOrderSource {
  startDate: Date;
  status: TournamentListingStatus;
}

/** Faixas da lista, na ordem em que aparecem. */
const UPCOMING = 0;
const UNDATED = 1;
const ENDED = 2;

/** `startDate` = epoch é o "Data a confirmar" do mapper (`s.startAt ?? new Date(0)`). */
function hasStartDate(t: DiscoveryOrderSource): boolean {
  return t.startDate.getTime() > 0;
}

function bandOf(t: DiscoveryOrderSource): number {
  if (t.status === 'ended') return ENDED;
  return hasStartDate(t) ? UPCOMING : UNDATED;
}

export function compareByStartProximity(a: DiscoveryOrderSource, b: DiscoveryOrderSource): number {
  const bandA = bandOf(a);
  const bandB = bandOf(b);
  if (bandA !== bandB) return bandA - bandB;
  // Encerrado é passado: o mais recente é o mais relevante. O encerrado sem data cai no fim por
  // consequência — epoch é a menor data possível.
  if (bandA === ENDED) return b.startDate.getTime() - a.startDate.getTime();
  return a.startDate.getTime() - b.startDate.getTime();
}

/** Cópia ordenada — a lista recebida (um `computed`) não é tocada. */
export function sortByStartProximity<T extends DiscoveryOrderSource>(tournaments: readonly T[]): T[] {
  return [...tournaments].sort(compareByStartProximity);
}
