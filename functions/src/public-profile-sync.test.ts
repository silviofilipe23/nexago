import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {buildPublicProfileData} from "./public-profile-sync";

describe("buildPublicProfileData", () => {
  it("copies display/search fields with original names", () => {
    const out = buildPublicProfileData({
      fullName: "Fulano da Silva",
      nickname: "Fu",
      gender: "masculino",
      profilePhotoUrl: "https://x/y.jpg",
      city: "Fortaleza",
      state: "CE",
      roles: ["athlete"],
      hasAthleteRole: true,
      keywords: ["fu", "fulano"],
      partnerInviteStatus: "accepted",
    });

    assert.deepEqual(out, {
      fullName: "Fulano da Silva",
      nickname: "Fu",
      gender: "masculino",
      profilePhotoUrl: "https://x/y.jpg",
      city: "Fortaleza",
      state: "CE",
      roles: ["athlete"],
      hasAthleteRole: true,
      keywords: ["fu", "fulano"],
      partnerInviteStatus: "accepted",
    });
  });

  it("never mirrors the legacy role field", () => {
    const out = buildPublicProfileData({
      fullName: "Fulano da Silva",
      role: "athlete",
      roles: ["athlete"],
    });

    assert.deepEqual(out, {
      fullName: "Fulano da Silva",
      roles: ["athlete"],
    });
  });

  it("NEVER copies PII fields", () => {
    const out = buildPublicProfileData({
      fullName: "Fulano",
      email: "fulano@x.com",
      phoneNumber: "+5585999999999",
      birthDate: "1990-01-01",
      invitedByUid: "u2",
      fcmTokens: ["t"],
      address: "Rua X",
    });

    assert.deepEqual(Object.keys(out), ["fullName"]);
  });

  it("skips absent fields instead of writing undefined/null", () => {
    const out = buildPublicProfileData({nickname: "Fu"});
    assert.deepEqual(out, {nickname: "Fu"});
    assert.equal("gender" in out, false);
  });

  it("copies the highlight photo gallery URLs", () => {
    const out = buildPublicProfileData({
      fullName: "Fulano",
      highlightPhotoUrls: ["https://x/1.jpg", "https://x/2.jpg"],
    });

    assert.deepEqual(out, {
      fullName: "Fulano",
      highlightPhotoUrls: ["https://x/1.jpg", "https://x/2.jpg"],
    });
  });
});
