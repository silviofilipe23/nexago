import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "../fake-firestore.test-helper";
import {FakeIssuer} from "./fake-issuer.test-helper";
import {saveArenaFiscalConfigCore, setArenaFiscalModeCore} from "./arena-fiscal-config";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedArena(fake: FakeFirestore): void {
  fake.seedDoc("arenas/arena1", {managerUserId: "manager1", name: "Arena X"});
}

const input = {
  arenaId: "arena1",
  callerUid: "manager1",
  cnpj: "12345678000199",
  razaoSocial: "Arena X Ltda",
  inscricaoMunicipal: "123456",
  regimeTributario: "simples_nacional" as const,
  enderecoFiscal: {
    logradouro: "Rua A",
    numero: "10",
    bairro: "Centro",
    municipio: "Goiânia",
    uf: "GO",
    cep: "74000000",
    codigoIbge: "5208707",
  },
  services: [{id: "s1", codigoMunicipal: "3.03", descricao: "Locação de quadra", aliquotaIss: 2}],
  defaultServiceIdBooking: "s1",
  certificadoBase64: "BASE64_SECRETO",
  senhaCertificado: "senha123",
  authorizationAccepted: true,
  authorizationTermVersion: "v1",
};

describe("saveArenaFiscalConfigCore", () => {
  it("grava a config em testing e guarda só o nome do secret", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    const saved: Array<{name: string; value: string}> = [];

    await saveArenaFiscalConfigCore(
      db(fake),
      new FakeIssuer(),
      async (name, value) => {
        saved.push({name, value});
      },
      input,
    );

    const config = fake.store.get("arenas/arena1/fiscal/config");
    assert.equal(config?.status, "testing");
    assert.equal(config?.mode, "off");
    assert.equal(config?.issuerId, "emp_12345678000199");
    assert.equal(config?.credentialSecretName, "fiscal-issuer-token-arena1");
    assert.equal(saved[0].value, "tok_teste");
  });

  it("nunca grava certificado nem senha no Firestore", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    await saveArenaFiscalConfigCore(db(fake), new FakeIssuer(), async () => {}, input);

    const serialized = JSON.stringify(fake.store.get("arenas/arena1/fiscal/config"));
    assert.equal(serialized.includes("BASE64_SECRETO"), false);
    assert.equal(serialized.includes("senha123"), false);
  });

  it("registra o aceite do termo com autor e versão", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    await saveArenaFiscalConfigCore(db(fake), new FakeIssuer(), async () => {}, input);

    const config = fake.store.get("arenas/arena1/fiscal/config");
    assert.equal(config?.authorizationAcceptedByUid, "manager1");
    assert.equal(config?.authorizationTermVersion, "v1");
    assert.ok(config?.authorizationAcceptedAt);
  });

  it("recusa salvar sem aceite do termo — não se emite nota por terceiro sem autorização", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    await assert.rejects(
      () =>
        saveArenaFiscalConfigCore(
          db(fake),
          new FakeIssuer(),
          async () => {},
          {...input, authorizationAccepted: false},
        ),
      /invalid-argument|AUTHORIZATION/,
    );
    assert.equal(fake.store.get("arenas/arena1/fiscal/config"), undefined);
  });

  it("recusa quem não é gestor da arena", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    await assert.rejects(
      () =>
        saveArenaFiscalConfigCore(
          db(fake),
          new FakeIssuer(),
          async () => {},
          {...input, callerUid: "intruso"},
        ),
      /permission-denied|PERMISSION/,
    );
  });

  it("recusa serviço padrão que não está no catálogo", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    await assert.rejects(
      () =>
        saveArenaFiscalConfigCore(
          db(fake),
          new FakeIssuer(),
          async () => {},
          {...input, defaultServiceIdBooking: "inexistente"},
        ),
      /invalid-argument|INVALID/,
    );
  });
});

describe("setArenaFiscalModeCore", () => {
  it("liga o modo sempre só depois da config ativa", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    fake.seedDoc("arenas/arena1/fiscal/config", {status: "active", mode: "off", services: []});

    await setArenaFiscalModeCore(db(fake), {
      arenaId: "arena1",
      callerUid: "manager1",
      mode: "always",
    });

    assert.equal(fake.store.get("arenas/arena1/fiscal/config")?.mode, "always");
  });

  it("recusa ligar antes da config estar ativa", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    fake.seedDoc("arenas/arena1/fiscal/config", {status: "testing", mode: "off", services: []});

    await assert.rejects(
      () =>
        setArenaFiscalModeCore(db(fake), {
          arenaId: "arena1",
          callerUid: "manager1",
          mode: "always",
        }),
      /failed-precondition|NOT_ACTIVE/,
    );
  });
});
