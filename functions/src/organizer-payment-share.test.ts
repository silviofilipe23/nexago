import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  bulkConfirmBlockedByPartialShare,
  organizerConfirmedShareUidsFromRegistration,
  planOrganizerShareConfirmation,
  shareRevertBlock,
} from "./organizer-payment-share";

describe("organizerConfirmedShareUidsFromRegistration", () => {
  it("volta vazio quando o campo não existe", () => {
    assert.deepEqual(organizerConfirmedShareUidsFromRegistration({}), []);
  });

  it("filtra entradas que não são string ou estão vazias", () => {
    assert.deepEqual(
      organizerConfirmedShareUidsFromRegistration({
        organizerConfirmedShareUids: ["a", "", 1, "b"],
      }),
      ["a", "b"],
    );
  });
});

describe("planOrganizerShareConfirmation", () => {
  it("dupla: confirmar o primeiro atleta não fecha o time", () => {
    const plan = planOrganizerShareConfirmation({
      athleteUids: ["a", "b"],
      data: {},
      athleteUid: "a",
      teamSize: 2,
    });
    assert.deepEqual(plan.updatedSharePaidUids, ["a"]);
    assert.equal(plan.fullyConfirmed, false);
  });

  it("dupla: confirmar o segundo atleta fecha o time", () => {
    const plan = planOrganizerShareConfirmation({
      athleteUids: ["a", "b"],
      data: {sharePaidUids: ["a"]},
      athleteUid: "b",
      teamSize: 2,
    });
    assert.deepEqual([...plan.updatedSharePaidUids].sort(), ["a", "b"]);
    assert.equal(plan.fullyConfirmed, true);
  });

  it("equipe de 3: só fecha quando o terceiro atleta confirma", () => {
    const afterTwo = planOrganizerShareConfirmation({
      athleteUids: ["a", "b", "c"],
      data: {sharePaidUids: ["a"]},
      athleteUid: "b",
      teamSize: 3,
    });
    assert.equal(afterTwo.fullyConfirmed, false);

    const afterThree = planOrganizerShareConfirmation({
      athleteUids: ["a", "b", "c"],
      data: {sharePaidUids: ["a", "b"]},
      athleteUid: "c",
      teamSize: 3,
    });
    assert.equal(afterThree.fullyConfirmed, true);
  });

  /** Clique duplicado no mesmo atleta não pode contar duas vezes nem quebrar. */
  it("confirmar o mesmo atleta de novo não duplica nem fecha sozinho", () => {
    const plan = planOrganizerShareConfirmation({
      athleteUids: ["a", "b"],
      data: {sharePaidUids: ["a"]},
      athleteUid: "a",
      teamSize: 2,
    });
    assert.deepEqual(plan.updatedSharePaidUids, ["a"]);
    assert.equal(plan.fullyConfirmed, false);
  });
});

describe("bulkConfirmBlockedByPartialShare", () => {
  /** O caso que motivou a trava: um atleta já foi confirmado individualmente — clicar no
   *  botão "confirmar a dupla inteira" por cima não pode fingir que o outro também pagou. */
  it("bloqueia quando um dos dois já foi confirmado e o outro não", () => {
    assert.equal(
      bulkConfirmBlockedByPartialShare({
        athleteUids: ["a", "b"],
        data: {sharePaidUids: ["a"]},
        teamSize: 2,
      }),
      true,
    );
  });

  it("libera quando ninguém confirmou nada ainda (baixa em bloco, ex.: dinheiro dos dois)", () => {
    assert.equal(
      bulkConfirmBlockedByPartialShare({
        athleteUids: ["a", "b"],
        data: {},
        teamSize: 2,
      }),
      false,
    );
  });

  it("libera quando todo mundo já está confirmado (nada parcial pra proteger)", () => {
    assert.equal(
      bulkConfirmBlockedByPartialShare({
        athleteUids: ["a", "b"],
        data: {sharePaidUids: ["a", "b"]},
        teamSize: 2,
      }),
      false,
    );
  });

  it("equipe de 3: bloqueia com 2 de 3 confirmados", () => {
    assert.equal(
      bulkConfirmBlockedByPartialShare({
        athleteUids: ["a", "b", "c"],
        data: {sharePaidUids: ["a", "b"]},
        teamSize: 3,
      }),
      true,
    );
  });

  /** Inscrição individual nunca é "parcial" — só tem um atleta pra confirmar. */
  it("nunca bloqueia inscrição solo", () => {
    assert.equal(
      bulkConfirmBlockedByPartialShare({
        athleteUids: ["a"],
        data: {sharePaidUids: ["a"]},
        teamSize: 2,
      }),
      false,
    );
  });
});

describe("shareRevertBlock", () => {
  it("libera quando o organizador confirmou este atleta e o time não fechou", () => {
    assert.equal(
      shareRevertBlock({isPaid: false, organizerConfirmedShareUids: ["a"]}, "a"),
      null,
    );
  });

  it("recusa quando este atleta não tem confirmação manual do organizador", () => {
    assert.equal(
      shareRevertBlock({isPaid: false, organizerConfirmedShareUids: []}, "a"),
      "notConfirmedByOrganizer",
    );
  });

  /** Time já fechou 100% pago: desfazer é a reversão da inscrição inteira, não
   *  a de um atleta isolado. */
  it("recusa quando a inscrição já fechou totalmente paga", () => {
    assert.equal(
      shareRevertBlock({isPaid: true, organizerConfirmedShareUids: ["a"]}, "a"),
      "alreadyFullyPaid",
    );
  });
});
