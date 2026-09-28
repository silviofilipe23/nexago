# Remoção de equipe machucada no KOTC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o organizador remover, em qualquer momento, uma equipe machucada de uma rodada King of the Court (KOTC), sem perder os pontos/coroas que ela já tinha conquistado e sem essa equipe voltar a ser convocada em nenhuma fase futura.

**Architecture:** O motor do KOTC (`koc-engine.ts`) já é 100% replay-determinístico — todo estado é sempre recalculado do log de rallies (`kocReplay`), nunca ajustado no lugar. A remoção entra nesse mesmo log como um QUARTO desfecho de rally (`"team_removed"`), no mesmo espírito da bola de ouro (`"golden_point"`), que já é um evento não-jogado no log. Uma nova callable `kocRemoveTeam` anexa esse evento e persiste o estado recalculado. Para fases futuras, a marca "removida" viaja dentro do `kocStandings` já persistido por rodada concluída (campo novo `removed`), e `resolveKocRoster` (avanço de fase) passa a pular equipes removidas promovendo a próxima ativa — sem precisar de nenhuma lista separada em categoria/torneio.

**Tech Stack:** Firebase Cloud Functions (TypeScript, `firebase-functions/v2/https`, Firestore), Angular standalone components + signals (painel do organizador).

**Spec:** [docs/superpowers/specs/2026-09-27-koc-remocao-equipe-lesionada-design.md](../specs/2026-09-27-koc-remocao-equipe-lesionada-design.md)

## Global Constraints

- Motivo da remoção é obrigatório: 10–500 caracteres (mesmo padrão de `parseRemovalDescription`, `functions/src/organizer-removal-description.ts`).
- Pontos e coroas da equipe removida NUNCA são zerados ou apagados — ficam congelados em `kocState.points`/`kocState.crowns` e no `kocStandings` persistido.
- A remoção não pode deixar a rodada com menos de 2 duplas ativas.
- Toda escrita de mutação de rodada passa por Cloud Function — nunca escrita direta do cliente no Firestore.
- Textos de UI em português; identificadores de código em inglês (convenção do projeto).

---

### Task 1: Motor — desfecho `team_removed`

**Files:**
- Modify: `functions/src/koc-engine.ts`
- Test: `functions/src/koc-engine.test.ts`

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces: `KocRallyOutcome` inclui `"team_removed"`; `KocState.removedTeamIds: string[]`; `KocStanding.removed: boolean`; `KOC_MIN_ACTIVE_TEAMS = 2` (exportado). Tarefas 2 e 3 anexam `{seq, winner: "team_removed", teamId}` ao log e leem `state.removedTeamIds` / `standing.removed`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `functions/src/koc-engine.test.ts` (usa `ROSTER = ["A", "B", "C", "D"]` e o helper `log()` já existentes no topo do arquivo):

```ts
describe("kocApplyRally · remoção por lesão", () => {
  it("tira a desafiante da fila e promove a próxima", () => {
    // A=rei, B=desafia, fila=[C,D]. B se machuca.
    const state = kocReplay(ROSTER, [
      {seq: 1, winner: "team_removed", teamId: "B"},
    ]);
    assert.equal(state.kingTeamId, "A");
    assert.equal(state.challengerTeamId, "C");
    assert.deepEqual(state.queue, ["D"]);
    assert.equal(state.servingTeamId, "C");
    assert.deepEqual(state.removedTeamIds, ["B"]);
  });

  it("quando o rei se machuca, a desafiante assume o trono sem crédito de coroa extra", () => {
    // A=rei, B=desafia, fila=[C,D]. A se machuca.
    const state = kocReplay(ROSTER, [
      {seq: 1, winner: "team_removed", teamId: "A"},
    ]);
    assert.equal(state.kingTeamId, "B");
    assert.equal(state.challengerTeamId, "C");
    assert.deepEqual(state.queue, ["D"]);
    // B assumiu por lesão do rei, não por vencer um rally — sem crown extra.
    assert.deepEqual(state.crowns, {A: 1, B: 0, C: 0, D: 0});
  });

  it("congela pontos e coroas já conquistados pela equipe removida", () => {
    const state = kocReplay(ROSTER, [
      ...log(["king", "king"]), // A marca 2
      {seq: 3, winner: "team_removed", teamId: "A"},
    ]);
    assert.equal(state.points.A, 2);
    assert.equal(state.crowns.A, 1);
  });

  it("remover alguém só da fila não muda trono nem desafiante", () => {
    const state = kocReplay(ROSTER, [
      {seq: 1, winner: "team_removed", teamId: "D"},
    ]);
    assert.equal(state.kingTeamId, "A");
    assert.equal(state.challengerTeamId, "B");
    assert.deepEqual(state.queue, ["C"]);
    assert.deepEqual(state.removedTeamIds, ["D"]);
  });

  it("recusa remover quando sobrariam menos de 2 duplas ativas", () => {
    const trio = ["A", "B", "C"];
    assert.throws(
      () =>
        kocReplay(trio, [
          {seq: 1, winner: "team_removed", teamId: "A"},
          {seq: 2, winner: "team_removed", teamId: "B"},
        ]),
      (e: unknown) => e instanceof KocEngineError && e.reason === "koc_round_too_small_after_removal",
    );
  });

  it("recusa remover a mesma equipe duas vezes", () => {
    assert.throws(
      () =>
        kocReplay(ROSTER, [
          {seq: 1, winner: "team_removed", teamId: "D"},
          {seq: 2, winner: "team_removed", teamId: "D"},
        ]),
      (e: unknown) => e instanceof KocEngineError && e.reason === "koc_team_already_removed",
    );
  });
});

describe("kocQualifyingTies · equipe removida", () => {
  it("não convoca equipe removida para a bola de ouro", () => {
    // Depois de 1 rally "king": A=rei(1pt), C=desafia, fila=[D,B]. B (só na
    // fila, 0pts) se machuca — sem tocar em quem está jogando.
    const state = kocReplay(ROSTER, [
      ...log(["king"]),
      {seq: 2, winner: "team_removed", teamId: "B"},
    ]);
    // A abre com 1pt (não entra no corte). B, C e D empatam em 0 — mas B está
    // removida, então só C e D brigam pela 2ª vaga.
    const standings = kocStandings(ROSTER, state);
    const ties = kocQualifyingTies(standings, 2);
    assert.deepEqual(ties, [["C", "D"]]);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd functions && npm run build && node --test lib/koc-engine.test.js`
Expected: FAIL — `KocRallyOutcome`/`kocApplyRally` não reconhecem `"team_removed"`, `removedTeamIds` não existe.

- [ ] **Step 3: Implementar**

Em `functions/src/koc-engine.ts`:

1. No topo, junto de `KOC_MIN_ROSTER`, adicionar:

```ts
/** Depois de remover uma dupla, a rodada precisa de pelo menos rei + desafiante
 *  para continuar — sem isso não há como girar a fila. */
export const KOC_MIN_ACTIVE_TEAMS = 2;
```

2. Atualizar `KocRallyOutcome`:

```ts
export type KocRallyOutcome =
  | "king"
  | "challenger"
  | "serve_fault"
  | "golden_point"
  | "team_removed";
```

3. Atualizar o comentário de `KocRally.teamId` (ele já é usado por `golden_point`; agora também por `team_removed`):

```ts
  /** Em `golden_point`, a dupla que venceu a bola de ouro. Em `team_removed`, a
   *  dupla que saiu da rodada (lesão). Os outros desfechos são do LADO
   *  (rei/desafiante), que o replay já conhece. */
  teamId?: string;
```

4. Adicionar `removedTeamIds` ao `KocState`:

```ts
export interface KocState {
  kingTeamId: string;
  challengerTeamId: string;
  queue: string[];
  points: Record<string, number>;
  crowns: Record<string, number>;
  rallies: number;
  crownOrder: string[];
  servingTeamId: string;
  /** Duplas fora da rodada por remoção (lesão). Ficam de fora da fila para
   *  sempre, mas `points`/`crowns` continuam intactos para o ranking final. */
  removedTeamIds: string[];
}
```

5. Em `kocInitialState`, incluir `removedTeamIds: []` no objeto retornado.

6. Em `kocApplyRally`, adicionar o branch de `team_removed` — logo depois do bloco de `golden_point` (antes do `let nextKing: string;`):

```ts
  if (outcome === "team_removed") {
    const removed = (rally.teamId ?? "").trim();
    if (!removed || !(removed in points)) {
      throw new KocEngineError(
        "Remoção precisa apontar uma dupla do elenco desta rodada.",
        "koc_removed_team_not_in_roster",
      );
    }
    if (state.removedTeamIds.includes(removed)) {
      throw new KocEngineError(
        "Esta dupla já foi removida da rodada.",
        "koc_team_already_removed",
      );
    }
    const rosterSize = Object.keys(points).length;
    const activeAfter = rosterSize - state.removedTeamIds.length - 1;
    if (activeAfter < KOC_MIN_ACTIVE_TEAMS) {
      throw new KocEngineError(
        "Não é possível remover: restariam menos de 2 duplas na rodada. " +
          "Encerre a rodada em vez de remover.",
        "koc_round_too_small_after_removal",
      );
    }

    const removedTeamIds = [...state.removedTeamIds, removed];
    const nextQueueAfterRemoval = queue.filter((id) => id !== removed);
    let kingAfterRemoval = kingTeamId;
    let challengerAfterRemoval = challengerTeamId;

    if (removed === challengerTeamId) {
      // Só a desafiante sai — o próximo da fila assume o desafio.
      challengerAfterRemoval = nextQueueAfterRemoval.shift() ?? "";
    } else if (removed === kingTeamId) {
      // O trono fica vago por lesão, não por derrota: a desafiante assume sem
      // crédito de coroa (não venceu rally nenhum), e a fila empurra a vaga
      // de desafiante normalmente.
      kingAfterRemoval = challengerTeamId;
      crownOrder.push(challengerTeamId);
      challengerAfterRemoval = nextQueueAfterRemoval.shift() ?? "";
    }

    return {
      ...state,
      kingTeamId: kingAfterRemoval,
      challengerTeamId: challengerAfterRemoval,
      queue: nextQueueAfterRemoval,
      crownOrder,
      servingTeamId: challengerAfterRemoval,
      removedTeamIds,
    };
  }
```

7. Em `kocStandings`, incluir `removed` em cada entrada retornada:

```ts
  return sorted.map((teamId, index) => ({
    teamId,
    place: index + 1,
    points: pointsOf(teamId),
    crowns: state.crowns[teamId] ?? 0,
    tiedOnPointsWith: (byPoints.get(pointsOf(teamId)) ?? []).filter(
      (id) => id !== teamId,
    ),
    removed: state.removedTeamIds.includes(teamId),
  }));
```

E adicionar `removed: boolean;` à interface `KocStanding`.

8. Em `kocQualifyingTies`, excluir removidas do grupo de empate (uma dupla machucada não pode ser convocada para jogar bola de ouro):

```ts
  const tied = standings
    .filter((s) => s.points === lastIn.points && !s.removed)
    .map((s) => s.teamId);
  return tied.length > 1 ? [tied] : [];
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd functions && npm run build && node --test lib/koc-engine.test.js`
Expected: PASS (todos os testes do arquivo, incluindo os novos).

- [ ] **Step 5: Commit**

```bash
git add functions/src/koc-engine.ts functions/src/koc-engine.test.ts
git commit -m "$(cat <<'EOF'
feat(koc): remoção de equipe por lesão como evento do log de rallies

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Callable `kocRemoveTeam`

**Files:**
- Modify: `functions/src/koc-match-ops.ts`
- Modify: `functions/src/index.ts`
- Test: `functions/src/koc-match-ops.test.ts`

**Interfaces:**
- Consumes: de Task 1 — `KocEngineError`, `kocReplay`, tipo `KocRally`/`KocState`, `KocRallyOutcome` incluindo `"team_removed"`.
- Produces: `kocRemoveTeamCore(db, uid, input): Promise<{ok: true; kingTeamId: string; challengerTeamId: string}>`; callable `kocRemoveTeam`. Task 6 (UI) chama via wrapper de Task 5.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar a `functions/src/koc-match-ops.test.ts` (reaproveita `db`, `seedRound`, `round`, `state`, `mockAuthUser`, `assertHttpsError`, `play`, `OWNER`, `ROSTER`, `T0` já definidos no arquivo):

```ts
describe("kocRemoveTeamCore", () => {
  it("promove a próxima da fila quando a desafiante é removida no meio da rodada", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    // Depois de 1 rally "king": A=rei(1pt), C=desafia (B foi pro fim da fila),
    // fila=[D,B]. É a DESAFIANTE ATUAL (C) que se machuca aqui — não B.
    await play(fake, ["king"]);

    const result = await kocRemoveTeamCore(db(fake), OWNER, {
      matchId: "r1",
      teamId: "C",
      description: "Torceu o tornozelo no 2º rally.",
    });

    assert.equal(result.kingTeamId, "A");
    assert.equal(result.challengerTeamId, "D");
    assert.deepEqual(state(fake).queue, ["B"]);
    assert.deepEqual(state(fake).removedTeamIds, ["C"]);
    assert.equal((state(fake).points as DocData).A, 1);
  });

  it("recusa sem motivo (mínimo 10 caracteres)", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await play(fake, ["king"]);

    await assert.rejects(
      kocRemoveTeamCore(db(fake), OWNER, {matchId: "r1", teamId: "B", description: "curto"}),
      (err: {code?: string}) => {
        assert.equal(err.code, "invalid-argument");
        return true;
      },
    );
  });

  it("recusa equipe que não está no elenco desta rodada", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await play(fake, ["king"]);

    await assert.rejects(
      kocRemoveTeamCore(db(fake), OWNER, {
        matchId: "r1",
        teamId: "Z",
        description: "Não faz parte do elenco.",
      }),
      (err: {code?: string}) => {
        assert.equal(err.code, "invalid-argument");
        return true;
      },
    );
  });

  it("recusa remover de rodada já encerrada", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await play(fake, CLEAN_ROUND);
    await kocFinishRoundCore(db(fake), OWNER, {matchId: "r1"});

    await assertHttpsError(
      kocRemoveTeamCore(db(fake), OWNER, {
        matchId: "r1",
        teamId: "B",
        description: "Rodada já acabou, tentativa tardia.",
      }),
      "failed-precondition",
      "koc_round_completed",
    );
  });

  it("funciona numa rodada ainda não iniciada (sem relógio)", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);

    const result = await kocRemoveTeamCore(db(fake), OWNER, {
      matchId: "r1",
      teamId: "B",
      description: "Machucou no aquecimento, antes do apito.",
    });

    assert.equal(result.kingTeamId, "A");
    assert.equal(result.challengerTeamId, "C");
  });

  it("grava auditoria em tournamentKocTeamRemovals", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await play(fake, ["king"]);

    await kocRemoveTeamCore(db(fake), OWNER, {
      matchId: "r1",
      teamId: "B",
      description: "Torceu o tornozelo no 2º rally.",
    });

    const audits = [...fake.store.entries()].filter(([path]) =>
      path.startsWith("tournamentKocTeamRemovals/"),
    );
    assert.equal(audits.length, 1);
    const [, audit] = audits[0]!;
    assert.equal(audit.teamId, "B");
    assert.equal(audit.tournamentId, "t1");
    assert.equal(audit.categoryId, "cat-1");
    assert.equal(audit.removedBy, OWNER);
    assert.equal(audit.description, "Torceu o tornozelo no 2º rally.");
  });

  it("desfazer com kocUndoRallyCore devolve a equipe removida à fila", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    // A=rei(1pt), C=desafia, fila=[D,B]. B (só na fila) se machuca.
    await play(fake, ["king"]);
    await kocRemoveTeamCore(db(fake), OWNER, {
      matchId: "r1",
      teamId: "B",
      description: "Torceu o tornozelo no 2º rally.",
    });
    assert.deepEqual(state(fake).queue, ["D"]);

    await kocUndoRallyCore(db(fake), OWNER, {matchId: "r1"});

    assert.equal(state(fake).challengerTeamId, "C");
    assert.deepEqual(state(fake).queue, ["D", "B"]);
    assert.deepEqual(state(fake).removedTeamIds, []);
  });
});
```

(Confirmado em `fake-firestore.test-helper.ts:61`: `store = new Map<string, DocData>()` — a leitura acima funciona direto, sem ajuste.)

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd functions && npm run build && node --test lib/koc-match-ops.test.js`
Expected: FAIL — `kocRemoveTeamCore` não existe.

- [ ] **Step 3: Implementar**

Em `functions/src/koc-match-ops.ts`:

1. Adicionar `"team_removed"` ao `isKocRallyOutcome` (senão o próximo `parseStoredRallies` descarta a entrada gravada e o replay perde a remoção):

```ts
function isKocRallyOutcome(value: string): value is KocRallyOutcome {
  return value === "king" || value === "challenger" ||
    value === "serve_fault" || value === "golden_point" ||
    value === "team_removed";
}
```

2. Importar `parseRemovalDescription`:

```ts
import {parseRemovalDescription} from "./organizer-removal-description";
```

3. Adicionar a função (perto de `kocUndoRallyCore`, antes da seção de relógio):

```ts
/**
 * Remove uma dupla machucada da rodada, a qualquer momento — mesmo com ela no
 * trono ou desafiando. Vira um evento NO LOG (`team_removed`), não um ajuste
 * avulso: como toda mutação do KOTC é reproduzida do log
 * (`docstring` no topo do arquivo), um patch fora dele seria apagado no
 * próximo rally ou undo.
 *
 * Funciona mesmo antes do apito (sem `kocClock`): uma lesão no aquecimento não
 * deveria esperar o cronômetro começar para ser registrada.
 */
export async function kocRemoveTeamCore(
  db: Firestore,
  uid: string,
  input: Record<string, unknown>,
): Promise<{ok: true; kingTeamId: string; challengerTeamId: string}> {
  const round = await loadRoundOrThrow(db, uid, asString(input.matchId));
  requireInProgress(round);

  const teamId = asString(input.teamId);
  if (!teamId || !round.teamIds.includes(teamId)) {
    throw new HttpsError(
      "invalid-argument",
      "teamId precisa ser uma dupla do elenco desta rodada.",
    );
  }

  const description = parseRemovalDescription(input.description);
  if (!description.ok) {
    throw new HttpsError("invalid-argument", description.message);
  }

  const nextSeq = round.rallies.length + 1;
  const rallies: KocRally[] = [
    ...round.rallies,
    {seq: nextSeq, winner: "team_removed", teamId},
  ];
  let state: KocState;
  try {
    state = kocReplay(round.teamIds, rallies);
  } catch (e) {
    engineErrorToHttps(e);
  }

  await round.ref.update({
    kocState: {
      kingTeamId: state.kingTeamId,
      challengerTeamId: state.challengerTeamId,
      queue: state.queue,
      points: state.points,
      crowns: state.crowns,
      rallies: state.rallies,
      crownOrder: state.crownOrder,
      servingTeamId: state.servingTeamId,
      removedTeamIds: state.removedTeamIds,
    },
    kocRallies: serializeKocRallies(rallies, round.data.kocRallies, nextSeq),
    kocRallySeq: rallies.length,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Coleção nova, não `tournamentRegistrationCancellations`: ali a inscrição é
  // DELETADA. Aqui a equipe continua inscrita, só sai da rotação da rodada.
  await db.collection("tournamentKocTeamRemovals").doc().set({
    tournamentId: asString(round.data.tournamentId),
    categoryId: asString(round.data.categoryId),
    matchId: round.ref.id,
    teamId,
    description: description.value,
    removedBy: uid,
    removedAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    kingTeamId: state.kingTeamId,
    challengerTeamId: state.challengerTeamId,
  };
}
```

4. Exportar a callable (junto das outras, depois de `kocFinishRound`):

```ts
export const kocRemoveTeam = onCall(
  {region: CLIENT_FACING_REGIONS},
  async (request) =>
    kocRemoveTeamCore(
      getFirestore(),
      requireUid(request.auth?.uid),
      request.data ?? {},
    ),
);
```

Em `functions/src/index.ts`:

5. No bloco de import de `"./koc-match-ops"` (perto da linha 122), adicionar `kocRemoveTeam` depois de `kocFinishRound`.
6. No bloco de export (perto da linha 292), adicionar `kocRemoveTeam` depois de `kocFinishRound`.

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd functions && npm run build && node --test lib/koc-match-ops.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/koc-match-ops.ts functions/src/koc-match-ops.test.ts functions/src/index.ts
git commit -m "$(cat <<'EOF'
feat(koc): callable kocRemoveTeam pra remover equipe machucada da rodada

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Fases futuras nunca convocam equipe removida

**Files:**
- Modify: `functions/src/koc-match-ops.ts` (`kocFinishRoundCore`)
- Modify: `functions/src/koc-phase-advance.ts`
- Test: `functions/src/koc-match-ops.test.ts`
- Test: `functions/src/koc-phase-advance.test.ts`

**Interfaces:**
- Consumes: de Task 1, `KocStanding.removed` (vem de `kocStandings()`).
- Produces: `kocStandings` persistido no doc da rodada ganha `removed?: true` por entrada; `KocStandingDoc.removed?: boolean`; `resolveKocRoster` promove equipe ativa no lugar de uma removida. Nenhuma tarefa futura consome isso diretamente — é o mecanismo de exclusão em si.

- [ ] **Step 1: Escrever os testes que falham**

Em `functions/src/koc-match-ops.test.ts`, adicionar dentro (ou perto) do describe de `kocFinishRoundCore` já existente:

```ts
it("grava removed:true na equipe machucada, sem tirar do ranking final", async () => {
  const fake = new FakeFirestore();
  seedRound(fake);
  // CLEAN_ROUND dá corte limpo pro qualifiersPerRound=2 (A=2º com 2pts, D=1º
  // com 1pt avançam; B e C ficam empatadas em 0, mas ABAIXO do corte — por
  // isso remover B depois não cria empate na vaga, e o encerramento não
  // precisa de acceptTiebreak).
  await play(fake, CLEAN_ROUND); // A=2, D=1 (rei), B=0, C=0 — B na fila, não jogando
  await kocRemoveTeamCore(db(fake), OWNER, {
    matchId: "r1",
    teamId: "B",
    description: "Machucou depois do último rally, antes de encerrar.",
  });

  const result = await kocFinishRoundCore(db(fake), OWNER, {matchId: "r1"});
  // O valor de retorno da callable não leva `removed` (mapeamento próprio,
  // linha ~690) — só confere que B continua na tabela. `removed` é
  // conferido no doc PERSISTIDO, que é o que a mesa/telão de fato leem.
  assert.ok(result.standings.some((s) => s.teamId === "B"), "B continua aparecendo na tabela final");
  const persisted = (round(fake).kocStandings as DocData[]).find((s) => s.teamId === "B")!;
  assert.equal(persisted.removed, true);
});
```

Em `functions/src/koc-phase-advance.test.ts`, adicionar um novo describe:

```ts
describe("resolveKocRoster · equipe removida", () => {
  it("promove a próxima ativa quando a colocação pedida pertence a uma equipe removida", () => {
    const tables = new Map<number, KocStandingDoc[]>([
      [1, [
        {teamId: "a1", place: 1},
        {teamId: "a2", place: 2, removed: true},
        {teamId: "a3", place: 3},
        {teamId: "a4", place: 4},
      ]],
    ]);
    // Pede o 2º lugar da chave 1 — mas quem ficou em 2º está removida.
    const {teamIds, missing} = resolveKocRoster([slot(1, 2)], tables);
    assert.deepEqual(teamIds, ["a3"]);
    assert.equal(missing.length, 0);
  });

  it("equipe removida nunca aparece como classificada, mesmo pedindo o 1º lugar", () => {
    const tables = new Map<number, KocStandingDoc[]>([
      [1, [
        {teamId: "a1", place: 1, removed: true},
        {teamId: "a2", place: 2},
      ]],
    ]);
    const {teamIds} = resolveKocRoster([slot(1, 1)], tables);
    assert.deepEqual(teamIds, ["a2"]);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd functions && npm run build && node --test lib/koc-match-ops.test.js lib/koc-phase-advance.test.js`
Expected: FAIL — `removed` não é gravado; `resolveKocRoster` ainda casa por `place` bruto.

- [ ] **Step 3: Implementar**

Em `functions/src/koc-match-ops.ts`, dentro de `kocFinishRoundCore`, no `round.ref.update({...})` (linha ~671):

```ts
    kocStandings: standings.map((s) => ({
      teamId: s.teamId,
      place: s.place,
      points: s.points,
      crowns: s.crowns,
      ...(s.removed ? {removed: true} : {}),
    })),
```

Em `functions/src/koc-phase-advance.ts`:

1. `KocStandingDoc` ganha o campo:

```ts
export interface KocStandingDoc {
  teamId: string;
  place: number;
  /** Fora da rodada por lesão — nunca ocupa vaga de classificação, mesmo que
   *  a colocação bruta dissesse que sim. */
  removed?: boolean;
}
```

2. `parseKocStandings` passa a ler o campo:

```ts
export function parseKocStandings(raw: unknown): KocStandingDoc[] {
  if (!Array.isArray(raw)) return [];
  const out: KocStandingDoc[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const teamId = typeof entry.teamId === "string" ? entry.teamId.trim() : "";
    const place = Number(entry.place);
    if (!teamId || !Number.isInteger(place) || place < 1) continue;
    out.push({
      teamId,
      place,
      ...(entry.removed === true ? {removed: true} : {}),
    });
  }
  return out;
}
```

3. `resolveKocRoster` casa a vaga pela posição ENTRE AS ATIVAS, não pelo `place` bruto:

```ts
export function resolveKocRoster(
  qualifiers: readonly KocQualifierSlotDoc[],
  standingsByMatchNumber: ReadonlyMap<number, readonly KocStandingDoc[]>,
): KocRosterResolution {
  const ordered = [...qualifiers].sort((a, b) => {
    if (a.place !== b.place) return a.place - b.place;
    return a.fromRoundLabel - b.fromRoundLabel;
  });

  const teamIds: string[] = [];
  const missing: KocQualifierSlotDoc[] = [];
  for (const slot of ordered) {
    const standings = standingsByMatchNumber.get(slot.fromMatchNumber);
    // Equipe removida (lesão) nunca ocupa vaga de classificação: a posição
    // pedida conta só entre as ATIVAS, e quem vem depois é promovido no lugar.
    const active = standings ?
      [...standings].filter((s) => !s.removed).sort((a, b) => a.place - b.place) :
      undefined;
    const found = active?.[slot.place - 1];
    if (!found || teamIds.includes(found.teamId)) {
      missing.push(slot);
      continue;
    }
    teamIds.push(found.teamId);
  }
  return {teamIds, missing};
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd functions && npm run build && node --test lib/koc-match-ops.test.js lib/koc-phase-advance.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/koc-match-ops.ts functions/src/koc-phase-advance.ts functions/src/koc-match-ops.test.ts functions/src/koc-phase-advance.test.ts
git commit -m "$(cat <<'EOF'
feat(koc): equipe removida por lesão nunca qualifica em fase futura

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Leitura no cliente (`koc.ts`)

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/data/koc.ts`
- Test: `frontend/projects/organizer/src/app/painel/data/koc.spec.ts`

**Interfaces:**
- Consumes: nenhuma das tarefas anteriores diretamente (lê o MESMO formato de doc que elas escrevem: `kocRallies` com `winner: "team_removed"`, `kocStandings` com `removed`).
- Produces: `KocRallyEntry['winner']` inclui `"team_removed"`; `KocStanding.removed: boolean`; `KocLogLine['kind']` inclui `"removed"`. Task 6 (UI) consome `KocLogLine.kind === "removed"` para rotular a linha do log.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar a `frontend/projects/organizer/src/app/painel/data/koc.spec.ts` (reaproveita o helper `doc()` já existente no topo do arquivo):

```ts
describe('kocRoundStateFrom · remoção por lesão', () => {
  it('lê removed:true nas standings persistidas', () => {
    const round = kocRoundStateFrom(
      doc({
        kocStandings: [
          { teamId: 'A', place: 1, points: 3, crowns: 1 },
          { teamId: 'B', place: 2, points: 1, crowns: 0, removed: true },
        ],
      }),
    );
    expect(round.standings.find((s) => s.teamId === 'B')?.removed).toBe(true);
    expect(round.standings.find((s) => s.teamId === 'A')?.removed).toBe(false);
  });
});

describe('kocLogLines · remoção por lesão', () => {
  it('gera uma linha "removed" e reflete a promoção da fila nas linhas seguintes', () => {
    const round = kocRoundStateFrom(
      doc({
        kocRallies: [
          { seq: 1, winner: 'team_removed', teamId: 'B', atMs: T0 },
          { seq: 2, winner: 'king', atMs: T0 + 1000 },
        ],
        kocRallySeq: 2,
      }),
    );
    const lines = kocLogLines(round);
    // reverse(): mais recente primeiro.
    expect(lines[1]).toEqual(expect.objectContaining({ teamId: 'B', kind: 'removed' }));
    // Depois de B saída, C assume o desafio; o rally seguinte é do rei A contra C.
    expect(lines[0]).toEqual(expect.objectContaining({ teamId: 'A', kind: 'point' }));
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd frontend && npx ng test organizer --watch=false --include='**/koc.spec.ts'`
Expected: FAIL — `'team_removed'` não é aceito por `isRallyOutcome`, `removed` não é lido.

- [ ] **Step 3: Implementar**

Em `frontend/projects/organizer/src/app/painel/data/koc.ts`:

1. `KocStanding` ganha `removed`:

```ts
export interface KocStanding {
  teamId: string;
  place: number;
  points: number;
  crowns: number;
  removed: boolean;
}
```

2. `KocRallyEntry['winner']` e `KocLogLine['kind']`:

```ts
export interface KocRallyEntry {
  seq: number;
  winner: 'king' | 'challenger' | 'serve_fault' | 'golden_point' | 'team_removed';
  teamId: string;
  atMs: number | null;
}

export interface KocLogLine {
  key: string;
  seq: number;
  atMs: number | null;
  teamId: string;
  /** ... `removed` = equipe saiu da rodada por lesão. */
  kind: 'point' | 'crown' | 'fault' | 'golden' | 'removed';
}
```

3. `standingsOf` lê o campo novo:

```ts
    out.push({
      teamId,
      place,
      points: intOf(raw['points']),
      crowns: intOf(raw['crowns']),
      removed: raw['removed'] === true,
    });
```

4. `isRallyOutcome` aceita o novo valor:

```ts
function isRallyOutcome(value: string): value is KocRallyEntry['winner'] {
  return value === 'king' || value === 'challenger' ||
    value === 'serve_fault' || value === 'golden_point' ||
    value === 'team_removed';
}
```

5. `kocFinalTable` — o fallback (rodada sem `kocStandings` ainda persistido) precisa do campo obrigatório:

```ts
export function kocFinalTable(round: KocRoundState): KocStanding[] {
  if (round.standings.length > 0) return round.standings;
  return kocLiveOrder(round).map((teamId, i) => ({
    teamId,
    place: i + 1,
    points: kocPointsOf(round, teamId),
    crowns: 0,
    removed: false,
  }));
}
```

6. `kocLogLines` — novo branch, espelhando a MESMA promoção que o motor faz (ver Task 1, `kocApplyRally`):

```ts
    if (entry.winner === 'team_removed') {
      const removedId = entry.teamId;
      lines.push({...base, teamId: removedId, kind: 'removed'});
      queue = queue.filter((id) => id !== removedId);
      if (removedId === challenger) {
        challenger = queue.shift() ?? '';
      } else if (removedId === king) {
        king = challenger;
        challenger = queue.shift() ?? '';
      }
      continue;
    }
```

(inserir ANTES do `if (entry.winner === 'serve_fault')`, na mesma ordem em que os outros `if`s aparecem hoje.)

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd frontend && npx ng test organizer --watch=false --include='**/koc.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/data/koc.ts frontend/projects/organizer/src/app/painel/data/koc.spec.ts
git commit -m "$(cat <<'EOF'
feat(koc): painel lê remoção por lesão (standings e log da rodada)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wrapper do serviço (`organizer-ops.service.ts`)

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/data/organizer-ops.service.ts`

**Interfaces:**
- Consumes: callable `kocRemoveTeam` da Task 2 (nome exato da Cloud Function).
- Produces: `removeKocTeam(params: {matchId: string; teamId: string; description: string}): Promise<{ok?: boolean; kingTeamId?: string; challengerTeamId?: string}>`. Task 6 (UI) chama esta função.

Este arquivo não tem testes próprios hoje (é um conjunto de wrappers finos sobre `httpsCallable`) — nenhuma tarefa TDD separada; a cobertura vem do teste de integração da UI (Task 6) e dos testes de backend (Tasks 2-3).

- [ ] **Step 1: Implementar**

Em `frontend/projects/organizer/src/app/painel/data/organizer-ops.service.ts`, na seção `// ── King of the Court (koc-match-ops.ts) ──`, depois de `finishKocRound`:

```ts
/** Remove uma dupla machucada da rodada, a qualquer momento — mesmo no trono
 *  ou desafiando. A próxima da fila assume o lugar na hora; pontos e coroas já
 *  conquistados pela dupla removida continuam no ranking final. Motivo é
 *  obrigatório e fica registrado em auditoria. */
export function removeKocTeam(params: { matchId: string; teamId: string; description: string }): Promise<{ ok?: boolean; kingTeamId?: string; challengerTeamId?: string }> {
  return call('kocRemoveTeam', {
    matchId: params.matchId.trim(),
    teamId: params.teamId.trim(),
    description: params.description.trim(),
  });
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc -p projects/organizer/tsconfig.app.json --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/data/organizer-ops.service.ts
git commit -m "$(cat <<'EOF'
feat(koc): wrapper removeKocTeam no serviço do painel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: UI na mesa KOTC (`mesa-koc.component.ts`)

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/chaveamento/mesa-koc.component.ts`

**Interfaces:**
- Consumes: `removeKocTeam` (Task 5); `OgConfirmDialogComponent`/`ConfirmPrompt` de `frontend/projects/organizer/src/app/painel/ui/confirm-dialog.component.ts`; `KocLogLine['kind']` incluindo `'removed'` (Task 4).
- Produces: nada consumido por outra tarefa — é a ponta final da funcionalidade.

- [ ] **Step 1: Importar o diálogo de confirmação e o wrapper do serviço**

No topo de `mesa-koc.component.ts`:

```ts
import { ConfirmPrompt, OgConfirmDialogComponent } from '../ui/confirm-dialog.component';
```

E no import existente de `'../data/organizer-ops.service'` (linha ~27-36), adicionar `removeKocTeam` à lista.

No array `imports` do `@Component` (linha ~72), adicionar `OgConfirmDialogComponent`:

```ts
  imports: [RouterLink, OgAvatarComponent, OgIconComponent, OgConfirmDialogComponent],
```

- [ ] **Step 2: Adicionar o estado do diálogo e o método de remoção**

Perto de `protected readonly logOpen = signal(false);` (linha ~2914):

```ts
  protected readonly removeTeamTarget = signal<{ teamId: string; name: string } | null>(null);
```

Perto de `protected undo(): void { ... }` (linha ~3341), adicionar:

```ts
  /** Abre o diálogo de confirmação — o motivo é obrigatório, igual à remoção
   *  de inscrição em `inscricoes.component.ts`. */
  protected askRemoveTeam(teamId: string): void {
    if (this.busy()) return;
    this.removeTeamTarget.set({ teamId, name: this.faceOf(teamId).name });
  }

  protected cancelRemoveTeam(): void {
    this.removeTeamTarget.set(null);
  }

  protected confirmRemoveTeam(description: string): void {
    const target = this.removeTeamTarget();
    if (!target) return;
    void this.run(
      () => removeKocTeam({ matchId: this.matchId(), teamId: target.teamId, description }),
      `${target.name} removida da rodada por lesão.`,
    );
    this.removeTeamTarget.set(null);
  }

  protected readonly removeTeamPrompt: ConfirmPrompt = {
    label: 'Motivo da remoção',
    placeholder: 'Ex.: torceu o tornozelo no 3º rally',
    minLength: 10,
    helper: 'Mínimo de 10 caracteres. Fica registrado na auditoria da rodada.',
  };
```

- [ ] **Step 3: Adicionar o botão em cada card (Rei, Desafiante, fila)**

No template, dentro de `<article class="og-mk-side throne">` (linha ~378, depois do parágrafo de pontos do rei):

```html
                <p class="og-mk-side-pts">
                  <strong>{{ pointsOf(kingId()) }}</strong>
                  <span>PTS</span>
                </p>
                <button type="button" class="og-ghost-btn og-mk-remove-btn" [disabled]="busy()" (click)="askRemoveTeam(kingId())">
                  Remover por lesão
                </button>
```

Dentro de `<article class="og-mk-side challenger">` (linha ~398, depois do parágrafo de pontos da desafiante):

```html
                <p class="og-mk-side-pts muted">
                  <strong>{{ pointsOf(challengerId()) }}</strong>
                  <span>PTS</span>
                </p>
                <button type="button" class="og-ghost-btn og-mk-remove-btn" [disabled]="busy()" (click)="askRemoveTeam(challengerId())">
                  Remover por lesão
                </button>
```

Dentro de cada `<li class="og-mk-order-row">` da fila (linha ~421-435, depois do `<span class="og-mk-order-pts">`):

```html
                  <span class="og-mk-order-pts">{{ row.points }}</span>
                  <button type="button" class="og-ghost-btn og-mk-remove-btn-sm" [disabled]="busy()" (click)="askRemoveTeam(row.teamId)">
                    Lesão
                  </button>
```

- [ ] **Step 4: Renderizar o `<og-confirm-dialog>`**

Perto do bloco `@if (confirmStartOpen()) { ... }` (linha ~657), adicionar (ANTES ou DEPOIS, sem aninhar):

```html
    @if (removeTeamTarget(); as target) {
      <og-confirm-dialog
        title="Remover por lesão"
        [message]="target.name + ' sai da rodada agora. A próxima dupla da fila assume o lugar na hora, e os pontos já conquistados continuam valendo no ranking final. Não dá pra desfazer pela mesa.'"
        confirmLabel="Remover"
        [destructive]="true"
        [busy]="busy()"
        [prompt]="removeTeamPrompt"
        (confirmed)="confirmRemoveTeam($event)"
        (cancelled)="cancelRemoveTeam()"
      />
    }
```

- [ ] **Step 5: Rotular a linha do log**

Em `LOG_ACTION` (linha ~62), adicionar a entrada que o compilador vai exigir (o tipo é `Record<KocLogLine['kind'], string>` — sem ela, `npx tsc` recusa compilar):

```ts
const LOG_ACTION: Record<KocLogLine['kind'], string> = {
  point: '+1 · defendeu o trono',
  crown: 'coroou — assume o trono',
  fault: 'errou o saque — perdeu a vez, sem ponto',
  golden: '+1 · venceu a bola de ouro',
  removed: 'saiu da rodada — lesão',
};
```

- [ ] **Step 6: Verificar que compila**

Run: `cd frontend && npx tsc -p projects/organizer/tsconfig.app.json --noEmit`
Expected: sem erros.

- [ ] **Step 7: Verificação manual na mesa (dev server)**

Run: `cd frontend && npx ng serve organizer`

Abrir uma rodada KOTC em andamento no painel, clicar em "Remover por lesão" no Rei, na Desafiante e em alguém da fila; confirmar que:
- o diálogo pede motivo e recusa confirmar com menos de 10 caracteres;
- depois de confirmar, a fila reordena na hora e o card do Rei/Desafiante atualiza;
- o log da rodada mostra a linha "saiu da rodada — lesão";
- ao encerrar a rodada, a equipe removida aparece na tabela final com os pontos que já tinha.

- [ ] **Step 8: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/chaveamento/mesa-koc.component.ts
git commit -m "$(cat <<'EOF'
feat(koc): botão de remover equipe por lesão na mesa KOTC

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Cobertura do spec:**
- Remoção em qualquer momento (Rei/Desafiante/fila) → Task 1 (motor) + Task 2 (callable) + Task 6 (UI, três pontos de entrada).
- Pontos/coroas congelados, aparecem no ranking final → Task 1 (`points`/`crowns` intactos) + Task 3 (`removed: true` sem sumir do `kocStandings`).
- Motivo obrigatório + auditoria → Task 2 (`parseRemovalDescription` + `tournamentKocTeamRemovals`).
- Próxima da fila assume na hora, sem interromper a rodada → Task 1 (`kocApplyRally` branch, sem tocar relógio/contagem de rallies jogados).
- Fora de tudo dali em diante → Task 3 (`resolveKocRoster` promovendo ativa no lugar da removida, em qualquer fase futura).
- Undo funciona de graça → Task 2, teste "desfazer com kocUndoRallyCore devolve a equipe removida" (nenhum código extra precisou ser escrito — é o replay fazendo o trabalho).
- Bola de ouro não convoca removida → Task 1 (`kocQualifyingTies`).

**Placeholders:** nenhum "TBD"/"depois eu vejo" — todo passo tem código real, incluindo a leitura do `FakeFirestore.store` nos testes de auditoria (Task 2), já confirmada contra `fake-firestore.test-helper.ts:61`.

**Consistência de tipos:** `KocRallyOutcome`/`KocRallyEntry['winner']`/`isKocRallyOutcome` (dois arquivos) e `isRallyOutcome` (cliente) todos ganham `"team_removed"` juntos (Tasks 1, 2, 4). `KocStanding.removed` (motor) ↔ `KocStandingDoc.removed` (avanço de fase) ↔ `KocStanding.removed` (cliente) — mesmo nome, mesmo tipo `boolean`, em três arquivos (Tasks 1, 3, 4). `kocRemoveTeamCore` (Task 2) e `removeKocTeam` (Task 5) usam os mesmos nomes de campo (`matchId`, `teamId`, `description`) do payload até a UI (Task 6).
