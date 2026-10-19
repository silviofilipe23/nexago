import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  computeRatingStats,
  editableUntil,
  parseReviewInput,
  ratingAverage,
  reviewAuthor,
  showcaseRatingFields,
  sizeValueOf,
} from "./store-reviews";
import {
  submitOrderReviewCore,
  syncOrderReviewPublicCore,
  type ReviewPhotoStore,
} from "./store-reviews-write";

const NOW = new Date("2026-10-19T15:00:00Z");
const UID = "atleta1";

describe("avaliações · regras puras", () => {
  it("normaliza o pedido: tags na ordem do formulário, comentário cortado, foto repetida some", () => {
    const {input, fields} = parseReviewInput({
      orderId: "ord-1", anonymous: true, pickupRating: 4,
      items: [{productId: "p1", rating: 5, tags: ["custo", "qualidade", "custo"], fit: "certo",
        comment: "  Leve e seca rápido.  ", photos: ["a", "a"]}],
    });
    assert.deepEqual(fields, []);
    assert.equal(input.anonymous, true);
    assert.deepEqual(input.items[0].tags, ["qualidade", "custo"]);
    assert.equal(input.items[0].comment, "Leve e seca rápido.");
    assert.deepEqual(input.items[0].photos, ["a"]);
    assert.equal(input.pickupRating, 4);
  });

  it("recusa nota fora de 1–5, etiqueta inventada, comentário longo, foto demais e item repetido", () => {
    const {fields} = parseReviewInput({
      orderId: "ord-1",
      items: [
        {productId: "p1", rating: 6, tags: ["bonito"], comment: "x".repeat(501), photos: ["a", "b", "c", "d"]},
        {productId: "p1", rating: 5},
        {productId: "p2", rating: 3, fit: "medio"},
      ],
      pickupRating: 0,
    });
    assert.deepEqual(fields, [
      "items", "items.p1.comment", "items.p1.photos", "items.p1.rating", "items.p1.tags", "items.p2.fit", "pickupRating",
    ]);
  });

  it("sem item nenhum não publica", () => {
    assert.deepEqual(parseReviewInput({orderId: "ord-1", items: []}).fields, ["items"]);
  });

  it("autor: primeiro nome + inicial do último sobrenome; anônimo e sem nome viram Atleta NexaGO", () => {
    assert.deepEqual(reviewAuthor("rafaela moreira souza", false), {name: "Rafaela S.", initials: "RS"});
    assert.deepEqual(reviewAuthor("Diego", false), {name: "Diego", initials: "D"});
    assert.deepEqual(reviewAuthor("Rafaela Souza", true), {name: "Atleta NexaGO", initials: "··"});
    assert.deepEqual(reviewAuthor("", false), {name: "Atleta NexaGO", initials: "··"});
  });

  it("tamanho sai do eixo cujo rótulo é Tamanho (sem acento/caixa)", () => {
    const axes = [{id: "cor", label: "Cor"}, {id: "tam", label: "TAMANHO"}];
    assert.equal(sizeValueOf(axes, {cor: "branco", tam: "m"}), "m");
    assert.equal(sizeValueOf([{id: "cor", label: "Cor"}], {cor: "branco"}), null);
  });

  it("edição vale 30 dias a partir da primeira publicação", () => {
    assert.equal(editableUntil(NOW).toISOString(), "2026-11-18T15:00:00.000Z");
  });

  it("agregado: distribuição, recomendam (≥4), com foto e caimento; média em 2 casas", () => {
    const stats = computeRatingStats([
      {rating: 5, photos: ["u"], fit: "certo"},
      {rating: 4, photos: [], fit: "pequeno"},
      {rating: 2, photos: [], fit: null},
      {rating: 9},
    ]);
    assert.deepEqual(stats, {
      count: 3, sum: 11, dist: [0, 1, 0, 1, 1], recommend: 2, withPhotos: 1, fit: {pequeno: 1, certo: 1, grande: 0},
    });
    assert.equal(ratingAverage(stats), 3.67);
    assert.equal(ratingAverage({count: 0, sum: 0}), null);
  });

  it("espelho do produto: doc ausente = sem nota", () => {
    assert.deepEqual(showcaseRatingFields(null), {
      ratingAvg: null, ratingCount: 0,
      reviewStats: {dist: [0, 0, 0, 0, 0], recommend: 0, withPhotos: 0, fit: {pequeno: 0, certo: 0, grande: 0}},
    });
  });
});

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------

function fakePhotos(files: Record<string, {contentType: string; sizeBytes: number}> = {}) {
  let seq = 0;
  const removed: string[] = [];
  const store: ReviewPhotoStore = {
    inspect: async (path) => files[path] ?? null,
    publish: async (_path, productId) => {
      seq += 1;
      return {publicPath: `store/reviews/${productId}/f${seq}.jpg`, url: `https://cdn/r/${productId}/f${seq}.jpg`};
    },
    remove: async (publicPath) => {
      removed.push(publicPath);
    },
  };
  return {store, removed};
}

async function setup(over: Record<string, unknown> = {}) {
  const fake = new FakeFirestore();
  const db = fake as unknown as Firestore;
  const camiseta = {
    name: "Camiseta Dry UV50", slug: "camiseta-dry", category: "vestuario", priceCents: 12990,
    axes: [{id: "cor", label: "Cor", values: [{id: "branco", label: "Branco"}]},
      {id: "tam", label: "Tamanho", values: [{id: "m", label: "M"}]}],
    channels: {app: true, web: true}, fulfillment: {pickup: true, delivery: true}, status: "ativo", active: true,
    photos: [{url: "https://cdn/cam.jpg"}],
  };
  const viseira = {...camiseta, name: "Viseira Pro", slug: "viseira-pro", axes: [{id: "cor", label: "Cor", values: []}]};
  fake.seedDoc("storeProducts/cam", camiseta);
  fake.seedDoc("storeProducts/cam/skus/branco_m", {axisValues: {cor: "branco", tam: "m"}, stockByLocation: {cd: 3}});
  fake.seedDoc("storeProducts/vis", viseira);
  fake.seedDoc("storeProducts/vis/skus/preto", {axisValues: {cor: "preto"}, stockByLocation: {cd: 3}});
  fake.seedDoc("storeOrders/ord-1", {
    number: "NX-4740", status: "rtd", customer: {uid: UID, name: "Rafaela Moreira"},
    items: [
      {productId: "cam", skuId: "branco_m", productName: "Camiseta Dry UV50", variantLabel: "Branco · M", imageUrl: null, qty: 1},
      {productId: "vis", skuId: "preto", productName: "Viseira Pro", variantLabel: "Preto", imageUrl: null, qty: 1},
    ],
    delivery: {type: "arena", placeName: "Arena CFC"},
    ...over,
  });
  const review = () => fake.store.get("storeOrderReviews/ord-1")!;
  const mirrors = (pid: string) => [...fake.store.entries()]
    .filter(([k]) => k.startsWith(`storeShowcase/${pid}/reviews/`)).map(([, v]) => v);
  return {fake, db, review, mirrors};
}

const UPLOAD = `store/review-uploads/${UID}/a.jpg`;

describe("avaliações · servidor", () => {
  it("publica: nome abreviado, tamanho do SKU, fit só no produto com Tamanho, retirada da arena", async () => {
    const {db, review} = await setup();
    const {store} = fakePhotos({[UPLOAD]: {contentType: "image/jpeg", sizeBytes: 1000}});
    const out = await submitOrderReviewCore(db, UID, {
      orderId: "ord-1", anonymous: false, pickupRating: 5,
      items: [
        {productId: "cam", rating: 5, tags: ["conforto"], fit: "certo", comment: "Seca rápido", photos: [UPLOAD]},
        {productId: "vis", rating: 4, tags: [], fit: "grande", comment: "", photos: []},
      ],
    }, store, NOW);
    assert.deepEqual(out, {ok: true, created: true, editableUntil: "2026-11-18T15:00:00.000Z"});
    const doc = review();
    assert.equal(doc["authorName"], "Rafaela M.");
    assert.deepEqual(doc["pickup"], {placeName: "Arena CFC", rating: 5});
    const [cam, vis] = doc["items"] as Record<string, unknown>[];
    assert.equal(cam["sizeValueId"], "m");
    assert.equal(cam["fit"], "certo");
    assert.deepEqual(cam["photos"], [{path: UPLOAD, publicPath: "store/reviews/cam/f1.jpg", url: "https://cdn/r/cam/f1.jpg"}]);
    assert.equal(vis["fit"], null);
    assert.equal(vis["sizeValueId"], null);
  });

  it("só o dono, só entregue/retirado", async () => {
    const {db} = await setup({status: "tra"});
    const {store} = fakePhotos();
    const body = {orderId: "ord-1", items: [{productId: "cam", rating: 5}]};
    await assert.rejects(submitOrderReviewCore(db, "outro", body, store, NOW), /Pedido não encontrado/);
    await assert.rejects(submitOrderReviewCore(db, UID, body, store, NOW), /depois de entregue ou retirado/);
  });

  it("produto fora do pedido e foto de outra pessoa são recusados", async () => {
    const {db} = await setup();
    const {store} = fakePhotos({"store/review-uploads/outro/x.jpg": {contentType: "image/jpeg", sizeBytes: 10}});
    await assert.rejects(
      submitOrderReviewCore(db, UID, {orderId: "ord-1", items: [{productId: "bola", rating: 5}]}, store, NOW),
      /não está no pedido/);
    await assert.rejects(submitOrderReviewCore(db, UID, {orderId: "ord-1",
      items: [{productId: "cam", rating: 5, photos: ["store/review-uploads/outro/x.jpg"]}]}, store, NOW),
    (err: {details?: {fields?: string[]}}) => err.details?.fields?.[0] === "items.cam.photos");
  });

  it("foto grande demais desfaz as cópias já feitas", async () => {
    const {db} = await setup();
    const big = `store/review-uploads/${UID}/big.jpg`;
    const {store, removed} = fakePhotos({
      [UPLOAD]: {contentType: "image/jpeg", sizeBytes: 10},
      [big]: {contentType: "image/png", sizeBytes: 11 * 1024 * 1024},
    });
    await assert.rejects(submitOrderReviewCore(db, UID, {orderId: "ord-1",
      items: [{productId: "cam", rating: 5, photos: [UPLOAD, big]}]}, store, NOW), /maior que 10 MB/);
    assert.deepEqual(removed, ["store/reviews/cam/f1.jpg"]);
  });

  it("edição: mantém publicId, data e foto que ficou; apaga a cópia da que saiu; fecha em 30 dias", async () => {
    const {db, review} = await setup();
    const second = `store/review-uploads/${UID}/b.jpg`;
    const {store, removed} = fakePhotos({
      [UPLOAD]: {contentType: "image/jpeg", sizeBytes: 10},
      [second]: {contentType: "image/webp", sizeBytes: 10},
    });
    await submitOrderReviewCore(db, UID, {orderId: "ord-1",
      items: [{productId: "cam", rating: 3, photos: [UPLOAD, second]}]}, store, NOW);
    const first = (review()["items"] as Record<string, unknown>[])[0];

    const later = new Date(NOW.getTime() + 86_400_000);
    const out = await submitOrderReviewCore(db, UID, {orderId: "ord-1", anonymous: true,
      items: [{productId: "cam", rating: 5, photos: [second]}]}, store, later);
    assert.equal(out.created, false);
    const edited = (review()["items"] as Record<string, unknown>[])[0];
    assert.equal(edited["publicId"], first["publicId"]);
    assert.deepEqual(edited["createdAt"], NOW);
    assert.deepEqual((edited["photos"] as {path: string}[]).map((p) => p.path), [second]);
    assert.deepEqual(removed, ["store/reviews/cam/f1.jpg"]);
    assert.equal(review()["authorName"], "Atleta NexaGO");

    const tooLate = new Date(NOW.getTime() + 31 * 86_400_000);
    await assert.rejects(submitOrderReviewCore(db, UID, {orderId: "ord-1",
      items: [{productId: "cam", rating: 1}]}, store, tooLate), /prazo pra editar/);
  });

  it("gatilho: espelho público sem uid, nota no espelho do produto; escondido sai e a nota refaz", async () => {
    const {fake, db, mirrors} = await setup();
    const {store} = fakePhotos();
    await submitOrderReviewCore(db, UID, {orderId: "ord-1",
      items: [{productId: "cam", rating: 4, tags: ["qualidade"], fit: "pequeno", comment: "Bom"}]}, store, NOW);
    const out = await syncOrderReviewPublicCore(db, "ord-1", null, NOW);
    assert.deepEqual(out.productIds, ["cam"]);
    const [pub] = mirrors("cam");
    assert.equal(pub["uid"], undefined);
    assert.equal(pub["authorName"], "Rafaela M.");
    assert.equal(pub["sizeValueId"], "m");
    const showcase = fake.store.get("storeShowcase/cam")!;
    assert.equal(showcase["ratingAvg"], 4);
    assert.equal(showcase["ratingCount"], 1);
    assert.deepEqual((showcase["reviewStats"] as {fit: unknown}).fit, {pequeno: 1, certo: 0, grande: 0});

    const before = fake.store.get("storeOrderReviews/ord-1")!;
    const items = (before["items"] as Record<string, unknown>[]).map((i) => ({...i, hiddenAt: NOW}));
    fake.seedDoc("storeOrderReviews/ord-1", {...before, items});
    await syncOrderReviewPublicCore(db, "ord-1", before, NOW);
    assert.equal(mirrors("cam").length, 0);
    assert.equal(fake.store.get("storeShowcase/cam")!["ratingCount"], 0);
    assert.equal(fake.store.get("storeShowcase/cam")!["ratingAvg"], null);
  });
});
