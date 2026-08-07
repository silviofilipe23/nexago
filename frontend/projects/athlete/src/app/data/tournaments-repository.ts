import { collection, doc, documentId, getDoc, getDocs, query, where, type Firestore } from 'firebase/firestore';

/** `tournaments/{id}` (top-level, leitura pública) — espelha `TournamentDocumentMapper`
 *  (Flutter). Sem paginação: a coleção inteira é lida e filtrada/ordenada em memória (mesma
 *  escolha do app — "bounded query", não é uma tabela grande). */

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  if (typeof t?.toDate === 'function') return t.toDate();
  if (typeof v === 'string') {
    const parsed = new Date(v);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function numberOf(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.replace(/[^\d.,-]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export type TournamentGenderCat = 'M' | 'F' | 'Mix';

export interface TournamentPrize {
  position: number;
  value: number;
  label: string | null;
}

function prizesOf(raw: unknown): TournamentPrize[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      if (!p || typeof p !== 'object') return null;
      const o = p as Record<string, unknown>;
      const position = numberOf(o['position']);
      const value = numberOf(o['value']) ?? 0;
      if (position == null) return null;
      return { position, value, label: optionalStr(o['label']) };
    })
    .filter((p): p is TournamentPrize => p != null);
}

function genderCatOf(raw: unknown): TournamentGenderCat {
  const v = optionalStr(raw)?.toLowerCase() ?? '';
  if (v.includes('fem') || v === 'f') return 'F';
  if (v.includes('mist') || v.includes('mix')) return 'Mix';
  return 'M';
}

export interface TournamentCategoryOffer {
  id: string;
  categoryName: string;
  entryFee: number;
  maxTeams: number;
  spotsLeft: number;
  level: string | null;
  genderType: TournamentGenderCat;
  /** Categoria de EQUIPE nomeada (trio/quarteto/quinteto): 3–5. `null` = dupla clássica. */
  teamSize: number | null;
  /** Equipe sem restrição de gênero (`genderMode: 'free'`) — o `genderType` fica Mix só p/ exibição. */
  genderFree: boolean;
  /** Composição exata da equipe (misto): homens + mulheres = `teamSize`. `null` quando livre/dupla. */
  genderComposition: { men: number; women: number } | null;
  bracketFormat: string;
  registrationClosed: boolean;
  isCompleted: boolean;
  prizes: TournamentPrize[];
  qualifiersPerGroup: number;
  /** `'none' | 'top_only' | 'top' | 'full'` (cru do doc; herda da raiz — ver mapper). */
  uniformType: string | null;
  uniformNumberOnShirt: boolean;
  uniformNameOnShirt: boolean;
  uniformSizeOptionsTop: string[];
  uniformSizeOptionsShorts: string[];
  ageBand: string | null;
  ageRestrictionMode: string | null;
  ageMinYears: number | null;
  ageMaxYears: number | null;
  ageReference: string | null;
}

function stringListOf(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((s) => (typeof s === 'string' ? s.trim() : '')).filter((s) => s.length > 0);
}

/** Flags de uniforme da raiz do torneio (`uniformRequired`/`uniformNumberOnShirt`/`uniformNameOnShirt`). */
interface RootUniformFlags {
  required: boolean;
  numberOnShirt: boolean;
  nameOnShirt: boolean;
}

function categoryOfferFromRaw(raw: unknown, rootUniform: RootUniformFlags): TournamentCategoryOffer | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  // Mesma ordem do Flutter (`id ?? categoryId ?? name`) — convites/inscrições gravam o id
  // resolvido pelo app, então o web precisa resolver igual pra casar a oferta.
  const id = optionalStr(o['id']) ?? optionalStr(o['categoryId']) ?? optionalStr(o['categoryName']) ?? optionalStr(o['name']);
  if (!id) return null;
  const maxTeams = numberOf(o['maxTeams']) ?? numberOf(o['spotsTotal']) ?? numberOf(o['capacity']) ?? 0;
  const qualifiers = numberOf(o['qualifiersPerGroup']) ?? 2;
  const ageRestriction = o['ageRestriction'] && typeof o['ageRestriction'] === 'object' ? (o['ageRestriction'] as Record<string, unknown>) : null;

  // Herança (espelha `TournamentDocumentMapper._parseCategoryOffers`): categoria sem exigência
  // própria mas torneio com `uniformRequired` ⇒ vira `top_only` com as flags da raiz.
  let uniformType = optionalStr(o['uniformType']);
  let uniformNumberOnShirt = o['uniformNumberOnShirt'] === true;
  let uniformNameOnShirt = o['uniformNameOnShirt'] === true;
  const requiresOwnUniform = uniformType === 'top_only' || uniformType === 'top' || uniformType === 'full';
  if (!requiresOwnUniform && rootUniform.required) {
    uniformType = 'top_only';
    uniformNumberOnShirt = rootUniform.numberOnShirt;
    uniformNameOnShirt = rootUniform.nameOnShirt;
  }

  // Categoria de equipe (trio/quarteto/quinteto) — gravada pelo portal do organizador.
  const teamSizeRaw = numberOf(o['teamSize']);
  const teamSize = teamSizeRaw != null && teamSizeRaw >= 3 && teamSizeRaw <= 5 ? teamSizeRaw : null;
  const compositionRaw = o['genderComposition'] && typeof o['genderComposition'] === 'object' ? (o['genderComposition'] as Record<string, unknown>) : null;
  const men = numberOf(compositionRaw?.['men']);
  const women = numberOf(compositionRaw?.['women']);
  const genderFree = teamSize != null && optionalStr(o['genderMode']) === 'free';
  const genderComposition =
    teamSize != null && !genderFree && men != null && women != null && men + women === teamSize ? { men, women } : null;

  return {
    id,
    categoryName: optionalStr(o['categoryName']) ?? optionalStr(o['name']) ?? id,
    entryFee: numberOf(o['entryFee']) ?? 0,
    maxTeams,
    spotsLeft: numberOf(o['spotsLeft']) ?? maxTeams,
    level: optionalStr(o['level']),
    genderType: genderCatOf(o['genderType']),
    teamSize,
    genderFree,
    genderComposition,
    bracketFormat: optionalStr(o['bracketFormat']) ?? 'single elimination',
    registrationClosed: o['registrationClosed'] === true,
    isCompleted: o['isCompleted'] === true,
    prizes: prizesOf(o['prizes']),
    qualifiersPerGroup: Math.min(99, Math.max(1, qualifiers)),
    uniformType,
    uniformNumberOnShirt,
    uniformNameOnShirt,
    uniformSizeOptionsTop: stringListOf(o['uniformSizeOptionsTop']),
    uniformSizeOptionsShorts: stringListOf(o['uniformSizeOptionsShorts']),
    ageBand: optionalStr(o['ageBand']),
    ageRestrictionMode: optionalStr(ageRestriction?.['mode']),
    ageMinYears: numberOf(ageRestriction?.['minAge']),
    ageMaxYears: numberOf(ageRestriction?.['maxAge']),
    ageReference: optionalStr(ageRestriction?.['reference']),
  };
}

// ── Categoria de equipe (trio/quarteto/quinteto) — helpers de exibição ────────

export function isTeamCategoryOffer(category: Pick<TournamentCategoryOffer, 'teamSize'>): boolean {
  return category.teamSize != null;
}

/** "Dupla" / "Trio" / "Quarteto" / "Quinteto" — pill de formato da categoria. */
export function categoryFormatLabel(category: Pick<TournamentCategoryOffer, 'teamSize'>): string {
  switch (category.teamSize) {
    case 3:
      return 'Trio';
    case 4:
      return 'Quarteto';
    case 5:
      return 'Quinteto';
    default:
      return 'Dupla';
  }
}

/** Unidade das vagas: "duplas" ou "equipes". */
export function categoryUnitLabel(category: Pick<TournamentCategoryOffer, 'teamSize'>): string {
  return category.teamSize != null ? 'equipes' : 'duplas';
}

export function categoryUnitSingular(category: Pick<TournamentCategoryOffer, 'teamSize'>): string {
  return category.teamSize != null ? 'equipe' : 'dupla';
}

/** Detalhe de gênero da equipe: "Livre" (sem restrição) ou "2H + 2M" (composição mista). */
export function categoryGenderDetail(category: Pick<TournamentCategoryOffer, 'teamSize' | 'genderFree' | 'genderComposition'>): string | null {
  if (category.teamSize == null) return null;
  if (category.genderFree) return 'Livre';
  const comp = category.genderComposition;
  if (comp && comp.men > 0 && comp.women > 0) return `${comp.men}H + ${comp.women}M`;
  return null;
}

/** `scheduled|open|bracketsReady|almostFull|live|completed|ended` — espelha
 *  `listingStatusFromRaw`/`resolveListingStatus` (Flutter), colapsado pra 4 estados na UI. */
export type TournamentRawStatus = 'scheduled' | 'open' | 'bracketsReady' | 'almostFull' | 'live' | 'completed' | 'ended';
export type TournamentListingStatus = 'open' | 'almost_full' | 'live' | 'ended';

function rawStatusFromString(raw: string | null): TournamentRawStatus | null {
  const v = raw?.toLowerCase().trim() ?? '';
  if (!v) return null;
  if (v.includes('draft') || v.includes('programado')) return 'scheduled';
  if (v.includes('cancel')) return 'ended';
  if (v.includes('closed') || v.includes('inscri') && v.includes('encerr')) return 'bracketsReady';
  if (v.includes('brackets ready') || v.includes('chaves prontas')) return 'bracketsReady';
  if (v.includes('almost') || v.includes('quase lotado')) return 'almostFull';
  if (v.includes('progress') || v.includes('andamento') || v === 'live' || v.includes('ao vivo')) return 'live';
  if (v.includes('completed') || v.includes('conclu')) return 'completed';
  if (v.includes('ended') || v.includes('encerrado') || v.includes('finalizado')) return 'ended';
  if (v.includes('open') || v.includes('aberta')) return 'open';
  return null;
}

export interface TournamentSummary {
  id: string;
  name: string;
  city: string;
  location: string;
  locationAddress: string | null;
  dateLabel: string | null;
  startAt: Date | null;
  endAt: Date | null;
  format: 'Dupla' | 'Individual';
  capacity: number;
  enrolledCount: number;
  featured: boolean;
  liveMatchesNow: number;
  rawStatus: TournamentRawStatus | null;
  /** Cancelado pelo organizador (`cancelTournament` grava `listingStatus: 'cancelled'`). O
   *  `rawStatus` colapsa cancelado em `ended`, então quem precisa da distinção — o painel, que
   *  esconde a inscrição de um torneio que não vai acontecer — lê esta flag. */
  isCancelled: boolean;
  /** Rascunho ou cancelado — some da listagem pública mas o `rawStatus` colapsado não distingue
   *  "cancelado" de "encerrado" (`isPubliclyListedTournament`). */
  isDraftOrCancelled: boolean;
  leagueId: string | null;
  leagueStageId: string | null;
  leagueStageOrder: number | null;
  leagueStageName: string | null;
  coverUrl: string | null;
  managerId: string | null;
  regulationsText: string | null;
  sport: string | null;
  paymentMode: 'appPixCard' | 'directWithOrganizer';
  organizerPix: { key: string; keyType: string; recipientName: string; city: string } | null;
  waitlistEnabled: boolean;
  tournamentPrizes: TournamentPrize[];
  categories: TournamentCategoryOffer[];
}

export function organizerPixOf(raw: unknown): TournamentSummary['organizerPix'] {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const key = optionalStr(o['key']);
  if (!key) return null;
  return {
    key,
    // Vazio (não `'random'`): o wizard do organizador não pergunta o tipo da
    // chave, então sem isso `resolveKeyKind` (pix-brcode.ts) nunca cai no
    // auto-detect por formato e trata telefone/CPF/CNPJ como EVP aleatória.
    keyType: optionalStr(o['keyType']) ?? '',
    recipientName: optionalStr(o['recipientName']) ?? '',
    city: optionalStr(o['city']) ?? '',
  };
}

function summaryFromDoc(id: string, data: Record<string, unknown>): TournamentSummary {
  const rootUniform: RootUniformFlags = {
    required: data['uniformRequired'] === true,
    numberOnShirt: data['uniformNumberOnShirt'] === true,
    nameOnShirt: data['uniformNameOnShirt'] === true,
  };
  const categories = Array.isArray(data['categories'])
    ? data['categories'].map((c) => categoryOfferFromRaw(c, rootUniform)).filter((c): c is TournamentCategoryOffer => c != null)
    : [];
  const capacity = numberOf(data['capacity']) || categories.reduce((sum, c) => sum + c.maxTeams, 0);
  const statusRaw = (optionalStr(data['listingStatus']) ?? optionalStr(data['status']) ?? '').toLowerCase();
  // `cancelled`/`canceled`/`cancelado`/`cancelada` — todo o vocabulário aceito pelo backend
  // (`tournament-registration-guards`) contém "cancel".
  const isCancelled = statusRaw.includes('cancel');
  return {
    id,
    name: optionalStr(data['name']) ?? 'Torneio',
    city: optionalStr(data['city']) ?? '',
    location: optionalStr(data['locationName']) ?? optionalStr(data['location']) ?? optionalStr(data['venueName']) ?? '',
    locationAddress: optionalStr(data['locationAddress']),
    dateLabel: optionalStr(data['dateLabel']),
    startAt: toDate(data['startAt']) ?? toDate(data['startDate']),
    endAt: toDate(data['endAt']) ?? toDate(data['endDate']),
    format: optionalStr(data['format'])?.toLowerCase().includes('individual') ? 'Individual' : 'Dupla',
    capacity,
    enrolledCount: numberOf(data['enrolledCount']) ?? 0,
    featured: data['featured'] === true,
    liveMatchesNow: numberOf(data['liveMatchesNow']) ?? 0,
    rawStatus: rawStatusFromString(statusRaw),
    isCancelled,
    isDraftOrCancelled: statusRaw.includes('draft') || statusRaw.includes('programado') || isCancelled,
    leagueId: optionalStr(data['leagueId']),
    leagueStageId: optionalStr(data['leagueStageId']),
    leagueStageOrder: numberOf(data['leagueStageOrder']),
    leagueStageName: optionalStr(data['leagueStageName']),
    coverUrl: optionalStr(data['coverUrl']) ?? optionalStr(data['imageUrl']) ?? optionalStr(data['coverImageUrl']) ?? optionalStr(data['posterUrl']) ?? optionalStr(data['thumbnailUrl']),
    managerId: optionalStr(data['managerId']),
    regulationsText: optionalStr(data['regulationsText']),
    sport: optionalStr(data['sport']),
    paymentMode: optionalStr(data['paymentMode']) === 'directWithOrganizer' ? 'directWithOrganizer' : 'appPixCard',
    organizerPix: organizerPixOf(data['organizerPix']),
    waitlistEnabled: data['waitlistEnabled'] !== false,
    tournamentPrizes: prizesOf(data['prizes']),
    categories,
  };
}

/** Espelha `resolveListingStatus` (Flutter), colapsado pros 4 estados que a UI usa:
 *  `scheduled`→open (com `registrationOpensAt`), `bracketsReady`→almost_full (inscrição
 *  fechada, ainda não é o dia), `completed`→ended. */
export function tournamentListingStatus(t: Pick<TournamentSummary, 'startAt' | 'endAt' | 'rawStatus' | 'liveMatchesNow' | 'enrolledCount' | 'capacity'>, now = new Date()): TournamentListingStatus {
  const raw = resolveTournamentRawStatus(t, now);
  switch (raw) {
    case 'scheduled':
    case 'open':
      return 'open';
    case 'bracketsReady':
    case 'almostFull':
      return 'almost_full';
    case 'live':
      return 'live';
    case 'completed':
    case 'ended':
      return 'ended';
  }
}

function resolveTournamentRawStatus(
  t: Pick<TournamentSummary, 'startAt' | 'endAt' | 'rawStatus' | 'liveMatchesNow' | 'enrolledCount' | 'capacity'>,
  now: Date,
): TournamentRawStatus {
  if (t.rawStatus === 'completed' || t.rawStatus === 'ended') return t.rawStatus;
  if (t.liveMatchesNow > 0) return 'live';
  const end = t.endAt ?? t.startAt;
  if (t.rawStatus === 'live') return end && now > end ? 'completed' : 'live';
  if (end && now > end) return 'completed';
  if (t.startAt) {
    const sameDay = now.toDateString() === t.startAt.toDateString();
    if (sameDay && (t.rawStatus === 'open' || t.rawStatus === 'almostFull')) return 'live';
  }
  if (t.rawStatus) return t.rawStatus;
  const spotsLeft = t.capacity - t.enrolledCount;
  if (spotsLeft <= 0) return 'completed';
  if (spotsLeft <= 5) return 'almostFull';
  if (t.startAt && t.startAt.getTime() - now.getTime() < 2 * 60 * 60_000 && t.startAt.getTime() - now.getTime() > 0) return 'live';
  return 'open';
}

/** Campos do torneio que decidem se uma categoria ainda aceita dupla. */
export type RegistrationTournamentFields = Pick<
  TournamentSummary,
  'startAt' | 'endAt' | 'rawStatus' | 'liveMatchesNow' | 'enrolledCount' | 'capacity' | 'waitlistEnabled'
>;

/**
 * A categoria ainda aceita uma dupla nova — por inscrição direta ou lista de espera?
 *
 * Independe de quem está olhando: é a oferta em si. Quem já está inscrito continua vendo a
 * própria inscrição, mas isso não muda o fato de a categoria estar aberta ou fechada.
 *
 * `spotsLeft` vem de fora porque a contagem fresca mora em `inscriptions`
 * (`fetchCategoryEnrolledCounts`), não no `spotsLeft` do doc do torneio.
 */
export function categoryAcceptsRegistration(
  t: RegistrationTournamentFields,
  cat: Pick<TournamentCategoryOffer, 'isCompleted' | 'registrationClosed'>,
  spotsLeft: number,
  now = new Date(),
): boolean {
  if (cat.isCompleted || cat.registrationClosed) return false;
  if (tournamentListingStatus(t, now) === 'ended') return false;
  return spotsLeft > 0 || t.waitlistEnabled;
}

/** `registrationOpensAt`: quando o torneio ainda está `scheduled`, a UI mostra "Em breve" até
 *  a data de início (não existe um campo dedicado de abertura de inscrição no schema). */
export function registrationOpensAt(t: Pick<TournamentSummary, 'rawStatus' | 'startAt'>): Date | null {
  return t.rawStatus === 'scheduled' ? t.startAt : null;
}

/** Torneios ocultos da listagem pública — rascunho/cancelado (`isPubliclyListedTournament`). */
function isPubliclyListed(t: Pick<TournamentSummary, 'isDraftOrCancelled'>): boolean {
  return !t.isDraftOrCancelled;
}

export async function fetchAllTournaments(db: Firestore): Promise<TournamentSummary[]> {
  const snap = await getDocs(collection(db, 'tournaments'));
  return snap.docs.map((d) => summaryFromDoc(d.id, d.data() as Record<string, unknown>)).filter((t) => isPubliclyListed(t));
}

export async function fetchTournament(db: Firestore, id: string): Promise<TournamentSummary | null> {
  const snap = await getDoc(doc(db, 'tournaments', id));
  if (!snap.exists()) return null;
  return summaryFromDoc(snap.id, snap.data() as Record<string, unknown>);
}

export async function fetchTournamentSummariesByIds(db: Firestore, ids: readonly string[]): Promise<Map<string, TournamentSummary>> {
  const unique = [...new Set(ids.filter((id) => id.trim().length > 0))];
  const result = new Map<string, TournamentSummary>();
  if (unique.length === 0) return result;

  const chunkPromises: Promise<void>[] = [];
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    chunkPromises.push(
      getDocs(query(collection(db, 'tournaments'), where(documentId(), 'in', chunk))).then((snap) => {
        for (const d of snap.docs) result.set(d.id, summaryFromDoc(d.id, d.data() as Record<string, unknown>));
      }),
    );
  }
  await Promise.all(chunkPromises);
  return result;
}

export async function fetchTournamentNamesByIds(db: Firestore, ids: readonly string[]): Promise<Map<string, string>> {
  const summaries = await fetchTournamentSummariesByIds(db, ids);
  const result = new Map<string, string>();
  for (const [id, s] of summaries) result.set(id, s.name);
  return result;
}

/** Contagem de inscritos por categoria vinda de `inscriptions` (mais fresca que `spotsLeft` do
 *  doc do torneio, que pode estar desatualizado) — espelha `categoryEnrolledCount`. */
export async function fetchCategoryEnrolledCounts(db: Firestore, projectId: string, tournamentId: string): Promise<Map<string, number>> {
  const snap = await getDocs(query(collection(db, 'artifacts', projectId, 'public', 'data', 'inscriptions'), where('tournamentId', '==', tournamentId)));
  const counts = new Map<string, number>();
  for (const d of snap.docs) {
    const categoryId = optionalStr((d.data() as Record<string, unknown>)['categoryId']);
    if (!categoryId) continue;
    counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
  }
  return counts;
}

/** Inscritos por torneio, para telas de lista (o card do Competir) — mesma fonte de
 *  `fetchCategoryEnrolledCounts`, agrupada por torneio em vez de por categoria. O
 *  `enrolledCount` do doc do torneio não serve: nasce `0` e nunca é incrementado. `in` aceita
 *  10 valores por consulta, então vai em blocos (igual `fetchTournamentSummariesByIds`). */
export async function fetchEnrolledCountsByTournament(
  db: Firestore,
  projectId: string,
  tournamentIds: readonly string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(tournamentIds.filter((id) => id.trim().length > 0))];
  const counts = new Map<string, number>();
  if (unique.length === 0) return counts;

  const chunkPromises: Promise<void>[] = [];
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    chunkPromises.push(
      getDocs(
        query(collection(db, 'artifacts', projectId, 'public', 'data', 'inscriptions'), where('tournamentId', 'in', chunk)),
      ).then((snap) => {
        for (const d of snap.docs) {
          const tid = optionalStr((d.data() as Record<string, unknown>)['tournamentId']);
          if (tid) counts.set(tid, (counts.get(tid) ?? 0) + 1);
        }
      }),
    );
  }
  await Promise.all(chunkPromises);
  return counts;
}

export function tournamentIsLive(t: Pick<TournamentSummary, 'startAt' | 'endAt' | 'rawStatus' | 'liveMatchesNow' | 'enrolledCount' | 'capacity'>, now = new Date()): boolean {
  return tournamentListingStatus(t, now) === 'live';
}

export function tournamentIsCompleted(t: Pick<TournamentSummary, 'startAt' | 'endAt' | 'rawStatus' | 'liveMatchesNow' | 'enrolledCount' | 'capacity'>, now = new Date()): boolean {
  return tournamentListingStatus(t, now) === 'ended';
}
