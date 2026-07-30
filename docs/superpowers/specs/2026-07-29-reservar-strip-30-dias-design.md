# Seletor de datas de 30 dias na tela de agendamento

**Data:** 2026-07-29
**Escopo:** `frontend/projects/athlete` — tela `/reservar/:arenaId/agendar`
**Componente:** `src/app/reservar/arena-booking.component.*`

## Problema

O card "Data" da tela de agendamento mostra apenas 7 chips, fixos em hoje + 6 dias
(`WEEK_LENGTH = 7`). O atleta não consegue reservar para daqui a duas semanas sem
esperar o strip "andar" com o passar dos dias.

Além do limite de alcance, a forma como esses 7 dias são carregados não escala. O
`load()` chama `fetchArenaDaySlotsMerged` uma vez por data, e cada chamada faz 4 idas
ao Firestore:

- `fetchCourts(arenaId)`
- `fetchArenaSlotsByArenaId(arenaId)` — todos os `arenaSlots` da arena, **sem filtro de data**
- `getDoc(arenas/{arenaId})`
- `fetchActivePromotions(arenaId)`

São **30 round-trips** por abertura de tela (1 doc da arena + 1 de quadras no componente,
mais 7 × 4 na busca por dia) para dados que, com exceção do cálculo local de slots
virtuais, são idênticos entre as datas. Estender isso ingenuamente para 30 dias custaria
~124 round-trips por abertura.

## Objetivo

1. Strip de 30 dias com rolagem horizontal, no lugar dos 7 atuais.
2. Date picker para o atleta pular direto para uma data, incluindo datas além do strip.
3. Não piorar — e de fato reduzir — o custo de carregamento da tela.

## Restrição de domínio: horizonte de 34 dias

`RECURRING_HORIZON_DAYS` e `CLUB_HORIZON_DAYS` valem **35** (`functions/src/arena-recurring-booking.ts:21`,
`functions/src/arena-club-constants.ts:12`). O materializador só cria as ocorrências de
mensalistas e clubinho dentro desse horizonte.

Além dele, os slots ocupados por séries recorrentes ainda não existem no Firestore: o dia
apareceria 100% livre e o atleta poderia reservar em cima de uma série já contratada.
`functions/src/arena-booking-create.ts` valida só o formato do `dateKey` e **não impõe
horizonte nenhum**, então o teto do cliente é o único portão do sistema.

**O horizonte do backend é uma janela rolante, não um limite estático.**
`arena-recurring-materializer.ts` roda `every day 03:00` em `America/Sao_Paulo` e
materializa até `todayKey(SP) + 35`; o de clubinho faz o mesmo às 03:10. O cliente calcula
o teto a partir da data **local do navegador**. Entre 00:00 e 03:00 SP — ou o dia inteiro,
para qualquer device a leste de UTC-3 — o cliente já virou para `D+1` enquanto a última
execução foi em `D`, e ofereceria `D+36` contra `D+35` materializado.

**Decisão:** o teto de seleção é hoje+**34**, ou seja o horizonte do backend menos um dia
de folga de rollover. Com isso a invariante vira `dataDoCliente <= últimaExecuçãoSP + 1`,
que tolera um cliente até um dia inteiro à frente de São Paulo. Custa um chip dos 36.

Se `RECURRING_HORIZON_DAYS` mudar, `MAX_HORIZON_DAYS` precisa acompanhar — o vínculo é
só este texto e o comentário em `booking-dates.ts`, nada no código liga os dois.

## Design

### 1. Busca por faixa em vez de por dia

Nova função exportada em `frontend/shared/arena-discovery/slots-repository.ts`:

```ts
export async function fetchArenaRangeSlotsMerged(
  db: Firestore,
  arenaId: string,
  startDate: Date,
  days: number,
): Promise<Record<string, ArenaSlot[]>>
```

Busca quadras, `arenaSlots`, doc da arena e promoções **uma única vez**, e então roda
`extractPersisted` + `buildVirtualSlots` + `mergeSlots` localmente para cada dia da faixa.
Retorna um mapa `dateKey → ArenaSlot[]`, no mesmo formato que o componente já guarda em
`slotsByDateKey`.

Como `fetchArenaSlotsByArenaId` já traz todos os slots da arena sem filtro de data,
cobrir 35 dias custa as mesmas idas ao Firestore que cobrir 1.

**Retrocompatibilidade:** `fetchArenaDaySlotsMerged` continua exportada com a mesma
assinatura e o mesmo retorno (`Promise<ArenaSlot[]>`), reimplementada como um wrapper de
`days: 1`. `arena-detail.component.ts` e `arena-payment.component.ts` seguem sem alteração.

**Efeito:** a tela sai de 30 round-trips por abertura, cobrindo 7 dias, para 6 cobrindo 35.
São 6 e não 4 porque `fetchCourts` e o doc da arena continuam sendo buscados duas vezes —
uma no componente, outra dentro da busca por faixa. Vale como follow-up: passar os dados
já carregados para a função derruba para 4. O ganho no termo dominante — o scan completo
de `arenaSlots` — é de 7x.

### 2. Strip de datas

- `WEEK_LENGTH = 7` → `STRIP_DAYS = 30` (contagem de chips) e `MAX_HORIZON_DAYS = 34`
  (offset máximo em dias). São grandezas diferentes: o strip pode chegar a 35 chips.
- `weekDates` → `stripDates`, computed puro sem signal de estado adicional:

  ```
  tamanho = min(MAX_HORIZON_DAYS + 1, max(STRIP_DAYS, offsetDias(hoje, selectedDate) + 1))
  ```

  Normalmente 30 chips. Se a data selecionada cair entre o offset 30 e o 34 — via picker
  ou via `?date=` na URL — o strip estende até ela, no máximo 35 chips.

- `.bk-date-row` já tem `overflow-x: auto`; a rolagem horizontal funciona hoje. Ganha
  `scroll-snap-type: x proximity` nos chips e, no desktop, máscara de fade nas bordas
  para sinalizar que há mais conteúdo.

- O `load()` busca a faixa completa de `MAX_HORIZON_DAYS + 1` dias de uma vez. Como o custo é o
  mesmo de um dia, não há carregamento sob demanda: qualquer data selecionável já tem
  slots e bolinha de disponibilidade em memória.

### 3. Date picker

Segue o padrão nativo já usado em `src/app/reservar/athlete-reservar.component.html:33`:
um `<label>` com ícone de calendário envolvendo um `<input type="date">` invisível.
Sem biblioteca de calendário.

- Posição: no cabeçalho do card "Data", alinhado à direita do título — alcançável sem
  rolar os 30 chips.
- `min` = hoje (`YYYY-MM-DD`), `max` = hoje+34 (ver a restrição de domínio acima).
- O handler valida e descarta datas fora da faixa, porque o input nativo aceita digitação
  e os atributos `min`/`max` não impedem um valor colado ou digitado.
- Ao escolher: a data vira `selectedDate`, o strip estende se necessário e o chip
  correspondente rola até o centro (`scrollIntoView({ block: 'nearest', inline: 'center' })`).
  O mesmo scroll acontece na carga inicial quando a URL traz `?date=`.

### 4. Chip com indicação de mês

Com 30+ chips o strip atravessa a virada de mês, e `31 / 1 / 2` fica ambíguo.

O chip mantém as três linhas atuais (dia da semana / número / bolinha). O mês entra
**inline ao lado do número do dia**, em mono 9px, em dois casos: no primeiro chip do
strip e em todo chip de dia 1º. Exemplo: `QUI` / `1 AGO` / `•`.

Inline, e não como quarta linha, para que a bolinha de disponibilidade não desalinhe
entre chips com e sem mês. A largura do chip vai de 68px para 72px para acomodar `29 JUL`.

### 5. Disponibilidade

`dateAvailability` passa a iterar sobre `stripDates` (até 35 chips) em vez dos 7 atuais.
A regra não muda: `none` quando não há slot disponível, `low` quando há até 4, `high`
acima disso. Slots passados continuam filtrados por `isPastSlot`.

### 6. Lógica pura e testes

O projeto testa lógica pura em specs isolados (`src/app/data/*.spec.ts`), não componentes.
A aritmética de datas sai do componente para `src/app/reservar/booking-dates.ts`:

- `buildDateStrip(today, selectedDate, stripDays, maxHorizonDays): Date[]`
- `clampPickedDate(rawValue, today, maxHorizonDays): Date | null`
- `shouldShowMonth(date, index): boolean`

`src/app/reservar/booking-dates.spec.ts` cobre:

- strip padrão de 30 dias a partir de hoje;
- strip estendido ao selecionar o offset 33;
- teto respeitado: seleção no offset 34 não estende além de 35 chips;
- data fora da faixa (ontem, offset 35) rejeitada pelo clamp;
- virada de mês: mês exibido no primeiro chip e em todo dia 1º.

Roda com `ng test athlete`.

## Fora de escopo

- `arena-detail.component.ts` e `arena-payment.component.ts` — só consomem
  `fetchArenaDaySlotsMerged`, que mantém assinatura e comportamento.
- App Flutter — a mudança é só na tela web de agendamento.
- Painel da arena — nenhuma alteração em escrita de slots ou séries recorrentes.
- Aumentar o horizonte de materialização do backend. Se `RECURRING_HORIZON_DAYS` mudar,
  `MAX_HORIZON_DAYS` acompanha, mas isso é uma decisão de produto separada.

## Riscos

- **Custo de CPU no cliente.** Montar 35 dias × N quadras × ~14 slots gera alguns milhares
  de objetos na carga. É computação local, uma vez por abertura de tela, e substitui 24
  round-trips de rede — a troca é favorável, mas vale medir numa arena com muitas quadras.
- **`arenaSlots` sem filtro de data.** A query já traz todos os slots persistidos da arena
  hoje; a mudança não piora isso, mas o crescimento dessa coleção é uma dívida existente
  que eventualmente vai exigir filtro por faixa de `dateKey`.
