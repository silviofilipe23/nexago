import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  levelRank,
  tournamentSportToLevelSportCode,
  resolveAthleteLevelRank,
  categoryLevelRank,
  isTeamEligible,
  assertTeamLevelEligibility,
} from "./category-level-eligibility";

/** Mock de Firestore que resolve `users/{uid}` a partir de um mapa. */
function mockDb(usersByUid: Record<string, Record<string, unknown> | null>) {
  return {
    doc: (path: string) => ({
      get: async () => {
        const uid = path.startsWith("users/") ? path.slice("users/".length) : "";
        const data = usersByUid[uid] ?? null;
        return {exists: data != null, data: () => data};
      },
    }),
  };
}

describe("category-level-eligibility · níveis", () => {
  it("rankeia códigos, labels e legados", () => {
    assert.equal(levelRank("iniciante"), 0);
    assert.equal(levelRank("Iniciante"), 0);
    assert.equal(levelRank("intermediario"), 1);
    assert.equal(levelRank("Intermediário"), 1);
    assert.equal(levelRank("open"), 2);
    assert.equal(levelRank("Open"), 2);
    assert.equal(levelRank("basico"), 0);
    assert.equal(levelRank("Básico"), 0);
    assert.equal(levelRank("livre"), 2);
    assert.equal(levelRank(""), null);
    assert.equal(levelRank("xpto"), null);
    assert.equal(levelRank(undefined), null);
  });

  it("hierarquia é crescente", () => {
    assert.ok(levelRank("iniciante")! < levelRank("intermediario")!);
    assert.ok(levelRank("intermediario")! < levelRank("open")!);
  });
});

describe("category-level-eligibility · mapeamento de esporte", () => {
  it("mapeia esportes de vôlei", () => {
    assert.equal(tournamentSportToLevelSportCode("beachVolleyball"), "VOLEI_PRAIA");
    assert.equal(tournamentSportToLevelSportCode("indoorVolleyball"), "VOLEI_QUADRA");
  });

  it("footvolley e desconhecidos não têm equivalente", () => {
    assert.equal(tournamentSportToLevelSportCode("footvolley"), null);
    assert.equal(tournamentSportToLevelSportCode(undefined), null);
  });
});

describe("category-level-eligibility · resolução de nível do atleta", () => {
  it("usa nível por esporte quando disponível (sportOnboarding.levelsBySport)", () => {
    const user = {
      level: "iniciante",
      sportOnboarding: {levelsBySport: {VOLEI_PRAIA: "open"}},
    };
    assert.equal(resolveAthleteLevelRank(user, "VOLEI_PRAIA"), 2);
  });

  it("aceita o campo legado levelsBySportFirestore", () => {
    const user = {
      level: "iniciante",
      levelsBySportFirestore: {VOLEI_PRAIA: "open"},
    };
    assert.equal(resolveAthleteLevelRank(user, "VOLEI_PRAIA"), 2);
  });

  it("cai no nível global quando falta o por esporte", () => {
    const user = {level: "intermediario", sportOnboarding: {levelsBySport: {}}};
    assert.equal(resolveAthleteLevelRank(user, "VOLEI_PRAIA"), 1);
  });

  it("sem nenhum nível → iniciante (permissivo)", () => {
    assert.equal(resolveAthleteLevelRank({}, "VOLEI_PRAIA"), 0);
    assert.equal(resolveAthleteLevelRank(null, "VOLEI_PRAIA"), 0);
  });

  it("footvolley (sportCode null) usa nível global", () => {
    const user = {
      level: "open",
      sportOnboarding: {levelsBySport: {VOLEI_PRAIA: "iniciante"}},
    };
    assert.equal(resolveAthleteLevelRank(user, null), 2);
  });
});

describe("category-level-eligibility · nível da categoria", () => {
  it("lê o nível da categoria", () => {
    assert.equal(categoryLevelRank({level: "Iniciante"}), 0);
    assert.equal(categoryLevelRank({level: "Intermediário"}), 1);
    assert.equal(categoryLevelRank({level: "Open"}), 2);
  });

  it("categoria sem nível → Open (aceita todos)", () => {
    assert.equal(categoryLevelRank({}), 2);
    assert.equal(categoryLevelRank(null), 2);
  });
});

describe("category-level-eligibility · regra do mais forte (dupla)", () => {
  it("dupla elegível sse categoria comporta o atleta mais forte", () => {
    // Iniciante (0) + Intermediário (1) → cat. Intermediário (1) ok, Iniciante (0) não.
    assert.equal(isTeamEligible({categoryRank: 1, athleteRanks: [0, 1]}), true);
    assert.equal(isTeamEligible({categoryRank: 0, athleteRanks: [0, 1]}), false);
    // Intermediário (1) + Open (2) → só Open (2).
    assert.equal(isTeamEligible({categoryRank: 2, athleteRanks: [1, 2]}), true);
    assert.equal(isTeamEligible({categoryRank: 1, athleteRanks: [1, 2]}), false);
    // Iniciante (0) + Open (2) → só Open (2).
    assert.equal(isTeamEligible({categoryRank: 2, athleteRanks: [0, 2]}), true);
    assert.equal(isTeamEligible({categoryRank: 1, athleteRanks: [0, 2]}), false);
  });

  it("dupla vazia é sempre elegível", () => {
    assert.equal(isTeamEligible({categoryRank: 0, athleteRanks: []}), true);
  });
});

describe("category-level-eligibility · assertTeamLevelEligibility", () => {
  const tournament = {sport: "beachVolleyball"};

  it("permite atleta da própria categoria e acima", async () => {
    const db = mockDb({
      a: {name: "Ana", sportOnboarding: {levelsBySport: {VOLEI_PRAIA: "iniciante"}}},
    });
    await assert.doesNotReject(
      assertTeamLevelEligibility({
        db: db as never,
        tournament,
        category: {categoryName: "Iniciante", level: "Iniciante"},
        uids: ["a"],
      }),
    );
    await assert.doesNotReject(
      assertTeamLevelEligibility({
        db: db as never,
        tournament,
        category: {categoryName: "Open", level: "Open"},
        uids: ["a"],
      }),
    );
  });

  it("bloqueia atleta Open em categoria abaixo, nomeando o atleta", async () => {
    const db = mockDb({
      a: {name: "João", sportOnboarding: {levelsBySport: {VOLEI_PRAIA: "open"}}},
    });
    await assert.rejects(
      assertTeamLevelEligibility({
        db: db as never,
        tournament,
        category: {categoryName: "Intermediário", level: "Intermediário"},
        uids: ["a"],
      }),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        assert.match(err.message, /João/);
        assert.match(err.message, /Open/);
        return true;
      },
    );
  });

  it("dupla bloqueada pelo integrante mais forte", async () => {
    const db = mockDb({
      a: {name: "Ana", sportOnboarding: {levelsBySport: {VOLEI_PRAIA: "iniciante"}}},
      b: {name: "Bia", sportOnboarding: {levelsBySport: {VOLEI_PRAIA: "open"}}},
    });
    // Categoria Iniciante: Bia (Open) bloqueia.
    await assert.rejects(
      assertTeamLevelEligibility({
        db: db as never,
        tournament,
        category: {categoryName: "Iniciante", level: "Iniciante"},
        uids: ["a", "b"],
      }),
      (err: Error & {message: string}) => {
        assert.match(err.message, /Bia/);
        assert.doesNotMatch(err.message, /Ana/);
        return true;
      },
    );
    // Categoria Open: dupla passa.
    await assert.doesNotReject(
      assertTeamLevelEligibility({
        db: db as never,
        tournament,
        category: {categoryName: "Open", level: "Open"},
        uids: ["a", "b"],
      }),
    );
  });

  it("categoria sem nível aceita todos (não carrega usuários)", async () => {
    let loaded = false;
    const db = {
      doc: () => ({
        get: async () => {
          loaded = true;
          return {exists: false, data: () => null};
        },
      }),
    };
    await assert.doesNotReject(
      assertTeamLevelEligibility({
        db: db as never,
        tournament,
        category: {categoryName: "Livre"},
        uids: ["a", "b"],
      }),
    );
    assert.equal(loaded, false);
  });

  it("lista de uids vazia é elegível", async () => {
    const db = mockDb({});
    await assert.doesNotReject(
      assertTeamLevelEligibility({
        db: db as never,
        tournament,
        category: {level: "Iniciante"},
        uids: [undefined, "", null],
      }),
    );
  });
});
