# Botão "Reservar" leva direto ao próximo horário

**Data:** 2026-07-30
**Escopo:** `frontend/projects/athlete` — telas `/reservar` (lista) e `/reservar/:arenaId` (perfil da arena)
**Componentes:** `src/app/reservar/arena-booking.component.ts`, `athlete-reservar.component.{ts,html}`,
`arena-detail.component.{ts,html}`

## Problema

Duas telas já calculam e exibem o "próximo horário disponível" de uma arena/quadra, mas
nenhum dos dois botões "Reservar" usa esse cálculo para poupar um passo do atleta:

- **Lista de arenas** (`athlete-reservar.component.html:359-366`): o card mostra
  "Próximo: HH:mm" (`ArenaSearchResult.selectedSlot`), mas o clique em "Reservar"
  (`openConfirm`) só abre um modal placeholder ("por enquanto combine direto com a
  arena") — não navega para lugar nenhum.
- **Perfil da arena** (`arena-detail.component.html:130-140`): cada linha de quadra
  mostra "Próx. HH:mm" (`nextSlotByCourtId`), mas o link "Reservar" só leva `courtId`
  como query param — o atleta ainda precisa reabrir a grade e clicar no horário que
  acabou de ver na tela anterior.

A tela real de agendamento, `arena-booking.component.ts` (rota `reservar/:arenaId/agendar`),
já aceita `courtId` e `date` via query param, mas não tem como receber um horário inicial:
o atleta sempre escolhe o slot manualmente na grade (`selectStartSlot`).

## Objetivo

Ao clicar em "Reservar" nesses dois lugares, o atleta cai na grade de agendamento já com
o próximo horário disponível destacado como selecionado — sem precisar procurá-lo de novo
na grade. Ele continua podendo trocar de horário, quadra, data ou duração antes de
prosseguir para o pagamento; nada é reservado automaticamente.

## Design

### 1. `arena-booking.component.ts` — aceitar `time` na URL

Novo query param opcional `time` (`HH:mm`), lido em `load()` junto com o `courtId` já
existente. A busca do slot correspondente vira uma função pura nova em
`booking-dates.ts`, seguindo o padrão já usado nesse arquivo para lógica testável fora do
componente:

```ts
export function findSlotByTime(
  slots: ArenaSlot[],
  courtId: string,
  time: string | null,
  today: Date,
): ArenaSlot | null
```

Filtra por `courtId`, `startTime === time`, `arenaSlotIsAvailable` e `!isPastSlot`;
retorna `null` se `time` for `null` ou nada bater. Depois que `slotsByDateKey` é
preenchido e a quadra inicial (`selectedCourtId`) é resolvida, `load()` chama essa função
com os slots do dia selecionado e, se vier um resultado, `selectedStartSlot.set(slot)` —
a grade já abre com esse horário destacado (mesmo visual de quando o atleta clica
manualmente, `isSelectedStart`).

Se não achar (horário inválido, ou reservado por outra pessoa entre o clique e o
carregamento da tela), simplesmente não seleciona nada — mesmo comportamento de hoje
quando não há `time` na URL. Não é erro, não bloqueia a tela.

`?time=` sozinho, sem `courtId`, não faz sentido no domínio atual — os dois outros
componentes sempre mandam os dois juntos — então não há tratamento especial para esse
caso.

### 2. `athlete-reservar.component.ts` — botão "Reservar" da lista navega

`openConfirm(result)` é substituído por uma navegação:

```ts
protected reservarProximoHorario(result: ArenaSearchResult): void {
  const slot = result.selectedSlot;
  if (!result.hasAvailability || !slot) return;
  void this.router.navigate(['/reservar', result.arena.id, 'agendar'], {
    queryParams: {
      courtId: slot.courtId,
      date: toDateInputValue(this.searchDate()),
      time: slot.startTime,
    },
  });
}
```

`toDateInputValue` já existe no arquivo e produz `YYYY-MM-DD`, o mesmo formato que
`clampPickedDate` espera em `arena-booking.component.ts`. O botão já fica `[disabled]`
quando `!hasAvailability`, então `selectedSlot` nunca é `null` num clique real.

O modal de confirmação placeholder deixa de ser alcançável e é removido: o signal
`confirmResult`, os métodos `openConfirm`/`closeConfirm` e o bloco `@if (confirmResult(); ...)`
no template (`athlete-reservar.component.html:376-390`).

### 3. `arena-detail.component.html` — link "Reservar" por quadra ganha `date`/`time`

Linha 140, hoje:

```html
<a class="ad-btn-primary" [routerLink]="['/reservar', a.id, 'agendar']" [queryParams]="{ courtId: c.id }">Reservar</a>
```

Passa a incluir `date` (sempre hoje, já que `nextSlotByCourtId` só cobre o dia atual —
`arena-detail.component.ts:268-277`) e `time` (o próprio `c.nextSlotLabel` já exibido
como "Próx. HH:mm") quando existir:

```html
<a
  class="ad-btn-primary"
  [routerLink]="['/reservar', a.id, 'agendar']"
  [queryParams]="c.nextSlotLabel ? { courtId: c.id, date: todayKey, time: c.nextSlotLabel } : { courtId: c.id }"
>Reservar</a>
```

`todayKey` é um novo campo computado no componente (`slotsQueryDateKey(new Date())`),
para não formatar a data inline no template. Quando não há horário hoje
(`nextSlotLabel` nulo), o link continua exatamente como é hoje — sem `date`/`time` — e o
atleta escolhe manualmente na tela seguinte.

## Fora de escopo

- CTA genérico "Reservar quadra" da lateral do perfil da arena
  (`arena-detail.component.html:185-187`) — não é por quadra, não tem `courtId` para
  oferecer; segue navegando sem pré-seleção.
- Atalhos genéricos para `/reservar` sem contexto de arena (painel, bottom nav, empty
  state da agenda) — não têm quadra/horário calculado, nada a pré-selecionar.
- App Flutter — mudança só no portal web do atleta.
- Qualquer alteração no cálculo de "próximo horário" em si (`arena-search.ts`,
  `nextSlotByCourtId`) — ambos já existem e já são usados como estão.

## Testes

`booking-dates.spec.ts` ganha casos para `findSlotByTime`: horário exato disponível,
horário inexistente na lista, horário de outra quadra (ignorado), horário disponível mas
passado (`isPastSlot`), e `time: null`. Roda com `ng test athlete`.

Complementar com verificação manual (`ng serve` do projeto `athlete`) nos dois fluxos:
lista → grade com horário destacado, e perfil da arena → grade com horário destacado.
