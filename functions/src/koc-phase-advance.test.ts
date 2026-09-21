import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {
  isKocPhaseComplete,
  parseKocQualifiers,
  parseKocStandings,
  resolveKocRoster,
  shouldAdvanceKocPhase,
  tryAdvanceKocPhase,
  type KocQualifierSlotDoc,
  type KocStandingDoc,
} from "./koc-phase-advance";
import {artifactsMatchesPath, getFirebaseProjectId} from "./firebase-paths";

const projectId = getFirebaseProjectId();
const matchesPath = artifactsMatchesPath(projectId);

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function slot(
  fromRoundLabel: number,
  place: number,
): KocQualifierSlotDoc {
  return {fromMatchNumber: fromRoundLabel, fromRoundLabel, place};
}

function standings(...teamIds: string[]): KocStandingDoc[] {
  return teamIds.map((teamId, i) => ({teamId, place: i + 1}));
}

describe("resolveKocRoster", () => {
  const tables = new Map<number, KocStandingDoc[]>([
    [1, standings("a1", "a2", "a3", "a4")],
    [2, standings("b1", "b2", "b3", "b4")],
    [3, standings("c1", "c2", "c3", "c4")],
    [4, standings("d1", "d2", "d3", "d4")],
  ]);

  it("o melhor classificado abre a lista — e abre no trono", () => {
    // A ordem não é cosmética: quem abre começa no trono, e o trono é de onde
    // os pontos vêm.
    const {teamIds} = resolveKocRoster(
      [slot(4, 2), slot(1, 1), slot(3, 1), slot(2, 2)],
      tables,
    );
    assert.deepEqual(teamIds, ["a1", "c1", "b2", "d2"]);
  });

  it("monta a SF1 da 1ª etapa (1ºR1, 2ºR2, 1ºR3, 2ºR4)", () => {
    const {teamIds, missing} = resolveKocRoster(
      [slot(1, 1), slot(2, 2), slot(3, 1), slot(4, 2)],
      tables,
    );
    assert.deepEqual(teamIds, ["a1", "c1", "b2", "d2"]);
    assert.deepEqual(missing, []);
  });

  it("acusa vaga sem dono quando a tabela de origem falta", () => {
    const {teamIds, missing} = resolveKocRoster(
      [slot(1, 1), slot(9, 1)],
      tables,
    );
    assert.deepEqual(teamIds, ["a1"]);
    assert.equal(missing.length, 1);
    assert.equal(missing[0]!.fromMatchNumber, 9);
  });

  it("acusa vaga sem dono quando a tabela é curta demais", () => {
    const short = new Map<number, KocStandingDoc[]>([[1, standings("a1", "a2")]]);
    const {missing} = resolveKocRoster([slot(1, 3)], short);
    assert.equal(missing.length, 1);
  });

  it("não deixa a mesma dupla entrar duas vezes na rodada", () => {
    // Tabela corrompida com colocação repetida não pode virar elenco com a
    // mesma dupla em dois lugares da fila.
    const broken = new Map<number, KocStandingDoc[]>([
      [1, [{teamId: "a1", place: 1}, {teamId: "a1", place: 2}]],
    ]);
    const {teamIds, missing} = resolveKocRoster([slot(1, 1), slot(1, 2)], broken);
    assert.deepEqual(teamIds, ["a1"]);
    assert.equal(missing.length, 1);
  });
});

describe("isKocPhaseComplete", () => {
  it("só quando TODAS as rodadas terminaram", () => {
    assert.equal(
      isKocPhaseComplete([{status: "Completed"}, {status: "Completed"}]),
      true,
    );
    assert.equal(
      isKocPhaseComplete([{status: "Completed"}, {status: "In Progress"}]),
      false,
    );
  });

  it("fase sem rodada não está completa", () => {
    assert.equal(isKocPhaseComplete([]), false);
  });
});

describe("shouldAdvanceKocPhase", () => {
  const after = {matchType: "koc_round", status: "Completed", kocStandings: [1]};

  it("dispara ao concluir a rodada", () => {
    assert.equal(shouldAdvanceKocPhase({status: "In Progress"}, after), true);
  });

  it("não repete quando nada mudou", () => {
    assert.equal(shouldAdvanceKocPhase(after, after), false);
  });

  it("repropaga quando a tabela é corrigida depois de concluída", () => {
    assert.equal(
      shouldAdvanceKocPhase({...after, kocStandings: [2]}, after),
      true,
    );
  });

  it("ignora partida de duelo", () => {
    assert.equal(
      shouldAdvanceKocPhase(
        {status: "In Progress"},
        {matchType: "final", status: "Completed"},
      ),
      false,
    );
  });
});

describe("tryAdvanceKocPhase", () => {
  /** Categoria de 8 duplas: 2 classificatórias → 1 final. */
  function seedCategory(
    fake: FakeFirestore,
    opts: {r1Standings?: string[]; r2Standings?: string[]} = {},
  ): void {
    const round = (
      id: string,
      matchNumber: number,
      phase: number,
      extra: DocData,
    ) => {
      fake.seedDoc(`${matchesPath}/${id}`, {
        tournamentId: "t1",
        categoryId: "cat-1",
        matchType: phase === 2 ? "koc_final" : "koc_round",
        kocPhase: phase,
        round: phase,
        matchNumber,
        teamAId: "",
        teamBId: "",
        ...extra,
      });
    };

    round("r1", 1, 1, {
      status: opts.r1Standings ? "Completed" : "In Progress",
      kocTeamIds: ["a1", "a2", "a3", "a4"],
      ...(opts.r1Standings ?
        {
          kocStandings: opts.r1Standings.map((teamId, i) => ({
            teamId,
            place: i + 1,
          })),
        } :
        {}),
    });
    round("r2", 2, 1, {
      status: opts.r2Standings ? "Completed" : "In Progress",
      kocTeamIds: ["b1", "b2", "b3", "b4"],
      ...(opts.r2Standings ?
        {
          kocStandings: opts.r2Standings.map((teamId, i) => ({
            teamId,
            place: i + 1,
          })),
        } :
        {}),
    });
    round("final", 3, 2, {
      status: "Scheduled",
      kocTeamIds: [],
      kocQualifiers: [
        {fromMatchNumber: 1, fromRoundLabel: 1, place: 1},
        {fromMatchNumber: 2, fromRoundLabel: 2, place: 2},
        {fromMatchNumber: 2, fromRoundLabel: 2, place: 1},
        {fromMatchNumber: 1, fromRoundLabel: 1, place: 2},
      ],
    });
  }

  function finalRound(fake: FakeFirestore): DocData {
    return fake.store.get(`${matchesPath}/final`)!;
  }

  it("não monta a fase seguinte com rodada da fase ainda em jogo", async () => {
    // O ponto que separa KOTC de duelo: a vaga ainda está em disputa na outra
    // quadra, então propagar agora montaria a final com quem não classificou.
    const fake = new FakeFirestore();
    seedCategory(fake, {r1Standings: ["a1", "a2", "a3", "a4"]});

    const result = await tryAdvanceKocPhase(
      db(fake),
      projectId,
      fake.store.get(`${matchesPath}/r1`)!,
    );
    assert.equal(result.advanced, 0);
    assert.deepEqual(finalRound(fake).kocTeamIds, []);
  });

  it("monta a final quando a última rodada da fase termina", async () => {
    const fake = new FakeFirestore();
    seedCategory(fake, {
      r1Standings: ["a1", "a2", "a3", "a4"],
      r2Standings: ["b1", "b2", "b3", "b4"],
    });

    const result = await tryAdvanceKocPhase(
      db(fake),
      projectId,
      fake.store.get(`${matchesPath}/r2`)!,
    );
    assert.equal(result.advanced, 1);
    // Primeiros na frente (trono para o melhor), depois os segundos.
    assert.deepEqual(finalRound(fake).kocTeamIds, ["a1", "b1", "a2", "b2"]);
  });

  it("é idempotente: reprocessar não embaralha a quadra", async () => {
    const fake = new FakeFirestore();
    seedCategory(fake, {
      r1Standings: ["a1", "a2", "a3", "a4"],
      r2Standings: ["b1", "b2", "b3", "b4"],
    });
    await tryAdvanceKocPhase(db(fake), projectId, fake.store.get(`${matchesPath}/r2`)!);
    const first = [...(finalRound(fake).kocTeamIds as string[])];

    const again = await tryAdvanceKocPhase(
      db(fake),
      projectId,
      fake.store.get(`${matchesPath}/r2`)!,
    );
    assert.equal(again.advanced, 0);
    assert.deepEqual(finalRound(fake).kocTeamIds, first);
  });

  it("deixa a rodada vazia quando falta tabela, em vez de montar incompleta", async () => {
    const fake = new FakeFirestore();
    seedCategory(fake, {r1Standings: ["a1", "a2", "a3", "a4"]});
    // r2 marcada como concluída SEM tabela — estado corrompido.
    fake.store.get(`${matchesPath}/r2`)!.status = "Completed";

    const result = await tryAdvanceKocPhase(
      db(fake),
      projectId,
      fake.store.get(`${matchesPath}/r2`)!,
    );
    assert.equal(result.advanced, 0);
    assert.deepEqual(finalRound(fake).kocTeamIds, []);
  });

  it("ignora partida de duelo", async () => {
    const fake = new FakeFirestore();
    const result = await tryAdvanceKocPhase(db(fake), projectId, {
      matchType: "final",
      status: "Completed",
      tournamentId: "t1",
      categoryId: "cat-1",
    });
    assert.equal(result.advanced, 0);
  });
});

describe("parsers", () => {
  it("descarta vaga corrompida", () => {
    assert.deepEqual(
      parseKocQualifiers([
        {fromMatchNumber: 1, fromRoundLabel: 1, place: 1},
        {fromMatchNumber: 1, place: 0},
        {place: 2},
        null,
      ]),
      [{fromMatchNumber: 1, fromRoundLabel: 1, place: 1}],
    );
  });

  it("usa o matchNumber como rótulo quando o rótulo falta", () => {
    const parsed = parseKocQualifiers([{fromMatchNumber: 7, place: 1}]);
    assert.equal(parsed[0]!.fromRoundLabel, 7);
  });

  it("descarta colocação corrompida na tabela", () => {
    assert.deepEqual(
      parseKocStandings([
        {teamId: "a", place: 1},
        {teamId: "", place: 2},
        {teamId: "b", place: 0},
        "lixo",
      ]),
      [{teamId: "a", place: 1}],
    );
  });
});
