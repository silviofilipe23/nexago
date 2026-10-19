import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  addCustomItemToCartCore,
  customExtraCents,
  effectiveDpi,
  imageQuality,
  imageSizeFromBytes,
  nameIsBlocked,
  nameProblem,
  normalizeCustomName,
  publicCustomization,
  type UploadInfo,
} from "./store-custom-cart";

const NOW = new Date("2026-10-17T15:00:00Z");

function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

function jpeg(width: number, height: number): Buffer {
  // SOI · APP0 (16 bytes) · SOF0 com altura e largura.
  const app0 = Buffer.alloc(18);
  app0[0] = 0xff;
  app0[1] = 0xe0;
  app0.writeUInt16BE(16, 2);
  const sof = Buffer.alloc(19);
  sof[0] = 0xff;
  sof[1] = 0xc0;
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
}

describe("publicCustomization", () => {
  it("desligada não vai; ligada leva só o que está ativo e o preço a partir de", () => {
    assert.equal(publicCustomization(null), null);
    assert.equal(publicCustomization({active: false}), null);
    const out = publicCustomization({
      active: true,
      updatedAt: new Date("2026-10-16T12:00:00Z"),
      name: {fonts: [{id: "bloco", enabled: true}, {id: "classica", enabled: false}, {id: "mono", enabled: true}]},
      image: {
        areas: [
          {id: "peito_esquerdo", name: "Peito esquerdo", widthCm: 9, heightCm: 9, enabled: true},
          {id: "manga", name: "Manga", widthCm: 7, heightCm: 7, enabled: false},
        ],
      },
    })!;
    assert.equal(out.fromCents, 1490);
    assert.equal(out.version, Date.parse("2026-10-16T12:00:00Z"));
    assert.deepEqual(out.name.fonts, ["bloco", "mono"]);
    assert.deepEqual(out.image.areas.map((a) => a.id), ["peito_esquerdo"]);
    assert.deepEqual(out.price, {nameOnlyCents: 1490, imageOnlyCents: 1990, bothCents: 2490, backCents: 990});
    assert.equal(out.back.enabled, false, "costas desligadas por padrão");
    assert.ok(!JSON.stringify(out).includes("printShop"), "gráfica não vai para a vitrine");
  });

  it("opção ligada sem fonte/área conta como desligada", () => {
    const out = publicCustomization({
      active: true,
      name: {enabled: true, fonts: [{id: "bloco", enabled: false}, {id: "classica", enabled: false}, {id: "mono", enabled: false}]},
      image: {enabled: false},
    })!;
    assert.equal(out.name.enabled, false);
    assert.equal(out.image.enabled, false);
    assert.equal(out.fromCents, 0);
  });
});

describe("nome", () => {
  it("maiúsculas, sem espaço nas pontas nem duplo", () => {
    assert.equal(normalizeCustomName("  antunes   jr. "), "ANTUNES JR.");
    assert.equal(normalizeCustomName(42), "");
  });

  it("caracteres, tamanho e vazio", () => {
    const cfg = {maxChars: 12, blockOffensive: true};
    assert.equal(nameProblem("JOÃO-PEDRO 10", {...cfg, maxChars: 13}, []), null);
    assert.equal(nameProblem("", cfg, []), "empty");
    assert.equal(nameProblem("ANTUNES!", cfg, []), "chars");
    assert.equal(nameProblem("ANTUNES SILVA", cfg, []), "length");
  });

  it("bloqueio por palavra inteira, sem acento e sem caixa", () => {
    const terms = ["cu", "filho da mae"];
    assert.equal(nameIsBlocked("CUNHA", terms), false);
    assert.equal(nameIsBlocked("CU", terms), true);
    assert.equal(nameIsBlocked("FILHO DA MÃE", terms), true);
    assert.equal(nameProblem("CU", {maxChars: 12, blockOffensive: false}, terms), null);
    assert.equal(nameProblem("CU", {maxChars: 12, blockOffensive: true}, terms), "blocked");
  });
});

describe("costas no espelho", () => {
  it("ligadas com número e/ou imagem; imagem sem formato não vale; entram no 'a partir de'", () => {
    const only = publicCustomization({
      active: true,
      name: {enabled: false},
      image: {enabled: false},
      back: {enabled: true, allowNumber: true, allowImage: false, numberMaxDigits: 2, widthCm: 25, heightCm: 25},
      price: {backCents: 990},
    })!;
    assert.deepEqual(only.back, {enabled: true, allowNumber: true, allowImage: false, numberMaxDigits: 2, widthCm: 25, heightCm: 25});
    assert.equal(only.fromCents, 990);
    const semFormato = publicCustomization({
      active: true,
      image: {enabled: false, formats: []},
      back: {enabled: true, allowNumber: false, allowImage: true},
    })!;
    assert.equal(semFormato.back.enabled, false);
    // Doc antigo com "número junto do nome" vira costas só com número.
    const legado = publicCustomization({active: true, name: {allowNumber: true}})!;
    assert.equal(legado.back.enabled, true);
    // `back: null` (o doc da camiseta no DEV) é o mesmo caso.
    assert.equal(publicCustomization({active: true, name: {allowNumber: true}, back: null})!.back.allowNumber, true);
    assert.equal(legado.back.allowNumber, true);
    assert.equal(legado.back.allowImage, false);
  });
});

describe("preço e qualidade", () => {
  const price = {nameOnlyCents: 1490, imageOnlyCents: 1990, bothCents: 2490};
  it("juntos saem pelo preço de ambos", () => {
    assert.equal(customExtraCents(price, true, true), 2490);
    assert.equal(customExtraCents(price, true, false), 1490);
    assert.equal(customExtraCents(price, false, true), 1990);
    assert.equal(customExtraCents(price, false, false), 0);
    // As costas somam por cima de qualquer combinação.
    const withBack = {...price, backCents: 990};
    assert.equal(customExtraCents(withBack, true, true, true), 3480);
    assert.equal(customExtraCents(withBack, false, false, true), 990);
  });

  it("dpi efetivo pelo lado mais fraco; 300 é boa qualidade", () => {
    const peito = {widthCm: 9, heightCm: 9};
    // 2400 px em 9 cm = 677 dpi.
    assert.equal(imageQuality(effectiveDpi({widthPx: 2400, heightPx: 2400}, peito)), "good");
    // 1000 px em 30 cm = 85 dpi.
    assert.equal(imageQuality(effectiveDpi({widthPx: 2000, heightPx: 1000}, {widthCm: 25, heightCm: 30})), "warn");
    assert.equal(effectiveDpi(null, peito), Number.POSITIVE_INFINITY);
  });

  it("lê largura e altura de PNG, JPEG e SVG", () => {
    assert.deepEqual(imageSizeFromBytes(png(2400, 1800)), {widthPx: 2400, heightPx: 1800});
    assert.deepEqual(imageSizeFromBytes(jpeg(1200, 900)), {widthPx: 1200, heightPx: 900});
    assert.deepEqual(imageSizeFromBytes(Buffer.from('<svg xmlns="x" viewBox="0 0 512 256"></svg>')), {widthPx: 512, heightPx: 256});
    assert.deepEqual(imageSizeFromBytes(Buffer.from('<svg width="300" height="200">')), {widthPx: 300, heightPx: 200});
    assert.equal(imageSizeFromBytes(Buffer.from("nada")), null);
  });
});

describe("addCustomItemToCartCore", () => {
  function makeDb(over: {customization?: Record<string, unknown>; stock?: number; cartItems?: unknown[]} = {}) {
    const fake = new FakeFirestore();
    fake.seedDoc("storeProducts/cam", {status: "ativo", active: true, priceCents: 12990});
    fake.seedDoc("storeProducts/cam/skus/preto_m", {priceCents: null, stockByLocation: {cd: over.stock ?? 4}});
    fake.seedDoc("storeProductCustomization/cam", {active: true, updatedAt: new Date("2026-10-16T12:00:00Z"), ...over.customization});
    fake.seedDoc("storeConfig/blocklist", {terms: ["palavrao"]});
    if (over.cartItems) fake.seedDoc("storeCarts/ana", {items: over.cartItems});
    return {fake, db: fake as unknown as Firestore};
  }
  const upload = (info: Partial<UploadInfo> = {}) => async (): Promise<UploadInfo | null> => ({
    contentType: "image/png",
    sizeBytes: 1_800_000,
    head: png(2400, 2400),
    ...info,
  });
  const PATH = "store/custom-uploads/ana/up1";

  it("nome + imagem: linha nova com o preço de ambos e a qualidade", async () => {
    const {fake, db} = makeDb({cartItems: [{productId: "cam", skuId: "preto_m", qty: 1}]});
    const out = await addCustomItemToCartCore(db, "ana", {
      productId: "cam", skuId: "preto_m", qty: 2,
      name: {text: " antunes ", fontId: "bloco", color: "#FFFFFF"},
      image: {path: PATH, areaId: "peito_esquerdo", transform: {x: 0.4, y: 2, scale: 0.8}},
    }, upload(), NOW, () => "line-1");
    assert.deepEqual(out, {lineId: "line-1", extraPriceCents: 2490, unitPriceCents: 15480, quality: "good"});
    const items = fake.store.get("storeCarts/ana")!["items"] as Array<Record<string, any>>;
    assert.equal(items.length, 2, "não soma com a linha comum do mesmo SKU");
    const line = items[1]!;
    assert.equal(line["lineId"], "line-1");
    assert.equal(line["qty"], 2);
    assert.deepEqual(line["customization"]["name"], {text: "ANTUNES", fontId: "bloco", color: "#ffffff", placement: "costas_superior"});
    assert.equal(line["customization"]["image"]["areaName"], "Peito esquerdo");
    assert.deepEqual(line["customization"]["image"]["transform"], {x: 0.4, y: 1, scale: 0.8});
    assert.equal(line["customization"]["configVersion"], Date.parse("2026-10-16T12:00:00Z"));
  });

  it("nome bloqueado, fonte desligada e sem nada recusam", async () => {
    const {db} = makeDb();
    const add = (input: Record<string, unknown>) =>
      addCustomItemToCartCore(db, "ana", {productId: "cam", skuId: "preto_m", qty: 1, ...input}, upload(), NOW);
    await assert.rejects(add({name: {text: "Palavrão", fontId: "bloco", color: "#ffffff"}}), /não pode ser usado/);
    await assert.rejects(add({name: {text: "ANA", fontId: "gotica", color: "#ffffff"}}), /inválida/);
    await assert.rejects(add({}), /nome, uma imagem ou as costas/);
  });

  it("imagem de outro atleta, pequena demais ou de formato fora da config recusa", async () => {
    const {db} = makeDb();
    const add = (path: string, info: Partial<UploadInfo> = {}) =>
      addCustomItemToCartCore(db, "ana", {
        productId: "cam", skuId: "preto_m", qty: 1, image: {path, areaId: "peito_esquerdo"},
      }, upload(info), NOW);
    await assert.rejects(add("store/custom-uploads/bia/up1"), /inválida/);
    await assert.rejects(add(PATH, {head: png(800, 800)}), /pequena demais/);
    await assert.rejects(add(PATH, {contentType: "image/gif"}), /Formato/);
    await assert.rejects(add(PATH, {sizeBytes: 11 * 1024 * 1024}), /maior que o permitido/);
  });

  it("produto sem personalização ativa, SKU esgotado e carrinho cheio recusam", async () => {
    const name = {text: "ANA", fontId: "bloco", color: "#ffffff"};
    const off = makeDb({customization: {active: false}});
    await assert.rejects(addCustomItemToCartCore(off.db, "ana", {productId: "cam", skuId: "preto_m", qty: 1, name}, upload(), NOW), /personalizável/);
    const esgotado = makeDb({stock: 0});
    await assert.rejects(addCustomItemToCartCore(esgotado.db, "ana", {productId: "cam", skuId: "preto_m", qty: 1, name}, upload(), NOW), /estoque/);
    const cheio = makeDb({cartItems: Array.from({length: 30}, (_, i) => ({productId: `p${i}`, skuId: "u", qty: 1}))});
    await assert.rejects(addCustomItemToCartCore(cheio.db, "ana", {productId: "cam", skuId: "preto_m", qty: 1, name}, upload(), NOW), /cheio/);
  });

  it("costas: número sozinho ou com nome; imagem com a qualidade pela área das costas", async () => {
    const back = {enabled: true, allowNumber: true, allowImage: true, numberMaxDigits: 2, widthCm: 25, heightCm: 25};
    const {fake, db} = makeDb({customization: {back}});
    const numero = await addCustomItemToCartCore(db, "ana", {
      productId: "cam", skuId: "preto_m", qty: 1, back: {type: "numero", number: " 10 "},
    }, upload(), NOW, () => "line-n");
    assert.equal(numero.extraPriceCents, 990);
    const withName = await addCustomItemToCartCore(db, "ana", {
      productId: "cam", skuId: "preto_m", qty: 1,
      name: {text: "ANA", fontId: "bloco", color: "#ffffff"}, back: {type: "numero", number: "7"},
    }, upload(), NOW, () => "line-nn");
    assert.equal(withName.extraPriceCents, 1490 + 990);
    // 1000 px em 25 cm = 101 dpi: imagem aceita, com aviso de qualidade.
    const imagem = await addCustomItemToCartCore(db, "ana", {
      productId: "cam", skuId: "preto_m", qty: 1, back: {type: "imagem", path: PATH},
    }, upload({head: png(1000, 1000)}), NOW, () => "line-i");
    assert.equal(imagem.quality, "warn");
    const items = fake.store.get("storeCarts/ana")!["items"] as Array<Record<string, any>>;
    assert.deepEqual(items[0]!["customization"]["back"], {type: "numero", number: "10"});
    assert.equal(items[2]!["customization"]["back"]["type"], "imagem");
    assert.equal(items[2]!["customization"]["back"]["path"], PATH);
    assert.equal(items[2]!["customization"]["back"]["quality"], "warn");
  });

  it("costas: número longo ou com letra, tipo não liberado e costas desligadas recusam", async () => {
    const add = (customization: Record<string, unknown>, backInput: unknown) => {
      const {db} = makeDb({customization});
      return addCustomItemToCartCore(db, "ana", {
        productId: "cam", skuId: "preto_m", qty: 1, back: backInput as never,
      }, upload(), NOW);
    };
    const back = {enabled: true, allowNumber: true, allowImage: false, numberMaxDigits: 2};
    await assert.rejects(add({back}, {type: "numero", number: "100"}), /até 2 dígitos/);
    await assert.rejects(add({back}, {type: "numero", number: "1A"}), /até 2 dígitos/);
    await assert.rejects(add({back}, {type: "imagem", path: PATH}), /não aceita imagem nas costas/);
    await assert.rejects(add({back: {...back, enabled: false}, name: {enabled: true}}, {type: "numero", number: "10"}), /costas/);
    await assert.rejects(add({back}, {type: "outro"}), /inválida/);
  });

  it("quantidade vai até o saldo (teto 10)", async () => {
    const {fake, db} = makeDb({stock: 3});
    await addCustomItemToCartCore(db, "ana", {
      productId: "cam", skuId: "preto_m", qty: 9, name: {text: "ANA", fontId: "bloco", color: "#ffffff"},
    }, upload(), NOW);
    const items = fake.store.get("storeCarts/ana")!["items"] as Array<Record<string, unknown>>;
    assert.equal(items[0]!["qty"], 3);
  });
});
