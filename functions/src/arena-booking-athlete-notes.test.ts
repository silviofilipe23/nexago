import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {HttpsError} from "firebase-functions/v2/https";
import {ATHLETE_NOTES_MAX_LENGTH, parseAthleteNotes} from "./arena-booking-athlete-notes";

function rejectsInvalid(raw: unknown, pattern: RegExp) {
  assert.throws(() => parseAthleteNotes(raw), (error: unknown) => {
    assert.ok(error instanceof HttpsError);
    assert.equal(error.code, "invalid-argument");
    assert.match(error.message, pattern);
    return true;
  });
}

describe("parseAthleteNotes", () => {
  it("sem recado (app antigo ou campo vazio) → null", () => {
    assert.equal(parseAthleteNotes(undefined), null);
    assert.equal(parseAthleteNotes(null), null);
    assert.equal(parseAthleteNotes(""), null);
    assert.equal(parseAthleteNotes("   \n  "), null);
  });

  it("apara as pontas e mantém as quebras de linha do meio", () => {
    assert.equal(
      parseAthleteNotes("  Vamos chegar 10 min antes.\nPrecisamos de bola.  "),
      "Vamos chegar 10 min antes.\nPrecisamos de bola.",
    );
  });

  it(`aceita exatamente ${ATHLETE_NOTES_MAX_LENGTH} caracteres`, () => {
    const text = "a".repeat(ATHLETE_NOTES_MAX_LENGTH);
    assert.equal(parseAthleteNotes(text), text);
  });

  it("emoji conta como 1 caractere, igual ao contador do app", () => {
    const text = "👨‍👩‍👧".repeat(ATHLETE_NOTES_MAX_LENGTH);
    assert.equal(parseAthleteNotes(text), text);
  });

  it("acima do limite → invalid-argument, sem cortar calado", () => {
    rejectsInvalid("a".repeat(ATHLETE_NOTES_MAX_LENGTH + 1), /280 caracteres/);
  });

  it("o limite vale depois de aparar os espaços", () => {
    const text = `  ${"a".repeat(ATHLETE_NOTES_MAX_LENGTH)}  `;
    assert.equal(parseAthleteNotes(text), "a".repeat(ATHLETE_NOTES_MAX_LENGTH));
  });

  it("tipo errado → invalid-argument", () => {
    rejectsInvalid(42, /Recado inválido/);
    rejectsInvalid({text: "oi"}, /Recado inválido/);
  });
});
