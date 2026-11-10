import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {CACHE_VERSION, SHARD_SIZE, cacheUsable, fromShards, toShards} from "./arena-crm-cache";
import {aggregateBookings} from "./arena-crm-model";
import {getArenaCrmOverviewCore, updateArenaCrmCore} from "./arena-crm";

const T0 = Date.parse("2026-11-10T15:00:00Z");
const meta = (o: Partial<{version: number; dayKey: string; builtAtMs: number; shards: number}> = {}) =>
  ({version: CACHE_VERSION, dayKey: "2026-11-10", builtAtMs: T0, shards: 1, ...o});

describe("cacheUsable", () => {
  it("vale no mesmo dia por 30 min", () => {
    assert.equal(cacheUsable(meta(), "2026-11-10", T0 + 29 * 60_000, false), true);
    assert.equal(cacheUsable(meta(), "2026-11-10", T0 + 30 * 60_000, false), false);
    assert.equal(cacheUsable(meta(), "2026-11-11", T0 + 60_000, false), false);
    assert.equal(cacheUsable(meta({version: CACHE_VERSION + 1}), "2026-11-10", T0, false), false);
    assert.equal(cacheUsable(null, "2026-11-10", T0, false), false);
  });

  it("Atualizar força a releitura, mas não antes de 2 min", () => {
    assert.equal(cacheUsable(meta(), "2026-11-10", T0 + 60_000, true), true);
    assert.equal(cacheUsable(meta(), "2026-11-10", T0 + 3 * 60_000, true), false);
  });
});

describe("shards", () => {
  it("ida e volta preserva estatística e identidade, em blocos de 400", () => {
    const bookings = Array.from({length: SHARD_SIZE + 5}, (_, i) => ({athleteId: `u${i}`, date: "2026-11-03", startTime: "19:00", status: "active", source: "platform", amountReais: 40}));
    const stats = aggregateBookings(bookings, "2026-11-10");
    const identities = new Map([["a:u1", {name: "Rafael", photoUrl: null, phone: "62982415530"}]]);
    const shards = toShards({stats, identities});
    assert.equal(shards.length, 2);
    const back = fromShards(JSON.parse(JSON.stringify(shards)));
    assert.equal(back.stats.size, SHARD_SIZE + 5);
    assert.deepEqual(back.stats.get("a:u7"), stats.get("a:u7"));
    assert.equal(back.identities.get("a:u1")?.phone, "62982415530");
  });
});

describe("visão geral com cache", () => {
  function seed(): FakeFirestore {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/arena1", {managerUserId: "owner", name: "Arena CFC"});
    fake.seedDoc("users/owner", {fullName: "Silvio"});
    fake.seedDoc("users/u1", {fullName: "Rafael Moura", phoneNumber: "(62) 98241-5530"});
    fake.seedDoc("users/u9", {fullName: "Ana Vieira"});
    fake.seedDoc("arenaBookings/b1", {arenaId: "arena1", athleteId: "u1", date: "2026-11-03", startTime: "19:00", status: "active", source: "platform", amountReais: 50});
    return fake;
  }
  const at = (ms: number) => new Date(T0 + ms);

  it("2ª abertura usa o cache; Atualizar depois de 2 min relê; dia novo relê", async () => {
    const fake = seed();
    const db = fake as unknown as Firestore;
    const first = await getArenaCrmOverviewCore(db, "owner", {arenaId: "arena1"}, at(0));
    assert.equal(first.cache.fromCache, false);
    assert.equal(first.customers.length, 1);

    fake.store.delete("arenaBookings/b1");
    const cached = await getArenaCrmOverviewCore(db, "owner", {arenaId: "arena1"}, at(60_000));
    assert.equal(cached.cache.fromCache, true);
    assert.equal(cached.cache.builtAt, at(0).toISOString());
    assert.equal(cached.customers[0]?.name, "Rafael Moura");
    assert.equal(cached.customers[0]?.whatsapp, "5562982415530");

    const tooSoon = await getArenaCrmOverviewCore(db, "owner", {arenaId: "arena1", refresh: true}, at(90_000));
    assert.equal(tooSoon.cache.fromCache, true);

    const refreshed = await getArenaCrmOverviewCore(db, "owner", {arenaId: "arena1", refresh: true}, at(3 * 60_000));
    assert.equal(refreshed.cache.fromCache, false);
    assert.equal(refreshed.customers.length, 0);
  });

  it("contrato novo aparece na hora, mesmo com o cache valendo (e mensalista sem reserva ganha o perfil)", async () => {
    const fake = seed();
    const db = fake as unknown as Firestore;
    await getArenaCrmOverviewCore(db, "owner", {arenaId: "arena1"}, at(0));
    await updateArenaCrmCore(db, "owner", {
      arenaId: "arena1", op: "saveContract", athleteId: "u9", customerName: "", planName: "Noite 1x", period: "monthly",
      dueDay: 5, timesPerWeek: 1, monthlyPriceReais: 160, startDate: "2026-11-10", autoRenew: true,
    }, at(30_000));
    const after = await getArenaCrmOverviewCore(db, "owner", {arenaId: "arena1"}, at(60_000));
    assert.equal(after.cache.fromCache, true);
    const ana = after.customers.find((c) => c.key === "a:u9");
    assert.equal(ana?.name, "Ana Vieira");
    assert.equal(ana?.kind, "member");
  });
});
