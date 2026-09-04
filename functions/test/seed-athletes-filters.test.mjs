/**
 * O recorte por nível/gênero do seed de atletas.
 *
 * Existe porque o pool nasce por (nível × gênero) e o orquestrador passou a
 * poder criar um torneio de UMA categoria: sem o recorte, `--count 20` criaria
 * 200 contas para usar 20.
 *
 * A segunda garantia é a que quebra em silêncio: o telefone saía de um
 * contador do laço, então pular combinações renumeraria todo mundo e o mesmo
 * e-mail — reaproveitado por idempotência — voltaria com outro telefone.
 *
 * Roda sem emulador e sem rede: `db` e `auth` são dublês.
 *
 *   node --test test/seed-athletes-filters.test.mjs
 */

import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const {seedAthletes, LEVELS, GENDERS} = require("../scripts/seed-athletes-lib");

const COUNT = 2;

async function runSeed(options = {}) {
  const profiles = new Map();
  const auth = {
    getUserByEmail: async () => {
      const err = new Error("auth/user-not-found");
      err.code = "auth/user-not-found";
      throw err;
    },
    createUser: async ({email}) => ({uid: `uid-${email}`}),
    setCustomUserClaims: async () => {},
  };
  const db = {
    doc: () => ({
      set: async (profile) => profiles.set(profile.email, profile),
    }),
  };

  const {total} = await seedAthletes({
    db,
    auth,
    count: COUNT,
    log: () => {},
    ...options,
  });
  return {total, profiles};
}

describe("seed de atletas: recorte por nível e gênero", () => {
  it("sem recorte, cria as 10 combinações (comportamento original)", async () => {
    const {total, profiles} = await runSeed();
    assert.equal(total, COUNT * LEVELS.length * GENDERS.length);
    assert.equal(profiles.size, total);
  });

  it("levels + genders reduzem o pool a uma combinação só", async () => {
    const {total, profiles} = await runSeed({
      levels: ["open"],
      genders: ["male"],
    });
    assert.equal(total, COUNT);
    assert.deepEqual(
      [...profiles.keys()].sort(),
      ["seed-open-m-01@nexago.test", "seed-open-m-02@nexago.test"],
    );
    assert.equal(profiles.get("seed-open-m-01@nexago.test").level, "Open");
    assert.equal(
      profiles.get("seed-open-m-01@nexago.test").gender,
      "Masculino",
    );
  });

  it("o recorte não renumera o telefone de quem já existia", async () => {
    const {profiles: completo} = await runSeed();
    const {profiles: recortado} = await runSeed({
      levels: ["open"],
      genders: ["male"],
    });

    for (const [email, profile] of recortado.entries()) {
      assert.equal(
        profile.phoneNumber,
        completo.get(email).phoneNumber,
        `${email} mudaria de telefone sob recorte`,
      );
    }
  });

  it("recorte de um eixo só mantém o outro inteiro", async () => {
    const {profiles} = await runSeed({genders: ["female"]});
    assert.equal(profiles.size, COUNT * LEVELS.length);
    assert.ok(
      [...profiles.keys()].every((email) => email.includes("-f-")),
      "nenhum masculino deveria ter sido criado",
    );
  });

  it("recorte vazio ou ausente vale como 'todos'", async () => {
    for (const empty of [[], undefined, null]) {
      const {total} = await runSeed({levels: empty, genders: empty});
      assert.equal(total, COUNT * LEVELS.length * GENDERS.length);
    }
  });
});
