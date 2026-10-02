/**
 * Avaliação do torneio pelos atletas — leitura do backoffice (spec §4 "Backoffice"). Regras puras:
 * as leituras moram em `tournament-reviews.repository.ts`. Diferente do painel do organizador,
 * aqui o admin vê cada avaliação com o nome do atleta (`tournamentReviews` é liberado só a
 * `admin`/`superAdmin` pela rule).
 */

/** Abaixo disso o servidor grava `average: null` (e o organizador não vê comentários). */
export const MIN_PUBLIC_REVIEWS = 3;

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
export type SummarySort = 'recent' | 'worst';

/** `tournamentReviewSummaries/{tournamentId}`, só o que o backoffice usa. */
export interface ReviewSummary {
  tournamentId: string;
  tournamentName: string;
  organizerId: string;
  tournamentStartAt: Date | null;
  opensAt: Date | null;
  closesAt: Date | null;
  status: 'open' | 'closed';
  eligibleCount: number;
  count: number;
  average: number | null;
}

/** `tournamentReviews/{tournamentId}_{uid}` — o doc privado, com o autor. */
export interface AdminReview {
  id: string;
  uid: string;
  overall: StarValue;
  aspects: Partial<Record<ReviewAspectKey, StarValue>>;
  comment: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface SummaryRow {
  id: string;
  name: string;
  organizer: string;
  date: string;
  average: string;
  reviews: string;
  response: string;
  windowLabel: string;
  windowOpen: boolean;
}

export interface AdminReviewRow {
  id: string;
  athlete: string;
  overall: StarValue;
  stars: string;
  aspects: string[];
  comment: string | null;
  sentAt: string;
}

type Data = Record<string, unknown> | undefined;

const ASPECT_KEYS: readonly string[] = TOURNAMENT_REVIEW_ASPECTS.map((a) => a.key);
const EDIT_THRESHOLD_MS = 60_000;
const IN_QUERY_LIMIT = 30;

const DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const DAY_MONTH = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

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

export function summaryFromData(id: string, data: Data): ReviewSummary | null {
  if (!data) return null;
  return {
    tournamentId: text(data['tournamentId']) || id,
    tournamentName: text(data['tournamentName']),
    organizerId: text(data['organizerId']),
    tournamentStartAt: dateOf(data['tournamentStartAt']),
    opensAt: dateOf(data['opensAt']),
    closesAt: dateOf(data['closesAt']),
    status: data['status'] === 'open' ? 'open' : 'closed',
    eligibleCount: count(data['eligibleCount']),
    count: count(data['count']),
    average: decimal(data['average']),
  };
}

export function adminReviewFromData(id: string, data: Data): AdminReview | null {
  const uid = text(data?.['uid']);
  const overall = star(data?.['overall']);
  if (!data || !uid || overall == null) return null;
  const aspects: AdminReview['aspects'] = {};
  const raw = data['aspects'];
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const stars = star(value);
      if (ASPECT_KEYS.includes(key) && stars != null) aspects[key as ReviewAspectKey] = stars;
    }
  }
  const comment = text(data['comment']);
  return {
    id,
    uid,
    overall,
    aspects,
    comment: comment || null,
    createdAt: dateOf(data['createdAt']),
    updatedAt: dateOf(data['updatedAt']),
  };
}

/** Nome em `public_profiles/{uid}`: o admin precisa de identidade, então nome completo antes do apelido. */
export function profileNameFromData(data: Data): string | null {
  if (!data) return null;
  return text(data['fullName']) || text(data['name']) || text(data['nickname']).replace(/^@/, '') || null;
}

/** Nunca célula em branco: o uid encurtado deixa o admin achar a pessoa. */
export function fallbackName(uid: string): string {
  return `Sem nome (…${uid.slice(-6)})`;
}

/** Uma casa, vírgula — a mesma regra do app e dos portais. */
export function formatRating(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

export function reviewDate(date: Date | null): string {
  return date ? DATE.format(date) : '—';
}

export function reviewDateTime(date: Date | null): string {
  return date ? `${DATE.format(date)} ${TIME.format(date)}` : '—';
}

/** "23 de 42"; sem atletas aptos não há taxa — `—`, nunca "0 de 0". */
export function responseRateLabel(s: ReviewSummary): string {
  return s.eligibleCount === 0 ? '—' : `${s.count} de ${s.eligibleCount}`;
}

/** `status` sozinho não basta: o job que fecha pode atrasar. */
export function isReviewWindowOpen(s: ReviewSummary, now: Date): boolean {
  return s.status === 'open' && s.closesAt != null && s.closesAt.getTime() > now.getTime();
}

export function reviewWindowLabel(s: ReviewSummary, now: Date): string {
  return isReviewWindowOpen(s, now) ? `Aberta até ${DAY_MONTH.format(s.closesAt!)}` : 'Encerrada';
}

export function starsText(n: StarValue): string {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function hasPublicAverage(s: ReviewSummary): boolean {
  return s.count >= MIN_PUBLIC_REVIEWS && s.average != null;
}

function whenOf(s: ReviewSummary): number {
  return (s.tournamentStartAt ?? s.opensAt)?.getTime() ?? Number.NEGATIVE_INFINITY;
}

/** Comparação explícita: dois torneios sem data dariam `-Infinity - -Infinity = NaN`. */
function byRecent(a: ReviewSummary, b: ReviewSummary): number {
  const wa = whenOf(a);
  const wb = whenOf(b);
  return wa === wb ? 0 : wb > wa ? 1 : -1;
}

export function sortSummaries(list: readonly ReviewSummary[], mode: SummarySort): ReviewSummary[] {
  if (mode === 'recent') return [...list].sort(byRecent);
  const rated = list.filter(hasPublicAverage).sort((a, b) => a.average! - b.average! || b.count - a.count);
  const rest = list.filter((s) => !hasPublicAverage(s)).sort(byRecent);
  return [...rated, ...rest];
}

/** Mantém a ordem recebida (a ordenação é decisão de quem chama). */
export function summaryRows(list: readonly ReviewSummary[], names: ReadonlyMap<string, string>, now: Date): SummaryRow[] {
  return list.map((s) => ({
    id: s.tournamentId,
    name: s.tournamentName || 'Torneio sem nome',
    organizer: names.get(s.organizerId) ?? fallbackName(s.organizerId),
    date: reviewDate(s.tournamentStartAt ?? s.opensAt),
    average: hasPublicAverage(s) ? formatRating(s.average!) : '—',
    reviews: String(s.count),
    response: responseRateLabel(s),
    windowLabel: reviewWindowLabel(s, now),
    windowOpen: isReviewWindowOpen(s, now),
  }));
}

function sentLabel(r: AdminReview): string {
  const sent = `Enviada em ${reviewDateTime(r.createdAt)}`;
  const edited =
    r.createdAt != null && r.updatedAt != null && r.updatedAt.getTime() - r.createdAt.getTime() > EDIT_THRESHOLD_MS;
  return edited ? `${sent} · editada em ${reviewDateTime(r.updatedAt)}` : sent;
}

/** Da mais nova para a mais antiga, com o nome do atleta (ou o uid encurtado). */
export function adminReviewRows(reviews: readonly AdminReview[], names: ReadonlyMap<string, string>): AdminReviewRow[] {
  return [...reviews]
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
    .map((r) => ({
      id: r.id,
      athlete: names.get(r.uid) ?? fallbackName(r.uid),
      overall: r.overall,
      stars: starsText(r.overall),
      aspects: TOURNAMENT_REVIEW_ASPECTS.flatMap((a) => {
        const value = r.aspects[a.key];
        return value ? [`${a.label} ${value}★`] : [];
      }),
      comment: r.comment,
      sentAt: sentLabel(r),
    }));
}

/** Lotes para `documentId() in` (até 30 por consulta), sem repetidos nem vazios. */
export function chunkIds(ids: readonly string[], size = IN_QUERY_LIMIT): string[][] {
  const unique = [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size));
  return chunks;
}

export function reviewsErrorMessage(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code.includes('permission-denied')) {
    return 'Sem permissão para ler as avaliações. A tela precisa do papel admin.';
  }
  return err instanceof Error ? err.message : 'Falha ao ler as avaliações.';
}
