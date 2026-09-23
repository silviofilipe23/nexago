import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {resolveArenaCpfCnpj} from "./asaas-arena-customer";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

describe("resolveArenaCpfCnpj", () => {
  it("o documento vindo na chamada ganha de tudo", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/a1/registration/data", {cpfCnpj: "11222333000181"});

    const found = await resolveArenaCpfCnpj("a1", "uid1", "529.982.247-25", db(fake));

    assert.equal(found, "52998224725");
  });

  it("lê o cadastro da arena antes de qualquer fallback", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/a1", {id: "a1", managerUserId: "uid1", cnpj: "52998224725"});
    fake.seedDoc("arenas/a1/registration/data", {cpfCnpj: "11222333000181"});
    fake.seedDoc("users/uid1", {cpf: "52998224725"});

    const found = await resolveArenaCpfCnpj("a1", "uid1", undefined, db(fake));

    assert.equal(found, "11222333000181");
  });

  it("arena cadastrada antes da tela nova segue valendo pelo campo legado", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/a1", {id: "a1", managerUserId: "uid1", cnpj: "11222333000181"});

    const found = await resolveArenaCpfCnpj("a1", "uid1", undefined, db(fake));

    assert.equal(found, "11222333000181");
  });

  it("sem documento na arena, cai no do gestor", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/a1", {id: "a1", managerUserId: "uid1"});
    fake.seedDoc("users/uid1", {cpf: "529.982.247-25"});

    const found = await resolveArenaCpfCnpj("a1", "uid1", undefined, db(fake));

    assert.equal(found, "52998224725");
  });

  it("cadastro incompleto não bloqueia o fallback", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/a1", {id: "a1", managerUserId: "uid1"});
    fake.seedDoc("arenas/a1/registration/data", {razaoSocial: "Arena CFC Ltda"});
    fake.seedDoc("users/uid1", {cpf: "52998224725"});

    const found = await resolveArenaCpfCnpj("a1", "uid1", undefined, db(fake));

    assert.equal(found, "52998224725");
  });

  it("sem documento em lugar nenhum, avisa em vez de cobrar de quem não deve", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/a1", {id: "a1", managerUserId: "uid1"});

    await assert.rejects(
      () => resolveArenaCpfCnpj("a1", "uid1", undefined, db(fake)),
      /ARENA_CPF_CNPJ_REQUIRED/,
    );
  });
});
