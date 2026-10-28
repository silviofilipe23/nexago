import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import {
  normalizeSearchTerm,
  profileMatchesSearchTokens,
  searchAnchorToken,
  searchQueryTokens,
  searchRelevanceScore,
  type SearchableProfile,
} from '@nexago/search-keywords';
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

/** Perfil sem nome nenhum — o repositório grava isso em `displayName`. */
const NAME_FALLBACK = 'Usuário';

/** Apelido primeiro, senão nome completo (mesma regra de `displayLabel` no Flutter). */
export function athleteDisplayName(
  athlete: Pick<AthleteSearchResult, 'displayName' | 'nickname'>,
): string {
  return athlete.nickname.trim() || athlete.displayName.trim() || NAME_FALLBACK;
}

/** Nome completo e apelido separados, pra quem precisa escolher o atleta CERTO: o rótulo acima
 *  é o apelido, e dois "Bia" só se distinguem pelo nome completo. O apelido sai vazio quando
 *  repetiria o nome (perfil sem nome completo cai no apelido). */
export function athleteIdentity(
  athlete: Pick<AthleteSearchResult, 'displayName' | 'nickname'>,
): { fullName: string; nickname: string } {
  const nickname = athlete.nickname.trim();
  const full = athlete.displayName.trim();
  const fullName = full && full !== NAME_FALLBACK ? full : nickname || NAME_FALLBACK;
  const repeats = normalizeSearchTerm(nickname) === normalizeSearchTerm(fullName);
  return { fullName, nickname: repeats ? '' : nickname };
}

/** "Beatriz Lima “Bia”" — o texto inteiro pro `title` da linha, que corta com reticências. */
export function athleteIdentityLabel(identity: { fullName: string; nickname: string }): string {
  return identity.nickname ? `${identity.fullName} “${identity.nickname}”` : identity.fullName;
}

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function athleteFromDoc(id: string, data: Record<string, unknown>): AthleteSearchResult {
  return {
    uid: id,
    displayName: optionalStr(data['fullName']) ?? optionalStr(data['name']) ?? NAME_FALLBACK,
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
  return normalizeSearchTerm(term);
}

/** O `array-contains` do Firestore aceita UM valor: a consulta ancora no token mais seletivo
 *  ("de oliveira" vira `oliveira`) e traz uma página folgada. O `AND` dos demais tokens e a
 *  ordem por relevância saem no client, do próprio doc — sem leitura extra. */
const ATHLETE_SEARCH_FETCH_LIMIT = 60;

interface AthleteSearchCandidate {
  data: Record<string, unknown>;
  athlete: AthleteSearchResult;
}

export async function searchAthletes(
  term: string,
  excludeUids: readonly string[] = [],
): Promise<AthleteSearchResult[]> {
  const tokens = searchQueryTokens(term);
  const anchor = searchAnchorToken(tokens);
  if (anchor.length < ATHLETE_SEARCH_MIN_TERM) return [];

  const db = organizerFirestore();
  const snap = await getDocs(
    query(
      collection(db, 'public_profiles'),
      where('hasAthleteRole', '==', true),
      where('keywords', 'array-contains', anchor),
      limit(ATHLETE_SEARCH_FETCH_LIMIT),
    ),
  );

  const excluded = new Set(excludeUids);
  const candidates = snap.docs
    .map((d) => {
      const data = d.data() as Record<string, unknown>;
      return { data, athlete: athleteFromDoc(d.id, data) };
    })
    .filter((c) => !excluded.has(c.athlete.uid));

  return rankAthleteSearch(candidates, tokens).slice(0, ATHLETE_SEARCH_LIMIT);
}

function searchableOf(candidate: AthleteSearchCandidate): SearchableProfile {
  const keywords = candidate.data['keywords'];
  return {
    fullName: candidate.athlete.displayName,
    nickname: candidate.athlete.nickname,
    keywords: Array.isArray(keywords) ? (keywords as string[]) : [],
  };
}

/** Exportado para teste: o `AND` dos tokens e a ordem por relevância, já sem Firestore. */
export function rankAthleteSearch(
  candidates: readonly AthleteSearchCandidate[],
  tokens: readonly string[],
): AthleteSearchResult[] {
  const strict = candidates.filter((c) => profileMatchesSearchTokens(searchableOf(c), tokens));
  // Sem casamento completo, mostra quem casou com a âncora: quem digitou "joao souza" e não tem
  // João Souza na base vê os Souza em vez de uma tela vazia.
  const chosen = strict.length > 0 ? [...strict] : [...candidates];

  return chosen
    .sort((a, b) => {
      const byScore = searchRelevanceScore(searchableOf(a), tokens) - searchRelevanceScore(searchableOf(b), tokens);
      if (byScore !== 0) return byScore;
      return athleteDisplayName(a.athlete).localeCompare(athleteDisplayName(b.athlete), 'pt-BR');
    })
    .map((c) => c.athlete);
}
