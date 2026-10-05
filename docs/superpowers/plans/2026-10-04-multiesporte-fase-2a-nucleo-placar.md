# Multiesporte, fase 2a: núcleo do perfil de placar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Existir um único núcleo de regras de placar por linguagem, parametrizado por um `ScoringProfile` (`sets_points` ou `sets_games`), com paridade provada por vetores compartilhados; o servidor carimba o perfil nas partidas novas e decide o vencedor por ele; as quatro cópias da regra de 21 pontos passam a delegar ao núcleo. Nenhum comportamento visível muda.

**Architecture:** O perfil padrão de cada esporte entra em `sports/catalog.json`; os casos de teste do placar ficam em `sports/scoring-vectors.json`. O codegen da fase 1 passa a emitir os perfis no catálogo e os vetores nos três alvos. Cada linguagem ganha dois módulos escritos à mão: tipos do perfil (com parse do Firestore e o perfil histórico) e regras (vencedor de set, de partida e validação de placar final). As funções antigas mantêm as assinaturas e viram invólucros que chamam o núcleo com o perfil histórico, então as suítes existentes provam que nada mudou.

**Tech Stack:** Node 22 (codegen), Cloud Functions TS (`node --test`), Angular 20 (Karma), Flutter/Dart 3 (sealed classes, records).

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md`, "Eixo 2" e a **emenda de 04/10/2026 (fase 2)**, que define o recorte desta entrega (2a).

**Base:** branch `claude/multiesporte-fase-2a-placar`, empilhada sobre a fase 1 (`claude/multiesporte-fase-1-catalogo`, PR #570).

## Global Constraints

- **Zero mudança de comportamento visível.** Todo teste existente de placar passa sem alteração; mensagens de validação idênticas às de hoje no perfil histórico.
- Perfil histórico: `sets_points`, alvo 21, decisivo 15 **só quando `bestOf` é 3**, vantagem 2, sem teto. Partida sem `scoringProfile` carimbado usa sempre ele, qualquer que seja o esporte.
- Os esportes de competição atuais têm perfil padrão igual ao histórico até a 2d.
- O servidor continua aceitando placar parcial (sem vencedor) como hoje; só a estrutura é validada.
- `bestOf5` da categoria continua virando MD3 no carimbo (`matchBestOfFromCategory`), como hoje.
- Set de games: `{a, b, tb?: {a, b}}` (tie-break ou super tie-break em `tb`); super tie-break no set decisivo grava `a/b` como 1×0.
- **Nunca `dart format` em arquivo Dart existente.** Arquivo novo à mão: dart do Flutter (`/Users/silviodionizio/development/flutter/bin/cache/dart-sdk/bin/dart format`). Gerado não é formatado.
- `node_modules` por symlink no worktree; apagar `functions/node_modules` antes do PR. Karma com `cd frontend` e `--browsers=ChromeHeadless`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Partida antiga sem `scoringProfile` e com `bestOf` 1, 3 ou 5: vencedor e mensagens idênticos aos de hoje (MD5 vai a 21 no 5º set). Vetores `legacy*` no Task 1, rodados nos Tasks 2, 4 e 5.
2. `scoringProfile` malformado no Firestore (campo faltando, `bestOf: 2`, `kind` desconhecido): cai no histórico, nunca lança. Teste no Task 2.
3. Set de games 7×6 sem `tb`, ou com `tb` do lado contrário: não é vitória; mensagem pede o tie-break. Vetores no Task 1.
4. Super tie-break no set decisivo com `a/b` diferente de 1×0, ou `tb` 10×9: não é vitória. Vetores no Task 1.
5. Lançamento com `tb` numa partida de pontos: o servidor ignora o `tb` (não grava lixo). Teste no Task 3.

---

## Comandos de teste

| Camada | Comando |
|---|---|
| Codegen + guardas | `cd functions && node --test test/sports-catalog.test.mjs` |
| Functions | `cd functions && npm run build && node --test lib/sports/scoring.test.js` / tudo: `npm test` |
| Portais | `cd frontend && npx ng test <projeto> --watch=false --browsers=ChromeHeadless [--include=...]` |
| App | `cd nexago_app && flutter test test/core/sports` / tudo: `flutter test` |

---

### Task 1: Perfis no catálogo, vetores de placar e codegen

**Files:**
- Create: `sports/scoring-vectors.json`
- Create: `functions/src/sports/scoring-profile.ts`, `frontend/shared/sports/scoring-profile.ts` (só tipos; o catálogo gerado importa daqui)
- Create: `nexago_app/lib/core/sports/scoring_profile.dart` (tipos Dart; o catálogo gerado importa daqui)
- Modify: `sports/catalog.json` (campo `scoringProfile`), `sports/codegen.mjs`
- Regenerate: os seis arquivos gerados
- Modify: `functions/test/sports-catalog.test.mjs` (caso novo)

**Interfaces:**
- Produces (TS): `MatchBestOf`, `SetsPointsProfile`, `SetsGamesProfile`, `ScoringProfile`; `SportCatalogEntry.scoringProfile: ScoringProfile | null`; `SCORING_VECTORS` em `vectors.generated.ts`.
- Produces (Dart): `DecidingSet`, `ScoringProfile` (sealed), `SetsPointsProfile`, `SetsGamesProfile`; `SportCatalogEntry.scoringProfile`; `kScoringVectorsJson` em `test/core/sports/sport_vectors_data.dart`.

- [ ] **Step 1: Teste que falha**

Acrescentar a `functions/test/sports-catalog.test.mjs`:

```js
test('todo esporte de competição tem perfil de placar no catálogo', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'sports/catalog.json'), 'utf8'));
  const semPerfil = catalog.sports
    .filter((s) => s.support === 'competition' && !s.scoringProfile)
    .map((s) => s.code);
  assert.deepEqual(semPerfil, []);
});
```

Run: `cd functions && node --test test/sports-catalog.test.mjs` → Expected: FAIL no caso novo (nenhum esporte tem `scoringProfile`).

- [ ] **Step 2: Tipos à mão (TS, idênticos nos dois alvos; aspas duplas nas functions, simples na web)**

```ts
// functions/src/sports/scoring-profile.ts
/**
 * Perfil de placar (spec multiesporte, eixo 2). Só tipos: o catálogo gerado e
 * o núcleo de regras (`scoring.ts`) importam daqui.
 */
export type MatchBestOf = number;

export interface SetsPointsProfile {
  readonly kind: "sets_points";
  readonly bestOf: MatchBestOf;
  readonly setTarget: number;
  /** Alvo do set decisivo (o último possível); ignorado em MD1. */
  readonly decidingSetTarget: number;
  readonly winBy: number;
  /** Teto: quem chega nele vence o set mesmo sem a vantagem. `null` = sem teto. */
  readonly pointCap: number | null;
}

export interface SetsGamesProfile {
  readonly kind: "sets_games";
  readonly bestOf: MatchBestOf;
  readonly gamesPerSet: number;
  readonly winByGames: number;
  /** Placar de games em que o set vai a tie-break (6 → 6×6). `null` = set de vantagem. */
  readonly tiebreakAtGames: number | null;
  readonly tiebreakTo: number;
  readonly noAd: boolean;
  /** Set decisivo completo ou trocado por um super tie-break. */
  readonly decidingSet: "full" | "super_tiebreak";
  readonly superTiebreakTo: number;
}

export type ScoringProfile = SetsPointsProfile | SetsGamesProfile;
```

`frontend/shared/sports/scoring-profile.ts`: o mesmo, com aspas simples e o comentário de topo citando `@nexago/sports`.

- [ ] **Step 3: Tipos à mão (Dart)**

```dart
// nexago_app/lib/core/sports/scoring_profile.dart
/// Perfil de placar (spec multiesporte, eixo 2). Só tipos e construtores
/// `const`: o catálogo gerado instancia daqui e o núcleo de regras lê.
enum DecidingSet { full, superTiebreak }

sealed class ScoringProfile {
  const ScoringProfile({required this.bestOf});

  final int bestOf;
}

final class SetsPointsProfile extends ScoringProfile {
  const SetsPointsProfile({
    required super.bestOf,
    required this.setTarget,
    required this.decidingSetTarget,
    required this.winBy,
    required this.pointCap,
  });

  final int setTarget;

  /// Alvo do set decisivo (o último possível); ignorado em MD1.
  final int decidingSetTarget;
  final int winBy;

  /// Teto: quem chega nele vence o set mesmo sem a vantagem.
  final int? pointCap;
}

final class SetsGamesProfile extends ScoringProfile {
  const SetsGamesProfile({
    required super.bestOf,
    required this.gamesPerSet,
    required this.winByGames,
    required this.tiebreakAtGames,
    required this.tiebreakTo,
    required this.noAd,
    required this.decidingSet,
    required this.superTiebreakTo,
  });

  final int gamesPerSet;
  final int winByGames;

  /// Placar de games em que o set vai a tie-break. `null` = set de vantagem.
  final int? tiebreakAtGames;
  final int tiebreakTo;
  final bool noAd;
  final DecidingSet decidingSet;
  final int superTiebreakTo;
}
```

- [ ] **Step 4: Perfis no catálogo**

Em `sports/catalog.json`, acrescentar a chave `scoringProfile` em cada esporte:
- `beachVolleyball`, `indoorVolleyball`, `footvolley`: `{"kind": "sets_points", "bestOf": 3, "setTarget": 21, "decidingSetTarget": 15, "winBy": 2, "pointCap": null}` (igual ao histórico até a 2d).
- `beachTennis`: `{"kind": "sets_games", "bestOf": 3, "gamesPerSet": 6, "winByGames": 2, "tiebreakAtGames": 6, "tiebreakTo": 7, "noAd": true, "decidingSet": "super_tiebreak", "superTiebreakTo": 10}`.
- `tennis`: igual ao de beach tennis com `"noAd": false` e `"decidingSet": "full"`.
- `football`, `basketball`, `running`, `other`: `null`.

- [ ] **Step 5: Vetores de placar**

```json
{
  "$comment": "Casos de placar compartilhados pelas três implementações (functions, @nexago/sports, app). Mensagens são as exibidas ao usuário.",
  "profiles": {
    "legacy1": {"kind": "sets_points", "bestOf": 1, "setTarget": 21, "decidingSetTarget": 21, "winBy": 2, "pointCap": null},
    "legacy3": {"kind": "sets_points", "bestOf": 3, "setTarget": 21, "decidingSetTarget": 15, "winBy": 2, "pointCap": null},
    "legacy5": {"kind": "sets_points", "bestOf": 5, "setTarget": 21, "decidingSetTarget": 21, "winBy": 2, "pointCap": null},
    "indoor3": {"kind": "sets_points", "bestOf": 3, "setTarget": 25, "decidingSetTarget": 15, "winBy": 2, "pointCap": null},
    "capped1": {"kind": "sets_points", "bestOf": 1, "setTarget": 21, "decidingSetTarget": 21, "winBy": 2, "pointCap": 25},
    "bt3": {"kind": "sets_games", "bestOf": 3, "gamesPerSet": 6, "winByGames": 2, "tiebreakAtGames": 6, "tiebreakTo": 7, "noAd": true, "decidingSet": "super_tiebreak", "superTiebreakTo": 10},
    "tennis3": {"kind": "sets_games", "bestOf": 3, "gamesPerSet": 6, "winByGames": 2, "tiebreakAtGames": 6, "tiebreakTo": 7, "noAd": false, "decidingSet": "full", "superTiebreakTo": 10},
    "proSet1": {"kind": "sets_games", "bestOf": 1, "gamesPerSet": 8, "winByGames": 2, "tiebreakAtGames": 8, "tiebreakTo": 7, "noAd": true, "decidingSet": "full", "superTiebreakTo": 10},
    "advantage1": {"kind": "sets_games", "bestOf": 1, "gamesPerSet": 6, "winByGames": 2, "tiebreakAtGames": null, "tiebreakTo": 7, "noAd": false, "decidingSet": "full", "superTiebreakTo": 10}
  },
  "cases": [
    {"profile": "legacy3", "sets": [{"a": 21, "b": 19}, {"a": 15, "b": 21}, {"a": 15, "b": 13}], "setWinners": ["A", "B", "A"], "matchWinner": "A", "issues": []},
    {"profile": "legacy3", "sets": [{"a": 21, "b": 20}], "setWinners": [null], "matchWinner": null, "issues": ["Set 1: vitória exige 21 pontos com vantagem de 2."]},
    {"profile": "legacy3", "sets": [{"a": 21, "b": 15}, {"a": 21, "b": 18}], "setWinners": ["A", "A"], "matchWinner": "A", "issues": []},
    {"profile": "legacy3", "sets": [{"a": 21, "b": 15}], "setWinners": ["A"], "matchWinner": null, "issues": ["Complete o placar: nenhuma dupla venceu ainda."]},
    {"profile": "legacy3", "sets": [{"a": 21, "b": 19}, {"a": 19, "b": 21}, {"a": 14, "b": 12}], "setWinners": ["A", "B", null], "matchWinner": null, "issues": ["Set 3: vitória exige 15 pontos com vantagem de 2."]},
    {"profile": "legacy3", "sets": [{"a": 10, "b": 10}], "setWinners": [null], "matchWinner": null, "issues": ["Set 1: não pode terminar empatado."]},
    {"profile": "legacy3", "sets": [{"a": 100, "b": 98}], "setWinners": ["A"], "matchWinner": null, "issues": ["Set 1: placar fora do intervalo (0–99)."]},
    {"profile": "legacy3", "sets": [], "setWinners": [], "matchWinner": null, "issues": ["Informe ao menos um set."]},
    {"profile": "legacy1", "sets": [{"a": 21, "b": 19}, {"a": 21, "b": 19}], "setWinners": ["A", "A"], "matchWinner": "A", "issues": ["Máximo de 1 sets."]},
    {"profile": "legacy1", "sets": [{"a": 15, "b": 13}], "setWinners": [null], "matchWinner": null, "issues": ["Set 1: vitória exige 21 pontos com vantagem de 2."]},
    {"profile": "legacy5", "sets": [{"a": 21, "b": 19}, {"a": 19, "b": 21}, {"a": 21, "b": 19}, {"a": 19, "b": 21}, {"a": 15, "b": 13}], "setWinners": ["A", "B", "A", "B", null], "matchWinner": null, "issues": ["Set 5: vitória exige 21 pontos com vantagem de 2."]},
    {"profile": "indoor3", "sets": [{"a": 25, "b": 23}, {"a": 21, "b": 25}, {"a": 15, "b": 10}], "setWinners": ["A", "B", "A"], "matchWinner": "A", "issues": []},
    {"profile": "capped1", "sets": [{"a": 25, "b": 24}], "setWinners": ["A"], "matchWinner": "A", "issues": []},
    {"profile": "capped1", "sets": [{"a": 24, "b": 23}], "setWinners": [null], "matchWinner": null, "issues": ["Set 1: vitória exige 21 pontos com vantagem de 2 (teto 25)."]},
    {"profile": "bt3", "sets": [{"a": 6, "b": 4}, {"a": 7, "b": 5}], "setWinners": ["A", "A"], "matchWinner": "A", "issues": []},
    {"profile": "bt3", "sets": [{"a": 6, "b": 5}], "setWinners": [null], "matchWinner": null, "issues": ["Set 1: set até 6 games com vantagem de 2."]},
    {"profile": "bt3", "sets": [{"a": 7, "b": 6}], "setWinners": [null], "matchWinner": null, "issues": ["Set 1: 7-6 exige o placar do tie-break."]},
    {"profile": "bt3", "sets": [{"a": 7, "b": 6, "tb": {"a": 7, "b": 5}}, {"a": 4, "b": 6}, {"a": 1, "b": 0, "tb": {"a": 10, "b": 8}}], "setWinners": ["A", "B", "A"], "matchWinner": "A", "issues": []},
    {"profile": "bt3", "sets": [{"a": 7, "b": 6, "tb": {"a": 5, "b": 7}}], "setWinners": [null], "matchWinner": null, "issues": ["Set 1: tie-break até 7 com vantagem de 2."]},
    {"profile": "bt3", "sets": [{"a": 7, "b": 6, "tb": {"a": 7, "b": 6}}], "setWinners": [null], "matchWinner": null, "issues": ["Set 1: tie-break até 7 com vantagem de 2."]},
    {"profile": "bt3", "sets": [{"a": 8, "b": 6}], "setWinners": [null], "matchWinner": null, "issues": ["Set 1: set até 6 games com vantagem de 2."]},
    {"profile": "bt3", "sets": [{"a": 6, "b": 3}, {"a": 3, "b": 6}, {"a": 1, "b": 0, "tb": {"a": 10, "b": 9}}], "setWinners": ["A", "B", null], "matchWinner": null, "issues": ["Set 3: super tie-break até 10 com vantagem de 2."]},
    {"profile": "bt3", "sets": [{"a": 6, "b": 3}, {"a": 3, "b": 6}, {"a": 0, "b": 1, "tb": {"a": 10, "b": 8}}], "setWinners": ["A", "B", null], "matchWinner": null, "issues": ["Set 3: super tie-break até 10 com vantagem de 2."]},
    {"profile": "bt3", "sets": [{"a": 6, "b": 3}, {"a": 3, "b": 6}, {"a": 6, "b": 4}], "setWinners": ["A", "B", null], "matchWinner": null, "issues": ["Set 3: super tie-break até 10 com vantagem de 2."]},
    {"profile": "tennis3", "sets": [{"a": 6, "b": 3}, {"a": 3, "b": 6}, {"a": 7, "b": 5}], "setWinners": ["A", "B", "A"], "matchWinner": "A", "issues": []},
    {"profile": "proSet1", "sets": [{"a": 8, "b": 6}], "setWinners": ["A"], "matchWinner": "A", "issues": []},
    {"profile": "proSet1", "sets": [{"a": 9, "b": 8, "tb": {"a": 7, "b": 3}}], "setWinners": ["A"], "matchWinner": "A", "issues": []},
    {"profile": "advantage1", "sets": [{"a": 9, "b": 7}], "setWinners": ["A"], "matchWinner": "A", "issues": []}
  ]
}
```

- [ ] **Step 6: Codegen emite perfis e vetores**

Em `sports/codegen.mjs`:

1. Validar o perfil. Acrescentar acima de `validate`:

```js
const BEST_OF = [1, 3, 5];
const posInt = (v) => Number.isInteger(v) && v > 0;

export function validateScoringProfile(where, p) {
  if (p === null) return;
  if (!p || typeof p !== 'object') fail(`scoringProfile inválido em ${where}`);
  if (!BEST_OF.includes(p.bestOf)) fail(`bestOf inválido em ${where}: ${p.bestOf}`);
  if (p.kind === 'sets_points') {
    for (const k of ['setTarget', 'decidingSetTarget', 'winBy']) {
      if (!posInt(p[k])) fail(`${k} inválido em ${where}`);
    }
    if (p.pointCap !== null && !posInt(p.pointCap)) fail(`pointCap inválido em ${where}`);
    return;
  }
  if (p.kind === 'sets_games') {
    for (const k of ['gamesPerSet', 'winByGames', 'tiebreakTo', 'superTiebreakTo']) {
      if (!posInt(p[k])) fail(`${k} inválido em ${where}`);
    }
    if (p.tiebreakAtGames !== null && !posInt(p.tiebreakAtGames)) fail(`tiebreakAtGames inválido em ${where}`);
    if (typeof p.noAd !== 'boolean') fail(`noAd inválido em ${where}`);
    if (!['full', 'super_tiebreak'].includes(p.decidingSet)) fail(`decidingSet inválido em ${where}`);
    return;
  }
  fail(`kind de placar desconhecido em ${where}: ${p.kind}`);
}
```

Em `validate`, dentro do laço: `if (!('scoringProfile' in s)) fail(\`scoringProfile ausente em ${s.code}\`); validateScoringProfile(s.code, s.scoringProfile); if (s.support === 'competition' && !s.scoringProfile) fail(\`esporte de competição sem scoringProfile: ${s.code}\`);`

2. Ler e validar os vetores em `outputs()`: `const scoring = JSON.parse(fs.readFileSync(path.join(ROOT, 'sports/scoring-vectors.json'), 'utf8')); for (const [name, p] of Object.entries(scoring.profiles)) validateScoringProfile(\`vetor ${name}\`, p); for (const c of scoring.cases) if (!(c.profile in scoring.profiles)) fail(\`vetor com perfil desconhecido: ${c.profile}\`);` e passar `scoring` para os renderizadores de vetores.

3. TS do catálogo: acrescentar `import type {ScoringProfile} from "./scoring-profile";` logo após o cabeçalho; `readonly scoringProfile: ScoringProfile | null;` na interface; e `, scoringProfile: ${ts(s.scoringProfile)}` em cada linha.

4. TS dos vetores: acrescentar ao fim

```js
    'export interface ScoringVectorCase {',
    '  readonly profile: string;',
    '  readonly sets: ReadonlyArray<{a: number; b: number; tb?: {a: number; b: number}}>;',
    '  readonly setWinners: ReadonlyArray<"A" | "B" | null>;',
    '  readonly matchWinner: "A" | "B" | null;',
    '  readonly issues: readonly string[];',
    '}',
    '',
    `export const SCORING_VECTORS: {readonly profiles: Readonly<Record<string, unknown>>; readonly cases: readonly ScoringVectorCase[]} = ${JSON.stringify({profiles: scoring.profiles, cases: scoring.cases})};`,
    '',
```

5. Dart do catálogo: `import 'scoring_profile.dart';` após o cabeçalho; campo `final ScoringProfile? scoringProfile;` + `required this.scoringProfile,`; e em cada entrada `    scoringProfile: ${dartProfile(s.scoringProfile)},` com:

```js
function dartProfile(p) {
  if (p === null) return 'null';
  if (p.kind === 'sets_points') {
    return `SetsPointsProfile(bestOf: ${p.bestOf}, setTarget: ${p.setTarget}, ` +
      `decidingSetTarget: ${p.decidingSetTarget}, winBy: ${p.winBy}, pointCap: ${p.pointCap})`;
  }
  return `SetsGamesProfile(bestOf: ${p.bestOf}, gamesPerSet: ${p.gamesPerSet}, ` +
    `winByGames: ${p.winByGames}, tiebreakAtGames: ${p.tiebreakAtGames}, ` +
    `tiebreakTo: ${p.tiebreakTo}, noAd: ${p.noAd}, ` +
    `decidingSet: DecidingSet.${p.decidingSet === 'super_tiebreak' ? 'superTiebreak' : 'full'}, ` +
    `superTiebreakTo: ${p.superTiebreakTo})`;
}
```

6. Dart dos vetores: acrescentar ao fim `const String kScoringVectorsJson = r'''${JSON.stringify({profiles: scoring.profiles, cases: scoring.cases})}''';` (o JSON não contém `'''`; o codegen falha se contiver).

- [ ] **Step 7: Gerar e ver passar**

```bash
node sports/codegen.mjs
cd functions && node --test test/sports-catalog.test.mjs && npm run build
cd ../nexago_app && flutter analyze lib/core/sports test/core/sports
cd ../frontend && npx tsc -p projects/organizer/tsconfig.spec.json --noEmit
```
Expected: 3/3 no teste do catálogo; `tsc` e `flutter analyze` limpos.

- [ ] **Step 8: Commit**

```bash
git add sports functions/src/sports functions/test/sports-catalog.test.mjs frontend/shared/sports nexago_app/lib/core/sports nexago_app/test/core/sports
git commit -m "feat(sports): perfil de placar no catálogo e vetores de placar compartilhados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Núcleo de regras nas functions

**Files:**
- Create: `functions/src/sports/scoring.ts`, `functions/src/sports/scoring.test.ts`
- Modify: `functions/src/match-scoring.ts` (funções viram invólucros do núcleo com o perfil histórico)

**Interfaces:**
- Consumes: tipos do Task 1, `SCORING_VECTORS`.
- Produces: `ScoreSet {a, b, tb?}`, `ScoreValidationIssue {setIndex, message}`, `normalizeBestOf(raw): MatchBestOf | null`, `legacyScoringProfile(bestOf: number): SetsPointsProfile`, `scoringProfileFromRaw(raw): ScoringProfile | null`, `scoringProfileOfMatch({scoringProfile?, bestOf?}): ScoringProfile`, `isPointsSetWon(a, b, target, winBy, cap): boolean`, `setPointsTarget(p: SetsPointsProfile, index): number`, `setWinnerSide(sets, index, profile)`, `setsWonBy(sets, profile): {a, b}`, `matchWinnerSide(sets, profile)`, `validateScoreSets(sets, profile, {requireMatchWinner?}): ScoreValidationIssue[]`.

- [ ] **Step 1: Teste que falha**

```ts
// functions/src/sports/scoring.test.ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {SCORING_VECTORS} from "./vectors.generated";
import {
  legacyScoringProfile,
  matchWinnerSide,
  scoringProfileFromRaw,
  scoringProfileOfMatch,
  setWinnerSide,
  validateScoreSets,
} from "./scoring";

describe("sports/scoring · vetores compartilhados com app e portais", () => {
  for (const [i, c] of SCORING_VECTORS.cases.entries()) {
    it(`caso ${i} (${c.profile})`, () => {
      const profile = scoringProfileFromRaw(SCORING_VECTORS.profiles[c.profile]);
      assert.ok(profile, `perfil ${c.profile} não parseou`);
      assert.deepEqual(c.sets.map((_, idx) => setWinnerSide(c.sets, idx, profile)), c.setWinners);
      assert.equal(matchWinnerSide(c.sets, profile), c.matchWinner);
      assert.deepEqual(validateScoreSets(c.sets, profile).map((x) => x.message), c.issues);
    });
  }
});

describe("sports/scoring · perfil da partida", () => {
  it("sem carimbo usa a regra histórica com o bestOf do doc", () => {
    assert.deepEqual(scoringProfileOfMatch({bestOf: 1}), legacyScoringProfile(1));
    assert.deepEqual(scoringProfileOfMatch({}), legacyScoringProfile(3));
  });

  it("carimbo malformado cai no histórico em vez de lançar", () => {
    for (const bad of [
      {kind: "sets_points", bestOf: 2, setTarget: 21, decidingSetTarget: 15, winBy: 2, pointCap: null},
      {kind: "sets_points", bestOf: 3, setTarget: 21},
      {kind: "single_score", bestOf: 1},
      "x",
      null,
    ]) {
      assert.deepEqual(scoringProfileOfMatch({scoringProfile: bad, bestOf: 3}), legacyScoringProfile(3));
    }
  });

  it("histórico: decisivo 15 só em MD3", () => {
    assert.equal(legacyScoringProfile(3).decidingSetTarget, 15);
    assert.equal(legacyScoringProfile(5).decidingSetTarget, 21);
    assert.equal(legacyScoringProfile(1).decidingSetTarget, 21);
  });
});
```

Run: `cd functions && npm run build` → Expected: FAIL de compilação (`./scoring` não existe).

- [ ] **Step 2: Implementar o núcleo**

```ts
// functions/src/sports/scoring.ts
/**
 * Núcleo de regras de placar (spec multiesporte, eixo 2). A MESMA lógica vive em
 * `frontend/shared/sports/scoring.ts` e `nexago_app/lib/core/sports/scoring_rules.dart`;
 * os casos de `sports/scoring-vectors.json` provam a paridade.
 */
import type {
  MatchBestOf,
  ScoringProfile,
  SetsGamesProfile,
  SetsPointsProfile,
} from "./scoring-profile";

export type {MatchBestOf, ScoringProfile, SetsGamesProfile, SetsPointsProfile} from "./scoring-profile";

export interface ScoreSet {
  readonly a: number;
  readonly b: number;
  /** Tie-break do set de games (ou super tie-break do set decisivo). */
  readonly tb?: {readonly a: number; readonly b: number} | null;
}

export interface ScoreValidationIssue {
  setIndex: number | null;
  message: string;
}

type Side = "A" | "B";

const TIEBREAK_WIN_BY = 2;

export function normalizeBestOf(raw: unknown): MatchBestOf | null {
  const n = Number(raw);
  return n === 1 || n === 3 || n === 5 ? n : null;
}

/**
 * Regra histórica (vôlei de praia): 21, vantagem 2, decisivo 15 SÓ em MD3 — MD5
 * vai a 21 no 5º set, como sempre foi. Não normaliza `bestOf` de propósito: os
 * invólucros antigos repassam o número que receberam.
 */
export function legacyScoringProfile(bestOf: number): SetsPointsProfile {
  return {
    kind: "sets_points",
    bestOf,
    setTarget: 21,
    decidingSetTarget: bestOf === 3 ? 15 : 21,
    winBy: 2,
    pointCap: null,
  };
}

function posInt(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

/** Perfil gravado no Firestore → tipado; `null` se qualquer campo estiver errado. */
export function scoringProfileFromRaw(raw: unknown): ScoringProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const bestOf = normalizeBestOf(r.bestOf);
  if (bestOf === null) return null;
  if (r.kind === "sets_points") {
    const setTarget = posInt(r.setTarget);
    const decidingSetTarget = posInt(r.decidingSetTarget);
    const winBy = posInt(r.winBy);
    const pointCap = r.pointCap === null || r.pointCap === undefined ? null : posInt(r.pointCap);
    if (setTarget === null || decidingSetTarget === null || winBy === null) return null;
    if (r.pointCap !== null && r.pointCap !== undefined && pointCap === null) return null;
    return {kind: "sets_points", bestOf, setTarget, decidingSetTarget, winBy, pointCap};
  }
  if (r.kind === "sets_games") {
    const gamesPerSet = posInt(r.gamesPerSet);
    const winByGames = posInt(r.winByGames);
    const tiebreakTo = posInt(r.tiebreakTo);
    const superTiebreakTo = posInt(r.superTiebreakTo);
    const tiebreakAtGames = r.tiebreakAtGames === null ? null : posInt(r.tiebreakAtGames);
    if (gamesPerSet === null || winByGames === null || tiebreakTo === null || superTiebreakTo === null) {
      return null;
    }
    if (r.tiebreakAtGames !== null && tiebreakAtGames === null) return null;
    if (typeof r.noAd !== "boolean") return null;
    if (r.decidingSet !== "full" && r.decidingSet !== "super_tiebreak") return null;
    return {
      kind: "sets_games",
      bestOf,
      gamesPerSet,
      winByGames,
      tiebreakAtGames,
      tiebreakTo,
      noAd: r.noAd,
      decidingSet: r.decidingSet,
      superTiebreakTo,
    };
  }
  return null;
}

/** Perfil efetivo: o carimbado na partida; sem carimbo válido, a regra histórica com o `bestOf` do doc. */
export function scoringProfileOfMatch(match: {scoringProfile?: unknown; bestOf?: unknown}): ScoringProfile {
  return scoringProfileFromRaw(match.scoringProfile) ??
    legacyScoringProfile(normalizeBestOf(match.bestOf) ?? 3);
}

function isDecidingSet(index: number, bestOf: number): boolean {
  return bestOf > 1 && index === bestOf - 1;
}

export function isPointsSetWon(a: number, b: number, target: number, winBy: number, cap: number | null): boolean {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (cap !== null && hi === cap && hi > lo) return true;
  return hi >= target && hi - lo >= winBy;
}

export function setPointsTarget(p: SetsPointsProfile, index: number): number {
  return isDecidingSet(index, p.bestOf) ? p.decidingSetTarget : p.setTarget;
}

function isSuperTiebreakSet(p: SetsGamesProfile, index: number): boolean {
  return p.decidingSet === "super_tiebreak" && isDecidingSet(index, p.bestOf);
}

function gamesSetWinner(s: ScoreSet, index: number, p: SetsGamesProfile): Side | null {
  if (isSuperTiebreakSet(p, index)) {
    const tb = s.tb;
    if (!tb || !isPointsSetWon(tb.a, tb.b, p.superTiebreakTo, TIEBREAK_WIN_BY, null)) return null;
    const side: Side = tb.a > tb.b ? "A" : "B";
    const gamesMatch = side === "A" ? s.a === 1 && s.b === 0 : s.a === 0 && s.b === 1;
    return gamesMatch ? side : null;
  }
  if (s.a === s.b) return null;
  const side: Side = s.a > s.b ? "A" : "B";
  const hi = Math.max(s.a, s.b);
  const lo = Math.min(s.a, s.b);
  const tbAt = p.tiebreakAtGames;
  if (tbAt !== null) {
    if (hi === tbAt + 1 && lo === tbAt) {
      const tb = s.tb;
      if (!tb || !isPointsSetWon(tb.a, tb.b, p.tiebreakTo, TIEBREAK_WIN_BY, null)) return null;
      return (tb.a > tb.b ? "A" : "B") === side ? side : null;
    }
    if (hi > tbAt + 1) return null;
  }
  return hi >= p.gamesPerSet && hi - lo >= p.winByGames ? side : null;
}

export function setWinnerSide(sets: readonly ScoreSet[], index: number, profile: ScoringProfile): Side | null {
  if (index < 0 || index >= sets.length) return null;
  const s = sets[index]!;
  if (profile.kind === "sets_games") return gamesSetWinner(s, index, profile);
  if (!isPointsSetWon(s.a, s.b, setPointsTarget(profile, index), profile.winBy, profile.pointCap)) return null;
  return s.a > s.b ? "A" : "B";
}

export function setsWonBy(sets: readonly ScoreSet[], profile: ScoringProfile): {a: number; b: number} {
  let a = 0;
  let b = 0;
  for (let i = 0; i < sets.length; i++) {
    const side = setWinnerSide(sets, i, profile);
    if (side === "A") a++;
    else if (side === "B") b++;
  }
  return {a, b};
}

export function matchWinnerSide(sets: readonly ScoreSet[], profile: ScoringProfile): Side | null {
  const needed = Math.ceil(profile.bestOf / 2);
  const wins = setsWonBy(sets, profile);
  if (wins.a >= needed && wins.a > wins.b) return "A";
  if (wins.b >= needed && wins.b > wins.a) return "B";
  return null;
}

function setNotWonMessage(s: ScoreSet, index: number, profile: ScoringProfile): string {
  const label = `Set ${index + 1}`;
  if (profile.kind === "sets_points") {
    const target = setPointsTarget(profile, index);
    const cap = profile.pointCap === null ? "" : ` (teto ${profile.pointCap})`;
    return `${label}: vitória exige ${target} pontos com vantagem de ${profile.winBy}${cap}.`;
  }
  if (isSuperTiebreakSet(profile, index)) {
    return `${label}: super tie-break até ${profile.superTiebreakTo} com vantagem de ${TIEBREAK_WIN_BY}.`;
  }
  const hi = Math.max(s.a, s.b);
  const lo = Math.min(s.a, s.b);
  const tbAt = profile.tiebreakAtGames;
  if (tbAt !== null && hi === tbAt + 1 && lo === tbAt) {
    return s.tb ?
      `${label}: tie-break até ${profile.tiebreakTo} com vantagem de ${TIEBREAK_WIN_BY}.` :
      `${label}: ${hi}-${lo} exige o placar do tie-break.`;
  }
  return `${label}: set até ${profile.gamesPerSet} games com vantagem de ${profile.winByGames}.`;
}

/**
 * Validação do placar final (lançamento rápido e fechamento da mesa). Mensagens
 * do perfil histórico idênticas às que app e portal exibem hoje.
 */
export function validateScoreSets(
  sets: readonly ScoreSet[],
  profile: ScoringProfile,
  opts: {requireMatchWinner?: boolean} = {},
): ScoreValidationIssue[] {
  if (sets.length === 0) return [{setIndex: null, message: "Informe ao menos um set."}];
  const issues: ScoreValidationIssue[] = [];
  if (sets.length > profile.bestOf) {
    issues.push({setIndex: null, message: `Máximo de ${profile.bestOf} sets.`});
  }
  for (let i = 0; i < sets.length; i++) {
    const s = sets[i]!;
    const label = `Set ${i + 1}`;
    if (s.a === s.b) {
      issues.push({setIndex: i, message: `${label}: não pode terminar empatado.`});
      continue;
    }
    if (s.a < 0 || s.b < 0 || s.a > 99 || s.b > 99) {
      issues.push({setIndex: i, message: `${label}: placar fora do intervalo (0–99).`});
      continue;
    }
    if (setWinnerSide(sets, i, profile) === null) {
      issues.push({setIndex: i, message: setNotWonMessage(s, i, profile)});
    }
  }
  const hasSetErrors = issues.some((x) => x.setIndex !== null);
  if ((opts.requireMatchWinner ?? true) && !hasSetErrors && matchWinnerSide(sets, profile) === null) {
    issues.push({setIndex: null, message: "Complete o placar: nenhuma dupla venceu ainda."});
  }
  return issues;
}
```

- [ ] **Step 3: Invólucros em `match-scoring.ts`**

Manter todas as exportações e assinaturas atuais; trocar os corpos:

```ts
export function targetPointsForSet(setIndex: number, bestOf: number): number {
  return setPointsTarget(legacyScoringProfile(bestOf), setIndex);
}

export function isSetWon(scoreA: number, scoreB: number, target: number = DEFAULT_SET_POINTS): boolean {
  return isPointsSetWon(scoreA, scoreB, target, MIN_ADVANTAGE, null);
}

export function setWinnerSide(sets: ScoreSet[], index: number, bestOf: number = DEFAULT_BEST_OF): "A" | "B" | null {
  return coreSetWinnerSide(sets, index, legacyScoringProfile(bestOf));
}

export function setsWon(sets: ScoreSet[], bestOf: number = DEFAULT_BEST_OF): {a: number; b: number} {
  return setsWonBy(sets, legacyScoringProfile(bestOf));
}
```

`isMatchWon` e `matchWinnerId` seguem iguais (já chamam `setsWon`). `ScoreSet` passa a ser reexportado do núcleo (`export type {ScoreSet} from "./sports/scoring";`), que é compatível (só acrescenta `tb?`). Importar `isPointsSetWon`, `legacyScoringProfile`, `setPointsTarget`, `setsWonBy` e `setWinnerSide as coreSetWinnerSide` de `./sports/scoring`.

- [ ] **Step 4: Rodar**

Run: `cd functions && npm run build && node --test lib/sports/scoring.test.js lib/match-scoring.test.js lib/match-live-follow-notify.test.js lib/organizer-match-ops.live-score.test.js`
Expected: PASS em todos (os existentes provam que nada mudou).

- [ ] **Step 5: Commit**

```bash
git add functions/src/sports functions/src/match-scoring.ts
git commit -m "feat(functions): núcleo de regras de placar por perfil; regra histórica vira invólucro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Servidor carimba o perfil e decide o vencedor por ele

**Files:**
- Modify: `functions/src/match-scoring.ts` (`categoryScoringProfile`, `parseAndValidateSets` com `tb`)
- Modify: `functions/src/organizer-category-ops.ts` (`bracketMatchDoc` + chamada)
- Modify: `functions/src/organizer-match-ops.ts` (`submitMatchResult` usa `matchResultFields`)
- Test: `functions/src/organizer-category-ops.bracket-best-of.test.ts` (casos novos), `functions/src/match-result-fields.test.ts` (novo)

**Interfaces:**
- Produces: `categoryScoringProfile(category: Record<string, unknown> | undefined, tournamentSport: unknown): ScoringProfile`; `parseAndValidateSets(raw, profileOrBestOf: ScoringProfile | number)`; `matchResultFields(params: {match: Record<string, unknown>; rawSets: unknown; requestBestOf: unknown}): {update: Record<string, unknown>; completed: boolean; winnerId: string | null}` (em `organizer-match-ops.ts`, sem timestamps nem `liveScore`).

- [ ] **Step 1: Testes que falham**

Em `organizer-category-ops.bracket-best-of.test.ts`, acrescentar:

```ts
import {categoryScoringProfile} from "./match-scoring";
import {legacyScoringProfile} from "./sports/scoring";

describe("perfil de placar carimbado na partida", () => {
  it("bracketMatchDoc grava o perfil recebido", () => {
    const profile = legacyScoringProfile(3);
    const doc = bracketMatchDoc(DRAFT, {tournamentId: "t", categoryId: "c", bestOf: 3, scoringProfile: profile});
    assert.deepEqual(doc.scoringProfile, profile);
  });

  it("vôlei de praia: perfil do catálogo igual à regra histórica, com o bestOf da categoria", () => {
    assert.deepEqual(
      categoryScoringProfile({bestOf: "singleSet"}, "beachVolleyball"),
      {...legacyScoringProfile(3), bestOf: 1},
    );
    assert.deepEqual(categoryScoringProfile({bestOf: "bestOf3"}, "beachVolleyball"), legacyScoringProfile(3));
  });

  it("MD5 continua virando MD3 no carimbo", () => {
    assert.equal(categoryScoringProfile({bestOf: "bestOf5"}, "beachVolleyball").bestOf, 3);
  });

  it("beach tennis usa o perfil de games do catálogo", () => {
    const p = categoryScoringProfile({bestOf: "bestOf3"}, "beachTennis");
    assert.equal(p.kind, "sets_games");
  });

  it("esporte desconhecido usa a regra histórica", () => {
    assert.deepEqual(categoryScoringProfile({bestOf: "bestOf3"}, "xadrez"), legacyScoringProfile(3));
  });

  it("perfil explícito válido na categoria prevalece", () => {
    const explicit = {kind: "sets_points", bestOf: 1, setTarget: 25, decidingSetTarget: 15, winBy: 2, pointCap: null};
    assert.deepEqual(categoryScoringProfile({bestOf: "bestOf3", scoringProfile: explicit}, "beachVolleyball"), explicit);
  });
});
```

`functions/src/match-result-fields.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {matchResultFields} from "./organizer-match-ops";

const BT = {kind: "sets_games", bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: true, decidingSet: "super_tiebreak", superTiebreakTo: 10};

describe("matchResultFields", () => {
  it("partida histórica: igual a hoje", () => {
    const r = matchResultFields({
      match: {teamAId: "A", teamBId: "B", bestOf: 3},
      rawSets: [{a: 21, b: 18}, {a: 21, b: 19}],
      requestBestOf: undefined,
    });
    assert.equal(r.winnerId, "A");
    assert.deepEqual(r.update.sets, [{a: 21, b: 18}, {a: 21, b: 19}]);
    assert.equal(r.update.bestOf, 3);
    assert.equal(r.update.resultA, "2");
  });

  it("partida de games: decide pelo perfil carimbado e grava o tie-break", () => {
    const r = matchResultFields({
      match: {teamAId: "A", teamBId: "B", bestOf: 3, scoringProfile: BT},
      rawSets: [{a: 7, b: 6, tb: {a: 7, b: 4}}, {a: 6, b: 2}],
      requestBestOf: undefined,
    });
    assert.equal(r.winnerId, "A");
    assert.deepEqual(r.update.sets, [{a: 7, b: 6, tb: {a: 7, b: 4}}, {a: 6, b: 2}]);
  });

  it("tb numa partida de pontos é ignorado", () => {
    const r = matchResultFields({
      match: {teamAId: "A", teamBId: "B", bestOf: 1},
      rawSets: [{a: 21, b: 18, tb: {a: 7, b: 4}}],
      requestBestOf: undefined,
    });
    assert.deepEqual(r.update.sets, [{a: 21, b: 18}]);
  });

  it("bestOf do lançamento rápido sobrescreve o da partida", () => {
    const r = matchResultFields({
      match: {teamAId: "A", teamBId: "B", bestOf: 3},
      rawSets: [{a: 21, b: 18}],
      requestBestOf: 1,
    });
    assert.equal(r.winnerId, "A");
    assert.equal(r.update.bestOf, 1);
  });
});
```

Run: `cd functions && npm run build` → Expected: FAIL de compilação (`categoryScoringProfile`, `scoringProfile` em `bracketMatchDoc`, `matchResultFields`).

- [ ] **Step 2: Implementar**

`match-scoring.ts`:

```ts
/**
 * Perfil que a geração da chave carimba na partida: o explícito da categoria
 * (quando o wizard passar a gravá-lo) ou o padrão do esporte no catálogo com o
 * `bestOf` da categoria; esporte sem perfil usa a regra histórica.
 */
export function categoryScoringProfile(
  category: Record<string, unknown> | undefined,
  tournamentSport: unknown,
): ScoringProfile {
  const explicit = scoringProfileFromRaw(category?.scoringProfile);
  if (explicit) return explicit;
  const bestOf = matchBestOfFromCategory(category?.bestOf);
  const base = resolveSport(tournamentSport)?.scoringProfile ?? legacyScoringProfile(bestOf);
  return {...base, bestOf};
}
```

`parseAndValidateSets(raw, profileOrBestOf = DEFAULT_BEST_OF)`: `const profile = typeof profileOrBestOf === "number" ? legacyScoringProfile(profileOrBestOf) : profileOrBestOf;`, usar `profile.bestOf` no "Máximo de N sets"; para cada set, quando `profile.kind === "sets_games"` e `obj.tb` for objeto, validar `tb.a`/`tb.b` inteiros 0–99 (mesmas mensagens) e gravar `{a, b, tb: {a: tbA, b: tbB}}`; nos demais casos ignorar `tb`. A checagem de empate segue para `a === b`.

`organizer-category-ops.ts`: `bracketMatchDoc(draft, meta: {...; bestOf: number; scoringProfile: ScoringProfile})` grava `scoringProfile: meta.scoringProfile` ao lado de `bestOf`; na geração, `const scoringProfile = categoryScoringProfile(categoryMeta, tournamentData.sport);` e `bestOf: scoringProfile.bestOf` (mesmo número de hoje) passados para `bracketMatchDoc`. Atualizar os testes existentes que chamam `bracketMatchDoc` sem `scoringProfile` passando `legacyScoringProfile(<bestOf>)`.

`organizer-match-ops.ts`: extrair

```ts
export function matchResultFields(params: {
  match: Record<string, unknown>;
  rawSets: unknown;
  requestBestOf: unknown;
}): {update: Record<string, unknown>; completed: boolean; winnerId: string | null} {
  const stamped = scoringProfileOfMatch(params.match);
  const override = Number(params.requestBestOf);
  const requested = override === 1 || override === 3 ? override : null;
  const profile = requested === null ? stamped :
    scoringProfileFromRaw(params.match.scoringProfile) ? {...stamped, bestOf: requested} :
      legacyScoringProfile(requested);
  const sets = parseAndValidateSets(params.rawSets, profile);
  const teamAId = (params.match.teamAId as string | undefined)?.trim() ?? "";
  const teamBId = (params.match.teamBId as string | undefined)?.trim() ?? "";
  const side = matchWinnerSide(sets, profile);
  const winnerId = side === "A" ? teamAId || null : side === "B" ? teamBId || null : null;
  const wins = setsWonBy(sets, profile);
  return {
    update: {
      sets: sets.map((s) => (s.tb ? {a: s.a, b: s.b, tb: {a: s.tb.a, b: s.tb.b}} : {a: s.a, b: s.b})),
      bestOf: profile.bestOf,
      status: winnerId !== null ? MatchStatus.completed : MatchStatus.inProgress,
      resultA: `${wins.a}`,
      resultB: `${wins.b}`,
    },
    completed: winnerId !== null,
    winnerId,
  };
}
```

e no `submitMatchResult` substituir o bloco de `normalizeBestOf`/`parseAndValidateSets`/`matchWinnerId`/`setsWon`/`update` por uma chamada a `matchResultFields` dentro do `try` (o `catch` existente vira `HttpsError("invalid-argument", ...)`), acrescentando `updatedAt` e, se `completed`, `winnerId`, `matchEndedAt` e `liveScore: FieldValue.delete()`. Remover imports que ficarem sem uso.

Cuidado de equivalência: hoje `matchWinnerId` devolve `null` quando o lado vencedor tem `teamId` vazio? Não: devolve o id (possivelmente `""`) e `completed = winnerId !== null`. Ler o `matchWinnerId` atual antes de implementar e, se `""` contar como concluída hoje, reproduzir isso (ledger).

- [ ] **Step 3: Rodar**

Run: `cd functions && npm run build && node --test lib/match-result-fields.test.js lib/organizer-category-ops.bracket-best-of.test.js lib/organizer-match-ops*.test.js lib/organizer-category-ops*.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add functions/src
git commit -m "feat(functions): partida nova recebe o perfil de placar; resultado decidido por ele

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Núcleo nos portais e cópias delegando

**Files:**
- Create: `frontend/shared/sports/scoring.ts` (mesmo conteúdo do Task 2 Step 2, aspas simples, comentário de topo citando os outros dois)
- Modify: `frontend/shared/sports/index.ts` (`export * from './scoring';` — reexporta também os tipos do perfil)
- Modify: `frontend/shared/live-scoring/match-scoring.ts` (invólucros; `validateScoreSubmission` delega a `validateScoreSets`)
- Modify: `frontend/projects/athlete/src/app/data/matches-repository.ts:227-239` (`setTargetPointsOf` e `setIsWon` delegam)
- Test: `frontend/projects/organizer/src/app/painel/data/scoring-vectors.spec.ts`

- [ ] **Step 1: Spec que falha**

```ts
// frontend/projects/organizer/src/app/painel/data/scoring-vectors.spec.ts
import { matchWinnerSide, scoringProfileFromRaw, setWinnerSide, validateScoreSets } from '@nexago/sports';
import { SCORING_VECTORS } from '../../../../../../shared/sports/vectors.generated';

describe('@nexago/sports · vetores de placar compartilhados com functions e app', () => {
  SCORING_VECTORS.cases.forEach((c, i) => {
    it(`caso ${i} (${c.profile})`, () => {
      const profile = scoringProfileFromRaw(SCORING_VECTORS.profiles[c.profile]);
      expect(profile).withContext(c.profile).not.toBeNull();
      expect(c.sets.map((_, idx) => setWinnerSide(c.sets, idx, profile!))).toEqual([...c.setWinners]);
      expect(matchWinnerSide(c.sets, profile!)).toBe(c.matchWinner);
      expect(validateScoreSets(c.sets, profile!).map((x) => x.message)).toEqual([...c.issues]);
    });
  });
});
```

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/scoring-vectors.spec.ts'` → Expected: FAIL de compilação.

- [ ] **Step 2: Implementar**

Criar `scoring.ts` (cópia fiel do núcleo do Task 2) e exportá-lo. Em `live-scoring/match-scoring.ts`, manter constantes e assinaturas; corpos:

```ts
export function targetPointsForSet(setIndex: number, bestOf: number): number {
  return setPointsTarget(legacyScoringProfile(bestOf), setIndex);
}
export function isSetWon(scoreA: number, scoreB: number, target: number): boolean {
  return isPointsSetWon(scoreA, scoreB, target, MIN_ADVANTAGE, null);
}
export function setWinnerSide(sets: readonly ScoreSet[], index: number, bestOf: number): 'A' | 'B' | null {
  return coreSetWinnerSide(sets, index, legacyScoringProfile(bestOf));
}
export function setsWon(sets: readonly ScoreSet[], bestOf: number): { a: number; b: number } {
  return setsWonBy(sets, legacyScoringProfile(bestOf));
}
export function matchWinnerSide(sets: readonly ScoreSet[], bestOf: number): 'A' | 'B' | null {
  return coreMatchWinnerSide(sets, legacyScoringProfile(bestOf));
}
export function validateScoreSubmission(sets: readonly ScoreSet[], bestOf: number): ScoreValidationIssue[] {
  return validateScoreSets(sets, legacyScoringProfile(bestOf));
}
```

`ScoreSet` e `ScoreValidationIssue` passam a ser os do núcleo (reexport de tipo). Em `matches-repository.ts` do atleta:

```ts
export function setTargetPointsOf(index: number, bestOf: number): number {
  return setPointsTarget(legacyScoringProfile(bestOf), index);
}

function setIsWon(s: MatchSet, index: number, bestOf: number): boolean {
  return isPointsSetWon(s.a, s.b, setTargetPointsOf(index, bestOf), MIN_ADVANTAGE, null);
}
```

apagando `DEFAULT_SET_POINTS`/`TIEBREAK_SET_POINTS` locais e atualizando o comentário ("as regras moram em `@nexago/sports`").

- [ ] **Step 3: Rodar**

Run: `cd frontend && for p in organizer athlete; do npx ng test $p --watch=false --browsers=ChromeHeadless 2>&1 | grep -E 'Executed [0-9]+ of [0-9]+ .*\(' | tail -1; done`
Expected: SUCCESS nos dois (os specs de mesa/placar existentes provam a equivalência).

- [ ] **Step 4: Commit**

```bash
git add frontend/shared frontend/projects/organizer/src/app/painel/data/scoring-vectors.spec.ts frontend/projects/athlete/src/app/data/matches-repository.ts
git commit -m "feat(web): núcleo de placar em @nexago/sports; regras dos portais delegam a ele

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Núcleo no app e cópias delegando

**Files:**
- Create: `nexago_app/lib/core/sports/scoring_rules.dart`, `nexago_app/test/core/sports/scoring_rules_test.dart`
- Modify: `nexago_app/lib/core/sports/sport_catalog.dart` (`export 'scoring_profile.dart'; export 'scoring_rules.dart';`)
- Modify: `nexago_app/lib/features/organizer/domain/match_ops/match_scoring_logic.dart` (`isSetWon`, `setWinnerSide`, `setsWon`, `targetPointsForSet`, `validateQuickScoreSubmission` delegam; edição mínima, sem `dart format`)
- Modify: `nexago_app/lib/features/tournaments/domain/tournament_match_display.dart:108-135` (`matchSetTargetPoints`, `matchSetIsWon` delegam)

**Interfaces:**
- Produces: `ScoreSetValue {a, b, tb}`, `ScoringRules.legacyProfile(int bestOf)`, `ScoringRules.profileFromRaw(Object?)`, `ScoringRules.profileOfMatch({Object? raw, int? bestOf})`, `ScoringRules.isPointsSetWon(...)`, `ScoringRules.setPointsTarget(p, index)`, `ScoringRules.setWinnerSide(sets, index, p)`, `ScoringRules.setsWon(sets, p)`, `ScoringRules.matchWinnerSide(sets, p)`, `ScoringRules.validate(sets, p, {bool requireMatchWinner = true})` → `List<({int? setIndex, String message})>`.

- [ ] **Step 1: Teste que falha**

```dart
// nexago_app/test/core/sports/scoring_rules_test.dart
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/sports/sport_catalog.dart';

import 'sport_vectors_data.dart';

ScoreSetValue _set(Map<String, dynamic> m) {
  final tb = m['tb'] as Map<String, dynamic>?;
  return ScoreSetValue(
    m['a'] as int,
    m['b'] as int,
    tb: tb == null ? null : ScoreSetValue(tb['a'] as int, tb['b'] as int),
  );
}

void main() {
  final vectors = jsonDecode(kScoringVectorsJson) as Map<String, dynamic>;
  final profiles = vectors['profiles'] as Map<String, dynamic>;
  final cases = vectors['cases'] as List<dynamic>;

  group('vetores de placar compartilhados com functions e portais', () {
    for (var i = 0; i < cases.length; i++) {
      final c = cases[i] as Map<String, dynamic>;
      test('caso $i (${c['profile']})', () {
        final profile = ScoringRules.profileFromRaw(profiles[c['profile']]);
        expect(profile, isNotNull);
        final sets = [
          for (final s in c['sets'] as List<dynamic>) _set(s as Map<String, dynamic>),
        ];
        expect(
          [for (var idx = 0; idx < sets.length; idx++) ScoringRules.setWinnerSide(sets, idx, profile!)],
          c['setWinners'],
        );
        expect(ScoringRules.matchWinnerSide(sets, profile!), c['matchWinner']);
        expect(
          ScoringRules.validate(sets, profile).map((x) => x.message).toList(),
          c['issues'],
        );
      });
    }
  });

  test('carimbo malformado cai no histórico', () {
    final legacy = ScoringRules.legacyProfile(3);
    final p = ScoringRules.profileOfMatch(raw: {'kind': 'sets_points', 'bestOf': 2}, bestOf: 3);
    expect(p, isA<SetsPointsProfile>());
    expect((p as SetsPointsProfile).decidingSetTarget, legacy.decidingSetTarget);
    expect(p.bestOf, 3);
  });
}
```

Run: `cd nexago_app && flutter test test/core/sports/scoring_rules_test.dart` → Expected: FAIL de compilação.

- [ ] **Step 2: Implementar `scoring_rules.dart`** — porta fiel do núcleo do Task 2 (mesmos nomes de regra, mesmas mensagens), com:

```dart
class ScoreSetValue {
  const ScoreSetValue(this.a, this.b, {this.tb});

  final int a;
  final int b;
  final ScoreSetValue? tb;
}

typedef ScoreIssue = ({int? setIndex, String message});
```

`ScoringRules` é `abstract final class` com os métodos estáticos listados em Interfaces; `legacyProfile(int bestOf)` devolve `SetsPointsProfile(bestOf: bestOf, setTarget: 21, decidingSetTarget: bestOf == 3 ? 15 : 21, winBy: 2, pointCap: null)`; `profileFromRaw` aceita `Map` com as chaves do Firestore (`kind`, `bestOf`, ...; `decidingSet` `'super_tiebreak'`/`'full'`) e devolve `null` em qualquer campo errado; `profileOfMatch({Object? raw, int? bestOf})` = `profileFromRaw(raw) ?? legacyProfile(normalizeBestOf(bestOf) ?? 3)`. Formatar o arquivo novo e o teste com o dart do Flutter.

- [ ] **Step 3: Invólucros (edição mínima, sem `dart format`)**

`match_scoring_logic.dart`:
- `isSetWon(a, b, {target})` → `ScoringRules.isPointsSetWon(a, b, target, minAdvantage, null)`.
- `setWinnerSide(sets, index, {bestOf})` → `ScoringRules.setWinnerSide(_values(sets), index, ScoringRules.legacyProfile(bestOf))`.
- `setsWon(sets, {bestOf})` → `ScoringRules.setsWon(_values(sets), ScoringRules.legacyProfile(bestOf))`.
- `targetPointsForSet(setIndex, totalSets)` → `ScoringRules.setPointsTarget(ScoringRules.legacyProfile(totalSets), setIndex)`.
- `validateQuickScoreSubmission(...)`: corpo vira

```dart
    final aId = teamAId?.trim() ?? '';
    final bId = teamBId?.trim() ?? '';
    final issues = ScoringRules.validate(
      _values(sets),
      ScoringRules.legacyProfile(bestOf),
      requireMatchWinner: requireMatchWinner && aId.isNotEmpty && bId.isNotEmpty,
    );
    return QuickScoreValidationResult(
      issues: [
        for (final i in issues)
          QuickScoreValidationIssue(setIndex: i.setIndex, message: i.message),
      ],
    );
```

- Helper privado: `static List<ScoreSetValue> _values(List<TournamentMatchSet> sets) => [for (final s in sets) ScoreSetValue(s.a, s.b)];`

`tournament_match_display.dart`: `matchSetTargetPoints(index, bestOf)` → `ScoringRules.setPointsTarget(ScoringRules.legacyProfile(bestOf), index)`; `matchSetIsWon(set, index, bestOf)` → `ScoringRules.isPointsSetWon(set.a, set.b, matchSetTargetPoints(index, bestOf), _minSetAdvantage, null)`. As constantes privadas ficam (expostas por getters usados pelo Focus).

- [ ] **Step 4: Rodar**

Run: `cd nexago_app && flutter analyze lib/core/sports lib/features/organizer/domain/match_ops lib/features/tournaments/domain test/core/sports 2>&1 | grep -E "error •|warning •"; flutter test test/core/sports test/features/organizer test/features/tournaments`
Expected: nada no grep; tudo passando (os testes existentes de `match_scoring_logic` e do display provam a equivalência).

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib nexago_app/test
git commit -m "feat(app): núcleo de placar em core/sports; regras do app delegam a ele

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verificação final e PR empilhado

- [ ] **Step 1: Cópias que sobraram**

```bash
grep -rn "TIEBREAK_SET_POINTS = 15\|tiebreakSetPoints = 15\|_tiebreakSetPoints = 15" functions/src frontend nexago_app/lib --include=*.ts --include=*.dart | grep -v node_modules
```
Expected: só as constantes mantidas por compatibilidade de exportação (`match-scoring.ts` das functions, `live-scoring/match-scoring.ts`, `match_scoring_logic.dart`, `tournament_match_display.dart`), nenhuma com lógica própria.

- [ ] **Step 2: Suítes completas** (functions `npm test` + `npm run test:rules`; `flutter analyze` + `flutter test`; `ng test` em organizer, athlete, arena, backoffice, site; `node sports/codegen.mjs --check`). Expected: tudo verde.

- [ ] **Step 3: `rm -f functions/node_modules`, push, PR contra `claude/multiesporte-fase-1-catalogo`.**
