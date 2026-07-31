import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
  chunkList,
  inscriptionParticipantUids,
  partitionCleanupTargets,
} from "./test-data-cleanup";

describe("test-data-cleanup", () => {
  it("chunkList divide em blocos do tamanho pedido", () => {
    assert.deepEqual(chunkList([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(chunkList([], 3), []);
    assert.deepEqual(chunkList([1, 2], 10), [[1, 2]]);
  });

  it("inscriptionParticipantUids junta participantUids e player1Id legado", () => {
    assert.deepEqual(
      inscriptionParticipantUids({
        id: "i1",
        tournamentId: "t1",
        participantUids: ["a", "b"],
      }),
      ["a", "b"],
    );

    // Doc legado: só player1Id.
    assert.deepEqual(
      inscriptionParticipantUids({id: "i2", tournamentId: "t1", player1Id: "c"}),
      ["c"],
    );

    // Sem duplicar quando player1Id já está em participantUids.
    assert.deepEqual(
      inscriptionParticipantUids({
        id: "i3",
        tournamentId: "t1",
        participantUids: ["a", "b"],
        player1Id: "a",
      }),
      ["a", "b"],
    );

    // Lixo é ignorado, não quebra.
    assert.deepEqual(
      inscriptionParticipantUids({
        id: "i4",
        tournamentId: "t1",
        participantUids: ["a", "", null, 42],
        player1Id: "  ",
      }),
      ["a"],
    );
  });

  it("partitionCleanupTargets separa inscrições e teams do torneio seed", () => {
    const plan = partitionCleanupTargets({
      inscriptions: [
        {id: "i1", tournamentId: "seed1", teamId: "tm1", participantUids: ["s1", "s2"]},
        {id: "i2", tournamentId: "seed1", teamId: "tm2", participantUids: ["s3", "s4"]},
        {id: "i3", tournamentId: "real1", teamId: "tm9", participantUids: ["r1", "r2"]},
      ],
      seedAthleteUids: ["s1", "s2", "s3", "s4"],
      seedTournamentIds: ["seed1"],
    });

    assert.deepEqual(plan.seedInscriptionIds, ["i1", "i2"]);
    assert.deepEqual(plan.teamIds, ["tm1", "tm2"]);
    assert.deepEqual(plan.realAthleteUids, []);
    assert.deepEqual(plan.preservedAthleteUids, []);
    assert.deepEqual(plan.deletableAthleteUids, ["s1", "s2", "s3", "s4"]);
  });

  it("partitionCleanupTargets acusa atleta real inscrito em torneio seed", () => {
    const plan = partitionCleanupTargets({
      inscriptions: [
        {id: "i1", tournamentId: "seed1", teamId: "tm1", participantUids: ["s1", "REAL"]},
      ],
      seedAthleteUids: ["s1"],
      seedTournamentIds: ["seed1"],
    });

    assert.deepEqual(plan.realAthleteUids, ["REAL"]);
    // O atleta real nunca entra na lista de apagáveis.
    assert.deepEqual(plan.deletableAthleteUids, ["s1"]);
  });

  it("partitionCleanupTargets preserva atleta seed inscrito em torneio real", () => {
    const plan = partitionCleanupTargets({
      inscriptions: [
        {id: "i1", tournamentId: "seed1", teamId: "tm1", participantUids: ["s1", "s2"]},
        {id: "i2", tournamentId: "real1", teamId: "tm9", participantUids: ["s2", "r1"]},
      ],
      seedAthleteUids: ["s1", "s2"],
      seedTournamentIds: ["seed1"],
    });

    // s2 joga um torneio de verdade → não pode ser apagado.
    assert.deepEqual(plan.preservedAthleteUids, ["s2"]);
    assert.deepEqual(plan.deletableAthleteUids, ["s1"]);
    // A inscrição do torneio seed continua sendo apagada.
    assert.deepEqual(plan.seedInscriptionIds, ["i1"]);
    // r1 é real mas está só em torneio real → não é contaminação.
    assert.deepEqual(plan.realAthleteUids, []);
  });

  it("partitionCleanupTargets ignora teamId ausente e não duplica uids", () => {
    const plan = partitionCleanupTargets({
      inscriptions: [
        {id: "i1", tournamentId: "seed1", participantUids: ["s1"]},
        {id: "i2", tournamentId: "seed1", teamId: "tm1", participantUids: ["s1"]},
        {id: "i3", tournamentId: "seed1", teamId: "tm1", participantUids: ["s1"]},
      ],
      seedAthleteUids: ["s1"],
      seedTournamentIds: ["seed1"],
    });

    assert.deepEqual(plan.teamIds, ["tm1"]);
    assert.deepEqual(plan.deletableAthleteUids, ["s1"]);
  });

  it("partitionCleanupTargets devolve tudo vazio quando não há torneio seed", () => {
    const plan = partitionCleanupTargets({
      inscriptions: [
        {id: "i1", tournamentId: "real1", teamId: "tm9", participantUids: ["r1"]},
      ],
      seedAthleteUids: [],
      seedTournamentIds: [],
    });

    assert.deepEqual(plan.seedInscriptionIds, []);
    assert.deepEqual(plan.teamIds, []);
    assert.deepEqual(plan.realAthleteUids, []);
    assert.deepEqual(plan.preservedAthleteUids, []);
    assert.deepEqual(plan.deletableAthleteUids, []);
  });
});
