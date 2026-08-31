import {describe, test} from "node:test";
import assert from "node:assert/strict";
import {
  SUBSTITUTION_BLOCK_MESSAGES,
  replaceUidInList,
  substitutionBlockReason,
  substitutionPermissionError,
} from "./tournament-substitution-logic";

describe("substitutionBlockReason", () => {
  const keys = new Set(["cat-1", "Dupla Masculina"]);

  test("sem categoryOps: permitido", () => {
    assert.equal(substitutionBlockReason({}, {}, keys), null);
  });

  test("bracketStatus published bloqueia (por qualquer chave equivalente)", () => {
    const t = {categoryOps: {"Dupla Masculina": {bracketStatus: "published"}}};
    assert.equal(substitutionBlockReason(t, {}, keys), "bracket_published");
  });

  test("bracketStatus completed bloqueia; draft não", () => {
    assert.equal(
      substitutionBlockReason({categoryOps: {"cat-1": {bracketStatus: "completed"}}}, {}, keys),
      "bracket_published",
    );
    assert.equal(
      substitutionBlockReason({categoryOps: {"cat-1": {bracketStatus: "draft"}}}, {}, keys),
      null,
    );
  });

  test("torneio cancelado bloqueia", () => {
    assert.equal(substitutionBlockReason({listingStatus: "Cancelado"}, {}, keys), "tournament_cancelled");
  });

  test("categoria concluída bloqueia", () => {
    assert.equal(substitutionBlockReason({}, {isCompleted: true}, keys), "category_completed");
  });

  test("copy do gate cita as chaves publicadas", () => {
    assert.match(SUBSTITUTION_BLOCK_MESSAGES.bracket_published, /chaves.*publicadas/i);
  });
});

describe("substitutionPermissionError", () => {
  const dupla = {participantUids: ["a", "b"], teamSize: 2, captainUid: ""};

  test("dupla: membro troca a própria vaga e a do parceiro", () => {
    assert.equal(substitutionPermissionError({...dupla, initiatorUid: "a", replacedUid: "a", inviteeUid: "c"}), null);
    assert.equal(substitutionPermissionError({...dupla, initiatorUid: "a", replacedUid: "b", inviteeUid: "c"}), null);
  });

  test("quem não é da inscrição não inicia", () => {
    assert.match(
      substitutionPermissionError({...dupla, initiatorUid: "x", replacedUid: "a", inviteeUid: "c"}) ?? "",
      /não é um dos atletas/i,
    );
  });

  test("substituto não pode já estar na inscrição nem ser o iniciador", () => {
    assert.match(
      substitutionPermissionError({...dupla, initiatorUid: "a", replacedUid: "b", inviteeUid: "a"}) ?? "",
      /já está nesta inscrição|si mesmo/i,
    );
  });

  const equipe = {participantUids: ["cap", "m1", "m2"], teamSize: 3, captainUid: "cap"};

  test("equipe: só o capitão inicia", () => {
    assert.match(
      substitutionPermissionError({...equipe, initiatorUid: "m1", replacedUid: "m2", inviteeUid: "c"}) ?? "",
      /capitão/i,
    );
    assert.equal(substitutionPermissionError({...equipe, initiatorUid: "cap", replacedUid: "m1", inviteeUid: "c"}), null);
  });

  test("equipe: capitão não substitui a si mesmo", () => {
    assert.match(
      substitutionPermissionError({...equipe, initiatorUid: "cap", replacedUid: "cap", inviteeUid: "c"}) ?? "",
      /capitão não pode ser substituído/i,
    );
  });
});

describe("replaceUidInList", () => {
  test("preserva a posição do uid trocado", () => {
    assert.deepEqual(replaceUidInList(["a", "b", "c"], "b", "x"), ["a", "x", "c"]);
  });
  test("uid ausente: lista intacta", () => {
    assert.deepEqual(replaceUidInList(["a", "b"], "z", "x"), ["a", "b"]);
  });
});
