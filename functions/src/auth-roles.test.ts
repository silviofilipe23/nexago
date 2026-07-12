import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {applyRolesToClaims, firestoreRolesPayload, isAllowedRole} from "./auth-roles";

describe("isAllowedRole", () => {
  it("accepts coach as a valid role", () => {
    assert.equal(isAllowedRole("coach"), true);
  });
});

describe("applyRolesToClaims", () => {
  it("sets roles list and legacy role=coach for a coach-only account", () => {
    const claims = applyRolesToClaims({}, ["coach"]);
    assert.deepEqual(claims["roles"], ["coach"]);
    assert.equal(claims["role"], "coach");
  });

  it("prefers arena over coach in the legacy role field for multi-role accounts", () => {
    const claims = applyRolesToClaims({}, ["coach", "arena"]);
    assert.equal(claims["role"], "arena");
  });

  it("prefers coach over athlete in the legacy role field", () => {
    const claims = applyRolesToClaims({}, ["coach", "athlete"]);
    assert.equal(claims["role"], "coach");
  });
});

describe("firestoreRolesPayload", () => {
  it("mirrors the same priority for the Firestore users/{uid} payload", () => {
    const payload = firestoreRolesPayload(["coach", "athlete"]);
    assert.deepEqual(payload["roles"], ["athlete", "coach"]);
    assert.equal(payload["role"], "coach");
  });
});
