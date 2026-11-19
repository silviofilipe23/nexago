import { COURT_ON_ARRIVAL_LABEL } from '@nexago/arena-discovery';

import { normalizeReviewTags } from '../../data/arena-reviews-repository';
import type { ReviewableBooking } from '../../data/pending-arena-review';

/** XP creditado por `onArenaReviewCreatedAwardXp` (functions/src/arena-review-gamification.ts).
 *  O trigger é agnóstico à origem do write, então o portal promete o mesmo que o app. */
export const REVIEW_XP_REWARD = 10;

/** O que as opções pedem: elogio (4 e 5) ou o que melhorar (1 a 3). Espelha
 *  `ArenaReviewTone` em `arena_review_form_logic.dart`. */
export type ReviewTone = 'praise' | 'improve';

export function reviewToneFor(rating: number): ReviewTone {
  return rating >= 4 ? 'praise' : 'improve';
}

/** Mesmas strings e ordem de `arenaReviewPraiseTags` (Dart): app e portal gravam `tags` no
 *  mesmo `arena_reviews`, e o perfil da arena só soma o que for igual letra por letra.
 *  Pontualidade fica de fora: tem pergunta própria (`REVIEW_ON_TIME_QUESTION`). */
export const REVIEW_PRAISE_TAGS: readonly string[] = [
  'Areia fofa e limpa',
  'Rede bem armada',
  'Iluminação',
  'Atendimento',
  'Vestiário',
  'Bar e água',
  'Estacionamento',
];

/** Mesmas strings e ordem de `arenaReviewImprovementTags` (Dart). */
export const REVIEW_IMPROVEMENT_TAGS: readonly string[] = [
  'Areia dura ou com pedras',
  'Rede ou antenas',
  'Iluminação fraca',
  'Atendimento',
  'Vestiário',
  'Falta de água',
  'Estacionamento',
];

/** Pergunta objetiva, respondida com Sim/Atrasou (gravada em `onTime`). */
export const REVIEW_ON_TIME_QUESTION = 'A quadra foi liberada no horário?';

/** Mesmo limite de `arenaReviewCommentMax` (Dart). */
export const REVIEW_COMMENT_MAX = 500;

/** Opções para a nota; sem nota, nenhuma (a pergunta só aparece depois). */
export function reviewTagsFor(rating: number | null): readonly string[] {
  if (rating == null) return [];
  return reviewToneFor(rating) === 'praise' ? REVIEW_PRAISE_TAGS : REVIEW_IMPROVEMENT_TAGS;
}

/** Título da seção de opções, no tom da nota. */
export function reviewTagsHeading(tone: ReviewTone): string {
  return tone === 'praise' ? 'O que se destacou?' : 'O que pode melhorar?';
}

/** Ao trocar a nota: no mesmo tom as opções ficam; se o tom vira, a seleção zera.
 *  "Vestiário" marcado como destaque não pode ir a público como "A melhorar: Vestiário"
 *  sem o atleta escolher. */
export function keepReviewTags(
  selected: ReadonlySet<string>,
  from: number | null,
  to: number,
): ReadonlySet<string> {
  if (from == null || reviewToneFor(from) !== reviewToneFor(to)) return new Set<string>();
  return selected;
}

const RATING_LABELS: Record<number, string> = {
  1: 'Péssimo',
  2: 'Ruim',
  3: 'Regular',
  4: 'Bom',
  5: 'Excelente',
};

export function ratingLabel(rating: number | null): string {
  return rating == null ? '' : (RATING_LABELS[rating] ?? '');
}

const RATING_HINTS: Record<number, string> = {
  1: 'Não dá para voltar',
  2: 'Teve problema que atrapalhou o jogo',
  3: 'Deu para jogar, mas pode melhorar',
  4: 'Jogaria de novo aqui',
  5: 'Quero voltar',
};

/** Uma frase por nota (`arenaReviewHint`), para todo mundo usar a mesma régua. */
export function ratingHint(rating: number | null): string {
  return (rating == null ? undefined : RATING_HINTS[rating]) ?? 'Só a nota é obrigatória; o resto é opcional';
}

/** Mesmo formato gravado pelo app (`composeArenaReviewComment`): "Destaques: a, b" no
 *  elogio ou "A melhorar: a, b" na nota baixa, texto livre na linha de baixo. Null quando não
 *  há nem tag nem texto — o campo `comment` aceita null. */
export function composeReviewComment(
  tags: Iterable<string>,
  freeText: string,
  tone: ReviewTone = 'praise',
): string | null {
  const sorted = normalizeReviewTags([...tags]);
  const text = freeText.trim();
  if (sorted.length === 0 && text.length === 0) return null;
  const heading = tone === 'praise' ? 'Destaques' : 'A melhorar';
  const parts: string[] = [];
  if (sorted.length > 0) parts.push(`${heading}: ${sorted.join(', ')}`);
  if (text.length > 0) parts.push(text);
  return parts.join('\n');
}

/** Mensagem do "Avaliação enviada", no tom da nota. */
export function reviewSentMessage(arenaName: string, rating: number): string {
  const arena = arenaName.trim() || 'A arena';
  return reviewToneFor(rating) === 'praise'
    ? `${arena} vai ver o que se destacou.`
    : `${arena} recebe sua nota e o que pode melhorar. A resposta dela aparece no perfil da arena.`;
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

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const TIME_PATTERN = /^\d{2}:\d{2}$/;

/** Próximo dia com o mesmo dia da semana do jogo, sempre depois de hoje
 *  (`arenaReviewRebookDate`). */
export function reviewRebookDate(playedOn: Date, now: Date): Date {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let candidate = new Date(playedOn.getFullYear(), playedOn.getMonth(), playedOn.getDate() + 7);
  while (candidate.getTime() <= today.getTime()) {
    candidate = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate() + 7);
  }
  return candidate;
}

/** "Sáb 22/11", para o cartão "Jogar de novo" (`arenaReviewRebookLabel`). */
export function reviewRebookLabel(date: Date): string {
  return `${WEEKDAY_SHORT[date.getDay()]} ${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`;
}

/** Próxima reserva sugerida depois de uma nota boa: mesmo dia da semana, horário e quadra.
 *  A disponibilidade não é conferida aqui; a tela de horários da arena mostra. */
export interface ReviewRebookSuggestion {
  /** "Sáb 22/11 · 19:00" */
  when: string;
  /** "Quadra 2 · mesmo horário" */
  where: string;
  /** Rota da tela de horários (`/reservar/:arenaId/agendar`). */
  link: readonly string[];
  /** `date`, `time` e, quando a reserva diz, `courtId` e `sport` — os parâmetros que a tela
   *  de horários já lê da URL para pré-selecionar o horário. */
  queryParams: Readonly<Record<string, string>>;
}

/** Só em nota 4–5 e com data, horário e arena utilizáveis; senão, null. Quadra "definida na
 *  chegada" não vai no link: o atleta nunca escolheu aquela quadra. */
export function reviewRebookSuggestion(
  booking: ReviewableBooking,
  rating: number,
  now: Date,
): ReviewRebookSuggestion | null {
  if (reviewToneFor(rating) !== 'praise') return null;
  const arenaId = booking.arenaId.trim();
  const playedOn = parseDateKey(booking.dateKey);
  const startTime = booking.startTime.trim();
  if (!arenaId || playedOn == null || !TIME_PATTERN.test(startTime)) return null;

  const date = reviewRebookDate(playedOn, now);
  const courtName = booking.courtName.trim();
  const courtKnown = courtName.length > 0 && courtName !== COURT_ON_ARRIVAL_LABEL;
  const courtId = courtKnown ? (booking.courtId ?? '').trim() : '';
  const sport = (booking.sport ?? '').trim();
  const queryParams: Record<string, string> = {
    date: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
    time: startTime,
  };
  if (courtId) queryParams['courtId'] = courtId;
  if (sport) queryParams['sport'] = sport;

  return {
    when: `${reviewRebookLabel(date)} · ${startTime}`,
    where: [courtKnown ? courtName : '', 'mesmo horário'].filter((p) => p.length > 0).join(' · '),
    link: ['/reservar', arenaId, 'agendar'],
    queryParams,
  };
}
