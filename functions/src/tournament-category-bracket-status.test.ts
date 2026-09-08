import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {categoryBracketPublished} from "./tournament-category-bracket-status";

describe("categoryBracketPublished", () => {
  it("acha a chave por qualquer uma das chaves equivalentes da categoria", () => {
    const tournament = {
      categoryOps: {"Masculina A": {bracketStatus: "published"}},
    };
    assert.equal(
      categoryBracketPublished(tournament, ["cat-a", "Masculina A"]),
      true,
    );
  });

  it("conta chave concluída como publicada", () => {
    const tournament = {categoryOps: {"cat-a": {bracketStatus: "completed"}}};
    assert.equal(categoryBracketPublished(tournament, ["cat-a"]), true);
  });

  it("rascunho NÃO conta: a chave em rascunho referencia teamId, que não muda", () => {
    const tournament = {categoryOps: {"cat-a": {bracketStatus: "draft"}}};
    assert.equal(categoryBracketPublished(tournament, ["cat-a"]), false);
  });

  it("outra categoria publicada não afeta esta", () => {
    const tournament = {categoryOps: {"cat-b": {bracketStatus: "published"}}};
    assert.equal(categoryBracketPublished(tournament, ["cat-a"]), false);
  });

  it("torneio sem categoryOps, nulo ou com lixo no lugar do mapa", () => {
    assert.equal(categoryBracketPublished({}, ["cat-a"]), false);
    assert.equal(categoryBracketPublished(null, ["cat-a"]), false);
    assert.equal(
      categoryBracketPublished({categoryOps: "sim"}, ["cat-a"]),
      false,
    );
    assert.equal(
      categoryBracketPublished({categoryOps: {"cat-a": "published"}}, ["cat-a"]),
      false,
    );
  });
});
