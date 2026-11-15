import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  DEFAULT_ARENA_FEE_DEFAULTS,
  arenaFeeChanges,
  arenaFeeDefaultsFromRaw,
  arenaFeeErrors,
  arenaFeeOverrideFromRaw,
  loadArenaFeePercent,
  resolveArenaFeePercent,
  saveArenaFeeCore,
  saveArenaFeeDefaultCore,
} from "./arena-fees";

const ACTOR = {uid: "adm", name: "Marina Costa"};
const NOW = new Date("2026-11-15T15:00:00Z");
const TODAY = "2026-11-15";
const FUTURE = Timestamp.fromMillis(NOW.getTime() + 30 * 86_400_000);
const PRO = {planTier: "pro", planStatus: "active", planActiveUntil: FUTURE};
const ELITE = {planTier: "elite", planStatus: "active", planActiveUntil: FUTURE};

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function logs(fake: FakeFirestore): Record<string, unknown>[] {
  return [...fake.store.entries()].filter(([p]) => p.startsWith("arenaFeesLog/")).map(([, d]) => d);
}

async function rejects(p: Promise<unknown>, code: string): Promise<HttpsError> {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof HttpsError);
    assert.equal(e.code, code);
    return e;
  }
  assert.fail("esperava erro");
}

describe("arenaFeeDefaultsFromRaw", () => {
  it("doc ausente = a tabela de antes (8/6/5%, 8% sem plano, 5% no clubinho)", () => {
    assert.deepEqual(arenaFeeDefaultsFromRaw(undefined), {
      tierPercent: {starter: 8, pro: 6, elite: 5, none: 8},
      clubPercent: 5,
    });
  });

  it("campo fora da faixa cai no padrão de código, os outros ficam", () => {
    const d = arenaFeeDefaultsFromRaw({tierPercent: {pro: 4.5, elite: 99}, clubPercent: -1});
    assert.equal(d.tierPercent.pro, 4.5);
    assert.equal(d.tierPercent.elite, 5);
    assert.equal(d.clubPercent, 5);
  });
});

describe("resolveArenaFeePercent", () => {
  const defaults = {tierPercent: {starter: 7, pro: 5, elite: 4, none: 9}, clubPercent: 3};

  it("sem exceção: tabela pelo plano titular; clubinho tem % próprio", () => {
    const r = (arena: Record<string, unknown>, product: "booking" | "club") =>
      resolveArenaFeePercent({arena, product, defaults, override: null, now: NOW});
    assert.deepEqual(r(PRO, "booking"), {percent: 5, source: "default"});
    assert.deepEqual(r(ELITE, "booking"), {percent: 4, source: "default"});
    assert.deepEqual(r({}, "booking"), {percent: 9, source: "default"});
    assert.deepEqual(r(PRO, "club"), {percent: 3, source: "default"});
  });

  it("tier legado: parceiro vale Elite; essencial e sem titularidade valem sem plano", () => {
    const r = (arena: Record<string, unknown>) =>
      resolveArenaFeePercent({arena, product: "booking", defaults, override: null, now: NOW}).percent;
    assert.equal(r({planStatus: "active", planTier: "parceiro"}), 4);
    assert.equal(r({planStatus: "active", planTier: "essencial"}), 9);
    assert.equal(r({planStatus: "none", planTier: "pro"}), 9);
  });

  it("plano vencido fora da carência cai em sem plano", () => {
    const expired = {planTier: "pro", planStatus: "canceling", planActiveUntil: Timestamp.fromMillis(NOW.getTime() - 1)};
    assert.equal(resolveArenaFeePercent({arena: expired, product: "class", defaults, override: null, now: NOW}).percent, 9);
  });

  it("exceção vale só para os produtos dela; o resto segue o padrão", () => {
    const override = {products: {booking: 2, club: 0}, reason: "Arena piloto", until: null};
    const r = (product: "booking" | "club" | "schedulePlan") =>
      resolveArenaFeePercent({arena: PRO, product, defaults, override, now: NOW});
    assert.deepEqual(r("booking"), {percent: 2, source: "arena"});
    assert.deepEqual(r("club"), {percent: 0, source: "arena"});
    assert.deepEqual(r("schedulePlan"), {percent: 5, source: "default"});
  });

  it("exceção vencida não vale; vale até o último dia inclusive", () => {
    const at = (until: string) => resolveArenaFeePercent({
      arena: PRO, product: "booking", defaults, now: NOW,
      override: {products: {booking: 2}, reason: "Arena piloto", until},
    }).percent;
    assert.equal(at(TODAY), 2);
    assert.equal(at("2026-11-14"), 5);
  });
});

describe("arenaFeeOverrideFromRaw", () => {
  it("modo padrão, sem produto válido ou corrompido = sem exceção", () => {
    assert.equal(arenaFeeOverrideFromRaw({mode: "padrao", products: {booking: 2}}), null);
    assert.equal(arenaFeeOverrideFromRaw({mode: "custom", products: {booking: 50}}), null);
    assert.equal(arenaFeeOverrideFromRaw({mode: "custom"}), null);
  });

  it("descarta produto desconhecido ou fora da faixa", () => {
    const o = arenaFeeOverrideFromRaw({mode: "custom", products: {booking: 3, loja: 1, club: 21}, until: "x"});
    assert.deepEqual(o?.products, {booking: 3});
    assert.equal(o?.until, null);
  });
});

describe("arenaFeeErrors", () => {
  const ok = {arenaId: "a1", mode: "custom", products: {booking: 3}, reason: "Arena piloto", until: null};

  it("aceita exceção válida e o modo padrão sem mais nada", () => {
    assert.deepEqual(arenaFeeErrors(ok, TODAY), []);
    assert.deepEqual(arenaFeeErrors({arenaId: "a1", mode: "padrao"}, TODAY), []);
  });

  it("aponta cada campo inválido", () => {
    assert.deepEqual(arenaFeeErrors({...ok, products: {}}, TODAY), ["products"]);
    assert.deepEqual(arenaFeeErrors({...ok, products: {booking: 3.333, loja: 1}}, TODAY), ["products.booking", "products.loja"]);
    assert.deepEqual(arenaFeeErrors({...ok, reason: "porque sim"}, TODAY), ["reason"]);
    assert.deepEqual(arenaFeeErrors({...ok, until: "2026-11-14"}, TODAY), ["until"]);
  });
});

describe("arenaFeeChanges", () => {
  it("descreve produto a produto", () => {
    assert.deepEqual(
      arenaFeeChanges(null, {products: {booking: 3, club: 0}, reason: "Arena piloto", until: "2026-12-31"}),
      ["Reservas: padrão → 3%", "Clubinho: padrão → 0%", "válida até 31/12/2026"],
    );
  });
});

describe("loadArenaFeePercent", () => {
  it("sem nada gravado cobra como antes", async () => {
    const {db} = makeDb();
    assert.equal(await loadArenaFeePercent(db, "a1", PRO, "booking", NOW), 6);
    assert.equal(await loadArenaFeePercent(db, "a1", {}, "crm", NOW), 8);
    assert.equal(await loadArenaFeePercent(db, "a1", undefined, "club", NOW), 5);
  });

  it("lê o padrão e a exceção gravados", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("appConfig/arenaFees", {tierPercent: {starter: 8, pro: 4, elite: 3, none: 8}, clubPercent: 6});
    fake.seedDoc("arenaFees/a1", {mode: "custom", products: {schedulePlan: 1.5}, until: null});
    assert.equal(await loadArenaFeePercent(db, "a1", PRO, "booking", NOW), 4);
    assert.equal(await loadArenaFeePercent(db, "a1", PRO, "schedulePlan", NOW), 1.5);
    assert.equal(await loadArenaFeePercent(db, "a1", PRO, "club", NOW), 6);
    assert.equal(await loadArenaFeePercent(db, "a2", PRO, "schedulePlan", NOW), 4);
  });
});

describe("saveArenaFeeDefaultCore", () => {
  const input = {...DEFAULT_ARENA_FEE_DEFAULTS, tierPercent: {...DEFAULT_ARENA_FEE_DEFAULTS.tierPercent, pro: 5.5}};

  it("grava, sobe a versão e registra o histórico", async () => {
    const {fake, db} = makeDb();
    const r = await saveArenaFeeDefaultCore(db, {...input, version: 1}, ACTOR, NOW);
    assert.equal(r.version, 2);
    assert.deepEqual(r.changes, ["Pro: 6% → 5,5%"]);
    assert.equal((fake.store.get("appConfig/arenaFees") as Record<string, unknown>)["version"], 2);
    assert.equal(logs(fake).length, 1);
    assert.equal(await loadArenaFeePercent(db, "a1", PRO, "booking", NOW), 5.5);
  });

  it("recusa versão velha e salvar sem mudança", async () => {
    const {db} = makeDb();
    await saveArenaFeeDefaultCore(db, {...input, version: 1}, ACTOR, NOW);
    await rejects(saveArenaFeeDefaultCore(db, {...input, version: 1}, ACTOR, NOW), "failed-precondition");
    await rejects(saveArenaFeeDefaultCore(db, {...input, version: 2}, ACTOR, NOW), "invalid-argument");
  });

  it("recusa % fora da faixa", async () => {
    const {db} = makeDb();
    const e = await rejects(saveArenaFeeDefaultCore(db, {...input, clubPercent: 25, version: 1}, ACTOR, NOW),
      "invalid-argument");
    assert.deepEqual((e.details as {fields: string[]}).fields, ["clubPercent"]);
  });
});

describe("saveArenaFeeCore", () => {
  it("grava a exceção, depois volta ao padrão", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("arenas/a1", {name: "Arena Sol", ...PRO});
    const r = await saveArenaFeeCore(db, {
      arenaId: "a1", mode: "custom", products: {booking: 3}, reason: "Arena piloto", until: null, version: 0,
    }, ACTOR, NOW);
    assert.equal(r.version, 1);
    assert.equal(await loadArenaFeePercent(db, "a1", PRO, "booking", NOW), 3);

    await saveArenaFeeCore(db, {arenaId: "a1", mode: "padrao", version: 1}, ACTOR, NOW);
    assert.equal(await loadArenaFeePercent(db, "a1", PRO, "booking", NOW), 6);
    assert.equal(logs(fake).length, 2);
    assert.equal((fake.store.get("arenaFees/a1") as Record<string, unknown>)["arenaName"], "Arena Sol");
  });

  it("arena inexistente = not-found", async () => {
    const {db} = makeDb();
    await rejects(saveArenaFeeCore(db, {arenaId: "x", mode: "padrao", version: 0}, ACTOR, NOW), "not-found");
  });
});
