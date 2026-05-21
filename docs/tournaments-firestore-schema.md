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
| `categories` | array | `{ categoryName, entryFee, spotsLeft?, spotsTotal?, level? }` |

Mapper: `nexago_app/lib/features/tournaments/data/tournament_document_mapper.dart`.

## Liga (`leagues/{id}`)

```json
{
  "name": "Circuito Verão NexaGO",
  "seasonLabel": "Temporada 2026",
  "city": "Circuito nacional",
  "managerId": "uid",
  "stages": [
    {
      "id": "etapa-1",
      "name": "Etapa Nordeste",
      "order": 1,
      "dateLabel": "Abr–mai",
      "tournamentIds": ["tournament-id-1"]
    }
  ]
}
```

## Inscrição + pagamento

1. App cria `teams` + `inscriptions` (regras Firestore).
2. Callable `createMercadoPagoPreference` com `registrationId` e `amountType` (`share` | `full`).

## Config Flutter

- `kUseFirestoreTournamentDiscovery` em `tournament_discovery_config.dart`
- `kFallbackToMockIfEmpty` em debug se coleções vazias
