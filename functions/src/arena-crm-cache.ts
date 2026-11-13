/**
 * CRM da arena — cache da parte cara da visão geral.
 *
 * O caro é ler 6 meses de `arenaBookings` (milhares de docs numa arena grande) e o perfil de cada
 * atleta. Isso vira estatística por cliente (`aggregateBookings`) e identidade (nome, foto,
 * telefone), guardadas em shards de até 400 clientes em `arenaCrmCache/{arenaId}/shards/{i}`.
 * Abrir o CRM passa a custar ~1 leitura por 400 clientes em vez de uma por reserva.
 *
 * Contratos, mensalidades, contatos e lembretes NÃO entram aqui: continuam ao vivo, então o que a
 * equipe faz no CRM aparece na hora. Reserva nova aparece em até 30 min (ou no "Atualizar").
 *
 * Validade: mesmo dia (as janelas de 28/90 dias e o histórico mudam com o dia) e 30 min.
 * "Atualizar" força a releitura, mas não mais que uma vez a cada 2 min.
 */
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import type {CrmBookingStats, CrmIdentity} from "./arena-crm-model";

export const CRM_CACHE = "arenaCrmCache";
export const CRM_CACHE_SHARDS = "shards";
/** Sobe quando o formato do que vai no cache muda: o cache velho é ignorado. */
/**
 * v2: horas por semana (`weekHours`, `avulsoHours90d`).
 * v3: quem jogou na reserva de outra pessoa vira cliente (`months[].played`).
 */
export const CACHE_VERSION = 3;
export const CACHE_TTL_MS = 30 * 60_000;
export const MIN_REFRESH_MS = 2 * 60_000;
export const SHARD_SIZE = 400;

export interface CacheMeta {
  version: number;
  dayKey: string;
  builtAtMs: number;
  shards: number;
}

export interface BookingSnapshot {
  stats: Map<string, CrmBookingStats>;
  identities: Map<string, CrmIdentity>;
}

export interface CachedSnapshot extends BookingSnapshot {
  builtAt: string;
  fromCache: boolean;
}

/** Decide se o cache serve. Pedido de atualização dentro de 2 min usa o cache (trava de custo). */
export function cacheUsable(meta: CacheMeta | null, today: string, nowMs: number, refresh: boolean): boolean {
  if (!meta || meta.version !== CACHE_VERSION || meta.dayKey !== today) return false;
  const age = nowMs - meta.builtAtMs;
  if (age < 0 || age >= CACHE_TTL_MS) return false;
  return !refresh || age < MIN_REFRESH_MS;
}

interface ShardItem {
  k: string;
  s: CrmBookingStats | null;
  i: CrmIdentity | null;
}

/** Divide em shards (ordem estável pela chave, para o mesmo cliente cair sempre perto). */
export function toShards(snapshot: BookingSnapshot): ShardItem[][] {
  const keys = [...new Set([...snapshot.stats.keys(), ...snapshot.identities.keys()])].sort();
  const items = keys.map((k) => ({k, s: snapshot.stats.get(k) ?? null, i: snapshot.identities.get(k) ?? null}));
  const shards: ShardItem[][] = [];
  for (let i = 0; i < items.length; i += SHARD_SIZE) shards.push(items.slice(i, i + SHARD_SIZE));
  return shards;
}

export function fromShards(shards: ShardItem[][]): BookingSnapshot {
  const stats = new Map<string, CrmBookingStats>();
  const identities = new Map<string, CrmIdentity>();
  for (const shard of shards) {
    for (const item of shard) {
      if (item.s) stats.set(item.k, item.s);
      if (item.i) identities.set(item.k, item.i);
    }
  }
  return {stats, identities};
}

function metaFrom(data: Record<string, unknown> | undefined): CacheMeta | null {
  if (!data) return null;
  const builtAt = data["builtAt"];
  return {
    version: typeof data["version"] === "number" ? data["version"] : 0,
    dayKey: typeof data["dayKey"] === "string" ? data["dayKey"] : "",
    builtAtMs: builtAt instanceof Timestamp ? builtAt.toMillis() : 0,
    shards: typeof data["shards"] === "number" ? data["shards"] : 0,
  };
}

/** Cache válido → shards; senão monta com `build`, grava e devolve. */
export async function bookingSnapshot(
  db: Firestore,
  arenaId: string,
  today: string,
  now: Date,
  refresh: boolean,
  build: () => Promise<BookingSnapshot>,
): Promise<CachedSnapshot> {
  const metaRef = db.collection(CRM_CACHE).doc(arenaId);
  const meta = metaFrom((await metaRef.get()).data() as Record<string, unknown> | undefined);

  if (meta && cacheUsable(meta, today, now.getTime(), refresh)) {
    const refs = Array.from({length: meta.shards}, (_, i) => metaRef.collection(CRM_CACHE_SHARDS).doc(String(i)));
    const snaps = refs.length ? await db.getAll(...refs) : [];
    if (snaps.every((s) => s.exists)) {
      const shards = snaps.map((s) => ((s.data() ?? {}) as {items?: ShardItem[]}).items ?? []);
      return {...fromShards(shards), builtAt: new Date(meta.builtAtMs).toISOString(), fromCache: true};
    }
  }

  const fresh = await build();
  const shards = toShards(fresh);
  const batch = db.batch();
  shards.forEach((items, i) => batch.set(metaRef.collection(CRM_CACHE_SHARDS).doc(String(i)), {items}));
  for (let i = shards.length; i < (meta?.shards ?? 0); i++) batch.delete(metaRef.collection(CRM_CACHE_SHARDS).doc(String(i)));
  batch.set(metaRef, {version: CACHE_VERSION, dayKey: today, builtAt: Timestamp.fromDate(now), shards: shards.length, customers: shards.flat().length});
  await batch.commit();
  return {...fresh, builtAt: now.toISOString(), fromCache: false};
}
