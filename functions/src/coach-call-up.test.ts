import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {buildInitialResponses} from "./coach-call-up";

describe("buildInitialResponses", () => {
  it("marks every recipient as aguardando", () => {
    assert.deepEqual(buildInitialResponses(["a1", "a2"]), {
      a1: "aguardando",
      a2: "aguardando",
    });
  });

  it("returns an empty map for no recipients", () => {
    assert.deepEqual(buildInitialResponses([]), {});
  });
});
