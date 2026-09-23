import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {withArenaRole, splitCityState, ensureManagedArena} from "./arena-signup";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

describe("withArenaRole", () => {
  it("adds arena when the user has no roles yet", () => {
    assert.deepEqual(withArenaRole([]), ["arena"]);
  });

  it("adds arena alongside an existing role", () => {
    assert.deepEqual(withArenaRole(["athlete"]), ["athlete", "arena"]);
  });

  it("is a no-op when arena is already present", () => {
    assert.deepEqual(withArenaRole(["arena"]), ["arena"]);
  });

  it("never drops existing roles", () => {
    assert.deepEqual(withArenaRole(["athlete", "coach"]), ["athlete", "coach", "arena"]);
  });
});

describe("splitCityState", () => {
  it("separa no formato do placeholder do formulário", () => {
    assert.deepEqual(splitCityState("Florianópolis, SC"), {city: "Florianópolis", state: "SC"});
  });

  it("aceita barra, hífen e espaço como separador", () => {
    assert.deepEqual(splitCityState("Goiânia / GO"), {city: "Goiânia", state: "GO"});
    assert.deepEqual(splitCityState("Goiânia-go"), {city: "Goiânia", state: "GO"});
    assert.deepEqual(splitCityState("São Paulo SP"), {city: "São Paulo", state: "SP"});
  });

  it("sem UF, o texto todo é a cidade", () => {
    assert.deepEqual(splitCityState("Goiânia"), {city: "Goiânia", state: ""});
  });

  it("não transforma o fim do nome da cidade em UF", () => {
    assert.deepEqual(splitCityState("Mogi-Mirim"), {city: "Mogi-Mirim", state: ""});
    assert.deepEqual(splitCityState("Santa Cruz do Sul"), {city: "Santa Cruz do Sul", state: ""});
  });

  it("campo vazio ou ausente não inventa cidade", () => {
    assert.deepEqual(splitCityState("  "), {city: "", state: ""});
    assert.deepEqual(splitCityState(undefined), {city: "", state: ""});
  });
});

describe("ensureManagedArena", () => {
  it("cria a arena com o gestor como managerUserId e os dados do cadastro", async () => {
    const fake = new FakeFirestore();

    const arenaId = await ensureManagedArena(db(fake), "uid1", {
      arenaName: "Arena CFC",
      cityState: "Florianópolis, SC",
      whatsapp: "(48) 99999-0000",
    });

    const arena = fake.store.get(`arenas/${arenaId}`);
    assert.ok(arena);
    assert.equal(arena["id"], arenaId);
    assert.equal(arena["name"], "Arena CFC");
    assert.equal(arena["managerUserId"], "uid1");
    assert.equal(arena["status"], "active");
    assert.equal(arena["basePriceReais"], 0);
    assert.equal(arena["city"], "Florianópolis");
    assert.equal(arena["state"], "SC");
    assert.equal(arena["whatsapp"], "(48) 99999-0000");
  });

  it("nunca nasce com campos de plano nem como pré-cadastro", async () => {
    const fake = new FakeFirestore();

    const arenaId = await ensureManagedArena(db(fake), "uid1", {arenaName: "Arena CFC"});

    const arena = fake.store.get(`arenas/${arenaId}`) ?? {};
    for (const frozen of ["planTier", "planStatus", "planActiveUntil", "unclaimed"]) {
      assert.equal(frozen in arena, false, `${frozen} não pode vir do cadastro`);
    }
  });

  it("omite cidade/UF/WhatsApp em vez de gravar string vazia", async () => {
    const fake = new FakeFirestore();

    const arenaId = await ensureManagedArena(db(fake), "uid1", {
      arenaName: "Arena CFC",
      cityState: "  ",
      whatsapp: "",
    });

    const arena = fake.store.get(`arenas/${arenaId}`) ?? {};
    assert.equal("city" in arena, false);
    assert.equal("state" in arena, false);
    assert.equal("whatsapp" in arena, false);
  });

  it("chamada duas vezes devolve a mesma arena (retry não duplica)", async () => {
    const fake = new FakeFirestore();

    const first = await ensureManagedArena(db(fake), "uid1", {arenaName: "Arena CFC"});
    const second = await ensureManagedArena(db(fake), "uid1", {arenaName: "Arena CFC"});

    assert.equal(second, first);
    assert.equal([...fake.store.keys()].filter((k) => k.startsWith("arenas/")).length, 1);
  });

  it("arena de outro gestor não conta como a do usuário", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/outra", {id: "outra", name: "Arena Vizinha", managerUserId: "uid2"});

    const arenaId = await ensureManagedArena(db(fake), "uid1", {arenaName: "Arena CFC"});

    assert.notEqual(arenaId, "outra");
    assert.equal(fake.store.get(`arenas/${arenaId}`)?.["managerUserId"], "uid1");
  });
});

describe("ensureManagedArena + cadastro", () => {
  it("guarda o CNPJ do formulário, que antes era só validado e jogado fora", async () => {
    const fake = new FakeFirestore();

    const arenaId = await ensureManagedArena(db(fake), "uid1", {
      arenaName: "Arena CFC",
      cpfCnpj: "11.222.333/0001-81",
    });

    assert.deepEqual(fake.store.get(`arenas/${arenaId}/registration/data`), {
      cpfCnpj: "11222333000181",
    });
  });

  it("não deixa o CNPJ no doc público da arena, que qualquer um lê", async () => {
    const fake = new FakeFirestore();

    const arenaId = await ensureManagedArena(db(fake), "uid1", {
      arenaName: "Arena CFC",
      cpfCnpj: "11222333000181",
    });

    const arena = fake.store.get(`arenas/${arenaId}`) ?? {};
    assert.equal("cpfCnpj" in arena, false);
    assert.equal("cnpj" in arena, false);
  });

  it("sem CNPJ no formulário, não cria doc de cadastro vazio", async () => {
    const fake = new FakeFirestore();

    const arenaId = await ensureManagedArena(db(fake), "uid1", {arenaName: "Arena CFC"});

    assert.equal(fake.store.has(`arenas/${arenaId}/registration/data`), false);
  });

  it("ignora documento de tamanho impossível em vez de gravar lixo", async () => {
    const fake = new FakeFirestore();

    const arenaId = await ensureManagedArena(db(fake), "uid1", {
      arenaName: "Arena CFC",
      cpfCnpj: "1122233",
    });

    assert.equal(fake.store.has(`arenas/${arenaId}/registration/data`), false);
  });

  it("arena que já existe não tem o cadastro sobrescrito pelo retry", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/existente", {id: "existente", name: "Arena CFC", managerUserId: "uid1"});
    fake.seedDoc("arenas/existente/registration/data", {
      cpfCnpj: "11222333000181",
      razaoSocial: "Arena CFC Ltda",
    });

    await ensureManagedArena(db(fake), "uid1", {arenaName: "Arena CFC", cpfCnpj: "52998224725"});

    assert.deepEqual(fake.store.get("arenas/existente/registration/data"), {
      cpfCnpj: "11222333000181",
      razaoSocial: "Arena CFC Ltda",
    });
  });
});
