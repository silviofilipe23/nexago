import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  KOC_CHANGEOVER_MIN,
  allocateCourtSlots,
  compareByMatchNumber,
  matchDurationMin,
  matchTeamIds,
} from "./match-schedule-allocation";

function fakeDoc(id: string, data: Record<string, unknown>): FirebaseFirestore.QueryDocumentSnapshot {
  return {id, data: () => data} as unknown as FirebaseFirestore.QueryDocumentSnapshot;
}

describe("compareByMatchNumber", () => {
  it("ordena pela numeração global, tratando ausente como 0", () => {
    const sorted = [{matchNumber: 3}, {matchNumber: undefined}, {matchNumber: 1}].sort(
      compareByMatchNumber,
    );
    assert.deepEqual(sorted.map((m) => m.matchNumber), [undefined, 1, 3]);
  });
});

describe("allocateCourtSlots", () => {
  it("aloca em ordem de matchNumber, respeitando courtBusyUntil de entrada", () => {
    const dayStart = new Date("2026-08-25T10:00:00-03:00");
    const docs = [
      fakeDoc("m2", {matchNumber: 2, teamAId: "t3", teamBId: "t4"}),
      fakeDoc("m1", {matchNumber: 1, teamAId: "t1", teamBId: "t2"}),
    ];

    const slots = allocateCourtSlots({
      courts: [{id: "court-1"}],
      unscheduled: docs,
      courtBusyUntil: {"court-1": dayStart},
      teamBusyUntil: {},
      durationMin: 30,
      minRestMin: 30,
      avoidAthleteConflict: true,
      dayStart,
    });

    assert.equal(slots.length, 2);
    assert.equal(slots[0].matchId, "m1");
    assert.equal(slots[0].start.toISOString(), dayStart.toISOString());
    assert.equal(slots[1].matchId, "m2");
    assert.equal(slots[1].start.getTime(), dayStart.getTime() + 30 * 60 * 1000);
  });

  it("com 1 quadra só, o descanso mínimo da dupla EMPURRA o início (bug corrigido)", () => {
    const dayStart = new Date("2026-08-25T10:00:00-03:00");
    const busyUntil = new Date(dayStart.getTime() + 45 * 60 * 1000);
    const docs = [fakeDoc("m1", {matchNumber: 1, teamAId: "t1", teamBId: "t2"})];

    const slots = allocateCourtSlots({
      courts: [{id: "court-1"}],
      unscheduled: docs,
      courtBusyUntil: {"court-1": dayStart},
      teamBusyUntil: {t1: busyUntil},
      durationMin: 30,
      minRestMin: 30,
      avoidAthleteConflict: true,
      dayStart,
    });

    assert.equal(slots[0].start.getTime(), busyUntil.getTime());
  });

  it("com 2 quadras, o descanso mínimo da dupla também EMPURRA o início mesmo quando as duas quadras estão livres desde o dayStart", () => {
    const dayStart = new Date("2026-08-25T10:00:00-03:00");
    const busyUntil = new Date(dayStart.getTime() + 45 * 60 * 1000);
    const docs = [fakeDoc("m1", {matchNumber: 1, teamAId: "t1", teamBId: "t2"})];

    const slots = allocateCourtSlots({
      courts: [{id: "court-1"}, {id: "court-2"}],
      unscheduled: docs,
      courtBusyUntil: {"court-1": dayStart, "court-2": dayStart},
      teamBusyUntil: {t1: busyUntil},
      durationMin: 30,
      minRestMin: 30,
      avoidAthleteConflict: true,
      dayStart,
    });

    assert.equal(slots[0].start.getTime(), busyUntil.getTime());
  });

  it("escolhe a quadra que fica livre mais cedo entre várias", () => {
    const dayStart = new Date("2026-08-25T10:00:00-03:00");
    const courtBusyUntil = {
      "court-1": new Date(dayStart.getTime() + 60 * 60 * 1000),
      "court-2": dayStart,
    };
    const docs = [fakeDoc("m1", {matchNumber: 1, teamAId: "t1", teamBId: "t2"})];

    const slots = allocateCourtSlots({
      courts: [{id: "court-1"}, {id: "court-2"}],
      unscheduled: docs,
      courtBusyUntil,
      teamBusyUntil: {},
      durationMin: 30,
      minRestMin: 30,
      avoidAthleteConflict: true,
      dayStart,
    });

    assert.equal(slots[0].courtId, "court-2");
  });
});

/**
 * Rodada King of the Court na grade.
 *
 * A rodada grava `teamAId`/`teamBId` VAZIOS e guarda o elenco em `kocTeamIds`.
 * Todo ponto do agendador que lê só os dois lados trata a rodada como se não
 * tivesse ninguém dentro — e aí a mesma dupla cai em dois lugares no mesmo
 * horário.
 */
describe("matchTeamIds", () => {
  it("colhe o elenco da rodada KOTC, não os dois lados vazios", () => {
    const ids = matchTeamIds({
      teamAId: "",
      teamBId: "",
      kocTeamIds: ["t1", "t2", "t3", "t4"],
    } as FirebaseFirestore.DocumentData);
    assert.deepEqual(ids, ["t1", "t2", "t3", "t4"]);
  });

  it("segue colhendo os dois lados do duelo", () => {
    const ids = matchTeamIds({teamAId: "t1", teamBId: "t2"} as FirebaseFirestore.DocumentData);
    assert.deepEqual(ids, ["t1", "t2"]);
  });

  it("ignora vazio e não repete id", () => {
    const ids = matchTeamIds({
      teamAId: "t1",
      teamBId: "  ",
      kocTeamIds: ["t1", "", "t2"],
    } as FirebaseFirestore.DocumentData);
    assert.deepEqual(ids, ["t1", "t2"]);
  });
});

describe("matchDurationMin", () => {
  it("usa a duração da rodada, mais a troca", () => {
    const min = matchDurationMin(
      {kocConfig: {durationSec: 900}} as FirebaseFirestore.DocumentData,
      40,
    );
    assert.equal(min, 15 + KOC_CHANGEOVER_MIN);
  });

  it("acompanha a fase mais longa em vez do padrão do dia", () => {
    const min = matchDurationMin(
      {kocConfig: {durationSec: 1200}} as FirebaseFirestore.DocumentData,
      15,
    );
    assert.equal(min, 20 + KOC_CHANGEOVER_MIN);
  });

  it("duelo cai no padrão do dia", () => {
    assert.equal(matchDurationMin({teamAId: "t1"} as FirebaseFirestore.DocumentData, 40), 40);
  });

  it("config inválida não zera o slot", () => {
    for (const durationSec of [0, -60, "abc", null]) {
      assert.equal(
        matchDurationMin({kocConfig: {durationSec}} as FirebaseFirestore.DocumentData, 30),
        30,
      );
    }
  });
});

describe("allocateCourtSlots · rodadas King of the Court", () => {
  const dayStart = new Date("2026-10-24T09:00:00-03:00");

  function kocRound(id: string, matchNumber: number, teamIds: string[]) {
    return fakeDoc(id, {
      matchNumber,
      matchType: "koc_round",
      teamAId: "",
      teamBId: "",
      kocTeamIds: teamIds,
      kocConfig: {durationSec: 900},
    });
  }

  it("reserva a quadra pela duração da rodada, não pelo padrão do dia", () => {
    const slots = allocateCourtSlots({
      courts: [{id: "c1"}],
      unscheduled: [kocRound("r1", 1, ["t1", "t2", "t3", "t4"])],
      courtBusyUntil: {c1: dayStart},
      teamBusyUntil: {},
      durationMin: 40,
      minRestMin: 0,
      avoidAthleteConflict: true,
      dayStart,
    });
    const minutes = (slots[0]!.end.getTime() - slots[0]!.start.getTime()) / 60000;
    assert.equal(minutes, 15 + KOC_CHANGEOVER_MIN);
  });

  it("enfileira as rodadas na mesma quadra, em sequência", () => {
    // O desenho da etapa é uma quadra só: as rodadas acontecem uma depois da
    // outra, e o fim de uma é o começo da seguinte.
    const slots = allocateCourtSlots({
      courts: [{id: "c1"}],
      unscheduled: [
        kocRound("r1", 1, ["t1", "t2", "t3", "t4"]),
        kocRound("r2", 2, ["t5", "t6", "t7", "t8"]),
      ],
      courtBusyUntil: {c1: dayStart},
      teamBusyUntil: {},
      durationMin: 40,
      minRestMin: 30,
      avoidAthleteConflict: true,
      dayStart,
    });
    assert.equal(slots[1]!.start.getTime(), slots[0]!.end.getTime());
  });

  it("o elenco da rodada bloqueia a dupla para outro jogo no mesmo horário", () => {
    // Sem isto a dupla seria marcada num duelo enquanto está na rodada.
    const teamBusyUntil: Record<string, Date> = {};
    allocateCourtSlots({
      courts: [{id: "c1"}],
      unscheduled: [kocRound("r1", 1, ["t1", "t2", "t3", "t4"])],
      courtBusyUntil: {c1: dayStart},
      teamBusyUntil,
      durationMin: 40,
      minRestMin: 30,
      avoidAthleteConflict: true,
      dayStart,
    });
    for (const teamId of ["t1", "t2", "t3", "t4"]) {
      assert.ok(teamBusyUntil[teamId], `dupla ${teamId} deveria estar ocupada`);
    }
  });
});

describe("allocateCourtSlots · dependência entre rodadas KOTC", () => {
  const dayStart = new Date("2026-10-24T09:00:00-03:00");

  /** Rodada com elenco fechado (a 1ª da chave). */
  function firstRound(id: string, matchNumber: number, teamIds: string[]) {
    return fakeDoc(id, {
      matchNumber,
      matchType: "koc_round",
      teamAId: "",
      teamBId: "",
      kocTeamIds: teamIds,
      kocConfig: {durationSec: 900},
    });
  }

  /** Rodada que herda de outra: SEM elenco, só com as vagas. */
  function derivedRound(
    id: string,
    matchNumber: number,
    from: number[],
    matchType = "koc_round",
  ) {
    return fakeDoc(id, {
      matchNumber,
      matchType,
      teamAId: "",
      teamBId: "",
      kocTeamIds: [],
      kocQualifiers: from.map((fromMatchNumber) => ({fromMatchNumber, place: 2})),
      kocConfig: {durationSec: 900},
    });
  }

  it("a 2ª rodada da chave começa depois que a 1ª termina", () => {
    // Com 4 quadras livres o alocador guloso punha as duas às 09:00 em quadras
    // diferentes: a 2ª não tem `kocTeamIds`, então não havia conflito de
    // atleta para empurrá-la — e são as MESMAS duplas.
    const slots = allocateCourtSlots({
      courts: [{id: "c1"}, {id: "c2"}, {id: "c3"}, {id: "c4"}],
      unscheduled: [
        firstRound("r1", 1, ["t1", "t2", "t3", "t4"]),
        derivedRound("r2", 2, [1]),
      ],
      courtBusyUntil: {c1: dayStart, c2: dayStart, c3: dayStart, c4: dayStart},
      teamBusyUntil: {},
      durationMin: 30,
      minRestMin: 30,
      avoidAthleteConflict: true,
      dayStart,
    });
    assert.ok(
      slots[1]!.start >= slots[0]!.end,
      `2ª rodada em ${slots[1]!.start.toISOString()}, 1ª termina ${slots[0]!.end.toISOString()}`,
    );
  });

  it("a chave fica na MESMA quadra: o grupo não sai da areia entre as rodadas", () => {
    const slots = allocateCourtSlots({
      courts: [{id: "c1"}, {id: "c2"}, {id: "c3"}, {id: "c4"}],
      unscheduled: [
        firstRound("r1", 1, ["t1", "t2", "t3", "t4"]),
        derivedRound("r2", 2, [1]),
        firstRound("r3", 3, ["t5", "t6", "t7", "t8"]),
        derivedRound("r4", 4, [3]),
      ],
      courtBusyUntil: {c1: dayStart, c2: dayStart, c3: dayStart, c4: dayStart},
      teamBusyUntil: {},
      durationMin: 30,
      minRestMin: 30,
      avoidAthleteConflict: true,
      dayStart,
    });
    assert.equal(slots[1]!.courtId, slots[0]!.courtId, "chave 1");
    assert.equal(slots[3]!.courtId, slots[2]!.courtId, "chave 2");
    assert.notEqual(slots[2]!.courtId, slots[0]!.courtId, "chaves diferentes em paralelo");
  });

  it("espera TODAS as fontes, não só a primeira", () => {
    // A final depende das duas semis; antes era alocada junto com elas.
    const slots = allocateCourtSlots({
      courts: [{id: "c1"}, {id: "c2"}, {id: "c3"}],
      unscheduled: [
        firstRound("s1", 1, ["t1", "t2", "t3", "t4"]),
        firstRound("s2", 2, ["t5", "t6", "t7", "t8"]),
        derivedRound("f", 3, [1, 2], "koc_final"),
      ],
      courtBusyUntil: {c1: dayStart, c2: dayStart, c3: dayStart},
      teamBusyUntil: {},
      durationMin: 30,
      minRestMin: 30,
      avoidAthleteConflict: true,
      dayStart,
    });
    const [semi1, semi2, grandFinal] = slots;
    assert.ok(grandFinal!.start >= semi1!.end, "final depois da semi 1");
    assert.ok(grandFinal!.start >= semi2!.end, "final depois da semi 2");
  });

  it("fonte já agendada fora deste lote também segura a rodada", () => {
    const sourceEnd = new Date(dayStart.getTime() + 60 * 60 * 1000);
    const slots = allocateCourtSlots({
      courts: [{id: "c1"}],
      unscheduled: [derivedRound("r2", 2, [1])],
      courtBusyUntil: {c1: dayStart},
      teamBusyUntil: {},
      durationMin: 30,
      minRestMin: 30,
      avoidAthleteConflict: true,
      dayStart,
      endByMatchNumber: {1: sourceEnd},
    });
    assert.equal(slots[0]!.start.getTime(), sourceEnd.getTime());
  });

  it("partida de duelo não ganha dependência nenhuma", () => {
    const slots = allocateCourtSlots({
      courts: [{id: "c1"}, {id: "c2"}],
      unscheduled: [
        fakeDoc("d1", {matchNumber: 1, teamAId: "t1", teamBId: "t2"}),
        fakeDoc("d2", {matchNumber: 2, teamAId: "t3", teamBId: "t4"}),
      ],
      courtBusyUntil: {c1: dayStart, c2: dayStart},
      teamBusyUntil: {},
      durationMin: 30,
      minRestMin: 30,
      avoidAthleteConflict: true,
      dayStart,
    });
    assert.equal(slots[0]!.start.getTime(), slots[1]!.start.getTime(), "seguem em paralelo");
  });
});
