import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  athleteAlreadyRegistered,
  isTeamCompleteForBracket,
  resolvePartnerRegistrationPlan,
  type InviterCategoryRegistration,
} from "./tournament-solo-registration";
import {parseCategoryRegistration} from "./tournament-pair-uniqueness";

function reg(
  over: Partial<InviterCategoryRegistration>,
): InviterCategoryRegistration {
  return {
    registrationId: "r1",
    teamId: "t1",
    isPlayer1: false,
    isMember: false,
    partnerPending: false,
    ...over,
  };
}

/** Reserva solo (sem equipe): `player1Id` é o dono e `partnerPending` está ativo. */
function solo(
  registrationId: string,
  ownerUid: string,
  over: Record<string, unknown> = {},
) {
  return parseCategoryRegistration(
    registrationId,
    {
      player1Id: ownerUid,
      participantUids: [ownerUid],
      partnerPending: true,
      isPaid: false,
      ...over,
    },
    null,
  );
}

/** Dupla fechada. */
function pair(registrationId: string, a: string, b: string) {
  return parseCategoryRegistration(
    registrationId,
    {teamId: "t-" + registrationId, participantUids: [a, b], partnerPending: false},
    {player1Id: a, player2Id: b},
  );
}

describe("tournament-solo-registration", () => {
  it("athleteAlreadyRegistered reflects membership", () => {
    assert.equal(athleteAlreadyRegistered([]), false);
    assert.equal(athleteAlreadyRegistered([reg({isMember: true})]), true);
  });

  it("isTeamCompleteForBracket requires both players", () => {
    assert.equal(
      isTeamCompleteForBracket({player1Id: "a", player2Id: "b"}),
      true,
    );
    assert.equal(isTeamCompleteForBracket({player1Id: "a", player2Id: ""}), false);
    assert.equal(isTeamCompleteForBracket({player1Id: "a"}), false);
  });
});

describe("resolvePartnerRegistrationPlan", () => {
  it("cria inscrição quando nenhum dos dois tem reserva", () => {
    assert.deepEqual(resolvePartnerRegistrationPlan([], "a", "b"), {
      kind: "create",
    });
  });

  it("anexa à reserva solo do convidante (sem liberar nada)", () => {
    const plan = resolvePartnerRegistrationPlan([solo("s-a", "a")], "a", "b");
    assert.deepEqual(plan, {
      kind: "attach",
      registrationId: "s-a",
      teamId: "",
      releaseRegistrationId: "",
    });
  });

  it("anexa à reserva solo do CONVIDADO quando o convidante não tem inscrição", () => {
    const plan = resolvePartnerRegistrationPlan([solo("s-b", "b")], "a", "b");
    assert.deepEqual(plan, {
      kind: "attach",
      registrationId: "s-b",
      teamId: "",
      releaseRegistrationId: "",
    });
  });

  it("funde duas reservas solo: mantém a do convidante e libera a do convidado", () => {
    const plan = resolvePartnerRegistrationPlan(
      [solo("s-a", "a"), solo("s-b", "b")],
      "a",
      "b",
    );
    assert.deepEqual(plan, {
      kind: "attach",
      registrationId: "s-a",
      teamId: "",
      releaseRegistrationId: "s-b",
    });
  });

  it("na fusão, a reserva PAGA sobrevive mesmo sendo a do convidado", () => {
    const plan = resolvePartnerRegistrationPlan(
      [solo("s-a", "a"), solo("s-b", "b", {isPaid: true})],
      "a",
      "b",
    );
    assert.equal(plan.kind, "attach");
    assert.deepEqual(plan, {
      kind: "attach",
      registrationId: "s-b",
      teamId: "",
      releaseRegistrationId: "s-a",
    });
  });

  it("bloqueia a fusão quando as duas reservas já foram pagas", () => {
    const plan = resolvePartnerRegistrationPlan(
      [solo("s-a", "a", {isPaid: true}), solo("s-b", "b", {isPaid: true})],
      "a",
      "b",
    );
    assert.deepEqual(plan, {kind: "blocked", reason: "bothPaid"});
  });

  it("na fusão, a reserva fora da fila de espera sobrevive", () => {
    const plan = resolvePartnerRegistrationPlan(
      [solo("s-a", "a", {waitlist: true}), solo("s-b", "b")],
      "a",
      "b",
    );
    assert.equal(
      (plan as {registrationId?: string}).registrationId,
      "s-b",
      "reserva na fila não deve arrastar a dupla para a fila",
    );
  });

  it("na fusão com empate, sobrevive a reserva mais antiga", () => {
    const plan = resolvePartnerRegistrationPlan(
      [
        solo("s-a", "a", {createdAt: 2_000}),
        solo("s-b", "b", {createdAt: 1_000}),
      ],
      "a",
      "b",
    );
    assert.equal((plan as {registrationId?: string}).registrationId, "s-b");
  });

  it("bloqueia quando o convidante já tem dupla fechada", () => {
    const plan = resolvePartnerRegistrationPlan([pair("r1", "a", "c")], "a", "b");
    assert.deepEqual(plan, {kind: "blocked", reason: "inviter"});
  });

  it("bloqueia quando o convidado já tem dupla fechada", () => {
    const plan = resolvePartnerRegistrationPlan([pair("r1", "c", "b")], "a", "b");
    assert.deepEqual(plan, {kind: "blocked", reason: "invitee"});
  });

  it("bloqueia quando a dupla dos dois já existe", () => {
    const plan = resolvePartnerRegistrationPlan([pair("r1", "b", "a")], "a", "b");
    assert.deepEqual(plan, {kind: "blocked", reason: "pair"});
  });

  it("ignora inscrições de terceiros", () => {
    const plan = resolvePartnerRegistrationPlan(
      [pair("r1", "c", "d"), solo("s-c", "c")],
      "a",
      "b",
    );
    assert.deepEqual(plan, {kind: "create"});
  });

  it("bloqueia inscrição incompleta legada sem dono identificável", () => {
    // Solo legado: equipe com player2 vazio e sem player1Id na inscrição.
    const legacy = parseCategoryRegistration(
      "legacy-1",
      {teamId: "t9", partnerPending: true, participantUids: ["b"]},
      null,
    );
    const plan = resolvePartnerRegistrationPlan([legacy], "a", "b");
    assert.deepEqual(plan, {kind: "blocked", reason: "invitee"});
  });
});
