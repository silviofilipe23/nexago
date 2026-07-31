# Acompanhamento de inscrição no painel do atleta (web)

**Data:** 2026-07-31
**Superfície:** `frontend/projects/athlete` — rota `/painel`
**Branch:** `claude/athlete-portal-inscription-tracking-0dcb05`

## Problema

O atleta que começa uma inscrição em torneio e não termina (falta convidar a dupla, falta
pagar) não tem como saber disso pelo painel. O card "Meus torneios" que existe hoje lista o
torneio com um rótulo de status ("Aguardando dupla", "Pagamento pendente"), mas não diz **qual
é o próximo passo** nem leva até ele — o atleta precisa navegar até o torneio, achar a
categoria e reconstruir sozinho onde parou. Vaga de torneio é perecível: categoria lota,
inscrição encerra.

## Solução

Um card de largura total no topo do painel — "Continue sua inscrição" — que mostra, para cada
inscrição em andamento, a trilha de passos do fluxo real, em que passo o atleta está, e um CTA
que leva direto ao passo pendente.

### Onde fica

Logo abaixo da faixa de KPIs e **acima** do grid de duas colunas do `/painel`. Largura total
porque a trilha de 4–5 passos precisa de espaço horizontal.

Some por completo quando não há inscrição em andamento. Sem estado vazio: "Meus torneios" já
cobre esse caso na coluna lateral.

O card "Meus torneios" e o card "Convites de dupla" **continuam como estão**. São coisas
diferentes: "Meus torneios" é a lista completa (inclui as confirmadas), "Convites de dupla" é
convite recebido de alguém (ainda não existe inscrição minha), e este card é ação pendente
numa inscrição que **já é minha**.

## Modelo de dados

Fonte: `artifacts/{projectId}/public/data/inscriptions`, docs com meu uid em
`participantUids` — já lidos por `fetchMyRegistrations`.

### Campos que o repositório precisa passar a mapear

`registrationFromDoc` hoje mapeia 6 campos. Passa a mapear também:

| Campo | Uso |
|---|---|
| `player1Id` | descobrir se sou player1 ou player2 |
| `participantUids` | idem (fallback) e nome do parceiro |
| `sizeTopPlayer1`, `sizeShortsPlayer1`, `jerseyNumberPlayer1`, `jerseyNamePlayer1` | uniforme do slot 1 |
| `sizeTopPlayer2`, `sizeShortsPlayer2`, `jerseyNumberPlayer2`, `jerseyNamePlayer2` | uniforme do slot 2 |

### Qual slot sou eu

Regra, nessa ordem (sem leitura extra do doc de `teams`):

1. `player1Id === meuUid` → **player1**
2. `participantUids[0] === meuUid` → **player1**
3. caso contrário → **player2**

Isso cobre os três caminhos do backend:
- `registerSoloTournament` grava `player1Id: uid` e `participantUids: [uid]`;
- `acceptTournamentPartnerInvite` no caminho "anexar ao solo" faz
  `participantUids: arrayUnion(uid)` (o convidado entra no índice 1);
- no caminho "criar inscrição nova" grava `participantUids: [inviterUid, uid]` — sem
  `player1Id`, daí a regra 2 existir.

### Nome do parceiro

`participantUids` menos o meu uid → `fetchPublicProfilesByIds` (já existe). Rótulo do passo
Dupla = `"<meu primeiro nome> & <primeiro nome do parceiro>"`.

## O que conta como "em andamento"

Uma inscrição entra no card quando **ainda tem próximo passo**:

- `partnerPending === true` (falta a dupla), **ou**
- `isPaid === false` (falta o pagamento), **ou**
- a categoria exige uniforme (`categoryRequiresUniform`) e o **meu** uniforme ainda não está
  completo no doc.

Sai do card quando os três estão resolvidos. Inscrições confirmadas seguem visíveis em "Meus
torneios".

Inscrição com `waitlist: true` **continua aparecendo**, com uma pill `LISTA DE ESPERA` ao lado
do kicker — é um estado pendente real, esconder seria pior.

Ordenação entre inscrições: data de início do torneio, crescente (o que acontece antes é mais
urgente). Torneio sem `startAt` vai para o fim.

## Os passos

| # | Passo | Concluído quando | Sublinha |
|---|---|---|---|
| 1 | Categoria | sempre (a inscrição existe) | nome da categoria |
| 2 | Uniforme *(só se a categoria exigir)* | meu slot completo por `isUniformSelectionComplete` | `Salvo` / `Pendente` |
| 3 | Dupla | `!partnerPending` | `Marcelo & Bruno` · `Falta parceiro` |
| 4 | Pagamento | `isPaid` | ver abaixo |
| 5 | Confirmada | `isPaid && !partnerPending` | `Vaga garantida` |

O passo Uniforme só é renderizado quando `categoryRequiresUniform(category)` é verdadeiro —
nesse caso o total vira 5 e o chip mostra `PASSO x/5`; caso contrário, 4 passos e `PASSO x/4`.
A completude reusa `isUniformSelectionComplete(category, selection)`, montando a
`UniformSelection` a partir dos campos do meu slot.

**Sublinha do passo Pagamento**, na ordem de precedência:

| Condição | Texto |
|---|---|
| `isPaid` | `Pago` |
| `sharePaidUids` contém meu uid | `Sua parte paga` |
| `paymentMode === 'directWithOrganizer'` | `Direto com o organizador` |
| `entryFee === 0` | `Gratuito` |
| padrão | `Sua metade · R$ <entryFee/2>` |

O padrão usa a metade porque `share` é o `amountType` default da tela de pagamento.

**Passo atual** = posição do primeiro passo não concluído, **1-based** (é o número que vai no
chip `PASSO x/n`). Como uma inscrição só entra no card se tem passo pendente, esse índice
sempre existe — e nunca aponta para "Confirmada", já que ela só fica pendente quando algum
passo anterior também está.

**Estado visual de cada passo é monotônico**: tudo antes do passo atual é `done`, o passo atual
é `current`, tudo depois é `todo` — mesmo que a condição individual de um passo posterior já
esteja satisfeita. Sem isso a trilha poderia sair `done → todo → done` (por exemplo, uniforme
pendente com pagamento já feito), que lê como bug.

## CTA

Rótulo fixo **"Continuar inscrição"**. Destino = o passo pendente:

| Primeiro passo pendente | Rota |
|---|---|
| Uniforme ou Dupla | `/torneios/:tournamentId/inscricao` com `?categoria=:categoryId` |
| Pagamento | `/torneios/:tournamentId/inscricao/pagamento` com `?registro=:registrationId&categoria=:categoryId` |

Mesmos parâmetros que `goToPayment()` já usa na tela de inscrição.

## Múltiplas inscrições

Cada inscrição em andamento vira um **bloco idêntico** (kicker + título + chip de passo + CTA +
trilha), empilhados dentro do mesmo card, separados por uma linha. Um sub-componente só, sem
layout especial para o primeiro item. Sem limite de itens: mais de duas inscrições em andamento
ao mesmo tempo é raro.

O título do card ("Continue sua inscrição") aparece uma vez, no topo.

## Arquitetura

### Arquivos novos

**`painel/registration-progress.ts`** — módulo puro, sem Angular e sem Firestore.

```
buildRegistrationProgress(input: {
  registration: AthleteTournamentRegistration;
  tournament: TournamentSummary;
  category: TournamentCategoryOffer;
  myUid: string;
  myName: string;
  partnerName: string | null;
}): RegistrationProgress | null   // null quando não há passo pendente
```

`RegistrationProgress` = `{ registrationId, tournamentId, categoryId, tournamentName,
categoryName, waitlist, steps, currentStep, totalSteps, ctaLink, ctaQueryParams }`, com
`currentStep` 1-based e `ctaLink` no formato aceito por `routerLink` (array de segmentos).
`steps` = `{ label, caption, state: 'done' | 'current' | 'todo' }[]`.

Toda a regra de negócio vive aqui — é o que os testes exercitam.

**`painel/at-registration-tracker.component.ts` / `.html` / `.scss`** — componente burro,
`ChangeDetectionStrategy.OnPush`, recebe `items = input.required<readonly
RegistrationProgress[]>()` e só renderiza. Nenhuma leitura de Firestore, nenhum estado próprio.

**`painel/registration-progress.spec.ts`** — ver Testes.

### Arquivos alterados

**`data/tournament-registrations-repository.ts`** — estender `AthleteTournamentRegistration` e
`registrationFromDoc` com os campos da tabela acima. Mudança aditiva: nenhum consumidor atual
quebra.

**`athlete-painel.component.ts`** — `loadMyTournaments(uid)` hoje busca registrations +
summaries e descarta tudo o que não é "Meus torneios". Passa a carregar uma vez e derivar as
duas listas, somando só a busca de nomes de parceiros. Fica
`loadRegistrationsAndTournaments(uid)`, alimentando `myTournamentsState` (como hoje) e um novo
`inProgressRegistrationsState`.

**`athlete-painel.component.html`** — o novo card entre `at-kpi-row` e `at-main-grid`; um
skeleton correspondente no ramo de `bootLoading()`.

### Estilo

Reusa os tokens já usados no painel (`--nx-surface-0`, `--nx-line`, `--nx-orange-500`,
`--nx-win`, `--nx-text-dim`, `--nx-r-5`, `--nx-font-display`, `--nx-font-mono`). Passo
concluído = círculo verde com check; passo atual = círculo laranja com o número; passo futuro =
círculo vazado com o número em cinza. Conector verde entre passos concluídos, cinza depois.

Mobile (375px): a trilha passa a empilhar na vertical (conector vertical à esquerda), e o CTA
vira largura total abaixo do título. Sem scroll horizontal.

## Tratamento de erro

Falha ao carregar segue o padrão que `loadMyTournaments` já usa: lista vazia, sem banner de
erro. O card simplesmente não aparece. Uma falha pontual de leitura não deve poluir o painel
com alerta.

Torneio ou categoria que não resolve (`summaries.get(id)` vazio, categoria removida do doc do
torneio) → a inscrição é descartada da lista, não renderiza bloco quebrado.

## Testes

`painel/registration-progress.spec.ts`, exercitando `buildRegistrationProgress`:

1. categoria sem uniforme, falta parceiro → 4 passos, atual = 2 (Dupla), CTA para `/inscricao`
2. categoria com uniforme, uniforme incompleto → 5 passos, atual = 2 (Uniforme)
3. categoria com uniforme já salvo, falta parceiro → 5 passos, atual = 3 (Dupla)
4. dupla formada, falta pagar → atual = Pagamento, CTA para `/inscricao/pagamento` com
   `registro` e `categoria`
5. sublinha do pagamento: `Sua metade · R$ 90` com `entryFee = 180`
6. `paymentMode === 'directWithOrganizer'` → `Direto com o organizador`
7. `entryFee === 0` → `Gratuito`
8. meu uid em `sharePaidUids` e `isPaid === false` → `Sua parte paga`, passo ainda pendente
9. `waitlist: true` → `waitlist` verdadeiro no resultado, passos normais
10. inscrição concluída (`isPaid && !partnerPending`, uniforme ok) → retorna `null`
11. slot: sou player2 (`participantUids = [outro, eu]`, sem `player1Id`) → lê o uniforme de
    `...Player2`, não o de `...Player1`
12. nome do parceiro nulo (perfil não encontrado) → sublinha da Dupla não quebra

Rodar com `ng test athlete` (Karma) a partir de `frontend/`.

## Fora de escopo

- Convites recebidos (torneio em que alguém me convidou e ainda não tenho inscrição): já
  cobertos pelo card "Convites de dupla".
- Cancelar inscrição pelo card.
- Contagem regressiva / prazo de expiração da vaga.
- Torneio de formato Individual: `registerSoloTournament` marca `partnerPending: true` mesmo
  nesse formato, então o passo Dupla aparece lá também. É comportamento pré-existente do
  backend, espelhado aqui de propósito; corrigir isso é outro trabalho.
