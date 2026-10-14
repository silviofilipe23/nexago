import {strict as assert} from "node:assert";
import {test} from "node:test";
import {HttpsError} from "firebase-functions/v2/https";
import {assertCanInviteSelf, assertInviteRole} from "./coach-staff-ops";

test("dono nao pode se convidar", () => {
  assert.throws(() => assertCanInviteSelf("c1", "c1"), (e: unknown) =>
    e instanceof HttpsError && e.code === "invalid-argument");
});

test("convidar outra pessoa ou e-mail sem conta (null) passa", () => {
  assert.doesNotThrow(() => assertCanInviteSelf("c1", "u2"));
  assert.doesNotThrow(() => assertCanInviteSelf("c1", null));
});

test("assertInviteRole recusa cargo invalido e devolve o valido", () => {
  assert.equal(assertInviteRole("fisioterapeuta"), "fisioterapeuta");
  for (const bad of ["principal", "", undefined, 3]) {
    assert.throws(() => assertInviteRole(bad), (e: unknown) =>
      e instanceof HttpsError && e.code === "invalid-argument");
  }
});
