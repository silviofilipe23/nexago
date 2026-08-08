# Gate de desafios no ranking global — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Categoria de torneio avulso só pontua no ranking global com `rankingEnabled` ligado E ≥ 10 duplas pagas; etapas de liga ficam isentas.

**Architecture:** Helper puro `isGlobalRankingEligible` + gate dentro de `tryAwardGlobalRankingForMatch` (cobre o trigger e qualquer chamador futuro). O doc do torneio já é carregado ali; a contagem reutiliza `loadPaidTeamIds`, hoisted para servir gate e bucket "groups" numa única query. Copy dos toggles nos dois wizards comunica a regra.

**Tech Stack:** Cloud Functions TS (`node --test` + FakeFirestore), Angular (portal organizador), Flutter (app).

## Global Constraints

- Rating Glicko-2, XP e ranking de liga: intocados. `league-ranking.ts` não muda.
- Docs antigos sem `rankingEnabled` contam como `true` (`!== false`).
- Etapa de liga = `tournament.leagueId` não vazio → sempre elegível.
- `MIN_TEAMS_FOR_GLOBAL_RANKING = 10`; contagem = inscrições `isPaid === true` fora da waitlist (`loadPaidTeamIds`).
- Testes das functions rodam DE DENTRO de `functions/` (npm test = tsc + node --test). `functions/node_modules` no worktree: symlink pro checkout principal (`/Users/silviodionizio/Documents/projects/volley/nexago/functions/node_modules`), receita do projeto.
- Strings de UI em português; código em inglês.

---

### Task 1: Gate na CF + testes

**Files:**
- Modify: `functions/src/tournament-ranking.ts` (~linha 43 constante; gate em `tryAwardGlobalRankingForMatch`, ~linhas 281-336)
- Modify: `functions/src/tournament-ranking.test.ts` (`seededDb` ~linha 79; novos describes)

**Interfaces:**
- Consumes: `loadPaidTeamIds`, `loadKnockoutTeamIds`, `loadCategoryBracketContext`, `resolveLeaguePlacementsFromMatch` (de `./league-ranking`, já importados); `logger` (já importado).
- Produces: `MIN_TEAMS_FOR_GLOBAL_RANKING: number` e `isGlobalRankingEligible({isLeagueStage, rankingEnabled, paidTeamsCount}): boolean` exportados.

- [ ] **Step 0: Symlink de node_modules no worktree**

```bash
ln -sfn /Users/silviodionizio/Documents/projects/volley/nexago/functions/node_modules functions/node_modules
```

- [ ] **Step 1: Atualizar `seededDb` e escrever os testes que falham**

Em `tournament-ranking.test.ts`, trocar `seededDb` por versão com inscrições pagas parametrizáveis (default 10) e a final semeada em `matches` (marca tA/tB como mata-mata — o bucket "groups" não pode engolir o pódio):

```ts
function seededDb(opts: {paidTeams?: number} = {}): FakeFirestore {
  const paidTeams = opts.paidTeams ?? 10;
  const db = new FakeFirestore();
  db.seedDoc("tournaments/T1", {sport: "beachVolleyball"});
  db.seedDoc(`artifacts/${PROJECT}/public/data/teams/tA`, {player1Id: "a1", player2Id: "a2"});
  db.seedDoc(`artifacts/${PROJECT}/public/data/teams/tB`, {player1Id: "b1", player2Id: "b2"});
  // A final em `matches` marca tA/tB como times de mata-mata; as inscrições
  // pagas dão o tamanho da categoria pro gate de elegibilidade.
  db.seedDoc(`artifacts/${PROJECT}/public/data/matches/m-final`, finalMatch());
  const teamIds = ["tA", "tB"];
  for (let i = 1; i <= Math.max(0, paidTeams - 2); i++) teamIds.push(`tG${i}`);
  teamIds.slice(0, paidTeams).forEach((teamId, index) => {
    db.seedDoc(`artifacts/${PROJECT}/public/data/inscriptions/i${index}`, {
      tournamentId: "T1",
      categoryId: "C1",
      teamId,
      isPaid: true,
    });
  });
  return db;
}
```

(`finalMatch` é declarado com hoisting de function declaration — usá-lo dentro de `seededDb` é seguro. Os 4 testes de fluxo existentes continuam válidos: as asserções olham docs específicos e os fillers tG* só ganham bucket "groups", idempotente no re-run.)

Adicionar ao import de `./tournament-ranking`: `isGlobalRankingEligible`. Novos describes no fim do arquivo:

```ts
describe("isGlobalRankingEligible", () => {
  it("etapa de liga é sempre elegível, mesmo pequena e com toggle off", () => {
    assert.equal(
      isGlobalRankingEligible({isLeagueStage: true, rankingEnabled: false, paidTeamsCount: 2}),
      true,
    );
  });

  it("toggle desligado bloqueia mesmo categoria cheia", () => {
    assert.equal(
      isGlobalRankingEligible({isLeagueStage: false, rankingEnabled: false, paidTeamsCount: 16}),
      false,
    );
  });

  it("menos de 10 duplas pagas é desafio: bloqueia", () => {
    assert.equal(
      isGlobalRankingEligible({isLeagueStage: false, rankingEnabled: true, paidTeamsCount: 9}),
      false,
    );
  });

  it("10+ pagas com toggle ligado pontua", () => {
    assert.equal(
      isGlobalRankingEligible({isLeagueStage: false, rankingEnabled: true, paidTeamsCount: 10}),
      true,
    );
  });
});

describe("gate de desafios no fluxo de premiação", () => {
  it("categoria com 9 duplas pagas não escreve nada (desafio)", async () => {
    const db = seededDb({paidTeams: 9});
    const result = await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());
    assert.equal(result.awarded, false);
    assert.equal(db.store.get(`${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`), undefined);
    assert.equal(db.store.get(`${teamRankingsPath(PROJECT)}/tA`), undefined);
  });

  it("rankingEnabled: false não pontua mesmo com 10 pagas", async () => {
    const db = seededDb();
    db.seedDoc("tournaments/T1", {sport: "beachVolleyball", rankingEnabled: false});
    const result = await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());
    assert.equal(result.awarded, false);
    assert.equal(db.store.get(`${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`), undefined);
  });

  it("etapa de liga pontua mesmo com 2 duplas", async () => {
    const db = seededDb({paidTeams: 2});
    db.seedDoc("tournaments/T1", {sport: "beachVolleyball", leagueId: "L1"});
    const result = await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());
    assert.equal(result.awarded, true);
    const champion = db.store.get(`${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`)!;
    assert.equal(champion.finalPlace, 1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm test 2>&1 | tail -20`
Expected: FAIL — `isGlobalRankingEligible` não é exportado (erro de compilação do tsc).

- [ ] **Step 3: Implementar o gate**

Em `tournament-ranking.ts`, após `BEST_N_RESULTS_PER_YEAR` (~linha 43):

```ts
/** Menos de 10 duplas pagas = desafio: não pontua no ranking global. */
export const MIN_TEAMS_FOR_GLOBAL_RANKING = 10;

/** Etapa de liga é isenta; torneio avulso exige toggle ligado e categoria cheia. */
export function isGlobalRankingEligible(params: {
  isLeagueStage: boolean;
  rankingEnabled: boolean;
  paidTeamsCount: number;
}): boolean {
  if (params.isLeagueStage) return true;
  return (
    params.rankingEnabled &&
    params.paidTeamsCount >= MIN_TEAMS_FOR_GLOBAL_RANKING
  );
}
```

Em `tryAwardGlobalRankingForMatch`, substituir do carregamento do torneio até o fim da função:

```ts
  const tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!tournamentSnap.exists) return {awarded: false, teamsUpdated: 0};
  const tournament = tournamentSnap.data() ?? {};
  const rankingWeight = Number(tournament.rankingWeight ?? 1);
  const isLeagueStage = String(tournament.leagueId ?? "").trim().length > 0;
  const rankingEnabled = tournament.rankingEnabled !== false;

  const completedAt = parseMatchPlayedAt(match);
  const year = completedAt.getFullYear();

  const bracketContext = await loadCategoryBracketContext(
    db,
    projectId,
    tournamentId,
    categoryId,
  );
  const placements = resolveLeaguePlacementsFromMatch(match, bracketContext);
  const shouldAwardGroupsBucket = isNonGroupCompletedMatch(match);
  if (placements.length === 0 && !shouldAwardGroupsBucket) {
    return {awarded: false, teamsUpdated: 0};
  }

  // Gate de desafio: avaliado a cada premiação, com a mesma contagem de pagas
  // que o bucket "groups" usa (query única, reaproveitada abaixo).
  const paidTeamIds = await loadPaidTeamIds(
    db,
    projectId,
    tournamentId,
    categoryId,
  );
  if (
    !isGlobalRankingEligible({
      isLeagueStage,
      rankingEnabled,
      paidTeamsCount: paidTeamIds.size,
    })
  ) {
    logger.info(
      `globalRanking: ${tournamentId}/${categoryId} inelegível ` +
        `(liga=${isLeagueStage}, rankingEnabled=${rankingEnabled}, pagas=${paidTeamIds.size})`,
    );
    return {awarded: false, teamsUpdated: 0};
  }

  const baseParams = {tournamentId, categoryId, rankingWeight, year, completedAt};
  let teamsUpdated = 0;
  for (const award of placements) {
    if (await awardGlobalPlacement(db, projectId, {...baseParams, award})) {
      teamsUpdated++;
    }
  }

  // Times pagos que não chegaram ao mata-mata pontuam pela fase de grupos
  // (mesma regra da liga: só a partir da 1ª partida de mata-mata concluída).
  if (shouldAwardGroupsBucket) {
    const knockoutTeamIds = await loadKnockoutTeamIds(
      db,
      projectId,
      tournamentId,
      categoryId,
    );
    for (const teamId of paidTeamIds) {
      if (knockoutTeamIds.has(teamId)) continue;
      const awarded = await awardGlobalPlacement(db, projectId, {
        ...baseParams,
        award: {teamId, bucket: "groups"},
      });
      if (awarded) teamsUpdated++;
    }
  }

  return {awarded: teamsUpdated > 0, teamsUpdated};
```

(O `Promise.all` original de `loadPaidTeamIds`+`loadKnockoutTeamIds` sai: a carga de pagas foi hoisted pro gate.)

- [ ] **Step 4: Rodar e ver passar**

Run: `cd functions && npm test 2>&1 | tail -8`
Expected: PASS em todos (novos + os 4 fluxos existentes + suites vizinhas).

- [ ] **Step 5: Commit**

```bash
git add functions/src/tournament-ranking.ts functions/src/tournament-ranking.test.ts
git commit -m "feat(ranking): desafios (<10 duplas pagas) e rankingEnabled=false não pontuam no ranking global"
```

---

### Task 2: Copy dos toggles nos wizards

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/eventos/wizard/criar-torneio.component.ts:489`
- Modify: `nexago_app/lib/features/organizer/presentation/tournament_create/steps/tournament_create_rules_page.dart` (~linha 196, subtítulo do toggle)

**Interfaces:**
- Consumes: nada das tasks anteriores (copy pura).
- Produces: nada.

- [ ] **Step 1: Web — descrição do toggle**

Trocar em `criar-torneio.component.ts`:

```html
<og-toggle-row title="Vale pontos no ranking" desc="Resultados contam para o ranking oficial da categoria." [on]="draft().rankingEnabled" (toggled)="patch({ rankingEnabled: $event })" />
```

por:

```html
<og-toggle-row title="Vale pontos no ranking" desc="Resultados contam para o ranking oficial. Categorias com menos de 10 duplas pagas não pontuam (desafio)." [on]="draft().rankingEnabled" (toggled)="patch({ rankingEnabled: $event })" />
```

- [ ] **Step 2: App — subtítulo do mesmo toggle**

Em `tournament_create_rules_page.dart`, localizar o toggle `rankingEnabled` (~linha 196) e trocar o subtítulo existente pela mesma frase: `'Resultados contam para o ranking oficial. Categorias com menos de 10 duplas pagas não pontuam (desafio).'` (ler o widget antes para manter o parâmetro certo — `subtitle`/`description` conforme o componente local).

- [ ] **Step 3: Verificar**

Run: `cd frontend && npx ng build organizer 2>&1 | tail -3` (Output location DESTE worktree)
Run: `cd nexago_app && dart analyze lib/features/organizer/presentation/tournament_create/steps/tournament_create_rules_page.dart 2>&1 | tail -3`
Expected: build PASS; analyze sem erros novos no arquivo.

- [ ] **Step 4: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/eventos/wizard/criar-torneio.component.ts nexago_app/lib/features/organizer/presentation/tournament_create/steps/tournament_create_rules_page.dart
git commit -m "feat(torneios): toggles de ranking citam a regra de desafio (<10 duplas pagas)"
```
