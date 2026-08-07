# Tabela de pontos editável no wizard de liga — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar editáveis os 6 valores da tabela de pontuação de ranking no passo Ranking do wizard criar-liga do portal web do organizador.

**Architecture:** Helpers puros novos em `league-create.model.ts` (sanitização, tabela derivada, detecção de tabela custom, resumo de revisão) + UI no passo 4 e na revisão do `criar-liga.component.ts`. Nenhuma mudança de backend ou contrato: `draft.rankingPointsByPlace === {}` continua significando "padrão nexaGO", e a serialização existente (`leagueToFirestore` → `effectiveRankingPoints`) já grava a tabela efetiva.

**Tech Stack:** Angular standalone + signals (portal do organizador), Karma/Jasmine para specs.

## Global Constraints

- Não tocar em `rankingTableId` (o dropdown do app Flutter só conhece `state_circuit`/`nexago_standalone` e quebra com valor novo).
- Não mudar `og-points-table` (segue como leitura no Regulamento) nem qualquer superfície fora do wizard web.
- Chaves da tabela: `'1' | '2' | '3' | '4' | 'quarters' | 'groups'`. Valores: inteiro em 0..999999 (mesmo clamp do app Flutter `getPointsForPlaceFromLeagueConfig`).
- Sem exigência de monotonicidade entre colocações; nenhuma validação bloqueia o "Continuar".
- Strings de UI em português; código em inglês.
- Rodar builds/testes SEMPRE a partir de `<worktree>/frontend` (worktree aninhado: a raiz compila o checkout principal em silêncio — conferir o "Output location" do build).

---

### Task 1: Helpers puros de pontuação em `league-create.model.ts`

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/data/league-create.model.ts` (após `effectiveRankingPoints`, ~linha 145)
- Test (create): `frontend/projects/organizer/src/app/painel/data/league-create.spec.ts`

**Interfaces:**
- Consumes: `LeagueCreateDraft`, `DEFAULT_LEAGUE_RANKING_POINTS`, `effectiveRankingPoints`, `COUNTING_MODE_LABEL` (já existentes e exportados).
- Produces (novos exports usados na Task 2):
  - `LEAGUE_RANKING_POINT_KEYS: readonly string[]`
  - `LEAGUE_RANKING_POINT_LABEL: Record<string, string>`
  - `sanitizeRankingPointsValue(raw: unknown): number`
  - `withRankingPoint(draft: LeagueCreateDraft, key: string, raw: unknown): Record<string, number>`
  - `isCustomRankingTable(draft: LeagueCreateDraft): boolean`
  - `reviewRankingSummary(draft: LeagueCreateDraft): string`

- [ ] **Step 1: Write the failing tests**

Criar `frontend/projects/organizer/src/app/painel/data/league-create.spec.ts`:

```ts
import {
  DEFAULT_LEAGUE_RANKING_POINTS,
  effectiveRankingPoints,
  emptyLeagueDraft,
  isCustomRankingTable,
  reviewRankingSummary,
  sanitizeRankingPointsValue,
  withRankingPoint,
} from './league-create.model';

/** Espelha o contrato lido pela CF `league-ranking.ts` (`rankingPointsByPlace`) e o clamp
 *  do app (`getPointsForPlaceFromLeagueConfig`): chaves 1–4/quarters/groups, 0..999999. */
describe('league-create · tabela de pontos do ranking', () => {
  describe('effectiveRankingPoints', () => {
    it('draft vazio usa o padrão nexaGO', () => {
      expect(effectiveRankingPoints(emptyLeagueDraft())).toEqual(DEFAULT_LEAGUE_RANKING_POINTS);
    });

    it('tabela custom do draft prevalece sobre o padrão', () => {
      const draft = { ...emptyLeagueDraft(), rankingPointsByPlace: { '1': 1000 } };
      expect(effectiveRankingPoints(draft)).toEqual({ '1': 1000 });
    });
  });

  describe('sanitizeRankingPointsValue', () => {
    it('aceita inteiro e arredonda decimal', () => {
      expect(sanitizeRankingPointsValue('120')).toBe(120);
      expect(sanitizeRankingPointsValue('120.6')).toBe(121);
    });

    it('vazio, NaN e negativo viram 0', () => {
      expect(sanitizeRankingPointsValue('')).toBe(0);
      expect(sanitizeRankingPointsValue('abc')).toBe(0);
      expect(sanitizeRankingPointsValue('-5')).toBe(0);
    });

    it('limita ao teto de 999999 (mesmo clamp do app)', () => {
      expect(sanitizeRankingPointsValue('1000000')).toBe(999999);
    });
  });

  describe('withRankingPoint', () => {
    it('primeira edição parte da tabela padrão completa', () => {
      expect(withRankingPoint(emptyLeagueDraft(), '1', '500')).toEqual({
        ...DEFAULT_LEAGUE_RANKING_POINTS,
        '1': 500,
      });
    });

    it('preserva edições anteriores do draft', () => {
      const draft = { ...emptyLeagueDraft(), rankingPointsByPlace: { ...DEFAULT_LEAGUE_RANKING_POINTS, '2': 300 } };
      expect(withRankingPoint(draft, 'groups', '55')).toEqual({
        ...DEFAULT_LEAGUE_RANKING_POINTS,
        '2': 300,
        groups: 55,
      });
    });
  });

  describe('isCustomRankingTable', () => {
    it('draft vazio não é custom', () => {
      expect(isCustomRankingTable(emptyLeagueDraft())).toBeFalse();
    });

    it('valores iguais ao padrão não são custom (mesmo depois de editar)', () => {
      const draft = { ...emptyLeagueDraft(), rankingPointsByPlace: { ...DEFAULT_LEAGUE_RANKING_POINTS } };
      expect(isCustomRankingTable(draft)).toBeFalse();
    });

    it('um valor diferente do padrão é custom', () => {
      const draft = { ...emptyLeagueDraft(), rankingPointsByPlace: withRankingPoint(emptyLeagueDraft(), 'quarters', '90') };
      expect(isCustomRankingTable(draft)).toBeTrue();
    });
  });

  describe('reviewRankingSummary', () => {
    it('padrão: modo de contagem + tabela padrão nexaGO', () => {
      expect(reviewRankingSummary(emptyLeagueDraft())).toBe('4 melhores de 6 etapas · tabela padrão nexaGO');
    });

    it('custom: modo de contagem + tabela personalizada', () => {
      const draft = {
        ...emptyLeagueDraft(),
        countingStagesMode: 'allStages' as const,
        rankingPointsByPlace: withRankingPoint(emptyLeagueDraft(), '1', '600'),
      };
      expect(reviewRankingSummary(draft)).toBe('Todas as etapas contam · tabela personalizada');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless`
Expected: FAIL — os novos exports (`sanitizeRankingPointsValue` etc.) não existem; erro de compilação do spec. (Se `--browsers=ChromeHeadless` não for aceito pela config, rodar sem a flag.)

- [ ] **Step 3: Write minimal implementation**

Em `league-create.model.ts`, logo após `effectiveRankingPoints` (~linha 145), adicionar:

```ts
/** Chaves da tabela de pontos — mesmo contrato lido pela CF `league-ranking.ts`. */
export const LEAGUE_RANKING_POINT_KEYS: readonly string[] = ['1', '2', '3', '4', 'quarters', 'groups'];

export const LEAGUE_RANKING_POINT_LABEL: Record<string, string> = {
  '1': '1º lugar',
  '2': '2º lugar',
  '3': '3º lugar',
  '4': '4º lugar',
  quarters: 'Quartas',
  groups: 'Fase de grupos',
};

/** Mesmo clamp do app (`getPointsForPlaceFromLeagueConfig`): inteiro em 0..999999. */
export function sanitizeRankingPointsValue(raw: unknown): number {
  const value = Math.round(Number(raw));
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, 999999);
}

/** Tabela completa com `key` editado — a primeira edição materializa o padrão no draft. */
export function withRankingPoint(draft: LeagueCreateDraft, key: string, raw: unknown): Record<string, number> {
  return { ...effectiveRankingPoints(draft), [key]: sanitizeRankingPointsValue(raw) };
}

export function isCustomRankingTable(draft: LeagueCreateDraft): boolean {
  const effective = effectiveRankingPoints(draft);
  return LEAGUE_RANKING_POINT_KEYS.some((key) => (effective[key] ?? 0) !== DEFAULT_LEAGUE_RANKING_POINTS[key]);
}

export function reviewRankingSummary(draft: LeagueCreateDraft): string {
  const table = isCustomRankingTable(draft) ? 'tabela personalizada' : 'tabela padrão nexaGO';
  return `${COUNTING_MODE_LABEL[draft.countingStagesMode]} · ${table}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless`
Expected: PASS (novos specs + todos os existentes, incluindo `leagues.spec.ts`).

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/data/league-create.model.ts frontend/projects/organizer/src/app/painel/data/league-create.spec.ts
git commit -m "feat(ligas): helpers de tabela de pontos personalizada no modelo do wizard"
```

---

### Task 2: UI editável no passo 4 + revisão do wizard

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/eventos/wizard/criar-liga.component.ts`
  - imports do módulo (topo do arquivo) e array `imports` do componente
  - constante `RANKING_POINTS_ROWS` (~linha 73): remover
  - template passo 4, card "Pontuação" (~linhas 333-335): substituir
  - template passo 6, linha "Ranking" (~linha 375): substituir
  - classe: propriedade `rankingPointsRows` (~linha 469): remover; adicionar membros novos

**Interfaces:**
- Consumes (da Task 1): `LEAGUE_RANKING_POINT_KEYS`, `LEAGUE_RANKING_POINT_LABEL`, `withRankingPoint(draft, key, raw)`, `isCustomRankingTable(draft)`, `reviewRankingSummary(draft)`; e os já existentes `effectiveRankingPoints(draft)`, `patch(partial)`.
- Produces: nada consumido por tasks posteriores (UI final).

- [ ] **Step 1: Substituir o card "Pontuação" do passo 4**

Trocar:

```html
                <og-card kicker="Pontuação" title="Tabela por colocação (padrão nexaGO)">
                  <og-points-table [pts]="rankingPointsRows" />
                </og-card>
```

por:

```html
                <og-card kicker="Pontuação" title="Tabela por colocação">
                  <div class="og-field-grid">
                    @for (key of pointKeys; track key) {
                      <og-form-field [label]="pointLabel[key] + ' (pts)'">
                        <input class="og-input-el" type="number" min="0" step="10" [value]="pointsOf(key)" (input)="setPoints(key, $any($event.target).value)" />
                      </og-form-field>
                    }
                  </div>
                  @if (isCustomTable()) {
                    <button type="button" class="og-ghost-btn" style="margin-top:14px" (click)="resetPoints()">Restaurar padrão nexaGO</button>
                  }
                </og-card>
```

(`og-form-field` + `og-input-el` é o mesmo padrão do campo "Preço por etapa (R$)" do builder de categoria. Conferir que `og-form-field` expõe `label` como `input()` — é usado com binding literal hoje; se só aceitar string estática, usar `label="{{ pointLabel[key] }} (pts)"`.)

- [ ] **Step 2: Atualizar a linha "Ranking" da revisão (passo 6)**

Trocar:

```html
                  <og-review-row label="Ranking" [value]="countingLabel[draft().countingStagesMode]" />
```

por:

```html
                  <og-review-row label="Ranking" [value]="reviewRanking()" />
```

- [ ] **Step 3: Atualizar a classe do componente**

Remover a constante `RANKING_POINTS_ROWS` (~linha 73), a propriedade `protected readonly rankingPointsRows = RANKING_POINTS_ROWS;` (~linha 469), o import e a entrada de `OgPointsTableComponent` no array `imports` (verificar antes que nenhum outro trecho do arquivo usa `og-points-table`), e o import de `DEFAULT_LEAGUE_RANKING_POINTS` se ficar sem uso.

Adicionar aos imports de `./../../data/league-create.model` (ajustar caminho real do import existente): `LEAGUE_RANKING_POINT_KEYS`, `LEAGUE_RANKING_POINT_LABEL`, `effectiveRankingPoints`, `isCustomRankingTable`, `reviewRankingSummary`, `withRankingPoint`.

Adicionar membros na classe (junto dos demais `protected readonly`):

```ts
  protected readonly pointKeys = LEAGUE_RANKING_POINT_KEYS;
  protected readonly pointLabel = LEAGUE_RANKING_POINT_LABEL;
  protected readonly isCustomTable = computed(() => isCustomRankingTable(this.draft()));
```

E os métodos (junto dos helpers protegidos):

```ts
  protected pointsOf(key: string): number {
    return effectiveRankingPoints(this.draft())[key] ?? 0;
  }

  protected setPoints(key: string, raw: string): void {
    this.patch({ rankingPointsByPlace: withRankingPoint(this.draft(), key, raw) });
  }

  protected resetPoints(): void {
    this.patch({ rankingPointsByPlace: {} });
  }

  protected reviewRanking(): string {
    return reviewRankingSummary(this.draft());
  }
```

- [ ] **Step 4: Build + testes**

Run: `cd frontend && npx ng build organizer && npx ng test organizer --watch=false --browsers=ChromeHeadless`
Expected: build PASS com "Output location" dentro DESTE worktree; specs PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/eventos/wizard/criar-liga.component.ts
git commit -m "feat(ligas): tabela de pontos editável no passo Ranking do wizard de liga"
```

---

### Task 3: QA visual do passo Ranking

**Files:**
- Nenhum arquivo novo — verificação no browser via dev server (`preview_start`).

**Interfaces:**
- Consumes: wizard completo das Tasks 1-2.
- Produces: screenshot de prova do passo 4 com valores editados + revisão mostrando "tabela personalizada".

- [ ] **Step 1: Subir o dev server do organizador e navegar até o wizard de liga**

Usar `preview_start` (entrada do organizer em `.claude/launch.json`; criar se não existir apontando para `npx ng serve organizer` na pasta `frontend`). Navegar até criar liga → passo 4 (Ranking). Se o login bloquear e não houver bypass de dev, reportar e considerar o QA coberto por build+specs.

- [ ] **Step 2: Verificar comportamento**

- Os 6 campos aparecem pré-preenchidos com 450/280/180/120/80/40.
- Editar "1º lugar" para 600 → botão "Restaurar padrão nexaGO" aparece.
- Clicar "Restaurar padrão nexaGO" → valores voltam e botão some.
- Editar de novo, ir até a revisão (passo 6) → linha Ranking mostra "· tabela personalizada".
- Console sem erros (`read_console_messages`).

- [ ] **Step 3: Screenshot de prova para o usuário**

`computer {action: "screenshot"}` do passo 4 editado e da revisão.
