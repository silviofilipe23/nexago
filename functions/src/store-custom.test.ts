import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  DEFAULT_CUSTOMIZATION,
  createCustomBatchCore,
  customizationErrors,
  nextCustomStatus,
  normalizeTerms,
  reviewCustomItemCore,
  saveBlocklistCore,
  saveCustomizationCore,
  withCustomizationDefaults,
  type CustomizationConfig,
} from "./store-custom";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.store.set("storeProducts/p1", {name: "Camiseta personalizada", priceCents: 12990});
  return {fake, db: fake as unknown as Firestore};
}

const ACTOR = {uid: "admin1", name: "Ana Souza"};
const NOW = new Date("2026-10-16T18:00:00Z");

function config(over: (c: CustomizationConfig) => void = () => undefined): CustomizationConfig {
  const c = structuredClone(DEFAULT_CUSTOMIZATION);
  c.active = true;
  over(c);
  return c;
}

function fieldsOf(err: unknown): string[] {
  return (err as {details?: {fields: string[]}}).details?.fields ?? [];
}

function item(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    orderCode: "NX-4835", productName: "Camiseta", variantLabel: "Preta · M", name: "ANTUNES",
    font: "bloco", nameColor: "#ffffff", namePlacement: "costas_superior", status: "aprovar", version: 1, ...over,
  };
}

describe("configuração de personalização", () => {
  it("o padrão (ativado) é válido", () => {
    assert.deepEqual(customizationErrors(config()), []);
  });

  it("nome ligado exige fonte e cor; imagem ligada exige área", () => {
    assert.deepEqual(
      customizationErrors(config((c) => {
        c.name.fonts = c.name.fonts.map((f) => ({...f, enabled: false}));
        c.image.areas = c.image.areas.map((a) => ({...a, enabled: false}));
      })),
      ["image", "name"],
    );
    // Desligados, não exigem nada.
    assert.deepEqual(
      customizationErrors(config((c) => {
        c.name.colors = [];
        c.image.enabled = false;
        c.image.areas = c.image.areas.map((a) => ({...a, enabled: false}));
      })),
      ["name"],
    );
  });

  it("ativa sem nome nem imagem é recusada; desativada pode", () => {
    const off = (c: CustomizationConfig) => {
      c.name.enabled = false;
      c.image.enabled = false;
    };
    assert.deepEqual(customizationErrors(config(off)), ["active"]);
    assert.deepEqual(customizationErrors(config((c) => {
      off(c);
      c.active = false;
    })), []);
  });

  it("grava no doc à parte, com cor em minúsculo", async () => {
    const {fake, db} = makeDb();
    await saveCustomizationCore(db, {productId: "p1", config: config((c) => {
      c.name.colors = ["#FF6A1A"];
    })}, ACTOR, NOW);
    const doc = fake.store.get("storeProductCustomization/p1")!;
    assert.equal(doc["active"], true);
    assert.deepEqual((doc["name"] as {colors: string[]}).colors, ["#ff6a1a"]);
    assert.equal(fake.store.get("storeProducts/p1")!["name"], "Camiseta personalizada");
  });

  it("produto inexistente é not-found; valores fora da faixa viram campo", async () => {
    const {db} = makeDb();
    await assert.rejects(saveCustomizationCore(db, {productId: "x", config: config()}, ACTOR, NOW), {code: "not-found"});
    await assert.rejects(
      saveCustomizationCore(db, {productId: "p1", config: config((c) => {
        c.name.maxChars = 30;
        c.production.leadDays = 0;
      })}, ACTOR, NOW),
      (err) => {
        assert.deepEqual(fieldsOf(err), ["name", "production"]);
        return true;
      },
    );
  });

  it("costas ligadas exigem imagem ou número; dígitos de 1 a 3", () => {
    assert.deepEqual(customizationErrors(config((c) => {
      c.back.enabled = true;
      c.back.allowImage = false;
      c.back.allowNumber = false;
    })), ["back"]);
    assert.deepEqual(customizationErrors(config((c) => {
      c.back.numberMaxDigits = 4;
    })), ["back"]);
    // Só as costas ligadas já é personalização suficiente.
    assert.deepEqual(customizationErrors(config((c) => {
      c.name.enabled = false;
      c.image.enabled = false;
      c.back.enabled = true;
    })), []);
  });

  it("doc antigo com número junto do nome vira costas só com número", () => {
    const c = withCustomizationDefaults({active: true, name: {maxChars: 10, allowNumber: true}});
    assert.deepEqual(
      {enabled: c.back.enabled, allowImage: c.back.allowImage, allowNumber: c.back.allowNumber},
      {enabled: true, allowImage: false, allowNumber: true},
    );
    assert.equal("allowNumber" in c.name, false);
    assert.equal(withCustomizationDefaults({name: {allowNumber: false}}).back.enabled, false);
  });

  it("não grava o allowNumber antigo que um cliente desatualizado mande", async () => {
    const {fake, db} = makeDb();
    const legacy = config() as CustomizationConfig & {name: {allowNumber?: boolean}};
    legacy.name.allowNumber = true;
    await saveCustomizationCore(db, {productId: "p1", config: legacy}, ACTOR, NOW);
    const doc = fake.store.get("storeProductCustomization/p1")!;
    assert.equal("allowNumber" in (doc["name"] as object), false);
    assert.equal((doc["back"] as {enabled: boolean}).enabled, false);
  });

  it("doc antigo ganha campos novos do padrão", () => {
    const c = withCustomizationDefaults({active: true, name: {maxChars: 8}});
    assert.equal(c.name.maxChars, 8);
    assert.equal(c.name.placement, "costas_superior");
    assert.equal(c.image.areas.length, 3);
  });
});

describe("lista de bloqueio", () => {
  it("normaliza acento e caixa, sem repetir", async () => {
    assert.deepEqual(normalizeTerms(["Pálavra", "palavra", " Outra ", ""]), ["outra", "palavra"]);
    const {fake, db} = makeDb();
    const {count} = await saveBlocklistCore(db, {terms: ["B", "a", "A"]}, ACTOR, NOW);
    assert.equal(count, 2);
    assert.deepEqual(fake.store.get("storeConfig/blocklist")!["terms"], ["a", "b"]);
  });
});

describe("fila de arte", () => {
  it("transições válidas", () => {
    assert.equal(nextCustomStatus("aprovar", "aprovar"), "producao");
    assert.equal(nextCustomStatus("aprovar", "nova_imagem"), "nova_imagem");
    assert.equal(nextCustomStatus("nova_imagem", "reprovar"), "reprovado");
    assert.equal(nextCustomStatus("producao", "pronto"), "pronto");
    assert.equal(nextCustomStatus("producao", "aprovar"), null);
    assert.equal(nextCustomStatus("pronto", "reprovar"), null);
  });

  it("aprovar registra quem e quando, e sobe a versão", async () => {
    const {fake, db} = makeDb();
    fake.store.set("storeCustomItems/i1", item());
    const r = await reviewCustomItemCore(db, {itemId: "i1", version: 1, action: "aprovar"}, ACTOR, NOW);
    assert.deepEqual(r, {status: "producao", version: 2});
    const doc = fake.store.get("storeCustomItems/i1")!;
    assert.deepEqual(doc["approvedBy"], ACTOR);
    assert.equal((doc["history"] as unknown[]).length, 1);
  });

  it("pedir nova imagem exige motivo (e texto quando é 'outro')", async () => {
    const {fake, db} = makeDb();
    fake.store.set("storeCustomItems/i1", item());
    await assert.rejects(
      reviewCustomItemCore(db, {itemId: "i1", version: 1, action: "nova_imagem", reason: "outro"}, ACTOR, NOW),
      (err) => {
        assert.deepEqual(fieldsOf(err), ["reason"]);
        return true;
      },
    );
    await reviewCustomItemCore(db, {itemId: "i1", version: 1, action: "nova_imagem", reason: "baixa_resolucao"}, ACTOR, NOW);
    assert.equal((fake.store.get("storeCustomItems/i1")!["request"] as {reason: string}).reason, "baixa_resolucao");
  });

  it("reprovar deixa o reembolso pendente com o escopo escolhido", async () => {
    const {fake, db} = makeDb();
    fake.store.set("storeCustomItems/i1", item({status: "nova_imagem"}));
    await reviewCustomItemCore(db, {itemId: "i1", version: 1, action: "reprovar", refundScope: "item"}, ACTOR, NOW);
    const doc = fake.store.get("storeCustomItems/i1")!;
    assert.equal(doc["status"], "reprovado");
    assert.deepEqual((doc["refund"] as {scope: string; status: string}), {scope: "item", status: "pendente", at: NOW, by: ACTOR});
  });

  it("versão velha e ação fora do status são recusadas", async () => {
    const {fake, db} = makeDb();
    fake.store.set("storeCustomItems/i1", item({version: 3}));
    await assert.rejects(reviewCustomItemCore(db, {itemId: "i1", version: 2, action: "aprovar"}, ACTOR, NOW), {
      code: "failed-precondition",
    });
    await assert.rejects(reviewCustomItemCore(db, {itemId: "i1", version: 3, action: "pronto"}, ACTOR, NOW), {
      code: "failed-precondition",
    });
  });

  it("lote leva só aprovados sem lote, e marca os itens", async () => {
    const {fake, db} = makeDb();
    fake.store.set("storeCustomItems/a", item({
      status: "producao", units: [{name: "ANA", number: "7"}, {name: "BIA", number: "10"}],
      back: {type: "numero", number: "10"},
    }));
    fake.store.set("storeCustomItems/b", item({status: "producao", batchId: "antigo"}));
    fake.store.set("storeCustomItems/c", item({status: "aprovar"}));
    const {batchId, rows} = await createCustomBatchCore(db, ACTOR, NOW);

    assert.deepEqual(rows.map((r) => r.itemId), ["a"]);
    assert.deepEqual(rows[0]!.names, ["ANA", "BIA"]);
    assert.deepEqual(rows[0]!.numbers, ["7", "10"]);
    assert.equal(rows[0]!.back, "nº 10");
    assert.equal(fake.store.get("storeCustomItems/a")!["batchId"], batchId);
    assert.equal(fake.store.get("storeCustomItems/b")!["batchId"], "antigo");
    assert.deepEqual(fake.store.get(`storeCustomBatches/${batchId}`)!["itemIds"], ["a"]);

    await assert.rejects(createCustomBatchCore(db, ACTOR, NOW), {code: "failed-precondition"});
  });
});
