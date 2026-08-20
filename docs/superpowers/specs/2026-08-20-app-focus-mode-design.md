# Modo Focus no app + "todas as partidas do dia"

Data: 2026-08-20
Branch: `claude/focus-mode-status-c12e5a`
Antecedente: `2026-08-12-athlete-focus-mode-design.md` (o Focus no portal do atleta)

## O que esta entrega faz

1. Porta o **Modo Focus** do portal do atleta para o app Flutter, com paridade de quatro seções.
2. Muda a regra de **"partidas do dia"** nas duas superfícies: a lista deixa de exigir horário
   agendado.

As duas coisas vêm juntas porque a mudança de regra altera o dado que a seção "Agora" desenha —
entregar o Focus com a regra antiga seria portar um comportamento que já está sendo aposentado.

## Parte 1 — A regra do dia

### Hoje

Web `myDayTimeline` (`tournament-live.selectors.ts:99`) e app `myTournamentDayTimeline`
(`tournament_detail_tabs_logic.dart:103`) são o mesmo porte, e as duas filtram
`scheduleTime != null`. Partida sem horário é invisível. O empty state do app admite isso ao
atleta: *"os jogos de hoje aparecem aqui assim que forem programados"*.

Uma partida sem `scheduleTime` não tem dia nenhum gravado: `dayKey` é escrito junto com o horário
e apagado junto no desagendamento (`functions/src/organizer-match-ops.ts:487`). Então "de hoje"
precisa de uma âncora nova.

### A regra nova

Uma partida é do dia quando:

1. tem `scheduleTime` no dia de referência — **regra atual, intacta**; ou
2. tem `matchStartedAt` no dia de referência — jogo que a mesa começou naquele dia; ou
3. não tem **nenhuma** das duas âncoras, **o torneio está rolando hoje** (hoje entre `startDate` e
   `endDate`), e a partida não está encerrada nem cancelada.

As âncoras 1 e 2 valem de forma independente, não em cascata: partida agendada para ontem que só
entrou em quadra hoje pertence a hoje também. Torneio que atrasa e empurra jogo para o dia
seguinte é rotina, e a versão em cascata (`matchStartedAt` só quando não há `scheduleTime`)
deixaria esse jogo preso no dia em que ele não aconteceu.

Ter âncora de outro dia é resposta definitiva: quem tem `scheduleTime` ou `matchStartedAt` fora do
dia de referência não cai no caso 3.

O caso 2 não é refinamento: sem ele, uma partida jogada hoje direto na mesa, sem nunca ter sido
agendada, some da própria timeline do atleta que a jogou — o caso 3 a exclui por estar encerrada,
e o caso 1 nunca a pegou.

O caso 3 exige "não encerrada nem cancelada" porque, sem horário e sem início, não existe
evidência nenhuma de que ela pertence a hoje — só a janela do torneio. Afirmar resultado de
partida sem dia conhecido é pior que omitir.

### Assinatura

Parâmetro nomeado opcional, com o default preservando o comportamento atual — os chamadores e os
quatro testes existentes seguem compilando sem edição:

```dart
List<TournamentMatch> myTournamentDayTimeline(
  List<TournamentMatch> matches,
  Set<String> myTeamIds,
  DateTime reference, {
  bool tournamentRunningToday = false,
})
```

```ts
export function myDayTimeline(
  matches: readonly TournamentMatch[],
  myTeamIds: ReadonlySet<string>,
  reference: Date,
  tournamentRunningToday = false,
): TournamentMatch[]
```

Quem passa `true`: no app, `tournamentIsEventToday(tournament, now)`, que já existe no mesmo
arquivo; na web, `eventDayOf(t?.startAt, t?.endAt, now) != null` dentro de
`TournamentLiveStore.dayTimeline`.

### Ordenação

Não muda. `byScheduleTime` (web) e `_byScheduleTime` (app) já mandam nulo para o fim e desempatam
por `matchNumber`. Na UI as sem horário viram um bloco próprio — **"SEM HORÁRIO DEFINIDO"** —
depois das agendadas.

### Consequências deliberadas

- **Muda o que acende a aba.** `hasMyMatchToday` (web) e a aba "Hoje" do app
  (`tournament_detail_page.dart:243`) derivam de `dayTimeline`. Quem só tem partida sem horário
  passa a acender. É o efeito desejado, mas é mudança de visibilidade, não só de listagem.
- **O empty state do app é reescrito.** *"assim que forem programados"* deixa de ser verdade.
- **O gatilho da entrada automática na web NÃO muda.** `isOpenToday`/`focusDayTargetOf`
  (`focus/focus-day.ts`) seguem exigindo `scheduleTime`. O modelo que o `FocusDayService` lê
  (`ArenaMatch`) não carrega `matchStartedAt` nem as datas do torneio, e buscar os docs de torneio
  ali custa N leituras a mais para decidir um redirect. **As superfícies divergem nesse ponto e
  isso é escolhido:** a listagem fica idêntica, o gatilho não. No app o gatilho é outro
  (`athleteNextMatchProvider`, ancorado em inscrição paga + dia do evento) e já inclui partida sem
  horário.

## Parte 2 — O Focus no app

### Rota e casca

`/torneios/:tournamentId/focus?secao=agora|trajetoria|grupo|chave` — **uma rota só**, quatro
seções num `IndexedStack`.

Não replico as quatro rotas aninhadas da web. Lá elas existem porque o `router-outlet` exige, e o
próprio `focus-shell.component.ts` documenta a armadilha: seção listada sem rota irmã não casa com
nenhum filho, o router recua até o catch-all e ejeta o atleta para o painel **sem erro nenhum**.
Uma casca dona das quatro seções não tem esse modo de falha; o `?secao=` preserva o deep link.

A imersão sai barata: o app não envolve telas do atleta em `StatefulShellRoute` (a única é a da
arena, `app_router.dart:1395`) e as telas de torneio já são `Scaffold` de tela cheia. O que a
casca esconde é o caminho de volta ao hub, não uma sidebar.

O `×` devolve para a home, como na web.

### Arquivos

```
lib/features/tournaments/domain/focus/
  focus_day_logic.dart       # alvo do dia + trava da oferta
  focus_journey_logic.dart   # porte de focus-journey.ts
  focus_views_logic.dart     # porte de focus-views.ts
  focus_providers.dart       # Riverpod
lib/features/tournaments/presentation/focus/
  focus_shell_page.dart
  sections/focus_now_section.dart
  sections/focus_journey_section.dart
  sections/focus_group_section.dart
  sections/focus_bracket_section.dart
```

Domínio puro, sem import de Flutter — é o que torna os 73 testes de torneio que já existem
possíveis sem `WidgetTester`.

### Dados

`TournamentMatchesRepository.watchByTournament(tournamentId)` num `StreamProvider.family`. O
Riverpod compartilha por definição: as quatro seções leem o mesmo stream, sem o `acquireLive`
manual que a casca web precisou montar para não derrubar e reabrir o listener a cada troca de
seção.

**A categoria em foco é obrigatória.** Toda derivação por grupo — classificação, derrotas, número
da rodada — filtra por `poolId`, que só é único DENTRO da categoria: os grupos são 'A', 'B', 'C'…
em todas elas. Com a lista do torneio inteiro, o Grupo A do atleta vem fundido com o Grupo A das
outras categorias e um grupo de 4 duplas aparece com 8. Foi um bug real da web
(`focus-grupo-categoria`). A categoria sai de `AthleteNextMatch.match.categoryId`.

### Reuso

Chave e Grupo não são reescritas: as seções embrulham `double_elimination_bracket_layout.dart`, a
chave simples e os grupos que o app já desenha — mesma jogada da web com `CategoryBracketComponent`.

### Entrada automática

Redirect, igual à web. Abrir o app no dia de jogo empurra o Focus por cima da home.

- **Gatilho:** `athleteNextMatchProvider`, que já filtra inscrição paga + `registrationShowsAsLiveToday`.
- **Trava:** `offeredKey = "$uid:$dayKey"` em memória, num provider com `keepAlive`. Morre com o
  processo, de propósito — é o análogo do `offeredKey` da web. Sem ela, o `×` volta para a home,
  a home resolve o alvo de novo e o atleta fica preso no Focus sem saída.
- **Onde engata:** na home (`home_page.dart`), não no `redirect` global do router. O redirect
  global é `async`, roda em toda navegação e brigaria com deep link e push.
- **Custo conhecido:** cold start (app morto pelo sistema) reoferece. É o mesmo trade que a web
  aceitou ao trocar recarga de página por reoferta.

### O que acontece com o "Hoje"

Aposentado, não duplicado — mesma decisão da web.

- A aba "Hoje" sai de `visibleTournamentDetailTabs`; `defaultTournamentDetailTab` deixa de
  apontar para ela.
- `/torneios/:id/hoje` passa a redirecionar para o Focus. A rota **não** é removida: o único
  chamador dentro do app é `tournament_detail_page.dart:320` (verificado, e é justamente o card
  que está sendo substituído) e nenhuma Cloud Function manda deep link para ela — mas o app é
  distribuído por loja, e uma versão já instalada continua resolvendo esse caminho. Três linhas de
  redirect custam menos que um deep link morto num build antigo.
- No lugar da aba, um CTA no topo da "Visão geral" quando `hasMyMatchToday`: *"Você joga hoje —
  entrar no Modo Focus"*.
- `TournamentDetailTodayTab` é **substituído**, não reaproveitado: a seção "Agora" é o porte de
  `focus-now`, que mostra próxima partida rica, timeline e ao vivo — o widget atual cobre só uma
  parte disso. Ele é apagado no mesmo commit em que a seção "Agora" passa a desenhar as duas
  listas, junto com `tournament_today_page.dart`.

### O risco: a Trajetória

`focus-journey.ts` são 308 linhas cujos comentários registram cinco rounds de review e os bugs que
cada um matou:

- **bye é partida real** (`teamAId=mine`, `teamBId=''`, `Scheduled`, nunca jogada) e ancorava o
  caminho na 1ª rodada para sempre — atleta na final de uma chave de 6 lia "3 vitórias do título"
  em vez de "1";
- **disputa de 3º lugar compartilha o número de rodada da final**, então checar campeão por
  `round === lastRound` coroava quem perdeu a semi e ganhou o 3º lugar;
- **na dupla eliminação, WB e LB numeram rodadas independentes**, então o piso por `round`
  filtrava a própria partida que o atleta ia jogar; a resposta vem de caminhar a fiação
  (`winnerAdvance`), não de contar fases;
- **fiação circular** (planta quebrada) girava sem parar — daí o teto `MAX_HAPPY_PATH`.

Regras do porte:

1. Função a função, **com os comentários**. Eles são o registro de por que a linha é daquele
   jeito; sem eles o próximo a mexer refaz os mesmos quatro bugs.
2. Os testes vêm junto: `focus-journey.spec.ts` (341) e `focus-scenarios.spec.ts` (199) viram
   testes Dart. Os fixtures da web copiam o formato exato do que
   `functions/src/category-bracket-builders.ts` grava — é isso que vira fixture Dart.
3. **Nada de "melhorar" a lógica no caminho.** Onde a web se recusa a afirmar (eliminação decidida
   só pelo saldo do grupo, colocação antes do grupo fechar), o Dart se recusa igual. Essas lacunas
   são escolhidas: fechá-las exige simular critério de desempate, e errar desempate num app de
   torneio é pior que uma imprecisão temporária.

O modelo do app já tem `winnerAdvanceMatchNumber`/`winnerAdvanceSlot`, então a fiação que o caminho
feliz percorre existe do lado de cá.

### Os cinco estados do "Agora"

`nowStateOf` (`focus/now/focus-now.component.ts`) é função pura e tem precedência explícita:

```
called → live → next → pending-knockout → idle
```

Duas armadilhas que essa ordem resolve e que o porte precisa preservar:

- **"chamado" e "em quadra" coexistem no dado.** `callMatchToCourt` grava `queueStatus:
  'on_court'` e `status: 'in progress'` na MESMA escrita. Sem a ordem explícita, ou o alerta de
  chamada nunca aparece, ou nunca sai da tela. O que o tira da tela é o reconhecimento
  (`acknowledgedMatchId`), que é só local — não existe callable para avisar a mesa, e o rótulo
  ("Ok, estou indo") diz exatamente isso.
- **`idle` não é "sem partida".** Sem partida do atleta, a categoria ainda pode ter mata-mata
  pendente cujo slot não tem o `teamId` dele até o `winnerAdvance` preencher. Aí o estado é
  `pending-knockout`, não `idle` — e é excluído quando o atleta já perdeu no mata-mata
  (`eliminatedFromKnockout`), senão um eliminado nas quartas lê a mesma mensagem de quem espera
  o sorteio.

O app tem o mesmo dado por outro caminho: `athleteMatchPriority`
(`athlete_tournament_day_logic.dart`) já ordena chamada > ao vivo > agendada > fila, e
`athleteCourtCallMatchProvider` já observa a chamada em tempo real. O porte usa
`nowStateOf` como fonte da precedência e o provider existente como fonte do dado.

O reconhecimento precisa sobreviver à troca de seção dentro da casca — mora num provider da
casca, não no estado do widget da seção.

## Fora de escopo

- Alargar o gatilho da entrada automática na web (ver Parte 1).
- Levar a chamada de quadra para a web.
- Clima, contagem de W.O., tempo de caminhada, scouting do adversário, projeção de ranking: os
  protótipos mostram, nenhum tem fonte de dado, e a spec de 12/08 registra o corte com o motivo.
  Quem "completar" a tela pelos protótipos reintroduz número inventado.

## Testes

- **Regra do dia:** os três casos de âncora, mais os negativos (encerrada sem evidência de dia,
  cancelada, torneio fora da janela), nas duas superfícies. Estende
  `tournament_detail_tabs_logic_test.dart` e `tournament-live.selectors.spec.ts`.
- **Trajetória:** porte dos dois specs da web, incluindo os fixtures do gerador real.
- **Casca:** widget test da troca de seção e do `×`.
- **Entrada automática:** teste da trava — segundo `resolve()` no mesmo dia/uid devolve nulo.
