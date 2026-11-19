import {beforeEach, describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {clearWeatherForecastCache, type FetchLike} from "./arena-weather-forecast";
import {getArenaSlotWeatherForecastCore} from "./arena-weather";

const NOW = Date.UTC(2026, 9, 29, 15); // 29/10 12:00 em São Paulo

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

const openMeteo: FetchLike = async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    hourly: {
      time: ["2026-10-31T17:00", "2026-10-31T18:00", "2026-10-31T19:00", "2026-10-31T23:00"],
      precipitation_probability: [10, 20, 60, 5],
      precipitation: [0, 0, 2.5, 0],
    },
  }),
});

const options = {fetchImpl: openMeteo, nowMs: NOW, apiKey: ""};

async function assertHttpsError(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (err: {code?: string}) => {
    assert.equal(err.code, code, `esperava HttpsError ${code}, veio ${err.code}`);
    return true;
  });
}

beforeEach(() => clearWeatherForecastCache());

describe("getArenaSlotWeatherForecastCore", () => {
  it("devolve a previsão do horário escolhido numa arena parceira", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/a1", {name: "Arena", latitude: -16.82, longitude: -49.24});
    const out = await getArenaSlotWeatherForecastCore(db(fake), {
      arenaId: "a1", date: "2026-10-31", startTime: "19:00", endTime: "20:00",
    }, options);
    assert.deepEqual(out.forecast?.hours.map((h) => h.time), ["17:00", "18:00", "19:00"]);
    assert.equal(out.forecast?.hours[2].probability, 60);
  });

  it("arena pré-cadastrada não tem previsão no perfil", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/a1", {name: "Arena", latitude: -16.82, longitude: -49.24, unclaimed: true});
    await assertHttpsError(getArenaSlotWeatherForecastCore(db(fake), {
      arenaId: "a1", date: "2026-10-31", startTime: "19:00", endTime: "20:00",
    }, options), "not-found");
  });

  it("arena que não existe é not-found", async () => {
    await assertHttpsError(getArenaSlotWeatherForecastCore(db(new FakeFirestore()), {
      arenaId: "nada", date: "2026-10-31", startTime: "19:00", endTime: "20:00",
    }, options), "not-found");
  });

  it("data e horário inválidos são invalid-argument", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/a1", {name: "Arena"});
    await assertHttpsError(getArenaSlotWeatherForecastCore(db(fake), {
      arenaId: "a1", date: "31/10", startTime: "19:00", endTime: "20:00",
    }, options), "invalid-argument");
    await assertHttpsError(getArenaSlotWeatherForecastCore(db(fake), {
      arenaId: "a1", date: "2026-10-31", startTime: "x", endTime: "20:00",
    }, options), "invalid-argument");
  });
});
