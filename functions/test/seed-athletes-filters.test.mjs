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
const {seedAthletes, avatarUrlFor, LEVELS, GENDERS} = require(
  "../scripts/seed-athletes-lib",
);

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

describe("seed de atletas: nome de gente", () => {
  const namesOf = (type) => GENDERS.find((g) => g.type === type).names;

  it("nome sai no formato `<Primeiro nome> <nº>`", async () => {
    const {profiles} = await runSeed({levels: ["iniciante_1"], genders: ["male"]});
    const [first, second] = namesOf("male");
    assert.deepEqual(
      [...profiles.values()].map((p) => p.fullName).sort(),
      [`${first} 01`, `${second} 02`],
    );
  });

  it("o gênero escolhe a lista de nomes", async () => {
    const {profiles} = await runSeed({levels: ["open"], genders: ["female"]});
    for (const {fullName} of profiles.values()) {
      const [firstName] = fullName.split(" ");
      assert.ok(
        namesOf("female").includes(firstName),
        `"${firstName}" não é nome da lista feminina`,
      );
    }
  });

  it("o número é global: ninguém repete nome, nem quando a lista gira", async () => {
    const {profiles, total} = await runSeed();
    const nomes = new Set([...profiles.values()].map((p) => p.fullName));
    assert.equal(nomes.size, total);
  });

  it("o número do nome não renumera sob recorte", async () => {
    const {profiles: completo} = await runSeed();
    const {profiles: recortado} = await runSeed({
      levels: ["open"],
      genders: ["female"],
    });
    for (const [email, profile] of recortado.entries()) {
      assert.equal(profile.fullName, completo.get(email).fullName);
    }
  });

  it("o nome não manda no e-mail — é ele que dá a idempotência", async () => {
    const {profiles} = await runSeed({levels: ["intermediario_2"], genders: ["male"]});
    assert.ok(profiles.has("seed-intermediario_2-m-01@nexago.test"));
  });

  it("nível e gênero continuam achaveis na busca, apesar do nome de gente", async () => {
    const {profiles} = await runSeed({levels: ["intermediario_2"], genders: ["female"]});
    const {fullName, keywords} = profiles.get("seed-intermediario_2-f-01@nexago.test");
    const firstName = fullName.split(" ")[0].toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const term of ["fem", "int", "int_2", firstName]) {
      assert.ok(keywords.includes(term), `busca por "${term}" não acharia o atleta`);
    }
  });

  it("todo atleta nasce com avatar no campo canônico da foto", async () => {
    const {profiles, total} = await runSeed();
    const urls = [...profiles.values()].map((p) => p.profilePhotoUrl);
    assert.ok(urls.every((u) => typeof u === "string" && u.startsWith("https://")));
    assert.equal(new Set(urls).size, total, "avatares repetidos entre atletas");
  });

  it("o avatar é do e-mail, não do nome: renomear não troca a cara", async () => {
    const {profiles} = await runSeed({levels: ["open"], genders: ["male"]});
    const {profilePhotoUrl} = profiles.get("seed-open-m-01@nexago.test");
    assert.equal(profilePhotoUrl, avatarUrlFor("open-m-01", "male"));
    assert.ok(
      profilePhotoUrl.includes("seed=open-m-01"),
      `seed do avatar fora do esperado: ${profilePhotoUrl}`,
    );
  });

  it("a conta que já existia é atualizada — nome e foto novos chegam no Auth", async () => {
    const atualizados = [];
    const {profiles} = await runSeed({
      levels: ["open"],
      genders: ["male"],
      auth: {
        getUserByEmail: async (email) => ({
          uid: `uid-${email}`,
          displayName: "nome antigo",
          photoURL: null,
        }),
        updateUser: async (uid, patch) => atualizados.push({uid, ...patch}),
        createUser: async () => assert.fail("não deveria criar conta que existe"),
        setCustomUserClaims: async () => {},
      },
    });
    assert.equal(atualizados.length, profiles.size);
    const primeiro = profiles.get("seed-open-m-01@nexago.test");
    assert.equal(atualizados[0].displayName, primeiro.fullName);
    assert.equal(atualizados[0].photoURL, primeiro.profilePhotoUrl);
  });

  it("nada a mudar no Auth não gera escrita", async () => {
    let updates = 0;
    await runSeed({
      levels: ["open"],
      genders: ["male"],
      auth: {
        getUserByEmail: async (email) => {
          const nn = email.slice("seed-open-m-".length, -"@nexago.test".length);
          const seq = 4 * GENDERS.length * COUNT + Number(nn);
          const names = GENDERS.find((g) => g.type === "male").names;
          return {
            uid: `uid-${email}`,
            displayName: `${names[(seq - 1) % names.length]} ${String(seq).padStart(2, "0")}`,
            photoURL: avatarUrlFor(`open-m-${nn}`, "male"),
          };
        },
        updateUser: async () => {
          updates += 1;
        },
        createUser: async () => assert.fail("não deveria criar conta que existe"),
        setCustomUserClaims: async () => {},
      },
    });
    assert.equal(updates, 0);
  });

  it("o nível de verdade segue no perfil, não no nome", async () => {
    const {profiles} = await runSeed({levels: ["intermediario_1"], genders: ["male"]});
    const profile = profiles.get("seed-intermediario_1-m-01@nexago.test");
    assert.equal(profile.level, "Intermediário 1");
    assert.equal(profile.sportProfile.level, "intermediario_1");
  });
});
