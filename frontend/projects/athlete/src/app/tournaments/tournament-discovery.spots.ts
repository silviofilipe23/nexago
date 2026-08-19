/**
 * Vagas do card do Competir.
 *
 * A contagem real de inscritos mora nos próprios documentos de `inscriptions` (1 doc = 1 dupla;
 * cancelar apaga o doc) — os contadores do doc do torneio são dado morto: `enrolledCount` nasce
 * `0` e nunca é incrementado, e `categories[].spotsLeft` nasce com a capacidade cheia e nunca é
 * decrementado. Por isso eles só entram como fallback quando a contagem fresca não veio (leitura
 * recusada/offline) — e nesse caso rendem "nenhuma vaga preenchida", que é o que o card mostrava
 * sempre. Mesma fonte de verdade da tela do torneio (`enrolledByCategory` do store) e do portal
 * da arena.
 */

import type { TournamentFormat, TournamentListingStatus } from './tournament-discovery.models';

/** O que o card precisa do `TournamentSummary` (estrutural: o summary satisfaz isso). */
export interface DiscoverySpotsSource {
  capacity: number;
  enrolledCount: number;
  categories: readonly { maxTeams: number; spotsLeft: number }[];
}

export interface DiscoverySpots {
  /** Vagas preenchidas — o número que o card mostra na legenda da barra. */
  filled: number;
  left: number;
  total: number;
}

/** Fallback dos contadores do doc, para quando a contagem de `inscriptions` não veio. */
function filledFromDoc(s: DiscoverySpotsSource, total: number): number {
  if (s.categories.length === 0) return Math.max(0, s.enrolledCount);
  const left = s.categories.reduce((sum, c) => sum + c.spotsLeft, 0);
  return Math.max(0, total - left);
}

/**
 * Total em duplas — a mesma unidade das inscrições que viram `filled`.
 *
 * A soma das categorias manda porque `capacity` no doc não tem unidade garantida: o wizard
 * grava o total de vagas (duplas), mas há torneio com o dobro gravado (atletas) e aí o card
 * mostraria metade do preenchimento real. Sem categoria com capacidade declarada sobra o
 * `capacity`.
 */
function totalSpotsOf(s: DiscoverySpotsSource): number {
  const fromCategories = s.categories.reduce((sum, c) => sum + Math.max(0, c.maxTeams), 0);
  return fromCategories > 0 ? fromCategories : Math.max(0, s.capacity);
}

export function discoverySpotsOf(s: DiscoverySpotsSource, enrolled: number | null): DiscoverySpots {
  const total = totalSpotsOf(s);
  const filled = enrolled != null ? Math.max(0, enrolled) : filledFromDoc(s, total);
  return { filled, left: Math.max(0, total - filled), total };
}

/** Preenchimento em % — trava em 100 porque a lista de espera pode passar da capacidade e a
 *  barra do card usa isso como largura. */
export function discoveryFillPercent(spots: Pick<DiscoverySpots, 'filled' | 'total'>): number {
  if (spots.total <= 0) return 0;
  return Math.min(100, Math.round((spots.filled / spots.total) * 100));
}

/**
 * Torneio concluído não anuncia mais oferta: vaga livre e valor de inscrição são convite para
 * algo que já fechou. O card troca a barra de vagas pela contagem de inscritos — o único número
 * que continua valendo depois do evento (quem disputou).
 */
export function discoveryShowsOffer(status: TournamentListingStatus): boolean {
  return status !== 'ended';
}

/** Contagem de inscritos do card concluído. A unidade segue o formato: `filled` conta docs de
 *  inscrição, que valem uma dupla no torneio de duplas e um atleta no individual. */
export function discoveryEnrolledLabel(filled: number, format: TournamentFormat): string {
  const count = Math.max(0, filled);
  if (format === 'Individual') {
    if (count === 0) return 'Nenhum atleta inscrito';
    return count === 1 ? '1 atleta inscrito' : `${count} atletas inscritos`;
  }
  if (count === 0) return 'Nenhuma dupla inscrita';
  return count === 1 ? '1 dupla inscrita' : `${count} duplas inscritas`;
}
