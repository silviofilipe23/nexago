import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildStaffAddedNotificationBody,
  buildStaffMirrorData,
  staffRoleGrantsOrganizerAccess,
  staffRoleLabel,
} from "./tournament-staff-sync";

describe("staffRoleLabel", () => {
  it("maps scorer to mesário", () => {
    assert.equal(staffRoleLabel("scorer"), "mesário");
  });

  it("maps manager (and unknowns) to gestor", () => {
    assert.equal(staffRoleLabel("manager"), "gestor");
    assert.equal(staffRoleLabel(""), "gestor");
  });
});

describe("buildStaffAddedNotificationBody", () => {
  it("includes role label and tournament name", () => {
    assert.equal(
      buildStaffAddedNotificationBody("scorer", "Copa Verão"),
      "Você agora é mesário de Copa Verão",
    );
  });

  it("falls back when tournament name is empty", () => {
    assert.equal(
      buildStaffAddedNotificationBody("manager", "  "),
      "Você agora é gestor de um torneio",
    );
  });
});

describe("staffRoleGrantsOrganizerAccess", () => {
  it("grants for manager", () => {
    assert.equal(staffRoleGrantsOrganizerAccess("manager"), true);
  });

  it("does not grant for scorer", () => {
    assert.equal(staffRoleGrantsOrganizerAccess("scorer"), false);
  });

  it("treats missing/unknown role as manager (same default as the mirror)", () => {
    assert.equal(staffRoleGrantsOrganizerAccess(undefined), true);
    assert.equal(staffRoleGrantsOrganizerAccess(""), true);
  });
});

describe("buildStaffMirrorData", () => {
  it("copies role/status from staff and name/dates from tournament", () => {
    const mirror = buildStaffMirrorData(
      {role: "scorer", status: "active"},
      {name: "Copa Verão", startAt: "s", endAt: "e"},
    );
    assert.deepEqual(mirror, {
      role: "scorer",
      status: "active",
      tournamentName: "Copa Verão",
      startAt: "s",
      endAt: "e",
    });
  });

  it("applies safe defaults for missing fields", () => {
    const mirror = buildStaffMirrorData({}, {});
    assert.deepEqual(mirror, {
      role: "manager",
      status: "active",
      tournamentName: "",
      startAt: null,
      endAt: null,
    });
  });
});
