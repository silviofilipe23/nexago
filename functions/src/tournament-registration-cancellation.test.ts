import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildRegistrationCancellationAudit,
  inviteMatchesCancelledRegistration,
  registrationCancellationBlockReason,
  shouldDeleteTeamOnCancellation,
} from "./tournament-registration-cancellation";

describe("registrationCancellationBlockReason", () => {
  it("permite cancelar inscrição sem nenhum pagamento", () => {
    assert.equal(
      registrationCancellationBlockReason({isPaid: false, paidAmount: 0}),
      null,
    );
  });

  it("permite quando sharePaidUids existe mas só tem strings vazias", () => {
    assert.equal(
      registrationCancellationBlockReason({
        isPaid: false,
        paidAmount: 0,
        sharePaidUids: ["", "  "],
      }),
      null,
    );
  });

  it("bloqueia inscrição confirmada (isPaid)", () => {
    assert.equal(
      registrationCancellationBlockReason({isPaid: true}),
      "paid",
    );
  });

  it("bloqueia dupla meio-paga (sharePaidUids)", () => {
    assert.equal(
      registrationCancellationBlockReason({
        isPaid: false,
        sharePaidUids: ["uid-pagador"],
      }),
      "partialPayment",
    );
  });

  it("bloqueia quando há valor pago mesmo sem sharePaidUids", () => {
    assert.equal(
      registrationCancellationBlockReason({isPaid: false, paidAmount: 40}),
      "partialPayment",
    );
  });
});

describe("shouldDeleteTeamOnCancellation", () => {
  it("inscrição solo (sem teamId) não tenta deletar equipe", () => {
    assert.equal(shouldDeleteTeamOnCancellation("", ["reg-1"], "reg-1"), false);
    assert.equal(shouldDeleteTeamOnCancellation("  ", [], "reg-1"), false);
  });

  it("deleta a equipe quando só a própria inscrição a referencia", () => {
    assert.equal(
      shouldDeleteTeamOnCancellation("team-1", ["reg-1"], "reg-1"),
      true,
    );
    assert.equal(shouldDeleteTeamOnCancellation("team-1", [], "reg-1"), true);
  });

  it("preserva a equipe referenciada por outra inscrição", () => {
    assert.equal(
      shouldDeleteTeamOnCancellation("team-1", ["reg-1", "reg-2"], "reg-1"),
      false,
    );
  });
});

describe("inviteMatchesCancelledRegistration", () => {
  const params = {
    registrationId: "reg-1",
    cancellerUid: "uid-a",
    categoryId: "Mista C",
  };

  it("convite anexado à inscrição cancelada conta", () => {
    assert.equal(
      inviteMatchesCancelledRegistration(
        {attachRegistrationId: "reg-1", inviterUid: "uid-x", categoryId: "Outra"},
        params,
      ),
      true,
    );
  });

  it("convite anexado a OUTRA inscrição não conta", () => {
    assert.equal(
      inviteMatchesCancelledRegistration(
        {attachRegistrationId: "reg-2", inviterUid: "uid-a", categoryId: "Mista C"},
        params,
      ),
      false,
    );
  });

  it("convite avulso do cancelador na mesma categoria conta", () => {
    assert.equal(
      inviteMatchesCancelledRegistration(
        {inviterUid: "uid-a", categoryId: "Mista C"},
        params,
      ),
      true,
    );
  });

  it("convite avulso de outro atleta ou de outra categoria não conta", () => {
    assert.equal(
      inviteMatchesCancelledRegistration(
        {inviterUid: "uid-b", categoryId: "Mista C"},
        params,
      ),
      false,
    );
    assert.equal(
      inviteMatchesCancelledRegistration(
        {inviterUid: "uid-a", categoryId: "Mista B"},
        params,
      ),
      false,
    );
  });
});

describe("buildRegistrationCancellationAudit", () => {
  it("registra quem cancelou, os atletas e o snapshot completo", () => {
    const registration = {
      tournamentId: " t-1 ",
      categoryId: "Mista C",
      isPaid: false,
      partnerPending: true,
      player1Id: "uid-a",
    };
    const audit = buildRegistrationCancellationAudit({
      registrationId: "reg-1",
      cancelledBy: "uid-a",
      athleteUids: ["uid-a", "uid-b"],
      registration,
    });
    assert.equal(audit.registrationId, "reg-1");
    assert.equal(audit.tournamentId, "t-1");
    assert.equal(audit.categoryId, "Mista C");
    assert.equal(audit.cancelledBy, "uid-a");
    assert.deepEqual(audit.participantUids, ["uid-a", "uid-b"]);
    assert.deepEqual(audit.registrationSnapshot, registration);
  });
});
