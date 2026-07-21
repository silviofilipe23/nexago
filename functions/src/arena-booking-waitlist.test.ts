import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  WAITLIST_NOTIFY_WINDOW_MS,
  computeSlotLockIds,
  computeWaitlistExpiresAtMs,
  isNotifiedWaitlistEntryExpired,
  isSlotFullyBooked,
  selectFifoWinner,
} from "./arena-booking-waitlist";

describe("computeSlotLockIds", () => {
  it("gera um lock por hora cheia coberta pelo intervalo", () => {
    assert.deepEqual(
      computeSlotLockIds({
        arenaId: "arena1",
        courtId: "court2",
        dateKey: "2026-07-20",
        startTime: "18:00",
        endTime: "20:00",
      }),
      ["arena1_court2_2026-07-20_h18", "arena1_court2_2026-07-20_h19"],
    );
  });

  it("intervalo de meia hora ainda cobre a hora cheia", () => {
    assert.deepEqual(
      computeSlotLockIds({
        arenaId: "a",
        courtId: "c",
        dateKey: "2026-07-20",
        startTime: "18:30",
        endTime: "19:00",
      }),
      ["a_c_2026-07-20_h18"],
    );
  });

  it("intervalo inválido (fim <= início) retorna vazio", () => {
    assert.deepEqual(
      computeSlotLockIds({
        arenaId: "a",
        courtId: "c",
        dateKey: "2026-07-20",
        startTime: "18:00",
        endTime: "18:00",
      }),
      [],
    );
  });
});

describe("isSlotFullyBooked — entrada só é criada quando o slot está lotado", () => {
  const lockIds = ["a_c_2026-07-20_h18", "a_c_2026-07-20_h19"];

  it("todas as horas travadas => lotado", () => {
    assert.equal(isSlotFullyBooked(lockIds, new Set(lockIds)), true);
  });

  it("falta uma hora travada => ainda tem vaga, não lotado", () => {
    assert.equal(
      isSlotFullyBooked(lockIds, new Set(["a_c_2026-07-20_h18"])),
      false,
    );
  });

  it("nenhuma hora travada => não lotado", () => {
    assert.equal(isSlotFullyBooked(lockIds, new Set()), false);
  });

  it("lista de locks vazia (intervalo inválido) nunca é considerada lotada", () => {
    assert.equal(isSlotFullyBooked([], new Set(["qualquer"])), false);
  });

  it("aceita array além de Set", () => {
    assert.equal(isSlotFullyBooked(lockIds, lockIds), true);
  });
});

describe("selectFifoWinner — notificação vai para o mais antigo da fila", () => {
  it("escolhe a entrada 'waiting' com createdAt mais antigo", () => {
    const winner = selectFifoWinner([
      {id: "b", status: "waiting", createdAtMs: 200},
      {id: "a", status: "waiting", createdAtMs: 100},
      {id: "c", status: "waiting", createdAtMs: 300},
    ]);
    assert.equal(winner?.id, "a");
  });

  it("ignora entradas que não estão 'waiting' (já notificadas/expiradas)", () => {
    const winner = selectFifoWinner([
      {id: "old-but-notified", status: "notified", createdAtMs: 50},
      {id: "next-waiting", status: "waiting", createdAtMs: 150},
    ]);
    assert.equal(winner?.id, "next-waiting");
  });

  it("fila vazia ou só com não-waiting retorna null", () => {
    assert.equal(selectFifoWinner([]), null);
    assert.equal(
      selectFifoWinner([{id: "x", status: "expired", createdAtMs: 1}]),
      null,
    );
  });
});

describe("expiração de entradas 'notified'", () => {
  it("computeWaitlistExpiresAtMs soma a janela de 15 minutos", () => {
    const now = Date.parse("2026-07-20T10:00:00Z");
    assert.equal(
      computeWaitlistExpiresAtMs(now),
      now + WAITLIST_NOTIFY_WINDOW_MS,
    );
    assert.equal(WAITLIST_NOTIFY_WINDOW_MS, 15 * 60 * 1000);
  });

  it("isNotifiedWaitlistEntryExpired: dentro do prazo não expira", () => {
    const now = Date.parse("2026-07-20T10:10:00Z");
    const expiresAt = Date.parse("2026-07-20T10:15:00Z");
    assert.equal(isNotifiedWaitlistEntryExpired("notified", expiresAt, now), false);
  });

  it("isNotifiedWaitlistEntryExpired: após o prazo expira", () => {
    const now = Date.parse("2026-07-20T10:16:00Z");
    const expiresAt = Date.parse("2026-07-20T10:15:00Z");
    assert.equal(isNotifiedWaitlistEntryExpired("notified", expiresAt, now), true);
  });

  it("isNotifiedWaitlistEntryExpired: no limite exato conta como expirado", () => {
    const now = Date.parse("2026-07-20T10:15:00Z");
    assert.equal(isNotifiedWaitlistEntryExpired("notified", now, now), true);
  });

  it("isNotifiedWaitlistEntryExpired: status diferente de 'notified' nunca expira por aqui", () => {
    assert.equal(isNotifiedWaitlistEntryExpired("waiting", 0, Date.now()), false);
    assert.equal(isNotifiedWaitlistEntryExpired("expired", 0, Date.now()), false);
    assert.equal(isNotifiedWaitlistEntryExpired("converted", 0, Date.now()), false);
  });

  it("isNotifiedWaitlistEntryExpired: sem expiresAt registrado conta como expirado (limpeza defensiva)", () => {
    assert.equal(isNotifiedWaitlistEntryExpired("notified", null, Date.now()), true);
  });
});
