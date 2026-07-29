import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {HttpsError} from "firebase-functions/v2/https";
import {assertVerifiedPhoneNumber} from "./athlete-phone-verification";

describe("assertVerifiedPhoneNumber", () => {
  it("returns the phone number when Firebase Auth confirms one", () => {
    assert.equal(assertVerifiedPhoneNumber("+5562999999999"), "+5562999999999");
  });

  it("rejects when Firebase Auth has no verified phone credential", () => {
    assert.throws(() => assertVerifiedPhoneNumber(null), HttpsError);
    assert.throws(() => assertVerifiedPhoneNumber(undefined), HttpsError);
    assert.throws(() => assertVerifiedPhoneNumber(""), HttpsError);
  });
});
