# Avaliação da experiência na arena (portal do atleta) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o portal do atleta pedir a avaliação da arena depois de uma reserva concluída, com paridade de comportamento e de copy com o app Flutter.

**Architecture:** Três camadas novas em `frontend/projects/athlete/src/app` — lógica pura de elegibilidade (`data/pending-arena-review.ts`), escrita no Firestore (`data/arena-reviews-repository.ts`) e um store `providedIn: 'root'` (`data/pending-arena-review.service.ts`) que alimenta um único componente de modal reaproveitado por três telas (Agenda, detalhe da reserva, histórico). Nada de rules ou Cloud Functions muda: o `create` em `arena_reviews` já é permitido e o XP já é creditado por trigger.

**Tech Stack:** Angular 20 standalone + signals, `firebase/firestore` (SDK modular v9+), Karma/Jasmine, SCSS com os tokens `--nx-*`.

**Spec:** `docs/superpowers/specs/2026-07-31-portal-atleta-avaliacao-experiencia-design.md`

## Global Constraints

- Todos os comandos `ng` rodam a partir de `frontend/` (é onde está o `angular.json`). Do root do worktree: `cd frontend`.
- Testes: `npx ng test athlete --watch=false --browsers=ChromeHeadless --include='<glob>'`. Build: `npx ng build athlete --configuration production`.
- Angular: componentes standalone (não declarar `standalone: true`, é o default), `ChangeDetectionStrategy.OnPush`, `input()`/`output()` em vez de decorators, `inject()` em vez de injeção por construtor, `signal()`/`computed()` para estado, controle de fluxo nativo (`@if`/`@for`), `class`/`style` bindings em vez de `ngClass`/`ngStyle`.
- TypeScript estrito. Nunca `any` — use `unknown` quando o tipo for incerto.
- Strings de UI em português; identificadores em inglês. Comentários em português, no tom dos arquivos vizinhos (explicam *por quê*, não *o quê*).
- Coleções: `arena_reviews` (avaliações), `arenaBookings` (reservas). Não inventar nomes.
- Copy exata, igual ao app: recompensa `+10 XP`; tags `Quadra impecável`, `Atendimento bom`, `Iluminação`, `Vestiário`, `Pontualidade`, `Estacionamento`; labels de nota `Péssimo`/`Ruim`/`Regular`/`Bom`/`Excelente`; botões `Agora não` e `Enviar e ganhar +10 XP`.
- Janela do convite automático: 30 dias. Atraso após o fim da reserva: 5 minutos.
- Um commit por task, mensagem no padrão do repo (`feat(athlete-web): ...`, `test(athlete-web): ...`), terminando com:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```

## File Structure

**Criar:**

| Arquivo | Responsabilidade |
| --- | --- |
| `frontend/projects/athlete/src/app/data/pending-arena-review.ts` | Elegibilidade e seleção da reserva pendente. Puro, sem Firestore. |
| `frontend/projects/athlete/src/app/data/pending-arena-review.spec.ts` | Testes do acima. |
| `frontend/projects/athlete/src/app/agenda/review/arena-review-copy.ts` | Constantes de copy e formatadores puros do modal. |
| `frontend/projects/athlete/src/app/agenda/review/arena-review-copy.spec.ts` | Testes do acima. |
| `frontend/projects/athlete/src/app/data/arena-reviews-repository.ts` | Escrita em `arena_reviews`, leitura dos ids já avaliados, validação pura. |
| `frontend/projects/athlete/src/app/data/arena-reviews-repository.spec.ts` | Testes da validação pura. |
| `frontend/projects/athlete/src/app/data/pending-arena-review.service.ts` | Store `providedIn: 'root'` compartilhado pelas três telas. |
| `frontend/projects/athlete/src/app/agenda/review/arena-review-dialog.component.ts` | Modal. |
| `frontend/projects/athlete/src/app/agenda/review/arena-review-dialog.component.html` | Template do modal. |
| `frontend/projects/athlete/src/app/agenda/review/arena-review-dialog.component.scss` | Estilos do modal. |

**Modificar:** `agenda/athlete-agenda.component.{ts,html,scss}`, `agenda/booking-detail/athlete-booking-detail.component.{ts,html,scss}`, `history/athlete-history.component.{ts,html,scss}`.

---

### Task 1: Elegibilidade e seleção da reserva pendente

**Files:**
- Create: `frontend/projects/athlete/src/app/data/pending-arena-review.ts`
- Test: `frontend/projects/athlete/src/app/data/pending-arena-review.spec.ts`

**Interfaces:**
- Consumes: `MyBooking`, `bookingIsActive`, `bookingStartsAt`, `bookingEndsAt` de `./my-bookings-repository`.
- Produces:
  - `interface ReviewableBooking { id, arenaId, arenaName, courtName, dateKey, startTime, endTime: string }`
  - `type ReviewEligibilityFields = Pick<MyBooking, 'status' | 'dateKey' | 'startTime' | 'endTime'>`
  - `bookingIsReviewable(booking: ReviewEligibilityFields, now: Date): boolean`
  - `bookingEndIsUnknown(booking: ReviewEligibilityFields): boolean`
  - `pickPendingReview(bookings: readonly MyBooking[], reviewedBookingIds: ReadonlySet<string>, now: Date): MyBooking | null`
  - `const AUTO_PROMPT_WINDOW_DAYS = 30`

Contexto: `ArenaBookingDoc` (de `arena-bookings-repository.ts`) e `MyBooking` têm os sete campos de `ReviewableBooking` com os mesmos nomes e tipos, então ambos satisfazem a interface estruturalmente — nenhuma conversão é necessária nas telas.

- [ ] **Step 1: Escrever o teste que falha**

Crie `frontend/projects/athlete/src/app/data/pending-arena-review.spec.ts`:

```ts
import type { MyBooking } from './my-bookings-repository';
import { AUTO_PROMPT_WINDOW_DAYS, bookingEndIsUnknown, bookingIsReviewable, pickPendingReview } from './pending-arena-review';

function booking(overrides: Partial<MyBooking> = {}): MyBooking {
  return {
    id: 'b1',
    arenaId: 'a1',
    arenaName: 'Arena Central',
    courtName: 'Quadra 2',
    dateKey: '2026-04-15',
    startTime: '19:00',
    endTime: '20:30',
    status: 'confirmed',
    attendanceConfirmed: false,
    amountReais: 68,
    createdAt: null,
    ...overrides,
  };
}

describe('bookingIsReviewable', () => {
  it('libera a reserva que terminou há mais de 5 minutos', () => {
    expect(bookingIsReviewable(booking(), new Date(2026, 3, 15, 20, 36))).toBe(true);
  });

  it('segura a reserva que acabou de terminar (dentro dos 5 minutos)', () => {
    expect(bookingIsReviewable(booking(), new Date(2026, 3, 15, 20, 33))).toBe(false);
  });

  it('não libera reserva futura', () => {
    expect(bookingIsReviewable(booking(), new Date(2026, 3, 15, 18, 0))).toBe(false);
  });

  it('nunca libera reserva cancelada, nas duas grafias', () => {
    const now = new Date(2026, 3, 15, 22, 0);
    expect(bookingIsReviewable(booking({ status: 'canceled' }), now)).toBe(false);
    expect(bookingIsReviewable(booking({ status: 'CANCELLED' }), now)).toBe(false);
  });

  it('libera por status explícito mesmo antes do horário terminar', () => {
    const now = new Date(2026, 3, 15, 19, 10);
    expect(bookingIsReviewable(booking({ status: 'completed' }), now)).toBe(true);
    expect(bookingIsReviewable(booking({ status: 'finalizado' }), now)).toBe(true);
  });

  it('trata a reserva que cruza a meia-noite somando um dia ao fim', () => {
    const crossing = booking({ startTime: '22:00', endTime: '01:00' });
    expect(bookingIsReviewable(crossing, new Date(2026, 3, 16, 0, 30))).toBe(false);
    expect(bookingIsReviewable(crossing, new Date(2026, 3, 16, 1, 10))).toBe(true);
  });

  it('não libera por tempo quando o fim é inutilizável', () => {
    const broken = booking({ endTime: '--:--' });
    expect(bookingIsReviewable(broken, new Date(2026, 3, 20, 12, 0))).toBe(false);
    expect(bookingEndIsUnknown(broken)).toBe(true);
    expect(bookingEndIsUnknown(booking())).toBe(false);
  });
});

describe('pickPendingReview', () => {
  const now = new Date(2026, 3, 20, 12, 0);
  const noneReviewed: ReadonlySet<string> = new Set<string>();

  it('escolhe a reserva concluída de fim mais recente', () => {
    const older = booking({ id: 'antiga', dateKey: '2026-04-10' });
    const newer = booking({ id: 'recente', dateKey: '2026-04-18' });
    expect(pickPendingReview([older, newer], noneReviewed, now)?.id).toBe('recente');
    expect(pickPendingReview([newer, older], noneReviewed, now)?.id).toBe('recente');
  });

  it('ignora as reservas já avaliadas', () => {
    const reviewed = booking({ id: 'recente', dateKey: '2026-04-18' });
    const pendente = booking({ id: 'pendente', dateKey: '2026-04-10' });
    expect(pickPendingReview([reviewed, pendente], new Set(['recente']), now)?.id).toBe('pendente');
  });

  it('devolve null com lista vazia', () => {
    expect(pickPendingReview([], noneReviewed, now)).toBeNull();
  });

  it('devolve null quando a única candidata está fora da janela de 30 dias', () => {
    const antiga = booking({ id: 'antiga', dateKey: '2026-03-01' });
    expect(pickPendingReview([antiga], noneReviewed, now)).toBeNull();
  });

  it('a candidata fora da janela continua avaliável fora do convite automático', () => {
    expect(bookingIsReviewable(booking({ dateKey: '2026-03-01' }), now)).toBe(true);
    expect(AUTO_PROMPT_WINDOW_DAYS).toBe(30);
  });

  it('ignora reserva sem fim utilizável (nunca cobra pelo que não dá pra datar)', () => {
    expect(pickPendingReview([booking({ endTime: '--:--' })], noneReviewed, now)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/pending-arena-review.spec.ts'
```

Esperado: FAIL na compilação — `Cannot find module './pending-arena-review'`.

- [ ] **Step 3: Escrever a implementação**

Crie `frontend/projects/athlete/src/app/data/pending-arena-review.ts`:

```ts
import { bookingEndsAt, bookingIsActive, bookingStartsAt, type MyBooking } from './my-bookings-repository';

/** Espelha `_reviewPromptDelayAfterEnd` (arena_review_providers.dart): a reserva só entra
 *  na fila de avaliação 5 minutos depois de acabar. */
const REVIEW_PROMPT_DELAY_MS = 5 * 60_000;

const DAY_MS = 86_400_000;

/** Janela do convite automático. Reserva mais antiga que isso continua avaliável pelos
 *  CTAs do detalhe e do histórico, mas não abre modal nem cobra no card "Precisa de você" —
 *  cobrar por um jogo de meses atrás é ruído, não lembrete. */
export const AUTO_PROMPT_WINDOW_DAYS = 30;

/** Campos que o modal precisa da reserva. `MyBooking` e `ArenaBookingDoc` satisfazem os dois
 *  estruturalmente, então nenhuma tela precisa converter nada. */
export interface ReviewableBooking {
  id: string;
  arenaId: string;
  arenaName: string;
  courtName: string;
  dateKey: string;
  startTime: string;
  endTime: string;
}

export type ReviewEligibilityFields = Pick<MyBooking, 'status' | 'dateKey' | 'startTime' | 'endTime'>;

const TIME_RE = /^\d{2}:\d{2}$/;

/** Fim real da reserva, somando um dia quando ela cruza a meia-noite (22:00→01:00).
 *  `bookingEndsAt` não faz esse ajuste — e aqui ele importa, porque "5 minutos depois do
 *  fim" é o gatilho da avaliação. Null quando não dá pra datar o fim. */
function reviewEndsAt(booking: ReviewEligibilityFields): Date | null {
  if (!TIME_RE.test(booking.endTime)) return null;
  const start = bookingStartsAt(booking);
  const end = bookingEndsAt(booking);
  if (start == null || end == null) return null;
  if (end.getTime() > start.getTime()) return end;
  const adjusted = new Date(end);
  adjusted.setDate(adjusted.getDate() + 1);
  return adjusted;
}

/** `true` quando não dá pra afirmar que a reserva terminou por falta de data/hora utilizável.
 *  Quem valida a escrita trata isso como "confia no gate anterior" — mesma decisão do app. */
export function bookingEndIsUnknown(booking: ReviewEligibilityFields): boolean {
  return reviewEndsAt(booking) == null;
}

/** Espelha o filtro de `pendingReviewProvider` (Dart): concluída por status explícito ou por
 *  tempo, nunca cancelada. */
export function bookingIsReviewable(booking: ReviewEligibilityFields, now: Date): boolean {
  if (!bookingIsActive(booking)) return false;
  const status = booking.status.trim().toLowerCase();
  if (status === 'completed' || status === 'finalizado') return true;
  const endsAt = reviewEndsAt(booking);
  if (endsAt == null) return false;
  return now.getTime() > endsAt.getTime() + REVIEW_PROMPT_DELAY_MS;
}

/** Candidata ao convite automático: concluída, não avaliada e dentro da janela de 30 dias.
 *  Entre as elegíveis vence a de fim mais recente — o app pega a primeira da ordem do stream,
 *  que é arbitrária (duas queries mescladas por id); perguntar sobre o jogo mais fresco é o
 *  que o atleta consegue responder. */
export function pickPendingReview(
  bookings: readonly MyBooking[],
  reviewedBookingIds: ReadonlySet<string>,
  now: Date,
): MyBooking | null {
  const windowStart = now.getTime() - AUTO_PROMPT_WINDOW_DAYS * DAY_MS;
  let best: MyBooking | null = null;
  let bestEnd = Number.NEGATIVE_INFINITY;

  for (const booking of bookings) {
    if (reviewedBookingIds.has(booking.id)) continue;
    if (!bookingIsReviewable(booking, now)) continue;
    const endsAt = reviewEndsAt(booking);
    if (endsAt == null) continue;
    const end = endsAt.getTime();
    if (end < windowStart) continue;
    if (end > bestEnd) {
      best = booking;
      bestEnd = end;
    }
  }

  return best;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/pending-arena-review.spec.ts'
```

Esperado: PASS, 13 specs.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/data/pending-arena-review.ts frontend/projects/athlete/src/app/data/pending-arena-review.spec.ts
git commit -m "$(cat <<'EOF'
feat(athlete-web): elegibilidade da avaliacao de arena por reserva

Espelha pendingReviewProvider (Dart): concluida por status ou por tempo,
nunca cancelada, com janela de 30 dias para o convite automatico. Trata a
reserva que cruza a meia-noite localmente — bookingEndsAt nao soma o dia e
mexer nele mudaria bookingIsUpcoming, usado pela Agenda inteira.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Copy e formatadores do modal

**Files:**
- Create: `frontend/projects/athlete/src/app/agenda/review/arena-review-copy.ts`
- Test: `frontend/projects/athlete/src/app/agenda/review/arena-review-copy.spec.ts`

**Interfaces:**
- Consumes: `ReviewableBooking` de `../../data/pending-arena-review`.
- Produces:
  - `const REVIEW_XP_REWARD = 10`
  - `const REVIEW_HIGHLIGHT_TAGS: readonly string[]`
  - `const REVIEW_DEFAULT_TAGS: readonly string[]`
  - `ratingLabel(rating: number): string`
  - `composeReviewComment(tags: readonly string[], freeText: string): string | null`
  - `reviewSessionSubtitle(booking: ReviewableBooking, now: Date): string`

- [ ] **Step 1: Escrever o teste que falha**

Crie `frontend/projects/athlete/src/app/agenda/review/arena-review-copy.spec.ts`:

```ts
import type { ReviewableBooking } from '../../data/pending-arena-review';
import {
  REVIEW_DEFAULT_TAGS,
  REVIEW_HIGHLIGHT_TAGS,
  REVIEW_XP_REWARD,
  composeReviewComment,
  ratingLabel,
  reviewSessionSubtitle,
} from './arena-review-copy';

function reviewable(overrides: Partial<ReviewableBooking> = {}): ReviewableBooking {
  return {
    id: 'b1',
    arenaId: 'a1',
    arenaName: 'Arena Central',
    courtName: 'Quadra 2',
    dateKey: '2026-04-15',
    startTime: '19:00',
    endTime: '20:30',
    ...overrides,
  };
}

describe('arena-review-copy — constantes', () => {
  it('mantém a mesma recompensa e as mesmas tags do app', () => {
    expect(REVIEW_XP_REWARD).toBe(10);
    expect(REVIEW_HIGHLIGHT_TAGS).toEqual([
      'Quadra impecável', 'Atendimento bom', 'Iluminação', 'Vestiário', 'Pontualidade', 'Estacionamento',
    ]);
    expect(REVIEW_DEFAULT_TAGS).toEqual(['Quadra impecável', 'Atendimento bom']);
  });
});

describe('ratingLabel', () => {
  it('traduz cada nota', () => {
    expect(ratingLabel(1)).toBe('Péssimo');
    expect(ratingLabel(2)).toBe('Ruim');
    expect(ratingLabel(3)).toBe('Regular');
    expect(ratingLabel(4)).toBe('Bom');
    expect(ratingLabel(5)).toBe('Excelente');
  });

  it('devolve vazio fora da faixa', () => {
    expect(ratingLabel(0)).toBe('');
    expect(ratingLabel(9)).toBe('');
  });
});

describe('composeReviewComment', () => {
  it('devolve null sem tag e sem texto', () => {
    expect(composeReviewComment([], '   ')).toBeNull();
  });

  it('lista as tags em ordem alfabética', () => {
    expect(composeReviewComment(['Vestiário', 'Atendimento bom'], '')).toBe('Destaques: Atendimento bom, Vestiário');
  });

  it('devolve só o texto quando não há tag', () => {
    expect(composeReviewComment([], '  Quadra nova, muito boa ')).toBe('Quadra nova, muito boa');
  });

  it('junta destaques e texto em linhas separadas', () => {
    expect(composeReviewComment(['Iluminação'], 'Voltarei')).toBe('Destaques: Iluminação\nVoltarei');
  });
});

describe('reviewSessionSubtitle', () => {
  it('usa HOJE para a reserva do próprio dia', () => {
    expect(reviewSessionSubtitle(reviewable(), new Date(2026, 3, 15, 22, 0))).toBe('HOJE · 19:00-20:30 · QUADRA 2');
  });

  it('usa ONTEM para a véspera', () => {
    expect(reviewSessionSubtitle(reviewable(), new Date(2026, 3, 16, 9, 0))).toBe('ONTEM · 19:00-20:30 · QUADRA 2');
  });

  it('usa dd/MM para datas mais antigas', () => {
    expect(reviewSessionSubtitle(reviewable(), new Date(2026, 3, 20, 9, 0))).toBe('15/04 · 19:00-20:30 · QUADRA 2');
  });

  it('omite o dia quando a data é inutilizável e cai em QUADRA sem nome', () => {
    const sem = reviewable({ dateKey: '', courtName: '  ' });
    expect(reviewSessionSubtitle(sem, new Date(2026, 3, 20, 9, 0))).toBe('19:00-20:30 · QUADRA');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/arena-review-copy.spec.ts'
```

Esperado: FAIL — `Cannot find module './arena-review-copy'`.

- [ ] **Step 3: Escrever a implementação**

Crie `frontend/projects/athlete/src/app/agenda/review/arena-review-copy.ts`:

```ts
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
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/arena-review-copy.spec.ts'
```

Esperado: PASS, 11 specs.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/agenda/review/arena-review-copy.ts frontend/projects/athlete/src/app/agenda/review/arena-review-copy.spec.ts
git commit -m "$(cat <<'EOF'
feat(athlete-web): copy e formatadores da avaliacao de arena

Tags, labels de nota e composicao do comentario iguais ao rating_dialog.dart,
extraidos do componente pra terem teste proprio.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Repositório de avaliações

**Files:**
- Create: `frontend/projects/athlete/src/app/data/arena-reviews-repository.ts`
- Test: `frontend/projects/athlete/src/app/data/arena-reviews-repository.spec.ts`

**Interfaces:**
- Consumes: `bookingEndIsUnknown`, `bookingIsReviewable` de `./pending-arena-review`.
- Produces:
  - `class ArenaReviewError extends Error`
  - `interface SubmitArenaReviewInput { arenaId, bookingId, userId: string; rating: number; comment: string | null }`
  - `validateBookingForReview(input: { arenaId: string; userId: string }, bookingData: Record<string, unknown>, now: Date): string | null`
  - `submitArenaReview(db: Firestore, input: SubmitArenaReviewInput, now?: Date): Promise<void>`
  - `fetchReviewedBookingIds(db: Firestore, userId: string, bookingIds: readonly string[]): Promise<Set<string>>`

Só a validação pura é testada — mesmo padrão de `arena-bookings-repository.spec.ts`, que testa `bookingFromSnapshot` e não as chamadas de rede.

- [ ] **Step 1: Escrever o teste que falha**

Crie `frontend/projects/athlete/src/app/data/arena-reviews-repository.spec.ts`:

```ts
import { REVIEW_CANCELED_MESSAGE, REVIEW_NOT_COMPLETED_MESSAGE, validateBookingForReview } from './arena-reviews-repository';

const OWNER = { arenaId: 'a1', userId: 'u1' };

function bookingData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    arenaId: 'a1',
    athleteId: 'u1',
    status: 'confirmed',
    date: '2026-04-15',
    startTime: '19:00',
    endTime: '20:30',
    ...overrides,
  };
}

describe('validateBookingForReview', () => {
  const afterEnd = new Date(2026, 3, 15, 21, 0);

  it('libera a reserva concluída do próprio atleta', () => {
    expect(validateBookingForReview(OWNER, bookingData(), afterEnd)).toBeNull();
  });

  it('recusa reserva de outra arena', () => {
    expect(validateBookingForReview(OWNER, bookingData({ arenaId: 'outra' }), afterEnd)).toBe(REVIEW_NOT_COMPLETED_MESSAGE);
  });

  it('recusa reserva de outro atleta', () => {
    expect(validateBookingForReview(OWNER, bookingData({ athleteId: 'u2' }), afterEnd)).toBe(REVIEW_NOT_COMPLETED_MESSAGE);
  });

  it('recusa reserva cancelada', () => {
    expect(validateBookingForReview(OWNER, bookingData({ status: 'cancelled' }), afterEnd)).toBe(REVIEW_CANCELED_MESSAGE);
  });

  it('recusa reserva que ainda não terminou', () => {
    expect(validateBookingForReview(OWNER, bookingData(), new Date(2026, 3, 15, 19, 30))).toBe(REVIEW_NOT_COMPLETED_MESSAGE);
  });

  it('libera por status explícito antes do horário', () => {
    expect(validateBookingForReview(OWNER, bookingData({ status: 'completed' }), new Date(2026, 3, 15, 19, 30))).toBeNull();
  });

  it('reconhece os nomes de campo legados', () => {
    const legado = {
      idArena: 'a1',
      bookingAthleteId: 'u1',
      status: 'confirmed',
      data: '2026-04-15',
      horaInicio: '19:00',
      horaFim: '20:30',
    };
    expect(validateBookingForReview(OWNER, legado, afterEnd)).toBeNull();
  });

  it('libera quando a data do doc é inutilizável — confia no gate anterior, como o app', () => {
    const semData = bookingData({ date: '', startTime: '', endTime: '' });
    expect(validateBookingForReview(OWNER, semData, afterEnd)).toBeNull();
  });

  it('libera quando o doc não traz arena nem dono (nada a contradizer)', () => {
    const anonimo = { status: 'confirmed', date: '2026-04-15', startTime: '19:00', endTime: '20:30' };
    expect(validateBookingForReview(OWNER, anonimo, afterEnd)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/arena-reviews-repository.spec.ts'
```

Esperado: FAIL — `Cannot find module './arena-reviews-repository'`.

- [ ] **Step 3: Escrever a implementação**

Crie `frontend/projects/athlete/src/app/data/arena-reviews-repository.ts`:

```ts
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
  type Firestore,
} from 'firebase/firestore';

import { bookingEndIsUnknown, bookingIsReviewable } from './pending-arena-review';

/** Avaliação de arena por reserva concluída — espelha `ArenaReviewService` (Dart).
 *  Escreve em `arena_reviews`, coleção top-level: um doc por reserva. As rules já permitem
 *  o create do próprio atleta (firestore.rules:1464) e o XP cai por trigger, então nada de
 *  backend muda por causa do portal. */

const ARENA_REVIEWS = 'arena_reviews';
const ARENA_BOOKINGS = 'arenaBookings';

export const REVIEW_NOT_COMPLETED_MESSAGE = 'Avaliação permitida apenas após a reserva concluída.';
export const REVIEW_CANCELED_MESSAGE = 'Avaliação não permitida para reserva cancelada.';
export const REVIEW_ALREADY_SENT_MESSAGE = 'Esta reserva já foi avaliada.';

/** Erro cuja `message` já está pronta pra tela. Qualquer outro erro (rede, rules) vira
 *  mensagem genérica no diálogo — não vaza texto técnico em inglês pro atleta. */
export class ArenaReviewError extends Error {}

export interface SubmitArenaReviewInput {
  arenaId: string;
  bookingId: string;
  userId: string;
  rating: number;
  comment: string | null;
}

function readString(data: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const raw = data[key];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return '';
}

/** Regras de "pode avaliar" contra o doc bruto da reserva, sem I/O — testável isolada, no
 *  mesmo padrão de `bookingFromSnapshot`. Devolve a mensagem de erro ou null. */
export function validateBookingForReview(
  input: { arenaId: string; userId: string },
  bookingData: Record<string, unknown>,
  now: Date,
): string | null {
  const bookingArenaId = readString(bookingData, ['arenaId', 'arena_id', 'idArena']);
  const bookingUserId = readString(bookingData, ['athleteId', 'bookingAthleteId', 'userId', 'user_id']);
  if (bookingArenaId && bookingArenaId !== input.arenaId) return REVIEW_NOT_COMPLETED_MESSAGE;
  if (bookingUserId && bookingUserId !== input.userId) return REVIEW_NOT_COMPLETED_MESSAGE;

  const status = readString(bookingData, ['status']).toLowerCase();
  if (status === 'canceled' || status === 'cancelled') return REVIEW_CANCELED_MESSAGE;

  const fields = {
    status,
    dateKey: readString(bookingData, ['date', 'bookingDate', 'data']).slice(0, 10),
    startTime: readString(bookingData, ['startTime', 'start', 'horaInicio']).slice(0, 5),
    endTime: readString(bookingData, ['endTime', 'end', 'horaFim']).slice(0, 5),
  };

  // Doc sem data utilizável passa: a checagem anterior já decidiu que a reserva acabou, e
  // travar aqui bloquearia avaliação legítima de reserva com doc malformado. Mesma escolha
  // do Dart (`isCompleted = ... || endAt == null`).
  if (!bookingIsReviewable(fields, now) && !bookingEndIsUnknown(fields)) return REVIEW_NOT_COMPLETED_MESSAGE;
  return null;
}

export async function submitArenaReview(
  db: Firestore,
  input: SubmitArenaReviewInput,
  now = new Date(),
): Promise<void> {
  const arenaId = input.arenaId.trim();
  const bookingId = input.bookingId.trim();
  const userId = input.userId.trim();

  if (!arenaId || !bookingId || !userId) throw new ArenaReviewError('Dados inválidos para avaliação.');
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new ArenaReviewError('A nota deve estar entre 1 e 5.');
  }

  const existing = await getDocs(
    query(collection(db, ARENA_REVIEWS), where('bookingId', '==', bookingId), limit(1)),
  );
  if (!existing.empty) throw new ArenaReviewError(REVIEW_ALREADY_SENT_MESSAGE);

  const bookingSnap = await getDoc(doc(db, ARENA_BOOKINGS, bookingId));
  if (!bookingSnap.exists()) throw new ArenaReviewError('Reserva não encontrada para avaliação.');

  const problem = validateBookingForReview(
    { arenaId, userId },
    bookingSnap.data() as Record<string, unknown>,
    now,
  );
  if (problem) throw new ArenaReviewError(problem);

  const comment = input.comment?.trim() ?? '';
  await addDoc(collection(db, ARENA_REVIEWS), {
    arenaId,
    userId,
    bookingId,
    rating: input.rating,
    comment: comment.length > 0 ? comment : null,
    likesCount: 0,
    reported: false,
    createdAt: serverTimestamp(),
  });
}

/** Quais das reservas informadas já foram avaliadas por este atleta. Blocos de 10 por causa
 *  do limite do `in` — mesma query que o app já roda em produção, sem índice novo. */
export async function fetchReviewedBookingIds(
  db: Firestore,
  userId: string,
  bookingIds: readonly string[],
): Promise<Set<string>> {
  const uid = userId.trim();
  const ids = [...new Set(bookingIds.map((id) => id.trim()).filter((id) => id.length > 0))];
  const reviewed = new Set<string>();
  if (!uid || ids.length === 0) return reviewed;

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

  const snapshots = await Promise.all(
    chunks.map((chunk) =>
      getDocs(query(collection(db, ARENA_REVIEWS), where('userId', '==', uid), where('bookingId', 'in', chunk))),
    ),
  );

  for (const snap of snapshots) {
    for (const d of snap.docs) {
      const bid = d.get('bookingId');
      if (typeof bid === 'string' && bid.trim()) reviewed.add(bid.trim());
    }
  }
  return reviewed;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/arena-reviews-repository.spec.ts'
```

Esperado: PASS, 9 specs.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/data/arena-reviews-repository.ts frontend/projects/athlete/src/app/data/arena-reviews-repository.spec.ts
git commit -m "$(cat <<'EOF'
feat(athlete-web): escrita de avaliacao de arena em arena_reviews

Espelha ArenaReviewService (Dart): mesmas validacoes, mesmos campos, mesmos
nomes legados de reserva. Validacao extraida como funcao pura pra ter teste
sem emulador, no padrao de arena-bookings-repository.spec.ts.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Store da avaliação pendente

**Files:**
- Create: `frontend/projects/athlete/src/app/data/pending-arena-review.service.ts`

**Interfaces:**
- Consumes: `AuthService` de `../auth/auth.service` (expõe `user()` com `uid`); `fetchMyBookings` e `MyBooking` de `./my-bookings-repository`; `bookingIsReviewable`, `pickPendingReview` de `./pending-arena-review`; `fetchReviewedBookingIds` de `./arena-reviews-repository`; `environment` de `../../environments/environment`.
- Produces: `class PendingArenaReviewService` com `pending: Signal<MyBooking | null>`, `refresh(): Promise<void>`, `markReviewed(bookingId: string): void`, `dismiss(bookingId: string): void`, `isReviewed(bookingId: string): boolean`.

Sem teste unitário: a classe é I/O + composição de signals já testados nas tasks 1 e 3. A verificação é o build e o QA manual da Task 8.

- [ ] **Step 1: Escrever a implementação**

Crie `frontend/projects/athlete/src/app/data/pending-arena-review.service.ts`:

```ts
import { Injectable, computed, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { fetchReviewedBookingIds } from './arena-reviews-repository';
import { fetchMyBookings, type MyBooking } from './my-bookings-repository';
import { bookingIsReviewable, pickPendingReview } from './pending-arena-review';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

/** Estado da avaliação pendente, compartilhado pelas três telas que oferecem avaliar
 *  (Agenda, detalhe da reserva e histórico). Um store só porque "já avaliei" precisa sumir
 *  das três na hora, sem reload e sem cada tela buscar por conta própria. */
@Injectable({ providedIn: 'root' })
export class PendingArenaReviewService {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  private readonly bookings = signal<readonly MyBooking[]>([]);
  private readonly reviewed = signal<ReadonlySet<string>>(new Set<string>());
  /** Dispensadas nesta sessão — equivale a `_promptedReviewBookingIds` (Dart). Não persiste:
   *  recarregar a página reabre o convite, igual a reabrir o app. */
  private readonly dismissed = signal<ReadonlySet<string>>(new Set<string>());

  /** Candidata ao convite automático, já descontando o que foi dispensado nesta sessão. */
  readonly pending = computed<MyBooking | null>(() => {
    const candidate = pickPendingReview(this.bookings(), this.reviewed(), new Date());
    if (candidate == null) return null;
    return this.dismissed().has(candidate.id) ? null : candidate;
  });

  async refresh(): Promise<void> {
    const uid = this.auth.user()?.uid ?? null;
    const db = this.firestore;
    if (!uid || !db) {
      this.bookings.set([]);
      this.reviewed.set(new Set<string>());
      return;
    }

    try {
      const bookings = await fetchMyBookings(db, uid);
      const now = new Date();
      // Só as concluídas interessam: evita levar todo o histórico de reservas ao `in` de 10.
      const candidates = bookings.filter((b) => bookingIsReviewable(b, now));
      const reviewed =
        candidates.length > 0
          ? await fetchReviewedBookingIds(db, uid, candidates.map((b) => b.id))
          : new Set<string>();
      this.bookings.set(bookings);
      this.reviewed.set(reviewed);
    } catch {
      // Avaliação é enriquecimento: falhar aqui não pode derrubar a tela que chamou.
      this.bookings.set([]);
      this.reviewed.set(new Set<string>());
    }
  }

  isReviewed(bookingId: string): boolean {
    return this.reviewed().has(bookingId);
  }

  markReviewed(bookingId: string): void {
    this.reviewed.update((current) => new Set(current).add(bookingId));
  }

  dismiss(bookingId: string): void {
    this.dismissed.update((current) => new Set(current).add(bookingId));
  }
}
```

- [ ] **Step 2: Verificar que compila**

```bash
cd frontend && npx ng build athlete --configuration production
```

Esperado: bundle gerado sem erro de TypeScript.

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/athlete/src/app/data/pending-arena-review.service.ts
git commit -m "$(cat <<'EOF'
feat(athlete-web): store da avaliacao pendente de arena

Signals compartilhados pelas tres telas que oferecem avaliar, pra "ja avaliei"
sumir das tres sem reload e sem tres buscas divergentes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Modal de avaliação

**Files:**
- Create: `frontend/projects/athlete/src/app/agenda/review/arena-review-dialog.component.ts`
- Create: `frontend/projects/athlete/src/app/agenda/review/arena-review-dialog.component.html`
- Create: `frontend/projects/athlete/src/app/agenda/review/arena-review-dialog.component.scss`

**Interfaces:**
- Consumes: `ReviewableBooking` de `../../data/pending-arena-review`; `ArenaReviewError`, `submitArenaReview` de `../../data/arena-reviews-repository`; tudo de `./arena-review-copy`; `NxSpinnerComponent` de `../../shared/loading/nx-spinner.component`; `AuthService`.
- Produces: `class ArenaReviewDialogComponent`, selector `app-arena-review-dialog`, input `booking: ReviewableBooking` (required), outputs `submitted: string` (o `bookingId` avaliado) e `dismissed: void`.

Quem usa monta com `@if`, no padrão de `app-invite-partner-dialog`.

- [ ] **Step 1: Escrever o componente**

Crie `frontend/projects/athlete/src/app/agenda/review/arena-review-dialog.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { ArenaReviewError, submitArenaReview } from '../../data/arena-reviews-repository';
import type { ReviewableBooking } from '../../data/pending-arena-review';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import {
  REVIEW_DEFAULT_TAGS,
  REVIEW_HIGHLIGHT_TAGS,
  REVIEW_XP_REWARD,
  composeReviewComment,
  ratingLabel,
  reviewSessionSubtitle,
} from './arena-review-copy';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

/** "Como foi o jogo na {arena}?" — espelha `rating_dialog.dart`. Duas diferenças de
 *  plataforma: Esc e clique no backdrop valem "Agora não" (o app usa `barrierDismissible:
 *  false`, hostil no desktop), e o erro fica inline em vez de fechar com snackbar, pra não
 *  jogar fora o comentário digitado. */
@Component({
  selector: 'app-arena-review-dialog',
  imports: [NxSpinnerComponent],
  templateUrl: './arena-review-dialog.component.html',
  styleUrl: './arena-review-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.escape)': 'dismiss()',
  },
})
export class ArenaReviewDialogComponent {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  readonly booking = input.required<ReviewableBooking>();
  readonly submitted = output<string>();
  readonly dismissed = output<void>();

  protected readonly xpReward = REVIEW_XP_REWARD;
  protected readonly highlightTags = REVIEW_HIGHLIGHT_TAGS;
  protected readonly stars: readonly number[] = [1, 2, 3, 4, 5];

  protected readonly rating = signal(5);
  protected readonly selectedTags = signal<ReadonlySet<string>>(new Set(REVIEW_DEFAULT_TAGS));
  protected readonly commentOpen = signal(false);
  protected readonly comment = signal('');
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);

  // `ratingText`, não `ratingLabel`: um campo com o mesmo nome da função importada compila,
  // mas confunde quem lê.
  protected readonly ratingText = computed(() => ratingLabel(this.rating()));
  protected readonly sessionSubtitle = computed(() => reviewSessionSubtitle(this.booking(), new Date()));
  protected readonly arenaName = computed(() => {
    const name = this.booking().arenaName.trim();
    return name.length > 0 ? name : 'sua arena';
  });

  protected isTagSelected(tag: string): boolean {
    return this.selectedTags().has(tag);
  }

  protected setRating(value: number): void {
    if (this.sending()) return;
    this.rating.set(value);
  }

  /** Setas navegam o radiogroup e levam o foco junto, como manda o padrão ARIA. */
  protected onStarKeydown(event: KeyboardEvent, star: number): void {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = Math.min(5, Math.max(1, star + delta));
    this.setRating(next);
    const group = (event.target as HTMLElement).closest('.arv-stars');
    group?.querySelectorAll<HTMLButtonElement>('.arv-star')[next - 1]?.focus();
  }

  protected toggleTag(tag: string): void {
    if (this.sending()) return;
    this.selectedTags.update((current) => {
      const next = new Set(current);
      if (!next.delete(tag)) next.add(tag);
      return next;
    });
  }

  protected toggleCommentField(): void {
    if (this.sending()) return;
    this.commentOpen.update((open) => !open);
  }

  protected onCommentInput(value: string): void {
    this.comment.set(value);
  }

  protected dismiss(): void {
    if (this.sending()) return;
    this.dismissed.emit();
  }

  protected async submit(): Promise<void> {
    const uid = this.auth.user()?.uid ?? '';
    const db = this.firestore;
    const booking = this.booking();
    if (this.sending() || this.rating() < 1) return;
    if (!uid || !db) {
      this.error.set('Não foi possível enviar sua avaliação. Tente de novo.');
      return;
    }

    this.sending.set(true);
    this.error.set(null);
    try {
      await submitArenaReview(db, {
        arenaId: booking.arenaId,
        bookingId: booking.id,
        userId: uid,
        rating: this.rating(),
        comment: composeReviewComment([...this.selectedTags()], this.comment()),
      });
      this.submitted.emit(booking.id);
    } catch (err) {
      // Só mensagem de `ArenaReviewError` é apresentável; rules e rede falam inglês técnico.
      this.error.set(
        err instanceof ArenaReviewError ? err.message : 'Não foi possível enviar sua avaliação. Tente de novo.',
      );
    } finally {
      this.sending.set(false);
    }
  }
}
```

- [ ] **Step 2: Escrever o template**

Crie `frontend/projects/athlete/src/app/agenda/review/arena-review-dialog.component.html`:

```html
<div class="arv-backdrop" (click)="dismiss()" aria-hidden="true"></div>

<div class="arv-dialog" role="dialog" aria-modal="true" aria-labelledby="arv-title">
  <div class="arv-eyebrow-row">
    <span class="arv-eyebrow">RESERVA · CONCLUÍDA</span>
    <span class="arv-xp-badge">+{{ xpReward }} XP</span>
  </div>

  <h2 id="arv-title" class="arv-title">
    Como foi o jogo na <span class="arv-title-arena">{{ arenaName() }}</span>?
  </h2>
  <p class="arv-subtitle">{{ sessionSubtitle() }}</p>

  @if (ratingText(); as label) {
    <p class="arv-rating-label">{{ label }}</p>
  }

  <div class="arv-stars" role="radiogroup" aria-label="Nota da experiência">
    @for (star of stars; track star) {
      <button
        type="button"
        class="arv-star"
        [class.arv-star--filled]="rating() >= star"
        role="radio"
        [attr.aria-checked]="rating() === star"
        [attr.aria-label]="star + ' de 5'"
        [attr.tabindex]="rating() === star ? 0 : -1"
        [disabled]="sending()"
        (click)="setRating(star)"
        (keydown)="onStarKeydown($event, star)"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" [attr.fill]="rating() >= star ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" />
        </svg>
      </button>
    }
  </div>

  <p class="arv-section-label">O QUE DESTACOU? OPCIONAL</p>
  <div class="arv-chips">
    @for (tag of highlightTags; track tag) {
      <button
        type="button"
        class="arv-chip"
        [class.arv-chip--on]="isTagSelected(tag)"
        [attr.aria-pressed]="isTagSelected(tag)"
        [disabled]="sending()"
        (click)="toggleTag(tag)"
      >
        {{ isTagSelected(tag) ? '✓ ' + tag : tag }}
      </button>
    }
    <button
      type="button"
      class="arv-chip"
      [class.arv-chip--on]="commentOpen()"
      [attr.aria-pressed]="commentOpen()"
      [disabled]="sending()"
      (click)="toggleCommentField()"
    >
      + comentário
    </button>
  </div>

  @if (commentOpen()) {
    <textarea
      class="arv-comment"
      rows="3"
      maxlength="500"
      placeholder="Escreva um comentário…"
      aria-label="Comentário sobre a experiência"
      [value]="comment()"
      [disabled]="sending()"
      (input)="onCommentInput($any($event.target).value)"
    ></textarea>
  }

  @if (error(); as message) {
    <p class="arv-error" role="alert">{{ message }}</p>
  }

  <div class="arv-actions">
    <button type="button" class="arv-btn-ghost" [disabled]="sending()" (click)="dismiss()">Agora não</button>
    <button type="button" class="arv-btn-primary" [disabled]="sending()" (click)="submit()">
      @if (sending()) {
        <app-nx-spinner [size]="16" tone="dark" />
      }
      {{ sending() ? 'Enviando…' : 'Enviar e ganhar +' + xpReward + ' XP' }}
    </button>
  </div>
</div>
```

- [ ] **Step 3: Escrever os estilos**

Crie `frontend/projects/athlete/src/app/agenda/review/arena-review-dialog.component.scss`:

```scss
:host {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 16px;
}

.arv-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(8px);
}

.arv-dialog {
  position: relative;
  width: min(460px, 100%);
  max-height: calc(100dvh - 32px);
  overflow: auto;
  background: var(--nx-surface-0);
  border: 1px solid var(--nx-line);
  border-radius: var(--nx-r-5);
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;

  @media (max-width: 640px) {
    padding: 18px 16px;
  }
}

.arv-eyebrow-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.arv-eyebrow {
  font-family: var(--nx-font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--nx-orange-500);
}

.arv-xp-badge {
  font-family: var(--nx-font-mono);
  font-size: 10px;
  font-weight: 700;
  color: var(--nx-orange-500);
  background: var(--nx-surface-1);
  border: 1px solid rgba(255, 106, 26, 0.4);
  border-radius: var(--nx-r-1);
  padding: 4px 8px;
}

.arv-title {
  margin: 4px 0 0;
  font-family: var(--nx-font-display);
  font-size: 22px;
  font-weight: 900;
  line-height: 1.2;
  letter-spacing: -0.01em;
  color: var(--nx-text);
}

.arv-title-arena {
  color: var(--nx-orange-500);
}

.arv-subtitle {
  margin: 0;
  font-family: var(--nx-font-mono);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.03em;
  color: var(--nx-text-mute);
}

.arv-rating-label {
  margin: 8px 0 0;
  text-align: center;
  font-size: 15px;
  font-weight: 800;
  color: var(--nx-win);
}

.arv-stars {
  display: flex;
  justify-content: center;
  gap: 6px;
}

.arv-star {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  background: var(--nx-surface-1);
  border: 1px solid transparent;
  border-radius: var(--nx-r-2);
  color: var(--nx-text-mute);
  cursor: pointer;
  transition:
    color var(--nx-d-fast),
    border-color var(--nx-d-fast);

  &:disabled {
    cursor: default;
  }
}

.arv-star--filled {
  color: var(--nx-orange-500);
  border-color: rgba(255, 106, 26, 0.55);
}

.arv-section-label {
  margin: 8px 0 0;
  font-family: var(--nx-font-mono);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--nx-text-mute);
}

.arv-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.arv-chip {
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 700;
  background: transparent;
  color: var(--nx-text-mute);
  border: 1px solid color-mix(in srgb, var(--nx-text-mute) 35%, transparent);
  border-radius: var(--nx-r-pill);
  cursor: pointer;
  transition:
    color var(--nx-d-fast),
    border-color var(--nx-d-fast),
    background var(--nx-d-fast);

  &:disabled {
    cursor: default;
  }
}

.arv-chip--on {
  color: var(--nx-orange-500);
  border-color: var(--nx-orange-500);
  background: rgba(255, 106, 26, 0.12);
}

.arv-comment {
  width: 100%;
  resize: vertical;
  padding: 12px;
  font: inherit;
  font-size: 14px;
  color: var(--nx-text);
  background: var(--nx-surface-1);
  border: 1px solid var(--nx-line);
  border-radius: var(--nx-r-3);

  &::placeholder {
    color: var(--nx-text-mute);
  }

  &:focus-visible {
    outline: none;
    border-color: rgba(255, 106, 26, 0.6);
  }
}

.arv-error {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--nx-live);
}

.arv-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.arv-btn-ghost {
  flex: none;
  padding: 12px 14px;
  font-size: 14px;
  font-weight: 700;
  background: transparent;
  border: none;
  border-radius: var(--nx-r-2);
  color: var(--nx-text-mute);
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
}

.arv-btn-primary {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 14px;
  font-size: 14px;
  font-weight: 900;
  color: #0a0a0a;
  background: var(--nx-orange-500);
  border: none;
  border-radius: var(--nx-r-2);
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.75;
  }
}
```

- [ ] **Step 4: Verificar que compila**

```bash
cd frontend && npx ng build athlete --configuration production
```

Esperado: bundle gerado sem erro.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/agenda/review/
git commit -m "$(cat <<'EOF'
feat(athlete-web): modal de avaliacao da experiencia na arena

Paridade visual e de copy com rating_dialog.dart. Esc e backdrop valem
"Agora nao" e o erro fica inline em vez de fechar com snackbar, pra nao
jogar fora o comentario ja digitado.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Agenda — convite automático e card "Precisa de você"

**Files:**
- Modify: `frontend/projects/athlete/src/app/agenda/athlete-agenda.component.ts`
- Modify: `frontend/projects/athlete/src/app/agenda/athlete-agenda.component.html`
- Modify: `frontend/projects/athlete/src/app/agenda/athlete-agenda.component.scss`

**Interfaces:**
- Consumes: `PendingArenaReviewService` (Task 4); `ArenaReviewDialogComponent` (Task 5); `reviewSessionSubtitle` de `./review/arena-review-copy`.
- Produces: nada para tasks seguintes.

- [ ] **Step 1: Ligar o store e o modal no componente**

Em `athlete-agenda.component.ts`, adicione aos imports do arquivo:

```ts
import { PendingArenaReviewService } from '../data/pending-arena-review.service';
import { ArenaReviewDialogComponent } from './review/arena-review-dialog.component';
import { reviewSessionSubtitle } from './review/arena-review-copy';
import type { ReviewableBooking } from '../data/pending-arena-review';
```

Adicione `ArenaReviewDialogComponent` ao array `imports` do `@Component`.

Dentro da classe, logo após `private readonly firestore = createFirestore();`, adicione:

```ts
  private readonly reviewStore = inject(PendingArenaReviewService);

  /** Reserva sendo avaliada no modal. `null` = modal fechado. */
  protected readonly reviewingBooking = signal<ReviewableBooking | null>(null);

  /** Convite pendente exibido no card "Precisa de você" — a mesma candidata que abre o
   *  modal, uma de cada vez (o app também pergunta uma por vez). */
  protected readonly pendingReview = this.reviewStore.pending;

  protected readonly pendingReviewLine = computed(() => {
    const booking = this.pendingReview();
    return booking ? reviewSessionSubtitle(booking, new Date()) : '';
  });
```

Ainda na classe, troque o corpo do `pendingActionCount` para contar também a avaliação:

```ts
  protected readonly pendingActionCount = computed(
    () =>
      this.pendingRequests().length +
      this.events().filter((e) => e.statusTone === 'warning').length +
      (this.pendingReview() ? 1 : 0),
  );
```

E adicione os métodos, junto dos outros `protected`:

```ts
  protected openReviewDialog(): void {
    const booking = this.pendingReview();
    if (booking) this.reviewingBooking.set(booking);
  }

  protected onReviewSubmitted(bookingId: string): void {
    this.reviewStore.markReviewed(bookingId);
    this.reviewingBooking.set(null);
    this.showNotice('Obrigado! +10 XP no seu progresso.');
  }

  protected onReviewDismissed(): void {
    const booking = this.reviewingBooking();
    if (booking) this.reviewStore.dismiss(booking.id);
    this.reviewingBooking.set(null);
  }
```

`showNotice` já existe nesta classe (`athlete-agenda.component.ts:708`) e alimenta o
`eventNotice` que o template renderiza — não crie outro helper.

No `constructor`, dentro do `effect` que já existe, some a carga do store e o convite automático:

```ts
    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      void this.loadAgenda(uid);
      void this.reviewStore.refresh().then(() => {
        const booking = this.reviewStore.pending();
        // Uma vez por sessão por reserva: `dismiss()` tira a candidata de `pending`.
        if (booking && this.reviewingBooking() == null) this.reviewingBooking.set(booking);
      });
    });
```

- [ ] **Step 2: Montar o modal e o item no template**

Em `athlete-agenda.component.html`, dentro do card `#ag-pending-card`, logo depois de `</div>` que fecha `.ag-card-head`, insira o bloco de avaliação **antes** do `@if (pendingRequests().length === 0)`:

```html
          @if (pendingReview(); as review) {
            <div class="ag-pending-item ag-pending-item--review">
              <div class="ag-pending-row">
                <span class="ag-pending-avatar ag-pending-avatar--review" aria-hidden="true">★</span>
                <div class="ag-pending-copy">
                  <p class="ag-pending-title">Avaliar experiência</p>
                  <p class="ag-pending-subtitle">{{ review.arenaName }}</p>
                </div>
              </div>
              <p class="ag-pending-schedule">{{ pendingReviewLine() }}</p>
              <div class="ag-pending-actions">
                <button type="button" class="ag-btn-primary ag-btn-sm" (click)="openReviewDialog()">Avaliar</button>
              </div>
            </div>
          }
```

O `@if (pendingRequests().length === 0) { <p class="ag-empty-inline">Tudo em dia por aqui.</p> }` que vem em seguida precisa passar a considerar a avaliação — troque a condição por:

```html
          @if (pendingRequests().length === 0 && !pendingReview()) {
```

No fim do arquivo, imediatamente antes de `</app-at-panel-shell>`, monte o modal:

```html
  @if (reviewingBooking(); as reviewBooking) {
    <app-arena-review-dialog
      [booking]="reviewBooking"
      (submitted)="onReviewSubmitted($event)"
      (dismissed)="onReviewDismissed()"
    />
  }
```

- [ ] **Step 3: Estilizar o item novo**

Em `athlete-agenda.component.scss`, ao lado das regras `.ag-pending-*` já existentes, adicione:

```scss
.ag-pending-item--review .ag-pending-avatar--review {
  color: var(--nx-orange-500);
  font-size: 16px;
}
```

- [ ] **Step 4: Verificar build e comportamento**

```bash
cd frontend && npx ng build athlete --configuration production
```

Esperado: bundle gerado sem erro.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/agenda/athlete-agenda.component.ts frontend/projects/athlete/src/app/agenda/athlete-agenda.component.html frontend/projects/athlete/src/app/agenda/athlete-agenda.component.scss
git commit -m "$(cat <<'EOF'
feat(athlete-web): convite de avaliacao na Agenda

Modal abre uma vez por sessao por reserva, e o card "Precisa de voce" ganha
um item proprio — separado dos convites, que tem aceitar/recusar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Detalhe da reserva — botão "Avaliar experiência"

**Files:**
- Modify: `frontend/projects/athlete/src/app/agenda/booking-detail/athlete-booking-detail.component.ts`
- Modify: `frontend/projects/athlete/src/app/agenda/booking-detail/athlete-booking-detail.component.html:152-190` (card "Gerenciar")
- Modify: `frontend/projects/athlete/src/app/agenda/booking-detail/athlete-booking-detail.component.scss`

**Interfaces:**
- Consumes: `PendingArenaReviewService`, `ArenaReviewDialogComponent`, `bookingIsReviewable` de `../../data/pending-arena-review`.
- Produces: nada para tasks seguintes.

`ArenaBookingDoc` já tem os sete campos de `ReviewableBooking` — passa direto para o modal, sem conversão.

- [ ] **Step 1: Ligar o store no componente**

Em `athlete-booking-detail.component.ts`, adicione aos imports do arquivo:

```ts
import { PendingArenaReviewService } from '../../data/pending-arena-review.service';
import { bookingIsReviewable } from '../../data/pending-arena-review';
import { ArenaReviewDialogComponent } from '../review/arena-review-dialog.component';
```

Adicione `ArenaReviewDialogComponent` ao array `imports` do `@Component`.

Na classe, após `private readonly firestore = createFirestore();`:

```ts
  private readonly reviewStore = inject(PendingArenaReviewService);

  protected readonly reviewDialogOpen = signal(false);
  /** Marcado no envio desta sessão — evita depender de um `refresh()` do store pra trocar o
   *  botão por "Avaliação enviada". */
  protected readonly reviewSentHere = signal(false);

  protected readonly canReview = computed(() => {
    const b = this.booking();
    if (!b || this.reviewSentHere()) return false;
    if (this.reviewStore.isReviewed(b.id)) return false;
    return bookingIsReviewable(b, this.now());
  });

  protected readonly reviewAlreadySent = computed(() => {
    const b = this.booking();
    if (!b) return false;
    return this.reviewSentHere() || this.reviewStore.isReviewed(b.id);
  });
```

E os métodos:

```ts
  protected openReviewDialog(): void {
    this.reviewDialogOpen.set(true);
  }

  protected onReviewSubmitted(bookingId: string): void {
    this.reviewStore.markReviewed(bookingId);
    this.reviewSentHere.set(true);
    this.reviewDialogOpen.set(false);
    this.showNotice('Obrigado! +10 XP no seu progresso.');
  }

  protected onReviewDismissed(): void {
    this.reviewDialogOpen.set(false);
  }
```

No fim do método `load()`, depois de `this.arena.set(arena);`, some a carga do store:

```ts
      void this.reviewStore.refresh();
```

- [ ] **Step 2: Adicionar o bloco no template**

Em `athlete-booking-detail.component.html`, dentro do card "Gerenciar", logo depois do `@if (canAddToAgenda()) { ... }` e antes do `@if (isRecurring())`, insira:

```html
            @if (canReview()) {
              <div class="bd-manage-row">
                <div class="bd-manage-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" /></svg>
                </div>
                <span class="bd-manage-label">Avaliar experiência</span>
                <button type="button" class="bd-btn-primary bd-btn-sm" (click)="openReviewDialog()">Avaliar</button>
              </div>
            } @else if (reviewAlreadySent()) {
              <div class="bd-manage-row">
                <div class="bd-manage-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </div>
                <span class="bd-manage-label">Avaliação enviada</span>
              </div>
            }
```

No fim do arquivo, antes de `</app-at-panel-shell>`, monte o modal:

```html
  @if (reviewDialogOpen()) {
    @if (booking(); as reviewBooking) {
      <app-arena-review-dialog
        [booking]="reviewBooking"
        (submitted)="onReviewSubmitted($event)"
        (dismissed)="onReviewDismissed()"
      />
    }
  }
```

- [ ] **Step 3: Verificar build**

```bash
cd frontend && npx ng build athlete --configuration production
```

Esperado: bundle gerado sem erro.

- [ ] **Step 4: Commit**

```bash
git add frontend/projects/athlete/src/app/agenda/booking-detail/
git commit -m "$(cat <<'EOF'
feat(athlete-web): avaliar experiencia no detalhe da reserva

Botao no card "Gerenciar" pra reserva concluida, virando "Avaliacao enviada"
depois do envio. Sem janela de 30 dias aqui: o atleta abriu essa reserva de
proposito.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Histórico — CTA "Avaliar" na linha de aluguel

**Files:**
- Modify: `frontend/projects/athlete/src/app/history/athlete-history.component.ts`
- Modify: `frontend/projects/athlete/src/app/history/athlete-history.component.html:57-81`
- Modify: `frontend/projects/athlete/src/app/history/athlete-history.component.scss:253-296`

**Interfaces:**
- Consumes: `PendingArenaReviewService`, `ArenaReviewDialogComponent`, `bookingIsReviewable`, `ReviewableBooking`.
- Produces: nada.

A linha do histórico hoje é um `<a class="hs-row" [routerLink]>` inteiro. Botão dentro de âncora é HTML inválido, então a linha passa a ficar num wrapper que segura a borda, com a âncora e o botão como irmãos.

- [ ] **Step 1: Levar a reserva até a linha**

Em `athlete-history.component.ts`, adicione aos imports do arquivo:

```ts
import { PendingArenaReviewService } from '../data/pending-arena-review.service';
import { bookingIsReviewable, type ReviewableBooking } from '../data/pending-arena-review';
import { ArenaReviewDialogComponent } from '../agenda/review/arena-review-dialog.component';
```

Adicione `ArenaReviewDialogComponent` ao array `imports` do `@Component`.

Em `HistoryRow`, adicione o campo:

```ts
  /** Reserva por trás da linha — só em `kind: 'aluguel'`, pra oferecer avaliar sem refazer
   *  a busca. Null nas outras linhas. */
  booking: MyBooking | null;
```

O arquivo tem exatamente três construtores de `HistoryRow`. Em `buildRentalRows`
(objeto que começa em `athlete-history.component.ts:283`), adicione `booking: b,`. Nos
outros dois — `buildPaymentRows` (`:305`) e o `rows.push({...})` das partidas (`:340`) —
adicione `booking: null,`. O objeto de `:203` é um `HistoryMonthGroup`, não mexa nele.

Na classe, após o `firestore`:

```ts
  private readonly reviewStore = inject(PendingArenaReviewService);

  protected readonly reviewingBooking = signal<ReviewableBooking | null>(null);

  /** Linha avaliável: é aluguel, já terminou e ainda não foi avaliada. Sem janela de 30
   *  dias — o histórico é consulta deliberada, não cobrança. */
  protected reviewableBookingOf(row: HistoryRow): MyBooking | null {
    const b = row.booking;
    if (!b || this.reviewStore.isReviewed(b.id)) return null;
    return bookingIsReviewable(b, new Date()) ? b : null;
  }

  protected openReviewDialog(booking: MyBooking): void {
    this.reviewingBooking.set(booking);
  }

  protected onReviewSubmitted(bookingId: string): void {
    this.reviewStore.markReviewed(bookingId);
    this.reviewingBooking.set(null);
  }

  protected onReviewDismissed(): void {
    this.reviewingBooking.set(null);
  }
```

No fim do método que carrega o histórico, depois de `this.rows.set(...)`, some:

```ts
      void this.reviewStore.refresh();
```

- [ ] **Step 2: Envolver a linha no template**

Em `athlete-history.component.html`, troque o bloco `@for (row of group.rows; track row.id) { <a class="hs-row" ...>…</a> }` por:

```html
              @for (row of group.rows; track row.id) {
                <div class="hs-row-wrap">
                  <a
                    class="hs-row"
                    [class.hs-row--plain]="!row.kindLabel"
                    [attr.data-kind]="row.kind"
                    [routerLink]="row.link"
                  >
                    <span class="hs-row-date">{{ row.date.getDate().toString().padStart(2, '0') }}/{{ (row.date.getMonth() + 1).toString().padStart(2, '0') }}</span>
                    @if (row.kindLabel) {
                      <span class="hs-row-kind">{{ row.kindLabel }}</span>
                    }
                    <div class="hs-row-copy">
                      <p class="hs-row-title">{{ row.title }}</p>
                      <p class="hs-row-subtitle">{{ row.subtitle }}</p>
                    </div>
                    <span class="hs-row-badge" [attr.data-tone]="row.badgeTone">{{ row.badgeLabel }}</span>
                    @if (row.amountLabel; as amount) {
                      <span class="hs-row-amount">{{ amount }}</span>
                    } @else {
                      <span class="hs-row-amount hs-row-amount--empty">—</span>
                    }
                  </a>
                  @if (reviewableBookingOf(row); as reviewable) {
                    <button type="button" class="hs-row-review" (click)="openReviewDialog(reviewable)">Avaliar</button>
                  }
                </div>
              }
```

No fim do arquivo, antes de `</app-at-panel-shell>`:

```html
  @if (reviewingBooking(); as reviewBooking) {
    <app-arena-review-dialog
      [booking]="reviewBooking"
      (submitted)="onReviewSubmitted($event)"
      (dismissed)="onReviewDismissed()"
    />
  }
```

- [ ] **Step 3: Mover a borda para o wrapper**

Em `athlete-history.component.scss`, adicione a regra do wrapper e do botão, e mova a borda:

```scss
.hs-row-wrap {
  display: flex;
  align-items: stretch;
  border-top: 1px solid var(--nx-line);

  &:first-child {
    border-top: none;
  }
}

.hs-row-review {
  flex: none;
  align-self: center;
  margin-right: 20px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 800;
  color: #0a0a0a;
  background: var(--nx-orange-500);
  border: none;
  border-radius: var(--nx-r-2);
  cursor: pointer;
}
```

E em `.hs-row`, remova `border-top: 1px solid var(--nx-line);` e o bloco `&:first-child { border-top: none; }` (a borda agora é do wrapper), acrescentando `flex: 1 1 auto;` para a âncora ocupar a linha.

- [ ] **Step 4: Verificar build**

```bash
cd frontend && npx ng build athlete --configuration production
```

Esperado: bundle gerado sem erro.

- [ ] **Step 5: Rodar a suíte inteira do athlete**

```bash
cd frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless
```

Esperado: PASS, incluindo os 33 specs novos das tasks 1–3 e os que já existiam.

- [ ] **Step 6: QA manual no navegador**

Suba o dev server e verifique com login real (a sessão "modo dev" some num reload completo — navegue só por cliques SPA, nunca recarregando a URL de uma rota autenticada):

```bash
cd frontend && npx ng serve athlete
```

Confira:
1. Com uma reserva concluída nos últimos 30 dias e não avaliada, `/agenda` abre o modal sozinho.
2. "Agora não" fecha e o item "Avaliar experiência" continua no card "Precisa de você".
3. Enviar grava o doc em `arena_reviews` (confira no console do Firebase: `rating`, `comment` com `Destaques: …`, `likesCount: 0`, `reported: false`).
4. Depois de enviar, o item some do card, o detalhe da reserva mostra "Avaliação enviada" e a linha do histórico perde o botão "Avaliar".
5. Enviar duas vezes a mesma reserva (abrindo em duas abas) mostra "Esta reserva já foi avaliada." em vez de gravar duplicado.

- [ ] **Step 7: Commit**

```bash
git add frontend/projects/athlete/src/app/history/
git commit -m "$(cat <<'EOF'
feat(athlete-web): avaliar arena direto da linha do historico

Linha vira wrapper com ancora + botao irmao: botao dentro de <a> e HTML
invalido. A borda da linha passa pro wrapper.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Verificação final

- `npx ng test athlete --watch=false --browsers=ChromeHeadless` — verde.
- `npx ng build athlete --configuration production` — sem erro.
- QA manual da Task 8, Step 6 — os cinco cenários.

## Fora deste plano

- Deploy das Cloud Functions. `onArenaReviewCreatedAwardXp` e os agregados existem no código e estão exportados, mas o deploy é pendência antiga do projeto. Sem ele, a avaliação grava e chega na arena, mas os +10 XP prometidos no botão não caem — isso já vale para o app hoje, não é regressão desta entrega.
- Apertar as rules de `arena_reviews` para validar o estado da reserva. Mudaria o comportamento do app.
- Editar/excluir avaliação, curtir/denunciar, listar avaliações da arena no portal.
