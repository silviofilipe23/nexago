import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import {
  normalizeWeatherPolicy,
  rainModeActivationFromData,
  rainModeEventFromDoc,
  rainModePreviewFromData,
  weatherCreditFromDoc,
  weatherErrorMessage,
  weatherForecastFromData,
  weatherRequestFromDoc,
  weatherSnapshotErrorMessage,
  type RainModeActivation,
  type RainModeEvent,
  type RainModePreview,
  type WeatherCredit,
  type WeatherForecast,
  type WeatherPolicy,
  type WeatherRequest,
} from './weather.model';

/** Cancelamento por chuva: escrita 100% por callable (`southamerica-east1`), leitura ao vivo
 *  pelas coleções que as rules liberam para a área `agenda`/`financeiro`. */

export class WeatherError extends Error {}

async function call<In, Out>(functions: Functions, name: string, input: In, fallback: string): Promise<Out> {
  const fn = httpsCallable<In, Out>(functions, name);
  try {
    const result = await fn(input);
    return result.data;
  } catch (err) {
    throw new WeatherError(weatherErrorMessage(err, fallback));
  }
}

export async function saveArenaWeatherPolicy(functions: Functions, arenaId: string, policy: WeatherPolicy): Promise<WeatherPolicy> {
  const data = await call<{ arenaId: string; policy: WeatherPolicy }, { policy?: unknown }>(
    functions,
    'saveArenaWeatherPolicy',
    { arenaId, policy },
    'Não foi possível salvar a política.',
  );
  return normalizeWeatherPolicy(data?.policy ?? policy);
}

export async function getArenaWeatherForecast(functions: Functions, arenaId: string, date: string): Promise<WeatherForecast | null> {
  const data = await call<{ arenaId: string; date: string }, { forecast?: unknown }>(
    functions,
    'getArenaWeatherForecast',
    { arenaId, date },
    'Não foi possível carregar a previsão.',
  );
  return weatherForecastFromData(data?.forecast ?? null);
}

export interface RainModeWindow {
  arenaId: string;
  date: string;
  startTime: string;
  endTime: string;
  courtIds: string[];
}

export async function previewArenaRainMode(functions: Functions, input: RainModeWindow): Promise<RainModePreview> {
  const data = await call<RainModeWindow, unknown>(functions, 'previewArenaRainMode', input, 'Não foi possível listar as reservas afetadas.');
  return rainModePreviewFromData(data);
}

export interface ActivateRainModeInput extends RainModeWindow {
  blockNewBookings: boolean;
  message?: string;
}

export async function activateArenaRainMode(functions: Functions, input: ActivateRainModeInput): Promise<RainModeActivation> {
  const data = await call<ActivateRainModeInput, unknown>(functions, 'activateArenaRainMode', input, 'Não foi possível ativar o Modo chuva.');
  return rainModeActivationFromData(data);
}

export async function endArenaRainMode(functions: Functions, arenaId: string, eventId: string): Promise<number> {
  const data = await call<{ arenaId: string; eventId: string }, { unblocked?: unknown }>(
    functions,
    'endArenaRainMode',
    { arenaId, eventId },
    'Não foi possível liberar as novas reservas.',
  );
  return typeof data?.unblocked === 'number' ? data.unblocked : 0;
}

export interface DecideWeatherRequestInput {
  arenaId: string;
  bookingId: string;
  approve: boolean;
  reason?: string;
}

export async function decideArenaWeatherRequest(functions: Functions, input: DecideWeatherRequestInput): Promise<string> {
  const data = await call<DecideWeatherRequestInput, { status?: unknown }>(
    functions,
    'decideArenaWeatherRequest',
    input,
    input.approve ? 'Não foi possível aprovar o pedido.' : 'Não foi possível recusar o pedido.',
  );
  return typeof data?.status === 'string' ? data.status : input.approve ? 'approved' : 'rejected';
}

/** Ativações do Modo chuva de um dia. */
export function watchRainModeEvents(
  db: Firestore,
  arenaId: string,
  date: string,
  onChange: (events: RainModeEvent[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenaWeatherEvents'), where('arenaId', '==', arenaId), where('date', '==', date)),
    (snap) => {
      const events = snap.docs.map((d) => rainModeEventFromDoc(d.id, d.data() as Record<string, unknown>));
      events.sort((a, b) => a.startTime.localeCompare(b.startTime) || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
      onChange(events);
    },
    (err) => onError(weatherSnapshotErrorMessage(err)),
  );
}

/** Pedidos do atleta (mais recentes primeiro); a aba filtra o status no cliente. */
export function watchWeatherRequests(
  db: Firestore,
  arenaId: string,
  onChange: (requests: WeatherRequest[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenaWeatherRequests'), where('arenaId', '==', arenaId), orderBy('createdAt', 'desc'), limit(200)),
    (snap) => onChange(snap.docs.map((d) => weatherRequestFromDoc(d.id, d.data() as Record<string, unknown>))),
    (err) => onError(weatherSnapshotErrorMessage(err)),
  );
}

export function watchWeatherCredits(
  db: Firestore,
  arenaId: string,
  onChange: (credits: WeatherCredit[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenaWeatherCredits'), where('arenaId', '==', arenaId), orderBy('createdAt', 'desc'), limit(500)),
    (snap) => onChange(snap.docs.map((d) => weatherCreditFromDoc(d.id, d.data() as Record<string, unknown>))),
    (err) => onError(weatherSnapshotErrorMessage(err)),
  );
}
