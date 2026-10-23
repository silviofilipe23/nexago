/**
 * Avaliações de aula vistas pela gestão do centro (callables `getClassReviewsForManager` e
 * `replyClassReviewTicket`, em `functions/src/class-review-manager.ts`). Aqui só o puro: tipos do
 * contrato, filtros, formatação e o efeito de uma resposta na lista.
 */

export const REPLY_MAX = 600;

export type ReviewPartKey = 'class' | 'professor' | 'place';
export type TicketStatus = 'open' | 'answered' | 'resolved';

export interface ManagerReviewPart {
  stars: number;
  tags: string[];
}

export interface ManagerReviewTicket {
  status: TicketStatus;
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

export interface ReplyResult {
  status: TicketStatus;
  review: ManagerReview;
}

export const PART_ORDER: ReviewPartKey[] = ['class', 'professor', 'place'];
export const PART_LABELS: Record<ReviewPartKey, string> = { class: 'Aula', professor: 'Professor', place: 'Centro' };

export const TICKET_STATUS: Record<TicketStatus, [label: string, tone: string]> = {
  open: ['Aberto', 'red'],
  answered: ['Respondido', 'blue'],
  resolved: ['Resolvido', 'green'],
};

export type ReviewFilter = 'all' | 'open' | 'low' | 'comment';

/** Nota baixa = alguma parte com 2 estrelas ou menos. */
export function isLowScore(r: ManagerReview): boolean {
  return PART_ORDER.some((p) => {
    const s = r.scores[p];
    return s != null && s.stars <= 2;
  });
}

export function matchesFilter(r: ManagerReview, f: ReviewFilter): boolean {
  switch (f) {
    case 'open':
      return r.ticket?.status === 'open';
    case 'low':
      return isLowScore(r);
    case 'comment':
      return r.comment.trim().length > 0;
    default:
      return true;
  }
}

/** Filtro da tela + professor (vazio = todos). Mantém a ordem do servidor. */
export function filterReviews(list: ManagerReview[], f: ReviewFilter, professor = ''): ManagerReview[] {
  return list.filter((r) => matchesFilter(r, f) && (!professor || r.professorName === professor));
}

/** Professores das avaliações carregadas, sem repetição, em ordem alfabética. */
export function professorOptions(list: ManagerReview[]): string[] {
  const names = new Set(list.map((r) => r.professorName.trim()).filter(Boolean));
  return [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** 'YYYY-MM-DD' → 'dd/mm'. */
export function formatShortDate(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(key ?? '');
  return m ? `${m[3]}/${m[2]}` : '';
}

/** Instante ISO → 'dd/mm' no fuso de Brasília (UTC−3, sem horário de verão). */
export function formatIsoDate(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return formatShortDate(new Date(t - 3 * 3_600_000).toISOString());
}

/** '4,5' (ou '—'). */
export function formatAverage(n: number | null): string {
  return n == null ? '—' : n.toFixed(1).replace('.', ',');
}

/** Quem avaliou: o nome, ou "Anônimo" — nada além disso. */
export function authorLabel(r: ManagerReview): string {
  return r.anonymous || !r.athleteName ? 'Anônimo' : r.athleteName;
}

export function canReply(r: ManagerReview): boolean {
  return r.ticket != null;
}

/**
 * Resposta gravada: troca a avaliação na lista e desconta o chamado quando ele estava aberto.
 * Sem o item na lista (já recarregada), devolve a página como está.
 */
export function applyReply(page: ManagerReviewsPage, previous: ManagerReview, result: ReplyResult): ManagerReviewsPage {
  const idx = page.reviews.findIndex((r) => r.id === previous.id);
  if (idx < 0) return page;
  const wasOpen = page.reviews[idx]!.ticket?.status === 'open';
  const nowOpen = result.review.ticket?.status === 'open';
  const reviews = page.reviews.slice();
  reviews[idx] = result.review;
  const delta = wasOpen && !nowOpen ? 1 : 0;
  return { ...page, reviews, openTickets: Math.max(0, page.openTickets - delta) };
}

/** Junta a página seguinte ("Carregar mais"); o resumo vem sempre da leitura mais nova. */
export function appendPage(current: ManagerReviewsPage | null, next: ManagerReviewsPage): ManagerReviewsPage {
  if (!current) return next;
  const seen = new Set(current.reviews.map((r) => r.id));
  return { ...next, reviews: [...current.reviews, ...next.reviews.filter((r) => !seen.has(r.id))] };
}

/** Erro das callables → texto da faixa. "NOT FOUND" cru = função ainda não publicada. */
export function reviewErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  const message = error instanceof Error ? error.message.trim() : '';
  if (message.toUpperCase() === 'NOT FOUND') {
    return 'Avaliações indisponíveis no momento. Tente mais tarde.';
  }
  if (code === 'functions/permission-denied') return message || 'Só owner e admin do centro veem as avaliações.';
  if (code === 'functions/unavailable' || code === 'functions/deadline-exceeded') return 'Sem conexão. Tente de novo.';
  if (code === 'functions/internal' && (!message || message.toLowerCase() === 'internal')) return 'Não foi possível concluir. Tente de novo.';
  return message || 'Não foi possível concluir. Tente de novo.';
}
