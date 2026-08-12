# Auto-save do uniforme no portal do atleta

**Data:** 12/08/2026
**Escopo:** portal do atleta (web) + correção obrigatória em `functions/`
**Fora de escopo:** app Flutter (herda a correção de backend, mas nenhuma tela dele muda)

## Problema

O organizador recebe a lista de uniformes com muita inscrição em branco. O relato do dono:
o atleta escolhe o uniforme, forma a dupla, e a escolha não chega no pedido — "ele precisa
clicar em salvar, e muitos atletas estão esquecendo".

Só que não é apenas esquecimento. O levantamento achou três buracos:

| Momento | Hoje | Persiste na inscrição? |
| --- | --- | --- |
| Reserva de vaga (solo) | portal chama `setRegistrationUniform` logo após criar a vaga | **não** — a chamada falha |
| Declarar/enviar convite | uniforme viaja em `inviterUniform` | **não** — fica só no doc do convite |
| Aceitar convite | uniforme viaja em `inviteeUniform` | sim |
| Botão "Salvar uniforme" | ação manual pós-inscrição | **não** enquanto a dupla não fecha |

### Causa raiz das linhas em vermelho

`setRegistrationUniform` (`functions/src/tournament-partner-invite.ts`) decide autorização
**pelo doc da equipe**: lê `registration.teamId`, carrega `teams/{id}` e compara o caller com
`player1Id`/`player2Id`. Mas `registerSoloTournament` deliberadamente **não** cria doc em
`teams` ("uma dupla com 1 atleta não deve existir" — a equipe nasce no aceite do convite).

Logo, enquanto a inscrição está `partnerPending`, toda gravação de uniforme morre no primeiro
guard com `failed-precondition: "Equipe inválida."`. No portal isso é invisível: o auto-save
pós-inscrição (`persistUniformAfterRegistration`) engole o erro num `catch {}` vazio.

Categoria de EQUIPE (trio+) não sofre — `createTournamentTeamRegistration` cria o `teams` doc.
O furo é só da dupla enquanto está solo.

## Desenho

### 1. Backend — `resolveUniformSlot` (pré-requisito)

Novo módulo puro `functions/src/tournament-registration-uniform.ts`:

```ts
type UniformSlot = "player1" | "player2" | "byUid";
function resolveUniformSlot(registration, team, uid): UniformSlot | null
```

- **Com `teamId` + doc de equipe** → regra de hoje, intacta: equipe de 3+ devolve `byUid` para
  qualquer membro em `extractTeamMemberUids`; dupla devolve `player1`/`player2` conforme
  `team.player1Id`/`team.player2Id`.
- **Sem `teamId`** (reserva solo) → autoriza pela própria inscrição: `player1Id === uid`, ou
  `participantUids` contendo o uid. O slot sai do mesmo fallback por índice que os clientes já
  usam (`uniformSlotForRegistration` no app, `registration-progress.ts` no portal):
  `player1Id` bate → `player1`; senão `participantUids[0]` bate → `player1`; senão `player2`.
  Inscrição de equipe sem `teamId` (não existe hoje, mas o tipo permite) → `byUid`.
- **Nenhum dos dois** → `null`, e a callable segue lançando `permission-denied` com a mesma
  mensagem de hoje ("Você não é um dos atletas desta inscrição.").

A callable perde o guard `if (!teamId) throw "Equipe inválida."` e passa a carregar `teams`
apenas quando existe `teamId`. O `switch` sobre o slot devolvido escolhe entre
`registrationUniformPlayer1`, `registrationUniformPlayer2` e `uniformByUid.{uid}` — exatamente
os três caminhos de escrita de hoje.

Retrocompatibilidade: para toda inscrição que já tem equipe, a função devolve o mesmo slot que
o código atual escolheria. O que muda é só o caso que hoje é erro.

Testes: `functions/src/tournament-registration-uniform.test.ts` com `node --test`, cobrindo
solo (player1), dupla formada (player1 e player2), equipe trio (`byUid`), e não-participante
(`null`).

### 2. Portal — `UniformAutoSaver`

Módulo puro `frontend/projects/athlete/src/app/tournaments/registration/uniform-autosave.ts`,
vizinho de `direct-payment-state.ts`. Fica fora do componente porque o shell já tem ~966 linhas.

```ts
new UniformAutoSaver({ delayMs, save: (value) => Promise<void>, onStateChange })
saver.schedule(value)   // agenda
saver.retry()           // regrava o último valor pendente
saver.dispose()         // limpa o timer
```

Comportamento:

- **Debounce de 800ms** — grava depois da última mexida, não a cada tecla.
- **Coalescência**: gravação em voo não é cancelada. O valor mais novo entra numa fila de um
  slot e é gravado ao fim da atual, então a última escolha do atleta sempre vence.
- **Estados** `idle | saving | saved | failed`, emitidos por `onStateChange`.
- Valor idêntico ao último gravado com sucesso não dispara chamada.

O saver não conhece validação nem Firebase — quem decide se a seleção está completa é o
componente, antes de chamar `schedule`. Seleção incompleta **não** agenda gravação e **não**
acusa erro enquanto o atleta escolhe (o card fica em `Pendente`). A mensagem bloqueante
continua nascendo só de convidar/aceitar, que já chamam `validateUniformSelection`.

Testes: `uniform-autosave.spec.ts` com timers falsos, sem `TestBed`.

### 3. Portal — card de uniforme

`tournament-registration-shell.component.{ts,html}`:

- O botão "Salvar uniforme" sai. O selo do cabeçalho ganha um estado: `Salvando…` / `Salvo` /
  `Pendente`.
- `onUniformChange` passa a agendar o auto-save quando existe `registration()` e a seleção está
  completa.
- Falha vira `app-nx-inline-message` dentro do card com ação "Tentar novamente" — não toast,
  porque o conserto é ali (mesmo princípio do `uniformError` de hoje).
- Antes da reserva não há o que gravar; a nota atual ("Seu uniforme é enviado junto com a
  reserva da vaga") continua.
- `persistUniformAfterRegistration` deixa de ter `catch {}` vazio: passa a alimentar o mesmo
  estado `failed`, com o mesmo "Tentar novamente".
- O timer morre em `destroyRef.onDestroy`, junto do `searchDebounceHandle` já existente.

Ramo de convite recebido (`receivedInvite()`): o formulário aparece dentro do cartão "Sua
inscrição" e o aceite já manda `inviteeUniform`. O auto-save só arma se o convidado também tiver
inscrição própria — a gravação nesse caso é correta e inofensiva (o aceite anexa a reserva).

### 4. Portal — hidratar do que está gravado, e gravar os padrões quando não há nada

O card nunca leu o uniforme da inscrição: mostrava sempre os padrões (M/10/sobrenome). Com
botão isso era só uma tela mentindo; com auto-save vira destruição de dado — quem escolheu GG
pelo app abriria o portal, mexeria em qualquer campo e gravaria M por cima. Ao trocar de
inscrição o card passa a hidratar via `uniformSlotForUid` (`painel/registration-progress.ts`) e
a marcar o saver como `saved`, sem chamada de rede.

Quando a inscrição **não tem uniforme nenhum** (caso do app, que não coleta na hora da vaga),
os padrões da tela são gravados assim que o atleta abre — decisão do dono: um tamanho editável
no pedido do organizador vale mais que uma linha em branco. O atleta pode trocar depois, e a
troca também grava sozinha.

## Efeito no relato original

"Declarar" passa a persistir de verdade: hoje o `inviterUniform` só encosta na inscrição quando
o parceiro aceita, então convite recusado ou vencido (TTL de 48h) perdia a escolha. Com o
auto-save o uniforme já está gravado na inscrição **antes** de o convite sair.

## Verificação

- `npm test` em `functions/` (inclui o novo `tournament-registration-uniform.test.js`).
- `ng test` no projeto `athlete` (inclui `uniform-autosave.spec.ts`).
- Specs de componente Angular exigem `provideZonelessChangeDetection()` nos providers — o
  módulo novo é puro justamente para não precisar de `TestBed`.
