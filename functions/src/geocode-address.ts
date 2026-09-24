import {onCall, HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import {CLIENT_FACING_REGIONS} from "./function-regions";

/**
 * Geocoding de endereço brasileiro pelo Mapbox. Vive numa function — e não no browser —
 * porque o token é secret. O CEP, esse sim, o portal resolve direto no ViaCEP: consulta
 * pública, sem chave.
 *
 * Toda falha vira `null`: sem token, sem match, rede fora. Cadastro sem coordenada é um
 * problema pequeno (a arena não aparece no mapa até alguém corrigir); cadastro que não
 * salva porque o Mapbox piscou é um problema grande.
 */

export const MAPBOX_ACCESS_TOKEN = defineSecret("MAPBOX_ACCESS_TOKEN");

/** Abaixo disso o Mapbox está chutando — em geral cai no centro da cidade. */
const MIN_RELEVANCE = 0.5;

export interface GeocodeAddressInput {
  logradouro: string;
  numero: string;
  bairro: string;
  city: string;
  state: string;
  cep: string;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
}

function formatCep(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : "";
}

export function buildGeocodeQuery(input: GeocodeAddressInput): string {
  return [
    input.logradouro,
    input.numero,
    input.bairro,
    input.city,
    input.state,
    formatCep(input.cep),
    "Brasil",
  ]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export function parseMapboxGeocoding(raw: unknown): GeocodeResult | null {
  if (raw == null || typeof raw !== "object") return null;
  const features = (raw as {features?: unknown}).features;
  if (!Array.isArray(features) || features.length === 0) return null;

  const first = features[0] as {center?: unknown; relevance?: unknown};
  const relevance = typeof first.relevance === "number" ? first.relevance : 1;
  if (relevance < MIN_RELEVANCE) return null;

  const center = first.center;
  if (!Array.isArray(center) || center.length !== 2) return null;
  // Mapbox devolve [longitude, latitude] — a ordem invertida em relação ao GeoPoint.
  const [longitude, latitude] = center;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  return {latitude, longitude};
}

export async function geocodeBrazilianAddress(
  input: GeocodeAddressInput,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<GeocodeResult | null> {
  if (!token.trim()) {
    return null;
  }
  const query = buildGeocodeQuery(input);
  if (!query) {
    return null;
  }
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?access_token=${encodeURIComponent(token)}&country=BR&limit=1&language=pt`;
  try {
    const response = await fetchFn(url);
    if (!response.ok) {
      return null;
    }
    return parseMapboxGeocoding(await response.json());
  } catch (err) {
    logger.warn("Geocoding falhou", {err: String(err)});
    return null;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Chamada pela tela de dados cadastrais antes de gravar o endereço. Devolve
 *  `{coords: null}` quando não dá para posicionar — nunca erro. */
export const geocodeAddress = onCall(
  {region: CLIENT_FACING_REGIONS, secrets: [MAPBOX_ACCESS_TOKEN]},
  async (request): Promise<{coords: GeocodeResult | null}> => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado.");
    }
    const data = (request.data ?? {}) as Record<string, unknown>;
    const coords = await geocodeBrazilianAddress(
      {
        logradouro: asString(data.logradouro),
        numero: asString(data.numero),
        bairro: asString(data.bairro),
        city: asString(data.city),
        state: asString(data.state),
        cep: asString(data.cep),
      },
      MAPBOX_ACCESS_TOKEN.value(),
    );
    return {coords};
  },
);
