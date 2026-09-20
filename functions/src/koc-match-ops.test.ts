import {describe, it, afterEach} from "node:test";
import assert from "node:assert/strict";
import * as adminAuth from "firebase-admin/auth";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {
  kocFinishRoundCore,
  kocRegisterRallyCore,
  kocSetClockCore,
  kocStartRoundCore,
  kocUndoRallyCore,
  parseStoredClock,
  parseStoredRallies,
} from "./koc-match-ops";
import {artifactsMatchesPath, getFirebaseProjectId} from "./firebase-paths";

/**
 * Mesa da rodada King of the Court. Mesmo padrão de
 * `organizer-match-ops.live-score.test.ts`: `FakeFirestore` + monkey patch de
 * `getAuth`, porque o ACL consulta claims para papéis não-donos.
 */

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function mockAuthUser(customClaims: Record<string, unknown> = {}): void {
  (adminAuth as unknown as {
    getAuth: () => {
      getUser: (uid: string) => Promise<{customClaims: Record<string, unknown>}>;
    };
  }).getAuth = () => ({getUser: async () => ({customClaims})});
}

const projectId = getFirebaseProjectId();
const matchesPath = artifactsMatchesPath(projectId);
const OWNER = "owner-1";
const ROSTER = ["A", "B", "C", "D"];
const T0 = 1_700_000_000_000;

function seedRound(
  fake: FakeFirestore,
  overrides: DocData = {},
  opts: {teamIds?: string[]; durationSec?: number; qualifiers?: number} = {},
): void {
  fake.seedDoc("tournaments/t1", {managerId: OWNER, name: "Etapa Teste"});
  fake.seedDoc(`${matchesPath}/r1`, {
    tournamentId: "t1",
    categoryId: "cat-1",
    matchType: "koc_round",
    kocPhase: 1,
    poolId: "C1",
    teamAId: "",
    teamBId: "",
    status: "Scheduled",
    isGroupMatch: false,
    matchNumber: 1,
    kocTeamIds: opts.teamIds ?? ROSTER,
    kocConfig: {
      roundEndMode: "time",
      durationSec: opts.durationSec ?? 900,
      teamsPerCourt: 4,
      qualifiersPerRound: opts.qualifiers ?? 2,
      crownScores: false,
    },
    ...overrides,
  });
}

function round(fake: FakeFirestore): DocData {
  return fake.store.get(`${matchesPath}/r1`)!;
}

function state(fake: FakeFirestore): DocData {
  return round(fake).kocState as DocData;
}

async function assertHttpsError(
  promise: Promise<unknown>,
  code: string,
  reason?: string,
): Promise<void> {
  await assert.rejects(promise, (err: {code?: string; details?: DocData}) => {
    assert.equal(err.code, code, `esperava ${code}, veio ${err.code}`);
    if (reason) assert.equal(err.details?.reason, reason);
    return true;
  });
}

/** Inicia e registra os rallies pedidos. */
async function play(
  fake: FakeFirestore,
  winners: Array<"king" | "challenger">,
): Promise<void> {
  await kocStartRoundCore(db(fake), OWNER, {matchId: "r1"}, T0);
  for (const winner of winners) {
    await kocRegisterRallyCore(db(fake), OWNER, {matchId: "r1", winner});
  }
}

/**
 * Rodada com corte LIMPO: A=2, D=1, B=0, C=0.
 *
 * Importa para os testes de encerramento: se o 2º lugar empatar, o encerramento
 * trava de propósito (bola de ouro), e o teste mediria outra coisa. "A vence
 * tudo" NÃO serve — deixa três duplas empatadas em zero brigando pela 2ª vaga.
 */
const CLEAN_ROUND: Array<"king" | "challenger"> = [
  "king",
  "king",
  "challenger",
  "king",
];

afterEach(() => mockAuthUser({}));

describe("kocStartRoundCore", () => {
  it("põe a rodada em jogo com trono, fila e relógio", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);

    const result = await kocStartRoundCore(db(fake), OWNER, {matchId: "r1"}, T0);
    assert.equal(result.endsAtMs, T0 + 900_000);

    const doc = round(fake);
    assert.equal(doc.status, "In Progress");
    assert.equal(state(fake).kingTeamId, "A");
    assert.equal(state(fake).challengerTeamId, "B");
    assert.deepEqual(state(fake).queue, ["C", "D"]);
    assert.equal((doc.kocClock as DocData).endsAtMs, T0 + 900_000);
    assert.equal(fake.store.get("tournaments/t1")!.liveMatchesNow, 1);
  });

  it("usa a duração do SNAPSHOT da rodada, não um padrão global", async () => {
    const fake = new FakeFirestore();
    seedRound(fake, {}, {durationSec: 1200});
    const result = await kocStartRoundCore(db(fake), OWNER, {matchId: "r1"}, T0);
    assert.equal(result.endsAtMs, T0 + 1_200_000);
  });

  it("recusa reiniciar rodada com rally registrado", async () => {
    // Reiniciar apaga pontos conquistados: exige intenção explícita.
    const fake = new FakeFirestore();
    seedRound(fake);
    await play(fake, ["king", "king"]);

    await assertHttpsError(
      kocStartRoundCore(db(fake), OWNER, {matchId: "r1"}, T0),
      "failed-precondition",
      "koc_round_already_started",
    );
    assert.equal((state(fake).points as DocData).A, 2);
  });

  it("reinicia zerando quando a mesa pede explicitamente", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await play(fake, ["king", "king"]);

    await kocStartRoundCore(db(fake), OWNER, {matchId: "r1", restart: true}, T0);
    assert.equal((state(fake).points as DocData).A, 0);
    assert.equal(round(fake).kocRallySeq, 0);
  });

  it("recusa elenco que não faz a fila girar", async () => {
    const fake = new FakeFirestore();
    seedRound(fake, {}, {teamIds: ["A", "B"]});
    await assertHttpsError(
      kocStartRoundCore(db(fake), OWNER, {matchId: "r1"}, T0),
      "failed-precondition",
      "koc_roster_too_small",
    );
  });

  it("recusa partida que não é rodada KOTC", async () => {
    const fake = new FakeFirestore();
    seedRound(fake, {matchType: "final", teamAId: "A", teamBId: "B"});
    await assertHttpsError(
      kocStartRoundCore(db(fake), OWNER, {matchId: "r1"}, T0),
      "failed-precondition",
      "not_a_koc_round",
    );
  });
});

describe("kocRegisterRallyCore", () => {
  it("rei que defende pontua e segue no trono", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await play(fake, ["king"]);

    assert.equal(state(fake).kingTeamId, "A");
    assert.equal((state(fake).points as DocData).A, 1);
    assert.equal(state(fake).challengerTeamId, "C");
    assert.deepEqual(state(fake).queue, ["D", "B"]);
  });

  it("coroação não pontua", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await play(fake, ["challenger"]);

    assert.equal(state(fake).kingTeamId, "B");
    assert.equal((state(fake).points as DocData).B, 0);
  });

  it("guarda o log e o mantém como fonte da verdade", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await play(fake, ["king", "challenger", "king"]);

    assert.deepEqual(round(fake).kocRallies, [
      {seq: 1, winner: "king"},
      {seq: 2, winner: "challenger"},
      {seq: 3, winner: "king"},
    ]);
    assert.equal(round(fake).kocRallySeq, 3);
  });

  it("recusa seq divergente em vez de virar ponto fantasma", async () => {
    // Duplo toque com rede ruim reenviaria o mesmo rally.
    const fake = new FakeFirestore();
    seedRound(fake);
    await play(fake, ["king"]);

    await assertHttpsError(
      kocRegisterRallyCore(db(fake), OWNER, {
        matchId: "r1",
        winner: "king",
        expectedSeq: 1,
      }),
      "aborted",
      "koc_seq_mismatch",
    );
    assert.equal((state(fake).points as DocData).A, 1);
  });

  it("aceita quando o seq esperado bate", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await play(fake, ["king"]);
    const result = await kocRegisterRallyCore(db(fake), OWNER, {
      matchId: "r1",
      winner: "king",
      expectedSeq: 2,
    });
    assert.equal(result.seq, 2);
  });

  it("recusa vencedor inválido", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await kocStartRoundCore(db(fake), OWNER, {matchId: "r1"}, T0);
    await assertHttpsError(
      kocRegisterRallyCore(db(fake), OWNER, {matchId: "r1", winner: "A"}),
      "invalid-argument",
    );
  });

  it("recusa rally em rodada que não começou", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await assertHttpsError(
      kocRegisterRallyCore(db(fake), OWNER, {matchId: "r1", winner: "king"}),
      "failed-precondition",
      "koc_round_not_started",
    );
  });

  it("aceita rally depois do estouro do cronômetro", async () => {
    // Regra do formato: o rally em andamento no apito é concluído.
    const fake = new FakeFirestore();
    seedRound(fake);
    await kocStartRoundCore(db(fake), OWNER, {matchId: "r1"}, T0);
    const result = await kocRegisterRallyCore(db(fake), OWNER, {
      matchId: "r1",
      winner: "king",
    });
    assert.equal(result.seq, 1);
  });
});

describe("kocUndoRallyCore", () => {
  it("desfaz o último rally reproduzindo o log", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await play(fake, ["king", "king"]);

    await kocUndoRallyCore(db(fake), OWNER, {matchId: "r1"});
    assert.equal((state(fake).points as DocData).A, 1);
    assert.equal(round(fake).kocRallySeq, 1);
  });

  it("desfaz uma coroação devolvendo o trono a quem o tinha", async () => {
    // O caso que não tem inversa única — e o motivo de reproduzir o log.
    const fake = new FakeFirestore();
    seedRound(fake);
    await play(fake, ["king", "challenger"]);
    assert.equal(state(fake).kingTeamId, "C");

    await kocUndoRallyCore(db(fake), OWNER, {matchId: "r1"});
    assert.equal(state(fake).kingTeamId, "A");
    assert.equal(state(fake).challengerTeamId, "C");
    assert.deepEqual(state(fake).queue, ["D", "B"]);
  });

  it("recusa desfazer sem rally", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await kocStartRoundCore(db(fake), OWNER, {matchId: "r1"}, T0);
    await assertHttpsError(
      kocUndoRallyCore(db(fake), OWNER, {matchId: "r1"}),
      "failed-precondition",
      "koc_no_rally_to_undo",
    );
  });
});

describe("kocSetClockCore", () => {
  it("pausa congelando o tempo restante", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await kocStartRoundCore(db(fake), OWNER, {matchId: "r1"}, T0);

    const paused = await kocSetClockCore(
      db(fake),
      OWNER,
      {matchId: "r1", action: "pause"},
      T0 + 300_000,
    );
    assert.equal(paused.remainingSec, 600);
    // Dez minutos de mundo real depois, ainda faltam 600s.
    const again = await kocSetClockCore(
      db(fake),
      OWNER,
      {matchId: "r1", action: "pause"},
      T0 + 900_000,
    );
    assert.equal(again.remainingSec, 600);
  });

  it("retomar devolve o tempo parado", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await kocStartRoundCore(db(fake), OWNER, {matchId: "r1"}, T0);
    await kocSetClockCore(db(fake), OWNER, {matchId: "r1", action: "pause"}, T0 + 300_000);

    const resumed = await kocSetClockCore(
      db(fake),
      OWNER,
      {matchId: "r1", action: "resume"},
      T0 + 420_000,
    );
    assert.equal(resumed.remainingSec, 600);
    assert.equal(resumed.endsAtMs, T0 + 900_000 + 120_000);
  });

  it("encurta a rodada — a válvula de atraso da quadra única", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await kocStartRoundCore(db(fake), OWNER, {matchId: "r1"}, T0);

    const shorter = await kocSetClockCore(
      db(fake),
      OWNER,
      {matchId: "r1", action: "setDuration", durationSec: 600},
      T0,
    );
    assert.equal(shorter.endsAtMs, T0 + 600_000);
  });

  it("prende a duração nos limites do formato", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await kocStartRoundCore(db(fake), OWNER, {matchId: "r1"}, T0);
    const tiny = await kocSetClockCore(
      db(fake),
      OWNER,
      {matchId: "r1", action: "setDuration", durationSec: 5},
      T0,
    );
    assert.equal(tiny.endsAtMs, T0 + 300_000);
  });

  it("ajuste fino aceita ±1 min e recusa mais que isso", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await kocStartRoundCore(db(fake), OWNER, {matchId: "r1"}, T0);

    const nudged = await kocSetClockCore(
      db(fake),
      OWNER,
      {matchId: "r1", action: "nudge", deltaSec: -60},
      T0,
    );
    assert.equal(nudged.endsAtMs, T0 + 840_000);

    await assertHttpsError(
      kocSetClockCore(
        db(fake),
        OWNER,
        {matchId: "r1", action: "nudge", deltaSec: -600},
        T0,
      ),
      "invalid-argument",
    );
  });

  it("recusa ação desconhecida", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await kocStartRoundCore(db(fake), OWNER, {matchId: "r1"}, T0);
    await assertHttpsError(
      kocSetClockCore(db(fake), OWNER, {matchId: "r1", action: "stop"}, T0),
      "invalid-argument",
    );
  });
});

describe("kocFinishRoundCore", () => {
  it("encerra com a tabela e o 1º da tabela como winnerId", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await play(fake, CLEAN_ROUND);

    const result = await kocFinishRoundCore(db(fake), OWNER, {matchId: "r1"});
    assert.equal(result.standings[0]!.teamId, "A");
    assert.equal(result.standings[0]!.points, 2);
    assert.equal(result.standings[1]!.teamId, "D");
    assert.deepEqual(result.unresolvedTies, []);

    const doc = round(fake);
    assert.equal(doc.status, "Completed");
    assert.equal(doc.winnerId, "A");
    assert.equal((doc.kocStandings as DocData[]).length, 4);
    assert.ok(doc.matchEndedAt);
  });

  it("trava no empate que decide vaga, para a bola de ouro ser jogada", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    // A=2, C=1, D=1, B=0 → o empate de C e D decide a 2ª vaga.
    await play(fake, ["king", "king", "challenger", "king", "challenger", "king"]);

    await assertHttpsError(
      kocFinishRoundCore(db(fake), OWNER, {matchId: "r1"}),
      "failed-precondition",
      "koc_unresolved_tie",
    );
    assert.equal(round(fake).status, "In Progress");
  });

  it("encerra o empate quando a mesa aceita o desempate automático", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await play(fake, ["king", "king", "challenger", "king", "challenger", "king"]);

    const result = await kocFinishRoundCore(db(fake), OWNER, {
      matchId: "r1",
      acceptTiebreak: true,
    });
    assert.equal(round(fake).status, "Completed");
    assert.equal(result.unresolvedTies.length, 1);
  });

  it("empate fora do corte não trava o encerramento", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    // B e D empatam em 0, disputando 3º e 4º.
    await play(fake, ["king", "challenger", "king", "king"]);
    const result = await kocFinishRoundCore(db(fake), OWNER, {matchId: "r1"});
    assert.deepEqual(result.unresolvedTies, []);
  });

  it("recusa encerrar duas vezes", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await play(fake, CLEAN_ROUND);
    await kocFinishRoundCore(db(fake), OWNER, {matchId: "r1"});
    await assertHttpsError(
      kocFinishRoundCore(db(fake), OWNER, {matchId: "r1"}),
      "failed-precondition",
      "koc_round_completed",
    );
  });

  it("recusa encerrar rodada que não começou", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await assertHttpsError(
      kocFinishRoundCore(db(fake), OWNER, {matchId: "r1"}),
      "failed-precondition",
      "koc_round_not_started",
    );
  });

  it("rodada encerrada não aceita mais rally", async () => {
    const fake = new FakeFirestore();
    seedRound(fake);
    await play(fake, CLEAN_ROUND);
    await kocFinishRoundCore(db(fake), OWNER, {matchId: "r1"});
    await assertHttpsError(
      kocRegisterRallyCore(db(fake), OWNER, {matchId: "r1", winner: "king"}),
      "failed-precondition",
      "koc_round_completed",
    );
  });
});

describe("parsers de campo gravado", () => {
  it("descarta entrada corrompida do log", () => {
    const parsed = parseStoredRallies([
      {seq: 2, winner: "king"},
      {seq: 1, winner: "challenger"},
      {seq: 0, winner: "king"},
      {seq: 3, winner: "ninguem"},
      null,
      "x",
    ]);
    assert.deepEqual(parsed, [
      {seq: 1, winner: "challenger"},
      {seq: 2, winner: "king"},
    ]);
  });

  it("log ausente é log vazio, não erro", () => {
    assert.deepEqual(parseStoredRallies(undefined), []);
    assert.deepEqual(parseStoredRallies("nao e lista"), []);
  });

  it("relógio sem os campos obrigatórios é nulo", () => {
    assert.equal(parseStoredClock(undefined), null);
    assert.equal(parseStoredClock({durationSec: 900}), null);
  });

  it("pausa ausente lê como relógio correndo", () => {
    const clock = parseStoredClock({startedAtMs: T0, durationSec: 900});
    assert.equal(clock!.pausedAtMs, null);
    assert.equal(clock!.pausedAccumSec, 0);
  });
});
