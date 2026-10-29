/**
 * Previsão por hora da arena (Open-Meteo, sem chave). Serve a tela do Modo
 * chuva, o retrato do clima gravado no aviso do atleta e o pedido no modo
 * automático. Falha de rede nunca derruba a operação: devolve `null`.
 */
import * as logger from "firebase-functions/logger";
import {parseOpenMeteoHourly, type WeatherHour} from "./arena-weather-model";

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

export type FetchLike = (url: string, init?: {signal?: AbortSignal}) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

const cache = new Map<string, {at: number; hours: WeatherHour[]}>();

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

export function openMeteoUrl(lat: number, lng: number, dateKey: string): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    hourly: "precipitation_probability,precipitation",
    timezone: "America/Sao_Paulo",
    start_date: dateKey,
    end_date: dateKey,
  });
  return `${OPEN_METEO_URL}?${params.toString()}`;
}

/** Horas do dia na arena, ou `null` sem coordenadas / sem resposta. */
export async function fetchArenaWeatherHours(
  arena: Record<string, unknown> | undefined,
  dateKey: string,
  options: {fetchImpl?: FetchLike; nowMs?: number} = {},
): Promise<WeatherHour[] | null> {
  const point = arenaCoordinates(arena);
  if (!point) return null;
  const url = openMeteoUrl(point.lat, point.lng, dateKey);
  const now = options.nowMs ?? Date.now();
  const hit = cache.get(url);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.hours;

  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {signal: controller.signal});
    if (!res.ok) {
      logger.warn(`Open-Meteo respondeu ${res.status}`, {dateKey});
      return null;
    }
    const hours = parseOpenMeteoHourly(await res.json(), dateKey);
    if (hours.length === 0) return null;
    cache.set(url, {at: now, hours});
    return hours;
  } catch (e) {
    logger.warn("Open-Meteo indisponível", {dateKey, error: String(e)});
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Só para testes. */
export function clearWeatherForecastCache(): void {
  cache.clear();
}
