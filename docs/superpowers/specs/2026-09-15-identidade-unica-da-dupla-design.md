# Identidade única da dupla: um doc de equipe por par, reaproveitado entre torneios

Data: 2026-09-15
Branch: `worktree-identidade-unica-da-dupla`
Origem: pergunta do dono sobre duas equipes com os mesmos atletas (`Vet7ZG0MD59sGlN7SODy` e
`B3w4BPoRw0aszmy4QNtp`, projeto dev)

## O que esta entrega faz

Faz a **dupla** ter um único documento em `artifacts/{projectId}/public/data/teams`, reaproveitado
a cada inscrição nova, e funde os 9 pares que hoje estão duplicados no dev.

**Não** mexe em equipe nomeada (trio/quarteto/quinteto), **não** muda o cálculo de pontos, **não**
muda nenhuma tela e **não** roda nada no projeto de produção.

## O problema

Hoje cada inscrição de dupla cria um doc de equipe novo. `acceptTournamentPartnerInvite` escreve
`{player1Id, player2Id, createdAt}` e nada mais — não há consulta nenhuma por "esse par já tem
equipe?". A mesma dupla que joga dois torneios vira duas identidades.

Os dois docs da pergunta do dono são idênticos campo a campo (mesmos `player1Id`/`player2Id`,
mesmo `gender`, mesmas `keywords`, os dois com `registrationPaid: true`, até o `updatedAt` igual,
do backfill de 13/09). O único campo que difere é o `createdAt`. O que os separa é a inscrição que
os gerou:

| | `B3w4BPoRw0aszmy4QNtp` | `Vet7ZG0MD59sGlN7SODy` |
|---|---|---|
| Torneio | Goiânia Open, 26–27/09, aberto | DESAFIO OPEN - JHON JHON, 04–05/09, encerrado |
| Como entrou | pelo atleta (LGPD, pagamento dividido) | pelo organizador (`organizer_direct`) |
| Partidas | nenhuma | 4 |
| `teamRankings` | sem doc | 400 pts, vice |

`teamRankings` é chaveado pelo id do doc (`upsertGlobalRankingDoc` com `docId: teamId`, em
`tournament-ranking.ts`), então o par aparece duas vezes no ranking de equipes, cada entrada com
um pedaço da história. O perfil público da dupla, que é por `teamId`, racha junto.

### O tamanho medido

| | dev (`volley-track-dev-4596c`) | prod (`volley-track-2dd3b`) |
|---|---|---|
| Docs em `teams` | 218 (207 duplas + 11 nomeadas) | 59 (5 duplas + 54 nomeadas) |
| Pares com 2+ docs | **9** | **0** |
| Pares com pontos nos dois docs | 1 | 0 |
| Duplicados no mesmo torneio | 0 | 0 |
| Equipes solo legadas (`player2Id` vazio) | 0 | 0 |

Oito dos nove duplicados estão com 0 ponto no segundo doc **só porque o Goiânia Open ainda não
aconteceu**. Quando ele encerrar, viram nove rankings rachados de uma vez. Daí o prazo: a entrega
precisa estar no ar antes de **26/09**.

A base real de atletas é o dev — o app das lojas aponta para lá. Prod está limpo e não recebe
script nenhum.

## Decisões do dono (15/09)

1. **Corrigir a raiz**, não só o efeito: a dupla passa a ter identidade única, e não apenas um
   ranking somado por cima de docs duplicados.
2. **Uma equipe por par por torneio**: reaproveita entre torneios; se o par entrar numa **segunda
   categoria do mesmo torneio**, nasce doc próprio.
3. **Fundir tudo**: os 9 pares do dev viram um doc cada, história incluída.

A decisão 2 existe porque o bloqueio de inscrição é **por categoria**, não por torneio
(`registrationConflictMessage` em `tournament-pair-uniqueness.ts`), então a mesma dupla pode entrar
em duas categorias do mesmo evento. Com um `teamId` só, ela apareceria em duas chaves do mesmo
torneio, e cerca de 15 pontos nas quatro superfícies filtram partida por equipe sem olhar
categoria (`focus_journey_view.dart` em `campaignOf`, `tournament-live.selectors.ts`, entre
outros). É a mesma armadilha do `poolId` que já mordeu o Focus. Preservar "um `teamId` = uma
chave" mantém esses leitores corretos sem auditoria nenhuma.

## O modelo

Passa a valer, para **dupla**:

> Um par de atletas tem um documento de equipe. Ele nasce na primeira inscrição do par e é
> reaproveitado em toda inscrição seguinte, exceto quando o par já tem inscrição naquele mesmo
> torneio.

Equipe nomeada segue como está: `createTournamentTeamRegistration` e o caminho nomeado do
organizador gravam `teamName`, `captainUid`, `tournamentId` e `categoryId` no próprio doc — ela é
escopada ao torneio de propósito, e o capitão batiza uma equipe nova a cada evento. **Nunca
deduplica.**

A chave do par é a que já existe: `buildPairKey(uidA, uidB)` em `tournament-pair-uniqueness.ts`,
UIDs ordenados e juntados por `:`. A mudança é passar a **gravar** esse valor no doc, num campo
`pairKey`, em vez de só calculá-lo em memória.

`pairKey` só existe em doc de dupla. A ausência do campo é o que marca equipe nomeada e impede
qualquer fusão acidental de trio/quarteto/quinteto.

**`pairKey` é índice, não prova.** A regra de update de `teams` deixa o atleta da equipe escrever
campos livres, então um cliente poderia gravar o `pairKey` de outra dupla e sequestrar o doc dela
na próxima inscrição. Duas travas:

- o helper **revalida** todo candidato recomputando `buildPairKey` a partir do `player1Id`/
  `player2Id` do próprio doc, e descarta quem não bater — o campo serve só para achar, nunca para
  decidir;
- `pairKey` entra na lista de campos que o cliente não pode tocar, junto de `registrationPaid` e
  `gender` (a função `teamPaidGateUnchanged` das rules vira `teamServerOnlyFieldsUnchanged`).

## Mudança no servidor

Criar equipe é exclusivo do servidor — `firestore.rules` tem `allow create: if false` no match de
`teams`. Um helper cobre todos os caminhos.

### Módulo novo: `functions/src/tournament-pair-team.ts`

```
resolvePairTeamRefTx(tx, db, {projectId, tournamentId, uidA, uidB})
  -> {ref, isNew}
```

1. `pairKey = buildPairKey(uidA, uidB)`. Vazio (par incompleto, UIDs iguais) → doc novo, sem
   dedupe.
2. `tx.get(teams where pairKey == pairKey)`. Vindo mais de um doc (duplicado legado), escolhe o de
   `createdAt` **mais antigo** — determinístico e auto-curativo: o sistema converge para um doc só
   mesmo que um duplicado escape.
3. `tx.get(inscriptions where teamId == candidato)`. Se alguma inscrição for **deste torneio**, o
   candidato já está no evento → cria doc novo (é a segunda categoria).
4. Senão, reaproveita: devolve a ref existente e marca `updatedAt` (gravando `pairKey` se faltar).
5. Doc novo sempre nasce com `pairKey`.

As duas leituras são igualdade em campo único, cobertas pelo índice automático do Firestore.
**Nenhum índice composto novo.**

Duas regras firmes do helper:

- **Reaproveitar nunca reescreve `player1Id`/`player2Id`.** A ordem/papel vive na inscrição, e
  `inscriptionParticipantUidsMatchTeam` (firestore.rules) já aceita as duas ordens. Reescrever
  viraria a dona da inscrição do avesso: `resolveOwnerUid` prefere `team.player1Id`.
- O helper não decide pagamento, gênero nem elenco. Só identidade.

### Os pontos que mudam

| Arquivo | Função | O que é hoje |
|---|---|---|
| `tournament-partner-invite.ts` | `acceptTournamentPartnerInvite`, ramo `attach` | cria doc no aceite sobre reserva existente |
| `tournament-partner-invite.ts` | `acceptTournamentPartnerInvite`, ramo que cria inscrição | cria doc + inscrição |
| `organizer-create-registration.ts` | `organizerCreateTeamRegistration`, ramo de fusão de reservas solo | cria doc ao juntar duas reservas |
| `organizer-create-registration.ts` | `organizerCreateTeamRegistration`, ramo de dupla direta | cria doc + inscrição |

**Não mudam** (equipe nomeada, barrada por `isTeamCategory`):
`createTournamentTeamRegistration` em `tournament-team-registration.ts` e o ramo
`buildOrganizerNamedTeamDoc` em `organizer-create-registration.ts`.

### Ramo "solo legado"

Os dois arquivos têm um ramo `baseTeamId` que preenche `player2Id` numa equipe de 1 atleta. Ele
passa a gravar `pairKey` junto — o par só fica completo ali. **Não há nenhum doc solo vivo nos dois
projetos** (medido: 0 e 0), então é higiene, não migração.

Esse ramo é o único jeito remanescente de nascer um duplicado: se o par já tivesse doc em outro
torneio, o solo preenchido seria um segundo doc. Aceito de propósito — a regra "o mais antigo
vence" do passo 2 faz o sistema convergir sozinho, e o script de fusão pode rodar de novo. Repontar
e apagar o doc solo dentro dessa transação custaria mais do que o caminho vale, com zero dado vivo.

### Backfill: `functions/scripts/backfill-team-pair-key.js`

Grava `pairKey` nas duplas existentes (207 no dev, 5 no prod). Pula equipe nomeada (`teamName` ou
`teamSize >= 3`) e par incompleto. `--dry-run` por padrão, `--apply` para escrever.

**Vem antes do deploy**: sem ele o helper não acha nada e o sistema segue criando doc novo.

## Migração: `functions/scripts/merge-duplicate-pair-teams.js`

Agrupa duplas pela chave do par calculada dos próprios `player1Id`/`player2Id` (não depende do
backfill ter rodado) e, para cada grupo com 2+ docs, elege o **sobrevivente**: o doc com o maior
número de documentos apontando para ele nas 8 coleções do inventário abaixo (minimiza escrita);
empate, o `createdAt` mais antigo. Os demais são absorvidos e apagados.

**Nem todo grupo de 2+ é duplicação.** A decisão 2 cria docs distintos de propósito quando o par
entra em duas categorias do mesmo torneio. O script só funde um grupo quando os torneios dos docs
**não se cruzam**; grupo com torneio em comum é pulado e sai no relatório como
`convivência legítima`. Hoje isso não existe em nenhum dos dois projetos (0 casos medidos), mas
fundir esses docs colocaria a mesma equipe em duas chaves do mesmo evento — exatamente o que a
decisão 2 evita.

O inventário abaixo veio de varredura real do dev (todo doc de cada coleção, procurando os ids
duplicados em qualquer campo aninhado), não de leitura de código:

| Coleção | O que reponta |
|---|---|
| `matches` | `teamAId`, `teamBId`, `winnerId`, `servingTeamId` |
| `inscriptions` | `teamId` |
| `tournamentCategoryResults` | `teamId` **e o id do doc** (`{tid}_{cid}_{teamId}`): recria e apaga o antigo |
| `teamRankings` | funde `results[]`, recalcula `totalPoints`, `pointsByYear` e `tournamentsCount`; apaga o doc antigo |
| `tournaments` | `categoryOps.{cid}.seeds[]`, `.groupsPreview[].teamIds[]`, `.championTeamId` |
| `drawSessions` | `pots[].teamIds[]`, `entrants[].teamId`, `reveals[].teamId` |
| `tournamentRegistrationInvites` | `teamId`, `attachTeamId` |
| `tournamentRegistrationCancellations` | `registrationSnapshot.teamId` |

**Não precisa tocar** em `matches/{id}/pointEvents` (usa `side: "A"/"B"`) nem em
`matches/{id}/auditLog` (usa `byUid`) — verificado doc a doc nas partidas do par que exige fusão
real. `athleteRankings`, `communityFeed`, `tournamentSpotPasses`, `matchLiveNotify`,
`tournamentPredictions` e `leagues` não guardam `teamId`: zero ocorrências na varredura.

Na fusão do `teamRankings`, resultado com o mesmo `(tournamentId, categoryId)` nos dois docs é
deduplicado antes da soma — não pode existir hoje (é o que a decisão 2 impede), mas somar duas
vezes seria pior do que ignorar.

O doc absorvido é **apagado**, não vira lápide. Links antigos para `/equipes/{id}` daqueles 9 ids
deixam de abrir; são todos do dev, e prod não tem nenhum. O script grava um JSON com o de-para
`absorvido -> sobrevivente` para auditoria.

`--dry-run` por padrão, `--apply` para escrever, e um passe final que revarre as 8 coleções
procurando sobra de id absorvido. Sobra encontrada = a execução falha ruidosamente.

### Inscrição existente não pode quebrar (exigência do dono)

Uma inscrição cujo `teamId` aponte para doc inexistente está quebrada: some das listagens, e a
regra `inscriptionParticipantUidsMatchTeam` passa a barrar qualquer update do cliente sobre ela.
O script nunca pode produzir esse estado, nem por falha no meio do caminho. Três travas:

1. **Apagar é a última fase, nunca a primeira.** O script roda em três etapas commitadas em
   sequência: (1) reponta tudo, (2) reverifica que nenhum id absorvido sobrou em lugar nenhum,
   (3) só então apaga os docs absorvidos. Falha na etapa 1 ou 2 deixa o doc antigo **vivo** — as
   inscrições continuam resolvendo, e o pior caso é uma fusão pela metade, reparável rodando de
   novo. Nunca o contrário.
2. **Guarda-costas por inscrição**: antes de apagar um doc absorvido, o script confere que nenhuma
   inscrição ainda o cita. Citação encontrada aborta a fase 3 inteira.
3. **Invariante auditável nas pontas**: `check-registration-team-integrity.js` percorre todas as
   inscrições e afirma que cada `teamId` resolve para um doc existente cujos integrantes batem com
   `participantUids`. Roda **antes** (linha de base — pode já haver quebrada) e **depois** de cada
   `--apply`. O conjunto de quebradas não pode crescer; cresceu, a entrega para.

### Os 9 pares do dev

Oito são triviais: o doc perdedor é a inscrição do Goiânia Open, sem partida e sem ponto —
reponta a inscrição e apaga.

Um é fusão real: `36uIDqSP8rr1xjYaUk30` (5 partidas encerradas, 83 pts) absorve
`TF9W6z6rjbwIgvFpD4kV` (3 partidas encerradas, 25 pts), de dois torneios diferentes já fechados.
Como os dois docs têm os mesmos atletas, os nomes exibidos na chave publicada não mudam.

## Testes

TDD, com `functions/src/tournament-pair-team.test.ts` novo:

- reaproveita o doc do par numa inscrição em **outro** torneio;
- cria doc novo quando o par já tem inscrição **neste** torneio (segunda categoria);
- diante de dois docs com o mesmo `pairKey`, escolhe o mais antigo;
- ignora equipe nomeada (`teamName` / `teamSize >= 3`);
- não reescreve `player1Id`/`player2Id` ao reaproveitar, inclusive quando o convite inverte os
  papéis;
- par incompleto não deduplica.

As suítes existentes de `tournament-partner-invite` e `organizer-create-registration` precisam
seguir verdes sem edição — se alguma quebrar, é sinal de que o helper mudou comportamento além da
identidade.

O script de fusão ganha teste de unidade sobre a função pura que decide sobrevivente e monta o
plano de repontamento. O I/O em si é validado pelo `--dry-run` contra o dev.

## Rollout

1. `node scripts/backfill-team-pair-key.js --project volley-track-dev-4596c --apply`
2. deploy das Functions **e das rules** (estanca o sangramento: nenhum duplicado novo)
3. `node scripts/merge-duplicate-pair-teams.js --project volley-track-dev-4596c --dry-run`,
   conferir o plano, depois `--apply`
4. mesma ordem no prod **só do passo 1 e 2** — não há duplicado para fundir lá

A ordem importa: backfill antes do deploy, senão o helper não enxerga as equipes existentes.
Tudo antes de 26/09.

## Consequência aceita

Dupla que já pagou carrega `registrationPaid: true` para a inscrição seguinte, então aparece nas
listagens antes de pagar o torneio novo. É o mesmo raciocínio do `teamPaidBefore` que o PR #429
colocou no `teamDeletionBlockReason`: o par já provou que é real. Inverter isso exigiria o campo
passar a significar "pagou **nesta** inscrição", o que muda o portão das listagens inteiro e está
fora desta entrega.

De brinde, `teamDeletionBlockReason` passa a ser exercitado muito mais (`otherRegistrations` e
`teamPaidBefore` ficam verdadeiros com frequência) — ele já existe e já cobre esses casos.

## Fora de escopo

- Somar ranking por elenco em vez de por doc: desnecessário depois da identidade única.
- Auditar os ~15 leitores que filtram partida por equipe sem categoria: a decisão 2 mantém a
  invariante que eles assumem.
- Lápide/redirect para os ids absorvidos.
- Prod: sem duplicado, só backfill e deploy.

## Riscos

| Risco | Mitigação |
|---|---|
| Duas inscrições simultâneas do mesmo par em torneios diferentes criam dois docs | Transação do Firestore cobre a maior parte; a regra "o mais antigo vence" converge, e o script de fusão pode rodar de novo |
| Script de fusão deixa referência órfã | Passe de verificação revarre as 8 coleções; sobra faz a execução falhar |
| Equipe nomeada fundida por engano | `pairKey` nunca é gravado em doc com `teamName`/`teamSize >= 3`; teste cobre |
| Backfill rodar depois do deploy | Não quebra nada, só não deduplica — a ordem está no passo a passo e o script de fusão conserta o que passou |
