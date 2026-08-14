import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { organizerFirestore } from './firestore';

/** Busca de atleta cadastrado por prefixo de nome/apelido em `public_profiles`
 *  (`hasAthleteRole` + `keywords array-contains`) — mesmo índice composto que
 *  `searchUsersByNicknameOrName` usa no app. É a fonte única das telas do painel que precisam
 *  apontar um atleta: adicionar à equipe do torneio e inscrever uma dupla na categoria.
 *
 *  `public_profiles` é o espelho SEM PII: nome, apelido e foto. Telefone e e-mail não passam
 *  por aqui — quem precisa de contato usa `getTournamentAthleteContacts`. */

export interface AthleteSearchResult {
  uid: string;
  displayName: string;
  nickname: string;
  photoUrl: string | null;
}

/** Abaixo disso a busca por prefixo devolve meia base — a tela pede mais letras. */
export const ATHLETE_SEARCH_MIN_TERM = 2;

const ATHLETE_SEARCH_LIMIT = 20;

/** Apelido primeiro, senão nome completo (mesma regra de `displayLabel` no Flutter). */
export function athleteDisplayName(
  athlete: Pick<AthleteSearchResult, 'displayName' | 'nickname'>,
): string {
  return athlete.nickname.trim() || athlete.displayName.trim() || 'Usuário';
}

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function athleteFromDoc(id: string, data: Record<string, unknown>): AthleteSearchResult {
  return {
    uid: id,
    displayName: optionalStr(data['fullName']) ?? optionalStr(data['name']) ?? 'Usuário',
    nickname: optionalStr(data['nickname']) ?? '',
    photoUrl:
      optionalStr(data['profilePhotoUrl']) ??
      optionalStr(data['avatarUrl']) ??
      optionalStr(data['photoURL']),
  };
}

/** As `keywords` são gravadas sem acento e sem separador (`onUserSearchKeywordsSync`), então o
 *  termo digitado precisa passar pela mesma normalização — senão "gonçalves" nunca casa. */
export function normalizeAthleteSearchTerm(term: string): string {
  return term
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export async function searchAthletes(
  term: string,
  excludeUids: readonly string[] = [],
): Promise<AthleteSearchResult[]> {
  const normalized = normalizeAthleteSearchTerm(term);
  if (normalized.length < ATHLETE_SEARCH_MIN_TERM) return [];
  const db = organizerFirestore();
  const snap = await getDocs(
    query(
      collection(db, 'public_profiles'),
      where('hasAthleteRole', '==', true),
      where('keywords', 'array-contains', normalized),
      limit(ATHLETE_SEARCH_LIMIT),
    ),
  );
  const excluded = new Set(excludeUids);
  return snap.docs
    .map((d) => athleteFromDoc(d.id, d.data() as Record<string, unknown>))
    .filter((a) => !excluded.has(a.uid));
}
