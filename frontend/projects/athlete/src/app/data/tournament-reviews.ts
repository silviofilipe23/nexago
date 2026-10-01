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
