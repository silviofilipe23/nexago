import { Timestamp, addDoc, collection, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { organizerFirestore } from './firestore';
import { organizerStorage } from './storage';
import { generateKeywords } from './search-keywords';
import {
  BRACKET_FORMAT_FIRESTORE,
  DISPUTE_TEAM_SIZE,
  SKILL_LEVEL_LABEL,
  type AgeBand,
  type AgeReference,
  type CategoryGender,
  type CategoryDispute,
  type CategoryPrizeDraft,
  type SkillLevel,
  type TournamentBestOf,
  type TournamentBracketSystem,
  type TournamentCategoryDraft,
  type TournamentCreateDraft,
  type TournamentPaymentMode,
  type TournamentSport,
  type TournamentVisibility,
  bracketSystemFromRaw,
  categoryGenderComposition,
  defaultCourtsFromCount,
  isTeamDispute,
  suggestCategoryName,
  totalSpots,
} from './tournament-create.model';

/** Porta fiel de `tournament_create_mapper.dart` (Flutter): monta o doc `tournaments/{id}`
 *  campo a campo IGUAL ao app — qualquer divergência aqui quebra a leitura pelo app/athlete
 *  (que espera exatamente esse schema). `publishTournamentDraft` cobre criar + editar. */

const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

function formatDateRange(start: Date, end: Date): string {
  const sameDay = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth() && start.getDate() === end.getDate();
  if (sameDay) return SHORT_DATE.format(start);
  return `${SHORT_DATE.format(start)} – ${SHORT_DATE.format(end)}`;
}

function ageRestrictionToMap(category: TournamentCategoryDraft): Record<string, unknown> {
  const reference = category.ageReference;
  if (category.ageCustomEnabled) {
    const min = category.ageMinYears;
    const max = category.ageMaxYears;
    const mode = min != null && max != null ? 'range' : min != null ? 'min' : max != null ? 'max' : 'none';
    return {
      mode,
      ...(min != null ? { minAge: min } : {}),
      ...(max != null ? { maxAge: max } : {}),
      reference,
      custom: true,
    };
  }
  const band = category.ageBand;
  if (band.startsWith('sub')) return { mode: 'max', maxAge: Number(band.slice(3)), reference };
  if (band.startsWith('plus')) return { mode: 'min', minAge: Number(band.slice(4)), reference };
  return { mode: 'none', reference };
}

export function categoryToMap(category: TournamentCategoryDraft, draft: TournamentCreateDraft): Record<string, unknown> {
  const isTeam = isTeamDispute(category.dispute);
  const composition = categoryGenderComposition(category);
  return {
    id: category.id,
    categoryName: category.name.trim() || suggestCategoryName(category),
    // Equipe "livre" grava mixed para leitores legados exibirem algo coerente;
    // a semântica real (sem restrição) fica em genderMode.
    genderType: isTeam && category.genderFree ? 'mixed' : category.gender,
    disputeType: category.dispute,
    teamSize: DISPUTE_TEAM_SIZE[category.dispute] ?? 2,
    ...(isTeam
      ? {
          genderMode: category.genderFree ? 'free' : 'composition',
          genderComposition: composition,
        }
      : {}),
    ageBand: category.ageBand,
    ageRestriction: ageRestrictionToMap(category),
    level: SKILL_LEVEL_LABEL[category.skillLevel],
    minLevel: category.minSkillLevel ? SKILL_LEVEL_LABEL[category.minSkillLevel] : null,
    maxTeams: category.spots,
    spotsTotal: category.spots,
    spotsLeft: category.spots,
    entryFee: category.priceCents / 100,
    entryFeeCents: category.priceCents,
    useDefaultPrice: category.useDefaultPrice,
    bracketFormat: BRACKET_FORMAT_FIRESTORE[category.bracketSystem],
    teamsPerGroup: category.teamsPerGroup,
    qualifiersPerGroup: category.qualifiersPerGroup,
    bestOf: category.bestOf,
    finalBestOf5: category.finalBestOf5,
    maxRegistrationsPerAthlete: category.maxRegistrationsPerAthlete,
    registrationClosed: false,
    isCompleted: false,
    prizes: category.prizes.map((p) => ({
      position: p.position,
      value: (p.valueCents / 100).toFixed(0),
      valueCents: p.valueCents,
      ...(p.label ? { label: p.label } : {}),
    })),
    uniformType: draft.uniformRequired ? 'top_only' : 'none',
    uniformNameOnShirt: draft.uniformRequired && draft.uniformNameOnShirt,
    uniformNumberOnShirt: draft.uniformRequired && draft.uniformNumberOnShirt,
  };
}

function resolveListingStatus(publish: boolean, isUpdate: boolean, existingListingStatus: string | null): string {
  if (publish) return 'open';
  const existing = existingListingStatus?.trim().toLowerCase();
  if (isUpdate && existing && existing !== 'draft' && existing !== 'rascunho') return existingListingStatus!.trim();
  return 'draft';
}

export function tournamentDraftToFirestore(params: {
  draft: TournamentCreateDraft;
  managerId: string;
  publish: boolean;
  isUpdate?: boolean;
  existingListingStatus?: string | null;
}): Record<string, unknown> {
  const { draft, managerId, publish, isUpdate = false, existingListingStatus = null } = params;
  const categories = draft.categories.map((c) => categoryToMap(c, draft));
  const capacity = totalSpots(draft);
  const startAt = draft.startAt!;
  const endAt = draft.endAt!;
  const listingStatus = resolveListingStatus(publish, isUpdate, existingListingStatus);
  const name = draft.name.trim();

  return {
    name,
    sport: draft.sport,
    description: draft.description.trim() || null,
    city: draft.city.trim(),
    state: draft.state.trim() || null,
    locationName: draft.locationName.trim(),
    location: draft.locationName.trim(),
    locationAddress: draft.locationAddress.trim() || null,
    arenaId: draft.arenaId,
    startAt: Timestamp.fromDate(startAt),
    endAt: Timestamp.fromDate(endAt),
    firstMatchAt: draft.firstMatchAt ? Timestamp.fromDate(draft.firstMatchAt) : null,
    dateLabel: formatDateRange(startAt, endAt),
    courtsCount: draft.courtsCount,
    courts: defaultCourtsFromCount(draft.courtsCount),
    format: draft.categories.some((c) => c.dispute === 'individual') ? 'individual' : 'dupla',
    capacity,
    ...(isUpdate ? {} : { enrolledCount: 0, collectedCents: 0 }),
    listingStatus,
    status: listingStatus,
    visibility: draft.visibility,
    featured: false,
    liveMatchesNow: 0,
    managerId,
    categories,
    defaultEntryFeeCents: draft.defaultPriceCents,
    registrationOpensAt: draft.registrationOpensAt ? Timestamp.fromDate(draft.registrationOpensAt) : null,
    registrationClosesAt: draft.registrationClosesAt ? Timestamp.fromDate(draft.registrationClosesAt) : null,
    paymentMode: draft.paymentMode,
    organizerPix:
      draft.paymentMode === 'directWithOrganizer'
        ? {
            key: draft.organizerPixKey.trim(),
            keyType: draft.organizerPixKeyType.trim(),
            recipientName: draft.organizerPixRecipientName.trim(),
            city: draft.organizerPixCity.trim(),
          }
        : null,
    waitlistEnabled: draft.waitlistEnabled,
    registrationHoldEnabled: draft.registrationHoldEnabled,
    registrationHoldMinutes: draft.registrationHoldMinutes,
    inviteConfirmEnabled: draft.inviteConfirmEnabled,
    requireFormedPair: draft.requireFormedPair,
    cashPrizesEnabled: draft.cashPrizesEnabled,
    regulationsText: draft.regulationNotes.trim() || null,
    uniformRequired: draft.uniformRequired,
    uniformNumberOnShirt: draft.uniformRequired && draft.uniformNumberOnShirt,
    uniformNameOnShirt: draft.uniformRequired && draft.uniformNameOnShirt,
    rankingEnabled: draft.rankingEnabled,
    rankingTableId: draft.rankingEnabled ? draft.rankingTableId : null,
    keywords: generateKeywords([name, draft.locationName, draft.city, draft.description, ...draft.categories.map((c) => c.name)]),
    updatedAt: serverTimestamp(),
    ...(isUpdate ? {} : { createdAt: serverTimestamp() }),
  };
}

// ── fromFirestore (edição) — espelha os parses tolerantes do app ─────────────

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function ts(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

function parseSport(raw: unknown): TournamentSport {
  return raw === 'indoorVolleyball' || raw === 'footvolley' ? raw : 'beachVolleyball';
}

function parseGender(raw: unknown): CategoryGender {
  const v = str(raw).toLowerCase();
  if (v === 'female' || v === 'fem' || v === 'feminino') return 'female';
  if (v === 'mixed' || v === 'misto') return 'mixed';
  return 'male';
}

function parseDispute(raw: unknown, teamSize: number | null): CategoryDispute {
  if (raw === 'individual' || raw === 'team' || raw === 'trio' || raw === 'quarteto' || raw === 'quinteto') return raw;
  // Doc com teamSize mas sem disputeType conhecido (escrito por outra superfície).
  if (teamSize === 3) return 'trio';
  if (teamSize === 4) return 'quarteto';
  if (teamSize === 5) return 'quinteto';
  return 'dupla';
}

function parseAgeBand(raw: unknown): AgeBand {
  const bands: AgeBand[] = ['open', 'sub13', 'sub15', 'sub17', 'sub19', 'sub21', 'sub23', 'plus30', 'plus35', 'plus40', 'plus45', 'plus50', 'plus55', 'plus60'];
  return bands.includes(raw as AgeBand) ? (raw as AgeBand) : 'open';
}

function parseSkillLevel(raw: unknown): SkillLevel {
  const v = str(raw);
  const exact: SkillLevel[] = [
    'beginner',
    'intermediate',
    'open',
    'iniciante1',
    'iniciante2',
    'intermediario1',
    'intermediario2',
    'avancado1',
    'avancado2',
  ];
  if (exact.includes(v as SkillLevel)) return v as SkillLevel;
  const map: Record<string, SkillLevel> = {
    'iniciante': 'beginner',
    'intermediário': 'intermediate',
    'intermediario': 'intermediate',
    'iniciante 1': 'iniciante1',
    'iniciante 2': 'iniciante2',
    'intermediário 1': 'intermediario1',
    'intermediario 1': 'intermediario1',
    'intermediário 2': 'intermediario2',
    'intermediario 2': 'intermediario2',
    'avançado 1': 'avancado1',
    'avancado 1': 'avancado1',
    'avançado 2': 'avancado2',
    'avancado 2': 'avancado2',
  };
  return map[v.toLowerCase()] ?? 'open';
}

/** `minLevel` ausente/vazio (categoria antiga, sem piso) → `null`; caindo em `parseSkillLevel`
 *  pra aceitar código ou label, igual ao `level`. */
function parseMinSkillLevel(raw: unknown): SkillLevel | null {
  const v = str(raw);
  if (!v) return null;
  return parseSkillLevel(raw);
}

function parseBestOf(raw: unknown): TournamentBestOf {
  return raw === 'singleSet' || raw === 'bestOf5' ? raw : 'bestOf3';
}

function parsePrizes(raw: unknown): CategoryPrizeDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
    .map((map) => {
      const rawValue = map['value'];
      const valueReais = typeof rawValue === 'number' ? rawValue : Number(rawValue ?? 0) || 0;
      const valueCents = num(map['valueCents']) ?? Math.round(valueReais * 100);
      return { position: str(map['position']), valueCents, ...(map['label'] ? { label: str(map['label']) } : {}) };
    });
}

function ageRestrictionInt(raw: unknown, key: string): number | null {
  if (!raw || typeof raw !== 'object') return null;
  return num((raw as Record<string, unknown>)[key]);
}

function parseAgeReference(raw: unknown): AgeReference {
  const ref = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)['reference'] : null;
  return ref === 'yearEnd' || ref === 'registration' ? ref : 'tournamentStart';
}

export function categoryFromMap(map: Record<string, unknown>): TournamentCategoryDraft | null {
  const id = str(map['id']);
  if (!id) return null;
  const entryFeeCents = num(map['entryFeeCents']) ?? Math.round((num(map['entryFee']) ?? 0) * 100);
  const bracketRaw = str(map['bracketFormat']);
  const dispute = parseDispute(map['disputeType'] ?? map['dispute'], num(map['teamSize']));
  const teamSize = DISPUTE_TEAM_SIZE[dispute] ?? 2;
  const gender = parseGender(map['genderType'] ?? map['gender']);
  const genderFree = isTeamDispute(dispute) && str(map['genderMode']) === 'free';
  const compRaw = map['genderComposition'];
  const comp = compRaw && typeof compRaw === 'object' ? (compRaw as Record<string, unknown>) : null;
  // Composição gravada vence; sem ela, deriva do gênero (misto rebalanceia 50/50).
  const fallbackMen = gender === 'male' ? teamSize : gender === 'female' ? 0 : Math.max(1, Math.floor(teamSize / 2));
  const menCount = num(comp?.['men']) ?? fallbackMen;
  const womenCount = num(comp?.['women']) ?? teamSize - menCount;
  return {
    id,
    name: str(map['categoryName']) || str(map['name']),
    gender,
    dispute,
    genderFree,
    menCount,
    womenCount,
    ageBand: parseAgeBand(map['ageBand']),
    skillLevel: parseSkillLevel(map['level']),
    minSkillLevel: parseMinSkillLevel(map['minLevel']),
    ageReference: parseAgeReference(map['ageRestriction']),
    ageCustomEnabled: !!(map['ageRestriction'] && typeof map['ageRestriction'] === 'object' && (map['ageRestriction'] as Record<string, unknown>)['custom'] === true),
    ageMinYears: ageRestrictionInt(map['ageRestriction'], 'minAge'),
    ageMaxYears: ageRestrictionInt(map['ageRestriction'], 'maxAge'),
    spots: num(map['maxTeams']) ?? num(map['spotsTotal']) ?? 16,
    useDefaultPrice: map['useDefaultPrice'] !== false,
    priceCents: entryFeeCents,
    bracketSystem: (bracketRaw ? bracketSystemFromRaw(bracketRaw) : null) ?? 'groupsThenKnockout',
    teamsPerGroup: num(map['teamsPerGroup']) ?? 4,
    qualifiersPerGroup: num(map['qualifiersPerGroup']) ?? 2,
    bestOf: parseBestOf(map['bestOf']),
    finalBestOf5: map['finalBestOf5'] !== false,
    maxRegistrationsPerAthlete: num(map['maxRegistrationsPerAthlete']) ?? 2,
    prizes: parsePrizes(map['prizes']),
  };
}

export interface TournamentDraftLoad {
  draft: TournamentCreateDraft;
  existingListingStatus: string | null;
}

export function tournamentDraftFromFirestore(data: Record<string, unknown>, id: string): TournamentDraftLoad {
  const categoriesRaw = data['categories'];
  const categories = Array.isArray(categoriesRaw)
    ? categoriesRaw
        .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
        .map(categoryFromMap)
        .filter((c): c is TournamentCategoryDraft => c != null)
    : [];

  const pix = (data['organizerPix'] ?? {}) as Record<string, unknown>;

  const draft: TournamentCreateDraft = {
    tournamentId: id,
    sport: parseSport(data['sport']),
    name: str(data['name']),
    coverImageUrl: str(data['coverUrl']) || str(data['imageUrl']) || null,
    description: str(data['description']),
    arenaId: str(data['arenaId']) || null,
    locationName: str(data['locationName']) || str(data['location']),
    locationAddress: str(data['locationAddress']),
    city: str(data['city']),
    state: str(data['state']),
    startAt: ts(data['startAt']),
    endAt: ts(data['endAt']),
    firstMatchAt: ts(data['firstMatchAt']),
    courtsCount: num(data['courtsCount']) ?? 4,
    categories,
    defaultPriceCents: num(data['defaultEntryFeeCents']) ?? 18000,
    registrationOpensAt: ts(data['registrationOpensAt']),
    registrationClosesAt: ts(data['registrationClosesAt']),
    paymentMode: (data['paymentMode'] === 'directWithOrganizer' ? 'directWithOrganizer' : 'appPixCard') as TournamentPaymentMode,
    organizerPixKey: str(pix['key']),
    organizerPixKeyType: str(pix['keyType']),
    organizerPixRecipientName: str(pix['recipientName']),
    organizerPixCity: str(pix['city']),
    waitlistEnabled: data['waitlistEnabled'] !== false,
    // Torneio sem os campos vale o padrão ligado de 30 min — mesma leitura da
    // Cloud Function, para o wizard não mostrar um prazo que o servidor ignora.
    registrationHoldEnabled: data['registrationHoldEnabled'] !== false,
    registrationHoldMinutes: num(data['registrationHoldMinutes']) ?? 30,
    inviteConfirmEnabled: data['inviteConfirmEnabled'] === true,
    requireFormedPair: data['requireFormedPair'] === true,
    cashPrizesEnabled: data['cashPrizesEnabled'] !== false,
    regulationNotes: str(data['regulationsText']),
    uniformRequired: data['uniformRequired'] !== false,
    uniformNumberOnShirt: data['uniformNumberOnShirt'] !== false,
    uniformNameOnShirt: data['uniformNameOnShirt'] !== false,
    rankingEnabled: data['rankingEnabled'] !== false,
    rankingTableId: str(data['rankingTableId']) || 'nexago_standalone',
    visibility: (data['visibility'] === 'linkOnly' ? 'linkOnly' : 'publicListing') as TournamentVisibility,
  };

  const listingStatus = str(data['listingStatus']) || str(data['status']) || null;
  return { draft, existingListingStatus: listingStatus };
}

// ── Persistência ──────────────────────────────────────────────────────────────

export async function loadTournamentDraft(tournamentId: string): Promise<TournamentDraftLoad | null> {
  const db = organizerFirestore();
  const snap = await getDoc(doc(db, 'tournaments', tournamentId));
  if (!snap.exists()) return null;
  return tournamentDraftFromFirestore(snap.data() as Record<string, unknown>, snap.id);
}

/** Capa do torneio — mesmo caminho/fluxo do app (`uploadCover` em
 *  `organizer_tournaments_repository.dart`): Storage `tournaments/{id}/cover.jpg`. As regras
 *  do Storage validam `managerId` no doc do Firestore, então o doc PRECISA existir antes do
 *  upload — por isso o upload roda depois da gravação, e o doc é atualizado com
 *  `coverUrl`/`imageUrl` (os dois campos, como o app grava). */
export async function uploadTournamentCover(tournamentId: string, file: Blob): Promise<string> {
  const storage = organizerStorage();
  const coverRef = ref(storage, `tournaments/${tournamentId}/cover.jpg`);
  await uploadBytes(coverRef, file, { contentType: file.type || 'image/jpeg' });
  return getDownloadURL(coverRef);
}

/** Cria (addDoc) ou atualiza (setDoc merge) o torneio; com `coverFile`, sobe a capa depois da
 *  gravação e atualiza `coverUrl`/`imageUrl` (fluxo idêntico ao `saveTournamentDraft` do app).
 *  Retorna o id. */
export async function publishTournamentDraft(params: {
  draft: TournamentCreateDraft;
  managerId: string;
  publish: boolean;
  existingListingStatus?: string | null;
  coverFile?: Blob | null;
}): Promise<string> {
  const db = organizerFirestore();
  const isUpdate = !!params.draft.tournamentId;
  const data = tournamentDraftToFirestore({
    draft: params.draft,
    managerId: params.managerId,
    publish: params.publish,
    isUpdate,
    existingListingStatus: params.existingListingStatus ?? null,
  });

  let tournamentId: string;
  if (isUpdate) {
    tournamentId = params.draft.tournamentId!;
    await setDoc(doc(db, 'tournaments', tournamentId), data, { merge: true });
  } else {
    const created = await addDoc(collection(db, 'tournaments'), data);
    tournamentId = created.id;
  }

  if (params.coverFile) {
    const coverUrl = await uploadTournamentCover(tournamentId, params.coverFile);
    await updateDoc(doc(db, 'tournaments', tournamentId), {
      coverUrl,
      imageUrl: coverUrl,
      updatedAt: serverTimestamp(),
    });
  }

  return tournamentId;
}
