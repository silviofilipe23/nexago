import type { OrganizerTournament } from './tournament.model';

/** Avaliação do torneio pelos atletas, lado do organizador — spec
 *  `docs/superpowers/specs/2026-10-01-tournament-athlete-reviews-design.md` §4. Os docs são
 *  gravados só pelo servidor (`functions/src/tournament-review-derived.ts`); aqui só se lê. */

/** Abaixo disso o resumo não tem média nem distribuição, e a rule nega os comentários. */
export const MIN_PUBLIC_REVIEWS = 3;

/** Depois disso o job diário (10h) não abre mais a janela de um torneio encerrado
 *  (`REVIEW_LOOKBACK_DAYS` em functions). */
const REVIEW_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

/** MESMA lista e ordem de `functions/src/tournament-review-constants.ts`. */
export const TOURNAMENT_REVIEW_ASPECTS = [
  { key: 'organization', label: 'Organização geral' },
  { key: 'schedule', label: 'Cumprimento dos horários' },
  { key: 'refereeing', label: 'Arbitragem / mesa' },
  { key: 'venue', label: 'Estrutura do local' },
  { key: 'prizes', label: 'Premiação e kit' },
] as const;

export type ReviewAspectKey = (typeof TOURNAMENT_REVIEW_ASPECTS)[number]['key'];
export type StarValue = 1 | 2 | 3 | 4 | 5;

export interface AspectStat {
  count: number;
  average: number;
}
export type AspectStats = Partial<Record<ReviewAspectKey, AspectStat>>;
export type StarDistribution = Record<StarValue, number>;

/** `tournamentReviewSummaries/{tournamentId}` — público. Com `count < 3`, `average`,
 *  `distribution` e `aspects` vêm nulos: só a contagem é real. */
export interface TournamentReviewSummary {
  tournamentId: string;
  tournamentName: string;
  tournamentStartAt: Date | null;
  status: 'open' | 'closed';
  eligibleCount: number;
  count: number;
  average: number | null;
  distribution: StarDistribution | null;
  aspects: AspectStats | null;
  opensAt: Date | null;
  closesAt: Date | null;
}

/** `tournaments/{tid}/anonymousReviews/{anonId}` — sem uid, data nem categoria. */
export interface AnonymousReview {
  id: string;
  overall: StarValue;
  aspects: Partial<Record<ReviewAspectKey, StarValue>>;
  comment: string | null;
  /** Ordem embaralhada fixa: a ordem de chegada não pode denunciar quem escreveu. */
  shuffleKey: number;
}

/** `organizerReputation/{uid}` — público. `average` nulo enquanto `reviewsCount < 3`. */
export interface OrganizerReputation {
  reviewsCount: number;
  tournamentsRated: number;
  average: number | null;
  aspects: AspectStats | null;
}

type Data = Record<string, unknown> | undefined;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function decimal(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function star(value: unknown): StarValue | null {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 ? value : null;
}

function dateOf(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const maybe = value as { toDate?: unknown } | null;
  return maybe && typeof maybe.toDate === 'function' ? (maybe as { toDate(): Date }).toDate() : null;
}

function isAspectKey(key: string): key is ReviewAspectKey {
  return TOURNAMENT_REVIEW_ASPECTS.some((a) => a.key === key);
}

function aspectStatsOf(value: unknown): AspectStats | null {
  if (!value || typeof value !== 'object') return null;
  const out: AspectStats = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isAspectKey(key) || !raw || typeof raw !== 'object') continue;
    const stat = raw as Record<string, unknown>;
    const average = decimal(stat['average']);
    const n = count(stat['count']);
    if (average != null && n > 0) out[key] = { count: n, average };
  }
  return out;
}

function distributionOf(value: unknown): StarDistribution | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  return { 1: count(raw['1']), 2: count(raw['2']), 3: count(raw['3']), 4: count(raw['4']), 5: count(raw['5']) };
}

export function summaryFromData(id: string, data: Data): TournamentReviewSummary | null {
  if (!data) return null;
  return {
    tournamentId: text(data['tournamentId']) || id,
    tournamentName: text(data['tournamentName']),
    tournamentStartAt: dateOf(data['tournamentStartAt']),
    status: data['status'] === 'open' ? 'open' : 'closed',
    eligibleCount: count(data['eligibleCount']),
    count: count(data['count']),
    average: decimal(data['average']),
    distribution: distributionOf(data['distribution']),
    aspects: aspectStatsOf(data['aspects']),
    opensAt: dateOf(data['opensAt']),
    closesAt: dateOf(data['closesAt']),
  };
}

export function anonymousReviewFromData(id: string, data: Data): AnonymousReview | null {
  const overall = star(data?.['overall']);
  if (!data || overall == null) return null;
  const aspects: AnonymousReview['aspects'] = {};
  const raw = data['aspects'];
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const stars = star(value);
      if (isAspectKey(key) && stars != null) aspects[key] = stars;
    }
  }
  const comment = text(data['comment']);
  return { id, overall, aspects, comment: comment || null, shuffleKey: decimal(data['shuffleKey']) ?? 0 };
}

export function reputationFromData(data: Data): OrganizerReputation | null {
  if (!data) return null;
  return {
    reviewsCount: count(data['reviewsCount']),
    tournamentsRated: count(data['tournamentsRated']),
    average: decimal(data['average']),
    aspects: aspectStatsOf(data['aspects']),
  };
}

/** Média, distribuição e aspectos só existem (e os comentários só são liberados) a partir de 3. */
export function hasPublicNumbers(s: TournamentReviewSummary): s is TournamentReviewSummary & { average: number } {
  return s.count >= MIN_PUBLIC_REVIEWS && s.average != null;
}

const DAY_MONTH = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Uma casa, vírgula — a mesma regra do push de fechamento (fase 1). */
export function formatRating(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

export function reviewsCountLabel(n: number): string {
  return n === 1 ? '1 avaliação' : `${n} avaliações`;
}

export function responseRateLabel(s: TournamentReviewSummary): string {
  return `${s.count} de ${s.eligibleCount} atletas`;
}

/** `status` sozinho não basta: o job que fecha pode atrasar. */
export function isReviewWindowOpen(s: TournamentReviewSummary, now: Date): boolean {
  return s.status === 'open' && s.closesAt != null && s.closesAt.getTime() > now.getTime();
}

export function reviewWindowLabel(s: TournamentReviewSummary, now: Date): string {
  return isReviewWindowOpen(s, now) ? `Aberta até ${DAY_MONTH.format(s.closesAt!)}` : 'Encerrada';
}

export function collectingText(s: TournamentReviewSummary): string {
  if (s.eligibleCount === 0) return 'Nenhum atleta ficou apto a avaliar este torneio.';
  return `${s.count} de ${s.eligibleCount} atletas avaliaram. As notas aparecem a partir de ${MIN_PUBLIC_REVIEWS} avaliações.`;
}

export type ReviewsEmptyState = 'notEnded' | 'opening' | 'endedBefore' | 'cancelled';

/** Sem resumo: o que dizer. Espelha `reviewCandidateReason` (functions): concluído ou `endAt`
 *  passado entram no job das 10h por até 3 dias. Este modelo não tem `completedAt`; concluído
 *  sem `endAt` passado conta como "acabou agora". */
export function reviewsEmptyState(t: Pick<OrganizerTournament, 'status' | 'endAt'>, now: Date): ReviewsEmptyState {
  if (t.status === 'cancelado') return 'cancelled';
  const endAtPassed = t.endAt != null && t.endAt.getTime() <= now.getTime();
  if (t.status !== 'concluido' && !endAtPassed) return 'notEnded';
  const endedAt = endAtPassed ? t.endAt!.getTime() : now.getTime();
  return now.getTime() - endedAt <= REVIEW_LOOKBACK_MS ? 'opening' : 'endedBefore';
}

export const REVIEWS_EMPTY_TEXT: Record<ReviewsEmptyState, string> = {
  notEnded: 'A avaliação abre quando o torneio terminar.',
  opening: 'O torneio terminou. O pedido de avaliação sai para os atletas às 10h.',
  endedBefore: 'Este torneio terminou antes de as avaliações existirem.',
  cancelled: 'Torneio cancelado não recebe avaliações.',
};

export interface AspectRow {
  key: ReviewAspectKey;
  label: string;
  average: number;
  count: number;
  /** "3,4 · 18 notas". */
  text: string;
  /** Largura da barra: média sobre 5, em %. */
  pct: number;
}

/** Do mais fraco ao mais forte; no empate, a ordem da lista (o `sort` do JS é estável). */
export function aspectRows(aspects: AspectStats | null): AspectRow[] {
  if (!aspects) return [];
  const rows: AspectRow[] = [];
  for (const aspect of TOURNAMENT_REVIEW_ASPECTS) {
    const stat = aspects[aspect.key];
    if (!stat) continue;
    rows.push({
      key: aspect.key,
      label: aspect.label,
      average: stat.average,
      count: stat.count,
      text: `${formatRating(stat.average)} · ${stat.count === 1 ? '1 nota' : `${stat.count} notas`}`,
      pct: Math.round((stat.average / 5) * 100),
    });
  }
  return rows.sort((a, b) => a.average - b.average);
}

export function weakestAspectLabel(aspects: AspectStats | null): string | null {
  return aspectRows(aspects)[0]?.label ?? null;
}

export interface DistributionRow {
  stars: StarValue;
  label: string;
  count: number;
  pct: number;
}

export function distributionRows(d: StarDistribution | null): DistributionRow[] {
  if (!d) return [];
  const total = d[1] + d[2] + d[3] + d[4] + d[5];
  return ([5, 4, 3, 2, 1] as const).map((stars) => ({
    stars,
    label: `${stars}★`,
    count: d[stars],
    pct: total > 0 ? Math.round((d[stars] / total) * 100) : 0,
  }));
}

export type CommentFilter = 'all' | 'low';

/** Avaliação sem texto entra nos números, mas não vira card. */
export function commentCards(reviews: readonly AnonymousReview[], filter: CommentFilter): AnonymousReview[] {
  return reviews
    .filter((r) => r.comment != null && (filter === 'all' || r.overall <= 2))
    .sort((a, b) => a.shuffleKey - b.shuffleKey);
}

export function starsText(n: StarValue): string {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

export function reviewAspectChips(r: AnonymousReview): string[] {
  return TOURNAMENT_REVIEW_ASPECTS.flatMap((a) => {
    const value = r.aspects[a.key];
    return value ? [`${a.label} ${value}★`] : [];
  });
}

export function reviewKpiLabel(s: TournamentReviewSummary | null): string {
  return s && hasPublicNumbers(s) ? `${formatRating(s.average)} ★` : '—';
}

const FULL_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

export interface ReputationRow {
  tournamentId: string;
  name: string;
  date: string;
  average: string;
  reviews: string;
  response: string;
  weakest: string;
}

/** Tabela "Por torneio" da Reputação: do mais recente para o mais antigo. */
export function reputationRows(summaries: readonly TournamentReviewSummary[]): ReputationRow[] {
  const when = (s: TournamentReviewSummary) => s.tournamentStartAt ?? s.opensAt;
  return [...summaries]
    .sort((a, b) => (when(b)?.getTime() ?? 0) - (when(a)?.getTime() ?? 0))
    .map((s) => {
      const date = when(s);
      return {
        tournamentId: s.tournamentId,
        name: s.tournamentName || 'Torneio sem nome',
        date: date ? FULL_DATE.format(date) : '—',
        average: hasPublicNumbers(s) ? formatRating(s.average) : '—',
        reviews: String(s.count),
        // Resumo sem atletas aptos nasce fechado com 0 de 0 — isso não é taxa de resposta.
        response: s.eligibleCount === 0 ? '—' : `${s.count} de ${s.eligibleCount}`,
        weakest: weakestAspectLabel(s.aspects) ?? '—',
      };
    });
}
