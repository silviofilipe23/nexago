# Botão "Reservar" leva ao próximo horário — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao clicar em "Reservar" na lista de arenas ou no perfil de uma arena, o atleta cai direto na grade de agendamento com o próximo horário disponível já destacado como selecionado, em vez de um modal placeholder (lista) ou de precisar escolher o horário de novo (perfil da arena).

**Architecture:** `arena-booking.component.ts` (a grade de horários) passa a aceitar um query param opcional `time` (`HH:mm`) e pré-seleciona o slot correspondente ao carregar. A busca desse slot é uma função pura nova em `booking-dates.ts`, testável isoladamente. Os dois pontos de entrada — card da lista (`athlete-reservar`) e linha de quadra do perfil (`arena-detail`) — passam a mandar `courtId` + `date` + `time` na navegação, usando o "próximo horário" que cada um já calcula e exibe hoje.

**Tech Stack:** Angular 20 (standalone, signals, OnPush), TypeScript 5.9, Firebase Web SDK v10 (modular), Jasmine + Karma.

**Spec:** `docs/superpowers/specs/2026-07-30-reservar-proximo-horario-design.md`

## Global Constraints

- **Angular:** componentes standalone (nunca declarar `standalone: true`, é o default), `ChangeDetectionStrategy.OnPush`, signals para estado, `computed()` para derivado, `input()`/`output()` em vez de decorators. Control flow nativo (`@if`, `@for`) — nunca `*ngIf`/`*ngFor`. Nunca `ngClass`/`ngStyle`. Nunca `@HostBinding`/`@HostListener`. `inject()` em vez de injeção por construtor.
- **Idioma:** strings de UI em português; identificadores, tipos e comentários de código em inglês, exceto comentários explicativos de regra de negócio, que seguem o padrão em português já usado nos arquivos tocados.
- **Formato de data/hora:** `date` é sempre `YYYY-MM-DD` (mesmo formato de `clampPickedDate`/`slotsQueryDateKey`); `time` é sempre `HH:mm`, igual a `ArenaSlot.startTime`.
- **Sem `time`/`date` na URL:** comportamento idêntico ao atual — a grade abre sem nada pré-selecionado, o atleta escolhe manualmente. Nenhum destes parâmetros é obrigatório em lugar nenhum.
- **Testes:** Jasmine + Karma. Rodar de `frontend/` com `ng test athlete --watch=false --browsers=ChromeHeadless`. O projeto testa lógica pura em specs isolados, não componentes — a verificação de componentes é build + checagem manual no navegador.
- **Não fazer:** nenhuma alteração em `functions/`, `firestore.rules`, painel da arena, app Flutter, no cálculo de "próximo horário" em si (`arena-search.ts`, `nextSlotByCourtId`), ou no CTA genérico "Reservar quadra" da lateral do perfil da arena (`arena-detail.component.html:185-187`).

---

### Task 1: `findSlotByTime` — função pura de busca do slot inicial

Dado um horário (`HH:mm`), acha o slot correspondente numa lista de slots de uma quadra/dia, se estiver disponível e não tiver passado. Nenhuma dependência de Angular ou Firebase além dos helpers já usados pelo lib compartilhado.

**Files:**
- Modify: `frontend/projects/athlete/src/app/reservar/booking-dates.ts`
- Modify: `frontend/projects/athlete/src/app/reservar/booking-dates.spec.ts`

**Interfaces:**
- Consumes: `ArenaSlot`, `arenaSlotIsAvailable`, `isPastSlot` de `@nexago/arena-discovery` (já usados em outros arquivos do mesmo diretório).
- Produces: `findSlotByTime(slots: ArenaSlot[], courtId: string, time: string | null, date: Date, now?: Date): ArenaSlot | null`

- [ ] **Step 1: Escrever o teste falhando**

Em `booking-dates.spec.ts`, ampliar o import do próprio módulo (topo do arquivo) para incluir `findSlotByTime`:

```ts
import {
  MAX_HORIZON_DAYS,
  STRIP_DAYS,
  addDays,
  buildDateStrip,
  clampPickedDate,
  daysBetween,
  findSlotByTime,
  shouldShowMonth,
} from './booking-dates';
import type { ArenaSlot } from '@nexago/arena-discovery';
```

Acrescentar no fim do arquivo, depois do `describe('shouldShowMonth', ...)`:

```ts
describe('findSlotByTime', () => {
  function makeSlot(overrides: Partial<ArenaSlot> = {}): ArenaSlot {
    return {
      id: 's1',
      arenaId: 'a1',
      courtId: 'c1',
      date: TODAY,
      startTime: '18:00',
      endTime: '19:00',
      rawStatus: 'available',
      priceReais: 80,
      basePriceReais: 80,
      appliedPromotionId: null,
      isVirtual: false,
      ...overrides,
    };
  }

  it('acha o slot com o horário exato disponível na quadra certa', () => {
    const slot = makeSlot({ id: 's1', courtId: 'c1', startTime: '18:00' });
    const other = makeSlot({ id: 's2', courtId: 'c1', startTime: '19:00' });
    expect(findSlotByTime([slot, other], 'c1', '18:00', TODAY, TODAY)).toBe(slot);
  });

  it('retorna null quando não há slot com esse horário', () => {
    const slot = makeSlot({ startTime: '18:00' });
    expect(findSlotByTime([slot], 'c1', '20:00', TODAY, TODAY)).toBeNull();
  });

  it('ignora slot de outra quadra mesmo com o mesmo horário', () => {
    const slot = makeSlot({ courtId: 'c2', startTime: '18:00' });
    expect(findSlotByTime([slot], 'c1', '18:00', TODAY, TODAY)).toBeNull();
  });

  it('ignora um slot cujo horário já passou', () => {
    const slot = makeSlot({ startTime: '18:00' });
    const now = new Date(2026, 6, 29, 20, 0); // 20h, depois das 18h do mesmo dia
    expect(findSlotByTime([slot], 'c1', '18:00', TODAY, now)).toBeNull();
  });

  it('retorna null quando não há horário pedido', () => {
    const slot = makeSlot({ startTime: '18:00' });
    expect(findSlotByTime([slot], 'c1', null, TODAY, TODAY)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

De `frontend/`:

```bash
ng test athlete --watch=false --browsers=ChromeHeadless
```

Esperado: FAIL na compilação — `findSlotByTime` não é exportado por `./booking-dates`.

- [ ] **Step 3: Escrever a implementação**

Em `booking-dates.ts`, adicionar no topo do arquivo (antes de `export const STRIP_DAYS`):

```ts
import { arenaSlotIsAvailable, isPastSlot, type ArenaSlot } from '@nexago/arena-discovery';
```

Acrescentar no fim do arquivo:

```ts
/** Acha, entre os slots de uma quadra num dia, o que começa exatamente no horário pedido,
 *  disponível e ainda não passado. Usado para pré-selecionar o "próximo horário" quando o
 *  atleta chega na grade de agendamento vindo de um botão "Reservar" que já sabe o horário. */
export function findSlotByTime(
  slots: ArenaSlot[],
  courtId: string,
  time: string | null,
  date: Date,
  now: Date = new Date(),
): ArenaSlot | null {
  if (!time) {
    return null;
  }
  return (
    slots.find(
      (s) =>
        s.courtId === courtId &&
        s.startTime === time &&
        arenaSlotIsAvailable(s) &&
        !isPastSlot(date, s.startTime, now),
    ) ?? null
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

De `frontend/`:

```bash
ng test athlete --watch=false --browsers=ChromeHeadless
```

Esperado: PASS, incluindo os specs já existentes do arquivo.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/reservar/booking-dates.ts frontend/projects/athlete/src/app/reservar/booking-dates.spec.ts
git commit -m "feat(reservar): findSlotByTime para pré-selecionar horário na grade"
```

---

### Task 2: `arena-booking.component.ts` — aceitar `?time=` e pré-selecionar o slot

**Files:**
- Modify: `frontend/projects/athlete/src/app/reservar/arena-booking.component.ts`

**Interfaces:**
- Consumes: `findSlotByTime` (Task 1); `selectedStartSlot` (signal já existente no componente), `selectedDateKey()` (computed já existente).
- Produces: nenhuma interface nova exposta a outros arquivos — efeito observável (slot pré-selecionado ao carregar) é o que as Tasks 3 e 4 passam a explorar.

- [ ] **Step 1: Importar `findSlotByTime`**

No import de `./booking-dates`, acrescentar `findSlotByTime` (ordem alfabética):

```ts
import {
  MAX_HORIZON_DAYS,
  addDays,
  buildDateStrip,
  clampPickedDate,
  dateOnly,
  findSlotByTime,
  shouldShowMonth,
} from './booking-dates';
```

- [ ] **Step 2: Ler `?time=` e pré-selecionar em `load()`**

Localizar, dentro de `load()`:

```ts
      this.slotsByDateKey.set(slotsMap);

      // Entrada via ?date= pode apontar para um chip fora da vista inicial.
      this.scrollSelectedIntoView();
```

Substituir por:

```ts
      this.slotsByDateKey.set(slotsMap);

      const requestedTime = this.route.snapshot.queryParamMap.get('time');
      if (requestedTime) {
        const daySlots = slotsMap[this.selectedDateKey()] ?? [];
        const initialSlot = findSlotByTime(daySlots, initialCourtId ?? '', requestedTime, this.selectedDate());
        if (initialSlot) {
          this.selectedStartSlot.set(initialSlot);
        }
      }

      // Entrada via ?date= pode apontar para um chip fora da vista inicial.
      this.scrollSelectedIntoView();
```

Se `requestedTime` não existir na URL, ou não bater com nenhum slot disponível/não-passado, nada muda em relação ao comportamento atual — a grade abre sem seleção.

- [ ] **Step 3: Verificar build**

De `frontend/`:

```bash
ng build athlete --configuration development
```

Esperado: build sem erro.

- [ ] **Step 4: Verificar manualmente no navegador**

Sem esperar pelas Tasks 3/4, dá pra testar direto pela URL, já que o formato de `date`/`time` é o mesmo que a tela de perfil da arena já mostra hoje (mesmo antes de mexer nela):

1. Abrir o perfil de uma arena com quadra e horário livre hoje (`/reservar/<arenaId>`), anotar o `courtId` do link "Reservar" de uma quadra com "Próx. HH:mm" visível (inspecionar o `href` do link, ou usar o `arenaId` da URL e o horário mostrado).
2. Navegar manualmente para `/reservar/<arenaId>/agendar?courtId=<courtId>&date=<hoje em YYYY-MM-DD>&time=<HH:mm mostrado>`.
3. Confirmar que a grade abre já com esse horário destacado com o mesmo estilo de quando se clica manualmente num slot (mesma aparência de "início selecionado").
4. Trocar `time` na URL para um horário que não existe na grade (ex: `03:33`) e confirmar que a tela abre normalmente, sem seleção e sem erro no console.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/reservar/arena-booking.component.ts
git commit -m "feat(reservar): grade de agendamento aceita horário inicial via ?time="
```

---

### Task 3: Lista de arenas — botão "Reservar" navega em vez de abrir modal

**Files:**
- Modify: `frontend/projects/athlete/src/app/reservar/athlete-reservar.component.ts`
- Modify: `frontend/projects/athlete/src/app/reservar/athlete-reservar.component.html`

**Interfaces:**
- Consumes: `ArenaSearchResult.selectedSlot` (já existente); `toDateInputValue` (helper já existente no arquivo); comportamento de `?time=` da Task 2.
- Produces: `reservarProximoHorario(result: ArenaSearchResult): void`, substituindo `openConfirm`/`closeConfirm`.

- [ ] **Step 1: Trocar o import de Router**

No topo de `athlete-reservar.component.ts`:

```ts
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
```

- [ ] **Step 2: Injetar o Router**

Junto das outras injeções no topo da classe:

```ts
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly firestore = createFirestore();
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
```

- [ ] **Step 3: Remover o signal do modal**

Remover a linha:

```ts
  protected readonly confirmResult = signal<ArenaSearchResult | null>(null);
```

- [ ] **Step 4: Trocar `openConfirm`/`closeConfirm` pela navegação**

Substituir:

```ts
  protected openConfirm(result: ArenaSearchResult): void {
    if (!result.hasAvailability) return;
    this.confirmResult.set(result);
  }

  protected closeConfirm(): void {
    this.confirmResult.set(null);
  }
```

por:

```ts
  protected reservarProximoHorario(result: ArenaSearchResult): void {
    const slot = result.selectedSlot;
    if (!result.hasAvailability || !slot) {
      return;
    }
    void this.router.navigate(['/reservar', result.arena.id, 'agendar'], {
      queryParams: {
        courtId: slot.courtId,
        date: toDateInputValue(this.searchDate()),
        time: slot.startTime,
      },
    });
  }
```

- [ ] **Step 5: Atualizar o botão no template**

Em `athlete-reservar.component.html`, trocar:

```html
                <button
                  type="button"
                  class="rv-btn-primary rv-btn-reservar"
                  [disabled]="!item.result.hasAvailability"
                  (click)="$event.stopPropagation(); openConfirm(item.result)"
                >
                  Reservar
                </button>
```

por:

```html
                <button
                  type="button"
                  class="rv-btn-primary rv-btn-reservar"
                  [disabled]="!item.result.hasAvailability"
                  (click)="$event.stopPropagation(); reservarProximoHorario(item.result)"
                >
                  Reservar
                </button>
```

- [ ] **Step 6: Remover o modal placeholder**

Remover, no mesmo arquivo, o bloco inteiro (do `@if (confirmResult(); as r) {` até o `}` de fechamento correspondente, logo antes do fim do arquivo):

```html
@if (confirmResult(); as r) {
  <div class="rv-modal-backdrop" (click)="closeConfirm()">
    <div class="rv-modal" (click)="$event.stopPropagation()">
      <h3 class="rv-modal-title">Confirmar reserva</h3>
      <p class="rv-modal-arena">{{ r.courtName ? r.arena.name + ' · ' + r.courtName : r.arena.name }}</p>
      <p class="rv-modal-slot">{{ dateChipLabel() }} às {{ r.selectedSlot?.startTime }}</p>
      <p class="rv-modal-price">{{ formatPriceWhole(r.displayPricePerHourReais) }}/h</p>
      <p class="rv-modal-note">
        A confirmação e o pagamento da reserva chegam em breve por aqui. Por enquanto, combine o horário
        diretamente com a arena.
      </p>
      <button type="button" class="rv-btn-primary rv-modal-close" (click)="closeConfirm()">Entendi</button>
    </div>
  </div>
}
```

- [ ] **Step 7: Verificar que não sobrou referência ao modal, e checar o build**

De `frontend/`:

```bash
grep -rn "confirmResult\|openConfirm\|closeConfirm" frontend/projects/athlete/src/app/reservar/athlete-reservar.component.ts frontend/projects/athlete/src/app/reservar/athlete-reservar.component.html
```

Esperado: nenhuma saída.

```bash
ng build athlete --configuration development
```

Esperado: build sem erro.

- [ ] **Step 8: Verificar manualmente no navegador**

1. Abrir `/reservar`, esperar os cards carregarem.
2. Num card com "Próximo: HH:mm" visível (botão "Reservar" habilitado), clicar em "Reservar".
3. Confirmar que a navegação vai para `/reservar/<arenaId>/agendar` com `courtId`, `date` e `time` na URL, e que a grade abre com esse horário já destacado.
4. Confirmar que o modal antigo ("Confirmar reserva" / "combine direto com a arena") não aparece mais em lugar nenhum.
5. Num card sem disponibilidade ("Sem disponibilidade"), confirmar que o botão "Reservar" continua desabilitado.

- [ ] **Step 9: Commit**

```bash
git add frontend/projects/athlete/src/app/reservar/athlete-reservar.component.ts frontend/projects/athlete/src/app/reservar/athlete-reservar.component.html
git commit -m "feat(reservar): botão Reservar da lista vai direto pro próximo horário"
```

---

### Task 4: Perfil da arena — link "Reservar" por quadra ganha `date`/`time`

**Files:**
- Modify: `frontend/projects/athlete/src/app/reservar/arena-detail.component.ts`
- Modify: `frontend/projects/athlete/src/app/reservar/arena-detail.component.html`

**Interfaces:**
- Consumes: `slotsQueryDateKey` de `@nexago/arena-discovery`; `ArenaCourtView.nextSlotLabel` (já existente); comportamento de `?time=` da Task 2.
- Produces: `todayKey: string` (campo do componente, consumido só pelo próprio template).

- [ ] **Step 1: Importar `slotsQueryDateKey`**

No import de `@nexago/arena-discovery`, acrescentar `slotsQueryDateKey` (ordem alfabética, entre `isPastSlot` e `toggleFavoriteArena`):

```ts
import {
  arenaListItemImageUrl,
  arenaSlotIsAvailable,
  fetchArenaById,
  fetchArenaDaySlotsMerged,
  fetchCourts,
  isPastSlot,
  slotsQueryDateKey,
  toggleFavoriteArena,
  watchFavoriteArenaIds,
  type ArenaAmenities,
  type ArenaCourtDoc,
  type ArenaListItem,
} from '@nexago/arena-discovery';
```

- [ ] **Step 2: Adicionar o campo `todayKey`**

Logo depois de `protected readonly googleMapsApiKey = environment.googleMapsApiKey;`:

```ts
  protected readonly todayKey = slotsQueryDateKey(new Date());
```

`nextSlotByCourtId` (calculado em `load()`) já é sempre relativo a hoje — `todayKey` só formata essa mesma data pra usar como query param.

- [ ] **Step 3: Atualizar o link no template**

Em `arena-detail.component.html`, trocar:

```html
                    <a class="ad-btn-primary" [routerLink]="['/reservar', a.id, 'agendar']" [queryParams]="{ courtId: c.id }">Reservar</a>
```

por:

```html
                    <a
                      class="ad-btn-primary"
                      [routerLink]="['/reservar', a.id, 'agendar']"
                      [queryParams]="c.nextSlotLabel ? { courtId: c.id, date: todayKey, time: c.nextSlotLabel } : { courtId: c.id }"
                    >Reservar</a>
```

Quando não há horário livre hoje (`nextSlotLabel` nulo), o link continua exatamente como hoje — só `courtId`.

- [ ] **Step 4: Verificar build**

De `frontend/`:

```bash
ng build athlete --configuration development
```

Esperado: build sem erro.

- [ ] **Step 5: Verificar manualmente no navegador**

1. Abrir o perfil de uma arena com pelo menos uma quadra com "Próx. HH:mm" visível hoje.
2. Clicar em "Reservar" nessa linha de quadra.
3. Confirmar que a navegação vai para `/reservar/<arenaId>/agendar` com `courtId`, `date` (hoje) e `time` (o mesmo "Próx. HH:mm" que aparecia na linha) na URL, e que a grade abre com esse horário já destacado.
4. Se alguma quadra da mesma arena mostrar "Sem horário hoje", clicar em "Reservar" nela e confirmar que a navegação continua só com `courtId` (sem `date`/`time`), igual ao comportamento de antes.

- [ ] **Step 6: Commit**

```bash
git add frontend/projects/athlete/src/app/reservar/arena-detail.component.ts frontend/projects/athlete/src/app/reservar/arena-detail.component.html
git commit -m "feat(reservar): link de quadra no perfil da arena leva o próximo horário"
```

---

## Verificação final

De `frontend/`:

```bash
ng test athlete --watch=false --browsers=ChromeHeadless && ng build athlete --configuration production
```

Esperado: todos os specs verdes e build de produção sem erro.

Fluxos completos a reconferir manualmente depois de todas as tasks:

- Lista de arenas (`/reservar`) → "Reservar" num card disponível → grade com horário destacado.
- Perfil da arena (`/reservar/<arenaId>`) → "Reservar" numa quadra com horário hoje → grade com horário destacado.
- Qualquer um dos dois fluxos, quando não há horário disponível → botão desabilitado (lista) ou navegação sem `date`/`time` (perfil), sem quebrar nada.
