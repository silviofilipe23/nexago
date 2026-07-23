import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  type ArenaClubData,
  addClubParticipantCore,
  cancelClubSessionCore,
  clubBlockBookingId,
  clubSessionId,
  materializeClubSession,
  parseArenaClub,
  removeClubParticipantCore,
} from "./arena-club";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function baseClub(overrides: Partial<ArenaClubData> = {}): ArenaClubData {
  return {
    arenaId: "arena1",
    arenaName: "Arena Sol",
    name: "Clubinho de sexta",
    description: null,
    weekday: 5,
    startTime: "15:00",
    endTime: "19:00",
    courtIds: ["courtA", "courtB"],
    courtNames: ["Quadra 1", "Quadra 2"],
    capacity: 24,
    priceReais: 15,
    cancelWindowHours: 24,
    allowOnsitePayment: true,
    status: "active",
    startDate: "2026-07-01",
    endDate: null,
    skippedDates: [],
    ...overrides,
  };
}

describe("arena-club ids determinísticos", () => {
  it("sessão e bloqueio por quadra", () => {
    assert.equal(clubSessionId("c1", "2026-07-24"), "club_c1_2026-07-24");
    assert.equal(
      clubBlockBookingId("c1", "2026-07-24", "courtA"),
      "club_c1_2026-07-24_courtA",
    );
  });
});

describe("arena-club.materializeClubSession", () => {
  it("cria sessão + booking/slot/locks por quadra com snapshot da config", async () => {
    const {fake, db} = makeDb();
    const result = await materializeClubSession(db, "c1", baseClub(), "2026-07-24", "series");

    assert.equal(result.outcome, "created");
    assert.equal(result.skippedCourtIds.length, 0);

    const session = fake.store.get("arenaClubSessions/club_c1_2026-07-24")!;
    assert.equal(session["status"], "scheduled");
    assert.equal(session["capacity"], 24);
    assert.equal(session["priceReais"], 15);
    assert.equal(session["cancelWindowHours"], 24);
    assert.equal(session["confirmedCount"], 0);
    assert.equal(session["pendingCount"], 0);
    assert.deepEqual(session["blockBookingIds"], [
      "club_c1_2026-07-24_courtA",
      "club_c1_2026-07-24_courtB",
    ]);

    const booking = fake.store.get("arenaBookings/club_c1_2026-07-24_courtA")!;
    assert.equal(booking["source"], "club");
    assert.equal(booking["customerName"], "Clubinho de sexta");
    assert.equal(booking["clubSessionId"], "club_c1_2026-07-24");

    const slot = fake.store.get("arenaSlots/club_c1_2026-07-24_courtA")!;
    assert.equal(slot["status"], "booked");
    assert.equal(slot["clubName"], "Clubinho de sexta");

    // 15:00–19:00 → locks h15..h18 por quadra.
    for (const h of ["15", "16", "17", "18"]) {
      assert.ok(fake.store.has(`arenaSlotLocks/arena1_courtA_2026-07-24_h${h}`));
      assert.ok(fake.store.has(`arenaSlotLocks/arena1_courtB_2026-07-24_h${h}`));
    }
  });

  it("é idempotente (segunda chamada devolve exists)", async () => {
    const {db} = makeDb();
    await materializeClubSession(db, "c1", baseClub(), "2026-07-24", "series");
    const again = await materializeClubSession(db, "c1", baseClub(), "2026-07-24", "series");
    assert.equal(again.outcome, "exists");
  });

  it("quadra com lock conflitante é pulada; sessão sai só com as livres", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("arenaSlotLocks/arena1_courtB_2026-07-24_h16", {bookingId: "outro"});

    const result = await materializeClubSession(db, "c1", baseClub(), "2026-07-24", "series");
    assert.equal(result.outcome, "created");
    assert.deepEqual(result.skippedCourtIds, ["courtB"]);

    const session = fake.store.get("arenaClubSessions/club_c1_2026-07-24")!;
    assert.deepEqual(session["courtIds"], ["courtA"]);
    assert.deepEqual(session["skippedCourtIds"], ["courtB"]);
    assert.equal(fake.store.has("arenaBookings/club_c1_2026-07-24_courtB"), false);
  });

  it("todas as quadras em conflito → conflict e nada é criado", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("arenaSlotLocks/arena1_courtA_2026-07-24_h15", {bookingId: "x"});
    fake.seedDoc("arenaSlotLocks/arena1_courtB_2026-07-24_h18", {bookingId: "y"});

    const result = await materializeClubSession(db, "c1", baseClub(), "2026-07-24", "series");
    assert.equal(result.outcome, "conflict");
    assert.equal(fake.store.has("arenaClubSessions/club_c1_2026-07-24"), false);
  });
});

describe("arena-club.cancelClubSessionCore", () => {
  function seedCanceledScenario(fake: FakeFirestore): void {
    fake.seedDoc("arenaClubSessions/club_c1_2026-07-24", {
      clubId: "c1",
      arenaId: "arena1",
      arenaName: "Arena Sol",
      clubName: "Clubinho de sexta",
      date: "2026-07-24",
      startTime: "15:00",
      endTime: "19:00",
      status: "scheduled",
      blockBookingIds: ["club_c1_2026-07-24_courtA"],
      confirmedCount: 1,
      pendingCount: 1,
      capacity: 24,
      priceReais: 15,
      cancelWindowHours: 24,
    });
    fake.seedDoc("arenaBookings/club_c1_2026-07-24_courtA", {
      status: "active",
      courtId: "courtA",
    });
    fake.seedDoc("arenaSlots/club_c1_2026-07-24_courtA", {status: "booked"});
    fake.seedDoc("arenaSlotLocks/arena1_courtA_2026-07-24_h15", {bookingId: "b"});
    fake.seedDoc(
      "arenaClubSessions/club_c1_2026-07-24/clubParticipants/uid1",
      {
        athleteId: "uid1",
        status: "confirmed",
        asaasPaymentId: "pay_1",
        amountReais: 15,
        netReais: 14.25,
      },
    );
    fake.seedDoc(
      "arenaClubSessions/club_c1_2026-07-24/clubParticipants/uid2",
      {
        athleteId: "uid2",
        status: "pending_payment",
        asaasPaymentId: "pay_2",
        amountReais: 15,
      },
    );
    fake.seedDoc(
      "arenaClubSessions/club_c1_2026-07-24/clubParticipants/uid3",
      {
        athleteId: "uid3",
        status: "confirmed",
        paymentMethod: "onsite",
        amountReais: 15,
        netReais: 0,
      },
    );
  }

  it("cancela, libera bloqueios e faz o estorno em massa", async () => {
    const {fake, db} = makeDb();
    seedCanceledScenario(fake);
    const refunds: string[] = [];
    const deleted: string[] = [];
    const notified: string[] = [];

    const result = await cancelClubSessionCore(db, "club_c1_2026-07-24", "chuva", {
      refund: async (id) => {
        refunds.push(id);
      },
      deletePayment: async (id) => {
        deleted.push(id);
      },
      notify: async (input) => {
        notified.push(input.userId);
      },
    });

    assert.equal(result.refunded, 1);
    assert.equal(result.refundFailed, 0);
    assert.equal(result.canceledPending, 1);
    assert.equal(result.canceledOnsite, 1);
    assert.deepEqual(refunds, ["pay_1"]); // onsite (uid3) NÃO gera estorno
    assert.deepEqual(deleted, ["pay_2"]);
    assert.deepEqual(notified.sort(), ["uid1", "uid3"]);

    const onsite = fake.store.get(
      "arenaClubSessions/club_c1_2026-07-24/clubParticipants/uid3",
    )!;
    assert.equal(onsite["status"], "canceled");

    const session = fake.store.get("arenaClubSessions/club_c1_2026-07-24")!;
    assert.equal(session["status"], "canceled");
    assert.equal(session["cancelReason"], "chuva");

    const booking = fake.store.get("arenaBookings/club_c1_2026-07-24_courtA")!;
    assert.equal(booking["status"], "cancelled");
    assert.equal(fake.store.has("arenaSlots/club_c1_2026-07-24_courtA"), false);
    assert.equal(fake.store.has("arenaSlotLocks/arena1_courtA_2026-07-24_h15"), false);

    const p1 = fake.store.get(
      "arenaClubSessions/club_c1_2026-07-24/clubParticipants/uid1",
    )!;
    assert.equal(p1["status"], "canceled_by_arena_refunded");
    assert.equal(p1["refundStatus"], "done");
    const p2 = fake.store.get(
      "arenaClubSessions/club_c1_2026-07-24/clubParticipants/uid2",
    )!;
    assert.equal(p2["status"], "canceled");

    // Débito do líquido na carteira (fica negativo — sem saldo prévio).
    const wallet = fake.store.get("arenaWallets/arena1")!;
    assert.equal(wallet["availableReais"], -14.25);
  });

  it("estorno que falha mantém confirmed com refundStatus failed e re-run reprocessa", async () => {
    const {fake, db} = makeDb();
    seedCanceledScenario(fake);
    let failNext = true;

    const deps = {
      refund: async () => {
        if (failNext) throw new Error("asaas fora do ar");
      },
      deletePayment: async () => undefined,
      notify: async () => undefined,
    };

    const first = await cancelClubSessionCore(db, "club_c1_2026-07-24", null, deps);
    assert.equal(first.refundFailed, 1);
    const p1 = fake.store.get(
      "arenaClubSessions/club_c1_2026-07-24/clubParticipants/uid1",
    )!;
    assert.equal(p1["status"], "confirmed");
    assert.equal(p1["refundStatus"], "failed");

    failNext = false;
    const second = await cancelClubSessionCore(db, "club_c1_2026-07-24", null, deps);
    assert.equal(second.refunded, 1);
    const p1After = fake.store.get(
      "arenaClubSessions/club_c1_2026-07-24/clubParticipants/uid1",
    )!;
    assert.equal(p1After["status"], "canceled_by_arena_refunded");
  });
});

describe("arena-club add/remove participante (gestor)", () => {
  const SESSION = "arenaClubSessions/club_c1_2026-07-24";

  function seedSession(fake: FakeFirestore, overrides: Record<string, unknown> = {}): void {
    fake.seedDoc(SESSION, {
      clubId: "c1",
      arenaId: "arena1",
      arenaName: "Arena Sol",
      clubName: "Clubinho de sexta",
      date: "2026-07-24",
      startTime: "15:00",
      endTime: "19:00",
      status: "scheduled",
      capacity: 2,
      confirmedCount: 0,
      pendingCount: 0,
      priceReais: 15,
      blockBookingIds: [],
      ...overrides,
    });
  }

  const noDeps = {
    refund: async () => undefined,
    deletePayment: async () => undefined,
    notify: async () => undefined,
  };

  it("adiciona atleta da plataforma como confirmado onsite", async () => {
    const {fake, db} = (() => {
      const f = new FakeFirestore();
      return {fake: f, db: f as unknown as Firestore};
    })();
    seedSession(fake);
    const notified: string[] = [];

    const result = await addClubParticipantCore(db, "club_c1_2026-07-24", {
      athleteId: "uid9",
      customerName: null,
      athleteName: "Maria",
      athletePhotoUrl: null,
      addedByUid: "manager1",
    }, {...noDeps, notify: async (i) => {
      notified.push(i.userId);
    }});

    assert.equal(result.participantId, "uid9");
    const p = fake.store.get(`${SESSION}/clubParticipants/uid9`)!;
    assert.equal(p["status"], "confirmed");
    assert.equal(p["paymentMethod"], "onsite");
    assert.equal(p["addedByRole"], "arena_manager");
    assert.equal(fake.store.get(SESSION)!["confirmedCount"], 1);
    assert.deepEqual(notified, ["uid9"]);
  });

  it("adiciona convidado sem conta (guest) e respeita capacidade", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    seedSession(fake, {capacity: 1});

    const result = await addClubParticipantCore(db, "club_c1_2026-07-24", {
      athleteId: null,
      customerName: "Zé do WhatsApp",
      athleteName: "Zé do WhatsApp",
      athletePhotoUrl: null,
      addedByUid: "manager1",
    }, noDeps);
    assert.ok(result.participantId.startsWith("guest_"));
    const p = fake.store.get(`${SESSION}/clubParticipants/${result.participantId}`)!;
    assert.equal(p["athleteId"], null);
    assert.equal(p["athleteName"], "Zé do WhatsApp");

    // Lista cheia → erro
    await assert.rejects(
      addClubParticipantCore(db, "club_c1_2026-07-24", {
        athleteId: "uid2",
        customerName: null,
        athleteName: "Outro",
        athletePhotoUrl: null,
        addedByUid: "manager1",
      }, noDeps),
      /cheia/,
    );
  });

  it("converte PIX pendente do atleta em confirmado onsite (solta a cobrança)", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    seedSession(fake, {capacity: 1, pendingCount: 1});
    fake.seedDoc(`${SESSION}/clubParticipants/uid1`, {
      athleteId: "uid1",
      status: "pending_payment",
      asaasPaymentId: "pay_1",
      amountReais: 15,
    });
    const deleted: string[] = [];

    const result = await addClubParticipantCore(db, "club_c1_2026-07-24", {
      athleteId: "uid1",
      customerName: null,
      athleteName: "João",
      athletePhotoUrl: null,
      addedByUid: "manager1",
    }, {...noDeps, deletePayment: async (id) => {
      deleted.push(id);
    }});

    assert.equal(result.converted, true);
    assert.deepEqual(deleted, ["pay_1"]);
    const session = fake.store.get(SESSION)!;
    assert.equal(session["confirmedCount"], 1);
    assert.equal(session["pendingCount"], 0);
  });

  it("remove PIX confirmado com estorno + débito na carteira", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    seedSession(fake, {confirmedCount: 1});
    fake.seedDoc(`${SESSION}/clubParticipants/uid1`, {
      athleteId: "uid1",
      status: "confirmed",
      paymentMethod: "pix",
      asaasPaymentId: "pay_1",
      amountReais: 15,
      netReais: 14.25,
    });
    const refunds: string[] = [];

    const result = await removeClubParticipantCore(db, "club_c1_2026-07-24", "uid1", {
      ...noDeps,
      refund: async (id) => {
        refunds.push(id);
      },
    });

    assert.equal(result.refunded, true);
    assert.deepEqual(refunds, ["pay_1"]);
    const p = fake.store.get(`${SESSION}/clubParticipants/uid1`)!;
    assert.equal(p["status"], "canceled_by_arena_refunded");
    assert.equal(fake.store.get(SESSION)!["confirmedCount"], 0);
    assert.equal(fake.store.get("arenaWallets/arena1")!["availableReais"], -14.25);
  });

  it("remove onsite sem estorno", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    seedSession(fake, {confirmedCount: 1});
    fake.seedDoc(`${SESSION}/clubParticipants/guest_1`, {
      athleteId: null,
      status: "confirmed",
      paymentMethod: "onsite",
      amountReais: 15,
      netReais: 0,
    });

    const result = await removeClubParticipantCore(db, "club_c1_2026-07-24", "guest_1", noDeps);
    assert.equal(result.refunded, false);
    const p = fake.store.get(`${SESSION}/clubParticipants/guest_1`)!;
    assert.equal(p["status"], "canceled");
    assert.equal(fake.store.has("arenaWallets/arena1"), false);
  });
});

describe("arena-club.parseArenaClub", () => {
  it("faz parse defensivo do doc", () => {
    const club = parseArenaClub({
      arenaId: "a",
      name: "X",
      weekday: 5,
      courtIds: ["q1"],
      courtNames: ["Quadra 1"],
      capacity: 10,
      priceReais: 20,
      cancelWindowHours: 12,
      status: "active",
      startDate: "2026-01-01",
    });
    assert.equal(club.weekday, 5);
    assert.equal(club.endDate, null);
    assert.deepEqual(club.skippedDates, []);
    // Campo novo ausente em docs antigos → default aceita pagar na arena.
    assert.equal(club.allowOnsitePayment, true);
  });

  it("respeita allowOnsitePayment: false", () => {
    const club = parseArenaClub({allowOnsitePayment: false});
    assert.equal(club.allowOnsitePayment, false);
  });
});
