import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  ageBandDisplayLabel,
  formatCategoryInviteNotificationLabel,
  genderTypeDisplayLabel,
} from "./category-display-labels";

describe("category-display-labels", () => {
  it("genderTypeDisplayLabel maps firestore values", () => {
    assert.equal(genderTypeDisplayLabel("male"), "Masculino");
    assert.equal(genderTypeDisplayLabel("female"), "Feminino");
    assert.equal(genderTypeDisplayLabel("mixed"), "Misto");
  });

  it("ageBandDisplayLabel formats sub and plus", () => {
    assert.equal(ageBandDisplayLabel("sub21"), "Sub-21");
    assert.equal(ageBandDisplayLabel("plus40"), "+40");
    assert.equal(ageBandDisplayLabel("open"), null);
  });

  it("formatCategoryInviteNotificationLabel composes gender age and level", () => {
    assert.equal(
      formatCategoryInviteNotificationLabel({
        genderType: "male",
        ageBand: "sub19",
        level: "Intermediário",
      }),
      "Masculino Sub-19 Intermediário",
    );
    assert.equal(
      formatCategoryInviteNotificationLabel({
        genderType: "female",
        ageBand: "open",
        level: "Open",
      }),
      "Feminino Open",
    );
    assert.equal(
      formatCategoryInviteNotificationLabel({
        genderType: "mixed",
        ageBand: "open",
        level: "Iniciante",
      }),
      "Misto Iniciante",
    );
  });

  it("falls back to categoryName when parts missing", () => {
    assert.equal(
      formatCategoryInviteNotificationLabel({categoryName: "Misto Pro"}),
      "Misto Pro",
    );
  });
});
