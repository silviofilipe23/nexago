/* eslint-disable */
/**
 * Pedidos de demonstração da Loja (telas 01/02/03) enquanto o checkout não existe.
 *
 * Usa as MESMAS funções do servidor (`lib/store-orders-write.js`): numera,
 * reserva estoque de verdade, e anda cada pedido até o status sorteado
 * (separado, na arena, enviado, retirado, cancelado…). Pedidos ganham
 * `seed: true` e clientes sem `uid` (nenhum push sai).
 *
 * Pré-requisitos:
 *   gcloud auth application-default login
 *   npm run build          (o script lê lib/)
 *   produtos com saldo no CD (seed-store-catalog.js) e locais (seed-store-locations.js)
 *
 * Uso (na pasta functions/):
 *   node scripts/seed-store-orders.js --project <projectId>              # dry-run
 *   node scripts/seed-store-orders.js --project <projectId> --count 24 --yes
 */

const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const COUNT = Math.min(60, Number(argValue("--count") || 16));
const projectId = argValue("--project") || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();
const {createOrderCore, orderActionCore} = require("../lib/store-orders-write");

const ACTOR = {uid: "seed", name: "Seed de demonstração"};
const PEOPLE = [
  ["Juliana Prado", "juliana.prado@exemplo.com", "(62) 99120-3344", "11148233100"],
  ["Pedro Lima", "pedro.lima@exemplo.com", "(62) 98455-1020", "22248233111"],
  ["Carla Mendes", "carla.mendes@exemplo.com", "(62) 99301-7788", "33348233122"],
  ["Bruno Reis", "bruno.reis@exemplo.com", "(61) 99877-2211", "44448233133"],
  ["Ana Clara Dias", "anaclara@exemplo.com", "(61) 98122-4455", "55548233144"],
  ["Marcelo Antunes", "marcelo.antunes@exemplo.com", "(62) 99812-4471", "66648233155"],
  ["Rafael Costa", "rafael.costa@exemplo.com", "(62) 99654-0099", "77748233166"],
  ["Fernanda Luz", "fernanda.luz@exemplo.com", "(62) 98777-6655", "88848233177"],
];
const CITIES = [["Anápolis", "GO"], ["Brasília", "DF"], ["Goiânia", "GO"]];
// Destino final de cada pedido, em ordem: cobre todas as abas da tela 02.
const PATHS = ["sep", "sepd", "ret", "pag", "tra", "rtd", "ent", "can", "sep", "ret", "rtd", "ent", "sepd", "rtd", "ent", "rtd"];

const pick = (arr, i) => arr[i % arr.length];

async function main() {
  const [productsSnap, locationsSnap] = await Promise.all([
    db.collection("storeProducts").where("status", "==", "ativo").get(),
    db.collection("storeLocations").get(),
  ]);
  const arenas = locationsSnap.docs.filter((d) => d.data().type === "arena" && d.data().active !== false).map((d) => d.id);
  const skus = [];
  for (const p of productsSnap.docs) {
    const s = await p.ref.collection("skus").get();
    for (const sku of s.docs) {
      const free = (sku.data().stockByLocation?.cd ?? 0) - (sku.data().reservedByLocation?.cd ?? 0);
      if (free > 2) skus.push({productId: p.id, skuId: sku.id, price: sku.data().priceCents ?? p.data().priceCents, name: p.data().name});
    }
  }
  if (skus.length === 0 || arenas.length === 0) {
    console.error("Precisa de produtos ativos com saldo no CD e de locais de arena. Rode os seeds de catálogo e locais.");
    process.exit(1);
  }
  console.log(`\n${COUNT} pedidos em ${projectId}${APPLY ? "" : " (DRY-RUN — use --yes para gravar)"}; ${skus.length} SKUs com saldo.`);

  const now = Date.now();
  for (let i = 0; i < COUNT; i++) {
    const target = pick(PATHS, i);
    const [name, email, phone, cpf] = pick(PEOPLE, i);
    const lines = [pick(skus, i * 3), ...(i % 3 === 0 ? [pick(skus, i * 3 + 1)] : [])]
      .filter((l, k, all) => all.findIndex((x) => x.productId === l.productId && x.skuId === l.skuId) === k)
      .map((l, k) => ({productId: l.productId, skuId: l.skuId, qty: k === 0 && i % 4 === 0 ? 2 : 1, price: l.price}));
    const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0);
    const home = target === "tra" || target === "ent" || (target === "can" && i % 2 === 0);
    const shipping = home ? 2490 : 0;
    const payBy = pick(["pix", "pix", "cartao", "pix+saldo"], i);
    const pix = payBy.startsWith("pix") ? Math.round(subtotal * 0.05) : 0;
    const wallet = payBy === "pix+saldo" ? Math.min(4200, subtotal - pix) : 0;
    const total = subtotal - pix - wallet + shipping;
    const payments = [{method: payBy === "cartao" ? "cartao" : "pix", amountCents: total, installments: payBy === "cartao" ? 3 : null,
      txid: payBy !== "cartao" ? `E1823612020261${String(i).padStart(4, "0")}s0${Math.random().toString(16).slice(2, 10)}9F2A` : null,
      feeCents: Math.round(total * 0.01)}];
    if (wallet > 0) payments.push({method: "saldo", amountCents: wallet});
    const [city, uf] = pick(CITIES, i);
    const createdAt = new Date(now - Math.floor((i / COUNT) * 29 * 86_400_000) - (i % 7) * 3_600_000);
    const orderId = `seed-${createdAt.getTime().toString(36)}-${i}`;
    const input = {
      orderId, channel: pick(["app_ios", "web", "app_android", "app_ios", "web"], i),
      customer: {uid: null, name, email, phone, cpf, level: 1 + (i % 5), orderIndex: 1 + (i % 7)},
      items: lines.map(({productId, skuId, qty}) => ({productId, skuId, qty})),
      couponId: null, couponCode: null, couponDiscountCents: 0, pixDiscountCents: pix, walletCents: wallet,
      shippingCents: shipping, payments, paid: target !== "pag",
      pix: target === "pag" ? {copyPaste: "00020126580014br.gov.bcb.pix0136demo-seed", expiresAt: new Date(now + 30 * 60_000)} : null,
      delivery: home ?
        {type: "casa", modeId: "expressa", modeName: pick(["Padrão", "Expressa"], i), address: "Rua 1.128, 450 · Setor Marista", city, uf, zip: "74000-000"} :
        {type: "arena", locationId: pick(arenas, i), pickupPointId: null},
    };
    console.log(`  ${target.padEnd(4)} ${name.padEnd(16)} ${lines.length} linha(s) · R$ ${(total / 100).toFixed(2)} · ${home ? "casa" : input.delivery.locationId}`);
    if (!APPLY) continue;

    const at = (h) => new Date(createdAt.getTime() + h * 3_600_000);
    try {
      await createOrderCore(db, input, ACTOR, createdAt);
    } catch (err) {
      // Saldo acabou no meio (pedidos anteriores reservaram): pula este, segue com os outros.
      console.log(`    pulado: ${err.message}`);
      continue;
    }
    let version = 1;
    const act = async (action, h, extra = {}) => {
      const r = await orderActionCore(db, {orderId, version, action, ...extra}, ACTOR, at(h));
      version = r.version;
      return r;
    };
    const ref = db.collection("storeOrders").doc(orderId);
    await ref.set({seed: true}, {merge: true});
    if (target === "pag" || target === "sep") continue;
    if (target === "can") {
      await act("cancelar", 2, {reason: "Cliente desistiu da compra"});
      continue;
    }
    await act("iniciar_separacao", 1);
    if (target === "sepd") continue;
    // Sem remessa no seed: a retirada só chega à arena se a reserva já estiver lá (arena com saldo).
    const r = await act("marcar_separado", 3);
    if (home) {
      await act("enviar", 20, {carrier: "Loggi", tracking: `LG${100000 + i}BR`, trackingUrl: `https://www.loggi.com/rastreador/LG${100000 + i}BR`});
      if (target === "ent") await act("entregue", 48);
      continue;
    }
    if (r.status !== "ret") continue; // ficou aguardando remessa: crie a transferência na 06b
    if (target === "rtd") {
      const code = (await ref.get()).data().delivery.pickupCode;
      await act("confirmar_retirada", 30, {pickupCode: code});
    }
  }
  console.log(APPLY ? "\nGravado." : "\nNada gravado.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
