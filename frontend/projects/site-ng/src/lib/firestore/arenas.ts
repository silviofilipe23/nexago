import { collection, doc, getDoc, getDocs, limit, query, type DocumentData } from 'firebase/firestore/lite';
import { liteDb } from '../firebase-lite';
import type { ArenaCourt, ArenaDetail, ArenaSummary } from './types';

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter(Boolean);
}

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

function mapCourt(id: string, c: DocumentData): ArenaCourt {
  return {
    id,
    name: firstString(c['name'], c['label']),
    sport: firstString(c['sport'], c['courtType']),
    surface: firstString(c['surface']),
  };
}

/** Campos públicos compartilhados entre listagem e perfil de arena. */
function mapSummary(id: string, d: DocumentData): ArenaSummary {
  return {
    id,
    name: String(d['name'] ?? 'Arena'),
    city: d['city'] ?? null,
    state: d['state'] ?? null,
    description: d['description'] ?? d['about'] ?? null,
    sports: strArray(d['courtTypes'] ?? d['sports']),
    surfaces: strArray(d['surfaces']),
    amenities: strArray(d['amenities'] ?? d['comodidades']),
    photoUrls: strArray(d['photoUrls'] ?? d['photos'] ?? d['images']),
    logoUrl: firstString(d['logoUrl'], d['logo'], d['coverUrl']),
  };
}

/** Lista arenas públicas cadastradas para a vitrine do site. Vazio em caso de erro. */
export async function getPublicArenas(max = 12): Promise<ArenaSummary[]> {
  try {
    const snap = await getDocs(query(collection(liteDb, 'arenas'), limit(max * 2)));
    return snap.docs
      .map((d) => mapSummary(d.id, d.data()))
      .filter((a) => a.name && a.name !== 'Arena')
      .slice(0, max);
  } catch (err) {
    console.error('[arenas] getPublicArenas failed:', err);
    return [];
  }
}

/** Perfil público de uma arena (arenas/{id} + courts). Retorna null se não existir. */
export async function getArenaById(id: string): Promise<ArenaDetail | null> {
  try {
    const snap = await getDoc(doc(liteDb, 'arenas', id));
    if (!snap.exists()) return null;
    const d = snap.data();

    let courts: ArenaCourt[] = [];
    try {
      const courtsSnap = await getDocs(collection(liteDb, 'arenas', id, 'courts'));
      courts = courtsSnap.docs.map((c) => mapCourt(c.id, c.data()));
    } catch {
      courts = [];
    }

    return { ...mapSummary(snap.id, d), courts };
  } catch (err) {
    console.error('[arenas] getArenaById failed:', err);
    return null;
  }
}
