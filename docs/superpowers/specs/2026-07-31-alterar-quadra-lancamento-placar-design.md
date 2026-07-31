# Alterar a quadra na tela de lançamento de placar (portal do organizador)

Data: 2026-07-31

## Problema

Na tela de lançamento de placar do portal do organizador
(`/painel/eventos/:id/categorias/:catId/placar/:matchId`), o card "Registro da
partida" mostra a quadra apenas como leitura. Quando a partida é remanejada de
quadra durante o evento — o que acontece o tempo todo na operação —, o
organizador que já está com o placar aberto precisa sair da tela, ir até
Agendamento, selecionar a partida na grade e reagendá-la só pra corrigir a
quadra.

Este desenho permite trocar a quadra direto na tela de placar.

## Escopo

Trocar **só a quadra**, preservando o horário já agendado. Editar o horário
continua sendo função da tela de Agendamento — replicá-lo aqui duplicaria a
grade sem ganho.

Fora de escopo: criar agendamento pra partida que ainda não tem horário, e
alterar a quadra de partida já encerrada.

## Comportamento

No card "Registro da partida", o campo *Quadra* passa de texto estático a uma
linha de chips com as quadras reais do torneio (`ctx.tournament().courts`), no
mesmo visual do seletor "Melhor de" que já existe acima na tela. A quadra atual
fica com o chip ativo; clicar em outro chip grava imediatamente.

Estados, avaliados nesta ordem:

| Situação | O que a tela mostra |
| --- | --- |
| Partida encerrada (`status === 'completed'` ou `score != null`) | Só o nome da quadra, como hoje |
| Partida sem horário (`scheduledAt == null`) | "A definir" + dica pra agendar em Agendamento |
| Torneio sem quadras cadastradas | "Nenhuma quadra configurada no torneio" |
| Caso normal | Chips clicáveis; spinner no chip durante a gravação |

"Torneio sem quadras cadastradas" é condição de template (`courts().length === 0`),
não de `courtChangeBlockReason` — o motivo não depende da partida.

A regra de partida encerrada é a mesma do `isFinished` do
`agendamento.component.ts`, mantendo as duas telas coerentes. O servidor
(`scheduleMatch`) aceitaria reagendar uma partida concluída, mas a chave já
avançou nesse ponto e o Agendamento bloqueia o mesmo ato — liberar só aqui
criaria uma inconsistência entre telas.

## Gravação

Reusa o callable `scheduleMatch` já existente (`data/organizer-ops.service.ts`),
passando o **mesmo** `scheduleTime`/`scheduleEndTime` da partida e apenas o
`courtId` novo. O servidor grava `courtId` + `courtName` (resolvido do doc do
torneio), valida sobreposição de quadra e devolve avisos de descanso
insuficiente.

Quando a partida tem `scheduledAt` mas não tem `scheduleEndAt`, o fim é
calculado como início + `matchOps.defaultMatchDurationMin` (fallback 30) — a
mesma conta que o `agendamento.component.ts` usa pra desenhar os blocos.

O `dayKey` não é enviado: o `scheduleMatch` do service já o deriva do
`scheduleTime` (`dayKeyFromDate`, parede America/Sao_Paulo).

Depois de gravar, chama `ctx.reloadMatches()`. O subtítulo do cabeçalho da tela
já compõe com `m.court`, então se atualiza sozinho.

**Nenhuma mudança no backend.** `functions/src/organizer-match-ops.ts` não é
tocado — está sendo editado em outro worktree (`court-update-auto-scheduling`) e
já faz exatamente o necessário.

## Feedback e erros

O feedback da troca de quadra usa um sinal próprio (`courtFeedback`), renderizado
**dentro do card "Registro da partida"**. O `feedback` existente fica reservado
ao placar/W.O., que é renderizado no card de sets, longe do clique da quadra.

- Conflito de quadra: o servidor devolve `failed-precondition` com a mensagem
  pronta (ex. quadra ocupada por outra partida no horário) → banner de erro com
  a mensagem do servidor.
- Avisos de descanso: `result.warnings` → banner de sucesso com o aviso anexado,
  mesmo texto/padrão do `agendamento.component.ts`.
- Sucesso limpo: "Quadra alterada para {nome}."

## Estrutura

### Módulo novo: `painel/data/match-court-change.ts`

Isola a decisão da UI e deixa a regra testável sem montar componente.

```ts
export type CourtChangeBlock = 'finished' | 'unscheduled';

/** `null` quando a quadra pode ser trocada; senão o motivo do bloqueio. */
export function courtChangeBlockReason(m: TournamentMatch): CourtChangeBlock | null;

/** Argumentos do `scheduleMatch` pra trocar só a quadra, ou `null` se bloqueado. */
export function courtChangePayload(
  m: TournamentMatch,
  courtId: string,
  defaultDurationMin: number,
): { matchId: string; courtId: string; scheduleTime: Date; scheduleEndTime: Date } | null;
```

`courtChangePayload` chama `courtChangeBlockReason` internamente e também rejeita
`courtId` vazio, então é impossível montar payload inválido mesmo que a UI erre.

### `painel/chaveamento/placar.component.ts`

Acréscimos:

- `courts()` — computed de `ctx.tournament()?.courts ?? []`
- `courtBlock()` — computed de `courtChangeBlockReason(match())`
- `courtFeedback` — signal `{ ok, message } | null`
- `changeCourt(courtId)` — no-op se `saving()` ou se já é a quadra atual;
  monta o payload, chama `scheduleMatch`, trata warnings/erro, recarrega.

Reusa o `busyKey` existente com a chave `court:<courtId>` (spinner no chip
certo) e o `saving`, que já desabilita o botão "Salvar placar" do cabeçalho —
impede gravação concorrente de placar e quadra.

O template troca o conteúdo do `og-form-field label="Quadra"` pelos chips +
banner. O campo "Horário" ao lado fica inalterado.

## Testes

`painel/data/match-court-change.spec.ts` (Jasmine/Karma, `ng test organizer`):

1. Partida sem `scheduledAt` → bloqueio `'unscheduled'`, payload `null`.
2. Partida com `status === 'completed'` → bloqueio `'finished'`.
3. Partida com `score != null` (mas status não concluído) → bloqueio `'finished'`.
4. Partida agendada com `scheduleEndAt` → payload preserva início e fim exatos.
5. Partida agendada sem `scheduleEndAt` → fim = início + duração padrão.
6. `courtId` vazio ou só espaços → payload `null`, mesmo com partida agendada.

## Arquivos

| Arquivo | Ação |
| --- | --- |
| `frontend/projects/organizer/src/app/painel/data/match-court-change.ts` | novo |
| `frontend/projects/organizer/src/app/painel/data/match-court-change.spec.ts` | novo |
| `frontend/projects/organizer/src/app/painel/chaveamento/placar.component.ts` | editado |

Não tocar: `functions/src/organizer-match-ops.ts` e
`frontend/projects/organizer/src/app/painel/data/matches-repository.ts` — ambos
em uso pelo worktree `court-update-auto-scheduling`.
