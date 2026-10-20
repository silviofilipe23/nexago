import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {ensureProfessorRole, withProfessorRole, type ProfessorRoleAuth} from "./professor-role";
import {isAllowedRole} from "./auth-roles";

function fakeAuth(claims: Record<string, unknown> | undefined): {
  auth: ProfessorRoleAuth;
  sets: Array<Record<string, unknown>>;
} {
  const sets: Array<Record<string, unknown>> = [];
  const auth = {
    getUser: async (uid: string) => ({uid, customClaims: claims}),
    setCustomUserClaims: async (_uid: string, next: Record<string, unknown> | null) => {
      sets.push(next ?? {});
    },
  } as unknown as ProfessorRoleAuth;
  return {auth, sets};
}

describe("papel professor", () => {
  it("é uma role conhecida (lista fechada de auth-roles)", () => {
    assert.equal(isAllowedRole("professor"), true);
    assert.deepEqual(withProfessorRole(["athlete"]), ["athlete", "professor"]);
    assert.deepEqual(withProfessorRole(["athlete", "professor"]), ["athlete", "professor"]);
  });

  it("concede na claim mantendo os outros papéis e grava users/{uid}.roles", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("users/uProf", {fullName: "Thiago", role: "athlete"});
    const {auth, sets} = fakeAuth({roles: ["athlete", "arena"], superAdmin: false});
    await ensureProfessorRole(fake as unknown as Firestore, "uProf", auth);
    assert.equal(sets.length, 1);
    assert.deepEqual(sets[0]?.["roles"], ["arena", "athlete", "professor"]);
    const user = fake.store.get("users/uProf");
    assert.deepEqual(user?.["roles"], ["arena", "athlete", "professor"]);
    assert.equal(user?.["fullName"], "Thiago");
  });

  it("idempotente: já professor não regrava a claim, mas autocura o documento", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("users/uProf", {fullName: "Thiago", roles: ["athlete"]});
    const {auth, sets} = fakeAuth({roles: ["athlete", "professor"]});
    await ensureProfessorRole(fake as unknown as Firestore, "uProf", auth);
    assert.equal(sets.length, 0);
    assert.deepEqual(fake.store.get("users/uProf")?.["roles"], ["athlete", "professor"]);
  });
});
