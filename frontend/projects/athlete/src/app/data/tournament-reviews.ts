/**
 * Avaliação do torneio pelos atletas — regras puras do portal.
 * Spec: docs/superpowers/specs/2026-10-01-tournament-athlete-reviews-design.md
 */

/** Mesma lista e ordem de `functions/src/tournament-review-constants.ts`. */
export const TOURNAMENT_REVIEW_ASPECTS = [
  { key: 'organization', label: 'Organização geral' },
  { key: 'schedule', label: 'Cumprimento dos horários' },
  { key: 'refereeing', label: 'Arbitragem / mesa' },
  { key: 'venue', label: 'Estrutura do local' },
  { key: 'prizes', label: 'Premiação e kit' },
] as const;

export type TournamentReviewAspectKey = (typeof TOURNAMENT_REVIEW_ASPECTS)[number]['key'];
export type TournamentReviewAspects = Partial<Record<TournamentReviewAspectKey, number>>;

export const TOURNAMENT_REVIEW_XP = 10;
export const TOURNAMENT_REVIEW_COMMENT_MAX = 1000;

export type TournamentReviewInviteStatus = 'pending' | 'submitted' | 'expired';

/** `users/{uid}/tournamentReviewInvites/{tournamentId}` — só o servidor grava. */
export interface TournamentReviewInvite {
  readonly tournamentId: string;
  readonly tournamentName: string;
  readonly coverUrl: string | null;
  readonly closesAt: Date;
  readonly status: TournamentReviewInviteStatus;
}

/** `tournamentReviews/{tournamentId}_{uid}`, lido pelo próprio autor. */
export interface MyTournamentReview {
  readonly overall: number;
  readonly aspects: TournamentReviewAspects;
  readonly comment: string | null;
}

export type TournamentReviewCtaState = 'none' | 'pending' | 'submitted' | 'closed';

const ASPECT_KEYS: readonly string[] = TOURNAMENT_REVIEW_ASPECTS.map((a) => a.key);

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function dateOf(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const t = value as { toDate?: () => Date } | null | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

function star(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}

/** Sem `closesAt` o prazo é desconhecido — o convite é tratado como ausente. */
export function inviteFromData(id: string, data: Record<string, unknown> | undefined): TournamentReviewInvite | null {
  if (!data) return null;
  const closesAt = dateOf(data['closesAt']);
  if (!closesAt) return null;
  const raw = data['status'];
  const status: TournamentReviewInviteStatus = raw === 'submitted' ? 'submitted' : raw === 'expired' ? 'expired' : 'pending';
  return {
    tournamentId: text(data['tournamentId']) || id,
    tournamentName: text(data['tournamentName']),
    coverUrl: text(data['coverUrl']) || null,
    closesAt,
    status,
  };
}

export function myReviewFromData(data: Record<string, unknown> | undefined): MyTournamentReview | null {
  if (!data) return null;
  const overall = star(data['overall']);
  if (overall == null) return null;
  const aspects: TournamentReviewAspects = {};
  const raw = data['aspects'];
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const s = star(value);
      if (ASPECT_KEYS.includes(key) && s != null) aspects[key as TournamentReviewAspectKey] = s;
    }
  }
  const comment = text(data['comment']);
  return { overall, aspects, comment: comment || null };
}

/** Aberto = não expirou E o prazo não passou. O status sozinho não basta: o job que marca
 *  `expired` roda uma vez por dia (e para inteiro com a flag desligada). */
export function isReviewOpen(invite: TournamentReviewInvite, now: Date): boolean {
  return invite.status !== 'expired' && invite.closesAt.getTime() > now.getTime();
}

export function reviewCtaState(invite: TournamentReviewInvite | null, now: Date): TournamentReviewCtaState {
  if (!invite) return 'none';
  if (!isReviewOpen(invite, now)) return 'closed';
  return invite.status === 'submitted' ? 'submitted' : 'pending';
}

export function openPendingReviews(invites: readonly TournamentReviewInvite[], now: Date): TournamentReviewInvite[] {
  return invites
    .filter((i) => i.status === 'pending' && isReviewOpen(i, now))
    .sort((a, b) => a.closesAt.getTime() - b.closesAt.getTime());
}

/** O diálogo abre só com `?avaliar=1`, convite aberto E do torneio da rota — link velho não abre
 *  formulário morto, e um convite que sobrou do torneio anterior não abre no atual. */
export function reviewDialogInviteOf(
  requested: boolean,
  invite: TournamentReviewInvite | null,
  now: Date,
  tournamentId: string,
): TournamentReviewInvite | null {
  return requested && invite && invite.tournamentId === tournamentId && isReviewOpen(invite, now) ? invite : null;
}

/** Leitura da avaliação própria: só com convite `submitted` DESTE torneio — a rule nega a
 *  leitura de doc inexistente, e um convite que sobrou do torneio anterior não vale aqui. */
export function shouldLoadMyReview(invite: TournamentReviewInvite | null, tournamentId: string): boolean {
  return invite?.status === 'submitted' && invite.tournamentId === tournamentId;
}

/** Estado da leitura da avaliação própria — o diálogo só monta o formulário de edição em `ready`. */
export type MyReviewStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Mesma regra do push (`functions/src/tournament-review-notifications.ts`). */
export function reviewLabel(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'torneio';
  return /^torneio\b/i.test(trimmed) ? trimmed : `torneio ${trimmed}`;
}

export function reviewQuestion(name: string): string {
  return `Como foi o ${reviewLabel(name)}?`;
}

const RATING_LABELS: Record<number, string> = { 1: 'Péssimo', 2: 'Ruim', 3: 'Ok', 4: 'Bom', 5: 'Excelente' };

export function reviewRatingLabel(rating: number | null): string {
  return rating == null ? '' : (RATING_LABELS[rating] ?? '');
}

const DAY_MONTH = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

export function reviewDayMonth(date: Date): string {
  return DAY_MONTH.format(date);
}

export interface ReviewCardItem {
  readonly tournamentId: string;
  readonly question: string;
  readonly closesLabel: string;
}

export function reviewCardItems(invites: readonly TournamentReviewInvite[], now: Date): ReviewCardItem[] {
  return openPendingReviews(invites, now).map((i) => ({
    tournamentId: i.tournamentId,
    question: reviewQuestion(i.tournamentName),
    closesLabel: reviewDayMonth(i.closesAt),
  }));
}

// ── Exibição pública (spec §5): selo do torneio, seção por aspecto e nota do organizador ─────

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

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function decimal(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function publicSummaryFromData(data: Record<string, unknown> | undefined): PublicReviewSummary | null {
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

export function organizerReputationFromData(data: Record<string, unknown> | undefined): OrganizerReputation | null {
  if (!data) return null;
  return {
    reviewsCount: count(data['reviewsCount']),
    tournamentsRated: count(data['tournamentsRated']),
    average: decimal(data['average']),
  };
}

/** Uma casa, vírgula — a mesma regra do push de fechamento e do painel do organizador. */
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

/** Barras de "Como os atletas avaliaram": só aspectos com nota, na ordem da lista. */
export function publicAspectRows(s: PublicReviewSummary | null): PublicAspectRow[] {
  if (!s || !hasPublicNumbers(s)) return [];
  return TOURNAMENT_REVIEW_ASPECTS.flatMap((a) => {
    const average = s.aspects[a.key];
    return average == null ? [] : [{ key: a.key, label: a.label, value: formatRating(average), pct: Math.round((average / 5) * 100) }];
  });
}
