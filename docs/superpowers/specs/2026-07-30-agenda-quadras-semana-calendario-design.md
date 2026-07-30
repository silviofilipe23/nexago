# Agenda de quadras: visão "Semana" de verdade + calendário para navegar entre datas

**Data:** 2026-07-30
**Escopo:** `frontend/projects/arena` — tela `/painel/agenda`
**Componentes:** `panel-agenda.component.ts`, `agenda-grid.component.ts` (novo irmão
`agenda-week-grid.component.ts`), `schedule-repository.ts`, `arena-schedule-grouping.ts`,
`agenda-grid-math.ts`, `date-range-picker-math.ts` (reaproveitado), novo `date-picker.component.ts`

## Problema

A tela "Agenda de quadras" tem um toggle "Dia"/"Semana" (`ar-chart-tabs`,
`panel-agenda.component.ts:88`) que atualiza um signal `view()` — mas esse valor **não é
lido em nenhum outro lugar do componente**. O próprio comentário de topo do arquivo já
documentava isso: `"Semana" continua só cosmético` (`panel-agenda.component.ts:59-63`). O
grid (`AgendaGridComponent`) só sabe renderizar um único dia (uma coluna por quadra,
blocos posicionados por minuto do dia) — não existe layout de semana em lugar nenhum do
projeto.

Além disso, a única forma de mudar a data exibida é "Hoje" + seta anterior/próxima
(`goToday`/`shiftDay`, `panel-agenda.component.ts:586-594`) — não dá pra pular direto para
uma data distante sem clicar dezenas de vezes.

## Objetivo

1. Adicionar um calendário (popover de mês) para selecionar qualquer data diretamente,
   mantendo os botões "Hoje"/seta como estão (atalhos rápidos continuam úteis).
2. Fazer o toggle "Semana" funcionar de verdade: mostrar uma grade de quadras × horário
   para os 7 dias da semana (segunda a domingo) que contém a data selecionada, com o
   mesmo vocabulário visual de blocos (disponível/confirmada/pendente/bloqueado/manutenção)
   já usado na visão de dia.

## Design

### 1. Calendário de data única (`ui/date-picker.component.ts`)

Já existe um calendário reutilizável, `DateRangePickerComponent`
(`ui/date-range-picker.component.ts`), usado hoje só para selecionar início/término de
horários fixos (range). Ele não serve puro para data única — carrega estado de range
(`draftStart`/`draftEnd`/`allowOpenEnd`) que não faz sentido aqui.

Em vez de generalizar esse componente (misturaria duas responsabilidades num único
componente), extraio a matemática pura de calendário — que já é pura e testável — de
`date-range-picker-math.ts` (`buildMonthGrid`, `shiftMonth`, `formatDateKeyPtBr`,
`MONTH_LABELS_PT`) e crio um componente novo e enxuto, seguindo o mesmo padrão visual:

```ts
@Component({ selector: 'ar-date-picker', ... })
export class DatePickerComponent {
  readonly selected = input.required<string | null>(); // dateKey YYYY-MM-DD
  readonly dateChange = output<string>(); // dateKey YYYY-MM-DD

  protected readonly open = signal(false);
  protected readonly viewYear = signal(new Date().getFullYear());
  protected readonly viewMonth = signal(new Date().getMonth() + 1);
  protected readonly grid = computed(() => buildMonthGrid(this.viewYear(), this.viewMonth()));
  // toggle()/close()/onDocumentClick()/changeMonth() iguais ao DateRangePickerComponent
  protected selectDay(dateKey: string): void {
    this.dateChange.emit(dateKey);
    this.close();
  }
}
```

Template: mesmo botão-gatilho (`.trigger` com ícone `calendar`) e mesmo popover de grid
de mês do componente de range, só que sem footer "Cancelar/Aplicar" (aplica na hora, ao
clicar no dia) e sem checkbox de "sem data de término". Um único dia fica destacado
(`.selected`) em vez de start/end/in-range.

No header da agenda (`panel-agenda.component.ts:80-93`), o botão de calendário entra entre
as setas e o toggle Dia/Semana:

```html
<button type="button" class="ar-ghost-btn nav-btn" (click)="goToday()">Hoje</button>
<button type="button" class="ar-ghost-btn nav-btn icon-btn" (click)="shiftDay(-1)">‹</button>
<ar-date-picker [selected]="selectedDateKey()" (dateChange)="onDateKeySelected($event)" />
<button type="button" class="ar-ghost-btn nav-btn icon-btn" (click)="shiftDay(1)">›</button>
<ar-chart-tabs [tabs]="views" [active]="view()" (change)="view.set($any($event))" />
```

`onDateKeySelected(dateKey: string)` parseia `YYYY-MM-DD` em **componentes locais**
(`new Date(y, m - 1, d)`), nunca `new Date(dateKey)`/`Date.parse` — o parse ISO do
`Date` nativo interpreta a string como UTC-meia-noite, que em horário de Brasília vira o
dia anterior. Essa é a mesma armadilha já documentada e corrigida uma vez neste projeto
para `arenaSlots.dateKey`; o calendário novo tem que nascer seguindo a mesma regra que
`dateKeyOf`/`shiftDay` já seguem.

### 2. Dados da semana (`schedule-repository.ts`, `arena-schedule-grouping.ts`)

`watchArenaDaySlots` já busca **todos** os slots da arena num único listener
(`where('arenaId', '==', arenaId)`, sem filtro de data — de propósito, pra evitar índice
composto) e filtra por `dateKey` em memória. Para a semana, adiciono uma função irmã que
faz o mesmo para os 7 dias de uma vez — **sem nenhuma leitura extra do Firestore**, só
mais filtragem/geração de slots virtuais em memória:

```ts
export function watchArenaWeekSlots(
  db: Firestore,
  arenaId: string,
  weekDates: readonly { date: Date; dateKey: string }[],
  courts: readonly { id: string; data: Record<string, unknown> }[],
  onChange: (slots: ArenaSlot[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenaSlots'), where('arenaId', '==', arenaId)),
    (snap) => {
      const allPersisted = snap.docs.map(arenaSlotFromDoc);
      const merged: ArenaSlot[] = [];
      for (const { date, dateKey } of weekDates) {
        for (const court of courts) {
          const persisted = allPersisted.filter((s) => s.dateKey === dateKey && s.courtId.toLowerCase() === court.id.toLowerCase());
          const virtual = buildVirtualSlots(arenaId, court.id, court.data, date, dateKey);
          merged.push(...mergeSlots(persisted, virtual));
        }
      }
      merged.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startTime.localeCompare(b.startTime) || a.courtId.localeCompare(b.courtId));
      onChange(merged);
    },
    () => onChange([]),
  );
}
```

`watchArenaDaySlots` continua existindo como está (a versão de 1 dia é mais barata pro
caso comum de ficar na visão Dia) — não vira um caso especial de `watchArenaWeekSlots`
com array de 1 elemento, pra não acoplar a visão de dia à de semana.

`applyBookingsOverlay(slots, bookings, dateKey)` hoje recebe um `dateKey` fixo porque só
existe um dia na tela. Cada `ArenaSlot` já carrega seu próprio `dateKey`, então generalizo
para casar por slot em vez de um único parâmetro externo:

```ts
export function applyBookingsOverlay(slots: readonly ArenaSlot[], bookings: readonly ArenaBooking[]): ArenaSlot[] {
  if (bookings.length === 0) return [...slots];
  const activeBookings = bookings.filter(bookingIsActive);
  if (activeBookings.length === 0) return [...slots];
  return slots.map((slot) => {
    if (slot.status === 'booked' || slot.status === 'blocked') return slot;
    for (const b of activeBookings) {
      if (b.dateKey !== slot.dateKey) continue;
      const bookingCourt = b.courtId.trim();
      if (bookingCourt && bookingCourt.toLowerCase() !== slot.courtId.trim().toLowerCase()) continue;
      if (!slotOverlapsBooking(slot, b.startTime, b.endTime)) continue;
      return { ...slot, status: 'booked' as const, bookingId: b.id, bookingAthleteId: b.athleteId || null };
    }
    return slot;
  });
}
```

Funciona igual para o dia (todos os slots compartilham o mesmo `dateKey`) e para a semana
(slots espalhados por 7 `dateKey`s diferentes), sem precisar de query adicional —
`watchBookingsForArena` já busca todas as reservas da arena, sem filtro de data
(`bookings-repository.ts:33-38`). Chamador em `panel-agenda.component.ts` perde o segundo
argumento.

### 3. Datas da semana (`agenda/agenda-week-math.ts`, novo)

Módulo pequeno e puro, mesma pasta de `arena-schedule-grouping.ts`:

```ts
export interface WeekDay {
  date: Date;
  dateKey: string;
  isToday: boolean;
}

/** Segunda a domingo (convenção ISO já usada em ARENA_WEEKDAYS) contendo `date`. */
export function weekDatesFor(date: Date): WeekDay[] {
  const jsDay = date.getDay(); // 0=domingo…6=sábado
  const isoWeekday = jsDay === 0 ? 7 : jsDay; // 1=segunda…7=domingo
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - (isoWeekday - 1));
  const todayKey = dateKeyOf(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const dateKey = dateKeyOf(d);
    return { date: d, dateKey, isToday: dateKey === todayKey };
  });
}
```

Tudo em componentes locais de `Date` (`getFullYear`/`getMonth`/`getDate`), igual a
`shiftDay` — nunca UTC — pela mesma razão do item 1.

### 4. Grade semanal (`ui/agenda-week-grid.component.ts`, novo)

Componente irmão de `AgendaGridComponent`, reaproveitando `agenda-grid-math.ts` (mesma
janela 07:00–22:00, mesma altura de linha) e as mesmas classes de tom (`tone-available`,
`tone-confirmada` etc. — CSS puramente compartilhado, sem duplicar).

```ts
export interface AgendaWeekBlock extends AgendaBlock {
  dateKey: string;
}

@Component({ selector: 'ar-agenda-week-grid', ... })
export class AgendaWeekGridComponent {
  readonly weekDays = input.required<WeekDay[]>();
  readonly courts = input.required<AgendaCourt[]>();
  readonly blocks = input.required<AgendaWeekBlock[]>();
  readonly blockClick = output<string>();
  readonly dayHeaderClick = output<string>(); // dateKey

  // rowMarks/gridHeight/nowOffset: idênticos ao AgendaGridComponent (mesma import de agenda-grid-math).
  protected readonly positionedByDayAndCourt = computed(() => {
    // chave `${dateKey}:${courtId}` em vez de só `courtId`
  });
}
```

Layout: gutter de horário fixo à esquerda (`position: sticky; left: 0`), e um `<div
class="days">` com `overflow-x: auto` contendo 7 grupos-de-dia lado a lado. Cada grupo:

- cabeçalho clicável (`(click)="dayHeaderClick.emit(day.dateKey)"`) mostrando abreviação
  do dia da semana + `DD/MM` (`Intl.DateTimeFormat('pt-BR', { weekday: 'short' })`,
  mesmo padrão já usado em `subtitleLabel()`), destacado se `day.isToday`;
- sub-cabeçalho por quadra (nome), igual ao `.court-head` de hoje;
- uma coluna por quadra dentro do grupo, com os blocos daquele `(dateKey, courtId)`.

Quando só uma quadra está visível (filtro de quadra ativo), cada grupo tem 1 coluna só —
vira uma semana limpa de 7 colunas. Com "Todas as quadras", cada grupo tem N sub-colunas
— mais larga, com separador visual mais forte entre grupos de dia (mesma decisão já
aceita: grade completa é mais trabalho de UI que um resumo, mas mais fiel ao pedido).

### 5. Ligação em `panel-agenda.component.ts`

Novo signal `protected readonly weekSlots = signal<ArenaSlot[]>([]);`, irmão do `slots()`
existente — guarda o resultado achatado de `watchArenaWeekSlots` (todos os dias juntos,
cada `ArenaSlot` já carrega seu `dateKey`).

```ts
protected readonly weekDays = computed<WeekDay[]>(() => weekDatesFor(this.selectedDate()));

protected readonly weekSlotsWithOverlay = computed(() => applyBookingsOverlay(this.weekSlots(), this.bookings()));
protected readonly filteredWeekSlots = computed(() => applyScheduleFilters(this.weekSlotsWithOverlay(), this.statusFilter(), this.courtFilter()));
protected readonly agendaWeekBlocks = computed<AgendaWeekBlock[]>(() => /* mesmo mapeamento de status/cliente que agendaBlocks(), + dateKey: s.dateKey */);
```

O mapeamento bloco→visual (`slotStatusForBlock`/`clientLabelFor`, hoje só usados dentro de
`agendaBlocks`/`listRows`) é reaproveitado como está — não precisa duplicar, só passar a
alimentar `agendaWeekBlocks` também.

Só um listener de slots ativo por vez. O `effect()` de slots (`panel-agenda.component.ts:547-567`)
passa a decidir qual assinar conforme `view()`:

```ts
effect(() => {
  const arenaId = this.arenaContext.arenaId();
  const view = this.view();
  const rawLoaded = this.courtsRawLoaded();
  const courts = this.courtsRaw();
  this.unsubscribeSlots?.();
  this.unsubscribeSlots = null;
  if (!arenaId || !rawLoaded) return;
  if (courts.length === 0) { this.slots.set([]); this.weekSlots.set([]); this.loading.set(false); return; }

  const db = arenaFirestore();
  if (view === 'Dia') {
    const dateKey = this.selectedDateKey();
    const date = this.selectedDate();
    this.unsubscribeSlots = watchArenaDaySlots(db, arenaId, date, dateKey, courts, (list) => { this.slots.set(list); this.loading.set(false); });
  } else {
    this.unsubscribeSlots = watchArenaWeekSlots(db, arenaId, this.weekDays(), courts, (list) => { this.weekSlots.set(list); this.loading.set(false); });
  }
});
```

Trocar de Dia→Semana (ou vice-versa) cancela o listener anterior e assina o novo — nunca
os dois ligados ao mesmo tempo, então não gera/renderiza 7× os dados à toa quando o
usuário só está olhando 1 dia.

Template (`panel-agenda.component.ts:128`):

```html
@if (view() === 'Dia') {
  <ar-agenda-grid [courts]="agendaCourts()" [blocks]="agendaBlocks()" (blockClick)="onBlockClick($event)" />
} @else {
  <ar-agenda-week-grid
    [weekDays]="weekDays()"
    [courts]="agendaCourts()"
    [blocks]="agendaWeekBlocks()"
    (blockClick)="onBlockClick($event)"
    (dayHeaderClick)="onDateKeySelected($event)"
  />
}
```

O card "Horários do dia" ao lado (`panel-agenda.component.ts:132-146`) continua mostrando
só `selectedDate()` mesmo em modo Semana — é o painel de detalhe do dia em foco, igual a
como calendários convencionais mantêm um painel de dia ao lado de uma grade de semana.
Clicar no cabeçalho de um dia na grade semanal (`dayHeaderClick`) atualiza
`selectedDate()`, então esse painel (e a visão Dia, se o usuário voltar pra ela) segue o
dia clicado.

`subtitleLabel()` ganha um branch para semana: intervalo `DD/MM–DD/MM` +
`scheduleDayStats` agregado sobre `filteredWeekSlots()` em vez de `filteredSlots()` (a
função já é genérica — soma disponível/reservado/bloqueado de qualquer lista de slots,
não precisa mudar).

## Fora de escopo

- Bloquear/desbloquear direto a partir da grade semanal com um modal diferente — reusa os
  mesmos modais de hoje (`blockTarget`/`unblockTarget`), sem mudança de UX de bloqueio.
- Criar reserva pelo gestor (já fora de escopo hoje — "Nova reserva" continua
  `disabled`).
- Arrastar para reagendar, redimensionar bloco, drag-and-drop entre dias/quadras.
- Mudar a convenção de início de semana por locale/preferência do usuário — fixo
  segunda→domingo, mesma convenção de `ARENA_WEEKDAYS`.
- App Flutter (`ArenaSchedulePage`) — não tem toggle Dia/Semana hoje e este spec não
  adiciona um; mudança só no painel web.
- Paginação/scroll virtual para arenas com muitas quadras na grade semanal — se a lista
  ficar muito larga, o usuário rola horizontalmente (mesmo compromisso assumido ao optar
  por grade completa em vez de resumo).

## Testes

- `agenda-week-math.spec.ts` (novo): `weekDatesFor` retornando segunda→domingo corretos
  para uma data no meio da semana, uma que já é segunda, uma que já é domingo, e virada
  de mês/ano; `isToday` correto.
- `arena-schedule-grouping.spec.ts`: atualizar os casos existentes de
  `applyBookingsOverlay` para a nova assinatura (sem `dateKey`); adicionar caso com slots
  de dois `dateKey`s diferentes na mesma chamada, confirmando que cada slot só recebe
  overlay de reservas do seu próprio dia.
- `schedule-repository` não tem testes unitários hoje (depende de Firestore real) — sem
  mudança nesse padrão; `watchArenaWeekSlots` verificado manualmente.
- Verificação manual (`ng serve` do projeto `arena`, tela `/painel/agenda`): selecionar
  data pelo calendário novo; alternar Dia/Semana e confirmar que a grade muda de fato;
  bloquear/desbloquear um horário a partir da grade semanal; clicar num cabeçalho de dia
  na semana e confirmar que volta pra visão Dia (ou atualiza o painel lateral) no dia
  certo; testar com filtro de "Todas as quadras" e com uma quadra específica selecionada.
