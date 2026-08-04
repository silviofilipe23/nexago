# Modal da regra de pico no fluxo do atleta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando o atleta clica num horário de pico restrito, abrir um modal que explica a regra e, num clique, aplica a reserva mínima.

**Architecture:** Um helper novo (`minimumChainContaining`) devolve a cadeia contígua real que satisfaz o mínimo contendo o slot clicado — preferindo a que começa nele, caindo para as anteriores. Uma função pura por superfície (`peakPromptFor` no web, `peakPromptForSelection` no Dart) decide se o modal abre e com que conteúdo, mantendo a lógica testável fora do componente. O web reusa `NxBlockingDialogComponent`; o app usa `showDialog`/`AlertDialog`, o padrão já presente na própria `slots_page.dart`.

**Tech Stack:** Angular standalone/signals/OnPush (portal do atleta), TypeScript compartilhado (`@nexago/arena-discovery`), Flutter/Riverpod.

**Spec:** `docs/superpowers/specs/2026-08-04-modal-regra-pico-atleta-design.md`
**Feature base:** `docs/superpowers/specs/2026-08-03-horario-pico-minimo-2h-design.md` (PR #116, já mergeável)

## Global Constraints

- Strings de UI em português, código em inglês. Copy do modal, verbatim:
  - título `Horário concorrido`
  - corpo `{faixa} é o horário mais procurado desta arena. Para a quadra não ficar vaga na hora seguinte, a reserva mínima nesta faixa é de {mínimo}. Sua reserva ficaria das {início} às {fim}, por {preço}.`
  - ação primária `Reservar {início}–{fim}`
  - ação secundária `Escolher outro horário`
- O modal abre **somente** quando a seleção resultante viola o mínimo de pico. Slot liberado (janela de antecedência aberta ou cadeia impossível) e seleção que já cumpre o mínimo **não** abrem.
- NUNCA `Date.parse`/`toISOString` — datas por componentes.
- Nenhuma mudança de regra de negócio no servidor: `functions/` não é tocado neste plano. O predicado do servidor e sua suíte permanecem como estão.
- Angular: standalone sem `standalone: true`, signals, `computed()`, `OnPush`, `inject()`, control flow nativo (`@if`/`@for`), sem `ngClass`/`ngStyle`, sem `any`.
- O auto-bump silencioso de duração no web (`selectStartSlot` chamando `durationSlots.set(minSlots)`) é **removido** — o modal passa a ser quem aplica a duração, com consentimento.
- Commits em português com prefixo convencional, rodapé `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Todos os caminhos são relativos à raiz do worktree.

## Desvio consciente do spec

O spec previa um chip com `rule.label` acima do título. `NxBlockingDialogComponent` não tem slot para isso (o chip dele é o ícone do tone) e `label` é nome de configuração interna da arena ("Pico noturno"), não informação que o atleta precisa. **O label não é exibido em nenhuma das superfícies.** Nada mais do spec muda.

---

### Task 1: Helper `minimumChainContaining` na lib compartilhada

**Files:**
- Modify: `frontend/shared/arena-discovery/arena-peak-rule.ts` (adicionar o helper exportado; reescrever `chainExistsContaining` para delegar a ele)
- Modify: `frontend/shared/arena-discovery/index.ts` (append no bloco de exports de `./arena-peak-rule`)
- Test: `frontend/projects/athlete/src/app/reservar/arena-peak-rule.spec.ts` (append de um novo `describe`)

**Interfaces:**
- Consumes: `ArenaSlot`, `arenaSlotIsAvailable`, `timeToMinutes` de `./arena-slot` (já importados no arquivo); os helpers privados `chainEligible` e `slotStartDate` já existentes no mesmo arquivo.
- Produces (usado nas Tasks 2 e 3):
  - `minimumChainContaining(params: { courtDaySlots: ArenaSlot[]; targetStartTime: string; minSlots: number; date: Date; now?: Date }): ArenaSlot[] | null`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao fim de `frontend/projects/athlete/src/app/reservar/arena-peak-rule.spec.ts`. O arquivo já define os helpers `rule()`, `slot(startTime, endTime, rawStatus?)`, `day(...)`, e as constantes `QUA` (05/08/2026, quarta) e `NOW_CEDO` (10:00 do mesmo dia) — reutilize-os, não os redeclare. Adicione `minimumChainContaining` ao import existente de `@nexago/arena-discovery` no topo do arquivo.

```ts
describe('minimumChainContaining', () => {
  it('prefere a cadeia que começa no slot clicado', () => {
    const daySlots = day(
      slot('19:00', '20:00'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00'),
    );
    const chain = minimumChainContaining({
      courtDaySlots: daySlots, targetStartTime: '20:00', minSlots: 2,
      date: QUA, now: NOW_CEDO,
    });
    expect(chain?.map((s) => s.startTime)).toEqual(['20:00', '21:00']);
  });

  it('recua o início quando a cadeia para frente não existe', () => {
    const daySlots = day(
      slot('19:00', '20:00'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', 'booked'),
    );
    const chain = minimumChainContaining({
      courtDaySlots: daySlots, targetStartTime: '20:00', minSlots: 2,
      date: QUA, now: NOW_CEDO,
    });
    expect(chain?.map((s) => s.startTime)).toEqual(['19:00', '20:00']);
  });

  it('devolve null quando nenhuma cadeia é possível', () => {
    const daySlots = day(
      slot('19:00', '20:00', 'booked'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', 'blocked'),
    );
    const chain = minimumChainContaining({
      courtDaySlots: daySlots, targetStartTime: '20:00', minSlots: 2,
      date: QUA, now: NOW_CEDO,
    });
    expect(chain).toBeNull();
  });

  it('não usa slot já passado para montar a cadeia', () => {
    const tarde = new Date(2026, 7, 5, 19, 30);
    const daySlots = day(
      slot('19:00', '20:00'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', 'booked'),
    );
    const chain = minimumChainContaining({
      courtDaySlots: daySlots, targetStartTime: '20:00', minSlots: 2,
      date: QUA, now: tarde,
    });
    expect(chain).toBeNull();
  });

  it('exige contiguidade entre os slots da cadeia', () => {
    const comBuraco = day(
      slot('19:00', '20:00'),
      slot('21:00', '22:00'),
    );
    const chain = minimumChainContaining({
      courtDaySlots: comBuraco, targetStartTime: '21:00', minSlots: 2,
      date: QUA, now: NOW_CEDO,
    });
    expect(chain).toBeNull();
  });

  it('monta 4 slots em quadra de 30min', () => {
    const meia = day(
      slot('19:00', '19:30'), slot('19:30', '20:00'),
      slot('20:00', '20:30'), slot('20:30', '21:00'),
      slot('21:00', '21:30'), slot('21:30', '22:00'),
    );
    const chain = minimumChainContaining({
      courtDaySlots: meia, targetStartTime: '20:00', minSlots: 4,
      date: QUA, now: NOW_CEDO,
    });
    expect(chain?.map((s) => s.startTime)).toEqual(['20:00', '20:30', '21:00', '21:30']);
  });

  it('slot inexistente na grade devolve null', () => {
    const daySlots = day(slot('19:00', '20:00'), slot('20:00', '21:00'));
    const chain = minimumChainContaining({
      courtDaySlots: daySlots, targetStartTime: '23:00', minSlots: 2,
      date: QUA, now: NOW_CEDO,
    });
    expect(chain).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless`
Expected: FAIL — `minimumChainContaining` não é exportado por `@nexago/arena-discovery`.

- [ ] **Step 3: Implementar o helper em `frontend/shared/arena-discovery/arena-peak-rule.ts`**

Adicionar após `peakBadgeMinSlots` (antes dos helpers privados):

```ts
/** Melhor cadeia contígua de `minSlots` slots disponíveis contendo o slot de
 *  `targetStartTime`. Prefere a cadeia que COMEÇA no slot clicado e só então
 *  recua o início — é o que o modal da regra de pico oferece ao atleta.
 *  `null` quando nenhuma cadeia é possível (nesse caso o slot está liberado e
 *  o modal não deve abrir). */
export function minimumChainContaining(params: {
  courtDaySlots: ArenaSlot[];
  targetStartTime: string;
  minSlots: number;
  date: Date;
  now?: Date;
}): ArenaSlot[] | null {
  const now = params.now ?? new Date();
  const slots = params.courtDaySlots;
  if (params.minSlots < 1) return null;
  const idx = slots.findIndex((s) => s.startTime === params.targetStartTime);
  if (idx === -1) return null;

  const earliestStart = Math.max(0, idx - (params.minSlots - 1));
  for (let start = idx; start >= earliestStart; start--) {
    if (start + params.minSlots > slots.length) continue;
    const chain = slots.slice(start, start + params.minSlots);
    if (chainIsBookable(chain, params.date, now)) return chain;
  }
  return null;
}

function chainIsBookable(chain: ArenaSlot[], date: Date, now: Date): boolean {
  for (let i = 0; i < chain.length; i++) {
    const s = chain[i]!;
    if (!chainEligible(s, date, now)) return false;
    if (i > 0 && chain[i - 1]!.endTime !== s.startTime) return false;
  }
  return true;
}
```

- [ ] **Step 4: Reescrever `chainExistsContaining` para delegar (DRY)**

Substituir o corpo inteiro da função privada `chainExistsContaining` por:

```ts
function chainExistsContaining(
  courtDaySlots: ArenaSlot[],
  targetStartTime: string,
  minSlots: number,
  date: Date,
  now: Date,
): boolean {
  return minimumChainContaining({courtDaySlots, targetStartTime, minSlots, date, now}) != null;
}
```

A ordem de varredura muda (agora do slot para trás, antes era de trás para o slot), mas o booleano é idêntico: ambas cobrem exatamente os mesmos offsets. Os testes existentes de `peakCheckForSelection` provam isso.

- [ ] **Step 5: Exportar em `frontend/shared/arena-discovery/index.ts`**

No bloco de exports de `./arena-peak-rule` que já existe no fim do arquivo, acrescentar `minimumChainContaining` à lista de nomes exportados, mantendo a ordem alfabética existente:

```ts
export {
  arenaPeakRuleFromFirestore,
  fetchActivePeakRules,
  minimumChainContaining,
  peakBadgeMinSlots,
  peakCheckForSelection,
  peakRuleMatches,
} from './arena-peak-rule';
```

- [ ] **Step 6: Rodar os testes e ver passar**

Run: `cd frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless`
Expected: PASS — os 7 casos novos mais toda a suíte existente (o refactor do passo 4 não pode quebrar nenhum caso de `peakCheckForSelection`).

- [ ] **Step 7: Commit**

```bash
git add frontend/shared/arena-discovery/arena-peak-rule.ts frontend/shared/arena-discovery/index.ts frontend/projects/athlete/src/app/reservar/arena-peak-rule.spec.ts
git commit -m "feat(shared): cadeia mínima contendo o slot de pico"
```

---

### Task 2: Decisão pura do modal no web (`peak-prompt.ts`)

**Files:**
- Create: `frontend/projects/athlete/src/app/reservar/peak-prompt.ts`
- Test: `frontend/projects/athlete/src/app/reservar/peak-prompt.spec.ts`

**Interfaces:**
- Consumes (Task 1): `minimumChainContaining`, `peakCheckForSelection`, `type ArenaPeakRule`, `type ArenaSlot` de `@nexago/arena-discovery`.
- Produces (usado na Task 3):
  - `interface PeakPrompt { readonly rule: ArenaPeakRule; readonly chain: ArenaSlot[]; readonly minSlots: number; }`
  - `peakPromptFor(params: { rules: ArenaPeakRule[]; courtId: string; date: Date; courtDaySlots: ArenaSlot[]; slot: ArenaSlot; slotDurationMinutes: number; now?: Date }): PeakPrompt | null`

Por que um arquivo próprio: `arena-booking.component.ts` não tem spec e testá-lo exigiria TestBed com `provideZonelessChangeDetection` e mocks de rota/auth/Firestore. A decisão do modal é lógica de negócio pura — fica testável isolada, como `booking-dates.ts` já faz nessa mesma pasta.

- [ ] **Step 1: Escrever os testes que falham**

Criar `frontend/projects/athlete/src/app/reservar/peak-prompt.spec.ts`:

```ts
import { peakPromptFor } from './peak-prompt';
import type { ArenaPeakRule, ArenaSlot } from '@nexago/arena-discovery';

const QUA = new Date(2026, 7, 5); // 05/08/2026, quarta
const NOW_CEDO = new Date(2026, 7, 5, 10, 0);

function rule(overrides: Partial<ArenaPeakRule> = {}): ArenaPeakRule {
  return {
    id: 'r1',
    active: true,
    label: 'Pico noturno',
    courtIds: [],
    weekdays: [],
    startTime: '20:00',
    endTime: '21:00',
    minDurationMinutes: 120,
    releaseHoursBefore: null,
    ...overrides,
  };
}

function slot(startTime: string, endTime: string, rawStatus = 'available'): ArenaSlot {
  return {
    id: `q1_${startTime}`,
    arenaId: 'a1',
    courtId: 'q1',
    date: QUA,
    startTime,
    endTime,
    rawStatus,
    priceReais: 100,
    basePriceReais: 100,
    appliedPromotionId: null,
    isVirtual: rawStatus === 'available',
  };
}

const GRADE = [slot('19:00', '20:00'), slot('20:00', '21:00'), slot('21:00', '22:00')];

function promptFor(slots: ArenaSlot[], target: ArenaSlot, rules: ArenaPeakRule[], now = NOW_CEDO) {
  return peakPromptFor({
    rules, courtId: 'q1', date: QUA, courtDaySlots: slots,
    slot: target, slotDurationMinutes: 60, now,
  });
}

describe('peakPromptFor', () => {
  it('abre no slot de pico restrito, com a cadeia que começa nele', () => {
    const prompt = promptFor(GRADE, GRADE[1]!, [rule()]);
    expect(prompt?.minSlots).toBe(2);
    expect(prompt?.rule.id).toBe('r1');
    expect(prompt?.chain.map((s) => s.startTime)).toEqual(['20:00', '21:00']);
  });

  it('recua o início quando só a cadeia anterior existe', () => {
    const grade = [slot('19:00', '20:00'), slot('20:00', '21:00'), slot('21:00', '22:00', 'booked')];
    const prompt = promptFor(grade, grade[1]!, [rule()]);
    expect(prompt?.chain.map((s) => s.startTime)).toEqual(['19:00', '20:00']);
  });

  it('não abre sem nenhuma regra', () => {
    expect(promptFor(GRADE, GRADE[1]!, [])).toBeNull();
  });

  it('não abre em slot fora da faixa de pico', () => {
    expect(promptFor(GRADE, GRADE[0]!, [rule()])).toBeNull();
  });

  it('não abre quando as vizinhas inviabilizam a cadeia (slot liberado)', () => {
    const cercado = [
      slot('19:00', '20:00', 'booked'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', 'blocked'),
    ];
    expect(promptFor(cercado, cercado[1]!, [rule()])).toBeNull();
  });

  it('não abre depois de aberta a janela de liberação', () => {
    const dentroDaJanela = new Date(2026, 7, 5, 17, 30); // 20:00 − 3h = 17:00
    expect(promptFor(GRADE, GRADE[1]!, [rule({ releaseHoursBefore: 3 })], dentroDaJanela)).toBeNull();
  });

  it('usa o maior mínimo quando duas regras casam', () => {
    const grade4 = [
      slot('18:00', '19:00'), slot('19:00', '20:00'),
      slot('20:00', '21:00'), slot('21:00', '22:00'),
    ];
    const prompt = promptFor(grade4, grade4[2]!, [rule(), rule({ id: 'r2', minDurationMinutes: 180 })]);
    expect(prompt?.minSlots).toBe(3);
    expect(prompt?.rule.id).toBe('r2');
    expect(prompt?.chain.length).toBe(3);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless`
Expected: FAIL — módulo `./peak-prompt` não existe.

- [ ] **Step 3: Implementar `frontend/projects/athlete/src/app/reservar/peak-prompt.ts`**

```ts
import {
  minimumChainContaining,
  peakCheckForSelection,
  type ArenaPeakRule,
  type ArenaSlot,
} from '@nexago/arena-discovery';

/** Conteúdo do modal da regra de pico: a regra que restringe o slot clicado e
 *  a cadeia mínima que o botão primário aplica. */
export interface PeakPrompt {
  readonly rule: ArenaPeakRule;
  readonly chain: ArenaSlot[];
  readonly minSlots: number;
}

/** Decide se o clique num slot deve abrir o modal da regra de pico.
 *
 *  `null` quando não deve: slot fora de faixa de pico, regra já liberada
 *  (janela de antecedência aberta ou cadeia impossível), ou mínimo de 1 slot.
 *  Mantido fora do componente para ser testável sem TestBed. */
export function peakPromptFor(params: {
  rules: ArenaPeakRule[];
  courtId: string;
  date: Date;
  /** Slots do dia da mesma quadra, ordenados por startTime. */
  courtDaySlots: ArenaSlot[];
  slot: ArenaSlot;
  slotDurationMinutes: number;
  now?: Date;
}): PeakPrompt | null {
  const check = peakCheckForSelection({
    rules: params.rules,
    courtId: params.courtId,
    date: params.date,
    courtDaySlots: params.courtDaySlots,
    selection: [params.slot],
    slotDurationMinutes: params.slotDurationMinutes,
    now: params.now,
  });
  if (check.minSlots <= 1 || check.rule == null) return null;

  const chain = minimumChainContaining({
    courtDaySlots: params.courtDaySlots,
    targetStartTime: params.slot.startTime,
    minSlots: check.minSlots,
    date: params.date,
    now: params.now,
  });
  // Defensivo: o predicado só exige o mínimo quando existe cadeia, então
  // `chain` não deveria ser null aqui. Sem cadeia não há o que oferecer.
  if (chain == null) return null;

  return { rule: check.rule, chain, minSlots: check.minSlots };
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `cd frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/reservar/peak-prompt.ts frontend/projects/athlete/src/app/reservar/peak-prompt.spec.ts
git commit -m "feat(athlete-web): decisão pura do modal de horário de pico"
```

---

### Task 3: Modal no portal do atleta

**Files:**
- Modify: `frontend/projects/athlete/src/app/shared/feedback/nx-blocking-dialog.component.ts` (input `role`; doc-comment)
- Modify: `frontend/projects/athlete/src/app/reservar/arena-booking.component.ts`
- Modify: `frontend/projects/athlete/src/app/reservar/arena-booking.component.html`

**Interfaces:**
- Consumes (Tasks 1-2): `peakPromptFor`, `type PeakPrompt` de `./peak-prompt`; `minimumChainContaining` de `@nexago/arena-discovery`; `NxBlockingDialogComponent` de `../shared/feedback`.
- Produces: comportamento final da grade web. Nenhuma outra task consome.

- [ ] **Step 1: Adicionar o input `role` ao dialog**

Em `nx-blocking-dialog.component.ts`, no bloco de `input()`s da classe (junto de `heading`, `body`, `tone`), adicionar:

```ts
  /** `alertdialog` (default) anuncia com urgência — certo para erro que
   *  interrompe. Decisão informada, como a regra de horário de pico, usa
   *  `dialog`. */
  readonly role = input<'alertdialog' | 'dialog'>('alertdialog');
```

No template, trocar o atributo fixo `role="alertdialog"` da `<div class="dialog">` por:

```html
      [attr.role]="role()"
```

E no doc-comment da classe, após a frase "Reserve pra beco sem saída de verdade: ...", acrescentar uma linha:

```
 *  Serve também para decisão informada que o atleta precisa tomar antes de
 *  seguir (ex.: regra de horário de pico) — nesse caso, `role="dialog"`.
```

- [ ] **Step 2: Fiação no componente — estado e textos**

Em `arena-booking.component.ts`:

Nos imports de `@nexago/arena-discovery`, acrescentar `minimumChainContaining`. Acrescentar dois imports novos:

```ts
import { NxBlockingDialogComponent } from '../shared/feedback';
import { peakPromptFor, type PeakPrompt } from './peak-prompt';
```

No decorator `@Component`, acrescentar `NxBlockingDialogComponent` ao array `imports`.

Na classe, junto dos outros signals de estado:

```ts
  /** Modal da regra de pico: `null` = fechado. */
  protected readonly peakPrompt = signal<PeakPrompt | null>(null);
```

E os textos derivados (colocar junto de `peakHint`):

```ts
  /** Intervalo que o botão primário do modal aplica, ex. `19:00–21:00`. */
  private promptRangeLabel(prompt: PeakPrompt): string {
    const first = prompt.chain[0]!;
    const last = prompt.chain[prompt.chain.length - 1]!;
    return `${first.startTime}–${last.endTime}`;
  }

  protected readonly peakPromptBody = computed(() => {
    const prompt = this.peakPrompt();
    if (!prompt) return '';
    const faixa = `${prompt.rule.startTime}–${prompt.rule.endTime}`;
    const minimo = formatDurationLabel(prompt.minSlots * this.baseSlotMinutes());
    const first = prompt.chain[0]!;
    const last = prompt.chain[prompt.chain.length - 1]!;
    const arenaFallback = this.arena()?.pricePerHourReais ?? 0;
    const total = prompt.chain.reduce((sum, s) => sum + (s.priceReais ?? arenaFallback), 0);
    return (
      `${faixa} é o horário mais procurado desta arena. Para a quadra não ficar ` +
      `vaga na hora seguinte, a reserva mínima nesta faixa é de ${minimo}. ` +
      `Sua reserva ficaria das ${first.startTime} às ${last.endTime}, por R$ ${total}.`
    );
  });

  protected readonly peakPromptPrimaryLabel = computed(() => {
    const prompt = this.peakPrompt();
    return prompt ? `Reservar ${this.promptRangeLabel(prompt)}` : '';
  });
```

- [ ] **Step 3: Trocar o auto-bump pela abertura do modal**

Substituir o método `selectStartSlot` inteiro por:

```ts
  protected selectStartSlot(view: SlotView): void {
    if (!view.isAvailable || view.isPast) return;
    this.selectedStartSlot.set(view.slot);
    // Horário de pico restrito: o modal explica a regra e aplica a reserva
    // mínima com o aceite do atleta — nunca mudamos a duração por trás.
    this.peakPrompt.set(
      peakPromptFor({
        rules: this.peakRules(),
        courtId: this.selectedCourtId() ?? '',
        date: this.selectedDate(),
        courtDaySlots: this.selectedCourtSlots(),
        slot: view.slot,
        slotDurationMinutes: this.baseSlotMinutes(),
      }),
    );
  }
```

E acrescentar os dois handlers do modal:

```ts
  protected acceptPeakPrompt(): void {
    const prompt = this.peakPrompt();
    if (!prompt) return;
    // A cadeia pode começar antes do slot clicado (quando só ela é possível).
    this.selectedStartSlot.set(prompt.chain[0]!);
    this.durationSlots.set(prompt.chain.length);
    this.peakPrompt.set(null);
  }

  protected dismissPeakPrompt(): void {
    this.peakPrompt.set(null);
  }
```

- [ ] **Step 4: A opção extra de duração passa a usar a cadeia real**

No computed `durationOptions`, dentro do bloco `if (start)`, trocar a montagem da opção extra para usar `minimumChainContaining` — `chainForDuration` só monta para frente e deixa o atleta sem opção quando apenas a cadeia anterior existe:

```ts
    if (start) {
      const minSlots = this.peakCheckFor([start]).minSlots;
      if (minSlots > maxBaseSlots) {
        const chain = minimumChainContaining({
          courtDaySlots: this.selectedCourtSlots(),
          targetStartTime: start.startTime,
          minSlots,
          date: this.selectedDate(),
        });
        options.push({
          slots: minSlots,
          minutes: base * minSlots,
          label: formatDurationLabel(base * minSlots),
          enabled: chain != null,
        });
      }
    }
```

- [ ] **Step 5: Renderizar o modal no template**

Em `arena-booking.component.html`, no fim do arquivo (fora de qualquer `@if` de loading/erro, para que o modal apareça sobre a grade):

```html
@if (peakPrompt(); as prompt) {
  <app-nx-blocking-dialog
    tone="warning"
    role="dialog"
    heading="Horário concorrido"
    [body]="peakPromptBody()"
    [primaryLabel]="peakPromptPrimaryLabel()"
    secondaryLabel="Escolher outro horário"
    (primary)="acceptPeakPrompt()"
    (secondary)="dismissPeakPrompt()"
  />
}
```

Confira os nomes exatos dos inputs/outputs lendo `nx-blocking-dialog.component.ts` antes de escrever — o componente expõe `heading`, `body`, `code`, `tone`, `primaryLabel`, `secondaryLabel` e os outputs `primary`/`secondary`. `code` não é usado aqui.

- [ ] **Step 6: Testes e build**

Run: `cd frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless && npx ng build athlete`
Expected: PASS (toda a suíte, incluindo os specs das Tasks 1-2) e build limpo — só o aviso pré-existente de bundle budget.

- [ ] **Step 7: Commit**

```bash
git add frontend/projects/athlete/src/app/shared/feedback/nx-blocking-dialog.component.ts frontend/projects/athlete/src/app/reservar/arena-booking.component.ts frontend/projects/athlete/src/app/reservar/arena-booking.component.html
git commit -m "feat(athlete-web): modal explica a regra de pico e aplica a reserva mínima"
```

---

### Task 4: Cadeia mínima e decisão do modal no Flutter

**Files:**
- Modify: `nexago_app/lib/features/arenas/domain/slots_page_logic.dart` (append; o import de `arena_peak_rule.dart` já existe no arquivo)
- Test: `nexago_app/test/features/arenas/domain/slots_page_logic_peak_test.dart` (append de novos testes no `main()` existente)

**Interfaces:**
- Consumes: `ArenaSlot`, `ArenaPeakRule`, `isPastBookableSlot`, `durationSlotCount`, `peakCheckForRange`, `PeakSelectionCheck` — todos já no arquivo.
- Produces (usado na Task 5):
  - `({int start, int end})? minimumChainContaining({ required List<ArenaSlot> slots, required int selectionStart, required int selectionEnd, required int minSlots, required DateTime selectedDay, DateTime? now })`
  - `class PeakPrompt { final ArenaPeakRule rule; final int start; final int end; final int minSlots; }`
  - `PeakPrompt? peakPromptForSelection({ required List<ArenaPeakRule> rules, required String courtId, required List<ArenaSlot> slots, required DateTime selectedDay, required int start, required int end, required int slotDurationMinutes, DateTime? now })`

Nota de assinatura: no app a seleção é um intervalo de índices (`_selStart`/`_selEnd`), não um slot inicial + duração como no web. Por isso a cadeia aqui é buscada por índices e deve **conter o intervalo selecionado inteiro**; no web basta o slot clicado. É a mesma regra, expressa no modelo de seleção de cada superfície.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao `main()` de `slots_page_logic_peak_test.dart`, reutilizando os helpers `rule()`, `slot()` e as variáveis `qua`/`nowCedo` já definidos no arquivo. **Leia o topo do arquivo antes de escrever** — os helpers foram adaptados ao construtor real de `ArenaSlot` na implementação anterior, então confira a assinatura de `slot()` (o parâmetro de status pode não se chamar `status:`) e ajuste as chamadas abaixo ao que existe; os casos e os valores esperados ficam como estão:

```dart
  test('minimumChainContaining prefere a cadeia que começa na seleção', () {
    final grade = [slot('19:00', '20:00'), slot('20:00', '21:00'), slot('21:00', '22:00')];
    final chain = minimumChainContaining(
      slots: grade, selectionStart: 1, selectionEnd: 1, minSlots: 2,
      selectedDay: qua, now: nowCedo,
    );
    expect(chain?.start, 1);
    expect(chain?.end, 2);
  });

  test('minimumChainContaining recua quando a cadeia para frente não existe', () {
    final grade = [
      slot('19:00', '20:00'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', status: 'booked'),
    ];
    final chain = minimumChainContaining(
      slots: grade, selectionStart: 1, selectionEnd: 1, minSlots: 2,
      selectedDay: qua, now: nowCedo,
    );
    expect(chain?.start, 0);
    expect(chain?.end, 1);
  });

  test('minimumChainContaining devolve null sem cadeia possível', () {
    final cercado = [
      slot('19:00', '20:00', status: 'booked'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', status: 'blocked'),
    ];
    final chain = minimumChainContaining(
      slots: cercado, selectionStart: 1, selectionEnd: 1, minSlots: 2,
      selectedDay: qua, now: nowCedo,
    );
    expect(chain, isNull);
  });

  test('minimumChainContaining engloba todo o intervalo selecionado', () {
    final grade = [
      slot('18:00', '19:00'), slot('19:00', '20:00'),
      slot('20:00', '21:00'), slot('21:00', '22:00'),
    ];
    final chain = minimumChainContaining(
      slots: grade, selectionStart: 1, selectionEnd: 2, minSlots: 3,
      selectedDay: qua, now: nowCedo,
    );
    expect(chain?.start, 1);
    expect(chain?.end, 3);
  });

  test('peakPromptForSelection abre no slot de pico restrito', () {
    final grade = [slot('19:00', '20:00'), slot('20:00', '21:00'), slot('21:00', '22:00')];
    final prompt = peakPromptForSelection(
      rules: [rule()], courtId: 'q1', slots: grade, selectedDay: qua,
      start: 1, end: 1, slotDurationMinutes: 60, now: nowCedo,
    );
    expect(prompt, isNotNull);
    expect(prompt!.minSlots, 2);
    expect(prompt.start, 1);
    expect(prompt.end, 2);
    expect(prompt.rule.id, 'r1');
  });

  test('peakPromptForSelection não abre quando a seleção já cumpre o mínimo', () {
    final grade = [slot('19:00', '20:00'), slot('20:00', '21:00'), slot('21:00', '22:00')];
    final prompt = peakPromptForSelection(
      rules: [rule()], courtId: 'q1', slots: grade, selectedDay: qua,
      start: 0, end: 1, slotDurationMinutes: 60, now: nowCedo,
    );
    expect(prompt, isNull);
  });

  test('peakPromptForSelection não abre em slot liberado', () {
    final cercado = [
      slot('19:00', '20:00', status: 'booked'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', status: 'blocked'),
    ];
    final prompt = peakPromptForSelection(
      rules: [rule()], courtId: 'q1', slots: cercado, selectedDay: qua,
      start: 1, end: 1, slotDurationMinutes: 60, now: nowCedo,
    );
    expect(prompt, isNull);
  });

  test('peakPromptForSelection não abre sem regra', () {
    final grade = [slot('19:00', '20:00'), slot('20:00', '21:00'), slot('21:00', '22:00')];
    final prompt = peakPromptForSelection(
      rules: const [], courtId: 'q1', slots: grade, selectedDay: qua,
      start: 1, end: 1, slotDurationMinutes: 60, now: nowCedo,
    );
    expect(prompt, isNull);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd nexago_app && flutter test test/features/arenas/domain/slots_page_logic_peak_test.dart`
Expected: FAIL — `minimumChainContaining` e `peakPromptForSelection` não definidos.

- [ ] **Step 3: Implementar em `slots_page_logic.dart`** (append no fim do arquivo)

```dart
/// Melhor cadeia contígua de [minSlots] slots selecionáveis que contém todo o
/// intervalo `[selectionStart..selectionEnd]`. Prefere a cadeia que começa na
/// própria seleção e só então recua o início — é o que o modal da regra de
/// pico oferece. `null` quando nenhuma cadeia é possível.
({int start, int end})? minimumChainContaining({
  required List<ArenaSlot> slots,
  required int selectionStart,
  required int selectionEnd,
  required int minSlots,
  required DateTime selectedDay,
  DateTime? now,
}) {
  final n = now ?? DateTime.now();
  if (minSlots < 1 || selectionStart < 0 || selectionEnd >= slots.length) {
    return null;
  }
  final earliest = (selectionEnd - minSlots + 1).clamp(0, selectionStart);
  for (var start = selectionStart; start >= earliest; start--) {
    final end = start + minSlots - 1;
    if (end >= slots.length) continue;
    if (_peakChainBookable(slots, start, end, selectedDay, n)) {
      return (start: start, end: end);
    }
  }
  return null;
}

bool _peakChainBookable(
  List<ArenaSlot> slots,
  int start,
  int end,
  DateTime day,
  DateTime now,
) {
  for (var i = start; i <= end; i++) {
    final s = slots[i];
    if (!s.isAvailable || isPastBookableSlot(selectedDay: day, slot: s, now: now)) {
      return false;
    }
    if (i > start && slots[i - 1].endTime != s.startTime) return false;
  }
  return true;
}

/// Conteúdo do modal da regra de pico no app: a regra que restringe a seleção
/// e o intervalo mínimo que o botão primário aplica.
class PeakPrompt {
  const PeakPrompt({
    required this.rule,
    required this.start,
    required this.end,
    required this.minSlots,
  });

  final ArenaPeakRule rule;
  final int start;
  final int end;
  final int minSlots;
}

/// Decide se o toque num slot deve abrir o modal da regra de pico. `null`
/// quando não deve: seleção já cumpre o mínimo, slot fora de faixa de pico,
/// regra liberada (antecedência ou cadeia impossível).
PeakPrompt? peakPromptForSelection({
  required List<ArenaPeakRule> rules,
  required String courtId,
  required List<ArenaSlot> slots,
  required DateTime selectedDay,
  required int start,
  required int end,
  required int slotDurationMinutes,
  DateTime? now,
}) {
  final n = now ?? DateTime.now();
  final check = peakCheckForRange(
    rules: rules,
    courtId: courtId,
    slots: slots,
    selectedDay: selectedDay,
    start: start,
    end: end,
    slotDurationMinutes: slotDurationMinutes,
    now: n,
  );
  final rule = check.rule;
  if (check.minSlots <= (end - start + 1) || rule == null) return null;

  final chain = minimumChainContaining(
    slots: slots,
    selectionStart: start,
    selectionEnd: end,
    minSlots: check.minSlots,
    selectedDay: selectedDay,
    now: n,
  );
  // Defensivo: o predicado só exige o mínimo quando a cadeia existe.
  if (chain == null) return null;

  return PeakPrompt(
    rule: rule,
    start: chain.start,
    end: chain.end,
    minSlots: check.minSlots,
  );
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `cd nexago_app && flutter test test/features/arenas/domain/slots_page_logic_peak_test.dart test/features/arenas/domain/arena_peak_rule_test.dart`
Expected: PASS — os 8 casos novos mais os 14 existentes.

- [ ] **Step 5: Suíte de arenas + analyzer**

Run: `cd nexago_app && flutter test test/features/arenas && flutter analyze lib/features/arenas`
Expected: toda a suíte verde; analyzer sem issues novos (o repo tem 1 pré-existente, `unused_element` em `slots_repository.dart`).

- [ ] **Step 6: Commit**

```bash
git add nexago_app/lib/features/arenas/domain/slots_page_logic.dart nexago_app/test/features/arenas/domain/slots_page_logic_peak_test.dart
git commit -m "feat(app): cadeia mínima e decisão do modal de horário de pico"
```

---

### Task 5: Modal na grade do app

**Files:**
- Modify: `nexago_app/lib/features/arenas/presentation/slots_page.dart` (`_onSlotTap` ~linha 309; a chamada `onSlotTap:` ~linha 1092; novo método `_showPeakRuleDialog`)

**Interfaces:**
- Consumes (Task 4): `peakPromptForSelection`, `PeakPrompt`, `minimumChainContaining` de `slots_page_logic.dart`; `formatSelectionDurationLabel`, `formatCompactTimeRange`, `totalPriceForRange` já existentes no mesmo arquivo de lógica; `context.themeColors.surfaceSheet` e `formatBRLWhole` já usados na página.
- Produces: comportamento final da grade do app. Nenhuma outra task consome.

- [ ] **Step 1: Estender `_onSlotTap` com o contexto da regra**

A assinatura atual é `void _onSlotTap(int index, List<ArenaSlot> slots)`. Trocar por:

```dart
  void _onSlotTap(
    int index,
    List<ArenaSlot> slots, {
    required List<ArenaPeakRule> peakRules,
    required String courtId,
    required int slotDurationMinutes,
  }) {
```

O corpo do método permanece igual até o fim do `setState`. Logo **após** o bloco `setState(() { ... });`, acrescentar:

```dart
    final s = _selStart;
    final e = _selEnd;
    if (s == null || e == null) return;
    final prompt = peakPromptForSelection(
      rules: peakRules,
      courtId: courtId,
      slots: slots,
      selectedDay: _selectedDay,
      start: s,
      end: e,
      slotDurationMinutes: slotDurationMinutes,
    );
    if (prompt != null) {
      unawaited(_showPeakRuleDialog(prompt, slots, slotDurationMinutes));
    }
```

Se `unawaited` ainda não estiver disponível no arquivo, acrescente `import 'dart:async';` no topo, junto dos outros imports.

Atualizar a chamada no `SlotsListSection` (onde hoje está `onSlotTap: (i) => _onSlotTap(i, slots),`):

```dart
                              onSlotTap: (i) => _onSlotTap(
                                i,
                                slots,
                                peakRules: peakRules,
                                courtId: courtId,
                                slotDurationMinutes: slotDurationMinutes,
                              ),
```

`peakRules`, `courtId` e `slotDurationMinutes` já são variáveis locais de `_buildMainScaffold`, no escopo dessa chamada.

- [ ] **Step 2: Implementar o diálogo**

Acrescentar o método à classe de estado, junto dos outros `Future<void> _show...` da página:

```dart
  /// Explica a regra de horário de pico e, no aceite, aplica a reserva mínima.
  /// Mesmo padrão de diálogo da lista de espera nesta página.
  Future<void> _showPeakRuleDialog(
    PeakPrompt prompt,
    List<ArenaSlot> slots,
    int slotDurationMinutes,
  ) async {
    final faixa = '${prompt.rule.startTime}–${prompt.rule.endTime}';
    final minimo = formatSelectionDurationLabel(prompt.minSlots, slotDurationMinutes);
    final intervalo = formatCompactTimeRange(
      slots[prompt.start].startTime,
      slots[prompt.end].endTime,
    );
    final total = totalPriceForRange(slots, prompt.start, prompt.end);
    final precoFrase = total != null ? ', por ${formatBRLWhole(total)}' : '';

    final accepted = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.themeColors.surfaceSheet,
        title: Text('Horário concorrido'),
        content: Text(
          '$faixa é o horário mais procurado desta arena. Para a quadra não '
          'ficar vaga na hora seguinte, a reserva mínima nesta faixa é de '
          '$minimo. Sua reserva ficaria das ${slots[prompt.start].startTime} '
          'às ${slots[prompt.end].endTime}$precoFrase.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Escolher outro horário'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Reservar $intervalo'),
          ),
        ],
      ),
    );

    if (accepted != true || !mounted) return;
    setState(() {
      _selStart = prompt.start;
      _selEnd = prompt.end;
    });
  }
```

- [ ] **Step 3: Suíte de arenas + analyzer**

Run: `cd nexago_app && flutter test test/features/arenas && flutter analyze lib/features/arenas`
Expected: 199 testes verdes (191 + os 8 da Task 4); analyzer sem issues novos além do `unused_element` pré-existente.

- [ ] **Step 4: Commit**

```bash
git add nexago_app/lib/features/arenas/presentation/slots_page.dart
git commit -m "feat(app): modal explica a regra de pico e aplica a reserva mínima"
```

---

### Task 6: Verificação final

**Files:** nenhum novo — verificação, e correções pontuais se algo falhar.

- [ ] **Step 1: Suítes completas**

```bash
cd frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless && npx ng build athlete && npx ng build arena
```

```bash
cd nexago_app && flutter test test/features/arenas
```

```bash
cd functions && npm test
```

Expected: tudo verde. `functions` entra na lista como guarda: este plano não toca `functions/`, então qualquer falha ali indica erro de escopo.

- [ ] **Step 2: Checklist de comportamento**

- `git diff main --stat` não mostra nenhum arquivo sob `functions/` nem `firestore.rules`.
- `selectStartSlot` em `arena-booking.component.ts` não contém mais `durationSlots.set(` (o auto-bump saiu).
- A copy do modal bate literalmente entre web e app: mesmo título, mesma estrutura de corpo, mesmas duas ações.
- Sem regra de pico cadastrada: `peakPromptFor`/`peakPromptForSelection` devolvem `null` em todo clique e nenhum modal aparece.

- [ ] **Step 3: Commit final se houve ajustes**

Nenhum commit se a verificação passar limpa.
