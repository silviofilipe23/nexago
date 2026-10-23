import { httpsCallable, type Functions } from 'firebase/functions';

/** Avaliações de aulas como a gestão da arena vê — contrato de
 *  `functions/src/class-review-manager.ts` (`getClassReviewsForManager`,
 *  `replyClassReviewTicket`). Anônima não traz nada além de "Anônimo". */

export const CLASS_REVIEW_REPLY_MAX = 600;

export type ReviewTicketStatus = 'open' | 'answered' | 'resolved';
export type ReviewPartKey = 'class' | 'professor' | 'place';
export type ReviewFilter = 'all' | 'open' | 'low' | 'comment';

export interface ManagerReviewPart {
  stars: number;
  tags: string[];
}

export interface ManagerReviewTicket {
  status: ReviewTicketStatus;
  reply: string | null;
  repliedAt: string | null;
  repliedByName: string | null;
}

export interface ManagerReview {
  id: string;
  anonymous: boolean;
  athleteName: string | null;
  reviewedOn: string | null;
  date: string;
  startTime: string;
  title: string;
  professorName: string;
  scores: Record<ReviewPartKey, ManagerReviewPart | null>;
  comment: string;
  ticket: ManagerReviewTicket | null;
}

export interface ManagerReviewsPage {
  placeName: string;
  rating: number | null;
  ratingCount: number;
  averages: Record<ReviewPartKey, number | null>;
  openTickets: number;
  total: number;
  reviews: ManagerReview[];
  nextCursor: string | null;
}

export const REVIEW_PARTS: ReadonlyArray<{ key: ReviewPartKey; label: string }> = [
  { key: 'class', label: 'Aula' },
  { key: 'professor', label: 'Professor' },
  { key: 'place', label: 'Local' },
];

export const REVIEW_FILTERS: ReadonlyArray<{ id: ReviewFilter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'open', label: 'Chamados abertos' },
  { id: 'low', label: 'Nota baixa' },
  { id: 'comment', label: 'Com comentário' },
];

export const TICKET_LABEL: Record<ReviewTicketStatus, string> = {
  open: 'Aberto',
  answered: 'Respondido',
  resolved: 'Resolvido',
};

/** Alguma parte com 2 estrelas ou menos. */
export function isLowScore(review: ManagerReview): boolean {
  return REVIEW_PARTS.some(({ key }) => {
    const p = review.scores[key];
    return p != null && p.stars <= 2;
  });
}

export function filterReviews(reviews: readonly ManagerReview[], filter: ReviewFilter, professor: string | null = null): ManagerReview[] {
  return reviews.filter((r) => {
    if (professor && r.professorName !== professor) return false;
    switch (filter) {
      case 'open':
        return r.ticket?.status === 'open';
      case 'low':
        return isLowScore(r);
      case 'comment':
        return r.comment.trim().length > 0;
      default:
        return true;
    }
  });
}

/** Professores distintos (não vazios) das avaliações carregadas, em ordem alfabética. */
export function professorOptions(reviews: readonly ManagerReview[]): string[] {
  const names = new Set(reviews.map((r) => r.professorName.trim()).filter(Boolean));
  return [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** `YYYY-MM-DD` → `dd/mm`; lixo volta como veio. */
export function shortDate(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? '');
  return m ? `${m[3]}/${m[2]}` : (ymd ?? '');
}

/** Instante ISO → `dd/mm` no fuso de Brasília (UTC−3, sem horário de verão). */
export function shortDateFromIso(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return shortDate(new Date(t - 3 * 3_600_000).toISOString());
}

/** Média com uma casa e vírgula (`4,5`); sem média vira `—`. */
export function formatAverage(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? n.toFixed(1).replace('.', ',') : '—';
}

/** Nome mostrado: anônima nunca mostra outra coisa. */
export function reviewerLabel(review: ManagerReview): string {
  if (review.anonymous) return 'Anônimo';
  return review.athleteName?.trim() || 'Aluno';
}

/** Troca a avaliação respondida na lista e desconta o chamado aberto, se era o caso. */
export function applyReply(
  reviews: readonly ManagerReview[],
  openTickets: number,
  updated: ManagerReview,
): { reviews: ManagerReview[]; openTickets: number } {
  const before = reviews.find((r) => r.id === updated.id);
  const wasOpen = before?.ticket?.status === 'open';
  const nowOpen = updated.ticket?.status === 'open';
  return {
    reviews: reviews.map((r) => (r.id === updated.id ? updated : r)),
    openTickets: before && wasOpen && !nowOpen ? Math.max(0, openTickets - 1) : openTickets,
  };
}

/** Erro de validação da resposta (ou `null`). */
export function replyError(text: string): string | null {
  const t = text.trim();
  if (!t) return 'Escreva a resposta.';
  if (t.length > CLASS_REVIEW_REPLY_MAX) return `A resposta passa de ${CLASS_REVIEW_REPLY_MAX} caracteres.`;
  return null;
}

// ── callables ─────────────────────────────────────────────────────────────

async function call<In, Out>(functions: Functions, name: string, input: In): Promise<Out> {
  try {
    return (await httpsCallable<In, Out>(functions, name)(input)).data;
  } catch (err) {
    throw new Error(err instanceof Error && err.message ? err.message : 'Não foi possível concluir a operação.');
  }
}

export function fetchArenaReviews(functions: Functions, arenaId: string, cursor: string | null = null): Promise<ManagerReviewsPage> {
  return call(functions, 'getClassReviewsForManager', { kind: 'arena', placeId: arenaId, cursor });
}

export function replyReviewTicket(
  functions: Functions,
  reviewId: string,
  reply: string,
  resolve: boolean,
): Promise<{ status: ReviewTicketStatus; review: ManagerReview }> {
  return call(functions, 'replyClassReviewTicket', { reviewId, reply: reply.trim(), resolve });
}
