import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {UserRecord} from "firebase-admin/auth";
import {backofficeSearchMatches, backofficeUserMatchesSearch} from "./user-account-ops";

function authUser(uid: string, email: string): UserRecord {
  return {uid, email, customClaims: {roles: ["athlete"]}} as unknown as UserRecord;
}

const noFields = {fullName: null, nickname: null};

describe("backofficeUserMatchesSearch", () => {
  it("acha pelo apelido gravado em users/{uid}", () => {
    const u = authUser("u1", "bruno.c@gmail.com");
    assert.equal(backofficeUserMatchesSearch(u, "brunão", {fullName: "Bruno Carvalho", nickname: "Brunão"}), true);
  });

  it("ignora acento nos dois sentidos", () => {
    const u = authUser("u1", "bruno.c@gmail.com");
    const fields = {fullName: "Bruno Carvalho", nickname: "Brunão"};
    assert.equal(backofficeUserMatchesSearch(u, "brunao", fields), true);
    assert.equal(backofficeUserMatchesSearch(authUser("u2", "x@y.com"), "joão", {fullName: "Joao Lima", nickname: null}), true);
  });

  it("segue achando por e-mail, nome e uid", () => {
    const u = authUser("abc123", "ana.lima@gmail.com");
    const fields = {fullName: "Ana Lima Souza", nickname: null};
    assert.equal(backofficeUserMatchesSearch(u, "ana.lima@", fields), true);
    assert.equal(backofficeUserMatchesSearch(u, "lima souza", fields), true);
    assert.equal(backofficeUserMatchesSearch(u, "abc12", fields), true);
  });

  it("não acha quem não tem o termo em lugar nenhum", () => {
    assert.equal(backofficeUserMatchesSearch(authUser("u1", "ana@gmail.com"), "brunao", noFields), false);
  });
});

describe("backofficeSearchMatches", () => {
  it("cruza o lote do Auth com os docs na mesma ordem e devolve o fullName da linha", () => {
    const users = [
      authUser("u1", "ana@gmail.com"),
      authUser("u2", "bruno@gmail.com"),
      authUser("u3", "carla@gmail.com"),
    ];
    const docs = [
      {fullName: "Ana Lima", nickname: "Aninha"},
      {fullName: "Bruno Carvalho", nickname: "Brunão"},
      undefined,
    ];
    const out = backofficeSearchMatches(users, docs, "brunao");
    assert.deepEqual(out.map((m) => [m.user.uid, m.fullName]), [["u2", "Bruno Carvalho"]]);
  });

  it("conta sem doc em users ainda casa pelo Auth", () => {
    const out = backofficeSearchMatches([authUser("u3", "carla@gmail.com")], [undefined], "carla");
    assert.deepEqual(out.map((m) => [m.user.uid, m.fullName]), [["u3", null]]);
  });
});
