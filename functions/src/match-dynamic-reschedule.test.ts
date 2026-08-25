import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {determineRecalcTrigger} from "./match-dynamic-reschedule";

const TOURNAMENT_ID = "t1";
const DAY_KEY = "2026-08-25";
const COURT_ID = "court-1";
const MATCH_ID = "match-1";
const DEFAULT_DURATION = 30;

function ts(iso: string): Timestamp {
  return Timestamp.fromDate(new Date(iso));
}

function baseMatch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tournamentId: TOURNAMENT_ID,
    dayKey: DAY_KEY,
    courtId: COURT_ID,
    status: "Scheduled",
    scheduleTime: ts("2026-08-25T14:00:00-03:00"),
    ...overrides,
  };
}

describe("determineRecalcTrigger", () => {
  it("dispara na conclusão normal, ancorado em matchEndedAt", () => {
    const before = baseMatch({status: "In Progress"});
    const after = baseMatch({status: "Completed", matchEndedAt: ts("2026-08-25T14:20:00-03:00")});

    const trigger = determineRecalcTrigger(MATCH_ID, before, after, DEFAULT_DURATION);

    assert.ok(trigger);
    assert.equal(trigger?.courtId, COURT_ID);
    assert.equal(trigger?.anchor.toISOString(), new Date("2026-08-25T14:20:00-03:00").toISOString());
  });

  it("dispara no W.O. do mesmo jeito (só olha a transição de status)", () => {
    const before = baseMatch({status: "Scheduled"});
    const after = baseMatch({status: "Completed", matchEndedAt: ts("2026-08-25T14:01:00-03:00")});

    const trigger = determineRecalcTrigger(MATCH_ID, before, after, DEFAULT_DURATION);

    assert.ok(trigger);
  });

  it("não redispara numa correção de partida já completed antes e depois", () => {
    const before = baseMatch({status: "Completed", matchEndedAt: ts("2026-08-25T14:20:00-03:00")});
    const after = baseMatch({status: "Completed", matchEndedAt: ts("2026-08-25T14:20:00-03:00")});

    assert.equal(determineRecalcTrigger(MATCH_ID, before, after, DEFAULT_DURATION), null);
  });

  it("dispara quando a partida entra ao vivo com atraso >= 10min", () => {
    const before = baseMatch({queueStatus: "waiting"});
    const after = baseMatch({
      queueStatus: "on_court",
      matchStartedAt: ts("2026-08-25T14:15:00-03:00"), // 15min depois do scheduleTime 14:00
    });

    const trigger = determineRecalcTrigger(MATCH_ID, before, after, DEFAULT_DURATION);

    assert.ok(trigger);
    // âncora = matchStartedAt + duração padrão (30min)
    assert.equal(trigger?.anchor.toISOString(), new Date("2026-08-25T14:45:00-03:00").toISOString());
  });

  it("NÃO dispara quando o atraso no início é menor que o limiar", () => {
    const before = baseMatch({queueStatus: "waiting"});
    const after = baseMatch({
      queueStatus: "on_court",
      matchStartedAt: ts("2026-08-25T14:05:00-03:00"), // só 5min de atraso
    });

    assert.equal(determineRecalcTrigger(MATCH_ID, before, after, DEFAULT_DURATION), null);
  });

  it("dispara no reagendamento manual ancorado no FIM da partida movida", () => {
    const before = baseMatch({
      scheduleTime: ts("2026-08-25T14:00:00-03:00"),
      scheduleEndTime: ts("2026-08-25T14:30:00-03:00"),
    });
    const after = baseMatch({
      scheduleTime: ts("2026-08-25T15:00:00-03:00"),
      scheduleEndTime: ts("2026-08-25T15:45:00-03:00"), // duração custom de 45min
      matchNumber: 3,
    });

    const trigger = determineRecalcTrigger(MATCH_ID, before, after, DEFAULT_DURATION);

    assert.ok(trigger);
    // A quadra só fica livre quando a partida movida ACABA — ancorar no início
    // dela jogaria a fila por cima dela mesma.
    assert.equal(trigger?.anchor.toISOString(), new Date("2026-08-25T15:45:00-03:00").toISOString());
    assert.equal(trigger?.matchNumber, 3);
  });

  it("no reagendamento manual sem scheduleEndTime, cai na duração padrão", () => {
    const before = baseMatch({scheduleTime: ts("2026-08-25T14:00:00-03:00")});
    const after = baseMatch({scheduleTime: ts("2026-08-25T15:00:00-03:00")});

    const trigger = determineRecalcTrigger(MATCH_ID, before, after, DEFAULT_DURATION);

    assert.ok(trigger);
    assert.equal(trigger?.anchor.toISOString(), new Date("2026-08-25T15:30:00-03:00").toISOString());
  });

  it("carrega o matchNumber do gatilho nos três caminhos (recorte da fila)", () => {
    const completed = determineRecalcTrigger(
      MATCH_ID,
      baseMatch({status: "In Progress", matchNumber: 7}),
      baseMatch({status: "Completed", matchNumber: 7, matchEndedAt: ts("2026-08-25T14:20:00-03:00")}),
      DEFAULT_DURATION,
    );
    assert.equal(completed?.matchNumber, 7);

    const lateStart = determineRecalcTrigger(
      MATCH_ID,
      baseMatch({queueStatus: "waiting", matchNumber: 8}),
      baseMatch({
        queueStatus: "on_court",
        matchNumber: 8,
        matchStartedAt: ts("2026-08-25T14:15:00-03:00"),
      }),
      DEFAULT_DURATION,
    );
    assert.equal(lateStart?.matchNumber, 8);

    // Sem matchNumber no doc, 0 significa "toda a fila da quadra".
    const semNumero = determineRecalcTrigger(
      MATCH_ID,
      baseMatch({status: "In Progress"}),
      baseMatch({status: "Completed", matchEndedAt: ts("2026-08-25T14:20:00-03:00")}),
      DEFAULT_DURATION,
    );
    assert.equal(semNumero?.matchNumber, 0);
  });

  it("dispara quando a quadra muda manualmente, mesmo com o mesmo scheduleTime", () => {
    const before = baseMatch({courtId: "court-1"});
    const after = baseMatch({courtId: "court-2"});

    const trigger = determineRecalcTrigger(MATCH_ID, before, after, DEFAULT_DURATION);

    assert.ok(trigger);
    assert.equal(trigger?.courtId, "court-2");
  });

  it("NUNCA dispara para a própria escrita da cascata (scheduleRecalcAt mudou)", () => {
    const before = baseMatch({
      scheduleTime: ts("2026-08-25T14:00:00-03:00"),
      scheduleRecalcAt: ts("2026-08-25T13:00:00-03:00"),
    });
    const after = baseMatch({
      scheduleTime: ts("2026-08-25T15:00:00-03:00"), // a própria cascata mudou isso
      scheduleRecalcAt: ts("2026-08-25T13:30:00-03:00"), // e carimbou de novo
    });

    assert.equal(determineRecalcTrigger(MATCH_ID, before, after, DEFAULT_DURATION), null);
  });

  it("NÃO dispara para o próprio auto-agendamento em lote (carimba scheduleRecalcAt na MESMA escrita)", () => {
    // `autoScheduleTournamentDay` grava scheduleTime/courtId pela primeira vez
    // em N partidas de uma tacada só. Sem o carimbo, cada uma dessas escritas
    // pareceria um "reagendamento manual externo" e dispararia sua PRÓPRIA
    // cascata, embaralhando a grade que o lote acabou de montar.
    const before = {
      tournamentId: TOURNAMENT_ID,
      dayKey: "",
      courtId: "",
      status: "Scheduled",
      matchNumber: 2,
    };
    const after = {
      tournamentId: TOURNAMENT_ID,
      dayKey: DAY_KEY,
      courtId: COURT_ID,
      status: "Scheduled",
      queueStatus: "waiting",
      matchNumber: 2,
      scheduleTime: ts("2026-08-25T15:00:00-03:00"),
      scheduleEndTime: ts("2026-08-25T15:30:00-03:00"),
      scheduleRecalcAt: ts("2026-08-25T13:00:00-03:00"),
    };

    assert.equal(determineRecalcTrigger(MATCH_ID, before, after, DEFAULT_DURATION), null);
  });

  it("ignora partida sem courtId/dayKey (nunca foi agendada)", () => {
    const before = baseMatch({courtId: "", dayKey: "", status: "Scheduled"});
    const after = baseMatch({courtId: "", dayKey: "", status: "Completed", matchEndedAt: ts("2026-08-25T14:20:00-03:00")});

    assert.equal(determineRecalcTrigger(MATCH_ID, before, after, DEFAULT_DURATION), null);
  });
});
