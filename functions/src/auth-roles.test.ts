import type {UserRecord} from "firebase-admin/auth";
import {FieldValue} from "firebase-admin/firestore";
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  applyRolesToClaims,
  callerCanAccessBackoffice,
  firestoreRolesPayload,
  isAllowedRole,
  rolesFromClaims,
} from "./auth-roles";

function fakeUser(claims: Record<string, unknown>): UserRecord {
  return {customClaims: claims} as UserRecord;
}

describe("isAllowedRole", () => {
  it("accepts coach as a valid role", () => {
    assert.equal(isAllowedRole("coach"), true);
  });
});

describe("applyRolesToClaims", () => {
  it("sets the roles list and strips the legacy role claim", () => {
    const claims = applyRolesToClaims({role: "coach", other: 1}, ["coach"]);
    assert.deepEqual(claims["roles"], ["coach"]);
    assert.equal("role" in claims, false);
    assert.equal(claims["other"], 1);
  });
});

describe("rolesFromClaims", () => {
  it("ignores the legacy role claim when reading roles", () => {
    assert.deepEqual(rolesFromClaims({role: "athlete"}), []);
    assert.deepEqual(rolesFromClaims({roles: ["athlete"], role: "arena"}), ["athlete"]);
  });
});

describe("firestoreRolesPayload", () => {
  it("firestoreRolesPayload purges the legacy role field", () => {
    const payload = firestoreRolesPayload(["coach", "athlete"]);
    assert.deepEqual(payload["roles"], ["athlete", "coach"]);
    assert.ok((payload["role"] as FieldValue).isEqual(FieldValue.delete()));
  });
});

describe("callerCanAccessBackoffice", () => {
  it("grants access to admin", () => {
    assert.equal(callerCanAccessBackoffice(fakeUser({roles: ["admin"]})), true);
  });

  it("grants access to superAdmin even without admin role", () => {
    assert.equal(callerCanAccessBackoffice(fakeUser({superAdmin: true})), true);
  });

  it("does NOT grant access to organizer alone — organizer is self-assignable via signup and must never imply backoffice/PII access", () => {
    assert.equal(callerCanAccessBackoffice(fakeUser({roles: ["organizer"]})), false);
  });

  it("denies access to a caller with no roles at all", () => {
    assert.equal(callerCanAccessBackoffice(fakeUser({})), false);
  });
});
