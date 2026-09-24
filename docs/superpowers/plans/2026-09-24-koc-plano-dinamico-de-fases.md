# King of the Court — plano dinâmico de fases — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar os três números soltos que configuram o King of the Court por um plano explícito de fases, proposto automaticamente a partir das duplas inscritas e editável fase a fase na tela de gerar chave.

**Architecture:** `KocConfig` ganha `phases: KocPhaseSpec[]`. O gerador para de planejar e passa a só emitir, com uma função `emitPhase` usada por todas as fases — o que faz baterias valerem fora da classificatória. O planejamento vira duas funções puras: `kocProposePlan` (a proposta "máximo de jogo", nova) e `kocLegacyPlan` (as regras de hoje, para config antiga). O plano é gravado no doc da categoria, porque o sorteio ao vivo o lê antes da geração, e congelado em cada rodada publicada.

**Tech Stack:** TypeScript (Cloud Functions, `node --test`), Angular 20 standalone + signals (portal do organizador, Karma), Dart/Flutter (app), Firestore.

**Spec:** `docs/superpowers/specs/2026-09-24-koc-plano-dinamico-de-fases-design.md`

## Global Constraints

- Todos os comandos rodam a partir da raiz do worktree: `/Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/team-duplication-signup-bfee21`.
- Piso de duplas numa bateria: **3** (`KOC_MIN_TEAMS_PER_ROUND`, inalterado).
- Teto duro: **6** (`KOC_MAX_TEAMS_PER_ROUND`, era 5). Quando a categoria não escolheu, vale **5** (`KOC_LEGACY_MAX_TEAMS_PER_ROUND`).
- Teto de fases: **6** (`KOC_MAX_PHASES`, inalterado).
- A fase final tem sempre `roundsPerBracket: 1` e `qualifiersPerRound: 0` — ninguém classifica, a tabela é o pódio. Só a **última** fase pode ter `qualifiersPerRound: 0`.
- **Retrocompatibilidade obrigatória:** config sem `phases` gera saída **idêntica** à de hoje. Isso é testado, não presumido.
- O `kocConfig` de cada rodada grava as **duas** formas: `phases`/`maxTeamsPerRound` novos e `teamsPerCourt`/`roundsPerBracket`/`qualifiersPerRound` preenchidos com os valores da fase daquela rodada.
- Nenhuma callable nova. Nenhum deploy de function é necessário para a persistência do plano.
- Português nas strings e na UI, inglês no código (convenção do projeto).
- Comentário explica **por quê**, não o quê — é o padrão dos arquivos KOTC existentes.

**Comandos de teste:**

```bash
cd functions && npm run build && node --test lib/koc-bracket-builders.test.js
```

```bash
cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/koc-phase-plan.spec.ts'
```

```bash
cd nexago_app && flutter test test/features/organizer/king_of_court_plan_test.dart
```

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `functions/src/koc-bracket-builders.ts` (modificar) | Tipos do plano, constantes, `kocProposePlan`, `kocLegacyPlan`, `kocResolvePlan`, `emitPhase`, `buildKingOfCourtRounds` |
| `functions/src/koc-bracket-builders.test.ts` (modificar) | Planejadores, emissor, invariante, retrocompat |
| `functions/src/organizer-category-ops.ts` (modificar) | `resolveKocConfig` lê `phases`/`maxTeamsPerRound`; `kocRoundDoc` congela as duas formas; site de geração resolve o plano uma vez |
| `functions/src/draw-sessions.ts` (modificar) | `teamsPerBox` sai do plano; validação do plano antes de abrir a sessão |
| `functions/src/koc-draw-bracket-agreement.test.ts` (modificar) | Acordo sorteio × geração com chaves de tamanhos diferentes |
| `frontend/.../painel/data/koc-phase-plan.ts` (criar) | Espelho do planejador + edição em cascata + totais. Sem Angular, sem Firestore |
| `frontend/.../painel/data/koc-phase-plan.spec.ts` (criar) | Specs do espelho e da cascata |
| `frontend/.../painel/eventos/seeds.component.ts` (modificar) | Tabela editável + persistência do plano na categoria |
| `frontend/.../painel/data/tournaments-repository.ts` (modificar) | Ler `kocPhases`/`kocMaxTeamsPerRound` da categoria e gravar de volta |
| `frontend/.../painel/data/tournament.model.ts` (modificar) | Campos novos em `OrganizerTournamentCategory` |
| `frontend/.../painel/eventos/wizard/criar-torneio.component.ts` (modificar) | Remove dois steppers, renomeia o teto |
| `frontend/.../painel/data/koc.ts` (modificar) | `KocRoundState` lê `batteryLabel` |
| `frontend/.../painel/chaveamento/chaveamento.component.ts` (modificar) | Divergência compara planos |
| `nexago_app/lib/.../king_of_court_plan.dart` (modificar) | `KingOfCourtPhase` + parse de `phases` |
| `nexago_app/lib/.../organizer_category_generate_koc_page.dart` (modificar) | Modo leitura quando a categoria tem plano |
| `docs/business-rules/king-of-court.md` (modificar) | Teto configurável e baterias em qualquer fase |

---

### Task 1: Planejador puro no servidor

**Files:**
- Modify: `functions/src/koc-bracket-builders.ts`
- Test: `functions/src/koc-bracket-builders.test.ts`

**Interfaces:**
- Consumes: `kocRoundCount`, `kocRoundSizes`, `KocBracketError`, `KOC_MIN_TEAMS_PER_ROUND`, `KOC_MAX_PHASES` — todos já existem no arquivo.
- Produces:
  - `interface KocPhaseSpec { bracketSizes: number[]; roundsPerBracket: number; qualifiersPerRound: number; durationSec: number }`
  - `const KOC_MAX_TEAMS_PER_ROUND = 6`
  - `const KOC_LEGACY_MAX_TEAMS_PER_ROUND = 5`
  - `kocMaxRoundsPerBracket(bracketSize: number, qualifiersPerRound?: number): number`
  - `kocClampMaxPerRound(value: unknown): number`
  - `kocProposeTail(field: number, maxPerRound: number, durationFor: (phase: number) => number, startPhase: number): KocPhaseSpec[]`
  - `kocProposePlan(teamCount: number, maxPerRound: number, durationFor: (phase: number) => number): KocPhaseSpec[]`

- [ ] **Step 1: Escrever os testes que falham**

Abra `functions/src/koc-bracket-builders.test.ts` e acrescente ao final do arquivo. Importe os símbolos novos no bloco de import do topo (`KOC_LEGACY_MAX_TEAMS_PER_ROUND`, `kocClampMaxPerRound`, `kocProposePlan`, `type KocPhaseSpec`).

```ts
/** Duração fixa: o planejador não decide duração, só a carrega. */
const flat = (): number => 900;

describe("kocMaxRoundsPerBracket com mais de uma classificada", () => {
  it("com 1 por bateria é o de sempre: a chave encolhe de uma em uma", () => {
    assert.equal(kocMaxRoundsPerBracket(3), 1);
    assert.equal(kocMaxRoundsPerBracket(4), 2);
    assert.equal(kocMaxRoundsPerBracket(5), 3);
    assert.equal(kocMaxRoundsPerBracket(6), 4);
  });

  it("com 2 por bateria a chave encolhe de duas em duas", () => {
    assert.equal(kocMaxRoundsPerBracket(6, 2), 2); // 6 → 4, e 4 ainda é rodada
    assert.equal(kocMaxRoundsPerBracket(7, 2), 3); // 7 → 5 → 3
    assert.equal(kocMaxRoundsPerBracket(4, 2), 1); // 4 → 2 não é rodada
  });
});

describe("kocClampMaxPerRound", () => {
  it("ausente ou inválido vale o teto de sempre, não o novo", () => {
    assert.equal(kocClampMaxPerRound(undefined), KOC_LEGACY_MAX_TEAMS_PER_ROUND);
    assert.equal(kocClampMaxPerRound("x"), KOC_LEGACY_MAX_TEAMS_PER_ROUND);
  });

  it("prende na faixa do formato", () => {
    assert.equal(kocClampMaxPerRound(2), 3);
    assert.equal(kocClampMaxPerRound(9), 6);
    assert.equal(kocClampMaxPerRound(6), 6);
  });
});

describe("kocProposePlan", () => {
  it("10 duplas com teto 6: o formato que o dono pediu", () => {
    const plan = kocProposePlan(10, 6, flat);
    assert.deepEqual(plan, [
      {bracketSizes: [5, 5], roundsPerBracket: 3, qualifiersPerRound: 1, durationSec: 900},
      {bracketSizes: [6], roundsPerBracket: 4, qualifiersPerRound: 1, durationSec: 900},
      {bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900},
    ] satisfies KocPhaseSpec[]);
  });

  it("campo que cabe numa quadra é uma rodada só — não se inventa fase", () => {
    for (const n of [3, 4, 5, 6]) {
      const plan = kocProposePlan(n, 6, flat);
      assert.deepEqual(plan, [
        {bracketSizes: [n], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900},
      ]);
    }
  });

  it("chave que só aguenta uma bateria classifica mais de uma, ou o campo morre", () => {
    // 7 duplas: 2 chaves de [4,3]; a de 3 não comporta segunda bateria, então a
    // fase volta ao formato clássico e passam 2 de cada.
    const plan = kocProposePlan(7, 6, flat);
    assert.equal(plan[0]!.roundsPerBracket, 1);
    assert.equal(plan[0]!.qualifiersPerRound, 2);
    assert.deepEqual(plan[1]!.bracketSizes, [4]);
  });

  it("3 a 24 duplas: toda fase reduz o campo e a última é chave única de uma bateria", () => {
    for (let n = 3; n <= 24; n++) {
      const plan = kocProposePlan(n, 6, flat);
      let field = n;
      for (let i = 0; i < plan.length; i++) {
        const spec = plan[i]!;
        const sum = spec.bracketSizes.reduce((a, b) => a + b, 0);
        assert.equal(sum, field, `${n} duplas: fase ${i + 1} soma ${sum}, campo é ${field}`);
        for (const size of spec.bracketSizes) {
          assert.ok(size >= 3 && size <= 6, `${n} duplas: chave de ${size} fora da faixa`);
          const last = size - (spec.roundsPerBracket - 1) * Math.max(1, spec.qualifiersPerRound);
          assert.ok(last >= 3, `${n} duplas: última bateria ficaria com ${last}`);
        }
        const isLast = i === plan.length - 1;
        if (isLast) {
          assert.equal(spec.bracketSizes.length, 1, `${n} duplas: final com mais de uma quadra`);
          assert.equal(spec.roundsPerBracket, 1);
          assert.equal(spec.qualifiersPerRound, 0);
        } else {
          assert.ok(spec.qualifiersPerRound >= 1, `${n} duplas: fase ${i + 1} não classifica ninguém`);
          const next = spec.bracketSizes.length * spec.roundsPerBracket * spec.qualifiersPerRound;
          assert.ok(next < field, `${n} duplas: fase ${i + 1} não reduz (${field} → ${next})`);
          field = next;
        }
      }
    }
  });

  it("recusa campo menor que o mínimo do formato", () => {
    assert.throws(() => kocProposePlan(2, 6, flat), (e: unknown) => {
      assert.ok(e instanceof KocBracketError);
      assert.equal(e.reason, "koc_field_too_small");
      return true;
    });
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

```bash
cd functions && npm run build 2>&1 | head -20
```

Esperado: FALHA de compilação com `Module '"./koc-bracket-builders"' has no exported member 'kocProposePlan'` (e os outros símbolos novos).

- [ ] **Step 3: Implementar**

Em `functions/src/koc-bracket-builders.ts`:

**3a.** Troque a constante do teto e acrescente a do padrão, logo abaixo de `KOC_DEFAULT_TEAMS_PER_COURT`:

```ts
/**
 * Teto duro do formato. Subiu de 5 para 6 quando a semifinal passou a poder
 * rodar várias baterias: com 6 na chave são 4 baterias, e é isso que separa
 * uma semi de verdade de uma final antecipada.
 */
export const KOC_MAX_TEAMS_PER_ROUND = 6;

/**
 * Teto de quem não escolheu. Categoria antiga não tem `maxTeamsPerRound`, e
 * herdar 6 mudaria a chave de torneio já publicado sem ninguém pedir.
 */
export const KOC_LEGACY_MAX_TEAMS_PER_ROUND = 5;
```

**3b.** Acrescente o tipo do plano logo depois de `KocConfig`:

```ts
/**
 * Uma fase do torneio, como o organizador a vê na tabela.
 *
 * `bracketSizes` é o tamanho de cada chave na PRIMEIRA bateria; as seguintes
 * encolhem em `qualifiersPerRound` a cada bateria, porque quem classifica sai
 * e libera a quadra.
 */
export interface KocPhaseSpec {
  bracketSizes: number[];
  roundsPerBracket: number;
  /** 0 só na fase final: ali ninguém classifica, a tabela é o pódio. */
  qualifiersPerRound: number;
  durationSec: number;
}
```

**3c.** Substitua `kocMaxRoundsPerBracket` pela versão que conhece `q`:

```ts
/**
 * Quantas baterias a chave aguenta antes de furar o mínimo do formato.
 *
 * Cada bateria tira `qualifiersPerRound` duplas, então a chave encolhe em
 * degraus desse tamanho: de 5 tirando 1 dá 3 baterias (5 → 4 → 3); de 7
 * tirando 2 dá 3 (7 → 5 → 3).
 */
export function kocMaxRoundsPerBracket(
  bracketSize: number,
  qualifiersPerRound = 1,
): number {
  const q = Math.max(1, Math.floor(qualifiersPerRound));
  return Math.max(1, Math.floor((bracketSize - KOC_MIN_TEAMS_PER_ROUND) / q) + 1);
}
```

**3d.** Acrescente o clamp e os dois planejadores, antes de `buildKingOfCourtRounds`:

```ts
/** Teto da categoria, saneado. Ausente ou inválido cai no teto de sempre. */
export function kocClampMaxPerRound(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return KOC_LEGACY_MAX_TEAMS_PER_ROUND;
  return Math.min(KOC_MAX_TEAMS_PER_ROUND, Math.max(KOC_MIN_TEAMS_PER_ROUND, n));
}

/**
 * Proposta "máximo de jogo" a partir de um campo de `field` duplas, para as
 * fases que NÃO são a primeira.
 *
 * Separada de `kocProposePlan` porque a fase 1 tem uma regra a mais (campo que
 * cabe numa quadra é rodada única) e a cascata da tabela editável repropõe só o
 * rabo do plano, nunca a primeira fase.
 */
export function kocProposeTail(
  field: number,
  maxPerRound: number,
  durationFor: (phase: number) => number,
  startPhase: number,
): KocPhaseSpec[] {
  const max = kocClampMaxPerRound(maxPerRound);
  const phases: KocPhaseSpec[] = [];
  let remaining = field;
  while (startPhase + phases.length <= KOC_MAX_PHASES) {
    const phaseNumber = startPhase + phases.length;
    const durationSec = durationFor(phaseNumber);
    const brackets = kocRoundCount(remaining, max);
    const bracketSizes = kocRoundSizes(remaining, brackets);
    const smallest = Math.min(...bracketSizes);

    let rounds = kocMaxRoundsPerBracket(smallest, 1);
    let qualifiers = 1;
    if (rounds === 1) {
      // Chave que não aguenta uma segunda bateria volta ao formato clássico:
      // passa quem está no topo da tabela. Com 1 só, 2 chaves mandariam 2
      // duplas para a fase seguinte — abaixo do piso, e o plano morreria.
      qualifiers = Math.max(
        1,
        Math.min(smallest - 1, Math.floor((remaining - 1) / brackets)),
      );
    }

    const next = brackets * rounds * qualifiers;
    if (next < KOC_MIN_TEAMS_PER_ROUND) {
      // Só acontece com UMA chave: com duas ou mais, o ramo acima garante
      // `qualifiers >= 2` e o campo seguinte nunca desce de 4. Esta fase é a
      // final, e a tabela dela é o pódio.
      phases.push({bracketSizes, roundsPerBracket: 1, qualifiersPerRound: 0, durationSec});
      return phases;
    }
    phases.push({bracketSizes, roundsPerBracket: rounds, qualifiersPerRound: qualifiers, durationSec});
    remaining = next;
  }
  return phases;
}

/**
 * O plano que a tela propõe quando o organizador não mexeu em nada.
 *
 * Critério: MÁXIMO DE JOGO — chave o mais cheia que o teto permite, e baterias
 * no máximo que a menor chave aguenta. É o que faz 10 duplas caírem em
 * 2 chaves de 5 com 3 baterias, semi de 6 com 4 e final de 4 sem nenhum caso
 * especial.
 */
export function kocProposePlan(
  teamCount: number,
  maxPerRound: number,
  durationFor: (phase: number) => number,
): KocPhaseSpec[] {
  if (teamCount < KOC_MIN_TEAMS_PER_ROUND) {
    throw new KocBracketError(
      `King of the Court precisa de pelo menos ${KOC_MIN_TEAMS_PER_ROUND} duplas ` +
        `na rodada — há ${teamCount}.`,
      "koc_field_too_small",
    );
  }
  const max = kocClampMaxPerRound(maxPerRound);
  // Campo inteiro numa quadra só: o torneio É a rodada. Inventar fase aqui
  // eliminaria 2 duplas para jogar a final com as 3 que sobraram.
  if (teamCount <= max) {
    return [{
      bracketSizes: [teamCount],
      roundsPerBracket: 1,
      qualifiersPerRound: 0,
      durationSec: durationFor(1),
    }];
  }
  return kocProposeTail(teamCount, max, durationFor, 1);
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

```bash
cd functions && npm run build && node --test lib/koc-bracket-builders.test.js
```

Esperado: PASS, incluindo os testes antigos de `kocMaxRoundsPerBracket` (a assinatura ganhou um parâmetro opcional, então os chamadores de um argumento continuam valendo).

- [ ] **Step 5: Commit**

```bash
git add functions/src/koc-bracket-builders.ts functions/src/koc-bracket-builders.test.ts
git commit -m "$(cat <<'EOF'
feat(koc): planejador de fases e teto de 6 duplas por bateria

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: O gerador emite a partir do plano

**Files:**
- Modify: `functions/src/koc-bracket-builders.ts`
- Modify: `docs/business-rules/king-of-court.md`
- Test: `functions/src/koc-bracket-builders.test.ts`

**Interfaces:**
- Consumes: `KocPhaseSpec`, `kocProposePlan`, `kocClampMaxPerRound`, `kocMaxRoundsPerBracket` (Task 1).
- Produces:
  - `KocRoundDraft` ganha `batteryLabel: number` (posição da bateria dentro da chave, 1-based).
  - `KocConfig` ganha `phases?: KocPhaseSpec[]` e `maxTeamsPerRound?: number`.
  - `kocLegacyPlan(teamCount: number, config: KocConfig): KocPhaseSpec[]`
  - `kocResolvePlan(teamCount: number, config: KocConfig): KocPhaseSpec[]`
  - `buildKingOfCourtRounds(seeds, config, opts?)` — mesma assinatura, agora dirigida pelo plano.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente em `functions/src/koc-bracket-builders.test.ts` (importe `kocLegacyPlan`, `kocResolvePlan`):

```ts
describe("kocLegacyPlan preserva o comportamento de hoje", () => {
  it("16 duplas em quadras de 4, 2 classificadas: 4 chaves → 2 → final", () => {
    const plan = kocLegacyPlan(16, {...baseConfig});
    assert.deepEqual(plan.map((p) => p.bracketSizes), [[4, 4, 4, 4], [4, 4], [4]]);
    assert.deepEqual(plan.map((p) => p.roundsPerBracket), [1, 1, 1]);
    assert.deepEqual(plan.map((p) => p.qualifiersPerRound), [2, 2, 0]);
  });

  it("14 duplas com 2 rodadas por chave: 3 chaves mais cheias", () => {
    const plan = kocLegacyPlan(14, {...baseConfig, roundsPerBracket: 2});
    assert.deepEqual(plan[0]!.bracketSizes, [5, 5, 4]);
    assert.equal(plan[0]!.roundsPerBracket, 2);
    assert.equal(plan[0]!.qualifiersPerRound, 1);
  });

  it("recusa a chave que não comporta as rodadas pedidas", () => {
    assert.throws(
      () => kocLegacyPlan(6, {...baseConfig, roundsPerBracket: 3}),
      (e: unknown) => e instanceof KocBracketError,
    );
  });
});

describe("buildKingOfCourtRounds com plano explícito", () => {
  /** O invariante que pega semi nascendo com vaga a mais ou a menos. */
  function assertRostersAreComplete(drafts: KocRoundDraft[], label: string): void {
    for (const d of drafts) {
      assert.equal(
        d.teamIds.length + d.qualifiers.length,
        d.size,
        `${label}: fase ${d.phase} ${d.poolId} #${d.matchNumber} pede ${d.size} ` +
          `e tem ${d.teamIds.length} + ${d.qualifiers.length}`,
      );
    }
  }

  it("10 duplas: semi de 6 com 4 baterias e final de 4", () => {
    const config: KocConfig = {
      ...baseConfig,
      maxTeamsPerRound: 6,
      phases: kocProposePlan(10, 6, () => 900),
    };
    const drafts = buildKingOfCourtRounds(seeds(10), config);
    assert.deepEqual(
      drafts.map((d) => [d.phase, d.poolId, d.size, d.batteryLabel]),
      [
        [1, "C1", 5, 1], [1, "C1", 4, 2], [1, "C1", 3, 3],
        [1, "C2", 5, 1], [1, "C2", 4, 2], [1, "C2", 3, 3],
        [2, "C1", 6, 1], [2, "C1", 5, 2], [2, "C1", 4, 3], [2, "C1", 3, 4],
        [3, "C1", 4, 1],
      ],
    );
    assert.equal(drafts.at(-1)!.matchType, "koc_final");
    assert.equal(drafts[6]!.matchType, "koc_semifinal");
    assertRostersAreComplete(drafts, "10 duplas");
  });

  it("a bateria 2 em diante herda quem FICOU na quadra", () => {
    const config: KocConfig = {
      ...baseConfig, maxTeamsPerRound: 6, phases: kocProposePlan(10, 6, () => 900),
    };
    const drafts = buildKingOfCourtRounds(seeds(10), config);
    // Bateria 2 da chave 1: lugares 2 a 5 da bateria 1, que é o elenco menos a
    // classificada.
    assert.deepEqual(
      drafts[1]!.qualifiers.map((q) => q.place),
      [2, 3, 4, 5],
    );
    assert.ok(drafts[1]!.qualifiers.every((q) => q.fromMatchNumber === drafts[0]!.matchNumber));
  });

  it("3 a 24 duplas: nenhuma rodada nasce com vaga sobrando ou faltando", () => {
    for (let n = 3; n <= 24; n++) {
      const config: KocConfig = {
        ...baseConfig, maxTeamsPerRound: 6, phases: kocProposePlan(n, 6, () => 900),
      };
      assertRostersAreComplete(buildKingOfCourtRounds(seeds(n), config), `${n} duplas`);
    }
  });

  it("as classificadas de uma chave caem em rodadas DIFERENTES da fase seguinte", () => {
    // 20 duplas: 4 chaves de 5 com 3 baterias cada mandam 12 para 2 semis de 6.
    // Se as 3 de uma chave caíssem na mesma semi, quem acabou de se enfrentar
    // reencontraria antes da hora.
    const config: KocConfig = {
      ...baseConfig, maxTeamsPerRound: 6, phases: kocProposePlan(20, 6, () => 900),
    };
    const drafts = buildKingOfCourtRounds(seeds(20), config);
    const semiFirsts = drafts.filter((d) => d.phase === 2 && d.batteryLabel === 1);
    assert.equal(semiFirsts.length, 2);
    for (const pool of ["C1", "C2", "C3", "C4"]) {
      const sources = new Set(
        drafts.filter((d) => d.phase === 1 && d.poolId === pool).map((d) => d.matchNumber),
      );
      assert.equal(sources.size, 3, `${pool} deveria ter 3 baterias`);
      const perSemi = semiFirsts.map(
        (semi) => semi.qualifiers.filter((q) => sources.has(q.fromMatchNumber)).length,
      );
      assert.ok(
        perSemi.every((n) => n < 3),
        `as 3 classificadas de ${pool} caíram todas na mesma semifinal (${perSemi.join("/")})`,
      );
    }
  });

  it("recusa contagem de chaves que o sorteio não reproduz", () => {
    const config: KocConfig = {
      ...baseConfig,
      phases: [
        // 25 duplas em 6 chaves: o sorteio devolveria 5 caixas de alvo 5.
        {bracketSizes: [5, 5, 5, 4, 3, 3], roundsPerBracket: 1, qualifiersPerRound: 2, durationSec: 900},
        {bracketSizes: [6, 6], roundsPerBracket: 1, qualifiersPerRound: 1, durationSec: 900},
        {bracketSizes: [2], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900},
      ],
    };
    assert.throws(() => buildKingOfCourtRounds(seeds(25), config), (e: unknown) => {
      assert.ok(e instanceof KocBracketError);
      assert.equal(e.reason, "koc_bracket_count_not_roundtrippable");
      return true;
    });
  });

  it("recusa bateria que ficaria abaixo do mínimo", () => {
    const config: KocConfig = {
      ...baseConfig,
      phases: [
        {bracketSizes: [4, 4], roundsPerBracket: 3, qualifiersPerRound: 1, durationSec: 900},
        {bracketSizes: [6], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900},
      ],
    };
    assert.throws(() => buildKingOfCourtRounds(seeds(8), config), (e: unknown) => {
      assert.ok(e instanceof KocBracketError);
      assert.equal(e.reason, "koc_battery_too_small");
      return true;
    });
  });

  it("recusa plano cuja fase 1 não cobre o campo", () => {
    const config: KocConfig = {
      ...baseConfig,
      phases: [{bracketSizes: [4, 4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900}],
    };
    assert.throws(() => buildKingOfCourtRounds(seeds(10), config), (e: unknown) => {
      assert.ok(e instanceof KocBracketError);
      assert.equal(e.reason, "koc_phase_size_mismatch");
      return true;
    });
  });
});

describe("retrocompat: config sem plano gera o que sempre gerou", () => {
  it("o plano derivado e o explícito produzem a MESMA chave", () => {
    for (const [n, cfg] of [
      [16, baseConfig],
      [14, {...baseConfig, roundsPerBracket: 2}],
      [12, {...baseConfig, teamsPerCourt: 5, qualifiersPerRound: 2}],
      [10, {...baseConfig, teamsPerCourt: 5, roundsPerBracket: 3}],
    ] as Array<[number, KocConfig]>) {
      const derived = buildKingOfCourtRounds(seeds(n), cfg);
      const explicit = buildKingOfCourtRounds(seeds(n), {
        ...cfg, phases: kocLegacyPlan(n, cfg),
      });
      assert.deepEqual(explicit, derived, `${n} duplas`);
    }
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

```bash
cd functions && npm run build 2>&1 | head -20
```

Esperado: FALHA de compilação — `kocLegacyPlan` não existe e `batteryLabel` não é campo de `KocRoundDraft`.

- [ ] **Step 3: Implementar**

Em `functions/src/koc-bracket-builders.ts`:

**3a.** Em `KocConfig`, acrescente os dois campos novos ao final da interface:

```ts
  /**
   * Plano explícito de fases. Quando existe, MANDA: o gerador não planeja nada,
   * só emite. Ausente, o plano é derivado dos campos acima por `kocLegacyPlan`.
   */
  phases?: KocPhaseSpec[];
  /** Teto de duplas numa bateria nesta categoria. Ausente ⇒ o teto de sempre. */
  maxTeamsPerRound?: number;
```

**3b.** Em `KocRoundDraft`, acrescente depois de `roundLabel`:

```ts
  /**
   * Posição da bateria DENTRO da chave (1, 2, 3…). `roundLabel` é a posição na
   * fase e, com 20 duplas, diz "Rodada 9" — número que não responde nada pra
   * quem está na areia. Com os dois o telão diz "Chave 4 · Bateria 3".
   */
  batteryLabel: number;
```

**3c.** Substitua `emitPhaseOneWithBracketRounds` inteira por `emitPhase`:

```ts
/**
 * Emite as rodadas de UMA fase.
 *
 * Vale para qualquer fase — era exclusiva da classificatória e virou geral
 * quando a semifinal passou a poder rodar várias baterias.
 *
 * CHAVE por fora, bateria por dentro: as baterias de uma mesma chave saem em
 * sequência, porque na areia é o mesmo grupo na mesma quadra. Emitir por
 * bateria espalharia a chave pela grade e mandaria as duplas saírem da quadra
 * para voltar depois.
 */
function emitPhase(params: {
  drafts: KocRoundDraft[];
  phase: number;
  spec: KocPhaseSpec;
  matchType: string;
  /** Elenco fechado por chave — só na fase 1. Nulo nas seguintes. */
  rosters: string[][] | null;
  /** Rodadas da fase anterior, de onde vêm as vagas da bateria 1. */
  previousPhase: readonly KocRoundDraft[];
  /** Quantas classificadas cada rodada da fase anterior manda para cá. */
  previousQualifiersPerRound: number;
  nextMatchNumber: () => number;
}): void {
  const {drafts, phase, spec, matchType, rosters, previousPhase} = params;
  const q = Math.max(1, Math.floor(spec.qualifiersPerRound));
  const rounds = Math.max(1, Math.floor(spec.roundsPerBracket));
  const emitted: KocRoundDraft[] = [];
  let label = 0;

  for (let bracket = 0; bracket < spec.bracketSizes.length; bracket++) {
    let previous: KocRoundDraft | null = null;
    for (let battery = 1; battery <= rounds; battery++) {
      const size = spec.bracketSizes[bracket]! - (battery - 1) * q;
      if (size < KOC_MIN_TEAMS_PER_ROUND) {
        throw new KocBracketError(
          `A chave ${bracket + 1} da fase ${phase} ficaria com ${size} duplas na ` +
            `bateria ${battery}: toda bateria precisa de ${KOC_MIN_TEAMS_PER_ROUND}.`,
          "koc_battery_too_small",
        );
      }

      // Da segunda bateria em diante o elenco são os NÃO classificados da
      // anterior: os lugares depois das que saíram, que é quem ficou na quadra.
      const qualifiers: KocQualifierSlot[] = [];
      if (previous) {
        for (let place = q + 1; place <= previous.size; place++) {
          qualifiers.push({
            fromMatchNumber: previous.matchNumber,
            fromRoundLabel: previous.roundLabel,
            place,
          });
        }
      }

      const draft: KocRoundDraft = {
        phase,
        matchType,
        poolId: `C${bracket + 1}`,
        matchNumber: params.nextMatchNumber(),
        roundLabel: ++label,
        batteryLabel: battery,
        teamIds: !previous && rosters ? rosters[bracket]! : [],
        qualifiers,
        size,
        durationSec: spec.durationSec,
        // `chave + (bateria − 1)`, não `chave × N + (bateria − 1)`: as duas
        // separam as classificadas da mesma chave, mas a multiplicativa agrupa
        // por ORDEM de classificação — todas as que venceram contra a chave
        // cheia numa semi só, que nasceria muito mais forte que a outra.
        crossoverIndex: bracket + (battery - 1),
      };
      emitted.push(draft);
      drafts.push(draft);
      previous = draft;
    }
  }

  // A bateria 1 de cada chave recebe do cruzamento da fase anterior.
  if (previousPhase.length > 0) {
    const firsts = emitted.filter((d) => d.batteryLabel === 1);
    for (const source of previousPhase) {
      for (let place = 1; place <= params.previousQualifiersPerRound; place++) {
        const target = kocNextRoundIndex(
          source.crossoverIndex ?? source.roundLabel - 1,
          place,
          firsts.length,
        );
        firsts[target]!.qualifiers.push({
          fromMatchNumber: source.matchNumber,
          fromRoundLabel: source.roundLabel,
          place,
        });
      }
    }
  }
}
```

**3d.** Acrescente `kocLegacyPlan` e `kocResolvePlan` logo antes de `buildKingOfCourtRounds`:

```ts
/**
 * O plano que as regras de HOJE produzem, para config sem `phases`.
 *
 * Não é o mesmo critério de `kocProposePlan`: aqui manda o que o organizador
 * escolheu (`teamsPerCourt`, `roundsPerBracket`, `qualifiersPerRound`), e o
 * resultado tem que ser bit a bit o de antes desta entrega. É o que mantém
 * chave de torneio existente igual.
 */
export function kocLegacyPlan(teamCount: number, config: KocConfig): KocPhaseSpec[] {
  const qualifiersPerRound = Math.max(1, Math.floor(config.qualifiersPerRound));
  const roundsPerBracket = Math.max(1, Math.floor(config.roundsPerBracket ?? 1));
  const phases: KocPhaseSpec[] = [];
  let fieldSize = teamCount;

  while (phases.length < KOC_MAX_PHASES) {
    const isFirst = phases.length === 0;
    const phaseNumber = phases.length + 1;
    const durationSec = durationForPhase(phaseNumber, config);
    const brackets = isFirst && roundsPerBracket > 1 ?
      kocBracketCountForRounds(fieldSize, config.teamsPerCourt, roundsPerBracket) :
      kocRoundCount(fieldSize, config.teamsPerCourt);
    const bracketSizes = kocRoundSizes(fieldSize, brackets);

    if (brackets === 1) {
      phases.push({bracketSizes, roundsPerBracket: 1, qualifiersPerRound: 0, durationSec});
      return phases;
    }

    if (isFirst && roundsPerBracket > 1) {
      const smallest = Math.min(...bracketSizes);
      const max = kocMaxRoundsPerBracket(smallest);
      if (roundsPerBracket > max) {
        throw new KocBracketError(
          `Uma chave de ${smallest} duplas comporta no máximo ${max} rodada(s): ` +
            `cada vencedora sai e toda rodada precisa de ${KOC_MIN_TEAMS_PER_ROUND}. ` +
            `Foram pedidas ${roundsPerBracket}.`,
          "koc_rounds_per_bracket_too_high",
        );
      }
    }

    const phaseRounds = isFirst ? roundsPerBracket : 1;
    const perRound = isFirst && roundsPerBracket > 1 ? 1 : qualifiersPerRound;
    const nextFieldSize = brackets * phaseRounds * perRound;
    if (nextFieldSize >= fieldSize) {
      throw new KocBracketError(
        `Com ${qualifiersPerRound} classificadas por rodada a fase não reduz o ` +
          `campo (${fieldSize} duplas em ${brackets} rodadas). Reduza o número de ` +
          "classificadas.",
        "koc_phase_does_not_reduce",
      );
    }
    phases.push({
      bracketSizes,
      roundsPerBracket: phaseRounds,
      qualifiersPerRound: perRound,
      durationSec,
    });
    fieldSize = nextFieldSize;
  }
  return phases;
}

/**
 * Valida um plano vindo de fora (tela ou Firestore) contra o campo real.
 *
 * Plano inválido descoberto na areia é chave torta com as duplas na quadra —
 * então tudo que não fecha vira `KocBracketError` nomeado aqui.
 */
function assertPlan(phases: readonly KocPhaseSpec[], teamCount: number): KocPhaseSpec[] {
  if (phases.length === 0) {
    throw new KocBracketError("O plano de fases está vazio.", "koc_plan_empty");
  }
  const out: KocPhaseSpec[] = [];
  let field = teamCount;
  for (let i = 0; i < phases.length; i++) {
    const spec = phases[i]!;
    const sizes = spec.bracketSizes.map((n) => Math.floor(n));
    const sum = sizes.reduce((a, b) => a + b, 0);
    if (sum !== field) {
      throw new KocBracketError(
        `A fase ${i + 1} do plano soma ${sum} duplas, mas o campo dela tem ${field}.`,
        "koc_phase_size_mismatch",
      );
    }
    for (const size of sizes) {
      if (size > KOC_MAX_TEAMS_PER_ROUND) {
        throw new KocBracketError(
          `A fase ${i + 1} tem chave de ${size} duplas; o teto do formato é ` +
            `${KOC_MAX_TEAMS_PER_ROUND}.`,
          "koc_bracket_over_max",
        );
      }
    }
    if (i === 0) {
      // O sorteio ao vivo guarda o ALVO da caixa, não quantas caixas existem, e
      // reconstrói com `ceil(duplas / alvo)`. Contagem que não sobrevive a essa
      // ida e volta (25 duplas em 6 chaves voltam como 5) faria o sorteio
      // publicar um número de caixas e a geração exigir outro — descoberto
      // depois de as duplas já terem sido reveladas.
      const target = Math.max(...sizes);
      if (Math.ceil(field / target) !== sizes.length) {
        throw new KocBracketError(
          `A fase 1 pede ${sizes.length} chaves, mas com chaves de até ${target} ` +
            `duplas o sorteio monta ${Math.ceil(field / target)}.`,
          "koc_bracket_count_not_roundtrippable",
        );
      }
    }
    const isLast = i === phases.length - 1;
    const q = Math.floor(spec.qualifiersPerRound);
    if (!isLast && q < 1) {
      throw new KocBracketError(
        `A fase ${i + 1} não classifica ninguém e não é a final.`,
        "koc_phase_does_not_reduce",
      );
    }
    out.push({
      bracketSizes: sizes,
      roundsPerBracket: Math.max(1, Math.floor(spec.roundsPerBracket)),
      qualifiersPerRound: Math.max(0, q),
      durationSec: Math.min(
        KOC_MAX_ROUND_DURATION_SEC,
        Math.max(KOC_MIN_ROUND_DURATION_SEC, Math.round(spec.durationSec)),
      ),
    });
    if (isLast) break;
    const next = sizes.length * Math.max(1, Math.floor(spec.roundsPerBracket)) * q;
    if (next >= field) {
      throw new KocBracketError(
        `A fase ${i + 1} não reduz o campo (${field} duplas viram ${next}).`,
        "koc_phase_does_not_reduce",
      );
    }
    field = next;
  }
  return out;
}

/** O plano que vale: o explícito quando existe, o derivado quando não. */
export function kocResolvePlan(teamCount: number, config: KocConfig): KocPhaseSpec[] {
  if (teamCount < KOC_MIN_TEAMS_PER_ROUND) {
    throw new KocBracketError(
      `King of the Court precisa de pelo menos ${KOC_MIN_TEAMS_PER_ROUND} duplas ` +
        `na rodada — há ${teamCount}.`,
      "koc_field_too_small",
    );
  }
  return config.phases?.length ?
    assertPlan(config.phases, teamCount) :
    kocLegacyPlan(teamCount, config);
}
```

**3e.** Substitua o corpo de `buildKingOfCourtRounds` (do `const teamIds` até o `return drafts`) por:

```ts
  const teamIds = seeds.map((id) => id.trim()).filter((id) => id.length > 0);
  const phases = kocResolvePlan(teamIds.length, config);
  const totalPhases = phases.length;
  const drafts: KocRoundDraft[] = [];
  let matchNumber = 1;

  for (let i = 0; i < totalPhases; i++) {
    const spec = phases[i]!;
    const phase = i + 1;
    emitPhase({
      drafts,
      phase,
      spec,
      matchType: matchTypeForPhase(phase, totalPhases),
      rosters: i === 0 ?
        (opts?.phaseOneRosters ?
          assertPhaseOneRosters(opts.phaseOneRosters, teamIds, spec.bracketSizes) :
          kocSnakeDistribute(teamIds, spec.bracketSizes)) :
        null,
      previousPhase: i === 0 ? [] : drafts.filter((d) => d.phase === phase - 1),
      previousQualifiersPerRound: i === 0 ?
        0 :
        Math.max(1, phases[i - 1]!.qualifiersPerRound),
      nextMatchNumber: () => matchNumber++,
    });
  }

  // Rede de segurança: uma rodada com vaga a mais ou a menos só apareceria na
  // areia, com o elenco já chamado para a quadra.
  for (const draft of drafts) {
    if (draft.teamIds.length + draft.qualifiers.length !== draft.size) {
      throw new KocBracketError(
        `A rodada #${draft.matchNumber} (fase ${draft.phase}, ${draft.poolId}) pede ` +
          `${draft.size} duplas e recebeu ${draft.teamIds.length + draft.qualifiers.length}.`,
        "koc_round_roster_mismatch",
      );
    }
  }

  return drafts;
```

**3f.** Atualize `docs/business-rules/king-of-court.md`:

- Em **Conceito**, troque "3 a 5 duplas" por "3 a 6 duplas".
- Em **Restrições**, troque "Elenco da rodada: mínimo 3, máximo 5 duplas." por:
  ```
  - Elenco da rodada: mínimo 3, máximo 6 duplas. O teto é **por categoria**
    (`maxTeamsPerRound`, 3 a 6); categoria que não escolheu vale 5, o teto antigo.
    Acima de 5 a fila fica longa — é escolha do organizador, não padrão.
  ```
- Substitua o título da seção "Rodadas por chave (`roundsPerBracket`)" por "Baterias por chave" e troque o parágrafo "Vale só na **classificatória**. As fases seguintes seguem com uma rodada por chave e `qualifiersPerRound` classificadas." por:
  ```
  Vale em **qualquer fase**. Cada fase declara as suas baterias no plano
  (`phases[].roundsPerBracket`), então uma semifinal de 6 duplas pode rodar 4
  baterias e mandar 4 para a final. A final é sempre uma bateria: a tabela dela
  é o pódio.
  ```

- [ ] **Step 4: Rodar e confirmar que passam**

```bash
cd functions && npm run build && node --test lib/koc-bracket-builders.test.js
```

Esperado: PASS, incluindo os testes antigos do arquivo — se algum deles quebrar, a retrocompat está errada e é isso que tem que ser consertado, não o teste.

- [ ] **Step 5: Commit**

```bash
git add functions/src/koc-bracket-builders.ts functions/src/koc-bracket-builders.test.ts docs/business-rules/king-of-court.md
git commit -m "$(cat <<'EOF'
feat(koc): baterias em qualquer fase, geradas a partir do plano

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Config e doc da rodada carregam o plano

**Files:**
- Modify: `functions/src/organizer-category-ops.ts:160-237` (`kocRoundDoc`, `resolveKocConfig`) e `:481-525` (site de geração)
- Test: `functions/src/organizer-category-ops.koc-round-doc.test.ts`

**Interfaces:**
- Consumes: `KocPhaseSpec`, `kocResolvePlan`, `kocClampMaxPerRound`, `KOC_LEGACY_MAX_TEAMS_PER_ROUND` (Tasks 1–2).
- Produces:
  - `resolveKocConfig` devolve `KocConfig` com `phases?` e `maxTeamsPerRound` preenchidos.
  - `kocRoundDoc(draft, meta)` — `meta` ganha `plan: KocPhaseSpec[]`.
  - Doc da rodada ganha `kocBatteryLabel` e `kocConfig.phases` / `kocConfig.maxTeamsPerRound`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente em `functions/src/organizer-category-ops.koc-round-doc.test.ts`:

```ts
describe("kocRoundDoc com plano de fases", () => {
  const plan = [
    {bracketSizes: [5, 5], roundsPerBracket: 3, qualifiersPerRound: 1, durationSec: 900},
    {bracketSizes: [6], roundsPerBracket: 4, qualifiersPerRound: 1, durationSec: 900},
    {bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 1200},
  ];

  it("grava a bateria e as DUAS formas da config", () => {
    const config = resolveKocConfig({phases: plan, maxTeamsPerRound: 6}, undefined);
    const drafts = buildKingOfCourtRounds(
      Array.from({length: 10}, (_, i) => `t${i + 1}`),
      config,
    );
    const semi = drafts.find((d) => d.phase === 2 && d.batteryLabel === 2)!;
    const doc = kocRoundDoc(semi, {
      tournamentId: "T", categoryId: "C", config, plan,
    }) as Record<string, any>;

    assert.equal(doc.kocBatteryLabel, 2);
    // Forma nova.
    assert.deepEqual(doc.kocConfig.phases, plan);
    assert.equal(doc.kocConfig.maxTeamsPerRound, 6);
    // Forma velha, com os números DESTA fase — é o que o app da loja lê.
    assert.equal(doc.kocConfig.teamsPerCourt, 6);
    assert.equal(doc.kocConfig.roundsPerBracket, 4);
    assert.equal(doc.kocConfig.qualifiersPerRound, 1);
  });

  it("na final a forma velha não zera classificadas — o app leria 0 e sumiria com a tabela", () => {
    const config = resolveKocConfig({phases: plan, maxTeamsPerRound: 6}, undefined);
    const drafts = buildKingOfCourtRounds(
      Array.from({length: 10}, (_, i) => `t${i + 1}`),
      config,
    );
    const final = drafts.at(-1)!;
    const doc = kocRoundDoc(final, {
      tournamentId: "T", categoryId: "C", config, plan,
    }) as Record<string, any>;
    assert.equal(doc.kocConfig.qualifiersPerRound, 4);
  });
});

describe("resolveKocConfig com plano", () => {
  it("teto ausente vale o de sempre, não o novo", () => {
    const cfg = resolveKocConfig(undefined, {teamsPerCourt: 4});
    assert.equal(cfg.maxTeamsPerRound, KOC_LEGACY_MAX_TEAMS_PER_ROUND);
    assert.equal(cfg.phases, undefined);
  });

  it("bracketConfig ganha do doc da categoria, como no resto da função", () => {
    const cfg = resolveKocConfig(
      {phases: [{bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900}]},
      {phases: [{bracketSizes: [3], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900}]},
    );
    assert.deepEqual(cfg.phases?.[0]?.bracketSizes, [4]);
  });

  it("plano malformado é descartado em vez de derrubar a publicação", () => {
    const cfg = resolveKocConfig({phases: [{bracketSizes: "x"}]}, undefined);
    assert.equal(cfg.phases, undefined);
  });
});
```

Importe no topo do arquivo de teste o que faltar: `buildKingOfCourtRounds`, `KOC_LEGACY_MAX_TEAMS_PER_ROUND`, `resolveKocConfig`, `kocRoundDoc`.

- [ ] **Step 2: Rodar e confirmar que falham**

```bash
cd functions && npm run build 2>&1 | head -20
```

Esperado: FALHA — `meta` de `kocRoundDoc` não aceita `plan`.

- [ ] **Step 3: Implementar**

Em `functions/src/organizer-category-ops.ts`:

**3a.** Acrescente ao bloco de import de `./koc-bracket-builders`: `KOC_LEGACY_MAX_TEAMS_PER_ROUND`, `kocClampMaxPerRound`, `kocResolvePlan`, `type KocPhaseSpec`.

**3b.** Acrescente antes de `kocRoundDoc` um parser do plano:

```ts
/**
 * Plano vindo do Firestore ou do payload, saneado.
 *
 * Devolve `undefined` no menor sinal de sujeira: sem plano o gerador cai nas
 * regras antigas, que funcionam. Com plano meio lido, ele geraria uma chave que
 * ninguém pediu.
 */
export function parseKocPhases(raw: unknown): KocPhaseSpec[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: KocPhaseSpec[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") return undefined;
    const row = item as Record<string, unknown>;
    const sizes = Array.isArray(row.bracketSizes) ?
      row.bracketSizes.map((n) => Math.floor(Number(n))) :
      null;
    if (!sizes || sizes.length === 0 || sizes.some((n) => !Number.isFinite(n) || n < 1)) {
      return undefined;
    }
    const rounds = Math.floor(Number(row.roundsPerBracket));
    const qualifiers = Math.floor(Number(row.qualifiersPerRound));
    const duration = Math.round(Number(row.durationSec));
    if (!Number.isFinite(rounds) || rounds < 1) return undefined;
    if (!Number.isFinite(qualifiers) || qualifiers < 0) return undefined;
    if (!Number.isFinite(duration) || duration <= 0) return undefined;
    out.push({
      bracketSizes: sizes,
      roundsPerBracket: rounds,
      qualifiersPerRound: qualifiers,
      durationSec: duration,
    });
  }
  return out;
}
```

**3c.** Em `resolveKocConfig`, antes do `return`, resolva os dois campos novos, e acrescente-os ao objeto devolvido:

```ts
  const phases = parseKocPhases(pick("phases"));
  const maxTeamsPerRound = kocClampMaxPerRound(pick("maxTeamsPerRound"));

  return {
    teamsPerCourt: int(pick("teamsPerCourt"), KOC_DEFAULT_TEAMS_PER_COURT),
    roundsPerBracket: int(pick("roundsPerBracket"), 1),
    qualifiersPerRound: int(pick("qualifiersPerRound"), 2),
    roundDurationSec: int(pick("roundDurationSec"), KOC_DEFAULT_ROUND_DURATION_SEC),
    maxTeamsPerRound,
    ...(phases ? {phases} : {}),
    ...(Object.keys(phaseDurations).length > 0 ?
      {phaseDurationsSec: phaseDurations} :
      {}),
  };
```

**3d.** Em `kocRoundDoc`, mude a assinatura de `meta` e o bloco `kocConfig`:

```ts
export function kocRoundDoc(
  draft: KocRoundDraft,
  meta: {
    tournamentId: string;
    categoryId: string;
    config: KocConfig;
    plan: KocPhaseSpec[];
  },
): Record<string, unknown> {
```

Dentro da função, antes do `return`:

```ts
  const spec = meta.plan[draft.phase - 1];
  // Números DESTA fase na forma velha. O app da loja, o overlay e o LED leem
  // `teamsPerCourt`/`roundsPerBracket`/`qualifiersPerRound` e não conhecem
  // `phases`; sem isto eles mostrariam a config da categoria, que na fase 2 já
  // não é a que está na quadra.
  const legacyTeamsPerCourt = spec ?
    Math.max(...spec.bracketSizes) :
    meta.config.teamsPerCourt;
  const legacyRounds = spec?.roundsPerBracket ?? meta.config.roundsPerBracket ?? 1;
  // Na final ninguém classifica (`0`), mas 0 faria a tabela sumir na tela
  // antiga: ali o número honesto é o elenco inteiro, que é o pódio.
  const legacyQualifiers = spec ?
    (spec.qualifiersPerRound > 0 ? spec.qualifiersPerRound : draft.size) :
    meta.config.qualifiersPerRound;
```

E no objeto devolvido, acrescente `kocBatteryLabel` depois de `kocRoundLabel` e troque o bloco `kocConfig`:

```ts
    kocRoundLabel: draft.roundLabel,
    kocBatteryLabel: draft.batteryLabel,
```

```ts
    kocConfig: {
      roundEndMode: "time",
      durationSec: draft.durationSec,
      // Forma nova: o plano inteiro, congelado. Mexer no plano da categoria
      // depois não altera chave já publicada.
      phases: meta.plan,
      maxTeamsPerRound: meta.config.maxTeamsPerRound ?? KOC_LEGACY_MAX_TEAMS_PER_ROUND,
      // Forma velha, para quem ainda não conhece `phases`.
      teamsPerCourt: legacyTeamsPerCourt,
      roundsPerBracket: legacyRounds,
      qualifiersPerRound: legacyQualifiers,
      crownScores: false,
    },
```

**3e.** No site de geração (`runGenerateCategoryBracket`), resolva o plano uma vez e passe aos dois. Substitua o bloco `let kocRounds … }` por:

```ts
  let kocRounds: KocRoundDraft[] = [];
  let kocPlan: KocPhaseSpec[] = [];
  if (isKingOfCourt && kocConfig) {
    try {
      // Resolve UMA vez: o gerador e o doc da rodada têm que congelar o mesmo
      // plano. Resolver duas vezes deixaria a chave e o snapshot divergirem
      // quando a config mudasse no meio.
      kocPlan = kocResolvePlan(teamIds.length, kocConfig);
      // `groupsPreview` na KOTC é o resultado do SORTEIO AO VIVO: cada "grupo"
      // é uma rodada da classificatória, já com o elenco que saiu na frente do
      // público. Sem ele, a semeadura em serpentina decide (fluxo da tela de
      // gerar chave).
      kocRounds = buildKingOfCourtRounds(teamIds, {...kocConfig, phases: kocPlan}, {
        ...(groupsPreview.length > 0 ?
          {phaseOneRosters: groupsPreview.map((g) => g.teamIds)} :
          {}),
      });
    } catch (e) {
      if (e instanceof KocBracketError) {
        throw new HttpsError("failed-precondition", e.message, {reason: e.reason});
      }
      throw e;
    }
  }
```

E na montagem dos docs:

```ts
      kocRounds.map((draft) =>
        kocRoundDoc(draft, {tournamentId, categoryId, config: kocConfig, plan: kocPlan}),
      ) :
```

- [ ] **Step 4: Rodar e confirmar que passam**

```bash
cd functions && npm run build && node --test lib/organizer-category-ops.koc-round-doc.test.js lib/koc-bracket-builders.test.js
```

Esperado: PASS nos dois arquivos.

- [ ] **Step 5: Commit**

```bash
git add functions/src/organizer-category-ops.ts functions/src/organizer-category-ops.koc-round-doc.test.ts
git commit -m "$(cat <<'EOF'
feat(koc): rodada congela o plano de fases e a bateria

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Sorteio ao vivo divide pelo plano

**Files:**
- Modify: `functions/src/draw-sessions.ts:162-188` (`CategoryMeta`, `categoryMetaOf`), `:244-292` (validação e `teamsPerBox`)
- Test: `functions/src/koc-draw-bracket-agreement.test.ts`

**Interfaces:**
- Consumes: `kocResolvePlan`, `parseKocPhases`, `kocClampMaxPerRound`, `KocBracketError` (Tasks 1–3).
- Produces: nada consumido por tasks posteriores.

- [ ] **Step 1: Escrever o teste que falha**

Acrescente em `functions/src/koc-draw-bracket-agreement.test.ts`:

```ts
describe("o sorteio reproduz as chaves do plano, inclusive desiguais", () => {
  /** Reproduz `createDrawSession`: o plano decide o alvo da caixa. */
  function boxesFromPlan(teamCount: number, plan: KocPhaseSpec[]): number[] {
    const teamsPerBox = Math.max(...plan[0]!.bracketSizes);
    return groupCapacities(teamCount, teamsPerBox).map((g) => g.capacity);
  }

  it("11 duplas com teto 6: [6,5] no plano e [6,5] no sorteio", () => {
    const plan = kocProposePlan(11, 6, () => 900);
    assert.deepEqual(plan[0]!.bracketSizes, [6, 5]);
    assert.deepEqual(boxesFromPlan(11, plan), [6, 5]);
  });

  it("3 a 24 duplas: o sorteio devolve exatamente as chaves da fase 1", () => {
    for (let n = 3; n <= 24; n++) {
      const plan = kocProposePlan(n, 6, () => 900);
      assert.deepEqual(
        boxesFromPlan(n, plan),
        plan[0]!.bracketSizes,
        `${n} duplas`,
      );
    }
  });

  it("o elenco sorteado é aceito pela geração sem discordância", () => {
    for (let n = 7; n <= 24; n++) {
      const plan = kocProposePlan(n, 6, () => 900);
      const teamIds = Array.from({length: n}, (_, i) => `t${i + 1}`);
      let cursor = 0;
      const rosters = boxesFromPlan(n, plan).map((cap) =>
        teamIds.slice(cursor, (cursor += cap)),
      );
      const config: KocConfig = {
        teamsPerCourt: 4, qualifiersPerRound: 2, roundDurationSec: 900,
        maxTeamsPerRound: 6, phases: plan,
      };
      assert.doesNotThrow(
        () => buildKingOfCourtRounds(teamIds, config, {phaseOneRosters: rosters}),
        `${n} duplas`,
      );
    }
  });
});
```

Importe `kocProposePlan` e `type KocPhaseSpec` no topo do arquivo.

- [ ] **Step 2: Rodar e confirmar que falham**

```bash
cd functions && npm run build && node --test lib/koc-draw-bracket-agreement.test.js
```

Esperado: FALHA na importação de `kocProposePlan` se a Task 1 não estiver aplicada; com ela aplicada, os três testes passam já aqui (o plano e o sorteio concordam por construção) — nesse caso siga para o Step 3, que é o que faz a **callable** usar o plano.

- [ ] **Step 3: Implementar**

Em `functions/src/draw-sessions.ts`:

**3a.** Acrescente ao import de `./koc-bracket-builders`: `kocClampMaxPerRound`, `kocResolvePlan`, `KocBracketError`, `type KocPhaseSpec`; e importe `parseKocPhases` de `./organizer-category-ops`.

**3b.** Em `CategoryMeta`, acrescente:

```ts
  /** Plano explícito de fases da categoria; ausente ⇒ regras antigas. */
  kocPhases: KocPhaseSpec[] | undefined;
  /** Teto de duplas numa bateria nesta categoria. */
  kocMaxTeamsPerRound: number;
```

**3c.** Em `categoryMetaOf`, acrescente ao objeto devolvido:

```ts
    kocPhases: parseKocPhases(found?.kocPhases ?? found?.phases),
    kocMaxTeamsPerRound: kocClampMaxPerRound(found?.kocMaxTeamsPerRound ?? found?.maxTeamsPerRound),
```

**3d.** Substitua o bloco `if (format === "king_of_court" && category.roundsPerBracket > 1) { … }` inteiro por:

```ts
  // Recusa AQUI, não no publish. O sorteio ao vivo acontece na frente do
  // público: descobrir que a configuração não fecha depois de revelar as duplas
  // obrigaria a anular a sessão inteira com todo mundo olhando.
  let kocPlan: KocPhaseSpec[] = [];
  if (format === "king_of_court") {
    try {
      kocPlan = kocResolvePlan(teamIds.length, {
        teamsPerCourt: category.teamsPerCourt,
        qualifiersPerRound: category.qualifiersPerGroup,
        roundsPerBracket: category.roundsPerBracket,
        roundDurationSec: KOC_DEFAULT_ROUND_DURATION_SEC,
        maxTeamsPerRound: category.kocMaxTeamsPerRound,
        ...(category.kocPhases ? {phases: category.kocPhases} : {}),
      });
    } catch (e) {
      if (e instanceof KocBracketError) {
        throw new HttpsError("failed-precondition", e.message, {reason: e.reason});
      }
      throw e;
    }
  }
```

**3e.** Substitua o cálculo de `teamsPerBox`:

```ts
  // Tamanho da caixa do sorteio. Na KOTC a caixa é uma CHAVE, e quem decide o
  // tamanho é o PLANO — não uma conta refeita aqui. O elenco sorteado vira o
  // elenco da fase 1, e a geração recusa quando o número de caixas não bate.
  // `groupCapacities` reconstrói por `ceil(duplas / alvo)`, que é a mesma
  // distribuição de `kocRoundSizes`: o maior tamanho do plano é o alvo.
  const teamsPerBox = format === "king_of_court" ?
    Math.max(...kocPlan[0]!.bracketSizes) :
    category.teamsPerGroup;
```

Importe `KOC_DEFAULT_ROUND_DURATION_SEC` de `./koc-bracket-builders` se ainda não estiver importado.

- [ ] **Step 4: Rodar e confirmar que passam**

```bash
cd functions && npm run build && node --test lib/koc-draw-bracket-agreement.test.js lib/koc-bracket-builders.test.js
```

Esperado: PASS. O `npm run build` também prova que `draw-sessions.ts` compila com os campos novos.

- [ ] **Step 5: Commit**

```bash
git add functions/src/draw-sessions.ts functions/src/koc-draw-bracket-agreement.test.ts
git commit -m "$(cat <<'EOF'
feat(koc): sorteio ao vivo divide o campo pelo plano de fases

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Espelho do plano no portal

**Files:**
- Create: `frontend/projects/organizer/src/app/painel/data/koc-phase-plan.ts`
- Test: `frontend/projects/organizer/src/app/painel/data/koc-phase-plan.spec.ts`

**Interfaces:**
- Consumes: nada. É módulo folha — declara o próprio piso/teto e os próprios `kocBracketCount`/`kocBracketSizes`, espelhando o servidor.
- Produces:
  - `interface KocPhaseSpec { bracketSizes: number[]; roundsPerBracket: number; qualifiersPerRound: number; durationSec: number }`
  - `KOC_MAX_TEAMS_PER_ROUND_HARD = 6`, `KOC_LEGACY_MAX_TEAMS_PER_ROUND = 5`
  - `kocMaxRoundsPerBracketFor(bracketSize: number, qualifiersPerRound?: number): number`
  - `kocProposePhasePlan(teamCount: number, maxPerRound: number, durationSec: number): KocPhaseSpec[]`
  - `kocPhaseFieldSizes(plan: KocPhaseSpec[]): number[]`
  - `kocBracketCountOptions(field: number, maxPerRound: number): number[]`
  - `kocApplyPhaseEdit(plan, phaseIndex, patch, maxPerRound): KocPhaseSpec[]`
  - `kocPlanTotals(plan: KocPhaseSpec[], courts: number): { rounds: number; seconds: number; label: string }`
  - `kocClampMaxPerRound(value: number | null | undefined): number`
  - `parseKocPhases(raw: unknown): KocPhaseSpec[] | null`
  - `kocPlansMatch(a: KocPhaseSpec[], b: KocPhaseSpec[]): boolean`
  - `interface KocPhasePatch { bracketCount?: number; roundsPerBracket?: number; qualifiersPerRound?: number; durationSec?: number }`

- [ ] **Step 1: Escrever os testes que falham**

Crie `frontend/projects/organizer/src/app/painel/data/koc-phase-plan.spec.ts`:

```ts
import {
  kocApplyPhaseEdit,
  kocBracketCountOptions,
  kocPhaseFieldSizes,
  kocPlanTotals,
  kocProposePhasePlan,
} from './koc-phase-plan';

/** Espelho do `kocProposePlan` do servidor: a tabela mostra o plano que a
 *  geração vai executar, então divergir aqui é mentir na tela. */
describe('plano de fases · proposta', () => {
  it('10 duplas com teto 6 é o formato pedido pelo dono', () => {
    expect(kocProposePhasePlan(10, 6, 900)).toEqual([
      {bracketSizes: [5, 5], roundsPerBracket: 3, qualifiersPerRound: 1, durationSec: 900},
      {bracketSizes: [6], roundsPerBracket: 4, qualifiersPerRound: 1, durationSec: 900},
      {bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900},
    ]);
  });

  it('campo que cabe numa quadra é uma rodada só', () => {
    expect(kocProposePhasePlan(6, 6, 900)).toEqual([
      {bracketSizes: [6], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900},
    ]);
  });

  it('o campo de cada fase é o que a anterior classifica', () => {
    expect(kocPhaseFieldSizes(kocProposePhasePlan(10, 6, 900))).toEqual([10, 6, 4]);
  });
});

describe('plano de fases · contagens de chave que o sorteio reproduz', () => {
  it('só oferece contagens que sobrevivem à ida e volta pelo tamanho', () => {
    // 25 duplas em 6 chaves voltam como 5 pelo alvo 5 — 6 não pode ser oferecido.
    expect(kocBracketCountOptions(25, 6)).not.toContain(6);
    expect(kocBracketCountOptions(25, 6)).toContain(5);
  });

  it('10 duplas com teto 6 aceitam 2 ou 3 chaves', () => {
    expect(kocBracketCountOptions(10, 6)).toEqual([2, 3]);
  });

  it('nenhuma opção fura o piso nem o teto', () => {
    for (let n = 3; n <= 30; n++) {
      for (const count of kocBracketCountOptions(n, 6)) {
        const target = Math.ceil(n / count);
        expect(target).toBeLessThanOrEqual(6);
        expect(Math.floor(n / count)).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('plano de fases · edição em cascata', () => {
  it('mexer numa fase repropõe as de baixo', () => {
    const plan = kocProposePhasePlan(10, 6, 900);
    // Baixar a semi de 4 para 2 baterias manda 2 duplas para a fase seguinte —
    // abaixo do piso, então a semi VIRA a final e o plano encurta.
    const edited = kocApplyPhaseEdit(plan, 1, {roundsPerBracket: 2}, 6);
    expect(edited.length).toBe(2);
    expect(edited[0]).toEqual(plan[0]);
    expect(edited[1].bracketSizes).toEqual([6]);
    expect(edited[1].roundsPerBracket).toBe(1);
    expect(edited[1].qualifiersPerRound).toBe(0);
  });

  it('mexer na fase 1 não muda a fase 1 e reescreve o resto', () => {
    const plan = kocProposePhasePlan(10, 6, 900);
    const edited = kocApplyPhaseEdit(plan, 0, {roundsPerBracket: 1, qualifiersPerRound: 2}, 6);
    expect(edited[0].bracketSizes).toEqual([5, 5]);
    expect(edited[0].roundsPerBracket).toBe(1);
    expect(edited[0].qualifiersPerRound).toBe(2);
    // 2 chaves × 1 bateria × 2 classificadas = 4 → final de 4.
    expect(kocPhaseFieldSizes(edited)).toEqual([10, 4]);
  });

  it('trocar a contagem de chaves redistribui os tamanhos', () => {
    const plan = kocProposePhasePlan(10, 6, 900);
    const edited = kocApplyPhaseEdit(plan, 0, {bracketCount: 3}, 6);
    expect(edited[0].bracketSizes).toEqual([4, 3, 3]);
  });

  it('a duração editada não é reproposta junto', () => {
    const plan = kocProposePhasePlan(10, 6, 900);
    const edited = kocApplyPhaseEdit(plan, 0, {durationSec: 1200}, 6);
    expect(edited[0].durationSec).toBe(1200);
  });
});

describe('plano de fases · total', () => {
  it('10 duplas dão 11 rodadas', () => {
    expect(kocPlanTotals(kocProposePhasePlan(10, 6, 900), 1).rounds).toBe(11);
  });

  it('mais quadras encurtam o relógio, não o número de rodadas', () => {
    const plan = kocProposePhasePlan(10, 6, 900);
    const one = kocPlanTotals(plan, 1);
    const two = kocPlanTotals(plan, 2);
    expect(two.rounds).toBe(one.rounds);
    expect(two.seconds).toBeLessThan(one.seconds);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

```bash
cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/koc-phase-plan.spec.ts'
```

Esperado: FALHA de compilação — `Cannot find module './koc-phase-plan'`.

- [ ] **Step 3: Implementar**

Crie `frontend/projects/organizer/src/app/painel/data/koc-phase-plan.ts`:

```ts
/** Plano de fases do King of the Court, no portal.
 *
 *  Espelho de `functions/src/koc-bracket-builders.ts`. A FONTE DA VERDADE é o
 *  servidor: nada aqui grava chave — a tela propõe, o organizador ajusta, e o
 *  plano viaja no `bracketConfig`. Divergir do servidor faz a tabela prometer
 *  um formato e a geração entregar outro.
 *
 *  MÓDULO FOLHA, de propósito: `koc.ts`, `tournaments-repository.ts` e a tela
 *  importam daqui, e nada daqui importa deles. `koc.ts` e
 *  `tournament-create.model.ts` já duplicam o piso e o teto pelo mesmo motivo —
 *  importar de volta fecharia um ciclo. */

/** Teto duro do formato. Acima de 6 a fila deixa todo mundo esperando. */
export const KOC_MAX_TEAMS_PER_ROUND_HARD = 6;
/** Teto de quem não escolheu — o de antes desta entrega. */
export const KOC_LEGACY_MAX_TEAMS_PER_ROUND = 5;
/** Menos de 3 não gira a fila. Mesma constante de `koc.ts`, sem o import. */
export const KOC_MIN_TEAMS_PER_ROUND = 3;

const KOC_MAX_PHASES = 6;
const KOC_CHANGEOVER_SEC = 300;
/** Descanso de quem classifica na última bateria e entra na fase seguinte. */
const KOC_PHASE_BREAK_SEC = 900;

export interface KocPhaseSpec {
  bracketSizes: number[];
  roundsPerBracket: number;
  /** 0 só na final: ali ninguém classifica, a tabela é o pódio. */
  qualifiersPerRound: number;
  durationSec: number;
}

/** Espelha `kocClampMaxPerRound` do servidor. */
export function kocClampMaxPerRound(value: number | null | undefined): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return KOC_LEGACY_MAX_TEAMS_PER_ROUND;
  return Math.min(KOC_MAX_TEAMS_PER_ROUND_HARD, Math.max(KOC_MIN_TEAMS_PER_ROUND, n));
}

/** Espelha `kocMaxRoundsPerBracket` do servidor. */
export function kocMaxRoundsPerBracketFor(bracketSize: number, qualifiersPerRound = 1): number {
  const q = Math.max(1, Math.floor(qualifiersPerRound));
  return Math.max(1, Math.floor((bracketSize - KOC_MIN_TEAMS_PER_ROUND) / q) + 1);
}

/** Espelha `kocRoundCount` do servidor: corrige as duas pontas. `0` = não fecha. */
export function kocBracketCount(field: number, maxPerRound: number): number {
  if (field < KOC_MIN_TEAMS_PER_ROUND) return 0;
  const per = kocClampMaxPerRound(maxPerRound);
  let count = Math.max(1, Math.ceil(field / per));
  while (count > 1 && Math.floor(field / count) < KOC_MIN_TEAMS_PER_ROUND) count--;
  while (Math.ceil(field / count) > per) count++;
  return count;
}

/** Espelha `kocRoundSizes` do servidor: o resto vai nas primeiras chaves. */
export function kocBracketSizes(field: number, brackets: number): number[] {
  const base = Math.floor(field / brackets);
  const extra = field % brackets;
  return Array.from({ length: brackets }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Espelha `kocProposeTail` do servidor. */
function proposeTail(field: number, maxPerRound: number, durationSec: number, startPhase: number): KocPhaseSpec[] {
  const max = kocClampMaxPerRound(maxPerRound);
  const phases: KocPhaseSpec[] = [];
  let remaining = field;
  while (startPhase + phases.length <= KOC_MAX_PHASES) {
    const brackets = kocBracketCount(remaining, max);
    if (brackets === 0) return phases;
    const bracketSizes = kocBracketSizes(remaining, brackets);
    const smallest = Math.min(...bracketSizes);
    const rounds = kocMaxRoundsPerBracketFor(smallest, 1);
    const qualifiers = rounds === 1
      ? Math.max(1, Math.min(smallest - 1, Math.floor((remaining - 1) / brackets)))
      : 1;
    const next = brackets * rounds * qualifiers;
    if (next < KOC_MIN_TEAMS_PER_ROUND) {
      phases.push({ bracketSizes, roundsPerBracket: 1, qualifiersPerRound: 0, durationSec });
      return phases;
    }
    phases.push({ bracketSizes, roundsPerBracket: rounds, qualifiersPerRound: qualifiers, durationSec });
    remaining = next;
  }
  return phases;
}

/** Espelha `kocProposePlan` do servidor: máximo de jogo. */
export function kocProposePhasePlan(teamCount: number, maxPerRound: number, durationSec: number): KocPhaseSpec[] {
  if (teamCount < KOC_MIN_TEAMS_PER_ROUND) return [];
  const max = kocClampMaxPerRound(maxPerRound);
  if (teamCount <= max) {
    return [{ bracketSizes: [teamCount], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec }];
  }
  return proposeTail(teamCount, max, durationSec, 1);
}

/** Quantas duplas entram em cada fase. A coluna "Passam" é esta lista deslocada. */
export function kocPhaseFieldSizes(plan: KocPhaseSpec[]): number[] {
  return plan.map((p) => p.bracketSizes.reduce((a, b) => a + b, 0));
}

/**
 * Contagens de chave que o SORTEIO reproduz.
 *
 * O sorteio guarda o alvo da caixa, não quantas caixas existem, e reconstrói
 * com `ceil(duplas / alvo)`. Nem toda contagem sobrevive: 25 duplas em 6 chaves
 * voltam como 5. Oferecer uma que não volta faria a geração recusar o sorteio
 * depois de as duplas já terem sido reveladas.
 */
export function kocBracketCountOptions(field: number, maxPerRound: number): number[] {
  const max = kocClampMaxPerRound(maxPerRound);
  const out: number[] = [];
  for (let n = 1; n <= Math.floor(field / KOC_MIN_TEAMS_PER_ROUND); n++) {
    const target = Math.ceil(field / n);
    if (target > max) continue;
    if (Math.floor(field / n) < KOC_MIN_TEAMS_PER_ROUND) continue;
    if (Math.ceil(field / target) !== n) continue;
    out.push(n);
  }
  return out;
}

export interface KocPhasePatch {
  bracketCount?: number;
  roundsPerBracket?: number;
  qualifiersPerRound?: number;
  durationSec?: number;
}

/**
 * Aplica a edição de UMA fase e repropõe as de baixo.
 *
 * O campo cascateia: mexer nas baterias da semi muda quantas duplas chegam à
 * final, e às vezes some com a final inteira. Manter as fases seguintes como
 * estavam deixaria o plano com soma errada, que a geração recusaria.
 */
export function kocApplyPhaseEdit(
  plan: KocPhaseSpec[],
  phaseIndex: number,
  patch: KocPhasePatch,
  maxPerRound: number,
): KocPhaseSpec[] {
  const current = plan[phaseIndex];
  if (!current) return plan;
  const field = current.bracketSizes.reduce((a, b) => a + b, 0);
  const max = kocClampMaxPerRound(maxPerRound);

  const bracketCount = patch.bracketCount ?? current.bracketSizes.length;
  const bracketSizes = kocBracketSizes(field, bracketCount);
  const smallest = Math.min(...bracketSizes);
  const durationSec = patch.durationSec ?? current.durationSec;

  let qualifiersPerRound = Math.max(1, patch.qualifiersPerRound ?? Math.max(1, current.qualifiersPerRound));
  qualifiersPerRound = Math.min(qualifiersPerRound, Math.max(1, smallest - 1));
  let roundsPerBracket = Math.max(1, patch.roundsPerBracket ?? current.roundsPerBracket);
  roundsPerBracket = Math.min(roundsPerBracket, kocMaxRoundsPerBracketFor(smallest, qualifiersPerRound));

  const next = bracketCount * roundsPerBracket * qualifiersPerRound;
  const head = plan.slice(0, phaseIndex);

  // Fase que mandaria menos de 3 duplas adiante É a final: ninguém classifica,
  // e a final é UMA bateria — a tabela dela é o pódio. Manter as baterias
  // pedidas aqui eliminaria duplas depois de o pódio já estar definido.
  if (next < KOC_MIN_TEAMS_PER_ROUND || next >= field) {
    return [...head, { bracketSizes, roundsPerBracket: 1, qualifiersPerRound: 0, durationSec }];
  }
  return [
    ...head,
    { bracketSizes, roundsPerBracket, qualifiersPerRound, durationSec },
    ...proposeTail(next, max, durationSec, phaseIndex + 2),
  ];
}

export interface KocPlanTotals {
  rounds: number;
  seconds: number;
  /** "3h40" / "45min" — o número que responde se cabe na reserva da quadra. */
  label: string;
}

export function kocPlanTotals(plan: KocPhaseSpec[], courts: number): KocPlanTotals {
  const parallel = Math.max(1, Math.floor(courts));
  let rounds = 0;
  let seconds = 0;
  for (let i = 0; i < plan.length; i++) {
    const phase = plan[i];
    // As baterias de uma chave são SEQUENCIAIS na mesma quadra: o paralelismo
    // vem das chaves, não das baterias.
    const waves = Math.ceil(phase.bracketSizes.length / parallel) * phase.roundsPerBracket;
    rounds += phase.bracketSizes.length * phase.roundsPerBracket;
    seconds += waves * phase.durationSec + Math.max(0, waves - 1) * KOC_CHANGEOVER_SEC;
    if (i < plan.length - 1) seconds += KOC_PHASE_BREAK_SEC;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const label = hours === 0
    ? `${minutes}min`
    : minutes === 0
      ? `${hours}h`
      : `${hours}h${String(minutes).padStart(2, '0')}`;
  return { rounds, seconds, label };
}
```

E, no mesmo arquivo, o parser e o comparador que os outros módulos vão consumir:

```ts
/**
 * Plano vindo do Firestore, saneado. Espelha `parseKocPhases` do servidor.
 *
 * Sujeira derruba o plano INTEIRO: sem plano o servidor cai nas regras antigas,
 * que funcionam; com plano meio lido, a tela prometeria um formato que a chave
 * não tem.
 */
export function parseKocPhases(raw: unknown): KocPhaseSpec[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: KocPhaseSpec[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== 'object') return null;
    const row = item as Record<string, unknown>;
    const sizesRaw = row['bracketSizes'];
    if (!Array.isArray(sizesRaw) || sizesRaw.length === 0) return null;
    const sizes = (sizesRaw as unknown[]).map((n) => Math.floor(Number(n)));
    if (sizes.some((n) => !Number.isFinite(n) || n < 1)) return null;
    const rounds = Math.floor(Number(row['roundsPerBracket']));
    const qualifiers = Math.floor(Number(row['qualifiersPerRound']));
    const duration = Math.round(Number(row['durationSec']));
    if (!Number.isFinite(rounds) || rounds < 1) return null;
    if (!Number.isFinite(qualifiers) || qualifiers < 0) return null;
    if (!Number.isFinite(duration) || duration <= 0) return null;
    out.push({ bracketSizes: sizes, roundsPerBracket: rounds, qualifiersPerRound: qualifiers, durationSec: duration });
  }
  return out;
}

/** Dois planos são o mesmo quando cada fase bate em tudo que muda a CHAVE.
 *  A duração fica de fora: mudá-la não refaz a chave, só o relógio. */
export function kocPlansMatch(a: KocPhaseSpec[], b: KocPhaseSpec[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((phase, i) =>
    phase.roundsPerBracket === b[i].roundsPerBracket &&
    phase.qualifiersPerRound === b[i].qualifiersPerRound &&
    phase.bracketSizes.length === b[i].bracketSizes.length &&
    phase.bracketSizes.every((size, j) => size === b[i].bracketSizes[j]),
  );
}
```

Por fim, suba o teto em `tournament-create.model.ts:412` e `koc.ts:15` de `5` para `6`, com o comentário do porquê:

```ts
/** Teto duro do formato. Subiu para 6 com o plano de fases; categoria que não
 *  escolheu continua valendo 5 (`KOC_LEGACY_MAX_TEAMS_PER_ROUND`). Categoria
 *  antiga nunca passa mais de 5 aqui, então a conta legada não muda. */
export const KOC_MAX_TEAMS_PER_ROUND = 6;
```

- [ ] **Step 4: Rodar e confirmar que passam**

```bash
cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/koc-phase-plan.spec.ts'
```

Esperado: PASS em todos os specs do arquivo.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/data/koc-phase-plan.ts frontend/projects/organizer/src/app/painel/data/koc-phase-plan.spec.ts frontend/projects/organizer/src/app/painel/data/tournament-create.model.ts
git commit -m "$(cat <<'EOF'
feat(koc): espelho do plano de fases no portal do organizador

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Categoria lê e grava o plano

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/data/tournament.model.ts:34-36`
- Modify: `frontend/projects/organizer/src/app/painel/data/tournaments-repository.ts:93-95`
- Test: `frontend/projects/organizer/src/app/painel/data/koc-category-plan.spec.ts` (criar)

**Interfaces:**
- Consumes: `KocPhaseSpec`, `kocClampMaxPerRound`, `parseKocPhases` de `./koc-phase-plan` (Task 5).
- Produces:
  - `OrganizerTournamentCategory` ganha `kocPhases: KocPhaseSpec[] | null` e `kocMaxTeamsPerRound: number`.
  - `saveKocPhasePlan(tournamentId: string, categoryId: string, plan: KocPhaseSpec[], maxTeamsPerRound: number): Promise<void>` em `tournaments-repository.ts`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `frontend/projects/organizer/src/app/painel/data/koc-category-plan.spec.ts`. Ele testa o parser em `koc-phase-plan.ts` (módulo folha, sem Firebase) — não em `tournaments-repository.ts`, que arrastaria o SDK para dentro de um spec de unidade:

```ts
import { parseKocPhases } from './koc-phase-plan';

describe('plano da categoria · leitura do Firestore', () => {
  it('lê um plano bem formado', () => {
    expect(parseKocPhases([
      { bracketSizes: [5, 5], roundsPerBracket: 3, qualifiersPerRound: 1, durationSec: 900 },
    ])).toEqual([
      { bracketSizes: [5, 5], roundsPerBracket: 3, qualifiersPerRound: 1, durationSec: 900 },
    ]);
  });

  it('descarta o plano inteiro no menor sinal de sujeira', () => {
    // Plano meio lido geraria uma chave que ninguém pediu; sem plano, o
    // servidor cai nas regras antigas, que funcionam.
    expect(parseKocPhases([{ bracketSizes: 'x' }])).toBeNull();
    expect(parseKocPhases([{ bracketSizes: [4], roundsPerBracket: 0, qualifiersPerRound: 1, durationSec: 900 }])).toBeNull();
    expect(parseKocPhases([])).toBeNull();
    expect(parseKocPhases(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/koc-category-plan.spec.ts'
```

Esperado: PASS — `parseKocPhases` veio da Task 5. Estes specs travam o contrato que a categoria vai consumir; se falharem, o erro está na Task 5. O que ainda não existe é a leitura e a gravação na categoria, e é o Step 3.

- [ ] **Step 3: Implementar**

**3a.** Em `tournament.model.ts`, junto dos campos `koc*` de `OrganizerTournamentCategory`:

```ts
  /** Plano explícito de fases; nulo ⇒ o servidor deriva pelas regras antigas. */
  kocPhases: KocPhaseSpec[] | null;
  kocMaxTeamsPerRound: number;
  /** Duração padrão da bateria. A tela de gerar chave semeia a proposta com
   *  ela; hoje o campo existe no Firestore e ninguém o lia de volta. */
  kocRoundDurationSec: number;
```

Importe `KocPhaseSpec` de `./koc-phase-plan`.

**3b.** Em `tournaments-repository.ts`, importe `KocPhaseSpec`, `kocClampMaxPerRound` e `parseKocPhases` de `./koc-phase-plan` e, no `categoryFromRaw`, acrescente junto dos outros `koc*`:

```ts
    kocPhases: parseKocPhases(o['kocPhases']),
    kocMaxTeamsPerRound: kocClampMaxPerRound(numberOf(o['kocMaxTeamsPerRound'])),
    kocRoundDurationSec: numberOf(o['roundDurationSec']) ?? 900,
```

**3c.** Acrescente a gravação ao final de `tournaments-repository.ts`:

```ts
/**
 * Grava o plano de fases KOTC na categoria.
 *
 * Reescreve o array `categories` inteiro porque o Firestore não sabe atualizar
 * um elemento por id. Precisa estar no doc da categoria — e não só no payload
 * da geração — porque o SORTEIO AO VIVO lê de lá e acontece antes.
 */
export async function saveKocPhasePlan(
  tournamentId: string,
  categoryId: string,
  plan: KocPhaseSpec[],
  maxTeamsPerRound: number,
): Promise<void> {
  const db = organizerFirestore();
  const ref = doc(db, 'tournaments', tournamentId);
  const snap = await getDoc(ref);
  const raw = snap.data() ?? {};
  const categories = Array.isArray(raw['categories']) ? [...(raw['categories'] as unknown[])] : [];
  const index = categories.findIndex(
    (c) => c != null && typeof c === 'object' && String((c as Record<string, unknown>)['id'] ?? '') === categoryId,
  );
  if (index < 0) return;
  categories[index] = {
    ...(categories[index] as Record<string, unknown>),
    kocPhases: plan.map((p) => ({ ...p, bracketSizes: [...p.bracketSizes] })),
    kocMaxTeamsPerRound: maxTeamsPerRound,
  };
  await updateDoc(ref, { categories });
}
```

Acrescente `getDoc` ao import de `@angular/fire/firestore` e importe `KocPhaseSpec`/`kocClampMaxPerRound` de `./koc-phase-plan`.

- [ ] **Step 4: Rodar e confirmar que passam**

```bash
cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/koc-category-plan.spec.ts'
```

Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/data/tournament.model.ts frontend/projects/organizer/src/app/painel/data/tournaments-repository.ts frontend/projects/organizer/src/app/painel/data/koc-category-plan.spec.ts
git commit -m "$(cat <<'EOF'
feat(koc): categoria guarda o plano de fases

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Tabela editável na tela de gerar chave

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/eventos/seeds.component.ts:171-223` (template KOTC), `:585-588` (signals), `:700-770` (bumps e clamps), `:948-960` (payload da geração)

**Interfaces:**
- Consumes: `kocProposePhasePlan`, `kocApplyPhaseEdit`, `kocBracketCountOptions`, `kocPhaseFieldSizes`, `kocPlanTotals`, `kocClampMaxPerRound`, `KOC_MAX_TEAMS_PER_ROUND_HARD`, `KocPhaseSpec` (Task 5); `saveKocPhasePlan` (Task 6).
- Produces: nada consumido por tasks posteriores.

- [ ] **Step 1: Escrever o teste que falha**

O padrão do projeto é testar o **modelo puro**, não a tela (o componente não tem seam de DI). Acrescente em `frontend/projects/organizer/src/app/painel/data/koc-phase-plan.spec.ts`:

```ts
describe('plano de fases · o que a tela mostra em cada linha', () => {
  it('a coluna "Passam" é o campo da fase seguinte, e a final não passa ninguém', () => {
    const plan = kocProposePhasePlan(10, 6, 900);
    const fields = kocPhaseFieldSizes(plan);
    const passam = plan.map((p, i) =>
      i === plan.length - 1 ? null : p.bracketSizes.length * p.roundsPerBracket * p.qualifiersPerRound,
    );
    expect(passam).toEqual([6, 4, null]);
    expect(fields.slice(1)).toEqual(passam.slice(0, -1) as number[]);
  });

  it('a proposta se refaz quando a contagem de inscritas muda', () => {
    expect(kocPhaseFieldSizes(kocProposePhasePlan(10, 6, 900))).toEqual([10, 6, 4]);
    expect(kocPhaseFieldSizes(kocProposePhasePlan(12, 6, 900))).toEqual([12, 8, 4]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/koc-phase-plan.spec.ts'
```

Esperado: PASS — estes testes exercitam só a Task 5. Eles existem para travar o contrato que a tela vai consumir; se falharem, o erro está na Task 5.

- [ ] **Step 3: Implementar a tela**

Em `seeds.component.ts`:

**3a.** Troque os signals de config KOTC (linhas ~585-588) por:

```ts
  protected readonly kocMaxTeamsPerRound = signal(KOC_LEGACY_MAX_TEAMS_PER_ROUND);
  protected readonly kocRoundDurationSec = signal(KOC_DEFAULT_ROUND_DURATION_SEC);
  /** Plano em edição. Reproposto sempre que a contagem de inscritas muda. */
  protected readonly kocPhases = signal<KocPhaseSpec[]>([]);
  /** Contagem de inscritas para a qual o plano atual foi montado. Signal, não
   *  campo: é lido por um computed, e campo simples não dispara recálculo. */
  private readonly kocPlanFor = signal(0);
```

E, no construtor (junto dos outros `effect`), a reproposta automática:

```ts
    // As inscrições continuam mexendo enquanto a tela está aberta. Um plano
    // montado para 10 duplas não fecha com 12, e a geração recusaria com todo
    // mundo já na quadra — então a proposta acompanha a contagem sozinha.
    effect(() => {
      const teams = this.eligible().length;
      if (this.format() !== 'king_of_court') return;
      if (teams === this.kocPlanFor()) return;
      untracked(() => this.reproposeKocPlan());
    });
```

**3b.** Acrescente os métodos de plano, no lugar de `bumpKocTeamsPerCourt`/`bumpKocRoundsPerBracket`/`bumpKocQualifiers`/`clampKoc`/`kocPlan`:

```ts
  /** Repropõe do zero com a contagem atual. É o botão "Refazer proposta" e
   *  também o que roda sozinho quando as inscritas mudam. */
  protected reproposeKocPlan(): void {
    const teams = this.eligible().length;
    const previous = this.kocPlanFor();
    this.kocPlanFor.set(teams);
    this.kocPlanChanged.set(previous > 0 && previous !== teams);
    this.kocPhases.set(
      kocProposePhasePlan(teams, this.kocMaxTeamsPerRound(), this.kocRoundDurationSec()),
    );
  }

  /** Ligado quando a reproposta aconteceu porque a CONTAGEM mudou — não quando
   *  o organizador clicou em "Refazer proposta" nem na primeira montagem. */
  protected readonly kocPlanChanged = signal(false);

  protected bumpKocMaxPerRound(delta: number): void {
    this.kocMaxTeamsPerRound.update((v) => kocClampMaxPerRound(v + delta));
    this.reproposeKocPlan();
  }

  protected bumpKocDuration(delta: number): void {
    this.kocRoundDurationSec.update((v) => Math.min(
      KOC_MAX_ROUND_DURATION_SEC,
      Math.max(KOC_MIN_ROUND_DURATION_SEC, v + delta * 300),
    ));
    this.reproposeKocPlan();
  }

  protected kocBracketOptions(index: number): number[] {
    const phase = this.kocPhases()[index];
    if (!phase) return [];
    const field = phase.bracketSizes.reduce((a, b) => a + b, 0);
    return kocBracketCountOptions(field, this.kocMaxTeamsPerRound());
  }

  protected editKocPhase(index: number, patch: KocPhasePatch): void {
    this.kocPhases.update((plan) =>
      kocApplyPhaseEdit(plan, index, patch, this.kocMaxTeamsPerRound()),
    );
  }

  /** Quantas duplas a fase seguinte recebe. `null` na final. */
  protected kocPhasePasses(index: number): number | null {
    const plan = this.kocPhases();
    const phase = plan[index];
    if (!phase || index === plan.length - 1) return null;
    return phase.bracketSizes.length * phase.roundsPerBracket * phase.qualifiersPerRound;
  }

  protected kocPhaseTitle(index: number): string {
    const total = this.kocPhases().length;
    if (index === total - 1) return 'Final';
    if (total >= 3 && index === total - 2) return 'Semifinal';
    return 'Classificatória';
  }

  protected readonly kocTotals = computed(() =>
    kocPlanTotals(this.kocPhases(), 1),
  );

  protected kocDurationLabel(): string {
    return `${Math.round(this.kocRoundDurationSec() / 60)} min`;
  }

  protected kocPhaseDurationLabel(index: number): string {
    const phase = this.kocPhases()[index];
    return phase ? `${Math.round(phase.durationSec / 60)} min` : '—';
  }
```

**3c.** Substitua o bloco `@if (format() === 'king_of_court') { … }` do template por:

```html
            @if (format() === 'king_of_court') {
              <!-- O plano é a config: o que esta tabela mostra é o que vai em
                   bracketConfig e o que fica gravado na categoria (o sorteio ao
                   vivo lê de lá). Os três números soltos de antes viraram as
                   colunas, uma linha por fase. -->
              <div class="og-field-grid" style="margin-top:14px">
                <div class="og-seeds-stepper">
                  <span class="lbl">Máximo por bateria</span>
                  <div class="ctrl">
                    <button type="button" (click)="bumpKocMaxPerRound(-1)">−</button>
                    <span>{{ kocMaxTeamsPerRound() }}</span>
                    <button type="button" (click)="bumpKocMaxPerRound(1)">+</button>
                  </div>
                </div>
                <div class="og-seeds-stepper">
                  <span class="lbl">Duração padrão</span>
                  <div class="ctrl">
                    <button type="button" (click)="bumpKocDuration(-1)">−</button>
                    <span>{{ kocDurationLabel() }}</span>
                    <button type="button" (click)="bumpKocDuration(1)">+</button>
                  </div>
                </div>
              </div>

              @if (kocPlanChanged()) {
                <p class="og-seeds-hint">
                  As inscritas mudaram para {{ eligible().length }} — a proposta foi refeita.
                </p>
              }

              @if (kocPhases().length === 0) {
                <p class="og-seeds-error">
                  Com {{ eligible().length }} duplas não dá para montar uma rodada de
                  King of the Court.
                </p>
              } @else {
                <div class="og-koc-plan" style="margin-top:14px">
                  @for (phase of kocPhases(); track $index) {
                    <div class="og-koc-plan-row">
                      <span class="og-koc-plan-phase">{{ kocPhaseTitle($index) }}</span>

                      <label class="og-koc-plan-field">
                        <span class="lbl">Chaves</span>
                        <select
                          [value]="phase.bracketSizes.length"
                          (change)="editKocPhase($index, { bracketCount: +$any($event.target).value })">
                          @for (n of kocBracketOptions($index); track n) {
                            <option [value]="n" [selected]="n === phase.bracketSizes.length">{{ n }}</option>
                          }
                        </select>
                        <small>{{ phase.bracketSizes.join(', ') }}</small>
                      </label>

                      <div class="og-seeds-stepper">
                        <span class="lbl">Baterias</span>
                        <div class="ctrl">
                          <button type="button"
                            (click)="editKocPhase($index, { roundsPerBracket: phase.roundsPerBracket - 1 })">−</button>
                          <span>{{ phase.roundsPerBracket }}</span>
                          <button type="button"
                            (click)="editKocPhase($index, { roundsPerBracket: phase.roundsPerBracket + 1 })">+</button>
                        </div>
                      </div>

                      <div class="og-seeds-stepper">
                        <span class="lbl">Classificam</span>
                        <div class="ctrl">
                          @if (kocPhasePasses($index) === null) {
                            <span>pódio</span>
                          } @else {
                            <button type="button"
                              (click)="editKocPhase($index, { qualifiersPerRound: phase.qualifiersPerRound - 1 })">−</button>
                            <span>{{ phase.qualifiersPerRound }}</span>
                            <button type="button"
                              (click)="editKocPhase($index, { qualifiersPerRound: phase.qualifiersPerRound + 1 })">+</button>
                          }
                        </div>
                      </div>

                      <div class="og-seeds-stepper">
                        <span class="lbl">Duração</span>
                        <div class="ctrl">
                          <button type="button"
                            (click)="editKocPhase($index, { durationSec: phase.durationSec - 300 })">−</button>
                          <span>{{ kocPhaseDurationLabel($index) }}</span>
                          <button type="button"
                            (click)="editKocPhase($index, { durationSec: phase.durationSec + 300 })">+</button>
                        </div>
                      </div>

                      <span class="og-koc-plan-passes">
                        @if (kocPhasePasses($index); as passes) { Passam {{ passes }} }
                        @else { Pódio }
                      </span>
                    </div>
                  }
                </div>

                <p class="og-seeds-hint">
                  {{ kocTotals().rounds }} rodadas · {{ kocTotals().label }} em 1 quadra
                  <button type="button" class="og-koc-plan-redo" (click)="reproposeKocPlan()">
                    Refazer proposta
                  </button>
                </p>
              }
            }
```

**3d.** Acrescente ao SCSS do componente (junto das outras regras `og-seeds-*`):

```scss
    .og-koc-plan-row {
      display: grid;
      grid-template-columns: 1.2fr repeat(4, 1fr) 0.8fr;
      gap: 10px;
      align-items: end;
      padding: 10px 0;
      border-bottom: 1px solid var(--og-border, rgba(255,255,255,.08));
    }
    // Grid explícito, não flex: a tabela precisa das colunas ALINHADAS entre as
    // linhas, e flex alinha cada linha por conta própria.
    @media (max-width: 720px) {
      .og-koc-plan-row { grid-template-columns: 1fr 1fr; }
    }
    .og-koc-plan-phase { font-weight: 600; }
    .og-koc-plan-passes { font-variant-numeric: tabular-nums; opacity: .8; }
```

**3e.** No `ngOnInit`/efeito que hoje lê `cat.kocTeamsPerCourt` (linhas ~700-706), troque por:

```ts
        this.kocMaxTeamsPerRound.set(kocClampMaxPerRound(cat.kocMaxTeamsPerRound));
        this.kocRoundDurationSec.set(cat.kocRoundDurationSec || KOC_DEFAULT_ROUND_DURATION_SEC);
        // Plano salvo só vale para a contagem com que foi montado; a tela
        // sempre repropõe e o organizador reconhece o que mudou.
        this.reproposeKocPlan();
```

**3f.** No payload da geração (linhas ~948-960), troque o `bracketConfig` do KOTC por:

```ts
        ...(this.format() === 'king_of_court' ? {
          bracketConfig: {
            phases: this.kocPhases(),
            maxTeamsPerRound: this.kocMaxTeamsPerRound(),
            roundDurationSec: this.kocRoundDurationSec(),
          },
        } : {}),
```

E logo antes da chamada de `generateCategoryBracket`, grave o plano na categoria:

```ts
      if (this.format() === 'king_of_court') {
        // Grava ANTES de gerar: o sorteio ao vivo lê o plano do doc da
        // categoria, e quem sorteia depois precisa achar o mesmo formato.
        await saveKocPhasePlan(tid, cat.id, this.kocPhases(), this.kocMaxTeamsPerRound());
      }
```

**3g.** Acrescente `effect` e `untracked` ao import de `@angular/core` se ainda não estiverem lá. Ajuste os imports do topo do arquivo: remova `KOC_DEFAULT_QUALIFIERS_PER_ROUND`, `KOC_DEFAULT_TEAMS_PER_COURT`, `KOC_MAX_TEAMS_PER_ROUND`, `KOC_MIN_TEAMS_PER_ROUND as KOC_MIN_PER_COURT`, `kocMaxRoundsForField` e `kocSchedule`; acrescente de `../data/koc-phase-plan`: `KOC_LEGACY_MAX_TEAMS_PER_ROUND`, `kocApplyPhaseEdit`, `kocBracketCountOptions`, `kocClampMaxPerRound`, `kocPlanTotals`, `kocProposePhasePlan`, `type KocPhasePatch`, `type KocPhaseSpec`; e `saveKocPhasePlan` de `../data/tournaments-repository`.

- [ ] **Step 4: Verificar que compila e que a suíte do portal passa**

```bash
cd frontend && npx ng build organizer --configuration production 2>&1 | tail -20
```

Esperado: build sem erro.

```bash
cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless
```

Esperado: PASS. Specs que referenciavam os steppers removidos precisam ser atualizados para o plano — atualize-os, não os apague.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/eventos/seeds.component.ts frontend/projects/organizer/src/app/painel/data/koc-phase-plan.spec.ts
git commit -m "$(cat <<'EOF'
feat(koc): tabela de fases editável na tela de gerar chave

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Wizard e divergência da chave publicada

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/eventos/wizard/criar-torneio.component.ts:295-301`, `:1060-1090`
- Modify: `frontend/projects/organizer/src/app/painel/data/tournament-create.model.ts:75-79`, `:155-160`
- Modify: `frontend/projects/organizer/src/app/painel/data/tournament-create-mapper.ts:96-101`, `:345-350`
- Modify: `frontend/projects/organizer/src/app/painel/data/koc.ts:60-80`, `:240-255`
- Modify: `frontend/projects/organizer/src/app/painel/chaveamento/chaveamento.component.ts:595-625`

**Interfaces:**
- Consumes: `KocPhaseSpec`, `kocClampMaxPerRound`, `KOC_LEGACY_MAX_TEAMS_PER_ROUND` (Task 5); `parseKocPhases` (Task 6).
- Produces: `KocRoundState` ganha `batteryLabel: number`, `phases: KocPhaseSpec[] | null` e `maxTeamsPerRound: number`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescente em `frontend/projects/organizer/src/app/painel/data/koc.spec.ts`:

```ts
describe('KocRoundState · plano congelado na rodada', () => {
  it('lê a bateria e o plano gravados na geração', () => {
    const state = kocRoundStateFrom({
      kocState: { teamIds: ['a', 'b', 'c'] },
      kocRoundLabel: 7,
      kocBatteryLabel: 3,
      kocConfig: {
        durationSec: 900,
        teamsPerCourt: 6,
        roundsPerBracket: 4,
        qualifiersPerRound: 1,
        maxTeamsPerRound: 6,
        phases: [
          { bracketSizes: [5, 5], roundsPerBracket: 3, qualifiersPerRound: 1, durationSec: 900 },
          { bracketSizes: [6], roundsPerBracket: 4, qualifiersPerRound: 1, durationSec: 900 },
          { bracketSizes: [4], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec: 900 },
        ],
      },
    });
    expect(state.batteryLabel).toBe(3);
    expect(state.phases?.length).toBe(3);
    expect(state.maxTeamsPerRound).toBe(6);
  });

  it('rodada antiga sem plano continua legível', () => {
    const state = kocRoundStateFrom({
      kocState: { teamIds: ['a', 'b', 'c'] },
      kocConfig: { durationSec: 900, teamsPerCourt: 4, roundsPerBracket: 1, qualifiersPerRound: 2 },
    });
    expect(state.phases).toBeNull();
    expect(state.batteryLabel).toBe(1);
    expect(state.maxTeamsPerRound).toBe(5);
  });
});
```

`kocRoundStateFrom` é a função de mapeamento que `koc.ts:230` já exporta.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/koc.spec.ts'
```

Esperado: FALHA — `batteryLabel` não existe em `KocRoundState`.

- [ ] **Step 3: Implementar**

**3a.** Em `koc.ts`, acrescente a `KocRoundState`:

```ts
  /** Posição da bateria dentro da chave. Rodada antiga não tem: vale 1. */
  batteryLabel: number;
  /** Plano congelado na geração; nulo em chave publicada antes desta entrega. */
  phases: KocPhaseSpec[] | null;
  maxTeamsPerRound: number;
```

E no mapeamento, junto dos outros campos de `config`:

```ts
    batteryLabel: intOf(data['kocBatteryLabel'], 1),
    phases: parseKocPhases(config['phases']),
    maxTeamsPerRound: kocClampMaxPerRound(intOf(config['maxTeamsPerRound'], 0)),
```

Importe `KocPhaseSpec`, `kocClampMaxPerRound` e `parseKocPhases` de `./koc-phase-plan`. Do repositório, NÃO: `koc.ts` é módulo puro e puxaria o SDK do Firebase junto — além de fechar um ciclo, porque o repositório também importa do plano.

**3b.** Em `chaveamento.component.ts`, troque as três comparações de divergência (linhas ~603-620) por uma comparação de planos:

```ts
    // Chave publicada carrega o plano com que foi gerada. Comparar plano com
    // plano é o que pega "o organizador mexeu no formato depois de publicar" —
    // comparar os três números soltos deixava passar mudança de fase 2 em
    // diante, que eles nem descreviam.
    const published = round.phases;
    const configured = category.kocPhases;
    if (published && configured && !kocPlansMatch(published, configured)) {
      diffs.push(
        `plano de fases: a categoria pede ${configured.length} fase(s), ` +
          `a chave foi gerada com ${published.length}`,
      );
    } else if (!published) {
      // Chave antiga: só os três números existem, e é o que dá pra comparar.
      if (round.roundsPerBracket !== category.kocRoundsPerBracket) {
        diffs.push(
          `rodadas por chave: a categoria pede ${category.kocRoundsPerBracket}, ` +
            `a chave foi gerada com ${round.roundsPerBracket}`,
        );
      }
      if (round.teamsPerCourt !== category.kocTeamsPerCourt) {
        diffs.push(
          `duplas por quadra: a categoria pede ${category.kocTeamsPerCourt}, ` +
            `a chave foi gerada com ${round.teamsPerCourt}`,
        );
      }
      if (round.qualifiersPerRound !== category.kocQualifiersPerRound) {
        diffs.push(
          `classificadas por rodada: a categoria pede ${category.kocQualifiersPerRound}, ` +
            `a chave foi gerada com ${round.qualifiersPerRound}`,
        );
      }
    }
```

`kocPlansMatch` já veio da Task 5; importe-o de `../data/koc-phase-plan`.

**3c.** No wizard (`criar-torneio.component.ts`), substitua os três steppers KOTC (linhas 295-301) por dois:

```html
                  <og-stepper-static label="Máximo por bateria" [value]="'' + cat().kocMaxTeamsPerRound" (bump)="bumpCat('kocMaxTeamsPerRound', $event, kocMinTeams, kocMaxTeams)" />
                  <!-- Baterias e classificadas saíram daqui: quem decide é a
                       tela de gerar chave, que conhece as inscritas de verdade.
                       O wizard só conhece as VAGAS. -->
```

Acrescente `'kocMaxTeamsPerRound'` à união de campos de `bumpCat` e remova `maxRoundsPerBracket()` se ficar sem uso. Aponte `kocMaxTeams` para `KOC_MAX_TEAMS_PER_ROUND_HARD`.

Troque `kocPlanLine()` (linha ~1085) para usar o plano:

```ts
    const plan = kocProposePhasePlan(c.spots, c.kocMaxTeamsPerRound, c.kocRoundDurationSec);
    if (plan.length === 0) return null;
    const totals = kocPlanTotals(plan, 1);
    return `${totals.rounds} rodadas · ${totals.label} em 1 quadra (estimativa pelas vagas)`;
```

**3d.** Em `tournament-create.model.ts`, no `TournamentCategoryDraft`:

- acrescente `kocMaxTeamsPerRound: number;`, com default `KOC_LEGACY_MAX_TEAMS_PER_ROUND` em `emptyTournamentDraft` (linha ~157);
- **mantenha** `kocTeamsPerCourt`, `kocRoundsPerBracket` e `kocQualifiersPerRound` como estão. Eles somem da TELA, não do modelo: rascunho salvo e torneio existente ainda os trazem, e são eles que o servidor usa quando não há plano. Remover os campos quebraria a leitura de rascunho.

Em `tournament-create-mapper.ts`, grave `maxTeamsPerRound: category.kocMaxTeamsPerRound` no mapa da categoria e leia `kocMaxTeamsPerRound: num(map['maxTeamsPerRound']) ?? KOC_LEGACY_MAX_TEAMS_PER_ROUND` na volta. Faça o mesmo em `league-create.model.ts:235-237`.

- [ ] **Step 4: Rodar e confirmar que passam**

```bash
cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless && npx ng build organizer --configuration production 2>&1 | tail -10
```

Esperado: PASS na suíte e build sem erro.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel
git commit -m "$(cat <<'EOF'
feat(koc): wizard enxuto e divergência comparada por plano

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: App Flutter lê o plano

**Files:**
- Modify: `nexago_app/lib/features/organizer/domain/tournament_create/king_of_court_plan.dart`
- Modify: `nexago_app/lib/features/organizer/presentation/category_ops/organizer_category_generate_koc_page.dart:186-200`
- Modify: `nexago_app/lib/features/tournaments/domain/koc/koc_round_state.dart:247-262`
- Test: `nexago_app/test/features/organizer/king_of_court_plan_test.dart`

**Interfaces:**
- Consumes: o formato de `kocConfig.phases` gravado na Task 3.
- Produces:
  - `class KingOfCourtPhase { final List<int> bracketSizes; final int roundsPerBracket; final int qualifiersPerRound; final int durationSec; }`
  - `List<KingOfCourtPhase>? kingOfCourtPhasesFrom(dynamic raw)`
  - `KingOfCourtConfig` ganha `phases` e `maxTeamsPerRound`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescente em `nexago_app/test/features/organizer/king_of_court_plan_test.dart`:

```dart
  group('plano de fases', () {
    test('lê um plano bem formado', () {
      final phases = kingOfCourtPhasesFrom([
        {
          'bracketSizes': [5, 5],
          'roundsPerBracket': 3,
          'qualifiersPerRound': 1,
          'durationSec': 900,
        },
      ]);
      expect(phases, isNotNull);
      expect(phases!.first.bracketSizes, [5, 5]);
      expect(phases.first.roundsPerBracket, 3);
    });

    test('descarta o plano inteiro no menor sinal de sujeira', () {
      // Sem plano o servidor cai nas regras antigas, que funcionam; com plano
      // meio lido a tela mostraria um formato que não é o da chave.
      expect(kingOfCourtPhasesFrom([{'bracketSizes': 'x'}]), isNull);
      expect(kingOfCourtPhasesFrom(const []), isNull);
      expect(kingOfCourtPhasesFrom(null), isNull);
    });

    test('a categoria com plano expõe as fases e o teto', () {
      final config = kingOfCourtConfigFromCategory({
        'kocMaxTeamsPerRound': 6,
        'kocPhases': [
          {'bracketSizes': [6], 'roundsPerBracket': 4, 'qualifiersPerRound': 1, 'durationSec': 900},
        ],
      });
      expect(config.maxTeamsPerRound, 6);
      expect(config.phases?.length, 1);
    });

    test('categoria antiga vale o teto de sempre', () {
      final config = kingOfCourtConfigFromCategory({'teamsPerCourt': 4});
      expect(config.maxTeamsPerRound, 5);
      expect(config.phases, isNull);
    });
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd nexago_app && flutter test test/features/organizer/king_of_court_plan_test.dart
```

Esperado: FALHA de compilação — `kingOfCourtPhasesFrom` não existe.

- [ ] **Step 3: Implementar**

**3a.** Em `king_of_court_plan.dart`, acrescente antes de `KingOfCourtConfig`:

```dart
/// Uma fase do plano, como o servidor a congelou na rodada.
///
/// O app não PLANEJA nada: quem propõe e edita é o portal. Aqui só se lê, para
/// a tela de gerar chave não prometer um formato diferente do que vai sair.
class KingOfCourtPhase {
  const KingOfCourtPhase({
    required this.bracketSizes,
    required this.roundsPerBracket,
    required this.qualifiersPerRound,
    required this.durationSec,
  });

  final List<int> bracketSizes;
  final int roundsPerBracket;

  /// 0 só na final: ali ninguém classifica, a tabela é o pódio.
  final int qualifiersPerRound;
  final int durationSec;

  int get fieldSize => bracketSizes.fold(0, (a, b) => a + b);
  int get roundCount => bracketSizes.length * roundsPerBracket;
}

/// Lê o plano gravado no Firestore. Sujeira derruba o plano INTEIRO: sem ele o
/// app mostra o formato antigo, que é honesto; com ele meio lido, mentiria.
List<KingOfCourtPhase>? kingOfCourtPhasesFrom(dynamic raw) {
  if (raw is! List || raw.isEmpty) return null;
  final out = <KingOfCourtPhase>[];
  for (final item in raw) {
    if (item is! Map) return null;
    final sizesRaw = item['bracketSizes'];
    if (sizesRaw is! List || sizesRaw.isEmpty) return null;
    final sizes = <int>[];
    for (final n in sizesRaw) {
      if (n is! num || n < 1) return null;
      sizes.add(n.toInt());
    }
    final rounds = item['roundsPerBracket'];
    final qualifiers = item['qualifiersPerRound'];
    final duration = item['durationSec'];
    if (rounds is! num || rounds < 1) return null;
    if (qualifiers is! num || qualifiers < 0) return null;
    if (duration is! num || duration <= 0) return null;
    out.add(KingOfCourtPhase(
      bracketSizes: sizes,
      roundsPerBracket: rounds.toInt(),
      qualifiersPerRound: qualifiers.toInt(),
      durationSec: duration.toInt(),
    ));
  }
  return out;
}
```

**3b.** Em `KingOfCourtConfig`, acrescente os campos e o parse:

```dart
/// Teto de quem não escolheu — o de antes do plano de fases.
const int kocLegacyMaxTeamsPerRound = 5;
const int kocHardMaxTeamsPerRound = 6;
```

```dart
  const KingOfCourtConfig({
    this.teamsPerCourt = kocDefaultTeamsPerCourt,
    this.qualifiersPerRound = kocDefaultQualifiersPerRound,
    this.roundDurationSec = kocDefaultRoundDurationSec,
    this.maxTeamsPerRound = kocLegacyMaxTeamsPerRound,
    this.phases,
  });

  final int teamsPerCourt;
  final int qualifiersPerRound;
  final int roundDurationSec;
  final int maxTeamsPerRound;

  /// Plano explícito da categoria. Não vai no `bracketConfig`: o servidor lê o
  /// plano do doc da categoria, e mandar daqui sobrescreveria o que o portal
  /// salvou com a tabela.
  final List<KingOfCourtPhase>? phases;

  Map<String, dynamic> toBracketConfig() => {
    'teamsPerCourt': teamsPerCourt,
    'qualifiersPerRound': qualifiersPerRound,
    'roundDurationSec': roundDurationSec,
  };
```

E em `kingOfCourtConfigFromCategory`, acrescente ao construtor devolvido:

```dart
    maxTeamsPerRound: () {
      final raw = category?['kocMaxTeamsPerRound'] ?? category?['maxTeamsPerRound'];
      if (raw is! num || raw <= 0) return kocLegacyMaxTeamsPerRound;
      return raw.toInt().clamp(kocMinTeamsPerRound, kocHardMaxTeamsPerRound);
    }(),
    phases: kingOfCourtPhasesFrom(
      category?['kocPhases'] ?? category?['phases'],
    ),
```

Use a constante de mínimo que o arquivo já define (`kocMinTeamsPerRound` ou equivalente); se não existir, declare `const int kocMinTeamsPerRound = 3;` junto das outras.

**3c.** Em `organizer_category_generate_koc_page.dart`, quando a categoria tem plano, mostre-o em vez dos steppers. Substitua o bloco que monta `schedule` (linhas ~188-196) por:

```dart
          final phases = _config.phases;
          // Categoria com plano: quem manda é ele, e mexer nos steppers daqui
          // não mudaria a chave — o servidor lê o plano do doc. Mostrar em modo
          // leitura é o que impede a tela de prometer outro formato.
          final schedule = phases == null
              ? kingOfCourtSchedule(
                  teamCount: ordered.length,
                  teamsPerCourt: _config.teamsPerCourt,
                  qualifiersPerRound: _config.qualifiersPerRound,
                  roundDurationSec: _config.roundDurationSec,
                )
              : KingOfCourtSchedule(
                  roundsPerPhase: phases.map((p) => p.roundCount).toList(),
                  // As baterias de uma chave são sequenciais na mesma quadra; o
                  // paralelismo vem das chaves. Aqui a estimativa é de 1 quadra,
                  // como a tela já fazia.
                  totalDuration: Duration(
                    seconds: phases.fold(
                      0,
                      (a, p) => a + p.roundCount * (p.durationSec + 300),
                    ),
                  ),
                  courts: 1,
                );
```

`KingOfCourtSchedule` recebe só `roundsPerPhase`, `totalDuration` e `courts` (`king_of_court_plan.dart:83-88`); `totalRounds`, `totalLabel` e `isValid` são getters e não entram no construtor.

Passe `readOnly: phases != null` ao `_KocPlanCard` para que ele esconda os steppers e mostre a linha "Formato definido no portal do organizador".

**3d.** Em `koc_round_state.dart`, acrescente o campo da bateria junto de `qualifiersPerRound`:

```dart
  final int batteryLabel;
```

e no parse (`:261`):

```dart
    batteryLabel: _asInt(data['kocBatteryLabel'], 1),
```

- [ ] **Step 4: Rodar e confirmar que passam**

```bash
cd nexago_app && flutter test test/features/organizer/king_of_court_plan_test.dart
```

Esperado: PASS.

```bash
cd nexago_app && flutter analyze lib/features/organizer lib/features/tournaments 2>&1 | tail -20
```

Esperado: sem erro. Se `flutter pub get` não tiver rodado neste worktree, rode-o antes — worktree novo não herda `.dart_tool` do checkout principal.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib nexago_app/test
git commit -m "$(cat <<'EOF'
feat(koc): app lê o plano de fases e mostra o formato real

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Rótulo da bateria nas superfícies públicas

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/data/koc.ts` (`kocPhaseLabel`, `kocCardTitle`)
- Test: `frontend/projects/organizer/src/app/painel/data/koc.spec.ts`

**Interfaces:**
- Consumes: `KocRoundState.batteryLabel` (Task 8).
- Produces: `kocPhaseLabel(matchType, roundLabel, opts?: { poolId?: string; batteryLabel?: number }): string`

- [ ] **Step 1: Escrever o teste que falha**

Acrescente em `koc.spec.ts`:

```ts
describe('rótulo da rodada com baterias', () => {
  it('sem bateria continua dizendo o que sempre disse', () => {
    expect(kocPhaseLabel('koc_round', 3)).toBe('Classificatória · Rodada 3');
    expect(kocPhaseLabel('koc_final', 1)).toBe('Final');
  });

  it('com bateria, diz a CHAVE e a bateria — "Rodada 9" não responde nada na areia', () => {
    expect(kocPhaseLabel('koc_round', 9, { poolId: 'C4', batteryLabel: 3 }))
      .toBe('Classificatória · Chave 4 · Bateria 3');
  });

  it('chave de uma bateria só não vira "Bateria 1"', () => {
    expect(kocPhaseLabel('koc_round', 2, { poolId: 'C2', batteryLabel: 1 }))
      .toBe('Classificatória · Rodada 2');
  });

  it('a semifinal com baterias também numera', () => {
    expect(kocPhaseLabel('koc_semifinal', 2, { poolId: 'C1', batteryLabel: 2 }))
      .toBe('Semifinal · Bateria 2');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/koc.spec.ts'
```

Esperado: FALHA — `kocPhaseLabel` aceita só dois argumentos.

- [ ] **Step 3: Implementar**

Em `koc.ts`, substitua `kocPhaseLabel` por:

```ts
/** "Classificatória · Chave 4 · Bateria 3" / "Semifinal · Bateria 2" / "Final".
 *
 *  A bateria só entra quando existe mais de uma: numa chave de bateria única,
 *  "Bateria 1" é ruído. E quando entra, a CHAVE vem junto — sem ela, duas
 *  quadras diferentes mostrariam "Bateria 2" ao mesmo tempo. */
export function kocPhaseLabel(
  matchType: string,
  matchNumber: number,
  opts?: { poolId?: string; batteryLabel?: number },
): string {
  const t = normalizeMatchType(matchType);
  const battery = opts?.batteryLabel ?? 1;
  const bracket = (opts?.poolId ?? '').replace(/^C/i, '');
  if (t === 'koc final') return 'Final';
  const phase = t === 'koc semifinal' ? 'Semifinal' : 'Classificatória';
  if (battery > 1) {
    // Uma chave só na fase não precisa se identificar: "Semifinal · Bateria 2"
    // já é único.
    const prefix = t === 'koc semifinal' ? phase : `${phase} · Chave ${bracket}`;
    return `${prefix} · Bateria ${battery}`;
  }
  if (t === 'koc semifinal') return 'Semifinal';
  return matchNumber > 0 ? `${phase} · Rodada ${matchNumber}` : phase;
}
```

E em `kocCardTitle`, passe o que o doc já tem:

```ts
  const n = match.koc?.roundLabel || match.matchNumber;
  return kocPhaseLabel(match.matchType, n, {
    ...(match.poolId ? { poolId: match.poolId } : {}),
    ...(match.koc?.batteryLabel ? { batteryLabel: match.koc.batteryLabel } : {}),
  });
```

Acrescente `poolId?: string | null` e `batteryLabel: number` às formas aceitas pelo parâmetro de `kocCardTitle`.

- [ ] **Step 4: Rodar e confirmar que passam**

```bash
cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless && npx ng build organizer --configuration production 2>&1 | tail -10
```

Esperado: PASS e build limpo. Chamadores de `kocPhaseLabel` com dois argumentos continuam válidos (o terceiro é opcional).

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/data/koc.ts frontend/projects/organizer/src/app/painel/data/koc.spec.ts
git commit -m "$(cat <<'EOF'
feat(koc): rótulo diz chave e bateria em vez do número global

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Verificação ponta a ponta

**Files:**
- Test: `functions/src/koc-plan-wiring.test.ts` (criar)

**Interfaces:**
- Consumes: `resolveKocConfig`, `kocRoundDoc`, `kocResolvePlan`, `buildKingOfCourtRounds` (Tasks 1–3).
- Produces: nada.

- [ ] **Step 1: Escrever o teste que falha**

Crie `functions/src/koc-plan-wiring.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildKingOfCourtRounds,
  kocProposePlan,
  kocResolvePlan,
} from "./koc-bracket-builders";
import {kocRoundDoc, resolveKocConfig} from "./organizer-category-ops";

/**
 * Função pura testada sozinha não pega config que nunca chega na chamada.
 *
 * Este arquivo percorre o caminho que a callable percorre — `bracketConfig` do
 * portal → `resolveKocConfig` → `kocResolvePlan` → `buildKingOfCourtRounds` →
 * doc gravado — e é o que provaria a falha de fiação que um teste de unidade
 * deixaria passar.
 */
describe("fiação: do bracketConfig ao doc da rodada", () => {
  const teamIds = Array.from({length: 10}, (_, i) => `t${i + 1}`);

  it("o plano do portal chega inteiro na chave publicada", () => {
    // Exatamente o que `seeds.component.ts` manda.
    const bracketConfig = {
      phases: kocProposePlan(10, 6, () => 900),
      maxTeamsPerRound: 6,
      roundDurationSec: 900,
    };
    const config = resolveKocConfig(bracketConfig, {teamsPerCourt: 4, qualifiersPerRound: 2});
    const plan = kocResolvePlan(teamIds.length, config);
    const drafts = buildKingOfCourtRounds(teamIds, {...config, phases: plan});
    const docs = drafts.map((d) =>
      kocRoundDoc(d, {tournamentId: "T", categoryId: "C", config, plan}) as Record<string, any>,
    );

    assert.equal(docs.length, 11);
    // A semi existe, tem 6 duplas na bateria 1 e roda 4 baterias.
    const semi = docs.filter((d) => d.matchType === "koc_semifinal");
    assert.equal(semi.length, 4);
    assert.equal(semi[0]!.kocSize, 6);
    assert.equal(semi[0]!.kocBatteryLabel, 1);
    assert.equal(semi[3]!.kocBatteryLabel, 4);
    // A final recebe as 4 vencedoras da semi.
    const final = docs.at(-1)!;
    assert.equal(final.matchType, "koc_final");
    assert.equal(final.kocQualifiers.length, 4);
    // O plano ficou congelado em todas as rodadas.
    for (const doc of docs) {
      assert.deepEqual(doc.kocConfig.phases, plan);
      assert.equal(doc.kocConfig.maxTeamsPerRound, 6);
    }
  });

  it("sem plano no payload, o doc da categoria manda", () => {
    const config = resolveKocConfig(
      {roundDurationSec: 900},
      {phases: kocProposePlan(10, 6, () => 900), maxTeamsPerRound: 6},
    );
    const plan = kocResolvePlan(teamIds.length, config);
    assert.equal(plan.length, 3);
    assert.deepEqual(plan[1]!.bracketSizes, [6]);
  });

  it("sem plano em lugar nenhum, a chave é a de antes desta entrega", () => {
    const config = resolveKocConfig(undefined, {
      teamsPerCourt: 4, qualifiersPerRound: 2, roundDurationSec: 900,
    });
    const plan = kocResolvePlan(16, config);
    assert.deepEqual(plan.map((p) => p.bracketSizes), [[4, 4, 4, 4], [4, 4], [4]]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha (ou passa por já estar tudo no lugar)**

```bash
cd functions && npm run build && node --test lib/koc-plan-wiring.test.js
```

Esperado: PASS se as Tasks 1–3 estiverem completas. Se falhar, o erro é de **fiação** — algum campo não atravessa o caminho — e é o que esta task existe para achar. Conserte o caminho, não o teste.

- [ ] **Step 3: Rodar a suíte inteira das functions**

```bash
cd functions && npm test 2>&1 | tail -30
```

Esperado: PASS. Qualquer teste KOTC antigo que quebre aqui é quebra de retrocompat — conserte o código.

- [ ] **Step 4: Rodar a suíte do portal e o build**

```bash
cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless 2>&1 | tail -20
```

```bash
cd frontend && npx ng build organizer --configuration production 2>&1 | tail -10
```

Esperado: PASS e build limpo nos dois.

- [ ] **Step 5: Commit**

```bash
git add functions/src/koc-plan-wiring.test.ts
git commit -m "$(cat <<'EOF'
test(koc): fiação do plano, do bracketConfig ao doc da rodada

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Depois do plano

O deploy das functions **não é opcional**: `generateCategoryBracket`, `createDrawSession` e o gatilho de avanço de fase mudam de comportamento, e o portal passa a mandar `phases` no `bracketConfig`. Subir só o frontend deixa o portal propondo um formato que o servidor ignora.

```bash
cd functions && npm run deploy:changed
```

O gate de versão do app não entra aqui: a mudança do Flutter é de leitura e degrada sozinha (build antigo lê a forma velha do `kocConfig`, que continua sendo gravada).
