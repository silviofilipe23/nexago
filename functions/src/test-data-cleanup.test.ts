import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
  chunkList,
  inscriptionParticipantUids,
  partitionCleanupTargets,
  partitionOrganizerCleanup,
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
      existingTournamentIds: ["seed1", "real1"],
    });

    assert.deepEqual(plan.seedInscriptionIds, ["i1", "i2"]);
    assert.deepEqual(plan.teamIds, ["tm1", "tm2"]);
    assert.deepEqual(plan.realAthleteUids, []);
    assert.deepEqual(plan.preservedAthleteUids, []);
    assert.deepEqual(plan.deletableAthleteUids, ["s1", "s2", "s3", "s4"]);
    assert.deepEqual(plan.orphanSeedInscriptionIds, []);
    assert.deepEqual(plan.orphanUnknownInscriptionIds, []);
  });

  it("partitionCleanupTargets acusa atleta real inscrito em torneio seed", () => {
    const plan = partitionCleanupTargets({
      inscriptions: [
        {id: "i1", tournamentId: "seed1", teamId: "tm1", participantUids: ["s1", "REAL"]},
      ],
      seedAthleteUids: ["s1"],
      seedTournamentIds: ["seed1"],
      existingTournamentIds: ["seed1"],
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
      existingTournamentIds: ["seed1", "real1"],
    });

    // s2 joga um torneio de verdade → não pode ser apagado.
    assert.deepEqual(plan.preservedAthleteUids, ["s2"]);
    assert.deepEqual(plan.deletableAthleteUids, ["s1"]);
    // A inscrição do torneio seed continua sendo apagada.
    assert.deepEqual(plan.seedInscriptionIds, ["i1"]);
    // O team do torneio real NÃO entra na lista de apagáveis.
    assert.deepEqual(plan.teamIds, ["tm1"]);
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
      existingTournamentIds: ["seed1"],
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
      existingTournamentIds: ["real1"],
    });

    assert.deepEqual(plan.seedInscriptionIds, []);
    assert.deepEqual(plan.teamIds, []);
    assert.deepEqual(plan.realAthleteUids, []);
    assert.deepEqual(plan.preservedAthleteUids, []);
    assert.deepEqual(plan.deletableAthleteUids, []);
    assert.deepEqual(plan.orphanSeedInscriptionIds, []);
    assert.deepEqual(plan.orphanUnknownInscriptionIds, []);
  });
});

describe("partitionCleanupTargets — tournamentId pendurado", () => {
  it("não preserva atleta por inscrição em torneio inexistente", () => {
    // Cenário real: o torneio seed foi apagado à mão pelo console e as
    // inscrições ficaram para trás. Antes, isso movia todo atleta seed para
    // `preservedAthleteUids` e a limpeza virava no-op permanente, com a
    // mensagem falsa de que existiam torneios REAIS envolvidos.
    const plan = partitionCleanupTargets({
      inscriptions: [
        {id: "i1", tournamentId: "APAGADO", teamId: "tm1", participantUids: ["s1", "s2"]},
      ],
      seedAthleteUids: ["s1", "s2"],
      seedTournamentIds: [],
      existingTournamentIds: ["real1"],
    });

    assert.deepEqual(plan.preservedAthleteUids, []);
    assert.deepEqual(plan.deletableAthleteUids, ["s1", "s2"]);
    // Só de atletas seed → é lixo do seed, sai junto (com o team dela).
    assert.deepEqual(plan.orphanSeedInscriptionIds, ["i1"]);
    assert.deepEqual(plan.teamIds, ["tm1"]);
    assert.deepEqual(plan.orphanUnknownInscriptionIds, []);
    // Não é "atleta real em torneio seed": não há torneio seed nenhum.
    assert.deepEqual(plan.realAthleteUids, []);
    assert.deepEqual(plan.seedInscriptionIds, []);
  });

  it("tournamentId vazio conta como pendurado", () => {
    const plan = partitionCleanupTargets({
      inscriptions: [
        {id: "i1", tournamentId: "", teamId: "tm1", participantUids: ["s1"]},
        {id: "i2", tournamentId: "   ", participantUids: ["s1"]},
      ],
      seedAthleteUids: ["s1"],
      seedTournamentIds: ["seed1"],
      existingTournamentIds: ["seed1"],
    });

    assert.deepEqual(plan.orphanSeedInscriptionIds, ["i1", "i2"]);
    assert.deepEqual(plan.deletableAthleteUids, ["s1"]);
    assert.deepEqual(plan.preservedAthleteUids, []);
  });

  it("órfã com participante não-seed é reportada, não apagada", () => {
    const plan = partitionCleanupTargets({
      inscriptions: [
        {id: "i1", tournamentId: "APAGADO", teamId: "tm1", participantUids: ["s1", "REAL"]},
      ],
      seedAthleteUids: ["s1"],
      seedTournamentIds: [],
      existingTournamentIds: [],
    });

    assert.deepEqual(plan.orphanUnknownInscriptionIds, ["i1"]);
    assert.deepEqual(plan.orphanSeedInscriptionIds, []);
    // Nem a inscrição nem o team dela são tocados...
    assert.deepEqual(plan.teamIds, []);
    // ...e o atleta seed continua apagável: não há torneio real protegendo-o.
    assert.deepEqual(plan.deletableAthleteUids, ["s1"]);
    assert.deepEqual(plan.preservedAthleteUids, []);
  });

  it("órfã sem nenhum participante é reportada, não apagada", () => {
    // Sem participante não dá para provar que é lixo do seed.
    const plan = partitionCleanupTargets({
      inscriptions: [{id: "i1", tournamentId: "APAGADO", teamId: "tm1"}],
      seedAthleteUids: ["s1"],
      seedTournamentIds: [],
      existingTournamentIds: [],
    });

    assert.deepEqual(plan.orphanUnknownInscriptionIds, ["i1"]);
    assert.deepEqual(plan.orphanSeedInscriptionIds, []);
    assert.deepEqual(plan.teamIds, []);
  });

  it("torneio real existente continua preservando o atleta seed", () => {
    // Guarda de regressão: a distinção nova não pode afrouxar a proteção.
    const plan = partitionCleanupTargets({
      inscriptions: [
        {id: "i1", tournamentId: "real1", teamId: "tm9", participantUids: ["s1"]},
        {id: "i2", tournamentId: "APAGADO", teamId: "tm8", participantUids: ["s2"]},
      ],
      seedAthleteUids: ["s1", "s2"],
      seedTournamentIds: [],
      existingTournamentIds: ["real1"],
    });

    assert.deepEqual(plan.preservedAthleteUids, ["s1"]);
    assert.deepEqual(plan.deletableAthleteUids, ["s2"]);
    assert.deepEqual(plan.orphanSeedInscriptionIds, ["i2"]);
    assert.deepEqual(plan.teamIds, ["tm8"]);
  });

  it("atleta seed em torneio real e em órfã ao mesmo tempo é preservado", () => {
    // A órfã não pode "cancelar" a preservação vinda do torneio real, nem
    // vice-versa: a inscrição órfã dele sai, o atleta fica.
    const plan = partitionCleanupTargets({
      inscriptions: [
        {id: "i1", tournamentId: "APAGADO", teamId: "tm1", participantUids: ["s1"]},
        {id: "i2", tournamentId: "real1", teamId: "tm9", participantUids: ["s1"]},
      ],
      seedAthleteUids: ["s1"],
      seedTournamentIds: [],
      existingTournamentIds: ["real1"],
    });

    assert.deepEqual(plan.preservedAthleteUids, ["s1"]);
    assert.deepEqual(plan.deletableAthleteUids, []);
    assert.deepEqual(plan.orphanSeedInscriptionIds, ["i1"]);
  });
});

describe("partitionOrganizerCleanup", () => {
  it("preserva organizador seed que é managerId de torneio real", () => {
    const plan = partitionOrganizerCleanup({
      organizerUids: ["o1", "o2"],
      tournaments: [
        {id: "seed1", managerId: "o1", seedTestTournament: true},
        {id: "real1", managerId: "o1", seedTestTournament: false},
      ],
    });

    assert.deepEqual(plan.preservedOrganizerUids, ["o1"]);
    assert.deepEqual(plan.deletableOrganizerUids, ["o2"]);
  });

  it("apaga organizador seed que só gerencia o próprio torneio seed", () => {
    const plan = partitionOrganizerCleanup({
      organizerUids: ["o1"],
      tournaments: [{id: "seed1", managerId: "o1", seedTestTournament: true}],
    });

    assert.deepEqual(plan.preservedOrganizerUids, []);
    assert.deepEqual(plan.deletableOrganizerUids, ["o1"]);
  });

  it("apaga organizador seed sem nenhum torneio associado", () => {
    const plan = partitionOrganizerCleanup({organizerUids: ["o1"], tournaments: []});

    assert.deepEqual(plan.preservedOrganizerUids, []);
    assert.deepEqual(plan.deletableOrganizerUids, ["o1"]);
  });

  it("ignora torneio real sem managerId, sem quebrar", () => {
    const plan = partitionOrganizerCleanup({
      organizerUids: ["o1"],
      tournaments: [{id: "real1", seedTestTournament: false}],
    });

    assert.deepEqual(plan.preservedOrganizerUids, []);
    assert.deepEqual(plan.deletableOrganizerUids, ["o1"]);
  });

  it("managerId de torneio real que não é organizador seed não vira preservado", () => {
    const plan = partitionOrganizerCleanup({
      organizerUids: ["o1"],
      tournaments: [{id: "real1", managerId: "REAL_MANAGER", seedTestTournament: false}],
    });

    assert.deepEqual(plan.preservedOrganizerUids, []);
    assert.deepEqual(plan.deletableOrganizerUids, ["o1"]);
  });

  it("um organizador seed gerenciando 2 torneios reais só aparece uma vez em preservados", () => {
    const plan = partitionOrganizerCleanup({
      organizerUids: ["o1"],
      tournaments: [
        {id: "real1", managerId: "o1", seedTestTournament: false},
        {id: "real2", managerId: "o1", seedTestTournament: false},
      ],
    });

    assert.deepEqual(plan.preservedOrganizerUids, ["o1"]);
    assert.deepEqual(plan.deletableOrganizerUids, []);
  });
});
