# Multiesporte, fase 2b1: lançamento rápido com games e tie-break

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** As quatro telas de lançamento do placar final (lançamento rápido do app, folha de placar da mesa do app, placar do portal do organizador e folha de placar da mesa do portal do atleta) leem o perfil carimbado na partida, aceitam games com tie-break e super tie-break quando o perfil é `sets_games`, e enviam o `tb` ao servidor. Partidas de pontos continuam iguais.

**Architecture:** O núcleo de placar (2a) ganha cinco funções puras, nas três linguagens, com vetores compartilhados: perfil efetivo da partida, rótulo das regras, rótulo do alvo de cada set, tipo de linha de set (`points`, `games`, `games_tiebreak`, `super_tiebreak`) e normalização do set para envio. Os modelos de partida passam a carregar `scoringProfile` e o `tb` dos sets. Cada tela só ramifica pelo tipo de linha: duas caixas, quatro caixas (games + tie-break) ou duas caixas de super tie-break.

**Tech Stack:** Cloud Functions TS, Angular 20 (Karma), Flutter/Dart 3.

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md`, "Eixo 2" e "Emenda de 04/10/2026 (fase 2)". **Emenda desta entrega:** a 2b vira 2b1 (lançamento rápido, este plano) e 2b2 (mesa ao vivo ponto a ponto com games).

**Base:** branch `claude/multiesporte-fase-2b1-lancamento`, empilhada sobre a 2a (`claude/multiesporte-fase-2a-placar`, PR #571).

## Global Constraints

- **Nº de sets manda pelo doc.** Perfil efetivo = carimbo com o `bestOf` da partida (ou do chip de formato da tela); sem carimbo, a regra histórica com esse `bestOf`. Mesma precedência do servidor (`matchResultFields`).
- Partida de pontos: mesmo visual, mesmas mensagens, mesmo payload de hoje. Única diferença aceita: o rótulo das regras em MD1 deixa de dizer "decisivo até 15" (era estático e errado).
- Super tie-break é digitado como placar do tie-break (ex.: 10×8); a tela grava `a/b` = 1×0 do lado vencedor e `tb` com os pontos.
- `tb` só vai no payload em `games_tiebreak` e `super_tiebreak`.
- Formato continua `[1, 3]` nas telas.
- **Nunca `dart format` em arquivo Dart existente.** Arquivo novo: dart do Flutter. `node_modules` por symlink; apagar `functions/node_modules` antes do PR. Karma com `cd frontend` e `--browsers=ChromeHeadless`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Partida carimbada com perfil de games aberta numa tela cujo chip de formato está em MD1 → validação com o perfil de games em MD1, não com a regra de 21. Teste nos Tasks 1 e 5.
2. Usuário digita 7×6, preenche o tie-break, depois muda para 6×4: o `tb` antigo não vai no payload. Vetor no Task 1.
3. Super tie-break 10×10 ou vazio: não vira vitória de ninguém; mensagem de set inválido. Vetor no Task 1.
4. Partida antiga (sem carimbo) com `tb` sujo nos sets: lida e regravada sem quebrar; `tb` descartado no envio. Teste no Task 2.
5. Sets lidos do doc com `tb` atravessam o modelo e a mesa sem perder o `tb` (o `toMap` da mesa regrava os sets). Teste no Task 2.

---

## Comandos de teste

| Camada | Comando |
|---|---|
| Codegen | `cd functions && node --test test/sports-catalog.test.mjs` |
| Functions | `cd functions && npm run build && node --test lib/sports/scoring.test.js` |
| Portais | `cd frontend && npx ng test <projeto> --watch=false --browsers=ChromeHeadless [--include=...]` |
| App | `cd nexago_app && flutter test <arquivos>` |

---

### Task 1: Funções de lançamento no núcleo, com vetores

**Files:**
- Modify: `sports/scoring-vectors.json` (`labelVectors`, `quickVectors`), `sports/codegen.mjs` (emitir os dois)
- Modify: `functions/src/sports/scoring.ts`, `frontend/shared/sports/scoring.ts`, `nexago_app/lib/core/sports/scoring_rules.dart`
- Test: `functions/src/sports/scoring.test.ts`, `frontend/projects/organizer/src/app/painel/data/scoring-vectors.spec.ts`, `nexago_app/test/core/sports/scoring_rules_test.dart`

**Interfaces (TS; Dart com os mesmos nomes em `ScoringRules`, camelCase):**
- `effectiveScoringProfile(raw: unknown, bestOf: unknown): ScoringProfile` — carimbo com `bestOf` (1|3|5) sobrescrito; sem carimbo, histórico.
- `scoringRulesLabel(p: ScoringProfile): string`
- `setTargetLabel(p: ScoringProfile, index: number): string`
- `type QuickSetKind = "points" | "games" | "games_tiebreak" | "super_tiebreak"`; `quickSetKind(p, index, set: ScoreSet): QuickSetKind`
- `normalizeQuickSet(p, index, set: ScoreSet): ScoreSet`
- Dart: `enum QuickSetKind { points, games, gamesTiebreak, superTiebreak }` e os vetores comparam pelo nome snake (`points`, `games`, `games_tiebreak`, `super_tiebreak`) via um getter `wire`.

- [ ] **Step 1: Vetores (antes do código)**

Acrescentar a `sports/scoring-vectors.json`:

```json
  "labelVectors": [
    {"profile": "legacy3", "rulesLabel": "set até 21 · decisivo até 15", "setLabels": ["até 21", "até 21", "até 15"]},
    {"profile": "legacy1", "rulesLabel": "set até 21", "setLabels": ["até 21"]},
    {"profile": "capped1", "rulesLabel": "set até 21 · teto 25", "setLabels": ["até 21"]},
    {"profile": "bt3", "rulesLabel": "set até 6 games · tie-break a 7 em 6-6 · super tie-break a 10 · sem vantagem", "setLabels": ["até 6 games", "até 6 games", "super tie-break até 10"]},
    {"profile": "tennis3", "rulesLabel": "set até 6 games · tie-break a 7 em 6-6", "setLabels": ["até 6 games", "até 6 games", "até 6 games"]},
    {"profile": "advantage1", "rulesLabel": "set até 6 games", "setLabels": ["até 6 games"]}
  ],
  "quickVectors": [
    {"profile": "legacy3", "index": 0, "set": {"a": 21, "b": 19, "tb": {"a": 7, "b": 5}}, "kind": "points", "normalized": {"a": 21, "b": 19}},
    {"profile": "bt3", "index": 0, "set": {"a": 7, "b": 6}, "kind": "games_tiebreak", "normalized": {"a": 7, "b": 6}},
    {"profile": "bt3", "index": 0, "set": {"a": 7, "b": 6, "tb": {"a": 7, "b": 4}}, "kind": "games_tiebreak", "normalized": {"a": 7, "b": 6, "tb": {"a": 7, "b": 4}}},
    {"profile": "bt3", "index": 0, "set": {"a": 6, "b": 4, "tb": {"a": 7, "b": 4}}, "kind": "games", "normalized": {"a": 6, "b": 4}},
    {"profile": "bt3", "index": 2, "set": {"a": 0, "b": 0, "tb": {"a": 8, "b": 10}}, "kind": "super_tiebreak", "normalized": {"a": 0, "b": 1, "tb": {"a": 8, "b": 10}}},
    {"profile": "bt3", "index": 2, "set": {"a": 0, "b": 0}, "kind": "super_tiebreak", "normalized": {"a": 0, "b": 0, "tb": {"a": 0, "b": 0}}},
    {"profile": "bt3", "index": 2, "set": {"a": 1, "b": 0, "tb": {"a": 10, "b": 10}}, "kind": "super_tiebreak", "normalized": {"a": 0, "b": 0, "tb": {"a": 10, "b": 10}}},
    {"profile": "tennis3", "index": 2, "set": {"a": 7, "b": 5}, "kind": "games", "normalized": {"a": 7, "b": 5}}
  ]
```

E acrescentar dois casos de efetivo aos testes de cada linguagem (abaixo).

No codegen, os objetos emitidos (`SCORING_VECTORS` no TS e `kScoringVectorsJson` no Dart) passam de `{profiles, cases}` para `{profiles, cases, labelVectors, quickVectors}`; no TS acrescentar ao tipo:

```ts
export interface ScoringLabelVector { readonly profile: string; readonly rulesLabel: string; readonly setLabels: readonly string[]; }
export interface ScoringQuickVector {
  readonly profile: string;
  readonly index: number;
  readonly set: {a: number; b: number; tb?: {a: number; b: number}};
  readonly kind: "points" | "games" | "games_tiebreak" | "super_tiebreak";
  readonly normalized: {a: number; b: number; tb?: {a: number; b: number}};
}
```

e incluir `readonly labelVectors: readonly ScoringLabelVector[]; readonly quickVectors: readonly ScoringQuickVector[];` no tipo de `SCORING_VECTORS`. O codegen valida que todo `profile` dos dois arrays existe em `profiles`.

- [ ] **Step 2: Testes que falham (três linguagens)**

functions, acrescentar a `scoring.test.ts`:

```ts
describe("sports/scoring · rótulos e lançamento rápido (vetores)", () => {
  for (const v of SCORING_VECTORS.labelVectors) {
    it(`rótulos ${v.profile}`, () => {
      const p = scoringProfileFromRaw(SCORING_VECTORS.profiles[v.profile])!;
      assert.equal(scoringRulesLabel(p), v.rulesLabel);
      assert.deepEqual(v.setLabels.map((_, i) => setTargetLabel(p, i)), v.setLabels);
    });
  }
  for (const [i, v] of SCORING_VECTORS.quickVectors.entries()) {
    it(`linha de set ${i} (${v.profile})`, () => {
      const p = scoringProfileFromRaw(SCORING_VECTORS.profiles[v.profile])!;
      assert.equal(quickSetKind(p, v.index, v.set), v.kind);
      assert.deepEqual(normalizeQuickSet(p, v.index, v.set), v.normalized);
    });
  }
  it("perfil efetivo: carimbo com o bestOf da tela; sem carimbo, histórico", () => {
    const bt = SCORING_VECTORS.profiles["bt3"];
    const p = effectiveScoringProfile(bt, 1);
    assert.equal(p.kind, "sets_games");
    assert.equal(p.bestOf, 1);
    assert.deepEqual(effectiveScoringProfile(undefined, 1), legacyScoringProfile(1));
    assert.deepEqual(effectiveScoringProfile({kind: "x"}, "abc"), legacyScoringProfile(3));
  });
});
```

Portal: espelho no `scoring-vectors.spec.ts` (mesmos três blocos, Jasmine). App: espelho no `scoring_rules_test.dart` (lendo `labelVectors`/`quickVectors` do JSON; `kind.wire` comparado à string).

Run os três → Expected: FAIL de compilação (funções não existem).

- [ ] **Step 3: Implementar (TS; portar igual para web e Dart)**

```ts
export type QuickSetKind = "points" | "games" | "games_tiebreak" | "super_tiebreak";

/**
 * Perfil efetivo numa tela de placar: o carimbado com o nº de sets da partida
 * (a mesa grava `bestOf` no doc ao trocar o formato); sem carimbo, a regra
 * histórica. Mesma precedência de `matchResultFields` no servidor.
 */
export function effectiveScoringProfile(raw: unknown, bestOf: unknown): ScoringProfile {
  const stamped = scoringProfileFromRaw(raw);
  const n = normalizeBestOf(bestOf) ?? stamped?.bestOf ?? 3;
  return stamped ? {...stamped, bestOf: n} : legacyScoringProfile(n);
}

export function scoringRulesLabel(p: ScoringProfile): string {
  if (p.kind === "sets_points") {
    const parts = [`set até ${p.setTarget}`];
    if (p.bestOf > 1) parts.push(`decisivo até ${p.decidingSetTarget}`);
    if (p.pointCap !== null) parts.push(`teto ${p.pointCap}`);
    return parts.join(" · ");
  }
  const parts = [`set até ${p.gamesPerSet} games`];
  if (p.tiebreakAtGames !== null) parts.push(`tie-break a ${p.tiebreakTo} em ${p.tiebreakAtGames}-${p.tiebreakAtGames}`);
  if (p.bestOf > 1 && p.decidingSet === "super_tiebreak") parts.push(`super tie-break a ${p.superTiebreakTo}`);
  if (p.noAd) parts.push("sem vantagem");
  return parts.join(" · ");
}

export function setTargetLabel(p: ScoringProfile, index: number): string {
  if (p.kind === "sets_points") return `até ${setPointsTarget(p, index)}`;
  if (isSuperTiebreakSet(p, index)) return `super tie-break até ${p.superTiebreakTo}`;
  return `até ${p.gamesPerSet} games`;
}

export function quickSetKind(p: ScoringProfile, index: number, set: ScoreSet): QuickSetKind {
  if (p.kind === "sets_points") return "points";
  if (isSuperTiebreakSet(p, index)) return "super_tiebreak";
  const tbAt = p.tiebreakAtGames;
  const hi = Math.max(set.a, set.b);
  const lo = Math.min(set.a, set.b);
  return tbAt !== null && hi === tbAt + 1 && lo === tbAt ? "games_tiebreak" : "games";
}

/** Set pronto para envio: `tb` só onde a linha usa; super tie-break vira 1×0 do vencedor do tie-break. */
export function normalizeQuickSet(p: ScoringProfile, index: number, set: ScoreSet): ScoreSet {
  const kind = quickSetKind(p, index, set);
  if (kind === "super_tiebreak") {
    const tb = {a: set.tb?.a ?? 0, b: set.tb?.b ?? 0};
    const a = tb.a > tb.b ? 1 : 0;
    const b = tb.b > tb.a ? 1 : 0;
    return {a, b, tb};
  }
  if (kind === "games_tiebreak" && set.tb) return {a: set.a, b: set.b, tb: {a: set.tb.a, b: set.tb.b}};
  return {a: set.a, b: set.b};
}
```

`isSuperTiebreakSet` passa a ser exportada (já existe privada). No Dart: `effectiveProfile(Object? raw, Object? bestOf)`, `rulesLabel`, `setTargetLabel`, `quickSetKind`, `normalizeQuickSet`, com `ScoreSetValue`.

- [ ] **Step 4: Gerar, rodar, commitar**

```bash
node sports/codegen.mjs
cd functions && node --test test/sports-catalog.test.mjs && npm run build && node --test lib/sports/scoring.test.js
cd ../frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/scoring-vectors.spec.ts'
cd ../nexago_app && flutter test test/core/sports
git add sports functions/src/sports frontend/shared/sports frontend/projects/organizer/src/app/painel/data/scoring-vectors.spec.ts nexago_app/lib/core/sports nexago_app/test/core/sports
git commit -m "feat(sports): rótulos de regras e linhas de set do lançamento rápido no núcleo de placar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Modelos de partida carregam o perfil e o tie-break

**Files:**
- Modify (Dart): `nexago_app/lib/features/tournaments/domain/tournament_match_set.dart` (`tb`), `nexago_app/lib/features/tournaments/domain/tournament_match.dart` (`scoringProfile`), `nexago_app/lib/features/tournaments/data/tournament_match_mapper.dart`, `nexago_app/lib/features/organizer/domain/match_ops/match_scoring_logic.dart` (`_values` leva `tb`; `validateQuickScoreSubmission` aceita `ScoringProfile? profile`)
- Modify (TS): `frontend/shared/live-scoring/live-match-repository.ts` (`liveSetsFromRaw`, `LiveMatch.scoringProfile`), `frontend/shared/live-scoring/live-scoring.ts` (`liveSetToMap` preserva `tb`), `frontend/projects/organizer/src/app/painel/data/matches-repository.ts` (`TournamentMatch.scoringProfile`, sets com `tb`)
- Test: `nexago_app/test/features/tournaments/tournament_match_mapper_test.dart`, `frontend/projects/athlete/src/app/mesa/mesa-scoring.spec.ts`, spec do `matches-repository` do organizador (o existente; criar `matches-repository.scoring-profile.spec.ts` se não houver)

**Interfaces:**
- Dart: `TournamentMatchSet.tb: ({int a, int b})?`; `TournamentMatch.scoringProfile: ScoringProfile?` (parse por `ScoringRules.profileFromRaw`); `MatchScoringLogic.validateQuickScoreSubmission({..., ScoringProfile? profile})` — com `profile`, usa `ScoringRules.effectiveProfile`-equivalente (`profile` com `bestOf` sobrescrito); sem, histórico como hoje.
- TS: `LiveMatch.scoringProfile: ScoringProfile | null`; `TournamentMatch.scoringProfile: ScoringProfile | null` no organizador; `LiveSet`/sets com `tb?`.

- [ ] **Step 1: Testes que falham**

Dart, em `tournament_match_mapper_test.dart`:

```dart
  test('lê scoringProfile carimbado e o tb dos sets', () {
    final match = TournamentMatchMapper.fromMap('m1', {
      'tournamentId': 't1',
      'scoringProfile': {
        'kind': 'sets_games', 'bestOf': 3, 'gamesPerSet': 6, 'winByGames': 2,
        'tiebreakAtGames': 6, 'tiebreakTo': 7, 'noAd': true,
        'decidingSet': 'super_tiebreak', 'superTiebreakTo': 10,
      },
      'sets': [
        {'a': 7, 'b': 6, 'tb': {'a': 7, 'b': 4}},
        {'a': 6, 'b': 2},
      ],
    });
    expect(match.scoringProfile, isA<SetsGamesProfile>());
    expect(match.sets.first.tb, (a: 7, b: 4));
    expect(match.sets.first.toMap()['tb'], {'a': 7, 'b': 4});
    expect(match.sets.last.toMap().containsKey('tb'), isFalse);
  });

  test('partida sem carimbo continua sem perfil', () {
    final match = TournamentMatchMapper.fromMap('m1', {'tournamentId': 't1'});
    expect(match.scoringProfile, isNull);
  });
```

Usar a assinatura real de `TournamentMatchMapper.fromMap` (ler o arquivo; o teste existente mostra a chamada). Atleta, em `mesa-scoring.spec.ts`:

```ts
  it('liveMatchFromDoc lê o perfil e preserva o tb; liveSetToMap regrava o tb', () => {
    const m = liveMatchFromDoc('m1', {
      teamAId: 'A', teamBId: 'B', bestOf: 3,
      scoringProfile: { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: true, decidingSet: 'super_tiebreak', superTiebreakTo: 10 },
      sets: [{ a: 7, b: 6, tb: { a: 7, b: 4 } }],
    });
    expect(m.scoringProfile?.kind).toBe('sets_games');
    expect(m.sets[0]!.tb).toEqual({ a: 7, b: 4 });
    expect(liveSetToMap(m.sets[0]!)['tb']).toEqual({ a: 7, b: 4 });
  });
```

Organizador: um teste equivalente sobre a função que converte o doc em `TournamentMatch` (ler `matches-repository.ts` e testar a função exportada que já é usada por specs existentes; se a conversão não for exportada, exportar `matchFromDoc` sem mudar comportamento).

Run → Expected: FAIL (campos não existem).

- [ ] **Step 2: Implementar**

Dart `TournamentMatchSet`: campo `final ({int a, int b})? tb;`, construtor `this.tb`, `fromMap` lê `map['tb']` quando for `Map` com `a`/`b` numéricos, `toMap` grava `'tb': {'a': tb!.a, 'b': tb!.b}` só quando não nulo. `TournamentMatch`: `final ScoringProfile? scoringProfile;` com default `null` no construtor e no `copyWith` (se houver). Mapper: `scoringProfile: ScoringRules.profileFromRaw(map['scoringProfile'])`. `MatchScoringLogic._values` passa `tb: s.tb == null ? null : ScoreSetValue(s.tb!.a, s.tb!.b)`; `validateQuickScoreSubmission` ganha `ScoringProfile? profile` e usa `profile == null ? ScoringRules.legacyProfile(bestOf) : ScoringRules.effectiveProfile(profileRaw..., bestOf)` — como o perfil já vem tipado, criar `ScoringRules.withBestOf(ScoringProfile p, int bestOf)` (cópia com outro `bestOf`) e usá-lo aqui e em `effectiveProfile`. Edição mínima, sem `dart format`.

TS: `liveSetsFromRaw` copia `tb` quando for objeto com `a`/`b` numéricos; `liveSetToMap` inclui `tb` quando presente; `LiveMatch.scoringProfile = scoringProfileFromRaw(data['scoringProfile'])` (de `@nexago/sports`). Organizador: mesmo padrão no `TournamentMatch`.

- [ ] **Step 3: Rodar** — `flutter test test/features/tournaments test/features/organizer`, `ng test athlete`, `ng test organizer` → SUCCESS. Commit:

```bash
git commit -am "feat(placar): modelos de partida carregam o perfil carimbado e o tie-break dos sets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Placar do portal do organizador

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/chaveamento/placar.component.ts` (template + lógica)
- Test: `frontend/projects/organizer/src/app/painel/chaveamento/placar.scoring.spec.ts` (novo)

**Comportamento:**
- `profile = computed(() => effectiveScoringProfile(match.scoringProfile, bestOf()))`.
- Rótulo de cada set: `setTargetLabel(profile(), i)` no lugar de `até {{ targetOf(i) }}` (pontos: texto idêntico).
- Linha por `quickSetKind(profile(), i, set)`: `points`/`games` como hoje; `games_tiebreak` acrescenta "tie-break" com dois inputs (`tb.a`, `tb.b`); `super_tiebreak` troca os dois inputs por "super tie-break" editando `tb.a`/`tb.b`.
- `issues = validateScoreSets(sets().map((s, i) => normalizeQuickSet(profile(), i, s)), profile())`; `wins` pelo núcleo com o perfil.
- Envio: `sets: sets().map((s, i) => normalizeQuickSet(profile(), i, s))`.
- Para testar sem montar o template, extrair para funções puras exportadas do próprio arquivo: `placarRows(profile, sets): Array<{index, kind, label}>` e `placarPayload(profile, sets): ScoreSet[]`.

- [ ] **Step 1: Spec que falha**

```ts
import { effectiveScoringProfile } from '@nexago/sports';
import { placarPayload, placarRows } from './placar.component';

const BT = { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: true, decidingSet: 'super_tiebreak', superTiebreakTo: 10 };

describe('placar · perfil de placar da partida', () => {
  it('partida de pontos: linhas e payload como hoje', () => {
    const p = effectiveScoringProfile(undefined, 3);
    expect(placarRows(p, [{ a: 21, b: 19 }, { a: 15, b: 21 }, { a: 15, b: 13 }]).map((r) => r.label))
      .toEqual(['até 21', 'até 21', 'até 15']);
    expect(placarPayload(p, [{ a: 21, b: 19, tb: { a: 1, b: 0 } }])).toEqual([{ a: 21, b: 19 }]);
  });

  it('beach tennis: tie-break em 7-6 e super tie-break no 3º set', () => {
    const p = effectiveScoringProfile(BT, 3);
    const sets = [{ a: 7, b: 6, tb: { a: 7, b: 3 } }, { a: 2, b: 6 }, { a: 0, b: 0, tb: { a: 10, b: 7 } }];
    expect(placarRows(p, sets).map((r) => r.kind)).toEqual(['games_tiebreak', 'games', 'super_tiebreak']);
    expect(placarPayload(p, sets)).toEqual([
      { a: 7, b: 6, tb: { a: 7, b: 3 } },
      { a: 2, b: 6 },
      { a: 1, b: 0, tb: { a: 10, b: 7 } },
    ]);
  });

  it('chip em MD1 numa partida de games valida com o perfil de games', () => {
    const p = effectiveScoringProfile(BT, 1);
    expect(placarRows(p, [{ a: 6, b: 3 }])[0]!.label).toBe('até 6 games');
  });
});
```

Run (`--include='**/placar.scoring.spec.ts'`) → FAIL de compilação.

- [ ] **Step 2: Implementar** (funções puras + template) e rodar a suíte inteira do organizador → SUCCESS.
- [ ] **Step 3: Commit** `feat(organizer-web): placar lê o perfil da partida, com tie-break e super tie-break`.

---

### Task 4: Folha de placar da mesa do portal do atleta

**Files:**
- Modify: `frontend/projects/athlete/src/app/mesa/mesa-live.component.ts` (folha "placar por sets", l.~340-388 do template e `openScoreSheet`/`updateQuickSet`/`quickIssues`/`saveQuick`), `frontend/projects/athlete/src/app/mesa/mesa-live.gateway.ts` (`submitSets` preserva `tb`)
- Test: `frontend/projects/athlete/src/app/mesa/mesa-quick-score.spec.ts` (novo)

**Comportamento:** igual ao Task 3, com o perfil de `liveMatch.scoringProfile` e o `bestOf` da partida; funções puras `quickRows(profile, sets)` e `quickPayload(profile, sets)` exportadas de um arquivo novo `mesa-quick-score.ts` (o componente só as usa). `submitSets` deixa de reduzir os sets a `{a, b}` e envia o que receber (já normalizado).

- [ ] **Step 1: Spec que falha** — mesmos três casos do Task 3 contra `quickRows`/`quickPayload`, mais um caso para o gateway: `submitSets` repassa `tb` (testar a função de mapeamento extraída, se o gateway chamar o serviço diretamente). Run → FAIL.
- [ ] **Step 2: Implementar e rodar a suíte do atleta** → SUCCESS.
- [ ] **Step 3: Commit** `feat(atleta-web): folha de placar da mesa lê o perfil da partida, com tie-break`.

---

### Task 5: Lançamento rápido e folha de placar da mesa no app

**Files:**
- Modify: `nexago_app/lib/features/organizer/presentation/match_ops/organizer_match_quick_score_page.dart` (`_SetInputRow`, `_SectionHeader` trailing, validação, `submitMatchResult`)
- Modify: `nexago_app/lib/features/organizer/presentation/match_ops/widgets/organizer_match_live_table_widgets.dart` (`LiveTableQuickScoreSheet`, `_QuickScoreSetRow`, copy l.~3330), `nexago_app/lib/features/organizer/presentation/match_ops/organizer_match_live_table_page.dart` (`_submitQuickScore`)
- Modify: `nexago_app/lib/features/organizer/data/organizer_match_schedule_service.dart` (`submitMatchResult` aceita `List<Map<String, Object>>`)
- Create: `nexago_app/lib/features/organizer/domain/match_ops/quick_score_rows.dart` (funções puras `quickScoreRows(profile, sets)` e `quickScorePayload(profile, sets)` → `List<Map<String, Object>>`)
- Test: `nexago_app/test/features/organizer/quick_score_rows_test.dart` (novo) + os testes existentes da mesa

**Comportamento:** igual aos Tasks 3 e 4. Perfil = `ScoringRules.withBestOf(match.scoringProfile, _bestOf)` quando carimbado, senão `legacyProfile(_bestOf)`. Trailing do cabeçalho e copy da folha = `ScoringRules.rulesLabel(profile)` (em MD3 de pontos o texto fica idêntico). Linhas de tie-break e super tie-break com os mesmos steppers/campos já usados. Validação via `validateQuickScoreSubmission(..., profile: match.scoringProfile)`.

- [ ] **Step 1: Teste que falha** (`quick_score_rows_test.dart`): os três casos dos Tasks 3/4 com `TournamentMatchSet(a:, b:, tb:)` e o payload como `List<Map>`. Run → FAIL.
- [ ] **Step 2: Implementar** (arquivo novo formatado com o dart do Flutter; telas com edição mínima, sem `dart format`).
- [ ] **Step 3: Rodar** `flutter analyze` nos arquivos tocados e `flutter test test/features/organizer test/core/sports` → verde.
- [ ] **Step 4: Commit** `feat(app): lançamento rápido e folha da mesa leem o perfil da partida, com tie-break`.

---

### Task 6: Verificação final e PR empilhado

- [ ] Suítes completas (functions `npm test` + rules; `flutter analyze` + `flutter test`; `ng test` nos cinco portais; `node sports/codegen.mjs --check`).
- [ ] `rm -f functions/node_modules`, push, PR contra `claude/multiesporte-fase-2a-placar`.
