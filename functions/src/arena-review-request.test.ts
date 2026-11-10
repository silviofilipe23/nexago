import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  ARENA_REVIEW_REQUESTS,
  bookingEndsAt,
  bookingOwnerUid,
  reviewRequestCopy,
  reviewRequestDue,
  sendArenaReviewRequestsCore,
  type ArenaReviewRequest,
} from "./arena-review-request";

// Terça 10/11/2026 20:10 em SP (23:10 UTC).
const NOW = new Date(Date.UTC(2026, 10, 10, 23, 10, 0));

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function booking(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    arenaId: "arena1",
    arenaName: "Arena CFC",
    athleteId: "uid1",
    date: "2026-11-10",
    startTime: "19:00",
    endTime: "20:00",
    status: "active",
    ...extra,
  };
}

describe("bookingEndsAt", () => {
  it("lê o fim na parede de São Paulo", () => {
    assert.equal(bookingEndsAt(booking())?.toISOString(), "2026-11-10T23:00:00.000Z");
  });

  it("soma um dia quando a reserva cruza a meia-noite", () => {
    const end = bookingEndsAt(booking({startTime: "23:00", endTime: "01:00"}));
    assert.equal(end?.toISOString(), "2026-11-11T04:00:00.000Z");
  });

  it("null sem data ou hora utilizável", () => {
    assert.equal(bookingEndsAt(booking({date: ""})), null);
    assert.equal(bookingEndsAt(booking({endTime: "x"})), null);
  });
});

describe("bookingOwnerUid", () => {
  it("cai no campo legado bookingAthleteId", () => {
    assert.equal(bookingOwnerUid({bookingAthleteId: "legacy"}), "legacy");
  });
});

describe("reviewRequestDue", () => {
  it("pede 5 minutos depois do fim", () => {
    assert.equal(reviewRequestDue(booking(), NOW), true);
    assert.equal(reviewRequestDue(booking(), new Date(Date.UTC(2026, 10, 10, 23, 4))), false);
  });

  it("não cobra jogo de mais de 6 horas atrás", () => {
    assert.equal(reviewRequestDue(booking(), new Date(Date.UTC(2026, 10, 11, 5, 1))), false);
  });

  it("nunca pede para reserva cancelada, pendente ou sem dono", () => {
    assert.equal(reviewRequestDue(booking({status: "canceled"}), NOW), false);
    assert.equal(reviewRequestDue(booking({status: "pending_payment"}), NOW), false);
    assert.equal(reviewRequestDue(booking({athleteId: ""}), NOW), false);
    assert.equal(reviewRequestDue(booking({arenaId: ""}), NOW), false);
  });

  it("aceita os status de reserva jogada", () => {
    for (const status of ["active", "confirmed", "booked", "paid", "completed", ""]) {
      assert.equal(reviewRequestDue(booking({status}), NOW), true, status);
    }
  });
});

describe("reviewRequestCopy", () => {
  it("cita a arena e o horário", () => {
    const copy = reviewRequestCopy({
      bookingId: "b1", uid: "uid1", arenaId: "a", arenaName: "Arena CFC", startTime: "19:00",
    });
    assert.equal(copy.title, "Como foi o jogo na Arena CFC?");
    assert.match(copy.body, /reserva das 19:00/);
  });
});

describe("sendArenaReviewRequestsCore", () => {
  it("avisa o dono uma vez só por reserva", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookings/b1", booking());
    const sent: ArenaReviewRequest[] = [];
    const send = async (r: ArenaReviewRequest) => {
      sent.push(r);
    };

    const first = await sendArenaReviewRequestsCore(db(fake), NOW, send);
    const second = await sendArenaReviewRequestsCore(db(fake), NOW, send);

    assert.equal(first.sent, 1);
    assert.equal(second.sent, 0);
    assert.deepEqual(sent, [{
      bookingId: "b1", uid: "uid1", arenaId: "arena1", arenaName: "Arena CFC", startTime: "19:00",
    }]);
    assert.ok(fake.store.has(`${ARENA_REVIEW_REQUESTS}/b1`));
  });

  it("pula quem já avaliou a reserva", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookings/b1", booking());
    fake.seedDoc("arena_reviews/r1", {bookingId: "b1", userId: "uid1", rating: 5});
    const result = await sendArenaReviewRequestsCore(db(fake), NOW, async () => {
      throw new Error("não devia avisar");
    });
    assert.deepEqual(result, {sent: 0, skipped: 1});
  });

  it("libera a trava quando o envio falha, para a próxima rodada tentar", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookings/b1", booking());
    const result = await sendArenaReviewRequestsCore(db(fake), NOW, async () => {
      throw new Error("fcm fora");
    });
    assert.equal(result.sent, 0);
    assert.equal(fake.store.has(`${ARENA_REVIEW_REQUESTS}/b1`), false);
  });

  it("ignora reservas de outros dias e ainda em andamento", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenaBookings/old", booking({date: "2026-11-08"}));
    fake.seedDoc("arenaBookings/live", booking({startTime: "20:00", endTime: "21:00"}));
    const result = await sendArenaReviewRequestsCore(db(fake), NOW, async () => undefined);
    assert.equal(result.sent, 0);
  });
});
