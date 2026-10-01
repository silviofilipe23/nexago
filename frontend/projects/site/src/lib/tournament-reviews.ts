/**
 * Avaliação do torneio pelos atletas — exibição pública no site (spec §5).
 * Spec: docs/superpowers/specs/2026-10-01-tournament-athlete-reviews-design.md
 * Sem SDK aqui: só regras puras, testáveis sem Firebase. As leituras moram em
 * `firestore/tournament-reviews.ts`.
 */

/** MESMA lista e ordem de `functions/src/tournament-review-constants.ts`. */
export const TOURNAMENT_REVIEW_ASPECTS = [
  { key: 'organization', label: 'Organização geral' },
  { key: 'schedule', label: 'Cumprimento dos horários' },
  { key: 'refereeing', label: 'Arbitragem / mesa' },
  { key: 'venue', label: 'Estrutura do local' },
  { key: 'prizes', label: 'Premiação e kit' },
] as const;

export type TournamentReviewAspectKey = (typeof TOURNAMENT_REVIEW_ASPECTS)[number]['key'];

/** Abaixo disso nada é público: sem selo, sem seção, sem nota do organizador. */
export const MIN_PUBLIC_REVIEWS = 3;

/** `tournamentReviewSummaries/{id}`, só o que a exibição pública usa. */
export interface PublicReviewSummary {
  readonly count: number;
  readonly average: number | null;
  /** Média de cada aspecto que recebeu nota. */
  readonly aspects: Partial<Record<TournamentReviewAspectKey, number>>;
}

/** `organizerReputation/{uid}`. `average` vem nulo enquanto `reviewsCount < 3`. */
export interface OrganizerReputation {
  readonly reviewsCount: number;
  readonly tournamentsRated: number;
  readonly average: number | null;
}

export interface PublicAspectRow {
  readonly key: TournamentReviewAspectKey;
  readonly label: string;
  /** "4,8". */
  readonly value: string;
  /** Largura da barra: média sobre 5, em %. */
  readonly pct: number;
}

type Data = Record<string, unknown> | undefined;

const ASPECT_KEYS: readonly string[] = TOURNAMENT_REVIEW_ASPECTS.map((a) => a.key);

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function decimal(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function publicSummaryFromData(data: Data): PublicReviewSummary | null {
  if (!data) return null;
  const aspects: Partial<Record<TournamentReviewAspectKey, number>> = {};
  const raw = data['aspects'];
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const average = decimal((value as Record<string, unknown> | null)?.['average']);
      if (ASPECT_KEYS.includes(key) && average != null) aspects[key as TournamentReviewAspectKey] = average;
    }
  }
  return { count: count(data['count']), average: decimal(data['average']), aspects };
}

export function organizerReputationFromData(data: Data): OrganizerReputation | null {
  if (!data) return null;
  return {
    reviewsCount: count(data['reviewsCount']),
    tournamentsRated: count(data['tournamentsRated']),
    average: decimal(data['average']),
  };
}

/** Nome do organizador em `public_profiles/{uid}`: nome completo antes do apelido. */
export function organizerNameFromData(data: Data): string | null {
  if (!data) return null;
  return text(data['fullName']) || text(data['name']) || text(data['nickname']).replace(/^@/, '') || null;
}

/** Uma casa, vírgula — a mesma regra do app e dos portais. */
export function formatRating(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

function hasPublicNumbers(s: PublicReviewSummary): s is PublicReviewSummary & { average: number } {
  return s.count >= MIN_PUBLIC_REVIEWS && s.average != null;
}

/** "★ 4,6 · 23 avaliações", ou `null` sem números públicos. */
export function reviewBadgeLabel(s: PublicReviewSummary | null): string | null {
  return s && hasPublicNumbers(s) ? `★ ${formatRating(s.average)} · ${s.count} avaliações` : null;
}

/** "★ 4,7 (86 avaliações em 5 torneios)", ou `null` abaixo de 3 avaliações. */
export function organizerReputationLabel(r: OrganizerReputation | null): string | null {
  if (!r || r.average == null || r.reviewsCount < MIN_PUBLIC_REVIEWS) return null;
  const tournaments = r.tournamentsRated === 1 ? '1 torneio' : `${r.tournamentsRated} torneios`;
  return `★ ${formatRating(r.average)} (${r.reviewsCount} avaliações em ${tournaments})`;
}

/** Linha do herói. Sem nome não há linha — nota solta não diz de quem é. */
export function organizerLine(name: string | null, reputation: OrganizerReputation | null): string | null {
  if (!name) return null;
  const rating = organizerReputationLabel(reputation);
  return rating ? `Organizado por ${name} · ${rating}` : `Organizado por ${name}`;
}

/** Barras de "Como os atletas avaliaram": só aspectos com nota, na ordem da lista. */
export function publicAspectRows(s: PublicReviewSummary | null): PublicAspectRow[] {
  if (!s || !hasPublicNumbers(s)) return [];
  return TOURNAMENT_REVIEW_ASPECTS.flatMap((a) => {
    const average = s.aspects[a.key];
    return average == null ? [] : [{ key: a.key, label: a.label, value: formatRating(average), pct: Math.round((average / 5) * 100) }];
  });
}
