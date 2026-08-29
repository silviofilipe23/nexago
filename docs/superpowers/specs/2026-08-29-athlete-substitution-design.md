# Substituição de atleta até a geração das chaves — Design

Data: 2026-08-29
Status: aprovado em brainstorming (app Flutter + portal do atleta)

## Objetivo

Permitir que uma dupla/equipe inscrita substitua um dos seus atletas antes da
geração das chaves da categoria. Depois que as chaves são publicadas, nenhuma
substituição é possível. Superfícies: app Flutter e portal web do atleta.
Painel do organizador fica fora do escopo (recebe apenas notificação).

## Regras de negócio (decididas)

1. **Mecanismo**: convite de substituição. O substituto precisa aceitar —
   o aceite colhe consentimento LGPD, uniforme e dispara a trava de nível
   dele. Sem aceite não há troca.
2. **Quem inicia / qual vaga**:
   - Dupla: qualquer um dos dois pode iniciar a troca da própria vaga OU da
     do parceiro.
   - Equipe (trio/quarteto/quinteto): só o capitão inicia, para qualquer
     integrante exceto ele mesmo (`captainUid` nunca é substituído).
   - Quem sai é sempre notificado.
3. **Pagamento**: a troca não mexe em dinheiro. Se a cota de quem sai estava
   paga, a vaga segue paga e o substituto herda o status
   (`sharePaidUids`/`organizerConfirmedShareUids`: uid que sai → uid que
   entra). `isPaid` e `paidAmount` não mudam. O acerto entre os atletas é
   fora da plataforma. O histórico registra quem pagou originalmente.
4. **Gate**: bloqueado quando `tournaments/{id}.categoryOps[categoryId]
   .bracketStatus` ∈ {`published`, `completed`} — por categoria. Rascunho
   (`draft`) não trava (a chave referencia `teamId`, que não muda na troca).
   Também bloqueia torneio cancelado e categoria `isCompleted`.
5. **Organizador**: não aprova; é notificado após a troca e vê o histórico
   no doc da inscrição.
6. Inscrições na lista de espera (`waitlist: true`) também podem substituir.
7. Elenco incompleto (`partnerPending: true`) pode substituir qualquer uid já
   presente em `participantUids` (ex.: trio com 2 membros, capitão troca o
   2º). Preencher vaga vazia continua sendo o fluxo de convite normal.

## Modelo de dados

### Convite (coleção existente `tournamentRegistrationInvites`)

Campos novos, além dos padrão (`tournamentId`, `categoryId`, `inviterUid/Name`,
`inviteeUid/Name`, `status`, `createdAt`, `expiresAt` TTL 48h,
`lgpdTermVersion`):

- `isSubstitutionInvite: true`
- `replacedUid: string` — quem sai
- `replacedName: string` — para exibição no card do convite
- `registrationId: string` — inscrição alvo
- `teamId: string | null`

Convites atuais não mudam. Statuses reutilizados
(`pending|accepted|declined|cancelled|expired|stale`); motivos de stale novos:
`bracket_published`, `member_left`.

### Inscrição (`artifacts/{pid}/public/data/inscriptions/{id}`)

Campo novo, escrito só por Cloud Function:

```
substitutionHistory: Array<{
  outUid, outName, inUid, inName,
  byUid,           // quem iniciou
  at: Timestamp,
  outHadPaid: boolean
}>
```

### Time (`artifacts/{pid}/public/data/teams/{teamId}`)

Sem campos novos. Na troca: `memberUids` substitui out→in; espelho legado
`player1Id`/`player2Id` recalculado (dispara `onTeamSearchKeywordsSync`);
`captainUid` inalterado. **O `teamId` nunca muda** — partidas, palpites,
rankings e rascunho de chave permanecem íntegros.

## Backend — `functions/src/tournament-substitution.ts` (novo)

### Guard novo: `assertSubstitutionAllowed(tournament, categoryId)`

Primeira trava server-side sobre `bracketStatus`. Lança `failed-precondition`
com reason `bracket_published` quando a categoria já tem chave publicada
(mensagem: "As chaves desta categoria já foram publicadas — substituições não
são mais possíveis. Fale com o organizador."). Aplicada no **envio** e
re-checada no **aceite** (o convite vive até 48h; as chaves podem sair no
meio).

### `sendTournamentSubstitutionInvite({tournamentId, registrationId, replacedUid, inviteeUid})`

Validações, na ordem:

1. Autenticado; iniciador ∈ `participantUids` da inscrição.
2. Permissão de vaga (regra 2 acima). `inviteeUid` ≠ iniciador,
   ∉ `participantUids`.
3. `replacedUid` ∈ `participantUids`.
4. `assertSubstitutionAllowed`.
5. Elegibilidade do substituto simulando o elenco pós-troca, com os
   validadores existentes: `assertCanRegisterInTournament`,
   `assertTeamLevelEligibility`, `assertTeamAgeEligibility`,
   `assertTeamGenderEligibility` / `assertMixedDuoGenderEligibility`
   (`requireDeclared: false` no envio, como no padrão atual),
   composição de gênero de equipe via `evaluateTeamJoin` (elenco menos quem
   sai), unicidade na categoria (`parseCategoryRegistration`/`pairKey` — o
   substituto não pode ter inscrição na mesma categoria).
6. No máximo **um convite de substituição pendente por vaga**
   (`registrationId` + `replacedUid`). Vagas diferentes da mesma equipe podem
   ter convites simultâneos.

Efeitos: grava o invite; notifica o convidado (tipo novo
`tournament_substitution_invite`).

### Aceite e recusa — reutilizam as callables existentes

`acceptTournamentPartnerInvite` e `cancelTournamentPartnerInvite` ganham um
branch `isSubstitutionInvite` que delega para handlers exportados do arquivo
novo. As UIs de convite (app e portal) continuam chamando um único callable.

**Aceite (transação)** — re-lê invite (pending, não expirado), inscrição,
time e torneio; então:

1. Re-checa `assertSubstitutionAllowed` e elegibilidade completa
   (`requireDeclared: true`).
2. `replacedUid` ainda ∈ `participantUids`? Se não (saiu ou já foi trocado):
   falha com "atleta já saiu da equipe" e o invite vira `stale`
   (`member_left`).
3. Inscrição:
   - `participantUids`: substitui out→in **preservando o índice** (os slots
     de uniforme da dupla dependem da ordem: índice 0 = Player1, 1 = Player2).
   - Uniforme: dupla → regrava os campos `*Player1|Player2` do slot de quem
     saiu com o payload do substituto (validado por `validateUniformPayload`);
     equipe → `uniformByUid.{outUid}` deletado, `uniformByUid.{inUid}` gravado.
   - Pagamento: se `sharePaidUids` contém outUid, substitui por inUid; idem
     `organizerConfirmedShareUids`. `outHadPaid` registrado no histórico.
   - LGPD: `lgpdAcceptedUids` arrayUnion(inUid) +
     `lgpdAcceptedAt.{inUid}`. O registro de quem saiu permanece (histórico
     de consentimento; sem efeito prático).
   - `substitutionHistory`: arrayUnion do registro da troca.
4. Time: `memberUids` out→in; espelho `player1Id`/`player2Id` recalculado.
5. PIX aberto de quem sai: cancela cobranças Asaas e apaga docs `pixPending`
   do outUid (mesma lógica do cancelamento).
6. Convites: marca `stale` outros convites pendentes do substituto na
   categoria (`markStaleInvitesAfterAccept`, reason `accepted_other_invite`).
7. A trava de nível do substituto dispara sozinha
   (`onInscriptionWrittenLockLevels` observa `participantUids`). A trava de
   quem saiu não é revertida (travas nunca são).

**Notificações pós-transação**: quem saiu
(`tournament_substitution_out`), demais membros
(`tournament_substitution_completed`), organizador (managerId, via
`deliverNotificationToUser`). Card do inbox do convite atualizado via o
padrão `markTournamentPartnerInviteInboxResponse`.

**Recusa/cancelamento**: `cancelTournamentPartnerInvite` já cobre (inviter ou
invitee, status update) — apenas garantir que o branch notifica o iniciador
na recusa.

### `generateCategoryBracket` (alteração pontual)

Ao publicar as chaves, marca `stale` (reason `bracket_published`) os convites
de substituição pendentes da categoria. O aceite já re-checa o gate; isso só
mantém o inbox limpo.

### Casos-limite aceitos

- Dupla com dois convites simultâneos (cada um trocando o outro): permitido;
  cada aceite re-valida contra o elenco corrente. Resultado C+D é válido.
- Quem sai não age em nada: a troca não depende dele (cenário "parceiro
  sumiu"); ele apenas é notificado.

## Firestore rules

- `substitutionHistory` entra no conjunto de campos que cliente não pode
  alterar na inscrição (padrão `inscription*Immutable`/`Unchanged`).
- Convites: criados por Cloud Function (Admin SDK); leitura já coberta pelas
  rules atuais de `tournamentRegistrationInvites` (inviter/invitee). Conferir
  que `replacedUid` não abre leitura extra (não abre: leitura é por
  inviter/invitee, sem mudança).

## App Flutter

- **Ação "Substituir atleta"** na aba Minha Inscrição
  (`tournament_detail_my_registration_tab.dart` / roster card). Visível
  quando: usuário tem permissão de vaga (regra 2) e o gate local permite
  (ler `categoryOps[categoryId].bracketStatus` do doc do torneio). O cliente
  só esconde; o servidor é a autoridade.
- **Sheet de substituição**: passo 1 escolher a vaga (dupla: "eu"/"parceiro";
  equipe: capitão escolhe o integrante); passo 2 buscar o substituto
  (reaproveitar `partner_search_service.dart` e os chips de parceiros
  recentes); enviar. Service ganha `sendSubstitutionInvite`.
- **Convite recebido**: `tournament_registration_received_invite_card.dart` e
  a seção de convites da home renderizam a variante "Convite de substituição —
  você entraria no lugar de {replacedName}". Aceite pelo fluxo atual
  (coleta uniforme quando a categoria exige).
- **Convites enviados**: variante na lista com cancelar.
- **Histórico**: seção discreta na Minha Inscrição ("X entrou no lugar de Y
  em DD/MM").

## Portal do atleta (Angular)

- Ação "Substituir atleta" no `registration-tab.component.ts`
  (Minha Inscrição), com dialog: escolha da vaga + busca de atleta
  (`searchAthleteDirectory` já existe no shell — extrair para reuso).
- `tournament-registrations-repository.ts`: wrapper da callable nova +
  mapeamento de erros (`mapCallableError`).
- `partner-invites.service.ts` e `at-invite-announcer.component.ts`: variante
  de texto para substituição; aceite pelo mesmo responder.
- Gate no cliente: esconder a ação quando `bracketStatus == 'published'`.
- Histórico de trocas exibido no card da inscrição.

## Erros (mensagens em PT)

- `bracket_published`: "As chaves desta categoria já foram publicadas —
  substituições não são mais possíveis. Fale com o organizador."
- `member_left`: "Este atleta já saiu da equipe."
- Duplicado: "Já existe um convite de substituição pendente para esta vaga."
- Elegibilidade: reutilizar as mensagens existentes dos validadores.

## Testes

- **Functions (matriz de inscrições, emulador, callables reais,
  `--test-concurrency=1`)**: fluxos felizes (dupla própria vaga, dupla vaga
  do parceiro, equipe pelo capitão); gate bloqueia envio E aceite (publicar
  chave entre envio e aceite); herança de pagamento (`sharePaidUids`);
  substituto inelegível barrado (nível fora da faixa, mesma categoria);
  capitão não se substitui; não-capitão de equipe não inicia; duplicata
  barrada; `replacedUid` que saiu antes do aceite; uniforme no slot certo
  (dupla índice 0 e 1; equipe `uniformByUid`); convites do substituto viram
  stale; `substitutionHistory` gravado.
- **Flutter**: widget tests dos novos componentes (sheet, variantes de card,
  visibilidade do gate) — acionar o agente flutter-test-engineer.
- **Angular**: specs zoneless dos componentes/dialog novos.

## Fora de escopo (futuro)

- UI de gestão de substituições no painel do organizador.
- Substituição iniciada pelo organizador (inclusive pós-chaves, como
  override).
- Estornos/repasses de pagamento entre atletas.
- Substituição após chaves publicadas, em qualquer forma.
