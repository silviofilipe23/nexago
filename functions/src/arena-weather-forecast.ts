/**
 * Previsão por hora da arena: WeatherAPI (chave no segredo `WEATHER_API_KEY`)
 * e, se ela faltar ou falhar, Open-Meteo (sem chave). Serve a tela do Modo
 * chuva, o retrato do clima gravado no aviso do atleta e o pedido no modo
 * automático. Falha de rede nunca derruba a operação: devolve `null`.
 *
 * A WeatherAPI responde no fuso da própria localização (o mesmo das reservas)
 * e cobre o dia de hoje e 14 dias à frente (`forecast.json`) e os dias que já
 * passaram (`history.json`), o que dá a "chuva registrada" dos pedidos.
 */
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import {spNow} from "./arena-peak-rules";
import {
  addDaysToDateKey,
  parseOpenMeteoHourly,
  parseWeatherApiHourly,
  weatherDisplayDayOffsets,
  type WeatherForecastDay,
  type WeatherHour,
} from "./arena-weather-model";

/** Criar antes do deploy: `firebase functions:secrets:set WEATHER_API_KEY`. */
export const WEATHER_API_KEY = defineSecret("WEATHER_API_KEY");

const WEATHER_API_URL = "https://api.weatherapi.com/v1";
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

export type WeatherSource = "weatherapi" | "open-meteo";

export interface ArenaWeather {
  hours: WeatherHour[];
  source: WeatherSource;
}

export type FetchLike = (url: string, init?: {signal?: AbortSignal}) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/** Chave sem a URL: a da WeatherAPI leva o segredo na query string. */
const cache = new Map<string, {at: number; weather: ArenaWeather}>();

/** Ponto da arena: `latitude`/`longitude` ou o GeoPoint `location`. */
export function arenaCoordinates(arena: Record<string, unknown> | undefined): {lat: number; lng: number} | null {
  const lat = arena?.["latitude"];
  const lng = arena?.["longitude"];
  if (typeof lat === "number" && typeof lng === "number") return {lat, lng};
  const loc = arena?.["location"] as {latitude?: unknown; longitude?: unknown} | undefined;
  if (loc && typeof loc.latitude === "number" && typeof loc.longitude === "number") {
    return {lat: loc.latitude, lng: loc.longitude};
  }
  return null;
}

/** `forecast.json` de hoje em diante, `history.json` para dia que já passou. */
export function weatherApiUrl(apiKey: string, lat: number, lng: number, dateKey: string, todayKey: string): string {
  const endpoint = dateKey < todayKey ? "history.json" : "forecast.json";
  const params = new URLSearchParams({
    key: apiKey,
    q: `${lat.toFixed(4)},${lng.toFixed(4)}`,
    dt: dateKey,
    aqi: "no",
    alerts: "no",
    lang: "pt",
  });
  return `${WEATHER_API_URL}/${endpoint}?${params.toString()}`;
}

export function openMeteoUrl(lat: number, lng: number, dateKey: string): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    hourly: "precipitation_probability,precipitation,temperature_2m",
    timezone: "auto",
    start_date: dateKey,
    end_date: dateKey,
  });
  return `${OPEN_METEO_URL}?${params.toString()}`;
}

function configuredApiKey(): string {
  try {
    return WEATHER_API_KEY.value().trim();
  } catch {
    return "";
  }
}

async function fetchJson(fetchImpl: FetchLike, url: string, provider: string, dateKey: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {signal: controller.signal});
    if (!res.ok) {
      logger.warn(`${provider} respondeu ${res.status}`, {dateKey});
      return null;
    }
    return await res.json();
  } catch (e) {
    // Nunca logar a URL: a da WeatherAPI carrega a chave.
    logger.warn(`${provider} indisponível`, {dateKey, error: e instanceof Error ? e.name : "erro"});
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Horas do dia na arena e de onde vieram, ou `null` sem coordenadas / sem resposta. */
export async function fetchArenaWeather(
  arena: Record<string, unknown> | undefined,
  dateKey: string,
  options: {fetchImpl?: FetchLike; nowMs?: number; apiKey?: string} = {},
): Promise<ArenaWeather | null> {
  const point = arenaCoordinates(arena);
  if (!point) return null;
  const now = options.nowMs ?? Date.now();
  const cacheKey = `${point.lat.toFixed(4)},${point.lng.toFixed(4)},${dateKey}`;
  const hit = cache.get(cacheKey);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.weather;

  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  let weather: ArenaWeather | null = null;

  const apiKey = options.apiKey ?? configuredApiKey();
  if (apiKey) {
    const todayKey = spNow(new Date(now)).dateKey;
    const json = await fetchJson(fetchImpl, weatherApiUrl(apiKey, point.lat, point.lng, dateKey, todayKey),
      "WeatherAPI", dateKey);
    const hours = json ? parseWeatherApiHourly(json, dateKey) : [];
    if (hours.length > 0) weather = {hours, source: "weatherapi"};
  }
  if (!weather) {
    const json = await fetchJson(fetchImpl, openMeteoUrl(point.lat, point.lng, dateKey), "Open-Meteo", dateKey);
    const hours = json ? parseOpenMeteoHourly(json, dateKey) : [];
    if (hours.length > 0) weather = {hours, source: "open-meteo"};
  }
  if (weather) cache.set(cacheKey, {at: now, weather});
  return weather;
}

/**
 * O dia da reserva (já buscado) mais a véspera/o dia seguinte quando a janela de 2h antes
 * a 2h depois passa da meia-noite. Dia vizinho sem resposta fica de fora.
 */
export async function weatherDaysAround(
  arena: Record<string, unknown> | undefined,
  dateKey: string,
  win: {start: number; end: number},
  sameDay: WeatherHour[],
  options: {fetchImpl?: FetchLike; nowMs?: number; apiKey?: string} = {},
): Promise<WeatherForecastDay[]> {
  const days: WeatherForecastDay[] = [{offset: 0, hours: sameDay}];
  for (const offset of weatherDisplayDayOffsets(win)) {
    if (offset === 0) continue;
    const other = await fetchArenaWeather(arena, addDaysToDateKey(dateKey, offset), options);
    if (other) days.push({offset, hours: other.hours});
  }
  return days;
}

/** Só para testes. */
export function clearWeatherForecastCache(): void {
  cache.clear();
}
