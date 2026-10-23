import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  centerMemberBecameActive,
  ensureCenterRole,
  withCenterRole,
  type CenterRoleAuth,
} from "./center-role";
import {isAllowedRole} from "./auth-roles";

function fakeAuth(claims: Record<string, unknown> | undefined): {
  auth: CenterRoleAuth;
  sets: Array<Record<string, unknown>>;
} {
  const sets: Array<Record<string, unknown>> = [];
  const auth = {
    getUser: async (uid: string) => ({uid, customClaims: claims}),
    setCustomUserClaims: async (_uid: string, next: Record<string, unknown> | null) => {
      sets.push(next ?? {});
    },
  } as unknown as CenterRoleAuth;
  return {auth, sets};
}

describe("papel center", () => {
  it("é uma role conhecida (lista fechada de auth-roles)", () => {
    assert.equal(isAllowedRole("center"), true);
    assert.deepEqual(withCenterRole(["athlete"]), ["athlete", "center"]);
    assert.deepEqual(withCenterRole(["athlete", "center"]), ["athlete", "center"]);
  });

  it("concede na claim mantendo os outros papéis e grava users/{uid}.roles", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("users/uOwner", {fullName: "Rafa", roles: ["athlete"]});
    const {auth, sets} = fakeAuth({roles: ["athlete", "professor"], superAdmin: false});
    await ensureCenterRole(fake as unknown as Firestore, "uOwner", auth);
    assert.equal(sets.length, 1);
    assert.deepEqual(sets[0]?.["roles"], ["athlete", "center", "professor"]);
    const user = fake.store.get("users/uOwner");
    assert.deepEqual(user?.["roles"], ["athlete", "center", "professor"]);
    assert.equal(user?.["fullName"], "Rafa");
  });

  it("idempotente: já center não regrava a claim, mas autocura o documento", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("users/uOwner", {roles: ["athlete"]});
    const {auth, sets} = fakeAuth({roles: ["athlete", "center"]});
    await ensureCenterRole(fake as unknown as Firestore, "uOwner", auth);
    assert.equal(sets.length, 0);
    assert.deepEqual(fake.store.get("users/uOwner")?.["roles"], ["athlete", "center"]);
  });

  it("só reage quando o vínculo fica ativo", () => {
    // Bootstrap do owner e aceite de convite: nasce ativo.
    assert.equal(centerMemberBecameActive(undefined, {status: "active"}), true);
    // Reativação pelo gestor ou aceite de um novo convite depois de revogado.
    assert.equal(centerMemberBecameActive({status: "revoked"}, {status: "active"}), true);
    // Editar papel/permissões de quem já está ativo não reconcede.
    assert.equal(centerMemberBecameActive({status: "active"}, {status: "active", role: "center_admin"}), false);
    // Revogar e excluir não concedem (e não tiram: o papel só escolhe o modo).
    assert.equal(centerMemberBecameActive({status: "active"}, {status: "revoked"}), false);
    assert.equal(centerMemberBecameActive({status: "active"}, undefined), false);
  });
});
