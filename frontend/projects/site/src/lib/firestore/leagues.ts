import { collection, doc, getDoc, getDocs, limit, query, type DocumentData } from 'firebase/firestore/lite';
import { liteDb } from '../firebase-lite';
import type { LeagueStage, LeagueSummary } from './types';

function toDate(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

function mapStage(s: DocumentData): LeagueStage {
  return {
    name: s['name'] ?? s['stageName'] ?? null,
    dateLabel: s['dateLabel'] ?? null,
    startAt: toDate(s['startAt']),
    tournamentIds: Array.isArray(s['tournamentIds']) ? s['tournamentIds'].map(String) : [],
  };
}

function mapLeague(id: string, d: DocumentData): LeagueSummary {
  const stages = Array.isArray(d['stages']) ? d['stages'].map(mapStage) : [];
  return {
    id,
    name: String(d['name'] ?? 'Liga nexaGO'),
    seasonLabel: d['seasonLabel'] ?? null,
    description: d['description'] ?? null,
    coverUrl: d['coverUrl'] ?? d['imageUrl'] ?? null,
    stages,
  };
}

function isPublic(d: DocumentData): boolean {
  return d['listingStatus'] !== 'draft';
}

/** Retorna a liga pública mais relevante (primeira encontrada), ou null. */
export async function getFeaturedLeague(): Promise<LeagueSummary | null> {
  try {
    const snap = await getDocs(query(collection(liteDb, 'leagues'), limit(5)));
    const found = snap.docs.find((d) => isPublic(d.data())) ?? snap.docs[0];
    if (!found) return null;
    return mapLeague(found.id, found.data());
  } catch (err) {
    console.error('[leagues] getFeaturedLeague failed:', err);
    return null;
  }
}

/** Lista as ligas públicas. Vazio em caso de erro. */
export async function getPublicLeagues(max = 20): Promise<LeagueSummary[]> {
  try {
    const snap = await getDocs(query(collection(liteDb, 'leagues'), limit(max)));
    return snap.docs.filter((d) => isPublic(d.data())).map((d) => mapLeague(d.id, d.data()));
  } catch (err) {
    console.error('[leagues] getPublicLeagues failed:', err);
    return [];
  }
}

/** Perfil público de uma liga (leagues/{id}). Retorna null se não existir/for draft. */
export async function getLeagueById(id: string): Promise<LeagueSummary | null> {
  try {
    const snap = await getDoc(doc(liteDb, 'leagues', id));
    if (!snap.exists()) return null;
    const d = snap.data();
    if (!isPublic(d)) return null;
    return mapLeague(snap.id, d);
  } catch (err) {
    console.error('[leagues] getLeagueById failed:', err);
    return null;
  }
}
