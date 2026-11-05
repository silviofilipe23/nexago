import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {arenaBlockApplies} from "./arena-block-guard";

describe("arenaBlockApplies", () => {
  it("bloqueio gravado pela própria arena vale", () => {
    assert.equal(arenaBlockApplies({arenaId: "arena-y", reason: "x"}, "arena-y"), true);
  });

  it("doc com ID da arena Y mas arenaId de outra arena não bloqueia na Y", () => {
    assert.equal(arenaBlockApplies({arenaId: "arena-x", reason: "x"}, "arena-y"), false);
  });

  it("doc sem arenaId (ou inexistente) não bloqueia", () => {
    assert.equal(arenaBlockApplies({reason: "x"}, "arena-y"), false);
    assert.equal(arenaBlockApplies(undefined, "arena-y"), false);
  });
});
