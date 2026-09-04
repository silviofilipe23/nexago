import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  findCategoryIndex,
  planCategoryCapacityExpansion,
  resolveCategoryCapacity,
} from "./tournament-category-capacity";

describe("findCategoryIndex", () => {
  const categories = [
    {id: "cat-a", categoryName: "Masculina A"},
    {categoryId: "cat-b", name: "Masculina B"},
    {id: "cat-c"},
  ];

  it("acha por id, categoryId, categoryName e name", () => {
    assert.equal(findCategoryIndex(categories, "cat-a"), 0);
    assert.equal(findCategoryIndex(categories, "Masculina A"), 0);
    assert.equal(findCategoryIndex(categories, "cat-b"), 1);
    assert.equal(findCategoryIndex(categories, "Masculina B"), 1);
    assert.equal(findCategoryIndex(categories, "cat-c"), 2);
  });

  it("ignora espaços em volta da chave", () => {
    assert.equal(findCategoryIndex(categories, "  Masculina A  "), 0);
  });

  it("devolve -1 sem categoria, com chave vazia ou com array inválido", () => {
    assert.equal(findCategoryIndex(categories, "cat-z"), -1);
    assert.equal(findCategoryIndex(categories, "   "), -1);
    assert.equal(findCategoryIndex(undefined, "cat-a"), -1);
    assert.equal(findCategoryIndex(["texto solto"], "cat-a"), -1);
  });
});

describe("resolveCategoryCapacity", () => {
  it("prefere maxTeams e aceita número em texto", () => {
    assert.equal(resolveCategoryCapacity({maxTeams: 16, spotsTotal: 8}), 16);
    assert.equal(resolveCategoryCapacity({maxTeams: "12"}), 12);
  });

  it("cai para o próximo campo quando o anterior não é teto declarado", () => {
    assert.equal(resolveCategoryCapacity({maxTeams: 0, spotsTotal: 16}), 16);
    assert.equal(resolveCategoryCapacity({spots: 10}), 10);
    assert.equal(resolveCategoryCapacity({spotsLeft: 6}), 6);
  });

  it("devolve null quando a categoria não declara teto", () => {
    assert.equal(resolveCategoryCapacity({}), null);
    assert.equal(resolveCategoryCapacity(null), null);
    assert.equal(resolveCategoryCapacity({maxTeams: -3}), null);
  });
});

describe("planCategoryCapacityExpansion", () => {
  it("sobe o teto em 1 e devolve o array inteiro já corrigido", () => {
    const categories = [
      {id: "cat-a", maxTeams: 16, spotsTotal: 16, entryFee: 100},
      {id: "cat-b", maxTeams: 8, spotsTotal: 8},
    ];
    const plan = planCategoryCapacityExpansion({
      categories,
      categoryKey: "cat-a",
      occupied: 16,
    });
    assert.ok(plan);
    assert.equal(plan.index, 0);
    assert.equal(plan.from, 16);
    assert.equal(plan.to, 17);
    assert.deepEqual(plan.categories, [
      {id: "cat-a", maxTeams: 17, spotsTotal: 17, entryFee: 100},
      {id: "cat-b", maxTeams: 8, spotsTotal: 8},
    ]);
  });

  it("não muta o array recebido", () => {
    const categories = [{id: "cat-a", maxTeams: 16, spotsTotal: 16}];
    planCategoryCapacityExpansion({
      categories,
      categoryKey: "cat-a",
      occupied: 16,
    });
    assert.deepEqual(categories, [{id: "cat-a", maxTeams: 16, spotsTotal: 16}]);
  });

  it("mexe só nos campos de teto que a categoria já declara", () => {
    const plan = planCategoryCapacityExpansion({
      categories: [{id: "cat-a", spotsTotal: 12}],
      categoryKey: "cat-a",
      occupied: 12,
    });
    assert.deepEqual(plan?.categories[0], {id: "cat-a", spotsTotal: 13});
  });

  it("não toca em spotsLeft quando existe outro campo de teto", () => {
    const plan = planCategoryCapacityExpansion({
      categories: [{id: "cat-a", maxTeams: 16, spotsLeft: 16}],
      categoryKey: "cat-a",
      occupied: 16,
    });
    assert.deepEqual(plan?.categories[0], {id: "cat-a", maxTeams: 17, spotsLeft: 16});
  });

  it("usa spotsLeft quando é o único campo de teto do doc legado", () => {
    const plan = planCategoryCapacityExpansion({
      categories: [{id: "cat-a", spotsLeft: 16}],
      categoryKey: "cat-a",
      occupied: 16,
    });
    assert.deepEqual(plan?.categories[0], {id: "cat-a", spotsLeft: 17});
  });

  it("alcança a ocupação real quando a categoria já estourou o teto", () => {
    const plan = planCategoryCapacityExpansion({
      categories: [{id: "cat-a", maxTeams: 16}],
      categoryKey: "cat-a",
      occupied: 18,
    });
    assert.equal(plan?.from, 16);
    assert.equal(plan?.to, 19);
  });

  it("devolve null quando ainda cabe alguém — a vaga extra seria inventada", () => {
    assert.equal(
      planCategoryCapacityExpansion({
        categories: [{id: "cat-a", maxTeams: 16}],
        categoryKey: "cat-a",
        occupied: 15,
      }),
      null,
    );
  });

  it("devolve null sem teto declarado — não há o que lotar", () => {
    assert.equal(
      planCategoryCapacityExpansion({
        categories: [{id: "cat-a"}],
        categoryKey: "cat-a",
        occupied: 40,
      }),
      null,
    );
  });

  it("devolve null quando a categoria sumiu do torneio", () => {
    assert.equal(
      planCategoryCapacityExpansion({
        categories: [{id: "cat-a", maxTeams: 16}],
        categoryKey: "cat-z",
        occupied: 16,
      }),
      null,
    );
  });
});
