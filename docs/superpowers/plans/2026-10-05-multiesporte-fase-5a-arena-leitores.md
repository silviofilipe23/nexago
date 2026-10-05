# Multiesporte fase 5a — arena e descoberta: leitores

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** todo leitor de `arenas.courtTypes` / `courts.types` / `courts.type` / `courts.sport` entende código do esporte E rótulo legado; o filtro por esporte da aba Reservar casa por igualdade de código (sem substring, sem nome da arena).

**Architecture:** o catálogo ganha `arenaCourtTypes` (rótulos de quadra legados por esporte). Cada plataforma resolve o valor de quadra com o resolvedor existente (`resolveSport` / `SportCatalog.resolve`) — nada é regravado. Escrita de código fica para a 5b, que só sobe depois que o build mínimo do app tiver a 5a (o app da loja exibe o valor cru e o formulário do dono casa por igualdade de rótulo).

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md` (Eixo 5, Fase 5).

## Global Constraints
- Nada persistido muda de grafia; normaliza na leitura.
- Valor que não resolve (superfície "Areia", "Pickleball") segue como hoje: exibido cru, não é esporte indexado.
- PT na UI, EN no código; `dart format` só em arquivo novo.
- Chip `all` sempre passa; arena sem nenhum esporte resolvido = "não indexada" → aparece em todo chip (como hoje).

## Review Focus
1. Arena só com rótulos legados filtra igual por chip (Vôlei de praia, Beach tennis, Vôlei indoor, Tênis, Padel, Futebol, Futevôlei).
2. Arena com códigos (`beachTennis`) filtra e exibe rótulo, não código.
3. Valores misturados (`['beachVolleyball','Vôlei de praia']`) não duplicam pill/rótulo.
4. Superfície em `courtTypes` ("Areia") não vira esporte e segue alimentando o filtro de superfície.
5. Chip legado `volleyball` (estado salvo) segue funcionando = `indoorVolleyball`.

## Tasks
1. **Catálogo:** `arenaCourtTypes` no JSON + validação + index + emissão TS/Dart/functions + vetores de resolução dos 7 rótulos de quadra.
2. **Shared/athlete portal:** `arenaSportCodes(courtTypes)`, `arenaSportLabels`, chip por igualdade (`sport-chip.ts`), pills/rótulos do portal (detalhe, reserva, pagamento, lista, agenda) pelo catálogo.
3. **Site:** página white-label `/s` exibe rótulo do catálogo.
4. **App (Flutter):** mesma lógica em `arena_search_filter_logic.dart` + exibições (`sportTypesLabel`, badge, card não-reivindicado, slots).
5. **Arena portal (leitura):** listas/agenda/home exibem rótulo; formulário e perfil reconhecem código gravado como opção marcada (sem esconder/duplicar).

5b (outro PR): formulários gravam código, dedupe por código, `courts.sport = types[0]`; deploy só com `minBuildNumber` ≥ build do app com a 5a.
