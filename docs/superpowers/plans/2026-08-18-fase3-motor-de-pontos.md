# Fase 3 — Motor de Pontos: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar ao ranking geral a tabela-base ×10 com pesos geométricos por preset, o modulador por tamanho de chave e a regra "Livre sem ponto de participação", com migração ×10 do histórico guardada por `scaleVersion`.

**Architecture:** Toda a mudança de pontos acontece num ponto único — `globalPointsForAward` em `functions/src/tournament-ranking.ts` (chamado por `awardGlobalPlacement`) — que passa a receber um multiplicador composto (`peso do preset × rankingWeight × fator de chave`) calculado uma vez em `tryAwardGlobalRankingForMatch`, onde o doc do torneio já está carregado (o preset deriva de `categoryPreset(findCategory(tournament, categoryId))`, Fase 2). Os resolvers de colocação não mudam. A regra do Livre corta o laço do bucket "grupos" nos DOIS motores (geral e liga). O histórico migra por script ×10 idempotente via `scaleVersion: 2`, que o motor também passa a gravar.

**Tech Stack:** TypeScript (Cloud Functions node:test), Dart/Flutter (espelho de exibição), script Node admin (ADC).

**Spec:** `docs/superpowers/specs/2026-08-17-category-presets-ranking-weights-design.md` — D4, D6 (emendado: só a regra do Livre sobrevive), D7 e D9. Base de código: branch da Fase 2 (`claude/fase2-presets-plano`, PR #250) — `CATEGORY_PRESETS`/`categoryPreset`/`LEGACY_CATEGORY_WEIGHT` de `functions/src/category-presets.ts` são pré-requisitos.

## Global Constraints

- **Tabela-base ×10** (`DEFAULT_GLOBAL_POINTS`): `"1": 1000 · "2": 800 · "3": 600 · "4": 500 · quarters: 330 · groups: 100`.
- **Pesos por preset** (JÁ gravados em `CATEGORY_PRESETS`, Fase 2 — não redefinir): elite 1.2 · open 1 · avancado 0.5 · intermediario 0.25 · iniciante 0.125 · livre 0.125. Categoria sem preset (legada/custom) = `LEGACY_CATEGORY_WEIGHT` (1).
- **Modulador por chave** (duplas PAGAS da categoria): `≥8 → 1` · `4–7 → 0.6` · `<4 → 0.25`.
- **Fórmula:** `pontos = max(0, round(base × pesoPreset × rankingWeight × fatorChave))` — arredonda UMA vez, no final. Âncora de sanidade: Elite (peso 1.2) com chave ≥8 e rankingWeight 1 → campeão 1200.
- **Livre sem participação:** o bucket `groups` não é concedido a NINGUÉM quando o preset da categoria é `livre` — nos DOIS motores (geral e liga). Colocações de mata-mata pontuam normalmente (com peso, no geral).
- **Só o ranking geral** ganha base nova/pesos/modulador; a liga mantém `rankingPointsByPlace` própria intocada (a única mudança na liga é o corte do bucket groups pro Livre).
- **Gate de desafio permanece:** `MIN_TEAMS_FOR_GLOBAL_RANKING = 10` (torneio avulso <10 pagas = zero; etapa de liga isenta do gate mas sujeita ao modulador).
- **`scaleVersion: 2`**: gravado pelo motor em `tournamentCategoryResults` e nos docs de `athleteRankings`/`teamRankings`; o script de migração multiplica ×10 só docs sem `scaleVersion >= 2` e os carimba.
- Testes SEMPRE em foreground (aguardar no mesmo comando — nunca backgroundar suíte; lição da Fase 2). Comandos: functions `cd functions && npm test` · app `cd nexago_app && flutter test`.
- Commits com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Deploy/migração só na task GATED final.

---

### Task 1: Motor geral — base ×10 e multiplicador com peso do preset

**Files:**
- Modify: `functions/src/tournament-ranking.ts` (DEFAULT_GLOBAL_POINTS ~l.33, `globalPointsForAward` ~l.76, `awardGlobalPlacement` ~l.215, `tryAwardGlobalRankingForMatch` ~l.290-360, doc-comment do topo)
- Test: `functions/src/tournament-ranking.test.ts`

**Interfaces:**
- Consumes: `categoryPreset(category)`, `LEGACY_CATEGORY_WEIGHT` de `./category-presets`; `findCategory(tournament, categoryId)` de `./tournament-registration-guards` (aceita o objeto do torneio com `categories[]`; casar o tipo com cast se `TournamentData` for exigido).
- Produces: `globalPointsForAward(award, multiplier: number): number` (assinatura mantida em aridade — o 2º parâmetro passa de "rankingWeight" a "multiplier composto"; renomear o parâmetro e o campo `rankingWeight` de `baseParams`/`awardGlobalPlacement` para `pointsMultiplier`). Tasks 2–3 estendem o cálculo do multiplier no MESMO ponto.

- [ ] **Step 1: Testes que falham** (estilo node:test do arquivo; adaptar os asserts existentes que fixam a base 100 na MESMA passada — eles são a maioria das falhas esperadas)

```ts
describe("motor fase 3 — base ×10 e peso do preset", () => {
  it("tabela-base reescalada ×10", () => {
    assert.deepStrictEqual(DEFAULT_GLOBAL_POINTS, {
      "1": 1000, "2": 800, "3": 600, "4": 500, quarters: 330, groups: 100,
    });
  });
  it("multiplier composto arredonda uma vez no final", () => {
    // Intermediário (0.25) nas quartas: 330 × 0.25 = 82.5 → 83
    assert.strictEqual(globalPointsForAward({teamId: "t", bucket: "quarters"}, 0.25), 83);
    // Iniciante (0.125) nos grupos: 100 × 0.125 = 12.5 → 13
    assert.strictEqual(globalPointsForAward({teamId: "t", bucket: "groups"}, 0.125), 13);
    // Elite (1.2) campeão: 1000 × 1.2 = 1200 — âncora da spec
    assert.strictEqual(globalPointsForAward({teamId: "t", place: 1}, 1.2), 1200);
  });
  it("multiplier inválido cai em 1 (paridade com o guard antigo)", () => {
    assert.strictEqual(globalPointsForAward({teamId: "t", place: 1}, NaN), 1000);
    assert.strictEqual(globalPointsForAward({teamId: "t", place: 1}, 0), 1000);
  });
});
```

E, nos testes de integração do trigger que o arquivo já tem (fake firestore): um caso novo em que o torneio tem `categories: [{categoryName: <id da partida>, level: "Open", minLevel: "Avançado 1"}]` (preset `open`, peso 1) e outro com `level: "Open", minLevel: "Open"` (preset `elite`) esperando pontos ×1.2; e um SEM `minLevel` (legado) esperando peso 1.

- [ ] **Step 2: Rodar e ver falhar** — `cd functions && npm test` (foreground) → FAIL nos novos + nos asserts antigos de base 100.

- [ ] **Step 3: Implementar**

```ts
export const DEFAULT_GLOBAL_POINTS: Record<string, number> = {
  "1": 1000,
  "2": 800,
  "3": 600,
  "4": 500,
  quarters: 330,
  groups: 100,
};
```

`globalPointsForAward(award, multiplier)`: mesmo corpo, com o guard `Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1`. Em `tryAwardGlobalRankingForMatch`, depois de carregar o torneio:

```ts
const category = findCategory(tournament as never, categoryId);
const preset = categoryPreset(category);
const presetWeight = preset?.weight ?? LEGACY_CATEGORY_WEIGHT;
const pointsMultiplier = presetWeight * rankingWeight;
```

`baseParams` carrega `pointsMultiplier` (o campo `rankingWeight` some de `awardGlobalPlacement`). Atualizar o doc-comment do topo (tabela nova, fórmula, preset derivado — nunca lido de campo gravado). Atualizar TODOS os asserts antigos de base 100 pela tabela nova (mesma intenção, números ×10; onde o teste não define categoria, o preset deriva null → peso 1, só a escala muda).

- [ ] **Step 4: Verde** — `cd functions && npm test` → PASS integral.

- [ ] **Step 5: Commit**

```bash
git add functions/src/tournament-ranking.ts functions/src/tournament-ranking.test.ts
git commit -m "feat(ranking): base 1000 com pesos geométricos por preset no ranking geral (NEXAGO)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Modulador por tamanho de chave

**Files:**
- Modify: `functions/src/tournament-ranking.ts` (função nova + composição do multiplier)
- Test: `functions/src/tournament-ranking.test.ts`

**Interfaces:**
- Consumes: `paidTeamIds.size` (já disponível em `tryAwardGlobalRankingForMatch` — a query de pagas já roda antes da premiação).
- Produces: `bracketSizeFactor(paidTeamsCount: number): number` exportada.

- [ ] **Step 1: Testes que falham**

```ts
describe("modulador por tamanho de chave", () => {
  it("degraus do fator", () => {
    assert.strictEqual(bracketSizeFactor(8), 1);
    assert.strictEqual(bracketSizeFactor(12), 1);
    assert.strictEqual(bracketSizeFactor(7), 0.6);
    assert.strictEqual(bracketSizeFactor(4), 0.6);
    assert.strictEqual(bracketSizeFactor(3), 0.25);
    assert.strictEqual(bracketSizeFactor(0), 0.25);
  });
});
```

E um caso de integração: etapa de liga (`leagueId` presente — isenta do gate de 10) com 3 duplas pagas e categoria Elite → campeão ganha `round(1000 × 1.2 × 0.25) = 300`.

- [ ] **Step 2: RED** — `cd functions && npm test` (foreground) → FAIL.

- [ ] **Step 3: Implementar**

```ts
/**
 * Modulador por tamanho de chave (D7): protege o ranking de chaves
 * minúsculas no topo (Elite de 3 duplas valendo pódio cheio). Baseado nas
 * duplas PAGAS da categoria — mesma contagem do gate de desafio. Some
 * sozinho quando as chaves enchem.
 */
export function bracketSizeFactor(paidTeamsCount: number): number {
  if (paidTeamsCount >= 8) return 1;
  if (paidTeamsCount >= 4) return 0.6;
  return 0.25;
}
```

Composição: `const pointsMultiplier = presetWeight * rankingWeight * bracketSizeFactor(paidTeamIds.size);` (substitui a linha da Task 1). O gate `isGlobalRankingEligible` continua ANTES, inalterado.

- [ ] **Step 4: Verde** — `cd functions && npm test` → PASS (ajustar asserts de integração da Task 1 que usavam contagens de pagas < 8 sem intenção — dar a eles ≥8 pagas ou incorporar o fator ao valor esperado, preservando a intenção de cada teste).

- [ ] **Step 5: Commit**

```bash
git add functions/src/tournament-ranking.ts functions/src/tournament-ranking.test.ts
git commit -m "feat(ranking): modulador por tamanho de chave no ranking geral (NEXAGO)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Livre sem ponto de participação (geral e liga)

**Files:**
- Modify: `functions/src/tournament-ranking.ts` (laço do bucket groups, ~l.359-374)
- Modify: `functions/src/league-ranking.ts` (`tryAwardLeagueStagePointsForMatch` ~l.581-647 — o call de `tryAwardGroupsPlacements` em ~l.643; o doc do torneio já está carregado nesse escopo)
- Test: `functions/src/tournament-ranking.test.ts`, `functions/src/league-ranking.test.ts`

**Interfaces:**
- Consumes: `preset` derivado na Task 1 (geral); `categoryPreset`+`findCategory` importados também em league-ranking.ts (liga).
- Produces: comportamento — categoria `livre` nunca concede o bucket `groups` em nenhum motor; demais presets/legadas inalteradas.

- [ ] **Step 1: Testes que falham** — geral: partida de mata-mata concluída numa categoria `{level: "Open", minLevel: "Iniciante 1"}` (preset livre) com duplas pagas fora do mata-mata → nenhuma delas recebe pontos de groups (mas o perdedor da partida recebe a colocação normal ×0.125). Liga: mesma categoria numa etapa de liga → `tryAwardGroupsPlacements` não roda (zero updates de groups); categoria Intermediário na liga segue concedendo groups (controle).

- [ ] **Step 2: RED** — `cd functions && npm test` (foreground) → FAIL.

- [ ] **Step 3: Implementar** — geral:

```ts
// Livre não concede participação (D6 emendada): só pontua quem chega
// ao mata-mata — fecha o farm de "aparecer e levar o bucket groups".
if (shouldAwardGroupsBucket && preset?.key !== "livre") {
```

Liga (em `tryAwardLeagueStagePointsForMatch`, usando o `tournament` já carregado):

```ts
if (isNonGroupCompletedMatch(match)) {
  const preset = categoryPreset(findCategory(tournament as never, categoryId));
  if (preset?.key !== "livre") {
    teamsUpdated += await tryAwardGroupsPlacements(db, projectId, baseParams);
  }
}
```

- [ ] **Step 4: Verde** — `cd functions && npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/tournament-ranking.ts functions/src/league-ranking.ts functions/src/tournament-ranking.test.ts functions/src/league-ranking.test.ts
git commit -m "feat(ranking): Livre não concede ponto de participação — geral e liga (NEXAGO)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `scaleVersion` no motor + script de migração ×10

**Files:**
- Modify: `functions/src/tournament-ranking.ts` (`awardGlobalPlacement` resultRef.set + `upsertGlobalRankingDoc` ref.set: campo `scaleVersion: 2`)
- Create: `functions/scripts/backfill-ranking-scale-x10.js` (esqueleto de CLI/ADC/dry-run copiado de `functions/scripts/backfill-open-rank-6.js` — header PT, `--project` obrigatório, dry-run default, `--yes`, `--limit`)
- Test: `functions/src/tournament-ranking.test.ts` (scaleVersion nos writes); script: `node --check` + dry-run dev

**Interfaces:**
- Consumes: `aggregateRankingResults` (soma integral, D1) — o script recomputa agregados com a MESMA regra: reimplementar a soma no script (JS puro, sem import do bundle), com comentário de paridade.
- Produces: constante `RANKING_SCALE_VERSION = 2` exportada de tournament-ranking.ts; docs novos sempre carimbados.

- [ ] **Step 1: Testes que falham** — nos testes de integração existentes, os writes de `tournamentCategoryResults` e dos docs de ranking passam a incluir `scaleVersion: 2`.

- [ ] **Step 2: RED** → **Step 3: Implementar** — `export const RANKING_SCALE_VERSION = 2;` usado nos dois `set`. Script:

```js
// Núcleo (dentro do esqueleto CLI copiado):
// (a) tournamentCategoryResults: pointsEarned ×10 + carimbo.
const results = await db.collection(`artifacts/${projectId}/public/data/tournamentCategoryResults`).get();
for (const doc of results.docs) {
  const d = doc.data();
  if ((Number(d.scaleVersion) || 0) >= 2) continue;
  const update = {pointsEarned: Math.round((Number(d.pointsEarned) || 0) * 10), scaleVersion: 2};
  console.log(`  ${doc.id}: ${d.pointsEarned} → ${update.pointsEarned}`);
  if (APPLY) await doc.ref.update(update);
}
// (b) athleteRankings e teamRankings: results[].points ×10 + agregados
//     recomputados com a soma INTEGRAL por ano (paridade com
//     aggregateRankingResults pós-D1) + carimbo.
for (const coll of ["athleteRankings", "teamRankings"]) {
  const snap = await db.collection(`artifacts/${projectId}/public/data/${coll}`).get();
  for (const doc of snap.docs) {
    const d = doc.data();
    if ((Number(d.scaleVersion) || 0) >= 2) continue;
    const results = Array.isArray(d.results) ? d.results : [];
    const scaled = results.map((r) => ({...r, points: Math.round((Number(r.points) || 0) * 10)}));
    const pointsByYear = {};
    let totalPoints = 0;
    for (const r of scaled) {
      const y = String(r.year ?? 0);
      pointsByYear[y] = (pointsByYear[y] || 0) + Math.max(0, Math.round(Number(r.points) || 0));
    }
    for (const y of Object.keys(pointsByYear)) totalPoints += pointsByYear[y];
    const update = {results: scaled, totalPoints, pointsByYear, tournamentsCount: scaled.length, scaleVersion: 2};
    console.log(`  ${coll}/${doc.id}: total ${d.totalPoints} → ${totalPoints}`);
    if (APPLY) await doc.ref.update(update);
  }
}
```

Idempotência: o carimbo `scaleVersion >= 2` pula na re-execução; docs criados pelo motor novo já nascem carimbados e nunca são multiplicados.

- [ ] **Step 4: Verificar** — `cd functions && npm test` (foreground) → PASS; `node --check scripts/backfill-ranking-scale-x10.js`; dry-run no dev: `node scripts/backfill-ranking-scale-x10.js --project volley-track-dev-4596c` — colar a saída no report (quantos docs, exemplos de total antes→depois); ZERO escrita.

- [ ] **Step 5: Commit**

```bash
git add functions/src/tournament-ranking.ts functions/src/tournament-ranking.test.ts functions/scripts/backfill-ranking-scale-x10.js
git commit -m "feat(ranking): scaleVersion 2 no motor + migração ×10 do histórico (NEXAGO)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Espelhos de exibição (app + portal)

**Files:**
- Modify: `nexago_app/lib/features/ranking/domain/ranking_constants.dart` (`pointsByPlace` ×10: 1..4 = 1000/800/600/500, 5..8 = 330; NÃO tocar `rankingPointsBaseSum`/`getPointsByPlaceFromTotal` — são da tabela custom de LIGA)
- Modify: `nexago_app/lib/features/ranking/presentation/widgets/ranking_how_it_works_sheet.dart` (seção nova "PESOS POR CATEGORIA" + nota do modulador)
- Test: `nexago_app/test/features/ranking/` (asserts da tabela) 
- Verificar portal: `grep -rn "100\b.*80\b\|pointsByPlace\|Como funciona" frontend/projects/athlete/src/app/ranking frontend/projects/athlete/src/app/data/rankings-repository.ts --include=*.ts --include=*.html` — o portal lê valores persistidos; só corrigir se algum lugar exibir a tabela hardcoded (reportar cada hit)

**Interfaces:**
- Produces: `categoryPresetWeights` const Dart (exibição apenas — espelho dos pesos de `CATEGORY_PRESETS`): `{'Elite': 1.2, 'Open': 1.0, 'Avançado': 0.5, 'Intermediário': 0.25, 'Iniciante': 0.125, 'Livre': 0.125}`.

- [ ] **Step 1: Testes que falham** — `getPointsForPlace(1) == 1000`, `(5) == 330`; sheet exibe "PESOS POR CATEGORIA" com Elite ×1.2 e a nota "No Livre, só pontua quem chega ao mata-mata".
- [ ] **Step 2: RED** (`cd nexago_app && flutter test test/features/ranking/`, foreground) → **Step 3: Implementar** — tabela ×10; const de pesos; seção na sheet no padrão `_SectionLabel`/`_PointsRow` existente (pesos como texto "×1.2" etc.); nota curta do modulador ("chaves com menos de 8 duplas pagas pontuam reduzido").
- [ ] **Step 4: Verde** — `cd nexago_app && flutter test` (suíte completa, foreground) → PASS; grep do portal executado e reportado.
- [ ] **Step 5: Commit**

```bash
git add nexago_app
git commit -m "feat(app): tabela 1000 e pesos por categoria na folha do ranking (NEXAGO)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Docs de regra de negócio

**Files:**
- Modify: `docs/business-rules/ranking.md` (seção "Ranking geral nexaGO" reescrita: tabela-base 1000, pesos por preset com a tabela completa de campeão — 1200/1000/500/250/125/125, categoria legada 1.0, modulador ≥8/4–7/<4, Livre sem participação, gate de 10 mantido, scaleVersion/migração ×10 com data)

- [ ] **Step 1: Editar** conforme os valores das Global Constraints (a nota da fase 3 colocada pela Fase 2 sai — a regra agora é vigente).
- [ ] **Step 2: Conferir** — `grep -n "100\b" docs/business-rules/ranking.md` → nenhum resquício da escala antiga fora de contexto histórico.
- [ ] **Step 3: Commit**

```bash
git add docs/business-rules/ranking.md
git commit -m "docs: motor de pontos da fase 3 nas regras do ranking (NEXAGO)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Regressão

- [ ] **Step 1:** `cd functions && npm test` (foreground) → PASS.
- [ ] **Step 2:** `cd nexago_app && flutter test` (foreground) → PASS.
- [ ] **Step 3:** `cd frontend && npx ng test athlete --watch=false` (foreground; portal só se a Task 5 tocou nele — senão pular e registrar) → PASS.
- [ ] **Step 4:** `cd functions && npm run lint` → 0 erros.

---

### Task 8: Deploy dev + migração ×10 (GATED — confirmar com o dono)

**Ordem obrigatória** (mesma janela; o motor novo grava pontos na escala nova — rodar a migração logo após o deploy evita mistura):

- [ ] **Step 1: Confirmar com o dono** que é hora do DEV (produção fora deste plano). Pré-requisito: PR da fase mergeado (ou deploy a partir da branch, decisão do dono).
- [ ] **Step 2: Deploy** — `firebase deploy --only functions --project volley-track-dev-4596c` (rules não mudam nesta fase).
- [ ] **Step 3: Migração valendo** — `cd functions && node scripts/backfill-ranking-scale-x10.js --project volley-track-dev-4596c --yes`.
- [ ] **Step 4: Verificação** — re-run dry → zero docs sem carimbo; spot-check: um doc de `athleteRankings` com totalPoints ×10 e `scaleVersion: 2`; conferir no app/portal que o ranking exibe os totais novos.
