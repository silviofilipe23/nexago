import {describe, it, afterEach} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import * as notificationDelivery from "./notification-delivery";
import {
  recalculateCourtSchedule,
  notifyScheduleShifts,
  handleDynamicRescheduleOnMatchUpdate,
  determineRecalcTrigger,
} from "./match-dynamic-reschedule";
import {artifactsMatchesPath, artifactsTeamsPath, getFirebaseProjectId} from "./firebase-paths";

const PROJECT_ID = getFirebaseProjectId();
const MATCHES_PATH = artifactsMatchesPath(PROJECT_ID);
const TEAMS_PATH = artifactsTeamsPath(PROJECT_ID);
const TOURNAMENT_ID = "t1";
const DAY_KEY = "2026-08-25";
const COURT_ID = "court-1";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function ts(iso: string): Timestamp {
  return Timestamp.fromDate(new Date(iso));
}

type SentNotification = {userId: string; title: string; body: string; type: string};
let sent: SentNotification[] = [];

function mockDeliver(): void {
  sent = [];
  (notificationDelivery as unknown as {
    deliverNotificationToUser: typeof notificationDelivery.deliverNotificationToUser;
  }).deliverNotificationToUser = async (input) => {
    sent.push({userId: input.userId, title: input.title, body: input.body, type: input.type});
    return {sent: 1, failed: 0};
  };
}

function seedMatch(
  fake: FakeFirestore,
  id: string,
  overrides: Record<string, unknown>,
): void {
  fake.seedDoc(`${MATCHES_PATH}/${id}`, {
    tournamentId: TOURNAMENT_ID,
    dayKey: DAY_KEY,
    courtId: COURT_ID,
    courtName: "Quadra 1",
    status: "Scheduled",
    queueStatus: "waiting",
    matchNumber: 1,
    teamAId: "team-a",
    teamBId: "team-b",
    ...overrides,
  });
}

/** Intervalos [start, end) das partidas da quadra, lidos do store. */
async function courtIntervals(
  fake: FakeFirestore,
  ids: string[],
): Promise<Array<{id: string; start: number; end: number}>> {
  const out: Array<{id: string; start: number; end: number}> = [];
  for (const id of ids) {
    const d = (await fake.doc(`${MATCHES_PATH}/${id}`).get()).data();
    if (!d?.scheduleTime) continue;
    const start = (d.scheduleTime as Timestamp).toMillis();
    const end = d.scheduleEndTime ?
      (d.scheduleEndTime as Timestamp).toMillis() :
      start + 30 * 60 * 1000;
    out.push({id, start, end});
  }
  return out;
}

/**
 * Varredura par a par: DUAS partidas na mesma quadra nunca podem ter
 * intervalos sobrepostos. É a invariante que a cascata não pode quebrar —
 * e a que o recorte por `matchNumber` sozinho quebrava em silêncio.
 */
async function assertNoCourtOverlap(
  fake: FakeFirestore,
  ids: string[],
): Promise<void> {
  const intervals = await courtIntervals(fake, ids);
  for (const a of intervals) {
    for (const b of intervals) {
      if (a.id >= b.id) continue;
      const overlaps: boolean = a.start < b.end && b.start < a.end;
      assert.equal(
        overlaps,
        false,
        `${a.id} e ${b.id} ocupam a mesma quadra ao mesmo tempo`,
      );
    }
  }
}

describe("recalculateCourtSchedule", () => {
  it("empurra as próximas partidas da mesma quadra a partir da âncora", async () => {
    const fake = new FakeFirestore();
    seedMatch(fake, "trigger-match", {
      status: "Completed",
      matchNumber: 1,
      scheduleTime: ts("2026-08-25T14:00:00-03:00"),
      scheduleEndTime: ts("2026-08-25T14:30:00-03:00"),
      matchEndedAt: ts("2026-08-25T14:20:00-03:00"),
    });
    seedMatch(fake, "next-match", {
      matchNumber: 2,
      scheduleTime: ts("2026-08-25T14:30:00-03:00"),
      scheduleEndTime: ts("2026-08-25T15:00:00-03:00"),
      teamAId: "team-c",
      teamBId: "team-d",
    });

    const shifts = await recalculateCourtSchedule(
      db(fake),
      PROJECT_ID,
      {
        tournamentId: TOURNAMENT_ID,
        dayKey: DAY_KEY,
        courtId: COURT_ID,
        anchor: new Date("2026-08-25T14:20:00-03:00"),
        triggerMatchId: "trigger-match",
        matchNumber: 1,
      },
      {durationMin: 30, minRestMin: 30},
    );

    assert.equal(shifts.length, 1);
    assert.equal(shifts[0].matchId, "next-match");
    assert.equal(shifts[0].newStart.toISOString(), new Date("2026-08-25T14:20:00-03:00").toISOString());

    const updated = (await fake.doc(`${MATCHES_PATH}/next-match`).get()).data();
    assert.equal(
      (updated?.scheduleTime as Timestamp).toMillis(),
      ts("2026-08-25T14:20:00-03:00").toMillis(),
    );
    assert.ok(updated?.scheduleRecalcAt);
  });

  it("não toca partidas já on_court/completed nem de outra quadra", async () => {
    const fake = new FakeFirestore();
    seedMatch(fake, "trigger-match", {status: "Completed", matchNumber: 1});
    seedMatch(fake, "already-live", {matchNumber: 2, queueStatus: "on_court", scheduleTime: ts("2026-08-25T14:30:00-03:00")});
    seedMatch(fake, "other-court", {matchNumber: 2, courtId: "court-2", scheduleTime: ts("2026-08-25T14:30:00-03:00")});

    const shifts = await recalculateCourtSchedule(
      db(fake),
      PROJECT_ID,
      {
        tournamentId: TOURNAMENT_ID,
        dayKey: DAY_KEY,
        courtId: COURT_ID,
        anchor: new Date("2026-08-25T14:20:00-03:00"),
        triggerMatchId: "trigger-match",
        matchNumber: 1,
      },
      {durationMin: 30, minRestMin: 30},
    );

    assert.deepEqual(shifts, []);
  });

  it("continua as outras partidas quando a escrita de uma delas falha (best-effort)", async () => {
    const fake = new FakeFirestore();
    seedMatch(fake, "trigger-match", {status: "Completed", matchNumber: 1});
    seedMatch(fake, "next-match", {
      matchNumber: 2,
      scheduleTime: ts("2026-08-25T14:30:00-03:00"),
      scheduleEndTime: ts("2026-08-25T15:00:00-03:00"),
      teamAId: "team-c",
      teamBId: "team-d",
    });
    seedMatch(fake, "third-match", {
      matchNumber: 3,
      scheduleTime: ts("2026-08-25T15:00:00-03:00"),
      scheduleEndTime: ts("2026-08-25T15:30:00-03:00"),
      teamAId: "team-e",
      teamBId: "team-f",
    });

    // Simula uma falha transitória do Firestore SÓ na escrita de "next-match"
    // (a primeira da fila) sobrescrevendo o método privado `write` da
    // instância — mesma técnica de monkeypatch já usada acima para
    // `deliverNotificationToUser`, sem alterar o helper compartilhado.
    const failingPath = `${MATCHES_PATH}/next-match`;
    type WriteFn = (
      path: string,
      data: Record<string, unknown>,
      opts?: {merge?: boolean},
    ) => void;
    const fakeWithWrite = fake as unknown as {write: WriteFn};
    const originalWrite = fakeWithWrite.write.bind(fake);
    fakeWithWrite.write = (path, data, opts) => {
      if (path === failingPath) throw new Error("firestore indisponível (simulado)");
      originalWrite(path, data, opts);
    };

    const shifts = await recalculateCourtSchedule(
      db(fake),
      PROJECT_ID,
      {
        tournamentId: TOURNAMENT_ID,
        dayKey: DAY_KEY,
        courtId: COURT_ID,
        anchor: new Date("2026-08-25T14:20:00-03:00"),
        triggerMatchId: "trigger-match",
        matchNumber: 1,
      },
      {durationMin: 30, minRestMin: 30},
    );

    // "next-match" falhou e foi excluída do retorno (sem notificação órfã);
    // "third-match" continuou sendo processada normalmente.
    assert.equal(shifts.length, 1);
    assert.equal(shifts[0].matchId, "third-match");

    const untouchedNext = (await fake.doc(`${MATCHES_PATH}/next-match`).get()).data();
    assert.equal(
      (untouchedNext?.scheduleTime as Timestamp).toMillis(),
      ts("2026-08-25T14:30:00-03:00").toMillis(),
    );

    const updatedThird = (await fake.doc(`${MATCHES_PATH}/third-match`).get()).data();
    assert.ok(updatedThird?.scheduleRecalcAt);
  });
});

/**
 * Composição dos DOIS estágios (`determineRecalcTrigger` -> `recalculateCourtSchedule`).
 * As suítes de unidade cobriam cada estágio isolado com um `trigger` escrito à
 * mão, então nenhuma delas via o contrato REAL entre eles: a âncora do
 * reagendamento manual e o recorte da fila por `matchNumber`. É aqui que o
 * bug de "m1/m2 arrastadas + colisão de quadra" aparece.
 */
describe("cascata ponta a ponta: reagendamento manual", () => {
  function seedQueue(fake: FakeFirestore): void {
    seedMatch(fake, "m1", {
      matchNumber: 1,
      scheduleTime: ts("2026-08-25T14:00:00-03:00"),
      scheduleEndTime: ts("2026-08-25T14:30:00-03:00"),
      teamAId: "team-a",
      teamBId: "team-b",
    });
    seedMatch(fake, "m2", {
      matchNumber: 2,
      scheduleTime: ts("2026-08-25T14:30:00-03:00"),
      scheduleEndTime: ts("2026-08-25T15:00:00-03:00"),
      teamAId: "team-c",
      teamBId: "team-d",
    });
    // m3 já gravada com o horário NOVO (é o que o trigger do Firestore vê).
    seedMatch(fake, "m3", {
      matchNumber: 3,
      scheduleTime: ts("2026-08-25T18:00:00-03:00"),
      scheduleEndTime: ts("2026-08-25T18:30:00-03:00"),
      teamAId: "team-e",
      teamBId: "team-f",
    });
  }

  const beforeM3 = {
    tournamentId: TOURNAMENT_ID,
    dayKey: DAY_KEY,
    courtId: COURT_ID,
    status: "Scheduled",
    queueStatus: "waiting",
    matchNumber: 3,
    scheduleTime: ts("2026-08-25T15:00:00-03:00"),
    scheduleEndTime: ts("2026-08-25T15:30:00-03:00"),
  };
  const afterM3 = {
    ...beforeM3,
    scheduleTime: ts("2026-08-25T18:00:00-03:00"),
    scheduleEndTime: ts("2026-08-25T18:30:00-03:00"),
  };

  it("mover m3 pra bem mais tarde NÃO arrasta m1/m2 nem colide com m3", async () => {
    const fake = new FakeFirestore();
    seedQueue(fake);

    const trigger = determineRecalcTrigger("m3", beforeM3, afterM3, 30);
    assert.ok(trigger, "reagendamento manual deve produzir um trigger");

    await recalculateCourtSchedule(db(fake), PROJECT_ID, trigger, {
      durationMin: 30,
      minRestMin: 30,
    });

    // (a) quem ninguém tocou fica exatamente onde estava
    const m1 = (await fake.doc(`${MATCHES_PATH}/m1`).get()).data();
    const m2 = (await fake.doc(`${MATCHES_PATH}/m2`).get()).data();
    assert.equal(
      (m1?.scheduleTime as Timestamp).toMillis(),
      ts("2026-08-25T14:00:00-03:00").toMillis(),
      "m1 não devia se mexer",
    );
    assert.equal(
      (m2?.scheduleTime as Timestamp).toMillis(),
      ts("2026-08-25T14:30:00-03:00").toMillis(),
      "m2 não devia se mexer",
    );

    // (b) nenhuma partida da quadra sobrepõe o intervalo de m3
    const intervals = await courtIntervals(fake, ["m1", "m2", "m3"]);
    const m3Interval = intervals.find((i) => i.id === "m3");
    assert.ok(m3Interval);
    for (const other of intervals) {
      if (other.id === "m3") continue;
      const overlaps: boolean = other.start < m3Interval.end && m3Interval.start < other.end;
      assert.equal(overlaps, false, `${other.id} colide com m3 na mesma quadra`);
    }
  });

  it("a fila DEPOIS de m3 recomeça no FIM de m3, não no início dela", async () => {
    const fake = new FakeFirestore();
    seedQueue(fake);
    seedMatch(fake, "m4", {
      matchNumber: 4,
      scheduleTime: ts("2026-08-25T15:30:00-03:00"),
      scheduleEndTime: ts("2026-08-25T16:00:00-03:00"),
      teamAId: "team-g",
      teamBId: "team-h",
    });

    const trigger = determineRecalcTrigger("m3", beforeM3, afterM3, 30);
    assert.ok(trigger);

    const shifts = await recalculateCourtSchedule(db(fake), PROJECT_ID, trigger, {
      durationMin: 30,
      minRestMin: 30,
    });

    assert.deepEqual(
      shifts.map((s) => s.matchId),
      ["m4"],
      "só a fila POSTERIOR a m3 pode ser reagendada",
    );
    assert.equal(
      shifts[0].newStart.toISOString(),
      new Date("2026-08-25T18:30:00-03:00").toISOString(),
      "âncora é o FIM de m3 (18:30), não o início (18:00)",
    );

    await assertNoCourtOverlap(fake, ["m1", "m2", "m3", "m4"]);
  });

  it("mover m3 pra MAIS CEDO não deixa a fila por cima de quem ficou pra trás", async () => {
    // Espelho do caso anterior: m3 vai pra 13:15–13:45, ANTES de m1/m2. m1 e m2
    // têm matchNumber MENOR que o gatilho, mas seus horários já agendados caem
    // DEPOIS da nova âncora — se o recorte olhar só a numeração, elas somem do
    // alocador e m4 acaba escrita por cima de m1.
    const fake = new FakeFirestore();
    seedQueue(fake);
    seedMatch(fake, "m3", {
      matchNumber: 3,
      scheduleTime: ts("2026-08-25T13:15:00-03:00"),
      scheduleEndTime: ts("2026-08-25T13:45:00-03:00"),
      teamAId: "team-e",
      teamBId: "team-f",
    });
    seedMatch(fake, "m4", {
      matchNumber: 4,
      scheduleTime: ts("2026-08-25T15:30:00-03:00"),
      scheduleEndTime: ts("2026-08-25T16:00:00-03:00"),
      teamAId: "team-g",
      teamBId: "team-h",
    });

    const trigger = determineRecalcTrigger(
      "m3",
      beforeM3,
      {
        ...beforeM3,
        scheduleTime: ts("2026-08-25T13:15:00-03:00"),
        scheduleEndTime: ts("2026-08-25T13:45:00-03:00"),
      },
      30,
    );
    assert.ok(trigger);
    assert.equal(
      trigger.anchor.toISOString(),
      new Date("2026-08-25T13:45:00-03:00").toISOString(),
    );

    await recalculateCourtSchedule(db(fake), PROJECT_ID, trigger, {
      durationMin: 30,
      minRestMin: 30,
    });

    await assertNoCourtOverlap(fake, ["m1", "m2", "m3", "m4"]);
  });
});

/**
 * O recorte da fila por `matchNumber` sozinho assume que a numeração é global
 * no torneio — mas ela REINICIA a cada categoria (mesma pegadinha já conhecida
 * do `poolId`). Como o painel agenda POR CATEGORIA, uma quadra com duas
 * categorias na fila é o caso COMUM, e a categoria de numeração baixa pode
 * estar agendada bem DEPOIS da partida-gatilho.
 */
describe("cascata com fila multi-categoria na mesma quadra", () => {
  it("reagenda também a categoria de matchNumber baixo agendada mais tarde", async () => {
    const fake = new FakeFirestore();

    // Categoria A ocupa 14:00–16:30 (matchNumbers 9..13).
    const catA = [
      ["a9", 9, "14:00", "14:30"],
      ["a10", 10, "14:30", "15:00"],
      ["a11", 11, "15:00", "15:30"],
      ["a12", 12, "15:30", "16:00"],
      ["a13", 13, "16:00", "16:30"],
    ] as const;
    for (const [id, mn, start, end] of catA) {
      seedMatch(fake, id, {
        categoryId: "cat-a",
        matchNumber: mn,
        scheduleTime: ts(`2026-08-25T${start}:00-03:00`),
        scheduleEndTime: ts(`2026-08-25T${end}:00-03:00`),
        teamAId: `team-${id}-a`,
        teamBId: `team-${id}-b`,
        ...(id === "a9" ?
          // Gatilho: terminou 50min atrasada (15:20 em vez de 14:30).
          {status: "Completed", matchEndedAt: ts("2026-08-25T15:20:00-03:00")} :
          {}),
      });
    }

    // Categoria B foi agendada DEPOIS, na mesma quadra — numeração reinicia.
    const catB = [
      ["b1", 1, "16:30", "17:00"],
      ["b2", 2, "17:00", "17:30"],
    ] as const;
    for (const [id, mn, start, end] of catB) {
      seedMatch(fake, id, {
        categoryId: "cat-b",
        matchNumber: mn,
        scheduleTime: ts(`2026-08-25T${start}:00-03:00`),
        scheduleEndTime: ts(`2026-08-25T${end}:00-03:00`),
        teamAId: `team-${id}-a`,
        teamBId: `team-${id}-b`,
      });
    }

    const shifts = await recalculateCourtSchedule(
      db(fake),
      PROJECT_ID,
      {
        tournamentId: TOURNAMENT_ID,
        dayKey: DAY_KEY,
        courtId: COURT_ID,
        anchor: new Date("2026-08-25T15:20:00-03:00"),
        triggerMatchId: "a9",
        matchNumber: 9,
      },
      {durationMin: 30, minRestMin: 30},
    );

    // As partidas de B não podem ficar órfãs: ocupam a quadra depois da âncora,
    // então precisam entrar no recálculo (e, por tabela, nas notificações).
    const shiftedIds = shifts.map((s) => s.matchId).sort();
    assert.ok(shiftedIds.includes("b1"), `b1 ficou fora do recálculo: ${shiftedIds}`);
    assert.ok(shiftedIds.includes("b2"), `b2 ficou fora do recálculo: ${shiftedIds}`);

    await assertNoCourtOverlap(fake, [
      "a9", "a10", "a11", "a12", "a13", "b1", "b2",
    ]);
  });
});

describe("notifyScheduleShifts", () => {
  afterEach(mockDeliver);

  it("notifica TODOS os integrantes de trio/quarteto (memberUids), não só 2", async () => {
    mockDeliver();
    const fake = new FakeFirestore();
    fake.seedDoc(`${TEAMS_PATH}/team-trio`, {memberUids: ["p1", "p2", "p3"]});
    fake.seedDoc(`${TEAMS_PATH}/team-quarteto`, {memberUids: ["q1", "q2", "q3", "q4"]});

    await notifyScheduleShifts(db(fake), PROJECT_ID, TOURNAMENT_ID, [
      {
        matchId: "next-match",
        teamAId: "team-trio",
        teamBId: "team-quarteto",
        oldStart: new Date("2026-08-25T14:30:00-03:00"),
        newStart: new Date("2026-08-25T15:30:00-03:00"),
        courtLabel: "Quadra 1",
      },
    ]);

    assert.deepEqual(
      sent.map((n) => n.userId).sort(),
      ["p1", "p2", "p3", "q1", "q2", "q3", "q4"],
    );
  });

  it("notifica os dois times quando o desvio é >= 10min", async () => {
    mockDeliver();
    const fake = new FakeFirestore();
    fake.seedDoc(`${TEAMS_PATH}/team-a`, {player1Id: "p1", player2Id: "p2"});
    fake.seedDoc(`${TEAMS_PATH}/team-c`, {player1Id: "p3", player2Id: "p4"});

    await notifyScheduleShifts(db(fake), PROJECT_ID, TOURNAMENT_ID, [
      {
        matchId: "next-match",
        teamAId: "team-a",
        teamBId: "team-c",
        oldStart: new Date("2026-08-25T14:30:00-03:00"),
        newStart: new Date("2026-08-25T14:20:00-03:00"),
        courtLabel: "Quadra 1",
      },
    ]);

    assert.equal(sent.length, 4);
    assert.ok(sent.every((n) => n.type === "match_schedule_updated"));
    assert.deepEqual(sent.map((n) => n.userId).sort(), ["p1", "p2", "p3", "p4"]);
  });

  it("NÃO notifica quando o desvio é menor que o limiar", async () => {
    mockDeliver();
    const fake = new FakeFirestore();
    fake.seedDoc(`${TEAMS_PATH}/team-a`, {player1Id: "p1", player2Id: "p2"});

    await notifyScheduleShifts(db(fake), PROJECT_ID, TOURNAMENT_ID, [
      {
        matchId: "next-match",
        teamAId: "team-a",
        teamBId: "",
        oldStart: new Date("2026-08-25T14:30:00-03:00"),
        newStart: new Date("2026-08-25T14:25:00-03:00"), // só 5min
        courtLabel: "Quadra 1",
      },
    ]);

    assert.equal(sent.length, 0);
  });
});

describe("handleDynamicRescheduleOnMatchUpdate", () => {
  afterEach(mockDeliver);

  it("não faz nada quando o torneio não ligou a flag", async () => {
    mockDeliver();
    const fake = new FakeFirestore();
    fake.seedDoc(`tournaments/${TOURNAMENT_ID}`, {
      matchOps: {defaultMatchDurationMin: 30, minRestBetweenMatchesMin: 30},
    });
    seedMatch(fake, "next-match", {matchNumber: 2, scheduleTime: ts("2026-08-25T14:30:00-03:00")});

    const before = {tournamentId: TOURNAMENT_ID, dayKey: DAY_KEY, courtId: COURT_ID, status: "In Progress"};
    const after = {
      tournamentId: TOURNAMENT_ID,
      dayKey: DAY_KEY,
      courtId: COURT_ID,
      status: "Completed",
      matchEndedAt: ts("2026-08-25T14:20:00-03:00"),
    };

    await handleDynamicRescheduleOnMatchUpdate(db(fake), PROJECT_ID, "trigger-match", before, after);

    const untouched = (await fake.doc(`${MATCHES_PATH}/next-match`).get()).data();
    assert.equal(
      (untouched?.scheduleTime as Timestamp).toMillis(),
      ts("2026-08-25T14:30:00-03:00").toMillis(),
    );
    assert.equal(sent.length, 0);
  });

  it("recalcula e notifica de ponta a ponta quando a flag está ligada", async () => {
    mockDeliver();
    const fake = new FakeFirestore();
    fake.seedDoc(`tournaments/${TOURNAMENT_ID}`, {
      matchOps: {dynamicRescheduleEnabled: true, defaultMatchDurationMin: 30, minRestBetweenMatchesMin: 30},
    });
    fake.seedDoc(`${TEAMS_PATH}/team-c`, {player1Id: "p3", player2Id: "p4"});
    fake.seedDoc(`${TEAMS_PATH}/team-d`, {player1Id: "p5", player2Id: "p6"});
    seedMatch(fake, "next-match", {
      matchNumber: 2,
      scheduleTime: ts("2026-08-25T14:30:00-03:00"),
      scheduleEndTime: ts("2026-08-25T15:00:00-03:00"),
      teamAId: "team-c",
      teamBId: "team-d",
    });

    const before = {tournamentId: TOURNAMENT_ID, dayKey: DAY_KEY, courtId: COURT_ID, status: "In Progress"};
    const after = {
      tournamentId: TOURNAMENT_ID,
      dayKey: DAY_KEY,
      courtId: COURT_ID,
      status: "Completed",
      matchEndedAt: ts("2026-08-25T14:15:00-03:00"), // terminou 15min antes do previsto
    };

    await handleDynamicRescheduleOnMatchUpdate(db(fake), PROJECT_ID, "trigger-match", before, after);

    const updated = (await fake.doc(`${MATCHES_PATH}/next-match`).get()).data();
    assert.equal(
      (updated?.scheduleTime as Timestamp).toMillis(),
      ts("2026-08-25T14:15:00-03:00").toMillis(),
    );
    assert.equal(sent.length, 4); // 2 jogadores x 2 times
  });
});
