import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  BOOKING_MAX_PLAYERS,
  bookingWhenLabel,
  bookingWindowMs,
  cancelArenaBookingInviteCore,
  closeInvitesOfCanceledBookingCore,
  getArenaBookingInviteLinkCore,
  inviteArenaBookingPlayersCore,
  leaveArenaBookingCore,
  participantsOf,
  respondArenaBookingInviteCore,
  sanitizeInviteeUids,
} from "./arena-booking-invite";

const db = (f: FakeFirestore) => f as unknown as Firestore;

/** Sábado 24/10/2026, 10h em SP — o jogo é às 19h do mesmo dia. */
const NOW = Date.parse("2026-10-24T10:00:00-03:00");
const AFTER_END = Date.parse("2026-10-24T20:30:00-03:00");

async function assertHttpsError(p: Promise<unknown>, code: string, message?: RegExp) {
  await assert.rejects(p, (e: {code?: string; message?: string}) => {
    assert.equal(e.code, code);
    if (message) assert.match(e.message ?? "", message);
    return true;
  });
}

function booking(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    athleteId: "owner",
    arenaId: "arena1",
    arenaName: "Arena Sol",
    courtId: "c1",
    courtName: "Quadra 2",
    date: "2026-10-24",
    startTime: "19:00",
    endTime: "20:00",
    status: "confirmed",
    sport: "beachTennis",
    ...extra,
  };
}

function seed(extra: Record<string, unknown> = {}): FakeFirestore {
  const fake = new FakeFirestore();
  fake.seedDoc("arenaBookings/b1", booking(extra));
  fake.seedDoc("public_profiles/owner", {fullName: "Dono Silva"});
  fake.seedDoc("public_profiles/ana", {fullName: "Ana Lima", profilePhotoUrl: "https://x/ana.jpg"});
  fake.seedDoc("public_profiles/bia", {fullName: "Bia Souza"});
  fake.seedDoc("public_profiles/caio", {fullName: "Caio Reis"});
  fake.seedDoc("public_profiles/duda", {fullName: "Duda Melo"});
  return fake;
}

function participant(uid: string, name: string) {
  return {uid, name, via: "direct", joinedAt: Timestamp.fromMillis(NOW - 1000)};
}

describe("regras puras", () => {
  it("janela da reserva em SP, com virada de dia", () => {
    const w = bookingWindowMs(booking());
    assert.deepEqual(w, {
      startMs: Date.parse("2026-10-24T19:00:00-03:00"),
      endMs: Date.parse("2026-10-24T20:00:00-03:00"),
    });
    const late = bookingWindowMs(booking({startTime: "23:00", endTime: "00:00"}));
    assert.equal(late?.endMs, Date.parse("2026-10-25T00:00:00-03:00"));
    assert.equal(bookingWindowMs(booking({date: ""})), null);
  });

  it("rótulo do horário em português", () => {
    assert.equal(bookingWhenLabel(booking()), "sáb, 24/10 às 19:00");
    assert.equal(bookingWhenLabel(booking({startTime: ""})), "sáb, 24/10");
  });

  it("lista de convidados: dedupe, sem o dono, no máximo 10", () => {
    assert.deepEqual(sanitizeInviteeUids(["ana", " ana ", "bia"], "owner"), ["ana", "bia"]);
    assert.throws(() => sanitizeInviteeUids([], "owner"), {code: "invalid-argument"});
    assert.throws(() => sanitizeInviteeUids(["owner"], "owner"), {code: "invalid-argument"});
    assert.throws(
      () => sanitizeInviteeUids(Array.from({length: 11}, (_, i) => `u${i}`), "owner"),
      {code: "invalid-argument"},
    );
  });

  it("participantes ignoram entradas sem uid e repetidas", () => {
    const list = participantsOf({participants: [
      participant("ana", "Ana"), {name: "Sem uid"}, participant("ana", "Ana de novo"), "bia",
    ]});
    assert.deepEqual(list.map((p) => p.uid), ["ana"]);
  });
});

describe("inviteArenaBookingPlayersCore", () => {
  it("cria um convite pendente por atleta e avisa cada um", async () => {
    const fake = seed();
    const result = await inviteArenaBookingPlayersCore(
      db(fake), "owner", {bookingId: "b1", inviteeUids: ["ana", "bia"]}, NOW);

    assert.deepEqual(result.invited.map((i) => i.inviteId), ["b1_ana", "b1_bia"]);
    const invite = fake.store.get("bookingInvites/b1_ana");
    assert.equal(invite?.status, "pending");
    assert.equal(invite?.kind, "direct");
    assert.equal(invite?.inviteeUid, "ana");
    assert.equal(invite?.inviteeName, "Ana Lima");
    assert.equal(invite?.invitedByName, "Dono Silva");
    assert.equal(invite?.arenaName, "Arena Sol");
    assert.equal(
      (invite?.expiresAt as Timestamp).toMillis(),
      Date.parse("2026-10-24T20:00:00-03:00"),
    );

    assert.equal(result.notifications.length, 2);
    const push = result.notifications[0];
    assert.equal(push.userId, "ana");
    assert.equal(push.type, "booking_invite");
    assert.equal(push.data.url, "/convite/b1_ana");
    assert.match(push.body, /Dono Silva te chamou para jogar na Arena Sol · sáb, 24\/10 às 19:00/);
  });

  it("só o dono convida", async () => {
    await assertHttpsError(
      inviteArenaBookingPlayersCore(db(seed()), "ana", {bookingId: "b1", inviteeUids: ["bia"]}, NOW),
      "permission-denied",
    );
  });

  it("recusa reserva aguardando PIX, cancelada ou já encerrada", async () => {
    await assertHttpsError(
      inviteArenaBookingPlayersCore(db(seed({status: "pending_payment"})), "owner",
        {bookingId: "b1", inviteeUids: ["ana"]}, NOW),
      "failed-precondition", /pagamento/,
    );
    await assertHttpsError(
      inviteArenaBookingPlayersCore(db(seed({status: "cancelled"})), "owner",
        {bookingId: "b1", inviteeUids: ["ana"]}, NOW),
      "failed-precondition", /cancelada/,
    );
    await assertHttpsError(
      inviteArenaBookingPlayersCore(db(seed()), "owner",
        {bookingId: "b1", inviteeUids: ["ana"]}, AFTER_END),
      "failed-precondition", /terminou/,
    );
  });

  it("quadra completa não aceita convite", async () => {
    const fake = seed({participants: [
      participant("ana", "Ana"), participant("bia", "Bia"), participant("caio", "Caio"),
    ]});
    await assertHttpsError(
      inviteArenaBookingPlayersCore(db(fake), "owner", {bookingId: "b1", inviteeUids: ["duda"]}, NOW),
      "failed-precondition", /completa/,
    );
  });

  it("pula quem já joga ou já tem convite pendente", async () => {
    const fake = seed({participants: [participant("ana", "Ana")]});
    fake.seedDoc("bookingInvites/b1_bia", {bookingId: "b1", inviteeUid: "bia", status: "pending"});
    const result = await inviteArenaBookingPlayersCore(
      db(fake), "owner", {bookingId: "b1", inviteeUids: ["ana", "bia", "caio"]}, NOW);
    assert.deepEqual(result.invited.map((i) => i.uid), ["caio"]);
    assert.deepEqual(result.skipped, [
      {uid: "ana", reason: "participant"},
      {uid: "bia", reason: "pending"},
    ]);
    assert.equal(result.notifications.length, 1);
  });

  it("reconvidar quem recusou reabre o mesmo doc, sem a resposta antiga", async () => {
    const fake = seed();
    fake.seedDoc("bookingInvites/b1_ana", {
      bookingId: "b1", inviteeUid: "ana", status: "declined", respondedAt: Timestamp.fromMillis(1),
    });
    await inviteArenaBookingPlayersCore(db(fake), "owner", {bookingId: "b1", inviteeUids: ["ana"]}, NOW);
    const invite = fake.store.get("bookingInvites/b1_ana");
    assert.equal(invite?.status, "pending");
    assert.equal(invite?.respondedAt, undefined);
  });

  it("atleta inexistente", async () => {
    await assertHttpsError(
      inviteArenaBookingPlayersCore(db(seed()), "owner", {bookingId: "b1", inviteeUids: ["ghost"]}, NOW),
      "not-found",
    );
  });
});

describe("getArenaBookingInviteLinkCore", () => {
  it("cria o link aberto e o reaproveita", async () => {
    const fake = seed();
    const first = await getArenaBookingInviteLinkCore(db(fake), "owner", {bookingId: "b1"}, NOW);
    assert.equal(first.inviteId, "link_b1");
    const link = fake.store.get("bookingInvites/link_b1");
    assert.equal(link?.status, "open");
    assert.equal(link?.kind, "link");
    assert.equal(link?.inviteeUid, undefined);
    const createdAt = link?.createdAt as Timestamp;

    const second = await getArenaBookingInviteLinkCore(db(fake), "owner", {bookingId: "b1"}, NOW + 5000);
    assert.equal(second.inviteId, "link_b1");
    assert.equal((fake.store.get("bookingInvites/link_b1")?.createdAt as Timestamp).toMillis(),
      createdAt.toMillis());
  });

  it("só o dono gera o link", async () => {
    await assertHttpsError(
      getArenaBookingInviteLinkCore(db(seed()), "ana", {bookingId: "b1"}, NOW),
      "permission-denied",
    );
  });
});

describe("respondArenaBookingInviteCore", () => {
  async function invited(fake: FakeFirestore, uids: string[]) {
    await inviteArenaBookingPlayersCore(db(fake), "owner", {bookingId: "b1", inviteeUids: uids}, NOW);
  }

  it("aceite do convite direto entra na reserva e avisa o dono", async () => {
    const fake = seed();
    await invited(fake, ["ana"]);
    const result = await respondArenaBookingInviteCore(
      db(fake), "ana", {inviteId: "b1_ana", accept: true}, NOW);

    assert.equal(result.status, "accepted");
    assert.equal(result.inviteId, "b1_ana");
    assert.equal(result.ownerUid, "owner");
    const b = fake.store.get("arenaBookings/b1");
    assert.deepEqual(b?.participantUids, ["ana"]);
    assert.equal(b?.confirmedParticipants, 2);
    const [p] = b?.participants as Array<Record<string, unknown>>;
    assert.equal(p.name, "Ana Lima");
    assert.equal(p.avatarUrl, "https://x/ana.jpg");
    assert.equal(p.via, "direct");

    const invite = fake.store.get("bookingInvites/b1_ana");
    assert.equal(invite?.status, "accepted");
    assert.equal(invite?.acceptedByUid, "ana");

    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0].userId, "owner");
    assert.equal(result.notifications[0].type, "booking_invite_accepted");
    assert.match(result.notifications[0].body, /2\/4 jogadores/);
  });

  it("convite direto é só do convidado", async () => {
    const fake = seed();
    await invited(fake, ["ana"]);
    await assertHttpsError(
      respondArenaBookingInviteCore(db(fake), "bia", {inviteId: "b1_ana", accept: true}, NOW),
      "permission-denied",
    );
  });

  it("recusa marca o convite e avisa o dono", async () => {
    const fake = seed();
    await invited(fake, ["ana"]);
    const result = await respondArenaBookingInviteCore(
      db(fake), "ana", {inviteId: "b1_ana", accept: false}, NOW);
    assert.equal(result.status, "declined");
    assert.equal(fake.store.get("bookingInvites/b1_ana")?.status, "declined");
    assert.equal(fake.store.get("arenaBookings/b1")?.participants, undefined);
    assert.equal(result.notifications[0].type, "booking_invite_declined");

    await assertHttpsError(
      respondArenaBookingInviteCore(db(fake), "ana", {inviteId: "b1_ana", accept: true}, NOW),
      "failed-precondition", /recusou/,
    );
  });

  it("aceitar de novo é idempotente", async () => {
    const fake = seed();
    await invited(fake, ["ana"]);
    await respondArenaBookingInviteCore(db(fake), "ana", {inviteId: "b1_ana", accept: true}, NOW);
    const again = await respondArenaBookingInviteCore(
      db(fake), "ana", {inviteId: "b1_ana", accept: true}, NOW);
    assert.equal(again.status, "already");
    assert.equal(again.notifications.length, 0);
    assert.equal(fake.store.get("arenaBookings/b1")?.confirmedParticipants, 2);
  });

  it("quem aceita primeiro fica com a vaga", async () => {
    const fake = seed({participants: [participant("bia", "Bia"), participant("caio", "Caio")]});
    await invited(fake, ["ana", "duda"]);
    await respondArenaBookingInviteCore(db(fake), "ana", {inviteId: "b1_ana", accept: true}, NOW);
    assert.equal(fake.store.get("arenaBookings/b1")?.confirmedParticipants, BOOKING_MAX_PLAYERS);
    await assertHttpsError(
      respondArenaBookingInviteCore(db(fake), "duda", {inviteId: "b1_duda", accept: true}, NOW),
      "failed-precondition", /completa/,
    );
    assert.equal(fake.store.get("bookingInvites/b1_duda")?.status, "pending");
  });

  it("reserva cancelada ou encerrada bloqueia o aceite", async () => {
    const fake = seed();
    await invited(fake, ["ana", "bia"]);
    await assertHttpsError(
      respondArenaBookingInviteCore(db(fake), "ana", {inviteId: "b1_ana", accept: true}, AFTER_END),
      "failed-precondition", /terminou/,
    );
    fake.store.set("arenaBookings/b1", booking({status: "canceled"}));
    await assertHttpsError(
      respondArenaBookingInviteCore(db(fake), "bia", {inviteId: "b1_bia", accept: true}, NOW),
      "failed-precondition", /cancelada/,
    );
  });

  it("link: qualquer atleta entra, ganha doc próprio e não entra duas vezes", async () => {
    const fake = seed();
    await getArenaBookingInviteLinkCore(db(fake), "owner", {bookingId: "b1"}, NOW);
    const result = await respondArenaBookingInviteCore(
      db(fake), "bia", {inviteId: "link_b1", accept: true}, NOW);

    assert.equal(result.status, "accepted");
    assert.equal(result.inviteId, "b1_bia");
    const own = fake.store.get("bookingInvites/b1_bia");
    assert.equal(own?.kind, "link");
    assert.equal(own?.status, "accepted");
    assert.equal(own?.acceptedByUid, "bia");
    assert.equal(own?.inviteeUid, "bia");
    assert.equal(own?.invitedByUid, "owner");
    assert.equal(fake.store.get("bookingInvites/link_b1")?.status, "open");
    const p = (fake.store.get("arenaBookings/b1")?.participants as Array<Record<string, unknown>>)[0];
    assert.equal(p.via, "link");

    const again = await respondArenaBookingInviteCore(
      db(fake), "bia", {inviteId: "link_b1", accept: true}, NOW);
    assert.equal(again.status, "already");
    assert.equal(fake.store.get("arenaBookings/b1")?.confirmedParticipants, 2);
  });

  it("link: entrar com convite direto pendente aproveita o mesmo doc", async () => {
    const fake = seed();
    await invited(fake, ["ana"]);
    await getArenaBookingInviteLinkCore(db(fake), "owner", {bookingId: "b1"}, NOW);
    await respondArenaBookingInviteCore(db(fake), "ana", {inviteId: "link_b1", accept: true}, NOW);
    assert.equal(fake.store.get("bookingInvites/b1_ana")?.status, "accepted");
    const direct = await respondArenaBookingInviteCore(
      db(fake), "ana", {inviteId: "b1_ana", accept: true}, NOW);
    assert.equal(direct.status, "already");
  });

  it("link: o dono não entra no próprio jogo; recusar só fecha", async () => {
    const fake = seed();
    await getArenaBookingInviteLinkCore(db(fake), "owner", {bookingId: "b1"}, NOW);
    await assertHttpsError(
      respondArenaBookingInviteCore(db(fake), "owner", {inviteId: "link_b1", accept: true}, NOW),
      "failed-precondition",
    );
    const dismissed = await respondArenaBookingInviteCore(
      db(fake), "bia", {inviteId: "link_b1", accept: false}, NOW);
    assert.equal(dismissed.status, "dismissed");
    assert.equal(fake.store.has("bookingInvites/b1_bia"), false);
  });

  it("link encerrado não aceita mais", async () => {
    const fake = seed();
    await getArenaBookingInviteLinkCore(db(fake), "owner", {bookingId: "b1"}, NOW);
    fake.store.set("bookingInvites/link_b1", {
      ...fake.store.get("bookingInvites/link_b1"), status: "canceled",
    });
    await assertHttpsError(
      respondArenaBookingInviteCore(db(fake), "bia", {inviteId: "link_b1", accept: true}, NOW),
      "failed-precondition", /link/,
    );
  });

  it("resposta precisa ser booleana", async () => {
    await assertHttpsError(
      respondArenaBookingInviteCore(db(seed()), "ana",
        {inviteId: "b1_ana", accept: "sim" as unknown as boolean}, NOW),
      "invalid-argument",
    );
  });
});

describe("leaveArenaBookingCore", () => {
  async function withAna(): Promise<FakeFirestore> {
    const fake = seed();
    await inviteArenaBookingPlayersCore(db(fake), "owner", {bookingId: "b1", inviteeUids: ["ana"]}, NOW);
    await respondArenaBookingInviteCore(db(fake), "ana", {inviteId: "b1_ana", accept: true}, NOW);
    return fake;
  }

  it("convidado sai: a vaga reabre e o dono é avisado", async () => {
    const fake = await withAna();
    const result = await leaveArenaBookingCore(db(fake), "ana", {bookingId: "b1"}, NOW);
    assert.equal(result.removed, true);
    const b = fake.store.get("arenaBookings/b1");
    assert.deepEqual(b?.participantUids, []);
    assert.equal(b?.confirmedParticipants, 1);
    assert.equal(fake.store.get("bookingInvites/b1_ana")?.status, "left");
    assert.equal(result.notifications[0].userId, "owner");
    assert.equal(result.notifications[0].type, "booking_participant_left");
  });

  it("dono remove um convidado e ele é avisado", async () => {
    const fake = await withAna();
    const result = await leaveArenaBookingCore(
      db(fake), "owner", {bookingId: "b1", participantUid: "ana"}, NOW);
    assert.equal(result.removed, true);
    assert.equal(fake.store.get("bookingInvites/b1_ana")?.status, "removed");
    assert.equal(result.notifications[0].userId, "ana");
    assert.equal(result.notifications[0].type, "booking_participant_removed");
    assert.match(result.notifications[0].body, /Dono Silva tirou você/);
  });

  it("só o dono remove outra pessoa; o dono não 'sai' da própria reserva", async () => {
    const fake = await withAna();
    await assertHttpsError(
      leaveArenaBookingCore(db(fake), "bia", {bookingId: "b1", participantUid: "ana"}, NOW),
      "permission-denied",
    );
    await assertHttpsError(
      leaveArenaBookingCore(db(fake), "owner", {bookingId: "b1"}, NOW),
      "failed-precondition",
    );
  });

  it("quem não está na lista não muda nada", async () => {
    const fake = await withAna();
    const result = await leaveArenaBookingCore(db(fake), "bia", {bookingId: "b1"}, NOW);
    assert.equal(result.removed, false);
    assert.equal(result.notifications.length, 0);
    assert.equal(fake.store.get("arenaBookings/b1")?.confirmedParticipants, 2);
  });
});

describe("cancelArenaBookingInviteCore", () => {
  it("dono cancela convite pendente; respondido não cancela", async () => {
    const fake = seed();
    await inviteArenaBookingPlayersCore(
      db(fake), "owner", {bookingId: "b1", inviteeUids: ["ana", "bia"]}, NOW);
    assert.deepEqual(
      await cancelArenaBookingInviteCore(db(fake), "owner", {inviteId: "b1_ana"}, NOW),
      {canceled: true},
    );
    assert.equal(fake.store.get("bookingInvites/b1_ana")?.status, "canceled");
    await assertHttpsError(
      respondArenaBookingInviteCore(db(fake), "ana", {inviteId: "b1_ana", accept: true}, NOW),
      "failed-precondition", /cancelado/,
    );

    await respondArenaBookingInviteCore(db(fake), "bia", {inviteId: "b1_bia", accept: false}, NOW);
    await assertHttpsError(
      cancelArenaBookingInviteCore(db(fake), "owner", {inviteId: "b1_bia"}, NOW),
      "failed-precondition",
    );
  });

  it("só quem convidou cancela", async () => {
    const fake = seed();
    await inviteArenaBookingPlayersCore(db(fake), "owner", {bookingId: "b1", inviteeUids: ["ana"]}, NOW);
    await assertHttpsError(
      cancelArenaBookingInviteCore(db(fake), "ana", {inviteId: "b1_ana"}, NOW),
      "permission-denied",
    );
  });
});

describe("closeInvitesOfCanceledBookingCore", () => {
  it("encerra pendentes e o link e avisa só quem ia jogar", async () => {
    const fake = seed({participants: [participant("caio", "Caio")]});
    await inviteArenaBookingPlayersCore(db(fake), "owner", {bookingId: "b1", inviteeUids: ["ana"]}, NOW);
    await getArenaBookingInviteLinkCore(db(fake), "owner", {bookingId: "b1"}, NOW);
    fake.seedDoc("bookingInvites/b1_caio", {bookingId: "b1", inviteeUid: "caio", status: "accepted"});

    const canceled = {...fake.store.get("arenaBookings/b1"), status: "canceled"};
    const notifications = await closeInvitesOfCanceledBookingCore(db(fake), "b1", canceled, NOW);

    assert.equal(fake.store.get("bookingInvites/b1_ana")?.status, "canceled");
    assert.equal(fake.store.get("bookingInvites/link_b1")?.status, "canceled");
    assert.equal(fake.store.get("bookingInvites/b1_caio")?.status, "accepted");
    assert.deepEqual(notifications.map((n) => n.userId), ["caio"]);
    assert.equal(notifications[0].type, "booking_canceled_participant");
    assert.equal(notifications[0].data.url, "/discover?tab=agenda");
  });
});
