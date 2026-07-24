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
  it("rankeia códigos novos e labels (escada de 5 do vôlei)", () => {
    assert.equal(levelRank("iniciante_1"), 0);
    assert.equal(levelRank("Iniciante 1"), 0);
    assert.equal(levelRank("iniciante_2"), 1);
    assert.equal(levelRank("Iniciante 2"), 1);
    assert.equal(levelRank("intermediario_1"), 2);
    assert.equal(levelRank("Intermediário 1"), 2);
    assert.equal(levelRank("intermediario_2"), 3);
    assert.equal(levelRank("Intermediário 2"), 3);
    assert.equal(levelRank("open"), 5);
    assert.equal(levelRank("Open"), 5);
  });

  it("legados se comportam como o degrau inferior do split (aliasing)", () => {
    assert.equal(levelRank("iniciante"), 0);
    assert.equal(levelRank("Iniciante"), 0);
    assert.equal(levelRank("intermediario"), 2);
    assert.equal(levelRank("Intermediário"), 2);
    assert.equal(levelRank("basico"), 0);
    assert.equal(levelRank("Básico"), 0);
    assert.equal(levelRank("livre"), 5);
    assert.equal(levelRank(""), null);
    assert.equal(levelRank("xpto"), null);
    assert.equal(levelRank(undefined), null);
  });

  it("hierarquia é crescente", () => {
    assert.ok(levelRank("iniciante_1")! < levelRank("iniciante_2")!);
    assert.ok(levelRank("iniciante_2")! < levelRank("intermediario_1")!);
    assert.ok(levelRank("intermediario_1")! < levelRank("intermediario_2")!);
    assert.ok(levelRank("intermediario_2")! < levelRank("open")!);
  });
});

describe("category-level-eligibility · mapeamento de esporte", () => {
  it("mapeia esportes de torneio para o código do perfil", () => {
    assert.equal(tournamentSportToLevelSportCode("beachVolleyball"), "VOLEI_PRAIA");
    assert.equal(tournamentSportToLevelSportCode("indoorVolleyball"), "VOLEI_QUADRA");
    assert.equal(tournamentSportToLevelSportCode("footvolley"), "FUTEVOLEI");
    assert.equal(tournamentSportToLevelSportCode("beachTennis"), "BEACH_TENNIS");
  });

  it("desconhecidos não têm equivalente", () => {
    assert.equal(tournamentSportToLevelSportCode("xadrez"), null);
    assert.equal(tournamentSportToLevelSportCode(undefined), null);
  });
});

describe("category-level-eligibility · resolução de nível do atleta", () => {
  it("usa nível por esporte quando disponível (sportOnboarding.levelsBySport)", () => {
    const user = {
      level: "iniciante",
      sportOnboarding: {levelsBySport: {VOLEI_PRAIA: "open"}},
    };
    assert.equal(resolveAthleteLevelRank(user, "VOLEI_PRAIA"), 5);
  });

  it("ignora o campo fantasma levelsBySportFirestore (nunca foi escrito)", () => {
    // Sem guarda nas rules, aceitar esse campo abriria downgrade por fora —
    // o nível por esporte vem só de sportOnboarding.levelsBySport.
    const user = {
      level: "iniciante",
      levelsBySportFirestore: {VOLEI_PRAIA: "open"},
    };
    assert.equal(resolveAthleteLevelRank(user, "VOLEI_PRAIA"), 0);
  });

  it("resolve códigos novos por esporte", () => {
    const user = {
      level: "iniciante",
      sportOnboarding: {levelsBySport: {VOLEI_PRAIA: "intermediario_2"}},
    };
    assert.equal(resolveAthleteLevelRank(user, "VOLEI_PRAIA"), 3);
  });

  it("cai no nível global quando falta o por esporte", () => {
    const user = {level: "intermediario", sportOnboarding: {levelsBySport: {}}};
    assert.equal(resolveAthleteLevelRank(user, "VOLEI_PRAIA"), 2);
  });

  it("sem nenhum nível → iniciante (permissivo)", () => {
    assert.equal(resolveAthleteLevelRank({}, "VOLEI_PRAIA"), 0);
    assert.equal(resolveAthleteLevelRank(null, "VOLEI_PRAIA"), 0);
  });

  it("esporte sem equivalente (sportCode null) usa nível global", () => {
    const user = {
      level: "open",
      sportOnboarding: {levelsBySport: {VOLEI_PRAIA: "iniciante"}},
    };
    assert.equal(resolveAthleteLevelRank(user, null), 5);
  });
});

describe("category-level-eligibility · nível da categoria", () => {
  it("lê o nível da categoria (labels novos e legados)", () => {
    assert.equal(categoryLevelRank({level: "Iniciante"}), 0);
    assert.equal(categoryLevelRank({level: "Iniciante 2"}), 1);
    assert.equal(categoryLevelRank({level: "Intermediário"}), 2);
    assert.equal(categoryLevelRank({level: "Intermediário 2"}), 3);
    assert.equal(categoryLevelRank({level: "Open"}), 5);
  });

  it("categoria sem nível → Open (aceita todos)", () => {
    assert.equal(categoryLevelRank({}), 5);
    assert.equal(categoryLevelRank(null), 5);
  });

  it("categoria legada aceita atleta do degrau superior do split", () => {
    // Categoria antiga "Intermediário" (rank 2) NÃO comporta um atleta
    // migrado para intermediario_2 (rank 3) — precisa subir de categoria.
    assert.equal(isTeamEligible({categoryRank: 2, athleteRanks: [3]}), false);
    // Mas comporta o intermediario_1 (rank 2) e abaixo.
    assert.equal(isTeamEligible({categoryRank: 2, athleteRanks: [2, 0]}), true);
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
