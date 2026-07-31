import type { ReviewableBooking } from '../../data/pending-arena-review';

/** XP creditado por `onArenaReviewCreatedAwardXp` (functions/src/arena-review-gamification.ts).
 *  O trigger é agnóstico à origem do write, então o portal promete o mesmo que o app. */
export const REVIEW_XP_REWARD = 10;

/** Mesmas tags de `rating_dialog.dart`, na mesma ordem. */
export const REVIEW_HIGHLIGHT_TAGS: readonly string[] = [
  'Quadra impecável',
  'Atendimento bom',
  'Iluminação',
  'Vestiário',
  'Pontualidade',
  'Estacionamento',
];

export const REVIEW_DEFAULT_TAGS: readonly string[] = ['Quadra impecável', 'Atendimento bom'];

const RATING_LABELS: Record<number, string> = {
  1: 'Péssimo',
  2: 'Ruim',
  3: 'Regular',
  4: 'Bom',
  5: 'Excelente',
};

export function ratingLabel(rating: number): string {
  return RATING_LABELS[rating] ?? '';
}

/** Mesmo formato gravado pelo app: "Destaques: a, b" na primeira linha, texto livre na
 *  segunda. Null quando não há nem tag nem texto — o campo `comment` aceita null. */
export function composeReviewComment(tags: readonly string[], freeText: string): string | null {
  const sorted = [...tags].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const text = freeText.trim();
  if (sorted.length === 0 && text.length === 0) return null;
  const parts: string[] = [];
  if (sorted.length > 0) parts.push(`Destaques: ${sorted.join(', ')}`);
  if (text.length > 0) parts.push(text);
  return parts.join('\n');
}

function parseDateKey(dateKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateKey.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const parsed = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** `HOJE · 19:00-20:30 · QUADRA 2` — mesma composição de `_sessionSubtitle` (Dart). */
export function reviewSessionSubtitle(booking: ReviewableBooking, now: Date): string {
  const court = booking.courtName.trim() ? booking.courtName.trim().toUpperCase() : 'QUADRA';
  const time = `${booking.startTime}-${booking.endTime}`;
  const day = parseDateKey(booking.dateKey);
  if (day == null) return `${time} · ${court}`;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  const dayLabel =
    diffDays === 0 ? 'HOJE' : diffDays === 1 ? 'ONTEM' : `${pad2(day.getDate())}/${pad2(day.getMonth() + 1)}`;
  return `${dayLabel} · ${time} · ${court}`;
}
