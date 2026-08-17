import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
  chunkList,
  inscriptionParticipantUids,
  partitionCleanupTargets,
  partitionOrganizerCleanup,
  partitionRankingDocs,
  partitionRatingEvents,
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

describe("partitionRatingEvents", () => {
  it("apaga evento cujos atletas são todos seed apagáveis", () => {
    const plan = partitionRatingEvents({
      events: [{id: "VOLEI_PRAIA_m1", athleteIds: ["s1", "s2", "s3", "s4"]}],
      removableAthleteUids: ["s1", "s2", "s3", "s4"],
    });

    assert.deepEqual(plan.deletableRatingEventIds, ["VOLEI_PRAIA_m1"]);
    assert.deepEqual(plan.mixedRatingEventIds, []);
  });

  it("reporta (não apaga) evento que mistura atleta seed com atleta real", () => {
    const plan = partitionRatingEvents({
      events: [{id: "VOLEI_PRAIA_m1", athleteIds: ["s1", "REAL", "s2", "s3"]}],
      removableAthleteUids: ["s1", "s2", "s3"],
    });

    assert.deepEqual(plan.deletableRatingEventIds, []);
    assert.deepEqual(plan.mixedRatingEventIds, ["VOLEI_PRAIA_m1"]);
  });

  it("atleta seed PRESERVADO conta como de fora — o evento não é apagado", () => {
    // `removableAthleteUids` já exclui os preservados; o evento de um torneio
    // real onde um seed preservado jogou não pode sumir com a limpeza.
    const plan = partitionRatingEvents({
      events: [{id: "VOLEI_PRAIA_m1", athleteIds: ["s1", "preservado"]}],
      removableAthleteUids: ["s1"],
    });

    assert.deepEqual(plan.deletableRatingEventIds, []);
    assert.deepEqual(plan.mixedRatingEventIds, ["VOLEI_PRAIA_m1"]);
  });

  it("apaga evento 100% de atletas órfãos (sobra de execução antiga)", () => {
    // Órfãos entram em `removableAthleteUids` junto com os seed: o evento não
    // tem mais nenhum dono vivo para o replay proteger.
    const plan = partitionRatingEvents({
      events: [{id: "VOLEI_PRAIA_m1", athleteIds: ["orfao1", "orfao2"]}],
      removableAthleteUids: ["orfao1", "orfao2"],
    });

    assert.deepEqual(plan.deletableRatingEventIds, ["VOLEI_PRAIA_m1"]);
    assert.deepEqual(plan.mixedRatingEventIds, []);
  });

  it("evento sem athleteIds utilizável é reportado, não apagado", () => {
    const plan = partitionRatingEvents({
      events: [
        {id: "e1", athleteIds: []},
        {id: "e2"},
        {id: "e3", athleteIds: ["", null, 42]},
      ],
      removableAthleteUids: ["s1"],
    });

    assert.deepEqual(plan.deletableRatingEventIds, []);
    assert.deepEqual(plan.mixedRatingEventIds, ["e1", "e2", "e3"]);
  });

  it("sem atleta removível nenhum, nada é apagado", () => {
    const plan = partitionRatingEvents({
      events: [{id: "e1", athleteIds: ["s1"]}],
      removableAthleteUids: [],
    });

    assert.deepEqual(plan.deletableRatingEventIds, []);
    assert.deepEqual(plan.mixedRatingEventIds, ["e1"]);
  });

  it("sem eventos, devolve tudo vazio", () => {
    const plan = partitionRatingEvents({events: [], removableAthleteUids: ["s1"]});

    assert.deepEqual(plan.deletableRatingEventIds, []);
    assert.deepEqual(plan.mixedRatingEventIds, []);
  });
});

describe("partitionRankingDocs", () => {
  const base = {
    deletableAthleteUids: [],
    deletableTeamIds: [],
    seedTournamentIds: [],
    orphanAthleteUids: [],
    orphanTeamIds: [],
  };

  it("apaga por dono seed — atleta, dupla ou torneio", () => {
    const plan = partitionRankingDocs({
      ...base,
      docs: [
        {path: "PB/athleteRankings/s1", athleteId: "s1"},
        {path: "PB/teamRankings/tm1", teamId: "tm1"},
        {path: "PB/tournamentCategoryResults/seed1_c_tm9", teamId: "tm9", tournamentId: "seed1"},
      ],
      deletableAthleteUids: ["s1"],
      deletableTeamIds: ["tm1"],
      seedTournamentIds: ["seed1"],
    });

    assert.deepEqual(plan.seedRankingPaths, [
      "PB/athleteRankings/s1",
      "PB/teamRankings/tm1",
      "PB/tournamentCategoryResults/seed1_c_tm9",
    ]);
    assert.deepEqual(plan.orphanRankingPaths, []);
  });

  it("apaga por dono morto — é o fantasma das execuções antigas", () => {
    const plan = partitionRankingDocs({
      ...base,
      docs: [
        {path: "PB/athleteRankings/orfao", athleteId: "orfao"},
        {path: "PB/teamRankings/tmMorto", teamId: "tmMorto"},
      ],
      orphanAthleteUids: ["orfao"],
      orphanTeamIds: ["tmMorto"],
    });

    assert.deepEqual(plan.seedRankingPaths, []);
    assert.deepEqual(plan.orphanRankingPaths, [
      "PB/athleteRankings/orfao",
      "PB/teamRankings/tmMorto",
    ]);
  });

  it("mantém doc de atleta vivo que não é seed", () => {
    const plan = partitionRankingDocs({
      ...base,
      docs: [{path: "PB/athleteRankings/REAL", athleteId: "REAL"}],
      deletableAthleteUids: ["s1"],
      orphanAthleteUids: ["orfao"],
    });

    assert.deepEqual(plan.seedRankingPaths, []);
    assert.deepEqual(plan.orphanRankingPaths, []);
  });

  it("atleta seed PRESERVADO não aparece em nenhuma das listas", () => {
    // Preservado tem `users/{uid}` vivo (logo não é órfão) e ficou de fora de
    // `deletableAthleteUids` — o ranking dele sobrevive junto com a conta.
    const plan = partitionRankingDocs({
      ...base,
      docs: [{path: "PB/athleteRankings/preservado", athleteId: "preservado"}],
      deletableAthleteUids: ["s1"],
    });

    assert.deepEqual(plan.seedRankingPaths, []);
    assert.deepEqual(plan.orphanRankingPaths, []);
  });

  it("seed ganha de órfão quando o doc cai nos dois", () => {
    const plan = partitionRankingDocs({
      ...base,
      docs: [{path: "PB/athleteRankings/s1", athleteId: "s1"}],
      deletableAthleteUids: ["s1"],
      orphanAthleteUids: ["s1"],
    });

    assert.deepEqual(plan.seedRankingPaths, ["PB/athleteRankings/s1"]);
    assert.deepEqual(plan.orphanRankingPaths, []);
  });

  it("resultado de torneio seed sai mesmo com a dupla ainda viva", () => {
    // A inscrição pode ter sido removida à mão: a dupla não entra em
    // `deletableTeamIds`, e é o `tournamentId` que salva a descoberta.
    const plan = partitionRankingDocs({
      ...base,
      docs: [
        {path: "PB/tournamentCategoryResults/seed1_c_tmViva", teamId: "tmViva", tournamentId: "seed1"},
      ],
      seedTournamentIds: ["seed1"],
    });

    assert.deepEqual(plan.seedRankingPaths, [
      "PB/tournamentCategoryResults/seed1_c_tmViva",
    ]);
  });

  it("doc sem dono identificável é mantido", () => {
    const plan = partitionRankingDocs({
      ...base,
      docs: [
        {path: "PB/tournamentCategoryResults/lixo"},
        {path: "PB/athleteRankings/vazio", athleteId: "  "},
      ],
      deletableAthleteUids: ["s1"],
      orphanAthleteUids: ["orfao"],
      orphanTeamIds: ["tmMorto"],
    });

    assert.deepEqual(plan.seedRankingPaths, []);
    assert.deepEqual(plan.orphanRankingPaths, []);
  });

  it("sem docs, devolve tudo vazio", () => {
    const plan = partitionRankingDocs({...base, docs: []});

    assert.deepEqual(plan.seedRankingPaths, []);
    assert.deepEqual(plan.orphanRankingPaths, []);
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
