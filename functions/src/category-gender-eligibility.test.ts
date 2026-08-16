import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  categoryRequiredGenderBucket,
  evaluateTeamGenderEligibility,
} from "./category-gender-eligibility";

describe("categoryRequiredGenderBucket", () => {
  it("lê o genderType da categoria", () => {
    assert.equal(categoryRequiredGenderBucket({genderType: "Masculino"}), "M");
    assert.equal(categoryRequiredGenderBucket({genderType: "Feminino"}), "F");
    assert.equal(categoryRequiredGenderBucket({genderType: "F"}), "F");
    assert.equal(categoryRequiredGenderBucket({genderType: "Misto"}), null);
    assert.equal(categoryRequiredGenderBucket({genderType: "mixed"}), null);
  });

  it("cai no nome quando o genderType não fala de gênero", () => {
    assert.equal(
      categoryRequiredGenderBucket({categoryName: "Dupla Feminina Open"}),
      "F",
    );
    assert.equal(
      categoryRequiredGenderBucket({name: "Masculina Intermediário"}),
      "M",
    );
    // "Dupla Mista" tem "mist" — nunca pode casar com masc/fem.
    assert.equal(categoryRequiredGenderBucket({name: "Dupla Mista"}), null);
  });

  it("NUNCA assume Masculino por padrão", () => {
    assert.equal(categoryRequiredGenderBucket({name: "Categoria Open"}), null);
    assert.equal(categoryRequiredGenderBucket({}), null);
    assert.equal(categoryRequiredGenderBucket(null), null);
  });

  it("equipe (trio+) e gênero livre ficam fora — composição valida", () => {
    assert.equal(
      categoryRequiredGenderBucket({genderType: "Feminino", teamSize: 4}),
      null,
    );
    assert.equal(
      categoryRequiredGenderBucket({
        genderType: "Misto",
        genderComposition: {men: 2, women: 2},
      }),
      null,
    );
    assert.equal(
      categoryRequiredGenderBucket({genderType: "Feminino", genderFree: true}),
      null,
    );
  });
});

describe("evaluateTeamGenderEligibility", () => {
  it("separa pendência (vazio) de conflito (declarado incompatível)", () => {
    const result = evaluateTeamGenderEligibility({
      requiredBucket: "M",
      athletes: [
        {name: "Ana", gender: "Feminino"},
        {name: "Bruno", gender: "Masculino"},
        {name: "Caio", gender: ""},
        {name: "Dani", gender: undefined},
        // Declarado mas fora de M/F: conflita, não é pendência.
        {name: "Eli", gender: "Outro"},
      ],
    });
    assert.deepEqual(result.missing, ["Caio", "Dani"]);
    assert.deepEqual(result.conflicts, ["Ana", "Eli"]);
  });

  it("sem gênero exigido não aponta nada", () => {
    const result = evaluateTeamGenderEligibility({
      requiredBucket: null,
      athletes: [{name: "Ana", gender: ""}],
    });
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.conflicts, []);
  });
});
