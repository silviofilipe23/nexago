import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  categoryIsMixedDuo,
  categoryRequiredGenderBucket,
  evaluateMixedDuoGender,
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

  // `male`/`female`/`mixed` são os valores que o portal do organizador grava.
  it("entende os valores em inglês que o portal grava", () => {
    assert.equal(categoryRequiredGenderBucket({genderType: "male"}), "M");
    assert.equal(categoryRequiredGenderBucket({genderType: "female"}), "F");
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

// Toda categoria criada pelo portal do organizador grava `teamSize` — dupla
// inclusive, com `teamSize: 2`. Desistir da validação em "tem teamSize" deixava
// a regra de gênero MORTA em todas elas: no dev uma atleta feminina reservou
// vaga numa categoria Masculina e o servidor aceitou. Equipe é `teamSize >= 3`,
// a mesma conta de `isTeamCategory`.
describe("categoryRequiredGenderBucket — dupla com teamSize gravado", () => {
  it("dupla masculina com teamSize 2 continua exigindo M", () => {
    assert.equal(
      categoryRequiredGenderBucket({genderType: "male", teamSize: 2}),
      "M",
    );
  });

  it("dupla feminina com teamSize 2 continua exigindo F", () => {
    assert.equal(
      categoryRequiredGenderBucket({genderType: "Feminino", teamSize: 2}),
      "F",
    );
  });

  it("equipe (teamSize >= 3) segue sem exigência individual", () => {
    assert.equal(
      categoryRequiredGenderBucket({genderType: "male", teamSize: 3}),
      null,
    );
    assert.equal(
      categoryRequiredGenderBucket({genderType: "male", teamSize: 4}),
      null,
    );
  });

  it("composição de gênero declarada continua fora", () => {
    assert.equal(
      categoryRequiredGenderBucket({
        genderType: "male",
        genderComposition: {men: 2, women: 2},
      }),
      null,
    );
  });
});

describe("categoryIsMixedDuo", () => {
  it("dupla mista com teamSize 2 é mista", () => {
    assert.equal(categoryIsMixedDuo({genderType: "mixed", teamSize: 2}), true);
  });

  it("dupla que declara Misto é mista", () => {
    assert.equal(categoryIsMixedDuo({genderType: "Misto"}), true);
    assert.equal(categoryIsMixedDuo({genderType: "mixed"}), true);
    assert.equal(categoryIsMixedDuo({categoryName: "Dupla Mista Open"}), true);
  });

  it("dupla de gênero fixo não é mista", () => {
    assert.equal(categoryIsMixedDuo({genderType: "Masculino"}), false);
    assert.equal(categoryIsMixedDuo({genderType: "Feminino"}), false);
  });

  // Sem menção a gênero em lugar nenhum não pode virar "misto por padrão": a
  // regra 1H+1M barraria inscrição de categoria que nunca declarou nada.
  it("categoria que não fala de gênero não é mista", () => {
    assert.equal(categoryIsMixedDuo({categoryName: "Iniciante 2"}), false);
    assert.equal(categoryIsMixedDuo({}), false);
    assert.equal(categoryIsMixedDuo(null), false);
  });

  // Equipe tem composição própria (`2H + 2M`), validada por buckets em
  // `tournament-team-category.ts` — não passa por esta regra.
  it("equipe nunca é dupla mista", () => {
    assert.equal(categoryIsMixedDuo({genderType: "Misto", teamSize: 3}), false);
    assert.equal(categoryIsMixedDuo({genderType: "Misto", teamSize: 4}), false);
    assert.equal(
      categoryIsMixedDuo({
        genderType: "Misto",
        genderComposition: {men: 2, women: 2},
      }),
      false,
    );
  });
});

describe("evaluateMixedDuoGender", () => {
  const ana = {name: "Ana", gender: "Feminino"};
  const bia = {name: "Bia", gender: "F"};
  const caio = {name: "Caio", gender: "Masculino"};
  const sem = {name: "Sem Gênero", gender: ""};

  it("par de gêneros diferentes passa", () => {
    assert.deepEqual(evaluateMixedDuoGender([ana, caio]), {
      missing: [],
      sameGender: [],
    });
  });

  it("par do mesmo gênero é conflito", () => {
    assert.deepEqual(evaluateMixedDuoGender([ana, bia]), {
      missing: [],
      sameGender: ["Ana", "Bia"],
    });
  });

  // Pendência informa, não bloqueia no envio — mesma política do gênero fixo.
  it("gênero ausente vira pendência, não conflito", () => {
    assert.deepEqual(evaluateMixedDuoGender([ana, sem]), {
      missing: ["Sem Gênero"],
      sameGender: [],
    });
  });

  // "Outro" não casa com M nem F: não dá para afirmar que fecha a dupla mista,
  // e tratá-lo como conflito com QUALQUER parceiro barraria o atleta sempre.
  // Fica como pendência, igual a quem não declarou.
  it("gênero fora de M/F conta como pendência", () => {
    assert.deepEqual(
      evaluateMixedDuoGender([ana, {name: "Alex", gender: "Outro"}]),
      {missing: ["Alex"], sameGender: []},
    );
  });

  it("um atleta só (vaga solo) não tem par para comparar", () => {
    assert.deepEqual(evaluateMixedDuoGender([ana]), {
      missing: [],
      sameGender: [],
    });
  });
});
