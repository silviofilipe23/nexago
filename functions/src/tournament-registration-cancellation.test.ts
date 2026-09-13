import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildRegistrationCancellationAudit,
  inviteMatchesCancelledRegistration,
  registrationCancellationBlockReason,
  shouldDeleteTeamOnCancellation,
  teamDeletionBlockReason,
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

describe("teamDeletionBlockReason", () => {
  // O caso-base: inscrição sem pagamento nenhum, equipe sem passado e sem
  // partida. É a única situação em que o doc de equipe é lixo de verdade.
  const base = {
    teamId: "team-1",
    referencingRegistrationIds: ["reg-1"],
    cancellingRegistrationId: "reg-1",
    registration: {isPaid: false, paidAmount: 0} as Record<string, unknown>,
    team: {} as Record<string, unknown> | null,
    teamHasMatches: false,
  };

  it("libera o delete quando nada amarra a equipe", () => {
    assert.equal(teamDeletionBlockReason(base), null);
  });

  it("solo sem teamId nunca chega a deletar", () => {
    assert.equal(teamDeletionBlockReason({...base, teamId: ""}), "noTeam");
  });

  it("outra inscrição referenciando segura a equipe", () => {
    assert.equal(
      teamDeletionBlockReason({
        ...base,
        referencingRegistrationIds: ["reg-1", "reg-2"],
      }),
      "otherRegistrations",
    );
  });

  // A regra que faltava: `organizerRemoveFromCategory` aceita inscrição PAGA
  // (calcula reembolso), e o pedido de cancelamento ao organizador só existe
  // para inscrição paga. Sem esta trava, aprovar o pedido apagava a equipe.
  it("inscrição paga segura a equipe", () => {
    assert.equal(
      teamDeletionBlockReason({...base, registration: {isPaid: true}}),
      "registrationPaid",
    );
  });

  it("parcela paga por um atleta já segura a equipe", () => {
    assert.equal(
      teamDeletionBlockReason({
        ...base,
        registration: {isPaid: false, sharePaidUids: ["u1"]},
      }),
      "registrationPaid",
    );
  });

  it("valor pago sem isPaid ainda segura a equipe", () => {
    assert.equal(
      teamDeletionBlockReason({
        ...base,
        registration: {isPaid: false, paidAmount: 50},
      }),
      "registrationPaid",
    );
  });

  // Inscrição ANTERIOR paga: o doc dela pode nem existir mais, mas o carimbo
  // `registrationPaid` fica na equipe para sempre. É a memória de que ela
  // existiu de verdade.
  it("equipe que já pagou antes nunca é apagada", () => {
    assert.equal(
      teamDeletionBlockReason({...base, team: {registrationPaid: true}}),
      "teamPaidBefore",
    );
  });

  // Chave publicada com equipe que não pagou: apagar o doc deixaria a partida
  // apontando para o nada.
  it("equipe já na chave segura, mesmo sem ter pago", () => {
    assert.equal(
      teamDeletionBlockReason({...base, teamHasMatches: true}),
      "teamHasMatches",
    );
  });

  it("equipe ausente no banco não bloqueia por passado que não existe", () => {
    assert.equal(teamDeletionBlockReason({...base, team: null}), null);
  });
});
