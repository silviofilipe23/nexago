/**
 * `SEED_PASSWORD` tem de valer para TODOS os logins seed — organizador e
 * atletas — e a mensagem final tem de anunciar exatamente a senha gravada.
 *
 * Regressão coberta: o orquestrador chamava `seedAthletes` sem `password`, e a
 * lib caía no default `"Senha123!"`; com `SEED_PASSWORD=outra`, o organizador
 * ficava com "outra" e os 320 atletas com "Senha123!" — enquanto o script
 * imprimia "Senha dos logins seed: outra". O acoplamento é fácil de quebrar de
 * novo: são três pontos que precisam usar a mesma senha.
 *
 * Roda sem emulador, sem rede e sem `npm install`: firebase-admin e as libs de
 * seed são trocados por dublês na carga de módulos.
 *
 *   node --test test/seed-test-data-password.test.mjs
 */

import {describe, it} from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const SCRIPT = "../scripts/seed-test-data";

/**
 * Roda o orquestrador em modo `--yes` com todos os efeitos colaterais dublados,
 * devolvendo o que cada camada recebeu.
 */
async function runSeedScript({seedPasswordEnv}) {
  const captured = {
    organizerCreateUser: null,
    seedAthletesArgs: null,
    logs: [],
  };

  const fakeDoc = {set: async () => {}};
  const firestore = () => ({doc: () => fakeDoc});
  firestore.FieldValue = {serverTimestamp: () => "<serverTimestamp>"};

  const stubs = new Map([
    [
      "firebase-admin",
      {
        apps: [{}], // já "inicializado": parseArgs não chama initializeApp
        initializeApp: () => {},
        firestore,
        auth: () => ({
          // Organizador ainda não existe → cai no createUser. O script só cria
          // com esse `code`; qualquer outro erro ele repassa.
          getUserByEmail: async () => {
            const err = new Error("auth/user-not-found");
            err.code = "auth/user-not-found";
            throw err;
          },
          createUser: async (user) => {
            captured.organizerCreateUser = user;
            return {uid: "organizer-uid"};
          },
          setCustomUserClaims: async () => {},
        }),
      },
    ],
    [
      "./seed-athletes-lib",
      {
        generateKeywords: () => [],
        seedAthletes: async (args) => {
          captured.seedAthletesArgs = args;
          return {total: args.count * 10};
        },
      },
    ],
    [
      "./seed-tournament-enrollments-lib",
      {
        // O orquestrador lê `LEVELS`/`GENDERS` já em `parseArgs` (valores
        // aceitos por `--levels`/`--genders`): o dublê tem de expor as duas.
        LEVELS: [
          {code: "iniciante_1"},
          {code: "iniciante_2"},
          {code: "intermediario_1"},
          {code: "intermediario_2"},
          {code: "open"},
        ],
        GENDERS: [{type: "male"}, {type: "female"}],
        TOTAL_CATEGORIES: 10,
        MAX_TEAMS_PER_CATEGORY: 16,
        assertReusableSeedTournament: async () => {},
        buildCategories: () => [],
        buildTournamentDocFuture: () => ({}),
        buildTournamentDocToday: () => ({}),
        runTournamentEnrollmentSeed: async () => {},
      },
    ],
  ]);

  const originalLoad = Module._load;
  const originalArgv = process.argv;
  const originalSeedPassword = process.env.SEED_PASSWORD;
  const originalCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const originalLog = console.log;

  Module._load = function (request, ...rest) {
    if (stubs.has(request)) return stubs.get(request);
    return originalLoad.call(this, request, ...rest);
  };

  process.argv = ["node", "seed-test-data.js", "--project", "proj-teste", "--count", "2", "--yes"];
  // Credenciais reais da máquina não podem influenciar o teste.
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (seedPasswordEnv === undefined) {
    delete process.env.SEED_PASSWORD;
  } else {
    process.env.SEED_PASSWORD = seedPasswordEnv;
  }
  console.log = (...parts) => captured.logs.push(parts.join(" "));

  try {
    // O script captura as libs no topo: recarregar garante que ele pegue os
    // dublês desta execução, e não os da anterior.
    delete require.cache[require.resolve(SCRIPT)];
    // Sem `require.main === module`, o script apenas exporta `run`.
    const {run} = require(SCRIPT);
    await run();
  } finally {
    Module._load = originalLoad;
    process.argv = originalArgv;
    console.log = originalLog;
    if (originalSeedPassword === undefined) {
      delete process.env.SEED_PASSWORD;
    } else {
      process.env.SEED_PASSWORD = originalSeedPassword;
    }
    if (originalCredentials !== undefined) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = originalCredentials;
    }
  }

  return captured;
}

describe("seed-test-data: senha dos logins seed", () => {
  it("SEED_PASSWORD vale para organizador e atletas, e é a senha anunciada", async () => {
    const senha = "OutraSenha!42";
    const {organizerCreateUser, seedAthletesArgs, logs} = await runSeedScript({
      seedPasswordEnv: senha,
    });

    assert.equal(organizerCreateUser.password, senha);
    assert.equal(seedAthletesArgs.password, senha);
    assert.ok(
      logs.some((line) => line.includes(`Senha dos logins seed: ${senha}`)),
      "a mensagem final tem de anunciar a senha efetivamente usada",
    );
  });

  it("sem SEED_PASSWORD, os dois tipos de conta caem no mesmo default", async () => {
    const {organizerCreateUser, seedAthletesArgs, logs} = await runSeedScript({
      seedPasswordEnv: undefined,
    });

    assert.equal(organizerCreateUser.password, "Senha123!");
    assert.equal(seedAthletesArgs.password, "Senha123!");
    assert.ok(logs.some((line) => line.includes("Senha dos logins seed: Senha123!")));
  });

  it("organizador, atletas e mensagem final usam sempre a mesma senha", async () => {
    for (const seedPasswordEnv of [undefined, "Senha123!", "SenhaDoCI#1"]) {
      const {organizerCreateUser, seedAthletesArgs, logs} = await runSeedScript({
        seedPasswordEnv,
      });

      assert.equal(seedAthletesArgs.password, organizerCreateUser.password);
      assert.ok(
        logs.some((line) =>
          line.includes(`Senha dos logins seed: ${organizerCreateUser.password}`),
        ),
      );
    }
  });
});
