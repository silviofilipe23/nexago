import { collection, getDocs, limit, query, where, type Firestore } from 'firebase/firestore';
import {
  profileMatchesSearchTokens,
  searchAnchorToken,
  searchQueryTokens,
  searchRelevanceScore,
  type SearchableProfile,
} from '@nexago/search-keywords';
import type { AthleteCandidate } from './athlete-search-filter';

/** Busca de atleta em todo o nexaGO (`public_profiles`, sem PII), para quem nunca reservou na
 *  arena: o atleta que chega no balcão. Mesmo índice (`hasAthleteRole` + `keywords`) e mesma
 *  regra multi-token do app (`searchAthletesByKeywords`) e do painel do organizador. */

/** Abaixo disso o prefixo devolve meia base: o campo pede mais letras. */
export const PLATFORM_SEARCH_MIN_TERM = 2;

/** O `array-contains` ancora num token só; os outros filtram no client, daí a página folgada. */
const FETCH_LIMIT = 60;
const MAX_RESULTS = 8;

export interface PlatformAthleteDoc {
  id: string;
  data: Record<string, unknown>;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Nome completo primeiro (o balcão confere pelo nome); apelido entre aspas se for diferente. */
export function platformAthleteName(data: Record<string, unknown>): string {
  const fullName = str(data['fullName']) || str(data['name']);
  const nickname = str(data['nickname']);
  if (!fullName) return nickname;
  if (!nickname || nickname.toLowerCase() === fullName.toLowerCase()) return fullName;
  return `${fullName} “${nickname}”`;
}

function searchableOf(data: Record<string, unknown>): SearchableProfile {
  const keywords = data['keywords'];
  return {
    fullName: str(data['fullName']) || str(data['name']),
    nickname: str(data['nickname']),
    keywords: Array.isArray(keywords) ? (keywords as string[]) : [],
  };
}

/** `AND` dos tokens + ordem por relevância, sem Firestore (exportado para teste). Tira quem já
 *  está na lista da arena: ele aparece lá em cima, como cliente. */
export function rankPlatformAthletes(
  docs: readonly PlatformAthleteDoc[],
  term: string,
  excludeIds: ReadonlySet<string> = new Set(),
): AthleteCandidate[] {
  const tokens = searchQueryTokens(term);
  if (tokens.length === 0) return [];
  return docs
    .filter((d) => !excludeIds.has(d.id))
    .filter((d) => profileMatchesSearchTokens(searchableOf(d.data), tokens))
    .map((d) => ({ doc: d, name: platformAthleteName(d.data), score: searchRelevanceScore(searchableOf(d.data), tokens) }))
    .filter((c) => c.name)
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, MAX_RESULTS)
    .map(({ doc, name }) => {
      const photo = str(doc.data['profilePhotoUrl']) || str(doc.data['avatarUrl']) || str(doc.data['photoURL']);
      return { athleteId: doc.id, name, photoUrl: photo || null };
    });
}

/** O termo já dá busca na plataforma? (token mais longo com o mínimo de letras). */
export function canSearchPlatform(term: string): boolean {
  return searchAnchorToken(searchQueryTokens(term)).length >= PLATFORM_SEARCH_MIN_TERM;
}

export async function searchPlatformAthletes(
  db: Firestore,
  term: string,
  excludeIds: ReadonlySet<string>,
): Promise<AthleteCandidate[]> {
  if (!canSearchPlatform(term)) return [];
  const anchor = searchAnchorToken(searchQueryTokens(term));
  const snap = await getDocs(
    query(
      collection(db, 'public_profiles'),
      where('hasAthleteRole', '==', true),
      where('keywords', 'array-contains', anchor),
      limit(FETCH_LIMIT),
    ),
  );
  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
  return rankPlatformAthletes(docs, term, excludeIds);
}
