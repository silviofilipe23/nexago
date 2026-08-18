# Fase 2 — Presets de Categoria: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alinhar os presets de faixa de nível das superfícies de criação de categoria à spec emendada (Open 4–6, Elite 6, sem faixa custom) e criar a derivação canônica faixa→preset que a fase 3 usará para os pesos.

**Architecture:** A faixa já é materializada em `categories[].level` (teto) + `categories[].minLevel` (piso) e a elegibilidade fechada já está deployada (todos os integrantes na faixa) — este plano NÃO mexe no assert. O que muda: a tabela de chips do wizard web (orientação Open/Elite invertida na main + remoção do modo "Personalizado"), a paridade do editor do app (que hoje só preserva `minLevel` sem expor), e um módulo novo nas functions com a tabela canônica de presets + `presetFromRange` (derivação à prova de adulteração — o preset nunca é gravado).

**Tech Stack:** TypeScript (Cloud Functions node:test, Angular/Karma zoneless), Dart/Flutter.

**Spec:** `docs/superpowers/specs/2026-08-17-category-presets-ranking-weights-design.md` — LER a seção "Emendas (18/08)" primeiro: D5 (todos na faixa) e D6 (só Livre sem participação) foram emendados; o armazenamento é minLevel/level materializado com preset derivado.

## Global Constraints

Tabela canônica de presets (verbatim em todos os espelhos):

| key | label | faixa (ranks) | min (código) | max (código) | peso (fase 3) |
|---|---|---|---|---|---|
| `iniciante` | Iniciante | 0–1 | iniciante_1 | iniciante_2 | 0.125 |
| `intermediario` | Intermediário | 2–3 | intermediario_1 | intermediario_2 | 0.25 |
| `avancado` | Avançado | 4–5 | avancado_1 | avancado_2 | 0.5 |
| `open` | Open | 4–6 | avancado_1 | open | 1.0 |
| `elite` | Elite | 6–6 | open | open | 1.2 |
| `livre` | Livre | 0–6 | **iniciante_1 (explícito)** | open | 0.125 |

- **Livre grava piso EXPLÍCITO** (`minLevel: 'Iniciante 1'`): `minLevel` ausente/null é a marca de categoria **legada** (regra antiga só-teto) e NUNCA deriva preset — `presetFromRange(null, …) === null`, peso legado 1.0 na fase 3.
- O preset **não é gravado** no doc; deriva da faixa exata. Faixa que não casa com preset = legado/custom (válida na leitura, sem preset).
- `categories[].level` e `categories[].minLevel` guardam **labels** ("Avançado 1") — formato existente, não mudar.
- Wizard web NÃO oferece mais faixa custom; categoria carregada com faixa fora da tabela mostra aviso de legado e os chips normais para trocar.
- Sem mudanças em `assertTeamLevelEligibility`, rules ou deploy — nada server-side muda de comportamento nesta fase.
- Strings de UI em português; commits com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Testes: functions `cd functions && npm test` · app `cd nexago_app && flutter test` · portais `cd frontend && npx ng test <projeto> --watch=false` (specs de componente exigem `provideZonelessChangeDetection()`).

---

### Task 1: Functions — tabela canônica e derivação faixa→preset

**Files:**
- Create: `functions/src/category-presets.ts`
- Test: `functions/src/category-presets.test.ts` (novo, estilo node:test dos vizinhos)

**Interfaces:**
- Consumes: `levelRank(raw): number | null` de `./category-level-eligibility` (já mergeado; open=6).
- Produces (fase 3 consome exatamente estes nomes): `CategoryPresetKey`, `CategoryPreset {key, label, minRank, maxRank, weight}`, `CATEGORY_PRESETS` (6 entradas), `LEGACY_CATEGORY_WEIGHT = 1`, `presetFromRange(minRank: number | null, maxRank: number): CategoryPreset | null`, `categoryPreset(category): CategoryPreset | null`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
describe("category-presets", () => {
  it("deriva cada preset pela faixa exata", () => {
    assert.strictEqual(presetFromRange(0, 1)?.key, "iniciante");
    assert.strictEqual(presetFromRange(2, 3)?.key, "intermediario");
    assert.strictEqual(presetFromRange(4, 5)?.key, "avancado");
    assert.strictEqual(presetFromRange(4, 6)?.key, "open");
    assert.strictEqual(presetFromRange(6, 6)?.key, "elite");
    assert.strictEqual(presetFromRange(0, 6)?.key, "livre");
  });
  it("piso ausente é categoria legada — nunca deriva preset", () => {
    assert.strictEqual(presetFromRange(null, 6), null);
    assert.strictEqual(presetFromRange(null, 0), null);
  });
  it("faixa fora da tabela não deriva preset", () => {
    assert.strictEqual(presetFromRange(0, 0), null);
    assert.strictEqual(presetFromRange(2, 6), null);
  });
  it("categoryPreset lê labels do doc da categoria", () => {
    assert.strictEqual(
      categoryPreset({level: "Open", minLevel: "Avançado 1"})?.key,
      "open",
    );
    assert.strictEqual(categoryPreset({level: "Open"}), null); // legado sem piso
    assert.strictEqual(categoryPreset({level: "Open", minLevel: "Iniciante 1"})?.key, "livre");
    assert.strictEqual(categoryPreset(null), null);
  });
  it("pesos da tabela batem com a D4 da spec", () => {
    const byKey = Object.fromEntries(CATEGORY_PRESETS.map((p) => [p.key, p.weight]));
    assert.deepStrictEqual(byKey, {
      iniciante: 0.125, intermediario: 0.25, avancado: 0.5,
      open: 1, elite: 1.2, livre: 0.125,
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd functions && npm test 2>&1 | grep -A3 "category-presets"` → FAIL (módulo não existe; o build tsc quebra — esperado no RED, criar o arquivo vazio exportando stubs se preferir ver o assert falhar em vez do compile).

- [ ] **Step 3: Implementar**

```ts
import {levelRank} from "./category-level-eligibility";

export type CategoryPresetKey =
  | "iniciante" | "intermediario" | "avancado" | "open" | "elite" | "livre";

export interface CategoryPreset {
  key: CategoryPresetKey;
  label: string;
  minRank: number;
  maxRank: number;
  /** Peso no ranking geral (D4 da spec — consumido pela fase 3). */
  weight: number;
}

/**
 * Presets de faixa de nível (spec emendada 18/08). A faixa é regra da
 * plataforma: o wizard só oferece estas 6; o preset NUNCA é gravado no doc —
 * deriva da faixa exata via [presetFromRange], o que torna os pesos da fase 3
 * à prova de adulteração no cliente.
 */
export const CATEGORY_PRESETS: readonly CategoryPreset[] = [
  {key: "iniciante", label: "Iniciante", minRank: 0, maxRank: 1, weight: 0.125},
  {key: "intermediario", label: "Intermediário", minRank: 2, maxRank: 3, weight: 0.25},
  {key: "avancado", label: "Avançado", minRank: 4, maxRank: 5, weight: 0.5},
  {key: "open", label: "Open", minRank: 4, maxRank: 6, weight: 1},
  {key: "elite", label: "Elite", minRank: 6, maxRank: 6, weight: 1.2},
  {key: "livre", label: "Livre", minRank: 0, maxRank: 6, weight: 0.125},
];

/** Peso de categoria sem preset (legada/faixa fora da tabela) — emenda 3. */
export const LEGACY_CATEGORY_WEIGHT = 1;

/**
 * Derivação canônica faixa→preset. `minRank === null` (piso ausente no doc)
 * é categoria LEGADA da regra só-teto — nunca um preset, nem o Livre: o
 * Livre grava piso explícito `iniciante_1` justamente para se distinguir.
 */
export function presetFromRange(
  minRank: number | null,
  maxRank: number,
): CategoryPreset | null {
  if (minRank == null) return null;
  return (
    CATEGORY_PRESETS.find((p) => p.minRank === minRank && p.maxRank === maxRank) ??
    null
  );
}

/** Preset de um doc de categoria (`level`/`minLevel` guardam labels). */
export function categoryPreset(
  category: Record<string, unknown> | null | undefined,
): CategoryPreset | null {
  if (!category) return null;
  const max = levelRank(category.level);
  if (max == null) return null;
  return presetFromRange(levelRank(category.minLevel), max);
}
```

- [ ] **Step 4: Rodar até verde** — `cd functions && npm test` → PASS integral.

- [ ] **Step 5: Commit**

```bash
git add functions/src/category-presets.ts functions/src/category-presets.test.ts
git commit -m "feat(levels): tabela canônica de presets de categoria + derivação faixa→preset (NEXAGO)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Organizer web — chips corrigidos (Open↔Elite), Livre com piso explícito, fim do Personalizado

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/data/tournament-create.model.ts:345-354` (`CATEGORY_LEVEL_PRESETS` + comentário)
- Modify: `frontend/projects/organizer/src/app/painel/eventos/wizard/criar-torneio.component.ts` (`CUSTOM_PRESET` l.105, `NO_MIN` l.107, `customLevelMode` l.687, template `@if (customLevelMode() || activeLevelPreset() === 'Personalizado')` l.236-242 e handlers `setCatMinSkill`/`minSkillOptions` associados)
- Modify: builder de categoria de LIGA se espelhar o mesmo padrão — descobrir com `grep -rn "Personalizado\|CATEGORY_LEVEL_PRESETS" frontend/projects/organizer/src --include=*.ts | grep -v spec` e aplicar as MESMAS mudanças em cada hit (candidato conhecido: `criar-liga.component.ts` / `league-create.model.ts`)
- Test: `frontend/projects/organizer/src/app/painel/data/tournament-create.levels.spec.ts`

**Interfaces:**
- Consumes: `SkillLevel` union já existente (`iniciante1…open`), `CategoryLevelPreset {label, min, max}`.
- Produces: `CATEGORY_LEVEL_PRESETS` na orientação da spec (tabela das Global Constraints). Task 3 espelha os mesmos pares label/faixa no app.

- [ ] **Step 1: Atualizar o spec primeiro (falhando)** — em `tournament-create.levels.spec.ts`, atualizar/adicionar:

```ts
it('presets seguem a spec: Open é a faixa-ponte 4–6 e Elite é só o topo', () => {
  const byLabel = new Map(CATEGORY_LEVEL_PRESETS.map((p) => [p.label, p]));
  expect(byLabel.get('Open')).toEqual({ label: 'Open', min: 'avancado1', max: 'open' });
  expect(byLabel.get('Elite')).toEqual({ label: 'Elite', min: 'open', max: 'open' });
});
it('Livre grava piso explícito — min null é marca de categoria legada', () => {
  expect(CATEGORY_LEVEL_PRESETS.find((p) => p.label === 'Livre'))
    .toEqual({ label: 'Livre', min: 'iniciante1', max: 'open' });
  expect(CATEGORY_LEVEL_PRESETS.some((p) => p.min === null)).toBe(false);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd frontend && npx ng test organizer --watch=false` → FAIL.

- [ ] **Step 3: Implementar a tabela**

```ts
/** Faixas prontas de nível (spec emendada 18/08). "Open" é a faixa-ponte
 *  4–6 que fecha chave com topo pequeno; "Elite" é só o degrau Open (topo).
 *  "Livre" grava piso EXPLÍCITO iniciante1 — `minLevel` ausente no doc é
 *  marca de categoria LEGADA (regra antiga só-teto), nunca um preset. */
export const CATEGORY_LEVEL_PRESETS: readonly CategoryLevelPreset[] = [
  { label: 'Iniciante', min: 'iniciante1', max: 'iniciante2' },
  { label: 'Intermediário', min: 'intermediario1', max: 'intermediario2' },
  { label: 'Avançado', min: 'avancado1', max: 'avancado2' },
  { label: 'Open', min: 'avancado1', max: 'open' },
  { label: 'Elite', min: 'open', max: 'open' },
  { label: 'Livre', min: 'iniciante1', max: 'open' },
];
```

Se o tipo `CategoryLevelPreset.min` era `SkillLevel | null`, estreitar para `SkillLevel` (nenhum preset usa null agora) e seguir os erros de compilação — cada um é um consumidor do caso null a limpar.

- [ ] **Step 4: Remover o modo Personalizado do wizard** — em `criar-torneio.component.ts` (e no builder de liga, se o grep do Files apontar): remover `CUSTOM_PRESET`, o signal `customLevelMode`, o bloco `@if` dos seletores finos de min/max e os handlers/options que só ele usava (`setCatMinSkill`/`minSkillOptions`/`NO_MIN` — confirmar com grep que não têm outro uso antes de apagar). Categoria carregada cuja faixa não casa com nenhum preset (rascunho da janela custom): nenhum chip ativo + linha de aviso no lugar dos seletores:

```html
@if (activeLevelPreset() === null) {
  <p class="og-hint">Faixa personalizada (legado): {{ levelRangeLabel() }} — escolha um preset para alterar.</p>
}
```

`levelRangeLabel()` = `computed` que formata `SKILL_LEVEL_LABEL[cat.minSkillLevel] + '–' + SKILL_LEVEL_LABEL[cat.skillLevel]` (min ausente → só o teto). Selecionar qualquer chip substitui a faixa — não há caminho de volta pra custom.

- [ ] **Step 5: Rodar organizer até verde** — `cd frontend && npx ng test organizer --watch=false` → PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/projects/organizer
git commit -m "feat(organizer-web): presets de faixa na orientação da spec — Open 4–6, Elite topo, sem Personalizado (NEXAGO)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: App — editores de categoria (torneio e liga) ganham os chips de preset

**Files:**
- Modify: `nexago_app/lib/features/organizer/domain/tournament_create/tournament_create_logic.dart` (constante nova `categoryLevelPresets` + helper `activeCategoryLevelPreset`)
- Modify: `nexago_app/lib/features/organizer/presentation/tournament_create/sheets/tournament_category_editor_sheet.dart` (seção "Faixa de nível" com chips)
- Modify: `nexago_app/lib/features/organizer/presentation/league_create/sheets/league_category_editor_sheet.dart` (mesma seção)
- Modify: `nexago_app/lib/features/organizer/domain/tournament_create/tournament_create_draft.dart:177` (comentário: o editor agora expõe o piso)
- Test: `nexago_app/test/features/organizer/tournament_create_logic_test.dart`

**Interfaces:**
- Consumes: `TournamentCategoryDraft.minLevel` (String, `''` = sem piso — já existe e já persiste via mapper l.469-470); `AthleteProfileOptions.levels` (7 labels).
- Produces: `categoryLevelPresets` (lista de 6, labels de UI) e `activeCategoryLevelPreset(draft): String?` — paridade exata com a tabela das Global Constraints, em LABELS ("Avançado 1"), porque `categories[].level`/`minLevel` guardam labels.

- [ ] **Step 1: Testes que falham** (em `tournament_create_logic_test.dart`)

O teto do draft é o enum `TournamentSkillLevel skillLevel` (o mapper grava `'level': skillLevelLabel(category.skillLevel)`, l.467); o piso é a String de label `minLevel` (l.470).

```dart
test('presets de faixa espelham a tabela canônica', () {
  final byLabel = {for (final p in categoryLevelPresets) p.label: p};
  expect(byLabel['Open']!.minLevel, 'Avançado 1');
  expect(byLabel['Open']!.maxSkillLevel, TournamentSkillLevel.open);
  expect(byLabel['Elite']!.minLevel, 'Open');
  expect(byLabel['Elite']!.maxSkillLevel, TournamentSkillLevel.open);
  expect(byLabel['Livre']!.minLevel, 'Iniciante 1');
  expect(byLabel['Avançado']!.maxSkillLevel, TournamentSkillLevel.avancado2);
  expect(categoryLevelPresets, hasLength(6));
});
test('activeCategoryLevelPreset casa faixa exata e devolve null pra legado', () {
  final draft = emptyCategoryDraft('c1').copyWith(
    skillLevel: TournamentSkillLevel.open,
    minLevel: 'Avançado 1',
  );
  expect(activeCategoryLevelPreset(draft), 'Open');
  expect(
    activeCategoryLevelPreset(draft.copyWith(minLevel: '')),
    isNull, // sem piso = legado, nunca um preset
  );
  expect(
    activeCategoryLevelPreset(draft.copyWith(minLevel: 'Open')),
    'Elite',
  );
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd nexago_app && flutter test test/features/organizer/` → FAIL.

- [ ] **Step 3: Implementar a constante + helper** em `tournament_create_logic.dart`:

```dart
/// Presets de faixa de nível (paridade com CATEGORY_LEVEL_PRESETS do portal
/// e CATEGORY_PRESETS das functions — spec emendada 18/08). O teto usa o
/// enum do draft (`skillLevel`); o piso usa label porque
/// `categories[].minLevel` guarda o label cru.
class CategoryLevelPreset {
  const CategoryLevelPreset({
    required this.label,
    required this.minLevel,
    required this.maxSkillLevel,
  });
  final String label;
  final String minLevel;
  final TournamentSkillLevel maxSkillLevel;
}

const categoryLevelPresets = <CategoryLevelPreset>[
  CategoryLevelPreset(label: 'Iniciante', minLevel: 'Iniciante 1', maxSkillLevel: TournamentSkillLevel.iniciante2),
  CategoryLevelPreset(label: 'Intermediário', minLevel: 'Intermediário 1', maxSkillLevel: TournamentSkillLevel.intermediario2),
  CategoryLevelPreset(label: 'Avançado', minLevel: 'Avançado 1', maxSkillLevel: TournamentSkillLevel.avancado2),
  CategoryLevelPreset(label: 'Open', minLevel: 'Avançado 1', maxSkillLevel: TournamentSkillLevel.open),
  CategoryLevelPreset(label: 'Elite', minLevel: 'Open', maxSkillLevel: TournamentSkillLevel.open),
  CategoryLevelPreset(label: 'Livre', minLevel: 'Iniciante 1', maxSkillLevel: TournamentSkillLevel.open),
];

/// Preset ativo do draft (faixa exata) — null para faixa legada/sem piso.
/// Elite vem antes na checagem implícita? Não: Elite (Open/Open) e Livre
/// (Iniciante 1/Open) têm pares distintos — a busca linear é inequívoca.
String? activeCategoryLevelPreset(TournamentCategoryDraft draft) {
  for (final preset in categoryLevelPresets) {
    if (draft.minLevel == preset.minLevel &&
        draft.skillLevel == preset.maxSkillLevel) {
      return preset.label;
    }
  }
  return null;
}
```

(Conferir os nomes reais dos values do enum — `TournamentSkillLevel.iniciante2` etc. foram estendidos na fase 1 com `avancado1`/`avancado2`; usar os nomes exatos do enum em `tournament_create_logic.dart`. Ao tocar um chip: `draft.copyWith(skillLevel: preset.maxSkillLevel, minLevel: preset.minLevel)`.)

- [ ] **Step 4: Chips nos dois editor sheets** — seção "Faixa de nível" acima do seletor de nível atual, no padrão visual de chips que o sheet já usa para gênero/formato: um chip por preset; tocar seta `minLevel`+teto do draft de uma vez; chip ativo = `activeCategoryLevelPreset(draft)`; faixa legada → nenhum ativo + hint `Faixa personalizada (legado) — escolha um preset para alterar.`. O seletor fino de nível único que existir hoje continua APENAS como leitura do teto se outros fluxos dependem dele — não introduzir edição de faixa fora dos chips.

- [ ] **Step 5: Suíte do app inteira** — `cd nexago_app && flutter test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add nexago_app
git commit -m "feat(app): chips de preset de faixa nos editores de categoria de torneio e liga (NEXAGO)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Verificação de paridade da exibição pro atleta (app + portal)

**Files:** nenhum previsto — verificação com correção pontual só se um check falhar.

**Interfaces:**
- Consumes: `category_level_eligibility.dart` (app, badge `NÍVEL MÍNIMO NÃO ATINGIDO` já existe) e `tournament-eligibility.ts` (portal, faixa fechada já existe).

- [ ] **Step 1:** App — `grep -n "minLevel" nexago_app/lib/features/tournaments -r`: confirmar que o card de categoria exibe o bloqueio de piso (badge + mensagem) e que a mensagem cita a faixa (`minLevelBlockMessage`). Se a mensagem não citar o preset/faixa, NÃO estender — exibição por preset é polimento da fase 3.
- [ ] **Step 2:** Portal do atleta — `grep -rn "minLevel\|NÍVEL MÍNIMO\|piso" frontend/projects/athlete/src/app/tournaments --include=*.ts --include=*.html`: confirmar gate visual de inscrição fora da faixa (equivalente web do badge). Registrar no report o que existe.
- [ ] **Step 3:** Qualquer lacuna real (atleta consegue INICIAR inscrição fora da faixa sem aviso e só descobre no erro do callable) vira correção mínima nesta task, no padrão visual já usado pelos cards; senão, task encerra sem commit.

---

### Task 5: Docs de regra de negócio

**Files:**
- Modify: `docs/business-rules/categories.md` (hoje só tem exemplos genéricos)
- Modify: `docs/business-rules/ranking.md` (nota curta: pesos por preset chegam na fase 3 — referência à spec)

- [ ] **Step 1:** `categories.md` ganha: a tabela canônica das Global Constraints (sem a coluna de peso — peso é assunto do ranking.md/fase 3); o modelo de armazenamento (`level` teto + `minLevel` piso, labels; ausente = legado só-teto); a regra "faixa é regra da plataforma — sem custom; legadas valem na leitura"; elegibilidade = TODOS os integrantes na faixa (link pra levels.md).
- [ ] **Step 2:** Conferir cruzadas: `grep -rn "Personalizado" docs/` → zero fora de specs/planos históricos.
- [ ] **Step 3: Commit**

```bash
git add docs/business-rules
git commit -m "docs: presets de categoria e faixa fechada nas regras de negócio (NEXAGO)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Regressão das superfícies tocadas

- [ ] **Step 1:** `cd functions && npm test` → PASS (baseline ≥1197 + novos).
- [ ] **Step 2:** `cd nexago_app && flutter test` → PASS (baseline 2048 + novos).
- [ ] **Step 3:** `cd frontend && npx ng test organizer --watch=false && npx ng test athlete --watch=false` → PASS.
- [ ] **Step 4:** `cd functions && npm run lint` → sem erros. Falhou algo → corrigir na task de origem (`fix:`) e repetir. Sem deploy nesta fase.
