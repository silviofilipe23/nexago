import {beforeEach, describe, it} from "node:test";
import assert from "node:assert/strict";
import {clearWeatherForecastCache, fetchArenaWeather, weatherDaysAround, type FetchLike} from "./arena-weather-forecast";

const ARENA = {latitude: -16.8231, longitude: -49.2439};
const NOW = Date.UTC(2026, 9, 29, 15); // 29/10 12:00 em São Paulo

/** Formato real da WeatherAPI (`forecast.json`/`history.json` com `lang=pt`), cortado em duas horas. */
function weatherApiDay(date: string) {
  return {
    location: {name: "Apparecida", tz_id: "America/Sao_Paulo"},
    forecast: {
      forecastday: [{
        date,
        hour: [
          {time: `${date} 17:00`, chance_of_rain: 85, will_it_rain: 1, precip_mm: 4.24,
            condition: {text: "Chuva moderada"}},
          {time: `${date} 18:00`, chance_of_rain: 92, will_it_rain: 1, precip_mm: 6.1,
            condition: {text: "Chuva passageira moderada ou forte"}},
        ],
      }],
    },
  };
}

function openMeteoDay(date: string) {
  return {
    hourly: {
      time: [`${date}T17:00`, `${date}T18:00`],
      precipitation_probability: [40, 50],
      precipitation: [0.5, 1],
    },
  };
}

/** Fetch falso que responde por provedor e anota as URLs chamadas. */
function fakeFetch(responses: {weatherapi?: unknown | number; openMeteo?: unknown | number}) {
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    urls.push(url);
    const body = url.includes("weatherapi.com") ? responses.weatherapi : responses.openMeteo;
    if (body === undefined) throw new Error("rede fora");
    if (typeof body === "number") return {ok: false, status: body, json: async () => ({})};
    return {ok: true, status: 200, json: async () => body};
  };
  return {fetchImpl, urls};
}

beforeEach(() => clearWeatherForecastCache());

describe("fetchArenaWeather", () => {
  it("com chave usa a WeatherAPI: hoje e futuro no forecast.json, com a condição em português", async () => {
    const {fetchImpl, urls} = fakeFetch({weatherapi: weatherApiDay("2026-10-31")});
    const w = await fetchArenaWeather(ARENA, "2026-10-31", {fetchImpl, nowMs: NOW, apiKey: "k123"});
    assert.equal(w?.source, "weatherapi");
    assert.deepEqual(w?.hours, [
      {time: "17:00", probability: 85, precipitationMm: 4.2, condition: "Chuva moderada"},
      {time: "18:00", probability: 92, precipitationMm: 6.1, condition: "Chuva passageira moderada ou forte"},
    ]);
    assert.equal(urls.length, 1);
    const url = new URL(urls[0] as string);
    assert.equal(url.pathname, "/v1/forecast.json");
    assert.equal(url.searchParams.get("key"), "k123");
    assert.equal(url.searchParams.get("dt"), "2026-10-31");
    assert.equal(url.searchParams.get("q"), "-16.8231,-49.2439");
    assert.equal(url.searchParams.get("lang"), "pt");
  });

  it("dia que já passou vai no history.json (chuva registrada)", async () => {
    const {fetchImpl, urls} = fakeFetch({weatherapi: weatherApiDay("2026-10-28")});
    const w = await fetchArenaWeather(ARENA, "2026-10-28", {fetchImpl, nowMs: NOW, apiKey: "k123"});
    assert.equal(w?.source, "weatherapi");
    assert.equal(new URL(urls[0] as string).pathname, "/v1/history.json");
  });

  it("WeatherAPI recusando ou fora do ar: cai no Open-Meteo", async () => {
    for (const weatherapi of [400, undefined, {forecast: {forecastday: []}}]) {
      clearWeatherForecastCache();
      const {fetchImpl, urls} = fakeFetch({weatherapi, openMeteo: openMeteoDay("2026-10-31")});
      const w = await fetchArenaWeather(ARENA, "2026-10-31", {fetchImpl, nowMs: NOW, apiKey: "k123"});
      assert.equal(w?.source, "open-meteo");
      assert.equal(w?.hours[1]?.precipitationMm, 1);
      assert.equal(urls.length, 2);
    }
  });

  it("sem chave nem tenta a WeatherAPI", async () => {
    const {fetchImpl, urls} = fakeFetch({weatherapi: weatherApiDay("2026-10-31"), openMeteo: openMeteoDay("2026-10-31")});
    const w = await fetchArenaWeather(ARENA, "2026-10-31", {fetchImpl, nowMs: NOW, apiKey: ""});
    assert.equal(w?.source, "open-meteo");
    assert.ok(urls.every((u) => !u.includes("weatherapi.com")));
  });

  it("os dois fora do ar ou arena sem coordenadas: null", async () => {
    const down = fakeFetch({weatherapi: 500, openMeteo: 500});
    assert.equal(await fetchArenaWeather(ARENA, "2026-10-31", {fetchImpl: down.fetchImpl, nowMs: NOW, apiKey: "k"}),
      null);
    const noCoords = fakeFetch({weatherapi: weatherApiDay("2026-10-31")});
    assert.equal(await fetchArenaWeather({}, "2026-10-31", {fetchImpl: noCoords.fetchImpl, nowMs: NOW, apiKey: "k"}),
      null);
    assert.equal(noCoords.urls.length, 0);
  });

  it("weatherDaysAround: só busca o dia seguinte quando o jogo passa da meia-noite", async () => {
    const {fetchImpl, urls} = fakeFetch({weatherapi: weatherApiDay("2026-11-01")});
    const opts = {fetchImpl, nowMs: NOW, apiKey: "k"};
    const same = [{time: "18:00", probability: 1, precipitationMm: 0}];
    assert.deepEqual(await weatherDaysAround(ARENA, "2026-10-31", {start: 18 * 60, end: 19 * 60}, same, opts),
      [{offset: 0, hours: same}]);
    assert.equal(urls.length, 0);
    const late = await weatherDaysAround(ARENA, "2026-10-31", {start: 22 * 60, end: 24 * 60}, same, opts);
    assert.deepEqual(late.map((d) => d.offset), [0, 1]);
    assert.equal(new URL(urls[0] as string).searchParams.get("dt"), "2026-11-01");
  });

  it("guarda a resposta por 10 minutos", async () => {
    const {fetchImpl, urls} = fakeFetch({weatherapi: weatherApiDay("2026-10-31")});
    await fetchArenaWeather(ARENA, "2026-10-31", {fetchImpl, nowMs: NOW, apiKey: "k"});
    await fetchArenaWeather(ARENA, "2026-10-31", {fetchImpl, nowMs: NOW + 5 * 60_000, apiKey: "k"});
    assert.equal(urls.length, 1);
    await fetchArenaWeather(ARENA, "2026-10-31", {fetchImpl, nowMs: NOW + 11 * 60_000, apiKey: "k"});
    assert.equal(urls.length, 2);
  });
});
