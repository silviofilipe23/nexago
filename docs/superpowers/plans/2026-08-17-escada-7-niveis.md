# Escada de 7 Níveis — Plano de Implementação (Fase 1 de 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estender a escada de nível de 5 para 7 degraus (Avançado 1 e 2 nos ranks 4–5; Open passa do rank 5 para o 6), com backfill coordenado — pré-requisito das fases 2–4 da spec (presets, motor de pontos, ranking por categoria).

**Architecture:** O vocabulário de nível tem uma fonte autoritativa (`functions/src/category-level-eligibility.ts`) espelhada manualmente em: rules do Firestore (mapa literal), config da escada Glicko (`rating-config.ts`), app Flutter (`AthleteProfileOptions` + espelhos) e portais web (`@nexago/levels` + espelhos locais). Cada espelho é uma task; a renumeração do Open exige backfill de `athleteRatings.levelRank` e realinhamento de rating, e os docs `ratingLadders/*` do Firestore podem SOBRESCREVER os defaults hardcoded (merge em `parseLadderConfig`), então o backfill também os atualiza.

**Tech Stack:** TypeScript (Cloud Functions, node:test), Firestore rules, Flutter/Dart (flutter test), Angular (Karma, TestBed zoneless), scripts Node admin (ADC).

**Spec:** `docs/superpowers/specs/2026-08-17-category-presets-ranking-weights-design.md` (seção D2; este plano NÃO implementa D3–D9 — ficam para os planos das fases 2–4).

## Global Constraints

Tabela canônica (usar verbatim em TODOS os espelhos; qualquer divergência é bug):

| código | label | rank | abreviação |
|---|---|---|---|
| `iniciante_1` | Iniciante 1 | 0 | Inic. 1 |
| `iniciante_2` | Iniciante 2 | 1 | Inic. 2 |
| `intermediario_1` | Intermediário 1 | 2 | Int. 1 |
| `intermediario_2` | Intermediário 2 | 3 | Int. 2 |
| `avancado_1` | Avançado 1 | **4 (novo)** | Av. 1 |
| `avancado_2` | Avançado 2 | **5 (novo)** | Av. 2 |
| `open` | Open | **6 (era 5)** | Open |

- Aliases legados (leitura): `iniciante`/`basico`→0, `intermediario`→2, **`avancado`/`Avançado`→4** (deixa de ser Intermediário 1), `livre`/`Open / federado`→6.
- Bandas Glicko novas (espaçamento 150 mantido): `avancado_1` inicial 1900 (promove ≥2020, rebaixa ≤1800) · `avancado_2` inicial 2050 (≥2170, ≤1950) · `open` inicial **2200** (topo, rebaixa ≤2100). Degraus 0–3 inalterados.
- Descrições das opções novas (idênticas no app e nos portais): `avancado_1` = "Disputo torneios com frequência e chego nas fases finais." · `avancado_2` = "Jogo no nível mais alto fora do Open e brigo por títulos."
- `legacyBucketLabel` (app) mantém 3 baldes: 0–1 Iniciante, 2–3 Intermediário, 4–6 Open — o filtro do Descobrir não ganha balde "Avançado" nesta fase (decisão de escopo).
- Strings/UI em português; código em inglês. Commits com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Comandos de teste: functions `cd functions && npm test` (build tsc + node --test) · app `cd nexago_app && flutter test` · portais `cd frontend && npx ng test <projeto> --watch=false`.
- Deploy/backfill em produção NÃO fazem parte deste plano (só dev, e gated — Task 9).

---

### Task 0: Commitar a remoção do best-N (D1, já implementada no working tree)

**Files:**
- Nenhum arquivo novo — commit dos 9 arquivos já modificados (D1 da spec, verificado: 1148 testes functions + 27 app passando em 17/08).

**Interfaces:**
- Consumes: working tree atual da branch `claude/ranking-score-status-d58595`.
- Produces: branch limpa para as tasks seguintes (protege contra perda de trabalho não commitado — já aconteceu 2× neste diretório).

- [ ] **Step 1: Conferir que o diff é só o best-N**

Run: `git status --short && git diff --stat`
Expected: exatamente 9 arquivos M (ranking.md, rankings-repository.ts, athlete-ranking.component.ts, tournament-ranking.test.ts, tournament-ranking.ts, ranking_constants.dart, ranking_logic.dart, ranking_how_it_works_sheet.dart, ranking_logic_test.dart). Nenhum outro.

- [ ] **Step 2: Rodar as duas suítes**

Run: `cd functions && npm test` e `cd nexago_app && flutter test test/features/ranking/`
Expected: PASS (1148 e 27).

- [ ] **Step 3: Commit**

```bash
git add docs/business-rules/ranking.md frontend/projects/athlete/src/app/data/rankings-repository.ts frontend/projects/athlete/src/app/ranking/athlete-ranking.component.ts functions/src/tournament-ranking.test.ts functions/src/tournament-ranking.ts nexago_app/lib/features/ranking/domain/ranking_constants.dart nexago_app/lib/features/ranking/domain/ranking_logic.dart nexago_app/lib/features/ranking/presentation/widgets/ranking_how_it_works_sheet.dart nexago_app/test/features/ranking/ranking_logic_test.dart
git commit -m "feat(ranking): ranking geral soma todos os resultados — fim dos melhores 5 por ano (NEXAGO)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 1: Functions — vocabulário canônico de 7 degraus

**Files:**
- Modify: `functions/src/category-level-eligibility.ts` (LEVEL_CODES ~l.29, LEVEL_RANK ~l.58, HIGHEST_RANK ~l.74, levelDisplayLabel ~l.105, levelCodeForRank ~l.137, levelLabelForRank ~l.153, doc-comment do topo)
- Test: `functions/src/category-level-eligibility.test.ts`

**Interfaces:**
- Produces: `LEVEL_CODES` com 7 códigos; `LEVEL_RANK` com `avancado_1:4`, `avancado_2:5`, `open:6`, alias `avancado:4`; `levelRank(raw): number|null` resolvendo a tabela nova; `levelCodeForRank(4)==='avancado_1'`, `(5)==='avancado_2'`, default `'open'`; `levelLabelForRank(4)==='Avançado 1'`, `(5)==='Avançado 2'`; `categoryLevelRank(null)===6`. Tasks 2, 6 e os planos das fases 2–3 consomem exatamente estes nomes.

- [ ] **Step 1: Escrever os testes que falham** (estilo node:test do arquivo)

```ts
describe("escada de 7 degraus", () => {
  it("resolve os códigos novos e o open renumerado", () => {
    assert.strictEqual(levelRank("avancado_1"), 4);
    assert.strictEqual(levelRank("Avançado 2"), 5);
    assert.strictEqual(levelRank("open"), 6);
    assert.strictEqual(levelRank("livre"), 6);
  });
  it("alias legado Avançado cai no avancado_1, não no intermediário", () => {
    assert.strictEqual(levelRank("Avançado"), 4);
    assert.strictEqual(levelRank("avancado"), 4);
  });
  it("código e label por rank cobrem os degraus novos", () => {
    assert.strictEqual(levelCodeForRank(4), "avancado_1");
    assert.strictEqual(levelCodeForRank(5), "avancado_2");
    assert.strictEqual(levelCodeForRank(6), "open");
    assert.strictEqual(levelLabelForRank(4), "Avançado 1");
    assert.strictEqual(levelLabelForRank(5), "Avançado 2");
    assert.strictEqual(levelLabelForRank(6), "Open");
  });
  it("categoria sem nível segue aceitando todo mundo (rank 6)", () => {
    assert.strictEqual(categoryLevelRank(null), 6);
    assert.strictEqual(categoryLevelRank({level: "Open"}), 6);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm test 2>&1 | grep -A2 "escada de 7"`
Expected: FAIL (avancado_1 → null; open → 5).

- [ ] **Step 3: Implementar**

```ts
export const LEVEL_CODES = [
  "iniciante_1",
  "iniciante_2",
  "intermediario_1",
  "intermediario_2",
  "avancado_1",
  "avancado_2",
  "open",
] as const;

export const LEVEL_RANK: Record<string, number> = {
  // Códigos novos (levelsBySport) e labels normalizados (categoria).
  iniciante_1: 0, iniciante1: 0,
  iniciante_2: 1, iniciante2: 1,
  intermediario_1: 2, intermediario1: 2,
  intermediario_2: 3, intermediario2: 3,
  avancado_1: 4, avancado1: 4,
  avancado_2: 5, avancado2: 5,
  open: 6,
  // Legados — degrau inferior do split.
  iniciante: 0,
  intermediario: 2,
  avancado: 4,
};

const HIGHEST_RANK = 6;
```

Em `levelCodeForRank`: `case 4: return "avancado_1"; case 5: return "avancado_2";` (default segue `"open"`). Em `levelLabelForRank`: `case 4: return "Avançado 1"; case 5: return "Avançado 2";`. Em `levelDisplayLabel`: cases `"avancado_1"/"avancado1"` → `"Avançado 1"`, `"avancado_2"/"avancado2"` → `"Avançado 2"`, `"avancado"` → `"Avançado"`. Atualizar o doc-comment do topo do arquivo (escada de 7; open no 6 com backfill de 17/08; alias `avancado`→4).

- [ ] **Step 4: Rodar a suíte INTEIRA e corrigir asserts que codificam open=5**

Run: `cd functions && npm test`
Expected: os testes novos passam; falhas residuais só em asserts antigos com rank 5/`"open"` — localizar com `grep -rn "levelRank\|rank.*5\b" src/*.test.ts | grep -i "open\|rank"` e atualizar cada um pela tabela das Global Constraints (arquivos prováveis: `category-level-eligibility.test.ts`, `athlete-levels-migration.test.ts`, `athlete-level-admin.test.ts`, `friendly-match-logic.test.ts` — este último usa distância de rank entre níveis; a distância int2→open agora é 3, com os degraus novos no meio).

- [ ] **Step 5: Rodar de novo até verde e commitar**

Run: `cd functions && npm test` → PASS integral.

```bash
git add functions/src/category-level-eligibility.ts functions/src/category-level-eligibility.test.ts functions/src/athlete-levels-migration.test.ts functions/src/athlete-level-admin.test.ts functions/src/friendly-match-logic.test.ts
git commit -m "feat(levels): escada de 7 degraus — Avançado 1/2 nos ranks 4-5, Open no 6 (NEXAGO)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Functions — bandas Glicko dos degraus novos

**Files:**
- Modify: `functions/src/rating-config.ts:70-76` (`VOLLEYBALL_LEVELS` + comentário ~l.65)
- Test: `functions/src/rating-config` não tem arquivo próprio — asserts vivem em `rating-engine.test.ts`, `rating-ladder.test.ts`, `glicko.test.ts`

**Interfaces:**
- Consumes: `levelRank` da Task 1 (usado por `resolveLadderLevel` para aliases).
- Produces: `DEFAULT_LADDER_CONFIG.levels` com 7 entradas; `resolveLadderLevel(config, "open")` → rank 6/inicial 2200; `adjacentLevel(config, intermediario_2, "up")` → `avancado_1`. A Task 6 (backfill) e o realinhamento do trigger de self-upgrade dependem do inicial 2200 do open.

- [ ] **Step 1: Teste que falha** (em `rating-ladder.test.ts`, estilo do arquivo)

```ts
it("escada default tem 7 degraus com open no topo (rank 6, inicial 2200)", () => {
  const config = parseLadderConfig("VOLEI_PRAIA", undefined);
  assert.strictEqual(config.levels.length, 7);
  const open = config.levels[6];
  assert.deepStrictEqual(
    {code: open.code, rank: open.rank, initialRating: open.initialRating, demoteAt: open.demoteAt},
    {code: "open", rank: 6, initialRating: 2200, demoteAt: 2100},
  );
  const int2 = config.levels[3];
  assert.strictEqual(adjacentLevel(config, int2, "up")?.code, "avancado_1");
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd functions && npm test 2>&1 | grep -B1 -A3 "7 degraus"` → FAIL (length 5).

- [ ] **Step 3: Implementar**

```ts
const VOLLEYBALL_LEVELS: RatingLadderLevel[] = [
  {code: "iniciante_1", rank: 0, label: "Iniciante 1", initialRating: 1250, promoteAt: 1420, demoteAt: null},
  {code: "iniciante_2", rank: 1, label: "Iniciante 2", initialRating: 1450, promoteAt: 1570, demoteAt: 1350},
  {code: "intermediario_1", rank: 2, label: "Intermediário 1", initialRating: 1600, promoteAt: 1720, demoteAt: 1500},
  {code: "intermediario_2", rank: 3, label: "Intermediário 2", initialRating: 1750, promoteAt: 1870, demoteAt: 1650},
  {code: "avancado_1", rank: 4, label: "Avançado 1", initialRating: 1900, promoteAt: 2020, demoteAt: 1800},
  {code: "avancado_2", rank: 5, label: "Avançado 2", initialRating: 2050, promoteAt: 2170, demoteAt: 1950},
  {code: "open", rank: 6, label: "Open", initialRating: 2200, promoteAt: null, demoteAt: 2100},
];
```

Atualizar o comentário acima do array (escada de 7; renumeração de 17/08 com backfill).

- [ ] **Step 4: Suíte inteira; corrigir fixtures com bandas antigas** — `grep -rn "1900\|1800\b" src/rating-*.test.ts src/glicko.test.ts` e atualizar pelo quadro de bandas das Global Constraints. Run: `cd functions && npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/rating-config.ts functions/src/rating-engine.test.ts functions/src/rating-ladder.test.ts functions/src/glicko.test.ts
git commit -m "feat(rating): bandas Glicko para Avançado 1/2; Open sobe para inicial 2200 (NEXAGO)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Rules — mapa de ranks com 7 degraus

**Files:**
- Modify: `firestore.rules:321-330` (função `athleteLevelRank` + bloco de comentário ~l.307-320)

**Interfaces:**
- Consumes: tabela das Global Constraints.
- Produces: guarda `athleteLevelsNotDowngraded` coerente com a escada nova. As comparações são intra-request (nível novo × antigo, ambos no mesmo mapa), então o deploy é atômico — nenhuma janela de inconsistência com `athleteRatings.levelRank` (que as rules não leem).

- [ ] **Step 1: Editar o mapa**

```
function athleteLevelRank(value) {
  let ranks = {
    'iniciante': 0, 'Iniciante': 0, 'basico': 0, 'básico': 0,
    'Básico': 0, 'iniciante_1': 0, 'Iniciante 1': 0,
    'iniciante_2': 1, 'Iniciante 2': 1,
    'intermediario': 2, 'Intermediário': 2,
    'intermediario_1': 2, 'Intermediário 1': 2,
    'intermediario_2': 3, 'Intermediário 2': 3,
    'avancado': 4, 'Avançado': 4,
    'avancado_1': 4, 'Avançado 1': 4,
    'avancado_2': 5, 'Avançado 2': 5,
    'open': 6, 'Open': 6, 'livre': 6, 'Livre': 6, 'Open / federado': 6
  };
  return value is string ? ranks.get(value, -1) : -1;
}
```

Atualizar o comentário do bloco: escada de 7 (Avançado 1/2 nos ranks 4–5, Open no 6, renumerado em 17/08 com backfill de `athleteRatings.levelRank`); nota de que `'Avançado'` legado agora rankeia 4 (antes era desconhecido → primeira escrita livre; docs legados com esse label ficam travados ≥4, comportamento intencional do alias).

- [ ] **Step 2: Verificação estática** — não há harness de rules no repo; a validação de sintaxe acontece no deploy da Task 9. Conferir visualmente que labels acentuados estão idênticos aos das Global Constraints (o mapa é lookup exato, sem normalização).

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(rules): escada de 7 níveis no anti-sandbagging — Avançado 1/2, Open rank 6 (NEXAGO)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: App Flutter — vocabulário e espelhos

**Files:**
- Modify: `nexago_app/lib/features/athlete/domain/athlete_profile_options.dart` (levels l.19-25, normalizeLevel l.33-37, levelRank l.52-80, labelForRank l.83-96, legacyBucketLabel comentário l.98-107)
- Modify: `nexago_app/lib/features/athlete/domain/athlete_firestore_codes.dart` (mapas label↔código ~l.64-80)
- Modify: `nexago_app/lib/features/athlete/domain/athlete_sports_levels_labels.dart` (`_abbreviations`)
- Modify: `nexago_app/lib/features/athlete/onboarding/domain/athlete_onboarding_options.dart` (lista de opções, antes do Open ~l.114)
- Modify: `nexago_app/lib/features/tournaments/domain/category_level_eligibility.dart` (`_highestRank` l.19 + switch de ranks)
- Test: `nexago_app/test/features/athlete/onboarding/athlete_profile_onboarding_test.dart` (l.15: `normalizeLevel('Avançado')` esperava `'Intermediário 1'`) + testes novos no mesmo arquivo

**Interfaces:**
- Consumes: tabela das Global Constraints (paridade com Task 1).
- Produces: `AthleteProfileOptions.levels` (7 labels), `levelRank` com avançado 4/5 e open 6, `labelForRank(4/5/6)`; `AthleteFirestoreCodes` com `'Avançado 1'↔'avancado_1'`, `'Avançado 2'↔'avancado_2'`. Toda UI de nível do app deriva destes dois.

- [ ] **Step 1: Testes que falham**

```dart
test('escada de 7: Avançado 1/2 nos ranks 4-5, Open no 6', () {
  expect(AthleteProfileOptions.levelRank('Avançado 1'), 4);
  expect(AthleteProfileOptions.levelRank('avancado_2'), 5);
  expect(AthleteProfileOptions.levelRank('Open'), 6);
  expect(AthleteProfileOptions.labelForRank(4), 'Avançado 1');
  expect(AthleteProfileOptions.labelForRank(5), 'Avançado 2');
  expect(AthleteProfileOptions.labelForRank(6), 'Open');
});
test('legado Avançado normaliza para Avançado 1', () {
  expect(AthleteProfileOptions.normalizeLevel('Avançado'), 'Avançado 1');
});
```

E trocar o assert existente da l.15 para `'Avançado 1'`.

- [ ] **Step 2: Rodar e ver falhar** — `cd nexago_app && flutter test test/features/athlete/onboarding/` → FAIL.

- [ ] **Step 3: Implementar**

`athlete_profile_options.dart`:

```dart
static const List<String> levels = [
  'Iniciante 1',
  'Iniciante 2',
  'Intermediário 1',
  'Intermediário 2',
  'Avançado 1',
  'Avançado 2',
  'Open',
];

// normalizeLevel:
const legacy = <String, String>{
  'Open / federado': 'Open',
  'Básico': 'Iniciante 1',
  'Avançado': 'Avançado 1',
};

// levelRank — casos novos no switch (e open sobe pra 6):
case 'avancado':
case 'avancado 1':
case 'avancado_1':
  return 4;
case 'avancado 2':
case 'avancado_2':
  return 5;
case 'open':
case 'livre':
  return 6;

// labelForRank:
case 4:
  return 'Avançado 1';
case 5:
  return 'Avançado 2';
default:
  return 'Open';
```

Atenção ao `levelRank`: ele normaliza acento (`á→a`), então os cases usam `avancado`. Atualizar o doc-comment (l.42-51) pra escada de 7. Em `legacyBucketLabel`, só o comentário muda: "4–6 caem no balde Open — o filtro legado do Descobrir segue com 3 baldes".

`athlete_firestore_codes.dart`: adicionar aos dois mapas `'Avançado 1': 'avancado_1'`, `'Avançado 2': 'avancado_2'` e o inverso.

`athlete_sports_levels_labels.dart`: `_abbreviations` ganha `'Avançado 1': 'Av. 1'`, `'Avançado 2': 'Av. 2'`.

`athlete_onboarding_options.dart`: inserir antes do Open:

```dart
OnboardingLevelOption(
  label: 'Avançado 1',
  description: 'Disputo torneios com frequência e chego nas fases finais.',
),
OnboardingLevelOption(
  label: 'Avançado 2',
  description: 'Jogo no nível mais alto fora do Open e brigo por títulos.',
),
```

`category_level_eligibility.dart` (espelho do assert): `_highestRank = 6` e o switch de ranks igual ao de `athlete_profile_options.dart`; atualizar o doc-comment (l.8-10).

- [ ] **Step 4: Suíte do app inteira; caçar espelhos residuais**

Run: `cd nexago_app && flutter test`
Depois: `grep -rn "Intermediário 2" lib --include=*.dart` — qualquer lista literal de níveis que apareça (ex.: `tournament_create_logic.dart`, `athlete_discover_models.dart`, `league_create_mapper.dart`) ganha `'Avançado 1', 'Avançado 2'` antes do `'Open'`, e qualquer barra/segmento de nível com contagem fixa `5` passa a derivar de `AthleteProfileOptions.levels.length`.
Expected: PASS integral.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib nexago_app/test
git commit -m "feat(app): escada de 7 níveis — Avançado 1/2 no vocabulário e espelhos (NEXAGO)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Portais web — @nexago/levels e espelhos locais

**Files:**
- Modify: `frontend/shared/levels/index.ts` (LevelCode l.12-17, LEVEL_CODES l.26-32, LEVEL_OPTIONS l.38-44, LEVEL_LABELS l.80-91, levelRankOf l.103-132, levelLabelForRank l.136-149, header)
- Modify: `frontend/projects/athlete/src/app/data/athlete-level.ts` (AthleteLevelLabel, levelRankOf, levelLabelForRank)
- Modify: `frontend/projects/organizer/src/app/painel/data/team-level-score.ts:17` (`POINTS_BY_RANK`)
- Test: specs existentes que codificam open=5 — `frontend/projects/athlete/src/app/data/athlete-level.spec.ts`, `.../public-profiles-repository.levels.spec.ts`, `.../tournaments/tournament-eligibility.levels.spec.ts`, `frontend/projects/organizer/.../team-level-score` specs

**Interfaces:**
- Consumes: tabela das Global Constraints.
- Produces: `LevelCode` união de 7; `levelRankOf('open')===6`, `('avancado_1')===4`; `levelLabelForRank(4)==='Avançado 1'`; `POINTS_BY_RANK` `{0:1,1:2,2:3,3:4,4:5,5:6,6:7}` (soma da dupla vira 2–14). Fase 2 (presets) consome `LEVEL_CODES`/`levelRankOf` daqui.

- [ ] **Step 1: Atualizar specs primeiro (falhando)** — em `athlete-level.spec.ts` (e equivalentes), trocar expectativas de `levelRankOf('open')` para 6 e adicionar:

```ts
it('resolve os degraus novos de Avançado', () => {
  expect(levelRankOf('avancado_1')).toBe(4);
  expect(levelRankOf('Avançado 2')).toBe(5);
  expect(levelLabelForRank(4)).toBe('Avançado 1');
  expect(levelLabelForRank(5)).toBe('Avançado 2');
  expect(levelLabelForRank(6)).toBe('Open');
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd frontend && npx ng test athlete --watch=false` → FAIL.

- [ ] **Step 3: Implementar**

`frontend/shared/levels/index.ts`:

```ts
export type LevelCode =
  | 'iniciante_1'
  | 'iniciante_2'
  | 'intermediario_1'
  | 'intermediario_2'
  | 'avancado_1'
  | 'avancado_2'
  | 'open';

export const LEVEL_CODES: readonly LevelCode[] = [
  'iniciante_1', 'iniciante_2', 'intermediario_1', 'intermediario_2',
  'avancado_1', 'avancado_2', 'open',
];

// LEVEL_OPTIONS — inserir antes do open:
{ code: 'avancado_1', label: 'Avançado 1', description: 'Disputo torneios com frequência e chego nas fases finais.' },
{ code: 'avancado_2', label: 'Avançado 2', description: 'Jogo no nível mais alto fora do Open e brigo por títulos.' },

// LEVEL_LABELS — adicionar:
avancado_1: 'Avançado 1',
avancado_2: 'Avançado 2',
avancado: 'Avançado',

// levelRankOf — casos novos (entrada já vem sem acento):
case 'avancado':
case 'avancado 1':
case 'avancado_1':
  return 4;
case 'avancado 2':
case 'avancado_2':
  return 5;
case 'open':
case 'livre':
  return 6;

// levelLabelForRank:
case 4: return 'Avançado 1';
case 5: return 'Avançado 2';
default: return 'Open';
```

Header do arquivo: escada de 7, ranks 0–6 contínuos, renumeração de 17/08. Aplicar as MESMAS mudanças em `athlete-level.ts` do portal do atleta (`AthleteLevelLabel` ganha `'Avançado 1' | 'Avançado 2'`).

`team-level-score.ts`:

```ts
/** Degrau na escada (1 = Iniciante 1 … 7 = Open). Ranks 0–6 contínuos desde 17/08. */
const POINTS_BY_RANK: Record<number, number> = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7 };
```

E o comentário de `TeamLevelScore.points` passa a "(2–14 numa dupla)".

- [ ] **Step 4: Caçar listas literais nos componentes**

Run: `grep -rn "'Intermediário 2'" frontend/projects --include=*.ts | grep -v spec`
Cada lista literal de níveis (hits conhecidos: `athlete/ranking/athlete-ranking.component.ts`, `athlete/equipes/athlete-equipes.component.ts`, `athlete/onboarding/athlete-onboarding.component.ts`, `athlete/atletas/athlete-directory.component.ts`, `backoffice/painel/atletas/panel-atletas.component.ts`, `organizer/painel/data/tournament-create.model.ts`) ganha `'Avançado 1', 'Avançado 2'` antes de `'Open'`. Onde houver comentário "5 tiers", atualizar para 7.

- [ ] **Step 5: Rodar as suítes dos 3 projetos tocados**

Run: `cd frontend && npx ng test athlete --watch=false && npx ng test organizer --watch=false && npx ng test backoffice --watch=false`
Expected: PASS (lembrar: specs de componente exigem `provideZonelessChangeDetection()` — padrão do repo).

- [ ] **Step 6: Commit**

```bash
git add frontend/shared/levels frontend/projects
git commit -m "feat(web): escada de 7 níveis nos portais — @nexago/levels e espelhos (NEXAGO)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Script de backfill — levelRank 5→6 + realinhamento + ratingLadders

**Files:**
- Create: `functions/scripts/backfill-open-rank-6.js` (seguir o esqueleto de `functions/scripts/backfill-athlete-levels.js`: ADC, `--project`, dry-run por padrão, `--yes` para gravar, `--limit`)

**Interfaces:**
- Consumes: bandas da Task 2 (inicial 2200 do open).
- Produces: script idempotente que (a) em `athleteRatings`: docs com `levelRank === 5` viram `levelRank: 6` e `rating: Math.max(rating, 2200)`; (b) em `ratingLadders/VOLEI_PRAIA`, `ratingLadders/VOLEI_QUADRA` e `ratingLadders/default`: se o doc existir E tiver campo `levels`, sobrescreve o array com a escada nova de 7 (mesmos objetos da Task 2) — sem isso o deploy NÃO muda nada, porque `parseLadderConfig` mescla o doc POR CIMA dos defaults hardcoded.

- [ ] **Step 1: Escrever o script**

Lógica central (dentro do esqueleto de CLI/credenciais copiado do backfill existente):

```js
// (a) athleteRatings: rank 5 só pode ser Open (o 4 nunca foi usado).
const snap = await db.collection('athleteRatings').where('levelRank', '==', 5).get();
for (const doc of snap.docs) {
  const rating = Number(doc.data().rating) || 0;
  const update = {levelRank: 6, rating: Math.max(rating, 2200)};
  console.log(`${doc.id}: levelRank 5→6, rating ${rating}→${update.rating}`);
  if (apply) await doc.ref.update(update);
}
// Sem mexer em proteção de promoção: rebaixamento automático está atrás de
// flag (autoRelegationEnabled: false) — o realinhamento não arrisca demote.

// (b) ratingLadders: docs que sobrescrevem os defaults.
const NEW_LEVELS = [ /* array idêntico ao VOLLEYBALL_LEVELS da Task 2 */ ];
for (const id of ['VOLEI_PRAIA', 'VOLEI_QUADRA', 'default']) {
  const ref = db.doc(`ratingLadders/${id}`);
  const ladder = await ref.get();
  if (!ladder.exists || !Array.isArray(ladder.data().levels)) continue;
  console.log(`ratingLadders/${id}: ${ladder.data().levels.length} níveis → 7`);
  if (apply) await ref.update({levels: NEW_LEVELS});
}
```

Idempotência: re-execução não encontra mais `levelRank == 5` (viraram 6) e os `levels` regravados são os mesmos.

- [ ] **Step 2: Conferir os leitores do `levelRank` persistido** (exigência da spec D2)

Run: `grep -rn "levelRank" functions/src frontend/projects nexago_app/lib --include=*.ts --include=*.dart | grep -v "\.test\.\|\.spec\." | grep -v "levelRankOf\|athleteLevelRank\|teamLevelRank\|categoryLevelRank\|resolveAthleteLevelRank\|levelRankBy"`
Leitores conhecidos do campo gravado: `functions/src/rating-ladder.ts:449` (`num(data.levelRank, 0)` — só compara/restaura estado, sem "5 = open" hardcoded → OK com o backfill). Qualquer hit novo que trate 5 como Open precisa de correção ANTES do backfill; registrar no PR o resultado do grep.

- [ ] **Step 3: Dry-run no dev**

Run: `cd functions && node scripts/backfill-open-rank-6.js --project volley-track-dev-4596c`
Expected: lista de atletas Open com os valores atuais e os docs `ratingLadders` encontrados; ZERO escrita.

- [ ] **Step 4: Commit (só o script — a execução com `--yes` é da Task 9)**

```bash
git add functions/scripts/backfill-open-rank-6.js
git commit -m "feat(scripts): backfill da renumeração do Open — levelRank 6, rating ≥2200, ratingLadders (NEXAGO)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Documentação de regra de negócio

**Files:**
- Modify: `docs/business-rules/levels.md` (tabela da escada, seção Glicko, aliases, seção "Escada única")

**Interfaces:**
- Consumes: tudo acima.
- Produces: doc alinhado — é a referência que as fases 2–4 citam.

- [ ] **Step 1: Editar** — tabela de 7 códigos/labels/ranks (Global Constraints); bandas Glicko novas na seção de rating; alias `'Avançado'`→`avancado_1` na lista de legados (removendo a menção a Intermediário 1); trocar as frases "escada de 5"/"rank 4 não é usado"/"nunca renumerar" por: ranks 0–6 contínuos, renumeração do Open (5→6) feita em 17/08 com backfill coordenado (`backfill-open-rank-6.js`), numeração congelada DAQUI em diante.

- [ ] **Step 2: Conferir referências cruzadas** — `grep -rn "escada de 5\|rank 4 não é usado\|rank 4 sem uso" docs functions/src frontend nexago_app --include=*.md --include=*.ts --include=*.dart` → zero hits restantes fora de specs/planos históricos.

- [ ] **Step 3: Commit**

```bash
git add docs/business-rules/levels.md
git commit -m "docs: escada de 7 níveis nas regras de negócio (NEXAGO)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Regressão completa das 3 superfícies

**Files:** nenhum novo — verificação.

- [ ] **Step 1: Functions** — `cd functions && npm test` → PASS (≥1148 testes).
- [ ] **Step 2: App** — `cd nexago_app && flutter test` → PASS.
- [ ] **Step 3: Portais** — `cd frontend && npx ng test athlete --watch=false && npx ng test organizer --watch=false && npx ng test backoffice --watch=false` → PASS.
- [ ] **Step 4: Lint das functions** — `cd functions && npm run lint` → sem erros.
- [ ] **Step 5:** Se qualquer passo falhou: corrigir na task correspondente, commitar como `fix:`, repetir. Só avançar com tudo verde.

---

### Task 9: Deploy dev + execução do backfill (GATED — confirmar com o dono antes)

**Files:** nenhum — operação.

**Ordem obrigatória** (rules e functions antes do backfill; o backfill assume as bandas novas):

- [ ] **Step 1: Confirmar com o dono** que é hora de aplicar no DEV (produção fica fora deste plano). Lembrete: redeploy de functions no dev recria revisões Eventarc mortas — existe receita de recuperação na memória do projeto (`dev-billing-disabled`).
- [ ] **Step 2: Deploy** — `firebase deploy --only firestore:rules,functions --project volley-track-dev-4596c`
- [ ] **Step 3: Backfill valendo** — `cd functions && node scripts/backfill-open-rank-6.js --project volley-track-dev-4596c --yes`
- [ ] **Step 4: Verificação pós-backfill** — re-rodar em dry-run: `node scripts/backfill-open-rank-6.js --project volley-track-dev-4596c` → zero pendências. Spot-check no console: um atleta Open com `levelRank: 6` e `rating ≥ 2200`; subir um nível de teste no app (Intermediário 2 → Avançado 1) e conferir o `levelHistory`.
