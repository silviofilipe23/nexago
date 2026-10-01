import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {HttpsError} from "firebase-functions/v2/https";
import {parseTournamentReviewInput} from "./tournament-review-input";

function rejects(raw: unknown, messagePart: string): void {
  assert.throws(() => parseTournamentReviewInput(raw), (error: unknown) => {
    assert.ok(error instanceof HttpsError);
    assert.equal(error.code, "invalid-argument");
    assert.match(error.message, new RegExp(messagePart));
    return true;
  });
}

describe("parseTournamentReviewInput", () => {
  it("aceita só a nota geral e normaliza o resto", () => {
    assert.deepEqual(parseTournamentReviewInput({tournamentId: " t1 ", overall: 4}), {
      tournamentId: "t1",
      overall: 4,
      aspects: {},
      comment: null,
    });
  });

  it("aceita aspectos conhecidos e ignora os nulos", () => {
    const input = parseTournamentReviewInput({
      tournamentId: "t1",
      overall: 5,
      aspects: {schedule: 2, venue: null, prizes: 5},
    });
    assert.deepEqual(input.aspects, {schedule: 2, prizes: 5});
  });

  it("recorta o comentário e transforma vazio em null", () => {
    const base = {tournamentId: "t1", overall: 3};
    assert.equal(parseTournamentReviewInput({...base, comment: "  Atrasou muito  "}).comment, "Atrasou muito");
    assert.equal(parseTournamentReviewInput({...base, comment: " \n\t "}).comment, null);
  });

  it("aceita comentário de exatamente 1000 caracteres", () => {
    const input = parseTournamentReviewInput({tournamentId: "t1", overall: 3, comment: "a".repeat(1000)});
    assert.equal(input.comment?.length, 1000);
  });

  it("recusa torneio ausente", () => {
    rejects({overall: 4}, "Torneio");
    rejects({tournamentId: "  ", overall: 4}, "Torneio");
  });

  it("recusa nota geral que não é inteiro de 1 a 5", () => {
    for (const overall of [undefined, null, 0, 6, 3.5, "5"]) {
      rejects({tournamentId: "t1", overall}, "nota geral");
    }
  });

  it("recusa aspecto desconhecido, fora de 1 a 5, ou mapa malformado", () => {
    rejects({tournamentId: "t1", overall: 4, aspects: {food: 5}}, "Aspecto desconhecido");
    rejects({tournamentId: "t1", overall: 4, aspects: {venue: 0}}, "1 a 5");
    rejects({tournamentId: "t1", overall: 4, aspects: [5]}, "aspecto");
  });

  it("recusa comentário acima de 1000 caracteres ou que não é texto", () => {
    rejects({tournamentId: "t1", overall: 4, comment: "a".repeat(1001)}, "1000");
    rejects({tournamentId: "t1", overall: 4, comment: 42}, "Comentário");
  });
});
