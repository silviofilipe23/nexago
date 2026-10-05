# Futevôlei — plano por fatias

Estado em 2026-10-04: o futevôlei já é selecionável (torneio/liga, perfil, onboarding,
quadra de arena), tem nível declarado (`FUTEVOLEI`), elegibilidade por nível, capas e
arte. Faltam regras próprias de jogo, rating e acabamento de busca/reserva.

## Fatia 1 — Busca e perfil (feita)
- Chip "Futevôlei" na busca de arenas; futevôlei deixa de vazar para os chips de vôlei
  de praia e de quadra.
- `defaultSportChipFromProfile` trata `FUTEVOLEI`.
- `AthleteProfile._labelToAppSportId` ganha `'Futevôlei'`.
- Pendente (mesmo tema, fora desta fatia): espelho TS em
  `frontend/shared/arena-discovery/sport-chip.ts` (chip, `defaultSportChipFromProfile`,
  `sportFirestoreIdFromChip`).

## Fatia 2 — Acabamento de arena e reserva
- Ícone próprio de futevôlei (hoje `Icons.sports_soccer*`, igual a futebol).
- Sugerir superfície Areia ao escolher Futevôlei/Vôlei de praia no cadastro da quadra.
- Padrão de atletas estimados na reserva por esporte da quadra (`estimatedAthletes`
  hoje fixo em 4): passar o tipo da quadra nos args da confirmação.

## Fatia 3 — Regras de placar por esporte (feita, sem compilar)
Regra adotada: melhor de 3, set até 18, decisivo até 15, diferença de 2 (FIFV/CBFv; fontes
conferidas só por resumos de busca). `sport` vai gravado na partida na criação da chave
(`bracketMatchDoc`); partidas antigas: `functions/scripts/backfill-match-sport.js`.
Original do levantamento:
- Hoje tudo é vôlei de praia: set até 21, tie-break 15 no 3º set, `bestOf` 3 —
  em três cópias que precisam andar juntas: `functions/src/match-scoring.ts`,
  `nexago_app/.../match_ops/match_scoring_logic.dart`,
  `frontend/shared/live-scoring/match-scoring.ts` (+ testes de paridade).
- Definir: pontos por set, tie-break, `bestOf` padrão e vantagem do futevôlei.
- Introduzir `sport` como parâmetro de `targetPointsForSet` / `isSetWon` /
  `validateScoreSubmission`. Corrige de quebra o vôlei de quadra (25 / melhor de 5).

## Fatia 4 — Formato de torneio por esporte
- Presets por esporte: tamanho de time (dupla), gênero, categorias.
- `skillLevelOptionsForSport` ignora o esporte; decidir se a escada de 7 níveis serve.

## Fatia 5 — Rating Glicko-2 (shadow mode)
- Incluir `FUTEVOLEI` em `RATED_SPORT_CODES` (`functions/src/rating-config.ts`) e na
  cópia de `frontend/.../athlete-ratings-repository.ts`.
- Régua: reaproveitar a do vôlei ou criar `ratingLadders/FUTEVOLEI` (sem deploy).
  Flags nascem em `shadowMode`, sem promoção/rebaixamento automáticos.
- Replay do histórico, testes (`rating-engine.test.ts`) e docs
  (`docs/business-rules/levels.md:84`, spec 2026-08-15).

## Fora de escopo por ora
- Posição/lado de jogo (fundo/frente) no perfil: não existe em nenhum modelo.
