# Multiesporte fase 5b — arena e descoberta: escritores

**Goal:** quem grava esporte de arena grava o CÓDIGO do catálogo: `courts.types[]`, `courts.type` (= o primeiro), `courts.sport` (= o primeiro, novo) e `arenas.courtTypes[]`. Rótulo legado gravado é lido como código e regravado como código no próximo save. Fora do catálogo ("Pickleball", superfície legada) segue como texto.

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md` (Eixo 5). Depende da 5a (#607).

## Gate de deploy (obrigatório)
Portal da arena e app com a 5b só sobem DEPOIS que `appConfig/appVersion.minBuildNumber` (ios e android) estiver num build que contém a 5a. Motivo: o app da loja anterior exibe o valor cru (`beachTennis`) e o formulário do dono casa chip por igualdade de rótulo (esconde o código e grava o rótulo ao lado). Antes do deploy: conferir valores distintos de `arenas.courtTypes` em produção (texto livre que não resolve fica sem filtro de esporte).

## Tasks
1. App: `kCourtSportOptions` (catálogo com `arenaCourtTypes` + Pickleball), `courtTypeCodesFor`, `CourtService.courtSportFields` (types/type/sport), perfil grava código, `ArenaSearchMetadata.mergeSportCodes` no sync; formulários mostram rótulo e gravam código.
2. Web: `COURT_SPORT_OPTIONS`, `courtTypeCodesFor`, `arenaSportChipCode` em `@nexago/arena-discovery`; portal da arena grava código (quadra, perfil, sync) e exibe `typeLabels`.
3. Trava catálogo × chips da busca (TS e Dart).

Os DOIS syncs (`syncArenaSearchMetadata` e `syncFromCourts`) viram código na mesma entrega — senão um lado regravaria a grafia do outro.
