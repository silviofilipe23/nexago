import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {runAthleteLevelsMigrationPage} from "./rating-triggers";

/**
 * Firestore fake mínimo para a página de migração: pagina `users` a partir de
 * um mapa em memória e registra writes (set com merge + add de levelHistory).
 */
function mockDb(usersById: Record<string, Record<string, unknown>>) {
  const writes: Array<{path: string; data: Record<string, unknown>}> = [];
  const ids = Object.keys(usersById).sort();
  return {
    writes,
    collection: (path: string) => {
      if (path === "users") {
        const makeQuery = (startAfter?: string, limit?: number) => ({
          orderBy: () => makeQuery(startAfter, limit),
          limit: (n: number) => makeQuery(startAfter, n),
          startAfter: (id: string) => makeQuery(id, limit),
          get: async () => {
            const page = ids
              .filter((id) => (startAfter ? id > startAfter : true))
              .slice(0, limit ?? ids.length);
            return {
              docs: page.map((id) => ({
                id,
                data: () => usersById[id],
                ref: {
                  set: async (data: Record<string, unknown>) => {
                    writes.push({path: `users/${id}`, data});
                  },
                },
              })),
            };
          },
        });
        return makeQuery();
      }
      return {
        add: async (data: Record<string, unknown>) => {
          writes.push({path, data});
        },
      };
    },
  };
}

const PARAMS = {pageSize: 50, dryRun: false, callerUid: "admin"};

function levelsWritten(
  db: ReturnType<typeof mockDb>,
  uid: string,
): Record<string, string> | null {
  const write = db.writes.find((w) => w.path === `users/${uid}`);
  if (!write) return null;
  const onboarding = write.data["sportOnboarding"] as Record<string, unknown>;
  return onboarding["levelsBySport"] as Record<string, string>;
}

describe("runAthleteLevelsMigrationPage · normalização", () => {
  it("normaliza legados de qualquer esporte para o código do MESMO rank", async () => {
    const db = mockDb({
      u1: {
        sportOnboarding: {
          primarySportId: "VOLEI_PRAIA",
          secondarySportIds: ["BEACH_TENNIS"],
          levelsBySport: {
            VOLEI_PRAIA: "iniciante",
            BEACH_TENNIS: "intermediario",
            VOLEI_QUADRA: "INTERMEDIARIO",
          },
        },
      },
    });
    const result = await runAthleteLevelsMigrationPage(db as never, PARAMS);
    assert.equal(result.migrated, 1);
    assert.equal(result.normalized, 3);
    assert.equal(result.seeded, 0);
    assert.deepEqual(levelsWritten(db, "u1"), {
      VOLEI_PRAIA: "iniciante_1",
      BEACH_TENNIS: "intermediario_1",
      VOLEI_QUADRA: "intermediario_1",
    });
  });

  it("códigos já canônicos e valores desconhecidos não geram write", async () => {
    const db = mockDb({
      u1: {
        sportOnboarding: {
          primarySportId: "VOLEI_PRAIA",
          levelsBySport: {VOLEI_PRAIA: "intermediario_2", FUTEBOL: "xpto"},
        },
      },
    });
    const result = await runAthleteLevelsMigrationPage(db as never, PARAMS);
    assert.equal(result.migrated, 0);
    assert.equal(db.writes.length, 0);
  });
});

describe("runAthleteLevelsMigrationPage · seed de inscritos", () => {
  it("primário herda o nível global (label legado) no mesmo rank", async () => {
    const db = mockDb({
      u1: {
        level: "Intermediário",
        sportOnboarding: {primarySportId: "VOLEI_PRAIA", levelsBySport: {}},
      },
    });
    const result = await runAthleteLevelsMigrationPage(db as never, PARAMS);
    assert.equal(result.seeded, 1);
    assert.deepEqual(levelsWritten(db, "u1"), {VOLEI_PRAIA: "intermediario_1"});
  });

  it("cai em sportProfile.level e por fim em iniciante_1; secundários sempre iniciante_1", async () => {
    const db = mockDb({
      // Sem global, com sportProfile.level (código legado).
      u1: {
        sportProfile: {level: "open"},
        sportOnboarding: {
          primarySportId: "VOLEI_QUADRA",
          secondarySportIds: ["TENIS"],
          levelsBySport: {},
        },
      },
      // Sem nada: default iniciante_1.
      u2: {
        level: "Open",
        sportOnboarding: {
          primarySportId: "FUTEVOLEI",
          secondarySportIds: ["OUTROS"],
          levelsBySport: {FUTEVOLEI: "open"},
        },
      },
    });
    const result = await runAthleteLevelsMigrationPage(db as never, PARAMS);
    assert.deepEqual(levelsWritten(db, "u1"), {
      VOLEI_QUADRA: "open",
      TENIS: "iniciante_1",
    });
    // Primário já tinha nível — só o secundário é semeado (global NÃO propaga).
    assert.deepEqual(levelsWritten(db, "u2"), {OUTROS: "iniciante_1"});
    assert.equal(result.seeded, 3);
  });

  it("sem sportOnboarding não há o que semear (nada a chavear)", async () => {
    const db = mockDb({u1: {level: "Open"}});
    const result = await runAthleteLevelsMigrationPage(db as never, PARAMS);
    assert.equal(result.migrated, 0);
    assert.equal(db.writes.length, 0);
  });
});

describe("runAthleteLevelsMigrationPage · auditoria, idempotência e dryRun", () => {
  const legacyUser = () => ({
    level: "Intermediário",
    sportOnboarding: {
      primarySportId: "VOLEI_PRAIA",
      secondarySportIds: ["BEACH_TENNIS"],
      levelsBySport: {VOLEI_PRAIA: "iniciante"},
    },
  });

  it("grava um levelHistory por chave alterada (reason migration)", async () => {
    const db = mockDb({u1: legacyUser()});
    await runAthleteLevelsMigrationPage(db as never, PARAMS);
    const history = db.writes.filter((w) => w.path === "users/u1/levelHistory");
    assert.equal(history.length, 2);
    const bySport = Object.fromEntries(
      history.map((w) => [w.data["sportCode"], w.data]),
    );
    assert.equal(bySport["VOLEI_PRAIA"]["fromLevel"], "iniciante");
    assert.equal(bySport["VOLEI_PRAIA"]["toLevel"], "iniciante_1");
    assert.equal(bySport["BEACH_TENNIS"]["fromLevel"], null);
    assert.equal(bySport["BEACH_TENNIS"]["toLevel"], "iniciante_1");
    for (const w of history) {
      assert.equal(w.data["reason"], "migration");
      assert.equal(w.data["actor"], "admin");
    }
  });

  it("segunda rodada (doc já migrado) não escreve nada", async () => {
    const db = mockDb({
      u1: {
        level: "Intermediário",
        sportOnboarding: {
          primarySportId: "VOLEI_PRAIA",
          secondarySportIds: ["BEACH_TENNIS"],
          levelsBySport: {
            VOLEI_PRAIA: "iniciante_1",
            BEACH_TENNIS: "iniciante_1",
          },
        },
      },
    });
    const result = await runAthleteLevelsMigrationPage(db as never, PARAMS);
    assert.equal(result.migrated, 0);
    assert.equal(db.writes.length, 0);
  });

  it("dryRun conta sem escrever", async () => {
    const db = mockDb({u1: legacyUser()});
    const result = await runAthleteLevelsMigrationPage(db as never, {
      ...PARAMS,
      dryRun: true,
    });
    assert.equal(result.migrated, 1);
    assert.equal(result.normalized, 1);
    assert.equal(result.seeded, 1);
    assert.equal(db.writes.length, 0);
  });

  it("pagina por __name__ com startAfterId e reporta done", async () => {
    const db = mockDb({a: legacyUser(), b: legacyUser(), c: legacyUser()});
    const page1 = await runAthleteLevelsMigrationPage(db as never, {
      ...PARAMS,
      pageSize: 2,
    });
    assert.equal(page1.processed, 2);
    assert.equal(page1.lastId, "b");
    assert.equal(page1.done, false);
    const page2 = await runAthleteLevelsMigrationPage(db as never, {
      ...PARAMS,
      pageSize: 2,
      startAfterId: page1.lastId!,
    });
    assert.equal(page2.processed, 1);
    assert.equal(page2.done, true);
  });
});
