# Firestore — torneios e ligas (discovery atleta)

## Coleções

| Coleção | Uso |
|---------|-----|
| `tournaments/{id}` | Catálogo público de torneios (aba Competir) |
| `leagues/{id}` | Circuitos com `stages[]` embedded |
| `artifacts/{projectId}/public/data/teams` | Duplas |
| `artifacts/{projectId}/public/data/inscriptions` | Inscrições + pagamento MP |

Não usar `torneios/` (visão operacional do backoffice).

## Torneio (`tournaments/{id}`) — campos recomendados

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `name` | string | Nome do torneio |
| `city` | string | Cidade |
| `location` / `venueName` | string | Local |
| `startAt` / `endAt` | Timestamp | Datas |
| `dateLabel` | string | Opcional; exibição curta |
| `format` | string | `dupla` / `individual` |
| `capacity` | number | Vagas totais |
| `enrolledCount` | number | Inscritos |
| `featured` | boolean | Destaque na lista |
| `coverUrl` / `imageUrl` | string | URL da capa na listagem |
| `liveMatchesNow` | number | Jogos ao vivo (denormalizado) |
| `status` / `listingStatus` | string | Operacional: `Draft`, `Open`, `Brackets Ready`, `In Progress`, `Completed` (ou legado `open`, `live`, `ended`, `finalizado`, etc.) |
| `leagueId` / `leagueStageId` | string | Liga / etapa |
| `categories` | array | `{ categoryName, entryFee, maxTeams?, spotsLeft? (legado), level?, uniformType?, uniformNameOnShirt?, uniformNumberOnShirt?, uniformSizeOptionsTop?, uniformSizeOptionsShorts? }` |
| `categoryOps` | map | Por `categoryId`: `seeds[]`, `seedByRanking`, `bracketStatus` (`none`/`draft`/`published`), `bracketFormatOverride`, `bracketConfig`, `groupsPreview[]`, `updatedAt` |

`categoryOps` é atualizado pelo gestor do torneio (client) para seeds/rascunho; publicação de chave e partidas via callable `generateCategoryBracket` (admin SDK cria `matches`).

`uniformType` (por categoria): `none` | `top_only` | `full`.

Capacidade exibida no app: `maxTeams` por categoria. Inscritos contados em `artifacts/{projectId}/public/data/inscriptions` (`tournamentId` + `categoryId` = `categoryName`).

Mapper: `nexago_app/lib/features/tournaments/data/tournament_document_mapper.dart`.

## Liga (`leagues/{id}`)

Campos estendidos para criação de circuito (wizard C1–C6):

| Grupo | Campos |
|-------|--------|
| C1 | `sport`, `organizationName`, `description`, `coverUrl`/`imageUrl`, `city`, `state` |
| C2 | `seasonStartAt`, `seasonEndAt`, `seasonLabel`, `plannedStagesCount`, `grandFinalEnabled` |
| C3 | `categories[]` (mesmo shape do torneio) |
| C4 | `countingStagesMode`, `rankingTableId`, `rankingPointsByPlace`, `grandFinalSpots`, `wildcardEnabled`, `wildcardSpots` |
| C5 | `stages[]`: `status` (`defined`/`pending`), `isGrandFinal`, `locationName`, `city`, `startAt`, `endAt`, `dateLabel`, `tournamentIds[]` |
| Meta | `listingStatus` (`draft`/`open`), `wizardStep`, `keywords`, `managerId`, `updatedAt`, `createdAt` |

No **publish**, grava `leagues/{id}` e cria torneios `draft` em `tournaments/` para cada etapa `defined` (`leagueId`, `leagueStageId`, `leagueStageOrder`, categorias herdadas).

### Adicionar etapa pós-publish (wizard D1–D3)

Após o circuito estar `listingStatus: open`, o organizador pode publicar uma nova etapa:

| Ação | Writes |
|------|--------|
| Publicar etapa | 1 batch: `tournaments/{id}` (`listingStatus: open`) + update `leagues/{id}.stages[]` |
| Salvar rascunho da etapa | 1 batch: `tournaments/{id}` (`listingStatus: draft`) + stage `defined` na liga |

- Reutiliza slot `pending` sem `tournamentIds`; senão faz append com `order` incrementado.
- Categorias desabilitadas no D2 → `registrationClosed: true` no torneio.
- Campos do torneio-etapa: `isLeagueStage: true`, `leagueStageId`, `leagueStageOrder`, datas/inscrições do wizard.

```json
{
  "name": "Circuito Verão NexaGO",
  "seasonLabel": "Temporada 2026",
  "city": "Circuito nacional",
  "managerId": "uid",
  "listingStatus": "open",
  "stages": [
    {
      "id": "etapa-1",
      "name": "Etapa Nordeste",
      "order": 1,
      "status": "defined",
      "dateLabel": "Abr–mai",
      "tournamentIds": ["tournament-id-1"]
    }
  ]
}
```

## Convite de parceiro

| Coleção | Uso |
|---------|-----|
| `tournamentRegistrationInvites/{id}` | Convite pendente/aceito entre dois atletas |

Campos: `tournamentId`, `categoryId`, `inviterUid`, `inviterName`, `inviteeUid`, `inviteeName`, `status` (`pending` \| `accepted` \| `declined` \| `cancelled` \| `expired`), `teamId`, `registrationId`, `createdAt`, `expiresAt`, `acceptedAt`, `inviterSizeTop`, `inviterSizeShorts`, `inviterJerseyNumber`, `inviterJerseyName` (uniforme do titular até aceite).

Callables: `sendTournamentPartnerInvite`, `acceptTournamentPartnerInvite`, `cancelTournamentPartnerInvite`.

Fluxo: enviar convite → parceiro aceita (cria `teams` + `inscriptions`) → cada atleta paga `share` → webhook soma `paidAmount` até `isPaid`.

**Perfil obrigatório:** inscrição, convite (`sendTournamentPartnerInvite` / `acceptTournamentPartnerInvite`) e PIX (`createTournamentRegistrationPixPayment`) exigem **cadastro inicial concluído**, **WhatsApp válido** e **cidade** em `users/{uid}` (ou `isProfileComplete: true`). Os 5 passos de “Completar perfil” (foto, esporte/nível, objetivos etc.) continuam valendo para gamificação/XP, mas não bloqueiam torneios. Validação no app (`tournamentAccessStateProvider`) e no backend (`athlete-tournament-access.ts`).

## Equipe (`artifacts/.../teams`)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `player1Id` | string | Titular (quem convidou) |
| `player2Id` | string | Parceiro |
| `gender` | string | Preenchido quando `isPaid` na inscrição: `Masculino`, `Feminino` ou `Misto` (derivado de `users/{uid}.gender` dos dois) |

## Inscrição (`artifacts/.../inscriptions`)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `tournamentId` | string | Torneio |
| `categoryId` | string | Nome/id da categoria (`categoryName`) |
| `teamId` | string | Referência em `teams` |
| `isPaid` | boolean | Inscrição confirmada após pagamento |
| `paidAmount` | number | Total pago (dupla: soma das parcelas) |
| `sharePaidUids` | string[] | UIDs dos atletas que já pagaram a parcela (`entryFee/2`) |
| `sizeTopPlayer1` / `sizeTopPlayer2` | string | Tamanho da regata (opcional) |
| `sizeShortsPlayer1` / `sizeShortsPlayer2` | string | Tamanho do shorts quando `uniformType === full` |
| `jerseyNumberPlayer1` / `jerseyNumberPlayer2` | number | Número na camisa (opcional) |
| `jerseyNamePlayer1` / `jerseyNamePlayer2` | string | Nome na camisa (opcional) |

Subcoleção `pixPending/{payerUid}` (somente Cloud Functions): cobrança Asaas aberta por atleta (`asaasPaymentId`, `amountReais`, `status`, `paymentExpiresAt`).

O app agrega inscrições por `categoryId` para exibir `N/M inscritas` e vagas restantes (`maxTeams - count`).

## Inscrição + pagamento

1. Após aceite do convite (ou fluxo legado), existem `teams` + `inscriptions`.
2. App: callable `createTournamentRegistrationPixPayment` com `registrationId` (+ CPF) → tela PIX in-app (Asaas).
3. Webhook `asaasWebhook` com `externalReference` `tournamentRegistration:{registrationId}:{payerUid}` atualiza `paidAmount`, `sharePaidUids` e `isPaid`; ao fechar pagamento (`isPaid=true`), define `teams/{teamId}.gender`.
4. Legado (não usado no app): `createMercadoPagoPreference` + `mercadopagoWebhook`.

## Config Flutter

- `kUseFirestoreTournamentDiscovery` em `tournament_discovery_config.dart`
- `kFallbackToMockIfEmpty` em debug se coleções vazias
